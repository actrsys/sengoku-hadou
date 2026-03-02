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

            if (daimyo.factionId !== 0 && castellan.factionId === daimyo.factionId) {
                continue; 
            }

            const threshold = thresholdBase + ((50 - castellan.duty) / dutyDiv) + ((castellan.ambition - 50) / ambDiv);

            if (castellan.loyalty <= threshold) {
                await this.calculateAndExecute(castle, castellan, daimyo, threshold);
            }
        }
    }

    async calculateAndExecute(castle, castellan, daimyo, threshold) {
        const I = window.WarParams.Independence || {};
        const probLoyalty = I.ProbLoyaltyFactor || 2;
        const probAffinity = I.ProbAffinityFactor || 0.5;

        const affinityDiff = GameSystem.calcAffinityDiff(castellan.affinity, daimyo.affinity);
        let prob = ((threshold - castellan.loyalty) * probLoyalty) + (affinityDiff * probAffinity);
        
        if (prob <= 0) return;
        if (Math.random() * 1000 < prob) {
            await this.executeRebellion(castle, castellan, daimyo);
        }
    }

    async executeRebellion(castle, castellan, oldDaimyo) {
        const oldClanId = castle.ownerClan;
        const I = window.WarParams.Independence || {};
        
        const newClanId = Math.max(...this.game.clans.map(c => c.id)) + 1;
        const newColor = '#' + Math.floor(Math.random()*16777215).toString(16).padStart(6, '0');
        const familyName = castellan.familyName || castellan.name; 
        const newClanName = `${familyName}家`;

        const newClan = new Clan({
            id: newClanId,
            name: newClanName,
            color: newColor,
            leaderId: castellan.id,
            rice: I.InitialRice || 1000,
            gold: I.InitialGold || 1000
        });
        this.game.clans.push(newClan);

        castellan.isDaimyo = true;
        castellan.isCastellan = true;
        castellan.clan = newClanId;
        castellan.loyalty = 100;
        castle.ownerClan = newClanId;

        const oldClan = this.game.clans.find(c => c.id === oldClanId);
        if (oldClan) oldClan.diplomacyValue[newClanId] = { status: '敵対', sentiment: 0 };
        newClan.diplomacyValue[oldClanId] = { status: '敵対', sentiment: 0 };

        // 1. その城にいる部下の判定
        let captiveMsgs = this.resolveSubordinates(castle, castellan, oldDaimyo, newClanId, oldClanId);

        // 2. 同派閥の他城主が「呼応」
        this.resolveFactionWideRebellion(castellan, oldClanId, newClanId, oldDaimyo);

        // 3. 遠方の武将が「駆けつけ」
        this.resolveDistantFactionMembers(castellan, oldClanId, newClanId, oldDaimyo);

        this.game.updateCastleLord(castle);

        const oldClanName = oldClan?.name || "不明";
        let msg = `【謀反】${oldClanName}の${castellan.name}が${castle.name}にて独立しました！`;
        this.game.ui.log(msg);
        if (captiveMsgs && captiveMsgs.length > 0) msg += '\n\n' + captiveMsgs.join('\n');
        await this.game.ui.showDialogAsync(msg, false, 0);
    }

    /**
     * 去就判定の共通計算ロジック（ここが一番大事！）
     */
    calculateLoyaltyScores(busho, newDaimyo, oldDaimyo) {
        const affNew = GameSystem.calcAffinityDiff(busho.affinity, newDaimyo.affinity);
        const affOld = GameSystem.calcAffinityDiff(busho.affinity, oldDaimyo.affinity);
        
        // ★相性重視 (重みを 2.0 にアップ)
        let joinScore = (100 - affNew) * 2.0 + (busho.ambition * 0.5);
        let stayScore = (100 - affOld) * 2.0 + (busho.loyalty * 0.5);

        // ★忠誠度90未満の不満
        if (busho.loyalty < 90) joinScore += (90 - busho.loyalty);

        // ★義理を線形に (重みを 0.4 にダウン。100でも最大20点の影響)
        joinScore += (50 - busho.duty) * 0.4;

        // ★派閥ボーナス
        const bonusFaction = 50;
        if (busho.factionId !== 0) {
            if (busho.factionId === newDaimyo.factionId) joinScore += bonusFaction;
            if (busho.factionId === oldDaimyo.factionId) stayScore += bonusFaction;
        }

        return { joinScore, stayScore };
    }

    resolveSubordinates(castle, newDaimyo, oldDaimyo, newClanId, oldClanId) {
        const subordinates = this.game.getCastleBushos(castle.id).filter(b => b.id !== newDaimyo.id && b.status !== 'ronin' && b.clan === oldClanId);
        const captives = [], escapees = [], joiners = [];
        const escapeCastles = this.game.castles.filter(c => c.ownerClan === oldClanId && c.id !== castle.id);

        subordinates.forEach(busho => {
            const { joinScore, stayScore } = this.calculateLoyaltyScores(busho, newDaimyo, oldDaimyo);

            if (joinScore > stayScore) {
                busho.clan = newClanId;
                busho.loyalty = 80;
                joiners.push(busho);
            } else {
                if (escapeCastles.length > 0 && busho.duty >= 30) {
                    if ((busho.strength + busho.intelligence) * (Math.random() + 0.5) > (newDaimyo.leadership + newDaimyo.intelligence) * 0.8) {
                        const target = escapeCastles[Math.floor(Math.random() * escapeCastles.length)];
                        castle.samuraiIds = castle.samuraiIds.filter(id => id !== busho.id);
                        target.samuraiIds.push(busho.id);
                        busho.castleId = target.id;
                        busho.isCastellan = false;
                        escapees.push(busho);
                        this.game.updateCastleLord(target);
                    } else {
                        castle.samuraiIds = castle.samuraiIds.filter(id => id !== busho.id);
                        busho.castleId = 0;
                        captives.push(busho);
                    }
                } else {
                    busho.clan = newClanId;
                    busho.loyalty = 30;
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
                    this.game.ui.log(`  -> 呼応！${castle.name}城主の${busho.name}が${leader.name}に組みしました！`);
                    castle.ownerClan = newClanId;
                    busho.clan = newClanId;
                    busho.loyalty = 90;
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
                busho.loyalty = 100; 
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
}