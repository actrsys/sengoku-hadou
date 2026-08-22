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

    static isUnhappyBusho(busho) {
        // 武将データが無い場合や、大名・諸勢力は対象外にします
        if (!busho || busho.isDaimyo || busho.belongKunishuId > 0) return false;
        
        const advLoyalty = window.MainParams.Gunshi.AdviceLoyalty;
        
        // 忠誠度が基準値以下の武将を不満と判定します
        return busho.loyalty <= advLoyalty;
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
