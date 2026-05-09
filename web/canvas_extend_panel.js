// ComfyUI Canvas Extend Panel - 完全按照 t.html 的逻辑
import { app } from "../../scripts/app.js";

app.registerExtension({
    name: "CanvasExtendPanel",

    async beforeRegisterNodeDef(nodeType, nodeData, app) {
        if (nodeData.name === "CanvasExtendNode") {

            // ==================== 节点生命周期 ====================
            const onNodeCreated = nodeType.prototype.onNodeCreated;
            nodeType.prototype.onNodeCreated = function () {
                const r = onNodeCreated ? onNodeCreated.apply(this, arguments) : undefined;
                this.addCanvasExtendPanel();
                this.setSize([1000, 750]);
                setTimeout(() => {
                    if (this.setDirtyCanvas) this.setDirtyCanvas(true, true);
                    if (this.graph && this.graph.setDirtyCanvas) this.graph.setDirtyCanvas(true, true);
                }, 100);
                return r;
            };

            const onExecuted = nodeType.prototype.onExecuted;
            nodeType.prototype.onExecuted = function(message) {
                const r = onExecuted ? onExecuted.apply(this, arguments) : undefined;
                if (this.loadInputImage) setTimeout(() => this.loadInputImage(), 100);
                return r;
            };

            const onConnectionsChange = nodeType.prototype.onConnectionsChange;
            nodeType.prototype.onConnectionsChange = function(type, index, connected, link_info) {
                const r = onConnectionsChange ? onConnectionsChange.apply(this, arguments) : undefined;
                if (type === 1 && this.loadInputImage) {
                    if (this.extendPanel) this.extendPanel.currentSrc = null;
                    setTimeout(() => this.loadInputImage(), 200);

                    // 如果是新建连接，监听源节点的执行完成和widget变化事件
                    if (connected && link_info) {
                        const sourceNode = app.graph.getNodeById(link_info.origin_id);
                        if (sourceNode) {
                            this.sourceImageNode = sourceNode;

                            // 通知所有下游节点更新图像的函数
                            const notifyDownstream = () => {
                                if (sourceNode.outputs) {
                                    sourceNode.outputs.forEach((output, idx) => {
                                        if (output.links) {
                                            output.links.forEach(linkId => {
                                                const link = app.graph.links[linkId];
                                                if (link) {
                                                    const targetNode = app.graph.getNodeById(link.target_id);
                                                    if (targetNode && targetNode.loadInputImage) {
                                                        if (targetNode.extendPanel) targetNode.extendPanel.currentSrc = null;
                                                        setTimeout(() => targetNode.loadInputImage(), 100);
                                                    }
                                                }
                                            });
                                        }
                                    });
                                }
                            };

                            // 监听源节点的执行完成
                            if (!sourceNode._canvasExtendBound) {
                                sourceNode._canvasExtendBound = true;
                                const originalOnExecuted = sourceNode.onExecuted;
                                sourceNode.onExecuted = function(message) {
                                    const result = originalOnExecuted ? originalOnExecuted.apply(this, arguments) : undefined;
                                    setTimeout(notifyDownstream, 150);
                                    return result;
                                };
                            }

                            // 监听源节点的widget变化（LoadImage更换图像时触发）
                            if (!sourceNode._canvasExtendWidgetBound && sourceNode.onWidgetChanged) {
                                sourceNode._canvasExtendWidgetBound = true;
                                const originalOnWidgetChanged = sourceNode.onWidgetChanged;
                                sourceNode.onWidgetChanged = function(name, value, old_value, widget) {
                                    console.log('[CanvasExtend] Source widget changed:', name, widget ? widget.type : null);
                                    const result = originalOnWidgetChanged.apply(this, arguments);
                                    // 当image相关的widget变化时通知下游
                                    if (widget && (widget.type === 'image' || name === 'image')) {
                                        console.log('[CanvasExtend] Image widget changed, notifying downstream');
                                        setTimeout(notifyDownstream, 150);
                                    }
                                    return result;
                                };
                            }

                            // 使用 Object.defineProperty 监听 imgs 属性变化
                            if (!sourceNode._canvasExtendImgsWatch) {
                                sourceNode._canvasExtendImgsWatch = true;
                                const origImgs = sourceNode.imgs;
                                let lastImgsLen = origImgs ? origImgs.length : 0;

                                Object.defineProperty(sourceNode, 'imgs', {
                                    get: function() { return this._imgs; },
                                    set: function(newVal) {
                                        console.log('[CanvasExtend] imgs property changed:', newVal ? newVal.length : 0, 'old:', lastImgsLen);
                                        this._imgs = newVal;
                                        if (newVal && newVal.length !== lastImgsLen) {
                                            lastImgsLen = newVal ? newVal.length : 0;
                                            setTimeout(notifyDownstream, 200);
                                        }
                                    }
                                });
                                if (origImgs) sourceNode.imgs = origImgs;
                            }
                        }
                    }
                }
                return r;
            };

            // 节点移除时清理
            const onRemoved = nodeType.prototype.onRemoved;
            nodeType.prototype.onRemoved = function() {
                if (this._imagePollInterval) {
                    clearInterval(this._imagePollInterval);
                    this._imagePollInterval = null;
                }
                const r = onRemoved ? onRemoved.apply(this, arguments) : undefined;
                return r;
            };

            // ==================== 添加面板 ====================
            nodeType.prototype.addCanvasExtendPanel = function() {
                const container = document.createElement("div");
                container.style.cssText = "width:100%;height:690px;border:2px solid #2e3148;border-radius:6px;background:#1a1d27;margin:5px 0;display:flex;flex-direction:column;box-sizing:border-box;overflow:hidden;font-family:'Inter',-apple-system,sans-serif;";

                // 工具栏
                const toolbar = document.createElement("div");
                toolbar.style.cssText = "background:#252836;padding:0 16px;display:flex;align-items:center;gap:2px;height:48px;border-bottom:1px solid #2e3148;flex-shrink:0;";
                toolbar.innerHTML = `
                    <style>
                        .ce-btn{position:relative;display:inline-flex;align-items:center;justify-content:center;padding:0 12px;height:34px;background:transparent;border:1px solid transparent;color:#8b90a7;border-radius:6px;cursor:pointer;font-family:inherit;font-size:13px;font-weight:500;transition:all 0.15s;white-space:nowrap;}
                        .ce-btn:hover{background:#2d3147;color:#e8eaf0;border-color:#3a3e57;}
                        .ce-btn:active{transform:scale(0.97);}
                        .ce-btn.active{background:#ef4444;color:#fff;border-color:#ef4444;box-shadow:0 0 12px rgba(239,68,68,0.4);}
                        .ce-btn:disabled{opacity:0.4;cursor:not-allowed;}
                        .ce-group{display:flex;align-items:center;gap:2px;padding:0 8px;border-right:1px solid #2e3148;}
                        .ce-group:last-child{border-right:none;}
                        .ce-select{height:34px;padding:0 24px 0 10px;background:#2d3147 url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%238b90a7' stroke-width='2'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E") no-repeat right 6px center;border:1px solid #2e3148;color:#e8eaf0;border-radius:6px;font-size:13px;cursor:pointer;appearance:none;-webkit-appearance:none;}
                        .ce-select:focus{outline:none;border-color:#6366f1;}
                        .ce-input{height:34px;width:60px;padding:0 8px;background:#2d3147;border:1px solid #2e3148;color:#e8eaf0;border-radius:6px;font-size:13px;text-align:center;}
                        .ce-input:focus{outline:none;border-color:#6366f1;}
                        .ce-color{width:34px;height:34px;padding:3px;background:#2d3147;border:1px solid #2e3148;border-radius:6px;cursor:pointer;}
                        .ce-checkbox{display:flex;align-items:center;gap:6px;cursor:pointer;color:#8b90a7;font-size:13px;}
                        .ce-checkbox input{width:16px;height:16px;cursor:pointer;}
                        .ce-icon-btn{width:34px;padding:0;}
                        .ce-label{font-size:10px;font-weight:600;color:#555a73;text-transform:uppercase;letter-spacing:0.05em;}
                        .ce-tooltip{position:fixed;display:none;background:#2d3147;border:1px solid #3a3e57;border-radius:8px;padding:10px 14px;font-size:13px;font-weight:600;color:#e8eaf0;box-shadow:0 4px 12px rgba(0,0,0,0.5);z-index:9999;pointer-events:none;transform:translate(-50%,-120%);white-space:nowrap;}
                        .ce-tooltip.show{display:block;}
                        .ce-tooltip .row{display:flex;align-items:center;gap:10px;}
                        .ce-tooltip .row+.row{margin-top:6px;}
                        .ce-tooltip .label{font-size:10px;font-weight:600;color:#555a73;text-transform:uppercase;min-width:50px;}
                        .ce-tooltip .value{font-variant-numeric:tabular-nums;color:#6366f1;}
                        .ce-tooltip .hint{font-size:11px;color:#555a73;margin-top:8px;padding-top:8px;border-top:1px solid #2e3148;}
                        .ce-area{flex:1;display:flex;align-items:center;justify-content:center;background:#0a0b0e;position:relative;overflow:hidden;}
                        .ce-container{position:relative;}
                        .ce-canvas{position:absolute;top:0;left:0;}
                        .ce-canvas{pointer-events:none;}
                        .ce-canvas#overlayCanvas{pointer-events:auto;cursor:default;}
                        .ce-status{background:#252836;padding:0 16px;display:flex;align-items:center;justify-content:space-between;height:36px;border-top:1px solid #2e3148;font-size:12px;color:#8b90a7;flex-shrink:0;}
                        .ce-status span{color:#e8eaf0;font-weight:600;}
                        .ce-slider{width:70px;height:4px;cursor:pointer;-webkit-appearance:none;background:#3a3e57;border-radius:2px;outline:none;}
                        .ce-slider::-webkit-slider-thumb{-webkit-appearance:none;width:14px;height:14px;background:#6366f1;border-radius:50%;cursor:pointer;}
                    </style>
                    <div class="ce-group">
                        <button class="ce-btn ce-icon-btn" id="themeBtn" title="切换主题">T</button>
                    </div>
                    <div class="ce-group">
                        <button class="ce-btn active" id="toolSelect" title="选择 (V)">S</button>
                        <button class="ce-btn" id="toolPan" title="平移 (空格)" disabled>P</button>
                    </div>
                    <div class="ce-group">
                        <select class="ce-select" id="ratioSelect">
                            <option value="free">自由比例</option>
                            <option value="1:1">1:1</option>
                            <option value="5:4">5:4</option>
                            <option value="4:5">4:5</option>
                            <option value="2:3">2:3</option>
                            <option value="3:2">3:2</option>
                            <option value="3:4">3:4</option>
                            <option value="4:3">4:3</option>
                            <option value="9:16">9:16</option>
                            <option value="16:9">16:9</option>
                            <option value="21:9">21:9</option>
                            <option value="9:21">9:21</option>
                        </select>
                        <button class="ce-btn" id="lockBtn" title="锁定比例">L</button>
                        <button class="ce-btn" id="resetBtn" title="还原 (R)">R</button>
                        <input type="number" class="ce-input" id="cropW" placeholder="W" min="1" style="width:60px;" title="裁切宽度">
                        <span style="color:#555a73;font-size:12px;">x</span>
                        <input type="number" class="ce-input" id="cropH" placeholder="H" min="1" style="width:60px;" title="裁切高度">
                    </div>
                    <div class="ce-group">
                        <select class="ce-select" id="alignSelect">
                            <option value="center">居中</option>
                            <option value="left">左</option>
                            <option value="right">右</option>
                            <option value="top">上</option>
                            <option value="bottom">下</option>
                        </select>
                        <button class="ce-btn" id="alignBtn" title="对齐到边界">对齐</button>
                    </div>
                    <div class="ce-group">
                        <select class="ce-select" id="fillColor">
                            <option value="#ffffff">白色填充</option>
                            <option value="#000000">黑色填充</option>
                            <option value="#ff0000">红色填充</option>
                            <option value="#00ff00">绿色填充</option>
                            <option value="#0000ff">蓝色填充</option>
                            <option value="transparent">透明</option>
                        </select>
                    </div>
                    <div class="ce-group">
                        <label class="ce-checkbox"><input type="checkbox" id="snapEnabled" checked> 吸附</label>
                        <input type="number" class="ce-input" id="snapVal" value="15" min="5" max="50" style="width:50px;">
                    </div>
                    <div class="ce-group">
                        <button class="ce-btn" id="shapeLockBtn">等比</button>
                    </div>
                `;

                // 画布区域
                const canvasArea = document.createElement("div");
                canvasArea.className = "ce-area";
                canvasArea.id = "canvasArea";

                // 画布容器
                const canvasContainer = document.createElement("div");
                canvasContainer.className = "ce-container";
                canvasContainer.id = "canvasContainer";

                // 主画布
                const mainCanvas = document.createElement("canvas");
                mainCanvas.className = "ce-canvas";
                mainCanvas.id = "mainCanvas";

                // 覆盖层（锚点、光标）
                const overlayCanvas = document.createElement("canvas");
                overlayCanvas.className = "ce-canvas";
                overlayCanvas.id = "overlayCanvas";
                overlayCanvas.style.cursor = "default";

                canvasContainer.appendChild(mainCanvas);
                canvasContainer.appendChild(overlayCanvas);
                canvasArea.appendChild(canvasContainer);

                // 状态栏
                const statusBar = document.createElement("div");
                statusBar.className = "ce-status";
                statusBar.innerHTML = `
                    <div><span>画布:</span> <span id="canvasSize">0 x 0</span>  <span>原图:</span> <span id="imgSize">--</span></div>
                    <div></div>
                `;

                container.appendChild(toolbar);
                container.appendChild(canvasArea);
                container.appendChild(statusBar);

                const widget = this.addDOMWidget("canvas_extend_panel", "div", container);
                widget.computeSize = () => [1000, 690];

                // 面板状态
                this.extendPanel = {
                    container: container,
                    area: canvasArea,
                    canvasContainer: canvasContainer,
                    mainCanvas: mainCanvas,
                    ctx: mainCanvas.getContext('2d'),
                    overlayCanvas: overlayCanvas,
                    drawCtx: overlayCanvas.getContext('2d'),
                    toolbar: toolbar,
                    statusBar: statusBar,

                    // 图片状态
                    image: null,
                    imgW: 0,
                    imgH: 0,
                    left: 0,
                    right: 0,
                    top: 0,
                    bottom: 0,

                    // 屏幕尺寸
                    screenW: 0,
                    screenH: 0,

                    // 缩放
                    scale: 1,

                    // 图片位置
                    imgScreenX: 0,
                    imgScreenY: 0,
                    imgScreenW: 0,
                    imgScreenH: 0,

                    // 可见区域
                    visibleScreenX: 0,
                    visibleScreenY: 0,
                    visibleScreenW: 0,
                    visibleScreenH: 0,

                    // 工具
                    tool: 'select',
                    isPanning: false,
                    panStart: { x: 0, y: 0 },
                    anchorStartPos: { x: 0, y: 0 },
                    isDragging: false,
                    dragHandle: null,
                    dragStart: { x: 0, y: 0 },
                    dragStartVals: {},

                    // 比例和吸附
                    ratioLocked: false,
                    selectedRatio: 'free',
                    snapEnabled: true,
                    snapThreshold: 15,
                    shapeLockEnabled: false,
                    fillColor: '#ffffff',

                    // 主题
                    isDark: true,

                    spacePressed: false,

                    // 空状态按钮
                    emptyStateBtn: null
                };

                this.bindEvents();

                // 等待 DOM 渲染完成后再初始化
                requestAnimationFrame(() => {
                    this.resize();
                    setTimeout(() => {
                        this.loadInputImage();
                    }, 100);
                });

                // 定时检查图像变化
                this._imagePollInterval = setInterval(() => {
                    if (this.checkImageChanged) this.checkImageChanged();
                }, 500);
            };

            // ==================== 事件绑定 ====================
            nodeType.prototype.bindEvents = function() {
                const panel = this.extendPanel;
                const $ = (id) => {
                    const el = panel.toolbar.querySelector('#' + id);
                    if (!el) console.warn('Element not found:', id);
                    return el;
                };

                const addEvt = (id, type, handler) => {
                    const el = $(id);
                    if (el) el.addEventListener(type, handler);
                };

                addEvt('themeBtn', 'click', () => this.toggleTheme());
                addEvt('toolSelect', 'click', () => this.setTool('select'));
                addEvt('toolPan', 'click', () => this.setTool('pan'));

                addEvt('ratioSelect', 'change', (e) => {
                    panel.selectedRatio = e.target.value;
                    panel.ratioLocked = panel.selectedRatio !== 'free';
                    this.updateLockUI();
                    if (panel.image && panel.selectedRatio !== 'free') {
                        this.applyRatio();
                        this.render();
                    }
                });

                // 裁切框宽高数值输入（画布尺寸）
                addEvt('cropW', 'input', (e) => {
                    const w = parseInt(e.target.value);
                    if (w > 0) {
                        const targetW = w;
                        const targetH = panel.ratioLocked
                            ? w / (panel.imgW / panel.imgH)
                            : (parseInt(panel.toolbar.querySelector('#cropH').value) || (panel.imgH + panel.top + panel.bottom));
                        // 重新计算边框，使原图居中
                        panel.left = (targetW - panel.imgW) / 2;
                        panel.right = (targetW - panel.imgW) / 2;
                        panel.top = (targetH - panel.imgH) / 2;
                        panel.bottom = (targetH - panel.imgH) / 2;
                        // 同步 H 值
                        const hInput = panel.toolbar.querySelector('#cropH');
                        if (!hInput.matches(':focus')) hInput.value = Math.round(targetH);
                        this.updateLayout();
                        this.render();
                    }
                });

                addEvt('cropH', 'input', (e) => {
                    const h = parseInt(e.target.value);
                    if (h > 0) {
                        const targetH = h;
                        const targetW = panel.ratioLocked
                            ? h * (panel.imgW / panel.imgH)
                            : (parseInt(panel.toolbar.querySelector('#cropW').value) || (panel.imgW + panel.left + panel.right));
                        // 重新计算边框，使原图居中
                        panel.left = (targetW - panel.imgW) / 2;
                        panel.right = (targetW - panel.imgW) / 2;
                        panel.top = (targetH - panel.imgH) / 2;
                        panel.bottom = (targetH - panel.imgH) / 2;
                        // 同步 W 值
                        const wInput = panel.toolbar.querySelector('#cropW');
                        if (!wInput.matches(':focus')) wInput.value = Math.round(targetW);
                        this.updateLayout();
                        this.render();
                    }
                });

                addEvt('lockBtn', 'click', () => {
                    panel.ratioLocked = !panel.ratioLocked;
                    this.updateLockUI();
                });

                addEvt('resetBtn', 'click', () => this.resetCropRatio());
                addEvt('alignBtn', 'click', () => this.alignToImageBounds());

                addEvt('fillColor', 'change', (e) => {
                    panel.fillColor = e.target.value;
                    this.updateParam('fill_color', panel.fillColor);
                    this.render();
                });

                addEvt('snapEnabled', 'change', (e) => {
                    panel.snapEnabled = e.target.checked;
                });

                addEvt('snapVal', 'change', (e) => {
                    panel.snapThreshold = parseInt(e.target.value);
                });

                addEvt('shapeLockBtn', 'click', () => {
                    panel.shapeLockEnabled = !panel.shapeLockEnabled;
                    const btn = panel.toolbar.querySelector('#shapeLockBtn');
                    if (panel.shapeLockEnabled) {
                        btn.classList.add('active');
                    } else {
                        btn.classList.remove('active');
                    }
                });

                const clearBtn = panel.statusBar.querySelector('#clearPaintBtn');
                if (clearBtn) clearBtn.addEventListener('click', () => this.clearPaint());

                // 画布事件
                const addCanvasEvent = (target, type, handler) => {
                    target.addEventListener(type, handler);
                };
                addCanvasEvent(panel.mainCanvas, 'mousedown', (e) => this.onDown(e));
                addCanvasEvent(panel.mainCanvas, 'mousemove', (e) => this.onMove(e));
                addCanvasEvent(panel.mainCanvas, 'mouseup', (e) => this.onUp(e));
                addCanvasEvent(panel.mainCanvas, 'mouseleave', () => this.onLeave());
                addCanvasEvent(panel.mainCanvas, 'wheel', (e) => this.onWheel(e), { passive: false });

                addCanvasEvent(panel.overlayCanvas, 'mousedown', (e) => this.onDown(e));
                addCanvasEvent(panel.overlayCanvas, 'mousemove', (e) => this.onMove(e));
                addCanvasEvent(panel.overlayCanvas, 'mouseup', (e) => this.onUp(e));
                addCanvasEvent(panel.overlayCanvas, 'mouseleave', () => this.onLeave());
                addCanvasEvent(panel.overlayCanvas, 'wheel', (e) => this.onWheel(e), { passive: false });

                // 键盘事件
                document.addEventListener('keydown', (e) => this.onKeyDown(e));
                document.addEventListener('keyup', (e) => this.onKeyUp(e));

                window.addEventListener('resize', () => this.resize());
            };

            // ==================== 尺寸和布局 ====================
            nodeType.prototype.resize = function() {
                const panel = this.extendPanel;
                panel.screenW = panel.area.clientWidth;
                panel.screenH = panel.area.clientHeight;

                // 设置画布尺寸
                panel.mainCanvas.width = panel.screenW;
                panel.mainCanvas.height = panel.screenH;
                panel.overlayCanvas.width = panel.screenW;
                panel.overlayCanvas.height = panel.screenH;

                // 设置容器
                panel.canvasContainer.style.width = panel.screenW + 'px';
                panel.canvasContainer.style.height = panel.screenH + 'px';

                if (panel.image) this.updateLayout();
                this.render();
            };

            nodeType.prototype.updateLayout = function() {
                const panel = this.extendPanel;
                const scaleX = (panel.screenW * 0.7) / panel.imgW;
                const scaleY = (panel.screenH * 0.7) / panel.imgH;
                panel.scale = Math.min(scaleX, scaleY, 2);

                panel.imgScreenW = panel.imgW * panel.scale;
                panel.imgScreenH = panel.imgH * panel.scale;
                panel.imgScreenX = (panel.mainCanvas.width - panel.imgScreenW) / 2;
                panel.imgScreenY = (panel.mainCanvas.height - panel.imgScreenH) / 2;

                const totalW = panel.imgW + panel.left + panel.right;
                const totalH = panel.imgH + panel.top + panel.bottom;
                panel.visibleScreenW = totalW * panel.scale;
                panel.visibleScreenH = totalH * panel.scale;
                panel.visibleScreenX = (panel.mainCanvas.width - panel.visibleScreenW) / 2;
                panel.visibleScreenY = (panel.mainCanvas.height - panel.visibleScreenH) / 2;

                this.updateStatusBar();
            };

            nodeType.prototype.updateStatusBar = function() {
                const panel = this.extendPanel;
                const totalW = panel.imgW + panel.left + panel.right;
                const totalH = panel.imgH + panel.top + panel.bottom;
                const canvasSize = panel.statusBar.querySelector('#canvasSize');
                const imgSize = panel.statusBar.querySelector('#imgSize');
                if (canvasSize) canvasSize.textContent = Math.round(totalW) + ' x ' + Math.round(totalH);
                if (imgSize) imgSize.textContent = panel.imgW + ' x ' + panel.imgH;

                // 同步裁切框宽高输入框（画布尺寸 = 原图 + 扩展边框）
                const cropWInput = panel.toolbar.querySelector('#cropW');
                const cropHInput = panel.toolbar.querySelector('#cropH');
                const cropW = panel.imgW + panel.left + panel.right;
                const cropH = panel.imgH + panel.top + panel.bottom;
                if (cropWInput && !cropWInput.matches(':focus')) {
                    cropWInput.value = Math.round(cropW);
                }
                if (cropHInput && !cropHInput.matches(':focus')) {
                    cropHInput.value = Math.round(cropH);
                }
            };

            nodeType.prototype.updateVisibleScreenCoords = function() {
                const panel = this.extendPanel;
                const totalW = panel.imgW + panel.left + panel.right;
                const totalH = panel.imgH + panel.top + panel.bottom;
                panel.visibleScreenW = totalW * panel.scale;
                panel.visibleScreenH = totalH * panel.scale;
                panel.visibleScreenX = panel.imgScreenX - panel.left * panel.scale;
                panel.visibleScreenY = panel.imgScreenY - panel.top * panel.scale;
            };

            nodeType.prototype.getImageScreenArea = function() {
                const panel = this.extendPanel;
                return { x: panel.imgScreenX, y: panel.imgScreenY, w: panel.imgScreenW, h: panel.imgScreenH };
            };

            nodeType.prototype.getVisibleScreenArea = function() {
                const panel = this.extendPanel;
                return { x: panel.visibleScreenX, y: panel.visibleScreenY, w: panel.visibleScreenW, h: panel.visibleScreenH };
            };

            nodeType.prototype.getVisibleArea = function() {
                return this.getVisibleScreenArea();
            };

            // ==================== 工具 ====================
            nodeType.prototype.setTool = function(tool) {
                const panel = this.extendPanel;
                panel.tool = tool;
                const toolMap = { select: 'toolSelect', pan: 'toolPan' };
                Object.values(toolMap).forEach(id => {
                    const btn = panel.toolbar.querySelector('#' + id);
                    if (btn) btn.classList.remove('active');
                });
                const activeBtn = panel.toolbar.querySelector('#' + toolMap[tool]);
                if (activeBtn) activeBtn.classList.add('active');
                const panBtn = panel.toolbar.querySelector('#toolPan');
                if (panBtn) panBtn.disabled = !panel.image;

                panel.isDragging = false;
                panel.dragHandle = null;
                this.render();
            };

            nodeType.prototype.toggleTheme = function() {
                const panel = this.extendPanel;
                panel.isDark = !panel.isDark;
                this.render();
            };

            nodeType.prototype.updateLockUI = function() {
                const panel = this.extendPanel;
                const lockBtn = panel.toolbar.querySelector('#lockBtn');
                if (lockBtn) lockBtn.textContent = panel.ratioLocked ? 'L*' : 'L';
            };

            // ==================== 裁切操作 ====================
            nodeType.prototype.reset = function() {
                const panel = this.extendPanel;
                if (!panel.image) return;
                panel.left = 0;
                panel.right = 0;
                panel.top = 0;
                panel.bottom = 0;
                this.updateLayout();
                this.render();
            };

            nodeType.prototype.resetCropRatio = function() {
                const panel = this.extendPanel;
                if (!panel.image) return;
                panel.left = 0;
                panel.right = 0;
                panel.top = 0;
                panel.bottom = 0;
                panel.selectedRatio = 'free';
                panel.ratioLocked = false;
                const ratioSelect = panel.toolbar.querySelector('#ratioSelect');
                if (ratioSelect) ratioSelect.value = 'free';
                this.updateLockUI();
                this.updateVisibleScreenCoords();
                this.render();
            };

            nodeType.prototype.alignToImageBounds = function() {
                const panel = this.extendPanel;
                if (!panel.image) return;
                const alignSelect = panel.toolbar.querySelector('#alignSelect');
                const alignType = alignSelect ? alignSelect.value : 'center';
                const cropW = panel.imgW - panel.left - panel.right;
                const cropH = panel.imgH - panel.top - panel.bottom;

                switch (alignType) {
                    case 'center':
                        const cropCenterX = panel.left + cropW / 2;
                        const cropCenterY = panel.top + cropH / 2;
                        const dx = panel.imgW / 2 - cropCenterX;
                        const dy = panel.imgH / 2 - cropCenterY;
                        panel.left += dx;
                        panel.right -= dx;
                        panel.top += dy;
                        panel.bottom -= dy;
                        break;
                    case 'left':
                        panel.left = 0;
                        panel.right = panel.imgW - cropW;
                        break;
                    case 'right':
                        panel.right = 0;
                        panel.left = panel.imgW - cropW;
                        break;
                    case 'top':
                        panel.top = 0;
                        panel.bottom = panel.imgH - cropH;
                        break;
                    case 'bottom':
                        panel.bottom = 0;
                        panel.top = panel.imgH - cropH;
                        break;
                }

                this.updateVisibleScreenCoords();
                this.render();
            };

            nodeType.prototype.applyRatio = function() {
                const panel = this.extendPanel;
                if (!panel.image || panel.selectedRatio === 'free') return;
                const [w, h] = panel.selectedRatio.split(':').map(Number);
                const targetRatio = w / h;
                let targetW, targetH;
                if (targetRatio >= 1) {
                    targetW = panel.imgW;
                    targetH = panel.imgW / targetRatio;
                } else {
                    targetH = panel.imgH;
                    targetW = panel.imgH * targetRatio;
                }
                panel.left = (targetW - panel.imgW) / 2;
                panel.right = (targetW - panel.imgW) / 2;
                panel.top = (targetH - panel.imgH) / 2;
                panel.bottom = (targetH - panel.imgH) / 2;
                this.updateVisibleScreenCoords();
            };

            // ==================== 坐标转换 ====================
            nodeType.prototype.screenToWorld = function(sx, sy) {
                const panel = this.extendPanel;
                return { x: (sx - panel.imgScreenX) / panel.scale, y: (sy - panel.imgScreenY) / panel.scale };
            };

            nodeType.prototype.worldToScreen = function(wx, wy) {
                const panel = this.extendPanel;
                return { x: wx * panel.scale + panel.imgScreenX, y: wy * panel.scale + panel.imgScreenY };
            };

            // ==================== 锚点检测 ====================
            nodeType.prototype.getAnchorScreenPos = function(handle) {
                const visible = this.getVisibleScreenArea();
                const x = visible.x, y = visible.y, w = visible.w, h = visible.h;
                const pos = {
                    tl: { x: x, y: y },
                    t: { x: x + w / 2, y: y },
                    tr: { x: x + w, y: y },
                    l: { x: x, y: y + h / 2 },
                    r: { x: x + w, y: y + h / 2 },
                    bl: { x: x, y: y + h },
                    b: { x: x + w / 2, y: y + h },
                    br: { x: x + w, y: y + h }
                }[handle];
                return pos;
            };

            nodeType.prototype.hitTest = function(sx, sy) {
                const hitSize = 8;
                for (const handle of ['tl', 't', 'tr', 'l', 'r', 'bl', 'b', 'br']) {
                    const pos = this.getAnchorScreenPos(handle);
                    const dx = sx - pos.x;
                    const dy = sy - pos.y;
                    const dist = Math.sqrt(dx * dx + dy * dy);
                    if (dist < hitSize) return handle;
                }
                return null;
            };

            // ==================== 鼠标事件 ====================
            nodeType.prototype.onDown = function(e) {
                const panel = this.extendPanel;
                if (!panel.image) return;

                const sx = e.offsetX;
                const sy = e.offsetY;

                panel.dragStart = { x: sx, y: sy };

                if (panel.spacePressed) {
                    panel.isPanning = true;
                    panel.panStart = { x: sx, y: sy };
                    panel.anchorStartPos = { x: panel.imgScreenX, y: panel.imgScreenY };
                    return;
                }

                const hitHandle = this.hitTest(sx, sy);
                if (hitHandle) {
                    panel.isDragging = true;
                    panel.dragHandle = hitHandle;
                    panel.dragStartVals = { left: panel.left, right: panel.right, top: panel.top, bottom: panel.bottom };
                    return;
                }

                const visible = this.getVisibleScreenArea();
                const canMove = sx >= visible.x && sx <= visible.x + visible.w && sy >= visible.y && sy <= visible.y + visible.h;
                const imgArea = this.getImageScreenArea();
                const inImageArea = sx >= imgArea.x && sx <= imgArea.x + imgArea.w && sy >= imgArea.y && sy <= imgArea.y + imgArea.h;

                if (canMove || inImageArea) {
                    panel.isDragging = true;
                    panel.dragHandle = 'move';
                    panel.dragStart = { x: sx, y: sy };
                    panel.dragStartVals = { left: panel.left, right: panel.right, top: panel.top, bottom: panel.bottom };
                }
            };

            nodeType.prototype.onMove = function(e) {
                const panel = this.extendPanel;
                if (!panel.image) return;

                const sx = e.offsetX;
                const sy = e.offsetY;

                if (panel.isPanning) {
                    const dx = sx - panel.panStart.x;
                    const dy = sy - panel.panStart.y;
                    panel.imgScreenX = panel.anchorStartPos.x + dx;
                    panel.imgScreenY = panel.anchorStartPos.y + dy;
                    panel.visibleScreenX = panel.imgScreenX - panel.left * panel.scale;
                    panel.visibleScreenY = panel.imgScreenY - panel.top * panel.scale;
                    this.render();
                    return;
                }

                const hitHandle = this.hitTest(sx, sy);
                const cursors = { tl: 'nwse-resize', br: 'nwse-resize', tr: 'nesw-resize', bl: 'nesw-resize', t: 'ns-resize', b: 'ns-resize', l: 'ew-resize', r: 'ew-resize' };
                if (hitHandle) {
                    panel.overlayCanvas.style.cursor = cursors[hitHandle];
                } else {
                    const visible = this.getVisibleScreenArea();
                    if (sx >= visible.x && sx <= visible.x + visible.w && sy >= visible.y && sy <= visible.y + visible.h) {
                        panel.overlayCanvas.style.cursor = 'move';
                    } else {
                        panel.overlayCanvas.style.cursor = 'default';
                    }
                }

                if (panel.dragHandle) {
                    this.handleAnchorDrag(sx, sy);
                }
            };

            nodeType.prototype.onUp = function(e) {
                const panel = this.extendPanel;

                if (panel.isPanning) {
                    panel.isPanning = false;
                    return;
                }

                panel.isDragging = false;
                panel.dragHandle = null;
            };

            nodeType.prototype.onLeave = function() {
                const panel = this.extendPanel;
                if (panel.isPanning) panel.isPanning = false;
            };

            // ==================== 拖拽处理 ====================
            nodeType.prototype.handleAnchorDrag = function(sx, sy) {
                const panel = this.extendPanel;
                const dx = sx - panel.dragStart.x;
                const dy = sy - panel.dragStart.y;
                const handle = panel.dragHandle;

                if (handle === 'move') {
                    const worldDx = dx / panel.scale;
                    const worldDy = dy / panel.scale;
                    const originalCropW = panel.imgW - panel.dragStartVals.left - panel.dragStartVals.right;
                    const originalCropH = panel.imgH - panel.dragStartVals.top - panel.dragStartVals.bottom;
                    let newLeft = panel.dragStartVals.left - worldDx;
                    let newTop = panel.dragStartVals.top - worldDy;
                    panel.left = newLeft;
                    panel.top = newTop;
                    panel.right = panel.imgW - originalCropW - newLeft;
                    panel.bottom = panel.imgH - originalCropH - newTop;
                    this.updateVisibleScreenCoords();
                    this.updateStatusBar();
                    this.updateExtendData();
                    this.render();
                    return;
                }

                const start = panel.dragStartVals;
                const worldDx = dx / panel.scale;
                const worldDy = dy / panel.scale;

                let newLeft = start.left;
                let newRight = start.right;
                let newTop = start.top;
                let newBottom = start.bottom;

                // 基础拖拽：根据句柄计算新的扩展值
                switch (handle) {
                    case 'tl': newLeft -= worldDx; newTop -= worldDy; break;
                    case 'tr': newRight += worldDx; newTop -= worldDy; break;
                    case 'bl': newLeft -= worldDx; newBottom += worldDy; break;
                    case 'br': newRight += worldDx; newBottom += worldDy; break;
                    case 't': newTop -= worldDy; break;
                    case 'b': newBottom += worldDy; break;
                    case 'l': newLeft -= worldDx; break;
                    case 'r': newRight += worldDx; break;
                }

                // 等比缩放约束：保持裁切框比例不变
                const ratioLocked = panel.ratioLocked && panel.selectedRatio !== 'free';
                const shapeLock = panel.shapeLockEnabled;
                if (ratioLocked || shapeLock) {
                    let targetRatio;
                    if (ratioLocked) {
                        const [w, h] = panel.selectedRatio.split(':').map(Number);
                        targetRatio = w / h;
                    } else {
                        targetRatio = (panel.imgW + start.left + start.right) / (panel.imgH + start.top + start.bottom);
                    }

                    const originalW = panel.imgW + start.left + start.right;
                    const originalH = panel.imgH + start.top + start.bottom;
                    const currentW = panel.imgW + newLeft + newRight;
                    const currentH = panel.imgH + newTop + newBottom;

                    // 以宽度为准计算目标高度
                    const targetH = currentW / targetRatio;
                    const dw = currentW - originalW;
                    const dh = targetH - originalH;

                    // 根据句柄调整各边（以中心点为基准）
                    switch (handle) {
                        case 'tl':
                            newLeft = start.left + dw;
                            newTop = start.top + dh;
                            newRight = start.right;
                            newBottom = start.bottom;
                            break;
                        case 'tr':
                            newLeft = start.left;
                            newTop = start.top + dh;
                            newRight = start.right + dw;
                            newBottom = start.bottom;
                            break;
                        case 'bl':
                            newLeft = start.left + dw;
                            newTop = start.top;
                            newRight = start.right;
                            newBottom = start.bottom + dh;
                            break;
                        case 'br':
                            newLeft = start.left;
                            newTop = start.top;
                            newRight = start.right + dw;
                            newBottom = start.bottom + dh;
                            break;
                        case 't':
                            newLeft = start.left + dw / 2;
                            newTop = start.top + dh;
                            newRight = start.right + dw / 2;
                            newBottom = start.bottom;
                            break;
                        case 'b':
                            newLeft = start.left + dw / 2;
                            newTop = start.top;
                            newRight = start.right + dw / 2;
                            newBottom = start.bottom + dh;
                            break;
                        case 'l':
                            newLeft = start.left + dw;
                            newTop = start.top + dh / 2;
                            newRight = start.right;
                            newBottom = start.bottom + dh / 2;
                            break;
                        case 'r':
                            newLeft = start.left;
                            newTop = start.top + dh / 2;
                            newRight = start.right + dw;
                            newBottom = start.bottom + dh / 2;
                            break;
                    }
                }

                panel.left = newLeft;
                panel.right = newRight;
                panel.top = newTop;
                panel.bottom = newBottom;

                this.applySnapDrag();
                this.updateVisibleScreenCoords();
                this.updateStatusBar();
                this.updateExtendData();
                this.render();
            };

            nodeType.prototype.applySnapDrag = function() {
                const panel = this.extendPanel;
                if (!panel.snapEnabled) return;
                const t = panel.snapThreshold;
                if (panel.left >= 0 && panel.left < t) panel.left = 0;
                if (panel.right >= 0 && panel.right < t) panel.right = 0;
                if (panel.top >= 0 && panel.top < t) panel.top = 0;
                if (panel.bottom >= 0 && panel.bottom < t) panel.bottom = 0;
                if (panel.left < 0 && panel.left > -t) panel.left = 0;
                if (panel.right < 0 && panel.right > -t) panel.right = 0;
                if (panel.top < 0 && panel.top > -t) panel.top = 0;
                if (panel.bottom < 0 && panel.bottom > -t) panel.bottom = 0;
            };

            // ==================== 滚轮缩放 ====================
            nodeType.prototype.onWheel = function(e) {
                const panel = this.extendPanel;
                if (!panel.image) return;
                e.preventDefault();

                const rect = panel.canvasContainer.getBoundingClientRect();
                const sx = e.clientX - rect.left;
                const sy = e.clientY - rect.top;

                const factor = e.deltaY > 0 ? 0.9 : 1.1;
                const ns = Math.max(0.1, Math.min(panel.scale * factor, 5));
                const worldX = (sx - panel.imgScreenX) / panel.scale;
                const worldY = (sy - panel.imgScreenY) / panel.scale;

                panel.scale = ns;
                panel.imgScreenW = panel.imgW * panel.scale;
                panel.imgScreenH = panel.imgH * panel.scale;
                panel.imgScreenX = sx - worldX * panel.scale;
                panel.imgScreenY = sy - worldY * panel.scale;

                const totalW = panel.imgW + panel.left + panel.right;
                const totalH = panel.imgH + panel.top + panel.bottom;
                panel.visibleScreenW = totalW * panel.scale;
                panel.visibleScreenH = totalH * panel.scale;
                panel.visibleScreenX = panel.imgScreenX - panel.left * panel.scale;
                panel.visibleScreenY = panel.imgScreenY - panel.top * panel.scale;

                this.render();
            };

            // ==================== 键盘事件 ====================
            nodeType.prototype.onKeyDown = function(e) {
                const panel = this.extendPanel;
                if (!panel.image) return;

                if (e.code === 'Space' && !panel.spacePressed && panel.image) {
                    e.preventDefault();
                    panel.spacePressed = true;
                    panel.mainCanvas.style.cursor = 'grab';
                }

                if (!e.ctrlKey) {
                    switch (e.key.toLowerCase()) {
                        case 'v': this.setTool('select'); break;
                        case 'r': this.resetCropRatio(); break;
                        case 'escape': this.reset(); break;
                    }
                }
            };

            nodeType.prototype.onKeyUp = function(e) {
                const panel = this.extendPanel;

                if (e.code === 'Space') {
                    panel.spacePressed = false;
                    panel.mainCanvas.style.cursor = 'default';
                }
            };

            // ==================== 绘制 ====================
            nodeType.prototype.render = function() {
                const panel = this.extendPanel;
                const ctx = panel.ctx;
                const w = panel.screenW, h = panel.screenH;

                // 检查图像是否变化，如果变化则重新加载
                this.checkImageChanged();

                // 清除覆盖层
                panel.drawCtx.clearRect(0, 0, panel.overlayCanvas.width, panel.overlayCanvas.height);

                // 背景
                const bgColor = panel.isDark ? '#0a0b0e' : '#e8eaf2';
                ctx.fillStyle = bgColor;
                ctx.fillRect(0, 0, w, h);

                if (!panel.image) {
                    this.drawEmptyState(ctx, w, h, panel.isDark);
                    return;
                }

                const visible = this.getVisibleScreenArea();

                // 填充可见区域
                const fillX = Math.max(0, visible.x);
                const fillY = Math.max(0, visible.y);
                const fillW = Math.max(0, Math.min(visible.w, panel.screenW - fillX));
                const fillH = Math.max(0, Math.min(visible.h, panel.screenH - fillY));
                if (fillW > 0 && fillH > 0) {
                    if (panel.fillColor === 'transparent') {
                        this.drawCheckerboard(fillX, fillY, fillW, fillH);
                    } else {
                        ctx.fillStyle = panel.fillColor;
                        ctx.fillRect(fillX, fillY, fillW, fillH);
                    }
                }

                // 图片
                const imgArea = this.getImageScreenArea();
                ctx.drawImage(panel.image, imgArea.x, imgArea.y, imgArea.w, imgArea.h);

                this.drawGrid();

                // 锚点
                this.drawAnchors();
            };

            nodeType.prototype.drawEmptyState = function(ctx, w, h, isDark) {
                const cx = w / 2, cy = h / 2;
                const bw = 80, bh = 80;
                const btnX = cx - bw / 2, btnY = cy - bh / 2 - 20;

                ctx.setLineDash([6, 6]);
                ctx.strokeStyle = isDark ? '#2e3148' : '#d0d3e8';
                ctx.lineWidth = 1.5;
                ctx.beginPath();
                ctx.roundRect(btnX, btnY, bw, bh, 12);
                ctx.stroke();
                ctx.setLineDash([]);

                ctx.fillStyle = isDark ? '#252836' : '#e4e6f0';
                ctx.beginPath();
                ctx.roundRect(btnX, btnY, bw, bh, 12);
                ctx.fill();

                const acc = isDark ? '#6366f1' : '#5b5ed6';
                ctx.strokeStyle = acc;
                ctx.lineWidth = 2;
                ctx.lineCap = 'round';
                ctx.lineJoin = 'round';
                ctx.beginPath();
                ctx.moveTo(cx, cy + 15);
                ctx.lineTo(cx, cy - 5);
                ctx.moveTo(cx - 8, cy + 3);
                ctx.lineTo(cx, cy - 5);
                ctx.lineTo(cx + 8, cy + 3);
                ctx.stroke();
                ctx.fillStyle = acc;
                ctx.beginPath();
                ctx.moveTo(cx, cy + 22);
                ctx.lineTo(cx - 10, cy + 10);
                ctx.lineTo(cx + 10, cy + 10);
                ctx.closePath();
                ctx.fill();

                ctx.fillStyle = isDark ? '#555a73' : '#9498b3';
                ctx.font = '14px Inter, sans-serif';
                ctx.textAlign = 'center';
                ctx.fillText('等待图像输入...', cx, cy + 55);

                this.extendPanel.emptyStateBtn = { x: btnX, y: btnY, w: bw, h: bh };
            };

            nodeType.prototype.drawCheckerboard = function(x, y, w, h) {
                const panel = this.extendPanel;
                const ctx = panel.ctx;
                const size = 10;
                ctx.fillStyle = '#fff';
                ctx.fillRect(x, y, w, h);
                ctx.fillStyle = '#ccc';
                for (let i = 0; i <= w / size; i++) {
                    for (let j = 0; j <= h / size; j++) {
                        if ((i + j) % 2 === 0) ctx.fillRect(x + i * size, y + j * size, size, size);
                    }
                }
            };

            nodeType.prototype.drawGrid = function() {
                const panel = this.extendPanel;
                const ctx = panel.ctx;
                ctx.strokeStyle = 'rgba(255,255,255,0.08)';
                ctx.lineWidth = 1;
                const imgArea = this.getImageScreenArea();
                const x = imgArea.x, y = imgArea.y, w = imgArea.w, h = imgArea.h;
                for (let i = 1; i < 3; i++) {
                    ctx.beginPath();
                    ctx.moveTo(x + w / 3 * i, y);
                    ctx.lineTo(x + w / 3 * i, y + h);
                    ctx.stroke();
                    ctx.beginPath();
                    ctx.moveTo(x, y + h / 3 * i);
                    ctx.lineTo(x + w, y + h / 3 * i);
                    ctx.stroke();
                }
            };

            nodeType.prototype.drawAnchors = function() {
                const panel = this.extendPanel;
                const ctx = panel.drawCtx;
                const size = 16;

                ctx.fillStyle = '#fff';
                ctx.strokeStyle = '#ef4444';
                ctx.lineWidth = 2;

                for (const handle of ['tl', 't', 'tr', 'l', 'r', 'bl', 'b', 'br']) {
                    const pos = this.getAnchorScreenPos(handle);
                    ctx.beginPath();
                    ctx.rect(pos.x - size / 2, pos.y - size / 2, size, size);
                    ctx.fill();
                    ctx.stroke();
                }

                const visible = this.getVisibleScreenArea();
                ctx.setLineDash([5, 5]);
                ctx.strokeStyle = '#ef4444';
                ctx.lineWidth = 1;
                ctx.strokeRect(visible.x, visible.y, visible.w, visible.h);
                ctx.setLineDash([]);
            };

            // ==================== 数据更新 ====================
            nodeType.prototype.updateExtendData = function() {
                const panel = this.extendPanel;
                const data = {
                    left: panel.left,
                    right: panel.right,
                    top: panel.top,
                    bottom: panel.bottom
                };
                const widget = this.widgets && this.widgets.find(w => w.name === 'extend_data');
                if (widget) widget.value = JSON.stringify(data);
                if (this.onInputsChange) this.onInputsChange();
                if (app.graph) app.graph.setDirtyCanvas(true, false);
            };

            nodeType.prototype.updateParam = function(name, value) {
                const widget = this.widgets && this.widgets.find(w => w.name === name);
                if (widget && widget.value !== value) {
                    widget.value = value;
                    if (this.onInputsChange) this.onInputsChange();
                    if (app.graph) app.graph.setDirtyCanvas(true, false);
                }
            };

            // ==================== 图片变化检测 ====================
            nodeType.prototype.checkImageChanged = function() {
                const panel = this.extendPanel;
                if (!panel) return;

                const imageInput = this.inputs && this.inputs.find(i => i.name === "image");
                if (!imageInput || !imageInput.link) return;

                const link = app.graph.links[imageInput.link];
                if (!link) return;

                const sourceNode = app.graph.getNodeById(link.origin_id);
                if (!sourceNode) return;

                // 检查源节点是否有新的图像数据
                let newSrc = null;
                if (sourceNode.imgs && sourceNode.imgs[0] && sourceNode.imgs[0].src && sourceNode.imgs[0].complete) {
                    newSrc = sourceNode.imgs[0].src;
                } else if (sourceNode.images && sourceNode.images[0]) {
                    const info = sourceNode.images[0];
                    newSrc = '/view?filename=' + info.filename + '&subfolder=' + (info.subfolder || '') + '&type=' + (info.type || 'output');
                }

                // 如果有新的图像源且与当前不同，则重新加载
                if (newSrc && newSrc !== panel.currentSrc) {
                    console.log('[CanvasExtend] Image changed detected, reloading:', newSrc);
                    this.loadImage(newSrc);
                }
            };

            // ==================== 图片加载 ====================
            nodeType.prototype.loadInputImage = function(retryCount) {
                if (retryCount === undefined) retryCount = 0;
                const panel = this.extendPanel;
                console.log('[CanvasExtend] loadInputImage called, retry:', retryCount);
                const imageInput = this.inputs && this.inputs.find(i => i.name === "image");
                console.log('[CanvasExtend] imageInput:', imageInput);
                if (!imageInput || !imageInput.link) {
                    console.log('[CanvasExtend] No image input linked');
                    panel.image = null;
                    panel.imgW = 0;
                    panel.imgH = 0;
                    panel.currentSrc = null;
                    this.render();
                    return;
                }
                const link = app.graph.links[imageInput.link];
                if (!link) { console.log('[CanvasExtend] No link found'); this.render(); return; }
                const sourceNode = app.graph.getNodeById(link.origin_id);
                console.log('[CanvasExtend] sourceNode:', sourceNode ? sourceNode.type : null, sourceNode ? 'id:' + sourceNode.id : null);

                if (!sourceNode) { this.render(); return; }

                // 检查源节点的图像数据
                console.log('[CanvasExtend] sourceNode.imgs:', sourceNode.imgs);
                console.log('[CanvasExtend] sourceNode.images:', sourceNode.images);
                console.log('[CanvasExtend] sourceNode.widgets:', sourceNode.widgets ? sourceNode.widgets.map(w => ({name: w.name, type: w.type})) : null);

                const src = this.findImageSource(sourceNode);
                console.log('[CanvasExtend] Image source:', src);
                if (src) {
                    this.loadImage(src);
                } else if (retryCount < 5) {
                    console.log('[CanvasExtend] Image not ready, retrying in 200ms...');
                    setTimeout(() => this.loadInputImage(retryCount + 1), 200);
                } else {
                    console.log('[CanvasExtend] Failed to find image after retries');
                    this.render();
                }
            };

            nodeType.prototype.findImageSource = function(node, visited, isDirectConnection) {
                if (visited === undefined) visited = new Set();
                if (isDirectConnection === undefined) isDirectConnection = true;

                if (!node || visited.has(node.id)) return null;
                visited.add(node.id);

                // 直接连接的节点优先使用 images（执行后的输出图像）
                if (isDirectConnection) {
                    // 优先级1: 从节点的images属性获取（执行后的输出图像）
                    if (node.images && node.images.length > 0) {
                        const info = node.images[0];
                        return '/view?filename=' + info.filename + '&subfolder=' + (info.subfolder || '') + '&type=' + (info.type || 'output');
                    }
                    // 优先级2: 从节点的imgs属性获取
                    if (node.imgs && node.imgs[0] && node.imgs[0].src && node.imgs[0].complete) {
                        return node.imgs[0].src;
                    }
                } else {
                    // 间接连接的上游节点优先使用imgs（原始图像）
                    if (node.imgs && node.imgs[0] && node.imgs[0].src && node.imgs[0].complete) {
                        return node.imgs[0].src;
                    }
                    if (node.images && node.images[0]) {
                        const info = node.images[0];
                        return '/view?filename=' + info.filename + '&subfolder=' + (info.subfolder || '') + '&type=' + (info.type || 'output');
                    }
                }
                // 从widgets获取
                if (node.widgets) {
                    for (const w of node.widgets) {
                        if (w.type === 'image' && w.value) return w.value;
                    }
                }
                // 递归查找上游节点
                if (node.inputs) {
                    for (const inp of node.inputs) {
                        if (inp.link) {
                            const link = app.graph.links[inp.link];
                            if (link) {
                                const up = app.graph.getNodeById(link.origin_id);
                                if (up) {
                                    const result = this.findImageSource(up, visited, false);
                                    if (result) return result;
                                }
                            }
                        }
                    }
                }
                return null;
            };

            nodeType.prototype.loadImage = function(src) {
                const panel = this.extendPanel;
                console.log('[CanvasExtend] Loading image:', src);
                if (!panel || src === panel.currentSrc) return;
                panel.currentSrc = src;
                const img = new Image();
                img.crossOrigin = "anonymous";
                img.onload = () => {
                    console.log('[CanvasExtend] Image loaded:', img.width, 'x', img.height);
                    panel.image = img;
                    panel.imgW = img.width;
                    panel.imgH = img.height;
                    // 确保画布尺寸正确
                    panel.screenW = panel.area.clientWidth || 800;
                    panel.screenH = panel.area.clientHeight || 600;
                    panel.mainCanvas.width = panel.screenW;
                    panel.mainCanvas.height = panel.screenH;
                    panel.overlayCanvas.width = panel.screenW;
                    panel.overlayCanvas.height = panel.screenH;
                    panel.canvasContainer.style.width = panel.screenW + 'px';
                    panel.canvasContainer.style.height = panel.screenH + 'px';
                    this.updateLayout();
                    this.render();
                };
                img.onerror = () => {
                    console.error('[CanvasExtend] Image load error:', src);
                    panel.image = null;
                    this.render();
                };
                img.src = src;
            };
        }
    }
});

console.log("CanvasExtendPanel loaded - 完全按照 t.html 逻辑");
