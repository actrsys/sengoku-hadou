/**
 * 戦国シミュレーションゲーム - 完全版 v4.0
 * * 【修正履歴】
 * - バグ修正: 出陣/軍師任命等の武将選択不具合 (isMulti判定修正)
 * - バグ修正: 他大名ステータス隠蔽 (isDaimyoかつPlayerClanのみ表示)
 * - 機能追加: 褒美コマンド (金で忠誠up、相性により変動)
 * - 機能改善: 面談ループ (戻るボタンで会話選択へ)
 * - 機能改善: 自分語り (大名自身のステータスや状況により反応変化)
 * - スマホ対応: 上部固定情報パネル、下部コマンド、マップ拡大縮小
 * - UI改善: 12段階評価の視認性向上
 */

/* ==========================================================================
   ★ シナリオ定義
   ========================================================================== */
const SCENARIOS = [
    { name: "群雄割拠 (1560年)", desc: "各地で有力大名が覇を競う標準シナリオ。", folder: "1560_okehazama" }
];

/* ==========================================================================
   ★ ゲームバランス設定
   ========================================================================== */
const GAME_SETTINGS = {
    StartYear: 1560,
    StartMonth: 1,
    System: { UseRandomNames: true },
    Economy: {
        IncomeGoldRate: 0.5, IncomeRiceRate: 10.0, IncomeFluctuation: 0.15,
        ConsumeRicePerSoldier: 0.05, ConsumeGoldPerBusho: 50,
        BaseDevelopment: 10, PoliticsEffect: 0.6, DevelopFluctuation: 0.15,
        BaseRepair: 20, RepairEffect: 0.6, RepairFluctuation: 0.15,
        BaseCharity: 10, CharmEffect: 0.4, CharityFluctuation: 0.15,
        TradeRateMin: 0.5, TradeRateMax: 3.0, TradeFluctuation: 0.15
    },
    Military: {
        DraftBase: 50, DraftStatBonus: 1.5, DraftPopBonusFactor: 0.00005, DraftFluctuation: 0.15,
        BaseTraining: 0, TrainingLdrEffect: 0.3, TrainingStrEffect: 0.2, TrainingFluctuation: 0.15,
        BaseMorale: 0, MoraleLdrEffect: 0.2, MoraleCharmEffect: 0.2, MoraleFluctuation: 0.2,
        WarMaxRounds: 10, DamageSoldierPower: 0.05, WallDefenseEffect: 0.5, DamageFluctuation: 0.2,
        UnitTypeBonus: { BowAttack: 0.6, SiegeAttack: 1.0, ChargeAttack: 1.2, WallDamageRate: 0.5 },
        FactionBonus: 1.1, FactionPenalty: 0.8
    },
    Strategy: {
        InvestigateDifficulty: 50, InciteFactor: 150, RumorFactor: 50, SchemeSuccessRate: 0.6, EmploymentDiff: 1.5,
        HeadhuntBaseDiff: 50, HeadhuntGoldEffect: 0.01, HeadhuntGoldMaxEffect: 15,
        HeadhuntIntWeight: 0.8, HeadhuntLoyaltyWeight: 1.0, HeadhuntDutyWeight: 0.8,
        RewardBaseEffect: 10, RewardGoldFactor: 0.1, RewardDistancePenalty: 0.2,
        AffinityLordWeight: 0.5, AffinityNewLordWeight: 0.6, AffinityDoerWeight: 0.4
    },
    AI: {
        Aggressiveness: 1.5, SoliderSendRate: 0.8,
        AbilityBase: 50, AbilitySensitivity: 2.0,
        GunshiBiasFactor: 0.5, GunshiFairnessFactor: 0.01,
        WarHighIntThreshold: 80,
        DiplomacyChance: 0.3, GoodwillThreshold: 40, AllianceThreshold: 70, BreakAllianceDutyFactor: 0.5
    }
};

/* ==========================================================================
   ゲームエンジン本体
   ========================================================================== */

class DataManager {
    static genericNames = { surnames: [], names: [] };
    static async loadAll(folderName) {
        const path = `./data/${folderName}/`;
        try {
            if (GAME_SETTINGS.System.UseRandomNames) {
                try {
                    const namesText = await this.fetchText("./generico_fficer.csv");
                    this.parseGenericNames(namesText);
                } catch (e) {}
            }
            const [clansText, castlesText, bushosText] = await Promise.all([
                this.fetchText(path + "clans.csv"),
                this.fetchText(path + "castles.csv"),
                this.fetchText(path + "warriors.csv")
            ]);
            const clans = this.parseCSV(clansText, Clan);
            const castles = this.parseCSV(castlesText, Castle);
            const bushos = this.parseCSV(bushosText, Busho);
            this.joinData(clans, castles, bushos);
            if (bushos.length < 50) this.generateGenericBushos(bushos, castles, clans);
            return { clans, castles, bushos };
        } catch (error) {
            console.error(error);
            throw new Error(`データの読み込みに失敗しました。`);
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
            if (b.clan === 0) b.status = 'ronin';
            const c = castles.find(castle => castle.id === b.castleId);
            if(c) c.samuraiIds.push(b.id);
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
    static parseGenericNames(text) {
        const lines = text.split('\n').map(l => l.trim()).filter(l => l);
        if (lines.length < 2) return;
        for (let i = 1; i < lines.length; i++) {
            const [surname, name] = lines[i].split(',');
            if (surname) this.genericNames.surnames.push(surname);
            if (name) this.genericNames.names.push(name);
        }
    }
    static generateGenericBushos(bushos, castles, clans) {
        let idCounter = 90000;
        const personalities = ['aggressive', 'cautious', 'balanced'];
        const useRandom = GAME_SETTINGS.System.UseRandomNames && this.genericNames.surnames.length > 0;
        clans.forEach(clan => {
            const clanCastles = castles.filter(c => c.ownerClan === clan.id);
            if(clanCastles.length === 0) return;
            for(let i=0; i<3; i++) {
                const castle = clanCastles[Math.floor(Math.random() * clanCastles.length)];
                const p = personalities[Math.floor(Math.random() * personalities.length)];
                let bName = `武将${String.fromCharCode(65+i)}`;
                if (useRandom) {
                    const s = this.genericNames.surnames[Math.floor(Math.random() * this.genericNames.surnames.length)];
                    const n = this.genericNames.names[Math.floor(Math.random() * this.genericNames.names.length)];
                    bName = `${s}${n}`;
                }
                bushos.push(new Busho({
                    id: idCounter++, name: bName, 
                    strength: 30+Math.floor(Math.random()*40), leadership: 30+Math.floor(Math.random()*40), 
                    politics: 30+Math.floor(Math.random()*40), diplomacy: 30+Math.floor(Math.random()*40), 
                    intelligence: 30+Math.floor(Math.random()*40), charm: 30+Math.floor(Math.random()*40), 
                    loyalty: 80, duty: 30+Math.floor(Math.random()*60),
                    innovation: Math.floor(Math.random() * 100), cooperation: Math.floor(Math.random() * 100),
                    clan: clan.id, castleId: castle.id, isCastellan: false, 
                    personality: p, ambition: 30+Math.floor(Math.random()*40), affinity: Math.floor(Math.random()*100)
                }));
                castle.samuraiIds.push(idCounter-1);
            }
        });
    }
}

class Clan { 
    constructor(data) { Object.assign(this, data); } 
    getArmyName() { return this.name.replace(/家$/, "") + "軍"; }
}

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
        if(this.duty === undefined) this.duty = 50; if(this.leadership === undefined) this.leadership = this.strength;
        if(this.innovation === undefined) this.innovation = Math.min(100, Math.max(0, 50 + (this.intelligence - 50) * 0.5 + (Math.random() * 40 - 20))); 
        if(this.cooperation === undefined) this.cooperation = Math.min(100, Math.max(0, 50 + (this.charm - 50) * 0.5 + (Math.random() * 40 - 20)));
        this.isDaimyo = false; this.isGunshi = false; this.isCastellan = false;
        if(this.clan === 0 && !this.status) this.status = 'ronin';
    }
    getRankName() { if(this.isDaimyo) return "大名"; if(this.clan === 0) return "在野"; if(this.isGunshi) return "軍師"; if(this.isCastellan) return "城主"; return "一般"; }
    getFactionName() {
        if (this.innovation >= 70) return "革新派";
        if (this.innovation <= 30) return "保守派";
        return "中道派";
    }
}
class Castle {
    constructor(data) {
        Object.assign(this, data); this.samuraiIds = this.samuraiIds || [];
        this.maxDefense = (data.defense || 500) * 2; this.maxKokudaka = (data.kokudaka || 500) * 2; this.maxCommerce = (data.commerce || 500) * 2;
        this.maxLoyalty = 1000; this.isDone = false;
        if(this.loyalty === undefined) this.loyalty = 500; if(this.population === undefined) this.population = 10000;
        if(this.training === undefined) this.training = 50; if(this.morale === undefined) this.morale = 50;
        this.investigatedUntil = 0;
        this.investigatedAccuracy = 0;
    }
}

class GameSystem {
    static seededRandom(seed) { let x = Math.sin(seed++) * 10000; return x - Math.floor(x); }
    static applyVariance(val, fluctuation) {
        if (!fluctuation || fluctuation === 0) return Math.floor(val);
        const min = 1.0 - fluctuation; const max = 1.0 + fluctuation;
        const rate = min + Math.random() * (max - min);
        return Math.floor(val * rate);
    }
    static getAISmartness(attributeVal) {
        const base = GAME_SETTINGS.AI.AbilityBase;
        const diff = attributeVal - base; 
        const factor = GAME_SETTINGS.AI.AbilitySensitivity * 0.01; 
        let prob = 0.5 + (diff * factor); 
        return Math.max(0.1, Math.min(0.95, prob)); 
    }

    static toGradeHTML(val) {
        let rank = "", cls = "";
        if (val >= 96) { rank = "S+"; cls = "rank-s"; }
        else if (val >= 90) { rank = "S"; cls = "rank-s"; }
        else if (val >= 85) { rank = "A+"; cls = "rank-a"; }
        else if (val >= 80) { rank = "A"; cls = "rank-a"; }
        else if (val >= 75) { rank = "B+"; cls = "rank-b"; }
        else if (val >= 70) { rank = "B"; cls = "rank-b"; }
        else if (val >= 65) { rank = "C+"; cls = "rank-c"; }
        else if (val >= 60) { rank = "C"; cls = "rank-c"; }
        else if (val >= 55) { rank = "D+"; cls = "rank-d"; }
        else if (val >= 50) { rank = "D"; cls = "rank-d"; }
        else if (val >= 40) { rank = "E+"; cls = "rank-e"; }
        else { rank = "E"; cls = "rank-e"; }
        return `<span class="grade-rank ${cls}">${rank}</span>`;
    }

    // playerClanIdを受け取り、プレイヤーの大名かどうか判定する
    static getPerceivedStatValue(target, statName, gunshi, castleAccuracy, playerClanId) {
        // 修正: プレイヤー大名のみ正確、他大名は隠す
        if (target.isDaimyo && target.clan === playerClanId) return target[statName];

        const realVal = target[statName];
        if (castleAccuracy !== null) {
            const maxErr = 30 * (1.0 - (castleAccuracy / 100)); 
            const err = (Math.random() - 0.5) * 2 * maxErr;
            return Math.max(1, Math.min(100, Math.floor(realVal + err)));
        }
        if (!gunshi) return null;
        
        const dist = this.calcValueDistance(target, gunshi);
        let rawBias = dist * GAME_SETTINGS.AI.GunshiBiasFactor;
        const fairness = (gunshi.duty + gunshi.loyalty) * GAME_SETTINGS.AI.GunshiFairnessFactor;
        const mitigation = Math.min(1.0, fairness);
        const finalBias = rawBias * (1.0 - mitigation);
        return Math.max(1, Math.floor(realVal - finalBias));
    }

    static getDisplayStatHTML(target, statName, gunshi, castleAccuracy = null, playerClanId = 0) {
        if (target.isDaimyo && target.clan === playerClanId) return this.toGradeHTML(target[statName]); 

        if (castleAccuracy !== null) {
            const pVal = this.getPerceivedStatValue(target, statName, null, castleAccuracy, playerClanId);
            return this.toGradeHTML(pVal);
        }
        if (!gunshi) return "？";
        
        const pVal = this.getPerceivedStatValue(target, statName, gunshi, null, playerClanId);
        return this.toGradeHTML(pVal);
    }

    static calcDevelopment(busho) { const base = GAME_SETTINGS.Economy.BaseDevelopment + (busho.politics * GAME_SETTINGS.Economy.PoliticsEffect); return this.applyVariance(base, GAME_SETTINGS.Economy.DevelopFluctuation); }
    static calcRepair(busho) { const base = GAME_SETTINGS.Economy.BaseRepair + (busho.politics * GAME_SETTINGS.Economy.RepairEffect); return this.applyVariance(base, GAME_SETTINGS.Economy.RepairFluctuation); }
    static calcCharity(busho, type) { let val = GAME_SETTINGS.Economy.BaseCharity + (busho.charm * GAME_SETTINGS.Economy.CharmEffect); if (type === 'both') val = val * 1.5; return this.applyVariance(val, GAME_SETTINGS.Economy.CharityFluctuation); }
    static calcTraining(busho) { const base = GAME_SETTINGS.Military.BaseTraining + (busho.leadership * GAME_SETTINGS.Military.TrainingLdrEffect + busho.strength * GAME_SETTINGS.Military.TrainingStrEffect); return this.applyVariance(base, GAME_SETTINGS.Military.TrainingFluctuation); }
    static calcSoldierCharity(busho) { const base = GAME_SETTINGS.Military.BaseMorale + (busho.leadership * GAME_SETTINGS.Military.MoraleLdrEffect) + (busho.charm * GAME_SETTINGS.Military.MoraleCharmEffect); return this.applyVariance(base, GAME_SETTINGS.Military.MoraleFluctuation); }
    static calcDraftFromGold(gold, busho, castlePopulation) { const bonus = 1.0 + ((busho.leadership + busho.strength + busho.charm) / 300) * (GAME_SETTINGS.Military.DraftStatBonus - 1.0); const popBonus = 1.0 + (castlePopulation * GAME_SETTINGS.Military.DraftPopBonusFactor); return Math.floor(gold * 1.0 * bonus * popBonus); }
    static isAdjacent(c1, c2) { return (Math.abs(c1.x - c2.x) + Math.abs(c1.y - c2.y)) === 1; }
    static calcWeightedAvg(currVal, currNum, newVal, newNum) { if(currNum + newNum === 0) return currVal; return Math.floor(((currVal * currNum) + (newVal * newNum)) / (currNum + newNum)); }
    
    static calcUnitStats(bushos) { 
        if (!bushos || bushos.length === 0) return { ldr:30, str:30, int:30, charm:30 }; 
        const sorted = [...bushos].sort((a,b) => b.leadership - a.leadership); 
        const leader = sorted[0]; const subs = sorted.slice(1); 
        let totalLdr = leader.leadership; let totalStr = leader.strength; let totalInt = leader.intelligence; 
        let factionBonusMultiplier = 1.0;
        if (subs.length > 0) {
            const leaderFaction = leader.getFactionName();
            let sameFactionCount = 0; let oppFactionCount = 0; 
            subs.forEach(b => { 
                totalLdr += b.leadership * 0.2; totalStr += b.strength * 0.2; totalInt += b.intelligence * 0.2; 
                const f = b.getFactionName();
                if (f === leaderFaction) sameFactionCount++;
                else if ((leaderFaction === "革新派" && f === "保守派") || (leaderFaction === "保守派" && f === "革新派")) oppFactionCount++;
            });
            if (oppFactionCount > 0) factionBonusMultiplier = GAME_SETTINGS.Military.FactionPenalty;
            else if (sameFactionCount === subs.length) factionBonusMultiplier = GAME_SETTINGS.Military.FactionBonus;
        }
        return { ldr: Math.floor(totalLdr * factionBonusMultiplier), str: Math.floor(totalStr * factionBonusMultiplier), int: Math.floor(totalInt * factionBonusMultiplier), charm: leader.charm }; 
    }
    
    static calcWarDamage(atkStats, defStats, atkSoldiers, defSoldiers, defWall, atkMorale, defTraining, type) {
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
        return { soldierDmg: Math.floor(baseDmg * soldierRate), wallDmg: Math.floor(baseDmg * wallRate * 0.5), risk: counterRisk };
    }
    
    static calcRetreatScore(castle) { return castle.soldiers + (castle.defense * 0.5) + (castle.gold * 0.1) + (castle.rice * 0.1) + (castle.samuraiIds.length * 100); }
    
    static calcInvestigate(bushos, targetCastle) {
        if (bushos.length === 0) return { success: false, accuracy: 0 };
        const maxStr = Math.max(...bushos.map(b => b.strength));
        const maxInt = Math.max(...bushos.map(b => b.intelligence));
        const difficulty = 30 + Math.random() * GAME_SETTINGS.Strategy.InvestigateDifficulty;
        const isSuccess = maxStr > difficulty;
        let accuracy = 0;
        if (isSuccess) accuracy = Math.min(100, Math.max(10, (maxInt * 0.8) + (Math.random() * 20)));
        return { success: isSuccess, accuracy: Math.floor(accuracy) };
    }

    static calcIncite(busho) { const score = (busho.intelligence * 0.7) + (busho.strength * 0.3); const success = Math.random() < (score / GAME_SETTINGS.Strategy.InciteFactor); if(!success) return { success: false, val: 0 }; return { success: true, val: Math.floor(score * 2) }; }
    static calcRumor(busho, targetBusho) { const score = (busho.intelligence * 0.7) + (busho.strength * 0.3); const defScore = (targetBusho.intelligence * 0.5) + (targetBusho.loyalty * 0.5); const success = Math.random() < (score / (defScore + GAME_SETTINGS.Strategy.RumorFactor)); if(!success) return { success: false, val: 0 }; return { success: true, val: Math.floor(20 + Math.random()*20) }; }
    static calcAffinityDiff(a, b) { const diff = Math.abs(a - b); return Math.min(diff, 100 - diff); }
    static calcValueDistance(a, b) {
        const diffInno = Math.abs(a.innovation - b.innovation);
        const coopFactor = (a.cooperation + b.cooperation) / 200; 
        let dist = diffInno * (1.0 - (coopFactor * 0.5)); 
        const classicAff = this.calcAffinityDiff(a.affinity, b.affinity); 
        return Math.floor(dist * 0.8 + classicAff * 0.4); 
    }
    static calcRewardEffect(gold, daimyo, target) {
        const S = GAME_SETTINGS.Strategy;
        const dist = this.calcValueDistance(daimyo, target);
        let penalty = dist * S.RewardDistancePenalty;
        let baseIncrease = S.RewardBaseEffect + (gold * S.RewardGoldFactor);
        let actualIncrease = baseIncrease - penalty;
        if (actualIncrease < 0) actualIncrease = 0;
        return Math.floor(actualIncrease);
    }
    static calcHeadhunt(doer, target, gold, targetLord, newLord) {
        const S = GAME_SETTINGS.Strategy;
        const goldEffect = Math.min(S.HeadhuntGoldMaxEffect, gold * S.HeadhuntGoldEffect);
        const offense = (doer.intelligence * S.HeadhuntIntWeight) + goldEffect;
        const defense = (target.loyalty * S.HeadhuntLoyaltyWeight) + (target.duty * S.HeadhuntDutyWeight) + S.HeadhuntBaseDiff;
        const affLord = this.calcAffinityDiff(target.affinity, targetLord.affinity); 
        const lordBonus = (50 - affLord) * S.AffinityLordWeight; 
        const affNew = this.calcAffinityDiff(target.affinity, newLord.affinity);
        const newBonus = (50 - affNew) * S.AffinityNewLordWeight; 
        const affDoer = this.calcAffinityDiff(target.affinity, doer.affinity);
        const doerBonus = (50 - affDoer) * S.AffinityDoerWeight; 
        const totalOffense = offense + newBonus + doerBonus;
        const totalDefense = defense + lordBonus;
        const successRate = (totalOffense / totalDefense) * 0.5; 
        return Math.random() < successRate;
    }
    static calcScheme(atkBusho, defBusho, defCastleLoyalty) { const atkInt = atkBusho.intelligence; const defInt = defBusho ? defBusho.intelligence : 30; const successRate = (atkInt / (defInt + 20)) * GAME_SETTINGS.Strategy.SchemeSuccessRate; if (Math.random() > successRate) return { success: false, damage: 0 }; const loyaltyBonus = (1000 - defCastleLoyalty) / 500; return { success: true, damage: Math.floor(atkInt * 10 * (1.0 + loyaltyBonus)) }; }
    static calcFire(atkBusho, defBusho) { const atkInt = atkBusho.intelligence; const defInt = defBusho ? defBusho.intelligence : 30; const successRate = (atkInt / (defInt + 10)) * 0.5; if (Math.random() > successRate) return { success: false, damage: 0 }; return { success: true, damage: Math.floor(atkInt * 5 * (Math.random() + 0.5)) }; }
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
        this.mapEl = document.getElementById('map-container'); this.panelEl = document.getElementById('control-panel'); // sidebar
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
        this.mobileTopBar = document.getElementById('mobile-top-bar'); // スマホ用上部バー
        this.mapResetZoomBtn = document.getElementById('map-reset-zoom'); // マップ縮小ボタン

        this.resultModal.addEventListener('click', (e) => { if (e.target === this.resultModal) this.closeResultModal(); });
        document.getElementById('load-file-input').addEventListener('change', (e) => this.game.loadGameFromFile(e));
        
        const backBtn = document.querySelector('#selector-modal .btn-secondary');
        if(backBtn) backBtn.onclick = () => this.closeSelector();

        // マップクリックでズーム (スマホのみ)
        this.mapEl.addEventListener('click', (e) => {
            if(window.innerWidth <= 768 && e.target === this.mapEl) {
                this.mapEl.classList.add('zoomed');
                this.mapResetZoomBtn.classList.remove('hidden');
            }
        });
        
        // 縮小ボタン
        this.mapResetZoomBtn.onclick = () => {
            this.mapEl.classList.remove('zoomed');
            this.mapResetZoomBtn.classList.add('hidden');
        };
    }
    log(msg) { const div = document.createElement('div'); div.textContent = msg; this.logEl.prepend(div); }
    showResultModal(msg) { this.resultBody.innerHTML = msg.replace(/\n/g, '<br>'); this.resultModal.classList.remove('hidden'); }
    closeResultModal() { this.resultModal.classList.add('hidden'); }
    showCutin(msg) { this.cutinMessage.textContent = msg; this.cutinOverlay.classList.remove('hidden'); this.cutinOverlay.classList.add('fade-in'); setTimeout(() => { this.cutinOverlay.classList.remove('fade-in'); this.cutinOverlay.classList.add('fade-out'); setTimeout(() => { this.cutinOverlay.classList.add('hidden'); this.cutinOverlay.classList.remove('fade-out'); }, 500); }, 2000); }
    
    showScenarioSelection(scenarios, onSelect) {
        this.scenarioScreen.classList.remove('hidden'); this.scenarioList.innerHTML = '';
        scenarios.forEach(s => {
            const div = document.createElement('div'); div.className = 'scenario-item';
            div.innerHTML = `<div class="scenario-title">${s.name}</div><div class="scenario-desc">${s.desc}</div>`;
            div.onclick = () => { this.scenarioScreen.classList.add('hidden'); onSelect(s.folder); };
            this.scenarioList.appendChild(div);
        });
    }
    returnToTitle() { this.scenarioScreen.classList.add('hidden'); document.getElementById('title-screen').classList.remove('hidden'); }
    showStartScreen(clans, onSelect) { this.startScreen.classList.remove('hidden'); const container = document.getElementById('clan-selector'); container.innerHTML = ''; clans.forEach(clan => { const btn = document.createElement('div'); btn.className = 'clan-btn'; btn.textContent = clan.name; btn.style.color = clan.color; btn.style.borderColor = clan.color; btn.onclick = () => { this.startScreen.classList.add('hidden'); onSelect(clan.id); }; container.appendChild(btn); }); }
    
    renderMap() {
        this.mapEl.innerHTML = ''; document.getElementById('date-display').textContent = `${this.game.year}年 ${this.game.month}月`;
        
        const isSelectionMode = (this.game.selectionMode !== null);
        if(isSelectionMode) this.mapGuide.classList.remove('hidden'); else this.mapGuide.classList.add('hidden');
        if (this.game.isProcessingAI) this.aiGuard.classList.remove('hidden'); else this.aiGuard.classList.add('hidden');

        this.game.castles.forEach(c => {
            const el = document.createElement('div'); el.className = 'castle-card';
            el.dataset.clan = c.ownerClan; el.style.setProperty('--c-x', c.x + 1); el.style.setProperty('--c-y', c.y + 1);
            if (c.isDone) el.classList.add('done'); if (this.game.getCurrentTurnCastle() === c && !c.isDone) el.classList.add('active-turn');
            const castellan = this.game.getBusho(c.castellanId); const clanData = this.game.clans.find(cl => cl.id === c.ownerClan);
            const isVisible = this.game.isCastleVisible(c);
            const soldierText = isVisible ? c.soldiers : "???"; const castellanName = isVisible ? (castellan ? castellan.name : '-') : "???";
            el.innerHTML = `<div class="card-header"><h3>${c.name}</h3></div><div class="card-owner">${clanData ? clanData.name : "中立"}</div><div class="param-grid"><div class="param-item"><span>城主</span> <strong>${castellanName}</strong></div><div class="param-item"><span>兵数</span> ${soldierText}</div></div>`;
            if(clanData) el.style.borderTop = `5px solid ${clanData.color}`;
            if (!this.game.isProcessingAI) {
                if (isSelectionMode) { if (this.game.validTargets.includes(c)) { el.classList.add('selectable-target'); el.onclick = () => this.game.resolveMapSelection(c); } else { el.style.opacity = '0.4'; }
                } else { el.onclick = () => {
                    if(window.innerWidth <= 768 && !this.mapEl.classList.contains('zoomed')) {
                        this.mapEl.classList.add('zoomed');
                        this.mapResetZoomBtn.classList.remove('hidden');
                    } else {
                        this.showCastleInfo(c);
                    }
                };}
            } else { el.style.cursor = 'default'; }
            this.mapEl.appendChild(el);
        });
    }
    showControlPanel(castle) { this.currentCastle = castle; this.panelEl.classList.remove('hidden'); this.updatePanelHeader(); this.menuState = 'MAIN'; this.renderCommandMenu(); }
    
    // パネルヘッダー更新 (スマホレイアウト対応)
    updatePanelHeader() { 
        if (!this.currentCastle) return; 
        const c = this.currentCastle; 
        const clanData = this.game.clans.find(cd => cd.id === c.ownerClan); 
        const castellan = this.game.getBusho(c.castellanId);
        
        // PC用更新
        document.getElementById('panel-title').textContent = c.name; 
        document.getElementById('panel-clan').textContent = clanData ? clanData.name : "--"; 
        
        const createRow = (label, val, max = null) => { let html = `<div class="status-row"><div class="status-label">${label}</div><div class="status-value">${val}${max ? '<span class="status-max">/' + max + '</span>' : ''}</div></div>`; if (max) { const pct = Math.min(100, Math.floor((val / max) * 100)); html += `<div class="progress-bar"><div class="progress-fill" style="width:${pct}%"></div></div>`; } return html; }; 
        let html = ""; 
        html += createRow("金", c.gold); html += createRow("兵糧", c.rice); html += createRow("兵士", c.soldiers); html += createRow("人口", c.population); html += createRow("民忠", c.loyalty, 1000); html += createRow("防御", c.defense, c.maxDefense); html += createRow("石高", c.kokudaka, c.maxKokudaka); html += createRow("商業", c.commerce, c.maxCommerce); html += createRow("訓練", c.training, 120); html += createRow("士気", c.morale, 120); 
        this.statusContainer.innerHTML = html; 

        // スマホ用更新 (指定レイアウト)
        // 1段目: 家名、城名、城主
        // 2段目: 金、商業、民忠
        // 3段目: 兵糧、石高、防御
        // 4段目: 兵士、訓練、士気
        // 5段目: 米相場、人口 (小さめ)
        const mHtml = `
            <div class="mobile-status-row" style="background:#eee; font-weight:bold;">
                <span>${clanData ? clanData.name : "--"}</span>
                <span>${c.name}</span>
                <span>${castellan ? castellan.name : "-"}</span>
            </div>
            <div class="mobile-status-row">
                <span>金:<span class="status-highlight">${c.gold}</span></span>
                <span>商:${c.commerce}</span>
                <span>忠:${c.loyalty}</span>
            </div>
            <div class="mobile-status-row">
                <span>糧:<span class="status-highlight">${c.rice}</span></span>
                <span>石:${c.kokudaka}</span>
                <span>防:${c.defense}</span>
            </div>
            <div class="mobile-status-row">
                <span>兵:<span class="status-highlight">${c.soldiers}</span></span>
                <span>練:${c.training}</span>
                <span>気:${c.morale}</span>
            </div>
            <div class="mobile-status-row status-small">
                <span>相場:${this.game.marketRate.toFixed(2)}</span>
                <span>人口:${c.population}</span>
            </div>
        `;
        this.mobileTopBar.innerHTML = mHtml;
    }

    renderCommandMenu() {
        this.cmdArea.innerHTML = '';
        const createEmpty = () => { const d = document.createElement('div'); this.cmdArea.appendChild(d); };
        const createBtn = (label, cls, onClick) => { const btn = document.createElement('button'); btn.className = `cmd-btn ${cls || ''}`; btn.textContent = label; btn.onclick = onClick; this.cmdArea.appendChild(btn); };
        
        if (this.menuState === 'MAIN') {
            createBtn("開発", "category", () => { this.menuState = 'DEVELOP'; this.renderCommandMenu(); });
            createBtn("軍事", "category", () => { this.menuState = 'MILITARY'; this.renderCommandMenu(); });
            createBtn("外交", "category", () => { this.menuState = 'DIPLOMACY'; this.renderCommandMenu(); });
            createBtn("調略", "category", () => { this.menuState = 'STRATEGY'; this.renderCommandMenu(); });
            createBtn("人事", "category", () => { this.menuState = 'PERSONNEL'; this.renderCommandMenu(); });
            createBtn("機能", "category", () => { this.menuState = 'SYSTEM'; this.renderCommandMenu(); });
            createEmpty(); 
            createBtn("命令終了", "finish", () => this.game.finishTurn());
        } else if (this.menuState === 'DEVELOP') {
            createBtn("石高開発", "", () => this.openBushoSelector('farm')); createBtn("商業開発", "", () => this.openBushoSelector('commerce')); createBtn("施し", "", () => this.openBushoSelector('charity')); createEmpty(); createEmpty(); createEmpty(); createEmpty(); 
            createBtn("戻る", "back", () => { this.menuState = 'MAIN'; this.renderCommandMenu(); });
        } else if (this.menuState === 'MILITARY') {
            createBtn("出陣", "", () => this.game.enterMapSelection('war')); createBtn("徴兵", "", () => this.openBushoSelector('draft')); createBtn("城壁修復", "", () => this.openBushoSelector('repair')); createBtn("訓練", "", () => this.openBushoSelector('training')); createBtn("兵施し", "", () => this.openBushoSelector('soldier_charity')); createBtn("輸送", "", () => this.game.enterMapSelection('transport')); createEmpty();
            createBtn("戻る", "back", () => { this.menuState = 'MAIN'; this.renderCommandMenu(); });
        } else if (this.menuState === 'STRATEGY') {
            createBtn("調査", "", () => this.game.enterMapSelection('investigate')); createBtn("扇動", "", () => this.game.enterMapSelection('incite')); createBtn("流言", "", () => this.game.enterMapSelection('rumor')); 
            createBtn("引抜", "", () => this.game.enterMapSelection('headhunt_select_castle'));
            createBtn("兵糧購入", "", () => this.openQuantitySelector('buy_rice')); createBtn("兵糧売却", "", () => this.openQuantitySelector('sell_rice')); createEmpty(); createBtn("戻る", "back", () => { this.menuState = 'MAIN'; this.renderCommandMenu(); });
        } else if (this.menuState === 'DIPLOMACY') {
            createBtn("親善", "", () => this.game.enterMapSelection('goodwill')); createBtn("同盟", "", () => this.game.enterMapSelection('alliance')); createBtn("同盟解消", "", () => this.game.enterMapSelection('break_alliance')); createEmpty(); createEmpty(); createEmpty(); createEmpty(); createBtn("戻る", "back", () => { this.menuState = 'MAIN'; this.renderCommandMenu(); });
        } else if (this.menuState === 'PERSONNEL') {
            createBtn("軍師任命", "", () => this.openBushoSelector('appoint_gunshi', null, {allowDone: true}));
            createBtn("城主任命", "", () => this.openBushoSelector('appoint', null, {allowDone: true})); 
            createBtn("面談", "", () => this.openBushoSelector('interview', null, {allowDone: true}));
            createBtn("褒美", "", () => this.openBushoSelector('reward'));
            createBtn("登用", "", () => this.openBushoSelector('employ_target')); 
            createBtn("移動", "", () => this.game.enterMapSelection('move')); 
            createBtn("追放", "", () => this.openBushoSelector('banish')); 
            createBtn("戻る", "back", () => { this.menuState = 'MAIN'; this.renderCommandMenu(); });
        } else if (this.menuState === 'SYSTEM') {
            createBtn("ファイル保存", "", () => window.GameApp.saveGameToFile()); createBtn("ファイル読込", "", () => document.getElementById('load-file-input').click()); createEmpty(); createEmpty(); createEmpty(); createEmpty(); createEmpty(); createBtn("戻る", "back", () => { this.menuState = 'MAIN'; this.renderCommandMenu(); });
        }
    }
    cancelMapSelection() { this.game.selectionMode = null; this.game.validTargets = []; this.renderMap(); this.menuState = 'MAIN'; this.renderCommandMenu(); }
    showGunshiAdvice(action, onConfirm) {
        if (['farm','commerce','repair','draft','charity','transport','appoint_gunshi','appoint','banish','training','soldier_charity','buy_rice','sell_rice','interview','reward'].includes(action.type)) { onConfirm(); return; }
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
        
        const gunshi = this.game.getClanGunshi(this.game.playerClanId);
        
        if (actionType === 'appoint_gunshi') { bushos = this.game.bushos.filter(b => b.clan === this.game.playerClanId && !b.isDaimyo && !b.isCastellan && b.status !== 'ronin' && b.status !== 'dead'); infoHtml = "<div>軍師に任命する武将を選択してください (知略重視)</div>"; sortKey = 'intelligence'; sortLabel = '知略'; } 
        else if (actionType === 'employ_target') { bushos = this.game.getCastleBushos(c.id).filter(b => b.status === 'ronin'); infoHtml = "<div>登用する在野武将を選択してください</div>"; sortKey = 'strength'; sortLabel = '武力'; } 
        else if (actionType === 'employ_doer') { bushos = this.game.getCastleBushos(c.id).filter(b => b.status !== 'ronin'); infoHtml = "<div>登用を行う担当官を選択してください (魅力重視)</div>"; sortKey = 'charm'; sortLabel = '魅力'; } 
        else if (actionType === 'diplomacy_doer') { bushos = this.game.getCastleBushos(c.id).filter(b => b.status !== 'ronin'); infoHtml = "<div>外交の担当官を選択してください (外交重視)</div>"; sortKey = 'diplomacy'; sortLabel = '外交'; }
        else if (actionType === 'rumor_target_busho') { bushos = this.game.getCastleBushos(targetId).filter(b => b.status !== 'ronin'); infoHtml = "<div>流言の対象とする武将を選択してください</div>"; sortKey = 'loyalty'; sortLabel = '忠誠'; }
        else if (actionType === 'rumor_doer') { bushos = this.game.getCastleBushos(c.id).filter(b => b.status !== 'ronin'); infoHtml = "<div>流言を実行する担当官を選択してください</div>"; sortKey = 'intelligence'; sortLabel = '知略'; }
        else if (actionType === 'incite_doer') { bushos = this.game.getCastleBushos(c.id).filter(b => b.status !== 'ronin'); infoHtml = "<div>扇動を実行する担当官を選択してください</div>"; sortKey = 'intelligence'; sortLabel = '知略'; }
        else if (actionType === 'headhunt_target') { bushos = this.game.getCastleBushos(targetId).filter(b => b.status !== 'ronin' && !b.isDaimyo); infoHtml = "<div>引抜の対象とする武将を選択してください (忠誠・義理重視)</div>"; sortKey = 'loyalty'; sortLabel = '忠誠'; }
        else if (actionType === 'headhunt_doer') { bushos = this.game.getCastleBushos(c.id).filter(b => b.status !== 'ronin'); infoHtml = "<div>引抜を実行する担当官を選択してください (知略重視)</div>"; sortKey = 'intelligence'; sortLabel = '知略'; }
        else if (actionType === 'interview') { bushos = this.game.getCastleBushos(c.id).filter(b => b.status !== 'ronin'); infoHtml = "<div>面談する武将を選択してください</div>"; sortKey = 'leadership'; sortLabel = '統率'; }
        else if (actionType === 'interview_target') { bushos = this.game.bushos.filter(b => b.status !== 'dead' && b.status !== 'ronin' && b.id !== extraData.interviewer.id); infoHtml = `<div>誰についての印象を聞きますか？</div>`; sortKey = 'leadership'; sortLabel = '統率'; }
        else if (actionType === 'reward') { bushos = this.game.getCastleBushos(c.id).filter(b => b.status !== 'ronin'); infoHtml = "<div>褒美を与える武将を選択してください</div>"; sortKey = 'loyalty'; sortLabel = '忠誠'; }
        else if (actionType === 'investigate_deploy') { bushos = this.game.getCastleBushos(c.id).filter(b => b.status !== 'ronin'); infoHtml = "<div>調査を行う武将を選択してください(複数可)<br>最高武力で成功判定、最高智謀で精度決定</div>"; sortKey = 'intelligence'; sortLabel = '知略'; isMulti = true; }
        else {
            bushos = this.game.getCastleBushos(c.id).filter(b => b.status !== 'ronin');
            // 修正: 配列内にあるかチェックで isMulti を立てる
            if (['farm','commerce','repair','draft','charity','training','soldier_charity','war_deploy','transport_deploy'].includes(actionType)) isMulti = true;
            
            if (actionType === 'farm') { infoHtml = `<div>金: ${c.gold} (1回500)</div>`; sortKey = 'politics'; sortLabel = '政治'; }
            else if (actionType === 'commerce') { infoHtml = `<div>金: ${c.gold} (1回500)</div>`; sortKey = 'politics'; sortLabel = '政治'; }
            else if (actionType === 'charity') { infoHtml = `<div>金: ${c.gold}, 米: ${c.rice} (1回300)</div>`; sortKey = 'charm'; sortLabel = '魅力'; }
            else if (actionType === 'repair') { infoHtml = `<div>金: ${c.gold} (1回300)</div>`; sortKey = 'politics'; sortLabel = '政治'; }
            else if (actionType === 'draft') { infoHtml = `<div>民忠: ${c.loyalty}</div>`; sortKey = 'leadership'; sortLabel = '統率'; }
            else if (actionType === 'training') { infoHtml = `<div>訓練度: ${c.training}/100</div>`; sortKey = 'leadership'; sortLabel = '統率'; }
            else if (actionType === 'soldier_charity') { infoHtml = `<div>士気: ${c.morale}/100</div>`; sortKey = 'leadership'; sortLabel = '統率'; }
            else if (actionType === 'war_deploy') { sortKey = 'strength'; sortLabel = '武力'; isMulti = true; }
            else if (actionType === 'move_deploy') { sortKey = 'strength'; sortLabel = '武力'; isMulti = true; }
            else if (actionType === 'appoint') { sortKey = 'leadership'; sortLabel = '統率'; }
        }
        contextEl.innerHTML = infoHtml;
        
        if (gunshi) {
            bushos.sort((a,b) => {
                const valA = GameSystem.getPerceivedStatValue(a, sortKey, gunshi, null, this.game.playerClanId) || 0;
                const valB = GameSystem.getPerceivedStatValue(b, sortKey, gunshi, null, this.game.playerClanId) || 0;
                return valB - valA;
            });
        } else {
            bushos.sort((a,b) => a.id - b.id);
        }

        if(!gunshi && bushos.length > 0) contextEl.innerHTML += "<div style='color:#f88; font-size:0.9em; margin-top:5px;'>※軍師不在のため能力不明</div>";

        const updateContextCost = () => { if (!isMulti) return; const checkedCount = document.querySelectorAll('input[name="sel_busho"]:checked').length; let cost = 0, item = ""; if (['farm','commerce'].includes(actionType)) { cost = checkedCount * 500; item = "金"; } if (['repair','charity'].includes(actionType)) { cost = checkedCount * 300; item = "金"; } if (actionType === 'draft') { contextEl.innerHTML = `<div>選択武将数: ${checkedCount} (コストは次の画面で決定)</div>`; return; } if (cost > 0) contextEl.innerHTML = `<div>消費予定 ${item}: ${cost} (所持: ${item==='金'?c.gold:c.rice})</div>`; };
        bushos.forEach(b => {
            if (actionType === 'banish' && b.isCastellan) return; if (actionType === 'employ_target' && b.isDaimyo) return;
            let isSelectable = !b.isActionDone; 
            if (extraData && extraData.allowDone) isSelectable = true; 
            if (actionType === 'employ_target' || actionType === 'appoint_gunshi' || actionType === 'rumor_target_busho' || actionType === 'headhunt_target' || actionType === 'interview_target' || actionType === 'reward') isSelectable = true;
            
            const getStat = (stat) => GameSystem.getDisplayStatHTML(b, stat, gunshi, null, this.game.playerClanId);

            const div = document.createElement('div'); div.className = `select-item ${!isSelectable ? 'disabled' : ''}`;
            const inputType = isMulti ? 'checkbox' : 'radio';
            div.innerHTML = `<input type="${inputType}" name="sel_busho" value="${b.id}" ${!isSelectable ? 'disabled' : ''} style="grid-column:1;"><span class="col-act" style="grid-column:2;">${b.isActionDone?'[済]':'[可]'}</span><span class="col-name" style="grid-column:3;">${b.name}</span><span class="col-rank" style="grid-column:4;">${b.getRankName()}</span><span class="col-stat" style="grid-column:5;">${getStat('leadership')}</span><span class="col-stat" style="grid-column:6;">${getStat('strength')}</span><span class="col-stat" style="grid-column:7;">${getStat('politics')}</span><span class="col-stat" style="grid-column:8;">${getStat('diplomacy')}</span><span class="col-stat" style="grid-column:9;">${getStat('intelligence')}</span><span class="col-stat" style="grid-column:10;">${getStat('charm')}</span>`;
            if(isSelectable) { div.onclick = (e) => { if(e.target.tagName !== 'INPUT') div.querySelector('input').click(); updateContextCost(); }; }
            this.selectorList.appendChild(div);
        });
        if (bushos.length === 0) this.selectorList.innerHTML = "<div style='padding:10px;'>対象となる武将がいません</div>";
        this.selectorConfirmBtn.onclick = () => {
            const inputs = document.querySelectorAll('input[name="sel_busho"]:checked'); if (inputs.length === 0) return;
            const selectedIds = Array.from(inputs).map(i => parseInt(i.value)); this.closeSelector();
            
            if (actionType === 'employ_target') this.openBushoSelector('employ_doer', null, { targetId: selectedIds[0] });
            else if (actionType === 'employ_doer') this.showGunshiAdvice({type: 'employ', targetId: extraData.targetId}, () => this.game.executeEmploy(selectedIds[0], extraData.targetId));
            
            else if (actionType === 'headhunt_target') this.openBushoSelector('headhunt_doer', null, { targetId: selectedIds[0] });
            else if (actionType === 'headhunt_doer') this.openQuantitySelector('headhunt_gold', selectedIds, extraData.targetId);
            
            else if (actionType === 'interview') { const interviewer = this.game.getBusho(selectedIds[0]); this.showInterviewModal(interviewer); }
            else if (actionType === 'interview_target') { const target = this.game.getBusho(selectedIds[0]); const interviewer = extraData.interviewer; this.game.executeInterviewTopic(interviewer, target); }
            else if (actionType === 'reward') this.openQuantitySelector('reward', selectedIds);
            
            else if (actionType === 'investigate_deploy') this.showGunshiAdvice({type:'investigate'}, () => this.game.executeInvestigate(selectedIds, targetId));

            else if (actionType === 'diplomacy_doer') { if (extraData.subAction === 'goodwill') this.openQuantitySelector('goodwill', selectedIds, targetId); else if (extraData.subAction === 'alliance') this.showGunshiAdvice({type:'diplomacy'}, () => this.game.executeDiplomacy(selectedIds[0], targetId, 'alliance')); else if (extraData.subAction === 'break_alliance') this.game.executeDiplomacy(selectedIds[0], targetId, 'break_alliance'); } 
            else if (actionType === 'draft') this.openQuantitySelector('draft', selectedIds);
            else if (actionType === 'charity') this.openQuantitySelector('charity', selectedIds);
            else if (actionType === 'war_deploy') this.openQuantitySelector('war', selectedIds, targetId);
            else if (actionType === 'transport_deploy') this.openQuantitySelector('transport', selectedIds, targetId);
            
            else if (actionType === 'appoint_gunshi') this.game.executeAppointGunshi(selectedIds[0]);
            else if (actionType === 'incite_doer') this.showGunshiAdvice({type:'incite'}, () => this.game.executeIncite(selectedIds[0], targetId));
            else if (actionType === 'rumor_target_busho') this.openBushoSelector('rumor_doer', targetId, { targetBushoId: selectedIds[0] });
            else if (actionType === 'rumor_doer') this.showGunshiAdvice({type:'rumor'}, () => this.game.executeRumor(selectedIds[0], targetId, extraData.targetBushoId));
            else if (actionType === 'appoint') this.game.executeCommand('appoint', selectedIds, targetId);
            else { this.showGunshiAdvice({type:actionType}, () => this.game.executeCommand(actionType, selectedIds, targetId)); }
        };
    }
    
    showInterviewModal(busho) {
        this.resultModal.classList.remove('hidden');
        let content = "";
        const isSelf = busho.isDaimyo && busho.clan === this.game.playerClanId;
        if (isSelf) {
            content = `<h3>独り言 (${busho.name})</h3><div style="margin:20px 0; text-align:left;"><p>（ふむ...我が志、${busho.ambition >= 80 ? "天下統一も夢ではないか。" : "家の安泰こそ第一。無理は禁物だ。"}）</p><p>（家中の者たちはどう思っているのか...）</p><div style="margin-top:20px; display:flex; flex-direction:column; gap:10px;"><button class="btn-primary" id="interview-ask">他者について考える</button><button class="btn-secondary" onclick="window.GameApp.ui.reopenInterviewSelector()">戻る</button></div></div>`;
        } else {
            content = `<h3>${busho.name}との面談</h3><div style="margin:20px 0; text-align:left;"><p>「殿、どのようなご用件でしょうか？」</p><div style="margin-top:20px; display:flex; flex-direction:column; gap:10px;"><button class="btn-primary" id="interview-status">調子はどうだ</button><button class="btn-primary" id="interview-ask">他者について聞く</button><button class="btn-secondary" onclick="window.GameApp.ui.reopenInterviewSelector()">戻る</button></div></div>`;
        }
        this.resultBody.innerHTML = content;
        
        if (document.getElementById('interview-status')) {
            document.getElementById('interview-status').onclick = () => { this.game.executeInterviewStatus(busho); };
        }
        if (document.getElementById('interview-ask')) {
            document.getElementById('interview-ask').onclick = () => { 
                // モーダルは閉じずに、リストを書き換えるのは複雑なので一旦閉じて即開く
                this.closeResultModal(); 
                this.openBushoSelector('interview_target', null, { interviewer: busho }); 
            };
        }
    }
    reopenInterviewSelector() { this.closeResultModal(); this.openBushoSelector('interview', null, {allowDone: true}); }
    
    // ★ 面談から戻る機能
    reopenInterviewModal(busho) {
        this.closeResultModal();
        // 少し待ってから開かないとアニメーション等の関係でうまく開かない場合があるため
        setTimeout(() => this.showInterviewModal(busho), 100);
    }

    openQuantitySelector(type, data, targetId) {
        this.quantityModal.classList.remove('hidden'); this.quantityContainer.innerHTML = '';
        this.charityTypeSelector.classList.add('hidden'); this.tradeTypeInfo.classList.add('hidden'); const c = this.currentCastle;
        const createSlider = (label, id, max, currentVal) => { const wrap = document.createElement('div'); wrap.className = 'qty-row'; wrap.innerHTML = `<label>${label} (Max: ${max})</label><div class="qty-control"><input type="range" id="range-${id}" min="0" max="${max}" value="${currentVal}"><input type="number" id="num-${id}" min="0" max="${max}" value="${currentVal}"></div>`; const range = wrap.querySelector(`#range-${id}`); const num = wrap.querySelector(`#num-${id}`); range.oninput = () => num.value = range.value; num.oninput = () => range.value = num.value; this.quantityContainer.appendChild(wrap); return { range, num }; };
        let inputs = {};
        
        if (type === 'reward') {
            document.getElementById('quantity-title').textContent = "褒美"; inputs.gold = createSlider("金 (1-200)", "gold", Math.min(c.gold, 200), 1);
            this.quantityConfirmBtn.onclick = () => { const val = parseInt(inputs.gold.num.value); if(val<=0) return; this.quantityModal.classList.add('hidden'); this.game.executeReward(data[0], val); };
        } else if (type === 'draft') {
            document.getElementById('quantity-title').textContent = "徴兵資金"; inputs.gold = createSlider("金", "gold", c.gold, 0);
            this.quantityConfirmBtn.onclick = () => { const val = parseInt(inputs.gold.num.value); if(val <= 0) return; this.quantityModal.classList.add('hidden'); this.showGunshiAdvice({ type: 'draft', val: val }, () => this.game.executeDraft(data, val)); };
        } else if (type === 'charity') {
            document.getElementById('quantity-title').textContent = "施し"; this.charityTypeSelector.classList.remove('hidden'); const count = data.length; this.quantityContainer.innerHTML = `<p>選択武将数: ${count}名</p>`;
            this.quantityConfirmBtn.onclick = () => { const charityType = document.querySelector('input[name="charityType"]:checked').value; this.quantityModal.classList.add('hidden'); this.showGunshiAdvice({ type: 'charity' }, () => this.game.executeCharity(data, charityType)); };
        } else if (type === 'goodwill') {
            document.getElementById('quantity-title').textContent = "贈与金指定"; inputs.gold = createSlider("金", "gold", c.gold, 100);
            this.quantityConfirmBtn.onclick = () => { const val = parseInt(inputs.gold.num.value); if(val < 100) { alert("金が足りません"); return; } this.quantityModal.classList.add('hidden'); this.showGunshiAdvice({ type: 'goodwill' }, () => this.game.executeDiplomacy(data[0], targetId, 'goodwill', val)); };
        } else if (type === 'headhunt_gold') {
            document.getElementById('quantity-title').textContent = "持参金 (任意)"; inputs.gold = createSlider("金", "gold", c.gold, 0);
            this.quantityConfirmBtn.onclick = () => { const val = parseInt(inputs.gold.num.value); this.quantityModal.classList.add('hidden'); this.showGunshiAdvice({ type: 'headhunt' }, () => this.game.executeHeadhunt(data[0], targetId, val)); };
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
    
    // ... [他メソッドは既存維持] ...
    
    // 面談：調子を聞く
    executeInterviewStatus(busho) {
        const inno = busho.innovation;
        let msg = "";
        if (inno > 80) msg += "「最近のやり方は少々古臭い気がしますな。もっと新しいことをせねば。」<br>";
        else if (inno < 20) msg += "「古き良き伝統を守ることこそ肝要です。」<br>";
        else msg += "「特に不満はありません。順調です。」<br>";
        msg += `<br><button class='btn-secondary' onclick='window.GameApp.ui.reopenInterviewModal(window.GameApp.getBusho(${busho.id}))'>戻る</button>`;
        this.ui.showResultModal(msg);
    }

    // 面談：他者について聞く (修正: 自分語り対応)
    executeInterviewTopic(interviewer, target) {
        const dist = GameSystem.calcValueDistance(interviewer, target);
        let comment = "";
        const isSelf = (target.id === interviewer.id); // 自分について聞いた

        if (isSelf) {
            // 自分(大名)についてどう思っているか
            // 忠誠と義理、相性で判定
            const loyalty = interviewer.loyalty;
            const aff = GameSystem.calcAffinityDiff(interviewer.affinity, target.affinity); // 0良-50悪
            
            if (loyalty < 40 || aff > 30) {
                comment = "「......」(口を閉ざしている。あまり良く思われていないようだ)";
            } else if (loyalty > 80 && aff < 15) {
                comment = "「殿には心より感謝しております。この身尽きるまでお仕えする所存！」(非常に慕われている)";
            } else {
                comment = "「殿のご采配、頼もしく思っております。」(概ね信頼されている)";
            }
            this.ui.showResultModal(`<strong>${interviewer.name}</strong><br>「殿のことですか...」<br><br>${comment}<br><br><button class='btn-secondary' onclick='window.GameApp.ui.reopenInterviewModal(window.GameApp.getBusho(${interviewer.id}))'>戻る</button>`);
        } else {
            // 他者について
            if (dist < 15) comment = "「あの方とは意気投合します。素晴らしいお方です。」";
            else if (dist < 30) comment = "「話のわかる相手だと思います。信頼できます。」";
            else if (dist < 50) comment = "「悪くはありませんが、時折意見が食い違います。」";
            else if (dist < 70) comment = "「考え方がどうも合いません。理解に苦しみます。」";
            else comment = "「あやつとは反りが合いません。顔も見たくない程です。」";
            this.ui.showResultModal(`<strong>${interviewer.name}</strong><br>「${target.name}殿ですか...」<br><br>${comment}<br><br><button class='btn-secondary' onclick='window.GameApp.ui.reopenInterviewModal(window.GameApp.getBusho(${interviewer.id}))'>戻る</button>`);
        }
    }
}