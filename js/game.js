/**
 * game.js
 * 戦国シミュレーションゲーム (Main / Data / System)
 * UIManagerは ui.js に移動しました。
 */

window.onerror = function(message, source, lineno, colno, error) {
    console.error("Global Error:", message, "Line:", lineno);
    return false;
};

/* ==========================================================================
   ★ シナリオ定義 & 設定
   ========================================================================== */
const SCENARIOS = [    { name: "桶狭間の戦い (1560年)", desc: "各地で有力大名が覇を競う標準シナリオ。", folder: "1560_okehazama" }];

window.MainParams = {
    StartYear: 1560, StartMonth: 1,
    System: { UseRandomNames: true },
    Economy: {
        IncomeGoldRate: 0.5, IncomeRiceRate: 10.0, IncomeFluctuation: 0.15,
        ConsumeRicePerSoldier: 0.05, ConsumeGoldPerBusho: 50,
        BaseDevelopment: 10, PoliticsEffect: 0.6, DevelopFluctuation: 0.15,
        BaseRepair: 20, RepairEffect: 0.6, RepairFluctuation: 0.15,
        BaseCharity: 10, CharmEffect: 0.4, CharityFluctuation: 0.15,
        TradeRateMin: 0.5, TradeRateMax: 3.0, TradeFluctuation: 0.15,
        PriceAmmo: 10, PriceHorse: 100, PriceGun: 500
    },
    Strategy: {
        InvestigateDifficulty: 50, InciteFactor: 150, RumorFactor: 50, SchemeSuccessRate: 0.6, EmploymentDiff: 1.5,
        HeadhuntBaseDiff: 50, HeadhuntGoldEffect: 0.01, HeadhuntGoldMaxEffect: 15,
        HeadhuntIntWeight: 0.8, HeadhuntLoyaltyWeight: 1.0, HeadhuntDutyWeight: 0.8,
        RewardBaseEffect: 10, RewardGoldFactor: 0.1, RewardDistancePenalty: 0.2,
        AffinityLordWeight: 0.5, AffinityNewLordWeight: 0.6, AffinityDoerWeight: 0.4
    }
};

/* ==========================================================================
   データ管理 (DataManager)
   ========================================================================== */
class DataManager {
    static genericNames = { surnames: [], names: [] };
    static async loadAll(folderName) {
        const path = `./data/scenarios/${folderName}/`;
        try {
            await this.loadParameters("./data/parameter.csv");
            if (window.MainParams.System.UseRandomNames) {
                try {
                    const namesText = await this.fetchText("./data/generic_officer.csv");
                    this.parseGenericNames(namesText);
                } catch (e) { console.warn("汎用武将名ファイルなし"); }
            }
            const [clansText, castlesText, bushosText, kunishusText] = await Promise.all([                
                this.fetchText(path + "clans.csv"),                
                this.fetchText(path + "castles.csv"),                
                this.fetchText(path + "warriors.csv"),
                this.fetchText(path + "kunishuClan.csv").catch(() => "")
            ]);
            const clans = this.parseCSV(clansText, Clan);
            const castles = this.parseCSV(castlesText, Castle);
            const bushos = this.parseCSV(bushosText, Busho);
            const kunishus = kunishusText ? this.parseCSV(kunishusText, Kunishu) : [];

            this.joinData(clans, castles, bushos);
            if (bushos.length < 50) this.generateGenericBushos(bushos, castles, clans);
            return { clans, castles, bushos, kunishus };
        } catch (error) {
            console.error(error);
            alert(`データの読み込みに失敗しました。\nフォルダ構成を確認してください。`);
            throw error;
        }
    }
    static async loadParameters(url) {
        try {
            const text = await this.fetchText(url);
            const lines = text.split('\n').map(l => l.trim()).filter(l => l);
            for (let i = 1; i < lines.length; i++) {
                const parts = lines[i].split(',');
                if (parts.length < 2) continue;
                const key = parts[0].trim();
                let val = parts[1].trim();
                if (val.toLowerCase() === 'true') val = true;
                else if (val.toLowerCase() === 'false') val = false;
                else if (!isNaN(Number(val))) val = Number(val);
                this.setSettingValue(key, val);
            }
        } catch (e) { console.warn("parameter.csv default"); }
    }
    static setSettingValue(keyPath, value) {
        const keys = keyPath.split('.');
        const category = keys[0];
        
        let targetObj = null;
        if (category === "Military" || category === "War") {
            if (window.WarParams) targetObj = window.WarParams;
        } else if (category === "AI") {
            if (window.AIParams) targetObj = window.AIParams;
        } else {
            targetObj = window.MainParams;
        }

        if (!targetObj) return;

        let current = targetObj;
        for (let i = 0; i < keys.length - 1; i++) {
            if (!current[keys[i]]) current[keys[i]] = {};
            current = current[keys[i]];
        }
        current[keys[keys.length - 1]] = value;
    }
    static async fetchText(url) {
        const response = await fetch(url);
        if (!response.ok) throw new Error(`Failed to load ${url}`);
        let text = await response.text();
        if (text.charCodeAt(0) === 0xFEFF) {
            text = text.slice(1);
        }
        return text;
    }
    static joinData(clans, castles, bushos) {
        castles.forEach(c => c.samuraiIds = []);
        bushos.forEach(b => {
            const clan = clans.find(cl => Number(cl.leaderId) === Number(b.id));
            if (clan) b.isDaimyo = true;
            const castleAsCastellan = castles.find(cs => Number(cs.castellanId) === Number(b.id));
            if (castleAsCastellan) b.isCastellan = true;
            if (b.clan === 0) b.status = 'ronin';
            const c = castles.find(castle => Number(castle.id) === Number(b.castleId));
            if(c) c.samuraiIds.push(b.id);
        });
    }
    static parseCSV(text, ModelClass) {
        const lines = text.split('\n').map(l => l.trim()).filter(l => l);
        if (lines.length === 0) return [];
        
        const headers = lines[0].split(',').map(h => {
            let val = h.trim();
            if (val.charCodeAt(0) === 0xFEFF) val = val.slice(1);
            if (val.startsWith('"') && val.endsWith('"')) val = val.slice(1, -1);
            return val;
        });

        const result = [];
        for (let i = 1; i < lines.length; i++) {
            const values = lines[i].split(',');
            if(values.length < headers.length) continue;
            
            const data = {};
            headers.forEach((header, index) => {
                let val = values[index];
                if (val !== undefined) {
                    val = val.trim();
                    if (val.startsWith('"') && val.endsWith('"')) val = val.slice(1, -1);
                    
                    if (!isNaN(Number(val)) && val !== "") val = Number(val);
                    if (val === "true" || val === "TRUE") val = true;
                    if (val === "false" || val === "FALSE") val = false;
                }
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
            if (surname) this.genericNames.surnames.push(surname.trim());
            if (name) this.genericNames.names.push(name.trim());
        }
    }
    static generateGenericBushos(bushos, castles, clans) {
        let idCounter = 90000;
        const personalities = ['aggressive', 'cautious', 'balanced'];
        const useRandom = window.MainParams.System.UseRandomNames && this.genericNames.surnames.length > 0;
        clans.forEach(clan => {
            const clanCastles = castles.filter(c => Number(c.ownerClan) === Number(clan.id));
            if(clanCastles.length === 0) return;
            for(let i=0; i<3; i++) {
                const castle = clanCastles[Math.floor(Math.random() * clanCastles.length)];
                const p = personalities[Math.floor(Math.random() * personalities.length)];
                let bName = `武将|${String.fromCharCode(65+i)}`;
                if (useRandom) {
                    const s = this.genericNames.surnames[Math.floor(Math.random() * this.genericNames.surnames.length)];
                    const n = this.genericNames.names[Math.floor(Math.random() * this.genericNames.names.length)];
                    bName = `${s}|${n}`;
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

/* ==========================================================================
   GameSystem
   ========================================================================== */
class GameSystem {
    static seededRandom(seed) { let x = Math.sin(seed++) * 10000; return x - Math.floor(x); }
    static applyVariance(val, fluctuation) {
        if (!fluctuation || fluctuation === 0) return Math.floor(val);
        const min = 1.0 - fluctuation; const max = 1.0 + fluctuation;
        const rate = min + Math.random() * (max - min);
        return Math.floor(val * rate);
    }
    
    static toGradeHTML(val) {
        let base = "", plus = "", cls = "";
        if (val >= 96) { base = "S"; plus = "+"; cls = "rank-s"; } 
        else if (val >= 91) { base = "S"; plus = ""; cls = "rank-s"; }
        else if (val >= 81) { base = "A"; plus = "+"; cls = "rank-a"; } 
        else if (val >= 76) { base = "A"; plus = ""; cls = "rank-a"; }
        else if (val >= 66) { base = "B"; plus = "+"; cls = "rank-b"; } 
        else if (val >= 61) { base = "B"; plus = ""; cls = "rank-b"; }
        else if (val >= 51) { base = "C"; plus = "+"; cls = "rank-c"; } 
        else if (val >= 46) { base = "C"; plus = ""; cls = "rank-c"; }
        else if (val >= 36) { base = "D"; plus = "+"; cls = "rank-d"; } 
        else if (val >= 31) { base = "D"; plus = ""; cls = "rank-d"; }
        else if (val >= 21) { base = "E"; plus = "+"; cls = "rank-e"; } 
        else { base = "E"; plus = ""; cls = "rank-e"; }

        return `
            <span class="grade-container ${cls}">
                <span class="grade-main">${base}</span>
                <span class="grade-plus">${plus}</span>
            </span>`;
    }
    static getPerceivedStatValue(target, statName, gunshi, castleAccuracy, playerClanId, daimyo = null) {
        const realVal = target[statName];
        if (target.clan === playerClanId) {
            if (target.isDaimyo) return realVal;
            if (!gunshi) return null; 
            const baseAcc = gunshi.intelligence;
            const dist = this.calcValueDistance(gunshi, target);
            let biasFactor = 1.0 + ((50 - dist) / 250); 
            if (daimyo) {
                const gunshiLoyalty = (gunshi.loyalty + gunshi.duty) / 2;
                const gunshiDaimyoDist = this.calcValueDistance(gunshi, daimyo);
                const fairness = (gunshiLoyalty * 0.005) + ((100 - gunshiDaimyoDist) * 0.005);
                biasFactor = 1.0 + (biasFactor - 1.0) * (1.0 - fairness);
            }
            const randomErrorRange = (120 - baseAcc) * 0.5; 
            const randomError = (Math.random() - 0.5) * randomErrorRange;
            let perceived = (realVal + randomError) * biasFactor;
            return Math.max(1, Math.min(120, Math.floor(perceived)));
        }
        if (castleAccuracy !== null && castleAccuracy > 0) {
            const maxErr = 50 * (1.0 - (castleAccuracy / 100));
            const err = (Math.random() - 0.5) * 2 * maxErr;
            return Math.max(1, Math.min(120, Math.floor(realVal + err)));
        }
        
        if (target.clan !== 0 && target.clan !== playerClanId) {
            return null;
        }

        if (gunshi) {
            const noise = (130 - gunshi.intelligence);
            const err = (Math.random() - 0.5) * noise * 2;
            return Math.max(1, Math.min(120, Math.floor(realVal + err)));
        }
        return null;
    }
    
    static getDisplayStatHTML(target, statName, gunshi, castleAccuracy = null, playerClanId = 0, daimyo = null) {
        if (target.clan === playerClanId && target.isDaimyo) return this.toGradeHTML(target[statName]);
        const val = this.getPerceivedStatValue(target, statName, gunshi, castleAccuracy, playerClanId, daimyo);
        if (val === null) return "？";
        return this.toGradeHTML(val);
    }

    static calcDevelopment(busho) { const base = window.MainParams.Economy.BaseDevelopment + (busho.politics * window.MainParams.Economy.PoliticsEffect); const val = this.applyVariance(base, window.MainParams.Economy.DevelopFluctuation); return Math.max(1, Math.floor(val / 5)); }
    static calcRepair(busho) { const base = window.MainParams.Economy.BaseRepair + (busho.politics * window.MainParams.Economy.RepairEffect); const val = this.applyVariance(base, window.MainParams.Economy.RepairFluctuation); return Math.max(1, Math.floor(val / 3)); }
    static calcCharity(busho, type) { let val = window.MainParams.Economy.BaseCharity + (busho.charm * window.MainParams.Economy.CharmEffect); if (type === 'both') val = val * 1.5; return this.applyVariance(val, window.MainParams.Economy.CharityFluctuation); }
    static calcTraining(busho) { const base = window.WarParams.Military.BaseTraining + (busho.leadership * window.WarParams.Military.TrainingLdrEffect + busho.strength * window.WarParams.Military.TrainingStrEffect); return this.applyVariance(base, window.WarParams.Military.TrainingFluctuation); }
    static calcSoldierCharity(busho) { const base = window.WarParams.Military.BaseMorale + (busho.leadership * window.WarParams.Military.MoraleLdrEffect) + (busho.charm * window.WarParams.Military.MoraleCharmEffect); return this.applyVariance(base, window.WarParams.Military.MoraleFluctuation); }
    static calcDraftFromGold(gold, busho, castlePopulation) { const bonus = 1.0 + ((busho.leadership + busho.strength + busho.charm) / 300) * (window.WarParams.Military.DraftStatBonus - 1.0); const popBonus = 1.0 + (castlePopulation * window.WarParams.Military.DraftPopBonusFactor); return Math.floor(gold * 1.0 * bonus * popBonus); }
    static isAdjacent(c1, c2) { return (Math.abs(c1.x - c2.x) + Math.abs(c1.y - c2.y)) === 1; }
    static calcWeightedAvg(currVal, currNum, newVal, newNum) { if(currNum + newNum === 0) return currVal; return Math.floor(((currVal * currNum) + (newVal * newNum)) / (currNum + newNum)); }
    
    static calcInvestigate(bushos, targetCastle) {
        if (!bushos || bushos.length === 0) return { success: false, accuracy: 0 };
        const maxStrBusho = bushos.reduce((a,b) => a.strength > b.strength ? a : b);
        const maxIntBusho = bushos.reduce((a,b) => a.intelligence > b.intelligence ? a : b);
        const assistStr = bushos.filter(b => b !== maxStrBusho).reduce((sum, b) => sum + b.strength, 0) * 0.2;
        const assistInt = bushos.filter(b => b !== maxIntBusho).reduce((sum, b) => sum + b.intelligence, 0) * 0.2;
        const totalStr = maxStrBusho.strength + assistStr;
        const totalInt = maxIntBusho.intelligence + assistInt;
        
        const difficulty = 30 + Math.random() * window.MainParams.Strategy.InvestigateDifficulty;
        const isSuccess = totalStr > difficulty;
        let accuracy = 0;
        if (isSuccess) {
            accuracy = Math.min(100, Math.max(10, (totalInt * 0.8) + (Math.random() * 20)));
        }
        return { success: isSuccess, accuracy: Math.floor(accuracy) };
    }
    
    // ★ 扇動と流言の低下量を修正しました
    static calcIncite(busho) { 
        const score = (busho.intelligence * 0.7) + (busho.strength * 0.3); 
        const success = Math.random() < (score / window.MainParams.Strategy.InciteFactor); 
        if(!success) return { success: false, val: 0 }; 
        return { success: true, val: Math.max(1, Math.floor((score * 2) / 15)) }; // 約15分の1に減らしました
    }
    static calcRumor(busho, targetBusho) { 
        const score = (busho.intelligence * 0.7) + (busho.strength * 0.3); 
        const defScore = (targetBusho.intelligence * 0.5) + (targetBusho.loyalty * 0.5); 
        const success = Math.random() < (score / (defScore + window.MainParams.Strategy.RumorFactor)); 
        if(!success) return { success: false, val: 0 }; 
        return { success: true, val: Math.floor((20 + Math.random()*20) / 4) }; // 約4分の1に減らしました
    }

    static calcAffinityDiff(a, b) { const diff = Math.abs(a - b); return Math.min(diff, 100 - diff); }
    static calcValueDistance(a, b) {
        const diffInno = Math.abs(a.innovation - b.innovation);
        const coopFactor = (a.cooperation + b.cooperation) / 200; 
        let dist = diffInno * (1.0 - (coopFactor * 0.5)); 
        const classicAff = this.calcAffinityDiff(a.affinity, b.affinity); 
        return Math.floor(dist * 0.8 + classicAff * 0.4); 
    }
    static calcRewardEffect(gold, daimyo, target) {
        const S = window.MainParams.Strategy;
        const dist = this.calcValueDistance(daimyo, target);
        let penalty = dist * S.RewardDistancePenalty;
        let baseIncrease = S.RewardBaseEffect + (gold * S.RewardGoldFactor);
        let actualIncrease = baseIncrease - penalty;
        if (actualIncrease < 0) actualIncrease = 0;
        return Math.floor(actualIncrease);
    }
    static calcHeadhunt(doer, target, gold, targetLord, newLord) {
        const S = window.MainParams.Strategy;
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
    
    static calcEmploymentSuccess(recruiter, target, recruiterClanPower, targetClanPower) { 
        if (target.clan !== 0 && target.ambition > 70 && recruiterClanPower < targetClanPower * 0.7) return false; 
        const affDiff = this.calcAffinityDiff(recruiter.affinity, target.affinity); 
        let affBonus = (affDiff < 10) ? 30 : (affDiff < 25) ? 15 : (affDiff > 40) ? -10 : 0; 
        const resistance = target.clan === 0 ? target.ambition : target.loyalty * window.MainParams.Strategy.EmploymentDiff; 
        return ((recruiter.charm + affBonus) * (Math.random() + 0.5)) > resistance; 
    }
    static getGunshiAdvice(gunshi, action, seed) { const luck = this.seededRandom(seed); const errorMargin = (100 - gunshi.intelligence) / 200; const perceivedLuck = Math.min(1.0, Math.max(0.0, luck + (this.seededRandom(seed+1)-0.5)*errorMargin*2)); if (perceivedLuck > 0.8) return "必ずや成功するでしょう。好機です！"; if (perceivedLuck > 0.6) return "おそらく上手くいくでしょう。"; if (perceivedLuck > 0.4) return "五分五分といったところです。油断めさるな。"; if (perceivedLuck > 0.2) return "厳しい結果になるかもしれません。"; return "おやめください。失敗する未来が見えます。"; }
}

/* ==========================================================================
   GameManager
   ========================================================================== */
class GameManager {
    constructor() { 
        this.year = window.MainParams.StartYear; 
        this.month = window.MainParams.StartMonth; 
        this.castles = []; 
        this.bushos = []; 
        this.turnQueue = []; 
        this.currentIndex = 0; 
        this.playerClanId = 1; 
        this.ui = new UIManager(this); 
        this.selectionMode = null; 
        this.validTargets = []; 
        this.isProcessingAI = false; 
        this.marketRate = 1.0; 
        this.lastMenuState = null;
        this.aiTimer = null; 
        
        this.kunishuSystem = new KunishuSystem(this);

        this.commandSystem = new CommandSystem(this);
        this.warManager = new WarManager(this);
        this.aiEngine = new AIEngine(this);
        this.independenceSystem = new IndependenceSystem(this);
        this.factionSystem = new FactionSystem(this); 
        this.diplomacyManager = new DiplomacyManager(this);
        
        this.phase = 'title';
    }
    
    getRelation(id1, id2) { 
        const rel = this.diplomacyManager.getRelation(id1, id2); 
        if (rel) {
            rel.alliance = (rel.status === '同盟');
            rel.friendship = rel.sentiment;
        }
        return rel;
    }
    
    startNewGame() { 
        if(this.ui) this.ui.forceResetModals();
        this.boot(); 
    }
    
    async boot() { 
        if (this.ui) this.ui.showScenarioSelection(SCENARIOS, (folder) => this.loadScenario(folder)); 
    }
    
    async loadScenario(folder) {
        try {
            document.getElementById('title-screen').classList.add('hidden'); 

            const data = await DataManager.loadAll(folder); 
            this.clans = data.clans; this.castles = data.castles; this.bushos = data.bushos; 
            
            this.kunishuSystem.setKunishuData(data.kunishus || []);
            
            document.getElementById('app').classList.remove('hidden'); 
            
            this.phase = 'daimyo_select';
            this.ui.renderMap();
            await this.ui.showCutin("開始する大名家の城を選択してください");
            
        } catch (e) {
            console.error(e);
            alert("シナリオデータの読み込みに失敗しました。");
            this.ui.returnToTitle();
        }
    }
    
    handleDaimyoSelect(castle) {
        if (castle.ownerClan === 0) {
            this.ui.showDialog("その城は空き城（中立）のため選択できません。", false);
            return;
        }
        
        const clan = this.clans.find(c => c.id === castle.ownerClan);
        if (!clan) return;

        const totalSoldiers = this.getClanTotalSoldiers(clan.id);
        const leader = this.getBusho(clan.leaderId); 
        
        this.ui.showDaimyoConfirmModal(clan.name, totalSoldiers, leader, () => {
             this.playerClanId = Number(clan.id);
             this.phase = 'game';
             this.ui.renderMap(); 
             this.init();
        });
    }

    init() { this.startMonth(); }
    getBusho(id) { return this.bushos.find(b => Number(b.id) === Number(id)); }
    getCastle(id) { return this.castles.find(c => Number(c.id) === Number(id)); }
    getCastleBushos(cid) { const c = this.castles.find(c => Number(c.id) === Number(cid)); return c ? c.samuraiIds.map(id => this.getBusho(id)).filter(b => b) : []; }
    getCurrentTurnCastle() { return this.turnQueue[this.currentIndex]; }
    getCurrentTurnId() { return this.year * 12 + this.month; }
    getClanTotalSoldiers(clanId) { return this.castles.filter(c => Number(c.ownerClan) === Number(clanId)).reduce((sum, c) => sum + c.soldiers, 0); }
    getClanGunshi(clanId) { return this.bushos.find(b => Number(b.clan) === Number(clanId) && b.isGunshi); }
    isCastleVisible(castle) { if (Number(castle.ownerClan) === Number(this.playerClanId)) return true; if (castle.investigatedUntil >= this.getCurrentTurnId()) return true; return false; }
    
    updateCastleLord(castle) {
        if (!castle || castle.ownerClan === 0) {
            if (castle) castle.castellanId = 0;
            return;
        }

        const bushos = this.getCastleBushos(castle.id).filter(b => b.status !== 'ronin' && b.status !== 'dead');
        if (bushos.length === 0) {
            castle.castellanId = 0;
            return;
        }

        const daimyo = bushos.find(b => b.isDaimyo);
        if (daimyo) {
            bushos.forEach(b => { 
                b.isCastellan = false; 
            });
            daimyo.isCastellan = true; 
            castle.castellanId = daimyo.id;
            return;
        }

        let currentLord = bushos.find(b => b.id === castle.castellanId && b.isCastellan);
        
        if (!currentLord) {
            this.electCastellan(castle, bushos);
        }
    }

    electCastellan(castle, bushos) {
        bushos.forEach(b => {
            b._lordScore = (b.leadership * 5) + (b.politics * 4) + (b.charm * 1);
            if (b.isFactionLeader) {
                b._lordScore += 10000; 
            }
        });

        bushos.sort((a, b) => b._lordScore - a._lordScore);
        const best = bushos[0];

        bushos.forEach(b => b.isCastellan = false);
        best.isCastellan = true;
        castle.castellanId = best.id;
    }

    updateAllCastlesLords() {
        this.castles.forEach(c => this.updateCastleLord(c));
    }

    async startMonth() { 
        this.marketRate = Math.max(window.MainParams.Economy.TradeRateMin, Math.min(window.MainParams.Economy.TradeRateMax, this.marketRate * (0.9 + Math.random()*window.MainParams.Economy.TradeFluctuation)));
        
        await this.ui.showCutin(`${this.year}年 ${this.month}月`);
        
        this.ui.log(`=== ${this.year}年 ${this.month}月 ===`);
        
        this.factionSystem.processStartMonth(); 
        
        this.factionSystem.processRoninMovements(); 
        
        this.updateAllCastlesLords();
        
        if (this.month % 3 === 0) this.factionSystem.optimizeCastellans(); 
        const isPopGrowth = (this.month % 2 === 0);
        
        this.castles.forEach(c => {
            if (c.ownerClan === 0) return;
            c.isDone = false;

            const baseGold = (c.population * 0.001) + (c.peoplesLoyalty / 3) + (c.commerce / 10);
            let income = Math.floor(baseGold * window.MainParams.Economy.IncomeGoldRate);
            income = GameSystem.applyVariance(income, window.MainParams.Economy.IncomeFluctuation);
            if (this.month === 3) income += income * 5;
            // ★ 金の増加にストッパーをかけました
            c.gold = Math.min(99999, c.gold + income);

            if (this.month === 9) {
                const baseRice = c.kokudaka + c.peoplesLoyalty;
                let riceIncome = Math.floor(baseRice * window.MainParams.Economy.IncomeRiceRate);
                riceIncome = GameSystem.applyVariance(riceIncome, window.MainParams.Economy.IncomeFluctuation);
                // ★ 兵糧の増加にストッパーをかけました
                c.rice = Math.min(99999, c.rice + riceIncome);
            }
            
            if (isPopGrowth) { 
                let growth = 0;
                let currentLoyalty = Math.max(0, Math.min(100, c.peoplesLoyalty));
                if (currentLoyalty >= 51) {
                    const rate = 0.001 + ((currentLoyalty - 51) / 49) * 0.004;
                    growth = Math.floor(c.population * rate);
                } else if (currentLoyalty <= 50) {
                    const rate = 0.001 + ((50 - currentLoyalty) / 50) * 0.004;
                    growth = -Math.floor(c.population * rate);
                }
                // ★ 人口の増加にストッパーをかけました（上限99万9999）
                c.population = Math.min(999999, Math.max(0, c.population + growth));
            }
            const bushos = this.getCastleBushos(c.id);
            c.rice = Math.max(0, c.rice - Math.floor(c.soldiers * window.MainParams.Economy.ConsumeRicePerSoldier));
            c.gold = Math.max(0, c.gold - (bushos.length * window.MainParams.Economy.ConsumeGoldPerBusho));
            
            bushos.forEach(b => {
                b.isActionDone = false;
                
                // もしこの武将が「城主」だったら、功績を10足してあげる
                if (b.isCastellan) {
                    b.achievementTotal += 10;
                }
            });
        });

        const allCastles = this.castles.filter(c => c.ownerClan !== 0);
        const myCastles = allCastles.filter(c => Number(c.ownerClan) === Number(this.playerClanId));
        const otherCastles = allCastles.filter(c => Number(c.ownerClan) !== Number(this.playerClanId));
        otherCastles.sort(() => Math.random() - 0.5); 
        this.turnQueue = [...myCastles, ...otherCastles];

        this.currentIndex = 0; 
        this.processTurn();
    }

    processTurn() {
        if (this.aiTimer) {
            clearTimeout(this.aiTimer);
            this.aiTimer = null;
        }

        if (this.warManager.state.active) return;

        for (let i = this.currentIndex; i < this.turnQueue.length; i++) {
            const c = this.turnQueue[i];
            if (Number(c.ownerClan) === Number(this.playerClanId)) {
                if (i !== this.currentIndex) {
                    const temp = this.turnQueue[this.currentIndex];
                    this.turnQueue[this.currentIndex] = this.turnQueue[i];
                    this.turnQueue[i] = temp;
                }
                break; 
            }
        }

        if (this.currentIndex >= this.turnQueue.length) { 
            this.endMonth(); 
            return; 
        }

        const castle = this.turnQueue[this.currentIndex]; 
        
        if (castle.isDone) {
            this.finishTurn();
            return;
        }

        if(!castle || castle.ownerClan === 0 || !this.clans.find(c => Number(c.id) === Number(castle.ownerClan))) { 
            console.warn(`Skipping invalid castle or owner.`);
            this.currentIndex++; 
            this.processTurn(); 
            return; 
        }
        
        const ownerId = Number(castle.ownerClan);
        const playerId = Number(this.playerClanId);
        const isPlayerCastle = (ownerId === playerId);

        const isVisible = this.isCastleVisible(castle);
        const isNeighbor = this.castles.some(c => Number(c.ownerClan) === playerId && GameSystem.isAdjacent(c, castle));
        const isImportant = isVisible || isNeighbor;

        if (isPlayerCastle || isImportant || this.currentIndex % 5 === 0) {
            this.ui.renderMap();
        }

        if (isPlayerCastle) { 
            this.isProcessingAI = false; 

            this.ui.renderMap(); 
            this.ui.log(`【${castle.name}】命令を下してください`); 
            
            this.ui.showTurnStartDialog(castle, () => {
                this.ui.showControlPanel(castle); 
            });

        } else { 
            this.isProcessingAI = true; 
            
            if(this.ui.panelEl) this.ui.panelEl.classList.add('hidden'); 
            
            const delay = isImportant ? 400 : 10;

            this.aiTimer = setTimeout(() => {
                if (this.warManager.state.active) return;
                
                if (this.turnQueue[this.currentIndex] !== castle) return;

                try {
                    this.aiEngine.execAI(castle);
                } catch(e) {
                    console.error("AI Error caught:", e);
                    this.finishTurn(); 
                }
            }, delay); 
        }
    }
    
    finishTurn() { 
        if(this.warManager.state.active && this.warManager.state.isPlayerInvolved) return; 
        
        if (this.aiTimer) { clearTimeout(this.aiTimer); this.aiTimer = null; }

        this.selectionMode = null; 
        const castle = this.getCurrentTurnCastle(); 
        if(castle) castle.isDone = true; 
        
        this.currentIndex++; 
        this.processTurn(); 
    }

    endMonth() { 
        this.factionSystem.processEndMonth(); 
        this.independenceSystem.checkIndependence(); 
        
        this.kunishuSystem.processEndMonth();

        this.month++; 
        if(this.month > 12) { this.month = 1; this.year++; } 
        
        const clans = new Set(this.castles.filter(c => c.ownerClan !== 0).map(c => c.ownerClan)); 
        const playerAlive = clans.has(this.playerClanId); 
        
        if (clans.size === 1 && playerAlive) {
            this.ui.showDialog("天下統一！", false);
        } else if (!playerAlive) {
            this.ui.showDialog("我が軍は滅亡しました……", false);
        } else {
            this.startMonth(); 
        }
    }

    checkAllActionsDone() {
        const c = this.getCurrentTurnCastle();
        if (!c || Number(c.ownerClan) !== Number(this.playerClanId)) return; 

        if (this.isProcessingAI) return;

        const bushos = this.getCastleBushos(c.id).filter(b => b.status !== 'ronin');
        
        if(bushos.length > 0 && bushos.every(b => b.isActionDone)) {
             setTimeout(() => {
                 this.ui.showDialog("すべての武将が行動を終えました。\n今月の命令を終了しますか？", true, () => {
                     this.finishTurn();
                 });
             }, 100);
        }
    }

    changeLeader(clanId, newLeaderId) { 
        this.bushos.filter(b => b.clan === clanId).forEach(b => b.isDaimyo = false); 
        const newLeader = this.getBusho(newLeaderId); 
        if(newLeader) { 
            newLeader.isDaimyo = true; 
            this.clans.find(c => c.id === clanId).leaderId = newLeaderId; 
        } 
        this.updateAllCastlesLords(); 
    }
    
    saveGameToFile() { 
        const data = { 
            year: this.year, 
            month: this.month, 
            marketRate: this.marketRate,
            castles: this.castles, 
            bushos: this.bushos, 
            clans: this.clans,
            playerClanId: this.playerClanId,
            kunishus: this.kunishuSystem.kunishus
        }; 
        const blob = new Blob([JSON.stringify(data, null, 2)], {type: 'application/json'}); 
        const url = URL.createObjectURL(blob); 
        const a = document.createElement('a'); a.href = url; a.download = `sengoku_save_${this.year}_${this.month}.json`; a.click(); URL.revokeObjectURL(url); 
    }
    
    loadGameFromFile(e) { 
        const file = e.target.files[0]; if (!file) return; 
        const reader = new FileReader(); 
        reader.onload = async (evt) => { 
            try { 
                const d = JSON.parse(evt.target.result); 
                this.year = d.year; 
                this.month = d.month; 
                this.playerClanId = d.playerClanId || 1; 
                this.marketRate = d.marketRate !== undefined ? d.marketRate : 1.0; 
                this.castles = d.castles.map(c => new Castle(c)); 
                this.bushos = d.bushos.map(b => new Busho(b)); 
                
                if (d.kunishus) {
                    this.kunishuSystem.setKunishuData(d.kunishus.map(k => new Kunishu(k)));
                } else {
                    this.kunishuSystem.setKunishuData([]);
                }

                if (d.clans) {
                    this.clans = d.clans.map(c => new Clan(c));
                } else {
                    const scenario = SCENARIOS[0]; 
                    await DataManager.loadParameters("./data/parameter.csv");
                    const data = await DataManager.loadAll(scenario.folder);
                    this.clans = data.clans;
                }

                document.getElementById('title-screen').classList.add('hidden'); 
                document.getElementById('app').classList.remove('hidden'); 
                
                this.phase = 'game';
                
                this.turnQueue = this.castles.filter(c => c.ownerClan !== 0).sort(() => Math.random() - 0.5);
                this.currentIndex = 0; 

                this.updateAllCastlesLords();

                this.ui.showCutin(`ロード完了: ${this.year}年 ${this.month}月`);
                this.ui.hasInitializedMap = false; 
                this.ui.renderMap();
                this.processTurn();
            } catch(err) { console.error(err); alert("セーブデータの読み込みに失敗しました"); } 
        }; 
        reader.readAsText(file); 
    }
}

window.addEventListener('DOMContentLoaded', () => {
    document.addEventListener('contextmenu', (e) => {
        e.preventDefault();
    }, { passive: false });

    window.GameApp = new GameManager();

});