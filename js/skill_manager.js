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