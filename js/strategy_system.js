/**
 * strategy_system.js
 * 調略システムを一元管理するファイルです。
 */

class StrategySystem {
    constructor(game) {
        this.game = game;
    }
    
    // ==========================================
    // ★調略の能力スコアを計算する共通の処理（一箇所で管理・完全版）
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
    checkOfficerStatus(targetBusho) {
        // レベル3: 役職者本人
        if (targetBusho.isDaimyo || targetBusho.isCastellan || targetBusho.isCommander || targetBusho.isGunshi) {
            return 3;
        }
        
        // 同じ勢力にいる、自分以外の活動中の武将を集めます
        const sameClanBushos = this.game.bushos.filter(b => b.clan === targetBusho.clan && b.id !== targetBusho.id && b.status === 'active');
        
        // その中に一門の武将がいるか探します
        const familyInClan = sameClanBushos.filter(b => b.familyIds && targetBusho.familyIds && b.familyIds.some(fId => targetBusho.familyIds.includes(fId)));
        
        if (familyInClan.length > 0) {
            // 一門の中に役職持ちがいるかチェックします
            const hasOfficerFamily = familyInClan.some(b => b.isDaimyo || b.isCastellan || b.isCommander || b.isGunshi);
            if (hasOfficerFamily) {
                return 2; // レベル2: 役職持ちの一門がいる
            } else {
                return 1; // レベル1: （役職は持っていないが）一門がいる
            }
        }

        return 0; // レベル0: どれにも当てはまらない
    }
    
    // ==========================================
    // ★調略コマンドの計算処理（game.jsからのお引っ越し）
    // ==========================================
    
    getLeaderOrGunshiInt(clanId) {
        const daimyo = this.game.bushos.find(b => b.clan === clanId && b.isDaimyo);
        const gunshi = this.game.bushos.find(b => b.clan === clanId && b.isGunshi);
        const intDaimyo = daimyo ? daimyo.intelligence : 50;
        const intGunshi = gunshi ? gunshi.intelligence : 0;
        return Math.max(intDaimyo, intGunshi); // 高い方を返します
    }

    getKukoModifiers(clanAId, clanBId) {
        const daimyoA = this.game.bushos.find(b => b.clan === clanAId && b.isDaimyo) || { affinity: 50 };
        const daimyoB = this.game.bushos.find(b => b.clan === clanBId && b.isDaimyo) || { affinity: 50 };
        const affinityDiff = typeof GameSystem !== 'undefined' ? GameSystem.calcAffinityDiff(daimyoA.affinity, daimyoB.affinity) : 25;
        
        const defAInt = this.getLeaderOrGunshiInt(clanAId);
        const defBInt = this.getLeaderOrGunshiInt(clanBId);
        const defMod = ((defAInt + defBInt) / 150) + 0.75;

        const affMod = 0.84375 + (affinityDiff / 160);
        
        const relation = this.game.getRelation(clanAId, clanBId) || { status: '普通', sentiment: 50 };
        const sentMod = (relation.sentiment / 200) + 0.75;
        
        let relMod = 1.0;
        if (relation.status === '敵対') relMod = 1.1;
        else if (relation.status === '和睦') relMod = 0;
        else if (['同盟', '支配', '従属'].includes(relation.status)) relMod = 0.7;
        
        let isAdjacent = false;
        const castlesA = this.game.castles.filter(c => c.ownerClan === clanAId);
        const castlesB = this.game.castles.filter(c => c.ownerClan === clanBId);
        for (const ca of castlesA) {
            for (const cb of castlesB) {
                // 隣接しているか調べます
                if (typeof GameSystem !== 'undefined' && GameSystem.isAdjacent) {
                    if (GameSystem.isAdjacent(ca, cb)) {
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
        
        const prob = strBonus / loyaltyBonus;
        return Math.max(0.01, Math.min(0.99, prob));
    }

    // ==========================================
    // ★離間計の補正計算（共通）
    // ==========================================
    getRumorModifiers(doer, target) {
        const defMod = (target.intelligence / 120) + 0.75;
        const dutyMod = (target.duty / 120) + 0.75;
        const loyaltyMod = (target.loyalty / 120) + 0.75;
        
        const affinityDiff = typeof GameSystem !== 'undefined' ? GameSystem.calcAffinityDiff(doer.affinity, target.affinity) : 25;
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
        
        const prob = (doerStrengthMod / mods.def / mods.duty / mods.loyalty / mods.affinity) * mods.position;
        
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
        const targetLord = this.game.bushos.find(b => b.clan === target.clan && b.isDaimyo) || { affinity: 50 }; 
        const newLord = this.game.bushos.find(b => b.clan === doer.clan && b.isDaimyo) || { affinity: 50 }; 

        const S = window.MainParams.Strategy;
        const goldEffect = Math.min(S.HeadhuntGoldMaxEffect, gold * S.HeadhuntGoldEffect);
        const offense = (doer.intelligence * S.HeadhuntIntWeight) + goldEffect;
        const defense = (target.loyalty * S.HeadhuntLoyaltyWeight) + (target.duty * S.HeadhuntDutyWeight) + S.HeadhuntBaseDiff;
        // 注意：ここは game.js に残した GameSystem.calcAffinityDiff を借ります！
        const affLord = GameSystem.calcAffinityDiff(target.affinity, targetLord.affinity); 
        const lordBonus = (50 - affLord) * S.AffinityLordWeight; 
        const affNew = GameSystem.calcAffinityDiff(target.affinity, newLord.affinity);
        const newBonus = (50 - affNew) * S.AffinityNewLordWeight; 
        const affDoer = GameSystem.calcAffinityDiff(target.affinity, doer.affinity);
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
                return nBusho && nBusho.clan === doer.clan && nBusho.status !== 'dead';
            });
            if (hasNemesis) {
                successRate *= 0.5;
            }
        }
        
        return Math.max(0, Math.min(1.0, successRate));
    }
    
    // ★追加: 破壊工作の予測ダメージを計算する魔法
    getSabotageExpectedDamage(doerId, targetId) {
        const busho = this.game.getBusho(doerId);
        return Math.max(1, Math.floor(StrategySystem.getSabotageDamageBase(busho)));
    }

    // ★追加: 民心撹乱（扇動）の予測ダメージを計算する魔法
    getInciteExpectedDamage(doerId, targetId) {
        const busho = this.game.getBusho(doerId);
        const targetCastle = this.game.getCastle(targetId);
        const intBonus = StrategySystem.getInciteDamageBase(busho);
        const loyaltyBonus = (targetCastle.peoplesLoyalty / 120) + 0.9;
        return Math.max(1, Math.floor(intBonus / loyaltyBonus));
    }
    
    // ★追加: 破壊工作の確率を計算する魔法
    getSabotageProb(doerId, targetId) {
        const busho = this.game.getBusho(doerId);

        // ★共通処理から基礎確率を呼び出す
        const prob = StrategySystem.getSabotageProbBase(busho);
        
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
        
        // ★共通処理から基礎ダメージを呼び出す
        const damage = Math.max(1, Math.floor(StrategySystem.getSabotageDamageBase(busho)));
        return { success: true, val: damage }; 
    }
    
    calcIncite(doerId, targetId, isExecute = false) { 
        const busho = this.game.getBusho(doerId);
        const targetCastle = this.game.getCastle(targetId);
        
        const prob = this.getInciteProb(doerId, targetId);
        const success = Math.random() < prob; 

        if (isExecute) this.addStrategyExperience(busho, success);
        
        if(!success) return { success: false, val: 0 }; 
        
        // ★共通処理から基礎ダメージを呼び出す
        const intBonus = StrategySystem.getInciteDamageBase(busho);
        const loyaltyBonus = (targetCastle.peoplesLoyalty / 120) + 0.9;
        const damage = Math.max(1, Math.floor(intBonus / loyaltyBonus));
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
    // ★調略コマンドの実行処理（command_system.jsからのお引っ越し）
    // ==========================================

    // ★追加：城の中にいる一番武力の高い武将と、一番智謀の高い武将の能力を調べる魔法です
    getCastleBestStats(castleId) {
        const bushos = this.game.getCastleBushos(castleId).filter(b => b.status === 'active');
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
        } else if (actionType === 'sabotage' || actionType === 'headhunt') {
            if (isSuccess) {
                alwaysDiscovered = true;
                if (actionType === 'sabotage') penalty = 4;
                else if (actionType === 'headhunt') {
                    if (isCastellanHeadhunt) penalty = 32;
                    else penalty = 16;
                }
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
            const doerClanName = this.game.clans.find(c => c.id === doer.clan)?.name || "不明な勢力";
            
            // 狙われた武将の名前を取得します
            let targetBushoName = "◯◯";
            if (targetBushoId) {
                const tBusho = this.game.getBusho(targetBushoId);
                if (tBusho) targetBushoName = tBusho.name;
            }

            // ① 犯人がバレた場合（隠密失敗）の目撃報告
            if (isDiscovered) {
                let msg1 = "";
                if (actionType === 'incite' || actionType === 'sabotage') {
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
                const targetClanName = this.game.clans.find(c => c.id === targetClanId)?.name || "不明な勢力";
                return `\n工作が発覚し、${targetClanName}との友好度が低下しました……`;
            }
        }
        return "";
    }

    // ==========================================
    // ★調略コマンドの結果を反映する魔法（AIとプレイヤーで一元化！）
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
                target.clan = newClanId;
                target.isActionDone = true;
                target.status = 'active';
                target.isGunshi = false;
                
                const targetLord = this.game.bushos.find(b => b.clan === oldClanId && b.isDaimyo) || { affinity: 50 };
                captiveMsgs = this.game.independenceSystem.resolveSubordinates(oldCastle, target, targetLord, newClanId, oldClanId);
                
                this.game.getCastleBushos(oldCastle.id).forEach(b => {
                    if (b.clan === newClanId && b.status === 'active') {
                        this.game.affiliationSystem.updateLoyaltyForNewLord(b, newClanId);
                    }
                });
                
                const myGunshi = this.game.bushos.find(b => b.clan === newClanId && b.isGunshi);
                this.game.getCastleBushos(oldCastle.id).forEach(b => {
                    if (!myGunshi || b.id !== myGunshi.id) {
                        if (b.clan === newClanId && b.status === 'active') {
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
        
        if (isSuccess) {
            if (target.isCastellan) {
                let msg = `${doer.name}の引抜工作が成功！\n${target.name}が【${oldCastleName}】ごと我が軍に寝返りました！`;
                if (captiveMsgs && captiveMsgs.length > 0) {
                    msg += '\n\n' + captiveMsgs.join('\n');
                }
                msg += covertMsg;
                this.game.ui.showResultModal(msg);
            } else {
                this.game.ui.showResultModal(`${doer.name}の引抜工作が成功！\n${target.name}が我が軍に加わりました！${covertMsg}`);
            }
        } else {
            this.game.ui.showResultModal(`${doer.name}の引抜工作は失敗しました……\n${target.name}は応じませんでした${covertMsg}`);
        }
        
        doer.isActionDone = true; 
        this.game.ui.updatePanelHeader(); 
        this.game.ui.renderCommandMenu();
        this.game.ui.renderMap();
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

        if (result.success) {
            let actualDrop = oldVal - (actionType === 'sabotage' ? targetObj.defense : actionType === 'incite' ? targetObj.peoplesLoyalty : targetObj.loyalty);
            let actionName = actionType === 'sabotage' ? '破壊工作' : actionType === 'incite' ? '扇動' : '離間計';
            let statName = actionType === 'sabotage' ? '防御力' : actionType === 'incite' ? '民忠' : '忠誠';
            
            // 離間計の場合、数値の低下は表示せず低下した事実のみを伝えていた元の仕様に合わせる
            if (actionType === 'rumor') {
                this.game.ui.showResultModal(`${doer.name}の${actionName}が成功！\n${targetObj.name}の${statName}が低下しました${covertMsg}`);
            } else {
                this.game.ui.showResultModal(`${doer.name}の${actionName}が成功！\n${targetObj.name}の${statName}が${actualDrop}低下しました${covertMsg}`);
            }
        } else {
            let actionName = actionType === 'sabotage' ? '破壊工作' : actionType === 'incite' ? '扇動' : '離間計';
            this.game.ui.showResultModal(`${doer.name}の${actionName}は失敗しました${covertMsg}`); 
        } 
        
        doer.isActionDone = true; 
        this.game.ui.updatePanelHeader(); 
        this.game.ui.renderCommandMenu(); 
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
        const clanA = this.game.clans.find(c => c.id === clanAId);
        const clanB = this.game.clans.find(c => c.id === clanBId);
        
        const result = this.calcKuko(doerId, clanAId, clanBId, true);
        
        // ターゲットAの居城で隠密判定を行います
        const targetCastleA = this.game.castles.find(c => c.ownerClan === clanAId && c.id === this.game.bushos.find(b=>b.clan===clanAId && b.isDaimyo)?.castleId);
        let covertMsg = "";
        if (targetCastleA) {
            covertMsg = this.handleCovertAction(doerId, targetCastleA.id, result.success, 'kuko', false, null);
        }

        if (result.success) {
            this.game.diplomacyManager.updateSentiment(clanAId, clanBId, -result.val);
            
            const mods = this.getKukoModifiers(clanAId, clanBId);
            let specialMsg = "";
            
            // 友好度0かつ隣接している場合の「大目標強制上書き」の魔法です！
            if (mods.specialEffect) {
                if (this.game.aiOperationManager) {
                    const updateGrandObj = (myClanId, targetId) => {
                        if (!this.game.aiOperationManager.grandObjectives) this.game.aiOperationManager.grandObjectives = {};
                        if (!this.game.aiOperationManager.grandObjectives[myClanId]) this.game.aiOperationManager.grandObjectives[myClanId] = {};
                        
                        const myCastleCount = this.game.castles.filter(c => c.ownerClan === myClanId).length;
                        const targetCastleCount = this.game.castles.filter(c => c.ownerClan === targetId).length;
                        
                        const legions = [0]; // 0は直轄です
                        if (this.game.legions) {
                            this.game.legions.filter(l => l.clanId === myClanId && l.commanderId > 0).forEach(l => legions.push(l.legionNo));
                        }
                        
                        // 直轄とすべての軍団の方針を強制的に書き換えます
                        for (const legionNo of legions) {
                            this.game.aiOperationManager.grandObjectives[myClanId][legionNo] = {
                                type: '大名攻略',
                                targetClanId: targetId,
                                turnCount: 24,
                                historyTargetCount: [targetCastleCount],
                                prevMyCastleCount: myCastleCount
                            };
                        }
                    };
                    updateGrandObj(clanAId, clanBId);
                    updateGrandObj(clanBId, clanAId);
                    specialMsg = `\nさらに、両勢力は互いを不倶戴天の敵とみなし、討伐を大目標に掲げました！`;
                }
            }

            this.applyCommonSuccessEffect(doer, true);
            this.game.ui.showResultModal(`${doer.name}の駆虎呑狼が成功！\n${clanA.name}と${clanB.name}の友好度が${result.val}低下しました${specialMsg}${covertMsg}`);
        } else {
            this.applyCommonSuccessEffect(doer, false);
            this.game.ui.showResultModal(`${doer.name}の駆虎呑狼は失敗しました${covertMsg}`);
        }
        
        doer.isActionDone = true; 
        this.game.ui.updatePanelHeader(); 
        this.game.ui.renderCommandMenu(); 
    }
}