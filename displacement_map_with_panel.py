import torch
import numpy as np
from PIL import Image, ImageDraw, ImageFont
import torch.nn.functional as F

class DisplacementMapWithPanel:
    """
    带交互面板的置换贴图节点
    基于深度图的置换贴图，类似Photoshop的置换功能，让贴图贴合瓶子表面
    """
    
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "texture": ("IMAGE",),  # 要贴的纹理图
                "displacement_map": ("IMAGE",),  # 深度图/置换图
                "strength": ("FLOAT", {
                    "default": 10.0,
                    "min": 0.0,
                    "max": 100.0,
                    "step": 0.1
                }),
                "horizontal_scale": ("FLOAT", {
                    "default": 1.0,
                    "min": -2.0,
                    "max": 2.0,
                    "step": 0.1
                }),
                "vertical_scale": ("FLOAT", {
                    "default": 1.0,
                    "min": -2.0,
                    "max": 2.0,
                    "step": 0.1
                }),
                "blur_radius": ("INT", {
                    "default": 0,
                    "min": 0,
                    "max": 20,
                    "step": 1
                }),
                "texture_offset_x": ("INT", {
                    "default": 0,
                    "min": -4096,
                    "max": 4096,
                    "step": 1,
                    "display": "hidden"  # 隐藏显示，由面板控制
                }),
                "texture_offset_y": ("INT", {
                    "default": 0,
                    "min": -4096,
                    "max": 4096,
                    "step": 1,
                    "display": "hidden"  # 隐藏显示，由面板控制
                }),
                "texture_scale": ("FLOAT", {
                    "default": 1.0,
                    "min": 0.1,
                    "max": 5.0,
                    "step": 0.01,
                    "display": "hidden"  # 隐藏显示，由面板控制
                }),
                "texture_rotation": ("FLOAT", {
                    "default": 0.0,
                    "min": -180.0,
                    "max": 180.0,
                    "step": 0.1,
                    "display": "hidden"  # 隐藏显示，由面板控制
                }),
                "texture_width": ("INT", {
                    "default": 0,
                    "min": 0,
                    "max": 8192,
                    "step": 1,
                    "display": "hidden"  # 0表示使用原始宽度
                }),
                "texture_height": ("INT", {
                    "default": 0,
                    "min": 0,
                    "max": 8192,
                    "step": 1,
                    "display": "hidden"  # 0表示使用原始高度
                }),
            },
            "optional": {
                "background": ("IMAGE",),  # 背景图（瓶子），可选
                "blend_mode": ([
                    "normal",           # 正常
                    "multiply",         # 正片叠底
                    "screen",           # 滤色
                    "overlay",          # 叠加
                    "soft_light",       # 柔光
                    "hard_light",       # 强光
                    "color_dodge",      # 颜色减淡
                    "color_burn",       # 颜色加深
                    "darken",           # 变暗
                    "lighten",          # 变亮
                    "difference",        # 差值
                    "exclusion",         # 排除
                    "linear_burn",       # 线性加深
                    "linear_dodge",      # 线性减淡（添加）
                    "vivid_light",      # 亮光
                    "linear_light",      # 线性光
                    "pin_light",        # 点光
                    "hard_mix",         # 实色混合
                ], {
                    "default": "normal"
                }),
                "opacity": ("FLOAT", {
                    "default": 1.0,
                    "min": 0.0,
                    "max": 1.0,
                    "step": 0.01
                }),
                "protect_highlights": ("BOOLEAN", {
                    "default": True
                }),
                "highlight_threshold": ("FLOAT", {
                    "default": 0.7,
                    "min": 0.0,
                    "max": 1.0,
                    "step": 0.01
                }),
                "highlight_range": ("FLOAT", {
                    "default": 0.2,
                    "min": 0.0,
                    "max": 1.0,
                    "step": 0.01
                }),
                "highlight_strength": ("FLOAT", {
                    "default": 0.5,
                    "min": 0.0,
                    "max": 1.0,
                    "step": 0.01
                }),
                "highlight_blend_mode": ([
                    "normal", "multiply", "screen", "overlay", "soft_light", "hard_light",
                    "color_dodge", "color_burn", "darken", "lighten", "difference", "exclusion",
                    "linear_burn", "linear_dodge", "vivid_light", "linear_light", "pin_light", "hard_mix",
                ], {
                    "default": "soft_light"
                }),
                "protect_shadows": ("BOOLEAN", {
                    "default": True
                }),
                "shadow_threshold": ("FLOAT", {
                    "default": 0.3,
                    "min": 0.0,
                    "max": 1.0,
                    "step": 0.01
                }),
                "shadow_range": ("FLOAT", {
                    "default": 0.2,
                    "min": 0.0,
                    "max": 1.0,
                    "step": 0.01
                }),
                "shadow_strength": ("FLOAT", {
                    "default": 0.5,
                    "min": 0.0,
                    "max": 1.0,
                    "step": 0.01
                }),
                "shadow_blend_mode": ([
                    "normal", "multiply", "screen", "overlay", "soft_light", "hard_light",
                    "color_dodge", "color_burn", "darken", "lighten", "difference", "exclusion",
                    "linear_burn", "linear_dodge", "vivid_light", "linear_light", "pin_light", "hard_mix",
                ], {
                    "default": "multiply"
                }),
            }
        }
    
    RETURN_TYPES = ("IMAGE", "IMAGE")
    RETURN_NAMES = ("result_image", "preview_image")
    FUNCTION = "apply_displacement"
    CATEGORY = "🔵BB image crop"
    
    def apply_displacement(self, texture, displacement_map, strength, horizontal_scale, vertical_scale, blur_radius, 
                          texture_offset_x=0, texture_offset_y=0, texture_scale=1.0, texture_rotation=0.0,
                          texture_width=0, texture_height=0,
                          background=None, blend_mode="normal", opacity=1.0,
                          protect_highlights=True, highlight_threshold=0.7, highlight_range=0.2, highlight_strength=0.5,
                          highlight_blend_mode="soft_light",
                          protect_shadows=True, shadow_threshold=0.3, shadow_range=0.2, shadow_strength=0.5,
                          shadow_blend_mode="multiply"):
        """
        应用置换贴图，将纹理贴到表面
        
        Args:
            texture: 要贴的纹理图 (B, H, W, C)
            displacement_map: 深度图/置换图 (B, H, W, C)
            strength: 置换强度
            horizontal_scale: 水平方向缩放
            vertical_scale: 垂直方向缩放
            blur_radius: 模糊半径（用于平滑置换）
            background: 背景图（瓶子），可选
            blend_mode: 混合模式
            opacity: 不透明度
        """
        # 转换为tensor格式 (B, C, H, W)
        texture_tensor = texture.permute(0, 3, 1, 2).float()
        disp_tensor = displacement_map.permute(0, 3, 1, 2).float()
        
        # 保存原始纹理图尺寸
        original_tex_h, original_tex_w = texture_tensor.shape[2], texture_tensor.shape[3]
        
        # 确定目标尺寸（优先使用指定的宽度和高度）
        if texture_width > 0 and texture_height > 0:
            # 使用指定的宽度和高度
            target_h = texture_height
            target_w = texture_width
        elif texture_scale != 1.0:
            # 使用缩放比例
            target_h = int(original_tex_h * texture_scale)
            target_w = int(original_tex_w * texture_scale)
        else:
            # 保持原始尺寸
            target_h = original_tex_h
            target_w = original_tex_w
        
        # 如果尺寸发生变化，调整纹理图
        if target_h != original_tex_h or target_w != original_tex_w:
            texture_tensor = F.interpolate(
                texture_tensor,
                size=(target_h, target_w),
                mode='bilinear',
                align_corners=False
            )
        
        # 确定输出尺寸（优先使用背景图尺寸）
        if background is not None:
            bg_tensor = background.permute(0, 3, 1, 2).float()
            target_height, target_width = bg_tensor.shape[2], bg_tensor.shape[3]
        else:
            # 没有背景图时，使用缩放后的纹理图尺寸
            target_height, target_width = texture_tensor.shape[2], texture_tensor.shape[3]
            bg_tensor = None
        
        # 确保置换图尺寸与纹理图尺寸一致（使用缩放后的纹理图尺寸）
        tex_h, tex_w = texture_tensor.shape[2], texture_tensor.shape[3]
        if disp_tensor.shape[2:] != (tex_h, tex_w):
            # 调整置换图尺寸到纹理图尺寸
            disp_tensor = F.interpolate(
                disp_tensor, 
                size=(tex_h, tex_w),
                mode='bilinear',
                align_corners=False
            )
        
        # 转换为灰度图（取RGB平均值）
        if disp_tensor.shape[1] == 3:
            disp_gray = disp_tensor.mean(dim=1, keepdim=True)
        else:
            disp_gray = disp_tensor[:, 0:1, :, :]
        
        # 归一化到[-1, 1]范围
        disp_gray = (disp_gray - 0.5) * 2.0
        
        # 应用模糊（可选）
        if blur_radius > 0:
            kernel_size = blur_radius * 2 + 1
            # 创建高斯核
            sigma = blur_radius / 3.0
            x = torch.arange(kernel_size, dtype=torch.float32) - kernel_size // 2
            gaussian = torch.exp(-(x ** 2) / (2 * sigma ** 2))
            gaussian = gaussian / gaussian.sum()
            gaussian = gaussian.view(1, 1, 1, kernel_size).to(disp_gray.device)
            
            # 水平和垂直方向模糊
            disp_gray = F.conv2d(disp_gray, gaussian, padding=(0, kernel_size // 2))
            disp_gray = F.conv2d(disp_gray, gaussian.transpose(-1, -2), padding=(kernel_size // 2, 0))
        
        # 计算位移量
        batch_size, channels, height, width = texture_tensor.shape
        
        # 创建坐标网格（兼容不同PyTorch版本）
        try:
            y_coords, x_coords = torch.meshgrid(
                torch.arange(height, dtype=torch.float32, device=texture_tensor.device),
                torch.arange(width, dtype=torch.float32, device=texture_tensor.device),
                indexing='ij'
            )
        except TypeError:
            # 旧版本PyTorch不支持indexing参数
            y_coords, x_coords = torch.meshgrid(
                torch.arange(height, dtype=torch.float32, device=texture_tensor.device),
                torch.arange(width, dtype=torch.float32, device=texture_tensor.device)
            )
            # 交换以匹配ij索引
            y_coords, x_coords = y_coords, x_coords
        
        # 扩展维度以匹配batch
        y_coords = y_coords.unsqueeze(0).expand(batch_size, -1, -1)
        x_coords = x_coords.unsqueeze(0).expand(batch_size, -1, -1)
        
        # 计算位移
        # 置换图的值：白色(1.0)表示向前，黑色(-1.0)表示向后
        # 对于X方向：正值向右，负值向左
        # 对于Y方向：正值向下，负值向上
        
        disp_x = disp_gray.squeeze(1) * strength * horizontal_scale
        disp_y = disp_gray.squeeze(1) * strength * vertical_scale
        
        # 应用位移
        new_x = x_coords + disp_x
        new_y = y_coords + disp_y
        
        # 归一化坐标到[-1, 1]范围（grid_sample要求）
        new_x_norm = (new_x / (width - 1)) * 2.0 - 1.0
        new_y_norm = (new_y / (height - 1)) * 2.0 - 1.0
        
        # 创建采样网格
        grid = torch.stack([new_x_norm, new_y_norm], dim=-1)
        
        # 使用grid_sample进行采样（双线性插值）
        warped_texture = F.grid_sample(
            texture_tensor,
            grid,
            mode='bilinear',
            padding_mode='border',
            align_corners=False
        )
        
        # 转换回 (B, H, W, C) 格式
        warped_texture = warped_texture.permute(0, 2, 3, 1)
        
        # 应用纹理图旋转（如果有旋转）
        if texture_rotation != 0.0:
            # 将tensor转换为PIL图像进行旋转
            warped_pil = self.tensor_to_pil(warped_texture[0])
            rotated_pil = warped_pil.rotate(-texture_rotation, expand=False, resample=Image.Resampling.BICUBIC, fillcolor=(0, 0, 0))
            warped_texture = self.pil_to_tensor(rotated_pil)
        
        # 应用纹理图偏移（如果有背景图）
        if bg_tensor is not None:
            # 创建与背景图相同尺寸的纹理图层
            offset_texture = torch.zeros_like(bg_tensor.permute(0, 2, 3, 1))
            bg_h, bg_w = offset_texture.shape[1], offset_texture.shape[2]
            tex_h, tex_w = warped_texture.shape[1], warped_texture.shape[2]
            
            # 计算粘贴位置（居中 + 偏移）
            center_x = bg_w // 2
            center_y = bg_h // 2
            tex_center_x = tex_w // 2
            tex_center_y = tex_h // 2
            
            # 计算粘贴的起始位置
            start_x = center_x - tex_center_x + texture_offset_x
            start_y = center_y - tex_center_y + texture_offset_y
            
            # 计算可见区域
            visible_start_x = max(0, start_x)
            visible_start_y = max(0, start_y)
            visible_end_x = min(bg_w, start_x + tex_w)
            visible_end_y = min(bg_h, start_y + tex_h)
            
            # 计算从纹理图中取的部分
            tex_start_x = visible_start_x - start_x
            tex_start_y = visible_start_y - start_y
            tex_end_x = tex_start_x + (visible_end_x - visible_start_x)
            tex_end_y = tex_start_y + (visible_end_y - visible_start_y)
            
            if visible_end_x > visible_start_x and visible_end_y > visible_start_y:
                # 粘贴纹理图到偏移位置
                offset_texture[:, visible_start_y:visible_end_y, visible_start_x:visible_end_x, :] = \
                    warped_texture[:, tex_start_y:tex_end_y, tex_start_x:tex_end_x, :]
            warped_texture = offset_texture
        
        # 确保值在[0, 1]范围内
        warped_texture = torch.clamp(warped_texture, 0.0, 1.0)
        
        # 如果有背景图，进行混合
        if bg_tensor is not None:
            background = bg_tensor.permute(0, 2, 3, 1)
            result = self._blend_images(
                background, warped_texture, blend_mode, opacity,
                protect_highlights, highlight_threshold, highlight_range, highlight_strength, highlight_blend_mode,
                protect_shadows, shadow_threshold, shadow_range, shadow_strength, shadow_blend_mode
            )
        else:
            result = warped_texture
        
        # 生成预览图像
        result_pil = self.tensor_to_pil(result[0])
        if len(displacement_map.shape) == 4:
            disp_pil = self.tensor_to_pil(displacement_map[0])
        else:
            disp_pil = self.tensor_to_pil(displacement_map)
        
        preview_image = self.create_preview(
            result_pil, disp_pil, strength, horizontal_scale, vertical_scale
        )
        
        preview_tensor = self.pil_to_tensor(preview_image)
        
        return (result, preview_tensor)
    
    def create_preview(self, result_image, displacement_map, strength, horizontal_scale, vertical_scale):
        """
        创建预览图像，显示置换效果和置换图信息
        """
        preview = result_image.copy().convert('RGB')
        draw = ImageDraw.Draw(preview)
        
        # 在预览图上叠加显示置换图（半透明）
        disp_overlay = displacement_map.convert('RGB')
        if disp_overlay.size != preview.size:
            disp_overlay = disp_overlay.resize(preview.size, Image.Resampling.BILINEAR)
        
        # 创建半透明叠加
        overlay = Image.blend(preview, disp_overlay, 0.3)
        preview = overlay
        
        # 绘制信息文本
        try:
            font = ImageFont.truetype("arial.ttf", 16)
        except:
            font = None
        
        info_text = [
            f"强度: {strength:.1f}",
            f"水平: {horizontal_scale:.2f}",
            f"垂直: {vertical_scale:.2f}"
        ]
        
        # 绘制信息背景
        text_height = len(info_text) * 20 + 10
        draw.rectangle([10, 10, 200, 10 + text_height], fill=(0, 0, 0, 180))
        
        # 绘制文本
        for i, text in enumerate(info_text):
            draw.text((20, 15 + i * 20), text, fill=(255, 255, 0), font=font)
        
        return preview
    
    def _blend_images(self, bg, fg, blend_mode, opacity,
                     protect_highlights=True, highlight_threshold=0.7, highlight_range=0.2, highlight_strength=0.5,
                     highlight_blend_mode="soft_light",
                     protect_shadows=True, shadow_threshold=0.3, shadow_range=0.2, shadow_strength=0.5,
                     shadow_blend_mode="multiply"):
        """
        混合背景和前景图像，参考Photoshop混合模式算法
        bg: 背景层（瓶子）
        fg: 前景层（贴图）
        支持高光和阴影区域使用不同的混合模式
        支持混合颜色带（Blend If）功能
        """
        # 确保batch size一致
        if bg.shape[0] != fg.shape[0]:
            min_batch = min(bg.shape[0], fg.shape[0])
            bg = bg[:min_batch]
            fg = fg[:min_batch]
        
        # 计算高光和阴影遮罩
        highlight_mask, shadow_mask = self._calculate_protection_masks(
            bg, protect_highlights, highlight_threshold, highlight_range, highlight_strength,
            protect_shadows, shadow_threshold, shadow_range, shadow_strength
        )
        
        # 计算不同区域的混合结果
        # 中间区域使用默认混合模式
        blended_mid = self._apply_blend_mode(bg, fg, blend_mode)
        
        # 高光区域使用高光混合模式
        blended_highlight = self._apply_blend_mode(bg, fg, highlight_blend_mode) if protect_highlights else blended_mid
        
        # 阴影区域使用阴影混合模式
        blended_shadow = self._apply_blend_mode(bg, fg, shadow_blend_mode) if protect_shadows else blended_mid
        
        # 应用不透明度
        result_mid = blended_mid * opacity + bg * (1 - opacity)
        result_highlight = blended_highlight * opacity + bg * (1 - opacity) if protect_highlights else result_mid
        result_shadow = blended_shadow * opacity + bg * (1 - opacity) if protect_shadows else result_mid
        
        # 使用遮罩进行区域混合
        # highlight_mask和shadow_mask的值表示该区域的权重
        # 中间区域 = 1 - highlight_mask - shadow_mask（归一化后）
        
        # 归一化遮罩，确保总和不超过1
        total_mask = highlight_mask + shadow_mask
        total_mask = torch.clamp(total_mask, 0.0, 1.0)
        
        # 计算中间区域的权重
        mid_mask = 1.0 - total_mask
        
        # 混合三个区域
        result = (result_mid * mid_mask + 
                 result_highlight * highlight_mask + 
                 result_shadow * shadow_mask)
        
        return torch.clamp(result, 0.0, 1.0)
    
    def _calculate_protection_masks(self, bg, protect_highlights, highlight_threshold, highlight_range, highlight_strength,
                                    protect_shadows, shadow_threshold, shadow_range, shadow_strength):
        """
        计算高光和阴影保护遮罩
        返回(highlight_mask, shadow_mask)：遮罩值表示该区域的权重（0-1）
        """
        # 计算亮度（RGB转灰度）
        # 使用标准权重：0.299*R + 0.587*G + 0.114*B
        luminance = 0.299 * bg[:, :, :, 0] + 0.587 * bg[:, :, :, 1] + 0.114 * bg[:, :, :, 2]
        luminance = luminance.unsqueeze(-1)  # (B, H, W, 1)
        
        # 初始化遮罩
        highlight_mask = torch.zeros_like(luminance)
        shadow_mask = torch.zeros_like(luminance)
        
        # 高光遮罩
        if protect_highlights:
            # 高光区域：亮度 > highlight_threshold
            highlight_start = highlight_threshold
            highlight_end = highlight_threshold + highlight_range
            
            # 创建平滑过渡
            highlight_weight = torch.clamp((luminance - highlight_start) / (highlight_end - highlight_start + 1e-7), 0, 1)
            # 只保护超过阈值的高光区域
            highlight_weight = torch.where(luminance > highlight_threshold, highlight_weight, torch.zeros_like(highlight_weight))
            # 应用强度
            highlight_mask = highlight_weight * highlight_strength
        
        # 阴影遮罩
        if protect_shadows:
            # 阴影区域：亮度 < shadow_threshold
            shadow_end = shadow_threshold
            shadow_start = shadow_threshold - shadow_range
            
            # 创建平滑过渡
            shadow_weight = torch.clamp((shadow_end - luminance) / (shadow_end - shadow_start + 1e-7), 0, 1)
            # 只保护低于阈值的阴影区域
            shadow_weight = torch.where(luminance < shadow_threshold, shadow_weight, torch.zeros_like(shadow_weight))
            # 应用强度
            shadow_mask = shadow_weight * shadow_strength
        
        # 限制在[0, 1]范围内
        highlight_mask = torch.clamp(highlight_mask, 0.0, 1.0)
        shadow_mask = torch.clamp(shadow_mask, 0.0, 1.0)
        
        # 扩展到RGB通道
        highlight_mask = highlight_mask.expand(-1, -1, -1, bg.shape[-1])
        shadow_mask = shadow_mask.expand(-1, -1, -1, bg.shape[-1])
        
        return highlight_mask, shadow_mask
    
    def _apply_blend_mode(self, bg, fg, blend_mode):
        """
        应用指定的混合模式
        返回混合后的结果
        """
        if blend_mode == "normal":
            return fg
        elif blend_mode == "multiply":
            return bg * fg
        elif blend_mode == "screen":
            return 1 - (1 - bg) * (1 - fg)
        elif blend_mode == "overlay":
            mask = bg < 0.5
            return torch.where(mask, 2 * bg * fg, 1 - 2 * (1 - bg) * (1 - fg))
        elif blend_mode == "soft_light":
            mask = fg < 0.5
            return torch.where(
                mask,
                2 * bg * fg + bg * bg * (1 - 2 * fg),
                torch.sqrt(bg) * (2 * fg - 1) + 2 * bg * (1 - fg)
            )
        elif blend_mode == "hard_light":
            mask = fg < 0.5
            return torch.where(mask, 2 * bg * fg, 1 - 2 * (1 - bg) * (1 - fg))
        elif blend_mode == "color_dodge":
            epsilon = 1e-7
            return torch.where(
                fg >= 1.0,
                torch.ones_like(bg),
                torch.clamp(bg / (1 - fg + epsilon), 0, 1)
            )
        elif blend_mode == "color_burn":
            epsilon = 1e-7
            return torch.where(
                fg <= 0.0,
                torch.zeros_like(bg),
                torch.clamp(1 - (1 - bg) / (fg + epsilon), 0, 1)
            )
        elif blend_mode == "darken":
            return torch.minimum(bg, fg)
        elif blend_mode == "lighten":
            return torch.maximum(bg, fg)
        elif blend_mode == "difference":
            return torch.abs(bg - fg)
        elif blend_mode == "exclusion":
            return bg + fg - 2 * bg * fg
        elif blend_mode == "linear_burn":
            return torch.clamp(bg + fg - 1, 0, 1)
        elif blend_mode == "linear_dodge":
            return torch.clamp(bg + fg, 0, 1)
        elif blend_mode == "vivid_light":
            mask = fg < 0.5
            epsilon = 1e-7
            color_burn = torch.where(
                fg <= 0.0,
                torch.zeros_like(bg),
                torch.clamp(1 - (1 - bg) / (fg + epsilon), 0, 1)
            )
            color_dodge = torch.where(
                fg >= 1.0,
                torch.ones_like(bg),
                torch.clamp(bg / (1 - fg + epsilon), 0, 1)
            )
            return torch.where(mask, color_burn, color_dodge)
        elif blend_mode == "linear_light":
            return torch.clamp(bg + 2 * fg - 1, 0, 1)
        elif blend_mode == "pin_light":
            mask = fg < 0.5
            darken_result = torch.minimum(bg, 2 * fg)
            lighten_result = torch.maximum(bg, 2 * (fg - 0.5))
            return torch.where(mask, darken_result, lighten_result)
        elif blend_mode == "hard_mix":
            mask = bg < 0.5
            overlay_result = torch.where(mask, 2 * bg * fg, 1 - 2 * (1 - bg) * (1 - fg))
            return torch.where(overlay_result < 0.5, torch.zeros_like(bg), torch.ones_like(bg))
        else:
            return fg
    
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
    "DisplacementMapWithPanel": DisplacementMapWithPanel,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "DisplacementMapWithPanel": "🔵BB贴图",
}

