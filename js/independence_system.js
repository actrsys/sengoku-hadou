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
            const clan = this.game.clans.find(c => c.id === castle.ownerClan);
            const daimyo = this.game.bushos.find(b => b.clan === castle.ownerClan && b.isDaimyo);
            
            if (!castellan || !clan || !daimyo) continue;

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
        const captiveMsgs = this.resolveSubordinates(castle, castellan, oldDaimyo, newClanId, oldClanId);

        // 2. ★追加：他の城から同派閥のメンバーが駆けつける
        this.resolveDistantFactionMembers(castellan, oldClanId, newClanId, castle);

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
     * 部下の去就判定 (修正版)
     */
     resolveSubordinates(castle, newDaimyo, oldDaimyo, newClanId, oldClanId) {
        const subordinates = this.game.getCastleBushos(castle.id).filter(b => b.id !== newDaimyo.id && b.status !== 'ronin');
        const captives = [];
        const escapees = [];
        const joiners = [];
        
        const I = window.WarParams.Independence || {};
        // 派閥ボーナスを強化 (30 -> 50)
        const bonusFactionPriority = 50; 
        const escapeDuty = I.EscapeDutyThreshold || 30;

        const escapeCastles = this.game.castles.filter(c => c.ownerClan === oldClanId && c.id !== castle.id);
        const hasEscapeRoute = escapeCastles.length > 0;

        subordinates.forEach(busho => {
            const affNew = GameSystem.calcAffinityDiff(busho.affinity, newDaimyo.affinity);
            const affOld = GameSystem.calcAffinityDiff(busho.affinity, oldDaimyo.affinity);
            
            // ★相性の重みを1.5倍にアップ
            let joinScore = (100 - affNew) * 1.5 + (busho.ambition * 0.5);
            let stayScore = (100 - affOld) * 1.5 + (busho.loyalty * 0.5);

            // ★忠誠度が90未満なら、低いほど合流しやすくなる（不満ボーナス）
            if (busho.loyalty < 90) {
                joinScore += (90 - busho.loyalty) * 2;
            }

            // ★義理の判定を50基準に
            const dutyFactor = busho.duty - 50;
            if (dutyFactor > 0) stayScore += dutyFactor; // 50より高ければ残りたい
            else joinScore += Math.abs(dutyFactor);      // 50より低ければ裏切りたい

            // ★派閥補正（優先度アップ）
            const myFaction = busho.getFactionName ? busho.getFactionName() : "";
            if (myFaction && myFaction === (newDaimyo.getFactionName ? newDaimyo.getFactionName() : "")) joinScore += bonusFactionPriority;
            if (myFaction && myFaction === (oldDaimyo.getFactionName ? oldDaimyo.getFactionName() : "")) stayScore += bonusFactionPriority;

            if (joinScore > stayScore) {
                busho.clan = newClanId;
                busho.loyalty = 80;
                joiners.push(busho);
            } else {
                if (hasEscapeRoute && busho.duty >= escapeDuty) {
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

        if (joiners.length > 0) this.game.ui.log(`  -> ${joiners.length}名が${newDaimyo.name}に追随しました。`);
        if (escapees.length > 0) this.game.ui.log(`  -> ${escapees.length}名が脱出し、帰還しました。`);
        
        let captiveMsgs = [];
        if (captives.length > 0) {
            this.game.ui.log(`  -> ${captives.length}名が脱出に失敗し、捕らえられました。`);
            captiveMsgs = this.handleCaptives(captives, oldClanId, newClanId, newDaimyo);
        }
        return captiveMsgs;
     }

    /**
     * ★新機能：他の城にいる同派閥のメンバーが駆けつける処理
     */
    resolveDistantFactionMembers(newDaimyo, oldClanId, newClanId, targetCastle) {
        // 大名が派閥に入っていなければ発生しない
        if (newDaimyo.factionId === 0) return; 

        // 全武将の中から、「前のクランにいて」「別の城にいて」「同じ派閥」の人を探す
        const potentialDefectors = this.game.bushos.filter(b => 
            b.clan === oldClanId && 
            b.castleId !== targetCastle.id && 
            b.status === 'active' &&
            b.factionId === newDaimyo.factionId
        );

        const joiners = [];
        potentialDefectors.forEach(busho => {
            // 駆けつけるかどうかの判定（相性が良くて、今のクランに不満があれば来やすい）
            const affNew = GameSystem.calcAffinityDiff(busho.affinity, newDaimyo.affinity);
            let prob = (100 - affNew) + (busho.ambition * 0.5);
            if (busho.loyalty < 90) prob += (90 - busho.loyalty);

            // 確率判定 (少し厳しめ)
            if (Math.random() * 250 < prob) {
                // 元の城から削除
                const oldCastle = this.game.castles.find(c => c.id === busho.castleId);
                if (oldCastle) {
                    oldCastle.samuraiIds = oldCastle.samuraiIds.filter(id => id !== busho.id);
                    this.game.updateCastleLord(oldCastle);
                }

                // 新しい城へ移動
                busho.clan = newClanId;
                busho.castleId = targetCastle.id;
                busho.loyalty = 100; // 志を共にして駆けつけたので忠誠MAX
                targetCastle.samuraiIds.push(busho.id);
                joiners.push(busho);
            }
        });

        if (joiners.length > 0) {
            const names = joiners.map(j => j.name).join('、');
            this.game.ui.log(`  -> 遠方の城から同派閥の${names}らが駆けつけました！`);
        }
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
                    alertMsgs.push(`悲報：捕らえられた ${p.name} は処断されました……`);
                } else {
                    const returnedCastleName = returnToMaster(p);
                    if (returnedCastleName) {
                        alertMsgs.push(`報告：${p.name} は解放され帰還しました！`);
                    } else {
                        alertMsgs.push(`報告：${p.name} は解放され在野に下りました。`);
                    }
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