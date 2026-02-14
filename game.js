/**
 * 戦国シミュレーションゲーム - UI刷新・調査機能・増員版
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

const MASTER_DATA = {
    clans: [
        { id: 1, name: "上杉家", color: "#d32f2f" },
        { id: 2, name: "武田家", color: "#1976d2" },
        { id: 3, name: "北条家", color: "#fbc02d" },
        { id: 4, name: "今川家", color: "#7b1fa2" },
        { id: 5, name: "斎藤家", color: "#388e3c" },
        { id: 6, name: "織田家", color: "#212121" }
    ],
    castles: [
        // y=0
        { id: 1, name: "魚津城", ownerClan: 1, x: 1, y: 0, castellanId: 102, samuraiIds: [102], soldiers: 8000, gold: 3000, rice: 15000, kokudaka: 900, commerce: 600, defense: 800, loyalty: 800, population: 20000 },
        { id: 2, name: "春日山城", ownerClan: 1, x: 2, y: 0, castellanId: 101, samuraiIds: [101, 104], soldiers: 12000, gold: 6000, rice: 25000, kokudaka: 1500, commerce: 1000, defense: 1200, loyalty: 900, population: 30000 },
        { id: 15, name: "新発田城", ownerClan: 1, x: 3, y: 0, castellanId: 107, samuraiIds: [107], soldiers: 9000, gold: 3500, rice: 16000, kokudaka: 950, commerce: 700, defense: 900, loyalty: 850, population: 22000 },
        // y=1
        { id: 3, name: "稲葉山城", ownerClan: 5, x: 0, y: 1, castellanId: 501, samuraiIds: [501, 502], soldiers: 11000, gold: 5000, rice: 20000, kokudaka: 1400, commerce: 1200, defense: 1100, loyalty: 700, population: 28000 },
        { id: 4, name: "岩村城", ownerClan: 5, x: 1, y: 1, castellanId: 503, samuraiIds: [503], soldiers: 7000, gold: 2000, rice: 12000, kokudaka: 700, commerce: 500, defense: 900, loyalty: 600, population: 15000 },
        { id: 5, name: "海津城", ownerClan: 2, x: 2, y: 1, castellanId: 202, samuraiIds: [202, 204], soldiers: 9000, gold: 3500, rice: 16000, kokudaka: 900, commerce: 700, defense: 1000, loyalty: 800, population: 20000 },
        { id: 6, name: "厩橋城", ownerClan: 1, x: 3, y: 1, castellanId: 103, samuraiIds: [103], soldiers: 8000, gold: 3000, rice: 14000, kokudaka: 850, commerce: 800, defense: 700, loyalty: 750, population: 18000 },
        // y=2
        { id: 7, name: "清州城", ownerClan: 6, x: 0, y: 2, castellanId: 601, samuraiIds: [601, 602], soldiers: 11000, gold: 5500, rice: 22000, kokudaka: 1600, commerce: 1500, defense: 1000, loyalty: 850, population: 35000 },
        { id: 8, name: "飯田城", ownerClan: 2, x: 1, y: 2, castellanId: 205, samuraiIds: [205], soldiers: 7500, gold: 2500, rice: 13000, kokudaka: 750, commerce: 600, defense: 800, loyalty: 700, population: 16000 },
        { id: 9, name: "躑躅ヶ崎館", ownerClan: 2, x: 2, y: 2, castellanId: 201, samuraiIds: [201, 203], soldiers: 13000, gold: 7000, rice: 24000, kokudaka: 1600, commerce: 1200, defense: 1100, loyalty: 950, population: 32000 },
        { id: 10, name: "河越城", ownerClan: 3, x: 3, y: 2, castellanId: 302, samuraiIds: [302], soldiers: 8500, gold: 3500, rice: 17000, kokudaka: 1000, commerce: 900, defense: 900, loyalty: 800, population: 21000 },
        // y=3
        { id: 11, name: "名古屋城", ownerClan: 6, x: 0, y: 3, castellanId: 603, samuraiIds: [603], soldiers: 9000, gold: 4000, rice: 18000, kokudaka: 1100, commerce: 1400, defense: 850, loyalty: 800, population: 24000 },
        { id: 12, name: "曳馬城", ownerClan: 4, x: 1, y: 3, castellanId: 402, samuraiIds: [402], soldiers: 8000, gold: 3000, rice: 15000, kokudaka: 900, commerce: 1000, defense: 800, loyalty: 700, population: 19000 },
        { id: 13, name: "駿府城", ownerClan: 4, x: 2, y: 3, castellanId: 401, samuraiIds: [401, 403], soldiers: 12000, gold: 9000, rice: 28000, kokudaka: 1800, commerce: 2000, defense: 1300, loyalty: 900, population: 38000 },
        { id: 14, name: "小田原城", ownerClan: 3, x: 3, y: 3, castellanId: 301, samuraiIds: [301, 303], soldiers: 15000, gold: 8000, rice: 30000, kokudaka: 2000, commerce: 1800, defense: 2000, loyalty: 950, population: 40000 }
    ],
    // 既存有名武将
    bushos: [
        // Uesugi (1)
        { id: 101, name: "上杉謙信", strength: 100, politics: 60, intelligence: 90, charm: 95, loyalty: 100, clan: 1, castleId: 2, isCastellan: true, personality: "aggressive" },
        { id: 102, name: "柿崎景家", strength: 90,  politics: 40, intelligence: 50, charm: 60, loyalty: 90,  clan: 1, castleId: 1, isCastellan: true, personality: "aggressive" },
        { id: 103, name: "直江景綱", strength: 60,  politics: 85, intelligence: 80, charm: 75, loyalty: 95,  clan: 1, castleId: 6, isCastellan: true, personality: "balanced" },
        { id: 104, name: "宇佐美定満", strength: 70, politics: 70, intelligence: 92, charm: 70, loyalty: 88, clan: 1, castleId: 2, isCastellan: false, personality: "conservative" },
        { id: 107, name: "本庄繁長", strength: 88,  politics: 50, intelligence: 70, charm: 65, loyalty: 85,  clan: 1, castleId: 15, isCastellan: true, personality: "aggressive" },
        // Takeda (2)
        { id: 201, name: "武田信玄", strength: 95,  politics: 95, intelligence: 95, charm: 98, loyalty: 100, clan: 2, castleId: 9, isCastellan: true, personality: "aggressive" },
        { id: 202, name: "高坂昌信", strength: 80,  politics: 80, intelligence: 85, charm: 88, loyalty: 92,  clan: 2, castleId: 5, isCastellan: true, personality: "conservative" },
        { id: 203, name: "山県昌景", strength: 92,  politics: 60, intelligence: 70, charm: 75, loyalty: 95,  clan: 2, castleId: 9, isCastellan: false, personality: "aggressive" },
        { id: 204, name: "山本勘助", strength: 60,  politics: 70, intelligence: 98, charm: 60, loyalty: 95,  clan: 2, castleId: 5, isCastellan: false, personality: "balanced" },
        { id: 205, name: "秋山信友", strength: 82,  politics: 65, intelligence: 75, charm: 70, loyalty: 90,  clan: 2, castleId: 8, isCastellan: true, personality: "balanced" },
        // Hojo (3)
        { id: 301, name: "北条氏康", strength: 88,  politics: 95, intelligence: 92, charm: 94, loyalty: 100, clan: 3, castleId: 14, isCastellan: true, personality: "conservative" },
        { id: 302, name: "北条氏政", strength: 70,  politics: 75, intelligence: 70, charm: 75, loyalty: 95,  clan: 3, castleId: 10, isCastellan: true, personality: "conservative" },
        { id: 303, name: "北条綱成", strength: 93,  politics: 50, intelligence: 60, charm: 85, loyalty: 98,  clan: 3, castleId: 14, isCastellan: false, personality: "aggressive" },
        // Imagawa (4)
        { id: 401, name: "今川義元", strength: 75,  politics: 90, intelligence: 85, charm: 92, loyalty: 100, clan: 4, castleId: 13, isCastellan: true, personality: "conservative" },
        { id: 402, name: "朝比奈泰朝", strength: 82, politics: 60, intelligence: 60, charm: 70, loyalty: 90, clan: 4, castleId: 12, isCastellan: true, personality: "balanced" },
        { id: 403, name: "太原雪斎", strength: 50,  politics: 98, intelligence: 98, charm: 85, loyalty: 100, clan: 4, castleId: 13, isCastellan: false, personality: "conservative" },
        // Saito (5)
        { id: 501, name: "斎藤義龍", strength: 85,  politics: 70, intelligence: 75, charm: 50, loyalty: 100, clan: 5, castleId: 3, isCastellan: true, personality: "aggressive" },
        { id: 502, name: "稲葉一鉄", strength: 80,  politics: 70, intelligence: 80, charm: 60, loyalty: 80,  clan: 5, castleId: 3, isCastellan: false, personality: "balanced" },
        { id: 503, name: "遠山景任", strength: 65,  politics: 60, intelligence: 65, charm: 65, loyalty: 85,  clan: 5, castleId: 4, isCastellan: true, personality: "conservative" },
        // Oda (6)
        { id: 601, name: "織田信長", strength: 95,  politics: 90, intelligence: 92, charm: 96, loyalty: 100, clan: 6, castleId: 7, isCastellan: true, personality: "aggressive" },
        { id: 602, name: "柴田勝家", strength: 96,  politics: 50, intelligence: 60, charm: 75, loyalty: 95,  clan: 6, castleId: 7, isCastellan: false, personality: "aggressive" },
        { id: 603, name: "佐久間信盛", strength: 75, politics: 75, intelligence: 70, charm: 60, loyalty: 88, clan: 6, castleId: 11, isCastellan: true, personality: "conservative" }
    ]
};

/* --- Models --- */
class Busho {
    constructor(data) {
        Object.assign(this, data);
        this.fatigue = 0;
        this.isActionDone = false;
        if(!this.personality) this.personality = 'balanced';
        if(!this.charm) this.charm = 50; 
    }
}
class Castle {
    constructor(data) {
        Object.assign(this, data);
        this.samuraiIds = [...data.samuraiIds];
        this.maxDefense = data.defense * 2; 
        this.maxKokudaka = data.kokudaka * 2;
        this.maxCommerce = data.commerce * 2;
        this.maxLoyalty = 1000;
        this.isDone = false;
        if(!this.loyalty) this.loyalty = 500;
        if(!this.population) this.population = 10000;
        
        // 調査済み期限 (ターンID: year*12 + month で管理)
        // 初期状態は自分と接触しているかどうか等に関わらず0
        this.investigatedUntil = 0;
    }
}

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

    static isAdjacent(c1, c2) {
        return (Math.abs(c1.x - c2.x) + Math.abs(c1.y - c2.y)) === 1;
    }

    static getBestStat(bushos, type) {
        if (!bushos || bushos.length === 0) return 30;
        let max = 0;
        bushos.forEach(b => {
            let val = 0;
            if (type === 'str') val = b.strength;
            else if (type === 'int') val = b.intelligence;
            else if (type === 'charm') val = b.charm;
            if (val > max) max = val;
        });
        return max;
    }

    static calcWarDamage(atkStats, defStats, atkSoldiers, defSoldiers, defWall, isAttackerTurn, type) {
        const rand = 0.8 + (Math.random() * 0.4);

        if (isAttackerTurn) {
            const baseDmg = (atkStats.str + (atkSoldiers * CONFIG.War.SoldierPower)) * CONFIG.War.AtkDmgCoef * rand;
            let multiplier = 1.0;
            let soldierDmgRate = 1.0;
            let wallDmgRate = 0.0;

            switch(type) {
                case 'bow': multiplier = 0.8; break;
                case 'charge': multiplier = 1.2; break;
                case 'siege': 
                    multiplier = 1.0; 
                    soldierDmgRate = 0.1;
                    wallDmgRate = 1.5;
                    break;
                case 'scheme': multiplier = 1.0; break;
            }

            const mitigation = defWall * CONFIG.War.WallMitigation;
            let finalDmg = (baseDmg * multiplier) - (mitigation * 0.5); 
            if (finalDmg < 10) finalDmg = 10 + Math.random() * 10;

            return {
                soldierDmg: Math.floor(finalDmg * soldierDmgRate),
                wallDmg: Math.floor(finalDmg * wallDmgRate * 0.5)
            };

        } else {
            const baseDmg = (defStats.str + (defSoldiers * CONFIG.War.SoldierPower) + (defWall * 0.5)) * CONFIG.War.DefDmgCoef * rand;
            return { soldierDmg: Math.floor(baseDmg), wallDmg: 0 };
        }
    }

    static tryScheme(atkInt, defInt) {
        const ratio = (atkInt / (defInt || 1));
        const check = ratio * Math.random(); 
        return check > 0.6;
    }
}

/* --- UI Manager --- */
class UIManager {
    constructor(game) {
        this.game = game;
        this.currentCastle = null;
        this.menuState = 'MAIN';
        
        this.mapEl = document.getElementById('map-container');
        this.panelEl = document.getElementById('control-panel');
        this.statusContainer = document.getElementById('status-container');
        this.cmdArea = document.getElementById('command-area');
        this.logEl = document.getElementById('log-content');
        this.selectorModal = document.getElementById('selector-modal');
        this.selectorList = document.getElementById('selector-list');
        this.selectorContextInfo = document.getElementById('selector-context-info');
        this.selectorConfirmBtn = document.getElementById('selector-confirm-btn');
        this.startScreen = document.getElementById('start-screen');
        this.cutinOverlay = document.getElementById('cutin-overlay');
        this.cutinMessage = document.getElementById('cutin-message');
        
        this.quantityModal = document.getElementById('quantity-modal');
        this.quantityContainer = document.getElementById('quantity-container');
        this.quantityConfirmBtn = document.getElementById('quantity-confirm-btn');
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

        this.game.castles.forEach(c => {
            const el = document.createElement('div');
            el.className = 'castle-card';
            el.dataset.clan = c.ownerClan;
            
            el.style.setProperty('--c-x', c.x + 1);
            el.style.setProperty('--c-y', c.y + 1);

            if (c.isDone) el.classList.add('done');
            if (this.game.getCurrentTurnCastle() === c && !c.isDone) {
                el.classList.add('active-turn');
            }

            const castellan = this.game.getBusho(c.castellanId);
            const clanData = MASTER_DATA.clans.find(cl => cl.id === c.ownerClan);
            const clanName = clanData ? clanData.name : "中立";

            // 情報可視判定
            const isVisible = this.game.isCastleVisible(c);
            const soldierText = isVisible ? c.soldiers : "???";
            const castellanName = isVisible ? (castellan ? castellan.name : '-') : "???";

            el.innerHTML = `
                <div class="card-header"><h3>${c.name}</h3></div>
                <div class="card-owner">${clanName}</div>
                <div class="param-grid">
                    <div class="param-item"><span>城主</span> <strong>${castellanName}</strong></div>
                    <div class="param-item"><span>兵数</span> ${soldierText}</div>
                </div>
            `;
            if(clanData) el.style.borderTop = `5px solid ${clanData.color}`;

            el.onclick = () => {
                // 自分のではない城をクリックした場合は詳細閲覧(ただし見えない情報は隠す)
                // 自分のターンで、かつ自分の城ならコントロールパネル
                if(this.game.getCurrentTurnCastle() === c && c.ownerClan === this.game.playerClanId) {
                    // Do nothing, already handled by flow
                } else {
                    this.showCastleInfo(c);
                }
            };
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

    // 縦並び・バー付きステータス表示
    updatePanelHeader() {
        if (!this.currentCastle) return;
        const c = this.currentCastle;
        const clanData = MASTER_DATA.clans.find(cd => cd.id === c.ownerClan);
        
        document.getElementById('panel-title').textContent = c.name;
        document.getElementById('panel-clan').textContent = clanData ? clanData.name : "--";
        
        // ステータスリスト生成
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
            createBtn("【開発】 石高・商業・施し", "category", () => { this.menuState = 'DEVELOP'; this.renderCommandMenu(); });
            createBtn("【軍事】 出陣・徴兵・修復・輸送", "category", () => { this.menuState = 'MILITARY'; this.renderCommandMenu(); });
            createBtn("【情報】 調査・詳細", "category", () => { this.menuState = 'INFO'; this.renderCommandMenu(); });
            createBtn("【人事】 移動・任命・追放", "category", () => { this.menuState = 'PERSONNEL'; this.renderCommandMenu(); });
            createBtn("命令終了 (ターン送り)", "finish", () => this.game.finishTurn());
        }
        else if (this.menuState === 'DEVELOP') {
            createBtn("石高開発 (金500)", "", () => this.openBushoSelector('farm'));
            createBtn("商業開発 (金500)", "", () => this.openBushoSelector('commerce'));
            createBtn("施し (金300)", "", () => this.openBushoSelector('charity'));
            createBtn("戻る", "back", () => { this.menuState = 'MAIN'; this.renderCommandMenu(); });
        }
        else if (this.menuState === 'MILITARY') {
            createBtn("出陣 (隣接敵国)", "", () => this.openTargetCastleSelector('war'));
            createBtn("徴兵 (金/兵糧/人口)", "", () => this.openBushoSelector('draft'));
            createBtn("城壁修復 (金300)", "", () => this.openBushoSelector('repair'));
            createBtn("輸送 (隣接自国)", "", () => this.openTargetCastleSelector('transport'));
            createBtn("戻る", "back", () => { this.menuState = 'MAIN'; this.renderCommandMenu(); });
        }
        else if (this.menuState === 'INFO') {
            createBtn("調査 (他国情報)", "", () => this.openTargetCastleSelector('investigate'));
            createBtn("戻る", "back", () => { this.menuState = 'MAIN'; this.renderCommandMenu(); });
        }
        else if (this.menuState === 'PERSONNEL') {
            createBtn("武将移動 (隣接自国)", "", () => this.openTargetCastleSelector('move'));
            if (!this.currentCastle.castellanId) createBtn("城主任命", "", () => this.openBushoSelector('appoint'));
            createBtn("追放", "", () => this.openBushoSelector('banish'));
            createBtn("戻る", "back", () => { this.menuState = 'MAIN'; this.renderCommandMenu(); });
        }
    }

    openBushoSelector(actionType, targetId = null) {
        this.selectorModal.classList.remove('hidden');
        document.getElementById('selector-title').textContent = "武将を選択";
        this.selectorList.innerHTML = '';
        
        // コンテキスト情報の表示
        const contextEl = document.getElementById('selector-context-info');
        contextEl.classList.remove('hidden');
        const c = this.currentCastle;
        let infoHtml = "";
        
        if (actionType === 'farm') {
            infoHtml = `<div><strong>所持金:</strong> ${c.gold}</div><div><strong>現在の石高:</strong> ${c.kokudaka} / ${c.maxKokudaka}</div>`;
        } else if (actionType === 'commerce') {
            infoHtml = `<div><strong>所持金:</strong> ${c.gold}</div><div><strong>現在の商業:</strong> ${c.commerce} / ${c.maxCommerce}</div>`;
        } else if (actionType === 'charity') {
            infoHtml = `<div><strong>所持金:</strong> ${c.gold}</div><div><strong>現在の民忠:</strong> ${c.loyalty} / 1000</div>`;
        } else if (actionType === 'repair') {
            infoHtml = `<div><strong>所持金:</strong> ${c.gold}</div><div><strong>現在の防御:</strong> ${c.defense} / ${c.maxDefense}</div>`;
        } else {
            contextEl.classList.add('hidden');
        }
        contextEl.innerHTML = infoHtml;

        const bushos = this.game.getCastleBushos(this.currentCastle.id);
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
                    <span class="item-sub">武:${b.strength} 政:${b.politics} 魅:${b.charm} ${isDisabled ? '[済]' : ''}</span>
                </div>
            `;
            if(!isDisabled) {
                div.onclick = (e) => {
                    const inp = div.querySelector('input');
                    if(e.target !== inp) inp.click();
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

    openTargetCastleSelector(actionType) {
        this.selectorModal.classList.remove('hidden');
        document.getElementById('selector-title').textContent = "対象の城を選択";
        this.selectorList.innerHTML = '';
        this.selectorContextInfo.classList.add('hidden'); // ターゲット選択時は非表示

        let targets = [];
        if (actionType === 'war') {
            targets = this.game.castles.filter(c => 
                c.ownerClan !== 0 && c.ownerClan !== this.currentCastle.ownerClan &&
                GameSystem.isAdjacent(this.currentCastle, c)
            );
        } else if (actionType === 'move' || actionType === 'transport') {
            targets = this.game.castles.filter(c => 
                c.ownerClan === this.currentCastle.ownerClan && c.id !== this.currentCastle.id &&
                GameSystem.isAdjacent(this.currentCastle, c)
            );
        } else if (actionType === 'investigate') {
            // 全ての他国城
            targets = this.game.castles.filter(c => 
                c.ownerClan !== 0 && c.ownerClan !== this.currentCastle.ownerClan
            );
        }

        if (targets.length === 0) {
            this.selectorList.innerHTML = '<div style="padding:10px;">対象となる城がありません</div>';
        }

        targets.forEach(c => {
            const div = document.createElement('div');
            div.className = 'select-item';
            div.innerHTML = `
                <input type="radio" name="sel_castle" value="${c.id}">
                <div class="item-detail">
                    <span class="item-main">${c.name}</span>
                    <span class="item-sub">支配: ${MASTER_DATA.clans.find(cl=>cl.id===c.ownerClan).name}</span>
                </div>
            `;
            div.onclick = (e) => { 
                const inp = div.querySelector('input');
                if(e.target !== inp) inp.click(); 
            };
            this.selectorList.appendChild(div);
        });

        this.selectorConfirmBtn.onclick = () => {
            const input = document.querySelector('input[name="sel_castle"]:checked');
            if (!input) return;
            const targetId = parseInt(input.value);
            this.closeSelector();

            if (actionType === 'war') this.openBushoSelector('war_deploy', targetId);
            else if (actionType === 'move') this.openBushoSelector('move_deploy', targetId);
            else if (actionType === 'transport') this.openBushoSelector('transport_deploy', targetId);
            else if (actionType === 'investigate') this.openBushoSelector('investigate_deploy', targetId);
        };
    }

    closeSelector() { this.selectorModal.classList.add('hidden'); }

    // 武将一覧モーダル
    showCastleBushosModal() {
        if (!this.currentCastle) return;
        this.showCastleInfo(this.currentCastle, true);
    }

    showCastleInfo(castle, isMyCastle = false) {
        const modal = document.getElementById('busho-detail-modal');
        const body = document.getElementById('busho-detail-body');
        modal.classList.remove('hidden');
        
        const clanData = MASTER_DATA.clans.find(c => c.id === castle.ownerClan);
        let html = `<h3>${castle.name} (${clanData ? clanData.name : '中立'})</h3>`;
        
        // Fog of War 判定
        const isVisible = this.game.isCastleVisible(castle);

        if (isVisible) {
            html += `<div class="status-list">
                <div class="status-row"><div class="status-label">兵士</div><div class="status-value">${castle.soldiers}</div></div>
                <div class="status-row"><div class="status-label">防御</div><div class="status-value">${castle.defense}/${castle.maxDefense}</div></div>
                <div class="status-row"><div class="status-label">石高</div><div class="status-value">${castle.kokudaka}/${castle.maxKokudaka}</div></div>
                <div class="status-row"><div class="status-label">商業</div><div class="status-value">${castle.commerce}/${castle.maxCommerce}</div></div>
            </div>`;
        } else {
            html += `<p class="panel-msg">情報は不明です（調査が必要です）</p>`;
        }

        html += `<h4 style="margin-top:15px;">所属武将</h4>`;
        html += `<div style="max-height:300px; overflow-y:auto;">`;
        
        if (isVisible) {
            const bushos = this.game.getCastleBushos(castle.id);
            bushos.forEach(b => {
                html += `
                    <div style="border-bottom:1px solid #ccc; padding:8px;">
                        <strong style="font-size:1.1rem;">${b.name}</strong> ${b.isCastellan ? '★' : ''}<br>
                        武:${b.strength} 政:${b.politics} 智:${b.intelligence} 魅:${b.charm}<br>
                        ${isMyCastle ? `状態: ${b.isActionDone ? '行動済' : '可'}` : ''}
                    </div>
                `;
            });
        } else {
             html += `<div style="padding:10px; color:#666;">？？？</div>`;
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
    }

    boot() {
        this.generateGenericBushos(); // 雑魚武将追加
        this.ui.showStartScreen(MASTER_DATA.clans, (clanId) => {
            this.playerClanId = clanId;
            this.init();
        });
    }

    // 雑魚武将生成
    generateGenericBushos() {
        const ranks = ["足軽頭", "侍大将", "部将", "家老"];
        let idCounter = 1000;
        MASTER_DATA.clans.forEach(clan => {
            // 各勢力に10人追加
            for(let i=0; i<10; i++) {
                // 所属城をランダム決定
                const clanCastles = MASTER_DATA.castles.filter(c => c.ownerClan === clan.id);
                if (clanCastles.length === 0) continue;
                const castle = clanCastles[Math.floor(Math.random() * clanCastles.length)];
                
                const rank = ranks[Math.floor(Math.random() * ranks.length)];
                // 能力は低め (30~70)
                const s = 30 + Math.floor(Math.random()*40);
                const p = 30 + Math.floor(Math.random()*40);
                const int = 30 + Math.floor(Math.random()*40);
                const ch = 30 + Math.floor(Math.random()*40);
                
                MASTER_DATA.bushos.push({
                    id: idCounter++,
                    name: `${clan.name}の${rank}${String.fromCharCode(65+i)}`,
                    strength: s, politics: p, intelligence: int, charm: ch,
                    loyalty: 80, clan: clan.id, castleId: castle.id, 
                    isCastellan: false, personality: "balanced"
                });
                castle.samuraiIds.push(idCounter-1);
            }
        });
    }

    init() {
        this.castles = MASTER_DATA.castles.map(d => new Castle(d));
        this.bushos = MASTER_DATA.bushos.map(d => new Busho(d));
        this.startMonth();
    }

    getBusho(id) { return this.bushos.find(b => b.id === id); }
    getCastle(id) { return this.castles.find(c => c.id === id); }
    getCastleBushos(cid) { return this.castles.find(c => c.id === cid).samuraiIds.map(id => this.getBusho(id)); }
    getCurrentTurnCastle() { return this.turnQueue[this.currentIndex]; }
    
    // 現在のターンID (絶対月数)
    getCurrentTurnId() {
        return this.year * 12 + this.month;
    }

    // 城の情報が見えるか判定
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
            const winner = MASTER_DATA.clans.find(c => c.id === [...clans][0]);
            alert(`天下統一！ 勝者：${winner ? winner.name : '不明'}`);
        } else if (!playerAlive) {
            alert(`我が軍は滅亡しました...`);
        } else {
            this.startMonth();
        }
    }

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
            this.ui.renderCommandMenu(); // 画面更新のためreturnしない
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
        // 調査実行。4ヶ月後まで見える
        target.investigatedUntil = this.getCurrentTurnId() + 4;
        busho.isActionDone = true;
        this.ui.log(`${busho.name}が${target.name}を調査しました`);
        this.ui.updatePanelHeader();
        this.ui.renderCommandMenu();
        // マップ更新
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
        const atkClan = MASTER_DATA.clans.find(c => c.id === atkCastle.ownerClan);
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
            // 持ち主が変わったので調査情報はリセット
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
    
    saveGame() { localStorage.setItem('sengoku_cmd', JSON.stringify({year:this.year, month:this.month, castles:this.castles, bushos:this.bushos, playerClanId:this.playerClanId})); alert('保存しました'); }
    loadGame() {
        const d = JSON.parse(localStorage.getItem('sengoku_cmd'));
        if(d) {
            this.year = d.year; this.month = d.month;
            this.playerClanId = d.playerClanId || 1;
            this.castles = d.castles.map(c=>new Castle(c));
            this.bushos = d.bushos.map(b=>new Busho(b));
            this.startMonth();
            document.getElementById('start-screen').classList.add('hidden');
        }
    }
}

window.onload = () => { window.GameApp = new GameManager(); window.GameApp.boot(); };