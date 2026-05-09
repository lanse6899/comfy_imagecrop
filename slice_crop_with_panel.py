import math
import torch
import numpy as np
from PIL import Image, ImageDraw

"""
SliceCropWithPanel
支持两种切片模式：
- 按像素切片（指定每片的宽/高，图片从左上开始依次铺满）
- 按数量切片（指定横向/纵向切片数量，均分）

输出：
- batch_images: 一个含有 N 个切片的 IMAGE Tensor（shape [N, H, W, C]）
- preview_image: 在原图上绘制切片网格与编号的预览图
"""

class SliceCropWithPanel:
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "image": ("IMAGE",),
                "split_mode": (["按像素切片", "按数量切片"], {
                    "default": "按像素切片"
                }),
                "pixel_width": ("INT", {
                    "default": 500,
                    "min": 1,
                    "max": 8192,
                    "step": 1,
                    "display": "hidden"
                }),
                "pixel_height": ("INT", {
                    "default": 216,
                    "min": 1,
                    "max": 8192,
                    "step": 1,
                    "display": "hidden"
                }),
                "count_x": ("INT", {
                    "default": 5,
                    "min": 1,
                    "max": 100,
                    "step": 1,
                    "display": "hidden"
                }),
                "count_y": ("INT", {
                    "default": 2,
                    "min": 1,
                    "max": 100,
                    "step": 1,
                    "display": "hidden"
                }),
                "preview_scale": ("FLOAT", {
                    "default": 1.0,
                    "min": 0.1,
                    "max": 4.0,
                    "step": 0.01,
                    "display": "hidden"
                })
            }
        }

    RETURN_TYPES = ("IMAGE", "IMAGE")
    RETURN_NAMES = ("batch_images", "preview_image")
    FUNCTION = "slice_image"
    CATEGORY = "🔵BB image crop"

    def slice_image(self, image, split_mode="按像素切片", pixel_width=500, pixel_height=216, count_x=5, count_y=2, preview_scale=1.0):
        """
        根据选择的切片模式生成切片批次和预览
        """
        # 转为 PIL
        if len(image.shape) == 4:
            pil_image = self.tensor_to_pil(image[0])
        else:
            pil_image = self.tensor_to_pil(image)

        img_w, img_h = pil_image.size

        # 计算切片网格 (list of (sx, sy, w, h))
        if split_mode == "按像素切片":
            slice_w = max(1, int(pixel_width))
            slice_h = max(1, int(pixel_height))
            grid = []
            y = 0
            while y < img_h:
                x = 0
                # always use fixed slice_w/slice_h and rely on perform_crop_fixed to pad edges
                while x < img_w:
                    grid.append((x, y, slice_w, slice_h))
                    x += slice_w
                y += slice_h
        else:
            # 均分为 count_x * count_y 个切片
            cx = max(1, int(count_x))
            cy = max(1, int(count_y))
            # 计算均匀的单元尺寸（向上取整），超出图像的部分将被填充
            tile_w = math.ceil(img_w / cx)
            tile_h = math.ceil(img_h / cy)
            grid = []
            for iy in range(cy):
                sy = iy * tile_h
                for ix in range(cx):
                    sx = ix * tile_w
                    grid.append((sx, sy, tile_w, tile_h))

        # 生成切片 PIL 图像并转换为 tensor 列表
        tensors = []
        for (sx, sy, w, h) in grid:
            part = self.perform_crop_fixed(pil_image, sx, sy, w, h)
            t = self.pil_to_tensor(part)  # shape [1, H, W, C]
            tensors.append(t)

        if len(tensors) == 0:
            # 返回空张量（1x1黑图）以防止下游出错
            empty = Image.new('RGB', (1, 1), (0, 0, 0))
            batch = self.pil_to_tensor(empty)
        else:
            batch = torch.cat(tensors, dim=0)  # shape [N, H, W, C]

        # 生成带网格的预览图
        preview = self.create_grid_preview(pil_image, grid, preview_scale=preview_scale)
        preview_tensor = self.pil_to_tensor(preview)

        return (batch, preview_tensor)

    def perform_crop_fixed(self, image, start_x, start_y, crop_width, crop_height):
        """
        从 (start_x, start_y) 处裁剪固定尺寸 crop_width x crop_height（不做额外填充）。
        如果裁剪区域超出原图边界，则按实际可见区域裁剪并生成对应尺寸的黑色背景图进行填充（与其他节点行为一致）
        """
        img_w, img_h = image.size
        result = Image.new('RGB', (crop_width, crop_height), (0, 0, 0))

        # 计算实际可见区域
        crop_from_x = max(0, start_x)
        crop_from_y = max(0, start_y)
        crop_to_x = min(img_w, start_x + crop_width)
        crop_to_y = min(img_h, start_y + crop_height)

        if crop_to_x > crop_from_x and crop_to_y > crop_from_y:
            cropped_part = image.crop((crop_from_x, crop_from_y, crop_to_x, crop_to_y))
            paste_x = max(0, -start_x)
            paste_y = max(0, -start_y)
            result.paste(cropped_part, (paste_x, paste_y))

        return result

    def create_grid_preview(self, image, grid, preview_scale=1.0):
        """
        在原图上绘制蓝色网格线和编号（左上为1），并返回 preview image。
        preview_scale 可以缩放用于在面板中预览。
        """
        preview = image.copy()
        draw = ImageDraw.Draw(preview)

        # 绘制网格线（蓝色）
        for idx, (sx, sy, w, h) in enumerate(grid, start=1):
            # 垂直线与水平线（以边界为准）
            x0 = sx
            y0 = sy
            x1 = sx + w
            y1 = sy + h
            # 线宽随图像大小自适应
            line_w = max(1, min(preview.width, preview.height) // 400)
            # 垂直边
            draw.line([(x0, y0), (x0, y1)], fill=(0, 120, 255), width=line_w)
            draw.line([(x1, y0), (x1, y1)], fill=(0, 120, 255), width=line_w)
            # 水平边
            draw.line([(x0, y0), (x1, y0)], fill=(0, 120, 255), width=line_w)
            draw.line([(x0, y1), (x1, y1)], fill=(0, 120, 255), width=line_w)

            # 编号框（左上角）与编号文本
            label_box_w = max(20, min(preview.width, preview.height) // 40)
            label_box_h = max(14, label_box_w // 2)
            lx = x0 + 4
            ly = y0 + 4
            # 避免越界
            if lx + label_box_w > preview.width:
                lx = max(0, preview.width - label_box_w - 4)
            if ly + label_box_h > preview.height:
                ly = max(0, preview.height - label_box_h - 4)
            draw.rectangle([lx, ly, lx + label_box_w, ly + label_box_h], fill=(0, 120, 255))
            # 白色编号
            try:
                draw.text((lx + 3, ly), str(idx), fill=(255, 255, 255))
            except Exception:
                draw.text((lx + 3, ly), str(idx), fill=(255, 255, 255))

        # 可选缩放预览
        if preview_scale != 1.0 and preview_scale > 0:
            new_w = max(1, int(preview.width * preview_scale))
            new_h = max(1, int(preview.height * preview_scale))
            preview = preview.resize((new_w, new_h), Image.Resampling.LANCZOS)

        return preview

    def tensor_to_pil(self, tensor):
        """将 tensor 转为 PIL（与项目中其它实现保持一致）"""
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
        """将 PIL 转为 tensor，输出 shape 为 [1, H, W, C]"""
        if pil_image.mode != 'RGB':
            pil_image = pil_image.convert('RGB')
        numpy_image = np.array(pil_image).astype(np.float32)
        numpy_image = numpy_image / 255.0
        tensor = torch.from_numpy(numpy_image)
        tensor = tensor.unsqueeze(0)
        return tensor


# 节点映射
NODE_CLASS_MAPPINGS = {
    "SliceCropWithPanel": SliceCropWithPanel,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "SliceCropWithPanel": "🔵BB切片划分（交互）",
}


