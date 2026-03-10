/**
 * diplomacy.js
 * 外交システムを管理するクラス
 * 大名（Clan）間の感情値と関係状態を管理します。
 */

class DiplomacyManager {
    constructor(game) {
        this.game = game;
    }

    /**
     * 遅延初期化とデータ取得
     * データが存在しない場合はデフォルト値を生成して返します
     */
    getDiplomacyData(clanId, targetId) {
        const clan = this.game.clans.find(c => Number(c.id) === Number(clanId));
        if (!clan) return null;

        if (!clan.diplomacyValue) {
            clan.diplomacyValue = {};
        }

        if (!clan.diplomacyValue[targetId]) {
            // 相手側(targetId)のデータに自分(clanId)への設定があるか確認します
            const targetClan = this.game.clans.find(c => Number(c.id) === Number(targetId));
            if (targetClan && targetClan.diplomacyValue && targetClan.diplomacyValue[clanId]) {
                // もし相手側が設定を持っていれば、同じ値をコピーします
                const oppData = targetClan.diplomacyValue[clanId];
                clan.diplomacyValue[targetId] = {
                    status: oppData.status,
                    sentiment: oppData.sentiment,
                    trucePeriod: oppData.trucePeriod || 0 // ★和睦の期間もコピーします
                };
            } else {
                // どちらも持っていなければ、初期値の50になります
                clan.diplomacyValue[targetId] = {
                    status: '普通', // 状態: '普通', '友好', '敵対', '同盟', '支配', '従属', '和睦'
                    sentiment: 50,  // 感情値: 0 - 100
                    trucePeriod: 0  // ★初期値は0にします
                };
            }
        }
        return clan.diplomacyValue[targetId];
    }

    /**
     * 二国間の現在の関係を返す
     */
    getRelation(clanId, targetId) {
        return this.getDiplomacyData(clanId, targetId);
    }

    /**
     * 感情値を加減し、閾値に応じて自動でステータスを変動させる
     */
    updateSentiment(clanId, targetId, delta) {
        const dataA = this.getDiplomacyData(clanId, targetId);
        const dataB = this.getDiplomacyData(targetId, clanId);

        if (!dataA || !dataB) return;

        const update = (data) => {
            data.sentiment = Math.max(0, Math.min(100, data.sentiment + delta));
            
            // ★変更：和睦中も、勝手に状態が戻らないように保護します！
            if (['普通', '友好', '敵対'].includes(data.status)) {
                if (data.sentiment >= 70) {
                    data.status = '友好';
                } else if (data.sentiment <= 30) {
                    data.status = '敵対';
                } else {
                    data.status = '普通';
                }
            }
        };

        update(dataA);
        update(dataB);
    }

    /**
     * 強制的に状態を変更し、相手側も同期する
     * ★追加：和睦の時に、期間（trucePeriod）も一緒に設定できるようにしました！
     */
    changeStatus(clanId, targetId, newStatus, trucePeriod = 0) {
        const dataA = this.getDiplomacyData(clanId, targetId);
        const dataB = this.getDiplomacyData(targetId, clanId);

        if (!dataA || !dataB) return;

        dataA.status = newStatus;
        if (newStatus === '和睦') dataA.trucePeriod = trucePeriod;

        // 状態の反転処理と同調
        if (newStatus === '支配') {
            dataB.status = '従属';
        } else if (newStatus === '従属') {
            dataB.status = '支配';
        } else {
            // 同盟・敵対・和睦などは共通
            dataB.status = newStatus;
            if (newStatus === '和睦') dataB.trucePeriod = trucePeriod;
        }
    }

    /**
     * ★新しく追加！：毎月末に呼ばれて、和睦の期間を減らす魔法です
     */
    processEndMonth() {
        this.game.clans.forEach(clan => {
            if (!clan.diplomacyValue) return;
            
            for (const targetId in clan.diplomacyValue) {
                const data = clan.diplomacyValue[targetId];
                
                // もし状態が「和睦」で、期間が1以上残っていたら…
                if (data.status === '和睦' && data.trucePeriod > 0) {
                    data.trucePeriod -= 1; // 期間を1ヶ月減らします
                    
                    // 減らした結果、期間が0になったら…
                    if (data.trucePeriod <= 0) {
                        // 感情値（仲の良さ）に合わせて、元の状態に戻します！
                        if (data.sentiment >= 70) {
                            data.status = '友好';
                        } else if (data.sentiment <= 30) {
                            data.status = '敵対';
                        } else {
                            data.status = '普通';
                        }
                    }
                }
            }
        });
    }
}