import { app } from "../../scripts/app.js";

app.registerExtension({
    name: "DepthAdjustPanel",

    async beforeRegisterNodeDef(nodeType, nodeData, app) {
        if (nodeData.name === "DepthAdjustNode") {

            const onNodeCreated = nodeType.prototype.onNodeCreated;
            nodeType.prototype.onNodeCreated = function () {
                const r = onNodeCreated ? onNodeCreated.apply(this, arguments) : undefined;
                this.addDepthAdjustPanel();
                setTimeout(() => {
                    if (this.setDirtyCanvas) this.setDirtyCanvas(true, true);
                    if (this.graph && this.graph.setDirtyCanvas) this.graph.setDirtyCanvas(true, true);
                }, 100);
                return r;
            };

            const onWidgetChanged = nodeType.prototype.onWidgetChanged;
            nodeType.prototype.onWidgetChanged = function(name, value, old_value, widget) {
                const r = onWidgetChanged ? onWidgetChanged.apply(this, arguments) : undefined;
                if (!this.depthAdjustPanel) return r;

                if (this.depthAdjustPanel.updateFromWidgets) {
                    this.depthAdjustPanel.updateFromWidgets();
                }
                if (this.depthAdjustPanel.draw) {
                    this.depthAdjustPanel.draw();
                }
                return r;
            };

            const onAddedToGraph = nodeType.prototype.onAddedToGraph;
            nodeType.prototype.onAddedToGraph = function(graph) {
                const r = onAddedToGraph ? onAddedToGraph.apply(this, arguments) : undefined;
                setTimeout(() => {
                    if (this.loadInputImage_depth) this.loadInputImage_depth();
                    if (this.loadInputDepth_depth) this.loadInputDepth_depth();
                }, 200);
                return r;
            };

            const onExecuted = nodeType.prototype.onExecuted;
            nodeType.prototype.onExecuted = function(message) {
                const r = onExecuted ? onExecuted.apply(this, arguments) : undefined;
                setTimeout(() => {
                    if (this.loadInputImage_depth) this.loadInputImage_depth();
                    if (this.loadInputDepth_depth) this.loadInputDepth_depth();
                }, 100);
                return r;
            };

            const onConnectionsChange = nodeType.prototype.onConnectionsChange;
            nodeType.prototype.onConnectionsChange = function(type, index, connected, link_info) {
                const r = onConnectionsChange ? onConnectionsChange.apply(this, arguments) : undefined;
                if (type === 1) {
                    setTimeout(() => {
                        if (this.loadInputImage_depth) this.loadInputImage_depth();
                        if (this.loadInputDepth_depth) this.loadInputDepth_depth();
                    }, 150);
                }
                return r;
            };

            const onRemoved = nodeType.prototype.onRemoved;
            nodeType.prototype.onRemoved = function() {
                const r = onRemoved ? onRemoved.apply(this, arguments) : undefined;
                if (this.depthAdjustPanel && this.depthAdjustPanel.resizeObserver) {
                    this.depthAdjustPanel.resizeObserver.disconnect();
                    this.depthAdjustPanel.resizeObserver = null;
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
    addDepthAdjustPanel() {
        const container = document.createElement("div");
        container.style.cssText = `
            width: 100%;
            min-height: 360px;
            border: 2px solid #555;
            border-radius: 6px;
            background: #1a1a1a;
            margin: 5px 0;
            display: flex;
            flex-direction: row;
            box-sizing: border-box;
            overflow: hidden;
        `;

        // 左侧预览区（65%）
        const previewSection = document.createElement("div");
        previewSection.style.cssText = `
            flex: 0 0 65%;
            background: #121212;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: flex-start;
            position: relative;
            padding: 10px;
            min-height: 340px;
        `;

        // 标题栏
        const header = document.createElement("div");
        header.style.cssText = `
            width: 100%;
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 8px;
        `;
        header.innerHTML = `
            <span style="font-size:12px;color:#ddd;font-weight:600;">🎨 深度图明暗调整</span>
            <span id="statusOverlay" style="background:rgba(0,0,0,0.6);padding:4px 10px;border-radius:4px;font-size:10px;color:#fff;">等待输入</span>
        `;
        previewSection.appendChild(header);

        // 使用 img 标签显示预览（更清晰）
        const previewImg = document.createElement("img");
        previewImg.id = "previewImg";
        previewImg.style.cssText = `
            width: 100%;
            height: 260px;
            object-fit: contain;
            image-rendering: -webkit-optimize-contrast;
            border-radius: 4px;
            background: #1a1a1a;
        `;
        previewSection.appendChild(previewImg);

        // 深度指示条
        const depthBar = document.createElement("div");
        depthBar.style.cssText = `
            width: 80%;
            height: 24px;
            background: linear-gradient(to right, #ffffff, #888888, #000000);
            border-radius: 4px;
            display: flex;
            align-items: center;
            justify-content: space-between;
            padding: 0 14px;
            font-size: 10px;
            color: #fff;
            text-shadow: 0 1px 3px rgba(0,0,0,1);
            margin-top: 10px;
            font-weight: 600;
        `;
        depthBar.innerHTML = '<span>近</span><span>远</span>';
        previewSection.appendChild(depthBar);

        // 右侧控制区（35%）
        const controlSection = document.createElement("div");
        controlSection.style.cssText = `
            flex: 0 0 35%;
            background: #242424;
            padding: 12px;
            border-left: 1px solid #444;
            display: flex;
            flex-direction: column;
            gap: 14px;
            overflow-y: auto;
        `;

        // 暗部设置
        const darkGroup = document.createElement("div");
        darkGroup.innerHTML = `
            <div style="color:#ff6b6b;font-size:11px;margin-bottom:10px;font-weight:600;">🌑 暗部设置</div>
            <div style="display:flex;gap:6px;margin-bottom:10px;">
                <label style="color:#888;font-size:10px;display:flex;align-items:center;">位置:</label>
                <select id="darkPos" style="flex:1;background:#1a1a1a;color:#fff;border:1px solid #444;padding:4px 6px;border-radius:4px;font-size:10px;cursor:pointer;">
                    <option value="near">近处</option>
                    <option value="far">远处</option>
                </select>
            </div>
            <div style="margin-bottom:8px;">
                <div style="display:flex;justify-content:space-between;margin-bottom:4px;">
                    <span style="color:#888;font-size:10px;">强度</span>
                    <span id="darkIntVal" style="color:#ff6b6b;font-size:10px;font-weight:600;">-30</span>
                </div>
                <input id="darkInt" type="range" min="-100" max="100" value="-30" style="width:100%;height:6px;-webkit-appearance:none;background:#333;border-radius:3px;cursor:pointer;">
            </div>
            <div style="margin-bottom:8px;">
                <div style="display:flex;justify-content:space-between;margin-bottom:4px;">
                    <span style="color:#888;font-size:10px;">范围</span>
                    <span id="darkRangeVal" style="color:#58a6ff;font-size:10px;font-weight:600;">50%</span>
                </div>
                <input id="darkRange" type="range" min="5" max="100" value="50" style="width:100%;height:6px;-webkit-appearance:none;background:#333;border-radius:3px;cursor:pointer;">
            </div>
            <div>
                <div style="display:flex;justify-content:space-between;margin-bottom:4px;">
                    <span style="color:#888;font-size:10px;">羽化</span>
                    <span id="darkFeatherVal" style="color:#8b949e;font-size:10px;font-weight:600;">20</span>
                </div>
                <input id="darkFeather" type="range" min="0" max="50" value="20" style="width:100%;height:6px;-webkit-appearance:none;background:#333;border-radius:3px;cursor:pointer;">
            </div>
        `;
        controlSection.appendChild(darkGroup);

        // 亮部设置
        const lightGroup = document.createElement("div");
        lightGroup.innerHTML = `
            <div style="color:#ffd93d;font-size:11px;margin-bottom:10px;font-weight:600;">☀️ 亮部设置</div>
            <div style="display:flex;gap:6px;margin-bottom:10px;">
                <label style="color:#888;font-size:10px;display:flex;align-items:center;">位置:</label>
                <select id="lightPos" style="flex:1;background:#1a1a1a;color:#fff;border:1px solid #444;padding:4px 6px;border-radius:4px;font-size:10px;cursor:pointer;">
                    <option value="near">近处</option>
                    <option value="far" selected>远处</option>
                </select>
            </div>
            <div style="margin-bottom:8px;">
                <div style="display:flex;justify-content:space-between;margin-bottom:4px;">
                    <span style="color:#888;font-size:10px;">强度</span>
                    <span id="lightIntVal" style="color:#ffd93d;font-size:10px;font-weight:600;">40</span>
                </div>
                <input id="lightInt" type="range" min="-100" max="100" value="40" style="width:100%;height:6px;-webkit-appearance:none;background:#333;border-radius:3px;cursor:pointer;">
            </div>
            <div style="margin-bottom:8px;">
                <div style="display:flex;justify-content:space-between;margin-bottom:4px;">
                    <span style="color:#888;font-size:10px;">范围</span>
                    <span id="lightRangeVal" style="color:#58a6ff;font-size:10px;font-weight:600;">50%</span>
                </div>
                <input id="lightRange" type="range" min="5" max="100" value="50" style="width:100%;height:6px;-webkit-appearance:none;background:#333;border-radius:3px;cursor:pointer;">
            </div>
            <div>
                <div style="display:flex;justify-content:space-between;margin-bottom:4px;">
                    <span style="color:#888;font-size:10px;">羽化</span>
                    <span id="lightFeatherVal" style="color:#8b949e;font-size:10px;font-weight:600;">20</span>
                </div>
                <input id="lightFeather" type="range" min="0" max="50" value="20" style="width:100%;height:6px;-webkit-appearance:none;background:#333;border-radius:3px;cursor:pointer;">
            </div>
        `;
        controlSection.appendChild(lightGroup);

        // 预设按钮
        const presetGroup = document.createElement("div");
        presetGroup.style.cssText = `margin-top:auto;padding-top:12px;border-top:1px solid #444;`;
        presetGroup.innerHTML = `
            <div style="color:#58a6ff;font-size:11px;margin-bottom:10px;font-weight:600;">✨ 预设效果</div>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;">
                <button id="presetFade" style="padding:8px 6px;background:#2a2a2a;border:1px solid #444;border-radius:4px;color:#fff;cursor:pointer;font-size:10px;">📷 景深</button>
                <button id="presetHighlight" style="padding:8px 6px;background:#2a2a2a;border:1px solid #444;border-radius:4px;color:#fff;cursor:pointer;font-size:10px;">💡 突出远</button>
                <button id="presetShadow" style="padding:8px 6px;background:#2a2a2a;border:1px solid #444;border-radius:4px;color:#fff;cursor:pointer;font-size:10px;">🌙 压暗近</button>
                <button id="presetReset" style="padding:8px 6px;background:#3a3a3a;border:1px solid #555;border-radius:4px;color:#fff;cursor:pointer;font-size:10px;">🔄 重置</button>
            </div>
        `;
        controlSection.appendChild(presetGroup);

        container.appendChild(previewSection);
        container.appendChild(controlSection);

        const widget = this.addDOMWidget("depth_adjust_panel", "div", container);
        widget.computeSize = () => [this.size ? this.size[0] : 560, 380];

        // 隐藏的 canvas 用于处理图像
        const hiddenCanvas = document.createElement('canvas');
        hiddenCanvas.style.display = 'none';

        this.depthAdjustPanel = {
            previewImg,
            hiddenCanvas,
            hiddenCtx: hiddenCanvas.getContext('2d', { willReadFrequently: true }),
            container,
            controlPanel: controlSection,
            previewSection,
            inputImage: null,
            inputDepth: null,
            currentImageSrc: null,
            currentDepthSrc: null,
            statusOverlay: header.querySelector('#statusOverlay')
        };

        // 绑定控件
        const bindSlider = (id, valId, suffix, widgetName) => {
            const slider = controlSection.querySelector('#' + id);
            const display = controlSection.querySelector('#' + valId);
            if (slider) {
                slider.addEventListener('input', () => {
                    if (display) display.textContent = slider.value + suffix;
                    this.updateParameter(widgetName, parseInt(slider.value));
                    if (this.onInputsChange) this.onInputsChange();
                    if (app.graph) app.graph.setDirtyCanvas(true, true);
                    this.depthAdjustPanel.updatePreview();
                });
            }
        };

        bindSlider('darkInt', 'darkIntVal', '', 'dark_intensity');
        bindSlider('darkRange', 'darkRangeVal', '%', 'dark_range');
        bindSlider('darkFeather', 'darkFeatherVal', '', 'dark_feather');
        bindSlider('lightInt', 'lightIntVal', '', 'light_intensity');
        bindSlider('lightRange', 'lightRangeVal', '%', 'light_range');
        bindSlider('lightFeather', 'lightFeatherVal', '', 'light_feather');

        const darkPosSelect = controlSection.querySelector('#darkPos');
        const lightPosSelect = controlSection.querySelector('#lightPos');

        if (darkPosSelect) {
            darkPosSelect.addEventListener('change', () => {
                this.updateParameter('dark_position', darkPosSelect.value);
                if (this.onInputsChange) this.onInputsChange();
                if (app.graph) app.graph.setDirtyCanvas(true, true);
                this.depthAdjustPanel.updatePreview();
            });
        }

        if (lightPosSelect) {
            lightPosSelect.addEventListener('change', () => {
                this.updateParameter('light_position', lightPosSelect.value);
                if (this.onInputsChange) this.onInputsChange();
                if (app.graph) app.graph.setDirtyCanvas(true, true);
                this.depthAdjustPanel.updatePreview();
            });
        }

        const presets = {
            presetFade: { darkPos: 'near', darkInt: -20, darkRange: 40, darkFeather: 25, lightPos: 'far', lightInt: 30, lightRange: 40, lightFeather: 25 },
            presetHighlight: { darkPos: 'near', darkInt: -15, darkRange: 50, darkFeather: 20, lightPos: 'far', lightInt: 50, lightRange: 60, lightFeather: 20 },
            presetShadow: { darkPos: 'near', darkInt: -40, darkRange: 50, darkFeather: 15, lightPos: 'far', lightInt: 0, lightRange: 50, lightFeather: 20 }
        };

        const applyPreset = (p) => {
            darkPosSelect.value = p.darkPos;
            controlSection.querySelector('#darkInt').value = p.darkInt;
            controlSection.querySelector('#darkIntVal').textContent = p.darkInt;
            controlSection.querySelector('#darkRange').value = p.darkRange;
            controlSection.querySelector('#darkRangeVal').textContent = p.darkRange + '%';
            controlSection.querySelector('#darkFeather').value = p.darkFeather;
            controlSection.querySelector('#darkFeatherVal').textContent = p.darkFeather;
            lightPosSelect.value = p.lightPos;
            controlSection.querySelector('#lightInt').value = p.lightInt;
            controlSection.querySelector('#lightIntVal').textContent = p.lightInt;
            controlSection.querySelector('#lightRange').value = p.lightRange;
            controlSection.querySelector('#lightRangeVal').textContent = p.lightRange + '%';
            controlSection.querySelector('#lightFeather').value = p.lightFeather;
            controlSection.querySelector('#lightFeatherVal').textContent = p.lightFeather;

            this.updateParameter('dark_position', p.darkPos);
            this.updateParameter('dark_intensity', p.darkInt);
            this.updateParameter('dark_range', p.darkRange);
            this.updateParameter('dark_feather', p.darkFeather);
            this.updateParameter('light_position', p.lightPos);
            this.updateParameter('light_intensity', p.lightInt);
            this.updateParameter('light_range', p.lightRange);
            this.updateParameter('light_feather', p.lightFeather);

            if (this.onInputsChange) this.onInputsChange();
            if (app.graph) app.graph.setDirtyCanvas(true, true);
            this.depthAdjustPanel.updatePreview();
        };

        controlSection.querySelector('#presetFade')?.addEventListener('click', () => applyPreset(presets.presetFade));
        controlSection.querySelector('#presetHighlight')?.addEventListener('click', () => applyPreset(presets.presetHighlight));
        controlSection.querySelector('#presetShadow')?.addEventListener('click', () => applyPreset(presets.presetShadow));

        controlSection.querySelector('#presetReset')?.addEventListener('click', () => {
            darkPosSelect.value = 'near';
            controlSection.querySelector('#darkInt').value = -30;
            controlSection.querySelector('#darkIntVal').textContent = '-30';
            controlSection.querySelector('#darkRange').value = 50;
            controlSection.querySelector('#darkRangeVal').textContent = '50%';
            controlSection.querySelector('#darkFeather').value = 20;
            controlSection.querySelector('#darkFeatherVal').textContent = '20';
            lightPosSelect.value = 'far';
            controlSection.querySelector('#lightInt').value = 40;
            controlSection.querySelector('#lightIntVal').textContent = '40';
            controlSection.querySelector('#lightRange').value = 50;
            controlSection.querySelector('#lightRangeVal').textContent = '50%';
            controlSection.querySelector('#lightFeather').value = 20;
            controlSection.querySelector('#lightFeatherVal').textContent = '20';

            this.updateParameter('dark_position', 'near');
            this.updateParameter('dark_intensity', -30);
            this.updateParameter('dark_range', 50);
            this.updateParameter('dark_feather', 20);
            this.updateParameter('light_position', 'far');
            this.updateParameter('light_intensity', 40);
            this.updateParameter('light_range', 50);
            this.updateParameter('light_feather', 20);

            if (this.onInputsChange) this.onInputsChange();
            if (app.graph) app.graph.setDirtyCanvas(true, true);
            this.depthAdjustPanel.updatePreview();
        });

        this.depthAdjustPanel.updateFromWidgets = () => {
            const widgets = this.widgets || [];
            const getWidgetValue = (name) => {
                const w = widgets.find(w => w.name === name);
                return w ? w.value : null;
            };

            const darkPos = getWidgetValue('dark_position');
            const lightPos = getWidgetValue('light_position');

            if (darkPosSelect && darkPos) darkPosSelect.value = darkPos;
            if (lightPosSelect && lightPos) lightPosSelect.value = lightPos;

            const sliders = ['darkInt', 'lightInt', 'darkRange', 'lightRange', 'darkFeather', 'lightFeather'];
            const values = ['dark_intensity', 'light_intensity', 'dark_range', 'light_range', 'dark_feather', 'light_feather'];
            sliders.forEach((id, i) => {
                const slider = controlSection.querySelector('#' + id);
                const val = getWidgetValue(values[i]);
                if (slider && val !== null) slider.value = val;
            });
        };

        // 更新预览图
        this.depthAdjustPanel.updatePreview = () => {
            const panel = this.depthAdjustPanel;
            const widgets = this.widgets || [];
            const getWidgetValue = (name) => {
                const w = widgets.find(w => w.name === name);
                return w ? w.value : null;
            };

            const settings = {
                darkPosition: getWidgetValue('dark_position') || 'near',
                darkIntensity: getWidgetValue('dark_intensity') ?? -30,
                darkRange: getWidgetValue('dark_range') ?? 50,
                darkFeather: getWidgetValue('dark_feather') ?? 20,
                lightPosition: getWidgetValue('light_position') || 'far',
                lightIntensity: getWidgetValue('light_intensity') ?? 40,
                lightRange: getWidgetValue('light_range') ?? 50,
                lightFeather: getWidgetValue('light_feather') ?? 20
            };

            // 更新状态
            if (panel.statusOverlay) {
                const darkText = settings.darkPosition === 'near' ? '近' : '远';
                const lightText = settings.lightPosition === 'near' ? '近' : '远';
                panel.statusOverlay.innerHTML = `🌑 ${darkText}${settings.darkIntensity > 0 ? '+' : ''}${settings.darkIntensity} &nbsp;|&nbsp; ☀️ ${lightText}${settings.lightIntensity > 0 ? '+' : ''}${settings.lightIntensity}`;
            }

            if (!panel.inputImage || !panel.inputDepth) {
                return;
            }

            // 处理图像
            try {
                const img = panel.inputImage;
                const depthImg = panel.inputDepth;

                // 使用原图尺寸进行处理
                const w = img.width;
                const h = img.height;

                panel.hiddenCanvas.width = w;
                panel.hiddenCanvas.height = h;
                const ctx = panel.hiddenCtx;

                // 绘制原图
                ctx.drawImage(img, 0, 0, w, h);
                const imageData = ctx.getImageData(0, 0, w, h);

                // 绘制深度图
                const depthCanvas = document.createElement('canvas');
                depthCanvas.width = w;
                depthCanvas.height = h;
                const depthCtx = depthCanvas.getContext('2d');
                depthCtx.drawImage(depthImg, 0, 0, w, h);
                const depthImageData = depthCtx.getImageData(0, 0, w, h);

                // 提取深度数据
                const depthData = new Float32Array(w * h);
                for (let i = 0; i < depthData.length; i++) {
                    depthData[i] = depthImageData.data[i * 4 + 1] / 255;
                }

                // 应用效果
                const resultData = this.applyEffect(imageData, depthData, settings);
                ctx.putImageData(new ImageData(resultData, w, h), 0, 0);

                // 显示结果
                panel.previewImg.src = panel.hiddenCanvas.toDataURL('image/png', 1.0);

            } catch (e) {
                console.error('预览更新错误:', e);
            }
        };

        this.imageCheckInterval = setInterval(() => {
            if (this.loadInputImage_depth) this.loadInputImage_depth();
            if (this.loadInputDepth_depth) this.loadInputDepth_depth();
        }, 1000);

        setTimeout(() => this.depthAdjustPanel.updatePreview(), 200);
    },

    // 应用效果的辅助方法
    applyEffect(imageData, depthData, settings) {
        const { darkPosition, darkIntensity, darkRange, darkFeather, lightPosition, lightIntensity, lightRange, lightFeather } = settings;
        const data = imageData.data;
        const resultData = new Uint8ClampedArray(data);

        const applyAdjustment = (position, intensity, range, feather) => {
            if (intensity === 0 || range < 5) return;

            const rangePercent = range / 100;
            const featherFactor = feather / 50;

            for (let i = 0; i < data.length; i += 4) {
                const depth = depthData[i / 4];
                let mask = 0;

                if (position === "near") {
                    if (depth > (1 - rangePercent)) {
                        mask = (depth - (1 - rangePercent)) / rangePercent;
                    }
                } else {
                    if (depth < rangePercent) {
                        mask = 1 - (depth / rangePercent);
                    }
                }

                if (featherFactor > 0 && mask > 0) {
                    mask = Math.min(1, mask / (1 - featherFactor * 0.5 + featherFactor * 0.5 * mask));
                }

                if (mask > 0.01) {
                    const factor = 1 + (intensity / 100) * mask;
                    resultData[i] = Math.min(255, Math.max(0, data[i] * factor));
                    resultData[i + 1] = Math.min(255, Math.max(0, data[i + 1] * factor));
                    resultData[i + 2] = Math.min(255, Math.max(0, data[i + 2] * factor));
                }
            }
        };

        applyAdjustment(darkPosition, darkIntensity, darkRange, darkFeather);
        applyAdjustment(lightPosition, lightIntensity, lightRange, lightFeather);

        return resultData;
    }
});

Object.assign(LGraphNode.prototype, {
    loadInputImage_depth() {
        const panel = this.depthAdjustPanel;
        if (!panel) return;

        const imageInput = this.inputs?.find(input => input.name === "image");
        if (!imageInput || !imageInput.link) {
            panel.inputImage = null;
            panel.currentImageSrc = null;
            panel.previewImg.src = '';
            panel.previewImg.alt = '等待连接原图';
            return;
        }

        const link = app.graph.links[imageInput.link];
        if (!link) {
            panel.inputImage = null;
            panel.currentImageSrc = null;
            panel.previewImg.src = '';
            panel.previewImg.alt = '等待连接原图';
            return;
        }

        const sourceNode = app.graph.getNodeById(link.origin_id);
        if (!sourceNode) {
            panel.inputImage = null;
            panel.currentImageSrc = null;
            panel.previewImg.src = '';
            panel.previewImg.alt = '等待连接原图';
            return;
        }

        const src = this.findImageSource_depth(sourceNode);
        if (src && src !== panel.currentImageSrc) {
            panel.currentImageSrc = src;
            this.loadPreviewImage_depth(src, panel, false);
        }
    },

    loadInputDepth_depth() {
        const panel = this.depthAdjustPanel;
        if (!panel) return;

        const depthInput = this.inputs?.find(input => input.name === "depth_map");
        if (!depthInput || !depthInput.link) {
            panel.inputDepth = null;
            panel.currentDepthSrc = null;
            panel.updatePreview();
            return;
        }

        const link = app.graph.links[depthInput.link];
        if (!link) {
            panel.inputDepth = null;
            panel.currentDepthSrc = null;
            panel.updatePreview();
            return;
        }

        const sourceNode = app.graph.getNodeById(link.origin_id);
        if (!sourceNode) {
            panel.inputDepth = null;
            panel.currentDepthSrc = null;
            panel.updatePreview();
            return;
        }

        const src = this.findImageSource_depth(sourceNode);
        if (src && src !== panel.currentDepthSrc) {
            panel.currentDepthSrc = src;
            this.loadPreviewImage_depth(src, panel, true);
        }
    },

    findImageSource_depth(node, visited = new Set(), isDirectConnection = true) {
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

        if (node.inputs) {
            for (const input of node.inputs) {
                if (input.link && (input.type === "IMAGE" || input.name === "image" || input.name.toLowerCase().includes("image"))) {
                    const link = app.graph.links[input.link];
                    if (link) {
                        const upstreamNode = app.graph.getNodeById(link.origin_id);
                        if (upstreamNode) {
                            const result = this.findImageSource_depth(upstreamNode, visited, false);
                            if (result) return result;
                        }
                    }
                }
            }
        }
        return null;
    },

    loadPreviewImage_depth(src, panel, isDepth = false) {
        const img = new Image();
        img.crossOrigin = "anonymous";
        img.onload = () => {
            if (isDepth) {
                panel.inputDepth = img;
            } else {
                panel.inputImage = img;
            }
            panel.updatePreview();
        };
        img.onerror = () => {
            panel.updatePreview();
        };
        img.src = src;
    }
});
