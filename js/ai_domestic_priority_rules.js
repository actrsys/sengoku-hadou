/**
 * ai_domestic_priority_rules.js
 * AIの石高開発・鉱山開発の基礎スコアと状況補正を一元管理する。
 * AI本体と面談の「方針について」は同じ評価式を参照する。
 */
class AIDomesticPriorityRules {
    static isPreparingAttack(game, castle) {
        const clanOps = game && game.aiOperationManager && game.aiOperationManager.operations
            ? game.aiOperationManager.operations[castle.ownerClan]
            : null;
        const op = clanOps ? clanOps[castle.legionId] : null;
        return !!(op && op.type === '攻撃');
    }

    static calcFarmBaseScore(game, castle) {
        if (!castle || Number(castle.kokudaka || 0) >= Number(castle.maxKokudaka || 0)) return null;
        let score = 30;
        const annualRiceIncome = EconomyRules.calcBaseRiceIncome(castle);
        const soldierToHarvestRatio = annualRiceIncome > 0 ? (Number(castle.soldiers || 0) / annualRiceIncome) : 1.0;
        if (soldierToHarvestRatio > 0.8) {
            score += 20 * Math.min(1.0, ((soldierToHarvestRatio - 0.8) * 2.0));
        }
        return score;
    }

    static calcCommerceBaseScore(game, castle, daimyo) {
        if (!castle || Number(castle.commerce || 0) >= Number(castle.maxCommerce || 0)) return null;
        let score = 30;
        const monthlyGoldIncome = EconomyRules.calcBaseGoldIncome(castle);
        let monthlyGoldConsume = 0;
        const bushos = game.getCastleBushos(castle.id)
            .filter(b => b.clan === castle.ownerClan && window.BushoStatusRules.isActive(b));
        bushos.forEach(b => {
            monthlyGoldConsume += b.getSalary(daimyo);
        });
        if (monthlyGoldIncome < monthlyGoldConsume * 2) {
            let shortageRatio = monthlyGoldIncome > 0 ? (monthlyGoldConsume / monthlyGoldIncome) : 2.0;
            shortageRatio = Math.min(2.0, shortageRatio);
            if (shortageRatio > 0.5) {
                score += 20 * Math.min(1.0, ((shortageRatio - 0.5) / 1.5));
            }
        }
        return score;
    }

    static calcRepairBaseScore(castle, perceivedDefense = null) {
        if (!castle) return null;
        const maxDefense = Math.max(0, Number(castle.maxDefense || 0));
        if (maxDefense <= 0) return null;
        const defense = perceivedDefense === null || perceivedDefense === undefined
            ? Number(castle.defense || 0)
            : Number(perceivedDefense || 0);
        const safeDefense = Math.max(0, Math.min(maxDefense, defense));
        if (safeDefense >= maxDefense) return null;

        let score = safeDefense <= maxDefense / 4 ? 80 : 20;
        const defRatio = 1000 / Math.max(1, maxDefense);
        score = Math.floor(score * defRatio);
        return score;
    }

    static applyContext(score, type, castle, castellan, isPreparingAttack) {
        if (score === null || score === undefined) return null;
        let adjusted = Number(score);
        if (castellan && castellan.personality === 'conservative' && ['farm', 'commerce'].includes(type)) {
            adjusted *= 1.2;
        }
        if (isPreparingAttack && ['farm', 'commerce'].includes(type)) {
            adjusted /= 2;
        }
        return adjusted;
    }

    static getCastleEconomicScores(game, castle) {
        if (!game || !castle) return [];
        const castellan = game.getBusho(castle.castellanId);
        if (!castellan) return [];
        const daimyo = game.getClanDaimyo(castle.ownerClan) || castellan;
        const isPreparingAttack = this.isPreparingAttack(game, castle);
        const rows = [];
        const farm = this.calcFarmBaseScore(game, castle);
        if (farm !== null) rows.push({
            type: 'farm',
            label: '石高開発',
            castle,
            score: this.applyContext(farm, 'farm', castle, castellan, isPreparingAttack)
        });
        const commerce = this.calcCommerceBaseScore(game, castle, daimyo);
        if (commerce !== null) rows.push({
            type: 'commerce',
            label: '鉱山開発',
            castle,
            score: this.applyContext(commerce, 'commerce', castle, castellan, isPreparingAttack)
        });
        return rows;
    }

    static getCastleLocalPriorityScores(game, castle) {
        if (!game || !castle) return [];
        const rows = [];
        const repair = this.calcRepairBaseScore(castle);
        if (repair !== null) rows.push({
            type: 'repair',
            label: '城壁修復',
            castle,
            score: repair
        });
        rows.push(...this.getCastleEconomicScores(game, castle));
        return rows;
    }

    static getBestLocalPlan(game, castle) {
        return this.getCastleLocalPriorityScores(game, castle)
            .sort((a, b) => b.score - a.score || String(a.type).localeCompare(String(b.type)))[0] || null;
    }

    static getBestDomesticPlan(game, castles) {
        const rows = [];
        (castles || []).forEach(castle => rows.push(...this.getCastleLocalPriorityScores(game, castle)));
        rows.sort((a, b) => b.score - a.score || Number(a.castle.id || 0) - Number(b.castle.id || 0));
        return rows[0] || null;
    }

    static getBestEconomicPlan(game, castles) {
        const rows = [];
        (castles || []).forEach(castle => rows.push(...this.getCastleEconomicScores(game, castle)));
        rows.sort((a, b) => b.score - a.score || Number(a.castle.id || 0) - Number(b.castle.id || 0));
        return rows[0] || null;
    }
}

window.AIDomesticPriorityRules = AIDomesticPriorityRules;
