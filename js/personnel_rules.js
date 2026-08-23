/**
 * personnel_rules.js
 * 調査・登用・相性・褒美など人事／調略計算を一元管理する。
 */
class PersonnelRules {
    static calcInvestigate(bushos, targetCastle) {
        if (!bushos || bushos.length === 0) return { success: false, accuracy: 0 };
        
        const maxStrBusho = bushos.reduce((a,b) => a.strength > b.strength ? a : b);
        const maxIntBusho = bushos.reduce((a,b) => a.intelligence > b.intelligence ? a : b);
        
        const assistStr = bushos.filter(b => b !== maxStrBusho).reduce((sum, b) => sum + b.strength, 0) * 0.2;
        const assistInt = bushos.filter(b => b !== maxIntBusho).reduce((sum, b) => sum + b.intelligence, 0) * 0.2;
        
        const totalStr = maxStrBusho.strength + assistStr;
        const totalInt = maxIntBusho.intelligence + assistInt;
        
        const difficulty = 30 + Math.random() * window.MainParams.Strategy.InvestigateDifficulty;
        const isSuccess = totalStr > difficulty;
        
        let accuracy = 0;
        if (isSuccess) {
            accuracy = Math.min(100, Math.max(10, (totalInt * 0.8) + (Math.random() * 20)));
        }
        
        return { success: isSuccess, accuracy: Math.floor(accuracy) };
    }

    static getInvestigateProb(bushos) {
        if (!bushos || bushos.length === 0) return 0;
        const maxStrBusho = bushos.reduce((a,b) => a.strength > b.strength ? a : b);
        const assistStr = bushos.filter(b => b !== maxStrBusho).reduce((sum, b) => sum + b.strength, 0) * 0.2;
        const totalStr = maxStrBusho.strength + assistStr;
        const diffMax = 30 + window.MainParams.Strategy.InvestigateDifficulty;
        if (totalStr >= diffMax) return 1.0;
        if (totalStr <= 30) return 0.0;
        return (totalStr - 30) / window.MainParams.Strategy.InvestigateDifficulty;
    }

    static getEmployProb(recruiter, target, recruiterClanPower, targetClanPower, game) {
        // ★追加：諸勢力に所属している武将（頭領など）は引き抜けないようにガードします！
        if ((target.belongKunishuId || 0) > 0) return 0;
        
        if (target.clan !== 0 && target.ambition > 70 && recruiterClanPower < targetClanPower * 0.7) return 0; 
        const affDiff = this.calcAffinityDiff(recruiter.affinity, target.affinity);
        let affBonus = (affDiff < 10) ? 30 : (affDiff < 25) ? 15 : (affDiff > 40) ? -10 : 0; 
        const resistance = target.clan === 0 ? target.ambition : target.loyalty * window.MainParams.Strategy.EmploymentDiff; 
        const base = recruiter.charm + affBonus;
        if (base <= 0) return 0;
        const threshold = resistance / base - 0.5;
        if (threshold >= 1.0) return 0;
        if (threshold <= 0.0) return 1.0;
        
        let prob = 1.0 - threshold;
        
        // ★追加：一門の武将が自勢力にいる場合は成功率+0.2
        if (game) {
            const hasFamily = game.bushos.some(b => b.clan === recruiter.clan && b.status !== window.GameConstants.BushoStatus.DEAD && b.id !== target.id && b.familyIds && target.familyIds && b.familyIds.some(fId => target.familyIds.includes(fId)));
            if (hasFamily) {
                prob += 0.2;
                prob = Math.max(0, Math.min(1.0, prob));
            }
        }

        // ★追加：宿敵が登用主の大名家にいる場合は、成功率を半分にします！
        if (target.nemesisIds && target.nemesisIds.length > 0 && game) {
            const hasNemesis = target.nemesisIds.some(nId => {
                const nBusho = game.getBusho(nId);
                return nBusho && nBusho.clan === recruiter.clan && nBusho.status !== window.GameConstants.BushoStatus.DEAD;
            });
            if (hasNemesis) {
                prob *= 0.5;
            }
        }
        
        // ★追加：スキルマネージャーから登用の成功率ボーナスを受け取ります
        if (typeof SkillManager !== 'undefined') {
            prob += SkillManager.calcEmployProbBonus(recruiter, game);
        }
        
        // 確率が0より小さくなったり1.0（100%）を超えないように制限して返します
        return Math.max(0, Math.min(1.0, prob));
    }

    static calcAffinityDiff(a, b) {
        const aa = Number(a || 0);
        const bb = Number(b || 0);
        const diff = Math.abs(aa - bb);
        return Math.min(diff, 100 - diff);
    }

    /**
     * 人物同士の関係を、相性差を軸に義理・野望で補正して返す。
     * 専用の補助パラメータは持たず、既存の人物性格値だけを使う。
     */
    static calcRelationshipProfile(a, b) {
        const clamp100 = value => Math.max(0, Math.min(100, Number(value) || 0));
        const affinityDiff = this.calcAffinityDiff(a.affinity, b.affinity);
        const dutyA = clamp100(a.duty);
        const dutyB = clamp100(b.duty);
        const ambitionA = clamp100(a.ambition);
        const ambitionB = clamp100(b.ambition);
        const dutyMean = (dutyA + dutyB) / 2;
        const ambitionMean = (ambitionA + ambitionB) / 2;
        const dutyGap = Math.abs(dutyA - dutyB);
        const ambitionGap = Math.abs(ambitionA - ambitionB);

        // 相性差が主軸。義理が高い者同士は多少の不一致を仕事上は飲み込み、
        // 野望が強い者同士は競争心が摩擦になりやすい。価値観の差も小さく加味する。
        let compatibilityScore = 100
            - affinityDiff * 1.35
            - dutyGap * 0.10
            - ambitionGap * 0.08
            + (dutyMean - 50) * 0.16
            - (ambitionMean - 50) * 0.12;
        compatibilityScore = Math.max(0, Math.min(100, compatibilityScore));

        // 「仲が良い」と「実際に話す」は分ける。義理は職務上の接触を増やし、
        // 野望は不要な接触を避ける方向へ働く。
        let contactScore = 72
            - affinityDiff * 1.05
            + dutyA * 0.18
            - ambitionA * 0.12
            + dutyB * 0.06
            - ambitionB * 0.04;
        contactScore = Math.max(0, Math.min(100, contactScore));

        return {
            affinityDiff,
            dutyMean,
            ambitionMean,
            dutyGap,
            ambitionGap,
            compatibilityScore: Math.round(compatibilityScore),
            contactScore: Math.round(contactScore)
        };
    }

    /**
     * 他者評価で聞き手が対象をどれだけ悲観的に評するかを返す。
     * 相性差は1につき1を基礎に、革新差と聞き手の野望で悪化する。
     * 一方、主君への忠誠・義理・主君との相性が高いほど私情を抑える。
     */
    static calcOtherAssessmentBias(interviewer, target, daimyo = null) {
        const cfg = window.MainParams.Interview.OtherAssessmentBias;
        const clamp100 = value => Math.max(0, Math.min(100, Number(value) || 0));
        const affinityDiff = this.calcAffinityDiff(interviewer && interviewer.affinity, target && target.affinity);
        const innovationDiff = Math.abs(clamp100(interviewer && interviewer.innovation) - clamp100(target && target.innovation));
        const ambition = clamp100(interviewer && interviewer.ambition);
        const loyalty = clamp100(interviewer && interviewer.loyalty);
        const duty = clamp100(interviewer && interviewer.duty);
        const lordAffinityDiff = daimyo ? this.calcAffinityDiff(interviewer && interviewer.affinity, daimyo.affinity) : 25;
        const lordAffinityScore = Math.max(0, 100 - lordAffinityDiff * 2);

        const rawBias = affinityDiff * cfg.AffinityWeight
            + innovationDiff * cfg.InnovationWeight
            + Math.max(0, ambition - 50) * cfg.AmbitionWeight;
        const restraint = Math.max(0, Math.min(1,
            (loyalty * cfg.LoyaltyRestraintWeight
                + duty * cfg.DutyRestraintWeight
                + lordAffinityScore * cfg.LordAffinityRestraintWeight) / 100
        ));
        const loyaltyPenalty = Math.max(0, Math.min(
            Number(cfg.MaxLoyaltyPenalty),
            Math.round(rawBias * (1 - restraint * cfg.RestraintStrength))
        ));

        return {
            affinityDiff,
            innovationDiff,
            ambition,
            loyalty,
            duty,
            lordAffinityDiff,
            lordAffinityScore,
            rawBias,
            restraint,
            loyaltyPenalty
        };
    }

    static calcRelationshipDistance(a, b) {
        return 100 - this.calcRelationshipProfile(a, b).compatibilityScore;
    }

    static calcRewardEffect(daimyo, target) {
        const S = window.MainParams.Strategy;
        const dist = this.calcRelationshipDistance(daimyo, target);
        let penalty = dist * S.RewardDistancePenalty;
        let baseIncrease = S.RewardBaseEffect;
        let actualIncrease = baseIncrease - penalty;
        if (actualIncrease < 0) actualIncrease = 0;
        return Math.floor(actualIncrease);
    }

    static applyRewardEffect(busho, daimyo, game) { // ★修正：お金の引数を消しました
        // 1. 忠誠度のアップ（1〜3）
        const loyaltyUp = Math.floor(Math.random() * 3) + 1;
        busho.loyalty = Math.min(100, busho.loyalty + loyaltyUp);

        // 2. 承認欲求のダウン
        // まず、大名との相性などから「効果のベース（effect）」を計算します
        const effect = this.calcRewardEffect(daimyo, busho);
        // そのベースを使って、実際にどれくらい下げるか（-effect * 2 - 5）を計算して適用します
        if (game && game.factionSystem && typeof game.factionSystem.updateRecognition === 'function') {
            game.factionSystem.updateRecognition(busho, -effect * 2 - 5);
        }

        // 画面にお知らせ（ログなど）を出すために、上がった忠誠度の数字を返してあげます
        return loyaltyUp;
    }

    /** 月初の武将個人メンテナンス。面談印・宿敵タイマー・諸勢力武将経験値を更新する。 */
    static processMonthlyBushoMaintenance(busho, game) {
        if (!window.BushoStatusRules.isActive(busho) && !window.BushoStatusRules.isRonin(busho)) return;
        busho.isInterviewed = false;

        if (busho.nemesisList && busho.nemesisList.length > 0) {
            busho.nemesisList = busho.nemesisList.filter(nemesis => {
                nemesis.count -= 1;
                return nemesis.count > 0;
            });
            busho.nemesisIds = busho.nemesisList.map(n => n.id);
        }

        if (window.BushoStatusRules.isActive(busho) && (busho.belongKunishuId || 0) > 0) {
            const kunishu = game.kunishuSystem ? game.kunishuSystem.getKunishu(busho.belongKunishuId) : null;
            if (!kunishu) return;
            const isLeader = (busho.id === kunishu.leaderId);
            const addExp = max => Math.floor(Math.random() * max);
            if (isLeader) {
                busho.expLeadership = (busho.expLeadership || 0) + addExp(3) + 1;
                busho.expStrength = (busho.expStrength || 0) + addExp(3) + 1;
                busho.expPolitics = (busho.expPolitics || 0) + addExp(3) + 1;
                busho.expDiplomacy = (busho.expDiplomacy || 0) + addExp(3) + 1;
                busho.expIntelligence = (busho.expIntelligence || 0) + addExp(3) + 1;
            } else {
                busho.expLeadership = (busho.expLeadership || 0) + addExp(3);
                busho.expStrength = (busho.expStrength || 0) + addExp(3);
                busho.expPolitics = (busho.expPolitics || 0) + addExp(3);
                busho.expDiplomacy = (busho.expDiplomacy || 0) + addExp(3);
                busho.expIntelligence = (busho.expIntelligence || 0) + addExp(3);
            }
        }
    }

    /** 月初の役職功績・経験値と、給金不足時の忠誠低下を適用する。 */
    static applyMonthlyRoleProgress(busho, isGoldShort) {
        busho.isActionDone = false;
        if (busho.isCastellan) {
            busho.achievementTotal += 5;
        } else if (busho.isGunshi) {
            busho.achievementTotal += 3;
        }
        if (busho.isDaimyo || busho.isCommander) busho.achievementTotal += 2;

        if (busho.isCastellan) {
            busho.expStrength = (busho.expStrength || 0) + 1;
            busho.expPolitics = (busho.expPolitics || 0) + 3;
        }
        if (busho.isDaimyo || busho.isCommander) {
            busho.expLeadership = (busho.expLeadership || 0) + 2;
            busho.expDiplomacy = (busho.expDiplomacy || 0) + 3;
            busho.expIntelligence = (busho.expIntelligence || 0) + 2;
        }
        if (busho.isGunshi) {
            busho.expLeadership = (busho.expLeadership || 0) + 2;
            busho.expIntelligence = (busho.expIntelligence || 0) + 5;
            busho.expPolitics = (busho.expPolitics || 0) + 2;
            busho.expDiplomacy = (busho.expDiplomacy || 0) + 3;
        }
        if (!busho.isDaimyo && isGoldShort) {
            busho.loyalty = Math.max(0, busho.loyalty - 1);
        }
    }

    static calcEmploymentSuccess(recruiter, target, recruiterClanPower, targetClanPower, game) {
        const prob = this.getEmployProb(recruiter, target, recruiterClanPower, targetClanPower, game);
        return Math.random() < prob;
    }
}

window.PersonnelRules = PersonnelRules;
