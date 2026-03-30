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

        if (type === 'goodwill') {
            let acceptProb = 100;
            if (relation.sentiment <= 50) acceptProb = relation.sentiment * 2;
            if (commonEnemy) acceptProb += 30;
            if (allyCount >= 2) acceptProb -= (allyCount - 1) * 20;
            if (targetPower > myPower) acceptProb *= (myPower / targetPower);
            
            return Math.max(0, Math.min(100, acceptProb));
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
            if (chance <= threshold) return 0;
            return Math.max(0, Math.min(100, acceptProb));
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
            if (chance <= threshold) return 0;
            
            return Math.max(0, Math.min(100, acceptProb));
        }
        else if (type === 'dominate') {
            const powerRatio = myPower / Math.max(1, targetPower);
            if (powerRatio < 5) return 0;

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
            
            return Math.max(0, Math.min(100, prob));
        }
        return 0;
    }

    /**
     * 他の大名家が援軍要請を承諾する確率（％）を計算する魔法です
     */
    getReinforcementAcceptProb(myClanId, helperClanId, enemyClanId, gold) {
        const myToHelperRel = this.getRelation(myClanId, helperClanId);
        const helperToEnemyRel = this.getRelation(helperClanId, enemyClanId);

        if (myToHelperRel.status === '支配') return 100; // 支配下なら絶対来てくれる！

        let prob = (myToHelperRel.sentiment >= 50) ? (myToHelperRel.sentiment - 49) : 0;
        prob += Math.floor((gold / 1500) * 15); // 持参金ボーナス
        
        if (myToHelperRel.status === '同盟' || myToHelperRel.status === '従属') {
            prob += 30; // 同盟や従属関係ならボーナス
        }
        
        if (helperToEnemyRel) {
            // 相手が敵と仲良しなら、来てくれにくくなる
            prob -= Math.floor((helperToEnemyRel.sentiment - 50) * (20 / 50)); 
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
                const increase = this.calcGoodwillIncrease(gold, doer.diplomacy);
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
            this.clearDominationRelations(doer.clan);
            this.changeStatus(doer.clan, targetClanId, '従属');
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
                this.clearDominationRelations(targetClanId);
                this.changeStatus(doer.clan, targetClanId, '支配');
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
                    const increase = this.calcGoodwillIncrease(gold, doer.diplomacy);
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
                    this.clearDominationRelations(targetClanId);
                    this.changeStatus(doer.clan, targetClanId, '支配');
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
        const dutyInhibition = (myDaimyoDuty * 0.01) * (1.0 - (smartness * 0.5)); 
        
        // 仲良しが2つ以上なら、外交する確率を下げる魔法（1つ増えるごとに20%ダウン）
        let sendProbModifier = 1.0;
        if (allyCount >= 2) {
            sendProbModifier = Math.max(0.1, 1.0 - (allyCount - 1) * 0.2); 
        }

        // ① 従属関係の破棄判定
        if (rel.status === '従属') {
            const ratio = targetClanTotal / myPower;
            if (ratio <= 2.0) {
                const breakProb = 0.01 + (2.0 - Math.max(1.0, ratio)) * 0.89;
                if (Math.random() < breakProb && Math.random() > dutyInhibition) {
                    return { action: 'break_alliance', gold: 0 };
                }
            }
            return { action: 'none', gold: 0 };
        }

        // ② 同盟・支配関係の破棄判定
        if (rel.status === '同盟' || rel.status === '支配') {
             // ★修正：同盟の時だけ、裏切るかどうかの計算をします！
             if (rel.status === '同盟') {
                 const enemies = neighbors.filter(c => !['同盟', '支配', '従属'].includes(this.getRelation(myClanId, c.ownerClan).status));
                 if (enemies.length === 0 && myPower > targetClanTotal * 2.5 && Math.random() > dutyInhibition) {
                      return { action: 'break_alliance', gold: 0 };
                 }
             }
             // ★支配している相手の時は、上の計算をスキップして、おとなしくここで終わります
             return { action: 'none', gold: 0 };
        }

        // ③ 支配要求の判定
        if (targetClanTotal * 8 <= myPower) {
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

            // 直接くっついている時だけ、支配のお願いをします
            if (isDirectlyAdjacent && Math.random() < 0.05) { 
                return { action: 'dominate', gold: 0 };
            }
        }

        // ④ 親善・同盟の判定
        if (myPower < perceivedTargetTotal * 0.8 || isStrategicPartner) {
            if (Math.random() < smartness * sendProbModifier) {
                const allianceThreshold = isStrategicPartner ? (window.AIParams.AI.AllianceThreshold || 70) - 15 : (window.AIParams.AI.AllianceThreshold || 70);
                const goodwillThreshold = isStrategicPartner ? (window.AIParams.AI.GoodwillThreshold || 40) + 20 : (window.AIParams.AI.GoodwillThreshold || 40);

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

                     if (!willGoodwill || (rel.sentiment <= 30 && ratio < 3.0 && !isStrategicPartner)) {
                         return { action: 'none', gold: 0 };
                     } else {
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
                     return { action: 'alliance', gold: 0 };
                }
            }
        }

        return { action: 'none', gold: 0 };
    }
    
}