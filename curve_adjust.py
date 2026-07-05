import torch
import numpy as np
from PIL import Image
import json

class CurvePanel:
    """
    曲线调整节点（带交互面板）
    支持在节点面板中交互编辑曲线（控制点拖拽/添加/删除），并将曲线参数同步到节点参数。
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
                "curve_points": ("STRING", {
                    # 格式: "x0,y0;x1,y1;...;xn,yn" (0-255整数)
                    "default": "0,0;64,64;128,128;192,192;255,255",
                    "display": "hidden"
                }),
            }
        }

    RETURN_TYPES = ("IMAGE", "IMAGE")
    RETURN_NAMES = ("output_image", "preview_image")
    FUNCTION = "adjust_image"
    CATEGORY = "🔵BB image crop"

    def adjust_image(self, image, channel="RGB", curve_points="0,0;64,64;128,128;192,192;255,255"):
        """
        应用曲线调整并返回结果与预览（预览为应用曲线后的缩小图）
        """
        # 转换到PIL
        if len(image.shape) == 4:
            pil_image = self.tensor_to_pil(image[0])
        else:
            pil_image = self.tensor_to_pil(image)

        # 解析曲线参数并生成映射表
        lut_r, lut_g, lut_b = self.build_luts_from_points(curve_points, channel)

        # 应用查找表
        result = self.apply_luts(pil_image, lut_r, lut_g, lut_b)

        # 生成预览图（缩小）
        preview = result.copy()
        preview.thumbnail((min(512, preview.width), min(512, preview.height)), Image.Resampling.LANCZOS)

        # 转换回tensor
        out_tensor = self.pil_to_tensor(result)
        preview_tensor = self.pil_to_tensor(preview)

        return (out_tensor, preview_tensor)

    def build_luts_from_points(self, points_str, channel):
        """
        将点串解析为三通道的查找表（0-255）
        支持单通道或RGB整体调整
        """
        # 支持两种格式：
        # 1) 传统单通道字符串 "x0,y0;x1,y1;..."
        # 2) JSON 字符串 {"RGB":"...","R":"...","G":"...","B":"..."} 表示每个通道的点串
        def parse_points_list(s):
            pts = []
            try:
                for part in s.split(';'):
                    ss = part.strip()
                    if not ss:
                        continue
                    x_str, y_str = ss.split(',')
                    x = int(float(x_str))
                    y = int(float(y_str))
                    x = max(0, min(255, x))
                    y = max(0, min(255, y))
                    pts.append((x, y))
            except Exception:
                pts = [(0, 0), (255, 255)]
            if pts[0][0] != 0:
                pts.insert(0, (0, 0))
            if pts[-1][0] != 255:
                pts.append((255, 255))
            xs = np.array([p[0] for p in pts], dtype=np.float64)
            ys = np.array([p[1] for p in pts], dtype=np.float64)
            return xs, ys

        # 使用自然三次样条进行平滑插值（比线性更接近 Photoshop 曲线）
        def natural_cubic_spline_interpolate(xs, ys, xq):
            """
            基于 Numerical Recipes 的自然三次样条实现。
            xs, ys: 已排序的节点，xq: 查询点数组
            返回对应的插值结果（float array）
            """
            n = len(xs)
            if n < 2:
                return np.zeros_like(xq, dtype=np.float64)

            # 计算二阶导数 y2
            y2 = np.zeros(n, dtype=np.float64)
            u = np.zeros(n-1, dtype=np.float64)
            y2[0] = 0.0
            u[0] = 0.0
            for i in range(1, n-1):
                sig = (xs[i] - xs[i-1]) / (xs[i+1] - xs[i-1])
                p = sig * y2[i-1] + 2.0
                if p == 0:
                    y2[i] = 0.0
                    u[i] = 0.0
                else:
                    y2[i] = (sig - 1.0) / p
                    denom = (xs[i+1] - xs[i-1])
                    if denom == 0:
                        u[i] = 0.0
                    else:
                        u[i] = (6.0 * ((ys[i+1]-ys[i])/(xs[i+1]-xs[i]) - (ys[i]-ys[i-1])/(xs[i]-xs[i-1])) / denom - sig * u[i-1]) / p
            y2[-1] = 0.0
            for k in range(n-2, -1, -1):
                y2[k] = y2[k] * y2[k+1] + u[k]

            # 查询插值
            xq = np.asarray(xq, dtype=np.float64)
            out = np.zeros_like(xq, dtype=np.float64)
            for idx, xval in enumerate(xq):
                # 边界处理
                if xval <= xs[0]:
                    out[idx] = ys[0]
                    continue
                if xval >= xs[-1]:
                    out[idx] = ys[-1]
                    continue
                # 找到间隔 klo,khi
                klo = np.searchsorted(xs, xval) - 1
                khi = klo + 1
                h = xs[khi] - xs[klo]
                if h == 0:
                    out[idx] = ys[klo]
                    continue
                a = (xs[khi] - xval) / h
                b = (xval - xs[klo]) / h
                out[idx] = a * ys[klo] + b * ys[khi] + ((a**3 - a) * y2[klo] + (b**3 - b) * y2[khi]) * (h*h) / 6.0
            return out

        # 若 points_str 为 JSON，则按 Photoshop 逻辑组合：先单通道（R/G/B）再应用 RGB 复合曲线
        try:
            if isinstance(points_str, str) and points_str.strip().startswith('{'):
                data = json.loads(points_str)
                # 准备每通道的 LUT（优先使用提供的通道点，否则使用单位映射）
                def make_lut_from_str(s):
                    if not s:
                        return np.arange(256, dtype=np.uint8)
                    xs, ys = parse_points_list(s)
                    interp_y = natural_cubic_spline_interpolate(xs, ys, np.arange(256, dtype=np.float64))
                    return np.clip(np.round(interp_y), 0, 255).astype(np.uint8)

                lut_r_chan = make_lut_from_str(data.get('R', ''))
                lut_g_chan = make_lut_from_str(data.get('G', ''))
                lut_b_chan = make_lut_from_str(data.get('B', ''))
                lut_rgb = make_lut_from_str(data.get('RGB', ''))

                # 先应用通道 LUT，再应用 RGB 复合 LUT
                final_r = lut_rgb[lut_r_chan]
                final_g = lut_rgb[lut_g_chan]
                final_b = lut_rgb[lut_b_chan]
                return final_r, final_g, final_b
        except Exception:
            # 如果 JSON 解析失败，回退到原有单通道解析逻辑
            pass

        def natural_cubic_spline_interpolate(xs, ys, xq):
            """
            基于 Numerical Recipes 的自然三次样条实现。
            xs, ys: 已排序的节点，xq: 查询点数组
            返回对应的插值结果（float array）
            """
            n = len(xs)
            if n < 2:
                return np.zeros_like(xq, dtype=np.float64)

            # 计算二阶导数 y2
            y2 = np.zeros(n, dtype=np.float64)
            u = np.zeros(n-1, dtype=np.float64)
            y2[0] = 0.0
            u[0] = 0.0
            for i in range(1, n-1):
                sig = (xs[i] - xs[i-1]) / (xs[i+1] - xs[i-1])
                p = sig * y2[i-1] + 2.0
                if p == 0:
                    y2[i] = 0.0
                    u[i] = 0.0
                else:
                    y2[i] = (sig - 1.0) / p
                    denom = (xs[i+1] - xs[i-1])
                    if denom == 0:
                        u[i] = 0.0
                    else:
                        u[i] = (6.0 * ((ys[i+1]-ys[i])/(xs[i+1]-xs[i]) - (ys[i]-ys[i-1])/(xs[i]-xs[i-1])) / denom - sig * u[i-1]) / p
            y2[-1] = 0.0
            for k in range(n-2, -1, -1):
                y2[k] = y2[k] * y2[k+1] + u[k]

            # 查询插值
            xq = np.asarray(xq, dtype=np.float64)
            out = np.zeros_like(xq, dtype=np.float64)
            for idx, xval in enumerate(xq):
                # 边界处理
                if xval <= xs[0]:
                    out[idx] = ys[0]
                    continue
                if xval >= xs[-1]:
                    out[idx] = ys[-1]
                    continue
                # 找到间隔 klo,khi
                klo = np.searchsorted(xs, xval) - 1
                khi = klo + 1
                h = xs[khi] - xs[klo]
                if h == 0:
                    out[idx] = ys[klo]
                    continue
                a = (xs[khi] - xval) / h
                b = (xval - xs[klo]) / h
                out[idx] = a * ys[klo] + b * ys[khi] + ((a**3 - a) * y2[klo] + (b**3 - b) * y2[khi]) * (h*h) / 6.0
            return out

        full_x = np.arange(256, dtype=np.float64)
        interp_y = natural_cubic_spline_interpolate(xs, ys, full_x)
        interp_y = np.clip(np.round(interp_y), 0, 255).astype(np.uint8)

        if channel == "RGB":
            return interp_y, interp_y, interp_y
        elif channel == "R":
            return interp_y, np.arange(256, dtype=np.uint8), np.arange(256, dtype=np.uint8)
        elif channel == "G":
            return np.arange(256, dtype=np.uint8), interp_y, np.arange(256, dtype=np.uint8)
        else:  # "B"
            return np.arange(256, dtype=np.uint8), np.arange(256, dtype=np.uint8), interp_y

    def apply_luts(self, pil_image, lut_r, lut_g, lut_b):
        """
        使用PIL的point映射应用三通道查找表
        """
        if pil_image.mode != "RGB":
            img = pil_image.convert("RGB")
        else:
            img = pil_image

        # 分离通道
        r, g, b = img.split()

        r = r.point(list(lut_r))
        g = g.point(list(lut_g))
        b = b.point(list(lut_b))

        return Image.merge("RGB", (r, g, b))

    def tensor_to_pil(self, tensor):
        """将tensor转换为PIL图像（复用之前实现风格）"""
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
        """将PIL图像转换为tensor（与其他节点一致的输出格式）"""
        if pil_image.mode != 'RGB':
            pil_image = pil_image.convert('RGB')

        numpy_image = np.array(pil_image).astype(np.float32)
        numpy_image = numpy_image / 255.0
        tensor = torch.from_numpy(numpy_image)
        tensor = tensor.unsqueeze(0)
        return tensor


# 节点映射
NODE_CLASS_MAPPINGS = {
    "CurvePanel": CurvePanel,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "CurvePanel": "🔵BB曲线调整（交互）",
}


