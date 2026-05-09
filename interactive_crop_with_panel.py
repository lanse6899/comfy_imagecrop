import torch
import numpy as np
from PIL import Image, ImageDraw

# 预设配置
PRESET_CONFIGS = {
    "klein": {
        "1:1": [
            {"width": 1024, "height": 1024},
            {"width": 2048, "height": 2048},
            {"width": 4096, "height": 4096}
        ],
        "3:2": [
            {"width": 768, "height": 512},
            {"width": 1536, "height": 1024},
            {"width": 3072, "height": 2048}
        ],
        "2:3": [
            {"width": 688, "height": 1027},
            {"width": 1376, "height": 2054},
            {"width": 2752, "height": 4108}
        ],
        "4:3": [
            {"width": 768, "height": 576},
            {"width": 1536, "height": 1152},
            {"width": 3072, "height": 2304}
        ],
        "3:4": [
            {"width": 576, "height": 768},
            {"width": 1152, "height": 1536},
            {"width": 2304, "height": 3072}
        ],
        "16:9": [
            {"width": 768, "height": 432},
            {"width": 1536, "height": 864},
            {"width": 3072, "height": 1728}
        ],
        "9:16": [
            {"width": 576, "height": 1024},
            {"width": 1152, "height": 2048},
            {"width": 2304, "height": 4096}
        ]
    },
    "banana": {
        "1:1": [
            {"width": 1024, "height": 1024},
            {"width": 2048, "height": 2048},
            {"width": 4096, "height": 4096}
        ],
        "21:9": [
            {"width": 1584, "height": 672},
            {"width": 3168, "height": 1344},
            {"width": 6336, "height": 2688}
        ],
        "3:4": [
            {"width": 896, "height": 1200},
            {"width": 1792, "height": 2400},
            {"width": 3584, "height": 4800}
        ],
        "4:3": [
            {"width": 1200, "height": 896},
            {"width": 2400, "height": 1792},
            {"width": 4800, "height": 3584}
        ],
        "9:16": [
            {"width": 768, "height": 1376},
            {"width": 1536, "height": 2752},
            {"width": 3072, "height": 5504}
        ],
        "16:9": [
            {"width": 1376, "height": 768},
            {"width": 2752, "height": 1536},
            {"width": 5504, "height": 3072}
        ],
        "2:3": [
            {"width": 848, "height": 1264},
            {"width": 1696, "height": 2528},
            {"width": 3392, "height": 5056}
        ],
        "3:2": [
            {"width": 1264, "height": 848},
            {"width": 2528, "height": 1696},
            {"width": 5056, "height": 3392}
        ],
        "4:5": [
            {"width": 928, "height": 1152},
            {"width": 1856, "height": 2304},
            {"width": 3712, "height": 4608}
        ],
        "5:4": [
            {"width": 1152, "height": 928},
            {"width": 2304, "height": 1856},
            {"width": 4608, "height": 3712}
        ]
    }
}

# 获取所有可用比例（根据预设过滤）
def get_ratios_by_preset(preset):
    if preset in PRESET_CONFIGS:
        return list(PRESET_CONFIGS[preset].keys())
    return []

# 根据预设和比例获取对应的尺寸
def get_sizes_by_preset_and_ratio(preset, ratio):
    if preset in PRESET_CONFIGS and ratio in PRESET_CONFIGS[preset]:
        return [f"{s['width']}x{s['height']}" for s in PRESET_CONFIGS[preset][ratio]]
    return []

# 获取默认比例（第一个预设的第一个比例）
def get_default_ratio():
    if PRESET_CONFIGS:
        first_preset = list(PRESET_CONFIGS.keys())[0]
        if PRESET_CONFIGS[first_preset]:
            return list(PRESET_CONFIGS[first_preset].keys())[0]
    return "1:1"

# 获取默认尺寸（第一个预设的第一个比例的第一个尺寸）
def get_default_size():
    if PRESET_CONFIGS:
        first_preset = list(PRESET_CONFIGS.keys())[0]
        if PRESET_CONFIGS[first_preset]:
            first_ratio = list(PRESET_CONFIGS[first_preset].keys())[0]
            if PRESET_CONFIGS[first_preset][first_ratio]:
                s = PRESET_CONFIGS[first_preset][first_ratio][0]
                return f"{s['width']}x{s['height']}"
    return "1024x1024"

class InteractiveCropWithPanel:
    """
    带交互面板的图像剪裁节点
    在节点上显示交互式预览面板，支持鼠标拖拽和缩放
    """
    
    @classmethod
    def INPUT_TYPES(cls):
        # 获取默认比例和尺寸
        default_ratio = get_default_ratio()
        default_size = get_default_size()
        
        # 获取所有可能的选项（用于工作流加载时验证）
        all_ratios = []
        for preset_name, ratios_dict in PRESET_CONFIGS.items():
            for ratio in ratios_dict.keys():
                if ratio not in all_ratios:
                    all_ratios.append(ratio)
        
        all_sizes = []
        for preset_name, ratios_dict in PRESET_CONFIGS.items():
            for ratio, size_list in ratios_dict.items():
                for size in size_list:
                    size_str = f"{size['width']}x{size['height']}"
                    if size_str not in all_sizes:
                        all_sizes.append(size_str)
        
        return {
            "required": {
                "image": ("IMAGE",),
                "input_mode": (["manual", "preset"], {"default": "manual"}),
                "preset": (list(PRESET_CONFIGS.keys()), {"default": "klein"}),
                "ratio": (all_ratios, {"default": default_ratio}),
                "size": (all_sizes, {"default": default_size}),
                "crop_width": ("INT", {
                    "default": 512, 
                    "min": 64, 
                    "max": 8192, 
                    "step": 8
                }),
                "crop_height": ("INT", {
                    "default": 512, 
                    "min": 64, 
                    "max": 8192, 
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
    
    RETURN_TYPES = ("IMAGE", "IMAGE", "MASK")
    RETURN_NAMES = ("cropped_image", "preview_image", "crop_mask")
    FUNCTION = "crop_image"
    CATEGORY = "🔵BB image crop"
    
    def crop_image(self, image, input_mode="manual", preset="klein", ratio="1:1", size="1024x1024", crop_width=512, crop_height=512, offset_x=0, offset_y=0, scale=1.0, rotation=0.0):
        """
        执行图像剪裁并生成预览
        面板版本：offset、scale和rotation由面板交互控制
        当input_mode为preset时，根据preset、ratio和size自动设置剪裁尺寸
        """
        # 验证并纠正无效的预设/比例/尺寸值
        if input_mode == "preset":
            # 检查预设是否有效
            if preset not in PRESET_CONFIGS:
                preset = "klein"
            
            # 检查比例是否对该预设有效，无效则使用第一个
            if preset in PRESET_CONFIGS:
                valid_ratios = list(PRESET_CONFIGS[preset].keys())
                if ratio not in valid_ratios:
                    ratio = valid_ratios[0] if valid_ratios else "1:1"
                
                # 检查尺寸是否对该预设+比例有效，无效则使用第一个
                if ratio in PRESET_CONFIGS[preset]:
                    valid_sizes = [f"{s['width']}x{s['height']}" for s in PRESET_CONFIGS[preset][ratio]]
                    if size not in valid_sizes:
                        size = valid_sizes[0] if valid_sizes else "1024x1024"
            
            # 如果是预设模式，根据选择更新剪裁尺寸
            if preset in PRESET_CONFIGS and ratio in PRESET_CONFIGS[preset]:
                # 解析尺寸字符串 "WIDTHxHEIGHT"
                size_parts = size.split('x')
                if len(size_parts) == 2:
                    crop_width = int(size_parts[0])
                    crop_height = int(size_parts[1])
        
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

        # 生成与当前图像同尺寸的二值掩码（白色为裁切框区域，黑色为其他区域）
        mask_image = self.create_mask(pil_image, start_x, start_y, crop_width, crop_height)
        
        # 转换回tensor
        cropped_tensor = self.pil_to_tensor(cropped_image)
        preview_tensor = self.pil_to_tensor(preview_image)
        mask_tensor = self.pil_mask_to_tensor(mask_image)
        
        return (cropped_tensor, preview_tensor, mask_tensor)
    
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
    
    def create_mask(self, image, start_x, start_y, crop_width, crop_height):
        """
        根据剪裁区域生成二值掩码：
        - 掩码尺寸等于当前图像尺寸（旋转/缩放后）
        - 掩码中裁切框所在区域为 255，其余为 0
        """
        img_width, img_height = image.size

        # 初始化与图像同尺寸的全黑掩码
        mask = Image.new('L', (img_width, img_height), 0)

        # 计算裁切框与图像的交集区域
        crop_from_x = max(0, start_x)
        crop_from_y = max(0, start_y)
        crop_to_x = min(img_width, start_x + crop_width)
        crop_to_y = min(img_height, start_y + crop_height)

        if crop_to_x > crop_from_x and crop_to_y > crop_from_y:
            draw = ImageDraw.Draw(mask)
            draw.rectangle(
                [crop_from_x, crop_from_y, crop_to_x, crop_to_y],
                fill=255
            )

        return mask
    
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

    def pil_mask_to_tensor(self, pil_mask):
        """将单通道掩码 PIL 转为 ComfyUI 的 MASK（[1, H, W]，0-1）"""
        if pil_mask.mode != 'L':
            pil_mask = pil_mask.convert('L')
        numpy_mask = np.array(pil_mask).astype(np.float32) / 255.0
        tensor = torch.from_numpy(numpy_mask)  # [H, W]
        tensor = tensor.unsqueeze(0)           # [1, H, W]
        return tensor


# 节点映射
NODE_CLASS_MAPPINGS = {
    "InteractiveCropWithPanel": InteractiveCropWithPanel,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "InteractiveCropWithPanel": "🔵BB交互式剪裁",
}
