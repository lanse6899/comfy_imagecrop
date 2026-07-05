import torch
import numpy as np
from PIL import Image
import json

class DepthAdjustNode:
    """
    深度图明暗调整节点
    根据深度图调整图像的近处和远处明暗程度
    输入:
        image: 原图 (IMAGE)
        depth_map: 深度图 (IMAGE) - 白色=近处，黑色=远处
    参数:
        dark_position: 暗部位置 ("near"=近处, "far"=远处)
        dark_intensity: 暗部强度 (-100 到 100)
        dark_range: 暗部范围 (5% 到 100%)
        dark_feather: 暗部羽化 (0 到 50)
        light_position: 亮部位置 ("near"=近处, "far"=远处)
        light_intensity: 亮部强度 (-100 到 100)
        light_range: 亮部范围 (5% 到 100%)
        light_feather: 亮部羽化 (0 到 50)
    输出:
        image: 处理后的图像
    """

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "image": ("IMAGE",),
                "depth_map": ("IMAGE",),
                "dark_position": (["near", "far"], {"default": "near"}),
                "dark_intensity": ("INT", {"default": -30, "min": -100, "max": 100, "step": 1}),
                "dark_range": ("INT", {"default": 50, "min": 5, "max": 100, "step": 1}),
                "dark_feather": ("INT", {"default": 20, "min": 0, "max": 50, "step": 1}),
                "light_position": (["near", "far"], {"default": "far"}),
                "light_intensity": ("INT", {"default": 40, "min": -100, "max": 100, "step": 1}),
                "light_range": ("INT", {"default": 50, "min": 5, "max": 100, "step": 1}),
                "light_feather": ("INT", {"default": 20, "min": 0, "max": 50, "step": 1}),
            }
        }

    RETURN_TYPES = ("IMAGE",)
    RETURN_NAMES = ("image",)
    FUNCTION = "adjust_depth"
    CATEGORY = "🔵BB image crop"

    def adjust_depth(self, image, depth_map,
                     dark_position, dark_intensity, dark_range, dark_feather,
                     light_position, light_intensity, light_range, light_feather):
        """
        根据深度图调整图像明暗
        """
        # 转换 tensor 到 PIL
        if len(image.shape) == 4:
            image_tensor = image[0]
        else:
            image_tensor = image

        if len(depth_map.shape) == 4:
            depth_tensor = depth_map[0]
        else:
            depth_tensor = depth_map

        # 转换为 PIL 图像
        image_pil = self.tensor_to_pil(image_tensor)
        depth_pil = self.tensor_to_pil(depth_tensor)

        # 确保深度图与原图尺寸一致
        if depth_pil.size != image_pil.size:
            depth_pil = depth_pil.resize(image_pil.size, Image.Resampling.LANCZOS)

        # 提取深度数据
        depth_array = np.array(depth_pil)
        if len(depth_array.shape) == 3:
            # 使用绿色通道或亮度作为深度值
            depth_data = np.mean(depth_array, axis=2)
        else:
            depth_data = depth_array.astype(np.float32)

        # 归一化到 0-1
        depth_data = depth_data / 255.0

        # 获取图像尺寸
        height, width = depth_data.shape

        # 转换为 numpy 数组处理
        image_array = np.array(image_pil).astype(np.float32) / 255.0

        # 应用暗部效果
        if dark_intensity != 0 and dark_range >= 5:
            image_array = self.apply_adjustment(
                image_array, depth_data,
                dark_position, dark_intensity, dark_range, dark_feather,
                width, height
            )

        # 应用亮部效果
        if light_intensity != 0 and light_range >= 5:
            image_array = self.apply_adjustment(
                image_array, depth_data,
                light_position, light_intensity, light_range, light_feather,
                width, height
            )

        # 确保值在 0-1 范围内
        image_array = np.clip(image_array, 0, 1)

        # 转换回 tensor
        result_tensor = torch.from_numpy(image_array).float()
        if len(result_tensor.shape) == 3:
            result_tensor = result_tensor.unsqueeze(0)

        return (result_tensor,)

    def apply_adjustment(self, image_array, depth_data, position, intensity, range_val, feather, width, height):
        """
        应用明暗调整
        """
        range_percent = range_val / 100.0
        feather_factor = feather / 50.0

        result = image_array.copy()

        for y in range(height):
            for x in range(width):
                depth = depth_data[y, x]
                mask = 0.0

                if position == "near":
                    # 近处 = 深度值大（白色=近处）
                    if depth > (1 - range_percent):
                        mask = (depth - (1 - range_percent)) / range_percent
                else:
                    # 远处 = 深度值小（黑色=远处）
                    if depth < range_percent:
                        mask = 1.0 - (depth / range_percent)

                # 应用羽化
                if feather_factor > 0 and mask > 0:
                    mask = min(1.0, mask / (1.0 - feather_factor * 0.5 + feather_factor * 0.5 * mask))

                if mask > 0.01:
                    factor = 1.0 + (intensity / 100.0) * mask
                    # 应用到每个通道
                    for c in range(3):
                        result[y, x, c] = min(1.0, max(0.0, result[y, x, c] * factor))

        return result

    def tensor_to_pil(self, tensor):
        """将 tensor 转换为 PIL 图像"""
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


# 节点映射
NODE_CLASS_MAPPINGS = {
    "DepthAdjustNode": DepthAdjustNode,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "DepthAdjustNode": "🔵BB深度图明暗调整",
}
