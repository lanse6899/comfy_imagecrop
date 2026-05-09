import { app } from "../../scripts/app.js";

app.registerExtension({
    name: "PerspectiveCropPanel",
    
    async beforeRegisterNodeDef(nodeType, nodeData, app) {
        if (nodeData.name === "PerspectiveCropWithPanel") {
            
            const onNodeCreated = nodeType.prototype.onNodeCreated;
            nodeType.prototype.onNodeCreated = function () {
                const r = onNodeCreated ? onNodeCreated.apply(this, arguments) : undefined;
                
                this.addPerspectivePanel_internal();
                this.setSize([400, 450]);
                
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
            
            // 监听widget值变化
            const onWidgetChange = nodeType.prototype.onWidgetChange;
            nodeType.prototype.onWidgetChange = function(name, value, old_value, widget) {
                const r = onWidgetChange ? onWidgetChange.apply(this, arguments) : undefined;
                
                // 当自适应开关变化时，控制输出尺寸参数的显示
                if (name === 'auto_size') {
                    this.updateSizeWidgetsVisibility_internal(value);
                }
                
                return r;
            };
            
            nodeType.prototype.addPerspectivePanel_internal = function() {
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
                    cursor: default;
                    overflow: hidden;
                `;
                
                const canvas = document.createElement("canvas");
                canvas.style.cssText = `width: 100%; height: 100%; display: block; cursor: default;`;
                
                const controlPanel = document.createElement("div");
                controlPanel.style.cssText = `
                    background: #333;
                    padding: 8px 10px;
                    border-top: 1px solid #555;
                    font-size: 12px;
                    color: #ddd;
                    display: flex;
                    justify-content: space-between;
                    gap: 5px;
                    min-height: 40px;
                `;
                
                controlPanel.innerHTML = `
                    <div>📐 透视区域: <span id="areaInfo">拖拽角点调整</span></div>
                    <div>📏 输出尺寸: <span id="outputSize">512x512</span></div>
                    <button id="resetPoints" style="padding: 2px 8px; cursor: pointer; background: #555; border: 1px solid #777; border-radius: 3px; color: #fff;">重置角点</button>
                `;
                
                canvasArea.appendChild(canvas);
                container.appendChild(canvasArea);
                container.appendChild(controlPanel);
                
                const widget = this.addDOMWidget("perspective_panel", "div", container);
                widget.computeSize = () => [this.size ? this.size[0] : 400, 350];
                
                this.perspectivePanel = {
                    canvas: canvas,
                    ctx: canvas.getContext('2d'),
                    controlPanel: controlPanel,
                    canvasArea: canvasArea,
                    inputImage: null,
                    isDragging: false,
                    dragPointIndex: -1,
                    hoverPointIndex: -1,
                    points: [
                        { x: 100, y: 100 }, // 左上
                        { x: 300, y: 100 }, // 右上
                        { x: 300, y: 300 }, // 右下
                        { x: 100, y: 300 }  // 左下
                    ]
                };
                
                this.bindPerspectiveEvents_internal();
                
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
                const panel = this.perspectivePanel;
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
            
            nodeType.prototype.bindPerspectiveEvents_internal = function() {
                const panel = this.perspectivePanel;
                const canvasArea = panel.canvasArea;
                const canvas = panel.canvas;
                const self = this;
                
                // 鼠标按下 - 开始拖拽角点
                canvasArea.addEventListener('mousedown', (e) => {
                    if (!panel.inputImage) return;
                    
                    const rect = canvas.getBoundingClientRect();
                    const dpr = window.devicePixelRatio || 1;
                    
                    // 考虑设备像素比的坐标转换
                    const mouseX = (e.clientX - rect.left) * (canvas.width / rect.width) / dpr;
                    const mouseY = (e.clientY - rect.top) * (canvas.height / rect.height) / dpr;
                    
                    // 检查是否点击了某个角点
                    const pointIndex = self.getPointAt_internal(mouseX, mouseY);
                    if (pointIndex !== -1) {
                        panel.isDragging = true;
                        panel.dragPointIndex = pointIndex;
                        canvas.style.cursor = 'move';
                        e.preventDefault();
                        e.stopPropagation();
                    }
                });
                
                // 确保canvas不会获得焦点，避免捕获键盘事件
                canvas.setAttribute('tabindex', '-1');
                canvasArea.setAttribute('tabindex', '-1');
                
                // 防止canvas区域捕获键盘事件，确保剪贴板功能正常
                canvas.addEventListener('focus', (e) => {
                    e.target.blur();
                });
                
                canvasArea.addEventListener('focus', (e) => {
                    e.target.blur();
                });
                
                // 鼠标移动 - 拖拽角点或显示悬停效果
                canvasArea.addEventListener('mousemove', (e) => {
                    if (!panel.inputImage) return;
                    
                    const rect = canvas.getBoundingClientRect();
                    const dpr = window.devicePixelRatio || 1;
                    
                    // 考虑设备像素比的坐标转换
                    const mouseX = (e.clientX - rect.left) * (canvas.width / rect.width) / dpr;
                    const mouseY = (e.clientY - rect.top) * (canvas.height / rect.height) / dpr;
                    
                    if (panel.isDragging && panel.dragPointIndex !== -1) {
                        // 拖拽角点
                        const imageRect = panel.imageRect;
                        if (imageRect) {
                            // 转换为图像坐标
                            const imgX = (mouseX - imageRect.x) / imageRect.scale;
                            const imgY = (mouseY - imageRect.y) / imageRect.scale;
                            
                            // 限制在图像范围内
                            const clampedX = Math.max(0, Math.min(panel.inputImage.width, imgX));
                            const clampedY = Math.max(0, Math.min(panel.inputImage.height, imgY));
                            
                            panel.points[panel.dragPointIndex] = { x: clampedX, y: clampedY };
                            
                            self.drawCanvas_internal();
                            self.updatePointParams_internal();
                            self.updateAreaInfo_internal();
                        }
                    } else {
                        // 检查悬停效果
                        const pointIndex = self.getPointAt_internal(mouseX, mouseY);
                        if (pointIndex !== -1) {
                            canvas.style.cursor = 'move';
                            panel.hoverPointIndex = pointIndex;
                        } else {
                            canvas.style.cursor = 'default';
                            panel.hoverPointIndex = -1;
                        }
                        self.drawCanvas_internal();
                    }
                });
                
                // 鼠标抬起 - 结束拖拽
                canvasArea.addEventListener('mouseup', (e) => {
                    if (panel.isDragging) {
                        panel.isDragging = false;
                        panel.dragPointIndex = -1;
                        canvas.style.cursor = 'default';
                    }
                });
                
                // 鼠标离开
                canvasArea.addEventListener('mouseleave', (e) => {
                    if (panel.isDragging) {
                        panel.isDragging = false;
                        panel.dragPointIndex = -1;
                        canvas.style.cursor = 'default';
                    }
                });
                
                // 重置按钮
                const resetBtn = panel.controlPanel.querySelector('#resetPoints');
                if (resetBtn) {
                    resetBtn.addEventListener('click', () => {
                        self.resetPoints_internal();
                        self.drawCanvas_internal();
                        self.updatePointParams_internal();
                        self.updateAreaInfo_internal();
                    });
                }
            };
            
            nodeType.prototype.getPointAt_internal = function(mouseX, mouseY) {
                const panel = this.perspectivePanel;
                const imageRect = panel.imageRect;
                if (!imageRect) return -1;
                
                const threshold = 12; // 点击检测阈值
                
                for (let i = 0; i < panel.points.length; i++) {
                    const point = panel.points[i];
                    const screenX = imageRect.x + point.x * imageRect.scale;
                    const screenY = imageRect.y + point.y * imageRect.scale;
                    
                    const distance = Math.sqrt(
                        Math.pow(mouseX - screenX, 2) + Math.pow(mouseY - screenY, 2)
                    );
                    
                    if (distance <= threshold) {
                        return i;
                    }
                }
                
                return -1;
            };
            
            nodeType.prototype.drawCanvas_internal = function() {
                const panel = this.perspectivePanel;
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
                    
                    // 绘制透视四边形
                    this.drawPerspectiveQuad_internal(ctx, panel.points, panel.imageRect);
                } else {
                    ctx.fillStyle = '#666';
                    ctx.font = '14px Arial';
                    ctx.textAlign = 'center';
                    ctx.fillText('拖拽四个角点定义透视区域', width / 2, height / 2);
                    ctx.textAlign = 'left';
                }
            };
            
            nodeType.prototype.drawPerspectiveQuad_internal = function(ctx, points, imageRect) {
                // 转换点坐标到屏幕坐标
                const screenPoints = points.map(p => ({
                    x: imageRect.x + p.x * imageRect.scale,
                    y: imageRect.y + p.y * imageRect.scale
                }));
                
                // 绘制四边形边框
                ctx.strokeStyle = '#00ffff';
                ctx.lineWidth = 2;
                ctx.beginPath();
                for (let i = 0; i < screenPoints.length; i++) {
                    const current = screenPoints[i];
                    const next = screenPoints[(i + 1) % screenPoints.length];
                    
                    if (i === 0) {
                        ctx.moveTo(current.x, current.y);
                    }
                    ctx.lineTo(next.x, next.y);
                }
                ctx.closePath();
                ctx.stroke();
                
                // 绘制角点
                const colors = ['#ff0000', '#00ff00', '#0000ff', '#ffff00']; // 红、绿、蓝、黄
                const labels = ['左上', '右上', '右下', '左下'];
                
                screenPoints.forEach((point, index) => {
                    const isHovered = (this.perspectivePanel.hoverPointIndex === index);
                    const isDragging = (this.perspectivePanel.dragPointIndex === index);
                    const size = (isHovered || isDragging) ? 7 : 5; // 悬停时增大
                    
                    // 绘制角点圆圈
                    ctx.fillStyle = colors[index];
                    ctx.strokeStyle = (isHovered || isDragging) ? '#ffff00' : '#ffffff'; // 悬停时黄色边框
                    ctx.lineWidth = (isHovered || isDragging) ? 2 : 1;
                    ctx.beginPath();
                    ctx.arc(point.x, point.y, size, 0, Math.PI * 2);
                    ctx.fill();
                    ctx.stroke();
                    
                    // 绘制内圈增强可见性
                    ctx.fillStyle = '#ffffff';
                    ctx.beginPath();
                    ctx.arc(point.x, point.y, 1, 0, Math.PI * 2);
                    ctx.fill();
                    
                    // 绘制标签
                    ctx.fillStyle = '#ffffff';
                    ctx.font = '12px Arial';
                    ctx.fillText(labels[index], point.x + 12, point.y - 8);
                });
            };
            
            nodeType.prototype.drawPoints_internal = function(ctx, points, imageRect) {
                const colors = ['#ff0000', '#00ff00', '#0000ff', '#ffff00']; // 红、绿、蓝、黄
                const labels = ['左上', '右上', '右下', '左下'];
                
                points.forEach((point, index) => {
                    const screenX = imageRect.x + point.x * imageRect.scale;
                    const screenY = imageRect.y + point.y * imageRect.scale;
                    const size = 6; // 缩小角点尺寸
                    
                    // 绘制角点圆圈
                    ctx.fillStyle = colors[index];
                    ctx.strokeStyle = '#ffffff';
                    ctx.lineWidth = 2;
                    ctx.beginPath();
                    ctx.arc(screenX, screenY, size, 0, Math.PI * 2);
                    ctx.fill();
                    ctx.stroke();
                    
                    // 绘制标签
                    ctx.fillStyle = '#ffffff';
                    ctx.font = '12px Arial';
                    ctx.fillText(labels[index], screenX + 10, screenY - 8);
                });
            };
            
            nodeType.prototype.drawPreviewPoint_internal = function(ctx, point, imageRect, index) {
                const colors = ['#ff0000', '#00ff00', '#0000ff', '#ffff00'];
                const labels = ['左上', '右上', '右下', '左下'];
                
                const screenX = imageRect.x + point.x * imageRect.scale;
                const screenY = imageRect.y + point.y * imageRect.scale;
                
                // 绘制预览点（半透明）
                ctx.globalAlpha = 0.7;
                ctx.fillStyle = colors[index];
                ctx.strokeStyle = '#ffffff';
                ctx.lineWidth = 2;
                ctx.beginPath();
                ctx.arc(screenX, screenY, 6, 0, Math.PI * 2);
                ctx.fill();
                ctx.stroke();
                
                // 绘制标签
                ctx.fillStyle = '#ffffff';
                ctx.font = '12px Arial';
                ctx.fillText(labels[index], screenX + 10, screenY - 8);
                ctx.globalAlpha = 1.0;
            };
            
            nodeType.prototype.drawLines_internal = function(ctx, points, imageRect) {
                if (points.length < 2) return;
                
                ctx.strokeStyle = '#00ffff';
                ctx.lineWidth = 2;
                ctx.setLineDash([5, 5]); // 虚线
                
                // 绘制已有的连线
                for (let i = 0; i < points.length - 1; i++) {
                    const current = points[i];
                    const next = points[i + 1];
                    
                    const currentScreen = {
                        x: imageRect.x + current.x * imageRect.scale,
                        y: imageRect.y + current.y * imageRect.scale
                    };
                    const nextScreen = {
                        x: imageRect.x + next.x * imageRect.scale,
                        y: imageRect.y + next.y * imageRect.scale
                    };
                    
                    ctx.beginPath();
                    ctx.moveTo(currentScreen.x, currentScreen.y);
                    ctx.lineTo(nextScreen.x, nextScreen.y);
                    ctx.stroke();
                }
                
                // 如果有4个点，闭合四边形
                if (points.length === 4) {
                    const first = points[0];
                    const last = points[3];
                    
                    const firstScreen = {
                        x: imageRect.x + first.x * imageRect.scale,
                        y: imageRect.y + first.y * imageRect.scale
                    };
                    const lastScreen = {
                        x: imageRect.x + last.x * imageRect.scale,
                        y: imageRect.y + last.y * imageRect.scale
                    };
                    
                    ctx.beginPath();
                    ctx.moveTo(lastScreen.x, lastScreen.y);
                    ctx.lineTo(firstScreen.x, firstScreen.y);
                    ctx.stroke();
                }
                
                ctx.setLineDash([]); // 恢复实线
            };
            
            nodeType.prototype.drawMouseIndicator_internal = function(ctx, mousePos) {
                // 绘制鼠标位置的十字线指示器
                ctx.strokeStyle = '#ff00ff'; // 洋红色
                ctx.lineWidth = 1;
                ctx.setLineDash([2, 2]);
                
                const size = 10;
                
                // 绘制十字线
                ctx.beginPath();
                ctx.moveTo(mousePos.x - size, mousePos.y);
                ctx.lineTo(mousePos.x + size, mousePos.y);
                ctx.moveTo(mousePos.x, mousePos.y - size);
                ctx.lineTo(mousePos.x, mousePos.y + size);
                ctx.stroke();
                
                // 绘制中心点
                ctx.fillStyle = '#ff00ff';
                ctx.beginPath();
                ctx.arc(mousePos.x, mousePos.y, 2, 0, Math.PI * 2);
                ctx.fill();
                
                ctx.setLineDash([]); // 恢复实线
            };
            
            nodeType.prototype.resetPoints_internal = function() {
                const panel = this.perspectivePanel;
                if (!panel.inputImage) return;
                
                const img = panel.inputImage;
                const margin = Math.min(img.width, img.height) * 0.1;
                
                panel.points = [
                    { x: margin, y: margin },                           // 左上
                    { x: img.width - margin, y: margin },               // 右上
                    { x: img.width - margin, y: img.height - margin },  // 右下
                    { x: margin, y: img.height - margin }               // 左下
                ];
            };
            
            nodeType.prototype.updatePointParams_internal = function() {
                const panel = this.perspectivePanel;
                if (!panel || panel.points.length !== 4) return;
                
                const widgets = this.widgets;
                if (widgets) {
                    const paramNames = [
                        ['top_left_x', 'top_left_y'],       // 索引0: 左上
                        ['top_right_x', 'top_right_y'],     // 索引1: 右上  
                        ['bottom_right_x', 'bottom_right_y'], // 索引2: 右下
                        ['bottom_left_x', 'bottom_left_y']  // 索引3: 左下
                    ];
                    
                    for (let i = 0; i < 4; i++) {
                        const point = panel.points[i];
                        const [xName, yName] = paramNames[i];
                        
                        for (let w of widgets) {
                            if (w.name === xName) w.value = point.x;
                            if (w.name === yName) w.value = point.y;
                        }
                    }
                }
                
                this.updateAreaInfo_internal();
            };
            
            nodeType.prototype.updateAreaInfo_internal = function() {
                const panel = this.perspectivePanel;
                if (!panel) return;
                
                const areaSpan = panel.controlPanel.querySelector('#areaInfo');
                if (areaSpan && panel.points.length === 4) {
                    // 计算四边形面积（简化）
                    const points = panel.points;
                    const width = Math.abs(points[1].x - points[0].x);
                    const height = Math.abs(points[3].y - points[0].y);
                    areaSpan.textContent = `${width.toFixed(0)}x${height.toFixed(0)}`;
                }
                
                // 更新输出尺寸显示
                const outputSpan = panel.controlPanel.querySelector('#outputSize');
                if (outputSpan) {
                    const widgets = this.widgets;
                    let width = 512, height = 512;
                    
                    if (widgets) {
                        for (let w of widgets) {
                            if (w.name === 'output_width') width = w.value;
                            if (w.name === 'output_height') height = w.value;
                        }
                    }
                    
                    outputSpan.textContent = `${width}x${height}`;
                }
            };
            
            // 复用矫正节点的图像加载逻辑
            nodeType.prototype.loadInputImage_internal = function() {
                const imageInput = this.inputs?.find(input => input.name === "image");
                if (!imageInput || !imageInput.link) {
                    if (this.perspectivePanel && this.perspectivePanel.inputImage) {
                        this.perspectivePanel.inputImage = null;
                        this.perspectivePanel.currentSrc = null;
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
                const panel = this.perspectivePanel;
                if (!panel) return;
                
                if (src === panel.currentSrc) return;
                
                panel.currentSrc = src;
                
                const img = new Image();
                img.crossOrigin = "anonymous";
                
                img.onload = () => {
                    panel.inputImage = img;
                    this.resetPoints_internal(); // 自动重置角点到图像边缘
                    this.drawCanvas_internal();
                    this.updatePointParams_internal();
                    this.updateAreaInfo_internal();
                };
                
                img.onerror = () => {
                    panel.inputImage = null;
                    this.drawCanvas_internal();
                };
                
                img.src = src;
            };
            
            nodeType.prototype.updateSizeWidgetsVisibility_internal = function(autoSize) {
                // 控制输出尺寸参数的显示/隐藏
                if (this.widgets) {
                    for (let widget of this.widgets) {
                        if (widget.name === 'output_width' || widget.name === 'output_height') {
                            // 当自适应开启时隐藏手动尺寸控制
                            widget.type = autoSize ? 'hidden' : 'number';
                            
                            // 更新widget的显示状态
                            if (widget.element) {
                                widget.element.style.display = autoSize ? 'none' : '';
                            }
                        }
                    }
                    
                    // 触发节点重绘以更新UI
                    if (this.setDirtyCanvas) {
                        this.setDirtyCanvas(true, true);
                    }
                }
            };
        }
    }
});

console.log("🔵BB透视剪裁面板扩展已加载");
