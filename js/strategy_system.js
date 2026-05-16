/**
 * strategy_system.js
 * 調略システムを一元管理するファイルです。
 */

class StrategySystem {
    constructor(game) {
        this.game = game;
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
        let prob = Math.min(1.0, score / (defScore + window.MainParams.Strategy.RumorFactor)) - 0.1;
        prob = Math.max(0, prob);
        if (targetBusho.isCastellan) prob *= 0.67;
        return prob;
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
        let successRate = (totalOffense / totalDefense) * 0.5; 
        
        successRate = Math.max(0, successRate - 0.1);
        
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
        
        if (target.isCastellan) successRate *= 0.67;
        return Math.min(1.0, successRate);
    }

    // ★追加: 破壊工作の確率を計算する魔法
    getSabotageProb(doerId, targetId) {
        const busho = this.game.getBusho(doerId);

        const prob = ((busho.strength * 1.5) + (Math.sqrt(busho.loyalty) * 2)) / 200;
        
        return Math.max(0.01, Math.min(0.99, prob));
    }
    
    // ★追加: 破壊工作の成否とダメージを計算する魔法
    calcSabotage(doerId, targetId, isExecute = false) { 
        const busho = this.game.getBusho(doerId);
        
        const prob = this.getSabotageProb(doerId, targetId);
        const success = Math.random() < prob; 

        if (isExecute) {
            if (success) {
                busho.expStrength = (busho.expStrength || 0) + 5;
                busho.expIntelligence = (busho.expIntelligence || 0) + 10;
            } else {
                busho.expStrength = (busho.expStrength || 0) + 2;
                busho.expIntelligence = (busho.expIntelligence || 0) + 5;
            }
        }
        
        if(!success) return { success: false, val: 0 }; 
        
        const damage = Math.max(1, Math.floor(((busho.intelligence * 1.5) + (Math.sqrt(busho.loyalty) * 2)) / 10));
        return { success: true, val: damage }; 
    }
    
    calcIncite(doerId, targetId, isExecute = false) { 
        const busho = this.game.getBusho(doerId);
        const targetCastle = this.game.getCastle(targetId);

        const strBonus = ((busho.strength * 1.5) + (Math.sqrt(busho.loyalty) * 2)) / 150;
        const intBonus = ((busho.intelligence * 1.5) + (Math.sqrt(busho.loyalty) * 2)) / 20;
        const loyaltyBonus = (targetCastle.peoplesLoyalty / 120) + 0.9;
        
        const prob = Math.max(0.01, Math.min(0.99, strBonus / loyaltyBonus));
        const success = Math.random() < prob; 

        if (isExecute) {
            if (success) {
                busho.expStrength = (busho.expStrength || 0) + 5;
                busho.expIntelligence = (busho.expIntelligence || 0) + 10;
            } else {
                busho.expStrength = (busho.expStrength || 0) + 2;
                busho.expIntelligence = (busho.expIntelligence || 0) + 5;
            }
        }
        
        if(!success) return { success: false, val: 0 }; 
        
        const damage = Math.max(1, Math.floor(intBonus / loyaltyBonus));
        return { success: true, val: damage }; 
    }
    
    calcRumor(doerId, targetBushoId, isExecute = false) { 
        const busho = this.game.getBusho(doerId);
        const targetBusho = this.game.getBusho(targetBushoId);
        const score = (busho.intelligence * 0.7) + (busho.strength * 0.3); 
        const defScore = (targetBusho.intelligence * 0.5) + (targetBusho.loyalty * 0.5); 
        let prob = (score / (defScore + window.MainParams.Strategy.RumorFactor)) - 0.1;
        prob = Math.max(0, prob);
        let success = Math.random() < prob; 

        if (targetBusho.isCastellan && success) {
            if (Math.random() > 0.33) {
                success = false;
            }
        }

        if (isExecute) {
            if (success) {
                busho.expStrength = (busho.expStrength || 0) + 5;
                busho.expIntelligence = (busho.expIntelligence || 0) + 10;
            } else {
                busho.expStrength = (busho.expStrength || 0) + 2;
                busho.expIntelligence = (busho.expIntelligence || 0) + 5;
            }
        }

        if(!success) return { success: false, val: 0 }; 
        return { success: true, val: Math.floor((20 + Math.random()*20) / 4) }; 
    }
    
    calcHeadhunt(doerId, targetBushoId, gold, isExecute = false) {
        const doer = this.game.getBusho(doerId);
        const target = this.game.getBusho(targetBushoId);
        const targetLord = this.game.bushos.find(b => b.clan === target.clan && b.isDaimyo) || { affinity: 50 }; 
        const newLord = this.game.bushos.find(b => b.clan === doer.clan && b.isDaimyo) || { affinity: 50 }; 

        const S = window.MainParams.Strategy;
        const goldEffect = Math.min(S.HeadhuntGoldMaxEffect, gold * S.HeadhuntGoldEffect);
        const offense = (doer.intelligence * S.HeadhuntIntWeight) + goldEffect;
        const defense = (target.loyalty * S.HeadhuntLoyaltyWeight) + (target.duty * S.HeadhuntDutyWeight) + S.HeadhuntBaseDiff;
        const affLord = GameSystem.calcAffinityDiff(target.affinity, targetLord.affinity); 
        const lordBonus = (50 - affLord) * S.AffinityLordWeight; 
        const affNew = GameSystem.calcAffinityDiff(target.affinity, newLord.affinity);
        const newBonus = (50 - affNew) * S.AffinityNewLordWeight; 
        const affDoer = GameSystem.calcAffinityDiff(target.affinity, doer.affinity);
        const doerBonus = (50 - affDoer) * S.AffinityDoerWeight; 
        const totalOffense = offense + newBonus + doerBonus;
        const totalDefense = defense + lordBonus;
        let successRate = (totalOffense / totalDefense) * 0.5; 

        successRate = Math.max(0, successRate - 0.1);

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

        let success = Math.random() < successRate;

        if (target.isCastellan && success) {
            if (Math.random() > 0.33) {
                success = false;
            }
        }

        if (isExecute) {
            if (success) {
                doer.expStrength = (doer.expStrength || 0) + 10;
                doer.expIntelligence = (doer.expIntelligence || 0) + 20;
            } else {
                doer.expStrength = (doer.expStrength || 0) + 2;
                doer.expIntelligence = (doer.expIntelligence || 0) + 5;
            }
        }

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
    
    // 引抜を実行する魔法
    executeHeadhunt(doerId, targetBushoId, gold) {
        const doer = this.game.getBusho(doerId);
        const target = this.game.getBusho(targetBushoId);
        const castle = this.game.getCurrentTurnCastle();
        if (castle.gold < gold) { this.game.ui.showDialog("資金が足りません", false); return; }
        
        castle.gold -= gold;
        
        // ★専門部署である StrategySystem の計算魔法を呼びます！
        let isSuccess = this.calcHeadhunt(doerId, targetBushoId, gold, true);
        
        // ★追加：隠密チェックを行います
        const covertMsg = this.handleCovertAction(doerId, target.castleId, isSuccess, 'headhunt', target.isCastellan && isSuccess, target.id);
        
        if (isSuccess) {
            const oldCastle = this.game.getCastle(target.castleId);
            const oldClanId = target.clan;
            const newClanId = doer.clan;
            
            // ★他の大名家から移ってくるので、功績を半分にします！
            if (oldClanId !== 0 && oldClanId !== newClanId) {
                target.achievementTotal = Math.floor(target.achievementTotal / 2);
            }
            
            if (target.isCastellan && oldCastle) {
                // ■ 城主を引き抜いた場合（城ごと寝返る！）
                this.game.castleManager.changeOwner(oldCastle, newClanId);
                target.clan = newClanId;
                target.isActionDone = true;
                target.status = 'active';
                target.isGunshi = false; // 念のため軍師を外しておきます
                
                // 部下たちの処理
                const targetLord = this.game.bushos.find(b => b.clan === oldClanId && b.isDaimyo) || { affinity: 50 };
                const indSys = this.game.independenceSystem;
                const captiveMsgs = indSys.resolveSubordinates(oldCastle, target, targetLord, newClanId, oldClanId);

                // 新しく味方になった城主と、ついてきた部下たちの忠誠度を相性に合わせて計算し直します
                this.game.getCastleBushos(oldCastle.id).forEach(b => {
                    if (b.clan === newClanId && b.status === 'active') {
                        this.game.affiliationSystem.updateLoyaltyForNewLord(b, newClanId);
                    }
                });
                
                // 本物の軍師「以外」の武将から軍師バッジを没収します！
                const myGunshi = this.game.bushos.find(b => b.clan === newClanId && b.isGunshi);
                this.game.getCastleBushos(oldCastle.id).forEach(b => {
                    if (!myGunshi || b.id !== myGunshi.id) {
                        if (b.clan === newClanId && b.status === 'active') {
                            b.isGunshi = false;
                        }
                    }
                });
                
                this.game.updateCastleLord(oldCastle);

                let msg = `${doer.name}の引抜工作が成功！\n${target.name}が【${oldCastle.name}】ごと我が軍に寝返りました！`;
                if (captiveMsgs && captiveMsgs.length > 0) {
                    msg += '\n\n' + captiveMsgs.join('\n');
                }
                msg += covertMsg;
                this.game.ui.showResultModal(msg);

            } else {
                // ■ 普通の武将（城主以外）を引き抜いた場合
                target.belongKunishuId = 0; 
                target.isActionDone = true; 
                
                // 新しいお引越しセンターの魔法を使います！
                this.game.affiliationSystem.joinClan(target, newClanId, castle.id);
                
                this.game.ui.showResultModal(`${doer.name}の引抜工作が成功！\n${target.name}が我が軍に加わりました！${covertMsg}`);
            }
            
            const maxStat = Math.max(target.strength, target.intelligence, target.leadership, target.charm, target.diplomacy);
            doer.achievementTotal += Math.floor(maxStat * 0.3);
            this.game.factionSystem.updateRecognition(doer, 25);
        } else {
            this.game.ui.showResultModal(`${doer.name}の引抜工作は失敗しました……\n${target.name}は応じませんでした${covertMsg}`);
            doer.achievementTotal += 5;
            this.game.factionSystem.updateRecognition(doer, 10);
        }
        doer.isActionDone = true; 
        this.game.ui.updatePanelHeader(); 
        this.game.ui.renderCommandMenu();
        this.game.ui.renderMap();
    }
    
    // 扇動を実行する魔法
    executeIncite(doerId, targetId) { 
        const doer = this.game.getBusho(doerId);
        const target = this.game.getCastle(targetId); 
        // ★専門部署である StrategySystem の計算魔法を呼びます！
        const result = this.calcIncite(doerId, targetId, true); 
        
        // ★追加：隠密チェックを行います
        const covertMsg = this.handleCovertAction(doerId, targetId, result.success, 'incite');

        if(result.success) {
            const oldVal = target.peoplesLoyalty;
            target.peoplesLoyalty = Math.max(0, target.peoplesLoyalty - result.val); 
            const actualDrop = oldVal - target.peoplesLoyalty;
            this.game.ui.showResultModal(`${doer.name}の扇動が成功！\n${target.name}の民忠が${actualDrop}低下しました${covertMsg}`); 
            doer.achievementTotal += Math.floor(doer.intelligence * 0.2) + 10;
            this.game.factionSystem.updateRecognition(doer, 20); 
        } else { 
            this.game.ui.showResultModal(`${doer.name}の扇動は失敗しました${covertMsg}`); 
            doer.achievementTotal += 5; 
            this.game.factionSystem.updateRecognition(doer, 10); 
        } 
        doer.isActionDone = true; 
        this.game.ui.updatePanelHeader(); 
        this.game.ui.renderCommandMenu(); 
    }
    
    // 離間計を実行する魔法
    executeRumor(doerId, castleId, targetBushoId) { 
        const doer = this.game.getBusho(doerId); 
        const targetBusho = this.game.getBusho(targetBushoId); 
        
        // ★専門部署である StrategySystem の計算魔法を呼びます！
        let result = this.calcRumor(doerId, targetBushoId, true);

        // ★追加：隠密チェックを行います
        const covertMsg = this.handleCovertAction(doerId, targetBusho.castleId, result.success, 'rumor', false, targetBusho.id);

        if(result.success) { 
            const oldVal = targetBusho.loyalty;
            targetBusho.loyalty = Math.max(0, targetBusho.loyalty - result.val); 
            const actualDrop = oldVal - targetBusho.loyalty;
            this.game.ui.showResultModal(`${doer.name}の離間計が成功！\n${targetBusho.name}の忠誠が低下しました${covertMsg}`);
            doer.achievementTotal += Math.floor(doer.intelligence * 0.2) + 10;
            this.game.factionSystem.updateRecognition(doer, 20); 
        } else { 
            this.game.ui.showResultModal(`${doer.name}の離間計は失敗しました${covertMsg}`); 
            doer.achievementTotal += 5; 
            this.game.factionSystem.updateRecognition(doer, 10); 
        } 
        doer.isActionDone = true; 
        this.game.ui.updatePanelHeader(); 
        this.game.ui.renderCommandMenu(); 
    }
    
    // ★追加: 破壊工作を実行する魔法
    executeSabotage(doerId, targetId) { 
        const doer = this.game.getBusho(doerId);
        const target = this.game.getCastle(targetId); 
        
        const result = this.calcSabotage(doerId, targetId, true); 
        
        // ★追加：隠密チェックを行います
        const covertMsg = this.handleCovertAction(doerId, targetId, result.success, 'sabotage');

        if(result.success) {
            const oldVal = target.defense;
            target.defense = Math.max(0, target.defense - result.val); 
            const actualDrop = oldVal - target.defense;
            this.game.ui.showResultModal(`${doer.name}の破壊工作が成功！\n${target.name}の防御力が${actualDrop}低下しました${covertMsg}`); 
            doer.achievementTotal += Math.floor(doer.intelligence * 0.2) + 10;
            this.game.factionSystem.updateRecognition(doer, 20); 
        } else { 
            this.game.ui.showResultModal(`${doer.name}の破壊工作は失敗しました${covertMsg}`); 
            doer.achievementTotal += 5; 
            this.game.factionSystem.updateRecognition(doer, 10); 
        } 
        doer.isActionDone = true; 
        this.game.ui.updatePanelHeader(); 
        this.game.ui.renderCommandMenu(); 
    }
}