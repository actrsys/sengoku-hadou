/**
 * strategy_system.js
 * 計略システムを一元管理するファイルです。
 */

class StrategySystem {
    constructor(game) {
        this.game = game;
    }
    
    // ==========================================
    // ★計略の能力スコアを計算する共通の処理（一箇所で管理・完全版）
    // ==========================================
    // --- 破壊工作 ---
    static getSabotageProbBase(busho) {
        return ((busho.strength * 1.5) + (Math.sqrt(busho.loyalty) * 2)) / 200;
    }
    static getSabotageDamageBase(busho) {
        return ((busho.intelligence * 1.5) + (Math.sqrt(busho.loyalty) * 2)) / 10;
    }
    static calcSabotageScore(busho) {
        return StrategySystem.getSabotageProbBase(busho) * StrategySystem.getSabotageDamageBase(busho);
    }

    // --- 民心撹乱（扇動） ---
    static getInciteProbBase(busho) {
        return ((busho.strength * 1.5) + (Math.sqrt(busho.loyalty) * 2)) / 150;
    }
    static getInciteDamageBase(busho) {
        return ((busho.intelligence * 1.5) + (Math.sqrt(busho.loyalty) * 2)) / 20;
    }
    static calcInciteScore(busho) {
        const dummyLoyaltyBonus = 1.3;
        return (StrategySystem.getInciteProbBase(busho) / dummyLoyaltyBonus) * (StrategySystem.getInciteDamageBase(busho) / dummyLoyaltyBonus);
    }

    // --- 離間計 ---
    static calcRumorScore(busho) {
        // ソート用に新仕様に合わせたスコアを計算します
        const strMod = (busho.strength + (Math.sqrt(busho.loyalty) * 2)) / 150;
        const intMod = (busho.intelligence + (Math.sqrt(busho.loyalty) * 2)) / 10;
        return strMod * intMod;
    }
    
    // --- 引抜 ---
    static calcHeadhuntScore(busho) {
        return (busho.intelligence * 0.8) + (busho.charm * 0.2) + (busho.loyalty * 0.1);
    }

    // --- 暗殺 ---
    static calcAssassinateScore(busho) {
        let score = busho.strength;
        if (typeof SkillManager !== 'undefined') {
            score += SkillManager.getNinjutsuLevel(busho) * 20;
        }
        return score;
    }

    // --- 駆虎呑狼 ---
    static getKukoProbBase(busho) {
        return (busho.intelligence + (Math.sqrt(busho.loyalty) * 2)) / 180;
    }
    static getKukoDamageBase(busho) {
        return (busho.diplomacy + (Math.sqrt(busho.loyalty) * 2)) / 12;
    }
    static calcKukoScore(busho) {
        return StrategySystem.getKukoProbBase(busho) * StrategySystem.getKukoDamageBase(busho);
    }
    
    // ★追加：対象が役職者本人か、役職持ちの一門か、ただの一門かなどを判定する魔法です（一元化）
    // 戻り値：3(役職者本人), 2(役職持ちの一門), 1(同じ勢力に一門がいる), 0(それ以外)

    // ★軽量化：AIが同じ敵勢力の武将を何十人も評価する時に使う早見表を1回だけ作ります。
    // familyIds の「共通IDがあるか」という従来判定をそのまま、人数カウントと役職者Setへ変換します。
    buildOfficerStatusContext(clanId) {
        const numericClanId = Number(clanId);
        const familyCounts = new Map();
        const officerFamilyIds = new Set();
        const memberIds = new Set();

        const clanCastles = this.game.getClanCastles(numericClanId);
        for (const c of clanCastles) {
            const members = this.game.getCastleBushos(c.id);
            for (const b of members) {
                if (!b || Number(b.clan) !== numericClanId || !window.BushoStatusRules.isActive(b)) continue;
                memberIds.add(Number(b.id));
                const seen = new Set(Array.isArray(b.familyIds) ? b.familyIds : []);
                const isOfficer = !!(b.isDaimyo || b.isCastellan || b.isCommander || b.isGunshi);
                for (const fId of seen) {
                    familyCounts.set(fId, (familyCounts.get(fId) || 0) + 1);
                    if (isOfficer) officerFamilyIds.add(fId);
                }
            }
        }

        return { clanId: numericClanId, familyCounts, officerFamilyIds, memberIds };
    }

    checkOfficerStatus(targetBusho, context = null) {
        if (!targetBusho) return 0;

        // レベル3: 役職者本人
        if (targetBusho.isDaimyo || targetBusho.isCastellan || targetBusho.isCommander || targetBusho.isGunshi) {
            return 3;
        }

        const targetClanId = Number(targetBusho.clan);
        if (targetClanId <= 0 || !Array.isArray(targetBusho.familyIds) || targetBusho.familyIds.length === 0) return 0;

        const ctx = (context && Number(context.clanId) === targetClanId)
            ? context
            : this.buildOfficerStatusContext(targetClanId);

        let hasFamily = false;
        // 早見表の城内名簿に対象本人が実際に含まれている時だけ、本人1人分を差し引きます。
        // セーブ移行直後など名簿が一時的に不整合でも、従来の「target本人を除外」と同じ結果を保ちます。
        const ownContribution = ctx.memberIds && ctx.memberIds.has(Number(targetBusho.id)) ? 1 : 0;
        const seenTargetIds = new Set();

        for (const fId of targetBusho.familyIds) {
            if (seenTargetIds.has(fId)) continue;
            seenTargetIds.add(fId);

            if (ctx.officerFamilyIds.has(fId)) {
                return 2; // レベル2: 役職持ちの一門がいる
            }
            if ((ctx.familyCounts.get(fId) || 0) > ownContribution) {
                hasFamily = true;
            }
        }

        return hasFamily ? 1 : 0;
    }
    
    // ==========================================
    // ★計略コマンドの計算処理（game.jsからのお引っ越し）
    // ==========================================
    
    getLeaderOrGunshiInt(clanId) {
        const daimyo = this.game.getClanDaimyo(clanId);
        const gunshi = this.game.getClanGunshi(clanId);
        const intDaimyo = daimyo ? daimyo.intelligence : 50;
        const intGunshi = gunshi ? gunshi.intelligence : 0;
        return Math.max(intDaimyo, intGunshi); // 高い方を返します
    }

    getKukoModifiers(clanAId, clanBId) {
        const daimyoA = this.game.getClanDaimyo(clanAId) || { affinity: 50 };
        const daimyoB = this.game.getClanDaimyo(clanBId) || { affinity: 50 };
        const affinityDiff = typeof PersonnelRules !== 'undefined' ? PersonnelRules.calcAffinityDiff(daimyoA.affinity, daimyoB.affinity) : 25;
        
        const defAInt = this.getLeaderOrGunshiInt(clanAId);
        const defBInt = this.getLeaderOrGunshiInt(clanBId);
        const defMod = ((defAInt + defBInt) / 150) + 0.75;

        const affMod = 0.84375 + (affinityDiff / 160);
        
        const relation = this.game.getRelation(clanAId, clanBId) || { status: '普通', sentiment: 50 };
        const sentMod = (relation.sentiment / 200) + 0.75;
        
        let relMod = 1.0;
        if (relation.status === '敵対') relMod = 1.1;
        else if (relation.status === '和睦') relMod = 0;
        else if (window.DiplomacyRules.isAllianceOrVassal(relation.status)) relMod = 0.7;
        
        let isAdjacent = false;
        const castlesA = this.game.getClanCastles(clanAId);
        const castlesB = this.game.getClanCastles(clanBId);
        for (const ca of castlesA) {
            for (const cb of castlesB) {
                // 隣接しているか調べます
                if (typeof MapGraphService !== 'undefined' && MapGraphService.isAdjacent) {
                    if (MapGraphService.isAdjacent(ca, cb)) {
                        isAdjacent = true;
                        break;
                    }
                } else if (ca.adjacentCastleIds && ca.adjacentCastleIds.includes(cb.id)) {
                    isAdjacent = true;
                    break;
                }
            }
            if (isAdjacent) break;
        }
        
        const isTensionZero = (relation.sentiment === 0);
        const specialEffect = isTensionZero && isAdjacent;

        return { defMod, affMod, sentMod, relMod, specialEffect };
    }

    getKukoProb(doerId, clanAId, clanBId) {
        const busho = this.game.getBusho(doerId);
        const mods = this.getKukoModifiers(clanAId, clanBId);
        const doerIntMod = StrategySystem.getKukoProbBase(busho);
        
        let prob = (doerIntMod / mods.defMod) * (mods.affMod / mods.sentMod) * mods.relMod;
        if (mods.specialEffect) prob -= 0.5; // 友好度0で隣接している場合のペナルティ
        
        return Math.max(0.01, Math.min(0.99, prob));
    }

    getKukoExpectedDamage(doerId, clanAId, clanBId) {
        const busho = this.game.getBusho(doerId);
        const mods = this.getKukoModifiers(clanAId, clanBId);
        const doerDipMod = StrategySystem.getKukoDamageBase(busho);
        
        const damage = (doerDipMod / mods.defMod) * (mods.affMod / mods.sentMod) * mods.relMod;
        return Math.max(1, Math.floor(damage));
    }

    calcKuko(doerId, clanAId, clanBId, isExecute = false) { 
        const busho = this.game.getBusho(doerId);
        const prob = this.getKukoProb(doerId, clanAId, clanBId);
        let success = Math.random() < prob;

        if (isExecute) this.addStrategyExperience(busho, success);

        if(!success) return { success: false, val: 0 }; 
        const damage = this.getKukoExpectedDamage(doerId, clanAId, clanBId);
        return { success: true, val: damage }; 
    }
    
    getInciteProb(doerId, targetId) {
        const busho = this.game.getBusho(doerId);
        const targetCastle = this.game.getCastle(targetId);

        // ★共通処理から基礎確率を呼び出す
        const strBonus = StrategySystem.getInciteProbBase(busho);
        const loyaltyBonus = (targetCastle.peoplesLoyalty / 120) + 0.9;
        
        let prob = strBonus / loyaltyBonus;
        
        // ★修正：スキルの一元管理魔法を呼び出して確率を増減させます！
        if (typeof SkillManager !== 'undefined') {
            prob += SkillManager.calcStrategyProbModifier('incite', busho, targetId, 0, this.game);
        }
        
        return Math.max(0.01, Math.min(0.99, prob));
    }

    // ==========================================
    // ★離間計の補正計算（共通）
    // ==========================================
    getRumorModifiers(doer, target) {
        const defMod = (target.intelligence / 120) + 0.75;
        const dutyMod = (target.duty / 120) + 0.75;
        const loyaltyMod = (target.loyalty / 120) + 0.75;
        
        const affinityDiff = typeof PersonnelRules !== 'undefined' ? PersonnelRules.calcAffinityDiff(doer.affinity, target.affinity) : 25;
        const affinityMod = 0.875 + (affinityDiff / 200);

        const officerStatus = this.checkOfficerStatus(target);
        let positionMod = 1.0;
        if (officerStatus === 3) positionMod = 0.7;
        else if (officerStatus === 2) positionMod = 0.8;
        else if (officerStatus === 1) positionMod = 0.9;

        return {
            def: defMod,
            duty: dutyMod,
            loyalty: loyaltyMod,
            affinity: affinityMod,
            position: positionMod
        };
    }

    getRumorProb(doerId, targetBushoId) {
        const doer = this.game.getBusho(doerId);
        const target = this.game.getBusho(targetBushoId);
        
        const mods = this.getRumorModifiers(doer, target);
        const doerStrengthMod = (doer.strength + (Math.sqrt(doer.loyalty) * 2)) / 150;
        
        let prob = (doerStrengthMod / mods.def / mods.duty / mods.loyalty / mods.affinity) * mods.position;
        
        // ★修正：スキルの一元管理魔法を呼び出して確率を増減させます！
        if (typeof SkillManager !== 'undefined') {
            prob += SkillManager.calcStrategyProbModifier('rumor', doer, target.castleId, target.clan, this.game);
        }

        return Math.max(0.01, Math.min(0.99, prob));
    }

    getRumorExpectedDamage(doerId, targetBushoId) {
        const doer = this.game.getBusho(doerId);
        const target = this.game.getBusho(targetBushoId);
        
        const mods = this.getRumorModifiers(doer, target);
        const doerIntMod = (doer.intelligence + (Math.sqrt(doer.loyalty) * 2)) / 10;
        
        const damage = (doerIntMod / mods.def / mods.duty / mods.loyalty / mods.affinity) * mods.position;
        
        return Math.max(1, Math.floor(damage));
    }

    getHeadhuntProb(doerId, targetBushoId, gold) {
        const doer = this.game.getBusho(doerId);
        const target = this.game.getBusho(targetBushoId);
        const targetLord = this.game.getClanDaimyo(target.clan) || { affinity: 50 }; 
        const newLord = this.game.getClanDaimyo(doer.clan) || { affinity: 50 };

        const S = window.MainParams.Strategy;
        const goldEffect = Math.min(S.HeadhuntGoldMaxEffect, gold * S.HeadhuntGoldEffect);
        const offense = (doer.intelligence * S.HeadhuntIntWeight) + goldEffect;
        const defense = (target.loyalty * S.HeadhuntLoyaltyWeight) + (target.duty * S.HeadhuntDutyWeight) + S.HeadhuntBaseDiff;
        // 注意：ここは game.js に残した PersonnelRules.calcAffinityDiff を借ります！
        const affLord = PersonnelRules.calcAffinityDiff(target.affinity, targetLord.affinity); 
        const lordBonus = (50 - affLord) * S.AffinityLordWeight; 
        const affNew = PersonnelRules.calcAffinityDiff(target.affinity, newLord.affinity);
        const newBonus = (50 - affNew) * S.AffinityNewLordWeight; 
        const affDoer = PersonnelRules.calcAffinityDiff(target.affinity, doer.affinity);
        const doerBonus = (50 - affDoer) * S.AffinityDoerWeight; 
        const totalOffense = offense + newBonus + doerBonus;
        const totalDefense = defense + lordBonus;
        let successRate = (totalOffense / totalDefense) * 0.5; // 最後の0.5は武将引抜の成功率調整用

        // ★修正：対象のステータスに合わせてペナルティを適用します
        const officerStatus = this.checkOfficerStatus(target);
        if (officerStatus === 3) successRate -= 0.30;
        else if (officerStatus === 2) successRate -= 0.20;
        else if (officerStatus === 1) successRate -= 0.10;
        
        // ★ここから追加：引抜先に自分の宿敵がいる場合は、成功率が半分になります！
        if (target.nemesisIds && target.nemesisIds.length > 0) {
            const hasNemesis = target.nemesisIds.some(nId => {
                const nBusho = this.game.getBusho(nId);
                return nBusho && nBusho.clan === doer.clan && !window.LifeStatusRules.isDead(nBusho);
            });
            if (hasNemesis) {
                successRate *= 0.5;
            }
        }
        
        // ★修正：スキルの一元管理魔法を呼び出して確率を増減させます！
        if (typeof SkillManager !== 'undefined') {
            successRate += SkillManager.calcStrategyProbModifier('headhunt', doer, target.castleId, target.clan, this.game);
        }

        return Math.max(0, Math.min(1.0, successRate));
    }

    getAssassinateProb(doerId, targetBushoId) {
        const doer = this.game.getBusho(doerId);
        const target = this.game.getBusho(targetBushoId);
        const targetCastle = this.game.getCastle(target.castleId);
        
        let prob = doer.intelligence / 1000; // 基本成功率は担当者の智謀/10(%)

        // ★修正：スキルの一元管理魔法を呼び出して確率を増減させます！
        if (typeof SkillManager !== 'undefined') {
            prob += SkillManager.calcStrategyProbModifier('assassinate', doer, target.castleId, target.clan, this.game);
        }

        // 暗殺対象の拠点の兵士数１０名につき成功率０．２％ダウン。
        if (targetCastle) {
            const soldiers = targetCastle.soldiers;
            prob -= (Math.floor(soldiers / 10) * 0.002);
        }

        // 暗殺対象の拠点にいる、相手と同じ勢力の武将１人につき成功率が６％ダウン。（※暗殺対象本人は含めません）
        if (targetCastle) {
            const sameClanBushos = this.game.getCastleBushos(targetCastle.id).filter(b => b.clan === target.clan && window.BushoStatusRules.isActive(b) && b.id !== target.id);
            prob -= (sameClanBushos.length * 0.06);
        }

        // 成功率は最低０％で、うまく条件が噛み合わない限り絶対失敗する仕様
        return Math.max(0, prob);
    }

    calcAssassinate(doerId, targetBushoId, isExecute = false) {
        const doer = this.game.getBusho(doerId);
        const prob = this.getAssassinateProb(doerId, targetBushoId);
        let success = Math.random() < prob;

        if (isExecute) this.addStrategyExperience(doer, success, 15, 5, 3, 1);

        return success;
    }
    
    // ★追加: 破壊工作の予測ダメージを計算する魔法
    getSabotageExpectedDamage(doerId, targetId) {
        const busho = this.game.getBusho(doerId);
        let damage = Math.max(1, Math.floor(StrategySystem.getSabotageDamageBase(busho)));
        
        // ★修正：スキルの一元管理魔法を呼び出してダメージを増やします！
        if (typeof SkillManager !== 'undefined') {
            damage += SkillManager.calcStrategyDamageModifier('sabotage', busho);
        }
        
        return damage;
    }

    // ★追加: 民心撹乱（扇動）の予測ダメージを計算する魔法
    getInciteExpectedDamage(doerId, targetId) {
        const busho = this.game.getBusho(doerId);
        const targetCastle = this.game.getCastle(targetId);
        const intBonus = StrategySystem.getInciteDamageBase(busho);
        const loyaltyBonus = (targetCastle.peoplesLoyalty / 120) + 0.9;
        let damage = Math.max(1, Math.floor(intBonus / loyaltyBonus));
        
        // ★修正：スキルの一元管理魔法を呼び出してダメージを増やします！
        if (typeof SkillManager !== 'undefined') {
            damage += SkillManager.calcStrategyDamageModifier('incite', busho);
        }
        
        return damage;
    }
    
    // ★追加: 破壊工作の確率を計算する魔法
    getSabotageProb(doerId, targetId) {
        const busho = this.game.getBusho(doerId);

        // ★共通処理から基礎確率を呼び出す
        let prob = StrategySystem.getSabotageProbBase(busho);
        
        // ★修正：スキルの一元管理魔法を呼び出して確率を増減させます！
        if (typeof SkillManager !== 'undefined') {
            prob += SkillManager.calcStrategyProbModifier('sabotage', busho, targetId, 0, this.game);
        }
        
        return Math.max(0.01, Math.min(0.99, prob));
    }
    
    // ★追加: 経験値獲得を共通化する魔法
    addStrategyExperience(busho, isSuccess, successStr = 5, successInt = 10, failStr = 2, failInt = 5) {
        if (isSuccess) {
            busho.expStrength = (busho.expStrength || 0) + successStr;
            busho.expIntelligence = (busho.expIntelligence || 0) + successInt;
        } else {
            busho.expStrength = (busho.expStrength || 0) + failStr;
            busho.expIntelligence = (busho.expIntelligence || 0) + failInt;
        }
    }

    // ★追加: 破壊工作の成否とダメージを計算する魔法
    calcSabotage(doerId, targetId, isExecute = false) { 
        const busho = this.game.getBusho(doerId);
        
        const prob = this.getSabotageProb(doerId, targetId);
        const success = Math.random() < prob; 

        if (isExecute) this.addStrategyExperience(busho, success);
        
        if(!success) return { success: false, val: 0 }; 
        
        // ★修正：さっき整えた「予測ダメージを計算する魔法」をそのまま呼び出して使います！
        // こうすることで二重に計算する手間が省けます
        let damage = this.getSabotageExpectedDamage(doerId, targetId);

        return { success: true, val: damage }; 
    }
    
    calcIncite(doerId, targetId, isExecute = false) { 
        const busho = this.game.getBusho(doerId);
        
        const prob = this.getInciteProb(doerId, targetId);
        const success = Math.random() < prob; 

        if (isExecute) this.addStrategyExperience(busho, success);
        
        if(!success) return { success: false, val: 0 }; 
        
        // ★修正：こちらも予測ダメージを計算する魔法をそのまま呼び出します！
        let damage = this.getInciteExpectedDamage(doerId, targetId);

        return { success: true, val: damage }; 
    }
    
    calcRumor(doerId, targetBushoId, isExecute = false) { 
        const busho = this.game.getBusho(doerId);
        
        const prob = this.getRumorProb(doerId, targetBushoId);
        let success = Math.random() < prob;

        if (isExecute) this.addStrategyExperience(busho, success);

        if(!success) return { success: false, val: 0 }; 
        const damage = this.getRumorExpectedDamage(doerId, targetBushoId);
        return { success: true, val: damage }; 
    }
    
    calcHeadhunt(doerId, targetBushoId, gold, isExecute = false) {
        const doer = this.game.getBusho(doerId);
        
        const successRate = this.getHeadhuntProb(doerId, targetBushoId, gold);
        let success = Math.random() < successRate;

        // 引抜は少し経験値が多いので、数字を指定して渡します
        if (isExecute) this.addStrategyExperience(doer, success, 10, 20, 2, 5);

        return success;
    }

    // ==========================================
    // ★計略コマンドの実行処理（command_system.jsからのお引っ越し）
    // ==========================================

    // ★追加：城の中にいる一番武力の高い武将と、一番智謀の高い武将の能力を調べる魔法です
    getCastleBestStats(castleId) {
        const bushos = this.game.getCastleBushos(castleId).filter(b => window.BushoStatusRules.isActive(b));
        let bestStr = 0;
        let bestInt = 0;
        bushos.forEach(b => {
            if (b.strength > bestStr) bestStr = b.strength;
            if (b.intelligence > bestInt) bestInt = b.intelligence;
        });
        return { bestStr, bestInt };
    }

    // ★追加：バレずに工作できたか（隠密成功）のチェックと、バレた時のペナルティを行う魔法です
    // 引数（受け取るデータ）に targetBushoId を追加して、誰が狙われたか分かるようにします
    handleCovertAction(doerId, targetCastleId, isSuccess, actionType, isCastellanHeadhunt = false, targetBushoId = null) {
        const doer = this.game.getBusho(doerId);
        const targetCastle = this.game.getCastle(targetCastleId);
        if (!targetCastle) return "";

        const targetClanId = targetCastle.ownerClan;
        // 中立の城や自分の城なら、大名家との友好度は気にしなくて大丈夫です
        if (targetClanId === 0 || targetClanId === doer.clan) return "";

        let covertProb = 0;
        let penalty = 0;
        let alwaysDiscovered = false;

        const bestStats = this.getCastleBestStats(targetCastleId);
        const bestStr = bestStats.bestStr;
        const bestInt = bestStats.bestInt;
        const soldiers = targetCastle.soldiers;
        
        if (actionType === 'incite' || actionType === 'rumor' || actionType === 'kuko') {
            const numerator = Math.sqrt(30 + (doer.strength * 1.5) + doer.intelligence);
            const denominator = Math.sqrt(bestStr + (bestInt * 1.5));
            const safeDenominator = denominator > 0 ? denominator : 1; 
            covertProb = (numerator / safeDenominator) - (Math.sqrt(soldiers) / 300);
            
            if (isSuccess) penalty = 4;
            else penalty = 2;
        } else if (actionType === 'sabotage' || actionType === 'headhunt' || actionType === 'assassinate') {
            if (isSuccess) {
                alwaysDiscovered = true;
                if (actionType === 'sabotage') penalty = 4;
                else if (actionType === 'headhunt') {
                    if (isCastellanHeadhunt) penalty = 32;
                    else penalty = 16;
                }
                else if (actionType === 'assassinate') penalty = 32;
            } else {
                const numerator = Math.sqrt((doer.strength * 1.5) + doer.intelligence);
                const denominator = Math.sqrt(15 + bestStr + (bestInt * 1.5));
                const safeDenominator = denominator > 0 ? denominator : 1;
                covertProb = (numerator / safeDenominator) - (Math.sqrt(soldiers) / 200);
                penalty = 2;
            }
        }

        covertProb = Math.max(0, Math.min(0.99, covertProb));
        let isDiscovered = alwaysDiscovered || (Math.random() >= covertProb);

        // --- お知らせメッセージの作成 (プレイヤーが被害者の場合) ---
        if (targetClanId === this.game.playerClanId && doer.clan !== this.game.playerClanId) {
            const doerClanName = this.game.getClan(doer.clan)?.name || "不明な勢力";
            
            // 狙われた武将の名前を取得します
            let targetBushoName = "◯◯";
            if (targetBushoId) {
                const tBusho = this.game.getBusho(targetBushoId);
                if (tBusho) targetBushoName = tBusho.name;
            }
            
            // ① 犯人がバレた場合（隠密失敗）の目撃報告
            if (isDiscovered) {
                let msg1 = "";
                if (actionType === 'incite' || actionType === 'sabotage' || actionType === 'assassinate') {
                    msg1 = `${doerClanName}の手の者が${targetCastle.name}周辺で目撃されたようです`;
                } else if (actionType === 'rumor') {
                    msg1 = `${targetBushoName}が${doerClanName}の手の者と面会していたようです`;
                } else if (actionType === 'headhunt') {
                    msg1 = `${targetBushoName}が${doerClanName}から寝返りの誘いを受けているようです`;
                } else if (actionType === 'kuko') {
                    msg1 = `${doerClanName}の使者が${targetCastle.name}に滞在していたようです`;
                }
                
                if (msg1) {
                    this.game.ui.showDialog(msg1, false); // 犯人の名前付きで警告
                }
            }

            // ② 破壊工作が成功していた場合、犯人の成否に関わらず「壊れたこと」だけは必ず報告
            if (actionType === 'sabotage' && isSuccess) {
                this.game.ui.showDialog(`${targetCastle.name}の防備が一部破壊されたようです……`, false);
            }

            // ★追加：引抜が成功していた場合、寝返り報告を出す
            if (actionType === 'headhunt' && isSuccess) {
                this.game.ui.showDialog(`当家の${targetBushoName}が${doerClanName}に寝返りました！`, false);
            }
        }

        if (isDiscovered) {
            this.game.diplomacyManager.updateSentiment(doer.clan, targetClanId, -penalty);
            if (doer.clan === this.game.playerClanId) {
                const targetClanName = this.game.getClan(targetClanId)?.name || "不明な勢力";
                return `\n工作が発覚し、${targetClanName}との友好度が低下しました……`;
            }
        }
        return "";
    }

    // ==========================================
    // ★計略コマンドの結果を反映する魔法（AIとプレイヤーで一元化！）
    // ==========================================

    // ★共通: 功績と派閥承認の更新
    applyCommonSuccessEffect(doer, isSuccess) {
        if (isSuccess) {
            doer.achievementTotal = (doer.achievementTotal || 0) + Math.floor(doer.intelligence * 0.2) + 10;
            if (this.game.factionSystem && this.game.factionSystem.updateRecognition) this.game.factionSystem.updateRecognition(doer, 20);
        } else {
            doer.achievementTotal = (doer.achievementTotal || 0) + 5;
            if (this.game.factionSystem && this.game.factionSystem.updateRecognition) this.game.factionSystem.updateRecognition(doer, 10);
        }
    }

    // ★統合: 効果の適用
    applyStrategyEffect(actionType, doer, targetObj, result) {
        if (result.success) {
            if (actionType === 'sabotage') targetObj.defense = Math.max(0, targetObj.defense - result.val);
            if (actionType === 'incite') targetObj.peoplesLoyalty = Math.max(0, targetObj.peoplesLoyalty - result.val);
            if (actionType === 'rumor') targetObj.loyalty = Math.max(0, targetObj.loyalty - result.val);
        }
        this.applyCommonSuccessEffect(doer, result.success);
    }

    applyHeadhuntEffect(doer, target, destCastle, isSuccess) {
        let captiveMsgs = [];
        if (isSuccess) {
            const oldCastle = this.game.getCastle(target.castleId);
            const oldClanId = target.clan;
            const newClanId = doer.clan;
            
            if (oldClanId !== 0 && oldClanId !== newClanId) {
                target.achievementTotal = Math.floor((target.achievementTotal || 0) / 2);
            }
            
            if (target.isCastellan && oldCastle) {
                this.game.castleManager.changeOwner(oldCastle, newClanId);
                this.game.affiliationSystem.setClanIdRaw(target, newClanId);
                target.isActionDone = true;
                this.game.affiliationSystem.setActivityStatusRaw(target, window.GameConstants.BushoStatus.ACTIVE);
                target.isGunshi = false;
                
                const targetLord = this.game.getClanDaimyo(oldClanId) || { affinity: 50 };
                captiveMsgs = this.game.independenceSystem.resolveSubordinates(oldCastle, target, targetLord, newClanId, oldClanId);
                
                this.game.getCastleBushos(oldCastle.id).forEach(b => {
                    if (b.clan === newClanId && window.BushoStatusRules.isActive(b)) {
                        this.game.affiliationSystem.updateLoyaltyForNewLord(b, newClanId);
                    }
                });
                
                const myGunshi = this.game.bushos.find(b => b.clan === newClanId && b.isGunshi);
                this.game.getCastleBushos(oldCastle.id).forEach(b => {
                    if (!myGunshi || b.id !== myGunshi.id) {
                        if (b.clan === newClanId && window.BushoStatusRules.isActive(b)) {
                            b.isGunshi = false;
                        }
                    }
                });
                
                this.game.updateCastleLord(oldCastle);
            } else {
                target.belongKunishuId = 0; 
                target.isActionDone = true; 
                this.game.affiliationSystem.joinClan(target, newClanId, destCastle.id);
            }
            
            const maxStat = Math.max(target.strength, target.intelligence, target.leadership, target.charm, target.diplomacy);
            doer.achievementTotal = (doer.achievementTotal || 0) + Math.floor(maxStat * 0.3);
            if (this.game.factionSystem && this.game.factionSystem.updateRecognition) this.game.factionSystem.updateRecognition(doer, 25);
        } else {
            doer.achievementTotal = (doer.achievementTotal || 0) + 5;
            if (this.game.factionSystem && this.game.factionSystem.updateRecognition) this.game.factionSystem.updateRecognition(doer, 10);
        }
        return captiveMsgs;
    }
    
    // 引抜を実行する魔法
    executeHeadhunt(doerId, targetBushoId, gold) {
        const doer = this.game.getBusho(doerId);
        const target = this.game.getBusho(targetBushoId);
        const castle = this.game.getCurrentTurnCastle();
        if (castle.gold < gold) { this.game.ui.showDialog("資金が足りません", false); return; }
        
        castle.gold -= gold;
        
        // メモを残す魔法
        target.lastApproachedClanId = doer.clan;
        
        let isSuccess = this.calcHeadhunt(doerId, targetBushoId, gold, true);
        const covertMsg = this.handleCovertAction(doerId, target.castleId, isSuccess, 'headhunt', target.isCastellan && isSuccess, target.id);
        
        const oldCastleName = target.isCastellan ? this.game.getCastle(target.castleId)?.name : "";
        
        // ★ 一元化した処理を呼び出します
        const captiveMsgs = this.applyHeadhuntEffect(doer, target, castle, isSuccess);
        
        let msg = "";
        if (isSuccess) {
            if (target.isCastellan) {
                msg = `${doer.name}の引抜工作が成功！\n${target.name}が【${oldCastleName}】ごと我が軍に寝返りました！`;
                if (captiveMsgs && captiveMsgs.length > 0) {
                    msg += '\n\n' + captiveMsgs.join('\n');
                }
                msg += covertMsg;
            } else {
                msg = `${doer.name}の引抜工作が成功！\n${target.name}が我が軍に加わりました！${covertMsg}`;
            }
        } else {
            msg = `${doer.name}の引抜工作は失敗しました……\n${target.name}は応じませんでした${covertMsg}`;
        }
        
        doer.isActionDone = true; 
        this.game.commandSystem.finishCommand(msg, true);
    }

    // 暗殺を実行する魔法
    executeAssassinate(doerId, targetBushoId) {
        const doer = this.game.getBusho(doerId);
        const target = this.game.getBusho(targetBushoId);
        
        // メモを残す魔法
        target.lastApproachedClanId = doer.clan;
        
        let isSuccess = this.calcAssassinate(doerId, targetBushoId, true);
        const covertMsg = this.handleCovertAction(doerId, target.castleId, isSuccess, 'assassinate', false, target.id);
        
        let msg = "";
        if (isSuccess) {
            // 暗殺成功時の処理
            this.game.lifeSystem.processDeath(target, 'assassination');
            
            const maxStat = Math.max(target.strength, target.intelligence, target.leadership, target.charm, target.diplomacy);
            doer.achievementTotal = (doer.achievementTotal || 0) + Math.floor(maxStat * 0.5);
            if (this.game.factionSystem && this.game.factionSystem.updateRecognition) this.game.factionSystem.updateRecognition(doer, 30);
            
            msg = `${doer.name}の暗殺が成功！\n${target.name}を討ち取りました！${covertMsg}`;
        } else {
            doer.achievementTotal = (doer.achievementTotal || 0) + 5;
            if (this.game.factionSystem && this.game.factionSystem.updateRecognition) this.game.factionSystem.updateRecognition(doer, 10);
            
            msg = `${doer.name}の暗殺は失敗しました……\n${target.name}の警護が固く、手出しできませんでした。${covertMsg}`;
        }
        
        doer.isActionDone = true; 
        this.game.commandSystem.finishCommand(msg, true);
    }

    // ★統合: 破壊工作・扇動・離間計の実行処理
    executeBasicStrategy(actionType, doerId, targetId) {
        const doer = this.game.getBusho(doerId);
        const isTargetBusho = (actionType === 'rumor');
        const targetObj = isTargetBusho ? this.game.getBusho(targetId) : this.game.getCastle(targetId);
        
        if (isTargetBusho) targetObj.lastApproachedClanId = doer.clan;

        let result;
        if (actionType === 'sabotage') result = this.calcSabotage(doerId, targetId, true);
        else if (actionType === 'incite') result = this.calcIncite(doerId, targetId, true);
        else if (actionType === 'rumor') result = this.calcRumor(doerId, targetId, true);

        const targetCastleId = isTargetBusho ? targetObj.castleId : targetId;
        const covertMsg = this.handleCovertAction(doerId, targetCastleId, result.success, actionType, false, isTargetBusho ? targetId : null);

        let oldVal;
        if (actionType === 'sabotage') oldVal = targetObj.defense;
        else if (actionType === 'incite') oldVal = targetObj.peoplesLoyalty;
        else if (actionType === 'rumor') oldVal = targetObj.loyalty;

        this.applyStrategyEffect(actionType, doer, targetObj, result);
        
        let msg = "";
        if (result.success) {
            let actualDrop = oldVal - (actionType === 'sabotage' ? targetObj.defense : actionType === 'incite' ? targetObj.peoplesLoyalty : targetObj.loyalty);
            let actionName = actionType === 'sabotage' ? '破壊工作' : actionType === 'incite' ? '扇動' : '離間計';
            let statName = actionType === 'sabotage' ? '防御力' : actionType === 'incite' ? '民忠' : '忠誠';
            
            // 離間計の場合、数値の低下は表示せず低下した事実のみを伝えていた元の仕様に合わせる
            if (actionType === 'rumor') {
                msg = `${doer.name}の${actionName}が成功！\n${targetObj.name}の${statName}が低下しました${covertMsg}`;
            } else {
                msg = `${doer.name}の${actionName}が成功！\n${targetObj.name}の${statName}が${actualDrop}低下しました${covertMsg}`;
            }
        } else {
            let actionName = actionType === 'sabotage' ? '破壊工作' : actionType === 'incite' ? '扇動' : '離間計';
            msg = `${doer.name}の${actionName}は失敗しました……${covertMsg}`; 
        }
        
        doer.isActionDone = true; 
        this.game.commandSystem.finishCommand(msg); 
    }

    // 扇動を実行する魔法
    executeIncite(doerId, targetId) { this.executeBasicStrategy('incite', doerId, targetId); }
    
    // 離間計を実行する魔法
    executeRumor(doerId, castleId, targetBushoId) { this.executeBasicStrategy('rumor', doerId, targetBushoId); }
    
    // 破壊工作を実行する魔法
    executeSabotage(doerId, targetId) { this.executeBasicStrategy('sabotage', doerId, targetId); }

    // 駆虎呑狼を実行する魔法
    executeKuko(doerId, clanAId, clanBId) {
        const doer = this.game.getBusho(doerId);
        const clanA = this.game.getClan(clanAId);
        const clanB = this.game.getClan(clanBId);
        
        const result = this.calcKuko(doerId, clanAId, clanBId, true);
        
        // ターゲットAの居城で隠密判定を行います
        const daimyoA = this.game.getClanDaimyo(clanAId);
        const targetCastleA = daimyoA ? this.game.getCastle(daimyoA.castleId) : null;
        let covertMsg = "";
        if (targetCastleA) {
            covertMsg = this.handleCovertAction(doerId, targetCastleA.id, result.success, 'kuko', false, null);
        }
        
        let msg = "";
        if (result.success) {
            this.game.diplomacyManager.updateSentiment(clanAId, clanBId, -result.val);
            
            const mods = this.getKukoModifiers(clanAId, clanBId);
            let specialMsg = "";
            let baseMsg = `${clanA.name}と${clanB.name}の関係が悪化しました`;
            
            // 友好度0かつ隣接している場合の「大目標強制上書き」の魔法です！
            if (mods.specialEffect) {
                if (this.game.aiOperationManager && typeof this.game.aiOperationManager.setGrandObjectiveToAllLegions === 'function') {
                    // ★新しく作った一元化の魔法を呼び出して、両勢力に大名攻略の方針をセットします！
                    this.game.aiOperationManager.setGrandObjectiveToAllLegions(clanAId, '大名攻略', clanBId, 24);
                    this.game.aiOperationManager.setGrandObjectiveToAllLegions(clanBId, '大名攻略', clanAId, 24);
                    specialMsg = `両勢力は互いを不倶戴天の敵とみなし、軍を起こしました！`;
                    baseMsg = "";
                }
            }

            this.applyCommonSuccessEffect(doer, true);
            msg = `${doer.name}の駆虎呑狼の計が成功！ ${baseMsg}${specialMsg}${covertMsg}`;
        } else {
            this.applyCommonSuccessEffect(doer, false);
            msg = `${doer.name}の駆虎呑狼の計は失敗しました……${covertMsg}`;
        }
        
        doer.isActionDone = true; 
        this.game.commandSystem.finishCommand(msg); 
    }
}