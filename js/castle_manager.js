/**
 * castle_manager.js
 * 城の管理（所有者の変更など）を専門に行うファイルです
 */
class CastleManager {
    constructor(game) {
        this.game = game;
    }

    // 城の持ち主を変更する魔法です
    changeOwner(castle, newOwnerId) {
        const oldOwnerId = castle.ownerClan;
        castle.ownerClan = newOwnerId;
        
        // 調査状態などをリセットします
        castle.investigatedUntil = 0;
        
        // ★追加：城を失った旧勢力の武将たちの忠誠度を下げます！
        if (oldOwnerId !== 0 && oldOwnerId !== newOwnerId) {
            // ★変更：失った後、まだお城が残っているか（滅亡していないか）を調べます！
            const remainingCastles = this.game.castles.filter(c => c.ownerClan === oldOwnerId);
            if (remainingCastles.length > 0) {
                this.decreaseLoyaltyOnCastleLost(oldOwnerId);
            }
        }

        // ★追加：新しく城を得た勢力の武将たちの忠誠度を上げます！
        if (newOwnerId !== 0 && oldOwnerId !== newOwnerId) {
            this.increaseLoyaltyOnCastleGained(newOwnerId);
        }

        // 持ち主が変わったことによる諸勢力の反発をチェックします
        if (oldOwnerId !== newOwnerId && newOwnerId !== 0) {
            this.applyKunishuRelationDropOnCapture(castle, newOwnerId);
        }
    }

    // ★追加：城を失った勢力の、大名以外の武将の忠誠度を全員３ダウンさせる魔法です
    decreaseLoyaltyOnCastleLost(clanId) {
        // その勢力に所属している、活動中で大名ではない武将をみんな集めます
        const bushsoInClan = this.game.bushos.filter(b => b.clan === clanId && b.status === 'active' && !b.isDaimyo);
        
        bushsoInClan.forEach(b => {
            // 忠誠度を3引きます。0より小さくならないように、ストッパー（Math.max）をかけておきます
            b.loyalty = Math.max(0, b.loyalty - 3);
        });
    }

    // ★追加：新しく城を得た勢力の、大名以外の武将の忠誠度を全員３アップさせる魔法です
    increaseLoyaltyOnCastleGained(clanId) {
        // その勢力に所属している、活動中で大名ではない武将をみんな集めます
        const bushsoInClan = this.game.bushos.filter(b => b.clan === clanId && b.status === 'active' && !b.isDaimyo);
        
        bushsoInClan.forEach(b => {
            // 忠誠度を3足します。100より大きくならないように、ストッパー（Math.min）をかけておきます
            b.loyalty = Math.min(100, b.loyalty + 3);
        });
    }

    // 諸勢力の友好度が下がる処理（war_effort.jsからお引越ししてきました）
    applyKunishuRelationDropOnCapture(castle, newOwnerClan) {
        if (newOwnerClan === 0) return; 
        
        const kunishusInCastle = this.game.kunishuSystem.getKunishusInCastle(castle.id);
        
        kunishusInCastle.forEach(kunishu => {
            const currentRel = kunishu.getRelation(newOwnerClan);
            if (currentRel <= 69) {
                const newRel = Math.max(0, currentRel - 20);
                kunishu.setRelation(newOwnerClan, newRel);
                
                if (newOwnerClan === this.game.playerClanId) {
                    this.game.ui.log(`(城の主が変わったため、${kunishu.getName(this.game)}との友好度が低下しました)`);
                }
            }
        });
    }
}