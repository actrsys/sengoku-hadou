/**
 * strategy_system.js
 * 調略システムを一元管理するファイルです。
 */

class StrategySystem {
    constructor(game) {
        this.game = game;
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
    
    getInciteProb(doerId, targetId) {
        const busho = this.game.getBusho(doerId);
        const targetCastle = this.game.getCastle(targetId);

        const strBonus = ((busho.strength * 1.5) + (Math.sqrt(busho.loyalty) * 2)) / 150;
        const intBonus = ((busho.intelligence * 1.5) + (Math.sqrt(busho.loyalty) * 2)) / 20;
        const loyaltyBonus = (targetCastle.peoplesLoyalty / 120) + 0.9;
        
        const prob = strBonus / loyaltyBonus;
        return Math.max(0.01, Math.min(0.99, prob));
    }

    getRumorProb(doerId, targetBushoId) {
        const busho = this.game.getBusho(doerId);
        const targetBusho = this.game.getBusho(targetBushoId);
        const score = (busho.intelligence * 0.7) + (busho.strength * 0.3); 
        const defScore = (targetBusho.intelligence * 0.5) + (targetBusho.loyalty * 0.5); 
        let prob = Math.min(1.0, score / (defScore + window.MainParams.Strategy.RumorFactor)) * 0.5;
        
        // ★修正：対象のステータスに合わせてペナルティを適用します
        const officerStatus = this.checkOfficerStatus(targetBusho);
        if (officerStatus === 3) prob -= 0.30;
        else if (officerStatus === 2) prob -= 0.20;
        else if (officerStatus === 1) prob -= 0.10;
        
        return Math.max(0, prob);
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
        let successRate = (totalOffense / totalDefense) * 0.25; 
        
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

    // ★追加: 破壊工作の確率を計算する魔法
    getSabotageProb(doerId, targetId) {
        const busho = this.game.getBusho(doerId);

        const prob = ((busho.strength * 1.5) + (Math.sqrt(busho.loyalty) * 2)) / 200;
        
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
        
        const damage = Math.max(1, Math.floor(((busho.intelligence * 1.5) + (Math.sqrt(busho.loyalty) * 2)) / 10));
        return { success: true, val: damage }; 
    }
    
    calcIncite(doerId, targetId, isExecute = false) { 
        const busho = this.game.getBusho(doerId);
        const targetCastle = this.game.getCastle(targetId);
        
        const prob = this.getInciteProb(doerId, targetId);
        const success = Math.random() < prob; 

        if (isExecute) this.addStrategyExperience(busho, success);
        
        if(!success) return { success: false, val: 0 }; 
        
        const intBonus = ((busho.intelligence * 1.5) + (Math.sqrt(busho.loyalty) * 2)) / 20;
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
        return { success: true, val: Math.floor((20 + Math.random()*20) / 4) }; 
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

        if (actionType === 'incite' || actionType === 'rumor') {
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
}