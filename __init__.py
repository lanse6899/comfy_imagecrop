# ComfyUI 交互式图像剪裁节点包

try:
    from .interactive_crop_with_panel import NODE_CLASS_MAPPINGS as PANEL_MAPPINGS, NODE_DISPLAY_NAME_MAPPINGS as PANEL_DISPLAY_MAPPINGS
    
    # 节点映射（只保留带面板版本）
    NODE_CLASS_MAPPINGS = {}
    NODE_CLASS_MAPPINGS.update(PANEL_MAPPINGS)
    
    NODE_DISPLAY_NAME_MAPPINGS = {}
    NODE_DISPLAY_NAME_MAPPINGS.update(PANEL_DISPLAY_MAPPINGS)
    
    print("✅ 交互式剪裁节点加载成功 (带面板版本)")
    
except Exception as e:
    print(f"❌ 交互式剪裁节点加载失败: {e}")
    
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
