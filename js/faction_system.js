/**
 * faction_system.js
 * 派閥・承認欲求・下野システム
 * 修正: 城主最適化(optimizeCastellans)をgame.jsからお引っ越し
 */

class FactionSystem {
    constructor(game) {
        this.game = game;
    }

    /**
     * 承認欲求の更新 (行動時など)
     * @param {Busho} busho 
     * @param {number} baseAmount 基本変動量 (プラスは不満蓄積、マイナスは恩義/解消)
     */
    updateRecognition(busho, baseAmount) {
        if (!busho || window.BushoStatusRules.isRonin(busho) || window.LifeStatusRules.isDead(busho) || busho.isDaimyo) return;
        
        // パラメータ取得
        const F = window.WarParams.Faction;
        const baseFactor = F.AffinityFactorBase;
        const divisor = F.AffinityDivisor;
        
        // 大名との相性による補正
        const daimyo = this.game.getClanDaimyo(busho.clan);
        let factor = 1.0;
        
        if (daimyo) {
            const diff = PersonnelRules.calcAffinityDiff(busho.affinity, daimyo.affinity);
            
            if (baseAmount > 0) {
                // 不満が溜まる場合（プラス変動）
                factor = baseFactor + (diff / divisor); 
            } 
            else {
                // 恩義を感じる場合（マイナス変動）
                factor = baseFactor + ((50 - diff) / divisor);
            }
        }

        let change = Math.floor(baseAmount * factor);

        // ★追加：忠誠度が95以上なら、不満（プラスの承認欲求）の溜まり方を半分にします！
        if (busho.loyalty >= 95 && change > 0) {
            change = Math.floor(change / 2);
        }

        // 設定値から最大値と最小値を取得します（なければ-100と100を予備として使用）
        const minRec = F.MinRecognition;
        const maxRec = F.MaxRecognition;

        busho.recognitionNeed = Math.max(minRec, Math.min(maxRec, busho.recognitionNeed + change));
    }

    /**
     * 月初の派閥所属恩恵。大名と同じ派閥の家臣へ忠誠上昇・承認欲求減衰を適用する。
     */
    applyStartMonthSameFactionEffects() {
        const F = window.WarParams.Faction;
        const minRec = F.MinRecognition;
        const decayRec = F.SameFactionRecognitionDecay;
        const boostLoy = F.SameFactionLoyaltyBoost;

        this.game.clans.forEach(clan => {
            if (clan.id === 0 || clan.isDestroyed) return;
            const daimyo = this.game.getBusho(clan.leaderId);
            if (!daimyo || daimyo.factionId <= 0) return;

            this.game.getClanCastles(clan.id).forEach(castle => {
                this.game.getCastleBushos(castle.id).forEach(busho => {
                    if (!window.BushoStatusRules.isActive(busho) || busho.factionId !== daimyo.factionId) return;
                    busho.loyalty = Math.min(100, busho.loyalty + boostLoy);
                    busho.recognitionNeed = Math.max(minRec, (busho.recognitionNeed || 0) - decayRec);
                });
            });
        });
    }

    /**
     * 承認欲求から月末の忠誠変動量を求める。
     * 正負を対称に扱い、閾値未満では忠誠を動かさない。
     */
    static calcRecognitionLoyaltyChange(recognitionNeed, threshold) {
        const need = Number(recognitionNeed) || 0;
        const step = Math.max(1, Number(threshold) || 1);
        const levels = Math.floor(Math.abs(need) / step);
        if (levels <= 0) return 0;
        return need > 0 ? -levels : levels;
    }

    /**
     * 月末処理: 忠誠度変動と承認欲求の自然減衰
     */
    processEndMonth() {
        const F = window.WarParams.Faction;
        const threshold = F.LoyaltyChangeThreshold;
        const decay = F.NaturalDecay;

        this.game.bushos.forEach(b => {
            if (!window.BushoStatusRules.isActive(b) && !window.BushoStatusRules.isRonin(b)) return;
            if (b.clan === 0) return;

            // 1. 承認欲求による忠誠度変化
            if (!b.isDaimyo) {
                // 設定された閾値ごとに、マイナス側は忠誠+1、プラス側は忠誠-1。閾値未満は0で、正負を対称に扱う。
                const loyaltyChange = FactionSystem.calcRecognitionLoyaltyChange(b.recognitionNeed, threshold);
                if (loyaltyChange !== 0) {
                    b.loyalty = Math.max(0, Math.min(100, b.loyalty + loyaltyChange));
                }

                // 2. 承認欲求の自然減衰 (0に近づく)
                if (b.recognitionNeed > 0) {
                    b.recognitionNeed = Math.max(0, b.recognitionNeed - decay);
                } else if (b.recognitionNeed < 0) {
                    // ★変更：恩義（マイナスの承認欲求）が消えるペースを半分（5ずつ）にして長持ちさせます！
                    const minusDecay = Math.max(1, Math.floor(decay / 2));
                    b.recognitionNeed = Math.min(0, b.recognitionNeed + minusDecay);
                }
            }
        });
    }

    /**
     * 月初処理: 下野判定と派閥形成
     */
    async processStartMonth() { // ★ async を追加します！
        const F = window.WarParams.Faction;
        const roninThreshold = F.RoninLoyaltyThreshold;
        const roninChanceBase = F.RoninChanceBase;
        
        // ★追加：出奔率の全体調整用の倍率（0.5なら50%、0.8なら80%に設定可能）
        const roninMultiplier = 0.5;

        // 1. 下野判定
        const roninCandidates = this.game.bushos.filter(b => 
            window.BushoStatusRules.isActive(b) && 
            b.clan !== 0 && 
            !b.isDaimyo && 
            !b.isCastellan && 
            b.loyalty <= roninThreshold
        );

        // ★修正：forEach をやめて、順番待ちができる for...of に変えます！
        for (const b of roninCandidates) {
            // ★基本の計算結果に、先ほど一番上で作った倍率（roninMultiplier）を掛け算します
            let chance = (roninChanceBase - (b.loyalty * 0.01)) * roninMultiplier;
            
            // ★ここから書き足し：大名と一門なら下野しにくくする魔法！
            // まずは自分の仕えている大名（殿様）を探します
            const daimyo = this.game.getClanDaimyo(b.clan);
            if (daimyo) {
                // 自分と大名の家族ID(familyIds)に共通のものがあるか調べます
                const isFamily = b.familyIds.some(id => daimyo.familyIds.includes(id));
                if (isFamily) {
                    chance = chance * 0.7; // 一門なら、下野する確率を70％に減らします！
                }
            }
            // ★書き足しここまで！

            if (Math.random() < chance) {
                await this.executeRonin(b); // ★ await を追加します！
            }
        }

        // 2. 派閥形成・更新
        this.updateFactions();
    }

    async executeRonin(busho) { // ★ async を追加します！
        const clan = this.game.getClan(busho.clan);
        const clanName = clan ? clan.name : "当家";
        
        // ★新しいお引越しセンターの魔法を使います！
        this.game.affiliationSystem.becomeRonin(busho);

        if (clan && clan.id === this.game.playerClanId) {
            const message = `${busho.name}は${clanName}に愛想を尽かし、下野しました。`;
            this.game.ui.log(`【出奔】${message}`);
            // 月初カットインではなく、他の通常通知と同じ共通ダイアログをそのまま使います。
            await this.game.ui.showDialogAsync(message);
        }
    }

    /**
     * 派閥の更新ロジック (改修版)
     */
    updateFactions(targetClanId = null) {
        const F = window.WarParams.Faction;
        const achieveLeader = F.AchievementLeader;
        
        // CSV設定ファイルに上書きされないように、数値を「強制指定」にしています
        const battleBonus = 2; // 強制的に2
        const stayBonusTrigger = F.SolidarityStayTrigger; 
        const stayBonusBase = F.SolidarityStayBase;
        const stayBonusDiv = F.SolidarityStayDiv;
        const joinThreshold = 35; // 派閥に入るための合格ライン（強制的に35）

        // ★高速化：死亡などで1勢力だけ変化した時は、その勢力だけ再編できます。
        const targetId = (targetClanId === null || targetClanId === undefined) ? null : Number(targetClanId);
        const clans = targetId === null
            ? this.game.clans
            : this.game.clans.filter(c => Number(c.id) === targetId);

        // ★高速化：勢力ごとに毎回4000人をfilterするのをやめ、全武将を最大1回だけ走査します。
        const membersByClan = new Map();
        for (const b of this.game.bushos) {
            if (!window.BushoStatusRules.isActive(b) || Number(b.clan) === 0) continue;
            if (targetId !== null && Number(b.clan) !== targetId) continue;
            const cid = Number(b.clan);
            if (!membersByClan.has(cid)) membersByClan.set(cid, []);
            membersByClan.get(cid).push(b);
        }
        
        clans.forEach(clan => {
            if (Number(clan.id) === 0) return;

            const members = membersByClan.get(Number(clan.id)) || [];
            
            // ★高速化：前派閥主を武将ごとにmembers.findするのをやめます。
            const previousLeaderByFaction = new Map();
            members.forEach(m => {
                if (m.factionId > 0 && m.isFactionLeader && !previousLeaderByFaction.has(m.factionId)) previousLeaderByFaction.set(m.factionId, m.id);
            });
            members.forEach(b => {
                b.previousLeaderId = b.factionId > 0 ? (previousLeaderByFaction.get(b.factionId) || 0) : 0;
            });

            // 既存の派閥IDとリーダーフラグをクリア (再編)
            members.forEach(b => {
                b.factionId = 0;
                b.isFactionLeader = false;
                // ★ここに追加：派閥が解散したら、方針と思想も「無所属」に戻します！
                b.factionSeikaku = "無所属";
                b.factionHoshin = "無所属";
                b.factionName = "";
                b.factionYomi = "";
            });

            // リーダー候補選出
            // 条件: 功績500以上 かつ 方針がhermit(隠遁者)ではない かつ 隠居ではない
            const candidates = members.filter(b => {
                let ach = b.achievementTotal || 0;
                // ★追加：スキルマネージャーから派閥用の功績ボーナスを受け取ります
                if (typeof SkillManager !== 'undefined') {
                    ach += SkillManager.calcFactionAchievementBonus(b, this.game);
                }
                return !b.isDaimyo && 
                       !b.isRetired && 
                       ach >= achieveLeader && 
                       b.personality !== 'hermit';
            });

            // 資格を満たす武将が2名以上いない場合は派閥なし
            if (candidates.length < 2) return;

            // 最大派閥数の動的決定
            let maxFactions = 2;
            if (members.length >= 10) maxFactions = 3;
            if (members.length >= 15) maxFactions = 4;
            if (members.length >= 20) maxFactions = 5;

            // ★高速化：同じ候補リスト・履歴を得点計算のたびに作り直さないための小さなキャッシュです。
            const leaderGroupMetaCache = new WeakMap();
            const battleSetCache = new WeakMap();
            const familySetCache = new WeakMap();
            const getLeaderGroupMeta = (availableLeaders) => {
                let meta = leaderGroupMetaCache.get(availableLeaders);
                if (meta) return meta;
                const maxByStat = { leadership: 0, strength: 0, politics: 0, diplomacy: 0, intelligence: 0 };
                const idSet = new Set();
                availableLeaders.forEach(l => {
                    idSet.add(l.id);
                    for (const key of Object.keys(maxByStat)) {
                        const v = Number(l[key]) || 0;
                        if (v > maxByStat[key]) maxByStat[key] = v;
                    }
                });
                meta = { maxByStat, idSet };
                leaderGroupMetaCache.set(availableLeaders, meta);
                return meta;
            };
            const getBattleSet = (b) => {
                let set = battleSetCache.get(b);
                if (!set) { set = new Set(b.battleHistory || []); battleSetCache.set(b, set); }
                return set;
            };
            const getFamilySet = (b) => {
                let set = familySetCache.get(b);
                if (!set) { set = new Set(b.familyIds || []); familySetCache.set(b, set); }
                return set;
            };

            // 点数計算ルールを「共通の道具（calcScore）」としてまとめました
            const calcScore = (voter, leader, availableLeaders) => {
                const stats = [
                    { key: 'leadership', val: Number(voter.leadership) || 0 },
                    { key: 'strength', val: Number(voter.strength) || 0 },
                    { key: 'politics', val: Number(voter.politics) || 0 },
                    { key: 'diplomacy', val: Number(voter.diplomacy) || 0 },
                    { key: 'intelligence', val: Number(voter.intelligence) || 0 }
                ];
                const bestStatKey = stats.reduce((max, stat) => stat.val > max.val ? stat : max, stats[0]).key;

                const leaderGroupMeta = getLeaderGroupMeta(availableLeaders);
                const maxLeaderStatVal = leaderGroupMeta.maxByStat[bestStatKey];

                const affDiff = PersonnelRules.calcAffinityDiff(voter.affinity, leader.affinity);
                const innoDiff = Math.abs(voter.innovation - leader.innovation);

                let solidarityBonus = 0;
                const leaderBattleSet = getBattleSet(leader);
                let battleOverlap = 0;
                (voter.battleHistory || []).forEach(h => { if (leaderBattleSet.has(h)) battleOverlap++; });
                solidarityBonus += battleOverlap * battleBonus;

                let totalOverlapMonths = 0;
                voter.stayHistory.forEach(bHist => {
                    leader.stayHistory.forEach(lHist => {
                        if (bHist.castleId === lHist.castleId) {
                            const start = Math.max(bHist.start, lHist.start);
                            const end = Math.min(bHist.end, lHist.end);
                            if (end > start) {
                                totalOverlapMonths += (end - start);
                            }
                        }
                    });
                });

                if (totalOverlapMonths >= stayBonusTrigger) {
                    solidarityBonus += Math.floor((totalOverlapMonths - stayBonusBase) / stayBonusDiv);
                }

                const correction = Math.max(0, 1.0 - (affDiff / 50.0));
                const finalBonus = solidarityBonus * correction;
                
                let abilityBonus = 0;
                const leaderStatVal = Number(leader[bestStatKey]) || 0;
                const myStatVal = Number(voter[bestStatKey]) || 0;

                if (leaderStatVal > myStatVal && leaderStatVal === maxLeaderStatVal) {
                    abilityBonus = Math.min(10, Math.floor(leaderStatVal * 0.15));
                }
                
                const charmBonus = Math.floor((50 - (Number(leader.charm) || 0)) * 0.1);
                
                // 功績500を超えた分を「merit（はみ出し功績）」として覚えます
                let leaderAchievement = Number(leader.achievementTotal) || 0;
                // ★追加：スキルマネージャーから派閥用の功績ボーナスを受け取ります
                if (typeof SkillManager !== 'undefined') {
                    leaderAchievement += SkillManager.calcFactionAchievementBonus(leader, this.game);
                }
                const merit = Math.max(0, leaderAchievement - 500);

                // 「3乗根（Math.cbrt）」の魔法を使って、点数が上がるごとに必要な功績がどんどん増えるようにします！
                // 最後に 1.85 をかけることで、功績1万のときに「約40点」に収まるように調整しています。
                const achievementBonus = Math.floor(Math.cbrt(merit) * 1.85);

                let personalityBonus = 0;
                if (voter.personality && leader.personality && voter.personality === leader.personality) {
                    personalityBonus = 5;
                }

                // ★追加：前回の派閥リーダーに関するボーナスとペナルティ
                let stayFactionBonus = 0;
                let factionChangePenalty = 0;

                // 自分の前のリーダーが今回も候補（availableLeaders）にいるか確認します
                const isPrevLeaderAvailable = leaderGroupMeta.idSet.has(voter.previousLeaderId);

                if (voter.previousLeaderId > 0) {
                    if (voter.previousLeaderId === leader.id) {
                        // 同じリーダーなら留まりやすいようにボーナス（点数を下げます）
                        stayFactionBonus = 5; 
                    } else if (isPrevLeaderAvailable) {
                        // 前のリーダーが健在なのに、違う派閥に移ろうとする場合はペナルティ（点数を上げます）
                        factionChangePenalty = 5;
                    }
                }

                // ★追加：一門じゃない場合は少しだけ入りにくくする（点数を上げる）魔法です！
                let familyPenalty = 0;
                // 投票する武将とリーダーが、お互いの一門リストに同じ番号を持っているか確認します
                const leaderFamilySet = getFamilySet(leader);
                const isFamily = voter.familyIds && leader.familyIds && voter.familyIds.some(fId => leaderFamilySet.has(fId));
                // もし一門じゃなかったら、ペナルティとして点数を増やします
                if (!isFamily) {
                    familyPenalty = 5; // ちょっとだけ入りにくくするために5点を足します
                }
                
                //基準となる持ち点を「35」点に設定しました。
                return ((affDiff * 0.5) + (innoDiff * 0.25) + 35) - finalBonus - abilityBonus + charmBonus - achievementBonus - personalityBonus - stayFactionBonus + factionChangePenalty + familyPenalty;
            };

            // 派閥に入れる処理の共通ルール
            const evaluateJoin = (evaluatingBushos, availableLeaders) => {
                evaluatingBushos.forEach(b => {
                    let bestLeader = null;
                    let minScore = 999;

                    availableLeaders.forEach(leader => {
                        const score = calcScore(b, leader, availableLeaders);
                        if (score < joinThreshold && score < minScore) {
                            minScore = score;
                            bestLeader = leader;
                        }
                    });

                    if (bestLeader) {
                        b.factionId = bestLeader.factionId;
                    }
                });
            };

            // ==============================================
            // 事前アンケート（モック選挙）で人気を測る！
            // ==============================================
            const supportCounts = new Map();
            candidates.forEach(c => supportCounts.set(c, 0));

            const voters = members.filter(b => !b.isDaimyo);
            
            voters.forEach(voter => {
                let bestCandidate = null;
                let minScore = 999;

                candidates.forEach(candidate => {
                    if (voter === candidate) return; 
                    const score = calcScore(voter, candidate, candidates);
                    if (score < joinThreshold && score < minScore) {
                        minScore = score;
                        bestCandidate = candidate;
                    }
                });

                if (bestCandidate) {
                    supportCounts.set(bestCandidate, supportCounts.get(bestCandidate) + 1);
                }
            });

            // 「支持者が1人でもいる（派閥ができそう）」な候補者をピックアップします！
            let potentialLeaders = candidates.filter(c => supportCounts.get(c) > 0);

            // 「派閥ができそうな人」が最大枠をオーバーしてしまった場合だけ、人気投票で削ります！
            if (potentialLeaders.length > maxFactions) {
                potentialLeaders.sort((a, b) => {
                    const supportDiff = supportCounts.get(b) - supportCounts.get(a);
                    if (supportDiff !== 0) {
                        return supportDiff; // 支持者が多い順
                    }
                    return b.achievementTotal - a.achievementTotal; // 同点なら功績が高い順
                });
                
                // 下位の人を切り捨てて、最大枠に収めます
                potentialLeaders = potentialLeaders.slice(0, maxFactions);
            }

            // 削った結果、残ったリーダーが「1人以下」なら、ライバルがいないので派閥争いにならない（終了）
            if (potentialLeaders.length < 2) {
                return;
            }

            // 残った人たちが、晴れて「仮の派閥リーダー」になります
            const factionLeaders = potentialLeaders;
            
            // リーダー自身にIDとリーダーフラグ付与
            factionLeaders.forEach((leader, index) => {
                leader.factionId = (clan.id * 100) + index + 1;
                leader.isFactionLeader = true;
            });

            // 【1段階目】部下たちが、選ばれたトップリーダーたちの中で「誰についていくか」を正式決定する
            const nonLeaders = members.filter(b => !b.isDaimyo && b.factionId === 0);
            evaluateJoin(nonLeaders, factionLeaders);

            // 【チェック】（念のため）誰も入ってこなかった悲しいリーダーをあぶり出す
            const validLeaders = [];
            const invalidLeaders = [];

            factionLeaders.forEach(leader => {
                const followerCount = members.filter(b => b.factionId === leader.factionId && b !== leader).length;
                if (followerCount === 0) {
                    // 誰もいないのでリーダー失格！
                    leader.isFactionLeader = false;
                    leader.factionId = 0; // 無所属に戻す
                    invalidLeaders.push(leader);
                } else {
                    // メンバーがいるので正式なリーダー！
                    validLeaders.push(leader);
                }
            });

            // ★追加：本番の組み分けが終わった後、生き残ったリーダーが「1人以下」なら、派閥争いにならないので全員解散！
            if (validLeaders.length < 2) {
                members.forEach(b => {
                    b.factionId = 0;
                    b.isFactionLeader = false;
                });
                return; // ここで終了！
            }

            // 【2段階目】万が一リーダーになれなかった元リーダーがいれば、生き残った人気リーダーの派閥に入る
            if (invalidLeaders.length > 0) {
                evaluateJoin(invalidLeaders, validLeaders);
            }

            // ★追加：大名もいずれかの派閥に属するようにします！（一番スコアが良い＝一番数値が低い派閥を選びます）
            const daimyo = members.find(b => b.isDaimyo);
            if (daimyo && validLeaders.length > 0) {
                let bestLeader = null;
                let minScore = 999; // 最初はありえないくらい高い点数にしておきます
                
                validLeaders.forEach(leader => {
                    const score = calcScore(daimyo, leader, validLeaders);
                    // 点数が低い（＝相性が良い）派閥を見つけたら、記憶を上書きします
                    if (score < minScore) {
                        minScore = score;
                        bestLeader = leader;
                    }
                });
                
                // 一番マシな派閥のリーダーが見つかったら、その派閥に入ります！
                if (bestLeader) {
                    daimyo.factionId = bestLeader.factionId;
                }
            }

            // ★ここから追加：正式な派閥が決まったら、リーダーの方針と思想を計算してメンバー全員に教えます！
            validLeaders.forEach(leader => {
                // 1. リーダーの能力から「方針」を計算します
                const mil = (leader.leadership + leader.strength) / 2;
                const pol = (leader.politics + leader.diplomacy) / 2;
                let seikaku = "中道";
                if (mil > pol * 1.2) seikaku = "武闘派";
                else if (pol > mil * 1.2) seikaku = "穏健派";

                // 2. リーダーの革新性から「思想」を計算します
                const inn = leader.innovation || 0;
                let hoshin = "保守的";
                if (inn >= 66) hoshin = "革新的";
                else if (inn >= 36) hoshin = "中道";
                else hoshin = "保守的";

                // 3. 派閥名の生成
                const sameFamilyLeaders = validLeaders.filter(l => l.familyName && l.familyName === leader.familyName && l.id !== leader.id);
                const isSameFamilyAsDaimyo = daimyo && daimyo.familyName && leader.familyName === daimyo.familyName;
                
                let fName = "";
                let fYomi = "";
                if (!leader.givenName) {
                    fName = leader.familyName + "派";
                    fYomi = (leader.familyYomi || leader.yomi || "") + "は";
                } else if (sameFamilyLeaders.length > 0 || isSameFamilyAsDaimyo) {
                    fName = leader.givenName + "派";
                    fYomi = (leader.givenYomi || leader.yomi || "") + "は";
                } else {
                    fName = leader.familyName + "派";
                    fYomi = (leader.familyYomi || leader.yomi || "") + "は";
                }

                // 4. このリーダーと同じ派閥IDを持つメンバー全員（自分も含む）に、方針と思想、派閥名を配ります
                const factionMembers = members.filter(b => b.factionId === leader.factionId);
                factionMembers.forEach(b => {
                    b.factionSeikaku = seikaku;
                    b.factionHoshin = hoshin;
                    b.factionName = fName;
                    b.factionYomi = fYomi;
                });
            });
            
        });

        // ★ここから追加：派閥が新しくなったので、もし派閥の画面が開いていたら描き直す魔法です！
        if (this.game && this.game.ui && this.game.ui.info) {
            const modal = document.getElementById('faction-list-modal');
            const info = this.game.ui.info;
            // 画面が隠れていなくて、どの勢力を見ているか覚えているなら描き直します
            if (modal && !modal.classList.contains('hidden') && info.currentFactionClanId) {
                info.showFactionList(info.currentFactionClanId, info.isFactionListDirect);
            }
        }
    }

    /**
     * 移動時の履歴処理
     * 3ヶ月以上滞在していた場合のみ履歴に残す
     */
    handleMove(busho, fromCastleId, toCastleId) {
        const currentTurn = this.game.year * 12 + this.game.month;
        const duration = currentTurn - busho.arrivalTurn;

        if (duration >= 3) {
            busho.stayHistory.push({
                castleId: fromCastleId,
                start: busho.arrivalTurn,
                end: currentTurn
            });
            if (busho.stayHistory.length > 10) busho.stayHistory.shift();
        }

        busho.arrivalTurn = currentTurn;
    }

    /**
     * 参戦履歴の記録
     */
    recordBattle(busho, castleId) {
        const F = window.WarParams.Faction;
        const achieveBase = F.BattleAchievementBase;
        const achieveLdr = F.BattleAchievementLdrFactor;

        const key = `${this.game.year}_${this.game.month}_${castleId}`;
        if (!busho.battleHistory.includes(key)) {
            busho.battleHistory.push(key);
            if (busho.battleHistory.length > 20) busho.battleHistory.shift();
            
            // 合戦功績
            const achievementGain = Math.floor(busho.leadership * achieveLdr) + achieveBase;
            busho.achievementTotal += achievementGain;
        }
    }

    /**
     * 3ヶ月ごとの城主最適化処理（大名による自動任命）
     */
    optimizeCastellans() { 
        // ★高速化：勢力ごとに4000人をfilterし直さず、最初の1回で所属別にまとめます。
        const clanIds = [...new Set(this.game.castles.filter(c=>c.ownerClan!==0).map(c=>c.ownerClan))];
        const bushosByClan = new Map();
        this.game.bushos.forEach(b => {
            if (window.LifeStatusRules.isUnborn(b)) return;
            if (!bushosByClan.has(b.clan)) bushosByClan.set(b.clan, []);
            bushosByClan.get(b.clan).push(b);
        });
        clanIds.forEach(clanId => { 
            const myBushos = bushosByClan.get(clanId) || [];
            if(myBushos.length===0) return; 
            
            const daimyo = myBushos.find(b => b.isDaimyo);
            let daimyoInt = daimyo ? daimyo.intelligence : 50;

            if (Math.random() * 100 < daimyoInt) { 
                const clanCastles = this.game.getClanCastles(clanId); 
                clanCastles.forEach(castle => { 
                    const currentCastellan = this.game.getBusho(castle.castellanId);
                    if (currentCastellan && currentCastellan.isDaimyo) return;

                    const castleBushos = this.game.getCastleBushos(castle.id).filter(b => b.clan === castle.ownerClan && window.BushoStatusRules.isActive(b));
                    if (castleBushos.length <= 1) return; 
                    
                    this.game.electCastellan(castle, castleBushos);
                }); 
            } 
        }); 
    }
}