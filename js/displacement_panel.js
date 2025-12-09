// ComfyUI 置换贴图交互面板
import { app } from "../../scripts/app.js";

app.registerExtension({
    name: "DisplacementMapPanel",
    
    async beforeRegisterNodeDef(nodeType, nodeData, app) {
        console.log('[DisplacementPanel] Checking node:', nodeData.name, nodeData);
        if (nodeData.name === "DisplacementMapWithPanel") {
            console.log('[DisplacementPanel] Registering panel for node:', nodeData.name);
            
            const onNodeCreated = nodeType.prototype.onNodeCreated;
            nodeType.prototype.onNodeCreated = function () {
                console.log('[DisplacementPanel] onNodeCreated called for node:', this.id);
                const r = onNodeCreated ? onNodeCreated.apply(this, arguments) : undefined;
                
                // 添加交互面板
                console.log('[DisplacementPanel] Adding panel...');
                this.addDisplacementPanel();
                
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
                if (this.loadInputImages) {
                    setTimeout(() => this.loadInputImages(), 100);
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
                
                // 连接变化时尝试加载图像
                if (type === 1 && this.loadInputImages) {
                    setTimeout(() => this.loadInputImages(), 100);
                }
                
                return r;
            };
            
            // 监听widget值变化
            const onWidgetChanged = nodeType.prototype.onWidgetChanged;
            nodeType.prototype.onWidgetChanged = function(name, value, old_value, widget) {
                const r = onWidgetChanged ? onWidgetChanged.apply(this, arguments) : undefined;
                
                // 当参数变化时，重绘预览
                if (["strength", "horizontal_scale", "vertical_scale", "blur_radius", "blend_mode", "opacity"].includes(name)) {
                    if (this.drawCanvas) {
                        this.drawCanvas();
                    }
                }
                
                // 当偏移参数变化时，同步到面板
                if (name === "texture_offset_x" || name === "texture_offset_y") {
                    if (this.panel) {
                        if (name === "texture_offset_x") {
                            this.panel.textureOffsetX = value;
                        } else {
                            this.panel.textureOffsetY = value;
                        }
                        if (this.drawCanvas) {
                            this.drawCanvas();
                        }
                    }
                }
                
                // 当缩放参数变化时，同步到面板
                if (name === "texture_scale") {
                    if (this.panel) {
                        this.panel.textureScale = value;
                        if (this.drawCanvas) {
                            this.drawCanvas();
                        }
                    }
                }
                
                // 当宽度、高度参数变化时，同步到面板
                if (name === "texture_width" || name === "texture_height") {
                    if (this.panel) {
                        if (name === "texture_width") {
                            this.panel.textureWidth = value;
                        } else {
                            this.panel.textureHeight = value;
                        }
                        if (this.drawCanvas) {
                            this.drawCanvas();
                        }
                    }
                }
                
                // 当旋转参数变化时，同步到面板
                if (name === "texture_rotation") {
                    if (this.panel) {
                        this.panel.textureRotation = value;
                        if (this.drawCanvas) {
                            this.drawCanvas();
                        }
                    }
                }
                
                return r;
            };
        }
    }
});

Object.assign(LGraphNode.prototype, {
    
    addDisplacementPanel() {
        console.log('[DisplacementPanel] addDisplacementPanel called');
        // 创建面板容器
        const container = document.createElement("div");
        container.style.cssText = `
            width: 100%;
            min-height: 300px;
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
        
        // 创建控制面板
        const controlPanel = document.createElement("div");
        controlPanel.style.cssText = `
            background: #333;
            padding: 6px 10px;
            border-top: 1px solid #555;
            font-size: 11px;
            color: #ddd;
            display: flex;
            justify-content: space-between;
            flex-wrap: wrap;
            gap: 5px;
        `;
        
        controlPanel.innerHTML = `
            <div style="flex: 1; min-width: 100px;">💪 <span id="strength">10.0</span></div>
            <div style="flex: 1; min-width: 100px;">↔️ <span id="horizontal">1.0</span></div>
            <div style="flex: 1; min-width: 100px;">↕️ <span id="vertical">1.0</span></div>
            <div style="flex: 1; min-width: 80px;">🌫️ <span id="blur">0</span></div>
            <div style="flex: 1; min-width: 100px;">📍 <span id="position">0, 0</span></div>
            <div style="flex: 1; min-width: 100px;">🔍 <span id="scale">100%</span></div>
            <div style="flex: 1; min-width: 100px;">📏 <span id="size">0×0</span></div>
            <div style="flex: 1; min-width: 100px;">🔄 <span id="rotation">0°</span></div>
        `;
        
        canvasArea.appendChild(canvas);
        container.appendChild(canvasArea);
        container.appendChild(controlPanel);
        
        // 添加到节点
        const widget = this.addDOMWidget("panel", "div", container);
        const self = this;
        widget.computeSize = function() {
            const nodeWidth = self.size ? self.size[0] : 400;
            let panelHeight = 350;
            
            if (self.size && self.size[1]) {
                const nonPanelWidgets = (self.widgets || []).filter(w => w.name !== "panel");
                const estimatedOtherHeight = nonPanelWidgets.length * 35 + 50;
                const availableHeight = self.size[1] - estimatedOtherHeight;
                if (availableHeight > 250) {
                    panelHeight = Math.min(availableHeight, 600);
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
            textureImage: null,
            backgroundImage: null,
            displacementImage: null,
            resultImage: null,
            currentTextureSrc: null,
            currentBackgroundSrc: null,
            currentDisplacementSrc: null,
            currentResultSrc: null,
            isDragging: false,
            lastX: 0,
            lastY: 0,
            textureOffsetX: 0,
            textureOffsetY: 0,
            textureScale: 1.0,
            textureWidth: 0,
            textureHeight: 0,
            textureRotation: 0.0,
            eventHandlers: {
                mouseMoveHandler: null,
                mouseUpHandler: null
            }
        };
        
        // 绑定事件
        this.bindPanelEvents(canvasArea, canvas);
        
        // 初始化Canvas尺寸
        this.updateCanvasSize();
        
        // 监听节点大小变化
        const originalOnResize = this.onResize;
        this.onResize = function(size) {
            if (originalOnResize) {
                originalOnResize.call(this, size);
            }
            if (this.updateCanvasSize) {
                requestAnimationFrame(() => {
                    this.updateCanvasSize();
                });
            }
            if (widget && widget.computeSize) {
                const newSize = widget.computeSize();
                if (widget.setSize) {
                    widget.setSize(newSize);
                }
            }
        };
        
        // 初始绘制占位符
        setTimeout(() => {
            this.drawPlaceholder();
            this.loadInputImages();
        }, 100);
        
        // 初始绘制占位符
        setTimeout(() => {
            this.drawPlaceholder();
            this.loadInputImages();
        }, 100);
        
        // 定期检查输入图像
        this.imageCheckInterval = setInterval(() => this.loadInputImages(), 500);
    },
    
    updateCanvasSize() {
        const panel = this.panel;
        if (!panel || !panel.canvas || !panel.canvasArea) return;
        
        // 使用ResizeObserver监听canvasArea尺寸变化
        if (!panel.resizeObserver) {
            panel.resizeObserver = new ResizeObserver((entries) => {
                for (const entry of entries) {
                    const { width, height } = entry.contentRect;
                    this.updateCanvasDimensions(Math.max(200, Math.floor(width)), Math.max(200, Math.floor(height)));
                }
            });
            panel.resizeObserver.observe(panel.canvasArea);
        }
        
        // 立即更新一次
        const rect = panel.canvasArea.getBoundingClientRect();
        const displayWidth = Math.max(200, Math.floor(rect.width));
        const displayHeight = Math.max(200, Math.floor(rect.height));
        this.updateCanvasDimensions(displayWidth, displayHeight);
    },
    
    updateCanvasDimensions(displayWidth, displayHeight) {
        const panel = this.panel;
        if (!panel || !panel.canvas) return;
        
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        const width = displayWidth * dpr;
        const height = displayHeight * dpr;
        
        if (panel.canvas.width !== width || panel.canvas.height !== height) {
            panel.canvas.width = width;
            panel.canvas.height = height;
            panel.dpr = dpr;
            
            this.drawCanvas();
        }
    },
    
    bindPanelEvents(area, canvas) {
        const panel = this.panel;
        
        // 鼠标按下 - 拖拽纹理图
        canvas.addEventListener('mousedown', (e) => {
            if (e.button !== 0) return;
            
            panel.isDragging = true;
            panel.lastX = e.clientX;
            panel.lastY = e.clientY;
            area.style.cursor = 'grabbing';
            
            e.preventDefault();
            e.stopPropagation();
        });
        
        const mouseMoveHandler = (e) => {
            if (!panel.isDragging) return;
            
            const dx = e.clientX - panel.lastX;
            const dy = e.clientY - panel.lastY;
            
            // 计算在原始图像坐标中的偏移
            const dpr = panel.dpr || 1;
            const canvasWidth = canvas.width / dpr;
            const canvasHeight = canvas.height / dpr;
            
            // 获取背景图或纹理图的显示尺寸
            let baseScale = 1.0;
            if (panel.backgroundImage) {
                baseScale = Math.min(canvasWidth / panel.backgroundImage.width, canvasHeight / panel.backgroundImage.height) * 0.9;
            } else if (panel.textureImage) {
                baseScale = Math.min(canvasWidth / panel.textureImage.width, canvasHeight / panel.textureImage.height) * 0.9;
            }
            
            // 将显示像素偏移转换为原始图像像素偏移
            const offsetX = Math.round(dx / baseScale);
            const offsetY = Math.round(dy / baseScale);
            
            // 更新偏移
            panel.textureOffsetX = (panel.textureOffsetX || 0) + offsetX;
            panel.textureOffsetY = (panel.textureOffsetY || 0) + offsetY;
            
            panel.lastX = e.clientX;
            panel.lastY = e.clientY;
            
            // 更新参数
            this.updateTextureOffset();
            
            // 重绘Canvas
            this.drawCanvas();
            
            e.preventDefault();
        };
        
        const mouseUpHandler = (e) => {
            if (!panel.isDragging) return;
            
            panel.isDragging = false;
            area.style.cursor = 'grab';
            
            e.preventDefault();
        };
        
        // 保存事件处理器引用
        panel.eventHandlers.mouseMoveHandler = mouseMoveHandler;
        panel.eventHandlers.mouseUpHandler = mouseUpHandler;
        
        // 使用全局事件监听器处理拖拽
        document.addEventListener('mousemove', mouseMoveHandler, { passive: false });
        document.addEventListener('mouseup', mouseUpHandler, { passive: false });
        
        // 滚轮缩放纹理图
        const handleWheel = (e) => {
            const rect = canvas.getBoundingClientRect();
            const isInCanvas = e.clientX >= rect.left && e.clientX <= rect.right && 
                              e.clientY >= rect.top && e.clientY <= rect.bottom;
            
            if (!isInCanvas) return;
            
            e.preventDefault();
            
            const factor = e.deltaY > 0 ? 0.9 : 1.1;
            const currentScale = panel.textureScale || 1.0;
            const newScale = Math.max(0.1, Math.min(5.0, currentScale * factor));
            
            if (newScale !== currentScale) {
                panel.textureScale = newScale;
                
                // 更新参数
                this.updateTextureScale();
                
                this.drawCanvas();
            }
        };
        
        canvas.addEventListener('wheel', handleWheel, { passive: false });
        area.addEventListener('wheel', handleWheel, { passive: false });
        
        // 双击重置偏移和缩放
        canvas.addEventListener('dblclick', (e) => {
            panel.textureOffsetX = 0;
            panel.textureOffsetY = 0;
            panel.textureScale = 1.0;
            
            this.updateTextureOffset();
            this.updateTextureScale();
            this.drawCanvas();
            
            e.preventDefault();
            e.stopPropagation();
        });
        
        // 防止canvas捕获键盘事件
        canvas.setAttribute('tabindex', '-1');
        area.setAttribute('tabindex', '-1');
        
        canvas.addEventListener('focus', (e) => {
            e.target.blur();
        });
        
        area.addEventListener('focus', (e) => {
            e.target.blur();
        });
    },
    
    updateTextureOffset() {
        const panel = this.panel;
        if (!panel) return;
        
        this.updateParameter('texture_offset_x', Math.round(panel.textureOffsetX || 0));
        this.updateParameter('texture_offset_y', Math.round(panel.textureOffsetY || 0));
    },
    
    updateTextureScale() {
        const panel = this.panel;
        if (!panel) return;
        
        this.updateParameter('texture_scale', Math.round((panel.textureScale || 1.0) * 100) / 100);
    },
    
    updateTextureSize() {
        const panel = this.panel;
        if (!panel) return;
        
        this.updateParameter('texture_width', Math.round(panel.textureWidth || 0));
        this.updateParameter('texture_height', Math.round(panel.textureHeight || 0));
    },
    
    updateTextureRotation() {
        const panel = this.panel;
        if (!panel) return;
        
        this.updateParameter('texture_rotation', Math.round((panel.textureRotation || 0.0) * 10) / 10);
    },
    
    
    updateParameter(name, value) {
        const widget = this.widgets?.find(w => w.name === name);
        if (widget && widget.value !== value) {
            widget.value = value;
            
            if (this.onInputsChange) {
                this.onInputsChange();
            }
            
            if (app.graph) {
                app.graph.setDirtyCanvas(true, false);
            }
        }
    },
    
    loadInputImages() {
        console.log('[DisplacementPanel] loadInputImages called');
        // 加载纹理图
        const textureInput = this.inputs?.find(input => input.name === "texture");
        if (textureInput && textureInput.link) {
            const link = app.graph.links[textureInput.link];
            if (link) {
                const sourceNode = app.graph.getNodeById(link.origin_id);
                if (sourceNode) {
                    const imageSrc = this.findImageSource(sourceNode);
                    if (imageSrc && imageSrc !== this.panel.currentTextureSrc) {
                        this.loadTextureImage(imageSrc);
                    }
                }
            }
        } else {
            this.panel.textureImage = null;
            this.panel.currentTextureSrc = null;
        }
        
        // 加载背景图
        const backgroundInput = this.inputs?.find(input => input.name === "background");
        if (backgroundInput && backgroundInput.link) {
            const link = app.graph.links[backgroundInput.link];
            if (link) {
                const sourceNode = app.graph.getNodeById(link.origin_id);
                if (sourceNode) {
                    const imageSrc = this.findImageSource(sourceNode);
                    if (imageSrc && imageSrc !== this.panel.currentBackgroundSrc) {
                        this.loadBackgroundImage(imageSrc);
                    }
                }
            }
        } else {
            this.panel.backgroundImage = null;
            this.panel.currentBackgroundSrc = null;
        }
        
        // 加载置换图
        const displacementInput = this.inputs?.find(input => input.name === "displacement_map");
        if (displacementInput && displacementInput.link) {
            const link = app.graph.links[displacementInput.link];
            if (link) {
                const sourceNode = app.graph.getNodeById(link.origin_id);
                if (sourceNode) {
                    const imageSrc = this.findImageSource(sourceNode);
                    if (imageSrc && imageSrc !== this.panel.currentDisplacementSrc) {
                        this.loadDisplacementImage(imageSrc);
                    }
                }
            }
        } else {
            this.panel.displacementImage = null;
            this.panel.currentDisplacementSrc = null;
        }
        
        // 加载偏移、缩放和旋转参数
        const offsetXWidget = this.widgets?.find(w => w.name === "texture_offset_x");
        const offsetYWidget = this.widgets?.find(w => w.name === "texture_offset_y");
        const scaleWidget = this.widgets?.find(w => w.name === "texture_scale");
        if (offsetXWidget) {
            this.panel.textureOffsetX = offsetXWidget.value || 0;
        }
        if (offsetYWidget) {
            this.panel.textureOffsetY = offsetYWidget.value || 0;
        }
        if (scaleWidget) {
            this.panel.textureScale = scaleWidget.value || 1.0;
        }
        
        // 重绘
        this.drawCanvas();
    },
    
    findImageSource(node, visited = new Set()) {
        if (!node || visited.has(node.id)) {
            return null;
        }
        visited.add(node.id);
        
        // 优先级1: 从节点的images属性获取
        if (node.images && node.images.length > 0) {
            const imageInfo = node.images[0];
            const imageUrl = `/view?filename=${imageInfo.filename}&subfolder=${imageInfo.subfolder || ''}&type=${imageInfo.type || 'output'}`;
            return imageUrl;
        }
        
        // 优先级2: 从节点的imgs属性获取
        if (node.imgs && node.imgs.length > 0) {
            const imgElement = node.imgs[0];
            if (imgElement && imgElement.src && imgElement.complete) {
                return imgElement.src;
            }
        }
        
        // 优先级3: 从节点的widgets获取
        if (node.widgets) {
            for (const widget of node.widgets) {
                if (widget.type === 'image' && widget.value) {
                    return widget.value;
                }
            }
        }
        
        // 递归查找上游节点
        if (node.inputs) {
            for (const input of node.inputs) {
                if (input.link && (input.type === "IMAGE" || input.name === "image" || input.name.toLowerCase().includes("image"))) {
                    const link = app.graph.links[input.link];
                    if (link) {
                        const upstreamNode = app.graph.getNodeById(link.origin_id);
                        if (upstreamNode) {
                            const result = this.findImageSource(upstreamNode, visited);
                            if (result) {
                                return result;
                            }
                        }
                    }
                }
            }
        }
        
        return null;
    },
    
    loadTextureImage(src) {
        const panel = this.panel;
        if (!panel || panel.currentTextureSrc === src) return;
        
        const img = new Image();
        img.crossOrigin = 'anonymous';
        
        img.onload = () => {
            if (panel.currentTextureSrc === src) {
                panel.textureImage = img;
                this.drawCanvas();
            }
        };
        
        img.onerror = () => {
            if (panel.currentTextureSrc === src) {
                panel.textureImage = null;
                this.drawCanvas();
            }
        };
        
        panel.textureImage = null; // 先清空，避免显示旧图像
        panel.currentTextureSrc = src;
        img.src = src;
    },
    
    loadBackgroundImage(src) {
        const panel = this.panel;
        if (!panel || panel.currentBackgroundSrc === src) return;
        
        const img = new Image();
        img.crossOrigin = 'anonymous';
        
        img.onload = () => {
            if (panel.currentBackgroundSrc === src) {
                panel.backgroundImage = img;
                this.drawCanvas();
            }
        };
        
        img.onerror = () => {
            if (panel.currentBackgroundSrc === src) {
                panel.backgroundImage = null;
                this.drawCanvas();
            }
        };
        
        panel.backgroundImage = null; // 先清空，避免显示旧图像
        panel.currentBackgroundSrc = src;
        img.src = src;
    },
    
    loadDisplacementImage(src) {
        const panel = this.panel;
        if (!panel || panel.currentDisplacementSrc === src) return;
        
        const img = new Image();
        img.crossOrigin = 'anonymous';
        
        img.onload = () => {
            panel.displacementImage = img;
            panel.currentDisplacementSrc = src;
            this.drawCanvas();
        };
        
        img.onerror = () => {
            panel.displacementImage = null;
            this.drawCanvas();
        };
        
        img.src = src;
    },
    
    loadResultImage() {
        const panel = this.panel;
        if (!panel) return;
        
        // 尝试从节点的images获取结果图像（preview_image输出）
        // 检查多个可能的输出位置
        let previewImageInfo = null;
        
        // 方式1: 从images数组获取（第二个输出是preview_image）
        if (this.images && this.images.length > 1) {
            previewImageInfo = this.images[1];
        }
        // 方式2: 从imgs数组获取
        else if (this.imgs && this.imgs.length > 1) {
            const imgElement = this.imgs[1];
            if (imgElement && imgElement.src && imgElement.complete) {
                if (imgElement.src !== panel.currentResultSrc) {
                    panel.resultImage = imgElement;
                    panel.currentResultSrc = imgElement.src;
                    this.drawCanvas();
                }
                return;
            }
        }
        
        // 如果有预览图像信息，加载它
        if (previewImageInfo) {
            const imageUrl = `/view?filename=${previewImageInfo.filename}&subfolder=${previewImageInfo.subfolder || ''}&type=${previewImageInfo.type || 'output'}`;
            if (imageUrl !== panel.currentResultSrc) {
                const img = new Image();
                img.crossOrigin = 'anonymous';
                
                img.onload = () => {
                    panel.resultImage = img;
                    panel.currentResultSrc = imageUrl;
                    this.drawCanvas();
                };
                
                img.onerror = () => {
                    panel.resultImage = null;
                    panel.currentResultSrc = null;
                    this.drawCanvas();
                };
                
                img.src = imageUrl;
            }
        } else {
            // 没有预览图像时，清除
            if (panel.resultImage) {
                panel.resultImage = null;
                panel.currentResultSrc = null;
            }
        }
    },
    
    drawPlaceholder() {
        const panel = this.panel;
        if (!panel) return;
        
        const ctx = panel.ctx;
        const canvas = panel.canvas;
        const dpr = panel.dpr || 1;
        
        ctx.save();
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        
        const canvasWidth = canvas.width / dpr;
        const canvasHeight = canvas.height / dpr;
        
        ctx.fillStyle = '#2a2a2a';
        ctx.fillRect(0, 0, canvasWidth, canvasHeight);
        
        // 网格
        ctx.strokeStyle = '#333';
        for (let x = 0; x <= canvasWidth; x += 20) {
            ctx.beginPath();
            ctx.moveTo(x, 0);
            ctx.lineTo(x, canvasHeight);
            ctx.stroke();
        }
        for (let y = 0; y <= canvasHeight; y += 20) {
            ctx.beginPath();
            ctx.moveTo(0, y);
            ctx.lineTo(canvasWidth, y);
            ctx.stroke();
        }
        
        // 文字
        ctx.fillStyle = '#888';
        ctx.font = '16px Arial';
        ctx.textAlign = 'center';
        ctx.fillText('🖼️', canvasWidth/2, canvasHeight/2 - 20);
        ctx.font = '14px Arial';
        ctx.fillText('等待图像输入...', canvasWidth/2, canvasHeight/2 + 10);
        
        ctx.restore();
    },
    
    drawCanvas() {
        const panel = this.panel;
        if (!panel || !panel.ctx || !panel.canvas) {
            console.log('[DisplacementPanel] drawCanvas: missing panel/ctx/canvas', { panel: !!panel, ctx: !!panel?.ctx, canvas: !!panel?.canvas });
            return;
        }
        
        console.log('[DisplacementPanel] drawCanvas:', {
            hasBackground: !!(panel.backgroundImage && panel.backgroundImage.complete),
            hasTexture: !!(panel.textureImage && panel.textureImage.complete),
            hasResult: !!(panel.resultImage && panel.resultImage.complete)
        });
        
        const ctx = panel.ctx;
        const canvas = panel.canvas;
        const dpr = panel.dpr || 1;
        
        ctx.save();
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        
        const canvasWidth = canvas.width / dpr;
        const canvasHeight = canvas.height / dpr;
        
        // 清空
        ctx.fillStyle = '#1a1a1a';
        ctx.fillRect(0, 0, canvasWidth, canvasHeight);
        
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        
        // 如果有背景图，固定显示背景图
        if (panel.backgroundImage && panel.backgroundImage.complete) {
            const bgScale = Math.min(canvasWidth / panel.backgroundImage.width, canvasHeight / panel.backgroundImage.height) * 0.9;
            const bgW = panel.backgroundImage.width * bgScale;
            const bgH = panel.backgroundImage.height * bgScale;
            const bgX = (canvasWidth - bgW) / 2;
            const bgY = (canvasHeight - bgH) / 2;
            
            // 绘制背景图（固定）
            ctx.drawImage(panel.backgroundImage, bgX, bgY, bgW, bgH);
            
            // 如果有纹理图，在背景图上绘制纹理图（可移动、缩放、调整尺寸和旋转）
            if (panel.textureImage && panel.textureImage.complete) {
                // 计算纹理图的显示尺寸
                let texW, texH;
                const baseTexScale = Math.min(canvasWidth / panel.textureImage.width, canvasHeight / panel.textureImage.height) * 0.9;
                
                if (panel.textureWidth > 0 && panel.textureHeight > 0) {
                    // 使用指定的宽度和高度（转换为显示尺寸）
                    texW = panel.textureWidth * bgScale;
                    texH = panel.textureHeight * bgScale;
                } else {
                    // 使用缩放比例
                    const userScale = panel.textureScale || 1.0;
                    const finalTexScale = baseTexScale * userScale;
                    texW = panel.textureImage.width * finalTexScale;
                    texH = panel.textureImage.height * finalTexScale;
                }
                
                // 计算纹理图位置（居中 + 偏移，偏移基于背景图缩放）
                const texX = (canvasWidth - texW) / 2 + (panel.textureOffsetX || 0) * bgScale;
                const texY = (canvasHeight - texH) / 2 + (panel.textureOffsetY || 0) * bgScale;
                const centerX = texX + texW / 2;
                const centerY = texY + texH / 2;
                
                const rotation = (panel.textureRotation || 0) * Math.PI / 180;
                
                // 保存上下文
                ctx.save();
                
                // 应用旋转
                ctx.translate(centerX, centerY);
                ctx.rotate(rotation);
                ctx.translate(-centerX, -centerY);
                
                // 绘制纹理图（半透明，便于查看位置）
                ctx.globalAlpha = 0.7;
                ctx.drawImage(panel.textureImage, texX, texY, texW, texH);
                ctx.globalAlpha = 1.0;
                
                // 绘制纹理图边框
                ctx.strokeStyle = '#00ff00';
                ctx.lineWidth = 2;
                ctx.strokeRect(texX, texY, texW, texH);
                
                // 恢复上下文
                ctx.restore();
            }
        } else if (panel.textureImage && panel.textureImage.complete) {
            // 没有背景图时，只显示纹理图
            this.drawImageCentered(ctx, panel.textureImage, canvasWidth, canvasHeight);
        } else if (panel.resultImage && panel.resultImage.complete) {
            // 显示结果图像
            this.drawImageCentered(ctx, panel.resultImage, canvasWidth, canvasHeight);
        } else {
            // 没有图像时显示占位符
            this.drawPlaceholder();
            ctx.restore();
            return;
        }
        
        ctx.restore();
        
        // 更新信息显示
        this.updateInfo();
    },
    
    drawImageCentered(ctx, img, canvasWidth, canvasHeight) {
        const scale = Math.min(canvasWidth / img.width, canvasHeight / img.height) * 0.9;
        const w = img.width * scale;
        const h = img.height * scale;
        const x = (canvasWidth - w) / 2;
        const y = (canvasHeight - h) / 2;
        
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(img, x, y, w, h);
    },
    
    drawSideBySide(ctx, textureImg, displacementImg, canvasWidth, canvasHeight) {
        const padding = 10;
        const availableWidth = canvasWidth - padding * 3;
        const availableHeight = canvasHeight - padding * 2;
        
        // 计算每个图像的尺寸
        const textureScale = Math.min(availableWidth / 2 / textureImg.width, availableHeight / textureImg.height) * 0.9;
        const displacementScale = Math.min(availableWidth / 2 / displacementImg.width, availableHeight / displacementImg.height) * 0.9;
        
        const textureW = textureImg.width * textureScale;
        const textureH = textureImg.height * textureScale;
        const displacementW = displacementImg.width * displacementScale;
        const displacementH = displacementImg.height * displacementScale;
        
        // 计算位置（左：纹理图，右：置换图）
        const textureX = padding;
        const textureY = (canvasHeight - textureH) / 2;
        const displacementX = canvasWidth - padding - displacementW;
        const displacementY = (canvasHeight - displacementH) / 2;
        
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        
        // 绘制纹理图
        ctx.drawImage(textureImg, textureX, textureY, textureW, textureH);
        
        // 绘制标签
        ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
        ctx.fillRect(textureX, textureY - 20, textureW, 20);
        ctx.fillStyle = '#fff';
        ctx.font = '12px Arial';
        ctx.textAlign = 'center';
        ctx.fillText('纹理图', textureX + textureW / 2, textureY - 5);
        
        // 绘制置换图
        ctx.drawImage(displacementImg, displacementX, displacementY, displacementW, displacementH);
        
        // 绘制标签
        ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
        ctx.fillRect(displacementX, displacementY - 20, displacementW, 20);
        ctx.fillStyle = '#fff';
        ctx.fillText('置换图', displacementX + displacementW / 2, displacementY - 5);
    },
    
    updateInfo() {
        const panel = this.panel;
        if (!panel) return;
        
        const strengthSpan = panel.controlPanel.querySelector('#strength');
        const horizontalSpan = panel.controlPanel.querySelector('#horizontal');
        const verticalSpan = panel.controlPanel.querySelector('#vertical');
        const blurSpan = panel.controlPanel.querySelector('#blur');
        const positionSpan = panel.controlPanel.querySelector('#position');
        
        if (strengthSpan) {
            const strength = this.widgets?.find(w => w.name === "strength")?.value || 10.0;
            strengthSpan.textContent = strength.toFixed(1);
        }
        
        if (horizontalSpan) {
            const horizontal = this.widgets?.find(w => w.name === "horizontal_scale")?.value || 1.0;
            horizontalSpan.textContent = horizontal.toFixed(2);
        }
        
        if (verticalSpan) {
            const vertical = this.widgets?.find(w => w.name === "vertical_scale")?.value || 1.0;
            verticalSpan.textContent = vertical.toFixed(2);
        }
        
        if (blurSpan) {
            const blur = this.widgets?.find(w => w.name === "blur_radius")?.value || 0;
            blurSpan.textContent = blur;
        }
        
        if (positionSpan) {
            const x = Math.round(panel.textureOffsetX || 0);
            const y = Math.round(panel.textureOffsetY || 0);
            positionSpan.textContent = `${x}, ${y}`;
        }
        
        const scaleSpan = panel.controlPanel.querySelector('#scale');
        if (scaleSpan) {
            const scale = panel.textureScale || 1.0;
            scaleSpan.textContent = `${Math.round(scale * 100)}%`;
        }
        
        const sizeSpan = panel.controlPanel.querySelector('#size');
        if (sizeSpan) {
            const width = panel.textureWidth || 0;
            const height = panel.textureHeight || 0;
            if (width > 0 && height > 0) {
                sizeSpan.textContent = `${width}×${height}`;
            } else {
                sizeSpan.textContent = '自动';
            }
        }
        
        const rotationSpan = panel.controlPanel.querySelector('#rotation');
        if (rotationSpan) {
            const rotation = panel.textureRotation || 0.0;
            rotationSpan.textContent = `${Math.round(rotation)}°`;
        }
    },
});

