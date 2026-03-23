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
        let highestMoveScore = 0;

        // 今のお城にいる武将たちを順番に見ていきます
        for (let busho of availableBushos) {
            if (busho.id === castle.castellanId) continue; // 城主は移動しません

            const bTypeInfo = bushoTypes.get(busho.id);
            if (!bTypeInfo) continue;

            const bType = bTypeInfo.mainType;
            let wantsToMove = false;
            let targetPreferences = [];

            // 今のお城の状況と、武将のタイプを見比べて「ここに居たくない理由」を探します
            
            // 1. 無能型は前線に居たくないので後方へ逃げたがります
            if (bType === '無能型' && currentRoleData.role === '前線拠点') {
                wantsToMove = true;
                targetPreferences = ['後方拠点', '準前線拠点'];
            }
            
            // 2. 万能型は、根拠地や前線など重要な場所に居たがります
            if (bType === '万能型' && currentRoleData.role === '後方拠点' && !currentRoleData.isBase) {
                wantsToMove = true;
                targetPreferences = ['根拠地', '受け皿として強い準前線'];
            }

            // 3. 前線拠点が弱すぎる（受け皿スコアが低い）場合、武将は強い準前線に下がって援軍の準備をしたくなります
            if (currentRoleData.role === '前線拠点' && currentRoleData.receiverScore < 1000) {
                // 最低限の防衛人数（城主含め3人）を残して、強い武将は後ろに下がります
                const remainingCount = castle.samuraiIds.length - movers.length;
                if (remainingCount > 3) {
                    wantsToMove = true;
                    targetPreferences = ['受け皿として強い準前線'];
                }
            }

            // 4. 内政特化の武将は、開発の余地が大きい後方拠点に行きたがります
            if (bTypeInfo.isSpecialist && busho.politics >= 70 && (castle.kokudaka >= castle.maxKokudaka && castle.commerce >= castle.maxCommerce)) {
                wantsToMove = true;
                targetPreferences = ['開発余地のある後方'];
            }

            // 5. 作戦システムで攻撃拠点に選ばれている城には、バランス型や万能型が集結したがります
            const myOp = this.game.aiOperationManager.operations[clanId];
            if (clanGoal === '攻撃準備' && myOp && myOp.stagingBase !== castle.id) {
                if (bType !== '無能型') {
                    wantsToMove = true;
                    targetPreferences = ['攻撃拠点'];
                }
            }

            // 移動したい理由があれば、行き先を探します
            if (wantsToMove) {
                for (let target of reachableMyCastles) {
                    if (target.id === castle.id) continue;
                    
                    const tRoleData = castleRoles.get(target.id);
                    if (!tRoleData) continue;

                    let score = 0;

                    if (targetPreferences.includes('後方拠点') && tRoleData.role === '後方拠点') score += 100;
                    if (targetPreferences.includes('準前線拠点') && tRoleData.role === '準前線拠点') score += 50;
                    if (targetPreferences.includes('根拠地') && tRoleData.isBase) score += 150;
                    
                    if (targetPreferences.includes('受け皿として強い準前線') && tRoleData.role === '準前線拠点') {
                        score += tRoleData.receiverScore / 10; // 受け皿スコアが高いほど優先
                    }

                    if (targetPreferences.includes('開発余地のある後方') && tRoleData.role === '後方拠点') {
                        const room = (target.maxKokudaka - target.kokudaka) + (target.maxCommerce - target.commerce);
                        if (room > 500) score += 120;
                    }

                    if (targetPreferences.includes('攻撃拠点') && myOp && myOp.stagingBase === target.id) {
                        score += 200; // 攻撃の出撃拠点には最優先で集まります
                    }

                    if (score > highestMoveScore) {
                        highestMoveScore = score;
                        bestTargetCastle = target;
                        movers = [busho]; // 一番目的が合致した人を行かせます
                    }
                }
            }
        }

        // 今のお城に最低3人は残るように制限をかけます
        if (movers.length > 0 && bestTargetCastle) {
            if (castle.samuraiIds.length - movers.length >= 3) {
                // スコアの基本値を300とし、そこに計算したスコアを足して優先度を決めます
                return { type: 'move', stat: 'leadership', score: 300 + highestMoveScore, cost: 0, targetId: bestTargetCastle.id, movers: movers };
            }
        }

        // 特別な理由がなくても、武将が1人しかいない（空き城に近い）城があれば、バランス調整のために移動します
        const emptyCastles = reachableMyCastles.filter(c => c.samuraiIds.length <= 1 && c.id !== castle.id);
        if (emptyCastles.length > 0 && castle.samuraiIds.length > 4) {
            // お城から、城主以外の適当な人を1人選びます
            const randomMover = availableBushos.find(b => b.id !== castle.castellanId);
            if (randomMover) {
                return { type: 'move', stat: 'leadership', score: 250, cost: 0, targetId: emptyCastles[0].id, movers: [randomMover] };
            }
        }

        return null;
    }
}