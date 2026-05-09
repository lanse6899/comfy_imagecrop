import { app } from "../../scripts/app.js";

app.registerExtension({
    name: "SlicePanel",
    
    async beforeRegisterNodeDef(nodeType, nodeData, app) {
        if (nodeData.name === "SliceCropWithPanel") {
            const onNodeCreated = nodeType.prototype.onNodeCreated;
            nodeType.prototype.onNodeCreated = function () {
                const r = onNodeCreated ? onNodeCreated.apply(this, arguments) : undefined;
                this.addSlicePanel();
                setTimeout(() => {
                    if (this.setDirtyCanvas) this.setDirtyCanvas(true, true);
                    if (this.graph && this.graph.setDirtyCanvas) this.graph.setDirtyCanvas(true, true);
                }, 100);
                return r;
            };

            const onAddedToGraph = nodeType.prototype.onAddedToGraph;
            nodeType.prototype.onAddedToGraph = function(graph) {
                const r = onAddedToGraph ? onAddedToGraph.apply(this, arguments) : undefined;
                setTimeout(() => {
                    if (this.setDirtyCanvas) this.setDirtyCanvas(true, true);
                }, 200);
                return r;
            };

            const onExecuted = nodeType.prototype.onExecuted;
            nodeType.prototype.onExecuted = function(message) {
                const r = onExecuted ? onExecuted.apply(this, arguments) : undefined;
                if (this.loadInputImage_slice) {
                    setTimeout(() => this.loadInputImage_slice(), 100);
                }
                return r;
            };

            const onRemoved = nodeType.prototype.onRemoved;
            nodeType.prototype.onRemoved = function() {
                const r = onRemoved ? onRemoved.apply(this, arguments) : undefined;
                if (this.panel && this.panel.resizeObserver) {
                    this.panel.resizeObserver.disconnect();
                    this.panel.resizeObserver = null;
                }
                if (this.panel && this.panel.eventHandlers) {
                    if (this.panel.eventHandlers.mouseMoveHandler) {
                        document.removeEventListener('mousemove', this.panel.eventHandlers.mouseMoveHandler);
                    }
                    if (this.panel.eventHandlers.mouseUpHandler) {
                        document.removeEventListener('mouseup', this.panel.eventHandlers.mouseUpHandler);
                    }
                }
                if (this.imageCheckInterval) {
                    clearInterval(this.imageCheckInterval);
                    this.imageCheckInterval = null;
                }
                return r;
            };
            
            // 当 widget 值变化时，重绘面板（使节点面板与参数同步）
            const onWidgetChanged = nodeType.prototype.onWidgetChanged;
            nodeType.prototype.onWidgetChanged = function(name, value, old_value, widget) {
                const r = onWidgetChanged ? onWidgetChanged.apply(this, arguments) : undefined;
                const redrawNames = ["split_mode", "pixel_width", "pixel_height", "count_x", "count_y", "preview_scale"];
                if (redrawNames.includes(name) && this.drawSliceCanvas) {
                    setTimeout(() => this.drawSliceCanvas(), 10);
                }
                return r;
            };
        }
    }
});

Object.assign(LGraphNode.prototype, {
    addSlicePanel() {
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
        canvas.style.cssText = `width: 100%; height: 100%; display: block;`;

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
            <div style="flex:1;min-width:120px">模式: <span id="mode">按像素切片</span></div>
            <div style="flex:1;min-width:120px">切片: <span id="count">0</span></div>
            <div style="flex:1;min-width:120px">缩放: <span id="zoom">100%</span></div>
        `;

        canvasArea.appendChild(canvas);
        container.appendChild(canvasArea);
        container.appendChild(controlPanel);

        const widget = this.addDOMWidget("panel", "div", container);
        const self = this;
        widget.computeSize = function() {
            const nodeWidth = self.size ? self.size[0] : 400;
            let panelHeight = 260;
            if (self.size && self.size[1]) {
                const nonPanelWidgets = (self.widgets || []).filter(w => w.name !== "panel");
                const estimatedOtherHeight = nonPanelWidgets.length * 35 + 50;
                const availableHeight = self.size[1] - estimatedOtherHeight;
                if (availableHeight > 200) panelHeight = Math.min(availableHeight, 600);
            }
            return [nodeWidth, panelHeight];
        };

        this.panel = {
            canvas: canvas,
            ctx: canvas.getContext('2d'),
            controlPanel: controlPanel,
            container: container,
            canvasArea: canvasArea,
            isDragging: false,
            lastX: 0,
            lastY: 0,
            imageOffsetX: 0,
            imageOffsetY: 0,
            viewScale: 1.0,
            inputImage: null,
            dpr: 1,
            eventHandlers: {}
        };

        this.bindSlicePanelEvents(canvasArea, canvas);
        this.updateCanvasSize_slice();
        setTimeout(() => this.loadInputImage_slice(), 500);
        this.imageCheckInterval = setInterval(() => this.loadInputImage_slice(), 600);
    },

    updateCanvasSize_slice() {
        const panel = this.panel;
        if (!panel || !panel.canvas || !panel.canvasArea) return;
        if (!panel.resizeObserver) {
            panel.resizeObserver = new ResizeObserver((entries) => {
                for (const entry of entries) {
                    const { width, height } = entry.contentRect;
                    this.updateCanvasDimensions_slice(Math.max(200, Math.floor(width)), Math.max(150, Math.floor(height)));
                }
            });
            panel.resizeObserver.observe(panel.canvasArea);
        }
        const rect = panel.canvasArea.getBoundingClientRect();
        const displayWidth = Math.max(200, Math.floor(rect.width));
        const displayHeight = Math.max(150, Math.floor(rect.height));
        this.updateCanvasDimensions_slice(displayWidth, displayHeight);
    },

    updateCanvasDimensions_slice(displayWidth, displayHeight) {
        const panel = this.panel;
        if (!panel || !panel.canvas) return;
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        const width = displayWidth * dpr;
        const height = displayHeight * dpr;
        if (panel.canvas.width !== width || panel.canvas.height !== height) {
            panel.canvas.width = width;
            panel.canvas.height = height;
            panel.dpr = dpr;
            if (panel.inputImage) this.drawSliceCanvas();
            else this.drawSlicePlaceholder();
        }
    },

    bindSlicePanelEvents(area, canvas) {
        const panel = this.panel;
        canvas.addEventListener('mousedown', (e) => {
            if (e.button !== 0) return;
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
            panel.imageOffsetX = (panel.imageOffsetX || 0) + dx;
            panel.imageOffsetY = (panel.imageOffsetY || 0) + dy;
            panel.lastX = e.clientX;
            panel.lastY = e.clientY;
            if (this.drawSliceCanvas) this.drawSliceCanvas();
            e.preventDefault();
        };

        const mouseUpHandler = (e) => {
            if (!panel.isDragging) return;
            panel.isDragging = false;
            area.style.cursor = 'grab';
            e.preventDefault();
        };

        panel.eventHandlers.mouseMoveHandler = mouseMoveHandler;
        panel.eventHandlers.mouseUpHandler = mouseUpHandler;
        document.addEventListener('mousemove', mouseMoveHandler, { passive: false });
        document.addEventListener('mouseup', mouseUpHandler, { passive: false });

            const handleWheel = (e) => {
            const rect = canvas.getBoundingClientRect();
            const isInCanvas = e.clientX >= rect.left && e.clientX <= rect.right &&
                               e.clientY >= rect.top && e.clientY <= rect.bottom;
            if (!isInCanvas) return;
            e.preventDefault();
            const factor = e.deltaY > 0 ? 0.9 : 1.1;
            const current = panel.viewScale || 1.0;
            const next = Math.max(0.1, Math.min(5.0, current * factor));
            if (next !== current) {
                panel.viewScale = next;
                    // 同步到节点参数以便外部可见并保存
                    try {
                        this.updateParameter && this.updateParameter('preview_scale', panel.viewScale);
                    } catch (e) {}
                    if (this.drawSliceCanvas) this.drawSliceCanvas();
            }
        };

        canvas.addEventListener('wheel', handleWheel, { passive: false });
        area.addEventListener('wheel', handleWheel, { passive: false });
    },

    loadInputImage_slice() {
        const imageInput = this.inputs?.find(input => input.name === "image");
        if (!imageInput || !imageInput.link) {
            if (this.panel && this.panel.inputImage) {
                this.panel.inputImage = null;
                this.panel.currentSrc = null;
            }
            this.drawSlicePlaceholder();
            return;
        }
        const link = app.graph.links[imageInput.link];
        if (!link) { this.drawSlicePlaceholder(); return; }
        const sourceNode = app.graph.getNodeById(link.origin_id);
        if (!sourceNode) { this.drawSlicePlaceholder(); return; }
        this.sourceImageNode = sourceNode;
        const imageSrc = this.findImageSource(sourceNode);
        if (imageSrc) this.loadImage_slice(imageSrc);
        else this.drawSlicePlaceholder();
    },

    loadImage_slice(src) {
        const panel = this.panel;
        if (!panel || panel.currentSrc === src) return;
        panel.currentSrc = src;
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => {
            panel.inputImage = img;
            if (this.drawSliceCanvas) this.drawSliceCanvas();
        };
        img.onerror = () => this.drawSlicePlaceholder();
        img.src = src;
    },

    drawSlicePlaceholder() {
        const panel = this.panel;
        if (!panel) return;
        const ctx = panel.ctx;
        const canvas = panel.canvas;
        ctx.fillStyle = '#2a2a2a';
        ctx.fillRect(0,0,canvas.width,canvas.height);
        ctx.strokeStyle = '#333';
        for (let x=0;x<=canvas.width;x+=20) {
            ctx.beginPath(); ctx.moveTo(x,0); ctx.lineTo(x,canvas.height); ctx.stroke();
        }
        for (let y=0;y<=canvas.height;y+=20) {
            ctx.beginPath(); ctx.moveTo(0,y); ctx.lineTo(canvas.width,y); ctx.stroke();
        }
        ctx.fillStyle = '#888';
        ctx.font = `${16 * (panel.dpr||1)}px Arial`;
        ctx.textAlign = 'center';
        ctx.fillText('等待图像输入...', canvas.width/2, canvas.height/2);
    },

    drawSliceCanvas() {
        const panel = this.panel;
        if (!panel || !panel.inputImage) { this.drawSlicePlaceholder(); return; }
        const ctx = panel.ctx;
        const canvas = panel.canvas;
        const dpr = panel.dpr || 1;
        ctx.save();
        ctx.setTransform(dpr,0,0,dpr,0,0);
        const canvasW = canvas.width / dpr;
        const canvasH = canvas.height / dpr;
        ctx.fillStyle = '#1a1a1a';
        ctx.fillRect(0,0,canvasW,canvasH);

        const img = panel.inputImage;
        // fit image into canvas with margin
        const baseScale = Math.min(canvasW / img.width, canvasH / img.height) * 0.9;
        const finalScale = baseScale * (panel.viewScale || 1.0);
        const w = img.width * finalScale;
        const h = img.height * finalScale;
        const x = (canvasW - w)/2 + (panel.imageOffsetX || 0);
        const y = (canvasH - h)/2 + (panel.imageOffsetY || 0);

        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(img, x, y, w, h);

        // determine grid from node widgets
        const modeWidget = this.widgets?.find(w => w.name === "split_mode");
        const mode = modeWidget ? modeWidget.value : "按像素切片";
        const pixelW = this.widgets?.find(w => w.name === "pixel_width")?.value || 500;
        const pixelH = this.widgets?.find(w => w.name === "pixel_height")?.value || 216;
        const countX = this.widgets?.find(w => w.name === "count_x")?.value || 5;
        const countY = this.widgets?.find(w => w.name === "count_y")?.value || 2;

        // compute grid in image coordinates (original image pixels), then map to canvas coords
        const grid = [];
        if (mode === "按像素切片") {
            const sliceW = Math.max(1, pixelW);
            const sliceH = Math.max(1, pixelH);
            let sy = 0;
            while (sy < img.height) {
                let sx = 0;
                const hPx = Math.min(sliceH, img.height - sy);
                while (sx < img.width) {
                    const wPx = Math.min(sliceW, img.width - sx);
                    grid.push({sx,sy,wPx,hPx});
                    sx += sliceW;
                }
                sy += sliceH;
            }
        } else {
            const cx = Math.max(1, countX);
            const cy = Math.max(1, countY);
            const baseWpx = Math.floor(img.width / cx);
            const baseHpx = Math.floor(img.height / cy);
            for (let iy=0; iy<cy; iy++) {
                const sy = iy * baseHpx;
                const hPx = (iy === cy-1) ? (img.height - sy) : baseHpx;
                for (let ix=0; ix<cx; ix++) {
                    const sx = ix * baseWpx;
                    const wPx = (ix === cx-1) ? (img.width - sx) : baseWpx;
                    grid.push({sx,sy,wPx,hPx});
                }
            }
        }

        // draw grid mapped to canvas
        ctx.lineWidth = Math.max(1, Math.min(canvasW, canvasH) / 400);
        ctx.strokeStyle = 'rgba(0,140,255,0.95)';
        ctx.fillStyle = 'rgba(0,140,255,0.95)';
        ctx.font = `${12}px Arial`;
        for (let i=0;i<grid.length;i++) {
            const g = grid[i];
            const gx = x + (g.sx / img.width) * w;
            const gy = y + (g.sy / img.height) * h;
            const gw = (g.wPx / img.width) * w;
            const gh = (g.hPx / img.height) * h;
            // edges
            ctx.beginPath();
            ctx.rect(gx, gy, gw, gh);
            ctx.stroke();
            // label background
            const lbw = Math.max(20, Math.min(canvasW, canvasH) / 24);
            const lbh = Math.max(14, lbw / 2.5);
            let lx = gx + 4;
            let ly = gy + 4;
            if (lx + lbw > canvasW) lx = Math.max(4, canvasW - lbw - 4);
            if (ly + lbh > canvasH) ly = Math.max(4, canvasH - lbh - 4);
            ctx.fillRect(lx, ly, lbw, lbh);
            ctx.fillStyle = '#ffffff';
            ctx.fillText(String(i+1).padStart(2,'0'), lx + 4, ly + lbh - 3);
            ctx.fillStyle = 'rgba(0,140,255,0.95)';
        }

        // update control panel info
        const modeSpan = panel.controlPanel.querySelector('#mode');
        const countSpan = panel.controlPanel.querySelector('#count');
        const zoomSpan = panel.controlPanel.querySelector('#zoom');
        if (modeSpan) modeSpan.textContent = mode;
        if (countSpan) countSpan.textContent = String(grid.length);
        if (zoomSpan) zoomSpan.textContent = `${Math.round((panel.viewScale||1.0)*100)}%`;

        ctx.restore();
    }
});


