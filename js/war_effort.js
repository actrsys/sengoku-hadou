/**
 * war_effort.js
 * 戦争の準備（戦前）と、戦後処理・捕虜の処遇などを担当するファイルです
 * Object.assignではそれぞれのメソッドの間に必ずカンマが必要です
 */
 
// Object.assign を使って、WarManager に魔法をくっつけます！
Object.assign(WarManager.prototype, {

    // ★追加：通知やアニメーションを表示するかどうかを判定する一元管理の魔法
    canShowNotify(isPlayerFactionInvolved, isPlayerInvolved = false) {
        // プレイヤー自身が操作・関与している戦闘なら、絶対に表示します！
        if (isPlayerInvolved) return true;
        
        // AI戦争の通知設定がオフで、かつプレイヤーの勢力が一切関わっていなければ非表示（false）にします
        const isNotifyOff = window.UserSettings && window.UserSettings.aiWarNotify === false;
        if (isNotifyOff && !isPlayerFactionInvolved) return false;
        
        // それ以外（通知オン、またはプレイヤーの勢力が関わっている）なら表示します
        return true;
    },
    
    // ★Round 9：援軍の「所属大名家」を一元判定します。
    // 諸勢力は城に滞在していても、その城を所有する大名家の部隊ではありません。
    getReinforcementClanId(reinfData) {
        if (!reinfData) return null;
        if (reinfData.isKunishuForce || reinfData.isKunishu || Number(reinfData.kunishuId || 0) > 0) return null;
        const helperCastle = reinfData.castle;
        if (!helperCastle || helperCastle.isKunishu) return null;
        const clanId = Number(helperCastle.ownerClan);
        return Number.isFinite(clanId) && clanId > 0 ? clanId : null;
    },

    // ★Round 9：援軍が「プレイヤー勢力そのもの」かを一元判定します。
    isPlayerClanReinforcement(reinfData, playerClanId = null) {
        const clanId = this.getReinforcementClanId(reinfData);
        if (clanId === null) return false;
        const pid = playerClanId === null ? Number(this.game.playerClanId) : Number(playerClanId);
        return clanId === pid;
    },
    
    // ★追加：メッセージ用の家名を一元管理する魔法（プレイヤー自身の家なら「当家」に差し替えます）
    getDisplayClanName(clanId, rawName) {
        const pid = Number(this.game.playerClanId);
        return (Number(clanId) === pid) ? "当家" : rawName;
    },
    
    // ★追加：部隊のリストの中で、大名や城主を探して一番前（総大将）に移動させる共通の魔法です！
    setLeaderToFront(bushos) {
        if (!bushos || bushos.length <= 1) return;
        let leaderIdx = bushos.findIndex(b => b.isDaimyo);
        if (leaderIdx === -1) leaderIdx = bushos.findIndex(b => b.isCastellan);
        if (leaderIdx > 0) {
            const leader = bushos.splice(leaderIdx, 1)[0];
            bushos.unshift(leader);
        }
    },
    
    // ★追加：大名や国主が他軍団の城に逃げ込んだ時に、軍団を解散させる共通の魔法です！
    handleDaimyoEscape(busho, targetCastle) {
        if (busho.isDaimyo && Number(targetCastle.legionId) !== 0) {
            // 大名が他軍団に逃げ込んだ場合は、逃げ込んだ先の軍団を解散して直轄にする
            if (this.game.castleManager && this.game.castleManager.disbandLegion) {
                this.game.castleManager.disbandLegion(targetCastle.legionId);
            }
            targetCastle.legionId = 0;
            targetCastle.isDelegated = false;
        } else if (busho.isCommander) {
            // 国主が「自分の軍団以外」の城に逃げ込んだ場合は、自分の元の軍団を解散する（解任）
            const myLegion = this.game.legions ? this.game.legions.find(l => Number(l.commanderId) === Number(busho.id)) : null;
            if (myLegion && Number(targetCastle.legionId) !== Number(myLegion.legionNo)) {
                if (this.game.castleManager && this.game.castleManager.disbandLegion) {
                    this.game.castleManager.disbandLegion(myLegion.id);
                }
            }
        }
    },

    // ★追加：落城時などに逃げ込む「味方の城」の候補を探し出す魔法
    getEscapeCandidates(defCastle) {
        const oldOwner = Number(defCastle.ownerClan);
        
        // ★追加：持ち主が0（中立）のお城の場合は、そもそも味方はいないので探しに行きません！
        if (oldOwner === 0) return [];
        
        const oldLegionId = Number(defCastle.legionId || 0);
        const allFriendlyCastles = this.game.castles.filter(c => Number(c.ownerClan) === oldOwner && Number(c.id) !== Number(defCastle.id));
        
        if (allFriendlyCastles.length === 0) return [];
        
        const hasDaimyo = this.game.getCastleBushos(defCastle.id).some(b => b.isDaimyo);
        
        // 1. まずは同じ軍団IDの城を探す
        let candidates = allFriendlyCastles.filter(c => Number(c.legionId || 0) === oldLegionId);
        
        // 2. なければ直轄（ID0）の城を探す
        if (candidates.length === 0) {
            candidates = allFriendlyCastles.filter(c => Number(c.legionId || 0) === 0);
        }
        
        // 3. 大名がいて、直轄領もない場合、他軍団の城へ
        if (candidates.length === 0 && hasDaimyo) {
            // 国主がいない城を優先する
            const withoutCommander = allFriendlyCastles.filter(c => {
                const legion = this.game.legions ? this.game.legions.find(l => Number(l.id) === Number(c.legionId)) : null;
                return !legion || !legion.commanderId;
            });
            if (withoutCommander.length > 0) {
                candidates = withoutCommander;
            } else {
                candidates = allFriendlyCastles;
            }
        }
        
        // それでもなければ、どこでもいいから自領へ（武将を宙ぶらりんにしない）
        if (candidates.length === 0) {
            candidates = allFriendlyCastles;
        }
        
        // 経路がつながっているものを優先して返す
        const reachable = candidates.filter(c => MapGraphService.isReachable(this.game, defCastle, c, oldOwner));
        if (reachable.length > 0) {
            return reachable;
        }
        
        // 繋がっていなくても、最終的には必ずどこかの自領に逃げるようにする
        return candidates;
    },

    // ★ここから追加：解放された捕虜が帰るお城（帰還先）を決める一元化された魔法です！
    getReleaseReturnCastle(prisoner, friendlyCastles, originalClanId) {
        if (!friendlyCastles || friendlyCastles.length === 0) return null;

        let returnCandidates = friendlyCastles;
        let targetLegionId = null;

        // 大名の場合は、まず直轄領（軍団ID: 0）を優先して探します
        if (prisoner.isDaimyo) {
            targetLegionId = 0;
        } 
        // 国主の場合は、自分の担当する軍団を探します
        else if (prisoner.isCommander) {
            const myLegion = this.game.legions ? this.game.legions.find(l => Number(l.commanderId) === Number(prisoner.id)) : null;
            if (myLegion) targetLegionId = myLegion.legionNo;
        } 
        // 一般武将の場合は、元いたお城の軍団を探します
        else {
            const pCastle = this.game.getCastle(prisoner.castleId);
            if (pCastle && pCastle.ownerClan === originalClanId) {
                targetLegionId = pCastle.legionId;
            } else if (this.state && this.state.oldDefLegionId !== undefined && pCastle && pCastle.id === this.state.defender.id) {
                targetLegionId = this.state.oldDefLegionId;
            }
        }
        
        // 目標の軍団がわかっている場合、その軍団の城に絞り込みます
        if (targetLegionId !== null) {
            const legionCastles = returnCandidates.filter(c => Number(c.legionId) === Number(targetLegionId));
            // その軍団の城がまだ残っていれば、候補をそこに絞ります
            if (legionCastles.length > 0) {
                returnCandidates = legionCastles;
            }
        }

        // 候補の中からランダムに1つ選びます
        return returnCandidates[Math.floor(Math.random() * returnCandidates.length)];
    },

    // ★追加：援軍のメッセージを一元管理する専門の窓口（係）です！
    // ★追加：軍師による戦況報告の魔法
    showSituationReport(isAttack, atkCastle, atkBushos, defCastle, helperCastle, onComplete) {
        const gunshi = this.game.getClanGunshi(this.game.playerClanId);
        
        // ★変更：軍師がいなくても小姓が出てきてくれるようにします
        let advisorFace = "koshou.webp";
        let advisorName = "小姓";
        let advisorInt = 30; // 智謀は30として計算します

        if (gunshi) {
            advisorFace = gunshi.faceIcon;
            advisorName = gunshi.name;
            advisorInt = gunshi.intelligence;
        }

        const pid = this.game.playerClanId;
        
        const atkClanId = atkCastle.isKunishu ? atkCastle.kunishuId : atkCastle.ownerClan;
        const defClanId = defCastle.isKunishu ? defCastle.kunishuId : defCastle.ownerClan;
        
        const atkClanName = atkClanId === pid ? "当家" : (atkCastle.isKunishu ? (atkCastle.getName ? atkCastle.getName(this.game) : atkCastle.name) : (this.game.clans.find(c => c.id === atkClanId)?.name || "敵軍"));
        const defClanName = defClanId === pid ? "当家" : (defCastle.isKunishu ? (defCastle.getName ? defCastle.getName(this.game) : defCastle.name) : (this.game.clans.find(c => c.id === defClanId)?.name || "敵軍"));
        const defProv = this.game.provinces.find(p => p.id === defCastle.provinceId);
        const defProvName = defProv ? defProv.province : "不明な国";

        const atkLeader = atkBushos && atkBushos.length > 0 ? atkBushos[0] : null;
        const atkLeaderName = atkLeader ? atkLeader.fullName : "総大将";

        const getPerceivedSoldiers = (val) => {
            // ★変更：軍師の智謀の代わりに小姓（または軍師）の智謀を使います
            let accuracy = 0.5 + (advisorInt / 95) * 0.49;
            if (advisorInt >= 95) accuracy = 0.99;
            const maxError = 1.0 - accuracy;
            let perceived = Math.floor(val * (1.0 + (Math.random() * 2 - 1.0) * maxError));
            return Math.max(100, Math.round(perceived / 100) * 100);
        };

        let allySoldiers = 0;
        let enemySoldiers = 0;
        
        if (isAttack) {
            allySoldiers = this.state && this.state.attacker ? this.state.attacker.soldiers : atkCastle.soldiers; 
            enemySoldiers = defCastle.soldiers;
        } else {
            allySoldiers = defCastle.soldiers;
            enemySoldiers = this.state && this.state.attacker ? this.state.attacker.soldiers : atkCastle.soldiers; 
        }

        let enemyReinfMsg = "";
        if (this.game.diplomacyManager) {
            if (isAttack) {
                const connected = defCastle.getConnectedCastles ? defCastle.getConnectedCastles(this.game) : [];
                const candidates = this.game.diplomacyManager.findAvailableReinforcements(false, true, defCastle.id, defCastle, defClanId, atkClanId, connected);
                if (candidates && candidates.length > 0) {
                    const cand = candidates[0];
                    const rClan = this.game.clans.find(c => c.id === cand.force.id);
                    enemyReinfMsg = `さらに、${cand.castle.name}や${cand.force.isKunishu ? (cand.force.getName ? cand.force.getName(this.game) : cand.force.name) : (rClan ? rClan.name : "他勢力")}からの援軍が予想されます。`;
                }
            } else {
                const connected = atkCastle.getConnectedCastles ? atkCastle.getConnectedCastles(this.game) : [];
                const candidates = this.game.diplomacyManager.findAvailableReinforcements(false, false, atkCastle.id, atkCastle, atkClanId, defClanId, connected);
                if (candidates && candidates.length > 0) {
                    const cand = candidates[0];
                    const rClan = this.game.clans.find(c => c.id === cand.force.id);
                    enemyReinfMsg = `さらに、${cand.castle.name}や${cand.force.isKunishu ? (cand.force.getName ? cand.force.getName(this.game) : cand.force.name) : (rClan ? rClan.name : "他勢力")}からの援軍が予想されます。`;
                }
            }
        }

        const allyVal = getPerceivedSoldiers(allySoldiers);
        const enemyVal = getPerceivedSoldiers(enemySoldiers);

        const helperBushos = this.game.getCastleBushos(helperCastle.id).filter(b => window.BushoStatusRules.isActive(b) && b.clan === pid);
        let helperMsg = "誰も在城しておりません。";
        if (helperBushos.length > 0) {
            helperBushos.sort((a,b) => (b.leadership + b.strength) - (a.leadership + a.strength));
            const bestBusho = helperBushos[0];
            // ★変更：一番強い武将が大名なら特別なメッセージに変えます
            if (bestBusho.isDaimyo) {
                helperMsg = `殿自ら出陣なされるとあらば、お味方の戦意も高まることでしょう。`;
            } else {
                const bestBushoName = bestBusho.fullName;
                helperMsg = `${bestBushoName}殿が在城しております。`;
            }
        }

        const msgs = [];
        
        if (isAttack) {
            if (defCastle.isKunishu) {
                msgs.push(`「${atkClanName}の${atkLeaderName}が、${defProvName}の国衆・${defClanName}への攻撃に際し、援軍を求めております」`);
            } else {
                msgs.push(`「${atkClanName}の${atkLeaderName}が、${defClanName}の${defCastle.name}への攻撃に際し、援軍を求めております」`);
            }
        } else {
            if (atkCastle.isKunishu) {
                const atkProv = this.game.provinces.find(p => p.id === atkCastle.provinceId);
                const atkProvName = atkProv ? atkProv.province : "不明な国";
                msgs.push(`「${atkProvName}の国衆・${atkClanName}が、${defClanName}の${defCastle.name}を攻撃するべく迫っております」`);
            } else {
                msgs.push(`「${atkClanName}の${atkLeaderName}が、${defClanName}の${defCastle.name}を攻撃するべく迫っております」`);
            }
        }
        
        const allyName = isAttack ? "お味方" : defCastle.name;
        msgs.push(`「${allyName}の兵力はおよそ${allyVal}。敵方はおよそ${enemyVal}。${enemyReinfMsg}」`);
        msgs.push(`「${helperCastle.name}の兵力は${helperCastle.soldiers}。${helperMsg}」`);

        let idx = 0;
        const showNext = () => {
            if (idx >= msgs.length) {
                onComplete();
                return;
            }
            // ★変更：軍師または小姓の顔と名前でメッセージを出します
            this.game.ui.showDialog(msgs[idx], false, showNext, null, {
                leftFace: advisorFace,
                leftName: advisorName
            });
            idx++;
        };
        showNext();
    },

    // ★援軍のメッセージを一元管理する専門の窓口（係）です！
    reinfMsgHelper: {
        // 1. プレイヤーに援軍の要請が来た時のメッセージ
        showRequest: (game, myClanName, targetInfoStr, gold, isBoss, isAttack, onAccept, onDecline, atkCastle, atkBushos, defCastle, helperCastle) => {
            const typeStr = isAttack ? "攻撃の" : "守備側の";
            
            // ★追加: 大名が表裏比興を持っているか確認します
            let canDeclineBoss = false;
            if (typeof SkillManager !== 'undefined') {
                canDeclineBoss = SkillManager.canDeclineBossReinforcement(game.playerClanId, game);
            }

            const showDialogFunc = () => {
                const gunshi = game.getClanGunshi(game.playerClanId);
                if (isBoss && !canDeclineBoss) {
                    const bossMsg = isAttack 
                        ? `主家である ${myClanName} が\n${targetInfoStr}侵攻します。\n当家は従属しているため直ちに出陣します！`
                        : `主家である ${myClanName} から${typeStr}援軍要請が届きました。\n当家は従属しているため直ちに出陣します！`;
                    game.ui.showDialog(bossMsg, false, onAccept);
                } else {
                    let dialogMsg = `${myClanName} から\n${targetInfoStr}${typeStr}援軍要請が届きました。(持参金: ${gold})\n援軍要請に応じますか？`;
                    // スキルを持っている場合は専用のメッセージになります
                    if (isBoss && canDeclineBoss) {
                        dialogMsg = `主家である ${myClanName} から\n${targetInfoStr}${typeStr}援軍要請が届きました。\n援軍要請に応じますか？`;
                    }
                    
                    const choices = [
                        { label: '応じる', className: 'btn-primary', onClick: onAccept }
                    ];
                    if (atkCastle && defCastle && helperCastle) {
                        choices.push({
                            label: '戦況', className: 'btn-secondary', onClick: () => {
                                game.warManager.showSituationReport(isAttack, atkCastle, atkBushos, defCastle, helperCastle, showDialogFunc);
                            }
                        });
                    }
                    choices.push({ label: '応じない', className: 'btn-danger', onClick: onDecline });

                    game.ui.showDialog(dialogMsg, false, null, null, { choices: choices });
                }
            };
            showDialogFunc();
        },
        
        // 2. 相手が援軍を断ってきた時のメッセージ
        showRefusal: (game, nameStr, isHeavySnow, onComplete) => {
            const reasonMsg = isHeavySnow ? "大雪のため、" : "";
            game.ui.showDialog(`${reasonMsg}${nameStr}は援軍を拒否しました……`, false, onComplete);
        },
        
        // 3. 相手が援軍を承諾してくれた時のメッセージ
        showAcceptance: (game, nameStr, isKunishu, isDelegated, isEnemy, onComplete, isPlayerRequest = true) => {
            // ★変更：プレイヤー勢力が関わる通知なので、通知オフでもスキップしません！
            const skipAnim = false;
            
            if (isEnemy) {
                game.ui.showDialog(`${nameStr}が敵の援軍として参戦しました！`, false, onComplete);
                return;
            }
            
            if (isDelegated) {
                game.ui.showDialog(`${nameStr}が友軍として参戦しました！`, false, onComplete);
            } else {
                if (isKunishu || !isPlayerRequest) {
                    if (skipAnim) {
                        if (onComplete) onComplete();
                    } else {
                        game.ui.showDialog(`${nameStr}が守備側の援軍として参戦しました！`, false, onComplete);
                    }
                } else {
                    game.ui.showDialog(`${nameStr}が援軍要請を承諾しました！`, false, onComplete);
                }
            }
        }
    },

    // ★攻撃側と守備側の敵対関係をセットする魔法
    applyWarHostility(atkId, atkIsKunishu, defId, defIsKunishu, isReinforcement) {
        // どちらかが諸勢力の場合、あるいは中立（0）の場合は外交関係がないので何もしません
        if (atkIsKunishu || defIsKunishu || atkId === 0 || defId === 0) return;
        
        if (this.game.diplomacyManager) {
            if (!isReinforcement) {
                // 主役同士の場合は今まで通り「敵対」にして数字も0（-100）にします
                this.game.diplomacyManager.changeStatus(atkId, defId, '敵対');
                this.game.diplomacyManager.updateSentiment(atkId, defId, -100);
            } else {
                // ★修正：援軍の場合は「敵対」にはせず、友好度を7下げるだけにします！
                this.game.diplomacyManager.updateSentiment(atkId, defId, -7);
            }
        }
    },
    
    getValidWarTargets(currentCastle) {
        const myClanId = this.game.playerClanId;
        let myBossId = 0;
        for (const c of this.game.clans) {
            // ★バリア追加：中立(0)を除外します
            if (c.id !== myClanId && c.id !== 0) {
                const r = this.game.getRelation(myClanId, c.id);
                if (r && r.status === '従属') {
                    myBossId = c.id;
                    break;
                }
            }
        }

        return this.game.castles.filter(target => {
            if (!MapGraphService.isReachable(this.game, currentCastle, target, myClanId)) return false;
            if (target.ownerClan === myClanId) return false;
            if ((target.immunityUntil || 0) >= this.game.getCurrentTurnId()) return false;
            if (target.ownerClan !== 0) {
                const rel = this.game.getRelation(myClanId, target.ownerClan);
                // ★修正：外交専用の魔法を使います！
                if (rel && this.game.diplomacyManager.isNonAggression(rel.status)) return false;

                if (myBossId !== 0) {
                    const bossRel = this.game.getRelation(myBossId, target.ownerClan);
                    // ★修正：親大名の関係も同じ魔法でチェックします！
                    if (bossRel && this.game.diplomacyManager.isNonAggression(bossRel.status)) {
                        return false; 
                    }
                }
            }
            return true;
        }).map(t => t.id);
    },
    
    // ★修正：AIが鉄砲・騎馬を「強さ順」に賢く配分し、余った兵士を足軽で均等に分けるロジックを追加
    // ★追加：ui_sliderからの呼び出しを受け取れるように引数（isSeaBattleParam, isPlayerUI）を追加します！
    async startWar(atkCastle, defCastle, atkBushos, atkSoldierCount, atkRice, atkHorses = 0, atkGuns = 0, reinforcementData = null, selfReinforcementData = null) {
        // ★追加：戦争全体の「開始処理前」の合図を出します
        if (this.game.eventManager) {
            await this.game.eventManager.processEvents('before_war', { atkCastle, defCastle, atkBushos, atkSoldierCount, atkRice, atkHorses, atkGuns, reinforcementData, selfReinforcementData });
        }
        
        this.state = this.state || {};
        this.state.active = true;

        const aiGuardEl = document.getElementById('ai-guard');
        if (aiGuardEl) {
            // 壁を確実に表示させてから、一元管理の魔法で文字だけ透明にして隠します！
            aiGuardEl.classList.remove('hidden'); 
            this.game.ui.hideAIGuardText();
            aiGuardEl.style.display = ''; 
        }

        try {
            this.setLeaderToFront(atkBushos);
            
            const pid = Number(this.game.playerClanId);
            const atkClan = Number(atkCastle.ownerClan !== undefined ? atkCastle.ownerClan : (atkCastle.isKunishu ? -1 : 0));
            const defClan = Number(defCastle.ownerClan || 0);

            // ★追加：プレイヤー勢力（委任軍団や援軍含む）が関わっているかどうかを判定します
            let isPlayerFactionInvolved = (atkClan === pid) || (defClan === pid);
            if (this.isPlayerClanReinforcement(reinforcementData, pid)) isPlayerFactionInvolved = true;
            if (this.isPlayerClanReinforcement(selfReinforcementData, pid)) isPlayerFactionInvolved = true;

            let isPlayerInvolved = false;
            if (atkClan === pid && !atkCastle.isDelegated && !atkCastle.isKunishu) isPlayerInvolved = true;
            // ★修正：諸勢力が反乱を起こした際も、自軍が防衛側であればプレイヤーが操作できるようにします
            if (!defCastle.isKunishu && defClan === pid && !defCastle.isDelegated) isPlayerInvolved = true;
            
            if (atkClan !== pid && !atkCastle.isKunishu) {
                atkHorses = atkCastle.horses || 0; 
                atkGuns = atkCastle.guns || 0;
            }

            const atkClanData = this.game.clans.find(c => c.id === atkClan);
            const atkProvData = this.game.provinces.find(p => p.id === atkCastle.provinceId);
            const atkArmyName = atkCastle.isKunishu ? (atkCastle.getName ? atkCastle.getName(this.game) : atkCastle.name) : (atkClanData ? atkClanData.getArmyName() : "敵軍");
            const atkDaimyoName = this.getDisplayClanName(atkClan, (atkClanData && atkClanData.name) ? atkClanData.name : (atkCastle.isKunishu ? (atkCastle.getName ? atkCastle.getName(this.game) : atkCastle.name) : (atkProvData ? atkProvData.province : "中立")));
            
            const defClanData = this.game.clans.find(c => c.id === defClan);
            const defProvData = this.game.provinces.find(p => p.id === defCastle.provinceId);
            const defDaimyoName = this.getDisplayClanName(defClan, (defClanData && defClanData.name) ? defClanData.name : (defCastle.isKunishu ? defCastle.name : (defProvData ? defProvData.province : "中立")));
            
            // ★追加：大名の居城かどうかを判定して記憶します
            const defDaimyo = this.game.getClanDaimyo(defClan);
            const isDaimyoCastle = (defDaimyo && defDaimyo.castleId === defCastle.id);

            // ★追加：最短ルートが海路を通るか（海戦か）どうかを判定して記憶します
            let isSeaBattle = false;
            if (typeof MapGraphService.isSeaRoute === 'function') {
                isSeaBattle = MapGraphService.isSeaRoute(this.game, atkCastle, defCastle, atkClan);
            }

            // ★ここから追加：お城に「攻撃された記憶」をメモ書きします！
            // ただし、防衛側が諸勢力（鎮圧戦）の場合は、お城の奪い合いではないのでメモしません！
            if (!defCastle.isKunishu) {
                defCastle.lastAttackedOwnerId = defClan; // 攻撃された時の持ち主（大名家ID）をメモ
                
                if (atkCastle.isKunishu) {
                    // 攻撃してきたのが諸勢力（反乱）の場合
                    defCastle.lastAttackerClanId = atkCastle.kunishuId || atkCastle.id;
                    defCastle.lastAttackerIsKunishu = true;
                } else {
                    // 攻撃してきたのが大名家の場合
                    defCastle.lastAttackerClanId = atkClan;
                    defCastle.lastAttackerIsKunishu = false;
                }
            }
            // ★追加ここまで
            
            let startMsg = "";
            if (defCastle.isKunishu) {
                startMsg = `${atkDaimyoName}の${atkBushos[0].name}が\n${defCastle.name}の鎮圧に乗り出しました！`;
            } else {
                startMsg = `${atkDaimyoName}の${atkBushos[0].name}が\n${defDaimyoName}の${defCastle.name}に攻め込みました！`;
            }
            
            this.game.ui.log(startMsg.replace('\n', ''));
            if (!isPlayerInvolved) {
                if (this.canShowNotify(isPlayerFactionInvolved, isPlayerInvolved)) {
                    // ★追加：メッセージが出ると同時に、最初の刀の音を鳴らします
                    if (window.AudioManager) {
                        window.AudioManager.playSE('katana001.ogg');
                        // 0.4秒（400ミリ秒）待ってから、次の音を鳴らします
                        setTimeout(() => {
                            if (window.AudioManager) window.AudioManager.playSE('katana002.ogg');
                        }, 400);
                    }

                    // ★修正：諸勢力に対する鎮圧や反乱の時も、開始メッセージをしっかり出して結果を知らせます！
                    await this.game.ui.showDialogAsync(startMsg);

                    // ★追加：メッセージを閉じた後からバリアを張ります！
                    if (typeof this.game.ui.showMapGuard === 'function') this.game.ui.showMapGuard();

                    // ★Round23：戦場へのカメラ移動はplayBattleBlink側へ一元化しました。
                    // 事前scroll＋点滅側focusの二重移動を防ぎます。
                    
                    let atkColor = { r: 255, g: 255, b: 255 };
                    if (!atkCastle.isKunishu && atkClan !== 0) {
                        const clanData = this.game.clans.find(c => c.id === atkClan);
                        if (clanData && clanData.color) atkColor = DataManager.hexToRgb(clanData.color);
                    }
                    let defColor = { r: 255, g: 255, b: 255 };
                    if (!defCastle.isKunishu && defClan !== 0) {
                        const clanData = this.game.clans.find(c => c.id === defClan);
                        if (clanData && clanData.color) defColor = DataManager.hexToRgb(clanData.color);
                    }
                    
                    // ★１秒間点滅させます
                    await this.game.ui.playBattleBlink(defCastle.id, atkColor, defColor, 1000);
                    
                    // ★追加：点滅が終わったらバリアを外します！
                    if (typeof this.game.ui.hideMapGuard === 'function') this.game.ui.hideMapGuard();
                } else {
                    if (this.game.ui && typeof this.game.ui.showAIWarThinking === 'function') {
                        this.game.ui.showAIWarThinking();
                    }
                }
            } else {
                if (defCastle.isKunishu) {
                    await this.game.ui.showCutin(`${atkArmyName}の${atkBushos[0].name}が\n${defCastle.name}の鎮圧に乗り出しました！`);
                } else {
                    await this.game.ui.showCutin(`${atkArmyName}の${atkBushos[0].name}が\n${defCastle.name}に攻め込みました！`);
                }
            }

            // ★追加：出陣したことで、攻撃側と守備側の国の米相場が上がります！
            const maxTradeRate = window.MainParams.Economy.TradeRateMax;
            const atkProv = this.game.provinces.find(p => p.id === atkCastle.provinceId);
            const defProv = this.game.provinces.find(p => p.id === defCastle.provinceId);
            
            if (atkProv) {
                atkProv.marketRate = Math.min(maxTradeRate, atkProv.marketRate + 0.3);
            }
            // 同じ国の中での戦いなら、2重に上がらないようにチェックします
            if (defProv && (!atkProv || atkProv.id !== defProv.id)) {
                defProv.marketRate = Math.min(maxTradeRate, defProv.marketRate + 0.3);
            }
            
            if (selfReinforcementData && selfReinforcementData.castle.ownerClan === pid && !selfReinforcementData.castle.isDelegated && atkCastle.isDelegated) {
                const requesterName = atkBushos[0].name;
                const reinfCastleName = selfReinforcementData.castle.name;
                
                let targetInfoStr = "";
                if (defCastle.isKunishu) {
                    const provName = defProvData ? defProvData.province : "不明な国";
                    targetInfoStr = `${provName}の${defCastle.name}の攻略のため、`;
                } else if (defCastle.ownerClan === 0) {
                    const provName = defProvData ? defProvData.province : "不明な国";
                    targetInfoStr = `${provName}の${defCastle.name}の攻略のため、`;
                } else {
                    targetInfoStr = `${defDaimyoName}の${defCastle.name}の攻略のため、`;
                }
                
                this.game.ui.hideAIGuardTemporarily();
                
                let resolveConfirmed = null;
                const showReq = () => {
                    const choices = [
                        { label: '応じる', className: 'btn-primary', onClick: () => resolveConfirmed(true) }
                    ];
                    choices.push({
                        label: '戦況', className: 'btn-secondary', onClick: () => {
                            this.showSituationReport(true, atkCastle, atkBushos, defCastle, selfReinforcementData.castle, showReq);
                        }
                    });
                    choices.push({ label: '応じない', className: 'btn-danger', onClick: () => resolveConfirmed(false) });
                    
                    this.game.ui.showDialog(`${requesterName}が${targetInfoStr}${reinfCastleName}に救援を求めています。\n援軍要請に応じますか？`, false, null, null, { choices: choices });
                };

                // ★Round17：以前から抜けていた「選択結果を待つ Promise」を復元します。
                // isConfirmed が未定義のまま参照される潜在バグもここで解消します。
                const isConfirmed = await new Promise(resolve => {
                    resolveConfirmed = resolve;
                    showReq();
                });
                
                this.game.ui.restoreAIGuard();
                if (!isConfirmed) {
                    const hc = selfReinforcementData.castle;
                    hc.soldiers = Math.min(99999, hc.soldiers + selfReinforcementData.soldiers);
                    hc.rice = Math.min(99999, hc.rice + selfReinforcementData.rice);
                    hc.horses = Math.min(99999, (hc.horses || 0) + (selfReinforcementData.horses || 0));
                    hc.guns = Math.min(99999, (hc.guns || 0) + (selfReinforcementData.guns || 0));
                    selfReinforcementData.bushos.forEach(b => b.isActionDone = false);
                    selfReinforcementData = null; 
                } else {
                    // ★追加：プレイヤーが参戦することになったので、透明化の魔法を解除して文字が見えるようにします！
                    this.game.ui.restoreAIGuardText(true);
                }
            }

            atkCastle.soldiers = Math.max(0, atkCastle.soldiers - atkSoldierCount);
            atkCastle.rice = Math.max(0, atkCastle.rice - atkRice);
            atkCastle.horses = Math.max(0, (atkCastle.horses || 0) - atkHorses);
            atkCastle.guns = Math.max(0, (atkCastle.guns || 0) - atkGuns);
            atkBushos.forEach(b => b.isActionDone = true);
            
            // ★変更: ログだけでなく、すべての援軍の参戦を画面のメッセージ（ダイアログ）でもお知らせするようにしました！
            const processReinforcement = async (reinfData, isSelf) => {
                if (reinfData) {
                    const hC = reinfData.castle;
                    if (this.isPlayerClanReinforcement(reinfData, pid) && !hC.isDelegated) isPlayerInvolved = true;
                    
                    let reinfType = isSelf ? "応援軍" : "友軍";
                    let leaderName = reinfData.bushos && reinfData.bushos.length > 0 ? reinfData.bushos[0].name : "総大将";
                    let msg = `${hC.name}の${leaderName}が攻撃側の援軍として参戦しました！`;
                    
                    this.game.ui.log(`【${reinfType}】${hC.name}の${leaderName}が攻撃側の援軍として参戦しました。`);
                    
                    if (this.canShowNotify(isPlayerFactionInvolved, isPlayerInvolved)) {
                        await this.game.ui.showDialogAsync(msg);
                    }
                }
            };
            await processReinforcement(selfReinforcementData, true);
            await processReinforcement(reinforcementData, false);
            
            let defBusho = null;
            if (defCastle.isKunishu) {
                const kunishu = this.game.kunishuSystem.getKunishu(defCastle.kunishuId);
                defBusho = kunishu ? this.game.getBusho(kunishu.leaderId) : null;
            } else defBusho = this.game.getBusho(defCastle.castellanId);
            
            // 空き城（持ち主が0）の場合は、武将データが空でも強制的に「土豪」にします
            if (!defCastle.isKunishu && Number(defCastle.ownerClan) === 0) {
                defBusho = {name: "土豪", strength:30, leadership:30, politics:30, intelligence:30, charm:30, faceIcon: "unknown_face.webp"};
            } else if (!defBusho || defBusho.name === "") {
                defBusho = {name: "侍大将", strength:30, leadership:30, politics:30, intelligence:30, charm:30, faceIcon: "unknown_face.webp"};
            }
            
            // ★変更: 攻撃軍の情報は「メイン軍」のものだけになります！
            const attackerForce = {
                name: atkCastle.isKunishu ? (atkCastle.getName ? atkCastle.getName(this.game) : atkCastle.name) : atkCastle.name + "遠征軍", 
                ownerClan: atkCastle.ownerClan || 0, soldiers: atkSoldierCount, bushos: atkBushos, 
                training: atkCastle.training || 50, morale: atkCastle.morale || 50, rice: atkRice, maxRice: atkRice,
                horses: atkHorses, guns: atkGuns, isKunishu: atkCastle.isKunishu || false, kunishuId: atkCastle.isKunishu ? atkCastle.id : (atkCastle.kunishuId || 0)
            };

            if (this.game.diplomacyManager && !atkCastle.isKunishu && !defCastle.isKunishu && atkClan !== 0 && defClan !== 0) {
                this.game.diplomacyManager.changeStatus(atkClan, defClan, '敵対');
                this.game.diplomacyManager.updateSentiment(atkClan, defClan, -100);
            }
            if (reinforcementData && this.game.diplomacyManager && !defCastle.isKunishu) {
                // ★Round 9：諸勢力の所在地の城主を「援軍大名」と誤認しないようにします。
                const helperClan = this.getReinforcementClanId(reinforcementData);
                if (helperClan !== null && defClan !== 0) {
                    // 攻撃の大名家援軍に入った時は「敵対」にせず、友好度を7下げるだけにします。
                    this.game.diplomacyManager.updateSentiment(helperClan, defClan, -7);
                }
            }
            
            this.state = { 
                active: true, round: 1, attacker: attackerForce, sourceCastle: atkCastle, 
                defender: defCastle, atkBushos: atkBushos, defBusho: defBusho, 
                turn: 'attacker', isPlayerInvolved: isPlayerInvolved, deadSoldiers: { attacker: 0, defender: 0 }, defenderGuarding: false,
                reinforcement: reinforcementData, selfReinforcement: selfReinforcementData,
                isKunishuSubjugation: defCastle.isKunishu === true && !atkCastle.isKunishu, // 防衛側が諸勢力で、攻撃側が諸勢力(蜂起)でないなら鎮圧戦！
                isDaimyoCastle: isDaimyoCastle, // ★大名の居城フラグを追加
                isSeaBattle: isSeaBattle, // ★海戦フラグを追加
                isPlayerFactionInvolved: isPlayerFactionInvolved // ★追加
            };

            // ★追加：戦闘準備が整ったこのタイミングで「戦闘前」の歴史イベントをチェックします
            if (this.game.eventManager) {
                // イベントマネージャー（受付）を経由させることでフラグが保存されます
                await this.game.eventManager.processEvents('before_battle', this.state);
            }

            const showInterceptDialog = async (onResult) => {
                const startAllyReinforcement = () => {
                    this.checkDefenderReinforcement(defCastle, atkClan, async () => {
                    
                    // ★追加：守備側の援軍にプレイヤー勢力が含まれる場合はフラグを更新します！
                    if (this.isPlayerClanReinforcement(this.state.defSelfReinforcement, pid)) {
                        isPlayerFactionInvolved = true;
                        this.state.isPlayerFactionInvolved = true;
                    }
                    if (this.isPlayerClanReinforcement(this.state.defReinforcement, pid)) {
                        isPlayerFactionInvolved = true;
                        this.state.isPlayerFactionInvolved = true;
                    }

                    // ★追加：守備側の援軍に「プレイヤーが操作できる部隊（直轄領）」が含まれている場合は、強制的に手動戦闘（画面表示）にします！
                    if (this.isPlayerClanReinforcement(this.state.defSelfReinforcement, pid) && !this.state.defSelfReinforcement.castle.isDelegated) {
                        this.state.isPlayerInvolved = true;
                    }
                    if (this.isPlayerClanReinforcement(this.state.defReinforcement, pid) && !this.state.defReinforcement.castle.isDelegated) {
                        this.state.isPlayerInvolved = true;
                    }

                    // ==========================================
                    // ★追加：守備側の援軍の参戦メッセージとログを表示します
                    // ==========================================
                    const processDefReinforcement = async (reinfData, isSelf) => {
                        if (reinfData) {
                            let reinfType = isSelf ? "応援軍" : "友軍";
                            let leaderName = reinfData.bushos && reinfData.bushos.length > 0 ? reinfData.bushos[0].name : "総大将";
                            let msg = `${reinfData.castle.name}の${leaderName}が守備側の援軍として参戦しました！`;
                            
                            this.game.ui.log(`【${reinfType}】${reinfData.castle.name}の${leaderName}が守備側の援軍として参戦しました。`);
                            
                            if (!reinfData._joinNoticeShown && this.canShowNotify(isPlayerFactionInvolved, this.state.isPlayerInvolved)) {
                                reinfData._joinNoticeShown = true;
                                await this.game.ui.showDialogAsync(msg);
                            }
                        }
                    };
                    await processDefReinforcement(this.state.defSelfReinforcement, true);
                    await processDefReinforcement(this.state.defReinforcement, false);
                    // ==========================================

                    if (defClan === pid && !defCastle.isDelegated && !defCastle.isKunishu) {
                        this.game.ui.hideAIGuardTemporarily();
                    }
                    
                    const totalDefSoldiers = defCastle.soldiers + (this.state.defReinforcement ? this.state.defReinforcement.soldiers : 0) + (this.state.defSelfReinforcement ? this.state.defSelfReinforcement.soldiers : 0);
                    // ★追加: 迎撃メッセージ（見た目）のためだけに合計を計算します！
                    const totalAtkSoldiers = atkSoldierCount + (this.state.reinforcement ? this.state.reinforcement.soldiers : 0) + (this.state.selfReinforcement ? this.state.selfReinforcement.soldiers : 0);
                    isPlayerInvolved = this.state.isPlayerInvolved;

                    if (defClan === pid && !defCastle.isDelegated && !defCastle.isKunishu) {
                        if (totalDefSoldiers <= 0) {
                            if (isPlayerInvolved) this.game.ui.log("城に兵士がいないため、迎撃（野戦）に出られません！");
                            onResult('siege');
                        } else {
                            const modal = document.getElementById('intercept-confirm-modal');
                            if (modal) {
                                this.game.ui.hideAIGuardTemporarily();
                                modal.classList.remove('hidden');
                                // ★変更: ここで計算した「敵軍の合計数」を表示します
                                document.getElementById('intercept-msg').innerText = `${atkArmyName}の${atkBushos[0].name}が攻めてきました！\n敵軍: ${totalAtkSoldiers} 対 自軍: ${totalDefSoldiers}\n迎撃（野戦）しますか？籠城しますか？`;
                                
                                document.getElementById('btn-intercept').onclick = async () => { 
                                    modal.classList.add('hidden'); 
                                    await this.game.ui.showCutin(`迎撃のため、${defCastle.name}から打って出ます！`);
                                    
                                    this.game.ui.openBushoSelector('def_intercept_deploy', defCastle.id, {
                                        onConfirm: (selectedBushoIds) => {
                                            const defBushos = selectedBushoIds.map(id => this.game.getBusho(id));
                                            this.setLeaderToFront(defBushos);
                                            this.game.ui.openQuantitySelector('def_intercept', [defCastle], null, {
                                                onConfirm: (inputs) => {
                                                    const inputData = inputs[defCastle.id] || inputs;
                                                    const interceptSoldiers = inputData.soldiers ? parseInt(inputData.soldiers.num.value) : (inputData.soldiers || 0);
                                                    const interceptRice = inputData.rice ? parseInt(inputData.rice.num.value) : (inputData.rice || 0);
                                                    const interceptHorses = inputData.horses ? parseInt(inputData.horses.num.value) : 0;
                                                    const interceptGuns = inputData.guns ? parseInt(inputData.guns.num.value) : 0;
                                                    
                                                    this.game.ui.showUnitDivideModal(defBushos, interceptSoldiers, interceptHorses, interceptGuns, (myDefAssignments) => {
                                                        let finalDefAssignments = myDefAssignments;
                                                        if (this.state.defReinforcement) {
                                                            const r = this.state.defReinforcement;
                                                            finalDefAssignments = finalDefAssignments.concat(this.autoDivideSoldiers(r.bushos, r.soldiers, r.horses, r.guns));
                                                        }
                                                        if (this.state.defSelfReinforcement) {
                                                            const sr = this.state.defSelfReinforcement;
                                                            finalDefAssignments = finalDefAssignments.concat(this.autoDivideSoldiers(sr.bushos, sr.soldiers, sr.horses, sr.guns));
                                                        }

                                                        let finalAtkAssignments = [];
                                                        
                                                        // 敵のメイン軍を忘れずにリストに追加します！
                                                        finalAtkAssignments = finalAtkAssignments.concat(this.autoDivideSoldiers(atkBushos, atkSoldierCount, atkHorses, atkGuns));

                                                        if (this.state.reinforcement) {
                                                            const r = this.state.reinforcement;
                                                            finalAtkAssignments = finalAtkAssignments.concat(this.autoDivideSoldiers(r.bushos, r.soldiers, r.horses, r.guns));
                                                        }
                                                        if (this.state.selfReinforcement) {
                                                            const sr = this.state.selfReinforcement;
                                                            finalAtkAssignments = finalAtkAssignments.concat(this.autoDivideSoldiers(sr.bushos, sr.soldiers, sr.horses, sr.guns));
                                                        }

                                                        onResult('field', finalDefAssignments, interceptRice, finalAtkAssignments, interceptHorses, interceptGuns);
                                                    },
                                                    () => { this.game.ui.hideAIGuardTemporarily(); modal.classList.remove('hidden'); }
                                                    );
                                                },
                                                onCancel: () => { this.game.ui.hideAIGuardTemporarily(); modal.classList.remove('hidden'); }
                                            });
                                        },
                                        onCancel: () => { this.game.ui.hideAIGuardTemporarily(); modal.classList.remove('hidden'); }
                                    });
                                };
                                document.getElementById('btn-siege').onclick = () => { 
                                    modal.classList.add('hidden'); 
                                    this.game.ui.restoreAIGuard(); 
                                    onResult('siege'); 
                                };
                            } else onResult('siege');
                        }
                    } else {
                        let availableDefBushos = this.game.getCastleBushos(defCastle.id).filter(b => window.BushoStatusRules.isActive(b) && (defCastle.isKunishu ? b.belongKunishuId === defCastle.kunishuId : (b.clan === defCastle.ownerClan && b.belongKunishuId === 0)));
                        let evaluator = availableDefBushos.find(b => b.isDaimyo);
                        if (!evaluator) evaluator = availableDefBushos.find(b => b.isCastellan);
                        
                        let evaluatorInt = 50;
                        let evaluatorId = 0;
                        let isAggressive = false;
                        if (evaluator) {
                            evaluatorInt = evaluator.intelligence;
                            evaluatorId = evaluator.id;
                            isAggressive = (evaluator.personality === 'aggressive');
                        }

                        // 智謀による見誤り率（最大エラー率）の計算
                        let maxError = 0;
                        if (evaluatorInt >= 95) {
                            maxError = 0.01;
                        } else if (evaluatorInt >= 50) {
                            maxError = 0.15 - ((evaluatorInt - 50) * (0.14 / 45));
                        } else if (evaluatorInt > 5) {
                            maxError = 0.60 - ((evaluatorInt - 5) * 0.01);
                        } else {
                            maxError = 0.60;
                        }

                        // 乱数で見積もりをブレさせる関数
                        const getPerceived = (val) => {
                            const err = (Math.random() * 2 - 1.0) * maxError;
                            return val * (1.0 + err);
                        };

                        // 各種数値の見積もり
                        const perceivedTotalDefSoldiers = getPerceived(totalDefSoldiers);
                        const perceivedTotalAtkSoldiers = getPerceived(totalAtkSoldiers);
                        const perceivedDefSoldiers = getPerceived(defCastle.soldiers);
                        const perceivedDefRice = getPerceived(defCastle.rice);
                        const perceivedDefDefense = getPerceived(defCastle.defense);

                        console.log("【AI防衛判断フェーズ開始】");
                        console.log(`性格: ${isAggressive ? "好戦的" : "慎重"}, 自軍合計見積: ${perceivedTotalDefSoldiers}, 敵軍合計見積: ${perceivedTotalAtkSoldiers}, 兵糧見積: ${perceivedDefRice}, 必要兵糧: ${perceivedDefSoldiers * (isAggressive ? 1.5 : 1.2)}, 城防御見積: ${perceivedDefDefense}`);
                        
                        // ==========================================
                        // 野戦・籠城の判定条件
                        // ==========================================
                        let shouldIntercept = false;
                        let reason = "";
                        
                        // ★諸勢力（国衆）の場合は、大名の城と比べて防御力が低いので、判定の基準値を半分（0.5倍）にします！
                        const defenseThresholdRate = defCastle.isKunishu ? 0.5 : 1.0;
                        
                        // ★海戦の場合は、水際で敵を迎え撃つために野戦に出るハードルを下げます！
                        // 好戦的な性格：通常は敵の1.2倍の兵力が必要 → 海戦なら1.0倍
                        // 慎重な性格 ：通常は敵の1.5倍の兵力が必要 → 海戦なら1.3倍
                        let aggressiveThreshold = this.state.isSeaBattle ? 1.0 : 1.2;
                        let cautiousThreshold = this.state.isSeaBattle ? 1.3 : 1.5;

                        // ★追加：スキルマネージャーに問い合わせて、野戦や籠城に向いたスキルがあるか確認します！
                        let hasFieldAdvantage = false;
                        let hasSiegeAdvantage = false;
                        if (typeof SkillManager !== 'undefined' && typeof SkillManager.hasFieldWarAdvantageSkill === 'function') {
                            hasFieldAdvantage = SkillManager.hasFieldWarAdvantageSkill(availableDefBushos, this.game);
                            hasSiegeAdvantage = SkillManager.hasSiegeDefenseAdvantageSkill(availableDefBushos, this.game);
                        }

                        // スキルによる閾値の調整
                        if (hasFieldAdvantage && !hasSiegeAdvantage) {
                            // 野戦が得意なら、少し不利（兵力が少なく）ても打って出る！
                            aggressiveThreshold -= 0.3; 
                            cautiousThreshold -= 0.3;   
                        } else if (hasSiegeAdvantage && !hasFieldAdvantage) {
                            // 籠城が得意なら、かなり有利になるまで城に引きこもる！
                            aggressiveThreshold += 0.5; 
                            cautiousThreshold += 0.5;   
                        }

                        const riceThreshold = isAggressive ? 1.5 : 1.2;
                        const defThreshold = isAggressive ? 300 : 400;
                        const currentThreshold = isAggressive ? aggressiveThreshold : cautiousThreshold;

                        // ★イベントによる強制迎撃命令がある場合は絶対に従います！
                        if (this.state.forceIntercept) {
                            shouldIntercept = true;
                            reason = "イベントによる強制出陣（野戦）";
                        } 
                        // ★切羽詰まっている条件を先に判定します（そうしないとまずい場合）
                        else if (!defCastle.isKunishu && perceivedDefRice < perceivedDefSoldiers * riceThreshold) {
                            // ★諸勢力は兵糧を無から生み出す設定なので、兵糧不足を理由に野戦には出ません！
                            shouldIntercept = true;
                            reason = "兵糧が足りないから（野戦）";
                        } 
                        else if (perceivedDefDefense < defThreshold * defenseThresholdRate) {
                            // ★諸勢力の場合は基準を半分にして判断します！
                            shouldIntercept = true;
                            reason = "城の防御が低いから（野戦）";
                        } 
                        // ★切羽詰まっていない場合の判断（ここでスキルや戦力比を活かします）
                        else {
                            if (perceivedTotalDefSoldiers >= perceivedTotalAtkSoldiers * currentThreshold) {
                                shouldIntercept = true;
                                if (hasFieldAdvantage && !hasSiegeAdvantage) {
                                    reason = "野戦に長けた武将がおり、戦力も整っているから（野戦）";
                                } else {
                                    reason = this.state.isSeaBattle ? "水際迎撃の好機だから（海戦）" : "自軍の兵力が敵より十分に多いから（野戦）";
                                }
                            } else {
                                if (hasSiegeAdvantage && !hasFieldAdvantage) {
                                    reason = "籠城戦に長けた武将がおり、防御の備えも十分だから（籠城）";
                                } else {
                                    reason = "籠城できる条件が揃っているから（籠城）";
                                }
                            }
                        }

                        console.log(`AIの決断: ${shouldIntercept ? "野戦（迎撃）" : "籠城"}, 理由: ${reason}`);

                        if (shouldIntercept) {
                            const evaluatedBushos = availableDefBushos.map(b => {
                                const truePower = (b.leadership + b.strength + b.intelligence) / 2;
                                let perceivedPower = truePower;
                                if (b.id !== evaluatorId) {
                                    const errorRate = 1.0 + (Math.random() - 0.5) * 2 * maxError;
                                    perceivedPower = truePower * errorRate;
                                }
                                return { busho: b, perceivedPower: perceivedPower };
                            });

                            let maxPower = 0;
                            evaluatedBushos.forEach(eb => {
                                if (eb.perceivedPower > maxPower) maxPower = eb.perceivedPower;
                            });

                            const threshold = maxPower * 0.7;
                            
                            // ★追加：兵士数÷500で、出撃できる武将の数を計算します！（最低1人、最高5人）
                            const maxDeployCount = Math.max(1, Math.min(5, Math.floor(defCastle.soldiers / 500)));
                            
                            const defBushos = evaluatedBushos
                                .filter(eb => eb.perceivedPower > threshold) 
                                .sort((a, b) => b.perceivedPower - a.perceivedPower) 
                                .slice(0, maxDeployCount) 
                                .map(eb => eb.busho);
                                
                            // ★追加：守る武将が誰もいない場合（空き城など）は、ダミーの土豪や侍大将を用意します！
                            if (defBushos.length === 0) {
                                if (!defCastle.isKunishu && Number(defCastle.ownerClan) === 0) {
                                    defBushos.push({id: 'dummy_dogou', name: "土豪", strength:30, leadership:30, politics:30, intelligence:30, charm:30, faceIcon: "unknown_face.webp"});
                                } else {
                                    defBushos.push({id: 'dummy_guard', name: "侍大将", strength:30, leadership:30, politics:30, intelligence:30, charm:30, faceIcon: "unknown_face.webp"});
                                }
                            }
                            
                            this.setLeaderToFront(defBushos);
                            
                            const handleDefDivide = (callback) => {
                                let finalDefAssignments = [];
                                const finishDef = () => {
                                    const mainAssigns = this.autoDivideSoldiers(defBushos, defCastle.soldiers, defCastle.horses || 0, defCastle.guns || 0);
                                    callback(mainAssigns.concat(finalDefAssignments));
                                };
                                const processNextDef = () => {
                                    if (this.state.defReinforcement) finalDefAssignments = finalDefAssignments.concat(this.autoDivideSoldiers(this.state.defReinforcement.bushos, this.state.defReinforcement.soldiers, this.state.defReinforcement.horses, this.state.defReinforcement.guns));
                                    finishDef();
                                };
                                if (this.state.defSelfReinforcement) finalDefAssignments = finalDefAssignments.concat(this.autoDivideSoldiers(this.state.defSelfReinforcement.bushos, this.state.defSelfReinforcement.soldiers, this.state.defSelfReinforcement.horses, this.state.defSelfReinforcement.guns));
                                processNextDef();
                            };

                            const handleAtkDivide = (defAssigns, callback) => {
                                let finalAtkAssignments = [];
                                
                                const finishAtk = () => {
                                    // ★変更: atkBushosにはメイン軍しか入っていないため、フィルター計算を消しました！
                                    if (atkClan === pid && !atkCastle.isDelegated && !attackerForce.isKunishu) {
                                        this.game.ui.showUnitDivideModal(atkBushos, atkSoldierCount, atkHorses, atkGuns, (mainAssigns) => {
                                            callback(defAssigns, mainAssigns.concat(finalAtkAssignments));
                                        });
                                    } else {
                                        const mainAssigns = this.autoDivideSoldiers(atkBushos, atkSoldierCount, atkHorses, atkGuns);
                                        callback(defAssigns, mainAssigns.concat(finalAtkAssignments));
                                    }
                                };

                                const processNextAtk = () => {
                                    if (atkClan === pid && !atkCastle.isDelegated && this.isPlayerClanReinforcement(this.state.reinforcement, pid)) {
                                        this.game.ui.showUnitDivideModal(this.state.reinforcement.bushos, this.state.reinforcement.soldiers, this.state.reinforcement.horses, this.state.reinforcement.guns, (rAssigns) => {
                                            finalAtkAssignments = finalAtkAssignments.concat(rAssigns);
                                            finishAtk();
                                        });
                                    } else {
                                        if (this.state.reinforcement) finalAtkAssignments = finalAtkAssignments.concat(this.autoDivideSoldiers(this.state.reinforcement.bushos, this.state.reinforcement.soldiers, this.state.reinforcement.horses, this.state.reinforcement.guns));
                                        finishAtk();
                                    }
                                };

                                if (atkClan === pid && !atkCastle.isDelegated && this.state.selfReinforcement && this.state.selfReinforcement.castle.ownerClan === pid) {
                                    this.game.ui.showUnitDivideModal(this.state.selfReinforcement.bushos, this.state.selfReinforcement.soldiers, this.state.selfReinforcement.horses, this.state.selfReinforcement.guns, (srAssigns) => {
                                        finalAtkAssignments = finalAtkAssignments.concat(srAssigns);
                                        processNextAtk();
                                    });
                                } else {
                                    if (this.state.selfReinforcement) finalAtkAssignments = finalAtkAssignments.concat(this.autoDivideSoldiers(this.state.selfReinforcement.bushos, this.state.selfReinforcement.soldiers, this.state.selfReinforcement.horses, this.state.selfReinforcement.guns));
                                    processNextAtk();
                                }
                            };
                            
                            const runFieldWarProcess = async () => {
                                const guardName = (!defCastle.isKunishu && defCastle.ownerClan === 0) ? "土豪" : "侍大将";
                                const defLeaderName = defBushos.length > 0 ? defBushos[0].name : guardName;
                                let interceptMsg = `${defDaimyoName}の${defLeaderName}は、${defCastle.name}から打って出ました！`;
                                if (defCastle.isKunishu) {
                                    interceptMsg = `${defCastle.name}の${defLeaderName}は、迎撃のため打って出ました！`;
                                }
                                
                                this.game.ui.log(interceptMsg.replace('\n', ''));
                                
                                if (!isPlayerInvolved) {
                                    if (this.canShowNotify(isPlayerFactionInvolved, isPlayerInvolved)) {
                                        await this.game.ui.showDialogAsync(interceptMsg);
                                    }
                                } else {
                                    await this.game.ui.showCutin(interceptMsg);
                                }

                                const defHorses = (defCastle.horses || 0) < defCastle.soldiers * 0.2 ? 0 : (defCastle.horses || 0);
                                const defGuns = (defCastle.guns || 0) < defCastle.soldiers * 0.2 ? 0 : (defCastle.guns || 0);

                                handleDefDivide((finalDefAssignments) => {
                                    handleAtkDivide(finalDefAssignments, (defAssigns, finalAtkAssignments) => {
                                        onResult('field', defAssigns, defCastle.rice, finalAtkAssignments, defHorses, defGuns);
                                    });
                                });
                            };
                            
                            runFieldWarProcess();
                        } else onResult('siege');
                    }
                }); 
                };

                if (defClan === pid) {
                    this.game.ui.hideAIGuardTemporarily();
                }
                
                // ★修正：イベントなどで既に自軍の援軍が設定されている場合は、上書きせずにそのまま進めます！
                if (this.state.defSelfReinforcement) {
                    startAllyReinforcement();
                } else {
                    this.checkDefenderSelfReinforcement(defCastle, (selfReinfData) => {
                        if (selfReinfData) this.state.defSelfReinforcement = selfReinfData;
                        startAllyReinforcement();
                    });
                }
            };
            
            // ★追加：籠城戦に入った時のメッセージを出す魔法！
            const showSiegeMessage = async () => {
                const guardName = (!defCastle.isKunishu && defCastle.ownerClan === 0) ? "土豪" : "侍大将";
                const defLeaderName = (defBusho && defBusho.name) ? defBusho.name : guardName;
                let siegeMsg = "";
                let dName = defDaimyoName || "不明";
                // ★諸勢力の場合のみ「陣」にします
                if (defCastle.isKunishu) {
                    siegeMsg = `${defCastle.name}の${defLeaderName}は、陣に立て籠もりました！`;
                } else {
                    siegeMsg = `${dName}の${defLeaderName}は、${defCastle.name}に立て籠もりました！`;
                }
                
                this.game.ui.log(siegeMsg.replace('\n', ''));
                
                if (!isPlayerInvolved) {
                    if (this.canShowNotify(isPlayerFactionInvolved, isPlayerInvolved)) {
                        await this.game.ui.showDialogAsync(siegeMsg);
                    }
                } else {
                    await this.game.ui.showCutin(siegeMsg);
                }
            };

            // ★追加：戦争全体の「開始処理後」の合図を出します
            if (this.game.eventManager) {
                await this.game.eventManager.processEvents('start_war', this.state);
            }

            console.log("【チェック】諸勢力の鎮圧戦ですか？: " + (this.state.isKunishuSubjugation ? "はい" : "いいえ"));
            console.log("【チェック】野戦システム(FieldWarManager)は読み込まれていますか？: " + (typeof window.FieldWarManager !== 'undefined' ? "はい" : "いいえ（未定義）"));

            if (typeof window.FieldWarManager === 'undefined') {
                console.log("野戦のシステムが見つからないため、強制的に籠城戦になります！");
                await showSiegeMessage();

                // ★追加：籠城戦の「戦争開始前」と「戦闘開始後」の合図を出します
                if (this.game.eventManager) {
                    await this.game.eventManager.processEvents('before_siege_war', this.state);
                    await this.game.eventManager.processEvents('start_siege_war', this.state);
                }

                this.startSiegeWarPhase();
            } else {
                console.log("野戦ができる状態なので、選択フェーズに入ります！");
                showInterceptDialog(async (choice, defAssignments, defRice, atkAssignments, interceptHorses = 0, interceptGuns = 0) => {
                    this.game.ui.restoreAIGuard();
                    
                    // ★削除: 守備側の援軍を強制合流させる魔法（applyDefReinf）を完全に消しました！

                    if (choice === 'field') {
                        this.state.atkAssignments = atkAssignments; this.state.defAssignments = defAssignments; 
                        
                        let fieldTotalDefSoldiers = 0; if(defAssignments) defAssignments.forEach(a => fieldTotalDefSoldiers += a.soldiers);
                        defCastle.soldiers = Math.max(0, defCastle.soldiers - fieldTotalDefSoldiers);
                        defCastle.rice = Math.max(0, defCastle.rice - (defRice || 0));
                        defCastle.horses = Math.max(0, (defCastle.horses || 0) - interceptHorses);
                        defCastle.guns = Math.max(0, (defCastle.guns || 0) - interceptGuns);
                        
                        this.state.defender.fieldSoldiers = fieldTotalDefSoldiers;
                        this.state.defFieldRice = defRice || 0; 
                        this.state.defender.fieldHorses = interceptHorses;
                        this.state.defender.fieldGuns = interceptGuns;

                        if (!this.game.fieldWarManager) this.game.fieldWarManager = new window.FieldWarManager(this.game);
                        this.game.fieldWarManager.startFieldWar(this.state, async (resultType) => {
                            defCastle.soldiers += this.state.defender.fieldSoldiers;
                            defCastle.rice += this.state.defFieldRice; 
                            defCastle.horses = (defCastle.horses || 0) + (this.state.defender.fieldHorses || 0);
                            defCastle.guns = (defCastle.guns || 0) + (this.state.defender.fieldGuns || 0);
                            
                            if (resultType === 'attacker_win_fatal') {
                                // ★修正：兵糧切れなどで降伏した場合、生き残った兵士を吸収できるように「soldiers = 0」にするのをやめました！
                                if (this.game.ui && this.state.isPlayerInvolved) {
                                    this.game.ui.log("野戦での敗北により、城は放棄されました！");
                                }
                                this.endWar(true);
                            } else if (resultType === 'attacker_win' || resultType === 'defender_retreat' || resultType === 'draw_to_siege') {
                                await showSiegeMessage();

                                // ★追加：野戦から籠城戦に移る時の「戦争開始前」と「戦闘開始後」の合図を出します
                                if (this.game.eventManager) {
                                    await this.game.eventManager.processEvents('before_siege_war', this.state);
                                    await this.game.eventManager.processEvents('start_siege_war', this.state);
                                }

                                this.startSiegeWarPhase();
                            } else this.endWar(false);
                        });
                    } else {
                        await showSiegeMessage();

                        // ★追加：初めから籠城戦を選んだ時の「戦争開始前」と「戦闘開始後」の合図を出します
                        if (this.game.eventManager) {
                            await this.game.eventManager.processEvents('before_siege_war', this.state);
                            await this.game.eventManager.processEvents('start_siege_war', this.state);
                        }

                        this.startSiegeWarPhase();
                    }
                });
            }
        } catch(e) {
            console.error("StartWar Error:", e); 
            if (typeof this.game.ui.hideMapGuard === 'function') this.game.ui.hideMapGuard(true); 

            this.game.ui.restoreAIGuardText(true);
            
            if (this.game.ui && typeof this.game.ui.hideAIWarThinking === 'function') {
                this.game.ui.hideAIWarThinking();
            }

            this.state.active = false; 
            this.game.finishTurn(); 
        }
    },
    
    // ★ここから追加：援軍が途中で「もう無理～！」と撤退する時の魔法！
    retreatReinforcementForce(reinfKey) {
        const s = this.state;
        
        // もしデータがないか、既に帰っていたら何もしません
        if (!s || !s[reinfKey]) return;

        const reinf = s[reinfKey];
        
        // 撤退した人たちを忘れないように、専用の「帰宅待ちリスト」を作ります
        if (!s.retreatedReinforcements) {
            s.retreatedReinforcements = [];
        }
        
        // その時の兵士数などの「今の状態」をそのままリストにメモします
        s.retreatedReinforcements.push({
            data: reinf,
            isAttackerData: (reinfKey === 'reinforcement' || reinfKey === 'selfReinforcement')
        });
        
        // メモし終わったら、戦場のリストからは消してあげます（これで戦闘から除外されます！）
        s[reinfKey] = null;
    },
    
    // 差し替え後
    executeRetreatLogic(defCastle) {
        // ★修正：新しい逃げ先を探す魔法を使います！
        let candidates = defCastle.ownerClan === 0 ? [] : this.getEscapeCandidates(defCastle);
        if (defCastle.isKunishu) candidates = []; // ★諸勢力は撤退先がない
        if (candidates.length === 0) { this.endWar(true); return; }
        const s = this.state;
        
        const runRetreat = (targetId) => {
            if (!targetId) { this.endWar(true); return; } 
            const target = this.game.castles.find(c => c.id === targetId);
            if(target) {
                let lossRate = Math.min(0.9, Math.max(0.05, window.WarParams.War.RetreatResourceLossFactor + (s.attacker.soldiers / (defCastle.soldiers + 1)) * 0.1)); 
                const carryGold = Math.floor(defCastle.gold * (1.0 - lossRate)); const carryRice = Math.floor(defCastle.rice * (1.0 - lossRate));
                const carryHorses = Math.floor((defCastle.horses || 0) * (1.0 - lossRate));
                const carryGuns = Math.floor((defCastle.guns || 0) * (1.0 - lossRate));
                // ★追加：逃げ込んだ先の城がパンクしないように上限をかけます
                target.gold = Math.min(99999, target.gold + carryGold); 
                target.rice = Math.min(99999, target.rice + carryRice); 
                target.soldiers = Math.min(99999, target.soldiers + defCastle.soldiers);
                target.horses = Math.min(99999, (target.horses || 0) + carryHorses);
                target.guns = Math.min(99999, (target.guns || 0) + carryGuns);
                
                const capturedBushos = [];
                this.game.getCastleBushos(defCastle.id).forEach(b => { 
                    if (window.BushoStatusRules.isRonin(b)) return;
                    // ★ 追加: 諸勢力の武将は撤退戦に巻き込まれて捕虜にならないようにします！
                    if (b.belongKunishuId > 0) return;

                    let chance = 0.5 - (b.strength * window.WarParams.War.CaptureStrFactor) + (Math.random() * 0.3);
                    if (defCastle.soldiers > 1000) chance -= 0.2;
                    if (b.isDaimyo) chance -= window.WarParams.War.DaimyoCaptureReduction;
                    if (chance > 0.5) { 
                        capturedBushos.push(b); 
                        // ★城から出て捕虜になります
                        this.game.affiliationSystem.leaveCastle(b);
                    } else { 
                        this.game.factionSystem.handleMove(b, defCastle.id, target.id);
                        // ★新しいお引越しセンターの魔法を使います！
                        this.game.affiliationSystem.moveCastle(b, target.id); 
                        
                        // ★修正：共通化された大名逃亡処理を呼び出します
                        this.handleDaimyoEscape(b, target);
                    }
                });
                defCastle.gold -= carryGold; defCastle.rice = 0; defCastle.soldiers = 0;
                defCastle.horses = 0; defCastle.guns = 0;
                
                defCastle.samuraiIds = defCastle.samuraiIds.filter(id => {
                    const busho = this.game.getBusho(id);
                    return busho && window.BushoStatusRules.isRonin(busho);
                });
                
                defCastle.castellanId = 0;
                this.game.updateCastleLord(defCastle); this.game.updateCastleLord(target);
                
                if(s.isPlayerInvolved) {
                    this.game.ui.log(`${defCastle.name}から${target.name}へ撤退しました。`);
                    this.game.ui.log(`(物資搬出率: ${(100*(1-lossRate)).toFixed(0)}%, 捕縛者: ${capturedBushos.length}名)`);
                }
                this.endWar(true, true, capturedBushos, target.id); 
            }
        };
        candidates.sort((a,b) => WarSystem.calcRetreatScore(b) - WarSystem.calcRetreatScore(a)); 
        runRetreat(candidates[0].id);
    },
    
    async endWar(attackerWon, isRetreat = false, capturedInRetreat = [], retreatTargetId = null) { // ★ async を追加
        // ★ここを書き足します：既に「終わったよ」の処理中なら、2回目は無視するストッパーです！
        if (!this.state.active) return;

        // ★追加：戦争全体の「終了処理前」の合図を出します
        if (this.game.eventManager) {
            await this.game.eventManager.processEvents('before_war_end', this.state);
        }

        // ★追加：籠城戦（攻城戦）の「戦闘終了前」の合図を出します
        // ※野戦だけで決着がついた場合も呼ばれますが、イベント側で区別できます！
        if (this.game.eventManager) {
            await this.game.eventManager.processEvents('before_siege_war_end', this.state);
        }

        // ★追加：合戦終了の演出中に触られないようにバリアを張ります！
        if (typeof this.game.ui.showMapGuard === 'function') this.game.ui.showMapGuard();

        try {
            const s = this.state; s.active = false;
            
            // ★変更：城の所有者が変わる前に、古い大名家のIDをしっかり記憶しておきます！
            s.oldDefClanId = s.defender.ownerClan; 
            s.oldDefLegionId = s.defender.legionId; // ★追加：古い軍団IDも記憶しておきます
            s.extinctionNotified = false; // フラグの初期化

            // ★追加：プレイヤー勢力が関わっているかどうかのフラグを用意します！
            const pid = Number(this.game.playerClanId);
            const isAtkPlayer = (Number(s.attacker.ownerClan) === pid) || 
                                this.isPlayerClanReinforcement(s.reinforcement, pid) || 
                                this.isPlayerClanReinforcement(s.selfReinforcement, pid) ||
                                (s.retreatedReinforcements && s.retreatedReinforcements.some(r => r.isAttackerData && this.isPlayerClanReinforcement(r.data, pid)));
            const isDefPlayer = (Number(s.oldDefClanId) === pid) || 
                                this.isPlayerClanReinforcement(s.defReinforcement, pid) || 
                                this.isPlayerClanReinforcement(s.defSelfReinforcement, pid) ||
                                (s.retreatedReinforcements && s.retreatedReinforcements.some(r => !r.isAttackerData && this.isPlayerClanReinforcement(r.data, pid)));
            s.isPlayerFactionInvolved = isAtkPlayer || isDefPlayer;

            // ★追加：大名の居城が攻め落とされたかのフラグを立てます（撤退による明け渡しも含む）
            if (attackerWon && !s.attacker.isKunishu && s.attacker.ownerClan !== 0 && s.oldDefClanId !== 0) {
                s.isDaimyoCastleFallen = s.isDaimyoCastle;
            }

            // ==========================================
            // ★勝敗決定前の「戦域点滅」ギミック
            // ==========================================
            let atkColor = { r: 255, g: 255, b: 255 };
            if (!s.attacker.isKunishu && s.attacker.ownerClan !== 0) {
                const clanData = this.game.clans.find(c => c.id === s.attacker.ownerClan);
                if (clanData && clanData.color) atkColor = DataManager.hexToRgb(clanData.color);
            }
            let defColor = { r: 255, g: 255, b: 255 };
            if (!s.defender.isKunishu && s.oldDefClanId !== 0) {
                const clanData = this.game.clans.find(c => c.id === s.oldDefClanId);
                if (clanData && clanData.color) defColor = DataManager.hexToRgb(clanData.color);
            }
            
            // 勝敗が決まる前に、戦場となった城の領土を2秒間点滅させる（この間は操作不可）
            if (this.canShowNotify(s.isPlayerFactionInvolved, s.isPlayerInvolved)) {
                await this.game.ui.playBattleBlink(s.defender.id, atkColor, defColor, 2000);
            }
            
            // ★追加：点滅が終わったこのタイミングで「戦闘直後」の歴史イベントをチェック・実行します！
            if (this.game.eventManager) {
                const eventContext = Object.assign({}, s, {
                    resultType: attackerWon ? 'attacker_win' : (isRetreat ? 'attacker_retreat' : 'attacker_lose')
                });
                // イベントマネージャー（受付）を経由させることでフラグが保存されます
                await this.game.eventManager.processEvents('after_battle_blink', eventContext);
            }
            // ==========================================
            
            // ★ここから追加：AI同士の戦争の結果メッセージを記憶しておきます（表示は色が塗られた一番最後にします！）
            let aiResultMsg = "";
            if (!s.isPlayerInvolved && !s.isKunishuSubjugation && !s.attacker.isKunishu) {
                const atkClanData = this.game.clans.find(c => c.id === s.attacker.ownerClan);
                const atkProvData = this.game.provinces.find(p => p.id === s.sourceCastle.provinceId);
                const defClanData = this.game.clans.find(c => c.id === s.oldDefClanId);
                const defProvData = this.game.provinces.find(p => p.id === s.defender.provinceId);
                const atkDaimyoName = this.getDisplayClanName(s.attacker.ownerClan, atkClanData ? atkClanData.name : (s.attacker.isKunishu ? s.attacker.name : (atkProvData ? atkProvData.province : "中立")));
                const defDaimyoName = this.getDisplayClanName(s.oldDefClanId, defClanData ? defClanData.name : (s.defender.isKunishu ? s.defender.name : (defProvData ? defProvData.province : "中立")));
                
                if (attackerWon) {
                    aiResultMsg = `${atkDaimyoName}の${s.atkBushos[0].name}が\n${defDaimyoName}の${s.defender.name}を攻め落としました！`;
                } else {
                    aiResultMsg = `${defDaimyoName}の${s.defBusho.name}が\n${atkDaimyoName}の攻撃を撃退しました！`;
                }
            }
            
            // ★変更：順番待ちができるように async を付けます
            const finishWarProcess = async () => {
                
                // ★追加：演出が終わったのでバリアを解除します！
                if (typeof this.game.ui.hideMapGuard === 'function') this.game.ui.hideMapGuard(true);

                // ★ここから追加：合戦結果の画面を閉じたら、平時のBGMに戻す！
                if (window.AudioManager && s.isPlayerInvolved) {
                    window.AudioManager.restoreMemorizedBgm();
                }

                // 一元管理の魔法で透明化を完全に解除します！
                this.game.ui.restoreAIGuardText(true);
                
                if (this.game.ui && typeof this.game.ui.hideAIWarThinking === 'function') {
                    this.game.ui.hideAIWarThinking();
                }
                
                // ★追加：籠城戦（攻城戦）の「戦闘終了後」の合図を出します
                if (this.game.eventManager) {
                    await this.game.eventManager.processEvents('after_siege_war', s);
                }

                const winnerClan = s.attacker.ownerClan; // 勝ったのは攻撃側です
                
                // ★追加：大名を登用した時のご褒美パワーをリセットしておきます
                this.daimyoHiredBonus = 0;

                if (this.pendingPrisoners && this.pendingPrisoners.length > 0) {
                    if (winnerClan === this.game.playerClanId) {
                        
                        // ★変更：捕らえた人数を報告してから、新しいフェーズ管理の魔法にバトンタッチします！
                        const prisonerCount = this.pendingPrisoners.length;
                        this.game.ui.showDialog(`${prisonerCount}名の武将を捕らえました！`, false, () => {
                            this.startPrisonerPhase();
                        });
                    
                    } else {
                        // AIが勝った場合は自動で処理します
                        await this.autoResolvePrisoners(this.pendingPrisoners, winnerClan);
                        this.pendingPrisoners = [];
                        
                        // ==========================================
                        // ★AIの場合は、そのまま滅亡チェックとターン終了へ進みます！
                        await this.checkTotalTakeover(s); // ★総取りシステムをチェック！
                        const extReason1 = s.isTotalTakeoverExecuted ? 'total_takeover' : 'no_castle';
                        await this.game.lifeSystem.checkClanExtinction(s.oldDefClanId, extReason1);
                        if (window.GameApp) window.GameApp.updateAllClanPrestige(); // 威信を更新
                        this.game.finishTurn();
                        // ==========================================
                    }
                } else {
                    // ==========================================
                    // ★捕虜がいなかった場合も、そのまま滅亡チェックとターン終了へ進みます！
                    await this.checkTotalTakeover(s); // ★総取りシステムをチェック！
                    const extReason2 = s.isTotalTakeoverExecuted ? 'total_takeover' : 'no_castle';
                    await this.game.lifeSystem.checkClanExtinction(s.oldDefClanId, extReason2);
                    if (window.GameApp) window.GameApp.updateAllClanPrestige(); // 威信を更新
                    this.game.finishTurn();
                    // ==========================================
                }
            };
            
            // ★ここから「生存率の計算」と「援軍の帰還処理」を丸ごと新しくします！
            
            // 1. 攻城戦の本当の死者を出す（全体の死者から、野戦の死者を引きます）
            let siegeDeadAtk = s.deadSoldiers.attacker;
            let siegeDeadDef = s.deadSoldiers.defender;
            
            if (s.fieldDeadSoldiers) {
                siegeDeadAtk = Math.max(0, s.deadSoldiers.attacker - s.fieldDeadSoldiers.attacker);
                siegeDeadDef = Math.max(0, s.deadSoldiers.defender - s.fieldDeadSoldiers.defender);
            }

            // 2. 攻城戦の開始時の全兵力を計算する（メイン部隊と援軍をすべて足します）
            const currentAtkMain = Math.max(0, s.attacker.soldiers);
            const currentAtkAlly = s.reinforcement ? Math.max(0, s.reinforcement.soldiers) : 0;
            const currentAtkSelfAlly = s.selfReinforcement ? Math.max(0, s.selfReinforcement.soldiers) : 0;
            const totalCurrentAtk = currentAtkMain + currentAtkAlly + currentAtkSelfAlly;
            
            let atkSurviveRate = 1.0;
            let siegeStartAtk = totalCurrentAtk;
            if (siegeDeadAtk > 0) {
                siegeStartAtk = totalCurrentAtk + siegeDeadAtk;
                atkSurviveRate = Math.max(0, totalCurrentAtk) / Math.max(1, siegeStartAtk);
            }

            const currentDefMain = Math.max(0, s.defender.soldiers);
            const currentDefAlly = s.defReinforcement ? Math.max(0, s.defReinforcement.soldiers) : 0;
            const currentDefSelfAlly = s.defSelfReinforcement ? Math.max(0, s.defSelfReinforcement.soldiers) : 0;
            const totalCurrentDef = currentDefMain + currentDefAlly + currentDefSelfAlly;

            let defSurviveRate = 1.0;
            let siegeStartDef = totalCurrentDef;
            if (siegeDeadDef > 0) {
                siegeStartDef = totalCurrentDef + siegeDeadDef;
                defSurviveRate = Math.max(0, totalCurrentDef) / Math.max(1, siegeStartDef);
            }

            // ★変更：リアルタイムで減らした最新の馬と鉄砲の数をそのまま使うようにし、
            // 今まで使っていた「逆算して二重に減らしてしまう魔法」を撤去しました！
            const attackerSurvivedHorses = s.attacker.horses || 0;
            const attackerSurvivedGuns = s.attacker.guns || 0;
            const defenderSurvivedHorses = s.defender.horses || 0;
            const defenderSurvivedGuns = s.defender.guns || 0;

            // 3. 吸い込み防止の箱と、回復率の設定
            let atkReinfTotalLoss = 0;
            let defReinfTotalLoss = 0;
            const baseRecoveryRate = window.WarParams.War.BaseRecoveryRate;
            const retreatRecoveryRate = window.WarParams.War.RetreatRecoveryRate;

            // ★追加: グループ内に「退き巧者」がいるかを確認して回復率を決める魔法
            const getGroupRecoveryRate = (bushos, isRetreatingTeam) => {
                if (typeof SkillManager !== 'undefined') {
                    return SkillManager.calcRetreatRecoveryRate(bushos, isRetreatingTeam, baseRecoveryRate, retreatRecoveryRate, this.game);
                }
                return isRetreatingTeam ? retreatRecoveryRate : baseRecoveryRate;
            };

            // 4. 援軍部隊を元の城に帰還させるお帰り魔法
            const returnReinforcement = (reinf, isAttackerData) => {
                if (!reinf) return;
                
                // 野戦で減った数（メモ用紙から読み取ります）
                const fieldLoss = reinf.fieldLoss || 0;
                
                // 新しく計算した生存率を使います！
                let surviveRate = isAttackerData ? atkSurviveRate : defSurviveRate;
                
                // 攻城戦を生き残った数
                const surviveSoldiers = Math.floor(reinf.soldiers * surviveRate);
                // 攻城戦で減った数
                const siegeLoss = reinf.soldiers - surviveSoldiers;
                // トータルの負傷兵
                const totalLoss = fieldLoss + siegeLoss;
                
                // メイン部隊が吸い込まないようにメモしておきます
                if (isAttackerData) atkReinfTotalLoss += totalLoss;
                else defReinfTotalLoss += totalLoss;
                
                // ★追加: 自分が撤退する側のチームかどうかを判定します
                let isThisGroupRetreating = (isRetreat && ((isAttackerData && !attackerWon) || (!isAttackerData && attackerWon)));
                let recRate = getGroupRecoveryRate(reinf.bushos, isThisGroupRetreating);

                // 負傷兵の一部が回復して、一緒に帰ります！
                const recovered = Math.floor(totalLoss * recRate);
                const finalReturnSoldiers = surviveSoldiers + recovered;
                
                // ★修正：軍馬と鉄砲は、すでにリアルタイムで減らされた「今の数」をそのまま使います！
                const returnHorses = reinf.horses || 0;
                const returnGuns = reinf.guns || 0;

                // 諸勢力の場合
                if (reinf.isKunishuForce) {
                    const kunishu = this.game.kunishuSystem.getKunishu(reinf.kunishuId);
                    if (kunishu && !kunishu.isDestroyed) {
                        kunishu.soldiers = Math.min(99999, kunishu.soldiers + finalReturnSoldiers);
                        kunishu.horses = Math.min(99999, (kunishu.horses || 0) + returnHorses); 
                        kunishu.guns = Math.min(99999, (kunishu.guns || 0) + returnGuns);       
                        reinf.bushos.forEach(b => {
                            this.game.affiliationSystem.setCastleIdRaw(b, kunishu.castleId); b.isCastellan = false;
                        });
                        const myClanId = isAttackerData ? s.sourceCastle.ownerClan : s.defender.ownerClan;
                        let isWin = isAttackerData ? attackerWon : !attackerWon;
                        if (isWin) {
                            kunishu.setRelation(myClanId, kunishu.getRelation(myClanId) + 5);
                            if (s.isPlayerInvolved) this.game.ui.log(`(援軍が勝利に貢献し、${kunishu.getName(this.game)}との友好度が上がりました)`);
                        }
                    }
                } else {
                    // 大名家の場合
                    const helperCastle = this.game.getCastle(reinf.castle.id); 
                    if (helperCastle) {
                        // 援軍部隊が持っている残りの兵糧をそのまま持ち帰ります
                        let returnRice = reinf.rice || 0;
                        
                        const oldSoldiers = helperCastle.soldiers;
                        helperCastle.soldiers = Math.min(99999, helperCastle.soldiers + finalReturnSoldiers);
                        helperCastle.rice = Math.min(99999, helperCastle.rice + returnRice);
                        helperCastle.horses = Math.min(99999, (helperCastle.horses || 0) + returnHorses);
                        helperCastle.guns = Math.min(99999, (helperCastle.guns || 0) + returnGuns);
                        
                        // ★追加：帰ってきた兵士たちの士気と訓練度を、お城の兵士たちと混ぜ合わせます！
                        if (helperCastle.soldiers > 0 && finalReturnSoldiers > 0) {
                            helperCastle.training = Math.floor(((helperCastle.training || 50) * oldSoldiers + (reinf.training || 50) * finalReturnSoldiers) / helperCastle.soldiers);
                            helperCastle.morale = Math.floor(((helperCastle.morale || 50) * oldSoldiers + (reinf.morale || 50) * finalReturnSoldiers) / helperCastle.soldiers);
                        }
                        
                        reinf.bushos.forEach(b => {
                            this.game.affiliationSystem.setCastleIdRaw(b, helperCastle.id); 
                            b.isCastellan = false;
                            if (!helperCastle.samuraiIds.includes(b.id)) helperCastle.samuraiIds.push(b.id);
                        });
                        this.game.updateCastleLord(helperCastle);

                        if (!reinf.isSelf) {
                            const myClanId = isAttackerData ? s.sourceCastle.ownerClan : s.defender.ownerClan;
                            const helperClanId = helperCastle.ownerClan;
                            let isWin = isAttackerData ? attackerWon : !attackerWon;
                            if (isWin) {
                                this.game.diplomacyManager.updateSentiment(myClanId, helperClanId, 5);
                                if (s.isPlayerInvolved) this.game.ui.log(`(援軍が勝利に貢献し、${this.game.clans.find(c=>c.id===helperClanId)?.name}との友好度が上がりました)`);
                            }
                        }
                    }
                }
                
                // 武将を戦場リストから消す
                if (isAttackerData) {
                    reinf.bushos.forEach(rb => { s.atkBushos = s.atkBushos.filter(b => b.id !== rb.id); });
                }
            };

            returnReinforcement(s.selfReinforcement, true);
            returnReinforcement(s.reinforcement, true);
            returnReinforcement(s.defSelfReinforcement, false);
            returnReinforcement(s.defReinforcement, false);
            
            // 5. 途中で撤退した援軍たちを、無事にお城へ帰してあげる魔法
            if (s.retreatedReinforcements) {
                s.retreatedReinforcements.forEach(ret => {
                    const reinf = ret.data;
                    const isAttackerData = ret.isAttackerData;
                    
                    // 野戦で減った数（メモ用紙）から、回復する負傷兵を計算します！
                    const fieldLoss = reinf.fieldLoss || 0;
                    
                    // ★追加: 個別に撤退しているので、ここは確実に撤退時の回復率計算を使います！
                    let recRate = getGroupRecoveryRate(reinf.bushos, true);
                    
                    const recovered = Math.floor(fieldLoss * recRate);
                    const finalReturnSoldiers = reinf.soldiers + recovered;
                    
                    // 吸い込み防止のメモ用紙にも、この負傷兵を記録しておきます
                    if (isAttackerData) atkReinfTotalLoss += fieldLoss;
                    else defReinfTotalLoss += fieldLoss;
                    
                    if (reinf.isKunishuForce) {
                        const kunishu = this.game.kunishuSystem.getKunishu(reinf.kunishuId);
                        if (kunishu && !kunishu.isDestroyed) {
                            kunishu.soldiers = Math.min(99999, kunishu.soldiers + finalReturnSoldiers);
                            kunishu.horses = Math.min(99999, (kunishu.horses || 0) + (reinf.horses || 0)); 
                            kunishu.guns = Math.min(99999, (kunishu.guns || 0) + (reinf.guns || 0));       
                            reinf.bushos.forEach(b => {
                                this.game.affiliationSystem.setCastleIdRaw(b, kunishu.castleId); 
                                b.isCastellan = false;
                            });
                        }
                    } else {
                        const helperCastle = this.game.getCastle(reinf.castle.id); 
                        if (helperCastle) {
                            helperCastle.soldiers = Math.min(99999, helperCastle.soldiers + finalReturnSoldiers);
                            helperCastle.rice = Math.min(99999, helperCastle.rice + reinf.rice);
                            helperCastle.horses = Math.min(99999, (helperCastle.horses || 0) + (reinf.horses || 0));
                            helperCastle.guns = Math.min(99999, (helperCastle.guns || 0) + (reinf.guns || 0));
                            reinf.bushos.forEach(b => {
                                this.game.affiliationSystem.setCastleIdRaw(b, helperCastle.id); 
                                b.isCastellan = false;
                                if (!helperCastle.samuraiIds.includes(b.id)) helperCastle.samuraiIds.push(b.id);
                            });
                            this.game.updateCastleLord(helperCastle);
                        }
                    }
                    
                    if (isAttackerData) {
                        reinf.bushos.forEach(rb => { s.atkBushos = s.atkBushos.filter(b => b.id !== rb.id); });
                    }
                });
            }
            
            // ★敵の援軍に参加した大名との友好度を「５」下げる魔法！
            if (this.game.diplomacyManager) {
                // 攻撃陣営（大名と援軍）を調べます
                const atkClan = (!s.attacker.isKunishu && s.attacker.ownerClan !== 0) ? s.attacker.ownerClan : null;
                const atkAlly = (s.reinforcement && !s.reinforcement.isSelf) ? this.getReinforcementClanId(s.reinforcement) : null;
                
                // 守備陣営（大名と援軍）を調べます
                const defClan = (!s.defender.isKunishu && s.oldDefClanId !== 0) ? s.oldDefClanId : null;
                const defAlly = (s.defReinforcement && !s.defReinforcement.isSelf) ? this.getReinforcementClanId(s.defReinforcement) : null;

                // 攻撃側大名 と 守備側援軍大名 の友好度ダウン
                if (atkClan && defAlly) {
                    this.game.diplomacyManager.updateSentiment(atkClan, defAlly, -5);
                }
                // 守備側大名 と 攻撃側援軍大名 の友好度ダウン
                if (defClan && atkAlly) {
                    this.game.diplomacyManager.updateSentiment(defClan, atkAlly, -5);
                }
                // 攻撃側の援軍大名 と 守備側の援軍大名 の友好度ダウン
                if (atkAlly && defAlly) {
                    this.game.diplomacyManager.updateSentiment(atkAlly, defAlly, -5);
                }
            }
            
            // 諸勢力を制圧（鎮圧）した時の処理
            if (s.isKunishuSubjugation) {
                const kunishu = this.game.kunishuSystem.getKunishu(s.defender.kunishuId);
                let resultMsg = ""; 
                
                // ★追加：誰が鎮圧したのか分かるように、攻撃側の情報を取得します
                const atkClanData = this.game.clans.find(c => c.id === s.attacker.ownerClan);
                const atkDaimyoName = this.getDisplayClanName(s.attacker.ownerClan, atkClanData ? atkClanData.name : "大名家");
                const leaderName = s.atkBushos[0].name;
                
                if (attackerWon) {
                    resultMsg = `${atkDaimyoName}の${leaderName}が、${s.defender.name}の鎮圧に成功しました！`;
                    this.game.ui.log(`【諸勢力制圧】${atkDaimyoName}の${leaderName}が、${s.defender.name}の鎮圧に成功しました！`);
                    if (kunishu) {
                        kunishu.isDestroyed = true;
                        kunishu.soldiers = 0;
                        const members = this.game.kunishuSystem.getKunishuMembers(kunishu.id);
                        members.forEach(b => {
                            b.belongKunishuId = 0; // 諸勢力の所属を外します
                            // ★ここを書き換え！関所を通らずに勝手に浪人になる古い魔法を消して、お引越しセンターにお願いします！
                            this.game.affiliationSystem.becomeRonin(b);
                        });
                    }
                } else {
                    resultMsg = `${atkDaimyoName}の${leaderName}は、${s.defender.name}の鎮圧に失敗しました……`;
                    this.game.ui.log(`【諸勢力制圧】${atkDaimyoName}の${leaderName}は、${s.defender.name}の鎮圧に失敗しました……`);
                    
                    if (kunishu) {
                        kunishu.soldiers = s.defender.soldiers;
                        kunishu.defense = s.defender.defense;
                        kunishu.horses = s.defender.horses || 0;
                        kunishu.guns = s.defender.guns || 0;
                    }
                }
                
                const srcC = this.game.getCastle(s.sourceCastle.id);
                if (srcC) {
                    // ★追加：帰還した城が上限を超えないようにします
                    srcC.soldiers = Math.min(99999, srcC.soldiers + s.attacker.soldiers); 
                    srcC.rice = Math.min(99999, srcC.rice + s.attacker.rice);
                    srcC.horses = Math.min(99999, (srcC.horses || 0) + (s.attacker.horses || 0));
                    srcC.guns = Math.min(99999, (srcC.guns || 0) + (s.attacker.guns || 0));
                }
                
                if (s.isPlayerInvolved) {
                    // ★修正：結果画面を出す「前」に合戦画面を消さないと、結果のボタンが押せなくなってしまいます！
                    this.game.ui.setWarModalVisible(false);
                    // ★追加：ダイアログを出す前にバリアを解除します！
                    if (typeof this.game.ui.hideMapGuard === 'function') this.game.ui.hideMapGuard(true);
                    if (attackerWon) {
                        if (window.AudioManager) {
                            // ★修正：フェードアウトさせると音量が0になって戻らなくなるので、ピタッと止める魔法にします！
                            if (typeof window.AudioManager.stopBgm === 'function') {
                                window.AudioManager.stopBgm();
                            }
                            window.AudioManager.playSE('victory.ogg');
                        }
                    }
                    this.game.ui.showDialog(resultMsg, false, () => { 
                        this.closeWar(); 
                    });
                } else {
                    // ★修正：戦闘画面は飛ばしますが、結果のメッセージは表示してタップを待ちます！
                    if (this.canShowNotify(s.isPlayerFactionInvolved, s.isPlayerInvolved)) {
                        // ★追加：ダイアログを出す前にバリアを解除します！
                        if (typeof this.game.ui.hideMapGuard === 'function') this.game.ui.hideMapGuard(true);
                        await this.game.ui.showDialogAsync(resultMsg);
                    }
                    this.closeWar();
                }
                return;
            }
            
            // 諸勢力が反乱（蜂起）を起こした時の処理
            if (s.attacker.isKunishu) {
                let resultMsg = ""; 
                
                if (attackerWon) {
                    const targetC = this.game.getCastle(s.defender.id);
                    const oldOwner = targetC.ownerClan;
                    
                    // ★修正：お城の持ち主が中立に書き換えられてしまう「前」に、逃げ込める味方の城を探しておきます！
                    const friendlyCastles = this.getEscapeCandidates(targetC);

                    // ★城の管理システムにお任せします！
                    this.game.castleManager.changeOwner(targetC, 0, false, 0); 

                    // ★追加：色が中立に変わったので、メッセージの前に地図を更新します！
                    // ★今回追加：色を変える時に、かっこいいアニメーションの魔法を使います！
                    if (typeof this.game.ui.playCaptureEffect === 'function' && this.canShowNotify(s.isPlayerFactionInvolved, s.isPlayerInvolved)) {
                        // 画面が真っ白になった瞬間に色を塗り替えるお願いを渡します
                        await this.game.ui.playCaptureEffect(targetC.id, () => {
                            if (typeof this.game.writeSystemDiagnostic === 'function') this.game.writeSystemDiagnostic('war:capture_color:start', targetC);
                            this.game.ui.updateClanColors();
                            if (typeof this.game.writeSystemDiagnostic === 'function') this.game.writeSystemDiagnostic('war:capture_color:done', targetC);
                        });
                    } else {
                        // ★Round10：通知されないAI戦争では、見えていない地図の色計算を毎回行わず復帰時へまとめます。
                        if (this.game.isProcessingAI && !this.game.isWatchMode && !s.isPlayerInvolved) {
                            this.game._aiDeferredMapRefresh = true;
                            if (typeof this.game.writeSystemDiagnostic === 'function') this.game.writeSystemDiagnostic('war:capture_color:deferred', targetC);
                        } else {
                            if (typeof this.game.writeSystemDiagnostic === 'function') this.game.writeSystemDiagnostic('war:capture_color:start', targetC);
                            this.game.ui.updateClanColors();
                            if (typeof this.game.writeSystemDiagnostic === 'function') this.game.writeSystemDiagnostic('war:capture_color:done', targetC);
                        }
                    }
                    
                    targetC.castellanId = 0;
                    
                    const kunishuMembers = this.game.kunishuSystem.getKunishuMembers(s.attacker.kunishuId).map(b => b.id);
                    
                    this.game.getCastleBushos(targetC.id).forEach(b => {
                        // もし諸勢力のメンバーじゃなかったら（大名家の武将だったら）
                        if (!kunishuMembers.includes(b.id)) {
                            if (friendlyCastles.length > 0) {
                                // ★味方の城がある場合：ランダムに選んだ味方の城へ避難します！
                                const escapeCastle = friendlyCastles[Math.floor(Math.random() * friendlyCastles.length)];
                                // 派閥などの情報も一緒にお引越しさせます
                                if (this.game.factionSystem) {
                                    this.game.factionSystem.handleMove(b, targetC.id, escapeCastle.id);
                                }
                                // ★新しいお引越しセンターの魔法を使います！
                                this.game.affiliationSystem.moveCastle(b, escapeCastle.id);
                                
                                // ★修正：共通化された大名逃亡処理を呼び出します
                                this.handleDaimyoEscape(b, escapeCastle);
                            } else {
                                // ★味方の城がない場合（最後の城だった場合）：浪人になります
                                // ★新しいお引越しセンターの魔法を使います！
                                this.game.affiliationSystem.becomeRonin(b);
                            }
                        }
                    });
                    
                    // 城のお留守番リスト（samuraiIds）を整理します
                    targetC.samuraiIds = targetC.samuraiIds.filter(id => {
                        const busho = this.game.getBusho(id);
                        // 諸勢力のメンバーか、浪人になって城に残った人だけリストに残します
                        return kunishuMembers.includes(id) || (busho && window.BushoStatusRules.isRonin(busho));
                    });
                    
                    resultMsg = `諸勢力の反乱により、${targetC.name}が陥落し空白地となりました。`;
                    this.game.ui.log(`【諸勢力蜂起】諸勢力の反乱により、${targetC.name}が陥落し空白地となりました。`);
                    
                    // ★城をすべて失ったら、life_system.js の滅亡チェック魔法にお任せします！
                    if (this.game.castles.filter(c => c.ownerClan === oldOwner).length === 0) {
                        await this.game.lifeSystem.checkClanExtinction(oldOwner, 'no_castle');
                    }
                    
                } else {
                    // ★変更：お城にちゃんとした武将がいるか（「侍大将」や「土豪」じゃないか）を調べます！
                    if (s.defBusho && s.defBusho.name !== "侍大将" && s.defBusho.name !== "土豪") {
                        // 武将がいる時は、その人の名前を出してかっこよく褒めます！
                        const defLeaderName = s.defBusho.name;
                        resultMsg = `反乱は${defLeaderName}の手によって鎮圧されました！`;
                        this.game.ui.log(`【諸勢力蜂起】反乱は${defLeaderName}の手によって鎮圧されました！`);
                    } else {
                        // 誰もいない時は、名前を出さずにシンプルに伝えます！
                        resultMsg = `反乱は鎮圧されました！`;
                        this.game.ui.log(`【諸勢力蜂起】反乱は鎮圧されました！`);
                    }
                }
                
                if (s.isPlayerInvolved) {
                    // ★修正：結果画面を出す前に合戦画面を消します
                    this.game.ui.setWarModalVisible(false);
                    // ★追加：ダイアログを出す前にバリアを解除します！
                    if (typeof this.game.ui.hideMapGuard === 'function') this.game.ui.hideMapGuard(true);
                    this.game.ui.showDialog(resultMsg, false, () => { 
                        this.closeWar(); 
                    });
                } else {
                    // ★追加：AIの城で反乱が起きた時も、専用のメッセージを出してタップを待ちます！
                    if (this.canShowNotify(s.isPlayerFactionInvolved, s.isPlayerInvolved)) {
                        // ★追加：ダイアログを出す前にバリアを解除します！
                        if (typeof this.game.ui.hideMapGuard === 'function') this.game.ui.hideMapGuard(true);
                        await this.game.ui.showDialogAsync(resultMsg);
                    }
                    this.closeWar();
                }
                return;
                
            }

            s.atkBushos.forEach(b => { this.game.factionSystem.recordBattle(b, s.defender.id); this.game.factionSystem.updateRecognition(b, 25); });
            // ★大名の戦いなら諸勢力を弾き、諸勢力の戦いなら大名を弾く魔法！
            const defBushos = this.game.getCastleBushos(s.defender.id).filter(b => window.BushoStatusRules.isActive(b) && (s.defender.isKunishu ? b.belongKunishuId === s.defender.kunishuId : (b.clan === s.defender.ownerClan && b.belongKunishuId === 0))).concat(this.pendingPrisoners);
            if (s.defBusho && s.defBusho.id && !defBushos.find(b => b.id === s.defBusho.id)) defBushos.push(s.defBusho);
            defBushos.forEach(b => { this.game.factionSystem.recordBattle(b, s.defender.id); this.game.factionSystem.updateRecognition(b, 25); });

            // ★修正：結果画面を出す前に合戦画面を消す魔法を復活させます！
            if (s.isPlayerInvolved) { this.game.ui.setWarModalVisible(false); }
            
            // ★修正：メイン部隊の本当の負傷兵（全体の負傷兵から、援軍の分を引いたもの）を計算します！
            const realAtkDead = Math.max(0, s.deadSoldiers.attacker - atkReinfTotalLoss);
            const realDefDead = Math.max(0, s.deadSoldiers.defender - defReinfTotalLoss);
            
            // ★追加：メイン部隊の回復率を退き巧者の有無を含めて取得します！
            let atkMainRecRate = getGroupRecoveryRate(s.atkBushos, isRetreat && !attackerWon);
            let defMainRecRate = getGroupRecoveryRate(s.defBusho ? [s.defBusho] : [], isRetreat && attackerWon);

            const attackerRecovered = Math.floor(realAtkDead * atkMainRecRate);
            const totalAtkSurvivors = s.attacker.soldiers + attackerRecovered;

            if (s.attacker.rice > 0) {
                // ★追加：戦争終了時の兵糧合流でも上限を超えないようにします
                if (attackerWon) s.defender.rice = Math.min(99999, s.defender.rice + s.attacker.rice); 
                else { 
                    if (!s.attacker.isKunishu) {
                        const srcC = this.game.getCastle(s.sourceCastle.id); 
                        if (srcC) srcC.rice = Math.min(99999, srcC.rice + s.attacker.rice); 
                    }
                }
            }

            // ★修正：攻撃軍が城に入って「兵士数」が勘違いされる前に、捕縛の処理を行います！
            if (!isRetreat && attackerWon) {
                this.processCaptures(s.defender, s.attacker.ownerClan);
            }

            if (isRetreat && retreatTargetId) {
                const targetC = this.game.getCastle(retreatTargetId);
                if (targetC) {
                    // ★追加: 守備側の撤退時なので、先ほど計算した defMainRecRate を使います！
                    const recovered = Math.floor(realDefDead * defMainRecRate);
                    // ★追加：撤退先での兵士合流にストッパー！
                    targetC.soldiers = Math.min(99999, targetC.soldiers + s.defender.soldiers + recovered);
                    if (s.isPlayerInvolved && recovered > 0) this.game.ui.log(`(撤退先にて負傷兵 ${recovered}名 が復帰)`);
                }
            } else if (!isRetreat && attackerWon) {
                const survivors = Math.max(0, s.defender.soldiers);
                const recovered = Math.floor(realDefDead * baseRecoveryRate); // 守備側は全滅（非撤退）なので基本の回復率を使います
                const totalAbsorbed = survivors + recovered;

                // ★追加：攻め込んだ元気な兵士と、城に残っていた兵士の士気と訓練をまぜまぜします！
                const newTotalSoldiers = totalAtkSurvivors + totalAbsorbed;
                if (newTotalSoldiers > 0) {
                    let calcTraining = Math.floor(((s.defender.training || 0) * totalAbsorbed + (s.attacker.training || 0) * totalAtkSurvivors) / newTotalSoldiers);
                    let calcMorale = Math.floor(((s.defender.morale || 0) * totalAbsorbed + (s.attacker.morale || 0) * totalAtkSurvivors) / newTotalSoldiers);
                    
                    s.defender.training = ((s.attacker.training || 0) > calcTraining) ? (s.attacker.training || 0) : calcTraining;
                    s.defender.morale = ((s.attacker.morale || 0) > calcMorale) ? (s.attacker.morale || 0) : calcMorale;
                }

                // ★追加：城を奪った時の兵士や軍馬、鉄砲の合流にストッパー！
                s.defender.soldiers = Math.min(99999, newTotalSoldiers);
                s.defender.horses = Math.min(99999, defenderSurvivedHorses + attackerSurvivedHorses);
                s.defender.guns = Math.min(99999, defenderSurvivedGuns + attackerSurvivedGuns);
                if (s.isPlayerInvolved && totalAbsorbed > 0) this.game.ui.log(`(敵残存兵・負傷兵 計${totalAbsorbed}名 を吸収)`);
            } else if (!attackerWon) {
                if (s.attacker.isKunishu) {
                    const kunishu = this.game.kunishuSystem.getKunishu(s.attacker.kunishuId);
                    if (kunishu && !kunishu.isDestroyed) {
                        const originalSoldiers = kunishu.soldiers;
                        const newTotalSoldiers = originalSoldiers + totalAtkSurvivors;
                        if (newTotalSoldiers > 0) {
                            kunishu.training = Math.floor(((kunishu.training || 0) * originalSoldiers + (s.attacker.training || 0) * totalAtkSurvivors) / newTotalSoldiers);
                            kunishu.morale = Math.floor(((kunishu.morale || 0) * originalSoldiers + (s.attacker.morale || 0) * totalAtkSurvivors) / newTotalSoldiers);
                        }
                        kunishu.soldiers = Math.min(99999, newTotalSoldiers);
                        kunishu.horses = Math.min(99999, (kunishu.horses || 0) + attackerSurvivedHorses);
                        kunishu.guns = Math.min(99999, (kunishu.guns || 0) + attackerSurvivedGuns);
                    }
                } else {
                    const srcC = this.game.getCastle(s.sourceCastle.id);
    
                    // ★追加：帰ってきた兵士と、お留守番していた兵士の士気と訓練をまぜまぜします！
                    const originalSoldiers = srcC.soldiers;
                    const newTotalSoldiers = originalSoldiers + totalAtkSurvivors;
                    if (newTotalSoldiers > 0) {
                        srcC.training = Math.floor(((srcC.training || 0) * originalSoldiers + (s.attacker.training || 0) * totalAtkSurvivors) / newTotalSoldiers);
                        srcC.morale = Math.floor(((srcC.morale || 0) * originalSoldiers + (s.attacker.morale || 0) * totalAtkSurvivors) / newTotalSoldiers);
                    }
    
                    // ★追加：負けて帰ってきた遠征軍の兵士、軍馬、鉄砲の合流にストッパー！
                    srcC.soldiers = Math.min(99999, newTotalSoldiers);
                    srcC.horses = Math.min(99999, (srcC.horses || 0) + attackerSurvivedHorses);
                    srcC.guns = Math.min(99999, (srcC.guns || 0) + attackerSurvivedGuns);
                }
                
                const recovered = Math.floor(realDefDead * baseRecoveryRate); // 守備側は防衛成功（非撤退）なので基本の回復率を使います
                s.defender.soldiers = Math.min(99999, s.defender.soldiers + recovered);
                s.defender.horses = defenderSurvivedHorses;
                s.defender.guns = defenderSurvivedGuns;
                if (s.isPlayerInvolved && attackerRecovered > 0) this.game.ui.log(`(遠征軍 負傷兵 ${attackerRecovered}名 が帰還)`);
            }

            if (isRetreat && capturedInRetreat.length > 0) {
                this.pendingPrisoners = capturedInRetreat;
            }
            
            if (isRetreat && attackerWon) {
                // ★城の管理システムにお任せします！
                const newLegionId = s.sourceCastle ? (s.sourceCastle.legionId || 0) : 0;
                this.game.castleManager.changeOwner(s.defender, s.attacker.ownerClan, false, newLegionId);

                // ★追加：色が更新されたので、メッセージの前に地図を更新します！
                // ★今回追加：色を変える時に、かっこいいアニメーションの魔法を使います！
                if (typeof this.game.ui.playCaptureEffect === 'function' && this.canShowNotify(s.isPlayerFactionInvolved, s.isPlayerInvolved)) {
                    await this.game.ui.playCaptureEffect(s.defender.id, () => {
                        if (typeof this.game.writeSystemDiagnostic === 'function') this.game.writeSystemDiagnostic('war:capture_color:start', s.defender);
                        this.game.ui.updateClanColors();
                        if (typeof this.game.writeSystemDiagnostic === 'function') this.game.writeSystemDiagnostic('war:capture_color:done', s.defender);
                    });
                } else {
                    // ★Round10：通知されないAI戦争では色更新もプレイヤー復帰時へまとめます。
                    if (this.game.isProcessingAI && !this.game.isWatchMode && !s.isPlayerInvolved) {
                        this.game._aiDeferredMapRefresh = true;
                        if (typeof this.game.writeSystemDiagnostic === 'function') this.game.writeSystemDiagnostic('war:capture_color:deferred', s.defender);
                    } else {
                        if (typeof this.game.writeSystemDiagnostic === 'function') this.game.writeSystemDiagnostic('war:capture_color:start', s.defender);
                        this.game.ui.updateClanColors();
                        if (typeof this.game.writeSystemDiagnostic === 'function') this.game.writeSystemDiagnostic('war:capture_color:done', s.defender);
                    }
                }

                s.defender.soldiers = totalAtkSurvivors;
                
                // ★追加：敵が逃げて空っぽになった城に入るので、自分たちの士気と訓練をそのまま使います！
                s.defender.training = s.attacker.training || 0;
                s.defender.morale = s.attacker.morale || 0;
                
                // ★追加: 敵が撤退して空になった城を占領した時、持ってきた軍馬と鉄砲を城に格納する
                s.defender.horses = attackerSurvivedHorses;
                s.defender.guns = attackerSurvivedGuns;

                const srcC = this.game.getCastle(s.sourceCastle.id);
                s.atkBushos.forEach((b) => { 
                    this.game.factionSystem.handleMove(b, s.sourceCastle.id, s.defender.id); 
                    // ★新しいお引越しセンターの魔法を使います！
                    this.game.affiliationSystem.moveCastle(b, s.defender.id);
                });

                // ★追加：部隊の総大将（リストの先頭の武将）を新城主に仮任命します！
                if (s.atkBushos.length > 0) {
                    s.atkBushos[0].isCastellan = true;
                    s.defender.castellanId = s.atkBushos[0].id;
                }
                
                // ★書き足し１：守備側が撤退した時の履歴ログ
                const atkClanData1 = this.game.clans.find(c => c.id === s.attacker.ownerClan);
                const atkArmyName1 = s.attacker.isKunishu ? s.attacker.name : (atkClanData1 ? atkClanData1.getArmyName() : "敵軍");
                this.game.ui.log(`【合戦結果】守備軍の撤退により、${atkArmyName1}が${s.defender.name}を占領しました。`);
                
                if (s.isPlayerInvolved) {
                    const pid = Number(this.game.playerClanId);
                    const isAtkMain = (Number(s.attacker.ownerClan) === pid);
                    const isAtkAlly = this.isPlayerClanReinforcement(s.reinforcement, pid) || 
                                      this.isPlayerClanReinforcement(s.selfReinforcement, pid) ||
                                      (s.retreatedReinforcements && s.retreatedReinforcements.some(r => r.isAttackerData && this.isPlayerClanReinforcement(r.data, pid)));
                    const isAtkSide = isAtkMain || isAtkAlly;
                    
                    // ★追加：ダイアログを出す前にバリアを解除します！
                    if (typeof this.game.ui.hideMapGuard === 'function') this.game.ui.hideMapGuard(true);

                    if (isAtkSide) {
                        this.game.ui.showDialog(`敵軍は城を捨てて敗走しました！\n${s.defender.name}を占領します！`, false, finishWarProcess);
                    } else {
                        this.game.ui.showDialog(`撤退しました。\n${retreatTargetId ? '部隊は移動しました。' : '部隊は解散しました。'}`, false, finishWarProcess);
                    }
                } else {
                    // ★AIの結果メッセージを最後に表示します（イベント決着時などは空なのでスキップ）
                    if (aiResultMsg && this.canShowNotify(s.isPlayerFactionInvolved, s.isPlayerInvolved)) {
                        // ★追加：ダイアログを出す前にバリアを解除します！
                        if (typeof this.game.ui.hideMapGuard === 'function') this.game.ui.hideMapGuard(true);
                        await this.game.ui.showDialogAsync(aiResultMsg);
                    }
                    finishWarProcess();
                }
                return;
            }
                
            let resultMsg = "";
            // pid, isAtkPlayer, isDefPlayer の定義は上部に移動したため、ここでは敵の名前だけ決めます
            const enemyName = isAtkPlayer ? (this.game.clans.find(c => c.id === s.oldDefClanId)?.getArmyName() || "敵軍") : s.attacker.name;

            if (attackerWon) {
                // ★ここから書き足し：城側が負けた・撤退した時の追加減少
                if (!s.defender.isKunishu && !s.isKunishuSubjugation && !s.attacker.isKunishu) {
                    // 民忠をさらに現在の2割減らす
                    const dropLoyaltyEnd = Math.floor(s.defender.peoplesLoyalty * 0.2);
                    s.defender.peoplesLoyalty = Math.max(0, s.defender.peoplesLoyalty - dropLoyaltyEnd);

                    // 人口を制圧時点の攻撃側の兵士数の2割減らす
                    const dropPopulationEnd = Math.floor(s.attacker.soldiers * 0.2);
                    s.defender.population = Math.max(0, s.defender.population - dropPopulationEnd);
                }
                // ★書き足しここまで

                const maxMorale = (window.WarParams && window.WarParams.Military && window.WarParams.Military.MaxMoraleBase) ? window.WarParams.Military.MaxMoraleBase : 120;
                s.attacker.training = Math.min(120, s.attacker.training + window.WarParams.War.WinStatIncrease); s.attacker.morale = Math.min(maxMorale, s.attacker.morale + window.WarParams.War.WinStatIncrease);
                
                const maxCharm = Math.max(...s.atkBushos.map(b => b.charm));
                const subCharm = s.atkBushos.reduce((acc, b) => acc + b.charm, 0) - maxCharm;
                const daimyo = this.game.getClanDaimyo(s.attacker.ownerClan) || {charm: 50};
                const charmScore = maxCharm + (subCharm * 0.1) + (daimyo.charm * window.WarParams.War.DaimyoCharmWeight);
                let lossRate = Math.max(0, window.WarParams.War.LootingBaseRate - (charmScore * window.WarParams.War.LootingCharmFactor)); 
                if (lossRate > 0) {
                    const lostGold = Math.floor(s.defender.gold * lossRate); const lostRice = Math.floor(s.defender.rice * lossRate);
                    s.defender.gold -= lostGold; s.defender.rice -= lostRice;
                    if (s.isPlayerInvolved) this.game.ui.log(`(敵兵の持ち逃げにより 金${lostGold}, 米${lostRice} が失われた)`);
                }
                
                // ★城の管理システムにお任せします！
                const newLegionId = s.sourceCastle ? (s.sourceCastle.legionId || 0) : 0;
                this.game.castleManager.changeOwner(s.defender, s.attacker.ownerClan, false, newLegionId);

                // ★追加：色が更新されたので、メッセージの前に地図を更新します！
                // ★今回追加：色を変える時に、かっこいいアニメーションの魔法を使います！
                if (typeof this.game.ui.playCaptureEffect === 'function' && this.canShowNotify(s.isPlayerFactionInvolved, s.isPlayerInvolved)) {
                    await this.game.ui.playCaptureEffect(s.defender.id, () => {
                        if (typeof this.game.writeSystemDiagnostic === 'function') this.game.writeSystemDiagnostic('war:capture_color:start', s.defender);
                        this.game.ui.updateClanColors();
                        if (typeof this.game.writeSystemDiagnostic === 'function') this.game.writeSystemDiagnostic('war:capture_color:done', s.defender);
                    });
                } else {
                    // ★Round10：通知されないAI戦争では色更新もプレイヤー復帰時へまとめます。
                    if (this.game.isProcessingAI && !this.game.isWatchMode && !s.isPlayerInvolved) {
                        this.game._aiDeferredMapRefresh = true;
                        if (typeof this.game.writeSystemDiagnostic === 'function') this.game.writeSystemDiagnostic('war:capture_color:deferred', s.defender);
                    } else {
                        if (typeof this.game.writeSystemDiagnostic === 'function') this.game.writeSystemDiagnostic('war:capture_color:start', s.defender);
                        this.game.ui.updateClanColors();
                        if (typeof this.game.writeSystemDiagnostic === 'function') this.game.writeSystemDiagnostic('war:capture_color:done', s.defender);
                    }
                }

                s.defender.immunityUntil = this.game.getCurrentTurnId() + 1;
                
                const srcC = this.game.getCastle(s.sourceCastle.id);
                s.atkBushos.forEach((b) => { 
                    this.game.factionSystem.handleMove(b, s.sourceCastle.id, s.defender.id); 
                    // ★新しいお引越しセンターの魔法を使います！
                    this.game.affiliationSystem.moveCastle(b, s.defender.id);
                });

                // ★追加：部隊の総大将（リストの先頭の武将）を新城主に仮任命します！
                if (s.atkBushos.length > 0) {
                    s.atkBushos[0].isCastellan = true;
                    s.defender.castellanId = s.atkBushos[0].id;
                }
                
                if (isAtkPlayer) resultMsg = isRetreat ? `${enemyName}は城を捨てて敗走しました！ 城を占領します！` : `${s.defender.name}を制圧しました！`;
                else if (isDefPlayer) resultMsg = isRetreat ? `${s.defender.name}を放棄し、後退します……` : `${s.defender.name}が陥落しました。敵軍がなだれ込んできます……`;
                else resultMsg = `${s.defender.name}が制圧されました！\n勝者: ${s.attacker.name}`;
                // ★書き足し２：攻撃側が勝利して制圧した時の履歴ログ
                const atkClanData2 = this.game.clans.find(c => c.id === s.attacker.ownerClan);
                const atkArmyName2 = s.attacker.isKunishu ? s.attacker.name : (atkClanData2 ? atkClanData2.getArmyName() : "敵軍");
                this.game.ui.log(`【合戦結果】${atkArmyName2}が${s.defender.name}を制圧しました。`);
            } else {
                s.defender.immunityUntil = this.game.getCurrentTurnId(); 
                if (isAtkPlayer) resultMsg = isRetreat ? `${s.defender.name}からの撤退を決定しました……` : `${s.defender.name}を落としきることができませんでした……`;
                else if (isDefPlayer) resultMsg = isRetreat ? `${enemyName}は攻略を諦め、撤退していきました！` : `${s.defender.name}を守り抜きました！`;
                else resultMsg = isRetreat ? `${s.defender.name}から撤退しました……` : `${s.defender.name}を守り抜きました！\n敗者: ${s.attacker.name}`;
                // ★書き足し３：攻撃側が負けた（または撤退した）時の履歴ログ
                const defClanData = this.game.clans.find(c => c.id === s.defender.ownerClan);
                const defArmyName = s.defender.isKunishu ? s.defender.name : (defClanData ? defClanData.getArmyName() : "守備軍");
                if (isRetreat) {
                     const atkClanData3 = this.game.clans.find(c => c.id === s.attacker.ownerClan);
                     const atkArmyName3 = s.attacker.isKunishu ? s.attacker.name : (atkClanData3 ? atkClanData3.getArmyName() : "攻撃軍");
                     this.game.ui.log(`【合戦結果】${atkArmyName3}は${s.defender.name}の攻略を諦め、撤退しました。`);
                } else {
                     this.game.ui.log(`【合戦結果】${defArmyName}が${s.defender.name}の防衛に成功しました。`);
                }
            } 

            // ★追加：合戦が終わったら、勝敗に関わらず両方のお城の城主を再確認します！
            // 討ち死にや大名の移動などで、城主が不在になっている場合があるためです
            if (s.sourceCastle) {
                this.game.affiliationSystem.updateCastleLord(s.sourceCastle);
            }
            if (s.defender) {
                this.game.affiliationSystem.updateCastleLord(s.defender);
            }
            
            if (s.isPlayerInvolved) {
                // ★追加：ダイアログを出す前にバリアを解除します！
                if (typeof this.game.ui.hideMapGuard === 'function') this.game.ui.hideMapGuard(true);

                if (attackerWon && !isRetreat && isAtkPlayer) {
                    if (window.AudioManager) {
                        // ★修正：フェードアウトさせると音量が0になって戻らなくなるので、ピタッと止める魔法にします！
                        if (typeof window.AudioManager.stopBgm === 'function') {
                            window.AudioManager.stopBgm();
                        }
                        window.AudioManager.playSE('victory.ogg');
                    }
                }
                
                this.game.ui.showDialog(resultMsg, false, finishWarProcess);
            }
            else {
                // ★AIの結果メッセージを最後に表示します（イベント決着時などは空なのでスキップ）
                if (aiResultMsg && this.canShowNotify(s.isPlayerFactionInvolved, s.isPlayerInvolved)) {
                    // ★追加：ダイアログを出す前にバリアを解除します！
                    if (typeof this.game.ui.hideMapGuard === 'function') this.game.ui.hideMapGuard(true);
                    await this.game.ui.showDialogAsync(aiResultMsg);
                }
                finishWarProcess();
            }
        } catch (e) {
            console.error("EndWar Error: ", e);
            if (typeof this.game.ui.hideMapGuard === 'function') this.game.ui.hideMapGuard(true);

            this.game.ui.restoreAIGuardText(true);

            if (this.game.ui && typeof this.game.ui.hideAIWarThinking === 'function') {
                this.game.ui.hideAIWarThinking();
            }

            if (this.state.isPlayerInvolved) this.game.ui.showDialog("合戦処理中にエラーが発生しましたが、ゲームを継続します。", false, () => { this.game.finishTurn(); });
            else this.game.finishTurn();
        }
    },
    
    processCaptures(defeatedCastle, winnerClanId) {
        const losers = this.game.getCastleBushos(defeatedCastle.id); const captives = []; const escapees = [];
        // ★修正：新しい逃げ先を探す魔法を使います！
        const friendlyCastles = this.getEscapeCandidates(defeatedCastle);
        const isLastStand = friendlyCastles.length === 0;

        losers.forEach(b => { 
            // ★ 修正: 未登場の武将を巻き込んで捕虜や浪人にしないように守ります！
            if (window.BushoStatusRules.isRonin(b) || window.LifeStatusRules.isUnavailable(b)) return;
            // ★ 修正: 諸勢力に所属している武将は、どんな城の戦いでも絶対に巻き添えで捕虜にならないように守ります！
            if (b.belongKunishuId > 0) return;

            let chance = isLastStand ? 1.0 : (window.WarParams.War.CaptureChanceBase - (b.strength * window.WarParams.War.CaptureStrFactor) + (Math.random() * 0.3));
            if (!isLastStand && defeatedCastle.soldiers > 1000) chance -= 0.2; 
            if (!isLastStand && b.isDaimyo) chance -= window.WarParams.War.DaimyoCaptureReduction;
            
            if (chance > 0.5) { 
                captives.push(b); 
                // ★城から出て捕虜になります
                this.game.affiliationSystem.leaveCastle(b);
            } else { 
                if (friendlyCastles.length > 0) {
                    const escapeCastle = friendlyCastles[Math.floor(Math.random() * friendlyCastles.length)];
                    this.game.factionSystem.handleMove(b, defeatedCastle.id, escapeCastle.id); 
                    // ★新しいお引越しセンターの魔法を使います！
                    this.game.affiliationSystem.moveCastle(b, escapeCastle.id);
                    escapees.push(b);
                    
                    // ★修正：共通化された大名逃亡処理を呼び出します
                    this.handleDaimyoEscape(b, escapeCastle);
                } else { 
                    // ★新しいお引越しセンターの魔法を使います！
                    this.game.affiliationSystem.becomeRonin(b);
                }
            }
        }); 
        if (escapees.length > 0 && (defeatedCastle.ownerClan === this.game.playerClanId || winnerClanId === this.game.playerClanId)) this.game.ui.log(`${escapees.length}名の武将が自領へ逃げ帰りました。`);
        if (captives.length > 0) { 
            this.pendingPrisoners = captives; 
        } 
    },
    
    // ==========================================
    // ★ここから新しいフェーズ管理の魔法です！
    // ==========================================
    startPrisonerPhase() {
        // ①大名処遇フェーズ：まずは大名がいるかチェックします
        const daimyoIndex = this.pendingPrisoners.findIndex(p => p.isDaimyo);
        if (daimyoIndex !== -1) {
            this.showDaimyoDialog(this.pendingPrisoners[daimyoIndex]);
        } else {
            // 大名がいなければ登用フェーズへ進みます
            this.startHirePhaseIntro();
        }
    },

    showDaimyoDialog(prisoner) {
        // ★追加：登用のチャレンジ回数を数える箱を用意します。まだなければ0にします。
        prisoner.hireChallengeCount = prisoner.hireChallengeCount || 0;
        // ★追加：3回以上チャレンジしていたら「押せない状態」にするフラグを作ります。
        const isHireDisabled = prisoner.hireChallengeCount >= 3;

        const clanData = this.game.clans.find(c => c.id === prisoner.clan);
        const clanName = clanData ? clanData.name : "不明";
        
        const msg = `${clanName}当主・${prisoner.name}を捕えました。処遇を決定してください。`;

        // 共通化されたUIの選択肢機能を使って3つのボタンを並べます
        this.game.ui.showDialog(msg, false, null, null, {
            choices: [
                {
                    label: '登用',
                    className: 'btn-primary',
                    disabled: isHireDisabled, // ★追加：ここで押せないボタンにする魔法をかけます！
                    onClick: () => this.handleDaimyoPrisonerAction(prisoner, 'hire')
                },
                {
                    label: '処断',
                    className: 'btn-danger',
                    onClick: () => this.handleDaimyoPrisonerAction(prisoner, 'kill')
                },
                {
                    label: '解放',
                    className: 'btn-secondary',
                    onClick: () => this.handleDaimyoPrisonerAction(prisoner, 'release')
                }
            ]
        });
    },

    async handleDaimyoPrisonerAction(prisoner, action) {
        const index = this.pendingPrisoners.findIndex(p => p.id === prisoner.id);
        if (index === -1) {
            this.startHirePhaseIntro();
            return;
        }
        
        const originalClanId = prisoner.clan;
        const friendlyCastles = this.game.castles.filter(c => c.ownerClan === originalClanId && originalClanId !== 0);
        const isExtinct = (friendlyCastles.length === 0);
        
        const stayStep = () => {
             this.showDaimyoDialog(prisoner);
        };
        const nextStep = async () => {
             this.pendingPrisoners.splice(index, 1);
             this.startHirePhaseIntro();
        };

        if (action === 'hire') {
            // ★追加：登用を選んだので、チャレンジ回数を1回増やします！
            prisoner.hireChallengeCount = (prisoner.hireChallengeCount || 0) + 1;

            const myBushos = this.game.bushos.filter(b=>b.clan===this.game.playerClanId && !window.LifeStatusRules.isUnborn(b));
            const recruiter = myBushos.find(b => b.isDaimyo) || myBushos[0];
            
            if (!isExtinct) {
                // 所領が残っている時（確定失敗）
                prisoner.hasRefusedHire = true;
                this.game.ui.showDialog(`「敵の軍門には降らぬ！」`, false, stayStep, null, {
                    leftFace: prisoner.faceIcon,
                    leftName: prisoner.name
                });
            } else {
                // 滅亡時の登用判定
                let hireProb = this.calcPrisonerHireProb(recruiter, prisoner, this.game.playerClanId, true, 0);

                if (hireProb > Math.random()) {
                    // 登用成功時
                    prisoner.isDaimyo = false;
                    this.daimyoHiredBonus = 0.5; 
                    prisoner.belongKunishuId = 0;
                    const targetC = this.game.getCastle(prisoner.castleId) || this.game.getCurrentTurnCastle(); 
                    if(targetC) { 
                        this.game.affiliationSystem.joinClan(prisoner, this.game.playerClanId, targetC.id);
                    }
                    this.game.ui.showDialog(`「もはや趨勢は決したか……致し方あるまい」`, false, () => {
                        this.game.ui.showDialog(`${prisoner.name}は当家に臣従を誓いました！`, false, nextStep);
                    }, null, {
                        leftFace: prisoner.faceIcon,
                        leftName: prisoner.name
                    });
                } else {
                    // 登用失敗時
                    prisoner.hasRefusedHire = true;
                    this.game.ui.showDialog(`「断る。煮るなり焼くなり好きにせい」`, false, stayStep, null, {
                        leftFace: prisoner.faceIcon,
                        leftName: prisoner.name
                    });
                }
            }
        } else if (action === 'kill') {
            // 処断時
            this.game.ui.showDialog(`「斯様な所で果てようとは……ぐふっ」`, false, async () => {
                this.registerNemesisForExecuted(prisoner, this.game.playerClanId);
                
                // ★追加：総取りが発生する場合は家督相続をスキップします
                const skipSuccession = this.isTotalTakeoverPending();
                await this.game.lifeSystem.executeDeath(prisoner, { skipDaimyoSuccession: skipSuccession });
                
                this.game.ui.showDialog(`${prisoner.name}を処断しました。`, false, nextStep);
            }, null, {
                leftFace: prisoner.faceIcon,
                leftName: prisoner.name
            });
        } else if (action === 'release') {
            // 解放時
            if (isExtinct) prisoner.isDaimyo = false;
            
           if (!isExtinct) {
                // ★一元化された魔法を使って帰還先を決めます！
                const returnCastle = this.getReleaseReturnCastle(prisoner, friendlyCastles, originalClanId);

                this.game.factionSystem.handleMove(prisoner, 0, returnCastle.id); 
                this.game.affiliationSystem.moveCastle(prisoner, returnCastle.id);
                this.game.affiliationSystem.setActivityStatusRaw(prisoner, window.GameConstants.BushoStatus.ACTIVE); 
                prisoner.isCastellan = false;
            } else {
                this.game.affiliationSystem.becomeRonin(prisoner);
            }
            this.game.ui.showDialog(`「生きて恥を晒せと申すか……」`, false, () => {
                this.game.ui.showDialog(`${prisoner.name}を解放しました。`, false, nextStep);
            }, null, {
                leftFace: prisoner.faceIcon,
                leftName: prisoner.name
            });
        }
    },

    startHirePhaseIntro() {
        // ②登用フェーズ
        if (this.pendingPrisoners.length === 0) {
            this.finishPrisonerPhase();
            return;
        }
        this.game.ui.showDialog("登用する武将を選択してください。", false, () => {
            this.openHireSelector();
        });
    },

    openHireSelector() {
        const selectableCount = this.pendingPrisoners.filter(p => !p.hasRefusedHire).length;
        if (selectableCount === 0) {
            // ★変更：0人の時は終了確認をせず、メッセージを出して次の処断フェーズへ進みます
            this.game.ui.showDialog("登用できる武将がいないため、次の処遇へ進みます。", false, () => {
                this.startKillPhaseIntro();
            });
            return;
        }

        this.game.ui.info.showPrisonerSelector('hire', this.pendingPrisoners, 
            (selectedIds) => {
                this.processHireList(selectedIds);
            },
            () => {
                this.checkFinishHirePhase();
            }
        );
    },

    checkFinishHirePhase() {
        this.game.ui.showDialog("登用を終了しますか？", true, 
            () => { this.startKillPhaseIntro(); }, // はい：次のフェーズへ
            () => { this.openHireSelector(); } // いいえ：リストに戻る
        );
    },

    async processHireList(selectedIds) {
        // 選ばれた武将たちを順番に登用していきます
        const myBushos = this.game.bushos.filter(b=>b.clan===this.game.playerClanId && !window.LifeStatusRules.isUnborn(b)); 
        const recruiter = myBushos.find(b => b.isDaimyo) || myBushos[0];
        const targetC = this.game.getCurrentTurnCastle();

        let hiredNames = [];
        let refusedNames = [];

        for (let id of selectedIds) {
            const prisoner = this.pendingPrisoners.find(p => p.id === id);
            if (!prisoner) continue;
            
            const kunishu = prisoner.belongKunishuId > 0 ? this.game.kunishuSystem.getKunishu(prisoner.belongKunishuId) : null;
            if (kunishu && prisoner.id === kunishu.leaderId) {
                prisoner.hasRefusedHire = true;
                refusedNames.push(prisoner.name);
                continue;
            }
            
            const originalClanId = prisoner.clan;
            const friendlyCastles = this.game.castles.filter(c => c.ownerClan === originalClanId && originalClanId !== 0);
            const isExtinct = (friendlyCastles.length === 0);

            let hireProb = this.calcPrisonerHireProb(recruiter, prisoner, this.game.playerClanId, isExtinct, this.daimyoHiredBonus || 0);

            if (hireProb > Math.random()) {
                // 登用成功！
                prisoner.belongKunishuId = 0;
                if(targetC) { 
                    this.game.affiliationSystem.joinClan(prisoner, this.game.playerClanId, targetC.id);
                }
                hiredNames.push(prisoner.name);
                // 成功した人はリストから消します
                this.pendingPrisoners = this.pendingPrisoners.filter(p => p.id !== prisoner.id);
            } else {
                // 登用失敗…
                prisoner.hasRefusedHire = true;
                refusedNames.push(prisoner.name);
            }
        }

        // 名前を3人までで省略する便利なお道具を作ります
        const formatNames = (names) => {
            if (names.length <= 3) {
                return names.join('、');
            } else {
                return `${names[0]} 以下${names.length - 1}名`;
            }
        };

        let msg = "";
        if (hiredNames.length > 0) msg += `${formatNames(hiredNames)} を登用しました。\n`;
        if (refusedNames.length > 0) msg += `${formatNames(refusedNames)} には登用を断られました。`;
        if (msg === "") msg = "登用処理が完了しました。";

        this.game.ui.showDialog(msg, false, () => {
            this.openHireSelector();
        });
    },

    startKillPhaseIntro() {
        // ③処断フェーズ
        if (this.pendingPrisoners.length === 0) {
            this.finishPrisonerPhase();
            return;
        }
        // 処断する予定の人のリストを用意します
        this.pendingKills = [];
        this.game.ui.showDialog("処断する武将を選択してください。", false, () => {
            this.openKillSelector();
        });
    },

    openKillSelector() {
        if (this.pendingPrisoners.length === 0) {
            // ★変更：0人の時は終了確認をせず、メッセージを出して捕虜処遇を完了させます
            this.game.ui.showDialog("処断できる武将がいないため、捕虜の処遇を終了します。", false, () => {
                this.finishPrisonerPhase();
            });
            return;
        }

        this.game.ui.info.showPrisonerSelector('kill', this.pendingPrisoners, 
            (selectedIds) => {
                this.processKillSelection(selectedIds);
            },
            () => {
                this.checkFinishKillPhase();
            }
        );
    },

    checkFinishKillPhase() {
        this.game.ui.showDialog("処断を終了しますか？", true, 
            () => { this.finishPrisonerPhase(); }, // はい：全員の処遇を確定させます
            () => { this.openKillSelector(); } // いいえ：リストに戻る
        );
    },

    processKillSelection(selectedIds) {
        let targetNames = [];

        // まずは誰を選んだのか、名前だけをメモ帳に書き出します（ここではまだ処断リストには移しません！）
        for (let id of selectedIds) {
            const prisoner = this.pendingPrisoners.find(p => p.id === id);
            if (prisoner) {
                targetNames.push(prisoner.name);
            }
        }

        if (targetNames.length === 0) {
            this.openKillSelector();
            return;
        }

        // 名前を3人までで省略する便利なお道具を作ります
        const formatNames = (names) => {
            if (names.length <= 3) {
                return names.join('、');
            } else {
                return `${names[0]} 以下${names.length - 1}名`;
            }
        };

        const displayName = formatNames(targetNames);

        // 確認のメッセージダイアログを出します（true にして、２つの選択肢が出るようにします）
        // オプション機能を使って、ボタンの文字と色を直接指定します
        this.game.ui.showDialog(`${displayName} を本当に処断してよろしいですか？`, true, 
            () => { 
                // 「処断する」を選んだ時の処理：ここで初めて処断予定リストに移します
                for (let id of selectedIds) {
                    const prisoner = this.pendingPrisoners.find(p => p.id === id);
                    if (prisoner) {
                        this.pendingKills.push(prisoner);
                        this.pendingPrisoners = this.pendingPrisoners.filter(p => p.id !== prisoner.id);
                    }
                }
                // そして、処断完了のメッセージを出します
                this.game.ui.showDialog(`${displayName} を処断しました。`, false, () => {
                    this.openKillSelector();
                });
            },
            () => { 
                // 「やめる」を選んだ時の処理：武将は移さず、そのままリストに戻ります
                this.openKillSelector();
            },
            {
                okText: '処断する',
                okClass: 'btn-danger',
                cancelText: 'やめる',
                cancelClass: 'btn-secondary'
            }
        );
    },

    async finishPrisonerPhase() {
        // 予定通りに処断を実行します
        if (this.pendingKills && this.pendingKills.length > 0) {
            const skipSuccession = this.isTotalTakeoverPending(); // ★追加：総取りの事前確認
            for (let p of this.pendingKills) {
                this.registerNemesisForExecuted(p, this.game.playerClanId);
                await this.game.lifeSystem.executeDeath(p, { skipDaimyoSuccession: skipSuccession });
            }
        }
        
        // 処断も登用もされなかった残りの武将たちを解放します
        if (this.pendingPrisoners && this.pendingPrisoners.length > 0) {
            let releasedNames = [];
            for (let prisoner of this.pendingPrisoners) {
                const kunishu = prisoner.belongKunishuId > 0 ? this.game.kunishuSystem.getKunishu(prisoner.belongKunishuId) : null;
                const originalClanId = prisoner.clan;
                const friendlyCastles = this.game.castles.filter(c => c.ownerClan === originalClanId && originalClanId !== 0);
                const isExtinct = (friendlyCastles.length === 0);

                if (kunishu && !kunishu.isDestroyed) {
                    const returnCastle = this.game.getCastle(kunishu.castleId);
                    if (returnCastle) {
                        this.game.affiliationSystem.moveCastle(prisoner, returnCastle.id);
                        this.game.affiliationSystem.setActivityStatusRaw(prisoner, window.GameConstants.BushoStatus.ACTIVE); 
                    }
                } else {
                    if (!isExtinct) {
                        // ★一元化された魔法を使って帰還先を決めます！
                        const returnCastle = this.getReleaseReturnCastle(prisoner, friendlyCastles, originalClanId);

                        this.game.factionSystem.handleMove(prisoner, 0, returnCastle.id); 
                        this.game.affiliationSystem.moveCastle(prisoner, returnCastle.id);
                        this.game.affiliationSystem.setActivityStatusRaw(prisoner, window.GameConstants.BushoStatus.ACTIVE); 
                        prisoner.isCastellan = false;
                    } else { 
                        this.game.affiliationSystem.becomeRonin(prisoner);
                    }
                }
                releasedNames.push(prisoner.name);
            }
            if (releasedNames.length > 0) {
                this.game.ui.log(`(捕虜となっていた ${releasedNames.join('、')} を解放しました)`);
            }
        }
        
        // リストを綺麗にお掃除します
        this.pendingPrisoners = [];
        this.pendingKills = [];
        
        // ★追加：戦後処理が終わったので、総取りシステムが発動するかチェックします！
        await this.checkTotalTakeover(this.state);

        // 全て終わったので滅亡チェックをしてターンを終了します
        const extReason = this.state.isTotalTakeoverExecuted ? 'total_takeover' : 'no_castle';
        await this.game.lifeSystem.checkClanExtinction(this.state.oldDefClanId, extReason);
        if (window.GameApp) window.GameApp.updateAllClanPrestige();
        this.game.finishTurn();
    },
    
    async autoResolvePrisoners(captives, winnerClanId) { // ★ async を追加
        // ★軽量化：勝者勢力の全武将を毎回filterせず、既存の大名索引を使います。
        // 大名が存在しない特殊ケースだけ従来相当の代表者検索へフォールバックします。
        const recruiter = this.game.getClanDaimyo(winnerClanId) ||
            this.game.bushos.find(b => b.clan === winnerClanId && !window.LifeStatusRules.isUnborn(b)) ||
            { charm: 50, affinity: 0 };

        // ★大名から先に処理するように並べ替えます
        captives.sort((a, b) => (b.isDaimyo ? 1 : 0) - (a.isDaimyo ? 1 : 0));
        let daimyoHiredBonus = 0; // ★ご褒美の箱
        
        for (const p of captives) { 
            // ★大名家が滅亡している（他に城がない）かをチェックします
            const friendlyCastles = this.game.castles.filter(c => c.ownerClan === p.clan && p.clan !== 0);
            const isExtinct = (friendlyCastles.length === 0);

            // ★討死フラグがあり、本来の寿命を過ぎている武将は必ず処断します！
            if (p.isKilledInBattle && this.game.year >= p.originalEndYear) {
                this.registerNemesisForExecuted(p, winnerClanId);
                await this.game.lifeSystem.executeDeath(p, { skipDaimyoSuccession: this.isTotalTakeoverPending() });
                continue; 
            }

            // ★変更：fe_system.js の魔法にお任せします！
            if (p.isDaimyo && !isExtinct) { 
                this.registerNemesisForExecuted(p, winnerClanId);
                await this.game.lifeSystem.executeDeath(p, { skipDaimyoSuccession: this.isTotalTakeoverPending() });
                continue; 
            }
            
            const isKunishuBoss = (p.belongKunishuId > 0 && p.id === this.game.kunishuSystem.getKunishu(p.belongKunishuId)?.leaderId);

            let hireProb = this.calcPrisonerHireProb(recruiter, p, winnerClanId, isExtinct, daimyoHiredBonus);

            if (!isKunishuBoss && hireProb > Math.random()) {
                // ★大名が登用に応じた場合は、看板を下ろさせてご褒美をセット！
                if (p.isDaimyo) {
                    p.isDaimyo = false;
                    daimyoHiredBonus = 0.5;
                }
                
                p.belongKunishuId = 0;
                const targetC = this.game.getCastle(p.castleId);
                if (targetC) { 
                    // ★新しいお引越しセンターの魔法を使います！
                    this.game.affiliationSystem.joinClan(p, winnerClanId, targetC.id);
                }
                continue; 
            } 
            
            // ★ここから「処断されるか、見逃されるか」の計算式
            let killProb = 0;
            
            if (p.charm <= 10) {
                killProb = 50;
            } else if (p.charm >= 70) {
                killProb = 0;
            } else {
                killProb = 50 - (p.charm - 10) * (50 / 60);
                killProb = Math.max(0, killProb);
            }

            const totalStats = p.leadership + p.strength + (p.politics || 0) + (p.diplomacy || 0) + p.intelligence;
            
            let totalBonus = (250 - totalStats) / 10; 
            totalBonus = Math.max(-10, Math.min(10, totalBonus)); 
            killProb += totalBonus;

            const statsList = [p.leadership, p.strength, p.politics || 0, p.diplomacy || 0, p.intelligence];
            let individualBonus = 0;
            statsList.forEach(stat => {
                if (stat >= 61) {
                    individualBonus += (stat - 60) * 0.2;
                }
            });
            killProb -= individualBonus; 

            // ★追加：大名が滅亡して登用拒否した場合、処断確率を20%アップ（容赦なく斬る）
            if (p.isDaimyo && isExtinct) {
                killProb += 20;
            }

            killProb = Math.max(0, Math.min(100, killProb));

            if (Math.random() * 100 < killProb) {
                // ==========================================
                // ★処断される場合も、life_system.js の魔法にお任せします！
                this.registerNemesisForExecuted(p, winnerClanId);
                await this.game.lifeSystem.executeDeath(p, { skipDaimyoSuccession: this.isTotalTakeoverPending() });
                // ==========================================
            } else {
                // ★大名が解放される場合、滅亡していたら看板を下ろします
                if (p.isDaimyo) {
                    if (isExtinct) {
                        p.isDaimyo = false;
                    }
                }
                // 見逃された！
                const kunishu = p.belongKunishuId > 0 ? this.game.kunishuSystem.getKunishu(p.belongKunishuId) : null;
                if (kunishu && !kunishu.isDestroyed) {
                    this.game.affiliationSystem.moveCastle(p, kunishu.castleId);
                    this.game.affiliationSystem.setActivityStatusRaw(p, window.GameConstants.BushoStatus.ACTIVE); 
                } else {
                    const originalClanId = p.clan; 
                    const friendlyCastlesExt = this.game.castles.filter(c => c.ownerClan === originalClanId && originalClanId !== 0);
                    
                    if (friendlyCastlesExt.length > 0) {
                        // ★一元化された魔法を使って帰還先を決めます！
                        const returnCastle = this.getReleaseReturnCastle(p, friendlyCastlesExt, originalClanId);

                        this.game.factionSystem.handleMove(p, 0, returnCastle.id); 
                        this.game.affiliationSystem.moveCastle(p, returnCastle.id);
                        this.game.affiliationSystem.setActivityStatusRaw(p, window.GameConstants.BushoStatus.ACTIVE); 
                        p.isCastellan = false;
                    } else {
                        // ★新しいお引越しセンターの魔法を使います！
                        this.game.affiliationSystem.becomeRonin(p);
                    }
                }
            }
        }
    },
    
    async closeWar() { 
        // ★念のためバリアを強制解除します！
        if (typeof this.game.ui.hideMapGuard === 'function') this.game.ui.hideMapGuard(true);

        // 一元管理の魔法で透明化を完全に解除します！
        this.game.ui.restoreAIGuardText(true);

        if (this.game.ui && typeof this.game.ui.hideAIWarThinking === 'function') {
            this.game.ui.hideAIWarThinking();
        }

        // ★諸勢力との戦いが終わった時も平時のBGMに戻す！
        if (window.AudioManager && this.state.isPlayerInvolved) {
            window.AudioManager.restoreMemorizedBgm();
        }

        // ★追加：諸勢力との戦いで城主が討ち死にした場合などに備えて、念のため再確認します！
        if (this.state.sourceCastle) {
            this.game.affiliationSystem.updateCastleLord(this.state.sourceCastle);
        }
        if (this.state.defender) {
            this.game.affiliationSystem.updateCastleLord(this.state.defender);
        }

        // ★Round10：AI戦争の終了ごとにフル renderMap() していた漏れを修正します。
        // AI中はプレイヤー復帰時の1回にまとめ、観戦中またはプレイヤー参戦時だけ即時描画します。
        const deferWarMapRefresh = this.game.isProcessingAI && !this.game.isWatchMode && !this.state.isPlayerInvolved;
        if (deferWarMapRefresh) {
            this.game._aiDeferredMapRefresh = true;
            if (typeof this.game.writeSystemDiagnostic === 'function') this.game.writeSystemDiagnostic('war:close_map:deferred', this.state.defender || this.state.sourceCastle);
        } else {
            if (typeof this.game.writeSystemDiagnostic === 'function') this.game.writeSystemDiagnostic('war:close_map:start', this.state.defender || this.state.sourceCastle);
            this.game.ui.renderMap();
            if (typeof this.game.writeSystemDiagnostic === 'function') this.game.writeSystemDiagnostic('war:close_map:done', this.state.defender || this.state.sourceCastle);
        }
        if (this.state.isPlayerInvolved) { 
            this.game.ui.updatePanelHeader();
            this.game.ui.renderCommandMenu(); 
        }

        // ★追加：勝敗メッセージが閉じたこのタイミングで「思考中...」を再表示します！
        if (this.game.ui) {
            this.game.ui.restoreAIGuard();
        }

        // ★追加：戦争全体の「終了処理後」の合図を出します
        if (this.game.eventManager) {
            await this.game.eventManager.processEvents('after_war', this.state);
        }
        
        // setTimeout中に別処理が state を触っても対象がぶれないよう、ここで必要なIDだけ退避します。
        const prestigeDiagnosticCastle = this.state.defender || this.state.sourceCastle || null;
        const prestigeClanIds = new Set([
            Number(this.state.attacker && this.state.attacker.ownerClan) || 0,
            Number(this.state.oldDefClanId) || 0,
            Number(this.state.defender && this.state.defender.ownerClan) || 0,
            Number(this.state.sourceCastle && this.state.sourceCastle.ownerClan) || 0
        ]);
        prestigeClanIds.delete(0);

        setTimeout(() => {
            // ★Round10：1回の戦争で変化し得る勢力だけ威信を更新します。
            // 全国再計算を毎戦争ごとに行う必要はありません。
            if (typeof this.game.writeSystemDiagnostic === 'function') {
                this.game.writeSystemDiagnostic('war:prestige:start', prestigeDiagnosticCastle);
            }
            if (typeof this.game.updateClanPrestige === 'function') {
                prestigeClanIds.forEach(clanId => this.game.updateClanPrestige(clanId));
            } else if (window.GameApp && typeof window.GameApp.updateAllClanPrestige === 'function') {
                window.GameApp.updateAllClanPrestige();
            }
            if (typeof this.game.writeSystemDiagnostic === 'function') {
                this.game.writeSystemDiagnostic('war:prestige:done', prestigeDiagnosticCastle);
            }
            this.game.finishTurn(); 
        }, 100);
    },
    
    // ★守備側が「自分の別の城」から援軍を呼べるかチェックする魔法
    checkDefenderSelfReinforcement(defCastle, onComplete) {
        console.log("【守備側の自勢力援軍チェックフェーズ開始】");
        const defClanId = defCastle.ownerClan;
        const pid = this.game.playerClanId;
        
        // ★修正：反乱（蜂起）された側は援軍を呼べるように、「this.state.attacker.isKunishu」の条件を消しました！
        // 守備側が中立や諸勢力、またはこちらから諸勢力を鎮圧しに行っている場合は自家援軍はなし
        if (defClanId === 0 || defCastle.isKunishu || this.state.isKunishuSubjugation) {
            onComplete(null);
            return;
        }

        // ★追加：守備側（目的地）のお城がある国が大雪だったら、誰も助けに来られないので諦めます！
        const defProv = this.game.provinces.find(p => p.id === defCastle.provinceId);
        if (defProv && defProv.statusEffects && defProv.statusEffects.includes('heavySnow')) {
            onComplete(null);
            return;
        }

        // ★修正：共通の魔法を使って、繋がっている領土をサクッと取得します！
        const connectedCastles = defCastle.getConnectedCastles(this.game);

        // ★修正：条件のチェックをすべて「外交の専門部署」に任せます！
        const candidateCastles = this.game.diplomacyManager.findAvailableReinforcements(
            true, true, defCastle.id, defCastle, defClanId, this.state.attacker.ownerClan, connectedCastles
        );

        if (candidateCastles.length === 0) {
            console.log("条件に合う自勢力の援軍候補のお城がありませんでした。");
            onComplete(null);
            return;
        }

        if (defClanId === pid && !defCastle.isDelegated) {
            // ★修正：元に戻して、マップ選択前には念押しでガードを外すだけにします
            this.game.ui.hideAIGuardTemporarily(); 
            
            this.game.ui.showDialog("他の城から援軍を出陣させますか？", true, 
                () => {
                    this.game.ui.hideAIGuardTemporarily(); 
                    this.game.ui.showDefSelfReinforcementSelector(candidateCastles, defCastle, (reinfData) => {
                        onComplete(reinfData);
                    });
                },
                () => {
                    this.game.ui.hideAIGuardTemporarily();
                    onComplete(null); 
                },
                { okText: '援軍を出す', cancelText: '出さない' }
            );
        } else {
            // AIなら自動で一番兵士が多い城から送る
            candidateCastles.sort((a,b) => b.soldiers - a.soldiers);
            const bestCastle = candidateCastles[0];
            console.log(`自勢力の援軍を呼ぶお城を選びました: ${bestCastle.name}`);
            // 差し替え後：checkDefenderSelfReinforcement 内の委任城からの守備応援要請
            
            if (defClanId === pid && !bestCastle.isDelegated) {
                const castellan = this.game.getBusho(defCastle.castellanId);
                const requesterName = castellan ? castellan.name : "城主";
                
                const promptBusho = () => {
                    this.game.ui.openBushoSelector('def_self_reinf_deploy', bestCastle.id, {
                        hideCancel: false, 
                        onConfirm: (selectedBushoIds) => {
                            this.game.commandSystem.handleBushoSelectionForDefSelfReinf(bestCastle.id, selectedBushoIds, defCastle, onComplete, promptBusho);
                        },
                        onCancel: () => {
                            this.game.ui.showDialog("援軍の派遣を取りやめました。", false, () => onComplete(null));
                        }
                    });
                };
                
                const showReq = () => {
                    const choices = [
                        { label: '応じる', className: 'btn-primary', onClick: () => promptBusho() }
                    ];
                    choices.push({
                        label: '戦況', className: 'btn-secondary', onClick: () => {
                            this.showSituationReport(false, this.state.sourceCastle, this.state.atkBushos, defCastle, bestCastle, showReq);
                        }
                    });
                    choices.push({ label: '応じない', className: 'btn-danger', onClick: () => onComplete(null) });

                    this.game.ui.showDialog(`${requesterName}が${bestCastle.name}に救援を求めています。\n援軍要請に応じますか？`, false, null, null, { choices: choices });
                };
                showReq();
            } else {
                // 自動で援軍を送る
                this.executeDefSelfReinforcementAuto(bestCastle, defCastle, (reinfData) => {
                    onComplete(reinfData);
                });
            }
        }
    },
    
    // ★守備側が援軍を呼べるかチェックする機能
    checkDefenderReinforcement(defCastle, atkClanId, onComplete) {
        console.log("【守備側の他勢力援軍チェックフェーズ開始】");
        const defClanId = defCastle.ownerClan;
        const pid = this.game.playerClanId;
        
        // ★修正：反乱（蜂起）された側は援軍を呼べるように、「this.state.attacker.isKunishu」の条件を消しました！
        if (defClanId === 0 || defCastle.isKunishu || this.state.isKunishuSubjugation) {
            onComplete();
            return;
        }

        // 目的地の大雪もAI受諾確率へ渡します。ここで一律中止せず、
        // 「支配による強制参加」なども含めてDiplomacyManagerの共通判定に任せます。
        const defProv = this.game.provinces.find(p => p.id === defCastle.provinceId);
        const isDefHeavySnow = !!(defProv && defProv.statusEffects && defProv.statusEffects.includes('heavySnow'));

        // ★修正：共通の魔法を使って、繋がっている領土をサクッと取得します！
        const connectedCastles = defCastle.getConnectedCastles(this.game);

        // ★修正：条件のチェックをすべて「外交の専門部署」に任せます！
        // （上で作った connectedCastles をそのまま専門部署に渡します）
        const allyForceCandidates = this.game.diplomacyManager.findAvailableReinforcements(
            false, true, defCastle.id, defCastle, defClanId, atkClanId, connectedCastles
        );

        if (allyForceCandidates.length === 0) {
            console.log("条件に合う他勢力の援軍候補がありませんでした。");
            onComplete();
            return;
        }

        const allyCastles = [...new Set(allyForceCandidates.map(fc => fc.castle))];

        if (defClanId === pid && !defCastle.isDelegated) {
            this.game.ui.hideAIGuardTemporarily(); 
            
            this.game.ui.showDialog("他勢力に援軍を要請しますか？", true, 
                () => {
                    this.game.ui.hideAIGuardTemporarily(); 
                    this.game.ui.showDefReinforcementSelector(allyCastles, defCastle, onComplete);
                },
                () => {
                    this.game.ui.hideAIGuardTemporarily();
                    onComplete(); 
                },
                { okText: '要請する', cancelText: '要請しない' }
            );
        } else {
            // ★追加：戦力比較用の合計兵力を計算しておきます（確率計算で必要になります）
            let defTotalSoldiers = defCastle.soldiers;
            if (this.state.defSelfReinforcement) defTotalSoldiers += this.state.defSelfReinforcement.soldiers;
            
            let atkTotalSoldiers = this.state.attacker.soldiers;
            if (this.state.reinforcement) atkTotalSoldiers += this.state.reinforcement.soldiers;
            if (this.state.selfReinforcement) atkTotalSoldiers += this.state.selfReinforcement.soldiers;

            // ★既存の「見誤り」ロジックを使用して、評価者の智謀による誤差を計算します
            let evaluatorInt = 50;
            const castellan = this.game.getBusho(defCastle.castellanId);
            if (castellan) evaluatorInt = castellan.intelligence;
            
            let maxError = 0;
            if (evaluatorInt >= 95) {
                maxError = 0.01;
            } else if (evaluatorInt >= 50) {
                maxError = 0.15 - ((evaluatorInt - 50) * (0.14 / 45));
            } else if (evaluatorInt > 5) {
                maxError = 0.60 - ((evaluatorInt - 5) * 0.01);
            } else {
                maxError = 0.60;
            }

            const myPower = this.game.getClanTotalSoldiers(defClanId) || 1;

            // 候補となるお城の点数（スコア）をひとつずつ計算していきます
            allyForceCandidates.forEach(candidate => {
                let realProb = 0; // 本当の成功確率
                let reinfGold = 0;
                
                const candidateProv = this.game.provinces.find(p => p.id === candidate.castle.provinceId);
                const candidateHeavySnow = isDefHeavySnow || !!(candidateProv && candidateProv.statusEffects && candidateProv.statusEffects.includes('heavySnow'));

                if (candidate.force.isKunishu) {
                    const info = this.game.diplomacyManager.getAIReinforcementAcceptanceInfo({
                        requesterClanId: defClanId,
                        helperForceId: candidate.force.id,
                        enemyClanId: atkClanId,
                        gold: 0,
                        isKunishu: true,
                        requesterTotalSoldiers: defTotalSoldiers,
                        enemyTotalSoldiers: atkTotalSoldiers,
                        helperCastleId: candidate.castle.id,
                        isHeavySnow: candidateHeavySnow
                    });
                    realProb = info.probability;
                } else {
                    // 大名家の場合、持参金を計算してから確率を出します
                    const helperClanId = candidate.force.id;
                    const helperPower = this.game.getClanTotalSoldiers(helperClanId) || 1;
                    const ratio = helperPower / Math.max(1, myPower);
                    
                    reinfGold = 300;
                    if (ratio >= 3.0) reinfGold = 1000;
                    else if (ratio > 1.5) reinfGold = 300 + ((ratio - 1.5) / 1.5) * 700;
                    reinfGold = Math.floor(reinfGold / 100) * 100;
                    if (reinfGold > defCastle.gold) reinfGold = defCastle.gold;
                    
                    const rel = this.game.getRelation(defClanId, helperClanId);
                    if (rel && rel.status === '支配') reinfGold = 0;

                    const info = this.game.diplomacyManager.getAIReinforcementAcceptanceInfo({
                        requesterClanId: defClanId,
                        helperForceId: helperClanId,
                        enemyClanId: atkClanId,
                        gold: reinfGold,
                        isKunishu: false,
                        requesterTotalSoldiers: defTotalSoldiers,
                        enemyTotalSoldiers: atkTotalSoldiers,
                        helperCastleId: candidate.castle.id,
                        isHeavySnow: candidateHeavySnow
                    });
                    realProb = info.probability;
                }
                
                // ★智謀による見誤り（ブレ）を適用
                const probError = (Math.random() * 2 - 1.0) * (maxError * 100);
                const perceivedProb = Math.max(0, Math.min(100, realProb + probError));
                
                const forceError = 1.0 + (Math.random() * 2 - 1.0) * maxError;
                const perceivedSoldiers = candidate.force.soldiers * forceError;
                
                // ★期待値（スコア） = 見誤った兵数 × (見誤った確率 / 100)
                candidate.score = perceivedSoldiers * (perceivedProb / 100);
                candidate.expectedGold = reinfGold; // 実行時に使用する金額を保持
            });

            // ★追加：スコアが高い順に並べ替えて、一番高いところを選びます
            allyForceCandidates.sort((a,b) => b.score - a.score);
            const best = allyForceCandidates[0];
            best.castle.selectedForce = best.force; // シールを貼る
            console.log(`他勢力の援軍を呼ぶ勢力（お城）を選びました: ${best.castle.name} の ${best.force.name} (スコア: ${Math.floor(best.score)})`);

            let finalGold = 0;
            if (!best.force.isKunishu) {
                finalGold = best.expectedGold || 0;
            }

            this.executeDefReinforcement(finalGold, best.castle, defCastle, onComplete);
        }
    },
    
    executeDefSelfReinforcementAuto(helperCastle, defCastle, onComplete) {
        const selfReinfData = this.game.reinforcementService.createAutoSelfReinforcement(helperCastle, {
            isAttacker: false,
            isSelf: true
        });
        onComplete(selfReinfData);
    },

    executeDefReinforcement(gold, helperCastle, defCastle, onComplete) {
        if (gold > 0) defCastle.gold -= gold;

        const force = helperCastle.selectedForce;
        const myClanId = defCastle.ownerClan;
        
        // ★大雪判定
        const srcProv = this.game.provinces.find(p => p.id === helperCastle.provinceId);
        const tgtProv = this.game.provinces.find(p => p.id === defCastle.provinceId);
        const isHeavySnow = (srcProv && srcProv.statusEffects && srcProv.statusEffects.includes('heavySnow')) || 
                            (tgtProv && tgtProv.statusEffects && tgtProv.statusEffects.includes('heavySnow'));

        // 戦力比較用の合計兵力。攻撃側・守備側のAI受諾判定で同じ値を使います。
        let defTotalSoldiers = defCastle.soldiers;
        if (this.state.defSelfReinforcement) defTotalSoldiers += this.state.defSelfReinforcement.soldiers;
        let atkTotalSoldiers = this.state.attacker ? this.state.attacker.soldiers : 0;
        if (this.state.reinforcement) atkTotalSoldiers += this.state.reinforcement.soldiers;
        if (this.state.selfReinforcement) atkTotalSoldiers += this.state.selfReinforcement.soldiers;

        const atkForceForRequest = this.state.attacker;
        const atkClanIdForRequest = atkForceForRequest && atkForceForRequest.isKunishu ? 0 : (atkForceForRequest ? atkForceForRequest.ownerClan : 0);

        // ★諸勢力の場合
        if (force && force.isKunishu) {
            const kunishu = this.game.kunishuSystem.getKunishu(force.id);
            const currentRel = kunishu.getRelation(myClanId);
            const decision = this.game.diplomacyManager.checkAIReinforcementAcceptance({
                requesterClanId: myClanId,
                helperForceId: force.id,
                enemyClanId: atkClanIdForRequest,
                gold,
                isKunishu: true,
                requesterTotalSoldiers: defTotalSoldiers,
                enemyTotalSoldiers: atkTotalSoldiers,
                helperCastleId: helperCastle.id,
                isHeavySnow
            });

            if (!decision.accepted) {
                if (myClanId === this.game.playerClanId) {
                    const leader = this.game.getBusho(kunishu.leaderId);
                    const leaderName = leader ? leader.name : "頭領";
                    const nameStr = `${kunishu.getName(this.game)}の${leaderName}`;
                    this.game.warManager.reinfMsgHelper.showRefusal(this.game, nameStr, decision.blockedByHeavySnow, onComplete);
                } else {
                    onComplete();
                }
                return;
            }
            
            // 借りを作ったので友好度が少し下がります
            kunishu.setRelation(myClanId, currentRel - 10);
            
            this.state.defReinforcement = this.game.reinforcementService.createAutoKunishuReinforcement(
                kunishu,
                helperCastle,
                currentRel,
                { isSelf: false, isKunishuForce: true }
            );
            
            if (myClanId === this.game.playerClanId) {
                const leader = this.game.getBusho(kunishu.leaderId);
                const leaderName = leader ? leader.name : "頭領";
                const nameStr = `${kunishu.getName(this.game)}の${leaderName}`;
                
                // ★Round17：この時点で参戦通知を出すため、後段の共通参戦通知では二重表示しません。
                if (this.state.defReinforcement) this.state.defReinforcement._joinNoticeShown = true;
                this.game.warManager.reinfMsgHelper.showAcceptance(this.game, nameStr, true, defCastle.isDelegated, false, onComplete, false);
            } else {
                onComplete();
            }
            return;
        }

        // 大名家の場合
        const helperClanId = helperCastle.ownerClan;
        const myToHelperRel = this.game.getRelation(myClanId, helperClanId);
        
        if (helperClanId === this.game.playerClanId) {
            const myClanName = this.game.clans.find(c => c.id === myClanId)?.name || "不明";
            
            let targetInfoStr = "";
            const provData = this.game.provinces.find(p => p.id === defCastle.provinceId);
            const provName = provData ? provData.province : "不明な国";

            if (defCastle.isKunishu) {
                const kunishu = this.game.kunishuSystem.getKunishu(defCastle.kunishuId);
                const kName = kunishu ? kunishu.getName(this.game) : "諸勢力";
                targetInfoStr = `${provName}の${kName}を防衛するため、\n`;
            } else if (defCastle.ownerClan === 0) {
                targetInfoStr = `${provName}の${defCastle.name}を防衛するため、\n`;
            } else {
                targetInfoStr = `${defCastle.name}を防衛するため、\n`;
            }

            const isBoss = (myToHelperRel && myToHelperRel.status === '支配');
            const startSelection = () => this._promptPlayerDefReinforcement(helperCastle, defCastle, myToHelperRel, onComplete, isBoss);
            
            this.game.warManager.reinfMsgHelper.showRequest(this.game, myClanName, targetInfoStr, gold, isBoss, false, startSelection, () => {
                this.game.diplomacyManager.updateSentiment(myClanId, helperClanId, -10);
                this.game.ui.showDialog(`援軍要請を断りました。`, false, onComplete);
            }, this.state.sourceCastle, this.state.atkBushos, defCastle, helperCastle);
            return;
        }

        const decision = this.game.diplomacyManager.checkAIReinforcementAcceptance({
            requesterClanId: myClanId,
            helperForceId: helperClanId,
            enemyClanId: atkClanIdForRequest,
            gold,
            isKunishu: false,
            requesterTotalSoldiers: defTotalSoldiers,
            enemyTotalSoldiers: atkTotalSoldiers,
            helperCastleId: helperCastle.id,
            isHeavySnow
        });

        if (!decision.accepted) {
            if (myClanId === this.game.playerClanId) {
                const castellan = this.game.getBusho(helperCastle.castellanId);
                const castellanName = castellan ? castellan.name : "城主";
                const nameStr = `${helperCastle.name}の${castellanName}`;
                this.game.warManager.reinfMsgHelper.showRefusal(this.game, nameStr, decision.blockedByHeavySnow, onComplete);
            } else {
                onComplete();
            }
            return;
        }

        if (!myToHelperRel || !window.DiplomacyRules.isAllianceOrVassal(myToHelperRel.status)) this.game.diplomacyManager.updateSentiment(myClanId, helperClanId, -10);

        const helperDaimyo = this.game.getClanDaimyo(helperClanId) || { duty: 50 };
        this.state.defReinforcement = this.game.reinforcementService.createAutoClanReinforcement(
            helperCastle,
            myToHelperRel,
            helperDaimyo,
            { isSelf: false }
        );

        const atkForce = this.state.attacker;
        const atkIsKunishu = atkForce.isKunishu || false;
        const atkId = atkIsKunishu ? atkForce.kunishuId : atkForce.ownerClan;
        const helperIsKunishu = helperCastle.isKunishu || false;
        
        if (this.game.diplomacyManager && !helperIsKunishu && !atkIsKunishu && helperClanId !== 0 && atkId !== 0) {
            this.game.diplomacyManager.updateSentiment(helperClanId, atkId, -7);
        }
        
        if (myClanId === this.game.playerClanId) {
            const castellan = this.game.getBusho(helperCastle.castellanId);
            const castellanName = castellan ? castellan.name : "城主";
            const nameStr = `${helperCastle.name}の${castellanName}`;
            
            // ★Round17：この時点で参戦通知を出すため、後段の共通参戦通知では二重表示しません。
            if (this.state.defReinforcement) this.state.defReinforcement._joinNoticeShown = true;
            this.game.warManager.reinfMsgHelper.showAcceptance(this.game, nameStr, false, defCastle.isDelegated, false, onComplete, false);
        } else {
            onComplete();
        }
    },

    _promptPlayerDefReinforcement(helperCastle, defCastle, myToHelperRel, onComplete, isBoss) {
        let hideCancel = isBoss;
        // ★追加: スキルを持っていればキャンセルボタン（×ボタン）を隠さないようにします
        if (isBoss && typeof SkillManager !== 'undefined') {
            if (SkillManager.canDeclineBossReinforcement(this.game.playerClanId, this.game)) {
                hideCancel = false;
            }
        }
        const promptBusho = () => {
            this.game.ui.openBushoSelector('def_reinf_deploy', helperCastle.id, {
                hideCancel: hideCancel,
                onConfirm: (selectedBushoIds) => promptQuantity(selectedBushoIds.map(id => this.game.getBusho(id))),
                onCancel: () => this.game.ui.showDialog("援軍の派遣を取りやめました。", false, onComplete)
            });
        };
        const promptQuantity = (reinfBushos) => {
            this.game.ui.openQuantitySelector('def_reinf_supplies', [helperCastle], null, {
                onConfirm: (inputs) => {
                    const i = inputs[helperCastle.id] || inputs;
                    const rS = i.soldiers ? parseInt(i.soldiers.num.value) : 500;
                    const rR = i.rice ? parseInt(i.rice.num.value) : 500;
                    const rH = i.horses ? parseInt(i.horses.num.value) : 0;
                    const rG = i.guns ? parseInt(i.guns.num.value) : 0;
                    this._applyManualDefReinforcement(helperCastle, defCastle, myToHelperRel, reinfBushos, rS, rR, rH, rG, onComplete);
                },
                onCancel: promptBusho
            });
        };
        promptBusho();
    },
    
    _applyManualDefReinforcement(helperCastle, defCastle, myToHelperRel, reinfBushos, reinfSoldiers, reinfRice, reinfHorses, reinfGuns, onComplete) {
        const helperClanId = helperCastle.ownerClan;

        // ★追加：プレイヤーが参戦することになったので、透明化の魔法を解除して文字が見えるようにします！
        this.game.ui.restoreAIGuardText(true);

        helperCastle.soldiers = Math.max(0, helperCastle.soldiers - reinfSoldiers);
        helperCastle.rice = Math.max(0, helperCastle.rice - reinfRice);
        helperCastle.horses = Math.max(0, (helperCastle.horses || 0) - reinfHorses);
        helperCastle.guns = Math.max(0, (helperCastle.guns || 0) - reinfGuns);

        this.state.defReinforcement = {
            castle: helperCastle, bushos: reinfBushos, soldiers: reinfSoldiers,
            rice: reinfRice, horses: reinfHorses, guns: reinfGuns, isSelf: false,
            morale: helperCastle.morale || 50, training: helperCastle.training || 50
        };
        
        const atkForce = this.state.attacker;
        const atkIsKunishu = atkForce.isKunishu || false;
        const atkId = atkIsKunishu ? atkForce.kunishuId : atkForce.ownerClan;
        const helperIsKunishu = helperCastle.isKunishu || false;
        // ★修正：守備の援軍と攻撃側の関係悪化処理
        if (this.game.diplomacyManager && !helperIsKunishu && !atkIsKunishu && helperClanId !== 0 && atkId !== 0) {
            // 援軍に入った時は「敵対」にせず、友好度を7下げるだけにします！
            this.game.diplomacyManager.updateSentiment(helperClanId, atkId, -7);
        }
        
        this.state.isPlayerInvolved = true;
        const helperClanName = this.game.clans.find(c => c.id === helperClanId)?.name || "援軍";
        const leaderName = reinfBushos.length > 0 ? reinfBushos[0].name : "総大将";
        this.game.ui.showDialog(`${helperClanName}の${leaderName} (${helperCastle.name}) が守備側の援軍として出発しました！`, false, onComplete);
    },

    // ★追加：処断した時に、その武将の元の同僚たちの宿敵リストに大名を登録する魔法
    registerNemesisForExecuted(executedBusho, killerClanId) {
        if (!executedBusho || killerClanId === 0 || executedBusho.clan === 0) return;
        
        // 斬った側の大名武将を探す
        const killerDaimyo = this.game.getClanDaimyo(killerClanId);
        if (!killerDaimyo) return;
        const killerId = killerDaimyo.id;

        const victimClanId = executedBusho.clan;
        
        // 斬られた武将の元の同僚（同じ大名家に所属する武将）全員をチェック
        this.game.bushos.forEach(b => {
            if (b.clan === victimClanId && window.BushoStatusRules.isActive(b) && b.id !== executedBusho.id) {
                if (!b.nemesisList) b.nemesisList = [];
                
                // 既に宿敵リストにいるか確認
                const existing = b.nemesisList.find(n => n.id === killerId);
                if (existing) {
                    existing.count = 60; // 既にいる場合はタイマーを60にリセット
                } else {
                    b.nemesisList.push({ id: killerId, count: 60 }); // 新規追加
                }
                
                // 後方互換と参照用のIDリストも更新
                b.nemesisIds = b.nemesisList.map(n => n.id);
            }
        });
    },

    // ★追加：捕虜登用の成功確率を計算する共通の魔法
    calcPrisonerHireProb(recruiter, prisoner, targetClanId, isExtinct, daimyoHiredBonus = 0) {
        let baseProb = ((recruiter.charm || 50) * 1.5) / ((prisoner.loyalty || 50) * 3) - (isExtinct ? 0 : 0.4);
        let randomBonus = (Math.random() * 0.2) - 0.1;
        const recruiterAffinity = recruiter.affinity || 0;
        const prisonerAffinity = prisoner.affinity || 0;
        const affinityDiff = Math.abs(recruiterAffinity - prisonerAffinity);
        
        let affinityBonus = 0;
        if (affinityDiff <= 10) affinityBonus = 0.1;
        else if (affinityDiff >= 50) affinityBonus = -0.3;
        else affinityBonus = 0.1 - (affinityDiff - 10) * 0.01;
        
        let hireProb = baseProb + randomBonus + affinityBonus;
        hireProb = Math.max(0, Math.min(0.99, hireProb));
        
        if (prisoner.isDaimyo) {
            hireProb *= 0.5; // 大名は登用しにくくします
        } else if (daimyoHiredBonus > 0) {
            hireProb += daimyoHiredBonus;
            hireProb = Math.max(0, Math.min(0.99, hireProb));
        }

        // 一門の武将が自勢力にいる場合は成功率+0.2
        const hasFamily = this.game.bushos.some(b => b.clan === targetClanId && !window.LifeStatusRules.isDead(b) && b.id !== prisoner.id && b.familyIds && prisoner.familyIds && b.familyIds.some(fId => prisoner.familyIds.includes(fId)));
        if (hasFamily) {
            hireProb += 0.2;
            hireProb = Math.max(0, Math.min(0.99, hireProb));
        }

        // 宿敵が登用先の大名家にいる場合は成功率を半分にします
        if (prisoner.nemesisIds && prisoner.nemesisIds.length > 0) {
            const hasNemesis = prisoner.nemesisIds.some(nId => {
                const nBusho = this.game.getBusho(nId);
                return nBusho && nBusho.clan === targetClanId && !window.LifeStatusRules.isDead(nBusho);
            });
            if (hasNemesis) {
                hireProb *= 0.5;
            }
        }
        
        return hireProb;
    },
    
    // ==========================================
    // ★ここから追加：総取りシステムの魔法！
    // ==========================================
    
    // これから総取りが発生するかどうかを事前確認する魔法
    isTotalTakeoverPending() {
        const s = this.state;
        if (!s || !s.isDaimyoCastleFallen) return false; 

        const atkClanId = s.attacker.ownerClan;
        const defClanId = s.oldDefClanId;
        
        if (atkClanId === 0 || defClanId === 0) return false;

        const defCastles = this.game.castles.filter(c => c.ownerClan === defClanId);
        if (defCastles.length === 0) return false; 

        const atkClan = this.game.clans.find(c => c.id === atkClanId);
        const defClan = this.game.clans.find(c => c.id === defClanId);
        
        if (!atkClan || !defClan) return false;
        
        const atkPrestige = atkClan.daimyoPrestige || 0;
        const defPrestige = defClan.daimyoPrestige || 0;
        
        return atkPrestige >= defPrestige * 3;
    },

    async checkTotalTakeover(s) {
        // ★修正：総取り条件を満たすか、共通の魔法で確認します！
        if (!this.isTotalTakeoverPending()) return;

        const atkClanId = s.attacker.ownerClan;
        const defClanId = s.oldDefClanId;
        const defCastles = this.game.castles.filter(c => c.ownerClan === defClanId);
        
        // 条件をクリアしたので、総取りシステムを発動します！
        s.isTotalTakeoverExecuted = true; // ★追加：総取りが発動した目印をセットします
        await this.executeTotalTakeover(atkClanId, defClanId, defCastles);
    },

    async executeTotalTakeover(atkClanId, defClanId, defCastles) {
        const atkClan = this.game.clans.find(c => c.id === atkClanId);
        const defClan = this.game.clans.find(c => c.id === defClanId);
        
        const msg = `${defClan.name}の居城が陥落しました。`;
        this.game.ui.log(msg.replace(/\n/g, ''));
        
        // プレイヤーが関わっていなくても、大きなイベントなのでダイアログでお知らせします
        if (this.canShowNotify(this.state.isPlayerFactionInvolved, this.state.isPlayerInvolved)) {
            await this.game.ui.showDialogAsync(msg);
        }

        const defBushos = this.game.bushos.filter(b => b.clan === defClanId && window.BushoStatusRules.isActive(b));
        const oldDaimyo = defBushos.find(b => b.isDaimyo) || defBushos[0];

        // 1. 落とされた側の全武将の忠誠度を30下げます（大名以外）
        defBushos.forEach(b => {
            if (b.id !== oldDaimyo.id) {
                b.loyalty = Math.max(0, b.loyalty - 30);
            }
        });
        
        const indepSys = this.game.independenceSystem || new IndependenceSystem(this.game);
        
        const I = window.WarParams.Independence;
        const thresholdBase = I.ThresholdBase;
        const dutyDiv = I.ThresholdDutyDiv;
        const ambDiv = I.ThresholdAmbitionDiv;
        const probLoyalty = I.ProbLoyaltyFactor;
        const probAffinity = I.ProbAffinityFactor;
        
        // ★追加：各城の判定順序を「派閥主 ＞ 国主 ＞ 功績」の順に並び替えます！
        defCastles.sort((castleA, castleB) => {
            const bushoA = this.game.getBusho(castleA.castellanId);
            const bushoB = this.game.getBusho(castleB.castellanId);

            // 城主がいない、または大名自身の場合は判定から外れるので一番後ろに送ります
            const isValidA = bushoA && !bushoA.isDaimyo ? 1 : 0;
            const isValidB = bushoB && !bushoB.isDaimyo ? 1 : 0;
            if (isValidA !== isValidB) return isValidB - isValidA;
            if (isValidA === 0) return 0; // どちらも無効ならそのまま

            // 1. 派閥主を優先
            const aIsFactionLeader = bushoA.isFactionLeader ? 1 : 0;
            const bIsFactionLeader = bushoB.isFactionLeader ? 1 : 0;
            if (aIsFactionLeader !== bIsFactionLeader) {
                return bIsFactionLeader - aIsFactionLeader;
            }

            // 2. 国主を優先
            const aIsCommander = bushoA.isCommander ? 1 : 0;
            const bIsCommander = bushoB.isCommander ? 1 : 0;
            if (aIsCommander !== bIsCommander) {
                return bIsCommander - aIsCommander;
            }

            // 3. 功績が高い順
            const achieveA = bushoA.achievementTotal || 0;
            const achieveB = bushoB.achievementTotal || 0;
            return achieveB - achieveA;
        });

        // 2. 先に各城の城主たちの独立・寝返り判定を行います
        for (const castle of defCastles) {
            // ★追加：連鎖寝返りなどで、すでにこのお城の持ち主が変わっていたらスキップします！
            if (castle.ownerClan !== defClanId) continue;

            if (castle.castellanId === 0) continue; 
            const castellan = this.game.getBusho(castle.castellanId);
            
            // ★大名はまだ大名のままなので、ここで確実にスキップされて巻き込まれません！
            if (!castellan || castellan.isDaimyo) continue;
            
            // 独立の確率計算
            const threshold = thresholdBase + ((50 - castellan.duty) / dutyDiv) + ((castellan.ambition - 50) / ambDiv);
            let isIndependent = false;
            
            // 忠誠度が下がった状態での独立判定を行います
            if (castellan.loyalty <= threshold) {
                const daimyoBonus = indepSys.calcDaimyoPowerBonus(oldDaimyo);
                const affinityDiff = PersonnelRules.calcAffinityDiff(castellan.affinity, oldDaimyo.affinity);
                
                let prob = ((threshold - castellan.loyalty) * probLoyalty) + (affinityDiff * probAffinity) - (daimyoBonus * 2);
                
                const isFamily = castellan.familyIds.some(id => oldDaimyo.familyIds.includes(id));
                if (isFamily) {
                    prob = prob * 0.7; // 一門は少し独立しにくい
                }

                // 総取りの時だけ独立の確率を10倍にします
                prob = prob * 10;
                
                // サイコロを振って成功したら独立！
                if (prob > 0 && Math.random() * 1000 < prob) {
                    isIndependent = true;
                    // 独立イベントの実行（indep を強制します）
                    await indepSys.planCoupDetatOrRebellion(castle, castellan, oldDaimyo, 'indep');
                }
            }
            
            // 独立しなかった場合は、強制的に「落とした側の大名（atkClanId）」へ寝返ります！
            if (!isIndependent) {
                await indepSys.executeRebellion(castle, castellan, oldDaimyo, 'defect', atkClanId);
            }
        }
        
        // ★追加：独立・寝返り判定の後、滅亡処理の前に、残った拠点もすべて攻撃側の所有にします！
        for (const castle of defCastles) {
            if (castle.ownerClan === defClanId) {
                this.game.castleManager.changeOwner(castle, atkClanId, false, 0);
                castle.castellanId = 0; // 強制接収した城の城主は不在にします
                // 城主情報を更新
                if (this.game.affiliationSystem && typeof this.game.affiliationSystem.updateCastleLord === 'function') {
                    this.game.affiliationSystem.updateCastleLord(castle);
                } else if (typeof this.game.updateCastleLord === 'function') {
                    this.game.updateCastleLord(castle);
                }
            }
        }

        // ==========================================
        // ★追加：城の持ち主が一気に変わったので、地図の色を更新します！
        if (this.game.ui && typeof this.game.ui.updateClanColors === 'function') {
            const shouldPaintTotalTakeoverNow = !this.game.isProcessingAI || this.game.isWatchMode || this.state.isPlayerInvolved || this.canShowNotify(this.state.isPlayerFactionInvolved, this.state.isPlayerInvolved);
            if (shouldPaintTotalTakeoverNow) {
                if (typeof this.game.writeSystemDiagnostic === 'function') this.game.writeSystemDiagnostic('war:total_takeover_color:start');
                this.game.ui.updateClanColors();
                if (typeof this.game.writeSystemDiagnostic === 'function') this.game.writeSystemDiagnostic('war:total_takeover_color:done');
            } else {
                this.game._aiDeferredMapRefresh = true;
                if (typeof this.game.writeSystemDiagnostic === 'function') this.game.writeSystemDiagnostic('war:total_takeover_color:deferred');
            }
        }
        // ==========================================

        // 3. ★変更：すべての処理が終わった一番最後に、大名を裏で浪人にします！
        // (ダイアログやログは直後の滅亡判定システムに任せるため無言で行います)
        if (oldDaimyo && !window.LifeStatusRules.isDead(oldDaimyo)) {
            // 大名バッジを外して、お引越しセンターに頼んで確実に浪人にします
            oldDaimyo.isDaimyo = false;
            this.game.affiliationSystem.becomeRonin(oldDaimyo);
        }
    }
});