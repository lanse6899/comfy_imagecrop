import torch
import numpy as np
from PIL import Image
import cv2
from typing import Dict, Any, Tuple

class ImageLUTNode:
    """
    ComfyUI节点：使用参考图像作为LUT处理原图
    基于色彩统计的方法实现颜色映射
    """

    @classmethod
    def INPUT_TYPES(cls) -> Dict[str, Dict[str, Any]]:
        return {
            "required": {
                "original_image": ("IMAGE",),  # 原图输入
                "reference_image": ("IMAGE",),  # 参考图输入
                "lut_strength": ("FLOAT", {
                    "default": 1.0,
                    "min": 0.0,
                    "max": 1.0,
                    "step": 0.1,
                    "display": "slider"
                }),  # LUT强度
                "color_bins": ("INT", {
                    "default": 32,
                    "min": 8,
                    "max": 256,
                    "step": 8,
                    "display": "slider"
                }),  # 颜色分箱数
            },
            "optional": {
                "blend_mode": (["replace", "overlay", "multiply", "screen"], {
                    "default": "replace"
                }),  # 混合模式
                "transfer_mode": (["lut_1d", "reinhard"], {
                    "default": "lut_1d"
                }),  # 颜色迁移模式：1D LUT 或 Reinhard (Lab)
            }
        }

    RETURN_TYPES = ("IMAGE",)
    RETURN_NAMES = ("processed_image",)
    FUNCTION = "apply_lut"
    CATEGORY = "🔵BB image crop"

    def __init__(self):
        self.device = torch.device("cuda" if torch.cuda.is_available() else "cpu")

    def tensor_to_numpy(self, tensor: torch.Tensor) -> np.ndarray:
        """将ComfyUI的tensor转换为numpy数组"""
        # ComfyUI的tensor格式是 [B, H, W, C]，值范围0-1
        if tensor.dim() == 4:  # batch处理
            return tensor.cpu().numpy()
        else:  # 单张图片
            return tensor.unsqueeze(0).cpu().numpy()

    def numpy_to_tensor(self, array: np.ndarray) -> torch.Tensor:
        """将numpy数组转换为ComfyUI的tensor格式"""
        if array.shape[-1] == 3:  # RGB图像
            # 确保值范围在0-1之间
            array = np.clip(array, 0, 1)
            return torch.from_numpy(array).to(self.device)
        else:
            raise ValueError("不支持的图像格式")

    def create_color_lut(self, reference_image: np.ndarray, bins: int = 32) -> np.ndarray:
        """
        从参考图像创建颜色查找表
        使用直方图均衡化原理创建色彩映射
        """
        # 将图像转换为0-255范围以便处理
        ref_img = (reference_image * 255).astype(np.uint8)

        # 检测参考图是否为灰度（低饱和度）
        # 为了鲁棒性：若输入是batch，则在所有图片上统计饱和度的平均值
        if ref_img.ndim == 4:
            # shape [B,H,W,3] -> 合并成一个大图用于计算饱和度
            ref_for_cv = ref_img.reshape(-1, ref_img.shape[2], ref_img.shape[3], 3)
            ref_for_cv = ref_for_cv.transpose(1, 0, 2, 3).reshape(ref_img.shape[1], -1, 3)
        else:
            ref_for_cv = ref_img

        hsv = cv2.cvtColor(ref_for_cv, cv2.COLOR_RGB2HSV)
        mean_saturation = np.mean(hsv[:, :, 1]) / 255.0

        # 先生成亮度LUT（用于灰度映射或作为参考）
        # 将所有像素的亮度展开，交给_create_channel_lut处理（它会flatten）
        lum = (0.2126 * ref_img[..., 0] + 0.7152 * ref_img[..., 1] + 0.0722 * ref_img[..., 2]).astype(np.uint8)
        lut_lum = self._create_channel_lut(lum, bins)

        # 判断是否为灰度图（阈值可调整）
        is_grayscale = mean_saturation < 0.02
        if is_grayscale:
            # 只返回一维亮度LUT（1D LUT 思路），之后会把三个通道都映射为同一亮度
            return {"is_grayscale": True, "lut_lum": lut_lum}

        # 对每个通道分别生成1D LUT（1D LUT 方法）
        channel_r = ref_img[..., 0].ravel()
        channel_g = ref_img[..., 1].ravel()
        channel_b = ref_img[..., 2].ravel()

        lut_r = self._create_channel_lut(channel_r, bins)
        lut_g = self._create_channel_lut(channel_g, bins)
        lut_b = self._create_channel_lut(channel_b, bins)

        # 返回1D LUTs，便于向量化索引使用
        return {"is_grayscale": False, "lut_r": lut_r, "lut_g": lut_g, "lut_b": lut_b, "lut_lum": lut_lum}

    def _create_channel_lut(self, channel_data: np.ndarray, bins: int) -> np.ndarray:
        """
        为单个颜色通道创建LUT
        使用直方图均衡化算法
        """
        # 展平所有batch和像素
        flat_data = channel_data.flatten()

        # 计算直方图
        hist, bin_edges = np.histogram(flat_data, bins=bins, range=(0, 255))

        # 计算累积分布函数
        cdf = hist.cumsum()
        cdf_normalized = cdf / cdf[-1]  # 归一化到0-1

        # 创建LUT映射表
        lut = np.interp(np.arange(256), bin_edges[:-1], cdf_normalized * 255)
        return lut.astype(np.uint8)

    def apply_lut_to_image(self, original_image: np.ndarray,
                          lut: dict,
                          strength: float,
                          blend_mode: str) -> np.ndarray:
        """
        将LUT应用到原图
        """
        # 复制原图
        processed = original_image.copy()

        # 将图像转换为0-255范围
        img_uint8 = (original_image * 255).astype(np.uint8)

        # 向量化实现1D LUT映射（支持灰度和RGB两种路径）
        is_grayscale = lut.get("is_grayscale", False)
        lut_lum = lut.get("lut_lum", None)

        # 原始图像为浮点[0,1]，processed为浮点，img_uint8为[0,255] uint8
        if is_grayscale and lut_lum is not None:
            # 计算原图亮度索引（按8位值）
            r_chan = img_uint8[..., 0].astype(np.float32)
            g_chan = img_uint8[..., 1].astype(np.float32)
            b_chan = img_uint8[..., 2].astype(np.float32)
            lum_idx = np.rint(0.2126 * r_chan + 0.7152 * g_chan + 0.0722 * b_chan).astype(np.uint8)
            mapped = lut_lum[lum_idx]  # uint8 array shape (B,H,W)
            new_pixels = (mapped.astype(np.float32) / 255.0)[..., None]  # (B,H,W,1)
            new_pixels = np.concatenate([new_pixels, new_pixels, new_pixels], axis=-1)  # 灰度三通道
        else:
            # 1D LUT 索引到每个通道
            lut_r = lut.get("lut_r")
            lut_g = lut.get("lut_g")
            lut_b = lut.get("lut_b")

            new_r = lut_r[img_uint8[..., 0]]
            new_g = lut_g[img_uint8[..., 1]]
            new_b = lut_b[img_uint8[..., 2]]

            new_pixels = np.stack([new_r, new_g, new_b], axis=-1).astype(np.float32) / 255.0  # (B,H,W,3)

        # 根据混合模式向量化混合
        orig = processed  # 浮点 0-1
        if blend_mode == "replace":
            processed = orig * (1.0 - strength) + new_pixels * strength
        elif blend_mode == "multiply":
            result = orig * new_pixels
            processed = orig * (1.0 - strength) + result * strength
        elif blend_mode == "screen":
            result = 1.0 - (1.0 - orig) * (1.0 - new_pixels)
            processed = orig * (1.0 - strength) + result * strength
        elif blend_mode == "overlay":
            # overlay 的向量化实现
            low_mask = orig < 0.5
            result = np.empty_like(orig)
            result[low_mask] = 2.0 * orig[low_mask] * new_pixels[low_mask]
            inv_mask = ~low_mask
            result[inv_mask] = 1.0 - 2.0 * (1.0 - orig[inv_mask]) * (1.0 - new_pixels[inv_mask])
            processed = orig * (1.0 - strength) + result * strength

        return processed

    def _blend_replace(self, original: np.ndarray, mapped: list, strength: float) -> np.ndarray:
        """完全替换模式"""
        return original * (1 - strength) + np.array(mapped) * strength

    def _blend_overlay(self, original: np.ndarray, mapped: list, strength: float) -> np.ndarray:
        """叠加模式"""
        result = np.zeros_like(original)
        for i in range(3):
            if original[i] < 0.5:
                result[i] = 2 * original[i] * mapped[i]
            else:
                result[i] = 1 - 2 * (1 - original[i]) * (1 - mapped[i])
        return original * (1 - strength) + result * strength

    def _blend_multiply(self, original: np.ndarray, mapped: list, strength: float) -> np.ndarray:
        """正片叠底模式"""
        result = original * np.array(mapped)
        return original * (1 - strength) + result * strength

    def _blend_screen(self, original: np.ndarray, mapped: list, strength: float) -> np.ndarray:
        """滤色模式"""
        result = 1 - (1 - original) * (1 - np.array(mapped))
        return original * (1 - strength) + result * strength

    def _reinhard_color_transfer(self, src_np: np.ndarray, ref_np: np.ndarray, strength: float) -> np.ndarray:
        """
        对 src_np（shape [B,H,W,3]）应用参考图 ref_np 的 Reinhard 色彩迁移。
        返回 [B,H,W,3] 的 float32 数组（范围 0-1）。
        strength 用于在原图与迁移后结果之间插值（0 保持原图，1 完全迁移）。
        """
        # 保证输入为 float32 0-1
        src = np.clip(src_np.astype(np.float32), 0.0, 1.0)
        ref = np.clip(ref_np.astype(np.float32), 0.0, 1.0)

        B = src.shape[0]
        out = np.empty_like(src, dtype=np.float32)

        for b in range(B):
            src_img = (src[b] * 255.0).astype(np.uint8)
            # 如果 ref 为 batch，选对应索引，否则使用第一个参考图
            ref_idx = b if (ref.shape[0] == src.shape[0]) else 0
            ref_img = (ref[ref_idx] * 255.0).astype(np.uint8)

            # 转换到 Lab 空间
            src_lab = cv2.cvtColor(src_img, cv2.COLOR_RGB2LAB).astype(np.float32)
            ref_lab = cv2.cvtColor(ref_img, cv2.COLOR_RGB2LAB).astype(np.float32)

            # 计算每个通道的均值和标准差（在 HxW 维度）
            src_flat = src_lab.reshape(-1, 3)
            ref_flat = ref_lab.reshape(-1, 3)
            src_mean = src_flat.mean(axis=0)
            src_std = src_flat.std(axis=0, ddof=0)
            ref_mean = ref_flat.mean(axis=0)
            ref_std = ref_flat.std(axis=0, ddof=0)

            # 防止除以零
            src_std = np.where(src_std < 1e-6, 1.0, src_std)

            # 应用 Reinhard 公式： (src - src_mean) * (ref_std/src_std) + ref_mean
            transferred = (src_lab - src_mean[None, None, :]) * (ref_std[None, None, :] / src_std[None, None, :]) + ref_mean[None, None, :]

            # 裁剪并转换回 RGB
            transferred = np.clip(transferred, 0, 255).astype(np.uint8)
            transferred_rgb = cv2.cvtColor(transferred, cv2.COLOR_LAB2RGB).astype(np.float32) / 255.0

            # 插值 strength
            out[b] = src[b] * (1.0 - strength) + transferred_rgb * strength

        return out

    def apply_lut(self, original_image: torch.Tensor,
                  reference_image: torch.Tensor,
                  lut_strength: float,
                  color_bins: int,
                  blend_mode: str = "replace",
                  transfer_mode: str = "lut_1d") -> Tuple[torch.Tensor]:
        """
        主执行函数
        """
        try:
            # 转换为numpy数组
            orig_np = self.tensor_to_numpy(original_image)
            ref_np = self.tensor_to_numpy(reference_image)
            # 根据迁移模式选择路径
            if transfer_mode == "reinhard":
                # 使用 Lab 空间的 Reinhard 色彩迁移（按参考图统计信息匹配）
                processed_np = self._reinhard_color_transfer(orig_np, ref_np, lut_strength)
            else:
                # 默认：1D LUT 向量化路径
                lut = self.create_color_lut(ref_np, color_bins)
                processed_np = self.apply_lut_to_image(orig_np, lut, lut_strength, blend_mode)

            # 转换回tensor
            processed_tensor = self.numpy_to_tensor(processed_np)

            return (processed_tensor,)

        except Exception as e:
            print(f"LUT应用出错: {str(e)}")
            # 返回原图作为fallback
            return (original_image,)


# 节点注册（在ComfyUI中需要添加到节点注册列表）
NODE_CLASS_MAPPINGS = {
    "ImageLUTNode": ImageLUTNode
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "ImageLUTNode": "🔵BB图像做为LUT应用"
}
