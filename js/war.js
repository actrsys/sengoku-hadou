/**
 * war.js
 * 戦争処理マネージャー & 戦争計算ロジック
 * 修正: 捕虜の処遇結果のアラートをカスタムダイアログ（showDialog）に置き換えました
 * 修正: 迎撃時の出陣兵士・兵糧の取得処理を修正（ID指定のオブジェクト構造に対応）
 * ★追加: 諸勢力の蜂起（反乱）・制圧時の特別な結末と、捕虜の特別ルールを追加しました
 * ★追加: 部隊分割時に兵科（troopType）の情報を保持・伝達するようにしました
 * ★修正: 大名死亡時の後継者選択で、一門・相性・年齢を優先するようにしました
 * ★追加: 既存の一門がいない場合、未登場の一門を強制的に元服させて後継者にする処理を追加しました
 */

window.WarParams = {
    Military: {
        DraftBase: 50, DraftStatBonus: 1.5, DraftPopBonusFactor: 0.00005, DraftFluctuation: 0.15,
        BaseTraining: 0, TrainingLdrEffect: 0.3, TrainingStrEffect: 0.2, TrainingFluctuation: 0.15,
        BaseMorale: 0, MoraleLdrEffect: 0.2, MoraleCharmEffect: 0.2, MoraleFluctuation: 0.2,
        WarMaxRounds: 10, DamageSoldierPower: 0.05, WallDefenseEffect: 0.5, DamageFluctuation: 0.2,
        FactionBonus: 1.1, FactionPenalty: 0.8
    },
    War: {
        ChargeMultiplier: 1.5, ChargeRisk: 1.8, ChargeSoldierDmgRate: 1.0, ChargeWallDmgRate: 0.1,
        BowMultiplier: 0.6, BowRisk: 0.5,
        SiegeMultiplier: 1.0, SiegeWallRate: 0.5, SiegeRisk: 10.0,
        DefChargeMultiplier: 1.2, DefChargeRisk: 2.0, DefBowMultiplier: 0.5, RojoDamageReduction: 0.7,
        CounterAtkPowerFactor: 0.05,
        RepairMaxSoldiers: 500, RepairSoldierFactor: 0.05, RepairMainPolFactor: 0.25, RepairSubPolFactor: 0.05, RepairGlobalMultiplier: 0.4,
        SchemeDamageFactor: 4, FireSuccessBase: 0.25, FireDamageFactor: 0.8,
        ShortWarTurnLimit: 5, BaseRecoveryRate: 0.2, RetreatRecoveryRate: 0.3, RetreatCaptureRate: 0.1, DaimyoCaptureReduction: 0.3,
        RetreatResourceLossFactor: 0.2, LootingBaseRate: 0.3, LootingCharmFactor: 0.002, DaimyoCharmWeight: 0.1,
        RiceConsumptionAtk: 0.05, RiceConsumptionDef: 0.025,
        BaseStat: 30, SubGeneralFactor: 0.2, MinDamage: 50,
        StatsLdrWeight: 1.2, StatsStrWeight: 0.3, StatsIntWeight: 0.5,
        MoraleBase: 50, SchemeBaseIntOffset: 20, LoyaltyDamageFactor: 500,
        AttackLoyaltyDecay: 50, AttackPopDecay: 500, WinStatIncrease: 5,
        CaptureChanceBase: 0.7, CaptureStrFactor: 0.002, PrisonerRecruitThreshold: 60
    }
};

class WarSystem {
    static calcUnitStats(bushos) { 
        const W = window.WarParams.War; const M = window.WarParams.Military; const baseStat = W.BaseStat || 30;
        if (!bushos || bushos.length === 0) return { ldr:baseStat, str:baseStat, int:baseStat, charm:baseStat }; 
        const leader = bushos[0]; const subs = bushos.slice(1); 
        let totalLdr = leader.leadership; let totalStr = leader.strength; let totalInt = leader.intelligence; 
        let factionBonusMultiplier = 1.0;
        if (subs.length > 0) {
            const leaderFaction = leader.getFactionName ? leader.getFactionName() : "中立";
            let sameFactionCount = 0; let oppFactionCount = 0; 
            const subFactor = W.SubGeneralFactor || 0.2;
            subs.forEach(b => { 
                totalLdr += b.leadership * subFactor; totalStr += b.strength * subFactor; totalInt += b.intelligence * subFactor; 
                const f = b.getFactionName ? b.getFactionName() : "中立";
                if (f === leaderFaction) sameFactionCount++;
                else if ((leaderFaction === "革新派" && f === "保守派") || (leaderFaction === "保守派" && f === "革新派")) oppFactionCount++;
            });
            if (oppFactionCount > 0) factionBonusMultiplier = M.FactionPenalty;
            else if (sameFactionCount === subs.length) factionBonusMultiplier = M.FactionBonus;
        }
        return { ldr: Math.floor(totalLdr * factionBonusMultiplier), str: Math.floor(totalStr * factionBonusMultiplier), int: Math.floor(totalInt * factionBonusMultiplier), charm: leader.charm }; 
    }

    static calcWarDamage(atkStats, defStats, atkSoldiers, defSoldiers, defWall, atkMorale, defTraining, type) {
        const M = window.WarParams.Military; const W = window.WarParams.War;
        const fluctuation = M.DamageFluctuation || 0.2;
        const rand = 1.0 - fluctuation + (Math.random() * fluctuation * 2);
        const moraleBonus = (atkMorale - (W.MoraleBase || 50)) / 100; 
        const trainingBonus = (defTraining - (W.MoraleBase || 50)) / 100;
        
        const atkPower = ((atkStats.ldr * (W.StatsLdrWeight || 1.2)) + (atkStats.str * (W.StatsStrWeight || 0.3)) + (atkSoldiers * M.DamageSoldierPower)) * (1.0 + moraleBonus);
        const defPower = ((defStats.ldr * 1.0) + (defStats.int * (W.StatsIntWeight || 0.5)) + (defWall * M.WallDefenseEffect) + (defSoldiers * M.DamageSoldierPower)) * (1.0 + trainingBonus);
        
        let multiplier = 1.0, soldierRate = 1.0, wallRate = 0.0, counterRisk = 1.0;
        switch(type) {
            case 'bow': multiplier = W.BowMultiplier; wallRate = 0.0; counterRisk = W.BowRisk; break;
            case 'siege': multiplier = W.SiegeMultiplier; soldierRate = 0.05; wallRate = W.SiegeWallRate; counterRisk = W.SiegeRisk; break;
            case 'charge': multiplier = W.ChargeMultiplier; soldierRate = W.ChargeSoldierDmgRate; wallRate = W.ChargeWallDmgRate; counterRisk = W.ChargeRisk; break;
            case 'def_bow': multiplier = W.DefBowMultiplier; wallRate = 0.0; break;
            case 'def_attack': multiplier = 0.0; wallRate = 0.0; break; 
            case 'def_charge': multiplier = W.DefChargeMultiplier; wallRate = 0.0; counterRisk = W.DefChargeRisk; break; 
        }
        
        const ratio = atkPower / (atkPower + defPower);
        let baseDmg = Math.max(W.MinDamage || 50, atkPower * ratio * multiplier * rand);
        
        // ★ここがゾンビアタック対策の追加部分です★
        // 攻撃側、守備側の兵士数がそれぞれ200人以下の時、ダメージを減らすための「弱体化パワー（ペナルティ）」を計算します。
        // 人数が少ないほど、2乗のカーブで急激に弱くなります。
        let atkPenalty = atkSoldiers <= 200 ? Math.pow(Math.max(0, atkSoldiers) / 200, 2) : 1.0;
        let defPenalty = defSoldiers <= 200 ? Math.pow(Math.max(0, defSoldiers) / 200, 2) : 1.0;

        // どっちが攻撃を仕掛けているかで、ペナルティを逆にします
        const activePenalty = type.startsWith('def_') ? defPenalty : atkPenalty;
        const passivePenalty = type.startsWith('def_') ? atkPenalty : defPenalty;
        
        let counterDmg = 0;
        if (counterRisk > 0 && type !== 'def_attack') {
            const opponentPower = type.startsWith('def_') ? atkPower : defPower;
            // 反撃ダメージにも、反撃する側の兵士数が少ない場合のペナルティを掛けます
            counterDmg = Math.floor(opponentPower * (W.CounterAtkPowerFactor !== undefined ? W.CounterAtkPowerFactor : 0.05) * counterRisk * passivePenalty);
        }
        
        return { 
            soldierDmg: Math.floor(baseDmg * soldierRate * activePenalty), 
            wallDmg: Math.floor(baseDmg * wallRate * 0.5 * activePenalty), 
            counterDmg: counterDmg 
        };
    }

    static calcScheme(atkBusho, defBusho, defCastleLoyalty) { 
        const successRate = (atkBusho.intelligence / ((defBusho ? defBusho.intelligence : 30) + (window.WarParams.War.SchemeBaseIntOffset || 20))) * (window.MainParams?.Strategy?.SchemeSuccessRate || 0.25); 
        if (Math.random() > successRate) return { success: false, damage: 0 }; 
        const loyaltyBonus = ((window.MainParams?.Economy?.MaxLoyalty || 100) - defCastleLoyalty) / (window.WarParams.War.LoyaltyDamageFactor || 50); 
        return { success: true, damage: Math.floor(atkBusho.intelligence * window.WarParams.War.SchemeDamageFactor * (1.0 + loyaltyBonus)) }; 
    }

    static calcFire(atkBusho, defBusho) { 
        if (Math.random() > (atkBusho.intelligence / ((defBusho ? defBusho.intelligence : 30) + 10)) * window.WarParams.War.FireSuccessBase) return { success: false, damage: 0 }; 
        return { success: true, damage: Math.floor(atkBusho.intelligence * window.WarParams.War.FireDamageFactor * (Math.random() + 0.5)) }; 
    }

    static calcRetreatScore(castle) { return castle.soldiers + (castle.defense * 0.5) + (castle.gold * 0.1) + (castle.rice * 0.1) + (castle.samuraiIds.length * 100); }

    static getWarAdvice(gunshi, state) {
        if (state.attacker.soldiers > state.defender.soldiers * 1.5) return Math.random() > 0.3 ? "我が軍が圧倒的です。一気に攻め落としましょう。" : "油断は禁物ですが、勝利は目前です。";
        else if (state.attacker.soldiers < state.defender.soldiers * 0.8) return "敵の兵数が勝っています。無理な突撃は控えるべきかと。";
        return "戦況は五分五分。敵の出方を見極めましょう。";
    }
}

class WarManager {
    constructor(game) { this.game = game; this.state = { active: false }; this.pendingPrisoners = []; }

    // ★追加：自分が操作できる部隊かどうかを判定する、便利なおまとめ魔法です！
    // 諸勢力（isKunishu, isKunishuForce）の場合は、プレイヤーの城から出てもAIにお任せするようにガードを追加しました。
    checkIsMyTurn(s) {
        const pid = Number(this.game.playerClanId);
        if (s.turn === 'attacker' && s.attacker && Number(s.attacker.ownerClan) === pid && s.sourceCastle && !s.sourceCastle.isDelegated && !s.attacker.isKunishu) return true;
        if (s.turn === 'attacker_self_reinf' && s.selfReinforcement && s.selfReinforcement.castle && Number(s.selfReinforcement.castle.ownerClan) === pid && !s.selfReinforcement.castle.isDelegated && !s.selfReinforcement.isKunishuForce) return true;
        if (s.turn === 'attacker_ally_reinf' && s.reinforcement && s.reinforcement.castle && Number(s.reinforcement.castle.ownerClan) === pid && !s.reinforcement.castle.isDelegated && !s.reinforcement.isKunishuForce) return true;
        if (s.turn === 'defender' && s.defender && Number(s.defender.ownerClan) === pid && !s.defender.isDelegated && !s.defender.isKunishu) return true;
        if (s.turn === 'defender_self_reinf' && s.defSelfReinforcement && s.defSelfReinforcement.castle && Number(s.defSelfReinforcement.castle.ownerClan) === pid && !s.defSelfReinforcement.castle.isDelegated && !s.defSelfReinforcement.isKunishuForce) return true;
        if (s.turn === 'defender_ally_reinf' && s.defReinforcement && s.defReinforcement.castle && Number(s.defReinforcement.castle.ownerClan) === pid && !s.defReinforcement.castle.isDelegated && !s.defReinforcement.isKunishuForce) return true;
        return false;
    }

    getAvailableCommands(isAtkTurn) {
        const s = this.state;
        if (!s.isPlayerInvolved) return [];
        
        // ★変更：おまとめ魔法を使ってチェックするようにしました！
        let isMyTurn = this.checkIsMyTurn(s);

        // 操作できない（同盟軍や委任の）場合は空っぽにします
        if (!isMyTurn) return [];
        
        const commands = [];
        if (s.turn.startsWith('attacker')) {
            commands.push({ label: "突撃", type: "charge" }, { label: "斉射", type: "bow" }, { label: "城攻め", type: "siege" }, { label: "火計", type: "fire" }, { label: "謀略", type: "scheme" });
            if (s.turn === 'attacker') commands.push({ label: "撤退", type: "retreat" }); // 撤退は本隊だけ！
        } else {
            commands.push({ label: "突撃", type: "def_charge" }, { label: "斉射", type: "def_bow" }, { label: "籠城", type: "def_attack" }, { label: "謀略", type: "scheme" }, { label: "補修", type: "repair_setup" }); 
            if (s.turn === 'defender' && this.game.castles.some(c => c.ownerClan === s.defender.ownerClan && c.id !== s.defender.id && GameSystem.isReachable(this.game, s.defender, c, s.defender.ownerClan))) commands.push({ label: "撤退", type: "retreat" }); // 撤退は本隊だけ！
        }
        return commands;
    }

    getGunshiAdvice(action) {
        if (action.type === 'war') return "合戦におもむきますか？ 兵力と兵糧の確認をお忘れなく。";
        if (this.state.active) { const gunshi = this.game.getClanGunshi(this.game.playerClanId); return gunshi ? WarSystem.getWarAdvice(gunshi, this.state) : null; }
        return null;
    }
    
    resolveAutoFieldWar() {
        const s = this.state; let safetyLimit = 20; let turn = 1;
        const atkStats = WarSystem.calcUnitStats(s.atkBushos); const defStats = WarSystem.calcUnitStats([s.defBusho]);
        const consumeRate = (window.WarParams.War.RiceConsumptionAtk || 0.1) * 0.5;

        // ★修正: 野戦は全員で一斉にぶつかるため、合算した兵士数を使います！
        let totalAtkSoldiers = s.atkAssignments ? s.atkAssignments.reduce((sum, a) => sum + a.soldiers, 0) : s.attacker.soldiers;
        let totalAtkRice = s.attacker.rice + (s.reinforcement ? s.reinforcement.rice : 0) + (s.selfReinforcement ? s.selfReinforcement.rice : 0);

        while (turn <= 20 && totalAtkSoldiers > 0 && s.defender.fieldSoldiers > 0 && safetyLimit > 0) {
            let resAtk = WarSystem.calcWarDamage(atkStats, defStats, totalAtkSoldiers, s.defender.fieldSoldiers, 0, s.attacker.morale, s.defender.training, 'charge');
            if (!s.isPlayerInvolved) { resAtk.soldierDmg = Math.floor(resAtk.soldierDmg * 0.333); resAtk.counterDmg = Math.floor(resAtk.counterDmg * 0.333); }
            
            let actDefDmg1 = Math.min(s.defender.fieldSoldiers, resAtk.soldierDmg);
            let actAtkDmg1 = Math.min(totalAtkSoldiers, resAtk.counterDmg);
            s.defender.fieldSoldiers -= actDefDmg1; 
            totalAtkSoldiers -= actAtkDmg1;
            s.deadSoldiers.defender += actDefDmg1;
            s.deadSoldiers.attacker += actAtkDmg1;

            if (s.defender.fieldSoldiers <= 0 || totalAtkSoldiers <= 0) break;
            
            let resDef = WarSystem.calcWarDamage(defStats, atkStats, s.defender.fieldSoldiers, totalAtkSoldiers, 0, s.defender.morale, s.attacker.training, 'charge');
            if (!s.isPlayerInvolved) { resDef.soldierDmg = Math.floor(resDef.soldierDmg * 0.333); resDef.counterDmg = Math.floor(resDef.counterDmg * 0.333); }
            
            let actAtkDmg2 = Math.min(totalAtkSoldiers, resDef.soldierDmg);
            let actDefDmg2 = Math.min(s.defender.fieldSoldiers, resDef.counterDmg);
            totalAtkSoldiers -= actAtkDmg2; 
            s.defender.fieldSoldiers -= actDefDmg2;
            s.deadSoldiers.attacker += actAtkDmg2;
            s.deadSoldiers.defender += actDefDmg2;
            
            totalAtkRice = Math.max(0, totalAtkRice - Math.floor(totalAtkSoldiers * consumeRate));
            s.defFieldRice = Math.max(0, s.defFieldRice - Math.floor(s.defender.fieldSoldiers * consumeRate)); 
            if (totalAtkRice <= 0 || s.defFieldRice <= 0 || totalAtkSoldiers < s.defender.fieldSoldiers * 0.2 || s.defender.fieldSoldiers < totalAtkSoldiers * 0.2) break;

            turn++; safetyLimit--;
        }

        const atkLost = totalAtkSoldiers <= 0 || totalAtkRice <= 0 || (totalAtkSoldiers < s.defender.fieldSoldiers * 0.2);
        const defLost = s.defender.fieldSoldiers <= 0 || s.defFieldRice <= 0 || (s.defender.fieldSoldiers < totalAtkSoldiers * 0.2);
        
        // ★修正: 生き残った割合を計算して、本隊・援軍それぞれの兵士数を減らします！
        const originalAtkSoldiers = s.atkAssignments ? s.atkAssignments.reduce((sum, a) => sum + a.soldiers, 0) : Math.max(1, s.attacker.soldiers);
        const atkSurviveRate = originalAtkSoldiers > 0 ? Math.max(0, totalAtkSoldiers) / originalAtkSoldiers : 0;
        
        s.attacker.soldiers = Math.floor(s.attacker.soldiers * atkSurviveRate);
        if (s.reinforcement) s.reinforcement.soldiers = Math.floor(s.reinforcement.soldiers * atkSurviveRate);
        if (s.selfReinforcement) s.selfReinforcement.soldiers = Math.floor(s.selfReinforcement.soldiers * atkSurviveRate);

        if (s.atkAssignments) {
            let atkHorses = 0, atkGuns = 0;
            s.atkAssignments.forEach(a => {
                a.soldiers = Math.floor(a.soldiers * atkSurviveRate);
                if (a.troopType === 'kiba') atkHorses += a.soldiers;
                if (a.troopType === 'teppo') atkGuns += a.soldiers;
            });
            s.attacker.horses = atkHorses;
            s.attacker.guns = atkGuns;
        }

        if (s.defAssignments) {
            const originalDefSoldiers = s.defAssignments.reduce((sum, a) => sum + a.soldiers, 0);
            const defSurviveRate = originalDefSoldiers > 0 ? Math.max(0, s.defender.fieldSoldiers) / originalDefSoldiers : 0;
            let defHorses = 0, defGuns = 0;
            s.defAssignments.forEach(a => {
                a.soldiers = Math.floor(a.soldiers * defSurviveRate);
                if (a.troopType === 'kiba') defHorses += a.soldiers;
                if (a.troopType === 'teppo') defGuns += a.soldiers;
            });
            s.defender.fieldHorses = defHorses;
            s.defender.fieldGuns = defGuns;
        }

        s.defender.soldiers += s.defender.fieldSoldiers;
        s.defender.rice += s.defFieldRice; 
        s.defender.horses = (s.defender.horses || 0) + (s.defender.fieldHorses || 0);
        s.defender.guns = (s.defender.guns || 0) + (s.defender.fieldGuns || 0);

        if (atkLost && !defLost) this.endWar(false); 
        else if (defLost && !atkLost) this.startSiegeWarPhase(); 
        else if (turn > 20) this.startSiegeWarPhase(); 
        else this.endWar(false);
    }

    startSiegeWarPhase() {
        const s = this.state; const W = window.WarParams.War;
        
        if (!s.isKunishuSubjugation) {
            const dropLoyalty = Math.floor(s.defender.peoplesLoyalty * 0.2);
            s.defender.peoplesLoyalty = Math.max(0, s.defender.peoplesLoyalty - dropLoyalty); 
            
            // ★変更: ここで全軍の合計数を計算してペナルティを出します！
            let totalAtkForPop = s.attacker.soldiers + (s.selfReinforcement ? s.selfReinforcement.soldiers : 0) + (s.reinforcement ? s.reinforcement.soldiers : 0);
            const dropPopulation = Math.floor(totalAtkForPop * 0.2);
            s.defender.population = Math.max(0, s.defender.population - dropPopulation);
        }
        
        if (s.isPlayerInvolved) { 
            this.game.ui.setWarModalVisible(true); this.game.ui.clearWarLog();
            
            if (window.AudioManager) {
                window.AudioManager.memorizeCurrentBgm(); 
                window.AudioManager.playBGM('07_Underworld dance.ogg'); 
            }
            
            setTimeout(() => {
                this.game.ui.log(`★ ${s.sourceCastle.name}軍が${s.defender.name}への攻城戦を開始！`);
                this.game.ui.updateWarUI(); this.processWarRound(); 
            }, 500); 
        } else { setTimeout(() => { this.resolveAutoWar(); }, 100); }
    }
    
    distributeDamage(isTargetDefSide, totalDamage) {
        const s = this.state;
        let targetArmies = [];
        const W = window.WarParams.War;
        
        // ★ここを追加！：作戦メモの準備（安全装置）
        s.plannedActions = s.plannedActions || {};
        
        // 生きている部隊だけをリストアップし、「役割（role）」の名前も一緒に覚えます！
        if (isTargetDefSide) {
            if (s.defender.soldiers > 0) targetArmies.push({ army: s.defender, role: 'defender' });
            if (s.defSelfReinforcement && s.defSelfReinforcement.soldiers > 0) targetArmies.push({ army: s.defSelfReinforcement, role: 'defender_self_reinf' });
            if (s.defReinforcement && s.defReinforcement.soldiers > 0) targetArmies.push({ army: s.defReinforcement, role: 'defender_ally_reinf' });
        } else {
            if (s.attacker.soldiers > 0) targetArmies.push({ army: s.attacker, role: 'attacker' });
            if (s.selfReinforcement && s.selfReinforcement.soldiers > 0) targetArmies.push({ army: s.selfReinforcement, role: 'attacker_self_reinf' });
            if (s.reinforcement && s.reinforcement.soldiers > 0) targetArmies.push({ army: s.reinforcement, role: 'attacker_ally_reinf' });
        }

        let actualTotalDmg = 0;
        let damageDetails = {}; // ★追加：誰がどれくらいダメージを受けたかを細かく記録する箱です！
        
        if (targetArmies.length > 0) {
            // 割り勘の基本ダメージ
            let dmgPerArmy = Math.floor(totalDamage / targetArmies.length);
            let unassignedDmg = 0; 
            
            targetArmies.forEach(target => {
                let army = target.army;
                let role = target.role;
                damageDetails[role] = 0; // まずは0で初期化します
                
                // ★ 個別の籠城判定！ 籠城のメモがある部隊だけ、受けるダメージを軽減します
                let isRojo = (isTargetDefSide && s.plannedActions[role] && s.plannedActions[role].type === 'def_attack');
                let finalDmg = isRojo ? Math.floor(dmgPerArmy * W.RojoDamageReduction) : dmgPerArmy;

                if (army.soldiers >= finalDmg) {
                    army.soldiers -= finalDmg;
                    actualTotalDmg += finalDmg;
                    damageDetails[role] += finalDmg; // 記録します
                } else {
                    let took = army.soldiers;
                    army.soldiers = 0;
                    actualTotalDmg += took;
                    damageDetails[role] += took; // 記録します
                    // 受けきれずにあふれたダメージを未割当に追加（計算用に元の分配量から引きます）
                    unassignedDmg += (dmgPerArmy - took); 
                }
            });
            
            // 割り切れなかった余りのダメージも足します
            unassignedDmg += (totalDamage % targetArmies.length);
            let aliveArmies = targetArmies.filter(a => a.army.soldiers > 0);
            
            // はみ出したダメージを、まだ生きている部隊に順番に配ります
            while (unassignedDmg > 0 && aliveArmies.length > 0) {
                let dmgSlice = Math.ceil(unassignedDmg / aliveArmies.length);
                let newlyDead = false;
                
                aliveArmies.forEach(target => {
                    if (unassignedDmg <= 0) return;
                    let army = target.army;
                    let role = target.role;
                    
                    let sliceToApply = Math.min(dmgSlice, unassignedDmg);
                    // 余りのダメージを配る時も、籠城している部隊はしっかりガードします
                    let isRojo = (isTargetDefSide && s.plannedActions[role] && s.plannedActions[role].type === 'def_attack');
                    let finalSlice = isRojo ? Math.floor(sliceToApply * W.RojoDamageReduction) : sliceToApply;
                    
                    if (army.soldiers >= finalSlice) {
                        army.soldiers -= finalSlice;
                        actualTotalDmg += finalSlice;
                        damageDetails[role] += finalSlice; // 記録します
                        unassignedDmg -= sliceToApply; // 軽減前のもとの値を引いて消費したことにする
                    } else {
                        let took = army.soldiers;
                        army.soldiers = 0;
                        actualTotalDmg += took;
                        damageDetails[role] += took; // 記録します
                        unassignedDmg -= sliceToApply; // 軽減前のもとの値を引いて消費したことにする
                        newlyDead = true;
                    }
                });
                
                if (newlyDead) aliveArmies = targetArmies.filter(a => a.army.soldiers > 0);
            }
        }
        
        // 最後に、負傷兵の箱にダメージ分を入れます
        if (isTargetDefSide) s.deadSoldiers.defender += actualTotalDmg;
        else s.deadSoldiers.attacker += actualTotalDmg;

        // ★変更：合計ダメージと、それぞれの部隊の内訳をセットで返します！
        return { total: actualTotalDmg, details: damageDetails };
    }
    
    resolveAutoWar() { 
        try { 
            const s = this.state;
            // ★変更: 委任城なら強制的に手動戦闘になるのを防ぎます！
            // ★修正：守備側が「諸勢力」の時は、プレイヤーの城であっても強制的に画面をスキップさせます！
            if (s.isPlayerInvolved || (!s.defender.isKunishu && Number(s.defender.ownerClan) === Number(this.game.playerClanId) && !s.defender.isDelegated)) {
                s.isPlayerInvolved = true; this.game.ui.setWarModalVisible(true); this.game.ui.updateWarUI(); this.processWarRound(); return;
            }

            // ★ここを追加！：AI自動戦闘の時も、エラーにならないように空の作戦メモを用意しておきます！
            s.plannedActions = s.plannedActions || {};

            let safetyLimit = 100;
            while(s.round <= window.WarParams.Military.WarMaxRounds && s.attacker.soldiers > 0 && s.defender.soldiers > 0 && s.defender.defense > 0 && safetyLimit > 0) { 
                this.resolveWarAction('charge'); 
                if (s.attacker.soldiers <= 0 || s.defender.soldiers <= 0) break; 
                s.attacker.rice = Math.max(0, s.attacker.rice - Math.floor(s.attacker.soldiers * window.WarParams.War.RiceConsumptionAtk));
                s.defender.rice = Math.max(0, s.defender.rice - Math.floor(s.defender.soldiers * window.WarParams.War.RiceConsumptionDef));
                if (s.attacker.rice <= 0 || s.defender.rice <= 0) break;
                safetyLimit--;
            } 
            
            // ★追加：オートバトルでも、城壁が壊れて落ちた場合は防御力を少し修復します！
            if (s.defender.defense <= 0) {
                s.defender.defense += 150;
                this.endWar(true);
            } else {
                this.endWar(s.defender.soldiers <= 0 || s.defender.rice <= 0); 
            }
        } catch(e) { console.error(e); this.endWar(false); } 
    }

    processWarRound() { 
        if (!this.state.active) return; 
        const s = this.state; 

        // s.phase がない、または 'init'（ラウンドの最初）の時の準備
        if (!s.phase || s.phase === 'init') {
            if (s.round > 1) {
                s.attacker.rice = Math.max(0, s.attacker.rice - Math.floor(s.attacker.soldiers * window.WarParams.War.RiceConsumptionAtk));
                if (s.selfReinforcement) s.selfReinforcement.rice = Math.max(0, s.selfReinforcement.rice - Math.floor(s.selfReinforcement.soldiers * window.WarParams.War.RiceConsumptionAtk));
                if (s.reinforcement) s.reinforcement.rice = Math.max(0, s.reinforcement.rice - Math.floor(s.reinforcement.soldiers * window.WarParams.War.RiceConsumptionAtk));

                s.defender.rice = Math.max(0, s.defender.rice - Math.floor(s.defender.soldiers * window.WarParams.War.RiceConsumptionDef));
                if (s.defSelfReinforcement) s.defSelfReinforcement.rice = Math.max(0, s.defSelfReinforcement.rice - Math.floor(s.defSelfReinforcement.soldiers * window.WarParams.War.RiceConsumptionDef));
                if (s.defReinforcement) s.defReinforcement.rice = Math.max(0, s.defReinforcement.rice - Math.floor(s.defReinforcement.soldiers * window.WarParams.War.RiceConsumptionDef));
            }

            if (s.defender.defense <= 0) { 
                // ★追加：城壁が壊れて落ちた場合、少しだけ城壁（防御力）を修復してあげます！
                s.defender.defense += 150; 
                this.endWar(true); 
                return; 
            } 
            if (s.defender.soldiers <= 0) { this.endWar(true); return; }
            if (s.attacker.soldiers <= 0) { this.endWar(false); return; } 
            
            if (s.attacker.rice <= 0) { if(s.isPlayerInvolved) this.game.ui.log("攻撃軍の兵糧が尽きました！"); this.endWar(false); return; }
            if (s.defender.rice <= 0) { if(s.isPlayerInvolved) this.game.ui.log("守備軍の兵糧が尽きました！"); this.endWar(true); return; }

            // みんなが作戦（コマンド）を決める順番のリストを作ります
            s.commandQueue = ['attacker'];
            if (s.selfReinforcement) s.commandQueue.push('attacker_self_reinf');
            if (s.reinforcement) s.commandQueue.push('attacker_ally_reinf');
            s.commandQueue.push('defender');
            if (s.defSelfReinforcement) s.commandQueue.push('defender_self_reinf');
            if (s.defReinforcement) s.commandQueue.push('defender_ally_reinf');

            s.plannedActions = {}; // 選んだ作戦をメモしておくノートです
            s.phase = 'command'; // ゲームの状態を「作戦を決めるフェーズ」にします
        }

        this.advanceWarTurn(); 
    }

    execWarCmd(type, extraVal = null) { 
        if (!this.state.active) return;
        if (this.state.phase !== 'command') return; // 作戦を決めるフェーズだけ動きます

        if (type === 'repair_setup') { 
            window.GameApp.ui.openQuantitySelector('war_repair', [this.state.defender], null); 
            return; 
        }
        
        const ctrl = document.getElementById('war-controls'); 
        if(ctrl) ctrl.classList.add('disabled-area'); 

        // すぐに実行せずに、予定メモに書き込んでおきます！
        this.state.plannedActions[this.state.turn] = { type: type, extraVal: extraVal };
        
        // 次の部隊の作戦決めへ進みます
        this.advanceWarTurn(); 
    }

    execWarAI() { 
        if (!this.state.active) return; 
        if (this.state.phase !== 'command') return;
        const s = this.state; 
        const isDefenderTurn = s.turn.startsWith('defender');

        let actor;
        let mySoldiers = 0;
        
        if (s.turn === 'attacker') { actor = s.atkBushos[0]; mySoldiers = s.attacker.soldiers; }
        else if (s.turn === 'attacker_self_reinf') { actor = s.selfReinforcement.bushos[0]; mySoldiers = s.selfReinforcement.soldiers; }
        else if (s.turn === 'attacker_ally_reinf') { actor = s.reinforcement.bushos[0]; mySoldiers = s.reinforcement.soldiers; }
        else if (s.turn === 'defender') { actor = s.defBusho; mySoldiers = s.defender.soldiers; }
        else if (s.turn === 'defender_self_reinf') { actor = s.defSelfReinforcement.bushos[0]; mySoldiers = s.defSelfReinforcement.soldiers; }
        else if (s.turn === 'defender_ally_reinf') { actor = s.defReinforcement.bushos[0]; mySoldiers = s.defReinforcement.soldiers; }

        let totalAtkSoldiers = s.attacker.soldiers + (s.selfReinforcement ? s.selfReinforcement.soldiers : 0) + (s.reinforcement ? s.reinforcement.soldiers : 0);
        let totalDefSoldiers = s.defender.soldiers + (s.defSelfReinforcement ? s.defSelfReinforcement.soldiers : 0) + (s.defReinforcement ? s.defReinforcement.soldiers : 0);

        let smartness = actor.intelligence / 100.0;
        if (window.AIParams.AI.Difficulty === 'hard') smartness = Math.min(1.0, smartness + 0.2);
        if (window.AIParams.AI.Difficulty === 'easy') smartness = Math.max(0.1, smartness - 0.2);

        let bestCmd = 'charge';
        let extraVal = null;

        if (isDefenderTurn) {
            if (s.turn === 'defender' && totalDefSoldiers / (totalAtkSoldiers + 1) < (0.2 + smartness * 0.2) && s.defender.defense < 200) { bestCmd = 'retreat'; }
            else if (s.defender.defense / (s.defender.maxDefense || 1000) < 0.2 && mySoldiers > 1000 && Math.random() < smartness) { bestCmd = 'repair'; extraVal = Math.min(mySoldiers, 100); }
        } else {
            if (s.turn === 'attacker') {
                if (s.attacker.rice < s.attacker.soldiers * 0.2 && totalAtkSoldiers < totalDefSoldiers * 0.5) { bestCmd = 'retreat'; }
                else if (totalAtkSoldiers < totalDefSoldiers * 0.3 && smartness > 0.5) { bestCmd = 'retreat'; }
            }
        }

        if (bestCmd === 'charge') { 
            const options = isDefenderTurn ? ['def_charge', 'def_bow', 'def_attack'] : ['charge', 'bow', 'siege'];
            if (actor.intelligence > 30) options.push('scheme');
            if (actor.intelligence > 50 && !isDefenderTurn) options.push('fire');

            bestCmd = options[0]; let bestScore = -Infinity; const W = window.WarParams.War;

            options.forEach(cmd => {
                let score = 0; let multiplier = 1.0; let risk = 1.0;
                if (cmd === 'charge') { multiplier = W.ChargeMultiplier; risk = W.ChargeRisk; }
                else if (cmd === 'bow') { multiplier = W.BowMultiplier; risk = W.BowRisk; }
                else if (cmd === 'siege') { multiplier = W.SiegeMultiplier; risk = W.SiegeRisk; }
                else if (cmd === 'def_charge') { multiplier = W.DefChargeMultiplier; risk = W.DefChargeRisk; }
                else if (cmd === 'def_bow') { multiplier = W.DefBowMultiplier; risk = 0.5; }
                else if (cmd === 'def_attack') { multiplier = 0; risk = 0; } 

                if (cmd === 'siege') score += (multiplier * 50) + (s.defender.defense > 0 ? 100 : 0);
                else if (cmd === 'def_attack') score += (totalDefSoldiers < totalAtkSoldiers) ? 200 : -100;
                else score += multiplier * 100;

                score -= (risk * 50 * smartness);
                if (cmd === 'scheme' || cmd === 'fire') score = ((actor.intelligence / 100) * 150) - (50 * smartness); 
                score += (Math.random() * 50) * (1.0 - smartness);
                if (score > bestScore) { bestScore = score; bestCmd = cmd; }
            });
        }

        // AIの行動も予定メモに書き込みます
        s.plannedActions[s.turn] = { type: bestCmd, extraVal: extraVal };
        this.advanceWarTurn(); 
    }
    
    resolveWarAction(type, extraVal = null) {
        if (!this.state.active) return;
        const s = this.state;

        // ★ここを追加！：万が一の時にもエラーで止まらないように安全装置をつけます
        s.plannedActions = s.plannedActions || {};

        let actionMessages = [];
        const pushMsg = (msg) => {
             if (s.isPlayerInvolved) {
                 actionMessages.push(msg);
                 if (typeof msg === 'string') this.game.ui.addWarDetailLog(msg);
                 else if (msg.log) this.game.ui.addWarDetailLog(msg.log);
             }
        };

        const executeNext = () => {
             // ★修正：メッセージを読み終わった後、防御が0になっていたら「残りの予定を全て消し飛ばして」すぐに勝敗をつける魔法です
             const doNext = () => {
                 if (s.defender.defense <= 0) {
                     // ★追加：城壁が壊れて落ちた場合、少しだけ城壁（防御力）を修復してあげます！
                     s.defender.defense += 150;
                     this.endWar(true);
                 } else if (s.defender.soldiers <= 0) {
                     this.endWar(true);
                 } else if (s.attacker.soldiers <= 0) {
                     this.endWar(false);
                 } else {
                     this.advanceWarTurn(); // まだ生きていれば次の部隊の行動へ進みます
                 }
             };

             if (s.isPlayerInvolved && actionMessages.length > 0) {
                 this.game.ui.showWarActionMessage(actionMessages, () => {
                     doNext();
                 });
             } else {
                 doNext();
             }
        };

        // 今の各部隊の「最新の兵士数」と「城の防御力」を調べる魔法です
        const getCurrentStats = () => {
            return {
                defSoldiers: s.defender.soldiers,
                defSelfSoldiers: s.defSelfReinforcement ? s.defSelfReinforcement.soldiers : 0,
                defAllySoldiers: s.defReinforcement ? s.defReinforcement.soldiers : 0,
                atkSoldiers: s.attacker.soldiers,
                atkSelfSoldiers: s.selfReinforcement ? s.selfReinforcement.soldiers : 0,
                atkAllySoldiers: s.reinforcement ? s.reinforcement.soldiers : 0,
                wallDefense: s.defender.defense
            };
        };

        // ★追加：どちらかが負けた時に、わかりやすい専用のメッセージを差し込む魔法です
        const checkDefeatAndPushMsg = () => {
            if (s.defender.defense <= 0) {
                pushMsg({ text: `<span style="color:#d32f2f; font-size:1.2rem; font-weight:bold;">城の防御が０になった！<br>城は陥落した！</span>`, log: `城防御が0になり、陥落した！` });
            } else if (s.defender.soldiers <= 0) {
                pushMsg({ text: `<span style="color:#d32f2f; font-size:1.2rem; font-weight:bold;">守備本隊が全滅した！<br>城は陥落した！</span>`, log: `守備本隊が全滅し、陥落した！` });
            } else if (s.attacker.soldiers <= 0) {
                pushMsg({ text: `<span style="color:#1976d2; font-size:1.2rem; font-weight:bold;">攻撃本隊が全滅した！<br>守備軍が防ぎ切った！</span>`, log: `攻撃本隊が全滅し、退却した！` });
            }
        };

        if (type === 'retreat') { 
            if (s.turn === 'attacker') { 
                this.endWar(false, true); 
            } else if (s.turn === 'defender') { 
                this.executeRetreatLogic(s.defender); 
            } else if (['attacker_self_reinf', 'attacker_ally_reinf', 'defender_self_reinf', 'defender_ally_reinf'].includes(s.turn)) {
                let reinfKey = '';
                let activeArmyName = "";
                
                if (s.turn === 'attacker_self_reinf') { reinfKey = 'selfReinforcement'; activeArmyName = "攻撃側自家援軍"; }
                else if (s.turn === 'attacker_ally_reinf') { reinfKey = 'reinforcement'; activeArmyName = "攻撃側同盟軍"; }
                else if (s.turn === 'defender_self_reinf') { reinfKey = 'defSelfReinforcement'; activeArmyName = "守備側自家援軍"; }
                else if (s.turn === 'defender_ally_reinf') { reinfKey = 'defReinforcement'; activeArmyName = "守備側同盟軍"; }
                
                pushMsg(`R${s.round} [${activeArmyName}] は戦場から離脱し、撤退した！`);
                
                if (typeof this.retreatReinforcementForce === 'function') {
                    this.retreatReinforcementForce(reinfKey);
                }
                executeNext();
            }
            return; 
        }
        
        const isAtkTurnGroup = s.turn.startsWith('attacker');
        
        let activeBushos, activeSoldiers, activeMorale, activeTraining, activeArmyName;
        if (s.turn === 'attacker') { activeBushos = s.atkBushos; activeSoldiers = s.attacker.soldiers; activeMorale = s.attacker.morale; activeTraining = s.attacker.training; activeArmyName = "攻撃本隊"; }
        else if (s.turn === 'attacker_self_reinf') { activeBushos = s.selfReinforcement.bushos; activeSoldiers = s.selfReinforcement.soldiers; activeMorale = s.attacker.morale; activeTraining = s.attacker.training; activeArmyName = "攻撃側自家援軍"; }
        else if (s.turn === 'attacker_ally_reinf') { activeBushos = s.reinforcement.bushos; activeSoldiers = s.reinforcement.soldiers; activeMorale = s.attacker.morale; activeTraining = s.attacker.training; activeArmyName = "攻撃側同盟軍"; }
        else if (s.turn === 'defender') { activeBushos = [s.defBusho]; activeSoldiers = s.defender.soldiers; activeMorale = s.defender.morale; activeTraining = s.defender.training; activeArmyName = "守備本隊"; }
        else if (s.turn === 'defender_self_reinf') { activeBushos = s.defSelfReinforcement.bushos; activeSoldiers = s.defSelfReinforcement.soldiers; activeMorale = s.defender.morale; activeTraining = s.defender.training; activeArmyName = "守備側自家援軍"; }
        else if (s.turn === 'defender_ally_reinf') { activeBushos = s.defReinforcement.bushos; activeSoldiers = s.defReinforcement.soldiers; activeMorale = s.defender.morale; activeTraining = s.defender.training; activeArmyName = "守備側同盟軍"; }

        let targetBushos, targetSoldiers = 0, targetMorale, targetTraining;
        
        if (isAtkTurnGroup) { 
            targetBushos = [s.defBusho]; 
            targetMorale = s.defender.morale; 
            targetTraining = s.defender.training;
            if (s.defender.soldiers > 0) targetSoldiers += s.defender.soldiers;
            if (s.defSelfReinforcement && s.defSelfReinforcement.soldiers > 0) targetSoldiers += s.defSelfReinforcement.soldiers;
            if (s.defReinforcement && s.defReinforcement.soldiers > 0) targetSoldiers += s.defReinforcement.soldiers;
        } else { 
            targetBushos = s.atkBushos; 
            targetMorale = s.attacker.morale; 
            targetTraining = s.attacker.training;
            if (s.attacker.soldiers > 0) targetSoldiers += s.attacker.soldiers;
            if (s.selfReinforcement && s.selfReinforcement.soldiers > 0) targetSoldiers += s.selfReinforcement.soldiers;
            if (s.reinforcement && s.reinforcement.soldiers > 0) targetSoldiers += s.reinforcement.soldiers;
        }

        let actStats = WarSystem.calcUnitStats(activeBushos); 
        let tgtStats = WarSystem.calcUnitStats(targetBushos);
        
        if (type === 'def_attack') { 
             pushMsg(`R${s.round} [${activeArmyName}] 籠城し、守りを固めている！`);
             executeNext(); return;
        }
        if (type === 'repair') { 
             const soldierCost = extraVal || 50; 
             if (activeSoldiers > soldierCost) {
                 const W = window.WarParams.War; 
                 if (s.turn === 'defender') s.defender.soldiers -= soldierCost;
                 else if (s.turn === 'defender_self_reinf') s.defSelfReinforcement.soldiers -= soldierCost;
                 else if (s.turn === 'defender_ally_reinf') s.defReinforcement.soldiers -= soldierCost;

                 const polList = activeBushos.map(b => b.politics).sort((a,b) => b - a);
                 const maxPol = polList.length > 0 ? polList[0] : 0;
                 let subPolSum = 0; for(let i=1; i<polList.length; i++) subPolSum += polList[i];
                 let recover = Math.floor(((soldierCost * W.RepairSoldierFactor) + (maxPol * W.RepairMainPolFactor) + (subPolSum * W.RepairSubPolFactor)) * W.RepairGlobalMultiplier);
                 s.defender.defense += recover;
                 
                 pushMsg(`R${s.round} [${activeArmyName}] の補修！`);
                 
                 // ★修正：回復アニメーションを流して、最新のステータスを渡すお手紙です！
                 pushMsg({ 
                     type: 'recover', 
                     targetRole: s.turn, 
                     soldierCost: soldierCost, 
                     wallRecover: recover, 
                     se: 'decision.ogg', // 補修の時も音を鳴らします
                     currentStats: getCurrentStats() 
                 });

                 pushMsg({ text: `城を修復した！ (兵-${soldierCost} 防+${recover})`, log: `R${s.round} [${activeArmyName}] 補修を実行！ (兵-${soldierCost} 防+${recover})`});
             } else { 
                 pushMsg(`R${s.round} [${activeArmyName}] 補修しようとしたが兵が足りない！`); 
             }
             executeNext(); return;
        }

        if (type === 'scheme') {
            const result = WarSystem.calcScheme(activeBushos[0], targetBushos[0], isAtkTurnGroup ? s.defender.peoplesLoyalty : (window.MainParams?.Economy?.MaxLoyalty || 100));
            if (!result.success) { 
                 let failMsg = `R${s.round} [${activeArmyName}] 謀略失敗！`;
                 pushMsg({ text: failMsg, log: failMsg, se: 'miss.ogg' }); 
            } else {
                pushMsg(`R${s.round} [${activeArmyName}] の謀略！`);
                let calcDamage = s.isPlayerInvolved ? result.damage : Math.floor(result.damage * 0.333);
                
                let dmgResult = this.distributeDamage(isAtkTurnGroup, calcDamage);
                let actualDamage = dmgResult.total;
                
                pushMsg({ type: 'damage', target: isAtkTurnGroup ? 'defender' : 'attacker', soldierDmgDetails: dmgResult.details, se: 'slash.ogg', currentStats: getCurrentStats() });
                pushMsg({ text: `敵軍に計${actualDamage}の被害を与えた！`, log: `R${s.round} [${activeArmyName}] 謀略成功！ 敵軍に計${actualDamage}の被害`});
                checkDefeatAndPushMsg(); // ★負けたかチェック
            }
            executeNext(); return;
        }

        if (type === 'fire') {
            const result = WarSystem.calcFire(activeBushos[0], targetBushos[0]);
            if (!result.success) { 
                 let failMsg = `R${s.round} [${activeArmyName}] 火攻失敗！`;
                 pushMsg({ text: failMsg, log: failMsg, se: 'miss.ogg' }); 
            } else {
                pushMsg(`R${s.round} [${activeArmyName}] の火攻め！`);
                let calcDamage = s.isPlayerInvolved ? result.damage : Math.floor(result.damage * 0.333);
                let calcDefSoldierDamage = s.isPlayerInvolved ? 50 : 16;
                if(isAtkTurnGroup) {
                    s.defender.defense = Math.max(0, s.defender.defense - calcDamage);
                    pushMsg({ type: 'damage', target: 'defender', wallDmg: calcDamage, se: 'fire001.mp3', currentStats: getCurrentStats() });
                    pushMsg({ text: `敵防御に${calcDamage}の被害を与えた！`, log: `R${s.round} [${activeArmyName}] 火攻成功！ 敵防御に${calcDamage}の被害`});
                    checkDefeatAndPushMsg(); // ★負けたかチェック
                } else {
                    let dmgResult = this.distributeDamage(isAtkTurnGroup, calcDefSoldierDamage);
                    let actualDamage = dmgResult.total;
                    
                    pushMsg({ type: 'damage', target: 'attacker', soldierDmgDetails: dmgResult.details, se: 'fire001.mp3', currentStats: getCurrentStats() });
                    pushMsg({ text: `敵軍に計${actualDamage}の被害を与えた！`, log: `R${s.round} [${activeArmyName}] 火攻成功！ 敵軍に計${actualDamage}の被害`});
                    checkDefeatAndPushMsg(); // ★負けたかチェック
                }
            }
            executeNext(); return;
        }
        
        let atkStatsParam = isAtkTurnGroup ? actStats : tgtStats;
        let defStatsParam = isAtkTurnGroup ? tgtStats : actStats;
        let atkSoldiersParam = isAtkTurnGroup ? activeSoldiers : targetSoldiers;
        let defSoldiersParam = isAtkTurnGroup ? targetSoldiers : activeSoldiers;
        let atkMoraleParam = isAtkTurnGroup ? activeMorale : targetMorale;
        let defTrainingParam = isAtkTurnGroup ? targetTraining : activeTraining;

        const result = WarSystem.calcWarDamage(atkStatsParam, defStatsParam, atkSoldiersParam, defSoldiersParam, s.defender.defense, atkMoraleParam, defTrainingParam, type);
        let calculatedSoldierDmg = result.soldierDmg; let calculatedWallDmg = result.wallDmg; let calculatedCounterDmg = result.counterDmg;

        if (!s.isPlayerInvolved) {
            calculatedSoldierDmg = Math.floor(calculatedSoldierDmg * 0.333); calculatedWallDmg = Math.floor(calculatedWallDmg * 0.333); calculatedCounterDmg = Math.floor(calculatedCounterDmg * 0.333);
        }

        if (isAtkTurnGroup) {
            const hasRojo = ['defender', 'defender_self_reinf', 'defender_ally_reinf'].some(role => {
                const plan = s.plannedActions[role];
                return plan && plan.type === 'def_attack';
            });
            
            if (hasRojo) {
                 calculatedWallDmg = Math.floor(calculatedWallDmg * window.WarParams.War.RojoDamageReduction);
                 pushMsg(`(守備軍の籠城により城壁の被害軽減)`);
            }
        }

        let dmgResult = this.distributeDamage(isAtkTurnGroup, calculatedSoldierDmg);
        let actualSoldierDmg = dmgResult.total;
        
        if(isAtkTurnGroup) { s.defender.defense = Math.max(0, s.defender.defense - calculatedWallDmg); } 
        
        let actualCounterDmg = 0;
        if(calculatedCounterDmg > 0) { 
            actualCounterDmg = Math.min(activeSoldiers, calculatedCounterDmg);
            if (s.turn === 'attacker') s.attacker.soldiers -= actualCounterDmg;
            else if (s.turn === 'attacker_self_reinf') s.selfReinforcement.soldiers -= actualCounterDmg;
            else if (s.turn === 'attacker_ally_reinf') s.reinforcement.soldiers -= actualCounterDmg;
            else if (s.turn === 'defender') s.defender.soldiers -= actualCounterDmg;
            else if (s.turn === 'defender_self_reinf') s.defSelfReinforcement.soldiers -= actualCounterDmg;
            else if (s.turn === 'defender_ally_reinf') s.defReinforcement.soldiers -= actualCounterDmg;

            if(isAtkTurnGroup) s.deadSoldiers.attacker += actualCounterDmg; else s.deadSoldiers.defender += actualCounterDmg;
        }
        
        let actionName = type.includes('bow') ? "弓攻撃" : type.includes('siege') ? "城攻め" : "力攻め"; 
        if (type.includes('def_')) actionName = type === 'def_bow' ? "斉射" : type === 'def_charge' ? "突撃" : "反撃"; 
        
        pushMsg(`R${s.round} [${activeArmyName}] の${actionName}！`);
        
        pushMsg({
            type: 'damage',
            target: isAtkTurnGroup ? 'defender' : 'attacker',
            soldierDmgDetails: dmgResult.details,
            wallDmg: calculatedWallDmg,
            counterTarget: s.turn,
            counterDmg: actualCounterDmg,
            se: 'damage001.ogg',
            currentStats: getCurrentStats()
        });
        
        let resultMsg = `敵軍に 計${actualSoldierDmg}の被害`; 
        if (calculatedWallDmg > 0) resultMsg += ` (防-${calculatedWallDmg})`;
        resultMsg += ` を与えた！`;
        if (actualCounterDmg > 0) resultMsg += `<br>（反撃を受け 兵-${actualCounterDmg}）`;
        
        pushMsg({ text: resultMsg, log: `R${s.round} [${activeArmyName}] ${resultMsg.replace('<br>', ' ')}` });

        checkDefeatAndPushMsg(); // ★負けたかチェック
        executeNext();
    }

    advanceWarTurn() { 
        if (!this.state.active) return;
        const s = this.state; 

        // 【１】作戦を決めるフェーズ
        if (s.phase === 'command') {
            if (s.commandQueue.length > 0) {
                // 次に作戦を決める人を取り出します
                s.turn = s.commandQueue.shift(); 
                
                this.game.ui.updateWarUI(); 
                const isAtkSideTurn = s.turn.startsWith('attacker');
                this.game.ui.renderWarControls(isAtkSideTurn); 

                // プレイヤーが操作できる部隊かどうかチェック
                // ★変更：ここでも先ほど作った「おまとめ魔法」を使うようにしました！
                let isMyTurn = this.checkIsMyTurn(s);

                if (!isMyTurn) {
                    setTimeout(() => this.execWarAI(), 800); 
                }
            } else {
                // 全員が作戦を決め終わったら、【実行（アクション）フェーズ】へ！
                s.phase = 'action';
                s.actionQueue = [];
                
                // ★追加：籠城を選んだ守備軍を、一番最初に行動（準備）するように特別扱いします！
                // 順番はご指定の通り「守備側 → 守備側援軍 → 守備側同盟軍」です。
                const defRoles = ['defender', 'defender_self_reinf', 'defender_ally_reinf'];
                defRoles.forEach(role => {
                    if (s.plannedActions[role] && s.plannedActions[role].type === 'def_attack') {
                        s.actionQueue.push(role);
                    }
                });

                // ★追加：残りの部隊を、いつもの「攻撃→守備→援軍…」の順番で並べます！
                const normalOrder = [
                    'attacker', 'defender', 
                    'attacker_self_reinf', 'defender_self_reinf', 
                    'attacker_ally_reinf', 'defender_ally_reinf'
                ];
                normalOrder.forEach(role => {
                    // まだリストに入っていない（籠城以外を選んだ）部隊だけを追加します
                    if (s.plannedActions[role] && !s.actionQueue.includes(role)) {
                        s.actionQueue.push(role);
                    }
                });
                
                this.advanceWarTurn();
            }
            
        // 【２】実行（アクション）フェーズ
        } else if (s.phase === 'action') {
            if (s.actionQueue.length > 0) {
                // 次に攻撃（実行）する人
                s.turn = s.actionQueue.shift(); 
                const action = s.plannedActions[s.turn];
                
                // もし実行する前にやられて（兵士ゼロに）しまっていたら、行動はスキップ！
                let isDead = false;
                if (s.turn === 'attacker' && s.attacker.soldiers <= 0) isDead = true;
                else if (s.turn === 'attacker_self_reinf' && s.selfReinforcement.soldiers <= 0) isDead = true;
                else if (s.turn === 'attacker_ally_reinf' && s.reinforcement.soldiers <= 0) isDead = true;
                else if (s.turn === 'defender' && s.defender.soldiers <= 0) isDead = true;
                else if (s.turn === 'defender_self_reinf' && s.defSelfReinforcement.soldiers <= 0) isDead = true;
                else if (s.turn === 'defender_ally_reinf' && s.defReinforcement.soldiers <= 0) isDead = true;
                
                if (isDead || !action) {
                    this.advanceWarTurn();
                } else {
                    // 少し間をあけて（演出を見やすくして）実行します
                    setTimeout(() => {
                        this.resolveWarAction(action.type, action.extraVal);
                    }, 800);
                }
            } else {
                // 全員の行動が終わったら、ラウンドを1つ進めます
                s.phase = 'init';
                s.round++;
                if(s.round > window.WarParams.Military.WarMaxRounds) { this.endWar(false); return; } 
                this.processWarRound();
            }
        }
    }
    
}