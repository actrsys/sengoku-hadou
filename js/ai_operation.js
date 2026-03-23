/**
 * ai_operation.js - AIの作戦（長期計画）システム
 * 責務: 大名家ごとの作戦（攻撃、防衛、集結、内政）の立案・準備・実行の管理
 */

class AIOperationManager {
    constructor(game) {
        this.game = game;
        this.operations = {};
    }

    save() {
        return this.operations;
    }

    load(data) {
        this.operations = data || {};
    }

    processMonthlyOperations() {
        this.game.clans.forEach(clan => {
            if (clan.id === 0 || clan.id === this.game.playerClanId) return;

            if (!this.operations[clan.id]) {
                this.generateOperation(clan.id);
            } else {
                this.updateOperation(clan.id);
            }
        });
    }

    generateOperation(clanId) {
        // 大名家のお城を全部集めます
        const myClanCastles = this.game.castles.filter(c => c.ownerClan === clanId);
        if (myClanCastles.length === 0) return;

        // ゲーム開始から3ターン未満なら、おとなしく内政作戦にします
        const startMonth = window.MainParams.StartMonth || 1;
        const elapsedTurns = ((this.game.year - window.MainParams.StartYear) * 12) + (this.game.month - startMonth);
        if (elapsedTurns < 3) {
            this.setInternalOperation(clanId);
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

        let bestOperation = null;
        let highestScore = -1;

        // 大名家のすべてのお城を順番に見て、一番攻めやすい場所を探します！
        for (const myCastle of myClanCastles) {
            // プレイヤーの委任城で攻撃禁止なら飛ばします
            if (clanId === this.game.playerClanId && myCastle.isDelegated && !myCastle.allowAttack) {
                continue;
            }

            const myGeneral = this.game.getBusho(myCastle.castellanId);
            if (!myGeneral || myGeneral.isActionDone) continue; 

            // 攻め込める敵を探す（ai.jsからお引っ越ししてきた魔法です）
            const neighbors = this.game.castles.filter(c => 
                c.ownerClan !== clanId && 
                GameSystem.isReachable(this.game, myCastle, c, clanId)
            );

            const validEnemies = neighbors.filter(target => {
                let isDirectlyAdjacent = false;
                if (target.adjacentCastleIds) {
                    isDirectlyAdjacent = target.adjacentCastleIds.some(adjId => {
                        const adjCastle = this.game.getCastle(adjId);
                        return adjCastle && adjCastle.ownerClan === clanId;
                    });
                }
                if (!isDirectlyAdjacent) return false;

                if (target.ownerClan === 0) {
                    if ((target.immunityUntil || 0) >= this.game.getCurrentTurnId()) return false;
                    return true;
                }
                
                const rel = this.game.getRelation(clanId, target.ownerClan);
                const isProtected = rel && this.game.diplomacyManager.isNonAggression(rel.status);
                if (isProtected || (target.immunityUntil || 0) >= this.game.getCurrentTurnId()) return false;

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
                
                // 点数が今までで一番高かったら、ベストな作戦としてメモを書き換えます
                if (decision && decision.score > highestScore) {
                    highestScore = decision.score;
                    
                    // ★ここから追加：雪国かどうかを判定して「越冬」の準備をします
                    let prepTurns = 2; // 基本の準備期間は2ヶ月
                    
                    // 大雪がよく降る国（降雪確率30%以上）の出席番号リストです
                    const snowProvs = [1, 2, 3, 4, 5, 6, 7, 8, 10, 11, 12, 28];
                    // 諸勢力が目標の時は、自分の城と同じ国として扱います
                    const targetProvId = decision.target.isKunishuTarget ? myCastle.provinceId : decision.target.provinceId;
                    
                    // 出発する城か、目的地のお城のどちらかが雪国リストに入っていたら「越冬モード」を考えます
                    const isSnowArea = snowProvs.includes(myCastle.provinceId) || snowProvs.includes(targetProvId);
                    
                    if (isSnowArea) {
                        // 実行する予定の月を計算します（12を超えたら1に戻るようにします）
                        let execMonth = this.game.month + prepTurns;
                        if (execMonth > 12) execMonth -= 12;
                        
                        // もし実行予定の月が冬（12月、1月、2月）だったら、3月になるまで準備期間を毎月1ずつ延ばします
                        while (execMonth === 12 || execMonth === 1 || execMonth === 2) {
                            prepTurns++;
                            execMonth = this.game.month + prepTurns;
                            if (execMonth > 12) execMonth -= 12;
                        }
                    }
                    // ★追加ここまで

                    bestOperation = {
                        type: '攻撃',
                        // セーブできるように、お城も諸勢力も「出席番号（ID）」だけで覚えます！
                        targetId: decision.target.isKunishuTarget ? decision.target.kunishu.id : decision.target.id, 
                        isKunishuTarget: decision.target.isKunishuTarget === true, // 諸勢力かどうかの目印
                        stagingBase: myCastle.id,    // 出撃する自分のお城のID
                        requiredForce: decision.sendSoldiers, // 必要な兵士
                        requiredRice: decision.sendRice,      // 必要な兵糧
                        assignedUnits: [], 
                        turnsRemaining: prepTurns, // ★計算した準備ターン（越冬なら長くなります）
                        maxTurns: prepTurns + 3,   // ★待機中に期限切れで諦めないように、少し余裕を持たせます
                        status: '準備中'
                    };
                }
            }
        }

        // すべてのお城を見終わって、もし攻撃の作戦が見つかっていたらサイコロを振ります！
        if (bestOperation) {
            // ai.jsでやっていた確率のサイコロをここで振って、やるかどうか決めます
            if (Math.random() * 100 < highestScore) {
                this.operations[clanId] = bestOperation;
                console.log(`大名家[${clanId}]が【攻撃作戦】を立案しました！(準備: ${bestOperation.turnsRemaining}ヶ月)`);
                return;
            }
        }

        // 攻撃する場所がなかったり、サイコロに外れたら、おとなしく内政作戦にします
        this.setInternalOperation(clanId);
    }

    setInternalOperation(clanId) {
        this.operations[clanId] = {
            type: '内政',
            targetId: null,
            isKunishuTarget: false,
            stagingBase: null,
            requiredForce: 0,
            requiredRice: 0,
            assignedUnits: [],
            turnsRemaining: 1, // 内政はすぐに実行中になります
            maxTurns: 1,
            status: '準備中'
        };
        console.log(`大名家[${clanId}]は今月、【内政作戦】を行います。`);
    }

    updateOperation(clanId) {
        const op = this.operations[clanId];

        // 1. 期限切れのチェック
        op.maxTurns--;
        if (op.maxTurns <= 0) {
            console.log(`大名家[${clanId}]の作戦【${op.type}】は期限切れで中止されました。`);
            delete this.operations[clanId];
            return;
        }

        // 2. 準備中の場合
        if (op.status === '準備中') {
            // ★今後の拡張：ここで武将を集める命令を出します。
            
            // 今回はカウントダウンを進めるだけです
            op.turnsRemaining--;
            if (op.turnsRemaining <= 0) {
                op.status = '実行中';
                console.log(`大名家[${clanId}]の作戦【${op.type}】の準備が完了し、実行フェーズに入りました！`);
            }
        } 
    }
}