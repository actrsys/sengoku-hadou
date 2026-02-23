/**
 * faction_system.js
 * 派閥・承認欲求・下野システム
 * 修正: 浪人移動(processRoninMovements)と城主最適化(optimizeCastellans)をgame.jsからお引っ越し
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
        if (!busho || busho.status === 'ronin' || busho.status === 'dead') return;
        
        // パラメータ取得
        const F = window.WarParams.Faction || {};
        const baseFactor = F.AffinityFactorBase || 0.5;
        const divisor = F.AffinityDivisor || 25;

        // 大名との相性による補正
        const daimyo = this.game.bushos.find(b => b.clan === busho.clan && b.isDaimyo);
        let factor = 1.0;
        
        if (daimyo) {
            const diff = GameSystem.calcAffinityDiff(busho.affinity, daimyo.affinity);
            
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
        busho.recognitionNeed = Math.max(-100, Math.min(100, busho.recognitionNeed + change));
    }

    /**
     * 月末処理: 忠誠度変動と承認欲求の自然減衰
     */
    processEndMonth() {
        const F = window.WarParams.Faction || {};
        const threshold = F.LoyaltyChangeThreshold || 20;
        const decay = F.NaturalDecay || 10;

        this.game.bushos.forEach(b => {
            if (b.status !== 'active' && b.status !== 'ronin') return;
            if (b.clan === 0) return;

            // 1. 承認欲求による忠誠度変化
            if (!b.isDaimyo) {
                // -20ごとに忠誠+1、+20ごとに忠誠-1
                const loyaltyChange = Math.floor(b.recognitionNeed / -threshold);
                if (loyaltyChange !== 0) {
                    b.loyalty = Math.max(0, Math.min(100, b.loyalty + loyaltyChange));
                }

                // 2. 承認欲求の自然減衰 (0に近づく)
                if (b.recognitionNeed > 0) {
                    b.recognitionNeed = Math.max(0, b.recognitionNeed - decay);
                } else if (b.recognitionNeed < 0) {
                    b.recognitionNeed = Math.min(0, b.recognitionNeed + decay);
                }
            }
        });
    }

    /**
     * 月初処理: 下野判定と派閥形成
     */
    processStartMonth() {
        const F = window.WarParams.Faction || {};
        const roninThreshold = F.RoninLoyaltyThreshold || 30;
        const roninChanceBase = F.RoninChanceBase || 0.5;

        // 1. 下野判定
        const roninCandidates = this.game.bushos.filter(b => 
            b.status === 'active' && 
            b.clan !== 0 && 
            !b.isDaimyo && 
            !b.isCastellan && 
            b.loyalty <= roninThreshold
        );

        roninCandidates.forEach(b => {
            const chance = roninChanceBase - (b.loyalty * 0.01); 
            if (Math.random() < chance) {
                this.executeRonin(b);
            }
        });

        // 2. 派閥形成・更新
        this.updateFactions();
    }

    executeRonin(busho) {
        const clan = this.game.clans.find(c => c.id === busho.clan);
        const clanName = clan ? clan.name : "当家";
        
        busho.status = 'ronin';
        busho.clan = 0;
        busho.factionId = 0;
        busho.recognitionNeed = 0;
        busho.isFactionLeader = false;
        
        const castle = this.game.getCastle(busho.castleId);
        if (castle) {
            castle.samuraiIds = castle.samuraiIds.filter(id => id !== busho.id);
        }

        if (clan && clan.id === this.game.playerClanId) {
            this.game.ui.log(`【出奔】${busho.name}は${clanName}に愛想を尽かし、下野しました。`);
            this.game.ui.showCutin(`${busho.name} 出奔！`);
        }
    }

    /**
     * 派閥の更新ロジック (改修版)
     */
    updateFactions() {
        const F = window.WarParams.Faction || {};
        const achieveLeader = F.AchievementLeader || 500;
        
        // CSV設定ファイルに上書きされないように、数値を「強制指定」にしています
        const battleBonus = 2; // 強制的に2
        const stayBonusTrigger = F.SolidarityStayTrigger || 12; 
        const stayBonusBase = F.SolidarityStayBase || 9;
        const stayBonusDiv = F.SolidarityStayDiv || 3;
        const joinThreshold = 35; // ★派閥に入るための合格ライン（強制的に35）

        const clans = this.game.clans;
        
        clans.forEach(clan => {
            if (clan.id === 0) return;

            const members = this.game.bushos.filter(b => b.clan === clan.id && b.status === 'active');
            
            // 既存の派閥IDとリーダーフラグをクリア (再編)
            members.forEach(b => {
                b.factionId = 0;
                b.isFactionLeader = false;
            });

            // リーダー候補選出
            // 条件: 功績500以上 かつ 性格がhermit(隠遁者)ではない
            const candidates = members.filter(b => 
                !b.isDaimyo && 
                b.achievementTotal >= achieveLeader && 
                b.personality !== 'hermit'
            ).sort((a, b) => b.achievementTotal - a.achievementTotal);

            // 資格を満たす武将が2名以上いない場合は派閥なし
            if (candidates.length < 2) return;

            // 最大派閥数の動的決定
            let maxFactions = 2;
            if (members.length >= 10) maxFactions = 3;
            if (members.length >= 15) maxFactions = 4;
            if (members.length >= 20) maxFactions = 5;

            // 実際に結成される派閥リーダー（最初は仮リーダーとして扱う）
            const factionLeaders = candidates.slice(0, maxFactions);
            
            // リーダー自身にIDとリーダーフラグ付与
            factionLeaders.forEach((leader, index) => {
                leader.factionId = (clan.id * 100) + index + 1;
                leader.isFactionLeader = true;
            });

            // ★追加：点数計算の仕組みを「共通の道具（関数）」としてまとめました
            const evaluateJoin = (evaluatingBushos, availableLeaders) => {
                evaluatingBushos.forEach(b => {
                    let bestLeader = null;
                    let minScore = 999;

                    const stats = [
                        { key: 'leadership', val: Number(b.leadership) || 0 },
                        { key: 'strength', val: Number(b.strength) || 0 },
                        { key: 'politics', val: Number(b.politics) || 0 },
                        { key: 'diplomacy', val: Number(b.diplomacy) || 0 },
                        { key: 'intelligence', val: Number(b.intelligence) || 0 }
                    ];
                    const bestStatKey = stats.reduce((max, stat) => stat.val > max.val ? stat : max, stats[0]).key;

                    const maxLeaderStatVal = Math.max(...availableLeaders.map(l => Number(l[bestStatKey]) || 0));

                    availableLeaders.forEach(leader => {
                        const affDiff = GameSystem.calcAffinityDiff(b.affinity, leader.affinity);
                        const innoDiff = Math.abs(b.innovation - leader.innovation);

                        let solidarityBonus = 0;
                        const battleOverlap = b.battleHistory.filter(h => leader.battleHistory.includes(h)).length;
                        solidarityBonus += battleOverlap * battleBonus;

                        let totalOverlapMonths = 0;
                        b.stayHistory.forEach(bHist => {
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
                        const myStatVal = Number(b[bestStatKey]) || 0;

                        if (leaderStatVal > myStatVal && leaderStatVal === maxLeaderStatVal) {
                            abilityBonus = Math.min(10, Math.floor(leaderStatVal * 0.15));
                        }
                        
                        const charmBonus = Math.floor((50 - (Number(leader.charm) || 0)) * 0.1);
                        const achievementBonus = Math.max(0, Math.floor(((Number(leader.achievementTotal) || 0) - 500) / 25));

                        let personalityBonus = 0;
                        if (b.personality && leader.personality && b.personality === leader.personality) {
                            personalityBonus = 5;
                        }

                        // ★変更：全体の入りやすさ（基本値35）
                        const score = ((affDiff * 0.5) + (innoDiff * 0.25) + 35) - finalBonus - abilityBonus + charmBonus - achievementBonus - personalityBonus;

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

            // 【1段階目】リーダー以外のメンバーが、仮リーダーの誰かを選ぶ
            const nonLeaders = members.filter(b => !b.isDaimyo && b.factionId === 0);
            evaluateJoin(nonLeaders, factionLeaders);

            // 【チェック】誰も入ってこなかったリーダーをあぶり出す
            const validLeaders = [];
            const invalidLeaders = [];

            factionLeaders.forEach(leader => {
                // 自分以外の派閥員が何人いるか数える
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

            // 【2段階目】リーダーになれなかった元リーダーたちが、生き残ったリーダーの派閥に入る
            if (invalidLeaders.length > 0) {
                if (validLeaders.length > 0) {
                    // 生き残ったリーダーがいるなら、そこへの加入を試みる
                    evaluateJoin(invalidLeaders, validLeaders);
                } else {
                    // 全員が失格（誰にもメンバーがつかなかった）場合は、誰も派閥を作れないので全員解散！
                    members.forEach(b => {
                        b.factionId = 0;
                        b.isFactionLeader = false;
                    });
                }
            }
        });
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
        const F = window.WarParams.Faction || {};
        const achieveBase = F.BattleAchievementBase || 20;
        const achieveLdr = F.BattleAchievementLdrFactor || 0.3;

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
     * 月初の浪人移動処理
     */
     processRoninMovements() {
        // 全武将から「浪人」かつ「国人衆に所属していない（IDが0または未定義）」武将を抽出
        const ronins = this.game.bushos.filter(b => b.status === 'ronin' && !b.belongKunishuId);
        
        ronins.forEach(r => {
            const currentC = this.game.getCastle(r.castleId); 
            if(!currentC) return; 
            
            // 隣接する城のリストを作る
            const neighbors = this.game.castles.filter(c => GameSystem.isAdjacent(currentC, c)); 
            
            // 隣に城があって、かつ20%の確率(サイコロ)に当たったらお引越しする
            if (neighbors.length > 0 && Math.random() < 0.2) {
                // クジ引きで移動先の城を「1つだけ」決める
                const targetCastle = neighbors[Math.floor(Math.random() * neighbors.length)];
                
                // 今いる城のリストから名前を消す
                currentC.samuraiIds = currentC.samuraiIds.filter(id => id !== r.id); 
                // 新しく決まった城のリストに名前を書く
                targetCastle.samuraiIds.push(r.id); 
                r.castleId = targetCastle.id; 
            }
        }); 
    }

    /**
     * ★ここから追加した部分です（game.jsからのお引っ越し）
     * 3ヶ月ごとの城主最適化処理（大名による自動任命）
     */
    optimizeCastellans() { 
        // 変更箇所：this.castles などを this.game.castles と呼ぶように直しています
        const clanIds = [...new Set(this.game.castles.filter(c=>c.ownerClan!==0).map(c=>c.ownerClan))]; 
        clanIds.forEach(clanId => { 
            const myBushos = this.game.bushos.filter(b => b.clan === clanId); 
            if(myBushos.length===0) return; 
            
            let daimyoInt = Math.max(...myBushos.map(b => b.intelligence)); 
            if (Math.random() * 100 < daimyoInt) { 
                const clanCastles = this.game.castles.filter(c => c.ownerClan === clanId); 
                clanCastles.forEach(castle => { 
                    const currentCastellan = this.game.getBusho(castle.castellanId);
                    if (currentCastellan && currentCastellan.isDaimyo) return;

                    const castleBushos = this.game.getCastleBushos(castle.id).filter(b => b.status !== 'ronin'); 
                    if (castleBushos.length <= 1) return; 
                    
                    this.game.electCastellan(castle, castleBushos);
                }); 
            } 
        }); 
    }
}