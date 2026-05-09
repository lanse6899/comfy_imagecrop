// ComfyUI 交互式图像剪裁面板
import { app } from "../../scripts/app.js";

// 预设配置（与Python端保持一致）
const PRESET_CONFIGS = {
    "klein": {
        "1:1": [
            {"width": 1024, "height": 1024},
            {"width": 2048, "height": 2048},
            {"width": 4096, "height": 4096}
        ],
        "3:2": [
            {"width": 768, "height": 512},
            {"width": 1536, "height": 1024},
            {"width": 3072, "height": 2048}
        ],
        "2:3": [
            {"width": 688, "height": 1027},
            {"width": 1376, "height": 2054},
            {"width": 2752, "height": 4108}
        ],
        "4:3": [
            {"width": 768, "height": 576},
            {"width": 1536, "height": 1152},
            {"width": 3072, "height": 2304}
        ],
        "3:4": [
            {"width": 576, "height": 768},
            {"width": 1152, "height": 1536},
            {"width": 2304, "height": 3072}
        ],
        "16:9": [
            {"width": 768, "height": 432},
            {"width": 1536, "height": 864},
            {"width": 3072, "height": 1728}
        ],
        "9:16": [
            {"width": 576, "height": 1024},
            {"width": 1152, "height": 2048},
            {"width": 2304, "height": 4096}
        ]
    },
    "banana": {
        "1:1": [
            {"width": 1024, "height": 1024},
            {"width": 2048, "height": 2048},
            {"width": 4096, "height": 4096}
        ],
        "21:9": [
            {"width": 1584, "height": 672},
            {"width": 3168, "height": 1344},
            {"width": 6336, "height": 2688}
        ],
        "3:4": [
            {"width": 896, "height": 1200},
            {"width": 1792, "height": 2400},
            {"width": 3584, "height": 4800}
        ],
        "4:3": [
            {"width": 1200, "height": 896},
            {"width": 2400, "height": 1792},
            {"width": 4800, "height": 3584}
        ],
        "9:16": [
            {"width": 768, "height": 1376},
            {"width": 1536, "height": 2752},
            {"width": 3072, "height": 5504}
        ],
        "16:9": [
            {"width": 1376, "height": 768},
            {"width": 2752, "height": 1536},
            {"width": 5504, "height": 3072}
        ],
        "2:3": [
            {"width": 848, "height": 1264},
            {"width": 1696, "height": 2528},
            {"width": 3392, "height": 5056}
        ],
        "3:2": [
            {"width": 1264, "height": 848},
            {"width": 2528, "height": 1696},
            {"width": 5056, "height": 3392}
        ],
        "4:5": [
            {"width": 928, "height": 1152},
            {"width": 1856, "height": 2304},
            {"width": 3712, "height": 4608}
        ],
        "5:4": [
            {"width": 1152, "height": 928},
            {"width": 2304, "height": 1856},
            {"width": 4608, "height": 3712}
        ]
    }
};

app.registerExtension({
    name: "InteractiveCropPanel",
    
    async beforeRegisterNodeDef(nodeType, nodeData, app) {
        if (nodeData.name === "InteractiveCropWithPanel") {
            
            const onNodeCreated = nodeType.prototype.onNodeCreated;
            nodeType.prototype.onNodeCreated = function () {
                const r = onNodeCreated ? onNodeCreated.apply(this, arguments) : undefined;
                
                // 添加交互面板
                this.addInteractivePanel();
                
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
            
            // 监听节点执行完成
            const onExecuted = nodeType.prototype.onExecuted;
            nodeType.prototype.onExecuted = function(message) {
                const r = onExecuted ? onExecuted.apply(this, arguments) : undefined;
                
                // 执行完成后立即尝试加载图像
                if (this.loadInputImage) {
                    setTimeout(() => this.loadInputImage(), 100);
                }
                
                return r;
            };
            
            // 监听节点移除，清理事件监听器
            const onRemoved = nodeType.prototype.onRemoved;
            nodeType.prototype.onRemoved = function() {
                const r = onRemoved ? onRemoved.apply(this, arguments) : undefined;
                
                // 清理ResizeObserver
                if (this.panel && this.panel.resizeObserver) {
                    this.panel.resizeObserver.disconnect();
                    this.panel.resizeObserver = null;
                }
                
                // 清理全局事件监听器
                if (this.panel && this.panel.eventHandlers) {
                    if (this.panel.eventHandlers.mouseMoveHandler) {
                        document.removeEventListener('mousemove', this.panel.eventHandlers.mouseMoveHandler);
                    }
                    if (this.panel.eventHandlers.mouseUpHandler) {
                        document.removeEventListener('mouseup', this.panel.eventHandlers.mouseUpHandler);
                    }
                }
                
                // 清理定时器
                if (this.imageCheckInterval) {
                    clearInterval(this.imageCheckInterval);
                    this.imageCheckInterval = null;
                }
                
                return r;
            };
            
            // 监听连接变化
            const onConnectionsChange = nodeType.prototype.onConnectionsChange;
            nodeType.prototype.onConnectionsChange = function(type, index, connected, link_info) {
                const r = onConnectionsChange ? onConnectionsChange.apply(this, arguments) : undefined;
                
                // 连接变化时尝试加载图像（无论连接还是断开）
                if (type === 1 && this.loadInputImage) {
                    setTimeout(() => this.loadInputImage(), 100);
                    
                    // 如果是新建连接，监听源节点的执行完成事件
                    if (connected && link_info) {
                        const sourceNode = app.graph.getNodeById(link_info.origin_id);
                        if (sourceNode) {
                            // 保存对源节点的引用
                            this.sourceImageNode = sourceNode;
                            
                            // 监听源节点的执行完成
                            const originalOnExecuted = sourceNode.onExecuted;
                            sourceNode.onExecuted = function(message) {
                                const result = originalOnExecuted ? originalOnExecuted.apply(this, arguments) : undefined;
                                // 通知所有连接的节点更新图像
                                if (this.outputs) {
                                    this.outputs.forEach((output, idx) => {
                                        if (output.links) {
                                            output.links.forEach(linkId => {
                                                const link = app.graph.links[linkId];
                                                if (link) {
                                                    const targetNode = app.graph.getNodeById(link.target_id);
                                                    if (targetNode && targetNode.loadInputImage) {
                                                        setTimeout(() => targetNode.loadInputImage(), 100);
                                                    }
                                                }
                                            });
                                        }
                                    });
                                }
                                return result;
                            };
                        }
                    }
                }
                
                return r;
            };
            
            // 监听widget值变化
            const onWidgetChanged = nodeType.prototype.onWidgetChanged;
            nodeType.prototype.onWidgetChanged = function(name, value, old_value, widget) {
                const r = onWidgetChanged ? onWidgetChanged.apply(this, arguments) : undefined;
                
                // 当crop_width或crop_height变化时，立即重绘
                if ((name === "crop_width" || name === "crop_height") && this.drawCanvas) {
                    this.drawCanvas();
                }
                
                // 当rotation参数变化时，同步到面板并重绘
                if (name === "rotation" && this.panel) {
                    this.panel.rotation = value;
                    if (this.drawCanvas) {
                        this.drawCanvas();
                    }
                }
                
                // 当offset_x或offset_y变化时，同步到面板并重绘
                if ((name === "offset_x" || name === "offset_y") && this.panel) {
                    // 这些参数由面板控制，但如果外部修改了，需要同步回面板
                    if (this.drawCanvas) {
                        this.drawCanvas();
                    }
                }
                
                // 当scale变化时，同步到面板并重绘
                if (name === "scale" && this.panel) {
                    this.panel.viewScale = value;
                    if (this.drawCanvas) {
                        this.drawCanvas();
                    }
                }
                
                // 当input_mode变化时，更新UI显示
                if (name === "input_mode" && this.panel) {
                    this.updateModeUI(value);
                }
                
                // 当preset变化时，更新比例选项
                if (name === "preset" && this.panel) {
                    this.updateRatioOptions(value);
                }
                
                // 当ratio变化时，更新尺寸选项
                if (name === "ratio" && this.panel) {
                    this.updateSizeOptions(value);
                }
                
                // 当size变化时，更新裁剪框尺寸并重绘
                if (name === "size" && this.panel) {
                    this.applySizeToCrop(value);
                }
                
                return r;
            };
        }
    }
});

Object.assign(LGraphNode.prototype, {
    
    addInteractivePanel() {
        // 创建面板容器 - 自适应节点大小
        const container = document.createElement("div");
        container.style.cssText = `
            width: 100%;
            min-height: 200px;
            height: auto;
            border: 2px solid #555;
            border-radius: 6px;
            background: #1a1a1a;
            margin: 5px 0;
            display: flex;
            flex-direction: column;
            box-sizing: border-box;
        `;
        
        // 创建Canvas显示区域
        const canvasArea = document.createElement("div");
        canvasArea.style.cssText = `
            flex: 1;
            position: relative;
            background: #2a2a2a;
            display: flex;
            align-items: center;
            justify-content: center;
            cursor: grab;
            overflow: hidden;
        `;
        
        const canvas = document.createElement("canvas");
        canvas.style.cssText = `
            width: 100%;
            height: 100%;
            display: block;
        `;
        
        // 创建控制面板 - 更紧凑的布局
        const controlPanel = document.createElement("div");
        controlPanel.style.cssText = `
            background: #333;
            padding: 6px 10px;
            border-top: 1px solid #555;
            font-size: 11px;
            color: #ddd;
            display: flex;
            flex-wrap: wrap;
            gap: 5px;
        `;
        
        // 手动输入模式的控件
        const manualControls = document.createElement("div");
        manualControls.className = "manual-controls";
        manualControls.style.cssText = `
            display: flex;
            width: 100%;
            gap: 5px;
            flex-wrap: wrap;
        `;
        
        manualControls.innerHTML = `
            <div style="flex: 1; min-width: 80px;">📍 <span id="pos">0, 0</span></div>
            <div style="flex: 1; min-width: 70px;">🔍 <span id="zoom">100%</span></div>
            <div style="flex: 1; min-width: 80px;">📐 <span id="size">512×512</span></div>
            <div style="flex: 1; min-width: 80px;">🔄 <span id="rotation">0°</span></div>
            <div style="display: flex; gap: 5px;">
                <button id="rotateLeft" style="padding: 2px 8px; cursor: pointer; background: #555; border: 1px solid #777; border-radius: 3px; color: #fff;">↺ -90°</button>
                <button id="rotateRight" style="padding: 2px 8px; cursor: pointer; background: #555; border: 1px solid #777; border-radius: 3px; color: #fff;">↻ +90°</button>
            </div>
        `;
        
        // 预设选择模式的控件
        const presetControls = document.createElement("div");
        presetControls.className = "preset-controls";
        presetControls.style.cssText = `
            display: none;
            width: 100%;
            gap: 8px;
            align-items: center;
            flex-wrap: wrap;
        `;
        
        presetControls.innerHTML = `
            <span style="white-space: nowrap;">预设:</span>
            <select id="presetSelect" style="padding: 2px 5px; background: #444; border: 1px solid #666; color: #ddd; border-radius: 3px; font-size: 11px;">
                <option value="klein">klein</option>
                <option value="banana">banana</option>
            </select>
            <span style="white-space: nowrap;">比例:</span>
            <select id="ratioSelect" style="padding: 2px 5px; background: #444; border: 1px solid #666; color: #ddd; border-radius: 3px; font-size: 11px;">
                <option value="1:1">1:1</option>
            </select>
            <span style="white-space: nowrap;">尺寸:</span>
            <select id="sizeSelect" style="padding: 2px 5px; background: #444; border: 1px solid #666; color: #ddd; border-radius: 3px; font-size: 11px;">
                <option value="1024x1024">1024×1024</option>
            </select>
        `;
        
        // 添加到控制面板
        controlPanel.appendChild(manualControls);
        controlPanel.appendChild(presetControls);
        
        canvasArea.appendChild(canvas);
        container.appendChild(canvasArea);
        container.appendChild(controlPanel);
        
        // 添加到节点 - 动态计算尺寸，自适应节点大小
        const widget = this.addDOMWidget("panel", "div", container);
        const self = this;
        widget.computeSize = function() {
            // 获取节点当前宽度，如果没有则使用默认值
            const nodeWidth = self.size ? self.size[0] : 400;
            
            // 使用默认高度，但允许通过节点大小调整来改变
            // 当节点被用户调整大小时，ResizeObserver会自动更新canvas尺寸
            let panelHeight = 280; // 默认高度
            
            // 如果节点已经有高度，尝试计算更合适的高度
            // 但避免循环依赖，只使用一个合理的默认值
            // 实际的自适应通过ResizeObserver和flex布局实现
            if (self.size && self.size[1]) {
                // 获取所有非面板widget的数量
                const nonPanelWidgets = (self.widgets || []).filter(w => w.name !== "panel");
                // 估算其他widget占用的高度（每个widget约30-35px，加上标题栏等约50px）
                const estimatedOtherHeight = nonPanelWidgets.length * 35 + 50;
                // 计算可用高度，但确保最小高度
                const availableHeight = self.size[1] - estimatedOtherHeight;
                if (availableHeight > 200) {
                    panelHeight = Math.min(availableHeight, 600); // 最大600px，避免过大
                }
            }
            
            return [nodeWidth, panelHeight];
        };
        
        // 保存引用
        this.panel = {
            canvas: canvas,
            ctx: canvas.getContext('2d'),
            controlPanel: controlPanel,
            container: container,
            canvasArea: canvasArea,
            isDragging: false,
            lastX: 0,
            lastY: 0,
            offsetX: 0,
            offsetY: 0,
            scale: 1.0,
            rotation: 0.0,
            inputImage: null,
            // 预设选择控件引用
            presetSelect: null,
            ratioSelect: null,
            sizeSelect: null,
            // 保存事件处理器引用，用于清理
            eventHandlers: {
                mouseMoveHandler: null,
                mouseUpHandler: null
            }
        };
        
        // 绑定事件
        this.bindPanelEvents(canvasArea, canvas);
        
        // 初始化预设选择控件
        const presetSelectEl = controlPanel.querySelector('#presetSelect');
        const ratioSelectEl = controlPanel.querySelector('#ratioSelect');
        const sizeSelectEl = controlPanel.querySelector('#sizeSelect');
        
        if (presetSelectEl && ratioSelectEl && sizeSelectEl) {
            this.panel.presetSelect = presetSelectEl;
            this.panel.ratioSelect = ratioSelectEl;
            this.panel.sizeSelect = sizeSelectEl;
            
            // 预设选择变化时更新比例选项
            presetSelectEl.addEventListener('change', (e) => {
                const preset = e.target.value;
                this.updateRatioOptions(preset);
                // 更新Python端的preset参数
                this.updateParameter('preset', preset);
            });
            
            // 比例选择变化时更新尺寸选项
            ratioSelectEl.addEventListener('change', (e) => {
                const ratio = e.target.value;
                this.updateSizeOptions(ratio);
                // 更新Python端的ratio参数
                this.updateParameter('ratio', ratio);
            });
            
            // 尺寸选择变化时应用尺寸
            sizeSelectEl.addEventListener('change', (e) => {
                const size = e.target.value;
                this.applySizeToCrop(size);
                // 更新Python端的size参数
                this.updateParameter('size', size);
            });
            
            // 初始化当前值
            setTimeout(() => {
                const inputModeWidget = this.widgets?.find(w => w.name === "input_mode");
                const inputMode = inputModeWidget?.value || "manual";
                this.updateModeUI(inputMode);
                
                const presetWidget = this.widgets?.find(w => w.name === "preset");
                const preset = presetWidget?.value || "klein";
                presetSelectEl.value = preset;
                
                // 先更新比例选项（跳过自动选择，以便后续处理保存的值）
                this.updateRatioOptions(preset, true);
                
                // 设置比例选择器的值
                const ratioWidget = this.widgets?.find(w => w.name === "ratio");
                const savedRatio = ratioWidget?.value;
                
                // 检查保存的比例是否在当前选项中
                const currentRatio = ratioSelectEl.options.length > 0 ? ratioSelectEl.options[0].value : "1:1";
                if (savedRatio && Array.from(ratioSelectEl.options).some(opt => opt.value === savedRatio)) {
                    ratioSelectEl.value = savedRatio;
                    // 更新尺寸选项（跳过自动选择，以便后续处理保存的值）
                    this.updateSizeOptions(savedRatio, true);
                } else {
                    // 保存的比例无效，使用第一个
                    ratioSelectEl.value = currentRatio;
                    this.updateSizeOptions(currentRatio, true);
                }
                
                const sizeWidget = this.widgets?.find(w => w.name === "size");
                const savedSize = sizeWidget?.value;
                // 如果保存的尺寸在当前选项中，使用保存的尺寸；否则使用第一个
                if (savedSize && Array.from(sizeSelectEl.options).some(opt => opt.value === savedSize)) {
                    sizeSelectEl.value = savedSize;
                } else if (sizeSelectEl.options.length > 0) {
                    sizeSelectEl.value = sizeSelectEl.options[0].value;
                }
                
                // 如果是预设模式，确保裁剪框尺寸同步并重绘
                if (inputMode === 'preset') {
                    this.applySizeToCrop(sizeSelectEl.value);
                    // 强制重绘裁切框
                    if (this.drawCanvas) {
                        this.drawCanvas();
                    }
                }
            }, 100);
        }
        
        // 初始化Canvas尺寸
        this.updateCanvasSize();
        
        // 监听节点大小变化
        const originalOnResize = this.onResize;
        this.onResize = function(size) {
            if (originalOnResize) {
                originalOnResize.call(this, size);
            }
            // 节点大小变化时，更新canvas尺寸并重绘
            if (this.updateCanvasSize) {
                // 使用requestAnimationFrame确保在DOM更新后执行
                requestAnimationFrame(() => {
                    this.updateCanvasSize();
                });
            }
            // 触发widget重新计算尺寸
            if (widget && widget.computeSize) {
                const newSize = widget.computeSize();
                if (widget.setSize) {
                    widget.setSize(newSize);
                }
            }
        };
        
        // 初始加载
        setTimeout(() => this.loadInputImage(), 500);
        
        // 定期检查输入图像（提高频率以确保及时更新）
        this.imageCheckInterval = setInterval(() => this.loadInputImage(), 500);
    },
    
    updateCanvasSize() {
        const panel = this.panel;
        if (!panel || !panel.canvas || !panel.canvasArea) return;
        
        // 使用ResizeObserver监听canvasArea尺寸变化，实现真正的自适应
        if (!panel.resizeObserver) {
            panel.resizeObserver = new ResizeObserver((entries) => {
                for (const entry of entries) {
                    const { width, height } = entry.contentRect;
                    this.updateCanvasDimensions(Math.max(200, Math.floor(width)), Math.max(150, Math.floor(height)));
                }
            });
            panel.resizeObserver.observe(panel.canvasArea);
        }
        
        // 立即更新一次（用于初始化）
        const rect = panel.canvasArea.getBoundingClientRect();
        const displayWidth = Math.max(200, Math.floor(rect.width));
        const displayHeight = Math.max(150, Math.floor(rect.height));
        this.updateCanvasDimensions(displayWidth, displayHeight);
    },
    
    updateCanvasDimensions(displayWidth, displayHeight) {
        const panel = this.panel;
        if (!panel || !panel.canvas) return;
        
        // 使用设备像素比提高清晰度（限制最大为2，避免过大）
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        const width = displayWidth * dpr;
        const height = displayHeight * dpr;
        
        // 更新Canvas的实际分辨率
        if (panel.canvas.width !== width || panel.canvas.height !== height) {
            panel.canvas.width = width;
            panel.canvas.height = height;
            
            // 保存dpr供绘制时使用
            panel.dpr = dpr;
            
            // 重新绘制
            if (panel.inputImage) {
                this.drawCanvas();
            } else {
                this.drawPlaceholder();
            }
        }
    },
    
    bindPanelEvents(area, canvas) {
        const panel = this.panel;
        
        // 鼠标拖拽 - 只移动图像，不移动剪裁框
        canvas.addEventListener('mousedown', (e) => {
            // 只在左键点击时处理
            if (e.button !== 0) return;
            
            panel.isDragging = true;
            panel.lastX = e.clientX;
            panel.lastY = e.clientY;
            area.style.cursor = 'grabbing';
            
            // 只阻止canvas上的默认行为，不影响其他区域
            e.preventDefault();
            e.stopPropagation();
        });
        
        const mouseMoveHandler = (e) => {
            // 只在拖拽状态下处理，避免干扰其他操作
            if (!panel.isDragging) return;
            
            const dx = e.clientX - panel.lastX;
            const dy = e.clientY - panel.lastY;
            
            // 更新面板内部的偏移（用于图像显示）
            panel.imageOffsetX = (panel.imageOffsetX || 0) + dx;
            panel.imageOffsetY = (panel.imageOffsetY || 0) + dy;
            panel.lastX = e.clientX;
            panel.lastY = e.clientY;
            
            // 更新实际的剪裁参数
            this.updateCropParameters();
            
            // 重绘Canvas
            this.drawCanvas();
            
            // 只在拖拽时阻止默认行为
            e.preventDefault();
        };
        
        const mouseUpHandler = (e) => {
            // 只在拖拽状态下处理
            if (!panel.isDragging) return;
            
            panel.isDragging = false;
            area.style.cursor = 'grab';
            
            // 拖拽结束时阻止默认行为
            e.preventDefault();
        };
        
        // 保存事件处理器引用
        panel.eventHandlers.mouseMoveHandler = mouseMoveHandler;
        panel.eventHandlers.mouseUpHandler = mouseUpHandler;
        
        // 使用全局事件监听器处理拖拽，但添加条件检查
        document.addEventListener('mousemove', mouseMoveHandler, { passive: false });
        document.addEventListener('mouseup', mouseUpHandler, { passive: false });
        
        // 滚轮缩放 - 缩放图像视图并更新scale参数
        const handleWheel = (e) => {
            // 只在鼠标在canvas区域内时处理滚轮事件
            const rect = canvas.getBoundingClientRect();
            const isInCanvas = e.clientX >= rect.left && e.clientX <= rect.right && 
                              e.clientY >= rect.top && e.clientY <= rect.bottom;
            
            if (!isInCanvas) return;
            
            e.preventDefault();
            // 移除stopPropagation，允许事件继续传播
            
            const factor = e.deltaY > 0 ? 0.9 : 1.1;
            const currentViewScale = panel.viewScale || 1.0;
            const newViewScale = Math.max(0.1, Math.min(5.0, currentViewScale * factor));
            
            if (newViewScale !== currentViewScale) {
                panel.viewScale = newViewScale;
                
                // 更新实际的剪裁参数
                this.updateCropParameters();
                
                this.drawCanvas();
                console.log('View scale updated:', newViewScale);
            }
        };
        
        canvas.addEventListener('wheel', handleWheel, { passive: false });
        area.addEventListener('wheel', handleWheel, { passive: false });
        
        // 双击重置 - 重置视图状态
        canvas.addEventListener('dblclick', (e) => {
            panel.imageOffsetX = 0;
            panel.imageOffsetY = 0;
            panel.viewScale = 1.0;
            panel.rotation = 0.0;
            
            // 重置剪裁参数
            this.updateParameter('offset_x', 0);
            this.updateParameter('offset_y', 0);
            this.updateParameter('scale', 1.0);
            this.updateParameter('rotation', 0.0);
            
            this.drawCanvas();
            console.log('View reset');
            
            // 阻止双击事件传播，但不影响键盘事件
            e.preventDefault();
            e.stopPropagation();
        });
        
        // 确保canvas不会获得焦点，避免捕获键盘事件
        canvas.setAttribute('tabindex', '-1');
        area.setAttribute('tabindex', '-1');
        
        // 防止canvas区域捕获键盘事件，确保剪贴板功能正常
        canvas.addEventListener('focus', (e) => {
            e.target.blur(); // 立即失去焦点
        });
        
        area.addEventListener('focus', (e) => {
            e.target.blur(); // 立即失去焦点
        });
        
        // 旋转按钮事件
        const rotateLeftBtn = panel.controlPanel.querySelector('#rotateLeft');
        const rotateRightBtn = panel.controlPanel.querySelector('#rotateRight');
        
        if (rotateLeftBtn) {
            rotateLeftBtn.addEventListener('click', () => {
                panel.rotation = ((panel.rotation || 0) - 90) % 360;
                this.updateParameter('rotation', panel.rotation);
                this.drawCanvas();
            });
        }
        
        if (rotateRightBtn) {
            rotateRightBtn.addEventListener('click', () => {
                panel.rotation = ((panel.rotation || 0) + 90) % 360;
                this.updateParameter('rotation', panel.rotation);
                this.drawCanvas();
            });
        }
    },
    
    updateCropParameters() {
        const panel = this.panel;
        if (!panel || !panel.inputImage) return;
        
        const img = panel.inputImage;
        const canvas = panel.canvas;
        const dpr = panel.dpr || 1;
        
        // 使用逻辑像素尺寸
        const canvasWidth = canvas.width / dpr;
        const canvasHeight = canvas.height / dpr;
        
        // 计算基础显示尺寸
        const baseScale = Math.min(canvasWidth / img.width, canvasHeight / img.height) * 0.9;
        
        // 获取视图状态
        const viewScale = panel.viewScale || 1.0;
        const imageOffsetX = panel.imageOffsetX || 0;
        const imageOffsetY = panel.imageOffsetY || 0;
        
        // 计算实际的scale参数（相对于原始图像的缩放）
        const actualScale = viewScale;
        
        // 计算实际的offset参数（像素偏移）
        // 面板中的偏移是显示像素，需要转换为原始图像像素
        const offsetX = Math.round(-imageOffsetX / baseScale);
        const offsetY = Math.round(-imageOffsetY / baseScale);
        
        // 更新参数
        this.updateParameter('scale', Math.round(actualScale * 100) / 100);
        this.updateParameter('offset_x', offsetX);
        this.updateParameter('offset_y', offsetY);
    },
    
    loadInputImage() {
        const imageInput = this.inputs?.find(input => input.name === "image");
        if (!imageInput || !imageInput.link) {
            // 没有连接时清除图像并显示占位符
            if (this.panel && this.panel.inputImage) {
                this.panel.inputImage = null;
                this.panel.currentSrc = null;
            }
            this.drawPlaceholder();
            return;
        }
        
        const link = app.graph.links[imageInput.link];
        if (!link) {
            this.drawPlaceholder();
            return;
        }
        
        const sourceNode = app.graph.getNodeById(link.origin_id);
        if (!sourceNode) {
            this.drawPlaceholder();
            return;
        }
        
        // 保存源节点引用
        this.sourceImageNode = sourceNode;
        
        // 尝试从当前节点和连接链中获取图像
        const imageSrc = this.findImageSource(sourceNode);
        if (imageSrc) {
            this.loadImage(imageSrc);
        } else {
            this.drawPlaceholder();
        }
    },
    
    findImageSource(node, visited = new Set(), isDirectConnection = true) {
        // 防止循环引用
        if (!node || visited.has(node.id)) {
            return null;
        }
        visited.add(node.id);
        
        console.log(`[ImageCrop] Checking node: ${node.type || node.title} (ID: ${node.id}), Direct: ${isDirectConnection}`);
        
        // 对于直接连接的节点，优先使用其执行后的输出图像
        if (isDirectConnection) {
            // 优先级1: 从节点的images属性获取（执行后的输出图像）
            if (node.images && node.images.length > 0) {
                const imageInfo = node.images[0];
                const imageUrl = `/view?filename=${imageInfo.filename}&subfolder=${imageInfo.subfolder || ''}&type=${imageInfo.type || 'output'}`;
                console.log(`[ImageCrop] ✓ Found processed image from direct node: ${node.type || node.title}`);
                return imageUrl;
            }
            
            // 优先级2: 从节点的imgs属性获取（显示的图像）
            if (node.imgs && node.imgs.length > 0) {
                const imgElement = node.imgs[0];
                if (imgElement && imgElement.src && imgElement.complete) {
                    console.log(`[ImageCrop] ✓ Found image from direct node imgs: ${node.type || node.title}`);
                    return imgElement.src;
                }
            }
        } else {
            // 对于上游节点，优先使用imgs（原始图像），再使用images
            // 优先级1: 从节点的imgs属性获取（LoadImage等显示的原始图像）
            if (node.imgs && node.imgs.length > 0) {
                const imgElement = node.imgs[0];
                if (imgElement && imgElement.src && imgElement.complete) {
                    console.log(`[ImageCrop] ✓ Found image from upstream imgs: ${node.type || node.title}`);
                    return imgElement.src;
                }
            }
            
            // 优先级2: 从节点的images属性获取
            if (node.images && node.images.length > 0) {
                const imageInfo = node.images[0];
                const imageUrl = `/view?filename=${imageInfo.filename}&subfolder=${imageInfo.subfolder || ''}&type=${imageInfo.type || 'output'}`;
                console.log(`[ImageCrop] ✓ Found processed image from upstream: ${node.type || node.title}`);
                return imageUrl;
            }
        }
        
        // 优先级3: 从节点的widgets获取
        if (node.widgets) {
            for (const widget of node.widgets) {
                if (widget.type === 'image' && widget.value) {
                    console.log(`[ImageCrop] ✓ Found image from widget: ${node.type || node.title}`);
                    return widget.value;
                }
            }
        }
        
        // 优先级4: 检查节点是否有properties.image
        if (node.properties && node.properties.image) {
            console.log(`[ImageCrop] ✓ Found image from properties: ${node.type || node.title}`);
            return node.properties.image;
        }
        
        // 优先级5: 递归查找上游节点（只有当前节点完全没有图像时才向上查找）
        console.log(`[ImageCrop] No image in current node, searching upstream...`);
        if (node.inputs) {
            for (const input of node.inputs) {
                // 查找图像类型的输入
                if (input.link && (input.type === "IMAGE" || input.name === "image" || input.name.toLowerCase().includes("image"))) {
                    const link = app.graph.links[input.link];
                    if (link) {
                        const upstreamNode = app.graph.getNodeById(link.origin_id);
                        if (upstreamNode) {
                            console.log(`[ImageCrop] → Searching upstream: ${upstreamNode.type || upstreamNode.title}`);
                            const result = this.findImageSource(upstreamNode, visited, false);
                            if (result) {
                                return result;
                            }
                        }
                    }
                }
            }
        }
        
        console.log(`[ImageCrop] ✗ No image found in node: ${node.type || node.title}`);
        return null;
    },
    
    loadImage(src) {
        const panel = this.panel;
        if (!panel || panel.currentSrc === src) return;
        
        const img = new Image();
        img.crossOrigin = 'anonymous';
        
        img.onload = () => {
            panel.inputImage = img;
            panel.currentSrc = src;
            this.drawCanvas();
        };
        
        img.onerror = () => this.drawPlaceholder();
        img.src = src;
    },
    
    drawPlaceholder() {
        const panel = this.panel;
        if (!panel) return;
        
        const ctx = panel.ctx;
        const canvas = panel.canvas;
        
        ctx.fillStyle = '#2a2a2a';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        
        // 网格
        ctx.strokeStyle = '#333';
        for (let x = 0; x <= canvas.width; x += 20) {
            ctx.beginPath();
            ctx.moveTo(x, 0);
            ctx.lineTo(x, canvas.height);
            ctx.stroke();
        }
        for (let y = 0; y <= canvas.height; y += 20) {
            ctx.beginPath();
            ctx.moveTo(0, y);
            ctx.lineTo(canvas.width, y);
            ctx.stroke();
        }
        
        // 文字
        ctx.fillStyle = '#888';
        ctx.font = '16px Arial';
        ctx.textAlign = 'center';
        ctx.fillText('🖼️', canvas.width/2, canvas.height/2 - 20);
        ctx.font = '14px Arial';
        ctx.fillText('等待图像输入...', canvas.width/2, canvas.height/2 + 10);
        
        this.drawCropBox(canvas.width/2, canvas.height/2, 0.5);
    },
    
    drawCanvas() {
        const panel = this.panel;
        if (!panel || !panel.inputImage) return;
        
        const ctx = panel.ctx;
        const canvas = panel.canvas;
        const img = panel.inputImage;
        const dpr = panel.dpr || 1;
        
        // 保存上下文状态
        ctx.save();
        
        // 应用设备像素比缩放
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        
        // 使用逻辑像素尺寸
        const canvasWidth = canvas.width / dpr;
        const canvasHeight = canvas.height / dpr;
        
        // 清空
        ctx.fillStyle = '#1a1a1a';
        ctx.fillRect(0, 0, canvasWidth, canvasHeight);
        
        // 计算基础显示尺寸（适应画布，使用逻辑像素）
        const baseScale = Math.min(canvasWidth / img.width, canvasHeight / img.height) * 0.9;
        
        // 应用视图缩放（用于交互查看，不影响参数）
        const viewScale = panel.viewScale || 1.0;
        const finalScale = baseScale * viewScale;
        const w = img.width * finalScale;
        const h = img.height * finalScale;
        
        // 获取视图偏移（用于交互移动，不影响参数）
        const imageOffsetX = panel.imageOffsetX || 0;
        const imageOffsetY = panel.imageOffsetY || 0;
        
        // 计算图像位置（居中 + 视图偏移，使用逻辑像素）
        const x = (canvasWidth - w) / 2 + imageOffsetX;
        const y = (canvasHeight - h) / 2 + imageOffsetY;
        
        // 启用图像平滑以提高清晰度
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        
        // 应用旋转
        const rotation = panel.rotation || 0;
        if (rotation !== 0) {
            ctx.save();
            // 移动到图像中心
            ctx.translate(x + w / 2, y + h / 2);
            // 旋转
            ctx.rotate((rotation * Math.PI) / 180);
            // 绘制图像（从中心点绘制）
            ctx.drawImage(img, -w / 2, -h / 2, w, h);
            ctx.restore();
        } else {
            // 不旋转时直接绘制
            ctx.drawImage(img, x, y, w, h);
        }
        
        // 绘制剪裁框（使用基础比例，不受视图缩放影响）
        // 必须在restore之前绘制，使用相同的变换矩阵
        this.drawCropBox(ctx, canvasWidth, canvasHeight, baseScale, viewScale);
        
        // 恢复上下文状态
        ctx.restore();
        
        // 更新信息显示（显示视图状态）
        this.updateInfo();
    },
    
    drawCropBox(ctx, canvasWidth, canvasHeight, baseScale, viewScale) {
        const panel = this.panel;
        if (!panel || !panel.inputImage) return;
        
        const img = panel.inputImage;
        
        // 获取剪裁框尺寸（像素值）
        const cropWidth = this.widgets?.find(w => w.name === "crop_width")?.value || 512;
        const cropHeight = this.widgets?.find(w => w.name === "crop_height")?.value || 512;
        
        // 计算剪裁框在原始图像中的位置（居中）
        const cropStartX = (img.width - cropWidth) / 2;
        const cropStartY = (img.height - cropHeight) / 2;
        
        // 使用基础比例（不含视图缩放）来计算剪裁框位置
        // 这样剪裁框大小固定，不受视图缩放影响
        const baseW = img.width * baseScale;
        const baseH = img.height * baseScale;
        const baseX = (canvasWidth - baseW) / 2;
        const baseY = (canvasHeight - baseH) / 2;
        
        const scaleRatio = baseScale;  // 只使用基础比例
        const x = baseX + cropStartX * scaleRatio;
        const y = baseY + cropStartY * scaleRatio;
        const w = cropWidth * scaleRatio;
        const h = cropHeight * scaleRatio;
        
        // 红色边框
        ctx.strokeStyle = '#ff4444';
        ctx.lineWidth = 3;
        ctx.strokeRect(x, y, w, h);
        
        // 黄色角点 - 缩小一半
        ctx.fillStyle = '#ffff00';
        const cs = 4;  // 从8改为4，小一半
        [[x-cs/2, y-cs/2], [x+w-cs/2, y-cs/2], 
         [x-cs/2, y+h-cs/2], [x+w-cs/2, y+h-cs/2]].forEach(([px, py]) => {
            ctx.fillRect(px, py, cs, cs);
        });
        
        // 移除了绿色十字线
    },
    
    updateInfo() {
        const panel = this.panel;
        if (!panel) return;
        
        const posSpan = panel.controlPanel.querySelector('#pos');
        const zoomSpan = panel.controlPanel.querySelector('#zoom');
        const sizeSpan = panel.controlPanel.querySelector('#size');
        const rotationSpan = panel.controlPanel.querySelector('#rotation');
        
        if (posSpan) {
            // 显示视图偏移（交互移动的距离）
            const x = Math.round(panel.imageOffsetX || 0);
            const y = Math.round(panel.imageOffsetY || 0);
            posSpan.textContent = `${x}, ${y}`;
        }
        
        if (zoomSpan) {
            // 显示视图缩放（交互缩放的倍数）
            const s = panel.viewScale || 1.0;
            zoomSpan.textContent = `${Math.round(s * 100)}%`;
        }
        
        if (sizeSpan) {
            // 显示剪裁框尺寸
            const w = this.widgets?.find(w => w.name === "crop_width")?.value || 512;
            const h = this.widgets?.find(w => w.name === "crop_height")?.value || 512;
            sizeSpan.textContent = `${w}×${h}`;
        }
        
        if (rotationSpan) {
            // 显示旋转角度
            const r = panel.rotation || 0;
            rotationSpan.textContent = `${r}°`;
        }
    },
    
    updateParameter(name, value) {
        const widget = this.widgets?.find(w => w.name === name);
        if (widget && widget.value !== value) {
            widget.value = value;
            
            // 触发节点更新
            if (this.onInputsChange) {
                this.onInputsChange();
            }
            
            // 更新信息显示
            if (this.updateInfo) {
                this.updateInfo();
            }
            
            // 标记图形需要重绘
            if (app.graph) {
                app.graph.setDirtyCanvas(true, false);
            }
            
            // 立即重绘画布（更新裁切框显示）
            if (this.drawCanvas) {
                this.drawCanvas();
            }
        }
    },
    
    // 更新模式UI显示（手动输入 vs 预设选择）
    updateModeUI(mode) {
        const panel = this.panel;
        if (!panel) return;
        
        // 隐藏/显示相应的控件
        const manualControls = panel.controlPanel?.querySelector('.manual-controls');
        const presetControls = panel.controlPanel?.querySelector('.preset-controls');
        
        if (manualControls && presetControls) {
            if (mode === 'manual') {
                manualControls.style.display = 'flex';
                presetControls.style.display = 'none';
            } else {
                manualControls.style.display = 'none';
                presetControls.style.display = 'flex';
                
                // 更新裁剪框尺寸
                this.applyCurrentPreset();
            }
        }
    },
    
    // 根据当前预设更新比例选项（仅更新选项，不自动选择）
    updateRatioOptions(preset, skipSelect = false) {
        const panel = this.panel;
        if (!panel) return;
        
        const presetConfig = PRESET_CONFIGS[preset];
        if (!presetConfig) return;
        
        const ratioSelect = panel.ratioSelect;
        if (!ratioSelect) return;
        
        // 保存当前选中的值（如果有）
        const currentSelectedValue = ratioSelect.value;
        
        // 清空并重新填充比例选项
        ratioSelect.innerHTML = '';
        
        Object.keys(presetConfig).forEach(ratio => {
            const option = document.createElement('option');
            option.value = ratio;
            option.textContent = ratio;
            ratioSelect.appendChild(option);
        });
        
        // 如果不是跳过选择模式，默认选择第一个比例
        if (!skipSelect && ratioSelect.options.length > 0) {
            ratioSelect.selectedIndex = 0;
            this.updateSizeOptions(ratioSelect.value);
        }
    },
    
    // 根据当前比例更新尺寸选项（仅更新选项，不自动选择）
    updateSizeOptions(ratio, skipSelect = false) {
        const panel = this.panel;
        if (!panel) return;
        
        const presetWidget = this.widgets?.find(w => w.name === "preset");
        const preset = presetWidget?.value || "klein";
        
        const presetConfig = PRESET_CONFIGS[preset];
        if (!presetConfig || !presetConfig[ratio]) return;
        
        const sizeSelect = panel.sizeSelect;
        if (!sizeSelect) return;
        
        // 保存当前选中的值（如果有）
        const currentSelectedValue = sizeSelect.value;
        
        // 获取当前保存的尺寸值
        const sizeWidget = this.widgets?.find(w => w.name === "size");
        const savedSize = sizeWidget?.value;
        
        // 清空并重新填充尺寸选项
        sizeSelect.innerHTML = '';
        
        presetConfig[ratio].forEach(size => {
            const option = document.createElement('option');
            option.value = `${size.width}x${size.height}`;
            option.textContent = `${size.width}×${size.height}`;
            option.dataset.width = size.width;
            option.dataset.height = size.height;
            sizeSelect.appendChild(option);
        });
        
        // 尝试恢复保存的值
        if (savedSize && Array.from(sizeSelect.options).some(opt => opt.value === savedSize)) {
            sizeSelect.value = savedSize;
        } else if (!skipSelect && sizeSelect.options.length > 0) {
            // 如果不是跳过选择模式且没有保存的值，默认选择第一个尺寸
            sizeSelect.selectedIndex = 0;
            this.applySizeToCrop(sizeSelect.value);
        }
    },
    
    // 应用选定的尺寸到裁剪框
    applySizeToCrop(sizeStr) {
        if (!sizeStr) return;
        
        const [width, height] = sizeStr.split('x').map(Number);
        if (width && height) {
            this.updateParameter('crop_width', width);
            this.updateParameter('crop_height', height);
        }
    },
    
    // 应用当前预设选择
    applyCurrentPreset() {
        const panel = this.panel;
        if (!panel) return;
        
        const ratioSelect = panel.ratioSelect;
        const sizeSelect = panel.sizeSelect;
        
        if (ratioSelect && sizeSelect) {
            const ratio = ratioSelect.value;
            const size = sizeSelect.value;
            
            if (ratio && size) {
                this.updateSizeOptions(ratio);
                this.applySizeToCrop(size);
            }
        }
    }
});
