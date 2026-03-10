/**
 * courtRank_system.js
 * 官位システムを一元管理するファイルです。
 */

class CourtRankSystem {
    constructor(game) {
        this.game = game;
        this.ranks = []; // ここに読み込んだ全ての官位データをしまっておきます
        
        // ★追加：朝廷が現在持っている（誰も持っていない）官位のIDリストです
        this.availableRanks = []; 
    }

    // CSVから読み込んだデータをセットする魔法です
    setRankData(data) {
        this.ranks = data;
        
        // ★追加：データがセットされたら、まずは全ての官位を朝廷の在庫に入れます
        this.availableRanks = this.ranks.map(r => r.id);
        
        // ★追加：その後、すでに武将が持っている官位を在庫から消す魔法を使います！
        this.syncAvailableRanks();
    }

    // ==========================================
    // ★ここから追加：官位の在庫管理システム
    // ==========================================
    
    // 全武将をチェックして、誰かが持っている官位を朝廷の在庫から消す魔法です
    syncAvailableRanks() {
        if (!this.game || !this.game.bushos) return;

        const usedRankIds = new Set();
        this.game.bushos.forEach(b => {
            // 死んでいない（活動中など）武将が持っている官位をチェックします
            if (b.status !== 'dead' && b.courtRankIds && b.courtRankIds.length > 0) {
                b.courtRankIds.forEach(id => usedRankIds.add(id));
            }
        });

        // 誰かが持っているIDは、朝廷の空きリスト(availableRanks)から外します
        this.availableRanks = this.availableRanks.filter(id => !usedRankIds.has(id));
    }

    // 武将が死んだ時などに、官位を朝廷に返す魔法です
    returnRank(rankId) {
        if (!this.availableRanks.includes(rankId)) {
            this.availableRanks.push(rankId);
        }
    }

    // 朝廷から武将に官位を与える魔法です（これから使います！）
    grantRank(busho, rankId) {
        const index = this.availableRanks.indexOf(rankId);
        // 朝廷がその官位を持っていれば
        if (index !== -1) {
            // 朝廷の在庫から消して…
            this.availableRanks.splice(index, 1);
            // 武将の持ち物リストに入れます！
            if (!busho.courtRankIds.includes(rankId)) {
                busho.courtRankIds.push(rankId);
            }
            return true; // 成功！
        }
        return false; // 朝廷が持っていなかったら失敗…
    }
    // ==========================================

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