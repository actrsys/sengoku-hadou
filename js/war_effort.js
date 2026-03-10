/**
 * war_effort.js
 * 戦争の準備（戦前）と、戦後処理・捕虜の処遇などを担当するファイルです
 */

// Object.assign を使って、WarManager に魔法をくっつけます！
Object.assign(WarManager.prototype, {

    // ★攻撃側と守備側の敵対関係をセットする魔法
    applyWarHostility(atkId, atkIsKunishu, defId, defIsKunishu, isReinforcement) {
        // どちらかが国人衆の場合、あるいは中立（0）の場合は外交関係がないので何もしません
        if (atkIsKunishu || defIsKunishu || atkId === 0 || defId === 0) return;
        
        // 両者の関係を「敵対」にします
        if (this.game.diplomacyManager) {
            this.game.diplomacyManager.changeStatus(atkId, defId, '敵対');
            
            // ★追加：主役同士（援軍じゃない場合）は、友好度を「０」まで減らします！（-100すれば必ず0になります）
            if (!isReinforcement) {
                this.game.diplomacyManager.updateSentiment(atkId, defId, -100);
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

        // 万が一、全員が馬か鉄砲になってしまった時に、「最後に変身した人」を覚えておく箱です
        let lastChangedAssign = null;

        // 2. 強い人から順番に、馬や鉄砲を配っていきます
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
        try {
            let atkLeaderIdx = atkBushos.findIndex(b => b.isDaimyo);
            if (atkLeaderIdx === -1) atkLeaderIdx = atkBushos.findIndex(b => b.isCastellan);
            if (atkLeaderIdx > 0) {
                const leader = atkBushos.splice(atkLeaderIdx, 1)[0];
                atkBushos.unshift(leader);
            }
            
            const pid = Number(this.game.playerClanId);
            const atkClan = Number(atkCastle.ownerClan);
            const defClan = Number(defCastle.ownerClan);
            let isPlayerInvolved = false;
            if (atkClan === pid && !atkCastle.isDelegated) isPlayerInvolved = true;
            if (defClan === pid && !defCastle.isDelegated) isPlayerInvolved = true;
            
            // 1. AIの場合は、城にある馬と鉄砲を全部持っていく準備をします
            if (atkClan !== pid && !atkCastle.isKunishu) {
                atkHorses = atkCastle.horses || 0; 
                atkGuns = atkCastle.guns || 0;
            }

            // 2. 援軍を合流させる「前」に、出陣元の城から本隊の兵士や兵糧を減らしておきます！
            atkCastle.soldiers = Math.max(0, atkCastle.soldiers - atkSoldierCount);
            atkCastle.rice = Math.max(0, atkCastle.rice - atkRice);
            atkCastle.horses = Math.max(0, (atkCastle.horses || 0) - atkHorses);
            atkCastle.guns = Math.max(0, (atkCastle.guns || 0) - atkGuns);
            atkBushos.forEach(b => b.isActionDone = true);

            // 3. 城のお留守番の数が確定したら、合戦で戦う「全体の数」として援軍を合流（足し算）させます！
            const processReinforcement = (reinfData) => {
                if (reinfData) {
                    const hC = reinfData.castle;
                    atkSoldierCount += reinfData.soldiers; 
                    atkRice += reinfData.rice;
                    atkHorses += reinfData.horses; 
                    atkGuns += reinfData.guns;
                    atkBushos = atkBushos.concat(reinfData.bushos);
                    if (hC.ownerClan === pid && !hC.isDelegated) isPlayerInvolved = true;
                }
            };
            processReinforcement(selfReinforcementData);
            processReinforcement(reinforcementData);

            const atkClanData = this.game.clans.find(c => c.id === atkClan); 
            const atkArmyName = atkCastle.isKunishu ? atkCastle.name : (atkClanData ? atkClanData.getArmyName() : "敵軍");
            const atkDaimyoName = atkClanData ? atkClanData.name : (atkCastle.isKunishu ? atkCastle.name : "中立");
            const defClanData = this.game.clans.find(c => c.id === defClan);
            const defDaimyoName = defClanData ? defClanData.name : (defCastle.isKunishu ? defCastle.name : "中立");
            
            const startMsg = `${atkDaimyoName}の${atkBushos[0].name}が\n${defDaimyoName}の${defCastle.name}に攻め込みました！`;
            this.game.ui.log(startMsg.replace('\n', ''));
            
            let defBusho = null;
            if (defCastle.isKunishu) {
                const kunishu = this.game.kunishuSystem.getKunishu(defCastle.kunishuId);
                defBusho = kunishu ? this.game.getBusho(kunishu.leaderId) : null;
            } else defBusho = this.game.getBusho(defCastle.castellanId);
            if (!defBusho) defBusho = {name:"守備隊長", strength:30, leadership:30, intelligence:30, charm:30, faceIcon: "unknown_face.webp"};
            
            const attackerForce = {
                name: atkCastle.isKunishu ? atkCastle.name : atkCastle.name + "遠征軍", 
                ownerClan: atkCastle.ownerClan, soldiers: atkSoldierCount, bushos: atkBushos, 
                training: atkCastle.training, morale: atkCastle.morale, rice: atkRice, maxRice: atkRice,
                horses: atkHorses, guns: atkGuns, isKunishu: atkCastle.isKunishu || false, kunishuId: atkCastle.kunishuId || 0
            };

            // ★攻撃側と守備側を「敵対」にする処理（直接書き込みます！）
            if (this.game.diplomacyManager && !atkCastle.isKunishu && !defCastle.isKunishu && atkClan !== 0 && defClan !== 0) {
                this.game.diplomacyManager.changeStatus(atkClan, defClan, '敵対');
                // ★追加：攻撃側と守備側の友好度を０にします！
                this.game.diplomacyManager.updateSentiment(atkClan, defClan, -100);
            }
            if (reinforcementData && this.game.diplomacyManager && !reinforcementData.castle.isKunishu && !defCastle.isKunishu) {
                const helperClan = reinforcementData.castle.ownerClan;
                if (helperClan !== 0 && defClan !== 0) {
                    this.game.diplomacyManager.changeStatus(helperClan, defClan, '敵対');
                }
            }

            this.state = { 
                active: true, round: 1, attacker: attackerForce, sourceCastle: atkCastle, 
                defender: defCastle, atkBushos: atkBushos, defBusho: defBusho, 
                turn: 'attacker', isPlayerInvolved: isPlayerInvolved, deadSoldiers: { attacker: 0, defender: 0 }, defenderGuarding: false,
                reinforcement: reinforcementData, selfReinforcement: selfReinforcementData
            };
            
            if (!isPlayerInvolved) await this.game.ui.showTapMessage(startMsg);

            const showInterceptDialog = async (onResult) => {
                if (isPlayerInvolved) await this.game.ui.showCutin(`${atkArmyName}の${atkBushos[0].name}が\n${defCastle.name}に攻め込みました！`);

                // ★追加：同盟軍のチェックを一時的に「箱（startAllyReinforcement）」にしまいます
                const startAllyReinforcement = () => {
                    this.checkDefenderReinforcement(defCastle, atkClan, () => {
                    const totalDefSoldiers = defCastle.soldiers + (this.state.defReinforcement ? this.state.defReinforcement.soldiers : 0) + (this.state.defSelfReinforcement ? this.state.defSelfReinforcement.soldiers : 0);
                    isPlayerInvolved = this.state.isPlayerInvolved;

                    if (defClan === pid && !defCastle.isDelegated) {
    	                if (totalDefSoldiers <= 0) {
    	                    if (isPlayerInvolved) this.game.ui.log("城に兵士がいないため、迎撃（野戦）に出られません！");
    	                    onResult('siege');
    	                } else {
                            const modal = document.getElementById('intercept-confirm-modal');
                            if (modal) {
                                // ★変更：ui.js に作った魔法を呼び出してガードを隠します
                                this.game.ui.hideAIGuardTemporarily();
                                modal.classList.remove('hidden');
                                document.getElementById('intercept-msg').innerText = `${atkArmyName}の${atkBushos[0].name}が攻めてきました！\n敵軍: ${atkSoldierCount} 対 自軍: ${totalDefSoldiers}\n迎撃（野戦）しますか？籠城しますか？`;
                                
                                document.getElementById('btn-intercept').onclick = () => { 
                                    modal.classList.add('hidden'); 
                                    this.game.ui.restoreAIGuard(); // ★追加：画面を閉じたらガードを戻す
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
                                                        // ★守備側援軍の自動編成と合流
                                                        let finalDefAssignments = myDefAssignments;
                                                        if (this.state.defReinforcement) {
                                                            const r = this.state.defReinforcement;
                                                            const rAssign = this.autoDivideSoldiers(r.bushos, r.soldiers, r.horses, r.guns);
                                                            finalDefAssignments = finalDefAssignments.concat(rAssign);
                                                        }

                                                        // ★攻撃軍（AI本隊＋援軍）の自動編成と合流
                                                        let finalAtkAssignments = [];
                                                        if (this.state.reinforcement) {
                                                            const r = this.state.reinforcement;
                                                            const mainBushos = atkBushos.filter(b => !r.bushos.some(rb => rb.id === b.id));
                                                            const mainAssign = this.autoDivideSoldiers(mainBushos, Math.max(0, atkSoldierCount - r.soldiers), Math.max(0, atkHorses - r.horses), Math.max(0, atkGuns - r.guns));
                                                            const rAssign = this.autoDivideSoldiers(r.bushos, r.soldiers, r.horses, r.guns);
                                                            finalAtkAssignments = mainAssign.concat(rAssign);
                                                        } else {
                                                            finalAtkAssignments = this.autoDivideSoldiers(atkBushos, atkSoldierCount, atkHorses, atkGuns);
                                                        }

                                                        onResult('field', finalDefAssignments, interceptRice, finalAtkAssignments, interceptHorses, interceptGuns);
                                                    },
                                                    // ★兵士配分画面でキャンセルしたら、最初の選択画面に戻す
                                                    () => { 
                                                        this.game.ui.hideAIGuardTemporarily(); // ★追加：戻ってきたらまた隠す
                                                        modal.classList.remove('hidden'); 
                                                    }
                                                    );
                                                },
                                                // ★兵数入力画面でキャンセルしたら、最初の選択画面に戻す
                                                onCancel: () => { 
                                                    this.game.ui.hideAIGuardTemporarily(); // ★追加
                                                    modal.classList.remove('hidden'); 
                                                }
                                            });
                                        },
                                        // ★武将選択画面でキャンセルしたら、最初の選択画面に戻す
                                        onCancel: () => { 
                                            this.game.ui.hideAIGuardTemporarily(); // ★追加
                                            modal.classList.remove('hidden'); 
                                        }
                                    });
                                };
                                document.getElementById('btn-siege').onclick = () => { 
                                    modal.classList.add('hidden'); 
                                    this.game.ui.restoreAIGuard(); // ★追加
                                    onResult('siege'); 
                                };
                            } else onResult('siege');
                        }
                    } else {
                        if (totalDefSoldiers >= atkSoldierCount * 0.8) {
                            // ★国人衆（belongKunishuIdが0以外）を弾く魔法を追加！
                            let availableDefBushos = this.game.getCastleBushos(defCastle.id).filter(b => b.status !== 'dead' && b.status !== 'ronin' && b.status !== 'unborn' && b.belongKunishuId === 0);
                            // 1. 誰がみんなの強さを見積もるか（評価者）を決めます！
                            // その城にいる大名、いなければ城主が評価者になります
                            let evaluator = availableDefBushos.find(b => b.isDaimyo);
                            if (!evaluator) evaluator = availableDefBushos.find(b => b.isCastellan);
                            
                            let evaluatorInt = 50;
                            let evaluatorId = 0;
                            if (evaluator) {
                                evaluatorInt = evaluator.intelligence;
                                evaluatorId = evaluator.id;
                            }

                            // 2. 評価者の智謀によって、どれくらい見誤るかを決めます
                            let maxError = 0;
                            if (evaluatorInt <= 50) {
                                maxError = 0.2; 
                            } else if (evaluatorInt >= 95) {
                                maxError = 0;   
                            } else {
                                maxError = 0.2 * (95 - evaluatorInt) / 45;
                            }

                            // 3. 各武将の戦闘力を見積もります
                            const evaluatedBushos = availableDefBushos.map(b => {
                                const truePower = (b.leadership + b.strength + b.intelligence) / 2;
                                let perceivedPower = truePower;
                                
                                // 自分自身（評価者）じゃなかったら勘違いのサイコロを振ります！
                                if (b.id !== evaluatorId) {
                                    const errorRate = 1.0 + (Math.random() - 0.5) * 2 * maxError;
                                    perceivedPower = truePower * errorRate;
                                }
                                return { busho: b, perceivedPower: perceivedPower };
                            });

                            // 4. 一番高い戦闘力を基準にします
                            let maxPower = 0;
                            evaluatedBushos.forEach(eb => {
                                if (eb.perceivedPower > maxPower) maxPower = eb.perceivedPower;
                            });

                            // 5. 7割以下の人はお留守番！強い順に並べて最大5人選びます
                            const threshold = maxPower * 0.7;
                            const defBushos = evaluatedBushos
                                .filter(eb => eb.perceivedPower > threshold) 
                                .sort((a, b) => b.perceivedPower - a.perceivedPower) 
                                .slice(0, 5) // 迎撃時は最大5人まで出陣できます
                                .map(eb => eb.busho);
                                
                            // 6. 選ばれた人の中に大名か城主がいれば、総大将（一番前）にします
                            let defLeaderIdx = defBushos.findIndex(b => b.isDaimyo);
                            if (defLeaderIdx === -1) defLeaderIdx = defBushos.findIndex(b => b.isCastellan);
                            if (defLeaderIdx > 0) {
                                const leader = defBushos.splice(defLeaderIdx, 1)[0];
                                defBushos.unshift(leader);
                            }
                            
                            const handleDefDivide = (callback) => {
                                let finalDefAssignments = [];
                                
                                // ★順番を上にして、矢印の魔法（アロー関数）に変えます！
                                const finishDef = () => {
                                    const mainAssigns = this.autoDivideSoldiers(defBushos, defCastle.soldiers, defCastle.horses || 0, defCastle.guns || 0);
                                    callback(mainAssigns.concat(finalDefAssignments));
                                };

                                const processNextDef = () => {
                                    if (this.state.defReinforcement && this.state.defReinforcement.castle.ownerClan === pid) {
                                        this.game.ui.showUnitDivideModal(this.state.defReinforcement.bushos, this.state.defReinforcement.soldiers, this.state.defReinforcement.horses, this.state.defReinforcement.guns, (rAssigns) => {
                                            finalDefAssignments = finalDefAssignments.concat(rAssigns);
                                            finishDef();
                                        });
                                    } else {
                                        if (this.state.defReinforcement) finalDefAssignments = finalDefAssignments.concat(this.autoDivideSoldiers(this.state.defReinforcement.bushos, this.state.defReinforcement.soldiers, this.state.defReinforcement.horses, this.state.defReinforcement.guns));
                                        finishDef();
                                    }
                                };

                                if (this.state.defSelfReinforcement && this.state.defSelfReinforcement.castle.ownerClan === pid) {
                                    this.game.ui.showUnitDivideModal(this.state.defSelfReinforcement.bushos, this.state.defSelfReinforcement.soldiers, this.state.defSelfReinforcement.horses, this.state.defSelfReinforcement.guns, (srAssigns) => {
                                        finalDefAssignments = finalDefAssignments.concat(srAssigns);
                                        processNextDef();
                                    });
                                } else {
                                    if (this.state.defSelfReinforcement) finalDefAssignments = finalDefAssignments.concat(this.autoDivideSoldiers(this.state.defSelfReinforcement.bushos, this.state.defSelfReinforcement.soldiers, this.state.defSelfReinforcement.horses, this.state.defSelfReinforcement.guns));
                                        processNextDef();
                                }
                            };

                            const handleAtkDivide = (defAssigns, callback) => {
                                let finalAtkAssignments = [];
                                
                                // ★修正：順番を上にして、矢印の魔法（アロー関数）に変えます！
                                const finishAtk = () => {
                                    if (atkClan === pid && !atkCastle.isDelegated && !attackerForce.isKunishu) {
                                        let myAtkS = atkSoldierCount - (this.state.reinforcement ? this.state.reinforcement.soldiers : 0) - (this.state.selfReinforcement ? this.state.selfReinforcement.soldiers : 0);
                                        let myAtkH = atkHorses - (this.state.reinforcement ? this.state.reinforcement.horses : 0) - (this.state.selfReinforcement ? this.state.selfReinforcement.horses : 0);
                                        let myAtkG = atkGuns - (this.state.reinforcement ? this.state.reinforcement.guns : 0) - (this.state.selfReinforcement ? this.state.selfReinforcement.guns : 0);
                                        const mainBushos = atkBushos.filter(b => (!this.state.reinforcement || !this.state.reinforcement.bushos.some(rb=>rb.id===b.id)) && (!this.state.selfReinforcement || !this.state.selfReinforcement.bushos.some(sb=>sb.id===b.id)));
                                        this.game.ui.showUnitDivideModal(mainBushos, Math.max(0, myAtkS), Math.max(0, myAtkH), Math.max(0, myAtkG), (mainAssigns) => {
                                            callback(defAssigns, mainAssigns.concat(finalAtkAssignments));
                                        });
                                    } else {
                                        let myAtkS = atkSoldierCount - (this.state.reinforcement ? this.state.reinforcement.soldiers : 0) - (this.state.selfReinforcement ? this.state.selfReinforcement.soldiers : 0);
                                        let myAtkH = atkHorses - (this.state.reinforcement ? this.state.reinforcement.horses : 0) - (this.state.selfReinforcement ? this.state.selfReinforcement.horses : 0);
                                        let myAtkG = atkGuns - (this.state.reinforcement ? this.state.reinforcement.guns : 0) - (this.state.selfReinforcement ? this.state.selfReinforcement.guns : 0);
                                        const mainBushos = atkBushos.filter(b => (!this.state.reinforcement || !this.state.reinforcement.bushos.some(rb=>rb.id===b.id)) && (!this.state.selfReinforcement || !this.state.selfReinforcement.bushos.some(sb=>sb.id===b.id)));
                                        const mainAssigns = this.autoDivideSoldiers(mainBushos, Math.max(0, myAtkS), Math.max(0, myAtkH), Math.max(0, myAtkG));
                                        callback(defAssigns, mainAssigns.concat(finalAtkAssignments));
                                    }
                                };

                                const processNextAtk = () => {
                                    if (this.state.reinforcement && this.state.reinforcement.castle.ownerClan === pid) {
                                        this.game.ui.showUnitDivideModal(this.state.reinforcement.bushos, this.state.reinforcement.soldiers, this.state.reinforcement.horses, this.state.reinforcement.guns, (rAssigns) => {
                                            finalAtkAssignments = finalAtkAssignments.concat(rAssigns);
                                            finishAtk();
                                        });
                                    } else {
                                        if (this.state.reinforcement) finalAtkAssignments = finalAtkAssignments.concat(this.autoDivideSoldiers(this.state.reinforcement.bushos, this.state.reinforcement.soldiers, this.state.reinforcement.horses, this.state.reinforcement.guns));
                                        finishAtk();
                                    }
                                };

                                if (this.state.selfReinforcement && this.state.selfReinforcement.castle.ownerClan === pid) {
                                    this.game.ui.showUnitDivideModal(this.state.selfReinforcement.bushos, this.state.selfReinforcement.soldiers, this.state.selfReinforcement.horses, this.state.selfReinforcement.guns, (srAssigns) => {
                                        finalAtkAssignments = finalAtkAssignments.concat(srAssigns);
                                        processNextAtk();
                                    });
                                } else {
                                    if (this.state.selfReinforcement) finalAtkAssignments = finalAtkAssignments.concat(this.autoDivideSoldiers(this.state.selfReinforcement.bushos, this.state.selfReinforcement.soldiers, this.state.selfReinforcement.horses, this.state.selfReinforcement.guns));
                                    processNextAtk();
                                }
                            };

                            // ★順番に実行して、最後に野戦をスタートさせます！
                            handleDefDivide((finalDefAssignments) => {
                                handleAtkDivide(finalDefAssignments, (defAssigns, finalAtkAssignments) => {
                                    onResult('field', defAssigns, defCastle.rice, finalAtkAssignments, defCastle.horses || 0, defCastle.guns || 0);
                                });
                            });
                        } else onResult('siege');
                    }
                }); 
                
                }; // ★ここで同盟軍チェックの「箱」を閉じます

                // ★追加：ここからが本番！まずは自軍の援軍をチェックして、そのあとに同盟軍チェック（箱）を呼び出します！
                this.checkDefenderSelfReinforcement(defCastle, (selfReinfData) => {
                    if (selfReinfData) this.state.defSelfReinforcement = selfReinfData;
                    startAllyReinforcement();
                });
            };

            // 国人衆制圧戦の場合は野戦をスキップして即攻城戦へ
            if (this.state.isKunishuSubjugation) {
                this.startSiegeWarPhase();
            } else if (typeof window.FieldWarManager === 'undefined') {
                this.startSiegeWarPhase();
            } else {
                showInterceptDialog((choice, defAssignments, defRice, atkAssignments, interceptHorses = 0, interceptGuns = 0) => {
                    
                    // ★追加: 野戦か籠城かが決まったこのタイミングで、守備側の援軍を城（守備軍）に正式合流させる！
                    const applyDefReinf = (reinf) => {
                        if (!reinf) return;
                        defCastle.soldiers += reinf.soldiers; defCastle.rice += reinf.rice;
                        defCastle.horses = (defCastle.horses || 0) + reinf.horses; defCastle.guns = (defCastle.guns || 0) + reinf.guns;
                        reinf.bushos.forEach(b => { b.castleId = defCastle.id; if (!defCastle.samuraiIds.includes(b.id)) defCastle.samuraiIds.push(b.id); });
                    };
                    applyDefReinf(this.state.defSelfReinforcement);
                    applyDefReinf(this.state.defReinforcement);

                    if (choice === 'field') {
                    
                        this.state.atkAssignments = atkAssignments; this.state.defAssignments = defAssignments; 
                        
                        let totalDefSoldiers = 0; if(defAssignments) defAssignments.forEach(a => totalDefSoldiers += a.soldiers);
                        defCastle.soldiers = Math.max(0, defCastle.soldiers - totalDefSoldiers);
                        defCastle.rice = Math.max(0, defCastle.rice - (defRice || 0));
                        defCastle.horses = Math.max(0, (defCastle.horses || 0) - interceptHorses);
                        defCastle.guns = Math.max(0, (defCastle.guns || 0) - interceptGuns);
                        
                        this.state.defender.fieldSoldiers = totalDefSoldiers;
                        this.state.defFieldRice = defRice || 0; 
                        this.state.defender.fieldHorses = interceptHorses;
                        this.state.defender.fieldGuns = interceptGuns;

                        if (!isPlayerInvolved) this.resolveAutoFieldWar();
                        else {
                            if (!this.game.fieldWarManager) this.game.fieldWarManager = new window.FieldWarManager(this.game);
                            this.game.fieldWarManager.startFieldWar(this.state, (resultType) => {
                                defCastle.soldiers += this.state.defender.fieldSoldiers;
                                defCastle.rice += this.state.defFieldRice; 
                                defCastle.horses = (defCastle.horses || 0) + (this.state.defender.fieldHorses || 0);
                                defCastle.guns = (defCastle.guns || 0) + (this.state.defender.fieldGuns || 0);
                                if (resultType === 'attacker_win' || resultType === 'defender_retreat' || resultType === 'draw_to_siege') this.startSiegeWarPhase();
                                else this.endWar(false);
                            });
                        }
                    } else this.startSiegeWarPhase();
                });
            }
        } catch(e) { console.error("StartWar Error:", e); this.state.active = false; this.game.finishTurn(); }
    },
    
    executeRetreatLogic(defCastle) {
        const candidates = this.game.castles.filter(c => c.ownerClan === defCastle.ownerClan && c.id !== defCastle.id && GameSystem.isReachable(this.game, defCastle, c, defCastle.ownerClan));
        if (candidates.length === 0) { this.endWar(true); return; }
        const s = this.state;
        
        const runRetreat = (targetId) => {
            if (!targetId) { this.endWar(true); return; } 
            const target = this.game.castles.find(c => c.id === targetId);
            if(target) {
                let lossRate = Math.min(0.9, Math.max(0.05, window.WarParams.War.RetreatResourceLossFactor + (s.attacker.soldiers / (defCastle.soldiers + 1)) * 0.1)); 
                const carryGold = Math.floor(defCastle.gold * (1.0 - lossRate)); const carryRice = Math.floor(defCastle.rice * (1.0 - lossRate));
                // ★追加：逃げ込んだ先の城がパンクしないように上限をかけます
                target.gold = Math.min(99999, target.gold + carryGold); 
                target.rice = Math.min(99999, target.rice + carryRice); 
                target.soldiers = Math.min(99999, target.soldiers + defCastle.soldiers);
                target.horses = Math.min(99999, (target.horses || 0) + (defCastle.horses || 0));
                target.guns = Math.min(99999, (target.guns || 0) + (defCastle.guns || 0));
                
                const capturedBushos = [];
                this.game.getCastleBushos(defCastle.id).forEach(b => { 
                    if (b.status === 'ronin') return;

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

        try {
            const s = this.state; s.active = false;
            
            // ★変更：城の所有者が変わる前に、古い大名家のIDをしっかり記憶しておきます！
            s.oldDefClanId = s.defender.ownerClan; 
            s.extinctionNotified = false; // フラグの初期化
            
            // ==========================================
            // ★ここから追加：AI同士の戦争の結果メッセージを出して時間を止めます！
            // ★修正：国人衆の戦いの時は専用のメッセージがあるので、ここではお休みします！
            if (!s.isPlayerInvolved && !s.isKunishuSubjugation && !s.attacker.isKunishu) {
                const atkClanData = this.game.clans.find(c => c.id === s.attacker.ownerClan);
                const defClanData = this.game.clans.find(c => c.id === s.oldDefClanId);
                const atkDaimyoName = atkClanData ? atkClanData.name : (s.attacker.isKunishu ? s.attacker.name : "中立");
                const defDaimyoName = defClanData ? defClanData.name : (s.defender.isKunishu ? s.defender.name : "中立");
                
                let resultMsg = "";
                if (attackerWon) {
                    // ★変更：城の名前の代わりに、攻撃軍の総大将（s.atkBushos[0].name）にします！
                    resultMsg = `${atkDaimyoName}の${s.atkBushos[0].name}が\n${defDaimyoName}の${s.defender.name}を攻め落としました！`;
                } else {
                    // ★変更：守備成功した時も、守備隊の総大将（s.defBusho.name）にします！
                    resultMsg = `${defDaimyoName}の${s.defBusho.name}が\n${atkDaimyoName}の攻撃を撃退しました！`;
                }
                
                // どこを触っても消せるメッセージを表示します！
                await this.game.ui.showTapMessage(resultMsg);
            }
            // ==========================================
            
            // ★変更：順番待ちができるように async を付けます
            const finishWarProcess = async () => {
                
                // ★ここから追加：合戦結果の画面を閉じたら、平時のBGMに戻す！
                if (window.AudioManager && s.isPlayerInvolved) {
                    window.AudioManager.restoreMemorizedBgm();
                }
                // ★追加ここまで
                
                const winnerClan = s.attacker.ownerClan; // 勝ったのは攻撃側です
                
                // ★追加：大名を登用した時のご褒美パワーをリセットしておきます
                this.daimyoHiredBonus = 0;

                if (this.pendingPrisoners && this.pendingPrisoners.length > 0) {
                    if (winnerClan === this.game.playerClanId) {
                        
                        // ★追加：捕虜の中に大名がいるか一番最初にチェックします！
                        const daimyoIndex = this.pendingPrisoners.findIndex(p => p.isDaimyo);
                        if (daimyoIndex !== -1) {
                            // 大名がいたら、先ほど作った大名専用の画面を最初に出します
                            this.game.ui.showDaimyoPrisonerModal(this.pendingPrisoners[daimyoIndex]);
                        } else {
                            // 大名がいなければ、いつもの一覧画面を出します
                            this.game.ui.showPrisonerModal(this.pendingPrisoners);
                        }
                        
                        // ==========================================
                        // ★ここが大事！
                        // プレイヤーが選ぶのを「待つ」ので、ここでは何もしません！
                        // （選んだ後の nextStep 魔法にお任せします）
                        // ==========================================
                        
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
            
            // 兵士の減った割合を計算して、馬と鉄砲も減らす（壊れる）処理
            // 野戦があった場合、ここでの horses と guns は既に野戦生き残り数に更新されており、
            // originalAtkSoldiers も攻城戦開始時の兵数（野戦生き残り数）となるため、攻城戦での損耗だけが反映される。
            const originalAtkSoldiers = Math.max(1, s.attacker.soldiers + s.deadSoldiers.attacker);
            const atkSurviveRate = Math.max(0, s.attacker.soldiers) / originalAtkSoldiers;
            
            // ★修正：攻城戦では攻撃側の馬と鉄砲が減らないように、以下の2行の先頭に「//」をつけてお休みにします！
            // s.attacker.horses = Math.floor((s.attacker.horses || 0) * atkSurviveRate);
            // s.attacker.guns = Math.floor((s.attacker.guns || 0) * atkSurviveRate);            

            // 守備側（城）の馬と鉄砲も、兵士の損耗に合わせて壊れるようにする
            if (!s.defender.isKunishu) {
                const originalDefSoldiers = s.defender.soldiers + s.deadSoldiers.defender;
                const defSurviveRate = originalDefSoldiers > 0 ? (Math.max(0, s.defender.soldiers) / originalDefSoldiers) : 0;
                // ★修正：守備側の馬と鉄砲も減らないように、以下の2行の先頭に「//」をつけてお休みにします！
                // s.defender.horses = Math.floor((s.defender.horses || 0) * defSurviveRate);
                // s.defender.guns = Math.floor((s.defender.guns || 0) * defSurviveRate);
            }
            
            // 援軍部隊を元の城に帰還させる処理をまとめた関数
            const returnReinforcement = (reinf, isAttackerData) => {
                if (!reinf) return;
                const helperCastle = this.game.getCastle(reinf.castle.id); 
                if (helperCastle) {
                    let surviveRate = 0;
                    if (isAttackerData) surviveRate = atkSurviveRate;
                    else surviveRate = (s.defender.soldiers + s.deadSoldiers.defender) > 0 ? (Math.max(0, s.defender.soldiers) / (s.defender.soldiers + s.deadSoldiers.defender)) : 0;

                    const returnSoldiers = Math.floor(reinf.soldiers * surviveRate);
                    const returnHorses = Math.floor(reinf.horses * surviveRate);
                    const returnGuns = Math.floor(reinf.guns * surviveRate);
                    let returnRice = 0;

                    if (isAttackerData) {
                        const ratio = s.attacker.soldiers > 0 ? (returnSoldiers / s.attacker.soldiers) : 0;
                        returnRice = Math.floor(s.attacker.rice * Math.min(1.0, ratio));
                        s.attacker.rice = Math.max(0, s.attacker.rice - returnRice);
                        s.attacker.soldiers = Math.max(0, s.attacker.soldiers - returnSoldiers);
                        s.attacker.horses = Math.max(0, (s.attacker.horses || 0) - returnHorses);
                        s.attacker.guns = Math.max(0, (s.attacker.guns || 0) - returnGuns);
                        reinf.bushos.forEach(rb => { s.atkBushos = s.atkBushos.filter(b => b.id !== rb.id); });
                    } else {
                        s.defender.soldiers = Math.max(0, s.defender.soldiers - returnSoldiers);
                        s.defender.horses = Math.max(0, (s.defender.horses || 0) - returnHorses);
                        s.defender.guns = Math.max(0, (s.defender.guns || 0) - returnGuns);
                        reinf.bushos.forEach(rb => {
                            const idx = s.defender.samuraiIds.indexOf(rb.id);
                            if (idx !== -1) s.defender.samuraiIds.splice(idx, 1);
                        });
                    }

                    helperCastle.soldiers = Math.min(99999, helperCastle.soldiers + returnSoldiers);
                    helperCastle.rice = Math.min(99999, helperCastle.rice + returnRice);
                    helperCastle.horses = Math.min(99999, (helperCastle.horses || 0) + returnHorses);
                    helperCastle.guns = Math.min(99999, (helperCastle.guns || 0) + returnGuns);
                    reinf.bushos.forEach(b => {
                        b.castleId = helperCastle.id; b.isCastellan = false;
                        if (!helperCastle.samuraiIds.includes(b.id)) helperCastle.samuraiIds.push(b.id);
                    });
                    this.game.updateCastleLord(helperCastle);

                    if (!reinf.isSelf) {
                        const myClanId = isAttackerData ? s.sourceCastle.ownerClan : s.defender.ownerClan;
                        const helperClanId = helperCastle.ownerClan;
                        let isWin = isAttackerData ? (attackerWon && !isRetreat) : (!attackerWon && !isRetreat);
                        if (isWin) {
                            this.game.diplomacyManager.updateSentiment(myClanId, helperClanId, 5);
                            if (s.isPlayerInvolved) this.game.ui.log(`(援軍が勝利に貢献し、${this.game.clans.find(c=>c.id===helperClanId)?.name}との友好度が上がりました)`);
                        } else {
                            this.game.diplomacyManager.updateSentiment(myClanId, helperClanId, -5);
                            if (s.isPlayerInvolved) this.game.ui.log(`(敗北/撤退により、${this.game.clans.find(c=>c.id===helperClanId)?.name}との友好度が下がりました)`);
                        }
                    }
                }
            };

            returnReinforcement(s.selfReinforcement, true);
            returnReinforcement(s.reinforcement, true);
            returnReinforcement(s.defSelfReinforcement, false);
            returnReinforcement(s.defReinforcement, false);
            
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
            
            // プレイヤーが国人衆を制圧（討伐）した時の処理
            if (s.isKunishuSubjugation) {
                const kunishu = this.game.kunishuSystem.getKunishu(s.defender.kunishuId);
                let resultMsg = ""; 
                
                if (attackerWon) {
                    resultMsg = `【国衆制圧】\n${s.defender.name}の討伐に成功しました！`;
                    this.game.ui.log(`【国衆制圧】${s.defender.name}の討伐に成功しました！`);
                    if (kunishu) {
                        kunishu.isDestroyed = true;
                        kunishu.soldiers = 0;
                        const members = this.game.kunishuSystem.getKunishuMembers(kunishu.id);
                        members.forEach(b => {
                            b.belongKunishuId = 0; b.clan = 0; b.status = 'ronin'; b.isCastellan = false;
                        });
                    }
                } else {
                    resultMsg = `【討伐失敗】\n${s.defender.name}の討伐に失敗しました……`;
                    this.game.ui.log(`【国衆制圧】${s.defender.name}の討伐に失敗しました……`);
                    
                    if (kunishu) {
                        kunishu.soldiers = s.defender.soldiers;
                        kunishu.defense = s.defender.defense;
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
                    this.game.ui.setWarModalVisible(false);
                    this.game.ui.showResultModal(resultMsg, () => { this.closeWar(); });
                } else {
                    // ★追加：AIが討伐した時も、専用のメッセージを出してタップを待ちます！
                    await this.game.ui.showTapMessage(resultMsg);
                    this.closeWar();
                }
                return;
            }
            
            // 国人衆が反乱（蜂起）を起こした時の処理
            if (s.attacker.isKunishu) {
                let resultMsg = ""; 
                
                if (attackerWon) {
                    const targetC = this.game.getCastle(s.defender.id);
                    const oldOwner = targetC.ownerClan;
                    targetC.ownerClan = 0; 
                    targetC.castellanId = 0;
                    
                    const kunishuMembers = this.game.kunishuSystem.getKunishuMembers(s.attacker.kunishuId).map(b => b.id);
                    
                    // ★ここから追加：逃げ込める「味方の城」が他にあるか探します！
                    const friendlyCastles = this.game.castles.filter(c => c.ownerClan === oldOwner && c.id !== targetC.id);
                    
                    this.game.getCastleBushos(targetC.id).forEach(b => {
                        // もし国人衆のメンバーじゃなかったら（大名家の武将だったら）
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
                        // 国人衆のメンバーか、浪人になって城に残った人だけリストに残します
                        return kunishuMembers.includes(id) || (busho && busho.status === 'ronin');
                    });
                    
                    resultMsg = `【国衆蜂起】\n国人衆の反乱により、${targetC.name}が陥落し空白地となりました。`;
                    this.game.ui.log(`【国衆蜂起】国人衆の反乱により、${targetC.name}が陥落し空白地となりました。`);
                    
                    // ★城をすべて失ったら、life_system.js の滅亡チェック魔法にお任せします！
                    if (this.game.castles.filter(c => c.ownerClan === oldOwner).length === 0) {
                        await this.game.lifeSystem.checkClanExtinction(oldOwner, 'no_castle');
                    }
                    
                } else {
                    resultMsg = `【国衆蜂起】\n国人衆の反乱を鎮圧しました。`;
                    this.game.ui.log(`【国衆蜂起】国人衆の反乱を鎮圧しました。`);
                }
                
                if (s.isPlayerInvolved) {
                    this.game.ui.setWarModalVisible(false);
                    this.game.ui.showResultModal(resultMsg, () => { this.closeWar(); });
                } else {
                    // ★追加：AIの城で反乱が起きた時も、専用のメッセージを出してタップを待ちます！
                    await this.game.ui.showTapMessage(resultMsg);
                    this.closeWar();
                }
                return;
            }

            s.atkBushos.forEach(b => { this.game.factionSystem.recordBattle(b, s.defender.id); this.game.factionSystem.updateRecognition(b, 25); });
            // ★大名の戦いなら国人衆を弾き、国衆の戦いなら大名を弾く魔法！
            const defBushos = this.game.getCastleBushos(s.defender.id).filter(b => b.status !== 'ronin' && (s.defender.isKunishu ? b.belongKunishuId === s.defender.kunishuId : b.belongKunishuId === 0)).concat(this.pendingPrisoners);
            if (s.defBusho && s.defBusho.id && !defBushos.find(b => b.id === s.defBusho.id)) defBushos.push(s.defBusho);
            defBushos.forEach(b => { this.game.factionSystem.recordBattle(b, s.defender.id); this.game.factionSystem.updateRecognition(b, 25); });

            if (s.isPlayerInvolved) { this.game.ui.setWarModalVisible(false); }
            
            const isShortWar = s.round < window.WarParams.War.ShortWarTurnLimit;
            const attackerRecovered = Math.floor(s.deadSoldiers.attacker * window.WarParams.War.BaseRecoveryRate);
            const totalAtkSurvivors = s.attacker.soldiers + attackerRecovered;

            if (s.attacker.rice > 0) {
                // ★追加：戦争終了時の兵糧合流でも上限を超えないようにします
                if (attackerWon) s.defender.rice = Math.min(99999, s.defender.rice + s.attacker.rice); 
                else { const srcC = this.game.getCastle(s.sourceCastle.id); if (srcC) srcC.rice = Math.min(99999, srcC.rice + s.attacker.rice); }
            }

            // ★修正：攻撃軍が城に入って「兵士数」が勘違いされる前に、捕縛の処理を行います！
            if (!isRetreat && attackerWon) {
                this.processCaptures(s.defender, s.attacker.ownerClan);
            }

            if (isRetreat && retreatTargetId) {
                const targetC = this.game.getCastle(retreatTargetId);
                if (targetC) {
                    const recovered = Math.floor(s.deadSoldiers.defender * (isShortWar ? window.WarParams.War.RetreatRecoveryRate : window.WarParams.War.BaseRecoveryRate));
                    // ★追加：撤退先での兵士合流にストッパー！
                    targetC.soldiers = Math.min(99999, targetC.soldiers + s.defender.soldiers + recovered);
                    if (s.isPlayerInvolved && recovered > 0) this.game.ui.log(`(撤退先にて負傷兵 ${recovered}名 が復帰)`);
                }
            } else if (!isRetreat && attackerWon) {
                const survivors = Math.max(0, s.defender.soldiers);
                const recovered = Math.floor(s.deadSoldiers.defender * 0.2);
                const totalAbsorbed = survivors + recovered;

                // ★追加：攻め込んだ元気な兵士と、城に残っていた兵士の士気と訓練をまぜまぜします！
                const newTotalSoldiers = totalAtkSurvivors + totalAbsorbed;
                if (newTotalSoldiers > 0) {
                    s.defender.training = Math.floor(((s.defender.training || 0) * totalAbsorbed + (s.attacker.training || 0) * totalAtkSurvivors) / newTotalSoldiers);
                    s.defender.morale = Math.floor(((s.defender.morale || 0) * totalAbsorbed + (s.attacker.morale || 0) * totalAtkSurvivors) / newTotalSoldiers);
                }

                // ★追加：城を奪った時の兵士や馬、鉄砲の合流にストッパー！
                s.defender.soldiers = Math.min(99999, newTotalSoldiers);
                s.defender.horses = Math.min(99999, (s.defender.horses || 0) + (s.attacker.horses || 0));
                s.defender.guns = Math.min(99999, (s.defender.guns || 0) + (s.attacker.guns || 0));
                if (s.isPlayerInvolved && totalAbsorbed > 0) this.game.ui.log(`(敵残存兵・負傷兵 計${totalAbsorbed}名 を吸収)`);
            } else if (!attackerWon) {
                const srcC = this.game.getCastle(s.sourceCastle.id);

                // ★追加：帰ってきた兵士と、お留守番していた兵士の士気と訓練をまぜまぜします！
                const originalSoldiers = srcC.soldiers;
                const newTotalSoldiers = originalSoldiers + totalAtkSurvivors;
                if (newTotalSoldiers > 0) {
                    srcC.training = Math.floor(((srcC.training || 0) * originalSoldiers + (s.attacker.training || 0) * totalAtkSurvivors) / newTotalSoldiers);
                    srcC.morale = Math.floor(((srcC.morale || 0) * originalSoldiers + (s.attacker.morale || 0) * totalAtkSurvivors) / newTotalSoldiers);
                }

                // ★追加：負けて帰ってきた遠征軍の兵士、馬、鉄砲の合流にストッパー！
                srcC.soldiers = Math.min(99999, newTotalSoldiers);
                srcC.horses = Math.min(99999, (srcC.horses || 0) + (s.attacker.horses || 0));
                srcC.guns = Math.min(99999, (srcC.guns || 0) + (s.attacker.guns || 0));
                const recovered = Math.floor(s.deadSoldiers.defender * window.WarParams.War.BaseRecoveryRate);
                s.defender.soldiers = Math.min(99999, s.defender.soldiers + recovered);
                if (s.isPlayerInvolved && attackerRecovered > 0) this.game.ui.log(`(遠征軍 負傷兵 ${attackerRecovered}名 が帰還)`);
            }

            if (isRetreat && capturedInRetreat.length > 0) {
                this.pendingPrisoners = capturedInRetreat;
            }
            
            if (isRetreat && attackerWon) {
                const oldOwner = s.defender.ownerClan; // ★追加：前の持ち主を記憶しておきます
                s.defender.ownerClan = s.attacker.ownerClan; 
                s.defender.investigatedUntil = 0; 
                s.defender.soldiers = totalAtkSurvivors;

                // ★追加：敵が逃げて空っぽになった城に入るので、自分たちの士気と訓練をそのまま使います！
                s.defender.training = s.attacker.training || 0;
                s.defender.morale = s.attacker.morale || 0;
                
                // ★追加：城の持ち主が変わった時の国人衆の反発チェック魔法を使います！
                if (oldOwner !== s.defender.ownerClan) {
                    this.applyKunishuRelationDropOnCapture(s.defender, s.defender.ownerClan);
                }
                
                // ★追加: 敵が撤退して空になった城を占領した時、持ってきた馬と鉄砲を城に格納する
                s.defender.horses = (s.attacker.horses || 0);
                s.defender.guns = (s.attacker.guns || 0);

                const srcC = this.game.getCastle(s.sourceCastle.id);
                s.atkBushos.forEach((b) => { 
                    this.game.factionSystem.handleMove(b, s.sourceCastle.id, s.defender.id); 
                    // ★新しいお引越しセンターの魔法を使います！
                    this.game.affiliationSystem.moveCastle(b, s.defender.id);
                });
                
                // ★書き足し１：守備側が撤退した時の履歴ログ
                const atkClanData1 = this.game.clans.find(c => c.id === s.attacker.ownerClan);
                const atkArmyName1 = s.attacker.isKunishu ? s.attacker.name : (atkClanData1 ? atkClanData1.getArmyName() : "敵軍");
                this.game.ui.log(`【合戦結果】守備軍の撤退により、${atkArmyName1}が${s.defender.name}を占領しました。`);
                
                if (s.isPlayerInvolved) {
                    this.game.ui.showResultModal(`撤退しました。\n${retreatTargetId ? '部隊は移動しました。' : '部隊は解散しました。'}`, finishWarProcess);
                } else {
                    finishWarProcess();
                }
                return;
            }

            let resultMsg = "";
            const isAtkPlayer = (Number(s.attacker.ownerClan) === Number(this.game.playerClanId));
            const isDefPlayer = (Number(s.defender.ownerClan) === Number(this.game.playerClanId));
            const enemyName = isAtkPlayer ? (this.game.clans.find(c => c.id === s.defender.ownerClan)?.getArmyName() || "敵軍") : s.attacker.name;

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
                
                const oldOwner = s.defender.ownerClan; // ★追加：前の持ち主を記憶しておきます
                s.defender.ownerClan = s.attacker.ownerClan; s.defender.investigatedUntil = 0; s.defender.immunityUntil = this.game.getCurrentTurnId() + 1;
                
                // ★追加：城の持ち主が変わった時の国人衆の反発チェック魔法を使います！
                if (oldOwner !== s.defender.ownerClan) {
                    this.applyKunishuRelationDropOnCapture(s.defender, s.defender.ownerClan);
                }
                
                const srcC = this.game.getCastle(s.sourceCastle.id);
                s.atkBushos.forEach((b) => { 
                    this.game.factionSystem.handleMove(b, s.sourceCastle.id, s.defender.id); 
                    // ★新しいお引越しセンターの魔法を使います！
                    this.game.affiliationSystem.moveCastle(b, s.defender.id);
                });
                
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

            if (s.isPlayerInvolved) this.game.ui.showResultModal(resultMsg, finishWarProcess);
            else finishWarProcess();
        } catch (e) {
            console.error("EndWar Error: ", e);
            if (this.state.isPlayerInvolved) this.game.ui.showResultModal("合戦処理中にエラーが発生しましたが、\nゲームを継続します。", () => { this.game.finishTurn(); });
            else this.game.finishTurn();
        }
    },
    
    processCaptures(defeatedCastle, winnerClanId) { 
        const losers = this.game.getCastleBushos(defeatedCastle.id); const captives = []; const escapees = [];
        const friendlyCastles = this.game.castles.filter(c => c.ownerClan === defeatedCastle.ownerClan && c.id !== defeatedCastle.id);
        const isLastStand = friendlyCastles.length === 0;

        losers.forEach(b => { 
            // ★ 修正: 未登場の武将を巻き込んで捕虜や浪人にしないように守ります！
            if (b.status === 'ronin' || b.status === 'unborn' || b.status === 'dead') return;
            // ★ 追加: 普通の大名の城が落ちた時に、同居している国人衆が巻き添えで捕虜にならないように守ります！
            if (!defeatedCastle.isKunishu && b.belongKunishuId > 0) return;

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
    
    handleDaimyoPrisonerAction(action) {
        // 大名の画面を閉じてから、いつもの処遇の魔法にバトンタッチします
        this.game.ui.closeResultModal();
        const index = this.pendingPrisoners.findIndex(p => p.isDaimyo);
        if (index !== -1) {
            this.handlePrisonerAction(index, action);
        }
    },
    
    async handlePrisonerAction(index, action) { // ★ async を追加
        const prisoner = this.pendingPrisoners[index]; 
        const originalClanId = prisoner.clan;
        const kunishu = prisoner.belongKunishuId > 0 ? this.game.kunishuSystem.getKunishu(prisoner.belongKunishuId) : null;

        // ★追加：大名家が滅亡している（他に城がない）かをチェックします
        const friendlyCastles = this.game.castles.filter(c => c.ownerClan === originalClanId && originalClanId !== 0);
        const isExtinct = (friendlyCastles.length === 0);

        // ★追加：ダイアログの「OKボタン」を押した後に、武将をリストから消して次の処理へ進む魔法
        const nextStep = async () => { 
            this.pendingPrisoners.splice(index, 1); 
            if (this.pendingPrisoners.length === 0) {
                this.game.ui.closePrisonerModal();
                
                // ★ここを直します！「this.game.lifeSystem.」を付け足します！
                await this.game.lifeSystem.checkClanExtinction(this.state.oldDefClanId, 'no_castle');
                if (window.GameApp) window.GameApp.updateAllClanPrestige(); // 威信を更新
                this.game.finishTurn();
                
            } else {
                this.game.ui.showPrisonerModal(this.pendingPrisoners); 
            }
        };

        // ★新規追加：登用を拒否された時に、武将をリストから消さずに画面を描き直す魔法
        const stayStep = () => {
             if (prisoner.isDaimyo) {
                 this.game.ui.showDaimyoPrisonerModal(prisoner);
             } else {
                 this.game.ui.showPrisonerModal(this.pendingPrisoners);
             }
        };
        
        if (action === 'hire') { 
            if (kunishu && prisoner.id === kunishu.leaderId) {
                // ★ここを修正：「stayStep」を付け足して、ちゃんとやり直せるようにしました！
                this.game.ui.showDialog(`${prisoner.name}「国衆を束ねるこの俺が、お前になど仕えるか！」\n(※国人衆の代表者は登用できません)`, false, stayStep); 
                return; // やり直し
            }

            const myBushos = this.game.bushos.filter(b=>b.clan===this.game.playerClanId && b.status !== 'unborn'); const recruiter = myBushos.find(b => b.isDaimyo) || myBushos[0];
            const score = (recruiter.charm * 2.0) / (prisoner.loyalty * 1.5); 
            
            // ★変更：大名で、かつ城が残っているなら絶対に拒否し、stayStepで画面に戻します
            if (prisoner.isDaimyo && !isExtinct) {
                prisoner.hasRefusedHire = true; // ★追加：拒否したという印をつけます
                this.game.ui.showDialog(`${prisoner.name}「敵の軍門には下らぬ！」`, false, stayStep); 
            } else {
                // ★追加：滅亡時の大名は登用確率が1/3になります
                let hireProb = score;
                if (prisoner.isDaimyo && isExtinct) {
                    hireProb = score / 3.0;
                } else if (!prisoner.isDaimyo && this.daimyoHiredBonus) {
                    hireProb += this.daimyoHiredBonus;
                }

                if (hireProb > Math.random()) { 
                    // ★ここから変更：大名だったかどうかを最初に記憶しておきます！
                    const wasDaimyo = prisoner.isDaimyo;
                    
                    if (prisoner.isDaimyo) {
                        prisoner.isDaimyo = false;
                        this.daimyoHiredBonus = 0.5; 
                    }

                    prisoner.belongKunishuId = 0;
                    const targetC = this.game.getCastle(prisoner.castleId) || this.game.getCurrentTurnCastle(); 
                    if(targetC) { 
                        // ★新しいお引越しセンターの魔法を使います！
                        this.game.affiliationSystem.joinClan(prisoner, this.game.playerClanId, targetC.id);
                    }
                    
                    // ★記憶しておいた情報を使ってメッセージを使い分けます！
                    if (wasDaimyo) { 
                        this.game.ui.showDialog(`${prisoner.name}は臣従を誓いました！`, false, nextStep); 
                    } else {
                        this.game.ui.showDialog(`${prisoner.name}を登用しました！`, false, nextStep); 
                    }
                    // ★変更ここまで
                } else {
                    prisoner.hasRefusedHire = true; // ★追加：拒否したという印をつけます
                    if (prisoner.isDaimyo && isExtinct) {
                        this.game.ui.showDialog(`${prisoner.name}「……煮るなり焼くなり好きにせい。」\n${prisoner.name}は拒否しました`, false, stayStep);
                    } else {
                        this.game.ui.showDialog(`${prisoner.name}は登用を拒否しました……`, false, stayStep); 
                    }
                }
            }
        } else if (action === 'kill') { 
            // ★処断の処理を、life_system.js の魔法にすべてお任せします！
            await this.game.lifeSystem.executeDeath(prisoner);
            
            // 処断はメッセージがないので、そのまま次へ進めます
            nextStep();
            // ==========================================
            
        } else if (action === 'release') {
            if (prisoner.isDaimyo) {
                if (isExtinct) {
                    prisoner.isDaimyo = false;
                }
            }

            if (kunishu && !kunishu.isDestroyed) {
                const returnCastle = this.game.getCastle(kunishu.castleId);
                if (returnCastle) {
                    this.game.affiliationSystem.enterCastle(prisoner, returnCastle.id);
                    prisoner.status = 'active'; 
                }
                this.game.ui.showDialog(`${prisoner.name}を解放しました。`, false, nextStep);
            } else {
                if (!isExtinct) {
                    const returnCastle = friendlyCastles[Math.floor(Math.random() * friendlyCastles.length)];
                    this.game.factionSystem.handleMove(prisoner, 0, returnCastle.id); 
                    this.game.affiliationSystem.enterCastle(prisoner, returnCastle.id);
                    prisoner.status = 'active'; 
                    prisoner.isCastellan = false;
                    this.game.ui.showDialog(`${prisoner.name}を解放しました。`, false, nextStep);
                } else { 
                    // ★新しいお引越しセンターの魔法を使います！
                    this.game.affiliationSystem.becomeRonin(prisoner);
                    this.game.ui.showDialog(`${prisoner.name}を解放しました。`, false, nextStep); 
                }
            }
        } 
    },
    
    async autoResolvePrisoners(captives, winnerClanId) { // ★ async を追加
        const aiBushos = this.game.bushos.filter(b => b.clan === winnerClanId && b.status !== 'unborn'); 
        const leaderInt = aiBushos.length > 0 ? Math.max(...aiBushos.map(b => b.intelligence)) : 50;

        // ★大名から先に処理するように並べ替えます
        captives.sort((a, b) => (b.isDaimyo ? 1 : 0) - (a.isDaimyo ? 1 : 0));
        let daimyoHiredBonus = 0; // ★ご褒美の箱

        for (const p of captives) { 
            // ★大名家が滅亡している（他に城がない）かをチェックします
            const friendlyCastles = this.game.castles.filter(c => c.ownerClan === p.clan && p.clan !== 0);
            const isExtinct = (friendlyCastles.length === 0);

            // ★変更：fe_system.js の魔法にお任せします！
            if (p.isDaimyo && !isExtinct) { 
                await this.game.lifeSystem.executeDeath(p); 
                continue; 
            }
            
            const isKunishuBoss = (p.belongKunishuId > 0 && p.id === this.game.kunishuSystem.getKunishu(p.belongKunishuId)?.leaderId);

            // ★滅亡時の大名は登用確率が1/3になります。大名を登用できたら他も50%アップ
            let hireProb = (leaderInt / 100);
            if (p.isDaimyo && isExtinct) {
                hireProb = hireProb / 3.0;
            } else if (!p.isDaimyo && daimyoHiredBonus > 0) {
                hireProb += daimyoHiredBonus;
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

    
    closeWar() { 
        // ★国人衆との戦いが終わった時も平時のBGMに戻す！
        if (window.AudioManager && this.state.isPlayerInvolved) {
            window.AudioManager.restoreMemorizedBgm();
        }
        this.game.ui.renderMap(); 
        if (this.state.isPlayerInvolved) { 
            this.game.ui.updatePanelHeader();
            this.game.ui.renderCommandMenu(); 
        }
        
        setTimeout(() => {
             if (window.GameApp) window.GameApp.updateAllClanPrestige(); // ★威信を更新
             this.game.finishTurn(); 
        }, 100);
    },
    
    // ★守備側が「自分の別の城」から援軍を呼べるかチェックする魔法
    checkDefenderSelfReinforcement(defCastle, onComplete) {
        const defClanId = defCastle.ownerClan;
        const pid = this.game.playerClanId;
        
        // 守備側が中立や国人衆の場合は自家援軍はなし
        if (defClanId === 0 || defCastle.isKunishu || this.state.isKunishuSubjugation || this.state.attacker.isKunishu) {
            onComplete(null);
            return;
        }

        let candidateCastles = [];

        this.game.castles.forEach(c => {
            // 自分の城で、攻められている城以外を探す
            if (c.ownerClan !== defClanId || c.id === defCastle.id) return;
            // 道が繋がっているか（到達可能か）
            if (!GameSystem.isReachable(this.game, defCastle, c, defClanId)) return;
            // 兵力と兵糧の余裕があるか
            if (c.soldiers < 1000) return;
            if (c.rice < 500) return;

            // 大名・城主以外の、動かせる一般武将がいるか
            const normalBushos = this.game.getCastleBushos(c.id).filter(b => 
                !b.isDaimyo && !b.isCastellan && b.status !== 'ronin' && b.belongKunishuId === 0
            );
            if (normalBushos.length === 0) return;

            candidateCastles.push(c);
        });

        if (candidateCastles.length === 0) {
            onComplete(null);
            return;
        }

        if (defClanId === pid && !defCastle.isDelegated) {
            // プレイヤーなら画面を出して選ばせる
            this.game.ui.showDefSelfReinforcementSelector(candidateCastles, defCastle, (reinfData) => {
                onComplete(reinfData);
            });
        } else {
            // AIなら自動で一番兵士が多い城から送る
            candidateCastles.sort((a,b) => b.soldiers - a.soldiers);
            const bestCastle = candidateCastles[0];
            this.executeDefSelfReinforcementAuto(bestCastle, defCastle, (reinfData) => {
                onComplete(reinfData);
            });
        }
    },
    
    // ★守備側が援軍を呼べるかチェックする機能
    checkDefenderReinforcement(defCastle, atkClanId, onComplete) {
        const defClanId = defCastle.ownerClan;
        const pid = this.game.playerClanId;
        
        if (defClanId === 0 || defCastle.isKunishu || this.state.isKunishuSubjugation || this.state.attacker.isKunishu) {
            onComplete();
            return;
        }

        let candidateCastles = [];

        this.game.castles.forEach(c => {
            if (c.ownerClan === 0 || c.ownerClan === defClanId || c.ownerClan === atkClanId) return;
            
            const rel = this.game.getRelation(defClanId, c.ownerClan);
            // ★バリア追加：rel が空っぽの時に落ちないように「!rel ||」を追加しました！
            if (!rel || !['友好', '同盟', '支配', '従属'].includes(rel.status)) return;
            if (rel.sentiment < 50) return;

            const enemyRel = this.game.getRelation(c.ownerClan, atkClanId);
            // ★修正：外交専用の魔法を使います！
            if (enemyRel && this.game.diplomacyManager.isNonAggression(enemyRel.status)) return;

            const isNextToMyAnyCastle = this.game.castles.some(myC => myC.ownerClan === defClanId && GameSystem.isAdjacent(c, myC));
            if (!isNextToMyAnyCastle) return;

            if (c.soldiers < 1000) return;
            if (c.rice < 500) return;

            const normalBushos = this.game.getCastleBushos(c.id).filter(b => 
                !b.isDaimyo && !b.isCastellan && b.status !== 'ronin' && b.belongKunishuId === 0
            );
            if (normalBushos.length === 0) return;

            candidateCastles.push(c);
        });

        if (candidateCastles.length === 0) {
            onComplete();
            return;
        }

        if (defClanId === pid && !defCastle.isDelegated) {
            this.game.ui.showDefReinforcementSelector(candidateCastles, defCastle, onComplete);
        } else {
            candidateCastles.sort((a,b) => b.soldiers - a.soldiers);
            const bestCastle = candidateCastles[0];
            this.executeDefReinforcement(0, bestCastle, defCastle, onComplete);
        }
    },

    executeDefSelfReinforcementAuto(helperCastle, defCastle, onComplete) {
        const myClanId = defCastle.ownerClan;
        
        let reinfSoldiers = Math.max(500, Math.floor(helperCastle.soldiers * 0.5));
        if (reinfSoldiers > helperCastle.soldiers) reinfSoldiers = helperCastle.soldiers;
        
        const availableBushos = this.game.getCastleBushos(helperCastle.id).filter(b => !b.isDaimyo && !b.isCastellan && b.status !== 'ronin' && b.belongKunishuId === 0).sort((a,b) => b.strength - a.strength);
        let bushoCount = reinfSoldiers >= 2500 ? 3 : (reinfSoldiers >= 1500 ? 2 : 1);
        const reinfBushos = availableBushos.slice(0, Math.min(bushoCount, availableBushos.length));

        let reinfRice = Math.min(helperCastle.rice, Math.max(500, reinfSoldiers)); 
        const reinfHorses = Math.min(helperCastle.horses || 0, Math.floor(reinfSoldiers * 0.5)); 
        const reinfGuns = Math.min(helperCastle.guns || 0, Math.floor(reinfSoldiers * 0.5));

        helperCastle.soldiers = Math.max(0, helperCastle.soldiers - reinfSoldiers);
        helperCastle.rice = Math.max(0, helperCastle.rice - reinfRice);
        helperCastle.horses = Math.max(0, (helperCastle.horses || 0) - reinfHorses);
        helperCastle.guns = Math.max(0, (helperCastle.guns || 0) - reinfGuns);
        reinfBushos.forEach(b => b.isActionDone = true);

        const selfReinfData = {
            castle: helperCastle, bushos: reinfBushos, soldiers: reinfSoldiers,
            rice: reinfRice, horses: reinfHorses, guns: reinfGuns, isSelf: true
        };
        
        // ★修正：守備軍はプレイヤー・敵に関係なく「水色(log-color-def)」にします
        let colorClass = "log-color-def";
        const atkForce = this.state.attacker;
        const atkClanId = atkForce.isKunishu ? 0 : atkForce.ownerClan;
        const leaderName = reinfBushos.length > 0 ? reinfBushos[0].name : "総大将";
        
        if (atkClanId === this.game.playerClanId) {
            this.game.ui.showDialog(`${helperCastle.name}の${leaderName}が敵の援軍として向かっています！`, false, () => {
                onComplete(selfReinfData);
            });
        } else {
            this.game.ui.log(`【自軍援軍】<span class="${colorClass}">${helperCastle.name}</span> から守備側の援軍が参戦しました。`);
            onComplete(selfReinfData);
        }
    },

    handleBushoSelectionForDefSelfReinf(helperCastleId, selectedIds, onComplete, promptBusho) {
        const helperCastle = this.game.getCastle(helperCastleId);
        const reinfBushos = selectedIds.map(id => this.game.getBusho(id));
        this.game.ui.openQuantitySelector('def_self_reinf_supplies', [helperCastle], null, {
            onConfirm: (inputs) => {
                const i = inputs[helperCastle.id] || inputs;
                const rS = i.soldiers ? parseInt(i.soldiers.num.value) : 500;
                const rR = i.rice ? parseInt(i.rice.num.value) : 500;
                const rH = i.horses ? parseInt(i.horses.num.value) : 0;
                const rG = i.guns ? parseInt(i.guns.num.value) : 0;

                helperCastle.soldiers = Math.max(0, helperCastle.soldiers - rS);
                helperCastle.rice = Math.max(0, helperCastle.rice - rR);
                helperCastle.horses = Math.max(0, (helperCastle.horses || 0) - rH);
                helperCastle.guns = Math.max(0, (helperCastle.guns || 0) - rG);
                reinfBushos.forEach(b => b.isActionDone = true);

                const selfReinfData = {
                    castle: helperCastle, bushos: reinfBushos, soldiers: rS,
                    rice: rR, horses: rH, guns: rG, isSelf: true
                };
                
                // ★修正：こちらも同じく「水色(log-color-def)」にします
                let colorClass = "log-color-def";
                this.game.ui.log(`【自軍援軍】<span class="${colorClass}">${helperCastle.name}</span> が守備側の援軍に出発しました！`);
                onComplete(selfReinfData);
            },
            onCancel: promptBusho
        });
    },

    executeDefReinforcement(gold, helperCastle, defCastle, onComplete) {
        if (gold > 0) defCastle.gold -= gold;

        const myClanId = defCastle.ownerClan;
        const helperClanId = helperCastle.ownerClan;
        const enemyClanId = this.state.attacker.ownerClan;

        const myToHelperRel = this.game.getRelation(myClanId, helperClanId);
        const helperToEnemyRel = this.game.getRelation(helperClanId, enemyClanId);

        if (helperClanId === this.game.playerClanId) {
            const myClanName = this.game.clans.find(c => c.id === myClanId)?.name || "不明";
            const isBoss = (myToHelperRel.status === '従属');
            const startSelection = () => this._promptPlayerDefReinforcement(helperCastle, defCastle, myToHelperRel, onComplete, isBoss);

            if (isBoss) this.game.ui.showDialog(`主家である ${myClanName} から守備側の援軍要請が届きました。\n当家は従属しているため直ちに出陣します！`, false, startSelection);
            else {
                this.game.ui.showDialog(`${myClanName} から守備側の援軍要請が届きました。(持参金: ${gold})\n派遣しますか？`, true, startSelection, () => {
                    this.game.diplomacyManager.updateSentiment(myClanId, helperClanId, -5);
                    this.game.ui.showDialog(`援軍要請を断りました。`, false, onComplete);
                });
            }
            return;
        }

        let isSuccess = false;
        if (myToHelperRel.status === '支配') isSuccess = true;
        else {
            let prob = (myToHelperRel.sentiment >= 50) ? (myToHelperRel.sentiment - 49) : 0;
            prob += Math.floor((gold / 1500) * 15);
            if (myToHelperRel.status === '同盟' || myToHelperRel.status === '従属') prob += 30;
            if (helperToEnemyRel) prob -= Math.floor((helperToEnemyRel.sentiment - 50) * (20 / 50)); 
            prob += 10; 
            if (Math.random() * 100 < prob) isSuccess = true;
        }

        if (!isSuccess) {
            if (myClanId === this.game.playerClanId) {
                const castellan = this.game.getBusho(helperCastle.castellanId);
                const castellanName = castellan ? castellan.name : "城主";
                this.game.ui.showDialog(`${helperCastle.name}の${castellanName}は援軍を拒否しました……`, false, onComplete);
            } else {
                onComplete();
            }
            return;
        }

        this._applyDefReinforcement(helperCastle, defCastle, myToHelperRel, onComplete);
    },
    
    _applyDefReinforcement(helperCastle, defCastle, myToHelperRel, onComplete) {
        const myClanId = defCastle.ownerClan;
        const helperClanId = helperCastle.ownerClan;

        if (!['支配', '従属', '同盟'].includes(myToHelperRel.status)) this.game.diplomacyManager.updateSentiment(myClanId, helperClanId, -10);

        const helperDaimyo = this.game.bushos.find(b => b.clan === helperClanId && b.isDaimyo) || { duty: 50 };
        
        const rate = (myToHelperRel.sentiment + helperDaimyo.duty) / 400;
        let reinfSoldiers = Math.floor(helperCastle.soldiers * rate);
        reinfSoldiers = Math.max(500, Math.min(reinfSoldiers, helperCastle.soldiers));
        
        const availableBushos = this.game.getCastleBushos(helperCastle.id).filter(b => !b.isDaimyo && !b.isCastellan && b.status !== 'ronin' && b.belongKunishuId === 0).sort((a,b) => b.strength - a.strength);
        let bushoCount = reinfSoldiers >= 2500 ? 3 : (reinfSoldiers >= 1500 ? 2 : 1);
        const reinfBushos = availableBushos.slice(0, Math.min(bushoCount, availableBushos.length));

        let reinfRice = Math.min(helperCastle.rice, Math.max(500, reinfSoldiers)); 
        const reinfHorses = Math.min(helperCastle.horses || 0, Math.floor(reinfSoldiers * 0.5)); 
        const reinfGuns = Math.min(helperCastle.guns || 0, Math.floor(reinfSoldiers * 0.5));

        helperCastle.soldiers = Math.max(0, helperCastle.soldiers - reinfSoldiers);
        helperCastle.rice = Math.max(0, helperCastle.rice - reinfRice);
        helperCastle.horses = Math.max(0, (helperCastle.horses || 0) - reinfHorses);
        helperCastle.guns = Math.max(0, (helperCastle.guns || 0) - reinfGuns);
        reinfBushos.forEach(b => b.isActionDone = true);

        this.state.defReinforcement = {
            castle: helperCastle, bushos: reinfBushos, soldiers: reinfSoldiers,
            rice: reinfRice, horses: reinfHorses, guns: reinfGuns, isSelf: false
        };
        
        const atkForce = this.state.attacker;
        const atkIsKunishu = atkForce.isKunishu || false;
        const atkId = atkIsKunishu ? atkForce.kunishuId : atkForce.ownerClan;
        const helperIsKunishu = helperCastle.isKunishu || false;
        // ★復元：守備の援軍と攻撃側を「敵対」にする処理
        if (this.game.diplomacyManager && !helperIsKunishu && !atkIsKunishu && helperClanId !== 0 && atkId !== 0) {
            this.game.diplomacyManager.changeStatus(helperClanId, atkId, '敵対');
        }
        
        if (helperClanId === this.game.playerClanId) this.state.isPlayerInvolved = true;

        const helperClanName = this.game.clans.find(c => c.id === helperClanId)?.name || "援軍";

        if (myClanId === this.game.playerClanId) {
            const castellan = this.game.getBusho(helperCastle.castellanId);
            const castellanName = castellan ? castellan.name : "城主";
            this.game.ui.showDialog(`${helperCastle.name}の${castellanName}が援軍要請を承諾しました！`, false, onComplete);
        } else if (helperClanId === this.game.playerClanId) {
            this.game.ui.showDialog(`${helperClanName} (${helperCastle.name}) が守備側の援軍に駆けつけました！`, false, onComplete);
        } else {
            const atkForce = this.state.attacker;
            const atkClanId = atkForce.isKunishu ? 0 : atkForce.ownerClan;
            const leaderName = reinfBushos.length > 0 ? reinfBushos[0].name : "総大将";
            if (atkClanId === this.game.playerClanId) {
                this.game.ui.showDialog(`${helperClanName}の${leaderName}が敵の援軍として向かっています！`, false, onComplete);
            } else {
                this.game.ui.log(`【同盟援軍】${defCastle.name}の要請により、${helperClanName}が守備側の援軍として駆けつけました。`);
                onComplete();
            }
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

        helperCastle.soldiers = Math.max(0, helperCastle.soldiers - reinfSoldiers);
        helperCastle.rice = Math.max(0, helperCastle.rice - reinfRice);
        helperCastle.horses = Math.max(0, (helperCastle.horses || 0) - reinfHorses);
        helperCastle.guns = Math.max(0, (helperCastle.guns || 0) - reinfGuns);
        reinfBushos.forEach(b => b.isActionDone = true);

        this.state.defReinforcement = {
            castle: helperCastle, bushos: reinfBushos, soldiers: reinfSoldiers,
            rice: reinfRice, horses: reinfHorses, guns: reinfGuns, isSelf: false
        };
        
        const atkForce = this.state.attacker;
        const atkIsKunishu = atkForce.isKunishu || false;
        const atkId = atkIsKunishu ? atkForce.kunishuId : atkForce.ownerClan;
        const helperIsKunishu = helperCastle.isKunishu || false;
        // ★守備の援軍と攻撃側を「敵対」にする処理
        if (this.game.diplomacyManager && !helperIsKunishu && !atkIsKunishu && helperClanId !== 0 && atkId !== 0) {
            this.game.diplomacyManager.changeStatus(helperClanId, atkId, '敵対');
        }
        
        this.state.isPlayerInvolved = true;
        const helperClanName = this.game.clans.find(c => c.id === helperClanId)?.name || "援軍";
        this.game.ui.showDialog(`${helperClanName} (${helperCastle.name}) が守備側の援軍に出発しました！`, false, onComplete);
    }, // ←★ここにカンマ（,）を付けるのがとっても大事です！
    
    // ★追加: 城の所有者が変わった時、その城にいる国人衆の友好度をチェックして低下させる魔法
    applyKunishuRelationDropOnCapture(castle, newOwnerClan) {
        if (newOwnerClan === 0) return; // 空き城になった時は何もしません
        
        // この城にいる国人衆を探します
        const kunishusInCastle = this.game.kunishuSystem.getKunishusInCastle(castle.id);
        
        kunishusInCastle.forEach(kunishu => {
            // 新しい殿様との友好度をチェック！
            const currentRel = kunishu.getRelation(newOwnerClan);
            if (currentRel <= 69) {
                // 友好度が69以下なら、20下げます（0より下にはならないようにします）
                const newRel = Math.max(0, currentRel - 20);
                kunishu.setRelation(newOwnerClan, newRel);
                
                // もしプレイヤーが関わっていたら、メッセージを出します！
                if (newOwnerClan === this.game.playerClanId) {
                    this.game.ui.log(`(城の主が変わったため、${kunishu.getName(this.game)}との友好度が低下しました)`);
                }
            }
        });
    }
    
});