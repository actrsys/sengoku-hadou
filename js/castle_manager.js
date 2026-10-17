/**
 * castle_manager.js
 * 城の管理（所有者の変更など）を専門に行うファイルです
 */
class CastleManager {
    constructor(game) {
        this.game = game;
    }

    /**
     * 現役国主の在城地を軍団の正式な席から求める。
     * Busho.isCommander は表示用の補助値なので、任命候補の除外条件には使用しない。
     * 新設直後など城の軍団番号が未割当でも、現職国主が在城していれば保護する。
     */
    getActiveCommanderCastleIds(clanId) {
        const numericClanId = Number(clanId);
        const result = new Set();
        for (const legion of this.game.legions || []) {
            if (Number(legion.clanId) !== numericClanId || Number(legion.commanderId || 0) <= 0) continue;
            const commander = this.game.getBusho(legion.commanderId);
            if (!commander || Number(commander.clan) !== numericClanId) continue;
            const castle = this.game.getCastle(commander.castleId);
            if (castle && Number(castle.ownerClan) === numericClanId) result.add(Number(castle.id));
        }
        return result;
    }

    /**
     * 低レベル所有者書換API。通常の落城・譲渡は changeOwner() を使用してください。
     * 特殊なロールバックなど、changeOwner() の副作用を発生させたくない場合だけ使用します。
     * ownerClan の直接代入はこのクラス以外では行いません。
     */
    setOwnerIdRaw(castle, newOwnerId) {
        if (!castle) return;
        castle.ownerClan = Number(newOwnerId) || 0;
        this.game.castleOwnershipVersion = (this.game.castleOwnershipVersion || 0) + 1;
        // 勢力色Canvasは通常、所有者が変わった拠点の領域だけを局所更新する。
        // シナリオ切替・初回描画ではupdateClanColors側が全描画へ自動フォールバックする。
        if (!(this.game._castleColorDirtyIds instanceof Set)) this.game._castleColorDirtyIds = new Set();
        const castleId = Number(castle.id);
        if (Number.isFinite(castleId)) this.game._castleColorDirtyIds.add(castleId);
    }

    // 城の持ち主を変更する魔法です。isEventがtrueの時は、イベントによる平和的な変更として扱います。
    changeOwner(castle, newOwnerId, isEvent = false, newLegionId = 0, previousCastellanId = undefined) {
        const oldOwnerId = Number(castle.ownerClan);
        const oldLegionId = Number(castle.legionId || 0);
        // 合戦では捕縛・撤退により、所有者変更前に旧城主が名簿から外れる。
        // 戦争開始時に控えた城主IDが渡された場合はそれを旧軍団長の判定正本にする。
        const oldCastellanId = previousCastellanId === undefined
            ? Number(castle.castellanId || 0) : Number(previousCastellanId || 0);

        this.setOwnerIdRaw(castle, newOwnerId);
        castle.legionId = Number(newLegionId); // 攻撃側の軍団IDになる
        // 元の本拠地を失った場合は記録だけ失効させる。次の本拠地取得時に
        // 残存する直轄拠点から再選定する（軍団領の強制接収はしない）。
        if (oldOwnerId !== Number(newOwnerId)) {
            const oldClan = this.game.getClan(oldOwnerId);
            if (oldClan && Number(oldClan.homeCastleId) === Number(castle.id)) {
                oldClan.homeCastleId = 0;
            }
        }

        // 石山城と尾山城のこっそり改名イベント
        if (castle.id === 33 || castle.id === 74) {
            // 本願寺家の定義は諸勢力専門部署へ一元化し、ここでは結果だけを利用します。
            const isHonganji = newOwnerId !== 0
                && this.game.kunishuSystem
                && this.game.kunishuSystem.isHonganjiClan(newOwnerId);

            // 石山城（ID:33）の改名処理
            if (castle.id === 33) {
                if (isHonganji && castle.name === '石山城') {
                    castle.name = '石山御坊';
                    castle.yomi = 'いしやまごぼう';
                } else if (!isHonganji && castle.name === '石山御坊') {
                    castle.name = '石山城';
                    castle.yomi = 'いしやまじょう';
                }
            }
            
            // 尾山城（ID:74）の改名処理
            if (castle.id === 74) {
                if (isHonganji && castle.name === '尾山城') {
                    castle.name = '尾山御坊';
                    castle.yomi = 'おやまごぼう';
                } else if (!isHonganji && castle.name === '尾山御坊') {
                    castle.name = '尾山城';
                    castle.yomi = 'おやまじょう';
                }
            }
        }

        // 調査状態などをリセットします
        castle.investigatedUntil = 0;
        
        // 落城・譲渡後は旧勢力の手動設定を引き継がず、新軍団番号に応じた初期委任へ戻す。
        // 従来の実効動作（軍団領は自動委任）を維持し、攻撃・移動許可は所有者変更時だけ初期化する。
        castle.isDelegated = Number(newLegionId) > 0;
        if (oldOwnerId !== Number(newOwnerId)) {
            castle.allowAttack = true;
            castle.allowMove = true;
        }

        // ★追加：旧軍団の城がゼロになったかチェックして、ゼロなら壊滅させる
        if (oldOwnerId !== 0 && oldLegionId !== 0) {
            const remaining = this.game.castles.filter(c => Number(c.ownerClan) === oldOwnerId && Number(c.legionId) === oldLegionId);
            const targetLegion = this.game.legions.find(l => Number(l.clanId) === oldOwnerId && Number(l.legionNo) === oldLegionId);
            
            if (targetLegion) {
                if (remaining.length === 0) {
                    // ★修正：oldLegionIdは軍団No(1~8)なので、正確な軍団データを探し出して固有IDを渡すように直します！
                    this.disbandLegion(targetLegion.id);
                } else if (oldCastellanId > 0 && oldCastellanId === Number(targetLegion.commanderId)) {
                    // 城が残っていても、旧国主の居城が奪われた場合は軍団を解散する
                    this.disbandLegion(targetLegion.id);
                }
            }
        }

        // ★追加：城を奪われた勢力のお城がすべて無くなったかチェックして、ゼロなら滅亡の印をつける
        if (oldOwnerId !== 0 && oldOwnerId !== newOwnerId) {
            const allRemainingCastles = this.game.castles.filter(c => Number(c.ownerClan) === oldOwnerId);
            if (allRemainingCastles.length === 0) {
                const destroyedClan = this.game.getClan(oldOwnerId);
                if (destroyedClan) {
                    destroyedClan.isDestroyed = true;
                }
            }
        }
        
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
                this.game.kunishuSystem.applyRelationDropOnCastleCapture(castle, newOwnerId);
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

    // 軍団解散の正規窓口。軍団モデル・所属城・AI計画を一度に初期化します。
    disbandLegion(legionId) {
        if (!legionId || legionId === 0 || !this.game.legions) return 0;
        
        const legion = this.game.legions.find(l => Number(l.id) === Number(legionId));
        if (!legion) return 0;

        const commanderId = Number(legion.commanderId || 0);
        if (commanderId > 0) {
            const commander = this.game.getBusho(commanderId);
            if (commander) commander.isCommander = false;
        }

        const clanId = Number(legion.clanId);
        const legionNo = Number(legion.legionNo);
        legion.commanderId = 0;
        legion.objective = null;
        legion.status = 'wait';
        legion.targetId = 0;
        legion.route = [];

        // 現行AI作戦管理の正規APIへ解散を通知します。旧形式の直接削除フォールバックは持ちません。
        if (this.game.aiOperationManager?.clearLegionPlanning) {
            this.game.aiOperationManager.clearLegionPlanning(clanId, legionNo);
        }

        let count = 0;
        // c.legionId は軍団固有IDではなく、その大名家内の軍団Noです。
        this.game.castles
            .filter(c => Number(c.ownerClan) === clanId && Number(c.legionId) === legionNo)
            .forEach(c => {
                c.legionId = 0;
                c.isDelegated = false;
                count++;
            });
        return count;
    }

    // ★追加：城を失った勢力の、大名以外の武将の忠誠度を全員３ダウンさせる魔法です
    decreaseLoyaltyOnCastleLost(clanId) {
        // その勢力に所属している、活動中で大名ではない武将をみんな集めます
        const bushsoInClan = this.game.getClanBushos(clanId).filter(b => window.BushoStatusRules.isActive(b) && !b.isDaimyo);
        
        bushsoInClan.forEach(b => {
            // 忠誠度を3引きます。0より小さくならないように、ストッパー（Math.max）をかけておきます
            b.loyalty = Math.max(0, b.loyalty - 3);
        });
    }

    // ★追加：新しく城を得た勢力の、大名以外の武将の忠誠度を全員３アップさせる魔法です
    increaseLoyaltyOnCastleGained(clanId) {
        // その勢力に所属している、活動中で大名ではない武将をみんな集めます
        const bushsoInClan = this.game.getClanBushos(clanId).filter(b => window.BushoStatusRules.isActive(b) && !b.isDaimyo);
        
        bushsoInClan.forEach(b => {
            // 忠誠度を3足します。100より大きくならないように、ストッパー（Math.min）をかけておきます
            b.loyalty = Math.min(100, b.loyalty + 3);
        });
    }


}