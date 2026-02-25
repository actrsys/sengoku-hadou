/**
 * ai.js - 敵思考エンジン
 * 責務: 敵大名のターン処理、内政、外交、軍事判断
 * 依存: WarSystem (war.js) の計算ロジックを使用して、parameter.csvの変更を反映させる
 * 修正: 新外交システム対応（感情値による攻撃優先、支配・従属国への攻撃禁止）
 * 修正: ゲーム開始から3ターン未満は攻撃をスキップする制限を追加
 * 修正: 攻撃判定ロジックの全面改修
 */

window.AIParams = {
    AI: {
        Difficulty: 'normal',
        AbilityBase: 50, AbilitySensitivity: 3.0,
        GunshiBiasFactor: 0.5, GunshiFairnessFactor: 0.01,
        DiplomacyChance: 0.3, 
        GoodwillThreshold: 40, 
        AllianceThreshold: 70, 
        BreakAllianceDutyFactor: 0.5
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
            if (Number(castle.ownerClan) === Number(this.game.playerClanId)) {
                console.warn("AI Alert: Player castle detected in AI routine. Returning control to player.");
                this.game.isProcessingAI = false;
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

            // 外交フェーズ (確率で実行)
            if (this.game.month % 3 === 0) {
                const diplomacyChance = (window.AIParams.AI.DiplomacyChance || 0.3) * (mods.aggression); 
                if (Math.random() < diplomacyChance) {
                    this.execAIDiplomacy(castle, castellan, smartness); 
                    if (castellan.isActionDone) { this.game.finishTurn(); return; }
                }
            }
            
            // 軍事フェーズ
            const elapsedTurns = (this.game.year - window.MainParams.StartYear) * 12 
                               + (this.game.month - window.MainParams.StartMonth);

            if (elapsedTurns >= 3) {
                const neighbors = this.game.castles.filter(c => 
                    c.ownerClan !== 0 && 
                    c.ownerClan !== castle.ownerClan && 
                    GameSystem.isReachable(this.game, castle, c, castle.ownerClan)
                );
                
                const validEnemies = neighbors.filter(target => {
                    const rel = this.game.getRelation(castle.ownerClan, target.ownerClan);
                    const isProtected = ['同盟', '支配', '従属'].includes(rel.status);
                    return !isProtected && (target.immunityUntil || 0) < this.game.getCurrentTurnId();
                });

                if (validEnemies.length > 0) {
                    const attackData = this.decideAttackTarget(castle, castellan, validEnemies);
                    if (attackData) {
                        this.executeAttack(castle, attackData.target, castellan, attackData.sendSoldiers, attackData.sendRice);
                        return; 
                    }
                }
            }
            
            // 内政フェーズ (軍事行動をしなかった場合)
            this.execInternalAffairs(castle, castellan, mods, smartness);
            this.game.finishTurn();

        } catch(e) {
            console.error("AI Logic Error:", e);
            this.game.finishTurn();
        }
    }

    decideAttackTarget(myCastle, myGeneral, enemies) {
        // 城主の性格による出陣兵士数の割合決定
        let sendRate = 0.6; // normal (バランス)
        if (myGeneral.personality === 'aggressive') sendRate = 0.8;
        if (myGeneral.personality === 'conservative') sendRate = 0.4;
        
        const sendSoldiers = Math.floor(myCastle.soldiers * sendRate);
        
        // 兵糧のチェック (連れて行く兵士数の1.5倍)
        const requiredRice = sendSoldiers * 1.5;
        if (myCastle.rice < requiredRice) return null;

        const myForce = sendSoldiers * 0.7;
        const myDaimyo = this.game.bushos.find(b => b.clan === myCastle.ownerClan && b.isDaimyo) || { personality: 'normal' };

        let bestTarget = null;
        let highestProb = -1;

        enemies.forEach(target => {
            const rel = this.game.getRelation(myCastle.ownerClan, target.ownerClan);
            
            // 攻撃側の智謀による数値見積もりの誤差 (50を基準に最大30%見誤る)
            const int = myGeneral.intelligence;
            const errorRange = Math.min(0.3, Math.max(0, (100 - int) / 100 * 0.3));
            const errorRate = 1.0 + (Math.random() - 0.5) * 2 * errorRange;
            
            const pEnemySoldiers = target.soldiers * errorRate;
            const pEnemyDefense = target.defense * errorRate;

            // 敵戦力の見積もり
            const enemyForce = (pEnemySoldiers + pEnemyDefense * 2) * 1.5;

            // 基準値の比較
            const forceRatio = myForce / Math.max(1, enemyForce);
            
            let prob = 0;
            if (forceRatio >= 1.0) {
                // 基準値を満たす場合、差が大きいほど確率上昇
                prob = 10 + (forceRatio - 1.0) * 20; 
            } else {
                prob = forceRatio * 10;
            }

            // 守備側武将の能力による攻撃確率低下 (最大10%)
            const enemyBushos = this.game.getCastleBushos(target.id);
            let maxLdr = 0, maxInt = 0;
            if (enemyBushos.length > 0) {
                maxLdr = Math.max(...enemyBushos.map(b => b.leadership));
                maxInt = Math.max(...enemyBushos.map(b => b.intelligence));
            }
            const ldrDrop = maxLdr >= 70 ? Math.min(5, ((maxLdr - 70) / 30) * 5) : 0;
            const intDrop = maxInt >= 70 ? Math.min(5, ((maxInt - 70) / 30) * 5) : 0;
            prob -= (ldrDrop + intDrop);

            // 友好度による補正 (50基準、最低0.1%)
            const sentiment = typeof rel.sentiment !== 'undefined' ? rel.sentiment : 50; 
            prob += (50 - sentiment) * 0.2;

            // 性格による補正関数
            const getPersonalityBonus = (p) => {
                if (p === 'aggressive') return 5;
                if (p === 'conservative') return -5;
                return 0;
            };
            
            // 大名と城主の性格補正を適用
            prob += getPersonalityBonus(myDaimyo.personality);
            prob += getPersonalityBonus(myGeneral.personality);

            // 難易度補正
            const diff = window.AIParams.AI.Difficulty || 'normal';
            const diffMulti = diff === 'hard' ? 1.2 : diff === 'easy' ? 0.7 : 1.0;
            prob *= diffMulti;

            // 攻撃確率の最大値設定
            const maxProb = rel.status === '敵対' ? 40 : 20;
            
            // 最大値と最小値の適用
            prob = Math.min(prob, maxProb);
            prob = Math.max(0.1, prob);

            if (prob > highestProb) {
                highestProb = prob;
                bestTarget = target;
            }
        });

        if (bestTarget && Math.random() * 100 < highestProb) {
            return { target: bestTarget, sendSoldiers, sendRice: requiredRice };
        }
        return null;
    }

    executeAttack(source, target, general, sendSoldiers, sendRice) {
        if (sendSoldiers <= 0 || sendRice <= 0) return;
        const bushos = this.game.getCastleBushos(source.id).filter(b => b.status !== 'ronin');
        const sorted = bushos.sort((a,b) => b.leadership - a.leadership).slice(0, 3);
        this.game.warManager.startWar(source, target, sorted, sendSoldiers, sendRice);
    }

    execInternalAffairs(castle, castellan, mods, smartness) {
        const gold = castle.gold;
        const rice = castle.rice;
        const soldiers = castle.soldiers;
        
        let scoreCharity = 0;
        // ★修正箇所: castle.loyalty -> castle.peoplesLoyalty
        if (castle.peoplesLoyalty < 40) scoreCharity = (100 - castle.peoplesLoyalty) * 2;
        
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
        
        // 鉱山が最大値に達していない時だけ考える
        if (castle.commerce < castle.maxCommerce) {
            if (gold < 500) scoreCommerce = (500 - gold) * 0.5; 
            else scoreCommerce = 20; 
        }
        
        // 石高が最大値に達していない時だけ考える
        if (castle.kokudaka < castle.maxKokudaka) {
            scoreFarm = 20;
            if (smartness > 0.6 && this.game.month < 8) scoreFarm += 10;
        }

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
                 // ★修正箇所: castle.loyalty -> castle.peoplesLoyalty
                 castle.peoplesLoyalty = Math.min(100, castle.peoplesLoyalty + GameSystem.calcCharity(castellan, 'money'));
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
                 
                 // 鉱山開発の時、最大値を超えないようにするストッパー
                 if (action.type === 'commerce') {
                     castle.commerce = Math.min(castle.maxCommerce, castle.commerce + val);
                 } 
                 // 石高開発の時、最大値を超えないようにするストッパー
                 else {
                     castle.kokudaka = Math.min(castle.maxKokudaka, castle.kokudaka + val);
                 }
                 
                 castellan.isActionDone = true; return;
            }
        }

        castellan.isActionDone = true;
    }
    
    execAIDiplomacy(castle, castellan, smartness) {
        const neighbors = this.game.castles.filter(c => c.ownerClan !== 0 && c.ownerClan !== castle.ownerClan && GameSystem.isReachable(this.game, castle, c, castle.ownerClan));
        if (neighbors.length === 0) return;
        
        const uniqueNeighbors = [...new Set(neighbors.map(c => c.ownerClan))];
        const myPower = this.game.getClanTotalSoldiers(castle.ownerClan);
        const myDaimyo = this.game.bushos.find(b => b.clan === castle.ownerClan && b.isDaimyo) || { duty: 50 };

        for (let targetClanId of uniqueNeighbors) {
            if (castellan.isActionDone) break;

            const targetClanTotal = this.game.getClanTotalSoldiers(targetClanId) || 1;
            const rel = this.game.getRelation(castle.ownerClan, targetClanId);
            const dutyInhibition = (myDaimyo.duty * 0.01) * (1.0 - (smartness * 0.5)); 
            
            // 自分が相手に従属している場合（相手が支配者）
            if (rel.status === '従属') {
                // 相手と自分の戦力の「倍率」を計算します
                const ratio = targetClanTotal / myPower;
                
                // 支配者の戦力が自分の2倍以下なら、独立（破棄）を考え始めます
                if (ratio <= 2.0) {
                    // 2.0倍の時は1%(0.01)、1.0倍以下の時は90%(0.90)になるように確率を計算する魔法です
                    const breakProb = 0.01 + (2.0 - Math.max(1.0, ratio)) * 0.89;
                    
                    // サイコロを振って、確率(breakProb)を引き当てたら独立します！
                    if (Math.random() < breakProb && Math.random() > dutyInhibition) {
                        this.game.commandSystem.executeDiplomacy(castellan.id, targetClanId, 'break_alliance'); 
                        castellan.isActionDone = true;
                    }
                }
                // それ以外は破棄を考えません（これ以上何もしない）
                continue;
            }

            // 同盟または支配している場合
            if (rel.status === '同盟' || rel.status === '支配') {
                 const enemies = neighbors.filter(c => !['同盟', '支配', '従属'].includes(this.game.getRelation(castle.ownerClan, c.ownerClan).status));
                 
                 // 敵がいなくて、自分の戦力が相手の2.5倍以上あり、義理のストッパーを越えたら破棄します
                 if (enemies.length === 0 && myPower > targetClanTotal * 2.5 && Math.random() > dutyInhibition) {
                      this.game.commandSystem.executeDiplomacy(castellan.id, targetClanId, 'break_alliance'); 
                      castellan.isActionDone = true;
                 }
                 continue;
            }

            // 相手の戦力が自分の1/5以下なら、稀に支配を試みます
            if (targetClanTotal * 5 <= myPower) {
                if (Math.random() < 0.2) { // 20%の確率で支配コマンドを実行します
                    this.game.commandSystem.executeDiplomacy(castellan.id, targetClanId, 'dominate');
                    castellan.isActionDone = true;
                    continue;
                }
            }

            // 通常の親善・同盟のロジック
            if (myPower < targetClanTotal * 0.8) {
                if (Math.random() < smartness) {
                    if (rel.sentiment < (window.AIParams.AI.GoodwillThreshold || 40) && castle.gold > 500) {
                         this.game.commandSystem.executeDiplomacy(castellan.id, targetClanId, 'goodwill', 200); 
                         castellan.isActionDone = true;
                    } else if (rel.sentiment > (window.AIParams.AI.AllianceThreshold || 70)) {
                         this.game.commandSystem.executeDiplomacy(castellan.id, targetClanId, 'alliance');
                         castellan.isActionDone = true;
                    }
                }
            }
        }
    }
}