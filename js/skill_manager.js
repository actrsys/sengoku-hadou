/**
 * skill_manager.js
 * 適性と技能の効果を計算・管理する司令塔のクラスです。
 */
class SkillManager {
    // アルファベットの適性ランク（S～E）を、計算用の数字（5～0）に変換する魔法です。
    static getAptitudeLevel(rank) {
        switch(rank) {
            case 'S': return 5;
            case 'A': return 4;
            case 'B': return 3;
            case 'C': return 2;
            case 'D': return 1;
            default: return 0; // Eや未設定の場合は0とします
        }
    }

    // 武将が指定した「技能」を持っているか確認する魔法です。
    static hasSkill(unit, skillName, game) {
        const busho = game.getBusho(unit.bushoId);
        if (!busho || !busho.skill) return false;
        
        // 「医術|傾奇者」のようになっている文字を「|」で切り分けて、リストにして確認します
        const skills = busho.skill.split('|').map(s => s.trim());
        return skills.includes(skillName);
    }

    // ==========================================
    // 適性による効果の計算
    // ==========================================

    // 与えるダメージの増加倍率を計算します
    static calcAptitudeDamageModifier(unit, isRanged, game) {
        const busho = game.getBusho(unit.bushoId);
        if (!busho) return 1.0; // 武将データがなければ1.0倍（そのまま）
        
        let lvl = 0;
        let baseBonus = 0; // 基本のボーナス（5% または 3%）を入れる専用の箱を用意します
        
        if (unit.troopType === 'ashigaru') {
            // 足軽の場合、遠距離なら弓術、近接なら足軽のレベルを取得します
            lvl = this.getAptitudeLevel(isRanged ? busho.aptYumi : busho.aptAshigaru);
            baseBonus = 0.05; // 足軽と弓術は基本ボーナス5%
        } else if (unit.troopType === 'kiba') {
            // 騎馬隊の時は馬術を取得します
            lvl = this.getAptitudeLevel(busho.aptKiba);
            baseBonus = 0.03; // 馬術は基本ボーナス3%
        } else if (unit.troopType === 'teppo' && isRanged) {
            // 鉄砲隊で遠距離の時だけ砲術を取得します
            lvl = this.getAptitudeLevel(busho.aptTeppo);
            baseBonus = 0.03; // 砲術は基本ボーナス3%
        }
        
        // ★適性がE（レベル0）の場合は、ここですぐに計算を打ち切って1.0倍を返します！
        if (lvl === 0) return 1.0;
        
        // レベル × 3% (0.03) に、先ほど決めた基本ボーナス（5%または3%）を足して倍率に直します
        return 1.0 + (lvl * 0.03) + baseBonus;
    }

    // ★追加：受けるダメージの軽減倍率を計算します
    static calcAptitudeDefenseModifier(defender, attacker, isRanged, game) {
        const busho = game.getBusho(defender.bushoId);
        if (!busho) return 1.0; // 武将データがなければ1.0倍（そのまま）
        
        let lvl = 0;
        let reductionPct = 0; // 軽減率（％）
        
        // ★修正：自分の兵科は関係なく、「攻撃してきた相手の兵科」を見て対処法（適性）を引っ張り出します！
        if (attacker.troopType === 'ashigaru') {
            // 相手が足軽の場合、遠距離攻撃（弓）なら弓術、近接攻撃なら足軽のレベルで対処します
            lvl = this.getAptitudeLevel(isRanged ? busho.aptYumi : busho.aptAshigaru);
            reductionPct = lvl * 2; // 足軽・弓からの攻撃はLv × 2%軽減
        } else if (attacker.troopType === 'kiba') {
            // 相手が騎馬隊の時は、馬術のレベルで対処します
            lvl = this.getAptitudeLevel(busho.aptKiba);
            reductionPct = lvl * 1; // 騎馬からの攻撃はLv × 1%軽減
        } else if (attacker.troopType === 'teppo') {
            // 相手が鉄砲隊の時は、砲術のレベルで対処します
            lvl = this.getAptitudeLevel(busho.aptTeppo);
            reductionPct = lvl * 1; // 鉄砲からの攻撃はLv × 1%軽減
        }
        
        // ★適性がE（レベル0）の場合は、ここですぐに計算を打ち切って1.0倍を返します！
        if (lvl === 0) return 1.0;
        
        // 軽減率（％）を倍率に直して返します（例：4%軽減なら 0.96 倍）
        return 1.0 - (reductionPct / 100);
    }

    // ==========================================
    // ★追加：攻城戦での適性による与ダメージアップの魔法
    // ==========================================
    static calcSiegeAptitudeDamageModifier(busho, soldiers, horses, guns, actionType) {
        if (!busho) return 1.0;
        
        let modifier = 1.0;
        let safeSoldiers = Math.max(1, soldiers);
        let horseRatio = horses / safeSoldiers;
        let gunRatio = guns / safeSoldiers;
        
        if (actionType === 'charge' || actionType === 'def_charge' || actionType === 'siege') {
            // 足軽適性：軍馬・鉄砲の割合が5割未満
            if (horseRatio < 0.5 && gunRatio < 0.5) {
                let lvl = this.getAptitudeLevel(busho.aptAshigaru);
                if (lvl > 0) {
                    modifier += (lvl * 0.03) + 0.05;
                }
            }
            // 馬術適性：軍馬の割合が5割以上
            if (horseRatio >= 0.5) {
                let lvl = this.getAptitudeLevel(busho.aptKiba);
                if (lvl > 0) {
                    modifier += (lvl * 0.03) + 0.05;
                }
            }
        } else if (actionType === 'bow' || actionType === 'def_bow') {
            // 弓術適性：条件なし（斉射時）砲術と重複
            let yumiLvl = this.getAptitudeLevel(busho.aptYumi);
            if (yumiLvl > 0) {
                modifier += (yumiLvl * 0.01) + 0.03;
            }
            // 砲術適性：鉄砲の割合が5割以上
            if (gunRatio >= 0.5) {
                let teppoLvl = this.getAptitudeLevel(busho.aptTeppo);
                if (teppoLvl > 0) {
                    modifier += (teppoLvl * 0.02) + 0.05;
                }
            }
        }
        
        return modifier;
    }

    // ==========================================
    // ★追加：攻城戦での適性による被ダメージ軽減の魔法
    // ==========================================
    static calcSiegeAptitudeDefenseModifier(busho, attackerSoldiers, attackerHorses, attackerGuns, attackActionType) {
        if (!busho) return 1.0;
        
        let reductionPct = 0;
        let safeSoldiers = Math.max(1, attackerSoldiers);
        let horseRatio = attackerHorses / safeSoldiers;
        let gunRatio = attackerGuns / safeSoldiers;
        
        if (attackActionType === 'charge' || attackActionType === 'def_charge' || attackActionType === 'siege') {
            // 足軽適性：攻撃側の軍馬・鉄砲の割合が5割未満
            if (horseRatio < 0.5 && gunRatio < 0.5) {
                let lvl = this.getAptitudeLevel(busho.aptAshigaru);
                if (lvl > 0) {
                    reductionPct += lvl * 2;
                }
            }
            // 馬術適性：攻撃側の軍馬の割合が5割以上
            if (horseRatio >= 0.5) {
                let lvl = this.getAptitudeLevel(busho.aptKiba);
                if (lvl > 0) {
                    reductionPct += lvl * 1;
                }
            }
        } else if (attackActionType === 'bow' || attackActionType === 'def_bow') {
            // 弓術適性：条件なし（斉射を受ける時）砲術と重複
            let yumiLvl = this.getAptitudeLevel(busho.aptYumi);
            if (yumiLvl > 0) {
                reductionPct += yumiLvl * 0.5;
            }
            // 砲術適性：攻撃側の鉄砲の割合が5割以上
            if (gunRatio >= 0.5) {
                let teppoLvl = this.getAptitudeLevel(busho.aptTeppo);
                if (teppoLvl > 0) {
                    reductionPct += teppoLvl * 1;
                }
            }
        }
        
        if (reductionPct === 0) return 1.0;
        return Math.max(0, 1.0 - (reductionPct / 100)); // 軽減率を倍率に変換（マイナス防止）
    }

    // 味方の艦隊効果を含めた、最終的な「操船レベル」を計算します
    static getMaritimeLevel(unit, allies, game) {
        const busho = game.getBusho(unit.bushoId);
        if (!busho) return 0;
        
        let myLvl = this.getAptitudeLevel(busho.aptMaritime);
        
        // 艦隊（味方）の中で、一番高い操船レベルを探します
        let maxLvl = 0;
        for (let ally of allies) {
            const allyBusho = game.getBusho(ally.bushoId);
            if (allyBusho) {
                let lvl = this.getAptitudeLevel(allyBusho.aptMaritime);
                if (lvl > maxLvl) maxLvl = lvl;
            }
        }
        
        // 一番高い人がLv3以上で、かつ自分のレベルがその人より3以上低い場合、
        // 一番高い人のレベルから2段階引いたレベルまで引き上げてもらえます！
        if (maxLvl >= 3 && (maxLvl - myLvl) >= 3) {
            myLvl = maxLvl - 2;
        }
        
        return myLvl;
    }

    // 海で受けるダメージの地形補正をどれくらい軽減するかを計算します
    static calcMaritimeDefenseModifier(unit, allies, baseMult, game) {
        let lvl = this.getMaritimeLevel(unit, allies, game);
        if (lvl === 0) return baseMult; // 操船を持っていなければそのまま
        
        // (Lv × 12) + 40 ％ の軽減率を計算します
        let reducePct = (lvl * 12) + 40;
        let reduceRate = Math.min(100, reducePct) / 100;
        
        // 元々どれくらいペナルティを受けていたか（例：0.7倍なら 0.3 のペナルティ）
        let penalty = 1.0 - baseMult;
        
        // ペナルティを軽減率の分だけ減らします
        let finalPenalty = penalty * (1.0 - reduceRate);
        
        // 軽減された後の最終的な倍率を返します
        return 1.0 - finalPenalty;
    }

    // 海に進入する際の行動力コストをどれくらい軽くするかを計算します
    static getMaritimeMoveCostReduction(unit, allies, game) {
        let lvl = this.getMaritimeLevel(unit, allies, game);
        if (lvl >= 4) return 2; // Lv4以上で2軽減
        if (lvl >= 2) return 1; // Lv2以上で1軽減
        return 0; // それ以外は軽減なし
    }
    
    // ==========================================
    // 武芸適性による効果
    // ==========================================

    // 武芸適性のレベルを取得する魔法です
    static getBugeiLevel(busho) {
        if (!busho || !busho.aptBugei) return 0;
        return this.getAptitudeLevel(busho.aptBugei);
    }

    // ＜防諜効果＞ 拠点の武将の武芸レベルを合計して、調略の成功率を下げる（最大20％）
    static calcBugeiCounterIntelligenceBonus(castleId, game) {
        if (!game || !castleId) return 0;
        // お城で活動中の武将全員を集めます
        const bushos = game.getCastleBushos(castleId).filter(b => b.status === 'active');
        let totalLvl = 0;
        bushos.forEach(b => {
            totalLvl += this.getBugeiLevel(b);
        });
        // 1レベルにつき2%（0.02）マイナスします
        let bonus = totalLvl * 0.02;
        // 最大で20%（0.20）までに制限して返します
        return Math.min(0.20, bonus); 
    }

    // ＜訓練効果アップ＞ 訓練実行時、Lv2以上で+1、Lv4以上でさらに+1（合計+2）
    static calcBugeiTrainingBonus(busho) {
        let lvl = this.getBugeiLevel(busho);
        if (lvl >= 4) return 2; // Lv4, 5なら+2
        if (lvl >= 2) return 1; // Lv2, 3なら+1
        return 0;               // Lv0, 1なら+0
    }

    // ＜野戦死亡率軽減＞ 野戦でLv1につき、死亡フラグ付与率を10%軽減
    static calcBugeiDeathProbReduction(busho) {
        let lvl = this.getBugeiLevel(busho);
        // Lv1なら0.9倍(10%減)、Lv2なら0.8倍(20%減)になるように計算します
        return 1.0 - (lvl * 0.10);
    }

    // ＜攻城戦の火計防御＞ 守備側で火計を受ける時、Lv1につき2%マイナス
    static calcBugeiFireDefenseBonus(busho) {
        let lvl = this.getBugeiLevel(busho);
        return lvl * 0.02;
    }
    
    // ==========================================
    // 忍術適性による効果
    // ==========================================

    // 忍術のレベルを取得する魔法です
    static getNinjutsuLevel(busho) {
        if (!busho || !busho.aptNinjutsu) return 0;
        return this.getAptitudeLevel(busho.aptNinjutsu);
    }

    // ＜忍術Lv1～5＞ 破壊工作・民心撹乱を実行時、最終成功率をLv×2％＋2％アップする魔法です
    static calcNinjutsuProbBonus(busho) {
        let lvl = this.getNinjutsuLevel(busho);
        if (lvl === 0) return 0;
        return (lvl * 0.02) + 0.02; 
    }

    // 破壊工作を実行時、最終効果にLv1につき＋１する魔法です
    static calcNinjutsuSabotageBonus(busho) {
        return this.getNinjutsuLevel(busho);
    }

    // 民心撹乱を実行時、最終効果にLv2につき＋１（切り捨て）する魔法です
    static calcNinjutsuInciteBonus(busho) {
        return Math.floor(this.getNinjutsuLevel(busho) / 2);
    }

    // 野戦で足軽隊の時、山岳・森・川地形に侵入するための必要行動力を１軽減する魔法です
    static getNinjutsuMoveCostReduction(unit, terrain, isSea, game) {
        // 足軽隊以外、または海の場合は軽減できません
        if (unit.troopType !== 'ashigaru') return 0;
        if (isSea) return 0;
        
        const busho = game.getBusho(unit.bushoId);
        let lvl = this.getNinjutsuLevel(busho);
        if (lvl > 0) {
            if (terrain === 'mountain' || terrain === 'forest' || terrain === 'river') {
                return 1; // コストを1軽減します
            }
        }
        return 0;
    }

    // 攻城戦で攻撃側の時、火計最終成功率をLv1につき＋３％する魔法です
    static calcNinjutsuFireProbBonus(busho) {
        return this.getNinjutsuLevel(busho) * 0.03;
    }
    
    // ==========================================
    // 技能による効果の判定
    // ==========================================

    // 「悪天巧者」を持っているか（悪天候の行動力ペナルティを無視できるか）
    static isWeatherPenaltyIgnored(unit, game) {
        return this.hasSkill(unit, "悪天巧者", game);
    }

    // 「踏破」を持っているか（騎馬隊でも山岳に進入できるか）
    static canKibaEnterMountain(unit, game) {
        return this.hasSkill(unit, "踏破", game);
    }
}