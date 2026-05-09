// ComfyUI 图像绘制面板
import { app } from "../../scripts/app.js";

app.registerExtension({
    name: "ImageDrawingPanel",

    async beforeRegisterNodeDef(nodeType, nodeData, app) {
        if (nodeData.name === "ImageDrawingWithPanel") {

            const onNodeCreated = nodeType.prototype.onNodeCreated;
            nodeType.prototype.onNodeCreated = function () {
                const r = onNodeCreated ? onNodeCreated.apply(this, arguments) : undefined;

                this.addDrawingPanel_internal();
                this.setSize([900, 660]);

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

            nodeType.prototype.addDrawingPanel_internal = function() {
                const container = document.createElement("div");
                container.style.cssText = `
                    width: 100%;
                    height: 600px;
                    border: 2px solid #555;
                    border-radius: 6px;
                    background: #1a1a1a;
                    margin: 5px 0;
                    display: flex;
                    flex-direction: column;
                    min-width: 900px;
                `;

                const canvasArea = document.createElement("div");
                canvasArea.style.cssText = `
                    width: 100%;
                    height: 480px;
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

                // 工具栏
                const toolbar = document.createElement("div");
                toolbar.style.cssText = `
                    background: #333;
                    padding: 8px 10px;
                    border-top: 1px solid #555;
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    gap: 10px;
                `;

                toolbar.innerHTML = `
                    <div style="display: flex; gap: 5px; align-items: center;">
                        <button id="brushTool" class="tool-btn active" title="画笔">✏️</button>
                        <button id="rectangleTool" class="tool-btn" title="矩形">▭</button>
                        <button id="circleTool" class="tool-btn" title="圆形">○</button>
                    </div>
                    <div style="display: flex; gap: 5px; align-items: center;">
                        <label style="color: #ddd; font-size: 12px;">大小:</label>
                        <input id="brushSize" type="range" min="1" max="50" value="5" style="width: 60px;">
                        <span id="sizeValue" style="color: #ddd; font-size: 12px; min-width: 20px;">5</span>
                    </div>
                    <div style="display: flex; gap: 5px; align-items: center;">
                        <label style="color: #ddd; font-size: 12px;">模式:</label>
                        <select id="fillMode" style="background: #555; color: #fff; border: 1px solid #777; border-radius: 3px; padding: 2px;">
                            <option value="填充">填充</option>
                            <option value="描边">描边</option>
                        </select>
                    </div>
                    <div style="display: flex; gap: 5px; align-items: center;">
                        <label style="color: #ddd; font-size: 12px;">颜色:</label>
                        <select id="brushColor" style="background: #555; color: #fff; border: 1px solid #777; border-radius: 3px; padding: 2px;">
                            <option value="黑色">黑</option>
                            <option value="白色">白</option>
                            <option value="红色">红</option>
                            <option value="绿色">绿</option>
                            <option value="蓝色">蓝</option>
                            <option value="黄色">黄</option>
                            <option value="紫色">紫</option>
                            <option value="橙色">橙</option>
                            <option value="青色">青</option>
                            <option value="粉色">粉</option>
                        </select>
                    </div>
                `;

                // 控制面板
                const controlPanel = document.createElement("div");
                controlPanel.style.cssText = `
                    background: #2a2a2a;
                    padding: 8px 10px;
                    border-top: 1px solid #555;
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    font-size: 12px;
                    color: #ddd;
                `;

                controlPanel.innerHTML = `
                    <div>绘制操作: <span id="operationCount">0</span></div>
                    <div style="display: flex; gap: 5px;">
                        <button id="undoDrawing" style="padding: 2px 8px; cursor: pointer; background: #555; border: 1px solid #777; border-radius: 3px; color: #fff;">撤销</button>
                        <button id="clearDrawing" style="padding: 2px 8px; cursor: pointer; background: #d32f2f; border: 1px solid #b71c1c; border-radius: 3px; color: #fff;">清空</button>
                    </div>
                `;

                canvasArea.appendChild(canvas);
                container.appendChild(canvasArea);
                container.appendChild(toolbar);
                container.appendChild(controlPanel);

                const widget = this.addDOMWidget("drawing_panel", "div", container);
                // 固定尺寸画板：900px宽，660px高 (增加50%)
                widget.computeSize = () => [900, 660];

                this.drawingPanel = {
                    canvas: canvas,
                    ctx: canvas.getContext('2d'),
                    toolbar: toolbar,
                    controlPanel: controlPanel,
                    canvasArea: canvasArea,
                    inputImage: null,
                    drawingData: [],  // 存储绘制命令
                    currentTool: 'brush',  // 当前工具
                    fillMode: '填充',  // 填充模式
                    isDrawing: false,  // 是否正在绘制
                    currentPath: [],  // 当前绘制路径
                    startPoint: null,  // 矩形/圆形的起始点
                    tempCanvas: null,  // 临时画布用于预览
                    tempCtx: null
                };

                this.bindDrawingEvents_internal();

                // 延迟初始化
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
                // 固定尺寸画板，不需要根据节点大小动态调整
                this.onResize = function(size) {
                    if (originalOnResize) originalOnResize.call(this, size);
                    // 保持固定尺寸，画板大小不变
                };
            };

            nodeType.prototype.updateCanvasSize_internal = function() {
                const panel = this.drawingPanel;
                if (!panel || !panel.canvas || !panel.canvasArea) return;

                const rect = panel.canvasArea.getBoundingClientRect();

                if (rect.width === 0 || rect.height === 0) {
                    setTimeout(() => this.updateCanvasSize_internal(), 100);
                    return;
                }

                // 使用固定尺寸，提供一致的绘制体验 (增加50%)
                const displayWidth = 870;  // 固定宽度 (580 * 1.5)
                const displayHeight = 480; // 固定高度 (320 * 1.5)

                const dpr = window.devicePixelRatio || 1;
                panel.canvas.width = displayWidth * dpr;
                panel.canvas.height = displayHeight * dpr;
                panel.canvas.style.width = displayWidth + 'px';
                panel.canvas.style.height = displayHeight + 'px';

                panel.ctx.scale(dpr, dpr);
                panel.displayWidth = displayWidth;
                panel.displayHeight = displayHeight;

                // 创建临时画布
                if (!panel.tempCanvas) {
                    panel.tempCanvas = document.createElement('canvas');
                    panel.tempCtx = panel.tempCanvas.getContext('2d');
                }
                panel.tempCanvas.width = displayWidth * dpr;
                panel.tempCanvas.height = displayHeight * dpr;

                this.drawCanvas_internal();
            };

            nodeType.prototype.bindDrawingEvents_internal = function() {
                const panel = this.drawingPanel;
                const canvasArea = panel.canvasArea;
                const canvas = panel.canvas;
                const self = this;

                // 工具选择事件
                const toolButtons = panel.toolbar.querySelectorAll('.tool-btn');
                toolButtons.forEach(btn => {
                    btn.addEventListener('click', (e) => {
                        // 移除所有active类
                        toolButtons.forEach(b => b.classList.remove('active'));
                        // 添加active类到当前按钮
                        btn.classList.add('active');

                        // 更新当前工具
                        if (btn.id === 'brushTool') panel.currentTool = 'brush';
                        else if (btn.id === 'rectangleTool') panel.currentTool = 'rectangle';
                        else if (btn.id === 'circleTool') panel.currentTool = 'circle';

                        // 更新widget
                        self.updateToolParameter_internal();
                    });
                });

                // 画笔大小滑块
                const sizeSlider = panel.toolbar.querySelector('#brushSize');
                const sizeValue = panel.toolbar.querySelector('#sizeValue');
                sizeSlider.addEventListener('input', (e) => {
                    sizeValue.textContent = e.target.value;
                    self.updateBrushSize_internal(parseInt(e.target.value));
                });

                // 填充模式选择
                const fillModeSelect = panel.toolbar.querySelector('#fillMode');
                if (fillModeSelect) {
                    fillModeSelect.addEventListener('change', (e) => {
                        panel.fillMode = e.target.value;
                        self.updateFillMode_internal(e.target.value);
                    });
                }

                // 颜色选择
                const colorSelect = panel.toolbar.querySelector('#brushColor');
                colorSelect.addEventListener('change', (e) => {
                    self.updateBrushColor_internal(e.target.value);
                });

                // 鼠标事件
                canvasArea.addEventListener('mousedown', (e) => {
                    if (!panel.inputImage) return;

                    const rect = canvas.getBoundingClientRect();
                    const dpr = window.devicePixelRatio || 1;

                    const mouseX = (e.clientX - rect.left) * (canvas.width / rect.width) / dpr;
                    const mouseY = (e.clientY - rect.top) * (canvas.height / rect.height) / dpr;

                    const imageRect = panel.imageRect;
                    if (!imageRect) return;

                    // 转换为图像坐标
                    const imgX = (mouseX - imageRect.x) / imageRect.scale;
                    const imgY = (mouseY - imageRect.y) / imageRect.scale;

                    // 检查是否在图像范围内
                    if (imgX < 0 || imgX > panel.inputImage.width || imgY < 0 || imgY > panel.inputImage.height) {
                        return;
                    }

                    panel.isDrawing = true;
                    panel.startPoint = { x: imgX, y: imgY };

                    // 保存鼠标位置用于预览
                    panel.lastMouseX = mouseX;
                    panel.lastMouseY = mouseY;

                    if (panel.currentTool === 'brush') {
                        // 开始绘制路径
                        panel.currentPath = [{ x: imgX, y: imgY }];
                    }

                    e.preventDefault();
                });

                canvasArea.addEventListener('mousemove', (e) => {
                    if (!panel.inputImage) return;

                    const rect = canvas.getBoundingClientRect();
                    const dpr = window.devicePixelRatio || 1;

                    const mouseX = (e.clientX - rect.left) * (canvas.width / rect.width) / dpr;
                    const mouseY = (e.clientY - rect.top) * (canvas.height / rect.height) / dpr;

                    const imageRect = panel.imageRect;
                    if (!imageRect) return;

                    // 保存鼠标位置用于预览
                    panel.lastMouseX = mouseX;
                    panel.lastMouseY = mouseY;

                    if (!panel.isDrawing) return;

                    // 转换为图像坐标
                    const imgX = (mouseX - imageRect.x) / imageRect.scale;
                    const imgY = (mouseY - imageRect.y) / imageRect.scale;

                    // 限制在图像范围内
                    const clampedX = Math.max(0, Math.min(panel.inputImage.width, imgX));
                    const clampedY = Math.max(0, Math.min(panel.inputImage.height, imgY));

                    if (panel.currentTool === 'brush') {
                        // 添加到当前路径
                        panel.currentPath.push({ x: clampedX, y: clampedY });
                    }

                    // 实时预览
                    this.drawCanvas_internal();
                });

                canvasArea.addEventListener('mouseup', (e) => {
                    if (!panel.isDrawing) return;

                    panel.isDrawing = false;

                    if (panel.currentTool === 'brush' && panel.currentPath.length >= 2) {
                        // 保存路径命令
                        panel.drawingData.push({
                            type: 'path',
                            tool: 'brush',
                            points: [...panel.currentPath]
                        });
                    } else if ((panel.currentTool === 'rectangle' || panel.currentTool === 'circle') && panel.startPoint) {
                        const rect = canvas.getBoundingClientRect();
                        const dpr = window.devicePixelRatio || 1;

                        const mouseX = (e.clientX - rect.left) * (canvas.width / rect.width) / dpr;
                        const mouseY = (e.clientY - rect.top) * (canvas.height / rect.height) / dpr;

                        const imageRect = panel.imageRect;
                        if (imageRect) {
                            const endX = (mouseX - imageRect.x) / imageRect.scale;
                            const endY = (mouseY - imageRect.y) / imageRect.scale;

                            // 限制在图像范围内
                            const clampedEndX = Math.max(0, Math.min(panel.inputImage.width, endX));
                            const clampedEndY = Math.max(0, Math.min(panel.inputImage.height, endY));

                            if (Math.abs(clampedEndX - panel.startPoint.x) > 5 || Math.abs(clampedEndY - panel.startPoint.y) > 5) {
                                // 保存形状命令
                                panel.drawingData.push({
                                    type: panel.currentTool,
                                    tool: panel.currentTool,
                                    points: [panel.startPoint, { x: clampedEndX, y: clampedEndY }]
                                });
                            }
                        }
                    }

                    panel.currentPath = [];
                    panel.startPoint = null;

                    // 更新参数
                    self.updateDrawingParams_internal();
                    self.drawCanvas_internal();
                });

                // 撤销按钮
                const undoBtn = panel.controlPanel.querySelector('#undoDrawing');
                undoBtn.addEventListener('click', () => {
                    if (panel.drawingData.length > 0) {
                        panel.drawingData.pop();
                        self.updateDrawingParams_internal();
                        self.drawCanvas_internal();
                    }
                });

                // 清空按钮
                const clearBtn = panel.controlPanel.querySelector('#clearDrawing');
                clearBtn.addEventListener('click', () => {
                    panel.drawingData = [];
                    self.updateDrawingParams_internal();
                    self.drawCanvas_internal();
                });

                // 确保canvas不会获得焦点
                canvas.setAttribute('tabindex', '-1');
                canvasArea.setAttribute('tabindex', '-1');

                canvas.addEventListener('focus', (e) => { e.target.blur(); });
                canvasArea.addEventListener('focus', (e) => { e.target.blur(); });
            };

            nodeType.prototype.drawCanvas_internal = function() {
                const panel = this.drawingPanel;
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

                    // 绘制已保存的绘制数据
                    this.drawDrawingData_internal(ctx, panel.drawingData, panel.imageRect);

                    // 绘制当前正在绘制的路径/形状
                    if (panel.isDrawing) {
                        this.drawCurrentDrawing_internal(ctx, panel, panel.imageRect);
                    }
                } else {
                    ctx.fillStyle = '#666';
                    ctx.font = '14px Arial';
                    ctx.textAlign = 'center';
                    ctx.fillText('等待图像输入...', width / 2, height / 2);
                    ctx.textAlign = 'left';
                }
            };

            nodeType.prototype.drawDrawingData_internal = function(ctx, drawingData, imageRect) {
                if (!drawingData || drawingData.length === 0) return;

                // 获取当前画笔设置
                const widgets = this.widgets;
                let brushSize = 5;
                let brushColor = "黑色";
                let fillMode = "填充";

                if (widgets) {
                    for (let w of widgets) {
                        if (w.name === 'brush_size') brushSize = w.value;
                        if (w.name === 'brush_color') brushColor = w.value;
                        if (w.name === 'fill_mode') fillMode = w.value;
                    }
                }

                // 颜色映射
                const colorMap = {
                    "黑色": '#000000',
                    "白色": '#ffffff',
                    "红色": '#ff0000',
                    "绿色": '#00ff00',
                    "蓝色": '#0000ff',
                    "黄色": '#ffff00',
                    "紫色": '#800080',
                    "橙色": '#ffa500',
                    "青色": '#00ffff',
                    "粉色": '#ffc0cb'
                };

                const color = colorMap[brushColor] || '#000000';

                drawingData.forEach(command => {
                    const cmdType = command.type;
                    const points = command.points || [];

                    if (cmdType === 'path' && points.length >= 2) {
                        // 绘制线条路径
                        ctx.strokeStyle = color;
                        ctx.lineWidth = brushSize * imageRect.scale;
                        ctx.lineCap = 'round';
                        ctx.lineJoin = 'round';
                        ctx.beginPath();

                        const firstPoint = points[0];
                        const screenX = imageRect.x + firstPoint.x * imageRect.scale;
                        const screenY = imageRect.y + firstPoint.y * imageRect.scale;
                        ctx.moveTo(screenX, screenY);

                        for (let i = 1; i < points.length; i++) {
                            const point = points[i];
                            const screenX = imageRect.x + point.x * imageRect.scale;
                            const screenY = imageRect.y + point.y * imageRect.scale;
                            ctx.lineTo(screenX, screenY);
                        }

                        ctx.stroke();

                    } else if (cmdType === 'rectangle' && points.length >= 2) {
                        // 根据模式绘制矩形
                        const x1 = imageRect.x + points[0].x * imageRect.scale;
                        const y1 = imageRect.y + points[0].y * imageRect.scale;
                        const x2 = imageRect.x + points[1].x * imageRect.scale;
                        const y2 = imageRect.y + points[1].y * imageRect.scale;

                        const rectX = Math.min(x1, x2);
                        const rectY = Math.min(y1, y2);
                        const rectWidth = Math.abs(x2 - x1);
                        const rectHeight = Math.abs(y2 - y1);

                        if (fillMode === '填充') {
                            ctx.fillStyle = color;
                            ctx.fillRect(rectX, rectY, rectWidth, rectHeight);
                        } else {
                            ctx.strokeStyle = color;
                            ctx.lineWidth = Math.max(1, brushSize * imageRect.scale);
                            ctx.strokeRect(rectX, rectY, rectWidth, rectHeight);
                        }

                    } else if (cmdType === 'circle' && points.length >= 2) {
                        // 根据模式绘制椭圆形
                        const startX = imageRect.x + points[0].x * imageRect.scale;
                        const startY = imageRect.y + points[0].y * imageRect.scale;
                        const endX = imageRect.x + points[1].x * imageRect.scale;
                        const endY = imageRect.y + points[1].y * imageRect.scale;

                        const left = Math.min(startX, endX);
                        const top = Math.min(startY, endY);
                        const right = Math.max(startX, endX);
                        const bottom = Math.max(startY, endY);

                        // 绘制椭圆
                        const centerX = (left + right) / 2;
                        const centerY = (top + bottom) / 2;
                        const width = right - left;
                        const height = bottom - top;

                        ctx.beginPath();
                        ctx.ellipse(centerX, centerY, width / 2, height / 2, 0, 0, Math.PI * 2);

                        if (fillMode === '填充') {
                            ctx.fillStyle = color;
                            ctx.fill();
                        } else {
                            ctx.strokeStyle = color;
                            ctx.lineWidth = Math.max(1, brushSize * imageRect.scale);
                            ctx.stroke();
                        }
                    }
                });
            };

            nodeType.prototype.drawCurrentDrawing_internal = function(ctx, panel, imageRect) {
                // 获取当前画笔设置
                const widgets = this.widgets;
                let brushSize = 5;
                let brushColor = "黑色";
                let fillMode = panel.fillMode || "填充";

                if (widgets) {
                    for (let w of widgets) {
                        if (w.name === 'brush_size') brushSize = w.value;
                        if (w.name === 'brush_color') brushColor = w.value;
                        if (w.name === 'fill_mode') fillMode = w.value;
                    }
                }

                // 颜色映射
                const colorMap = {
                    "黑色": '#000000',
                    "白色": '#ffffff',
                    "红色": '#ff0000',
                    "绿色": '#00ff00',
                    "蓝色": '#0000ff',
                    "黄色": '#ffff00',
                    "紫色": '#800080',
                    "橙色": '#ffa500',
                    "青色": '#00ffff',
                    "粉色": '#ffc0cb'
                };

                const color = colorMap[brushColor] || '#000000';

                if (panel.currentTool === 'brush' && panel.currentPath.length >= 2) {
                    // 绘制当前路径
                    ctx.strokeStyle = color;
                    ctx.lineWidth = brushSize * imageRect.scale;
                    ctx.lineCap = 'round';
                    ctx.lineJoin = 'round';
                    ctx.beginPath();

                    const firstPoint = panel.currentPath[0];
                    const screenX = imageRect.x + firstPoint.x * imageRect.scale;
                    const screenY = imageRect.y + firstPoint.y * imageRect.scale;
                    ctx.moveTo(screenX, screenY);

                    for (let i = 1; i < panel.currentPath.length; i++) {
                        const point = panel.currentPath[i];
                        const screenX = imageRect.x + point.x * imageRect.scale;
                        const screenY = imageRect.y + point.y * imageRect.scale;
                        ctx.lineTo(screenX, screenY);
                    }

                    ctx.stroke();

                } else if ((panel.currentTool === 'rectangle' || panel.currentTool === 'circle') && panel.startPoint) {
                    // 绘制预览形状
                    const rect = panel.canvas.getBoundingClientRect();
                    const dpr = window.devicePixelRatio || 1;

                    const mouseX = panel.lastMouseX || 0;
                    const mouseY = panel.lastMouseY || 0;

                    if (mouseX && mouseY) {
                        const endX = (mouseX - imageRect.x) / imageRect.scale;
                        const endY = (mouseY - imageRect.y) / imageRect.scale;

                        if (panel.currentTool === 'rectangle') {
                            // 预览矩形
                            const x1 = imageRect.x + panel.startPoint.x * imageRect.scale;
                            const y1 = imageRect.y + panel.startPoint.y * imageRect.scale;
                            const x2 = imageRect.x + endX * imageRect.scale;
                            const y2 = imageRect.y + endY * imageRect.scale;

                            const rectX = Math.min(x1, x2);
                            const rectY = Math.min(y1, y2);
                            const rectWidth = Math.abs(x2 - x1);
                            const rectHeight = Math.abs(y2 - y1);

                            if (fillMode === '填充') {
                                ctx.fillStyle = color + '80';  // 添加透明度
                                ctx.fillRect(rectX, rectY, rectWidth, rectHeight);
                            } else {
                                ctx.strokeStyle = color + '80';  // 添加透明度
                                ctx.lineWidth = Math.max(1, brushSize * imageRect.scale);
                                ctx.strokeRect(rectX, rectY, rectWidth, rectHeight);
                            }

                        } else if (panel.currentTool === 'circle') {
                            // 预览椭圆形
                            const startX = imageRect.x + panel.startPoint.x * imageRect.scale;
                            const startY = imageRect.y + panel.startPoint.y * imageRect.scale;
                            const endX_screen = imageRect.x + endX * imageRect.scale;
                            const endY_screen = imageRect.y + endY * imageRect.scale;

                            const left = Math.min(startX, endX_screen);
                            const top = Math.min(startY, endY_screen);
                            const right = Math.max(startX, endX_screen);
                            const bottom = Math.max(startY, endY_screen);

                            // 绘制椭圆
                            const centerX = (left + right) / 2;
                            const centerY = (top + bottom) / 2;
                            const width = right - left;
                            const height = bottom - top;

                            ctx.beginPath();
                            // 使用椭圆路径
                            ctx.ellipse(centerX, centerY, width / 2, height / 2, 0, 0, Math.PI * 2);

                            if (fillMode === '填充') {
                                ctx.fillStyle = color + '80';  // 添加透明度
                                ctx.fill();
                            } else {
                                ctx.strokeStyle = color + '80';  // 添加透明度
                                ctx.lineWidth = Math.max(1, brushSize * imageRect.scale);
                                ctx.stroke();
                            }
                        }
                    }
                }
            };

            nodeType.prototype.updateDrawingParams_internal = function() {
                const panel = this.drawingPanel;
                if (!panel) return;

                // 将绘制数据转换为JSON字符串
                const drawingDataStr = JSON.stringify(panel.drawingData);

                // 更新widget值
                const widgets = this.widgets;
                if (widgets) {
                    for (let w of widgets) {
                        if (w.name === 'drawing_data') {
                            w.value = drawingDataStr;
                        }
                    }
                }

                // 更新操作计数
                const countSpan = panel.controlPanel.querySelector('#operationCount');
                if (countSpan) {
                    countSpan.textContent = panel.drawingData.length;
                }
            };

            nodeType.prototype.updateToolParameter_internal = function() {
                const panel = this.drawingPanel;
                if (!panel) return;

                const widgets = this.widgets;
                if (widgets) {
                    for (let w of widgets) {
                        if (w.name === 'current_tool') {
                            w.value = panel.currentTool;
                        }
                    }
                }
            };

            nodeType.prototype.updateBrushSize_internal = function(size) {
                const widgets = this.widgets;
                if (widgets) {
                    for (let w of widgets) {
                        if (w.name === 'brush_size') {
                            w.value = size;
                        }
                    }
                }
            };

            nodeType.prototype.updateBrushColor_internal = function(color) {
                const widgets = this.widgets;
                if (widgets) {
                    for (let w of widgets) {
                        if (w.name === 'brush_color') {
                            w.value = color;
                        }
                    }
                }
            };

            nodeType.prototype.updateFillMode_internal = function(mode) {
                const widgets = this.widgets;
                if (widgets) {
                    for (let w of widgets) {
                        if (w.name === 'fill_mode') {
                            w.value = mode;
                        }
                    }
                }
            };

            // 复用图像加载逻辑
            nodeType.prototype.loadInputImage_internal = function() {
                const imageInput = this.inputs?.find(input => input.name === "image");
                if (!imageInput || !imageInput.link) {
                    if (this.drawingPanel && this.drawingPanel.inputImage) {
                        this.drawingPanel.inputImage = null;
                        this.drawingPanel.currentSrc = null;
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
                const panel = this.drawingPanel;
                if (!panel) return;

                if (src === panel.currentSrc) return;

                panel.currentSrc = src;

                const img = new Image();
                img.crossOrigin = "anonymous";

                img.onload = () => {
                    panel.inputImage = img;
                    // 清空之前的绘制数据（如果需要的话）
                    // panel.drawingData = [];
                    this.drawCanvas_internal();
                    this.updateDrawingParams_internal();
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

console.log("🔵BB图像绘制面板扩展已加载");
