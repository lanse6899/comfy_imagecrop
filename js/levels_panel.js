import { app } from "../../scripts/app.js";

app.registerExtension({
    name: "LevelsAdjustPanel",

    async beforeRegisterNodeDef(nodeType, nodeData, app) {
        if (nodeData.name === "levelssss") {

            const onNodeCreated = nodeType.prototype.onNodeCreated;
            nodeType.prototype.onNodeCreated = function () {
                const r = onNodeCreated ? onNodeCreated.apply(this, arguments) : undefined;
                this.addLevelsPanel();
                setTimeout(() => {
                    if (this.setDirtyCanvas) this.setDirtyCanvas(true, true);
                    if (this.graph && this.graph.setDirtyCanvas) this.graph.setDirtyCanvas(true, true);
                }, 100);
                return r;
            };

            const onWidgetChanged = nodeType.prototype.onWidgetChanged;
            nodeType.prototype.onWidgetChanged = function(name, value, old_value, widget) {
                const r = onWidgetChanged ? onWidgetChanged.apply(this, arguments) : undefined;
                if (!this.levelsPanel) return r;
                if (name === "levels_params") {
                    this.levelsPanel.setParamsFromString(value);
                    this.levelsPanel.draw();
                }
                if (name === "channel") {
                    this.levelsPanel.channel = value;
                    // ensure UI reflects the new channel's parameters immediately
                    try {
                        if (this.levelsPanel.setUIFromParams) this.levelsPanel.setUIFromParams();
                    } catch (e) {}
                    this.levelsPanel.draw();
                }
                return r;
            };

            const onAddedToGraph = nodeType.prototype.onAddedToGraph;
            nodeType.prototype.onAddedToGraph = function(graph) {
                const r = onAddedToGraph ? onAddedToGraph.apply(this, arguments) : undefined;
                setTimeout(() => {
                    if (this.loadInputImage_levels) this.loadInputImage_levels();
                }, 200);
                return r;
            };

            const onExecuted = nodeType.prototype.onExecuted;
            nodeType.prototype.onExecuted = function(message) {
                const r = onExecuted ? onExecuted.apply(this, arguments) : undefined;
                if (this.loadInputImage_levels) {
                    setTimeout(() => this.loadInputImage_levels(), 100);
                }
                return r;
            };

            const onConnectionsChange = nodeType.prototype.onConnectionsChange;
            nodeType.prototype.onConnectionsChange = function(type, index, connected, link_info) {
                const r = onConnectionsChange ? onConnectionsChange.apply(this, arguments) : undefined;
                if (type === 1 && this.loadInputImage_levels) {
                    setTimeout(() => this.loadInputImage_levels(), 150);
                }
                return r;
            };

            const onRemoved = nodeType.prototype.onRemoved;
            nodeType.prototype.onRemoved = function() {
                const r = onRemoved ? onRemoved.apply(this, arguments) : undefined;
                if (this.levelsPanel && this.levelsPanel.resizeObserver) {
                    this.levelsPanel.resizeObserver.disconnect();
                    this.levelsPanel.resizeObserver = null;
                }
                if (this.imageCheckInterval) {
                    clearInterval(this.imageCheckInterval);
                    this.imageCheckInterval = null;
                }
                return r;
            };
        }
    }
});

Object.assign(LGraphNode.prototype, {
    addLevelsPanel() {
        const container = document.createElement("div");
        container.style.cssText = `
            width: 100%;
            min-height: 220px;
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
            flex: 1 1 auto;
            position: relative;
            background: #222;
            display: flex;
            align-items: center;
            justify-content: center;
            overflow: hidden;
            padding: 8px;
            min-height: 260px;
            width: 700px;
            box-sizing: border-box;
        `;

        const canvas = document.createElement("canvas");
        canvas.style.cssText = `width: 100%; height: 100%; display: block; cursor: crosshair;`;

        const controlPanel = document.createElement("div");
        controlPanel.style.cssText = `
            background: #333;
            padding: 6px 8px;
            border-top: 1px solid #555;
            font-size: 12px;
            color: #ddd;
            display: flex;
            justify-content: space-between;
            flex-wrap: wrap;
            gap: 8px;
            align-items: center;
            min-height: 46px;
        `;

        controlPanel.innerHTML = `
            <div style="display:flex;gap:8px;align-items:center;">
                <label style="font-size:12px;color:#ccc;">通道:</label>
                <select id="lvlChannel" style="background:#2a2a2a;color:#fff;border:1px solid #444;padding:4px;border-radius:4px;">
                    <option value="RGB">RGB</option>
                    <option value="R">R</option>
                    <option value="G">G</option>
                    <option value="B">B</option>
                </select>
            </div>
            <div style="display:flex;gap:8px;align-items:center;">
                <div style="display:flex;flex-direction:column;gap:4px;">
                    <div style="color:#ccc;font-size:11px;">输入色阶</div>
                    <div style="display:flex;gap:6px;align-items:center;">
                        <input id="inBlack" type="range" min="0" max="255" value="0" style="width:120px;">
                        <!-- 将 inMid 改为精确的中点数值控制（1-254），更贴近 Photoshop 的中点映射 -->
                        <input id="inMid" type="range" min="1" max="254" value="128" step="0.01" style="width:140px;">
                        <input id="inWhite" type="range" min="0" max="255" value="255" style="width:120px;">
                    </div>
                    <div style="display:flex;gap:6px;">
                        <input id="inBlackNum" type="number" min="0" max="255" value="0" style="width:56px;">
                        <!-- 更精确的数值输入：中点以小数表示（1-254），步进 0.01 -->
                        <input id="inMidNum" type="number" min="1" max="254" step="0.01" value="128.00" style="width:72px;">
                        <input id="inWhiteNum" type="number" min="0" max="255" value="255" style="width:56px;">
                    </div>
                </div>
                <div style="display:flex;flex-direction:column;gap:4px;">
                    <div style="color:#ccc;font-size:11px;">输出色阶</div>
                    <div style="display:flex;gap:6px;align-items:center;">
                        <input id="outBlack" type="range" min="0" max="255" value="0" style="width:120px;">
                        <input id="outWhite" type="range" min="0" max="255" value="255" style="width:120px;">
                    </div>
                    <div style="display:flex;gap:6px;">
                        <input id="outBlackNum" type="number" min="0" max="255" value="0" style="width:56px;">
                        <div style="width:72px;"></div>
                        <input id="outWhiteNum" type="number" min="0" max="255" value="255" style="width:56px;">
                    </div>
                </div>
            </div>
            <div style="display:flex;gap:8px;align-items:center;">
                <select id="histDisplay" style="background:#2a2a2a;color:#fff;border:1px solid #444;padding:4px;border-radius:4px;">
                    <option value="all">直方图: 全部</option><option value="R">R</option><option value="G">G</option><option value="B">B</option>
                </select>
                <select id="histMode" style="background:#2a2a2a;color:#fff;border:1px solid #444;padding:4px;border-radius:4px;">
                    <option value="global">归一化: 全局</option><option value="per">归一化: 各通道</option>
                </select>
                <select id="presetLevels" style="background:#2a2a2a;color:#fff;border:1px solid #444;padding:4px;border-radius:4px;">
                    <option value="">预设</option>
                    <option value="linear">线性</option>
                    <option value="bright_mid">提升中间</option>
                    <option value="dark_mid">压暗中间</option>
                    <option value="increase_contrast">增强对比</option>
                    <option value="decrease_contrast">降低对比</option>
                </select>
                <div style="display:flex;flex-direction:column;align-items:flex-start;">
                    <label style="font-size:11px;color:#ccc;margin-bottom:2px;">Gamma:</label>
                    <input id="gammaValue" type="text" readonly value="1.00" style="width:64px;padding:2px 4px;background:#222;border:1px solid #444;color:#fff;border-radius:4px;text-align:center;font-size:12px;">
                </div>
                <button id="resetLevels" style="padding:4px 8px;background:#4a4a4a;border:1px solid #666;border-radius:4px;color:#fff;cursor:pointer;">重置</button>
            </div>
        `;

        canvasArea.appendChild(canvas);
        container.appendChild(canvasArea);
        container.appendChild(controlPanel);

        const widget = this.addDOMWidget("levels_panel", "div", container);
        widget.computeSize = () => [this.size ? this.size[0] : 420, 300];

        this.levelsPanel = {
            canvas,
            ctx: canvas.getContext('2d'),
            container,
            controlPanel,
            dpr: 1,
            inputImage: null,
            currentSrc: null,
            histogram: null,
            channel: "RGB",
            params: {
                RGB: { in_black:0, in_mid:128, in_white:255, out_black:0, out_white:255 },
                R: { in_black:0, in_mid:128, in_white:255, out_black:0, out_white:255 },
                G: { in_black:0, in_mid:128, in_white:255, out_black:0, out_white:255 },
                B: { in_black:0, in_mid:128, in_white:255, out_black:0, out_white:255 }
            }
        };

        // helper: sync UI <-> params
        const q = (sel) => controlPanel.querySelector(sel);
        const inBlack = q('#inBlack'), inMid = q('#inMid'), inWhite = q('#inWhite');
        const inBlackNum = q('#inBlackNum'), inMidNum = q('#inMidNum'), inWhiteNum = q('#inWhiteNum');
        const outBlack = q('#outBlack'), outWhite = q('#outWhite');
        const outBlackNum = q('#outBlackNum'), outWhiteNum = q('#outWhiteNum');
        const gammaValue = q('#gammaValue');
        const presetSelect = q('#presetLevels');

        // initialize channel widget
        const channelSelect = controlPanel.querySelector('#lvlChannel');
        const channelWidget = this.widgets?.find(w => w.name === "channel");
        if (channelWidget) channelSelect.value = channelWidget.value || "RGB";
        this.levelsPanel.channel = channelSelect.value;

        // sync UI values from params
        this.levelsPanel.setUIFromParams = () => {
            const p = this.levelsPanel.params[this.levelsPanel.channel] || this.levelsPanel.params.RGB;
            inBlack.value = Math.round(p.in_black || 0);
            // in_mid now represents an input midpoint in [1..254] and supports decimals
            inMid.value = Math.max(1, Math.min(254, Number(p.in_mid || 128)));
            inWhite.value = Math.round(p.in_white || 255);
            inBlackNum.value = Math.round(p.in_black || 0);
            // show mid with two decimals for precision
            inMidNum.value = Number(p.in_mid || 128).toFixed(2);
            inWhiteNum.value = Math.round(p.in_white || 255);
            outBlack.value = Math.round(p.out_black || 0);
            outWhite.value = Math.round(p.out_white || 255);
            outBlackNum.value = Math.round(p.out_black || 0);
            outWhiteNum.value = Math.round(p.out_white || 255);
            // update gamma display
            try {
                const g = this.computeGammaForParams(p);
                if (gammaValue) gammaValue.value = (Number(g)).toFixed(3);
            } catch (e) {}
        };

        this.levelsPanel.setParamsFromString = (str) => {
            if (!str) return;
            try {
                if (typeof str === 'string' && str.trim().startsWith('{')) {
                    const obj = JSON.parse(str);
                    for (const ch of ['RGB','R','G','B']) {
                        if (obj[ch]) this.levelsPanel.params[ch] = Object.assign({}, this.levelsPanel.params[ch], obj[ch]);
                    }
                    this.levelsPanel.setUIFromParams();
                    return;
                }
            } catch (e) {
                // ignore
            }
        };

        this.levelsPanel.computeGammaForParams = function(p) {
            // compute gamma so that midpoint maps to 0.5: gamma = log(0.5)/log(midNorm)
            const ib = Number(p.in_black || 0);
            const iw = Number(p.in_white || 255);
            const mid = Number(p.in_mid || 128);
            const denom = (iw - ib) === 0 ? 1 : (iw - ib);
            const midClamped = Math.max(ib + 1e-6, Math.min(iw - 1e-6, mid));
            const midNorm = (midClamped - ib) / denom;
            if (midNorm > 0 && midNorm < 1) {
                try {
                    return Number((Math.log(0.5) / Math.log(midNorm)).toFixed(4));
                } catch (e) {
                    return 1.0;
                }
            }
            return 1.0;
        };

        this.levelsPanel.getParamsString = () => {
            try {
                return JSON.stringify(this.levelsPanel.params);
            } catch (e) {
                return '';
            }
        };

        // channel change handler
        channelSelect.addEventListener('change', (e) => {
            // save current UI to params for previous channel
            const prev = this.levelsPanel.channel || "RGB";
            this.levelsPanel.params[prev] = this.levelsPanel.params[prev] || this.levelsPanel.params.RGB;
            this.levelsPanel.channel = e.target.value;
            this.updateParameter('channel', this.levelsPanel.channel);
            this.levelsPanel.setUIFromParams();
            this.updateParameter('levels_params', this.levelsPanel.getParamsString());
            if (this.onInputsChange) this.onInputsChange();
            if (app.graph) app.graph.setDirtyCanvas(true, true);
            this.levelsPanel.draw();
        });

        // UI bindings helper
        const bindRangeAndNumber = (rangeEl, numEl, getterSetter) => {
            rangeEl.addEventListener('input', () => {
                numEl.value = rangeEl.value;
                getterSetter(parseFloat(rangeEl.value));
                this.updateParameter('levels_params', this.levelsPanel.getParamsString());
                if (this.onInputsChange) this.onInputsChange();
                if (app.graph) app.graph.setDirtyCanvas(true, true);
                this.levelsPanel.draw();
            });
            numEl.addEventListener('change', () => {
                const v = parseFloat(numEl.value);
                rangeEl.value = Math.round(isNaN(v) ? 0 : v);
                getterSetter(v);
                this.updateParameter('levels_params', this.levelsPanel.getParamsString());
                if (this.onInputsChange) this.onInputsChange();
                if (app.graph) app.graph.setDirtyCanvas(true, true);
                this.levelsPanel.draw();
            });
        };

        // wire inputs: note inMid range is stored as percent (100==1.0)
        bindRangeAndNumber(inBlack, inBlackNum, (v) => { this.levelsPanel.params[this.levelsPanel.channel].in_black = Math.max(0, Math.min(255, Math.round(v))); });
        // inMid now is the actual input midpoint (1-254) and supports decimals
        bindRangeAndNumber(inMid, inMidNum, (v) => {
            const val = Math.max(1, Math.min(254, parseFloat(v) || 128));
            this.levelsPanel.params[this.levelsPanel.channel].in_mid = val;
            // update gamma display for current channel
            try {
                const pcur = this.levelsPanel.params[this.levelsPanel.channel];
                const g = this.levelsPanel.computeGammaForParams(pcur);
                if (gammaValue) gammaValue.value = (Number(g)).toFixed(3);
            } catch (e) {}
        });
        bindRangeAndNumber(inWhite, inWhiteNum, (v) => { this.levelsPanel.params[this.levelsPanel.channel].in_white = Math.max(0, Math.min(255, Math.round(v))); });
        bindRangeAndNumber(outBlack, outBlackNum, (v) => { this.levelsPanel.params[this.levelsPanel.channel].out_black = Math.max(0, Math.min(255, Math.round(v))); });
        bindRangeAndNumber(outWhite, outWhiteNum, (v) => { this.levelsPanel.params[this.levelsPanel.channel].out_white = Math.max(0, Math.min(255, Math.round(v))); });

        // reset button
        const resetBtn = controlPanel.querySelector('#resetLevels');
        if (resetBtn) {
                resetBtn.addEventListener('click', () => {
                for (const ch of ['RGB','R','G','B']) {
                    this.levelsPanel.params[ch] = { in_black:0, in_mid:128, in_white:255, out_black:0, out_white:255 };
                }
                this.updateParameter('levels_params', this.levelsPanel.getParamsString());
                if (this.onInputsChange) this.onInputsChange();
                if (app.graph) app.graph.setDirtyCanvas(true, true);
                this.levelsPanel.setUIFromParams();
                this.levelsPanel.draw();
            });
        }

        // preset handler
        if (presetSelect) {
            const presets = {
                linear: { in_black:0, in_mid:128, in_white:255, out_black:0, out_white:255 },
                bright_mid: { in_black:0, in_mid:96, in_white:255, out_black:0, out_white:255 },
                dark_mid: { in_black:0, in_mid:160, in_white:255, out_black:0, out_white:255 },
                increase_contrast: { in_black:10, in_mid:128, in_white:245, out_black:0, out_white:255 },
                decrease_contrast: { in_black:0, in_mid:128, in_white:255, out_black:16, out_white:239 }
            };
            presetSelect.addEventListener('change', (e) => {
                const v = e.target.value;
                if (!v) return;
                const p = presets[v];
                if (!p) return;
                for (const ch of ['RGB','R','G','B']) {
                    this.levelsPanel.params[ch] = Object.assign({}, this.levelsPanel.params[ch] || {}, p);
                }
                this.updateParameter('levels_params', this.levelsPanel.getParamsString());
                if (this.onInputsChange) this.onInputsChange();
                if (app.graph) app.graph.setDirtyCanvas(true, true);
                this.levelsPanel.setUIFromParams();
                this.levelsPanel.draw();
            });
        }

        // histogram display controls
        const histDisplaySelect = controlPanel.querySelector('#histDisplay');
        const histModeSelect = controlPanel.querySelector('#histMode');
        this.levelsPanel.histDisplay = 'all';
        this.levelsPanel.histMode = 'global';
        histDisplaySelect.addEventListener('change', (e) => { this.levelsPanel.histDisplay = e.target.value; this.levelsPanel.draw(); });
        histModeSelect.addEventListener('change', (e) => { this.levelsPanel.histMode = e.target.value; this.levelsPanel.draw(); });

        // canvas sizing
        const updateCanvasSize = () => {
            const displayWidth = 700;
            const displayHeight = 260;
            const dpr = Math.min(window.devicePixelRatio || 1, 2);
            this.levelsPanel.dpr = dpr;
            canvas.width = displayWidth * dpr;
            canvas.height = displayHeight * dpr;
            canvas.style.width = displayWidth + 'px';
            canvas.style.height = displayHeight + 'px';
            this.levelsPanel.ctx.setTransform(dpr,0,0,dpr,0,0);
            this.levelsPanel.displayWidth = displayWidth;
            this.levelsPanel.displayHeight = displayHeight;
            this.levelsPanel.draw();
        };

        if (!this.levelsPanel.resizeObserver) {
            this.levelsPanel.resizeObserver = new ResizeObserver(() => updateCanvasSize());
            this.levelsPanel.resizeObserver.observe(this.levelsPanel.container);
        }
        setTimeout(updateCanvasSize, 80);

        // periodic check to update image
        this.imageCheckInterval = setInterval(() => {
            if (this.loadInputImage_levels) this.loadInputImage_levels();
        }, 1000);

        // drawing helpers
        this.levelsPanel.getPlotRect = function() {
            const w = this.displayWidth || (this.canvas.width / this.dpr);
            const h = this.displayHeight || (this.canvas.height / this.dpr);
            const fullW = Math.max(0, w - 20 * 2);
            const fullH = Math.max(0, h - 20 * 2);
            const previewWidth = Math.min(200, Math.max(120, Math.floor(fullW * 0.32)));
            const plotW = Math.max(140, fullW - previewWidth - 12);
            return { x: 20, y: 20, w: plotW, h: fullH, previewWidth: previewWidth };
        };

        this.levelsPanel.getPreviewRect = function() {
            const p = this.getPlotRect();
            return { x: p.x + p.w + 8, y: p.y, w: p.previewWidth, h: p.h };
        };

        this.levelsPanel.computeLutFromParams = function(p) {
            // p: {in_black, in_mid, in_white, out_black, out_white}
            const ib = Number(p.in_black || 0);
            const im = Number(p.in_mid || 1.0);
            const iw = Number(p.in_white || 255);
            const ob = Number(p.out_black || 0);
            const ow = Number(p.out_white || 255);
            const denom = (iw - ib) === 0 ? 1 : (iw - ib);
            const lut = new Uint8ClampedArray(256);
            // Use Photoshop-style midpoint->gamma mapping:
            // in_mid is treated as the input value (between ib+1 and iw-1) that should map to 0.5 output.
            // Compute gamma so that ( (mid - ib)/(iw-ib) )^gamma = 0.5  => gamma = log(0.5) / log(midNorm)
            let gamma = 1.0;
            try {
                const mid = Math.max(ib + 1, Math.min(iw - 1, im));
                const midNorm = (mid - ib) / denom;
                if (midNorm > 0 && midNorm < 1) {
                    gamma = Math.log(0.5) / Math.log(midNorm);
                } else {
                    gamma = 1.0;
                }
            } catch (e) {
                gamma = 1.0;
            }

            for (let v=0; v<256; v++) {
                let normalized = (v - ib) / denom;
                if (!isFinite(normalized)) normalized = 0;
                normalized = Math.max(0, Math.min(1, normalized));
                const mapped = Math.pow(normalized, gamma);
                let outv = ob + mapped * (ow - ob);
                outv = Math.round(Math.max(0, Math.min(255, outv)));
                lut[v] = outv;
            }
            return lut;
        };

        this.levelsPanel.draw = () => {
            const panel = this.levelsPanel;
            const ctx = panel.ctx;
            const w = panel.canvas.width / panel.dpr;
            const h = panel.canvas.height / panel.dpr;
            ctx.clearRect(0,0,w,h);
            ctx.fillStyle = "#1e1e1e";
            ctx.fillRect(0,0,w,h);

            const plot = panel.getPlotRect();
            const r = { x: plot.x, y: plot.y, w: plot.w, h: plot.h };
            const previewRect = panel.getPreviewRect();

            // draw histogram if available
            if (panel.histogram) {
                const hist = panel.histogram;
                const maxVal = Math.max(1, hist.max || 1);
                const maxPerChannel = {
                    r: Math.max(1, Math.max(...hist.r)),
                    g: Math.max(1, Math.max(...hist.g)),
                    b: Math.max(1, Math.max(...hist.b))
                };
                const drawChannel = (arr, color, chName) => {
                    ctx.save();
                    ctx.globalAlpha = 0.18;
                    ctx.fillStyle = color;
                    ctx.beginPath();
                    for (let i=0;i<=255;i++) {
                        const x = r.x + (i/255) * r.w;
                        const denom = panel.histMode === 'per' ? maxPerChannel[chName] : maxVal;
                        const hval = (arr[i] || 0) / denom;
                        const y = r.y + r.h - hval * r.h;
                        if (i===0) ctx.moveTo(x, r.y + r.h);
                        ctx.lineTo(x, y);
                    }
                    ctx.lineTo(r.x + r.w, r.y + r.h);
                    ctx.closePath();
                    ctx.fill();
                    ctx.restore();
                };
                if (panel.histDisplay === 'all' || panel.histDisplay === 'B') drawChannel(hist.b, 'rgb(102, 179, 255)', 'b');
                if (panel.histDisplay === 'all' || panel.histDisplay === 'G') drawChannel(hist.g, 'rgb(102, 255, 102)', 'g');
                if (panel.histDisplay === 'all' || panel.histDisplay === 'R') drawChannel(hist.r, 'rgb(255, 102, 102)', 'r');
            }

            // axes
            ctx.strokeStyle = "#444";
            ctx.lineWidth = 1.2;
            ctx.strokeRect(r.x-0.5, r.y-0.5, r.w+1, r.h+1);

            // draw a diagonal baseline for reference
            ctx.beginPath();
            ctx.strokeStyle = "#666";
            ctx.lineWidth = 1;
            ctx.moveTo(r.x, r.y + r.h);
            ctx.lineTo(r.x + r.w, r.y);
            ctx.stroke();

            // draw input/output markers based on current channel params
            const p = panel.params[panel.channel] || panel.params.RGB;
            const lut = panel.computeLutFromParams(p);

            // draw mapping curve (straight sampled from LUT)
            ctx.beginPath();
            for (let i=0;i<256;i++) {
                const x = r.x + (i/255) * r.w;
                const yv = lut[i];
                const y = r.y + r.h - (yv/255) * r.h;
                if (i===0) ctx.moveTo(x,y);
                else ctx.lineTo(x,y);
            }
            ctx.strokeStyle = "#fff";
            ctx.lineWidth = 2;
            ctx.stroke();

            // draw right-side preview
            if (previewRect && panel.inputImage) {
                try {
                    const img = panel.inputImage;
                    const pw = Math.max(1, Math.floor(previewRect.w));
                    const ph = Math.max(1, Math.floor(previewRect.h));
                    const tmp = document.createElement('canvas');
                    tmp.width = pw;
                    tmp.height = ph;
                    const tctx = tmp.getContext('2d');
                    const iw = img.width;
                    const ih = img.height;
                    let scale = Math.min(pw / iw, ph / ih);
                    if (!isFinite(scale) || scale <= 0) scale = 1;
                    const drawW = Math.round(iw * scale);
                    const drawH = Math.round(ih * scale);
                    const dx = Math.round((pw - drawW) / 2);
                    const dy = Math.round((ph - drawH) / 2);
                    tctx.fillStyle = '#121212';
                    tctx.fillRect(0,0,pw,ph);
                    tctx.drawImage(img, 0, 0, iw, ih, dx, dy, drawW, drawH);

                    // apply LUT to preview
                    try {
                        const imageData = tctx.getImageData(0,0,pw,ph);
                        const data = imageData.data;
                        // build per-channel LUTs: use channel-specific params and RGB if needed
                        const lutRGB = panel.computeLutFromParams(panel.params.RGB);
                        const lutR = panel.computeLutFromParams(panel.params.R);
                        const lutG = panel.computeLutFromParams(panel.params.G);
                        const lutB = panel.computeLutFromParams(panel.params.B);
                        for (let k=0;k<data.length;k+=4) {
                            const r0 = data[k], g0 = data[k+1], b0 = data[k+2];
                            // apply per-channel then RGB composite
                            const r1 = lutR[r0], g1 = lutG[g0], b1 = lutB[b0];
                            data[k]   = lutRGB[r1];
                            data[k+1] = lutRGB[g1];
                            data[k+2] = lutRGB[b1];
                        }
                        tctx.putImageData(imageData, 0, 0);
                    } catch (e) {
                        // fallback ignore
                    }

                    ctx.save();
                    ctx.fillStyle = '#121212';
                    ctx.fillRect(previewRect.x, previewRect.y, previewRect.w, previewRect.h);
                    ctx.drawImage(tmp, previewRect.x, previewRect.y, previewRect.w, previewRect.h);
                    ctx.strokeStyle = '#444';
                    ctx.lineWidth = 1;
                    ctx.strokeRect(previewRect.x + 0.5, previewRect.y + 0.5, previewRect.w - 1, previewRect.h - 1);
                    ctx.restore();
                } catch (e) {
                    // ignore
                }
            }
        };

        // image loading and histogram computing
        Object.assign(LGraphNode.prototype, {
            loadInputImage_levels() {
                const imageInput = this.inputs?.find(input => input.name === "image");
                if (!imageInput || !imageInput.link) {
                    if (this.levelsPanel && this.levelsPanel.inputImage) {
                        this.levelsPanel.inputImage = null;
                        this.levelsPanel.currentSrc = null;
                        this.levelsPanel.histogram = null;
                    }
                    if (this.levelsPanel && this.levelsPanel.draw) this.levelsPanel.draw();
                    return;
                }
                const link = app.graph.links[imageInput.link];
                if (!link) {
                    if (this.levelsPanel && this.levelsPanel.draw) this.levelsPanel.draw();
                    return;
                }
                const sourceNode = app.graph.getNodeById(link.origin_id);
                if (!sourceNode) {
                    if (this.levelsPanel && this.levelsPanel.draw) this.levelsPanel.draw();
                    return;
                }
                const imageSrc = this.findImageSource_levels(sourceNode);
                if (imageSrc) this.loadImage_levels(imageSrc);
                else if (this.levelsPanel && this.levelsPanel.draw) this.levelsPanel.draw();
            },

            findImageSource_levels(node, visited = new Set(), isDirectConnection = true) {
                if (!node || visited.has(node.id)) return null;
                visited.add(node.id);
                if (isDirectConnection) {
                    if (node.images && node.images.length > 0) {
                        const imageInfo = node.images[0];
                        return `/view?filename=${imageInfo.filename}&subfolder=${imageInfo.subfolder || ''}&type=${imageInfo.type || 'output'}`;
                    }
                    if (node.imgs && node.imgs.length > 0) {
                        const imgElement = node.imgs[0];
                        if (imgElement && imgElement.src && imgElement.complete) return imgElement.src;
                    }
                } else {
                    if (node.imgs && node.imgs.length > 0) {
                        const imgElement = node.imgs[0];
                        if (imgElement && imgElement.src && imgElement.complete) return imgElement.src;
                    }
                    if (node.images && node.images.length > 0) {
                        const imageInfo = node.images[0];
                        return `/view?filename=${imageInfo.filename}&subfolder=${imageInfo.subfolder || ''}&type=${imageInfo.type || 'output'}`;
                    }
                }
                if (node.widgets) {
                    for (const widget of node.widgets) {
                        if (widget.type === 'image' && widget.value) return widget.value;
                    }
                }
                if (node.inputs) {
                    for (const input of node.inputs) {
                        if (input.link && (input.type === "IMAGE" || input.name === "image" || input.name.toLowerCase().includes("image"))) {
                            const link = app.graph.links[input.link];
                            if (link) {
                                const upstreamNode = app.graph.getNodeById(link.origin_id);
                                if (upstreamNode) {
                                    const result = this.findImageSource_levels(upstreamNode, visited, false);
                                    if (result) return result;
                                }
                            }
                        }
                    }
                }
                return null;
            },

            loadImage_levels(src) {
                if (!this.levelsPanel) return;
                const panel = this.levelsPanel;
                if (src === panel.currentSrc) return;
                panel.currentSrc = src;
                const img = new Image();
                img.crossOrigin = "anonymous";
                img.onload = () => {
                    panel.inputImage = img;
                    try {
                        const maxSample = 256;
                        const cw = Math.min(img.width, maxSample);
                        const ch = Math.min(img.height, maxSample);
                        const tmp = document.createElement('canvas');
                        tmp.width = cw;
                        tmp.height = ch;
                        const tctx = tmp.getContext('2d');
                        tctx.drawImage(img, 0, 0, cw, ch);
                        const data = tctx.getImageData(0,0,cw,ch).data;
                        const r = new Array(256).fill(0);
                        const g = new Array(256).fill(0);
                        const b = new Array(256).fill(0);
                        for (let i=0;i<data.length;i+=4) {
                            r[data[i]]++;
                            g[data[i+1]]++;
                            b[data[i+2]]++;
                        }
                        const maxVal = Math.max(1, Math.max(...r, ...g, ...b));
                        panel.histogram = { r, g, b, max: maxVal };
                    } catch (e) {
                        panel.histogram = null;
                    }
                    if (panel.draw) panel.draw();
                };
                img.onerror = () => {
                    panel.inputImage = null;
                    panel.currentSrc = null;
                    panel.histogram = null;
                    if (panel.draw) panel.draw();
                };
                img.src = src;
            }
        });

        // initialize UI from default params and draw
        this.levelsPanel.setUIFromParams();
        setTimeout(()=>this.levelsPanel.draw(), 120);
    }
});


