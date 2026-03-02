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

            // 大名と同じ派閥なら独立しない
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
        const bonusMismatch = I.FactionBonusMismatch || 20;
        const bonusMatch = I.FactionBonusMatch || -10;
        const probLoyalty = I.ProbLoyaltyFactor || 2;
        const probAffinity = I.ProbAffinityFactor || 0.5;

        const affinityDiff = GameSystem.calcAffinityDiff(castellan.affinity, daimyo.affinity);
        
        let factionBonus = 0;
        const myFaction = castellan.getFactionName ? castellan.getFactionName() : "";
        const lordFaction = daimyo.getFactionName ? daimyo.getFactionName() : "";
        
        if (myFaction && lordFaction) {
            if (myFaction !== lordFaction) factionBonus = bonusMismatch;
            else factionBonus = bonusMatch;
        }

        let prob = ((threshold - castellan.loyalty) * probLoyalty) + (affinityDiff * probAffinity) + factionBonus;
        
        if (prob <= 0) return;

        const roll = Math.random() * 1000;
        if (roll < prob) {
            await this.executeRebellion(castle, castellan, daimyo);
        }
    }

    async executeRebellion(castle, castellan, oldDaimyo) {
        const oldClanId = castle.ownerClan;
        const I = window.WarParams.Independence || {};
        const initGold = I.InitialGold || 1000;
        const initRice = I.InitialRice || 1000;
        
        const newClanId = Math.max(...this.game.clans.map(c => c.id)) + 1;
        const newColor = '#' + Math.floor(Math.random()*16777215).toString(16).padStart(6, '0');
        const familyName = castellan.familyName || castellan.name; 
        const newClanName = `${familyName}家`;

        const newClan = new Clan({
            id: newClanId,
            name: newClanName,
            color: newColor,
            leaderId: castellan.id,
            rice: initRice,
            gold: initGold
        });
        this.game.clans.push(newClan);

        castellan.isDaimyo = true;
        castellan.isCastellan = true;
        castellan.clan = newClanId;
        castellan.loyalty = 100;

        castle.ownerClan = newClanId;

        const oldClan = this.game.clans.find(c => c.id === oldClanId);
        if (oldClan) {
            oldClan.diplomacyValue[newClanId] = { status: '敵対', sentiment: 0 };
        }
        newClan.diplomacyValue[oldClanId] = { status: '敵対', sentiment: 0 };

        // 1. その城にいる部下の去就判定
        let captiveMsgs = this.resolveSubordinates(castle, castellan, oldDaimyo, newClanId, oldClanId);

        // 2. ★新機能：同じ派閥の他の「城主」も呼応して独立する
        this.resolveFactionWideRebellion(castellan, oldClanId, newClanId, oldDaimyo);

        // 3. 他の城にいる「一般武将」が駆けつける
        this.resolveDistantFactionMembers(castellan, oldClanId, newClanId);

        this.game.updateCastleLord(castle);

        const oldClanName = oldClan?.name || "不明";
        let msg = `【謀反】${oldClanName}の${castellan.name}が${castle.name}にて独立しました！`;
        this.game.ui.log(msg);
        
        if (captiveMsgs && captiveMsgs.length > 0) {
            msg += '\n\n' + captiveMsgs.join('\n');
        }
        await this.game.ui.showDialogAsync(msg, false, 0);
    }

    /**
     * ★新機能：同派閥の他城主が呼応する処理
     */
    resolveFactionWideRebellion(leader, oldClanId, newClanId, oldDaimyo) {
        if (leader.factionId === 0) return;

        // 同じクランにいて、かつ城主である同派閥のメンバーを探す
        const otherCastles = this.game.castles.filter(c => 
            c.ownerClan === oldClanId && 
            c.castellanId !== 0 && 
            c.castellanId !== leader.id
        );

        otherCastles.forEach(castle => {
            const busho = this.game.getBusho(castle.castellanId);
            if (busho && busho.factionId === leader.factionId) {
                // 呼応判定
                const affNew = GameSystem.calcAffinityDiff(busho.affinity, leader.affinity);
                const affOld = GameSystem.calcAffinityDiff(busho.affinity, oldDaimyo.affinity);

                let joinScore = (100 - affNew) * 1.5 + (busho.ambition * 0.5) + (50 - busho.duty);
                let stayScore = (100 - affOld) * 1.5 + (busho.loyalty * 0.5);
                if (busho.loyalty < 90) joinScore += (90 - busho.loyalty);

                if (joinScore > stayScore) {
                    // 呼応成功！お城ごと寝返る
                    this.game.ui.log(`  -> 呼応！${castle.name}城主の${busho.name}が${leader.name}に組みしました！`);
                    
                    castle.ownerClan = newClanId;
                    busho.clan = newClanId;
                    busho.loyalty = 90; // 志を共にしたので高め
                    
                    // その城にいた部下たちの去就も判定する
                    this.resolveSubordinates(castle, leader, oldDaimyo, newClanId, oldClanId);
                    this.game.updateCastleLord(castle);
                }
            }
        });
    }

    /**
     * 部下の去就判定 (線形・優先度調整版)
     */
     resolveSubordinates(castle, newDaimyo, oldDaimyo, newClanId, oldClanId) {
        const subordinates = this.game.getCastleBushos(castle.id).filter(b => b.id !== newDaimyo.id && b.status !== 'ronin' && b.clan === oldClanId);
        const captives = [];
        const escapees = [];
        const joiners = [];
        
        const bonusFactionPriority = 50; 
        const escapeCastles = this.game.castles.filter(c => c.ownerClan === oldClanId && c.id !== castle.id);
        const hasEscapeRoute = escapeCastles.length > 0;

        subordinates.forEach(busho => {
            const affNew = GameSystem.calcAffinityDiff(busho.affinity, newDaimyo.affinity);
            const affOld = GameSystem.calcAffinityDiff(busho.affinity, oldDaimyo.affinity);
            
            let joinScore = (100 - affNew) * 1.5 + (busho.ambition * 0.5);
            let stayScore = (100 - affOld) * 1.5 + (busho.loyalty * 0.5);

            if (busho.loyalty < 90) joinScore += (90 - busho.loyalty);
            joinScore += (50 - busho.duty);

            const myFaction = busho.getFactionName ? busho.getFactionName() : "";
            if (myFaction && myFaction === (newDaimyo.getFactionName ? newDaimyo.getFactionName() : "")) joinScore += bonusFactionPriority;
            if (myFaction && myFaction === (oldDaimyo.getFactionName ? oldDaimyo.getFactionName() : "")) stayScore += bonusFactionPriority;

            if (joinScore > stayScore) {
                busho.clan = newClanId;
                busho.loyalty = 80;
                joiners.push(busho);
            } else {
                if (hasEscapeRoute && busho.duty >= 30) {
                    const escapePower = busho.strength + busho.intelligence;
                    const blockPower = newDaimyo.leadership + newDaimyo.intelligence;
                    if ((escapePower * (Math.random() + 0.5)) > (blockPower * 0.8)) {
                        const targetCastle = escapeCastles[Math.floor(Math.random() * escapeCastles.length)];
                        castle.samuraiIds = castle.samuraiIds.filter(id => id !== busho.id);
                        targetCastle.samuraiIds.push(busho.id);
                        busho.castleId = targetCastle.id;
                        busho.isCastellan = false;
                        escapees.push(busho);
                        this.game.updateCastleLord(targetCastle);
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
        
        let captiveMsgs = [];
        if (captives.length > 0) {
            captiveMsgs = this.handleCaptives(captives, oldClanId, newClanId, newDaimyo);
        }
        return captiveMsgs;
     }

    /**
     * 遠方の一般武将が駆けつける処理
     */
    resolveDistantFactionMembers(newDaimyo, oldClanId, newClanId) {
        if (newDaimyo.factionId === 0) return; 

        // 城主ではない同派閥メンバーを探す
        const potentialDefectors = this.game.bushos.filter(b => 
            b.clan === oldClanId && 
            !b.isCastellan &&
            b.status === 'active' &&
            b.factionId === newDaimyo.factionId
        );

        const mainCastle = this.game.castles.find(c => c.castellanId === newDaimyo.id);
        if (!mainCastle) return;

        potentialDefectors.forEach(busho => {
            const affNew = GameSystem.calcAffinityDiff(busho.affinity, newDaimyo.affinity);
            let prob = (100 - affNew) + (busho.ambition * 0.5);
            if (busho.loyalty < 90) prob += (90 - busho.loyalty);

            if (Math.random() * 300 < prob) {
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
        const I = window.WarParams.Independence || {};
        const hateThreshold = I.ExecHateThreshold || 60;
        const ambitionThreshold = I.ExecAmbitionThreshold || 80;
        const returnCastles = this.game.castles.filter(c => c.ownerClan === oldClanId);
        let alertMsgs = [];
        
        const returnToMaster = (busho) => {
            if (returnCastles.length > 0) {
                const target = returnCastles[Math.floor(Math.random() * returnCastles.length)];
                busho.clan = oldClanId;
                busho.castleId = target.id;
                busho.status = 'active';
                target.samuraiIds.push(busho.id);
                this.game.updateCastleLord(target);
                return target.name;
            } else {
                busho.status = 'ronin';
                busho.clan = 0;
                return null;
            }
        };

        if (oldClanId === this.game.playerClanId) {
            captives.forEach(p => {
                const hate = GameSystem.calcAffinityDiff(p.affinity, newDaimyo.affinity);
                if (hate > hateThreshold || newDaimyo.ambition > ambitionThreshold) {
                    p.status = 'dead';
                    p.clan = 0;
                    alertMsgs.push(`処断：捕らえられた ${p.name} は新勢力により処断されました。`);
                } else {
                    returnToMaster(p);
                    alertMsgs.push(`解放：${p.name} は解放されました。`);
                }
            });
        } else if (newClanId === this.game.playerClanId) {
            this.game.ui.showPrisonerModal(captives);
        } else {
            captives.forEach(p => {
                if (Math.random() < 0.3) {
                    p.status = 'dead';
                    p.clan = 0;
                } else {
                    returnToMaster(p);
                }
            });
        }
        return alertMsgs;
    }
}