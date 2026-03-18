import { app } from "../../scripts/app.js";

app.registerExtension({
    name: "ImageAnnotatePanel",
    
    async beforeRegisterNodeDef(nodeType, nodeData, app) {
        if (nodeData.name === "ImageAnnotateWithPanel") {
            
            const onNodeCreated = nodeType.prototype.onNodeCreated;
            nodeType.prototype.onNodeCreated = function () {
                const r = onNodeCreated ? onNodeCreated.apply(this, arguments) : undefined;
                
                this.addAnnotatePanel_internal();
                this.setSize([400, 530]);
                
                // 延迟强制重绘，确保面板正确显示
                setTimeout(() => {
                    if (this.setDirtyCanvas) {
                        this.setDirtyCanvas(true, true);
                    }
                    if (this.graph && this.graph.setDirtyCanvas) {
                        this.graph.setDirtyCanvas(true, true);
                    }
                }, 100);
                
                return r;
            };
            
            // 监听节点添加到图形
            const onAddedToGraph = nodeType.prototype.onAddedToGraph;
            nodeType.prototype.onAddedToGraph = function(graph) {
                const r = onAddedToGraph ? onAddedToGraph.apply(this, arguments) : undefined;
                
                // 节点添加到图形后，强制初始化面板
                setTimeout(() => {
                    if (this.updateCanvasSize_internal) {
                        this.updateCanvasSize_internal();
                        this.drawCanvas_internal();
                    }
                }, 200);
                
                return r;
            };
            
            const onExecuted = nodeType.prototype.onExecuted;
            nodeType.prototype.onExecuted = function(message) {
                const r = onExecuted ? onExecuted.apply(this, arguments) : undefined;
                if (this.loadInputImage_internal) {
                    setTimeout(() => this.loadInputImage_internal(), 100);
                }
                return r;
            };
            
            const onConnectionsChange = nodeType.prototype.onConnectionsChange;
            nodeType.prototype.onConnectionsChange = function(type, index, connected, link_info) {
                const r = onConnectionsChange ? onConnectionsChange.apply(this, arguments) : undefined;
                if (type === 1 && this.loadInputImage_internal) {
                    setTimeout(() => this.loadInputImage_internal(), 200);
                }
                return r;
            };
            
            nodeType.prototype.addAnnotatePanel_internal = function() {
                const container = document.createElement("div");
                container.style.cssText = `
                    width: 100%;
                    height: 350px;
                    border: 2px solid #555;
                    border-radius: 6px;
                    background: #1a1a1a;
                    margin: 5px 0;
                    display: flex;
                    flex-direction: column;
                `;
                
                const canvasArea = document.createElement("div");
                canvasArea.style.cssText = `
                    flex: 1;
                    min-height: 280px;
                    position: relative;
                    background: #2a2a2a;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    cursor: crosshair;
                    overflow: hidden;
                `;
                
                const canvas = document.createElement("canvas");
                canvas.style.cssText = `width: 100%; height: 100%; display: block; cursor: crosshair;`;
                
                // 按钮面板
                const buttonPanel = document.createElement("div");
                buttonPanel.style.cssText = `
                    background: #2a2a2a;
                    padding: 8px 10px;
                    border-top: 1px solid #555;
                    display: flex;
                    flex-direction: column;
                    gap: 8px;
                `;
                
                // 自定义文本输入区域
                const customInputArea = document.createElement("div");
                customInputArea.style.cssText = `
                    display: flex;
                    gap: 5px;
                    align-items: center;
                `;
                
                const customInput = document.createElement("input");
                customInput.type = "text";
                customInput.placeholder = "输入自定义标签（如：小猫）";
                customInput.style.cssText = `
                    flex: 1;
                    padding: 6px 10px;
                    background: #333;
                    border: 1px solid #555;
                    border-radius: 4px;
                    color: #fff;
                    font-size: 13px;
                `;
                
                const addCustomBtn = document.createElement("button");
                addCustomBtn.textContent = "添加";
                addCustomBtn.style.cssText = `
                    padding: 6px 16px;
                    cursor: pointer;
                    background: #4CAF50;
                    border: 1px solid #45a049;
                    border-radius: 4px;
                    color: #fff;
                    font-weight: bold;
                    font-size: 13px;
                `;
                
                customInputArea.appendChild(customInput);
                customInputArea.appendChild(addCustomBtn);
                buttonPanel.appendChild(customInputArea);
                
                // 预设按钮区域
                const presetButtonsArea = document.createElement("div");
                presetButtonsArea.style.cssText = `
                    display: flex;
                    flex-wrap: wrap;
                    gap: 5px;
                    justify-content: center;
                `;
                
                // 创建数字按钮 1-0
                const numberButtons = '1234567890'.split('');
                numberButtons.forEach(num => {
                    const btn = document.createElement('button');
                    btn.textContent = num;
                    btn.className = 'annotate-btn';
                    btn.dataset.label = num;
                    btn.style.cssText = `
                        width: 32px;
                        height: 32px;
                        cursor: pointer;
                        background: #555;
                        border: 2px solid #777;
                        border-radius: 4px;
                        color: #fff;
                        font-weight: bold;
                        font-size: 14px;
                        transition: all 0.2s;
                    `;
                    btn.addEventListener('mouseenter', () => {
                        btn.style.background = '#666';
                        btn.style.borderColor = '#888';
                    });
                    btn.addEventListener('mouseleave', () => {
                        btn.style.background = '#555';
                        btn.style.borderColor = '#777';
                    });
                    presetButtonsArea.appendChild(btn);
                });
                
                // 创建字母按钮 A-K
                const letterButtons = 'ABCDEFGHIJK'.split('');
                letterButtons.forEach(letter => {
                    const btn = document.createElement('button');
                    btn.textContent = letter;
                    btn.className = 'annotate-btn';
                    btn.dataset.label = letter;
                    btn.style.cssText = `
                        width: 32px;
                        height: 32px;
                        cursor: pointer;
                        background: #555;
                        border: 2px solid #777;
                        border-radius: 4px;
                        color: #fff;
                        font-weight: bold;
                        font-size: 14px;
                        transition: all 0.2s;
                    `;
                    btn.addEventListener('mouseenter', () => {
                        btn.style.background = '#666';
                        btn.style.borderColor = '#888';
                    });
                    btn.addEventListener('mouseleave', () => {
                        btn.style.background = '#555';
                        btn.style.borderColor = '#777';
                    });
                    presetButtonsArea.appendChild(btn);
                });
                
                buttonPanel.appendChild(presetButtonsArea);
                
                const controlPanel = document.createElement("div");
                controlPanel.style.cssText = `
                    background: #333;
                    padding: 8px 10px;
                    border-top: 1px solid #555;
                    font-size: 12px;
                    color: #ddd;
                    display: flex;
                    justify-content: space-between;
                    gap: 10px;
                    min-height: 40px;
                    align-items: center;
                `;
                
                controlPanel.innerHTML = `
                    <div>📍 标注数量: <span id="annotationCount">0</span></div>
                    <div style="display: flex; gap: 5px;">
                        <button id="deleteAnnotation" style="padding: 2px 8px; cursor: pointer; background: #d32f2f; border: 1px solid #b71c1c; border-radius: 3px; color: #fff;">删除选中</button>
                        <button id="undoAnnotation" style="padding: 2px 8px; cursor: pointer; background: #555; border: 1px solid #777; border-radius: 3px; color: #fff;">撤销</button>
                        <button id="clearAnnotations" style="padding: 2px 8px; cursor: pointer; background: #555; border: 1px solid #777; border-radius: 3px; color: #fff;">清空</button>
                    </div>
                `;
                
                canvasArea.appendChild(canvas);
                container.appendChild(canvasArea);
                container.appendChild(buttonPanel);
                container.appendChild(controlPanel);
                
                const widget = this.addDOMWidget("annotate_panel", "div", container);
                widget.computeSize = () => [this.size ? this.size[0] : 400, 430];
                
                this.annotatePanel = {
                    canvas: canvas,
                    ctx: canvas.getContext('2d'),
                    controlPanel: controlPanel,
                    buttonPanel: buttonPanel,
                    canvasArea: canvasArea,
                    customInput: customInput,
                    addCustomBtn: addCustomBtn,
                    inputImage: null,
                    annotations: [],  // 存储标注点 [{x, y, label}]
                    selectedIndex: -1,  // 选中的标注点索引
                    isDragging: false,  // 是否正在拖拽
                    draggingIndex: -1,  // 正在拖拽的标注点索引
                    hoverPos: null  // 鼠标悬停位置
                };
                
                this.bindAnnotateEvents_internal();
                
                // 延迟初始化，确保DOM元素完全渲染
                setTimeout(() => {
                    this.updateCanvasSize_internal();
                    this.loadInputImage_internal();
                }, 500);
                
                // 定期检查图像更新
                this.imageCheckInterval = setInterval(() => {
                    if (this.loadInputImage_internal) {
                        this.loadInputImage_internal();
                    }
                }, 2000);
                
                // 监听节点大小变化
                const originalOnResize = this.onResize;
                const self = this;
                this.onResize = function(size) {
                    if (originalOnResize) originalOnResize.call(this, size);
                    setTimeout(() => {
                        if (self.updateCanvasSize_internal) {
                            self.updateCanvasSize_internal();
                            self.drawCanvas_internal();
                        }
                    }, 50);
                };
            };
            
            nodeType.prototype.updateCanvasSize_internal = function() {
                const panel = this.annotatePanel;
                if (!panel || !panel.canvas || !panel.canvasArea) return;
                
                const rect = panel.canvasArea.getBoundingClientRect();
                
                // 如果尺寸为0，说明DOM还没准备好，延迟重试
                if (rect.width === 0 || rect.height === 0) {
                    setTimeout(() => this.updateCanvasSize_internal(), 100);
                    return;
                }
                
                const displayWidth = Math.max(200, Math.floor(rect.width));
                const displayHeight = Math.max(150, Math.floor(rect.height));
                
                const dpr = window.devicePixelRatio || 1;
                panel.canvas.width = displayWidth * dpr;
                panel.canvas.height = displayHeight * dpr;
                panel.canvas.style.width = displayWidth + 'px';
                panel.canvas.style.height = displayHeight + 'px';
                
                panel.ctx.scale(dpr, dpr);
                panel.displayWidth = displayWidth;
                panel.displayHeight = displayHeight;
                
                this.drawCanvas_internal();
            };
            
            nodeType.prototype.bindAnnotateEvents_internal = function() {
                const panel = this.annotatePanel;
                const canvasArea = panel.canvasArea;
                const canvas = panel.canvas;
                const buttonPanel = panel.buttonPanel;
                const customInput = panel.customInput;
                const addCustomBtn = panel.addCustomBtn;
                const self = this;
                
                // 自定义文本添加事件
                const addCustomLabel = () => {
                    if (!panel.inputImage) return;
                    
                    const customText = customInput.value.trim();
                    if (!customText) return;
                    
                    // 在图像中心添加标注
                    const centerX = panel.inputImage.width / 2;
                    const centerY = panel.inputImage.height / 2;
                    
                    panel.annotations.push({ 
                        x: centerX, 
                        y: centerY, 
                        label: customText 
                    });
                    
                    // 清空输入框
                    customInput.value = '';
                    
                    // 取消所有选中状态
                    panel.selectedIndex = -1;
                    
                    self.drawCanvas_internal();
                    self.updateAnnotationParams_internal();
                    self.updateAnnotationCount_internal();
                };
                
                // 点击添加按钮
                addCustomBtn.addEventListener('click', addCustomLabel);
                
                // 回车键添加
                customInput.addEventListener('keypress', (e) => {
                    if (e.key === 'Enter') {
                        addCustomLabel();
                    }
                });
                
                // 按钮点击事件 - 直接添加标注
                const annotateButtons = buttonPanel.querySelectorAll('.annotate-btn');
                annotateButtons.forEach(btn => {
                    btn.addEventListener('click', (e) => {
                        e.stopPropagation();
                        
                        if (!panel.inputImage) return;
                        
                        const label = btn.dataset.label;
                        
                        // 在图像中心添加标注
                        const centerX = panel.inputImage.width / 2;
                        const centerY = panel.inputImage.height / 2;
                        
                        panel.annotations.push({ 
                            x: centerX, 
                            y: centerY, 
                            label: label 
                        });
                        
                        // 取消所有选中状态
                        panel.selectedIndex = -1;
                        
                        self.drawCanvas_internal();
                        self.updateAnnotationParams_internal();
                        self.updateAnnotationCount_internal();
                    });
                });
                
                // 鼠标按下 - 选中或拖拽标注点
                canvasArea.addEventListener('mousedown', (e) => {
                    if (!panel.inputImage) return;
                    
                    const rect = canvas.getBoundingClientRect();
                    const dpr = window.devicePixelRatio || 1;
                    
                    const mouseX = (e.clientX - rect.left) * (canvas.width / rect.width) / dpr;
                    const mouseY = (e.clientY - rect.top) * (canvas.height / rect.height) / dpr;
                    
                    const imageRect = panel.imageRect;
                    if (!imageRect) return;
                    
                    // 获取标记大小
                    let markerSize = 40;
                    const widgets = self.widgets;
                    if (widgets) {
                        for (let w of widgets) {
                            if (w.name === 'marker_size') markerSize = w.value;
                        }
                    }
                    const displaySize = markerSize * imageRect.scale;
                    const hitRadius = displaySize / 2;
                    
                    // 检查是否点击了现有标注点
                    let clickedIndex = -1;
                    for (let i = panel.annotations.length - 1; i >= 0; i--) {
                        const point = panel.annotations[i];
                        const screenX = imageRect.x + point.x * imageRect.scale;
                        const screenY = imageRect.y + point.y * imageRect.scale;
                        
                        const distance = Math.sqrt(
                            Math.pow(mouseX - screenX, 2) + 
                            Math.pow(mouseY - screenY, 2)
                        );
                        
                        if (distance <= hitRadius) {
                            clickedIndex = i;
                            break;
                        }
                    }
                    
                    if (clickedIndex >= 0) {
                        // 选中标注点并开始拖拽
                        panel.selectedIndex = clickedIndex;
                        panel.draggingIndex = clickedIndex;
                        panel.isDragging = true;
                        canvasArea.style.cursor = 'grabbing';
                        self.drawCanvas_internal();
                        e.preventDefault();
                    } else {
                        // 点击空白处取消选中
                        panel.selectedIndex = -1;
                        self.drawCanvas_internal();
                    }
                });
                
                // 鼠标移动 - 拖拽标注点或显示悬停效果
                canvasArea.addEventListener('mousemove', (e) => {
                    if (!panel.inputImage) return;
                    
                    const rect = canvas.getBoundingClientRect();
                    const dpr = window.devicePixelRatio || 1;
                    
                    const mouseX = (e.clientX - rect.left) * (canvas.width / rect.width) / dpr;
                    const mouseY = (e.clientY - rect.top) * (canvas.height / rect.height) / dpr;
                    
                    const imageRect = panel.imageRect;
                    if (!imageRect) return;
                    
                    // 如果正在拖拽
                    if (panel.isDragging && panel.draggingIndex >= 0) {
                        const imgX = (mouseX - imageRect.x) / imageRect.scale;
                        const imgY = (mouseY - imageRect.y) / imageRect.scale;
                        
                        // 限制在图像范围内
                        const clampedX = Math.max(0, Math.min(panel.inputImage.width, imgX));
                        const clampedY = Math.max(0, Math.min(panel.inputImage.height, imgY));
                        
                        panel.annotations[panel.draggingIndex].x = clampedX;
                        panel.annotations[panel.draggingIndex].y = clampedY;
                        
                        self.drawCanvas_internal();
                        self.updateAnnotationParams_internal();
                        return;
                    }
                    
                    // 检查鼠标是否悬停在标注点上
                    let markerSize = 40;
                    const widgets = self.widgets;
                    if (widgets) {
                        for (let w of widgets) {
                            if (w.name === 'marker_size') markerSize = w.value;
                        }
                    }
                    const displaySize = markerSize * imageRect.scale;
                    const hitRadius = displaySize / 2;
                    
                    let hoveringMarker = false;
                    for (let i = 0; i < panel.annotations.length; i++) {
                        const point = panel.annotations[i];
                        const screenX = imageRect.x + point.x * imageRect.scale;
                        const screenY = imageRect.y + point.y * imageRect.scale;
                        
                        const distance = Math.sqrt(
                            Math.pow(mouseX - screenX, 2) + 
                            Math.pow(mouseY - screenY, 2)
                        );
                        
                        if (distance <= hitRadius) {
                            hoveringMarker = true;
                            break;
                        }
                    }
                    
                    // 更新光标样式
                    if (hoveringMarker) {
                        canvasArea.style.cursor = 'grab';
                    } else if (panel.pendingLabel) {
                        canvasArea.style.cursor = 'crosshair';
                    } else {
                        canvasArea.style.cursor = 'default';
                    }
                    
                    // 显示十字光标
                    const imgX = (mouseX - imageRect.x) / imageRect.scale;
                    const imgY = (mouseY - imageRect.y) / imageRect.scale;
                    
                    if (imgX >= 0 && imgX <= panel.inputImage.width &&
                        imgY >= 0 && imgY <= panel.inputImage.height) {
                        panel.hoverPos = { x: mouseX, y: mouseY };
                    } else {
                        panel.hoverPos = null;
                    }
                    
                    self.drawCanvas_internal();
                });
                
                // 鼠标释放 - 结束拖拽
                canvasArea.addEventListener('mouseup', (e) => {
                    if (panel.isDragging) {
                        panel.isDragging = false;
                        panel.draggingIndex = -1;
                        canvasArea.style.cursor = 'default';
                        self.updateAnnotationParams_internal();
                    }
                });
                
                
                canvasArea.addEventListener('mouseleave', () => {
                    panel.hoverPos = null;
                    // 如果正在拖拽，结束拖拽
                    if (panel.isDragging) {
                        panel.isDragging = false;
                        panel.draggingIndex = -1;
                        canvasArea.style.cursor = 'default';
                        self.updateAnnotationParams_internal();
                    }
                    self.drawCanvas_internal();
                });
                
                // 确保canvas不会获得焦点，避免捕获键盘事件
                canvas.setAttribute('tabindex', '-1');
                canvasArea.setAttribute('tabindex', '-1');
                
                canvas.addEventListener('focus', (e) => {
                    e.target.blur();
                });
                
                canvasArea.addEventListener('focus', (e) => {
                    e.target.blur();
                });
                
                // 删除选中按钮
                const deleteBtn = panel.controlPanel.querySelector('#deleteAnnotation');
                if (deleteBtn) {
                    deleteBtn.addEventListener('click', () => {
                        if (panel.selectedIndex >= 0 && panel.selectedIndex < panel.annotations.length) {
                            panel.annotations.splice(panel.selectedIndex, 1);
                            panel.selectedIndex = -1;
                            self.drawCanvas_internal();
                            self.updateAnnotationParams_internal();
                            self.updateAnnotationCount_internal();
                        }
                    });
                }
                
                // 撤销按钮
                const undoBtn = panel.controlPanel.querySelector('#undoAnnotation');
                if (undoBtn) {
                    undoBtn.addEventListener('click', () => {
                        if (panel.annotations.length > 0) {
                            panel.annotations.pop();
                            panel.selectedIndex = -1;
                            self.drawCanvas_internal();
                            self.updateAnnotationParams_internal();
                            self.updateAnnotationCount_internal();
                        }
                    });
                }
                
                // 清空按钮
                const clearBtn = panel.controlPanel.querySelector('#clearAnnotations');
                if (clearBtn) {
                    clearBtn.addEventListener('click', () => {
                        panel.annotations = [];
                        panel.selectedIndex = -1;
                        self.drawCanvas_internal();
                        self.updateAnnotationParams_internal();
                        self.updateAnnotationCount_internal();
                    });
                }
            };
            
            nodeType.prototype.drawCanvas_internal = function() {
                const panel = this.annotatePanel;
                if (!panel) return;
                
                const ctx = panel.ctx;
                const width = panel.displayWidth;
                const height = panel.displayHeight;
                
                ctx.clearRect(0, 0, width, height);
                ctx.fillStyle = '#2a2a2a';
                ctx.fillRect(0, 0, width, height);
                
                if (panel.inputImage && panel.inputImage.complete) {
                    const img = panel.inputImage;
                    const scale = Math.min(width / img.width, height / img.height) * 0.95;
                    const imgWidth = img.width * scale;
                    const imgHeight = img.height * scale;
                    const imgX = (width - imgWidth) / 2;
                    const imgY = (height - imgHeight) / 2;
                    
                    ctx.drawImage(img, imgX, imgY, imgWidth, imgHeight);
                    panel.imageRect = { x: imgX, y: imgY, width: imgWidth, height: imgHeight, scale: scale };
                    
                    // 绘制标注点
                    this.drawAnnotations_internal(ctx, panel.annotations, panel.imageRect);
                    
                    // 绘制鼠标悬停指示器
                    if (panel.hoverPos) {
                        this.drawCrosshair_internal(ctx, panel.hoverPos);
                    }
                } else {
                    ctx.fillStyle = '#666';
                    ctx.font = '14px Arial';
                    ctx.textAlign = 'center';
                    ctx.fillText('点击下方按钮添加标注', width / 2, height / 2);
                    ctx.textAlign = 'left';
                }
            };
            
            nodeType.prototype.drawAnnotations_internal = function(ctx, annotations, imageRect) {
                if (!annotations || annotations.length === 0) return;
                
                // 获取标记大小和颜色
                const widgets = this.widgets;
                let markerSize = 40;
                let fontMode = "按比例";
                let fontScale = 0.5;
                let fontSizePx = 20;
                let fontWeight = "粗体";
                let fontFamily = '';
                let markerColor = "蓝色";
                let textColor = "白色";
                
                if (widgets) {
                    for (let w of widgets) {
                        if (w.name === 'marker_size') markerSize = w.value;
                        if (w.name === 'font_mode') fontMode = w.value;
                        if (w.name === 'font_scale') fontScale = w.value;
                        if (w.name === 'font_size_px') fontSizePx = w.value;
                        if (w.name === 'font_weight') fontWeight = w.value;
                        if (w.name === 'font_family') fontFamily = w.value;
                        if (w.name === 'marker_color') markerColor = w.value;
                        if (w.name === 'text_color') textColor = w.value;
                    }
                }
                
                // 颜色映射
                const colorMap = {
                    "蓝色": 'rgb(41, 128, 185)',
                    "红色": 'rgb(231, 76, 60)',
                    "绿色": 'rgb(46, 204, 113)',
                    "黄色": 'rgb(241, 196, 15)',
                    "紫色": 'rgb(155, 89, 182)',
                    "橙色": 'rgb(230, 126, 34)',
                    "青色": 'rgb(26, 188, 156)',
                    "粉色": 'rgb(236, 112, 140)',
                    "深蓝": 'rgb(52, 73, 94)',
                    "深绿": 'rgb(39, 174, 96)',
                    "棕色": 'rgb(165, 105, 79)',
                    "灰色": 'rgb(127, 140, 141)'
                };
                
                const textColorMap = {
                    "白色": '#ffffff',
                    "黑色": '#000000'
                };
                
                const fillColor = colorMap[markerColor] || colorMap["蓝色"];
                const txtColor = textColorMap[textColor] || textColorMap["白色"];
                
                // 根据显示缩放调整标记大小
                const displaySize = markerSize * imageRect.scale;
                const baseFontSize = fontMode === "固定字号" ? fontSizePx : markerSize * fontScale;
                const displayFontSize = Math.max(6, Math.floor(baseFontSize * imageRect.scale));
                const fontWeightValue = fontWeight === "粗体" ? "bold" : "normal";
                const fontFamilyChain = fontFamily && fontFamily.trim()
                    ? fontFamily
                    : '"Microsoft YaHei","微软雅黑","SimHei","黑体",Arial,sans-serif';
                
                const panel = this.annotatePanel;
                
                annotations.forEach((point, index) => {
                    // 转换为屏幕坐标
                    const screenX = imageRect.x + point.x * imageRect.scale;
                    const screenY = imageRect.y + point.y * imageRect.scale;
                    
                    // 使用存储的标签
                    const label = point.label || String(index + 1);
                    
                    // 判断是否为选中状态
                    const isSelected = (panel && panel.selectedIndex === index);
                    
                    // 绘制地图标记样式
                    this.drawMapMarker_internal(ctx, screenX, screenY, displaySize, fillColor, label, txtColor, isSelected, displayFontSize, fontWeightValue, fontFamilyChain);
                });
            };
            
            nodeType.prototype.drawMapMarker_internal = function(ctx, x, y, size, fillColor, label, textColor, isSelected, fontSizePx, fontWeightValue, fontFamilyChain) {
                const radius = size / 2;
                const tipHeight = size / 3;
                
                ctx.save();
                
                // 如果选中，绘制外圈高亮
                if (isSelected) {
                    ctx.strokeStyle = '#FFD700'; // 金色
                    ctx.lineWidth = 4;
                    ctx.beginPath();
                    ctx.arc(x, y, radius + 6, 0, Math.PI * 2);
                    ctx.stroke();
                }
                
                // 绘制阴影
                ctx.shadowColor = 'rgba(0, 0, 0, 0.3)';
                ctx.shadowBlur = 5;
                ctx.shadowOffsetX = 2;
                ctx.shadowOffsetY = 2;
                
                // 绘制底部尖角
                ctx.fillStyle = fillColor;
                ctx.beginPath();
                ctx.moveTo(x, y + radius + tipHeight);
                ctx.lineTo(x - radius / 2, y + radius);
                ctx.lineTo(x + radius / 2, y + radius);
                ctx.closePath();
                ctx.fill();
                
                // 绘制圆形主体
                ctx.beginPath();
                ctx.arc(x, y, radius, 0, Math.PI * 2);
                ctx.fill();
                
                // 取消阴影
                ctx.shadowColor = 'transparent';
                
                // 绘制白色内圈边框
                ctx.strokeStyle = isSelected ? 'rgba(255, 215, 0, 0.9)' : 'rgba(255, 255, 255, 0.7)';
                ctx.lineWidth = 2;
                ctx.beginPath();
                ctx.arc(x, y, radius - 3, 0, Math.PI * 2);
                ctx.stroke();
                
                // 绘制文字
                ctx.fillStyle = textColor;
                // 使用支持中文的字体，按优先级尝试
                ctx.font = `${fontWeightValue} ${fontSizePx}px ${fontFamilyChain}`;
                ctx.textAlign = 'center';
                ctx.textBaseline = 'alphabetic';
                const metrics = ctx.measureText(label);
                const ascent = metrics.actualBoundingBoxAscent || fontSizePx * 0.8;
                const descent = metrics.actualBoundingBoxDescent || fontSizePx * 0.2;
                const textHeight = ascent + descent;
                // 将文字中心对齐到圆心：基线位置 = y + ascent - textHeight/2
                const textY = y + ascent - textHeight / 2;
                ctx.fillText(label, x, textY);
                
                ctx.restore();
            };
            
            nodeType.prototype.drawCrosshair_internal = function(ctx, pos) {
                ctx.save();
                ctx.strokeStyle = 'rgba(255, 255, 255, 0.6)';
                ctx.lineWidth = 1;
                ctx.setLineDash([4, 4]);
                
                const size = 15;
                
                // 绘制十字线
                ctx.beginPath();
                ctx.moveTo(pos.x - size, pos.y);
                ctx.lineTo(pos.x + size, pos.y);
                ctx.moveTo(pos.x, pos.y - size);
                ctx.lineTo(pos.x, pos.y + size);
                ctx.stroke();
                
                // 绘制中心点
                ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
                ctx.beginPath();
                ctx.arc(pos.x, pos.y, 2, 0, Math.PI * 2);
                ctx.fill();
                
                ctx.restore();
            };
            
            nodeType.prototype.updateAnnotationParams_internal = function() {
                const panel = this.annotatePanel;
                if (!panel) return;
                
                // 将标注点转换为字符串格式: "x1,y1,label1;x2,y2,label2;x3,y3,label3"
                const annotationsStr = panel.annotations
                    .map(p => `${p.x.toFixed(1)},${p.y.toFixed(1)},${p.label || ''}`)
                    .join(';');
                
                // 更新widget值
                const widgets = this.widgets;
                if (widgets) {
                    for (let w of widgets) {
                        if (w.name === 'annotations') {
                            w.value = annotationsStr;
                        }
                        if (w.name === 'selected_index') {
                            w.value = panel.selectedIndex;
                        }
                    }
                }
            };
            
            nodeType.prototype.updateAnnotationCount_internal = function() {
                const panel = this.annotatePanel;
                if (!panel) return;
                
                const countSpan = panel.controlPanel.querySelector('#annotationCount');
                if (countSpan) {
                    countSpan.textContent = panel.annotations.length;
                }
            };
            
            // 复用图像加载逻辑
            nodeType.prototype.loadInputImage_internal = function() {
                const imageInput = this.inputs?.find(input => input.name === "image");
                if (!imageInput || !imageInput.link) {
                    if (this.annotatePanel && this.annotatePanel.inputImage) {
                        this.annotatePanel.inputImage = null;
                        this.annotatePanel.currentSrc = null;
                    }
                    this.drawCanvas_internal();
                    return;
                }
                
                const link = app.graph.links[imageInput.link];
                if (!link) {
                    this.drawCanvas_internal();
                    return;
                }
                
                const sourceNode = app.graph.getNodeById(link.origin_id);
                if (!sourceNode) {
                    this.drawCanvas_internal();
                    return;
                }
                
                this.sourceImageNode = sourceNode;
                const imageSrc = this.findImageSource_internal(sourceNode);
                if (imageSrc) {
                    this.loadImage_internal(imageSrc);
                } else {
                    this.drawCanvas_internal();
                }
            };
            
            nodeType.prototype.findImageSource_internal = function(node, visited = new Set(), isDirectConnection = true) {
                if (!node || visited.has(node.id)) {
                    return null;
                }
                visited.add(node.id);
                
                if (isDirectConnection) {
                    if (node.images && node.images.length > 0) {
                        const imageInfo = node.images[0];
                        const imageUrl = `/view?filename=${imageInfo.filename}&subfolder=${imageInfo.subfolder || ''}&type=${imageInfo.type || 'output'}`;
                        return imageUrl;
                    }
                    
                    if (node.imgs && node.imgs.length > 0) {
                        const imgElement = node.imgs[0];
                        if (imgElement && imgElement.src && imgElement.complete) {
                            return imgElement.src;
                        }
                    }
                } else {
                    if (node.imgs && node.imgs.length > 0) {
                        const imgElement = node.imgs[0];
                        if (imgElement && imgElement.src && imgElement.complete) {
                            return imgElement.src;
                        }
                    }
                    
                    if (node.images && node.images.length > 0) {
                        const imageInfo = node.images[0];
                        const imageUrl = `/view?filename=${imageInfo.filename}&subfolder=${imageInfo.subfolder || ''}&type=${imageInfo.type || 'output'}`;
                        return imageUrl;
                    }
                }
                
                if (node.widgets) {
                    for (const widget of node.widgets) {
                        if (widget.type === 'image' && widget.value) {
                            return widget.value;
                        }
                    }
                }
                
                if (node.inputs) {
                    for (const input of node.inputs) {
                        if (input.link) {
                            const link = app.graph.links[input.link];
                            if (link) {
                                const sourceNode = app.graph.getNodeById(link.origin_id);
                                if (sourceNode) {
                                    const result = this.findImageSource_internal(sourceNode, visited, false);
                                    if (result) return result;
                                }
                            }
                        }
                    }
                }
                
                return null;
            };
            
            nodeType.prototype.loadImage_internal = function(src) {
                const panel = this.annotatePanel;
                if (!panel) return;
                
                if (src === panel.currentSrc) return;
                
                panel.currentSrc = src;
                
                const img = new Image();
                img.crossOrigin = "anonymous";
                
                img.onload = () => {
                    panel.inputImage = img;
                    // 清空之前的标注
                    panel.annotations = [];
                    this.drawCanvas_internal();
                    this.updateAnnotationParams_internal();
                    this.updateAnnotationCount_internal();
                };
                
                img.onerror = () => {
                    panel.inputImage = null;
                    this.drawCanvas_internal();
                };
                
                img.src = src;
            };
        }
    }
});

console.log("🔵BB图像标注面板扩展已加载");
