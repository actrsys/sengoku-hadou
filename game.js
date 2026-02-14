/**
 * 戦国シミュレーションゲーム (Unity移植対応アーキテクチャ)
 */

/* --- 0. Data Source (本来は外部JSONファイル) --- */
const MASTER_DATA = {
    castles: [
        { id: 1, name: "春日山城", ownerClan: 1, castellanId: 101, samuraiIds: [101, 102], soldiers: 1000, gold: 500, rice: 2000, kokudaka: 120, commerce: 80, defense: 100 },
        { id: 2, name: "海津城",   ownerClan: 1, castellanId: 103, samuraiIds: [103],      soldiers: 800,  gold: 300, rice: 1500, kokudaka: 80,  commerce: 60, defense: 80 },
        { id: 3, name: "躑躅ヶ崎館", ownerClan: 2, castellanId: 201, samuraiIds: [201, 202], soldiers: 1200, gold: 600, rice: 2200, kokudaka: 150, commerce: 90, defense: 110 },
        { id: 4, name: "小田原城", ownerClan: 2, castellanId: 203, samuraiIds: [203],      soldiers: 1500, gold: 800, rice: 3000, kokudaka: 180, commerce: 100, defense: 200 }
    ],
    bushos: [
        // Clan 1: 上杉
        { id: 101, name: "上杉謙信", strength: 100, politics: 60, intelligence: 90, loyalty: 100, clan: 1, castleId: 1, isCastellan: true },
        { id: 102, name: "柿崎景家", strength: 90,  politics: 40, intelligence: 50, loyalty: 90,  clan: 1, castleId: 1, isCastellan: false },
        { id: 103, name: "直江景綱", strength: 60,  politics: 85, intelligence: 80, loyalty: 95,  clan: 1, castleId: 2, isCastellan: true },
        // Clan 2: 武田/北条
        { id: 201, name: "武田信玄", strength: 95,  politics: 95, intelligence: 95, loyalty: 100, clan: 2, castleId: 3, isCastellan: true },
        { id: 202, name: "山県昌景", strength: 88,  politics: 60, intelligence: 70, loyalty: 90,  clan: 2, castleId: 3, isCastellan: false },
        { id: 203, name: "北条氏康", strength: 85,  politics: 90, intelligence: 90, loyalty: 100, clan: 2, castleId: 4, isCastellan: true }
    ],
    config: {
        StartYear: 1560,
        StartMonth: 1,
        // 係数定義
        Coef: {
            IncomeGold: 0.5,
            ConsumeRice: 0.2,
            ConsumeGoldPerBusho: 5,
            Repair: 2.0,
            DevStats: 5 // 開発ごとの上昇値
        },
        War: {
            MaxRounds: 10,
            DmgStatCoef: 0.5, // 能力値係数
            DmgSoldierCoef: 0.05, // 兵数係数
            LoyaltyWin: 3,
            LoyaltyLoseAtk: -3,
            LoyaltyLoseDef: -5
        }
    }
};

/* --- 1. Models (データ構造定義) --- */

class BushoModel {
    constructor(data) {
        this.id = data.id;
        this.name = data.name;
        this.strength = data.strength;
        this.politics = data.politics;
        this.intelligence = data.intelligence;
        this.loyalty = data.loyalty;
        this.clan = data.clan;
        this.castleId = data.castleId;
        this.status = data.status || 'active'; // active, ronin
        this.isCastellan = data.isCastellan;
        this.fatigue = 0;
    }

    // 志向性判定プロパティ
    get personality() {
        if (this.strength >= this.politics && this.strength >= this.intelligence) return 'aggressive';
        if (this.politics >= this.strength && this.politics >= this.intelligence) return 'domestic';
        return 'analyst';
    }
}

class CastleModel {
    constructor(data) {
        this.id = data.id;
        this.name = data.name;
        this.ownerClan = data.ownerClan;
        this.castellanId = data.castellanId;
        this.samuraiIds = [...data.samuraiIds];
        this.soldiers = data.soldiers;
        this.gold = data.gold;
        this.rice = data.rice;
        this.kokudaka = data.kokudaka;
        this.commerce = data.commerce;
        this.defense = data.defense;
        this.maxDefense = data.defense; // 初期値を最大とする
        this.isDone = false; // ターン行動済みフラグ
    }
}

/* --- 2. Systems (純粋関数・ロジック計算) --- */

class InternalAffairsSystem {
    // 開発計算
    static develop(castle, type) {
        const cost = 50;
        if (castle.gold < cost) return false;

        castle.gold -= cost;
        if (type === 'commerce') castle.commerce += MASTER_DATA.config.Coef.DevStats;
        if (type === 'farm') castle.kokudaka += MASTER_DATA.config.Coef.DevStats;
        return true;
    }

    // 徴兵
    static draft(castle) {
        const goldCost = 50;
        const riceCost = 50;
        if (castle.gold < goldCost || castle.rice < riceCost) return false;

        castle.gold -= goldCost;
        castle.rice -= riceCost;
        castle.soldiers += 100;
        return true;
    }

    // 月次資源計算
    static calcMonthlyResources(castle, bushoCount, month) {
        // 収入
        let goldIn = Math.floor(castle.commerce * MASTER_DATA.config.Coef.IncomeGold);
        if (month === 3) goldIn += 100;
        
        let riceIn = 0;
        if (month === 9) riceIn = castle.kokudaka * 10;

        // 支出
        const riceOut = Math.floor(castle.soldiers * MASTER_DATA.config.Coef.ConsumeRice);
        const goldOut = bushoCount * MASTER_DATA.config.Coef.ConsumeGoldPerBusho;

        return { goldIn, riceIn, riceOut, goldOut };
    }
}

class WarSystem {
    // ダメージ計算式
    static calculateDamage(atkBusho, atkSoldiers, type) {
        // type: bow(小), siege(中), charge(大), scheme(計略)
        let baseDmg = (atkBusho.strength * MASTER_DATA.config.Coef.War.DmgStatCoef) +
                      (atkSoldiers * MASTER_DATA.config.Coef.War.DmgSoldierCoef);
        
        let multiplier = 1.0;
        let variance = Math.random() * 10; // 0-10の乱数

        switch(type) {
            case 'bow': multiplier = 0.6; break;
            case 'siege': multiplier = 0.8; break; // 対城壁用
            case 'charge': multiplier = 1.2; break;
            case 'scheme': 
                // 計略は智謀依存
                baseDmg = (atkBusho.intelligence * 1.5); 
                multiplier = 1.0; 
                break;
        }

        return Math.floor(baseDmg * multiplier + variance);
    }
}

class AISystem {
    static decideStrategyAction(castle, busho, enemies) {
        // 1. 戦争スコア計算
        let bestTarget = null;
        let maxScore = -9999;

        // 簡易判断: 兵士数が十分で、かつ隣接(全敵)の中で一番弱い所を狙う
        enemies.forEach(enemy => {
            let score = (busho.strength) - (enemy.soldiers * 0.1);
            if (castle.rice < castle.soldiers * 0.5) score -= 50; // 兵糧不安

            if (score > maxScore) {
                maxScore = score;
                bestTarget = enemy;
            }
        });

        // 閾値を超えたら戦争
        if (maxScore > 50 && bestTarget) {
            return { type: 'war', targetId: bestTarget.id };
        }

        // 2. 内政判断 (性格依存)
        if (busho.personality === 'domestic') {
            return { type: 'farm' };
        } else if (busho.personality === 'aggressive') {
            if (castle.gold > 50 && castle.rice > 100) return { type: 'draft' };
            return { type: 'commerce' };
        } else {
            // 分析家はバランス型
            return castle.commerce < castle.kokudaka ? { type: 'commerce' } : { type: 'farm' };
        }
    }

    static decideTacticalCommand(situation) {
        // 戦闘中のAIコマンド選択
        const mySoldiers = situation.me.soldiers;
        const enemySoldiers = situation.enemy.soldiers;
        const enemyWall = situation.enemy.defense;

        // 兵数が少ないなら弓で削る
        if (mySoldiers < enemySoldiers * 0.5) return 'bow';
        
        // 敵の城壁が薄いなら城攻め
        if (enemyWall < 50) return 'siege';

        // それ以外は力攻め
        return 'charge';
    }
}

/* --- 3. Managers (状態管理) --- */

class GameManager {
    constructor() {
        this.year = MASTER_DATA.config.StartYear;
        this.month = MASTER_DATA.config.StartMonth;
        this.castles = [];
        this.bushos = [];
        this.turnOrder = [];
        this.currentTurnIndex = 0;
        this.isPlayerTurn = false;
        
        // 戦争状態
        this.warState = null; 

        this.loadInitialData();
    }

    loadInitialData() {
        this.castles = MASTER_DATA.castles.map(d => new CastleModel(d));
        this.bushos = MASTER_DATA.bushos.map(d => new BushoModel(d));
    }

    getCastle(id) { return this.castles.find(c => c.id === id); }
    getBusho(id) { return this.bushos.find(b => b.id === id); }
    getCastellan(castleId) {
        const c = this.getCastle(castleId);
        return this.bushos.find(b => b.id === c.castellanId);
    }

    // 月初処理
    startMonth() {
        UIManager.log(`=== ${this.year}年 ${this.month}月 ===`);
        
        // 資源増減
        this.castles.forEach(c => {
            const bushoCount = c.samuraiIds.length;
            const res = InternalAffairsSystem.calcMonthlyResources(c, bushoCount, this.month);
            
            c.gold += res.goldIn - res.goldOut;
            c.rice += res.riceIn - res.riceOut;
            c.isDone = false;
        });

        // 順番決め (ランダム)
        this.turnOrder = [...this.castles].sort(() => Math.random() - 0.5);
        this.currentTurnIndex = -1; // nextTurnで0になる

        this.nextTurn();
    }

    // ターン進行
    nextTurn() {
        // 戦争中なら無視
        if (this.warState && this.warState.active) return;

        this.currentTurnIndex++;

        // 月終了判定
        if (this.currentTurnIndex >= this.turnOrder.length) {
            this.endMonth();
            return;
        }

        const currentCastle = this.turnOrder[this.currentTurnIndex];
        
        // 滅亡済み or 行動済みならスキップ
        if (currentCastle.ownerClan === 0 || currentCastle.isDone) {
            this.nextTurn();
            return;
        }

        UIManager.renderMap();
        UIManager.highlightCastle(currentCastle.id);

        // プレイヤー判定 (Clan 1をプレイヤーとする)
        if (currentCastle.ownerClan === 1) {
            this.isPlayerTurn = true;
            UIManager.log(`${currentCastle.name} (自軍) の手番です。`);
            UIManager.showControlPanel(currentCastle);
        } else {
            this.isPlayerTurn = false;
            UIManager.log(`${currentCastle.name} (敵軍) 思考中...`);
            UIManager.hideControlPanel();
            setTimeout(() => this.execAI(currentCastle), 1000); // 演出用ウェイト
        }
    }

    // AI実行
    execAI(castle) {
        const busho = this.getCastellan(castle.id);
        const enemies = this.castles.filter(c => c.ownerClan !== 0 && c.ownerClan !== castle.ownerClan);
        
        const action = AISystem.decideStrategyAction(castle, busho, enemies);
        
        if (action.type === 'war') {
            const target = this.getCastle(action.targetId);
            this.startWar(castle, target);
        } else {
            this.executeDomestic(castle, action.type);
            this.nextTurn();
        }
    }

    // プレイヤー行動実行
    executeDomestic(castle, type) {
        let msg = "";
        let success = false;

        switch(type) {
            case 'commerce':
                success = InternalAffairsSystem.develop(castle, 'commerce');
                msg = success ? "商業を開発しました。" : "資金が足りません。";
                break;
            case 'farm':
                success = InternalAffairsSystem.develop(castle, 'farm');
                msg = success ? "石高を開発しました。" : "資金が足りません。";
                break;
            case 'draft':
                success = InternalAffairsSystem.draft(castle);
                msg = success ? "徴兵を行いました。" : "資源が足りません。";
                break;
            case 'wait':
                success = true;
                msg = "待機しました。";
                break;
        }

        if (success) {
            castle.isDone = true;
            UIManager.log(`[${castle.name}] ${msg}`);
            if (this.isPlayerTurn) {
                UIManager.hideControlPanel();
                // プレイヤーの場合、手動で「次へ」を押してもらうか、自動で進むか。
                // ここでは自動で進める
                this.nextTurn();
            }
        } else {
            if (this.isPlayerTurn) alert(msg);
        }
    }

    // --- 戦争システム (ラウンド制) ---
    startWar(atkCastle, defCastle) {
        UIManager.log(`★ 合戦開始！ ${atkCastle.name} vs ${defCastle.name}`);
        
        const atkBusho = this.getCastellan(atkCastle.id);
        const defBusho = this.getCastellan(defCastle.id);

        this.warState = {
            active: true,
            round: 1,
            attacker: atkCastle,
            defender: defCastle,
            atkBusho: atkBusho,
            defBusho: defBusho
        };

        UIManager.showWarModal(this.warState);

        // プレイヤーが攻撃側ならコマンド待ち、そうでなければAI開始
        if (atkCastle.ownerClan === 1) {
            UIManager.enableWarButtons(true);
        } else {
            UIManager.enableWarButtons(false);
            setTimeout(() => this.processWarRoundAI(), 1000);
        }
    }

    // プレイヤーがコマンド選択したときに呼ばれる
    executeWarCommand(cmdType) {
        if (!this.warState.active) return;
        this.resolveRound(cmdType);
    }

    // AI同士 または AI攻撃の場合
    processWarRoundAI() {
        if (!this.warState.active) return;
        // 攻撃側AIの判断
        const cmd = AISystem.decideTacticalCommand({
            me: this.warState.attacker, 
            enemy: this.warState.defender
        });
        this.resolveRound(cmd);
    }

    // ラウンド解決 (共通)
    resolveRound(atkCmd) {
        const { attacker, defender, atkBusho, defBusho } = this.warState;
        
        // 1. 攻撃側の行動
        const dmgToDef = WarSystem.calculateDamage(atkBusho, attacker.soldiers, atkCmd);
        
        // ダメージ適用 (城攻めならDefenseに、それ以外ならSoldiersに比重)
        let defLog = "";
        if (atkCmd === 'siege') {
            defender.defense -= Math.floor(dmgToDef * 0.8);
            defender.soldiers -= Math.floor(dmgToDef * 0.2);
            defLog = `城壁に大打撃！(城-${Math.floor(dmgToDef*0.8)})`;
        } else {
            defender.soldiers -= dmgToDef;
            defLog = `守備兵にダメージ！(兵-${dmgToDef})`;
        }

        UIManager.logWar(`R${this.warState.round} [攻]${atkCmd}: ${defLog}`);

        // 決着判定
        if (defender.soldiers <= 0 || defender.defense <= 0) {
            this.endWar(true);
            return;
        }

        // 2. 防御側の行動 (常にAI)
        const defCmd = AISystem.decideTacticalCommand({ me: defender, enemy: attacker });
        const dmgToAtk = WarSystem.calculateDamage(defBusho, defender.soldiers, defCmd);
        
        attacker.soldiers -= dmgToAtk;
        UIManager.logWar(`R${this.warState.round} [守]${defCmd}: 攻撃兵に反撃！(兵-${dmgToAtk})`);

        // 決着判定
        if (attacker.soldiers <= 0) {
            this.endWar(false);
            return;
        }

        // ラウンド経過
        this.warState.round++;
        if (this.warState.round > 10) {
            this.endWar(false); // 期限切れは攻撃側敗北
            return;
        }

        // UI更新
        UIManager.updateWarModal(this.warState);

        // 次のラウンドへ
        if (attacker.ownerClan === 1) {
            UIManager.enableWarButtons(true);
        } else {
            setTimeout(() => this.processWarRoundAI(), 1000);
        }
    }

    endWar(attackerWon) {
        const { attacker, defender, atkBusho, defBusho } = this.warState;
        
        this.warState.active = false;
        UIManager.hideWarModal();

        attacker.isDone = true;

        if (attackerWon) {
            UIManager.log(`決着！ ${attacker.name} の勝利！ ${defender.name} を制圧しました。`);
            defender.ownerClan = attacker.ownerClan;
            defender.soldiers = 0; // 残存兵を0にするか、少し残すかは仕様次第だが今回は0
            atkBusho.loyalty += 3;
        } else {
            UIManager.log(`決着！ ${attacker.name} の敗北（または撤退）...`);
            atkBusho.loyalty -= 3;
            defBusho.loyalty -= 5; // 防御側も被害甚大なら下がる
        }

        UIManager.renderMap();
        this.nextTurn();
    }


    endMonth() {
        // 月末処理 (資源枯渇ペナルティ等)
        this.castles.forEach(c => {
            if (c.rice < 0) {
                c.soldiers = Math.max(0, c.soldiers - 200);
                c.rice = 0;
                UIManager.log(`${c.name}: 米不足により兵士逃亡`);
            }
            if (c.gold < 0) {
                c.gold = 0;
                // 忠誠度低下ロジックを入れる場所
            }
        });

        this.month++;
        if (this.month > 12) {
            this.month = 1;
            this.year++;
        }
        
        // 終了判定
        const clans = new Set(this.castles.map(c => c.ownerClan));
        if (clans.size === 1) {
            alert("天下統一完了！");
            return;
        }

        this.startMonth();
    }

    // セーブ・ロード
    save() {
        const data = {
            year: this.year,
            month: this.month,
            castles: this.castles,
            bushos: this.bushos
        };
        localStorage.setItem('sengoku_save_v2', JSON.stringify(data));
        alert("セーブしました");
    }

    load() {
        const json = localStorage.getItem('sengoku_save_v2');
        if (!json) return;
        const data = JSON.parse(json);
        this.year = data.year;
        this.month = data.month;
        // クラスの再インスタンス化が必要
        this.castles = data.castles.map(d => new CastleModel(d));
        this.bushos = data.bushos.map(d => new BushoModel(d));
        UIManager.log("ロードしました。");
        UIManager.renderMap();
    }
}

/* --- 4. UIManager (View / DOM操作) --- */

class UIManager {
    static init() {
        this.mapEl = document.getElementById('map-container');
        this.logEl = document.getElementById('log-content');
        this.panelEl = document.getElementById('control-panel');
        this.panelTitle = document.getElementById('panel-title');
        this.panelInfo = document.getElementById('panel-info');
        this.actionButtons = document.getElementById('action-buttons');
        
        // War Modal Elements
        this.warModal = document.getElementById('war-modal');
        this.warLog = document.getElementById('war-log');
        this.warControls = document.getElementById('war-controls');
        this.warEls = {
            atkName: document.getElementById('war-atk-name'),
            atkSoldier: document.getElementById('war-atk-soldier'),
            atkBusho: document.getElementById('war-atk-busho'),
            defName: document.getElementById('war-def-name'),
            defSoldier: document.getElementById('war-def-soldier'),
            defWall: document.getElementById('war-def-wall'),
            defBusho: document.getElementById('war-def-busho'),
        };
    }

    static log(msg) {
        const div = document.createElement('div');
        div.textContent = msg;
        this.logEl.prepend(div);
    }

    static renderMap() {
        this.mapEl.innerHTML = '';
        document.getElementById('date-display').textContent = `${window.GameApp.manager.year}年 ${window.GameApp.manager.month}月`;

        window.GameApp.manager.castles.forEach(c => {
            const el = document.createElement('div');
            el.className = 'castle-card';
            el.dataset.clan = c.ownerClan;
            if (c.isDone) el.classList.add('done');
            if (window.GameApp.manager.turnOrder[window.GameApp.manager.currentTurnIndex] === c) {
                el.classList.add('active-turn');
            }

            const castellan = window.GameApp.manager.getCastellan(c.id);

            el.innerHTML = `
                <h3>${c.name}</h3>
                <div class="stat-row"><span>支配:</span> <strong>${c.ownerClan === 1 ? '武田軍' : (c.ownerClan === 2 ? '上杉軍' : 'なし')}</strong></div>
                <div class="stat-row"><span>城主:</span> ${castellan ? castellan.name : '不在'}</div>
                <div class="stat-row"><span>兵士:</span> ${c.soldiers}</div>
                <div class="stat-row"><span>石高/商業:</span> ${c.kokudaka}/${c.commerce}</div>
                <div class="stat-row"><span>金/米:</span> ${c.gold}/${c.rice}</div>
                <div class="stat-row"><span>防御:</span> ${c.defense}</div>
            `;
            this.mapEl.appendChild(el);
        });
    }

    static highlightCastle(id) {
        // renderMapでクラス付与済みだが、スクロール等の処理が必要ならここに記述
    }

    static showControlPanel(castle) {
        this.panelEl.classList.remove('hidden');
        this.panelTitle.textContent = castle.name + " 行動選択";
        this.panelInfo.innerHTML = `金: ${castle.gold} <br> 米: ${castle.rice}`;
        
        this.actionButtons.innerHTML = '';
        const createBtn = (label, cb) => {
            const btn = document.createElement('button');
            btn.textContent = label;
            btn.onclick = cb;
            this.actionButtons.appendChild(btn);
        };

        createBtn("商業開発 (金50)", () => window.GameApp.manager.executeDomestic(castle, 'commerce'));
        createBtn("石高開発 (金50)", () => window.GameApp.manager.executeDomestic(castle, 'farm'));
        createBtn("徴兵 (金50/米50)", () => window.GameApp.manager.executeDomestic(castle, 'draft'));
        
        // 攻撃ボタン (隣接判定省略、自分以外の全敵)
        const enemies = window.GameApp.manager.castles.filter(c => c.ownerClan !== castle.ownerClan && c.ownerClan !== 0);
        enemies.forEach(e => {
            createBtn(`出陣 -> ${e.name}`, () => window.GameApp.manager.startWar(castle, e));
        });

        createBtn("待機", () => window.GameApp.manager.executeDomestic(castle, 'wait'));
    }

    static hideControlPanel() {
        this.panelEl.classList.add('hidden');
    }

    // --- War UI ---
    static showWarModal(state) {
        this.warModal.classList.remove('hidden');
        this.warLog.innerHTML = '';
        this.updateWarModal(state);

        // コマンドボタン生成
        this.warControls.innerHTML = '';
        const cmds = [
            { id: 'bow', label: '弓攻撃 (小)' },
            { id: 'siege', label: '城攻め (壁)' },
            { id: 'charge', label: '力攻め (大)' },
            { id: 'scheme', label: '計略 (知)' },
            { id: 'retreat', label: '撤退' }
        ];
        cmds.forEach(c => {
            const btn = document.createElement('button');
            btn.textContent = c.label;
            btn.onclick = () => window.GameApp.manager.executeWarCommand(c.id);
            this.warControls.appendChild(btn);
        });
    }

    static updateWarModal(state) {
        this.warEls.atkName.textContent = state.attacker.name;
        this.warEls.atkSoldier.textContent = state.attacker.soldiers;
        this.warEls.atkBusho.textContent = state.atkBusho.name;
        
        this.warEls.defName.textContent = state.defender.name;
        this.warEls.defSoldier.textContent = state.defender.soldiers;
        this.warEls.defWall.textContent = state.defender.defense;
        this.warEls.defBusho.textContent = state.defBusho.name;
    }

    static logWar(msg) {
        const div = document.createElement('div');
        div.textContent = msg;
        this.warLog.prepend(div);
    }

    static enableWarButtons(enabled) {
        const btns = this.warControls.querySelectorAll('button');
        btns.forEach(b => b.disabled = !enabled);
    }

    static hideWarModal() {
        this.warModal.classList.add('hidden');
    }
}

/* --- Entry Point --- */

window.GameApp = {
    manager: null,
    
    start: function() {
        UIManager.init();
        this.manager = new GameManager();
        this.manager.startMonth();
    },

    nextTurn: function() {
        if(this.manager) this.manager.nextTurn();
    },
    saveGame: function() {
        if(this.manager) this.manager.save();
    },
    loadGame: function() {
        if(this.manager) this.manager.load();
    }
};

// 実行
window.onload = function() {
    window.GameApp.start();
};