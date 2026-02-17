/**
 * ai.js - 敵思考エンジン
 * 責務: 敵大名のターン処理、内政、外交、軍事判断
 * 依存: WarSystem (war.js) の計算ロジックを使用して、parameter.csvの変更を反映させる
 * 設定: AI
 */

// AI関連の設定定義
// Parameter.csv の変更を受けて拡張
window.AIParams = {
    AI: {
        Difficulty: 'normal',
        Aggressiveness: 1.5, SoldierSendRate: 0.8,
        AbilityBase: 50, AbilitySensitivity: 2.0,
        GunshiBiasFactor: 0.5, GunshiFairnessFactor: 0.01,
        DiplomacyChance: 0.3, 
        GoodwillThreshold: 40, 
        AllianceThreshold: 70, 
        BreakAllianceDutyFactor: 0.5,
        // 新規追加パラメータのデフォルト値
        RiskAversion: 2.0,
        WinBonus: 1000,
        AttackThreshold: 300
    }
};

class AIEngine {
    constructor(game) {
        this.game = game;
    }

    getDifficultyMods() {
        const diff = window.AIParams.AI.Difficulty || 'normal';
        switch(diff) {
            case 'hard': return { accuracy: 1.0, aggression: 1.2, resourceSave: 0.2 }; 
            case 'easy': return { accuracy: 0.6, aggression: 0.7, resourceSave: 0.6 }; 
            default:     return { accuracy: 0.85, aggression: 1.0, resourceSave: 0.4 }; 
        }
    }

    getAISmartness(attributeVal) {
        const mods = this.getDifficultyMods();
        const base = window.AIParams.AI.AbilityBase || 50;
        const sensitivity = window.AIParams.AI.AbilitySensitivity || 2.0;
        let prob = 0.5 + ((attributeVal - base) * sensitivity * 0.01);
        prob = Math.max(0.1, Math.min(0.95, prob));
        if (mods.accuracy > 0.9) prob += 0.1;
        if (mods.accuracy < 0.7) prob -= 0.1;
        return Math.max(0.05, Math.min(1.0, prob));
    }

    execAI(castle) {
        try {
            // 【安全装置】万が一、プレイヤーの城がAIルーチンに渡された場合、即座に制御を戻す
            if (Number(castle.ownerClan) === Number(this.game.playerClanId)) {
                console.warn("AI Alert: Player castle detected in AI routine. Returning control to player.");
                this.game.isProcessingAI = false;
                
                // 行動済みフラグのリセットは行わない（移動後の武将がいる可能性があるため）
                
                this.game.ui.showControlPanel(castle);
                return;
            }

            const castellan = this.game.getBusho(castle.castellanId);
            if (!castellan || castellan.isActionDone) { 
                this.game.finishTurn(); 
                return; 
            }
            
            const mods = this.getDifficultyMods();
            const smartness = this.getAISmartness(castellan.intelligence);

            if (this.game.month % 3 === 0) {
                const diplomacyChance = (window.AIParams.AI.DiplomacyChance || 0.3) * (mods.aggression); 
                if (Math.random() < diplomacyChance) {
                    this.execAIDiplomacy(castle, castellan, smartness); 
                    if (castellan.isActionDone) { this.game.finishTurn(); return; }
                }
            }
            
            const neighbors = this.game.castles.filter(c => 
                c.ownerClan !== 0 && 
                c.ownerClan !== castle.ownerClan && 
                GameSystem.isAdjacent(castle, c)
            );
            
            const validEnemies = neighbors.filter(target => {
                const rel = this.game.getRelation(castle.ownerClan, target.ownerClan);
                return !rel.alliance && (target.immunityUntil || 0) < this.game.getCurrentTurnId();
            });

            const aggroBase = (window.AIParams.AI.Aggressiveness || 1.5) * mods.aggression;
            const threshold = 500; 

            if (validEnemies.length > 0 && castle.soldiers > threshold) {
                const personalityFactor = (castellan.personality === 'aggressive') ? 1.5 : 1.0;
                const checkChance = smartness > 0.7 ? 1.0 : (0.5 * aggroBase * personalityFactor);

                if (Math.random() < checkChance) {
                    const target = this.decideAttackTarget(castle, castellan, validEnemies, mods, smartness);
                    if (target) {
                        this.executeAttack(castle, target, castellan);
                        return; 
                    }
                }
            }
            
            this.execInternalAffairs(castle, castellan, mods, smartness);
            this.game.finishTurn();

        } catch(e) {
            console.error("AI Logic Error:", e);
            this.game.finishTurn();
        }
    }

    decideAttackTarget(myCastle, myGeneral, enemies, mods, smartness) {
        let bestTarget = null;
        let bestScore = -Infinity;
        
        const myBushos = this.game.getCastleBushos(myCastle.id).filter(b => b.status !== 'ronin');
        const availableBushos = myBushos.sort((a,b) => b.leadership - a.leadership).slice(0, 3);
        
        // WarSystemが存在しない場合の安全策
        if (typeof WarSystem === 'undefined') return null;

        const myStats = WarSystem.calcUnitStats(availableBushos);
        const sendSoldiers = Math.floor(myCastle.soldiers * (window.AIParams.AI.SoldierSendRate || 0.8));

        // パラメータの取得（デフォルト値付き）
        const riskAversion = window.AIParams.AI.RiskAversion || 2.0;
        const winBonus = window.AIParams.AI.WinBonus || 1000;
        const baseThreshold = window.AIParams.AI.AttackThreshold || 300;

        enemies.forEach(target => {
            const errorMargin = (1.0 - smartness) * (mods.accuracy === 1.0 ? 0.1 : 0.5); 
            const perceive = (val) => Math.floor(val * (1.0 + (Math.random() - 0.5) * 2 * errorMargin));

            const enemyBushos = this.game.getCastleBushos(target.id);
            const enemyGeneral = enemyBushos.reduce((a, b) => a.leadership > b.leadership ? a : b, { leadership: 40, strength: 40, intelligence: 40 });
            const enemyStats = WarSystem.calcUnitStats(enemyBushos.length > 0 ? enemyBushos : [enemyGeneral]);
            
            const pEnemySoldiers = perceive(target.soldiers);
            const pEnemyDefense = perceive(target.defense);
            const pEnemyTraining = perceive(target.training);

            const myDmg = WarSystem.calcWarDamage(myStats, enemyStats, sendSoldiers, pEnemySoldiers, pEnemyDefense, myCastle.morale, pEnemyTraining, 'charge');
            const enemyDmg = WarSystem.calcWarDamage(enemyStats, myStats, pEnemySoldiers, sendSoldiers, myCastle.defense, target.morale, myCastle.training, 'charge'); 

            const expectedLoss = enemyDmg.soldierDmg;
            const expectedGain = myDmg.soldierDmg + (myDmg.wallDmg * 2.0);
            
            // 修正: RiskAversionをCSVから取得した値を使用。賢いほどリスク計算が正確になる（リスクを無視しなくなる）
            const riskFactor = riskAversion - (smartness * 0.5);
            let score = expectedGain - (expectedLoss * riskFactor); 

            // 修正: 勝利確信ボーナスの条件厳格化。
            // 敵兵が少なく、かつ「予想被害が自軍の半数以下」である場合のみボーナスを加算。
            // これにより、勝てるが相打ちになるようなケースでの特攻を防ぐ。
            if (pEnemySoldiers < myDmg.soldierDmg * 3 && expectedLoss < sendSoldiers * 0.5) {
                 score += winBonus * smartness; 
            }
            
            if (pEnemyDefense < 100) score += 500;

            const resourceValue = (target.gold + target.rice) * 0.5 * smartness;
            score += resourceValue;

            if (myGeneral.intelligence < enemyGeneral.intelligence - 10) {
                score -= 300 * smartness; 
            }

            if (score > bestScore) {
                bestScore = score;
                bestTarget = target;
            }
        });

        // 閾値もパラメータ化
        const threshold = baseThreshold * mods.accuracy; 

        if (bestScore > threshold) {
            return bestTarget;
        }
        return null;
    }

    executeAttack(source, target, general) {
        const bushos = this.game.getCastleBushos(source.id).filter(b => b.status !== 'ronin');
        const sorted = bushos.sort((a,b) => b.leadership - a.leadership).slice(0, 3);
        const sendSoldiers = Math.floor(source.soldiers * (window.AIParams.AI.SoldierSendRate || 0.8));
        
        if (sendSoldiers <= 0) return;
        
        // 修正: WarManager.startWarで減算するようにしたため、ここでは減算しない
        // source.soldiers -= sendSoldiers; 

        this.game.warManager.startWar(source, target, sorted, sendSoldiers);
    }

    execInternalAffairs(castle, castellan, mods, smartness) {
        const gold = castle.gold;
        const rice = castle.rice;
        const soldiers = castle.soldiers;
        
        let scoreCharity = 0;
        if (castle.loyalty < 40) scoreCharity = (100 - castle.loyalty) * 2;
        
        let scoreDraft = 0;
        const safeSoldierCount = 300 + (smartness * 500); 
        if (soldiers < safeSoldierCount && castle.population > 1000) {
            scoreDraft = (safeSoldierCount - soldiers) * 0.2;
            if (mods.aggression > 1.0) scoreDraft *= 1.5;
        }

        let scoreTraining = 0;
        if (castle.training < 100) {
            scoreTraining = (100 - castle.training) * 0.5;
            if (soldiers > 500) scoreTraining *= 1.5;
        }

        let scoreCommerce = 0;
        let scoreFarm = 0;
        if (gold < 500) scoreCommerce = (500 - gold) * 0.5; 
        else scoreCommerce = 20; 
        
        scoreFarm = 20;
        if (smartness > 0.6 && this.game.month < 8) scoreFarm += 10;

        const actions = [
            { type: 'charity', score: scoreCharity, cost: 300 },
            { type: 'draft', score: scoreDraft, cost: Math.min(gold, 500) }, 
            { type: 'training', score: scoreTraining, cost: 0 },
            { type: 'commerce', score: scoreCommerce, cost: 500 },
            { type: 'farm', score: scoreFarm, cost: 500 }
        ];

        actions.forEach(a => {
            a.score *= (0.8 + Math.random() * 0.4); 
            if (castellan.politics > 70 && (a.type === 'commerce' || a.type === 'farm')) a.score *= 1.2;
            if (castellan.leadership > 70 && (a.type === 'draft' || a.type === 'training')) a.score *= 1.2;
            if (castellan.charm > 70 && a.type === 'charity') a.score *= 1.2;
        });

        actions.sort((a,b) => b.score - a.score);

        for (let action of actions) {
            if (action.score < 10) continue; 

            if (action.type === 'charity' && gold >= action.cost) {
                 castle.gold -= action.cost;
                 castle.loyalty = Math.min(100, castle.loyalty + GameSystem.calcCharity(castellan, 'money'));
                 castellan.isActionDone = true; return;
            }
            if (action.type === 'draft' && gold >= 200 && castle.population > 1000) {
                 const useGold = Math.min(gold, 500);
                 castle.gold -= useGold;
                 const gain = GameSystem.calcDraftFromGold(useGold, castellan, castle.population);
                 castle.soldiers += gain;
                 castle.population -= Math.floor(gain * 0.1);
                 castellan.isActionDone = true; return;
            }
            if (action.type === 'training') {
                 castle.training = Math.min(120, castle.training + GameSystem.calcTraining(castellan));
                 castellan.isActionDone = true; return;
            }
            if ((action.type === 'commerce' || action.type === 'farm') && gold >= 500) {
                 castle.gold -= 500;
                 const val = GameSystem.calcDevelopment(castellan);
                 if (action.type === 'commerce') castle.commerce += val;
                 else castle.kokudaka += val;
                 castellan.isActionDone = true; return;
            }
        }

        castellan.isActionDone = true;
    }

    execAIDiplomacy(castle, castellan, smartness) {
        const neighbors = this.game.castles.filter(c => c.ownerClan !== 0 && c.ownerClan !== castle.ownerClan && GameSystem.isAdjacent(castle, c));
        if (neighbors.length === 0) return;
        
        const uniqueNeighbors = [...new Set(neighbors.map(c => c.ownerClan))];
        const myPower = this.game.getClanTotalSoldiers(castle.ownerClan);
        const myDaimyo = this.game.bushos.find(b => b.clan === castle.ownerClan && b.isDaimyo) || { duty: 50 };

        for (let targetClanId of uniqueNeighbors) {
            if (castellan.isActionDone) break;

            const targetClanTotal = this.game.getClanTotalSoldiers(targetClanId);
            const rel = this.game.getRelation(castle.ownerClan, targetClanId);
            
            if (rel.alliance) {
                 const enemies = neighbors.filter(c => !this.game.getRelation(castle.ownerClan, c.ownerClan).alliance);
                 const dutyInhibition = (myDaimyo.duty * 0.01) * (1.0 - (smartness * 0.5)); 
                 
                 if (enemies.length === 0 && myPower > targetClanTotal * 2.5 && Math.random() > dutyInhibition) {
                      this.game.commandSystem.executeDiplomacy(castellan.id, targetClanId, 'break_alliance'); 
                      castellan.isActionDone = true;
                 }
                 continue;
            }

            if (myPower < targetClanTotal * 0.8) {
                if (Math.random() < smartness) {
                    if (rel.friendship < (window.AIParams.AI.GoodwillThreshold || 40) && castle.gold > 500) {
                         this.game.commandSystem.executeDiplomacy(castellan.id, targetClanId, 'goodwill', 200); 
                         castellan.isActionDone = true;
                    } else if (rel.friendship > (window.AIParams.AI.AllianceThreshold || 70)) {
                         this.game.commandSystem.executeDiplomacy(castellan.id, targetClanId, 'alliance');
                         castellan.isActionDone = true;
                    }
                }
            }
        }
    }
}