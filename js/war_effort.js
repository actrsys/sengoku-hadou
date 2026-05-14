/**
 * war_effort.js
 * 戦争の準備（戦前）と、戦後処理・捕虜の処遇などを担当するファイルです
 * Object.assignではそれぞれのメソッドの間に必ずカンマが必要です
 */
 
// Object.assign を使って、WarManager に魔法をくっつけます！
Object.assign(WarManager.prototype, {

    // ★追加：大名が他軍団の城に逃げ込んだ時に、元の軍団を解散させる共通の魔法です！
    handleDaimyoEscape(busho, targetCastle) {
        if (busho.isDaimyo && targetCastle.legionId !== 0) {
            if (this.game.castleManager && this.game.castleManager.disbandLegion) {
                this.game.castleManager.disbandLegion(targetCastle.legionId);
            }
            targetCastle.legionId = 0;
            targetCastle.isDelegated = false;
        }
    },

    // ★追加：落城時などに逃げ込む「味方の城」の候補を探し出す魔法
    getEscapeCandidates(defCastle) {
        const oldOwner = defCastle.ownerClan;
        
        // ★追加：持ち主が0（中立）のお城の場合は、そもそも味方はいないので探しに行きません！
        if (oldOwner === 0) return [];
        
        const oldLegionId = defCastle.legionId || 0;
        const allFriendlyCastles = this.game.castles.filter(c => c.ownerClan === oldOwner && c.id !== defCastle.id);
        
        if (allFriendlyCastles.length === 0) return [];
        
        const hasDaimyo = this.game.getCastleBushos(defCastle.id).some(b => b.isDaimyo);
        
        // 1. まずは同じ軍団IDの城を探す
        let candidates = allFriendlyCastles.filter(c => (c.legionId || 0) === oldLegionId);
        
        // 2. なければ直轄（ID0）の城を探す
        if (candidates.length === 0) {
            candidates = allFriendlyCastles.filter(c => (c.legionId || 0) === 0);
        }
        
        // 3. 大名がいて、直轄領もない場合、他軍団の城へ
        if (candidates.length === 0 && hasDaimyo) {
            // 国主がいない城を優先する
            const withoutCommander = allFriendlyCastles.filter(c => {
                const legion = this.game.legions ? this.game.legions.find(l => l.id === c.legionId) : null;
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
        const reachable = candidates.filter(c => GameSystem.isReachable(this.game, defCastle, c, oldOwner));
        if (reachable.length > 0) {
            return reachable;
        }
        
        // 繋がっていなくても、最終的には必ずどこかの自領に逃げるようにする
        return candidates;
    },

    // ★追加：援軍のメッセージを一元管理する専門の窓口（係）です！
    reinfMsgHelper: {
        // 1. プレイヤーに援軍の要請が来た時のメッセージ
        showRequest: (game, myClanName, targetInfoStr, gold, isBoss, isAttack, onAccept, onDecline) => {
            const typeStr = isAttack ? "攻撃の" : "守備側の";
            if (isBoss) {
                const bossMsg = isAttack 
                    ? `主家である ${myClanName} が\n${targetInfoStr}侵攻します。\n当家は従属しているため直ちに出陣します！`
                    : `主家である ${myClanName} から${typeStr}援軍要請が届きました。\n当家は従属しているため直ちに出陣します！`;
                game.ui.showDialog(bossMsg, false, onAccept);
            } else {
                game.ui.showDialog(`${myClanName} から\n${targetInfoStr}${typeStr}援軍要請が届きました。(持参金: ${gold})\n援軍を派遣しますか？`, true, onAccept, onDecline);
            }
        },
        
        // 2. 相手が援軍を断ってきた時のメッセージ
        showRefusal: (game, nameStr, isHeavySnow, onComplete) => {
            const reasonMsg = isHeavySnow ? "大雪のため、" : "";
            game.ui.showDialog(`${reasonMsg}${nameStr}は援軍を拒否しました……`, false, onComplete);
        },
        
        // 3. 相手が援軍を承諾してくれた時のメッセージ
        showAcceptance: (game, nameStr, isKunishu, isDelegated, isEnemy, onComplete, isPlayerRequest = true) => {
            const skipAnim = window.GameConfig && window.GameConfig.aiWarNotify === false;
            
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
            if (!GameSystem.isReachable(this.game, currentCastle, target, myClanId)) return false;
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
    
    // ★修正: AIが鉄砲・騎馬を「強さ順」に賢く配分し、余った兵士を足軽で均等に分けるロジックを追加
    autoDivideSoldiers(bushos, totalSoldiers, totalHorses = 0, totalGuns = 0) {
        if (!bushos || bushos.length === 0) return [];
        if (bushos.length === 1) return [{ busho: bushos[0], soldiers: totalSoldiers, troopType: 'ashigaru' }];
        
        const N = bushos.length;
        // 総大将は他部隊の1.3倍の兵力にする
        const ratioSum = 1.3 + (N - 1) * 1.0;
        const baseAmount = Math.floor(totalSoldiers / ratioSum);
        
        // 1. まずは全員「足軽」として、必要な兵数（req）の目標を決めます
        let assignments = bushos.map((b, i) => {
            let req = (i === 0) ? Math.floor(baseAmount * 1.3) : baseAmount;
            return { 
                index: i,             // 元の順番を覚えておくための番号札
                busho: b, 
                req: req, 
                soldiers: req,        // とりあえず目標人数をセット
                troopType: 'ashigaru',
                score: b.leadership + b.strength // ★強さ（統率＋武勇）の合計点！
            };
        });

        // 割り切れない余り兵士を総大将に足す
        let totalReq = assignments.reduce((sum, a) => sum + a.req, 0);
        assignments[0].req += (totalSoldiers - totalReq);
        assignments[0].soldiers = assignments[0].req;

        let availableHorses = totalHorses;
        let availableGuns = totalGuns;
        let poolSoldiers = 0; // 余った兵士を貯めるプール
        
        const maxTeppoCount = Math.floor(N / 2);
        let teppoCount = 0;

        // ★追加: 順番待ちの列を「合計点（強さ）が高い順」に並び替えます！
        let sortedAssigns = [...assignments].sort((a, b) => b.score - a.score);

        // 万が一、全員が騎馬か鉄砲になってしまった時に、「最後に変身した人」を覚えておく箱です
        let lastChangedAssign = null;

        // 2. 強い人から順番に、軍馬や鉄砲を配っていきます
        for (let a of sortedAssigns) {
            let isGeneral = (a.index === 0);
            let req = a.req;
            
            // ★追加: 総大将は100%揃わないとダメ。他の人は50%でOKというルール
            let threshold = isGeneral ? req : req * 0.5;

            // 騎馬の判定
            if (availableHorses >= threshold) {
                a.troopType = 'kiba';
                let assignCount = Math.min(req, availableHorses);
                a.soldiers = assignCount;
                availableHorses -= assignCount;
                poolSoldiers += (req - assignCount); // 減らした分の兵士はプールへ
                lastChangedAssign = a;               // 最後に変身した人を記憶
            } 
            // 鉄砲の判定
            else if (availableGuns >= threshold && teppoCount < maxTeppoCount) {
                a.troopType = 'teppo';
                let assignCount = Math.min(req, availableGuns);
                a.soldiers = assignCount;
                availableGuns -= assignCount;
                poolSoldiers += (req - assignCount);
                teppoCount++;
                lastChangedAssign = a;               // 最後に変身した人を記憶
            }
        }

        // 3. 今「足軽」のままの部隊をピックアップします
        let ashigaruAssigns = assignments.filter(a => a.troopType === 'ashigaru');

        // ★修正: 余った兵士がいるのに、足軽が「ゼロ」になってしまった時だけ特別ルール発動！
        if (poolSoldiers > 0 && ashigaruAssigns.length === 0 && lastChangedAssign) {
            // 最後に変身した人に「ごめん、足軽に戻って！」とお願いします
            lastChangedAssign.troopType = 'ashigaru';
            // 足軽に戻るので、プールに貯めていた「減らした分の兵士」を元に戻して帳尻を合わせます
            poolSoldiers -= (lastChangedAssign.req - lastChangedAssign.soldiers);
            lastChangedAssign.soldiers = lastChangedAssign.req;
            // この人を足軽グループに入れます
            ashigaruAssigns.push(lastChangedAssign);
        }

        // ★追加: 余った兵士（プール）を、足軽みんなで「均等に」分け合います
        if (poolSoldiers > 0 && ashigaruAssigns.length > 0) {
            let share = Math.floor(poolSoldiers / ashigaruAssigns.length); // 1人あたりの配分
            let remainder = poolSoldiers % ashigaruAssigns.length;         // 割り切れなかった余り
            
            ashigaruAssigns.forEach((a, i) => {
                a.soldiers += share;
                // 割り切れなかった分は、先頭の人から順番に1人ずつ足していきます
                if (i < remainder) {
                    a.soldiers += 1;
                }
            });
        }

        // 4. 配り終わったら、元の「総大将が一番上」の順番に戻して結果を返します
        return assignments.map(a => ({
            busho: a.busho,
            soldiers: a.soldiers,
            troopType: a.troopType
        }));
    },
    
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
            let atkLeaderIdx = atkBushos.findIndex(b => b.isDaimyo);
            if (atkLeaderIdx === -1) atkLeaderIdx = atkBushos.findIndex(b => b.isCastellan);
            if (atkLeaderIdx > 0) {
                const leader = atkBushos.splice(atkLeaderIdx, 1)[0];
                atkBushos.unshift(leader);
            }
            
            const pid = Number(this.game.playerClanId);
            const atkClan = Number(atkCastle.ownerClan !== undefined ? atkCastle.ownerClan : (atkCastle.isKunishu ? -1 : 0));
            const defClan = Number(defCastle.ownerClan || 0);

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
            const atkDaimyoName = (atkClanData && atkClanData.name) ? atkClanData.name : (atkCastle.isKunishu ? (atkCastle.getName ? atkCastle.getName(this.game) : atkCastle.name) : (atkProvData ? atkProvData.province : "中立"));
            
            const defClanData = this.game.clans.find(c => c.id === defClan);
            const defProvData = this.game.provinces.find(p => p.id === defCastle.provinceId);
            const defDaimyoName = (defClanData && defClanData.name) ? defClanData.name : (defCastle.isKunishu ? defCastle.name : (defProvData ? defProvData.province : "中立"));
            
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
                const skipAnim = window.GameConfig && window.GameConfig.aiWarNotify === false;
                if (!skipAnim) {
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

                    // ★ここから追加：メッセージを閉じた後、戦場となるお城にスクロールして点滅させます！
                    const realDefCastle = this.game.getCastle(defCastle.id);
                    this.game.ui.scrollToActiveCastle(realDefCastle, false);
                    await new Promise(res => setTimeout(res, 600)); // スクロール完了を少し待ちます
                    
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
                }
            } else {
                if (defCastle.isKunishu) {
                    await this.game.ui.showCutin(`${atkArmyName}の${atkBushos[0].name}が\n${defCastle.name}の鎮圧に乗り出しました！`);
                } else {
                    await this.game.ui.showCutin(`${atkArmyName}の${atkBushos[0].name}が\n${defCastle.name}に攻め込みました！`);
                }
            }

            // ★追加：出陣したことで、攻撃側と守備側の国の米相場が上がります！
            const maxTradeRate = window.MainParams.Economy.TradeRateMax || 2.5;
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
                
                const isConfirmed = await new Promise((resolve) => {
                    this.game.ui.showDialog(`${requesterName}殿が${targetInfoStr}${reinfCastleName}に参戦を求めています。\n援軍を送りますか？`, true, 
                        () => resolve(true), 
                        () => resolve(false)
                    );
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
                    if (hC.ownerClan === pid && !hC.isDelegated && !reinfData.isKunishuForce) isPlayerInvolved = true;
                    
                    let reinfType = isSelf ? "応援軍" : "友軍";
                    let leaderName = reinfData.bushos && reinfData.bushos.length > 0 ? reinfData.bushos[0].name : "総大将";
                    let msg = `${hC.name}の${leaderName}が攻撃側の援軍として参戦しました！`;
                    
                    this.game.ui.log(`【${reinfType}】${hC.name}の${leaderName}が攻撃側の援軍として参戦しました。`);
                    
                    const skipAnim = window.GameConfig && window.GameConfig.aiWarNotify === false;
                    if (isPlayerInvolved || !skipAnim) {
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
            if (reinforcementData && this.game.diplomacyManager && !reinforcementData.castle.isKunishu && !defCastle.isKunishu) {
                const helperClan = reinforcementData.castle.ownerClan;
                if (helperClan !== 0 && defClan !== 0) {
                    // ★修正：攻撃の援軍に入った時は「敵対」にせず、友好度を7下げるだけにします！
                    this.game.diplomacyManager.updateSentiment(helperClan, defClan, -7);
                }
            }
            
            this.state = { 
                active: true, round: 1, attacker: attackerForce, sourceCastle: atkCastle, 
                defender: defCastle, atkBushos: atkBushos, defBusho: defBusho, 
                turn: 'attacker', isPlayerInvolved: isPlayerInvolved, deadSoldiers: { attacker: 0, defender: 0 }, defenderGuarding: false,
                reinforcement: reinforcementData, selfReinforcement: selfReinforcementData,
                isKunishuSubjugation: defCastle.isKunishu === true && !atkCastle.isKunishu // 防衛側が諸勢力で、攻撃側が諸勢力(蜂起)でないなら鎮圧戦！
            };

            // ★追加：戦闘準備が整ったこのタイミングで「戦闘前」の歴史イベントをチェックします
            if (this.game.eventManager) {
                // イベントマネージャー（受付）を経由させることでフラグが保存されます
                await this.game.eventManager.processEvents('before_battle', this.state);
            }

            const showInterceptDialog = async (onResult) => {
                const startAllyReinforcement = () => {
                    this.checkDefenderReinforcement(defCastle, atkClan, () => {
                    
                    // ★追加：守備側の援軍に「プレイヤーが操作できる部隊（直轄領）」が含まれている場合は、強制的に手動戦闘（画面表示）にします！
                    if (this.state.defSelfReinforcement && this.state.defSelfReinforcement.castle.ownerClan === pid && !this.state.defSelfReinforcement.castle.isDelegated && !this.state.defSelfReinforcement.isKunishuForce) {
                        this.state.isPlayerInvolved = true;
                    }
                    if (this.state.defReinforcement && this.state.defReinforcement.castle.ownerClan === pid && !this.state.defReinforcement.castle.isDelegated && !this.state.defReinforcement.isKunishuForce) {
                        this.state.isPlayerInvolved = true;
                    }

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
                                            let defLeaderIdx = defBushos.findIndex(b => b.isDaimyo);
                                            if (defLeaderIdx === -1) defLeaderIdx = defBushos.findIndex(b => b.isCastellan);
                                            if (defLeaderIdx > 0) {
                                                const leader = defBushos.splice(defLeaderIdx, 1)[0];
                                                defBushos.unshift(leader);
                                            }
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
                        let availableDefBushos = this.game.getCastleBushos(defCastle.id).filter(b => b.status === 'active' && (defCastle.isKunishu ? b.belongKunishuId === defCastle.kunishuId : (b.clan === defCastle.ownerClan && b.belongKunishuId === 0)));
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

                        // 判定条件
                        let shouldIntercept = false;
                        let reason = "";
                        
                        // ★追加：諸勢力（国衆）の場合は、大名の城と比べて防御力が低いので、判定の基準値を半分（0.5倍）にします！
                        const defenseThresholdRate = defCastle.isKunishu ? 0.5 : 1.0;
                        
                        // ★追加：イベントによる強制迎撃命令がある場合は絶対に従います！
                        if (this.state.forceIntercept) {
                            shouldIntercept = true;
                            reason = "イベントによる強制出陣（野戦）";
                        } else if (isAggressive) {
                            if (perceivedTotalDefSoldiers >= perceivedTotalAtkSoldiers * 1.2) {
                                shouldIntercept = true;
                                reason = "自軍の兵力が敵より十分に多いから（野戦）";
                            } else if (!defCastle.isKunishu && perceivedDefRice < perceivedDefSoldiers * 1.5) {
                                // ★修正：諸勢力は兵糧を無から生み出す設定なので、兵糧不足を理由に野戦には出ません！
                                shouldIntercept = true;
                                reason = "兵糧が足りないから（野戦）";
                            } else if (perceivedDefDefense < 300 * defenseThresholdRate) {
                                // ★修正：諸勢力の場合は基準を半分（150）にして判断します！
                                shouldIntercept = true;
                                reason = "城の防御が低いから（野戦）";
                            } else {
                                reason = "籠城できる条件が揃っているから（籠城）";
                            }
                        } else {
                            if (perceivedTotalDefSoldiers >= perceivedTotalAtkSoldiers * 1.5) {
                                shouldIntercept = true;
                                reason = "自軍の兵力が敵より圧倒的に多いから（野戦）";
                            } else if (!defCastle.isKunishu && perceivedDefRice < perceivedDefSoldiers * 1.2) {
                                // ★修正：諸勢力は兵糧を無から生み出す設定なので、兵糧不足を理由に野戦には出ません！
                                shouldIntercept = true;
                                reason = "兵糧が足りないから（野戦）";
                            } else if (perceivedDefDefense < 400 * defenseThresholdRate) {
                                // ★修正：諸勢力の場合は基準を半分（200）にして判断します！
                                shouldIntercept = true;
                                reason = "城の防御が低いから（野戦）";
                            } else {
                                reason = "籠城できる条件が揃っているから（籠城）";
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
                                
                            let defLeaderIdx = defBushos.findIndex(b => b.isDaimyo);
                            if (defLeaderIdx === -1) defLeaderIdx = defBushos.findIndex(b => b.isCastellan);
                            if (defLeaderIdx > 0) {
                                const leader = defBushos.splice(defLeaderIdx, 1)[0];
                                defBushos.unshift(leader);
                            }
                            
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
                                    if (atkClan === pid && !atkCastle.isDelegated && this.state.reinforcement && this.state.reinforcement.castle.ownerClan === pid && !this.state.reinforcement.isKunishuForce) {
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
                                const skipAnim = window.GameConfig && window.GameConfig.aiWarNotify === false;
                                if (!isPlayerInvolved) {
                                    if (!skipAnim) {
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
                const skipAnim = window.GameConfig && window.GameConfig.aiWarNotify === false;
                if (!isPlayerInvolved) {
                    if (!skipAnim) {
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
                            if (resultType === 'attacker_win' || resultType === 'defender_retreat' || resultType === 'draw_to_siege') {
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
                    if (b.status === 'ronin') return;
                    // ★ 追加: 諸勢力の武将は撤退戦に巻き込まれて捕虜にならないようにします！
                    if (b.belongKunishuId > 0) return;

                    let chance = 0.5 - (b.strength * (window.WarParams.War.CaptureStrFactor || 0.002)) + (Math.random() * 0.3);
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
                    return busho && busho.status === 'ronin';
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
        if (defCastle.ownerClan === this.game.playerClanId) { 
            if (candidates.length === 1) runRetreat(candidates[0].id); else this.game.ui.showRetreatSelector(defCastle, candidates, (id) => runRetreat(id)); 
        } else { candidates.sort((a,b) => WarSystem.calcRetreatScore(b) - WarSystem.calcRetreatScore(a)); runRetreat(candidates[0].id); }
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
            s.extinctionNotified = false; // フラグの初期化

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
            const skipAnimBlink = window.GameConfig && window.GameConfig.aiWarNotify === false;
            if (s.isPlayerInvolved || !skipAnimBlink) {
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
                const atkDaimyoName = atkClanData ? atkClanData.name : (s.attacker.isKunishu ? s.attacker.name : (atkProvData ? atkProvData.province : "中立"));
                const defDaimyoName = defClanData ? defClanData.name : (s.defender.isKunishu ? s.defender.name : (defProvData ? defProvData.province : "中立"));
                
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
                
                // ★追加：籠城戦（攻城戦）の「戦闘終了後」の合図を出します
                if (this.game.eventManager) {
                    await this.game.eventManager.processEvents('after_siege_war', s);
                }

                const winnerClan = s.attacker.ownerClan; // 勝ったのは攻撃側です
                
                // ★追加：大名を登用した時のご褒美パワーをリセットしておきます
                this.daimyoHiredBonus = 0;

                if (this.pendingPrisoners && this.pendingPrisoners.length > 0) {
                    if (winnerClan === this.game.playerClanId) {
                        
                        // ★変更：大名がいたら〜の古い処理を消して、新しいフェーズ管理の魔法にバトンタッチします！
                        this.startPrisonerPhase();
                        
                    } else {
                        // AIが勝った場合は自動で処理します
                        await this.autoResolvePrisoners(this.pendingPrisoners, winnerClan);
                        this.pendingPrisoners = [];
                        
                        // ==========================================
                        // ★AIの場合は、そのまま滅亡チェックとターン終了へ進みます！
                        await this.game.lifeSystem.checkClanExtinction(s.oldDefClanId, 'no_castle');
                        if (window.GameApp) window.GameApp.updateAllClanPrestige(); // 威信を更新
                        this.game.finishTurn();
                        // ==========================================
                    }
                } else {
                    // ==========================================
                    // ★捕虜がいなかった場合も、そのまま滅亡チェックとターン終了へ進みます！
                    await this.game.lifeSystem.checkClanExtinction(s.oldDefClanId, 'no_castle');
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

            // ★追加：メイン軍だけの「攻城戦での死者」を割り出します（全軍の生存率を当てはめます）
            const siegeLossAtkMain = currentAtkMain - Math.floor(currentAtkMain * atkSurviveRate);
            const siegeLossDefMain = currentDefMain - Math.floor(currentDefMain * defSurviveRate);

            // ★追加：攻城戦を生き残った軍馬と鉄砲の計算（死んだ兵士の割合から、装備していた分だけを減らします）
            const atkHorseEquipRate = Math.min(1.0, (s.attacker.horses || 0) / Math.max(1, currentAtkMain));
            const atkGunEquipRate = Math.min(1.0, (s.attacker.guns || 0) / Math.max(1, currentAtkMain));
            const attackerSurvivedHorses = Math.max(0, (s.attacker.horses || 0) - Math.floor(siegeLossAtkMain * atkHorseEquipRate));
            const attackerSurvivedGuns = Math.max(0, (s.attacker.guns || 0) - Math.floor(siegeLossAtkMain * atkGunEquipRate));

            const defHorseEquipRate = Math.min(1.0, (s.defender.horses || 0) / Math.max(1, currentDefMain));
            const defGunEquipRate = Math.min(1.0, (s.defender.guns || 0) / Math.max(1, currentDefMain));
            const defenderSurvivedHorses = Math.max(0, (s.defender.horses || 0) - Math.floor(siegeLossDefMain * defHorseEquipRate));
            const defenderSurvivedGuns = Math.max(0, (s.defender.guns || 0) - Math.floor(siegeLossDefMain * defGunEquipRate));

            // 3. 吸い込み防止の箱と、回復率の設定
            let atkReinfTotalLoss = 0;
            let defReinfTotalLoss = 0;
            const isShortWarForRecovery = s.round < window.WarParams.War.ShortWarTurnLimit;
            const baseRecoveryRate = window.WarParams.War.BaseRecoveryRate || 0.2;
            const retreatRecoveryRate = window.WarParams.War.RetreatRecoveryRate || 0.2;
            const defRecoveryRate = (isRetreat && isShortWarForRecovery) ? retreatRecoveryRate : baseRecoveryRate;

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
                
                // 負傷兵の一部が回復して、一緒に帰ります！
                const recovered = Math.floor(totalLoss * (isAttackerData ? baseRecoveryRate : defRecoveryRate));
                const finalReturnSoldiers = surviveSoldiers + recovered;
                
                // ★修正：軍馬と鉄砲の帰還数（死んだ兵士の割合から、装備していた分だけを減らします）
                const horseEquipRate = Math.min(1.0, (reinf.horses || 0) / Math.max(1, reinf.soldiers));
                const gunEquipRate = Math.min(1.0, (reinf.guns || 0) / Math.max(1, reinf.soldiers));
                const returnHorses = Math.max(0, (reinf.horses || 0) - Math.floor(siegeLoss * horseEquipRate));
                const returnGuns = Math.max(0, (reinf.guns || 0) - Math.floor(siegeLoss * gunEquipRate));

                // 諸勢力の場合
                if (reinf.isKunishuForce) {
                    const kunishu = this.game.kunishuSystem.getKunishu(reinf.kunishuId);
                    if (kunishu && !kunishu.isDestroyed) {
                        kunishu.soldiers = Math.min(99999, kunishu.soldiers + finalReturnSoldiers);
                        kunishu.horses = Math.min(99999, (kunishu.horses || 0) + returnHorses); 
                        kunishu.guns = Math.min(99999, (kunishu.guns || 0) + returnGuns);       
                        reinf.bushos.forEach(b => {
                            b.castleId = kunishu.castleId; b.isCastellan = false;
                        });
                        const myClanId = isAttackerData ? s.sourceCastle.ownerClan : s.defender.ownerClan;
                        let isWin = isAttackerData ? attackerWon : !attackerWon;
                        if (isWin) {
                            kunishu.setRelation(myClanId, kunishu.getRelation(myClanId) + 5);
                            if (s.isPlayerInvolved) this.game.ui.log(`(援軍が勝利に貢献し、${kunishu.getName(this.game)}との友好度が上がりました)`);
                        } else {
                            kunishu.setRelation(myClanId, kunishu.getRelation(myClanId) - 5);
                            if (s.isPlayerInvolved) this.game.ui.log(`(敗北/撤退により、${kunishu.getName(this.game)}との友好度が下がりました)`);
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
                            b.castleId = helperCastle.id; 
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
                            } else {
                                this.game.diplomacyManager.updateSentiment(myClanId, helperClanId, -5);
                                if (s.isPlayerInvolved) this.game.ui.log(`(敗北/撤退により、${this.game.clans.find(c=>c.id===helperClanId)?.name}との友好度が下がりました)`);
                            }
                        }
                    }
                }
                
                // 武将を戦場リストから消す
                if (isAttackerData) {
                    reinf.bushos.forEach(rb => { s.atkBushos = s.atkBushos.filter(b => b.id !== rb.id); });
                } else {
                    reinf.bushos.forEach(rb => {
                        const idx = s.defender.samuraiIds.indexOf(rb.id);
                        if (idx !== -1) s.defender.samuraiIds.splice(idx, 1);
                    });
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
                    const recovered = Math.floor(fieldLoss * (isAttackerData ? baseRecoveryRate : defRecoveryRate));
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
                                b.castleId = kunishu.castleId; 
                                b.isCastellan = false;
                            });
                            const myClanId = isAttackerData ? s.sourceCastle.ownerClan : s.defender.ownerClan;
                            const kRel = kunishu.getRelation(myClanId);
                            kunishu.setRelation(myClanId, kRel - 5);
                            if (s.isPlayerInvolved) this.game.ui.log(`(援軍が撤退し、${kunishu.getName(this.game)}との友好度が下がりました)`);
                        }
                    } else {
                        const helperCastle = this.game.getCastle(reinf.castle.id); 
                        if (helperCastle) {
                            helperCastle.soldiers = Math.min(99999, helperCastle.soldiers + finalReturnSoldiers);
                            helperCastle.rice = Math.min(99999, helperCastle.rice + reinf.rice);
                            helperCastle.horses = Math.min(99999, (helperCastle.horses || 0) + (reinf.horses || 0));
                            helperCastle.guns = Math.min(99999, (helperCastle.guns || 0) + (reinf.guns || 0));
                            reinf.bushos.forEach(b => {
                                b.castleId = helperCastle.id; 
                                b.isCastellan = false;
                                if (!helperCastle.samuraiIds.includes(b.id)) helperCastle.samuraiIds.push(b.id);
                            });
                            this.game.updateCastleLord(helperCastle);

                            if (!reinf.isSelf) {
                                const myClanId = isAttackerData ? s.sourceCastle.ownerClan : s.defender.ownerClan;
                                const helperClanId = helperCastle.ownerClan;
                                this.game.diplomacyManager.updateSentiment(myClanId, helperClanId, -5);
                                if (s.isPlayerInvolved) this.game.ui.log(`(援軍が撤退し、${this.game.clans.find(c=>c.id===helperClanId)?.name}との友好度が下がりました)`);
                            }
                        }
                    }
                    
                    if (isAttackerData) {
                        reinf.bushos.forEach(rb => { s.atkBushos = s.atkBushos.filter(b => b.id !== rb.id); });
                    } else {
                        reinf.bushos.forEach(rb => {
                            const idx = s.defender.samuraiIds.indexOf(rb.id);
                            if (idx !== -1) s.defender.samuraiIds.splice(idx, 1);
                        });
                    }
                });
            }
            // ★追加ここまで
            
            // ★敵の援軍に参加した大名との友好度を「５」下げる魔法！
            if (this.game.diplomacyManager) {
                // 攻撃陣営（大名と援軍）を調べます
                const atkClan = (!s.attacker.isKunishu && s.attacker.ownerClan !== 0) ? s.attacker.ownerClan : null;
                const atkAlly = (s.reinforcement && !s.reinforcement.castle.isKunishu && s.reinforcement.castle.ownerClan !== 0 && !s.reinforcement.isSelf) ? s.reinforcement.castle.ownerClan : null;
                
                // 守備陣営（大名と援軍）を調べます
                const defClan = (!s.defender.isKunishu && s.oldDefClanId !== 0) ? s.oldDefClanId : null;
                const defAlly = (s.defReinforcement && !s.defReinforcement.castle.isKunishu && s.defReinforcement.castle.ownerClan !== 0 && !s.defReinforcement.isSelf) ? s.defReinforcement.castle.ownerClan : null;

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
                const atkDaimyoName = atkClanData ? atkClanData.name : "大名家";
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
                    const skipAnim = window.GameConfig && window.GameConfig.aiWarNotify === false;
                    if (!skipAnim) {
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
                    const skipAnim = window.GameConfig && window.GameConfig.aiWarNotify === false;
                    if (typeof this.game.ui.playCaptureEffect === 'function' && (s.isPlayerInvolved || !skipAnim)) {
                        // 画面が真っ白になった瞬間に色を塗り替えるお願いを渡します
                        await this.game.ui.playCaptureEffect(targetC.id, () => {
                            this.game.ui.updateClanColors();
                        });
                    } else {
                        this.game.ui.updateClanColors();
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
                        return kunishuMembers.includes(id) || (busho && busho.status === 'ronin');
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
                    const skipAnim = window.GameConfig && window.GameConfig.aiWarNotify === false;
                    if (!skipAnim) {
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
            const defBushos = this.game.getCastleBushos(s.defender.id).filter(b => b.status === 'active' && (s.defender.isKunishu ? b.belongKunishuId === s.defender.kunishuId : (b.clan === s.defender.ownerClan && b.belongKunishuId === 0))).concat(this.pendingPrisoners);
            if (s.defBusho && s.defBusho.id && !defBushos.find(b => b.id === s.defBusho.id)) defBushos.push(s.defBusho);
            defBushos.forEach(b => { this.game.factionSystem.recordBattle(b, s.defender.id); this.game.factionSystem.updateRecognition(b, 25); });

            // ★修正：結果画面を出す前に合戦画面を消す魔法を復活させます！
            if (s.isPlayerInvolved) { this.game.ui.setWarModalVisible(false); }
            
            // ★修正：メイン部隊の本当の負傷兵（全体の負傷兵から、援軍の分を引いたもの）を計算します！
            const realAtkDead = Math.max(0, s.deadSoldiers.attacker - atkReinfTotalLoss);
            const realDefDead = Math.max(0, s.deadSoldiers.defender - defReinfTotalLoss);
            
            const attackerRecovered = Math.floor(realAtkDead * baseRecoveryRate);
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
                    const recovered = Math.floor(realDefDead * defRecoveryRate);
                    // ★追加：撤退先での兵士合流にストッパー！
                    targetC.soldiers = Math.min(99999, targetC.soldiers + s.defender.soldiers + recovered);
                    if (s.isPlayerInvolved && recovered > 0) this.game.ui.log(`(撤退先にて負傷兵 ${recovered}名 が復帰)`);
                }
            } else if (!isRetreat && attackerWon) {
                const survivors = Math.max(0, s.defender.soldiers);
                const recovered = Math.floor(realDefDead * baseRecoveryRate);
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
                
                const recovered = Math.floor(realDefDead * baseRecoveryRate);
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
                const skipAnim = window.GameConfig && window.GameConfig.aiWarNotify === false;
                if (typeof this.game.ui.playCaptureEffect === 'function' && (s.isPlayerInvolved || !skipAnim)) {
                    await this.game.ui.playCaptureEffect(s.defender.id, () => {
                        this.game.ui.updateClanColors();
                    });
                } else {
                    this.game.ui.updateClanColors();
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
                    const isAtkAlly = (s.reinforcement && Number(s.reinforcement.castle.ownerClan) === pid) || 
                                      (s.selfReinforcement && Number(s.selfReinforcement.castle.ownerClan) === pid) ||
                                      (s.retreatedReinforcements && s.retreatedReinforcements.some(r => r.isAttackerData && r.data.castle && Number(r.data.castle.ownerClan) === pid));
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
                    const skipAnim = window.GameConfig && window.GameConfig.aiWarNotify === false;
                    if (aiResultMsg && !skipAnim) {
                        // ★追加：ダイアログを出す前にバリアを解除します！
                        if (typeof this.game.ui.hideMapGuard === 'function') this.game.ui.hideMapGuard(true);
                        await this.game.ui.showDialogAsync(aiResultMsg);
                    }
                    finishWarProcess();
                }
                return;
            }
                
            let resultMsg = "";
            const pid = Number(this.game.playerClanId);
            const isAtkPlayer = (Number(s.attacker.ownerClan) === pid) || 
                                (s.reinforcement && Number(s.reinforcement.castle.ownerClan) === pid) || 
                                (s.selfReinforcement && Number(s.selfReinforcement.castle.ownerClan) === pid) ||
                                (s.retreatedReinforcements && s.retreatedReinforcements.some(r => r.isAttackerData && r.data.castle && Number(r.data.castle.ownerClan) === pid));
            const isDefPlayer = (Number(s.oldDefClanId) === pid) || 
                                (s.defReinforcement && Number(s.defReinforcement.castle.ownerClan) === pid) || 
                                (s.defSelfReinforcement && Number(s.defSelfReinforcement.castle.ownerClan) === pid) ||
                                (s.retreatedReinforcements && s.retreatedReinforcements.some(r => !r.isAttackerData && r.data.castle && Number(r.data.castle.ownerClan) === pid));
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

                s.attacker.training = Math.min(120, s.attacker.training + (window.WarParams.War.WinStatIncrease || 5)); s.attacker.morale = Math.min(120, s.attacker.morale + (window.WarParams.War.WinStatIncrease || 5)); 
                
                const maxCharm = Math.max(...s.atkBushos.map(b => b.charm));
                const subCharm = s.atkBushos.reduce((acc, b) => acc + b.charm, 0) - maxCharm;
                const daimyo = this.game.bushos.find(b => b.clan === s.attacker.ownerClan && b.isDaimyo) || {charm: 50};
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
                const skipAnim = window.GameConfig && window.GameConfig.aiWarNotify === false;
                if (typeof this.game.ui.playCaptureEffect === 'function' && (s.isPlayerInvolved || !skipAnim)) {
                    await this.game.ui.playCaptureEffect(s.defender.id, () => {
                        this.game.ui.updateClanColors();
                    });
                } else {
                    this.game.ui.updateClanColors();
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
                const skipAnim = window.GameConfig && window.GameConfig.aiWarNotify === false;
                if (aiResultMsg && !skipAnim) {
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
            if (b.status === 'ronin' || b.status === 'unborn' || b.status === 'dead') return;
            // ★ 修正: 諸勢力に所属している武将は、どんな城の戦いでも絶対に巻き添えで捕虜にならないように守ります！
            if (b.belongKunishuId > 0) return;

            let chance = isLastStand ? 1.0 : ((window.WarParams.War.CaptureChanceBase || 0.7) - (b.strength * (window.WarParams.War.CaptureStrFactor || 0.002)) + (Math.random() * 0.3));
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

            const myBushos = this.game.bushos.filter(b=>b.clan===this.game.playerClanId && b.status !== 'unborn');
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
                let baseProb = ((recruiter.charm || 50) * 1.5) / ((prisoner.loyalty || 50) * 3);
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
                hireProb *= 0.5; // 大名は登用しにくくします

                // 宿敵が登用先の大名家にいる場合は成功率を半分にします
                if (prisoner.nemesisIds && prisoner.nemesisIds.length > 0) {
                    const hasNemesis = prisoner.nemesisIds.some(nId => {
                        const nBusho = this.game.getBusho(nId);
                        return nBusho && nBusho.clan === this.game.playerClanId && nBusho.status !== 'dead';
                    });
                    if (hasNemesis) {
                        hireProb *= 0.5;
                    }
                }

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
                await this.game.lifeSystem.executeDeath(prisoner);
                this.game.ui.showDialog(`${prisoner.name}を処断しました。`, false, nextStep);
            }, null, {
                leftFace: prisoner.faceIcon,
                leftName: prisoner.name
            });
        } else if (action === 'release') {
            // 解放時
            if (isExtinct) prisoner.isDaimyo = false;
            
            if (!isExtinct) {
                const returnCastle = friendlyCastles[Math.floor(Math.random() * friendlyCastles.length)];
                this.game.factionSystem.handleMove(prisoner, 0, returnCastle.id); 
                this.game.affiliationSystem.enterCastle(prisoner, returnCastle.id);
                prisoner.status = 'active'; 
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
        const myBushos = this.game.bushos.filter(b=>b.clan===this.game.playerClanId && b.status !== 'unborn'); 
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
            
            if (this.daimyoHiredBonus) {
                hireProb += this.daimyoHiredBonus;
                hireProb = Math.max(0, Math.min(0.99, hireProb));
            }

            // ★追加：宿敵が登用先の大名家にいる場合は成功率を半分にします
            if (prisoner.nemesisIds && prisoner.nemesisIds.length > 0) {
                const hasNemesis = prisoner.nemesisIds.some(nId => {
                    const nBusho = this.game.getBusho(nId);
                    return nBusho && nBusho.clan === this.game.playerClanId && nBusho.status !== 'dead';
                });
                if (hasNemesis) {
                    hireProb *= 0.5;
                }
            }

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
            for (let p of this.pendingKills) {
                this.registerNemesisForExecuted(p, this.game.playerClanId);
                await this.game.lifeSystem.executeDeath(p);
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
                        this.game.affiliationSystem.enterCastle(prisoner, returnCastle.id);
                        prisoner.status = 'active'; 
                    }
                } else {
                    if (!isExtinct) {
                        const returnCastle = friendlyCastles[Math.floor(Math.random() * friendlyCastles.length)];
                        this.game.factionSystem.handleMove(prisoner, 0, returnCastle.id); 
                        this.game.affiliationSystem.enterCastle(prisoner, returnCastle.id);
                        prisoner.status = 'active'; 
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

        // 全て終わったので滅亡チェックをしてターンを終了します
        await this.game.lifeSystem.checkClanExtinction(this.state.oldDefClanId, 'no_castle');
        if (window.GameApp) window.GameApp.updateAllClanPrestige();
        this.game.finishTurn();
    },
    
    async autoResolvePrisoners(captives, winnerClanId) { // ★ async を追加
        const aiBushos = this.game.bushos.filter(b => b.clan === winnerClanId && b.status !== 'unborn'); 
        // AIもプレイヤーと同じように大名（または代表者）の魅力や相性を使うようにします
        const recruiter = aiBushos.find(b => b.isDaimyo) || aiBushos[0] || { charm: 50, affinity: 0 };

        // ★大名から先に処理するように並べ替えます
        captives.sort((a, b) => (b.isDaimyo ? 1 : 0) - (a.isDaimyo ? 1 : 0));
        let daimyoHiredBonus = 0; // ★ご褒美の箱

        for (const p of captives) { 
            // ★大名家が滅亡している（他に城がない）かをチェックします
            const friendlyCastles = this.game.castles.filter(c => c.ownerClan === p.clan && p.clan !== 0);
            const isExtinct = (friendlyCastles.length === 0);

            // ★変更：fe_system.js の魔法にお任せします！
            if (p.isDaimyo && !isExtinct) { 
                this.registerNemesisForExecuted(p, winnerClanId);
                await this.game.lifeSystem.executeDeath(p); 
                continue; 
            }
            
            const isKunishuBoss = (p.belongKunishuId > 0 && p.id === this.game.kunishuSystem.getKunishu(p.belongKunishuId)?.leaderId);

            // 新しい計算式：基本確率を出します（帰る城がない＝滅亡確定ならペナルティをなくします）
            let baseProb = ((recruiter.charm || 50) * 1.5) / ((p.loyalty || 50) * 3) - (isExtinct ? 0 : 0.4);
            
            // ＋0.1 から －0.1 のランダムな運の要素を作ります
            let randomBonus = (Math.random() * 0.2) - 0.1;
            
            // 相性の差を計算して補正します
            const recruiterAffinity = recruiter.affinity || 0;
            const prisonerAffinity = p.affinity || 0;
            const affinityDiff = Math.abs(recruiterAffinity - prisonerAffinity);
            
            let affinityBonus = 0;
            if (affinityDiff <= 10) {
                affinityBonus = 0.1;
            } else if (affinityDiff >= 50) {
                affinityBonus = -0.3;
            } else {
                affinityBonus = 0.1 - (affinityDiff - 10) * 0.01;
            }
            
            // 基本確率、ランダムな運、相性補正をすべて足します（途中はマイナスでもOKです）
            let hireProb = baseProb + randomBonus + affinityBonus;
            
            // 全部足した結果を、0%から99%の間に収めます
            hireProb = Math.max(0, Math.min(0.99, hireProb));
            
            // 捕まった武将が大名なら確率を半分にします
            if (p.isDaimyo && hireProb > 0) {
                hireProb *= 0.5;
            } else if (!p.isDaimyo && daimyoHiredBonus > 0) {
                hireProb += daimyoHiredBonus;
                hireProb = Math.max(0, Math.min(0.99, hireProb));
            }

            // ★追加：宿敵が登用先の大名家にいる場合は成功率を半分にします
            if (p.nemesisIds && p.nemesisIds.length > 0) {
                const hasNemesis = p.nemesisIds.some(nId => {
                    const nBusho = this.game.getBusho(nId);
                    return nBusho && nBusho.clan === winnerClanId && nBusho.status !== 'dead';
                });
                if (hasNemesis) {
                    hireProb *= 0.5;
                }
            }

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
                await this.game.lifeSystem.executeDeath(p);
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
                    this.game.affiliationSystem.enterCastle(p, kunishu.castleId);
                    p.status = 'active'; 
                } else {
                    const originalClanId = p.clan; 
                    const friendlyCastlesExt = this.game.castles.filter(c => c.ownerClan === originalClanId && originalClanId !== 0);
                    
                    if (friendlyCastlesExt.length > 0) {
                        const returnCastle = friendlyCastlesExt[Math.floor(Math.random() * friendlyCastlesExt.length)];
                        this.game.factionSystem.handleMove(p, 0, returnCastle.id); 
                        this.game.affiliationSystem.enterCastle(p, returnCastle.id);
                        p.status = 'active'; 
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

        this.game.ui.renderMap(); 
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
        
        setTimeout(() => {
             if (window.GameApp) window.GameApp.updateAllClanPrestige(); // ★威信を更新
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
                }
            );
        } else {
            // AIなら自動で一番兵士が多い城から送る
            candidateCastles.sort((a,b) => b.soldiers - a.soldiers);
            const bestCastle = candidateCastles[0];
            console.log(`自勢力の援軍を呼ぶお城を選びました: ${bestCastle.name}`);
            
            // ★追加：委任城主が攻められた時、援軍候補が「直轄城」ならプレイヤーに尋ねる！
            if (defClanId === pid && !bestCastle.isDelegated) {
                const castellan = this.game.getBusho(defCastle.castellanId);
                const requesterName = castellan ? castellan.name : "城主";
                
                this.game.ui.showDialog(`${requesterName}殿が${bestCastle.name}に参戦を求めています。\n援軍を送りますか？`, true, () => {
                    // 「はい」の場合、武将選択画面を開いて自分で選べるようにします
                    const promptBusho = () => {
                        this.game.ui.openBushoSelector('def_self_reinf_deploy', bestCastle.id, {
                            hideCancel: false, 
                            onConfirm: (selectedBushoIds) => {
                                this.handleBushoSelectionForDefSelfReinf(bestCastle.id, selectedBushoIds, onComplete, promptBusho);
                            },
                            onCancel: () => {
                                this.game.ui.showDialog("援軍の派遣を取りやめました。", false, () => onComplete(null));
                            }
                        });
                    };
                    promptBusho();
                }, () => {
                    // 「いいえ」の場合
                    onComplete(null);
                });
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

        // ★追加：守備側（目的地）のお城がある国が大雪だったら、誰も助けに来られないので諦めます！
        const defProv = this.game.provinces.find(p => p.id === defCastle.provinceId);
        if (defProv && defProv.statusEffects && defProv.statusEffects.includes('heavySnow')) {
            onComplete();
            return;
        }

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
                }
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
                
                if (candidate.force.isKunishu) {
                    // 諸勢力の場合の確率
                    realProb = this.game.diplomacyManager.getReinforcementAcceptProb(defClanId, candidate.force.id, atkClanId, 0, true, defTotalSoldiers, atkTotalSoldiers);
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
                    if (rel && rel.status === '支配') {
                        realProb = 100; // 支配している相手なら100%成功します
                        reinfGold = 0;
                    } else {
                        realProb = this.game.diplomacyManager.getReinforcementAcceptProb(defClanId, helperClanId, atkClanId, reinfGold, false, defTotalSoldiers, atkTotalSoldiers);
                    }
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
        const myClanId = helperCastle.ownerClan;
        
        let reinfSoldiers = Math.floor(helperCastle.soldiers * 0.5);
        if (reinfSoldiers < 500) reinfSoldiers = 500;
        if (reinfSoldiers > helperCastle.soldiers) reinfSoldiers = helperCastle.soldiers;
        
        const availableBushos = this.game.getCastleBushos(helperCastle.id).filter(b =>
            b.clan === helperCastle.ownerClan && b.status === 'active'
        ).sort((a,b) => b.strength - a.strength);

        let bushoCount = 1;
        if (reinfSoldiers >= 1500) bushoCount = 2;
        if (reinfSoldiers >= 2500) bushoCount = 3;
        if (bushoCount > availableBushos.length) bushoCount = availableBushos.length;

        const reinfBushos = availableBushos.slice(0, bushoCount);
        const reinfRice = reinfSoldiers; 
        const reinfHorses = (helperCastle.horses || 0) < reinfSoldiers * 0.2 ? 0 : Math.min(helperCastle.horses || 0, Math.floor(reinfSoldiers * 0.5)); 
        const reinfGuns = (helperCastle.guns || 0) < reinfSoldiers * 0.2 ? 0 : Math.min(helperCastle.guns || 0, Math.floor(reinfSoldiers * 0.5));

        helperCastle.soldiers = Math.max(0, helperCastle.soldiers - reinfSoldiers);
        helperCastle.rice = Math.max(0, helperCastle.rice - reinfRice);
        helperCastle.horses = Math.max(0, (helperCastle.horses || 0) - reinfHorses);
        helperCastle.guns = Math.max(0, (helperCastle.guns || 0) - reinfGuns);

        const selfReinfData = {
            castle: helperCastle, bushos: reinfBushos, soldiers: reinfSoldiers,
            rice: reinfRice, horses: reinfHorses, guns: reinfGuns, isAttacker: false, isSelf: true,
            morale: helperCastle.morale || 50, training: helperCastle.training || 50
        };
        
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

        // ★諸勢力の場合
        if (force && force.isKunishu) {
            const kunishu = this.game.kunishuSystem.getKunishu(force.id);
            const currentRel = kunishu.getRelation(myClanId);
            
            // 借りを作ったので友好度が少し下がります
            kunishu.setRelation(myClanId, currentRel - 10);
            
            const rate = currentRel / 200; 
            let reinfSoldiers = Math.floor(kunishu.soldiers * rate);
            reinfSoldiers = Math.max(500, Math.min(reinfSoldiers, kunishu.soldiers));
            
            const availableBushos = this.game.kunishuSystem.getKunishuMembers(kunishu.id).sort((a,b) => b.strength - a.strength);
            let bushoCount = reinfSoldiers >= 2500 ? 3 : (reinfSoldiers >= 1500 ? 2 : 1);
            bushoCount = Math.min(bushoCount, availableBushos.length);
            const reinfBushos = availableBushos.slice(0, bushoCount);
            
            const reinfRice = reinfSoldiers; 
            const reinfHorses = 0; 
            const reinfGuns = 0;
            
            kunishu.soldiers = Math.max(0, kunishu.soldiers - reinfSoldiers);
            
            this.state.defReinforcement = {
                castle: helperCastle, kunishuId: kunishu.id, bushos: reinfBushos, soldiers: reinfSoldiers,
                rice: reinfRice, horses: reinfHorses, guns: reinfGuns, isSelf: false, isKunishuForce: true,
                morale: kunishu.morale || 50, training: kunishu.training || 50
            };
            
            if (myClanId === this.game.playerClanId) {
                const leader = this.game.getBusho(kunishu.leaderId);
                const leaderName = leader ? leader.name : "頭領";
                const nameStr = `${kunishu.getName(this.game)}の${leaderName}`;
                
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
            });
            return;
        }

        if (!['支配', '従属', '同盟'].includes(myToHelperRel.status)) this.game.diplomacyManager.updateSentiment(myClanId, helperClanId, -10);

        const helperDaimyo = this.game.bushos.find(b => b.clan === helperClanId && b.isDaimyo) || { duty: 50 };
        
        const rate = (myToHelperRel.sentiment + helperDaimyo.duty) / 400;
        let reinfSoldiers = Math.floor(helperCastle.soldiers * rate);
        reinfSoldiers = Math.max(500, Math.min(reinfSoldiers, helperCastle.soldiers));
        
        const availableBushos = this.game.getCastleBushos(helperCastle.id).filter(b => b.clan === helperCastle.ownerClan && b.status === 'active').sort((a,b) => b.strength - a.strength);
        let bushoCount = reinfSoldiers >= 2500 ? 3 : (reinfSoldiers >= 1500 ? 2 : 1);
        bushoCount = Math.min(bushoCount, availableBushos.length);

        const reinfBushos = availableBushos.slice(0, bushoCount);
        const reinfRice = reinfSoldiers; 
        const reinfHorses = Math.min(helperCastle.horses || 0, Math.floor(reinfSoldiers * 0.5)); 
        const reinfGuns = Math.min(helperCastle.guns || 0, Math.floor(reinfSoldiers * 0.5));

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
        
        if (this.game.diplomacyManager && !helperIsKunishu && !atkIsKunishu && helperClanId !== 0 && atkId !== 0) {
            this.game.diplomacyManager.updateSentiment(helperClanId, atkId, -7);
        }
        
        if (myClanId === this.game.playerClanId) {
            const castellan = this.game.getBusho(helperCastle.castellanId);
            const castellanName = castellan ? castellan.name : "城主";
            const nameStr = `${helperCastle.name}の${castellanName}`;
            
            this.game.warManager.reinfMsgHelper.showAcceptance(this.game, nameStr, false, defCastle.isDelegated, false, onComplete, false);
        } else {
            onComplete();
        }
    },

    _promptPlayerDefReinforcement(helperCastle, defCastle, myToHelperRel, onComplete, isBoss) {
        const promptBusho = () => {
            this.game.ui.openBushoSelector('def_reinf_deploy', helperCastle.id, {
                hideCancel: isBoss,
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
        const killerDaimyo = this.game.bushos.find(b => b.clan === killerClanId && b.isDaimyo);
        if (!killerDaimyo) return;
        const killerId = killerDaimyo.id;

        const victimClanId = executedBusho.clan;
        
        // 斬られた武将の元の同僚（同じ大名家に所属する武将）全員をチェック
        this.game.bushos.forEach(b => {
            if (b.clan === victimClanId && b.status === 'active' && b.id !== executedBusho.id) {
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
    }
});