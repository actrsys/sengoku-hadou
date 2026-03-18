/**
 * affiliation_system.js
 * 武将の「所属変更（お引越し）」をすべて一元管理するお引越しセンターです！
 * 城主や軍師の任命などの人事もここで行います。
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
        busho.isGunshi = false; // ★ここを書き足します！軍師のバッジを外します

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
        // ★ここから追加：最強の関所！自動で作られた頭領は浪人になれず、ここで消滅します！
        if (busho.isAutoLeader) {
            busho.clan = 0;
            busho.status = 'dead'; // 浪人ではなく、死亡（消滅）扱いにします
            busho.isCastellan = false;
            busho.isDaimyo = false;
            busho.isGunshi = false; // ★念のためここにも書き足します！
            busho.belongKunishuId = 0; // 諸勢力からも外します
            this.leaveCastle(busho); // お城から綺麗にいなくなります
            return; // これ以上下の「浪人になる処理」には進ませません！
        }
        // ★追加ここまで！

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
        busho.isGunshi = false; // ★ここを書き足します！軍師のバッジを外します

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
    
    /**
     * ========================================================
     * ★ここから下は、新しく設立された「人事部」の魔法です！★
     * ========================================================
     */

    /**
     * ① AI大名のお引越し（特殊な移動処理）
     */
    relocateDaimyoAI(castle, castellan) {
        if (castellan.isDaimyo && castellan.personality !== 'aggressive') {
            const myClanCastles = [];
            const visited = new Set();
            const queue = [castle];
            visited.add(castle.id);

            while (queue.length > 0) {
                const current = queue.shift();
                myClanCastles.push(current);

                const neighbors = this.game.castles.filter(c => 
                    c.ownerClan === castle.ownerClan && 
                    GameSystem.isAdjacent(current, c) &&
                    !visited.has(c.id)
                );

                for (const n of neighbors) {
                    visited.add(n.id);
                    queue.push(n);
                }
            }
            
            if (myClanCastles.length > 1) {
                myClanCastles.sort((a, b) => b.maxDefense - a.maxDefense);
                const bestCastle = myClanCastles[0];
                
                if (bestCastle.id !== castle.id) {
                    const totalGold = castle.gold + bestCastle.gold;
                    const totalRice = castle.rice + bestCastle.rice;
                    const totalSoldiers = castle.soldiers + bestCastle.soldiers;
                    const totalHorses = (castle.horses || 0) + (bestCastle.horses || 0);
                    const totalGuns = (castle.guns || 0) + (bestCastle.guns || 0);

                    const avgTraining = Math.floor(((castle.training * castle.soldiers) + (bestCastle.training * bestCastle.soldiers)) / Math.max(1, totalSoldiers));
                    const avgMorale = Math.floor(((castle.morale * castle.soldiers) + (bestCastle.morale * bestCastle.soldiers)) / Math.max(1, totalSoldiers));

                    bestCastle.gold = Math.min(99999, Math.ceil(totalGold * 0.6));
                    castle.gold = totalGold - bestCastle.gold;
                    
                    bestCastle.rice = Math.min(99999, Math.ceil(totalRice * 0.6));
                    castle.rice = totalRice - bestCastle.rice;
                    
                    bestCastle.soldiers = Math.min(99999, Math.ceil(totalSoldiers * 0.6));
                    castle.soldiers = totalSoldiers - bestCastle.soldiers;
                    
                    bestCastle.horses = Math.min(99999, Math.ceil(totalHorses * 0.6));
                    castle.horses = totalHorses - bestCastle.horses;
                    
                    bestCastle.guns = Math.min(99999, Math.ceil(totalGuns * 0.6));
                    castle.guns = totalGuns - bestCastle.guns;

                    castle.training = avgTraining;
                    bestCastle.training = avgTraining;
                    castle.morale = avgMorale;
                    bestCastle.morale = avgMorale;

                    const castleBushos = this.game.getCastleBushos(castle.id).filter(b => b.status !== 'ronin' && b.id !== castellan.id);
                    const keepCount = Math.max(3, Math.ceil(castleBushos.length * 0.4));
                    
                    castleBushos.sort((a, b) => {
                        const aFactionScore = (a.factionId === castellan.factionId && a.factionId !== 0) ? -200 : 0;
                        const bFactionScore = (b.factionId === castellan.factionId && b.factionId !== 0) ? -200 : 0;
                        const aScore = a.leadership + a.strength + aFactionScore;
                        const bScore = b.leadership + b.strength + bFactionScore;
                        return bScore - aScore; 
                    });

                    const movers = castleBushos.slice(keepCount);
                    movers.forEach(mover => {
                        if (this.game.factionSystem && this.game.factionSystem.handleMove) {
                            this.game.factionSystem.handleMove(mover, castle.id, bestCastle.id);
                        }
                        this.moveCastle(mover, bestCastle.id);
                        mover.isActionDone = true; 
                    });

                    if (this.game.factionSystem && this.game.factionSystem.handleMove) {
                        this.game.factionSystem.handleMove(castellan, castle.id, bestCastle.id);
                    }
                    this.moveCastle(castellan, bestCastle.id);
                    castellan.isActionDone = true;
                    
                    return true; // 引越し完了の合図
                }
            }
        }
        return false; // 引越ししなかった合図
    }

    /**
     * ② AI大名の軍師任命
     */
    appointAIGunshi(castle, castellan) {
        if (castellan.isDaimyo && Number(castle.ownerClan) !== Number(this.game.playerClanId)) {
            const currentGunshi = this.game.getClanGunshi(castle.ownerClan);
            if (!currentGunshi) {
                const daimyoFactionId = castellan.factionId;
                const myClanBushos = this.game.bushos.filter(b => b.clan === castle.ownerClan && b.status === 'active');
                
                let candidates = myClanBushos.filter(b => 
                    !b.isDaimyo && 
                    !b.isCastellan && 
                    b.factionId === daimyoFactionId
                );

                if (candidates.length > 0) {
                    candidates.sort((a, b) => {
                        if (b.intelligence !== a.intelligence) return b.intelligence - a.intelligence; 
                        const aDiff = GameSystem.calcAffinityDiff(a.affinity, castellan.affinity);
                        const bDiff = GameSystem.calcAffinityDiff(b.affinity, castellan.affinity);
                        if (aDiff !== bDiff) return aDiff - bDiff; 
                        const aAchieve = a.achievementTotal || 0;
                        const bAchieve = b.achievementTotal || 0;
                        if (bAchieve !== aAchieve) return bAchieve - aAchieve; 
                        return Math.random() - 0.5;
                    });
                    const newGunshi = candidates[0];
                    newGunshi.isGunshi = true;
                }
            }
        }
    }

    /**
     * ③ 城主の自動決定と更新
     */
    updateCastleLord(castle) {
        if (!castle || castle.ownerClan === 0) {
            if (castle) castle.castellanId = 0;
            return;
        }

        const bushos = this.game.getCastleBushos(castle.id).filter(b => b.status !== 'ronin' && b.status !== 'dead' && b.status !== 'unborn');
        if (bushos.length === 0) {
            castle.castellanId = 0;
            return;
        }

        const daimyo = bushos.find(b => b.isDaimyo);
        if (daimyo) {
            bushos.forEach(b => { 
                b.isCastellan = false; 
            });
            daimyo.isCastellan = true; 
            castle.castellanId = daimyo.id;
            castle.isDelegated = false;
            return;
        }

        let currentLord = bushos.find(b => b.id === castle.castellanId && b.isCastellan);
        
        if (!currentLord) {
            this.electCastellan(castle, bushos);
        }
    }

    electCastellan(castle, bushos) {
        if (castle.ownerClan === this.game.playerClanId && castle.isDelegated) {
            const currentLord = bushos.find(b => b.id === castle.castellanId);
            if (currentLord) {
                bushos.forEach(b => b.isCastellan = false);
                currentLord.isCastellan = true;
                return; 
            }
        }
        
        const daimyo = this.game.bushos.find(b => b.clan === castle.ownerClan && b.isDaimyo);
        const innovation = daimyo ? daimyo.innovation : 50; 
        const abilityFactor = innovation / 100;
        const meritFactor = (100 - innovation) / 100;

        bushos.forEach(b => {
            const leadScore = Math.min(b.leadership, 80) * 0.8 + Math.max(b.leadership - 80, 0) * 0.8 * 0.3;
            const strScore = Math.min(b.strength, 50) * 0.5 + Math.max(b.strength - 50, 0) * 0.5 * 0.3;
            const polScore = Math.min(b.politics, 80) * 0.8 + Math.max(b.politics - 80, 0) * 0.8 * 0.3;
            const dipScore = Math.min(b.diplomacy, 60) * 0.6 + Math.max(b.diplomacy - 60, 0) * 0.6 * 0.3;
            const intScore = Math.min(b.intelligence, 60) * 0.6 + Math.max(b.intelligence - 60, 0) * 0.6 * 0.3;
            const charmScore = Math.min(b.charm, 70) * 0.8 + Math.max(b.charm - 70, 0) * 0.8 * 0.3;
            
            const abilityScore = leadScore + strScore + polScore + dipScore + intScore + charmScore;
            const meritScore = Math.sqrt((b.achievementTotal || 0) * 64);
            
            b._lordScore = (abilityScore * abilityFactor) + (meritScore * meritFactor);

            if (b.isCastellan) {
                b._lordScore += Math.floor(Math.random() * 41) + 80;
            }

            if (b.isFactionLeader) {
                b._lordScore += 10000; 
            }
            if (b.isGunshi) {
                b._lordScore -= 100000; 
            }
        });

        bushos.sort((a, b) => b._lordScore - a._lordScore);
        const best = bushos[0];

        bushos.forEach(b => b.isCastellan = false);
        best.isCastellan = true;
        
        if (best.isGunshi) {
            best.isGunshi = false;
        }
        
        castle.castellanId = best.id;
    }

    updateAllCastlesLords() {
        this.game.castles.forEach(c => this.updateCastleLord(c));
    }
    
}