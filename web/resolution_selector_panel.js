import { app } from "../../scripts/app.js";

// 分辨率预设配置
const PRESETS = {
    "klein": {
        "1:1": [
            {width: 1024, height: 1024},
            {width: 2048, height: 2048},
            {width: 4096, height: 4096}
        ],
        "3:2": [
            {width: 768, height: 512},
            {width: 1536, height: 1024},
            {width: 3072, height: 2048}
        ],
        "2:3": [
            {width: 688, height: 1027},
            {width: 1376, height: 2054},
            {width: 2752, height: 4108}
        ],
        "4:3": [
            {width: 768, height: 576},
            {width: 1536, height: 1152},
            {width: 3072, height: 2304}
        ],
        "3:4": [
            {width: 576, height: 768},
            {width: 1152, height: 1536},
            {width: 2304, height: 3072}
        ],
        "16:9": [
            {width: 768, height: 432},
            {width: 1536, height: 864},
            {width: 3072, height: 1728}
        ],
        "9:16": [
            {width: 576, height: 1024},
            {width: 1152, height: 2048},
            {width: 2304, height: 4096}
        ]
    },
    "banana": {
        "1:1": [
            {width: 1024, height: 1024},
            {width: 2048, height: 2048},
            {width: 4096, height: 4096}
        ],
        "21:9": [
            {width: 1584, height: 672},
            {width: 3168, height: 1344},
            {width: 6336, height: 2688}
        ],
        "3:4": [
            {width: 896, height: 1200},
            {width: 1792, height: 2400},
            {width: 3584, height: 4800}
        ],
        "4:3": [
            {width: 1200, height: 896},
            {width: 2400, height: 1792},
            {width: 4800, height: 3584}
        ],
        "9:16": [
            {width: 768, height: 1376},
            {width: 1536, height: 2752},
            {width: 3072, height: 5504}
        ],
        "16:9": [
            {width: 1376, height: 768},
            {width: 2752, height: 1536},
            {width: 5504, height: 3072}
        ],
        "2:3": [
            {width: 848, height: 1264},
            {width: 1696, height: 2528},
            {width: 3392, height: 5056}
        ],
        "3:2": [
            {width: 1264, height: 848},
            {width: 2528, height: 1696},
            {width: 5056, height: 3392}
        ],
        "4:5": [
            {width: 928, height: 1152},
            {width: 1856, height: 2304},
            {width: 3712, height: 4608}
        ],
        "5:4": [
            {width: 1152, height: 928},
            {width: 2304, height: 1856},
            {width: 4608, height: 3712}
        ]
    },
    "SDXL": {
        "1:1": [
            {width: 1024, height: 1024},
            {width: 768, height: 768}
        ],
        "3:2": [
            {width: 1216, height: 832},
            {width: 1152, height: 768}
        ],
        "2:3": [
            {width: 832, height: 1216},
            {width: 768, height: 1152}
        ],
        "4:3": [
            {width: 1344, height: 1024},
            {width: 1472, height: 1104}
        ],
        "3:4": [
            {width: 1024, height: 1344},
            {width: 1104, height: 1472}
        ],
        "16:9": [
            {width: 1536, height: 896},
            {width: 1920, height: 1080}
        ],
        "9:16": [
            {width: 896, height: 1536},
            {width: 1080, height: 1920}
        ]
    },
    "Flux": {
        "1:1": [
            {width: 1024, height: 1024},
            {width: 1280, height: 1280}
        ],
        "16:9": [
            {width: 1280, height: 768},
            {width: 1536, height: 960}
        ],
        "9:16": [
            {width: 768, height: 1280},
            {width: 960, height: 1536}
        ],
        "4:3": [
            {width: 1472, height: 1104}
        ],
        "3:4": [
            {width: 1104, height: 1472}
        ],
        "21:9": [
            {width: 2048, height: 896}
        ],
        "9:21": [
            {width: 896, height: 2048}
        ]
    },
    "Z-Image": {
        "1:1": [
            {width: 512, height: 512},
            {width: 768, height: 768},
            {width: 1024, height: 1024}
        ],
        "3:2": [
            {width: 768, height: 512},
            {width: 1152, height: 768}
        ],
        "2:3": [
            {width: 512, height: 768},
            {width: 768, height: 1152}
        ],
        "4:3": [
            {width: 1024, height: 768},
            {width: 1472, height: 1104}
        ],
        "3:4": [
            {width: 768, height: 1024},
            {width: 1104, height: 1472}
        ],
        "16:9": [
            {width: 1024, height: 576},
            {width: 1280, height: 720},
            {width: 1920, height: 1080}
        ],
        "9:16": [
            {width: 576, height: 1024},
            {width: 720, height: 1280},
            {width: 1080, height: 1920}
        ]
    },
    "Qwen-Image-2512": {
        "1:1": [
            {width: 1328, height: 1328}
        ],
        "16:9": [
            {width: 1664, height: 928}
        ],
        "9:16": [
            {width: 928, height: 1664}
        ],
        "4:3": [
            {width: 1472, height: 1104}
        ],
        "3:4": [
            {width: 1104, height: 1472}
        ]
    }
};

app.registerExtension({
    name: "reeeeePanel",

    async beforeRegisterNodeDef(nodeType, nodeData, app) {
        if (nodeData.name === "reeeee") {

            const onNodeCreated = nodeType.prototype.onNodeCreated;
            nodeType.prototype.onNodeCreated = function () {
                const r = onNodeCreated ? onNodeCreated.apply(this, arguments) : undefined;
                this.addResolutionSelectorPanel();
                setTimeout(() => {
                    if (this.setDirtyCanvas) this.setDirtyCanvas(true, true);
                    if (this.graph && this.graph.setDirtyCanvas) this.graph.setDirtyCanvas(true, true);
                }, 100);
                return r;
            };

            const onWidgetChanged = nodeType.prototype.onWidgetChanged;
            nodeType.prototype.onWidgetChanged = function(name, value, old_value, widget) {
                const r = onWidgetChanged ? onWidgetChanged.apply(this, arguments) : undefined;
                if (!this.resolutionSelectorPanel) return r;

                if (name === "category") {
                    this.updateRatioOptions(value);
                } else if (name === "ratio") {
                    this.updateSizeOptions(value);
                } else if (name === "size") {
                    this.updateResolutionDisplay();
                }
                return r;
            };

            nodeType.prototype.addResolutionSelectorPanel = function() {
                const panel = this;

                // 创建面板容器
                const container = document.createElement("div");
                container.style.cssText = `
                    width: 100%;
                    padding: 10px;
                    background: #2a2a2a;
                    border-radius: 8px;
                    font-family: Arial, sans-serif;
                `;

                // 类别选择
                const categoryRow = document.createElement("div");
                categoryRow.style.cssText = `
                    display: flex;
                    align-items: center;
                    margin-bottom: 10px;
                `;
                const categoryLabel = document.createElement("label");
                categoryLabel.style.cssText = `
                    color: #aaa;
                    font-size: 12px;
                    width: 60px;
                    flex-shrink: 0;
                `;
                categoryLabel.textContent = "类别:";
                const categorySelect = document.createElement("select");
                categorySelect.style.cssText = `
                    flex: 1;
                    padding: 6px 10px;
                    background: #333;
                    border: 1px solid #555;
                    color: #fff;
                    border-radius: 4px;
                    font-size: 12px;
                    cursor: pointer;
                `;
                Object.keys(PRESETS).forEach(cat => {
                    const option = document.createElement("option");
                    option.value = cat;
                    option.textContent = cat;
                    categorySelect.appendChild(option);
                });
                categoryRow.appendChild(categoryLabel);
                categoryRow.appendChild(categorySelect);
                container.appendChild(categoryRow);

                // 比例选择
                const ratioRow = document.createElement("div");
                ratioRow.style.cssText = `
                    display: flex;
                    align-items: center;
                    margin-bottom: 10px;
                `;
                const ratioLabel = document.createElement("label");
                ratioLabel.style.cssText = `
                    color: #aaa;
                    font-size: 12px;
                    width: 60px;
                    flex-shrink: 0;
                `;
                ratioLabel.textContent = "比例:";
                const ratioSelect = document.createElement("select");
                ratioSelect.style.cssText = `
                    flex: 1;
                    padding: 6px 10px;
                    background: #333;
                    border: 1px solid #555;
                    color: #fff;
                    border-radius: 4px;
                    font-size: 12px;
                    cursor: pointer;
                `;
                ratioRow.appendChild(ratioLabel);
                ratioRow.appendChild(ratioSelect);
                container.appendChild(ratioRow);

                // 尺寸选择
                const sizeRow = document.createElement("div");
                sizeRow.style.cssText = `
                    display: flex;
                    align-items: center;
                    margin-bottom: 10px;
                `;
                const sizeLabel = document.createElement("label");
                sizeLabel.style.cssText = `
                    color: #aaa;
                    font-size: 12px;
                    width: 60px;
                    flex-shrink: 0;
                `;
                sizeLabel.textContent = "尺寸:";
                const sizeSelect = document.createElement("select");
                sizeSelect.style.cssText = `
                    flex: 1;
                    padding: 6px 10px;
                    background: #333;
                    border: 1px solid #555;
                    color: #fff;
                    border-radius: 4px;
                    font-size: 12px;
                    cursor: pointer;
                `;
                sizeRow.appendChild(sizeLabel);
                sizeRow.appendChild(sizeSelect);
                container.appendChild(sizeRow);

                // 绑定到节点
                this.resolutionSelectorPanel = container;
                this.categorySelect = categorySelect;
                this.ratioSelect = ratioSelect;
                this.sizeSelect = sizeSelect;

                // 添加到节点
                if (this.widgets) {
                    const lastWidget = this.widgets[this.widgets.length - 1];
                    if (lastWidget && lastWidget.element) {
                        lastWidget.element.parentNode.insertBefore(container, lastWidget.element.nextSibling);
                    } else {
                        this.addDOMWidget("resolution_panel", "resolution_panel", container);
                    }
                }

                // 初始化选项
                const categoryWidget = this.widgets?.find(w => w.name === "category");
                const ratioWidget = this.widgets?.find(w => w.name === "ratio");
                const sizeWidget = this.widgets?.find(w => w.name === "size");

                const category = categoryWidget?.value || "SDXL";
                const savedRatio = ratioWidget?.value;
                const savedSize = sizeWidget?.value;

                categorySelect.value = category;
                this.updateRatioOptions(category, true, savedRatio, savedSize);

                // 绑定事件
                categorySelect.addEventListener("change", (e) => {
                    this.updateRatioOptions(e.target.value);
                    this.updateParameter("category", e.target.value);
                });

                ratioSelect.addEventListener("change", (e) => {
                    this.updateSizeOptions(e.target.value);
                    this.updateParameter("ratio", e.target.value);
                });

                sizeSelect.addEventListener("change", (e) => {
                    this.updateResolutionDisplay();
                    this.updateParameter("size", e.target.value);
                });
            };

            // 添加 updateParameter 方法
            nodeType.prototype.updateParameter = function(name, value) {
                const widget = this.widgets?.find(w => w.name === name);
                if (widget && widget.value !== value) {
                    widget.value = value;

                    // 触发节点更新
                    if (this.onInputsChange) {
                        this.onInputsChange();
                    }

                    // 标记图形需要重绘
                    if (app.graph) {
                        app.graph.setDirtyCanvas(true, false);
                    }
                }
            };

            nodeType.prototype.updateRatioOptions = function(category, skipSelect = false, savedRatio = null, savedSize = null) {
                if (!this.ratioSelect || !this.categorySelect) return;

                const preset = category || this.categorySelect.value;
                const presetConfig = PRESETS[preset];
                if (!presetConfig) return;

                this.ratioSelect.innerHTML = "";
                Object.keys(presetConfig).forEach(ratio => {
                    const option = document.createElement("option");
                    option.value = ratio;
                    option.textContent = ratio;
                    this.ratioSelect.appendChild(option);
                });

                // 恢复保存的比例或选择第一个
                if (savedRatio && Array.from(this.ratioSelect.options).some(opt => opt.value === savedRatio)) {
                    this.ratioSelect.value = savedRatio;
                } else if (!skipSelect && this.ratioSelect.options.length > 0) {
                    this.ratioSelect.selectedIndex = 0;
                }

                // 同步到widget并更新尺寸
                const ratioWidget = this.widgets?.find(w => w.name === "ratio");
                if (ratioWidget) {
                    const validRatio = this.ratioSelect.value;
                    ratioWidget.value = validRatio;
                    this.updateParameter("ratio", validRatio);
                    this.updateSizeOptions(validRatio, skipSelect, savedSize);
                }

                // 触发重绘
                setTimeout(() => {
                    if (this.setDirtyCanvas) this.setDirtyCanvas(true, true);
                }, 50);
            };

            nodeType.prototype.updateSizeOptions = function(ratio, skipSelect = false, savedSize = null) {
                if (!this.sizeSelect || !this.ratioSelect || !this.categorySelect) return;

                const preset = this.categorySelect.value;
                const selectedRatio = ratio || this.ratioSelect.value;
                const presetConfig = PRESETS[preset];
                if (!presetConfig || !presetConfig[selectedRatio]) return;

                this.sizeSelect.innerHTML = "";
                presetConfig[selectedRatio].forEach(size => {
                    const option = document.createElement("option");
                    option.value = `${size.width}x${size.height}`;
                    option.textContent = `${size.width} × ${size.height}`;
                    option.dataset.width = size.width;
                    option.dataset.height = size.height;
                    this.sizeSelect.appendChild(option);
                });

                // 恢复保存的尺寸或选择第一个
                if (savedSize && Array.from(this.sizeSelect.options).some(opt => opt.value === savedSize)) {
                    this.sizeSelect.value = savedSize;
                } else if (!skipSelect && this.sizeSelect.options.length > 0) {
                    this.sizeSelect.selectedIndex = 0;
                }

                // 同步到widget
                const sizeWidget = this.widgets?.find(w => w.name === "size");
                if (sizeWidget) {
                    const validSize = this.sizeSelect.value;
                    sizeWidget.value = validSize;
                    this.updateParameter("size", validSize);
                    this.updateResolutionDisplay();
                }

                // 触发重绘
                setTimeout(() => {
                    if (this.setDirtyCanvas) this.setDirtyCanvas(true, true);
                }, 50);
            };

            nodeType.prototype.updateResolutionDisplay = function() {
                // 显示区域已移除，保留空实现避免调用报错
            };
        }
    },
});
