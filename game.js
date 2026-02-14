/**
 * 戦国シミュレーションゲーム - 修正完全版
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
        DmgStatCoef: 0.5,
        DmgSoldierCoef: 0.05
    }
};

const MASTER_DATA = {
    clans: [
        { id: 1, name: "上杉家", color: "#d32f2f" },
        { id: 2, name: "武田家", color: "#1976d2" }
    ],
    castles: [
        { id: 1, name: "春日山城", ownerClan: 1, castellanId: 101, samuraiIds: [101, 102, 104], soldiers: 1000, gold: 500, rice: 2000, kokudaka: 120, commerce: 80, defense: 100 },
        { id: 2, name: "海津城",   ownerClan: 1, castellanId: 103, samuraiIds: [103, 105, 106], soldiers: 800,  gold: 300, rice: 1500, kokudaka: 80,  commerce: 60, defense: 80 },
        { id: 3, name: "躑躅ヶ崎館", ownerClan: 2, castellanId: 201, samuraiIds: [201, 202, 204], soldiers: 1200, gold: 600, rice: 2200, kokudaka: 150, commerce: 90, defense: 110 },
        { id: 4, name: "小田原城", ownerClan: 2, castellanId: 203, samuraiIds: [203, 205, 206], soldiers: 1500, gold: 800, rice: 3000, kokudaka: 180, commerce: 100, defense: 200 }
    ],
    bushos: [
        // Clan 1 (Uesugi)
        { id: 101, name: "上杉謙信", strength: 100, politics: 60, intelligence: 90, loyalty: 100, clan: 1, castleId: 1, isCastellan: true },
        { id: 102, name: "柿崎景家", strength: 90,  politics: 40, intelligence: 50, loyalty: 90,  clan: 1, castleId: 1, isCastellan: false },
        { id: 103, name: "直江景綱", strength: 60,  politics: 85, intelligence: 80, loyalty: 95,  clan: 1, castleId: 2, isCastellan: true },
        { id: 104, name: "宇佐美定満", strength: 70, politics: 70, intelligence: 92, loyalty: 88, clan: 1, castleId: 1, isCastellan: false },
        { id: 105, name: "甘粕景持", strength: 82, politics: 50, intelligence: 60, loyalty: 85, clan: 1, castleId: 2, isCastellan: false },
        { id: 106, name: "鬼小島弥太郎", strength: 94, politics: 10, intelligence: 20, loyalty: 80, clan: 1, castleId: 2, isCastellan: false },
        // Clan 2 (Takeda)
        { id: 201, name: "武田信玄", strength: 95,  politics: 95, intelligence: 95, loyalty: 100, clan: 2, castleId: 3, isCastellan: true },
        { id: 202, name: "山県昌景", strength: 88,  politics: 60, intelligence: 70, loyalty: 90,  clan: 2, castleId: 3, isCastellan: false },
        { id: 203, name: "北条氏康", strength: 85,  politics: 90, intelligence: 90, loyalty: 100, clan: 2, castleId: 4, isCastellan: true },
        { id: 204, name: "山本勘助", strength: 60,  politics: 70, intelligence: 98, loyalty: 95,  clan: 2, castleId: 3, isCastellan: false },
        { id: 205, name: "北条綱成", strength: 92,  politics: 50, intelligence: 60, loyalty: 95,  clan: 2, castleId: 4, isCastellan: false },
        { id: 206, name: "風魔小太郎", strength: 80, politics: 20, intelligence: 90, loyalty: 70,  clan: 2, castleId: 4, isCastellan: false }
    ]
};

/* --- Models --- */
class Busho {
    constructor(data) {
        Object.assign(this, data);
        this.fatigue = 0;
        this.isActionDone = false;
    }
}
class Castle {
    constructor(data) {
        Object.assign(this, data);
        this.samuraiIds = [...data.samuraiIds];
        this.maxDefense = data.defense;
        this.isDone = false;
    }
}

/* --- Logic Systems --- */
class GameSystem {
    static calcDevelopment(busho) { return Math.floor(CONFIG.Coef.BaseDev + (busho.politics * CONFIG.Coef.DevPolitics)); }
    static calcDraft(busho) { return Math.floor(CONFIG.Coef.BaseDraft + (busho.strength * CONFIG.Coef.DraftStr)); }
    static calcRepair(busho) { return Math.floor(CONFIG.Coef.BaseRepair + (busho.politics * CONFIG.Coef.RepairPol)); }
    static calcWarDamage(atkStats, atkSoldiers, type) {
        let baseDmg = (atkStats.str * CONFIG.War.DmgStatCoef) + (atkSoldiers * CONFIG.War.DmgSoldierCoef);
        let multiplier = 1.0;
        switch(type) {
            case 'bow': multiplier = 0.6; break;
            case 'siege': multiplier = 0.8; break;
            case 'charge': multiplier = 1.2; break;
            case 'scheme': baseDmg = (atkStats.int * 1.5); multiplier = 1.0; break;
        }
        return Math.floor(baseDmg * multiplier + (Math.random() * 10));
    }
}

/* --- UI Manager --- */
class UIManager {
    constructor(game) {
        this.game = game;
        this.currentCastle = null;
        this.menuState = 'MAIN';
        
        // DOM Cache
        this.mapEl = document.getElementById('map-container');
        this.panelEl = document.getElementById('control-panel');
        this.cmdArea = document.getElementById('command-area');
        this.logEl = document.getElementById('log-content');
        
        this.selectorModal = document.getElementById('selector-modal');
        this.selectorList = document.getElementById('selector-list');
        this.selectorConfirmBtn = document.getElementById('selector-confirm-btn');
        this.startScreen = document.getElementById('start-screen');
    }

    log(msg) {
        const div = document.createElement('div');
        div.textContent = msg;
        this.logEl.prepend(div);
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
            if (c.isDone) el.classList.add('done');
            if (this.game.getCurrentTurnCastle() === c && !c.isDone) {
                el.classList.add('active-turn');
            }

            const castellan = this.game.getBusho(c.castellanId);
            const clanName = (c.ownerClan === 1) ? "上杉軍" : "武田軍";

            el.innerHTML = `
                <div class="card-header"><h3>${c.name}</h3></div>
                <div class="card-owner">${clanName}</div>
                <div class="param-grid">
                    <div class="param-item"><span>城主</span> <strong>${castellan ? castellan.name : '-'}</strong></div>
                    <div class="param-item"><span>兵数</span> ${c.soldiers}</div>
                    <div class="param-item"><span>金</span> ${c.gold}</div>
                    <div class="param-item"><span>兵糧</span> ${c.rice}</div>
                </div>
            `;
            // 自分の城、または情報閲覧モードならクリック可能
            el.onclick = () => {
                if(this.menuState === 'INFO_SELECT') {
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

    updatePanelHeader() {
        if (!this.currentCastle) return;
        document.getElementById('panel-title').textContent = this.currentCastle.name;
        const clanName = (this.currentCastle.ownerClan === 1) ? "上杉軍" : "武田軍";
        document.getElementById('panel-clan').textContent = clanName;
        document.getElementById('panel-gold').textContent = this.currentCastle.gold;
        document.getElementById('panel-rice').textContent = this.currentCastle.rice;
        document.getElementById('panel-soldiers').textContent = this.currentCastle.soldiers;
        document.getElementById('panel-defense').textContent = this.currentCastle.defense;
    }

    // --- Command Menu ---
    renderCommandMenu() {
        this.cmdArea.innerHTML = '';
        const createBtn = (label, cls, onClick) => {
            const btn = document.createElement('button');
            btn.className = `cmd-btn ${cls}`;
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
            createBtn("出陣 (敵城選択)", "", () => this.openTargetCastleSelector('war'));
            createBtn("徴兵 (金50/兵糧50)", "", () => this.openBushoSelector('draft'));
            createBtn("城壁修復 (金30)", "", () => this.openBushoSelector('repair'));
            createBtn("戻る", "back", () => { this.menuState = 'MAIN'; this.renderCommandMenu(); });
        }
        else if (this.menuState === 'PERSONNEL') {
            createBtn("武将移動", "", () => this.openTargetCastleSelector('move'));
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

    // --- Selectors ---
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
            targets = this.game.castles.filter(c => c.ownerClan !== 0 && c.ownerClan !== this.currentCastle.ownerClan);
        } else if (actionType === 'move') {
            targets = this.game.castles.filter(c => c.ownerClan === this.currentCastle.ownerClan && c.id !== this.currentCastle.id);
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
        let html = `<h3>${castle.name} (金:${castle.gold} 兵糧:${castle.rice})</h3>`;
        html += `<div style="max-height:300px; overflow-y:auto;">`;
        bushos.forEach(b => {
            html += `
                <div style="border-bottom:1px solid #ccc; padding:5px;">
                    <strong>${b.name}</strong> ${b.isCastellan ? '★' : ''}<br>
                    武:${b.strength} 政:${b.politics} 智:${b.intelligence} 忠:${b.loyalty}<br>
                    状態: ${b.isActionDone ? '行動済' : '可'}
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
        this.playerClanId = 1; // Default
        
        this.ui = new UIManager(this);
        this.warState = { active: false };
    }

    // エントリーポイント
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
        
        this.castles.forEach(c => {
            if (c.ownerClan === 0) return;
            c.isDone = false;
            // 収入
            let income = Math.floor(c.commerce * CONFIG.Coef.IncomeGold);
            if(this.month === 3) income += 100;
            c.gold += income;
            if(this.month === 9) c.rice += c.kokudaka * 10;
            
            // 支出
            const bushos = this.getCastleBushos(c.id);
            c.rice = Math.max(0, c.rice - Math.floor(c.soldiers * CONFIG.Coef.ConsumeRice));
            c.gold = Math.max(0, c.gold - (bushos.length * CONFIG.Coef.ConsumeGoldPerBusho));
            bushos.forEach(b => b.isActionDone = false);
        });

        // ターン順決定（生きてる城だけ）
        this.turnQueue = this.castles.filter(c => c.ownerClan !== 0).sort(() => Math.random() - 0.5);
        this.currentIndex = 0;
        
        this.processTurn();
    }

    processTurn() {
        if (this.currentIndex >= this.turnQueue.length) {
            this.endMonth();
            return;
        }

        const castle = this.turnQueue[this.currentIndex];
        this.ui.renderMap();
        this.ui.highlightCastle(castle.id);

        // プレイヤーのターン判定
        if (castle.ownerClan === this.playerClanId) {
            this.ui.log(`【${castle.name}】命令を下してください`);
            this.ui.showControlPanel(castle);
        } else {
            // AI
            this.ui.log(`【${castle.name}】(敵軍) 思考中...`);
            document.getElementById('control-panel').classList.add('hidden');
            // コンテキストをバインドして呼び出し
            setTimeout(() => this.execAI(castle), 800);
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
        if (clans.size === 1) {
            const winner = MASTER_DATA.clans.find(c => c.id === [...clans][0]);
            alert(`天下統一！ 勝者：${winner ? winner.name : '不明'}`);
        } else {
            this.startMonth();
        }
    }

    // --- Command Execution ---
    executeCommand(type, bushoIds, targetId) {
        const castle = this.getCurrentTurnCastle();
        let msg = "";

        // Action Logic (Simplified)
        if (['farm', 'commerce', 'draft', 'repair', 'appoint', 'banish'].includes(type)) {
            const busho = this.getBusho(bushoIds[0]);
            if (!busho) return;

            if (type === 'farm') {
                if (castle.gold < 50) { alert("金が足りません"); return; }
                const val = GameSystem.calcDevelopment(busho);
                castle.gold -= 50; castle.kokudaka += val; msg = `${busho.name}が石高を開発 (+${val})`;
            }
            else if (type === 'commerce') {
                if (castle.gold < 50) { alert("金が足りません"); return; }
                const val = GameSystem.calcDevelopment(busho);
                castle.gold -= 50; castle.commerce += val; msg = `${busho.name}が商業を開発 (+${val})`;
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

    execAI(castle) {
        // AI Logic
        const castellan = this.getBusho(castle.castellanId);
        if (castellan && !castellan.isActionDone) {
            const enemies = this.castles.filter(c => c.ownerClan !== 0 && c.ownerClan !== castle.ownerClan);
            // 兵士が十分なら攻撃
            if (castle.soldiers > 1000 && enemies.length > 0) {
                const target = enemies[0];
                castellan.isActionDone = true;
                this.startWar(castle, target, [castellan]);
                return; 
            }
            // 内政
            if (castle.gold > 100) {
                if (castle.soldiers < 800) {
                    castle.soldiers += 100; castle.gold -= 50; castle.rice -= 50;
                    this.ui.log(`${castle.name}が徴兵を行いました`);
                } else {
                    castle.commerce += 5; castle.gold -= 50;
                    this.ui.log(`${castle.name}が開発を行いました`);
                }
                castellan.isActionDone = true;
            }
        }
        this.finishTurn();
    }

    startWar(atkCastle, defCastle, atkBushos) {
        this.warState = {
            active: true, round: 1, attacker: atkCastle, defender: defCastle,
            atkBushos: atkBushos,
            defBusho: this.getBusho(defCastle.castellanId) || {name:"守備隊長", strength:30, intelligence:30},
            turn: 'defender'
        };
        const warModal = document.getElementById('war-modal');
        warModal.classList.remove('hidden');
        document.getElementById('war-log').innerHTML = '';
        this.ui.log(`★ ${atkCastle.name}が出陣！ ${defCastle.name}へ攻撃！`);
        this.updateWarUI();
        this.processWarRound();
    }

    processWarRound() {
        if (!this.warState.active) return;
        const s = this.warState;
        
        if (s.defender.soldiers <= 0 || s.defender.defense <= 0) { this.endWar(true); return; }
        if (s.attacker.soldiers <= 0) { this.endWar(false); return; }

        this.updateWarUI();
        
        const isPlayerAtk = (s.attacker.ownerClan === this.playerClanId);
        const currentIsAtk = (s.turn === 'attacker');

        // プレイヤーの攻撃ターンのみ操作可能
        if (currentIsAtk && isPlayerAtk) {
            document.getElementById('war-turn-actor').textContent = "自軍攻撃";
            document.getElementById('war-controls').classList.remove('disabled-area');
        } else {
            // AI攻撃 or 防御側(全AI処理)
            document.getElementById('war-turn-actor').textContent = currentIsAtk ? "敵軍攻撃" : "防御行動";
            document.getElementById('war-controls').classList.add('disabled-area');
            setTimeout(() => this.execWarAI(), 800);
        }
    }

    execWarCmd(type) { this.resolveWarAction(type); }
    execWarAI() { this.resolveWarAction('charge'); }

    resolveWarAction(type) {
        if(type === 'retreat') {
             if(this.warState.turn === 'attacker') this.endWar(false);
             return;
        }
        const s = this.warState;
        const isAtk = (s.turn === 'attacker');
        const target = isAtk ? s.defender : s.attacker;
        const armySoldiers = isAtk ? s.attacker.soldiers : s.defender.soldiers;
        
        let stats = { str:0, int:0 };
        if (isAtk) {
            s.atkBushos.forEach(b => { stats.str += b.strength; stats.int += b.intelligence; });
            stats.str /= Math.max(1, s.atkBushos.length * 0.7); 
        } else {
            stats.str = s.defBusho.strength; stats.int = s.defBusho.intelligence;
        }

        const dmg = GameSystem.calcWarDamage(stats, armySoldiers, type);
        let msg = "";

        if (type === 'siege' && isAtk) {
            target.defense = Math.max(0, target.defense - Math.floor(dmg * 0.8));
            target.soldiers = Math.max(0, target.soldiers - Math.floor(dmg * 0.2));
            msg = `城壁攻撃 (兵-${Math.floor(dmg*0.2)} 防-${Math.floor(dmg*0.8)})`;
        } else {
            target.soldiers = Math.max(0, target.soldiers - dmg);
            msg = `部隊攻撃 (兵-${dmg})`;
        }

        const logDiv = document.createElement('div');
        logDiv.textContent = `R${s.round} [${isAtk?'攻':'守'}] ${msg}`;
        document.getElementById('war-log').prepend(logDiv);

        if (!isAtk) {
            s.turn = 'attacker'; s.round++;
            if(s.round > 10) { this.endWar(false); return; }
        } else {
            s.turn = 'defender';
        }
        this.processWarRound();
    }

    updateWarUI() {
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
        document.getElementById('war-modal').classList.add('hidden');
        
        if (attackerWon) {
            this.ui.log(`＞＞ ${s.attacker.name}の勝利！ ${s.defender.name}を制圧！`);
            s.defender.ownerClan = s.attacker.ownerClan;
            s.defender.soldiers = 0;
            // 城主は逃亡または捕縛（簡易的に解任）
            const defCastellan = this.getBusho(s.defender.castellanId);
            if(defCastellan) { defCastellan.isCastellan = false; defCastellan.castleId = 0; defCastellan.status = 'ronin'; }
            s.defender.castellanId = null;
        } else {
            this.ui.log(`＞＞ 攻撃失敗...撤退します`);
        }

        // 重要: AIが攻撃側だった場合は、ここでターンエンド処理を呼ぶ
        if (s.attacker.ownerClan !== this.playerClanId) {
            this.finishTurn();
        } else {
            // プレイヤーならメニューに戻る
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
            // スタート画面を隠す
            document.getElementById('start-screen').classList.add('hidden');
        }
    }
}

// Start
window.onload = () => { 
    window.GameApp = new GameManager(); 
    // 自動開始せず、ブート画面を表示
    window.GameApp.boot(); 
};
