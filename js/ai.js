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
        GoodwillThreshold: 69, 
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
            const diplomacyChance = ((window.AIParams.AI.DiplomacyChance || 0.3) / 3) * (mods.aggression); 
            if (Math.random() < diplomacyChance) {
                const dipResult = this.execAIDiplomacy(castle, castellan, smartness); 
                if (dipResult === 'waiting') return; // ★ プレイヤーのお返事待ちならここで一旦ストップ！
                if (castellan.isActionDone) { this.game.finishTurn(); return; }
            }
            
            // 軍事フェーズ
            const elapsedTurns = (this.game.year - window.MainParams.StartYear) * 12 
                               + (this.game.month - window.MainParams.StartMonth);

            if (elapsedTurns >= 3) {
                // ★追加：自分が従属している「親大名」を探します
                const myClanId = castle.ownerClan;
                let myBossId = 0;
                for (const c of this.game.clans) {
                    if (c.id !== myClanId) {
                        const r = this.game.getRelation(myClanId, c.id);
                        if (r && r.status === '従属') {
                            myBossId = c.id;
                            break;
                        }
                    }
                }

                const neighbors = this.game.castles.filter(c => 
                    c.ownerClan !== 0 && 
                    c.ownerClan !== myClanId && 
                    GameSystem.isReachable(this.game, castle, c, myClanId)
                );
                
                const validEnemies = neighbors.filter(target => {
                    const rel = this.game.getRelation(myClanId, target.ownerClan);
                    const isProtected = ['同盟', '支配', '従属'].includes(rel.status);
                    if (isProtected || (target.immunityUntil || 0) >= this.game.getCurrentTurnId()) return false;

                    // ★追加：親大名がいる場合、親の「同盟国」や「他の従属国（親が支配している国）」は攻撃できない
                    if (myBossId !== 0) {
                        const bossRel = this.game.getRelation(myBossId, target.ownerClan);
                        if (bossRel && ['同盟', '支配'].includes(bossRel.status)) {
                            return false;
                        }
                    }

                    return true;
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
        
        // ★ここを書き足します：出陣する兵士が0人以下の時は、攻撃を諦めます！
        if (sendSoldiers <= 0) return null;
        
        // 兵糧のチェック (連れて行く兵士数の1.5倍)
        const requiredRice = sendSoldiers * 1.5;
        if (myCastle.rice < requiredRice) return null;

        // --- 修正後：正確な見積もりと戦力比の計算 ---

        const myDaimyo = this.game.bushos.find(b => b.clan === myCastle.ownerClan && b.isDaimyo) || { personality: 'normal' };

        let bestTarget = null;
        let highestProb = -1;

        enemies.forEach(target => {
            const rel = this.game.getRelation(myCastle.ownerClan, target.ownerClan);
            
            // 知略が低いほど、敵の数を見誤る（誤差が出る）計算
            const int = myGeneral.intelligence;
            const errorRange = Math.min(0.3, Math.max(0, (100 - int) / 100 * 0.3));
            const errorRate = 1.0 + (Math.random() - 0.5) * 2 * errorRange;

            // 誤差を含めた敵の兵数と防御力
            const pEnemySoldiers = target.soldiers * errorRate;
            const pEnemyDefense = target.defense * errorRate;

            // ★修正：敵の強さを「兵士の数 ＋ 城の防御力」で素直に見積もります
            const enemyForce = pEnemySoldiers + pEnemyDefense;

            // ★修正：自分の強さも、お城の全兵士数を使って比べます
            const forceRatio = myCastle.soldiers / Math.max(1, enemyForce);
            
            let prob = 0;
            if (forceRatio < 0.8) {
                // ★足切り魔法：自分の戦力が相手の0.8倍未満なら、絶対に攻撃しない！
                prob = -999;
            } else if (forceRatio >= 3.0) {
                // 相手の3倍以上の戦力がある時
                prob = 40 + (forceRatio - 3.0) * 5;
            } else if (forceRatio >= 2.0) {
                // 相手の2倍から3倍までの時
                prob = 30 + (forceRatio - 2.0) * 10; 
            } else if (forceRatio >= 1.0) {
                // 相手と互角から2倍までの時
                prob = 10 + (forceRatio - 1.0) * 20;
            } else {
                // 相手の0.8倍から互角までの時
                prob = (forceRatio - 0.8) * 50;
            }

            // ★大魔法：最終的な確率に0.1をかけて、全体を10分の1まで落とします！
            if (prob > 0) {
                prob = prob * 0.1;
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
            prob = Math.max(0, prob); // ★ここを0.1から0に変えました！

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

    // ★ここを async に書き足します
    async executeAttack(source, target, general, sendSoldiers, sendRice) {
    // ★ここを書き換えます：条件を満たさず攻撃できなかった時も、ターンを終わらせて固まるのを防ぎます！
    if (sendSoldiers <= 0 || sendRice <= 0) {
        this.game.finishTurn();
        return;
    }
    const bushos = this.game.getCastleBushos(source.id).filter(b => b.status !== 'ronin');
    const sorted = bushos.sort((a,b) => b.leadership - a.leadership).slice(0, 3);
    this.game.warManager.startWar(source, target, sorted, sendSoldiers, sendRice);

    // ★ここから下を書き足します（戦争が終わるまで待つ魔法！）
    while (this.game.warManager.state.active) {
        await new Promise(resolve => setTimeout(resolve, 500));
    }
}

    execInternalAffairs(castle, castellan, mods, smartness) {
        // ① 大名を取得します（行動回数の計算に使います）
        const daimyo = this.game.bushos.find(b => b.clan === castle.ownerClan && b.isDaimyo) || castellan;

        // ② 行動回数の計算：「(城主内政＋城主魅力＋大名内政＋大名魅力) ÷ 2」
        const baseAP = Math.floor((castellan.politics + castellan.charm + daimyo.politics + daimyo.charm) / 2);
        // 最低1回、40ごとに+1回
        let maxActions = 1 + Math.floor(baseAP / 40);

        // お城にいる動ける武将（浪人や国人衆ではない人）をリストアップします
        let availableBushos = this.game.getCastleBushos(castle.id).filter(b => 
            !b.isActionDone && b.status !== 'ronin' && b.belongKunishuId === 0
        );

        // 武将の人数より多くは行動できません
        maxActions = Math.min(maxActions, availableBushos.length);

        // ★追加：NPCが賢すぎるのを防ぐため、ランダムで「0回」「1回」「2回」のどれかだけ行動回数を減らします
        const reduceActions = Math.floor(Math.random() * 3); // 0, 1, 2のどれかを作る魔法です
        maxActions = Math.max(1, maxActions - reduceActions); // 減らしても、最低1回は必ず行動させます

        if (maxActions <= 0) return;

        // 城主の性格による好みの計算（相対値で最大±20%のブレ）
        const isConservative = castellan.personality === 'conservative';
        const isAggressive = castellan.personality === 'aggressive';

        // お隣の敵のお城を調べておきます（徴兵の判断用）
        const neighbors = this.game.castles.filter(c => 
            c.ownerClan !== 0 && c.ownerClan !== castle.ownerClan && GameSystem.isAdjacent(castle, c)
        );

        // ③ 決められた回数だけ、行動を繰り返します！
        for (let step = 0; step < maxActions; step++) {
            // まだ動ける武将を再確認します
            availableBushos = this.game.getCastleBushos(castle.id).filter(b => 
                !b.isActionDone && b.status !== 'ronin' && b.belongKunishuId === 0
            );

            // --- 候補となる行動の点数（スコア）をつける表を作ります ---
            let actions = [];

            // 1. 城壁修復（最大値の1/4以下なら超優先！）
            if (castle.defense < castle.maxDefense) {
                let score = 0;
                if (castle.defense <= castle.maxDefense / 4) score = 1000; // 緊急事態！
                else score = 20;
                actions.push({ type: 'repair', stat: 'politics', score: score, cost: 200 });
            }

            // 2. 施し（民忠70以下なら優先！）
            if (castle.peoplesLoyalty < 100) {
                let score = 0;
                if (castle.peoplesLoyalty <= 70) score = 500; // 結構優先！
                else score = (100 - castle.peoplesLoyalty) * 2;
                actions.push({ type: 'charity', stat: 'charm', score: score, cost: 200 }); 
            }

            // 3. 徴兵（お隣の敵と比べて、自分が少ないほど焦る、または最低限の備え）
            if (castle.population > 1000 && castle.soldiers < castle.rice / 2) {
                let scoreDraft = 0;
                let mySoldiers = Math.max(1, castle.soldiers);
                let enemyMaxSoldiers = 0;
                neighbors.forEach(n => {
                    if (n.soldiers > enemyMaxSoldiers) enemyMaxSoldiers = n.soldiers;
                });
                
                const keepSoldiers = (castellan.leadership + daimyo.leadership) * 50;

                if (enemyMaxSoldiers > mySoldiers) {
                    scoreDraft = ((enemyMaxSoldiers * 1.5 / mySoldiers) * 20); 
                } else if (castle.soldiers < keepSoldiers) {
                    scoreDraft = 30; 
                }

                if (scoreDraft > 0) {
                    actions.push({ type: 'draft', stat: 'leadership', score: scoreDraft, cost: 500 }); 
                }
            }

            // 4. 訓練
            if (castle.training < 100) {
                let score = (100 - castle.training) * 0.5;
                actions.push({ type: 'training', stat: 'leadership', score: score, cost: 0 }); 
            }

            // 5. 兵施し（士気）
            if (castle.morale < 100) {
                let score = (100 - castle.morale) * 0.5;
                actions.push({ type: 'soldier_charity', stat: 'leadership', score: score, cost: 200 }); 
            }

            // 6. 石高開発
            if (castle.kokudaka < castle.maxKokudaka) {
                actions.push({ type: 'farm', stat: 'politics', score: 30, cost: 200 });
            }

            // 7. 鉱山開発
            if (castle.commerce < castle.maxCommerce) {
                actions.push({ type: 'commerce', stat: 'politics', score: 30, cost: 200 });
            }

            // --- 性格による点数の調整 ---
            actions.forEach(a => {
                if (isConservative && ['farm', 'commerce', 'repair', 'charity'].includes(a.type)) {
                    a.score *= 1.2; 
                }
                if (isAggressive && ['draft', 'training', 'soldier_charity'].includes(a.type)) {
                    a.score *= 1.2; 
                }
                a.score *= (0.9 + Math.random() * 0.2);
            });

            // 8. 兵糧売買（特殊な判断）
            if (castle.gold < 500 && castle.rice > 3000) {
                const targetRice = Math.max(3000, Math.floor(castle.soldiers * 1.5));
                if (castle.rice > targetRice) {
                    actions.push({ type: 'sell_rice', stat: 'politics', score: 800, cost: 0 }); 
                }
            }
            if (castle.rice <= castle.soldiers * 1) {
                actions.push({ type: 'buy_rice', stat: 'politics', score: 800, cost: 0 }); 
            }

            // 9. 輸送（大名のいない城のみ）
            if (!daimyo || daimyo.castleId !== castle.id) {
                // ★修正：プレイヤーと同じように「道が繋がっているか（自領、同盟、支配を通れるか）」を判定します！
                const allyCastles = this.game.castles.filter(c => 
                    c.ownerClan === castle.ownerClan && 
                    c.id !== castle.id &&
                    GameSystem.isReachable(this.game, castle, c, castle.ownerClan)
                );
                
                for (const target of allyCastles) {
                    if ((target.soldiers <= 500 || target.gold <= 500) && castle.soldiers >= 2000 && castle.gold >= 2000) {
                        actions.push({ type: 'transport', stat: 'leadership', score: 400, cost: 0, targetId: target.id, res: 'gold_soldier' });
                        break; 
                    }
                    if (target.rice <= 2000 && castle.rice >= 5000) {
                        actions.push({ type: 'transport', stat: 'leadership', score: 400, cost: 0, targetId: target.id, res: 'rice' });
                        break;
                    }
                }
            }

            // 10. 武将の移動
            const myClanCastles = this.game.castles.filter(c => 
                c.ownerClan === castle.ownerClan && 
                c.id !== castle.id && 
                GameSystem.isReachable(this.game, castle, c, castle.ownerClan)
            );
            
            // ① 従来の空き城への移動
            const emptyCastles = myClanCastles.filter(c => c.samuraiIds.length <= 1);
            if (emptyCastles.length > 0) {
                actions.push({ type: 'move', stat: 'leadership', score: 300, cost: 0, targetId: emptyCastles[0].id });
            }
            
            // ② 派閥に属する武将は、派閥主のいる城やその隣の城に積極的に移動する
            availableBushos.forEach(b => {
                if (b.factionId !== 0 && !b.isFactionLeader && b.id !== castle.castellanId && !b.isDaimyo) {
                    const leader = this.game.bushos.find(lb => lb.isFactionLeader && lb.factionId === b.factionId);
                    if (leader && leader.castleId !== castle.id) {
                        const leaderCastle = this.game.getCastle(leader.castleId);
                        if (leaderCastle && myClanCastles.some(c => c.id === leaderCastle.id)) {
                            // 派閥主の城へ移動
                            actions.push({ type: 'move', stat: 'leadership', score: 350, cost: 0, targetId: leaderCastle.id, specificMover: b });
                        } else if (leaderCastle) {
                            // 派閥主の城に直接行けない場合、隣の城を探す
                            const neighborCastles = myClanCastles.filter(c => GameSystem.isAdjacent(c, leaderCastle));
                            if (neighborCastles.length > 0) {
                                actions.push({ type: 'move', stat: 'leadership', score: 320, cost: 0, targetId: neighborCastles[0].id, specificMover: b });
                            }
                        }
                    }
                }
            });
            if (emptyCastles.length > 0) {
                actions.push({ type: 'move', stat: 'leadership', score: 300, cost: 0, targetId: emptyCastles[0].id });
            }
            
            // ★追加 11. 登用（浪人がいる場合、超低確率）
            const ronins = this.game.getCastleBushos(castle.id).filter(b => b.status === 'ronin');
            if (ronins.length > 0) {
                // 雀の涙ほどの優先度（5点）にしてあります
                actions.push({ type: 'employ', stat: 'charm', score: 5, cost: 0, targetRonin: ronins[0] });
            }

            // ★追加 12. 褒美（承認欲求がたまっている武将がいる場合）
            // プログラム内で承認欲求や不満を表す「achievementTotal」や「recognition」が30を超えている人を探します
            let rewardTargets = this.game.getCastleBushos(castle.id).filter(b => 
                b.status !== 'ronin' && b.belongKunishuId === 0 && 
                ((b.achievementTotal || 0) > 30 || (b.recognition || 0) > 30)
            );
            if (rewardTargets.length > 0 && castle.gold >= 200) {
                // 優先度は低め（15点）にしてあります
                actions.push({ type: 'reward', stat: 'none', score: 15, cost: 200, targets: rewardTargets });
            }

            // 点数が高い順に並べ替えます
            actions.sort((a, b) => b.score - a.score);

            let actionDoneInThisStep = false;

            // 一番点数が高い行動から順番に「できるかどうか」試していきます
            for (let action of actions) {
                if (action.score < 5) continue; // ★変更：登用の5点も拾えるように、足切りラインを10から5に下げました！

                // ★追加：褒美は「実行する武将（doer）」を必要としない特別な行動です！
                if (action.type === 'reward') {
                    // 承認欲求が一番高い人を1人選びます
                    action.targets.sort((a, b) => {
                        const aVal = Math.max(a.achievementTotal || 0, a.recognition || 0);
                        const bVal = Math.max(b.achievementTotal || 0, b.recognition || 0);
                        return bVal - aVal; // 高い順に並び替え
                    });
                    const targetBusho = action.targets[0];
                    
                    if (castle.gold >= 200) {
                        castle.gold -= 200;
                        // 褒美の効果をプレイヤーと同じように計算します
                        const effect = GameSystem.calcRewardEffect(200, daimyo, targetBusho);
                        if (this.game.factionSystem && this.game.factionSystem.updateRecognition) {
                            this.game.factionSystem.updateRecognition(targetBusho, -effect * 2 - 5);
                        }
                        if (targetBusho.achievementTotal !== undefined) {
                            // 念のためこちらの数値も下げておきます
                            targetBusho.achievementTotal = Math.max(0, targetBusho.achievementTotal - 30);
                        }
                        
                        // ★あや瀨さんのお約束通り、誰の「行動済」マークもつけません！
                        actionDoneInThisStep = true; 
                        break; 
                    }
                    continue; // もしお金が足りなかったら、この行動は諦めて次を探します
                }

                // --- これより下は、実行する武将（doer）が必要な行動です ---
                if (availableBushos.length === 0) continue; // 動ける武将がいなければパスします

                // その行動に一番向いている武将を探します（能力値40以上が条件）
                const bestBushos = availableBushos.filter(b => b[action.stat] >= 40).sort((a, b) => b[action.stat] - a[action.stat]);
                if (bestBushos.length === 0) continue; // 基準を満たす人がいなければ、この行動は諦めます
                const doer = bestBushos[0];

                // 実行処理
                if (action.type === 'employ') {
                    const targetRonin = action.targetRonin;
                    const myPower = this.game.getClanTotalSoldiers(castle.ownerClan) || 1;
                    const success = GameSystem.calcEmploymentSuccess(doer, targetRonin, myPower, 0);
                    
                    if (success) {
                        targetRonin.status = 'active';
                        targetRonin.clan = castle.ownerClan;
                        targetRonin.loyalty = 50;
                        targetRonin.castleId = castle.id;
                        if (!castle.samuraiIds.includes(targetRonin.id)) {
                            castle.samuraiIds.push(targetRonin.id);
                        }
                        this.game.updateCastleLord(castle);
                        
                        // ★プレイヤーと同じ！成功したらしっかり功績と承認欲求のご褒美をあげます
                        const maxStat = Math.max(targetRonin.strength, targetRonin.intelligence, targetRonin.leadership, targetRonin.charm, targetRonin.diplomacy);
                        doer.achievementTotal = (doer.achievementTotal || 0) + Math.floor(maxStat * 0.3);
                        if (this.game.factionSystem && this.game.factionSystem.updateRecognition) this.game.factionSystem.updateRecognition(doer, 20);
                    } else {
                        // 失敗しても少しだけ慰めのご褒美をあげます
                        doer.achievementTotal = (doer.achievementTotal || 0) + 5;
                        if (this.game.factionSystem && this.game.factionSystem.updateRecognition) this.game.factionSystem.updateRecognition(doer, 10);
                    }
                    
                    doer.isActionDone = true; 
                    actionDoneInThisStep = true; 
                    break;
                }
                if (action.type === 'repair' && castle.gold >= 200) {
                    castle.gold -= 200;
                    const val = GameSystem.calcRepair(doer);
                    const oldVal = castle.defense;
                    castle.defense = Math.min(castle.maxDefense, castle.defense + val);
                    
                    // ★プレイヤーと同じ！上がった分だけご褒美をあげます
                    const actualVal = castle.defense - oldVal;
                    doer.achievementTotal = (doer.achievementTotal || 0) + Math.floor(actualVal * 0.5);
                    if (this.game.factionSystem && this.game.factionSystem.updateRecognition) this.game.factionSystem.updateRecognition(doer, 10);
                    
                    doer.isActionDone = true; actionDoneInThisStep = true; break;
                }
                if (action.type === 'charity' && castle.rice >= 200) {
                    castle.rice -= 200;
                    
                    // ★ずるっこ禁止！プレイヤーと同じく「6で割る」厳しい計算式に直しました！
                    let val = GameSystem.calcCharity(doer, 'rice');
                    val = Math.floor(val / 6);
                    if (val < 1) val = 1;
                    
                    const oldVal = castle.peoplesLoyalty;
                    castle.peoplesLoyalty = Math.min(100, castle.peoplesLoyalty + val);
                    
                    doer.achievementTotal = (doer.achievementTotal || 0) + Math.floor(val * 0.5);
                    if (this.game.factionSystem && this.game.factionSystem.updateRecognition) this.game.factionSystem.updateRecognition(doer, 15);
                    
                    doer.isActionDone = true; actionDoneInThisStep = true; break;
                }
                if (action.type === 'draft' && castle.gold >= 500 && castle.population > 1000) {
                    let soldiers = GameSystem.calcDraftFromGold(500, doer, castle.population);
                    soldiers = Math.floor(soldiers / 10);
                    if (castle.soldiers + soldiers > 99999) {
                        soldiers = 99999 - castle.soldiers;
                    }
                    if (soldiers > 0) {
                        castle.gold -= 500;
                        const newMorale = Math.max(0, castle.morale - 10);
                        const newTraining = Math.max(0, castle.training - 10);
                        castle.training = Math.floor(((castle.training * castle.soldiers) + (newTraining * soldiers)) / (castle.soldiers + soldiers));
                        castle.morale = Math.floor(((castle.morale * castle.soldiers) + (newMorale * soldiers)) / (castle.soldiers + soldiers));
                        castle.soldiers += soldiers;
                        
                        // ★プレイヤーと同じ！徴兵でもご褒美をあげます
                        doer.achievementTotal = (doer.achievementTotal || 0) + 5;
                        if (this.game.factionSystem && this.game.factionSystem.updateRecognition) this.game.factionSystem.updateRecognition(doer, 10);
                        
                        doer.isActionDone = true; 
                        actionDoneInThisStep = true; 
                        break;
                    } else {
                        continue; // 上限で増やせなかったら諦める
                    }
                }
                if (action.type === 'training') {
                    const val = GameSystem.calcTraining(doer);
                    const oldVal = castle.training;
                    castle.training = Math.min(100, castle.training + val);
                    
                    const actualVal = castle.training - oldVal;
                    doer.achievementTotal = (doer.achievementTotal || 0) + Math.floor(actualVal * 0.5);
                    if (this.game.factionSystem && this.game.factionSystem.updateRecognition) this.game.factionSystem.updateRecognition(doer, 10);
                    
                    doer.isActionDone = true; actionDoneInThisStep = true; break;
                }
                if (action.type === 'soldier_charity' && castle.rice >= 200) {
                    castle.rice -= 200;
                    const val = GameSystem.calcSoldierCharity(doer);
                    const oldVal = castle.morale;
                    castle.morale = Math.min(100, castle.morale + val);
                    
                    const actualVal = castle.morale - oldVal;
                    doer.achievementTotal = (doer.achievementTotal || 0) + Math.floor(actualVal * 0.5);
                    if (this.game.factionSystem && this.game.factionSystem.updateRecognition) this.game.factionSystem.updateRecognition(doer, 10);
                    
                    doer.isActionDone = true; actionDoneInThisStep = true; break;
                }
                if (action.type === 'farm' && castle.gold >= 200) {
                    castle.gold -= 200;
                    const val = GameSystem.calcDevelopment(doer);
                    const oldVal = castle.kokudaka;
                    castle.kokudaka = Math.min(castle.maxKokudaka, castle.kokudaka + val);
                    
                    const actualVal = castle.kokudaka - oldVal;
                    doer.achievementTotal = (doer.achievementTotal || 0) + Math.floor(actualVal * 0.5);
                    if (this.game.factionSystem && this.game.factionSystem.updateRecognition) this.game.factionSystem.updateRecognition(doer, 10);
                    
                    doer.isActionDone = true; actionDoneInThisStep = true; break;
                }
                if (action.type === 'commerce' && castle.gold >= 200) {
                    castle.gold -= 200;
                    const val = GameSystem.calcDevelopment(doer);
                    const oldVal = castle.commerce;
                    castle.commerce = Math.min(castle.maxCommerce, castle.commerce + val);
                    
                    const actualVal = castle.commerce - oldVal;
                    doer.achievementTotal = (doer.achievementTotal || 0) + Math.floor(actualVal * 0.5);
                    if (this.game.factionSystem && this.game.factionSystem.updateRecognition) this.game.factionSystem.updateRecognition(doer, 10);
                    
                    doer.isActionDone = true; actionDoneInThisStep = true; break;
                }
                
                // 特殊行動群
                if (action.type === 'sell_rice') {
                    const sellAmount = castle.rice - Math.max(3000, Math.floor(castle.soldiers * 1.5));
                    if (sellAmount > 0) {
                        const gain = Math.floor(sellAmount * this.game.marketRate);
                        // ★プレイヤーと同じ！上限(99,999)を超えないかチェックします
                        if (castle.gold + gain <= 99999) {
                            castle.rice -= sellAmount;
                            castle.gold += gain;
                            doer.isActionDone = true; actionDoneInThisStep = true; break;
                        } else {
                            continue; // 上限を超えるなら売るのをやめます
                        }
                    }
                }
                if (action.type === 'buy_rice') {
                    const buyAmount = Math.floor(castle.soldiers * 1.5) - castle.rice;
                    const cost = Math.floor(buyAmount * this.game.marketRate);
                    if (buyAmount > 0 && castle.gold >= cost + 500) {
                        // ★プレイヤーと同じ！上限(99,999)を超えないかチェックします
                        if (castle.rice + buyAmount <= 99999) {
                            castle.gold -= cost;
                            castle.rice += buyAmount;
                            doer.isActionDone = true; actionDoneInThisStep = true; break;
                        } else {
                            continue; // 上限を超えるなら買うのをやめます
                        }
                    }
                }
                if (action.type === 'transport') {
                    const targetCastle = this.game.getCastle(action.targetId);
                    if (action.res === 'gold_soldier') {
                        // ★プレイヤーと同じ！上限チェックを付けました
                        if (targetCastle.gold + 500 <= 99999 && targetCastle.soldiers + 500 <= 99999) {
                            castle.gold -= 500; castle.soldiers -= 500;
                            
                            // ★プレイヤーと同じ！兵士が移動したことによる訓練と士気の変化も計算します
                            const totalS = targetCastle.soldiers + 500;
                            targetCastle.training = Math.floor(((targetCastle.training * targetCastle.soldiers) + (castle.training * 500)) / totalS);
                            targetCastle.morale = Math.floor(((targetCastle.morale * targetCastle.soldiers) + (castle.morale * 500)) / totalS);
                            
                            targetCastle.gold += 500; targetCastle.soldiers += 500;
                        } else { continue; }
                    } else if (action.res === 'rice') {
                        // ★プレイヤーと同じ！上限チェックを付けました
                        if (targetCastle.rice + 1000 <= 99999) {
                            castle.rice -= 1000;
                            targetCastle.rice += 1000;
                        } else { continue; }
                    }
                    
                    // 【⚠️AI書き換え防止の注意書き⚠️】
                    // AIの輸送コマンドでは、プレイヤーの仕様とは異なり、絶対に武将を移動させてはいけません！
                    // ここに武将の移動処理（handleMoveなど）を追加しないこと。
                    
                    doer.isActionDone = true; actionDoneInThisStep = true; break; 
                }
                if (action.type === 'move') {
                    let movers = [];
                    
                    if (action.specificMover) {
                        // 派閥主の元へ合流する武将の場合は、その人だけ移動リストに入れます
                        movers.push(action.specificMover);
                    } else {
                        // 従来の空き城への移動など
                        let moveCandidates = availableBushos.filter(b => b.id !== castle.castellanId);
                        let mainMover = null;
                        const factionLeader = moveCandidates.find(b => b.isFactionLeader);
                        
                        if (factionLeader) {
                            // 派閥主が見つかったら、移動リストのリーダーにします
                            mainMover = factionLeader;
                            movers.push(mainMover);
                            // 派閥主が移動する場合は、大名以外の、その城にいて、派閥に属する武将は全員お供にします
                            const followers = moveCandidates.filter(b => 
                                b.id !== mainMover.id && 
                                b.factionId === mainMover.factionId && 
                                !b.isDaimyo && 
                                !b.isFactionLeader // 別の派閥主は巻き込まない（２人同時の派閥主移動を防ぐ）
                            );
                            movers = movers.concat(followers); // リーダーとお供を合流させます
                        } else {
                            // 派閥主がいなければ、仲の悪い人を探して移動させます
                            for (let b of moveCandidates) {
                                if (GameSystem.calcAffinityDiff(castellan.affinity, b.affinity) >= 20) {
                                    mainMover = b; 
                                    movers.push(mainMover);
                                    break;
                                }
                            }
                        }
                    }

                    if (movers.length > 0) {
                        const targetCastle = this.game.getCastle(action.targetId);
                        
                        // 元の城に最低３人残るかチェックします
                        const sourceCountAfter = castle.samuraiIds.length - movers.length;
                        if (sourceCountAfter < 3) {
                            continue; // ３人未満になるなら、今回の移動は諦めます
                        }

                        // リストに入っている全員を一斉に移動させます
                        movers.forEach(mover => {
                            this.game.factionSystem.handleMove(mover, castle.id, action.targetId);
                            castle.samuraiIds = castle.samuraiIds.filter(id => id !== mover.id);
                            targetCastle.samuraiIds.push(mover.id);
                            mover.castleId = action.targetId;
                            mover.isActionDone = true;
                        });
                        
                        actionDoneInThisStep = true; 
                        break;
                    }
                }
            }
            
            // もし何も実行できる行動がなかったら、もうこのお城の行動は終わりにします
            if (!actionDoneInThisStep) break;
        }
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
            
            // ★追加: 相手の大名家(targetClanId)の城をどれか一つ選びます（外交コマンドを実行する的として使います）
            const targetCastle = neighbors.find(c => c.ownerClan === targetClanId);
            if (!targetCastle) continue; // もしお城が見つからなかったらスキップ！
            const targetCastleId = targetCastle.id;
            
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
                        this.game.commandSystem.executeDiplomacy(castellan.id, targetCastleId, 'break_alliance'); // ★変更：targetClanId を targetCastleId に直しました！
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
                      this.game.commandSystem.executeDiplomacy(castellan.id, targetCastleId, 'break_alliance'); // ★変更：targetClanId を targetCastleId に直しました！
                      castellan.isActionDone = true;
                 }
                 continue;
            }

            // 相手の戦力が自分の1/5以下なら、稀に支配を試みます
            if (targetClanTotal * 5 <= myPower) {
                if (Math.random() < 0.2) { // 20%の確率で支配コマンドを実行します
                    if (targetClanId === this.game.playerClanId) {
                        // ★相手がプレイヤーならお返事を待つ
                        this.game.commandSystem.proposeDiplomacyToPlayer(castellan, targetClanId, 'dominate', 0, () => {
                            castellan.isActionDone = true;
                            this.game.finishTurn(); // お返事のあとにターンを進める
                        });
                        return 'waiting';
                    } else {
                        // 相手がAIならそのまま実行
                        this.game.commandSystem.executeDiplomacy(castellan.id, targetCastleId, 'dominate'); // ★変更：targetClanId を targetCastleId に直しました！
                        castellan.isActionDone = true;
                        continue;
                    }
                }
            }

            // 通常の親善・同盟のロジック
            if (myPower < targetClanTotal * 0.8) {
                if (Math.random() < smartness) {
                    if (rel.sentiment < (window.AIParams.AI.GoodwillThreshold || 40)) {
                         // ★変更: 相手の戦力に合わせて親善の金額を決める
                         const ratio = targetClanTotal / Math.max(1, myPower); // 相手が自分の何倍強いか
                         
                         // ★追加: 友好度30以下の険悪な相手には、戦力差3倍以上ないと絶対に親善しない！
                         if (rel.sentiment <= 30 && ratio < 3.0) {
                             // 何もしないで諦める（親善はスキップ）
                         } else {
                             let goodwillGold = 300; // 最低は金300
                             if (ratio >= 3.0) {
                                 goodwillGold = 1000; // 3倍以上強い相手なら最大1000
                             } else if (ratio > 1.5) {
                                 // 1.5倍から3.0倍の間で、300〜1000に増えていく計算
                                 goodwillGold = 300 + ((ratio - 1.5) / 1.5) * 700;
                             }
                             goodwillGold = Math.floor(goodwillGold / 100) * 100; // キリ良く100単位にする

                             // ★城にその金額があるかチェックしてから行う
                             if (castle.gold >= goodwillGold) {
                                 if (targetClanId === this.game.playerClanId) {
                                     // ★相手がプレイヤーならお返事を待つ
                                     this.game.commandSystem.proposeDiplomacyToPlayer(castellan, targetClanId, 'goodwill', goodwillGold, () => {
                                         castellan.isActionDone = true;
                                         this.game.finishTurn();
                                     });
                                     return 'waiting';
                                 } else {
                                     this.game.commandSystem.executeDiplomacy(castellan.id, targetCastleId, 'goodwill', goodwillGold); // ★変更：targetClanId を targetCastleId に直しました！
                                     castellan.isActionDone = true;
                                 }
                             }
                         }
                    } else if (rel.sentiment > (window.AIParams.AI.AllianceThreshold || 70)) {
                         if (targetClanId === this.game.playerClanId) {
                             // ★相手がプレイヤーならお返事を待つ
                             this.game.commandSystem.proposeDiplomacyToPlayer(castellan, targetClanId, 'alliance', 0, () => {
                                 castellan.isActionDone = true;
                                 this.game.finishTurn();
                             });
                             return 'waiting';
                         } else {
                             this.game.commandSystem.executeDiplomacy(castellan.id, targetCastleId, 'alliance'); // ★変更：targetClanId を targetCastleId に直しました！
                             castellan.isActionDone = true;
                         }
                    }
                }
            }
        }
    }
}