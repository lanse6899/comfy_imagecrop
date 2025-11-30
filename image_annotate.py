import torch
import numpy as np
from PIL import Image, ImageDraw, ImageFont
import os

class ImageAnnotateWithPanel:
    """
    图像标注节点
    支持在图像上点击添加带编号的标记点
    """
    
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "image": ("IMAGE",),
                "marker_type": (["数字", "字母"], {
                    "default": "数字"
                }),
                "marker_size": ("INT", {
                    "default": 40,
                    "min": 20,
                    "max": 100,
                    "step": 5
                }),
                "marker_color": (["蓝色", "红色", "绿色", "黄色", "紫色", "橙色", "青色", "粉色", "深蓝", "深绿", "棕色", "灰色"], {
                    "default": "蓝色"
                }),
                "text_color": (["白色", "黑色"], {
                    "default": "白色"
                }),
                "annotations": ("STRING", {
                    "default": "",
                    "multiline": False,
                    "display": "hidden"
                }),
            }
        }
    
    RETURN_TYPES = ("IMAGE",)
    RETURN_NAMES = ("annotated_image",)
    FUNCTION = "annotate_image"
    CATEGORY = "🔵BB image crop"
    
    def annotate_image(self, image, marker_type, marker_size, marker_color, text_color, annotations):
        """
        图像标注主函数
        """
        # 转换tensor到PIL图像
        if len(image.shape) == 4:
            pil_image = self.tensor_to_pil(image[0])
        else:
            pil_image = self.tensor_to_pil(image)
        
        # 解析标注数据
        annotation_points = self.parse_annotations(annotations)
        
        # 如果没有标注点，返回原图
        if not annotation_points:
            return (self.pil_to_tensor(pil_image),)
        
        # 创建标注图像
        annotated_image = self.draw_annotations(
            pil_image, annotation_points, marker_type, 
            marker_size, marker_color, text_color
        )
        
        # 转换回tensor
        result_tensor = self.pil_to_tensor(annotated_image)
        
        return (result_tensor,)
    
    def parse_annotations(self, annotations_str):
        """
        解析标注字符串
        格式: "x1,y1;x2,y2;x3,y3"
        """
        if not annotations_str or annotations_str.strip() == "":
            return []
        
        points = []
        try:
            pairs = annotations_str.split(';')
            for pair in pairs:
                if pair.strip():
                    x, y = pair.split(',')
                    points.append((float(x), float(y)))
        except:
            return []
        
        return points
    
    def draw_annotations(self, image, points, marker_type, marker_size, marker_color, text_color):
        """
        在图像上绘制标注
        """
        # 转换为RGBA以支持更好的绘制效果
        if image.mode != 'RGBA':
            result_image = image.convert('RGBA')
        else:
            result_image = image.copy()
        
        # 创建绘图层
        overlay = Image.new('RGBA', result_image.size, (0, 0, 0, 0))
        draw = ImageDraw.Draw(overlay)
        
        # 颜色映射
        color_map = {
            "蓝色": (41, 128, 185, 255),      # 完全不透明
            "红色": (231, 76, 60, 255),       # 鲜红色
            "绿色": (46, 204, 113, 255),      # 翠绿色
            "黄色": (241, 196, 15, 255),      # 金黄色
            "紫色": (155, 89, 182, 255),      # 紫罗兰
            "橙色": (230, 126, 34, 255),      # 橙色
            "青色": (26, 188, 156, 255),      # 青绿色
            "粉色": (236, 112, 140, 255),     # 粉红色
            "深蓝": (52, 73, 94, 255),        # 深蓝色
            "深绿": (39, 174, 96, 255),       # 深绿色
            "棕色": (165, 105, 79, 255),      # 棕色
            "灰色": (127, 140, 141, 255)      # 灰色
        }
        
        text_color_map = {
            "白色": (255, 255, 255, 255),
            "黑色": (0, 0, 0, 255)
        }
        
        marker_fill = color_map.get(marker_color, color_map["蓝色"])
        text_fill = text_color_map.get(text_color, text_color_map["白色"])
        
        # 加载字体
        try:
            # 尝试加载系统字体
            font_size = int(marker_size * 0.5)
            font = ImageFont.truetype("arial.ttf", font_size)
        except:
            try:
                # Windows系统字体
                font = ImageFont.truetype("C:/Windows/Fonts/arial.ttf", int(marker_size * 0.5))
            except:
                # 使用默认字体
                font = ImageFont.load_default()
        
        # 绘制每个标注点
        for i, (x, y) in enumerate(points):
            # 生成标签
            if marker_type == "数字":
                label = str(i + 1)
            else:  # 字母
                label = chr(65 + i) if i < 26 else chr(65 + (i % 26))
            
            # 绘制标记点（类似地图标记的形状）
            self.draw_map_marker(draw, x, y, marker_size, marker_fill, label, text_fill, font)
        
        # 合并图层
        result_image = Image.alpha_composite(result_image, overlay)
        
        # 转换回RGB
        result_image = result_image.convert('RGB')
        
        return result_image
    
    def draw_map_marker(self, draw, x, y, size, fill_color, label, text_color, font):
        """
        绘制地图标记样式的标注点
        """
        # 圆形部分的半径
        radius = size // 2
        
        # 绘制底部的尖角（三角形）
        tip_height = size // 3
        tip_points = [
            (x, y + radius + tip_height),  # 底部尖端
            (x - radius // 2, y + radius),  # 左边
            (x + radius // 2, y + radius)   # 右边
        ]
        draw.polygon(tip_points, fill=fill_color)
        
        # 绘制圆形主体
        circle_bbox = [
            x - radius, y - radius,
            x + radius, y + radius
        ]
        draw.ellipse(circle_bbox, fill=fill_color)
        
        # 绘制白色内圈（可选，增加层次感）
        inner_radius = radius - 3
        if inner_radius > 0:
            inner_circle = [
                x - inner_radius, y - inner_radius,
                x + inner_radius, y + inner_radius
            ]
            # 绘制半透明白色边框
            draw.ellipse(inner_circle, outline=(255, 255, 255, 180), width=2)
        
        # 绘制文字标签
        try:
            # 获取文字边界框
            bbox = draw.textbbox((0, 0), label, font=font)
            text_width = bbox[2] - bbox[0]
            text_height = bbox[3] - bbox[1]
            
            # 居中文字
            text_x = x - text_width // 2
            text_y = y - text_height // 2 - radius // 4
            
            draw.text((text_x, text_y), label, fill=text_color, font=font)
        except:
            # 如果textbbox不可用，使用旧方法
            draw.text((x - size // 4, y - size // 4), label, fill=text_color, font=font)
    
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
        if pil_image.mode == 'RGBA':
            pil_image = pil_image.convert('RGB')
        elif pil_image.mode != 'RGB':
            pil_image = pil_image.convert('RGB')
        
        numpy_image = np.array(pil_image).astype(np.float32)
        numpy_image = numpy_image / 255.0
        tensor = torch.from_numpy(numpy_image)
        tensor = tensor.unsqueeze(0)
        
        return tensor


NODE_CLASS_MAPPINGS = {
    "ImageAnnotateWithPanel": ImageAnnotateWithPanel,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "ImageAnnotateWithPanel": "🔵BB图像标注",
}
