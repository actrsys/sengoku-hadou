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

    static calcAffinityDiff(a, b) { const diff = Math.abs(a - b); return Math.min(diff, 100 - diff); }

    static calcValueDistance(a, b) {
        const diffInno = Math.abs(a.innovation - b.innovation);
        const coopFactor = (a.cooperation + b.cooperation) / 200; 
        let dist = diffInno * (1.0 - (coopFactor * 0.5)); 
        const classicAff = this.calcAffinityDiff(a.affinity, b.affinity); 
        return Math.floor(dist * 0.8 + classicAff * 0.4); 
    }

    static calcRewardEffect(daimyo, target) {
        const S = window.MainParams.Strategy;
        const dist = this.calcValueDistance(daimyo, target);
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
