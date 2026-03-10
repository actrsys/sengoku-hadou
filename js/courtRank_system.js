/**
 * courtRank_system.js
 * 官位システムを一元管理するファイルです。
 */

class CourtRankSystem {
    constructor(game) {
        this.game = game;
        this.ranks = []; // ここに読み込んだ全ての官位データをしまっておきます
    }

    // CSVから読み込んだデータをセットする魔法です
    setRankData(data) {
        this.ranks = data;
    }

    // 指定したIDの官位データを取り出す魔法です
    getRankData(id) {
        return this.ranks.find(r => r.id === id);
    }

    // 武将が持っている官位の「威信ボーナス」の合計を計算して返します
    getBushoRankBonus(busho) {
        if (!busho || !busho.courtRankIds) return 0;
        
        let bonus = 0;
        busho.courtRankIds.forEach(id => {
            const rank = this.getRankData(id);
            if (rank) {
                bonus += rank.gainPrestige;
            }
        });
        return bonus;
    }

    // 武将が持っている官位の中で、一番偉い（rankNoが小さい）官位の名前を返します
    getHighestRankName(busho) {
        if (!busho || !busho.courtRankIds || busho.courtRankIds.length === 0) return "なし";
        
        // 持っている官位データを集めて、偉い順（rankNoが小さい順）に並べ替えます
        const validRanks = busho.courtRankIds.map(id => this.getRankData(id)).filter(r => r);
        if (validRanks.length === 0) return "なし";
        
        validRanks.sort((a, b) => a.rankNo - b.rankNo);
        return validRanks[0].rankName2; // （例：征夷大将軍、など）
    }

    // ==========================================
    // ★ここから追加：朝廷への貢献度システム
    // ==========================================

    // 指定した大名家の「朝廷への貢献度」を調べる魔法です
    getContribution(clanId) {
        const clan = this.game.clans.find(c => c.id === clanId);
        return clan ? (clan.courtContribution || 0) : 0;
    }

    // お金を積んで、朝廷への貢献度を上げる魔法です
    addContribution(clanId, goldAmount) {
        const clan = this.game.clans.find(c => c.id === clanId);
        if (!clan) return false;

        // とりあえず今回は「払ったお金の分だけ貢献度が上がる」という計算にしておきます
        // 上限の99999を超えないように見張る魔法（Math.min）をかけておきます！
        clan.courtContribution = Math.min(99999, (clan.courtContribution || 0) + goldAmount);
        
        return true;
    }
}