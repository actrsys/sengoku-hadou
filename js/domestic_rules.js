/**
 * domestic_rules.js
 * 内政・訓練・徴兵の計算と実行時副作用を一元管理する。
 */
class DomesticRules {
    static calcDevelopment(busho, bonusRate = 1.0, isExecute = false) { 
        if (isExecute) busho.expPolitics = (busho.expPolitics || 0) + 10;
        return Math.max(1, Math.round((((busho.politics * 1.5) + (Math.sqrt(busho.loyalty) * 2)) / 20) * bonusRate)); 
    }

    static calcRepair(busho, bonusRate = 1.0, isExecute = false) { 
        if (isExecute) busho.expPolitics = (busho.expPolitics || 0) + 10;
        return Math.max(1, Math.round((((busho.politics * 1.5) + (Math.sqrt(busho.loyalty) * 2)) / 15) * bonusRate)); 
    }

    static calcCharity(busho, bonusRate = 1.0, isExecute = false) { 
        if (isExecute) busho.expPolitics = (busho.expPolitics || 0) + 5;
        return Math.max(1, Math.round((((busho.politics * 1.5) + busho.charm + (Math.sqrt(busho.loyalty) * 2)) / 30) * bonusRate)); 
    }

    static calcTraining(busho, soldiers, bonusRate = 1.0, isExecute = false) { 
        if (isExecute) {
            busho.expLeadership = (busho.expLeadership || 0) + 3;
            busho.expStrength = (busho.expStrength || 0) + 5;
        }
        const safeSoldiers = Math.max(1, soldiers); // 兵士0の時は計算エラーを防ぐため1として扱います
        const val = (((busho.leadership * 1.5) + busho.strength + (Math.sqrt(busho.loyalty) * 2)) / (Math.sqrt(safeSoldiers) * 0.5)) * bonusRate;
        
        let finalVal = Math.max(1, Math.round(val)); 
        // ★追加：武芸適性による訓練効果アップ
        if (typeof SkillManager !== 'undefined') {
            finalVal += SkillManager.calcBugeiTrainingBonus(busho);
        }
        return finalVal;
    }

    static calcSoldierCharity(busho, soldiers, bonusRate = 1.0, isExecute = false) { 
        if (isExecute) {
            busho.expLeadership = (busho.expLeadership || 0) + 3;
            busho.expStrength = (busho.expStrength || 0) + 5;
        }
        const safeSoldiers = Math.max(1, soldiers); // こちらも同じく兵士0の時は1として扱います
        const val = (((busho.politics * 1.5) + busho.charm + (Math.sqrt(busho.loyalty) * 2)) / (Math.sqrt(safeSoldiers) * 0.5)) * bonusRate;
        return Math.max(1, Math.round(val)); 
    }

    /** 隣接城の安全度から人口・兵士の自然増加倍率(0.2〜1.2)を計算する。 */
    static calcNeighborGrowthMultiplier(castle, game) {
        let multiplier = 1.2;
        let totalAdjacent = 0;
        let hostileAdjacent = 0;

        if (castle.adjacentCastleIds && castle.adjacentCastleIds.length > 0) {
            totalAdjacent = castle.adjacentCastleIds.length;
            castle.adjacentCastleIds.forEach(adjId => {
                const adjCastle = game.getCastle(adjId);
                if (!adjCastle) {
                    totalAdjacent--;
                    return;
                }

                let isHostile = false;
                if (adjCastle.ownerClan === castle.ownerClan) {
                    isHostile = false;
                } else if (adjCastle.ownerClan === 0) {
                    isHostile = true;
                } else {
                    const rel = game.getRelation(castle.ownerClan, adjCastle.ownerClan);
                    isHostile = !(rel && window.DiplomacyRules.isFriendly(rel.status));
                }
                if (isHostile) hostileAdjacent++;
            });

            if (totalAdjacent > 0) {
                multiplier = 0.2 + (1.0 - (hostileAdjacent / totalAdjacent));
            }
        }
        return multiplier;
    }

    /** 月初の人口自然増減を計算する。 */
    static calcMonthlyPopulationGrowth(castle, neighborMultiplier) {
        const currentLoyalty = Math.max(0, Math.min(100, castle.peoplesLoyalty));
        let calcLoyalty = currentLoyalty;
        if (castle.population < 2000 && currentLoyalty < 60) calcLoyalty = 60;

        let growth = Math.floor(
            ((Math.sqrt(castle.population) * 2) * ((calcLoyalty - 50) / 100)) + (calcLoyalty / 4)
        );

        if (growth > 0) {
            growth = Math.floor(growth * neighborMultiplier);
            const popKokuRatio = castle.population / Math.max(1, castle.kokudaka);
            let popLowBonus = 1.0;
            if (popKokuRatio <= 1) {
                popLowBonus = 3.0;
            } else if (popKokuRatio <= 5) {
                popLowBonus = 3.0 - ((popKokuRatio - 1) / 4) * 1.5;
            } else if (popKokuRatio <= 10) {
                popLowBonus = 1.5 - ((popKokuRatio - 5) / 5) * 0.5;
            }
            growth = Math.floor(growth * popLowBonus);
        }

        const kokudakaBonus = Math.sqrt(Math.max(0, castle.kokudaka)) * 500;
        const defenseBonus = Math.sqrt(Math.max(0, castle.defense)) * 200;
        const loyaltyScore = (castle.peoplesLoyalty / 100) + 0.5;
        const baseScore = (kokudakaBonus + defenseBonus) * loyaltyScore;
        if (growth > 0 && castle.population >= baseScore) growth = Math.floor(growth / 20);
        return growth;
    }

    /** 月初の兵士自然増加を計算する。 */
    static calcMonthlySoldierGrowth(castle, daimyo, ownedCastlesCount, neighborMultiplier) {
        if (!daimyo) return 0;
        const statBonus = (
            daimyo.leadership + daimyo.strength + daimyo.politics +
            daimyo.diplomacy + daimyo.intelligence + daimyo.charm
        ) / 600;
        const highestStat = Math.max(
            daimyo.leadership, daimyo.strength, daimyo.politics,
            daimyo.diplomacy, daimyo.intelligence, daimyo.charm
        );
        const specialtyBonus = 0.5 + (highestStat * 0.005);
        const daimyoBonus = statBonus * specialtyBonus;
        const loyaltyBonus = castle.peoplesLoyalty * 0.01;
        const baseGrowth = Math.sqrt(castle.population) * ((daimyoBonus + loyaltyBonus) / 2) * 1.25;
        const castlePenalty = 1 + (ownedCastlesCount / 25);
        const suppressedGrowth = baseGrowth / castlePenalty;
        const soldierRatio = castle.population > 0 ? (castle.soldiers / castle.population) : 1.0;
        const penaltyMultiplier = Math.max(0, 1.0 - (soldierRatio * 1.25));
        let soldierGrowth = Math.floor(suppressedGrowth * penaltyMultiplier);
        if (soldierGrowth > 0) soldierGrowth = Math.floor(soldierGrowth * neighborMultiplier);
        return Math.max(0, soldierGrowth);
    }

    static calcFactionBonusRate(bushos) {
        if (!bushos || bushos.length < 2) return 1.0;
        const factionId = bushos[0].factionId;
        if (factionId === 0) return 1.0; // 無所属は派閥として扱いません
        const isSameFaction = bushos.every(b => b.factionId === factionId);
        if (isSameFaction) {
            return 1.0 + (bushos.length - 1) * 0.1;
        }
        return 1.0;
    }

    static calcDraftBushoScore(busho) {
        return (busho.leadership * 1.5) + (busho.charm * 1.5) + (Math.sqrt(busho.loyalty) * 2);
    }

    static calcDraftEfficiency(busho, peoplesLoyalty, population = 20000) {
        const bushoScore = this.calcDraftBushoScore(busho);
        const baseEfficiency = (bushoScore + (Math.sqrt(peoplesLoyalty) * 2)) / 500;
        
        // 人口が0などで計算がおかしくならないよう、最低でも100人はいるものとして安全に計算します
        const safePopulation = Math.max(100, population);
        
        // 人口20000人を基準（1.0倍）として、4乗根（0.25乗）で倍率を計算します
        const popMultiplier = Math.pow(safePopulation / 20000, 0.25);
        
        return baseEfficiency * popMultiplier;
    }

    static calcDraftUnitPrice(busho, peoplesLoyalty, population = 20000) {
        const efficiency = this.calcDraftEfficiency(busho, peoplesLoyalty, population);
        // 万が一効率が0になってエラー（0割り）が起きるのを防ぐための安全装置です
        if (efficiency <= 0) return 9999; 
        return 1 / efficiency;
    }

    static calcDraftFromGold(gold, busho, peoplesLoyalty, population = 20000) { 
        const efficiency = this.calcDraftEfficiency(busho, peoplesLoyalty, population);
        return Math.floor(gold * efficiency); 
    }

    static calcDraftCost(soldiers, busho, peoplesLoyalty, population = 20000, isExecute = false) { 
        if (isExecute) {
            busho.expLeadership = (busho.expLeadership || 0) + Math.floor(soldiers / 300);
            busho.expStrength = (busho.expStrength || 0) + Math.floor(soldiers / 200);
        }
        const efficiency = this.calcDraftEfficiency(busho, peoplesLoyalty, population);
        return Math.ceil(soldiers / efficiency); 
    }

    static applyDraftPenalty(castle, soldiers) {
        // 人口が0以下の時は何もしないように安全対策をします
        if (castle.population <= 0) return 0;
        
        // 徴兵した割合を計算します
        const draftRatio = soldiers / castle.population;
        
        // ペナルティの割合（2倍）を計算します
        const penaltyRatio = draftRatio * 2;
        
        // 今の民忠からどれくらい減らすかを計算します
        const loyaltyPenalty = Math.floor(castle.peoplesLoyalty * penaltyRatio);
        
        // 実際の城のステータスから、民忠と人口を減らします（0未満にはならないようにします）
        castle.peoplesLoyalty = Math.max(0, castle.peoplesLoyalty - loyaltyPenalty);
        castle.population = Math.max(0, castle.population - soldiers);
        
        // 減らした民忠の量を返してあげます（結果のメッセージ表示などに使えます）
        return loyaltyPenalty;
    }

    static calcMaxDraftAmount(castle, busho) {
        // ★変更：計算の窓口に「お城の人口」もセットで渡すようにしました
        let maxAffordable = this.calcDraftFromGold(castle.gold, busho, castle.peoplesLoyalty, castle.population);
        // 端数でお金が足りなくならないよう、確実な数まで減らします
        while (maxAffordable > 0 && this.calcDraftCost(maxAffordable, busho, castle.peoplesLoyalty, castle.population) > castle.gold) {
            maxAffordable--;
        }
        // 人口や城の最大兵数（99999）を超えないようにします
        return Math.min(castle.population, 99999 - castle.soldiers, maxAffordable);
    }
}

window.DomesticRules = DomesticRules;
