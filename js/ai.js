/**
 * ai.js - 敵思考エンジン
 * 敵大名のターン処理、内政、外交、軍事判断
 */



class AIEngine {
    constructor(game) {
        this.game = game;
    }

    // ★追加：大名の威信（daimyoPrestige）を取り出す魔法です！
    getClanPrestige(clanId) {
        const numericClanId = Number(clanId);
        if (numericClanId === 0) return 0;

        // ★軽量化＋挙動維持：このAI思考で実際に参照した勢力だけ最新化します。
        // 以前の updateAllClanPrestige() と違い全勢力を毎城走査しませんが、
        // 比較対象になった勢力の威信は必ず「現在値」になります。
        if (!this._prestigeRefreshedThisExec) this._prestigeRefreshedThisExec = new Set();
        if (!this._prestigeRefreshedThisExec.has(numericClanId) && typeof this.game.updateClanPrestige === 'function') {
            this.game.updateClanPrestige(numericClanId);
            this._prestigeRefreshedThisExec.add(numericClanId);
        }

        const clan = typeof this.game.getClan === 'function'
            ? this.game.getClan(numericClanId)
            : this.game.clans.find(c => Number(c.id) === numericClanId);
        return clan ? Math.max(1, clan.daimyoPrestige) : 1;
    }

    getDifficultyMods() {
        const diff = window.AIParams.AI.Difficulty;
        switch(diff) {
            case 'hard': return { accuracy: 1.0, aggression: 1.2, resourceSave: 0.2 }; 
            case 'easy': return { accuracy: 0.6, aggression: 0.7, resourceSave: 0.6 }; 
            default:     return { accuracy: 0.85, aggression: 1.0, resourceSave: 0.4 }; 
        }
    }

    getAISmartness(attributeVal) {
        const mods = this.getDifficultyMods();
        const base = window.AIParams.AI.AbilityBase;
        const sensitivity = window.AIParams.AI.AbilitySensitivity;
        let prob = 0.5 + ((attributeVal - base) * sensitivity * 0.01);
        prob = Math.max(0.1, Math.min(0.95, prob));
        if (mods.accuracy > 0.9) prob += 0.1;
        if (mods.accuracy < 0.7) prob -= 0.1;
        return Math.max(0.05, Math.min(1.0, prob));
    }
    
    async execAI(castle) {
        try {
            // ★追加：AIが考え始める前に一瞬だけ処理を休ませて（息継ぎをして）、スマホがパンクするのを防ぎます！
            await new Promise(resolve => setTimeout(resolve, 0));
            if (this.game.writeAIDiagnostic) this.game.writeAIDiagnostic(castle, 'exec:start');
            
            // ★イベント追加：コマンドの選択前（AI操作時）
            if (this.game.eventManager) {
                await this.game.eventManager.processEvents('before_command', castle);
            }

            // ★軽量化：このAI思考中に威信を最新化した勢力を記録します。
            // 自勢力は必ずここで更新し、敵勢力は getClanPrestige() で参照された時だけ更新します。
            this._prestigeRefreshedThisExec = new Set();
            if (typeof this.game.updateClanPrestige === 'function') {
                this.game.updateClanPrestige(castle.ownerClan);
                this._prestigeRefreshedThisExec.add(Number(castle.ownerClan));
            } else {
                this.game.updateAllClanPrestige();
            }
            // ★自分の城で、かつ「委任されていない（直轄）」の時だけプレイヤーに操作を戻します
            if (Number(castle.ownerClan) === Number(this.game.playerClanId) && !castle.isDelegated) {
                console.warn("AI Alert: Player castle detected in AI routine. Returning control to player.");
                this.game.isProcessingAI = false;
                this.game.ui.showControlPanel(castle);
                return;
            }

            const castellan = this.game.getBusho(castle.castellanId);
            if (!castellan || castellan.isActionDone) { 
                this.game.finishTurn(); 
                return; 
            }
            
            // ★大名のお引越しと、軍師任命の処理を「人事部」に任せます！
            if (this.game.writeAIDiagnostic) this.game.writeAIDiagnostic(castle, 'staffing:relocate');
            const isRelocated = this.game.aiStaffing.relocateDaimyo(castle, castellan);
            
            if (isRelocated) {
                // お引越しをしたなら、このお城のターンはおしまいです！
                this.game.finishTurn();
                return;
            }
            
            this.game.affiliationSystem.appointAIGunshi(castle, castellan);

            const mods = this.getDifficultyMods();
            const smartness = this.getAISmartness(castellan.intelligence);

            // ★修正：軍事フェーズ（出陣）を一番最初に確認するように順番を上に移動させます！
            const clanOps = this.game.aiOperationManager.operations[castle.ownerClan];
            let myOperation = clanOps ? clanOps[castle.legionId] : null;

            // 評定後に残っていた古い攻撃作戦も、出撃直前にもう一度専門部署へ確認します。
            if (myOperation && myOperation.type === '攻撃' && this.game.legionPolicySystem &&
                !this.game.legionPolicySystem.isOperationAllowed(castle.ownerClan, castle.legionId, myOperation)) {
                if (this.game.aiOperationManager && typeof this.game.aiOperationManager.reconcileLegionPolicy === 'function') {
                    this.game.aiOperationManager.reconcileLegionPolicy(castle.ownerClan, castle.legionId);
                }
                myOperation = null;
            }
            
            // 自分の大名家に「作戦」があり、それが「攻撃」で、かつ「実行中」の場合
            if (myOperation && myOperation.type === '攻撃' && myOperation.status === '実行中') {
                // そして、自分のお城がその「出撃元（stagingBase）」に選ばれている場合だけ出陣します！
                if (myOperation.stagingBase === castle.id) {
                    if (this.game.writeAIDiagnostic) this.game.writeAIDiagnostic(castle, 'operation:reachability:start');
                    
                    // ★追加：出陣する前に、道が繋がっているか、まだ「敵」かどうかの最終チェックをします！
                    let canReach = false;
                    let isStillEnemy = false; // ★追加：まだ敵のままかどうかの印です
                    let targetProvId = castle.provinceId; // ★この時点では出撃元の国を仮置きしておきます
                    
                    if (myOperation.isKunishuTarget) {
                        if (myOperation.isEventOperation) {
                            canReach = true;
                            isStillEnemy = true;
                        } else {
                            // 諸勢力がまだ生きているか、仲良しになっていないか（友好度30以下）をチェックします
                            const targetKunishu = this.game.kunishuSystem.getKunishu(myOperation.targetId);
                            if (targetKunishu && !targetKunishu.isDestroyed && targetKunishu.getRelation(castle.ownerClan) <= 30) {
                                isStillEnemy = true;
                                
                                // ★追加：ターゲットの諸勢力がいるお城のデータを探して、道が繋がっているか確認します！
                                const targetCastle = this.game.getCastle(targetKunishu.castleId);
                                if (targetCastle) {
                                    targetProvId = targetCastle.provinceId; // 目的地のお城の国をセットします
                                    // 自領の別のお城にいるかもしれないので、道が繋がっているか確認します
                                    canReach = MapGraphService.isReachable(this.game, castle, targetCastle, castle.ownerClan);

                                    if (this.game.writeAIDiagnostic) this.game.writeAIDiagnostic(castle, 'operation:reachability:done');
                                }
                            }
                        }
                    } else {
                        const targetCastle = this.game.getCastle(myOperation.targetId);
                        if (targetCastle) {
                            targetProvId = targetCastle.provinceId;
                            
                            if (myOperation.isEventOperation) {
                                canReach = true;
                                isStillEnemy = true;
                            } else {
                                // 道が繋がっているか、魔法を使って再確認します！
                                canReach = MapGraphService.isReachable(this.game, castle, targetCastle, castle.ownerClan);

                                if (this.game.writeAIDiagnostic) this.game.writeAIDiagnostic(castle, 'operation:reachability:done');
                                
                                // ★追加：お休み期間（immunityUntil）ではないか、味方や同盟国になっていないかチェックします！
                                // 今の月（TurnId）よりもお休み期間の方が未来なら、攻撃は我慢します
                                if ((targetCastle.immunityUntil || 0) < this.game.getCurrentTurnId()) {
                                    if (targetCastle.ownerClan !== castle.ownerClan) {
                                        if (targetCastle.ownerClan === 0) {
                                            isStillEnemy = true; // 空き城なら攻撃OKです
                                        } else {
                                            const rel = this.game.getRelation(castle.ownerClan, targetCastle.ownerClan);
                                            
                                            // ★今回変更：もし出陣のタイミングで相手が「同盟」や「従属」なら、破棄できるか最終確認します！
                                            if (rel && (rel.status === '同盟' || rel.status === '従属')) {
                                                // ★修正：同盟の場合、友好度が50以上の「仲良し」なら絶対に破棄しません（作戦中止）
                                                if (rel.status === '同盟' && rel.sentiment >= 50) {
                                                    isStillEnemy = false; 
                                                } else {
                                                    // ★今回追加：大名家の名前を調べて、関係に合わせたメッセージを作ります！
                                                    const myClanData = this.game.getClan(castle.ownerClan);
                                                    const targetClanData = this.game.getClan(targetCastle.ownerClan);
                                                    const myClanName = myClanData ? myClanData.name : "不明な勢力";
                                                    const targetClanName = targetClanData ? targetClanData.name : "不明な勢力";
                                                    
                                                    let breakMsg = "";
                                                    if (rel.status === '同盟') {
                                                        breakMsg = `${myClanName}が${targetClanName}との同盟を破棄しました！`;
                                                    } else if (rel.status === '従属') {
                                                        breakMsg = `${myClanName}が${targetClanName}の従属下から独立しました！`;
                                                    }
                                                    
                                                    // 画面のログ（文字の履歴）やダイアログにお知らせを出します
                                                    if (breakMsg !== "") {
                                                        this.game.ui.showDialog(breakMsg, false);
                                                        this.game.ui.log(`【外交】${breakMsg}`, { clanIds: [castle.ownerClan, targetCastle.ownerClan], category: 'diplomacy', inferCurrentTurn: false });
                                                        console.log(breakMsg); // 裏側の記録にも残しておきます
                                                    }
        
                                                    const breakResult = this.game.diplomacyManager.applyBreakAlliancePenalty(castle.ownerClan, targetCastle.ownerClan);
                                                    // 断交で発生した人質・婚姻の処遇も、攻撃へ進む前に必ず完了させる。
                                                    // プレイヤーが拘束側なら既存の捕虜処遇UIを戦後処理なしで再利用する。
                                                    await this.game.diplomacyManager.resolveBreakAllianceConsequences(breakResult);
                                                    isStillEnemy = breakResult.becameHostile === true;
                                                }
                                            } else if (!rel || !this.game.diplomacyManager.isNonAggression(rel.status)) {
                                                isStillEnemy = true; // 同盟などで守られていなければ敵です！
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }

                    if (this.game.writeAIDiagnostic && myOperation.isEventOperation) {
                        this.game.writeAIDiagnostic(castle, 'operation:reachability:done');
                    }

                    // もし道が途切れていたり、すでに敵じゃなくなっていたら、作戦のメモを消して中止します！
                    if (!canReach || !isStillEnemy) {
                        delete this.game.aiOperationManager.operations[castle.ownerClan][castle.legionId];
                        await this.game.aiOperationManager.generateOperation(castle.ownerClan, castle.legionId);
                    } else {
                        // ★追加：自分のお城か目的地が大雪になっていないかチェックをします！
                        let isHeavySnow = false;
                        if (!myOperation.isEventOperation) {
                            const srcProv = this.game.getProvince(castle.provinceId);
                            if (srcProv && srcProv.statusEffects && srcProv.statusEffects.includes('heavySnow')) {
                                isHeavySnow = true;
                            }
                            if (!isHeavySnow) {
                                const tgtProv = this.game.getProvince(targetProvId);
                                if (tgtProv && tgtProv.statusEffects && tgtProv.statusEffects.includes('heavySnow')) {
                                    isHeavySnow = true;
                                }
                            }
                        }

                        // 大雪じゃなければ、予定通り出陣します！
                        if (!isHeavySnow) {
                            // メモしておいたIDから、お城や諸勢力のデータを復元して出発の魔法を呼びます
                            if (myOperation.isKunishuTarget) {
                                const targetKunishu = this.game.kunishuSystem.getKunishu(myOperation.targetId);
                                if (targetKunishu) {
                                    if (this.game.writeAIDiagnostic) this.game.writeAIDiagnostic(castle, 'operation:war_dispatch:kunishu');
                                    this.executeKunishuSubjugateAI(castle, targetKunishu, castellan, myOperation.requiredForce, myOperation.requiredRice);
                                }
                            } else {
                                const targetCastle = this.game.getCastle(myOperation.targetId);
                                if (targetCastle) {
                                    // ★変更：一番最後に「myOperation（作戦のメモ）」も一緒に渡してあげます！
                                    if (this.game.writeAIDiagnostic) this.game.writeAIDiagnostic(castle, 'operation:war_dispatch:daimyo');
                                    this.executeAttack(castle, targetCastle, castellan, myOperation.requiredForce, myOperation.requiredRice, myOperation);
                                }
                            }
                            
                            // ★出撃が終わったら、この作戦のメモは「完了」にして消しておきます
                            myOperation.status = '完了';
                            delete this.game.aiOperationManager.operations[castle.ownerClan][castle.legionId];
                            
                            // 出陣したので、このお城のターンはおしまいです！
                            return; 
                        }
                        // 大雪の時は出陣を我慢して、何もしない（内政フェーズに進む）ようにします
                    }
                }
            }

            // ★追加：城主の智謀によって、城の状況を「十分足りている」と高めに見誤る魔法です！
            let maxErrorEmg = 0;
            if (castellan.intelligence <= 50) {
                maxErrorEmg = 0.3; // 智謀50以下で最大30%の誤差
            } else if (castellan.intelligence >= 95) {
                maxErrorEmg = 0;   // 智謀95以上で誤差なし
            } else {
                maxErrorEmg = 0.3 * (95 - castellan.intelligence) / 45; // 51〜94の間は線形で減らす
            }
            
            // サイコロを振って「勘違いして高く見積もる」分を計算します
            const errDefenseEmg = castle.maxDefense * (Math.random() * maxErrorEmg);
            const errLoyaltyEmg = 100 * (Math.random() * maxErrorEmg);
            
            // 実際の数値に「勘違い分」を足した「AIの思い込みステータス」を作ります
            const perceivedDefenseEmg = Math.min(castle.maxDefense, castle.defense + errDefenseEmg);
            const perceivedLoyaltyEmg = Math.min(100, castle.peoplesLoyalty + errLoyaltyEmg);

            // ★追加：外交や戦争を考えるよりも先に、城防御上げや民忠上げを優先します！
            let emergencyActionDone = false;
            // ★修正：思い込みステータスで緊急事態かどうかを判断させます
            if (perceivedDefenseEmg <= castle.maxDefense / 4 && castle.gold >= window.MainParams.CommandCost.Repair) {
                // 城壁修復
                castle.gold -= window.MainParams.CommandCost.Repair;
                const val = DomesticRules.calcRepair(castellan, 1.0, true);
                const oldVal = castle.defense;
                castle.defense = Math.min(castle.maxDefense, castle.defense + val);
                
                const actualVal = castle.defense - oldVal;
                castellan.achievementTotal = (castellan.achievementTotal || 0) + Math.floor(actualVal * 0.5);
                if (this.game.factionSystem && this.game.factionSystem.updateRecognition) this.game.factionSystem.updateRecognition(castellan, 10);
                
                castellan.isActionDone = true;
                emergencyActionDone = true;
            } else if (perceivedLoyaltyEmg <= 70 && castle.rice >= window.MainParams.CommandCost.Charity) {
                // 施し
                castle.rice -= window.MainParams.CommandCost.Charity;
                const val = DomesticRules.calcCharity(castellan, 1.0, true);
                
                castle.peoplesLoyalty = Math.min(100, castle.peoplesLoyalty + val);
                
                castellan.achievementTotal = (castellan.achievementTotal || 0) + Math.floor(val * 0.5);
                if (this.game.factionSystem && this.game.factionSystem.updateRecognition) this.game.factionSystem.updateRecognition(castellan, 15);
                
                castellan.isActionDone = true;
                emergencyActionDone = true;
            }

            // ★追加：緊急の修復や施しを行ったら、戦争などは行わずに残りの内政のみ行います
            if (emergencyActionDone) {
                await this.execInternalAffairs(castle, castellan, mods, smartness);
                this.game.finishTurn();
                return;
            }

            // 外交フェーズ (確率で実行)
            // プレイヤーの城（委任中）の場合は、勝手に外交させないようにします
            if (Number(castle.ownerClan) !== Number(this.game.playerClanId)) {
                
                // ★今回変更：大名家が今月「この相手と外交するぞ！」と決めているか、記憶を確認します
                const myClan = this.game.getClan(castle.ownerClan);
                
                if (myClan && myClan.currentDiplomacyTarget) {
                    // まずは自分のお殿様（大名）を探します。いない時は城主を大名の代わりにします
                    const daimyo = this.game.getClanDaimyo(castle.ownerClan) || castellan;
                    
                    // 今までの基本の確率（約10%）を計算します
                    let diplomacyChance = ((window.AIParams.AI.DiplomacyChance) / 3) * (mods.aggression); 
                    
                    // 大名の外交ステータスから基準の50を引いて、差を計算します（-50から+50になります）
                    const dipDiff = daimyo.diplomacy - 50;
                    
                    // 差が50の時に10%（0.1）になるように、少しずつ増減する数字（ボーナス）を作ります
                    let dipBonus = dipDiff * 0.002;
                    
                    // お殿様の性格が好戦的（aggressive）で、かつボーナスがプラス（外交が50より高い）の時
                    if (daimyo.personality === 'aggressive' && dipBonus > 0) {
                        // アップする分だけを半分にします（最大で5%アップになります）
                        dipBonus = dipBonus / 2;
                    }
                    
                    // 基本の確率にボーナスを足し算します
                    diplomacyChance += dipBonus;
                    
                    // 大名家の作戦が「外交」なら、外交確率を2倍にします！
                    const clanOps = this.game.aiOperationManager.operations[castle.ownerClan];
                    const myOp = clanOps ? clanOps[castle.legionId] : null;
                    if (myOp && myOp.type === '外交' && myOp.status === '実行中') {
                        diplomacyChance *= 2;
                    }
                    
                    // お城がピンチ（兵士が少ない等）の時は、内政（徴兵など）を優先したくて外交確率を下げます！
                    if (castle.soldiers <= 1000) {
                        diplomacyChance = 0; // 兵士1000以下の超ピンチなら、外交してる場合じゃない！
                    } else if (castle.soldiers <= 3000) {
                        // 1000〜3000の間なら、兵士が少ないほど外交確率が下がっていく魔法です！
                        const penaltyRatio = (castle.soldiers - 1000) / 2000; // 0(少ない) 〜 1(多い) になります
                        diplomacyChance = diplomacyChance * penaltyRatio; 
                    }
                    
                    // 確率がマイナス（0%より下）にならないように、最低でも0にしておきます
                    diplomacyChance = Math.max(0, diplomacyChance);

                    // 出来上がった確率でサイコロを振ります！当たったら記憶の通りに外交を実行します！
                    if (Math.random() < diplomacyChance) {
                        const dipResult = this.execAIDiplomacy(castle, castellan, smartness, myClan.currentDiplomacyTarget); 
                        if (dipResult === 'waiting') return; // プレイヤーのお返事待ちならここで一旦ストップ！
                        if (castellan.isActionDone) { this.game.finishTurn(); return; }
                    }
                }
            }
            
            // 内政フェーズ (軍事行動をしなかった場合)
            await this.execInternalAffairs(castle, castellan, mods, smartness);
            this.game.finishTurn();

        } catch(e) {
            console.error("AI Logic Error:", e);
            this.game.finishTurn();
        }
    }

    decideAttackTarget(myCastle, myGeneral, enemies) {
        // 城主の性格による出陣兵士数の割合決定
        let sendRate = 0.6; // normal (バランス)
        if (myGeneral.personality === 'aggressive') sendRate = 0.8;
        if (myGeneral.personality === 'conservative') sendRate = 0.4;
        
        const sendSoldiers = Math.floor(myCastle.soldiers * sendRate);
        
        // ★ここを書き足します：出陣する兵士が0人以下の時は、攻撃を諦めます！
        if (sendSoldiers <= 0) return null;
        
        // 兵糧のチェック (連れて行く兵士数の2.5倍：消費分と帰還後の余裕をもたせます)
        const requiredRice = Math.floor(sendSoldiers * 2.5);
        if (myCastle.rice < requiredRice) return null;

        // --- 修正後：正確な見積もりと戦闘力比の計算 ---

        const myDaimyo = this.game.getClanDaimyo(myCastle.ownerClan) || { personality: 'normal', intelligence: 50, duty: 50, nemesisIds: [] };

        // ★追加：リーダー（直轄なら大名、それ以外なら国主）を特定して、その居城がある地方を調べます！
        let leader = myDaimyo;
        if (myCastle.legionId !== 0) {
            const legion = this.game.legions ? this.game.legions.find(l => l.clanId === myCastle.ownerClan && l.legionNo === myCastle.legionId) : null;
            if (legion && legion.commanderId) {
                const commander = this.game.getBusho(legion.commanderId);
                if (commander) {
                    leader = commander;
                }
            }
        }
        
        let leaderRegionId = 0;
        if (leader && leader.castleId) {
            const leaderCastle = this.game.getCastle(leader.castleId);
            if (leaderCastle) {
                const leaderProv = this.game.getProvince(leaderCastle.provinceId);
                if (leaderProv) {
                    leaderRegionId = leaderProv.regionId;
                }
            }
        }

        const myClanId = myCastle.ownerClan;
        const myClanCastles = this.game.getClanCastles(myClanId);
        const myTotalPower = this.getClanPrestige(myClanId);

        // ★追加：自分の軍団が抱えている「方針」を調べます！
        const myGrandObj = (this.game.aiOperationManager && this.game.aiOperationManager.grandObjectives && this.game.aiOperationManager.grandObjectives[myClanId] && this.game.aiOperationManager.grandObjectives[myClanId][myCastle.legionId]) 
                            ? this.game.aiOperationManager.grandObjectives[myClanId][myCastle.legionId] : null;

        // =========================================================================
        // ★新規追加：上洛ルート検索（将軍候補がいる場合）
        const jorakuTargets = new Set();
        let hasShogunCandidate = false;
        
        // 自勢力に正式所属する通常の活動中武将だけから「左馬頭（ID: 80）」を探す。
        // 自領に滞在している浪人・諸勢力人物を、自家の将軍候補として誤認しない。
        const myBushos = this.game.getClanBushos(myClanId).filter(b =>
            Number(b.belongKunishuId || 0) === 0
            && window.BushoStatusRules.isActive(b)
        );
        for (const b of myBushos) {
            if (Array.isArray(b.courtRankIds) && b.courtRankIds.map(Number).includes(80)) {
                hasShogunCandidate = true;
                break;
            }
        }

        // 将軍候補がいたら、京都への道を探します！
        if (hasShogunCandidate) {
            // まだ持っていない二条城（ID: 26）と槇島城（ID: 90）を探します
            // すでに片方を持っていても、もう片方を狙うようになります
            const unownedKyotoCastles = [this.game.getCastle(26), this.game.getCastle(90)].filter(c => c && c.ownerClan !== myClanId);
            
            if (unownedKyotoCastles.length > 0) {
                // 距離を測るためのノートを作ります
                const dist = {};
                const prev = {};
                this.game.castles.forEach(c => dist[c.id] = Infinity); // 最初は全部「無限遠」にしておきます
                const queue = [];
                const queuedCastleIds = new Set();
                
                // 自分の領地は「距離0」として出発点にします
                myClanCastles.forEach(c => {
                    dist[c.id] = 0;
                    queue.push(c.id);
                    queuedCastleIds.add(c.id);
                });
                
                // 道が繋がっているお城を順番に調べていきます
                while(queue.length > 0) {
                    let minD = Infinity;
                    let u = -1;
                    let uIdx = -1;
                    // 今一番近いお城を探します
                    for(let i=0; i<queue.length; i++) {
                        if (dist[queue[i]] < minD) {
                            minD = dist[queue[i]];
                            u = queue[i];
                            uIdx = i;
                        }
                    }
                    if (u === -1) break;
                    queue.splice(uIdx, 1);
                    queuedCastleIds.delete(u);
                    
                    const uCastle = this.game.getCastle(u);
                    if (!uCastle.adjacentCastleIds) continue;
                    
                    // お隣のお城への道しるべを書きます
                    for (const adjId of uCastle.adjacentCastleIds) {
                        const vCastle = this.game.getCastle(adjId);
                        if (!vCastle) continue;
                        
                        let cost = Infinity; // 最初は通れない壁だと仮定します
                        
                        if (vCastle.ownerClan === myClanId) {
                            cost = 0; // 自分のお城ならスイスイ通れます（コスト0）
                        } else {
                            // 同盟国など、攻撃しちゃダメな相手か確認します
                            let isProtected = false;
                            if (vCastle.ownerClan !== 0) {
                                const rel = this.game.getRelation(myClanId, vCastle.ownerClan);
                                if (rel && this.game.diplomacyManager.isNonAggression(rel.status)) {
                                    isProtected = true; // 攻撃できないので通れません！
                                }
                            }
                            // 攻撃できる相手（または空き城）なら、1回戦えば通れます（コスト1）
                            if (!isProtected) {
                                cost = 1;
                            }
                        }
                        
                        // 今までの道より近ければ、ノートを書き直します
                        if (cost !== Infinity) {
                            if (dist[u] + cost < dist[vCastle.id]) {
                                dist[vCastle.id] = dist[u] + cost;
                                prev[vCastle.id] = u; // どこから来たかメモしておきます
                                if (!queuedCastleIds.has(vCastle.id)) {
                                    queue.push(vCastle.id);
                                    queuedCastleIds.add(vCastle.id);
                                }
                            }
                        }
                    }
                }
                
                // 二条城か槇島城のうち、近い方を目的地に決めます！
                // もし両方同じ距離でも、片方だけが選ばれるので二重に狙うことはありません！
                let bestKyotoCastle = null;
                let minDistToKyoto = Infinity;
                unownedKyotoCastles.forEach(kc => {
                    if (dist[kc.id] < minDistToKyoto) {
                        minDistToKyoto = dist[kc.id];
                        bestKyotoCastle = kc;
                    }
                });
                
                // 目的地にたどり着く道があったら、足跡をたどって「次に攻めるべき城」を特定します！
                if (bestKyotoCastle && minDistToKyoto > 0 && minDistToKyoto !== Infinity) {
                    let curr = bestKyotoCastle.id;
                    // 距離が「1（次に攻める場所）」になるまで逆戻りします
                    // もし目的地が隣のお城（距離1）なら、逆戻りせずそのままターゲットになります（直接攻撃！）
                    while (curr !== undefined && dist[curr] > 1) {
                        curr = prev[curr];
                    }
                    if (curr !== undefined && dist[curr] === 1) {
                        jorakuTargets.add(curr); // 上洛の第一歩としてロックオンします！
                    }
                }
            }
        }

        // =========================================================================
        // ★新規追加：過去の記憶から「奪われた拠点（失地）」を洗い出し、勢力ごとに数を数えます！
        const pastOwnedSet = new Set();
        if (this.game.aiOperationManager && this.game.aiOperationManager.historyOwnedCastles && this.game.aiOperationManager.historyOwnedCastles[myClanId]) {
            const history = this.game.aiOperationManager.historyOwnedCastles[myClanId];
            history.forEach(list => list.forEach(id => pastOwnedSet.add(id)));
        }

        // 過去に自分のもので、今は他の大名家に奪われている拠点をカウントします
        const stolenCountsByClan = {};
        pastOwnedSet.forEach(cid => {
            const c = this.game.getCastle(cid);
            if (c && c.ownerClan !== myClanId && c.ownerClan !== 0) {
                stolenCountsByClan[c.ownerClan] = (stolenCountsByClan[c.ownerClan] || 0) + 1;
            }
        });
        // =========================================================================

        // =========================================================================
        // ★新規追加：周囲の敵対大名をすべて調べて、それぞれの警戒度を計算します！

        // ★ここから追加：自分が持っている「国」と「地方」が、統一されているか調べる魔法！
        // まずは自分が持っている国と地方の出席番号を書き出します
        const myProvIds = new Set();
        const myRegionIds = new Set();
        myClanCastles.forEach(c => {
            myProvIds.add(c.provinceId);
            const prov = this.game.getProvince(c.provinceId);
            if (prov) myRegionIds.add(prov.regionId);
        });

        // 次に、世界中のすべてのお城を調べて、自分以外のお城がある国や地方は「まだ統一していない」とメモします
        const ununifiedProvIds = new Set();
        const ununifiedRegionIds = new Set();
        this.game.castles.forEach(c => {
            if (c.ownerClan !== myClanId) {
                if (myProvIds.has(c.provinceId)) {
                    ununifiedProvIds.add(c.provinceId);
                }
                const prov = this.game.getProvince(c.provinceId);
                if (prov && myRegionIds.has(prov.regionId)) {
                    ununifiedRegionIds.add(prov.regionId);
                }
            }
        });

        // ★追加：過去に自領を攻撃してきた大名家や諸勢力をリストアップします！
        const pastAttackerClans = new Set();
        const pastAttackerKunishus = new Set();
        myClanCastles.forEach(c => {
            if (c.lastAttackerClanId > 0) {
                if (c.lastAttackerIsKunishu) {
                    pastAttackerKunishus.add(c.lastAttackerClanId);
                } else {
                    pastAttackerClans.add(c.lastAttackerClanId);
                }
            }
        });

        // ★追加：自分の大名家全体が現在隣接している勢力をリストアップします！
        const allAdjacentClans = new Set();
        myClanCastles.forEach(myC => {
            if (myC.adjacentCastleIds) {
                myC.adjacentCastleIds.forEach(adjId => {
                    const c = this.game.getCastle(adjId);
                    if (c && c.ownerClan !== 0 && c.ownerClan !== myClanId) {
                        allAdjacentClans.add(c.ownerClan);
                    }
                });
            }
        });
        
        // ★見積もりをする人（評価者）の智謀を決めます
        // プレイヤーの委任城なら「城主（myGeneral）」、敵AIなら「大名（myDaimyo）」の智謀を使います
        let evaluatorInt = 50;
        if (myClanId === this.game.playerClanId) {
            evaluatorInt = myGeneral.intelligence;
        } else {
            evaluatorInt = myDaimyo.intelligence ?? 50;
        }
        
        // 自領のどこかと隣接している大名家をリストアップします
        const adjacentClans = new Set();
        myClanCastles.forEach(myC => {
            // ★変更：大名家全体ではなく、このお城と同じ「軍団」に隣接している敵だけをリストに入れます！
            if (myC.legionId === myCastle.legionId && myC.adjacentCastleIds) {
                myC.adjacentCastleIds.forEach(adjId => {
                    const c = this.game.getCastle(adjId);
                    if (c && c.ownerClan !== 0 && c.ownerClan !== myClanId) {
                        adjacentClans.add(c.ownerClan);
                    }
                });
            }
        });
        
        // 警戒すべき敵対大名を複数リストアップします！
        const adjacentEnemyClans = [];
        adjacentClans.forEach(clanId => {
            const rel = this.game.getRelation(myClanId, clanId);
            // ★修正：外交専用の魔法を使います！
            const isProtected = rel && this.game.diplomacyManager.isNonAggression(rel.status);
            
            // 同盟などの保護関係になければ警戒対象！
            if (!isProtected) {
                const trueEnemyPower = this.getClanPrestige(clanId);
                
                // ★智謀によって敵の威信を見誤る魔法（智謀95以上ならほぼ正確！）
                const errorRange = Math.min(0.3, Math.max(0, (100 - evaluatorInt) / 100 * 0.3));
                const errorRate = 1.0 + (Math.random() - 0.5) * 2 * errorRange;
                const perceivedEnemyPower = trueEnemyPower * errorRate;
                
                // 見積もった威信で倍率を計算します
                const powerRatio = perceivedEnemyPower / myTotalPower;
                let penalty = 0;
                // 0.8倍から警戒しはじめ、2.5倍で警戒心マックスになります
                if (powerRatio >= 1.0) {
                    let cautionLevel = (powerRatio - 0.5) / (2.5 - 0.8);
                    cautionLevel = Math.min(1.0, Math.max(0.0, cautionLevel));
                    penalty = cautionLevel * 15.0; // ★周辺の敵に対する警戒ペナルティ
                }
                if (penalty > 0) {
                    // ★powerには「見誤った威信」を入れておき、後で一番脅威に感じた敵を選べるようにします
                    adjacentEnemyClans.push({ clanId: clanId, penalty: penalty, power: perceivedEnemyPower });
                }
            }
        });
        // =========================================================================

        let bestTarget = null;
        let highestProb = -1;

        // ★高速化：大雪が降っている国（provinceId）のリストを最初に作っておきます！
        const heavySnowProvIds = new Set();
        this.game.provinces.forEach(p => {
            if (p.statusEffects && p.statusEffects.includes('heavySnow')) {
                heavySnowProvIds.add(p.id);
            }
        });

        // ★自分がいる国が大雪かどうか調べます！
        const isSrcHeavySnow = heavySnowProvIds.has(myCastle.provinceId);

        // この1回の攻撃候補比較中は城兵数も諸勢力関係も変化しません。
        // 候補ごとに同じ勢力の全城reduce・自領全拠点の諸勢力走査を繰り返さない短命キャッシュです。
        const clanSoldierTotalCache = new Map();
        const getClanTotalSoldiersForDecision = (clanId) => {
            const id = Number(clanId) || 0;
            if (!clanSoldierTotalCache.has(id)) {
                clanSoldierTotalCache.set(id, this.game.getClanTotalSoldiers(id) || 0);
            }
            return clanSoldierTotalCache.get(id);
        };
        let hostileKunishuCountForDecision = null;
        const getHostileKunishuCountForDecision = () => {
            if (hostileKunishuCountForDecision !== null) return hostileKunishuCountForDecision;
            let count = 0;
            myClanCastles.forEach(c => {
                const ks = this.game.kunishuSystem.getKunishusInCastle(c.id);
                if (!ks) return;
                ks.forEach(k => {
                    if (k.getRelation(myClanId) <= 30 && k.ideology !== '商人') count++;
                });
            });
            hostileKunishuCountForDecision = count;
            return count;
        };

        enemies.forEach(target => {
            // ★目的地が大雪か調べます！
            // ★諸勢力も自領の別のお城にいるかもしれないので、ターゲットの国の天気を見ます
            const isTgtHeavySnow = heavySnowProvIds.has(target.provinceId);

            // ★大雪の時は、絶対にこの目標を攻めません（次の目標の計算へスキップします）
            if (isSrcHeavySnow || isTgtHeavySnow) {
                return;
            }

            if (target.isKunishuTarget) {
                // ★諸勢力に対する攻撃確率の計算
                const kunishu = target.kunishu;

                // ★追加：商人は攻撃対象から除外します
                if (kunishu.ideology === '商人') return;

                // ★修正：諸勢力は兵力が少ないため、計算上は「1.1倍」にして大名家の城と同じ難易度として評価します！
                const enemyForce = (kunishu.soldiers + kunishu.defense) * 1.1;
                
                let myReinfPower = 0;
                // 自軍からの援軍を見積もる
                this.game.castles.forEach(c => {
                    if (c.ownerClan === myCastle.ownerClan && c.id !== myCastle.id && c.soldiers >= 1000) {
                        const errorRange = Math.min(0.3, Math.max(0, (100 - myGeneral.intelligence) / 100 * 0.3));
                        const errorRate = 1.0 + (Math.random() - 0.5) * 2 * errorRange;
                        myReinfPower += (c.soldiers * window.WarParams.Reinforcement.SelfSoldierRatio) * errorRate;
                    }
                });

                const myForce = myCastle.soldiers + myReinfPower;
                const forceRatio = myForce / Math.max(1, enemyForce);
                
                let prob = 0;
                if (forceRatio < 1.0) { // ★見かけの兵力を2倍にした上で、互角以上でないと攻めません
                    prob = -999;
                } else if (forceRatio >= 3.0) {
                    prob = 40 + (forceRatio - 3.0) * 5;
                } else if (forceRatio >= 2.0) {
                    prob = 30 + (forceRatio - 2.0) * 10; 
                } else {
                    prob = 10 + (forceRatio - 1.0) * 20;
                }

                // 友好度による補正 (友好度が低いほど攻撃したくなる)
                const relVal = kunishu.getRelation(myCastle.ownerClan);
                prob += (30 - relVal); // 最大+30

                // ★追加：諸勢力は関係30以下で攻撃対象になるため、「敵対している」ことへの基本ボーナスをあげます！
                prob += 15;

                // 性格補正
                const getPersonalityBonus = (p) => {
                    if (p === 'aggressive') return 5;
                    if (p === 'conservative') return -5;
                    return 0;
                };
                prob += getPersonalityBonus(myDaimyo.personality);
                prob += getPersonalityBonus(myGeneral.personality);

                // 難易度補正
                const diff = window.AIParams.AI.Difficulty;
                const diffMulti = diff === 'hard' ? 1.2 : diff === 'easy' ? 0.7 : 1.0;
                prob *= diffMulti;

                // ★過去に自領を攻撃してきた諸勢力への反撃！
                if (pastAttackerKunishus.has(kunishu.id)) {
                    prob += 15;
                }

                // ★自領内にいる敵対諸勢力（関係30以下で商人以外）の数を数えて、
                // その数 × 5点 分だけスコアを上乗せします！
                const totalHostileKunishus = getHostileKunishuCountForDecision();
                prob += (totalHostileKunishus * 5); // 領内に敵対している諸勢力が多いほど優先度が上がります

                // ★国内平定が方針の時は、最優先で諸勢力を鎮圧します！
                let maxProb = 55;
                if (myGrandObj && myGrandObj.type === '国内平定') {
                    prob += 40; 
                    maxProb += 40;
                }

                // 最大値の適用 (諸勢力相手は通常最大55)
                prob = Math.min(prob, maxProb);

                if (prob > 0) prob = prob * 0.9;
                prob = Math.max(0, prob);

                if (prob > highestProb) {
                    highestProb = prob;
                    bestTarget = target;
                }
                return; // ここでこのループのイテレーションを終了
            }
            
            // ★追加：空き城の時は外交データがないので、仮の「敵対」データを作ってあげます！
            let rel = { status: '敵対', sentiment: 0 };
            if (target.ownerClan !== 0) {
                rel = this.game.getRelation(myCastle.ownerClan, target.ownerClan);
            }
            
            // ★今回追加：もし相手が同盟国や従属先だったら、特別に「破棄して攻撃するかのスコア」を計算します！
            if (rel && (rel.status === '同盟' || rel.status === '従属')) {
                // お隣の城リストを作って専門部署に渡してあげます
                const myClanCastles = this.game.getClanCastles(myCastle.ownerClan);
                const neighborCastles = [];
                myClanCastles.forEach(myC => {
                    if (myC.adjacentCastleIds) {
                        myC.adjacentCastleIds.forEach(adjId => {
                            const adjCastle = this.game.getCastle(adjId);
                            if (adjCastle && adjCastle.ownerClan !== 0 && adjCastle.ownerClan !== myCastle.ownerClan) {
                                neighborCastles.push(adjCastle);
                            }
                        });
                    }
                });

                const myPower = this.getClanPrestige(myCastle.ownerClan);
                const targetPower = this.getClanPrestige(target.ownerClan);
                
                let breakScore = this.game.diplomacyManager.calcBreakAllianceScore(myCastle.ownerClan, target.ownerClan, myPower, targetPower, myDaimyo.duty, neighborCastles);

                // もしスコアが足切り（マイナス）なら、この相手は諦めて次の相手を計算します
                if (breakScore <= 0) {
                    return; 
                }

                // 破棄スコアが、そのまま「攻撃スコア」になります！
                if (breakScore > highestProb) {
                    highestProb = breakScore;
                    bestTarget = target;
                }
                return; // 同盟国への計算はこれでおしまいです
            }
            
            // 知略が低いほど、敵の数を見誤る（誤差が出る）計算
            const int = myGeneral.intelligence;
            const errorRange = Math.min(0.3, Math.max(0, (100 - int) / 100 * 0.3));
            const errorRate = 1.0 + (Math.random() - 0.5) * 2 * errorRange;

            // =========================================================================
            // ★新規追加：自分と相手、それぞれの「呼べそうな援軍の数」を見積もります！
            let myReinfPower = 0;
            let enemyReinfPower = 0;

            // ★ここから追加：① 自分と相手の「別の城からの援軍（自家援軍）」を見積もります！
            this.game.castles.forEach(c => {
                // ★高速化：事前に作ったリストを使って大雪かどうか調べます！
                const isReinfHeavySnow = heavySnowProvIds.has(c.provinceId);

                // ★大雪の城からは援軍が来ないので、計算に入れません！
                if (!isReinfHeavySnow) {
                    // 自分が呼べそうな自家援軍（出撃元の城と同じ軍団で、出撃元の城以外で、兵力1000以上の城）
                    // ★修正：直轄（軍団ID0）なら、他の軍団の城からも援軍が来ると見積もります！
                    if (c.ownerClan === myCastle.ownerClan && (c.legionId === myCastle.legionId || myCastle.legionId === 0) && c.id !== myCastle.id && c.soldiers >= 1000) {
                        myReinfPower += (c.soldiers * window.WarParams.Reinforcement.SelfSoldierRatio) * errorRate; // 兵力の半分くらい来てくれると予想
                    }
                    // 相手が呼べそうな自家援軍（守る城以外で、兵力1000以上の城）
                    if (c.ownerClan === target.ownerClan && c.id !== target.id && c.soldiers >= 1000) {
                        enemyReinfPower += (c.soldiers * window.WarParams.Reinforcement.SelfSoldierRatio) * errorRate; // 相手の別のお城からの援軍も警戒！
                    }
                }
            });

            // ② 同盟国からの援軍を見積もる
            this.game.clans.forEach(c => {
                if (c.id === 0 || c.id === myCastle.ownerClan || c.id === target.ownerClan) return;
                
                // その大名から来てくれそうな兵士数を予想します（大体の目安として総兵力の15%くらいと予想）
                const trueClanPower = getClanTotalSoldiersForDecision(c.id);
                let expectedReinf = (trueClanPower * 0.15) * errorRate; // ここでも智謀で見誤る魔法がかかります！
                
                // 自分が呼べそうか？（同盟等で仲良し＆相手とは仲良くない）
                const myRel = this.game.getRelation(myCastle.ownerClan, c.id);
                const cToTargetRel = this.game.getRelation(c.id, target.ownerClan);
                if (myRel && this.game.diplomacyManager.isNonAggression(myRel.status) && myRel.sentiment >= 50) {
                    // ★修正：敵対大名と「同盟・支配・従属」関係にあるか、友好度が100の場合は呼べないようにします
                    const isEnemyAlly = cToTargetRel && window.DiplomacyRules.isAllianceOrVassal(cToTargetRel.status);
                    const isEnemyMaxGoodwill = cToTargetRel && cToTargetRel.sentiment >= 100;
                    if (!isEnemyAlly && !isEnemyMaxGoodwill && (!cToTargetRel || !this.game.diplomacyManager.isNonAggression(cToTargetRel.status))) {
                        myReinfPower += expectedReinf;
                    }
                }
                
                // 相手が呼べそうか？（敵と同盟等で仲良し＆自分とは仲良くない）
                const targetRel = this.game.getRelation(target.ownerClan, c.id);
                const cToMyRel = this.game.getRelation(c.id, myCastle.ownerClan);
                if (targetRel && this.game.diplomacyManager.isNonAggression(targetRel.status) && targetRel.sentiment >= 50) {
                    // ★修正：こちらも同じく、自分と「同盟・支配・従属」または友好度100の場合は相手に味方しないようにします
                    const isMyAlly = cToMyRel && window.DiplomacyRules.isAllianceOrVassal(cToMyRel.status);
                    const isMyMaxGoodwill = cToMyRel && cToMyRel.sentiment >= 100;
                    if (!isMyAlly && !isMyMaxGoodwill && (!cToMyRel || !this.game.diplomacyManager.isNonAggression(cToMyRel.status))) {
                        enemyReinfPower += expectedReinf;
                    }
                }
            });
            // =========================================================================

            // 誤差を含めた敵の兵数と防御力
            const pEnemySoldiers = target.soldiers * errorRate;
            const pEnemyDefense = target.defense * errorRate;

            // ★修正：予想される援軍の影響を3分の1に抑制して計算します
            const enemyForce = pEnemySoldiers + pEnemyDefense + (enemyReinfPower / 3);

            const myForce = myCastle.soldiers + (myReinfPower / 3);
            const forceRatio = myForce / Math.max(1, enemyForce);
            
            // ★今回追加：相手が「隙だらけ」かどうかを見極める魔法です！
            // 敵の兵士数が1500未満で、かつこちらの戦力が2.5倍以上あるか、
            // または兵士数に関係なく戦力比が5倍以上ある場合は「隙だらけのチャンス」とみなします。
            const isVulnerable = (target.soldiers < 1500 && forceRatio >= 2.5) || forceRatio >= 5.0;
            
            let prob = 0;
            if (forceRatio < 0.4) {
                // ★玉砕防止ストッパー：相手が2.5倍以上の絶望的な戦力なら、絶対に城から出ない！
                // これによって攻撃作戦が中止され、引きこもって防衛・内政に専念します。
                prob = -999;
            } else if (forceRatio < 0.6) {
                // 相手が1.6倍〜2.5倍の時：かなり苦しい戦いになるため大きくマイナス。
                prob = -40;
            } else if (forceRatio >= 2.5) {
                // ★変更：相手がどれだけ弱くても、点数の上限を35点でストップさせます！
                // これで「弱小勢力への異常な執着」を防ぎます。
                // ★さらに追加：ただし、相手が「隙だらけ」の場合は、特別に上限を45点まで引き上げて優先させます！
                if (isVulnerable) {
                    prob = 45;
                } else {
                    prob = 35; 
                }
            } else if (forceRatio >= 1.5) {
                // 相手の1.5倍〜2.5倍の時（有利な戦い）
                prob = 20 + (forceRatio - 1.5) * 15; 
            } else if (forceRatio >= 1.0) {
                // 相手と互角〜1.5倍までの時（少し点数を底上げして、互角の勝負を挑みやすくします）
                prob = 10 + (forceRatio - 1.0) * 20;
            } else {
                // 相手の0.5倍〜互角までの時（-30から10までなめらかに繋げます）
                prob = -30 + (forceRatio - 0.5) * 80;
            }
            
            // 守備側武将の能力による攻撃確率低下 (最大10%)
            const enemyBushos = this.game.getCastleBushos(target.id).filter(b => b.clan === target.ownerClan && window.BushoStatusRules.isActive(b));
            let maxLdr = 0, maxInt = 0;
            if (enemyBushos.length > 0) {
                maxLdr = Math.max(...enemyBushos.map(b => b.leadership));
                maxInt = Math.max(...enemyBushos.map(b => b.intelligence));
            }
            const ldrDrop = maxLdr >= 70 ? Math.min(5, ((maxLdr - 70) / 30) * 5) : 0;
            const intDrop = maxInt >= 70 ? Math.min(5, ((maxInt - 70) / 30) * 5) : 0;
            prob -= (ldrDrop + intDrop);

            // 友好度による補正 (50基準、最低0.1%)
            const sentiment = typeof rel.sentiment !== 'undefined' ? rel.sentiment : 50; 
            prob += (50 - sentiment) * 0.2;

            // ★追加：関係が「友好」の場合は、攻撃をためらうようにマイナス補正を入れます
            if (rel.status === '友好') {
                prob -= 30;
            }

            // 性格による補正関数
            const getPersonalityBonus = (p) => {
                if (p === 'aggressive') return 5;
                if (p === 'conservative') return -5;
                return 0;
            };
            
            // 大名と城主の性格補正を適用
            prob += getPersonalityBonus(myDaimyo.personality);
            prob += getPersonalityBonus(myGeneral.personality);

            // 難易度補正
            const diff = window.AIParams.AI.Difficulty;
            const diffMulti = diff === 'hard' ? 1.2 : diff === 'easy' ? 0.7 : 1.0;
            prob *= diffMulti;

            // ★複数警戒：周りの敵からのペナルティをすべて足し算します
            let totalCautionPenalty = 0;
            
            // ★変更：「空き城」または「敵対状態ではない相手」を狙う場合のみ、警戒ペナルティでスコアを抑制します！
            if (target.ownerClan === 0 || rel.status !== '敵対') {
                adjacentEnemyClans.forEach(enemy => {
                    // 「いま攻めようとしている相手」以外の敵からのペナルティだけ足します
                    if (target.ownerClan !== enemy.clanId) {
                        totalCautionPenalty += enemy.penalty;
                    }
                });
            }

            // ★今回追加：相手が隙だらけなら「サクッと落とせる」と判断して、周りの敵への警戒を半分に減らします！
            if (isVulnerable) {
                totalCautionPenalty = totalCautionPenalty / 2;
            }
            prob -= totalCautionPenalty;

            // ★今回追加：その城を取った後の戦況を考えて、周囲の敵城や味方城を警戒・計算する魔法！
            // 攻撃目標の城に隣接している城のうち、「敵」や「味方」がいくつあるかを数えます。
            let futureEnemyNeighbors = 0;
            let friendlyNeighbors = 0;
            let newEnemyClanCount = 0; // ★追加：新しく隣接することになる敵勢力の数
            const checkedNewClans = new Set(); // ★追加：同じ勢力を重複して数えないためのメモ
            
            if (target.adjacentCastleIds) {
                target.adjacentCastleIds.forEach(adjId => {
                    const adjCastle = this.game.getCastle(adjId);
                    if (adjCastle) {
                        // まず自分の城かどうかを調べます
                        if (adjCastle.ownerClan === myCastle.ownerClan) {
                            friendlyNeighbors++;
                        } else if (adjCastle.ownerClan !== 0) {
                            // 空き城（IDが0）以外なら、関係を調べます
                            const adjRel = this.game.getRelation(myCastle.ownerClan, adjCastle.ownerClan);
                            if (adjRel) {
                                // 友好、同盟、支配、従属なら味方として数えます
                                if (window.DiplomacyRules.isFriendly(adjRel.status)) {
                                    friendlyNeighbors++;
                                } 
                                // 敵対、普通、和睦なら敵（潜在的な脅威）として数えます
                                else if (!window.DiplomacyRules.isFriendly(adjRel.status)) {
                                    futureEnemyNeighbors++;
                                    
                                    // ★追加：その敵勢力が、現在の大名家全体でまだ隣接していない「新しい勢力」かチェックします
                                    // 今から攻撃する相手の勢力は除外します
                                    if (adjCastle.ownerClan !== target.ownerClan && !allAdjacentClans.has(adjCastle.ownerClan)) {
                                        if (!checkedNewClans.has(adjCastle.ownerClan)) {
                                            newEnemyClanCount++;
                                            checkedNewClans.add(adjCastle.ownerClan);
                                        }
                                    }
                                }
                            }
                        }
                    }
                });
            }
            // 敵城が少ないほど優先され、多いほど守りにくいため後回しにします（1城につき4点マイナス）
            prob -= (futureEnemyNeighbors * 4);
            
            // ★追加：新しく隣接してしまう敵勢力がいる場合、戦線が広がるのを嫌がって大きくスコアを下げます（1勢力につき10点マイナス）
            // ★今回追加：隙だらけなら、このペナルティも半分にして前向きに攻めさせます！
            if (newEnemyClanCount > 0) {
                let expandPenalty = newEnemyClanCount * 10;
                if (isVulnerable) expandPenalty = expandPenalty / 2;
                prob -= expandPenalty;
            }
            
            // 味方の隣接城が多いほど守りやすいため優先します（最低1城は隣接しているので -1 して、1城につき3点プラス）
            let bonusCount = Math.max(0, friendlyNeighbors - 1);
            prob += (bonusCount * 3);
            
            // ★新しく戦線を広げる場合、周辺大名と威信を比較して弱いところを狙う魔法！
            // まだ「敵対」していない相手で、空き城(0)ではない場合だけ発動します
            if (target.ownerClan !== 0 && rel.status !== '敵対') {
                // ターゲットの大名家全体の威信を取得します（さっき智謀で見誤った値を使います）
                const targetData = adjacentEnemyClans.find(e => e.clanId === target.ownerClan);
                const perceivedTargetPower = targetData ? targetData.power : this.getClanPrestige(target.ownerClan);

                // 周り（自分の領地に隣り合っている）の大名たちの「平均威信」を計算します
                let totalPower = 0;
                let count = 0;
                adjacentEnemyClans.forEach(e => {
                    totalPower += e.power;
                    count++;
                });

                if (count > 0) {
                    const avgPower = totalPower / count;
                    const ratio = perceivedTargetPower / avgPower; // 平均と比べてどれくらい強いか？

                    if (ratio < 1.0) {
                        // 平均より弱い場合：狙い目なので確率をアップ！（最大で約 +8%）
                        prob += (1.0 - ratio) * 8; 
                    } else {
                        // 平均より強い場合：手強いので確率をダウン！（最大で約 -20%）
                        prob -= (ratio - 1.0) * 15; 
                    }
                }

                // ★追加：自分の大名家と比べて「格上（大勢力）」なら、大きくスコアを下げて喧嘩を売りにくくする魔法！
                const vsMyPowerRatio = perceivedTargetPower / Math.max(1, myTotalPower);
                // ★「敵対していない」相手にだけペナルティを与えます。
                // すでに敵対している場合は、恐怖を捨てて立ち向かうためペナルティは免除します！
                if (vsMyPowerRatio >= 1.2 && rel.status !== '敵対') {
                    // 自分より1.2倍以上大きい相手には、一気にペナルティを与えます。
                    // ★今回追加：ただし相手が隙だらけの時は「格上だけど今なら勝てる！」と判断してペナルティを半分にします！
                    let powerPenalty = (vsMyPowerRatio - 1.2) * 30;
                    if (isVulnerable) powerPenalty = powerPenalty / 2;
                    prob -= powerPenalty;
                }

                // ★今回追加：その城を攻撃して新しく敵対することによって、自軍の城がすべて囲まれてしまう（糧攻状態になってしまう）リスクを計算する魔法！
                let starvingRiskCount = 0;
                
                // 自分のすべての城をチェックします
                myClanCastles.forEach(c => {
                    if (c.adjacentCastleIds && c.adjacentCastleIds.length > 0) {
                        let isSurrounded = true; // 最初は囲まれていると仮定します
                        
                        for (let adjId of c.adjacentCastleIds) {
                            const adjCastle = this.game.getCastle(adjId);
                            if (!adjCastle) continue;
                            
                            // お隣さんが自分と同じ大名家なら、囲まれていません！
                            if (adjCastle.ownerClan === myClanId) {
                                isSurrounded = false;
                                break;
                            }
                            
                            // お隣さんが敵かどうかを調べます
                            let isEnemy = false;
                            if (adjCastle.ownerClan !== 0) {
                                // 今から攻撃する相手なら、新しい敵になります！
                                if (adjCastle.ownerClan === target.ownerClan) {
                                    isEnemy = true;
                                } else {
                                    // それ以外の相手なら、今の関係を調べます
                                    const adjRel = this.game.getRelation(myClanId, adjCastle.ownerClan);
                                    if (adjRel && adjRel.status === '敵対') {
                                        isEnemy = true;
                                    }
                                }
                            }
                            
                            // もしお隣さんが「敵じゃない（味方、同盟、支配、従属、空き城）」なら、安全な道があるので囲まれていません！
                            if (!isEnemy) {
                                isSurrounded = false;
                                break;
                            }
                        }
                        
                        // 新しく敵対することで、この城が逃げ道なしの包囲状態になってしまうならカウントします
                        if (isSurrounded) {
                            starvingRiskCount++;
                        }
                    }
                });
                
                // 囲まれてしまう城が1つでもある場合、攻撃スコアを大きく下げます（1城につき -50 点）
                // 糧攻状態になるのは致命的なので、ここは隙だらけでもペナルティはそのままにします
                if (starvingRiskCount > 0) {
                    prob -= (starvingRiskCount * 50);
                }
            }
            
            // ★恨みを晴らすため、または執着によるスコアアップ！
            // 1. 「敵対」状態の勢力に対する攻撃ボーナス
            if (rel.status === '敵対') {
                // 敵対している相手への基本ボーナス
                prob += 25; 
                
                // ★修正：無謀な突撃を防ぐため、勝負になる相手（forceRatioが0.4以上）の時だけ迎撃ボーナスを出します！
                if (forceRatio <= 1.0 && forceRatio >= 0.4) {
                    // 相手が強いほど（forceRatioが小さいほど）放置すると危険なのでボーナスを跳ね上げます
                    // 互角（1.0）なら +30点、相手が自分の2倍の兵力（0.5）なら +50点追加されます
                    prob += 30 + (1.0 - forceRatio) * 40; 
                } else if (forceRatio < 1.2 && forceRatio > 1.0) {
                    // 少しだけ弱い相手（1.0〜1.2）への牽制ボーナス
                    prob += 10; 
                }
            }
            // 2. 過去に自領を攻撃してきた大名家への反撃
            if (pastAttackerClans.has(target.ownerClan)) {
                prob += 10; // 攻撃してきた相手には少し攻撃的になります！
            }
            // 3. 元々自分の城だった場所を取り返す
            if (target.lastAttackedOwnerId === myClanId) {
                prob += 15; // 奪われた城を取り返す時はさらに攻撃的になります！
            }
            // 4. 自分から攻撃して、まだ落とせていない城への執着
            if (target.lastAttackerClanId === myClanId && target.ownerClan !== myClanId) {
                prob += 5; // 諦めきれない執着ボーナスとして少しだけ確率を上げます！
            }

            // 5. 相手の殿様が、自分の殿様の「宿敵」だった場合の特別な執着！
            const targetDaimyo = this.game.getClanDaimyo(target.ownerClan);
            let isNemesisDaimyo = false;
            if (targetDaimyo && myDaimyo.nemesisIds && myDaimyo.nemesisIds.includes(targetDaimyo.id)) {
                prob += 10; // 宿敵には容赦しません！
                isNemesisDaimyo = true; // 上限を広げるための印をつけておきます
            }

            // 6. ★追加：敵対勢力が自分の拠点を「２つ以上」奪っている場合の強い執着！
            let isStolenTarget = false;
            if (target.ownerClan !== 0 && stolenCountsByClan[target.ownerClan] >= 2) {
                prob += 10; // 憎き相手への攻撃確率を底上げします！
                
                // さらに、その城自体が取り返すべき「元・自領」なら、全力で狙いに行きます！
                if (pastOwnedSet.has(target.id)) {
                    prob += 20; 
                    isStolenTarget = true; // 上限を広げるための印をつけておきます
                }
            }

            // 7. ★追加：「取った拠点を同じ勢力に取り返された」泥沼拠点の執着緩和！
            if (target.ownerClan !== 0 && pastOwnedSet.has(target.id)) {
                // 今の持ち主（相手）の「過去の所持記憶」を調べます
                if (this.game.aiOperationManager && this.game.aiOperationManager.historyOwnedCastles && this.game.aiOperationManager.historyOwnedCastles[target.ownerClan]) {
                    const targetHistory = this.game.aiOperationManager.historyOwnedCastles[target.ownerClan];
                    // 相手の記憶にもこのお城がある（＝お互いに奪い合ったことがある）場合
                    const isMutual = targetHistory.some(list => list.includes(target.id));
                    if (isMutual) {
                        prob -= 15; // お互いに過去、所持していた事のある拠点に対してスコアを減らします
                    }
                }
            }
            
            // ★国や地方を統一するための執着ボーナス！
            // もしターゲットの城がある国が、自分が持っているけどまだ統一していない国だったら
            if (ununifiedProvIds.has(target.provinceId)) {
                prob += 5; // 国を統一するために少し頑張ります！
            } else {
                // 国は違うけど、ターゲットの城がある地方が、自分が持っているけどまだ統一していない地方だったら
                const tgtProv = this.game.getProvince(target.provinceId);
                if (tgtProv && ununifiedRegionIds.has(tgtProv.regionId)) {
                    prob += 5; // 地方を統一するためにちょっと頑張ります！
                }
            }

            // ★追加：上洛ルート（二条城・槇島城への最短経路）に乗っている城なら、大幅にスコアを上げる！
            if (jorakuTargets.has(target.id)) {
                prob += 30; // 上洛を最優先にして歴史イベントを起こしやすくします！
            }

            // ★保守的・隠居気質な大名の「外に出たくない」ペナルティ！
            if (myDaimyo.personality === 'conservative' || myDaimyo.personality === 'hermit') {
                // 自分が１つもお城を持っていない「国」への攻撃は気が進まない
                if (!myProvIds.has(target.provinceId)) {
                    prob -= 5;
                }
                // 自分が１つもお城を持っていない「地方」への攻撃はさらに気が進まない
                const tgtProv = this.game.getProvince(target.provinceId);
                if (tgtProv && !myRegionIds.has(tgtProv.regionId)) {
                    prob -= 5;
                }
            }

            // ★今回追加：四国と九州をまたぐ攻撃のスコアを大きく下げる魔法！
            // 中国地方のIDは7、四国地方のIDは8、九州地方のIDは9です。
            let targetRegionId = 0;
            const targetProv = this.game.getProvince(target.provinceId);
            if (targetProv) {
                targetRegionId = targetProv.regionId;
            }
            if ((leaderRegionId === 8 && targetRegionId === 9) || (leaderRegionId === 9 && targetRegionId === 8)) {
                prob -= 30; // 四国と九州の間の海越え攻撃はペナルティを与えて後回しにします！
            }
            // ★追加：中国と四国をまたぐ攻撃のスコアを下げる魔法！
            if ((leaderRegionId === 7 && targetRegionId === 8) || (leaderRegionId === 8 && targetRegionId === 7)) {
                prob -= 15; // 中国と四国の間の海越え攻撃もペナルティを与えますが、四国九州間よりは軽くします！
            }
            
            // 攻撃確率の最大値設定
            let maxProb = rel.status === '敵対' ? 60 : 10;
            if (isNemesisDaimyo) {
                maxProb += 10; // 宿敵の場合は、上限を10%広げて攻めやすくします！
            }
            if (jorakuTargets.has(target.id)) {
                maxProb += 30; // 上洛ルートの場合は上限を大きく広げます！
            }
            if (isStolenTarget) {
                maxProb += 20; // 失地回復の場合は、上限を大きく広げて目標に選ばれやすくします！
            }
            
            // 最大値の適用
            prob = Math.min(prob, maxProb);

            // ★最終調整用。すべての引き算が終わった最後に×９０％の魔法をかけます！
            if (prob > 0) {
                prob = prob * 0.9;
            }

            // 最小値の適用（マイナスになっていたらゼロにします）
            prob = Math.max(0, prob); 

            // ★大魔法：空き城、または「敵対関係ではない勢力」の時は、攻め込むハードルを3倍（確率を3分の1）にします！
            if (target.ownerClan === 0 || rel.status !== '敵対') {
                prob = prob / 3;
            }

            if (prob > highestProb) {
                highestProb = prob;
                bestTarget = target;
            }
        });

        // ★ここを書き換え！：確率のサイコロは後で振るので、ここでは「一番良かった目標」と「その点数(score)」を報告します！
        if (bestTarget) {
            return { action: 'attack', target: bestTarget, sendSoldiers: sendSoldiers, sendRice: requiredRice, score: highestProb };
        }
        
        // 攻撃する相手がいなかったら、おとなしく諦めます
        return null;
    }

    // ★変更：一番最後に「operation = null」を追加して、作戦のメモを受け取れるようにします
    executeAttack(source, target, general, sendSoldiers, sendRice, operation = null) {
        if (sendSoldiers <= 0 || sendRice <= 0) {
            this.game.finishTurn();
            return;
        }
        
        // 城にいる武将（自勢力で活動中の武将）を集めます
        const bushos = this.game.getCastleBushos(source.id).filter(b => b.clan === source.ownerClan && window.BushoStatusRules.isActive(b));
        
        // ★ここから追加・書き換え：戦闘力による足切りと、智謀による「見誤り」の魔法！
        // 1. 城主(general)の智謀によって、どれくらい戦闘力を見誤るか（誤差）を決めます
        let evaluatorInt = general.intelligence;
        let maxError = 0;
        if (evaluatorInt <= 50) {
            maxError = 0.2; // 智謀50以下なら最大2割（±20%）見誤る
        } else if (evaluatorInt >= 95) {
            maxError = 0;   // 智謀95以上なら正確（誤差なし）
        } else {
            // 智謀51〜94の間は、グラフの一直線のように少しずつ誤差が減っていきます
            maxError = 0.2 * (95 - evaluatorInt) / 45;
        }

        // 2. 各武将の戦闘力を見積もります
        const evaluatedBushos = bushos.map(b => {
            // 本当の戦闘力 ＝（統率 ＋ 武力 ＋ 智謀）÷ ２
            const truePower = (b.leadership + b.strength + b.intelligence) / 2;
            
            // とりあえず最初は「本当の強さ」をセットしておきます
            let perceivedPower = truePower;
            
            // ★追加：もし自分自身（城主）じゃなかったら、勘違いの計算をします！
            if (b.id !== general.id) {
                // 誤差のサイコロを振ります（1.0を中心に、-maxError から +maxError まで揺れます）
                const errorRate = 1.0 + (Math.random() - 0.5) * 2 * maxError;
                // 城主が「このくらい強いだろう」と思い込んでいる戦闘力
                perceivedPower = truePower * errorRate;
            }
            
            return { busho: b, perceivedPower: perceivedPower };
        });

        // 3. 見積もった戦闘力の中で、一番高い数値を基準（エース）にします
        let maxPower = 0;
        evaluatedBushos.forEach(eb => {
            if (eb.perceivedPower > maxPower) {
                maxPower = eb.perceivedPower;
            }
        });

        // 4. 一番強い武将の「7割以下」の武将はお留守番させます（足切り）
        const threshold = maxPower * 0.7;
        let sorted = evaluatedBushos 
            .filter(eb => eb.perceivedPower > threshold) // 7割より大きい人だけ残す
            .sort((a, b) => b.perceivedPower - a.perceivedPower) // 見積もり戦闘力が強い順に並べる
            .map(eb => eb.busho); // ★スライスは後回し！魔法の箱から武将データだけを取り出す

        // ★追加：海戦が予想される場合、操船スキルが高い武将を確保する
        const isSeaBattle = MapGraphService.isSeaRoute(this.game, source, target, source.ownerClan);

        if (isSeaBattle && sorted.length > 0) {
            let general = sorted[0];
            let genMarLvl = (typeof SkillManager !== 'undefined') ? SkillManager.getMaritimeAptitudeLevel(general) : 0;
            let bestNav = null;
            let bestNavLvl = genMarLvl;

            // 評価した全員の中から（足切りされた武将も含めて）最高の航海士を探す
            evaluatedBushos.forEach(eb => {
                if (eb.busho.id === general.id) return;
                let lvl = (typeof SkillManager !== 'undefined') ? SkillManager.getMaritimeAptitudeLevel(eb.busho) : 0;
                if (lvl > bestNavLvl) {
                    bestNavLvl = lvl;
                    bestNav = eb.busho;
                }
            });

            // 操船が上手い人がいたら、総大将のすぐ後ろにねじ込みます！
            if (bestNav) {
                sorted = sorted.filter(b => b.id !== bestNav.id);
                sorted.splice(1, 0, bestNav);
            }
        }

        // ここで最大5人まで選びます
        sorted = sorted.slice(0, 5);

        // ★追加：イベント作戦で「絶対にこの人を大将にする！」と指名されていたら、一番前にねじ込みます
        if (operation && operation.designatedCommanderId) {
            const commander = bushos.find(b => b.id === operation.designatedCommanderId);
            if (commander) {
                // すでにリストに入っていれば一度取り除いてから、先頭（0番目）に割り込ませます
                sorted = sorted.filter(b => b.id !== operation.designatedCommanderId);
                sorted.unshift(commander);
                
                // もし割り込ませた結果、5人を超えてしまったら最後尾の人を外します
                if (sorted.length > 5) {
                    sorted = sorted.slice(0, 5);
                }
            }
        }

        // 援軍を探す処理へバトンタッチします
        const sendHorses = (source.horses || 0) < sendSoldiers * 0.2 ? 0 : (source.horses || 0);
        const sendGuns = (source.guns || 0) < sendSoldiers * 0.2 ? 0 : (source.guns || 0);
        this.game.warPreparationController.checkReinforcementAndStartWar(source, target.id, sorted, sendSoldiers, sendRice, sendHorses, sendGuns);
        
        // （「待つ魔法」は消しました！あとはwar.jsが最後までやってくれます）
    }

    executeKunishuSubjugateAI(sourceCastle, kunishu, general, sendSoldiers, sendRice) {
        if (sendSoldiers <= 0 || sendRice <= 0) {
            this.game.finishTurn();
            return;
        }
        
        const bushos = this.game.getCastleBushos(sourceCastle.id).filter(b => b.clan === sourceCastle.ownerClan && window.BushoStatusRules.isActive(b));
        
        let evaluatorInt = general.intelligence;
        let maxError = 0;
        if (evaluatorInt <= 50) {
            maxError = 0.2;
        } else if (evaluatorInt >= 95) {
            maxError = 0;
        } else {
            maxError = 0.2 * (95 - evaluatorInt) / 45;
        }

        const evaluatedBushos = bushos.map(b => {
            const truePower = (b.leadership + b.strength + b.intelligence) / 2;
            let perceivedPower = truePower;
            if (b.id !== general.id) {
                const errorRate = 1.0 + (Math.random() - 0.5) * 2 * maxError;
                perceivedPower = truePower * errorRate;
            }
            return { busho: b, perceivedPower: perceivedPower };
        });

        let maxPower = 0;
        evaluatedBushos.forEach(eb => {
            if (eb.perceivedPower > maxPower) {
                maxPower = eb.perceivedPower;
            }
        });

        const threshold = maxPower * 0.7;
        let sorted = evaluatedBushos
            .filter(eb => eb.perceivedPower > threshold)
            .sort((a, b) => b.perceivedPower - a.perceivedPower)
            .map(eb => eb.busho); // ★ここもスライスを後回しにします！

        // ★追加：諸勢力との戦いが海戦になる場合、操船スキルが高い武将を確保する
        let isSeaBattle = false;
        const targetCastle = this.game.getCastle(kunishu.castleId);
        if (targetCastle) {
            isSeaBattle = MapGraphService.isSeaRoute(this.game, sourceCastle, targetCastle, sourceCastle.ownerClan);
        }

        if (isSeaBattle && sorted.length > 0) {
            let general = sorted[0];
            let genMarLvl = (typeof SkillManager !== 'undefined') ? SkillManager.getMaritimeAptitudeLevel(general) : 0;
            let bestNav = null;
            let bestNavLvl = genMarLvl;

            evaluatedBushos.forEach(eb => {
                if (eb.busho.id === general.id) return;
                let lvl = (typeof SkillManager !== 'undefined') ? SkillManager.getMaritimeAptitudeLevel(eb.busho) : 0;
                if (lvl > bestNavLvl) {
                    bestNavLvl = lvl;
                    bestNav = eb.busho;
                }
            });

            if (bestNav) {
                sorted = sorted.filter(b => b.id !== bestNav.id);
                sorted.splice(1, 0, bestNav);
            }
        }

        sorted = sorted.slice(0, 5);

        const sendHorses = (sourceCastle.horses || 0) < sendSoldiers * 0.2 ? 0 : (sourceCastle.horses || 0);
        const sendGuns = (sourceCastle.guns || 0) < sendSoldiers * 0.2 ? 0 : (sourceCastle.guns || 0);
        
        // ★ kunishuSystem（諸勢力の専門部署）の executeKunishuSubjugate を呼び出します！
        this.game.kunishuSystem.executeKunishuSubjugate(sourceCastle, Number(kunishu.castleId), sorted.map(b => b.id), sendSoldiers, sendRice, sendHorses, sendGuns, kunishu);
    }
    
    async execInternalAffairs(castle, castellan, mods, smartness) {
        if (this.game.writeAIDiagnostic) this.game.writeAIDiagnostic(castle, 'internal:start');

        // ① 大名を取得します（全体で使う用）
        const daimyo = this.game.getClanDaimyo(castle.ownerClan) || castellan;

        // ★追加：行動回数の計算基準となる「リーダー（直轄なら大名、それ以外なら国主）」と「軍師」を決めます！
        let leader = daimyo;

        if (castle.legionId !== 0) {
            // 軍団所属城の場合
            const legion = this.game.legions ? this.game.legions.find(l => l.clanId === castle.ownerClan && l.legionNo === castle.legionId) : null;
            if (legion && legion.commanderId) {
                const commander = this.game.getBusho(legion.commanderId);
                if (commander) {
                    leader = commander;
                }
            }
        }

        // ★修正：軍師は大名家（勢力）に1人だけなので、軍団の場所に関係なく勢力全体から探し出します！
        const gunshi = this.game.getClanGunshi(castle.ownerClan);

        // ★追加：リーダーと軍師の能力から、AIが「目指すべき最大値（キャップ）」を計算する魔法！
        // リーダーは各能力、軍師は智謀で計算し、高い方を採用します（50 + 能力/2）
        const gunshiInt = gunshi ? gunshi.intelligence : 0;
        const gunshiCap = Math.floor(50 + (gunshiInt / 2));

        // ★修正：能力が100を超えた時、永遠に「足りない」と勘違いして内政ループするのを防ぐため、本来の最大値でストッパーをかけます！
        const targetMaxLoyalty = Math.min(castle.maxPeoplesLoyalty || 100, Math.max(Math.floor(50 + (leader.politics / 2)), gunshiCap));
        const normalTrainingCap = window.WarParams.Military.MaxTrainingNormal;
        const normalMoraleCap = window.WarParams.Military.MaxMoraleNormal;
        const castleTrainingCap = Number.isFinite(Number(castle.maxTraining)) ? Number(castle.maxTraining) : normalTrainingCap;
        const targetMaxTraining = Math.min(castleTrainingCap, normalTrainingCap, Math.max(Math.floor(50 + (leader.strength / 2)), gunshiCap));
        const targetMaxMorale = Math.min(normalMoraleCap, Math.max(Math.floor(50 + (leader.leadership / 2)), gunshiCap));

        // ★魔法の改善：最初にお城の繋がりを1回だけ全部調べて、リストを作ります！
        const reachableMyCastles = [];
        const visitedCastles = new Set();
        const searchQueue = [castle];
        let searchHead = 0;
        visitedCastles.add(castle.id);

        while (searchHead < searchQueue.length) {
            const current = searchQueue[searchHead++];
            // 自分のお城もリストに入れておきます（後で便利です）
            reachableMyCastles.push(current);

            const adjMyCastles = [];
            if (current.adjacentCastleIds) {
                current.adjacentCastleIds.forEach(adjId => {
                    const c = this.game.getCastle(adjId);
                    // ★修正：直轄（軍団ID0）なら、他軍団のお城ともネットワークを繋げて物資移動などができるようにします！
                    if (c && c.ownerClan === castle.ownerClan && (c.legionId === castle.legionId || castle.legionId === 0) && !visitedCastles.has(c.id)) {
                        adjMyCastles.push(c);
                    }
                });
            }

            for (const n of adjMyCastles) {
                visitedCastles.add(n.id);
                searchQueue.push(n);
            }
        }

        // ★リーダーの城と「自領で地続き」で繋がっているかをリストから一瞬で判断します！
        let isConnected = false;
        if (!leader.castleId || leader.castleId === castle.id) {
            isConnected = true;
        } else {
            // リストの中にリーダーのお城があるか探すだけですぐ分かります！
            isConnected = reachableMyCastles.some(c => c.id === leader.castleId);
        }

        // ② 行動回数の計算
        let baseAP = 0;
        if (isConnected) {
            // リーダーと地続きの城：「(城主内政＋城主魅力＋リーダー内政＋リーダー魅力) ÷ 2」
            baseAP = Math.floor((castellan.politics + castellan.charm + leader.politics + leader.charm) / 2);
        } else {
            // 飛び地（地続きではない）城：「(城主内政＋城主魅力) ÷ 2」
            baseAP = Math.floor((castellan.politics + castellan.charm) / 2);
        }

        // 最低1回、40ごとに+1回
        let maxActions = 1 + Math.floor(baseAP / 40);

        // お城にいる動ける武将（自分の大名家で、活動中の人）をリストアップします
        let availableBushos = this.game.getCastleBushos(castle.id).filter(b => 
            !b.isActionDone && b.clan === castle.ownerClan && window.BushoStatusRules.isActive(b)
        );

        // まず、お城に動ける武将がいるか確認します。誰もいなければ何もできません
        if (availableBushos.length === 0) return;

        // 武将の人数より多くは行動できません
        maxActions = Math.min(maxActions, availableBushos.length);

        // やるべき回数が0回になったり、武将がいなかったらおしまいです
        if (maxActions <= 0) return;

        // 城主の性格による好みの計算（相対値で最大±20%のブレ）
        const isConservative = castellan.personality === 'conservative';
        const isAggressive = castellan.personality === 'aggressive';

        // お隣の敵のお城を調べておきます（徴兵の判断用）
        const neighbors = [];
        if (castle.adjacentCastleIds) {
            castle.adjacentCastleIds.forEach(adjId => {
                const c = this.game.getCastle(adjId);
                if (c && c.ownerClan !== 0 && c.ownerClan !== castle.ownerClan) {
                    neighbors.push(c);
                }
            });
        }

        // ★追加：取引の回数を数えるカウンター
        let tradeCount = 0;
        
        // ★追加：行動回数消費なしの特別計略を行ったかのフラグ
        let hasBonusSabotageUsed = false;

        // ★高速化：今の国の兵糧の単価（相場）を一元化された魔法で取得します！
        const baseRiceRate = EconomyRules.getBaseRiceRate(castle, this.game.provinces);
        const sellActualRate = EconomyRules.getRiceActualRate('sell_rice', castle, this.game.provinces, this.game).actualRate;
        const buyActualRate  = EconomyRules.getRiceActualRate('buy_rice', castle, this.game.provinces, this.game).actualRate;

        // ★追加：大雪が降っている国（provinceId）のリストを作ります！
        const heavySnowProvIds = new Set();
        if (this.game.provinces) {
            this.game.provinces.forEach(p => {
                if (p.statusEffects && p.statusEffects.includes('heavySnow')) {
                    heavySnowProvIds.add(p.id);
                }
            });
        }
        const isSrcHeavySnow = heavySnowProvIds.has(castle.provinceId);

        // 装備産地の有無は、この城の内政行動ループ中に変わらない勢力所有地だけで決まります。
        // 行動候補を作るたびに全国/自勢力拠点を再走査せず、1回だけ同じ答えを確定します。
        const clanCastlesForEquipment = this.game.getClanCastles(castle.ownerClan);
        const hasGunCastleAI = clanCastlesForEquipment.some(c => [33, 42, 185, 186].includes(c.id));
        // 軍馬産地は旧実装が ownerClan の厳密一致で全国を見ていたため、候補集合は狭めません。
        // 全件走査そのものを行動ループ外へ出し、旧条件をそのまま1回だけ評価します。
        const hasHorseCastleAI = this.game.castles.some(c => {
            if (c.ownerClan !== castle.ownerClan) return false;
            if (c.id === 157) return true;
            if ([15, 36, 61, 62, 63, 64, 68].includes(c.provinceId)) return true;
            const prov = this.game.getProvince(c.provinceId);
            return !!prov && (prov.regionId === 1 || prov.regionId === 3);
        });
        
        // ③ 決められた回数だけ、行動を繰り返します！
        for (let step = 0; step < maxActions; step++) {
            // ★追加：スマホの強制リロード対策。行動を1回考えるごとに一瞬「息継ぎ」をして、ブラウザのフリーズを防ぎます！
            await new Promise(resolve => setTimeout(resolve, 0));

            // ★毎回、AIが安全に使えるお金（給金と余裕分を引いた額）を計算します！
            const availableGold = EconomyRules.calcAvailableGoldForAI(castle, this.game);

            // まだ動ける武将を再確認します
            availableBushos = this.game.getCastleBushos(castle.id).filter(b => 
                !b.isActionDone && b.clan === castle.ownerClan && window.BushoStatusRules.isActive(b)
            );

            // --- 候補となる行動の点数（スコア）をつける表を作ります ---
            let actions = [];

            // ★追加：城主の智謀によって、城の状況を「十分足りている」と高めに見誤る魔法です！
            let maxError = 0;
            if (castellan.intelligence <= 50) {
                maxError = 0.3; // 智謀50以下で最大30%の誤差
            } else if (castellan.intelligence >= 95) {
                maxError = 0;   // 智謀95以上で誤差なし
            } else {
                maxError = 0.3 * (95 - castellan.intelligence) / 45; // 51〜94の間は線形で減らす
            }
            
            // サイコロを振って「勘違いして高く見積もる」分を計算します
            const errDefense = castle.maxDefense * (Math.random() * maxError);
            const errLoyalty = 100 * (Math.random() * maxError);
            const errTraining = 100 * (Math.random() * maxError);
            const errMorale = 100 * (Math.random() * maxError);
            
            // 実際の数値に「勘違い分」を足した「AIの思い込みステータス」を作ります
            const perceivedDefense = Math.min(castle.maxDefense, castle.defense + errDefense);
            const perceivedLoyalty = Math.min(100, castle.peoplesLoyalty + errLoyalty);
            const perceivedTraining = Math.min(window.WarParams.Military.MaxTrainingNormal, castle.training + errTraining);
            const perceivedMorale = Math.min(window.WarParams.Military.MaxMoraleNormal, castle.morale + errMorale);

            // ★追加：お金や兵糧の目標値を計算するための「基準兵数」を決めます（兵士0でも活動できるように最低2000を保証します）
            const baseSoldiers = Math.max(2000, castle.soldiers);

            // 1. 城壁修復（最大値の1/4以下なら超優先！）
            const repairBaseScore = AIDomesticPriorityRules.calcRepairBaseScore(castle, perceivedDefense);
            if (repairBaseScore !== null) {
                const score = repairBaseScore;
                actions.push({ type: 'repair', stat: 'politics', score: score, cost: window.MainParams.CommandCost.Repair });
            }

            // 2. 施し（目標の最大値未満なら優先！）
            if (perceivedLoyalty < targetMaxLoyalty) {
                let score = 0;
                // 目標の7割以下なら緊急事態として高いスコアをつけます
                if (perceivedLoyalty <= targetMaxLoyalty * 0.7) {
                    score = 120;
                } else {
                    // ★修正：固定の100ではなく、目標値からどれだけ足りないかでスコアを出します
                    score = (targetMaxLoyalty - perceivedLoyalty) * 2;
                }
                actions.push({ type: 'charity', stat: 'charm', score: score, cost: window.MainParams.CommandCost.Charity }); 
            }

            // ★変更：鉄砲と軍馬の購入（大名の革新性、自家の装備比率、城の兵士数を元に点数を作ります）
            let canBuyEq = false;
            let isMainBase = false; // ★追加：ここが「特定の城」かどうかを覚えるシールです
            const clanOpsEq = this.game.aiOperationManager.operations[castle.ownerClan];
            const myOpEq = clanOpsEq ? clanOpsEq[castle.legionId] : null;
            if (myOpEq && myOpEq.type === '攻撃') {
                if (castle.id === myOpEq.stagingBase || castle.id === myOpEq.supportBase) {
                    isMainBase = true; // 出撃・援軍拠点なら特定の城のシールを貼ります
                }
            } else {
                if (daimyo && daimyo.castleId === castle.id) {
                    isMainBase = true; // 大名居城なら特定の城のシールを貼ります
                }
            }
            
            // ★追加：特定の城ならいつでも許可し、それ以外のお城では「20%の確率（サイコロ）」で特別に許可します！
            if (isMainBase || Math.random() < 0.2) {
                canBuyEq = true;
            }

            if (canBuyEq && availableGold >= 500 && tradeCount < 5) {
                // ① 自領で「道が繋がっている範囲」のお城にある、軍馬・鉄砲・兵士の合計を数えます（飛び地対策）
                // ★さっき作ったリストを使って、パパッと数えちゃいます！
                let totalHorses = 0;
                let totalGuns = 0;
                let totalSoldiers = 0;

                for (const current of reachableMyCastles) {
                    totalHorses += (current.horses || 0);
                    totalGuns += (current.guns || 0);
                    totalSoldiers += (current.soldiers || 0);
                }
                
                // 全体の数から、軍馬と鉄砲の「割合（0〜1）」を計算します
                const totalEq = totalHorses + totalGuns;
                const horseRatio = totalEq > 0 ? (totalHorses / totalEq) : 0.5;
                const gunRatio = totalEq > 0 ? (totalGuns / totalEq) : 0.5;

                // ② 大名の「革新性」が、基準の50からどれくらい離れているか計算します
                const innoDiff = daimyo.innovation - 50;

                // ③ 城の兵士数を「目標の数」として、今どれくらい持っているか（充足率）を調べます
                const targetAmount = Math.max(1, castle.soldiers); 
                const horseFillRate = (castle.horses || 0) / targetAmount;
                const gunFillRate = (castle.guns || 0) / targetAmount;

                // ④ いよいよ点数（スコア）の計算です！やや馬を優先するため、馬は「13点」、鉄砲は「10点」からスタートします
                let horseScore = 13 + ((0.5 - horseFillRate) * 10);
                let gunScore = 10 + ((0.5 - gunFillRate) * 10);

                // 革新性による点数：高いほど鉄砲が、低いほど軍馬がプラスになります（最大で±5点）
                horseScore -= (innoDiff * 0.1);
                gunScore += (innoDiff * 0.1);

                // 比率による点数：大名家全体で多く持っている方を優先します（最大+5点）
                horseScore += (horseRatio * 5);
                gunScore += (gunRatio * 5);

                // ★変更：大名家が鉄砲産地の城（石山御坊:33、雑賀城:42、赤尾木城:185、今浜城:186）を1つでも持っているなら、鉄砲を少し優先して騎馬を控えます
                if (hasGunCastleAI) {
                    gunScore += 3;
                    horseScore -= 3;
                }

                // ★追加：大名家が軍馬産地の城を持っているなら、軍馬を少し優先して鉄砲を控えます
                if (hasHorseCastleAI) {
                    horseScore += 3;
                    gunScore -= 3;
                }

                // 最後にサイコロを振って、少しだけ気まぐれな気持ち（0〜3点）を足し算します
                horseScore += Math.random() * 3;
                gunScore += Math.random() * 3;

                // 目安（兵士数）の1倍以上持っていたら、もう十分なので点数をガクッと下げて買わないようにします
                if (horseFillRate >= 1.0) horseScore -= 50;
                if (gunFillRate >= 1.0) gunScore -= 50;

                // ★追加：繋がっている範囲全体で、兵士数より多く持っている場合は無駄遣いなので絶対に買いません
                if (totalHorses >= totalSoldiers) horseScore = 0;
                if (totalGuns >= totalSoldiers) gunScore = 0;

                // ★追加：AIも1542年以前は鉄砲を買えないようにスコアを0にします！
                if (this.game.year <= 1542) gunScore = 0;

                if (gunScore >= 5) {
                    actions.push({ type: 'buy_gun', stat: 'politics', score: gunScore, cost: 500 });
                }
                if (horseScore >= 5) {
                    actions.push({ type: 'buy_horse', stat: 'politics', score: horseScore, cost: 500 });
                }
            }
            
            // ★追加：朝廷への貢物（金が5000以上で余裕がある時、たまに行います）
            if (availableGold >= 5000) {
                let tributeGold = 500;
                if (availableGold >= 10000) {
                    tributeGold = 1500;
                } else if (availableGold >= 7500) {
                    tributeGold = 1000;
                }
                // たまに行うように、鉄砲の購入と同じ15点にしておきます。外交が得意な人を向かわせます。
                actions.push({ type: 'tribute', stat: 'diplomacy', score: 15, cost: tributeGold });
            }

            // 3. 徴兵（お金と兵糧の余裕を見ながら、計画的に集めます！）
            // ★改善：人口が少なすぎるお城（3000人未満）は可哀想なので徴兵の対象から外します！
            const draftableCastlesPlan = reachableMyCastles.filter(c => c.population >= 3000);
            
            // 対象になるお城の「総人口（負担の重さ込み）」を計算します
            let totalWeightedPopPlan = 0;
            let actualTotalPopPlan = 0;
            draftableCastlesPlan.forEach(c => {
                actualTotalPopPlan += c.population;
                // 徴兵を実行するお城（自分のお城）は、負担を「1.5倍」重くして計算します
                let weight = (c.id === castle.id) ? 1.5 : 1.0;
                totalWeightedPopPlan += Math.floor(c.population * weight);
            });

            // 徴兵できるお城が1つでもあれば計画を立てます
            if (draftableCastlesPlan.length > 0 && totalWeightedPopPlan > 1000) {
                // ===== 基本パラメータ =====
                const targetRice = Math.floor(baseSoldiers * 2.5);
                // ★修正：最低残す兵糧ラインを2.5から2.0に下げて、徴兵しやすくします
                const safeRice = Math.floor(baseSoldiers * 2.0);
                // ★修正：金銭感覚をさらに緩く「1.0」に下げて、お財布の紐を緩くします！
                const targetGold = Math.floor(baseSoldiers * 1.0);
                
                // ★変更：およそ1人集めるのにかかるお金（単価）を、GameSystemに計算してもらいます！
                const unitPrice = DomesticRules.calcDraftUnitPrice(castellan, castle.peoplesLoyalty, castle.population);
                
                // ===== 余力計算 =====
                const surplusGold = Math.max(0, availableGold - targetGold);
                const surplusRice = Math.max(0, castle.rice - targetRice);

                // ===== 雇用可能数 =====
                const affordByGold = Math.floor(surplusGold / unitPrice);
                const affordByRice = Math.floor(surplusRice / 3.5);
                
                // 実際の雇用上限（お金と兵糧、どちらか少ない方に合わせます）
                let maxDraft = Math.max(0, Math.min(affordByGold, affordByRice));
                
                // ネットワーク全体の人口（重み付けなしの実際の総人口）も超えられないようにします
                maxDraft = Math.min(maxDraft, actualTotalPopPlan);

                // ===== 目標兵力の計算 =====
                // 自分の軍団全体の「総石高」を調べます！
                const myCastles = this.game.getClanCastles(castle.ownerClan).filter(c => c.legionId === castle.legionId);
                const totalKokudaka = myCastles.reduce((sum, c) => sum + c.kokudaka, 0);

                // 石高をベースにした新しい計算式で、目標にする兵士の数を決めます
                const kokudakaBonus = 1 + (Math.sqrt(totalKokudaka) / 100) + (Math.sqrt(castle.kokudaka) / 10);
                let targetSoldiers = Math.floor(2000 + (castle.kokudaka / 4) * kokudakaBonus);

                // ★追加：攻撃作戦の立案に必要な兵士数（√石高×175）を確実に満たせるように目標を引き上げます！
                // 出撃に必要な最低ラインに、少しのお留守番の余裕（1.2倍）を持たせます
                const requiredForAttack = Math.floor(Math.sqrt(castle.kokudaka) * 175);
                if (targetSoldiers < requiredForAttack * 1.2) {
                    targetSoldiers = Math.floor(requiredForAttack * 1.2);
                }

                // 周りの敵を調べて、もし敵の方がずっと強かったら目標を引き上げます
                let enemyMaxSoldiers = 0;
                neighbors.forEach(n => {
                    if (n.soldiers > enemyMaxSoldiers) enemyMaxSoldiers = n.soldiers;
                });
                targetSoldiers = Math.max(targetSoldiers, Math.floor(enemyMaxSoldiers * 1.2));
                
                // 「最低でもこれだけは急いで集めたい！」という非常事態のラインを、目標の3分の1にします
                const minTarget = Math.floor(targetSoldiers / 3);

                // ===== 雇用スコア =====
                const shortSoldiers = Math.max(0, targetSoldiers - castle.soldiers);
                const shortRatio = shortSoldiers / (targetSoldiers + 1);

                // 変更：そのまま掛け算するとすぐに点数が下がるので、ルート（Math.sqrt）の魔法で
                // 減り方を緩やかにします。これで目標の9割近くまで積極的に集めるようになります！
                let scoreDraft = 150 * Math.sqrt(shortRatio);
                
                // ===== 安全制御 =====
                if (castle.rice < safeRice) {
                    scoreDraft = 0; // 兵糧が危ないならやめる
                }
                if (availableGold < targetGold) {
                    scoreDraft = 0; // お金が危ないならやめる
                }
                
                // 兵士が最低ライン(目標の1/3)未満の時は、大ピンチなのでスコアを底上げしてあげます！
                if (scoreDraft > 0 && castle.soldiers < minTarget) {
                    scoreDraft += 50;
                }

                // スコアが十分にあり、1人以上集められるなら候補に入れます
                if (scoreDraft > 50 && maxDraft > 0) {
                    // 一気に集めすぎないように、今の兵士の3割くらい、または最低でも500人くらいで調整します
                    let plannedDraft = Math.min(maxDraft, Math.max(500, castle.soldiers * 0.3));
                    
                    // 使う予定のお金をメモしておきます
                    let plannedCost = Math.ceil(plannedDraft * unitPrice);

                    actions.push({ type: 'draft', stat: 'leadership', score: scoreDraft, cost: plannedCost, plannedDraft: plannedDraft }); 
                }
            }

            // 4. 訓練
            if (perceivedTraining < targetMaxTraining) {
                // ★修正：固定の100ではなく、目標値からどれだけ足りないかでスコアを出します
                let score = targetMaxTraining - perceivedTraining;
                actions.push({ type: 'training', stat: 'leadership', score: score, cost: 0 }); 
            }

            // 5. 兵施し（士気）
            if (perceivedMorale < targetMaxMorale) {
                // ★修正：固定の100ではなく、目標値からどれだけ足りないかでスコアを出します
                let score = targetMaxMorale - perceivedMorale;
                actions.push({ type: 'soldier_charity', stat: 'leadership', score: score, cost: window.MainParams.CommandCost.SoldierCharity }); 
            }

            // 6. 石高開発 / 7. 鉱山開発
            // 面談の「方針について」と同じ専門Rulesから基礎スコアを受け取る。
            const farmBaseScore = AIDomesticPriorityRules.calcFarmBaseScore(this.game, castle);
            if (farmBaseScore !== null) {
                actions.push({ type: 'farm', stat: 'politics', score: farmBaseScore, cost: window.MainParams.CommandCost.Farm });
            }
            const commerceBaseScore = AIDomesticPriorityRules.calcCommerceBaseScore(this.game, castle, daimyo);
            if (commerceBaseScore !== null) {
                actions.push({ type: 'commerce', stat: 'politics', score: commerceBaseScore, cost: window.MainParams.CommandCost.Commerce });
            }

            // --- 性格による点数の調整 ---
            const clanOps = this.game.aiOperationManager.operations[castle.ownerClan];
            const myOp = clanOps ? clanOps[castle.legionId] : null;
            const isPreparingAttack = (myOp && myOp.type === '攻撃');

            actions.forEach(a => {
                if (['farm', 'commerce'].includes(a.type)) {
                    // 石高・鉱山は専門Rulesで性格と作戦状態まで同じ式を使う。
                    a.score = AIDomesticPriorityRules.applyContext(a.score, a.type, castle, castellan, isPreparingAttack);
                } else {
                    if (isConservative && ['repair', 'charity'].includes(a.type)) {
                        a.score *= 1.2; 
                    }
                    if (isAggressive && ['draft', 'training', 'soldier_charity'].includes(a.type)) {
                        a.score *= 1.2; 
                    }

                    // ★追加：攻撃準備期間中は、内政の優先度を切り替えて軍事に集中します！
                    if (isPreparingAttack) {
                        if (['repair', 'charity'].includes(a.type)) {
                            let isEmergency = false;
                            if (a.type === 'repair' && castle.defense <= castle.maxDefense / 4) isEmergency = true;
                            if (a.type === 'charity' && castle.peoplesLoyalty <= 70) isEmergency = true;
                            if (!isEmergency) a.score /= 2;
                        }
                        // 徴兵、訓練、士気、馬・鉄砲購入の優先度を倍に
                        if (['draft', 'training', 'soldier_charity', 'buy_gun', 'buy_horse'].includes(a.type)) {
                            a.score *= 2;
                        }
                    }
                }

                a.score *= (0.9 + Math.random() * 0.2);
            });

            // 8. 兵糧売却の判断
            // ★修正：無駄売りを防ぐため、判断基準を3.0倍にし、残すラインを徴兵基準と同じ2.5倍にします
            const sellTargetRice = Math.floor(baseSoldiers * 3.0);
            const sellSafeRice = Math.floor(baseSoldiers * 2.5);
            // 変更：徴兵の金銭感覚と合わせるため、ここも「1.5」に下げます！
            // これで、無駄にお米を売りすぎるのを防ぎます。
            const targetGold = Math.floor(baseSoldiers * 1.5);
            
            const shortageGold = Math.max(0, targetGold - castle.gold);
            const surplusRice = Math.max(0, castle.rice - sellTargetRice);
            
            // 兵士が0人の時などにエラーにならないよう、分母に+1をしておきます
            const surplusRate = surplusRice / (sellTargetRice + 1);
            
            let sellScore = 200 * Math.pow(surplusRate, 2) + 100 * surplusRate;
            
            const goldShortageRate = shortageGold / (targetGold + 1);
            sellScore *= (1 + goldShortageRate);
            
            // marketRate は「金1で得られる兵糧量」。値が低いほど米が高く売れるため、売却スコアを上げます。
            const standardRate = window.MainParams.Economy.TradeRateBase;
            sellScore *= (standardRate / Math.max(0.01, baseRiceRate));
            
            // 安全ラインを下回っていたら、絶対に売りません
            if (castle.rice <= sellSafeRice) {
                sellScore = 0;
            }
            
            // ★変更：最大5回までの制限を追加
            if (sellScore > 30 && tradeCount < 5) {
                actions.push({ type: 'sell_rice', stat: 'politics', score: sellScore, cost: 0 }); 
            }
            
            // ===== 基本パラメータ =====
            // ★修正：無駄買いを防ぎ、売却ラインと合わせるため3.0倍にします
            const targetRice = Math.floor(baseSoldiers * 3.0);
            const minRice = Math.floor(baseSoldiers * 0.3);
            const shortage = Math.max(0, targetRice - castle.rice);
            // 目標が0の時はエラーにならないように0にします
            const shortageRate = targetRice > 0 ? shortage / targetRice : 0;

            // ===== 兵糧スコア =====
            let riceScore = 200 * Math.pow(shortageRate, 2) + 100 * shortageRate;

            // 飢餓ブースト
            if (castle.rice < minRice) {
                riceScore = 1000;
            }

            // ===== ヒステリシス代替 =====
            if (castle.rice >= castle.soldiers * 1.3) {
                riceScore *= 0.2; // 強制的に優先度を落とす
            }

            // ===== 所持金補正 =====
            const buyableAmount = castle.gold * buyActualRate; // 金1で得られる兵糧量から購入可能量を計算
            const fillRate = Math.min(1, buyableAmount / (shortage + 1));
            const goldMod = 0.5 + 0.5 * fillRate;

            const finalRiceScore = riceScore * goldMod;

            // ===== 購入判断 =====
            if (finalRiceScore > 30 && tradeCount < 5) {
                // ここでは点数をつけて「買いに行きたい！」と手を挙げるだけです
                actions.push({ type: 'buy_rice', stat: 'politics', score: finalRiceScore, cost: 0 }); 
            }

            // ★最初に作った「道が繋がっているお城リスト」から、自分のお城だけを抜いたリストを作ります！
            // ★追加：大雪のお城は輸送先・移動先から除外します！
            const targetCastlesForTransport = reachableMyCastles.filter(c => c.id !== castle.id && !heavySnowProvIds.has(c.provinceId));

            // ★ここから変更：「お使いメモ（一括輸送）」を作って、まとめて1回で運ぶ魔法です！
            let transportTasks = [];
            let maxTransportScore = 0;

            // ★追加：出発元が大雪なら輸送タスクを作りません！
            if (!isSrcHeavySnow) {
                // ① 徴兵用拠点へのお金輸送
                if (isPreparingAttack && this.game.aiOperationManager.draftBases) {
                    const clanDrafts = this.game.aiOperationManager.draftBases[castle.ownerClan];
                    const draftBaseId = clanDrafts ? clanDrafts[castle.legionId] : null;
                    // ★変更：自分の目標額（baseSoldiers * 1.5）に加えて、送る分（500）の余裕がある時だけ送ります
                    if (draftBaseId && draftBaseId !== castle.id && castle.gold >= Math.floor(baseSoldiers * 1.5) + 500) {
                        const isConnected = targetCastlesForTransport.some(c => c.id === draftBaseId);
                        if (isConnected) {
                            // メモに「お金を運ぶ」お使いを追加します
                            transportTasks.push({ type: 'draft_gold', targetId: draftBaseId });
                            if (maxTransportScore < 350) maxTransportScore = 350;
                        }
                    }
                }

                // ② 前線基地（出撃用・援軍用）への兵士と兵糧の輸送
                if (isPreparingAttack && myOp && castle.id !== myOp.stagingBase && castle.id !== myOp.supportBase) {
                    // 周りの敵（仲良しじゃない勢力）の強さを調べて、お留守番の人数を計算します
                    let hasEnemy = false;
                    let maxEnemyTotalSoldiers = 0;
                    let maxEnemyMaxCastleSoldiers = 0;

                    // 1. お隣のお城を順番に調べます
                    if (castle.adjacentCastleIds) {
                        for (const adjId of castle.adjacentCastleIds) {
                            const adj = this.game.getCastle(adjId);
                            if (!adj || adj.ownerClan === castle.ownerClan) continue; // 自分のお城ならセーフ

                            let isFriendly = false;
                            if (adj.ownerClan !== 0) {
                                const rel = this.game.getRelation(castle.ownerClan, adj.ownerClan);
                                // 同盟、和睦、支配、従属のどれかなら仲良しです
                                if (rel && window.DiplomacyRules.isProtectedFromImmediateAttack(rel.status)) {
                                    isFriendly = true;
                                }
                            }

                            // 仲良しじゃない場合（空き城も油断できないので含めます）
                            if (!isFriendly) {
                                hasEnemy = true;
                                if (adj.ownerClan !== 0) {
                                    // その敵の大名家の、全部の兵士数と一番兵士が多いお城を調べます
                                    const enemyCastles = this.game.getClanCastles(adj.ownerClan);
                                    const enemyTotal = enemyCastles.reduce((sum, c) => sum + c.soldiers, 0);
                                    const enemyMax = enemyCastles.length > 0 ? Math.max(...enemyCastles.map(c => c.soldiers)) : 0;
                                    
                                    // 一番大きな勢力の情報をメモしておきます
                                    if (enemyTotal > maxEnemyTotalSoldiers) {
                                        maxEnemyTotalSoldiers = enemyTotal;
                                        maxEnemyMaxCastleSoldiers = enemyMax;
                                    }
                                }
                            }
                        }
                    }

                    // 2. お城にいる諸勢力（国衆）も調べます
                    const kunishus = this.game.kunishuSystem.getKunishusInCastle(castle.id);
                    for (const k of kunishus) {
                        // 仲良し度が30以下なら敵対しているとみなします
                        if (k.getRelation(castle.ownerClan) <= 30) {
                            hasEnemy = true;
                            if (k.soldiers > maxEnemyTotalSoldiers) {
                                maxEnemyTotalSoldiers = k.soldiers;
                                maxEnemyMaxCastleSoldiers = k.soldiers;
                            }
                        }
                    }

                    // 基本のお留守番セット（すぐ攻められない安全な場合）
                    let keepSoldiers = 500;
                    // ★変更：基本のお留守番兵糧も、安全ラインである兵士数の2.5倍にします
                    let keepRice = Math.floor(keepSoldiers * 2.5);

                    // もし周りに敵がいたら、お留守番を増やします
                    if (hasEnemy) {
                        // 最大勢力の中で、一番兵士が多いお城の「半分」をお留守番の目標にします
                        keepSoldiers = Math.floor(maxEnemyMaxCastleSoldiers * 0.5);

                        // でも、自分の軍団全体の兵力が、敵の全体の半分以下なら…
                        const myCastles = this.game.getClanCastles(castle.ownerClan).filter(c => c.legionId === castle.legionId);
                        const myTotalSoldiers = myCastles.reduce((sum, c) => sum + c.soldiers, 0);
                        const enemyHalf = maxEnemyTotalSoldiers * 0.5;

                        if (enemyHalf > 0 && myTotalSoldiers <= enemyHalf) {
                            // 戦力差に合わせて「お留守番は諦めて前線に送る！」と判断します
                            const ratio = myTotalSoldiers / enemyHalf;
                            keepSoldiers = Math.floor(keepSoldiers * ratio);
                        }

                        // ★変更：兵糧は、お留守番の兵士の2.5倍（安全ライン）を確実に残します
                        keepRice = Math.floor(keepSoldiers * 2.5);
                    }

                    // お留守番を残した上で、今回運ぶ分の300人と500の余裕があるか確認します
                    const canSendSoldiers = castle.soldiers >= (keepSoldiers + 300);
                    const canSendRice = castle.rice >= (keepRice + 500);

                    if (canSendSoldiers && canSendRice) {
                        const stagingCastle = this.game.getCastle(myOp.stagingBase);
                        const supportCastle = myOp.supportBase ? this.game.getCastle(myOp.supportBase) : null;

                        // ★出撃するお城の城主の性格を調べて、出陣する割合を予測します
                        let stagingSendRate = 0.6;
                        if (stagingCastle) {
                            const stagingGeneral = this.game.getBusho(stagingCastle.castellanId);
                            if (stagingGeneral) {
                                if (stagingGeneral.personality === 'aggressive') stagingSendRate = 0.8;
                                if (stagingGeneral.personality === 'conservative') stagingSendRate = 0.4;
                            }
                        }
                        
                        // ★援軍用のお城の城主の性格も調べます
                        let supportSendRate = 0.6;
                        if (supportCastle) {
                            const supportGeneral = this.game.getBusho(supportCastle.castellanId);
                            if (supportGeneral) {
                                if (supportGeneral.personality === 'aggressive') supportSendRate = 0.8;
                                if (supportGeneral.personality === 'conservative') supportSendRate = 0.4;
                            }
                        }

                        // 必要な兵士（requiredForce）を確実に出陣させるために、
                        // 性格の割合から逆算して、お城に集めておくべき目標の人数を計算します
                        const stagingSoldierGoal = Math.floor(myOp.requiredForce / stagingSendRate);
                        // 兵糧は、出陣する人たちの2.5倍（余裕を持った量）を目指します
                        const stagingRiceGoal = Math.floor(myOp.requiredForce * 2.5);
                        
                        const supportSoldierGoal = Math.floor(myOp.requiredForce / supportSendRate);
                        const supportRiceGoal = Math.floor(myOp.requiredForce * 2.5);

                        // 届け先が出撃用拠点で、まだ目標（兵士か兵糧）に届いていないなら、メモに追加します！
                        if (stagingCastle && (stagingCastle.soldiers < stagingSoldierGoal || stagingCastle.rice < stagingRiceGoal)) {
                            transportTasks.push({ type: 'staging', targetId: myOp.stagingBase });
                            if (maxTransportScore < 900) maxTransportScore = 900; 
                        } 
                        // 出撃用がもう十分で、届け先が援軍用拠点で、まだ目標に届いていないならメモに追加します！
                        else if (supportCastle && (supportCastle.soldiers < supportSoldierGoal || supportCastle.rice < supportRiceGoal)) {
                            transportTasks.push({ type: 'support', targetId: myOp.supportBase });
                            if (maxTransportScore < 700) maxTransportScore = 700; 
                        }
                    }
                }

                // ③ 通常の輸送（大名のいない城のみ）
                if (!daimyo || daimyo.castleId !== castle.id) {
                    const allyCastles = targetCastlesForTransport;
                    for (const target of allyCastles) {
                        // ★変更：兵士は最低でも2000＋送る分(500)、金は目標値＋送る分(500)の余裕がある時だけ送ります
                        if ((target.soldiers <= 500 || target.gold <= 500) && castle.soldiers >= 2500 && castle.gold >= Math.floor(baseSoldiers * 1.5) + 500) {
                            transportTasks.push({ type: 'normal_gold_soldier', targetId: target.id });
                            if (maxTransportScore < 400) maxTransportScore = 400;
                            break; 
                        }
                        // ★変更：米は購入目標値(3.0)に加えて、送る分(1000)の余裕がある時だけ送ります
                        if (target.rice <= 2000 && castle.rice >= Math.floor(baseSoldiers * 3.0) + 1000) {
                            transportTasks.push({ type: 'normal_rice', targetId: target.id });
                            if (maxTransportScore < 400) maxTransportScore = 400;
                            break;
                        }
                    }
                }
            }

            // ★メモに1つでも用事があれば、1回分の行動として登録します！
            if (transportTasks.length > 0) {
                actions.push({
                    type: 'bulk_transport',
                    stat: 'leadership', // みんなを指揮して運ぶので統率を使います
                    score: maxTransportScore,
                    cost: 0,
                    tasks: transportTasks
                });
            }

            // 10. 武将の移動
            // 新しい人事部（AIStaffing）の戦略的な指示に従います！
            // ★追加：大雪なら移動しません！
            if (this.game.aiStaffing && !isSrcHeavySnow) {
                // ★追加：移動先として大雪の城を除外したリストを渡します！
                const validReachableCastles = reachableMyCastles.filter(c => !heavySnowProvIds.has(c.provinceId));
                if (this.game.writeAIDiagnostic) this.game.writeAIDiagnostic(castle, 'internal:plan_move');
                const moveActions = this.game.aiStaffing.planMoveAction(castle, availableBushos, validReachableCastles);
                if (moveActions && moveActions.length > 0) {
                    // 何人もの移動リストを、そのまま全部行動の候補に追加します！
                    actions.push(...moveActions);
                }
            }
            
            // ★11. 登用（浪人がいる場合、やや優先度を上げる）
            const ronins = this.game.getCastleBushos(castle.id).filter(b => window.BushoStatusRules.isRonin(b));
            if (ronins.length > 0) {
                // 優先度をやや上げて15点にします（上げすぎず、ちょっとすぎないバランス）
                actions.push({ type: 'employ', stat: 'charm', score: 15, cost: 0, targetRonin: ronins[0] });
            }

            // ★領内の諸勢力への親善（友好度90未満の場合に検討）
            // ★プレイヤー勢力は（直轄・委任に関わらず）絶対に勝手に親善を行わず、敵AIのみ実行するようにします！
            if (Number(castle.ownerClan) !== Number(this.game.playerClanId)) {
                // ★方針が「国内平定」かどうかを確認する準備をします
                const myGrandObj = (this.game.aiOperationManager && this.game.aiOperationManager.grandObjectives && this.game.aiOperationManager.grandObjectives[castle.ownerClan] && this.game.aiOperationManager.grandObjectives[castle.ownerClan][castle.legionId]) 
                                    ? this.game.aiOperationManager.grandObjectives[castle.ownerClan][castle.legionId] : null;

                const myKunishus = this.game.kunishuSystem.getKunishusInCastle(castle.id).filter(k => k.getRelation(castle.ownerClan) < 90);
                myKunishus.forEach(k => {
                    const relation = k.getRelation(castle.ownerClan);
                    
                    // ★友好度0で最大40点、90で0点になるように計算します
                    let score = Math.floor(40 * (90 - relation) / 90);
                    
                    // ★ここから追加：城主と諸勢力の頭領の「相性」を比べて、仲が悪いほど親善をやりにくくする魔法！
                    // 1. 諸勢力の頭領（リーダー）を探します
                    const leader = this.game.getBusho(k.leaderId);
                    if (leader) {
                        // 2. 城主と頭領の「相性の差」を計算します（0がピッタリ、50が真逆）
                        const affinityDiff = PersonnelRules.calcAffinityDiff(castellan.affinity, leader.affinity);
                        
                        // 3. 差が50の時に「25点」下がるように計算します（相性の差を半分にします）
                        const penalty = Math.floor(affinityDiff / 2);
                        
                        // 4. スコアから引きます（マイナスにならないように、最低でも0にします）
                        score = Math.max(0, score - penalty);
                    }

                    // ★方針が「国内平定」の時は、親善の優先度を少しだけ（15点）アップさせます！
                    if (myGrandObj && myGrandObj.type === '国内平定') {
                        score += 15;
                    }
                    
                    // ★お城の資金が「1000」未満で余裕がない時は、自分の生活を優先して親善の優先度を大幅に下げます！
                    if (availableGold < 1000) {
                        score = Math.floor(score / 4); // スコアを4分の1にします
                    }
                    
                    // スコアが1点以上ある時だけ、行動の候補に入れます
                    if (score > 0) {
                        actions.push({ type: 'kunishu_goodwill', stat: 'charm', score: score, cost: 300, targetKunishu: k });
                    }
                });
            }

            // ★12. 褒美（承認欲求がたまっている、または忠誠度が低い武将がいる場合）
            let rewardTargets = [];
            // ★選ばれた人の中で「一番低い忠誠度」を覚えておく箱です！
            let minLoyaltyForReward = 100;
            
            const castleBushos = this.game.getCastleBushos(castle.id).filter(b => b.clan === castle.ownerClan && window.BushoStatusRules.isActive(b));
            
            for (let b of castleBushos) {
                // ★修正：今月すでに褒美をもらっているかチェックし、忠誠度が低い場合は2回目も許容します！
                if (b.lastRewardedTurnId === this.game.getCurrentTurnId()) {
                    // すでに2回もらっているか、忠誠度が70より高ければ除外します（2回目は忠誠度70以下限定）
                    if ((b.rewardedCountThisMonth || 0) >= 2 || b.loyalty > 70) {
                        continue;
                    }
                }

                if ((b.recognitionNeed || 0) < 0) {
                    continue; // マイナスの人は飛ばして、次の人の順番に行きます！
                }
                // ① 承認欲求(recognitionNeed)がたまっている場合
                if ((b.recognitionNeed || 0) > 30) { 
                    rewardTargets.push(b);
                    // 忠誠度の低さをチェックして箱を更新します
                    if (b.loyalty < minLoyaltyForReward) minLoyaltyForReward = b.loyalty;
                    continue; // この人はもうリストに入れたので、次の人へ
                }
                
                // ② 忠誠度が95以下の場合（サイコロを振って対象にする魔法です！）
                if (b.loyalty <= 95) {
                    // ★修正：基礎確率を少し上げました！(95で2%、70以下で20%)
                    let prob = 20; // 70以下の時は問答無用で20%
                    if (b.loyalty > 70) {
                        prob = 2.0 + ((95 - b.loyalty) / 25) * 18.0; 
                    }
                    
                    // 2. お殿様（大名）の義理(duty)による確率の増減
                    // 義理が51〜100ならアップ、49〜0ならダウンします
                    const dutyMod = (daimyo.duty - 50) * 0.1;
                    
                    // 3. お殿様との相性(affinity)による確率の増減
                    // 差が0(ピッタリ)なら10%アップ、差が50(真逆)なら10%ダウンします
                    const diff = PersonnelRules.calcAffinityDiff(daimyo.affinity, b.affinity);
                    const affinityMod = (25 - diff) * 0.4; 
                    
                    // 全部を足して最終的な確率を出します
                    let finalProb = prob + dutyMod + affinityMod;
                    
                    // 確率のサイコロを振ります！（100面ダイス）
                    if (Math.random() * 100 < finalProb) {
                        rewardTargets.push(b);
                        if (b.loyalty < minLoyaltyForReward) minLoyaltyForReward = b.loyalty;
                    }
                }
            }
            
            if (rewardTargets.length > 0 && availableGold >= window.MainParams.CommandCost.Reward) {
                // ★修正：一番忠誠度が低い武将に合わせて、優先度スコア（やりたさ）を計算します！
                // 忠誠95なら1点、60以下なら40点になります。
                let rewardScore = 15; // 承認欲求だけで選ばれた時などの基本点です
                if (minLoyaltyForReward <= 60) {
                    rewardScore = 40; // 60以下なら最優先の40点！
                } else if (minLoyaltyForReward <= 95) {
                    // 60〜95の間を、点数がなめらかに変わるように計算する魔法です！
                    rewardScore = 1 + ((95 - minLoyaltyForReward) / 35) * 39;
                }
                
                actions.push({ type: 'reward', stat: 'none', score: rewardScore, cost: window.MainParams.CommandCost.Reward, targets: rewardTargets });
            }
            
            // ★13. 計略（スコアは一律低めに設定）
            // 作戦（myOp）で決められた「計略目標（sabotageTargets）」に対して工作を行います！
            if (myOp && myOp.sabotageTargets && myOp.sabotageTargets.length > 0) {
                // 第一目標から順番にチェックして、有効な目標が見つかるまで繰り上げます
                while (myOp.sabotageTargets.length > 0) {
                    const targetData = myOp.sabotageTargets[0];
                    const targetCastle = this.game.getCastle(targetData.castleId);
                    const memoryClanId = targetData.clanId;

                    // 城が消滅している等のエラー回避
                    if (!targetCastle) {
                        myOp.sabotageTargets.shift(); // 繰り上げ
                        continue;
                    }

                    const currentCastleOwner = targetCastle.ownerClan;

                    // 判定用の魔法（同盟・支配・従属・和睦状態か？）
                    const isProtected = (clan1, clan2) => {
                        if (clan1 === clan2) return true; // 自分自身
                        if (clan2 === 0) return false; // 空き城
                        const rel = this.game.getRelation(clan1, clan2);
                        return rel && window.DiplomacyRules.isProtectedFromImmediateAttack(rel.status);
                    };

                    const isCastleProtected = isProtected(castle.ownerClan, currentCastleOwner);
                    const isClanProtected = isProtected(castle.ownerClan, memoryClanId);

                    // 両方とも保護されている場合は第一目標を削除して繰り上げます
                    if (isCastleProtected && isClanProtected) {
                        myOp.sabotageTargets.shift();
                        continue;
                    }

                    // ① 第一目標城を所有している勢力が保護されていない場合（破壊工作、民心撹乱が可能）
                    if (!isCastleProtected && currentCastleOwner !== 0 && currentCastleOwner !== castle.ownerClan) {
                        actions.push({ type: 'sabotage', stat: 'intelligence', score: 5, cost: 0, targetId: targetCastle.id });
                        actions.push({ type: 'incite', stat: 'intelligence', score: 5, cost: 0, targetId: targetCastle.id });
                    }

                    // ② 第一目標勢力（記憶している大名家）が保護されていない場合（離間計、武将引抜が可能）
                    if (!isClanProtected && memoryClanId !== 0 && memoryClanId !== castle.ownerClan) {
                        // 第一目標勢力に所属する武将を全員取得（大名は除く）
                        const enemyBushos = [];
                        const enemyCastles = this.game.getClanCastles(memoryClanId);
                        enemyCastles.forEach(c => {
                            const bList = this.game.getCastleBushos(c.id).filter(b =>
                                this.game.strategySystem.isRegularClanStrategyTarget(b, memoryClanId) && !b.isDaimyo
                            );
                            enemyBushos.push(...bList);
                        });
                        
                        // ★追加：スキルマネージャーに問い合わせて、リーダーのスキルによって「暗殺」行動が拡張（許可）されているか確認します
                        let canAssassinate = false;
                        if (typeof SkillManager !== 'undefined' && typeof SkillManager.hasAIExtendedAction === 'function') {
                            canAssassinate = SkillManager.hasAIExtendedAction(leader, 'assassinate', this.game);
                        }

                        // ★修正：リーダー（直轄なら大名、軍団なら国主）の智謀による基本スコアアップ (5〜10点の枠に収めます)
                        let baseRumorHeadhuntScore = 5;
                        if (leader.intelligence >= 75) {
                            baseRumorHeadhuntScore += Math.min(5, Math.floor((leader.intelligence - 75) / 4));
                        }

                        // ★追加：リーダーの智謀による「見誤り」の最大誤差を決めます
                        let evaluatorInt = leader.intelligence;
                        let maxError = 0;
                        if (evaluatorInt <= 50) {
                            maxError = 0.3; // 智謀50以下なら最大3割（±30%）見誤る
                        } else if (evaluatorInt >= 95) {
                            maxError = 0;   // 智謀95以上なら正確（誤差なし）
                        } else {
                            // 智謀51〜94の間は、少しずつ誤差が減っていきます
                            maxError = 0.3 * (95 - evaluatorInt) / 45;
                        }
                        
                        if (this.game.writeAIDiagnostic) this.game.writeAIDiagnostic(castle, `internal:strategy_scan:${enemyBushos.length}`);

                        // ★軽量化：同じ敵勢力についての「一門・役職」早見表は1回だけ作ります。
                        const officerStatusContext = (this.game.strategySystem && typeof this.game.strategySystem.buildOfficerStatusContext === 'function')
                            ? this.game.strategySystem.buildOfficerStatusContext(memoryClanId)
                            : null;

                        enemyBushos.forEach(targetBusho => {
                            // ターゲット個別の「優先度」を計算します
                            let targetPriority = 0;

                            // 誤差のサイコロを振ります（1.0を中心に、-maxError から +maxError まで揺れます）
                            const errorRateLoyalty = 1.0 + (Math.random() - 0.5) * 2 * maxError;
                            const errorRateDuty = 1.0 + (Math.random() - 0.5) * 2 * maxError;
                            
                            // 智謀によって見誤った（思い込んでいる）忠誠度と義理を計算します
                            const perceivedLoyalty = targetBusho.loyalty * errorRateLoyalty;
                            const perceivedDuty = targetBusho.duty * errorRateDuty;

                            // ① 忠誠度が低い武将ほど優先（100から下がるごとに加点、50で約+12、0で+25）
                            if (perceivedLoyalty < 100) {
                                targetPriority += Math.floor((100 - perceivedLoyalty) / 4);
                            }

                            // ② 義理が低い武将ほど優先（100から下がるごとに加点、50で約+6、0で約+12）
                            if (perceivedDuty < 100) {
                                targetPriority += Math.floor((100 - perceivedDuty) / 8);
                            }

                            // ③ 第一攻撃目標としている城にいる武将なら優先
                            if (myOp && myOp.targetId === targetBusho.castleId && !myOp.isKunishuTarget) {
                                targetPriority += 10;
                            }

                            // ④ 城主に対してはやや優先
                            if (targetBusho.isCastellan) {
                                targetPriority += 5;
                            }

                            // ★修正：ターゲットが役職者本人か、役職持ち一門か、ただの一門かでAIの優先度ダウンを分けます（一元化対応）
                            const officerStatus = this.game.strategySystem.checkOfficerStatus(targetBusho, officerStatusContext);
                            if (officerStatus === 3) {
                                targetPriority -= 30; // 役職者本人の場合は成功率がガクッと下がるので一番大きく優先度を下げる
                            } else if (officerStatus === 2) {
                                targetPriority -= 20; // 役職持ち一門の場合は中程度優先度を下げる
                            } else if (officerStatus === 1) {
                                targetPriority -= 10; // ただの一門の場合は少し優先度を下げる
                            }
                            
                            // ★追加：ターゲットが自家の武将を「宿敵」として恨んでいないかチェックします
                            let hasNemesis = false;
                            if (targetBusho.nemesisIds && targetBusho.nemesisIds.length > 0) {
                                hasNemesis = targetBusho.nemesisIds.some(nId => {
                                    const nBusho = this.game.getBusho(nId);
                                    return nBusho && nBusho.clan === castle.ownerClan && !window.LifeStatusRules.isDead(nBusho);
                                });
                            }
                            
                            // ★大魔法：内政の邪魔をしないように、優先度を「小数点」として基本スコアに足します！
                            // 例：基本スコア8、優先度45なら「8.45点」となり、最大10点強の枠に収まります。
                            let finalScore = baseRumorHeadhuntScore + (targetPriority / 100);
                            
                            // 離間計は宿敵がいても実行します（忠誠度を下げて謀反を誘発させるため）
                            actions.push({ type: 'rumor', stat: 'intelligence', score: finalScore, cost: 0, targetId: targetBusho.castleId, targetBushoId: targetBusho.id, targetClanId: memoryClanId });
                            
                            // 引抜は、宿敵がいない場合のみ実行します
                            if (!hasNemesis && availableGold >= 100) {
                                actions.push({ type: 'headhunt', stat: 'intelligence', score: finalScore, cost: 100, targetId: targetBusho.castleId, targetBushoId: targetBusho.id, gold: 100, targetClanId: memoryClanId });
                            }
                            
                            // ★追加：AIの暗殺
                            // プレイヤー勢力を対象にしない
                            // 通常の計略の1/10の確率になるように調整して追加する
                            if (canAssassinate && memoryClanId !== this.game.playerClanId) {
                                if (Math.random() < 0.1) {
                                    actions.push({ type: 'assassinate', stat: 'intelligence', score: finalScore, cost: 0, targetId: targetBusho.castleId, targetBushoId: targetBusho.id, targetClanId: memoryClanId });
                                }
                            }
                        });
                    }

                    break; // 第一目標の処理（アクションの追加）を終えたらループを抜けます
                }
            }

            // 点数が高い順に並べ替えます
            actions.sort((a, b) => b.score - a.score);

            let actionDoneInThisStep = false;

            // 一番点数が高い行動から順番に「できるかどうか」試していきます
            for (let action of actions) {
                if (action.score < 5) continue; // ★変更：登用の5点も拾えるように、足切りラインを10から5に下げました！

                // ★追加：褒美は「実行する武将（doer）」を必要としない特別な行動です！
                if (action.type === 'reward') {
                    // ★変更：城主を最優先し、次に忠誠度が低い人、最後に承認欲求が高い人を1人選びます
                    action.targets.sort((a, b) => {
                        // ① まずは「このお城の城主かどうか」をチェックして、城主を一番前に並べます
                        const aIsCastellan = (a.id === castle.castellanId) ? 1 : 0;
                        const bIsCastellan = (b.id === castle.castellanId) ? 1 : 0;
                        if (bIsCastellan !== aIsCastellan) {
                            return bIsCastellan - aIsCastellan;
                        }

                        // ② 次に、忠誠度の低さを比べます（忠誠度が低い人が先に来ます）
                        if (a.loyalty !== b.loyalty) {
                            return a.loyalty - b.loyalty;
                        }

                        // ③ 忠誠度も同じなら、最後は承認欲求の大きさを比べます
                        const aAchieve = a.recognitionNeed || 0;
                        const bAchieve = b.recognitionNeed || 0;
                        return bAchieve - aAchieve; 
                    });
                    const targetBusho = action.targets[0];
                    
                    if (availableGold >= window.MainParams.CommandCost.Reward) {
                        castle.gold -= window.MainParams.CommandCost.Reward;
                        // ★修正：新しく作った一元化の魔法を呼び出して、忠誠度アップと承認欲求ダウンをまとめて行います！
                        // （金額に関係なく、常に一定の効果が出ます）
                        PersonnelRules.applyRewardEffect(targetBusho, daimyo, this.game);
                        
                        // ★「行動済」マークもつけません！
                        // ★追加：今月何回もらったかをカウントして記録します！
                        if (targetBusho.lastRewardedTurnId === this.game.getCurrentTurnId()) {
                            targetBusho.rewardedCountThisMonth = (targetBusho.rewardedCountThisMonth || 1) + 1;
                        } else {
                            targetBusho.lastRewardedTurnId = this.game.getCurrentTurnId();
                            targetBusho.rewardedCountThisMonth = 1;
                        }
                        step--; // 行動回数を消費しないようにします
                        actionDoneInThisStep = true; 
                        break;
                    }
                    continue; // もしお金が足りなかったら、この行動は諦めて次を探します
                }

                // --- これより下は、実行する武将（doer）が必要な行動です ---
                if (availableBushos.length === 0) continue; // 動ける武将がいなければパスします

                // その行動に一番向いている武将を探します（一番能力が高い人が実行します）
                const bestBushos = availableBushos.sort((a, b) => {
                    // ★追加：計略の場合は、専門部署が用意した「総合スコア」を使って比べっこします！
                    if (action.type === 'sabotage') {
                        return StrategySystem.calcSabotageScore(b) - StrategySystem.calcSabotageScore(a);
                    }
                    if (action.type === 'incite') {
                        return StrategySystem.calcInciteScore(b) - StrategySystem.calcInciteScore(a);
                    }
                    if (action.type === 'rumor') {
                        return StrategySystem.calcRumorScore(b) - StrategySystem.calcRumorScore(a);
                    }
                    if (action.type === 'headhunt') {
                        return StrategySystem.calcHeadhuntScore(b) - StrategySystem.calcHeadhuntScore(a);
                    }
                    if (action.type === 'assassinate') {
                        return StrategySystem.calcAssassinateScore(b) - StrategySystem.calcAssassinateScore(a);
                    }
                    // 計略以外の普通のお仕事は、今まで通り1つの能力（stat）で比べっこします
                    return b[action.stat] - a[action.stat];
                });
                if (bestBushos.length === 0) continue; // 基準を満たす人がいなければ、この行動は諦めます
                const doer = bestBushos[0];
                
                // 実行処理
                if (action.type === 'tribute' && availableGold >= action.cost) {
                    castle.gold -= action.cost;
                    
                    // 朝廷への貢献度をアップさせます
                    this.game.courtRankSystem.addContribution(castle.ownerClan, action.cost);
                    
                    // ★差し替え：信用の上昇値を「専門部署（courtRankSystem）」に計算してもらいます！（ここで経験値も足します）
                    const trustIncrease = this.game.courtRankSystem.calcTributeTrustIncrease(action.cost, doer, true);
                    this.game.courtRankSystem.addTrust(castle.ownerClan, trustIncrease);
                    
                    // ★差し替え：使者の功績も「専門部署」に計算してもらいます！
                    doer.achievementTotal = (doer.achievementTotal || 0) + this.game.courtRankSystem.calcTributeAchievement(action.cost);
                    if (this.game.factionSystem && this.game.factionSystem.updateRecognition) {
                        this.game.factionSystem.updateRecognition(doer, 10);
                    }
                    
                    doer.isActionDone = true; 
                    actionDoneInThisStep = true; 
                    break;
                }
                if (action.type === 'kunishu_goodwill' && availableGold >= action.cost) {
                    castle.gold -= action.cost;
                    const kunishu = action.targetKunishu;
                    // 正しい外交の専門部署（diplomacyManager）に計算をお願いするように直します
                    const increase = this.game.diplomacyManager.calcGoodwillIncrease(action.cost, doer);
                    const currentRel = kunishu.getRelation(castle.ownerClan);
                    this.game.kunishuSystem.setRelation(kunishu, castle.ownerClan, currentRel + increase);
                    
                    doer.achievementTotal = (doer.achievementTotal || 0) + Math.floor(doer.diplomacy * 0.2) + 10;
                    if (this.game.factionSystem && this.game.factionSystem.updateRecognition) {
                        this.game.factionSystem.updateRecognition(doer, 15);
                    }
                    
                    doer.isActionDone = true; 
                    actionDoneInThisStep = true; 
                    break;
                }
                if (action.type === 'employ') {
                    const targetRonin = action.targetRonin;
                    const myPower = this.game.getClanTotalSoldiers(castle.ownerClan) || 1;
                    const success = PersonnelRules.calcEmploymentSuccess(doer, targetRonin, myPower, 0, this.game);
                    
                    if (success) {
                        // ★新しいお引越しセンターの魔法を使います！
                        this.game.affiliationSystem.joinClan(targetRonin, castle.ownerClan, castle.id);
                        
                        // ★プレイヤーと同じ！成功したらしっかり功績と承認欲求のご褒美をあげます
                        const maxStat = Math.max(targetRonin.strength, targetRonin.intelligence, targetRonin.leadership, targetRonin.charm, targetRonin.diplomacy);
                        doer.achievementTotal = (doer.achievementTotal || 0) + Math.floor(maxStat * 0.3);
                        if (this.game.factionSystem && this.game.factionSystem.updateRecognition) this.game.factionSystem.updateRecognition(doer, 20);
                    } else {
                        // 失敗しても少しだけ慰めのご褒美をあげます
                        doer.achievementTotal = (doer.achievementTotal || 0) + 5;
                        if (this.game.factionSystem && this.game.factionSystem.updateRecognition) this.game.factionSystem.updateRecognition(doer, 10);
                    }
                    
                    doer.isActionDone = true; 
                    actionDoneInThisStep = true; 
                    break;
                }
                if (action.type === 'sabotage') {
                    const result = this.game.strategySystem.calcSabotage(doer.id, action.targetId, true);
                    const target = this.game.getCastle(action.targetId);
                    const targetClanIdForHistory = Number(target && target.ownerClan) || 0;
                    const covertOutcome = this.game.strategySystem.handleCovertAction(doer.id, action.targetId, result.success, 'sabotage');
                    // ★個別の魔法ではなく、共通の「applyStrategyEffect」を使うように直します！
                    this.game.strategySystem.applyStrategyEffect('sabotage', doer, target, result);
                    this.game.strategySystem.recordStrategyHistory('破壊工作', doer, target ? target.name : '対象拠点', result.success, [targetClanIdForHistory], covertOutcome);
                    
                    let keepAction = false;
                    if (!hasBonusSabotageUsed && leader.intelligence >= 91) {
                        const bonusProb = Math.min(100, 3 + Math.floor((leader.intelligence - 91) / 5) * 3);
                        if (Math.random() * 100 < bonusProb) {
                            keepAction = true;
                            hasBonusSabotageUsed = true;
                        }
                    }
                    if (!keepAction) doer.isActionDone = true; 
                    actionDoneInThisStep = true; break;
                }
                if (action.type === 'incite') {
                    const result = this.game.strategySystem.calcIncite(doer.id, action.targetId, true);
                    const target = this.game.getCastle(action.targetId);
                    const targetClanIdForHistory = Number(target && target.ownerClan) || 0;
                    const covertOutcome = this.game.strategySystem.handleCovertAction(doer.id, action.targetId, result.success, 'incite');
                    // ★ここも共通の魔法「applyStrategyEffect」に書き換えます！
                    this.game.strategySystem.applyStrategyEffect('incite', doer, target, result);
                    this.game.strategySystem.recordStrategyHistory('民心撹乱', doer, target ? target.name : '対象拠点', result.success, [targetClanIdForHistory], covertOutcome);
                    
                    let keepAction = false;
                    if (!hasBonusSabotageUsed && leader.intelligence >= 91) {
                        const bonusProb = Math.min(100, 3 + Math.floor((leader.intelligence - 91) / 5) * 3);
                        if (Math.random() * 100 < bonusProb) {
                            keepAction = true;
                            hasBonusSabotageUsed = true;
                        }
                    }
                    if (!keepAction) doer.isActionDone = true; 
                    actionDoneInThisStep = true; break;
                }
                if (action.type === 'rumor') {
                    const targetBusho = this.game.getBusho(action.targetBushoId);
                    if (!this.game.strategySystem.isRegularClanStrategyTarget(targetBusho, action.targetClanId)) continue;
                    let result = this.game.strategySystem.calcRumor(doer.id, action.targetBushoId, true);
                    
                    targetBusho.lastApproachedClanId = doer.clan;
                    const targetClanIdForHistory = Number(targetBusho.clan) || 0;
                    const covertOutcome = this.game.strategySystem.handleCovertAction(doer.id, targetBusho.castleId, result.success, 'rumor', false, targetBusho.id);
                    
                    // ★ここも共通の魔法「applyStrategyEffect」に書き換えます！
                    this.game.strategySystem.applyStrategyEffect('rumor', doer, targetBusho, result);
                    this.game.strategySystem.recordStrategyHistory('離間計', doer, targetBusho.fullName || targetBusho.name, result.success, [targetClanIdForHistory], covertOutcome);
                    
                    let keepAction = false;
                    if (!hasBonusSabotageUsed && leader.intelligence >= 91) {
                        const bonusProb = Math.min(100, 3 + Math.floor((leader.intelligence - 91) / 5) * 3);
                        if (Math.random() * 100 < bonusProb) {
                            keepAction = true;
                            hasBonusSabotageUsed = true;
                        }
                    }
                    if (!keepAction) doer.isActionDone = true; 
                    actionDoneInThisStep = true; break;
                }
                if (action.type === 'headhunt' && availableGold >= action.cost) {
                    const targetBusho = this.game.getBusho(action.targetBushoId);
                    if (!this.game.strategySystem.isRegularClanStrategyTarget(targetBusho, action.targetClanId)) continue;
                    castle.gold -= action.cost;
                    
                    targetBusho.lastApproachedClanId = doer.clan;

                    const targetClanIdForHistory = Number(targetBusho.clan) || 0;
                    let isSuccess = this.game.strategySystem.calcHeadhunt(doer.id, action.targetBushoId, action.gold, true);
                    const covertOutcome = this.game.strategySystem.handleCovertAction(doer.id, targetBusho.castleId, isSuccess, 'headhunt', targetBusho.isCastellan && isSuccess, targetBusho.id);
                    
                    this.game.strategySystem.applyHeadhuntEffect(doer, targetBusho, castle, isSuccess);
                    this.game.strategySystem.recordStrategyHistory('引抜', doer, targetBusho.fullName || targetBusho.name, isSuccess, [targetClanIdForHistory], covertOutcome);
                    
                    let keepAction = false;
                    if (!hasBonusSabotageUsed && leader.intelligence >= 91) {
                        const bonusProb = Math.min(100, 3 + Math.floor((leader.intelligence - 91) / 5) * 3);
                        if (Math.random() * 100 < bonusProb) {
                            keepAction = true;
                            hasBonusSabotageUsed = true;
                        }
                    }
                    if (!keepAction) doer.isActionDone = true; 
                    actionDoneInThisStep = true; break;
                }

                if (action.type === 'assassinate') {
                    const targetBusho = this.game.getBusho(action.targetBushoId);
                    if (!this.game.strategySystem.isRegularClanStrategyTarget(targetBusho, action.targetClanId)) continue;
                    targetBusho.lastApproachedClanId = doer.clan;
                    
                    const targetClanIdForHistory = Number(targetBusho.clan) || 0;
                    let isSuccess = this.game.strategySystem.calcAssassinate(doer.id, action.targetBushoId, true);
                    const covertOutcome = this.game.strategySystem.handleCovertAction(doer.id, targetBusho.castleId, isSuccess, 'assassinate', false, targetBusho.id);
                    
                    if (isSuccess) {
                        this.game.lifeSystem.processDeath(targetBusho, 'assassination');
                    }
                    this.game.strategySystem.recordStrategyHistory('暗殺', doer, targetBusho.fullName || targetBusho.name, isSuccess, [targetClanIdForHistory], covertOutcome);
                    
                    let keepAction = false;
                    if (!hasBonusSabotageUsed && leader.intelligence >= 91) {
                        const bonusProb = Math.min(100, 3 + Math.floor((leader.intelligence - 91) / 5) * 3);
                        if (Math.random() * 100 < bonusProb) {
                            keepAction = true;
                            hasBonusSabotageUsed = true;
                        }
                    }
                    if (!keepAction) doer.isActionDone = true; 
                    actionDoneInThisStep = true; break;
                }
                
                if (action.type === 'repair' && availableGold >= window.MainParams.CommandCost.Repair) {
                    castle.gold -= window.MainParams.CommandCost.Repair;
                    const val = DomesticRules.calcRepair(doer, 1.0, true);
                    const oldVal = castle.defense;
                    castle.defense = Math.min(castle.maxDefense, castle.defense + val);
                    
                    // ★プレイヤーと同じ！上がった分だけご褒美をあげます
                    const actualVal = castle.defense - oldVal;
                    doer.achievementTotal = (doer.achievementTotal || 0) + Math.floor(actualVal * 0.5);
                    if (this.game.factionSystem && this.game.factionSystem.updateRecognition) this.game.factionSystem.updateRecognition(doer, 10);
                    
                    doer.isActionDone = true; actionDoneInThisStep = true; break;
                }
                if (action.type === 'charity' && castle.rice >= window.MainParams.CommandCost.Charity) {
                    castle.rice -= window.MainParams.CommandCost.Charity;
                    
                    const val = DomesticRules.calcCharity(doer, 1.0, true);
                    
                    const oldVal = castle.peoplesLoyalty;
                    castle.peoplesLoyalty = Math.min(100, castle.peoplesLoyalty + val);
                    
                    doer.achievementTotal = (doer.achievementTotal || 0) + Math.floor(val * 0.5);
                    if (this.game.factionSystem && this.game.factionSystem.updateRecognition) this.game.factionSystem.updateRecognition(doer, 15);
                    
                    doer.isActionDone = true; actionDoneInThisStep = true; break;
                }
                // ★改善：実行する時も、対象になるお城がある時だけ行います！
                if (action.type === 'draft' && availableGold >= action.cost) {
                    // ここでもう一度、徴兵できるお城のリストと重さを計算します
                    const draftableCastles = reachableMyCastles.filter(c => c.population >= 3000);
                    if (draftableCastles.length === 0) continue;

                    let totalWeightedPop = 0;
                    let actualTotalPop = 0;
                    draftableCastles.forEach(c => {
                        actualTotalPop += c.population;
                        let weight = (c.id === castle.id) ? 1.5 : 1.0;
                        totalWeightedPop += Math.floor(c.population * weight);
                    });

                    let draftCost = action.cost;
                    // ★修正：実行時にもお城の人口を渡して、正しい兵士数を計算します
                    let soldiers = DomesticRules.calcDraftFromGold(draftCost, doer, castle.peoplesLoyalty, castle.population);
                    
                    // ネットワーク全体の人口（実際の総人口）を超えないようにします
                    if (actualTotalPop < soldiers) {
                        soldiers = actualTotalPop;
                        draftCost = DomesticRules.calcDraftCost(soldiers, doer, castle.peoplesLoyalty, castle.population);
                    }

                    // 兵士が上限（99999）を超えないようにします
                    if (castle.soldiers + soldiers > 99999) {
                        soldiers = 99999 - castle.soldiers;
                        draftCost = DomesticRules.calcDraftCost(soldiers, doer, castle.peoplesLoyalty, castle.population);
                    }

                    // ===== 仮想チェック（重要） =====
                    let virtualSoldiers = castle.soldiers + soldiers;
                    let virtualRiceNeed = virtualSoldiers * 2.0;
                    
                    if (castle.rice < virtualRiceNeed) {
                        soldiers = Math.floor((castle.rice / 2.0) - castle.soldiers);
                        soldiers = Math.max(0, soldiers);
                        draftCost = DomesticRules.calcDraftCost(soldiers, doer, castle.peoplesLoyalty, castle.population);
                    }

                    if (soldiers > 0 && draftCost > 0) {
                        // ★修正：経験値を入れるための最終実行の際にも人口を渡します（trueの前に差し込みます）
                        DomesticRules.calcDraftCost(soldiers, doer, castle.peoplesLoyalty, castle.population, true);

                        // ★大改善：集めた兵士数を、負担の重さ（ウェイト）に合わせて振り分けます！
                        let remainingDraft = soldiers;
                        draftableCastles.forEach((c, index) => {
                            if (c.population > 0 && totalWeightedPop > 0) {
                                let popDecrease = 0;
                                // 最後の1つのお城は、計算のズレ（端数）をすべて引き受けます
                                if (index === draftableCastles.length - 1) {
                                    popDecrease = remainingDraft;
                                } else {
                                    // 負担の割合（実行拠点は1.5倍）に合わせて人数を決めます
                                    let weight = (c.id === castle.id) ? 1.5 : 1.0;
                                    let weightedPop = Math.floor(c.population * weight);
                                    const ratio = weightedPop / totalWeightedPop;
                                    popDecrease = Math.floor(soldiers * ratio);
                                    popDecrease = Math.min(popDecrease, c.population); 
                                }
                                
                                // ★ 徴兵による民忠と人口の減少処理を、GameSystemの専門の魔法にお任せします！
                                const loyaltyPenalty = DomesticRules.applyDraftPenalty(c, popDecrease);
                                
                                remainingDraft -= popDecrease;
                            }
                        });

                        // お城の貯金箱から使った分を減らします
                        castle.gold -= draftCost;
                        
                        const newMorale = Math.max(0, castle.morale - 10);
                        const newTraining = Math.max(0, castle.training - 10);
                        castle.training = Math.floor(((castle.training * castle.soldiers) + (newTraining * soldiers)) / (castle.soldiers + soldiers));
                        castle.morale = Math.floor(((castle.morale * castle.soldiers) + (newMorale * soldiers)) / (castle.soldiers + soldiers));
                        castle.soldiers += soldiers;
                        
                        // 頑張ったご褒美をあげます
                        doer.achievementTotal = (doer.achievementTotal || 0) + 5;
                        if (this.game.factionSystem && this.game.factionSystem.updateRecognition) this.game.factionSystem.updateRecognition(doer, 10);
                        
                        doer.isActionDone = true; 
                        actionDoneInThisStep = true; 
                        break;
                    } else {
                        continue; // 維持できなかったり増やせなかったら諦めて、別の行動を探します
                    }
                }
                if (action.type === 'training') {
                    const val = DomesticRules.calcTraining(doer, castle.soldiers, 1.0, true);
                    const oldVal = castle.training;
                    const maxTraining = window.WarParams.Military.MaxTrainingNormal;
                    // 戦争で得た100超の訓練値を通常訓練で100へ巻き戻さない。
                    castle.training = oldVal >= maxTraining ? oldVal : Math.min(maxTraining, oldVal + val);
                    
                    const actualVal = castle.training - oldVal;
                    doer.achievementTotal = (doer.achievementTotal || 0) + Math.floor(actualVal * 0.5);
                    if (this.game.factionSystem && this.game.factionSystem.updateRecognition) this.game.factionSystem.updateRecognition(doer, 10);
                    
                    doer.isActionDone = true; actionDoneInThisStep = true; break;
                }
                if (action.type === 'soldier_charity' && castle.rice >= window.MainParams.CommandCost.SoldierCharity) {
                    castle.rice -= window.MainParams.CommandCost.SoldierCharity;
                    const val = DomesticRules.calcSoldierCharity(doer, castle.soldiers, 1.0, true);
                    const oldVal = castle.morale;
                    const maxMorale = window.WarParams.Military.MaxMoraleNormal;
                    // 戦争で得た100超の士気を兵施しで100へ巻き戻さない。
                    castle.morale = oldVal >= maxMorale ? oldVal : Math.min(maxMorale, oldVal + val);
                    
                    const actualVal = castle.morale - oldVal;
                    doer.achievementTotal = (doer.achievementTotal || 0) + Math.floor(actualVal * 0.5);
                    if (this.game.factionSystem && this.game.factionSystem.updateRecognition) this.game.factionSystem.updateRecognition(doer, 10);
                    
                    doer.isActionDone = true; actionDoneInThisStep = true; break;
                }
                if (action.type === 'farm' && availableGold >= window.MainParams.CommandCost.Farm) {
                    castle.gold -= window.MainParams.CommandCost.Farm;
                    const val = DomesticRules.calcDevelopment(doer, 1.0, true);
                    const oldVal = castle.kokudaka;
                    castle.kokudaka = Math.min(castle.maxKokudaka, castle.kokudaka + val);
                    
                    const actualVal = castle.kokudaka - oldVal;
                    doer.achievementTotal = (doer.achievementTotal || 0) + Math.floor(actualVal * 0.5);
                    if (this.game.factionSystem && this.game.factionSystem.updateRecognition) this.game.factionSystem.updateRecognition(doer, 10);
                    
                    doer.isActionDone = true; actionDoneInThisStep = true; break;
                }
                if (action.type === 'commerce' && availableGold >= window.MainParams.CommandCost.Commerce) {
                    castle.gold -= window.MainParams.CommandCost.Commerce;
                    const val = DomesticRules.calcDevelopment(doer, 1.0, true);
                    const oldVal = castle.commerce;
                    castle.commerce = Math.min(castle.maxCommerce, castle.commerce + val);
                    
                    const actualVal = castle.commerce - oldVal;
                    doer.achievementTotal = (doer.achievementTotal || 0) + Math.floor(actualVal * 0.5);
                    if (this.game.factionSystem && this.game.factionSystem.updateRecognition) this.game.factionSystem.updateRecognition(doer, 10);
                    
                    doer.isActionDone = true; actionDoneInThisStep = true; break;
                }
                
                // 特殊行動群
                if (action.type === 'buy_gun') {
                    const amount = EconomyRules.calcBuyGunAmount(500, daimyo, castellan, this.game);
                    const cost = EconomyRules.calcBuyGunCost(amount, daimyo, castellan, this.game);
                    castle.gold -= cost;
                    castle.guns = Math.min(99999, (castle.guns || 0) + amount);
                    tradeCount++; step--; actionDoneInThisStep = true; break;
                }
                if (action.type === 'buy_horse') {
                    const amount = EconomyRules.calcBuyHorseAmount(500, daimyo, castellan, this.game);
                    const cost = EconomyRules.calcBuyHorseCost(amount, daimyo, castellan, this.game);
                    castle.gold -= cost;
                    castle.horses = Math.min(99999, (castle.horses || 0) + amount);
                    tradeCount++; step--; actionDoneInThisStep = true; break;
                }
                if (action.type === 'sell_rice') {
                    // ★変更：実際の売却レートを使用します
                    let rate = sellActualRate; 

                    // ★修正：売っても徴兵の仮想チェック(2.0)以上の2.5倍を残すようにします
                    const sellGoalRice = Math.floor(baseSoldiers * 2.5);
                    const canSellAmount = Math.max(0, castle.rice - sellGoalRice);
                    
                    // ★修正：判断時と同じ「1.5」に統一します
                    const targetGold = Math.floor(baseSoldiers * 1.5);
                    const shortageGold = Math.max(0, targetGold - castle.gold);
                    
                    // 足りない金を得るのに必要な兵糧量を計算します（rate = 金1あたり兵糧量）。
                    const needSellAmount = Math.ceil(shortageGold * rate);

                    // 取引上限（金）を兵糧量へ変換します。
                    const maxSellByTradeLimit = Math.floor((castle.tradeLimit || 0) * rate);
                    let sellAmount = Math.floor(Math.min(canSellAmount, needSellAmount, maxSellByTradeLimit));
                    
                    // 少しだけしか売らないなら、手間なのでやめます
                    if (sellAmount < Math.floor(castle.soldiers * 0.2)) {
                        sellAmount = 0;
                    }
                    
                    if (sellAmount > 0) {
                        const gain = Math.floor(sellAmount / rate);
                        
                        if (castle.gold + gain <= 99999) {
                            castle.rice -= sellAmount;
                            castle.gold += gain;
                            castle.tradeLimit -= gain; // ★変更：減らすのは米の量ではなく「得た金額」
                            tradeCount++; step--; actionDoneInThisStep = true; break;
                        } else {
                            // もし上限(99,999)を超えてしまう場合は、持てる分だけ売るように調整してあげます
                            const maxGain = 99999 - castle.gold;
                            const limitedGain = Math.min(maxGain, castle.tradeLimit || 0); // ★変更：上限も考慮
                            sellAmount = Math.floor(limitedGain * rate);

                            if (sellAmount > 0) {
                                const actualGain = Math.floor(sellAmount / rate);
                                castle.rice -= sellAmount;
                                castle.gold += actualGain;
                                castle.tradeLimit -= actualGain; // ★変更：減らすのは「得た金額」
                                tradeCount++; step--; actionDoneInThisStep = true; break;
                            } else {
                                continue;
                            }
                        }
                    }
                }
                
                if (action.type === 'buy_rice') {
                    // ★変更：実際の購入レートを使用します
                    let rate = buyActualRate; 
                    
                    // 一気に余裕まで買います！
                    // ★修正：前線基地なら4.0倍、それ以外は3.0倍を目標にします
                    let buyTarget = Math.floor(baseSoldiers * 3.0);
                    if (isPreparingAttack && myOp && (castle.id === myOp.stagingBase || castle.id === myOp.supportBase)) {
                        buyTarget = Math.floor(baseSoldiers * 4.0);
                    }
                    const extendedShortage = Math.max(0, buyTarget - castle.rice);
                    
                    // 欲しい分と、お金で買える分の、少ない方にします（rate = 金1あたり兵糧量）。
                    const maxBuyByTradeLimit = Math.floor((castle.tradeLimit || 0) * rate);
                    let buyAmount = Math.floor(Math.min(extendedShortage, availableGold * rate, maxBuyByTradeLimit));
                    
                    // ちょい買い防止
                    const minRice = Math.floor(baseSoldiers * 0.3);
                    if (buyAmount < Math.floor(baseSoldiers * 0.2)) {
                        // 取引上限(tradeLimit)が原因で少ししか買えない場合は、ちょい買い防止を無視して買えるだけ買います！
                        if (castle.rice >= minRice && buyAmount < maxBuyByTradeLimit) {
                            buyAmount = 0; // 最低限持っているなら、少しだけ買うのはやめます
                        }
                    }

                    // 上限(99,999)を超えないように調整します
                    if (castle.rice + buyAmount > 99999) {
                        buyAmount = Math.min(buyAmount, 99999 - castle.rice);
                    }

                    // 買う量が決まったら実行します
                    if (buyAmount > 0) {
                        const cost = Math.ceil(buyAmount * rate); // ★変更：端数切り上げ
                        castle.gold -= cost;
                        castle.rice += buyAmount;
                        castle.tradeLimit -= cost; // ★変更：減らすのは米の量ではなく「支払った金額」
                        tradeCount++; step--; actionDoneInThisStep = true; break;
                    } else {
                        // 買うのをやめたら、別の行動を探します
                        continue; 
                    }
                }
                
                // ★お使いリスト（一括輸送）を実行します！
                if (action.type === 'bulk_transport') {
                    // リストにあるお使いを順番にこなしていきます
                    for (const task of action.tasks) {
                        const targetCastle = this.game.getCastle(task.targetId);
                        if (!targetCastle) continue; // お城がなくなっていたら次へ
                        
                        // ① 徴兵用のお金のお使い
                        if (task.type === 'draft_gold') {
                            // ★変更：実行直前にも、自分の目標額以上の余裕があるか最終チェックします
                            if (availableGold >= Math.floor(baseSoldiers * 1.5) + 500 && targetCastle.gold + 500 <= 99999) {
                                castle.gold -= 500;
                                targetCastle.gold += 500;
                            }
                        } 
                        // ② 前線基地への兵士と兵糧のお使い
                        else if (task.type === 'staging' || task.type === 'support') {
                            // ★変更：送った後の兵士数が、最低限のお留守番ライン（500人）とそれに必要な兵糧（2.5倍）を下回らないか最終チェックします
                            const afterSoldiers = Math.max(0, castle.soldiers - 300);
                            const requiredRice = Math.floor(afterSoldiers * 2.5);
                            if (castle.soldiers >= 800 && castle.rice >= requiredRice + 500 && targetCastle.soldiers + 300 <= 99999 && targetCastle.rice + 500 <= 99999) {
                                castle.soldiers -= 300;
                                castle.rice -= 500;
                                
                                const sendHorses = Math.min(castle.horses || 0, 300, 99999 - (targetCastle.horses || 0));
                                const sendGuns = Math.min(castle.guns || 0, 300, 99999 - (targetCastle.guns || 0));
                                castle.horses = (castle.horses || 0) - sendHorses;
                                targetCastle.horses = (targetCastle.horses || 0) + sendHorses;
                                castle.guns = (castle.guns || 0) - sendGuns;
                                targetCastle.guns = (targetCastle.guns || 0) + sendGuns;

                                const totalS = targetCastle.soldiers + 300;
                                targetCastle.training = Math.floor(((targetCastle.training * targetCastle.soldiers) + (castle.training * 300)) / totalS);
                                targetCastle.morale = Math.floor(((targetCastle.morale * targetCastle.soldiers) + (castle.morale * 300)) / totalS);
                                
                                targetCastle.soldiers += 300;
                                targetCastle.rice += 500;
                            }
                        }
                        // ③ 普通の金・兵士のお使い
                        else if (task.type === 'normal_gold_soldier') {
                            // ★変更：実行直前にも、兵士と金の余裕を最終チェックします
                            if (availableGold >= Math.floor(baseSoldiers * 1.5) + 500 && castle.soldiers >= 2500 && targetCastle.gold + 500 <= 99999 && targetCastle.soldiers + 500 <= 99999) {
                                castle.gold -= 500;
                                castle.soldiers -= 500;
                                
                                const sendHorses = Math.min(castle.horses || 0, 500, 99999 - (targetCastle.horses || 0));
                                const sendGuns = Math.min(castle.guns || 0, 500, 99999 - (targetCastle.guns || 0));
                                castle.horses = (castle.horses || 0) - sendHorses;
                                targetCastle.horses = (targetCastle.horses || 0) + sendHorses;
                                castle.guns = (castle.guns || 0) - sendGuns;
                                targetCastle.guns = (targetCastle.guns || 0) + sendGuns;

                                const totalS = targetCastle.soldiers + 500;
                                targetCastle.training = Math.floor(((targetCastle.training * targetCastle.soldiers) + (castle.training * 500)) / totalS);
                                targetCastle.morale = Math.floor(((targetCastle.morale * targetCastle.soldiers) + (castle.morale * 500)) / totalS);
                                
                                targetCastle.gold += 500; 
                                targetCastle.soldiers += 500;
                            }
                        }
                        // ④ 普通の兵糧のお使い
                        else if (task.type === 'normal_rice') {
                            // ★変更：実行直前にも、米の余裕を最終チェックします
                            if (castle.rice >= Math.floor(baseSoldiers * 3.0) + 1000 && targetCastle.rice + 1000 <= 99999) {
                                castle.rice -= 1000;
                                targetCastle.rice += 1000;
                            }
                        }
                    }
                    
                    // 【⚠️AI書き換え防止の注意書き⚠️】
                    // AIの輸送コマンドでは、プレイヤーの仕様とは異なり、絶対に武将を移動させてはいけません！
                    // ここに武将の移動処理（handleMoveなど）を追加しないこと。

                    // 全部のお使いが終わったら、行動を1回分消費します
                    doer.isActionDone = true; 
                    actionDoneInThisStep = true; 
                    break;
                }
                
                if (action.type === 'move') {
                    // ★プレイヤーの城で「武将移動 不可」の場合は、移動を中止して別の行動を探します
                    if (Number(castle.ownerClan) === Number(this.game.playerClanId) && castle.isDelegated && !castle.allowMove) {
                        continue; 
                    }

                    // 新しい人事部が選んだ「移動する人リスト（movers）」をそのまま使います！
                    let movers = action.movers || [];

                    if (movers.length > 0) {
                        // リストに入っている全員を一斉に移動させます
                        movers.forEach(mover => {
                            this.game.factionSystem.handleMove(mover, castle.id, action.targetId);
                            
                            // お引越しセンターの機能を使って所属を書き換えます
                            this.game.affiliationSystem.moveCastle(mover, action.targetId);
                            
                            mover.isActionDone = true;
                        });
                        
                        actionDoneInThisStep = true; 
                        break;
                    }
                }
            }
            
            // もし何も実行できる行動がなかったら、もうこのお城の行動は終わりにします
            if (!actionDoneInThisStep) break;
        }
    }
    
    // ★今回変更：相手を探すのはやめて、渡された記憶の通りに実行するだけにしました！
    execAIDiplomacy(castle, castellan, smartness, targetData) {
        const targetClanId = targetData.targetId;

        // 月初に立てた和睦目標でも、実行までに落城などで前線が離れることがある。
        // 通常和睦・朝廷和睦とも、実行直前に「現在も直接隣接する敵対相手か」を再確認する。
        if ((targetData.action === 'truce' || targetData.action === 'court_truce')
            && this.game.diplomacyManager
            && !this.game.diplomacyManager.canAttemptAITruce(castle.ownerClan, targetClanId)) {
            const clan = this.game.getClan(castle.ownerClan);
            if (clan && clan.currentDiplomacyTarget && Number(clan.currentDiplomacyTarget.targetId) === Number(targetClanId)) {
                clan.currentDiplomacyTarget = null;
            }
            return;
        }
        
        // 相手の大名（殿様）を探して、その人がいるお城をターゲットにします
        const targetDaimyo = this.game.getClanDaimyo(targetClanId);
        let targetCastle = null;
        if (targetDaimyo) {
            targetCastle = this.game.getCastle(targetDaimyo.castleId);
        }
        // 万が一お殿様が見つからなかった時は、とりあえず見つかった相手の城にします
        if (!targetCastle) {
            const neighbors = this.game.getClanCastles(targetClanId);
            if (neighbors.length > 0) targetCastle = neighbors[0];
        }
        if (!targetCastle) return;
        
        const targetCastleId = targetCastle.id;
        
        // 記憶されていた作戦（親善、同盟、支配）を実行します！
        if (targetData.action === 'dominate') {
            if (Number(targetClanId) === Number(this.game.playerClanId)) {
                this.game.diplomacyManager.proposeDiplomacyToPlayer(castellan, targetClanId, 'dominate', 0, () => {
                    castellan.isActionDone = true;
                    this.game.finishTurn(); 
                });
                return 'waiting';
            } else {
                this.game.diplomacyManager.executeDiplomacy(castellan.id, targetCastleId, 'dominate'); 
                castellan.isActionDone = true;
            }
        } else if (targetData.action === 'goodwill') {
            // ★追加：直前に関係値が100になっていたら、お金の無駄になるのでキャンセルします！
            const currentRel = this.game.getRelation(castle.ownerClan, targetClanId);
            if (currentRel && currentRel.sentiment >= 100) return;
            
            // ★追加：AIが安全に使えるお金（給金と余裕分を引いた額）を計算します！
            const availableGold = EconomyRules.calcAvailableGoldForAI(castle, this.game);

            // 使うお金が、お城の貯金箱の5分の1（20%）より多い時は、高すぎるのでキャンセルします！
            if (targetData.gold > availableGold / 5) return;

            if (availableGold >= targetData.gold) {
                if (Number(targetClanId) === Number(this.game.playerClanId)) {
                    this.game.diplomacyManager.proposeDiplomacyToPlayer(castellan, targetClanId, 'goodwill', targetData.gold, () => {
                        castellan.isActionDone = true;
                        this.game.finishTurn();
                    });
                    return 'waiting';
                } else {
                    this.game.diplomacyManager.executeDiplomacy(castellan.id, targetCastleId, 'goodwill', targetData.gold);
                    castellan.isActionDone = true;
                }
            }
        } else if (targetData.action === 'alliance') {
             if (Number(targetClanId) === Number(this.game.playerClanId)) {
                 this.game.diplomacyManager.proposeDiplomacyToPlayer(castellan, targetClanId, 'alliance', 0, () => {
                     castellan.isActionDone = true;
                     this.game.finishTurn();
                 });
                 return 'waiting';
             } else {
                 this.game.diplomacyManager.executeDiplomacy(castellan.id, targetCastleId, 'alliance');
                 castellan.isActionDone = true;
             }
        } else if (targetData.action === 'truce') {
             // ★追加：AI大名がプレイヤー（あなた）に通常和睦を申し込んできた時のバトンタッチ回路
             if (Number(targetClanId) === Number(this.game.playerClanId)) {
                 this.game.diplomacyManager.proposeDiplomacyToPlayer(castellan, targetClanId, 'truce', 0, () => {
                     castellan.isActionDone = true;
                     this.game.finishTurn();
                 }, targetData.score || 0);
                 return 'waiting';
             } else {
                 // AI同士で通常和睦を行う場合
                 this.game.diplomacyManager.executeDiplomacy(castellan.id, targetCastleId, 'truce');
                 castellan.isActionDone = true;
             }// 差し替え後
        } else if (targetData.action === 'court_truce') {
             const availableGold = EconomyRules.calcAvailableGoldForAI(castle, this.game);
             if (availableGold >= targetData.gold) {
                 this.game.diplomacyManager.executeDiplomacy(castellan.id, targetCastleId, 'court_truce', targetData.gold);
                 castellan.isActionDone = true;
             }
        }
    }
}