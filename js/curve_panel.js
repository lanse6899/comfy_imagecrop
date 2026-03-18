import { app } from "../../scripts/app.js";

app.registerExtension({
    name: "CurveAdjustPanel",
    
    async beforeRegisterNodeDef(nodeType, nodeData, app) {
        if (nodeData.name === "CurvePanel") {

            const onNodeCreated = nodeType.prototype.onNodeCreated;
            nodeType.prototype.onNodeCreated = function () {
                const r = onNodeCreated ? onNodeCreated.apply(this, arguments) : undefined;

                // 添加曲线交互面板
                this.addCurvePanel();

                // 延迟重绘确保面板显示
                setTimeout(() => {
                    if (this.setDirtyCanvas) this.setDirtyCanvas(true, true);
                    if (this.graph && this.graph.setDirtyCanvas) this.graph.setDirtyCanvas(true, true);
                }, 100);

                return r;
            };

            // 当widget被外部修改时，同步到面板
            const onWidgetChanged = nodeType.prototype.onWidgetChanged;
            nodeType.prototype.onWidgetChanged = function(name, value, old_value, widget) {
                const r = onWidgetChanged ? onWidgetChanged.apply(this, arguments) : undefined;
                if (!this.curvePanel) return r;

                if (name === "curve_points") {
                    // 更新面板上的控制点
                    this.curvePanel.setPointsFromString(value);
                    this.curvePanel.draw();
                }

                if (name === "channel") {
                    this.curvePanel.channel = value;
                    this.curvePanel.draw();
                }

                return r;
            };
            
            // 当节点被添加到图形时，确保加载图像
            const onAddedToGraph = nodeType.prototype.onAddedToGraph;
            nodeType.prototype.onAddedToGraph = function(graph) {
                const r = onAddedToGraph ? onAddedToGraph.apply(this, arguments) : undefined;
                setTimeout(() => {
                    if (this.loadInputImage_curve) this.loadInputImage_curve();
                }, 200);
                return r;
            };

            // 监听执行完成，刷新图像
            const onExecuted = nodeType.prototype.onExecuted;
            nodeType.prototype.onExecuted = function(message) {
                const r = onExecuted ? onExecuted.apply(this, arguments) : undefined;
                if (this.loadInputImage_curve) {
                    setTimeout(() => this.loadInputImage_curve(), 100);
                }
                return r;
            };

            // 监听连接变化，刷新图像
            const onConnectionsChange = nodeType.prototype.onConnectionsChange;
            nodeType.prototype.onConnectionsChange = function(type, index, connected, link_info) {
                const r = onConnectionsChange ? onConnectionsChange.apply(this, arguments) : undefined;
                if (type === 1 && this.loadInputImage_curve) {
                    setTimeout(() => this.loadInputImage_curve(), 150);
                }
                return r;
            };

            // 节点移除时清理观察器和定时器
            const onRemoved = nodeType.prototype.onRemoved;
            nodeType.prototype.onRemoved = function() {
                const r = onRemoved ? onRemoved.apply(this, arguments) : undefined;
                if (this.curvePanel && this.curvePanel.resizeObserver) {
                    this.curvePanel.resizeObserver.disconnect();
                    this.curvePanel.resizeObserver = null;
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
    addCurvePanel() {
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
            min-height: 360px; /* 固定画板区域高度为 360 */
            width: 700px; /* 固定宽度为 700 */
            box-sizing: border-box;
        `;

        const canvas = document.createElement("canvas");
        // 使用100%高度以便随容器伸展，画板会填满canvasArea
        canvas.style.cssText = `width: 100%; height: 100%; display: block; cursor: crosshair;`;

        const controlPanel = document.createElement("div");
        controlPanel.style.cssText = `
            background: #333;
            padding: 4px 8px; /* 缩小控件占用高度，给画板让出更多空间 */
            border-top: 1px solid #555;
            font-size: 11px;
            color: #ddd;
            display: flex;
            justify-content: space-between;
            flex-wrap: wrap;
            gap: 6px;
            align-items: center;
            min-height: 36px;
        `;

        controlPanel.innerHTML = `
            <div style="display:flex;gap:8px;align-items:center;">
                <label style="font-size:12px;color:#ccc;">通道:</label>
                <select id="channelSelect" style="background:#2a2a2a;color:#fff;border:1px solid #444;padding:4px;border-radius:4px;">
                    <option value="RGB">RGB</option>
                    <option value="R">R</option>
                    <option value="G">G</option>
                    <option value="B">B</option>
                </select>
            </div>
            <div style="font-size:12px;color:#ccc;">双击添加点；右键删除点；拖拽移动</div>
            <div style="display:flex;gap:6px;align-items:center;">
                <button id="resetCurve" style="padding:4px 8px;background:#4a4a4a;border:1px solid #666;border-radius:4px;color:#fff;cursor:pointer;">重置</button>
                <select id="presetSelect" style="background:#2a2a2a;color:#fff;border:1px solid #444;padding:4px;border-radius:4px;">
                    <option value="">预设</option>
                    <option value="linear">线性</option>
                    <option value="soft_S">柔和S型</option>
                    <option value="strong_S">强力S型</option>
                    <option value="bright_mid">提亮中间调</option>
                    <option value="dark_mood">暗调</option>
                    <option value="highlight_lift">提升高光</option>
                    <option value="shadow_lift">提升阴影</option>
                    <option value="film_matte">胶片哑光</option>
                    <option value="fade_blacks">黑位褪色</option>
                    <option value="punchy">强烈对比</option>
                    <option value="high_key">高调</option>
                    <option value="low_key">低调</option>
                    <option value="vintage_warm">复古暖色</option>
                    <option value="vintage_cool">复古冷色</option>
                    <option value="cinematic_S">电影感S型</option>
                    <option value="cross_process">冲印风格</option>
                    <option value="skin_boost">肤色增强</option>
                    <option value="hdr_boost">HDR增强</option>
                    <option value="invert">反转</option>
                    <option value="soft_contrast">柔和对比</option>
                    <option value="cool_contrast">冷对比</option>
                    <option value="warm_contrast">暖对比</option>
                    <option value="deep_shadows">深沉阴影</option>
                    <option value="open_shadows">提亮阴影</option>
                    <option value="film_negative_style">负片风格</option>
                    <option value="subtle_S">细腻S型</option>
                    <option value="vintage_film2">复古胶片2</option>
                    <option value="pop_colors">鲜艳色彩</option>
                    <option value="mellow_tone">柔和色调</option>
                    <option value="contrast_mid_boost">中间调对比提升</option>
                    <option value="cool_shadow_lift">冷色阴影提升</option>
                    <option value="warm_highlight_boost">暖色高光提升</option>
                    <option value="dreamy_glow">梦幻光晕</option>
                    <option value="harsh_contrast">强硬对比</option>
                    <option value="low_saturation_like">降饱和风</option>
                    <option value="heavy_filmic">重胶片感</option>
                    <option value="soft_flatten">软化压平</option>
                    <option value="daylight_boost">日光增强</option>
                    <option value="moonlight">月光风格</option>
                    <option value="teal_orange_base">青橙基调</option>
                    <option value="soft_film_swing">软胶片摆动</option>
                    <option value="retro_fade">复古褪色</option>
                    <option value="high_contrast_mid">中间高反差</option>
                    <option value="slight_increase_mids">中间调微提</option>
                    <option value="cinematic_teal">电影青绿</option>
                    <option value="punch_shadows">阴影冲击</option>
                    <option value="boost_highlights_only">仅提升高光</option>
                    <option value="lift_shadows_only">仅提升阴影</option>
                    <option value="strong_midtone_lift">强中间调提升</option>
                    <option value="cinematic_bleach_bypass_like">漂白旁路风</option>
                </select>
                <button id="exportCurve" style="padding:4px 8px;background:#3a6bbf;border:1px solid #2b4f9a;border-radius:4px;color:#fff;cursor:pointer;">导出</button>
                <button id="importCurve" style="padding:4px 8px;background:#2b8a2b;border:1px solid #1f6f1f;border-radius:4px;color:#fff;cursor:pointer;">导入</button>
            </div>
        `;

        canvasArea.appendChild(canvas);
        container.appendChild(canvasArea);
        container.appendChild(controlPanel);

        const widget = this.addDOMWidget("curve_panel", "div", container);
        // 恢复面板默认建议尺寸为初始较紧凑值，避免节点整体被放大
        widget.computeSize = () => [this.size ? this.size[0] : 420, 260];

        // 保存panel状态（改为按通道保存点集以避免不同通道互相覆盖）
        this.curvePanel = {
            canvas: canvas,
            ctx: canvas.getContext('2d'),
            container: container,
            controlPanel: controlPanel,
            // 每个通道单独保存点数组（默认为对角线端点）
            pointsByChannel: {
                RGB: [{x:0,y:0},{x:255,y:255}],
                R:   [{x:0,y:0},{x:255,y:255}],
                G:   [{x:0,y:0},{x:255,y:255}],
                B:   [{x:0,y:0},{x:255,y:255}]
            },
            // 当前面板实际使用的点引用（指向 pointsByChannel[this.curvePanel.channel]）
            points: [],
            draggingIndex: -1,
            hoverIndex: -1,
            padding: 20,
            channel: "RGB",
            dpr: 1,
            inputImage: null,
            currentSrc: null,
            histogram: null  // {r:[],g:[],b:[],max: int}
        };
        // debug flag (set true to enable console logs)
        this.curvePanel.debug = false;

        // 初始化点（读取widget）——将字符串解析到当前通道的点集中
        const cpWidget = this.widgets?.find(w => w.name === "curve_points");
        const channelWidgetInitial = this.widgets?.find(w => w.name === "channel");
        if (channelWidgetInitial && channelWidgetInitial.value) {
            this.curvePanel.channel = channelWidgetInitial.value || "RGB";
        }

        // helper: parse points string -> pts array
        this.curvePanel._parsePointsString = function(str) {
            const pts = [];
            try {
                str.split(';').forEach(p => {
                    const s = p.trim();
                    if (!s) return;
                    const [sx, sy] = s.split(',');
                    const x = Math.max(0, Math.min(255, Math.round(parseFloat(sx))));
                    const y = Math.max(0, Math.min(255, Math.round(parseFloat(sy))));
                    pts.push({x, y});
                });
            } catch (e) {
                pts.push({x:0,y:0},{x:255,y:255});
            }
            if (pts.length === 0) { pts.push({x:0,y:0},{x:255,y:255}); }
            if (pts[0].x !== 0) pts.unshift({x:0,y:0});
            if (pts[pts.length-1].x !== 255) pts.push({x:255,y:255});
            return pts;
        };

        // 设置指定通道的点（并在当前通道时更新 this.curvePanel.points 引用）
        this.curvePanel.setPointsForChannel = function(channel, pts) {
            this.pointsByChannel[channel] = pts;
            if (this.channel === channel) {
                this.points = pts;
            }
        };

        // 从字符串设置当前通道或多个通道的点（支持 JSON 格式或单一通道串）
        this.curvePanel.setPointsFromString = (str, channel = this.curvePanel.channel) => {
            if (!str) return;
            try {
                if (typeof str === 'string' && str.trim().startsWith('{')) {
                    const obj = JSON.parse(str);
                    if (obj.R) this.pointsByChannel.R = this._parsePointsString(obj.R);
                    if (obj.G) this.pointsByChannel.G = this._parsePointsString(obj.G);
                    if (obj.B) this.pointsByChannel.B = this._parsePointsString(obj.B);
                    if (obj.RGB) this.pointsByChannel.RGB = this._parsePointsString(obj.RGB);
                    // refresh current points reference
                    this.points = this.pointsByChannel[this.channel] || this.pointsByChannel.RGB;
                    return;
                }
            } catch (e) {
                // not JSON or parse failed - fallback to single channel parsing
            }

            const pts = this.curvePanel._parsePointsString(str);
            this.curvePanel.setPointsForChannel(channel, pts);
        };

        // 将当前通道的点序列转为字符串
        this.curvePanel.pointsToString = function() {
            const pts = (this.points || []).slice().sort((a,b)=>a.x-b.x);
            return pts.map(p => `${p.x},${p.y}`).join(';');
        };

        // 返回包含四个通道点的组合字符串（JSON）
        this.curvePanel.getCombinedPointsString = function() {
            const obj = {
                RGB: (this.pointsByChannel.RGB || [{x:0,y:0},{x:255,y:255}]).slice().sort((a,b)=>a.x-b.x).map(p=>`${p.x},${p.y}`).join(';'),
                R:   (this.pointsByChannel.R || [{x:0,y:0},{x:255,y:255}]).slice().sort((a,b)=>a.x-b.x).map(p=>`${p.x},${p.y}`).join(';'),
                G:   (this.pointsByChannel.G || [{x:0,y:0},{x:255,y:255}]).slice().sort((a,b)=>a.x-b.x).map(p=>`${p.x},${p.y}`).join(';'),
                B:   (this.pointsByChannel.B || [{x:0,y:0},{x:255,y:255}]).slice().sort((a,b)=>a.x-b.x).map(p=>`${p.x},${p.y}`).join(';')
            };
            try {
                return JSON.stringify(obj);
            } catch (e) {
                // fallback to current channel string
                return this.pointsToString();
            }
        };

        if (cpWidget && cpWidget.value) {
            this.curvePanel.setPointsFromString(cpWidget.value, this.curvePanel.channel);
            // ensure current points reference matches channel
            this.curvePanel.points = this.curvePanel.pointsByChannel[this.curvePanel.channel];
        } else {
            // ensure current points reference matches chosen channel
            this.curvePanel.points = this.curvePanel.pointsByChannel[this.curvePanel.channel];
            // initialize widget to current channel's points (send combined per-channel string)
            this.updateParameter('curve_points', this.curvePanel.getCombinedPointsString());
            if (this.onInputsChange) this.onInputsChange();
            if (app.graph) app.graph.setDirtyCanvas(true, true);
        }

        // channel select
        const channelSelect = controlPanel.querySelector('#channelSelect');
        if (channelSelect) {
            const channelWidget = this.widgets?.find(w => w.name === "channel");
            if (channelWidget) channelSelect.value = channelWidget.value || "RGB";
            channelSelect.addEventListener('change', (e) => {
                // 保存当前通道的点到 pointsByChannel
                try {
                    const prev = this.curvePanel.channel || "RGB";
                    this.curvePanel.pointsByChannel[prev] = this.curvePanel.points.slice();
                } catch (err) {
                    // ignore
                }

                const newChannel = e.target.value;
                this.curvePanel.channel = newChannel;
                // 恢复新通道的点引用（若不存在则初始化为对角线）
                if (!this.curvePanel.pointsByChannel[newChannel] || this.curvePanel.pointsByChannel[newChannel].length === 0) {
                    this.curvePanel.pointsByChannel[newChannel] = [{x:0,y:0},{x:255,y:255}];
                }
                this.curvePanel.points = this.curvePanel.pointsByChannel[newChannel];

                // 同步 widget 中的 channel 与所有通道点（发送组合字符串）
                this.updateParameter('channel', newChannel);
                this.updateParameter('curve_points', this.curvePanel.getCombinedPointsString());
                if (this.onInputsChange) this.onInputsChange();
                if (app.graph) app.graph.setDirtyCanvas(true, true);
                this.curvePanel.draw();
            });
        }

        // Add histogram display controls
        // histogram display: All/R/G/B
        const histDisplaySelect = document.createElement('select');
        histDisplaySelect.id = 'histDisplay';
        histDisplaySelect.style.cssText = 'background:#2a2a2a;color:#fff;border:1px solid #444;padding:4px;border-radius:4px;';
        histDisplaySelect.innerHTML = '<option value="all">显示: 全部</option><option value="R">R</option><option value="G">G</option><option value="B">B</option>';
        controlPanel.appendChild(histDisplaySelect);

        // histogram normalization mode: global / perChannel
        const histModeSelect = document.createElement('select');
        histModeSelect.id = 'histMode';
        histModeSelect.style.cssText = 'background:#2a2a2a;color:#fff;border:1px solid #444;padding:4px;border-radius:4px;';
        histModeSelect.innerHTML = '<option value="global">归一化: 全局最大值</option><option value="per">归一化: 各通道</option>';
        controlPanel.appendChild(histModeSelect);

        // initialize panel properties
        this.curvePanel.histDisplay = 'all';
        this.curvePanel.histMode = 'global';

        histDisplaySelect.addEventListener('change', (e) => {
            this.curvePanel.histDisplay = e.target.value;
            this.curvePanel.draw();
        });
        histModeSelect.addEventListener('change', (e) => {
            this.curvePanel.histMode = e.target.value;
            this.curvePanel.draw();
        });

        // canvas sizing
        const updateCanvasSize = () => {
            // Force fixed logical display size requested by user (700x360)
            const displayWidth = 700;
            const displayHeight = 360;
            const dpr = Math.min(window.devicePixelRatio || 1, 2);
            this.curvePanel.dpr = dpr;

            // reset any previous transform before resizing
            try {
                if (this.curvePanel && this.curvePanel.ctx && this.curvePanel.ctx.resetTransform) {
                    this.curvePanel.ctx.resetTransform();
                } else if (this.curvePanel && this.curvePanel.ctx) {
                    this.curvePanel.ctx.setTransform(1,0,0,1,0,0);
                }
            } catch (e) {
                // ignore
            }

            // Set internal pixel buffer to area size * dpr and store logical display sizes
            canvas.width = displayWidth * dpr;
            canvas.height = displayHeight * dpr;
            canvas.style.width = displayWidth + 'px';
            canvas.style.height = displayHeight + 'px';
            this.curvePanel.ctx.setTransform(dpr,0,0,dpr,0,0);
            this.curvePanel.displayWidth = displayWidth;
            this.curvePanel.displayHeight = displayHeight;

            if (this.curvePanel.debug) {
                console.log('[CurvePanel] updateCanvasSize area:', areaRect.width, areaRect.height, 'display:', displayWidth, displayHeight, 'dpr:', dpr, 'canvas:', canvas.width, canvas.height);
            }

            this.curvePanel.draw();
        };

        // attach resize observer to ensure responsiveness
        if (!this.curvePanel.resizeObserver) {
            this.curvePanel.resizeObserver = new ResizeObserver(() => updateCanvasSize());
            this.curvePanel.resizeObserver.observe(this.curvePanel.container);
        }
        setTimeout(updateCanvasSize, 100);
        
        // load input image after panel initialized
        setTimeout(() => {
            if (this.loadInputImage_curve) this.loadInputImage_curve();
        }, 500);

        // periodic check to update image if upstream changes (non-blocking)
        this.imageCheckInterval = setInterval(() => {
            if (this.loadInputImage_curve) this.loadInputImage_curve();
        }, 1000);

        // drawing helpers
        // 返回绘图区域（不包含右侧预览区域）
        this.curvePanel.getPlotRect = function() {
            // use stored logical display sizes set by updateCanvasSize
            const w = this.displayWidth || (this.canvas.width / this.dpr);
            const h = this.displayHeight || (this.canvas.height / this.dpr);
            const fullW = Math.max(0, w - this.padding * 2);
            const fullH = Math.max(0, h - this.padding * 2);
            // preview占比改大一些，并设置更合理的最小/最大宽度以保持可视性
            const previewWidth = Math.min(240, Math.max(140, Math.floor(fullW * 0.35)));
            const plotW = Math.max(120, fullW - previewWidth - 12);
            return { x: this.padding, y: this.padding, w: plotW, h: fullH, previewWidth: previewWidth, fullW: fullW, fullH: fullH };
        };

        // 返回右侧预览区域
        this.curvePanel.getPreviewRect = function() {
            const plot = this.getPlotRect();
            const x = plot.x + plot.w + 8;
            const y = plot.y;
            const w = plot.previewWidth;
            const h = plot.h;
            return { x, y, w, h };
        };

        // 旧方法兼容：返回绘图区域（使用新方法）
        this.curvePanel.getCanvasRect = function() {
            const p = this.getPlotRect();
            return { x: p.x, y: p.y, w: p.w, h: p.h };
        };

        this.curvePanel.valueToScreen = function(vx, vy) {
            // vx,vy in 0-255 -> map into plot rect
            const r = this.getPlotRect();
            const sx = r.x + (vx/255) * r.w;
            const sy = r.y + ((255 - vy)/255) * r.h;
            return {sx, sy};
        };

        this.curvePanel.screenToValue = function(sx, sy) {
            const r = this.getPlotRect();
            const vx = Math.round(((sx - r.x) / r.w) * 255);
            const vy = Math.round(255 - ((sy - r.y) / r.h) * 255);
            return {vx: Math.max(0, Math.min(255, vx)), vy: Math.max(0, Math.min(255, vy))};
        };

        this.curvePanel.draw = () => {
            const panel = this.curvePanel;
            const ctx = panel.ctx;
            const w = panel.canvas.width / panel.dpr;
            const h = panel.canvas.height / panel.dpr;

            // clear
            ctx.clearRect(0,0,w,h);
            // background
            ctx.fillStyle = "#1e1e1e";
            ctx.fillRect(0,0,w,h);

            const plot = panel.getPlotRect();
            const r = { x: plot.x, y: plot.y, w: plot.w, h: plot.h };
            const previewRect = panel.getPreviewRect();

            // draw histogram if available (semi-transparent per-channel)
            if (panel.histogram) {
                const hist = panel.histogram;
                const maxVal = Math.max(1, hist.max || 1);
                const maxPerChannel = {
                    r: Math.max(1, Math.max(...hist.r)),
                    g: Math.max(1, Math.max(...hist.g)),
                    b: Math.max(1, Math.max(...hist.b))
                };
                // draw channel with normalization mode and display filter
                const drawChannel = (arr, color, chName) => {
                    ctx.save();
                    ctx.globalAlpha = 0.18;
                    ctx.fillStyle = color;
                    ctx.beginPath();
                    for (let i=0;i<=255;i++) {
                        const x = r.x + (i/255) * r.w;
                        // choose normalization
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

            // grid
            ctx.strokeStyle = "#2f2f2f";
            ctx.lineWidth = 1;
            for (let i=0;i<=4;i++) {
                const gx = r.x + r.w * (i/4);
                const gy = r.y + r.h * (i/4);
                ctx.beginPath();
                ctx.moveTo(gx, r.y);
                ctx.lineTo(gx, r.y + r.h);
                ctx.stroke();
                ctx.beginPath();
                ctx.moveTo(r.x, gy);
                ctx.lineTo(r.x + r.w, gy);
                ctx.stroke();
            }

            // axes
            ctx.strokeStyle = "#444";
            ctx.lineWidth = 1.2;
            ctx.strokeRect(r.x-0.5, r.y-0.5, r.w+1, r.h+1);

            // draw curve (interpolated)
            // sort points by x
            const pts = panel.points.slice().sort((a,b)=>a.x-b.x);
            // ensure endpoints
            if (pts.length < 2) pts.splice(0,0,{x:0,y:0},{x:255,y:255});

            // build interpolation using natural cubic spline for smoothness
            const xs = pts.map(p=>p.x);
            const ys = pts.map(p=>p.y);

            // compute second derivatives for natural cubic spline
            function computeSecondDerivatives(xs, ys) {
                const n = xs.length;
                const y2 = new Array(n).fill(0.0);
                const u = new Array(n-1).fill(0.0);
                y2[0] = 0.0;
                u[0] = 0.0;
                for (let i=1;i<n-1;i++) {
                    const sig = (xs[i]-xs[i-1])/(xs[i+1]-xs[i-1]);
                    const p = sig * y2[i-1] + 2.0;
                    if (p === 0) {
                        y2[i] = 0;
                        u[i] = 0;
                    } else {
                        y2[i] = (sig - 1.0) / p;
                        const denom = (xs[i+1]-xs[i-1]);
                        if (denom === 0) u[i] = 0;
                        else u[i] = (6.0 * ((ys[i+1]-ys[i])/(xs[i+1]-xs[i]) - (ys[i]-ys[i-1])/(xs[i]-xs[i-1])) / denom - sig * u[i-1]) / p;
                    }
                }
                y2[n-1] = 0.0;
                for (let k = n-2; k>=0; k--) {
                    y2[k] = y2[k] * y2[k+1] + u[k];
                }
                return y2;
            }

            function splineInterpolate(xs, ys, y2, xval) {
                const n = xs.length;
                if (n === 0) return 0;
                if (n === 1) return ys[0];
                if (xval <= xs[0]) return ys[0];
                if (xval >= xs[n-1]) return ys[n-1];
                // binary search for interval
                let klo = 0;
                let khi = n-1;
                while (khi - klo > 1) {
                    const k = Math.floor((khi + klo) / 2);
                    if (xs[k] > xval) khi = k;
                    else klo = k;
                }
                const h = xs[khi] - xs[klo];
                if (h === 0) return ys[klo];
                const a = (xs[khi] - xval) / h;
                const b = (xval - xs[klo]) / h;
                const y = a*ys[klo] + b*ys[khi] + ((a*a*a - a)*y2[klo] + (b*b*b - b)*y2[khi]) * (h*h) / 6.0;
                return y;
            }

            const y2 = computeSecondDerivatives(xs, ys);
            ctx.beginPath();
            for (let xi=0; xi<=255; xi+=1) {
                const yv = splineInterpolate(xs, ys, y2, xi);
                const {sx, sy} = panel.valueToScreen(xi, Math.round(yv));
                if (xi===0) ctx.moveTo(sx, sy);
                else ctx.lineTo(sx, sy);
            }
            ctx.strokeStyle = panel.channel === "RGB" ? "#ffffff" : (panel.channel==="R"?"#ff6666":(panel.channel==="G"?"#66ff66":"#66b3ff"));
            ctx.lineWidth = 2;
            ctx.stroke();

            // draw control points
            for (let i=0;i<pts.length;i++) {
                const p = pts[i];
                const {sx,sy} = panel.valueToScreen(p.x,p.y);
                const isSel = (i === panel.draggingIndex) || (i === panel.hoverIndex);
                ctx.beginPath();
                ctx.fillStyle = isSel ? "#ffd24d" : "#ffffaa";
                ctx.strokeStyle = "#222";
                ctx.lineWidth = 1;
                ctx.arc(sx, sy, isSel ? 6 : 5, 0, Math.PI*2);
                ctx.fill();
                ctx.stroke();
            }

            // 绘制右侧预览（当前加载的图像）
            if (previewRect && panel.inputImage) {
                try {
                    const img = panel.inputImage;
                    // build LUT from current curve (natural cubic spline)
                    const ptsL = panel.points.slice().sort((a,b)=>a.x-b.x);
                    if (ptsL.length < 2) ptsL.splice(0,0,{x:0,y:0},{x:255,y:255});
                    const xsL = ptsL.map(p=>p.x);
                    const ysL = ptsL.map(p=>p.y);

                    // prepare offscreen canvas for preview, at previewRect size (logical pixels)
                    const pw = Math.max(1, Math.floor(previewRect.w));
                    const ph = Math.max(1, Math.floor(previewRect.h));
                    const tmp = document.createElement('canvas');
                    tmp.width = pw;
                    tmp.height = ph;
                    const tctx = tmp.getContext('2d');

                    // fit image into previewRect area of tmp canvas
                    const iw = img.width;
                    const ih = img.height;
                    let scale = Math.min(pw / iw, ph / ih);
                    if (!isFinite(scale) || scale <= 0) scale = 1;
                    const drawW = Math.round(iw * scale);
                    const drawH = Math.round(ih * scale);
                    const dx = Math.round((pw - drawW) / 2);
                    const dy = Math.round((ph - drawH) / 2);

                    // draw original image to tmp
                    tctx.fillStyle = '#121212';
                    tctx.fillRect(0,0,pw,ph);
                    tctx.drawImage(img, 0, 0, iw, ih, dx, dy, drawW, drawH);

                    // Photoshop-style composition: apply per-channel curves first (R/G/B), then apply RGB composite curve last.
                    try {
                        // compute per-channel LUTs from stored channel points; use live editing points for currently selected channel
                        const lutR = panel.computeLutFromPoints(panel.channel === 'R' ? (panel.points || panel.pointsByChannel.R) : (panel.pointsByChannel.R || [{x:0,y:0},{x:255,y:255}]));
                        const lutG = panel.computeLutFromPoints(panel.channel === 'G' ? (panel.points || panel.pointsByChannel.G) : (panel.pointsByChannel.G || [{x:0,y:0},{x:255,y:255}]));
                        const lutB = panel.computeLutFromPoints(panel.channel === 'B' ? (panel.points || panel.pointsByChannel.B) : (panel.pointsByChannel.B || [{x:0,y:0},{x:255,y:255}]));
                        // compute RGB composite LUT (apply last); use live points if editing RGB
                        const lutRGB = panel.computeLutFromPoints(panel.channel === 'RGB' ? (panel.points || panel.pointsByChannel.RGB) : (panel.pointsByChannel.RGB || [{x:0,y:0},{x:255,y:255}]));

                        // apply per-channel then RGB composite
                        const imageData = tctx.getImageData(0,0,pw,ph);
                        const data = imageData.data;
                        for (let k=0;k<data.length;k+=4) {
                            const r0 = data[k];
                            const g0 = data[k+1];
                            const b0 = data[k+2];
                            // apply channel-specific transforms first
                            const r1 = lutR[r0];
                            const g1 = lutG[g0];
                            const b1 = lutB[b0];
                            // then apply RGB composite to all channels
                            data[k]   = lutRGB[r1];
                            data[k+1] = lutRGB[g1];
                            data[k+2] = lutRGB[b1];
                        }
                        tctx.putImageData(imageData, 0, 0);
                    } catch (e) {
                        // getImageData may throw on cross-origin; fallback to drawing original
                    }

                    // draw tmp to main canvas at previewRect position
                    ctx.save();
                    ctx.fillStyle = '#121212';
                    ctx.fillRect(previewRect.x, previewRect.y, previewRect.w, previewRect.h);
                    ctx.drawImage(tmp, previewRect.x, previewRect.y, previewRect.w, previewRect.h);
                    ctx.strokeStyle = '#444';
                    ctx.lineWidth = 1;
                    ctx.strokeRect(previewRect.x + 0.5, previewRect.y + 0.5, previewRect.w - 1, previewRect.h - 1);
                    ctx.restore();
                } catch (e) {
                    // ignore drawing errors
                }
            }
        };

        // 将当前通道的点序列转为字符串
        this.curvePanel.pointsToString = function() {
            const pts = (this.points || []).slice().sort((a,b)=>a.x-b.x);
            return pts.map(p => `${p.x},${p.y}`).join(';');
        };

        // 根据点集计算 256 长度的 LUT（自然三次样条插值）
        this.curvePanel.computeLutFromPoints = function(pts) {
            const xs = pts.map(p=>p.x);
            const ys = pts.map(p=>p.y);

            // ensure at least endpoints
            if (xs.length < 2) {
                return new Uint8ClampedArray([...Array(256).keys()]);
            }

            function computeSecondDerivatives(xs, ys) {
                const n = xs.length;
                const y2 = new Array(n).fill(0.0);
                const u = new Array(n-1).fill(0.0);
                y2[0] = 0.0;
                u[0] = 0.0;
                for (let i=1;i<n-1;i++) {
                    const sig = (xs[i]-xs[i-1])/(xs[i+1]-xs[i-1]);
                    const p = sig * y2[i-1] + 2.0;
                    if (p === 0) {
                        y2[i] = 0;
                        u[i] = 0;
                    } else {
                        y2[i] = (sig - 1.0) / p;
                        const denom = (xs[i+1]-xs[i-1]);
                        if (denom === 0) u[i] = 0;
                        else u[i] = (6.0 * ((ys[i+1]-ys[i])/(xs[i+1]-xs[i]) - (ys[i]-ys[i-1])/(xs[i]-xs[i-1])) / denom - sig * u[i-1]) / p;
                    }
                }
                y2[n-1] = 0.0;
                for (let k = n-2; k>=0; k--) {
                    y2[k] = y2[k] * y2[k+1] + u[k];
                }
                return y2;
            }

            function splineInterpolate(xs, ys, y2, xval) {
                const n = xs.length;
                if (n === 0) return 0;
                if (n === 1) return ys[0];
                if (xval <= xs[0]) return ys[0];
                if (xval >= xs[n-1]) return ys[n-1];
                let klo = 0;
                let khi = n-1;
                while (khi - klo > 1) {
                    const k = Math.floor((khi + klo) / 2);
                    if (xs[k] > xval) khi = k;
                    else klo = k;
                }
                const h = xs[khi] - xs[klo];
                if (h === 0) return ys[klo];
                const a = (xs[khi] - xval) / h;
                const b = (xval - xs[klo]) / h;
                const y = a*ys[klo] + b*ys[khi] + ((a*a*a - a)*y2[klo] + (b*b*b - b)*y2[khi]) * (h*h) / 6.0;
                return y;
            }

            const y2 = computeSecondDerivatives(xs, ys);
            const lut = new Uint8ClampedArray(256);
            for (let i=0;i<256;i++) {
                const v = Math.round(splineInterpolate(xs, ys, y2, i));
                lut[i] = Math.max(0, Math.min(255, v));
            }
            return lut;
        };

        // （Photoshop 风格）无需历史记录：保持每个通道与 RGB 曲线，预览按「先通道后 RGB」顺序实时合成

        // mouse interactions
        const rectToLocal = (e) => {
            const rect = canvas.getBoundingClientRect();
            const dpr = this.curvePanel.dpr || 1;
            const x = (e.clientX - rect.left) * (canvas.width / rect.width) / dpr;
            const y = (e.clientY - rect.top) * (canvas.height / rect.height) / dpr;
            return {x,y};
        };

        canvas.addEventListener('dblclick', (e) => {
            // add point at position
            const pos = rectToLocal(e);
            const {vx,vy} = this.curvePanel.screenToValue(pos.x,pos.y);
            // insert keeping x-order (if duplicate x, insert after)
            const idx = this.curvePanel.points.findIndex(p=>p.x > vx);
            if (idx === -1) this.curvePanel.points.push({x:vx,y:vy});
            else this.curvePanel.points.splice(idx,0,{x:vx,y:vy});
            this.updateParameter('curve_points', this.curvePanel.getCombinedPointsString());
            if (this.onInputsChange) this.onInputsChange();
            if (app.graph) app.graph.setDirtyCanvas(true, true);
            this.curvePanel.draw();
        });

        // Reset / Preset / Import / Export handlers
        const resetBtn = controlPanel.querySelector('#resetCurve');
        const presetSelect = controlPanel.querySelector('#presetSelect');
        const exportBtn = controlPanel.querySelector('#exportCurve');
        const importBtn = controlPanel.querySelector('#importCurve');

        if (resetBtn) {
            resetBtn.addEventListener('click', () => {
                this.curvePanel.setPointsForChannel(this.curvePanel.channel, [{x:0,y:0},{x:255,y:255}]);
                this.updateParameter('curve_points', this.curvePanel.getCombinedPointsString());
                if (this.onInputsChange) this.onInputsChange();
                if (app.graph) app.graph.setDirtyCanvas(true, true);
                this.curvePanel.draw();
            });
        }

        const presets = {
            linear: "0,0;255,255",
            soft_S: "0,0;40,36;96,92;160,200;208,228;255,255",
            strong_S: "0,0;32,20;80,70;128,128;176,200;224,242;255,255",
            bright_mid: "0,0;64,110;128,170;192,220;255,255",
            dark_mood: "0,0;48,28;96,80;128,120;192,180;255,255",
            highlight_lift: "0,0;64,90;128,150;192,210;230,245;255,255",
            shadow_lift: "0,0;12,24;64,78;128,140;192,200;255,255",
            film_matte: "0,0;36,28;96,96;160,190;208,224;255,255",
            fade_blacks: "0,0;8,18;48,48;128,140;192,200;255,255",
            punchy: "0,0;48,32;96,84;128,128;160,180;208,235;255,255",
            high_key: "0,0;64,100;128,180;192,230;255,255",
            low_key: "0,0;40,20;96,64;128,110;192,180;255,255",
            vintage_warm: "0,0;48,40;96,90;128,140;192,200;255,255",
            vintage_cool: "0,0;48,36;96,80;128,120;192,190;255,255",
            cinematic_S: "0,0;64,48;128,128;192,208;255,255",
            cross_process: "0,0;64,90;128,200;192,210;255,255",
            skin_boost: "0,0;48,56;96,110;128,150;192,200;255,255",
            hdr_boost: "0,0;32,28;64,64;128,160;192,220;255,255",
            invert: "0,255;255,0",
            soft_contrast: "0,0;56,48;112,112;168,196;255,255",
            cool_contrast: "0,0;48,36;110,100;150,180;220,240;255,255",
            warm_contrast: "0,0;40,36;100,92;150,180;210,238;255,255",
            deep_shadows: "0,0;24,8;72,48;128,110;192,170;255,255",
            open_shadows: "0,0;16,32;64,88;128,150;192,210;255,255",
            film_negative_style: "0,255;32,200;96,160;160,80;224,24;255,0",
            subtle_S: "0,0;48,44;112,106;160,184;208,220;255,255",
            vintage_film2: "0,0;32,18;88,80;128,128;180,204;255,255",
            pop_colors: "0,0;48,28;96,90;128,140;192,210;255,255",
            mellow_tone: "0,0;32,28;96,88;128,128;192,190;255,255",
            contrast_mid_boost: "0,0;60,40;110,100;145,170;210,240;255,255",
            cool_shadow_lift: "0,0;20,32;80,92;128,138;192,200;255,255",
            warm_highlight_boost: "0,0;48,70;112,150;176,210;230,245;255,255",
            dreamy_glow: "0,0;48,56;96,120;128,170;192,220;255,255",
            harsh_contrast: "0,0;24,12;64,60;128,140;192,220;224,250;255,255",
            low_saturation_like: "0,0;32,28;96,86;128,128;192,188;255,255",
            heavy_filmic: "0,0;40,32;88,80;128,150;176,210;255,255",
            soft_flatten: "0,0;16,24;64,72;128,136;192,192;255,255",
            daylight_boost: "0,0;48,56;96,130;128,180;192,230;255,255",
            moonlight: "0,0;24,12;80,72;128,110;192,160;255,255",
            teal_orange_base: "0,0;48,36;96,90;128,136;192,200;255,255",
            soft_film_swing: "0,0;36,32;88,84;132,140;188,210;255,255",
            retro_fade: "0,0;12,18;64,72;128,136;192,200;255,255",
            high_contrast_mid: "0,0;48,24;96,88;128,136;192,220;255,255",
            slight_increase_mids: "0,0;64,96;128,160;192,208;255,255",
            cinematic_teal: "0,0;48,40;104,96;136,150;200,230;255,255",
            punch_shadows: "0,0;20,6;64,44;128,120;192,190;255,255",
            boost_highlights_only: "0,0;64,96;128,170;192,230;255,255",
            lift_shadows_only: "0,0;16,36;64,96;128,150;192,200;255,255",
            strong_midtone_lift: "0,0;56,80;110,150;160,210;255,255",
            cinematic_bleach_bypass_like: "0,0;24,18;88,92;128,130;192,200;255,255"
        };

        if (presetSelect) {
            presetSelect.addEventListener('change', (e) => {
                const v = e.target.value;
                if (!v) return;
                const str = presets[v];
                    if (str) {
                    this.curvePanel.setPointsFromString(str);
                    this.updateParameter('curve_points', this.curvePanel.getCombinedPointsString());
                    if (this.onInputsChange) this.onInputsChange();
                    if (app.graph) app.graph.setDirtyCanvas(true, true);
                        this.curvePanel.draw();
                        // 保持下拉显示为所选项，不重置为默认提示
                    }
            });
        }

        if (exportBtn) {
            exportBtn.addEventListener('click', () => {
                const s = this.curvePanel.pointsToString();
                try {
                    if (navigator.clipboard && navigator.clipboard.writeText) {
                        navigator.clipboard.writeText(s).then(()=> {
                            alert('曲线字符串已复制到剪贴板');
                        }, ()=> {
                            prompt('复制曲线字符串：', s);
                        });
                    } else {
                        prompt('复制曲线字符串：', s);
                    }
                } catch (e) {
                    prompt('复制曲线字符串：', s);
                }
            });
        }

        if (importBtn) {
            importBtn.addEventListener('click', () => {
                const v = prompt('粘贴曲线字符串 (格式: x,y;...):');
                if (!v) return;
                this.curvePanel.setPointsFromString(v);
                this.updateParameter('curve_points', this.curvePanel.getCombinedPointsString());
                if (this.onInputsChange) this.onInputsChange();
                if (app.graph) app.graph.setDirtyCanvas(true, true);
                this.curvePanel.draw();
            });
        }

        canvas.addEventListener('mousedown', (e) => {
            if (e.button === 2) {
                // right click: try delete point
                const pos = rectToLocal(e);
                const hitIndex = hitTestPoint(pos.x,pos.y);
                if (hitIndex >= 0) {
                    // prevent removing endpoints
                    const pts = this.curvePanel.points;
                    const sorted = pts.slice().sort((a,b)=>a.x-b.x);
                    const p = sorted[hitIndex];
                    if (p.x === 0 || p.x === 255) return;
                    const globalIdx = pts.findIndex(pp => pp.x === p.x && pp.y === p.y);
                    if (globalIdx >= 0) {
                        pts.splice(globalIdx,1);
                        this.updateParameter('curve_points', this.curvePanel.getCombinedPointsString());
                        if (this.onInputsChange) this.onInputsChange();
                        if (app.graph) app.graph.setDirtyCanvas(true, true);
                        this.curvePanel.draw();
                    }
                }
                e.preventDefault();
                return;
            }

            // left click: start dragging if hit a point
            const pos = rectToLocal(e);
            const hitIndex = hitTestPoint(pos.x,pos.y);
            if (hitIndex >= 0) {
                // find corresponding index in unsorted array
                const sorted = this.curvePanel.points.slice().sort((a,b)=>a.x-b.x);
                const p = sorted[hitIndex];
                const globalIdx = this.curvePanel.points.findIndex(pp => pp.x === p.x && pp.y === p.y);
                this.curvePanel.draggingIndex = globalIdx;
                canvas.style.cursor = 'grabbing';
                e.preventDefault();
            }
        });

        const onMouseMove = (e) => {
            const pos = rectToLocal(e);
            // hover detection
            const hitIndex = hitTestPoint(pos.x,pos.y);
            if (hitIndex >= 0) {
                this.curvePanel.hoverIndex = hitIndex;
                canvas.style.cursor = 'grab';
            } else {
                this.curvePanel.hoverIndex = -1;
                canvas.style.cursor = 'crosshair';
            }

            // 不再计算直方图悬浮提示（已移除显示）

            if (this.curvePanel.draggingIndex >= 0) {
                // move point with mouse
                const {vx,vy} = this.curvePanel.screenToValue(pos.x,pos.y);
                const idx = this.curvePanel.draggingIndex;
                const ptsUnsorted = this.curvePanel.points;
                const sorted = ptsUnsorted.slice().sort((a,b)=>a.x-b.x);
                // find sorted index for this dragging point (match by reference or by x/y)
                let sortedIndex = sorted.findIndex(p => p === ptsUnsorted[idx] || (p.x === ptsUnsorted[idx].x && p.y === ptsUnsorted[idx].y));
                if (sortedIndex === -1) {
                    // fallback: try match by x
                    sortedIndex = sorted.findIndex(p => p.x === ptsUnsorted[idx].x);
                }

                // compute neighbor bounds
                const leftNeighborX = (sortedIndex > 0) ? sorted[sortedIndex-1].x : 0;
                const rightNeighborX = (sortedIndex >= 0 && sortedIndex < sorted.length-1) ? sorted[sortedIndex+1].x : 255;

                // allow endpoints to move horizontally but clamp between neighbors
                let newX = Math.max(0, Math.min(255, vx));
                // ensure ordering: cannot cross neighbors
                if (sortedIndex > 0) newX = Math.max(newX, leftNeighborX + 0);
                if (sortedIndex >= 0 && sortedIndex < sorted.length-1) newX = Math.min(newX, rightNeighborX - 0);

                // update point in original array (preserve identity)
                ptsUnsorted[idx].x = Math.round(newX);
                ptsUnsorted[idx].y = Math.max(0, Math.min(255, vy));

                this.curvePanel.draw();
            }
        };

        const onMouseUp = (e) => {
            if (this.curvePanel.draggingIndex >= 0) {
                // finalize
                // sanitize points: ensure endpoints present and sorted unique x
                let pts = this.curvePanel.points.slice();
                // remove duplicates by x keeping last, preserve moved endpoints (do not force 0/255)
                const map = new Map();
                for (const p of pts) map.set(p.x, p);
                pts = Array.from(map.values()).sort((a,b)=>a.x-b.x);
                // ensure at least two points remain; if not, restore simple endpoints
                if (pts.length < 2) pts = [{x:0,y:0},{x:255,y:255}];
                // 保存到按通道存储，保证 pointsByChannel 与当前 points 同步
                this.curvePanel.setPointsForChannel(this.curvePanel.channel, pts);
                this.updateParameter('curve_points', this.curvePanel.getCombinedPointsString());
                if (this.onInputsChange) this.onInputsChange();
                if (app.graph) app.graph.setDirtyCanvas(true, true);
                this.curvePanel.draggingIndex = -1;
                canvas.style.cursor = 'crosshair';
                this.curvePanel.draw();
            }
        };

        const hitTestPoint = (sx, sy) => {
            const panel = this.curvePanel;
            const pts = panel.points.slice().sort((a,b)=>a.x-b.x);
            for (let i=0;i<pts.length;i++) {
                const p = pts[i];
                const sc = panel.valueToScreen(p.x,p.y);
                const dx = sx - sc.sx;
                const dy = sy - sc.sy;
                if (Math.sqrt(dx*dx+dy*dy) <= 8) return i;
            }
            return -1;
        };

        // global listeners for dragging
        canvas.addEventListener('mousemove', onMouseMove);
        document.addEventListener('mouseup', onMouseUp);

        // prevent context menu on canvas to allow right-click deletion UX
        canvas.addEventListener('contextmenu', (e) => {
            e.preventDefault();
        });

        // initial draw
        setTimeout(()=>this.curvePanel.draw(), 120);
    }
});

// 添加图像加载与直方图计算的通用方法到节点原型
Object.assign(LGraphNode.prototype, {
    loadInputImage_curve() {
        const imageInput = this.inputs?.find(input => input.name === "image");
        if (!imageInput || !imageInput.link) {
            if (this.curvePanel && this.curvePanel.inputImage) {
                this.curvePanel.inputImage = null;
                this.curvePanel.currentSrc = null;
                this.curvePanel.histogram = null;
            }
            if (this.curvePanel && this.curvePanel.draw) this.curvePanel.draw();
            return;
        }

        const link = app.graph.links[imageInput.link];
        if (!link) {
            if (this.curvePanel && this.curvePanel.draw) this.curvePanel.draw();
            return;
        }

        const sourceNode = app.graph.getNodeById(link.origin_id);
        if (!sourceNode) {
            if (this.curvePanel && this.curvePanel.draw) this.curvePanel.draw();
            return;
        }

        // 保存源节点引用
        this.sourceImageNode = sourceNode;

        // 查找可用图像源
        const imageSrc = this.findImageSource_curve(sourceNode);
        if (imageSrc) {
            this.loadImage_curve(imageSrc);
        } else {
            if (this.curvePanel && this.curvePanel.draw) this.curvePanel.draw();
        }
    },

    findImageSource_curve(node, visited = new Set(), isDirectConnection = true) {
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
                            const result = this.findImageSource_curve(upstreamNode, visited, false);
                            if (result) return result;
                        }
                    }
                }
            }
        }

        return null;
    },

    loadImage_curve(src) {
        if (!this.curvePanel) return;
        const panel = this.curvePanel;
        if (src === panel.currentSrc) return;
        panel.currentSrc = src;

        const img = new Image();
        img.crossOrigin = "anonymous";
        img.onload = () => {
            panel.inputImage = img;
            // compute histogram once on load
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


