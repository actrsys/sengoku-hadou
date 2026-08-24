/**
 * war_preparation_controller.js
 * 出陣準備・自軍援軍・他勢力援軍・開戦直前のUIフローを管理する。
 *
 * - 戦争本体の進行・解決は WarManager
 * - 援軍を承諾するかは DiplomacyManager
 * - 承諾後の援軍編成・資源消費は ReinforcementService
 * - このControllerは、それらを順番に呼ぶ「開戦準備の司令塔」だけを担当する。
 */
class WarPreparationController {
    constructor(game) {
        this.game = game;
    }

    checkReinforcementAndStartWar(atkCastle, targetCastleId, atkBushos, sVal, rVal, hVal, gVal, extraData = null) {
        const myClanId = atkCastle.ownerClan;
        let targetCastle = this.game.getCastle(targetCastleId);
        
        // ★追加：海戦ルートかどうかを判定して、一番最初に記録します！
        this.game.warManager.state = this.game.warManager.state || {};
        this.game.warManager.state.isSeaBattle = MapGraphService.isSeaRoute(this.game, atkCastle, targetCastle, myClanId);
        
        // ★追加：諸勢力の場合はダミーのターゲットオブジェクトを作る
        if (extraData && extraData.isKunishu) {
            const kunishu = this.game.kunishuSystem.getKunishu(extraData.kunishuId);
            const tgtProv = this.game.provinces.find(p => p.id === targetCastle.provinceId);
            const provName = tgtProv ? tgtProv.province : "不明な国";
            targetCastle = Object.assign({}, targetCastle, {
                name: `${provName} ${kunishu.getName(this.game)}`,
                isKunishu: true,
                kunishuId: kunishu.id,
                soldiers: kunishu.soldiers,
                rice: kunishu.soldiers * 2, // 無から湧く兵糧
                horses: kunishu.horses || 0,
                guns: kunishu.guns || 0,
                defense: kunishu.defense,
                training: kunishu.training,
                morale: kunishu.morale,
                ownerClan: -1 // ★ここを書き足し！諸勢力の陣地なので、お城の持ち主を一時的に「無所属（-1）」にします！
            });
            this.game.warManager.state = this.game.warManager.state || {};
            this.game.warManager.state.isKunishuSubjugation = true; 
        } else {
            this.game.warManager.state = this.game.warManager.state || {};
            this.game.warManager.state.isKunishuSubjugation = false;
        }
        
        const pid = this.game.playerClanId;
        
        // ★修正：共通の魔法を使って、繋がっている領土をサクッと取得します！
        if (this.game.writeSystemDiagnostic) this.game.writeSystemDiagnostic('war_prepare:connected:start', atkCastle);
        const connectedCastles = this.game.mapGraph.getOwnedConnectedIds(atkCastle, myClanId);
        if (this.game.writeSystemDiagnostic) this.game.writeSystemDiagnostic('war_prepare:connected:done', atkCastle);
        
        // ★修正：条件のチェックをすべて「外交の専門部署」に任せます！
        if (this.game.writeSystemDiagnostic) this.game.writeSystemDiagnostic('war_prepare:self_reinforcement_scan:start', atkCastle);
        const selfCandidates = this.game.diplomacyManager.findAvailableReinforcements(
            true, false, atkCastle.id, targetCastle, myClanId, targetCastle.ownerClan, connectedCastles
        );
        if (this.game.writeSystemDiagnostic) this.game.writeSystemDiagnostic('war_prepare:self_reinforcement_scan:done', atkCastle);

        // ★追加：兵数や武将が変わるので、最新のものを引数で受け取るようにしました
        const proceedToAlly = (selfReinfData, currentAtkBushos = atkBushos, currentSVal = sVal) => {
            // ★修正：こちらも他勢力の条件チェックを「外交の専門部署」に一任します！
            if (this.game.writeSystemDiagnostic) this.game.writeSystemDiagnostic('war_prepare:ally_reinforcement_scan:start', atkCastle);
            const allyForceCandidates = this.game.diplomacyManager.findAvailableReinforcements(
                false, false, atkCastle.id, targetCastle, myClanId, targetCastle.ownerClan, connectedCastles
            );
            if (this.game.writeSystemDiagnostic) this.game.writeSystemDiagnostic('war_prepare:ally_reinforcement_scan:done', atkCastle);

            if (allyForceCandidates.length === 0) {
                this.game.warManager.startWar(atkCastle, targetCastle, currentAtkBushos, currentSVal, rVal, hVal, gVal, null, selfReinfData);
                return;
            }

            const allyCastles = [...new Set(allyForceCandidates.map(fc => fc.castle))];
            
            if (myClanId === pid && !atkCastle.isDelegated) {
                this.game.ui.showDialog("他勢力に援軍を要請しますか？", true, 
                    () => {
                        this.game.ui.showReinforcementSelector(allyCastles, atkCastle, targetCastle, currentAtkBushos, currentSVal, rVal, hVal, gVal, selfReinfData);
                    },
                    () => {
                        this.game.warManager.startWar(atkCastle, targetCastle, currentAtkBushos, currentSVal, rVal, hVal, gVal, null, selfReinfData);
                    },
                    { okText: '要請する', cancelText: '要請しない', closeBeforeOk: true, closeBeforeCancel: true }
                );
            } else {
                allyForceCandidates.sort((a,b) => b.force.soldiers - a.force.soldiers);
                const best = allyForceCandidates[0];
                best.castle.selectedForce = best.force; 

                // 大名家への持参金は攻守共通でDiplomacyManagerを正本とします。
                const reinfGold = best.force.isKunishu
                    ? 0
                    : this.game.diplomacyManager.calcReinforcementOfferGold(myClanId, best.force.id, atkCastle.gold);

                this.executeReinforcementRequest(reinfGold, best.castle, atkCastle, targetCastle, currentAtkBushos, currentSVal, rVal, hVal, gVal, selfReinfData);
            }
        };

        const askConfirmAndProceedToAlly = (selfReinfData) => {
            if (myClanId === pid && !atkCastle.isDelegated) {
                const confirmMsg = targetCastle.isKunishu ? `${targetCastle.name} を鎮圧しますか？\n今月の命令は終了となります` : `${targetCastle.name}に攻め込みますか？\n今月の命令は終了となります`;
                this.game.ui.showDialog(confirmMsg, true, 
                    async () => {
                        proceedToAlly(selfReinfData, atkBushos, sVal);
                    },
                    () => {
                        // キャンセルした時
                        if (selfReinfData) {
                            this.game.reinforcementService.restoreCastleReinforcement(selfReinfData);
                            selfReinfData.bushos.forEach(b => b.isActionDone = false);
                        }
                        this.game.ui.cancelMapSelection();
                        this.game.ui.scrollToActiveCastle(atkCastle);
                    },
                    { okText: '出陣する', okClass: 'btn-danger', cancelText: 'やめる', closeBeforeOk: true, closeBeforeCancel: true }
                );
            } else {
                proceedToAlly(selfReinfData, atkBushos, sVal);
            }
        };

        if (selfCandidates.length === 0) {
            askConfirmAndProceedToAlly(null);
        } else {
            if (myClanId === pid && !atkCastle.isDelegated) {
                this.game.ui.showDialog("他の城から援軍を出しますか？", true, 
                    () => {
                        this.game.ui.showSelfReinforcementSelector(selfCandidates, atkCastle, targetCastle, askConfirmAndProceedToAlly);
                    },
                    () => {
                        askConfirmAndProceedToAlly(null);
                    },
                    { okText: '援軍を出す', cancelText: '出さない', closeBeforeOk: true, closeBeforeCancel: true }
                );
            } else {
                selfCandidates.sort((a,b) => b.soldiers - a.soldiers);
                this.executeSelfReinforcementAuto(selfCandidates[0], atkCastle, targetCastle, askConfirmAndProceedToAlly);
            }
        }
    }
    
    executeSelfReinforcementAuto(helperCastle, atkCastle, targetCastle, onComplete) {
        const selfReinfData = this.game.reinforcementService.createAutoSelfReinforcement(helperCastle, {
            isSelf: true
        });

        // 参戦メッセージは攻め込んだ後に war_effort.js 側で表示します。
        onComplete(selfReinfData);
    }

    // ★ 引数の最後に「backToMap」を追加
    promptPlayerAtkSelfReinforcement(helperCastle, atkCastle, targetCastle, onComplete, backToMap) {
        const promptBusho = () => {
            this.game.ui.openBushoSelector('atk_self_reinf_deploy', helperCastle.id, {
                onConfirm: (selectedIds) => {
                    // ★追加：大雪の判定に使うために「targetCastle」を渡してあげます
                    this.handleBushoSelectionForSelfReinf(helperCastle.id, selectedIds, targetCastle, onComplete, promptBusho, backToMap);
                },
                onCancel: () => {
                    // ★ 変更：キャンセルした時は、完全にやめるのではなく城選択マップに戻ります！
                    if (backToMap) backToMap();
                    else onComplete(null);
                }
            });
        };
        promptBusho();
    }

    handleBushoSelectionForSelfReinf(helperCastleId, selectedIds, targetCastle, onComplete, promptBusho) {
        const helperCastle = this.game.getCastle(helperCastleId);
        const reinfBushos = selectedIds.map(id => this.game.getBusho(id));
        this.game.ui.openQuantitySelector('atk_self_reinf_supplies', [helperCastle], null, {
            onConfirm: (inputs) => {
                const inputData = inputs[helperCastle.id] || inputs;
                const reinfSoldiers = inputData.soldiers ? parseInt(inputData.soldiers.num.value) : 500;
                const reinfRice = inputData.rice ? parseInt(inputData.rice.num.value) : 500;
                const reinfHorses = inputData.horses ? parseInt(inputData.horses.num.value) : 0;
                const reinfGuns = inputData.guns ? parseInt(inputData.guns.num.value) : 0;

                // 被害計算はメイン軍決定後。ここでは援軍データ作成と城在庫の減算だけを専門Serviceへ任せます。
                const selfReinfData = this.game.reinforcementService.createManualCastleReinforcement(
                    helperCastle, reinfBushos,
                    { soldiers: reinfSoldiers, rice: reinfRice, horses: reinfHorses, guns: reinfGuns },
                    { isSelf: true }
                );
                
                onComplete(selfReinfData);
            },
            onCancel: promptBusho
        });
    }
    
    // ★守備側の自軍援軍を選ぶための魔法！
    promptPlayerDefSelfReinforcement(helperCastle, defCastle, onComplete, backToMap) {
        const promptBusho = () => {
            this.game.ui.openBushoSelector('def_self_reinf_deploy', helperCastle.id, {
                onConfirm: (selectedIds) => {
                    // ★追加：大雪の判定に使うために「defCastle」を渡してあげます
                    this.handleBushoSelectionForDefSelfReinf(helperCastle.id, selectedIds, defCastle, onComplete, promptBusho);
                },
                onCancel: () => {
                    if (backToMap) backToMap();
                    else onComplete(null);
                }
            });
        };
        promptBusho();
    }

    handleBushoSelectionForDefSelfReinf(helperCastleId, selectedIds, defCastle, onComplete, promptBusho) {
        const helperCastle = this.game.getCastle(helperCastleId);
        const reinfBushosData = selectedIds;
        this.game.ui.openQuantitySelector('def_self_reinf_supplies', [helperCastle], null, {
            onConfirm: (inputs) => {
                const inputData = inputs[helperCastle.id] || inputs;
                const reinfSoldiers = inputData.soldiers ? parseInt(inputData.soldiers.num.value) : 500;
                const reinfRice = inputData.rice ? parseInt(inputData.rice.num.value) : 500;
                const reinfHorses = inputData.horses ? parseInt(inputData.horses.num.value) : 0;
                const reinfGuns = inputData.guns ? parseInt(inputData.guns.num.value) : 0;

                const srcProv = this.game.provinces.find(p => p.id === helperCastle.provinceId);
                const tgtProv = this.game.provinces.find(p => p.id === defCastle.provinceId);
                const isHeavySnow = (srcProv && srcProv.statusEffects && srcProv.statusEffects.includes('heavySnow')) || 
                                    (tgtProv && tgtProv.statusEffects && tgtProv.statusEffects.includes('heavySnow'));

                const proceedWar = async () => {
                    let finalBushos = reinfBushosData.map(id => this.game.getBusho(id));

                    const selfReinfData = this.game.reinforcementService.createManualCastleReinforcement(
                        helperCastle, finalBushos,
                        { soldiers: reinfSoldiers, rice: reinfRice, horses: reinfHorses, guns: reinfGuns },
                        { isAttacker: false, isSelf: true }
                    );
                    
                    onComplete(selfReinfData);
                };

                if (isHeavySnow) {
                    this.game.ui.showDialog("大雪の影響により、被害が出る場合があります。\nそれでも出陣しますか？", true, () => {
                        proceedWar(); 
                    }, null, { closeBeforeOk: true });
                } else {
                    proceedWar();
                }
            },
            onCancel: promptBusho
        });
    }

    executeReinforcementRequest(gold, helperCastle, atkCastle, targetCastle, atkBushos, sVal, rVal, hVal, gVal, selfReinfData) {
        if (gold > 0) atkCastle.gold -= gold;

        const force = helperCastle.selectedForce;
        const myClanId = atkCastle.ownerClan;
        
        // ★ここから追加：大雪の判定です
        const srcProv1 = this.game.provinces.find(p => p.id === helperCastle.provinceId);
        const srcProv2 = this.game.provinces.find(p => p.id === atkCastle.provinceId);
        const tgtProv = this.game.provinces.find(p => p.id === targetCastle.provinceId);
        const isHeavySnow = (srcProv1 && srcProv1.statusEffects && srcProv1.statusEffects.includes('heavySnow')) ||
                            (srcProv2 && srcProv2.statusEffects && srcProv2.statusEffects.includes('heavySnow')) ||
                            (tgtProv && tgtProv.statusEffects && tgtProv.statusEffects.includes('heavySnow'));

        // ★追加：戦力比較用の合計兵力算出
        let atkTotalSoldiers = sVal;
        if (selfReinfData) atkTotalSoldiers += selfReinfData.soldiers;
        const defTotalSoldiers = targetCastle.soldiers;
        
        // ★ 追加：諸勢力が選ばれていた場合の特別な処理です！
        if (force && force.isKunishu) {
            const kunishu = this.game.kunishuSystem.getKunishu(force.id);
            const currentRel = kunishu.getRelation(myClanId);
            
            const decision = this.game.diplomacyManager.checkAIReinforcementAcceptance({
                requesterClanId: myClanId,
                helperForceId: force.id,
                enemyClanId: targetCastle.ownerClan,
                gold,
                isKunishu: true,
                requesterTotalSoldiers: atkTotalSoldiers,
                enemyTotalSoldiers: defTotalSoldiers,
                helperCastleId: helperCastle.id,
                isHeavySnow
            });
            
            if (!decision.accepted) {
                if (myClanId === this.game.playerClanId) {
                    const leader = this.game.getBusho(kunishu.leaderId);
                    const leaderName = leader ? leader.name : "頭領";
                    const nameStr = `${kunishu.getName(this.game)}の${leaderName}`;
                    
                    // ★メッセージ係にお任せします！
                    this.game.warManager.reinfMsgHelper.showRefusal(this.game, nameStr, decision.blockedByHeavySnow, () => {
                        this.game.warManager.startWar(atkCastle, targetCastle, atkBushos, sVal, rVal, hVal, gVal, null, selfReinfData);
                    });
                } else {
                    this.game.warManager.startWar(atkCastle, targetCastle, atkBushos, sVal, rVal, hVal, gVal, null, selfReinfData);
                }
                return;
            }
            
            // 借りを作ったので友好度が少し下がります
            this.game.kunishuSystem.setRelation(kunishu, myClanId, currentRel - 10);
            
            const reinforcementData = this.game.reinforcementService.createAutoKunishuReinforcement(
                kunishu,
                helperCastle,
                currentRel,
                { isSelf: false, isKunishuForce: true }
            );
            
            if (myClanId === this.game.playerClanId) {
                const leader = this.game.getBusho(kunishu.leaderId);
                const leaderName = leader ? leader.name : "頭領";
                const nameStr = `${kunishu.getName(this.game)}の${leaderName}`;
                
                // ★メッセージ係にお任せします！
                this.game.warManager.reinfMsgHelper.showAcceptance(this.game, nameStr, true, atkCastle.isDelegated, false, () => {
                    this.game.warManager.startWar(atkCastle, targetCastle, atkBushos, sVal, rVal, hVal, gVal, reinforcementData, selfReinfData);
                });
            } else {
                this.game.warManager.startWar(atkCastle, targetCastle, atkBushos, sVal, rVal, hVal, gVal, reinforcementData, selfReinfData);
            }
            return;
        }

        // 以降は今まで通りの大名家の処理です
        const helperClanId = helperCastle.ownerClan;
        const enemyClanId = targetCastle.ownerClan;
        const myToHelperRel = this.game.getRelation(myClanId, helperClanId);
        // helperToEnemyRel は外交専門部署で使うので、ここでは消しておきます

        if (helperClanId === this.game.playerClanId) {
            const myClanName = this.game.clans.find(c => c.id === myClanId)?.name || "不明";
            
            let targetInfoStr = "";
            const provData = this.game.provinces.find(p => p.id === targetCastle.provinceId);
            const provName = provData ? provData.province : "不明な国";

            if (targetCastle.isKunishu) {
                const kunishu = this.game.kunishuSystem.getKunishu(targetCastle.kunishuId);
                const kName = kunishu ? kunishu.getName(this.game) : "諸勢力";
                targetInfoStr = `${provName}の${kName}の攻略のため、\n`;
            } else if (targetCastle.ownerClan === 0) {
                targetInfoStr = `${provName}の${targetCastle.name}の攻略のため、\n`;
            } else {
                const targetClanName = this.game.clans.find(c => c.id === enemyClanId)?.name || "中立勢力";
                targetInfoStr = `${targetClanName}の${targetCastle.name}の攻略のため、\n`;
            }

            // ★修正：AI（要請側）から見てプレイヤー（受諾側）が「支配」されている相手かどうかを確認します！
            const isBoss = (myToHelperRel && myToHelperRel.status === window.GameConstants.DiplomacyStatus.DOMINANT);
            const startSelection = () => this._promptPlayerAtkReinforcement(helperCastle, atkCastle, targetCastle, atkBushos, sVal, rVal, hVal, gVal, isBoss, selfReinfData);
            
            // ★メッセージ係にお任せします！
            this.game.warManager.reinfMsgHelper.showRequest(this.game, myClanName, targetInfoStr, gold, isBoss, true, startSelection, () => {
                this.game.diplomacyManager.updateSentiment(myClanId, helperClanId, -10);
                this.game.ui.showDialog(`援軍要請を断りました。`, false, () => {
                    this.game.warManager.startWar(atkCastle, targetCastle, atkBushos, sVal, rVal, hVal, gVal, null, selfReinfData);
                }, null, { closeBeforeOk: true });
            });
            return;
        }

        const decision = this.game.diplomacyManager.checkAIReinforcementAcceptance({
            requesterClanId: myClanId,
            helperForceId: helperClanId,
            enemyClanId,
            gold,
            isKunishu: false,
            requesterTotalSoldiers: atkTotalSoldiers,
            enemyTotalSoldiers: defTotalSoldiers,
            helperCastleId: helperCastle.id,
            isHeavySnow
        });

        if (!decision.accepted) {
            if (myClanId === this.game.playerClanId) {
                const castellan = this.game.getBusho(helperCastle.castellanId);
                const castellanName = castellan ? castellan.name : "城主";
                const nameStr = `${helperCastle.name}の${castellanName}`;
                
                // ★メッセージ係にお任せします！
                this.game.warManager.reinfMsgHelper.showRefusal(this.game, nameStr, decision.blockedByHeavySnow, () => {
                    this.game.warManager.startWar(atkCastle, targetCastle, atkBushos, sVal, rVal, hVal, gVal, null, selfReinfData);
                });
            } else {
                this.game.warManager.startWar(atkCastle, targetCastle, atkBushos, sVal, rVal, hVal, gVal, null, selfReinfData);
            }
            return;
        }

        if (!window.DiplomacyRules.isAllianceOrVassal(myToHelperRel.status)) this.game.diplomacyManager.updateSentiment(myClanId, helperClanId, -10);

        const helperDaimyo = this.game.bushos.find(b => b.clan === helperClanId && b.isDaimyo) || { duty: 50 };
        const reinforcementData = this.game.reinforcementService.createAutoClanReinforcement(
            helperCastle,
            myToHelperRel,
            helperDaimyo,
            { isSelf: false }
        );

        this.game.warManager.applyWarHostility(helperCastle.ownerClan, false, targetCastle.ownerClan, targetCastle.isKunishu, true);
        
        if (myClanId === this.game.playerClanId) {
            const castellan = this.game.getBusho(helperCastle.castellanId);
            const castellanName = castellan ? castellan.name : "城主";
            const nameStr = `${helperCastle.name}の${castellanName}`;
            
            // ★メッセージ係にお任せします！
            this.game.warManager.reinfMsgHelper.showAcceptance(this.game, nameStr, false, atkCastle.isDelegated, false, () => {
                this.game.warManager.startWar(atkCastle, targetCastle, atkBushos, sVal, rVal, hVal, gVal, reinforcementData, selfReinfData);
            });
        } else {
            this.game.warManager.startWar(atkCastle, targetCastle, atkBushos, sVal, rVal, hVal, gVal, reinforcementData, selfReinfData);
        }
    }

    _promptPlayerAtkReinforcement(helperCastle, atkCastle, targetCastle, atkBushos, sVal, rVal, hVal, gVal, isBoss, selfReinfData) {
        const promptBusho = () => {
            this.game.ui.openBushoSelector('atk_reinf_deploy', helperCastle.id, {
                hideCancel: isBoss, 
                onConfirm: (selectedBushoIds) => promptQuantity(selectedBushoIds.map(id => this.game.getBusho(id))),
                onCancel: () => this.game.ui.showDialog("援軍の派遣を取りやめました。", false, () => this.game.warManager.startWar(atkCastle, targetCastle, atkBushos, sVal, rVal, hVal, gVal, null, selfReinfData), null, { closeBeforeOk: true })
            });
        };
        const promptQuantity = (reinfBushos) => {
            this.game.ui.openQuantitySelector('atk_reinf_supplies', [helperCastle], null, {
                onConfirm: (inputs) => {
                    const i = inputs[helperCastle.id] || inputs;
                    const rS = i.soldiers ? parseInt(i.soldiers.num.value) : 500;
                    const rR = i.rice ? parseInt(i.rice.num.value) : 500;
                    const rH = i.horses ? parseInt(i.horses.num.value) : 0;
                    const rG = i.guns ? parseInt(i.guns.num.value) : 0;
                    this._applyManualAtkReinforcement(helperCastle, atkCastle, targetCastle, atkBushos, sVal, rVal, hVal, gVal, reinfBushos, rS, rR, rH, rG, selfReinfData);
                },
                onCancel: promptBusho
            });
        };
        promptBusho();
    }

    _applyManualAtkReinforcement(helperCastle, atkCastle, targetCastle, atkBushos, sVal, rVal, hVal, gVal, reinfBushos, reinfSoldiers, reinfRice, reinfHorses, reinfGuns, selfReinfData) {
        const reinforcementData = this.game.reinforcementService.createManualCastleReinforcement(
            helperCastle, reinfBushos,
            { soldiers: reinfSoldiers, rice: reinfRice, horses: reinfHorses, guns: reinfGuns },
            { isAttacker: true, isSelf: false }
        );

        this.game.warManager.applyWarHostility(helperCastle.ownerClan, false, targetCastle.ownerClan, targetCastle.isKunishu, true);
        
        // ★修正：手動で友軍を出した時の「出発しました！」のお返事を復活させます！
        this.game.ui.showDialog(`自軍の同盟援軍が出発しました！\n共に ${targetCastle.name} へ侵攻します！`, false, () => {
            this.game.warManager.startWar(atkCastle, targetCastle, atkBushos, sVal, rVal, hVal, gVal, reinforcementData, selfReinfData);
        });
    }
    

}

window.WarPreparationController = WarPreparationController;
