"""
🔵BB 提取图像（单个0多个0-X） - ComfyUI自定义节点
功能：从图像批次中提取单个图像（索引0）或多个图像（索引范围0-X），输出为新的图像批次

使用示例：
1. 提取特定索引: "0,2,4"
2. 提取范围: "0-3,5"
3. 随机选择: "random:3"
4. 负索引: "-1,-2" (最后两个图像)
"""

import torch
import numpy as np
from typing import List, Tuple, Dict, Any


class BatchGetImages:
    """
    🔵BB 提取图像（单个0多个0-X） - 从图像批次中提取单个或多个图像，输出为新的图像批次
    ComfyUI自定义节点
    """

    @classmethod
    def INPUT_TYPES(cls) -> Dict[str, Dict[str, Any]]:
        return {
            "required": {
                "images": ("IMAGE",),  # 图像批次输入
                "indices": ("STRING", {  # 索引字符串，格式如 "0,2,4" 或 "0-3,5"
                    "default": "0",
                    "multiline": False,
                    "placeholder": "索引，如: 0,2,4 或 0-3,5 或 random:3"
                }),
            },
            "optional": {
                "keep_order": ("BOOLEAN", {  # 是否保持原始顺序
                    "default": True,
                    "label": "保持顺序"
                }),
                "remove_duplicates": ("BOOLEAN", {  # 是否移除重复索引
                    "default": True,
                    "label": "移除重复"
                }),
                "allow_negative": ("BOOLEAN", {  # 是否允许负索引
                    "default": True,
                    "label": "允许负索引"
                }),
            }
        }

    RETURN_TYPES = ("IMAGE",)
    RETURN_NAMES = ("images",)
    FUNCTION = "extract_images"
    CATEGORY = "🔵BB image crop"  # 更改为🔵BB image crop目录

    def extract_images(self, images: torch.Tensor, indices: str, keep_order: bool = True,
                      remove_duplicates: bool = True, allow_negative: bool = True) -> Tuple[torch.Tensor]:
        """
        从图像批次中提取指定索引的图像

        Args:
            images: 图像批次张量，形状为 [batch_size, height, width, channels]
            indices: 索引字符串，支持格式：
                    - 单个索引: "0"
                    - 多个索引: "0,2,4"
                    - 范围索引: "0-3"
                    - 混合: "0,2-4,6"
                    - 随机选择: "random:3" (随机选择3个图像)
            keep_order: 是否保持提取顺序与输入顺序一致
            remove_duplicates: 是否移除重复索引
            allow_negative: 是否允许负索引（-1表示最后一个）

        Returns:
            提取的图像批次
        """
        if not isinstance(images, torch.Tensor):
            raise TypeError("输入必须是torch.Tensor类型的图像批次")

        batch_size = images.shape[0]
        if batch_size == 0:
            empty_tensor = torch.empty(0, *images.shape[1:], dtype=images.dtype, device=images.device)
            return (empty_tensor,)

        # 解析索引字符串
        try:
            index_list = self._parse_indices(indices, batch_size, allow_negative)
        except ValueError as e:
            raise ValueError(f"索引解析错误: {e}")

        if not index_list:
            # 如果没有有效索引，返回空的批次
            empty_tensor = torch.empty(0, *images.shape[1:], dtype=images.dtype, device=images.device)
            return (empty_tensor,)

        # 处理重复索引
        if remove_duplicates:
            index_list = list(dict.fromkeys(index_list))  # 保持顺序去重

        # 验证索引范围
        invalid_indices = [idx for idx in index_list if idx < 0 or idx >= batch_size]
        if invalid_indices:
            raise ValueError(f"索引超出范围: {invalid_indices}，批次大小为 {batch_size}")

        # 提取图像
        if keep_order:
            # 保持输入顺序
            selected_images = images[index_list]
        else:
            # 按索引排序
            sorted_indices = sorted(index_list)
            selected_images = images[sorted_indices]

        return (selected_images,)

    def _parse_indices(self, indices_str: str, max_batch_size: int, allow_negative: bool = True) -> List[int]:
        """
        解析索引字符串，支持多种格式

        支持格式：
        - 单个数字: "0"
        - 逗号分隔: "0,2,4"
        - 范围: "0-3" (包含0,1,2,3)
        - 混合: "0,2-4,6"
        - 随机选择: "random:3" (随机选择3个图像)
        - 负索引: "-1" (最后一个), "-2" (倒数第二个)

        Args:
            indices_str: 索引字符串
            max_batch_size: 最大批次大小，用于验证和负索引转换
            allow_negative: 是否允许负索引

        Returns:
            解析后的索引列表
        """
        if not indices_str.strip():
            return []

        indices_str = indices_str.strip()

        # 处理随机选择
        if indices_str.lower().startswith('random:'):
            try:
                count = int(indices_str[7:].strip())
                if count <= 0:
                    raise ValueError(f"随机选择数量必须大于0: {count}")
                if count > max_batch_size:
                    count = max_batch_size
                # 生成随机索引
                import random
                return random.sample(range(max_batch_size), count)
            except ValueError:
                raise ValueError(f"无效的随机选择格式: {indices_str}")

        indices = []  # 使用列表保持顺序

        # 按逗号分割
        parts = [part.strip() for part in indices_str.split(',') if part.strip()]

        for part in parts:
            if '-' in part:
                # 处理范围
                range_parts = [p.strip() for p in part.split('-')]
                if len(range_parts) != 2:
                    raise ValueError(f"无效的范围格式: {part}")

                try:
                    start = int(range_parts[0])
                    end = int(range_parts[1])
                except ValueError:
                    raise ValueError(f"范围必须是整数: {part}")

                # 处理负索引
                if allow_negative:
                    if start < 0:
                        start = max_batch_size + start
                    if end < 0:
                        end = max_batch_size + end

                if start > end:
                    raise ValueError(f"范围起始值不能大于结束值: {part}")

                # 添加范围内的所有索引
                indices.extend(range(start, end + 1))
            else:
                # 处理单个索引
                try:
                    idx = int(part)
                    # 处理负索引
                    if allow_negative and idx < 0:
                        idx = max_batch_size + idx
                    indices.append(idx)
                except ValueError:
                    raise ValueError(f"无效的索引格式: {part}")

        # 验证索引范围（只在允许负索引且转换后进行）
        if allow_negative:
            invalid_indices = [idx for idx in indices if idx < 0 or idx >= max_batch_size]
            if invalid_indices:
                raise ValueError(f"索引超出范围: {invalid_indices}，批次大小为 {max_batch_size}")

        return indices


# 节点注册
NODE_CLASS_MAPPINGS = {
    "BatchGetImages": BatchGetImages,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "BatchGetImages": "🔵BB 提取图像（单个0多个0-X）",
}
