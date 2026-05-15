/**
 * ai.js - 敵思考エンジン
 * 敵大名のターン処理、内政、外交、軍事判断
 */

window.AIParams = {
    AI: {
        Difficulty: 'normal',
        AbilityBase: 50, AbilitySensitivity: 3.0,
        GunshiBiasFactor: 0.5, GunshiFairnessFactor: 0.01,
        DiplomacyChance: 0.3, 
        GoodwillThreshold: 69, 
        AllianceThreshold: 70, 
        BreakAllianceDutyFactor: 0.5
    }
};

class AIEngine {
    constructor(game) {
        this.game = game;
    }

    // ★追加：大名の威信（daimyoPrestige）を取り出す魔法です！
    getClanPrestige(clanId) {
        if (clanId === 0) return 0;
        const clan = this.game.clans.find(c => c.id === clanId);
        return clan ? Math.max(1, clan.daimyoPrestige) : 1;
    }

    getDifficultyMods() {
        const diff = window.AIParams.AI.Difficulty || 'normal';
        switch(diff) {
            case 'hard': return { accuracy: 1.0, aggression: 1.2, resourceSave: 0.2 }; 
            case 'easy': return { accuracy: 0.6, aggression: 0.7, resourceSave: 0.6 }; 
            default:     return { accuracy: 0.85, aggression: 1.0, resourceSave: 0.4 }; 
        }
    }

    getAISmartness(attributeVal) {
        const mods = this.getDifficultyMods();
        const base = window.AIParams.AI.AbilityBase || 50;
        const sensitivity = window.AIParams.AI.AbilitySensitivity || 2.0;
        let prob = 0.5 + ((attributeVal - base) * sensitivity * 0.01);
        prob = Math.max(0.1, Math.min(0.95, prob));
        if (mods.accuracy > 0.9) prob += 0.1;
        if (mods.accuracy < 0.7) prob -= 0.1;
        return Math.max(0.05, Math.min(1.0, prob));
    }
    
    async execAI(castle) {
        try {
            // ★イベント追加：コマンドの選択前（AI操作時）
            if (this.game.eventManager) {
                await this.game.eventManager.processEvents('before_command', castle);
            }

            // ★AIが考え始める前に、すべての大名の威信を最新にします！
            this.game.updateAllClanPrestige();
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
            let isRelocated = false;
            if (this.game.aiStaffing) {
                isRelocated = this.game.aiStaffing.relocateDaimyo(castle, castellan);
            } else {
                isRelocated = this.game.affiliationSystem.relocateDaimyoAI(castle, castellan);
            }
            
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
            const myOperation = clanOps ? clanOps[castle.legionId] : null;
            
            // 自分の大名家に「作戦」があり、それが「攻撃」で、かつ「実行中」の場合
            if (myOperation && myOperation.type === '攻撃' && myOperation.status === '実行中') {
                // そして、自分のお城がその「出撃元（stagingBase）」に選ばれている場合だけ出陣します！
                if (myOperation.stagingBase === castle.id) {
                    
                    // ★追加：出陣する前に、道が繋がっているか、まだ「敵」かどうかの最終チェックをします！
                    let canReach = false;
                    let isStillEnemy = false; // ★追加：まだ敵のままかどうかの印です
                    let targetProvId = castle.provinceId; // 諸勢力なら同じ国
                    
                    if (myOperation.isKunishuTarget) {
                        // 諸勢力は自分のお城のすぐそばなので、道はいつでも繋がっています！
                        canReach = true;
                        
                        if (myOperation.isEventOperation) {
                            isStillEnemy = true;
                        } else {
                            // 諸勢力がまだ生きているか、仲良しになっていないか（友好度30以下）をチェックします
                            const targetKunishu = this.game.kunishuSystem.getKunishu(myOperation.targetId);
                            if (targetKunishu && !targetKunishu.isDestroyed && targetKunishu.getRelation(castle.ownerClan) <= 30) {
                                // ★追加：その諸勢力が、今もこのお城（出撃する自分の城）にいるか確認します！
                                if (targetKunishu.castleId === castle.id) {
                                    isStillEnemy = true;
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
                                canReach = GameSystem.isReachable(this.game, castle, targetCastle, castle.ownerClan);
                                
                                // ★追加：お休み期間（immunityUntil）ではないか、味方や同盟国になっていないかチェックします！
                                // 今の月（TurnId）よりもお休み期間の方が未来なら、攻撃は我慢します
                                if ((targetCastle.immunityUntil || 0) < this.game.getCurrentTurnId()) {
                                    if (targetCastle.ownerClan !== castle.ownerClan) {
                                        if (targetCastle.ownerClan === 0) {
                                            isStillEnemy = true; // 空き城なら攻撃OKです
                                        } else {
                                            const rel = this.game.getRelation(castle.ownerClan, targetCastle.ownerClan);
                                            
                                            // ★今回変更：もし出陣のタイミングで相手が「同盟」や「従属」なら、この瞬間に破棄します！
                                            if (rel && (rel.status === '同盟' || rel.status === '従属')) {
                                                
                                                // ★今回追加：大名家の名前を調べて、関係に合わせたメッセージを作ります！
                                                const myClanData = this.game.clans.find(c => c.id === castle.ownerClan);
                                                const targetClanData = this.game.clans.find(c => c.id === targetCastle.ownerClan);
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
                                                    this.game.ui.log(`【外交】${breakMsg}`);
                                                    console.log(breakMsg); // 裏側の記録にも残しておきます
                                                }
    
                                                this.game.diplomacyManager.applyBreakAlliancePenalty(castle.ownerClan, targetCastle.ownerClan);
                                                isStillEnemy = true; // 破棄して敵になったので出陣OK！
                                            } else if (!rel || !this.game.diplomacyManager.isNonAggression(rel.status)) {
                                                isStillEnemy = true; // 同盟などで守られていなければ敵です！
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }

                    // もし道が途切れていたり、すでに敵じゃなくなっていたら、作戦のメモを消して中止します！
                    if (!canReach || !isStillEnemy) {
                        delete this.game.aiOperationManager.operations[castle.ownerClan][castle.legionId];
                        await this.game.aiOperationManager.generateOperation(castle.ownerClan, castle.legionId);
                    } else {
                        // ★追加：自分のお城か目的地が大雪になっていないかチェックをします！
                        let isHeavySnow = false;
                        if (!myOperation.isEventOperation) {
                            const srcProv = this.game.provinces.find(p => p.id === castle.provinceId);
                            if (srcProv && srcProv.statusEffects && srcProv.statusEffects.includes('heavySnow')) {
                                isHeavySnow = true;
                            }
                            if (!isHeavySnow) {
                                const tgtProv = this.game.provinces.find(p => p.id === targetProvId);
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
                                    this.executeKunishuSubjugateAI(castle, targetKunishu, castellan, myOperation.requiredForce, myOperation.requiredRice);
                                }
                            } else {
                                const targetCastle = this.game.getCastle(myOperation.targetId);
                                if (targetCastle) {
                                    // ★変更：一番最後に「myOperation（作戦のメモ）」も一緒に渡してあげます！
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
            if (perceivedDefenseEmg <= castle.maxDefense / 4 && castle.gold >= 200) {
                // 城壁修復
                castle.gold -= 200;
                const val = GameSystem.calcRepair(castellan, 1.0, true);
                const oldVal = castle.defense;
                castle.defense = Math.min(castle.maxDefense, castle.defense + val);
                
                const actualVal = castle.defense - oldVal;
                castellan.achievementTotal = (castellan.achievementTotal || 0) + Math.floor(actualVal * 0.5);
                if (this.game.factionSystem && this.game.factionSystem.updateRecognition) this.game.factionSystem.updateRecognition(castellan, 10);
                
                castellan.isActionDone = true;
                emergencyActionDone = true;
            } else if (perceivedLoyaltyEmg <= 70 && castle.rice >= 200) {
                // 施し
                castle.rice -= 200;
                const val = GameSystem.calcCharity(castellan, 1.0, true);
                
                castle.peoplesLoyalty = Math.min(100, castle.peoplesLoyalty + val);
                
                castellan.achievementTotal = (castellan.achievementTotal || 0) + Math.floor(val * 0.5);
                if (this.game.factionSystem && this.game.factionSystem.updateRecognition) this.game.factionSystem.updateRecognition(castellan, 15);
                
                castellan.isActionDone = true;
                emergencyActionDone = true;
            }

            // ★追加：緊急の修復や施しを行ったら、戦争などは行わずに残りの内政のみ行います
            if (emergencyActionDone) {
                this.execInternalAffairs(castle, castellan, mods, smartness);
                this.game.finishTurn();
                return;
            }

            // 外交フェーズ (確率で実行)
            // プレイヤーの城（委任中）の場合は、勝手に外交させないようにします
            if (Number(castle.ownerClan) !== Number(this.game.playerClanId)) {
                
                // ★今回変更：大名家が今月「この相手と外交するぞ！」と決めているか、記憶を確認します
                const myClan = this.game.clans.find(c => c.id === castle.ownerClan);
                
                if (myClan && myClan.currentDiplomacyTarget) {
                    // まずは自分のお殿様（大名）を探します。いない時は城主を大名の代わりにします
                    const daimyo = this.game.bushos.find(b => b.clan === castle.ownerClan && b.isDaimyo) || castellan;
                    
                    // 今までの基本の確率（約10%）を計算します
                    let diplomacyChance = ((window.AIParams.AI.DiplomacyChance || 0.3) / 3) * (mods.aggression); 
                    
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
            this.execInternalAffairs(castle, castellan, mods, smartness);
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
        
        // 兵糧のチェック (連れて行く兵士数の1.5倍)
        const requiredRice = Math.floor(sendSoldiers * 1.5);
        if (myCastle.rice < requiredRice) return null;

        // --- 修正後：正確な見積もりと戦闘力比の計算 ---

        const myDaimyo = this.game.bushos.find(b => b.clan === myCastle.ownerClan && b.isDaimyo) || { personality: 'normal', intelligence: 50, duty: 50, nemesisIds: [] };

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
                const leaderProv = this.game.provinces.find(p => p.id === leaderCastle.provinceId);
                if (leaderProv) {
                    leaderRegionId = leaderProv.regionId;
                }
            }
        }

        const myClanId = myCastle.ownerClan;
        const myClanCastles = this.game.castles.filter(c => c.ownerClan === myClanId);
        const myTotalPower = this.getClanPrestige(myClanId);

        // =========================================================================
        // ★新規追加：上洛ルート検索（将軍候補がいる場合）
        const jorakuTargets = new Set();
        let hasShogunCandidate = false;
        
        // 自勢力の武将の中に「左馬頭（ID: 80）」の官位を持つ人がいるか探します！
        const myBushos = this.game.bushos.filter(b => b.clan === myClanId);
        for (const b of myBushos) {
            if (b.courtRankIds && b.courtRankIds.includes(80)) {
                hasShogunCandidate = true;
                break;
            }
        }

        // 将軍候補がいたら、京都への道を探します！
        if (hasShogunCandidate) {
            // まだ持っていない二条城（ID: 26）と槇島城（ID: 90）を探します
            // すでに片方を持っていても、もう片方を狙うようになります
            const unownedKyotoCastles = this.game.castles.filter(c => (c.id === 26 || c.id === 90) && c.ownerClan !== myClanId);
            
            if (unownedKyotoCastles.length > 0) {
                // 距離を測るためのノートを作ります
                const dist = {};
                const prev = {};
                this.game.castles.forEach(c => dist[c.id] = Infinity); // 最初は全部「無限遠」にしておきます
                const queue = [];
                
                // 自分の領地は「距離0」として出発点にします
                myClanCastles.forEach(c => {
                    dist[c.id] = 0;
                    queue.push(c.id);
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
                                if (!queue.includes(vCastle.id)) {
                                    queue.push(vCastle.id);
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
        // ★新規追加：周囲の敵対大名をすべて調べて、それぞれの警戒度を計算します！

        // ★ここから追加：自分が持っている「国」と「地方」が、統一されているか調べる魔法！
        // まずは自分が持っている国と地方の出席番号を書き出します
        const myProvIds = new Set();
        const myRegionIds = new Set();
        myClanCastles.forEach(c => {
            myProvIds.add(c.provinceId);
            const prov = this.game.provinces.find(p => p.id === c.provinceId);
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
                const prov = this.game.provinces.find(p => p.id === c.provinceId);
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
        
        // ★見積もりをする人（評価者）の智謀を決めます
        // プレイヤーの委任城なら「城主（myGeneral）」、敵AIなら「大名（myDaimyo）」の智謀を使います
        let evaluatorInt = 50;
        if (myClanId === this.game.playerClanId) {
            evaluatorInt = myGeneral.intelligence;
        } else {
            evaluatorInt = myDaimyo.intelligence || 50;
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
                    penalty = cautionLevel * 6.25; // ★周辺の敵に対する警戒ペナルティ
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

        enemies.forEach(target => {
            // ★目的地が大雪か調べます！
            let isTgtHeavySnow = false;
            if (target.isKunishuTarget) {
                isTgtHeavySnow = isSrcHeavySnow; // 諸勢力は自分の城の周辺なので同じ天気です
            } else {
                isTgtHeavySnow = heavySnowProvIds.has(target.provinceId);
            }

            // ★大雪の時は、絶対にこの目標を攻めません（次の目標の計算へスキップします）
            if (isSrcHeavySnow || isTgtHeavySnow) {
                return;
            }

            if (target.isKunishuTarget) {
                // ★諸勢力に対する攻撃確率の計算
                const kunishu = target.kunishu;
                // ★修正：諸勢力は兵力が少ないため、計算上は「1.1倍」にして大名家の城と同じ難易度として評価します！
                const enemyForce = (kunishu.soldiers + kunishu.defense) * 1.1; 
                
                let myReinfPower = 0;
                // 自軍からの援軍を見積もる
                this.game.castles.forEach(c => {
                    if (c.ownerClan === myCastle.ownerClan && c.id !== myCastle.id && c.soldiers >= 1000) {
                        const errorRange = Math.min(0.3, Math.max(0, (100 - myGeneral.intelligence) / 100 * 0.3));
                        const errorRate = 1.0 + (Math.random() - 0.5) * 2 * errorRange;
                        myReinfPower += (c.soldiers * 0.5) * errorRate;
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

                // 性格補正
                const getPersonalityBonus = (p) => {
                    if (p === 'aggressive') return 5;
                    if (p === 'conservative') return -5;
                    return 0;
                };
                prob += getPersonalityBonus(myDaimyo.personality);
                prob += getPersonalityBonus(myGeneral.personality);

                // 難易度補正
                const diff = window.AIParams.AI.Difficulty || 'normal';
                const diffMulti = diff === 'hard' ? 1.2 : diff === 'easy' ? 0.7 : 1.0;
                prob *= diffMulti;

                // ★追加：過去に自領を攻撃してきた諸勢力への反撃！
                if (pastAttackerKunishus.has(kunishu.id)) {
                    prob += 15;
                }

                // 最大値の適用 (諸勢力相手は最大40)
                prob = Math.min(prob, 40);

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
                const myClanCastles = this.game.castles.filter(c => c.ownerClan === myCastle.ownerClan);
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
                    if (c.ownerClan === myCastle.ownerClan && c.legionId === myCastle.legionId && c.id !== myCastle.id && c.soldiers >= 1000) {
                        myReinfPower += (c.soldiers * 0.5) * errorRate; // 兵力の半分くらい来てくれると予想
                    }
                    // 相手が呼べそうな自家援軍（守る城以外で、兵力1000以上の城）
                    if (c.ownerClan === target.ownerClan && c.id !== target.id && c.soldiers >= 1000) {
                        enemyReinfPower += (c.soldiers * 0.5) * errorRate; // 相手の別のお城からの援軍も警戒！
                    }
                }
            });

            // ② 同盟国からの援軍を見積もる
            this.game.clans.forEach(c => {
                if (c.id === 0 || c.id === myCastle.ownerClan || c.id === target.ownerClan) return;
                
                // その大名から来てくれそうな兵士数を予想します（大体の目安として総兵力の15%くらいと予想）
                const trueClanPower = this.game.getClanTotalSoldiers(c.id) || 0;
                let expectedReinf = (trueClanPower * 0.15) * errorRate; // ここでも智謀で見誤る魔法がかかります！
                
                // 自分が呼べそうか？（同盟等で仲良し＆相手とは仲良くない）
                const myRel = this.game.getRelation(myCastle.ownerClan, c.id);
                const cToTargetRel = this.game.getRelation(c.id, target.ownerClan);
                if (myRel && this.game.diplomacyManager.isNonAggression(myRel.status) && myRel.sentiment >= 50) {
                    // ★修正：敵対大名と「同盟・支配・従属」関係にあるか、友好度が100の場合は呼べないようにします
                    const isEnemyAlly = cToTargetRel && ['同盟', '支配', '従属'].includes(cToTargetRel.status);
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
                    const isMyAlly = cToMyRel && ['同盟', '支配', '従属'].includes(cToMyRel.status);
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
            
            let prob = 0;
            if (forceRatio < 0.5) {
                // ★足切り魔法：自分の総兵力が相手の0.5倍未満なら、攻撃確率を大きく下げる！
                prob = -50;
            } else if (forceRatio >= 3.0) {
                // 相手の3倍以上の総兵力がある時
                prob = 40 + (forceRatio - 3.0) * 5;
            } else if (forceRatio >= 2.0) {
                // 相手の2倍から3倍までの時
                prob = 30 + (forceRatio - 2.0) * 10; 
            } else if (forceRatio >= 1.0) {
                // 相手と互角から2倍までの時
                prob = 10 + (forceRatio - 1.0) * 20;
            } else {
                // 相手の0.5倍から互角までの時（-50から10までなめらかに繋げます）
                prob = -50 + (forceRatio - 0.5) * 120;
            }
            
            // 守備側武将の能力による攻撃確率低下 (最大10%)
            const enemyBushos = this.game.getCastleBushos(target.id).filter(b => b.clan === target.ownerClan && b.status === 'active');
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
            const diff = window.AIParams.AI.Difficulty || 'normal';
            const diffMulti = diff === 'hard' ? 1.2 : diff === 'easy' ? 0.7 : 1.0;
            prob *= diffMulti;

            // ★複数警戒：周りの敵からのペナルティをすべて足し算します
            let totalCautionPenalty = 0;
            adjacentEnemyClans.forEach(enemy => {
                // 「いま攻めようとしている相手」以外の敵からのペナルティだけ足します
                if (target.ownerClan !== enemy.clanId) {
                    totalCautionPenalty += enemy.penalty;
                }
            });
            prob -= totalCautionPenalty;

            // ★今回追加：その城を取った後の戦況を考えて、周囲の敵城や味方城を警戒・計算する魔法！
            // 攻撃目標の城に隣接している城のうち、「敵」や「味方」がいくつあるかを数えます。
            let futureEnemyNeighbors = 0;
            let friendlyNeighbors = 0;
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
                                // 同盟、支配、従属なら味方として数えます
                                if (['同盟', '支配', '従属'].includes(adjRel.status)) {
                                    friendlyNeighbors++;
                                } 
                                // 敵対、普通、友好なら敵（潜在的な脅威）として数えます
                                else if (['敵対', '普通', '友好'].includes(adjRel.status)) {
                                    futureEnemyNeighbors++;
                                }
                            }
                        }
                    }
                });
            }
            // 敵城が少ないほど優先され、多いほど守りにくいため後回しにします（1城につき4点マイナス）
            prob -= (futureEnemyNeighbors * 4);
            
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
                        // 周りの平均の「2倍」の強さがある大名なら、約-15%も攻撃確率が下がります
                        prob -= (ratio - 1.0) * 15; 
                    }
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
                if (starvingRiskCount > 0) {
                    prob -= (starvingRiskCount * 50);
                }
            }
            
            // ★恨みを晴らすため、または執着によるスコアアップ！
            // 1. 「敵対」状態の勢力に対する攻撃ボーナス
            if (rel.status === '敵対') {
                prob += 15; // 敵対している相手を優先します
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
            const targetDaimyo = this.game.bushos.find(b => b.clan === target.ownerClan && b.isDaimyo);
            let isNemesisDaimyo = false;
            if (targetDaimyo && myDaimyo.nemesisIds && myDaimyo.nemesisIds.includes(targetDaimyo.id)) {
                prob += 10; // 宿敵には容赦しません！
                isNemesisDaimyo = true; // 上限を広げるための印をつけておきます
            }
            
            // ★国や地方を統一するための執着ボーナス！
            // もしターゲットの城がある国が、自分が持っているけどまだ統一していない国だったら
            if (ununifiedProvIds.has(target.provinceId)) {
                prob += 5; // 国を統一するために少し頑張ります！
            } else {
                // 国は違うけど、ターゲットの城がある地方が、自分が持っているけどまだ統一していない地方だったら
                const tgtProv = this.game.provinces.find(p => p.id === target.provinceId);
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
                const tgtProv = this.game.provinces.find(p => p.id === target.provinceId);
                if (tgtProv && !myRegionIds.has(tgtProv.regionId)) {
                    prob -= 5;
                }
            }

            // ★今回追加：四国と九州をまたぐ攻撃のスコアを大きく下げる魔法！
            // 四国地方のIDは8、九州地方のIDは9です。
            let targetRegionId = 0;
            const targetProv = this.game.provinces.find(p => p.id === target.provinceId);
            if (targetProv) {
                targetRegionId = targetProv.regionId;
            }
            if ((leaderRegionId === 8 && targetRegionId === 9) || (leaderRegionId === 9 && targetRegionId === 8)) {
                prob -= 30; // 四国と九州の間の海越え攻撃はペナルティを与えて後回しにします！
            }
            
            // 攻撃確率の最大値設定
            let maxProb = rel.status === '敵対' ? 60 : 10;
            if (isNemesisDaimyo) {
                maxProb += 10; // 宿敵の場合は、上限を10%広げて攻めやすくします！
            }
            if (jorakuTargets.has(target.id)) {
                maxProb += 30; // 上洛ルートの場合は上限を大きく広げます！
            }
            
            // 最大値の適用
            prob = Math.min(prob, maxProb);

            // ★最終調整用。すべての引き算が終わった最後に×９０％の魔法をかけます！
            if (prob > 0) {
                prob = prob * 0.9;
            }

            // 最小値の適用（マイナスになっていたらゼロにします）
            prob = Math.max(0, prob); 

            // ★大魔法：空き城の時は、攻め込むハードルを3倍（確率を3分の1）にします！
            if (target.ownerClan === 0) {
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
        const bushos = this.game.getCastleBushos(source.id).filter(b => b.clan === source.ownerClan && b.status === 'active');
        
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
        let sorted = evaluatedBushos // ★変更：後から中身をいじれるように「const」から「let」にします
            .filter(eb => eb.perceivedPower > threshold) // 7割より大きい人だけ残す
            .sort((a, b) => b.perceivedPower - a.perceivedPower) // 見積もり戦闘力が強い順に並べる
            .slice(0, 5) // 最大5人まで選ぶ（既存の仕組みに合わせます）
            .map(eb => eb.busho); // 魔法の箱から武将データだけを取り出す

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
        this.game.commandSystem.checkReinforcementAndStartWar(source, target.id, sorted, sendSoldiers, sendRice, sendHorses, sendGuns);
        
        // （「待つ魔法」は消しました！あとはwar.jsが最後までやってくれます）
    }

    executeKunishuSubjugateAI(sourceCastle, kunishu, general, sendSoldiers, sendRice) {
        if (sendSoldiers <= 0 || sendRice <= 0) {
            this.game.finishTurn();
            return;
        }
        
        const bushos = this.game.getCastleBushos(sourceCastle.id).filter(b => b.clan === sourceCastle.ownerClan && b.status === 'active');
        
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
        const sorted = evaluatedBushos
            .filter(eb => eb.perceivedPower > threshold)
            .sort((a, b) => b.perceivedPower - a.perceivedPower)
            .slice(0, 5)
            .map(eb => eb.busho);

        const sendHorses = (sourceCastle.horses || 0) < sendSoldiers * 0.2 ? 0 : (sourceCastle.horses || 0);
        const sendGuns = (sourceCastle.guns || 0) < sendSoldiers * 0.2 ? 0 : (sourceCastle.guns || 0);
        
        // ★ kunishuSystem（諸勢力の専門部署）の executeKunishuSubjugate を呼び出します！
        this.game.kunishuSystem.executeKunishuSubjugate(sourceCastle, sourceCastle.id, sorted.map(b => b.id), sendSoldiers, sendRice, sendHorses, sendGuns, kunishu);
    }
    
    execInternalAffairs(castle, castellan, mods, smartness) {
        // ① 大名を取得します（全体で使う用）
        const daimyo = this.game.bushos.find(b => b.clan === castle.ownerClan && b.isDaimyo) || castellan;

        // ★追加：行動回数の計算基準となる「リーダー（直轄なら大名、それ以外なら国主）」を決めます！
        let leader = daimyo;
        if (castle.legionId !== 0) {
            const legion = this.game.legions ? this.game.legions.find(l => l.clanId === castle.ownerClan && l.legionNo === castle.legionId) : null;
            if (legion && legion.commanderId) {
                const commander = this.game.getBusho(legion.commanderId);
                if (commander) {
                    leader = commander;
                }
            }
        }

        // ★魔法の改善：最初にお城の繋がりを1回だけ全部調べて、リストを作ります！
        const reachableMyCastles = [];
        const visitedCastles = new Set();
        const searchQueue = [castle];
        visitedCastles.add(castle.id);

        while (searchQueue.length > 0) {
            const current = searchQueue.shift();
            // 自分のお城もリストに入れておきます（後で便利です）
            reachableMyCastles.push(current);

            const adjMyCastles = [];
            if (current.adjacentCastleIds) {
                current.adjacentCastleIds.forEach(adjId => {
                    const c = this.game.getCastle(adjId);
                    if (c && c.ownerClan === castle.ownerClan && c.legionId === castle.legionId && !visitedCastles.has(c.id)) {
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
            !b.isActionDone && b.clan === castle.ownerClan && b.status === 'active'
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
        
        // ★追加：行動回数消費なしの特別調略を行ったかのフラグ
        let hasBonusSabotageUsed = false;

        // ★高速化：今の国の兵糧の単価（相場）をループの「外」で１回だけ調べておきます！
        let riceRate = 1.0;
        if (this.game.provinces) {
            const province = this.game.provinces.find(p => p.id === castle.provinceId);
            if (province && province.marketRate !== undefined) riceRate = province.marketRate;
        }

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

        // ③ 決められた回数だけ、行動を繰り返します！
        for (let step = 0; step < maxActions; step++) {
            // まだ動ける武将を再確認します
            availableBushos = this.game.getCastleBushos(castle.id).filter(b => 
                !b.isActionDone && b.clan === castle.ownerClan && b.status === 'active'
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
            const perceivedTraining = Math.min(100, castle.training + errTraining);
            const perceivedMorale = Math.min(100, castle.morale + errMorale);

            // 1. 城壁修復（最大値の1/4以下なら超優先！）
            if (perceivedDefense < castle.maxDefense) {
                let score = 0;
                if (perceivedDefense <= castle.maxDefense / 4) score = 80; // ★修正：思い込みステータスで判定
                else score = 20;
                
                // ★追加：最大防御力が1000の時を「1倍」として、低いほど点数が上がり、高いほど点数が下がる魔法！
                const defRatio = 1000 / Math.max(1, castle.maxDefense);
                score = Math.floor(score * defRatio);
                
                actions.push({ type: 'repair', stat: 'politics', score: score, cost: 200 });
            }

            // 2. 施し（民忠70以下なら優先！）
            if (perceivedLoyalty < 100) {
                let score = 0;
                if (perceivedLoyalty <= 70) score = 120; // ★修正：思い込みステータスで判定
                else score = (100 - perceivedLoyalty) * 2; // ★修正：思い込みステータスで計算
                actions.push({ type: 'charity', stat: 'charm', score: score, cost: 200 }); 
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

            if (canBuyEq && castle.gold >= 500 && tradeCount < 5) {
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

                // ④ いよいよ点数（スコア）の計算です！基本は控えめの「10点」からスタートします
                let horseScore = 10 + ((0.5 - horseFillRate) * 10);
                let gunScore = 10 + ((0.5 - gunFillRate) * 10);

                // 革新性による点数：高いほど鉄砲が、低いほど軍馬がプラスになります（最大で±5点）
                horseScore -= (innoDiff * 0.1);
                gunScore += (innoDiff * 0.1);

                // 比率による点数：大名家全体で多く持っている方を優先します（最大+5点）
                horseScore += (horseRatio * 5);
                gunScore += (gunRatio * 5);

                // ★変更：大名家が鉄砲産地の城（石山御坊:33、雑賀城:42、赤尾木城:185、今浜城:186）を1つでも持っているなら、鉄砲を少し優先して騎馬を控えます
                // 先ほどと同じように、自分と同じ持ち主の城の中に鉄砲産地があるか探します
                const hasGunCastleAI = this.game.castles.some(c => c.ownerClan === castle.ownerClan && [33, 42, 185, 186].includes(c.id));
                if (hasGunCastleAI) {
                    gunScore += 3;
                    horseScore -= 3;
                }

                // ★追加：大名家が軍馬産地の城を持っているなら、軍馬を少し優先して鉄砲を控えます
                const hasHorseCastleAI = this.game.castles.some(c => {
                    if (c.ownerClan !== castle.ownerClan) return false;
                    // ①拠点単位（日野江城）
                    if (c.id === 157) return true;
                    // ②国単位（常陸、淡路、肥後、日向、薩摩、大隅、対馬）
                    if ([15, 36, 61, 62, 63, 64, 68].includes(c.provinceId)) return true;
                    const prov = this.game.provinces.find(p => p.id === c.provinceId);
                    // ③地方単位（東北、甲信）
                    if (prov && (prov.regionId === 1 || prov.regionId === 3)) return true;
                    return false;
                });
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

                if (gunScore >= 5) {
                    actions.push({ type: 'buy_gun', stat: 'politics', score: gunScore, cost: 500 });
                }
                if (horseScore >= 5) {
                    actions.push({ type: 'buy_horse', stat: 'politics', score: horseScore, cost: 500 });
                }
            }

            // ★追加：朝廷への貢物（金が5000以上で余裕がある時、たまに行います）
            if (castle.gold >= 5000) {
                let tributeGold = 500;
                if (castle.gold >= 10000) {
                    tributeGold = 1500;
                } else if (castle.gold >= 7500) {
                    tributeGold = 1000;
                }
                // たまに行うように、鉄砲の購入と同じ15点にしておきます。外交が得意な人を向かわせます。
                actions.push({ type: 'tribute', stat: 'diplomacy', score: 15, cost: tributeGold });
            }

            // 3. 徴兵（お金と兵糧の余裕を見ながら、計画的に集めます！）
            if (castle.population > 1000) {
                // ===== 基本パラメータ =====
                const targetRice = Math.floor(castle.soldiers * 2.5);
                const safeRice = Math.floor(castle.soldiers * 2.5);
                // 変更：「兵士1人につき3のお金」をキープする設定でしたが、
                // お金を余らせすぎないように「1.5」に下げて、お財布の紐を緩くします！
                const targetGold = Math.floor(castle.soldiers * 1.5);
                
                // およそ1人集めるのにかかるお金（単価）を、城主の能力で仮計算します
                const efficiency = ((castellan.leadership * 1.5) + (castellan.charm * 1.5) + (Math.sqrt(castellan.loyalty) * 2) + (Math.sqrt(castle.peoplesLoyalty) * 2)) / 500;
                // 1人あたりのお金。もしゼロになりそうなら安全のために1にします
                const unitPrice = Math.max(1, 1 / efficiency); 

                // ===== 余力計算 =====
                const surplusGold = Math.max(0, castle.gold - targetGold);
                const surplusRice = Math.max(0, castle.rice - targetRice);

                // ===== 雇用可能数 =====
                const affordByGold = Math.floor(surplusGold / unitPrice);
                const affordByRice = Math.floor(surplusRice / 3.5);
                
                // 実際の雇用上限（お金と兵糧、どちらか少ない方に合わせます）
                let maxDraft = Math.max(0, Math.min(affordByGold, affordByRice));
                
                // 人口も超えられないようにします
                maxDraft = Math.min(maxDraft, castle.population);

                // ===== 目標兵力の計算 =====
                // 自分の軍団全体の「総石高」を調べます！
                const myCastles = this.game.castles.filter(c => c.ownerClan === castle.ownerClan && c.legionId === castle.legionId);
                const totalKokudaka = myCastles.reduce((sum, c) => sum + c.kokudaka, 0);

                // 石高をベースにした新しい計算式で、目標にする兵士の数を決めます
                const kokudakaBonus = 1 + (Math.sqrt(totalKokudaka) / 100) + (Math.sqrt(castle.kokudaka) / 10);
                let targetSoldiers = Math.floor(2000 + (castle.kokudaka / 4) * kokudakaBonus);

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
                if (castle.gold < targetGold) {
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
            if (perceivedTraining < 100) {
                let score = 100 - perceivedTraining; // ★修正：思い込みステータスで計算
                actions.push({ type: 'training', stat: 'leadership', score: score, cost: 0 }); 
            }

            // 5. 兵施し（士気）
            if (perceivedMorale < 100) {
                let score = 100 - perceivedMorale; // ★修正：思い込みステータスで計算
                actions.push({ type: 'soldier_charity', stat: 'leadership', score: score, cost: 200 }); 
            }

            // 6. 石高開発
            if (castle.kokudaka < castle.maxKokudaka) {
                actions.push({ type: 'farm', stat: 'politics', score: 30, cost: 200 });
            }

            // 7. 鉱山開発
            if (castle.commerce < castle.maxCommerce) {
                actions.push({ type: 'commerce', stat: 'politics', score: 30, cost: 200 });
            }

            // --- 性格による点数の調整 ---
            const clanOps = this.game.aiOperationManager.operations[castle.ownerClan];
            const myOp = clanOps ? clanOps[castle.legionId] : null;
            const isPreparingAttack = (myOp && myOp.type === '攻撃');

            actions.forEach(a => {
                if (isConservative && ['farm', 'commerce', 'repair', 'charity'].includes(a.type)) {
                    a.score *= 1.2; 
                }
                if (isAggressive && ['draft', 'training', 'soldier_charity'].includes(a.type)) {
                    a.score *= 1.2; 
                }

                // ★追加：攻撃準備期間中は、内政の優先度を切り替えて軍事に集中します！
                if (isPreparingAttack) {
                    // 石高、鉱山、城壁、施しの優先度を半分に（緊急時以外）
                    if (['farm', 'commerce', 'repair', 'charity'].includes(a.type)) {
                        let isEmergency = false;
                        if (a.type === 'repair' && castle.defense <= castle.maxDefense / 4) isEmergency = true;
                        if (a.type === 'charity' && castle.peoplesLoyalty <= 70) isEmergency = true;
                        
                        if (!isEmergency) {
                            a.score /= 2;
                        }
                    }
                    // 徴兵、訓練、士気、馬・鉄砲購入の優先度を倍に
                    if (['draft', 'training', 'soldier_charity', 'buy_gun', 'buy_horse'].includes(a.type)) {
                        a.score *= 2;
                    }
                    
                    // （「特別なお届け物」の計算は、さっきの「お使いリスト」を作る魔法にお引っ越ししました！）
                }

                a.score *= (0.9 + Math.random() * 0.2);
            });

            // 8. 兵糧売却の判断
            const sellTargetRice = Math.floor(castle.soldiers * 3.5);
            const sellSafeRice = Math.floor(castle.soldiers * 2.0);
            // 変更：徴兵の金銭感覚と合わせるため、ここも「1.5」に下げます！
            // これで、無駄にお米を売りすぎるのを防ぎます。
            const targetGold = Math.floor(castle.soldiers * 1.5);
            
            const shortageGold = Math.max(0, targetGold - castle.gold);
            const surplusRice = Math.max(0, castle.rice - sellTargetRice);
            
            // 兵士が0人の時などにエラーにならないよう、分母に+1をしておきます
            const surplusRate = surplusRice / (sellTargetRice + 1);
            
            let sellScore = 200 * Math.pow(surplusRate, 2) + 100 * surplusRate;
            
            const goldShortageRate = shortageGold / (targetGold + 1);
            sellScore *= (1 + goldShortageRate);
            
            // お米が高く売れる時はスコアをアップ、安い時はダウンさせます！
            sellScore *= riceRate;
            
            // 安全ラインを下回っていたら、絶対に売りません
            if (castle.rice <= sellSafeRice) {
                sellScore = 0;
            }
            
            // ★変更：最大5回までの制限を追加
            if (sellScore > 30 && tradeCount < 5) {
                actions.push({ type: 'sell_rice', stat: 'politics', score: sellScore, cost: 0 }); 
            }
            
            // ===== 基本パラメータ =====
            const targetRice = Math.floor(castle.soldiers * 3.5);
            const minRice = Math.floor(castle.soldiers * 0.3);
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
            const buyableAmount = castle.gold / riceRate;
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
                    if (draftBaseId && draftBaseId !== castle.id && castle.gold >= 1000) {
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
                                if (rel && ['同盟', '和睦', '支配', '従属'].includes(rel.status)) {
                                    isFriendly = true;
                                }
                            }

                            // 仲良しじゃない場合（空き城も油断できないので含めます）
                            if (!isFriendly) {
                                hasEnemy = true;
                                if (adj.ownerClan !== 0) {
                                    // その敵の大名家の、全部の兵士数と一番兵士が多いお城を調べます
                                    const enemyCastles = this.game.castles.filter(c => c.ownerClan === adj.ownerClan);
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
                    let keepRice = 1000;

                    // もし周りに敵がいたら、お留守番を増やします
                    if (hasEnemy) {
                        // 最大勢力の中で、一番兵士が多いお城の「半分」をお留守番の目標にします
                        keepSoldiers = Math.floor(maxEnemyMaxCastleSoldiers * 0.5);

                        // でも、自分の軍団全体の兵力が、敵の全体の半分以下なら…
                        const myCastles = this.game.castles.filter(c => c.ownerClan === castle.ownerClan && c.legionId === castle.legionId);
                        const myTotalSoldiers = myCastles.reduce((sum, c) => sum + c.soldiers, 0);
                        const enemyHalf = maxEnemyTotalSoldiers * 0.5;

                        if (enemyHalf > 0 && myTotalSoldiers <= enemyHalf) {
                            // 戦力差に合わせて「お留守番は諦めて前線に送る！」と判断します
                            const ratio = myTotalSoldiers / enemyHalf;
                            keepSoldiers = Math.floor(keepSoldiers * ratio);
                        }

                        // 兵糧は、お留守番の兵士の1.2倍を残します
                        keepRice = Math.floor(keepSoldiers * 1.2);
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
                        // 兵糧は、出陣する人たちの1.5倍を目指します
                        const stagingRiceGoal = Math.floor(myOp.requiredForce * 1.5);
                        
                        const supportSoldierGoal = Math.floor(myOp.requiredForce / supportSendRate);
                        const supportRiceGoal = Math.floor(myOp.requiredForce * 1.5);

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
                        if ((target.soldiers <= 500 || target.gold <= 500) && castle.soldiers >= 2000 && castle.gold >= 2000) {
                            transportTasks.push({ type: 'normal_gold_soldier', targetId: target.id });
                            if (maxTransportScore < 400) maxTransportScore = 400;
                            break; 
                        }
                        if (target.rice <= 2000 && castle.rice >= 5000) {
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
                const moveActions = this.game.aiStaffing.planMoveAction(castle, availableBushos, validReachableCastles);
                if (moveActions && moveActions.length > 0) {
                    // 何人もの移動リストを、そのまま全部行動の候補に追加します！
                    actions.push(...moveActions);
                }
            }
            
            // ★追加 11. 登用（浪人がいる場合、超低確率）
            const ronins = this.game.getCastleBushos(castle.id).filter(b => b.status === 'ronin');
            if (ronins.length > 0) {
                // 雀の涙ほどの優先度（5点）にしてあります
                actions.push({ type: 'employ', stat: 'charm', score: 5, cost: 0, targetRonin: ronins[0] });
            }

            // ★追加: 領内の諸勢力への親善（友好度90未満の場合に検討）
            // ★さらに追加：城が「委任」されていない（直轄）時だけ、親善を考えます！
            if (!castle.isDelegated) {
                const myKunishus = this.game.kunishuSystem.getKunishusInCastle(castle.id).filter(k => k.getRelation(castle.ownerClan) < 90);
                myKunishus.forEach(k => {
                    const relation = k.getRelation(castle.ownerClan);
                    
                    // ★修正: 友好度0で最大40点、90で0点になるように計算します
                    let score = Math.floor(40 * (90 - relation) / 90);
                    
                    // ★ここから追加：城主と諸勢力の頭領の「相性」を比べて、仲が悪いほど親善をやりにくくする魔法！
                    // 1. 諸勢力の頭領（リーダー）を探します
                    const leader = this.game.getBusho(k.leaderId);
                    if (leader) {
                        // 2. 城主と頭領の「相性の差」を計算します（0がピッタリ、50が真逆）
                        const affinityDiff = GameSystem.calcAffinityDiff(castellan.affinity, leader.affinity);
                        
                        // 3. 差が50の時に「25点」下がるように計算します（相性の差を半分にします）
                        const penalty = Math.floor(affinityDiff / 2);
                        
                        // 4. スコアから引きます（マイナスにならないように、最低でも0にします）
                        score = Math.max(0, score - penalty);
                    }
                    
                    // ★追加：お城の資金が「1000」未満で余裕がない時は、自分の生活を優先して親善の優先度を大幅に下げます！
                    if (castle.gold < 1000) {
                        score = Math.floor(score / 4); // スコアを4分の1にします
                    }
                    
                    // スコアが1点以上ある時だけ、行動の候補に入れます
                    if (score > 0) {
                        actions.push({ type: 'kunishu_goodwill', stat: 'charm', score: score, cost: 300, targetKunishu: k });
                    }
                });
            }

            // ★追加 12. 褒美（承認欲求がたまっている、または忠誠度が低い武将がいる場合）
            let rewardTargets = [];
            // ★追加：選ばれた人の中で「一番低い忠誠度」を覚えておく箱です！
            let minLoyaltyForReward = 100;
            
            const castleBushos = this.game.getCastleBushos(castle.id).filter(b => b.clan === castle.ownerClan && b.status === 'active');
            
            for (let b of castleBushos) {
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
                    // ★修正：確率を全体的に上げました！(95で0.5%、70以下で10%)
                    let prob = 10; // 70以下の時は問答無用で10%
                    if (b.loyalty > 70) {
                        prob = 0.5 + ((95 - b.loyalty) / 25) * 9.5; 
                    }
                    
                    // 2. お殿様（大名）の義理(duty)による確率の増減
                    // 義理が51〜100ならアップ、49〜0ならダウンします
                    const dutyMod = (daimyo.duty - 50) * 0.1;
                    
                    // 3. お殿様との相性(affinity)による確率の増減
                    // 差が0(ピッタリ)なら10%アップ、差が50(真逆)なら10%ダウンします
                    const diff = GameSystem.calcAffinityDiff(daimyo.affinity, b.affinity);
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

            if (rewardTargets.length > 0 && castle.gold >= 100) {
                // ★修正：一番忠誠度が低い武将に合わせて、優先度スコア（やりたさ）を計算します！
                // 忠誠95なら1点、60以下なら40点になります。
                let rewardScore = 15; // 承認欲求だけで選ばれた時などの基本点です
                if (minLoyaltyForReward <= 60) {
                    rewardScore = 40; // 60以下なら最優先の40点！
                } else if (minLoyaltyForReward <= 95) {
                    // 60〜95の間を、点数がなめらかに変わるように計算する魔法です！
                    rewardScore = 1 + ((95 - minLoyaltyForReward) / 35) * 39;
                }
                
                actions.push({ type: 'reward', stat: 'none', score: rewardScore, cost: 100, targets: rewardTargets });
            }
            
            // ★追加 13. 調略（スコアは一律低めに設定）
            // 作戦（myOp）で決められた「調略目標（sabotageTargets）」に対して工作を行います！
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
                        return rel && ['同盟', '支配', '従属', '和睦'].includes(rel.status);
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
                        const enemyBushos = this.game.bushos.filter(b => b.clan === memoryClanId && b.status === 'active' && !b.isDaimyo && b.castleId > 0);
                        
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
                            
                            // ★追加：ターゲットが自家の武将を「宿敵」として恨んでいないかチェックします
                            let hasNemesis = false;
                            if (targetBusho.nemesisIds && targetBusho.nemesisIds.length > 0) {
                                hasNemesis = targetBusho.nemesisIds.some(nId => {
                                    const nBusho = this.game.getBusho(nId);
                                    return nBusho && nBusho.clan === castle.ownerClan && nBusho.status !== 'dead';
                                });
                            }
                            
                            // ★大魔法：内政の邪魔をしないように、優先度を「小数点」として基本スコアに足します！
                            // 例：基本スコア8、優先度45なら「8.45点」となり、最大10点強の枠に収まります。
                            let finalScore = baseRumorHeadhuntScore + (targetPriority / 100);
                            
                            // 離間計は宿敵がいても実行します（忠誠度を下げて謀反を誘発させるため）
                            actions.push({ type: 'rumor', stat: 'intelligence', score: finalScore, cost: 0, targetId: targetBusho.castleId, targetBushoId: targetBusho.id });
                            
                            // 引抜は、宿敵がいない場合のみ実行します
                            if (!hasNemesis && castle.gold >= 100) {
                                actions.push({ type: 'headhunt', stat: 'intelligence', score: finalScore, cost: 100, targetId: targetBusho.castleId, targetBushoId: targetBusho.id, gold: 100 });
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
                    
                    if (castle.gold >= 100) {
                        castle.gold -= 100;
                        // 褒美の効果をプレイヤーと同じように計算（効果は200相当で据え置き）
                        const effect = GameSystem.calcRewardEffect(200, daimyo, targetBusho);
                        if (this.game.factionSystem && this.game.factionSystem.updateRecognition) {
                            this.game.factionSystem.updateRecognition(targetBusho, -effect * 2 - 5);
                        }
                        
                        // ★追加：忠誠度をランダムで1～3アップさせる（プレイヤーと同じ！）
                        const loyaltyUp = Math.floor(Math.random() * 3) + 1;
                        targetBusho.loyalty = Math.min(100, targetBusho.loyalty + loyaltyUp);
                        
                        // ★「行動済」マークもつけません！
                        actionDoneInThisStep = true; 
                        break; 
                    }
                    continue; // もしお金が足りなかったら、この行動は諦めて次を探します
                }

                // --- これより下は、実行する武将（doer）が必要な行動です ---
                if (availableBushos.length === 0) continue; // 動ける武将がいなければパスします

                // その行動に一番向いている武将を探します（能力値40以上が条件）
                const bestBushos = availableBushos.filter(b => b[action.stat] >= 40).sort((a, b) => b[action.stat] - a[action.stat]);
                if (bestBushos.length === 0) continue; // 基準を満たす人がいなければ、この行動は諦めます
                const doer = bestBushos[0];

                // 実行処理
                if (action.type === 'tribute' && castle.gold >= action.cost) {
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
                if (action.type === 'kunishu_goodwill' && castle.gold >= action.cost) {
                    castle.gold -= action.cost;
                    const kunishu = action.targetKunishu;
                    const increase = this.game.commandSystem.calcGoodwillIncrease(action.cost, doer);
                    const currentRel = kunishu.getRelation(castle.ownerClan);
                    kunishu.setRelation(castle.ownerClan, currentRel + increase);
                    
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
                    const success = GameSystem.calcEmploymentSuccess(doer, targetRonin, myPower, 0);
                    
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
                    this.game.strategySystem.handleCovertAction(doer.id, action.targetId, result.success, 'sabotage');
                    if (result.success) {
                        const target = this.game.getCastle(action.targetId);
                        target.defense = Math.max(0, target.defense - result.val);
                        doer.achievementTotal = (doer.achievementTotal || 0) + Math.floor(doer.intelligence * 0.2) + 10;
                        if (this.game.factionSystem && this.game.factionSystem.updateRecognition) this.game.factionSystem.updateRecognition(doer, 20);
                    } else {
                        doer.achievementTotal = (doer.achievementTotal || 0) + 5;
                        if (this.game.factionSystem && this.game.factionSystem.updateRecognition) this.game.factionSystem.updateRecognition(doer, 10);
                    }
                    
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
                    this.game.strategySystem.handleCovertAction(doer.id, action.targetId, result.success, 'incite');
                    if (result.success) {
                        const target = this.game.getCastle(action.targetId);
                        target.peoplesLoyalty = Math.max(0, target.peoplesLoyalty - result.val);
                        doer.achievementTotal = (doer.achievementTotal || 0) + Math.floor(doer.intelligence * 0.2) + 10;
                        if (this.game.factionSystem && this.game.factionSystem.updateRecognition) this.game.factionSystem.updateRecognition(doer, 20);
                    } else {
                        doer.achievementTotal = (doer.achievementTotal || 0) + 5;
                        if (this.game.factionSystem && this.game.factionSystem.updateRecognition) this.game.factionSystem.updateRecognition(doer, 10);
                    }
                    
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
                    let result = this.game.strategySystem.calcRumor(doer.id, action.targetBushoId, true);
                    const targetBusho = this.game.getBusho(action.targetBushoId);
                    this.game.strategySystem.handleCovertAction(doer.id, targetBusho.castleId, result.success, 'rumor', false, targetBusho.id);
                    if (result.success) {
                        targetBusho.loyalty = Math.max(0, targetBusho.loyalty - result.val);
                        doer.achievementTotal = (doer.achievementTotal || 0) + Math.floor(doer.intelligence * 0.2) + 10;
                        if (this.game.factionSystem && this.game.factionSystem.updateRecognition) this.game.factionSystem.updateRecognition(doer, 20);
                    } else {
                        doer.achievementTotal = (doer.achievementTotal || 0) + 5;
                        if (this.game.factionSystem && this.game.factionSystem.updateRecognition) this.game.factionSystem.updateRecognition(doer, 10);
                    }
                    
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
                if (action.type === 'headhunt' && castle.gold >= action.cost) {
                    castle.gold -= action.cost;
                    const targetBusho = this.game.getBusho(action.targetBushoId);
                    let isSuccess = this.game.strategySystem.calcHeadhunt(doer.id, action.targetBushoId, action.gold, true);
                    this.game.strategySystem.handleCovertAction(doer.id, targetBusho.castleId, isSuccess, 'headhunt', targetBusho.isCastellan && isSuccess, targetBusho.id);
                    if (isSuccess) {
                        const oldCastle = this.game.getCastle(targetBusho.castleId);
                        const oldClanId = targetBusho.clan;
                        const newClanId = doer.clan;
                        
                        if (oldClanId !== 0 && oldClanId !== newClanId) {
                            targetBusho.achievementTotal = Math.floor(targetBusho.achievementTotal / 2);
                        }
                        
                        if (targetBusho.isCastellan && oldCastle) {
                            this.game.castleManager.changeOwner(oldCastle, newClanId);
                            targetBusho.clan = newClanId;
                            targetBusho.isActionDone = true;
                            targetBusho.status = 'active';
                            targetBusho.isGunshi = false;
                            
                            const targetLord = this.game.bushos.find(b => b.clan === oldClanId && b.isDaimyo) || { affinity: 50 };
                            this.game.independenceSystem.resolveSubordinates(oldCastle, targetBusho, targetLord, newClanId, oldClanId);
                            
                            this.game.getCastleBushos(oldCastle.id).forEach(b => {
                                if (b.clan === newClanId && b.status === 'active') {
                                    this.game.affiliationSystem.updateLoyaltyForNewLord(b, newClanId);
                                }
                            });
                            
                            const myGunshi = this.game.bushos.find(b => b.clan === newClanId && b.isGunshi);
                            this.game.getCastleBushos(oldCastle.id).forEach(b => {
                                if (!myGunshi || b.id !== myGunshi.id) {
                                    if (b.clan === newClanId && b.status === 'active') b.isGunshi = false;
                                }
                            });
                            this.game.updateCastleLord(oldCastle);
                        } else {
                            targetBusho.belongKunishuId = 0;
                            targetBusho.isActionDone = true;
                            this.game.affiliationSystem.joinClan(targetBusho, newClanId, castle.id);
                        }
                        const maxStat = Math.max(targetBusho.strength, targetBusho.intelligence, targetBusho.leadership, targetBusho.charm, targetBusho.diplomacy);
                        doer.achievementTotal = (doer.achievementTotal || 0) + Math.floor(maxStat * 0.3);
                        if (this.game.factionSystem && this.game.factionSystem.updateRecognition) this.game.factionSystem.updateRecognition(doer, 25);
                    } else {
                        doer.achievementTotal = (doer.achievementTotal || 0) + 5;
                        if (this.game.factionSystem && this.game.factionSystem.updateRecognition) this.game.factionSystem.updateRecognition(doer, 10);
                    }
                    
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
                if (action.type === 'repair' && castle.gold >= 200) {
                    castle.gold -= 200;
                    const val = GameSystem.calcRepair(doer, 1.0, true);
                    const oldVal = castle.defense;
                    castle.defense = Math.min(castle.maxDefense, castle.defense + val);
                    
                    // ★プレイヤーと同じ！上がった分だけご褒美をあげます
                    const actualVal = castle.defense - oldVal;
                    doer.achievementTotal = (doer.achievementTotal || 0) + Math.floor(actualVal * 0.5);
                    if (this.game.factionSystem && this.game.factionSystem.updateRecognition) this.game.factionSystem.updateRecognition(doer, 10);
                    
                    doer.isActionDone = true; actionDoneInThisStep = true; break;
                }
                if (action.type === 'charity' && castle.rice >= 200) {
                    castle.rice -= 200;
                    
                    const val = GameSystem.calcCharity(doer, 1.0, true);
                    
                    const oldVal = castle.peoplesLoyalty;
                    castle.peoplesLoyalty = Math.min(100, castle.peoplesLoyalty + val);
                    
                    doer.achievementTotal = (doer.achievementTotal || 0) + Math.floor(val * 0.5);
                    if (this.game.factionSystem && this.game.factionSystem.updateRecognition) this.game.factionSystem.updateRecognition(doer, 15);
                    
                    doer.isActionDone = true; actionDoneInThisStep = true; break;
                }
                if (action.type === 'draft' && castle.gold >= action.cost && castle.population > 1000) {
                    // 準備段階で決めた「使う予定のお金（cost）」を使います
                    let draftCost = action.cost;
                    
                    // 実際に行く武将（doer）の能力で、集まる人数を正確に計算します
                    let soldiers = GameSystem.calcDraftFromGold(draftCost, doer, castle.peoplesLoyalty);
                    
                    // 人口を超えないようにします
                    if (castle.population < soldiers) {
                        soldiers = castle.population;
                        // 人数が減った分、使うお金も減らしてあげます
                        draftCost = GameSystem.calcDraftCost(soldiers, doer, castle.peoplesLoyalty);
                    }

                    // 兵士が上限（99999）を超えないようにします
                    if (castle.soldiers + soldiers > 99999) {
                        soldiers = 99999 - castle.soldiers;
                        draftCost = GameSystem.calcDraftCost(soldiers, doer, castle.peoplesLoyalty);
                    }

                    // ===== 仮想チェック（重要） =====
                    // 最後に、仮想の必要兵糧を計算して、本当に維持できるか最終チェックします！
                    let virtualSoldiers = castle.soldiers + soldiers;
                    let virtualRiceNeed = virtualSoldiers * 3.5;
                    
                    if (castle.rice < virtualRiceNeed) {
                        // 維持できないなら、今の兵糧で維持できるギリギリの人数に減らします
                        soldiers = Math.floor((castle.rice / 3.5) - castle.soldiers);
                        soldiers = Math.max(0, soldiers);
                        draftCost = GameSystem.calcDraftCost(soldiers, doer, castle.peoplesLoyalty);
                    }

                    if (soldiers > 0 && draftCost > 0) {
                        // 実行確定：経験値を加算します
                        GameSystem.calcDraftCost(soldiers, doer, castle.peoplesLoyalty, true);

                        // AIもプレイヤーと同じように、割合で民忠と人口を減らします
                        const draftRatio = soldiers / castle.population;
                        const penaltyRatio = draftRatio * 2;
                        const loyaltyPenalty = Math.floor(castle.peoplesLoyalty * penaltyRatio);
                        
                        castle.peoplesLoyalty = Math.max(0, castle.peoplesLoyalty - loyaltyPenalty);
                        castle.population -= soldiers;

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
                    const val = GameSystem.calcTraining(doer, castle.soldiers, 1.0, true);
                    const oldVal = castle.training;
                    castle.training = Math.min(100, castle.training + val);
                    
                    const actualVal = castle.training - oldVal;
                    doer.achievementTotal = (doer.achievementTotal || 0) + Math.floor(actualVal * 0.5);
                    if (this.game.factionSystem && this.game.factionSystem.updateRecognition) this.game.factionSystem.updateRecognition(doer, 10);
                    
                    doer.isActionDone = true; actionDoneInThisStep = true; break;
                }
                if (action.type === 'soldier_charity' && castle.rice >= 200) {
                    castle.rice -= 200;
                    const val = GameSystem.calcSoldierCharity(doer, castle.soldiers, 1.0, true);
                    const oldVal = castle.morale;
                    castle.morale = Math.min(100, castle.morale + val);
                    
                    const actualVal = castle.morale - oldVal;
                    doer.achievementTotal = (doer.achievementTotal || 0) + Math.floor(actualVal * 0.5);
                    if (this.game.factionSystem && this.game.factionSystem.updateRecognition) this.game.factionSystem.updateRecognition(doer, 10);
                    
                    doer.isActionDone = true; actionDoneInThisStep = true; break;
                }
                if (action.type === 'farm' && castle.gold >= 200) {
                    castle.gold -= 200;
                    const val = GameSystem.calcDevelopment(doer, 1.0, true);
                    const oldVal = castle.kokudaka;
                    castle.kokudaka = Math.min(castle.maxKokudaka, castle.kokudaka + val);
                    
                    const actualVal = castle.kokudaka - oldVal;
                    doer.achievementTotal = (doer.achievementTotal || 0) + Math.floor(actualVal * 0.5);
                    if (this.game.factionSystem && this.game.factionSystem.updateRecognition) this.game.factionSystem.updateRecognition(doer, 10);
                    
                    doer.isActionDone = true; actionDoneInThisStep = true; break;
                }
                if (action.type === 'commerce' && castle.gold >= 200) {
                    castle.gold -= 200;
                    const val = GameSystem.calcDevelopment(doer, 1.0, true);
                    const oldVal = castle.commerce;
                    castle.commerce = Math.min(castle.maxCommerce, castle.commerce + val);
                    
                    const actualVal = castle.commerce - oldVal;
                    doer.achievementTotal = (doer.achievementTotal || 0) + Math.floor(actualVal * 0.5);
                    if (this.game.factionSystem && this.game.factionSystem.updateRecognition) this.game.factionSystem.updateRecognition(doer, 10);
                    
                    doer.isActionDone = true; actionDoneInThisStep = true; break;
                }
                
                // 特殊行動群
                if (action.type === 'buy_gun') {
                    const amount = GameSystem.calcBuyGunAmount(500, daimyo, castellan);
                    const cost = GameSystem.calcBuyGunCost(amount, daimyo, castellan);
                    castle.gold -= cost;
                    castle.guns = Math.min(99999, (castle.guns || 0) + amount);
                    tradeCount++; step--; actionDoneInThisStep = true; break;
                }
                if (action.type === 'buy_horse') {
                    const amount = GameSystem.calcBuyHorseAmount(500, daimyo, castellan);
                    const cost = GameSystem.calcBuyHorseCost(amount, daimyo, castellan);
                    castle.gold -= cost;
                    castle.horses = Math.min(99999, (castle.horses || 0) + amount);
                    tradeCount++; step--; actionDoneInThisStep = true; break;
                }
                if (action.type === 'sell_rice') {
                    let rate = riceRate; // ★高速化：ループの外で調べた相場をそのまま使います！

                    const sellGoalRice = Math.floor(castle.soldiers * 2.0);
                    const canSellAmount = Math.max(0, castle.rice - sellGoalRice);
                    
                    const targetGold = Math.floor(castle.soldiers * 3.0);
                    const shortageGold = Math.max(0, targetGold - castle.gold);
                    
                    // 足りないお金分のお米だけを売るように計算します
                    const needSellAmount = Math.floor(shortageGold / rate);
                    
                    let sellAmount = Math.floor(Math.min(canSellAmount, needSellAmount, castle.tradeLimit || 0));
                    
                    // 少しだけしか売らないなら、手間なのでやめます
                    if (sellAmount < Math.floor(castle.soldiers * 0.2)) {
                        sellAmount = 0;
                    }
                    
                    if (sellAmount > 0) {
                        const gain = Math.floor(sellAmount * rate);
                        
                        if (castle.gold + gain <= 99999) {
                            castle.rice -= sellAmount;
                            castle.gold += gain;
                            castle.tradeLimit -= sellAmount;
                            tradeCount++; step--; actionDoneInThisStep = true; break;
                        } else {
                            // もし上限(99,999)を超えてしまう場合は、持てる分だけ売るように調整してあげます
                            const maxGain = 99999 - castle.gold;
                            sellAmount = Math.floor(maxGain / rate);
                            sellAmount = Math.min(sellAmount, castle.tradeLimit || 0);
                            if (sellAmount > 0) {
                                castle.rice -= sellAmount;
                                castle.gold += Math.floor(sellAmount * rate);
                                castle.tradeLimit -= sellAmount;
                                tradeCount++; step--; actionDoneInThisStep = true; break;
                            } else {
                                continue;
                            }
                        }
                    }
                }
                
                if (action.type === 'buy_rice') {
                    let rate = riceRate; // ★高速化：ループの外で調べた相場をそのまま使います！
                    
                    // 一気に余裕まで買います！
                    const buyTarget = Math.floor(castle.soldiers * 3.5);
                    const extendedShortage = Math.max(0, buyTarget - castle.rice);
                    
                    // 欲しい分と、お金で買える分の、少ない方にします
                    let buyAmount = Math.floor(Math.min(extendedShortage, castle.gold / rate, castle.tradeLimit || 0));
                    
                    // ちょい買い防止
                    const minRice = Math.floor(castle.soldiers * 0.3);
                    if (buyAmount < castle.soldiers * 0.2) {
                        if (castle.rice >= minRice) {
                            buyAmount = 0; // 最低限持っているなら、少しだけ買うのはやめます
                        }
                    }

                    // 上限(99,999)を超えないように調整します
                    if (castle.rice + buyAmount > 99999) {
                        buyAmount = Math.min(buyAmount, 99999 - castle.rice);
                    }

                    // 買う量が決まったら実行します
                    if (buyAmount > 0) {
                        const cost = Math.floor(buyAmount * rate);
                        castle.gold -= cost;
                        castle.rice += buyAmount;
                        castle.tradeLimit -= buyAmount;
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
                            if (castle.gold >= 500 && targetCastle.gold + 500 <= 99999) {
                                castle.gold -= 500;
                                targetCastle.gold += 500;
                            }
                        } 
                        // ② 前線基地への兵士と兵糧のお使い
                        else if (task.type === 'staging' || task.type === 'support') {
                            if (castle.soldiers >= 300 && castle.rice >= 500 && targetCastle.soldiers + 300 <= 99999 && targetCastle.rice + 500 <= 99999) {
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
                            if (castle.gold >= 500 && castle.soldiers >= 500 && targetCastle.gold + 500 <= 99999 && targetCastle.soldiers + 500 <= 99999) {
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
                            if (castle.rice >= 1000 && targetCastle.rice + 1000 <= 99999) {
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
        
        // 相手の大名（殿様）を探して、その人がいるお城をターゲットにします
        const targetDaimyo = this.game.bushos.find(b => b.clan === targetClanId && b.isDaimyo);
        let targetCastle = null;
        if (targetDaimyo) {
            targetCastle = this.game.castles.find(c => c.id === targetDaimyo.castleId);
        }
        // 万が一お殿様が見つからなかった時は、とりあえず見つかった相手の城にします
        if (!targetCastle) {
            const neighbors = this.game.castles.filter(c => c.ownerClan === targetClanId);
            if (neighbors.length > 0) targetCastle = neighbors[0];
        }
        if (!targetCastle) return;
        
        const targetCastleId = targetCastle.id;
        
        // 記憶されていた作戦（親善、同盟、支配）を実行します！
        if (targetData.action === 'dominate') {
            if (targetClanId === this.game.playerClanId) {
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

            // 使うお金が、お城の貯金箱の5分の1（20%）より多い時は、高すぎるのでキャンセルします！
            if (targetData.gold > castle.gold / 5) return;

            if (castle.gold >= targetData.gold) {
                if (targetClanId === this.game.playerClanId) {
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
             if (targetClanId === this.game.playerClanId) {
                 this.game.diplomacyManager.proposeDiplomacyToPlayer(castellan, targetClanId, 'alliance', 0, () => {
                     castellan.isActionDone = true;
                     this.game.finishTurn();
                 });
                 return 'waiting';
             } else {
                 this.game.diplomacyManager.executeDiplomacy(castellan.id, targetCastleId, 'alliance');
                 castellan.isActionDone = true;
             }
        } else if (targetData.action === 'court_truce') {
             if (castle.gold >= targetData.gold) {
                 this.game.diplomacyManager.executeDiplomacy(castellan.id, targetCastleId, 'court_truce', targetData.gold);
                 castellan.isActionDone = true;
             }
        }
    }
}