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

        // 攻撃作戦の候補を全部記録しておく箱を用意します
        let operationCandidates = [];

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
                
                // 点数がついたら、とりあえず候補の箱に入れておきます
                if (decision && decision.score > 0) {
                    operationCandidates.push({
                        castleId: myCastle.id,
                        target: decision.target,
                        sendSoldiers: decision.sendSoldiers,
                        sendRice: decision.sendRice,
                        score: decision.score
                    });
                }
            }
        }

        let bestOperation = null;
        let highestScore = -1;

        // 候補の箱の中から、一番点数が高い作戦を見つけます！
        if (operationCandidates.length > 0) {
            // 点数が高い順に並べ替えます
            operationCandidates.sort((a, b) => b.score - a.score);
            
            // ★ここから追加：点数が高い作戦から順番に見て、サポートが用意できるか確認します！
            for (const cand of operationCandidates) {
                let supportBaseId = null;
                const targetId = cand.target.isKunishuTarget ? cand.target.kunishu.id : cand.target.id;
                const isKunishuTarget = cand.target.isKunishuTarget === true;

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
                            .filter(c => c && c.ownerClan === clanId)
                            .sort((a, b) => (b.soldiers + b.defense) - (a.soldiers + a.defense));
                        if (adjMyCastles.length > 0) {
                            supportBaseId = adjMyCastles[0].id;
                        }
                    }
                }

                // ★修正：援軍用の拠点が確保できなくても、作戦自体は諦めずにそのまま採用します！
                // お城が1つしかないお殿様でも、しっかり攻撃できるようにします。
                highestScore = cand.score;
                
                // ★雪国かどうかを判定して「越冬」の準備をします
                let prepTurns = 2; // 基本の準備期間は2ヶ月
                
                // 大雪がよく降る国（降雪確率30%以上）の出席番号リストです
                const snowProvs = [1, 2, 3, 4, 5, 6, 7, 8, 10, 11, 12, 28];
                const myCastle = this.game.getCastle(cand.castleId);
                // 諸勢力が目標の時は、自分の城と同じ国として扱います
                const targetProvId = cand.target.isKunishuTarget ? myCastle.provinceId : cand.target.provinceId;
                
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

                bestOperation = {
                    type: '攻撃',
                    targetId: targetId, 
                    isKunishuTarget: isKunishuTarget,
                    stagingBase: cand.castleId,    // 出撃する自分のお城のID
                    supportBase: supportBaseId,        // ★追加：予備の援軍用拠点のID
                    requiredForce: cand.sendSoldiers, 
                    requiredRice: cand.sendRice,      
                    assignedUnits: [], 
                    turnsRemaining: prepTurns, 
                    maxTurns: prepTurns + 3,   
                    status: '準備中'
                };

                // 最高の作戦が1つ決まったら、もう他の候補は見なくていいのでループを終わらせます
                break;
            }
        }

        // すべてのお城を見終わって、もし攻撃の作戦が見つかっていたらサイコロを振ります！
        if (bestOperation) {
            // ai.jsでやっていた確率のサイコロをここで振って、やるかどうか決めます
            if (Math.random() * 100 < highestScore) {
                this.operations[clanId] = bestOperation;
                console.log(`大名家[${clanId}]が【攻撃作戦】を立案しました！(出撃元: ${bestOperation.stagingBase}, 援軍用: ${bestOperation.supportBase || 'なし'}, 準備: ${bestOperation.turnsRemaining}ヶ月)`);
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