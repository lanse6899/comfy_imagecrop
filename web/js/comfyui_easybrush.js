import { app } from "../../../../scripts/app.js";

/**
 * ComfyUI Extension for EasyBrush Node
 * Provides an embedded EasyBrush painting widget
 */
console.log('[EasyBrush] Extension loading...');

app.registerExtension({
    name: "comfyui.easybrush",

    async beforeRegisterNodeDef(nodeType, nodeData, app) {
        if (nodeData.name === "EasyBrushNode") {
            console.log('[EasyBrush] EasyBrushNode found, setting up...');
            const onNodeCreated = nodeType.prototype.onNodeCreated;

            nodeType.prototype.onNodeCreated = function () {
                console.log('[EasyBrush] onNodeCreated called');
                const r = onNodeCreated ? onNodeCreated.apply(this, arguments) : undefined;
                const node = this;

                // Create iframe for EasyBrush viewer
                const iframe = document.createElement("iframe");
                iframe.style.width = "100%";
                iframe.style.height = "100%";
                iframe.style.border = "none";
                iframe.style.backgroundColor = "#1e1e1e";
                iframe.style.borderRadius = "8px";
                iframe.style.display = "block";

                // Load EasyBrush HTML from the web directory
                const extensionPath = import.meta.url.replace(/[^/\\]*$/, '');
                iframe.src = extensionPath + "../easybrush.html";

                // Add widget
                let widget = null;
                try {
                    if (typeof this.addDOMWidget === 'function') {
                        widget = this.addDOMWidget("easybrush_viewer", "EASYBRUSH_VIEW", iframe, {
                            getValue() { return ""; },
                            setValue(v) { }
                        });
                    } else if (typeof this.addWidget === 'function') {
                        try {
                            widget = this.addWidget("easybrush_viewer", iframe, {
                                getValue() { return ""; },
                                setValue(v) { },
                                computeSize(width) { const w = width || 400; return [w, 500]; }
                            });
                        } catch (e) {
                            widget = null;
                        }
                    }

                    if (!widget) {
                        const containerDiv = document.createElement('div');
                        containerDiv.style.width = '100%';
                        containerDiv.style.height = '100%';
                        containerDiv.style.display = 'block';
                        containerDiv.className = 'comfy-easybrush-fallback';
                        containerDiv.appendChild(iframe);

                        const possibleParents = [this.dom, this.element, this.el, this.nodeEl, this.container, node?.dom, node?.element];
                        let appended = false;
                        for (const p of possibleParents) {
                            if (p && typeof p.appendChild === 'function') {
                                try { p.appendChild(containerDiv); appended = true; break; } catch (e) { /* ignore */ }
                            } else if (p && p.nodeType === 1 && typeof p.appendChild === 'function') {
                                try { p.appendChild(containerDiv); appended = true; break; } catch (e) { /* ignore */ }
                            }
                        }

                        if (!appended) {
                            try { document.body.appendChild(containerDiv); } catch (e) { /* ignore */ }
                        }

                        widget = {
                            computeSize(width) { const w = width || 400; return [w, 500]; },
                            element: containerDiv
                        };
                    }
                } catch (err) {
                    console.error('EasyBrush: failed to add DOM widget', err);
                }

                // Ensure iframe receives pointer events
                try {
                    iframe.style.pointerEvents = 'auto';
                    iframe.style.zIndex = '1';
                    iframe.setAttribute('tabindex', '0');

                    if (widget && widget.element) {
                        widget.element.style.pointerEvents = 'auto';
                        widget.element.tabIndex = 0;
                    }
                } catch (err) {
                    // ignore
                }

                this._easybrushIframe = iframe;
                this._easybrushReady = false;
                this._imageLoadedOnce = false;
                this._userHasDrawn = false;

                // 添加隐藏 widget 存储绘制数据和掩码数据
                let drawnDataWidget = null;
                let doodleMaskWidget = null;
                try {
                    drawnDataWidget = this.addWidget("drawn_image_data", "drawn_image_data", "", {
                        type: "hidden"
                    });
                    doodleMaskWidget = this.addWidget("doodle_mask_data", "doodle_mask_data", "", {
                        type: "hidden"
                    });
                    console.log('[EasyBrush] Created drawnDataWidget and doodleMaskWidget');
                } catch (e) {
                    console.log('[EasyBrush] Failed to create widgets:', e);
                }

                // 同步绘制数据到 widget
                const syncDrawnDataToWidget = () => {
                    if (!drawnDataWidget) return;
                    // 向 iframe 请求当前合成图像
                    if (iframe.contentWindow) {
                        iframe.contentWindow.postMessage({ type: "GET_COMPOSED_IMAGE" }, "*");
                    }
                };

                // Message handler for communication with iframe
                const onMessage = (event) => {
                    if (event.source !== iframe.contentWindow) return;
                    const data = event.data;

                    if (data.type === 'EASYBRUSH_READY') {
                        console.log('[EasyBrush] iframe ready');
                        this._easybrushReady = true;
                        this._imageLoadedOnce = false;
                        // 注意：_userHasDrawn 不在这里重置，保持用户绘制状态
                        
                        // Send initial brush settings
                        const brushSizeWidget = node.widgets.find(w => w.name === "brush_size");
                        const brushHardnessWidget = node.widgets.find(w => w.name === "brush_hardness");
                        const brushOpacityWidget = node.widgets.find(w => w.name === "brush_opacity");

                        iframe.contentWindow.postMessage({
                            type: "INIT",
                            brushSize: brushSizeWidget?.value || 20,
                            brushHardness: brushHardnessWidget?.value || 100,
                            brushOpacity: brushOpacityWidget?.value || 100
                        }, "*");
                        
                        // Try to load input image after iframe is ready
                        setTimeout(() => this.loadInputImage(), 100);
                        
                    } else if (data.type === 'BRUSH_UPDATE') {
                        // Update node widgets from EasyBrush view
                        const brushSizeWidget = node.widgets.find(w => w.name === "brush_size");
                        const brushHardnessWidget = node.widgets.find(w => w.name === "brush_hardness");
                        const brushOpacityWidget = node.widgets.find(w => w.name === "brush_opacity");

                        if (brushSizeWidget) brushSizeWidget.value = data.brushSize;
                        if (brushHardnessWidget) brushHardnessWidget.value = data.brushHardness;
                        if (brushOpacityWidget) brushOpacityWidget.value = data.brushOpacity;

                        app.graph.setDirtyCanvas(true, true);
                    } else if (data.type === 'IMAGE_LOADED') {
                        // 图像加载完成，标记为已加载
                        console.log('[EasyBrush] Image loaded in iframe');
                        this._imageLoadedOnce = true;
                    } else if (data.type === 'USER_DREW') {
                        // 用户开始绘制，标记为已有涂鸦
                        console.log('[EasyBrush] User started drawing');
                        this._userHasDrawn = true;
                        // 触发保存绘制数据到 widget
                        syncDrawnDataToWidget();
                    } else if (data.type === 'REFRESH_IMAGE') {
                        // 前端请求刷新图像
                        console.log('[EasyBrush] Refresh image requested');
                        this._imageLoadedOnce = false;
                        this.loadInputImage();
                    } else if (data.type === 'COMPOSED_IMAGE_DATA') {
                        // 接收来自 iframe 的合成图像数据，更新 widget
                        console.log('[EasyBrush] Received composed image data, length:', data.imageData?.length);
                        const imageData = data.imageData || "";
                        if (drawnDataWidget) {
                            drawnDataWidget.value = imageData;
                        }
                    } else if (data.type === 'DOODLE_MASK_DATA') {
                        // 接收来自 iframe 的纯涂鸦掩码数据
                        console.log('[EasyBrush] Received doodle mask data, length:', data.maskData?.length);
                        const maskData = data.maskData || "";
                        if (doodleMaskWidget) {
                            doodleMaskWidget.value = maskData;
                        }
                    }
                };
                window.addEventListener('message', onMessage);

                // Resize handling
                const notifyIframeResize = () => {
                    if (iframe.contentWindow) {
                        const rect = iframe.getBoundingClientRect();
                        iframe.contentWindow.postMessage({
                            type: 'RESIZE',
                            width: rect.width,
                            height: rect.height
                        }, '*');
                    }
                };

                let resizeTimeout = null;
                let lastSize = { width: 0, height: 0 };
                const resizeObserver = new ResizeObserver((entries) => {
                    const entry = entries[0];
                    const newWidth = entry.contentRect.width;
                    const newHeight = entry.contentRect.height;

                    if (Math.abs(newWidth - lastSize.width) < 1 && Math.abs(newHeight - lastSize.height) < 1) {
                        return;
                    }
                    lastSize = { width: newWidth, height: newHeight };

                    if (resizeTimeout) {
                        clearTimeout(resizeTimeout);
                    }
                    resizeTimeout = setTimeout(() => {
                        notifyIframeResize();
                    }, 50);
                });
                resizeObserver.observe(iframe);

                // Sync slider widgets to EasyBrush view
                const syncToEasyBrush = () => {
                    if (!this._easybrushReady || !iframe.contentWindow) return;

                    const brushSizeWidget = node.widgets.find(w => w.name === "brush_size");
                    const brushHardnessWidget = node.widgets.find(w => w.name === "brush_hardness");
                    const brushOpacityWidget = node.widgets.find(w => w.name === "brush_opacity");

                    iframe.contentWindow.postMessage({
                        type: "SYNC_SETTINGS",
                        brushSize: brushSizeWidget?.value || 20,
                        brushHardness: brushHardnessWidget?.value || 100,
                        brushOpacity: brushOpacityWidget?.value || 100
                    }, "*");
                };

                const origCallback = this.onWidgetChanged;
                this.onWidgetChanged = function (name, value, old_value, widget) {
                    if (origCallback) {
                        origCallback.apply(this, arguments);
                    }
                    if (name === "brush_size" || name === "brush_hardness" || name === "brush_opacity") {
                        syncToEasyBrush();
                    }
                };

                // ==================== 参照 interactive_panel.js 的实现 ====================

                // 监听节点添加到图形
                const onAddedToGraph = nodeType.prototype.onAddedToGraph;
                nodeType.prototype.onAddedToGraph = function(graph) {
                    const r = onAddedToGraph ? onAddedToGraph.apply(this, arguments) : undefined;
                    
                    // 节点添加到图形后，尝试加载图像
                    setTimeout(() => {
                        if (this.loadInputImage) {
                            this.loadInputImage();
                        }
                        if (this.setDirtyCanvas) {
                            this.setDirtyCanvas(true, true);
                        }
                    }, 200);
                    
                    return r;
                };

                // 监听节点执行完成
                const onExecuted = nodeType.prototype.onExecuted;
                nodeType.prototype.onExecuted = function(message) {
                    console.log('[EasyBrush] onExecuted called! Message:', message);
                    const r = onExecuted ? onExecuted.apply(this, arguments) : undefined;

                    // 每次执行完成都尝试重新加载图像（用于响应输入图像的变化）
                    if (this.loadInputImage) {
                        // 重置加载状态，确保重新获取最新图像
                        this._imageLoadedOnce = false;
                        setTimeout(() => this.loadInputImage(), 100);
                    }

                    return r;
                };

                // 监听连接变化
                const onConnectionsChange = nodeType.prototype.onConnectionsChange;
                nodeType.prototype.onConnectionsChange = function(type, index, connected, link_info) {
                    const r = onConnectionsChange ? onConnectionsChange.apply(this, arguments) : undefined;
                    
                    // 连接变化时尝试加载图像（type=1 表示输入）
                    if (type === 1 && this.loadInputImage) {
                        // 重置图像加载状态，确保新连接的图像会被加载
                        this._imageLoadedOnce = false;
                        setTimeout(() => this.loadInputImage(), 100);
                        
                        // 如果是新建连接，监听源节点的执行完成事件
                        if (connected && link_info) {
                            const sourceNode = app.graph.getNodeById(link_info.origin_id);
                            if (sourceNode) {
                                console.log('[EasyBrush] Source node connected:', sourceNode.type);
                                
                                // 监听源节点的执行完成
                                const originalOnExecuted = sourceNode.onExecuted;
                                sourceNode.onExecuted = function(msg) {
                                    const result = originalOnExecuted ? originalOnExecuted.apply(this, arguments) : undefined;
                                    console.log('[EasyBrush] Source node executed, reloading image...');
                                    if (node.loadInputImage) {
                                        // 重置状态以确保重新加载
                                        node._imageLoadedOnce = false;
                                        setTimeout(() => node.loadInputImage(), 100);
                                    }
                                    return result;
                                };
                            }
                        }
                    }
                    
                    return r;
                };

                // ==================== loadInputImage 实现 ====================
                nodeType.prototype.loadInputImage = function() {
                    console.log('[EasyBrush] loadInputImage called');
                    
                    const imageInput = this.inputs?.find(input => input.name === "input_image");
                    if (!imageInput || !imageInput.link) {
                        console.log('[EasyBrush] No input image connected');
                        return;
                    }
                    
                    const link = app.graph.links[imageInput.link];
                    if (!link) {
                        console.log('[EasyBrush] No link found');
                        return;
                    }
                    
                    const sourceNode = app.graph.getNodeById(link.origin_id);
                    if (!sourceNode) {
                        console.log('[EasyBrush] No source node found');
                        return;
                    }
                    
                    // 保存源节点引用
                    this.sourceImageNode = sourceNode;
                    
                    // 尝试从当前节点和连接链中获取图像
                    const imageSrc = this.findImageSource(sourceNode);
                    if (imageSrc) {
                        console.log('[EasyBrush] Found image source:', imageSrc);
                        this.loadImage(imageSrc);
                    } else {
                        console.log('[EasyBrush] No image source found');
                    }
                };

                // ==================== findImageSource 实现 ====================
                nodeType.prototype.findImageSource = function(node, visited = new Set(), depth = 0) {
                    // 防止循环引用
                    if (!node || visited.has(node.id)) {
                        return null;
                    }
                    visited.add(node.id);

                    console.log(`[EasyBrush] Checking node: ${node.type || node.title} (ID: ${node.id}), Depth: ${depth}`);

                    // 优先级1: 从当前节点和连接链中获取图像
                    // images 属性包含节点执行后的最新输出图像
                    if (node.images && node.images.length > 0) {
                        const imageInfo = node.images[0];
                        const imageUrl = `/view?filename=${imageInfo.filename}&subfolder=${imageInfo.subfolder || ''}&type=${imageInfo.type || 'output'}`;
                        console.log(`[EasyBrush] Found processed image from node: ${node.type || node.title}, images count: ${node.images.length}`);
                        return imageUrl;
                    }

                    // 优先级2: 从节点的imgs属性获取（显示的图像/原始图像）
                    // 这个属性可能包含原始选择的图像
                    if (node.imgs && node.imgs.length > 0) {
                        const imgElement = node.imgs[0];
                        if (imgElement && imgElement.src && imgElement.complete) {
                            console.log(`[EasyBrush] Found image from node imgs: ${node.type || node.title}`);
                            return imgElement.src;
                        }
                        // 如果是相对路径，转换为完整 URL
                        if (imgElement && typeof imgElement === 'string' && imgElement.startsWith('/')) {
                            console.log(`[EasyBrush] Found image path from node imgs: ${node.type || node.title}`);
                            return imgElement;
                        }
                    }

                    // 优先级3: 从节点的widgets获取
                    if (node.widgets) {
                        for (const widget of node.widgets) {
                            if (widget.type === 'image' && widget.value) {
                                console.log(`[EasyBrush] Found image from widget: ${node.type || node.title}`);
                                return widget.value;
                            }
                            // LoadImage 节点使用 name 属性存储图像信息
                            if (widget.name === 'image' && widget.value && typeof widget.value === 'string') {
                                // 检查是否是图像文件路径
                                if (widget.value.match(/\.(png|jpg|jpeg|webp|bmp)$/i)) {
                                    console.log(`[EasyBrush] Found image path from widget: ${node.type || node.title}`);
                                    return `/view?filename=${widget.value}&type=input`;
                                }
                            }
                        }
                    }

                    // 优先级4: 检查节点是否有properties.image
                    if (node.properties && node.properties.image) {
                        console.log(`[EasyBrush] Found image from properties: ${node.type || node.title}`);
                        return node.properties.image;
                    }

                    // 优先级5: 递归查找上游节点
                    console.log(`[EasyBrush] No image in current node, searching upstream...`);
                    if (node.inputs) {
                        for (const input of node.inputs) {
                            // 查找图像类型的输入
                            if (input.link && (input.type === "IMAGE" || input.name === "image" || input.name.toLowerCase().includes("image"))) {
                                const link = app.graph.links[input.link];
                                if (link) {
                                    const upstreamNode = app.graph.getNodeById(link.origin_id);
                                    if (upstreamNode) {
                                        console.log(`[EasyBrush] Searching upstream: ${upstreamNode.type || upstreamNode.title}`);
                                        const result = this.findImageSource(upstreamNode, visited, depth + 1);
                                        if (result) {
                                            return result;
                                        }
                                    }
                                }
                            }
                        }
                    }

                    console.log(`[EasyBrush] No image found in node: ${node.type || node.title}`);
                    return null;
                };

                // ==================== loadImage 实现 ====================
                nodeType.prototype.loadImage = function(src) {
                    console.log('[EasyBrush] loadImage called with:', src);
                    
                    if (!this._easybrushIframe || !this._easybrushReady) {
                        console.log('[EasyBrush] iframe not ready, deferring image load');
                        return;
                    }
                    
                    // 通过 iframe 加载图像
                    this._easybrushIframe.contentWindow.postMessage({
                        type: "LOAD_IMAGE",
                        imageSrc: src
                    }, "*");
                };

                // 启动定时检查（确保图像加载，只在首次加载时使用）
                this._imageLoadedOnce = false;
                this.imageCheckInterval = setInterval(() => {
                    // 只有在还没有加载过图像时才尝试加载
                    if (this._easybrushReady && this.loadInputImage && !this._imageLoadedOnce) {
                        const imageInput = this.inputs?.find(input => input.name === "input_image");
                        if (imageInput && imageInput.link) {
                            this.loadInputImage();
                        }
                    }
                }, 500);

                // Clean up on node removal
                const originalOnRemoved = this.onRemoved;
                this.onRemoved = function () {
                    resizeObserver.disconnect();
                    window.removeEventListener('message', onMessage);
                    if (resizeTimeout) {
                        clearTimeout(resizeTimeout);
                    }
                    if (this.imageCheckInterval) {
                        clearInterval(this.imageCheckInterval);
                    }
                    if (originalOnRemoved) {
                        originalOnRemoved.apply(this, arguments);
                    }
                };

                // Set initial node size
                this.setSize([420, 550]);

                return r;
            };
        } else {
            console.log('[EasyBrush] Skipping non-EasyBrushNode:', nodeData.name);
        }
    }
});

console.log('[EasyBrush] Extension registered');