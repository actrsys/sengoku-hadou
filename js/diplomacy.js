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
                    trucePeriod: oppData.trucePeriod || 0,
                    isMarriage: oppData.isMarriage || false,
                    hostageIds: oppData.hostageIds ? [...oppData.hostageIds] : [], // ★相手が人質リストを持っていればコピー（同期）します
                    subordinateMonths: oppData.subordinateMonths || 0 // ★追加：従属・支配の継続月数も同期します
                };
            } else {
                // どちらも持っていなければ、初期値の50になります
                clan.diplomacyValue[targetId] = {
                    status: '普通', // 状態: '普通', '友好', '敵対', '同盟', '支配', '従属', '和睦'
                    sentiment: 50,  // 感情値: 0 - 100
                    trucePeriod: 0, // ★初期値は0にします
                    isMarriage: false, // ★今回追加：最初は結婚のシールは貼っていません
                    hostageIds: [], // ★新しく空っぽの人質リストを用意します
                    subordinateMonths: 0 // ★追加：従属・支配関係の継続月数を覚える箱
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

        // ★追加：新しく設定される状態が「支配」でも「従属」でもない場合は、継続期間をリセットします。
        // （元々が支配・従属ではなく、今回新しく支配・従属になった場合も0からスタートさせます）
        if (!['支配', '従属'].includes(newStatus) || !['支配', '従属'].includes(dataA.status)) {
            dataA.subordinateMonths = 0;
            dataB.subordinateMonths = 0;
        }

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
                
                // ★追加：状態が「支配」か「従属」だったら、継続期間を1ヶ月増やします
                if (data.status === '支配' || data.status === '従属') {
                    data.subordinateMonths = (data.subordinateMonths || 0) + 1;
                }

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
     * 外交の成功確率（％）を計算して返す魔法です
     * 武将のIDなどから、必要な情報を自動で集めて計算します！
     */
    getDiplomacyProb(doerId, targetId, type) {
        // IDから必要な情報を自分で集めます
        const doer = this.game.getBusho(doerId);
        const targetCastle = this.game.getCastle(targetId);
        const targetClanId = targetCastle.ownerClan;
        const doerClanId = doer.clan;
        const doerDiplomacy = doer.diplomacy;
        const myPower = this.game.getClanTotalSoldiers(doerClanId) || 1;
        const targetPower = this.game.getClanTotalSoldiers(targetClanId) || 1;

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
            if (targetPower > myPower) acceptProb *= (Math.sqrt(myPower) / Math.sqrt(targetPower));
            
            if (['友好', '同盟', '支配', '従属'].includes(relation.status)) {
                acceptProb += 30;
            }
            
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
                acceptProb *= (Math.sqrt(myPower) / Math.sqrt(targetPower));
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
                // 本来ならどれくらい確率を引かれるか（ペナルティの量）を計算します。兵力にはルートをかけて緩和します。
                const penalty = 1.0 - (Math.sqrt(myPower) / Math.sqrt(targetPower));
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
            if (isMarriage) {
                // ★追加：婚姻している場合はさらに15%のボーナスを上乗せします！
                relationBonus += 0.15;
            }
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
     * 外交の成功判定を行います
     */
    checkDiplomacySuccess(doerId, targetId, type) {
        // 外交担当が自分で計算した確率を使って、サイコロを振ります
        const prob = this.getDiplomacyProb(doerId, targetId, type);
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
        let isBreakDomination = false;

        if (oldStatus === '同盟' && oldSentiment >= 70) {
            targetDrop = -70; globalDrop = -10; isBetrayal = true;
        } else if (oldStatus === '従属' && oldSentiment >= 70) {
            targetDrop = -100; globalDrop = -10; isBetrayal = true;
        } else if (oldStatus === '支配') {
            targetDrop = -100; 
            globalDrop = -15;  
            isBetrayal = true; 
            isBreakDomination = true; 
        }

        this.updateSentiment(doerClanId, targetClanId, targetDrop);

        const newRel = this.getRelation(doerClanId, targetClanId);
        let newStatus = '普通';
        if (newRel.sentiment <= 30) newStatus = '敵対';
        else if (newRel.sentiment >= 70) newStatus = '友好';
        this.changeStatus(doerClanId, targetClanId, newStatus);

        if (isBetrayal) {
            this.game.clans.forEach(c => {
                if (c.id !== 0 && c.id !== doerClanId && c.id !== targetClanId) {
                    this.updateSentiment(doerClanId, c.id, globalDrop);
                }
            });
        }

        if (isBreakDomination) {
            this.game.bushos.forEach(busho => {
                if (busho.clan === doerClanId && busho.status === 'active' && !busho.isDaimyo) {
                    busho.loyalty = Math.max(0, busho.loyalty - 5); 
                }
            });
        }

        // ★人質・姫の「処遇待ちリスト」を作成します
        let atMercyPrincesses = []; 
        let capturedHostages = [];   
        let escapedHostages = [];    

        // 破棄した側（A）とされた側（B）に関わらず、敵対している場所にいる人質や姫をチェックします
        this.game.bushos.forEach(b => {
            // AからBへ、またはBからAへ送られている人質を探します
            if (b.isHostage && ((b.originalClanId === doerClanId && b.clan === targetClanId) || (b.originalClanId === targetClanId && b.clan === doerClanId))) {
                // 武力(strength)を使って逃げ出せるか判定します
                let chance = 0.5 - ((b.strength || 30) * 0.002) + (Math.random() * 0.3);
                if (chance > 0.5) {
                    capturedHostages.push(b); // 捕まった！捕虜リストへ
                } else {
                    escapedHostages.push(b);  // 逃げ切った！脱出リストへ
                }
            }
        });

        if (this.game.princesses) {
            this.game.princesses.forEach(p => {
                // 出身を調べる魔法
                let father = p.fatherId ? this.game.getBusho(p.fatherId) : null;
                let originClan = p.originalClanId !== undefined ? p.originalClanId : (father ? father.clan : null);

                // 嫁ぎ先が、今まさに敵対した相手（または自分が破棄した相手）なら捕らえられた扱いにします
                const isBreakerPrincessInTarget = (originClan === doerClanId && p.currentClanId === targetClanId);
                const isTargetPrincessInBreaker = (originClan === targetClanId && p.currentClanId === doerClanId);

                if (p.status === 'married' && (isBreakerPrincessInTarget || isTargetPrincessInBreaker)) {
                    atMercyPrincesses.push(p);
                }
            });
        }

        // 逃げ切った人たちの帰還処理（味方の城へ移動）
        escapedHostages.forEach(b => {
            const originalClan = b.originalClanId;
            const friendlyCastles = this.game.castles.filter(c => c.ownerClan === originalClan);
            if (friendlyCastles.length > 0) {
                const escapeCastle = friendlyCastles[Math.floor(Math.random() * friendlyCastles.length)];
                this.game.affiliationSystem.moveCastle(b, escapeCastle.id);
            } else {
                this.game.affiliationSystem.becomeRonin(b);
            }
            b.isHostage = false;
            b.originalClanId = undefined;
        });

        // 外交データの婚姻・人質情報をリセット
        const dataA = this.getDiplomacyData(doerClanId, targetClanId);
        const dataB = this.getDiplomacyData(targetClanId, doerClanId);
        if (dataA) { dataA.hostageIds = []; dataA.isMarriage = false; }
        if (dataB) { dataB.hostageIds = []; dataB.isMarriage = false; }

        return { 
            oldStatus, isBetrayal, isBreakDomination, 
            atMercyPrincesses, capturedHostages, escapedHostages 
        };
    }
    
    /**
     * 外交の経験値を計算し加算する魔法です
     * 内政などと同じ仕様で、isExecuteフラグを受け取ります
     */
    calcDiplomacyExp(doer, type, isSuccess, isExecute = false) {
        if (!doer) return 0;
        let exp = 0;
        
        if (['goodwill', 'subordinate', 'break_alliance'].includes(type)) {
            exp = 5;
        } else if (['alliance', 'marriage', 'dominate'].includes(type)) {
            exp = isSuccess ? 15 : 5;
        }

        if (isExecute) {
            doer.expDiplomacy = (doer.expDiplomacy || 0) + exp;
        }
        
        return exp;
    }

    /**
     * 指定した関係が「攻撃してはいけない関係（不可侵）」かどうかを判定します
     */
    isNonAggression(status) {
        return ['同盟', '支配', '従属', '和睦'].includes(status);
    }
    
    /**
     * ★新設：同盟が成立した時のデータ書き換えを一手に引き受ける専門の魔法です
     */
    applyAllianceData(clanA, clanB) {
        const relation = this.getRelation(clanA, clanB);
        if (relation) {
            if (relation.sentiment < 31) {
                relation.sentiment = 50;
            } else {
                relation.sentiment = Math.min(100, relation.sentiment + 20);
            }
            const oppRelation = this.getRelation(clanB, clanA);
            if (oppRelation) oppRelation.sentiment = relation.sentiment;
        }
        
        // 状態を同盟に変更する処理もここにまとめます
        this.changeStatus(clanA, clanB, '同盟');
    }

    /**
     * ★新設：支配・従属が成立した時のデータ書き換えを一手に引き受ける専門の魔法です
     */
    applyDominationData(dominantClanId, subordinateClanId) {
        // 関係値の調整
        const relation = this.getRelation(dominantClanId, subordinateClanId);
        if (relation) {
            if (relation.sentiment <= 40) {
                relation.sentiment = 50;
            } else {
                relation.sentiment = Math.min(100, relation.sentiment + 10);
            }
            const oppRelation = this.getRelation(subordinateClanId, dominantClanId);
            if (oppRelation) oppRelation.sentiment = relation.sentiment;
        }

        // 状態を支配・従属に変更します
        // （changeStatusの仕様で、片方を「支配」にすると相手側は自動で「従属」になります）
        this.changeStatus(dominantClanId, subordinateClanId, '支配');

        // ★支配した側の大名家の「今月の外交目標」を親善に書き換えます
        const dominantClan = this.game.clans.find(c => c.id === dominantClanId);
        if (dominantClan && dominantClan.currentDiplomacyTarget && dominantClan.currentDiplomacyTarget.targetId === subordinateClanId) {
            dominantClan.currentDiplomacyTarget.action = 'goodwill';
            dominantClan.currentDiplomacyTarget.gold = 300;
        }
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
        let aiMsg = ""; 
        let logMsg = ""; 
        const isPlayerInvolved = (doer.clan === this.game.playerClanId || targetClanId === this.game.playerClanId);

        // ★ ここで兵力などを計算する必要がなくなりました！（成功判定の中で自動でやってくれます）

        const doerClanName = this.game.clans.find(c => c.id === doer.clan).name;
        const targetClanName = this.game.clans.find(c => c.id === targetClanId).name;

        if (type === 'goodwill') {
            let isSuccess = true;
            if (targetClanId !== this.game.playerClanId) {
                // 成功判定も「誰が」「どこに」「何を」という合図だけでOKです
                isSuccess = this.checkDiplomacySuccess(doerId, targetCastleId, type);
            }

            // ★追加：経験値の計算と加算を専門の魔法にお願いします！
            this.calcDiplomacyExp(doer, type, isSuccess, true);

            if (isSuccess) {
                const increase = this.calcGoodwillIncrease(gold, doer);
                this.updateSentiment(doer.clan, targetClanId, increase);
                
                const castle = this.game.getCastle(doer.castleId); 
                if(castle) castle.gold -= gold;
                
                msg = `${doer.name}が親善を行いました\n友好度が上昇しました`;
                if (isPlayerInvolved) logMsg = `${doerClanName}が${targetClanName}に親善を行いました`;
                doer.achievementTotal += Math.floor(doer.diplomacy * 0.2) + 10;
                this.game.factionSystem.updateRecognition(doer, 15);
            } else {
                msg = `${this.game.clans.find(c => c.id === targetClanId).name} に親善の品を突き返されました……\n友好度は変わりませんでした`;
                doer.achievementTotal += 5;
                this.game.factionSystem.updateRecognition(doer, 5);
            }

        } else if (type === 'alliance') {
            let isSuccess = this.checkDiplomacySuccess(doerId, targetCastleId, type);

            this.calcDiplomacyExp(doer, type, isSuccess, true);

            if (isSuccess) {
                // ★修正：同盟成立の処理は新しい専門部署にお任せします！
                this.applyAllianceData(doer.clan, targetClanId);
                
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
                else logMsg = `${doerClanName}が${targetClanName}と同盟を結びました`;
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
            this.calcDiplomacyExp(doer, type, true, true);

            msg = `${result.oldStatus}関係を破棄しました`;
            logMsg = `${doerClanName}が${targetClanName}との関係を破棄しました`;
            if (result.isBetrayal) msg += `\n諸大名からの心証が悪化しました……`;
            if (result.isBreakDomination) msg += `\n家臣団の中でも動揺が広がっているようです……`;
            
            if (result.escapedHostages.length > 0) {
                const names = result.escapedHostages.map(b => b.name).join('、');
                // msgに文章を追加して、断交のメイン画面に表示されるようにします
                msg += `\n人質として送られていた ${names} は脱走し、無事に帰還しました！`;
                this.game.ui.log(`人質として送られていた ${names} は脱走し、戻って参りました！`);
            }

            // 姫を１人ずつ順番に処理するための関数です（幼稚園児にもわかる再帰処理です）
            const processPrincesses = async (index) => {
                if (index >= result.atMercyPrincesses.length) {
                    // 全ての姫が終わったら、武将の捕虜判定（戦争と同じロジック）へ
                    if (result.capturedHostages.length > 0) {
                        const playerCaptured = result.capturedHostages.filter(b => b.clan === this.game.playerClanId);
                        const aiCaptured = result.capturedHostages.filter(b => b.clan !== this.game.playerClanId);

                        let aiResultMsgs = []; // AIが処遇を決めた結果をまとめる箱です

                        if (aiCaptured.length > 0) {
                            const aiClans = [...new Set(aiCaptured.map(b => b.clan))];
                            aiClans.forEach(cId => {
                                const hostages = aiCaptured.filter(b => b.clan === cId);
                                const clan = this.game.clans.find(c => c.id === cId);
                                const clanName = clan ? clan.name : "他勢力";
                                
                                const myBushos = hostages.filter(b => b.originalClanId === this.game.playerClanId);
                                this.game.warManager.autoResolvePrisoners(hostages, cId);
                                
                                if (myBushos.length > 0) {
                                    myBushos.forEach(b => {
                                        if (b.status === 'dead') {
                                            aiResultMsgs.push(`人質として送っていた ${b.name} は${clanName} によって処断されました……`);
                                            this.game.ui.log(`${b.name} は ${clanName} によって処断されました`);
                                        } else if (b.clan === cId) {
                                            aiResultMsgs.push(`人質として送っていた ${b.name} は${clanName} に臣従しました……`);
                                            this.game.ui.log(`${b.name} は ${clanName} に登用されました`);
                                        } else {
                                            aiResultMsgs.push(`人質として送っていた ${b.name} は無事に解放され、戻って参りました！`);
                                            this.game.ui.log(`${b.name} が ${clanName} より解放されました`);
                                        }
                                    });
                                } else {
                                    const names = hostages.map(b => b.name).join('、');
                                    this.game.ui.log(`${names} が ${clanName} に捕らえられ、処遇が決定しました`);
                                }
                            });
                        }

                        // もしAIがプレイヤーの武将を処遇したメッセージがあれば、ダイアログを出します
                        if (aiResultMsgs.length > 0) {
                            this.game.ui.showDialog(aiResultMsgs.join('\n'), false, () => {
                                // ダイアログを閉じた後、プレイヤーの捕虜がいれば処遇画面を出します
                                if (playerCaptured.length > 0) {
                                    this.game.warManager.pendingPrisoners = playerCaptured;
                                    this.game.warManager.startPrisonerPhase();
                                }
                            });
                        } else {
                            // メッセージがなければ、そのままプレイヤーの捕虜画面へ進みます
                            if (playerCaptured.length > 0) {
                                this.game.warManager.pendingPrisoners = playerCaptured;
                                this.game.warManager.startPrisonerPhase();
                            }
                        }
                    }
                    return;
                }

                const p = result.atMercyPrincesses[index];
                const isCapturedByPlayer = (p.currentClanId === this.game.playerClanId);

                if (isCapturedByPlayer) {
                    // プレイヤーが捕まえている場合：改修されたフッターを使って3択を表示します
                    const pOriginClan = this.game.clans.find(c => c.id === p.originalClanId);
                    const pOriginClanName = pOriginClan ? pOriginClan.name : "他勢力";
                    
                    this.game.ui.showDialog(
                        `${pOriginClanName}から嫁いできた${p.name}の処遇を決定してください。`,
                        false,
                        null,
                        null,
                        {
                            choices: [
                                {
                                    label: '据置',
                                    className: 'btn-primary', // 緑（青）
                                    onClick: () => {
                                        // ① セリフ：顔グラと名前あり
                                        this.game.ui.showDialog(
                                            `「これも戦国の世の習い。最後までお供いたしましょう」`,
                                            false,
                                            () => {
                                                this.game.ui.log(`${p.name} は引き続き妻として留まることになりました`);
                                                processPrincesses(index + 1);
                                            },
                                            null,
                                            { leftFace: p.faceIcon || 'unknown_face.webp', leftName: p.name }
                                        );
                                    }
                                },
                                {
                                    label: '処断',
                                    className: 'btn-danger', // 赤
                                    onClick: () => {
                                        // ① セリフ：顔グラと名前あり
                                        this.game.ui.showDialog(
                                            `「私の怨念は必ずや貴方様を取り殺します。きっと非業の最期を遂げることでしょう。」`,
                                            false,
                                            () => {
                                                // ② ナレーション：顔グラなし
                                                this.game.ui.showDialog(
                                                    `${p.name}を処断しました。`,
                                                    false,
                                                    () => {
                                                        p.status = 'dead';
                                                        const husband = this.game.getBusho(p.husbandId);
                                                        if (husband && husband.wifeIds) husband.wifeIds = husband.wifeIds.filter(id => id !== p.id);
                                                        p.husbandId = 0;
                                                        this.game.ui.log(`${p.name} を処断しました`);
                                                        processPrincesses(index + 1);
                                                    }
                                                );
                                            },
                                            null,
                                            { leftFace: p.faceIcon || 'unknown_face.webp', leftName: p.name }
                                        );
                                    }
                                },
                                {
                                    label: '送り返す',
                                    className: 'btn-secondary', // 銀
                                    onClick: () => {
                                        // ① セリフ：顔グラと名前あり
                                        this.game.ui.showDialog(
                                            `「黄泉の国までお連れいただきとうございました……」`,
                                            false,
                                            () => {
                                                // ② ナレーション：顔グラなし
                                                this.game.ui.showDialog(
                                                    `${p.name}を親元へと送り返しました。`,
                                                    false,
                                                    () => {
                                                        p.status = 'unmarried';
                                                        p.currentClanId = p.originalClanId;
                                                        const husband = this.game.getBusho(p.husbandId);
                                                        if (husband && husband.wifeIds) husband.wifeIds = husband.wifeIds.filter(id => id !== p.id);
                                                        p.husbandId = 0;
                                                        this.game.ui.log(`${p.name} と離縁し、実家へ送り返しました`);
                                                        processPrincesses(index + 1);
                                                    }
                                                );
                                            },
                                            null,
                                            { leftFace: p.faceIcon || 'unknown_face.webp', leftName: p.name }
                                        );
                                    }
                                }
                            ]
                        }
                    );
                } else {
                    // AIが捕まえている場合、一定確率で処断か解放かを決めさせます
                    let aiChoice = Math.random() < 0.5 ? 'kill' : 'release';
                    const aiClan = this.game.clans.find(c => c.id === p.currentClanId);
                    const aiClanName = aiClan ? aiClan.name : "敵勢力";

                    // 姫の正確な出身を調べます（originalClanIdがない場合は父親から判定します）
                    let father = p.fatherId ? this.game.getBusho(p.fatherId) : null;
                    let pOriginClanId = p.originalClanId !== undefined && p.originalClanId !== 0 ? p.originalClanId : (father ? father.clan : 0);

                    // 先に夫の情報をリセットします（メッセージ表示で処理が止まっても確実に消すためです）
                    const husband = this.game.getBusho(p.husbandId);
                    if (husband && husband.wifeIds) husband.wifeIds = husband.wifeIds.filter(id => id !== p.id);
                    p.husbandId = 0;

                    if (aiChoice === 'kill') {
                        p.status = 'dead';
                        this.game.ui.log(`${p.name} は${aiClanName}によって処断されました……`);
                        if (pOriginClanId === this.game.playerClanId) {
                            this.game.ui.showDialog(`${p.name} は${aiClanName}によって処断されました……`, false, () => processPrincesses(index + 1));
                            return;
                        }
                    } else {
                        p.status = 'unmarried';
                        p.currentClanId = pOriginClanId;
                        
                        // 元の勢力の名簿に姫を追加して、宙に浮かないようにします
                        const originClan = this.game.clans.find(c => c.id === pOriginClanId);
                        if (originClan) {
                            if (!originClan.princessIds) originClan.princessIds = [];
                            if (!originClan.princessIds.includes(p.id)) {
                                originClan.princessIds.push(p.id);
                            }
                        }

                        this.game.ui.log(`${p.name} は${aiClanName}によって離縁され、戻って参りました`);
                        if (pOriginClanId === this.game.playerClanId) {
                            this.game.ui.showDialog(`${p.name} は離縁され、戻って参りました。`, false, () => processPrincesses(index + 1));
                            return;
                        }
                    }
                    processPrincesses(index + 1);
                }
            };

            doer.isActionDone = true;
            if (isPlayerInvolved) {
                if (logMsg !== "") this.game.ui.log(logMsg);
                if (doer.clan === this.game.playerClanId) {
                    this.game.ui.updatePanelHeader();
                    this.game.ui.renderCommandMenu();
                    this.game.ui.renderMap();
                }
                this.game.ui.showResultModal(msg, () => {
                    processPrincesses(0); // 最初の姫からスタート！
                });
            } else {
                processPrincesses(0);
            }
            return;

        } else if (type === 'subordinate') {
            this.calcDiplomacyExp(doer, type, true, true);

            // 交渉の魔法を呼び出します
            this.negotiateSubordinationConditions(doer.clan, targetClanId,
                (conditionType, conditionData) => {
                    // 要求を呑んで従属が成立した場合
                    // ★修正：支配・従属の処理は新しい専門部署にお任せします！
                    // （相手が自分を支配する、という形で呼び出します）
                    this.applyDominationData(targetClanId, doer.clan);

                    // どの条件を呑んだかでメッセージを変えます
                    let conditionMsg = "";
                    if (conditionType === 'marriage') {
                        conditionMsg = `\n${conditionData.princess.name} が ${conditionData.busho.name} の側室として迎えられました。`;
                    } else if (conditionType === 'hostage') {
                        conditionMsg = `\n${conditionData.busho.name} を人質として差し出しました。`;
                    } else if (conditionType === 'castle') {
                        this.applyCastleCessionData(conditionData.castle.id, doer.clan, targetClanId);
                        conditionMsg = `\n${conditionData.castle.name} を割譲しました。`;
                    }

                    msg = `${this.game.clans.find(c => c.id === targetClanId).name} に従属しました！${conditionMsg}`;
                    if (!isPlayerInvolved) aiMsg = `${targetClanName} が ${doerClanName} を支配下に置きました！`;
                    else logMsg = `${doerClanName}が${targetClanName}に従属しました`;
                    doer.achievementTotal += Math.floor(doer.diplomacy * 0.2) + 10;
                    this.game.factionSystem.updateRecognition(doer, 30);

                    doer.isActionDone = true;
                    if (isPlayerInvolved) {
                        this.game.ui.showResultModal(msg);
                        if (logMsg !== "") this.game.ui.log(logMsg);
                        if (doer.clan === this.game.playerClanId) {
                            this.game.ui.updatePanelHeader();
                            this.game.ui.renderCommandMenu();
                            this.game.ui.renderMap();
                        }
                    }
                },
                () => {
                    // 要求をすべて断って交渉決裂した場合
                    msg = `条件が折り合わず、${this.game.clans.find(c => c.id === targetClanId).name} への従属を断念しました。`;
                    if (isPlayerInvolved) {
                        this.game.ui.showResultModal(msg);
                    }
                }
            );

            // この場での処理は一旦終了し、あとは交渉のダイアログに任せます
            return;

        } else if (type === 'dominate') {
            let isSuccess = false;
            
            // 上で兵力計算を消してしまったので、ここで調べ直します
            const myPower = this.game.getClanTotalSoldiers(doer.clan) || 1;
            const targetPower = this.game.getClanTotalSoldiers(targetClanId) || 1;
            
            if (myPower / targetPower < 5) {
                isSuccess = false;
                this.calcDiplomacyExp(doer, type, isSuccess, true);
                
                this.updateSentiment(doer.clan, targetClanId, -5);
                msg = `要求を跳ね除けられました……`;
                doer.achievementTotal += 5;
                this.game.factionSystem.updateRecognition(doer, 10);
            } else {
                isSuccess = this.checkDiplomacySuccess(doerId, targetCastleId, type);
                this.calcDiplomacyExp(doer, type, isSuccess, true);
                
                if (isSuccess) {
                    // ★修正：支配・従属の処理は新しい専門部署にお任せします！
                    this.applyDominationData(doer.clan, targetClanId);

                    msg = `${this.game.clans.find(c => c.id === targetClanId).name} を支配下に置くことに成功しました！`;
                    if (!isPlayerInvolved) aiMsg = `${doerClanName} が ${targetClanName} を支配下に置きました！`;
                    else logMsg = `${doerClanName}が${targetClanName}を支配下に置きました`;
                    doer.achievementTotal += Math.floor(doer.diplomacy * 0.2) + 20;
                    this.game.factionSystem.updateRecognition(doer, 40);
                } else {
                    this.updateSentiment(doer.clan, targetClanId, -5);
                    msg = `支配の要求は拒否されました……`;
                    doer.achievementTotal += 5;
                    this.game.factionSystem.updateRecognition(doer, 10);
                }
            }
        }
        doer.isActionDone = true;
        if (isPlayerInvolved) {
            this.game.ui.showResultModal(msg);
            if (logMsg !== "") this.game.ui.log(logMsg);
            if (doer.clan === this.game.playerClanId) {
                this.game.ui.updatePanelHeader();
                this.game.ui.renderCommandMenu();
                this.game.ui.renderMap();
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
     * 従属により指定した拠点を割譲する処理
     */
    applyCastleCessionData(castleId, subordinateClanId, dominantClanId) {
        const castleA = this.game.getCastle(castleId);
        if (!castleA) return;

        const myCastles = this.game.castles.filter(c => c.ownerClan === subordinateClanId && c.id !== castleId);
        if (myCastles.length === 0) return;

        const myLegionCastles = myCastles.filter(c => c.legionId === castleA.legionId);
        const daimyo = this.game.bushos.find(b => b.clan === subordinateClanId && b.isDaimyo);
        const isDaimyoInA = (daimyo && daimyo.castleId === castleId);
        const commanderInA = this.game.bushos.find(b => b.castleId === castleId && b.isCommander && b.status === 'active');

        let castleB = null;

        if (isDaimyoInA) {
            const directCastles = myCastles.filter(c => c.legionId === 0);
            if (directCastles.length > 0) {
                castleB = directCastles[0];
            } else {
                const noCommanderCastles = myCastles.filter(c => {
                    const lord = this.game.getBusho(c.castellanId);
                    return !(lord && lord.isCommander);
                });
                if (noCommanderCastles.length > 0) {
                    castleB = noCommanderCastles[0];
                } else {
                    castleB = myCastles[0];
                }
            }
        } else {
            if (myLegionCastles.length > 0) {
                castleB = myLegionCastles[0];
            } else {
                const directCastles = myCastles.filter(c => c.legionId === 0);
                if (directCastles.length > 0) {
                    castleB = directCastles[0];
                } else if (daimyo && daimyo.castleId) {
                    castleB = this.game.getCastle(daimyo.castleId);
                } else {
                    castleB = myCastles[0];
                }
            }
        }

        if (!castleB) castleB = myCastles[0];

        const bushosInA = this.game.getCastleBushos(castleId).filter(b => b.clan === subordinateClanId && b.status === 'active');
        const lordB = this.game.getBusho(castleB.castellanId);

        if (isDaimyoInA && castleB.legionId !== 0 && lordB && lordB.isCommander) {
            lordB.isCommander = false;
            lordB.isCastellan = false;
            const targetLegionId = castleB.legionId;
            
            // 拠点Bと同じ軍団の城をすべて直轄にする
            this.game.castles.forEach(c => {
                if (c.ownerClan === subordinateClanId && c.legionId === targetLegionId) {
                    c.legionId = 0;
                }
            });
            
            // 軍団データの初期化（解散状態にする）
            const legion = this.game.legions.find(l => l.clanId === subordinateClanId && l.legionNo === targetLegionId);
            if (legion) {
                legion.commanderId = 0;
                legion.objective = null;
                legion.status = 'wait';
                legion.targetId = 0;
                legion.route = [];
            }
        }

        let disbandedCommander = false;
        if (commanderInA && myLegionCastles.length === 0) {
            commanderInA.isCommander = false;
            commanderInA.isCastellan = false;
            const targetLegionId = castleA.legionId;
            
            this.game.castles.forEach(c => {
                if (c.ownerClan === subordinateClanId && c.legionId === targetLegionId && c.id !== castleId) {
                    c.legionId = 0;
                }
            });
            
            const legion = this.game.legions.find(l => l.clanId === subordinateClanId && l.legionNo === targetLegionId);
            if (legion) {
                legion.commanderId = 0;
                legion.objective = null;
                legion.status = 'wait';
                legion.targetId = 0;
                legion.route = [];
            }
            disbandedCommander = true;
        }

        bushosInA.forEach(b => {
            const wasCastellan = b.isCastellan;
            // 一旦全員の城主フラグを外します
            b.isCastellan = false;

            // 大名か、解散されなかった国主で、元々城主だった場合のみ
            if (wasCastellan && (b.isDaimyo || b.isCommander) && !disbandedCommander) {
                // 移動先Bの城主が国主で、自分が大名ではない場合は城主になれません
                if (lordB && lordB.isCommander && !b.isDaimyo) {
                    // 何もしない（Aでの城主身分は剥奪のまま）
                } else {
                    if (lordB) lordB.isCastellan = false;
                    b.isCastellan = true;
                    castleB.castellanId = b.id;
                }
            }

            this.game.affiliationSystem.moveCastle(b, castleB.id);
        });

        if (castleA.soldiers < 1500) castleA.soldiers = 1500;
        if (castleA.rice < 2500) castleA.rice = 2500;
        if (castleA.defense < 200) castleA.defense = Math.min(200, castleA.maxDefense || 9999);
        if (castleA.peoplesLoyalty < 51) castleA.peoplesLoyalty = 51;

        this.game.castleManager.changeOwner(castleA, dominantClanId, true);
    }

    /**
     * 従属・支配の際の条件交渉を行う魔法です
     */
    negotiateSubordinationConditions(subordinateClanId, dominantClanId, onSuccess, onFailure) {
        const subClan = this.game.clans.find(c => c.id === subordinateClanId);
        const domClan = this.game.clans.find(c => c.id === dominantClanId);
        if (!subClan || !domClan) {
            if (onFailure) onFailure();
            return;
        }

        // プレイヤーが従属する側（要求を突きつけられる側）かどうか
        const isPlayer = (subordinateClanId === this.game.playerClanId);
        
        // AI同士、またはAIがプレイヤーに従属を申し入れてきた場合は、
        // 将来拡張できるように一旦「無条件で受け入れる」設定にしておきます
        if (!isPlayer) {
            if (onSuccess) onSuccess('none', null);
            return;
        }

        // ステップ1：姫の要求
        const checkStep1 = () => {
            let availablePrincess = null;
            if (subClan.princessIds && subClan.princessIds.length > 0) {
                for (let pId of subClan.princessIds) {
                    const p = this.game.princesses.find(pr => pr.id === pId && pr.status === 'unmarried');
                    if (p) {
                        availablePrincess = p;
                        break;
                    }
                }
            }

            if (availablePrincess) {
                // 相手勢力の中で活躍中の武将を候補にします（複室制に対応し、既婚者も除外しません）
                const domBushos = this.game.bushos.filter(b => b.clan === dominantClanId && b.status === 'active');
                const domDaimyo = this.game.bushos.find(b => b.clan === dominantClanId && b.isDaimyo);
                
                // 優先順位（一門かつ未婚 > 一門かつ既婚 > 家臣かつ未婚 > 家臣かつ既婚）をつけて並び替えます
                // その中で最も年齢が近い者を選びます
                domBushos.sort((a, b) => {
                    const getWeight = (target) => {
                        const isKinsman = domDaimyo && (target.id === domDaimyo.id || (Array.isArray(target.familyIds) && target.familyIds.includes(domDaimyo.id)) || (domDaimyo.familyIds && domDaimyo.familyIds.includes(target.id)));
                        const isUnmarried = (!target.wifeIds || target.wifeIds.length === 0);
                        if (isKinsman && isUnmarried) return 4;
                        if (isKinsman) return 3;
                        if (isUnmarried) return 2;
                        return 1;
                    };
                    const weightA = getWeight(a);
                    const weightB = getWeight(b);
                    if (weightA !== weightB) return weightB - weightA;
                    
                    return Math.abs(a.birthYear - availablePrincess.birthYear) - Math.abs(b.birthYear - availablePrincess.birthYear);
                });

                const targetBusho = domBushos.length > 0 ? domBushos[0] : null;

                if (targetBusho) {
                    const msg = `${domClan.name}は従属の証として${availablePrincess.name}を${targetBusho.name}に嫁がせることを要求してきました。\n${availablePrincess.name}を差し出しますか？`;
                    this.game.ui.showDialog(msg, true, 
                        () => {
                            // 嫁がせる（成立）
                            this.applyMarriageData(availablePrincess.id, targetBusho.id, dominantClanId);
                            if (onSuccess) onSuccess('marriage', { princess: availablePrincess, busho: targetBusho });
                        },
                        () => {
                            // 断ったら次のステップへ
                            checkStep2();
                        },
                        { okText: '嫁がせる', okClass: 'btn-danger', cancelText: '断る' }
                    );
                    return;
                }
            }
            checkStep2();
        };

        // ステップ2：人質の要求
        const checkStep2 = () => {
            const daimyo = this.game.bushos.find(b => b.clan === subordinateClanId && b.isDaimyo);
            let hostage = null;
            if (daimyo) {
                const dFamily = Array.isArray(daimyo.familyIds) ? daimyo.familyIds : [];
                const kinsmen = this.game.bushos.filter(b => {
                    if (b.clan !== subordinateClanId || b.isDaimyo || b.status !== 'active') return false;
                    const bFamily = Array.isArray(b.familyIds) ? b.familyIds : [];
                    return bFamily.includes(daimyo.id) || dFamily.includes(b.id);
                });
                if (kinsmen.length > 0) {
                    // とりあえず見つかった最初の武将を人質候補にします
                    hostage = kinsmen[0];
                }
            }

            if (hostage) {
                const msg = `${domClan.name}は従属の証として${hostage.name}を人質として差し出すことを要求してきました。\n${hostage.name}を人質として送りますか？`;
                this.game.ui.showDialog(msg, true,
                    () => {
                        // 人質を送る（成立）
                        this.applyHostageData(hostage.id, subordinateClanId, dominantClanId);
                        if (onSuccess) onSuccess('hostage', { busho: hostage });
                    },
                    () => {
                        // 断ったら次のステップへ
                        checkStep3();
                    },
                    { okText: '人質を送る', okClass: 'btn-danger', cancelText: '断る' }
                );
                return;
            }
            checkStep3();
        };

        // ステップ3：領地の要求
        const checkStep3 = () => {
            const subCastles = this.game.castles.filter(c => Number(c.ownerClan) === subordinateClanId);
            if (subCastles.length >= 2) {
                let targetCastle = null;
                const domCastles = this.game.castles.filter(c => Number(c.ownerClan) === dominantClanId);
                
                for (let sc of subCastles) {
                    // 大名のいる城は避けます
                    const castellan = this.game.getBusho(sc.castellanId);
                    if (castellan && castellan.isDaimyo) continue;

                    // 相手の領土と隣接しているかチェック
                    let isAdjacent = false;
                    for (let dc of domCastles) {
                        if (typeof window.GameSystem !== 'undefined' && window.GameSystem.isAdjacent) {
                            if (window.GameSystem.isAdjacent(sc, dc)) {
                                isAdjacent = true;
                                break;
                            }
                        } else if (sc.adjacentCastleIds && sc.adjacentCastleIds.includes(dc.id)) {
                            isAdjacent = true;
                            break;
                        }
                    }
                    if (isAdjacent) {
                        targetCastle = sc;
                        break;
                    }
                }

                if (targetCastle) {
                    const msg = `${domClan.name}は、従属の証として${targetCastle.name}を割譲することを要求してきました。\n${targetCastle.name}を明け渡しますか？`;
                    this.game.ui.showDialog(msg, true,
                        () => {
                            // 明け渡す（成立）※中身は後日作成
                            if (onSuccess) onSuccess('castle', { castle: targetCastle });
                        },
                        () => {
                            // すべて断ったので交渉決裂（失敗）
                            if (onFailure) onFailure();
                        },
                        { okText: '明け渡す', okClass: 'btn-danger', cancelText: '断る' }
                    );
                    return;
                }
            }
            
            // 要求できるものが何も無かった場合も交渉決裂とします
            if (onFailure) onFailure();
        };

        // 最初のステップを開始します
        checkStep1();
    }
    
    /**
     * 人質が送られた時のデータ書き換え魔法です
     */
    applyHostageData(hostageId, subordinateClanId, dominantClanId) {
        const hostage = this.game.getBusho(hostageId);
        if (!hostage) return;

        // 相手の大名（当主）がどこにいるか探します
        const dominantDaimyo = this.game.bushos.find(b => b.clan === dominantClanId && b.isDaimyo);
        const targetCastleId = dominantDaimyo ? dominantDaimyo.castleId : null;

        if (!targetCastleId) return;

        // 元の大名家のIDを覚えておきます
        hostage.originalClanId = subordinateClanId;
        // 人質シールのフラグを立てます
        hostage.isHostage = true;

        // 人事部（お引越しセンター）にお願いして、相手大名の居城へお引越し＆所属変更させます
        // ※この時、相性計算を飛ばして忠誠度を強制的に100にします！
        this.game.affiliationSystem.joinClan(hostage, dominantClanId, targetCastleId, 100);

        // 人質リストに追加します（自分と相手、両方の外交データに同じように記録します）
        const relationA = this.getDiplomacyData(subordinateClanId, dominantClanId);
        if (relationA && relationA.hostageIds && !relationA.hostageIds.includes(hostageId)) {
            relationA.hostageIds.push(hostageId);
        }
        
        const relationB = this.getDiplomacyData(dominantClanId, subordinateClanId);
        if (relationB && relationB.hostageIds && !relationB.hostageIds.includes(hostageId)) {
            relationB.hostageIds.push(hostageId);
        }
    }

    /**
     * 婚姻が成立した時の、データ書き換え一斉処理です
     */
    applyMarriageData(princessId, targetBushoId, targetClanId, isMainWife = false) {
        const myClan = this.game.clans.find(c => c.id === this.game.playerClanId);
        const princess = this.game.princesses.find(p => p.id === princessId);
        const targetBusho = this.game.getBusho(targetBushoId);
        
        if (!princess || !targetBusho || !myClan) return;

        princess.currentClanId = targetClanId;
        princess.husbandId = targetBushoId;
        princess.status = 'married';

        myClan.princessIds = myClan.princessIds.filter(id => id !== princessId);

        if (!targetBusho.wifeIds.includes(princessId)) {
            if (isMainWife) {
                targetBusho.wifeIds.unshift(princessId); // 正室なのでリストの先頭（一番目）に割り込ませます
            } else {
                targetBusho.wifeIds.push(princessId);    // 側室なのでリストの末尾に並ばせます
            }
        }
        targetBusho.updateFamilyIds(this.game.princesses);

        this.changeStatus(this.game.playerClanId, targetClanId, '同盟');
        
        const relation = this.getDiplomacyData(this.game.playerClanId, targetClanId);
        if (relation) {
            relation.isMarriage = true;
            if (relation.sentiment >= 41) {
                relation.sentiment = Math.min(100, relation.sentiment + 30);
            } else {
                relation.sentiment = 70;
            }
        }
        const oppRelation = this.getDiplomacyData(targetClanId, this.game.playerClanId);
        if (oppRelation) {
            oppRelation.isMarriage = true;
            if (oppRelation.sentiment >= 41) {
                oppRelation.sentiment = Math.min(100, oppRelation.sentiment + 30);
            } else {
                oppRelation.sentiment = 70;
            }
        }
    }

    /**
     * 婚姻コマンドを実行する魔法です
     */
    executeMarriage(doerId, targetCastleId, princessId, targetBushoId) {
        const doer = this.game.getBusho(doerId);
        const targetCastle = this.game.getCastle(targetCastleId);
        if (!targetCastle) return;
        
        const targetClanId = targetCastle.ownerClan;
        const targetClan = this.game.clans.find(c => c.id === targetClanId);
        const targetBusho = this.game.getBusho(targetBushoId);
        const princess = this.game.princesses.find(p => p.id === princessId);

        // 新しい魔法に合わせて合図だけにします
        const isSuccess = this.checkDiplomacySuccess(doerId, targetCastleId, 'marriage');
        
        this.calcDiplomacyExp(doer, 'marriage', isSuccess, true);

        if (isSuccess) {
            this.applyMarriageData(princessId, targetBushoId, targetClanId, true); // ★最後に true を渡して「正室」扱いと伝えます
            doer.isActionDone = true;
            doer.achievementTotal += Math.floor(doer.diplomacy * 0.2) + 20;
            this.game.factionSystem.updateRecognition(doer, 30);

            const doerClan = this.game.clans.find(c => c.id === doer.clan);
            this.game.ui.log(`${doerClan.name}が${targetClan.name}と婚姻同盟を締結しました`);

            this.game.ui.showResultModal(`${targetClan.name} と婚姻同盟を締結しました！\n${princess.name} は ${targetBusho.name} の正室として迎えられました。`, () => {
                this.game.ui.updatePanelHeader();
                this.game.ui.renderCommandMenu();
                this.game.ui.renderMap();
            });
        } else {
            this.updateSentiment(doer.clan, targetClanId, -10);
            doer.isActionDone = true;
            doer.achievementTotal += 5;
            this.game.factionSystem.updateRecognition(doer, 10);

            this.game.ui.showResultModal(`${targetClan.name} との婚姻同盟の締結に失敗しました……`, () => {
                this.game.ui.updatePanelHeader();
                this.game.ui.renderCommandMenu();
                this.game.ui.renderMap();
            });
        }
    }

    /**
     * 臣従願を実行して、相手の大名家に乗り換える魔法です！
     */
    executeVassalage(doerId, targetCastleId) {
        const targetCastle = this.game.getCastle(targetCastleId);
        if (!targetCastle) return;
        
        const targetClanId = targetCastle.ownerClan;
        const myClanId = this.game.playerClanId;
        
        const targetClan = this.game.clans.find(c => c.id === targetClanId);
        
        // 1. プレイヤー側の軍団をすべて解散させます（お片付け）
        if (this.game.legions) {
            const myLegions = this.game.legions.filter(l => Number(l.clanId) === Number(myClanId));
            myLegions.forEach(l => {
                this.game.castleManager.disbandLegion(l.id);
            });
        }
        
        // 2. プレイヤー側のお城をすべて対象の大名家にプレゼントして、直轄（0）にします
        const myCastles = this.game.castles.filter(c => Number(c.ownerClan) === Number(myClanId));
        myCastles.forEach(c => {
            this.game.castleManager.changeOwner(c, targetClanId, true, 0);
        });
        
        // 3. プレイヤー側の武将のバッジ（身分）を外し、新しい大名家に入れます
        const myBushos = this.game.bushos.filter(b => Number(b.clan) === Number(myClanId));
        myBushos.forEach(b => {
            b.isDaimyo = false;
            b.isCommander = false;
            b.isGunshi = false;
            
            b.clan = targetClanId;
            
            // 人事部（お引越しセンター）にお願いして、新しい殿様との相性で忠誠度を再計算します！
            this.game.affiliationSystem.updateLoyaltyForNewLord(b, targetClanId);
        });

        // 外交担当者に行動完了のシールを貼ります
        const doer = this.game.getBusho(doerId);
        if (doer) doer.isActionDone = true;
        
        // 4. プレイヤーの操作担当を、新しい大名家に切り替えます！
        this.game.playerClanId = targetClanId;
        
        const msg = `当家は ${targetClan.name} に臣従しました。これより ${targetClan.name} として天下統一を目指します！`;
        
        this.game.ui.showResultModal(msg, () => {
            // 新しい大名家の情報に合わせて画面を綺麗に描き直します
            this.game.ui.updatePanelHeader();
            this.game.ui.renderCommandMenu();
            this.game.ui.renderMap();
        });
    }

    /**
     * 戦闘などで敗北した勢力を従属させる処理です
     */
    executeSubjugation(winnerClanId, loserClanId) {
        this.changeStatus(winnerClanId, loserClanId, '支配');
        const winner = this.game.clans.find(c => Number(c.id) === Number(winnerClanId));
        const loser = this.game.clans.find(c => Number(c.id) === Number(loserClanId));
        if (winner && loser) {
            this.game.ui.log(`${winner.name}が${loser.name}を従属させました`);
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
                // 受諾（成功）時の経験値加算
                this.calcDiplomacyExp(doer, type, true, true);

                if (type === 'goodwill') {
                    const myCastle = this.game.castles.find(c => c.ownerClan === targetClanId);
                    if (myCastle) myCastle.gold = Math.min(99999, myCastle.gold + gold);
                    // ★窓口の時とは違い、専門部署用に少しだけ計算の仕方を整えています
                    const increase = this.calcGoodwillIncrease(gold, doer);
                    this.updateSentiment(doer.clan, targetClanId, increase);
                    this.game.ui.log(`${doerClan.name}からの親善を受け入れました`);
                    this.game.ui.showResultModal(`${doerClan.name} からの親善を受け入れました！\n友好度が上昇しました`, () => {
                        if (onComplete) setTimeout(onComplete, 100);
                    });
                } else if (type === 'alliance') {
                    // ★修正：同盟成立の処理は新しい専門部署にお任せします！
                    this.applyAllianceData(doer.clan, targetClanId);
                    
                    this.game.ui.log(`${doerClan.name}と同盟を結びました`);
                    this.game.ui.showResultModal(`${doerClan.name} と同盟を結びました！`, () => {
                        if (onComplete) setTimeout(onComplete, 100);
                    });
                } else if (type === 'dominate') {
                    // ★修正：支配・従属の処理は新しい専門部署にお任せします！
                    this.applyDominationData(doer.clan, targetClanId);

                    this.game.ui.log(`${doerClan.name}に従属しました`);
                    this.game.ui.showResultModal(`${doerClan.name} に従属しました……`, () => {
                        if (onComplete) setTimeout(onComplete, 100);
                    });
                }
            },
            () => {
                // 拒否（失敗）時の経験値加算
                this.calcDiplomacyExp(doer, type, false, true);

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

        // ★追加：相手の大名から「宿敵」として恨まれている場合、交渉しても失敗しやすいので外交対象から外します！
        // （無駄な資金や行動回数を消費しないようにする賢いAIの魔法です）
        const myDaimyo = this.game.bushos.find(b => b.clan === myClanId && b.isDaimyo);
        const targetDaimyo = this.game.bushos.find(b => b.clan === targetClanId && b.isDaimyo);
        if (myDaimyo && targetDaimyo && targetDaimyo.nemesisIds && targetDaimyo.nemesisIds.includes(myDaimyo.id)) {
            return { action: 'none', gold: 0 };
        }
        
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
        // ★追加：相手の大名が「征夷大将軍（ID1の官位）」を持っているかをチェックします！
        const isTargetShogun = targetDaimyo && targetDaimyo.courtRankIds && targetDaimyo.courtRankIds.includes(1);

        // ★すでに「支配」している相手には、もう支配要求を行わないようにチェックを書き足します！
        // さらに、相手が征夷大将軍の場合は支配要求（降伏勧告）を行わないようにガードを追加します！
        if (!amISubordinate && rel.status !== '支配' && targetClanTotal * 8 <= myPower && !isTargetShogun) {
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
            // 1. 共通の条件：大雪の国からは出陣できません
            const prov = this.game.provinces.find(p => p.id === c.provinceId);
            if (prov && prov.statusEffects && prov.statusEffects.includes('heavySnow')) return;
            
            // ★修正：自分自身（出陣元の城）および対象（攻撃/防衛されている城）かどうかを判定します
            const isInitiatorOrTarget = (Number(c.id) === Number(initiatorCastleId) || Number(c.id) === Number(targetCastle.id));

            // 2. 自勢力（自分の別のお城）を探す場合
            if (isSelf) {
                // ★大名家の自軍援軍として、出陣元や対象の城は除外します
                if (isInitiatorOrTarget) return;

                if (Number(c.ownerClan) !== Number(myClanId)) return;
                
                // 道が繋がっているか、すぐ隣か
                const isConnected = connectedCastles.has(c.id) || this.game.castles.some(myC => connectedCastles.has(myC.id) && GameSystem.isAdjacent(c, myC));
                const isNextToEnemy = (c.id === targetCastle.id) || GameSystem.isAdjacent(c, targetCastle);
                
                if (isConnected || isNextToEnemy) {
                    const availableBushos = this.game.getCastleBushos(c.id).filter(b => b.clan === c.ownerClan && b.status === 'active');
                    // 守備の場合は兵糧も500必要
                    const minRice = isDefending ? 500 : 0;
                    
                    if (c.soldiers >= 1000 && c.rice >= minRice && availableBushos.length > 0) {
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
                // ★大名家の他勢力援軍として、出陣元や対象の城は除外します
                if (!isInitiatorOrTarget && cOwnerClanId !== 0 && cOwnerClanId !== Number(myClanId)) {
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
                                const availableBushos = this.game.getCastleBushos(c.id).filter(b => b.clan === c.ownerClan && b.status === 'active');
                                const minRice = isDefending ? 500 : 0;
                                
                                if (c.soldiers >= 1000 && c.rice >= minRice && availableBushos.length > 0) {
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