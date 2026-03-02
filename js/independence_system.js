/**
 * independence_system.js
 * 城主の独立（謀反）システム
 */

class IndependenceSystem {
    constructor(game) {
        this.game = game;
    }

    /**
     * 月末に呼び出されるメイン処理
     */
    async checkIndependence() {
        const potentialRebels = this.game.castles.filter(c => {
            if (c.ownerClan === 0) return false; 
            if (!c.castellanId) return false; 
            const castellan = this.game.getBusho(c.castellanId);
            if (!castellan || castellan.isDaimyo) return false; 
            const clanCastles = this.game.castles.filter(cl => cl.ownerClan === c.ownerClan);
            if (clanCastles.length <= 1) return false;
            return true;
        });

        const I = window.WarParams.Independence || {};
        const thresholdBase = I.ThresholdBase || 29;
        const dutyDiv = I.ThresholdDutyDiv || 2;
        const ambDiv = I.ThresholdAmbitionDiv || 5;

        for (const castle of potentialRebels) {
            const castellan = this.game.getBusho(castle.castellanId);
            const daimyo = this.game.bushos.find(b => b.clan === castle.ownerClan && b.isDaimyo);
            if (!castellan || !daimyo) continue;
            if (daimyo.factionId !== 0 && castellan.factionId === daimyo.factionId) continue; 

            const threshold = thresholdBase + ((50 - castellan.duty) / dutyDiv) + ((castellan.ambition - 50) / ambDiv);
            if (castellan.loyalty <= threshold) {
                await this.calculateAndExecute(castle, castellan, daimyo, threshold);
            }
        }
    }

    /**
     * 大名の総合ステータスによる補正値の計算 (200~400の範囲で -20~+20)
     */
    calcDaimyoPowerBonus(busho) {
        const total = busho.leadership + busho.strength + busho.politics + busho.diplomacy + busho.intelligence;
        const diff = total - 300;
        const clampedDiff = Math.max(-100, Math.min(100, diff));
        return (clampedDiff / 100) * 20;
    }

    /**
     * ★新機能：新しい主君への忠誠度を動的に計算する
     * 元の忠誠が低いほど、新しい体制への期待で忠誠が上がる（最大100）
     */
    calcNewLoyalty(oldLoyalty) {
        const bonus = 100 - oldLoyalty;
        return Math.min(100, 80 + bonus);
    }

    async calculateAndExecute(castle, castellan, daimyo, threshold) {
        const I = window.WarParams.Independence || {};
        const probLoyalty = I.ProbLoyaltyFactor || 2;
        const probAffinity = I.ProbAffinityFactor || 0.5;
        const daimyoBonus = this.calcDaimyoPowerBonus(daimyo);
        const affinityDiff = GameSystem.calcAffinityDiff(castellan.affinity, daimyo.affinity);
        
        let prob = ((threshold - castellan.loyalty) * probLoyalty) + (affinityDiff * probAffinity) - (daimyoBonus * 2);
        
        if (prob <= 0) return;
        if (Math.random() * 1000 < prob) {
            await this.executeRebellion(castle, castellan, daimyo);
        }
    }

    async executeRebellion(castle, castellan, oldDaimyo) {
        const oldClanId = castle.ownerClan;
        const I = window.WarParams.Independence || {};

        // --- ★ここから：寝返り先を探す処理 ---
        let targetClanId = null;
        let targetDaimyo = null;
        let bestScore = -1;

        // 今の大名家の戦力と、謀反を起こす城の戦力を計算します
        const oldClanPower = this.calcClanPower(oldClanId);
        const castlePower = this.calcCastlePower(castle);
        
        // 謀反を起こされた後の、今の大名家の戦力予想
        const oldClanFuturePower = oldClanPower - castlePower;

        // 今の殿様との相性の差（数字が小さいほど相性が良い）
        const oldAffinityDiff = GameSystem.calcAffinityDiff(castellan.affinity, oldDaimyo.affinity);

        // 世界中の大名家を順番に調べます
        for (const clan of this.game.clans) {
            if (clan.id === 0 || clan.id === oldClanId) continue; // 空き地や自分の家は無視
            
            // 敵対しているかチェック
            const rel = this.game.getRelation(oldClanId, clan.id);
            if (!rel || rel.status !== '敵対') continue;

            // 敵の大名（殿様）を探す
            const enemyDaimyo = this.game.bushos.find(b => b.clan === clan.id && b.isDaimyo);
            if (!enemyDaimyo) continue;

            // もし寝返ったら、敵対大名の戦力はどれくらいになるか？
            let enemyFuturePower = this.calcClanPower(clan.id) + castlePower;
            
            // 相性によるボーナス（ほんの少しだけ戦力にゲタを履かせます！）
            const enemyAffinityDiff = GameSystem.calcAffinityDiff(castellan.affinity, enemyDaimyo.affinity);
            let affinityBonus = 0;
            // 今の殿様より相性が良い場合だけ、その差分を戦力に足してあげます
            if (enemyAffinityDiff < oldAffinityDiff) {
                affinityBonus = oldAffinityDiff - enemyAffinityDiff; 
            }

            // 「寝返った後の敵対大名の戦力 ＞ 寝返られた後の元大名戦力」になるなら候補に入れます
            if ((enemyFuturePower + affinityBonus) > oldClanFuturePower) {
                const score = enemyFuturePower + affinityBonus;
                // 一番条件の良い大名家を記憶します
                if (score > bestScore) {
                    bestScore = score;
                    targetClanId = clan.id;
                    targetDaimyo = enemyDaimyo;
                }
            }
        }
        // --- ★ここまで ---

        let isDefection = false; // 寝返りかどうかを覚える旗
        let newClanId;
        let newClanName;

        // 良い寝返り先が見つかった場合
        if (targetClanId) {
            isDefection = true;
            newClanId = targetClanId;
            const targetClan = this.game.clans.find(c => c.id === targetClanId);
            newClanName = targetClan ? targetClan.name : "敵対大名";

            castellan.clan = newClanId;
            castellan.loyalty = 100; // 寝返った直後は忠誠MAX！
            castle.ownerClan = newClanId;
            // 寝返り先の大名とは最初から外交関係があるので、新しく作る必要はありません
            
        } else {
            // 見つからなかった場合は、今まで通りの「独立」をします
            newClanId = Math.max(...this.game.clans.map(c => c.id)) + 1;
            const newColor = '#' + Math.floor(Math.random()*16777215).toString(16).padStart(6, '0');
            const familyName = castellan.familyName || castellan.name; 
            newClanName = `${familyName}家`;

            const newClan = new Clan({
                id: newClanId, name: newClanName, color: newColor, leaderId: castellan.id,
                rice: I.InitialRice || 1000, gold: I.InitialGold || 1000
            });
            this.game.clans.push(newClan);

            castellan.isDaimyo = true;
            castellan.isCastellan = true;
            castellan.clan = newClanId;
            castellan.loyalty = 100;
            castle.ownerClan = newClanId;

            // 新大名と旧大名を敵対関係にする
            const oldClan = this.game.clans.find(c => c.id === oldClanId);
            if (oldClan) oldClan.diplomacyValue[newClanId] = { status: '敵対', sentiment: 0 };
            newClan.diplomacyValue[oldClanId] = { status: '敵対', sentiment: 0 };
        }

        // ▼部下たちの去就（ここは寝返りでも独立でも同じように動きます）
        let captiveMsgs = this.resolveSubordinates(castle, castellan, oldDaimyo, newClanId, oldClanId);
        this.resolveFactionWideRebellion(castellan, oldClanId, newClanId, oldDaimyo);
        this.resolveDistantFactionMembers(castellan, oldClanId, newClanId, oldDaimyo);

        this.game.updateCastleLord(castle);

        const oldClanName = this.game.clans.find(c => c.id === oldClanId)?.name || "不明";
        let msg = "";
        
        // メッセージを出し分けます
        if (isDefection) {
            msg = `【寝返り】${oldClanName}の${castellan.name}が${castle.name}ごと、敵対する${newClanName}へ寝返りました！`;
        } else {
            msg = `【謀反】${oldClanName}の${castellan.name}が${castle.name}にて独立しました！`;
        }
        
        this.game.ui.log(msg);
        if (captiveMsgs && captiveMsgs.length > 0) msg += '\n\n' + captiveMsgs.join('\n');
        await this.game.ui.showDialogAsync(msg, false, 0);
    }

    calculateLoyaltyScores(busho, newDaimyo, oldDaimyo) {
        const affNew = GameSystem.calcAffinityDiff(busho.affinity, newDaimyo.affinity);
        const affOld = GameSystem.calcAffinityDiff(busho.affinity, oldDaimyo.affinity);
        let joinScore = (100 - affNew) * 2.0 + (busho.ambition * 0.5);
        let stayScore = (100 - affOld) * 2.0 + (busho.loyalty * 0.5);

        joinScore += this.calcDaimyoPowerBonus(newDaimyo);
        stayScore += this.calcDaimyoPowerBonus(oldDaimyo);

        if (busho.loyalty < 90) joinScore += (90 - busho.loyalty);
        joinScore += (50 - busho.duty) * 0.4;

        if (busho.factionId !== 0) {
            if (busho.factionId === newDaimyo.factionId) joinScore += 50;
            if (busho.factionId === oldDaimyo.factionId) stayScore += 50;
        }
        return { joinScore, stayScore };
    }

    resolveSubordinates(castle, newDaimyo, oldDaimyo, newClanId, oldClanId) {
        const subordinates = this.game.getCastleBushos(castle.id).filter(b => b.id !== newDaimyo.id && b.status !== 'ronin' && b.clan === oldClanId);
        const captives = [], joiners = [];
        const escapeCastles = this.game.castles.filter(c => c.ownerClan === oldClanId && c.id !== castle.id);

        subordinates.forEach(busho => {
            const { joinScore, stayScore } = this.calculateLoyaltyScores(busho, newDaimyo, oldDaimyo);
            if (joinScore > stayScore) {
                const oldLoy = busho.loyalty;
                busho.clan = newClanId;
                busho.loyalty = this.calcNewLoyalty(oldLoy);
                joiners.push(busho);
            } else {
                if (escapeCastles.length > 0 && busho.duty >= 30) {
                    if ((busho.strength + busho.intelligence) * (Math.random() + 0.5) > (newDaimyo.leadership + newDaimyo.intelligence) * 0.8) {
                        const target = escapeCastles[Math.floor(Math.random() * escapeCastles.length)];
                        castle.samuraiIds = castle.samuraiIds.filter(id => id !== busho.id);
                        target.samuraiIds.push(busho.id);
                        busho.castleId = target.id; busho.isCastellan = false;
                        this.game.updateCastleLord(target);
                    } else {
                        castle.samuraiIds = castle.samuraiIds.filter(id => id !== busho.id);
                        busho.castleId = 0; captives.push(busho);
                    }
                } else {
                    const oldLoy = busho.loyalty;
                    busho.clan = newClanId;
                    busho.loyalty = Math.min(40, this.calcNewLoyalty(oldLoy) - 50); // 消極的合流は低めに設定
                    joiners.push(busho);
                }
            }
        });
        if (joiners.length > 0) this.game.ui.log(`  -> ${castle.name}にて${joiners.length}名が追随しました。`);
        return captives.length > 0 ? this.handleCaptives(captives, oldClanId, newClanId, newDaimyo) : [];
    }

    resolveFactionWideRebellion(leader, oldClanId, newClanId, oldDaimyo) {
        const otherCastles = this.game.castles.filter(c => c.ownerClan === oldClanId && c.castellanId !== 0 && c.castellanId !== leader.id);
        otherCastles.forEach(castle => {
            const busho = this.game.getBusho(castle.castellanId);
            if (busho && busho.factionId !== 0 && busho.factionId === leader.factionId) {
                const { joinScore, stayScore } = this.calculateLoyaltyScores(busho, leader, oldDaimyo);
                if (joinScore > stayScore) {
                    this.game.ui.log(`  -> 呼応！${castle.name}城主の${busho.name}が${leader.name}に与しました！`);
                    const oldLoy = busho.loyalty;
                    castle.ownerClan = newClanId;
                    busho.clan = newClanId;
                    busho.loyalty = this.calcNewLoyalty(oldLoy);
                    this.resolveSubordinates(castle, leader, oldDaimyo, newClanId, oldClanId);
                    this.game.updateCastleLord(castle);
                }
            }
        });
    }

    resolveDistantFactionMembers(newDaimyo, oldClanId, newClanId, oldDaimyo) {
        if (newDaimyo.factionId === 0) return; 
        const potential = this.game.bushos.filter(b => b.clan === oldClanId && !b.isCastellan && b.status === 'active' && b.factionId === newDaimyo.factionId);
        const mainCastle = this.game.castles.find(c => c.castellanId === newDaimyo.id);
        if (!mainCastle) return;

        potential.forEach(busho => {
            const { joinScore, stayScore } = this.calculateLoyaltyScores(busho, newDaimyo, oldDaimyo);
            if (joinScore > stayScore && Math.random() * 300 < joinScore) {
                const oldCastle = this.game.castles.find(c => c.id === busho.castleId);
                if (oldCastle) {
                    oldCastle.samuraiIds = oldCastle.samuraiIds.filter(id => id !== busho.id);
                    this.game.updateCastleLord(oldCastle);
                }
                busho.clan = newClanId;
                busho.castleId = mainCastle.id;
                busho.loyalty = 100; // 駆けつけた場合は特別に100
                mainCastle.samuraiIds.push(busho.id);
                this.game.ui.log(`  -> ${busho.name}が城を脱出し、${newDaimyo.name}の元へ駆けつけました！`);
            }
        });
    }

    handleCaptives(captives, oldClanId, newClanId, newDaimyo) {
        const returnCastles = this.game.castles.filter(c => c.ownerClan === oldClanId);
        let alertMsgs = [];
        captives.forEach(p => {
            if (oldClanId === this.game.playerClanId) {
                if (GameSystem.calcAffinityDiff(p.affinity, newDaimyo.affinity) > 60) {
                    p.status = 'dead'; p.clan = 0;
                    alertMsgs.push(`処断：${p.name} は処断されました。`);
                } else {
                    if (returnCastles.length > 0) {
                        const target = returnCastles[Math.floor(Math.random() * returnCastles.length)];
                        p.clan = oldClanId; p.castleId = target.id; target.samuraiIds.push(p.id);
                        this.game.updateCastleLord(target);
                    } else { p.status = 'ronin'; p.clan = 0; }
                    alertMsgs.push(`解放：${p.name} は解放されました。`);
                }
            } else if (newClanId === this.game.playerClanId) {
                this.game.ui.showPrisonerModal(captives);
            } else {
                if (Math.random() < 0.3) { p.status = 'dead'; p.clan = 0; }
                else if (returnCastles.length > 0) {
                    const target = returnCastles[Math.floor(Math.random() * returnCastles.length)];
                    p.clan = oldClanId; p.castleId = target.id; target.samuraiIds.push(p.id);
                    this.game.updateCastleLord(target);
                }
            }
        });
        return alertMsgs;
    }
    
    /**
     * 大名家の総戦力を計算する道具
     */
    calcClanPower(clanId) {
        let pop = 0, sol = 0, koku = 0, gold = 0, rice = 0;
        const clanCastles = this.game.castles.filter(c => c.ownerClan === clanId);
        clanCastles.forEach(c => { 
            pop += c.population; sol += c.soldiers; koku += c.kokudaka; gold += c.gold; rice += c.rice; 
        });
        return Math.floor(pop / 2000) + Math.floor(sol / 20) + Math.floor(koku / 20) + Math.floor(gold / 50) + Math.floor(rice / 100);
    }

    /**
     * 城単体の戦力を計算する道具
     */
    calcCastlePower(castle) {
        return Math.floor(castle.population / 2000) + Math.floor(castle.soldiers / 20) + Math.floor(castle.kokudaka / 20) + Math.floor(castle.gold / 50) + Math.floor(castle.rice / 100);
    }
    
}