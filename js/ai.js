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
            if (availableBushos.length === 0) break; // もう誰もいなければ終了です

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
                actions.push({ type: 'charity', stat: 'charm', score: score, cost: 200 }); // ※お米200
            }

            // 3. 徴兵（お隣の敵と比べて、自分が少ないほど焦る、または最低限の備え）
            // ★追加：ただし、兵士の数が兵糧の半分以上いる時は、徴兵を我慢します！
            if (castle.population > 1000 && castle.soldiers < castle.rice / 2) {
                let scoreDraft = 0;
                let mySoldiers = Math.max(1, castle.soldiers);
                let enemyMaxSoldiers = 0;
                neighbors.forEach(n => {
                    if (n.soldiers > enemyMaxSoldiers) enemyMaxSoldiers = n.soldiers;
                });
                
                // ★追加：城主と大名の統率から「最低限キープしたい兵士数」を計算します
                const keepSoldiers = (castellan.leadership + daimyo.leadership) * 50;

                if (enemyMaxSoldiers > mySoldiers) {
                    scoreDraft = ((enemyMaxSoldiers / mySoldiers) * 15); // 負けている割合で点数アップ
                } else if (castle.soldiers < keepSoldiers) {
                    // ★変更：お隣より少なくなくても、キープしたい数より少なければ「低確率（低い点数）」で徴兵を考えます
                    scoreDraft = 15; // 15点にすることで、他の行動より優先度は低いけれど、たまに選ばれるようになります
                }

                // 点数が0より大きい時だけ、お仕事の候補に入れます
                if (scoreDraft > 0) {
                    actions.push({ type: 'draft', stat: 'leadership', score: scoreDraft, cost: 500 }); // 金500
                }
            }

            // 4. 訓練
            if (castle.training < 100) {
                let score = (100 - castle.training) * 0.5;
                actions.push({ type: 'training', stat: 'leadership', score: score, cost: 0 }); // コストは仮で0(本来は不要)
            }

            // 5. 兵施し（士気）
            if (castle.morale < 100) {
                let score = (100 - castle.morale) * 0.5;
                actions.push({ type: 'soldier_charity', stat: 'leadership', score: score, cost: 200 }); // ※お米200
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
                    a.score *= 1.2; // 守りや内政が好きなら20%アップ
                }
                if (isAggressive && ['draft', 'training', 'soldier_charity'].includes(a.type)) {
                    a.score *= 1.2; // 攻めや軍備が好きなら20%アップ
                }
                // 少しだけランダムな揺らぎを入れます
                a.score *= (0.9 + Math.random() * 0.2);
            });

            // 8. 兵糧売買（特殊な判断）
            if (castle.gold < 500 && castle.rice > 3000) {
                const targetRice = Math.max(3000, Math.floor(castle.soldiers * 1.5));
                if (castle.rice > targetRice) {
                    actions.push({ type: 'sell_rice', stat: 'politics', score: 800, cost: 0 }); // お金がない時は高優先
                }
            }
            if (castle.rice <= castle.soldiers * 1) {
                actions.push({ type: 'buy_rice', stat: 'politics', score: 800, cost: 0 }); // ご飯がない時も高優先
            }

            // 9. 輸送（大名のいない城のみ）
            if (!daimyo || daimyo.castleId !== castle.id) {
                const allyCastles = this.game.castles.filter(c => c.ownerClan === castle.ownerClan && c.id !== castle.id);
                for (const target of allyCastles) {
                    if ((target.soldiers <= 500 || target.gold <= 500) && castle.soldiers >= 2000 && castle.gold >= 2000) {
                        actions.push({ type: 'transport', stat: 'leadership', score: 400, cost: 0, targetId: target.id, res: 'gold_soldier' });
                        break; // 1ターンに1回見つかればOK
                    }
                    if (target.rice <= 2000 && castle.rice >= 5000) {
                        actions.push({ type: 'transport', stat: 'leadership', score: 400, cost: 0, targetId: target.id, res: 'rice' });
                        break;
                    }
                }
            }

            // 10. 武将の移動
            const emptyCastles = this.game.castles.filter(c => c.ownerClan === castle.ownerClan && c.id !== castle.id && c.samuraiIds.length <= 1);
            if (emptyCastles.length > 0) {
                actions.push({ type: 'move', stat: 'leadership', score: 300, cost: 0, targetId: emptyCastles[0].id });
            }


            // 点数が高い順に並べ替えます
            actions.sort((a, b) => b.score - a.score);

            let actionDoneInThisStep = false;

            // 一番点数が高い行動から順番に「できるかどうか」試していきます
            for (let action of actions) {
                if (action.score < 10) continue;

                // その行動に一番向いている武将を探します（能力値40以上が条件）
                const bestBushos = availableBushos.filter(b => b[action.stat] >= 40).sort((a, b) => b[action.stat] - a[action.stat]);
                if (bestBushos.length === 0) continue; // 基準を満たす人がいなければ、この行動は諦めます
                const doer = bestBushos[0];

                // 実行処理
                if (action.type === 'repair' && castle.gold >= 200) {
                    castle.gold -= 200;
                    castle.defense = Math.min(castle.maxDefense, castle.defense + GameSystem.calcRepair(doer));
                    doer.isActionDone = true; actionDoneInThisStep = true; break;
                }
                if (action.type === 'charity' && castle.rice >= 200) {
                    castle.rice -= 200;
                    castle.peoplesLoyalty = Math.min(100, castle.peoplesLoyalty + GameSystem.calcCharity(doer, 'rice'));
                    doer.isActionDone = true; actionDoneInThisStep = true; break;
                }
                if (action.type === 'draft' && castle.gold >= 500 && castle.population > 1000) {
                    // ① プレイヤーと同じ計算式で兵士の数を出し、最後に「10で割る」をします！
                    let soldiers = GameSystem.calcDraftFromGold(500, doer, castle.population);
                    soldiers = Math.floor(soldiers / 10);

                    // ② 上限(99,999)を超えないようにストッパーをかけます
                    if (castle.soldiers + soldiers > 99999) {
                        soldiers = 99999 - castle.soldiers;
                    }

                    if (soldiers > 0) {
                        castle.gold -= 500;

                        // ③ プレイヤーと同じように、新兵が入ることで訓練と士気が少し下がる計算をします
                        const newMorale = Math.max(0, castle.morale - 10);
                        const newTraining = Math.max(0, castle.training - 10);
                        castle.training = Math.floor(((castle.training * castle.soldiers) + (newTraining * soldiers)) / (castle.soldiers + soldiers));
                        castle.morale = Math.floor(((castle.morale * castle.soldiers) + (newMorale * soldiers)) / (castle.soldiers + soldiers));

                        // 兵士を増やします（AIだけ人口が減る謎の処理も、不公平なので消しました！）
                        castle.soldiers += soldiers;

                        doer.isActionDone = true; 
                        actionDoneInThisStep = true; 
                        break;
                    } else {
                        // もし上限いっぱいで兵士が増やせなかったら、この行動は諦めて次を探します
                        continue;
                    }
                }
                if (action.type === 'training') {
                    castle.training = Math.min(100, castle.training + GameSystem.calcTraining(doer));
                    doer.isActionDone = true; actionDoneInThisStep = true; break;
                }
                if (action.type === 'soldier_charity' && castle.rice >= 200) {
                    castle.rice -= 200;
                    castle.morale = Math.min(100, castle.morale + GameSystem.calcSoldierCharity(doer));
                    doer.isActionDone = true; actionDoneInThisStep = true; break;
                }
                if (action.type === 'farm' && castle.gold >= 200) {
                    castle.gold -= 200;
                    castle.kokudaka = Math.min(castle.maxKokudaka, castle.kokudaka + GameSystem.calcDevelopment(doer));
                    doer.isActionDone = true; actionDoneInThisStep = true; break;
                }
                if (action.type === 'commerce' && castle.gold >= 200) {
                    castle.gold -= 200;
                    castle.commerce = Math.min(castle.maxCommerce, castle.commerce + GameSystem.calcDevelopment(doer));
                    doer.isActionDone = true; actionDoneInThisStep = true; break;
                }
                
                // 特殊行動群
                if (action.type === 'sell_rice') {
                    const sellAmount = castle.rice - Math.max(3000, Math.floor(castle.soldiers * 1.5));
                    if (sellAmount > 0) {
                        const gain = Math.floor(sellAmount * this.game.marketRate);
                        castle.rice -= sellAmount;
                        castle.gold += gain;
                        doer.isActionDone = true; actionDoneInThisStep = true; break;
                    }
                }
                if (action.type === 'buy_rice') {
                    const buyAmount = Math.floor(castle.soldiers * 1.5) - castle.rice;
                    const cost = Math.floor(buyAmount * this.game.marketRate);
                    if (buyAmount > 0 && castle.gold >= cost + 500) { // 最低500金は残すように買う
                        castle.gold -= cost;
                        castle.rice += buyAmount;
                        doer.isActionDone = true; actionDoneInThisStep = true; break;
                    }
                }
                if (action.type === 'transport') {
                    const targetCastle = this.game.getCastle(action.targetId);
                    if (action.res === 'gold_soldier') {
                        castle.gold -= 500; castle.soldiers -= 500;
                        targetCastle.gold += 500; targetCastle.soldiers += 500;
                    } else if (action.res === 'rice') {
                        castle.rice -= 1000;
                        targetCastle.rice += 1000;
                    }
                    doer.isActionDone = true; actionDoneInThisStep = true; break; // 武将は移動しない
                }
                if (action.type === 'move') {
                    // 誰を送るか選ぶ（城主以外）
                    let moveCandidates = availableBushos.filter(b => b.id !== castle.castellanId);
                    let mover = null;
                    
                    // 派閥の主を優先
                    const factionLeader = moveCandidates.find(b => b.isFactionLeader);
                    if (factionLeader) mover = factionLeader;
                    
                    // 城主と相性が悪い人を優先
                    if (!mover) {
                        for (let b of moveCandidates) {
                            if (GameSystem.calcAffinityDiff(castellan.affinity, b.affinity) >= 20) {
                                mover = b; break;
                            }
                        }
                    }
                    
                    // 条件に合う人がいれば移動
                    if (mover) {
                        const targetCastle = this.game.getCastle(action.targetId);
                        
                        // ★追加：送ったあとの人数を計算して、元のお城が少なくなっちゃうならストップ！
                        const sourceCountAfter = castle.samuraiIds.length - 1;       // 送ったあとの元のお城の人数
                        const targetCountAfter = targetCastle.samuraiIds.length + 1; // 送ったあとの先のお城の人数
                        
                        if (sourceCountAfter < targetCountAfter) {
                            // 移動すると人数が逆転して少なくなる場合は、移動を諦めて別の行動を考えます
                            continue;
                        }

                        this.game.factionSystem.handleMove(mover, castle.id, action.targetId);
                        castle.samuraiIds = castle.samuraiIds.filter(id => id !== mover.id);
                        targetCastle.samuraiIds.push(mover.id);
                        mover.castleId = action.targetId;
                        mover.isActionDone = true;
                        actionDoneInThisStep = true; break;
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