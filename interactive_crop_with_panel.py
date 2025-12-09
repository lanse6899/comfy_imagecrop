import torch
import numpy as np
from PIL import Image, ImageDraw

class InteractiveCropWithPanel:
    """
    带交互面板的图像剪裁节点
    在节点上显示交互式预览面板，支持鼠标拖拽和缩放
    """
    
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "image": ("IMAGE",),
                "crop_width": ("INT", {
                    "default": 512, 
                    "min": 64, 
                    "max": 2048, 
                    "step": 8
                }),
                "crop_height": ("INT", {
                    "default": 512, 
                    "min": 64, 
                    "max": 2048, 
                    "step": 8
                }),
                "offset_x": ("INT", {
                    "default": 0, 
                    "min": -4096, 
                    "max": 4096, 
                    "step": 1,
                    "display": "hidden"  # 隐藏显示，由面板控制
                }),
                "offset_y": ("INT", {
                    "default": 0, 
                    "min": -4096, 
                    "max": 4096, 
                    "step": 1,
                    "display": "hidden"
                }),
                "scale": ("FLOAT", {
                    "default": 1.0, 
                    "min": 0.1, 
                    "max": 5.0, 
                    "step": 0.01,
                    "display": "hidden"
                }),
                "rotation": ("FLOAT", {
                    "default": 0.0,
                    "min": -180.0,
                    "max": 180.0,
                    "step": 1.0
                }),
            }
        }
    
    RETURN_TYPES = ("IMAGE", "IMAGE")
    RETURN_NAMES = ("cropped_image", "preview_image")
    FUNCTION = "crop_image"
    CATEGORY = "🔵BB image crop"
    
    def crop_image(self, image, crop_width, crop_height, offset_x=0, offset_y=0, scale=1.0, rotation=0.0):
        """
        执行图像剪裁并生成预览
        面板版本：offset、scale和rotation由面板交互控制
        """
        # 转换tensor到PIL图像
        if len(image.shape) == 4:
            pil_image = self.tensor_to_pil(image[0])
        else:
            pil_image = self.tensor_to_pil(image)
        
        original_width, original_height = pil_image.size
        
        # 应用旋转
        if rotation != 0.0:
            pil_image = pil_image.rotate(-rotation, expand=True, resample=Image.Resampling.BICUBIC, fillcolor=(0, 0, 0))
        
        # 应用缩放
        if scale != 1.0:
            new_width = int(pil_image.width * scale)
            new_height = int(pil_image.height * scale)
            pil_image = pil_image.resize((new_width, new_height), Image.Resampling.LANCZOS)
        
        # 计算剪裁区域
        img_width, img_height = pil_image.size
        
        # 计算剪裁起始位置（居中 + 偏移）
        start_x = (img_width - crop_width) // 2 + offset_x
        start_y = (img_height - crop_height) // 2 + offset_y
        
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


# 节点映射
NODE_CLASS_MAPPINGS = {
    "InteractiveCropWithPanel": InteractiveCropWithPanel,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "InteractiveCropWithPanel": "🔵BB交互式剪裁",
}
