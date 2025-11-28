# 🔵BB交互式剪裁 / BB Interactive Crop

## 简体中文

ComfyUI的交互式图像剪裁节点，支持可视化调整和所见即所得的剪裁效果。

## 安装

1. 将此文件夹复制到 `ComfyUI/custom_nodes/` 目录
2. 重启ComfyUI
3. 在菜单 `🔵BB image crop` 分类下找到节点

## 功能特点

- 🖱️ **拖拽移动** - 调整图像位置
- 🔍 **滚轮缩放** - 调整图像大小
- 🎯 **双击重置** - 恢复默认状态
- ⚡ **所见即所得** - 面板显示即实际剪裁
- 📊 **实时预览** - 自动更新参数

## 使用方法

```
Load Image → 🔵BB交互式剪裁 → Preview Image
```

1. 连接图像输入
2. 设置剪裁宽度和高度
3. 在面板中拖拽和缩放图像
4. 运行工作流获得结果

## 参数说明

### 可见参数
- `crop_width` - 剪裁宽度 (64-2048)
- `crop_height` - 剪裁高度 (64-2048)
- `rotation` - 旋转角度 (-180°~180°)

### 隐藏参数（自动控制）
- `offset_x/y` - 剪裁位置偏移
- `scale` - 图像缩放倍数

## 交互操作

| 操作 | 功能 |
|------|------|
| 拖拽 | 移动图像调整剪裁位置 |
| 滚轮 | 缩放图像调整大小 |
| 双击 | 重置到默认状态 |
| 旋转按钮 | 左旋/右旋90度 |
| 调整rotation参数 | 精确设置旋转角度 |

## 输出

- `cropped_image` - 剪裁后的图像
- `preview_image` - 带标记的预览图

## 许可证

本插件采用以下许可方式：

- ✅ **个人使用**：完全免费
- ⚠️ **商用平台**：需提前通知作者
- 📧 **联系方式**：15734666@qq.com
- 🎬 **B站**：蓝波球的球

### 使用条款

1. 个人用户可以免费使用本插件的所有功能
2. 如果您是商业平台或企业，在使用本插件前请通过邮箱联系作者
3. 禁止未经授权的商业转售或二次分发
4. 使用本插件即表示您同意以上条款

---

**© 2025 蓝波球的球 | 个人免费 | 商用需授权**

---

## English

An interactive image cropping node for ComfyUI with visual adjustment and WYSIWYG (What You See Is What You Get) cropping effects.

### Installation

1. Copy this folder to `ComfyUI/custom_nodes/` directory
2. Restart ComfyUI
3. Find the node under `🔵BB image crop` category in the menu

### Features

- 🖱️ **Drag to Move** - Adjust image position
- 🔍 **Scroll to Zoom** - Adjust image size
- 🎯 **Double Click Reset** - Restore default state
- ⚡ **WYSIWYG** - Panel display equals actual crop
- 📊 **Real-time Preview** - Auto-update parameters

### Usage

```
Load Image → 🔵BB Interactive Crop → Preview Image
```

1. Connect image input
2. Set crop width and height
3. Drag and zoom image in the panel
4. Run workflow to get results

### Parameters

#### Visible Parameters
- `crop_width` - Crop width (64-2048)
- `crop_height` - Crop height (64-2048)
- `rotation` - Rotation angle (-180°~180°)

#### Hidden Parameters (Auto-controlled)
- `offset_x/y` - Crop position offset
- `scale` - Image scale factor

### Interactive Controls

| Operation | Function |
|-----------|----------|
| Drag | Move image to adjust crop position |
| Scroll | Zoom image to adjust size |
| Double Click | Reset to default state |
| Rotation Buttons | Rotate left/right by 90° |
| Adjust rotation parameter | Set precise rotation angle |

### Outputs

- `cropped_image` - Cropped image
- `preview_image` - Preview with markers

### License

This plugin uses the following licensing terms:

- ✅ **Personal Use**: Completely free
- ⚠️ **Commercial Platforms**: Must notify author in advance
- 📧 **Contact**: 15734666@qq.com
- 🎬 **Bilibili**: 蓝波球的球 (Lanboqiu de Qiu)

#### Terms of Use

1. Individual users can use all features of this plugin for free
2. If you are a commercial platform or enterprise, please contact the author via email before using this plugin
3. Unauthorized commercial resale or redistribution is prohibited
4. By using this plugin, you agree to the above terms

---

**© 2025 蓝波球的球 | Free for Personal Use | Commercial Use Requires Authorization**
