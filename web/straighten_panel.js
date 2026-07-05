import { app } from "../../scripts/app.js";

app.registerExtension({
    name: "StraightenLayerPanel",
    
    async beforeRegisterNodeDef(nodeType, nodeData, app) {
        if (nodeData.name === "StraightenLayerWithPanel") {
            
            const onNodeCreated = nodeType.prototype.onNodeCreated;
            nodeType.prototype.onNodeCreated = function () {
                const r = onNodeCreated ? onNodeCreated.apply(this, arguments) : undefined;
                
                this.addStraightenPanel_internal();
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
                
                // 节点添加到图形后，强制重绘
                setTimeout(() => {
                    if (this.setDirtyCanvas) {
                        this.setDirtyCanvas(true, true);
                    }
                    if (this.graph && this.graph.setDirtyCanvas) {
                        this.graph.setDirtyCanvas(true, true);
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
            
            nodeType.prototype.addStraightenPanel_internal = function() {
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
                    <div>📐 角度: <span id="angle">0.00°</span></div>
                    <div>📏 参考线长度: <span id="lineLength">0</span></div>
                    <button id="resetLine" style="padding: 2px 8px; cursor: pointer; background: #555; border: 1px solid #777; border-radius: 3px; color: #fff;">重置参考线</button>
                `;
                
                canvasArea.appendChild(canvas);
                container.appendChild(canvasArea);
                container.appendChild(controlPanel);
                
                const widget = this.addDOMWidget("straighten_panel", "div", container);
                widget.computeSize = () => [this.size ? this.size[0] : 400, 350];
                
                this.straightenPanel = {
                    canvas: canvas,
                    ctx: canvas.getContext('2d'),
                    controlPanel: controlPanel,
                    canvasArea: canvasArea,
                    isDrawingLine: false,
                    referenceLine: null,
                    inputImage: null
                };
                
                this.bindStraightenEvents_internal();
                this.updateCanvasSize_internal();
                
                // 初始加载
                setTimeout(() => this.loadInputImage_internal(), 500);
                
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
                    if (self.updateCanvasSize_internal) self.updateCanvasSize_internal();
                };
            };
            
            nodeType.prototype.updateCanvasSize_internal = function() {
                const panel = this.straightenPanel;
                if (!panel) return;
                
                const rect = panel.canvasArea.getBoundingClientRect();
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
            
            nodeType.prototype.bindStraightenEvents_internal = function() {
                const panel = this.straightenPanel;
                const canvasArea = panel.canvasArea;
                const canvas = panel.canvas;
                const self = this;
                
                canvasArea.addEventListener('mousedown', (e) => {
                    if (!panel.inputImage) return;
                    
                    const rect = canvas.getBoundingClientRect();
                    const dpr = window.devicePixelRatio || 1;
                    
                    // 考虑设备像素比的坐标转换
                    const mouseX = (e.clientX - rect.left) * (canvas.width / rect.width) / dpr;
                    const mouseY = (e.clientY - rect.top) * (canvas.height / rect.height) / dpr;
                    
                    console.log(`[StraightenLayer] Click: client(${e.clientX}, ${e.clientY}), rect(${rect.left}, ${rect.top}), mouse(${mouseX}, ${mouseY})`);
                    
                    panel.isDrawingLine = true;
                    panel.referenceLine = { startX: mouseX, startY: mouseY, endX: mouseX, endY: mouseY };
                    self.drawCanvas_internal();
                    
                    e.preventDefault();
                    e.stopPropagation();
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
                
                canvasArea.addEventListener('mousemove', (e) => {
                    if (!panel.inputImage) return;
                    
                    const rect = canvas.getBoundingClientRect();
                    const dpr = window.devicePixelRatio || 1;
                    
                    // 考虑设备像素比的坐标转换
                    const mouseX = (e.clientX - rect.left) * (canvas.width / rect.width) / dpr;
                    const mouseY = (e.clientY - rect.top) * (canvas.height / rect.height) / dpr;
                    
                    // 记录鼠标位置用于指示器
                    panel.mousePos = { x: mouseX, y: mouseY };
                    
                    if (panel.isDrawingLine) {
                        panel.referenceLine.endX = mouseX;
                        panel.referenceLine.endY = mouseY;
                        self.updateAngleDisplay_internal();
                    }
                    
                    self.drawCanvas_internal();
                });
                
                canvasArea.addEventListener('mouseup', (e) => {
                    if (!panel.isDrawingLine) return;
                    panel.isDrawingLine = false;
                    self.updateReferenceLineParams_internal();
                    self.updateAngleDisplay_internal();
                });
                
                canvasArea.addEventListener('mouseleave', (e) => {
                    if (panel.isDrawingLine) panel.isDrawingLine = false;
                });
                
                const resetBtn = panel.controlPanel.querySelector('#resetLine');
                if (resetBtn) {
                    resetBtn.addEventListener('click', () => {
                        panel.referenceLine = null;
                        self.resetReferenceLineParams_internal();
                        self.drawCanvas_internal();
                        self.updateAngleDisplay_internal();
                    });
                }
            };
            
            nodeType.prototype.drawCanvas_internal = function() {
                const panel = this.straightenPanel;
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
                    
                    if (panel.referenceLine) {
                        const line = panel.referenceLine;
                        ctx.strokeStyle = '#00ffff';
                        ctx.lineWidth = 3;
                        ctx.beginPath();
                        ctx.moveTo(line.startX, line.startY);
                        ctx.lineTo(line.endX, line.endY);
                        ctx.stroke();
                        
                        ctx.fillStyle = '#ff0000';
                        ctx.strokeStyle = '#ffffff';
                        ctx.lineWidth = 2;
                        [line.startX, line.startY, line.endX, line.endY].forEach((_, i) => {
                            if (i % 2 === 0) {
                                const x = i === 0 ? line.startX : line.endX;
                                const y = i === 0 ? line.startY : line.endY;
                                ctx.beginPath();
                                ctx.arc(x, y, 6, 0, Math.PI * 2);
                                ctx.fill();
                                ctx.stroke();
                            }
                        });
                        
                        const angle = this.calculateAngle_internal(line);
                        ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
                        ctx.fillRect(10, 10, 150, 30);
                        ctx.fillStyle = '#ffff00';
                        ctx.font = '14px Arial';
                        ctx.fillText(`角度: ${angle.toFixed(2)}°`, 20, 30);
                    }
                    
                    // 绘制鼠标位置指示器（调试用）
                    if (panel.mousePos) {
                        this.drawMouseIndicator_internal(ctx, panel.mousePos);
                    }
                } else {
                    ctx.fillStyle = '#666';
                    ctx.font = '14px Arial';
                    ctx.textAlign = 'center';
                    ctx.fillText('拖拽鼠标绘制参考线', width / 2, height / 2);
                    ctx.textAlign = 'left';
                }
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
            
            nodeType.prototype.calculateAngle_internal = function(line) {
                const dx = line.endX - line.startX;
                const dy = line.endY - line.startY;
                return Math.atan2(dy, dx) * 180 / Math.PI;
            };
            
            nodeType.prototype.updateAngleDisplay_internal = function() {
                const panel = this.straightenPanel;
                if (panel.referenceLine) {
                    const line = panel.referenceLine;
                    const angle = this.calculateAngle_internal(line);
                    const dx = line.endX - line.startX;
                    const dy = line.endY - line.startY;
                    const length = Math.sqrt(dx * dx + dy * dy);
                    
                    const angleSpan = panel.controlPanel.querySelector('#angle');
                    const lengthSpan = panel.controlPanel.querySelector('#lineLength');
                    if (angleSpan) angleSpan.textContent = `${angle.toFixed(2)}°`;
                    if (lengthSpan) lengthSpan.textContent = `${length.toFixed(0)}px`;
                }
            };
            
            nodeType.prototype.updateReferenceLineParams_internal = function() {
                const panel = this.straightenPanel;
                if (!panel || !panel.referenceLine || !panel.imageRect) return;
                
                const line = panel.referenceLine;
                const rect = panel.imageRect;
                
                const x1 = (line.startX - rect.x) / rect.scale;
                const y1 = (line.startY - rect.y) / rect.scale;
                const x2 = (line.endX - rect.x) / rect.scale;
                const y2 = (line.endY - rect.y) / rect.scale;
                const angle = this.calculateAngle_internal(line);
                
                const widgets = this.widgets;
                if (widgets) {
                    for (let w of widgets) {
                        if (w.name === "reference_line_x1") w.value = x1;
                        if (w.name === "reference_line_y1") w.value = y1;
                        if (w.name === "reference_line_x2") w.value = x2;
                        if (w.name === "reference_line_y2") w.value = y2;
                        if (w.name === "rotation_angle") w.value = angle;
                    }
                }
            };
            
            nodeType.prototype.resetReferenceLineParams_internal = function() {
                const widgets = this.widgets;
                if (widgets) {
                    for (let w of widgets) {
                        if (w.name === "reference_line_x1") w.value = 0;
                        if (w.name === "reference_line_y1") w.value = 0;
                        if (w.name === "reference_line_x2") w.value = 100;
                        if (w.name === "reference_line_y2") w.value = 0;
                        if (w.name === "rotation_angle") w.value = 0;
                    }
                }
            };
            
            nodeType.prototype.loadInputImage_internal = function() {
                const imageInput = this.inputs?.find(input => input.name === "image");
                if (!imageInput || !imageInput.link) {
                    // 没有连接时清除图像并显示占位符
                    if (this.straightenPanel && this.straightenPanel.inputImage) {
                        this.straightenPanel.inputImage = null;
                        this.straightenPanel.currentSrc = null;
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
                
                // 保存源节点引用
                this.sourceImageNode = sourceNode;
                
                // 尝试从当前节点和连接链中获取图像
                const imageSrc = this.findImageSource_internal(sourceNode);
                if (imageSrc) {
                    this.loadImage_internal(imageSrc);
                } else {
                    this.drawCanvas_internal();
                }
            };
            
            nodeType.prototype.findImageSource_internal = function(node, visited = new Set(), isDirectConnection = true) {
                // 防止循环引用
                if (!node || visited.has(node.id)) {
                    return null;
                }
                visited.add(node.id);
                
                console.log(`[StraightenLayer] Checking node: ${node.type || node.title} (ID: ${node.id}), Direct: ${isDirectConnection}`);
                
                // 对于直接连接的节点，优先使用其执行后的输出图像
                if (isDirectConnection) {
                    // 优先级1: 从节点的images属性获取（执行后的输出图像）
                    if (node.images && node.images.length > 0) {
                        const imageInfo = node.images[0];
                        const imageUrl = `/view?filename=${imageInfo.filename}&subfolder=${imageInfo.subfolder || ''}&type=${imageInfo.type || 'output'}`;
                        console.log(`[StraightenLayer] ✓ Found processed image from direct node: ${node.type || node.title}`);
                        return imageUrl;
                    }
                    
                    // 优先级2: 从节点的imgs属性获取（显示的图像）
                    if (node.imgs && node.imgs.length > 0) {
                        const imgElement = node.imgs[0];
                        if (imgElement && imgElement.src && imgElement.complete) {
                            console.log(`[StraightenLayer] ✓ Found image from direct node imgs: ${node.type || node.title}`);
                            return imgElement.src;
                        }
                    }
                } else {
                    // 对于上游节点，优先使用imgs（原始图像），再使用images
                    // 优先级1: 从节点的imgs属性获取（LoadImage等显示的原始图像）
                    if (node.imgs && node.imgs.length > 0) {
                        const imgElement = node.imgs[0];
                        if (imgElement && imgElement.src && imgElement.complete) {
                            console.log(`[StraightenLayer] ✓ Found image from upstream imgs: ${node.type || node.title}`);
                            return imgElement.src;
                        }
                    }
                    
                    // 优先级2: 从节点的images属性获取
                    if (node.images && node.images.length > 0) {
                        const imageInfo = node.images[0];
                        const imageUrl = `/view?filename=${imageInfo.filename}&subfolder=${imageInfo.subfolder || ''}&type=${imageInfo.type || 'output'}`;
                        console.log(`[StraightenLayer] ✓ Found processed image from upstream: ${node.type || node.title}`);
                        return imageUrl;
                    }
                }
                
                // 优先级3: 从节点的widgets获取
                if (node.widgets) {
                    for (const widget of node.widgets) {
                        if (widget.type === 'image' && widget.value) {
                            console.log(`[StraightenLayer] ✓ Found image from widget: ${node.type || node.title}`);
                            return widget.value;
                        }
                    }
                }
                
                // 递归检查输入节点
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
                const panel = this.straightenPanel;
                if (!panel) return;
                
                // 检查是否已经加载了相同的图像
                if (src === panel.currentSrc) return;
                
                console.log(`[StraightenLayer] Loading image: ${src}`);
                panel.currentSrc = src;
                
                const img = new Image();
                img.crossOrigin = "anonymous";
                
                img.onload = () => {
                    console.log(`[StraightenLayer] ✓ Image loaded successfully: ${img.width}x${img.height}`);
                    panel.inputImage = img;
                    this.drawCanvas_internal();
                };
                
                img.onerror = () => {
                    console.error(`[StraightenLayer] ✗ Failed to load image: ${src}`);
                    panel.inputImage = null;
                    this.drawCanvas_internal();
                };
                
                img.src = src;
            };
        }
    }
});

console.log("🔵BB矫正图像面板扩展已加载");
