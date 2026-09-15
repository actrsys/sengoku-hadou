/**
 * constants.js
 * ゲーム内で共有する状態値・種別値を一元管理する。
 *
 * ルール:
 * - 保存データやCSVとの互換性を保つため、値そのもの（日本語/英字）は変更しない。
 * - 単一状態との比較は GameConstants、複数状態をまとめた「意味」の判定は各 Rules を使う。
 * - 同じ状態集合（例: 同盟/支配/従属、dead/unborn）を各所で配列・条件式として複製しない。
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
 * 武将・姫に共通する生死/登場状態の意味判定。
 * personOrStatus には人物オブジェクトまたは status 文字列のどちらでも渡せる。
 */
window.LifeStatusRules = Object.freeze({
    _statusOf(personOrStatus) {
        return (personOrStatus && typeof personOrStatus === 'object') ? personOrStatus.status : personOrStatus;
    },

    isDead(personOrStatus) {
        return this._statusOf(personOrStatus) === window.GameConstants.BushoStatus.DEAD;
    },

    isUnborn(personOrStatus) {
        return this._statusOf(personOrStatus) === window.GameConstants.BushoStatus.UNBORN;
    },

    isPresent(personOrStatus) {
        const status = this._statusOf(personOrStatus);
        return status !== window.GameConstants.BushoStatus.DEAD && status !== window.GameConstants.BushoStatus.UNBORN;
    },

    isUnavailable(personOrStatus) {
        return !this.isPresent(personOrStatus);
    }
});

/**
 * 武将固有の活動状態の意味判定。
 */
window.BushoStatusRules = Object.freeze({
    isActive(bushoOrStatus) {
        const status = (bushoOrStatus && typeof bushoOrStatus === 'object') ? bushoOrStatus.status : bushoOrStatus;
        return status === window.GameConstants.BushoStatus.ACTIVE;
    },

    isRonin(bushoOrStatus) {
        const status = (bushoOrStatus && typeof bushoOrStatus === 'object') ? bushoOrStatus.status : bushoOrStatus;
        return status === window.GameConstants.BushoStatus.RONIN;
    },

    isPresent(bushoOrStatus) {
        return window.LifeStatusRules.isPresent(bushoOrStatus);
    }
});

/**
 * 外交状態に関する「意味のある集合」は文字列配列を各所へ複製せず、ここから判定する。
 */
window.DiplomacyRules = Object.freeze({
    isAllianceOrVassal(status) {
        const S = window.GameConstants.DiplomacyStatus;
        return status === S.ALLIANCE || status === S.DOMINANT || status === S.SUBORDINATE;
    },

    canPassTerritory(status) {
        return this.isAllianceOrVassal(status);
    },

    isFriendly(status) {
        const S = window.GameConstants.DiplomacyStatus;
        return status === S.FRIENDLY || this.isAllianceOrVassal(status);
    },

    isPeaceful(status) {
        return this.isFriendly(status) || status === window.GameConstants.DiplomacyStatus.TRUCE;
    },

    isProtectedFromImmediateAttack(status) {
        return this.isAllianceOrVassal(status) || status === window.GameConstants.DiplomacyStatus.TRUCE;
    },

    isVassalRelation(status) {
        const S = window.GameConstants.DiplomacyStatus;
        return status === S.DOMINANT || status === S.SUBORDINATE;
    },

    isHostile(status) {
        return status === window.GameConstants.DiplomacyStatus.HOSTILE;
    },

    isBasicSentimentStatus(status) {
        const S = window.GameConstants.DiplomacyStatus;
        return status === S.NORMAL || status === S.FRIENDLY || status === S.HOSTILE;
    }
});
