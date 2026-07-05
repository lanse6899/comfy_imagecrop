import os
import json
import torch
import numpy as np
from PIL import Image

class SaveBatchToFolder:
    """
    Save a batch of IMAGE tensors to a folder as individual PNG files.
    The node performs a side-effect (writes files) and returns the original image tensor unchanged.
    """

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "image": ("IMAGE",),
                "folder_path": ("STRING", {
                    "default": "./saved_batch",
                    "display": "text"
                }),
                "base_name": ("STRING", {
                    "default": "image",
                    "display": "text"
                }),
                "start_index": ("INT", {
                    "default": 1,
                    "min": 0,
                    "max": 999999,
                    "step": 1
                }),
                "overwrite": ("BOOLEAN", {
                    "default": False,
                    "label_on": "覆盖",
                    "label_off": "不覆盖"
                })
            }
        }

    # 返回保存的文件路径列表（JSON 字符串）
    RETURN_TYPES = ("STRING",)
    RETURN_NAMES = ("file_list",)
    FUNCTION = "save_batch"
    CATEGORY = "🔵BB image crop"

    def save_batch(self, image, folder_path="./saved_batch", base_name="image", start_index=1, overwrite=False):
        """
        Save each item in the input batch tensor as a PNG file under folder_path.
        Filenames are generated as {base_name}_{index:03d}.png
        """
        # Normalize and prepare output folder
        try:
            out_folder = os.path.expanduser(folder_path)
            out_folder = os.path.abspath(out_folder)
            os.makedirs(out_folder, exist_ok=True)
        except Exception:
            out_folder = "./saved_batch"
            os.makedirs(out_folder, exist_ok=True)

        # Accept different tensor shapes:
        # - [N, H, W, C]
        # - [1, H, W, C]
        # - [H, W, C]  (single image)
        # - channel-first variants [C, H, W] or [N, C, H, W]
        tensor = image
        if isinstance(tensor, torch.Tensor):
            pass
        else:
            # If it's a numpy array convert to tensor
            try:
                tensor = torch.from_numpy(np.array(tensor))
            except Exception:
                # Nothing to save, return original input
                return (image,)

        # Normalize tensor to CPU and float
        tensor = tensor.detach().cpu()

        # Ensure batch dimension
        if tensor.ndim == 3:
            # [H, W, C] or [C, H, W]
            if tensor.shape[0] == 3 or tensor.shape[0] == 1:
                # channel-first -> convert to H,W,C
                tensor = tensor.permute(1, 2, 0).unsqueeze(0)
            else:
                tensor = tensor.unsqueeze(0)
        elif tensor.ndim == 4:
            # could be [N, H, W, C] or [N, C, H, W]
            if tensor.shape[1] == 3 or tensor.shape[1] == 1:
                # assume [N, C, H, W] -> convert to [N, H, W, C]
                tensor = tensor.permute(0, 2, 3, 1)
            # else assume already [N, H, W, C]
        else:
            # unsupported shape, return
            return (image,)

        # Clamp and convert to uint8 for saving
        tensor = torch.clamp(tensor, 0, 1)
        numpy_batch = (tensor.numpy() * 255).astype(np.uint8)

        saved_paths = []
        idx = int(start_index)
        for i in range(numpy_batch.shape[0]):
            arr = numpy_batch[i]
            # handle grayscale single-channel
            if arr.ndim == 2:
                pil = Image.fromarray(arr, mode='L').convert('RGBA' if arr.shape[2:] == () else 'RGB')
            elif arr.shape[2] == 1:
                pil = Image.fromarray(arr.squeeze(), mode='L').convert('RGB')
            elif arr.shape[2] == 3:
                pil = Image.fromarray(arr, mode='RGB')
            elif arr.shape[2] == 4:
                pil = Image.fromarray(arr, mode='RGBA')
            else:
                # fallback: convert first three channels
                pil = Image.fromarray(arr[:, :, :3], mode='RGB')

            # build file path
            file_index = idx
            file_path = os.path.join(out_folder, f"{base_name}_{file_index:03d}.png")
            if not overwrite:
                # find next available
                while os.path.exists(file_path):
                    file_index += 1
                    file_path = os.path.join(out_folder, f"{base_name}_{file_index:03d}.png")

            # save PNG
            try:
                pil.save(file_path, format="PNG")
                saved_paths.append(file_path)
            except Exception:
                # fallback: ensure RGB and retry
                try:
                    pil.convert('RGB').save(file_path, format="PNG")
                    saved_paths.append(file_path)
                except Exception:
                    # failed to save, skip adding path
                    pass

            idx = file_index + 1

        # 返回已保存文件的路径列表（JSON 字符串）
        try:
            return (json.dumps(saved_paths, ensure_ascii=False),)
        except Exception:
            return (";".join(saved_paths),)


# 节点映射
NODE_CLASS_MAPPINGS = {
    "SaveBatchToFolder": SaveBatchToFolder,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "SaveBatchToFolder": "🔵BB 保存批次为PNG",
}


