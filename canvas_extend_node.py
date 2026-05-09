import torch
import numpy as np
from PIL import Image, ImageDraw
import json

class CanvasExtendNode:
    """
    画布扩展编辑器节点
    支持拖拽裁剪框扩展图像边界
    """

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "image": ("IMAGE",),
                "extend_data": ("STRING", {
                    "default": "",
                    "multiline": False,
                    "display": "hidden"
                }),
                "fill_color": ("STRING", {
                    "default": "#ffffff",
                    "display": "hidden"
                }),
            }
        }

    RETURN_TYPES = ("IMAGE", "MASK", "STRING")
    RETURN_NAMES = ("output_image", "mask", "extend_data")
    FUNCTION = "process_canvas"
    CATEGORY = "🔵BB image crop"

    def process_canvas(self, image, extend_data, fill_color):
        """处理画布扩展"""
        # 转换tensor到PIL图像
        if len(image.shape) == 4:
            pil_image = self.tensor_to_pil(image[0])
        else:
            pil_image = self.tensor_to_pil(image)

        original_width, original_height = pil_image.size

        # 解析扩展数据
        if extend_data and extend_data.strip():
            try:
                data = json.loads(extend_data)
            except:
                data = {}
        else:
            data = {}

        # 获取扩展参数
        left = float(data.get('left', 0))
        right = float(data.get('right', 0))
        top = float(data.get('top', 0))
        bottom = float(data.get('bottom', 0))

        # 计算输出尺寸：原图 + 扩展区域
        output_width = max(1, int(round(original_width + left + right)))
        output_height = max(1, int(round(original_height + top + bottom)))

        # 原图在输出中的位置
        dst_x = int(round(left))
        dst_y = int(round(top))

        # 从原图中裁切可见区域
        src_left = max(0, -left)
        src_top = max(0, -top)
        src_right = min(original_width, original_width + right)
        src_bottom = min(original_height, original_height + bottom)
        src_width = src_right - src_left
        src_height = src_bottom - src_top

        # 创建输出画布
        if fill_color and fill_color != 'transparent':
            fill_rgb = self.hex_to_rgb(fill_color)
            output_image = Image.new('RGB', (output_width, output_height), fill_rgb)
        else:
            output_image = Image.new('RGB', (output_width, output_height), (0, 0, 0))

        # 粘贴原图（如果有可见部分）
        if src_width > 0 and src_height > 0:
            cropped_src = pil_image.crop((int(src_left), int(src_top), int(src_right), int(src_bottom)))
            paste_x = int(round(dst_x + src_left))
            paste_y = int(round(dst_y + src_top))
            output_image.paste(cropped_src, (paste_x, paste_y))

        # 生成掩码
        mask_image = self.generate_mask(output_width, output_height, left, right, top, bottom)

        # 转换回tensor
        result_tensor = self.pil_to_tensor(output_image)
        mask_tensor = self.pil_to_mask_tensor(mask_image)

        return (result_tensor, mask_tensor, extend_data)

    def generate_mask(self, width, height, left, right, top, bottom):
        """生成掩码图像"""
        mask = Image.new('L', (width, height), 0)
        draw = ImageDraw.Draw(mask)

        # 填充扩展区域（裁切框内原图之外的区域为白色）
        if top > 0:
            draw.rectangle([0, 0, width, int(round(top))], fill=255)

        if bottom > 0:
            bottom_y = height - int(round(bottom))
            draw.rectangle([0, bottom_y, width, height], fill=255)

        if left > 0:
            draw.rectangle([0, 0, int(round(left)), height], fill=255)

        if right > 0:
            right_x = width - int(round(right))
            draw.rectangle([right_x, 0, width, height], fill=255)

        return mask

    def hex_to_rgb(self, hex_color):
        """将hex颜色转换为RGB元组"""
        if isinstance(hex_color, tuple):
            return hex_color
        hex_color = hex_color.lstrip('#')
        return tuple(int(hex_color[i:i+2], 16) for i in (0, 2, 4))

    def tensor_to_pil(self, tensor):
        """将tensor转换为PIL图像"""
        if len(tensor.shape) == 3:
            if tensor.shape[0] == 3 or tensor.shape[0] == 1:
                tensor = tensor.permute(1, 2, 0)

        tensor = torch.clamp(tensor, 0, 1)
        numpy_image = tensor.cpu().numpy()
        numpy_image = (numpy_image * 255).astype(np.uint8)

        if len(numpy_image.shape) == 2:
            pil_image = Image.fromarray(numpy_image, mode='L').convert('RGB')
        elif numpy_image.shape[2] == 1:
            pil_image = Image.fromarray(numpy_image.squeeze(), mode='L').convert('RGB')
        else:
            pil_image = Image.fromarray(numpy_image, mode='RGB')

        return pil_image

    def pil_to_tensor(self, pil_image):
        """将PIL图像转换为tensor"""
        if pil_image.mode != 'RGB':
            pil_image = pil_image.convert('RGB')

        numpy_image = np.array(pil_image).astype(np.float32)
        numpy_image = numpy_image / 255.0
        tensor = torch.from_numpy(numpy_image)
        tensor = tensor.unsqueeze(0)

        return tensor

    def pil_to_mask_tensor(self, pil_image):
        """将PIL掩码图像转换为tensor"""
        if pil_image.mode != 'L':
            pil_image = pil_image.convert('L')

        numpy_image = np.array(pil_image).astype(np.float32)
        numpy_image = numpy_image / 255.0
        tensor = torch.from_numpy(numpy_image)
        tensor = tensor.unsqueeze(0)  # [1, H, W]

        return tensor


NODE_CLASS_MAPPINGS = {
    "CanvasExtendNode": CanvasExtendNode,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "CanvasExtendNode": "🔵BB交互式裁剪可扩展画布",
}
