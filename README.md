# 🔵BB 图像剪裁工具集

ComfyUI 交互式图像处理节点，支持可视化剪裁、透视校正和图像拉直。

<img width="1619" height="701" alt="ScreenShot_2025-11-29_161715_250" src="https://github.com/user-attachments/assets/7f0b28ab-5c38-4c85-9083-76e374e77c0f" />
<img width="997" height="814" alt="ScreenShot_2025-11-29_153638_089" src="https://github.com/user-attachments/assets/4caf9db7-ac8c-48e7-b988-ae38d813a7ad" />
<img width="1120" height="795" alt="ScreenShot_2025-12-01_093901_521" src="https://github.com/user-attachments/assets/4b31b39e-7782-45d2-b2c1-78954b076b2f" />

## 📦 更新！
增加了曲线调整节点、色阶调整节点

## 📦 注意！
交互裁切节点当多个节点用时，请用impact里的桥接预览图像连接！

## 📦 安装

1. 下载并解压到 `ComfyUI/custom_nodes/` 目录
2. 重启 ComfyUI
3. 在节点菜单 `🔵BB image crop` 分类中找到节点

## 🛠️ 节点功能

### 🔵BB 交互式剪裁
- **可视化剪裁**: 在面板中直接拖拽调整剪裁区域
- **实时预览**: 所见即所得的剪裁效果
- **多种操作**: 拖拽移动、滚轮缩放、双击重置
- **旋转支持**: 支持任意角度旋转

### 🔵BB 透视剪裁  
- **四点透视**: 拖拽四个角点定义透视区域
- **自动校正**: 自动进行透视变换和校正
- **智能尺寸**: 可自动计算最佳输出尺寸

### 🔵BB 矫正图像
- **参考线绘制**: 在图像上绘制参考线
- **自动计算**: 根据参考线自动计算倾斜角度
- **智能裁剪**: 自动裁剪旋转后的黑边

### 🔵BB 图像标注
- **标注绘制**: 在图像上标注序号和图标

## 🎮 使用方法

### 基本工作流
```
Load Image → 选择剪裁节点 → Preview Image
```

### 交互操作
| 操作 | 功能 |
|------|------|
| 🖱️ 拖拽 | 移动图像/调整角点 |
| 🔍 滚轮 | 缩放图像 |
| 🎯 双击 | 重置状态 |
| 🔄 按钮 | 90度旋转 |

## ⚙️ 主要参数

- **剪裁尺寸**: `crop_width` / `crop_height` (64-2048)
- **旋转角度**: `rotation` (-180°~180°)
- **自动裁剪**: `auto_crop` (智能去黑边)
- **填充颜色**: `fill_color` (黑/白/透明)

## 📋 更新日志

### v1.0.3 (2024.11.29)
- ✅ **修复剪贴板冲突**: 解决影响 ComfyUI 复制粘贴的问题
- ✅ **优化事件处理**: 改进全局事件监听器管理
- ✅ **增强兼容性**: 避免与其他插件冲突

### v1.0.2
- 新增透视剪裁节点
- 新增图像矫正节点
- 优化交互体验

## 📄 许可证

- ✅ **个人使用**: 完全免费
- ⚠️ **商业使用**: 需联系作者授权
- 📧 **联系方式**: 15734666@qq.com
- 🎬 **B站**: 蓝波球的球

---

## English

Interactive image processing nodes for ComfyUI with visual cropping, perspective correction, and image straightening.

### Installation
1. Download and extract to `ComfyUI/custom_nodes/`
2. Restart ComfyUI
3. Find nodes in `🔵BB image crop` category

### Features
- **🔵BB Interactive Crop**: Visual cropping with drag & zoom
- **🔵BB Perspective Crop**: 4-point perspective correction  
- **🔵BB Straighten Layer**: Reference line based straightening

### License
- ✅ **Personal Use**: Free
- ⚠️ **Commercial Use**: Authorization required
- 📧 **Contact**: 15734666@qq.com

---

**© 2025 蓝波球的球 | v1.0.3**
