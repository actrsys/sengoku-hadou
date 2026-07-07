/**
 * ai_operation.js - AIの作戦（長期計画）システム
 * 大名家ごとの作戦（攻撃、防衛、集結、内政）の立案・準備・実行の管理
 */

class AIOperationManager {
    constructor(game) {
        this.game = game;
        this.operations = {};
        // ★追加：徴兵用のお城を記憶しておく箱です
        this.draftBases = {}; 
        // ★追加：各大名の各軍団に作戦の大目標を持たせるための箱です
        this.grandObjectives = {};
    }

    save() {
        return {
            operations: this.operations,
            draftBases: this.draftBases, // ★追加：セーブデータに残します
            grandObjectives: this.grandObjectives // ★追加：大目標もセーブに残します
        };
    }

    load(data) {
        // ★変更：古いセーブデータと、新しいセーブデータの両方に対応する魔法です！
        this.operations = {};
        this.draftBases = {};
        this.grandObjectives = {}; // ★追加：ロード時の初期化
        
        if (data && data.operations) {
            for (const clanId in data.operations) {
                if (data.operations[clanId].type) {
                    this.operations[clanId] = { 0: data.operations[clanId] };
                } else {
                    this.operations[clanId] = data.operations[clanId];
                }
            }
            if (data.draftBases) {
                for (const clanId in data.draftBases) {
                    if (typeof data.draftBases[clanId] === 'number') {
                        this.draftBases[clanId] = { 0: data.draftBases[clanId] };
                    } else {
                        this.draftBases[clanId] = data.draftBases[clanId] || {};
                    }
                }
            }
            // ★追加：大目標の復元
            if (data.grandObjectives) {
                this.grandObjectives = data.grandObjectives;
            }
        } else {
            for (const clanId in data) {
                 if (data[clanId] && data[clanId].type) {
                     this.operations[clanId] = { 0: data[clanId] };
                 }
            }
        }
    }

    // ★追加：すべての作戦を巡回して、不正なデータ（矛盾）がないか健康診断をする魔法です！
    validateAllOperations() {
        for (const clanIdStr in this.operations) {
            const clanId = Number(clanIdStr);
            const clanOps = this.operations[clanId];
            for (const legionIdStr in clanOps) {
                const legionId = Number(legionIdStr);
                const op = clanOps[legionId];
                let isInvalid = false;

                // 1. その大名家がもう滅亡していないかチェック
                const clan = this.game.clans.find(c => c.id === clanId);
                
                // ★追加：軍団のデータを探します（直轄である0番は除きます）
                const legion = legionId === 0 ? true : this.game.legions.find(l => l.clanId === clanId && l.legionNo === legionId);

                if (!clan || clan.id === 0) {
                    isInvalid = true;
                } else if (!op) {
                    isInvalid = true;
                } else if (legionId !== 0 && (!legion || legion.commanderId === 0)) {
                    // ★追加：国主が剥奪されたり、軍団が解体された場合は不正とみなして作戦を破棄します
                    isInvalid = true;
                } else {
                    // 2. 作戦データの中身が壊れていないかチェック
                    if (op.type === '攻撃') {
                        // 数値が「NaN（非数）」になってしまっていないか、出撃元が設定されているか
                        if (!op.stagingBase || isNaN(op.requiredForce) || isNaN(op.requiredRice) || isNaN(op.turnsRemaining)) {
                            isInvalid = true;
                        } else {
                            // 出撃予定のお城が、イベントなどで別の大名家に奪われていないか
                            const stagingCastle = this.game.getCastle(op.stagingBase);
                            if (!stagingCastle || stagingCastle.ownerClan !== clanId || stagingCastle.legionId !== legionId) {
                                isInvalid = true;
                            }
                        }
                    } else if (op.type === '外交' || op.type === '内政') {
                        if (isNaN(op.turnsRemaining) || isNaN(op.maxTurns)) {
                            isInvalid = true;
                        }
                    }
                }

                // 不正が見つかったら、作戦を白紙に戻して安全に立て直させます
                if (isInvalid) {
                    // ★変更：大名家名や軍団長名を取得して表示します
                    const logInfo = this.getOperationLogInfo(clanId, legionId);
                    console.warn(`【AI自己診断】${logInfo.clanName} (軍団長: ${logInfo.commanderName}) の不正な作戦データ(${op ? op.type : '不明'})を検知したため、破棄しました。`);
                    delete this.operations[clanId][legionId];
                }
            }
        }
    }
    
    async processMonthlyOperations() {
        // ★追加：毎月の作戦会議を始める前に、まず全体の健康診断を行います！
        this.validateAllOperations();

        for (const clan of this.game.clans) {
            if (clan.id === 0 || clan.isDestroyed) continue; // ★滅亡した勢力はスキップします！

            const isPlayerClan = (clan.id === this.game.playerClanId);

            // ★変更：外交などの全体方針は、プレイヤー大名家以外の時だけAIに考えさせます
            if (!isPlayerClan) {
                // ★追加：毎月、同盟や自分を支配している相手への不満を溜める魔法です！
                this.decreaseSentimentForHighTension(clan.id);

                // ★追加：毎月、まずは大名家単位で「誰と外交するか」を考えます！
                this.thinkMonthlyDiplomacy(clan);
            }
            
            if (!this.operations[clan.id]) {
                this.operations[clan.id] = {};
            }
            if (!this.draftBases[clan.id]) {
                this.draftBases[clan.id] = {};
            }

            const myCastles = this.game.castles.filter(c => c.ownerClan === clan.id);
            // ★修正：数値の0と文字の"0"が混ざって重複しないように、必ず数値(Number)に統一します！
            const legionIds = [...new Set(myCastles.map(c => Number(c.legionId || 0)))];

            for (const legionId of legionIds) {
                // ★追加：プレイヤー大名家で、かつ直轄（ID0）の場合は、勝手に作戦を立てないようにスキップします！
                if (isPlayerClan && legionId === 0) continue;

                // ★ここから追加：大目標のカウントと成果チェック
                if (!this.grandObjectives) this.grandObjectives = {};
                if (!this.grandObjectives[clan.id]) this.grandObjectives[clan.id] = {};
                
                const grandObj = this.grandObjectives[clan.id][legionId];
                if (grandObj) {
                    const currentMyCastleCount = this.game.castles.filter(c => c.ownerClan === clan.id).length;
                    
                    // 前月よりも自拠点の数が減っていたら大目標を消去して再考
                    if (currentMyCastleCount < grandObj.prevMyCastleCount) {
                        delete this.grandObjectives[clan.id][legionId];
                    } else {
                        grandObj.prevMyCastleCount = currentMyCastleCount;
                        
                        let currentTargetCount = 0;
                        if (grandObj.type === '大名攻略') {
                            currentTargetCount = this.game.castles.filter(c => c.ownerClan === grandObj.targetClanId).length;
                        } else if (grandObj.type === '国攻略') {
                            currentTargetCount = this.game.castles.filter(c => {
                                if (c.provinceId === grandObj.targetProvId && c.ownerClan !== clan.id) {
                                    const rel = this.game.getRelation(clan.id, c.ownerClan);
                                    return !rel || !['同盟', '支配', '従属', '友好'].includes(rel.status);
                                }
                                return false;
                            }).length;
                        }

                        let shouldCancel = false;

                        // ターゲット拠点が0になったら達成として消去
                        if (currentTargetCount === 0 && (grandObj.type === '大名攻略' || grandObj.type === '国攻略')) {
                            shouldCancel = true;
                        }

                        if (!shouldCancel && grandObj.type === '大名攻略') {
                            const targetClanId = grandObj.targetClanId;
                            const rel = this.game.getRelation(clan.id, targetClanId);
                            // 友好的になっていたら消去
                            if (rel && ['同盟', '支配', '従属', '友好'].includes(rel.status)) {
                                shouldCancel = true;
                            } else {
                                // 道が繋がっているか調べる
                                const myCastles = this.game.castles.filter(c => c.ownerClan === clan.id && c.legionId === legionId);
                                const targetCastles = this.game.castles.filter(c => c.ownerClan === targetClanId);
                                
                                let hasRoute = false;
                                for (const myC of myCastles) {
                                    for (const tgtC of targetCastles) {
                                        // GameSystemのisReachableで経路があるか判定
                                        if (GameSystem.isReachable(this.game, myC, tgtC, clan.id)) {
                                            hasRoute = true;
                                            break;
                                        }
                                    }
                                    if (hasRoute) break;
                                }
                                
                                // 自軍団のどの拠点からも、相手のどの拠点へも道が繋がっていなければ消去
                                if (!hasRoute) {
                                    shouldCancel = true;
                                }
                            }
                        }

                        if (shouldCancel) {
                            delete this.grandObjectives[clan.id][legionId];
                        } else {
                            // 過去の履歴の最後（前月）よりも数が減っていたらターンをリセット
                            if (grandObj.historyTargetCount && grandObj.historyTargetCount.length > 0) {
                                const lastCount = grandObj.historyTargetCount[grandObj.historyTargetCount.length - 1];
                                if (currentTargetCount < lastCount) {
                                    grandObj.turnCount = 24;
                                } else {
                                    grandObj.turnCount--;
                                }
                            } else {
                                grandObj.turnCount--;
                            }
    
                            if (!grandObj.historyTargetCount) grandObj.historyTargetCount = [];
                            grandObj.historyTargetCount.push(currentTargetCount);
                            
                            // 過去24回分毎月覚えておく
                            if (grandObj.historyTargetCount.length > 24) {
                                grandObj.historyTargetCount.shift();
                            }
    
                            // 24ヶ月成果が出なかったら消去
                            if (grandObj.turnCount <= 0) {
                                delete this.grandObjectives[clan.id][legionId];
                            }
                        }
                    }
                }
                // ★ここまで追加

                if (!this.operations[clan.id][legionId]) {
                    await this.generateOperation(clan.id, legionId);
                } else {
                    await this.updateOperation(clan.id, legionId);
                }

                // ★追加：作戦とは別に、毎月「徴兵用のお城」を考えて選びます！
                this.selectDraftBase(clan.id, legionId);
            }
        }
    }

    // ★追加：同盟や支配されている相手に攻撃したいけど友好度が高くて我慢している時に、友好度を1下げる魔法です
    decreaseSentimentForHighTension(clanId) {
        const myPower = this.game.aiEngine.getClanPrestige(clanId);
        const myDaimyo = this.game.bushos.find(b => b.clan === clanId && b.isDaimyo) || { duty: 50 };

        const myClanCastles = this.game.castles.filter(c => c.ownerClan === clanId);
        const neighborCastles = [];
        myClanCastles.forEach(myC => {
            if (myC.adjacentCastleIds) {
                myC.adjacentCastleIds.forEach(adjId => {
                    const adjCastle = this.game.getCastle(adjId);
                    if (adjCastle && adjCastle.ownerClan !== 0 && adjCastle.ownerClan !== clanId) {
                        neighborCastles.push(adjCastle);
                    }
                });
            }
        });

        const adjacentClans = [...new Set(neighborCastles.map(c => c.ownerClan))];

        adjacentClans.forEach(targetClanId => {
            const rel = this.game.getRelation(clanId, targetClanId);
            // 相手が「同盟」か、自分を支配している（自分の視点で相手が「支配」）場合で、友好度が50以上
            // ★追加：ただし、イベントによる関係（isEvent）の場合はストレスを溜めません
            if (rel && (rel.status === '同盟' || rel.status === '支配') && rel.sentiment >= 50 && !rel.isEvent) {
                const targetPower = this.game.aiEngine.getClanPrestige(targetClanId);
                
                let breakScore = 0; 
                let minEnemyPower = -1; 
                
                adjacentClans.forEach(cId => {
                    const r = this.game.getRelation(clanId, cId);
                    if (r && !['同盟', '支配', '従属'].includes(r.status)) {
                        const p = this.game.aiEngine.getClanPrestige(cId);
                        if (minEnemyPower === -1 || p < minEnemyPower) {
                            minEnemyPower = p;
                        }
                    }
                });

                let comparePower = minEnemyPower !== -1 ? minEnemyPower : myPower;
                const powerRatio = targetPower / comparePower;
                
                // 相手が相対的に弱いほど攻撃したくなります
                if (powerRatio < 1.0) {
                    breakScore += (1.0 - powerRatio) * 2.5;
                }
                
                // 自分の義理が低いほど攻撃したくなります
                breakScore += (50 - myDaimyo.duty) * 0.3;

                // 攻撃したいスコア（0より大きい）なら、我慢しているストレスで友好度を1下げます！
                if (breakScore > 0) {
                    this.game.diplomacyManager.updateSentiment(clanId, targetClanId, -0.5);
                }
            }
        });
    }

    // ★ここから追加：徴兵用の拠点を選ぶ魔法です
    selectDraftBase(clanId, legionId) {
        // まずは前の月の記憶を消しておきます
        this.draftBases[clanId][legionId] = null;

        const myClanCastles = this.game.castles.filter(c => c.ownerClan === clanId && c.legionId === legionId);
        // お城が1つしかない時は、輸送できないので選びません！
        if (myClanCastles.length <= 1) return; 

        let startCastleId = null;
        const op = this.operations[clanId][legionId];
        
        // 攻撃作戦中なら、出撃するお城をスタート地点にします
        if (op && op.type === '攻撃' && op.stagingBase) {
            startCastleId = op.stagingBase;
        } else {
            // そうでなければ、お殿様がいるお城をスタート地点にします
            const daimyo = this.game.bushos.find(b => b.clan === clanId && b.isDaimyo);
            if (daimyo && daimyo.castleId) {
                const daimyoCastle = this.game.getCastle(daimyo.castleId);
                if (daimyoCastle && daimyoCastle.legionId === legionId) {
                    startCastleId = daimyo.castleId;
                } else {
                    startCastleId = myClanCastles[0].id;
                }
            } else {
                startCastleId = myClanCastles[0].id;
            }
        }

        const startCastle = this.game.getCastle(startCastleId);
        if (!startCastle) return;

        // スタート地点から、道が繋がっている自分のお城を探し出します（飛び地対策）
        const reachableMyCastles = [];
        const visitedCastles = new Set();
        const searchQueue = [startCastle];
        visitedCastles.add(startCastle.id);

        while (searchQueue.length > 0) {
            const current = searchQueue.shift();
            reachableMyCastles.push(current);

            if (current.adjacentCastleIds) {
                current.adjacentCastleIds.forEach(adjId => {
                    const c = this.game.getCastle(adjId);
                    if (c && c.ownerClan === clanId && c.legionId === legionId && !visitedCastles.has(c.id)) {
                        visitedCastles.add(c.id);
                        searchQueue.push(c);
                    }
                });
            }
        }

        // 繋がっているお城の中から、一番「人口」が多いお城を探します！
        let bestCastle = null;
        let maxPopulation = -1;

        reachableMyCastles.forEach(c => {
            if (c.population > maxPopulation) {
                maxPopulation = c.population;
                bestCastle = c;
            }
        });

        // 決まったら、記憶の箱にしまいます
        if (bestCastle) {
            this.draftBases[clanId][legionId] = bestCastle.id;
        }
    }

    // ★今回追加：毎月1回だけ、大名家として外交の狙いを1つに絞って覚えておく魔法です！
    thinkMonthlyDiplomacy(clan) {
        // 一旦、今までの記憶を忘れます
        clan.currentDiplomacyTarget = null;

        const myClanId = clan.id;
        const myPower = this.game.aiEngine.getClanPrestige(myClanId);
        const myDaimyo = this.game.bushos.find(b => b.clan === myClanId && b.isDaimyo) || { duty: 50, intelligence: 50 };
        const smartness = this.game.aiEngine.getAISmartness(myDaimyo.intelligence);

        // 周りのお城を探します
        const myCastles = this.game.castles.filter(c => c.ownerClan === myClanId);
        const neighborCastles = [];
        myCastles.forEach(myCastle => {
            if (myCastle.adjacentCastleIds) {
                myCastle.adjacentCastleIds.forEach(adjId => {
                    const adjCastle = this.game.getCastle(adjId);
                    if (adjCastle && adjCastle.ownerClan !== 0 && adjCastle.ownerClan !== myClanId) {
                        neighborCastles.push(adjCastle);
                    }
                });
            }
        });

        // まずは直接お隣さんのリストを作ります
        const directNeighbors = [...new Set(neighborCastles.map(c => c.ownerClan))];
        let diplomacyCandidates = [...directNeighbors];

        // ★追加：お隣さんの中で「敵対」している相手がいれば、さらにその向こう隣の勢力もリストに入れます！
        directNeighbors.forEach(neighborId => {
            const rel = this.game.getRelation(myClanId, neighborId);
            if (rel && rel.status === '敵対') {
                const enemyCastles = this.game.castles.filter(c => c.ownerClan === neighborId);
                enemyCastles.forEach(enemyCastle => {
                    if (enemyCastle.adjacentCastleIds) {
                        enemyCastle.adjacentCastleIds.forEach(adjId => {
                            const adjCastle = this.game.getCastle(adjId);
                            // 空き城(0)でもなく、自分でもなく、その敵対勢力自身でもないなら、リストに追加します！
                            if (adjCastle && adjCastle.ownerClan !== 0 && adjCastle.ownerClan !== myClanId && adjCastle.ownerClan !== neighborId) {
                                if (!diplomacyCandidates.includes(adjCastle.ownerClan)) {
                                    diplomacyCandidates.push(adjCastle.ownerClan);
                                }
                            }
                        });
                    }
                });
            }
        });

        // 出来上がったリストを、いつもの名前の箱に入れ直します
        const uniqueNeighbors = diplomacyCandidates;
        if (uniqueNeighbors.length === 0) return;

        const allyCount = this.game.diplomacyManager.getAllyCount(myClanId);
        const enemyThreats = [];
        uniqueNeighbors.forEach(targetClanId => {
            const rel = this.game.getRelation(myClanId, targetClanId);
            const isProtected = rel && this.game.diplomacyManager.isNonAggression(rel.status);
            if (!isProtected) {
                const trueEnemyPower = this.game.aiEngine.getClanPrestige(targetClanId);
                const errorRange = Math.min(0.3, Math.max(0, (100 - myDaimyo.intelligence) / 100 * 0.3));
                const errorRate = 1.0 + (Math.random() - 0.5) * 2 * errorRange;
                enemyThreats.push({ clanId: targetClanId, power: trueEnemyPower * errorRate });
            }
        });
        
        enemyThreats.sort((a, b) => b.power - a.power);
        const mainThreatId = enemyThreats.length > 0 ? enemyThreats[0].clanId : 0; 

        // 優先度が高い順に並べたリストをもらいます
        const diplomacyTargets = this.game.diplomacyManager.getDiplomacyPriorityList(myClanId, uniqueNeighbors, mainThreatId);

        // 順番に見て、最初に「これをやる！」と決めた相手1人を記憶します
        for (let targetData of diplomacyTargets) {
            const targetClanId = targetData.clanId;
            const targetClanTotal = this.game.aiEngine.getClanPrestige(targetClanId);
            const threatData = enemyThreats.find(t => t.clanId === targetClanId);
            const perceivedTargetTotal = threatData ? threatData.power : targetClanTotal;

            // 外交の専門部署に、この相手に何をするか相談します
            const decision = this.game.diplomacyManager.determineAIDiplomacyAction(
                myClanId, targetClanId, myPower, targetClanTotal, perceivedTargetTotal, 
                myDaimyo.duty, smartness, targetData.isStrategicPartner, allyCount, neighborCastles
            );

            // もし「何もしない」以外なら、これを今月の目標に決定します！
            if (decision.action !== 'none') {
                clan.currentDiplomacyTarget = {
                    targetId: targetClanId,
                    action: decision.action,
                    gold: decision.gold
                };
                break; // 1つ決めたら探すのをおしまいにします
            }
        }
    }

    async generateOperation(clanId, legionId) {
        // ★イベント追加：AIの作戦立案前
        if (this.game.eventManager) {
            await this.game.eventManager.processEvents('before_ai_operation', clanId);
        }

        const myClanCastles = this.game.castles.filter(c => c.ownerClan === clanId && c.legionId === legionId);
        if (myClanCastles.length === 0) return;

        const startY = Number(this.game.gameStartYear || window.MainParams.StartYear || 1560);
        const startM = Number(this.game.gameStartMonth || window.MainParams.StartMonth || 1);
        const currentY = Number(this.game.year);
        const currentM = Number(this.game.month);
        const elapsedTurns = ((currentY - startY) * 12) + (currentM - startM);
        
        if (isNaN(elapsedTurns) || elapsedTurns < 3) {
            this.setInternalOperation(clanId, legionId);
            return;
        }
        
        // 親大名がいるか探します
        let myBossId = 0;
        for (const c of this.game.clans) {
            if (c.id !== clanId) {
                const r = this.game.getRelation(clanId, c.id);
                if (r && r.status === '従属') {
                    myBossId = c.id;
                    break;
                }
            }
        }

        // ★追加：周りの敵対勢力の数を数えます！
        const adjacentEnemyClans = new Set();

        for (const myCastle of myClanCastles) {
            if (myCastle.adjacentCastleIds) {
                for (const adjId of myCastle.adjacentCastleIds) {
                    const adjCastle = this.game.getCastle(adjId);
                    // 空き城(0)ではなく、自分の家でもないお城を調べます
                    if (adjCastle && adjCastle.ownerClan !== 0 && adjCastle.ownerClan !== clanId) {
                        const rel = this.game.getRelation(clanId, adjCastle.ownerClan);
                        if (rel && rel.status === '敵対') {
                            adjacentEnemyClans.add(adjCastle.ownerClan);
                        }
                    }
                }
            }
        }

        const enemyCount = adjacentEnemyClans.size;

        // 攻撃作戦の候補を全部記録しておく箱を用意します
        let operationCandidates = [];

        // ★大雪が降っている国（provinceId）のリストを最初に作っておきます！
        const heavySnowProvIds = new Set();
        this.game.provinces.forEach(p => {
            if (p.statusEffects && p.statusEffects.includes('heavySnow')) {
                heavySnowProvIds.add(p.id);
            }
        });

        // 大名家のすべてのお城を順番に見て、一番攻めやすい場所を探します！
        for (const myCastle of myClanCastles) {
            // プレイヤーの委任城で攻撃禁止なら飛ばします
            if (clanId === this.game.playerClanId && myCastle.isDelegated && !myCastle.allowAttack) {
                continue;
            }

            // ★出撃する自分のお城が大雪の時は、出陣できないので重い計算をスパッと飛ばします！
            if (heavySnowProvIds.has(myCastle.provinceId)) {
                continue;
            }

            const myGeneral = this.game.getBusho(myCastle.castellanId);
            if (!myGeneral || myGeneral.isActionDone) continue; 

            // ★飛び地対応＆超高速化：このお城から「自領だけを通って」辿り着ける敵城を直接探し出します！
            const neighbors = [];
            const visited = new Set();
            const queue = [{ castle: myCastle, distance: 0 }];
            visited.add(myCastle.id);

            while (queue.length > 0) {
                const currentData = queue.shift();
                const current = currentData.castle;
                const currentDist = currentData.distance;

                if (current.adjacentCastleIds) {
                    current.adjacentCastleIds.forEach(adjId => {
                        if (!visited.has(adjId)) {
                            visited.add(adjId);
                            const adjCastle = this.game.getCastle(adjId);
                            if (adjCastle) {
                                if (adjCastle.ownerClan === clanId && adjCastle.legionId === legionId) {
                                    // 自領ならさらに奥へ進めます
                                    queue.push({ castle: adjCastle, distance: currentDist + 1 });
                                } else if (adjCastle.ownerClan !== clanId) {
                                    // 自領以外（敵や空き城）なら、そこが攻撃可能な目標です！
                                    neighbors.push(adjCastle);
                                }
                            }
                        }
                    });
                }
            }

            const validEnemies = neighbors.filter(target => {
                let isDirectlyAdjacent = false;
                if (target.adjacentCastleIds) {
                    isDirectlyAdjacent = target.adjacentCastleIds.some(adjId => {
                        const adjCastle = this.game.getCastle(adjId);
                        return adjCastle && adjCastle.ownerClan === clanId && adjCastle.legionId === legionId;
                    });
                }
                if (!isDirectlyAdjacent) return false;

                if (target.ownerClan === 0) {
                    if ((target.immunityUntil || 0) >= this.game.getCurrentTurnId()) return false;
                    return true;
                }
                
                const rel = this.game.getRelation(clanId, target.ownerClan);
                const isProtected = rel && this.game.diplomacyManager.isNonAggression(rel.status);
                
                // ★書き換え：同盟国と従属先も、破棄して攻撃する候補として特別に入れます！
                // ただし和睦期間中や、自分が支配している相手には攻め込みません
                if (isProtected) {
                    if (rel.status === '和睦' || rel.status === '支配') return false; 
                } else if ((target.immunityUntil || 0) >= this.game.getCurrentTurnId()) {
                    return false;
                }

                if (myBossId !== 0) {
                    const bossRel = this.game.getRelation(myBossId, target.ownerClan);
                    if (bossRel && this.game.diplomacyManager.isNonAggression(bossRel.status)) {
                        return false;
                    }
                }
                return true;
            });

            // 諸勢力も敵のリストに入れます
            if (!myCastle.isDelegated) {
                const kunishusInCastle = this.game.kunishuSystem.getKunishusInCastle(myCastle.id).filter(k => k.getRelation(clanId) <= 30);
                kunishusInCastle.forEach(k => {
                    validEnemies.push({
                        isKunishuTarget: true,
                        kunishu: k,
                        id: myCastle.id, // お城のID
                        ownerClan: -1,
                        soldiers: k.soldiers,
                        defense: k.defense,
                        name: k.getName(this.game)
                    });
                });
            }

            // 敵がいたら、ai.jsの戦力分析を使って点数をつけてもらいます！
            if (validEnemies.length > 0) {
                const decision = this.game.aiEngine.decideAttackTarget(myCastle, myGeneral, validEnemies);
                
                // 点数がついたら、とりあえず候補の箱に入れておきます
                if (decision && decision.score > 0) {
                    let finalScore = decision.score;

                    // ★ここから追加：大目標に合致する目標なら、スコアを大幅にアップ（ただし絶対ではない程度）
                    const myGrandObj = (this.grandObjectives && this.grandObjectives[clanId] && this.grandObjectives[clanId][legionId]) 
                                        ? this.grandObjectives[clanId][legionId] : null;

                    if (myGrandObj) {
                        let isTargetMatch = false;
                        if (!decision.target.isKunishuTarget) {
                            if (myGrandObj.type === '大名攻略' && decision.target.ownerClan === myGrandObj.targetClanId) {
                                isTargetMatch = true;
                            } else if (myGrandObj.type === '国攻略' && decision.target.provinceId === myGrandObj.targetProvId) {
                                isTargetMatch = true;
                            }
                        } else {
                            // 諸勢力の場合、お城の国（provinceId）で判定します
                            if (myGrandObj.type === '国攻略' && myCastle.provinceId === myGrandObj.targetProvId) {
                                isTargetMatch = true;
                            }
                        }

                        if (isTargetMatch) {
                            // 100%ではない絶妙なバランスでスコアを引き上げます（+40点）
                            finalScore += 40;
                        }
                    }
                    // ★ここまで追加

                    operationCandidates.push({
                        castleId: myCastle.id,
                        target: decision.target,
                        sendSoldiers: decision.sendSoldiers,
                        sendRice: decision.sendRice,
                        score: finalScore
                    });
                }
            }
        }

        // 候補の箱をスコアの高い順に並べ替えます！
        operationCandidates.sort((a, b) => b.score - a.score);

        // ★追加：攻撃目標のスコア順から、調略の第一～第三目標を抽出します！
        const myDaimyo = this.game.bushos.find(b => b.clan === clanId && b.isDaimyo) || { intelligence: 50 };
        const myDaimyoInt = myDaimyo.intelligence;
        
        let maxSabotageTargets = 1; // 智謀69以下は第一目標まで
        if (myDaimyoInt >= 90) maxSabotageTargets = 3; // 智謀90以上は第三目標まで
        else if (myDaimyoInt >= 70) maxSabotageTargets = 2; // 智謀70～89は第二目標まで

        let sabotageTargets = [];
        let addedCastleIds = new Set();

        for (const cand of operationCandidates) {
            if (cand.target.isKunishuTarget) continue; // 諸勢力は除外
            if (cand.target.ownerClan === 0) continue; // 空き城は除外
            
            // 同盟・支配・従属・和睦関係ではないかをチェック
            const rel = this.game.getRelation(clanId, cand.target.ownerClan);
            const isProtected = rel && ['同盟', '支配', '従属', '和睦'].includes(rel.status);
            
            if (!isProtected && !addedCastleIds.has(cand.target.id)) {
                // 城IDとその城を所有している大名家IDをセットで記憶します
                sabotageTargets.push({
                    castleId: cand.target.id,
                    clanId: cand.target.ownerClan
                });
                addedCastleIds.add(cand.target.id);
                
                // 上限に達したら探すのをやめます
                if (sabotageTargets.length >= maxSabotageTargets) break;
            }
        }

        // 敵が2つ以上いたら「外交作戦」を考えます！
        if (enemyCount >= 2) {
            // 1年（12ヶ月）の間にどれくらいの確率で立案するかを決めます
            let yearlyProb = 0;
            if (enemyCount === 2) yearlyProb = 0.10;      // 2勢力：ごくまれ (10%)
            else if (enemyCount === 3) yearlyProb = 0.20; 
            else if (enemyCount === 4) yearlyProb = 0.35; 
            else if (enemyCount === 5) yearlyProb = 0.50; // 5勢力：そこそこ (50%)
            else if (enemyCount === 6) yearlyProb = 0.65; 
            else if (enemyCount >= 7) yearlyProb = 0.80;  // 7勢力以上：かなりの高確率 (80%)

            // 12ヶ月で上の確率になるように、1ヶ月あたりのサイコロの確率を計算する魔法です！
            const monthlyProb = 1 - Math.pow(1 - yearlyProb, 1 / 12);

            // サイコロを振ります！
            if (Math.random() < monthlyProb) {
                // 期間の計算：敵が2勢力なら3ヶ月。そこから敵が2つ増えるごとに1ヶ月プラスします
                const duration = 3 + Math.floor((enemyCount - 2) / 2);
                
                this.operations[clanId][legionId] = {
                    type: '外交',
                    sabotageTargets: sabotageTargets, // ★変更：新しく作った調略目標を記憶させます
                    turnsRemaining: 0, // すぐに実行するので準備期間はゼロです
                    maxTurns: duration,
                    status: '実行中'
                };
                // ★変更：大名家名や軍団長名、大目標を取得してコンソールに出力します
                const logInfo = this.getOperationLogInfo(clanId, legionId);
                console.log(`${logInfo.clanName} (軍団長: ${logInfo.commanderName}) が【外交作戦】を立案しました！(大目標: ${logInfo.grandObjStr}, 隣接敵対: ${enemyCount}勢力, 期間: ${duration}ヶ月, 調略目標: ${sabotageTargets.length}件)`);
                return; // 外交作戦が決まったら、今回の作戦会議はこれでおしまいです
            }
        }

        let attackTargets = [];
        let highestScore = -1;
        
        // ★追加：大名の智謀に合わせて、攻撃目標をいくつまで覚えるか（最大1～3個）決めます
        let maxAttackTargets = 1;
        if (myDaimyoInt >= 90) maxAttackTargets = 3;
        else if (myDaimyoInt >= 70) maxAttackTargets = 2;

        // 候補の箱の中から、点数が高い作戦を順番に見つけます！
        if (operationCandidates.length > 0) {
            // ★変更：最高の作戦を1つだけでなく、複数見つけるようにループの条件を変えます
            for (const cand of operationCandidates) {
                let supportBaseId = null;
                const targetId = cand.target.isKunishuTarget ? cand.target.kunishu.id : cand.target.id;
                const isKunishuTarget = cand.target.isKunishuTarget === true;

                // ★追加：すでに同じ目標がリストに入っていたら、飛ばして次を探します
                const isAlreadyAdded = attackTargets.some(t => t.targetId === targetId && t.isKunishuTarget === isKunishuTarget);
                if (isAlreadyAdded) continue;

                const sameTargetCands = operationCandidates.filter(c => {
                    const cTargetId = c.target.isKunishuTarget ? c.target.kunishu.id : c.target.id;
                    const cIsKunishu = c.target.isKunishuTarget === true;
                    return cTargetId === targetId && cIsKunishu === isKunishuTarget && c.castleId !== cand.castleId;
                });

                if (sameTargetCands.length > 0) {
                    supportBaseId = sameTargetCands[0].castleId; // 同じ目標への点数が2番目に高かった城
                } else {
                    // 同じ目標に届く他の城がなかった場合、出撃元のお隣の城（自領）を予備として選ぶ魔法
                    const stagingCastle = this.game.getCastle(cand.castleId);
                    if (stagingCastle && stagingCastle.adjacentCastleIds) {
                        const adjMyCastles = stagingCastle.adjacentCastleIds
                            .map(id => this.game.getCastle(id))
                            .filter(c => c && c.ownerClan === clanId && c.legionId === legionId)
                            .sort((a, b) => (b.soldiers + b.defense) - (a.soldiers + a.defense));
                        if (adjMyCastles.length > 0) {
                            supportBaseId = adjMyCastles[0].id;
                        }
                    }
                }

                // 最初の（一番点数が高い）作戦の点数を記録しておきます
                if (highestScore === -1) {
                    highestScore = cand.score;
                }
                
                // ★追加：敵との戦力差（見込み）を計算して、準備期間を決めます！
                const enemyForce = cand.target.isKunishuTarget ? 
                    (cand.target.kunishu.soldiers + cand.target.kunishu.defense) : 
                    (cand.target.soldiers + cand.target.defense);
                const myForce = this.game.getCastle(cand.castleId).soldiers;
                const ratio = enemyForce / Math.max(1, myForce); // 敵の戦力が自分の何倍か？

                let prepTurns = 4;
                if (ratio <= 0.25) {
                    prepTurns = 0; // 敵が1/4以下なら0ヶ月（すぐに実行）
                } else if (ratio >= 1.3) {
                    prepTurns = 6; // 敵が1.3倍以上なら6ヶ月
                } else {
                    // その間なら、なめらかに0〜6ヶ月の間で計算します
                    prepTurns = Math.round(((ratio - 0.25) / 1.05) * 6);
                }
                
                // ★雪国かどうかを判定して「越冬」の準備をします
                // 陸奥、出羽、越後、越中、越前、加賀、能登、若狭、信濃、上野、下野、飛騨、佐渡、蝦夷
                const snowProvs = [1, 2, 3, 4, 5, 6, 7, 8, 10, 11, 12, 28, 65, 67];
                const myCastle = this.game.getCastle(cand.castleId);
                const targetProvId = cand.target.isKunishuTarget ? myCastle.provinceId : cand.target.provinceId;
                
                const isSnowArea = snowProvs.includes(myCastle.provinceId) || snowProvs.includes(targetProvId);
                
                if (isSnowArea) {
                    let execMonth = (this.game.month + prepTurns) % 12;
                    if (execMonth === 0) execMonth = 12;
                    
                    while (execMonth === 12 || execMonth === 1 || execMonth === 2) {
                        prepTurns++;
                        execMonth = (this.game.month + prepTurns) % 12;
                        if (execMonth === 0) execMonth = 12;
                    }
                }
                
                // ★変更：作戦をリストの箱にしまいます
                attackTargets.push({
                    targetId: targetId, 
                    isKunishuTarget: isKunishuTarget,
                    stagingBase: cand.castleId,
                    supportBase: supportBaseId,
                    requiredForce: cand.sendSoldiers, 
                    requiredRice: cand.sendRice,      
                    turnsRemaining: prepTurns, 
                    maxTurns: prepTurns + 3
                });

                // ★変更：決めた数（最大1～3個）まで目標を見つけたら、探すのをやめます
                if (attackTargets.length >= maxAttackTargets) break;
            }
        }

        // すべてのお城を見終わって、もし攻撃の作戦が見つかっていたらサイコロを振ります！
        if (attackTargets.length > 0) {
            // 第一目標のデータを取り出します
            const firstTarget = attackTargets[0];
            
            // ★追加：目標が「兵糧攻め状態」かどうかを調べます！
            let isTargetStarving = false;
            // 諸勢力ではなく、通常のお城を狙う時だけ確認します
            if (!firstTarget.isKunishuTarget) {
                const targetCastle = this.game.getCastle(firstTarget.targetId);
                if (targetCastle && targetCastle.statusEffects && targetCastle.statusEffects.includes('糧攻')) {
                    isTargetStarving = true; // 兵糧攻め状態ならシールを貼っておきます
                }
            }
            
            // ★追加：一番点数が高かった出撃元のお城の兵士数が、√石高×200以上あるかチェックします！
            const stagingCastle = this.game.getCastle(firstTarget.stagingBase);
            if (stagingCastle) {
                const requiredSoldiers = Math.sqrt(stagingCastle.kokudaka) * 200;
                // ★変更：目標が兵糧攻め状態ではない時だけ、兵士不足の足切りを行います！
                if (!isTargetStarving && stagingCastle.soldiers < requiredSoldiers) {
                    // 兵士が足りない場合は、この月の攻撃作戦を諦めて内政にします
                    this.setInternalOperation(clanId, legionId, sabotageTargets);
                    return;
                }
            }

            // ai.jsでやっていた確率のサイコロをここで振って、やるかどうか決めます
            // 調整：highestScore（点数）を 1.5倍 にして、作戦を実行しやすくします！
            if (Math.random() * 100 < (highestScore * 1.5)) {
                this.operations[clanId][legionId] = {
                    type: '攻撃',
                    attackTargets: attackTargets, // ★追加：第一～第三までの目標リストを全部記憶します
                    targetId: firstTarget.targetId, 
                    isKunishuTarget: firstTarget.isKunishuTarget,
                    stagingBase: firstTarget.stagingBase,
                    supportBase: firstTarget.supportBase,
                    requiredForce: firstTarget.requiredForce, 
                    requiredRice: firstTarget.requiredRice,      
                    assignedUnits: [], 
                    turnsRemaining: firstTarget.turnsRemaining, 
                    maxTurns: firstTarget.maxTurns,   
                    status: firstTarget.turnsRemaining <= 0 ? '実行中' : '準備中',
                    sabotageTargets: sabotageTargets
                };

                // ★ここから追加：攻撃作戦が決まった時に、大目標を決定します！
                if (!this.grandObjectives) this.grandObjectives = {};
                if (!this.grandObjectives[clanId]) this.grandObjectives[clanId] = {};
                
                const targetCastle = this.game.getCastle(firstTarget.targetId);
                if (targetCastle) {
                    const myTotalSoldiers = this.game.getClanTotalSoldiers(clanId);
                    const targetClanId = targetCastle.ownerClan;
                    const targetProvId = targetCastle.provinceId;
                    
                    // 初期値を '拠点攻略' から null に変更します
                    let objectiveType = null; 

                    // 攻撃先が空き拠点(IDが0)や諸勢力でない場合
                    if (targetClanId !== 0 && !firstTarget.isKunishuTarget) {
                        const targetClanTotalSoldiers = this.game.getClanTotalSoldiers(targetClanId);
                        if (myTotalSoldiers > targetClanTotalSoldiers) {
                            objectiveType = '大名攻略';
                        }
                    }

                    // 大名攻略にならなかった場合、国攻略の判定
                    // !objectiveType（nullの時）だけ計算を行います
                    if (!objectiveType && !firstTarget.isKunishuTarget && targetProvId > 0) {
                        let enemyProvSoldiers = 0;
                        this.game.castles.forEach(c => {
                            if (c.provinceId === targetProvId && c.ownerClan !== clanId) {
                                const rel = this.game.getRelation(clanId, c.ownerClan);
                                if (!rel || !['同盟', '支配', '従属', '友好'].includes(rel.status)) {
                                    enemyProvSoldiers += c.soldiers;
                                }
                            }
                        });

                        if (myTotalSoldiers > enemyProvSoldiers) {
                            objectiveType = '国攻略';
                        }
                    }

                    // ★objectiveTypeがセットされている時だけ、大目標を記録します
                    if (objectiveType) {
                        let initialTargetCount = 0;
                        if (objectiveType === '大名攻略') {
                            initialTargetCount = this.game.castles.filter(c => c.ownerClan === targetClanId).length;
                        } else if (objectiveType === '国攻略') {
                            initialTargetCount = this.game.castles.filter(c => {
                                if (c.provinceId === targetProvId && c.ownerClan !== clanId) {
                                    const rel = this.game.getRelation(clanId, c.ownerClan);
                                    return !rel || !['同盟', '支配', '従属', '友好'].includes(rel.status);
                                }
                                return false;
                            }).length;
                        }
                        
                        const myCastleCount = this.game.castles.filter(c => c.ownerClan === clanId).length;
                        
                        this.grandObjectives[clanId][legionId] = {
                            type: objectiveType,
                            targetClanId: targetClanId,
                            targetProvId: targetProvId,
                            turnCount: 24, // 24ターン（2年間）待機
                            historyTargetCount: [initialTargetCount], // 過去24回分を毎月覚える箱
                            prevMyCastleCount: myCastleCount // 前月分の自拠点数
                        };
                    }
                }
                // ★ここまで追加

                // ★変更：大名家名や軍団長名、大目標、具体的な攻撃先や出撃元の名前を取得して出力します
                const logInfo = this.getOperationLogInfo(clanId, legionId);
                let targetName = "不明な目標";
                if (firstTarget.isKunishuTarget) {
                    const kunishu = this.game.kunishuSystem.getKunishu(firstTarget.targetId);
                    targetName = kunishu ? kunishu.getName(this.game) : "不明な諸勢力";
                } else {
                    const tCastle = this.game.getCastle(firstTarget.targetId);
                    targetName = tCastle ? tCastle.name : "不明な拠点";
                }
                const stagingCastle = this.game.getCastle(firstTarget.stagingBase);
                const stagingName = stagingCastle ? stagingCastle.name : "不明な拠点";

                console.log(`${logInfo.clanName} (軍団長: ${logInfo.commanderName}) が ${targetName} への【攻撃作戦】を立案しました！(大目標: ${logInfo.grandObjStr}, 第一出撃元: ${stagingName}, 準備: ${firstTarget.turnsRemaining}ヶ月)`);
                return;
            }
        }

        // 攻撃する場所がなかったり、サイコロに外れたら、おとなしく内政作戦にします
        this.setInternalOperation(clanId, legionId, sabotageTargets);
    }

    setInternalOperation(clanId, legionId, sabotageTargets = []) {
        this.operations[clanId][legionId] = {
            type: '内政',
            targetId: null,
            sabotageTargets: sabotageTargets, // ★変更：新しく作った調略目標を記憶させます
            isKunishuTarget: false,
            stagingBase: null,
            requiredForce: 0,
            requiredRice: 0,
            assignedUnits: [],
            turnsRemaining: 1, // 内政はすぐに実行中になります
            maxTurns: 1,
            status: '準備中'
        };
        // ★変更：大名家名や軍団長名、大目標を取得して出力します
        const logInfo = this.getOperationLogInfo(clanId, legionId);
        console.log(`${logInfo.clanName} (軍団長: ${logInfo.commanderName}) は今月、【内政作戦】を行います。(大目標: ${logInfo.grandObjStr}, 調略目標: ${sabotageTargets.length}件)`);
    }

    async updateOperation(clanId, legionId) {
        const op = this.operations[clanId][legionId];
        // ★変更：大名家名や軍団長名、大目標を最初に取得しておきます
        const logInfo = this.getOperationLogInfo(clanId, legionId);

        // 1. 期限切れのチェック
        op.maxTurns--;
        if (op.maxTurns <= 0) {
            console.log(`${logInfo.clanName} (軍団長: ${logInfo.commanderName}) の作戦【${op.type}】は期限切れで中止されました。(大目標: ${logInfo.grandObjStr})`);
            delete this.operations[clanId][legionId];
            await this.generateOperation(clanId, legionId);
            return;
        }

        // 2. 準備中の場合
        if (op.status === '準備中') {
            // ★今後の拡張：ここで武将を集める命令を出します。
            
            // 今回はカウントダウンを進めるだけです
            op.turnsRemaining--;
            if (op.turnsRemaining <= 0) {
                op.status = '実行中';
                console.log(`${logInfo.clanName} (軍団長: ${logInfo.commanderName}) の作戦【${op.type}】の準備が完了し、実行フェーズに入りました！`);
            } else if (op.type === '攻撃') {
                // ★追加：作戦の具体的な目標拠点や出撃元の名前を取得します
                let targetName = "不明な目標";
                if (op.isKunishuTarget) {
                    const kunishu = this.game.kunishuSystem.getKunishu(op.targetId);
                    targetName = kunishu ? kunishu.getName(this.game) : "不明な諸勢力";
                } else {
                    const tCastle = this.game.getCastle(op.targetId);
                    targetName = tCastle ? tCastle.name : "不明な拠点";
                }
                const stagingCastle = this.game.getCastle(op.stagingBase);
                const stagingName = stagingCastle ? stagingCastle.name : "不明な拠点";

                // ★追加：まだ準備中の場合（カウントダウンが0より大きい時）にログを出します
                console.log(`${logInfo.clanName} (軍団長: ${logInfo.commanderName}) は ${targetName} への【攻撃作戦】を準備中です。(大目標: ${logInfo.grandObjStr}, 出撃元: ${stagingName}, 残り準備期間: ${op.turnsRemaining}ヶ月)`);
            }
        }
    }
    
    // ★追加：コンソール表示用に大名家名、軍団長名、大目標をまとめて取得する魔法です！
    getOperationLogInfo(clanId, legionId) {
        const clan = this.game.clans.find(c => c.id === clanId);
        const clanName = clan ? clan.name : "不明な大名家";

        let commanderName = "不明";
        if (legionId === 0) {
            const daimyo = this.game.bushos.find(b => b.clan === clanId && b.isDaimyo);
            commanderName = daimyo ? daimyo.name : "大名直轄";
        } else {
            const legion = this.game.legions ? this.game.legions.find(l => l.clanId === clanId && l.legionNo === legionId) : null;
            if (legion && legion.commanderId) {
                const commander = this.game.getBusho(legion.commanderId);
                commanderName = commander ? commander.name : "不明";
            }
        }

        let grandObjStr = "なし";
        if (this.grandObjectives && this.grandObjectives[clanId] && this.grandObjectives[clanId][legionId]) {
            const obj = this.grandObjectives[clanId][legionId];
            if (obj.type === '大名攻略') {
                const targetClan = this.game.clans.find(c => c.id === obj.targetClanId);
                grandObjStr = targetClan ? `【${targetClan.name}の攻略】` : "【不明な大名の攻略】";
            } else if (obj.type === '国攻略') {
                const targetProv = this.game.provinces.find(p => p.id === obj.targetProvId);
                grandObjStr = targetProv ? `【${targetProv.province}の統一】` : "【不明な国の攻略】";
            }
        }

        return { clanName, commanderName, grandObjStr };
    }
    
}