/**
 * skill_manager.js
 * 適性と技能の効果を計算・管理する司令塔のクラスです。
 * 適性や技能を持っているやスキルの効果量の計算などは必ずここで一元管理して行います。
 */

// ==========================================
// ★追加：技能（スキル）や適性の名前をここでまとめて管理します！
// あとで名前を変更したい時は、右側の文字（"悪天巧者"など）を書き換えるだけで全てに反映されます。
// ==========================================
const SKILL_NAMES = {
    MOUSHO: "猛将",
    ONI: "鬼",
    SOGEKI: "狙撃",
    SHUYARI: "朱槍",
    KABUKIMONO: "傾奇者",
    AKAZONAE: "赤備え",
    MOUNTAIN: "踏破",
    WEATHER: "悪天巧者",
    RETREAT: "退き巧者",
    BOSHO: "謀将",
    BOSHIN: "謀神",
    IJUTSU: "医術",
    TENKA_FUBU: "天下布武",
    ECHIGO_NO_RYU: "越後の龍",
    KAI_NO_TORA: "甲斐の虎",
    MIKAWA_NO_SHIKA: "三河の鹿",
    HITOTARASHI: "人たらし",
    HYORIHIKYO: "表裏比興",
    PHOENIX: "常陸の不死鳥",
    OU_NO_GYOSHO: "奥羽の驍将"
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

// 適性の説明文（表示用）
const APTITUDE_DESCRIPTIONS = {
    // 足軽
    [APTITUDE_NAMES.ASHIGARU]: "足軽・近接戦闘時の与ダメージ上昇と被ダメージ軽減に影響する。レベルが高いほど効果が大きい。",
    // 馬術
    [APTITUDE_NAMES.KIBA]: "騎馬隊の与ダメージ上昇と被ダメージ軽減に影響する。レベルが高いほど効果が大きい。",
    // 弓術
    [APTITUDE_NAMES.YUMI]: "弓による遠距離攻撃時の与ダメージ上昇と被ダメージ軽減に影響する。レベルが高いほど効果が大きい。",
    // 砲術
    [APTITUDE_NAMES.TEPPO]: "鉄砲による遠距離攻撃時の与ダメージ上昇と被ダメージ軽減に影響する。レベルが高いほど効果が大きい。",
    // 武芸
    [APTITUDE_NAMES.BUGEI]: "拠点の防諜成功率低下、訓練効果上昇、戦死率軽減、火計防御に影響する。",
    // 忍術
    [APTITUDE_NAMES.NINJUTSU]: "破壊工作・扇動の成功率と効果上昇、山岳・森・川の移動コスト軽減、火計成功率上昇に影響する。",
    // 操船
    [APTITUDE_NAMES.MARITIME]: "海戦時の被ダメージ軽減と海進入時の移動コスト軽減に影響する。艦隊内最高レベルからの補正も受ける。"
};

// 技能の説明文（表示用）
const SKILL_DESCRIPTIONS = {
    // 踏破
    [SKILL_NAMES.MOUNTAIN]: "①騎馬隊で山岳地形へ侵入可能になる。",
    // 退き巧者
    [SKILL_NAMES.RETREAT]: "①撤退時の負傷兵の回復率が上昇する。\n②敵部隊と隣接している状態から離脱しやすくなる。（野戦）\n③側面および背面から受けるダメージ補正を無効化する。（野戦）",
    // 猛将
    [SKILL_NAMES.MOUSHO]: "①一定確率でクリティカルが発生するようになる。（野戦）",
    // 鬼
    [SKILL_NAMES.ONI]: "①一定確率でクリティカルが発生するようになる。（野戦）\n②クリティカル発生時に与えるダメージが１．５倍になる。（野戦）",
    // 悪天巧者
    [SKILL_NAMES.WEATHER]: "①悪天候時に受ける行動力のペナルティを無効化する。（野戦）\n②悪天候時に受けるダメージ補正のペナルティを無効化する。（野戦／攻城戦）",
    // 朱槍
    [SKILL_NAMES.SHUYARI]: "①隣接戦闘時に与えるダメージが１０％上昇する。（野戦）\n②隣接戦闘時に一定確率でクリティカルが発生するようになる。（野戦：足軽・騎馬）",
    // 赤備え
    [SKILL_NAMES.AKAZONAE]: "①自部隊が受ける被ダメージが１０％減少する。（野戦／攻城戦）\n②ターン経過による士気の低下を無効化する。（野戦／攻城戦）",
    // 医術
    [SKILL_NAMES.IJUTSU]: "①同じ拠点にいる武将の戦没確率が減少する。\n②災害によって拠点が受ける人口ダメージが減少する。",
    // 傾奇者
    [SKILL_NAMES.KABUKIMONO]: "①自軍が追い詰められていて自部隊の兵数が少ない時、自部隊が与えるダメージが激増し、受けるダメージが激減する。（野戦：足軽・騎馬）",
    // 天下布武
    [SKILL_NAMES.TENKA_FUBU]: "①悪天巧者・踏破・退き巧者の効果を併せ持つ。\n②一定確率でクリティカルが発生するようになる。（野戦）",
    // 越後の龍
    [SKILL_NAMES.ECHIGO_NO_RYU]: "①自部隊が与えるダメージが２０％上昇し、受けるダメージが１０％減少する。（野戦／攻城戦）\n②一定確率でクリティカルが発生するようになる。（野戦）",
    // 甲斐の虎
    [SKILL_NAMES.KAI_NO_TORA]: "①自勢力の部隊全てが与えるダメージが５％上昇し、受けるダメージが１０％減少する。（野戦／攻城戦）\n②一定確率でクリティカルが発生するようになる。（野戦）",
    // 三河の鹿
    [SKILL_NAMES.MIKAWA_NO_SHIKA]: "①自部隊が受けるダメージが３０％減少する。（野戦／攻城戦）",
    // 人たらし
    [SKILL_NAMES.HITOTARASHI]: "①派閥を形成しやすくなる。\n②自身が担当である時、登用の成功率が１５％上昇する。\n③自身が担当である時、武将引抜の成功率が２％上昇する。",
    // 狙撃
    [SKILL_NAMES.SOGEKI]: "①遠距離攻撃時に一定確率でクリティカルが発生するようになる。（野戦：鉄砲）",
    // 表裏比興
    [SKILL_NAMES.HYORIHIKYO]: "①自身が大名または外交の使者である時、親善の成功率が上昇する。\n②自身が大名または外交の使者である時、断交時のペナルティが減少する。\n③自身が大名である時、主家からの援軍要請を拒否できる。",
    // 常陸の不死鳥
    [SKILL_NAMES.PHOENIX]: "①戦没しなくなる。\n②大名として滅亡した時、諸勢力となる。\n③諸勢力の頭領である時、空白地を奪って大名となる。",
    // 謀将 ※内部的に謀将が大名や国主である時のみ、暗殺を図るようになる
    [SKILL_NAMES.BOSHO]: "①自身が大名、国主または暗殺の担当者である時、暗殺の基本成功率が５％上昇する。",
    // 奥羽の驍将
    [SKILL_NAMES.OU_NO_GYOSHO]: "①大名、国主または暗殺の担当者である時、暗殺の基本成功率が８％上昇する。\n②野戦で自部隊と戦闘する相手部隊のクリティカル発生を無効化する。\n③大名、国主または外交の使者である時、親善・同盟の成功率が１０％上昇する。",
    // 謀神
    [SKILL_NAMES.BOSHIN]: "①大名、国主または暗殺の担当者である時、暗殺の基本成功率が８％上昇する。\n②大名、国主または計略の担当者である時、破壊工作・民心撹乱の成功率が１０％上昇する。\n③攻城戦で自部隊が行う火計の成功率が１５％、挑発の成功率が５％上昇する。"
};

class SkillManager {
    // 外部のファイルからもこの名前リストを見れるようにする窓口です
    static get SKILLS() { return SKILL_NAMES; }
    static get APTITUDES() { return APTITUDE_NAMES; }
    
    static getSkillDescription(skillName) {
        return SKILL_DESCRIPTIONS[skillName] || "";
    }
    
    static getAptitudeDescription(aptitudeName) {
        return APTITUDE_DESCRIPTIONS[aptitudeName] || "";
    }

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
    
    // ＜暗殺防諜＞ ターゲット拠点の武芸Lvを合計して、暗殺の成功率を下げる（重複可）
    static calcBugeiAssassinateDefense(castleId, game) {
        if (!game || !castleId) return 0;
        const bushos = game.getCastleBushos(castleId).filter(b => b.status === 'active');
        let totalLvl = 0;
        bushos.forEach(b => {
            totalLvl += this.getBugeiLevel(b);
        });
        // 1レベルにつき2%（0.02）マイナスします
        return totalLvl * 0.02;
    }

    // ＜防諜効果＞ 拠点の武将の武芸レベルを合計して、計略の成功率を下げる（最大20％）
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
    
    // ＜暗殺防諜＞ ターゲット勢力全体の忍術レベルを合計して、暗殺の成功率を下げる（重複可）
    static calcNinjutsuAssassinateDefense(clanId, game) {
        if (!game || clanId === 0) return 0;
        const bushos = game.bushos.filter(b => b.clan === clanId && b.status === 'active');
        let totalLvl = 0;
        bushos.forEach(b => {
            totalLvl += this.getNinjutsuLevel(b);
        });
        // 1レベルにつき1%（0.01）マイナスします
        return totalLvl * 0.01;
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

    // ==========================================
    // ★追加：天候・地形ペナルティの一元管理
    // ==========================================
    static isWeatherPenaltyIgnoredForArmy(bushos, game) {
        if (!bushos || bushos.length === 0) return false;
        return bushos.some(b => this.isWeatherPenaltyIgnored(b, game));
    }

    // 攻城戦：天候による攻撃側部隊の基本攻撃力ペナルティ倍率
    static calcSiegeWeatherAtkModifier(bushos, isRaining, isHeavySnow, game) {
        if (this.isWeatherPenaltyIgnoredForArmy(bushos, game)) return 1.0;
        let modifier = 1.0;
        if (isRaining) modifier *= 0.9;
        if (isHeavySnow) modifier *= 0.9;
        return modifier;
    }

    // 攻城戦：天候によるターゲットの基本防御力・反撃力ペナルティ倍率
    static calcSiegeWeatherTargetModifier(bushos, isHeavySnow, isAttacker, game) {
        if (!isAttacker) return 1.0; 
        if (this.isWeatherPenaltyIgnoredForArmy(bushos, game)) return 1.0;
        if (isHeavySnow) return 0.9;
        return 1.0;
    }

    // 野戦：天候による基本攻撃力のペナルティ倍率
    static calcFieldWeatherAtkModifier(unit, isHeavySnowBattle, game) {
        if (this.isWeatherPenaltyIgnored(unit, game)) return 1.0;
        let modifier = 1.0;
        if (isHeavySnowBattle) modifier *= 0.9;
        return modifier;
    }

    // 野戦：天候による基本防御力のペナルティ倍率
    static calcFieldWeatherDefModifier(unit, isHeavySnowBattle, isRainingOrSnowing, game) {
        if (this.isWeatherPenaltyIgnored(unit, game)) return 1.0;
        let modifier = 1.0;
        if (isHeavySnowBattle) modifier *= 0.9;
        if (isRainingOrSnowing) modifier *= 0.9;
        return modifier;
    }

    // 野戦：川や海での地形ペナルティ倍率（天候影響含む）
    static calcFieldWaterTerrainModifier(unit, isRainingOrSnowing, game) {
        if (isRainingOrSnowing && !this.isWeatherPenaltyIgnored(unit, game)) {
            return 0.5; // 悪天候時は0.5
        }
        return 0.7; // 通常は0.7
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
    // ★追加：傾奇者の効果（ダメージ計算）を一元管理する魔法
    // ==========================================
    static getKabukimonoResult(unit, allUnits, game, isAdjacent) {
        // 基本の倍率（何もない時は1倍）の箱を用意します
        let result = { isActive: false, atkMult: 1.0, defMult: 1.0 };

        // そもそも傾奇者のスキルを持っていなければ、ここでストップします
        if (!this.isKabukimono(unit, game)) return result;

        // 足軽隊か騎馬隊で、兵士数が1000人以下の時だけ発動のチャンスです
        if ((unit.troopType === 'ashigaru' || unit.troopType === 'kiba') && unit.soldiers <= 1000) {
            let allyTotal = 0;
            let enemyTotal = 0;
            
            // 戦場にいるすべての部隊から、味方と敵の数を数えます
            if (allUnits && Array.isArray(allUnits)) {
                allUnits.forEach(u => {
                    if (u.isAttacker === unit.isAttacker) allyTotal += u.soldiers;
                    else enemyTotal += u.soldiers;
                });
            }
            
            // 味方の総兵数が敵の総兵数以下（追い詰められている）なら発動します！
            if (allyTotal <= enemyTotal) {
                result.isActive = true;
                result.defMult = 0.3; // 被ダメージを激減（0.3倍）します
                
                // 与えるダメージが激増（3倍）するのは、隣接戦闘（距離1）の時だけです
                if (isAdjacent) {
                    result.atkMult = 3.0;
                }
            }
        }
        
        return result;
    }

    // ==========================================
    // ★追加・変更：クリティカル機能の一元管理
    // ==========================================
    // 野戦用のクリティカル判定。発生したら効果の倍率をまとめて返します。
    static getCriticalResult(unit, game, isRangedTeppo = false, isAdjacent = false) {
        let critCandidates = [];

        // 持っているスキルをすべてチェックして、クリティカルの「候補リスト」を作ります
        if (this.hasSkill(unit, SKILL_NAMES.ONI, game)) {
            critCandidates.push({ name: SKILL_NAMES.ONI, prob: 1/12, mult: 1.5 });
        }
        if (isRangedTeppo && this.hasSkill(unit, SKILL_NAMES.SOGEKI, game)) {
            critCandidates.push({ name: SKILL_NAMES.SOGEKI, prob: 1/8, mult: 1.0 });
        }
        // ★追加: 朱槍によるクリティカル（足軽・騎馬で隣接戦闘時）
        if (isAdjacent && (unit.troopType === 'ashigaru' || unit.troopType === 'kiba') && this.hasSkill(unit, SKILL_NAMES.SHUYARI, game)) {
            critCandidates.push({ name: SKILL_NAMES.SHUYARI, prob: 1/12, mult: 1.0 });
        }
        if (this.hasSkill(unit, SKILL_NAMES.TENKA_FUBU, game)) {
            critCandidates.push({ name: SKILL_NAMES.TENKA_FUBU, prob: 1/12, mult: 1.0 });
        }
        if (this.hasSkill(unit, SKILL_NAMES.ECHIGO_NO_RYU, game)) {
            critCandidates.push({ name: SKILL_NAMES.ECHIGO_NO_RYU, prob: 1/12, mult: 1.0 });
        }
        if (this.hasSkill(unit, SKILL_NAMES.KAI_NO_TORA, game)) {
            critCandidates.push({ name: SKILL_NAMES.KAI_NO_TORA, prob: 1/12, mult: 1.0 });
        }
        if (this.hasSkill(unit, SKILL_NAMES.MIKAWA_NO_SHIKA, game)) {
            critCandidates.push({ name: SKILL_NAMES.MIKAWA_NO_SHIKA, prob: 1/12, mult: 1.0 });
        }
        if (this.hasSkill(unit, SKILL_NAMES.MOUSHO, game)) {
            critCandidates.push({ name: SKILL_NAMES.MOUSHO, prob: 1/12, mult: 1.0 });
        }

        // クリティカル系のスキルを持っていなければ（候補がなければ）ここでストップします
        if (critCandidates.length === 0) {
            return { isCritical: false, atkMult: 1.0, defMult: 1.0, finalDmgMult: 1.0, skillName: "" };
        }

        // ★追加: 複数のスキルが重複した場合、最も高い確率と最も高い倍率を抽出します
        let maxProb = 0;
        let maxMult = 1.0;
        let bestSkillName = ""; 

        critCandidates.forEach(cand => {
            if (cand.prob > maxProb) maxProb = cand.prob;
            if (cand.mult > maxMult) maxMult = cand.mult;
        });

        // ログに表示する「名前」を決めます（倍率が一番高いもの ＞ 確率が一番高いもの の順で優先します）
        let bestCand = critCandidates.find(c => c.mult === maxMult && c.prob === maxProb);
        if (!bestCand) bestCand = critCandidates.find(c => c.mult === maxMult);
        if (!bestCand) bestCand = critCandidates.find(c => c.prob === maxProb);
        if (bestCand) bestSkillName = bestCand.name;

        // サイコロは1回だけ、抽出した「最も高い確率」で振ります
        if (Math.random() < maxProb) {
            // 攻撃力2倍、防御力1/4（0.25倍）をベースに、抽出した「最も高い倍率」を乗せて返します
            return { isCritical: true, atkMult: 2.0, defMult: 0.25, finalDmgMult: maxMult, skillName: bestSkillName };
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
    
    // ==========================================
    // ★追加：人事・計略・派閥などのスキルボーナス一元管理
    // ==========================================

    // ＜派閥ボーナス＞ リーダー選出時や派閥スコア計算時に「功績」に加算されるボーナス
    static calcFactionAchievementBonus(busho, game) {
        let bonus = 0;
        if (this.hasSkill(busho, SKILL_NAMES.HITOTARASHI, game)) {
            bonus += 200;
        }
        // 将来、新しいスキルができたらここに書き足せます
        return bonus;
    }

    // ＜登用ボーナス＞ 登用実行時、最終成功率に加算されるボーナス
    static calcEmployProbBonus(busho, game) {
        let probBonus = 0;
        if (this.hasSkill(busho, SKILL_NAMES.HITOTARASHI, game)) {
            probBonus += 0.15; // 15%プラス
        }
        return probBonus;
    }

   // ＜引抜ボーナス＞ 武将引抜実行時、最終成功率に加算されるボーナス
    static calcHeadhuntProbBonus(busho, game) {
        let probBonus = 0;
        if (this.hasSkill(busho, SKILL_NAMES.HITOTARASHI, game)) {
            probBonus += 0.02; // 2%プラス
        }
        return probBonus;
    }

    // ==========================================
    // ★追加：寿命や災害などの特殊なスキルボーナスを一元管理する窓口
    // ==========================================

    // ＜寿命・討死＞ 武将の死亡確率への倍率を計算します
    static calcDeathProbModifier(busho, game) {
        let modifier = 1.0; // 基本は1.0倍（そのまま）です
        
        // 所属がない、またはお城にいない場合はそのまま返します
        if (!busho || busho.clan === 0 || busho.castleId === 0) return modifier;

        // 同じお城にいる味方の武将を集めます
        const sameCastleBushos = game.getCastleBushos(busho.castleId).filter(other => other.status === 'active' && other.clan === busho.clan);

        // 「医術」を持っている武将がいれば確率を半分（0.5倍）にします
        const hasIjutsu = sameCastleBushos.some(other => this.hasSkill(other, SKILL_NAMES.IJUTSU, game));
        if (hasIjutsu) {
            modifier *= 0.5;
        }

        // 💡 今後「長寿」などの新しいスキルを追加したい時は、ここに書き足すだけでOKです！
        return modifier;
    }

    // ＜災害被害＞ 拠点に対する災害（飢饉、疫病、地震、大雪、台風）の被害軽減倍率を計算します
    static calcDisasterDamageModifier(castle, game) {
        let modifier = 1.0; // 基本は1.0倍（そのまま）です
        
        if (!castle || castle.ownerClan === 0) return modifier;

        // そのお城にいる味方の武将を集めます
        const bushos = game.getCastleBushos(castle.id).filter(b => b.status === 'active' && b.clan === castle.ownerClan);

        // 「医術」を持っている武将がいれば被害を半分（0.5倍）にします
        const hasIjutsu = bushos.some(b => this.hasSkill(b, SKILL_NAMES.IJUTSU, game));
        if (hasIjutsu) {
            modifier *= 0.5;
        }

        // 💡 今後「治水」や「防災」などの新しいスキルを追加したい時は、ここに書き足すだけでOKです！
        return modifier;
    }
    
    // ＜外交ボーナス＞ 技能による外交の最終成功率アップ
    static calcDiplomacyProbBonus(actionType, busho, game) {
        let probBonus = 0;
        
        // 表裏比興による親善ボーナス（後方互換性対応）
        if (actionType === 'goodwill') {
            if (this.hasSkill(busho, SKILL_NAMES.HYORIHIKYO, game)) {
                probBonus += 15;
            }
        }
        
        // 奥羽の驍将による親善・同盟ボーナス
        if (actionType === 'goodwill' || actionType === 'alliance') {
            let hasOuNoGyosho = false;
            if (this.hasSkill(busho, SKILL_NAMES.OU_NO_GYOSHO, game)) {
                hasOuNoGyosho = true;
            } else {
                const daimyo = game.bushos.find(b => b.clan === busho.clan && b.isDaimyo);
                if (daimyo && this.hasSkill(daimyo, SKILL_NAMES.OU_NO_GYOSHO, game)) {
                    hasOuNoGyosho = true;
                } else {
                    const doerCastle = game.getCastle(busho.castleId);
                    if (doerCastle && doerCastle.legionId !== 0) {
                        const legion = game.legions ? game.legions.find(l => l.clanId === busho.clan && l.legionNo === doerCastle.legionId) : null;
                        if (legion && legion.commanderId) {
                            const commander = game.getBusho(legion.commanderId);
                            if (commander && this.hasSkill(commander, SKILL_NAMES.OU_NO_GYOSHO, game)) {
                                hasOuNoGyosho = true;
                            }
                        }
                    }
                }
            }
            if (hasOuNoGyosho) {
                probBonus += 10;
            }
        }

        return probBonus;
    }

    // ＜親善ボーナス＞ 表裏比興による親善の最終成功率アップ（互換性用）
    static calcGoodwillProbBonus(busho, game) {
        return this.calcDiplomacyProbBonus('goodwill', busho, game);
    }

    // ＜断交ペナルティ軽減＞ 表裏比興による断交時のマイナス効果の軽減
    static getBreakAlliancePenaltyModifiers(doerBusho, doerClanId, game) {
        let hasSkill = false;
        // 外交の使者（実行者）が持っているかチェック
        if (doerBusho && this.hasSkill(doerBusho, SKILL_NAMES.HYORIHIKYO, game)) {
            hasSkill = true;
        } else {
            // 大名自身が持っているかチェック
            const daimyo = game.bushos.find(b => b.clan === doerClanId && b.isDaimyo);
            if (daimyo && this.hasSkill(daimyo, SKILL_NAMES.HYORIHIKYO, game)) {
                hasSkill = true;
            }
        }

        if (hasSkill) {
            // 相手との友好度低下を0.5倍(50%軽減)、他勢力からの悪化を0倍(無効)、忠誠低下を無効にする指示を返します
            return { targetDropMult: 0.5, globalDropMult: 0.0, preventLoyaltyDrop: true };
        }
        // スキルがなければ通常のまま（1倍、無効化なし）とします
        return { targetDropMult: 1.0, globalDropMult: 1.0, preventLoyaltyDrop: false };
    }

    // ＜援軍要請の拒否＞ 表裏比興により主家からの援軍を断れるかどうかの判定
    static canDeclineBossReinforcement(clanId, game) {
        const daimyo = game.bushos.find(b => b.clan === clanId && b.isDaimyo);
        if (daimyo && this.hasSkill(daimyo, SKILL_NAMES.HYORIHIKYO, game)) {
            return true;
        }
        return false;
    }

    // ==========================================
    // ★追加：各システムから呼ばれる、状態変化系スキルの判定窓口
    // ==========================================

    // ＜野戦死亡率の最終倍率（武芸やスキルを含む）＞
    static calcFieldDeathProbModifier(busho, game) {
        let modifier = 1.0;
        // 武芸適性による軽減
        modifier *= this.calcBugeiDeathProbReduction(busho);

        // 常陸の不死鳥による回避（確率を0倍にする）
        if (this.hasSkill(busho, SKILL_NAMES.PHOENIX, game)) {
            modifier = 0;
        }
        
        return modifier;
    }

    // ＜滅亡時の生存（諸勢力化）判定と、結成時の設定値渡し＞
    static getExtinctionSurvivalInfo(busho, game) {
        if (this.hasSkill(busho, SKILL_NAMES.PHOENIX, game)) {
            return {
                isSurvive: true,
                maxSoldiers: 3000,
                soldiers: 3000,
                training: 70,
                defaultTraining: 70,
                morale: 70,
                defaultMorale: 70,
                maxHorses: 1000,
                horses: 0,
                maxGuns: 0,
                guns: 0,
                defense: 500,
                maxDefense: 500,
                ideology: '地縁',
                skillName: SKILL_NAMES.PHOENIX
            };
        }
        // 今後別のスキルが追加されたら、ここに `else if` で足していけます
        return null;
    }

    // ＜諸勢力の旗揚げ判定＞
    static canKunishuRise(leader, castle, game) {
        if (!leader || !castle || castle.ownerClan !== 0) return { canRise: false };
        if (this.hasSkill(leader, SKILL_NAMES.PHOENIX, game)) {
            return {
                canRise: true,
                skillName: SKILL_NAMES.PHOENIX
            };
        }
        return { canRise: false };
    }
    
    // ==========================================
    // ★追加：AIの行動バリエーション拡張を一元管理する窓口
    // ==========================================
    // 武将の持つスキルによって、AIが指定の特別行動（暗殺など）を実行可能になるか判定します
    static hasAIExtendedAction(busho, actionType, game) {
        // 暗殺行動の場合、「謀将」「奥羽の驍将」「謀神」スキルを持っていれば許可します
        if (actionType === 'assassinate') {
            return this.hasSkill(busho, SKILL_NAMES.BOSHO, game) ||
                   this.hasSkill(busho, SKILL_NAMES.OU_NO_GYOSHO, game) ||
                   this.hasSkill(busho, SKILL_NAMES.BOSHIN, game);
        }
        
        // 将来、他の行動拡張が増えた場合はここに追記します
        return false;
    }

    // ==========================================
    // ★追加：計略コマンドのスキル補正を一元管理する共通窓口
    // ==========================================
    // 成功率のスキル補正をまとめて計算します
    static calcStrategyProbModifier(actionType, doer, targetCastleId, targetClanId, game) {
        let probBonus = 0;
        let probPenalty = 0;

        // 特定のスキルを持っているか（大名、国主、担当者）チェックする便利な魔法
        const checkSkill = (skillName) => {
            if (this.hasSkill(doer, skillName, game)) return true;
            const daimyo = game.bushos.find(b => b.clan === doer.clan && b.isDaimyo);
            if (daimyo && this.hasSkill(daimyo, skillName, game)) return true;
            const doerCastle = game.getCastle(doer.castleId);
            if (doerCastle && doerCastle.legionId !== 0) {
                const legion = game.legions ? game.legions.find(l => l.clanId === doer.clan && l.legionNo === doerCastle.legionId) : null;
                if (legion && legion.commanderId) {
                    const commander = game.getBusho(legion.commanderId);
                    if (commander && this.hasSkill(commander, skillName, game)) return true;
                }
            }
            return false;
        };

        // ① 実行者（攻撃側）のスキルボーナス
        if (actionType === 'sabotage' || actionType === 'incite') {
            probBonus += this.calcNinjutsuProbBonus(doer);
            // 謀神によるボーナス
            if (checkSkill(SKILL_NAMES.BOSHIN)) {
                probBonus += 0.10;
            }
        } else if (actionType === 'assassinate') {
            probBonus += this.getNinjutsuLevel(doer) * 0.02;
            
            // 暗殺の基本成功率アップ（同系統は最大値のみ）
            let assassinateBonus = 0;
            if (checkSkill(SKILL_NAMES.OU_NO_GYOSHO) || checkSkill(SKILL_NAMES.BOSHIN)) {
                assassinateBonus = Math.max(assassinateBonus, 0.08);
            }
            if (checkSkill(SKILL_NAMES.BOSHO)) {
                assassinateBonus = Math.max(assassinateBonus, 0.05);
            }
            probBonus += assassinateBonus;
            
        } else if (actionType === 'headhunt') {
            probBonus += this.calcHeadhuntProbBonus(doer, game);
        }

        // ② 対象の城（防御側）のスキルによる防諜ペナルティ
        if (actionType === 'sabotage' || actionType === 'incite' || actionType === 'rumor' || actionType === 'headhunt') {
            probPenalty += this.calcBugeiCounterIntelligenceBonus(targetCastleId, game);
        } else if (actionType === 'assassinate') {
            probPenalty += this.calcBugeiAssassinateDefense(targetCastleId, game);
            if (targetClanId) {
                probPenalty += this.calcNinjutsuAssassinateDefense(targetClanId, game);
            }
        }

        // ボーナスからペナルティを引いた、最終的な「増減値」を返します
        return probBonus - probPenalty;
    }
    
    // ダメージ（効果量）のスキル補正をまとめて計算します
    static calcStrategyDamageModifier(actionType, doer) {
        let damageBonus = 0;

        if (actionType === 'sabotage') {
            damageBonus += this.calcNinjutsuSabotageBonus(doer);
        } else if (actionType === 'incite') {
            damageBonus += this.calcNinjutsuInciteBonus(doer);
        }
        
        return damageBonus;
    }
    
    // ＜攻城戦計略ボーナス＞ 攻城戦での計略（火計・挑発）の成功率ボーナス
    static calcSiegeStrategyProbBonus(actionType, bushos, game) {
        if (!bushos || bushos.length === 0) return 0;
        let bonus = 0;
        let hasBoshin = bushos.some(b => b && b.skill && b.skill.includes(SKILL_NAMES.BOSHIN));
        if (hasBoshin) {
            if (actionType === 'fire') bonus += 0.15;
            if (actionType === 'provoke') bonus += 0.05;
        }
        return bonus;
    }

    // ＜敵クリティカル無効化＞ 野戦で相手のクリティカルを無効化する
    static canInvalidateEnemyCritical(unit, game) {
        return this.hasSkill(unit, SKILL_NAMES.OU_NO_GYOSHO, game);
    }
}