"""
ComfyUI EasyBrush Node
A node that embeds the EasyBrush painting application
"""

import numpy as np
import base64
import json
import re
from PIL import Image
import io
import torch


# Module-level cache
_cache = {}


class EasyBrushNode:
    """
    EasyBrush Node
    Embeds an interactive painting widget that can be used for mask creation
    """

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "brush_size": ("INT", {
                    "default": 20,
                    "min": 1,
                    "max": 500,
                    "step": 1,
                    "display": "slider"
                }),
                "brush_hardness": ("INT", {
                    "default": 100,
                    "min": 0,
                    "max": 100,
                    "step": 1,
                    "display": "slider"
                }),
                "brush_opacity": ("INT", {
                    "default": 100,
                    "min": 1,
                    "max": 100,
                    "step": 1,
                    "display": "slider"
                }),
            },
            "optional": {
                "input_image": ("IMAGE",),
                "drawn_image_data": ("STRING", {"default": ""}),
                "doodle_mask_data": ("STRING", {"default": ""}),
            },
        }

    RETURN_TYPES = ("IMAGE", "MASK", "STRING", "STRING")
    RETURN_NAMES = ("image", "mask", "brush_settings", "status")
    FUNCTION = "process"
    CATEGORY = "🔵BB image crop"

    def process(self, brush_size, brush_hardness, brush_opacity, input_image=None, drawn_image_data="", doodle_mask_data="", unique_id=None):
        """处理输入图像和绘制数据，合成输出图像"""
        # 从 extra_data 中获取绘制数据
        if drawn_image_data is None:
            drawn_image_data = ""
        if doodle_mask_data is None:
            doodle_mask_data = ""

        brush_settings = f"size:{brush_size}|hardness:{brush_hardness}|opacity:{brush_opacity}"

        # 处理输入图像
        if input_image is not None:
            # Convert input to torch tensor (ComfyUI uses torch tensors)
            if isinstance(input_image, torch.Tensor):
                img_tensor = input_image.clone()
            elif isinstance(input_image, np.ndarray):
                img_tensor = torch.from_numpy(input_image.astype(np.float32))
            elif hasattr(input_image, 'cpu') and hasattr(input_image, 'numpy'):
                img_tensor = input_image.cpu().clone()
            else:
                img_array = np.array(input_image)
                img_tensor = torch.from_numpy(img_array.astype(np.float32))

            # Handle (B, C, H, W) format -> convert to (B, H, W, C)
            if img_tensor.ndim == 4 and img_tensor.shape[1] <= 4:
                img_tensor = img_tensor.permute(0, 2, 3, 1)

            # Ensure 3 channels, normalized [0, 1]
            if img_tensor.shape[-1] == 4:
                img_tensor = img_tensor[:, :, :, :3]
            elif img_tensor.shape[-1] == 1:
                img_tensor = img_tensor.repeat(1, 1, 1, 3)

            # Normalize to [0, 1]
            if img_tensor.max() > 1.0:
                img_tensor = img_tensor / 255.0

            # Ensure float32
            img_tensor = img_tensor.float()
        else:
            # No input image, generate placeholder
            img_tensor = torch.zeros((1, 512, 512, 3), dtype=torch.float32)

        # 解析绘制数据并合成图像
        composed_tensor = self._compose_image(img_tensor, drawn_image_data)

        # Create mask tensor from doodle mask data (白色涂鸦在黑色背景上)
        mask_base64 = self._parse_doodle_data(doodle_mask_data)
        mask_tensor = self._create_mask_from_grayscale(mask_base64, (composed_tensor.shape[2], composed_tensor.shape[1]))

        # Final safety check - ensure outputs are torch tensors
        if not isinstance(composed_tensor, torch.Tensor):
            raise TypeError(f"IMAGE output must be torch.Tensor, got {type(composed_tensor)}")
        if not isinstance(mask_tensor, torch.Tensor):
            raise TypeError(f"MASK output must be torch.Tensor, got {type(mask_tensor)}")

        return (composed_tensor, mask_tensor, brush_settings, "ready")

    def _compose_image(self, img_tensor, drawn_data):
        """将绘制数据与原图合成"""
        if not drawn_data or drawn_data == "":
            return img_tensor

        try:
            # 解析 base64 数据
            if drawn_data.startswith('data:image'):
                match = re.search(r'base64,(.+)', drawn_data)
                if match:
                    drawn_base64 = match.group(1)
                else:
                    return img_tensor
            else:
                drawn_base64 = drawn_data

            # 解码绘制图像
            drawn_bytes = base64.b64decode(drawn_base64)
            drawn_image = Image.open(io.BytesIO(drawn_bytes)).convert('RGBA')

            # 获取原图尺寸
            h, w = img_tensor.shape[1], img_tensor.shape[2]

            # 如果尺寸不同，调整绘制图像大小
            if drawn_image.size != (w, h):
                drawn_image = drawn_image.resize((w, h), Image.LANCZOS)

            # 将绘制图像合成到原图上
            # img_tensor: (1, H, W, C) normalized [0, 1]
            # drawn_image: RGBA

            # 转换为 numpy 处理
            img_np = img_tensor[0].cpu().numpy()  # (H, W, C), normalized

            # 确保绘制图像是 RGBA 格式
            drawn_np = np.array(drawn_image)  # (H, W, 4)

            # 扩展原图为 RGBA
            if img_np.shape[-1] == 3:
                img_rgba = np.concatenate([img_np, np.ones((h, w, 1), dtype=np.float32)], axis=-1)
            else:
                img_rgba = img_np[:, :, :4]

            # Alpha 合成
            drawn_alpha = drawn_np[:, :, 3:4].astype(np.float32) / 255.0
            drawn_rgb = drawn_np[:, :, :3].astype(np.float32) / 255.0

            # 合成: result = drawn * alpha + original * (1 - alpha)
            composed = drawn_rgb * drawn_alpha + img_rgba[:, :, :3] * (1 - drawn_alpha)

            # 转换回 tensor 格式 (1, H, W, C)
            composed_tensor = torch.from_numpy(composed).unsqueeze(0).float()

            print(f"[EasyBrush] Image composed successfully, shape: {composed_tensor.shape}")
            return composed_tensor

        except Exception as e:
            print(f"[EasyBrush] Error composing image: {e}")
            return img_tensor

    def _parse_doodle_data(self, data_str):
        """Parse doodle data from frontend - 提取带透明度的图像数据用于生成mask"""
        if not data_str or data_str == "":
            return None
        if data_str.startswith('data:image'):
            match = re.search(r'base64,(.+)', data_str)
            if match:
                return match.group(1)
        return None

    def _create_mask_from_grayscale(self, mask_base64, size):
        """Create mask tensor from grayscale image (white doodle on black background)"""
        mask_tensor = torch.zeros((1, size[1], size[0]), dtype=torch.float32)

        if mask_base64 is None or mask_base64 == "":
            return mask_tensor

        try:
            mask_bytes = base64.b64decode(mask_base64)
            mask_image = Image.open(io.BytesIO(mask_bytes)).convert('L')  # 转为灰度图

            if mask_image.size != size:
                mask_image = mask_image.resize(size, Image.LANCZOS)

            mask_pixels = mask_image.load()

            for y in range(size[1]):
                for x in range(size[0]):
                    pixel_value = mask_pixels[x, y]
                    # 白色(>128)区域设为1.0，黑色区域为0.0
                    if pixel_value > 128:
                        mask_tensor[0, y, x] = 1.0

            return mask_tensor
        except Exception:
            return mask_tensor

    def _create_mask_tensor(self, doodle_base64, size):
        """Create mask tensor from RGBA image (alpha channel)"""
        mask_tensor = torch.zeros((1, size[1], size[0]), dtype=torch.float32)

        if doodle_base64 is None:
            return mask_tensor

        try:
            doodle_bytes = base64.b64decode(doodle_base64)
            doodle_image = Image.open(io.BytesIO(doodle_bytes)).convert('RGBA')

            if doodle_image.size != size:
                doodle_image = doodle_image.resize(size, Image.LANCZOS)

            doodle_pixels = doodle_image.load()

            for y in range(size[1]):
                for x in range(size[0]):
                    r, g, b, a = doodle_pixels[x, y]
                    if a > 128:
                        mask_tensor[0, y, x] = 1.0

            return mask_tensor
        except Exception:
            return mask_tensor

    @classmethod
    def IS_CHANGED(cls, brush_size, brush_hardness, brush_opacity, input_image=None, drawn_image_data="", doodle_mask_data="", unique_id=None):
        # 使用数据长度而非 hash，避免处理大型 base64 字符串
        data_len = len(drawn_image_data) if drawn_image_data else 0
        mask_len = len(doodle_mask_data) if doodle_mask_data else 0
        return f"{brush_size}_{brush_hardness}_{brush_opacity}_{data_len}_{mask_len}"


NODE_CLASS_MAPPINGS = {
    "EasyBrushNode": EasyBrushNode,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "EasyBrushNode": "🎨 EasyBrush 画笔工具",
}
