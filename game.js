/**
 * 戦国シミュレーションゲーム - 完全版
 */

/* --- Config & Data --- */
const CONFIG = {
    StartYear: 1560,
    StartMonth: 1,
    Coef: {
        IncomeGold: 0.5,
        ConsumeRice: 0.02,
        ConsumeGoldPerBusho: 50,
        DevPolitics: 5.0,
        DraftStr: 5.0,
        RepairPol: 5.0,
        CharityCharm: 2.0,
        BaseDev: 50,
        BaseDraft: 500,
        BaseRepair: 100,
        BaseCharity: 50
    },
    War: {
        MaxRounds: 10,
        AtkDmgCoef: 1.0,
        DefDmgCoef: 2.5,
        SoldierPower: 0.1,
        WallMitigation: 2.0
    }
};

// 相対パスで定義
const DATA_SOURCES = {
    castles: "./data/castles.csv",
    bushos: "./data/warriors.csv"
};

// デフォルトデータ (読み込み失敗時用・IDを5桁化)
const DEFAULT_CSV_CASTLES = `
id,name,ownerClan,x,y,castellanId,soldiers,gold,rice,kokudaka,commerce,defense,loyalty,population
1,魚津城,1,1,0,10102,8000,3000,15000,900,600,800,800,20000
2,春日山城,1,2,0,10101,12000,6000,25000,1500,1000,1200,900,30000
15,新発田城,1,3,0,10107,9000,3500,16000,950,700,900,850,22000
3,稲葉山城,5,0,1,10501,11000,5000,20000,1400,1200,1100,700,28000
4,岩村城,5,1,1,10503,7000,2000,12000,700,500,900,600,15000
5,海津城,2,2,1,10202,9000,3500,16000,900,700,1000,800,20000
6,厩橋城,1,3,1,10103,8000,3000,14000,850,800,700,750,18000
7,清州城,6,0,2,10601,11000,5500,22000,1600,1500,1000,850,35000
8,飯田城,2,1,2,10205,7500,2500,13000,750,600,800,700,16000
9,躑躅ヶ崎館,2,2,2,10201,13000,7000,24000,1600,1200,1100,950,32000
10,河越城,3,3,2,10302,8500,3500,17000,1000,900,900,800,21000
11,名古屋城,6,0,3,10603,9000,4000,18000,1100,1400,850,800,24000
12,曳馬城,4,1,3,10402,8000,3000,15000,900,1000,800,700,19000
13,駿府城,4,2,3,10401,12000,9000,28000,1800,2000,1300,900,38000
14,小田原城,3,3,3,10301,15000,8000,30000,2000,1800,2000,950,40000
`.trim();

const DEFAULT_CSV_BUSHOS = `
id,name,strength,politics,intelligence,charm,loyalty,clan,castleId,isCastellan,personality
10001,上杉謙信,100,60,90,95,100,1,2,true,aggressive
10002,柿崎景家,90,40,50,60,90,1,1,true,aggressive
10003,直江景綱,60,85,80,75,95,1,6,true,balanced
10004,宇佐美定満,70,70,92,70,88,1,2,false,conservative
10007,本庄繁長,88,50,70,65,85,1,15,true,aggressive
20001,武田信玄,95,95,95,98,100,2,9,true,aggressive
20002,高坂昌信,80,80,85,88,92,2,5,true,conservative
20003,山県昌景,92,60,70,75,95,2,9,false,aggressive
20004,山本勘助,60,70,98,60,95,2,5,false,balanced
20005,秋山信友,82,65,75,70,90,2,8,true,balanced
30001,北条氏康,88,95,92,94,100,3,14,true,conservative
30002,北条氏政,70,75,70,75,95,3,10,true,conservative
30003,北条綱成,93,50,60,85,98,3,14,false,aggressive
40001,今川義元,75,90,85,92,100,4,13,true,conservative
40002,朝比奈泰朝,82,60,60,70,90,4,12,true,balanced
40003,太原雪斎,50,98,98,85,100,4,13,false,conservative
50001,斎藤義龍,85,70,75,50,100,5,3,true,aggressive
50002,稲葉一鉄,80,70,80,60,80,5,3,false,balanced
50003,遠山景任,65,60,65,65,85,5,4,true,conservative
60001,織田信長,95,90,92,96,100,6,7,true,aggressive
60002,柴田勝家,96,50,60,75,95,6,7,false,aggressive
60003,佐久間信盛,75,75,70,60,88,6,11,true,conservative
`.trim();

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
            else console.log(`${url} not found, using default data.`);
        } catch(e) {
            console.log(`Fetch failed for ${url}, using default data.`);
        }
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
        let idCounter = 20000; // 5桁ID
        
        clans.forEach(clanId => {
            const clanCastles = castles.filter(c => c.ownerClan === clanId);
            if(clanCastles.length === 0) return;
            
            for(let i=0; i<10; i++) {
                const castle = clanCastles[Math.floor(Math.random() * clanCastles.length)];
                const rank = ranks[Math.floor(Math.random() * ranks.length)];
                const s = 30 + Math.floor(Math.random()*40);
                const p = 30 + Math.floor(Math.random()*40);
                const int = 30 + Math.floor(Math.random()*40);
                const ch = 30 + Math.floor(Math.random()*40);
                
                const b = new Busho({
                    id: idCounter++,
                    name: `武将${String.fromCharCode(65+i)}`,
                    strength: s, politics: p, intelligence: int, charm: ch,
                    loyalty: 80, clan: clanId, castleId: castle.id, 
                    isCastellan: false, personality: "balanced"
                });
                bushos.push(b);
                castle.samuraiIds.push(b.id);
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
        const limit = Math.floor(castle.population * 0.1 * loyaltyFactor);
        return Math.max(100, limit);
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
    static calcWarDamage(atkStats, defStats, atkSoldiers, defSoldiers, defWall, isAttackerTurn, type) {
        const rand = 0.8 + (Math.random() * 0.4);
        if (isAttackerTurn) {
            const baseDmg = (atkStats.str + (atkSoldiers * CONFIG.War.SoldierPower)) * CONFIG.War.AtkDmgCoef * rand;
            let multiplier = 1.0, soldierDmgRate = 1.0, wallDmgRate = 0.0;
            switch(type) {
                case 'bow': multiplier = 0.8; break;
                case 'charge': multiplier = 1.2; break;
                case 'siege': multiplier = 1.0; soldierDmgRate = 0.1; wallDmgRate = 1.5; break;
                case 'scheme': multiplier = 1.0; break;
            }
            const mitigation = defWall * CONFIG.War.WallMitigation;
            let finalDmg = (baseDmg * multiplier) - (mitigation * 0.5); 
            if (finalDmg < 10) finalDmg = 10 + Math.random() * 10;
            return { soldierDmg: Math.floor(finalDmg * soldierDmgRate), wallDmg: Math.floor(finalDmg * wallDmgRate * 0.5) };
        } else {
            const baseDmg = (defStats.str + (defSoldiers * CONFIG.War.SoldierPower) + (defWall * 0.5)) * CONFIG.War.DefDmgCoef * rand;
            return { soldierDmg: Math.floor(baseDmg), wallDmg: 0 };
        }
    }
    static tryScheme(atkInt, defInt) { return (atkInt / (defInt || 1)) * Math.random() > 0.6; }
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

        // ファイル読み込みリスナー
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
                    el.onclick = () => {
                        this.game.resolveMapSelection(c);
                    };
                } else {
                    el.style.opacity = '0.4'; 
                }
            } else {
                el.onclick = () => {
                    // 自ターンの城以外、または自ターン城でもクリックで詳細を見る
                    // (操作パネルは自ターン時に自動で出るので、ここでは詳細表示に統一する)
                    // ただし、もし今が手番の城なら「既にパネルが出てる」が、一応詳細閲覧も可能にする
                    this.showCastleInfo(c);
                };
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
            if (!this.currentCastle.castellanId) createBtn("城主任命", "", () => this.openBushoSelector('appoint'));
            createBtn("追放", "", () => this.openBushoSelector('banish'));
            createBtn("戻る", "back", () => { this.menuState = 'MAIN'; this.renderCommandMenu(); });
        }
        else if (this.menuState === 'SYSTEM') {
            createBtn("ファイル保存", "", () => window.GameApp.saveGameToFile());
            createBtn("ファイル読込", "", () => document.getElementById('load-file-input').click());
            createBtn("戻る", "back", () => { this.menuState = 'MAIN'; this.renderCommandMenu(); });
        }
    }

    // キャンセル機能: マップ選択解除してメニューを戻す
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
        let sortKey = 'strength'; // default
        let sortLabel = "武力";

        // アクション別の表示・ソート設定
        if (actionType === 'farm') {
            infoHtml = `<div>金: ${c.gold}</div>`;
            sortKey = 'politics'; sortLabel = '政治';
        } else if (actionType === 'commerce') {
            infoHtml = `<div>金: ${c.gold}</div>`;
            sortKey = 'politics'; sortLabel = '政治';
        } else if (actionType === 'charity') {
            infoHtml = `<div>金: ${c.gold}</div>`;
            sortKey = 'charm'; sortLabel = '魅力';
        } else if (actionType === 'repair') {
            infoHtml = `<div>金: ${c.gold}</div>`;
            sortKey = 'politics'; sortLabel = '政治';
        } else if (actionType === 'draft') {
            infoHtml = `<div>民忠: ${c.loyalty}</div>`;
            sortKey = 'strength'; sortLabel = '武力';
        } else if (actionType === 'war_deploy') {
            sortKey = 'strength'; sortLabel = '武力';
        } else if (actionType === 'investigate_deploy') {
            sortKey = 'intelligence'; sortLabel = '知略';
        } else {
            contextEl.classList.add('hidden');
        }
        
        contextEl.innerHTML = infoHtml;
        headerEl.innerHTML = `<span>名前</span><span>${sortLabel} (ソート順)</span>`;

        let bushos = this.game.getCastleBushos(this.currentCastle.id);
        
        // ソート実行
        bushos.sort((a,b) => {
            let valA = a[sortKey], valB = b[sortKey];
            return valB - valA;
        });

        const isMulti = (actionType === 'war_deploy' || actionType === 'move_deploy'); 
        
        bushos.forEach(b => {
            const div = document.createElement('div');
            const isDisabled = b.isActionDone;
            div.className = `select-item ${isDisabled ? 'disabled' : ''}`;
            
            const inputType = isMulti ? 'checkbox' : 'radio';
            // 表示する能力値
            const statVal = b[sortKey];
            
            div.innerHTML = `
                <input type="${inputType}" name="sel_busho" value="${b.id}" ${isDisabled ? 'disabled' : ''}>
                <div class="item-detail">
                    <span class="item-main">${b.name} ${b.isCastellan ? '(城主)' : ''}</span>
                    <span class="item-sub">${sortLabel}: <strong>${statVal}</strong> (武:${b.strength} 政:${b.politics} 智:${b.intelligence} 魅:${b.charm}) ${isDisabled ? '[済]' : ''}</span>
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

    showCastleBushosModal() {
        if (!this.currentCastle) return;
        this.showBushoList(this.currentCastle);
    }

    // マップタップ等から呼ばれる詳細閲覧
    showCastleInfo(castle) {
        const modal = document.getElementById('busho-detail-modal'); // 再利用
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
            
            // 武将一覧を見るボタンを追加
            html += `<button class="action-btn" onclick="window.GameApp.ui.showBushoListById(${castle.id})">武将一覧を見る</button>`;

        } else {
            html += `<p class="panel-msg">情報は不明です（調査が必要です）</p>`;
        }
        
        body.innerHTML = html;
    }

    // IDから武将リストを表示（HTML内のonclick用）
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
    }

    // 初期化はここではせず、ボタン押下で呼ぶ
    startNewGame() {
        this.boot();
    }

    async boot() {
        const data = await DataManager.loadAll();
        this.castles = data.castles;
        this.bushos = data.bushos;
        
        // タイトルを隠す
        document.getElementById('title-screen').classList.add('hidden');
        document.getElementById('app').classList.remove('hidden');

        this.ui.showStartScreen(CLAN_DATA, (clanId) => {
            this.playerClanId = clanId;
            this.init();
        });
    }

    init() {
        this.startMonth();
    }

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
                        if (clanId === this.playerClanId) {
                            this.ui.log(`[人事] ${castle.name}の城主を${best.name}に変更しました`);
                        }
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

    // --- Map Selection Logic ---
    enterMapSelection(actionType) {
        this.selectionMode = actionType;
        const current = this.getCurrentTurnCastle();
        this.validTargets = [];

        if (actionType === 'war') {
            this.validTargets = this.castles.filter(c => 
                c.ownerClan !== 0 && c.ownerClan !== current.ownerClan && GameSystem.isAdjacent(current, c));
        } else if (actionType === 'transport' || actionType === 'move') {
            this.validTargets = this.castles.filter(c => 
                c.ownerClan === current.ownerClan && c.id !== current.id && GameSystem.isAdjacent(current, c));
        } else if (actionType === 'investigate') {
            this.validTargets = this.castles.filter(c => 
                c.ownerClan !== 0 && c.ownerClan !== current.ownerClan);
        }

        if (this.validTargets.length === 0) {
            alert("対象となる城がありません");
            this.selectionMode = null;
            return;
        }
        
        // 戻るボタンを追加したメニューを描画するために、一度メニューを更新
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
        
        // メニューを元に戻す
        this.ui.renderCommandMenu();

        // コマンド実行用武将選択へ
        if (actionType === 'war') this.ui.openBushoSelector('war_deploy', targetCastle.id);
        else if (actionType === 'move') this.ui.openBushoSelector('move_deploy', targetCastle.id);
        else if (actionType === 'transport') this.ui.openBushoSelector('transport_deploy', targetCastle.id);
        else if (actionType === 'investigate') this.ui.openBushoSelector('investigate_deploy', targetCastle.id);
        
        this.ui.renderMap(); 
    }

    // --- Command Execution ---
    executeCommand(type, bushoIds, targetId) {
        const castle = this.getCurrentTurnCastle();
        let msg = "";
        const busho = this.getBusho(bushoIds[0]);
        if (!busho) return;

        if (type === 'farm') {
            if (castle.gold < 500) { alert("金が足りません"); return; }
            const val = GameSystem.calcDevelopment(busho);
            castle.gold -= 500; 
            castle.kokudaka = Math.min(castle.maxKokudaka, castle.kokudaka + val); 
            msg = `${busho.name}が石高を開発 (+${val})`;
        }
        else if (type === 'commerce') {
            if (castle.gold < 500) { alert("金が足りません"); return; }
            const val = GameSystem.calcDevelopment(busho);
            castle.gold -= 500; 
            castle.commerce = Math.min(castle.maxCommerce, castle.commerce + val);
            msg = `${busho.name}が商業を開発 (+${val})`;
        }
        else if (type === 'charity') {
            if (castle.gold < 300) { alert("金が足りません"); return; }
            const val = GameSystem.calcCharity(busho);
            castle.gold -= 300;
            castle.loyalty = Math.min(castle.maxLoyalty, castle.loyalty + val);
            msg = `${busho.name}が施しを行いました (民忠+${val})`;
        }
        else if (type === 'repair') {
            if (castle.gold < 300) { alert("金不足"); return; }
            const val = GameSystem.calcRepair(busho);
            castle.gold -= 300; castle.defense = Math.min(castle.maxDefense, castle.defense + val); msg = `${busho.name}が城壁を修復 (+${val})`;
        }
        else if (type === 'appoint') {
            const old = this.getBusho(castle.castellanId);
            if(old) old.isCastellan = false;
            castle.castellanId = busho.id; busho.isCastellan = true; msg = `${busho.name}を城主に任命しました`;
        }
        else if (type === 'banish') {
            if(!confirm(`本当に ${busho.name} を追放しますか？`)) return;
            castle.samuraiIds = castle.samuraiIds.filter(id => id !== busho.id);
            busho.status = 'ronin'; busho.clan = 0; busho.castleId = 0; msg = `${busho.name}を追放しました`;
        }
        else if (type === 'move_deploy') {
            const targetC = this.getCastle(targetId);
            const movers = bushoIds.map(id => this.getBusho(id));
            if (movers.some(b => b.isCastellan)) { alert("城主は移動できません"); return; }
            movers.forEach(b => {
                castle.samuraiIds = castle.samuraiIds.filter(id => id !== b.id);
                targetC.samuraiIds.push(b.id);
                b.castleId = targetId; b.isActionDone = true;
            });
            msg = `${movers.length}名が${targetC.name}へ移動しました`;
            this.ui.renderCommandMenu();
            this.ui.log(msg);
            this.ui.updatePanelHeader();
            return;
        }

        busho.isActionDone = true;
        this.ui.log(msg);
        this.ui.updatePanelHeader();
        this.ui.renderCommandMenu();
    }

    executeDraft(busho, amount) {
        const castle = this.getCurrentTurnCastle();
        const costGold = Math.floor(amount * 0.5);
        const costRice = Math.floor(amount * 0.5);
        if (castle.gold < costGold || castle.rice < costRice || castle.population < amount) {
            alert("資源または人口が不足しています"); return;
        }
        castle.gold -= costGold;
        castle.rice -= costRice;
        castle.population -= amount;
        castle.soldiers += amount;
        const loyaltyLoss = Math.floor(amount / 500); 
        castle.loyalty = Math.max(0, castle.loyalty - loyaltyLoss);
        this.ui.log(`${busho.name}が${amount}名を徴兵しました (民忠-${loyaltyLoss})`);
        busho.isActionDone = true;
        this.ui.updatePanelHeader();
        this.ui.renderCommandMenu();
    }

    executeTransport(busho, targetId, vals) {
        const c = this.getCurrentTurnCastle();
        const t = this.getCastle(targetId);
        c.gold -= vals.gold; c.rice -= vals.rice; c.soldiers -= vals.soldiers;
        t.gold += vals.gold; t.rice += vals.rice; t.soldiers += vals.soldiers;
        this.ui.log(`${busho.name}が${t.name}へ物資を輸送しました`);
        busho.isActionDone = true;
        this.ui.updatePanelHeader();
        this.ui.renderCommandMenu();
    }

    executeInvestigate(bushoId, targetId) {
        const busho = this.getBusho(bushoId);
        const target = this.getCastle(targetId);
        target.investigatedUntil = this.getCurrentTurnId() + 4;
        busho.isActionDone = true;
        this.ui.log(`${busho.name}が${target.name}を調査しました`);
        this.ui.updatePanelHeader();
        this.ui.renderCommandMenu();
        this.ui.renderMap();
    }

    executeWar(bushoIds, targetId, soldierCount) {
        const castle = this.getCurrentTurnCastle();
        const targetC = this.getCastle(targetId);
        const attackers = bushoIds.map(id => this.getBusho(id));
        attackers.forEach(b => b.isActionDone = true);
        castle.soldiers -= soldierCount;
        this.startWar(castle, targetC, attackers, soldierCount);
    }

    execAI(castle) {
        const castellan = this.getBusho(castle.castellanId);
        if (castellan && !castellan.isActionDone) {
            let attackDesire = 0;
            if (castellan.personality === 'aggressive') attackDesire += 30;
            else if (castellan.personality === 'conservative') attackDesire -= 30;
            
            attackDesire += (castellan.strength * 0.5);
            const enemies = this.castles.filter(c => c.ownerClan !== 0 && c.ownerClan !== castle.ownerClan && GameSystem.isAdjacent(castle, c));
            
            let bestTarget = null;
            let maxWarScore = -999;
            const deploySoldiers = Math.floor(castle.soldiers * (0.6 + Math.random() * 0.2));

            if (enemies.length > 0) {
                enemies.forEach(target => {
                    let diffScore = (deploySoldiers - target.soldiers) / 100;
                    if (castellan.intelligence > 80 && diffScore < 0) diffScore *= 2.0;
                    if (deploySoldiers < target.soldiers * 0.8) diffScore -= 100;
                    let warScore = attackDesire + diffScore;
                    if (warScore > maxWarScore) { maxWarScore = warScore; bestTarget = target; }
                });
            }

            if (bestTarget && maxWarScore > 80 && deploySoldiers > 2000) {
                castle.soldiers -= deploySoldiers;
                castellan.isActionDone = true;
                this.startWar(castle, bestTarget, [castellan], deploySoldiers);
                return;
            } else {
                if (castle.gold > 500) {
                    if (castle.loyalty < 600 && castellan.charm > 50) {
                         castle.gold -= 300;
                         const val = GameSystem.calcCharity(castellan);
                         castle.loyalty = Math.min(castle.maxLoyalty, castle.loyalty + val);
                         this.ui.log(`${castle.name}が施しを行いました`);
                    } else if (castle.soldiers < 5000 && castle.rice > 5000) {
                         const draftNum = Math.min(1000, GameSystem.calcDraftLimit(castle));
                         if(draftNum > 0) {
                             castle.soldiers += draftNum; 
                             castle.population -= draftNum;
                             castle.gold -= Math.floor(draftNum*0.5);
                             castle.rice -= Math.floor(draftNum*0.5);
                             this.ui.log(`${castle.name}が徴兵を行いました`);
                         }
                    } else if (castellan.politics > 60) {
                        if (castle.commerce < castle.maxCommerce) {
                            castle.commerce = Math.min(castle.maxCommerce, castle.commerce + 10); 
                            castle.gold -= 500;
                            this.ui.log(`${castle.name}が商業開発を行いました`);
                        } else {
                             castle.defense = Math.min(castle.maxDefense, castle.defense + 10);
                             castle.gold -= 300;
                             this.ui.log(`${castle.name}が修復を行いました`);
                        }
                    }
                }
                castellan.isActionDone = true;
            }
        }
        this.finishTurn();
    }

    startWar(atkCastle, defCastle, atkBushos, atkSoldierCount) {
        const isPlayerInvolved = (atkCastle.ownerClan === this.playerClanId || defCastle.ownerClan === this.playerClanId);
        const atkClan = CLAN_DATA.find(c => c.id === atkCastle.ownerClan);
        const atkGeneral = atkBushos[0].name;
        const msg = `${atkClan.name}軍の${atkGeneral}が\n${defCastle.name}に攻め込みました！`;
        this.ui.showCutin(msg);

        let defBusho = this.getBusho(defCastle.castellanId);
        if (!defBusho) defBusho = {name:"守備隊長", strength:30, intelligence:30, charm:30};

        const attackerForce = { name: atkCastle.name + "遠征軍", ownerClan: atkCastle.ownerClan, soldiers: atkSoldierCount, bushos: atkBushos };
        this.warState = {
            active: true, round: 1, 
            attacker: attackerForce, sourceCastle: atkCastle,
            defender: defCastle, atkBushos: atkBushos, defBusho: defBusho,
            turn: 'attacker', isPlayerInvolved: isPlayerInvolved
        };

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
            this.resolveWarAction('charge');
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
        let isPlayerTurn = (isAtkTurn && isPlayerAtkSide) || (!isAtkTurn && isPlayerDefSide);
        if (isPlayerTurn) document.getElementById('war-controls').classList.remove('disabled-area');
        else {
            document.getElementById('war-controls').classList.add('disabled-area');
            setTimeout(() => this.execWarAI(), 800);
        }
    }

    execWarCmd(type) { 
        document.getElementById('war-controls').classList.add('disabled-area');
        this.resolveWarAction(type); 
    }
    execWarAI() { this.resolveWarAction('charge'); }

    resolveWarAction(type) {
        if (!this.warState.active) return;
        if(type === 'retreat') {
             if(this.warState.turn === 'attacker') this.endWar(false);
             else this.endWar(true); 
             return;
        }
        const s = this.warState;
        const isAtkTurn = (s.turn === 'attacker');
        const target = isAtkTurn ? s.defender : s.attacker;
        let atkStats = { str: GameSystem.getBestStat(s.atkBushos, 'str'), int: GameSystem.getBestStat(s.atkBushos, 'int') };
        let defStats = { str: s.defBusho.strength, int: s.defBusho.intelligence };

        if (type === 'scheme') {
            const success = GameSystem.tryScheme(isAtkTurn ? atkStats.int : defStats.int, isAtkTurn ? defStats.int : atkStats.int);
            if (!success) {
                if (s.isPlayerInvolved) {
                    const logDiv = document.createElement('div');
                    logDiv.textContent = `R${s.round} [${isAtkTurn?'攻':'守'}] 計略失敗！`;
                    document.getElementById('war-log').prepend(logDiv);
                }
                this.advanceWarTurn();
                return;
            }
        }
        const result = GameSystem.calcWarDamage(atkStats, defStats, s.attacker.soldiers, s.defender.soldiers, s.defender.defense, isAtkTurn, type);
        target.soldiers = Math.max(0, target.soldiers - result.soldierDmg);
        if (type === 'siege' && isAtkTurn) target.defense = Math.max(0, target.defense - result.wallDmg);

        if (s.isPlayerInvolved) {
            const logDiv = document.createElement('div');
            let actionName = type === 'bow' ? "弓攻撃" : type === 'siege' ? "攻撃" : type === 'charge' ? "力攻め" : "計略";
            let msg = (result.wallDmg > 0) ? `${actionName} (兵-${result.soldierDmg} 防-${result.wallDmg})` : `${actionName} (兵-${result.soldierDmg})`;
            logDiv.textContent = `R${s.round} [${isAtkTurn?'攻':'守'}] ${msg}`;
            document.getElementById('war-log').prepend(logDiv);
        }
        this.advanceWarTurn();
    }

    advanceWarTurn() {
        const s = this.warState;
        if (s.turn === 'attacker') s.turn = 'defender';
        else { s.turn = 'attacker'; s.round++; if(s.round > 10) { this.endWar(false); return; } }
        if (s.isPlayerInvolved) this.processWarRound();
    }

    updateWarUI() {
        if (!this.warState.isPlayerInvolved) return;
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

    endWar(attackerWon) {
        const s = this.warState;
        s.active = false;
        if (s.isPlayerInvolved) document.getElementById('war-modal').classList.add('hidden');
        
        if (attackerWon) {
            this.ui.log(`＞＞ ${s.attacker.name}が${s.defender.name}を制圧！`);
            s.defender.ownerClan = s.attacker.ownerClan;
            s.defender.soldiers = s.attacker.soldiers;
            s.defender.investigatedUntil = 0;

            const defCastellan = this.getBusho(s.defender.castellanId);
            if(defCastellan) { defCastellan.isCastellan = false; defCastellan.castleId = 0; defCastellan.status = 'ronin'; }
            
            s.atkBushos.forEach((b, idx) => {
                const srcC = this.getCastle(s.sourceCastle.id);
                srcC.samuraiIds = srcC.samuraiIds.filter(id => id !== b.id);
                b.castleId = s.defender.id;
                s.defender.samuraiIds.push(b.id);
                if(idx === 0) { b.isCastellan = true; s.defender.castellanId = b.id; } else b.isCastellan = false;
            });
        } else {
            this.ui.log(`＞＞ ${s.attacker.name}の攻撃は失敗しました`);
        }

        if (s.attacker.ownerClan !== this.playerClanId) {
            this.finishTurn();
        } else {
            this.ui.renderCommandMenu(); 
            this.ui.renderMap();
        }
    }
    
    // --- File Save/Load ---
    saveGameToFile() {
        const data = {
            year: this.year, month: this.month, 
            castles: this.castles, bushos: this.bushos, 
            playerClanId: this.playerClanId
        };
        const blob = new Blob([JSON.stringify(data, null, 2)], {type: 'application/json'});
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `sengoku_save_${this.year}_${this.month}.json`;
        a.click();
        URL.revokeObjectURL(url);
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
                
                // ロード完了処理
                document.getElementById('title-screen').classList.add('hidden');
                document.getElementById('app').classList.remove('hidden');
                this.startMonth();
                alert("ロードしました");
            } catch(err) {
                alert("セーブデータの読み込みに失敗しました");
            }
        };
        reader.readAsText(file);
    }
}

// 起動時はタイトル表示のため、インスタンス生成のみ
window.onload = () => { window.GameApp = new GameManager(); };