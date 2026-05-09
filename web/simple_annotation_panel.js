import { app } from "../../scripts/app.js";

/**
 * ComfyUI Extension for Simple Annotation Node
 * Provides an embedded annotation widget
 */
console.log('[SimpleAnnotation] Extension loading...');

app.registerExtension({
    name: "comfyui.simple_annotation",

    async beforeRegisterNodeDef(nodeType, nodeData, app) {
        if (nodeData.name === "SimpleAnnotationNode") {
            console.log('[SimpleAnnotation] SimpleAnnotationNode found, setting up...');
            const onNodeCreated = nodeType.prototype.onNodeCreated;

            nodeType.prototype.onNodeCreated = function () {
                const r = onNodeCreated ? onNodeCreated.apply(this, arguments) : undefined;
                const node = this;

                // Create iframe for annotation viewer
                const iframe = document.createElement("iframe");
                iframe.style.width = "100%";
                iframe.style.height = "100%";
                iframe.style.border = "none";
                iframe.style.backgroundColor = "#1a1a2e";
                iframe.style.borderRadius = "8px";
                iframe.style.display = "block";

                // Load Simple Annotation HTML from the web directory
                const extensionPath = import.meta.url.replace(/[^/\\]*$/, '');
                iframe.src = extensionPath + "simple_annotation.html";

                // Add widget
                let widget = null;
                try {
                    if (typeof this.addDOMWidget === 'function') {
                        widget = this.addDOMWidget("simple_annotation_viewer", "SIMPLE_ANNOTATION_VIEW", iframe, {
                            getValue() { return ""; },
                            setValue(v) { }
                        });
                    } else if (typeof this.addWidget === 'function') {
                        try {
                            widget = this.addWidget("simple_annotation_viewer", iframe, {
                                getValue() { return ""; },
                                setValue(v) { },
                                computeSize(width) { const w = width || 400; return [w, 600]; }
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
                        containerDiv.className = 'comfy-simple-annotation-fallback';
                        containerDiv.appendChild(iframe);

                        const possibleParents = [this.dom, this.element, this.el, this.nodeEl, this.container, node?.dom, node?.element];
                        let appended = false;
                        for (const p of possibleParents) {
                            if (p && typeof p.appendChild === 'function') {
                                try { p.appendChild(containerDiv); appended = true; break; } catch (e) { }
                            } else if (p && p.nodeType === 1 && typeof p.appendChild === 'function') {
                                try { p.appendChild(containerDiv); appended = true; break; } catch (e) { }
                            }
                        }

                        if (!appended) {
                            try { document.body.appendChild(containerDiv); } catch (e) { }
                        }

                        widget = {
                            computeSize(width) { const w = width || 400; return [w, 600]; },
                            element: containerDiv
                        };
                    }
                } catch (err) {
                    console.error('[SimpleAnnotation] Failed to add DOM widget', err);
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
                } catch (err) { }

                this._annotationIframe = iframe;
                this._annotationReady = false;
                this._imageLoadedOnce = false;

                // Add hidden widget for annotation data
                let annotationDataWidget = null;
                try {
                    annotationDataWidget = this.addWidget("annotation_data", "annotation_data", "", {
                        type: "hidden"
                    });
                    console.log('[SimpleAnnotation] Created annotationDataWidget');
                } catch (e) {
                    console.log('[SimpleAnnotation] Failed to create widget:', e);
                }

                // Message handler for communication with iframe
                const onMessage = (event) => {
                    if (event.source !== iframe.contentWindow) return;
                    const data = event.data;

                    if (data.type === 'ANNOTATION_READY') {
                        console.log('[SimpleAnnotation] iframe ready');
                        node._annotationReady = true;
                        node._imageLoadedOnce = false;

                        // Try to load input image after iframe is ready
                        setTimeout(() => node.loadAnnotationInputImage(), 100);

                    } else if (data.type === 'ANNOTATION_IMAGE_LOADED') {
                        console.log('[SimpleAnnotation] Image loaded in iframe');
                        node._imageLoadedOnce = true;

                    } else if (data.type === 'REFRESH_IMAGE') {
                        // 前端请求刷新图像
                        console.log('[SimpleAnnotation] Refresh image requested');
                        node._imageLoadedOnce = false;
                        setTimeout(() => node.loadAnnotationInputImage(), 100);

                    } else if (data.type === 'ANNOTATION_DATA_CHANGED') {
                        // Update widget with annotation data
                        console.log('[SimpleAnnotation] Data changed');
                        const annotationData = JSON.stringify({
                            markers: data.markers,
                            promptText: data.promptText
                        });
                        if (annotationDataWidget) {
                            annotationDataWidget.value = annotationData;
                        }

                        // Mark node as modified to trigger re-execution
                        if (app.graph) {
                            app.graph.setDirtyCanvas(true);
                        }
                    } else if (data.type === 'EXPORT_DATA') {
                        console.log('[SimpleAnnotation] Export data received');
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

                // Listen for node added to graph
                const onAddedToGraph = nodeType.prototype.onAddedToGraph;
                nodeType.prototype.onAddedToGraph = function(graph) {
                    const r = onAddedToGraph ? onAddedToGraph.apply(this, arguments) : undefined;

                    setTimeout(() => {
                        if (this.loadAnnotationInputImage) {
                            this.loadAnnotationInputImage();
                        }
                        if (this.setDirtyCanvas) {
                            this.setDirtyCanvas(true, true);
                        }
                    }, 200);

                    return r;
                };

                // Listen for node executed
                const onExecuted = nodeType.prototype.onExecuted;
                nodeType.prototype.onExecuted = function(message) {
                    console.log('[SimpleAnnotation] onExecuted called');
                    const r = onExecuted ? onExecuted.apply(this, arguments) : undefined;

                    // When upstream node executes, reload the image
                    this._imageLoadedOnce = false;
                    setTimeout(() => this.loadAnnotationInputImage(), 100);

                    return r;
                };

                // Listen for connection changes
                const onConnectionsChange = nodeType.prototype.onConnectionsChange;
                nodeType.prototype.onConnectionsChange = function(type, index, connected, link_info) {
                    const r = onConnectionsChange ? onConnectionsChange.apply(this, arguments) : undefined;

                    if (type === 1 && this.loadAnnotationInputImage) {
                        // Reset and reload when image is connected
                        this._imageLoadedOnce = false;
                        setTimeout(() => this.loadAnnotationInputImage(), 200);

                        // If new connection, listen to source node execution
                        if (connected && link_info) {
                            const sourceNode = app.graph.getNodeById(link_info.origin_id);
                            if (sourceNode) {
                                console.log('[SimpleAnnotation] Source node connected:', sourceNode.type);

                                const originalOnExecuted = sourceNode.onExecuted;
                                sourceNode.onExecuted = function(msg) {
                                    const result = originalOnExecuted ? originalOnExecuted.apply(this, arguments) : undefined;
                                    console.log('[SimpleAnnotation] Source node executed, reloading image...');
                                    if (node.loadAnnotationInputImage) {
                                        node._imageLoadedOnce = false;
                                        setTimeout(() => node.loadAnnotationInputImage(), 100);
                                    }
                                    return result;
                                };
                            }
                        }
                    }
                    return r;
                };

                // ==================== loadAnnotationInputImage 实现 ====================
                nodeType.prototype.loadAnnotationInputImage = function() {
                    console.log('[SimpleAnnotation] loadAnnotationInputImage called');

                    if (!this._annotationIframe || !this._annotationReady) {
                        console.log('[SimpleAnnotation] iframe not ready, deferring image load');
                        return;
                    }

                    // Find input image from node inputs
                    const imageInput = this.inputs?.find(input => input.name === "image");
                    if (!imageInput || !imageInput.link) {
                        console.log('[SimpleAnnotation] No input image connected');
                        return;
                    }

                    const link = app.graph.links[imageInput.link];
                    if (!link) {
                        console.log('[SimpleAnnotation] No link found');
                        return;
                    }

                    const sourceNode = app.graph.getNodeById(link.origin_id);
                    if (!sourceNode) {
                        console.log('[SimpleAnnotation] No source node found');
                        return;
                    }

                    // Save source node reference
                    this.sourceImageNode = sourceNode;

                    // Find image source
                    const imageSrc = this.findAnnotationImageSource(sourceNode);
                    if (imageSrc) {
                        console.log('[SimpleAnnotation] Found image source:', imageSrc);
                        this.loadAnnotationImage(imageSrc);
                    } else {
                        console.log('[SimpleAnnotation] No image source found');
                    }
                };

                // ==================== findAnnotationImageSource 实现 ====================
                nodeType.prototype.findAnnotationImageSource = function(node, visited = new Set(), depth = 0) {
                    if (!node || visited.has(node.id)) {
                        return null;
                    }
                    visited.add(node.id);

                    console.log(`[SimpleAnnotation] Checking node: ${node.type || node.title} (ID: ${node.id}), Depth: ${depth}`);

                    // Priority 1: node.images - processed images from execution
                    if (node.images && node.images.length > 0) {
                        const imageInfo = node.images[0];
                        const imageUrl = `/view?filename=${imageInfo.filename}&subfolder=${imageInfo.subfolder || ''}&type=${imageInfo.type || 'output'}`;
                        console.log(`[SimpleAnnotation] Found processed image from node: ${node.type || node.title}`);
                        return imageUrl;
                    }

                    // Priority 2: node.imgs - display images (original images)
                    if (node.imgs && node.imgs.length > 0) {
                        const imgElement = node.imgs[0];
                        if (imgElement && imgElement.src && imgElement.complete) {
                            console.log(`[SimpleAnnotation] Found image from node imgs: ${node.type || node.title}`);
                            return imgElement.src;
                        }
                        if (imgElement && typeof imgElement === 'string' && imgElement.startsWith('/')) {
                            console.log(`[SimpleAnnotation] Found image path from node imgs: ${node.type || node.title}`);
                            return imgElement;
                        }
                    }

                    // Priority 3: node.widgets - image widgets (LoadImage nodes)
                    if (node.widgets) {
                        for (const widget of node.widgets) {
                            if (widget.type === 'image' && widget.value) {
                                console.log(`[SimpleAnnotation] Found image from widget: ${node.type || node.title}`);
                                return widget.value;
                            }
                            if (widget.name === 'image' && widget.value && typeof widget.value === 'string') {
                                if (widget.value.match(/\.(png|jpg|jpeg|webp|bmp)$/i)) {
                                    console.log(`[SimpleAnnotation] Found image path from widget: ${node.type || node.title}`);
                                    return `/view?filename=${widget.value}&type=input`;
                                }
                            }
                        }
                    }

                    // Priority 4: node.properties.image
                    if (node.properties && node.properties.image) {
                        console.log(`[SimpleAnnotation] Found image from properties: ${node.type || node.title}`);
                        return node.properties.image;
                    }

                    // Priority 5: Search upstream nodes
                    console.log(`[SimpleAnnotation] No image in current node, searching upstream...`);
                    if (node.inputs) {
                        for (const input of node.inputs) {
                            if (input.link && (input.type === "IMAGE" || input.name === "image" || input.name.toLowerCase().includes("image"))) {
                                const link = app.graph.links[input.link];
                                if (link) {
                                    const upstreamNode = app.graph.getNodeById(link.origin_id);
                                    if (upstreamNode) {
                                        console.log(`[SimpleAnnotation] Searching upstream: ${upstreamNode.type || upstreamNode.title}`);
                                        const result = this.findAnnotationImageSource(upstreamNode, visited, depth + 1);
                                        if (result) {
                                            return result;
                                        }
                                    }
                                }
                            }
                        }
                    }

                    console.log(`[SimpleAnnotation] No image found in node: ${node.type || node.title}`);
                    return null;
                };

                // ==================== loadAnnotationImage 实现 ====================
                nodeType.prototype.loadAnnotationImage = function(src) {
                    console.log('[SimpleAnnotation] loadAnnotationImage called with:', src);

                    if (!this._annotationIframe || !this._annotationReady) {
                        console.log('[SimpleAnnotation] iframe not ready, deferring image load');
                        return;
                    }

                    // Send image to iframe
                    this._annotationIframe.contentWindow.postMessage({
                        type: "LOAD_IMAGE",
                        imageUrl: src
                    }, "*");
                };

                // Periodic check for image loading (only on first load)
                this._imageLoadedOnce = false;
                this.imageCheckInterval = setInterval(() => {
                    if (this._annotationReady && this.loadAnnotationInputImage && !this._imageLoadedOnce) {
                        const imageInput = this.inputs?.find(input => input.name === "image");
                        if (imageInput && imageInput.link) {
                            this.loadAnnotationInputImage();
                        }
                    }
                }, 500);

                // Cleanup on node removal
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
                this.setSize([700, 600]);

                return r;
            };
        }
    }
});

console.log('[SimpleAnnotation] Extension registered');
