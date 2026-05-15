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

    // ★迷子になっていた魔法を復活！
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

    // ★追加：指定した大名家の「朝廷からの信用」を調べる魔法です
    getTrust(clanId) {
        const clan = this.game.clans.find(c => c.id === clanId);
        return clan ? (clan.courtTrust || 0) : 0;
    }

    // ★追加：朝廷からの信用を上げる魔法です
    addTrust(clanId, trustAmount) {
        const clan = this.game.clans.find(c => c.id === clanId);
        if (!clan) return false;

        // 上限の1000を超えないように見張る魔法（Math.min）をかけておきます！
        clan.courtTrust = Math.min(1000, (clan.courtTrust || 0) + trustAmount);
        
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

            // 当主の現在の最高ランクを調べます (rankNoは小さいほど偉い)
            let currentMaxRankNo = 20; // 何も持っていなければ一番下（20相当）とします
            
            if (leader.courtRankIds && leader.courtRankIds.length > 0) {
                const validRanks = leader.courtRankIds.map(id => this.getRankData(id)).filter(r => r);
                if (validRanks.length > 0) {
                    validRanks.sort((a, b) => a.rankNo - b.rankNo);
                    currentMaxRankNo = validRanks[0].rankNo; // 今持っている一番偉いランクの数字
                }
            }

            // ★追加：もし当主が「左馬頭（ID80）」を持っていて、朝廷に「征夷大将軍（ID1）」が空いていたら特別に就任する魔法！
            if (leader.courtRankIds && leader.courtRankIds.includes(80)) {
                if (this.availableRanks.includes(1)) {
                    // 征夷大将軍（ID1）を与えます
                    this.grantRank(leader, 1);
                    // 用済みになった左馬頭（ID80）は朝廷にお返しします
                    leader.courtRankIds = leader.courtRankIds.filter(id => id !== 80);
                    this.returnRank(80);
                    
                    const leaderName = leader.name.replace('|', '');
                    const msg = `${leaderName}が征夷大将軍に就任しました。`;
                    messages.push(msg);
                    this.game.ui.log(`【叙任】${msg}`);
                    
                    // 特別な就任をしたので、この月の通常の官位チェックはパスして次の大名へ進みます
                    return;
                }
            }

            // 威信と貢献度を取得
            const basePrestige = clan.basePrestige || 0;
            const contribution = clan.courtContribution || 0;

            // 朝廷の「空いている官位」の中から、条件を満たすものを【すべて】探します
            let candidates = this.ranks.filter(r => {
                // 条件1：朝廷の在庫にあるか
                if (!this.availableRanks.includes(r.id)) return false;
                
                // 条件2：献金で上がれるのは rankNo: 4 まで（1〜3は除外）
                if (r.rankNo < 4) return false;
                
                // 条件3：IDが80（左馬頭）の官位はイベント用なので、候補から外します
                if (r.id === 80) return false;
                
                // 条件4：今持っている最高ランクより「上（rankNoが小さい）」であるか
                // ※これで、今のランク以下の官位をもらってしまうのを防ぎます！
                if (r.rankNo >= currentMaxRankNo) return false;
                
                // 条件5：威信と貢献度の基準を満たしているか
                return basePrestige >= r.necessaryPrestige && contribution >= (r.necessaryPrestige * 4.5);
            });

            if (candidates.length === 0) return; // 条件を満たす空き官位が一つもなければ見送り

            // 候補の中で「一番偉い（rankNoが一番小さい）ランク」を見つけます
            candidates.sort((a, b) => a.rankNo - b.rankNo);
            const bestRankNo = candidates[0].rankNo;

            // 一番偉いランクと同じ rankNo を持つ官位だけを残します（飛び級で一気に上がる！）
            const finalCandidates = candidates.filter(r => r.rankNo === bestRankNo);

            // 同じランクの候補が複数ある場合は、ランダムに1つ選びます
            const index = Math.floor(Math.random() * finalCandidates.length);
            const selectedRank = finalCandidates[index];

            // いよいよ官位を授与します！
            if (this.grantRank(leader, selectedRank.id)) {
                // 武将の名前から「|」を取り除いて綺麗にします
                const leaderName = leader.name.replace('|', '');
                
                // rankName1が空欄の場合でも、不自然な空白ができないように整える魔法です
                const rankFullName = selectedRank.rankName1 ? `${selectedRank.rankName1} ${selectedRank.rankName2}` : selectedRank.rankName2;
                
                const msg = `朝廷より、${leaderName} が ${rankFullName} に叙されました。`;
                messages.push(msg);
                
                // 履歴ログにもこっそり残しておきます
                this.game.ui.log(`【叙任】${leaderName} が ${rankFullName} に叙されました。`);
            }
        });

        // 授与されたメッセージのリストを返します
        return messages;
    }
    
    // ==========================================
    // ★ここから追加：朝廷コマンドの実行処理（command_system.jsからのお引っ越し）
    // ==========================================
    
    // ★追加：貢物による「信用」の上がり幅を計算する専用の魔法です！
    calcTributeTrustIncrease(gold, doer, isExecute = false) {
        if (isExecute) {
            doer.expDiplomacy = (doer.expDiplomacy || 0) + Math.floor(gold / 300);
        }
        return Math.max(1, Math.floor(gold * (doer.diplomacy / 100) * 0.15));
    }

    // ★追加：朝廷和睦による経験値を計算・加算する専用の魔法です！
    calcCourtTruceExp(doer, isExecute = false) {
        if (isExecute) {
            doer.expDiplomacy = (doer.expDiplomacy || 0) + 5;
        }
        return 5;
    }

    // ★追加：貢物をした使者の「功績」の上がり幅を計算する専用の魔法です！
    calcTributeAchievement(gold) {
        return 5 + Math.floor(gold / 500);
    }

    // 朝廷に貢物を贈る魔法！
    executeTribute(doerId, gold) {
        const doer = this.game.getBusho(doerId);
        const castle = this.game.getCurrentTurnCastle();
        
        if (castle.gold < gold) {
            this.game.ui.showDialog("資金が足りません", false);
            return;
        }
        
        // お城の貯金箱からお金を減らします
        castle.gold -= gold;
        
        // 魔法で大名家の「朝廷への貢献度」をアップさせます！
        this.addContribution(this.game.playerClanId, gold);
        
        // ★差し替え：信用の上昇値を専門部署（自分自身）の魔法で出します！（ここで経験値も足します）
        const trustIncrease = this.calcTributeTrustIncrease(gold, doer, true);
        
        // 新しく作った魔法で、大名家の「朝廷からの信用」をアップさせます！
        this.addTrust(this.game.playerClanId, trustIncrease);
        
        // 使者は行動済みにします
        doer.isActionDone = true;
        // ★差し替え：実績のボーナスも専門部署の魔法で出します！
        doer.achievementTotal += this.calcTributeAchievement(gold);
        this.game.factionSystem.updateRecognition(doer, 10);
        
        this.game.ui.showResultModal(`${doer.name}を使者として、朝廷に 金${gold} を献上しました！`);
        
        this.game.ui.updatePanelHeader();
        this.game.ui.renderCommandMenu();
    }
    
    // 朝廷の信用を消費して強制的に和睦する魔法！
    executeCourtTruce(doerId, targetCastleId) {
        const doer = this.game.getBusho(doerId);
        const targetCastle = this.game.getCastle(targetCastleId);
        if (!targetCastle) return;

        const targetClanId = targetCastle.ownerClan;
        const targetClanName = this.game.clans.find(c => c.id === targetClanId).name;
        
        const castle = this.game.getCurrentTurnCastle();
        const costGold = 2000;

        // お城の貯金箱からお金を減らします
        castle.gold -= costGold;
        
        // 信用を「500」消費（マイナス）します！
        this.addTrust(this.game.playerClanId, -500);

        // ★追加：和睦の経験値を計算・加算します！
        this.calcCourtTruceExp(doer, true);

        // 外交状態を強制的に「和睦」にし、期間を「6」にセットします！
        this.game.diplomacyManager.changeStatus(this.game.playerClanId, targetClanId, '和睦', 6);

        // ★追加：和睦が成立したので、友好度を30アップさせます！
        this.game.diplomacyManager.updateSentiment(this.game.playerClanId, targetClanId, 30);

        // 使者は行動済みにします
        doer.isActionDone = true;
        doer.achievementTotal += Math.floor(doer.diplomacy * 0.2) + 10;
        this.game.factionSystem.updateRecognition(doer, 20);

        // 信用がどれくらい減ったかは見せないようにします
        this.game.ui.showResultModal(`朝廷の威光により、${targetClanName} との間に和睦が結ばれました！\n（和睦期間：６ヶ月）`);
        
        this.game.ui.updatePanelHeader();
        this.game.ui.renderCommandMenu();
    }
}