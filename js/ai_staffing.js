/**
 * ai_staffing.js - 武将移動・配置システム
 * 責務: 大名家全体の戦略、拠点の重要度、武将の能力タイプに基づいた移動先の決定
 */

class AIStaffing {    
    // 大名のお引越し先を考えます（お金や兵士の分配、お供の随伴機能付き！）
    relocateDaimyo(castle, castellan) {
        const clanId = castle.ownerClan;
        const daimyo = castellan; // castellanは大名自身です
        
        // このお城に大名がいないなら、お引越しの判定はしません
        if (!daimyo || !daimyo.isDaimyo || daimyo.castleId !== castle.id) return false;

        // 自分が移動できるお城（自領で繋がっている城）のリストを作ります
        const reachableMyCastles = [];
        const visitedCastles = new Set();
        const searchQueue = [castle];
        visitedCastles.add(castle.id);

        while (searchQueue.length > 0) {
            const current = searchQueue.shift();
            reachableMyCastles.push(current);

            const adjMyCastles = this.game.castles.filter(c => 
                c.ownerClan === clanId && 
                GameSystem.isAdjacent(current, c) &&
                !visitedCastles.has(c.id)
            );

            for (const n of adjMyCastles) {
                visitedCastles.add(n.id);
                searchQueue.push(n);
            }
        }

        if (reachableMyCastles.length <= 1) return false;

        let bestCastle = castle; // まずは「今いるお城」を一番良いお城（基準）としておきます
        let bestScore = 0; // 今のお城の点数は基準なので「0点」です

        // ★追加：攻撃作戦の出撃元（前線拠点）の出席番号と、性格によるボーナス点数を調べます
        let stagingBaseId = null;
        let operationBonus = 0;
        
        const myOp = this.game.aiOperationManager.operations[clanId];
        if (myOp && myOp.type === '攻撃') {
            stagingBaseId = myOp.stagingBase;
            if (daimyo.personality === 'aggressive') {
                operationBonus = 60;
            } else if (daimyo.personality === 'balanced') {
                operationBonus = 30;
            }
        }

        // ★追加：もし「今いるお城」が攻撃作戦の出撃元なら、基準の点数にボーナスを足しておきます！
        if (stagingBaseId !== null && castle.id === stagingBaseId) {
            bestScore += operationBonus;
        }

        // 自分が移動できるお城（自領で繋がっているお城）を順番に調べて、点数をつけていきます
        for (const target of reachableMyCastles) {
            // 今いるお城は調べる必要がないので飛ばします
            if (target.id === castle.id) continue;

            let score = 0;

            // ★追加：もしこのお城が、攻撃作戦の出撃元なら、ボーナスをあげます！
            if (stagingBaseId !== null && target.id === stagingBaseId) {
                score += operationBonus;
            }

            // 1. 最大石高の点数計算（2倍で+30点、半分で-30点）
            // ※0で割り算するとエラーになってしまうので、最低でも1になるように守ってあげます
            const baseMaxKoku = Math.max(1, castle.maxKokudaka);
            const rateMaxKoku = target.maxKokudaka / baseMaxKoku; // 今のお城の何倍あるか？を計算します
            if (rateMaxKoku >= 1.0) {
                score += (rateMaxKoku - 1.0) * 30; // 1倍より大きければ、増えた分だけプラスします
            } else {
                score += (rateMaxKoku - 1.0) * 60; // 0.5倍（半分）の時にちょうど-30点になるように、60をかけます
            }

            // 2. 最大防御力の点数計算（2倍で+30点、半分で-30点）
            const baseMaxDef = Math.max(1, castle.maxDefense);
            const rateMaxDef = target.maxDefense / baseMaxDef;
            if (rateMaxDef >= 1.0) {
                score += (rateMaxDef - 1.0) * 30;
            } else {
                score += (rateMaxDef - 1.0) * 60;
            }

            // 3. 現在石高の点数計算（2倍で+50点、半分で-50点）
            const baseKoku = Math.max(1, castle.kokudaka);
            const rateKoku = target.kokudaka / baseKoku;
            if (rateKoku >= 1.0) {
                score += (rateKoku - 1.0) * 50;
            } else {
                score += (rateKoku - 1.0) * 100; // 0.5倍（半分）の時にちょうど-50点になるように、100をかけます
            }

            // 4. 現在防御力の点数計算（2倍で+50点、半分で-50点）
            const baseDef = Math.max(1, castle.defense);
            const rateDef = target.defense / baseDef;
            if (rateDef >= 1.0) {
                score += (rateDef - 1.0) * 50;
            } else {
                score += (rateDef - 1.0) * 100;
            }

            // 全部の点数を足して、今までの最高得点よりも高かったらメモを書き換えます！
            if (score > bestScore) {
                bestScore = score;
                bestCastle = target;
            }
        }

        // 一番良いお城が「今の城」でなければ、お引越しを実行！
        if (bestCastle && bestCastle.id !== castle.id) {
            // ==========================================
            // 仲良しのお供（武将）を連れて行きます
            // ==========================================
            const castleBushos = this.game.getCastleBushos(castle.id).filter(b => b.status !== 'ronin' && b.id !== castellan.id);
            const keepCount = Math.max(3, Math.ceil(castleBushos.length * 0.4));
            
            castleBushos.sort((a, b) => {
                const aFactionScore = (a.factionId === castellan.factionId && a.factionId !== 0) ? -200 : 0;
                const bFactionScore = (b.factionId === castellan.factionId && b.factionId !== 0) ? -200 : 0;
                const aScore = a.leadership + a.strength + aFactionScore;
                const bScore = b.leadership + b.strength + bFactionScore;
                return bScore - aScore; 
            });

            const movers = castleBushos.slice(keepCount);
            movers.forEach(mover => {
                if (this.game.factionSystem && this.game.factionSystem.handleMove) {
                    this.game.factionSystem.handleMove(mover, castle.id, bestCastle.id);
                }
                this.game.affiliationSystem.moveCastle(mover, bestCastle.id);
                mover.isActionDone = true; 
            });

            // 大名自身も移動します
            if (this.game.factionSystem && this.game.factionSystem.handleMove) {
                this.game.factionSystem.handleMove(castellan, castle.id, bestCastle.id);
            }
            this.game.affiliationSystem.moveCastle(castellan, bestCastle.id);
            castellan.isActionDone = true;
            
            return true; // 引越し完了の合図
        }

        return false; // 引越ししなかった合図
    }
    
    constructor(game) {
        this.game = game;
        this.evaluationCache = {};
        this.lastMonth = -1;
    }

    // 毎月、古いメモ（キャッシュ）を消して新しく調べ直す準備をします
    clearCacheIfNeeded() {
        if (this.game.month !== this.lastMonth) {
            this.evaluationCache = {};
            this.lastMonth = this.game.month;
        }
    }

    // 大名家の武将たちを、能力ごとにグループ分けします
    evaluateBushos(clanId) {
        if (!this.evaluationCache[clanId]) {
            this.evaluationCache[clanId] = {};
        }
        if (this.evaluationCache[clanId].bushoTypes) {
            return this.evaluationCache[clanId].bushoTypes;
        }

        const myBushos = this.game.bushos.filter(b => b.clan === clanId && b.status !== 'dead' && b.status !== 'unborn');
        
        let totalSum = 0;
        let highestTotal = 0;
        let lowestTotal = 9999;
        
        // 全員の能力の合計点を調べます（1.5倍にする前の素の合計点で計算します）
        const bushoStats = myBushos.map(b => {
            const total = b.leadership + b.strength + b.politics + b.diplomacy + b.intelligence;
            totalSum += total;
            if (total > highestTotal) highestTotal = total;
            if (total < lowestTotal) lowestTotal = total;
            return { busho: b, total: total };
        });

        const avgTotal = myBushos.length > 0 ? totalSum / myBushos.length : 0;
        
        // 上位20%と下位20%の基準点を決めます
        bushoStats.sort((a, b) => b.total - a.total);
        const top20Index = Math.max(0, Math.floor(myBushos.length * 0.2) - 1);
        const bottom20Index = Math.min(myBushos.length - 1, Math.floor(myBushos.length * 0.8));
        const top20Threshold = bushoStats[top20Index] ? bushoStats[top20Index].total : 0;
        const bottom20Threshold = bushoStats[bottom20Index] ? bushoStats[bottom20Index].total : 0;

        // 各能力の平均点も調べます（特化型を見つけるため）
        let sums = { ldr: 0, str: 0, pol: 0, dip: 0, int: 0 };
        myBushos.forEach(b => {
            sums.ldr += b.leadership; sums.str += b.strength;
            sums.pol += b.politics; sums.dip += b.diplomacy; sums.int += b.intelligence;
        });
        const avgs = {
            ldr: sums.ldr / myBushos.length, str: sums.str / myBushos.length,
            pol: sums.pol / myBushos.length, dip: sums.dip / myBushos.length, int: sums.int / myBushos.length
        };

        const types = new Map();

        myBushos.forEach(b => {
            const stat = bushoStats.find(s => s.busho.id === b.id);
            const t = stat.total;
            let type = 'バランス型';

            // 万能型（エース）：上位20%かつ最高値の85%以上
            if (t >= top20Threshold && t >= highestTotal * 0.85) {
                type = '万能型';
            }
            // 無能型（留守番）：下位20%かつ平均の80%以下
            else if (t <= bottom20Threshold && t <= avgTotal * 0.8) {
                type = '無能型';
            }

            // 特化型（一芸の星）：特定の能力が平均の1.2倍以上（上位10%の代用として平均との差を強く見ます）
            const isSpecialist = (b.leadership >= avgs.ldr * 1.2) ||
                                 (b.strength >= avgs.str * 1.2) ||
                                 (b.politics >= avgs.pol * 1.2) ||
                                 (b.diplomacy >= avgs.dip * 1.2) ||
                                 (b.intelligence >= avgs.int * 1.2);
            
            // 特化型は万能型などと重ねてシールを貼ります
            types.set(b.id, { mainType: type, isSpecialist: isSpecialist });
        });

        this.evaluationCache[clanId].bushoTypes = types;
        return types;
    }

    // お城の役割（前線・後方など）と重要度を調べます
    evaluateCastles(clanId) {
        if (!this.evaluationCache[clanId]) {
            this.evaluationCache[clanId] = {};
        }
        if (this.evaluationCache[clanId].castleRoles) {
            return this.evaluationCache[clanId].castleRoles;
        }

        const myCastles = this.game.castles.filter(c => c.ownerClan === clanId);
        const roles = new Map();

        // 大名のいるお城を探します
        const daimyo = this.game.bushos.find(b => b.clan === clanId && b.isDaimyo);
        const daimyoCastleId = daimyo ? daimyo.castleId : -1;

        myCastles.forEach(castle => {
            // お隣のお城を調べます
            const neighbors = [];
            if (castle.adjacentCastleIds) {
                castle.adjacentCastleIds.forEach(adjId => {
                    const adjCastle = this.game.getCastle(adjId);
                    if (adjCastle) neighbors.push(adjCastle);
                });
            }

            let role = '後方拠点';
            let enemyPower = 0;
            let adjacentEnemyRoutes = 0;

            // お隣に敵がいるかチェックします
            neighbors.forEach(n => {
                if (n.ownerClan !== clanId && n.ownerClan !== 0) {
                    const rel = this.game.getRelation(clanId, n.ownerClan);
                    const isProtected = rel && this.game.diplomacyManager.isNonAggression(rel.status);
                    if (!isProtected) {
                        role = '前線拠点';
                        enemyPower += n.soldiers + n.defense;
                        adjacentEnemyRoutes++;
                    }
                }
            });

            // 自分が前線でなければ、お隣が前線かどうか調べます（準前線拠点）
            if (role === '後方拠点') {
                const isSubFront = neighbors.some(n => {
                    if (n.ownerClan === clanId) {
                        const nNeighbors = n.adjacentCastleIds ? n.adjacentCastleIds.map(id => this.game.getCastle(id)).filter(c => c) : [];
                        return nNeighbors.some(nn => {
                            if (nn.ownerClan !== clanId && nn.ownerClan !== 0) {
                                const rel = this.game.getRelation(clanId, nn.ownerClan);
                                return !(rel && this.game.diplomacyManager.isNonAggression(rel.status));
                            }
                            return false;
                        });
                    }
                    return false;
                });
                if (isSubFront) {
                    role = '準前線拠点';
                }
            }

            // 根拠地のシールを上書きで貼ります（前線であり根拠地でもある、という状態になります）
            const isBase = (castle.id === daimyoCastleId);

            // 軍事的重要度を計算
            let militaryImportance = adjacentEnemyRoutes * 10;
            if (neighbors.length >= 4) militaryImportance += 20; // 道が多い要衝

            // 危険度を計算
            const myDefPower = castle.soldiers + castle.defense;
            const dangerLevel = myDefPower > 0 ? (enemyPower / myDefPower) * 20 : 50;

            // 経済価値を計算
            const economicValue = (castle.kokudaka + castle.maxKokudaka + castle.commerce + castle.maxCommerce) / 100;

            // 受け皿スコア（防衛・集結性能）を計算
            const defenseScore = castle.defense + castle.maxDefense;
            const militaryScore = castle.soldiers + (castle.kokudaka / 10);
            let allySupport = 0;
            neighbors.forEach(n => {
                if (n.ownerClan === clanId) allySupport += 10;
            });
            const receiverScore = defenseScore + militaryScore + allySupport + (neighbors.length * 5);

            roles.set(castle.id, {
                role: role,
                isBase: isBase,
                militaryImportance: militaryImportance,
                dangerLevel: dangerLevel,
                economicValue: economicValue,
                receiverScore: receiverScore,
                totalScore: militaryImportance + dangerLevel + economicValue
            });
        });

        this.evaluationCache[clanId].castleRoles = roles;
        return roles;
    }

    // 大名家の目的（防衛、攻撃、内政など）を決めます
    determineClanGoal(clanId) {
        if (!this.evaluationCache[clanId]) this.evaluationCache[clanId] = {};
        if (this.evaluationCache[clanId].goal) return this.evaluationCache[clanId].goal;

        const roles = this.evaluateCastles(clanId);
        let goal = '集結';
        
        // 根拠地が危険かチェック
        let isBaseInDanger = false;
        let isFrontPushed = false;

        roles.forEach((data, cId) => {
            if (data.isBase && data.dangerLevel > 30) isBaseInDanger = true;
            if (data.role === '前線拠点' && data.dangerLevel > 50) isFrontPushed = true;
        });

        // 作戦システムで攻撃準備中かチェック
        const myOperation = this.game.aiOperationManager.operations[clanId];
        const isPreparingAttack = (myOperation && myOperation.type === '攻撃');

        if (isBaseInDanger) {
            goal = '防衛（根拠地）';
        } else if (isFrontPushed) {
            goal = '防衛（前線）';
        } else if (isPreparingAttack) {
            goal = '攻撃準備';
        } else {
            // 特に危険がなく攻撃もしていなければ内政
            goal = '内政';
        }

        this.evaluationCache[clanId].goal = goal;
        return goal;
    }

    // お城のターンが来た時に、武将をお引越しさせるか決めます
    planMoveAction(castle, availableBushos, reachableMyCastles) {
        this.clearCacheIfNeeded();
        const clanId = castle.ownerClan;
        
        const bushoTypes = this.evaluateBushos(clanId);
        const castleRoles = this.evaluateCastles(clanId);
        const clanGoal = this.determineClanGoal(clanId);

        const currentRoleData = castleRoles.get(castle.id);
        if (!currentRoleData) return null;

        // お引越しの候補者を入れる箱を用意します
        let candidates = [];

        // 今のお城にいる武将たちを順番に見ていきます
        for (let busho of availableBushos) {
            if (busho.id === castle.castellanId) continue; // 城主は移動しません

            const bTypeInfo = bushoTypes.get(busho.id);
            if (!bTypeInfo) continue;

            const bType = bTypeInfo.mainType;
            let currentCastleScore = 0;
            let bestTargetScore = 0;
            let targetForThisBusho = null;

            // 自領のすべてのお城（今の城を含む）に、この武将にとっての「魅力点数」をつけていきます
            for (let target of reachableMyCastles) {
                const tRoleData = castleRoles.get(target.id);
                if (!tRoleData) continue;

                let score = 0;

                // 1. お城の基本ステータス（総合評価）が高いとプラス
                score += tRoleData.totalScore / 5;

                // 2. 空の城・手薄な城へのボーナス！
                if (target.samuraiIds.length === 0) {
                    score += 150; 
                } else if (target.samuraiIds.length === 1) {
                    score += 80;  
                } else if (target.samuraiIds.length === 2) {
                    score += 30;
                }

                // 3. 開発の余地ボーナス
                const devRoom = (target.maxKokudaka - target.kokudaka) + (target.maxCommerce - target.commerce);
                if (devRoom > 1000) {
                    score += 50;
                    if (bTypeInfo.isSpecialist && busho.politics >= 70) score += 100;
                } else if (devRoom > 500) {
                    score += 20;
                    if (bTypeInfo.isSpecialist && busho.politics >= 70) score += 50;
                }

                // 4. 武将のタイプによる好み
                if (bType === '無能型') {
                    if (tRoleData.role === '前線拠点') score -= 100;
                    if (tRoleData.role === '後方拠点') score += 50;
                } else if (bType === '万能型') {
                    if (tRoleData.isBase) score += 80;
                    if (tRoleData.role === '前線拠点' || tRoleData.role === '準前線拠点') score += 50;
                }

                // 5. 弱い前線からの退避と、強い受け皿への集結
                if (tRoleData.role === '準前線拠点') {
                    score += tRoleData.receiverScore / 20;
                }

                // 6. 攻撃作戦の準備拠点ならプラス
                const myOp = this.game.aiOperationManager.operations[clanId];
                if (clanGoal === '攻撃準備' && myOp && myOp.stagingBase === target.id) {
                    if (bType !== '無能型') score += 150;
                }

                // 計算した点数を、今の城と移動先で振り分けます
                if (target.id === castle.id) {
                    currentCastleScore = score; 
                } else {
                    if (score > bestTargetScore) {
                        bestTargetScore = score;
                        targetForThisBusho = target;
                    }
                }
            }

            // ★ここで「今の城」と「一番良い移動先」を比べます！
            const scoreDiff = bestTargetScore - currentCastleScore;
            
            // 50点以上の大差があれば、お引越し候補のリストに入れます
            if (targetForThisBusho && scoreDiff >= 50) {
                candidates.push({
                    busho: busho,
                    scoreDiff: scoreDiff,
                    target: targetForThisBusho
                });
            }
        }

        // 候補のリストを、行きたい気持ち（点数差）が強い順に並べ替えます
        candidates.sort((a, b) => b.scoreDiff - a.scoreDiff);

        // 目的地ごとにグループ分けをします（同じお城に行く人はまとめます）
        const targetGroups = new Map();
        for (let cand of candidates) {
            if (!targetGroups.has(cand.target.id)) {
                targetGroups.set(cand.target.id, { target: cand.target, movers: [], maxScoreDiff: 0 });
            }
            const group = targetGroups.get(cand.target.id);
            group.movers.push(cand.busho);
            // グループの中で一番強い行きたい気持ちを、そのグループの代表点数にします
            if (cand.scoreDiff > group.maxScoreDiff) {
                group.maxScoreDiff = cand.scoreDiff;
            }
        }

        // お城に残る人数のカウンターです（最初は今いる全員の数）
        let remainingCount = castle.samuraiIds.length;
        const moveActions = []; // まとめた行動を入れる箱です

        // 目的地ごとに、まとめて移動の行動を作ります
        targetGroups.forEach(group => {
            let actualMovers = [];
            // 今のお城に3人以上残るように、上から順番にメンバーを確定させます
            for (let busho of group.movers) {
                if (remainingCount > 3) {
                    actualMovers.push(busho);
                    remainingCount--;
                }
            }
            // もし1人でも引っ越せるなら、行動のリストに追加します
            if (actualMovers.length > 0) {
                moveActions.push({
                    type: 'move',
                    stat: 'leadership',
                    score: 300 + group.maxScoreDiff,
                    cost: 0,
                    targetId: group.target.id,
                    movers: actualMovers
                });
            }
        });

        // もし行きたい人が誰もいなくて、空き城があった時のお留守番機能です
        if (moveActions.length === 0) {
            const emptyCastles = reachableMyCastles.filter(c => c.samuraiIds.length <= 1 && c.id !== castle.id);
            if (emptyCastles.length > 0 && castle.samuraiIds.length > 4) {
                const lowSkillMovers = availableBushos
                    .filter(b => b.id !== castle.castellanId)
                    .sort((a, b) => {
                        const totalA = a.leadership + a.strength + a.politics + a.diplomacy + a.intelligence;
                        const totalB = b.leadership + b.strength + b.politics + b.diplomacy + b.intelligence;
                        return totalA - totalB; 
                    });

                if (lowSkillMovers.length > 0) {
                    const mover = lowSkillMovers[0];
                    moveActions.push({
                        type: 'move',
                        stat: 'leadership',
                        score: 250,
                        cost: 0,
                        targetId: emptyCastles[0].id,
                        movers: [mover]
                    });
                }
            }
        }

        // 完成した複数の移動リストを、そのまま返します！
        return moveActions;
    }
}