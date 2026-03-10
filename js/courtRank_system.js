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
    
    // ==========================================
    // ★ここから追加：月初めの官位授与チェック
    // ==========================================
    processMonthlyPromotions() {
        let messages = [];

        if (!this.game || !this.game.clans) return messages;

        this.game.clans.forEach(clan => {
            if (clan.id === 0) return; // 空き家（中立）はチェックしません

            const leader = this.game.getBusho(clan.leaderId);
            if (!leader || leader.status === 'dead' || leader.status === 'unborn') return;

            // 当主の現在の最高ランクを調べます
            let targetRankNo = 19; // 何も持っていなければ、最下位の19を目指します
            
            if (leader.courtRankIds && leader.courtRankIds.length > 0) {
                const validRanks = leader.courtRankIds.map(id => this.getRankData(id)).filter(r => r);
                if (validRanks.length > 0) {
                    // rankNo は小さいほど偉いので、昇順に並べ替えて一番小さいものを取ります
                    validRanks.sort((a, b) => a.rankNo - b.rankNo);
                    targetRankNo = validRanks[0].rankNo - 1; // 今持っている最高ランクの「1つ上」を目指します
                }
            }

            // 献金で上がれるのは rankNo: 3 までです（イベント用に取っておきます）
            if (targetRankNo < 3) return;

            // 朝廷の「空いている官位」の中から、ターゲットランクのものを探します
            let candidates = this.ranks.filter(r => r.rankNo === targetRankNo && this.availableRanks.includes(r.id));
            if (candidates.length === 0) return; // 空きが一つもなければ今回は見送りです

            // 威信と貢献度の条件を満たしているかチェックします
            const basePrestige = clan.basePrestige || 0;
            const contribution = clan.courtContribution || 0;

            candidates = candidates.filter(r => {
                // 素の威信が necessaryPrestige 以上、かつ
                // 貢献度が necessaryPrestige の 4.5倍 以上
                return basePrestige >= r.necessaryPrestige && contribution >= (r.necessaryPrestige * 4.5);
            });

            if (candidates.length === 0) return; // 条件を満たす官位がない場合は見送りです

            // 同じランクの候補が複数ある場合は、ランダムに1つ選びます
            const index = Math.floor(Math.random() * candidates.length);
            const selectedRank = candidates[index];

            // いよいよ官位を授与します！
            if (this.grantRank(leader, selectedRank.id)) {
                // 武将の名前から「|」を取り除いて綺麗にします
                const leaderName = leader.name.replace('|', '');
                const msg = `朝廷より、${leaderName} が ${selectedRank.rankName1} ${selectedRank.rankName2} に叙されました。`;
                messages.push(msg);
                
                // 履歴ログにもこっそり残しておきます
                this.game.ui.log(`【叙任】${leaderName} が ${selectedRank.rankName1} ${selectedRank.rankName2} に叙されました。`);
            }
        });

        // 授与されたメッセージのリストを返します
        return messages;
    }
}