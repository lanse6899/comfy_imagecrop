"""
Separate Masks - ComfyUI 自定义节点

功能：
- 将二值掩码上的连通区域拆分为若干独立掩码（connected components）。
- 根据参数 `components_per_batch` 将多个连通域合并成一个“批次掩码”输出。
- 支持按最小面积/最小宽高过滤小连通域。

安装：
将此文件保存为 `separate_masks.py` 到 ComfyUI 的 `custom_nodes` 目录，重启 ComfyUI。

使用说明（节点参数）：
- mask: 输入掩码（黑白/灰度）
- components_per_batch: 每个输出掩码包含的连通域数量（>=1）
- min_component_area: 最小连通域像素数，低于该值的连通域会被忽略
- min_component_width / min_component_height: 连通域最小宽/高阈值（像素）
"""
from PIL import Image
import numpy as np
from typing import List, Tuple
try:
	import torch
except Exception:
	torch = None

class SeparateMasks:
	@staticmethod
	def INPUT_TYPES():
		return {
			"required": {
				"mask": ("MASK",),
				"components_per_batch": ("INT", {"default": 1, "min": 1, "max": 64}),
				"min_component_area": ("INT", {"default": 10, "min": 0}),
				"min_component_width": ("INT", {"default": 1, "min": 1}),
				"min_component_height": ("INT", {"default": 1, "min": 1}),
			}
		}

	RETURN_TYPES = ("MASK",)
	FUNCTION = "split_mask"
	CATEGORY = "🔵BB image crop"

	def _to_binary_array(self, mask_image) -> np.ndarray:
		"""
		将输入掩码转换成 2D 二值 numpy 数组（dtype=uint8，0/1）
		支持的输入类型：PIL.Image, numpy array, torch.Tensor, tuple/list 包含上述类型，以及对象提供 to_pil/to_numpy/numpy 方法。
		"""
		if mask_image is None:
			raise ValueError("mask is None")

		# 如果是列表/元组，优先尝试第一个元素（常见于 ComfyUI 传入单元素列表/元组）
		if isinstance(mask_image, (list, tuple)) and len(mask_image) > 0:
			return self._to_binary_array(mask_image[0])

		# torch Tensor 支持
		if torch is not None and isinstance(mask_image, torch.Tensor):
			arr = mask_image.detach().cpu().numpy()
			# 处理 ComfyUI MASK 格式：如果是 (B, H, W) 格式，只取第一张
			if arr.ndim == 3 and arr.shape[0] > 1:
				arr = arr[0]  # 取批次中的第一张掩码
		else:
			arr = None

		# 如果对象提供 to_pil / to_numpy / numpy 接口，尝试调用
		if arr is None:
			if hasattr(mask_image, "to_pil") and callable(mask_image.to_pil):
				try:
					pil = mask_image.to_pil()
					pil = pil.convert("L")
					arr = np.array(pil)
				except Exception:
					arr = None
			elif hasattr(mask_image, "to_numpy") and callable(mask_image.to_numpy):
				try:
					arr = mask_image.to_numpy()
				except Exception:
					arr = None
			elif hasattr(mask_image, "numpy") and callable(mask_image.numpy):
				try:
					arr = mask_image.numpy()
				except Exception:
					arr = None

		# 直接支持 PIL.Image 和 numpy.ndarray
		if arr is None:
			if isinstance(mask_image, Image.Image):
				arr = np.array(mask_image.convert("L"))
			elif isinstance(mask_image, np.ndarray):
				arr = mask_image

		# 仍然无法解析则抛出明确错误，列出期望类型
		if arr is None:
			raise ValueError("Unsupported mask input type for SeparateMasks node; supported: PIL.Image, numpy.ndarray, torch.Tensor, or objects with to_pil/to_numpy/numpy. Got: %s" % type(mask_image))

		# 如果有通道，取第一通道/灰度
		if arr.ndim == 3:
			# 如果形状为 (C,H,W)，转为 (H,W,C)
			if arr.shape[0] in (1, 3, 4) and arr.shape[0] != arr.shape[2]:
				arr = np.transpose(arr, (1, 2, 0))
			arr = arr[..., 0]

		# 阈值：非零视为前景
		binary = (arr > 0).astype(np.uint8)
		return binary

	def _find_connected_components(self, binary: np.ndarray) -> List[np.ndarray]:
		"""
		基于4连通的栈式 flood fill 查找连通域。
		返回每个连通域的坐标数组 (N,2) 形式，坐标为 (y, x)。
		"""
		h, w = binary.shape
		visited = np.zeros_like(binary, dtype=bool)
		components: List[np.ndarray] = []

		for y in range(h):
			for x in range(w):
				if binary[y, x] and not visited[y, x]:
					stack = [(y, x)]
					visited[y, x] = True
					coords = []
					while stack:
						cy, cx = stack.pop()
						coords.append((cy, cx))
						# 四邻域
						if cy - 1 >= 0 and binary[cy - 1, cx] and not visited[cy - 1, cx]:
							visited[cy - 1, cx] = True
							stack.append((cy - 1, cx))
						if cy + 1 < h and binary[cy + 1, cx] and not visited[cy + 1, cx]:
							visited[cy + 1, cx] = True
							stack.append((cy + 1, cx))
						if cx - 1 >= 0 and binary[cy, cx - 1] and not visited[cy, cx - 1]:
							visited[cy, cx - 1] = True
							stack.append((cy, cx - 1))
						if cx + 1 < w and binary[cy, cx + 1] and not visited[cy, cx + 1]:
							visited[cy, cx + 1] = True
							stack.append((cy, cx + 1))
					if coords:
						components.append(np.array(coords, dtype=np.int32))
		return components

	def _component_to_mask(self, coords: np.ndarray, shape: Tuple[int, int]) -> np.ndarray:
		"""
		把连通域坐标转换成 uint8 掩码（0/255）
		"""
		h, w = shape
		mask = np.zeros((h, w), dtype=np.uint8)
		mask[coords[:, 0], coords[:, 1]] = 255
		return mask

	def split_mask(self, mask, components_per_batch: int = 1, min_component_area: int = 10, min_component_width: int = 1, min_component_height: int = 1):
		# 将输入转为二值数组
		binary = self._to_binary_array(mask)
		h, w = binary.shape

		# 找连通域
		components = self._find_connected_components(binary)

		# 过滤连通域并转换为单独掩码
		filtered_masks: List[np.ndarray] = []
		for coords in components:
			area = int(coords.shape[0])
			if area < int(min_component_area):
				continue
			min_y = int(coords[:, 0].min())
			max_y = int(coords[:, 0].max())
			min_x = int(coords[:, 1].min())
			max_x = int(coords[:, 1].max())
			width = max_x - min_x + 1
			height = max_y - min_y + 1
			if width < int(min_component_width) or height < int(min_component_height):
				continue
			mask_comp = self._component_to_mask(coords, (h, w))
			filtered_masks.append(mask_comp)

		# 如果没有有效连通域，返回单个空白掩码
		if len(filtered_masks) == 0:
			blank = np.zeros((h, w), dtype=np.uint8)
			# 转换为 torch.Tensor 格式，范围 [0, 1]
			if torch is not None:
				tensor_mask = torch.from_numpy(blank.astype(np.float32) / 255.0).unsqueeze(0)
				return (tensor_mask,)
			else:
				return (blank.astype(np.float32) / 255.0,)

		# 按 components_per_batch 合并成批次掩码
		batched_masks: List[np.ndarray] = []
		for i in range(0, len(filtered_masks), components_per_batch):
			batch = np.zeros((h, w), dtype=np.uint8)
			for comp_mask in filtered_masks[i:i + components_per_batch]:
				# 将像素合并（255 或运算）
				batch = np.where(comp_mask > 0, 255, batch).astype(np.uint8) | batch
			batched_masks.append(batch)

		# 转换为 torch.Tensor 格式，范围 [0, 1]
		if torch is not None:
			# 将所有批次堆叠成 (B, H, W) 格式
			masks_array = np.stack(batched_masks, axis=0).astype(np.float32) / 255.0
			tensor_masks = torch.from_numpy(masks_array)
			return (tensor_masks,)
		else:
			# 如果没有 torch，将第一个掩码作为 numpy 数组返回
			return (batched_masks[0].astype(np.float32) / 255.0,)



