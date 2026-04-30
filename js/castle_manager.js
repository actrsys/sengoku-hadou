/**
 * castle_manager.js
 * 城の管理（所有者の変更など）を専門に行うファイルです
 */
class CastleManager {
    constructor(game) {
        this.game = game;
    }

    // 城の持ち主を変更する魔法です。isEventがtrueの時は、イベントによる平和的な変更として扱います。
    changeOwner(castle, newOwnerId, isEvent = false) {
        const oldOwnerId = castle.ownerClan;
        castle.ownerClan = newOwnerId;
        
        // 調査状態などをリセットします
        castle.investigatedUntil = 0;
        
        // ★追加：城の持ち主が変わった時は、おまかせ（委任）を必ず解除します！
        castle.isDelegated = false;
        
        // ★修正：イベントでの変更ではない（合戦などでの奪い合いの）場合のみ、忠誠度や諸勢力への影響を発生させます
        if (!isEvent) {
            // ★追加：城を失った旧勢力の武将たちの忠誠度を下げます！
            if (oldOwnerId !== 0 && oldOwnerId !== newOwnerId) {
                // ★変更：失った後、まだお城が残っているか（滅亡していないか）を調べます！
                const remainingCastles = this.game.castles.filter(c => c.ownerClan === oldOwnerId);
                if (remainingCastles.length > 0) {
                    this.decreaseLoyaltyOnCastleLost(oldOwnerId);
                }
            }

            // ★追加：新しく城を得た勢力の武将たちの忠誠度を上げます！
            if (newOwnerId !== 0 && oldOwnerId !== newOwnerId) {
                this.increaseLoyaltyOnCastleGained(newOwnerId);
            }

            // 持ち主が変わったことによる諸勢力の反発をチェックします
            if (oldOwnerId !== newOwnerId && newOwnerId !== 0) {
                this.applyKunishuRelationDropOnCapture(castle, newOwnerId);
            }
        }

        // ★今回追加：城の持ち主が変わったので、これを外交相手として覚えていた大名家の記憶をリセットします！
        this.game.clans.forEach(clan => {
            if (clan.currentDiplomacyTarget) {
                // 失った大名か、新しく得た大名がターゲットだったら、記憶を忘れさせます
                if (clan.currentDiplomacyTarget.targetId === oldOwnerId || clan.currentDiplomacyTarget.targetId === newOwnerId) {
                    clan.currentDiplomacyTarget = null;
                }
            }
        });

        // ★このお城を使おうとしていた大名家の作戦を中止させる魔法です！
        if (this.game.aiOperationManager && this.game.aiOperationManager.operations) {
            for (const clanIdStr in this.game.aiOperationManager.operations) {
                const clanId = Number(clanIdStr);
                const opDict = this.game.aiOperationManager.operations[clanId];
                
                for (const legionIdStr in opDict) {
                    const legionId = Number(legionIdStr);
                    const op = opDict[legionId];
                    
                    // ★追加：このお城が、作戦に全く関係なければスキップします（高速化の魔法！）
                    let isRelated = false;
                    
                    if (op.type === '攻撃') {
                        if (op.attackTargets && op.attackTargets.length > 0) {
                            isRelated = op.attackTargets.some(t => 
                                (t.isKunishuTarget === false && t.targetId === castle.id) || 
                                t.stagingBase === castle.id || 
                                t.supportBase === castle.id
                            );
                        } else {
                            isRelated = (op.isKunishuTarget === false && op.targetId === castle.id) || 
                                        op.stagingBase === castle.id || 
                                        op.supportBase === castle.id;
                        }
                    }
                    
                    // 調略目標（sabotageTargets）に含まれているかもチェックします
                    if (op.sabotageTargets && op.sabotageTargets.length > 0) {
                        const inSabotage = op.sabotageTargets.some(t => t.castleId === castle.id);
                        if (inSabotage) {
                            isRelated = true;
                        }
                    }

                    // 全く関係ない大名家の作戦なら、この先の重い処理を飛ばして次へ行きます！
                    if (!isRelated) {
                        continue; 
                    }

                    // ★追加：調略目標のリストから、持ち主が変わったお城を綺麗に消しておきます
                    if (op.sabotageTargets && op.sabotageTargets.length > 0) {
                        op.sabotageTargets = op.sabotageTargets.filter(t => t.castleId !== castle.id);
                    }
                    
                    if (op.type === '攻撃') {
                        if (op.attackTargets && op.attackTargets.length > 0) {
                            // 第一目標が消されたかどうかを後で判定するため、最初の目標のIDなどを覚えておきます
                            const currentTargetId = op.targetId;
                            const currentIsKunishu = op.isKunishuTarget;
                            const currentStagingBase = op.stagingBase;

                            // まず、今持ち主が変わったお城に関係する目標や拠点をリストから消します
                            op.attackTargets = op.attackTargets.filter(t => {
                                const isTarget = (t.isKunishuTarget === false && t.targetId === castle.id);
                                const isBase = (t.stagingBase === castle.id || t.supportBase === castle.id);
                                return !(isTarget || isBase);
                            });

                            // リストの先頭から順番に「本当に今も攻められるか」をループでチェックします！
                            let foundValid = false;
                            while (op.attackTargets.length > 0) {
                                const next = op.attackTargets[0];
                                
                                // 先頭の目標が、今まで実行していた作戦と同じなら、何も上書きせずにそのまま続行します！
                                if (next.targetId === currentTargetId && next.isKunishuTarget === currentIsKunishu && next.stagingBase === currentStagingBase) {
                                    foundValid = true;
                                    break;
                                }
                                
                                const targetCastle = next.isKunishuTarget ? null : this.game.getCastle(next.targetId);
                                const stagingCastle = this.game.getCastle(next.stagingBase);
                                
                                let isTargetOk = true;
                                if (!next.isKunishuTarget) {
                                    // 目標が自分のものになっていたり、存在しなければ不合格です
                                    if (!targetCastle || targetCastle.ownerClan === clanId) isTargetOk = false;
                                }
                                // 出撃元のお城が自分のものでなくなっていたら不合格です
                                const isBaseOk = (stagingCastle && stagingCastle.ownerClan === clanId);

                                if (isTargetOk && isBaseOk) {
                                    // 合格！この新しい目標を今のメイン作戦としてセットします
                                    foundValid = true;
                                    op.targetId = next.targetId;
                                    op.isKunishuTarget = next.isKunishuTarget;
                                    op.stagingBase = next.stagingBase;
                                    op.supportBase = next.supportBase;
                                    op.requiredForce = next.requiredForce;
                                    op.requiredRice = next.requiredRice;
                                    op.turnsRemaining = next.turnsRemaining;
                                    op.maxTurns = next.maxTurns;
                                    op.status = next.turnsRemaining <= 0 ? '実行中' : '準備中';
                                    break; 
                                } else {
                                    // ダメならリストから外して、次の予備目標（第三目標など）をチェックします
                                    op.attackTargets.shift();
                                }
                            }

                            // 全部チェックして合格者がゼロなら、作戦のメモを白紙に戻します
                            if (!foundValid) {
                                delete this.game.aiOperationManager.operations[clanId][legionId];
                            }
                        } else {
                            // 予備リストがない場合、今の目標や拠点がダメになったら中止します
                            const isTarget = (op.isKunishuTarget === false && op.targetId === castle.id);
                            const isBase = (op.stagingBase === castle.id || op.supportBase === castle.id);
                            if (isTarget || isBase) {
                                delete this.game.aiOperationManager.operations[clanId][legionId];
                            }
                        }
                    }
                }
            }
        }
    }

    // ★追加：城を失った勢力の、大名以外の武将の忠誠度を全員３ダウンさせる魔法です
    decreaseLoyaltyOnCastleLost(clanId) {
        // その勢力に所属している、活動中で大名ではない武将をみんな集めます
        const bushsoInClan = this.game.bushos.filter(b => b.clan === clanId && b.status === 'active' && !b.isDaimyo);
        
        bushsoInClan.forEach(b => {
            // 忠誠度を3引きます。0より小さくならないように、ストッパー（Math.max）をかけておきます
            b.loyalty = Math.max(0, b.loyalty - 3);
        });
    }

    // ★追加：新しく城を得た勢力の、大名以外の武将の忠誠度を全員３アップさせる魔法です
    increaseLoyaltyOnCastleGained(clanId) {
        // その勢力に所属している、活動中で大名ではない武将をみんな集めます
        const bushsoInClan = this.game.bushos.filter(b => b.clan === clanId && b.status === 'active' && !b.isDaimyo);
        
        bushsoInClan.forEach(b => {
            // 忠誠度を3足します。100より大きくならないように、ストッパー（Math.min）をかけておきます
            b.loyalty = Math.min(100, b.loyalty + 3);
        });
    }

    // 諸勢力の友好度が下がる処理（war_effort.jsからお引越ししてきました）
    applyKunishuRelationDropOnCapture(castle, newOwnerClan) {
        if (newOwnerClan === 0) return; 
        
        const kunishusInCastle = this.game.kunishuSystem.getKunishusInCastle(castle.id);
        
        kunishusInCastle.forEach(kunishu => {
            const currentRel = kunishu.getRelation(newOwnerClan);
            if (currentRel <= 69) {
                const newRel = Math.max(0, currentRel - 20);
                kunishu.setRelation(newOwnerClan, newRel);
                
                if (newOwnerClan === this.game.playerClanId) {
                    this.game.ui.log(`(城の主が変わったため、${kunishu.getName(this.game)}との友好度が低下しました)`);
                }
            }
        });
    }
}