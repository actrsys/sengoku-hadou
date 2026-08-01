/**
 * skill_manager.js
 * 適性と技能の効果を計算・管理する司令塔のクラスです。
 */

// ==========================================
// ★追加：技能（スキル）や適性の名前をここでまとめて管理します！
// あとで名前を変更したい時は、右側の文字（"悪天巧者"など）を書き換えるだけで全てに反映されます。
// ==========================================
const SKILL_NAMES = {
    MOUNTAIN: "踏破",
    RETREAT: "退き巧者",
    MOUSHO: "猛将",
    ONI: "鬼",
    SHUYARI: "朱槍",
    AKAZONAE: "赤備え",
    WEATHER: "悪天巧者",
    KABUKIMONO: "傾奇者",
    TENKA_FUBU: "天下布武",
    ECHIGO_NO_RYU: "越後の龍",
    KAI_NO_TORA: "甲斐の虎",
    MIKAWA_NO_SHIKA: "三河の鹿"
};

const APTITUDE_NAMES = {
    ASHIGARU: "足軽",
    KIBA: "騎馬",
    YUMI: "弓術",
    TEPPO: "砲術",
    BUGEI: "武芸",
    NINJUTSU: "忍術",
    MARITIME: "操船"
};

class SkillManager {
    // 外部のファイルからもこの名前リストを見れるようにする窓口です
    static get SKILLS() { return SKILL_NAMES; }
    static get APTITUDES() { return APTITUDE_NAMES; }

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
    // ★部隊データだけでなく、武将データそのものが渡されても判定できるように強化しました！
    static hasSkill(unitOrBusho, skillName, game) {
        let busho = null;
        if (unitOrBusho.bushoId) {
            busho = game.getBusho(unitOrBusho.bushoId);
        } else if (unitOrBusho.id && unitOrBusho.skill !== undefined) {
            busho = unitOrBusho;
        }
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
    static calcSiegeAptitudeDamageModifier(bushos, soldiers, horses, guns, actionType) {
        if (!bushos || bushos.length === 0) return 1.0;
        
        let modifier = 1.0;
        let safeSoldiers = Math.max(1, soldiers);
        let horseRatio = horses / safeSoldiers;
        let gunRatio = guns / safeSoldiers;
        
        let maxAshigaruLvl = 0;
        let maxKibaLvl = 0;
        let maxYumiLvl = 0;
        let maxTeppoLvl = 0;

        bushos.forEach(b => {
            if (b) {
                maxAshigaruLvl = Math.max(maxAshigaruLvl, this.getAptitudeLevel(b.aptAshigaru));
                maxKibaLvl = Math.max(maxKibaLvl, this.getAptitudeLevel(b.aptKiba));
                maxYumiLvl = Math.max(maxYumiLvl, this.getAptitudeLevel(b.aptYumi));
                maxTeppoLvl = Math.max(maxTeppoLvl, this.getAptitudeLevel(b.aptTeppo));
            }
        });

        if (actionType === 'charge' || actionType === 'def_charge' || actionType === 'siege') {
            // 足軽適性：条件なし（突撃・破壊時）馬術と重複
            if (maxAshigaruLvl > 0) {
                modifier += (maxAshigaruLvl * 0.01) + 0.03;
            }
            // 馬術適性：軍馬の割合が5割以上
            if (horseRatio >= 0.5) {
                if (maxKibaLvl > 0) {
                    modifier += (maxKibaLvl * 0.03) + 0.05;
                }
            }
        } else if (actionType === 'bow' || actionType === 'def_bow') {
            // 弓術適性：条件なし（斉射時）砲術と重複
            if (maxYumiLvl > 0) {
                modifier += (maxYumiLvl * 0.01) + 0.03;
            }
            // 砲術適性：鉄砲の割合が5割以上
            if (gunRatio >= 0.5) {
                if (maxTeppoLvl > 0) {
                    modifier += (maxTeppoLvl * 0.02) + 0.05;
                }
            }
        }
        
        return modifier;
    }

    // ==========================================
    // ★追加：攻城戦での適性による被ダメージ軽減の魔法
    // ==========================================
    static calcSiegeAptitudeDefenseModifier(bushos, attackerSoldiers, attackerHorses, attackerGuns, attackActionType) {
        if (!bushos || bushos.length === 0) return 1.0;
        
        let reductionPct = 0;
        let safeSoldiers = Math.max(1, attackerSoldiers);
        let horseRatio = attackerHorses / safeSoldiers;
        let gunRatio = attackerGuns / safeSoldiers;

        let maxAshigaruLvl = 0;
        let maxKibaLvl = 0;
        let maxYumiLvl = 0;
        let maxTeppoLvl = 0;

        bushos.forEach(b => {
            if (b) {
                maxAshigaruLvl = Math.max(maxAshigaruLvl, this.getAptitudeLevel(b.aptAshigaru));
                maxKibaLvl = Math.max(maxKibaLvl, this.getAptitudeLevel(b.aptKiba));
                maxYumiLvl = Math.max(maxYumiLvl, this.getAptitudeLevel(b.aptYumi));
                maxTeppoLvl = Math.max(maxTeppoLvl, this.getAptitudeLevel(b.aptTeppo));
            }
        });
        
        if (attackActionType === 'charge' || attackActionType === 'def_charge' || attackActionType === 'siege') {
            // 足軽適性：条件なし（突撃・破壊を受ける時）馬術と重複
            if (maxAshigaruLvl > 0) {
                reductionPct += maxAshigaruLvl * 0.5;
            }
            // 馬術適性：攻撃側の軍馬の割合が5割以上
            if (horseRatio >= 0.5) {
                if (maxKibaLvl > 0) {
                    reductionPct += maxKibaLvl * 1;
                }
            }
        } else if (attackActionType === 'bow' || attackActionType === 'def_bow') {
            // 弓術適性：条件なし（斉射を受ける時）砲術と重複
            if (maxYumiLvl > 0) {
                reductionPct += maxYumiLvl * 0.5;
            }
            // 砲術適性：攻撃側の鉄砲の割合が5割以上
            if (gunRatio >= 0.5) {
                if (maxTeppoLvl > 0) {
                    reductionPct += maxTeppoLvl * 1;
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

    // 「悪天巧者」を持っているか（天下布武も兼ねる）
    static isWeatherPenaltyIgnored(unit, game) {
        return this.hasSkill(unit, SKILL_NAMES.WEATHER, game) || this.hasSkill(unit, SKILL_NAMES.TENKA_FUBU, game);
    }

    // 「踏破」を持っているか（天下布武も兼ねる）
    static canKibaEnterMountain(unit, game) {
        return this.hasSkill(unit, SKILL_NAMES.MOUNTAIN, game) || this.hasSkill(unit, SKILL_NAMES.TENKA_FUBU, game);
    }

    // 「退き巧者」を持っているか（天下布武も兼ねる）
    static isRetreatMaster(unit, game) {
        return this.hasSkill(unit, SKILL_NAMES.RETREAT, game) || this.hasSkill(unit, SKILL_NAMES.TENKA_FUBU, game);
    }

    // 「傾奇者」を持っているか
    static isKabukimono(unit, game) {
        return this.hasSkill(unit, SKILL_NAMES.KABUKIMONO, game);
    }

    // ==========================================
    // ★追加・変更：クリティカル機能の一元管理
    // ==========================================
    // 野戦用のクリティカル判定。発生したら効果の倍率をまとめて返します。
    static getCriticalResult(unit, game) {
        let hasOni = this.hasSkill(unit, SKILL_NAMES.ONI, game);
        let hasTenka = this.hasSkill(unit, SKILL_NAMES.TENKA_FUBU, game);
        let hasEchigo = this.hasSkill(unit, SKILL_NAMES.ECHIGO_NO_RYU, game);
        let hasKai = this.hasSkill(unit, SKILL_NAMES.KAI_NO_TORA, game);
        let hasMikawa = this.hasSkill(unit, SKILL_NAMES.MIKAWA_NO_SHIKA, game);
        let hasMousho = this.hasSkill(unit, SKILL_NAMES.MOUSHO, game);

        // クリティカル系のスキルを持っていなければここでストップ
        if (!(hasOni || hasTenka || hasEchigo || hasKai || hasMikawa || hasMousho)) {
            return { isCritical: false, atkMult: 1.0, defMult: 1.0, finalDmgMult: 1.0, skillName: "" };
        }

        // 1/12の確率でクリティカル発生！
        if (Math.random() < 1/12) {
            let skillName = "";
            let finalDmgMult = 1.0;
            // メッセージ表示用と、鬼の特別補正（最終ダメージ1.5倍）を振り分けます
            if (hasOni) { skillName = SKILL_NAMES.ONI; finalDmgMult = 1.5; }
            else if (hasTenka) { skillName = SKILL_NAMES.TENKA_FUBU; }
            else if (hasEchigo) { skillName = SKILL_NAMES.ECHIGO_NO_RYU; }
            else if (hasKai) { skillName = SKILL_NAMES.KAI_NO_TORA; }
            else if (hasMikawa) { skillName = SKILL_NAMES.MIKAWA_NO_SHIKA; }
            else if (hasMousho) { skillName = SKILL_NAMES.MOUSHO; }

            // 攻撃力2倍、防御力1/4（0.25倍）の効果をまとめて返します
            return { isCritical: true, atkMult: 2.0, defMult: 0.25, finalDmgMult: finalDmgMult, skillName: skillName };
        }

        return { isCritical: false, atkMult: 1.0, defMult: 1.0, finalDmgMult: 1.0, skillName: "" };
    }

    // ==========================================
    // ★追加：野戦・攻城戦でのスキルによる最終ダメージ増減の魔法
    // ==========================================
    // 与ダメージ増加倍率を計算します
    static calcSkillDamageModifier(bushos, clanId, kunishuId, allAlliedBushosList, isFieldWarAdjacent = false) {
        if (!bushos || bushos.length === 0) return 1.0;
        let modifier = 0; // 追加分
        
        // 自部隊に越後の龍がいるか
        let hasEchigo = bushos.some(b => b && b.skill && b.skill.includes(SKILL_NAMES.ECHIGO_NO_RYU));
        if (hasEchigo) modifier += 0.20; // 20%アップ

        // 同一勢力内に甲斐の虎がいるか
        let hasKaiInAlly = allAlliedBushosList.some(b => {
            if (b && b.skill && b.skill.includes(SKILL_NAMES.KAI_NO_TORA)) {
                if (kunishuId > 0 && b.belongKunishuId === kunishuId) return true;
                if (clanId > 0 && b.clan === clanId && b.belongKunishuId === 0) return true;
            }
            return false;
        });
        if (hasKaiInAlly) modifier += 0.05; // 5%アップ

        // ★追加：自部隊に朱槍がいて、かつ野戦で隣接戦闘の場合
        if (isFieldWarAdjacent) {
            let hasShuyari = bushos.some(b => b && b.skill && b.skill.includes(SKILL_NAMES.SHUYARI));
            if (hasShuyari) modifier += 0.10; // 10%アップ
        }

        return 1.0 + modifier;
    }

    // 被ダメージ軽減倍率を計算します
    static calcSkillDefenseModifier(bushos, clanId, kunishuId, allAlliedBushosList) {
        if (!bushos || bushos.length === 0) return 1.0;
        let reducePct = 0; // 軽減率(%)
        
        // 自部隊に越後の龍がいるか
        if (bushos.some(b => b && b.skill && b.skill.includes(SKILL_NAMES.ECHIGO_NO_RYU))) {
            reducePct += 10;
        }

        // 同一勢力内に甲斐の虎がいるか
        let hasKaiInAlly = allAlliedBushosList.some(b => {
            if (b && b.skill && b.skill.includes(SKILL_NAMES.KAI_NO_TORA)) {
                if (kunishuId > 0 && b.belongKunishuId === kunishuId) return true;
                if (clanId > 0 && b.clan === clanId && b.belongKunishuId === 0) return true;
            }
            return false;
        });
        if (hasKaiInAlly) {
            reducePct += 10;
        }

        // 自部隊に三河の鹿がいるか
        if (bushos.some(b => b && b.skill && b.skill.includes(SKILL_NAMES.MIKAWA_NO_SHIKA))) {
            reducePct += 30;
        }

        // ★追加：自部隊に赤備えがいるか
        if (bushos.some(b => b && b.skill && b.skill.includes(SKILL_NAMES.AKAZONAE))) {
            reducePct += 10;
        }

        // 軽減率（％）を倍率に直して返します（下限の制限は戦場の計算時に行います）
        return 1.0 - (reducePct / 100);
    }
}