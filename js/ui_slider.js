/**
 * ui_slider.js
 * 数量指定（スライダー）や部隊分割の画面を管理するファイルです
 */
class UISliderManager {
    constructor(ui, game) {
        this.ui = ui;
        this.game = game;
    }

    // ==========================================
    // ★数量選択（スライダー）の魔法です！
    // ==========================================
    openQuantitySelector(type, data, targetId, extraData = null) {
        if (!this.ui.quantityModal) return;
        this.ui.hideAIGuardTemporarily(); // ★これを追加します！
        
        // ★追加：複数スライダーの時だけ全画面にするための目印をつけます
        const isMultiMode = ['war_supplies', 'def_intercept', 'def_reinf_supplies', 'atk_reinf_supplies', 'def_self_reinf_supplies', 'atk_self_reinf_supplies', 'transport'].includes(type);
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

        const checkValidQuantity = () => {
            if (!this.ui.quantityConfirmBtn) return;
            let isValid = true;

            if (type === 'transport') {
                const g = parseInt(document.getElementById('num-gold')?.value) || 0;
                const r = parseInt(document.getElementById('num-rice')?.value) || 0;
                const s = parseInt(document.getElementById('num-soldiers')?.value) || 0;
                const h = parseInt(document.getElementById('num-horses')?.value) || 0;
                const gun = parseInt(document.getElementById('num-guns')?.value) || 0;
                if (g === 0 && r === 0 && s === 0 && h === 0 && gun === 0) isValid = false;
            } else if (type === 'headhunt_gold' || type === 'charity' || type === 'reinf_gold') {
                isValid = true; 
            } else if (type === 'war_supplies' || type === 'def_intercept' || type === 'def_reinf_supplies' || type === 'atk_reinf_supplies') {
                const s = parseInt(document.getElementById('num-soldiers')?.value) || 0;
                if (s <= 0) isValid = false; 
            } else {
                const inputsEl = document.querySelectorAll('.qty-control input[type="number"]');
                if (inputsEl.length > 0) {
                    const val = parseInt(inputsEl[0].value) || 0;
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
            if (['war_supplies', 'def_intercept', 'def_reinf_supplies', 'atk_reinf_supplies', 'def_self_reinf_supplies', 'atk_self_reinf_supplies', 'transport'].includes(type)) {
                let sCastle = c;
                if (type === 'def_intercept') sCastle = (data && data.length > 0) ? data[0] : c;
                if (type === 'def_reinf_supplies' || type === 'atk_reinf_supplies' || type === 'def_self_reinf_supplies' || type === 'atk_self_reinf_supplies') sCastle = (data && data.length > 0) ? data[0] : c;
                
                const updateStock = (id, baseVal) => {
                    const el = document.getElementById(`multi-stock-${id}`);
                    if (el) {
                        const v = parseInt(document.getElementById(`num-${id}`)?.value) || 0;
                        el.textContent = baseVal - v;
                    }
                };
                updateStock('gold', sCastle.gold);
                updateStock('rice', sCastle.rice);
                updateStock('soldiers', sCastle.soldiers);
                updateStock('horses', sCastle.horses || 0);
                updateStock('guns', sCastle.guns || 0);
            }

            // ★追加：スライダーを動かすたびに呼ばれるこの場所で、必要資金を計算してパタパタ表示します！
            const displayEl = document.getElementById('dynamic-cost-display');
            if (displayEl) {
                // 計算に使うために、大名と城主をここでも探しておきます
                const daimyo = this.game.bushos.find(b => b.clan === c.ownerClan && b.isDaimyo);
                const castellan = this.game.getBusho(c.castellanId);
                
                // ★修正：「金」が上、「アイテム」が下になるように２行の順番を入れ替えました！
                const makeGrid = (itemName, afterItem, afterGold) => {
                    return `
                        <div style="display: inline-grid; grid-template-columns: max-content max-content minmax(3em, auto); column-gap: 1em; text-align: left;">
                            <div>　金</div>
                            <div>▶</div>
                            <div style="text-align: right;">${Math.floor(afterGold)}</div>
                            <div>${itemName}</div>
                            <div>▶</div>
                            <div style="text-align: right;">${Math.floor(afterItem)}</div>
                        </div>
                    `;
                };
                
                if (type === 'draft') {
                    const amount = parseInt(document.getElementById('num-soldiers')?.value) || 0;
                    const busho = this.game.getBusho(data[0]);
                    const cost = GameSystem.calcDraftCost(amount, busho, c.peoplesLoyalty);
                    displayEl.innerHTML = makeGrid("兵士", c.soldiers + amount, c.gold - cost);
                } else if (type === 'buy_rice') {
                    const amount = parseInt(document.getElementById('num-amount')?.value) || 0;
                    let rate = 1.0;
                    if (c && this.game.provinces) {
                        const province = this.game.provinces.find(p => p.id === c.provinceId);
                        if (province && province.marketRate !== undefined) rate = province.marketRate;
                    }
                    const cost = Math.ceil(amount * rate);
                    displayEl.innerHTML = makeGrid("兵糧", c.rice + amount, c.gold - cost);
                } else if (type === 'sell_rice') {
                    const amount = parseInt(document.getElementById('num-amount')?.value) || 0;
                    let rate = 1.0;
                    if (c && this.game.provinces) {
                        const province = this.game.provinces.find(p => p.id === c.provinceId);
                        if (province && province.marketRate !== undefined) rate = province.marketRate;
                    }
                    const profit = Math.floor(amount * rate);
                    displayEl.innerHTML = makeGrid("兵糧", c.rice - amount, c.gold + profit);
                } else if (type === 'buy_horses') {
                    const amount = parseInt(document.getElementById('num-amount')?.value) || 0;
                    const cost = GameSystem.calcBuyHorseCost(amount, daimyo, castellan);
                    displayEl.innerHTML = makeGrid("軍馬", (c.horses || 0) + amount, c.gold - cost);
                } else if (type === 'buy_guns') {
                    const amount = parseInt(document.getElementById('num-amount')?.value) || 0;
                    const cost = GameSystem.calcBuyGunCost(amount, daimyo, castellan);
                    displayEl.innerHTML = makeGrid("鉄砲", (c.guns || 0) + amount, c.gold - cost);
                }
            }
        };
        
        const createSlider = (label, id, max, currentVal, minVal = 0, isTransport = false, targetCurrent = 0, targetMaxLimit = 99999) => {
            const wrap = document.createElement('div');
            wrap.className = 'qty-row';
            
            const isSingle = !(['war_supplies', 'def_intercept', 'def_reinf_supplies', 'atk_reinf_supplies', 'def_self_reinf_supplies', 'atk_self_reinf_supplies', 'transport'].includes(type));
            
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
                    <div class="qty-control" style="display:flex; align-items:center; gap:5px;">
                        <button class="qty-shortcut-btn" id="btn-min-${id}" style="order:1;">最小</button>
                        <button class="qty-shortcut-btn" id="btn-half-${id}" style="order:3;">半分</button>
                        <input type="range" id="range-${id}" min="0" max="${actualMaxTransport}" value="0" style="flex:1; order:2;">
                        <button class="qty-shortcut-btn" id="btn-max-${id}" style="order:3;">最大</button>
                        <input type="number" id="num-tgt-${id}" min="${targetCurrent}" max="${targetCurrent + actualMaxTransport}" value="${targetCurrent}" style="order:4;">
                        <input type="hidden" id="num-${id}" value="0">
                    </div>
                `;
                
                const range = wrap.querySelector(`#range-${id}`);
                const numTgt = wrap.querySelector(`#num-tgt-${id}`);
                const numHidden = wrap.querySelector(`#num-${id}`);
                
                // ★追加：見た目（青銀のゲージ）と数字を同時に更新する専用の魔法です
                const updateSliderUI = (v) => {
                    // 現在の値が全体の何％にあたるかを計算して、CSSに教えます
                    const percent = actualMaxTransport > 0 ? (v / actualMaxTransport) * 100 : 0;
                    range.style.setProperty('--value', percent + '%');
                    range.value = v;
                    numHidden.value = v;
                    numTgt.value = targetCurrent + v;
                    updateButtons(v);
                    checkValidQuantity();
                };

                const setVal = (v) => {
                    if (v < 0) v = 0;
                    if (v > actualMaxTransport) v = actualMaxTransport;
                    updateSliderUI(v);
                };

                wrap.querySelector(`#btn-min-${id}`).onclick = () => setVal(0);
                wrap.querySelector(`#btn-half-${id}`).onclick = () => setVal(Math.floor(actualMaxTransport / 2));
                wrap.querySelector(`#btn-max-${id}`).onclick = () => setVal(actualMaxTransport);

                // e（イベント）を受け取るように変更します
                const rangeHandler = (e) => { 
                    let v = parseInt(range.value);
                    
                    // ★修正：指を離した時（change）だけ、数字をキリよく揃えるようにします！
                    // 動かしている最中（input）はそのままにするので、なめらかにドラッグできます
                    if (e && e.type === 'change') {
                        if (v > 0 && v < actualMaxTransport) { 
                            if (actualMaxTransport <= 999) {
                                v = Math.round(v / 10) * 10; 
                            } else {
                                v = Math.round(v / 100) * 100; 
                            }
                        }
                    }
                    
                    if (v > actualMaxTransport) v = actualMaxTransport;
                    if (v < 0) v = 0;
                    updateSliderUI(v);
                };
                range.oninput = rangeHandler;
                range.onchange = rangeHandler;

                const numTgtHandler = () => {
                    let v = parseInt(numTgt.value);
                    if (isNaN(v)) return;
                    if (v < targetCurrent) v = targetCurrent;
                    if (v > targetCurrent + actualMaxTransport) v = targetCurrent + actualMaxTransport;
                    const transAmount = v - targetCurrent;
                    updateSliderUI(transAmount);
                };
                range.oninput = rangeHandler;
                range.onchange = rangeHandler; // ★スマホで指を離した時の最終確認

                const numTgtHandler = () => {
                    let v = parseInt(numTgt.value);
                    if (isNaN(v)) return;
                    if (v < targetCurrent) v = targetCurrent;
                    if (v > targetCurrent + actualMaxTransport) v = targetCurrent + actualMaxTransport;
                    const transAmount = v - targetCurrent;
                    range.value = transAmount;
                    numHidden.value = transAmount;
                    updateButtons(transAmount);
                    checkValidQuantity();
                };
                numTgt.oninput = numTgtHandler;
                numTgt.onchange = numTgtHandler; // ★スマホで指を離した時の最終確認
                
                updateButtons(0);
                this.ui.quantityContainer.appendChild(wrap);
                return { range, num: numHidden };
                
            } else {
                // isSingle（単体か複数か）に関わらず、全て同じ黄色い文字のデザインに統一します！
                wrap.innerHTML = `
                    <div class="slider-row-label">${label}</div>
                    <div class="qty-control" style="display:flex; align-items:center; gap:5px;">
                        <button class="qty-shortcut-btn" id="btn-min-${id}" style="order:1;">最小</button>
                        <button class="qty-shortcut-btn" id="btn-half-${id}" style="order:3;">半分</button>
                        <input type="range" id="range-${id}" min="${minVal}" max="${max}" value="${currentVal}" style="flex:1; order:2;">
                        <button class="qty-shortcut-btn" id="btn-max-${id}" style="order:3;">最大</button>
                        <input type="number" id="num-${id}" min="${minVal}" max="${max}" value="${currentVal}" style="order:4;">
                    </div>
                `;
                
                const range = wrap.querySelector(`#range-${id}`);
                const num = wrap.querySelector(`#num-${id}`);
                
                const updateSliderUI = (v) => {
                    const percent = max > minVal ? ((v - minVal) / (max - minVal)) * 100 : 0;
                    range.style.setProperty('--value', percent + '%');
                    range.value = v;
                    num.value = v;
                    updateButtons(v);
                    checkValidQuantity();
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
                    if (e && e.type === 'change') {
                        if (v > minVal && v < max) { 
                            if (max <= 999) {
                                v = Math.round(v / 10) * 10; 
                            } else {
                                v = Math.round(v / 100) * 100; 
                            }
                        }
                    }
                    if (v > max) v = max;
                    if (v < minVal) v = minVal;
                    updateSliderUI(v);
                };
                range.oninput = rangeHandler;
                range.onchange = rangeHandler; 

                const numHandler = () => { 
                    let v = parseInt(num.value);
                    if (isNaN(v)) return;
                    if (v < minVal) v = minVal;
                    if (v > max) v = max;
                    updateSliderUI(v);
                };
                num.oninput = numHandler;
                num.onchange = numHandler; // ★スマホで指を離した時の最終確認

                updateButtons(currentVal);
                this.ui.quantityContainer.appendChild(wrap);
                return { range, num };
            }
        };

        let inputs = {};
        
        // ★追加：計算のために大名と城主をあらかじめ探しておきます
        const daimyo = this.game.bushos.find(b => b.clan === c.ownerClan && b.isDaimyo);
        const castellan = this.game.getBusho(c.castellanId);

        // ★今回追加：複数スライダー画面のための「上部の物資・残数表示」
        const isMultiSliderMode = ['war_supplies', 'def_intercept', 'def_reinf_supplies', 'atk_reinf_supplies', 'def_self_reinf_supplies', 'atk_self_reinf_supplies', 'transport'].includes(type);
        let sourceCastleForMulti = c;
        if (type === 'def_intercept') sourceCastleForMulti = (data && data.length > 0) ? data[0] : c;
        if (type === 'def_reinf_supplies' || type === 'atk_reinf_supplies' || type === 'def_self_reinf_supplies' || type === 'atk_self_reinf_supplies') sourceCastleForMulti = (data && data.length > 0) ? data[0] : c;

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
        }
        
        if (type === 'draft') {
            document.getElementById('quantity-title').textContent = "徴兵"; 
            
            const busho = this.game.getBusho(data[0]);
            let maxAffordable = GameSystem.calcDraftFromGold(c.gold, busho, c.peoplesLoyalty);
            // 金額の端数でお金が足りなくならないよう、確実な数まで減らします
            while (maxAffordable > 0 && GameSystem.calcDraftCost(maxAffordable, busho, c.peoplesLoyalty) > c.gold) {
                maxAffordable--;
            }
            // 城の兵士数の上限(99,999)を超えないようにします
            const maxSoldiers = Math.min(c.population, 99999 - c.soldiers, maxAffordable);
            
            // ★変更：相場の金額を小数点以下1桁で表示します！
            const efficiency = ((busho.leadership * 1.5) + (busho.charm * 1.5) + (Math.sqrt(busho.loyalty) * 2) + (Math.sqrt(c.peoplesLoyalty) * 2)) / 500;
            const singleCost = 1 / efficiency;
            
            this.ui.tradeTypeInfo.classList.remove('hidden'); 
            this.ui.tradeTypeInfo.textContent = `兵士 1人 ＝ 金 ${singleCost.toFixed(1)}`;

            // ★変更：スライダーより前に数字の箱を作って、スライダーの上に表示させます！
            const costDiv = document.createElement('div');
            costDiv.id = 'dynamic-cost-display';
            costDiv.style.cssText = "display: flex; justify-content: center; font-weight:bold; color:#1976d2; margin-bottom:15px; font-size:1.1rem;";
            this.ui.quantityContainer.appendChild(costDiv);

            inputs.soldiers = createSlider("兵士数", "soldiers", maxSoldiers, 0);
            
        } else if (type === 'charity') {
            document.getElementById('quantity-title').textContent = "施し"; this.ui.charityTypeSelector.classList.remove('hidden'); const count = data.length; this.ui.quantityContainer.innerHTML = `<p>選択武将: ${count}名</p>`;
        } else if (type === 'goodwill') {
            document.getElementById('quantity-title').textContent = "贈与金指定"; 
            const maxGoodwillGold = Math.max(200, Math.min(1500, c.gold));
            inputs.gold = createSlider("金", "gold", maxGoodwillGold, 200, 200);
        } else if (type === 'headhunt_gold') {
            document.getElementById('quantity-title').textContent = "持参金 (任意)"; inputs.gold = createSlider("金", "gold", c.gold, 0);
        } else if (type === 'reinf_gold') {
            document.getElementById('quantity-title').textContent = "使者に持たせる金 (最大1500)"; 
            const baseCastle = (data && data.length > 0) ? data[0] : c;
            const maxGold = Math.min(1500, baseCastle.gold);
            inputs.gold = createSlider("持参金", "gold", maxGold, 0);
        } else if (type === 'tribute_gold') {
            document.getElementById('quantity-title').textContent = "献上金 (最大1500)"; 
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
            header.className = 'qty-row'; // 行のスタイルを合わせます
            header.style.marginBottom = '5px';
            // スライダー行と全く同じ要素構成にして、ボタンなどは透明化して配置します
            // ★変更：左側の項目名を黄色文字にしたのに合わせて、ここも構造を合わせます
            header.innerHTML = `
                <div class="slider-row-label" style="visibility:hidden;">ダミー</div>
                <div class="qty-control" style="display:flex; align-items:center; gap:5px;">
                    <button class="qty-shortcut-btn" style="visibility:hidden; pointer-events:none; order:1;">空</button>
                    <div style="flex:1; order:2;"></div>
                    <button class="qty-shortcut-btn" style="visibility:hidden; pointer-events:none; order:3;">空</button>
                    <div style="width: 48px; text-align: center; font-weight: bold; order:4; color: #ffd54f; font-size: 0.85rem; text-shadow: 1px 1px 0 #000, -1px -1px 0 #000, 1px -1px 0 #000, -1px 1px 0 #000;">輸送先</div>
                </div>
            `;
            this.ui.quantityContainer.appendChild(header);

            const tCastle = this.game.getCastle(targetId); // 輸送先の城のデータを取得します
            
            // 引数は (ラベル, ID, 自分の城の数, 最初は0, 最低は0, 輸送モードフラグ, 相手の城の数, 相手の城の上限) です
            inputs.gold = createSlider("金", "gold", c.gold, 0, 0, true, tCastle.gold, 99999);
            inputs.rice = createSlider("兵糧", "rice", c.rice, 0, 0, true, tCastle.rice, 99999);
            inputs.soldiers = createSlider("兵士", "soldiers", c.soldiers, 0, 0, true, tCastle.soldiers, 99999);
            inputs.horses = createSlider("軍馬", "horses", c.horses || 0, 0, 0, true, tCastle.horses || 0, 99999);
            inputs.guns = createSlider("鉄砲", "guns", c.guns || 0, 0, 0, true, tCastle.guns || 0, 99999);
        } else if (type === 'buy_rice') {
            document.getElementById('quantity-title').textContent = "兵糧購入"; 
            let rate = 1.0;
            if (c && this.game.provinces) {
                const province = this.game.provinces.find(p => p.id === c.provinceId);
                if (province && province.marketRate !== undefined) rate = province.marketRate;
            }
            let maxBuy = Math.floor(c.gold / rate);
            // 金額の端数でお金が足りなくならないよう、確実な数まで減らします
            while (maxBuy > 0 && Math.ceil(maxBuy * rate) > c.gold) {
                maxBuy--;
            }
            // 城の兵糧上限(99,999)や取引上限を超えないようにします
            const realMaxBuy = Math.min(maxBuy, 99999 - c.rice, c.tradeLimit || 0);

            this.ui.tradeTypeInfo.classList.remove('hidden'); 
            // ★変更：相場の金額を小数点以下1桁で表示します！
            this.ui.tradeTypeInfo.textContent = `兵糧 10 ＝ 金 ${(10 * rate).toFixed(1)} (取引上限: ${c.tradeLimit || 0})`;

            // ★変更：スライダーより前に数字の箱を作って、スライダーの上に表示させます！
            const costDiv = document.createElement('div');
            costDiv.id = 'dynamic-cost-display';
            costDiv.style.cssText = "display: flex; justify-content: center; font-weight:bold; color:#1976d2; margin-bottom:15px; font-size:1.1rem;";
            this.ui.quantityContainer.appendChild(costDiv);

            inputs.amount = createSlider("購入量", "amount", realMaxBuy, 0);
            
        } else if (type === 'sell_rice') {
            document.getElementById('quantity-title').textContent = "兵糧売却"; 
            let rate = 1.0;
            if (c && this.game.provinces) {
                const province = this.game.provinces.find(p => p.id === c.provinceId);
                if (province && province.marketRate !== undefined) rate = province.marketRate;
            }
            // 売ったお金が所持金の上限(99,999)を超えないように、売れる最大量を逆算します
            const maxSellByGold = Math.floor((99999 - c.gold) / rate);
            const realMaxSell = Math.min(c.rice, maxSellByGold, c.tradeLimit || 0);

            this.ui.tradeTypeInfo.classList.remove('hidden'); 
            // ★変更：相場の金額を小数点以下1桁で表示します！
            this.ui.tradeTypeInfo.textContent = `兵糧 10 ＝ 金 ${(10 * rate).toFixed(1)} (取引上限: ${c.tradeLimit || 0})`;

            // ★変更：スライダーより前に数字の箱を作って、スライダーの上に表示させます！
            const costDiv = document.createElement('div');
            costDiv.id = 'dynamic-cost-display';
            costDiv.style.cssText = "display: flex; justify-content: center; font-weight:bold; color:#1976d2; margin-bottom:15px; font-size:1.1rem;";
            this.ui.quantityContainer.appendChild(costDiv);

            inputs.amount = createSlider("売却量", "amount", realMaxSell, 0);

        } else if (type === 'buy_ammo') {
            document.getElementById('quantity-title').textContent = "矢弾購入"; 
            const price = parseInt(window.MainParams.Economy.PriceAmmo, 10) || 1;
            const maxBuy = price > 0 ? Math.floor(c.gold / price) : 0;
            // 城の矢弾上限(99,999)を超えないようにします
            const realMaxBuy = Math.min(maxBuy, 99999 - (c.ammo || 0));

            this.ui.tradeTypeInfo.classList.remove('hidden'); 
            this.ui.tradeTypeInfo.textContent = `固定価格: 金${price.toFixed(1)} / 1個`; // 念のためこちらも揃えます
            inputs.amount = createSlider("購入量", "amount", realMaxBuy, 0);

        } else if (type === 'buy_horses') {
            document.getElementById('quantity-title').textContent = "軍馬購入"; 
            let maxBuy = GameSystem.calcBuyHorseAmount(c.gold, daimyo, castellan);
            // 金額の端数でお金が足りなくならないよう、確実な数まで減らします
            while (maxBuy > 0 && GameSystem.calcBuyHorseCost(maxBuy, daimyo, castellan) > c.gold) {
                maxBuy--;
            }
            // 城の軍馬上限(99,999)を超えないようにします
            const realMaxBuy = Math.min(maxBuy, 99999 - (c.horses || 0));

            // ★変更：さっき作った「正確な単価の魔法」を使って表示します
            const unitPrice = GameSystem.calcBuyHorseUnitPrice(daimyo, castellan);
            this.ui.tradeTypeInfo.classList.remove('hidden'); 
            this.ui.tradeTypeInfo.textContent = `軍馬 1頭 ＝ 金 ${unitPrice.toFixed(1)}`;

            // ★変更：スライダーより前に数字の箱を作って、スライダーの上に表示させます！
            const costDiv = document.createElement('div');
            costDiv.id = 'dynamic-cost-display';
            costDiv.style.cssText = "display: flex; justify-content: center; font-weight:bold; color:#1976d2; margin-bottom:15px; font-size:1.1rem;";
            this.ui.quantityContainer.appendChild(costDiv);

            inputs.amount = createSlider("購入量", "amount", realMaxBuy, 0);

        } else if (type === 'buy_guns') {
            document.getElementById('quantity-title').textContent = "鉄砲購入"; 
            let maxBuy = GameSystem.calcBuyGunAmount(c.gold, daimyo, castellan);
            // 金額の端数でお金が足りなくならないよう、確実な数まで減らします
            while (maxBuy > 0 && GameSystem.calcBuyGunCost(maxBuy, daimyo, castellan) > c.gold) {
                maxBuy--;
            }
            // 城の鉄砲上限(99,999)を超えないようにします
            const realMaxBuy = Math.min(maxBuy, 99999 - (c.guns || 0));

            // ★変更：さっき作った「正確な単価の魔法」を使って表示します
            const unitPrice = GameSystem.calcBuyGunUnitPrice(daimyo, castellan);
            this.ui.tradeTypeInfo.classList.remove('hidden'); 
            this.ui.tradeTypeInfo.textContent = `鉄砲 1挺 ＝ 金 ${unitPrice.toFixed(1)}`;

            // ★変更：スライダーより前に数字の箱を作って、スライダーの上に表示させます！
            const costDiv = document.createElement('div');
            costDiv.id = 'dynamic-cost-display';
            costDiv.style.cssText = "display: flex; justify-content: center; font-weight:bold; color:#1976d2; margin-bottom:15px; font-size:1.1rem;";
            this.ui.quantityContainer.appendChild(costDiv);

            inputs.amount = createSlider("購入量", "amount", realMaxBuy, 0);

        } else if (type === 'war_repair') {
            const s = this.game.warManager.state;
            const defender = s.defender;
            const maxSoldiers = Math.min(window.WarParams.War.RepairMaxSoldiers, defender.soldiers);
            document.getElementById('quantity-title').textContent = "補修 (兵士選択)";
            inputs.soldiers = createSlider("使用兵士数", "soldiers", maxSoldiers, Math.min(50, maxSoldiers));
        }
        
        checkValidQuantity(); 

        const closeQuantityModal = () => {
            this.ui.quantityModal.classList.add('hidden');
            this.ui.restoreAIGuard(); // ★これを追加します！
            if (this.ui.quantityConfirmBtn) {
                this.ui.quantityConfirmBtn.disabled = false;
                this.ui.quantityConfirmBtn.style.opacity = 1.0;
            }
        };

        this.ui.quantityConfirmBtn.onclick = () => {
            closeQuantityModal(); 
            if (extraData && extraData.onConfirm) {
                extraData.onConfirm(inputs);
            } else {
                this.game.commandSystem.handleQuantitySelection(type, inputs, targetId, data, extraData);
            }
        };

        const cancelBtn = this.ui.quantityModal.querySelector('.btn-secondary');
        if (cancelBtn) {
            cancelBtn.onclick = () => {
                closeQuantityModal(); 
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
        const modal = document.getElementById('unit-divide-modal');
        const listEl = document.getElementById('divide-list');
        const confirmBtn = document.getElementById('divide-confirm-btn');
        const footer = confirmBtn.parentElement;
        if (footer) footer.style.justifyContent = 'center';
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
        
        let assignments = [];
        if (this.game.warManager && typeof this.game.warManager.autoDivideSoldiers === 'function') {
            // AIと同じ魔法を使って、能力が高い順に軍馬や鉄砲を賢く配分します！
            const autoAssigns = this.game.warManager.autoDivideSoldiers(bushos, totalSoldiers, totalHorses, totalGuns);
            assignments = autoAssigns.map(a => ({
                id: a.busho.id,
                count: a.soldiers,
                type: a.troopType
            }));
        } else {
            // もし魔法が使えなかった時のための予備の配分です
            assignments = bushos.map(b => ({ id: b.id, count: 0, type: 'ashigaru' }));
            
            let ratioSum = 1.5 + (bushos.length - 1) * 1.0;
            let baseAmount = Math.floor(totalSoldiers / ratioSum);
            let remain = totalSoldiers;

            for (let i = 1; i < bushos.length; i++) {
                assignments[i].count = baseAmount;
                remain -= baseAmount;
            }
            if (assignments.length > 0) {
                assignments[0].count = remain; 
            }
        }

        const updateRemain = (triggerBushoId = null, triggerType = null) => {
            let sum = 0;
            let usedHorses = 0;
            let usedGuns = 0;
            
            const currentData = bushos.map(b => {
                const typeEl = document.getElementById(`div-type-${b.id}`);
                const numEl = document.getElementById(`div-num-${b.id}`);
                const typeVal = typeEl ? typeEl.value : 'ashigaru';
                let numVal = numEl ? parseInt(numEl.value) || 0 : 0;
                return { id: b.id, type: typeVal, count: numVal };
            });

            if (triggerType === 'type_change' && triggerBushoId) {
                const bData = currentData.find(d => d.id === triggerBushoId);
                if (bData && bData.type === 'kiba') {
                    const otherKiba = currentData.filter(d => d.id !== triggerBushoId && d.type === 'kiba').reduce((s, d) => s + d.count, 0);
                    const maxKiba = Math.max(0, totalHorses - otherKiba);
                    if (bData.count > maxKiba) {
                        bData.count = maxKiba;
                        if (bData.count < 1) bData.count = 1; 
                        if (maxKiba === 0) {
                            bData.type = 'ashigaru';
                            document.getElementById(`div-type-${triggerBushoId}`).value = 'ashigaru';
                        }
                    }
                } else if (bData && bData.type === 'teppo') {
                    const otherTeppo = currentData.filter(d => d.id !== triggerBushoId && d.type === 'teppo').reduce((s, d) => s + d.count, 0);
                    const maxTeppo = Math.max(0, totalGuns - otherTeppo);
                    if (bData.count > maxTeppo) {
                        bData.count = maxTeppo;
                        if (bData.count < 1) bData.count = 1;
                        if (maxTeppo === 0) {
                            bData.type = 'ashigaru';
                            document.getElementById(`div-type-${triggerBushoId}`).value = 'ashigaru';
                        }
                    }
                }
            } else if (triggerType === 'num_change' && triggerBushoId) {
                const bData = currentData.find(d => d.id === triggerBushoId);
                if (bData && bData.type === 'kiba') {
                    const otherKiba = currentData.filter(d => d.id !== triggerBushoId && d.type === 'kiba').reduce((s, d) => s + d.count, 0);
                    const maxKiba = Math.max(0, totalHorses - otherKiba);
                    if (bData.count > maxKiba) bData.count = maxKiba;
                } else if (bData && bData.type === 'teppo') {
                    const otherTeppo = currentData.filter(d => d.id !== triggerBushoId && d.type === 'teppo').reduce((s, d) => s + d.count, 0);
                    const maxTeppo = Math.max(0, totalGuns - otherTeppo);
                    if (bData.count > maxTeppo) bData.count = maxTeppo;
                }
            }

            sum = currentData.reduce((s, d) => s + d.count, 0);
            usedHorses = currentData.filter(d => d.type === 'kiba').reduce((s, d) => s + d.count, 0);
            usedGuns = currentData.filter(d => d.type === 'teppo').reduce((s, d) => s + d.count, 0);
            
            const rem = totalSoldiers - sum;
            currentData.forEach(d => {
                const range = document.getElementById(`div-range-${d.id}`);
                const num = document.getElementById(`div-num-${d.id}`);
                if (!range || !num) return;

                if (parseInt(num.value) !== d.count) {
                    num.value = d.count;
                    range.value = d.count;
                }

                // ★追加：部隊分割画面でも、青銀のゲージの割合を計算してCSSに教えます
                let tempMax = totalSoldiers - (sum - d.count);
                if (d.type === 'kiba') tempMax = Math.min(tempMax, totalHorses - (usedHorses - d.count));
                if (d.type === 'teppo') tempMax = Math.min(tempMax, totalGuns - (usedGuns - d.count));
                if (tempMax < 1) tempMax = 1;
                const percent = tempMax > 1 ? ((d.count - 1) / (tempMax - 1)) * 100 : 0;
                range.style.setProperty('--value', percent + '%');

                // ボタンの表示・非表示を数量指定スライダーと揃える魔法
                let otherSum = sum - d.count;
                let maxAllowed = totalSoldiers - otherSum;
                if (d.type === 'kiba') {
                    let otherHorses = usedHorses - d.count; 
                    maxAllowed = Math.min(maxAllowed, totalHorses - otherHorses);
                }
                if (d.type === 'teppo') {
                    let otherGuns = usedGuns - d.count;
                    maxAllowed = Math.min(maxAllowed, totalGuns - otherGuns);
                }
                if (maxAllowed < 1) maxAllowed = 1;

                const btnMin = document.getElementById(`div-btn-min-${d.id}`);
                const btnHalf = document.getElementById(`div-btn-half-${d.id}`);
                const btnMax = document.getElementById(`div-btn-max-${d.id}`);
                
                if (btnMin && btnHalf && btnMax) {
                    if (maxAllowed <= 1) {
                        btnMin.style.display = ''; btnMin.disabled = true; btnMin.style.order = 1;
                        btnHalf.style.display = ''; btnHalf.disabled = true; btnHalf.style.order = 3;
                        btnMax.style.display = 'none';
                    } else if (d.count <= 1) {
                        // 最小の時：「最小(無効)」と「半分(有効)」を表示
                        btnMin.style.display = ''; btnMin.disabled = true; btnMin.style.order = 1;
                        btnHalf.style.display = ''; btnHalf.disabled = false; btnHalf.style.order = 3;
                        btnMax.style.display = 'none';
                    } else if (d.count >= maxAllowed) {
                        // 最大の時：「半分(有効)」と「最大(無効)」を表示
                        btnMin.style.display = 'none';
                        btnHalf.style.display = ''; btnHalf.disabled = false; btnHalf.style.order = 1;
                        btnMax.style.display = ''; btnMax.disabled = true; btnMax.style.order = 3;
                    } else {
                        // 中間の時：「最小(有効)」と「最大(有効)」を表示
                        btnMin.style.display = ''; btnMin.disabled = false; btnMin.style.order = 1;
                        btnHalf.style.display = 'none';
                        btnMax.style.display = ''; btnMax.disabled = false; btnMax.style.order = 3;
                    }
                }
            });
            
            const stockSoldiers = document.getElementById('divide-stock-soldiers');
            const stockHorses = document.getElementById('divide-stock-horses');
            const stockGuns = document.getElementById('divide-stock-guns');

            if (stockSoldiers) stockSoldiers.textContent = rem;
            if (stockHorses) stockHorses.textContent = Math.max(0, totalHorses - usedHorses);
            if (stockGuns) stockGuns.textContent = Math.max(0, totalGuns - usedGuns);
            
            if (rem === 0) {
                confirmBtn.disabled = false;
                confirmBtn.style.opacity = 1.0;
            } else {
                confirmBtn.disabled = true;
                confirmBtn.style.opacity = 0.5;
            }
        };
        
        const gunshi = this.game.getClanGunshi(this.game.playerClanId);
        const myDaimyo = this.game.bushos.find(b => b.clan === this.game.playerClanId && b.isDaimyo);

        bushos.forEach((b, index) => {
            const div = document.createElement('div');
            div.className = 'qty-row divide-row';
            
            const myType = assignments[index].type || 'ashigaru';
            
            div.innerHTML = `
                <div style="font-weight:bold; width:100%; margin-bottom:0; display:flex; align-items:center; justify-content:space-between;">
                    <span class="slider-row-label">${b.name}</span>
                    <div class="troop-type-selector" id="troop-type-group-${b.id}">
                        <button class="troop-type-btn ${myType === 'ashigaru' ? 'active' : ''}" data-type="ashigaru">足軽</button>
                        <button class="troop-type-btn ${myType === 'kiba' ? 'active' : ''}" data-type="kiba">騎馬</button>
                        <button class="troop-type-btn ${myType === 'teppo' ? 'active' : ''}" data-type="teppo">鉄砲</button>
                    </div>
                </div>
                <div class="qty-control" style="display:flex; align-items:center; gap:5px;">
                    <button class="qty-shortcut-btn" id="div-btn-min-${b.id}" style="order:1;">最小</button>
                    <button class="qty-shortcut-btn" id="div-btn-half-${b.id}" style="order:3;">半分</button>
                    <input type="range" id="div-range-${b.id}" min="1" max="${totalSoldiers}" value="${assignments[index].count}" style="flex:1; order:2;">
                    <button class="qty-shortcut-btn" id="div-btn-max-${b.id}" style="order:3;">最大</button>
                    <input type="number" id="div-num-${b.id}" min="1" max="${totalSoldiers}" value="${assignments[index].count}" style="order:4;">
                </div>
                <input type="hidden" id="div-type-${b.id}" value="${myType}">
            `;
            listEl.appendChild(div);
            
            const range = div.querySelector(`#div-range-${b.id}`);
            const num = div.querySelector(`#div-num-${b.id}`);
            const typeSel = div.querySelector(`#div-type-${b.id}`);
            
            const onInput = (val, mode = 'normal') => {
                let v = parseInt(val) || 0;
                
                let otherSum = 0;
                let otherHorses = 0;
                let otherGuns = 0;
                bushos.forEach(busho => {
                    if (busho.id !== b.id) {
                        const tEl = document.getElementById(`div-type-${busho.id}`);
                        const nEl = document.getElementById(`div-num-${busho.id}`);
                        const t = tEl ? tEl.value : 'ashigaru';
                        const c = parseInt(nEl ? nEl.value : 0) || 0;
                        otherSum += c;
                        if (t === 'kiba') otherHorses += c;
                        if (t === 'teppo') otherGuns += c;
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
                    // ★変更：ここでも指を離した時（isChangeEventがtrueの時）だけ丸めます
                    if (isChangeEvent) {
                        if (v > 1 && v < maxAllowed) {
                            if (totalSoldiers <= 999) {
                                v = Math.round(v / 10) * 10;
                            } else {
                                v = Math.round(v / 100) * 100;
                            }
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
                updateRemain(b.id, 'num_change');
            };

            // 第3引数（isChangeEvent）で、指を離した時かどうかを判定します
            range.oninput = (e) => onInput(e.target.value, 'range', false);
            range.onchange = (e) => onInput(e.target.value, 'range', true);
            num.oninput = (e) => onInput(e.target.value);

            const btnMin = div.querySelector(`#div-btn-min-${b.id}`);
            const btnHalf = div.querySelector(`#div-btn-half-${b.id}`);
            const btnMax = div.querySelector(`#div-btn-max-${b.id}`);
            
            btnMin.onclick = () => { if (window.AudioManager) window.AudioManager.playSE('choice.ogg'); onInput(1); };
            btnHalf.onclick = () => { if (window.AudioManager) window.AudioManager.playSE('choice.ogg'); onInput(0, 'half'); };
            btnMax.onclick = () => { if (window.AudioManager) window.AudioManager.playSE('choice.ogg'); onInput(0, 'max'); };
            num.onblur = (e) => {
                if(e.target.value === "" || isNaN(parseInt(e.target.value))) {
                    onInput(1);
                }
            };
            
            const typeBtns = div.querySelectorAll(`#troop-type-group-${b.id} .troop-type-btn`);
            typeBtns.forEach(btn => {
                btn.onclick = () => {
                    if (window.AudioManager) window.AudioManager.playSE('choice.ogg');
                    typeBtns.forEach(b => b.classList.remove('active'));
                    btn.classList.add('active');
                    typeSel.value = btn.getAttribute('data-type');
                    updateRemain(b.id, 'type_change');
                };
            });
        });

        updateRemain();

        confirmBtn.onclick = () => {
            let sum = 0;
            const finalAssignments = [];
            bushos.forEach(b => {
                const val = parseInt(document.getElementById(`div-num-${b.id}`).value) || 0;
                const typeVal = document.getElementById(`div-type-${b.id}`).value;
                sum += val;
                finalAssignments.push({ busho: b, soldiers: val, troopType: typeVal });
            });
            
            if (sum !== totalSoldiers) {
                this.ui.showDialog("未分配の兵士がいます。兵士を残さず分配してください。", false);
                return;
            }
            
            modal.classList.add('hidden');
            this.ui.restoreAIGuard(); 
            onConfirm(finalAssignments);
        };
    }
}