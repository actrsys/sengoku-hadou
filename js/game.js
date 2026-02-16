/**
 * game.js
 * 戦国シミュレーションゲーム (Main / UI / Data / System)
 * 設定: System, Economy, Strategy
 */

// グローバルエラーハンドリング
window.onerror = function(message, source, lineno, colno, error) {
    console.error("Global Error:", message, "Line:", lineno);
    return false;
};

/* ==========================================================================
   ★ シナリオ定義 & 設定
   ========================================================================== */
const SCENARIOS = [    { name: "群雄割拠 (1560年)", desc: "各地で有力大名が覇を競う標準シナリオ。", folder: "1560_okehazama" }];

// メインパラメータ設定 (System, Economy, Strategy)
window.MainParams = {
    StartYear: 1560, StartMonth: 1,
    System: { UseRandomNames: true },
    Economy: {
        IncomeGoldRate: 0.5, IncomeRiceRate: 10.0, IncomeFluctuation: 0.15,
        ConsumeRicePerSoldier: 0.05, ConsumeGoldPerBusho: 50,
        BaseDevelopment: 10, PoliticsEffect: 0.6, DevelopFluctuation: 0.15,
        BaseRepair: 20, RepairEffect: 0.6, RepairFluctuation: 0.15,
        BaseCharity: 10, CharmEffect: 0.4, CharityFluctuation: 0.15,
        TradeRateMin: 0.5, TradeRateMax: 3.0, TradeFluctuation: 0.15
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
   データ管理
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
            const [clansText, castlesText, bushosText] = await Promise.all([                this.fetchText(path + "clans.csv"),                this.fetchText(path + "castles.csv"),                this.fetchText(path + "warriors.csv")            ]);
            const clans = this.parseCSV(clansText, Clan);
            const castles = this.parseCSV(castlesText, Castle);
            const bushos = this.parseCSV(bushosText, Busho);
            this.joinData(clans, castles, bushos);
            if (bushos.length < 50) this.generateGenericBushos(bushos, castles, clans);
            return { clans, castles, bushos };
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
        const useRandom = window.MainParams.System.UseRandomNames && this.genericNames.surnames.length > 0;
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
    
    // getAISmartness は ai.js へ移動

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

    static calcDevelopment(busho) { const base = window.MainParams.Economy.BaseDevelopment + (busho.politics * window.MainParams.Economy.PoliticsEffect); return this.applyVariance(base, window.MainParams.Economy.DevelopFluctuation); }
    static calcRepair(busho) { const base = window.MainParams.Economy.BaseRepair + (busho.politics * window.MainParams.Economy.RepairEffect); return this.applyVariance(base, window.MainParams.Economy.RepairFluctuation); }
    static calcCharity(busho, type) { let val = window.MainParams.Economy.BaseCharity + (busho.charm * window.MainParams.Economy.CharmEffect); if (type === 'both') val = val * 1.5; return this.applyVariance(val, window.MainParams.Economy.CharityFluctuation); }
    // Military設定はWarParamsにある
    static calcTraining(busho) { const base = window.WarParams.Military.BaseTraining + (busho.leadership * window.WarParams.Military.TrainingLdrEffect + busho.strength * window.WarParams.Military.TrainingStrEffect); return this.applyVariance(base, window.WarParams.Military.TrainingFluctuation); }
    static calcSoldierCharity(busho) { const base = window.WarParams.Military.BaseMorale + (busho.leadership * window.WarParams.Military.MoraleLdrEffect) + (busho.charm * window.WarParams.Military.MoraleCharmEffect); return this.applyVariance(base, window.WarParams.Military.MoraleFluctuation); }
    static calcDraftFromGold(gold, busho, castlePopulation) { const bonus = 1.0 + ((busho.leadership + busho.strength + busho.charm) / 300) * (window.WarParams.Military.DraftStatBonus - 1.0); const popBonus = 1.0 + (castlePopulation * window.WarParams.Military.DraftPopBonusFactor); return Math.floor(gold * 1.0 * bonus * popBonus); }
    static isAdjacent(c1, c2) { return (Math.abs(c1.x - c2.x) + Math.abs(c1.y - c2.y)) === 1; }
    static calcWeightedAvg(currVal, currNum, newVal, newNum) { if(currNum + newNum === 0) return currVal; return Math.floor(((currVal * currNum) + (newVal * newNum)) / (currNum + newNum)); }
    
    // 戦争関連の計算メソッド (calcUnitStats, calcWarDamage, calcRetreatScore, calcScheme, calcFire) は war.js へ移動しました

    static calcInvestigate(bushos, targetCastle) {
        if (!bushos || bushos.length === 0) return { success: false, accuracy: 0 };
        const maxStrBusho = bushos.reduce((a,b) => a.strength > b.strength ? a : b);
        const maxIntBusho = bushos.reduce((a,b) => a.intelligence > b.intelligence ? a : b);
        const assistStr = bushos.filter(b => b !== maxStrBusho).reduce((sum, b) => sum + b.strength, 0) * 0.2;
        const assistInt = bushos.filter(b => b !== maxIntBusho).reduce((sum, b) => sum + b.intelligence, 0) * 0.2;
        const totalStr = maxStrBusho.strength + assistStr;
        const totalInt = maxIntBusho.intelligence + assistInt;
        // Strategy設定はMainParamsにある
        const difficulty = 30 + Math.random() * window.MainParams.Strategy.InvestigateDifficulty;
        const isSuccess = totalStr > difficulty;
        let accuracy = 0;
        if (isSuccess) {
            accuracy = Math.min(100, Math.max(10, (totalInt * 0.8) + (Math.random() * 20)));
        }
        return { success: isSuccess, accuracy: Math.floor(accuracy) };
    }
    static calcIncite(busho) { const score = (busho.intelligence * 0.7) + (busho.strength * 0.3); const success = Math.random() < (score / window.MainParams.Strategy.InciteFactor); if(!success) return { success: false, val: 0 }; return { success: true, val: Math.floor(score * 2) }; }
    static calcRumor(busho, targetBusho) { const score = (busho.intelligence * 0.7) + (busho.strength * 0.3); const defScore = (targetBusho.intelligence * 0.5) + (targetBusho.loyalty * 0.5); const success = Math.random() < (score / (defScore + window.MainParams.Strategy.RumorFactor)); if(!success) return { success: false, val: 0 }; return { success: true, val: Math.floor(20 + Math.random()*20) }; }
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
   UI管理
   ========================================================================== */
class UIManager {
    constructor(game) {
        this.game = game; this.currentCastle = null; this.menuState = 'MAIN';
        this.logHistory = [];
        this.mapScale = 1.0;
        this.infoPanelCollapsed = false;
        this.topInfoExpanded = false; 

        this.mapEl = document.getElementById('map-container'); 
        this.panelEl = document.getElementById('pc-sidebar'); 
        this.statusContainer = document.getElementById('pc-status-panel'); 
        this.mobileTopLeft = document.getElementById('mobile-top-left');
        this.mobileBottomInfo = document.getElementById('mobile-bottom-info');
        this.pcMapOverlay = document.getElementById('pc-map-overlay');
        
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
        this.mapGuide = document.getElementById('map-guide'); 
        this.prisonerModal = document.getElementById('prisoner-modal');
        this.prisonerList = document.getElementById('prisoner-list'); 
        this.successionModal = document.getElementById('succession-modal');
        this.successionList = document.getElementById('succession-list'); 
        this.resultModal = document.getElementById('result-modal');
        this.resultBody = document.getElementById('result-body'); 
        this.gunshiModal = document.getElementById('gunshi-modal');
        this.gunshiName = document.getElementById('gunshi-name'); 
        this.gunshiMessage = document.getElementById('gunshi-message');
        this.gunshiExecuteBtn = document.getElementById('gunshi-execute-btn');
        this.charityTypeSelector = document.getElementById('charity-type-selector');
        this.aiGuard = document.getElementById('ai-guard');
        this.tradeTypeInfo = document.getElementById('trade-type-info');
        this.scenarioScreen = document.getElementById('scenario-modal');
        this.scenarioList = document.getElementById('scenario-list');
        this.mapResetZoomBtn = document.getElementById('map-reset-zoom');
        this.historyModal = document.getElementById('history-modal');
        this.historyList = document.getElementById('history-list');

        if (this.resultModal) this.resultModal.addEventListener('click', (e) => { if (e.target === this.resultModal) this.closeResultModal(); });
        if (this.mapResetZoomBtn) {
            this.mapResetZoomBtn.onclick = (e) => { e.stopPropagation(); this.resetMapZoom(); };
        }
    }

    forceResetModals() {
        const modals = document.querySelectorAll('.modal');
        modals.forEach(m => {
            m.classList.add('hidden');
            m.style.display = ''; 
        });
        if(this.cutinOverlay) this.cutinOverlay.classList.add('hidden');
    }

    log(msg) { 
        this.logHistory.unshift(`[${this.game.year}年${this.game.month}月] ${msg}`);
        if(this.logHistory.length > 50) this.logHistory.pop();
    }
    
    showHistoryModal() {
        if (!this.historyModal) return;
        this.historyModal.classList.remove('hidden');
        if (this.historyList) {
            this.historyList.innerHTML = '';
            this.logHistory.forEach(log => {
                const div = document.createElement('div');
                div.textContent = log;
                div.style.borderBottom = "1px solid #eee";
                div.style.padding = "5px";
                div.style.fontSize = "0.85rem";
                this.historyList.appendChild(div);
            });
        }
    }

    showResultModal(msg) { 
        if (this.resultBody) this.resultBody.innerHTML = msg.replace(/\n/g, '<br>'); 
        if (this.resultModal) this.resultModal.classList.remove('hidden'); 
    }
    
    closeResultModal() { 
        if (this.resultModal) this.resultModal.classList.add('hidden'); 
        if (this.game) this.game.checkAllActionsDone();
    }
    
    closeSelector() { if (this.selectorModal) this.selectorModal.classList.add('hidden'); }

    showCutin(msg) { 
        if (this.cutinMessage) this.cutinMessage.textContent = msg; 
        if (this.cutinOverlay) {
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
    }
    
    showScenarioSelection(scenarios, onSelect) {
        this.forceResetModals();
        if (!this.scenarioScreen) return;
        this.scenarioScreen.classList.remove('hidden'); 
        if (this.scenarioList) {
            this.scenarioList.innerHTML = '';
            scenarios.forEach(s => {
                const div = document.createElement('div'); div.className = 'clan-btn';
                div.innerHTML = `<div style="text-align:left;"><strong>${s.name}</strong><br><small>${s.desc}</small></div>`;
                div.onclick = () => { this.scenarioScreen.classList.add('hidden'); onSelect(s.folder); };
                this.scenarioList.appendChild(div);
            });
        }
    }
    returnToTitle() { 
        this.forceResetModals();
        const ts = document.getElementById('title-screen');
        if(ts) ts.classList.remove('hidden'); 
    }
    showStartScreen(clans, onSelect) { 
        if (!this.startScreen) return;
        this.startScreen.classList.remove('hidden'); 
        const container = document.getElementById('clan-selector'); 
        if (container) {
            container.innerHTML = ''; 
            clans.forEach(clan => { 
                const btn = document.createElement('div'); btn.className = 'clan-btn'; btn.textContent = clan.name; btn.style.color = clan.color; btn.style.borderColor = clan.color; 
                btn.onclick = () => { this.startScreen.classList.add('hidden'); onSelect(clan.id); }; 
                container.appendChild(btn); 
            }); 
        }
    }
    
    fitMapToScreen() {
        if (!this.mapEl) return;
        const wrapper = document.getElementById('map-wrapper');
        const container = this.mapEl;
        const maxX = Math.max(...this.game.castles.map(c => c.x)) + 2;
        const maxY = Math.max(...this.game.castles.map(c => c.y)) + 2;
        const tileSize = 80;
        const gap = 10;
        const mapW = maxX * (tileSize + gap);
        const mapH = maxY * (tileSize + gap);
        
        container.style.width = `${mapW}px`;
        container.style.height = `${mapH}px`;
        
        const scaleX = wrapper.clientWidth / mapW;
        const scaleY = wrapper.clientHeight / mapH;
        let scale = Math.min(scaleX, scaleY) * 0.9; 
        if (scale > 1.0) scale = 1.0;
        
        this.defaultScale = scale;
        this.mapScale = scale;
        this.applyMapScale();
        
        if (this.mapResetZoomBtn) this.mapResetZoomBtn.textContent = "+";
    }

    applyMapScale() {
        if(this.mapEl) {
            this.mapEl.style.transform = `scale(${this.mapScale})`;
        }
    }

    resetMapZoom() {
        if (this.mapScale >= 0.99) {
            this.mapScale = this.defaultScale || 0.5;
            if (this.mapResetZoomBtn) this.mapResetZoomBtn.textContent = "+";
        } else {
            this.mapScale = 1.0;
            if (this.mapResetZoomBtn) this.mapResetZoomBtn.textContent = "-";
        }
        this.applyMapScale();
    }
    
    renderMap() {
        if (!this.mapEl) return;
        this.mapEl.innerHTML = ''; 
        
        if (!this.hasInitializedMap && this.game.castles.length > 0) {
            this.fitMapToScreen();
            this.hasInitializedMap = true;
        }

        const isSelectionMode = (this.game.selectionMode !== null);
        if (this.mapGuide) { 
            if(isSelectionMode) {
                this.mapGuide.classList.remove('hidden'); 
                this.mapGuide.textContent = this.game.getSelectionGuideMessage();
            } else {
                this.mapGuide.classList.add('hidden'); 
            }
        }
        if (this.aiGuard) { if (this.game.isProcessingAI) this.aiGuard.classList.remove('hidden'); else this.aiGuard.classList.add('hidden'); }

        this.updateInfoPanel(this.currentCastle || this.game.getCurrentTurnCastle());

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
                if (isSelectionMode) { 
                    if (this.game.validTargets.includes(c.id)) { 
                        el.classList.add('selectable-target'); 
                        el.onclick = (e) => { e.stopPropagation(); this.game.resolveMapSelection(c); };
                    } else { 
                        el.classList.add('dimmed'); 
                    }
                } else { 
                    el.onclick = (e) => {
                        e.stopPropagation();
                        if (this.game.isProcessingAI) return;

                        if (this.mapScale < 0.8) {
                            this.mapScale = 1.0;
                            this.applyMapScale();
                            if(this.mapResetZoomBtn) this.mapResetZoomBtn.textContent = "-";
                            el.scrollIntoView({block: "center", inline: "center", behavior: "smooth"});
                        } else {
                            if (c.ownerClan === this.game.playerClanId) {
                                this.showControlPanel(c);
                            } else {
                                this.showControlPanel(c);
                            }
                        }
                    };
                }
            } else { 
                el.style.cursor = 'default'; 
            }
            this.mapEl.appendChild(el);
        });
    }
    
    toggleInfoPanel() {
        this.infoPanelCollapsed = !this.infoPanelCollapsed;
        this.updatePanelHeader(); 
    }

    toggleTopInfo() {
        this.topInfoExpanded = !this.topInfoExpanded;
        this.updateInfoPanel(this.currentCastle || this.game.getCurrentTurnCastle());
    }

    updateInfoPanel(castle) {
        if (!castle) return;
        
        if (this.pcMapOverlay) {
            const dateStr = `${this.game.year}年 ${this.game.month}月`;
            const rateStr = `米相場: ${this.game.marketRate.toFixed(2)}`;
            const clanData = this.game.clans.find(cd => cd.id === castle.ownerClan);
            const castellan = this.game.getBusho(castle.castellanId);
            const isVisible = this.game.isCastleVisible(castle);
            const mask = (val) => isVisible ? val : "???";

            let html = `
                <div class="overlay-header">
                    <strong>${dateStr}</strong>
                    <button class="toggle-btn" onclick="window.GameApp.ui.toggleInfoPanel()">${this.infoPanelCollapsed ? '▼' : '▲'}</button>
                </div>
                <div class="overlay-content ${this.infoPanelCollapsed ? 'collapsed' : ''}">
                    <div class="info-row"><span class="info-label">${rateStr}</span></div>
                    <hr style="margin:5px 0; border:0; border-top:1px dashed #ccc;">
                    <div class="info-row"><span class="info-label">拠点</span><span class="info-val">${castle.name} <small>(${clanData ? clanData.name : "中立"})</small></span></div>
                    <div class="info-row"><span class="info-label">城主</span><span class="info-val">${isVisible ? (castellan ? castellan.name : "-") : "???"}</span></div>
                    <div class="info-row"><span class="info-label">兵数</span><span class="info-val highlight-text">${mask(castle.soldiers)}</span></div>
                    <div class="info-row"><span class="info-label">金</span><span class="info-val">${mask(castle.gold)}</span> <span class="info-label">兵糧</span><span class="info-val">${mask(castle.rice)}</span></div>
                    <div class="info-row"><span class="info-label">防御</span><span class="info-val">${mask(castle.defense)}</span> <span class="info-label">人口</span><span class="info-val">${mask(castle.population)}</span></div>
                    <div class="info-row"><span class="info-label">訓練</span><span class="info-val">${mask(castle.training)}</span> <span class="info-label">士気</span><span class="info-val">${mask(castle.morale)}</span></div>
                    <div style="margin-top:5px; text-align:center;"><button class="btn-primary" style="padding:4px 10px; font-size:0.8rem;" onclick="window.GameApp.ui.openBushoSelector('view_only', ${castle.id})">武将一覧</button></div>
                </div>
            `;
            this.pcMapOverlay.innerHTML = html;
        }

        if (this.mobileTopLeft) {
            const isVisible = this.game.isCastleVisible(castle);
            const mask = (val) => isVisible ? val : "??";
            
            const toggleIcon = this.topInfoExpanded ? "▲" : "▼";
            const toggleBtn = `<button style="margin-left:5px; padding:2px 8px; border:1px solid #999; border-radius:4px; background:#fff; cursor:pointer;" onclick="window.GameApp.ui.toggleTopInfo()">${toggleIcon}</button>`;
            
            let content = `<div style="display:flex; justify-content:space-between; align-items:flex-start; width:100%;">`;
            content += `<div style="flex:1;"><div style="font-weight:bold;">${castle.name}</div>`;
            
            if (this.topInfoExpanded) {
                content += `<div>人口:${mask(castle.population)} 民忠:${mask(castle.loyalty)}</div>`;
                content += `<div>兵:${mask(castle.soldiers)} 防:${mask(castle.defense)}</div>`;
                content += `<div>金:${mask(castle.gold)} 米:${mask(castle.rice)}</div>`;
                content += `<div>訓練:${mask(castle.training)} 士気:${mask(castle.morale)}</div>`;
                content += `<div>石:${mask(castle.kokudaka)} 商:${mask(castle.commerce)}</div>`;
            } else {
                content += `<div>金:${mask(castle.gold)} 米:${mask(castle.rice)}</div>`;
                content += `<div>兵:${mask(castle.soldiers)}</div>`;
            }
            content += `</div>${toggleBtn}</div>`;

            this.mobileTopLeft.innerHTML = content;
        }
        if (this.mobileBottomInfo) {
            this.mobileBottomInfo.innerHTML = `
                <div style="display:flex; gap:10px; align-items:center;">
                    <span>${this.game.year}年${this.game.month}月</span>
                    <span>米相場:${this.game.marketRate.toFixed(2)}</span>
                </div>
                <div style="display:flex; gap:5px;">
                    <button class="btn-primary" style="padding:2px 8px; font-size:0.75rem;" onclick="window.GameApp.ui.openBushoSelector('view_only', ${castle.id})">武将一覧</button>
                    <button class="toggle-btn" onclick="window.GameApp.ui.toggleInfoPanel()">${this.infoPanelCollapsed ? '開' : '閉'}</button>
                </div>
            `;
             const cmdGrid = document.getElementById('command-area');
             if(cmdGrid) {
                 cmdGrid.style.display = this.infoPanelCollapsed ? 'none' : 'grid';
             }
        }
    }

    showControlPanel(castle) { 
        this.currentCastle = castle; 
        if(this.panelEl) this.panelEl.classList.remove('hidden');
        this.updatePanelHeader(); 
        
        if (castle.ownerClan === this.game.playerClanId) {
             if (!this.game.selectionMode) {
                 if (castle === this.game.getCurrentTurnCastle()) {
                     this.menuState = 'MAIN';
                     this.renderCommandMenu(); 
                 } else {
                     this.renderEnemyViewMenu();
                 }
             }
        } else {
            this.renderEnemyViewMenu();
        }
    }
    
    updatePanelHeader() { 
        if (!this.currentCastle) return; 
        this.updateInfoPanel(this.currentCastle);
        if(this.statusContainer) {
            this.statusContainer.innerHTML = ''; 
        }
    }

    renderEnemyViewMenu() {
        const mobileArea = document.getElementById('command-area');
        const pcArea = document.getElementById('pc-command-area');
        const areas = [mobileArea, pcArea];
        areas.forEach(area => {
            if(!area) return;
            area.innerHTML = '';
            if (area === mobileArea) {
                 const btn = document.createElement('button');
                 btn.className = 'cmd-btn back';
                 btn.textContent = "自拠点へ戻る";
                 btn.onclick = () => {
                     if(this.game.isProcessingAI) return;
                     const myCastle = this.game.getCurrentTurnCastle();
                     this.showControlPanel(myCastle);
                     const el = document.querySelector(`.castle-card[data-clan="${this.game.playerClanId}"]`); 
                     if(el) el.scrollIntoView({block:"center"});
                 };
                 area.appendChild(btn);
            }
        });
    }

    cancelMapSelection(keepMenuState = false) { 
        this.game.selectionMode = null; 
        this.game.validTargets = []; 
        this.renderMap();
        if (!keepMenuState) {
        }
    }

    renderCommandMenu() {
        const mobileArea = document.getElementById('command-area');
        const pcArea = document.getElementById('pc-command-area');
        const areas = [mobileArea, pcArea];
        
        areas.forEach(area => {
            if(!area) return;
            area.innerHTML = '';
            
            const createBtn = (label, cls, onClick) => { 
                const btn = document.createElement('button'); 
                btn.className = `cmd-btn ${cls || ''}`; 
                btn.textContent = label; 
                btn.onclick = () => {
                    if (this.game.isProcessingAI) return;
                    this.cancelMapSelection(true);
                    onClick();
                }; 
                area.appendChild(btn); 
            };
            const createEmpty = () => { const d = document.createElement('div'); area.appendChild(d); };
            
            if (this.menuState === 'MAIN') {
                createBtn("開発", "category", () => { this.menuState = 'DEVELOP'; this.renderCommandMenu(); });
                createBtn("軍事", "category", () => { this.menuState = 'MILITARY'; this.renderCommandMenu(); });
                createBtn("外交", "category", () => { this.menuState = 'DIPLOMACY'; this.renderCommandMenu(); });
                createBtn("調略", "category", () => { this.menuState = 'STRATEGY'; this.renderCommandMenu(); });
                createBtn("人事", "category", () => { this.menuState = 'PERSONNEL'; this.renderCommandMenu(); });
                createBtn("機能", "category", () => { this.menuState = 'SYSTEM'; this.renderCommandMenu(); });
                createBtn("命令終了", "finish", () => { 
                    if(confirm("今月の命令を終了しますか？")) {
                        this.game.finishTurn();
                    }
                });
            } else if (this.menuState === 'DEVELOP') {
                createBtn("石高開発", "", () => this.openBushoSelector('farm')); 
                createBtn("商業開発", "", () => this.openBushoSelector('commerce')); 
                createBtn("施し", "", () => this.openBushoSelector('charity')); 
                createEmpty(); createEmpty(); createEmpty();
                createBtn("戻る", "back", () => { this.menuState = 'MAIN'; this.renderCommandMenu(); });
            } else if (this.menuState === 'MILITARY') {
                createBtn("出陣", "", () => this.game.enterMapSelection('war')); 
                createBtn("徴兵", "", () => this.openBushoSelector('draft')); 
                createBtn("城壁修復", "", () => this.openBushoSelector('repair')); 
                createBtn("訓練", "", () => this.openBushoSelector('training')); 
                createBtn("兵施し", "", () => this.openBushoSelector('soldier_charity')); 
                createBtn("輸送", "", () => this.game.enterMapSelection('transport')); 
                createBtn("戻る", "back", () => { this.menuState = 'MAIN'; this.renderCommandMenu(); });
            } else if (this.menuState === 'STRATEGY') {
                createBtn("調査", "", () => this.game.enterMapSelection('investigate')); 
                createBtn("扇動", "", () => this.game.enterMapSelection('incite')); 
                createBtn("流言", "", () => this.game.enterMapSelection('rumor')); 
                createBtn("引抜", "", () => this.game.enterMapSelection('headhunt_select_castle'));
                createBtn("兵糧購入", "", () => this.openQuantitySelector('buy_rice')); 
                createBtn("兵糧売却", "", () => this.openQuantitySelector('sell_rice')); 
                createBtn("戻る", "back", () => { this.menuState = 'MAIN'; this.renderCommandMenu(); });
            } else if (this.menuState === 'DIPLOMACY') {
                createBtn("親善", "", () => this.game.enterMapSelection('goodwill')); 
                createBtn("同盟", "", () => this.game.enterMapSelection('alliance')); 
                createBtn("同盟解消", "", () => this.game.enterMapSelection('break_alliance')); 
                createEmpty(); createEmpty(); createEmpty(); 
                createBtn("戻る", "back", () => { this.menuState = 'MAIN'; this.renderCommandMenu(); });
            } else if (this.menuState === 'PERSONNEL') {
                createBtn("軍師任命", "", () => this.openBushoSelector('appoint_gunshi', null, {allowDone: true}));
                createBtn("城主任命", "", () => this.openBushoSelector('appoint', null, {allowDone: true})); 
                createBtn("面談", "", () => this.openBushoSelector('interview', null, {allowDone: true}));
                createBtn("褒美", "", () => this.openBushoSelector('reward'));
                createBtn("登用", "", () => this.openBushoSelector('employ_target')); 
                createBtn("移動", "", () => this.game.enterMapSelection('move')); 
                createBtn("追放", "", () => this.openBushoSelector('banish')); 
                createEmpty();
                createBtn("戻る", "back", () => { this.menuState = 'MAIN'; this.renderCommandMenu(); });
            } else if (this.menuState === 'SYSTEM') {
                createBtn("ファイル保存", "", () => window.GameApp.saveGameToFile()); 
                createBtn("ファイル読込", "", () => { const f = document.getElementById('load-file-input'); if(f) f.click(); }); 
                createBtn("履歴", "", () => this.showHistoryModal());
                createEmpty(); createEmpty(); createEmpty(); 
                createBtn("戻る", "back", () => { this.menuState = 'MAIN'; this.renderCommandMenu(); });
            }
        });
    }
    
    showGunshiAdvice(action, onConfirm) {
        if (action.type === 'war' || this.game.warManager.state.active) {
            const warAdvice = this.game.warManager.getGunshiAdvice(action);
            if (warAdvice) {
                const gunshi = this.game.getClanGunshi(this.game.playerClanId);
                if (this.gunshiModal) {
                    this.gunshiModal.classList.remove('hidden'); 
                    if(this.gunshiName) this.gunshiName.textContent = `軍師: ${gunshi ? gunshi.name : '???'}`; 
                    if(this.gunshiMessage) this.gunshiMessage.textContent = warAdvice;
                }
                if (this.gunshiExecuteBtn) this.gunshiExecuteBtn.onclick = () => { if(this.gunshiModal) this.gunshiModal.classList.add('hidden'); onConfirm(); };
                return;
            }
        }

        if (['farm','commerce','repair','draft','charity','transport','appoint_gunshi','appoint','banish','training','soldier_charity','buy_rice','sell_rice','interview','reward'].includes(action.type)) { onConfirm(); return; }
        const gunshi = this.game.getClanGunshi(this.game.playerClanId); if (!gunshi) { onConfirm(); return; }
        const seed = this.game.year * 100 + this.game.month + (action.type.length) + (action.targetId || 0) + (action.val || 0);
        const msg = GameSystem.getGunshiAdvice(gunshi, action, seed);
        if (this.gunshiModal) {
            this.gunshiModal.classList.remove('hidden'); 
            if(this.gunshiName) this.gunshiName.textContent = `軍師: ${gunshi.name}`; 
            if(this.gunshiMessage) this.gunshiMessage.textContent = msg;
        }
        if (this.gunshiExecuteBtn) this.gunshiExecuteBtn.onclick = () => { if(this.gunshiModal) this.gunshiModal.classList.add('hidden'); onConfirm(); };
    }

    openBushoSelector(actionType, targetId = null, extraData = null, onBack = null) {
        if (actionType === 'appoint' && this.currentCastle) { const isDaimyoHere = this.game.getCastleBushos(this.currentCastle.id).some(b => b.isDaimyo); if (isDaimyoHere) { alert("大名の居城は城主を変更できません"); return; } }
        
        if (this.selectorModal) this.selectorModal.classList.remove('hidden'); 
        if (document.getElementById('selector-title')) document.getElementById('selector-title').textContent = "武将を選択"; 
        
        const backBtn = document.querySelector('#selector-modal .btn-secondary');
        if(backBtn) {
            backBtn.onclick = () => {
                this.closeSelector();
                if (onBack) {
                    onBack(); 
                }
            };
        }

        if (this.selectorList) this.selectorList.innerHTML = '';
        const contextEl = document.getElementById('selector-context-info'); if(contextEl) contextEl.classList.remove('hidden'); 
        const c = this.currentCastle; 
        let infoHtml = ""; let sortKey = 'strength';
        let bushos = []; let isMulti = false;
        
        let isEnemyTarget = false;
        let targetCastle = null;
        if (['rumor_target_busho','headhunt_target','view_only'].includes(actionType)) {
             isEnemyTarget = true;
             targetCastle = this.game.getCastle(targetId);
        }

        const gunshi = this.game.getClanGunshi(this.game.playerClanId);
        const myDaimyo = this.game.bushos.find(b => b.clan === this.game.playerClanId && b.isDaimyo);

        if (['farm','commerce','repair','draft','charity','training','soldier_charity','war_deploy','transport_deploy','investigate_deploy'].includes(actionType)) {
            isMulti = true;
        }

        if (actionType === 'appoint_gunshi') { bushos = this.game.bushos.filter(b => b.clan === this.game.playerClanId && !b.isDaimyo && !b.isCastellan && b.status !== 'ronin' && b.status !== 'dead'); infoHtml = "<div>軍師に任命する武将を選択してください (知略重視)</div>"; sortKey = 'intelligence'; } 
        else if (actionType === 'employ_target') { bushos = this.game.getCastleBushos(c.id).filter(b => b.status === 'ronin'); infoHtml = "<div>登用する在野武将を選択してください</div>"; sortKey = 'strength'; } 
        else if (actionType === 'employ_doer') { bushos = this.game.getCastleBushos(c.id).filter(b => b.status !== 'ronin'); infoHtml = "<div>登用を行う担当官を選択してください (魅力重視)</div>"; sortKey = 'charm'; } 
        else if (actionType === 'diplomacy_doer') { bushos = this.game.getCastleBushos(c.id).filter(b => b.status !== 'ronin'); infoHtml = "<div>外交の担当官を選択してください (外交重視)</div>"; sortKey = 'diplomacy'; }
        else if (actionType === 'rumor_target_busho') { 
            bushos = this.game.getCastleBushos(targetId).filter(b => b.status !== 'ronin' && !b.isDaimyo && !b.isCastellan); 
            infoHtml = "<div>流言の対象とする武将を選択してください</div>"; sortKey = 'loyalty'; 
        }
        else if (actionType === 'rumor_doer') { bushos = this.game.getCastleBushos(c.id).filter(b => b.status !== 'ronin'); infoHtml = "<div>流言を実行する担当官を選択してください</div>"; sortKey = 'intelligence'; }
        else if (actionType === 'incite_doer') { bushos = this.game.getCastleBushos(c.id).filter(b => b.status !== 'ronin'); infoHtml = "<div>扇動を実行する担当官を選択してください</div>"; sortKey = 'intelligence'; }
        else if (actionType === 'headhunt_target') { 
            bushos = this.game.getCastleBushos(targetId).filter(b => b.status !== 'ronin' && !b.isDaimyo && !b.isCastellan); 
            infoHtml = "<div>引抜の対象とする武将を選択してください (忠誠・義理重視)</div>"; sortKey = 'loyalty'; 
        }
        else if (actionType === 'headhunt_doer') { bushos = this.game.getCastleBushos(c.id).filter(b => b.status !== 'ronin'); infoHtml = "<div>引抜を実行する担当官を選択してください (知略重視)</div>"; sortKey = 'intelligence'; }
        else if (actionType === 'interview') { bushos = this.game.getCastleBushos(c.id).filter(b => b.status !== 'ronin'); infoHtml = "<div>面談する武将を選択してください</div>"; sortKey = 'leadership'; }
        else if (actionType === 'interview_target') { 
            bushos = this.game.bushos.filter(b => b.clan === this.game.playerClanId && b.status !== 'dead' && b.status !== 'ronin' && b.id !== extraData.interviewer.id && !b.isDaimyo); 
            infoHtml = `<div>誰についての印象を聞きますか？(同家臣のみ)</div>`; sortKey = 'leadership'; 
        }
        else if (actionType === 'reward') { bushos = this.game.getCastleBushos(c.id).filter(b => b.status !== 'ronin'); infoHtml = "<div>褒美を与える武将を選択してください</div>"; sortKey = 'loyalty'; }
        else if (actionType === 'investigate_deploy') { bushos = this.game.getCastleBushos(c.id).filter(b => b.status !== 'ronin'); infoHtml = "<div>調査を行う武将を選択してください(複数可)</div>"; sortKey = 'intelligence'; }
        else if (actionType === 'view_only') { bushos = this.game.getCastleBushos(targetId); infoHtml = "<div>武将一覧 (精度により情報は隠蔽されます)</div>"; sortKey = 'leadership'; }
        else {
            bushos = this.game.getCastleBushos(c.id).filter(b => b.status !== 'ronin');
            if (actionType === 'farm' || actionType === 'commerce') { infoHtml = `<div>金: ${c.gold} (1回500)</div>`; sortKey = 'politics'; }
            else if (actionType === 'charity') { infoHtml = `<div>金: ${c.gold}, 米: ${c.rice} (1回300)</div>`; sortKey = 'charm'; }
            else if (actionType === 'repair') { infoHtml = `<div>金: ${c.gold} (1回300)</div>`; sortKey = 'politics'; }
            else if (actionType === 'draft') { infoHtml = `<div>民忠: ${c.loyalty}</div>`; sortKey = 'leadership'; }
            else if (actionType === 'training' || actionType === 'soldier_charity') { infoHtml = `<div>状態: 訓練${c.training}/士気${c.morale}</div>`; sortKey = 'leadership'; }
            else if (actionType === 'war_deploy' || actionType === 'move_deploy') { sortKey = 'strength'; }
            else if (actionType === 'appoint') { sortKey = 'leadership'; }
        }
        if (contextEl) contextEl.innerHTML = infoHtml;
        
        bushos.sort((a,b) => {
            const getSortVal = (target) => {
                 let acc = null;
                 if (isEnemyTarget && targetCastle) acc = targetCastle.investigatedAccuracy;
                 if (isEnemyTarget) return GameSystem.getPerceivedStatValue(target, sortKey, gunshi, acc, this.game.playerClanId, myDaimyo) || 0;
                 const val = GameSystem.getPerceivedStatValue(target, sortKey, gunshi, null, this.game.playerClanId, myDaimyo);
                 return val === null ? 0 : val;
            };
            return getSortVal(b) - getSortVal(a);
        });

        const updateContextCost = () => { 
            if (!isMulti || !contextEl) return; 
            const checkedCount = document.querySelectorAll('input[name="sel_busho"]:checked').length; 
            let cost = 0, item = ""; 
            if (['farm','commerce'].includes(actionType)) { cost = checkedCount * 500; item = "金"; } 
            if (['repair','charity'].includes(actionType)) { cost = checkedCount * 300; item = "金"; } 
            if (cost > 0) contextEl.innerHTML = `<div>消費予定 ${item}: ${cost} (所持: ${item==='金'?c.gold:c.rice})</div>`; 
        };

        bushos.forEach(b => {
            if (actionType === 'banish' && b.isCastellan) return; if (actionType === 'employ_target' && b.isDaimyo) return;
            
            let isSelectable = !b.isActionDone; 
            if (extraData && extraData.allowDone) isSelectable = true; 
            if (['employ_target','appoint_gunshi','rumor_target_busho','headhunt_target','interview_target','reward','view_only'].includes(actionType)) isSelectable = true;
            
            let acc = null; if (isEnemyTarget && targetCastle) acc = targetCastle.investigatedAccuracy;
            const getStat = (stat) => GameSystem.getDisplayStatHTML(b, stat, gunshi, acc, this.game.playerClanId, myDaimyo);

            const div = document.createElement('div'); div.className = `select-item ${!isSelectable ? 'disabled' : ''}`;
            const inputType = isMulti ? 'checkbox' : 'radio';
            const inputHtml = actionType === 'view_only' ? '' : `<input type="${inputType}" name="sel_busho" value="${b.id}" ${!isSelectable ? 'disabled' : ''} style="grid-column:1;">`;
            
            div.innerHTML = `${inputHtml}<span class="col-act" style="grid-column:2;">${b.isActionDone?'[済]':'[未]'}</span><span class="col-name" style="grid-column:3;">${b.name}</span><span class="col-rank" style="grid-column:4;">${b.getRankName()}</span><span class="col-stat" style="grid-column:5;">${getStat('leadership')}</span><span class="col-stat" style="grid-column:6;">${getStat('strength')}</span><span class="col-stat" style="grid-column:7;">${getStat('politics')}</span><span class="col-stat" style="grid-column:8;">${getStat('diplomacy')}</span><span class="col-stat" style="grid-column:9;">${getStat('intelligence')}</span><span class="col-stat" style="grid-column:10;">${getStat('charm')}</span>`;
            
            if(isSelectable && actionType !== 'view_only') { 
                div.onclick = (e) => { if(e.target.tagName !== 'INPUT') div.querySelector('input').click(); updateContextCost(); }; 
            }
            this.selectorList.appendChild(div);
        });
        if (bushos.length === 0 && this.selectorList) this.selectorList.innerHTML = "<div style='padding:10px;'>対象となる武将がいません</div>";
        
        if (this.selectorConfirmBtn) {
            if (actionType === 'view_only') {
                this.selectorConfirmBtn.classList.add('hidden'); 
            } else {
                this.selectorConfirmBtn.classList.remove('hidden');
                this.selectorConfirmBtn.onclick = () => {
                    const inputs = document.querySelectorAll('input[name="sel_busho"]:checked'); if (inputs.length === 0) return;
                    const selectedIds = Array.from(inputs).map(i => parseInt(i.value)); this.closeSelector();
                    
                    if (actionType === 'employ_target') this.openBushoSelector('employ_doer', null, { targetId: selectedIds[0] });
                    else if (actionType === 'employ_doer') this.showGunshiAdvice({type: 'employ', targetId: extraData.targetId}, () => this.game.commandSystem.executeEmploy(selectedIds[0], extraData.targetId));
                    else if (actionType === 'headhunt_target') this.openBushoSelector('headhunt_doer', null, { targetId: selectedIds[0] }); 
                    else if (actionType === 'headhunt_doer') this.openQuantitySelector('headhunt_gold', selectedIds, extraData.targetId); 
                    else if (actionType === 'interview') { const interviewer = this.game.getBusho(selectedIds[0]); this.showInterviewModal(interviewer); }
                    else if (actionType === 'interview_target') { const target = this.game.getBusho(selectedIds[0]); const interviewer = extraData.interviewer; this.game.commandSystem.executeInterviewTopic(interviewer, target); }
                    else if (actionType === 'reward') this.openQuantitySelector('reward', selectedIds);
                    else if (actionType === 'investigate_deploy') this.showGunshiAdvice({type:'investigate'}, () => this.game.commandSystem.executeInvestigate(selectedIds, targetId));
                    else if (actionType === 'diplomacy_doer') { if (extraData.subAction === 'goodwill') this.openQuantitySelector('goodwill', selectedIds, targetId); else if (extraData.subAction === 'alliance') this.showGunshiAdvice({type:'diplomacy'}, () => this.game.commandSystem.executeDiplomacy(selectedIds[0], targetId, 'alliance')); else if (extraData.subAction === 'break_alliance') this.game.commandSystem.executeDiplomacy(selectedIds[0], targetId, 'break_alliance'); } 
                    else if (actionType === 'draft') this.openQuantitySelector('draft', selectedIds);
                    else if (actionType === 'charity') this.openQuantitySelector('charity', selectedIds);
                    else if (actionType === 'war_deploy') this.openQuantitySelector('war', selectedIds, targetId);
                    else if (actionType === 'transport_deploy') this.openQuantitySelector('transport', selectedIds, targetId);
                    else if (actionType === 'appoint_gunshi') this.game.commandSystem.executeAppointGunshi(selectedIds[0]);
                    else if (actionType === 'incite_doer') this.showGunshiAdvice({type:'incite'}, () => this.game.commandSystem.executeIncite(selectedIds[0], targetId));
                    else if (actionType === 'rumor_target_busho') this.openBushoSelector('rumor_doer', targetId, { targetBushoId: selectedIds[0] });
                    else if (actionType === 'rumor_doer') this.showGunshiAdvice({type:'rumor'}, () => this.game.commandSystem.executeRumor(selectedIds[0], targetId, extraData.targetBushoId));
                    else if (actionType === 'appoint') this.game.commandSystem.executeCommand('appoint', selectedIds, targetId);
                    else { this.showGunshiAdvice({type:actionType}, () => this.game.commandSystem.executeCommand(actionType, selectedIds, targetId)); }
                };
            }
        }
    }
    
    showInterviewModal(busho) {
        if (!this.resultModal) return;
        this.resultModal.classList.remove('hidden');
        let content = "";
        const isSelf = busho.isDaimyo && busho.clan === this.game.playerClanId;
        if (isSelf) {
            content = `<h3>独り言 (${busho.name})</h3><div style="margin:20px 0; text-align:left;"><p>（ふむ……${busho.ambition >= 80 ? "天下統一も夢ではないか。" : "家の安泰こそ第一。無理は禁物だ。"}）</p><p>（家中の者たちはどう思っているのか……）</p><div style="margin-top:20px; display:flex; flex-direction:column; gap:10px;"><button class="btn-primary" id="interview-ask">他者について考える</button><button class="btn-secondary" onclick="window.GameApp.ui.reopenInterviewSelector()">戻る</button></div></div>`;
        } else {
            content = `<h3>${busho.name}との面談</h3><div style="margin:20px 0; text-align:left;"><p>「殿、どのようなご用件でしょうか？」</p><div style="margin-top:20px; display:flex; flex-direction:column; gap:10px;"><button class="btn-primary" id="interview-status">調子はどうだ</button><button class="btn-primary" id="interview-ask">他者について聞く</button><button class="btn-secondary" onclick="window.GameApp.ui.reopenInterviewSelector()">戻る</button></div></div>`;
        }
        if (this.resultBody) this.resultBody.innerHTML = content;
        
        const statusBtn = document.getElementById('interview-status');
        if (statusBtn) statusBtn.onclick = () => { this.game.commandSystem.executeInterviewStatus(busho); };
        
        const askBtn = document.getElementById('interview-ask');
        if (askBtn) askBtn.onclick = () => { 
            this.closeResultModal(); 
            this.openBushoSelector('interview_target', null, { interviewer: busho }); 
        };
    }
    reopenInterviewSelector() { this.closeResultModal(); this.openBushoSelector('interview', null, {allowDone: true}); }
    
    reopenInterviewModal(busho) {
        this.closeResultModal();
        setTimeout(() => this.showInterviewModal(busho), 100);
    }

    openQuantitySelector(type, data, targetId) {
        if (!this.quantityModal) return;
        this.quantityModal.classList.remove('hidden'); 
        if (this.quantityContainer) this.quantityContainer.innerHTML = '';
        if (this.charityTypeSelector) this.charityTypeSelector.classList.add('hidden'); 
        if (this.tradeTypeInfo) this.tradeTypeInfo.classList.add('hidden'); 
        const c = this.currentCastle;
        const createSlider = (label, id, max, currentVal) => { const wrap = document.createElement('div'); wrap.className = 'qty-row'; wrap.innerHTML = `<label>${label} (Max: ${max})</label><div class="qty-control"><input type="range" id="range-${id}" min="0" max="${max}" value="${currentVal}"><input type="number" id="num-${id}" min="0" max="${max}" value="${currentVal}"></div>`; const range = wrap.querySelector(`#range-${id}`); const num = wrap.querySelector(`#num-${id}`); range.oninput = () => num.value = range.value; num.oninput = () => range.value = num.value; this.quantityContainer.appendChild(wrap); return { range, num }; };
        let inputs = {};
        
        if (type === 'reward') {
            document.getElementById('quantity-title').textContent = "褒美"; inputs.gold = createSlider("金 (1-200)", "gold", Math.min(c.gold, 200), 1);
            this.quantityConfirmBtn.onclick = () => { const val = parseInt(inputs.gold.num.value); if(val<=0) return; this.quantityModal.classList.add('hidden'); this.game.commandSystem.executeReward(data[0], val); };
        } else if (type === 'draft') {
            document.getElementById('quantity-title').textContent = "徴兵資金"; inputs.gold = createSlider("金", "gold", c.gold, 0);
            this.quantityConfirmBtn.onclick = () => { const val = parseInt(inputs.gold.num.value); if(val <= 0) return; this.quantityModal.classList.add('hidden'); this.showGunshiAdvice({ type: 'draft', val: val }, () => this.game.commandSystem.executeDraft(data, val)); };
        } else if (type === 'charity') {
            document.getElementById('quantity-title').textContent = "施し"; this.charityTypeSelector.classList.remove('hidden'); const count = data.length; this.quantityContainer.innerHTML = `<p>選択武将数: ${count}名</p>`;
            this.quantityConfirmBtn.onclick = () => { const charityType = document.querySelector('input[name="charityType"]:checked').value; this.quantityModal.classList.add('hidden'); this.showGunshiAdvice({ type: 'charity' }, () => this.game.commandSystem.executeCharity(data, charityType)); };
        } else if (type === 'goodwill') {
            document.getElementById('quantity-title').textContent = "贈与金指定"; inputs.gold = createSlider("金", "gold", c.gold, 100);
            this.quantityConfirmBtn.onclick = () => { const val = parseInt(inputs.gold.num.value); if(val < 100) { alert("金が足りません"); return; } this.quantityModal.classList.add('hidden'); this.showGunshiAdvice({ type: 'goodwill' }, () => this.game.commandSystem.executeDiplomacy(data[0], targetId, 'goodwill', val)); };
        } else if (type === 'headhunt_gold') {
            document.getElementById('quantity-title').textContent = "持参金 (任意)"; inputs.gold = createSlider("金", "gold", c.gold, 0);
            this.quantityConfirmBtn.onclick = () => { const val = parseInt(inputs.gold.num.value); this.quantityModal.classList.add('hidden'); this.showGunshiAdvice({ type: 'headhunt' }, () => this.game.commandSystem.executeHeadhunt(data[0], targetId, val)); };
        } else if (type === 'war') {
            document.getElementById('quantity-title').textContent = "出陣兵数指定"; inputs.soldiers = createSlider("兵士数", "soldiers", c.soldiers, c.soldiers);
            // WarManager経由に変更
            this.quantityConfirmBtn.onclick = () => { 
                const val = parseInt(inputs.soldiers.num.value); 
                if(val <= 0) { alert("兵士0"); return; } 
                this.quantityModal.classList.add('hidden'); 
                // 変更: 確認メッセージを表示
                const targetName = this.game.getCastle(targetId).name;
                if (!confirm(`${targetName}に攻め込みますか？\n今月の命令は終了となります。`)) {
                    return; 
                }
                this.showGunshiAdvice({ type: 'war' }, () => this.game.warManager.startWar(c, this.game.getCastle(targetId), data.map(id=>this.game.getBusho(id)), val)); 
            };
        } else if (type === 'transport') {
            document.getElementById('quantity-title').textContent = "輸送物資指定"; inputs.gold = createSlider("金", "gold", c.gold, 0); inputs.rice = createSlider("兵糧", "rice", c.rice, 0); inputs.soldiers = createSlider("兵士", "soldiers", c.soldiers, 0);
            this.quantityConfirmBtn.onclick = () => { const vals = { gold: parseInt(inputs.gold.num.value), rice: parseInt(inputs.rice.num.value), soldiers: parseInt(inputs.soldiers.num.value) }; if(vals.gold===0 && vals.rice===0 && vals.soldiers===0) return; this.quantityModal.classList.add('hidden'); this.game.commandSystem.executeTransport(data, targetId, vals); };
        } else if (type === 'buy_rice') {
            document.getElementById('quantity-title').textContent = "兵糧購入"; const rate = this.game.marketRate; const maxBuy = Math.floor(c.gold / rate);
            this.tradeTypeInfo.classList.remove('hidden'); this.tradeTypeInfo.textContent = `相場: ${rate.toFixed(2)} (金1 -> 米${(1/rate).toFixed(2)})`;
            inputs.amount = createSlider("購入量(米)", "amount", maxBuy, 0);
            this.quantityConfirmBtn.onclick = () => { const val = parseInt(inputs.amount.num.value); if(val<=0) return; this.quantityModal.classList.add('hidden'); this.game.commandSystem.executeTrade('buy', val); };
        } else if (type === 'sell_rice') {
            document.getElementById('quantity-title').textContent = "兵糧売却"; const rate = this.game.marketRate;
            this.tradeTypeInfo.classList.remove('hidden'); this.tradeTypeInfo.textContent = `相場: ${rate.toFixed(2)} (米1 -> 金${rate.toFixed(2)})`;
            inputs.amount = createSlider("売却量(米)", "amount", c.rice, 0);
            this.quantityConfirmBtn.onclick = () => { const val = parseInt(inputs.amount.num.value); if(val<=0) return; this.quantityModal.classList.add('hidden'); this.game.commandSystem.executeTrade('sell', val); };
        } else if (type === 'war_repair') {
            // WarManager経由
            const s = this.game.warManager.state;
            const defender = s.defender;
            const maxSoldiers = Math.min(window.WarParams.War.RepairMaxSoldiers, defender.soldiers);
            document.getElementById('quantity-title').textContent = "補修 (兵士選択)";
            inputs.soldiers = createSlider("使用兵士数", "soldiers", maxSoldiers, Math.min(50, maxSoldiers));
             this.quantityConfirmBtn.onclick = () => {
                const val = parseInt(inputs.soldiers.num.value);
                if (val <= 0) return;
                this.quantityModal.classList.add('hidden');
                this.game.warManager.execWarCmd('repair', val);
            };
        }
    }

    updateWarUI() {
        if (!this.game.warManager.state.active) return;
        const s = this.game.warManager.state;
        
        const setTxt = (id, val) => { 
            const el = document.getElementById(id); 
            if(el) el.textContent = val; 
        };
        
        setTxt('war-atk-name', s.attacker.name);
        setTxt('war-atk-busho', s.atkBushos[0].name);
        setTxt('war-atk-soldier', s.attacker.soldiers);
        setTxt('war-atk-morale', `${s.attacker.morale} (訓練:${s.attacker.training})`);
        
        setTxt('war-def-name', s.defender.name);
        setTxt('war-def-busho', s.defBusho.name);
        setTxt('war-def-soldier', s.defender.soldiers);
        setTxt('war-def-wall', `${s.defender.defense} (士:${s.defender.morale}/訓:${s.defender.training})`);

        setTxt('war-round', s.round);
        
        const isAtkTurn = (s.turn === 'attacker');
        const actorName = isAtkTurn ? "攻撃側" : "守備側";
        setTxt('war-turn-actor', actorName);
    }

    renderWarControls(isAtkTurn) {
        const controls = document.getElementById('war-controls');
        if (!controls) return;
        controls.innerHTML = '';
        
        const commands = this.game.warManager.getAvailableCommands(isAtkTurn);

        if (commands.length === 0) {
            controls.classList.add('disabled-area');
            return;
        } else {
            controls.classList.remove('disabled-area');
        }

        commands.forEach(cmd => {
            const btn = document.createElement('button');
            btn.textContent = cmd.label;
            btn.onclick = () => this.game.warManager.execWarCmd(cmd.type);
            controls.appendChild(btn);
        });
    }

    showRetreatSelector(castle, candidates, onSelect) {
        if (!this.scenarioScreen) return; 
        this.scenarioScreen.classList.remove('hidden'); 
        const title = this.scenarioScreen.querySelector('h2');
        if(title) title.textContent = "撤退先選択";
        
        if (this.scenarioList) {
            this.scenarioList.innerHTML = '';
            candidates.forEach(c => {
                const div = document.createElement('div'); div.className = 'scenario-item';
                div.innerHTML = `<div class="scenario-title">${c.name}</div><div class="scenario-desc">兵数:${c.soldiers} 防御:${c.defense}</div>`;
                div.onclick = () => { 
                    this.scenarioScreen.classList.add('hidden'); 
                    onSelect(c.id); 
                };
                this.scenarioList.appendChild(div);
            });
        }
    }

    showPrisonerModal(captives) {
        if (!this.prisonerModal) return;
        this.prisonerModal.classList.remove('hidden');
        if (this.prisonerList) {
            this.prisonerList.innerHTML = '';
            captives.forEach((p, index) => {
                const div = document.createElement('div');
                div.className = 'select-item';
                div.style.display = 'flex';
                div.style.justifyContent = 'space-between';
                div.style.alignItems = 'center';
                
                // WarManager経由
                div.innerHTML = `
                    <div style="flex:1;">
                        <strong>${p.name}</strong> (${p.getRankName()})<br>
                        統:${p.leadership} 武:${p.strength} 智:${p.intelligence} 忠:${p.loyalty}
                    </div>
                    <div style="display:flex; gap:5px;">
                        <button class="btn-primary" onclick="window.GameApp.warManager.handlePrisonerAction(${index}, 'hire')">登用</button>
                        <button class="btn-secondary" onclick="window.GameApp.warManager.handlePrisonerAction(${index}, 'release')">解放</button>
                        <button class="btn-danger" onclick="window.GameApp.warManager.handlePrisonerAction(${index}, 'kill')">処断</button>
                    </div>
                `;
                this.prisonerList.appendChild(div);
            });
        }
    }
    closePrisonerModal() {
        if(this.prisonerModal) this.prisonerModal.classList.add('hidden');
    }

    showSuccessionModal(candidates, onSelect) {
        if (!this.successionModal) return;
        this.successionModal.classList.remove('hidden');
        if (this.successionList) {
            this.successionList.innerHTML = '';
            candidates.forEach(c => {
                const div = document.createElement('div');
                div.className = 'select-item';
                div.innerHTML = `<span>${c.name}</span> <span>統:${c.leadership} 政:${c.politics}</span>`;
                div.onclick = () => {
                    this.successionModal.classList.add('hidden');
                    onSelect(c.id);
                };
                this.successionList.appendChild(div);
            });
        }
    }
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
        this.relations = {}; 
        this.isProcessingAI = false; 
        this.marketRate = 1.0; 
        this.lastMenuState = null;
        
        // 分割したマネージャーの初期化
        this.commandSystem = new CommandSystem(this);
        this.warManager = new WarManager(this);
        this.aiEngine = new AIEngine(this);
    }
    getRelationKey(id1, id2) { return id1 < id2 ? `${id1}-${id2}` : `${id2}-${id1}`; }
    getRelation(id1, id2) { const key = this.getRelationKey(id1, id2); if (!this.relations[key]) this.relations[key] = { friendship: 50, alliance: false }; return this.relations[key]; }
    
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
            
            document.getElementById('app').classList.remove('hidden'); 
            this.ui.showStartScreen(this.clans, (clanId) => { this.playerClanId = clanId; this.init(); }); 
        } catch (e) {
            console.error(e);
            alert("シナリオデータの読み込みに失敗しました。");
            this.ui.returnToTitle();
        }
    }
    init() { this.startMonth(); }
    getBusho(id) { return this.bushos.find(b => b.id === id); }
    getCastle(id) { return this.castles.find(c => c.id === id); }
    getCastleBushos(cid) { const c = this.castles.find(c => c.id === cid); return c ? c.samuraiIds.map(id => this.getBusho(id)).filter(b => b) : []; }
    getCurrentTurnCastle() { return this.turnQueue[this.currentIndex]; }
    getCurrentTurnId() { return this.year * 12 + this.month; }
    getClanTotalSoldiers(clanId) { return this.castles.filter(c => c.ownerClan === clanId).reduce((sum, c) => sum + c.soldiers, 0); }
    getClanGunshi(clanId) { return this.bushos.find(b => b.clan === clanId && b.isGunshi); }
    isCastleVisible(castle) { if (castle.ownerClan === this.playerClanId) return true; if (castle.investigatedUntil >= this.getCurrentTurnId()) return true; return false; }
    
    startMonth() {
        this.marketRate = Math.max(window.MainParams.Economy.TradeRateMin, Math.min(window.MainParams.Economy.TradeRateMax, this.marketRate * (0.9 + Math.random()*window.MainParams.Economy.TradeFluctuation)));
        this.ui.showCutin(`${this.year}年 ${this.month}月`); this.ui.log(`=== ${this.year}年 ${this.month}月 ===`); this.processRoninMovements(); if (this.month % 3 === 0) this.optimizeCastellans(); const isPopGrowth = (this.month % 2 === 0);
        this.castles.forEach(c => {
            if (c.ownerClan === 0) return;
            c.isDone = false;
            let income = Math.floor(c.commerce * window.MainParams.Economy.IncomeGoldRate);
            income = GameSystem.applyVariance(income, window.MainParams.Economy.IncomeFluctuation);
            if(this.month === 3) income += 500; c.gold += income; 
            if(this.month === 9) {
                let riceIncome = c.kokudaka * window.MainParams.Economy.IncomeRiceRate;
                riceIncome = GameSystem.applyVariance(riceIncome, window.MainParams.Economy.IncomeFluctuation);
                c.rice += riceIncome;
            }
            if (isPopGrowth) { 
                let growth = 0;
                if(c.loyalty < 300) growth = -Math.floor(c.population * 0.01);
                else if(c.loyalty > 600) growth = Math.floor(c.population * 0.01);
                c.population = Math.max(0, c.population + growth);
            }
            const bushos = this.getCastleBushos(c.id);
            c.rice = Math.max(0, c.rice - Math.floor(c.soldiers * window.MainParams.Economy.ConsumeRicePerSoldier));
            c.gold = Math.max(0, c.gold - (bushos.length * window.MainParams.Economy.ConsumeGoldPerBusho));
            bushos.forEach(b => b.isActionDone = false);
        });
        this.turnQueue = this.castles.filter(c => c.ownerClan !== 0).sort(() => Math.random() - 0.5);
        this.currentIndex = 0; this.processTurn();
    }
    processRoninMovements() { const ronins = this.bushos.filter(b => b.status === 'ronin'); ronins.forEach(r => { const currentC = this.getCastle(r.castleId); if(!currentC) return; const neighbors = this.castles.filter(c => GameSystem.isAdjacent(currentC, c)); neighbors.forEach(n => { const castellan = this.getBusho(n.castellanId); if (Math.random() < 0.2) { currentC.samuraiIds = currentC.samuraiIds.filter(id => id !== r.id); n.samuraiIds.push(r.id); r.castleId = n.id; } }); }); }
    optimizeCastellans() { const clanIds = [...new Set(this.castles.filter(c=>c.ownerClan!==0).map(c=>c.ownerClan))]; clanIds.forEach(clanId => { const myBushos = this.bushos.filter(b => b.clan === clanId); if(myBushos.length===0) return; let daimyoInt = Math.max(...myBushos.map(b => b.intelligence)); if (Math.random() * 100 < daimyoInt) { const clanCastles = this.castles.filter(c => c.ownerClan === clanId); clanCastles.forEach(castle => { const castleBushos = this.getCastleBushos(castle.id).filter(b => b.status !== 'ronin'); if (castleBushos.length <= 1) return; castleBushos.sort((a, b) => (b.leadership + b.politics) - (a.leadership + a.politics)); const best = castleBushos[0]; if (best.id !== castle.castellanId) { const old = this.getBusho(castle.castellanId); if(old) old.isCastellan = false; best.isCastellan = true; castle.castellanId = best.id; } }); } }); }
    
    /**
 * 次の拠点のターンを処理する
 * game.js 内の GameManager クラスのメソッド
 */
    processTurn() {
        // 1. 合戦中で、かつプレイヤーが操作中の場合は、ターン進行を一時停止する
        if (this.warManager.state.active && this.warManager.state.isPlayerInvolved) return;
    
        // 2. 全ての拠点の処理が終わっていれば、月を更新して終了
        if (this.currentIndex >= this.turnQueue.length) { 
            this.endMonth(); 
            return; 
        }
    
        const castle = this.turnQueue[this.currentIndex];
        
        // 3. 拠点の持ち主（クラン）が既に滅亡している等の不整合チェック
        if(castle.ownerClan !== 0 && !this.clans.find(c => c.id === castle.ownerClan)) { 
            this.currentIndex++; 
            this.processTurn(); 
            return; 
        }
        
        // 4. マップを最新状態に更新
        this.ui.renderMap();
        
        if (castle.ownerClan === this.playerClanId) { 
            // --- プレイヤーのターンの場合 ---
            this.isProcessingAI = false;
            this.ui.renderMap();
            this.ui.log(`【${castle.name}】命令を下してください`);
            this.ui.showControlPanel(castle);
        } else { 
            // --- AI（敵大名）のターンの場合 ---
            this.isProcessingAI = true;
            this.ui.renderMap();
            if(this.ui.panelEl) this.ui.panelEl.classList.add('hidden');
            
            // 少し遅延を置いてAIの思考エンジンを起動する
            setTimeout(() => {
                try {
                    // AI思考エンジン(ai.js)へ処理を委譲
                    this.aiEngine.execAI(castle);
                } catch(e) {
                    // AIのプログラム内でエラーが起きた場合、ここでキャッチして強制的にターンを進める
                    console.error("AI Logic Error caught in processTurn:", e);
                    this.finishTurn();
                }
            }, 600);
        }
    }
    
    finishTurn() { 
        // 修正：プレイヤー関与に関わらず、合戦がアクティブならターンを終了させない
        if(this.warManager && this.warManager.state.active) return; 
        
        this.selectionMode = null; 
        const castle = this.getCurrentTurnCastle(); 
        if(castle) castle.isDone = true; 
        this.currentIndex++; 
        this.processTurn(); 
    }
    endMonth() { this.month++; if(this.month > 12) { this.month = 1; this.year++; } const clans = new Set(this.castles.filter(c => c.ownerClan !== 0).map(c => c.ownerClan)); const playerAlive = clans.has(this.playerClanId); if (clans.size === 1 && playerAlive) alert(`天下統一！`); else if (!playerAlive) alert(`我が軍は滅亡しました……`); else this.startMonth(); }

    enterMapSelection(mode) {
        this.lastMenuState = this.ui.menuState;
        this.selectionMode = mode;
        const c = this.getCurrentTurnCastle();
        this.validTargets = []; 
        
        if (mode === 'war') {
            this.validTargets = this.warManager.getValidWarTargets(c);
        } else if (mode === 'move' || mode === 'transport') {
            this.validTargets = this.castles.filter(target => 
                target.ownerClan === this.playerClanId && target.id !== c.id
            ).map(t => t.id);
        } else if (mode === 'investigate' || mode === 'incite' || mode === 'rumor') {
            this.validTargets = this.castles.filter(target => 
                target.ownerClan !== this.playerClanId && target.ownerClan !== 0
            ).map(t => t.id);
        } else if (mode === 'headhunt_select_castle') {
            this.validTargets = this.castles.filter(target => 
                target.ownerClan !== this.playerClanId && target.ownerClan !== 0
            ).map(t => t.id);
        } else if (mode === 'goodwill' || mode === 'alliance') {
            this.validTargets = this.castles.filter(target => 
                target.ownerClan !== 0 && target.ownerClan !== this.playerClanId
            ).map(t => t.id);
        } else if (mode === 'break_alliance') {
            this.validTargets = this.castles.filter(target => 
                target.ownerClan !== 0 && 
                target.ownerClan !== this.playerClanId &&
                this.getRelation(this.playerClanId, target.ownerClan).alliance === true
            ).map(t => t.id);
        }
        
        this.ui.renderMap();
        this.ui.log(this.getSelectionGuideMessage());
    }

    getSelectionGuideMessage() {
        switch(this.selectionMode) {
            case 'war': return "攻撃目標を選択してください(攻略直後の城は選択不可)";
            case 'move': return "移動先を選択してください";
            case 'transport': return "輸送先を選択してください";
            case 'investigate': return "調査対象の城を選択してください";
            case 'incite': return "扇動対象の城を選択してください";
            case 'rumor': return "流言対象の城を選択してください";
            case 'headhunt_select_castle': return "引抜対象の居城を選択してください";
            case 'goodwill': case 'alliance': return "外交相手を選択してください";
            case 'break_alliance': return "同盟破棄する相手を選択してください";
            default: return "対象を選択してください";
        }
    }

    resolveMapSelection(targetCastle) {
        if (!this.validTargets.includes(targetCastle.id)) return;
        
        const mode = this.selectionMode;
        this.ui.cancelMapSelection(); 

        const onBackToMap = () => {
            this.enterMapSelection(mode);
        };

        if (mode === 'war') {
            this.ui.openBushoSelector('war_deploy', targetCastle.id, null, onBackToMap);
        } else if (mode === 'move') {
            this.ui.openBushoSelector('move_deploy', targetCastle.id, null, onBackToMap);
        } else if (mode === 'transport') {
            this.ui.openBushoSelector('transport_deploy', targetCastle.id, null, onBackToMap);
        } else if (mode === 'investigate') {
            this.ui.openBushoSelector('investigate_deploy', targetCastle.id, null, onBackToMap);
        } else if (mode === 'incite') {
            this.ui.openBushoSelector('incite_doer', targetCastle.id, null, onBackToMap);
        } else if (mode === 'rumor') {
            this.ui.openBushoSelector('rumor_target_busho', targetCastle.id, null, onBackToMap);
        } else if (mode === 'headhunt_select_castle') {
            this.ui.openBushoSelector('headhunt_target', targetCastle.id, null, onBackToMap);
        } else if (mode === 'goodwill') {
            this.ui.openBushoSelector('diplomacy_doer', targetCastle.id, { subAction: 'goodwill' }, onBackToMap);
        } else if (mode === 'alliance') {
            this.ui.openBushoSelector('diplomacy_doer', targetCastle.id, { subAction: 'alliance' }, onBackToMap);
        } else if (mode === 'break_alliance') {
            this.ui.openBushoSelector('diplomacy_doer', targetCastle.id, { subAction: 'break_alliance' }, onBackToMap);
        }
    }

    // 変更: 全武将が行動完了したかチェックするメソッド
    checkAllActionsDone() {
        const c = this.getCurrentTurnCastle();
        const bushos = this.getCastleBushos(c.id).filter(b => b.status !== 'ronin');
        if(bushos.length > 0 && bushos.every(b => b.isActionDone)) {
             setTimeout(() => {
                 if(confirm("すべての武将が行動を終えました。\n今月の命令を終了しますか？")) {
                     this.finishTurn();
                 }
             }, 100);
        }
    }

    changeLeader(clanId, newLeaderId) { this.bushos.filter(b => b.clan === clanId).forEach(b => b.isDaimyo = false); const newLeader = this.getBusho(newLeaderId); if(newLeader) { newLeader.isDaimyo = true; this.clans.find(c => c.id === clanId).leaderId = newLeaderId; } }
    
    saveGameToFile() { 
        const data = { 
            year: this.year, month: this.month, 
            castles: this.castles, bushos: this.bushos, clans: this.clans,
            playerClanId: this.playerClanId, relations: this.relations 
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
                this.year = d.year; this.month = d.month; this.playerClanId = d.playerClanId || 1; 
                this.castles = d.castles.map(c => new Castle(c)); 
                this.bushos = d.bushos.map(b => new Busho(b)); 
                if(d.relations) this.relations = d.relations; 
                
                if (d.clans) {
                    this.clans = d.clans.map(c => new Clan(c));
                } else {
                    const scenario = SCENARIOS[0]; 
                    await DataManager.loadParameters("./parameter.csv");
                    const data = await DataManager.loadAll(scenario.folder);
                    this.clans = data.clans;
                }

                document.getElementById('title-screen').classList.add('hidden'); 
                document.getElementById('app').classList.remove('hidden'); 
                this.turnQueue = this.castles.filter(c => c.ownerClan !== 0).sort(() => Math.random() - 0.5);
                this.currentIndex = 0; 
                this.ui.showCutin(`ロード完了: ${this.year}年 ${this.month}月`);
                this.ui.hasInitializedMap = false; 
                this.ui.renderMap();
                this.processTurn();
            } catch(err) { console.error(err); alert("セーブデータの読み込みに失敗しました"); } 
        }; 
        reader.readAsText(file); 
    }
}

// 起動
window.addEventListener('DOMContentLoaded', () => {
    window.GameApp = new GameManager();
});


