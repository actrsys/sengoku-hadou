/**
 * 戦国シミュレーションゲーム - 乱数・変動幅 カスタマイズ版
 * * 【カスタマイズガイド】
 * 数値を固定ではなく「ランダムに変動」させたい場合は、各項目の `Fluctuation` (変動率) を調整してください。
 * 例: 0.0 = 変動なし (常に固定)
 * 0.2 = ±20% の範囲でランダム変動 (100なら 80〜120 の間になる)
 * 0.5 = ±50% の範囲でランダム変動
 */

/* ==========================================================================
   ★ シナリオ定義 (これが不足していたため追加しました)
   ========================================================================== */
const SCENARIOS = [
    { name: "群雄割拠 (1560年)", desc: "各地で有力大名が覇を競う標準シナリオ。", folder: "default" }
];

/* ==========================================================================
   ★ ゲームバランス設定 (ここを編集して調整してください)
   ========================================================================== */
const GAME_SETTINGS = {
    // --- 基本設定 ---
    StartYear: 1560,
    StartMonth: 1,
    
    // --- 内政・経済バランス ---
    Economy: {
        IncomeGoldRate: 0.5,        // [収入] 商業値に対する金収入の倍率
        IncomeRiceRate: 10.0,       // [収入] 石高に対する兵糧収入の倍率
        
        // ★ ランダム変動設定 (0.1 = ±10%)
        IncomeFluctuation: 0.15,    // 毎月の収入額のブレ幅
        
        ConsumeRicePerSoldier: 0.05,// [消費] 兵士1人あたりの毎月の兵糧消費量
        ConsumeGoldPerBusho: 50,    // [消費] 武将1人あたりの毎月の金俸禄
        
        // 開発コマンド
        BaseDevelopment: 10,        // 開発の基礎値
        PoliticsEffect: 0.6,        // 政治力の影響係数
        DevelopFluctuation: 0.15,   // 開発結果のブレ幅 (同じ能力でも結果が変わる)
        
        // 修復コマンド
        BaseRepair: 20,             // [修復] 最低限上がる防御度
        RepairEffect: 0.6,          // [修復] 「政治」能力の影響度
        RepairFluctuation: 0.15,    // 修復結果のブレ幅
        
        // 施しコマンド
        BaseCharity: 10,            // [施し] 最低限上がる民忠
        CharmEffect: 0.4,           // [施し] 「魅力」能力の影響度
        CharityFluctuation: 0.15,   // 施し結果のブレ幅
        
        // 相場
        TradeRateMin: 0.5,          // 米相場の最小値 (米1 = 金0.5)
        TradeRateMax: 3.0,          // 米相場の最大値 (米1 = 金3.0
        TradeFluctuation: 0.15      // 相場の変動幅
    },

    // --- 軍事バランス ---
    Military: {
        // 徴兵
        DraftBase:  50,             // 最低限集まる兵数
        DraftStatBonus: 1.5,        // 能力ボーナス倍率
        DraftPopRatio: 0.05,        // 人口の何割まで徴兵できるか
        DraftFluctuation: 0.15,     // 徴兵数のブレ幅 (0.2 = ±20%
        
        // 訓練・士気
        BaseTraining: 0,            // [訓練] 最低上昇値
        TrainingLdrEffect: 0.3,     // [訓練] 「統率」の影響度
        TrainingStrEffect: 0.2,     // [訓練] 「武力」の影響度
        TrainingFluctuation: 0.15,  // 訓練上昇値のブレ幅
        
        BaseMorale: 0,              // [士気] 最低上昇値（兵施し）
        MoraleFluctuation: 0.2,     // 士気上昇値のブレ幅
        
        // 戦争・ダメージ計算
        WarMaxRounds: 10,           // 戦争の最大ラウンド数 (これを超えると引き分け)
        DamageSoldierPower: 0.05,   // 兵数が攻撃力に与える影響 (大きいほど「数こそ力」になる)
        WallDefenseEffect: 0.5,     // 城の防御度が守備力に与える影響 (大きいほど城が硬くなる)
        
        // ★ 戦闘ダメージのランダム性
        DamageFluctuation: 0.2,     // ダメージ計算時の最終的な乱数幅 (0.2 = ±20%)
        
        UnitTypeBonus: {
            BowAttack: 0.6,         // 弓攻撃の攻撃力倍率 (低めだが反撃を受けにくい設定に使用)
            SiegeAttack: 1.0,       // 城攻めの攻撃力倍率
            ChargeAttack: 1.2,      // 力攻め(突撃)の攻撃力倍率
            WallDamageRate: 0.5     // 城攻め時の城壁破壊倍率 (大きいほど城壁が壊れやすい)
        }
    },

    // --- 謀略・外交 ---
    Strategy: {
        InvestigateDifficulty: 50,  // [調査] 基本難易度 (高いほど成功しにくい)
        InciteFactor: 150,          // [扇動] 成功率の分母 (数値を大きくすると成功しにくくなる)
        RumorFactor: 50,            // [流言] 成功率計算時の相手の忠誠ボーナス (大きいほど忠誠が高い相手に効きにくい)
        SchemeSuccessRate: 0.6,     // [合戦中の謀略] 基本成功率係数
        EmploymentDiff: 1.5         // [登用] 難易度係数 (大きいほど登用しにくい)
    },

    // --- AI ---
    AI: {
        Aggressiveness: 1.5,        // 攻撃判断の閾値 (小さいほど好戦的、大きいほど慎重)
                                    // 1.0なら「自軍と敵軍が同数」でも攻める。1.5なら「1.5倍の差」が必要。
        SoliderSendRate: 0.8,       // 出陣時に城に残す兵の割合に関与 (1.0に近いほど全軍で攻めてくる)
        PoliticsCheck: 60,          // 内政をバランスよく行うための知略ボーダーライン
        IntelligenceWar: 70         // 戦争時に賢い用兵（兵数計算）を行う知略ボーダーライン
    }
};

/* ==========================================================================
   これより下はゲームエンジン本体です
   ========================================================================== */

/* --- Data Manager --- */
class DataManager {
    static async loadAll(folderName) {
        const path = `./data/${folderName}/`;
        try {
            const [clansText, castlesText, bushosText] = await Promise.all([
                this.fetchText(path + "clans.csv"),
                this.fetchText(path + "castles.csv"),
                this.fetchText(path + "warriors.csv")
            ]);
            const clans = this.parseCSV(clansText, Clan);
            const castles = this.parseCSV(castlesText, Castle);
            const bushos = this.parseCSV(bushosText, Busho);
            this.joinData(clans, castles, bushos);
            if (true) this.generateGenericBushos(bushos, castles, clans);
            return { clans, castles, bushos };
        } catch (error) {
            console.error("データ読み込みエラー:", error);
            throw new Error(`データの読み込みに失敗しました (${path})。`);
        }
    }
    static async fetchText(url) {
        const response = await fetch(url);
        if (!response.ok) throw new Error(`Failed to load ${url}`);
        return await response.text();
    }
    static joinData(clans, castles, bushos) {
        castles.forEach(c => c.samuraiIds = []);
        bushos.forEach(b => {
            const clan = clans.find(cl => cl.leaderId === b.id);
            if (clan) b.isDaimyo = true;
            const castleAsCastellan = castles.find(cs => cs.castellanId === b.id);
            if (castleAsCastellan) b.isCastellan = true;
            if (b.clan === 0) {
                b.status = 'ronin';
                const c = castles.find(castle => castle.id === b.castleId);
                if(c) c.samuraiIds.push(b.id);
            } else {
                const c = castles.find(castle => castle.id === b.castleId);
                if(c) c.samuraiIds.push(b.id);
            }
        });
    }
    static parseCSV(text, ModelClass) {
        const lines = text.split('\n').map(l => l.trim()).filter(l => l);
        if (lines.length === 0) return [];
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
    static generateGenericBushos(bushos, castles, clans) {
        let idCounter = 90000;
        const personalities = ['aggressive', 'cautious', 'balanced'];
        clans.forEach(clan => {
            const clanCastles = castles.filter(c => c.ownerClan === clan.id);
            if(clanCastles.length === 0) return;
            for(let i=0; i<3; i++) {
                const castle = clanCastles[Math.floor(Math.random() * clanCastles.length)];
                const p = personalities[Math.floor(Math.random() * personalities.length)];
                bushos.push(new Busho({
                    id: idCounter++, name: `武将${String.fromCharCode(65+i)}`, 
                    strength: 30+Math.floor(Math.random()*40), leadership: 30+Math.floor(Math.random()*40), 
                    politics: 30+Math.floor(Math.random()*40), diplomacy: 30+Math.floor(Math.random()*40), 
                    intelligence: 30+Math.floor(Math.random()*40), charm: 30+Math.floor(Math.random()*40), 
                    loyalty: 80, clan: clan.id, castleId: castle.id, isCastellan: false, 
                    personality: p, ambition: 30+Math.floor(Math.random()*40), affinity: Math.floor(Math.random()*100)
                }));
                castle.samuraiIds.push(idCounter-1);
            }
        });
        for(let i=0; i<5; i++) {
            const castle = castles[Math.floor(Math.random() * castles.length)];
            const p = personalities[Math.floor(Math.random() * personalities.length)];
            bushos.push(new Busho({
                id: idCounter++, name: `浪人${String.fromCharCode(65+i)}`, 
                strength: 40+Math.floor(Math.random()*40), leadership: 40+Math.floor(Math.random()*40), 
                politics: 40+Math.floor(Math.random()*40), diplomacy: 40+Math.floor(Math.random()*40), 
                intelligence: 40+Math.floor(Math.random()*40), charm: 40+Math.floor(Math.random()*40), 
                loyalty: 0, clan: 0, castleId: castle.id, isCastellan: false, 
                personality: p, status: 'ronin', ambition: 50+Math.floor(Math.random()*40), affinity: Math.floor(Math.random()*100)
            }));
            castle.samuraiIds.push(idCounter-1);
        }
    }
}

/* --- Models --- */
class Clan { constructor(data) { Object.assign(this, data); } }
class Busho {
    constructor(data) {
        Object.assign(this, data);
        this.fatigue = 0; this.isActionDone = false;
        if(!this.personality) {
            if (this.strength > this.intelligence + 20) this.personality = 'aggressive';
            else if (this.intelligence > this.strength + 20) this.personality = 'cautious';
            else this.personality = 'balanced';
        }
        if(this.charm === undefined) this.charm = 50; if(this.diplomacy === undefined) this.diplomacy = 50;
        if(this.ambition === undefined) this.ambition = 50; if(this.affinity === undefined) this.affinity = 50;
        if(this.leadership === undefined) this.leadership = this.strength;
        this.isDaimyo = false; this.isGunshi = false; this.isCastellan = false;
        if(this.clan === 0 && !this.status) this.status = 'ronin';
    }
    getRankName() { if(this.isDaimyo) return "大名"; if(this.clan === 0) return "在野"; if(this.isGunshi) return "軍師"; if(this.isCastellan) return "城主"; return "一般"; }
}
class Castle {
    constructor(data) {
        Object.assign(this, data); this.samuraiIds = this.samuraiIds || [];
        this.maxDefense = (data.defense || 500) * 2; this.maxKokudaka = (data.kokudaka || 500) * 2; this.maxCommerce = (data.commerce || 500) * 2;
        this.maxLoyalty = 1000; this.isDone = false;
        if(this.loyalty === undefined) this.loyalty = 500; if(this.population === undefined) this.population = 10000;
        if(this.training === undefined) this.training = 50; if(this.morale === undefined) this.morale = 50;
        this.investigatedUntil = 0;
    }
}

/* --- Logic (乱数処理を追加) --- */
class GameSystem {
    static seededRandom(seed) { let x = Math.sin(seed++) * 10000; return x - Math.floor(x); }
    
    // ★ 新機能: 基準値にブレ幅(±fluctuation%)を適用して返す便利関数
    // 例: val=100, fluctuation=0.2 の場合、80〜120の値をランダムに返す
    static applyVariance(val, fluctuation) {
        if (!fluctuation || fluctuation === 0) return Math.floor(val);
        const min = 1.0 - fluctuation;
        const max = 1.0 + fluctuation;
        const rate = min + Math.random() * (max - min);
        return Math.floor(val * rate);
    }

    // 開発値計算
    static calcDevelopment(busho) { 
        const base = GAME_SETTINGS.Economy.BaseDevelopment + (busho.politics * GAME_SETTINGS.Economy.PoliticsEffect); 
        return this.applyVariance(base, GAME_SETTINGS.Economy.DevelopFluctuation);
    }
    
    // 修復値計算
    static calcRepair(busho) { 
        const base = GAME_SETTINGS.Economy.BaseRepair + (busho.politics * GAME_SETTINGS.Economy.RepairEffect); 
        return this.applyVariance(base, GAME_SETTINGS.Economy.RepairFluctuation);
    }
    
    // 施し計算
    static calcCharity(busho, type) { 
        let val = GAME_SETTINGS.Economy.BaseCharity + (busho.charm * GAME_SETTINGS.Economy.CharmEffect); 
        if (type === 'both') val = val * 1.5; 
        return this.applyVariance(val, GAME_SETTINGS.Economy.CharityFluctuation); 
    }
    
    // 訓練度計算
    static calcTraining(busho) { 
        const base = GAME_SETTINGS.Military.BaseTraining + (busho.leadership * GAME_SETTINGS.Military.TrainingLdrEffect + busho.strength * GAME_SETTINGS.Military.TrainingStrEffect); 
        return this.applyVariance(base, GAME_SETTINGS.Military.TrainingFluctuation);
    }
    
    // 士気計算
    static calcSoldierCharity(busho) { 
        const base = GAME_SETTINGS.Military.BaseMorale + (busho.leadership * 0.2 + busho.charm * 0.1); 
        return this.applyVariance(base, GAME_SETTINGS.Military.MoraleFluctuation);
    }
    
    // 徴兵数計算
    static calcDraftFromGold(gold, busho) { 
        const bonus = 1.0 + ((busho.leadership + busho.strength + busho.charm) / 300) * (GAME_SETTINGS.Military.DraftStatBonus - 1.0); 
        return Math.floor(gold * 1.0 * bonus); 
    }
    
    // 徴兵限界計算 (★ここで乱数を大きく適用しています)
    static calcDraftLimit(castle) { 
        const loyaltyFactor = castle.loyalty / 1000; 
        const popLimit = castle.population * GAME_SETTINGS.Military.DraftPopRatio * loyaltyFactor;
        
        // 設定された最低値をベースに乱数を適用
        const baseLimit = this.applyVariance(GAME_SETTINGS.Military.DraftBase, GAME_SETTINGS.Military.DraftFluctuation);
        
        return Math.max(baseLimit, Math.floor(popLimit)); 
    }
    
    static isAdjacent(c1, c2) { return (Math.abs(c1.x - c2.x) + Math.abs(c1.y - c2.y)) === 1; }
    
    static calcWeightedAvg(currVal, currNum, newVal, newNum) { 
        if(currNum + newNum === 0) return currVal; 
        return Math.floor(((currVal * currNum) + (newVal * newNum)) / (currNum + newNum)); 
    }
    
    static calcUnitStats(bushos) { 
        if (!bushos || bushos.length === 0) return { ldr:30, str:30, int:30, charm:30 }; 
        const sorted = [...bushos].sort((a,b) => b.leadership - a.leadership); 
        const leader = sorted[0]; 
        const subs = sorted.slice(1); 
        let totalLdr = leader.leadership; 
        let totalStr = leader.strength; 
        let totalInt = leader.intelligence; 
        subs.forEach(b => { 
            totalLdr += b.leadership * 0.2; 
            totalStr += b.strength * 0.2; 
            totalInt += b.intelligence * 0.2; 
        }); 
        return { ldr: Math.floor(totalLdr), str: Math.floor(totalStr), int: Math.floor(totalInt), charm: leader.charm }; 
    }
    
    static calcWarDamage(atkStats, defStats, atkSoldiers, defSoldiers, defWall, atkMorale, defTraining, type) {
        // 設定値から乱数を取得 (DamageFluctuation を使用)
        const fluctuation = GAME_SETTINGS.Military.DamageFluctuation || 0.2;
        const rand = 1.0 - fluctuation + (Math.random() * fluctuation * 2);

        const moraleBonus = (atkMorale - 50) / 100; const trainingBonus = (defTraining - 50) / 100;
        
        const atkPower = ((atkStats.ldr * 1.2) + (atkStats.str * 0.3) + (atkSoldiers * GAME_SETTINGS.Military.DamageSoldierPower)) * (1.0 + moraleBonus);
        const defPower = ((defStats.ldr * 1.0) + (defStats.int * 0.5) + (defWall * GAME_SETTINGS.Military.WallDefenseEffect) + (defSoldiers * GAME_SETTINGS.Military.DamageSoldierPower)) * (1.0 + trainingBonus);
        
        let multiplier = 1.0, soldierRate = 1.0, wallRate = 0.0, counterRisk = 1.0;
        const UB = GAME_SETTINGS.Military.UnitTypeBonus;
        
        switch(type) {
            case 'bow': multiplier = UB.BowAttack; wallRate = 0.0; counterRisk = 0.5; break;
            case 'siege': multiplier = UB.SiegeAttack; soldierRate = 0.05; wallRate = UB.WallDamageRate; counterRisk = 1.0; break;
            case 'charge': multiplier = UB.ChargeAttack; soldierRate = 1.0; wallRate = 0.5; counterRisk = 1.5; break;
            case 'def_bow': multiplier = 0.5; wallRate = 0.0; break;
            case 'def_attack': multiplier = 1.0; wallRate = 0.0; break;
            case 'def_charge': multiplier = 1.5; wallRate = 0.0; break;
        }
        
        const ratio = atkPower / (atkPower + defPower);
        let baseDmg = atkPower * ratio * multiplier * rand; 
        baseDmg = Math.max(50, baseDmg);
        
        return { 
            soldierDmg: Math.floor(baseDmg * soldierRate), 
            wallDmg: Math.floor(baseDmg * wallRate * 0.5), 
            risk: counterRisk 
        };
    }
    
    static calcInvestigateSuccess(busho, targetCastle) { 
        const difficulty = 30 + Math.random() * GAME_SETTINGS.Strategy.InvestigateDifficulty; 
        return busho.strength > difficulty; 
    }
    
    static calcIncite(busho) { 
        const score = (busho.intelligence * 0.7) + (busho.strength * 0.3); 
        const success = Math.random() < (score / GAME_SETTINGS.Strategy.InciteFactor); 
        if(!success) return { success: false, val: 0 }; 
        return { success: true, val: Math.floor(score * 2) }; 
    }
    
    static calcRumor(busho, targetBusho) { 
        const score = (busho.intelligence * 0.7) + (busho.strength * 0.3); 
        const defScore = (targetBusho.intelligence * 0.5) + (targetBusho.loyalty * 0.5); 
        const success = Math.random() < (score / (defScore + GAME_SETTINGS.Strategy.RumorFactor)); 
        if(!success) return { success: false, val: 0 }; 
        return { success: true, val: Math.floor(20 + Math.random()*20) }; 
    }
    
    static calcScheme(atkBusho, defBusho, defCastleLoyalty) { 
        const atkInt = atkBusho.intelligence; 
        const defInt = defBusho ? defBusho.intelligence : 30; 
        const successRate = (atkInt / (defInt + 20)) * GAME_SETTINGS.Strategy.SchemeSuccessRate; 
        if (Math.random() > successRate) return { success: false, damage: 0 }; 
        const loyaltyBonus = (1000 - defCastleLoyalty) / 500; 
        return { success: true, damage: Math.floor(atkInt * 10 * (1.0 + loyaltyBonus)) }; 
    }
    
    static calcFire(atkBusho, defBusho) { 
        const atkInt = atkBusho.intelligence; 
        const defInt = defBusho ? defBusho.intelligence : 30; 
        const successRate = (atkInt / (defInt + 10)) * 0.5; 
        if (Math.random() > successRate) return { success: false, damage: 0 }; 
        return { success: true, damage: Math.floor(atkInt * 5 * (Math.random() + 0.5)) }; 
    }
    
    static getRetreatCastle(currentCastle, castles) { return castles.find(c => c.id !== currentCastle.id && c.ownerClan === currentCastle.ownerClan && this.isAdjacent(currentCastle, c)); }
    static calcAffinityDiff(a, b) { const diff = Math.abs(a - b); return Math.min(diff, 100 - diff); }
    
    static calcEmploymentSuccess(recruiter, target, recruiterClanPower, targetClanPower) { 
        if (target.clan !== 0 && target.ambition > 70 && recruiterClanPower < targetClanPower * 0.7) return false; 
        const affDiff = this.calcAffinityDiff(recruiter.affinity, target.affinity); 
        let affBonus = (affDiff < 10) ? 30 : (affDiff < 25) ? 15 : (affDiff > 40) ? -10 : 0; 
        const resistance = target.clan === 0 ? target.ambition : target.loyalty * GAME_SETTINGS.Strategy.EmploymentDiff; 
        return ((recruiter.charm + affBonus) * (Math.random() + 0.5)) > resistance; 
    }
    
    static getGunshiAdvice(gunshi, action, seed) { const luck = this.seededRandom(seed); const errorMargin = (100 - gunshi.intelligence) / 200; const perceivedLuck = Math.min(1.0, Math.max(0.0, luck + (this.seededRandom(seed+1)-0.5)*errorMargin*2)); if (perceivedLuck > 0.8) return "必ずや成功するでしょう。好機です！"; if (perceivedLuck > 0.6) return "おそらく上手くいくでしょう。"; if (perceivedLuck > 0.4) return "五分五分といったところです。油断めさるな。"; if (perceivedLuck > 0.2) return "厳しい結果になるかもしれません。"; return "おやめください。失敗する未来が見えます。"; }
}

/* --- UI Manager --- */
class UIManager {
    constructor(game) {
        this.game = game; this.currentCastle = null; this.menuState = 'MAIN';
        
        this.mapEl = document.getElementById('map-container'); this.panelEl = document.getElementById('control-panel');
        this.statusContainer = document.getElementById('status-container'); this.cmdArea = document.getElementById('command-area');
        this.logEl = document.getElementById('log-content'); this.selectorModal = document.getElementById('selector-modal');
        this.selectorList = document.getElementById('selector-list'); this.selectorContextInfo = document.getElementById('selector-context-info');
        this.selectorConfirmBtn = document.getElementById('selector-confirm-btn');
        this.startScreen = document.getElementById('start-screen'); this.cutinOverlay = document.getElementById('cutin-overlay');
        this.cutinMessage = document.getElementById('cutin-message'); this.quantityModal = document.getElementById('quantity-modal');
        this.quantityContainer = document.getElementById('quantity-container'); this.quantityConfirmBtn = document.getElementById('quantity-confirm-btn');
        this.mapGuide = document.getElementById('map-guide'); this.prisonerModal = document.getElementById('prisoner-modal');
        this.prisonerList = document.getElementById('prisoner-list'); this.successionModal = document.getElementById('succession-modal');
        this.successionList = document.getElementById('succession-list'); this.resultModal = document.getElementById('result-modal');
        this.resultBody = document.getElementById('result-body'); this.gunshiModal = document.getElementById('gunshi-modal');
        this.gunshiName = document.getElementById('gunshi-name'); this.gunshiMessage = document.getElementById('gunshi-message');
        this.gunshiExecuteBtn = document.getElementById('gunshi-execute-btn');
        this.charityTypeSelector = document.getElementById('charity-type-selector');
        this.aiGuard = document.getElementById('ai-guard');
        this.bushoDetailModal = document.getElementById('busho-detail-modal');
        this.bushoDetailList = document.getElementById('busho-detail-list');
        this.marketRateDisplay = document.getElementById('market-rate');
        this.tradeTypeInfo = document.getElementById('trade-type-info');
        this.scenarioScreen = document.getElementById('scenario-modal');
        this.scenarioList = document.getElementById('scenario-list');

        this.resultModal.addEventListener('click', (e) => { if (e.target === this.resultModal) this.closeResultModal(); });
        document.getElementById('load-file-input').addEventListener('change', (e) => this.game.loadGameFromFile(e));
        
        const backBtn = document.querySelector('#selector-modal .btn-secondary');
        if(backBtn) backBtn.onclick = () => this.closeSelector();
    }
    log(msg) { const div = document.createElement('div'); div.textContent = msg; this.logEl.prepend(div); }
    showResultModal(msg) { this.resultBody.innerHTML = msg.replace(/\n/g, '<br>'); this.resultModal.classList.remove('hidden'); }
    closeResultModal() { this.resultModal.classList.add('hidden'); }
    showCutin(msg) { this.cutinMessage.textContent = msg; this.cutinOverlay.classList.remove('hidden'); this.cutinOverlay.classList.add('fade-in'); setTimeout(() => { this.cutinOverlay.classList.remove('fade-in'); this.cutinOverlay.classList.add('fade-out'); setTimeout(() => { this.cutinOverlay.classList.add('hidden'); this.cutinOverlay.classList.remove('fade-out'); }, 500); }, 2000); }
    
    showScenarioSelection(scenarios, onSelect) {
        this.scenarioScreen.classList.remove('hidden');
        this.scenarioList.innerHTML = '';
        scenarios.forEach(s => {
            const div = document.createElement('div'); div.className = 'scenario-item';
            div.innerHTML = `<div class="scenario-title">${s.name}</div><div class="scenario-desc">${s.desc}</div>`;
            div.onclick = () => {
                this.scenarioScreen.classList.add('hidden');
                onSelect(s.folder);
            };
            this.scenarioList.appendChild(div);
        });
    }
    returnToTitle() {
        this.scenarioScreen.classList.add('hidden');
        document.getElementById('title-screen').classList.remove('hidden');
    }

    showStartScreen(clans, onSelect) { this.startScreen.classList.remove('hidden'); const container = document.getElementById('clan-selector'); container.innerHTML = ''; clans.forEach(clan => { const btn = document.createElement('div'); btn.className = 'clan-btn'; btn.textContent = clan.name; btn.style.color = clan.color; btn.style.borderColor = clan.color; btn.onclick = () => { this.startScreen.classList.add('hidden'); onSelect(clan.id); }; container.appendChild(btn); }); }
    
    renderMap() {
        this.mapEl.innerHTML = ''; document.getElementById('date-display').textContent = `${this.game.year}年 ${this.game.month}月`;
        if(this.marketRateDisplay) this.marketRateDisplay.textContent = `米相場: ${this.game.marketRate.toFixed(2)}`;
        
        const isSelectionMode = (this.game.selectionMode !== null);
        if(isSelectionMode) this.mapGuide.classList.remove('hidden'); else this.mapGuide.classList.add('hidden');
        if (this.game.isProcessingAI) this.aiGuard.classList.remove('hidden'); else this.aiGuard.classList.add('hidden');

        this.game.castles.forEach(c => {
            const el = document.createElement('div'); el.className = 'castle-card';
            el.dataset.clan = c.ownerClan; el.style.setProperty('--c-x', c.x + 1); el.style.setProperty('--c-y', c.y + 1);
            if (c.isDone) el.classList.add('done'); if (this.game.getCurrentTurnCastle() === c && !c.isDone) el.classList.add('active-turn');
            
            const castellan = this.game.getBusho(c.castellanId); 
            const clanData = this.game.clans.find(cl => cl.id === c.ownerClan);
            
            const isVisible = this.game.isCastleVisible(c);
            const soldierText = isVisible ? c.soldiers : "???"; const castellanName = isVisible ? (castellan ? castellan.name : '-') : "???";
            el.innerHTML = `<div class="card-header"><h3>${c.name}</h3></div><div class="card-owner">${clanData ? clanData.name : "中立"}</div><div class="param-grid"><div class="param-item"><span>城主</span> <strong>${castellanName}</strong></div><div class="param-item"><span>兵数</span> ${soldierText}</div></div>`;
            if(clanData) el.style.borderTop = `5px solid ${clanData.color}`;
            
            if (!this.game.isProcessingAI) {
                if (isSelectionMode) {
                    if (this.game.validTargets.includes(c)) { el.classList.add('selectable-target'); el.onclick = () => this.game.resolveMapSelection(c); } else { el.style.opacity = '0.4'; }
                } else { el.onclick = () => this.showCastleInfo(c); }
            } else { el.style.cursor = 'default'; }
            this.mapEl.appendChild(el);
        });
    }
    showControlPanel(castle) { this.currentCastle = castle; this.panelEl.classList.remove('hidden'); this.updatePanelHeader(); this.menuState = 'MAIN'; this.renderCommandMenu(); }
    updatePanelHeader() { if (!this.currentCastle) return; const c = this.currentCastle; const clanData = this.game.clans.find(cd => cd.id === c.ownerClan); document.getElementById('panel-title').textContent = c.name; document.getElementById('panel-clan').textContent = clanData ? clanData.name : "--"; const createStatusRow = (label, val, max = null) => { let html = `<div class="status-row"><div class="status-label">${label}</div><div class="status-value">${val}${max ? '<span class="status-max">/' + max + '</span>' : ''}</div></div>`; if (max) { const pct = Math.min(100, Math.floor((val / max) * 100)); html += `<div class="progress-bar"><div class="progress-fill" style="width:${pct}%"></div></div>`; } return html; }; let html = ""; html += createStatusRow("金", c.gold); html += createStatusRow("兵糧", c.rice); html += createStatusRow("兵士", c.soldiers); html += createStatusRow("人口", c.population); html += createStatusRow("民忠", c.loyalty, 1000); html += createStatusRow("防御", c.defense, c.maxDefense); html += createStatusRow("石高", c.kokudaka, c.maxKokudaka); html += createStatusRow("商業", c.commerce, c.maxCommerce); html += createStatusRow("訓練", c.training, 120); html += createStatusRow("士気", c.morale, 120); this.statusContainer.innerHTML = html; }

    renderCommandMenu() {
        this.cmdArea.innerHTML = '';
        const createBtn = (label, cls, onClick) => { const btn = document.createElement('button'); btn.className = `cmd-btn ${cls || ''}`; btn.textContent = label; btn.onclick = onClick; this.cmdArea.appendChild(btn); };
        if (this.menuState === 'MAIN') {
            createBtn("開発", "category", () => { this.menuState = 'DEVELOP'; this.renderCommandMenu(); });
            createBtn("軍事", "category", () => { this.menuState = 'MILITARY'; this.renderCommandMenu(); });
            createBtn("外交", "category", () => { this.menuState = 'DIPLOMACY'; this.renderCommandMenu(); });
            createBtn("調略", "category", () => { this.menuState = 'STRATEGY'; this.renderCommandMenu(); });
            createBtn("人事", "category", () => { this.menuState = 'PERSONNEL'; this.renderCommandMenu(); });
            createBtn("機能", "category", () => { this.menuState = 'SYSTEM'; this.renderCommandMenu(); });
            createBtn("終了", "finish", () => this.game.finishTurn());
        } else if (this.menuState === 'DEVELOP') {
            createBtn("石高開発", "", () => this.openBushoSelector('farm')); createBtn("商業開発", "", () => this.openBushoSelector('commerce')); createBtn("施し", "", () => this.openBushoSelector('charity')); createBtn("戻る", "back", () => { this.menuState = 'MAIN'; this.renderCommandMenu(); });
        } else if (this.menuState === 'MILITARY') {
            createBtn("出陣", "", () => this.game.enterMapSelection('war')); createBtn("徴兵", "", () => this.openBushoSelector('draft')); createBtn("修復", "", () => this.openBushoSelector('repair')); createBtn("訓練", "", () => this.openBushoSelector('training')); createBtn("兵施し", "", () => this.openBushoSelector('soldier_charity')); createBtn("輸送", "", () => this.game.enterMapSelection('transport')); createBtn("戻る", "back", () => { this.menuState = 'MAIN'; this.renderCommandMenu(); });
        } else if (this.menuState === 'STRATEGY') {
            createBtn("調査", "", () => this.game.enterMapSelection('investigate')); createBtn("扇動", "", () => this.game.enterMapSelection('incite')); createBtn("流言", "", () => this.game.enterMapSelection('rumor')); createBtn("兵糧購入", "", () => this.openQuantitySelector('buy_rice')); createBtn("兵糧売却", "", () => this.openQuantitySelector('sell_rice')); createBtn("戻る", "back", () => { this.menuState = 'MAIN'; this.renderCommandMenu(); });
        } else if (this.menuState === 'DIPLOMACY') {
            createBtn("親善", "", () => this.game.enterMapSelection('goodwill')); createBtn("同盟", "", () => this.game.enterMapSelection('alliance')); createBtn("同盟解消", "", () => this.game.enterMapSelection('break_alliance')); createBtn("戻る", "back", () => { this.menuState = 'MAIN'; this.renderCommandMenu(); });
        } else if (this.menuState === 'INFO') {
            createBtn("調査", "", () => this.game.enterMapSelection('investigate')); createBtn("戻る", "back", () => { this.menuState = 'MAIN'; this.renderCommandMenu(); });
        } else if (this.menuState === 'PERSONNEL') {
            createBtn("移動", "", () => this.game.enterMapSelection('move')); createBtn("登用", "", () => this.openBushoSelector('employ_target')); 
            const isDaimyoHere = this.game.getCastleBushos(this.currentCastle.id).some(b => b.isDaimyo); 
            if (!isDaimyoHere) createBtn("城主任命", "", () => this.openBushoSelector('appoint', null, {allowDone: true})); 
            createBtn("軍師任命", "", () => this.openBushoSelector('appoint_gunshi', null, {allowDone: true})); createBtn("追放", "", () => this.openBushoSelector('banish')); createBtn("戻る", "back", () => { this.menuState = 'MAIN'; this.renderCommandMenu(); });
        } else if (this.menuState === 'SYSTEM') {
            createBtn("ファイル保存", "", () => window.GameApp.saveGameToFile()); createBtn("ファイル読込", "", () => document.getElementById('load-file-input').click()); createBtn("戻る", "back", () => { this.menuState = 'MAIN'; this.renderCommandMenu(); });
        }
    }
    cancelMapSelection() { this.game.selectionMode = null; this.game.validTargets = []; this.renderMap(); this.menuState = 'MAIN'; this.renderCommandMenu(); }
    showGunshiAdvice(action, onConfirm) {
        if (['farm','commerce','repair','draft','charity','transport','appoint_gunshi','appoint','banish','training','soldier_charity','buy_rice','sell_rice'].includes(action.type)) { onConfirm(); return; }
        const gunshi = this.game.getClanGunshi(this.game.playerClanId); if (!gunshi) { onConfirm(); return; }
        const seed = this.game.year * 100 + this.game.month + (action.type.length) + (action.targetId || 0) + (action.val || 0);
        const msg = GameSystem.getGunshiAdvice(gunshi, action, seed);
        this.gunshiModal.classList.remove('hidden'); this.gunshiName.textContent = `軍師: ${gunshi.name}`; this.gunshiMessage.textContent = msg;
        this.gunshiExecuteBtn.onclick = () => { this.gunshiModal.classList.add('hidden'); onConfirm(); };
    }
    openBushoSelector(actionType, targetId = null, extraData = null) {
        if (actionType === 'appoint') { const isDaimyoHere = this.game.getCastleBushos(this.currentCastle.id).some(b => b.isDaimyo); if (isDaimyoHere) { alert("大名の居城は城主を変更できません"); return; } }
        this.selectorModal.classList.remove('hidden'); document.getElementById('selector-title').textContent = "武将を選択"; this.selectorList.innerHTML = '';
        const contextEl = document.getElementById('selector-context-info'); contextEl.classList.remove('hidden'); const c = this.currentCastle; let infoHtml = ""; let sortKey = 'strength'; let sortLabel = "武力";
        let bushos = []; let isMulti = false;
        
        if (actionType === 'appoint_gunshi') { bushos = this.game.bushos.filter(b => b.clan === this.game.playerClanId && !b.isDaimyo && !b.isCastellan && b.status !== 'ronin' && b.status !== 'dead'); infoHtml = "<div>軍師に任命する武将を選択してください (知略重視)</div>"; sortKey = 'intelligence'; sortLabel = '知略'; } 
        else if (actionType === 'employ_target') { bushos = this.game.getCastleBushos(c.id).filter(b => b.status === 'ronin'); infoHtml = "<div>登用する在野武将を選択してください</div>"; sortKey = 'strength'; sortLabel = '武力'; } 
        else if (actionType === 'employ_doer') { bushos = this.game.getCastleBushos(c.id).filter(b => b.status !== 'ronin'); infoHtml = "<div>登用を行う担当官を選択してください (魅力重視)</div>"; sortKey = 'charm'; sortLabel = '魅力'; } 
        else if (actionType === 'diplomacy_doer') { bushos = this.game.getCastleBushos(c.id).filter(b => b.status !== 'ronin'); infoHtml = "<div>外交の担当官を選択してください (外交重視)</div>"; sortKey = 'diplomacy'; sortLabel = '外交'; }
        else if (actionType === 'rumor_target_busho') { bushos = this.game.getCastleBushos(targetId).filter(b => b.status !== 'ronin'); infoHtml = "<div>流言の対象とする武将を選択してください</div>"; sortKey = 'loyalty'; sortLabel = '忠誠'; }
        else if (actionType === 'rumor_doer') { bushos = this.game.getCastleBushos(c.id).filter(b => b.status !== 'ronin'); infoHtml = "<div>流言を実行する担当官を選択してください</div>"; sortKey = 'intelligence'; sortLabel = '知略'; }
        else if (actionType === 'incite_doer') { bushos = this.game.getCastleBushos(c.id).filter(b => b.status !== 'ronin'); infoHtml = "<div>扇動を実行する担当官を選択してください</div>"; sortKey = 'intelligence'; sortLabel = '知略'; }
        else {
            bushos = this.game.getCastleBushos(c.id).filter(b => b.status !== 'ronin');
            if (['farm','commerce','repair','draft','charity','training','soldier_charity'].includes(actionType)) isMulti = true;
            if (actionType === 'farm') { infoHtml = `<div>金: ${c.gold} (1回500)</div>`; sortKey = 'politics'; sortLabel = '政治'; }
            else if (actionType === 'commerce') { infoHtml = `<div>金: ${c.gold} (1回500)</div>`; sortKey = 'politics'; sortLabel = '政治'; }
            else if (actionType === 'charity') { infoHtml = `<div>金: ${c.gold}, 米: ${c.rice} (1回300)</div>`; sortKey = 'charm'; sortLabel = '魅力'; }
            else if (actionType === 'repair') { infoHtml = `<div>金: ${c.gold} (1回300)</div>`; sortKey = 'politics'; sortLabel = '政治'; }
            else if (actionType === 'draft') { infoHtml = `<div>民忠: ${c.loyalty}</div>`; sortKey = 'leadership'; sortLabel = '統率'; }
            else if (actionType === 'training') { infoHtml = `<div>訓練度: ${c.training}/100</div>`; sortKey = 'leadership'; sortLabel = '統率'; }
            else if (actionType === 'soldier_charity') { infoHtml = `<div>士気: ${c.morale}/100</div>`; sortKey = 'leadership'; sortLabel = '統率'; }
            else if (actionType === 'war_deploy') { sortKey = 'strength'; sortLabel = '武力'; isMulti = true; }
            else if (actionType === 'move_deploy') { sortKey = 'strength'; sortLabel = '武力'; isMulti = true; }
            else if (actionType === 'scheme_select') { sortKey = 'intelligence'; sortLabel = '知略'; }
            else if (actionType === 'appoint') { sortKey = 'leadership'; sortLabel = '統率'; }
            else if (actionType === 'investigate_deploy') { sortKey = 'strength'; sortLabel = '武力'; }
        }
        contextEl.innerHTML = infoHtml; bushos.sort((a,b) => b[sortKey] - a[sortKey]);
        const updateContextCost = () => { if (!isMulti) return; const checkedCount = document.querySelectorAll('input[name="sel_busho"]:checked').length; let cost = 0, item = ""; if (['farm','commerce'].includes(actionType)) { cost = checkedCount * 500; item = "金"; } if (['repair','charity'].includes(actionType)) { cost = checkedCount * 300; item = "金"; } if (actionType === 'draft') { contextEl.innerHTML = `<div>選択武将数: ${checkedCount} (コストは次の画面で決定)</div>`; return; } if (cost > 0) contextEl.innerHTML = `<div>消費予定 ${item}: ${cost} (所持: ${item==='金'?c.gold:c.rice})</div>`; };
        bushos.forEach(b => {
            if (actionType === 'banish' && b.isCastellan) return; if (actionType === 'employ_target' && b.isDaimyo) return;
            let isSelectable = !b.isActionDone; if (extraData && extraData.allowDone) isSelectable = true; if (actionType === 'employ_target' || actionType === 'appoint_gunshi' || actionType === 'rumor_target_busho') isSelectable = true;
            const div = document.createElement('div'); div.className = `select-item ${!isSelectable ? 'disabled' : ''}`;
            const inputType = isMulti ? 'checkbox' : 'radio';
            div.innerHTML = `<input type="${inputType}" name="sel_busho" value="${b.id}" ${!isSelectable ? 'disabled' : ''} style="grid-column:1;"><span class="col-act" style="grid-column:2;">${b.isActionDone?'[済]':'[可]'}</span><span class="col-name" style="grid-column:3;">${b.name}</span><span class="col-rank" style="grid-column:4;">${b.getRankName()}</span><span class="col-stat" style="grid-column:5;">${b.leadership}</span><span class="col-stat" style="grid-column:6;">${b.strength}</span><span class="col-stat" style="grid-column:7;">${b.politics}</span><span class="col-stat" style="grid-column:8;">${b.diplomacy}</span><span class="col-stat" style="grid-column:9;">${b.intelligence}</span><span class="col-stat" style="grid-column:10;">${b.charm}</span>`;
            if(isSelectable) { div.onclick = (e) => { if(e.target.tagName !== 'INPUT') div.querySelector('input').click(); updateContextCost(); }; }
            this.selectorList.appendChild(div);
        });
        if (bushos.length === 0) this.selectorList.innerHTML = "<div style='padding:10px;'>対象となる武将がいません</div>";
        this.selectorConfirmBtn.onclick = () => {
            const inputs = document.querySelectorAll('input[name="sel_busho"]:checked'); if (inputs.length === 0) return;
            const selectedIds = Array.from(inputs).map(i => parseInt(i.value)); this.closeSelector();
            if (actionType === 'employ_target') this.openBushoSelector('employ_doer', null, { targetId: selectedIds[0] });
            else if (actionType === 'employ_doer') this.showGunshiAdvice({type: 'employ', targetId: extraData.targetId}, () => this.game.executeEmploy(selectedIds[0], extraData.targetId));
            else if (actionType === 'diplomacy_doer') { if (extraData.subAction === 'goodwill') this.openQuantitySelector('goodwill', selectedIds, targetId); else if (extraData.subAction === 'alliance') this.showGunshiAdvice({type:'diplomacy'}, () => this.game.executeDiplomacy(selectedIds[0], targetId, 'alliance')); else if (extraData.subAction === 'break_alliance') this.game.executeDiplomacy(selectedIds[0], targetId, 'break_alliance'); } 
            else if (actionType === 'draft') this.openQuantitySelector('draft', selectedIds);
            else if (actionType === 'charity') this.openQuantitySelector('charity', selectedIds);
            else if (actionType === 'war_deploy') this.openQuantitySelector('war', selectedIds, targetId);
            else if (actionType === 'transport_deploy') this.openQuantitySelector('transport', selectedIds, targetId);
            else if (actionType === 'investigate_deploy') this.showGunshiAdvice({type:'investigate'}, () => this.game.executeInvestigate(selectedIds[0], targetId));
            else if (actionType === 'appoint_gunshi') this.game.executeAppointGunshi(selectedIds[0]);
            else if (actionType === 'incite_doer') this.showGunshiAdvice({type:'incite'}, () => this.game.executeIncite(selectedIds[0], targetId));
            else if (actionType === 'rumor_target_busho') this.openBushoSelector('rumor_doer', targetId, { targetBushoId: selectedIds[0] });
            else if (actionType === 'rumor_doer') this.showGunshiAdvice({type:'rumor'}, () => this.game.executeRumor(selectedIds[0], targetId, extraData.targetBushoId));
            else { this.showGunshiAdvice({type:actionType}, () => this.game.executeCommand(actionType, selectedIds, targetId)); }
        };
    }
    openQuantitySelector(type, data, targetId) {
        this.quantityModal.classList.remove('hidden'); this.quantityContainer.innerHTML = '';
        this.charityTypeSelector.classList.add('hidden'); this.tradeTypeInfo.classList.add('hidden'); const c = this.currentCastle;
        const createSlider = (label, id, max, currentVal) => { const wrap = document.createElement('div'); wrap.className = 'qty-row'; wrap.innerHTML = `<label>${label} (Max: ${max})</label><div class="qty-control"><input type="range" id="range-${id}" min="0" max="${max}" value="${currentVal}"><input type="number" id="num-${id}" min="0" max="${max}" value="${currentVal}"></div>`; const range = wrap.querySelector(`#range-${id}`); const num = wrap.querySelector(`#num-${id}`); range.oninput = () => num.value = range.value; num.oninput = () => range.value = num.value; this.quantityContainer.appendChild(wrap); return { range, num }; };
        let inputs = {};
        if (type === 'draft') {
            document.getElementById('quantity-title').textContent = "徴兵資金"; inputs.gold = createSlider("金", "gold", c.gold, 0);
            this.quantityConfirmBtn.onclick = () => { const val = parseInt(inputs.gold.num.value); if(val <= 0) return; this.quantityModal.classList.add('hidden'); this.showGunshiAdvice({ type: 'draft', val: val }, () => this.game.executeDraft(data, val)); };
        } else if (type === 'charity') {
            document.getElementById('quantity-title').textContent = "施し"; this.charityTypeSelector.classList.remove('hidden'); const count = data.length; this.quantityContainer.innerHTML = `<p>選択武将数: ${count}名</p>`;
            this.quantityConfirmBtn.onclick = () => { const charityType = document.querySelector('input[name="charityType"]:checked').value; this.quantityModal.classList.add('hidden'); this.showGunshiAdvice({ type: 'charity' }, () => this.game.executeCharity(data, charityType)); };
        } else if (type === 'goodwill') {
            document.getElementById('quantity-title').textContent = "贈与金指定"; inputs.gold = createSlider("金", "gold", c.gold, 100);
            this.quantityConfirmBtn.onclick = () => { const val = parseInt(inputs.gold.num.value); if(val < 100) { alert("金が足りません"); return; } this.quantityModal.classList.add('hidden'); this.showGunshiAdvice({ type: 'goodwill' }, () => this.game.executeDiplomacy(data[0], targetId, 'goodwill', val)); };
        } else if (type === 'war') {
            document.getElementById('quantity-title').textContent = "出陣兵数指定"; inputs.soldiers = createSlider("兵士数", "soldiers", c.soldiers, c.soldiers);
            this.quantityConfirmBtn.onclick = () => { const val = parseInt(inputs.soldiers.num.value); if(val <= 0) { alert("兵士0"); return; } this.quantityModal.classList.add('hidden'); this.showGunshiAdvice({ type: 'war' }, () => this.game.executeWar(data, targetId, val)); };
        } else if (type === 'transport') {
            document.getElementById('quantity-title').textContent = "輸送物資指定"; inputs.gold = createSlider("金", "gold", c.gold, 0); inputs.rice = createSlider("兵糧", "rice", c.rice, 0); inputs.soldiers = createSlider("兵士", "soldiers", c.soldiers, 0);
            this.quantityConfirmBtn.onclick = () => { const vals = { gold: parseInt(inputs.gold.num.value), rice: parseInt(inputs.rice.num.value), soldiers: parseInt(inputs.soldiers.num.value) }; if(vals.gold===0 && vals.rice===0 && vals.soldiers===0) return; this.quantityModal.classList.add('hidden'); this.game.executeTransport(data, targetId, vals); };
        } else if (type === 'buy_rice') {
            document.getElementById('quantity-title').textContent = "兵糧購入"; const rate = this.game.marketRate; const maxBuy = Math.floor(c.gold / rate);
            this.tradeTypeInfo.classList.remove('hidden'); this.tradeTypeInfo.textContent = `相場: ${rate.toFixed(2)} (金1 -> 米${(1/rate).toFixed(2)})`;
            inputs.amount = createSlider("購入量(米)", "amount", maxBuy, 0);
            this.quantityConfirmBtn.onclick = () => { const val = parseInt(inputs.amount.num.value); if(val<=0) return; this.quantityModal.classList.add('hidden'); this.game.executeTrade('buy', val); };
        } else if (type === 'sell_rice') {
            document.getElementById('quantity-title').textContent = "兵糧売却"; const rate = this.game.marketRate;
            this.tradeTypeInfo.classList.remove('hidden'); this.tradeTypeInfo.textContent = `相場: ${rate.toFixed(2)} (米1 -> 金${rate.toFixed(2)})`;
            inputs.amount = createSlider("売却量(米)", "amount", c.rice, 0);
            this.quantityConfirmBtn.onclick = () => { const val = parseInt(inputs.amount.num.value); if(val<=0) return; this.quantityModal.classList.add('hidden'); this.game.executeTrade('sell', val); };
        }
    }
    
    closeSelector() { this.selectorModal.classList.add('hidden'); }
    showPrisonerModal(prisoners) { this.prisonerModal.classList.remove('hidden'); this.prisonerList.innerHTML = ''; prisoners.forEach((p, index) => { const div = document.createElement('div'); div.className = 'prisoner-item'; div.innerHTML = `<div style="margin-bottom:5px;"><strong>${p.name}</strong> (武:${p.strength} 智:${p.intelligence} 魅:${p.charm} 忠:${p.loyalty}) ${p.isDaimyo?'【大名】':''}</div><div class="prisoner-actions"><button class="btn-primary" onclick="window.GameApp.handlePrisonerAction(${index}, 'hire')">登用</button><button class="btn-danger" onclick="window.GameApp.handlePrisonerAction(${index}, 'kill')">処断</button><button class="btn-secondary" onclick="window.GameApp.handlePrisonerAction(${index}, 'release')">解放</button></div>`; this.prisonerList.appendChild(div); }); }
    closePrisonerModal() { this.prisonerModal.classList.add('hidden'); }
    showSuccessionModal(candidates, onSelect) { this.successionModal.classList.remove('hidden'); this.successionList.innerHTML = ''; candidates.forEach(c => { const div = document.createElement('div'); div.className = 'select-item'; div.innerHTML = `<div class="item-detail"><strong style="font-size:1.2rem">${c.name}</strong><span>統率:${c.leadership} 政治:${c.politics} 魅力:${c.charm}</span></div><button class="btn-primary" style="margin-left:auto;">継承</button>`; div.onclick = () => { this.successionModal.classList.add('hidden'); onSelect(c.id); }; this.successionList.appendChild(div); }); if (candidates.length === 0) this.successionList.innerHTML = "<div>後継者がいません...</div>"; }
    showCastleBushosModal() { if (!this.currentCastle) return; this.showBushoList(this.currentCastle); }
    showCastleInfo(castle) {
        const modal = document.getElementById('busho-detail-modal'); const body = document.getElementById('busho-detail-list'); modal.classList.remove('hidden'); document.getElementById('busho-modal-title').textContent = "城情報";
        const clanData = this.game.clans.find(c => c.id === castle.ownerClan);
        const infoArea = document.getElementById('castle-detail-info'); infoArea.classList.remove('hidden');
        const isVisible = this.game.isCastleVisible(castle);
        if (isVisible) {
            infoArea.innerHTML = `<h3>${castle.name} (${clanData ? clanData.name : '中立'})</h3><div style="display:grid; grid-template-columns:1fr 1fr; gap:5px; font-size:0.9rem;"><div>兵士: ${castle.soldiers}</div><div>防御: ${castle.defense}/${castle.maxDefense}</div><div>石高: ${castle.kokudaka}/${castle.maxKokudaka}</div><div>商業: ${castle.commerce}/${castle.maxCommerce}</div><div>民忠: ${castle.loyalty}</div><div>人口: ${castle.population}</div><div>訓練: ${castle.training}</div><div>士気: ${castle.morale}</div></div>`;
            this.renderBushoList(castle.id, body);
        } else {
            infoArea.innerHTML = `<h3>${castle.name} (${clanData ? clanData.name : '中立'})</h3><p class="panel-msg">情報は不明です</p><button class="btn-primary" onclick="window.GameApp.ui.investigateFromInfo(${castle.id})">調査する</button>`;
            body.innerHTML = "";
        }
    }
    investigateFromInfo(castleId) { this.bushoDetailModal.classList.add('hidden'); this.game.enterMapSelection('investigate', castleId); }
    showBushoListById(castleId) { const castle = this.game.getCastle(castleId); this.showBushoList(castle); }
    showBushoList(castle) {
        const modal = document.getElementById('busho-detail-modal'); const body = document.getElementById('busho-detail-list'); modal.classList.remove('hidden'); document.getElementById('busho-modal-title').textContent = `${castle.name} 所属武将`;
        document.getElementById('castle-detail-info').classList.add('hidden');
        this.renderBushoList(castle.id, body);
    }
    renderBushoList(castleId, container) {
        const bushos = this.game.getCastleBushos(castleId); container.innerHTML = '';
        if (bushos.length > 0) {
            bushos.forEach(b => {
                const div = document.createElement('div'); div.className = 'select-item'; div.style.cursor='default';
                div.innerHTML = `<span class="col-check" style="grid-column:1;">${b.isActionDone?'[済]':'[可]'}</span><span class="col-act" style="grid-column:2;">--</span><span class="col-name" style="grid-column:3;">${b.name}</span><span class="col-rank" style="grid-column:4;">${b.getRankName()}</span><span class="col-stat" style="grid-column:5;">${b.leadership}</span><span class="col-stat" style="grid-column:6;">${b.strength}</span><span class="col-stat" style="grid-column:7;">${b.politics}</span><span class="col-stat" style="grid-column:8;">${b.diplomacy}</span><span class="col-stat" style="grid-column:9;">${b.intelligence}</span><span class="col-stat" style="grid-column:10;">${b.charm}</span>`;
                container.appendChild(div);
            });
        } else { container.innerHTML = "<div style='padding:10px; color:#666;'>なし</div>"; }
    }
    
    // ★ 修正点: 守備側（elseブロック）の「火攻」を削除しました
    renderWarControls(isAttacker) { const area = document.getElementById('war-controls'); area.innerHTML = ''; const createBtn = (label, action, cls='') => { const btn = document.createElement('button'); btn.textContent = label; if(cls) btn.className = cls; btn.onclick = () => window.GameApp.execWarCmd(action); area.appendChild(btn); }; 
        if (isAttacker) { 
            createBtn("弓攻撃", "bow"); createBtn("城攻め", "siege"); createBtn("力攻め", "charge"); createBtn("謀略", "scheme"); createBtn("火攻", "fire"); createBtn("撤退", "retreat", "btn-danger"); 
        } else { 
            createBtn("弓攻撃", "def_bow"); createBtn("攻撃", "def_attack"); createBtn("力攻め", "def_charge"); createBtn("謀略", "scheme"); /* 火攻削除 */ createBtn("撤退", "retreat", "btn-danger"); 
        } 
    }
}

/* --- Game Manager --- */
class GameManager {
    constructor() { this.year = GAME_SETTINGS.StartYear; this.month = GAME_SETTINGS.StartMonth; this.castles = []; this.bushos = []; this.turnQueue = []; this.currentIndex = 0; this.playerClanId = 1; this.ui = new UIManager(this); this.warState = { active: false }; this.selectionMode = null; this.validTargets = []; this.pendingPrisoners = []; this.relations = {}; this.isProcessingAI = false; this.marketRate = 1.0; }
    
    getRelationKey(id1, id2) { return id1 < id2 ? `${id1}-${id2}` : `${id2}-${id1}`; }
    getRelation(id1, id2) { const key = this.getRelationKey(id1, id2); if (!this.relations[key]) this.relations[key] = { friendship: 50, alliance: false }; return this.relations[key]; }
    startNewGame() { this.boot(); }
    async boot() { this.ui.showScenarioSelection(SCENARIOS, (folder) => this.loadScenario(folder)); }
    async loadScenario(folder) {
        try {
            const data = await DataManager.loadAll(folder); 
            this.clans = data.clans; this.castles = data.castles; this.bushos = data.bushos; 
            document.getElementById('title-screen').classList.add('hidden'); document.getElementById('app').classList.remove('hidden'); 
            this.ui.showStartScreen(this.clans, (clanId) => { this.playerClanId = clanId; this.init(); }); 
        } catch (e) {
            alert(e.message);
            this.ui.returnToTitle();
        }
    }

    init() { this.startMonth(); }
    getBusho(id) { return this.bushos.find(b => b.id === id); }
    getCastle(id) { return this.castles.find(c => c.id === id); }
    getCastleBushos(cid) { return this.castles.find(c => c.id === cid).samuraiIds.map(id => this.getBusho(id)); }
    getCurrentTurnCastle() { return this.turnQueue[this.currentIndex]; }
    getCurrentTurnId() { return this.year * 12 + this.month; }
    getClanTotalSoldiers(clanId) { return this.castles.filter(c => c.ownerClan === clanId).reduce((sum, c) => sum + c.soldiers, 0); }
    getClanGunshi(clanId) { return this.bushos.find(b => b.clan === clanId && b.isGunshi); }
    isCastleVisible(castle) { if (castle.ownerClan === this.playerClanId) return true; if (castle.investigatedUntil >= this.getCurrentTurnId()) return true; return false; }
    startMonth() {
        this.marketRate = Math.max(GAME_SETTINGS.Economy.TradeRateMin, Math.min(GAME_SETTINGS.Economy.TradeRateMax, this.marketRate * (0.9 + Math.random()*GAME_SETTINGS.Economy.TradeFluctuation)));
        this.ui.showCutin(`${this.year}年 ${this.month}月`); this.ui.log(`=== ${this.year}年 ${this.month}月 ===`); this.processRoninMovements(); if (this.month % 3 === 0) this.optimizeCastellans(); const isPopGrowth = (this.month % 2 === 0);
        this.castles.forEach(c => {
            if (c.ownerClan === 0) return;
            c.isDone = false;
            let income = Math.floor(c.commerce * GAME_SETTINGS.Economy.IncomeGoldRate);
            income = GameSystem.applyVariance(income, GAME_SETTINGS.Economy.IncomeFluctuation); // ★ 収入変動
            
            if(this.month === 3) income += 500; c.gold += income; 
            if(this.month === 9) {
                let riceIncome = c.kokudaka * GAME_SETTINGS.Economy.IncomeRiceRate;
                riceIncome = GameSystem.applyVariance(riceIncome, GAME_SETTINGS.Economy.IncomeFluctuation); // ★ 収穫変動
                c.rice += riceIncome;
            }
            if (isPopGrowth) { 
                let growth = 0;
                if(c.loyalty < 300) growth = -Math.floor(c.population * 0.01);
                else if(c.loyalty > 600) growth = Math.floor(c.population * 0.01);
                c.population = Math.max(0, c.population + growth);
            }
            const bushos = this.getCastleBushos(c.id);
            c.rice = Math.max(0, c.rice - Math.floor(c.soldiers * GAME_SETTINGS.Economy.ConsumeRicePerSoldier));
            c.gold = Math.max(0, c.gold - (bushos.length * GAME_SETTINGS.Economy.ConsumeGoldPerBusho));
            bushos.forEach(b => b.isActionDone = false);
        });
        this.turnQueue = this.castles.filter(c => c.ownerClan !== 0).sort(() => Math.random() - 0.5);
        this.currentIndex = 0; this.processTurn();
    }
    processRoninMovements() { const ronins = this.bushos.filter(b => b.status === 'ronin'); ronins.forEach(r => { const currentC = this.getCastle(r.castleId); if(!currentC) return; const neighbors = this.castles.filter(c => GameSystem.isAdjacent(currentC, c)); neighbors.forEach(n => { const castellan = this.getBusho(n.castellanId); if (Math.random() < 0.2) { currentC.samuraiIds = currentC.samuraiIds.filter(id => id !== r.id); n.samuraiIds.push(r.id); r.castleId = n.id; } }); }); }
    optimizeCastellans() { const clanIds = [...new Set(this.castles.filter(c=>c.ownerClan!==0).map(c=>c.ownerClan))]; clanIds.forEach(clanId => { const myBushos = this.bushos.filter(b => b.clan === clanId); if(myBushos.length===0) return; let daimyoInt = Math.max(...myBushos.map(b => b.intelligence)); if (Math.random() * 100 < daimyoInt) { const clanCastles = this.castles.filter(c => c.ownerClan === clanId); clanCastles.forEach(castle => { const castleBushos = this.getCastleBushos(castle.id).filter(b => b.status !== 'ronin'); if (castleBushos.length <= 1) return; castleBushos.sort((a, b) => (b.leadership + b.politics) - (a.leadership + a.politics)); const best = castleBushos[0]; if (best.id !== castle.castellanId) { const old = this.getBusho(castle.castellanId); if(old) old.isCastellan = false; best.isCastellan = true; castle.castellanId = best.id; } }); } }); }
    processTurn() {
        if (this.warState.active && this.warState.isPlayerInvolved) return; // 戦争中は進行しない

        if (this.currentIndex >= this.turnQueue.length) { this.endMonth(); return; }
        const castle = this.turnQueue[this.currentIndex]; 
        
        // 滅亡済みチェック
        if(castle.ownerClan !== 0 && !this.clans.find(c=>c.id===castle.ownerClan)) {
            this.currentIndex++; this.processTurn(); return;
        }

        this.ui.renderMap();
        if (castle.ownerClan === this.playerClanId) {
            this.isProcessingAI = false; this.ui.renderMap();
            this.ui.log(`【${castle.name}】命令を下してください`); this.ui.showControlPanel(castle);
        } else {
            this.isProcessingAI = true; this.ui.renderMap();
            this.ui.log(`【${castle.name}】(他国) 思考中...`); document.getElementById('control-panel').classList.add('hidden');
            setTimeout(() => this.execAI(castle), 600);
        }
    }
    finishTurn() { 
        if(this.warState.active && this.warState.isPlayerInvolved) return; // 二重呼び出し防止
        this.selectionMode = null; 
        const castle = this.getCurrentTurnCastle(); if(castle) castle.isDone = true; 
        this.currentIndex++; this.processTurn(); 
    }
    endMonth() { this.month++; if(this.month > 12) { this.month = 1; this.year++; } const clans = new Set(this.castles.filter(c => c.ownerClan !== 0).map(c => c.ownerClan)); const playerAlive = clans.has(this.playerClanId); if (clans.size === 1 && playerAlive) alert(`天下統一！`); else if (!playerAlive) alert(`我が軍は滅亡しました...`); else this.startMonth(); }

    enterMapSelection(actionType, preSelectedTargetId=null) {
        this.selectionMode = actionType; const current = this.getCurrentTurnCastle(); this.validTargets = [];
        if (actionType === 'war') { this.validTargets = this.castles.filter(c => { if (c.ownerClan === 0 || c.ownerClan === current.ownerClan || !GameSystem.isAdjacent(current, c)) return false; const rel = this.getRelation(current.ownerClan, c.ownerClan); return !rel.alliance; }); }
        else if (['transport','move'].includes(actionType)) { this.validTargets = this.castles.filter(c => c.ownerClan === current.ownerClan && c.id !== current.id && GameSystem.isAdjacent(current, c)); }
        else if (['investigate','incite','rumor'].includes(actionType)) { this.validTargets = this.castles.filter(c => c.ownerClan !== 0 && c.ownerClan !== current.ownerClan); }
        else if (['goodwill', 'alliance', 'break_alliance'].includes(actionType)) { const otherClans = this.clans.filter(c => c.id !== this.playerClanId); otherClans.forEach(clan => { const rel = this.getRelation(this.playerClanId, clan.id); if (actionType === 'break_alliance' && !rel.alliance) return; if (actionType === 'alliance' && rel.alliance) return; const repCastle = this.castles.find(c => c.ownerClan === clan.id); if (repCastle) this.validTargets.push(repCastle); }); }
        if (preSelectedTargetId) { const t = this.getCastle(preSelectedTargetId); if(t && this.validTargets.includes(t)) { this.resolveMapSelection(t); return; } }
        if (this.validTargets.length === 0) { alert("対象がありません"); this.selectionMode = null; return; }
        this.ui.cmdArea.innerHTML = ''; const btn = document.createElement('button'); btn.className = 'cmd-btn back'; btn.textContent = "キャンセル"; btn.onclick = () => this.ui.cancelMapSelection(); this.ui.cmdArea.appendChild(btn); this.ui.renderMap();
    }
    resolveMapSelection(targetCastle) { if (!this.selectionMode) return; const actionType = this.selectionMode; this.selectionMode = null; this.ui.renderCommandMenu(); if (actionType === 'war') this.ui.openBushoSelector('war_deploy', targetCastle.id); else if (actionType === 'move') this.ui.openBushoSelector('move_deploy', targetCastle.id); else if (actionType === 'transport') this.ui.openBushoSelector('transport_deploy', targetCastle.id); else if (actionType === 'investigate') this.ui.openBushoSelector('investigate_deploy', targetCastle.id); else if (actionType === 'incite') this.ui.openBushoSelector('incite_doer', targetCastle.id); else if (actionType === 'rumor') this.ui.openBushoSelector('rumor_target_busho', targetCastle.id); else if (['goodwill', 'alliance', 'break_alliance'].includes(actionType)) { this.ui.openBushoSelector('diplomacy_doer', targetCastle.ownerClan, { subAction: actionType }); } this.ui.renderMap(); }
    
    executeCommand(type, bushoIds, targetId) {
        const castle = this.getCurrentTurnCastle(); let totalVal = 0, cost = 0, count = 0, actionName = "";
        bushoIds.forEach(bid => {
            const busho = this.getBusho(bid); if (!busho) return;
            if (type === 'farm') { if (castle.gold >= 500) { const val = GameSystem.calcDevelopment(busho); castle.gold -= 500; castle.kokudaka = Math.min(castle.maxKokudaka, castle.kokudaka + val); totalVal += val; cost += 500; count++; actionName = "石高開発"; } }
            else if (type === 'commerce') { if (castle.gold >= 500) { const val = GameSystem.calcDevelopment(busho); castle.gold -= 500; castle.commerce = Math.min(castle.maxCommerce, castle.commerce + val); totalVal += val; cost += 500; count++; actionName = "商業開発"; } }
            else if (type === 'repair') { if (castle.gold >= 300) { const val = GameSystem.calcRepair(busho); castle.gold -= 300; castle.defense = Math.min(castle.maxDefense, castle.defense + val); totalVal += val; cost += 300; count++; actionName = "城壁修復"; } }
            else if (type === 'training') { const val = GameSystem.calcTraining(busho); castle.training = Math.min(100, castle.training + val); totalVal += val; count++; actionName = "訓練"; }
            else if (type === 'soldier_charity') { const val = GameSystem.calcSoldierCharity(busho); castle.morale = Math.min(100, castle.morale + val); totalVal += val; count++; actionName = "兵施し"; }
            else if (type === 'appoint') { const old = this.getBusho(castle.castellanId); if(old) old.isCastellan = false; castle.castellanId = busho.id; busho.isCastellan = true; this.ui.showResultModal(`${busho.name}を城主に任命しました`); this.ui.updatePanelHeader(); this.ui.renderCommandMenu(); return; }
            else if (type === 'banish') { if(!confirm(`本当に ${busho.name} を追放しますか？`)) return; busho.status = 'ronin'; busho.clan = 0; busho.isCastellan = false; this.ui.showResultModal(`${busho.name}を追放しました`); this.ui.updatePanelHeader(); this.ui.renderCommandMenu(); return; }
            else if (type === 'move_deploy') { const targetC = this.getCastle(targetId); castle.samuraiIds = castle.samuraiIds.filter(id => id !== busho.id); targetC.samuraiIds.push(busho.id); busho.castleId = targetId; count++; actionName = "移動"; }
            busho.isActionDone = true;
        });
        if (count > 0 && actionName !== "移動") { this.ui.showResultModal(`${count}名で${actionName}を行いました\n効果: +${totalVal} ${cost>0?`(消費: ${cost})`:''}`); }
        else if (actionName === "移動") { const targetName = this.getCastle(targetId).name; this.ui.showResultModal(`${count}名が${targetName}へ移動しました`); }
        this.ui.updatePanelHeader(); this.ui.renderCommandMenu();
    }
    executeCharity(bushoIds, charityType) { const castle = this.getCurrentTurnCastle(); let totalVal = 0, count = 0; bushoIds.forEach(bid => { const busho = this.getBusho(bid); let costGold = (charityType === 'gold' || charityType === 'both') ? 300 : 0; let costRice = (charityType === 'rice' || charityType === 'both') ? 300 : 0; if (castle.gold >= costGold && castle.rice >= costRice) { const val = GameSystem.calcCharity(busho, charityType); castle.gold -= costGold; castle.rice -= costRice; castle.loyalty = Math.min(castle.maxLoyalty, castle.loyalty + val); totalVal += val; count++; busho.isActionDone = true; } }); if(count > 0) this.ui.showResultModal(`${count}名で施しを行いました\n民忠 +${totalVal}`); else this.ui.showResultModal(`施しを実行できませんでした`); this.ui.updatePanelHeader(); this.ui.renderCommandMenu(); }
    executeDraft(bushoIds, goldAmount) {
        const castle = this.getCurrentTurnCastle(); const goldPerBusho = Math.floor(goldAmount / bushoIds.length); let totalSoldiers = 0, totalPopLost = 0;
        if (castle.gold < goldAmount) { alert("資金不足"); return; }
        bushoIds.forEach(bid => {
            const busho = this.getBusho(bid); 
            
            // 徴兵可能数を計算 (★変動幅を考慮)
            let limit = GameSystem.calcDraftLimit(castle); 
            
            let draftNum = GameSystem.calcDraftFromGold(goldPerBusho, busho); 
            draftNum = Math.min(draftNum, limit, castle.population);
            
            if (draftNum > 0) {
                castle.training = GameSystem.calcWeightedAvg(castle.training, castle.soldiers, 30, draftNum);
                castle.morale = GameSystem.calcWeightedAvg(castle.morale, castle.soldiers, 30, draftNum);
                castle.gold -= goldPerBusho; castle.population -= draftNum; castle.soldiers += draftNum;
                totalSoldiers += draftNum; totalPopLost += draftNum; castle.loyalty = Math.max(0, castle.loyalty - Math.floor(draftNum/100));
            }
            busho.isActionDone = true;
        });
        this.ui.showResultModal(`${bushoIds.length}名で徴兵を行いました\n兵士 +${totalSoldiers}`); this.ui.updatePanelHeader(); this.ui.renderCommandMenu();
    }
    executeTrade(type, amount) {
        const castle = this.getCurrentTurnCastle(); const rate = this.marketRate;
        if(type === 'buy') { const cost = Math.floor(amount * rate); if(castle.gold < cost) { alert("資金不足"); return; } castle.gold -= cost; castle.rice += amount; this.ui.showResultModal(`兵糧${amount}を購入しました\n(金-${cost})`); } else { if(castle.rice < amount) { alert("兵糧不足"); return; } const gain = Math.floor(amount * rate); castle.rice -= amount; castle.gold += gain; this.ui.showResultModal(`兵糧${amount}を売却しました\n(金+${gain})`); }
        this.ui.updatePanelHeader(); this.ui.renderCommandMenu();
    }
    executeIncite(doerId, targetId) {
        const doer = this.getBusho(doerId); const target = this.getCastle(targetId);
        const result = GameSystem.calcIncite(doer);
        if(result.success) {
            target.loyalty = Math.max(0, target.loyalty - result.val);
            this.ui.showResultModal(`${doer.name}の扇動が成功！\n${target.name}の民忠が${result.val}低下しました`);
        } else { this.ui.showResultModal(`${doer.name}の扇動は失敗しました`); }
        doer.isActionDone = true; this.ui.updatePanelHeader(); this.ui.renderCommandMenu();
    }
    executeRumor(doerId, castleId, targetBushoId) {
        const doer = this.getBusho(doerId); const targetBusho = this.getBusho(targetBushoId);
        const result = GameSystem.calcRumor(doer, targetBusho);
        if(result.success) {
            targetBusho.loyalty = Math.max(0, targetBusho.loyalty - result.val);
            this.ui.showResultModal(`${doer.name}の流言が成功！\n${targetBusho.name}の忠誠が${result.val}低下しました`);
        } else { this.ui.showResultModal(`${doer.name}の流言は失敗しました`); }
        doer.isActionDone = true; this.ui.updatePanelHeader(); this.ui.renderCommandMenu();
    }
    executeTransport(bushoIds, targetId, vals) {
        const c = this.getCurrentTurnCastle(); const t = this.getCastle(targetId);
        if(vals.soldiers > 0) {
            t.training = GameSystem.calcWeightedAvg(t.training, t.soldiers, c.training, vals.soldiers);
            t.morale = GameSystem.calcWeightedAvg(t.morale, t.soldiers, c.morale, vals.soldiers);
        }
        c.gold -= vals.gold; c.rice -= vals.rice; c.soldiers -= vals.soldiers;
        t.gold += vals.gold; t.rice += vals.rice; t.soldiers += vals.soldiers;
        const busho = this.getBusho(bushoIds[0]); busho.isActionDone = true;
        this.ui.showResultModal(`${busho.name}が${t.name}へ物資を輸送しました`);
        this.ui.updatePanelHeader(); this.ui.renderCommandMenu();
    }
    executeAppointGunshi(bushoId) { const busho = this.getBusho(bushoId); const oldGunshi = this.bushos.find(b => b.clan === this.playerClanId && b.isGunshi); if (oldGunshi) oldGunshi.isGunshi = false; busho.isGunshi = true; this.ui.showResultModal(`${busho.name}を軍師に任命しました`); this.ui.updatePanelHeader(); this.ui.renderCommandMenu(); }
    executeInvestigate(bushoId, targetId) { const busho = this.getBusho(bushoId); const target = this.getCastle(targetId); let msg = ""; if (GameSystem.calcInvestigateSuccess(busho, target)) { target.investigatedUntil = this.getCurrentTurnId() + 4; msg = `${busho.name}が${target.name}への潜入に成功！\n情報を入手しました。`; } else { msg = `${busho.name}は${target.name}への潜入に失敗...\n情報は得られませんでした。`; } busho.isActionDone = true; this.ui.showResultModal(msg); this.ui.updatePanelHeader(); this.ui.renderCommandMenu(); this.ui.renderMap(); }
    executeEmploy(doerId, targetId) { const doer = this.getBusho(doerId); const target = this.getBusho(targetId); const myPower = this.getClanTotalSoldiers(this.playerClanId); const targetClanId = target.clan; const targetPower = targetClanId === 0 ? 0 : this.getClanTotalSoldiers(targetClanId); const success = GameSystem.calcEmploymentSuccess(doer, target, myPower, targetPower); let msg = ""; if (success) { const oldCastle = this.getCastle(target.castleId); if(oldCastle && oldCastle.samuraiIds.includes(target.id)) { oldCastle.samuraiIds = oldCastle.samuraiIds.filter(id => id !== target.id); } const currentC = this.getCurrentTurnCastle(); currentC.samuraiIds.push(target.id); target.castleId = currentC.id; target.clan = this.playerClanId; target.status = 'active'; target.loyalty = 50; msg = `${target.name}の登用に成功しました！`; } else { msg = `${target.name}は登用に応じませんでした...`; } doer.isActionDone = true; this.ui.showResultModal(msg); this.ui.renderCommandMenu(); }
    executeDiplomacy(doerId, targetClanId, type, gold = 0) { const doer = this.getBusho(doerId); const relation = this.getRelation(this.playerClanId, targetClanId); let msg = ""; if (type === 'goodwill') { const baseBonus = (gold / 100) + (doer.diplomacy + doer.charm) * 0.1; const increase = Math.floor(baseBonus * (0.8 + Math.random() * 0.4)); relation.friendship = Math.min(100, relation.friendship + increase); const castle = this.getCurrentTurnCastle(); castle.gold -= gold; msg = `${doer.name}が親善を行いました。\n友好度が${increase}上昇しました`; } else if (type === 'alliance') { const chance = relation.friendship + doer.diplomacy; if (chance > 120 && Math.random() > 0.3) { relation.alliance = true; msg = `同盟の締結に成功しました！`; } else { relation.friendship = Math.max(0, relation.friendship - 10); msg = `同盟の締結に失敗しました...`; } } else if (type === 'break_alliance') { relation.alliance = false; relation.friendship = Math.max(0, relation.friendship - 60); msg = `同盟を破棄しました。`; } doer.isActionDone = true; this.ui.showResultModal(msg); this.ui.updatePanelHeader(); this.ui.renderCommandMenu(); }
    executeWar(bushoIds, targetId, soldierCount) { const castle = this.getCurrentTurnCastle(); const targetC = this.getCastle(targetId); const attackers = bushoIds.map(id => this.getBusho(id)); attackers.forEach(b => b.isActionDone = true); castle.soldiers -= soldierCount; this.startWar(castle, targetC, attackers, soldierCount); }
    
    // --- AI Logic (修正版: パラメータ考慮型) ---
    execAI(castle) {
        try {
            const castellan = this.getBusho(castle.castellanId);
            if (castellan && !castellan.isActionDone) {
                const enemies = this.castles.filter(c => c.ownerClan !== 0 && c.ownerClan !== castle.ownerClan && GameSystem.isAdjacent(castle, c));
                const validEnemies = enemies.filter(e => !this.getRelation(castle.ownerClan, e.ownerClan).alliance);
                
                let bestTarget = null;
                let maxScore = -1;

                validEnemies.forEach(target => {
                    let perceivedEnemyPower = target.soldiers;
                    if (castellan.intelligence > GAME_SETTINGS.AI.IntelligenceWar) {
                        perceivedEnemyPower += (target.defense / 2);
                    }

                    // 攻撃判断の閾値
                    let threshold = GAME_SETTINGS.AI.Aggressiveness;
                    // 武力による補正
                    threshold -= (castellan.strength - 50) * 0.005;

                    if (castellan.personality === 'aggressive') threshold -= 0.2; 
                    if (castellan.personality === 'cautious') threshold += 0.3;   
                    threshold += (Math.random() * 0.2 - 0.1);

                    const ratio = castle.soldiers / (perceivedEnemyPower + 1);
                    
                    if (ratio > threshold && castle.soldiers > 1000) {
                        let score = ratio + (Math.random() * 0.5);
                        if (score > maxScore) {
                            maxScore = score;
                            bestTarget = target;
                        }
                    } else {
                        if (castellan.intelligence < 40 && ratio > 1.0 && castellan.personality === 'aggressive') {
                            if (Math.random() < 0.2) bestTarget = target;
                        }
                    }
                });

                if (bestTarget) {
                     let sendSoldiers = 0;
                     if (castellan.intelligence > GAME_SETTINGS.AI.IntelligenceWar) {
                         let needed = Math.floor((bestTarget.soldiers + bestTarget.defense) * 1.3);
                         let maxSend = Math.max(0, castle.soldiers - 500);
                         sendSoldiers = Math.min(needed, maxSend);
                         sendSoldiers = Math.max(sendSoldiers, Math.min(1000, castle.soldiers));
                     } else {
                         sendSoldiers = Math.floor(castle.soldiers * (GAME_SETTINGS.AI.SoliderSendRate + Math.random() * 0.2));
                     }
                     if (sendSoldiers > castle.soldiers) sendSoldiers = castle.soldiers;

                     if (sendSoldiers > 500) {
                        this.startWar(castle, bestTarget, [castellan], sendSoldiers); 
                     } else {
                        this.execAIDomestic(castle, castellan);
                     }
                } else {
                     this.execAIDomestic(castle, castellan);
                }
            } else { this.finishTurn(); }
        } catch(e) { console.error("AI Error:", e); this.finishTurn(); }
    }
    
    execAIDomestic(castle, castellan) {
        if(castle.gold > 500) {
            if (castellan.intelligence > GAME_SETTINGS.AI.PoliticsCheck) {
                if(castle.training < 60) { castle.training += 5; castle.gold -= 300; }
                else if(castle.loyalty < 50) { castle.loyalty += 5; castle.gold -= 300; castle.rice -= 300; }
                else { const val = GameSystem.calcDevelopment(castellan); castle.kokudaka+=val; castle.gold-=500; }
            } else {
                const val = GameSystem.calcDevelopment(castellan); castle.kokudaka+=val; castle.gold-=500;
            }
        }
        castellan.isActionDone = true; this.finishTurn();
    }

    // --- War System ---
    startWar(atkCastle, defCastle, atkBushos, atkSoldierCount) {
        try {
            const isPlayerInvolved = (atkCastle.ownerClan === this.playerClanId || defCastle.ownerClan === this.playerClanId);
            const atkClan = this.clans.find(c => c.id === atkCastle.ownerClan); const atkGeneral = atkBushos[0].name;
            this.ui.showCutin(`${atkClan.name}軍の${atkGeneral}が\n${defCastle.name}に攻め込みました！`);
            let defBusho = this.getBusho(defCastle.castellanId); if (!defBusho) defBusho = {name:"守備隊長", strength:30, leadership:30, intelligence:30, charm:30};
            const attackerForce = { name: atkCastle.name + "遠征軍", ownerClan: atkCastle.ownerClan, soldiers: atkSoldierCount, bushos: atkBushos, training: atkCastle.training, morale: atkCastle.morale };
            this.warState = { active: true, round: 1, attacker: attackerForce, sourceCastle: atkCastle, defender: defCastle, atkBushos: atkBushos, defBusho: defBusho, turn: 'attacker', isPlayerInvolved: isPlayerInvolved, deadSoldiers: { attacker: 0, defender: 0 } };
            defCastle.loyalty = Math.max(0, defCastle.loyalty - 50); defCastle.population = Math.max(0, defCastle.population - 500);
            
            if (isPlayerInvolved) { 
                setTimeout(() => {
                    document.getElementById('war-modal').classList.remove('hidden'); 
                    document.getElementById('war-log').innerHTML = ''; 
                    this.ui.log(`★ ${atkCastle.name}が出陣(兵${atkSoldierCount})！ ${defCastle.name}へ攻撃！`); 
                    this.updateWarUI(); 
                    this.processWarRound(); 
                }, 1000);
            } else { 
                setTimeout(() => {
                    this.ui.log(`[合戦] ${atkCastle.name} vs ${defCastle.name} (結果のみ)`); 
                    this.resolveAutoWar(); 
                }, 1000);
            }
        } catch(e) { console.error("StartWar:", e); this.finishTurn(); }
    }
    resolveAutoWar() { try { const s = this.warState; while(s.round <= GAME_SETTINGS.Military.WarMaxRounds && s.attacker.soldiers > 0 && s.defender.soldiers > 0 && s.defender.defense > 0) { this.resolveWarAction('charge'); if (s.attacker.soldiers <= 0 || s.defender.soldiers <= 0) break; } this.endWar(s.defender.soldiers <= 0 || s.defender.defense <= 0); } catch(e) { console.error(e); this.endWar(false); } }
    processWarRound() { if (!this.warState.active) return; const s = this.warState; if (s.defender.soldiers <= 0 || s.defender.defense <= 0) { this.endWar(true); return; } if (s.attacker.soldiers <= 0) { this.endWar(false); return; } this.updateWarUI(); const isPlayerAtkSide = (s.attacker.ownerClan === this.playerClanId); const isPlayerDefSide = (s.defender.ownerClan === this.playerClanId); const isAtkTurn = (s.turn === 'attacker'); document.getElementById('war-turn-actor').textContent = isAtkTurn ? "攻撃側" : "守備側"; let isPlayerTurn = (isAtkTurn && isPlayerAtkSide) || (!isAtkTurn && isPlayerDefSide); this.ui.renderWarControls(isAtkTurn); if (isPlayerTurn) document.getElementById('war-controls').classList.remove('disabled-area'); else { document.getElementById('war-controls').classList.add('disabled-area'); setTimeout(() => this.execWarAI(), 800); } }
    execWarCmd(type) { if(type==='scheme'||type==='fire') this.resolveWarAction(type); else { document.getElementById('war-controls').classList.add('disabled-area'); this.resolveWarAction(type); } }
    execWarAI() { const actor = this.warState.turn === 'attacker' ? this.warState.atkBushos[0] : this.warState.defBusho; if(actor.intelligence > 80 && Math.random() < 0.3) this.resolveWarAction('scheme'); else this.resolveWarAction(this.warState.turn === 'attacker' ? 'charge' : 'def_charge'); }
    resolveWarAction(type) {
        if (!this.warState.active) return;
        if(type === 'retreat') { if(this.warState.turn === 'attacker') this.endWar(false); else this.endWar(true, true); return; }
        const s = this.warState; const isAtkTurn = (s.turn === 'attacker'); const target = isAtkTurn ? s.defender : s.attacker;
        let atkStats = GameSystem.calcUnitStats(s.atkBushos); let defStats = { str: s.defBusho.strength, int: s.defBusho.intelligence, ldr: s.defBusho.leadership };
        if (type === 'scheme') { const actor = isAtkTurn ? s.atkBushos[0] : s.defBusho; const targetBusho = isAtkTurn ? s.defBusho : s.atkBushos[0]; const result = GameSystem.calcScheme(actor, targetBusho, isAtkTurn ? s.defender.loyalty : 1000); if (!result.success) { if (s.isPlayerInvolved) this.ui.log(`R${s.round} 謀略失敗！`); } else { target.soldiers = Math.max(0, target.soldiers - result.damage); if (s.isPlayerInvolved) this.ui.log(`R${s.round} 謀略成功！ 兵士に${result.damage}の被害`); } this.advanceWarTurn(); return; }
        if (type === 'fire') { const actor = isAtkTurn ? s.atkBushos[0] : s.defBusho; const targetBusho = isAtkTurn ? s.defBusho : s.atkBushos[0]; const result = GameSystem.calcFire(actor, targetBusho); if (!result.success) { if (s.isPlayerInvolved) this.ui.log(`R${s.round} 火攻失敗！`); } else { if(isAtkTurn) s.defender.defense = Math.max(0, s.defender.defense - result.damage); else target.soldiers = Math.max(0, target.soldiers - 50); if (s.isPlayerInvolved) this.ui.log(`R${s.round} 火攻成功！ ${isAtkTurn?'防御':'兵士'}に${result.damage}の被害`); } this.advanceWarTurn(); return; }

        const result = GameSystem.calcWarDamage(atkStats, defStats, s.attacker.soldiers, s.defender.soldiers, s.defender.defense, s.attacker.morale, s.defender.training, type);
        const actualSoldierDmg = Math.min(target.soldiers, result.soldierDmg); target.soldiers -= actualSoldierDmg;
        if(isAtkTurn) s.deadSoldiers.defender += actualSoldierDmg; else s.deadSoldiers.attacker += actualSoldierDmg;
        if (isAtkTurn) s.defender.defense = Math.max(0, s.defender.defense - result.wallDmg);
        if(result.risk > 1.0) { const counterDmg = Math.floor(actualSoldierDmg * (result.risk - 1.0) * 0.5); const actorArmy = isAtkTurn ? s.attacker : s.defender; actorArmy.soldiers = Math.max(0, actorArmy.soldiers - counterDmg); if(s.isPlayerInvolved) this.ui.log(`(反撃被害: ${counterDmg})`); }
        if (s.isPlayerInvolved) { let actionName = type.includes('bow') ? "弓攻撃" : type.includes('siege') ? "城攻め" : "力攻め"; if (type.includes('def_')) actionName = type === 'def_bow' ? "弓反撃" : type === 'def_charge' ? "全力反撃" : "反撃"; let msg = (result.wallDmg > 0) ? `${actionName} (兵-${actualSoldierDmg} 防-${result.wallDmg})` : `${actionName} (兵-${actualSoldierDmg})`; this.ui.log(`R${s.round} [${isAtkTurn?'攻':'守'}] ${msg}`); }
        this.advanceWarTurn();
    }
    advanceWarTurn() { const s = this.warState; if (s.turn === 'attacker') s.turn = 'defender'; else { s.turn = 'attacker'; s.round++; if(s.round > GAME_SETTINGS.Military.WarMaxRounds) { this.endWar(false); return; } } if (s.isPlayerInvolved) this.processWarRound(); }
    updateWarUI() { if (!this.warState.isPlayerInvolved) return; const els = { atkName: document.getElementById('war-atk-name'), atkSoldier: document.getElementById('war-atk-soldier'), atkBusho: document.getElementById('war-atk-busho'), defName: document.getElementById('war-def-name'), defSoldier: document.getElementById('war-def-soldier'), defWall: document.getElementById('war-def-wall'), defBusho: document.getElementById('war-def-busho'), round: document.getElementById('war-round') }; const s = this.warState; els.atkName.textContent = s.attacker.name; els.atkSoldier.textContent = s.attacker.soldiers; els.atkBusho.textContent = s.atkBushos.map(b=>b.name).join(','); els.defName.textContent = s.defender.name; els.defSoldier.textContent = s.defender.soldiers; els.defWall.textContent = s.defender.defense; els.defBusho.textContent = s.defBusho.name; els.round.textContent = s.round; }
    endWar(attackerWon, defenderRetreated = false) { 
        const s = this.warState; s.active = false; 
        if (s.isPlayerInvolved) document.getElementById('war-modal').classList.add('hidden'); 
        
        const isShortWar = s.round < 5; const recoveryRate = isShortWar ? 0.3 : 0.2; 
        s.attacker.soldiers += Math.floor(s.deadSoldiers.attacker * recoveryRate); s.defender.soldiers += Math.floor(s.deadSoldiers.defender * recoveryRate); 
        
        if (attackerWon) { 
            s.attacker.training = Math.min(120, s.attacker.training + 5); s.attacker.morale = Math.min(120, s.attacker.morale + 5); 
            if (defenderRetreated) { 
                const retreatCastle = GameSystem.getRetreatCastle(s.defender, this.castles); const defCastellan = this.getBusho(s.defender.castellanId); 
                if (retreatCastle && defCastellan) { retreatCastle.soldiers += s.defender.soldiers; s.defender.samuraiIds = s.defender.samuraiIds.filter(id => id !== defCastellan.id); retreatCastle.samuraiIds.push(defCastellan.id); defCastellan.castleId = retreatCastle.id; defCastellan.isCastellan = false; } 
            } else { this.processCaptures(s.defender, s.attacker.ownerClan); } 
            s.defender.ownerClan = s.attacker.ownerClan; s.defender.soldiers = s.attacker.soldiers; s.defender.investigatedUntil = 0; 
            s.atkBushos.forEach((b, idx) => { const srcC = this.getCastle(s.sourceCastle.id); srcC.samuraiIds = srcC.samuraiIds.filter(id => id !== b.id); b.castleId = s.defender.id; s.defender.samuraiIds.push(b.id); if(idx === 0) { b.isCastellan = true; s.defender.castellanId = b.id; } else b.isCastellan = false; }); 
        } else { const srcC = this.getCastle(s.sourceCastle.id); srcC.soldiers += s.attacker.soldiers; } 
        
        if (s.attacker.ownerClan !== this.playerClanId) this.finishTurn(); 
        else { this.ui.renderCommandMenu(); this.ui.renderMap(); }
    }
    processCaptures(defeatedCastle, winnerClanId) { const losers = this.getCastleBushos(defeatedCastle.id); const captives = []; losers.forEach(b => { let chance = 0.4 - (b.strength * 0.002) + (Math.random() * 0.3); if (defeatedCastle.soldiers > 1000) chance -= 0.2; if (chance > 0.5) captives.push(b); else { b.clan = 0; b.castleId = 0; b.isCastellan = false; b.status = 'ronin'; } }); if (captives.length > 0) { this.pendingPrisoners = captives; if (winnerClanId === this.playerClanId) this.ui.showPrisonerModal(captives); else this.autoResolvePrisoners(captives, winnerClanId); } }
    handlePrisonerAction(index, action) { const prisoner = this.pendingPrisoners[index]; if (action === 'hire') { const myBushos = this.bushos.filter(b=>b.clan===this.playerClanId); const recruiter = myBushos.find(b => b.isDaimyo) || myBushos[0]; const score = (recruiter.charm * 2.0) / (prisoner.loyalty * 1.5); if (prisoner.isDaimyo) alert(`${prisoner.name}「敵の軍門には下らぬ！」`); else if (score > Math.random()) { prisoner.clan = this.playerClanId; prisoner.loyalty = 50; const targetC = this.getCastle(prisoner.castleId); targetC.samuraiIds.push(prisoner.id); alert(`${prisoner.name}を登用しました！`); } else alert(`${prisoner.name}は登用を拒否しました...`); } else if (action === 'kill') { if (prisoner.isDaimyo) this.handleDaimyoDeath(prisoner); prisoner.status = 'dead'; prisoner.clan = 0; prisoner.castleId = 0; } else if (action === 'release') { prisoner.status = 'ronin'; prisoner.clan = 0; prisoner.castleId = 0; } this.pendingPrisoners.splice(index, 1); if (this.pendingPrisoners.length === 0) this.ui.closePrisonerModal(); else this.ui.showPrisonerModal(this.pendingPrisoners); }
    handleDaimyoDeath(daimyo) { const clanId = daimyo.clan; if(clanId === 0) return; const candidates = this.bushos.filter(b => b.clan === clanId && b.id !== daimyo.id && b.status !== 'dead' && b.status !== 'ronin'); if (candidates.length === 0) { const clanCastles = this.castles.filter(c => c.ownerClan === clanId); clanCastles.forEach(c => { c.ownerClan = 0; const lords = this.getCastleBushos(c.id); lords.forEach(l => { l.clan=0; l.status='ronin'; }); }); return; } if (clanId === this.playerClanId) this.ui.showSuccessionModal(candidates, (newLeaderId) => this.changeLeader(clanId, newLeaderId)); else { candidates.sort((a,b) => (b.politics + b.charm) - (a.politics + a.charm)); this.changeLeader(clanId, candidates[0].id); } }
    changeLeader(clanId, newLeaderId) { this.bushos.filter(b => b.clan === clanId).forEach(b => b.isDaimyo = false); const newLeader = this.getBusho(newLeaderId); if(newLeader) { newLeader.isDaimyo = true; this.clans.find(c => c.id === clanId).leaderId = newLeaderId; } }
    autoResolvePrisoners(captives, winnerClanId) { const aiBushos = this.bushos.filter(b => b.clan === winnerClanId); const leaderInt = Math.max(...aiBushos.map(b => b.intelligence)); captives.forEach(p => { if (p.isDaimyo) { this.handleDaimyoDeath(p); p.status = 'dead'; p.clan = 0; p.castleId = 0; return; } if ((leaderInt / 100) > Math.random()) { p.clan = winnerClanId; p.loyalty = 50; return; } if (p.charm > 60) { p.status = 'ronin'; p.clan = 0; p.castleId = 0; } else { p.status = 'dead'; p.clan = 0; p.castleId = 0; } }); }
    saveGameToFile() { const data = { year: this.year, month: this.month, castles: this.castles, bushos: this.bushos, playerClanId: this.playerClanId, relations: this.relations }; const blob = new Blob([JSON.stringify(data, null, 2)], {type: 'application/json'}); const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = `sengoku_save_${this.year}_${this.month}.json`; a.click(); URL.revokeObjectURL(url); }
    loadGameFromFile(e) { const file = e.target.files[0]; if (!file) return; const reader = new FileReader(); reader.onload = (evt) => { try { const d = JSON.parse(evt.target.result); this.year = d.year; this.month = d.month; this.playerClanId = d.playerClanId || 1; this.castles = d.castles.map(c => new Castle(c)); this.bushos = d.bushos.map(b => new Busho(b)); if(d.relations) this.relations = d.relations; document.getElementById('title-screen').classList.add('hidden'); document.getElementById('app').classList.remove('hidden'); this.startMonth(); alert("ロードしました"); } catch(err) { alert("セーブデータの読み込みに失敗しました"); } }; reader.readAsText(file); }
}

window.onload = () => { window.GameApp = new GameManager(); };