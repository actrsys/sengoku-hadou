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
    calcGoodwillIncrease(gold, doerDiplomacy) {
        let baseIncrease = 0;
        if (gold <= 1000) {
            baseIncrease = gold / 100; 
        } else {
            baseIncrease = 10 + (Math.sqrt(gold - 1000) / Math.sqrt(2000)) * 3;
        }

        let dipBonus = (doerDiplomacy - 50) / 10;
        dipBonus = Math.max(-5, Math.min(5, dipBonus)); 

        let scale = Math.min(1.0, gold / 1000);
        dipBonus *= scale;

        let totalFloat = (baseIncrease + dipBonus) * (0.9 + Math.random() * 0.2);
        return Math.max(1, Math.round(totalFloat));
    }

    /**
     * 外交の成功判定を行います（AI相手の場合）
     */
    checkDiplomacySuccess(doerClanId, targetClanId, type, doerDiplomacy, myPower, targetPower) {
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

        if (type === 'goodwill') {
            let acceptProb = 100;
            if (relation.sentiment <= 50) acceptProb = relation.sentiment * 2;
            if (commonEnemy) acceptProb += 30;
            if (allyCount >= 2) acceptProb -= (allyCount - 1) * 20;
            if (targetPower > myPower) acceptProb *= (myPower / targetPower);
            
            return (Math.random() * 100) <= acceptProb;
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
            return (chance > threshold) && ((Math.random() * 100) < acceptProb);
        }
        else if (type === 'dominate') {
            const powerRatio = myPower / Math.max(1, targetPower);
            if (powerRatio < 5) return false;

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
            
            return (Math.random() * 100) < prob;
        }
        return false;
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

        if (oldStatus === '同盟' && oldSentiment >= 70) {
            targetDrop = -70; globalDrop = -10; isBetrayal = true;
        } else if (oldStatus === '従属' && oldSentiment >= 70) {
            targetDrop = -100; globalDrop = -10; isBetrayal = true;
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
        return { oldStatus, isBetrayal };
    }
    
    /**
     * 指定した関係が「攻撃してはいけない関係（不可侵）」かどうかを判定します
     */
    isNonAggression(status) {
        return ['同盟', '支配', '従属', '和睦'].includes(status);
    }
}