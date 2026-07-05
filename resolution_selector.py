"""
ComfyUI Custom Node - 分辨率选择器 (交互式面板)

支持类别、比例和尺寸的级联选择：
1. 类别 (klein / banana / SDXL / Flux / Z-Image / Qwen-Image-2512)
2. 比例 (每个类别有不同的比例选项)
3. 尺寸 (每个类别和比例组合有不同的尺寸)

输出：宽度(INT)、高度(INT)
"""

from typing import Dict, List, Tuple


# ==================== 分辨率预设数据 ====================
PRESETS: Dict[str, Dict[str, List[Tuple[int, int]]]] = {
    # 原有预设
    "klein": {
        "1:1": [
            (1024, 1024),
            (2048, 2048),
            (4096, 4096)
        ],
        "3:2": [
            (768, 512),
            (1536, 1024),
            (3072, 2048)
        ],
        "2:3": [
            (688, 1027),
            (1376, 2054),
            (2752, 4108)
        ],
        "4:3": [
            (768, 576),
            (1536, 1152),
            (3072, 2304)
        ],
        "3:4": [
            (576, 768),
            (1152, 1536),
            (2304, 3072)
        ],
        "16:9": [
            (768, 432),
            (1536, 864),
            (3072, 1728)
        ],
        "9:16": [
            (576, 1024),
            (1152, 2048),
            (2304, 4096)
        ]
    },
    "banana": {
        "1:1": [
            (1024, 1024),
            (2048, 2048),
            (4096, 4096)
        ],
        "21:9": [
            (1584, 672),
            (3168, 1344),
            (6336, 2688)
        ],
        "3:4": [
            (896, 1200),
            (1792, 2400),
            (3584, 4800)
        ],
        "4:3": [
            (1200, 896),
            (2400, 1792),
            (4800, 3584)
        ],
        "9:16": [
            (768, 1376),
            (1536, 2752),
            (3072, 5504)
        ],
        "16:9": [
            (1376, 768),
            (2752, 1536),
            (5504, 3072)
        ],
        "2:3": [
            (848, 1264),
            (1696, 2528),
            (3392, 5056)
        ],
        "3:2": [
            (1264, 848),
            (2528, 1696),
            (5056, 3392)
        ],
        "4:5": [
            (928, 1152),
            (1856, 2304),
            (3712, 4608)
        ],
        "5:4": [
            (1152, 928),
            (2304, 1856),
            (4608, 3712)
        ]
    },
    # SDXL 预设
    "SDXL": {
        "1:1": [
            (1024, 1024),
            (768, 768)
        ],
        "3:2": [
            (1216, 832),
            (1152, 768)
        ],
        "2:3": [
            (832, 1216),
            (768, 1152)
        ],
        "4:3": [
            (1344, 1024),
            (1472, 1104)
        ],
        "3:4": [
            (1024, 1344),
            (1104, 1472)
        ],
        "16:9": [
            (1536, 896),
            (1920, 1080)
        ],
        "9:16": [
            (896, 1536),
            (1080, 1920)
        ]
    },
    # Flux 预设
    "Flux": {
        "1:1": [
            (1024, 1024),
            (1280, 1280)
        ],
        "16:9": [
            (1280, 768),
            (1536, 960)
        ],
        "9:16": [
            (768, 1280),
            (960, 1536)
        ],
        "4:3": [
            (1472, 1104)
        ],
        "3:4": [
            (1104, 1472)
        ],
        "21:9": [
            (2048, 896)
        ],
        "9:21": [
            (896, 2048)
        ]
    },
    # Z-Image 预设
    "Z-Image": {
        "1:1": [
            (512, 512),
            (768, 768),
            (1024, 1024)
        ],
        "3:2": [
            (768, 512),
            (1152, 768)
        ],
        "2:3": [
            (512, 768),
            (768, 1152)
        ],
        "4:3": [
            (1024, 768),
            (1472, 1104)
        ],
        "3:4": [
            (768, 1024),
            (1104, 1472)
        ],
        "16:9": [
            (1024, 576),
            (1280, 720),
            (1920, 1080)
        ],
        "9:16": [
            (576, 1024),
            (720, 1280),
            (1080, 1920)
        ]
    },
    # Qwen-Image-2512 预设
    "Qwen-Image-2512": {
        "1:1": [
            (1328, 1328)
        ],
        "16:9": [
            (1664, 928)
        ],
        "9:16": [
            (928, 1664)
        ],
        "4:3": [
            (1472, 1104)
        ],
        "3:4": [
            (1104, 1472)
        ]
    }
}


# ==================== 辅助函数 ====================

def get_category_options():
    """获取所有类别选项"""
    return list(PRESETS.keys())


def get_ratio_options(category: str):
    """获取指定类别的比例选项"""
    if category in PRESETS:
        return list(PRESETS[category].keys())
    return []


def get_size_options(category: str, ratio: str):
    """获取指定类别和比例的尺寸选项"""
    if category in PRESETS and ratio in PRESETS[category]:
        return [f"{w}x{h}" for w, h in PRESETS[category][ratio]]
    return []


def get_default_category():
    """获取默认类别"""
    return "SDXL"


def get_default_ratio(category: str):
    """获取指定类别的默认比例"""
    ratios = get_ratio_options(category)
    return ratios[0] if ratios else "1:1"


def get_default_size(category: str, ratio: str):
    """获取指定类别和比例的默认尺寸"""
    sizes = get_size_options(category, ratio)
    return sizes[0] if sizes else "1024x1024"


# ==================== ComfyUI 节点 ====================

class reeeee:
    """
    分辨率选择器节点

    支持级联选择：
    1. 选择类别 (klein / banana / SDXL / Flux / Z-Image / Qwen-Image-2512)
    2. 选择比例 (对应类别的比例)
    3. 选择具体尺寸 (对应类别和比例的尺寸)

    输出：宽度(INT)、高度(INT)
    """

    @classmethod
    def INPUT_TYPES(cls):
        # 获取默认类别
        default_category = get_default_category()
        default_ratio = get_default_ratio(default_category)
        default_size = get_default_size(default_category, default_ratio)

        # 获取所有比例选项
        all_ratios = []
        for cat in PRESETS:
            for ratio in PRESETS[cat]:
                if ratio not in all_ratios:
                    all_ratios.append(ratio)

        # 获取所有尺寸选项
        all_sizes = []
        for cat in PRESETS:
            for ratio in PRESETS[cat]:
                for w, h in PRESETS[cat][ratio]:
                    size_str = f"{w}x{h}"
                    if size_str not in all_sizes:
                        all_sizes.append(size_str)

        return {
            "required": {
                "category": (get_category_options(), {"default": default_category}),
                "ratio": (all_ratios, {"default": default_ratio}),
                "size": (all_sizes, {"default": default_size}),
            }
        }

    RETURN_TYPES = ("INT", "INT")
    RETURN_NAMES = ("width", "height")
    FUNCTION = "select_resolution"
    CATEGORY = "🔵BB image crop"
    DISPLAY_NAME = "🔵BB分辨率选择"
    DESCRIPTION = "Cascading selector for category, aspect ratio and resolution"

    # 用于前端面板
    OUTPUT_NODE = False

    def select_resolution(self, category: str, ratio: str, size: str) -> Tuple[int, int]:
        """获取选定的分辨率"""

        # 验证并纠正无效值
        if category not in PRESETS:
            category = "SDXL"

        valid_ratios = get_ratio_options(category)
        if ratio not in valid_ratios:
            ratio = valid_ratios[0] if valid_ratios else "1:1"

        valid_sizes = get_size_options(category, ratio)
        if size not in valid_sizes:
            size = valid_sizes[0] if valid_sizes else "1024x1024"

        # 解析尺寸
        wh = size.split("x")
        width = int(wh[0])
        height = int(wh[1])

        return (width, height)


# ==================== 节点导出 ====================

NODE_CLASS_MAPPINGS = {
    "reeeee": reeeee,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "reeeee": "🔵BB分辨率选择",
}
