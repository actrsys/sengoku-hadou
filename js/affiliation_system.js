/**
 * affiliation_system.js
 * 武将の「所属変更（お引越し）」をすべて一元管理するお引越しセンターです！
 */

class AffiliationSystem {
    constructor(game) {
        this.game = game;
    }

    /**
     * ① 浪人から仕官したり、敵から寝返ったりして「新しい大名家」に入る時の魔法
     * @param {object} busho - お引越しする武将
     * @param {number} newClanId - 新しい大名家のID
     * @param {number} newCastleId - 新しく入るお城のID
     */
    joinClan(busho, newClanId, newCastleId) {
        const oldClanId = busho.clan;

        // 1. 今いるお城から出ます
        this.leaveCastle(busho);

        // 2. もし元々どこかの大名家にいて、別の大名家に移るなら、功績を半分にします！
        if (oldClanId !== 0 && oldClanId !== newClanId) {
            busho.achievementTotal = Math.floor((busho.achievementTotal || 0) / 2);
        }

        // 3. 前の派閥のデータなどを綺麗に忘れさせます
        this.resetFactionData(busho);

        // 4. 新しい大名家の所属にして、状態を「活動中(active)」にします
        busho.clan = newClanId;
        busho.status = 'active';
        busho.isCastellan = false;
        busho.isDaimyo = false;

        // 5. 新しい殿様との相性を計算して、最初の忠誠度を決めます！
        this.updateLoyaltyForNewLord(busho, newClanId);

        // 6. 新しいお城に入ります
        this.enterCastle(busho, newCastleId);
    }

    /**
     * ② 追放されたり、下野（自分から辞める）して「浪人」になる時の魔法
     * @param {object} busho - 浪人になる武将
     */
    becomeRonin(busho) {
        const oldClanId = busho.clan;

        // 1. 大名家を抜けるので、功績を半分にします！
        if (oldClanId !== 0) {
            busho.achievementTotal = Math.floor((busho.achievementTotal || 0) / 2);
        }

        // 2. 派閥のデータなどを綺麗に忘れさせます
        this.resetFactionData(busho);

        // 3. 浪人になるので、肩書きを外します
        busho.clan = 0;
        busho.status = 'ronin';
        busho.isCastellan = false;
        busho.isDaimyo = false;

        // 4. お城から出ます
        // （浪人としてその城の周辺には居座りますが、お城の中からは追い出されます）
        this.leaveCastle(busho);
    }

    /**
     * ③ 同じ大名家の中で、別のお城に「移動」する時の魔法
     * @param {object} busho - 移動する武将
     * @param {number} newCastleId - 移動先のお城のID
     */
    moveCastle(busho, newCastleId) {
        // 1. 今のお城から出ます
        this.leaveCastle(busho);
        
        // 2. 新しいお城に入ります
        this.enterCastle(busho, newCastleId);
        
        // 3. 移動するといったん城主ではなくなります（必要なら後で再任命します）
        busho.isCastellan = false; 
    }

    /**
     * （共通の道具）お城から出る時の処理
     */
    leaveCastle(busho) {
        if (busho.castleId) {
            const oldCastle = this.game.getCastle(busho.castleId);
            if (oldCastle) {
                // お城のリストから自分を消します
                oldCastle.samuraiIds = oldCastle.samuraiIds.filter(id => id !== busho.id);
                
                // もし自分が城主だったら、城主を空っぽにします
                if (oldCastle.castellanId === busho.id) {
                    oldCastle.castellanId = 0;
                    busho.isCastellan = false;
                }
                this.game.updateCastleLord(oldCastle);
            }
        }
    }

    /**
     * （共通の道具）お城に入る時の処理
     */
    enterCastle(busho, newCastleId) {
        busho.castleId = newCastleId;
        const newCastle = this.game.getCastle(newCastleId);
        if (newCastle) {
            // お城のリストに自分がいなければ、名前を書きます
            if (!newCastle.samuraiIds.includes(busho.id)) {
                newCastle.samuraiIds.push(busho.id);
            }
            this.game.updateCastleLord(newCastle);
        }
    }

    /**
     * （共通の道具）派閥や承認欲求のデータをまっさらにリセットする処理
     */
    resetFactionData(busho) {
        busho.factionId = 0;
        busho.isFactionLeader = false;
        busho.recognitionNeed = 0;
        busho.factionSeikaku = "無所属";
        busho.factionHoshin = "無所属";
        busho.belongKunishuId = 0;
    }

    /**
     * （共通の道具）新しい殿様との相性で忠誠度を決める処理
     */
    updateLoyaltyForNewLord(busho, clanId) {
        // 新しい殿様（大名）を探します
        const daimyo = this.game.bushos.find(b => b.clan === clanId && b.isDaimyo) || { affinity: 50 };
        
        // 殿様との相性の「ズレ（差）」を計算します（0〜50の数字になります）
        const affDiff = GameSystem.calcAffinityDiff(daimyo.affinity, busho.affinity);
        
        // ズレが0（ピッタリ）なら50アップ、ズレが50（真逆）なら0アップにします
        const loyaltyUp = 50 - affDiff;
        
        // 基本の50にアップ分を足して、最高100までにします
        busho.loyalty = Math.min(100, 50 + loyaltyUp);
    }
    
}