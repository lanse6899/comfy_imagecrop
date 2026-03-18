# ComfyUI 交互式图像剪裁节点包

try:
    from .interactive_crop_with_panel import InteractiveCropWithPanel
    from .straighten_layer import StraightenLayerWithPanel
    from .perspective_crop import PerspectiveCropWithPanel
    from .image_annotate import ImageAnnotateWithPanel
    from .image_drawing import ImageDrawingWithPanel
    from .slice_crop_with_panel import SliceCropWithPanel
    from .curve_adjust import CurvePanel
    from .levelssss import LevelsPanel
    from .save_batch_to_folder import SaveBatchToFolder
    from .auto_resize_to_multiple_of_3 import AutoResizeTo3
    from .auto_resize_to_multiple_of_8 import AutoResizeTo8
    from .image_lut_node import ImageLUTNode
    from .batch_get_images import BatchGetImages
    from .separate_masks import SeparateMasks
    from .depth_adjust import DepthAdjustNode
    from .resolution_selector import reeeee

    # 节点类映射
    NODE_CLASS_MAPPINGS = {
        "InteractiveCropWithPanel": InteractiveCropWithPanel,
        "StraightenLayerWithPanel": StraightenLayerWithPanel,
        "PerspectiveCropWithPanel": PerspectiveCropWithPanel,
        "ImageAnnotateWithPanel": ImageAnnotateWithPanel,
        "ImageDrawingWithPanel": ImageDrawingWithPanel,
        "SliceCropWithPanel": SliceCropWithPanel,
        "SaveBatchToFolder": SaveBatchToFolder,
        "CurvePanel": CurvePanel,
        "levelssss": LevelsPanel,
        "AutoResizeTo3": AutoResizeTo3,
        "AutoResizeTo8": AutoResizeTo8,
        "ImageLUTNode": ImageLUTNode,
        "BatchGetImages": BatchGetImages,
        "SeparateMasks": SeparateMasks,
        "DepthAdjustNode": DepthAdjustNode,
        "reeeee": reeeee,
    }

    # 节点显示名称
    NODE_DISPLAY_NAME_MAPPINGS = {
        "InteractiveCropWithPanel": "🔵BB交互式裁剪",
        "StraightenLayerWithPanel": "🔵BB矫正图像",
        "PerspectiveCropWithPanel": "🔵BB透视剪裁",
        "ImageAnnotateWithPanel": "🔵BB图像标注",
        "ImageDrawingWithPanel": "🔵BB图像绘制",
        "SliceCropWithPanel": "🔵BB切片划分（交互）",
        "SaveBatchToFolder": "🔵BB保存批次为PNG",
        "CurvePanel": "🔵BB曲线调整（交互）",
        "levelssss": "🔵BB色阶调整（交互）",
        "AutoResizeTo3": "🔵BB被3整除像素处理",
        "AutoResizeTo8": "🔵BB被8整除像素处理",
        "ImageLUTNode": "🔵BB图像做为LUT应用",
        "BatchGetImages": "🔵BB 提取图像（单个0多个0-X）",
        "SeparateMasks": "🔵BB拆分遮罩到批次",
        "DepthAdjustNode": "🔵BB远近明暗调整",
        "reeeee": "🔵BB分辨率选择",
    }

    # 指定前端JS文件目录
    WEB_DIRECTORY = "./js"

    print("")
    print("")

    print("✅ 图像处理节点加载成功")
    
except Exception as e:
    print(f"❌ 节点加载失败: {e}")
    
    # 备用的空映射
    NODE_CLASS_MAPPINGS = {}
    NODE_DISPLAY_NAME_MAPPINGS = {}

# 导出给ComfyUI使用
__all__ = ['NODE_CLASS_MAPPINGS', 'NODE_DISPLAY_NAME_MAPPINGS']

# 版本信息
__version__ = "1.0.6"
__author__ = "AI Assistant"
__description__ = "Interactive image cropping nodes for ComfyUI with interactive panel"

# Web扩展路径
WEB_DIRECTORY = "./js"
