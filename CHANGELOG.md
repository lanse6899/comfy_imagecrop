# 更新日志 / Changelog

## [1.1.0] - 2025-11-29

### 新增 / Added
- ✨ **新节点：🔵BB拉直图层** - 模仿 Photoshop 的拉直图层功能
  - 支持交互式参考线绘制
  - 自动计算倾斜角度（-180° 到 180°）
  - 智能裁剪黑边（最大内接矩形算法）
  - 支持多种填充颜色选项
  - 输出计算的角度值
  - 保持原图尺寸，无额外裁剪

- ✨ **New Node: 🔵BB Straighten Layer** - Photoshop-style straighten functionality
  - Interactive reference line drawing
  - Auto-calculate tilt angle (-180° to 180°)
  - Smart black edge cropping (maximum inscribed rectangle algorithm)
  - Multiple fill color options
  - Output calculated angle value
  - Maintains original image size, no additional cropping

### 文件变更 / File Changes
- 新增 `straighten_layer.py` - 拉直图层节点主文件
- 新增 `js/straighten_panel.js` - 拉直图层交互面板
- 更新 `__init__.py` - 注册新节点
- 更新 `README.md` - 添加新节点文档

---

## [1.0.2] - 2025-11 (Previous)

### 功能 / Features
- 🔵BB交互式剪裁节点
- 支持拖拽、缩放、旋转
- 交互式预览面板
- 实时参数更新

---

**© 2025 蓝波球的球 | 个人免费 | 商用需授权**
