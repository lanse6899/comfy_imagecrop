import torch
import numpy as np
from PIL import Image, ImageDraw

class RatioCropWithPanel:
    """
    带比例选择的交互式图像剪裁节点
    图像固定不动，只移动和缩放裁剪框
    支持多种预设比例（3:4, 16:9, 1:1等）
    """
    
    # 预设比例
    ASPECT_RATIOS = {
        "1:1": (1.0, 1.0),
        "3:4": (3.0, 4.0),
        "4:3": (4.0, 3.0),
        "16:9": (16.0, 9.0),
        "9:16": (9.0, 16.0),
        "21:9": (21.0, 9.0),
        "9:21": (9.0, 21.0),
        "自定义": None,  # 自定义比例
    }
    
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "image": ("IMAGE",),
                "aspect_ratio": (list(cls.ASPECT_RATIOS.keys()), {
                    "default": "1:1"
                }),
                "crop_size": ("INT", {
                    "default": 512, 
                    "min": 64, 
                    "max": 2048, 
                    "step": 8
                }),
                "crop_x": ("INT", {
                    "default": 0, 
                    "min": -4096, 
                    "max": 4096, 
                    "step": 1,
                    "display": "hidden"  # 隐藏显示，由面板控制
                }),
                "crop_y": ("INT", {
                    "default": 0, 
                    "min": -4096, 
                    "max": 4096, 
                    "step": 1,
                    "display": "hidden"
                }),
                "crop_scale": ("FLOAT", {
                    "default": 1.0, 
                    "min": 0.1, 
                    "max": 5.0, 
                    "step": 0.01,
                    "display": "hidden"
                }),
            }
        }
    
    RETURN_TYPES = ("IMAGE", "IMAGE")
    RETURN_NAMES = ("cropped_image", "preview_image")
    FUNCTION = "crop_image"
    CATEGORY = "🔵BB image crop"
    
    def crop_image(self, image, aspect_ratio, crop_size, crop_x=0, crop_y=0, crop_scale=1.0):
        """
        执行图像剪裁并生成预览
        图像固定，只移动和缩放裁剪框
        """
        # 转换tensor到PIL图像
        if len(image.shape) == 4:
            pil_image = self.tensor_to_pil(image[0])
        else:
            pil_image = self.tensor_to_pil(image)
        
        img_width, img_height = pil_image.size
        
        # 计算裁剪框尺寸（根据比例和缩放）
        if aspect_ratio == "自定义":
            # 自定义比例：使用crop_size作为宽度，高度也使用crop_size（1:1）
            crop_width = int(crop_size * crop_scale)
            crop_height = int(crop_size * crop_scale)
        else:
            # 使用预设比例
            ratio_w, ratio_h = self.ASPECT_RATIOS[aspect_ratio]
            ratio = ratio_w / ratio_h
            
            # 根据比例和基础尺寸计算裁剪框尺寸
            if ratio >= 1.0:  # 横向
                crop_width = int(crop_size * crop_scale)
                crop_height = int(crop_size * crop_scale / ratio)
            else:  # 纵向
                crop_width = int(crop_size * crop_scale * ratio)
                crop_height = int(crop_size * crop_scale)
        
        # 计算裁剪起始位置（图像中心 + 偏移）
        start_x = (img_width - crop_width) // 2 + crop_x
        start_y = (img_height - crop_height) // 2 + crop_y
        
        # 执行剪裁
        cropped_image = self.perform_crop(pil_image, start_x, start_y, crop_width, crop_height)
        
        # 生成预览图像（显示剪裁区域）
        preview_image = self.create_preview(pil_image, start_x, start_y, crop_width, crop_height)
        
        # 转换回tensor
        cropped_tensor = self.pil_to_tensor(cropped_image)
        preview_tensor = self.pil_to_tensor(preview_image)
        
        return (cropped_tensor, preview_tensor)
    
    def perform_crop(self, image, start_x, start_y, crop_width, crop_height):
        """执行实际的剪裁操作"""
        img_width, img_height = image.size
        
        # 创建目标尺寸的画布
        result = Image.new('RGB', (crop_width, crop_height), (0, 0, 0))
        
        # 计算可见区域
        visible_start_x = max(0, -start_x)
        visible_start_y = max(0, -start_y)
        visible_end_x = min(crop_width, img_width - start_x)
        visible_end_y = min(crop_height, img_height - start_y)
        
        if visible_end_x > visible_start_x and visible_end_y > visible_start_y:
            # 从原图剪裁可见部分
            crop_from_x = max(0, start_x)
            crop_from_y = max(0, start_y)
            crop_to_x = min(img_width, start_x + crop_width)
            crop_to_y = min(img_height, start_y + crop_height)
            
            cropped_part = image.crop((crop_from_x, crop_from_y, crop_to_x, crop_to_y))
            
            # 粘贴到结果图像
            paste_x = max(0, -start_x)
            paste_y = max(0, -start_y)
            result.paste(cropped_part, (paste_x, paste_y))
        
        return result
    
    def create_preview(self, image, start_x, start_y, crop_width, crop_height):
        """创建预览图像，显示剪裁区域"""
        preview = image.copy()
        draw = ImageDraw.Draw(preview)
        
        # 绘制剪裁区域边框
        end_x = start_x + crop_width
        end_y = start_y + crop_height
        
        # 红色边框
        border_width = max(3, min(preview.width, preview.height) // 200)
        for i in range(border_width):
            draw.rectangle([
                start_x - i, start_y - i, 
                end_x + i, end_y + i
            ], outline=(255, 0, 0), width=1)
        
        # 绘制角点控制器
        corner_size = 12
        corners = [
            (start_x - corner_size//2, start_y - corner_size//2),  # 左上
            (end_x - corner_size//2, start_y - corner_size//2),    # 右上
            (start_x - corner_size//2, end_y - corner_size//2),    # 左下
            (end_x - corner_size//2, end_y - corner_size//2)       # 右下
        ]
        
        for corner_x, corner_y in corners:
            draw.rectangle([
                corner_x, corner_y,
                corner_x + corner_size, corner_y + corner_size
            ], fill=(255, 255, 0), outline=(0, 0, 0), width=2)
        
        # 绘制中心十字线
        center_x = (start_x + end_x) // 2
        center_y = (start_y + end_y) // 2
        cross_size = 20
        
        draw.line([center_x - cross_size, center_y, center_x + cross_size, center_y], 
                  fill=(0, 255, 0), width=3)
        draw.line([center_x, center_y - cross_size, center_x, center_y + cross_size], 
                  fill=(0, 255, 0), width=3)
        
        # 半透明遮罩（剪裁区域外）
        mask = Image.new('RGBA', preview.size, (0, 0, 0, 120))
        mask_draw = ImageDraw.Draw(mask)
        
        # 清除剪裁区域的遮罩
        mask_draw.rectangle([start_x, start_y, end_x, end_y], fill=(0, 0, 0, 0))
        
        # 应用遮罩
        preview = preview.convert('RGBA')
        preview = Image.alpha_composite(preview, mask)
        preview = preview.convert('RGB')
        
        return preview
    
    def tensor_to_pil(self, tensor):
        """将tensor转换为PIL图像"""
        # tensor shape: [H, W, C] 或 [C, H, W]
        if len(tensor.shape) == 3:
            if tensor.shape[0] == 3 or tensor.shape[0] == 1:  # [C, H, W]
                tensor = tensor.permute(1, 2, 0)  # 转换为 [H, W, C]
        
        # 确保值在0-1范围内
        tensor = torch.clamp(tensor, 0, 1)
        
        # 转换为numpy数组
        numpy_image = tensor.cpu().numpy()
        
        # 转换为0-255范围
        numpy_image = (numpy_image * 255).astype(np.uint8)
        
        # 转换为PIL图像
        if len(numpy_image.shape) == 2:
            # 灰度图像
            pil_image = Image.fromarray(numpy_image, mode='L').convert('RGB')
        elif numpy_image.shape[2] == 1:
            # 单通道图像
            pil_image = Image.fromarray(numpy_image.squeeze(), mode='L').convert('RGB')
        else:
            # RGB图像
            pil_image = Image.fromarray(numpy_image, mode='RGB')
        
        return pil_image
    
    def pil_to_tensor(self, pil_image):
        """将PIL图像转换为tensor"""
        # 确保是RGB模式
        if pil_image.mode != 'RGB':
            pil_image = pil_image.convert('RGB')
        
        # 转换为numpy数组
        numpy_image = np.array(pil_image).astype(np.float32)
        
        # 归一化到0-1范围
        numpy_image = numpy_image / 255.0
        
        # 转换为tensor [H, W, C]
        tensor = torch.from_numpy(numpy_image)
        
        # 添加批次维度 [1, H, W, C]
        tensor = tensor.unsqueeze(0)
        
        return tensor

