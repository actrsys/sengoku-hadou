/**
 * 戦国シミュレーションゲーム - AI強化＆演出追加版
 */

/* --- Config & Data --- */
const CONFIG = {
    StartYear: 1560,
    StartMonth: 1,
    Coef: {
        IncomeGold: 0.5,
        ConsumeRice: 0.2,
        ConsumeGoldPerBusho: 5,
        DevPolitics: 0.5,
        DraftStr: 0.5,
        RepairPol: 0.5,
        BaseDev: 5,
        BaseDraft: 50,
        BaseRepair: 10
    },
    War: {
        MaxRounds: 10,
        AtkDmgCoef: 1.0,
        DefDmgCoef: 2.5,
        SoldierPower: 0.1,
        WallMitigation: 1.0
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
        { id: 1, name: "魚津城", ownerClan: 1, x: 1, y: 0, castellanId: 102, samuraiIds: [102], soldiers: 800, gold: 300, rice: 1500, kokudaka: 90, commerce: 60, defense: 80 },
        { id: 2, name: "春日山城", ownerClan: 1, x: 2, y: 0, castellanId: 101, samuraiIds: [101, 104], soldiers: 1200, gold: 600, rice: 2500, kokudaka: 150, commerce: 100, defense: 120 },
        { id: 15, name: "新発田城", ownerClan: 1, x: 3, y: 0, castellanId: 107, samuraiIds: [107], soldiers: 900, gold: 350, rice: 1600, kokudaka: 95, commerce: 70, defense: 90 },
        // y=1
        { id: 3, name: "稲葉山城", ownerClan: 5, x: 0, y: 1, castellanId: 501, samuraiIds: [501, 502], soldiers: 1100, gold: 500, rice: 2000, kokudaka: 140, commerce: 120, defense: 110 },
        { id: 4, name: "岩村城", ownerClan: 5, x: 1, y: 1, castellanId: 503, samuraiIds: [503], soldiers: 700, gold: 200, rice: 1200, kokudaka: 70, commerce: 50, defense: 90 },
        { id: 5, name: "海津城", ownerClan: 2, x: 2, y: 1, castellanId: 202, samuraiIds: [202, 204], soldiers: 900, gold: 350, rice: 1600, kokudaka: 90, commerce: 70, defense: 100 },
        { id: 6, name: "厩橋城", ownerClan: 1, x: 3, y: 1, castellanId: 103, samuraiIds: [103], soldiers: 800, gold: 300, rice: 1400, kokudaka: 85, commerce: 80, defense: 70 },
        // y=2
        { id: 7, name: "清州城", ownerClan: 6, x: 0, y: 2, castellanId: 601, samuraiIds: [601, 602], soldiers: 1100, gold: 550, rice: 2200, kokudaka: 160, commerce: 150, defense: 100 },
        { id: 8, name: "飯田城", ownerClan: 2, x: 1, y: 2, castellanId: 205, samuraiIds: [205], soldiers: 750, gold: 250, rice: 1300, kokudaka: 75, commerce: 60, defense: 80 },
        { id: 9, name: "躑躅ヶ崎館", ownerClan: 2, x: 2, y: 2, castellanId: 201, samuraiIds: [201, 203], soldiers: 1300, gold: 700, rice: 2400, kokudaka: 160, commerce: 120, defense: 110 },
        { id: 10, name: "河越城", ownerClan: 3, x: 3, y: 2, castellanId: 302, samuraiIds: [302], soldiers: 850, gold: 350, rice: 1700, kokudaka: 100, commerce: 90, defense: 90 },
        // y=3
        { id: 11, name: "名古屋城", ownerClan: 6, x: 0, y: 3, castellanId: 603, samuraiIds: [603], soldiers: 900, gold: 400, rice: 1800, kokudaka: 110, commerce: 140, defense: 85 },
        { id: 12, name: "曳馬城", ownerClan: 4, x: 1, y: 3, castellanId: 402, samuraiIds: [402], soldiers: 800, gold: 300, rice: 1500, kokudaka: 90, commerce: 100, defense: 80 },
        { id: 13, name: "駿府城", ownerClan: 4, x: 2, y: 3, castellanId: 401, samuraiIds: [401, 403], soldiers: 1200, gold: 900, rice: 2800, kokudaka: 180, commerce: 200, defense: 130 },
        { id: 14, name: "小田原城", ownerClan: 3, x: 3, y: 3, castellanId: 301, samuraiIds: [301, 303], soldiers: 1500, gold: 800, rice: 3000, kokudaka: 200, commerce: 180, defense: 200 }
    ],
    // 性格: aggressive, balanced, conservative
    bushos: [
        // Uesugi (1)
        { id: 101, name: "上杉謙信", strength: 100, politics: 60, intelligence: 90, loyalty: 100, clan: 1, castleId: 2, isCastellan: true, personality: "aggressive" },
        { id: 102, name: "柿崎景家", strength: 90,  politics: 40, intelligence: 50, loyalty: 90,  clan: 1, castleId: 1, isCastellan: true, personality: "aggressive" },
        { id: 103, name: "直江景綱", strength: 60,  politics: 85, intelligence: 80, loyalty: 95,  clan: 1, castleId: 6, isCastellan: true, personality: "balanced" },
        { id: 104, name: "宇佐美定満", strength: 70, politics: 70, intelligence: 92, loyalty: 88, clan: 1, castleId: 2, isCastellan: false, personality: "conservative" },
        { id: 107, name: "本庄繁長", strength: 88,  politics: 50, intelligence: 70, loyalty: 85,  clan: 1, castleId: 15, isCastellan: true, personality: "aggressive" },
        // Takeda (2)
        { id: 201, name: "武田信玄", strength: 95,  politics: 95, intelligence: 95, loyalty: 100, clan: 2, castleId: 9, isCastellan: true, personality: "aggressive" },
        { id: 202, name: "高坂昌信", strength: 80,  politics: 80, intelligence: 85, loyalty: 92,  clan: 2, castleId: 5, isCastellan: true, personality: "conservative" },
        { id: 203, name: "山県昌景", strength: 92,  politics: 60, intelligence: 70, loyalty: 95,  clan: 2, castleId: 9, isCastellan: false, personality: "aggressive" },
        { id: 204, name: "山本勘助", strength: 60,  politics: 70, intelligence: 98, loyalty: 95,  clan: 2, castleId: 5, isCastellan: false, personality: "balanced" },
        { id: 205, name: "秋山信友", strength: 82,  politics: 65, intelligence: 75, loyalty: 90,  clan: 2, castleId: 8, isCastellan: true, personality: "balanced" },
        // Hojo (3)
        { id: 301, name: "北条氏康", strength: 88,  politics: 95, intelligence: 92, loyalty: 100, clan: 3, castleId: 14, isCastellan: true, personality: "conservative" },
        { id: 302, name: "北条氏政", strength: 70,  politics: 75, intelligence: 70, loyalty: 95,  clan: 3, castleId: 10, isCastellan: true, personality: "conservative" },
        { id: 303, name: "北条綱成", strength: 93,  politics: 50, intelligence: 60, loyalty: 98,  clan: 3, castleId: 14, isCastellan: false, personality: "aggressive" },
        // Imagawa (4)
        { id: 401, name: "今川義元", strength: 75,  politics: 90, intelligence: 85, loyalty: 100, clan: 4, castleId: 13, isCastellan: true, personality: "conservative" },
        { id: 402, name: "朝比奈泰朝", strength: 82, politics: 60, intelligence: 60, loyalty: 90, clan: 4, castleId: 12, isCastellan: true, personality: "balanced" },
        { id: 403, name: "太原雪斎", strength: 50,  politics: 98, intelligence: 98, loyalty: 100, clan: 4, castleId: 13, isCastellan: false, personality: "conservative" },
        // Saito (5)
        { id: 501, name: "斎藤義龍", strength: 85,  politics: 70, intelligence: 75, loyalty: 100, clan: 5, castleId: 3, isCastellan: true, personality: "aggressive" },
        { id: 502, name: "稲葉一鉄", strength: 80,  politics: 70, intelligence: 80, loyalty: 80,  clan: 5, castleId: 3, isCastellan: false, personality: "balanced" },
        { id: 503, name: "遠山景任", strength: 65,  politics: 60, intelligence: 65, loyalty: 85,  clan: 5, castleId: 4, isCastellan: true, personality: "conservative" },
        // Oda (6)
        { id: 601, name: "織田信長", strength: 95,  politics: 90, intelligence: 92, loyalty: 100, clan: 6, castleId: 7, isCastellan: true, personality: "aggressive" },
        { id: 602, name: "柴田勝家", strength: 96,  politics: 50, intelligence: 60, loyalty: 95,  clan: 6, castleId: 7, isCastellan: false, personality: "aggressive" },
        { id: 603, name: "佐久間信盛", strength: 75, politics: 75, intelligence: 70, loyalty: 88, clan: 6, castleId: 11, isCastellan: true, personality: "conservative" }
    ]
};

/* --- Models --- */
class Busho {
    constructor(data) {
        Object.assign(this, data);
        this.fatigue = 0;
        this.isActionDone = false;
        if(!this.personality) this.personality = 'balanced';
    }
}
class Castle {
    constructor(data) {
        Object.assign(this, data);
        this.samuraiIds = [...data.samuraiIds];
        this.maxDefense = data.defense;
        this.maxKokudaka = data.maxKokudaka || data.kokudaka * 2;
        this.maxCommerce = data.maxCommerce || data.commerce * 2;
        this.isDone = false;
    }
}

/* --- Logic Systems --- */
class GameSystem {
    static calcDevelopment(busho) { return Math.floor(CONFIG.Coef.BaseDev + (busho.politics * CONFIG.Coef.DevPolitics)); }
    static calcDraft(busho) { return Math.floor(CONFIG.Coef.BaseDraft + (busho.strength * CONFIG.Coef.DraftStr)); }
    static calcRepair(busho) { return Math.floor(CONFIG.Coef.BaseRepair + (busho.politics * CONFIG.Coef.RepairPol)); }
    
    static isAdjacent(c1, c2) {
        return (Math.abs(c1.x - c2.x) + Math.abs(c1.y - c2.y)) === 1;
    }

    static getBestStat(bushos, type) {
        if (!bushos || bushos.length === 0) return 30;
        let max = 0;
        bushos.forEach(b => {
            const val = (type === 'str') ? b.strength : b.intelligence;
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
        this.cmdArea = document.getElementById('command-area');
        this.logEl = document.getElementById('log-content');
        this.selectorModal = document.getElementById('selector-modal');
        this.selectorList = document.getElementById('selector-list');
        this.selectorConfirmBtn = document.getElementById('selector-confirm-btn');
        this.startScreen = document.getElementById('start-screen');
        this.cutinOverlay = document.getElementById('cutin-overlay');
        this.cutinMessage = document.getElementById('cutin-message');
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
        }, 2000); // 2秒表示
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

            el.innerHTML = `
                <div class="card-header"><h3>${c.name}</h3></div>
                <div class="card-owner">${clanName}</div>
                <div class="param-grid">
                    <div class="param-item"><span>城主</span> <strong>${castellan ? castellan.name : '-'}</strong></div>
                    <div class="param-item"><span>兵数</span> ${c.soldiers}</div>
                </div>
            `;
            if(clanData) el.style.borderTop = `5px solid ${clanData.color}`;

            el.onclick = () => {
                if(this.menuState === 'INFO_SELECT') this.showCastleInfo(c);
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

    updatePanelHeader() {
        if (!this.currentCastle) return;
        document.getElementById('panel-title').textContent = this.currentCastle.name;
        const clanData = MASTER_DATA.clans.find(c => c.id === this.currentCastle.ownerClan);
        document.getElementById('panel-clan').textContent = clanData ? clanData.name : "--";
        
        document.getElementById('panel-gold').textContent = this.currentCastle.gold;
        document.getElementById('panel-rice').textContent = this.currentCastle.rice;
        document.getElementById('panel-soldiers').textContent = this.currentCastle.soldiers;
        document.getElementById('panel-defense').textContent = `${this.currentCastle.defense}/${this.currentCastle.maxDefense}`;
        document.getElementById('panel-kokudaka').textContent = `${this.currentCastle.kokudaka}/${this.currentCastle.maxKokudaka}`;
        document.getElementById('panel-commerce').textContent = `${this.currentCastle.commerce}/${this.currentCastle.maxCommerce}`;
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
            createBtn("【開発】 石高・商業", "category", () => { this.menuState = 'DEVELOP'; this.renderCommandMenu(); });
            createBtn("【軍事】 出陣・徴兵・修復", "category", () => { this.menuState = 'MILITARY'; this.renderCommandMenu(); });
            createBtn("【人事】 移動・任命・追放", "category", () => { this.menuState = 'PERSONNEL'; this.renderCommandMenu(); });
            createBtn("【情報】 他国・詳細", "category", () => { this.menuState = 'INFO'; this.renderCommandMenu(); });
            createBtn("命令終了 (ターン送り)", "finish", () => this.game.finishTurn());
        }
        else if (this.menuState === 'DEVELOP') {
            createBtn("石高開発 (金50)", "", () => this.openBushoSelector('farm'));
            createBtn("商業開発 (金50)", "", () => this.openBushoSelector('commerce'));
            createBtn("戻る", "back", () => { this.menuState = 'MAIN'; this.renderCommandMenu(); });
        }
        else if (this.menuState === 'MILITARY') {
            createBtn("出陣 (隣接敵国)", "", () => this.openTargetCastleSelector('war'));
            createBtn("徴兵 (金50/兵糧50)", "", () => this.openBushoSelector('draft'));
            createBtn("城壁修復 (金30)", "", () => this.openBushoSelector('repair'));
            createBtn("戻る", "back", () => { this.menuState = 'MAIN'; this.renderCommandMenu(); });
        }
        else if (this.menuState === 'PERSONNEL') {
            createBtn("武将移動 (隣接自国)", "", () => this.openTargetCastleSelector('move'));
            if (!this.currentCastle.castellanId) createBtn("城主任命", "", () => this.openBushoSelector('appoint'));
            createBtn("追放", "", () => this.openBushoSelector('banish'));
            createBtn("戻る", "back", () => { this.menuState = 'MAIN'; this.renderCommandMenu(); });
        }
        else if (this.menuState === 'INFO') {
            createBtn("自城詳細・武将一覧", "", () => this.showCastleInfo(this.currentCastle));
            createBtn("他城を閲覧", "", () => {
                this.menuState = 'INFO_SELECT';
                this.log("マップ上の城をクリックしてください");
                this.renderCommandMenu();
            });
            createBtn("戻る", "back", () => { this.menuState = 'MAIN'; this.renderCommandMenu(); });
        }
        else if (this.menuState === 'INFO_SELECT') {
            createBtn("閲覧中止", "back", () => { this.menuState = 'INFO'; this.renderCommandMenu(); });
        }
    }

    openBushoSelector(actionType, targetId = null) {
        this.selectorModal.classList.remove('hidden');
        document.getElementById('selector-title').textContent = "武将を選択";
        this.selectorList.innerHTML = '';
        
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
                    <span class="item-sub">武:${b.strength} 政:${b.politics} ${isDisabled ? '[済]' : ''}</span>
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
            this.game.executeCommand(actionType, selectedIds, targetId);
        };
    }

    openTargetCastleSelector(actionType) {
        this.selectorModal.classList.remove('hidden');
        document.getElementById('selector-title').textContent = "対象の城を選択";
        this.selectorList.innerHTML = '';

        let targets = [];
        if (actionType === 'war') {
            targets = this.game.castles.filter(c => 
                c.ownerClan !== 0 && c.ownerClan !== this.currentCastle.ownerClan &&
                GameSystem.isAdjacent(this.currentCastle, c)
            );
        } else if (actionType === 'move') {
            targets = this.game.castles.filter(c => 
                c.ownerClan === this.currentCastle.ownerClan && c.id !== this.currentCastle.id &&
                GameSystem.isAdjacent(this.currentCastle, c)
            );
        }

        if (targets.length === 0) {
            this.selectorList.innerHTML = '<div style="padding:10px;">対象となる隣接した城がありません</div>';
        }

        targets.forEach(c => {
            const div = document.createElement('div');
            div.className = 'select-item';
            div.innerHTML = `
                <input type="radio" name="sel_castle" value="${c.id}">
                <div class="item-detail">
                    <span class="item-main">${c.name}</span>
                    <span class="item-sub">兵:${c.soldiers} 防:${c.defense}</span>
                </div>
            `;
            div.onclick = (e) => { if(e.target.tagName !== 'INPUT') div.querySelector('input').click(); };
            this.selectorList.appendChild(div);
        });

        this.selectorConfirmBtn.onclick = () => {
            const input = document.querySelector('input[name="sel_castle"]:checked');
            if (!input) return;
            const targetId = parseInt(input.value);
            this.closeSelector();

            if (actionType === 'war') this.openBushoSelector('war_deploy', targetId);
            else if (actionType === 'move') this.openBushoSelector('move_deploy', targetId);
        };
    }

    closeSelector() { this.selectorModal.classList.add('hidden'); }

    showCastleInfo(castle) {
        const modal = document.getElementById('busho-detail-modal');
        const body = document.getElementById('busho-detail-body');
        modal.classList.remove('hidden');
        
        const bushos = this.game.getCastleBushos(castle.id);
        const clanData = MASTER_DATA.clans.find(c => c.id === castle.ownerClan);
        let html = `<h3>${castle.name} (${clanData ? clanData.name : '中立'})</h3>`;
        html += `<p>兵:${castle.soldiers} 防:${castle.defense} 石高:${castle.kokudaka} 商業:${castle.commerce}</p>`;
        html += `<div style="max-height:300px; overflow-y:auto;">`;
        bushos.forEach(b => {
            html += `
                <div style="border-bottom:1px solid #ccc; padding:5px;">
                    <strong>${b.name}</strong> ${b.isCastellan ? '★' : ''}<br>
                    武:${b.strength} 政:${b.politics} 智:${b.intelligence} 忠:${b.loyalty}<br>
                    性格: ${b.personality} / 状態: ${b.isActionDone ? '行動済' : '可'}
                </div>
            `;
        });
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
        this.ui.showStartScreen(MASTER_DATA.clans, (clanId) => {
            this.playerClanId = clanId;
            this.init();
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

    startMonth() {
        this.ui.log(`=== ${this.year}年 ${this.month}月 ===`);
        
        // 人事異動判定 (3ヶ月に1回)
        if (this.month % 3 === 0) {
            this.optimizeCastellans();
        }

        this.castles.forEach(c => {
            if (c.ownerClan === 0) return;
            c.isDone = false;
            let income = Math.floor(c.commerce * CONFIG.Coef.IncomeGold);
            if(this.month === 3) income += 100;
            c.gold += income;
            if(this.month === 9) c.rice += c.kokudaka * 10;
            
            const bushos = this.getCastleBushos(c.id);
            c.rice = Math.max(0, c.rice - Math.floor(c.soldiers * CONFIG.Coef.ConsumeRice));
            c.gold = Math.max(0, c.gold - (bushos.length * CONFIG.Coef.ConsumeGoldPerBusho));
            bushos.forEach(b => b.isActionDone = false);
        });
        this.turnQueue = this.castles.filter(c => c.ownerClan !== 0).sort(() => Math.random() - 0.5);
        this.currentIndex = 0;
        this.processTurn();
    }

    // 城主の最適化ロジック
    optimizeCastellans() {
        const clanIds = [...new Set(this.castles.filter(c=>c.ownerClan!==0).map(c=>c.ownerClan))];
        
        clanIds.forEach(clanId => {
            // 大名の知略をチェック
            // 大名が定義されていない場合は簡易的に平均知略とする
            let daimyoInt = 50;
            const myBushos = this.bushos.filter(b => b.clan === clanId);
            // 本来はDaimyo IDを特定すべきだが、簡易的にその家で一番知略が高い者を参謀役とする
            if(myBushos.length > 0) {
                daimyoInt = Math.max(...myBushos.map(b => b.intelligence));
            }

            // 大名の知略が高いほど、適材適所を行う確率が上がる
            if (Math.random() * 100 < daimyoInt) {
                const clanCastles = this.castles.filter(c => c.ownerClan === clanId);
                clanCastles.forEach(castle => {
                    const castleBushos = this.getCastleBushos(castle.id);
                    if (castleBushos.length <= 1) return;

                    // 能力合計（武＋政＋知）が一番高い武将を探す
                    castleBushos.sort((a, b) => (b.strength + b.politics + b.intelligence) - (a.strength + a.politics + a.intelligence));
                    const best = castleBushos[0];
                    
                    if (best.id !== castle.castellanId) {
                        // 交代
                        const old = this.getBusho(castle.castellanId);
                        if(old) old.isCastellan = false;
                        best.isCastellan = true;
                        castle.castellanId = best.id;
                        // プレイヤーの城ならログを出す
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

        if (['farm', 'commerce', 'draft', 'repair', 'appoint', 'banish'].includes(type)) {
            const busho = this.getBusho(bushoIds[0]);
            if (!busho) return;

            if (type === 'farm') {
                if (castle.gold < 50) { alert("金が足りません"); return; }
                const val = GameSystem.calcDevelopment(busho);
                castle.gold -= 50; 
                castle.kokudaka = Math.min(castle.maxKokudaka, castle.kokudaka + val); 
                msg = `${busho.name}が石高を開発 (+${val})`;
            }
            else if (type === 'commerce') {
                if (castle.gold < 50) { alert("金が足りません"); return; }
                const val = GameSystem.calcDevelopment(busho);
                castle.gold -= 50; 
                castle.commerce = Math.min(castle.maxCommerce, castle.commerce + val);
                msg = `${busho.name}が商業を開発 (+${val})`;
            }
            else if (type === 'draft') {
                if (castle.gold < 50 || castle.rice < 50) { alert("資源不足"); return; }
                const val = GameSystem.calcDraft(busho);
                castle.gold -= 50; castle.rice -= 50; castle.soldiers += val; msg = `${busho.name}が兵を徴兵 (+${val})`;
            }
            else if (type === 'repair') {
                if (castle.gold < 30) { alert("金不足"); return; }
                const val = GameSystem.calcRepair(busho);
                castle.gold -= 30; castle.defense = Math.min(castle.maxDefense, castle.defense + val); msg = `${busho.name}が城壁を修復 (+${val})`;
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
            busho.isActionDone = true;
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
        }
        else if (type === 'war_deploy') {
            const targetC = this.getCastle(targetId);
            const attackers = bushoIds.map(id => this.getBusho(id));
            attackers.forEach(b => b.isActionDone = true);
            this.startWar(castle, targetC, attackers);
            return; 
        }

        this.ui.log(msg);
        this.ui.updatePanelHeader();
        this.ui.renderCommandMenu();
    }

    // AIの思考ルーチン（強化版）
    execAI(castle) {
        const castellan = this.getBusho(castle.castellanId);
        if (castellan && !castellan.isActionDone) {
            
            // --- 総合スコア計算 ---
            let attackDesire = 0; // 攻撃意欲スコア
            let developDesire = 0; // 内政意欲スコア

            // 1. 性格と能力による基本補正
            if (castellan.personality === 'aggressive') {
                attackDesire += 30;
                developDesire -= 10;
            } else if (castellan.personality === 'conservative') {
                attackDesire -= 30;
                developDesire += 30;
            } else { // balanced
                attackDesire += 0;
                developDesire += 10;
            }

            // 武力が高いほど攻撃したくなる
            attackDesire += (castellan.strength * 0.5);
            // 政治が高いほど内政したくなる
            developDesire += (castellan.politics * 0.5);

            // 2. 周辺状況の分析
            const enemies = this.castles.filter(c => 
                c.ownerClan !== 0 && c.ownerClan !== castle.ownerClan &&
                GameSystem.isAdjacent(castle, c)
            );

            let bestTarget = null;
            let maxWarScore = -999;

            if (enemies.length > 0) {
                enemies.forEach(target => {
                    // 戦争スコア計算
                    // (自軍兵士 - 敵兵士)
                    let diffScore = (castle.soldiers - target.soldiers) / 10; // 差分100人で+10点
                    
                    // 知略による判断精度の補正
                    // 知略が高いと、負け戦（兵力差がマイナス）を重く受け止める
                    // 知略が低いと、兵力差をあまり気にしない
                    if (castellan.intelligence > 80) {
                        if (diffScore < 0) diffScore *= 2.0; // 劣勢を2倍重く見る（慎重）
                    } else if (castellan.intelligence < 40) {
                        if (diffScore < 0) diffScore *= 0.5; // 劣勢を半分しか気にしない（無謀）
                    }

                    // 兵糧チェック (兵糧が少ないとペナルティ)
                    let ricePenalty = 0;
                    if (castle.rice < castle.soldiers * 1.5) ricePenalty = 50;
                    
                    let warScore = attackDesire + diffScore - ricePenalty;
                    
                    // ランダム要素（気分）
                    warScore += (Math.random() * 20 - 10);

                    if (warScore > maxWarScore) {
                        maxWarScore = warScore;
                        bestTarget = target;
                    }
                });
            }

            // 3. 行動決定
            // 攻撃スコアが一定以上、かつターゲットがいれば攻撃
            if (bestTarget && maxWarScore > 60) {
                // 出陣
                castellan.isActionDone = true;
                this.startWar(castle, bestTarget, [castellan]);
                return;
            } else {
                // 内政を行う
                // 金があれば
                if (castle.gold > 100) {
                    // 兵士が少なければ徴兵優先
                    if (castle.soldiers < 500 && castle.rice > 500) {
                         castle.soldiers += 100; castle.gold -= 50; castle.rice -= 50;
                         this.ui.log(`${castle.name}が徴兵を行いました`);
                    } 
                    // 政治が高ければ開発
                    else if (castellan.politics > 60) {
                        if (castle.commerce < castle.maxCommerce) {
                            castle.commerce = Math.min(castle.maxCommerce, castle.commerce + 5); 
                            castle.gold -= 50;
                            this.ui.log(`${castle.name}が商業開発を行いました`);
                        } else {
                            // 金が余ってれば修復など
                             castle.defense = Math.min(castle.maxDefense, castle.defense + 5);
                             castle.gold -= 30;
                             this.ui.log(`${castle.name}が修復を行いました`);
                        }
                    } else {
                        // 特にやることなし（貯蓄）
                    }
                }
                castellan.isActionDone = true;
            }
        }
        this.finishTurn();
    }

    startWar(atkCastle, defCastle, atkBushos) {
        const isPlayerInvolved = (atkCastle.ownerClan === this.playerClanId || defCastle.ownerClan === this.playerClanId);
        const atkClan = MASTER_DATA.clans.find(c => c.id === atkCastle.ownerClan);
        const atkGeneral = atkBushos[0].name;

        // カットイン演出（ポップアップ）
        const msg = `${atkClan.name}軍の${atkGeneral}が\n${defCastle.name}に攻め込みました！`;
        this.ui.showCutin(msg);

        this.warState = {
            active: true, round: 1, attacker: atkCastle, defender: defCastle,
            atkBushos: atkBushos,
            defBusho: this.getBusho(defCastle.castellanId) || {name:"守備隊長", strength:30, intelligence:30},
            turn: 'attacker',
            isPlayerInvolved: isPlayerInvolved
        };

        // 少し待ってから処理開始（カットインを見せるため）
        setTimeout(() => {
            if (isPlayerInvolved) {
                const warModal = document.getElementById('war-modal');
                warModal.classList.remove('hidden');
                document.getElementById('war-log').innerHTML = '';
                this.ui.log(`★ ${atkCastle.name}が出陣！ ${defCastle.name}へ攻撃！`);
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

        let isPlayerTurn = false;
        if (isAtkTurn && isPlayerAtkSide) isPlayerTurn = true;
        if (!isAtkTurn && isPlayerDefSide) isPlayerTurn = true;

        if (isPlayerTurn) {
            document.getElementById('war-controls').classList.remove('disabled-area');
        } else {
            document.getElementById('war-controls').classList.add('disabled-area');
            setTimeout(() => this.execWarAI(), 800);
        }
    }

    execWarCmd(type) { 
        document.getElementById('war-controls').classList.add('disabled-area');
        this.resolveWarAction(type); 
    }
    
    execWarAI() { 
        this.resolveWarAction('charge'); 
    }

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
        if (type === 'siege' && isAtkTurn) {
            target.defense = Math.max(0, target.defense - result.wallDmg);
        }

        if (s.isPlayerInvolved) {
            const logDiv = document.createElement('div');
            let msg = "";
            if (result.wallDmg > 0) msg = `城壁攻撃 (兵-${result.soldierDmg} 防-${result.wallDmg})`;
            else msg = `部隊攻撃 (兵-${result.soldierDmg})`;
            
            logDiv.textContent = `R${s.round} [${isAtkTurn?'攻':'守'}] ${msg}`;
            document.getElementById('war-log').prepend(logDiv);
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
        const els = {
            atkName: document.getElementById('war-atk-name'),
            atkSoldier: document.getElementById('war-atk-soldier'),
            atkBusho: document.getElementById('war-atk-busho'),
            defName: document.getElementById('war-def-name'),
            defSoldier: document.getElementById('war-def-soldier'),
            defWall: document.getElementById('war-def-wall'),
            defBusho: document.getElementById('war-def-busho'),
            round: document.getElementById('war-round')
        };
        const s = this.warState;
        els.atkName.textContent = s.attacker.name;
        els.atkSoldier.textContent = s.attacker.soldiers;
        els.atkBusho.textContent = s.atkBushos.map(b=>b.name).join(',');
        els.defName.textContent = s.defender.name;
        els.defSoldier.textContent = s.defender.soldiers;
        els.defWall.textContent = s.defender.defense;
        els.defBusho.textContent = s.defBusho.name;
        els.round.textContent = s.round;
    }

    endWar(attackerWon) {
        const s = this.warState;
        s.active = false;
        if (s.isPlayerInvolved) document.getElementById('war-modal').classList.add('hidden');
        
        if (attackerWon) {
            this.ui.log(`＞＞ ${s.attacker.name}が${s.defender.name}を制圧！`);
            s.defender.ownerClan = s.attacker.ownerClan;
            s.defender.soldiers = 0;
            const defCastellan = this.getBusho(s.defender.castellanId);
            if(defCastellan) { defCastellan.isCastellan = false; defCastellan.castleId = 0; defCastellan.status = 'ronin'; }
            s.defender.castellanId = null;
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

window.onload = () => { 
    window.GameApp = new GameManager(); 
    window.GameApp.boot(); 
};