// ComfyUI 比例裁剪交互面板
import { app } from "../../scripts/app.js";

app.registerExtension({
    name: "RatioCropPanel",
    
    async beforeRegisterNodeDef(nodeType, nodeData, app) {
        if (nodeData.name === "RatioCropWithPanel") {
            
            const onNodeCreated = nodeType.prototype.onNodeCreated;
            nodeType.prototype.onNodeCreated = function () {
                const r = onNodeCreated ? onNodeCreated.apply(this, arguments) : undefined;
                
                // 添加交互面板
                this.addRatioPanel();
                
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
                
                // 连接变化时尝试加载图像
                if (type === 1 && this.loadInputImage) {
                    setTimeout(() => this.loadInputImage(), 100);
                    
                    // 如果是新建连接，监听源节点的执行完成事件
                    if (connected && link_info) {
                        const sourceNode = app.graph.getNodeById(link_info.origin_id);
                        if (sourceNode) {
                            this.sourceImageNode = sourceNode;
                            
                            const originalOnExecuted = sourceNode.onExecuted;
                            sourceNode.onExecuted = function(message) {
                                const result = originalOnExecuted ? originalOnExecuted.apply(this, arguments) : undefined;
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
                
                // 当比例或尺寸变化时，重新计算裁剪框并重绘
                if ((name === "aspect_ratio" || name === "crop_size") && this.panel) {
                    this.updateCropBoxSize();
                    if (this.drawCanvas) {
                        this.drawCanvas();
                    }
                }
                
                // 当裁剪参数变化时，同步到面板并重绘
                if ((name === "crop_x" || name === "crop_y" || name === "crop_scale") && this.panel) {
                    if (this.drawCanvas) {
                        this.drawCanvas();
                    }
                }
                
                return r;
            };
        }
    }
});

Object.assign(LGraphNode.prototype, {
    
    addRatioPanel() {
        // 创建面板容器
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
            cursor: move;
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
            <div style="flex: 1; min-width: 100px;">📍 位置: <span id="cropPos">0, 0</span></div>
            <div style="flex: 1; min-width: 80px;">🔍 缩放: <span id="cropZoom">100%</span></div>
            <div style="flex: 1; min-width: 100px;">📐 尺寸: <span id="cropSize">512×512</span></div>
            <div style="flex: 1; min-width: 100px;">📏 比例: <span id="cropRatio">1:1</span></div>
        `;
        
        canvasArea.appendChild(canvas);
        container.appendChild(canvasArea);
        container.appendChild(controlPanel);
        
        // 添加到节点
        const widget = this.addDOMWidget("panel", "div", container);
        const self = this;
        widget.computeSize = function() {
            const nodeWidth = self.size ? self.size[0] : 400;
            let panelHeight = 280;
            
            if (self.size && self.size[1]) {
                const nonPanelWidgets = (self.widgets || []).filter(w => w.name !== "panel");
                const estimatedOtherHeight = nonPanelWidgets.length * 35 + 50;
                const availableHeight = self.size[1] - estimatedOtherHeight;
                if (availableHeight > 200) {
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
            isDragging: false,
            lastX: 0,
            lastY: 0,
            cropBoxX: 0,  // 裁剪框在图像坐标系中的X偏移
            cropBoxY: 0,  // 裁剪框在图像坐标系中的Y偏移
            cropBoxScale: 1.0,  // 裁剪框的缩放比例
            inputImage: null,
            imageScale: 1.0,  // 图像在画布上的显示缩放
            imageX: 0,  // 图像在画布上的X位置（居中）
            imageY: 0,  // 图像在画布上的Y位置（居中）
            eventHandlers: {
                mouseMoveHandler: null,
                mouseUpHandler: null
            }
        };
        
        // 绑定事件
        this.bindRatioPanelEvents(canvasArea, canvas);
        
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
        
        // 初始加载
        setTimeout(() => this.loadInputImage(), 500);
        
        // 定期检查输入图像
        this.imageCheckInterval = setInterval(() => this.loadInputImage(), 500);
    },
    
    updateCanvasSize() {
        const panel = this.panel;
        if (!panel || !panel.canvas || !panel.canvasArea) return;
        
        if (!panel.resizeObserver) {
            panel.resizeObserver = new ResizeObserver((entries) => {
                for (const entry of entries) {
                    const { width, height } = entry.contentRect;
                    this.updateCanvasDimensions(Math.max(200, Math.floor(width)), Math.max(150, Math.floor(height)));
                }
            });
            panel.resizeObserver.observe(panel.canvasArea);
        }
        
        const rect = panel.canvasArea.getBoundingClientRect();
        const displayWidth = Math.max(200, Math.floor(rect.width));
        const displayHeight = Math.max(150, Math.floor(rect.height));
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
            
            if (panel.inputImage) {
                this.drawCanvas();
            } else {
                this.drawPlaceholder();
            }
        }
    },
    
    bindRatioPanelEvents(area, canvas) {
        const panel = this.panel;
        
        // 鼠标拖拽 - 移动裁剪框
        canvas.addEventListener('mousedown', (e) => {
            if (e.button !== 0) return;
            
            // 检查是否点击在裁剪框内
            const rect = canvas.getBoundingClientRect();
            const dpr = panel.dpr || 1;
            const canvasX = (e.clientX - rect.left) * dpr;
            const canvasY = (e.clientY - rect.top) * dpr;
            
            // 转换为逻辑坐标
            const logicX = canvasX / dpr;
            const logicY = canvasY / dpr;
            
            // 检查是否在裁剪框内
            const cropBox = this.getCropBoxRect();
            if (this.isPointInCropBox(logicX, logicY, cropBox)) {
                panel.isDragging = true;
                panel.lastX = e.clientX;
                panel.lastY = e.clientY;
                area.style.cursor = 'grabbing';
                e.preventDefault();
                e.stopPropagation();
            }
        });
        
        const mouseMoveHandler = (e) => {
            if (!panel.isDragging) return;
            
            const dx = e.clientX - panel.lastX;
            const dy = e.clientY - panel.lastY;
            
            // 计算在图像坐标系中的偏移
            const dpr = panel.dpr || 1;
            const imageDx = dx / panel.imageScale;
            const imageDy = dy / panel.imageScale;
            
            // 更新裁剪框位置
            panel.cropBoxX += imageDx;
            panel.cropBoxY += imageDy;
            
            panel.lastX = e.clientX;
            panel.lastY = e.clientY;
            
            // 更新参数
            this.updateCropParameters();
            
            // 重绘Canvas
            this.drawCanvas();
            
            e.preventDefault();
        };
        
        const mouseUpHandler = (e) => {
            if (!panel.isDragging) return;
            
            panel.isDragging = false;
            area.style.cursor = 'move';
            e.preventDefault();
        };
        
        panel.eventHandlers.mouseMoveHandler = mouseMoveHandler;
        panel.eventHandlers.mouseUpHandler = mouseUpHandler;
        
        document.addEventListener('mousemove', mouseMoveHandler, { passive: false });
        document.addEventListener('mouseup', mouseUpHandler, { passive: false });
        
        // 滚轮缩放 - 缩放裁剪框
        const handleWheel = (e) => {
            const rect = canvas.getBoundingClientRect();
            const isInCanvas = e.clientX >= rect.left && e.clientX <= rect.right && 
                              e.clientY >= rect.top && e.clientY <= rect.bottom;
            
            if (!isInCanvas) return;
            
            e.preventDefault();
            
            const factor = e.deltaY > 0 ? 0.9 : 1.1;
            const currentScale = panel.cropBoxScale || 1.0;
            const newScale = Math.max(0.1, Math.min(5.0, currentScale * factor));
            
            if (newScale !== currentScale) {
                panel.cropBoxScale = newScale;
                this.updateCropParameters();
                this.drawCanvas();
            }
        };
        
        canvas.addEventListener('wheel', handleWheel, { passive: false });
        area.addEventListener('wheel', handleWheel, { passive: false });
        
        // 双击重置
        canvas.addEventListener('dblclick', (e) => {
            panel.cropBoxX = 0;
            panel.cropBoxY = 0;
            panel.cropBoxScale = 1.0;
            
            this.updateParameter('crop_x', 0);
            this.updateParameter('crop_y', 0);
            this.updateParameter('crop_scale', 1.0);
            
            this.drawCanvas();
            e.preventDefault();
            e.stopPropagation();
        });
        
        canvas.setAttribute('tabindex', '-1');
        area.setAttribute('tabindex', '-1');
        
        canvas.addEventListener('focus', (e) => {
            e.target.blur();
        });
        
        area.addEventListener('focus', (e) => {
            e.target.blur();
        });
    },
    
    getCropBoxRect() {
        const panel = this.panel;
        if (!panel || !panel.inputImage) return null;
        
        const aspectRatio = this.widgets?.find(w => w.name === "aspect_ratio")?.value || "1:1";
        const cropSize = this.widgets?.find(w => w.name === "crop_size")?.value || 512;
        
        // 计算裁剪框尺寸
        const { width, height } = this.calculateCropBoxSize(aspectRatio, cropSize, panel.cropBoxScale);
        
        // 计算裁剪框在图像坐标系中的位置（图像中心 + 偏移）
        const img = panel.inputImage;
        const centerX = img.width / 2;
        const centerY = img.height / 2;
        const x = centerX - width / 2 + panel.cropBoxX;
        const y = centerY - height / 2 + panel.cropBoxY;
        
        return { x, y, width, height };
    },
    
    isPointInCropBox(pointX, pointY, cropBox) {
        if (!cropBox) return false;
        
        // 转换为图像坐标系
        const panel = this.panel;
        const canvasWidth = panel.canvas.width / (panel.dpr || 1);
        const canvasHeight = panel.canvas.height / (panel.dpr || 1);
        
        // 计算图像在画布上的位置和尺寸
        const img = panel.inputImage;
        const baseScale = Math.min(canvasWidth / img.width, canvasHeight / img.height) * 0.9;
        const imgW = img.width * baseScale;
        const imgH = img.height * baseScale;
        const imgX = (canvasWidth - imgW) / 2;
        const imgY = (canvasHeight - imgH) / 2;
        
        // 将画布坐标转换为图像坐标
        const imageX = (pointX - imgX) / baseScale;
        const imageY = (pointY - imgY) / baseScale;
        
        // 检查是否在裁剪框内，允许在边框附近一定像素范围内也视为命中（提高可点中性）
        const hitMarginPx = 6; // 允许的像素容差（画布逻辑像素）
        const hitMarginImage = hitMarginPx / baseScale; // 转换为图像坐标系的容差

        return imageX >= (cropBox.x - hitMarginImage) && imageX <= (cropBox.x + cropBox.width + hitMarginImage) &&
               imageY >= (cropBox.y - hitMarginImage) && imageY <= (cropBox.y + cropBox.height + hitMarginImage);
    },
    
    calculateCropBoxSize(aspectRatio, cropSize, scale) {
        const ratios = {
            "1:1": [1.0, 1.0],
            "3:4": [3.0, 4.0],
            "4:3": [4.0, 3.0],
            "16:9": [16.0, 9.0],
            "9:16": [9.0, 16.0],
            "21:9": [21.0, 9.0],
            "9:21": [9.0, 21.0],
            "自定义": [1.0, 1.0]
        };
        
        let width, height;
        
        if (aspectRatio === "自定义") {
            width = cropSize * scale;
            height = cropSize * scale;
        } else {
            const [ratioW, ratioH] = ratios[aspectRatio] || [1.0, 1.0];
            const ratio = ratioW / ratioH;
            
            if (ratio >= 1.0) {
                width = cropSize * scale;
                height = cropSize * scale / ratio;
            } else {
                width = cropSize * scale * ratio;
                height = cropSize * scale;
            }
        }
        
        return { width, height };
    },
    
    updateCropBoxSize() {
        const panel = this.panel;
        if (!panel) return;
        
        // 当比例或尺寸改变时，重置裁剪框位置和缩放
        panel.cropBoxX = 0;
        panel.cropBoxY = 0;
        panel.cropBoxScale = 1.0;
        
        this.updateParameter('crop_x', 0);
        this.updateParameter('crop_y', 0);
        this.updateParameter('crop_scale', 1.0);
    },
    
    updateCropParameters() {
        const panel = this.panel;
        if (!panel) return;
        
        // 更新参数
        this.updateParameter('crop_x', Math.round(panel.cropBoxX));
        this.updateParameter('crop_y', Math.round(panel.cropBoxY));
        this.updateParameter('crop_scale', Math.round(panel.cropBoxScale * 100) / 100);
    },
    
    loadInputImage() {
        const imageInput = this.inputs?.find(input => input.name === "image");
        if (!imageInput || !imageInput.link) {
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
        
        this.sourceImageNode = sourceNode;
        
        const imageSrc = this.findImageSource(sourceNode);
        if (imageSrc) {
            this.loadImage(imageSrc);
        } else {
            this.drawPlaceholder();
        }
    },
    
    findImageSource(node, visited = new Set(), isDirectConnection = true) {
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
        
        if (node.properties && node.properties.image) {
            return node.properties.image;
        }
        
        if (node.inputs) {
            for (const input of node.inputs) {
                if (input.link && (input.type === "IMAGE" || input.name === "image" || input.name.toLowerCase().includes("image"))) {
                    const link = app.graph.links[input.link];
                    if (link) {
                        const upstreamNode = app.graph.getNodeById(link.origin_id);
                        if (upstreamNode) {
                            const result = this.findImageSource(upstreamNode, visited, false);
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
        
        ctx.fillStyle = '#888';
        ctx.font = '16px Arial';
        ctx.textAlign = 'center';
        ctx.fillText('🖼️', canvas.width/2, canvas.height/2 - 20);
        ctx.font = '14px Arial';
        ctx.fillText('等待图像输入...', canvas.width/2, canvas.height/2 + 10);
    },
    
    drawCanvas() {
        const panel = this.panel;
        if (!panel || !panel.inputImage) return;
        
        const ctx = panel.ctx;
        const canvas = panel.canvas;
        const img = panel.inputImage;
        const dpr = panel.dpr || 1;
        
        ctx.save();
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        
        const canvasWidth = canvas.width / dpr;
        const canvasHeight = canvas.height / dpr;
        
        ctx.fillStyle = '#1a1a1a';
        ctx.fillRect(0, 0, canvasWidth, canvasHeight);
        
        // 计算图像显示尺寸（固定居中显示，不移动）
        const baseScale = Math.min(canvasWidth / img.width, canvasHeight / img.height) * 0.9;
        const imgW = img.width * baseScale;
        const imgH = img.height * baseScale;
        const imgX = (canvasWidth - imgW) / 2;
        const imgY = (canvasHeight - imgH) / 2;
        
        // 保存图像显示信息
        panel.imageScale = baseScale;
        panel.imageX = imgX;
        panel.imageY = imgY;
        
        // 绘制图像（固定位置）
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(img, imgX, imgY, imgW, imgH);
        
        // 绘制裁剪框（可移动和缩放）
        this.drawCropBox(ctx, img, imgX, imgY, baseScale);
        
        ctx.restore();
        
        // 更新信息显示
        this.updateInfo();
    },
    
    drawCropBox(ctx, img, imgX, imgY, imageScale) {
        const panel = this.panel;
        if (!panel) return;
        
        const aspectRatio = this.widgets?.find(w => w.name === "aspect_ratio")?.value || "1:1";
        const cropSize = this.widgets?.find(w => w.name === "crop_size")?.value || 512;
        
        // 计算裁剪框在图像坐标系中的尺寸
        const { width, height } = this.calculateCropBoxSize(aspectRatio, cropSize, panel.cropBoxScale);
        
        // 计算裁剪框在图像坐标系中的位置（图像中心 + 偏移）
        const centerX = img.width / 2;
        const centerY = img.height / 2;
        const cropBoxX = centerX - width / 2 + panel.cropBoxX;
        const cropBoxY = centerY - height / 2 + panel.cropBoxY;
        
        // 转换为画布坐标
        const x = imgX + cropBoxX * imageScale;
        const y = imgY + cropBoxY * imageScale;
        const w = width * imageScale;
        const h = height * imageScale;
        
        // 仅绘制裁剪框线框（不绘制遮罩、角点或中心十字）
        ctx.strokeStyle = '#ff4444';
        ctx.lineWidth = 3;
        ctx.setLineDash([]); // 实线
        ctx.strokeRect(x, y, w, h);
    },
    
    updateInfo() {
        const panel = this.panel;
        if (!panel) return;
        
        const posSpan = panel.controlPanel.querySelector('#cropPos');
        const zoomSpan = panel.controlPanel.querySelector('#cropZoom');
        const sizeSpan = panel.controlPanel.querySelector('#cropSize');
        const ratioSpan = panel.controlPanel.querySelector('#cropRatio');
        
        if (posSpan) {
            const x = Math.round(panel.cropBoxX || 0);
            const y = Math.round(panel.cropBoxY || 0);
            posSpan.textContent = `${x}, ${y}`;
        }
        
        if (zoomSpan) {
            const s = panel.cropBoxScale || 1.0;
            zoomSpan.textContent = `${Math.round(s * 100)}%`;
        }
        
        if (sizeSpan && panel.inputImage) {
            const aspectRatio = this.widgets?.find(w => w.name === "aspect_ratio")?.value || "1:1";
            const cropSize = this.widgets?.find(w => w.name === "crop_size")?.value || 512;
            const { width, height } = this.calculateCropBoxSize(aspectRatio, cropSize, panel.cropBoxScale);
            sizeSpan.textContent = `${Math.round(width)}×${Math.round(height)}`;
        }
        
        if (ratioSpan) {
            const ratio = this.widgets?.find(w => w.name === "aspect_ratio")?.value || "1:1";
            ratioSpan.textContent = ratio;
        }
    },
    
    updateParameter(name, value) {
        const widget = this.widgets?.find(w => w.name === name);
        if (widget && widget.value !== value) {
            widget.value = value;
            
            if (this.onInputsChange) {
                this.onInputsChange();
            }
            
            if (this.updateInfo) {
                this.updateInfo();
            }
            
            if (app.graph) {
                app.graph.setDirtyCanvas(true, false);
            }
        }
    }
});

