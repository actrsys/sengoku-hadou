/**
 * faction_system.js
 * 派閥・承認欲求・下野システム
 * 修正: 相性計算を円環仕様(0-99ループ)に対応
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
            // 【修正】単純な引き算ではなく、円環計算(0-50)を使用する
            const diff = GameSystem.calcAffinityDiff(busho.affinity, daimyo.affinity);
            
            if (baseAmount > 0) {
                // 不満が溜まる場合（プラス変動）
                // 相性が悪い(差50)ほど、係数は大きくなる (最大2.5倍)
                // 式: 0.5 + (50 / 25) = 2.5
                factor = baseFactor + (diff / divisor); 
            } 
            else {
                // 恩義を感じる場合（マイナス変動）
                // 相性が良い(差0)ほど、係数は大きくなる (最大2.5倍)
                // 差が50の場合: 0.5 + 0 = 0.5倍
                // 差が0の場合: 0.5 + 2.0 = 2.5倍
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
        const battleBonus = F.SolidarityBattle || 5;
        const stayBonusTrigger = F.SolidarityStayTrigger || 12; // 追加
        const stayBonusBase = F.SolidarityStayBase || 9;
        const stayBonusDiv = F.SolidarityStayDiv || 3;
        const joinThreshold = F.JoinScoreThreshold || 40;

        const clans = this.game.clans;
        
        clans.forEach(clan => {
            if (clan.id === 0) return;

            const members = this.game.bushos.filter(b => b.clan === clan.id && b.status === 'active');
            
            // 既存の派閥IDをクリア (再編)
            members.forEach(b => b.factionId = 0);

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
            // 5名以上で最大2つ、以降5名増えるごとに+1 (最大5)
            // 例: 4人->0, 5人->2, 10人->3, 15人->4, 20人->5
            let maxFactions = 2;
            if (members.length >= 10) maxFactions = 3;
            if (members.length >= 15) maxFactions = 4;
            if (members.length >= 20) maxFactions = 5;

            // 実際に結成される派閥リーダー
            const factionLeaders = candidates.slice(0, maxFactions);
            
            // リーダー自身にID付与
            factionLeaders.forEach((leader, index) => {
                leader.factionId = (clan.id * 100) + index + 1;
            });

            // メンバーの加入判定
            const nonLeaders = members.filter(b => !b.isDaimyo && b.factionId === 0);
            
            nonLeaders.forEach(b => {
                let bestLeader = null;
                let minScore = 999;

                factionLeaders.forEach(leader => {
                    // 1. 相性差 (修正: 円環計算を使用)
                    const affDiff = GameSystem.calcAffinityDiff(b.affinity, leader.affinity);
                    
                    // 2. 思想差
                    const innoDiff = Math.abs(b.innovation - leader.innovation);

                    // 3. 連帯感ボーナス計算
                    let solidarityBonus = 0;

                    // (A) 参戦履歴ボーナス: 重複する battleHistory 1件につき 5
                    const battleOverlap = b.battleHistory.filter(h => leader.battleHistory.includes(h)).length;
                    solidarityBonus += battleOverlap * battleBonus;

                    // (B) 滞在履歴ボーナス: Trigger(SolidarityStayTrigger)ヶ月以上重複滞在している場合 (重複期間 - SolidarityStayBase) / SolidarityStayDiv
                    // stayHistory: [{castleId, start, end}, ...]
                    let totalOverlapMonths = 0;
                    b.stayHistory.forEach(bHist => {
                        leader.stayHistory.forEach(lHist => {
                            if (bHist.castleId === lHist.castleId) {
                                // 期間の重なりを計算
                                const start = Math.max(bHist.start, lHist.start);
                                const end = Math.min(bHist.end, lHist.end);
                                if (end > start) {
                                    totalOverlapMonths += (end - start);
                                }
                            }
                        });
                    });

                    // 指定月数以上
                    if (totalOverlapMonths >= stayBonusTrigger) {
                        solidarityBonus += Math.floor((totalOverlapMonths - stayBonusBase) / stayBonusDiv);
                    }

                    // (C) 相性補正: 連帯感ボーナスに対し max(0, 1.0 - (affDiff / 50)) を掛ける
                    // 相性が悪い(50以上離れている)と、いくら一緒にいても連帯感は生まれない
                    // 修正: affDiffは最大50なので、分母も50のままで正常に動作する (差が50なら0倍)
                    const correction = Math.max(0, 1.0 - (affDiff / 50.0));
                    const finalBonus = solidarityBonus * correction;

                    // 判定スコア式 (値が小さいほどリーダーに近い)
                    // Score = (affDiff + (innoDiff * 0.5) + 20) - (補正済み連帯ボーナス)
                    const score = (affDiff + (innoDiff * 0.5) + 20) - finalBonus;

                    // Score < Threshold の中で最小のものを探す
                    if (score < joinThreshold && score < minScore) {
                        minScore = score;
                        bestLeader = leader;
                    }
                });

                // 最適な派閥があれば加入
                if (bestLeader) {
                    b.factionId = bestLeader.factionId;
                }
            });
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
            
            // 合戦功績: (実行武将の統率の 30%) + (勝利側ボーナス 20)
            const achievementGain = Math.floor(busho.leadership * achieveLdr) + achieveBase;
            busho.achievementTotal += achievementGain;
        }
    }
}