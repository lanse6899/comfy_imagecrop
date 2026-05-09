import torch
import numpy as np
from PIL import Image, ImageDraw
import json

class ImageDrawingWithPanel:
    """
    图像绘制节点
    支持在图像上绘制线条、填充矩形和填充圆形，实时canvas渲染
    """

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "image": ("IMAGE",),
                "drawing_data": ("STRING", {
                    "default": "",
                    "multiline": False,
                    "display": "hidden"
                }),
                "brush_size": ("INT", {
                    "default": 5,
                    "min": 1,
                    "max": 50,
                    "step": 1
                }),
                "brush_color": (["黑色", "白色", "红色", "绿色", "蓝色", "黄色", "紫色", "橙色", "青色", "粉色"], {
                    "default": "黑色"
                }),
                "current_tool": (["brush", "rectangle", "circle"], {
                    "default": "brush"
                }),
                "fill_mode": (["填充", "描边"], {
                    "default": "填充"
                }),
            }
        }

    RETURN_TYPES = ("IMAGE", "MASK", "STRING")
    RETURN_NAMES = ("drawn_image", "mask", "drawing_data")
    FUNCTION = "draw_on_image"
    CATEGORY = "🔵BB image crop"

    def draw_on_image(self, image, drawing_data, brush_size, brush_color, current_tool, fill_mode):
        """
        在图像上绘制并返回结果
        """
        # 转换tensor到PIL图像
        if len(image.shape) == 4:
            pil_image = self.tensor_to_pil(image[0])
        else:
            pil_image = self.tensor_to_pil(image)

        # 如果没有绘制数据，返回原图
        if not drawing_data or drawing_data.strip() == "":
            return (self.pil_to_tensor(pil_image), drawing_data)

        # 解析绘制数据
        drawing_commands = self.parse_drawing_data(drawing_data)

        # 创建绘图图像
        drawn_image = self.apply_drawing(pil_image, drawing_commands, brush_size, brush_color, fill_mode)

        # 生成掩码图像
        mask_image = self.generate_mask(pil_image, drawing_commands, brush_size, fill_mode)

        # 转换回tensor
        result_tensor = self.pil_to_tensor(drawn_image)
        mask_tensor = self.pil_to_mask_tensor(mask_image)

        return (result_tensor, mask_tensor, drawing_data)

    def parse_drawing_data(self, drawing_data_str):
        """
        解析绘制数据字符串
        格式: JSON数组，包含绘制命令
        """
        if not drawing_data_str or drawing_data_str.strip() == "":
            return []

        try:
            return json.loads(drawing_data_str)
        except:
            return []

    def apply_drawing(self, image, commands, brush_size, brush_color, fill_mode):
        """
        将绘制命令应用到图像上
        """
        # 创建RGBA图像以支持透明度
        if image.mode != 'RGBA':
            result_image = image.convert('RGBA')
        else:
            result_image = image.copy()

        # 创建绘图对象
        draw = ImageDraw.Draw(result_image)

        # 颜色映射
        color_map = {
            "黑色": (0, 0, 0, 255),
            "白色": (255, 255, 255, 255),
            "红色": (255, 0, 0, 255),
            "绿色": (0, 255, 0, 255),
            "蓝色": (0, 0, 255, 255),
            "黄色": (255, 255, 0, 255),
            "紫色": (128, 0, 128, 255),
            "橙色": (255, 165, 0, 255),
            "青色": (0, 255, 255, 255),
            "粉色": (255, 192, 203, 255)
        }

        color = color_map.get(brush_color, (0, 0, 0, 255))

        # 应用每个绘制命令
        for command in commands:
            cmd_type = command.get('type', '')
            points = command.get('points', [])
            tool = command.get('tool', 'brush')

            if cmd_type == 'path' and tool == 'brush':
                # 绘制线条路径
                if len(points) >= 2:
                    # 将点转换为(x, y)元组列表
                    path_points = [(p['x'], p['y']) for p in points]
                    # 绘制平滑线条
                    draw.line(path_points, fill=color, width=brush_size, joint='curve')

            elif cmd_type == 'rectangle':
                # 绘制填充矩形
                if len(points) >= 2:
                    x1, y1 = points[0]['x'], points[0]['y']
                    x2, y2 = points[1]['x'], points[1]['y']

                    # 确保坐标正确（左上角到右下角）
                    left = min(x1, x2)
                    top = min(y1, y2)
                    right = max(x1, x2)
                    bottom = max(y1, y2)

                    # 根据模式绘制矩形
                    if fill_mode == "填充":
                        draw.rectangle([left, top, right, bottom], fill=color)
                    else:  # 描边
                        draw.rectangle([left, top, right, bottom], outline=color, width=max(1, brush_size))

            elif cmd_type == 'circle':
                # 绘制椭圆形
                if len(points) >= 2:
                    x1, y1 = points[0]['x'], points[0]['y']
                    x2, y2 = points[1]['x'], points[1]['y']

                    # 计算椭圆的边界框（支持真正的椭圆）
                    left = min(x1, x2)
                    top = min(y1, y2)
                    right = max(x1, x2)
                    bottom = max(y1, y2)

                    # 根据模式绘制椭圆
                    bbox = [left, top, right, bottom]
                    if fill_mode == "填充":
                        draw.ellipse(bbox, fill=color)
                    else:  # 描边
                        draw.ellipse(bbox, outline=color, width=max(1, brush_size))

        # 转换回RGB
        result_image = result_image.convert('RGB')

        return result_image

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

    def generate_mask(self, image, commands, brush_size, fill_mode):
        """
        生成绘制区域的掩码图像
        """
        # 创建单通道掩码图像
        mask_image = Image.new('L', image.size, 0)  # 'L'模式为单通道灰度图

        # 创建绘图对象
        draw = ImageDraw.Draw(mask_image)

        # 应用每个绘制命令
        for command in commands:
            cmd_type = command.get('type', '')
            points = command.get('points', [])
            tool = command.get('tool', 'brush')

            if cmd_type == 'path' and tool == 'brush':
                # 绘制线条路径
                if len(points) >= 2:
                    # 将点转换为(x, y)元组列表
                    path_points = [(p['x'], p['y']) for p in points]
                    # 绘制平滑线条，使用白色填充
                    draw.line(path_points, fill=255, width=brush_size, joint='curve')

            elif cmd_type == 'rectangle':
                # 绘制矩形，使用白色填充
                if len(points) >= 2:
                    x1, y1 = points[0]['x'], points[0]['y']
                    x2, y2 = points[1]['x'], points[1]['y']

                    # 确保坐标正确（左上角到右下角）
                    left = min(x1, x2)
                    top = min(y1, y2)
                    right = max(x1, x2)
                    bottom = max(y1, y2)

                    # 绘制白色矩形
                    draw.rectangle([left, top, right, bottom], fill=255)

            elif cmd_type == 'circle':
                # 绘制椭圆形
                if len(points) >= 2:
                    x1, y1 = points[0]['x'], points[0]['y']
                    x2, y2 = points[1]['x'], points[1]['y']

                    # 计算椭圆的边界框
                    left = min(x1, x2)
                    top = min(y1, y2)
                    right = max(x1, x2)
                    bottom = max(y1, y2)

                    # 绘制白色椭圆
                    bbox = [left, top, right, bottom]
                    draw.ellipse(bbox, fill=255)

        return mask_image

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
        # 确保是单通道灰度图像
        if pil_image.mode != 'L':
            pil_image = pil_image.convert('L')

        numpy_image = np.array(pil_image).astype(np.float32)
        # 归一化到0-1范围
        numpy_image = numpy_image / 255.0
        tensor = torch.from_numpy(numpy_image)
        # 保持为单通道格式，不添加批次维度
        tensor = tensor.unsqueeze(0)  # 添加批次维度，变成[1, H, W]

        return tensor


NODE_CLASS_MAPPINGS = {
    "ImageDrawingWithPanel": ImageDrawingWithPanel,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "ImageDrawingWithPanel": "🔵BB图像绘制",
}
