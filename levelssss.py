import torch
import numpy as np
from PIL import Image
import json

class LevelsPanel:
    """
    色阶调整节点（带交互面板）
    - 节点类型名（前端识别）: "levelssss"
    - 在前端面板中会使用一个 JSON 字符串保存各通道的色阶参数，格式示例：
      {"RGB":{"in_black":0,"in_mid":1.0,"in_white":255,"out_black":0,"out_white":255}, "R":{...}, "G":{...}, "B":{...}}
    """

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "image": ("IMAGE",),
                "channel": ("STRING", {
                    "default": "RGB",
                    "choices": ["RGB", "R", "G", "B"]
                }),
                "levels_params": ("STRING", {
                    # 保存为 JSON 字符串（参见类注释）
                    "default": json.dumps({
                        # in_mid 改为输入中点（1-254），更接近 Photoshop 表示法（默认 128）
                        "RGB": {"in_black": 0, "in_mid": 128, "in_white": 255, "out_black": 0, "out_white": 255},
                        "R": {"in_black": 0, "in_mid": 128, "in_white": 255, "out_black": 0, "out_white": 255},
                        "G": {"in_black": 0, "in_mid": 128, "in_white": 255, "out_black": 0, "out_white": 255},
                        "B": {"in_black": 0, "in_mid": 128, "in_white": 255, "out_black": 0, "out_white": 255}
                    }),
                    "display": "hidden"
                }),
            }
        }

    RETURN_TYPES = ("IMAGE", "IMAGE")
    RETURN_NAMES = ("output_image", "preview_image")
    FUNCTION = "adjust_image"
    CATEGORY = "🔵BB image crop"

    def adjust_image(self, image, channel="RGB", levels_params=None):
        """
        应用色阶调整并返回 (output_tensor, preview_tensor)
        preview 为缩小后的实时预览
        """
        if levels_params is None:
            levels_params = {}
        # 转换到PIL
        if len(image.shape) == 4:
            pil_image = self.tensor_to_pil(image[0])
        else:
            pil_image = self.tensor_to_pil(image)

        # 解析参数，构建查找表
        try:
            params = json.loads(levels_params) if isinstance(levels_params, str) else (levels_params or {})
        except Exception:
            params = {}

        lut_r, lut_g, lut_b = self.build_luts_from_params(params, channel)

        result = self.apply_luts(pil_image, lut_r, lut_g, lut_b)

        # 生成预览图（缩小）
        preview = result.copy()
        preview.thumbnail((min(512, preview.width), min(512, preview.height)), Image.Resampling.LANCZOS)

        out_tensor = self.pil_to_tensor(result)
        preview_tensor = self.pil_to_tensor(preview)

        return (out_tensor, preview_tensor)

    def build_luts_from_params(self, params, channel):
        """
        根据 levels 参数（JSON 结构或缺省）为每个通道生成 256 长度的 LUT（uint8）
        Photoshop 风格处理顺序（简化）：先对单通道(in/out/gamma)处理，再在需要时使用 RGB 复合（这里保持与单通道一致的接口）
        params: dict，包含 "RGB","R","G","B" 的子字典
        """
        def get_chan_param(ch):
            # in_mid treated as midpoint input (1..254), default 128
            default = {"in_black":0,"in_mid":128,"in_white":255,"out_black":0,"out_white":255}
            try:
                return { **default, **(params.get(ch, {}) if isinstance(params, dict) else {}) }
            except Exception:
                return default

        # 对指定通道构建 LUT
        def make_lut(p):
            ib = float(p.get("in_black", 0))
            im = float(p.get("in_mid", 1.0))
            iw = float(p.get("in_white", 255))
            ob = float(p.get("out_black", 0))
            ow = float(p.get("out_white", 255))

            # 防止除零
            denom = iw - ib
            if denom == 0:
                denom = 1.0

            # 使用 Photoshop 风格的中点->gamma 映射：
            # in_mid 被视为输入取值（介于 ib+1 与 iw-1 之间）应映射为 0.5 输出。
            # 计算 gamma 使得 ( (mid - ib)/(iw-ib) )**gamma = 0.5
            try:
                mid = max(ib + 1.0, min(iw - 1.0, im))
                mid_norm = (mid - ib) / denom
                if mid_norm > 0.0 and mid_norm < 1.0:
                    gamma = float(np.log(0.5) / np.log(mid_norm))
                else:
                    gamma = 1.0
            except Exception:
                gamma = 1.0

            lut = np.zeros(256, dtype=np.uint8)
            for v in range(256):
                normalized = (v - ib) / denom
                if not np.isfinite(normalized):
                    normalized = 0.0
                normalized = float(max(0.0, min(1.0, normalized)))
                mapped = float(np.power(normalized, gamma)) if normalized > 0 else 0.0
                outv = ob + mapped * (ow - ob)
                outv = int(round(max(0, min(255, outv))))
                lut[v] = np.uint8(outv)
            return lut

        # 若 params 中包含 JSON 风格的多通道配置，优先使用对应通道
        lut_rgb = make_lut(get_chan_param("RGB"))
        lut_r = make_lut(get_chan_param("R"))
        lut_g = make_lut(get_chan_param("G"))
        lut_b = make_lut(get_chan_param("B"))

        # 统一采用“先应用 RGB 整体调整，再应用单通道调整”的管线，确保前后端预览/输出一致
        combined_lut_r = np.zeros(256, dtype=np.uint8)
        combined_lut_g = np.zeros(256, dtype=np.uint8)
        combined_lut_b = np.zeros(256, dtype=np.uint8)
        for i in range(256):
            # 先通过 RGB LUT 映射，再对结果应用对应的单通道 LUT（即 lut_chan(lut_rgb[i])）
            v_rgb = lut_rgb[i]
            combined_lut_r[i] = lut_r[v_rgb]
            combined_lut_g[i] = lut_g[v_rgb]
            combined_lut_b[i] = lut_b[v_rgb]
        return combined_lut_r, combined_lut_g, combined_lut_b

    def apply_luts(self, pil_image, lut_r, lut_g, lut_b):
        """
        使用 PIL point 映射应用 LUTs
        """
        if pil_image.mode != "RGB":
            img = pil_image.convert("RGB")
        else:
            img = pil_image

        r, g, b = img.split()
        r = r.point(list(lut_r))
        g = g.point(list(lut_g))
        b = b.point(list(lut_b))
        return Image.merge("RGB", (r, g, b))

    def tensor_to_pil(self, tensor):
        """与项目中其他节点保持一致的 tensor -> PIL 转换"""
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
        """与项目中其他节点保持一致的 PIL -> tensor 转换"""
        if pil_image.mode != 'RGB':
            pil_image = pil_image.convert('RGB')
        numpy_image = np.array(pil_image).astype(np.float32)
        numpy_image = numpy_image / 255.0
        tensor = torch.from_numpy(numpy_image)
        tensor = tensor.unsqueeze(0)
        return tensor


# 节点映射（前端 nodeData.name 可能为 "levelssss"，因此映射用该键）
NODE_CLASS_MAPPINGS = {
    "levelssss": LevelsPanel,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "levelssss": "🔵BB色阶调整（交互）",
}


