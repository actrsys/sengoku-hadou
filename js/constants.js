/**
 * constants.js
 * ゲーム内で共有する状態値・種別値を一元管理する。
 *
 * ルール:
 * - 保存データやCSVとの互換性を保つため、値そのもの（日本語/英字）は変更しない。
 * - 新しい判定では文字列リテラルを直接並べず、ここか専門Rulesの判定関数を使う。
 */
window.GameConstants = Object.freeze({
    BushoStatus: Object.freeze({
        ACTIVE: 'active',
        RONIN: 'ronin',
        DEAD: 'dead',
        UNBORN: 'unborn'
    }),
    DiplomacyStatus: Object.freeze({
        NORMAL: '普通',
        FRIENDLY: '友好',
        HOSTILE: '敵対',
        ALLIANCE: '同盟',
        DOMINANT: '支配',
        SUBORDINATE: '従属',
        TRUCE: '和睦'
    })
});

/**
 * 外交状態に関する「意味のある集合」は文字列配列を各所へ複製せず、ここから判定する。
 */
window.DiplomacyRules = Object.freeze({
    canPassTerritory(status) {
        const S = window.GameConstants.DiplomacyStatus;
        return status === S.ALLIANCE || status === S.DOMINANT || status === S.SUBORDINATE;
    },

    isFriendly(status) {
        const S = window.GameConstants.DiplomacyStatus;
        return status === S.FRIENDLY || status === S.ALLIANCE || status === S.DOMINANT || status === S.SUBORDINATE;
    },

    isProtectedFromImmediateAttack(status) {
        const S = window.GameConstants.DiplomacyStatus;
        return this.canPassTerritory(status) || status === S.TRUCE;
    },

    isVassalRelation(status) {
        const S = window.GameConstants.DiplomacyStatus;
        return status === S.DOMINANT || status === S.SUBORDINATE;
    }
});
