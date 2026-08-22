/**
 * ai_staffing.js - 武将移動・配置システム
 * 大名家全体の戦略、拠点の重要度、武将の能力タイプに基づいた移動先の決定
 */

class AIStaffing {    
    // 大名や国主のお引越し先を考えます（お金や兵士の分配、お供の随伴機能付き！）
    relocateDaimyo(castle, castellan) {
        const clanId = castle.ownerClan;
        const leader = castellan; // castellanは大名または国主です
        
        // このお城に大名も国主もいないなら、お引越しの判定はしません
        if (!leader || (!leader.isDaimyo && !leader.isCommander) || leader.castleId !== castle.id) return false;

        // ★追加：今いるお城が大雪なら、お引越しできません！
        const srcProv = this.game.provinces.find(p => p.id === castle.provinceId);
        if (srcProv && srcProv.statusEffects && srcProv.statusEffects.includes('heavySnow')) {
            return false;
        }

        // ★追加：リーダーの本来の所属軍団IDを取得します
        let targetLegionId = 0;
        if (leader.isCommander) {
            const myLegion = this.game.legions.find(l => Number(l.commanderId) === Number(leader.id));
            if (myLegion) {
                targetLegionId = myLegion.legionNo;
            }
        }

        // 自分が移動できるお城（自領で繋がっている城）のリストを作ります
        const reachableMyCastles = [];
        const visitedCastles = new Set();
        const searchQueue = [castle];
        let searchHead = 0;
        visitedCastles.add(castle.id);

        while (searchHead < searchQueue.length) {
            const current = searchQueue[searchHead++];
            
            // 自軍団のお城なら、お引越し先の候補リストに入れます
            if (Number(current.ownerClan) === Number(clanId) && Number(current.legionId) === Number(targetLegionId)) {
                reachableMyCastles.push(current);
            }

            // ★軽量化：全国の全城を毎回filterせず、対称化した隣接索引だけを見ます。
            // GameSystem.isAdjacent と同じく「片側に記載があれば隣接」の結果を維持します。
            const adjCastles = this._getAdjacentCastles(current).filter(c => !visitedCastles.has(c.id));

            for (const n of adjCastles) {
                let canPass = false;
                if (Number(n.ownerClan) === Number(clanId)) {
                    canPass = true; // 自分の大名家なら他の軍団の城でも通行OK
                } else if (n.ownerClan !== 0) {
                    const rel = this.game.getRelation(clanId, n.ownerClan);
                    if (rel && ['同盟', '支配', '従属'].includes(rel.status)) {
                        canPass = true; // 同盟・支配・従属の勢力も通行OK
                    }
                }
                
                if (canPass) {
                    visitedCastles.add(n.id);
                    searchQueue.push(n);
                }
            }
        }

        if (reachableMyCastles.length <= 1) return false;

        // ★追加：人口による候補の絞り込み（徴兵数重視）
        const over20k = reachableMyCastles.filter(c => c.population >= 20000);
        const over10k = reachableMyCastles.filter(c => c.population >= 10000);

        let validCandidates = reachableMyCastles;

        // 人口2万以上の拠点があり、その中に防御力500以上の拠点がある場合
        if (over20k.length > 0 && over20k.some(c => c.defense >= 500)) {
            validCandidates = over20k;
        } 
        // 2万以上の拠点が条件を満たさない（または存在しない）が、人口1万以上の拠点があり、その中に防御力500以上の拠点がある場合
        else if (over10k.length > 0 && over10k.some(c => c.defense >= 500)) {
            validCandidates = over10k;
        }

        let bestCastle = castle; // まずは「今いるお城」を一番良いお城（基準）としておきます
        let bestScore = 0; // 今のお城の点数は基準なので「0点」です

        // ★追加：今の城が絞り込みで除外された場合は、確実に引っ越すように基準点をうんと低くします
        if (!validCandidates.includes(castle)) {
            bestScore = -999999;
        }

        // ★追加：攻撃作戦の出撃元（前線拠点）の出席番号と、性格によるボーナス点数を調べます
        let stagingBaseId = null;
        let operationBonus = 0;
        
        const clanOps = this.game.aiOperationManager.operations[clanId];
        // ★修正：作戦を探す時も、本来の軍団IDを使います！
        const myOp = clanOps ? clanOps[targetLegionId] : null;
        if (myOp && myOp.type === '攻撃') {
            stagingBaseId = myOp.stagingBase;
            if (leader.personality === 'aggressive') {
                operationBonus = 60;
            } else if (leader.personality === 'balanced') {
                operationBonus = 30;
            }
        }

        // ★追加：もし「今いるお城」が攻撃作戦の出撃元なら、基準の点数にボーナスを足しておきます！
        if (stagingBaseId !== null && castle.id === stagingBaseId) {
            bestScore += operationBonus;
        }

        // 自分が移動できるお城（自領で繋がっているお城）を順番に調べて、点数をつけていきます
        for (const target of validCandidates) {
            // 今いるお城は調べる必要がないので飛ばします
            if (target.id === castle.id) continue;

            // ★追加：目的地のお城が大雪なら、お引越し先候補から除外します！
            const tgtProv = this.game.provinces.find(p => p.id === target.provinceId);
            if (tgtProv && tgtProv.statusEffects && tgtProv.statusEffects.includes('heavySnow')) {
                continue;
            }

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
            const castleBushos = this.game.getCastleBushos(castle.id).filter(b => 
                b.clan === castle.ownerClan && 
                b.status === 'active' && 
                b.id !== castellan.id &&
                !b.isDaimyo &&         // ★追加：大名はお供にしない！
                !b.isCommander         // ★追加：国主もお供にしない！
            );
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

    _getAdjacentCastles(castle) {
        return this.game.mapGraph.getAdjacentCastles(castle);
    }

    // ==========================================
    // ★追加：軍団の空き枠を探す、または新しく作る共通の魔法（人事部で一元管理）
    // ==========================================
    assignNewLegion(clanId, commanderId) {
        if (!this.game.legions) this.game.legions = [];
        const clanLegions = this.game.legions.filter(l => l.clanId === clanId);
        const activeNos = clanLegions.filter(l => l.commanderId > 0).map(l => l.legionNo);
        
        let newLegionNo = -1;
        const emptyLegion = clanLegions.find(l => l.commanderId === 0);
        
        // すでに解散済みの空っぽの軍団があれば、その枠を再利用します
        if (emptyLegion) {
            newLegionNo = emptyLegion.legionNo;
            emptyLegion.commanderId = commanderId;
            emptyLegion.establishedTurnId = this.game.getCurrentTurnId(); // 発足月をリセットします
        } else {
            // 無ければ1から8の間で空いている番号を探します
            for (let i = 1; i <= 8; i++) {
                if (!activeNos.includes(i)) {
                    newLegionNo = i;
                    break;
                }
            }
            // 空き番号が見つかったら、新しく軍団のデータを作ります
            if (newLegionNo !== -1) {
                let maxLegionId = 0;
                this.game.legions.forEach(l => { if (l.id > maxLegionId) maxLegionId = l.id; });
                const newLegion = typeof Legion !== 'undefined' ? new Legion({
                    id: maxLegionId + 1,
                    clanId: clanId,
                    legionNo: newLegionNo,
                    commanderId: commanderId,
                    establishedTurnId: this.game.getCurrentTurnId()
                }) : {
                    id: maxLegionId + 1,
                    clanId: clanId,
                    legionNo: newLegionNo,
                    commanderId: commanderId,
                    establishedTurnId: this.game.getCurrentTurnId()
                };
                this.game.legions.push(newLegion);
            }
        }
        
        // 無事に軍団が割り当てられたらその番号を、失敗したら-1を返します
        return newLegionNo;
    }
    
    // ★追加：AI大名が軍団を新設する機能
    createNewLegionIfNeeded(clanId) {
        // ★追加：すでに軍団が最大数（8個）に達している場合は作らない！
        if (this.game.legions) {
            const activeLegionsCount = this.game.legions.filter(l => l.clanId === clanId && l.commanderId > 0).length;
            if (activeLegionsCount >= 8) return false; // ★変更：失敗時は false を返す
        }
        
        const myCastles = this.game.getClanCastles(clanId);
        const myDirectCastles = myCastles.filter(c => Number(c.legionId) === 0);
        
        // 条件：直轄領が8城以上
        if (myDirectCastles.length < 8) return false; // ★変更：失敗時は false を返す
        
        // ★今回追加：国ごとの直轄拠点の数を数えておきます
        const directCastleCountByProvince = {};
        myDirectCastles.forEach(c => {
            if (c.provinceId > 0) {
                directCastleCountByProvince[c.provinceId] = (directCastleCountByProvince[c.provinceId] || 0) + 1;
            }
        });

        const occupiedProvinces = new Set();
        const daimyo = this.game.bushos.find(b => b.clan === clanId && b.isDaimyo);
        if (daimyo && daimyo.castleId) {
            const dCastle = this.game.getCastle(daimyo.castleId);
            if(dCastle) occupiedProvinces.add(dCastle.provinceId);
        }
        const clanLegions = this.game.legions.filter(l => l.clanId === clanId);
        clanLegions.forEach(l => {
            const cmd = this.game.getBusho(l.commanderId);
            if (cmd && cmd.castleId) {
                const cCastle = this.game.getCastle(cmd.castleId);
                if(cCastle) occupiedProvinces.add(cCastle.provinceId);
            }
        });
        
        // ★大名や国主がいない国が候補。またはに、すでにいたとしても「直轄拠点が6つ以上」残っている国なら候補にします
        const candidateCastles = myDirectCastles.filter(c => {
            if (c.provinceId === 0) return false;
            // 誰もいない国ならOK
            if (!occupiedProvinces.has(c.provinceId)) return true;
            // すでに誰かいる国でも、直轄拠点が6つ以上残っているなら特別にOK
            if (occupiedProvinces.has(c.provinceId) && directCastleCountByProvince[c.provinceId] >= 6) return true;
            return false;
        });
        
        if (candidateCastles.length === 0) return false; // ★変更：失敗時は false を返す
        
        // 新国主の選定
        const myBushos = this.game.bushos.filter(b => b.clan === clanId && b.status === 'active');
        let candidates = myBushos.filter(b => !b.isDaimyo && !b.isCommander && (b.achievementTotal || 0) >= 1000);
        if (candidates.length === 0) return false; // ★変更：失敗時は false を返す
        
        let newCommander = null;
        const factionLeaders = candidates.filter(b => b.isFactionLeader);
        if (factionLeaders.length > 0) {
            if (factionLeaders.length === 1) {
                newCommander = factionLeaders[0];
            } else {
                factionLeaders.sort((a, b) => {
                    const countA = myBushos.filter(x => x.factionId === a.factionId).length;
                    const countB = myBushos.filter(x => x.factionId === b.factionId).length;
                    if (countA !== countB) return countB - countA;
                    return (b.achievementTotal || 0) - (a.achievementTotal || 0);
                });
                newCommander = factionLeaders[0];
            }
        } else {
            candidates.sort((a, b) => (b.achievementTotal || 0) - (a.achievementTotal || 0));
            newCommander = candidates[0];
        }
        
        // 対象城の選定：大名の居城移動ロジック（スコア計算）を参照して平均を基準に評価
        const avgMaxKoku = Math.max(1, candidateCastles.reduce((s,c)=>s+c.maxKokudaka,0) / candidateCastles.length);
        const avgMaxDef = Math.max(1, candidateCastles.reduce((s,c)=>s+c.maxDefense,0) / candidateCastles.length);
        const avgKoku = Math.max(1, candidateCastles.reduce((s,c)=>s+c.kokudaka,0) / candidateCastles.length);
        const avgDef = Math.max(1, candidateCastles.reduce((s,c)=>s+c.defense,0) / candidateCastles.length);

        const castleScores = [];
        for (const target of candidateCastles) {
            let score = 0;
            const rateMaxKoku = target.maxKokudaka / avgMaxKoku;
            score += (rateMaxKoku >= 1.0) ? (rateMaxKoku - 1.0) * 30 : (rateMaxKoku - 1.0) * 60;
            const rateMaxDef = target.maxDefense / avgMaxDef;
            score += (rateMaxDef >= 1.0) ? (rateMaxDef - 1.0) * 30 : (rateMaxDef - 1.0) * 60;
            const rateKoku = target.kokudaka / avgKoku;
            score += (rateKoku >= 1.0) ? (rateKoku - 1.0) * 50 : (rateKoku - 1.0) * 100;
            const rateDef = target.defense / avgDef;
            score += (rateDef >= 1.0) ? (rateDef - 1.0) * 50 : (rateDef - 1.0) * 100;
            castleScores.push({ castle: target, score: score });
        }
        
        castleScores.sort((a, b) => b.score - a.score);
        const baseCastle = castleScores[0].castle;
        
        // 居城と同じ国にある直轄城をスコア順に選ぶ
        const sameProvinceCastles = castleScores.filter(cs => cs.castle.provinceId === baseCastle.provinceId);
        
        // ★大名や国主がすでにいる国の場合は、新しく軍団に任せる拠点を「最大2つまで」に制限します
        let maxAssignCount = 3;
        let requiredTotalSoldiers = 20000; // ★直轄領に合計20000人以上の余裕が必要です

        if (occupiedProvinces.has(baseCastle.provinceId)) {
            maxAssignCount = 2;
        }

        // ★移動してきた兵士数のチェック！
        const totalSoldiers = myDirectCastles.reduce((sum, c) => sum + c.soldiers, 0);
        if (totalSoldiers <= requiredTotalSoldiers) return false; 
        
        const targetCastles = sameProvinceCastles.slice(0, maxAssignCount).map(cs => cs.castle);
        
        // ==========================================
        // ★今回追加：解散条件を満たすような無駄な新設をブロックする魔法
        // ==========================================
        // 【ブロック条件①】すべての隣接拠点が「自勢力」または「同盟・支配・従属」しかない場合
        let hasEnemyNeighbor = false;
        for (const castle of targetCastles) {
            if (castle.adjacentCastleIds) {
                for (const adjId of castle.adjacentCastleIds) {
                    const adjCastle = this.game.getCastle(adjId);
                    if (!adjCastle) continue;
                    
                    if (adjCastle.ownerClan === 0) {
                        hasEnemyNeighbor = true; // 空き城は敵扱い
                        break;
                    } else if (adjCastle.ownerClan !== clanId) {
                        const rel = this.game.getRelation(clanId, adjCastle.ownerClan);
                        if (!rel || !['同盟', '支配', '従属'].includes(rel.status)) {
                            hasEnemyNeighbor = true; // 敵対や和睦も油断できない敵扱い
                            break;
                        }
                    }
                }
            }
            if (hasEnemyNeighbor) break;
        }
        if (!hasEnemyNeighbor) return false; // ★変更：失敗時は false を返す

        // 【ブロック条件②】新設後の武将数が拠点数を下回る場合（人手不足）
        const futureLegionBushoIds = new Set();
        
        // 1. 元々軍団の対象となる城にいる武将をカウント
        targetCastles.forEach(c => {
            const bushosInCastle = this.game.getCastleBushos(c.id).filter(b => b.clan === clanId && b.status === 'active');
            bushosInCastle.forEach(b => futureLegionBushoIds.add(b.id));
        });
        
        // 2. 新国主をカウント
        futureLegionBushoIds.add(newCommander.id);
        
        // 3. お供の武将をカウント（同じ派閥の直轄武将の1/3）
        if (newCommander.factionId !== 0) {
            const sameFactionBushos = this.game.bushos.filter(b => 
                b.clan === clanId && 
                b.status === 'active' && 
                b.factionId === newCommander.factionId && 
                !b.isDaimyo && 
                !b.isCommander && 
                !b.isCastellan && 
                !b.isGunshi && 
                b.id !== newCommander.id
            );
            const directBushos = sameFactionBushos.filter(b => {
                const bCastle = this.game.getCastle(b.castleId);
                return bCastle && Number(bCastle.legionId) === 0;
            });
            const maxMoveCount = Math.floor(directBushos.length / 3);
            for (let i = 0; i < maxMoveCount; i++) {
                futureLegionBushoIds.add(directBushos[i].id);
            }
        }
        
        if (futureLegionBushoIds.size < targetCastles.length) return false; // ★変更：失敗時は false を返す
        // ==========================================
        
        // ★修正：人事部の魔法を呼び出します！
        const newLegionNo = this.assignNewLegion(clanId, newCommander.id);
        
        // 番号が割り当てられなかったら失敗として中止します
        if (newLegionNo === -1) return false;
        
        // 新国主を移動させて国主にする
        this.game.affiliationSystem.moveCastle(newCommander, baseCastle.id);
        newCommander.isCommander = true;
        newCommander.isGunshi = false; // ★ここを書き足します：国主になる時、軍師のバッジを外します
        
        // ★追加：新国主が派閥に所属している場合、同じ派閥の武将を移動先に集める
        if (newCommander.factionId !== 0) {
            // 同じ大名家で、活動中で、同じ派閥で、大名・国主・城主・軍師ではない人を探します
            const sameFactionBushos = this.game.bushos.filter(b => 
                b.clan === clanId && 
                b.status === 'active' && 
                b.factionId === newCommander.factionId && 
                !b.isDaimyo && 
                !b.isCommander && 
                !b.isCastellan && 
                !b.isGunshi && 
                b.id !== newCommander.id
            );

            // ① まず、直轄（軍団IDが0）のお城にいるお友達だけを別のリストにまとめます
            const directBushos = sameFactionBushos.filter(b => {
                const bCastle = this.game.getCastle(b.castleId);
                return bCastle && Number(bCastle.legionId) === 0;
            });

            // ② そのリストにいる人数の「3分の1」を計算します（端数は切り捨てます）
            const maxMoveCount = Math.floor(directBushos.length / 3);

            // ③ 計算した人数の分だけ、順番に新国主のお城へお引越しさせます
            for (let i = 0; i < maxMoveCount; i++) {
                const b = directBushos[i];
                this.game.affiliationSystem.moveCastle(b, baseCastle.id);
            }
        }

        // 対象城の軍団変更
        targetCastles.forEach(c => {
            c.legionId = newLegionNo;
            c.isDelegated = true; // AIなので委任
        });
        
        this.game.updateCastleLord(baseCastle);

        // ★追加：軍団が新設されたため、この大名家の現在の作戦を白紙に戻し、各軍団で新しく作戦を考え直させます！
        if (this.game.aiOperationManager && this.game.aiOperationManager.operations[clanId]) {
            delete this.game.aiOperationManager.operations[clanId];
        }
        
        return true; // ★追加：新設が成功したら true を返します
    }
    
    // ★今回追加：役目を終えた軍団や人手不足の軍団を解散させる魔法
    checkLegionDisband(clanId) {
        if (!this.game.legions) return false; // ★変更：失敗時は false を返す
        
        let hasDisbanded = false; // ★追加：解散したかどうかの印です
        const currentTurnId = this.game.getCurrentTurnId();
        // この大名家で活動中の軍団を調べます
        const activeLegions = this.game.legions.filter(l => l.clanId === clanId && l.commanderId > 0);
        
        activeLegions.forEach(legion => {
            // この軍団が持っているお城のリストを先に取得します
            const legionCastles = this.game.getClanCastles(clanId).filter(c => c.legionId === legion.legionNo);
            
            if (legionCastles.length === 0) {
                // お城が1つもなければ、期間に関係なく自動的に解散されます
                if (this.game.castleManager) this.game.castleManager.disbandLegion(legion.id);
                hasDisbanded = true;
                return;
            }

            // 拠点がある場合のみ、クールダウン（発足から24ヶ月未満）をチェックしてスキップします
            if (currentTurnId - legion.establishedTurnId < 24) return;

            // 【条件②】所属拠点数を所属武将数が下回っている場合
            // まず、この軍団のお城にいる武将を数えます
            let legionBushoCount = 0;
            legionCastles.forEach(c => {
                // その城にいる活動中の自勢力武将の数を足します
                const bushosInCastle = this.game.getCastleBushos(c.id).filter(b => b.clan === clanId && b.status === 'active');
                legionBushoCount += bushosInCastle.length;
            });
            
            if (legionBushoCount < legionCastles.length) {
                // 解散を実行します！
                if (this.game.castleManager) this.game.castleManager.disbandLegion(legion.id);
                const cmd = this.game.getBusho(legion.commanderId);
                const clanName = this.game.clans.find(c => c.id === clanId)?.name || "不明な大名家";
                const cmdName = cmd ? cmd.name : "不明な国主";
                console.log(`【軍団解散】${clanName}の「${cmdName}軍団」は、人手不足（拠点${legionCastles.length}に対して武将${legionBushoCount}人）のため解散されました。`);
                hasDisbanded = true;
                return; // 解散したので次の軍団へ
            }

            // 【条件①】すべての隣接拠点が「自勢力」または「同盟・支配・従属」しかない場合
            let hasEnemyNeighbor = false;
            for (const castle of legionCastles) {
                if (castle.adjacentCastleIds) {
                    for (const adjId of castle.adjacentCastleIds) {
                        const adjCastle = this.game.getCastle(adjId);
                        if (!adjCastle) continue;
                        
                        if (adjCastle.ownerClan === 0) {
                            // 空き城は敵の扱い（野盗がいるかもしれないので油断できない）
                            hasEnemyNeighbor = true;
                            break;
                        } else if (adjCastle.ownerClan !== clanId) {
                            // 自分以外の勢力なら、関係を調べます
                            const rel = this.game.getRelation(clanId, adjCastle.ownerClan);
                            // 同盟・支配・従属「以外」なら敵扱い（和睦や友好も油断できないとみなします）
                            if (!rel || !['同盟', '支配', '従属'].includes(rel.status)) {
                                hasEnemyNeighbor = true;
                                break;
                            }
                        }
                    }
                }
                if (hasEnemyNeighbor) break; // 1つでも敵と面していたら、もう探さなくてOK
            }
            
            // もし敵と全く面していなければ（完全な後方になったら）、
            // 「現在の軍団が上限（8枠）まで埋まっている場合のみ」解散します
            const currentActiveCount = this.game.legions.filter(l => l.clanId === clanId && l.commanderId > 0).length;
            if (!hasEnemyNeighbor && currentActiveCount >= 8) {
                if (this.game.castleManager) this.game.castleManager.disbandLegion(legion.id);
                const cmd = this.game.getBusho(legion.commanderId);
                const clanName = this.game.clans.find(c => c.id === clanId)?.name || "不明な大名家";
                const cmdName = cmd ? cmd.name : "不明な国主";
                console.log(`【軍団解散】${clanName}の「${cmdName}軍団」は、担当地域が完全に後方化し、かつ軍団枠が上限に達しているため解散され、直轄に編入されました。`);
                hasDisbanded = true;
                return;
            }
        });
        
        return hasDisbanded; // ★追加：1つでも解散したら true を返します
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

        const myBushos = this.game.bushos.filter(b => b.clan === clanId && b.status === 'active');
        
        let totalSum = 0;
        let highestTotal = 0;
        let lowestTotal = 9999;
        
        // 全員の能力の合計点を調べます（1.5倍にする前の素の合計点で計算します）
        // ★高速化：後で武将ごとの点数を探し直すことがないよう、ID→点数の索引（Map）も一緒に作っておきます
        const bushoStatMap = new Map();
        const bushoStats = myBushos.map(b => {
            const total = b.leadership + b.strength + b.politics + b.diplomacy + b.intelligence;
            totalSum += total;
            if (total > highestTotal) highestTotal = total;
            if (total < lowestTotal) lowestTotal = total;
            const stat = { busho: b, total: total };
            bushoStatMap.set(b.id, stat);
            return stat;
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
            const stat = bushoStatMap.get(b.id); // ★高速化：探す代わりに索引から一瞬で取り出します
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
        
        const myCastles = this.game.getClanCastles(clanId);
        const roles = new Map();

        // 大名のいるお城を探します
        const daimyo = this.game.getClanDaimyo(clanId); // ★高速化：索引を使って一瞬で見つけます
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
    determineClanGoal(clanId, legionId) {
        const cacheKey = `${clanId}_${legionId}`;
        if (!this.evaluationCache[cacheKey]) this.evaluationCache[cacheKey] = {};
        if (this.evaluationCache[cacheKey].goal) return this.evaluationCache[cacheKey].goal;

        const roles = this.evaluateCastles(clanId);
        let goal = '集結';
        
        // 根拠地が危険かチェック
        let isBaseInDanger = false;
        let isFrontPushed = false;

        roles.forEach((data, cId) => {
            const c = this.game.getCastle(cId);
            if (c && Number(c.legionId) === Number(legionId)) {
                if (data.isBase && data.dangerLevel > 30) isBaseInDanger = true;
                if (data.role === '前線拠点' && data.dangerLevel > 50) isFrontPushed = true;
            }
        });

        // 作戦システムで攻撃準備中かチェック
        const clanOps = this.game.aiOperationManager.operations[clanId];
        const myOperation = clanOps ? clanOps[legionId] : null;
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

        this.evaluationCache[cacheKey].goal = goal;
        return goal;
    }

    // お城のターンが来た時に、武将をお引越しさせるか決めます
    planMoveAction(castle, availableBushos, reachableMyCastles) {
        this.clearCacheIfNeeded();
        const clanId = castle.ownerClan;
        
        // ★追加：移動可能な城を、同盟・支配・従属を通れるルートで探し直します！
        const myReachableCastles = [];
        const visitedCastles = new Set();
        const searchQueue = [castle];
        let searchHead = 0;
        visitedCastles.add(castle.id);

        while (searchHead < searchQueue.length) {
            const current = searchQueue[searchHead++];
            
            if (Number(current.ownerClan) === Number(clanId)) {
                myReachableCastles.push(current);
            }

            // ★軽量化：全国の全城を毎回filterせず、対称化した隣接索引だけを見ます。
            // GameSystem.isAdjacent と同じく「片側に記載があれば隣接」の結果を維持します。
            const adjCastles = this._getAdjacentCastles(current).filter(c => !visitedCastles.has(c.id));

            for (const n of adjCastles) {
                let canPass = false;
                if (Number(n.ownerClan) === Number(clanId)) {
                    canPass = true;
                } else if (n.ownerClan !== 0) {
                    const rel = this.game.getRelation(clanId, n.ownerClan);
                    if (rel && ['同盟', '支配', '従属'].includes(rel.status)) {
                        canPass = true;
                    }
                }
                
                if (canPass) {
                    visitedCastles.add(n.id);
                    searchQueue.push(n);
                }
            }
        }
        
        // ★追加：武将の移動先を「同じ軍団のお城」だけに限定します！
        const sameLegionCastles = myReachableCastles.filter(c => Number(c.legionId) === Number(castle.legionId));
        
        const bushoTypes = this.evaluateBushos(clanId);
        const castleRoles = this.evaluateCastles(clanId);
        const clanGoal = this.determineClanGoal(clanId, castle.legionId);

        const currentRoleData = castleRoles.get(castle.id);
        if (!currentRoleData) return null;

        // 繋がっているお城の中だけで、全体の人数や大きさを計算するようにします
        let totalBushosInNetwork = 0;
        let totalScale = 0;
        
        sameLegionCastles.forEach(c => {
            totalBushosInNetwork += c.samuraiIds.length;
            totalScale += (c.maxKokudaka + c.maxCommerce);
        });

        const avgBushos = Math.max(1, totalBushosInNetwork / Math.max(1, sameLegionCastles.length));
        const avgScale = Math.max(1, totalScale / Math.max(1, sameLegionCastles.length));

        // お引越しの候補者を入れる箱を用意します
        let candidates = [];

        // 今のお城にいる武将たちを順番に見ていきます
        for (let busho of availableBushos) {
            if (busho.id === castle.castellanId || busho.isCommander) continue; // 城主と国主は移動しません

            const bTypeInfo = bushoTypes.get(busho.id);
            if (!bTypeInfo) continue;

            const bType = bTypeInfo.mainType;
            let currentCastleScore = 0;
            let bestTargetScore = 0;
            let targetForThisBusho = null;

            // 自領のすべてのお城（今の城を含む）に、この武将にとっての「魅力点数」をつけていきます
            for (let target of sameLegionCastles) {
                const tRoleData = castleRoles.get(target.id);
                if (!tRoleData) continue;

                let score = 0;

                // 1. お城の基本ステータス（総合評価）が高いとプラス
                score += tRoleData.totalScore / 5;

                // 2. お城の大きさと全体の人数に合わせた、適正人数による点数調整！
                const targetScale = target.maxKokudaka + target.maxCommerce;
                const scaleRatio = targetScale / avgScale;
                const castleCapacity = Math.max(2, Math.floor(avgBushos * scaleRatio));

                let countScore = 0;
                
                if (target.samuraiIds.length === 0) {
                    countScore += 200; 
                } else {
                    const diff = castleCapacity - target.samuraiIds.length;
                    if (diff > 0) {
                        countScore += diff * 20;
                    } else {
                        countScore += diff * 30;
                    }
                }
                score += countScore;

                // 3. 開発の余地ボーナス（固定の数字ではなく、どれくらい開発できる割合が残っているかで見ます）
                const maxDev = target.maxKokudaka + target.maxCommerce;
                const currentDev = target.kokudaka + target.commerce;
                const devRoom = maxDev - currentDev;
                
                // 最大値がとても小さいお城には、あまりボーナスをあげすぎないようにします
                if (maxDev > 0 && devRoom > 0) {
                    const devRatio = devRoom / maxDev; // 開発できる割合（0.0〜1.0）
                    // たくさん開発する余地があって、なおかつ開発できる量（数値）もそこそこある場合に点数をあげます
                    if (devRatio > 0.3 && devRoom > 300) {
                        score += 20;
                        if (bTypeInfo.isSpecialist && busho.politics >= 70) score += 40;
                    } else if (devRatio > 0.1 && devRoom > 100) {
                        score += 10;
                        if (bTypeInfo.isSpecialist && busho.politics >= 70) score += 20;
                    }
                }

                // 3.5. 城壁の修復や民忠回復が必要な城への内政官派遣ボーナス
                // 政治や魅力が高い武将ほど、困っているお城を助けに行きたがるようにします
                if (busho.politics >= 60 || busho.charm >= 60) {
                    // 城の防御力が減っている時の評価（政治力が高い武将ほど評価アップ）
                    if (target.defense < target.maxDefense) {
                        let defScore = 0;
                        if (target.defense <= target.maxDefense / 4) {
                            defScore = 30; // 1/4以下なら緊急事態なので点数を高くします
                        } else {
                            defScore = 15; // 少し壊れているだけなら少し点数をあげます
                        }
                        
                        // 最大防御力が低いお城ほど重要度を上げますが、高くなりすぎないよう最大「2.5倍」までに制限します
                        const defRatio = Math.min(2.5, 1000 / Math.max(1, target.maxDefense));
                        const polBonus = busho.politics / 100;
                        
                        score += Math.floor(defScore * defRatio * polBonus);
                    }

                    // 民忠が下がっている時の評価（魅力が高い武将ほど評価アップ）
                    if (target.peoplesLoyalty < 100) {
                        let loyaltyScore = 0;
                        if (target.peoplesLoyalty <= 70) {
                            loyaltyScore = 50; // 民忠が70以下なら不満が溜まっているので点数を高くします
                        } else {
                            loyaltyScore = (100 - target.peoplesLoyalty); // それ以外は下がっている分だけ点数にします
                        }
                        
                        const charmBonus = busho.charm / 100;
                        score += Math.floor(loyaltyScore * charmBonus);
                    }
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

                // 6. 攻撃作戦の準備拠点・援軍拠点ならプラス
                const clanOps = this.game.aiOperationManager.operations[clanId];
                const myOp = clanOps ? clanOps[castle.legionId] : null;
                if (clanGoal === '攻撃準備' && myOp) {
                    if (bType !== '無能型') {
                        if (myOp.stagingBase === target.id) {
                            score += 100; // 出撃拠点に集まる点数（一極集中を防ぐため少し下げます）
                        } else if (myOp.supportBase === target.id) {
                            score += 70;  // 忘れられていた「援軍用拠点」にもしっかり集まるようにします
                        }
                    }
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

        // 人数による点数を計算する魔法の道具です（全体の状況とお城の大きさの両方を考慮します）
        const calcCountScore = (count, castleData) => {
            const tScale = castleData.maxKokudaka + castleData.maxCommerce;
            const sRatio = tScale / avgScale;
            const capacity = Math.max(2, Math.floor(avgBushos * sRatio));
            
            let s = 0;
            if (count === 0) {
                s += 200;
            } else {
                const diff = capacity - count;
                if (diff > 0) {
                    s += diff * 20;
                } else {
                    s += diff * 30;
                }
            }
            return s;
        };

        // 目的地ごとに、まとめて移動の行動を作ります
        targetGroups.forEach(group => {
            let actualMovers = [];
            let targetCount = group.target.samuraiIds.length;
            
            for (let busho of group.movers) {
                // 最低でも城主1人は残すため、1人になったら絶対にお引越しさせません
                if (remainingCount <= 1) break;

                const currentTotalScore = calcCountScore(remainingCount, castle) + calcCountScore(targetCount, group.target);
                const nextTotalScore = calcCountScore(remainingCount - 1, castle) + calcCountScore(targetCount + 1, group.target);

                // 移動した方が点数が高くなる（または同じ）なら、お引越し決定です！
                if (nextTotalScore >= currentTotalScore) {
                    actualMovers.push(busho);
                    remainingCount--;
                    targetCount++;
                } else {
                    // 点数が下がるなら、これ以上このお城には送りません
                    break;
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
            const emptyCastles = sameLegionCastles.filter(c => c.samuraiIds.length <= 1 && c.id !== castle.id);
            if (emptyCastles.length > 0 && castle.samuraiIds.length > 4) {
                const lowSkillMovers = availableBushos
                    .filter(b => b.id !== castle.castellanId && !b.isCastellan)
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