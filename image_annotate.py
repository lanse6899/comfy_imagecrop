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
                "marker_size": ("INT", {
                    "default": 100,
                    "min": 20,
                    "max": 1000,
                    "step": 5
                }),
                "font_mode": (["按比例", "固定字号"], {
                    "default": "按比例"
                }),
                "font_scale": ("FLOAT", {
                    "default": 0.5,
                    "min": 0.2,
                    "max": 100.0,
                    "step": 0.1
                }),
                "font_size_px": ("INT", {
                    "default": 20,
                    "min": 6,
                    "max": 500,
                    "step": 1
                }),
                "font_weight": (["粗体", "常规"], {
                    "default": "粗体"
                }),
                "font_family": ("STRING", {
                    "default": "",
                    "multiline": False,
                    "placeholder": "自定义字体优先级，逗号分隔，可留空"
                }),
                "marker_color": (["蓝色", "红色", "绿色", "黄色", "紫色", "橙色", "青色", "粉色", "深蓝", "深绿", "棕色", "灰色"], {
                    "default": "蓝色"
                }),
                "text_color": (["白色", "黑色"], {
                    "default": "白色"
                }),
                "label_type": (["数字", "英文"], {
                    "default": "数字"
                }),
                "separator": ("STRING", {
                    "default": ",",
                    "multiline": False
                }),
                "label_prefix": ("STRING", {
                    "default": "",
                    "multiline": False
                }),
                "text_format": ("STRING", {
                    "default": "{label}",
                    "multiline": False
                }),
                "annotations": ("STRING", {
                    "default": "",
                    "multiline": False,
                    "display": "hidden"
                }),
                "selected_index": ("INT", {
                    "default": -1,
                    "min": -1,
                    "max": 999,
                    "display": "hidden"
                }),
            }
        }
    
    RETURN_TYPES = ("IMAGE", "STRING", "STRING", "STRING", "STRING", "STRING", "STRING", "STRING", "STRING", "STRING", "STRING", "STRING")
    RETURN_NAMES = ("annotated_image", "labels_text", "selected_label", "label_1", "label_2", "label_3", "label_4", "label_5", "label_6", "label_7", "label_8", "label_9", "label_10")
    FUNCTION = "annotate_image"
    CATEGORY = "🔵BB image crop"
    
    def annotate_image(self, image, marker_size, font_mode, font_scale, font_size_px, font_weight, font_family, marker_color, text_color, label_type, separator, label_prefix, text_format, annotations, selected_index=-1):
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
        
        # 提取标签文本
        labels_text = self.extract_labels(annotation_points, separator, label_prefix, text_format)
        
        # 提取选中的标签文本
        selected_label = self.get_selected_label(annotation_points, selected_index, label_prefix, text_format)
        
        # 获取10个独立标签
        individual_labels = self.get_individual_labels(annotation_points, label_type, label_prefix, text_format)
        
        # 如果没有标注点，返回原图
        if not annotation_points:
            return (self.pil_to_tensor(pil_image), labels_text, selected_label, *individual_labels)
        
        # 创建标注图像
        annotated_image = self.draw_annotations(
            pil_image, annotation_points, 
            marker_size, marker_color, text_color,
            font_mode, font_scale, font_size_px, font_weight, font_family
        )
        
        # 转换回tensor
        result_tensor = self.pil_to_tensor(annotated_image)
        
        return (result_tensor, labels_text, selected_label, *individual_labels)
    
    def parse_annotations(self, annotations_str):
        """
        解析标注字符串
        格式: "x1,y1,label1;x2,y2,label2;x3,y3,label3"
        """
        if not annotations_str or annotations_str.strip() == "":
            return []
        
        points = []
        try:
            pairs = annotations_str.split(';')
            for pair in pairs:
                if pair.strip():
                    parts = pair.split(',')
                    if len(parts) >= 3:
                        x, y, label = parts[0], parts[1], parts[2]
                        points.append((float(x), float(y), label))
                    elif len(parts) == 2:
                        # 兼容旧格式
                        x, y = parts[0], parts[1]
                        points.append((float(x), float(y), ''))
        except:
            return []
        
        return points
    
    def extract_labels(self, annotation_points, separator, label_prefix, text_format):
        """
        提取所有标签并用分隔符连接
        text_format 支持的占位符:
        - {label}: 标签内容
        - {index}: 标签索引（从1开始）
        - {index0}: 标签索引（从0开始）
        """
        if not annotation_points:
            return ""
        
        labels = []
        label_index = 1
        for i, point_data in enumerate(annotation_points):
            if len(point_data) >= 3:
                label = point_data[2]
                if label:  # 只添加非空标签
                    # 添加前缀
                    full_label = label_prefix + label if label_prefix else label
                    # 格式化文本
                    formatted_text = text_format.replace("{label}", full_label)
                    formatted_text = formatted_text.replace("{index}", str(label_index))
                    formatted_text = formatted_text.replace("{index0}", str(label_index - 1))
                    labels.append(formatted_text)
                    label_index += 1
        
        return separator.join(labels)
    
    def get_selected_label(self, annotation_points, selected_index, label_prefix, text_format):
        """
        获取选中标记的标签文本
        """
        if not annotation_points or selected_index < 0 or selected_index >= len(annotation_points):
            return ""
        
        point_data = annotation_points[selected_index]
        if len(point_data) >= 3:
            label = point_data[2]
            if label:
                # 添加前缀
                full_label = label_prefix + label if label_prefix else label
                # 格式化文本
                formatted_text = text_format.replace("{label}", full_label)
                formatted_text = formatted_text.replace("{index}", str(selected_index + 1))
                formatted_text = formatted_text.replace("{index0}", str(selected_index))
                return formatted_text
        
        return ""
    
    def get_individual_labels(self, annotation_points, label_type, label_prefix, text_format):
        """
        获取10个独立的标签输出
        根据label_type返回数字(1234567890)或英文(ABCDEFGHIJ)
        """
        # 定义标签映射
        number_labels = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "0"]
        letter_labels = ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J"]
        
        # 根据类型选择标签
        base_labels = number_labels if label_type == "数字" else letter_labels
        
        # 初始化10个空标签
        result_labels = [""] * 10
        
        # 填充实际存在的标注点
        for i in range(min(10, len(annotation_points))):
            point_data = annotation_points[i]
            if len(point_data) >= 3:
                label = point_data[2]
                # 如果标注点有自定义标签，使用自定义标签；否则使用默认标签
                if label:
                    full_label = label_prefix + label if label_prefix else label
                else:
                    full_label = label_prefix + base_labels[i] if label_prefix else base_labels[i]
                
                # 格式化文本
                formatted_text = text_format.replace("{label}", full_label)
                formatted_text = formatted_text.replace("{index}", str(i + 1))
                formatted_text = formatted_text.replace("{index0}", str(i))
                result_labels[i] = formatted_text
        
        return result_labels
    
    def draw_annotations(self, image, points, marker_size, marker_color, text_color, font_mode, font_scale, font_size_px, font_weight, font_family):
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
        
        # 计算字号
        if font_mode == "固定字号":
            font_size = max(6, int(font_size_px))
        else:
            font_size = max(6, int(marker_size * font_scale))
        
        # 加载字体（支持中文），按自定义优先级再回退
        font = None
        custom_fonts = [f.strip() for f in font_family.split(",") if f.strip()] if font_family else []
        bold_requested = font_weight == "粗体"
        
        # 常用字体路径优先列表
        fallback_fonts = [
            ("C:/Windows/Fonts/msyhbd.ttc" if bold_requested else "C:/Windows/Fonts/msyh.ttc"),  # 微软雅黑(粗/常)
            "C:/Windows/Fonts/simhei.ttf",    # 黑体（较粗）
            "C:/Windows/Fonts/simsun.ttc",    # 宋体
            "C:/Windows/Fonts/simkai.ttf",    # 楷体
            "/System/Library/Fonts/PingFang.ttc",  # Mac 苹方
            "/usr/share/fonts/truetype/noto/NotoSansCJK-Regular.ttc",
            "/usr/share/fonts/truetype/noto/NotoSansSC-Regular.otf",
            "/usr/share/fonts/truetype/droid/DroidSansFallbackFull.ttf",
        ]
        
        # 将自定义字体名/路径放在前面
        search_fonts = custom_fonts + fallback_fonts
        
        for font_path in search_fonts:
            try:
                font = ImageFont.truetype(font_path, font_size)
                break
            except:
                continue
        
        # 如果都失败，使用默认字体
        if font is None:
            try:
                font = ImageFont.truetype("arial.ttf", font_size)
            except:
                font = ImageFont.load_default()
        
        # 绘制每个标注点
        for i, point_data in enumerate(points):
            x, y, label = point_data
            
            # 如果没有标签，使用索引
            if not label:
                label = str(i + 1)
            
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
            
            # 居中文字，考虑字体基线偏移
            text_x = x - text_width // 2 - bbox[0]  # 水平居中并补偿左侧偏移
            text_y = y - text_height // 2 - bbox[1]  # 垂直居中并补偿顶部偏移
            
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

