import torch
import numpy as np
from PIL import Image, ImageDraw, ImageFont
import math

class StraightenLayerWithPanel:
    """
    Photoshop风格的拉直图层节点
    """
    
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "image": ("IMAGE",),
                "rotation_angle": ("FLOAT", {
                    "default": 0.0,
                    "min": -180.0,
                    "max": 180.0,
                    "step": 0.1,
                    "display": "number"
                }),
                "reference_line_x1": ("FLOAT", {
                    "default": 0.0,
                    "min": -4096.0,
                    "max": 4096.0,
                    "step": 1.0,
                    "display": "hidden"
                }),
                "reference_line_y1": ("FLOAT", {
                    "default": 0.0,
                    "min": -4096.0,
                    "max": 4096.0,
                    "step": 1.0,
                    "display": "hidden"
                }),
                "reference_line_x2": ("FLOAT", {
                    "default": 100.0,
                    "min": -4096.0,
                    "max": 4096.0,
                    "step": 1.0,
                    "display": "hidden"
                }),
                "reference_line_y2": ("FLOAT", {
                    "default": 0.0,
                    "min": -4096.0,
                    "max": 4096.0,
                    "step": 1.0,
                    "display": "hidden"
                }),
                "auto_crop": ("BOOLEAN", {
                    "default": True,
                    "label_on": "自动裁剪",
                    "label_off": "保留全部"
                }),
                "fill_color": (["black", "white", "transparent"], {
                    "default": "black"
                }),
            }
        }
    
    RETURN_TYPES = ("IMAGE", "IMAGE", "FLOAT")
    RETURN_NAMES = ("straightened_image", "preview_image", "calculated_angle")
    FUNCTION = "straighten_layer"
    CATEGORY = "🔵BB image crop"
    
    def straighten_layer(self, image, rotation_angle, reference_line_x1, reference_line_y1, 
                        reference_line_x2, reference_line_y2, auto_crop, fill_color):
        
        # 转换tensor到PIL图像
        if len(image.shape) == 4:
            pil_image = self.tensor_to_pil(image[0])
        else:
            pil_image = self.tensor_to_pil(image)
        
        # 计算角度
        calculated_angle = rotation_angle
        
        # 检查是否有用户绘制的参考线
        if not (reference_line_x1 == 0 and reference_line_y1 == 0 and 
                reference_line_x2 == 100 and reference_line_y2 == 0):
            # 用户绘制了参考线，计算角度
            dx = reference_line_x2 - reference_line_x1
            dy = reference_line_y2 - reference_line_y1
            if abs(dx) > 0.1 or abs(dy) > 0.1:
                calculated_angle = math.degrees(math.atan2(dy, dx))
        
        # 应用旋转拉直图像
        if calculated_angle != 0.0:
            # 确定填充颜色
            if fill_color == "white":
                fillcolor = (255, 255, 255)
            elif fill_color == "transparent":
                fillcolor = (0, 0, 0, 0)
                pil_image = pil_image.convert('RGBA')
            else:
                fillcolor = (0, 0, 0)
            
            # 旋转图像
            rotated_image = pil_image.rotate(
                calculated_angle, 
                expand=True, 
                resample=Image.Resampling.BICUBIC,
                fillcolor=fillcolor
            )
        else:
            rotated_image = pil_image
        
        # 根据auto_crop决定是否裁剪
        if auto_crop:
            final_image = self.auto_crop_rotated_image(rotated_image, calculated_angle)
        else:
            final_image = rotated_image
        
        # 生成预览图像
        preview_image = self.create_preview(
            pil_image, 
            reference_line_x1, reference_line_y1,
            reference_line_x2, reference_line_y2,
            calculated_angle
        )
        
        # 转换回tensor
        straightened_tensor = self.pil_to_tensor(final_image)
        preview_tensor = self.pil_to_tensor(preview_image)
        
        return (straightened_tensor, preview_tensor, calculated_angle)
    
    def auto_crop_rotated_image(self, image, angle):
        """自动裁剪旋转后的图像"""
        if angle == 0:
            return image
        
        width, height = image.size
        angle_rad = math.radians(abs(angle))
        
        if width <= 0 or height <= 0:
            return image
        
        sin_a = abs(math.sin(angle_rad))
        cos_a = abs(math.cos(angle_rad))
        
        if sin_a < 1e-10:
            return image
        
        if width < height:
            new_width = width
            new_height = (width * sin_a + width * cos_a) / (sin_a + cos_a)
        else:
            new_height = height
            new_width = (height * sin_a + height * cos_a) / (sin_a + cos_a)
        
        new_width = min(new_width, width)
        new_height = min(new_height, height)
        
        left = (width - new_width) / 2
        top = (height - new_height) / 2
        right = left + new_width
        bottom = top + new_height
        
        return image.crop((int(left), int(top), int(right), int(bottom)))
    
    def create_preview(self, image, line_x1, line_y1, line_x2, line_y2, angle):
        """创建预览图像"""
        preview = image.copy().convert('RGB')
        draw = ImageDraw.Draw(preview)
        
        img_width, img_height = preview.size
        
        # 绘制参考线
        if not (line_x1 == 0 and line_y1 == 0 and line_x2 == 100 and line_y2 == 0):
            x1 = max(0, min(img_width, line_x1))
            y1 = max(0, min(img_height, line_y1))
            x2 = max(0, min(img_width, line_x2))
            y2 = max(0, min(img_height, line_y2))
            
            draw.line([(x1, y1), (x2, y2)], fill=(0, 255, 255), width=3)
            
            # 绘制端点
            point_size = 8
            draw.ellipse([x1-point_size, y1-point_size, x1+point_size, y1+point_size], 
                        fill=(255, 0, 0), outline=(255, 255, 255), width=2)
            draw.ellipse([x2-point_size, y2-point_size, x2+point_size, y2+point_size], 
                        fill=(255, 0, 0), outline=(255, 255, 255), width=2)
        
        # 显示角度信息
        try:
            font = ImageFont.truetype("arial.ttf", 20)
        except:
            font = None
        
        angle_text = f"角度: {angle:.2f}°"
        draw.rectangle([10, 10, 160, 40], fill=(0, 0, 0, 180))
        draw.text((20, 20), angle_text, fill=(255, 255, 0), font=font)
        
        return preview
    
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
            pass
        elif pil_image.mode != 'RGB':
            pil_image = pil_image.convert('RGB')
        
        numpy_image = np.array(pil_image).astype(np.float32)
        numpy_image = numpy_image / 255.0
        tensor = torch.from_numpy(numpy_image)
        tensor = tensor.unsqueeze(0)
        
        return tensor


NODE_CLASS_MAPPINGS = {
    "StraightenLayerWithPanel": StraightenLayerWithPanel,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "StraightenLayerWithPanel": "🔵BB矫正图像",
}
