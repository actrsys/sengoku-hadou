/**
 * ui_slider.js
 * 数量指定（スライダー）や部隊分割の画面を管理するファイルです
 */
class UISliderManager {
    constructor(ui, game) {
        this.ui = ui;
        this.game = game;
        this._unitDivideUiRaf = 0;
        this._unitDivideScrollbarRaf = 0;
    }

    cancelUnitDivideDeferredUpdates() {
        const cancel = (handle) => {
            if (!handle) return;
            if (typeof window !== 'undefined' && typeof window.cancelAnimationFrame === 'function') {
                window.cancelAnimationFrame(handle);
            } else {
                clearTimeout(handle);
            }
        };
        cancel(this._unitDivideUiRaf);
        cancel(this._unitDivideScrollbarRaf);
        this._unitDivideUiRaf = 0;
        this._unitDivideScrollbarRaf = 0;
    }

    // ==========================================
    // ★数量選択（スライダー）の魔法です！
    // ==========================================
    openQuantitySelector(type, data, targetId, extraData = null) {
        if (!this.ui.quantityModal) return;

        // 武将選択の子として開く数量画面では、親一覧を状態ごと一時退避します。
        // 子から戻る時は再生成せずそのまま復帰し、確定時だけ親の選択セッションを終了します。
        const wantsParentSelector = !!(extraData && extraData.returnToParentSelector);
        const parentSelectorSuspended = wantsParentSelector
            && this.ui.info
            && typeof this.ui.info.suspendCommonModalForChild === 'function'
            && this.ui.info.suspendCommonModalForChild();
        // UI遷移専用フラグをゲームロジック側へ渡さないよう、実行用データからは取り除きます。
        let selectionExtraData = extraData;
        if (extraData && Object.prototype.hasOwnProperty.call(extraData, 'returnToParentSelector')) {
            selectionExtraData = { ...extraData };
            delete selectionExtraData.returnToParentSelector;
        }
        const quantityOwnsAIGuardHide = !parentSelectorSuspended;
        if (quantityOwnsAIGuardHide) this.ui.hideAIGuardTemporarily();
        
        // ★追加：複数スライダーの時だけ全画面にするための目印をつけます
        const multiSliderTypes = new Set(['war_supplies', 'def_intercept', 'def_reinf_supplies', 'atk_reinf_supplies', 'def_self_reinf_supplies', 'atk_self_reinf_supplies', 'transport']);
        const isMultiMode = multiSliderTypes.has(type);
        if (isMultiMode) {
            this.ui.quantityModal.classList.add('multi-slider-mode');
        } else {
            this.ui.quantityModal.classList.remove('multi-slider-mode');
        }

        this.ui.quantityModal.classList.remove('hidden'); 
        if (this.ui.quantityContainer) this.ui.quantityContainer.innerHTML = '';
        if (this.ui.charityTypeSelector) this.ui.charityTypeSelector.classList.add('hidden');
        if (this.ui.tradeTypeInfo) this.ui.tradeTypeInfo.classList.add('hidden'); 
        const c = this.ui.currentCastle;

        // ★Round12：input中に同じ武将やDOMを全件検索しないため、この画面を開いた時に一度だけ保持します。
        const daimyo = this.game.getClanDaimyo(c.ownerClan);
        const castellan = this.game.getBusho(c.castellanId);
        let inputs = {};
        const sliderRefs = new Map();
        const stockEls = {};

        let sourceCastleForMulti = c;
        if (type === 'def_intercept') sourceCastleForMulti = (data && data.length > 0) ? data[0] : c;
        if (type === 'def_reinf_supplies' || type === 'atk_reinf_supplies' || type === 'def_self_reinf_supplies' || type === 'atk_self_reinf_supplies') {
            sourceCastleForMulti = (data && data.length > 0) ? data[0] : c;
        }

        const getSliderValue = (id) => {
            const ref = sliderRefs.get(id);
            return parseInt(ref && ref.num ? ref.num.value : 0) || 0;
        };

        // ★追加：相場の説明文と、動的な数値表示用の箱を作る処理を一元管理します！
        const setTradeRateInfo = (itemName, unit, amount, price, extraHTML = "", needCostDiv = true) => {
            this.ui.tradeTypeInfo.classList.remove('hidden');
            this.ui.tradeTypeInfo.innerHTML = `${itemName} <span class="slider-emphasis">${amount}</span>${unit} ＝ 金 <span class="slider-emphasis">${price}</span>${extraHTML ? ' ' + extraHTML : ''}`;
            
            // スライダーと一緒に数字が変わる計算用の箱も、ここで自動的に作ってしまいます
            if (needCostDiv) {
                const costDiv = document.createElement('div');
                costDiv.id = 'dynamic-cost-display';
                this.ui.quantityContainer.appendChild(costDiv);
            }
        };

        const checkValidQuantity = () => {
            if (!this.ui.quantityConfirmBtn) return;
            let isValid = true;

            if (type === 'transport') {
                const g = getSliderValue('gold');
                const r = getSliderValue('rice');
                const s = getSliderValue('soldiers');
                const h = getSliderValue('horses');
                const gun = getSliderValue('guns');
                if (g === 0 && r === 0 && s === 0 && h === 0 && gun === 0) isValid = false;
            } else if (type === 'headhunt_gold' || type === 'charity' || type === 'reinf_gold') {
                isValid = true; 
            } else if (type === 'war_supplies' || type === 'def_intercept' || type === 'def_reinf_supplies' || type === 'atk_reinf_supplies') {
                const s = getSliderValue('soldiers');
                if (s <= 0) isValid = false; 
            } else {
                const firstRef = sliderRefs.values().next().value;
                if (firstRef && firstRef.num) {
                    const val = parseInt(firstRef.num.value) || 0;
                    if (val <= 0) isValid = false;
                }
            }

            if (isValid) {
                this.ui.quantityConfirmBtn.disabled = false;
                this.ui.quantityConfirmBtn.style.opacity = 1.0;
            } else {
                this.ui.quantityConfirmBtn.disabled = true;
                this.ui.quantityConfirmBtn.style.opacity = 0.5;
            }

            // ★追加：複数スライダーの時の、上部の「残数」表示をパタパタ更新します！
            if (isMultiMode) {
                const updateStock = (id, baseVal) => {
                    const el = stockEls[id];
                    if (el) el.textContent = baseVal - getSliderValue(id);
                };
                updateStock('gold', sourceCastleForMulti.gold);
                updateStock('rice', sourceCastleForMulti.rice);
                updateStock('soldiers', sourceCastleForMulti.soldiers);
                updateStock('horses', sourceCastleForMulti.horses || 0);
                updateStock('guns', sourceCastleForMulti.guns || 0);
            }

            // ★追加：スライダーを動かすたびに呼ばれるこの場所で、必要資金を計算してパタパタ表示します！
            const displayEl = document.getElementById('dynamic-cost-display');
            if (displayEl) {
                const makeGrid = (itemName, afterItem, afterGold) => {
                    return `
                        <div class="trade-result-row">
                            <div class="trade-result-item">
                                <div class="trade-result-label">金</div>
                                <div class="trade-arrow-group">
                                    <div class="trade-arrow-shape"></div>
                                    <div class="trade-arrow-shape"></div>
                                </div>
                                <div class="trade-result-value">${Math.floor(afterGold)}</div>
                            </div>
                            <div class="trade-result-item">
                                <div class="trade-result-label">${itemName}</div>
                                <div class="trade-arrow-group">
                                    <div class="trade-arrow-shape"></div>
                                    <div class="trade-arrow-shape"></div>
                                </div>
                                <div class="trade-result-value">${Math.floor(afterItem)}</div>
                            </div>
                        </div>
                    `;
                };
                
                if (type === 'draft') {
                    const amount = getSliderValue('soldiers');
                    const busho = this.game.getBusho(data[0]);
                    const cost = DomesticRules.calcDraftCost(amount, busho, c.peoplesLoyalty, c.population);
                    displayEl.innerHTML = makeGrid("兵士", c.soldiers + amount, c.gold - cost);
                } else if (['buy_rice', 'buy_ammo', 'buy_horses', 'buy_guns'].includes(type)) {
                    // ★取引の計算は、すべて EconomyRules の窓口にお願いするだけになりました！
                    const amount = getSliderValue('amount');
                    const tradeData = EconomyRules.calcTradeCostAndRate(type, amount, c, daimyo, castellan, this.game.provinces, this.game);
                    const itemName = type === 'buy_rice' ? "兵糧" : (type === 'buy_ammo' ? "矢弾" : (type === 'buy_horses' ? "軍馬" : "鉄砲"));
                    const currentItem = type === 'buy_rice' ? c.rice : (type === 'buy_ammo' ? (c.ammo || 0) : (type === 'buy_horses' ? (c.horses || 0) : (c.guns || 0)));
                    displayEl.innerHTML = makeGrid(itemName, currentItem + amount, c.gold - tradeData.cost);
                } else if (type === 'sell_rice') {
                    const amount = getSliderValue('amount');
                    const tradeData = EconomyRules.calcTradeCostAndRate(type, amount, c, daimyo, castellan, this.game.provinces, this.game);
                    displayEl.innerHTML = makeGrid("兵糧", c.rice - amount, c.gold + tradeData.cost);
                }
            }
        };

        // ★Round12：連続inputによる料金・残数・確認ボタン更新を1フレーム1回にまとめます。
        let quantityUiRaf = 0;
        const scheduleQuantityUIUpdate = () => {
            if (quantityUiRaf) return;
            const raf = window.requestAnimationFrame || ((cb) => setTimeout(cb, 16));
            quantityUiRaf = raf(() => {
                quantityUiRaf = 0;
                checkValidQuantity();
            });
        };
        const cancelQuantityUIUpdate = () => {
            if (!quantityUiRaf) return;
            if (window.cancelAnimationFrame) window.cancelAnimationFrame(quantityUiRaf);
            else clearTimeout(quantityUiRaf);
            quantityUiRaf = 0;
        };
        
        const createSlider = (label, id, max, currentVal, minVal = 0, isTransport = false, targetCurrent = 0, targetMaxLimit = 99999) => {
            const wrap = document.createElement('div');
            wrap.className = 'qty-row';
            
            const isSingle = !isMultiMode;
            
            // ボタンの位置と表示を自動で切り替える仕組み
            const updateButtons = (v) => {
                const bMin = wrap.querySelector(`#btn-min-${id}`);
                const bHalf = wrap.querySelector(`#btn-half-${id}`);
                const bMax = wrap.querySelector(`#btn-max-${id}`);
                const currentMax = isTransport ? Math.min(max, targetMaxLimit - targetCurrent) : max;
                const currentMin = isTransport ? 0 : minVal;

                // 変更できない状態（0の時など）
                if (currentMax <= currentMin) {
                    if (bMin) { bMin.style.display = ''; bMin.disabled = true; bMin.style.order = 1; }
                    if (bHalf) { bHalf.style.display = ''; bHalf.disabled = true; bHalf.style.order = 3; }
                    if (bMax) { bMax.style.display = 'none'; }
                    return;
                }

                if (v <= currentMin) {
                    // 最小の時：「最小(無効)」ゲージ「半分(有効)」を表示
                    if (bMin) { bMin.style.display = ''; bMin.disabled = true; bMin.style.order = 1; }
                    if (bHalf) { bHalf.style.display = ''; bHalf.disabled = false; bHalf.style.order = 3; }
                    if (bMax) { bMax.style.display = 'none'; }
                } else if (v >= currentMax) {
                    // 最大の時：「半分(有効)」ゲージ「最大(無効)」を表示
                    if (bMin) { bMin.style.display = 'none'; }
                    if (bHalf) { bHalf.style.display = ''; bHalf.disabled = false; bHalf.style.order = 1; }
                    if (bMax) { bMax.style.display = ''; bMax.disabled = true; bMax.style.order = 3; }
                } else {
                    // 中間の時：「最小(有効)」ゲージ「最大(有効)」を表示
                    if (bMin) { bMin.style.display = ''; bMin.disabled = false; bMin.style.order = 1; }
                    if (bHalf) { bHalf.style.display = 'none'; }
                    if (bMax) { bMax.style.display = ''; bMax.disabled = false; bMax.style.order = 3; }
                }
            };
            
            if (isTransport) {
                const actualMaxTransport = Math.min(max, targetMaxLimit - targetCurrent);
                wrap.innerHTML = `
                    <div class="slider-row-label">${label}</div>
                    <div class="qty-control">
                        <button class="qty-shortcut-btn qty-pos-start" id="btn-min-${id}">最小</button>
                        <button class="qty-shortcut-btn qty-pos-end" id="btn-half-${id}">半分</button>
                        <input class="qty-range-main" type="range" id="range-${id}" min="0" max="${actualMaxTransport}" value="0">
                        <button class="qty-shortcut-btn qty-pos-end" id="btn-max-${id}">最大</button>
                        <input class="qty-number-end" type="number" id="num-tgt-${id}" min="${targetCurrent}" max="${targetCurrent + actualMaxTransport}" value="${targetCurrent}">
                        <input type="hidden" id="num-${id}" value="0">
                    </div>
                `;
                
                const range = wrap.querySelector(`#range-${id}`);
                const numTgt = wrap.querySelector(`#num-tgt-${id}`);
                const numHidden = wrap.querySelector(`#num-${id}`);
                sliderRefs.set(id, { range, num: numHidden, numTgt });
                
                // ★追加：見た目（青銀のゲージ）と数字を同時に更新する専用の魔法です
                const updateSliderUI = (v) => {
                    // 現在の値が全体の何％にあたるかを計算して、CSSに教えます
                    const percent = actualMaxTransport > 0 ? (v / actualMaxTransport) * 100 : 0;
                    range.style.setProperty('--value', percent + '%');
                    range.value = v;
                    numHidden.value = v;
                    numTgt.value = targetCurrent + v;
                    updateButtons(v);
                    scheduleQuantityUIUpdate();
                };

                const setVal = (v) => {
                    if (v < 0) v = 0;
                    if (v > actualMaxTransport) v = actualMaxTransport;
                    updateSliderUI(v);
                };

                wrap.querySelector(`#btn-min-${id}`).onclick = () => setVal(0);
                wrap.querySelector(`#btn-half-${id}`).onclick = () => setVal(Math.floor(actualMaxTransport / 2));
                wrap.querySelector(`#btn-max-${id}`).onclick = () => setVal(actualMaxTransport);

                const rangeHandler = (e) => { 
                    let v = parseInt(range.value);
                    
                    // ★修正：動かしている最中から常にキリの良い数字に合わせるように元に戻します
                    if (v > 0 && v < actualMaxTransport) { 
                        if (actualMaxTransport <= 999) {
                            v = Math.round(v / 10) * 10; 
                        } else {
                            v = Math.round(v / 100) * 100; 
                        }
                    }
                    
                    if (v > actualMaxTransport) v = actualMaxTransport;
                    if (v < 0) v = 0;
                    updateSliderUI(v);
                };
                range.oninput = rangeHandler;
                range.onchange = rangeHandler;

                // ★追加：スライダーを触っている間は、スクロール等が行われないようにバリアを張ります
                range.addEventListener('touchstart', (e) => e.stopPropagation(), { passive: true });
                range.addEventListener('touchmove', (e) => e.stopPropagation(), { passive: true });

                const numTgtHandler = () => {
                    let v = parseInt(numTgt.value);
                    if (isNaN(v)) return;
                    if (v < targetCurrent) v = targetCurrent;
                    if (v > targetCurrent + actualMaxTransport) v = targetCurrent + actualMaxTransport;
                    const transAmount = v - targetCurrent;
                    updateSliderUI(transAmount);
                };
                numTgt.oninput = numTgtHandler;
                numTgt.onchange = numTgtHandler; // ★スマホで指を離した時の最終確認
                
                updateSliderUI(0);
                this.ui.quantityContainer.appendChild(wrap);
                return { range, num: numHidden };
                
            } else {
                // isSingle（単体か複数か）に関わらず、全て同じ黄色い文字のデザインに統一します！
                wrap.innerHTML = `
                    <div class="slider-row-label">${label}</div>
                    <div class="qty-control">
                        <button class="qty-shortcut-btn qty-pos-start" id="btn-min-${id}">最小</button>
                        <button class="qty-shortcut-btn qty-pos-end" id="btn-half-${id}">半分</button>
                        <input class="qty-range-main" type="range" id="range-${id}" min="${minVal}" max="${max}" value="${currentVal}">
                        <button class="qty-shortcut-btn qty-pos-end" id="btn-max-${id}">最大</button>
                        <input class="qty-number-end" type="number" id="num-${id}" min="${minVal}" max="${max}" value="${currentVal}">
                    </div>
                `;
                
                const range = wrap.querySelector(`#range-${id}`);
                const num = wrap.querySelector(`#num-${id}`);
                sliderRefs.set(id, { range, num });
                
                const updateSliderUI = (v) => {
                    const percent = max > minVal ? ((v - minVal) / (max - minVal)) * 100 : 0;
                    range.style.setProperty('--value', percent + '%');
                    range.value = v;
                    num.value = v;
                    updateButtons(v);
                    scheduleQuantityUIUpdate();
                };

                const setVal = (v) => {
                    let actualMax = parseInt(range.max);
                    if (v < minVal) v = minVal;
                    if (v > actualMax) v = actualMax;
                    updateSliderUI(v);
                };

                wrap.querySelector(`#btn-min-${id}`).onclick = () => setVal(minVal);
                wrap.querySelector(`#btn-half-${id}`).onclick = () => setVal(Math.floor((minVal + max) / 2));
                wrap.querySelector(`#btn-max-${id}`).onclick = () => setVal(max);

                const rangeHandler = (e) => { 
                    let v = parseInt(range.value);
                    
                    // ★修正：動かしている最中から常にキリの良い数字に合わせるように元に戻します
                    if (v > minVal && v < max) { 
                        if (max <= 999) {
                            v = Math.round(v / 10) * 10; 
                        } else {
                            v = Math.round(v / 100) * 100; 
                        }
                    }
                    
                    if (v > max) v = max;
                    if (v < minVal) v = minVal;
                    updateSliderUI(v);
                };
                range.oninput = rangeHandler;
                range.onchange = rangeHandler; 

                // ★追加：スライダーを触っている間は、スクロール等が行われないようにバリアを張ります
                range.addEventListener('touchstart', (e) => e.stopPropagation(), { passive: true });
                range.addEventListener('touchmove', (e) => e.stopPropagation(), { passive: true });

                const numHandler = () => {
                    let v = parseInt(num.value);
                    if (isNaN(v)) return;
                    if (v < minVal) v = minVal;
                    if (v > max) v = max;
                    updateSliderUI(v);
                };
                num.oninput = numHandler;
                num.onchange = numHandler; // ★スマホで指を離した時の最終確認

                updateSliderUI(currentVal);
                this.ui.quantityContainer.appendChild(wrap);
                return { range, num };
            }
        };

        // ★今回追加：複数スライダー画面のための「上部の物資・残数表示」
        const isMultiSliderMode = isMultiMode;

        if (isMultiSliderMode) {
            const stockDiv = document.createElement('div');
            stockDiv.className = 'slider-stock-info'; // ★CSSに任せる名札
            stockDiv.innerHTML = `
                <div class="stock-grid">
                    <div class="stock-item"><span class="stock-label">金</span><span id="multi-stock-gold">${sourceCastleForMulti.gold}</span></div>
                    <div class="stock-item"><span class="stock-label">兵糧</span><span id="multi-stock-rice">${sourceCastleForMulti.rice}</span></div>
                    <div class="stock-item"><span class="stock-label">兵士</span><span id="multi-stock-soldiers">${sourceCastleForMulti.soldiers}</span></div>
                    <div class="stock-item"><span class="stock-label">軍馬</span><span id="multi-stock-horses">${sourceCastleForMulti.horses || 0}</span></div>
                    <div class="stock-item"><span class="stock-label">鉄砲</span><span id="multi-stock-guns">${sourceCastleForMulti.guns || 0}</span></div>
                </div>
            `;
            this.ui.quantityContainer.appendChild(stockDiv);
            ['gold', 'rice', 'soldiers', 'horses', 'guns'].forEach(id => {
                stockEls[id] = stockDiv.querySelector(`#multi-stock-${id}`);
            });
        }
        
        if (type === 'draft') {
            document.getElementById('quantity-title').textContent = "徴兵"; 
            const busho = this.game.getBusho(data[0]);
            
            // ★徴兵の最大可能数はルールブックに聞くだけ！
            const realMaxBuy = DomesticRules.calcMaxDraftAmount(c, busho);
            
            // ★変更：「単価」の計算もGameSystemの窓口にお願いするようにしました！
            const singleCost = DomesticRules.calcDraftUnitPrice(busho, c.peoplesLoyalty, c.population);
            setTradeRateInfo("兵士", "人", 1, singleCost.toFixed(1));
            
            inputs.soldiers = createSlider("兵士数", "soldiers", realMaxBuy, 0);
            
        } else if (type === 'charity') {
            document.getElementById('quantity-title').textContent = "施し"; this.ui.charityTypeSelector.classList.remove('hidden'); const count = data.length; this.ui.quantityContainer.innerHTML = `<p>選択武将: ${count}名</p>`;
        } else if (type === 'goodwill') {
            document.getElementById('quantity-title').textContent = "贈与金指定"; 
            const maxGoodwillGold = Math.max(200, Math.min(1500, c.gold));
            inputs.gold = createSlider("金", "gold", maxGoodwillGold, 200, 200);
        } else if (type === 'headhunt_gold') {
            document.getElementById('quantity-title').textContent = "持参金（任意）"; inputs.gold = createSlider("金", "gold", c.gold, 0);
        } else if (type === 'reinf_gold') {
            document.getElementById('quantity-title').textContent = "使者に持たせる金（最大1500）"; 
            const baseCastle = (data && data.length > 0) ? data[0] : c;
            const maxGold = Math.min(1500, baseCastle.gold);
            inputs.gold = createSlider("持参金", "gold", maxGold, 0);
        } else if (type === 'tribute_gold') {
            document.getElementById('quantity-title').textContent = "献上金（最大1500）"; 
            const maxTributeGold = Math.max(200, Math.min(1500, c.gold));
            inputs.gold = createSlider("金", "gold", maxTributeGold, 200, 200);
        } else if (type === 'war_supplies') {
            document.getElementById('quantity-title').textContent = "出陣用意"; 
            inputs.soldiers = createSlider("兵士", "soldiers", c.soldiers, c.soldiers);
            inputs.rice = createSlider("兵糧", "rice", c.rice, c.rice);
            inputs.horses = createSlider("軍馬", "horses", c.horses, 0);
            inputs.guns = createSlider("鉄砲", "guns", c.guns, 0);
        } else if (type === 'def_intercept') { 
            const interceptCastle = (data && data.length > 0) ? data[0] : c;
            document.getElementById('quantity-title').textContent = "迎撃部隊編成"; 
            inputs.soldiers = createSlider("兵士", "soldiers", interceptCastle.soldiers, interceptCastle.soldiers);
            inputs.rice = createSlider("兵糧", "rice", interceptCastle.rice, interceptCastle.rice);
            inputs.horses = createSlider("軍馬", "horses", interceptCastle.horses || 0, 0);
            inputs.guns = createSlider("鉄砲", "guns", interceptCastle.guns || 0, 0);
        } else if (type === 'def_reinf_supplies' || type === 'atk_reinf_supplies' || type === 'def_self_reinf_supplies' || type === 'atk_self_reinf_supplies') { 
            const helperCastle = (data && data.length > 0) ? data[0] : c;
            let titleText = "";
            if (type === 'def_reinf_supplies') titleText = "守備援軍の部隊編成";
            else if (type === 'atk_reinf_supplies') titleText = "攻撃援軍の部隊編成";
            else if (type === 'def_self_reinf_supplies') titleText = "守備自軍援軍の部隊編成";
            else if (type === 'atk_self_reinf_supplies') titleText = "攻撃自軍援軍の部隊編成";
            document.getElementById('quantity-title').textContent = titleText;
            inputs.soldiers = createSlider("兵士", "soldiers", helperCastle.soldiers, helperCastle.soldiers, 500);
            inputs.rice = createSlider("兵糧", "rice", helperCastle.rice, helperCastle.rice, 500);
            inputs.horses = createSlider("軍馬", "horses", helperCastle.horses || 0, 0, 0);
            inputs.guns = createSlider("鉄砲", "guns", helperCastle.guns || 0, 0, 0);
        } else if (type === 'transport') {
            document.getElementById('quantity-title').textContent = "輸送";
            
            const header = document.createElement('div');
            header.className = 'qty-row transport-column-header';
            header.innerHTML = `
                <div class="slider-row-label is-visually-hidden">ダミー</div>
                <div class="qty-control">
                    <button class="qty-shortcut-btn qty-pos-start is-control-placeholder">空</button>
                    <div class="qty-header-spacer"></div>
                    <button class="qty-shortcut-btn qty-pos-end is-control-placeholder">空</button>
                    <div class="qty-target-header">輸送先</div>
                </div>
            `;
            this.ui.quantityContainer.appendChild(header);

            const tCastle = this.game.getCastle(targetId); 
            
            inputs.gold = createSlider("金", "gold", c.gold, 0, 0, true, tCastle.gold, 99999);
            inputs.rice = createSlider("兵糧", "rice", c.rice, 0, 0, true, tCastle.rice, 99999);
            inputs.soldiers = createSlider("兵士", "soldiers", c.soldiers, 0, 0, true, tCastle.soldiers, 99999);
            inputs.horses = createSlider("軍馬", "horses", c.horses || 0, 0, 0, true, tCastle.horses || 0, 99999);
            inputs.guns = createSlider("鉄砲", "guns", c.guns || 0, 0, 0, true, tCastle.guns || 0, 99999);
            
        } else if (['buy_rice', 'sell_rice', 'buy_ammo', 'buy_horses', 'buy_guns'].includes(type)) {
            // ★取引の処理は、この一箇所にすべてまとまりました！
            const itemNameMap = { buy_rice: "兵糧", sell_rice: "兵糧", buy_ammo: "矢弾", buy_horses: "軍馬", buy_guns: "鉄砲" };
            const unitMap = { buy_rice: "", sell_rice: "", buy_ammo: "個", buy_horses: "頭", buy_guns: "挺" };
            const labelMap = { buy_rice: "兵糧購入", sell_rice: "兵糧売却", buy_ammo: "矢弾購入", buy_horses: "軍馬購入", buy_guns: "鉄砲購入" };
            const sliderLabelMap = { buy_rice: "購入量", sell_rice: "売却量", buy_ammo: "購入量", buy_horses: "購入量", buy_guns: "購入量" };
            
            document.getElementById('quantity-title').textContent = labelMap[type];
            
            // ★最大可能数をルールブックに聞きます
            const realMaxAmount = EconomyRules.calcMaxTradeAmount(type, c, daimyo, castellan, this.game.provinces, this.game);
            
            // レート表示。米相場だけは「金1＝兵糧X.X」という共通定義をそのまま表示します。
            const checkAmount = 1;
            const tradeData = EconomyRules.calcTradeCostAndRate(type, checkAmount, c, daimyo, castellan, this.game.provinces, this.game);

            let extraStr = "";
            if (type === 'buy_rice' || type === 'sell_rice') {
                extraStr = `（取引上限：<span class="slider-emphasis">${c.tradeLimit || 0}</span>）`;
                const rateInfo = EconomyRules.getRiceActualRate(type, c, this.game.provinces, this.game);
                this.ui.tradeTypeInfo.classList.remove('hidden');
                this.ui.tradeTypeInfo.innerHTML = `${EconomyRules.formatRiceMarketRate(rateInfo.ricePerGold)} ${extraStr}`;
                const costDiv = document.createElement('div');
                costDiv.id = 'dynamic-cost-display';
                this.ui.quantityContainer.appendChild(costDiv);
            } else {
                // 矢弾は計算結果の箱を使っていないため、最後の引数に false を渡して箱作りをオフにします
                const needCostDiv = type !== 'buy_ammo';
                setTradeRateInfo(itemNameMap[type], unitMap[type], checkAmount, tradeData.rateStr, extraStr, needCostDiv);
            }

            inputs.amount = createSlider(sliderLabelMap[type], "amount", realMaxAmount, 0);
        }
        
        checkValidQuantity(); 

        const closeQuantityModal = () => {
            // input直後に予約された旧画面の更新が、次に開いた数量画面へ遅れて当たらないよう破棄します。
            cancelQuantityUIUpdate();
            this.ui.quantityModal.classList.add('hidden');
            if (quantityOwnsAIGuardHide) this.ui.restoreAIGuard();
            if (this.ui.quantityConfirmBtn) {
                this.ui.quantityConfirmBtn.disabled = false;
                this.ui.quantityConfirmBtn.style.opacity = 1.0;
            }
        };

        this.ui.quantityConfirmBtn.onclick = () => {
            closeQuantityModal();
            if (parentSelectorSuspended && this.ui.info && typeof this.ui.info.closeCommonModal === 'function') {
                this.ui.info.closeCommonModal();
            }
            if (extraData && extraData.onConfirm) {
                extraData.onConfirm(inputs);
            } else {
                this.game.commandSystem.handleQuantitySelection(type, inputs, targetId, data, selectionExtraData);
            }
        };

        const cancelBtn = this.ui.quantityModal.querySelector('.btn-secondary');
        if (cancelBtn) {
            cancelBtn.onclick = () => {
                closeQuantityModal();
                if (parentSelectorSuspended && this.ui.info && typeof this.ui.info.resumeCommonModalFromChild === 'function') {
                    this.ui.info.resumeCommonModalFromChild();
                }
                if (extraData && extraData.onCancel) {
                    extraData.onCancel(); 
                }
            };
        }
    }

    // ==========================================
    // ★部隊分割（スライダー）の魔法です！
    // ==========================================
    showUnitDivideModal(bushos, totalSoldiers, totalHorses, totalGuns, onConfirm, onCancel = null) {
        // 援軍→本隊など部隊分割画面を連続して開く場合、前画面の遅延描画を次画面へ持ち越さない。
        this.cancelUnitDivideDeferredUpdates();
        const modal = document.getElementById('unit-divide-modal');
        const listEl = document.getElementById('divide-list');
        const confirmBtn = document.getElementById('divide-confirm-btn');
        const stockContainer = document.getElementById('divide-stock-container');
        
        if (!modal || !listEl) return;
        
        if (typeof totalHorses === 'function') {
            onCancel = totalGuns; 
            onConfirm = totalHorses;
            totalHorses = 0;
            totalGuns = 0;
        }

        this.ui.hideAIGuardTemporarily();
        
        const cancelBtn = modal.querySelector('.btn-secondary');
        if (cancelBtn) {
            cancelBtn.onclick = () => {
                this.cancelUnitDivideDeferredUpdates();
                modal.classList.add('hidden');
                this.ui.restoreAIGuard();
                if (onCancel) onCancel(); 
            };
        }

        modal.classList.remove('hidden');
        listEl.innerHTML = '';

        if (stockContainer) {
            stockContainer.className = 'slider-stock-info'; // ★CSSに任せる名札
            stockContainer.innerHTML = `
                <div class="stock-grid">
                    <div class="stock-item"><span class="stock-label">兵士</span><span id="divide-stock-soldiers">0</span></div>
                    <div class="stock-item"><span class="stock-label">軍馬</span><span id="divide-stock-horses">0</span></div>
                    <div class="stock-item"><span class="stock-label">鉄砲</span><span id="divide-stock-guns">0</span></div>
                </div>
            `;
        }
        
        const divideStockSoldiers = stockContainer ? stockContainer.querySelector('#divide-stock-soldiers') : null;
        const divideStockHorses = stockContainer ? stockContainer.querySelector('#divide-stock-horses') : null;
        const divideStockGuns = stockContainer ? stockContainer.querySelector('#divide-stock-guns') : null;
        const divideRefs = new Map();
        const isSeaBattleForDivide = !!(this.game.warManager && this.game.warManager.state && this.game.warManager.state.isSeaBattle);
        const isPcDivide = document.body.classList.contains('is-pc');
        listEl.classList.toggle('divide-list-two-column', isPcDivide && bushos.length > 3);

        const troopTypeLabel = (type) => type === 'kiba' ? '騎馬' : (type === 'teppo' ? '鉄砲' : '足軽');
        const aptitudeItemHtml = (label, rank) => `
            <span class="troop-aptitude-item">
                <span class="troop-aptitude-label">${label}</span>
                ${StatPresenter.toAptitudeHTML(rank || 'E')}
            </span>`;
        const aptitudeItemsFor = (busho, type) => {
            if (type === 'kiba') return [['馬術', busho.aptKiba]];
            if (type === 'teppo') return [['砲術', busho.aptTeppo]];
            return [['足軽', busho.aptAshigaru], ['弓術', busho.aptYumi]];
        };
        const aptitudeSummaryHtml = (busho, type, includeMaritime = false) => {
            const items = aptitudeItemsFor(busho, type).slice();
            if (includeMaritime) items.push(['操船', busho.aptMaritime]);
            return items.map(([label, rank]) => aptitudeItemHtml(label, rank)).join('');
        };
        const pcAptitudeSummaryHtml = (busho, includeMaritime = false) => {
            const items = [
                ['足軽', busho.aptAshigaru],
                ['馬術', busho.aptKiba],
                ['弓術', busho.aptYumi],
                ['砲術', busho.aptTeppo]
            ];
            if (includeMaritime) items.push(['操船', busho.aptMaritime]);
            return items.map(([label, rank]) => aptitudeItemHtml(label, rank)).join('');
        };

        const autoAssigns = this.game.warManager.autoDivideSoldiers(
            bushos,
            totalSoldiers,
            totalHorses,
            totalGuns,
            isSeaBattleForDivide,
            true
        );
        let assignments = autoAssigns.map(assignment => ({
            id: assignment.busho.id,
            count: assignment.soldiers,
            type: assignment.troopType
        }));

        const updateRemain = () => {
            let sum = 0;
            let usedHorses = 0;
            let usedGuns = 0;

            // ★Round12：DOMをid検索し直さず、行生成時に保存した参照から現在値を読みます。
            const currentData = bushos.map(b => {
                const ref = divideRefs.get(b.id);
                const typeVal = ref && ref.typeSel ? ref.typeSel.value : 'ashigaru';
                const numVal = ref && ref.num ? (parseInt(ref.num.value) || 0) : 0;
                sum += numVal;
                if (typeVal === 'kiba') usedHorses += numVal;
                if (typeVal === 'teppo') usedGuns += numVal;
                return { id: b.id, type: typeVal, count: numVal };
            });

            const rem = totalSoldiers - sum;
            currentData.forEach(d => {
                const ref = divideRefs.get(d.id);
                if (!ref || !ref.range || !ref.num) return;
                const range = ref.range;
                const num = ref.num;

                if (parseInt(num.value) !== d.count) {
                    num.value = d.count;
                    range.value = d.count;
                }

                const actualMax = parseInt(range.max) || 1;
                const actualMin = parseInt(range.min) || 1;
                const percent = actualMax > actualMin ? ((d.count - actualMin) / (actualMax - actualMin)) * 100 : 0;
                range.style.setProperty('--value', percent + '%');

                let otherSum = sum - d.count;
                let maxAllowed = totalSoldiers - otherSum;
                if (d.type === 'kiba') {
                    const otherHorses = usedHorses - d.count;
                    maxAllowed = Math.min(maxAllowed, totalHorses - otherHorses);
                }
                if (d.type === 'teppo') {
                    const otherGuns = usedGuns - d.count;
                    maxAllowed = Math.min(maxAllowed, totalGuns - otherGuns);
                }
                if (maxAllowed < 1) maxAllowed = 1;

                const btnMin = ref.btnMin;
                const btnHalf = ref.btnHalf;
                const btnMax = ref.btnMax;
                if (btnMin && btnHalf && btnMax) {
                    if (maxAllowed <= 1) {
                        btnMin.style.display = ''; btnMin.disabled = true; btnMin.style.order = 1;
                        btnHalf.style.display = ''; btnHalf.disabled = true; btnHalf.style.order = 3;
                        btnMax.style.display = 'none';
                    } else if (d.count <= 1) {
                        btnMin.style.display = ''; btnMin.disabled = true; btnMin.style.order = 1;
                        btnHalf.style.display = ''; btnHalf.disabled = false; btnHalf.style.order = 3;
                        btnMax.style.display = 'none';
                    } else if (d.count >= maxAllowed) {
                        btnMin.style.display = 'none';
                        btnHalf.style.display = ''; btnHalf.disabled = false; btnHalf.style.order = 1;
                        btnMax.style.display = ''; btnMax.disabled = true; btnMax.style.order = 3;
                    } else {
                        btnMin.style.display = ''; btnMin.disabled = false; btnMin.style.order = 1;
                        btnHalf.style.display = 'none';
                        btnMax.style.display = ''; btnMax.disabled = false; btnMax.style.order = 3;
                    }
                }

                const btnKiba = ref.btnKiba;
                const btnTeppo = ref.btnTeppo;
                if (btnKiba) {
                    const availHorses = totalHorses - (usedHorses - (d.type === 'kiba' ? d.count : 0));
                    if (availHorses <= 0 && d.type !== 'kiba') {
                        btnKiba.disabled = true;
                        btnKiba.classList.add('disabled');
                    } else {
                        btnKiba.disabled = false;
                        btnKiba.classList.remove('disabled');
                    }
                }
                if (btnTeppo) {
                    const availGuns = totalGuns - (usedGuns - (d.type === 'teppo' ? d.count : 0));
                    if (availGuns <= 0 && d.type !== 'teppo') {
                        btnTeppo.disabled = true;
                        btnTeppo.classList.add('disabled');
                    } else {
                        btnTeppo.disabled = false;
                        btnTeppo.classList.remove('disabled');
                    }
                }
                if (ref.cycleBtn) {
                    const otherHorses = usedHorses - (d.type === 'kiba' ? d.count : 0);
                    const otherGuns = usedGuns - (d.type === 'teppo' ? d.count : 0);
                    const hasKibaAlternative = !isSeaBattleForDivide && (d.type === 'kiba' || totalHorses - otherHorses > 0);
                    const hasTeppoAlternative = d.type === 'teppo' || totalGuns - otherGuns > 0;
                    const selectableCount = 1 + (hasKibaAlternative ? 1 : 0) + (hasTeppoAlternative ? 1 : 0);
                    ref.cycleBtn.disabled = selectableCount <= 1;
                    ref.cycleBtn.classList.toggle('disabled', selectableCount <= 1);
                    ref.cycleBtn.dataset.type = d.type;
                    ref.cycleBtn.textContent = troopTypeLabel(d.type);
                    if (ref.aptitudeSummary && ref.busho) {
                        ref.aptitudeSummary.innerHTML = aptitudeSummaryHtml(ref.busho, d.type, isSeaBattleForDivide);
                    }
                }
            });

            if (divideStockSoldiers) divideStockSoldiers.textContent = rem;
            if (divideStockHorses) divideStockHorses.textContent = Math.max(0, totalHorses - usedHorses);
            if (divideStockGuns) divideStockGuns.textContent = Math.max(0, totalGuns - usedGuns);

            confirmBtn.disabled = rem !== 0;
            confirmBtn.style.opacity = rem === 0 ? 1.0 : 0.5;
        };

        // ★Round12：ドラッグ中の全行再描画は1フレーム1回にまとめます。
        const scheduleDivideUIUpdate = () => {
            if (this._unitDivideUiRaf) return;
            const raf = window.requestAnimationFrame || ((cb) => setTimeout(cb, 16));
            this._unitDivideUiRaf = raf(() => {
                this._unitDivideUiRaf = 0;
                updateRemain();
            });
        };
        
        const gunshi = this.game.getClanGunshi(this.game.playerClanId);
        const myDaimyo = this.game.getClanDaimyo(this.game.playerClanId);

        bushos.forEach((b, index) => {
            const div = document.createElement('div');
            div.className = 'qty-row divide-row';
            
            const assignedType = assignments[index].type || 'ashigaru';
            const myType = isSeaBattleForDivide && assignedType === 'kiba' ? 'ashigaru' : assignedType;
            
            const aptAshigaru = b.aptAshigaru || 'E';
            const aptYumi = b.aptYumi || 'E';
            const aptKiba = b.aptKiba || 'E';
            const aptTeppo = b.aptTeppo || 'E';
            const aptMaritime = b.aptMaritime || 'E';

            const pcTroopSelectorHtml = isSeaBattleForDivide
                ? `
                    <button class="troop-type-btn ${myType === 'ashigaru' ? 'active' : ''}" data-type="ashigaru">足軽</button>
                    <button class="troop-type-btn ${myType === 'teppo' ? 'active' : ''}" data-type="teppo">鉄砲</button>
                `
                : `
                    <button class="troop-type-btn ${myType === 'ashigaru' ? 'active' : ''}" data-type="ashigaru">足軽</button>
                    <button class="troop-type-btn ${myType === 'kiba' ? 'active' : ''}" data-type="kiba">騎馬</button>
                    <button class="troop-type-btn ${myType === 'teppo' ? 'active' : ''}" data-type="teppo">鉄砲</button>
                `;
            const mobileCycleButtonHtml = `
                <button class="troop-type-btn troop-type-cycle-btn active" data-type="${myType}">${troopTypeLabel(myType)}</button>
            `;
            const pcCardInfoHtml = `
                <div class="divide-card-info">
                    <div class="divide-card-abilities">
                        <span class="divide-ability"><span class="divide-info-label">統率</span><span class="divide-ability-value">${Number(b.leadership || 0)}</span></span>
                        <span class="divide-ability"><span class="divide-info-label">武勇</span><span class="divide-ability-value">${Number(b.strength || 0)}</span></span>
                        <span class="divide-ability"><span class="divide-info-label">智謀</span><span class="divide-ability-value">${Number(b.intelligence || 0)}</span></span>
                    </div>
                    <div class="divide-card-aptitudes" title="武将の適性">
                        ${pcAptitudeSummaryHtml(b, isSeaBattleForDivide)}
                    </div>
                </div>
            `;

            div.innerHTML = `
                <div class="divide-row-header">
                    ${isPcDivide ? '' : `<div class="troop-type-selector is-mobile-cycle" id="troop-type-group-${b.id}">${mobileCycleButtonHtml}</div>`}
                    <span class="slider-row-label">${b.name}</span>
                    ${isPcDivide ? '' : `<div class="troop-aptitude-summary" title="現在兵科の適性${isSeaBattleForDivide ? ' / 操船適性' : ''}">${aptitudeSummaryHtml(b, myType, isSeaBattleForDivide)}</div>`}
                </div>
                ${isPcDivide ? pcCardInfoHtml : ''}
                <div class="qty-control">
                    <button class="qty-shortcut-btn qty-pos-start" id="div-btn-min-${b.id}">最小</button>
                    <button class="qty-shortcut-btn qty-pos-end" id="div-btn-half-${b.id}">半分</button>
                    <input class="qty-range-main" type="range" id="div-range-${b.id}" min="1" max="${totalSoldiers}" value="${assignments[index].count}">
                    <button class="qty-shortcut-btn qty-pos-end" id="div-btn-max-${b.id}">最大</button>
                    <input class="qty-number-end" type="number" id="div-num-${b.id}" min="1" max="${totalSoldiers}" value="${assignments[index].count}">
                </div>
                ${isPcDivide ? `<div class="troop-type-selector is-pc-selector ${isSeaBattleForDivide ? 'is-sea-battle' : ''}" id="troop-type-group-${b.id}">${pcTroopSelectorHtml}</div>` : ''}
                <input type="hidden" id="div-type-${b.id}" value="${myType}">
            `;
            listEl.appendChild(div);
            
            const range = div.querySelector(`#div-range-${b.id}`);
            const num = div.querySelector(`#div-num-${b.id}`);
            const typeSel = div.querySelector(`#div-type-${b.id}`);
            
            // ★修正：第3引数に isChangeEvent を追加して受け取れるようにしました
            const onInput = (val, mode = 'normal', isChangeEvent = false) => {
                let v = parseInt(val) || 0;
                
                let otherSum = 0;
                let otherHorses = 0;
                let otherGuns = 0;
                bushos.forEach(busho => {
                    if (busho.id !== b.id) {
                        const ref = divideRefs.get(busho.id);
                        const t = ref && ref.typeSel ? ref.typeSel.value : 'ashigaru';
                        const count = ref && ref.num ? (parseInt(ref.num.value) || 0) : 0;
                        otherSum += count;
                        if (t === 'kiba') otherHorses += count;
                        if (t === 'teppo') otherGuns += count;
                    }
                });
                
                let maxAllowed = totalSoldiers - otherSum;
                const myType = typeSel.value;
                if (myType === 'kiba') maxAllowed = Math.min(maxAllowed, totalHorses - otherHorses);
                if (myType === 'teppo') maxAllowed = Math.min(maxAllowed, totalGuns - otherGuns);
                if (maxAllowed < 1) maxAllowed = 1;

                if (mode === 'max') {
                    v = maxAllowed;
                } else if (mode === 'half') {
                    v = Math.floor((1 + maxAllowed) / 2);
                } else if (mode === 'range') {
                    // ★変更：ここも指を動かしている最中から常に丸めるように元に戻します
                    if (v > 1 && v < maxAllowed) {
                        if (totalSoldiers <= 999) {
                            v = Math.round(v / 10) * 10;
                        } else {
                            v = Math.round(v / 100) * 100;
                        }
                    }
                    if (v > maxAllowed) v = maxAllowed;
                    if (v < 1) v = 1;
                } else {
                    if (v > maxAllowed) v = maxAllowed;
                    if (v < 1) v = 1;
                }
                
                range.value = v;
                num.value = v;
                scheduleDivideUIUpdate();
            };

            // ★変更：第3引数は不要になったので元に戻します
            range.oninput = (e) => onInput(e.target.value, 'range');
            range.onchange = (e) => onInput(e.target.value, 'range');
            num.oninput = (e) => onInput(e.target.value);

            // ★追加：スライダーを触っている間は、スクロール等が行われないようにバリアを張ります
            range.addEventListener('touchstart', (e) => e.stopPropagation(), { passive: true });
            range.addEventListener('touchmove', (e) => e.stopPropagation(), { passive: true });

            const btnMin = div.querySelector(`#div-btn-min-${b.id}`);
            const btnHalf = div.querySelector(`#div-btn-half-${b.id}`);
            const btnMax = div.querySelector(`#div-btn-max-${b.id}`);
            
            btnMin.onclick = () => { onInput(1); };
            btnHalf.onclick = () => { onInput(0, 'half'); };
            btnMax.onclick = () => { onInput(0, 'max'); };
            num.onblur = (e) => {
                if(e.target.value === "" || isNaN(parseInt(e.target.value))) {
                    onInput(1);
                }
            };
            
            const typeBtns = div.querySelectorAll(`#troop-type-group-${b.id} .troop-type-btn`);
            const btnKiba = Array.from(typeBtns).find(btn => btn.getAttribute('data-type') === 'kiba') || null;
            const btnTeppo = Array.from(typeBtns).find(btn => btn.getAttribute('data-type') === 'teppo') || null;
            const cycleBtn = div.querySelector(`#troop-type-group-${b.id} .troop-type-cycle-btn`);
            const aptitudeSummary = div.querySelector('.troop-aptitude-summary');
            divideRefs.set(b.id, { busho: b, range, num, typeSel, btnMin, btnHalf, btnMax, btnKiba, btnTeppo, typeBtns, cycleBtn, aptitudeSummary });

            if (isPcDivide) {
                typeBtns.forEach(btn => {
                    btn.onclick = () => {
                        if (btn.disabled || btn.classList.contains('disabled')) return;
                        if (window.AudioManager) window.AudioManager.playSE('choice.ogg');
                        typeBtns.forEach(item => item.classList.remove('active'));
                        btn.classList.add('active');
                        typeSel.value = btn.getAttribute('data-type');
                        onInput(0, 'max');
                    };
                });
            } else if (cycleBtn) {
                cycleBtn.onclick = () => {
                    const currentType = typeSel.value || 'ashigaru';
                    let usedHorsesNow = 0;
                    let usedGunsNow = 0;
                    bushos.forEach(busho => {
                        const ref = divideRefs.get(busho.id);
                        if (!ref) return;
                        const count = parseInt(ref.num.value) || 0;
                        if (ref.typeSel.value === 'kiba') usedHorsesNow += count;
                        if (ref.typeSel.value === 'teppo') usedGunsNow += count;
                    });
                    const ownCount = parseInt(num.value) || 0;
                    const ownHorses = currentType === 'kiba' ? ownCount : 0;
                    const ownGuns = currentType === 'teppo' ? ownCount : 0;
                    const candidates = (isSeaBattleForDivide ? ['ashigaru', 'teppo'] : ['ashigaru', 'kiba', 'teppo']).filter(type => {
                        if (type === currentType) return true;
                        if (type === 'kiba') return totalHorses - (usedHorsesNow - ownHorses) > 0;
                        if (type === 'teppo') return totalGuns - (usedGunsNow - ownGuns) > 0;
                        return true;
                    });
                    if (candidates.length <= 1) return;
                    const currentIndex = candidates.indexOf(currentType);
                    const nextType = candidates[(currentIndex + 1 + candidates.length) % candidates.length];
                    if (window.AudioManager) window.AudioManager.playSE('choice.ogg');
                    typeSel.value = nextType;
                    cycleBtn.dataset.type = nextType;
                    cycleBtn.textContent = troopTypeLabel(nextType);
                    if (aptitudeSummary) aptitudeSummary.innerHTML = aptitudeSummaryHtml(b, nextType, isSeaBattleForDivide);
                    onInput(0, 'max');
                };
            }
        });

        updateRemain();

        // ★軽量化＆修正：画面の高さが確定するのを一瞬待ってからスクロールバーを呼び出します！
        const raf = window.requestAnimationFrame || ((cb) => setTimeout(cb, 16));
        this._unitDivideScrollbarRaf = raf(() => {
            this._unitDivideScrollbarRaf = 0;
            if (this.ui && typeof this.ui.updateCustomScrollbars === 'function') {
                this.ui.updateCustomScrollbars(listEl);
            }
        });

        confirmBtn.onclick = () => {
            let sum = 0;
            const finalAssignments = [];
            bushos.forEach(b => {
                const ref = divideRefs.get(b.id);
                const val = ref && ref.num ? (parseInt(ref.num.value) || 0) : 0;
                const typeVal = ref && ref.typeSel ? ref.typeSel.value : 'ashigaru';
                sum += val;
                finalAssignments.push({ busho: b, soldiers: val, troopType: typeVal });
            });
            
            if (sum !== totalSoldiers) {
                this.ui.showDialog("未分配の兵士がいます。兵士を残さず分配してください。", false);
                return;
            }
            
            this.cancelUnitDivideDeferredUpdates();
            modal.classList.add('hidden');
            this.ui.restoreAIGuard(); 
            onConfirm(finalAssignments);
        };
    }
}