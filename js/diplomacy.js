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
            clan.diplomacyValue[targetId] = {
                status: '普通', // 状態: '普通', '友好', '敵対', '同盟', '支配', '従属'
                sentiment: 50  // 感情値: 0 - 100
            };
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
            
            // 同盟・支配・従属はイベント等による強制変更のみとし、感情値による自動解除は行わない
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
     */
    changeStatus(clanId, targetId, newStatus) {
        const dataA = this.getDiplomacyData(clanId, targetId);
        const dataB = this.getDiplomacyData(targetId, clanId);

        if (!dataA || !dataB) return;

        dataA.status = newStatus;

        // 状態の反転処理と同調
        if (newStatus === '支配') {
            dataB.status = '従属';
        } else if (newStatus === '従属') {
            dataB.status = '支配';
        } else {
            // 同盟・敵対などは共通
            dataB.status = newStatus;
        }
    }
}