/**
 * faction_system.js
 * 派閥・承認欲求・下野システム
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
        
        // 大名との相性による補正 (相性が良いほど、不満は溜まりにくく、恩義は感じやすい)
        // affinityDiff: 0(良) ～ 50(悪) ～ 100(最悪)
        // ※GameSystem.calcAffinityDiffは最大50を返す仕様のようなので、標準的な0-100スケールとして扱うため再計算
        const daimyo = this.game.bushos.find(b => b.clan === busho.clan && b.isDaimyo);
        let factor = 1.0;
        
        if (daimyo) {
            // 単純な数値差分 (0-100)
            const diff = Math.abs(busho.affinity - daimyo.affinity); 
            // baseAmountが正(労働/不満増)の場合: 相性が悪い(diff大)ほど増えやすい
            if (baseAmount > 0) {
                factor = 0.5 + (diff / 50.0); // 0.5倍 ～ 2.5倍
            } 
            // baseAmountが負(褒美/恩義増)の場合: 相性が良い(diff小)ほど減りやすい(恩義を感じやすい)
            else {
                factor = 0.5 + ((100 - diff) / 50.0); // 0.5倍 ～ 2.5倍
            }
        }

        let change = Math.floor(baseAmount * factor);
        busho.recognitionNeed = Math.max(-100, Math.min(100, busho.recognitionNeed + change));
    }

    /**
     * 月末処理: 忠誠度変動と承認欲求の自然減衰
     */
    processEndMonth() {
        this.game.bushos.forEach(b => {
            if (b.status !== 'active' && b.status !== 'ronin') return;
            if (b.clan === 0) return;

            // 1. 承認欲求による忠誠度変化
            // 大名は対象外
            if (!b.isDaimyo) {
                // 欲求100で-5, -100で+5
                const loyaltyChange = Math.floor(b.recognitionNeed / -20);
                if (loyaltyChange !== 0) {
                    b.loyalty = Math.max(0, Math.min(100, b.loyalty + loyaltyChange));
                }

                // 2. 承認欲求の自然減衰 (0に向かって戻る)
                // 働かなければ不満(プラス)は消え、恩義(マイナス)も薄れる
                if (b.recognitionNeed > 0) {
                    b.recognitionNeed = Math.max(0, b.recognitionNeed - 10);
                } else if (b.recognitionNeed < 0) {
                    b.recognitionNeed = Math.min(0, b.recognitionNeed + 10);
                }
            }
        });
    }

    /**
     * 月初処理: 下野判定と派閥形成
     */
    processStartMonth() {
        // 1. 下野判定 (月末に忠誠度が下がった結果、月初に出ていく)
        const roninCandidates = this.game.bushos.filter(b => 
            b.status === 'active' && 
            b.clan !== 0 && 
            !b.isDaimyo && 
            !b.isCastellan && 
            b.loyalty <= 30
        );

        roninCandidates.forEach(b => {
            // 忠誠度30以下で確率判定。低いほど抜けやすい。
            // 忠誠0: 50%, 忠誠30: 20% 程度
            const chance = 0.5 - (b.loyalty * 0.01); 
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
        
        // 処理
        busho.status = 'ronin';
        busho.clan = 0;
        busho.factionId = 0;
        busho.recognitionNeed = 0;
        
        // 所属城のリストから削除 (浪人としてその城には留まる)
        const castle = this.game.getCastle(busho.castleId);
        if (castle) {
            castle.samuraiIds = castle.samuraiIds.filter(id => id !== busho.id);
        }

        // プレイヤー配下なら通知
        if (clan && clan.id === this.game.playerClanId) {
            this.game.ui.log(`【出奔】${busho.name}は${clanName}に愛想を尽かし、下野しました。`);
            this.game.ui.showCutin(`${busho.name} 出奔！`);
        }
    }

    /**
     * 派閥の更新ロジック
     * 功績が高い武将がリーダーとなり、相性の良い武将を取り込む
     */
    updateFactions() {
        const clans = this.game.clans;
        
        clans.forEach(clan => {
            if (clan.id === 0) return;

            const members = this.game.bushos.filter(b => b.clan === clan.id && b.status === 'active');
            if (members.length < 5) return; // 少人数なら派閥なし

            // 既存の派閥IDをクリア (再編)
            members.forEach(b => b.factionId = 0);

            // リーダー候補選出 (大名は除く、功績順)
            const candidates = members.filter(b => !b.isDaimyo)
                                      .sort((a, b) => b.achievementTotal - a.achievementTotal);
            
            if (candidates.length === 0) return;

            // 上位2名を派閥リーダーとする
            const factionLeaders = candidates.slice(0, 2);
            
            factionLeaders.forEach((leader, index) => {
                const factionId = (clan.id * 100) + index + 1; // 簡易ID生成
                leader.factionId = factionId;
                
                // メンバー勧誘
                members.forEach(b => {
                    if (b.isDaimyo || b.factionId !== 0) return; // 既に所属済み or 大名

                    // 派閥判定ロジック
                    // 1. 相性 (affinity)
                    const affDiff = Math.abs(b.affinity - leader.affinity);
                    
                    // 2. 思想 (innovation)
                    const innoDiff = Math.abs(b.innovation - leader.innovation);
                    
                    // 3. 連帯感 (stayHistory, battleHistoryから推測も可能だが簡易的に相性重視)
                    // 判定スコア: 低いほど良い
                    const score = affDiff + (innoDiff * 0.5);

                    // 基準値以下なら派閥入り
                    if (score < 40) {
                        b.factionId = factionId;
                    }
                });
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
            // 履歴は最新10件程度に保つ
            if (busho.stayHistory.length > 10) busho.stayHistory.shift();
        }

        busho.arrivalTurn = currentTurn;
    }

    /**
     * 参戦履歴の記録
     */
    recordBattle(busho, castleId) {
        const key = `${this.game.year}_${this.game.month}_${castleId}`;
        // 重複チェック
        if (!busho.battleHistory.includes(key)) {
            busho.battleHistory.push(key);
            // 最新20件程度
            if (busho.battleHistory.length > 20) busho.battleHistory.shift();
            
            // 功績加算 (合戦は評価が高い)
            busho.achievementTotal += 50;
        }
    }
}