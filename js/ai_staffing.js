/**
 * ai_staffing.js - 武将移動・配置システム
 * 責務: 大名家全体の戦略、拠点の重要度、武将の能力タイプに基づいた移動先の決定
 */

class AIStaffing {
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

        let movers = [];
        let bestTargetCastle = null;
        let highestScoreDiff = 0; // どれくらい「今の城より魅力的か（大差があるか）」を覚える箱

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
                    score += 150; // 空っぽなら超優先！
                } else if (target.samuraiIds.length === 1) {
                    score += 80;  // 1人しかいない場合も優先
                } else if (target.samuraiIds.length === 2) {
                    score += 30;
                }

                // 3. 開発の余地ボーナス
                const devRoom = (target.maxKokudaka - target.kokudaka) + (target.maxCommerce - target.commerce);
                if (devRoom > 1000) {
                    score += 50;
                    if (bTypeInfo.isSpecialist && busho.politics >= 70) score += 100; // 内政得意な人ならさらにドン！
                } else if (devRoom > 500) {
                    score += 20;
                    if (bTypeInfo.isSpecialist && busho.politics >= 70) score += 50;
                }

                // 4. 武将のタイプによる好み
                if (bType === '無能型') {
                    // 弱い人は前線を嫌がり、後方を喜びます（手薄な城のお留守番にも向いています）
                    if (tRoleData.role === '前線拠点') score -= 100;
                    if (tRoleData.role === '後方拠点') score += 50;
                } else if (bType === '万能型') {
                    // エースは重要な場所（根拠地や前線）に居たがります
                    if (tRoleData.isBase) score += 80;
                    if (tRoleData.role === '前線拠点' || tRoleData.role === '準前線拠点') score += 50;
                }

                // 5. 弱い前線からの退避と、強い受け皿への集結
                if (tRoleData.role === '準前線拠点') {
                    score += tRoleData.receiverScore / 20; // 受け皿として強いほど魅力アップ
                }

                // 6. 攻撃作戦の準備拠点ならプラス
                const myOp = this.game.aiOperationManager.operations[clanId];
                if (clanGoal === '攻撃準備' && myOp && myOp.stagingBase === target.id) {
                    if (bType !== '無能型') score += 150;
                }

                // 計算した点数を、今の城と移動先で振り分けます
                if (target.id === castle.id) {
                    currentCastleScore = score; // 今の城の点数
                } else {
                    if (score > bestTargetScore) {
                        bestTargetScore = score;
                        targetForThisBusho = target;
                    }
                }
            }

            // ★ここで「今の城」と「一番良い移動先」を比べます！
            // 「50点以上の大差」がないと、引っ越しの面倒くささが勝って居座ります！
            const scoreDiff = bestTargetScore - currentCastleScore;
            
            if (targetForThisBusho && scoreDiff >= 50) {
                // 大差があって、しかも今まで見た武将の中で一番「行きたい気持ち（点数差）」が強かったら
                if (scoreDiff > highestScoreDiff) {
                    highestScoreDiff = scoreDiff;
                    bestTargetCastle = targetForThisBusho;
                    movers = [busho];
                }
            }
        }

        // 今のお城に最低3人は残るように制限をかけます
        if (movers.length > 0 && bestTargetCastle) {
            if (castle.samuraiIds.length - movers.length >= 3) {
                // 引っ越し決定！
                return { type: 'move', stat: 'leadership', score: 300 + highestScoreDiff, cost: 0, targetId: bestTargetCastle.id, movers: movers };
            }
        }

        return null; // 大差がなければ誰も移動しません（居座る）
    }
}