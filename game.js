/**
 * 戦国シミュレーションゲーム - 戦争システム刷新・捕虜・注釈版
 */

/* --- Config & Data --- */
// ゲームバランス調整用の設定値です。ここを変更するとゲームの難易度や進行が変わります。
const CONFIG = {
    StartYear: 1560,
    StartMonth: 1,
    Coef: {
        IncomeGold: 0.5,          // 商業値に対する金収入の倍率
        ConsumeRice: 0.02,        // 兵士1人あたりの兵糧消費量
        ConsumeGoldPerBusho: 50,  // 武将1人あたりの俸禄（金消費）
        DevPolitics: 5.0,         // 政治力1あたりに上昇する開発値（石高・商業）
        DraftStr: 5.0,            // 武力1あたりに徴兵できる基本兵数
        RepairPol: 5.0,           // 政治力1あたりに回復する城防御値
        CharityCharm: 2.0,        // 魅力1あたりに上昇する民忠
        BaseDev: 50,              // 開発時の基礎上昇値
        BaseDraft: 500,           // 徴兵時の基礎兵数
        BaseRepair: 100,          // 修復時の基礎回復値
        BaseCharity: 50           // 施し時の基礎民忠上昇値
    },
    War: {
        MaxRounds: 10,            // 戦争の最大ターン数
        SoldierPower: 0.05,       // 兵士数1が持つ攻撃力への換算係数
        WallDefense: 0.5,         // 城防御1が持つ防御力への換算係数
        DefAdvantage: 2.0,        // 防御側（反撃）のダメージ倍率（有利補正）
        WoundedRecovery: 0.2,     // 戦争終了後に復帰する死亡兵の割合（通常）
        RetreatRecovery: 0.3,     // 短期撤退時に復帰する死亡兵の割合
        RetreatTurnLimit: 5       // 短期撤退とみなすターン数未満
    },
    Prisoner: {
        BaseCaptureRate: 0.4,     // 敗北武将が捕まる基礎確率
        HireDifficulty: 1.5       // 登用難易度係数（高いほど引き抜きにくい）
    }
};

const DATA_SOURCES = {
    castles: "./data/castles.csv",
    bushos: "./data/warriors.csv"
};

// --- Default Data (CSV読み込み失敗時のフォールバック) ---
const DEFAULT_CSV_CASTLES = `id,name,ownerClan,x,y,castellanId,soldiers,gold,rice,kokudaka,commerce,defense,loyalty,population
1,魚津城,1,1,0,10102,8000,3000,15000,900,600,800,800,20000
2,春日山城,1,2,0,10101,12000,6000,25000,1500,1000,1200,900,30000`.trim();
const DEFAULT_CSV_BUSHOS = `id,name,strength,politics,intelligence,charm,loyalty,clan,castleId,isCastellan,personality
10101,上杉謙信,100,60,90,95,100,1,2,true,aggressive`.trim();

/* --- Data Manager --- */
class DataManager {
    static async loadAll() {
        const castles = await this.loadData(DATA_SOURCES.castles, DEFAULT_CSV_CASTLES, Castle);
        const bushos = await this.loadData(DATA_SOURCES.bushos, DEFAULT_CSV_BUSHOS, Busho);
        
        castles.forEach(c => c.samuraiIds = []);
        bushos.forEach(b => {
            const c = castles.find(castle => castle.id === b.castleId);
            if(c) c.samuraiIds.push(b.id);
        });
        this.generateGenericBushos(bushos, castles);
        return { castles, bushos };
    }

    static async loadData(url, defaultCsv, ModelClass) {
        let csvText = defaultCsv;
        try {
            const response = await fetch(url);
            if (response.ok) csvText = await response.text();
        } catch(e) {}
        return this.parseCSV(csvText, ModelClass);
    }

    static parseCSV(text, ModelClass) {
        const lines = text.split('\n').map(l => l.trim()).filter(l => l);
        const headers = lines[0].split(',');
        const result = [];
        for (let i = 1; i < lines.length; i++) {
            const values = lines[i].split(',');
            if(values.length < headers.length) continue;
            const data = {};
            headers.forEach((header, index) => {
                let val = values[index];
                if (!isNaN(Number(val)) && val !== "") val = Number(val);
                if (val === "true" || val === "TRUE") val = true;
                if (val === "false" || val === "FALSE") val = false;
                data[header] = val;
            });
            result.push(new ModelClass(data));
        }
        return result;
    }

    static generateGenericBushos(bushos, castles) {
        const clans = [1,2,3,4,5,6];
        const ranks = ["足軽頭", "侍大将", "部将", "家老"];
        let idCounter = 20000;
        clans.forEach(clanId => {
            const clanCastles = castles.filter(c => c.ownerClan === clanId);
            if(clanCastles.length === 0) return;
            for(let i=0; i<10; i++) {
                const castle = clanCastles[Math.floor(Math.random() * clanCastles.length)];
                bushos.push(new Busho({
                    id: idCounter++,
                    name: `武将${String.fromCharCode(65+i)}`,
                    strength: 30+Math.floor(Math.random()*40),
                    politics: 30+Math.floor(Math.random()*40),
                    intelligence: 30+Math.floor(Math.random()*40),
                    charm: 30+Math.floor(Math.random()*40),
                    loyalty: 80, clan: clanId, castleId: castle.id, 
                    isCastellan: false, personality: "balanced"
                }));
                castle.samuraiIds.push(idCounter-1);
            }
        });
    }
}

/* --- Models --- */
class Busho {
    constructor(data) {
        Object.assign(this, data);
        this.fatigue = 0;
        this.isActionDone = false;
        if(!this.personality) this.personality = 'balanced';
        if(this.charm === undefined) this.charm = 50; 
    }
}
class Castle {
    constructor(data) {
        Object.assign(this, data);
        this.samuraiIds = this.samuraiIds || [];
        this.maxDefense = (data.defense || 500) * 2; 
        this.maxKokudaka = (data.kokudaka || 500) * 2;
        this.maxCommerce = (data.commerce || 500) * 2;
        this.maxLoyalty = 1000;
        this.isDone = false;
        if(this.loyalty === undefined) this.loyalty = 500;
        if(this.population === undefined) this.population = 10000;
        this.investigatedUntil = 0;
    }
}

const CLAN_DATA = [
    { id: 1, name: "上杉家", color: "#d32f2f" },
    { id: 2, name: "武田家", color: "#1976d2" },
    { id: 3, name: "北条家", color: "#fbc02d" },
    { id: 4, name: "今川家", color: "#7b1fa2" },
    { id: 5, name: "斎藤家", color: "#388e3c" },
    { id: 6, name: "織田家", color: "#212121" }
];

/* --- Logic Systems --- */
class GameSystem {
    static calcDevelopment(busho) { return Math.floor(CONFIG.Coef.BaseDev + (busho.politics * CONFIG.Coef.DevPolitics)); }
    static calcRepair(busho) { return Math.floor(CONFIG.Coef.BaseRepair + (busho.politics * CONFIG.Coef.RepairPol)); }
    static calcCharity(busho) { return Math.floor(CONFIG.Coef.BaseCharity + (busho.charm * CONFIG.Coef.CharityCharm)); }
    static calcDraftLimit(castle) {
        const loyaltyFactor = castle.loyalty / 1000;
        return Math.max(100, Math.floor(castle.population * 0.1 * loyaltyFactor));
    }
    static isAdjacent(c1, c2) { return (Math.abs(c1.x - c2.x) + Math.abs(c1.y - c2.y)) === 1; }

    static getBestStat(bushos, type) {
        if (!bushos || bushos.length === 0) return 30;
        let max = 0;
        bushos.forEach(b => {
            let val = type === 'str' ? b.strength : type === 'int' ? b.intelligence : b.charm;
            if (val > max) max = val;
        });
        return max;
    }

    // 部隊能力: 大将 + 副将*0.2
    static calcUnitStats(bushos) {
        if (!bushos || bushos.length === 0) return { str:30, int:30 };
        const sorted = [...bushos].sort((a,b) => b.strength - a.strength);
        const leader = sorted[0];
        const subs = sorted.slice(1);
        let totalStr = leader.strength;
        let totalInt = leader.intelligence;
        subs.forEach(b => { totalStr += b.strength * 0.2; totalInt += b.intelligence * 0.2; });
        return { str: Math.floor(totalStr), int: Math.floor(totalInt), charm: leader.charm };
    }

    // 戦争ダメージ計算 (改修版)
    static calcWarDamage(atkStats, defStats, atkSoldiers, defSoldiers, defWall, type) {
        const rand = 0.9 + (Math.random() * 0.2);
        
        // 基本攻撃力
        const atkPower = (atkStats.str * 1.5) + (atkSoldiers * CONFIG.War.SoldierPower);
        // 基本防御力 (城防御は城壁攻撃以外では有効)
        const defPower = (defStats.str * 0.5) + (defStats.int * 0.5) + (defWall * CONFIG.War.WallDefense) + (defSoldiers * CONFIG.War.SoldierPower);

        // コマンド補正
        let multiplier = 1.0;
        let soldierRate = 1.0;
        let wallRate = 0.0;
        let risk = 1.0; // 反撃ダメージ倍率への影響 (未使用だが概念として)

        switch(type) {
            case 'bow': // 低リスク、兵士攻撃
                multiplier = 0.6; soldierRate = 1.0; wallRate = 0.0;
                break;
            case 'siege': // 中リスク、城壁攻撃
                multiplier = 0.8; soldierRate = 0.1; wallRate = 2.0;
                break;
            case 'charge': // 高リスク、全力攻撃
                multiplier = 1.2; soldierRate = 1.0; wallRate = 0.5;
                break;
            case 'def_bow': // 防御側: 弓
                multiplier = 0.5; soldierRate = 1.0; wallRate = 0.0;
                break;
            case 'def_attack': // 防御側: 通常
                multiplier = 1.0; soldierRate = 1.0; wallRate = 0.0;
                break;
            case 'def_charge': // 防御側: 全力
                multiplier = 1.5; soldierRate = 1.0; wallRate = 0.0;
                break;
        }

        // ダメージ計算: 攻撃 / (攻撃 + 防御) の比率で軽減
        const ratio = atkPower / (atkPower + defPower);
        let dmg = atkPower * ratio * multiplier * rand;
        
        return {
            soldierDmg: Math.floor(dmg * soldierRate),
            wallDmg: Math.floor(dmg * wallRate)
        };
    }

    // 謀略計算: 成功判定と威力
    static calcScheme(atkBusho, defBusho, defCastleLoyalty) {
        const atkInt = atkBusho.intelligence;
        const defInt = defBusho ? defBusho.intelligence : 30;
        
        // 成功判定
        const successRate = (atkInt / (defInt + 10)) * 0.7; // 相手+10で少し厳しく
        const isSuccess = Math.random() < successRate;

        if (!isSuccess) return { success: false, damage: 0 };

        // 威力: 民忠が低いほど効く
        const loyaltyBonus = (1000 - defCastleLoyalty) / 500; // 0.0 ~ 2.0
        const baseDmg = atkInt * 5;
        const damage = Math.floor(baseDmg * (1.0 + loyaltyBonus));

        return { success: true, damage: damage };
    }

    // 隣接する同勢力の城を探す (撤退用)
    static getRetreatCastle(currentCastle, castles) {
        return castles.find(c => 
            c.id !== currentCastle.id && 
            c.ownerClan === currentCastle.ownerClan && 
            this.isAdjacent(currentCastle, c)
        );
    }
}

/* --- UI Manager --- */
class UIManager {
    constructor(game) {
        this.game = game;
        this.currentCastle = null;
        this.menuState = 'MAIN';
        
        // Cache DOM
        this.mapEl = document.getElementById('map-container');
        this.panelEl = document.getElementById('control-panel');
        this.statusContainer = document.getElementById('status-container');
        this.cmdArea = document.getElementById('command-area');
        this.logEl = document.getElementById('log-content');
        this.selectorModal = document.getElementById('selector-modal');
        this.selectorList = document.getElementById('selector-list');
        this.selectorContextInfo = document.getElementById('selector-context-info');
        this.selectorHeader = document.getElementById('selector-header');
        this.selectorConfirmBtn = document.getElementById('selector-confirm-btn');
        this.startScreen = document.getElementById('start-screen');
        this.cutinOverlay = document.getElementById('cutin-overlay');
        this.cutinMessage = document.getElementById('cutin-message');
        this.quantityModal = document.getElementById('quantity-modal');
        this.quantityContainer = document.getElementById('quantity-container');
        this.quantityConfirmBtn = document.getElementById('quantity-confirm-btn');
        this.mapGuide = document.getElementById('map-guide');
        this.prisonerModal = document.getElementById('prisoner-modal');
        this.prisonerList = document.getElementById('prisoner-list');
        this.warControls = document.getElementById('war-controls');

        document.getElementById('load-file-input').addEventListener('change', (e) => this.game.loadGameFromFile(e));
    }

    log(msg) {
        const div = document.createElement('div');
        div.textContent = msg;
        this.logEl.prepend(div);
    }

    showCutin(msg) {
        this.cutinMessage.textContent = msg;
        this.cutinOverlay.classList.remove('hidden');
        this.cutinOverlay.classList.add('fade-in');
        setTimeout(() => {
            this.cutinOverlay.classList.remove('fade-in');
            this.cutinOverlay.classList.add('fade-out');
            setTimeout(() => {
                this.cutinOverlay.classList.add('hidden');
                this.cutinOverlay.classList.remove('fade-out');
            }, 500);
        }, 2000);
    }

    showStartScreen(clans, onSelect) {
        this.startScreen.classList.remove('hidden');
        const container = document.getElementById('clan-selector');
        container.innerHTML = '';
        clans.forEach(clan => {
            const btn = document.createElement('div');
            btn.className = 'clan-btn';
            btn.textContent = clan.name;
            btn.dataset.id = clan.id;
            btn.style.color = clan.color;
            btn.style.borderColor = clan.color;
            btn.onclick = () => {
                this.startScreen.classList.add('hidden');
                onSelect(clan.id);
            };
            container.appendChild(btn);
        });
    }

    renderMap() {
        this.mapEl.innerHTML = '';
        document.getElementById('date-display').textContent = `${this.game.year}年 ${this.game.month}月`;

        const isSelectionMode = (this.game.selectionMode !== null);
        if(isSelectionMode) this.mapGuide.classList.remove('hidden');
        else this.mapGuide.classList.add('hidden');

        this.game.castles.forEach(c => {
            const el = document.createElement('div');
            el.className = 'castle-card';
            el.dataset.clan = c.ownerClan;
            el.style.setProperty('--c-x', c.x + 1);
            el.style.setProperty('--c-y', c.y + 1);

            // 行動済みのスタイル (暗くせずハイライトのみにしたい場合はCSSで調整)
            // ここではクラス付与のみ
            if (c.isDone) el.classList.add('done');
            if (this.game.getCurrentTurnCastle() === c && !c.isDone) el.classList.add('active-turn');

            const castellan = this.game.getBusho(c.castellanId);
            const clanData = CLAN_DATA.find(cl => cl.id === c.ownerClan);
            const isVisible = this.game.isCastleVisible(c);
            const soldierText = isVisible ? c.soldiers : "???";
            const castellanName = isVisible ? (castellan ? castellan.name : '-') : "???";

            el.innerHTML = `
                <div class="card-header"><h3>${c.name}</h3></div>
                <div class="card-owner">${clanData ? clanData.name : "中立"}</div>
                <div class="param-grid">
                    <div class="param-item"><span>城主</span> <strong>${castellanName}</strong></div>
                    <div class="param-item"><span>兵数</span> ${soldierText}</div>
                </div>
            `;
            if(clanData) el.style.borderTop = `5px solid ${clanData.color}`;

            if (isSelectionMode) {
                if (this.game.validTargets.includes(c)) {
                    el.classList.add('selectable-target');
                    el.onclick = () => this.game.resolveMapSelection(c);
                } else {
                    el.style.opacity = '0.4'; 
                }
            } else {
                el.onclick = () => this.showCastleInfo(c);
            }
            this.mapEl.appendChild(el);
        });
    }

    showControlPanel(castle) {
        this.currentCastle = castle;
        this.panelEl.classList.remove('hidden');
        this.updatePanelHeader();
        this.menuState = 'MAIN';
        this.renderCommandMenu();
    }

    updatePanelHeader() {
        if (!this.currentCastle) return;
        const c = this.currentCastle;
        const clanData = CLAN_DATA.find(cd => cd.id === c.ownerClan);
        
        document.getElementById('panel-title').textContent = c.name;
        document.getElementById('panel-clan').textContent = clanData ? clanData.name : "--";
        
        const createStatusRow = (label, val, max = null) => {
            let html = `
                <div class="status-row">
                    <div class="status-label">${label}</div>
                    <div class="status-value">${val}${max ? '<span class="status-max">/' + max + '</span>' : ''}</div>
                </div>
            `;
            if (max) {
                const pct = Math.min(100, Math.floor((val / max) * 100));
                html += `<div class="progress-bar"><div class="progress-fill" style="width:${pct}%"></div></div>`;
            }
            return html;
        };

        let html = "";
        html += createStatusRow("金", c.gold);
        html += createStatusRow("兵糧", c.rice);
        html += createStatusRow("兵士", c.soldiers);
        html += createStatusRow("人口", c.population);
        html += createStatusRow("民忠", c.loyalty, 1000);
        html += createStatusRow("防御", c.defense, c.maxDefense);
        html += createStatusRow("石高", c.kokudaka, c.maxKokudaka);
        html += createStatusRow("商業", c.commerce, c.maxCommerce);

        this.statusContainer.innerHTML = html;
    }

    renderCommandMenu() {
        this.cmdArea.innerHTML = '';
        const createBtn = (label, cls, onClick) => {
            const btn = document.createElement('button');
            btn.className = `cmd-btn ${cls || ''}`;
            btn.textContent = label;
            btn.onclick = onClick;
            this.cmdArea.appendChild(btn);
        };

        if (this.menuState === 'MAIN') {
            createBtn("開発", "category", () => { this.menuState = 'DEVELOP'; this.renderCommandMenu(); });
            createBtn("軍事", "category", () => { this.menuState = 'MILITARY'; this.renderCommandMenu(); });
            createBtn("情報", "category", () => { this.menuState = 'INFO'; this.renderCommandMenu(); });
            createBtn("人事", "category", () => { this.menuState = 'PERSONNEL'; this.renderCommandMenu(); });
            createBtn("機能", "category", () => { this.menuState = 'SYSTEM'; this.renderCommandMenu(); });
            createBtn("終了", "finish", () => this.game.finishTurn());
        }
        else if (this.menuState === 'DEVELOP') {
            createBtn("石高開発", "", () => this.openBushoSelector('farm'));
            createBtn("商業開発", "", () => this.openBushoSelector('commerce'));
            createBtn("施し", "", () => this.openBushoSelector('charity'));
            createBtn("戻る", "back", () => { this.menuState = 'MAIN'; this.renderCommandMenu(); });
        }
        else if (this.menuState === 'MILITARY') {
            createBtn("出陣", "", () => this.game.enterMapSelection('war')); 
            createBtn("徴兵", "", () => this.openBushoSelector('draft'));
            createBtn("修復", "", () => this.openBushoSelector('repair'));
            createBtn("輸送", "", () => this.game.enterMapSelection('transport')); 
            createBtn("戻る", "back", () => { this.menuState = 'MAIN'; this.renderCommandMenu(); });
        }
        else if (this.menuState === 'INFO') {
            createBtn("調査", "", () => this.game.enterMapSelection('investigate')); 
            createBtn("戻る", "back", () => { this.menuState = 'MAIN'; this.renderCommandMenu(); });
        }
        else if (this.menuState === 'PERSONNEL') {
            createBtn("移動", "", () => this.game.enterMapSelection('move'));
            createBtn("城主任命", "", () => this.openBushoSelector('appoint'));
            createBtn("追放", "", () => this.openBushoSelector('banish'));
            createBtn("戻る", "back", () => { this.menuState = 'MAIN'; this.renderCommandMenu(); });
        }
        else if (this.menuState === 'SYSTEM') {
            createBtn("ファイル保存", "", () => window.GameApp.saveGameToFile());
            createBtn("ファイル読込", "", () => document.getElementById('load-file-input').click());
            createBtn("戻る", "back", () => { this.menuState = 'MAIN'; this.renderCommandMenu(); });
        }
    }

    cancelMapSelection() {
        this.game.selectionMode = null;
        this.game.validTargets = [];
        this.renderMap();
        this.menuState = 'MAIN';
        this.renderCommandMenu();
    }

    openBushoSelector(actionType, targetId = null) {
        this.selectorModal.classList.remove('hidden');
        document.getElementById('selector-title').textContent = "武将を選択";
        this.selectorList.innerHTML = '';
        
        const contextEl = document.getElementById('selector-context-info');
        const headerEl = document.getElementById('selector-header');
        contextEl.classList.remove('hidden');
        
        const c = this.currentCastle;
        let infoHtml = "";
        let sortKey = 'strength';
        let sortLabel = "武力";

        if (actionType === 'farm') {
            infoHtml = `<div>金: ${c.gold}</div>`; sortKey = 'politics'; sortLabel = '政治';
        } else if (actionType === 'commerce') {
            infoHtml = `<div>金: ${c.gold}</div>`; sortKey = 'politics'; sortLabel = '政治';
        } else if (actionType === 'charity') {
            infoHtml = `<div>金: ${c.gold}</div>`; sortKey = 'charm'; sortLabel = '魅力';
        } else if (actionType === 'repair') {
            infoHtml = `<div>金: ${c.gold}</div>`; sortKey = 'politics'; sortLabel = '政治';
        } else if (actionType === 'draft') {
            infoHtml = `<div>民忠: ${c.loyalty}</div>`; sortKey = 'strength'; sortLabel = '武力';
        } else if (actionType === 'war_deploy') {
            sortKey = 'strength'; sortLabel = '武力';
        } else if (actionType === 'scheme_select') { // 謀略実行者選択
            sortKey = 'intelligence'; sortLabel = '知略';
        } else {
            contextEl.classList.add('hidden');
        }
        
        contextEl.innerHTML = infoHtml;
        headerEl.innerHTML = `<span>名前</span><span>${sortLabel} (ソート順)</span>`;

        let bushos = this.game.getCastleBushos(this.currentCastle.id);
        bushos.sort((a,b) => b[sortKey] - a[sortKey]);

        const isMulti = (actionType === 'war_deploy' || actionType === 'move_deploy'); 
        
        bushos.forEach(b => {
            const div = document.createElement('div');
            const isDisabled = b.isActionDone;
            div.className = `select-item ${isDisabled ? 'disabled' : ''}`;
            const inputType = isMulti ? 'checkbox' : 'radio';
            div.innerHTML = `
                <input type="${inputType}" name="sel_busho" value="${b.id}" ${isDisabled ? 'disabled' : ''}>
                <div class="item-detail">
                    <span class="item-main">${b.name} ${b.isCastellan ? '(城主)' : ''}</span>
                    <span class="item-sub">${sortLabel}: <strong>${b[sortKey]}</strong> (武:${b.strength} 政:${b.politics} 智:${b.intelligence} 魅:${b.charm}) ${isDisabled ? '[済]' : ''}</span>
                </div>
            `;
            if(!isDisabled) {
                div.onclick = (e) => {
                    if(e.target.tagName !== 'INPUT') div.querySelector('input').click();
                };
            }
            this.selectorList.appendChild(div);
        });

        this.selectorConfirmBtn.onclick = () => {
            const inputs = document.querySelectorAll('input[name="sel_busho"]:checked');
            if (inputs.length === 0) return;
            const selectedIds = Array.from(inputs).map(i => parseInt(i.value));
            this.closeSelector();
            
            if (actionType === 'draft') {
                const busho = this.game.getBusho(selectedIds[0]);
                this.openQuantitySelector('draft', busho);
            } else if (actionType === 'war_deploy') {
                this.openQuantitySelector('war', selectedIds, targetId);
            } else if (actionType === 'transport_deploy') {
                const busho = this.game.getBusho(selectedIds[0]);
                this.openQuantitySelector('transport', busho, targetId);
            } else if (actionType === 'investigate_deploy') {
                this.game.executeInvestigate(selectedIds[0], targetId);
            } else if (actionType === 'scheme_select') {
                // 謀略実行 (ターゲット選択済み状態から来る想定)
                // この実装では簡略化のため、謀略コマンドは「自城の武将を選び、その知略で判定」する形にします
                // ※本来は「対象城」を選ぶフローが必要ですが、現状のwar中コマンドの「scheme」に統合しています。
                // ここは通常コマンドの謀略用ですが、今回は戦争中の謀略に絞ります。
            } else {
                this.game.executeCommand(actionType, selectedIds, targetId);
            }
        };
    }

    openQuantitySelector(type, data, targetId) {
        this.quantityModal.classList.remove('hidden');
        this.quantityContainer.innerHTML = '';
        const c = this.currentCastle;

        const createSlider = (label, id, max, currentVal) => {
            const wrap = document.createElement('div');
            wrap.className = 'qty-row';
            wrap.innerHTML = `
                <label>${label} (Max: ${max})</label>
                <div class="qty-control">
                    <input type="range" id="range-${id}" min="0" max="${max}" value="${currentVal}">
                    <input type="number" id="num-${id}" min="0" max="${max}" value="${currentVal}">
                </div>
            `;
            const range = wrap.querySelector(`#range-${id}`);
            const num = wrap.querySelector(`#num-${id}`);
            range.oninput = () => num.value = range.value;
            num.oninput = () => range.value = num.value;
            this.quantityContainer.appendChild(wrap);
            return { range, num };
        };

        let inputs = {};

        if (type === 'draft') {
            document.getElementById('quantity-title').textContent = "徴兵数指定";
            const limit = GameSystem.calcDraftLimit(c);
            const costPerSoldier = 0.5;
            const realMax = Math.min(limit, Math.floor(c.gold/costPerSoldier), Math.floor(c.rice/costPerSoldier));
            inputs.soldiers = createSlider("徴兵数", "soldiers", realMax, 0);
            
            this.quantityConfirmBtn.onclick = () => {
                const val = parseInt(inputs.soldiers.num.value);
                if(val <= 0) return;
                this.quantityModal.classList.add('hidden');
                this.game.executeDraft(data, val);
            };
        } 
        else if (type === 'war') {
            document.getElementById('quantity-title').textContent = "出陣兵数指定";
            inputs.soldiers = createSlider("兵士数", "soldiers", c.soldiers, c.soldiers);
            
            this.quantityConfirmBtn.onclick = () => {
                const val = parseInt(inputs.soldiers.num.value);
                if(val <= 0) { alert("兵士0では出陣できません"); return; }
                this.quantityModal.classList.add('hidden');
                this.game.executeWar(data, targetId, val); 
            };
        }
        else if (type === 'transport') {
            document.getElementById('quantity-title').textContent = "輸送物資指定";
            inputs.gold = createSlider("金", "gold", c.gold, 0);
            inputs.rice = createSlider("兵糧", "rice", c.rice, 0);
            inputs.soldiers = createSlider("兵士", "soldiers", c.soldiers, 0);

            this.quantityConfirmBtn.onclick = () => {
                const vals = {
                    gold: parseInt(inputs.gold.num.value),
                    rice: parseInt(inputs.rice.num.value),
                    soldiers: parseInt(inputs.soldiers.num.value)
                };
                if(vals.gold===0 && vals.rice===0 && vals.soldiers===0) return;
                this.quantityModal.classList.add('hidden');
                this.game.executeTransport(data, targetId, vals);
            };
        }
    }

    closeSelector() { this.selectorModal.classList.add('hidden'); }

    // 捕虜選択モーダル
    showPrisonerModal(prisoners, onDecide) {
        this.prisonerModal.classList.remove('hidden');
        this.prisonerList.innerHTML = '';
        
        prisoners.forEach((p, index) => {
            const div = document.createElement('div');
            div.className = 'prisoner-item';
            div.innerHTML = `
                <div style="margin-bottom:5px;"><strong>${p.name}</strong> (武:${p.strength} 智:${p.intelligence} 魅:${p.charm} 忠:${p.loyalty})</div>
                <div class="prisoner-actions">
                    <button class="btn-primary" onclick="window.GameApp.handlePrisonerAction(${index}, 'hire')">登用</button>
                    <button class="btn-danger" onclick="window.GameApp.handlePrisonerAction(${index}, 'kill')">処断</button>
                    <button class="btn-secondary" onclick="window.GameApp.handlePrisonerAction(${index}, 'release')">解放</button>
                </div>
            `;
            this.prisonerList.appendChild(div);
        });
    }
    
    closePrisonerModal() {
        this.prisonerModal.classList.add('hidden');
    }

    showCastleBushosModal() {
        if (!this.currentCastle) return;
        this.showBushoList(this.currentCastle);
    }

    showCastleInfo(castle) {
        const modal = document.getElementById('busho-detail-modal'); 
        const body = document.getElementById('busho-detail-body');
        modal.classList.remove('hidden');
        document.getElementById('busho-modal-title').textContent = "城情報";

        const clanData = CLAN_DATA.find(c => c.id === castle.ownerClan);
        let html = `<h3>${castle.name} (${clanData ? clanData.name : '中立'})</h3>`;
        const isVisible = this.game.isCastleVisible(castle);

        if (isVisible) {
            html += `<div class="status-list" style="max-height:none; margin-bottom:15px;">`;
            const createStatusRow = (label, val, max = null) => {
                let r = `<div class="status-row"><div class="status-label">${label}</div><div class="status-value">${val}${max?'/'+max:''}</div></div>`;
                if (max) {
                    const pct = Math.min(100, Math.floor((val / max) * 100));
                    r += `<div class="progress-bar"><div class="progress-fill" style="width:${pct}%"></div></div>`;
                }
                return r;
            };
            html += createStatusRow("兵士", castle.soldiers);
            html += createStatusRow("防御", castle.defense, castle.maxDefense);
            html += createStatusRow("石高", castle.kokudaka, castle.maxKokudaka);
            html += createStatusRow("商業", castle.commerce, castle.maxCommerce);
            html += createStatusRow("民忠", castle.loyalty, 1000);
            html += createStatusRow("人口", castle.population);
            html += `</div>`;
            html += `<button class="action-btn" onclick="window.GameApp.ui.showBushoListById(${castle.id})">武将一覧</button>`;
        } else {
            html += `<p class="panel-msg">情報は不明です（調査が必要です）</p>`;
        }
        body.innerHTML = html;
    }

    showBushoListById(castleId) {
        const castle = this.game.getCastle(castleId);
        this.showBushoList(castle);
    }

    showBushoList(castle) {
        const modal = document.getElementById('busho-detail-modal');
        const body = document.getElementById('busho-detail-body');
        modal.classList.remove('hidden');
        document.getElementById('busho-modal-title').textContent = `${castle.name} 所属武将`;
        
        const bushos = this.game.getCastleBushos(castle.id);
        let html = `<div style="max-height:400px; overflow-y:auto;">`;
        if (bushos.length > 0) {
            bushos.forEach(b => {
                html += `
                    <div style="border-bottom:1px solid #ccc; padding:10px;">
                        <strong style="font-size:1.2rem;">${b.name}</strong> ${b.isCastellan ? '★' : ''}<br>
                        <span style="color:#666">武:${b.strength} 政:${b.politics} 智:${b.intelligence} 魅:${b.charm}</span><br>
                        状態: ${b.isActionDone ? '行動済' : '可'}
                    </div>
                `;
            });
        } else {
            html += `<div style="padding:10px; color:#666;">所属武将はいません</div>`;
        }
        html += `</div>`;
        body.innerHTML = html;
    }

    // 戦争コマンドの描画 (攻撃側/防御側で変化)
    renderWarControls(isAttacker) {
        const area = document.getElementById('war-controls');
        area.innerHTML = '';
        
        const createBtn = (label, action, cls='') => {
            const btn = document.createElement('button');
            btn.textContent = label;
            if(cls) btn.className = cls;
            btn.onclick = () => window.GameApp.execWarCmd(action);
            area.appendChild(btn);
        };

        if (isAttacker) {
            createBtn("弓攻撃 (低リスク)", "bow");
            createBtn("城攻め (壁破壊)", "siege");
            createBtn("力攻め (高リスク)", "charge");
            createBtn("謀略", "scheme");
            createBtn("撤退", "retreat", "btn-danger");
        } else {
            createBtn("弓攻撃 (低リスク)", "def_bow");
            createBtn("攻撃 (標準)", "def_attack");
            createBtn("力攻め (高リスク)", "def_charge");
            createBtn("謀略", "scheme");
            createBtn("撤退", "retreat", "btn-danger"); // 防御側も撤退可
        }
    }
}

/* --- Game Manager --- */
class GameManager {
    constructor() {
        this.year = CONFIG.StartYear;
        this.month = CONFIG.StartMonth;
        this.castles = [];
        this.bushos = [];
        this.turnQueue = [];
        this.currentIndex = 0;
        this.playerClanId = 1;
        this.ui = new UIManager(this);
        this.warState = { active: false };
        this.selectionMode = null; 
        this.validTargets = [];
        this.pendingPrisoners = []; // 捕虜処理用
    }

    startNewGame() { this.boot(); }

    async boot() {
        const data = await DataManager.loadAll();
        this.castles = data.castles;
        this.bushos = data.bushos;
        document.getElementById('title-screen').classList.add('hidden');
        document.getElementById('app').classList.remove('hidden');
        this.ui.showStartScreen(CLAN_DATA, (clanId) => {
            this.playerClanId = clanId;
            this.init();
        });
    }

    init() { this.startMonth(); }

    getBusho(id) { return this.bushos.find(b => b.id === id); }
    getCastle(id) { return this.castles.find(c => c.id === id); }
    getCastleBushos(cid) { return this.castles.find(c => c.id === cid).samuraiIds.map(id => this.getBusho(id)); }
    getCurrentTurnCastle() { return this.turnQueue[this.currentIndex]; }
    getCurrentTurnId() { return this.year * 12 + this.month; }

    isCastleVisible(castle) {
        if (castle.ownerClan === this.playerClanId) return true;
        if (castle.investigatedUntil >= this.getCurrentTurnId()) return true;
        return false;
    }

    startMonth() {
        this.ui.showCutin(`${this.year}年 ${this.month}月`);
        this.ui.log(`=== ${this.year}年 ${this.month}月 ===`);
        if (this.month % 3 === 0) this.optimizeCastellans();
        const isPopGrowth = (this.month % 2 === 0);

        this.castles.forEach(c => {
            if (c.ownerClan === 0) return;
            c.isDone = false;
            let income = Math.floor(c.commerce * CONFIG.Coef.IncomeGold);
            if(this.month === 3) income += 500;
            c.gold += income;
            if(this.month === 9) c.rice += c.kokudaka * 10;
            if (isPopGrowth) {
                const growth = Math.floor(c.population * 0.01 * (c.loyalty / 1000));
                c.population += growth;
            }
            const bushos = this.getCastleBushos(c.id);
            c.rice = Math.max(0, c.rice - Math.floor(c.soldiers * CONFIG.Coef.ConsumeRice));
            c.gold = Math.max(0, c.gold - (bushos.length * CONFIG.Coef.ConsumeGoldPerBusho));
            bushos.forEach(b => b.isActionDone = false);
        });
        this.turnQueue = this.castles.filter(c => c.ownerClan !== 0).sort(() => Math.random() - 0.5);
        this.currentIndex = 0;
        this.processTurn();
    }

    // AIによる城主最適化
    optimizeCastellans() {
        const clanIds = [...new Set(this.castles.filter(c=>c.ownerClan!==0).map(c=>c.ownerClan))];
        clanIds.forEach(clanId => {
            let daimyoInt = 50;
            const myBushos = this.bushos.filter(b => b.clan === clanId);
            if(myBushos.length > 0) daimyoInt = Math.max(...myBushos.map(b => b.intelligence));
            if (Math.random() * 100 < daimyoInt) {
                const clanCastles = this.castles.filter(c => c.ownerClan === clanId);
                clanCastles.forEach(castle => {
                    const castleBushos = this.getCastleBushos(castle.id);
                    if (castleBushos.length <= 1) return;
                    castleBushos.sort((a, b) => (b.strength + b.politics + b.intelligence) - (a.strength + a.politics + a.intelligence));
                    const best = castleBushos[0];
                    if (best.id !== castle.castellanId) {
                        const old = this.getBusho(castle.castellanId);
                        if(old) old.isCastellan = false;
                        best.isCastellan = true;
                        castle.castellanId = best.id;
                    }
                });
            }
        });
    }

    processTurn() {
        if (this.currentIndex >= this.turnQueue.length) {
            this.endMonth();
            return;
        }
        const castle = this.turnQueue[this.currentIndex];
        this.ui.renderMap();

        if (castle.ownerClan === this.playerClanId) {
            this.ui.log(`【${castle.name}】命令を下してください`);
            this.ui.showControlPanel(castle);
        } else {
            this.ui.log(`【${castle.name}】(他国) 思考中...`);
            document.getElementById('control-panel').classList.add('hidden');
            setTimeout(() => this.execAI(castle), 600);
        }
    }

    finishTurn() {
        this.selectionMode = null; 
        const castle = this.getCurrentTurnCastle();
        if(castle) castle.isDone = true;
        this.currentIndex++;
        this.processTurn();
    }

    endMonth() {
        this.month++;
        if(this.month > 12) { this.month = 1; this.year++; }
        const clans = new Set(this.castles.filter(c => c.ownerClan !== 0).map(c => c.ownerClan));
        const playerAlive = clans.has(this.playerClanId);
        if (clans.size === 1 && playerAlive) {
            const winner = CLAN_DATA.find(c => c.id === [...clans][0]);
            alert(`天下統一！ 勝者：${winner ? winner.name : '不明'}`);
        } else if (!playerAlive) {
            alert(`我が軍は滅亡しました...`);
        } else {
            this.startMonth();
        }
    }

    // --- Map Selection & Command Execution ---
    enterMapSelection(actionType) {
        this.selectionMode = actionType;
        const current = this.getCurrentTurnCastle();
        this.validTargets = [];
        if (actionType === 'war') {
            this.validTargets = this.castles.filter(c => c.ownerClan !== 0 && c.ownerClan !== current.ownerClan && GameSystem.isAdjacent(current, c));
        } else if (actionType === 'transport' || actionType === 'move') {
            this.validTargets = this.castles.filter(c => c.ownerClan === current.ownerClan && c.id !== current.id && GameSystem.isAdjacent(current, c));
        } else if (actionType === 'investigate') {
            this.validTargets = this.castles.filter(c => c.ownerClan !== 0 && c.ownerClan !== current.ownerClan);
        }
        if (this.validTargets.length === 0) { alert("対象となる城がありません"); this.selectionMode = null; return; }
        
        // キャンセルボタン表示のために一度CommandMenuを書き換える
        this.ui.cmdArea.innerHTML = '';
        const btn = document.createElement('button');
        btn.className = 'cmd-btn back';
        btn.textContent = "キャンセル";
        btn.onclick = () => this.ui.cancelMapSelection();
        this.ui.cmdArea.appendChild(btn);
        this.ui.renderMap();
    }

    resolveMapSelection(targetCastle) {
        if (!this.selectionMode) return;
        const actionType = this.selectionMode;
        this.selectionMode = null;
        this.ui.renderCommandMenu();
        if (actionType === 'war') this.ui.openBushoSelector('war_deploy', targetCastle.id);
        else if (actionType === 'move') this.ui.openBushoSelector('move_deploy', targetCastle.id);
        else if (actionType === 'transport') this.ui.openBushoSelector('transport_deploy', targetCastle.id);
        else if (actionType === 'investigate') this.ui.openBushoSelector('investigate_deploy', targetCastle.id);
        this.ui.renderMap(); 
    }

    executeCommand(type, bushoIds, targetId) {
        const castle = this.getCurrentTurnCastle();
        let msg = "";
        const busho = this.getBusho(bushoIds[0]);
        if (!busho) return;

        if (type === 'farm') {
            if (castle.gold < 500) { alert("金が足りません"); return; }
            const val = GameSystem.calcDevelopment(busho);
            castle.gold -= 500; castle.kokudaka = Math.min(castle.maxKokudaka, castle.kokudaka + val); 
            msg = `${busho.name}が石高を開発 (+${val})`;
        } else if (type === 'commerce') {
            if (castle.gold < 500) { alert("金が足りません"); return; }
            const val = GameSystem.calcDevelopment(busho);
            castle.gold -= 500; castle.commerce = Math.min(castle.maxCommerce, castle.commerce + val);
            msg = `${busho.name}が商業を開発 (+${val})`;
        } else if (type === 'charity') {
            if (castle.gold < 300) { alert("金が足りません"); return; }
            const val = GameSystem.calcCharity(busho);
            castle.gold -= 300; castle.loyalty = Math.min(castle.maxLoyalty, castle.loyalty + val);
            msg = `${busho.name}が施しを行いました (民忠+${val})`;
        } else if (type === 'repair') {
            if (castle.gold < 300) { alert("金不足"); return; }
            const val = GameSystem.calcRepair(busho);
            castle.gold -= 300; castle.defense = Math.min(castle.maxDefense, castle.defense + val); msg = `${busho.name}が城壁を修復 (+${val})`;
        } else if (type === 'appoint') {
            const old = this.getBusho(castle.castellanId);
            if(old) old.isCastellan = false;
            castle.castellanId = busho.id; busho.isCastellan = true; msg = `${busho.name}を城主に任命しました`;
        } else if (type === 'banish') {
            if(!confirm(`本当に ${busho.name} を追放しますか？`)) return;
            castle.samuraiIds = castle.samuraiIds.filter(id => id !== busho.id);
            busho.status = 'ronin'; busho.clan = 0; busho.castleId = 0; msg = `${busho.name}を追放しました`;
        } else if (type === 'move_deploy') {
            const targetC = this.getCastle(targetId);
            const movers = bushoIds.map(id => this.getBusho(id));
            if (movers.some(b => b.isCastellan)) { alert("城主は移動できません"); return; }
            movers.forEach(b => {
                castle.samuraiIds = castle.samuraiIds.filter(id => id !== b.id);
                targetC.samuraiIds.push(b.id);
                b.castleId = targetId; b.isActionDone = true;
            });
            msg = `${movers.length}名が${targetC.name}へ移動しました`;
            this.ui.renderCommandMenu(); this.ui.log(msg); this.ui.updatePanelHeader(); return;
        }
        busho.isActionDone = true;
        this.ui.log(msg);
        this.ui.updatePanelHeader();
        this.ui.renderCommandMenu();
    }

    executeDraft(busho, amount) {
        const castle = this.getCurrentTurnCastle();
        const costGold = Math.floor(amount * 0.5); const costRice = Math.floor(amount * 0.5);
        if (castle.gold < costGold || castle.rice < costRice || castle.population < amount) { alert("資源不足"); return; }
        castle.gold -= costGold; castle.rice -= costRice; castle.population -= amount; castle.soldiers += amount;
        const loyaltyLoss = Math.floor(amount / 500); 
        castle.loyalty = Math.max(0, castle.loyalty - loyaltyLoss);
        this.ui.log(`${busho.name}が${amount}名を徴兵しました`);
        busho.isActionDone = true;
        this.ui.updatePanelHeader(); this.ui.renderCommandMenu();
    }

    executeTransport(busho, targetId, vals) {
        const c = this.getCurrentTurnCastle(); const t = this.getCastle(targetId);
        c.gold -= vals.gold; c.rice -= vals.rice; c.soldiers -= vals.soldiers;
        t.gold += vals.gold; t.rice += vals.rice; t.soldiers += vals.soldiers;
        this.ui.log(`${busho.name}が${t.name}へ輸送しました`);
        busho.isActionDone = true;
        this.ui.updatePanelHeader(); this.ui.renderCommandMenu();
    }

    executeInvestigate(bushoId, targetId) {
        const busho = this.getBusho(bushoId); const target = this.getCastle(targetId);
        target.investigatedUntil = this.getCurrentTurnId() + 4;
        busho.isActionDone = true;
        this.ui.log(`${busho.name}が${target.name}を調査しました`);
        this.ui.updatePanelHeader(); this.ui.renderCommandMenu(); this.ui.renderMap();
    }

    executeWar(bushoIds, targetId, soldierCount) {
        const castle = this.getCurrentTurnCastle();
        const targetC = this.getCastle(targetId);
        const attackers = bushoIds.map(id => this.getBusho(id));
        attackers.forEach(b => b.isActionDone = true);
        castle.soldiers -= soldierCount;
        this.startWar(castle, targetC, attackers, soldierCount);
    }

    // AIロジック
    execAI(castle) {
        const castellan = this.getBusho(castle.castellanId);
        if (castellan && !castellan.isActionDone) {
            let attackDesire = castellan.personality === 'aggressive' ? 30 : castellan.personality === 'conservative' ? -30 : 0;
            attackDesire += (castellan.strength * 0.5);
            
            const enemies = this.castles.filter(c => c.ownerClan !== 0 && c.ownerClan !== castle.ownerClan && GameSystem.isAdjacent(castle, c));
            let bestTarget = null, maxWarScore = -999;
            const deploySoldiers = Math.floor(castle.soldiers * (0.6 + Math.random() * 0.2));

            if (enemies.length > 0) {
                enemies.forEach(target => {
                    let diffScore = (deploySoldiers - target.soldiers) / 100;
                    if (castellan.intelligence > 80 && diffScore < 0) diffScore *= 2.0;
                    if (deploySoldiers < target.soldiers * 0.8) diffScore -= 100;
                    let warScore = attackDesire + diffScore + (Math.random()*20 - 10);
                    if (warScore > maxWarScore) { maxWarScore = warScore; bestTarget = target; }
                });
            }

            if (bestTarget && maxWarScore > 80 && deploySoldiers > 2000) {
                castle.soldiers -= deploySoldiers;
                castellan.isActionDone = true;
                this.startWar(castle, bestTarget, [castellan], deploySoldiers);
                return;
            } else {
                // 内政
                if (castle.gold > 500) {
                    if (castle.loyalty < 600 && castellan.charm > 50) {
                         castle.gold -= 300;
                         const val = GameSystem.calcCharity(castellan);
                         castle.loyalty = Math.min(castle.maxLoyalty, castle.loyalty + val);
                         this.ui.log(`${castle.name}が施しを行いました`);
                    } else if (castle.soldiers < 5000 && castle.rice > 5000) {
                         const draftNum = Math.min(1000, GameSystem.calcDraftLimit(castle));
                         if(draftNum > 0) {
                             castle.soldiers += draftNum; castle.population -= draftNum;
                             castle.gold -= Math.floor(draftNum*0.5); castle.rice -= Math.floor(draftNum*0.5);
                             this.ui.log(`${castle.name}が徴兵を行いました`);
                         }
                    } else {
                        // 開発 or 修復
                        if(castle.defense < castle.maxDefense * 0.8) {
                            castle.defense = Math.min(castle.maxDefense, castle.defense + 100);
                            castle.gold -= 300;
                            this.ui.log(`${castle.name}が修復を行いました`);
                        } else {
                            castle.commerce = Math.min(castle.maxCommerce, castle.commerce + 10); 
                            castle.gold -= 500;
                            this.ui.log(`${castle.name}が商業開発を行いました`);
                        }
                    }
                }
                castellan.isActionDone = true;
            }
        }
        this.finishTurn();
    }

    // --- WAR SYSTEM ---
    startWar(atkCastle, defCastle, atkBushos, atkSoldierCount) {
        const isPlayerInvolved = (atkCastle.ownerClan === this.playerClanId || defCastle.ownerClan === this.playerClanId);
        const atkClan = CLAN_DATA.find(c => c.id === atkCastle.ownerClan);
        const atkGeneral = atkBushos[0].name;
        this.ui.showCutin(`${atkClan.name}軍の${atkGeneral}が\n${defCastle.name}に攻め込みました！`);

        let defBusho = this.getBusho(defCastle.castellanId);
        if (!defBusho) defBusho = {name:"守備隊長", strength:30, intelligence:30, charm:30};

        const attackerForce = { name: atkCastle.name + "遠征軍", ownerClan: atkCastle.ownerClan, soldiers: atkSoldierCount, bushos: atkBushos };
        this.warState = {
            active: true, round: 1, 
            attacker: attackerForce, sourceCastle: atkCastle,
            defender: defCastle, atkBushos: atkBushos, defBusho: defBusho,
            turn: 'attacker', isPlayerInvolved: isPlayerInvolved,
            deadSoldiers: { attacker: 0, defender: 0 } // 死亡兵記録
        };

        // 開戦時ペナルティ
        defCastle.loyalty = Math.max(0, defCastle.loyalty - 50);
        defCastle.population = Math.max(0, defCastle.population - 500);

        setTimeout(() => {
            if (isPlayerInvolved) {
                document.getElementById('war-modal').classList.remove('hidden');
                document.getElementById('war-log').innerHTML = '';
                this.ui.log(`★ ${atkCastle.name}が出陣(兵${atkSoldierCount})！ ${defCastle.name}へ攻撃！`);
                this.updateWarUI();
                this.processWarRound();
            } else {
                this.ui.log(`[合戦] ${atkCastle.name} vs ${defCastle.name} (結果のみ)`);
                this.resolveAutoWar();
            }
        }, 1500);
    }

    resolveAutoWar() {
        const s = this.warState;
        while(s.round <= 10 && s.attacker.soldiers > 0 && s.defender.soldiers > 0 && s.defender.defense > 0) {
            this.resolveWarAction('charge'); // 簡易AI
            if (s.attacker.soldiers <= 0 || s.defender.soldiers <= 0) break;
        }
        this.endWar(s.defender.soldiers <= 0 || s.defender.defense <= 0);
    }

    processWarRound() {
        if (!this.warState.active) return;
        const s = this.warState;
        
        if (s.defender.soldiers <= 0 || s.defender.defense <= 0) { this.endWar(true); return; }
        if (s.attacker.soldiers <= 0) { this.endWar(false); return; }

        this.updateWarUI();
        
        const isPlayerAtkSide = (s.attacker.ownerClan === this.playerClanId);
        const isPlayerDefSide = (s.defender.ownerClan === this.playerClanId);
        const isAtkTurn = (s.turn === 'attacker');
        
        document.getElementById('war-turn-actor').textContent = isAtkTurn ? "攻撃側" : "守備側";
        
        // プレイヤー操作判定
        let isPlayerTurn = (isAtkTurn && isPlayerAtkSide) || (!isAtkTurn && isPlayerDefSide);
        this.ui.renderWarControls(isAtkTurn); // コマンド更新

        if (isPlayerTurn) {
            document.getElementById('war-controls').classList.remove('disabled-area');
        } else {
            document.getElementById('war-controls').classList.add('disabled-area');
            setTimeout(() => this.execWarAI(), 800);
        }
    }

    execWarCmd(type) { 
        if(type === 'scheme') {
            // 謀略実行 (自軍の武将から選択)
            // この簡易実装では、大将が実行するものとする
            this.resolveWarAction('scheme');
        } else {
            document.getElementById('war-controls').classList.add('disabled-area');
            this.resolveWarAction(type); 
        }
    }
    
    execWarAI() { 
        // AI: 基本は攻撃、知略が高ければ謀略も混ぜる
        const actor = this.warState.turn === 'attacker' ? this.warState.atkBushos[0] : this.warState.defBusho;
        if(actor.intelligence > 80 && Math.random() < 0.3) {
            this.resolveWarAction('scheme');
        } else {
            this.resolveWarAction(this.warState.turn === 'attacker' ? 'charge' : 'def_charge');
        }
    }

    resolveWarAction(type) {
        if (!this.warState.active) return;
        
        if(type === 'retreat') {
             if(this.warState.turn === 'attacker') this.endWar(false); // 攻撃側撤退=敗北
             else this.endWar(true, true); // 防御側撤退=敗北だが、別処理(true, isRetreat=true)
             return;
        }

        const s = this.warState;
        const isAtkTurn = (s.turn === 'attacker');
        const target = isAtkTurn ? s.defender : s.attacker;
        
        let atkStats = GameSystem.calcUnitStats(s.atkBushos);
        let defStats = { str: s.defBusho.strength, int: s.defBusho.intelligence };

        // 謀略処理
        if (type === 'scheme') {
            const actor = isAtkTurn ? s.atkBushos[0] : s.defBusho; // 大将が実行
            const targetBusho = isAtkTurn ? s.defBusho : s.atkBushos[0];
            const result = GameSystem.calcScheme(actor, targetBusho, isAtkTurn ? s.defender.loyalty : 1000); // 攻撃側には民忠概念がないので1000仮定
            
            if (!result.success) {
                if (s.isPlayerInvolved) this.ui.log(`R${s.round} [${isAtkTurn?'攻':'守'}] 謀略失敗！`);
            } else {
                target.soldiers = Math.max(0, target.soldiers - result.damage);
                if (s.isPlayerInvolved) this.ui.log(`R${s.round} [${isAtkTurn?'攻':'守'}] 謀略成功！ 混乱により${result.damage}の被害`);
            }
            this.advanceWarTurn();
            return;
        }

        // 通常攻撃処理
        const result = GameSystem.calcWarDamage(atkStats, defStats, s.attacker.soldiers, s.defender.soldiers, s.defender.defense, isAtkTurn, type);
        
        // 被害適用と死亡兵記録
        const actualSoldierDmg = Math.min(target.soldiers, result.soldierDmg);
        target.soldiers -= actualSoldierDmg;
        if(isAtkTurn) s.deadSoldiers.defender += actualSoldierDmg;
        else s.deadSoldiers.attacker += actualSoldierDmg;

        if (type === 'siege' && isAtkTurn) {
            s.defender.defense = Math.max(0, s.defender.defense - result.wallDmg);
        }

        if (s.isPlayerInvolved) {
            let actionName = "攻撃";
            if (type.includes('bow')) actionName = "弓攻撃";
            if (type.includes('siege')) actionName = "城攻め";
            if (type.includes('charge')) actionName = "力攻め";
            
            let msg = (result.wallDmg > 0) ? `${actionName} (兵-${actualSoldierDmg} 防-${result.wallDmg})` : `${actionName} (兵-${actualSoldierDmg})`;
            this.ui.log(`R${s.round} [${isAtkTurn?'攻':'守'}] ${msg}`);
        }

        this.advanceWarTurn();
    }

    advanceWarTurn() {
        const s = this.warState;
        if (s.turn === 'attacker') {
            s.turn = 'defender';
        } else {
            s.turn = 'attacker'; 
            s.round++;
            if(s.round > 10) { this.endWar(false); return; }
        }
        if (s.isPlayerInvolved) this.processWarRound();
    }

    updateWarUI() {
        if (!this.warState.isPlayerInvolved) return;
        // UI更新処理 (省略なし)
        const els = {
            atkName: document.getElementById('war-atk-name'), atkSoldier: document.getElementById('war-atk-soldier'), atkBusho: document.getElementById('war-atk-busho'),
            defName: document.getElementById('war-def-name'), defSoldier: document.getElementById('war-def-soldier'), defWall: document.getElementById('war-def-wall'), defBusho: document.getElementById('war-def-busho'),
            round: document.getElementById('war-round')
        };
        const s = this.warState;
        els.atkName.textContent = s.attacker.name; els.atkSoldier.textContent = s.attacker.soldiers; els.atkBusho.textContent = s.atkBushos.map(b=>b.name).join(',');
        els.defName.textContent = s.defender.name; els.defSoldier.textContent = s.defender.soldiers; els.defWall.textContent = s.defender.defense; els.defBusho.textContent = s.defBusho.name;
        els.round.textContent = s.round;
    }

    // 戦争終了処理
    endWar(attackerWon, defenderRetreated = false) {
        const s = this.warState;
        s.active = false;
        if (s.isPlayerInvolved) document.getElementById('war-modal').classList.add('hidden');

        // 負傷兵の復帰計算
        const isShortWar = s.round < CONFIG.War.RetreatTurnLimit;
        const recoveryRate = isShortWar ? CONFIG.War.RetreatRecovery : CONFIG.War.WoundedRecovery;
        const atkRecovered = Math.floor(s.deadSoldiers.attacker * recoveryRate);
        const defRecovered = Math.floor(s.deadSoldiers.defender * recoveryRate);

        s.attacker.soldiers += atkRecovered;
        s.defender.soldiers += defRecovered; // 防御側は負けても残兵+復帰兵が残る（撤退時用）

        if (attackerWon) {
            // 防御側の敗北処理
            if (defenderRetreated) {
                // 撤退: 隣接する味方城へ移動
                const retreatCastle = GameSystem.getRetreatCastle(s.defender, this.castles);
                const defCastellan = this.getBusho(s.defender.castellanId);
                
                if (retreatCastle && defCastellan) {
                    this.ui.log(`＞＞ ${s.defender.name}の部隊は${retreatCastle.name}へ撤退しました`);
                    // 兵士合流
                    retreatCastle.soldiers += s.defender.soldiers;
                    // 武将移動
                    s.defender.samuraiIds = s.defender.samuraiIds.filter(id => id !== defCastellan.id);
                    retreatCastle.samuraiIds.push(defCastellan.id);
                    defCastellan.castleId = retreatCastle.id;
                    defCastellan.isCastellan = false; // 撤退先では一般
                } else {
                    this.ui.log(`＞＞ 撤退先がなく、部隊は散り散りになりました...`);
                    // 浪人化などの処理（今回は簡易的に城所属解除）
                    if(defCastellan) { defCastellan.castleId = 0; defCastellan.status = 'ronin'; }
                }
            } else {
                // 制圧: 捕虜判定へ
                this.processCaptures(s.defender, s.attacker.ownerClan);
            }

            this.ui.log(`＞＞ ${s.attacker.name}が${s.defender.name}を制圧！`);
            s.defender.ownerClan = s.attacker.ownerClan;
            s.defender.soldiers = s.attacker.soldiers; // 攻撃軍が入城
            s.defender.investigatedUntil = 0;
            
            // 攻撃武将の移動
            s.atkBushos.forEach((b, idx) => {
                const srcC = this.getCastle(s.sourceCastle.id);
                srcC.samuraiIds = srcC.samuraiIds.filter(id => id !== b.id);
                b.castleId = s.defender.id;
                s.defender.samuraiIds.push(b.id);
                if(idx === 0) { b.isCastellan = true; s.defender.castellanId = b.id; } else b.isCastellan = false;
            });

        } else {
            this.ui.log(`＞＞ ${s.attacker.name}の攻撃は失敗しました`);
            // 攻撃側は元の城に戻る（兵士は減少済み）
            const srcC = this.getCastle(s.sourceCastle.id);
            srcC.soldiers += s.attacker.soldiers; // 残存兵が戻る
        }

        if (s.attacker.ownerClan !== this.playerClanId) {
            this.finishTurn();
        } else {
            this.ui.renderCommandMenu(); 
            this.ui.renderMap();
        }
    }

    // 捕虜判定と処理
    processCaptures(defeatedCastle, winnerClanId) {
        // 城にいた武将（敗北側）
        const losers = this.getCastleBushos(defeatedCastle.id);
        const captives = [];

        losers.forEach(b => {
            // 捕獲確率: 基礎40% - (武力*0.2)% + ランダム
            let chance = CONFIG.Prisoner.BaseCaptureRate - (b.strength * 0.002) + (Math.random() * 0.3);
            // 兵士が残っていると捕まりにくい
            if (defeatedCastle.soldiers > 1000) chance -= 0.2;

            if (chance > 0.5) {
                captives.push(b);
            } else {
                // 逃亡 -> 浪人 or 隣接城へ（今回は浪人）
                b.clan = 0; b.castleId = 0; b.isCastellan = false; b.status = 'ronin';
            }
        });

        if (captives.length > 0) {
            this.pendingPrisoners = captives;
            if (winnerClanId === this.playerClanId) {
                // プレイヤー勝利時: UI表示
                this.ui.showPrisonerModal(captives);
            } else {
                // AI勝利時: 自動判定
                this.autoResolvePrisoners(captives, winnerClanId);
            }
        }
    }

    // プレイヤーの捕虜操作
    handlePrisonerAction(index, action) {
        const prisoner = this.pendingPrisoners[index];
        const playerClan = CLAN_DATA.find(c => c.id === this.playerClanId);
        
        if (action === 'hire') {
            // 登用判定
            // (自軍魅力 / (敵忠誠 * 難易度))
            // 簡易計算: プレイヤーの誰か(魅力高い奴) vs 忠誠
            const bestCharm = Math.max(...this.bushos.filter(b=>b.clan===this.playerClanId).map(b=>b.charm));
            const score = (bestCharm * 1.5) / (prisoner.loyalty * CONFIG.Prisoner.HireDifficulty);
            
            if (score > Math.random()) {
                prisoner.clan = this.playerClanId;
                prisoner.loyalty = 50; // 下がって加入
                // 現在のプレイヤー城（最後に操作していた城=勝った城）に配置
                const targetC = this.getCastle(prisoner.castleId); // 制圧直後なのでIDはそのまま
                targetC.samuraiIds.push(prisoner.id); // すでに配列にはいるかもだが、ステータス更新
                alert(`${prisoner.name}を登用しました！`);
            } else {
                alert(`${prisoner.name}は登用を拒否しました...`);
                return; // まだ処遇未定のまま
            }
        } else if (action === 'kill') {
            prisoner.status = 'dead';
            prisoner.clan = 0; prisoner.castleId = 0;
            // 死亡扱いとしてリストから除去する処理が必要だが、今回はステータス変更のみ
        } else if (action === 'release') {
            prisoner.status = 'ronin';
            prisoner.clan = 0; prisoner.castleId = 0;
        }

        // リストから除外してUI更新
        this.pendingPrisoners.splice(index, 1);
        if (this.pendingPrisoners.length === 0) {
            this.ui.closePrisonerModal();
        } else {
            this.ui.showPrisonerModal(this.pendingPrisoners);
        }
    }

    // AIの捕虜処理
    autoResolvePrisoners(captives, winnerClanId) {
        // AI大名（または軍団長）の知略
        const aiBushos = this.bushos.filter(b => b.clan === winnerClanId);
        const leaderInt = Math.max(...aiBushos.map(b => b.intelligence));
        
        captives.forEach(p => {
            // 知略が高いほど登用を試みる
            if ((leaderInt / 100) > Math.random()) {
                // 登用成功判定
                const aiBestCharm = Math.max(...aiBushos.map(b => b.charm));
                const score = (aiBestCharm * 1.5) / (p.loyalty * CONFIG.Prisoner.HireDifficulty);
                if(score > Math.random()) {
                    p.clan = winnerClanId; // 成功
                    p.loyalty = 50;
                    return;
                }
            }
            // 登用失敗or試みず -> 魅力が高いなら解放、低いなら処断
            if (p.charm > 60) {
                p.status = 'ronin'; p.clan = 0; p.castleId = 0;
            } else {
                p.status = 'dead'; p.clan = 0; p.castleId = 0;
            }
        });
    }
    
    saveGameToFile() {
        const data = { year: this.year, month: this.month, castles: this.castles, bushos: this.bushos, playerClanId: this.playerClanId };
        const blob = new Blob([JSON.stringify(data, null, 2)], {type: 'application/json'});
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = `sengoku_save_${this.year}_${this.month}.json`; a.click(); URL.revokeObjectURL(url);
    }

    loadGameFromFile(e) {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (evt) => {
            try {
                const d = JSON.parse(evt.target.result);
                this.year = d.year; this.month = d.month;
                this.playerClanId = d.playerClanId || 1;
                this.castles = d.castles.map(c => new Castle(c));
                this.bushos = d.bushos.map(b => new Busho(b));
                document.getElementById('title-screen').classList.add('hidden');
                document.getElementById('app').classList.remove('hidden');
                this.startMonth();
                alert("ロードしました");
            } catch(err) { alert("セーブデータの読み込みに失敗しました"); }
        };
        reader.readAsText(file);
    }
}

window.onload = () => { window.GameApp = new GameManager(); };