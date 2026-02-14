/**
 * 戦国シミュレーションゲーム (Unity移植対応アーキテクチャ)
 * Version: Complete
 */

/* --- 0. Data Source (Config & Master) --- */
const MASTER_DATA = {
    config: {
        StartYear: 1560,
        StartMonth: 1,
        Coef: {
            IncomeGold: 0.5,
            ConsumeRice: 0.2,
            ConsumeGoldPerBusho: 5,
            Repair: 2.0,
            DevStats: 5,
            TradeRate: 1.0 // 金1 = 米1
        },
        War: {
            MaxRounds: 10,
            DmgStatCoef: 0.5,
            DmgSoldierCoef: 0.05,
            LoyaltyWin: 3,
            LoyaltyLoseAtk: -3,
            LoyaltyLoseDef: -5
        }
    },
    // 初期データ
    castles: [
        { id: 1, name: "春日山城", ownerClan: 1, castellanId: 101, samuraiIds: [101, 102, 104], soldiers: 1000, gold: 500, rice: 2000, kokudaka: 120, commerce: 80, defense: 100 },
        { id: 2, name: "海津城",   ownerClan: 1, castellanId: 103, samuraiIds: [103, 105, 106], soldiers: 800,  gold: 300, rice: 1500, kokudaka: 80,  commerce: 60, defense: 80 },
        { id: 3, name: "躑躅ヶ崎館", ownerClan: 2, castellanId: 201, samuraiIds: [201, 202, 204], soldiers: 1200, gold: 600, rice: 2200, kokudaka: 150, commerce: 90, defense: 110 },
        { id: 4, name: "小田原城", ownerClan: 2, castellanId: 203, samuraiIds: [203, 205, 206], soldiers: 1500, gold: 800, rice: 3000, kokudaka: 180, commerce: 100, defense: 200 }
    ],
    bushos: [
        // Clan 1: 上杉
        { id: 101, name: "上杉謙信", strength: 100, politics: 60, intelligence: 90, loyalty: 100, clan: 1, castleId: 1, isCastellan: true },
        { id: 102, name: "柿崎景家", strength: 90,  politics: 40, intelligence: 50, loyalty: 90,  clan: 1, castleId: 1, isCastellan: false },
        { id: 103, name: "直江景綱", strength: 60,  politics: 85, intelligence: 80, loyalty: 95,  clan: 1, castleId: 2, isCastellan: true },
        { id: 104, name: "宇佐美定満", strength: 70, politics: 70, intelligence: 92, loyalty: 88, clan: 1, castleId: 1, isCastellan: false },
        { id: 105, name: "甘粕景持", strength: 82, politics: 50, intelligence: 60, loyalty: 85, clan: 1, castleId: 2, isCastellan: false },
        { id: 106, name: "鬼小島弥太郎", strength: 94, politics: 10, intelligence: 20, loyalty: 80, clan: 1, castleId: 2, isCastellan: false },
        // Clan 2: 武田/北条
        { id: 201, name: "武田信玄", strength: 95,  politics: 95, intelligence: 95, loyalty: 100, clan: 2, castleId: 3, isCastellan: true },
        { id: 202, name: "山県昌景", strength: 88,  politics: 60, intelligence: 70, loyalty: 90,  clan: 2, castleId: 3, isCastellan: false },
        { id: 203, name: "北条氏康", strength: 85,  politics: 90, intelligence: 90, loyalty: 100, clan: 2, castleId: 4, isCastellan: true },
        { id: 204, name: "山本勘助", strength: 60,  politics: 70, intelligence: 98, loyalty: 95,  clan: 2, castleId: 3, isCastellan: false },
        { id: 205, name: "北条綱成", strength: 92,  politics: 50, intelligence: 60, loyalty: 95,  clan: 2, castleId: 4, isCastellan: false },
        { id: 206, name: "風魔小太郎", strength: 80, politics: 20, intelligence: 90, loyalty: 70,  clan: 2, castleId: 4, isCastellan: false }
    ]
};

/* --- 1. Data Models --- */

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
        this.maxDefense = data.defense;
        this.isDone = false;
    }
}

/* --- 2. Systems (Logic) --- */

class InternalAffairsSystem {
    static develop(castle, type) {
        const cost = 50;
        if (castle.gold < cost) return { success: false, msg: "金が足りません" };

        castle.gold = Math.max(0, castle.gold - cost);
        if (type === 'commerce') {
            castle.commerce += MASTER_DATA.config.Coef.DevStats;
            return { success: true, msg: "商業が発展しました" };
        }
        if (type === 'farm') {
            castle.kokudaka += MASTER_DATA.config.Coef.DevStats;
            return { success: true, msg: "石高が増えました" };
        }
        return { success: false, msg: "不明な開発タイプ" };
    }

    static draft(castle) {
        const goldCost = 50;
        const riceCost = 50;
        if (castle.gold < goldCost || castle.rice < riceCost) return { success: false, msg: "金か米が足りません" };

        castle.gold = Math.max(0, castle.gold - goldCost);
        castle.rice = Math.max(0, castle.rice - riceCost);
        castle.soldiers += 100;
        return { success: true, msg: "兵士を100名徴兵しました" };
    }

    static trade(castle, type) {
        // type: 'buy_rice' (金->米), 'sell_rice' (米->金)
        // レートは等価交換とする
        const amount = 100;
        if (type === 'buy_rice') {
            if (castle.gold < amount) return { success: false, msg: "金が足りません" };
            castle.gold -= amount;
            castle.rice += amount;
            return { success: true, msg: "米を100購入しました" };
        } else {
            if (castle.rice < amount) return { success: false, msg: "米が足りません" };
            castle.rice -= amount;
            castle.gold += amount;
            return { success: true, msg: "米を100売却しました" };
        }
    }

    static repair(castle) {
        const cost = 30;
        if (castle.gold < cost) return { success: false, msg: "金が足りません" };
        
        // 内政値依存で回復
        const castellan = window.GameApp.manager.getCastellan(castle.id);
        const pol = castellan ? castellan.politics : 10;
        const recover = Math.floor(pol * 0.5) + 10;

        castle.gold -= cost;
        castle.defense = Math.min(castle.maxDefense, castle.defense + recover);
        return { success: true, msg: `城壁を修復しました (+${recover})` };
    }

    static moveBusho(sourceCastle, bushoId, targetCastleId) {
        // 簡易実装：指定武将をターゲット城へ移動
        // 城主は移動不可とする（簡単のため）
        const busho = window.GameApp.manager.getBusho(bushoId);
        if (busho.isCastellan) return { success: false, msg: "城主は移動できません" };

        // 所属変更
        sourceCastle.samuraiIds = sourceCastle.samuraiIds.filter(id => id !== bushoId);
        const targetCastle = window.GameApp.manager.getCastle(targetCastleId);
        targetCastle.samuraiIds.push(bushoId);
        busho.castleId = targetCastleId;

        return { success: true, msg: `${busho.name}が${targetCastle.name}へ移動しました` };
    }

    static calcMonthlyResources(castle, bushoCount, month) {
        let goldIn = Math.floor(castle.commerce * MASTER_DATA.config.Coef.IncomeGold);
        if (month === 3) goldIn += 100;
        
        let riceIn = 0;
        if (month === 9) riceIn = castle.kokudaka * 10;

        const riceOut = Math.floor(castle.soldiers * MASTER_DATA.config.Coef.ConsumeRice);
        const goldOut = bushoCount * MASTER_DATA.config.Coef.ConsumeGoldPerBusho;

        return { goldIn, riceIn, riceOut, goldOut };
    }
}

class WarSystem {
    static calculateDamage(atkBusho, atkSoldiers, type) {
        // type: bow(小), siege(中), charge(大), scheme(計略)
        let baseDmg = (atkBusho.strength * MASTER_DATA.config.War.DmgStatCoef) +
                      (atkSoldiers * MASTER_DATA.config.War.DmgSoldierCoef);
        
        let multiplier = 1.0;
        let variance = Math.random() * 10;

        switch(type) {
            case 'bow': multiplier = 0.6; break;
            case 'siege': multiplier = 0.8; break; // 対城壁用
            case 'charge': multiplier = 1.2; break;
            case 'scheme': 
                baseDmg = (atkBusho.intelligence * 1.5); 
                multiplier = 1.0; 
                break;
        }

        return Math.floor(baseDmg * multiplier + variance);
    }
}

class AISystem {
    static decideStrategy(castle, busho, enemies) {
        // 戦争するかどうか
        let bestTarget = null;
        let maxScore = -9999;

        enemies.forEach(enemy => {
            let score = (busho.strength) - (enemy.soldiers * 0.1);
            if (castle.rice < castle.soldiers * 0.5) score -= 50; 
            if (score > maxScore) {
                maxScore = score;
                bestTarget = enemy;
            }
        });

        if (maxScore > 50 && bestTarget) {
            return { type: 'war', targetId: bestTarget.id };
        }

        // 内政行動
        if (busho.personality === 'domestic') return { type: 'farm' };
        if (busho.personality === 'aggressive') {
            if (castle.gold > 50 && castle.rice > 100) return { type: 'draft' };
            return { type: 'commerce' };
        }
        return castle.commerce < castle.kokudaka ? { type: 'commerce' } : { type: 'farm' };
    }

    static decideTactics(situation, isAttacker) {
        const mySoldiers = situation.me.soldiers;
        const enemySoldiers = situation.enemy.soldiers;
        const enemyWall = situation.enemy.defense;

        // 兵数が少ないなら弓
        if (mySoldiers < enemySoldiers * 0.5) return 'bow';
        
        // 攻撃側で敵の城壁が薄いなら城攻め
        if (isAttacker && enemyWall < 50) return 'siege';
        
        // 防御側で城壁減ってるなら力攻めで敵兵を減らす優先
        if (!isAttacker && situation.me.defense < 30) return 'charge';

        // それ以外は力攻め
        return 'charge';
    }
}

/* --- 3. GameManager (Controller) --- */

class GameManager {
    constructor() {
        this.year = 0;
        this.month = 0;
        this.castles = [];
        this.bushos = [];
        this.turnQueue = [];
        this.currentIndex = 0;
        this.isPlayerTurn = false;
        
        this.warState = { active: false };
    }

    init() {
        this.year = MASTER_DATA.config.StartYear;
        this.month = MASTER_DATA.config.StartMonth;
        this.castles = MASTER_DATA.castles.map(d => new CastleModel(d));
        this.bushos = MASTER_DATA.bushos.map(d => new BushoModel(d));
        this.startMonth();
    }

    getCastle(id) { return this.castles.find(c => c.id === id); }
    getBusho(id) { return this.bushos.find(b => b.id === id); }
    getCastellan(castleId) {
        const c = this.getCastle(castleId);
        return this.bushos.find(b => b.id === c.castellanId);
    }
    getCastleBushos(castleId) {
        const c = this.getCastle(castleId);
        return c.samuraiIds.map(id => this.getBusho(id));
    }

    /* --- Flow Control --- */

    startMonth() {
        UIManager.log(`=== ${this.year}年 ${this.month}月 ===`);
        
        this.castles.forEach(c => {
            if (c.ownerClan === 0) return; // 滅亡済みはスキップ

            const bushoCount = c.samuraiIds.length;
            const res = InternalAffairsSystem.calcMonthlyResources(c, bushoCount, this.month);
            
            c.gold = Math.max(0, c.gold + res.goldIn - res.goldOut);
            c.rice = Math.max(0, c.rice + res.riceIn - res.riceOut);
            c.isDone = false;
            
            // 忠誠度回復（城主）
            const castellan = this.getCastellan(c.id);
            if(castellan) castellan.loyalty = Math.min(100, castellan.loyalty + 5);
        });

        // ランダム順決定
        this.turnQueue = this.castles.filter(c => c.ownerClan !== 0).sort(() => Math.random() - 0.5);
        this.currentIndex = -1;

        this.nextTurn();
    }

    nextTurn() {
        if (this.warState.active) return; // 戦争中は進行不可

        this.currentIndex++;

        if (this.currentIndex >= this.turnQueue.length) {
            this.endMonth();
            return;
        }

        const currentCastle = this.turnQueue[this.currentIndex];
        
        if (currentCastle.isDone) {
            this.nextTurn();
            return;
        }

        UIManager.renderMap();
        UIManager.highlightCastle(currentCastle.id);

        if (currentCastle.ownerClan === 1) {
            this.isPlayerTurn = true;
            UIManager.log(`${currentCastle.name} (自軍) の手番です`);
            UIManager.showControlPanel(currentCastle);
        } else {
            this.isPlayerTurn = false;
            UIManager.log(`${currentCastle.name} (敵軍) 思考中...`);
            UIManager.hideControlPanel();
            setTimeout(() => this.execAI(currentCastle), 800);
        }
    }

    /* --- Actions --- */

    execAction(type, targetId = null) {
        const castle = this.turnQueue[this.currentIndex];
        let res = { success: false, msg: "" };

        switch(type) {
            case 'commerce': res = InternalAffairsSystem.develop(castle, 'commerce'); break;
            case 'farm': res = InternalAffairsSystem.develop(castle, 'farm'); break;
            case 'draft': res = InternalAffairsSystem.draft(castle); break;
            case 'buy_rice': res = InternalAffairsSystem.trade(castle, 'buy_rice'); break;
            case 'sell_rice': res = InternalAffairsSystem.trade(castle, 'sell_rice'); break;
            case 'repair': res = InternalAffairsSystem.repair(castle); break;
            case 'move':
                // 簡易実装：配下の一人を別の自分の城へ送る
                const subordinate = castle.samuraiIds.find(id => id !== castle.castellanId);
                const targetC = this.castles.find(c => c.ownerClan === castle.ownerClan && c.id !== castle.id);
                if (!subordinate) res = { success: false, msg: "配下の武将がいません" };
                else if (!targetC) res = { success: false, msg: "移動先の城がありません" };
                else res = InternalAffairsSystem.moveBusho(castle, subordinate, targetC.id);
                break;
            case 'wait': res = { success: true, msg: "待機しました" }; break;
            case 'war': 
                const enemy = this.getCastle(targetId);
                this.startWar(castle, enemy);
                return; // 戦争開始したらターン終了処理は戦争終了後
        }

        if (res.success) {
            UIManager.log(`[${castle.name}] ${res.msg}`);
            castle.isDone = true;
            UIManager.renderMap();
            if (this.isPlayerTurn) {
                UIManager.hideControlPanel();
                this.nextTurn();
            }
        } else {
            if (this.isPlayerTurn) alert(res.msg);
        }
    }

    execAI(castle) {
        const busho = this.getCastellan(castle.id);
        const enemies = this.castles.filter(c => c.ownerClan !== 0 && c.ownerClan !== castle.ownerClan);
        
        const action = AISystem.decideStrategy(castle, busho, enemies);
        if (action.type === 'war') {
            this.execAction('war', action.targetId);
        } else {
            this.execAction(action.type);
        }
    }

    /* --- War System (Async / Round Based) --- */

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
            defBusho: defBusho,
            turn: 'defender' // 要件：防御側が先
        };

        UIManager.showWarModal(this.warState);
        this.nextWarStep();
    }

    nextWarStep() {
        if (!this.warState.active) return;
        
        // 決着判定
        if (this.checkWarEnd()) return;

        // ラウンド更新
        UIManager.updateWarModal(this.warState);

        const { turn, attacker, defender } = this.warState;
        const currentActor = (turn === 'attacker') ? attacker : defender;
        const isPlayer = (currentActor.ownerClan === 1);

        document.getElementById('war-turn-actor').textContent = isPlayer ? "自軍 (コマンド選択)" : "敵軍 (思考中)";

        if (isPlayer) {
            UIManager.enableWarButtons(true);
        } else {
            UIManager.enableWarButtons(false);
            setTimeout(() => this.execWarAI(), 1000);
        }
    }

    execWarAI() {
        const { turn, attacker, defender } = this.warState;
        const isAtk = (turn === 'attacker');
        const me = isAtk ? attacker : defender;
        const enemy = isAtk ? defender : attacker;
        
        const cmd = AISystem.decideTactics({ me, enemy }, isAtk);
        this.resolveWarAction(cmd);
    }

    // プレイヤーがボタンを押した時
    execWarCmd(cmd) {
        if (!this.warState.active) return;
        this.resolveWarAction(cmd);
    }

    resolveWarAction(cmd) {
        const { turn, attacker, defender, atkBusho, defBusho, round } = this.warState;
        
        if (cmd === 'retreat') {
            UIManager.logWar(`${turn === 'attacker' ? '攻撃側' : '防御側'}が撤退しました`);
            // 撤退は即敗北
            if (turn === 'attacker') this.endWar(false); // 攻撃側敗北
            else this.endWar(true); // 防御側敗北（=攻撃側勝利）
            return;
        }

        const isAtk = (turn === 'attacker');
        const actor = isAtk ? attacker : defender;
        const target = isAtk ? defender : attacker;
        const actorBusho = isAtk ? atkBusho : defBusho;

        const dmg = WarSystem.calculateDamage(actorBusho, actor.soldiers, cmd);
        
        let msg = "";
        if (cmd === 'siege' && isAtk) {
            target.defense = Math.max(0, target.defense - Math.floor(dmg * 0.8));
            target.soldiers = Math.max(0, target.soldiers - Math.floor(dmg * 0.2));
            msg = `城壁攻撃！ 城防-${Math.floor(dmg*0.8)} 兵-${Math.floor(dmg*0.2)}`;
        } else {
            target.soldiers = Math.max(0, target.soldiers - dmg);
            msg = `攻撃！ 敵兵-${dmg}`;
        }

        UIManager.logWar(`R${round} [${isAtk?'攻':'守'}] ${cmd}: ${msg}`);
        UIManager.updateWarModal(this.warState);

        // ターン交代 or ラウンド進行
        if (turn === 'defender') {
            this.warState.turn = 'attacker';
            this.nextWarStep();
        } else {
            // ラウンド終了
            this.warState.round++;
            if (this.warState.round > MASTER_DATA.config.War.MaxRounds) {
                // 時間切れは攻撃側敗北
                UIManager.logWar("時間切れ！ 攻撃失敗");
                this.endWar(false);
            } else {
                this.warState.turn = 'defender';
                this.nextWarStep();
            }
        }
    }

    checkWarEnd() {
        const { attacker, defender } = this.warState;
        if (defender.soldiers <= 0 || defender.defense <= 0) {
            this.endWar(true);
            return true;
        }
        if (attacker.soldiers <= 0) {
            this.endWar(false);
            return true;
        }
        return false;
    }

    endWar(attackerWon) {
        const { attacker, defender, atkBusho, defBusho } = this.warState;
        this.warState.active = false;
        UIManager.hideWarModal();

        attacker.isDone = true;

        if (attackerWon) {
            UIManager.log(`＞＞ ${attacker.name} の勝利！ ${defender.name} を制圧しました`);
            defender.ownerClan = attacker.ownerClan;
            defender.soldiers = 0; // 残党クリア
            atkBusho.loyalty += 3;
        } else {
            UIManager.log(`＞＞ ${attacker.name} の敗北...`);
            atkBusho.loyalty -= 3;
            defBusho.loyalty -= 5;
        }
        
        UIManager.renderMap();
        this.nextTurn();
    }

    endMonth() {
        // 月末処理：資源チェックと在野化
        this.castles.forEach(c => {
            if (c.ownerClan === 0) return;

            // 米不足
            if (c.rice <= 0) {
                const loss = 100;
                c.soldiers = Math.max(0, c.soldiers - loss);
                c.rice = 0;
                UIManager.log(`${c.name}: 米不足で兵士逃亡 (-${loss})`);
            }
            
            // 金不足 -> 忠誠最低の武将が在野化
            if (c.gold <= 0) {
                c.gold = 0;
                const bushosh = this.getCastleBushos(c.id).filter(b => !b.isCastellan);
                if (bushosh.length > 0) {
                    bushosh.sort((a,b) => a.loyalty - b.loyalty);
                    const ronin = bushosh[0];
                    ronin.status = 'ronin';
                    ronin.clan = 0;
                    ronin.castleId = 0;
                    c.samuraiIds = c.samuraiIds.filter(id => id !== ronin.id);
                    UIManager.log(`${c.name}: 資金不足で ${ronin.name} が出奔しました`);
                }
            }
        });

        this.month++;
        if (this.month > 12) {
            this.month = 1;
            this.year++;
        }
        
        // 勝利判定
        const clans = new Set(this.castles.filter(c => c.ownerClan !== 0).map(c => c.ownerClan));
        if (clans.size === 1) {
            alert(`天下統一！ おめでとうございます！\n${this.year}年${this.month}月`);
            return;
        }

        this.startMonth();
    }

    /* Save/Load */
    save() {
        const data = { year: this.year, month: this.month, castles: this.castles, bushos: this.bushos };
        localStorage.setItem('sengoku_complete', JSON.stringify(data));
        alert("セーブしました");
    }

    load() {
        const json = localStorage.getItem('sengoku_complete');
        if (!json) return;
        const data = JSON.parse(json);
        this.year = data.year;
        this.month = data.month;
        this.castles = data.castles.map(d => new CastleModel(d));
        this.bushos = data.bushos.map(d => new BushoModel(d));
        UIManager.renderMap();
        UIManager.log("ロード完了");
    }
}

/* --- 4. UIManager (View) --- */

class UIManager {
    static init() {
        this.mapEl = document.getElementById('map-container');
        this.logEl = document.getElementById('log-content');
        this.panelEl = document.getElementById('control-panel');
        this.panelTitle = document.getElementById('panel-title');
        this.actionButtons = document.getElementById('action-buttons');
        
        // War UI
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
            round: document.getElementById('war-round')
        };
        
        // Busho Modal
        this.bushoModal = document.getElementById('busho-modal');
        this.bushoListContainer = document.getElementById('busho-list-container');
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
            if (window.GameApp.manager.turnQueue[window.GameApp.manager.currentIndex] === c) {
                el.classList.add('active-turn');
            }

            const castellan = window.GameApp.manager.getCastellan(c.id);

            el.innerHTML = `
                <div class="card-header"><h3>${c.name}</h3></div>
                <div class="card-owner">${c.ownerClan === 1 ? '武田軍' : (c.ownerClan === 2 ? '上杉軍' : '陥落')}</div>
                <div class="param-grid">
                    <div class="param-item"><span>城主</span> <strong>${castellan ? castellan.name : '-'}</strong></div>
                    <div class="param-item"><span>兵数</span> ${c.soldiers}</div>
                    <div class="param-item"><span>金</span> ${c.gold}</div>
                    <div class="param-item"><span>米</span> ${c.rice}</div>
                </div>
            `;
            // Click to inspect (if needed)
            el.onclick = () => { /* 閲覧機能などがあれば */ };
            this.mapEl.appendChild(el);
        });
    }

    static highlightCastle(id) {
        // CSS class handles visual logic
    }

    static showControlPanel(castle) {
        this.panelEl.classList.remove('hidden');
        this.panelTitle.textContent = castle.name;
        
        // リソース更新
        document.getElementById('panel-gold').textContent = castle.gold;
        document.getElementById('panel-rice').textContent = castle.rice;
        document.getElementById('panel-soldiers').textContent = castle.soldiers;
        document.getElementById('panel-defense').textContent = castle.defense;
        
        this.currentCastle = castle; // for modal

        // ボタン生成
        this.actionButtons.innerHTML = '';
        const createBtn = (label, cb) => {
            const btn = document.createElement('button');
            btn.textContent = label;
            btn.onclick = cb;
            this.actionButtons.appendChild(btn);
        };

        createBtn("商業開発 (金50)", () => window.GameApp.manager.execAction('commerce'));
        createBtn("石高開発 (金50)", () => window.GameApp.manager.execAction('farm'));
        createBtn("徴兵 (金50/米50)", () => window.GameApp.manager.execAction('draft'));
        createBtn("米購入 (金100→米100)", () => window.GameApp.manager.execAction('buy_rice'));
        createBtn("米売却 (米100→金100)", () => window.GameApp.manager.execAction('sell_rice'));
        createBtn("城壁修復 (金30)", () => window.GameApp.manager.execAction('repair'));
        createBtn("武将移動 (配下)", () => window.GameApp.manager.execAction('move'));

        // 出陣
        const enemies = window.GameApp.manager.castles.filter(c => c.ownerClan !== castle.ownerClan && c.ownerClan !== 0);
        enemies.forEach(e => {
            createBtn(`出陣 -> ${e.name}`, () => window.GameApp.manager.execAction('war', e.id));
        });

        createBtn("待機", () => window.GameApp.manager.execAction('wait'));
    }

    static hideControlPanel() {
        this.panelEl.classList.add('hidden');
    }

    /* Busho Modal */
    static showBushoList() {
        if (!this.currentCastle) return;
        this.bushoModal.classList.remove('hidden');
        this.bushoListContainer.innerHTML = '';
        
        const bushos = window.GameApp.manager.getCastleBushos(this.currentCastle.id);
        bushos.forEach(b => {
            const div = document.createElement('div');
            div.className = `busho-card ${b.isCastellan ? 'castellan' : ''}`;
            div.innerHTML = `
                <div>
                    <strong>${b.name}</strong> ${b.isCastellan ? '★城主' : ''}
                    <br>忠誠: ${b.loyalty}
                </div>
                <div class="busho-stats">
                    <span>武: ${b.strength}</span>
                    <span>政: ${b.politics}</span>
                    <span>智: ${b.intelligence}</span>
                </div>
            `;
            this.bushoListContainer.appendChild(div);
        });
    }

    static closeBushoModal() {
        this.bushoModal.classList.add('hidden');
    }

    /* War UI */
    static showWarModal(state) {
        this.warModal.classList.remove('hidden');
        this.warLog.innerHTML = '';
        this.updateWarModal(state);
    }

    static updateWarModal(state) {
        const { attacker, defender, atkBusho, defBusho, round } = state;
        
        this.warEls.atkName.textContent = attacker.name;
        this.warEls.atkSoldier.textContent = attacker.soldiers;
        this.warEls.atkBusho.textContent = atkBusho.name;
        
        this.warEls.defName.textContent = defender.name;
        this.warEls.defSoldier.textContent = defender.soldiers;
        this.warEls.defWall.textContent = defender.defense;
        this.warEls.defBusho.textContent = defBusho.name;
        
        this.warEls.round.textContent = round;
    }

    static logWar(msg) {
        const div = document.createElement('div');
        div.textContent = msg;
        this.warLog.prepend(div);
    }

    static enableWarButtons(enable) {
        if (enable) {
            this.warControls.classList.remove('disabled-area');
            this.warControls.classList.add('active-area');
        } else {
            this.warControls.classList.remove('active-area');
            this.warControls.classList.add('disabled-area');
        }
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
        this.manager.init();
    },
    nextTurn: function() { this.manager.nextTurn(); },
    saveGame: function() { this.manager.save(); },
    loadGame: function() { this.manager.load(); },
    showBushoList: function() { UIManager.showBushoList(); },
    closeBushoModal: function() { UIManager.closeBushoModal(); },
    execWarCmd: function(cmd) { this.manager.execWarCmd(cmd); }
};

window.onload = () => window.GameApp.start();