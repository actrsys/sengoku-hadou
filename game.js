/**
 * 戦略シミュレーションゲーム プロトタイプ
 * * 構造:
 * 1. Const: 定数管理
 * 2. Model: データクラス (Castle, Busho) - ロジックを持たない純粋なデータ
 * 3. Logic: ゲームルールと計算 (WarSystem, AISystem)
 * 4. Manager: ゲーム進行管理 (GameManager)
 * 5. View: 描画管理 (UIManager)
 */

/* --- 1. 定数管理 (Config) --- */
const GameConfig = {
    MaxCastles: 4,
    StartYear: 1560,
    StartMonth: 1,
    
    // 経済・内政係数
    IncomeGoldRatio: 0.5, // 商業 * 0.5
    ConsumeRiceRatio: 0.2, // 兵士 * 0.2
    ConsumeGoldPerBusho: 5, // 武将一人あたり
    RepairRatio: 2.0, // 内政 * 2.0
    
    // 戦闘係数
    War: {
        BaseDmg: 10,
        StatCoef: 0.5,
        SoldierCoef: 0.05,
        WinLoyalty: 3,
        LoseAtkLoyalty: -3,
        LoseDefLoyalty: -5,
        MaxRounds: 10
    }
};

const ActionType = {
    WAR: 'war',
    DEVELOP_FARM: 'farm',
    DEVELOP_COMMERCE: 'commerce',
    DRAFT: 'draft',
    TRADE: 'trade',
    MOVE: 'move',
    REPAIR: 'repair',
    WAIT: 'wait'
};

/* --- 2. データモデル (Model) --- */

class Busho {
    constructor(data) {
        this.id = data.id;
        this.name = data.name;
        this.strength = data.strength;   // 武力
        this.politics = data.politics;   // 内政
        this.intelligence = data.intelligence; // 智謀
        this.loyalty = data.loyalty;     // 忠誠
        this.clan = data.clan;           // 所属大名 (1 or 2)
        this.castleId = data.castleId;
        this.status = data.status || 'active'; // active, ronin
        this.isCastellan = data.isCastellan || false;
        this.fatigue = data.fatigue || 0;
    }

    get personality() {
        if (this.strength >= this.politics && this.strength >= this.intelligence) return 'aggressive'; // 攻撃志向
        if (this.politics >= this.strength && this.politics >= this.intelligence) return 'domestic';   // 内政志向
        return 'analyst'; // 分析志向
    }
}

class Castle {
    constructor(data) {
        this.id = data.id;
        this.name = data.name;
        this.ownerClan = data.ownerClan;
        this.castellanId = data.castellanId;
        this.samuraiIds = data.samuraiIds || []; // 所属武将IDリスト
        
        // Resources
        this.soldiers = data.soldiers;
        this.gold = data.gold;
        this.rice = data.rice;
        this.kokudaka = data.kokudaka;   // 石高
        this.commerce = data.commerce;   // 商業
        this.defense = data.defense;     // 防御度
        this.maxDefense = data.maxDefense || 100;
        
        this.isDone = false; // 月ごとの行動済みフラグ
    }
}

/* --- 3. ロジックシステム (Logic) --- */

class WarSystem {
    // 戦闘処理: 結果オブジェクトを返す
    static resolveWar(attacker, defender, atkBusho, defBusho) {
        let log = [];
        let rounds = 0;
        let atkSoldiers = attacker.soldiers;
        let defSoldiers = defender.soldiers;
        let castleDef = defender.defense;
        
        // 簡易シミュレーション (要件の係数計算を実装)
        while(rounds < GameConfig.War.MaxRounds) {
            rounds++;
            
            // 攻撃側のダメージ計算
            // damage = (能力 * A) + (兵士 * B) + Random
            let atkDmg = (atkBusho.strength * GameConfig.War.StatCoef) + 
                         (atkSoldiers * GameConfig.War.SoldierCoef) + 
                         (Math.random() * 10);
            
            // 防御側のダメージ計算
            let defDmg = (defBusho.strength * GameConfig.War.StatCoef) + 
                         (defSoldiers * GameConfig.War.SoldierCoef) + 
                         (Math.random() * 10);

            // ダメージ適用 (攻撃側は城防御か兵士かAIで選ぶべきだが、ここでは簡易化のため分散)
            // 攻撃側 -> 防御側の兵士と城壁を削る
            defSoldiers -= Math.floor(atkDmg * 0.7);
            castleDef -= Math.floor(atkDmg * 0.3);

            // 防御側 -> 攻撃側の兵士を削る
            atkSoldiers -= Math.floor(defDmg);

            log.push(`R${rounds}: 攻兵${Math.floor(atkSoldiers)} vs 防兵${Math.floor(defSoldiers)}(城${Math.floor(castleDef)})`);

            // 終了判定
            if (castleDef <= 0 || defSoldiers <= 0) {
                return { winner: 'attacker', log, remainingAtk: Math.max(0, atkSoldiers), remainingDef: 0, castleDef: 0 };
            }
            if (atkSoldiers <= 0) {
                return { winner: 'defender', log, remainingAtk: 0, remainingDef: Math.max(0, defSoldiers), castleDef: Math.max(0, castleDef) };
            }
        }

        // 決着つかずは攻撃側敗北
        return { winner: 'defender', log, remainingAtk: atkSoldiers, remainingDef: defSoldiers, castleDef: castleDef, timeOver: true };
    }
}

class AISystem {
    static decideAction(castle, bushoList, enemyCastles) {
        const castellan = bushoList.find(b => b.id === castle.castellanId);
        if (!castellan) return { type: ActionType.WAIT };

        // 1. 戦争判断スコア
        // (城主武力 * 係数) - (敵兵士差 * 係数) - (米不足ペナルティ)
        // 簡易実装として、隣接する敵城の中で最も勝率が高いものを探す
        let bestTarget = null;
        let bestScore = -9999;

        enemyCastles.forEach(enemy => {
            const soldierDiff = castle.soldiers - enemy.soldiers;
            let score = (castellan.strength * 1.5) + (soldierDiff * 0.1);
            if (castle.rice < castle.soldiers * 0.5) score -= 50; // 米不足懸念

            if (score > bestScore) {
                bestScore = score;
                bestTarget = enemy;
            }
        });

        // 攻撃実行閾値
        if (bestScore > 50 && bestTarget) {
            return { type: ActionType.WAR, targetId: bestTarget.id };
        }

        // 2. 内政判断
        // 性格や資源状況で決定
        if (castellan.personality === 'domestic') {
            if (castle.gold < 100) return { type: ActionType.DEVELOP_COMMERCE };
            return { type: ActionType.DEVELOP_FARM };
        }
        
        // 3. 徴兵判断 (武力重視)
        if (castellan.personality === 'aggressive') {
            if (castle.gold > 50 && castle.rice > 100) {
                return { type: ActionType.DRAFT };
            }
        }

        // デフォルト: お金があれば内政
        if (castle.gold > 30) return { type: ActionType.DEVELOP_COMMERCE };
        return { type: ActionType.WAIT };
    }
}

/* --- 4. ゲーム管理 (Manager) --- */

class GameManager {
    constructor() {
        this.year = GameConfig.StartYear;
        this.month = GameConfig.StartMonth;
        this.castles = [];
        this.bushos = [];
        this.turnQueue = []; // 今月の行動順
        this.currentActorIndex = -1;
        
        this.initData();
    }

    initData() {
        // 初期データ生成（本来はJSONからLoad）
        // 4つの城
        this.castles = [
            new Castle({ id: 1, name: "春日山城", ownerClan: 1, castellanId: 101, samuraiIds:[101,102], soldiers: 1000, gold: 500, rice: 2000, kokudaka: 100, commerce: 80, defense: 100 }),
            new Castle({ id: 2, name: "海津城", ownerClan: 1, castellanId: 103, samuraiIds:[103], soldiers: 800, gold: 300, rice: 1500, kokudaka: 80, commerce: 60, defense: 80 }),
            new Castle({ id: 3, name: "甲府城", ownerClan: 2, castellanId: 201, samuraiIds:[201,202], soldiers: 1200, gold: 600, rice: 2200, kokudaka: 120, commerce: 90, defense: 110 }),
            new Castle({ id: 4, name: "小田原城", ownerClan: 2, castellanId: 203, samuraiIds:[203], soldiers: 1500, gold: 800, rice: 3000, kokudaka: 150, commerce: 100, defense: 150 })
        ];

        // 武将データ (一部)
        this.bushos = [
            // Clan 1 (上杉系)
            new Busho({ id: 101, name: "上杉謙信", strength: 100, politics: 60, intelligence: 90, loyalty: 100, clan: 1, castleId: 1, isCastellan: true }),
            new Busho({ id: 102, name: "柿崎景家", strength: 85, politics: 40, intelligence: 50, loyalty: 90, clan: 1, castleId: 1 }),
            new Busho({ id: 103, name: "直江景綱", strength: 50, politics: 85, intelligence: 80, loyalty: 95, clan: 1, castleId: 2, isCastellan: true }),
            // Clan 2 (武田/北条系)
            new Busho({ id: 201, name: "武田信玄", strength: 90, politics: 95, intelligence: 95, loyalty: 100, clan: 2, castleId: 3, isCastellan: true }),
            new Busho({ id: 202, name: "山県昌景", strength: 88, politics: 60, intelligence: 70, loyalty: 90, clan: 2, castleId: 3 }),
            new Busho({ id: 203, name: "北条氏康", strength: 85, politics: 90, intelligence: 85, loyalty: 100, clan: 2, castleId: 4, isCastellan: true }),
        ];

        this.startMonth();
    }

    // 月初処理
    startMonth() {
        // 1. 順番決め (ランダム)
        this.turnQueue = [...this.castles].sort(() => Math.random() - 0.5);
        this.currentActorIndex = 0;
        
        UIManager.log(`=== ${this.year}年 ${this.month}月 開始 ===`);

        // 2. 収入・支出計算
        this.castles.forEach(c => {
            // 収入
            c.gold += Math.floor(c.commerce * GameConfig.IncomeGoldRatio);
            if (this.month === 3) c.gold += 100; // 3月ボーナス
            if (this.month === 9) c.rice += c.kokudaka * 10; // 9月米収入

            // 支出
            c.rice -= Math.floor(c.soldiers * GameConfig.ConsumeRiceRatio);
            const bushoCount = c.samuraiIds.length;
            c.gold -= bushoCount * GameConfig.ConsumeGoldPerBusho;

            // 月末の枯渇処理は本来月末だが、便宜上ここで計算してもよい（要件では月末）
            // 実装簡略化のため、月末処理ロジックはターン終了時にチェックする
        });

        // 武将疲労回復
        this.bushos.forEach(b => b.fatigue = 0);

        UIManager.renderMap();
        this.checkCurrentTurn();
    }

    // 次の行動へ
    nextTurn() {
        if (this.currentActorIndex >= this.turnQueue.length) {
            // 月終了
            this.endMonth();
            return;
        }

        const currentCastle = this.turnQueue[this.currentActorIndex];
        
        // 既に滅亡している、あるいは行動済みの場合はスキップ
        if (currentCastle.ownerClan === 0 || currentCastle.isDone) {
            this.currentActorIndex++;
            this.nextTurn();
            return;
        }

        UIManager.highlightCastle(currentCastle.id);

        // プレイヤーのターンかAIか (ここではClan 1をプレイヤーと仮定、または全AI)
        // 仮：Clan 1は手動、Clan 2はAI
        if (currentCastle.ownerClan === 1) {
            UIManager.log(`${currentCastle.name} (自軍) の手番です。`);
            UIManager.showActions(currentCastle);
        } else {
            UIManager.log(`${currentCastle.name} (敵軍) の手番...`);
            setTimeout(() => this.executeAI(currentCastle), 800);
        }
    }

    executeAI(castle) {
        // 敵対城リスト作成
        const enemies = this.castles.filter(c => c.ownerClan !== castle.ownerClan && c.ownerClan !== 0);
        const action = AISystem.decideAction(castle, this.bushos, enemies);
        
        this.processAction(castle, action);
        this.currentActorIndex++;
        // 自動で次へは進まない（プレイヤーが「次へ」を押すか、自動進行させるか。ここでは手動送りとする）
        UIManager.renderMap();
    }

    // 行動実行
    processAction(castle, action) {
        let msg = "";
        switch(action.type) {
            case ActionType.WAR:
                const target = this.castles.find(c => c.id === action.targetId);
                this.executeWar(castle, target);
                break;
            case ActionType.DEVELOP_COMMERCE:
                castle.commerce += 5;
                castle.gold -= 50;
                msg = `${castle.name}が商業を開発しました。(+5)`;
                break;
            case ActionType.DEVELOP_FARM:
                castle.kokudaka += 5;
                castle.gold -= 50;
                msg = `${castle.name}が石高を開発しました。(+5)`;
                break;
            case ActionType.DRAFT:
                castle.soldiers += 100;
                castle.gold -= 50;
                castle.rice -= 50;
                msg = `${castle.name}が徴兵を行いました。(+100)`;
                break;
            default:
                msg = `${castle.name}は様子を見ています。`;
        }
        
        if (msg) UIManager.log(msg);
        castle.isDone = true;
        UIManager.renderMap();
        UIManager.hideActions();
    }

    executeWar(attacker, defender) {
        UIManager.log(`★ 戦争勃発！ ${attacker.name} -> ${defender.name}`);
        
        const atkBusho = this.bushos.find(b => b.id === attacker.castellanId);
        const defBusho = this.bushos.find(b => b.id === defender.castellanId);

        const result = WarSystem.resolveWar(attacker, defender, atkBusho, defBusho);
        
        // 結果適用
        attacker.soldiers = result.remainingAtk;
        defender.soldiers = result.remainingDef;
        defender.defense = result.castleDef;

        result.log.forEach(l => UIManager.log(l));

        if (result.winner === 'attacker') {
            UIManager.log(`勝者: ${attacker.name}！ ${defender.name}を制圧しました！`);
            // 所有権移動
            defender.ownerClan = attacker.ownerClan;
            // 忠誠変動処理
            atkBusho.loyalty += GameConfig.War.WinLoyalty;
        } else {
            UIManager.log(`勝者: ${defender.name}！ 攻撃を退けました。`);
            atkBusho.loyalty += GameConfig.War.LoseAtkLoyalty;
            defBusho.loyalty += GameConfig.War.LoseDefLoyalty; // 防御側敗北ではないが、被害甚大なら下げる等のロジック要
        }
    }

    endMonth() {
        // 月末処理
        this.castles.forEach(c => {
            c.isDone = false;
            // 資源枯渇チェック
            if (c.rice < 0) {
                c.soldiers = Math.max(0, c.soldiers - 100);
                UIManager.log(`${c.name}: 米不足で逃亡兵発生`);
                c.rice = 0;
            }
        });

        this.month++;
        if (this.month > 12) {
            this.month = 1;
            this.year++;
        }
        
        this.checkGameOver();
        this.startMonth();
    }

    checkCurrentTurn() {
        // 最初のターンの処理を開始するために呼ぶ
        // 自動進行にしないため、ここはUI更新のみ
    }

    checkGameOver() {
        const clans = new Set(this.castles.map(c => c.ownerClan));
        if (clans.size === 1) {
            alert(`天下統一！ ゲーム終了です。`);
        }
    }
}

/* --- 5. UI管理 (View) --- */

class UIManager {
    static init() {
        this.mapEl = document.getElementById('map-container');
        this.logEl = document.getElementById('log-content');
        this.dateEl = document.getElementById('date-display');
        this.panelEl = document.getElementById('control-panel');
        this.actionsEl = document.getElementById('action-buttons');
    }

    static log(msg) {
        const p = document.createElement('div');
        p.textContent = msg;
        this.logEl.prepend(p);
    }

    static renderMap() {
        this.mapEl.innerHTML = '';
        this.dateEl.textContent = `${GameApp.game.year}年 ${GameApp.game.month}月`;

        GameApp.game.castles.forEach(c => {
            const el = document.createElement('div');
            el.className = 'castle-card';
            el.dataset.clan = c.ownerClan;
            if (GameApp.game.turnQueue[GameApp.game.currentActorIndex] === c) {
                el.classList.add('active-turn');
            }

            // 城主名取得
            const castellan = GameApp.game.bushos.find(b => b.id === c.castellanId);
            const castellanName = castellan ? castellan.name : "空席";

            el.innerHTML = `
                <h3>${c.name}</h3>
                <div class="stat-row"><span>支配:</span> <strong>${c.ownerClan === 1 ? '上杉軍' : '武田軍'}</strong></div>
                <div class="stat-row"><span>城主:</span> ${castellanName}</div>
                <hr>
                <div class="stat-row"><span>兵士:</span> ${c.soldiers}</div>
                <div class="stat-row"><span>金:</span> ${c.gold}</div>
                <div class="stat-row"><span>米:</span> ${c.rice}</div>
                <div class="stat-row"><span>防御:</span> ${c.defense}</div>
            `;
            this.mapEl.appendChild(el);
        });
    }

    static highlightCastle(id) {
        this.renderMap(); // 再描画でactiveクラスをつける
    }

    static showActions(castle) {
        this.panelEl.classList.remove('hidden');
        document.getElementById('panel-title').textContent = castle.name + " 行動選択";
        document.getElementById('panel-stats').textContent = `金: ${castle.gold} / 米: ${castle.rice}`;
        
        this.actionsEl.innerHTML = '';
        
        // ボタン生成ヘルパー
        const createBtn = (label, actionType, targetId = null) => {
            const btn = document.createElement('button');
            btn.textContent = label;
            btn.onclick = () => {
                GameApp.game.processAction(castle, { type: actionType, targetId: targetId });
            };
            this.actionsEl.appendChild(btn);
        };

        // 内政ボタン
        createBtn("商業開発 (金50)", ActionType.DEVELOP_COMMERCE);
        createBtn("石高開発 (金50)", ActionType.DEVELOP_FARM);
        createBtn("徴兵 (金50/米50)", ActionType.DRAFT);
        
        // 戦争ボタン（隣接敵のみ等の判定が必要だが、ここでは全敵表示）
        const enemies = GameApp.game.castles.filter(c => c.ownerClan !== castle.ownerClan);
        enemies.forEach(e => {
            createBtn(`出陣 -> ${e.name}`, ActionType.WAR, e.id);
        });

        createBtn("待機", ActionType.WAIT);
    }

    static hideActions() {
        this.panelEl.classList.add('hidden');
    }
}

/* --- Main Entry Point --- */

const GameApp = {
    game: null,
    
    start: function() {
        UIManager.init();
        this.game = new GameManager();
        UIManager.renderMap();
        UIManager.log("ゲーム開始。プロトタイプ起動完了。");
    },

    nextTurn: function() {
        if (this.game) this.game.nextTurn();
    },

    saveGame: function() {
        const json = JSON.stringify(this.game);
        localStorage.setItem('sengoku_save', json);
        alert('保存しました');
    },

    loadGame: function() {
        const json = localStorage.getItem('sengoku_save');
        if (json) {
            // クラスインスタンスへの復元が必要（簡易実装ではObject.assign等を使う）
            // プロトタイプのためリロードを推奨
            alert('ロード機能は完全実装されていません。ページをリロードしてください。');
        }
    }
};

// 起動
window.onload = () => GameApp.start();
