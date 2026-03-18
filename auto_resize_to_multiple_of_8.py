import math
import numpy as np
import torch
from PIL import Image


def _round_values(n: int):
    lower = (n // 8) * 8
    upper = lower if n % 8 == 0 else lower + 8
    nearest = lower if (n - lower) <= (upper - n) else upper
    return lower, upper, nearest


def _tensor_to_pil(t: torch.Tensor) -> Image.Image:
    arr = (t.cpu().numpy() * 255.0).clip(0, 255).astype(np.uint8)
    return Image.fromarray(arr)


def _pil_to_tensor(img: Image.Image) -> torch.Tensor:
    arr = np.array(img).astype(np.float32) / 255.0
    return torch.from_numpy(arr)


class AutoResizeTo8:
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "image": ("IMAGE",),
                "mode": (
                    ["resize", "center_crop", "pad", "resize_and_pad"],
                    {"default": "resize"},
                ),
            }
        }

    RETURN_TYPES = ("IMAGE", "INT", "INT")
    RETURN_NAMES = ("image", "width", "height")
    FUNCTION = "process"
    CATEGORY = "🔵BB image crop"
    DESCRIPTION = "将图片调整到宽高均可被 8 整除，可选拉伸/裁剪/填充策略"

    def _process_one(self, img: torch.Tensor, mode: str):
        # img: HWC, float32 0-1
        h, w, _ = img.shape
        lower_w, upper_w, nearest_w = _round_values(w)
        lower_h, upper_h, nearest_h = _round_values(h)

        pil_img = _tensor_to_pil(img)
        target_w = nearest_w
        target_h = nearest_h

        if mode == "center_crop":
            target_w, target_h = lower_w, lower_h
            left = (w - target_w) // 2
            top = (h - target_h) // 2
            pil_img = pil_img.crop((left, top, left + target_w, top + target_h))

        elif mode == "pad":
            # 使用最近的 8 倍数；若最近值小于原尺寸则改为居中裁剪
            target_w, target_h = nearest_w, nearest_h
            if target_w >= w and target_h >= h:
                pad_w = target_w - w
                pad_h = target_h - h
                left = pad_w // 2
                top = pad_h // 2
                new_img = Image.new("RGB", (target_w, target_h), (0, 0, 0))
                new_img.paste(pil_img, (left, top))
                pil_img = new_img
            else:
                left = (w - target_w) // 2
                top = (h - target_h) // 2
                pil_img = pil_img.crop((left, top, left + target_w, top + target_h))

        elif mode == "resize_and_pad":
            target_w, target_h = nearest_w, nearest_h
            pil_img = pil_img.resize((target_w, target_h), Image.BICUBIC)
            # 兜底：若仍未整除则再填充到上取整
            if target_w % 8 != 0 or target_h % 8 != 0:
                target_w = math.ceil(target_w / 8) * 8
                target_h = math.ceil(target_h / 8) * 8
                pad_w = target_w - pil_img.width
                pad_h = target_h - pil_img.height
                left = pad_w // 2
                top = pad_h // 2
                new_img = Image.new("RGB", (target_w, target_h), (0, 0, 0))
                new_img.paste(pil_img, (left, top))
                pil_img = new_img

        else:  # resize
            target_w, target_h = nearest_w, nearest_h
            pil_img = pil_img.resize((target_w, target_h), Image.BICUBIC)

        out = _pil_to_tensor(pil_img)
        return out, target_w, target_h

    def process(self, image, mode):
        # image: batch, H, W, C
        batch = []
        out_w = None
        out_h = None
        for i in range(image.shape[0]):
            single = image[i]
            out_img, w, h = self._process_one(single, mode)
            batch.append(out_img)
            out_w, out_h = w, h
        out_tensor = torch.stack(batch, dim=0)
        return (out_tensor, int(out_w), int(out_h))


NODE_CLASS_MAPPINGS = {"AutoResizeTo8": AutoResizeTo8}
NODE_DISPLAY_NAME_MAPPINGS = {"AutoResizeTo8": "🔵BB被8整除像素处理"}

