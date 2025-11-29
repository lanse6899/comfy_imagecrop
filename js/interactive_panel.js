// ComfyUI 交互式图像剪裁面板
import { app } from "../../scripts/app.js";

app.registerExtension({
    name: "InteractiveCropPanel",
    
    async beforeRegisterNodeDef(nodeType, nodeData, app) {
        if (nodeData.name === "InteractiveCropWithPanel") {
            
            const onNodeCreated = nodeType.prototype.onNodeCreated;
            nodeType.prototype.onNodeCreated = function () {
                const r = onNodeCreated ? onNodeCreated.apply(this, arguments) : undefined;
                
                // 添加交互面板
                this.addInteractivePanel();
                
                // 设置节点最小尺寸，确保面板完全显示
                this.setSize([400, this.computeSize()[1]]);
                
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
            height: 280px;
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
            justify-content: space-between;
            flex-wrap: wrap;
            gap: 5px;
        `;
        
        controlPanel.innerHTML = `
            <div style="flex: 1; min-width: 80px;">📍 <span id="pos">0, 0</span></div>
            <div style="flex: 1; min-width: 70px;">🔍 <span id="zoom">100%</span></div>
            <div style="flex: 1; min-width: 80px;">📐 <span id="size">512×512</span></div>
            <div style="flex: 1; min-width: 80px;">🔄 <span id="rotation">0°</span></div>
            <div style="display: flex; gap: 5px;">
                <button id="rotateLeft" style="padding: 2px 8px; cursor: pointer; background: #555; border: 1px solid #777; border-radius: 3px; color: #fff;">↺ -90°</button>
                <button id="rotateRight" style="padding: 2px 8px; cursor: pointer; background: #555; border: 1px solid #777; border-radius: 3px; color: #fff;">↻ +90°</button>
            </div>
        `;
        
        canvasArea.appendChild(canvas);
        container.appendChild(canvasArea);
        container.appendChild(controlPanel);
        
        // 添加到节点 - 动态计算尺寸
        const widget = this.addDOMWidget("panel", "div", container);
        widget.computeSize = () => {
            const nodeWidth = this.size ? this.size[0] : 400;
            return [nodeWidth, 280];
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
            // 保存事件处理器引用，用于清理
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
                this.updateCanvasSize();
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
        
        // 获取canvasArea的实际显示尺寸
        const rect = panel.canvasArea.getBoundingClientRect();
        const displayWidth = Math.max(200, Math.floor(rect.width));
        const displayHeight = Math.max(150, Math.floor(rect.height));
        
        // 使用设备像素比提高清晰度（限制最大为2，避免过大）
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        const width = displayWidth * dpr;
        const height = displayHeight * dpr;
        
        // 更新Canvas的实际分辨率
        if (panel.canvas.width !== width || panel.canvas.height !== height) {
            panel.canvas.width = width;
            panel.canvas.height = height;
            
            // 不设置CSS尺寸，让它自动填充
            // panel.canvas.style.width = displayWidth + 'px';
            // panel.canvas.style.height = displayHeight + 'px';
            
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
            panel.isDragging = true;
            panel.lastX = e.clientX;
            panel.lastY = e.clientY;
            area.style.cursor = 'grabbing';
            e.preventDefault();
        });
        
        const mouseMoveHandler = (e) => {
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
            // 只阻止默认行为，不阻止事件传播
            e.preventDefault();
        };
        
        // 保存事件处理器引用
        panel.eventHandlers.mouseMoveHandler = mouseMoveHandler;
        panel.eventHandlers.mouseUpHandler = mouseUpHandler;
        
        document.addEventListener('mousemove', mouseMoveHandler);
        
        const mouseUpHandler = () => {
            if (panel.isDragging) {
                panel.isDragging = false;
                area.style.cursor = 'grab';
            }
        };
        
        document.addEventListener('mouseup', mouseUpHandler);
        
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
        canvas.addEventListener('dblclick', () => {
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
        }
    }
});
