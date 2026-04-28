/**
 * diplomacy.js
 * 外交システムを管理するクラス
 * 大名（Clan）間の感情値と関係状態を管理します。
 */

class DiplomacyManager {
    constructor(game) {
        this.game = game;
    }

    /**
     * 遅延初期化とデータ取得
     * データが存在しない場合はデフォルト値を生成して返します
     */
    getDiplomacyData(clanId, targetId) {
        const clan = this.game.clans.find(c => Number(c.id) === Number(clanId));
        if (!clan) return null;

        if (!clan.diplomacyValue) {
            clan.diplomacyValue = {};
        }

        if (!clan.diplomacyValue[targetId]) {
            // 相手側(targetId)のデータに自分(clanId)への設定があるか確認します
            const targetClan = this.game.clans.find(c => Number(c.id) === Number(targetId));
            if (targetClan && targetClan.diplomacyValue && targetClan.diplomacyValue[clanId]) {
                // もし相手側が設定を持っていれば、同じ値をコピーします
                const oppData = targetClan.diplomacyValue[clanId];
                clan.diplomacyValue[targetId] = {
                    status: oppData.status,
                    sentiment: oppData.sentiment,
                    trucePeriod: oppData.trucePeriod || 0, // ★和睦の期間もコピーします
                    isMarriage: oppData.isMarriage || false // ★今回追加：相手がシールを持っていたらコピーします
                };
            } else {
                // どちらも持っていなければ、初期値の50になります
                clan.diplomacyValue[targetId] = {
                    status: '普通', // 状態: '普通', '友好', '敵対', '同盟', '支配', '従属', '和睦'
                    sentiment: 50,  // 感情値: 0 - 100
                    trucePeriod: 0, // ★初期値は0にします
                    isMarriage: false // ★今回追加：最初は結婚のシールは貼っていません
                };
            }
        }
        return clan.diplomacyValue[targetId];
    }

    /**
     * 二国間の現在の関係を返す
     */
    getRelation(clanId, targetId) {
        return this.getDiplomacyData(clanId, targetId);
    }

    /**
     * 感情値を加減し、閾値に応じて自動でステータスを変動させる
     */
    updateSentiment(clanId, targetId, delta) {
        const dataA = this.getDiplomacyData(clanId, targetId);
        const dataB = this.getDiplomacyData(targetId, clanId);

        if (!dataA || !dataB) return;

        const update = (data) => {
            data.sentiment = Math.max(0, Math.min(100, data.sentiment + delta));
            
            // ★変更：和睦中も、勝手に状態が戻らないように保護します！
            if (['普通', '友好', '敵対'].includes(data.status)) {
                if (data.sentiment >= 70) {
                    data.status = '友好';
                } else if (data.sentiment <= 30) {
                    data.status = '敵対';
                } else {
                    data.status = '普通';
                }
            }
        };

        update(dataA);
        update(dataB);
    }
    
    /**
     * 強制的に状態を変更し、相手側も同期する
     * ★追加：和睦の時に、期間（trucePeriod）も一緒に設定できるようにしました！
     */
    changeStatus(clanId, targetId, newStatus, trucePeriod = 0) {
        const dataA = this.getDiplomacyData(clanId, targetId);
        const dataB = this.getDiplomacyData(targetId, clanId);

        if (!dataA || !dataB) return;

        dataA.status = newStatus;
        if (newStatus === '和睦') dataA.trucePeriod = trucePeriod;

        // 状態の反転処理と同調
        if (newStatus === '支配') {
            dataB.status = '従属';
        } else if (newStatus === '従属') {
            dataB.status = '支配';
        } else {
            // 同盟・敵対・和睦などは共通
            dataB.status = newStatus;
            if (newStatus === '和睦') dataB.trucePeriod = trucePeriod;
        }

        // ★今回追加：関係が変化したので、両方の大名家の「今月の外交目標」をリセットします！
        const clanA = this.game.clans.find(c => c.id === clanId);
        if (clanA && clanA.currentDiplomacyTarget && clanA.currentDiplomacyTarget.targetId === targetId) {
            clanA.currentDiplomacyTarget = null;
        }
        
        const clanB = this.game.clans.find(c => c.id === targetId);
        if (clanB && clanB.currentDiplomacyTarget && clanB.currentDiplomacyTarget.targetId === clanId) {
            clanB.currentDiplomacyTarget = null;
        }
    }

    /**
     * ★新しく追加！：毎月末に呼ばれて、和睦の期間を減らす魔法です
     */
    processEndMonth() {
        this.game.clans.forEach(clan => {
            if (!clan.diplomacyValue) return;
            
            for (const targetId in clan.diplomacyValue) {
                const data = clan.diplomacyValue[targetId];
                
                // もし状態が「和睦」で、期間が1以上残っていたら…
                if (data.status === '和睦' && data.trucePeriod > 0) {
                    data.trucePeriod -= 1; // 期間を1ヶ月減らします
                    
                    // 減らした結果、期間が0になったら…
                    if (data.trucePeriod <= 0) {
                        // 感情値（仲の良さ）に合わせて、元の状態に戻します！
                        if (data.sentiment >= 70) {
                            data.status = '友好';
                        } else if (data.sentiment <= 30) {
                            data.status = '敵対';
                        } else {
                            data.status = '普通';
                        }
                    }
                }
            }
        });
    }
    
    /**
     * 指定した大名家の同盟・支配・従属の数を数えます
     */
    getAllyCount(clanId) {
        let count = 0;
        this.game.clans.forEach(c => {
            if (c.id !== 0 && c.id !== clanId) {
                const r = this.getRelation(clanId, c.id);
                if (r && ['同盟', '支配', '従属'].includes(r.status)) {
                    count++;
                }
            }
        });
        return count;
    }

    /**
     * 戦略的パートナー（共通の敵がいる、または背後を突ける）かどうかと、そのスコアを判定します
     */
    evaluateStrategicValue(myClanId, targetClanId, mainThreatId) {
        let isStrategicPartner = false;
        let priorityBonus = 0;

        if (mainThreatId !== 0 && mainThreatId !== targetClanId) {
            const targetToThreatRel = this.getRelation(targetClanId, mainThreatId);
            const myToThreatRel = this.getRelation(myClanId, mainThreatId);
            const rel = this.getRelation(myClanId, targetClanId);
            
            // ① 共通の敵がいる場合
            if (targetToThreatRel && targetToThreatRel.status === '敵対' && myToThreatRel && myToThreatRel.status === '敵対') {
                isStrategicPartner = true;
                priorityBonus += 1000;
            } 
            // ② 敵対していない相手で、怖い敵の背後を突ける場合
            else if (rel.status !== '敵対') {
                const isFriendlyWithThreat = targetToThreatRel && ['同盟', '支配', '従属', '友好'].includes(targetToThreatRel.status);
                if (!isFriendlyWithThreat) {
                    let isAdjacent = false;
                    const threatCastles = this.game.castles.filter(cas => cas.ownerClan === mainThreatId);
                    const targetCastles = this.game.castles.filter(cas => cas.ownerClan === targetClanId);
                    
                    for (let tc of targetCastles) {
                        for (let mc of threatCastles) {
                            if (GameSystem.isAdjacent(tc, mc)) {
                                isAdjacent = true; break;
                            }
                        }
                        if (isAdjacent) break;
                    }
                    if (isAdjacent) {
                        isStrategicPartner = true;
                        priorityBonus += 300;
                    }
                }
            }
        }
        return { isStrategicPartner, priorityBonus };
    }

    /**
     * AIが外交相手を選ぶための「優先度リスト」を作成します
     */
    getDiplomacyPriorityList(myClanId, uniqueNeighbors, mainThreatId) {
        const diplomacyTargets = [];
        uniqueNeighbors.forEach(targetClanId => {
            let priority = 0;
            const rel = this.getRelation(myClanId, targetClanId);
            
            // 1. 戦略的価値を調べる
            const strategic = this.evaluateStrategicValue(myClanId, targetClanId, mainThreatId);
            priority += strategic.priorityBonus;
            
            // 2. 現在の仲の良さで評価する
            if (rel.status !== '敵対') {
                priority += rel.sentiment * 2;
            } else {
                priority -= 500;
            }
            
            diplomacyTargets.push({ 
                clanId: targetClanId, 
                priority: priority,
                isStrategicPartner: strategic.isStrategicPartner 
            });
        });

        // 優先度が高い順に並べ替える
        diplomacyTargets.sort((a, b) => b.priority - a.priority);
        return diplomacyTargets;
    }
    
    /**
     * 親善による友好度の上昇量を計算します
     */
    calcGoodwillIncrease(gold, doer) {
        const statBonus = ((doer.diplomacy * 1.5) + (Math.sqrt(doer.loyalty) * 2)) / 20;
        const goldBonus = gold / 1000;
        const totalFloat = statBonus * goldBonus;
        return Math.max(1, Math.round(totalFloat));
    }
    
    /**
     * 外交の成功確率（％）を計算して返す魔法です（0〜100の数値になります）
     */
    getDiplomacyProb(doerClanId, targetClanId, type, doerDiplomacy, myPower, targetPower) {
        const relation = this.getRelation(doerClanId, targetClanId);
        
        // 共通の敵がいるか
        const commonEnemy = this.game.clans.some(c => {
            if (c.id === 0 || c.id === doerClanId || c.id === targetClanId) return false;
            const r1 = this.getRelation(doerClanId, c.id);
            const r2 = this.getRelation(targetClanId, c.id);
            return r1 && r2 && r1.status === '敵対' && r2.status === '敵対';
        });

        // 仲良しの大名家の数
        const allyCount = this.getAllyCount(targetClanId);
        
        let finalProb = 0;

        if (type === 'goodwill') {
            let acceptProb = 100;
            if (relation.sentiment <= 50) acceptProb = relation.sentiment * 2;
            if (commonEnemy) acceptProb += 30;
            if (allyCount >= 2) acceptProb -= (allyCount - 1) * 20;
            if (targetPower > myPower) acceptProb *= (myPower / targetPower);
            
            finalProb = Math.max(0, Math.min(100, acceptProb));
        } 
        else if (type === 'alliance') {
            let threshold = commonEnemy ? 90 : 120; 
            let acceptProb = commonEnemy ? 90 : 70; 

            if (allyCount >= 2) {
                acceptProb -= (allyCount - 1) * 20; 
                threshold += (allyCount - 1) * 10;  
            }
            if (targetPower > myPower) {
                acceptProb *= (myPower / targetPower);
            }

            const chance = relation.sentiment + doerDiplomacy;
            if (chance > threshold) {
                finalProb = Math.max(0, Math.min(100, acceptProb));
            }
        }
        // ★ここから追加：婚姻の成功確率（同盟より少し成功しやすく緩和します！）
        else if (type === 'marriage') {
            let threshold = commonEnemy ? 90 : 120; 
            let acceptProb = commonEnemy ? 90 : 70; 

            if (allyCount >= 2) {
                acceptProb -= (allyCount - 1) * 20; 
                threshold += (allyCount - 1) * 10;  
            }

            // ★緩和その１：兵力差による確率の低下を「3分の2」に緩和します！
            if (targetPower > myPower) {
                // 本来ならどれくらい確率を引かれるか（ペナルティの量）を計算します
                const penalty = 1.0 - (myPower / targetPower);
                // ペナルティの量を「3分の2」にオマケしてあげます
                const mitigatedPenalty = penalty * (2 / 3);
                // オマケしたあとのペナルティを使って、最終的な確率を計算します
                acceptProb *= (1.0 - mitigatedPenalty);
            }

            // ★緩和その２：友好度が低いことによるマイナス影響を「2分の1」に緩和します！
            // 満点(100)からどれくらい友好度が下がっているかを計算します
            const sentimentDrop = 100 - relation.sentiment;
            // 下がってしまった分を「半分（2分の1）だけ大目に見る」という魔法をかけます
            const effectiveSentiment = relation.sentiment + (sentimentDrop / 2);

            // オマケしてもらった友好度を使って、成功のハードルを超えられるかチェックします
            const chance = effectiveSentiment + doerDiplomacy;
            if (chance > threshold) {
                finalProb = Math.max(0, Math.min(100, acceptProb));
            }
        }
        else if (type === 'dominate') {
            const powerRatio = myPower / Math.max(1, targetPower);
            if (powerRatio >= 5) {
                let prob = 20;
                if (powerRatio >= 15) prob = 70;
                else prob = 20 + (powerRatio - 5) * (50 / 10);
                
                if (doerDiplomacy >= 50) prob += Math.min(10, (doerDiplomacy - 50) * 0.2);
                
                let isAlreadySubordinate = false;
                this.game.clans.forEach(c => {
                    if (c.id !== targetClanId && c.id !== doerClanId) {
                        const rel = this.getRelation(targetClanId, c.id);
                        if (rel && rel.status === '従属') isAlreadySubordinate = true;
                    }
                });
                
                if (isAlreadySubordinate) prob *= 0.2;
                
                finalProb = Math.max(0, Math.min(100, prob));
            }
        }

        // ★追加：使者を送った側の大名が、送られた側の大名の宿敵リストに入っている場合は確率を半減
        if (finalProb > 0) {
            const doerDaimyo = this.game.bushos.find(b => b.clan === doerClanId && b.isDaimyo);
            const targetDaimyo = this.game.bushos.find(b => b.clan === targetClanId && b.isDaimyo);
            
            if (doerDaimyo && targetDaimyo && targetDaimyo.nemesisIds && targetDaimyo.nemesisIds.includes(doerDaimyo.id)) {
                finalProb = Math.floor(finalProb / 2);
            }
        }

        return finalProb;
    }

    /**
     * 他の大名家や諸勢力が援軍要請を承諾する確率（％）を計算する魔法です（最新版）
     */
    getReinforcementAcceptProb(myClanId, helperForceId, enemyClanId, gold, isKunishu, myTotalSoldiers, enemyTotalSoldiers) {
        // ★ 大名家で、相手を「支配」しているなら100%（諸勢力は支配がないのでチェック不要）
        if (!isKunishu) {
            const myToHelperRel = this.getRelation(myClanId, helperForceId);
            if (myToHelperRel && myToHelperRel.status === '支配') return 100;
        }

        let sentiment = 50;
        let relationStatus = '普通';
        let helperToEnemySentiment = 50;
        let duty = 50;
        let isMarriage = false; // 結婚しているかを記録する箱を用意します

        if (isKunishu) {
            const kunishu = this.game.kunishuSystem.getKunishu(helperForceId);
            if (!kunishu) return 0;
            sentiment = kunishu.getRelation(myClanId);
            helperToEnemySentiment = (enemyClanId === 0) ? 50 : kunishu.getRelation(enemyClanId);
            const leader = this.game.getBusho(kunishu.leaderId);
            duty = leader ? leader.duty : 50;
        } else {
            const myToHelperRel = this.getRelation(myClanId, helperForceId);
            sentiment = myToHelperRel ? myToHelperRel.sentiment : 50;
            relationStatus = myToHelperRel ? myToHelperRel.status : '普通';
            isMarriage = myToHelperRel ? myToHelperRel.isMarriage : false; // 結婚シールを確認します
            
            const helperToEnemyRel = (enemyClanId === 0) ? null : this.getRelation(helperForceId, enemyClanId);
            helperToEnemySentiment = helperToEnemyRel ? helperToEnemyRel.sentiment : 50;
            
            const helperDaimyo = this.game.bushos.find(b => b.clan === helperForceId && b.isDaimyo);
            duty = helperDaimyo ? helperDaimyo.duty : 50;
        }

        // ★AIが援軍を受諾する確率を求める計算式
        const sentimentBonus = sentiment / 200;
        const goldBonus = Math.min(1500, gold) / 20000;
        
        let relationBonus = 0;
        if (relationStatus === '同盟') {
            if (isMarriage) {
                // 政略結婚している同盟なら、最大の30%（0.30）ボーナスで固定します
                relationBonus = 0.30;
            } else {
                // 普通の同盟なら、相手の義理に関係な15%（0.15）ボーナスで固定します
                relationBonus = 0.15;
            }
        } else if (relationStatus === '従属') {
            // 自分が相手に従属（支配されている状態）している時だけ、相手の義理に合わせて0%〜30%の間で変動させます
            relationBonus = duty * 0.003;
        }
        
        const enemyHateBonus = (50 - helperToEnemySentiment) / 100;
        const powerBonus = -1 + ((Math.sqrt(Math.max(1, myTotalSoldiers)) / 2) / Math.max(0.1, (Math.sqrt(Math.max(1, enemyTotalSoldiers)) / 2)));
        const dutyBonus = 0.5 + (duty / 100);
        
        let successRate = ((sentimentBonus + goldBonus + relationBonus + enemyHateBonus + powerBonus) * dutyBonus);
        
        // 0%～100%の範囲に収める
        let prob = Math.max(0, Math.min(1, successRate)) * 100;
        
        // ★お願いした先の大名家が攻撃の作戦中だったら確率を半分にする
        if (!isKunishu && this.game.aiOperationManager && this.game.aiOperationManager.operations) {
            const helperOp = this.game.aiOperationManager.operations[helperForceId];
            if (helperOp && helperOp.type === '攻撃') {
                prob = Math.floor(prob / 2);
            }
        }

        // ★追加：要請した側の大名が、要請された側の大名の宿敵なら確率半減
        if (!isKunishu && prob > 0) {
            const myDaimyo = this.game.bushos.find(b => b.clan === myClanId && b.isDaimyo);
            const helperDaimyo = this.game.bushos.find(b => b.clan === helperForceId && b.isDaimyo);
            if (myDaimyo && helperDaimyo && helperDaimyo.nemesisIds && helperDaimyo.nemesisIds.includes(myDaimyo.id)) {
                prob = Math.floor(prob / 2);
            }
        }

        return Math.max(0, Math.min(100, prob));
    }

    /**
     * 外交の成功判定を行います（AI相手の場合）
     */
    checkDiplomacySuccess(doerClanId, targetClanId, type, doerDiplomacy, myPower, targetPower) {
        // ★修正：確率計算は新しい専門部署にお任せして、ここでサイコロを振るだけにします！
        const prob = this.getDiplomacyProb(doerClanId, targetClanId, type, doerDiplomacy, myPower, targetPower);
        return (Math.random() * 100) < prob;
    }
    
    /**
     * 同盟や従属を破棄した時のペナルティを計算して適用します
     */
    applyBreakAlliancePenalty(doerClanId, targetClanId) {
        const relation = this.getRelation(doerClanId, targetClanId);
        const oldStatus = relation.status;
        const oldSentiment = relation.sentiment;

        let targetDrop = -60; 
        let globalDrop = 0; 
        let isBetrayal = false;
        let isBreakDomination = false; // ★追加：支配関係を破棄したかどうかのシールです

        if (oldStatus === '同盟' && oldSentiment >= 70) {
            targetDrop = -70; globalDrop = -10; isBetrayal = true;
        } else if (oldStatus === '従属' && oldSentiment >= 70) {
            targetDrop = -100; globalDrop = -10; isBetrayal = true;
        } else if (oldStatus === '支配') {
            // ★追加：自分が支配している相手を切り捨てた時の重いペナルティです！
            targetDrop = -100; // 対象の大名家との友好度を0にするため、-100します
            globalDrop = -15;  // 他の全ての大名家との友好度が15下がります
            isBetrayal = true; // 周りからの心証が悪くなるシールを貼ります
            isBreakDomination = true; // 忠誠度を下げるための専用シールも貼ります
        }

        this.updateSentiment(doerClanId, targetClanId, targetDrop);

        const newRel = this.getRelation(doerClanId, targetClanId);
        let newStatus = '普通';
        if (newRel.sentiment <= 39) newStatus = '敵対';
        else if (newRel.sentiment >= 70) newStatus = '友好';
        this.changeStatus(doerClanId, targetClanId, newStatus);

        if (isBetrayal) {
            this.game.clans.forEach(c => {
                if (c.id !== 0 && c.id !== doerClanId && c.id !== targetClanId) {
                    this.updateSentiment(doerClanId, c.id, globalDrop);
                }
            });
        }

        // ★追加：もし「支配」を破棄していたら、自分の家の武将たちの忠誠度を5下げます
        if (isBreakDomination) {
            this.game.bushos.forEach(busho => {
                // 同じ家（clan）にいて、活動中（active）で、大名本人ではない武将を探します
                if (busho.clan === doerClanId && busho.status === 'active' && !busho.isDaimyo) {
                    busho.loyalty = Math.max(0, busho.loyalty - 5); // 0未満にはならないように下げます
                }
            });
        }

        // 最後に、結果をお知らせする魔法にシール（isBreakDomination）も一緒に渡してあげます
        return { oldStatus, isBetrayal, isBreakDomination };
    }
    
    /**
     * 指定した関係が「攻撃してはいけない関係（不可侵）」かどうかを判定します
     */
    isNonAggression(status) {
        return ['同盟', '支配', '従属', '和睦'].includes(status);
    }
    
    /**
     * 外交コマンドを実行する魔法です
     */
    executeDiplomacy(doerId, targetCastleId, type, gold = 0) {
        const doer = this.game.getBusho(doerId);
        const targetCastle = this.game.getCastle(targetCastleId);
        if (!targetCastle) return;
        
        const targetClanId = targetCastle.ownerClan;
        let msg = "";
        let aiMsg = ""; // AI同士の場合のメッセージ用
        const isPlayerInvolved = (doer.clan === this.game.playerClanId || targetClanId === this.game.playerClanId);

        const myPower = this.game.getClanTotalSoldiers(doer.clan) || 1;
        const targetPower = this.game.getClanTotalSoldiers(targetClanId) || 1;

        const doerClanName = this.game.clans.find(c => c.id === doer.clan).name;
        const targetClanName = this.game.clans.find(c => c.id === targetClanId).name;

        if (type === 'goodwill') {
            let isSuccess = true;
            if (targetClanId !== this.game.playerClanId) {
                isSuccess = this.checkDiplomacySuccess(doer.clan, targetClanId, type, doer.diplomacy, myPower, targetPower);
            }

            if (isSuccess) {
                const increase = this.calcGoodwillIncrease(gold, doer);
                this.updateSentiment(doer.clan, targetClanId, increase);
                
                const castle = this.game.getCastle(doer.castleId); 
                if(castle) castle.gold -= gold;
                
                msg = `${doer.name}が親善を行いました\n友好度が上昇しました`;
                doer.achievementTotal += Math.floor(doer.diplomacy * 0.2) + 10;
                this.game.factionSystem.updateRecognition(doer, 15);
            } else {
                msg = `${this.game.clans.find(c => c.id === targetClanId).name} に親善の品を突き返されました……\n友好度は変わりませんでした`;
                doer.achievementTotal += 5;
                this.game.factionSystem.updateRecognition(doer, 5);
            }

        } else if (type === 'alliance') {
            let isSuccess = this.checkDiplomacySuccess(doer.clan, targetClanId, type, doer.diplomacy, myPower, targetPower);

            if (isSuccess) {
                this.changeStatus(doer.clan, targetClanId, '同盟');
                
                // ★追加：同盟が成功したら、この大名家の「今月の外交目標」を親善に書き換えます
                const doerClan = this.game.clans.find(c => c.id === doer.clan);
                if (doerClan && doerClan.currentDiplomacyTarget && doerClan.currentDiplomacyTarget.targetId === targetClanId) {
                    doerClan.currentDiplomacyTarget.action = 'goodwill';
                    
                    // 相手との強さの差（何倍強いか）を計算します
                    const ratio = targetPower / Math.max(1, myPower);
                    let goodwillGold = 300; // 基本は300にします
                    
                    if (ratio >= 3.0) {
                        goodwillGold = 1000; // 相手が3倍以上強ければ1000にします
                    } else if (ratio > 1.5) {
                        goodwillGold = 300 + ((ratio - 1.5) / 1.5) * 700; // 1.5倍から3倍の間なら、少しずつ増やします
                    }
                    
                    // 100の単位で綺麗に揃えて、新しい親善の金額にセットします
                    doerClan.currentDiplomacyTarget.gold = Math.floor(goodwillGold / 100) * 100;
                }

                msg = `同盟の締結に成功しました！`;
                if (!isPlayerInvolved) aiMsg = `${doerClanName} が ${targetClanName} と同盟を締結しました！`;
                doer.achievementTotal += Math.floor(doer.diplomacy * 0.2) + 10;
                this.game.factionSystem.updateRecognition(doer, 30);
            } else {
                this.updateSentiment(doer.clan, targetClanId, -10);
                msg = `同盟の締結に失敗しました……`;
                doer.achievementTotal += 5;
                this.game.factionSystem.updateRecognition(doer, 10);
            }

        } else if (type === 'break_alliance') {
            const result = this.applyBreakAlliancePenalty(doer.clan, targetClanId);

            msg = `${result.oldStatus}関係を破棄しました`;
            if (!isPlayerInvolved) {
                if (result.oldStatus === '同盟') {
                    aiMsg = `${doerClanName} が ${targetClanName} との同盟を破棄しました！`;
                } else if (result.oldStatus === '従属') {
                    aiMsg = `${doerClanName} が ${targetClanName} の支配下からの独立を宣言しました！`;
                } else if (result.oldStatus === '支配') {
                    aiMsg = `${doerClanName} が ${targetClanName} への支配を放棄しました！`;
                }
            }
            if (result.isBetrayal) {
                msg += `\n諸大名からの心証が悪化しました……`;
            }
            // ★追加：もし支配関係を破棄して忠誠度が下がっていたら、メッセージを書き足します
            if (result.isBreakDomination) {
                msg += `\n家臣団の中でも動揺が広がっているようです……`;
            }
            doer.achievementTotal += 5;
            this.game.factionSystem.updateRecognition(doer, 10);

        } else if (type === 'subordinate') {
            this.changeStatus(doer.clan, targetClanId, '従属');
            
            // ★追加：従属した時に、関係値を調整します！
            const relation = this.getRelation(doer.clan, targetClanId);
            if (relation) {
                // 40以下なら50にし、41以上なら10足します（100を超えないようにします）
                if (relation.sentiment <= 40) {
                    relation.sentiment = 50;
                } else {
                    relation.sentiment = Math.min(100, relation.sentiment + 10);
                }
                // 相手から見た関係値も同じ数字に揃えておきます
                const oppRelation = this.getRelation(targetClanId, doer.clan);
                if (oppRelation) oppRelation.sentiment = relation.sentiment;
            }

            msg = `${this.game.clans.find(c => c.id === targetClanId).name} に従属しました！`;
            if (!isPlayerInvolved) aiMsg = `${targetClanName} が ${doerClanName} を支配下に置きました！`;
            doer.achievementTotal += Math.floor(doer.diplomacy * 0.2) + 10;
            this.game.factionSystem.updateRecognition(doer, 30);

        } else if (type === 'dominate') {
            let isSuccess = this.checkDiplomacySuccess(doer.clan, targetClanId, type, doer.diplomacy, myPower, targetPower);
            
            if (myPower / targetPower < 5) {
                this.updateSentiment(doer.clan, targetClanId, -5);
                msg = `要求を跳ね除けられました……`;
                doer.achievementTotal += 5;
                this.game.factionSystem.updateRecognition(doer, 10);
            } else if (isSuccess) {
                this.changeStatus(doer.clan, targetClanId, '支配');
                
                // ★追加：支配した時に、関係値を調整します！
                const relation = this.getRelation(doer.clan, targetClanId);
                if (relation) {
                    if (relation.sentiment <= 40) {
                        relation.sentiment = 50;
                    } else {
                        relation.sentiment = Math.min(100, relation.sentiment + 10);
                    }
                    const oppRelation = this.getRelation(targetClanId, doer.clan);
                    if (oppRelation) oppRelation.sentiment = relation.sentiment;
                }

                // ★追加：支配が成功したら、この大名家の「今月の外交目標」を親善に書き換えます
                const doerClan = this.game.clans.find(c => c.id === doer.clan);
                if (doerClan && doerClan.currentDiplomacyTarget && doerClan.currentDiplomacyTarget.targetId === targetClanId) {
                    doerClan.currentDiplomacyTarget.action = 'goodwill';
                    doerClan.currentDiplomacyTarget.gold = 300; // 支配下への親善は基本の300にします
                }

                msg = `${this.game.clans.find(c => c.id === targetClanId).name} を支配下に置くことに成功しました！`;
                if (!isPlayerInvolved) aiMsg = `${doerClanName} が ${targetClanName} を支配下に置きました！`;
                doer.achievementTotal += Math.floor(doer.diplomacy * 0.2) + 20;
                this.game.factionSystem.updateRecognition(doer, 40);
            } else {
                this.updateSentiment(doer.clan, targetClanId, -5);
                msg = `支配の要求は拒否されました……`;
                doer.achievementTotal += 5;
                this.game.factionSystem.updateRecognition(doer, 10);
            }
        }
        doer.isActionDone = true;
        if (isPlayerInvolved) {
            this.game.ui.showResultModal(msg);
            if (doer.clan === this.game.playerClanId) {
                this.game.ui.updatePanelHeader();
                this.game.ui.renderCommandMenu();
            }
        } else if (aiMsg !== "") {
            this.game.ui.showDialog(aiMsg, false);
            this.game.ui.log(aiMsg);
        }
    }

    /**
     * 指定した大名家の支配・従属関係をクリアする魔法です
     */
    clearDominationRelations(clanId) {
        this.game.clans.forEach(c => {
            if (c.id !== clanId) {
                const rel = this.game.getRelation(clanId, c.id);
                if (rel && (rel.status === '支配' || rel.status === '従属')) {
                    this.changeStatus(clanId, c.id, '普通');
                }
            }
        });
    }
    
    /**
     * 婚姻が成立した時の、データ書き換え一斉処理です
     */
    applyMarriageData(princessId, targetBushoId, targetClanId) {
        const myClan = this.game.clans.find(c => c.id === this.game.playerClanId);
        const princess = this.game.princesses.find(p => p.id === princessId);
        const targetBusho = this.game.getBusho(targetBushoId);
        
        if (!princess || !targetBusho || !myClan) return;

        princess.currentClanId = targetClanId;
        princess.husbandId = targetBushoId;
        princess.status = 'married';

        myClan.princessIds = myClan.princessIds.filter(id => id !== princessId);

        if (!targetBusho.wifeIds.includes(princessId)) {
            targetBusho.wifeIds.push(princessId);
        }
        targetBusho.updateFamilyIds(this.game.princesses);

        this.changeStatus(this.game.playerClanId, targetClanId, '同盟');
        
        const relation = this.getDiplomacyData(this.game.playerClanId, targetClanId);
        if (relation) {
            relation.isMarriage = true;
            relation.sentiment = Math.max(relation.sentiment, 70); 
        }
        const oppRelation = this.getDiplomacyData(targetClanId, this.game.playerClanId);
        if (oppRelation) {
            oppRelation.isMarriage = true;
            oppRelation.sentiment = Math.max(oppRelation.sentiment, 70);
        }
    }
    
    /**
     * AIからプレイヤーへの外交提案を受ける処理です
     */
    proposeDiplomacyToPlayer(doer, targetClanId, type, gold, onComplete) {
        const doerClan = this.game.clans.find(c => c.id === doer.clan);

        if (type === 'goodwill') {
            const doerCastle = this.game.getCastle(doer.castleId);
            if (doerCastle) doerCastle.gold = Math.max(0, doerCastle.gold - gold);
        }

        let title = "使者の来訪";
        let msg = "";
        
        if (type === 'goodwill') {
            msg = `${doerClan.name} の ${doer.name} が使者として訪れました。\n親善の証として 金${gold} を持参しています。\n受け取りますか？`;
        } else if (type === 'alliance') {
            msg = `${doerClan.name} の ${doer.name} が使者として訪れました。\n当家との「同盟」を提案しています。\n受諾しますか？`;
        } else if (type === 'dominate') {
            msg = `${doerClan.name} の ${doer.name} が使者として訪れました。\n当家に「従属」するよう要求しています。\n受諾しますか？`;
        }

        this.game.ui.showDialog(msg, true, 
            () => {
                if (type === 'goodwill') {
                    const myCastle = this.game.castles.find(c => c.ownerClan === targetClanId);
                    if (myCastle) myCastle.gold = Math.min(99999, myCastle.gold + gold);
                    // ★窓口の時とは違い、専門部署用に少しだけ計算の仕方を整えています
                    const increase = this.calcGoodwillIncrease(gold, doer);
                    this.updateSentiment(doer.clan, targetClanId, increase);
                    this.game.ui.showResultModal(`${doerClan.name} からの親善を受け入れました！\n友好度が上昇しました`, () => {
                        if (onComplete) setTimeout(onComplete, 100);
                    });
                } else if (type === 'alliance') {
                    this.changeStatus(doer.clan, targetClanId, '同盟');
                    this.game.ui.showResultModal(`${doerClan.name} と同盟を結びました！`, () => {
                        if (onComplete) setTimeout(onComplete, 100);
                    });
                } else if (type === 'dominate') {
                    this.changeStatus(doer.clan, targetClanId, '支配');
                    
                    // ★追加：従属した時に、関係値を調整します！
                    const relation = this.getRelation(doer.clan, targetClanId);
                    if (relation) {
                        if (relation.sentiment <= 40) {
                            relation.sentiment = 50;
                        } else {
                            relation.sentiment = Math.min(100, relation.sentiment + 10);
                        }
                        const oppRelation = this.getRelation(targetClanId, doer.clan);
                        if (oppRelation) oppRelation.sentiment = relation.sentiment;
                    }

                    // ★追加：支配が成功したら、この大名家の「今月の外交目標」を親善に書き換えます
                    if (doerClan && doerClan.currentDiplomacyTarget && doerClan.currentDiplomacyTarget.targetId === targetClanId) {
                        doerClan.currentDiplomacyTarget.action = 'goodwill';
                        doerClan.currentDiplomacyTarget.gold = 300; // 支配下への親善は基本の300にします
                    }

                    this.game.ui.showResultModal(`${doerClan.name} に従属しました……`, () => {
                        if (onComplete) setTimeout(onComplete, 100);
                    });
                }
            },
            () => {
                if (type === 'goodwill') {
                    const doerCastle = this.game.getCastle(doer.castleId);
                    if (doerCastle) doerCastle.gold = Math.min(99999, doerCastle.gold + gold);
                    this.game.ui.showResultModal(`親善の品を突き返しました。`, () => {
                        if (onComplete) setTimeout(onComplete, 100);
                    });
                } else if (type === 'alliance') {
                    this.updateSentiment(doer.clan, targetClanId, -10);
                    this.game.ui.showResultModal(`同盟の提案を拒否しました。`, () => {
                        if (onComplete) setTimeout(onComplete, 100);
                    });
                } else if (type === 'dominate') {
                    this.updateSentiment(doer.clan, targetClanId, -5);
                    this.game.ui.showResultModal(`従属の要求を断固として拒否しました！`, () => {
                        if (onComplete) setTimeout(onComplete, 100);
                    });
                }
            }
        );
    }
    
    /**
     * AIが特定の相手に対して、どの外交コマンドを実行するか判定して返す魔法です
     */
    
    determineAIDiplomacyAction(myClanId, targetClanId, myPower, targetClanTotal, perceivedTargetTotal, myDaimyoDuty, smartness, isStrategicPartner, allyCount, neighbors) {
        const rel = this.getRelation(myClanId, targetClanId);
        
        // 仲良しが2つ以上なら、外交する確率を下げる魔法（1つ増えるごとに20%ダウン）
        let sendProbModifier = 1.0;
        if (allyCount >= 2) {
            sendProbModifier = Math.max(0.1, 1.0 - (allyCount - 1) * 0.2); 
        }

        // 自分がどこかに従属しているかチェックします
        let amISubordinate = false;
        this.game.clans.forEach(c => {
            if (c.id !== 0 && c.id !== myClanId) {
                const r = this.getRelation(myClanId, c.id);
                if (r && r.status === '従属') {
                    amISubordinate = true;
                }
            }
        });

        // 支配要求の判定
        // ★すでに「支配」している相手には、もう支配要求を行わないようにチェックを書き足します！
        if (!amISubordinate && rel.status !== '支配' && targetClanTotal * 8 <= myPower) {
            // 自分の領地と相手の領地が直接くっついているか調べます
            let isDirectlyAdjacent = false;
            const myCastles = this.game.castles.filter(c => c.ownerClan === myClanId);
            const targetCastles = this.game.castles.filter(c => c.ownerClan === targetClanId);
            
            for (let mc of myCastles) {
                for (let tc of targetCastles) {
                    // お城同士の道が繋がっているか確認します
                    if (GameSystem.isAdjacent(mc, tc)) {
                        isDirectlyAdjacent = true;
                        break;
                    }
                }
                if (isDirectlyAdjacent) break;
            }

            let isSafeToDominate = true;

            // チェック１：同じ「国（尾張など）」に城を持っているか調べます
            const myProvinces = new Set();
            myCastles.forEach(c => myProvinces.add(c.provinceId));

            for (let tc of targetCastles) {
                if (myProvinces.has(tc.provinceId)) {
                    isSafeToDominate = false; 
                    break;
                }
            }

            // チェック２：二条城（城ID:26）への道を塞いでしまわないか調べます
            if (isSafeToDominate) {
                const nijoCastleId = 26;
                const nijoCastle = this.game.castles.find(c => c.id === nijoCastleId);
                
                if (nijoCastle && nijoCastle.ownerClan !== myClanId) {
                    let queue = [];
                    let visited = new Set();
                    let parentMap = new Map(); 
                    
                    for (let mc of myCastles) {
                        queue.push(mc.id);
                        visited.add(mc.id);
                    }
                    
                    let foundNijo = false;
                    
                    while (queue.length > 0) {
                        let currentId = queue.shift();
                        
                        if (currentId === nijoCastleId) {
                            foundNijo = true;
                            break; 
                        }
                        
                        let currentCastle = this.game.castles.find(c => c.id === currentId);
                        if (currentCastle && currentCastle.adjacentCastleIds) {
                            for (let adjId of currentCastle.adjacentCastleIds) {
                                if (!visited.has(adjId)) {
                                    let adjCastle = this.game.castles.find(c => c.id === adjId);
                                    if (adjCastle) {
                                        if (adjCastle.ownerClan === myClanId || adjCastle.ownerClan === 0 || adjCastle.ownerClan === targetClanId || adjCastle.id === nijoCastleId) {
                                            visited.add(adjId);
                                            parentMap.set(adjId, currentId); 
                                            queue.push(adjId);
                                        }
                                    }
                                }
                            }
                        }
                    }
                    
                    if (foundNijo) {
                        let currId = nijoCastleId;
                        while (parentMap.has(currId)) {
                            let pId = parentMap.get(currId);
                            let pCastle = this.game.castles.find(c => c.id === pId);
                            
                            if (pCastle && pCastle.ownerClan === targetClanId) {
                                isSafeToDominate = false;
                                break;
                            }
                            currId = pId; 
                        }
                    }
                }
            }

            if (isDirectlyAdjacent && isSafeToDominate && Math.random() < 0.05) { 
                return { action: 'dominate', gold: 0 };
            }
        }

        // 親善・同盟の判定
        // ★修正：同盟や支配・従属状態の相手でも、条件を満たせば親善を行うようにしました！
        
        if (myPower < perceivedTargetTotal * 0.8 || isStrategicPartner) {
            if (Math.random() < smartness * sendProbModifier) {
                const allianceThreshold = isStrategicPartner ? (window.AIParams.AI.AllianceThreshold || 70) - 15 : (window.AIParams.AI.AllianceThreshold || 70);
                let goodwillThreshold = isStrategicPartner ? (window.AIParams.AI.GoodwillThreshold || 40) + 20 : (window.AIParams.AI.GoodwillThreshold || 40);

                // ★追加：同盟、支配、従属関係にある相手には、関係値が100になるまで親善の対象にします！
                if (['同盟', '支配', '従属'].includes(rel.status)) {
                    goodwillThreshold = 100;
                }

                if (rel.sentiment < goodwillThreshold) {
                     const ratio = perceivedTargetTotal / Math.max(1, myPower); 
                     
                     let willGoodwill = true;
                     if (rel.sentiment <= 50) {
                         let skipProb = (50 - rel.sentiment) * 2; 
                         if (isStrategicPartner) { 
                             skipProb -= 30; 
                         }
                         if (rel.status === '敵対' && !isStrategicPartner) { 
                             skipProb += 60; 
                         }

                         if (Math.random() * 100 < skipProb) {
                             willGoodwill = false;
                         }
                     }

                     // ★追加：同盟・支配・従属相手への親善は、大名の義理が低いほどサボりやすくなります！
                     if (willGoodwill && ['同盟', '支配', '従属'].includes(rel.status)) {
                         // 義理100で1.0(100%実行)、義理0で0.5(50%の確率で実行)になる計算式です
                         const executeProb = 0.5 + (myDaimyoDuty / 200);
                         // サイコロを振って、確率より大きい数字が出たら親善をサボります
                         if (Math.random() > executeProb) {
                             willGoodwill = false;
                         }
                     }

                     if (!willGoodwill || (rel.sentiment <= 30 && ratio < 3.0 && !isStrategicPartner)) {
                         return { action: 'none', gold: 0 };
                     } else {
                         // ★追加：関係値が100以上の時は親善しません（念のためのストッパーです）
                         if (rel.sentiment >= 100) {
                             return { action: 'none', gold: 0 };
                         }

                         let goodwillGold = 300; 
                         if (ratio >= 3.0) {
                             goodwillGold = 1000; 
                         } else if (ratio > 1.5) {
                             goodwillGold = 300 + ((ratio - 1.5) / 1.5) * 700;
                         }
                         goodwillGold = Math.floor(goodwillGold / 100) * 100; 
                         return { action: 'goodwill', gold: goodwillGold };
                     }
                } else if (rel.sentiment > allianceThreshold) {
                     // ★追加：すでに同盟や支配をしている相手には、新しく「同盟」の提案はしません
                     if (!['同盟', '支配', '従属'].includes(rel.status)) {
                         return { action: 'alliance', gold: 0 };
                     }
                }
            }
        }

        return { action: 'none', gold: 0 };
    }
    
    /**
     * ★今回追加：同盟や従属を破棄して攻撃する時の、破棄スコア（やりたさ）を計算する魔法です！
     * いままでの確率の計算式をそのまま使って、100点満点のスコアにしてお返しします。
     */
    calcBreakAllianceScore(myClanId, targetClanId, myPower, targetClanTotal, myDaimyoDuty, neighbors) {
        const rel = this.getRelation(myClanId, targetClanId);
        if (!rel) return -999;

        // 相手が従属している時の計算です
        if (rel.status === '従属') {
            const ratio = targetClanTotal / myPower;
            if (ratio <= 2.0) {
                // 最大 90点 になります
                return (0.01 + (2.0 - Math.max(1.0, ratio)) * 0.89) * 100;
            }
            return -999; // マイナスにして絶対に攻めないようにします
        }

        // 相手が同盟している時の計算です
        if (rel.status === '同盟') {
            if (rel.sentiment >= 50) return -999; // 仲良し度50以上なら絶対に裏切りません！

            let breakScore = 0; 
            let minEnemyPower = -1; 
            
            const uniqueClans = [...new Set(neighbors.map(c => c.ownerClan))];
            uniqueClans.forEach(clanId => {
                const r = this.getRelation(myClanId, clanId);
                if (r && !['同盟', '支配', '従属'].includes(r.status)) {
                    const clan = this.game.clans.find(c => c.id === clanId);
                    const p = clan ? Math.max(1, clan.daimyoPrestige) : 1;
                    if (minEnemyPower === -1 || p < minEnemyPower) {
                        minEnemyPower = p;
                    }
                }
            });

            let comparePower = minEnemyPower !== -1 ? minEnemyPower : myPower;
            const powerRatio = targetClanTotal / comparePower;
            
            if (powerRatio < 1.0) {
                breakScore += (1.0 - powerRatio) * 2.5; // (0.025 * 100)
            }

            if (rel.sentiment < 50) {
                breakScore += (50 - rel.sentiment) * 0.3; 
            }

            breakScore += (50 - myDaimyoDuty) * 0.3;

            return breakScore > 0 ? breakScore : -999;
        }

        return -999;
    }

    /**
     * ★新規追加：援軍として呼べるお城や諸勢力のリストを探す専門の魔法です！
     * 自勢力・他勢力、攻撃・守備のすべてをここで判定し、全権を担います。
     */
    findAvailableReinforcements(isSelf, isDefending, initiatorCastleId, targetCastle, myClanId, enemyClanId, connectedCastles) {
        let forces = [];
        
        // ★追加：敵対陣営に参加している勢力（大名家や諸勢力）を除外するためのリストを作成
        const hostileClans = new Set();
        const hostileKunishus = new Set();

        if (enemyClanId) {
            hostileClans.add(Number(enemyClanId));
        }

        if (this.game.warManager && this.game.warManager.state && this.game.warManager.state.active) {
            const s = this.game.warManager.state;
            
            // 自分が防衛側なら、攻撃陣営（メイン、援軍）を敵とみなす
            if (isDefending) {
                if (s.attacker) {
                    if (s.attacker.isKunishu) hostileKunishus.add(Number(s.attacker.kunishuId));
                    else hostileClans.add(Number(s.attacker.ownerClan));
                }
                if (s.reinforcement) {
                    if (s.reinforcement.isKunishuForce) hostileKunishus.add(Number(s.reinforcement.kunishuId));
                    else hostileClans.add(Number(s.reinforcement.castle.ownerClan));
                }
                if (s.selfReinforcement) {
                    hostileClans.add(Number(s.selfReinforcement.castle.ownerClan));
                }
            } 
            // 自分が攻撃側なら、防衛陣営（メイン、援軍）を敵とみなす
            else {
                if (s.defender) {
                    if (s.defender.isKunishu) hostileKunishus.add(Number(s.defender.kunishuId));
                    else hostileClans.add(Number(s.defender.ownerClan));
                }
                if (s.oldDefClanId) hostileClans.add(Number(s.oldDefClanId));

                if (s.defReinforcement) {
                    if (s.defReinforcement.isKunishuForce) hostileKunishus.add(Number(s.defReinforcement.kunishuId));
                    else hostileClans.add(Number(s.defReinforcement.castle.ownerClan));
                }
                if (s.defSelfReinforcement) {
                    hostileClans.add(Number(s.defSelfReinforcement.castle.ownerClan));
                }
            }
        }

        this.game.castles.forEach(c => {
            // ★追加：自分自身（出陣元の城）および対象（攻撃/防衛されている城）は援軍候補から除外します
            if (Number(c.id) === Number(initiatorCastleId) || Number(c.id) === Number(targetCastle.id)) return;

            // 1. 共通の条件：大雪の国からは出陣できません
            const prov = this.game.provinces.find(p => p.id === c.provinceId);
            if (prov && prov.statusEffects && prov.statusEffects.includes('heavySnow')) return;

            // 2. 自勢力（自分の別のお城）を探す場合
            if (isSelf) {
                if (Number(c.ownerClan) !== Number(myClanId)) return;
                
                // 道が繋がっているか、すぐ隣か
                const isConnected = connectedCastles.has(c.id) || this.game.castles.some(myC => connectedCastles.has(myC.id) && GameSystem.isAdjacent(c, myC));
                const isNextToEnemy = (c.id === targetCastle.id) || GameSystem.isAdjacent(c, targetCastle);
                
                if (isConnected || isNextToEnemy) {
                    const normalBushos = this.game.getCastleBushos(c.id).filter(b => b.clan === c.ownerClan && b.status === 'active' && !b.isDaimyo && !b.isCastellan);
                    // 守備の場合は兵糧も500必要
                    const minRice = isDefending ? 500 : 0;
                    
                    if (c.soldiers >= 1000 && c.rice >= minRice && normalBushos.length > 0) {
                        forces.push(c); // 自勢力の場合はお城のデータをそのまま渡します
                    }
                }
            } 
            // 3. 他勢力（同盟国や諸勢力）を探す場合
            else {
                // 目標が諸勢力かどうかで敵大名を判定
                const isTargetKunishu = targetCastle.isKunishu;
                const actualEnemyClanId = isTargetKunishu ? 0 : Number(enemyClanId);
                const cOwnerClanId = Number(c.ownerClan);

                // --- 大名家のチェック ---
                if (cOwnerClanId !== 0 && cOwnerClanId !== Number(myClanId)) {
                    // ★追加：敵対陣営として参加確定している勢力は呼べない
                    if (hostileClans.has(cOwnerClanId)) {
                        // 除外
                    } else {
                        const enemyRel = this.getRelation(cOwnerClanId, actualEnemyClanId);
                        const isEnemyAlly = enemyRel && ['同盟', '支配', '従属', '和睦'].includes(enemyRel.status);
                        const isEnemyMaxGoodwill = enemyRel && enemyRel.sentiment >= 100;
                        
                        // 敵と仲良し過ぎないかチェック（戦争相手と同盟・支配・従属等ではないか）
                        if (!isEnemyAlly && !isEnemyMaxGoodwill && (!enemyRel || !this.isNonAggression(enemyRel.status))) {
                            // 対象のお城が繋がっているかチェック
                            const isConnected = connectedCastles.has(c.id) || this.game.castles.some(myC => connectedCastles.has(myC.id) && GameSystem.isAdjacent(c, myC));
                            // 自軍側が応援を呼ぶ時は、対象と隣接していればOK
                            const isNextToEnemy = !isDefending && ((c.id === targetCastle.id) || GameSystem.isAdjacent(c, targetCastle));
                            
                            if (isConnected || isNextToEnemy) {
                                const normalBushos = this.game.getCastleBushos(c.id).filter(b => b.clan === c.ownerClan && b.status === 'active' && !b.isDaimyo && !b.isCastellan);
                                const minRice = isDefending ? 500 : 0;
                                
                                if (c.soldiers >= 1000 && c.rice >= minRice && normalBushos.length > 0) {
                                    const clan = this.game.clans.find(clanInfo => clanInfo.id === c.ownerClan);
                                    const castellan = this.game.getBusho(c.castellanId) || {name: "城主"};
                                    forces.push({ castle: c, force: { isKunishu: false, id: c.ownerClan, name: clan ? clan.name : "大名家", leaderName: castellan.name, soldiers: c.soldiers } });
                                }
                            }
                        }
                    }
                }

                // --- 諸勢力のチェック ---
                // その城にいる諸勢力を全員チェックします
                const kunishus = this.game.kunishuSystem.getKunishusInCastle(c.id);
                kunishus.forEach(k => {
                    // 攻撃対象の諸勢力自身は呼べないようにガード
                    if (isTargetKunishu && targetCastle.kunishuId === k.id) return;
                    
                    // ★追加：敵対陣営として参加確定している諸勢力は呼べない
                    if (hostileKunishus.has(Number(k.id))) return;

                    const enemyKunishuRel = isTargetKunishu ? 0 : k.getRelation(actualEnemyClanId);
                    // ★関係条件（友好度）を撤廃。兵力と敵との関係のみチェック
                    const canRequest = isTargetKunishu ? 
                        (k.soldiers >= 1000) : 
                        (k.soldiers >= 1000 && enemyKunishuRel < 100);

                    if (canRequest) {
                        const isConnected = connectedCastles.has(c.id) || this.game.castles.some(myC => connectedCastles.has(myC.id) && GameSystem.isAdjacent(c, myC));
                        const isNextToEnemy = !isDefending && ((c.id === targetCastle.id) || GameSystem.isAdjacent(c, targetCastle));
                        
                        if (isConnected || isNextToEnemy) {
                            const members = this.game.kunishuSystem.getKunishuMembers(k.id);
                            if (members.length > 0) {
                                const leader = this.game.getBusho(k.leaderId) || members[0];
                                forces.push({ castle: c, force: { isKunishu: true, id: k.id, name: k.getName(this.game), leaderName: leader.name, soldiers: k.soldiers } });
                            }
                        }
                    }
                });
            }
        });

        return forces;
    }
}