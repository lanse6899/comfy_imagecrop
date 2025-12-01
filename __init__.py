# ComfyUI 交互式图像剪裁节点包

try:
    from .interactive_crop_with_panel import InteractiveCropWithPanel
    from .straighten_layer import StraightenLayerWithPanel
    from .perspective_crop import PerspectiveCropWithPanel
    from .image_annotate import ImageAnnotateWithPanel

    # 节点类映射
    NODE_CLASS_MAPPINGS = {
        "InteractiveCropWithPanel": InteractiveCropWithPanel,
        "StraightenLayerWithPanel": StraightenLayerWithPanel,
        "PerspectiveCropWithPanel": PerspectiveCropWithPanel,
        "ImageAnnotateWithPanel": ImageAnnotateWithPanel,
    }

    # 节点显示名称
    NODE_DISPLAY_NAME_MAPPINGS = {
        "InteractiveCropWithPanel": "🔵BB交互式裁剪",
        "StraightenLayerWithPanel": "🔵BB矫正图像",
        "PerspectiveCropWithPanel": "🔵BB透视剪裁",
        "ImageAnnotateWithPanel": "🔵BB图像标注",
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
__version__ = "1.0.2"
__author__ = "AI Assistant"
__description__ = "Interactive image cropping nodes for ComfyUI with interactive panel"

# Web扩展路径
WEB_DIRECTORY = "./js"
