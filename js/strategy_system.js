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
    
    static getInciteProb(busho) {
        const score = (busho.intelligence * 0.7) + (busho.strength * 0.3); 
        return Math.min(1.0, score / window.MainParams.Strategy.InciteFactor);
    }

    static getRumorProb(busho, targetBusho) {
        const score = (busho.intelligence * 0.7) + (busho.strength * 0.3); 
        const defScore = (targetBusho.intelligence * 0.5) + (targetBusho.loyalty * 0.5); 
        let prob = Math.min(1.0, score / (defScore + window.MainParams.Strategy.RumorFactor));
        if (targetBusho.isCastellan) prob *= 0.67;
        return prob;
    }

    static getHeadhuntProb(doer, target, gold, targetLord, newLord) {
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
        if (target.isCastellan) successRate *= 0.67;
        return Math.min(1.0, successRate);
    }

    static calcIncite(busho) { 
        const score = (busho.intelligence * 0.7) + (busho.strength * 0.3); 
        const success = Math.random() < (score / window.MainParams.Strategy.InciteFactor); 
        if(!success) return { success: false, val: 0 }; 
        return { success: true, val: Math.max(1, Math.floor((score * 2) / 15)) }; 
    }
    
    static calcRumor(busho, targetBusho) { 
        const score = (busho.intelligence * 0.7) + (busho.strength * 0.3); 
        const defScore = (targetBusho.intelligence * 0.5) + (targetBusho.loyalty * 0.5); 
        const success = Math.random() < (score / (defScore + window.MainParams.Strategy.RumorFactor)); 
        if(!success) return { success: false, val: 0 }; 
        return { success: true, val: Math.floor((20 + Math.random()*20) / 4) }; 
    }

    static calcHeadhunt(doer, target, gold, targetLord, newLord) {
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
        const successRate = (totalOffense / totalDefense) * 0.5; 
        return Math.random() < successRate;
    }

    // ==========================================
    // ★調略コマンドの実行処理（command_system.jsからのお引っ越し）
    // ==========================================

    // 引抜を実行する魔法
    executeHeadhunt(doerId, targetBushoId, gold) {
        const doer = this.game.getBusho(doerId);
        const target = this.game.getBusho(targetBushoId);
        const castle = this.game.getCurrentTurnCastle();
        if (castle.gold < gold) { this.game.ui.showDialog("資金が足りません", false); return; }
        
        castle.gold -= gold;
        const targetLord = this.game.bushos.find(b => b.clan === target.clan && b.isDaimyo) || { affinity: 50 }; 
        const newLord = this.game.bushos.find(b => b.clan === this.game.playerClanId && b.isDaimyo) || { affinity: 50 }; 
        
        // ★専門部署である StrategySystem の計算魔法を呼びます！
        let isSuccess = StrategySystem.calcHeadhunt(doer, target, gold, targetLord, newLord);
        if (target.isCastellan && isSuccess) {
            if (Math.random() > 0.33) {
                isSuccess = false;
            }
        }
        
        if (isSuccess) {
            const oldCastle = this.game.getCastle(target.castleId);
            const oldClanId = target.clan;
            const newClanId = this.game.playerClanId;
            
            // ★他の大名家から移ってくるので、功績を半分にします！
            if (oldClanId !== 0 && oldClanId !== newClanId) {
                target.achievementTotal = Math.floor(target.achievementTotal / 2);
            }
            
            if (target.isCastellan && oldCastle) {
                // ■ 城主を引き抜いた場合（城ごと寝返る！）
                oldCastle.ownerClan = newClanId;
                target.clan = newClanId;
                target.loyalty = 100; // 寝返ったので忠誠はMAX！
                target.isActionDone = true;
                target.status = 'active';
                target.isGunshi = false; // 念のため軍師を外しておきます
                
                // 部下たちの処理
                const indSys = this.game.independenceSystem;
                const captiveMsgs = indSys.resolveSubordinates(oldCastle, target, targetLord, newClanId, oldClanId);
                
                // 本物の軍師「以外」の武将から軍師バッジを没収します！
                const myGunshi = this.game.bushos.find(b => b.clan === newClanId && b.isGunshi);
                this.game.getCastleBushos(oldCastle.id).forEach(b => {
                    if (!myGunshi || b.id !== myGunshi.id) {
                        if (b.clan === newClanId || b.clan === 0) {
                            b.isGunshi = false;
                        }
                    }
                });
                
                this.game.updateCastleLord(oldCastle);

                let msg = `${doer.name}の引抜工作が成功！\n${target.name}が【${oldCastle.name}】ごと我が軍に寝返りました！`;
                if (captiveMsgs && captiveMsgs.length > 0) {
                    msg += '\n\n' + captiveMsgs.join('\n');
                }
                this.game.ui.showResultModal(msg);

            } else {
                // ■ 普通の武将（城主以外）を引き抜いた場合
                target.belongKunishuId = 0; 
                target.isActionDone = true; 
                
                // 新しいお引越しセンターの魔法を使います！
                this.game.affiliationSystem.joinClan(target, newClanId, castle.id);
                
                this.game.ui.showResultModal(`${doer.name}の引抜工作が成功！\n${target.name}が我が軍に加わりました！`);
            }
            
            const maxStat = Math.max(target.strength, target.intelligence, target.leadership, target.charm, target.diplomacy);
            doer.achievementTotal += Math.floor(maxStat * 0.3);
            this.game.factionSystem.updateRecognition(doer, 25);
        } else {
            this.game.ui.showResultModal(`${doer.name}の引抜工作は失敗しました……\n${target.name}は応じませんでした`);
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
    executeIncite(doerId, targetId) { 
        const doer = this.game.getBusho(doerId); 
        const target = this.game.getCastle(targetId); 
        // ★専門部署である StrategySystem の計算魔法を呼びます！
        const result = StrategySystem.calcIncite(doer); 
        if(result.success) { 
            const oldVal = target.peoplesLoyalty;
            target.peoplesLoyalty = Math.max(0, target.peoplesLoyalty - result.val); 
            const actualDrop = oldVal - target.peoplesLoyalty;
            this.game.ui.showResultModal(`${doer.name}の扇動が成功！\n${target.name}の民忠が${actualDrop}低下しました`); 
            doer.achievementTotal += Math.floor(doer.intelligence * 0.2) + 10;
            this.game.factionSystem.updateRecognition(doer, 20); 
        } else { 
            this.game.ui.showResultModal(`${doer.name}の扇動は失敗しました`); 
            doer.achievementTotal += 5; 
            this.game.factionSystem.updateRecognition(doer, 10); 
        } 
        doer.isActionDone = true; 
        this.game.ui.updatePanelHeader(); 
        this.game.ui.renderCommandMenu(); 
    }

    // 流言を実行する魔法
    executeRumor(doerId, castleId, targetBushoId) { 
        const doer = this.game.getBusho(doerId); 
        const targetBusho = this.game.getBusho(targetBushoId); 
        
        // ★専門部署である StrategySystem の計算魔法を呼びます！
        let result = StrategySystem.calcRumor(doer, targetBusho); 
        if (targetBusho.isCastellan && result.success) {
            if (Math.random() > 0.33) {
                result.success = false;
            }
        }

        if(result.success) { 
            const oldVal = targetBusho.loyalty;
            targetBusho.loyalty = Math.max(0, targetBusho.loyalty - result.val); 
            const actualDrop = oldVal - targetBusho.loyalty;
            this.game.ui.showResultModal(`${doer.name}の流言が成功！\n${targetBusho.name}の忠誠が低下しました`);
            doer.achievementTotal += Math.floor(doer.intelligence * 0.2) + 10;
            this.game.factionSystem.updateRecognition(doer, 20); 
        } else { 
            this.game.ui.showResultModal(`${doer.name}の流言は失敗しました`); 
            doer.achievementTotal += 5; 
            this.game.factionSystem.updateRecognition(doer, 10); 
        } 
        doer.isActionDone = true; 
        this.game.ui.updatePanelHeader(); 
        this.game.ui.renderCommandMenu(); 
    }
}