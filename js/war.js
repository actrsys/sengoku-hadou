/**
 * war.js
 * 戦争処理マネージャー & 戦争計算ロジック
 */

window.WarParams = {
    Military: {
        DraftBase: 50, DraftStatBonus: 1.5, DraftPopBonusFactor: 0.00005, DraftFluctuation: 0.15,
        BaseTraining: 0, TrainingLdrEffect: 0.3, TrainingStrEffect: 0.2, TrainingFluctuation: 0.15,
        BaseMorale: 0, MoraleLdrEffect: 0.2, MoraleCharmEffect: 0.2, MoraleFluctuation: 0.2,
        WarMaxRounds: 15, DamageSoldierPower: 0.05, WallDefenseEffect: 0.5, DamageFluctuation: 0.2,
        FactionBonus: 1.1, FactionPenalty: 0.8
    },
    War: {
        ChargeMultiplier: 1.5, ChargeRisk: 1.8, ChargeSoldierDmgRate: 1.0, ChargeWallDmgRate: 0.1,
        BowMultiplier: 0.6, BowRisk: 0.5,
        SiegeMultiplier: 1.0, SiegeWallRate: 0.5, SiegeRisk: 10.0,
        DefChargeMultiplier: 1.2, DefChargeRisk: 2.0, DefBowMultiplier: 0.5, RojoDamageReduction: 0.7,
        CounterAtkPowerFactor: 0.05,
        FireSuccessBase: 0.25, FireDamageFactor: 0.8,
        ShortWarTurnLimit: 5, BaseRecoveryRate: 0.2, RetreatRecoveryRate: 0.3, RetreatCaptureRate: 0.1, DaimyoCaptureReduction: 0.3,
        RetreatResourceLossFactor: 0.2, LootingBaseRate: 0.3, LootingCharmFactor: 0.002, DaimyoCharmWeight: 0.1,
        RiceConsumptionAtk: 0.05, RiceConsumptionDef: 0.05,
        BaseStat: 30, SubGeneralFactor: 0.2, MinDamage: 50,
        StatsLdrWeight: 1.2, StatsStrWeight: 0.3, StatsIntWeight: 0.5,
        MoraleBase: 50, LoyaltyDamageFactor: 500,
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
        if (subs.length > 0) {
            const subFactor = W.SubGeneralFactor || 0.2;
            subs.forEach(b => { 
                totalLdr += b.leadership * subFactor; totalStr += b.strength * subFactor; totalInt += b.intelligence * subFactor; 
            });
        }
        return { ldr: Math.floor(totalLdr), str: Math.floor(totalStr), int: Math.floor(totalInt), charm: leader.charm }; 
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
        
        let counterDmg = 0;
        if (counterRisk > 0 && type !== 'def_attack') {
            const opponentPower = type.startsWith('def_') ? atkPower : defPower;
            counterDmg = Math.floor(opponentPower * (W.CounterAtkPowerFactor !== undefined ? W.CounterAtkPowerFactor : 0.05) * counterRisk);
        }
        
        return { 
            soldierDmg: Math.floor(baseDmg * soldierRate), 
            wallDmg: Math.floor(baseDmg * wallRate * 0.5), 
            counterDmg: counterDmg 
        };
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

    // ★追加：部隊のデータ（兵士数や士気など）をまとめて取り出す、便利なおまとめ魔法です！
    getArmyData(role) {
        const s = this.state;
        if (role === 'attacker') return { army: s.attacker, bushos: s.atkBushos, soldiers: s.attacker ? s.attacker.soldiers : 0, morale: s.attacker ? s.attacker.morale ?? 50 : 50, training: s.attacker ? s.attacker.training ?? 50 : 50 };
        if (role === 'attacker_self_reinf') return { army: s.selfReinforcement, bushos: s.selfReinforcement ? s.selfReinforcement.bushos : [], soldiers: s.selfReinforcement ? s.selfReinforcement.soldiers : 0, morale: s.selfReinforcement ? s.selfReinforcement.morale ?? 50 : 50, training: s.selfReinforcement ? s.selfReinforcement.training ?? 50 : 50 };
        if (role === 'attacker_ally_reinf') return { army: s.reinforcement, bushos: s.reinforcement ? s.reinforcement.bushos : [], soldiers: s.reinforcement ? s.reinforcement.soldiers : 0, morale: s.reinforcement ? s.reinforcement.morale ?? 50 : 50, training: s.reinforcement ? s.reinforcement.training ?? 50 : 50 };
        if (role === 'defender') return { army: s.defender, bushos: s.defBusho ? [s.defBusho] : [], soldiers: s.defender ? s.defender.soldiers : 0, morale: s.defender ? s.defender.morale ?? 50 : 50, training: s.defender ? s.defender.training ?? 50 : 50 };
        if (role === 'defender_self_reinf') return { army: s.defSelfReinforcement, bushos: s.defSelfReinforcement ? s.defSelfReinforcement.bushos : [], soldiers: s.defSelfReinforcement ? s.defSelfReinforcement.soldiers : 0, morale: s.defSelfReinforcement ? s.defSelfReinforcement.morale ?? 50 : 50, training: s.defSelfReinforcement ? s.defSelfReinforcement.training ?? 50 : 50 };
        if (role === 'defender_ally_reinf') return { army: s.defReinforcement, bushos: s.defReinforcement ? s.defReinforcement.bushos : [], soldiers: s.defReinforcement ? s.defReinforcement.soldiers : 0, morale: s.defReinforcement ? s.defReinforcement.morale ?? 50 : 50, training: s.defReinforcement ? s.defReinforcement.training ?? 50 : 50 };
        return { army: null, bushos: [], soldiers: 0, morale: 50, training: 50 };
    }

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
            commands.push({ label: "突撃", type: "charge" }, { label: "斉射", type: "bow" }, { label: "破壊", type: "siege" }, { label: "火計", type: "fire" }, { label: "鼓舞", type: "inspire" });
            if (s.turn === 'attacker') commands.push({ label: "撤退", type: "retreat" });
        } else {
            commands.push({ label: "突撃", type: "def_charge" }, { label: "斉射", type: "def_bow" }, { label: "籠城", type: "def_attack" }, { label: "挑発", type: "provoke" }, { label: "鼓舞", type: "def_inspire" }); 
            // ★修正：中立の空き城（ownerClanが0）の守備軍は、撤退コマンドを選べないようにします！
            if (s.turn === 'defender' && s.defender.ownerClan !== 0 && this.game.castles.some(c => c.ownerClan === s.defender.ownerClan && c.id !== s.defender.id && GameSystem.isReachable(this.game, s.defender, c, s.defender.ownerClan))) commands.push({ label: "撤退", type: "retreat" });
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
            // ★追加：野戦（自動）の毎ターン開始時に経験値を加算します
            const isIntTurn = (turn % 2 === 1);
            const addExp = (bushos) => {
                if (!bushos) return;
                bushos.forEach(b => {
                    if (b && b.id && String(b.id).indexOf('dummy') === -1) {
                        b.expLeadership = (b.expLeadership || 0) + 1;
                        b.expStrength = (b.expStrength || 0) + 1;
                        if (isIntTurn) b.expIntelligence = (b.expIntelligence || 0) + 1;
                    }
                });
            };
            if (s.atkAssignments) s.atkAssignments.forEach(a => { if (a.soldiers > 0) addExp([a.busho]); });
            else if (s.atkBushos) addExp(s.atkBushos);

            if (s.defAssignments) s.defAssignments.forEach(a => { if (a.soldiers > 0) addExp([a.busho]); });
            else if (s.defBusho) addExp([s.defBusho]);

            let resAtk = WarSystem.calcWarDamage(atkStats, defStats, totalAtkSoldiers, s.defender.fieldSoldiers, 0, s.attacker.morale, s.defender.training, 'charge');
            if (!s.isPlayerInvolved) { resAtk.soldierDmg = Math.floor(resAtk.soldierDmg * 0.666); resAtk.counterDmg = Math.floor(resAtk.counterDmg * 0.666); }
            
            let actDefDmg1 = Math.min(s.defender.fieldSoldiers, resAtk.soldierDmg);
            let actAtkDmg1 = Math.min(totalAtkSoldiers, resAtk.counterDmg);
            s.defender.fieldSoldiers -= actDefDmg1; 
            totalAtkSoldiers -= actAtkDmg1;
            s.deadSoldiers.defender += actDefDmg1;
            s.deadSoldiers.attacker += actAtkDmg1;

            if (s.defender.fieldSoldiers <= 0 || totalAtkSoldiers <= 0) break;
            
            let resDef = WarSystem.calcWarDamage(defStats, atkStats, s.defender.fieldSoldiers, totalAtkSoldiers, 0, s.defender.morale, s.attacker.training, 'charge');
            if (!s.isPlayerInvolved) { resDef.soldierDmg = Math.floor(resDef.soldierDmg * 0.666); resDef.counterDmg = Math.floor(resDef.counterDmg * 0.666); }
            
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
            const atkDead = originalAtkSoldiers - Math.max(0, totalAtkSoldiers);
            const horseEquipRate = Math.min(1.0, (s.attacker.horses || 0) / Math.max(1, originalAtkSoldiers));
            const gunEquipRate = Math.min(1.0, (s.attacker.guns || 0) / Math.max(1, originalAtkSoldiers));

            s.atkAssignments.forEach(a => {
                a.soldiers = Math.floor(a.soldiers * atkSurviveRate);
            });
            s.attacker.horses = Math.max(0, (s.attacker.horses || 0) - Math.floor(atkDead * horseEquipRate));
            s.attacker.guns = Math.max(0, (s.attacker.guns || 0) - Math.floor(atkDead * gunEquipRate));
        }

        if (s.defAssignments) {
            const originalDefSoldiers = s.defAssignments.reduce((sum, a) => sum + a.soldiers, 0);
            const defSurviveRate = originalDefSoldiers > 0 ? Math.max(0, s.defender.fieldSoldiers) / originalDefSoldiers : 0;
            const defDead = originalDefSoldiers - Math.max(0, s.defender.fieldSoldiers);
            const horseEquipRate = Math.min(1.0, (s.defender.fieldHorses || 0) / Math.max(1, originalDefSoldiers));
            const gunEquipRate = Math.min(1.0, (s.defender.fieldGuns || 0) / Math.max(1, originalDefSoldiers));

            s.defAssignments.forEach(a => {
                a.soldiers = Math.floor(a.soldiers * defSurviveRate);
            });
            s.defender.fieldHorses = Math.max(0, (s.defender.fieldHorses || 0) - Math.floor(defDead * horseEquipRate));
            s.defender.fieldGuns = Math.max(0, (s.defender.fieldGuns || 0) - Math.floor(defDead * gunEquipRate));
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
                
                // 新しい計算式ですでに籠城の半減は終わっているので、ここではそのままダメージを受けます！
                let finalDmg = dmgPerArmy;

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
                    // 余りのダメージも、計算済みなのでそのまま受けます！
                    let finalSlice = sliceToApply;
                    
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

            // ★ここを大改造！：AI同士のオートバトルでも、プレイヤー用と同じように頭を使った攻城戦をやらせます！
            s.isPlayerInvolved = false; // 裏側でやるという印です
            s.plannedActions = s.plannedActions || {};

            // 手動戦と同じ「ラウンドの進行」をスタートさせます！
            // 裏側で一瞬のうちに全部終わるようになります。
            this.processWarRound();

        } catch(e) { console.error(e); this.endWar(false); } 
    }

    processWarRound() { 
        if (!this.state.active) return; 
        const s = this.state; 

        // s.phase がない、または 'init'（ラウンドの最初）の時の準備
        if (!s.phase || s.phase === 'init') {
            // ★直近5ターンのダメージを記憶する箱を用意します
            s.defDamageHistory = s.defDamageHistory || [];
            s.wallDamageHistory = s.wallDamageHistory || [];
            
            // ★新しいターンが始まったら、今ターン用の新しいメモ書き（0ダメージ）を追加します
            s.defDamageHistory.push(0);
            s.wallDamageHistory.push(0);
            
            // 5ターン分より古くなったメモは捨てます
            if (s.defDamageHistory.length > 5) s.defDamageHistory.shift();
            if (s.wallDamageHistory.length > 5) s.wallDamageHistory.shift();

            if (s.defender.defense <= 0) {
                // ★城壁が壊れて落ちた場合、少しだけ城壁（防御力）を修復してあげます！
                s.defender.defense += 150; 
                this.endWar(true); 
                return; 
            } 
            if (s.defender.morale <= 0) { this.endWar(true); return; }
            if (s.defender.soldiers <= 0) { this.endWar(true); return; }
            if (s.attacker.morale <= 0) { this.endWar(false); return; }
            if (s.attacker.soldiers <= 0) { this.endWar(false); return; } 
            
            if (s.attacker.rice <= 0) { if(s.isPlayerInvolved) this.game.ui.log("攻撃軍の兵糧が尽きました！"); this.endWar(false); return; }
            if (s.defender.rice <= 0) { if(s.isPlayerInvolved) this.game.ui.log("守備軍の兵糧が尽きました！"); this.endWar(true); return; }

            // みんなが作戦（コマンド）を決める順番のリストを作ります
            // ★野戦などで兵士が0になって全滅した援軍には、作戦を聞かないようにガードを追加しました！
            s.commandQueue = ['attacker'];
            if (s.selfReinforcement && s.selfReinforcement.soldiers > 0) s.commandQueue.push('attacker_self_reinf');
            if (s.reinforcement && s.reinforcement.soldiers > 0) s.commandQueue.push('attacker_ally_reinf');
            s.commandQueue.push('defender');
            if (s.defSelfReinforcement && s.defSelfReinforcement.soldiers > 0) s.commandQueue.push('defender_self_reinf');
            if (s.defReinforcement && s.defReinforcement.soldiers > 0) s.commandQueue.push('defender_ally_reinf');

            s.plannedActions = {}; // 選んだ作戦をメモしておくノートです
            s.phase = 'command'; // ゲームの状態を「作戦を決めるフェーズ」にします

            // ★攻城戦の毎ラウンド開始時に、参戦している武将に経験値を加算します
            const isIntTurn = (s.round % 2 === 1);
            const addExp = (bushos, isAtk) => {
                if (!bushos) return;
                bushos.forEach(b => {
                    if (b && b.id && String(b.id).indexOf('dummy') === -1) {
                        b.expLeadership = (b.expLeadership || 0) + (isAtk ? 2 : 1);
                        b.expStrength = (b.expStrength || 0) + (isAtk ? 2 : 1);
                        if (isAtk) {
                            b.expIntelligence = (b.expIntelligence || 0) + 1;
                        } else if (isIntTurn) {
                            b.expIntelligence = (b.expIntelligence || 0) + 1;
                        }
                    }
                });
            };

            if (s.attacker && s.attacker.soldiers > 0) addExp(s.atkBushos, true);
            if (s.selfReinforcement && s.selfReinforcement.soldiers > 0) addExp(s.selfReinforcement.bushos, true);
            if (s.reinforcement && s.reinforcement.soldiers > 0) addExp(s.reinforcement.bushos, true);

            if (s.defender && s.defender.soldiers > 0) {
                let defBushos = [];
                if (this.game && this.game.getCastleBushos) {
                    defBushos = this.game.getCastleBushos(s.defender.id).filter(b => b.status === 'active' && (s.defender.isKunishu ? b.belongKunishuId === s.defender.kunishuId : (b.clan === s.defender.ownerClan && b.belongKunishuId === 0)));
                }
                if (defBushos.length === 0 && s.defBusho) defBushos = [s.defBusho];
                addExp(defBushos, false);
            }
            if (s.defSelfReinforcement && s.defSelfReinforcement.soldiers > 0) addExp(s.defSelfReinforcement.bushos, false);
            if (s.defReinforcement && s.defReinforcement.soldiers > 0) addExp(s.defReinforcement.bushos, false);
        }

        this.advanceWarTurn();
    }

    execWarCmd(type, extraVal = null) { 
        if (!this.state.active) return;
        if (this.state.phase !== 'command') return; // 作戦を決めるフェーズだけ動きます

        // ★自分の操作ターンでない場合は、ボタンを押しても完全に無視する鉄壁のガードです！
        // 野戦直後など、AIが考えている最中に画面のボタンが残っていて押せてしまう不具合を防ぎます。
        if (!this.checkIsMyTurn(this.state)) return;

        const ctrl = document.getElementById('war-controls'); 
        // ★ボタンを押した瞬間に、ボタンの中身を空っぽにして完全に消し去ります！
        if(ctrl) ctrl.innerHTML = '';

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

        const armyData = this.getArmyData(s.turn);
        let myArmy = armyData.army;
        let actor = armyData.bushos[0];
        let mySoldiers = armyData.soldiers;
        let myMorale = armyData.morale;

        // ★行動する部隊の軍馬・鉄砲の割合（0.0〜1.0）と、大勢に影響しない程度のスコアボーナス（最大20点）を計算します
        let horseRatio = (myArmy && mySoldiers > 0) ? Math.min(1.0, (myArmy.horses || 0) / mySoldiers) : 0;
        let gunRatio = (myArmy && mySoldiers > 0) ? Math.min(1.0, (myArmy.guns || 0) / mySoldiers) : 0;
        let horseBonus = horseRatio * 20;
        let gunBonus = gunRatio * 20;

        let totalAtkSoldiers = s.attacker.soldiers + (s.selfReinforcement ? s.selfReinforcement.soldiers : 0) + (s.reinforcement ? s.reinforcement.soldiers : 0);
        let totalDefSoldiers = s.defender.soldiers + (s.defSelfReinforcement ? s.defSelfReinforcement.soldiers : 0) + (s.defReinforcement ? s.defReinforcement.soldiers : 0);

        let smartness = actor.intelligence / 100.0;
        if (window.AIParams.AI.Difficulty === 'hard') smartness = Math.min(1.0, smartness + 0.2);
        if (window.AIParams.AI.Difficulty === 'easy') smartness = Math.max(0.1, smartness - 0.2);

        // 敵の士気の平均を計算
        let enemyMorales = [];
        if (isDefenderTurn) {
            if (s.attacker.soldiers > 0) enemyMorales.push(s.attacker.morale ?? 50);
            if (s.selfReinforcement && s.selfReinforcement.soldiers > 0) enemyMorales.push(s.selfReinforcement.morale ?? 50);
            if (s.reinforcement && s.reinforcement.soldiers > 0) enemyMorales.push(s.reinforcement.morale ?? 50);
        } else {
            if (s.defender.soldiers > 0) enemyMorales.push(s.defender.morale ?? 50);
            if (s.defSelfReinforcement && s.defSelfReinforcement.soldiers > 0) enemyMorales.push(s.defSelfReinforcement.morale ?? 50);
            if (s.defReinforcement && s.defReinforcement.soldiers > 0) enemyMorales.push(s.defReinforcement.morale ?? 50);
        }
        let enemyMoraleAvg = enemyMorales.length > 0 ? enemyMorales.reduce((a, b) => a + b, 0) / enemyMorales.length : 50;

        // 防御力
        let def = s.defender.defense || 0;

        // 智謀の比較対象
        let myInt = actor.intelligence;
        let enemyBestInt = 30;
        if (isDefenderTurn) {
            enemyBestInt = s.atkBushos.reduce((max, b) => Math.max(max, b.intelligence), 0);
        } else {
            let defBushos = [s.defBusho];
            if (s.defSelfReinforcement) defBushos = defBushos.concat(s.defSelfReinforcement.bushos);
            if (s.defReinforcement) defBushos = defBushos.concat(s.defReinforcement.bushos);
            enemyBestInt = defBushos.reduce((max, b) => Math.max(max, b.intelligence), 0);
        }

        // 智謀スコア計算（50基準、相手との差で変動）
        let intBonus = (myInt - 50) * 1.5 + (myInt - enemyBestInt) * 2.0 - 20;
        if (myInt <= 50) intBonus -= 30; // 智謀が中以下の場合はマイナス補正を強くする

        // ★自部隊の陣営内での割合と、それに伴う「弱気度」の計算
        let myTotalSoldiers = isDefenderTurn ? totalDefSoldiers : totalAtkSoldiers;
        let myRatio = mySoldiers / Math.max(1, myTotalSoldiers);
        
        // 割合が25%未満なら、足りない分だけ弱気(最大1.0)になります
        let timidDegree = myRatio >= 0.25 ? 0 : (0.25 - myRatio) / 0.25;
        
        // ただし、自陣営の合計が相手よりずっと多ければ弱気を克服します
        let forceAdvantage = isDefenderTurn ? (totalDefSoldiers / Math.max(1, totalAtkSoldiers)) : (totalAtkSoldiers / Math.max(1, totalDefSoldiers));
        let timidReduction = 1.0;
        
        if (isDefenderTurn) {
            // 守備側は相手の2倍で弱気を完全に克服します
            timidReduction = Math.max(0, 1.0 - Math.max(0, forceAdvantage - 1.0) / 1.0);
        } else {
            // 攻撃側は相手の5倍で弱気を完全に克服します
            timidReduction = Math.max(0, 1.0 - Math.max(0, forceAdvantage - 1.0) / 4.0);
        }
        
        timidDegree *= timidReduction;

        let bestCmd = 'charge';
        let extraVal = null;
        let bestScore = -Infinity;
        let scores = {};

        const options = isDefenderTurn ? ['def_charge', 'def_bow', 'def_attack', 'provoke', 'def_inspire'] : ['charge', 'bow', 'siege', 'fire', 'inspire'];
        
        if (isDefenderTurn && s.turn === 'defender' && s.defender.ownerClan !== 0 && !s.defender.isKunishu && this.game.castles.some(c => c.ownerClan === s.defender.ownerClan && c.id !== s.defender.id && GameSystem.isReachable(this.game, s.defender, c, s.defender.ownerClan))) {
            options.push('retreat');
        } else if (!isDefenderTurn && s.turn === 'attacker' && !s.attacker.isKunishu) {
            options.push('retreat');
        }
        
        let moraleUp = Math.round((Math.sqrt(actor.leadership * 1.5) + Math.sqrt(actor.charm)) / 4);

        if (!isDefenderTurn) {
            let ratio = totalAtkSoldiers / Math.max(1, totalDefSoldiers);
            let unitRatio = mySoldiers / Math.max(1, totalDefSoldiers);
            
            scores['retreat'] = Math.max(0, 0.5 - ratio) * 1500 + (timidDegree * 300);
            
            let targetMorale = 30;
            scores['inspire'] = Math.max(0, targetMorale - myMorale) * 20 + 20;
            
            if (myMorale >= 100) {
                scores['inspire'] = -9999;
            } else if (myMorale >= 70) {
                scores['inspire'] -= (myMorale - 70) * 20;
            }

            if (moraleUp <= 0) {
                scores['inspire'] = -9999;
            }
            
            let siegeDefBonus = Math.max(0, 800 - def) * 0.6;
            let siegeRatioBonus = Math.max(0, ratio - 1.5) * 150;
            
            let siegeUnitPenalty = 0;
            if (unitRatio <= 1.5) {
                siegeUnitPenalty = (1.5 - unitRatio) * 1000;
            }
            scores['siege'] = siegeDefBonus + siegeRatioBonus - (timidDegree * 200) - siegeUnitPenalty;
            
            let fireDefBonus = Math.max(0, def - 500) * 0.4;
            let fireRatioBonus = Math.max(0, 2.5 - ratio) * 200;
            scores['fire'] = fireDefBonus + fireRatioBonus + intBonus - (timidDegree * 100);
            
            let bowDefBonus = Math.max(0, def - 600) * 0.3;
            scores['bow'] = 50 + bowDefBonus + (ratio * 50) + gunBonus;
            
            let chargeUnitPenalty = 0;
            if (unitRatio <= 1.0) {
                chargeUnitPenalty = (1.0 - unitRatio) * 1000;
            }
            scores['charge'] = 150 - (timidDegree * 200) - chargeUnitPenalty + horseBonus;

        } else {
            let ratio = totalDefSoldiers / Math.max(1, totalAtkSoldiers);
            
            let retreatRatioBonus = Math.max(0, 0.2 - ratio) * 1000;
            let retreatDefBonus = Math.max(0, 400 - def) * 1.5;
            
            let dangerScore = 0;
            let rojoRescueScore = 0;
            
            if (s.defDamageHistory && s.defDamageHistory.length >= 5) {
                let avgDefDmg = s.defDamageHistory.reduce((a, b) => a + b, 0) / 5;
                let avgWallDmg = s.wallDamageHistory.reduce((a, b) => a + b, 0) / 5;
                
                let errorRate = 0;
                if (myInt <= 50) {
                    errorRate = 0.3;
                } else if (myInt >= 100) {
                    errorRate = 0;
                } else {
                    errorRate = 0.3 * ((100 - myInt) / 50);
                }
                
                let randomFactorDmg = 1.0 + (Math.random() * errorRate - errorRate / 2);
                let randomFactorWall = 1.0 + (Math.random() * errorRate - errorRate / 2);
                
                let predictedDefDmg = avgDefDmg * randomFactorDmg;
                let predictedWallDmg = avgWallDmg * randomFactorWall;
                
                let surviveTurnsDef = predictedDefDmg > 0 ? (s.defender.soldiers / predictedDefDmg) : 99;
                let surviveTurnsWall = predictedWallDmg > 0 ? (def / predictedWallDmg) : 99;
                let minSurviveTurns = Math.min(surviveTurnsDef, surviveTurnsWall);
                
                let predictedDefDmgRojo = predictedDefDmg * 0.5;
                let predictedWallDmgRojo = predictedWallDmg * 0.5;
                let surviveTurnsDefRojo = predictedDefDmgRojo > 0 ? (s.defender.soldiers / predictedDefDmgRojo) : 99;
                let surviveTurnsWallRojo = predictedWallDmgRojo > 0 ? (def / predictedWallDmgRojo) : 99;
                let minSurviveTurnsRojo = Math.min(surviveTurnsDefRojo, surviveTurnsWallRojo);
                
                let maxRounds = window.WarParams.Military.WarMaxRounds || 15;
                let turnsLeftToWin = Math.max(1, maxRounds - (s.round || 1));
                
                let predictableLimit = Math.max(0, Math.floor(myInt / 10));
                
                if (predictableLimit > 0 && minSurviveTurns <= predictableLimit) {
                    let criticalLine = Math.max(1, Math.floor(predictableLimit / 2));
                    
                    if (minSurviveTurns <= criticalLine) {
                        if (minSurviveTurnsRojo >= turnsLeftToWin) {
                            rojoRescueScore += 8000;
                            dangerScore -= 2000;
                        } else if (minSurviveTurnsRojo > criticalLine) {
                            rojoRescueScore += 5000;
                            dangerScore += 1000;
                        } else {
                            dangerScore += 5000;
                        }
                    } else {
                        if (minSurviveTurnsRojo >= turnsLeftToWin) {
                            rojoRescueScore += 4000;
                        } else if (minSurviveTurnsRojo > minSurviveTurns) {
                            rojoRescueScore += 2000;
                            dangerScore += 500;
                        } else {
                            dangerScore += 2000;
                        }
                    }
                } else {
                    dangerScore -= 1000;
                }
            }
            
            scores['retreat'] = retreatRatioBonus + retreatDefBonus + (timidDegree * 300) + dangerScore;
            
            let defAttackDefBonus = Math.max(0, 500 - def) * 0.8;
            let defAttackRatioBonus = Math.max(0, 0.25 - ratio) * 1200;
            scores['def_attack'] = defAttackDefBonus + defAttackRatioBonus + (timidDegree * 200) + rojoRescueScore;
            
            let targetMoraleDef = 30;
            scores['def_inspire'] = Math.max(0, targetMoraleDef - myMorale) * 20 + 20;
            
            if (s.fireSufferedCount && s.fireSufferedCount > 0) {
                let fireBonus = s.fireSufferedCount * 120;
                if (myMorale >= 70) {
                    fireBonus *= (100 - myMorale) / 30;
                }
                scores['def_inspire'] += fireBonus;
            }
            
            if (myMorale >= 100) {
                scores['def_inspire'] = -9999;
            } else if (myMorale >= 70) {
                scores['def_inspire'] -= (myMorale - 70) * 20;
            }

            if (moraleUp <= 0) {
                scores['def_inspire'] = -9999;
            }
            
            let provokeDefBonus = Math.max(0, def - 600) * 0.4;
            let provokeRatioBonus = Math.max(0, ratio - 0.1) * 300;
            scores['provoke'] = provokeDefBonus + provokeRatioBonus + intBonus - (timidDegree * 100);
            
            scores['def_charge'] = 50 + Math.max(0, ratio - 0.5) * 300 - (timidDegree * 200) + horseBonus;
            
            scores['def_bow'] = 120 + gunBonus;
        }

        options.forEach(cmd => {
            let score = (scores[cmd] || 0) + (Math.random() * 50 * smartness);
            if (score > bestScore) {
                bestScore = score;
                bestCmd = cmd;
            }
        });

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
                 // ★追加：プレイヤーが操作する部隊がいなくなったかチェックし、いなければAI攻城戦へ移行（画面を隠す）
                 if (s.isPlayerInvolved) {
                     let stillInvolved = false;
                     const checkRoles = [
                         { turn: 'attacker', key: 'attacker' },
                         { turn: 'attacker_self_reinf', key: 'selfReinforcement' },
                         { turn: 'attacker_ally_reinf', key: 'reinforcement' },
                         { turn: 'defender', key: 'defender' },
                         { turn: 'defender_self_reinf', key: 'defSelfReinforcement' },
                         { turn: 'defender_ally_reinf', key: 'defReinforcement' }
                     ];
                     for (let r of checkRoles) {
                         if (s[r.key] && s[r.key].soldiers > 0) {
                             if (this.checkIsMyTurn({ ...s, turn: r.turn })) stillInvolved = true;
                         }
                     }
                     if (!stillInvolved) {
                         s.isPlayerInvolved = false;
                         if (this.game && this.game.ui && typeof this.game.ui.setWarModalVisible === 'function') {
                             this.game.ui.setWarModalVisible(false);
                         }
                         // ★追加: プレイヤーの部隊がいなくなった瞬間に、BGMを平時に戻す！
                         if (window.AudioManager) {
                             window.AudioManager.restoreMemorizedBgm();
                         }
                     }
                 }

                 if (s.defender.defense <= 0) {
                     // ★追加：城壁が壊れて落ちた場合、少しだけ城壁（防御力）を修復してあげます！
                     s.defender.defense += 150;
                     this.endWar(true);
                 } else if (s.defender.morale <= 0) {
                     this.endWar(true);
                 } else if (s.defender.soldiers <= 0) {
                     this.endWar(true);
                 } else if (s.attacker.morale <= 0) {
                     this.endWar(false);
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
                wallDefense: s.defender.defense,
                // ★今回追加：兵士数と一緒に「士気」の最新データも画面（UI）に送ります！
                defMorale: s.defender.morale,
                defSelfMorale: s.defSelfReinforcement ? s.defSelfReinforcement.morale : 0,
                defAllyMorale: s.defReinforcement ? s.defReinforcement.morale : 0,
                atkMorale: s.attacker.morale,
                atkSelfMorale: s.selfReinforcement ? s.selfReinforcement.morale : 0,
                atkAllyMorale: s.reinforcement ? s.reinforcement.morale : 0
            };
        };

        // ★追加：どちらかが負けた時に、わかりやすい専用のメッセージを差し込む魔法です
        const checkDefeatAndPushMsg = () => {
            if (s.defender.defense <= 0) {
                pushMsg({ text: `<span style="color:#d32f2f; font-size:1.2rem; font-weight:bold;">城の防御が０になった！<br>城は陥落した！</span>`, log: `城防御が0になり、陥落した！` });
            } else if (s.defender.morale <= 0) {
                pushMsg({ text: `<span style="color:#d32f2f; font-size:1.2rem; font-weight:bold;">守備本隊の士気が崩壊した！<br>城は陥落した！</span>`, log: `守備本隊の士気が0になり、陥落した！` });
            } else if (s.defender.soldiers <= 0) {
                pushMsg({ text: `<span style="color:#d32f2f; font-size:1.2rem; font-weight:bold;">守備本隊が全滅した！<br>城は陥落した！</span>`, log: `守備本隊が全滅し、陥落した！` });
            } else if (s.attacker.morale <= 0) {
                pushMsg({ text: `<span style="color:#d32f2f; font-size:1.2rem; font-weight:bold;">攻撃本隊の士気が崩壊した！<br>攻撃軍は退却した！</span>`, log: `攻撃本隊の士気が0になり、退却した！` });
            } else if (s.attacker.soldiers <= 0) {
                // ★修正：攻撃本隊が全滅した時のメッセージも赤色（#d32f2f）に統一！
                // 赤色にすることで自動でページが進まなくなり、しっかり結果を確認できるようになります。
                pushMsg({ text: `<span style="color:#d32f2f; font-size:1.2rem; font-weight:bold;">攻撃本隊が全滅した！<br>守備軍が防ぎ切った！</span>`, log: `攻撃本隊が全滅し、退却した！` });
            }
        };

        const getArmyObj = (role) => {
            return this.getArmyData(role).army;
        };

        // ★新規追加: 勢力名と武将名を組み合わせたカッコいい軍の名前を作る魔法
        const getArmyDisplayName = (role) => {
            let army = getArmyObj(role);
            let leader = null;
            if (role === 'attacker') leader = s.atkBushos ? s.atkBushos[0] : null;
            else if (role === 'attacker_self_reinf') leader = s.selfReinforcement ? s.selfReinforcement.bushos[0] : null;
            else if (role === 'attacker_ally_reinf') leader = s.reinforcement ? s.reinforcement.bushos[0] : null;
            else if (role === 'defender') leader = s.defBusho;
            else if (role === 'defender_self_reinf') leader = s.defSelfReinforcement ? s.defSelfReinforcement.bushos[0] : null;
            else if (role === 'defender_ally_reinf') leader = s.defReinforcement ? s.defReinforcement.bushos[0] : null;

            let factionName = "不明";
            if (army) {
                if (army.isKunishu || army.isKunishuForce) {
                    if (army.kunishuId) {
                        const kunishu = this.game.kunishuSystem.getKunishu(army.kunishuId);
                        if (kunishu) factionName = kunishu.getName(this.game);
                        else factionName = "諸勢力";
                    } else {
                        factionName = army.name || "諸勢力";
                    }
                } else {
                    let clanId = army.ownerClan;
                    if (clanId === undefined && leader) clanId = leader.clan;
                    
                    if (Number(clanId) === 0) {
                        return "土豪軍";
                    }
                    
                    const clan = this.game.clans.find(c => c.id === Number(clanId));
                    if (clan && clan.name) factionName = clan.name;
                }
            }
            const bushoName = leader ? leader.name : "不明";
            return `${factionName} ${bushoName} 軍`;
        };

        let activeArmyName = getArmyDisplayName(s.turn);

        if (type === 'retreat') { 
            if (s.turn === 'attacker') { 
                pushMsg({ text: `<span style="color:#d32f2f; font-size:1.2rem; font-weight:bold;">攻撃本隊が撤退を開始した！<br>合戦は終結した！</span>`, log: `${activeArmyName} が撤退を開始した！` });
                const finalize = () => { this.endWar(false, true); };
                if (s.isPlayerInvolved && actionMessages.length > 0) {
                    this.game.ui.showWarActionMessage(actionMessages, finalize);
                } else {
                    finalize();
                }
            } else if (s.turn === 'defender') { 
                pushMsg({ text: `<span style="color:#d32f2f; font-size:1.2rem; font-weight:bold;">守備本隊が城を放棄し撤退した！<br>合戦は終結した！</span>`, log: `${activeArmyName} が城を放棄し撤退した！` });
                const finalize = () => { this.executeRetreatLogic(s.defender); };
                if (s.isPlayerInvolved && actionMessages.length > 0) {
                    this.game.ui.showWarActionMessage(actionMessages, finalize);
                } else {
                    finalize();
                }
            } else if (['attacker_self_reinf', 'attacker_ally_reinf', 'defender_self_reinf', 'defender_ally_reinf'].includes(s.turn)) {
                let reinfKey = '';
                
                if (s.turn === 'attacker_self_reinf') reinfKey = 'selfReinforcement';
                else if (s.turn === 'attacker_ally_reinf') reinfKey = 'reinforcement';
                else if (s.turn === 'defender_self_reinf') reinfKey = 'defSelfReinforcement';
                else if (s.turn === 'defender_ally_reinf') reinfKey = 'defReinforcement';
                
                pushMsg(`${activeArmyName} は戦場から離脱し、撤退した！`);
                
                if (typeof this.retreatReinforcementForce === 'function') {
                    this.retreatReinforcementForce(reinfKey);
                }
                executeNext();
            }
            return; 
        }
        
        const isAtkTurnGroup = s.turn.startsWith('attacker');
        
        const armyData = this.getArmyData(s.turn);
        let activeBushos = armyData.bushos;
        let activeSoldiers = armyData.soldiers;
        let activeMorale = armyData.morale;
        let activeTraining = armyData.training;

        let targetBushos, targetSoldiers = 0, targetMorale, targetTraining;
        
        if (isAtkTurnGroup) { 
            targetBushos = [s.defBusho]; 
            targetMorale = s.defender.morale ?? 50; 
            targetTraining = s.defender.training ?? 50;
            if (s.defender.soldiers > 0) targetSoldiers += s.defender.soldiers;
            if (s.defSelfReinforcement && s.defSelfReinforcement.soldiers > 0) targetSoldiers += s.defSelfReinforcement.soldiers;
            if (s.defReinforcement && s.defReinforcement.soldiers > 0) targetSoldiers += s.defReinforcement.soldiers;
        } else { 
            targetBushos = s.atkBushos; 
            targetMorale = s.attacker.morale ?? 50; 
            targetTraining = s.attacker.training ?? 50;
            if (s.attacker.soldiers > 0) targetSoldiers += s.attacker.soldiers;
            if (s.selfReinforcement && s.selfReinforcement.soldiers > 0) targetSoldiers += s.selfReinforcement.soldiers;
            if (s.reinforcement && s.reinforcement.soldiers > 0) targetSoldiers += s.reinforcement.soldiers;
        }

        if (type === 'def_attack') { 
             pushMsg(`${activeArmyName} は籠城し、守りを固めている！`);
             executeNext(); return;
        }
        
        if (type === 'inspire' || type === 'def_inspire') {
            let leader = activeBushos[0];
            let moraleUp = Math.round((Math.sqrt(leader.leadership * 1.5) + Math.sqrt(leader.charm)) / 4);
            
            let activeArmyObj = getArmyObj(s.turn);
            if (activeArmyObj) {
                activeArmyObj.morale = Math.min(100, (activeArmyObj.morale ?? 50) + moraleUp);
            }

            // ★今回追加：守備側が鼓舞を行った時、火計をくらった記憶（警戒フラグ）をリセットします！
            if (type === 'def_inspire') {
                s.fireSufferedCount = 0;
            }

            pushMsg(`${activeArmyName} の鼓舞！`);
            // ★追加：メッセージと一緒に「最新の数字（currentStats）」を送ることで、すぐに画面を更新させます！
            pushMsg({ text: `士気が${moraleUp}上昇した！`, log: `${activeArmyName} 鼓舞！ 士気+${moraleUp}`, currentStats: getCurrentStats() });
            executeNext(); return;
        }

        if (type === 'provoke') {
            let atkRoles = ['attacker', 'attacker_self_reinf', 'attacker_ally_reinf'];
            let validTargets = [];
            
            // まず挑発可能な部隊（兵士がいて、撤退しておらず、まだ挑発にかかっていない）を探します
            atkRoles.forEach(role => {
                if (s.plannedActions[role] && s.plannedActions[role].type !== 'retreat') {
                    if (s.plannedActions[role].isProvoked) return;
                    
                    let targetArmy = getArmyObj(role);
                    if (targetArmy && targetArmy.soldiers > 0) {
                        validTargets.push(role);
                    }
                }
            });

            // 挑発できる部隊が誰もいない場合は、メッセージを一切出さずにスキップします
            if (validTargets.length === 0) {
                executeNext(); return;
            }

            pushMsg(`${activeArmyName} は敵を挑発している！`);

            let defBestInt = activeBushos.reduce((max, b) => Math.max(max, b.intelligence), 0);
            let defInt = activeBushos[0].intelligence;
            let provokedCount = 0;
            
            validTargets.forEach(role => {
                let targetArmy = getArmyObj(role);
                let tbushos = (role === 'attacker') ? s.atkBushos : (role === 'attacker_self_reinf' ? s.selfReinforcement.bushos : s.reinforcement.bushos);
                let targetArmyName = getArmyDisplayName(role);
                
                if (s.plannedActions[role].type === 'charge') {
                    pushMsg({ text: `${targetArmyName} は挑発を無視した！`, log: `${activeArmyName} 挑発失敗（${targetArmyName}）` });
                    return;
                }

                let atkBestInt = tbushos.reduce((max, b) => Math.max(max, b.intelligence), 0);
                let atkInt = tbushos[0].intelligence;
                let atkMorale = targetArmy.morale || 50;
                let atkTraining = targetArmy.training || 50;
                let atkMoraleTrainBonus = Math.max(0.01, (atkMorale / 100) + (atkTraining / 100));
                
                let successRate = ((Math.sqrt(10 + defBestInt) * (Math.sqrt(defInt) * 2)) / ((Math.sqrt(50 + atkBestInt) * (Math.sqrt(atkInt) * 2)) * atkMoraleTrainBonus) * 0.75) - 0.2;
                successRate = Math.max(0, Math.min(0.99, successRate));
                
                if (Math.random() < successRate) {
                    s.plannedActions[role].type = 'charge';
                    s.plannedActions[role].isProvoked = true;
                    provokedCount++;
                    pushMsg({ text: `${targetArmyName} は挑発に応じて陣形を変更した！`, log: `${activeArmyName} 挑発成功（${targetArmyName}）` });
                } else {
                    pushMsg({ text: `${targetArmyName} は挑発を無視した！`, log: `${activeArmyName} 挑発失敗（${targetArmyName}）` });
                }
            });
            
            if (provokedCount === 0) {
                pushMsg({ se: 'miss.ogg' });
            }
            executeNext(); return;
        }

        if (type === 'fire') {
            pushMsg(`${activeArmyName} の火計！`);
            let atkBestInt = activeBushos.reduce((max, b) => Math.max(max, b.intelligence), 0);
            let atkInt = activeBushos[0].intelligence;
            
            let defBestInt = targetBushos.reduce((max, b) => Math.max(max, b.intelligence), 0);
            let defInt = targetBushos[0].intelligence;
            
            let defRoles = ['defender', 'defender_self_reinf', 'defender_ally_reinf'];
            let totalMorale = 0;
            let totalTraining = 0;
            let validArmyCount = 0;
            
            defRoles.forEach(role => {
                let army = getArmyObj(role);
                if (army && army.soldiers > 0) {
                    totalMorale += (army.morale ?? 50);
                    totalTraining += (army.training ?? 50);
                    validArmyCount++;
                }
            });
            
            let defMoraleAvg = validArmyCount > 0 ? totalMorale / validArmyCount : 50;
            let defTrainingAvg = validArmyCount > 0 ? totalTraining / validArmyCount : 50;
            let defMoraleTrainBonus = Math.max(0.01, (defMoraleAvg / 100) + (defTrainingAvg / 100));
            
            let successRate = ((Math.sqrt(10 + atkBestInt) * (Math.sqrt(atkInt) * 2)) / ((Math.sqrt(50 + defBestInt) * (Math.sqrt(defInt) * 2)) * defMoraleTrainBonus) * 0.75) - 0.2;
            successRate = Math.max(0, Math.min(0.99, successRate));
            
            if (Math.random() < successRate) {
                let dmgRatio = (atkInt * 1.5) / ((atkInt * 1.5) + (defInt * 1.5));
                //火計の最終ダメージ 実行智謀 * ダメージ倍率 * 0.8(調整用)
                let baseDamage = atkInt * dmgRatio * 0.8;
                let calcDamage = Math.floor(s.isPlayerInvolved ? baseDamage : baseDamage * 0.666);
                
                s.defender.defense = Math.max(0, s.defender.defense - calcDamage);
                
                // ★今回追加：火計が成功したという記憶（警戒フラグ）を守備側に刻み込みます！
                s.fireSufferedCount = (s.fireSufferedCount || 0) + 1;
                
                // ★今ターン（最後尾）のメモにダメージを足し算します！
                s.defDamageHistory = s.defDamageHistory || [0];
                s.wallDamageHistory = s.wallDamageHistory || [0];
                s.wallDamageHistory[s.wallDamageHistory.length - 1] += (calcDamage || 0);
                
                pushMsg({ type: 'damage', target: 'defender', wallDmg: calcDamage, se: 'fire001.mp3', currentStats: getCurrentStats() });
                pushMsg({ text: `敵城壁に${calcDamage}の被害を与えた！`, log: `${activeArmyName} 火計成功！ 敵城壁に${calcDamage}の被害`});
                checkDefeatAndPushMsg();
            } else {
                pushMsg({ text: `火計は失敗に終わった……`, log: `${activeArmyName} 火計失敗……`, se: 'miss.ogg' });
            }
            executeNext(); return;
        }

        const calcArmyPower = (bushos, soldiers, morale, training, isDefendingCastle) => {
            if (!bushos || bushos.length === 0 || soldiers <= 0) return { atkPower: 0, defPower: 0 };
            
            let leader = bushos[0];
            let subs = bushos.slice(1);

            if (isDefendingCastle && this.game && s.defender) {
                const castleBushos = this.game.getCastleBushos(s.defender.id).filter(b => b.clan === s.defender.ownerClan && b.status === 'active');
                if (castleBushos.length > 0) {
                    let bestBusho = castleBushos.reduce((best, current) => {
                        let bestScore = best.leadership + best.strength + best.intelligence;
                        let currentScore = current.leadership + current.strength + current.intelligence;
                        return currentScore > bestScore ? current : best;
                    });
                    leader = bestBusho;
                    subs = castleBushos.filter(b => b.id !== leader.id);
                }
            }

            let subLdrSum = 0; let subStrSum = 0; let subIntSum = 0;
            subs.forEach(b => {
                subLdrSum += b.leadership;
                subStrSum += b.strength;
                subIntSum += b.intelligence;
            });

            const soldierFactor = soldiers / (soldiers + 150);
            const sqrtSol = Math.sqrt(soldiers);

            const baseAtk = sqrtSol + ((leader.leadership + subLdrSum * 0.05) * 1.5 + (leader.strength + subStrSum * 0.05)) * soldierFactor;
            const baseDef = sqrtSol + ((leader.leadership + subLdrSum * 0.05) * 1.5 + (leader.intelligence + subIntSum * 0.05)) * soldierFactor;

            let factionBonus = 1.0;
            const activeBushosList = [leader].concat(subs);
            
            if (activeBushosList.length >= 2) {
                const firstFactionId = activeBushosList[0].factionId;
                if (firstFactionId !== 0 && activeBushosList.every(b => b.factionId === firstFactionId)) {
                    factionBonus = 1.0 + ((activeBushosList.length - 1) * 0.1);
                }
            }
            
            if (isDefendingCastle && factionBonus > 1.5) {
                factionBonus = 1.5;
            }

            const finalAtk = baseAtk * (1.0 + (morale * 1.5 + training) / 1000) * factionBonus;
            const finalDef = baseDef * (1.0 + (morale + training * 1.5) / 1000) * factionBonus;

            return { atkPower: finalAtk, defPower: finalDef };
        };

        // ★今回追加：リーダーの居城によるホーム補正を計算する魔法！
        const getHomeBonusMult = (role) => {
            let activeCastle = null;
            if (role === 'attacker') activeCastle = s.sourceCastle;
            else if (role === 'attacker_self_reinf') activeCastle = s.selfReinforcement ? s.selfReinforcement.castle : null;
            else if (role === 'attacker_ally_reinf') activeCastle = s.reinforcement ? s.reinforcement.castle : null;
            else if (role === 'defender') activeCastle = s.defender;
            else if (role === 'defender_self_reinf') activeCastle = s.defSelfReinforcement ? s.defSelfReinforcement.castle : null;
            else if (role === 'defender_ally_reinf') activeCastle = s.defReinforcement ? s.defReinforcement.castle : null;
            
            let mult = 1.0;
            if (activeCastle && this.game && !activeCastle.isKunishu && activeCastle.ownerClan > 0) {
                let leaderCastle = null;
                if (activeCastle.legionId > 0 && this.game.legions) {
                    const legion = this.game.legions.find(l => l.id === activeCastle.legionId);
                    if (legion && legion.commanderId > 0) {
                        const commander = this.game.getBusho(legion.commanderId);
                        if (commander && commander.castleId) leaderCastle = this.game.getCastle(commander.castleId);
                    }
                }
                if (!leaderCastle) {
                    const daimyo = this.game.bushos.find(b => b.clan === activeCastle.ownerClan && b.isDaimyo);
                    if (daimyo && daimyo.castleId) leaderCastle = this.game.getCastle(daimyo.castleId);
                }
                if (!leaderCastle) leaderCastle = activeCastle;

                if (leaderCastle.provinceId === s.defender.provinceId) mult += 0.1;
                const leaderProv = this.game.provinces.find(p => p.id === leaderCastle.provinceId);
                const defProv = this.game.provinces.find(p => p.id === s.defender.provinceId);
                if (leaderProv && defProv && leaderProv.regionId === defProv.regionId) mult += 0.1;
            } else if (activeCastle) {
                if (activeCastle.provinceId === s.defender.provinceId) mult += 0.1;
                const leaderProv = this.game.provinces.find(p => p.id === activeCastle.provinceId);
                const defProv = this.game.provinces.find(p => p.id === s.defender.provinceId);
                if (leaderProv && defProv && leaderProv.regionId === defProv.regionId) mult += 0.1;
            }
            return mult;
        };

        let activePowerObj = calcArmyPower(activeBushos, activeSoldiers, activeMorale, activeTraining, (!isAtkTurnGroup && s.turn === 'defender'));
        let activeAtkPower = activePowerObj.atkPower;

        // 守備側のターンなら、自分のお城の防御力を攻撃パワーにも乗せます
        if (!isAtkTurnGroup) {
            let activeCastleMod = 1.5 + (s.defender.defense / 1000);
            activeAtkPower = activeAtkPower * activeCastleMod;
        }

        // 装備（鉄砲・騎馬）による攻撃力アップ計算
        let activeArmyObjForEquip = getArmyObj(s.turn);
        if (activeArmyObjForEquip && activeSoldiers > 0) {
            let activeHorses = activeArmyObjForEquip.horses || 0;
            let activeGuns = activeArmyObjForEquip.guns || 0;
            
            // 兵士数に対する割合を計算します（最大1.0＝100%）
            let horseRatio = Math.min(1.0, activeHorses / activeSoldiers);
            let gunRatio = Math.min(1.0, activeGuns / activeSoldiers);
            
            // 「基礎攻撃力(activePowerObj.atkPower)」の最大50%分のボーナス値を計算します
            let equipBonusValue = 0;
            if (type === 'charge' || type === 'def_charge') {
                equipBonusValue = activePowerObj.atkPower * (horseRatio * 0.5);
            } else if (type === 'bow' || type === 'def_bow') {
                equipBonusValue = activePowerObj.atkPower * (gunRatio * 0.5);
            }
            
            // 算出したボーナス値を、最後に足し算します
            activeAtkPower = activeAtkPower + equipBonusValue;
        }

        // ★ホーム補正を攻撃力に乗せます！
        activeAtkPower = activeAtkPower * getHomeBonusMult(s.turn);
        
        let targetList = [];
        if (isAtkTurnGroup) {
            if (s.defender.soldiers > 0) targetList.push({ bushos: [s.defBusho], soldiers: s.defender.soldiers, morale: s.defender.morale ?? 50, training: s.defender.training ?? 50, role: 'defender', isDefendingCastle: true });
            if (s.defSelfReinforcement && s.defSelfReinforcement.soldiers > 0) targetList.push({ bushos: s.defSelfReinforcement.bushos, soldiers: s.defSelfReinforcement.soldiers, morale: s.defSelfReinforcement.morale ?? 50, training: s.defSelfReinforcement.training ?? 50, role: 'defender_self_reinf', isDefendingCastle: false });
            if (s.defReinforcement && s.defReinforcement.soldiers > 0) targetList.push({ bushos: s.defReinforcement.bushos, soldiers: s.defReinforcement.soldiers, morale: s.defReinforcement.morale ?? 50, training: s.defReinforcement.training ?? 50, role: 'defender_ally_reinf', isDefendingCastle: false });
        } else {
            if (s.attacker.soldiers > 0) targetList.push({ bushos: s.atkBushos, soldiers: s.attacker.soldiers, morale: s.attacker.morale ?? 50, training: s.attacker.training ?? 50, role: 'attacker', isDefendingCastle: false });
            if (s.selfReinforcement && s.selfReinforcement.soldiers > 0) targetList.push({ bushos: s.selfReinforcement.bushos, soldiers: s.selfReinforcement.soldiers, morale: s.selfReinforcement.morale ?? 50, training: s.selfReinforcement.training ?? 50, role: 'attacker_self_reinf', isDefendingCastle: false });
            if (s.reinforcement && s.reinforcement.soldiers > 0) targetList.push({ bushos: s.reinforcement.bushos, soldiers: s.reinforcement.soldiers, morale: s.reinforcement.morale ?? 50, training: s.reinforcement.training ?? 50, role: 'attacker_ally_reinf', isDefendingCastle: false });
        }
        targetList.forEach(t => {
            let pObj = calcArmyPower(t.bushos, t.soldiers, t.morale, t.training, t.isDefendingCastle);
            t.defPower = pObj.defPower;
            // ★反撃パワーにもホーム補正を乗せます！
            t.atkPower = pObj.atkPower * getHomeBonusMult(t.role); 
        });

        let multiplier = 1.0; 
        let defMultiplier = 1.0;
        let counterRisk = 1.0;
        let wallDmgRate = 0;

        if (type === 'charge' || type === 'def_charge') {
            multiplier = 1.0;
            defMultiplier = 1.0;
            counterRisk = 1.0;
            if (isAtkTurnGroup) wallDmgRate = 0.05;
        } else if (type === 'bow' || type === 'def_bow') {
            multiplier = 0.4;
            defMultiplier = 0.6;
            counterRisk = 0.2;
            wallDmgRate = 0;
        } else if (type === 'siege') {
            multiplier = 0.5;
            defMultiplier = 1.0;
            counterRisk = 2.0;
            if (isAtkTurnGroup) wallDmgRate = 0.80;
        }

        if (s.plannedActions[s.turn] && s.plannedActions[s.turn].isProvoked) {
            counterRisk *= 1.2;
        }

        let totalSoldierDmg = 0;
        let totalCounterDmg = 0;
        let counterDmgDetails = {}; // ★追加：各部隊がどれくらい反撃したかをメモする箱

        let distAtkPower = (activeAtkPower * multiplier) / Math.max(1, targetList.length);
        
        targetList.forEach(t => {
            let castleMod = isAtkTurnGroup ? (1.5 + (s.defender.defense / 1000)) : 1.0;
            let isRojo = (!isAtkTurnGroup && s.plannedActions[t.role] && s.plannedActions[t.role].type === 'def_attack');
            let rojoMod = isRojo ? 0.5 : 1.0;

            let targetDefPower = t.defPower * defMultiplier;

            let dmgRatio = distAtkPower / (distAtkPower + targetDefPower * castleMod);
            let dmg = distAtkPower * dmgRatio * rojoMod;

            let counterRatio = (targetDefPower * castleMod) / (distAtkPower + targetDefPower * castleMod);
            let counter = (t.atkPower * defMultiplier) * 0.5 * counterRisk * counterRatio;

            totalSoldierDmg += dmg;
            totalCounterDmg += counter;
            counterDmgDetails[t.role] = counter; // ★追加：この部隊の反撃パワーをメモします！
        });

        let calculatedSoldierDmg = Math.floor(totalSoldierDmg);
        let calculatedCounterDmg = Math.floor(totalCounterDmg);
        let calculatedWallDmg = 0;
        
        if (isAtkTurnGroup && wallDmgRate > 0) {
            calculatedWallDmg = Math.floor(calculatedSoldierDmg * wallDmgRate);
        }

        if (!s.isPlayerInvolved) {
            calculatedSoldierDmg = Math.floor(calculatedSoldierDmg * 0.666);
            calculatedWallDmg = Math.floor(calculatedWallDmg * 0.666);
            calculatedCounterDmg = Math.floor(calculatedCounterDmg * 0.666);
        }

        let dmgResult = this.distributeDamage(isAtkTurnGroup, calculatedSoldierDmg);
        let actualSoldierDmg = dmgResult.total;
        
        // ★今回変更：士気の上がり下がりを一時的にメモしておく箱を作ります
        let moraleDiffs = {
            attacker: 0, attacker_self_reinf: 0, attacker_ally_reinf: 0,
            defender: 0, defender_self_reinf: 0, defender_ally_reinf: 0
        };
        
        // 受けたダメージによる士気低下のメモ
        for (let role in dmgResult.details) {
            let dmgTaken = dmgResult.details[role];
            if (dmgTaken > 0) {
                moraleDiffs[role] -= Math.round(Math.sqrt(dmgTaken) / 2);
            }
        }

        // 敵の兵士を減らしたことによる士気上昇のメモ
        if (actualSoldierDmg > 0) {
            moraleDiffs[s.turn] += Math.round(Math.sqrt(actualSoldierDmg) / 2);
        }
        
        if (isAtkTurnGroup) { 
            s.defender.defense = Math.max(0, s.defender.defense - calculatedWallDmg); 
            
            // ★今ターン（最後尾）のメモにダメージを足し算します！
            s.defDamageHistory = s.defDamageHistory || [0];
            s.wallDamageHistory = s.wallDamageHistory || [0];
            s.defDamageHistory[s.defDamageHistory.length - 1] += (dmgResult.details['defender'] || 0);
            s.wallDamageHistory[s.wallDamageHistory.length - 1] += (calculatedWallDmg || 0);
        } 
        
        let actualCounterDmg = 0;
        if (calculatedCounterDmg > 0) { 
            actualCounterDmg = Math.min(activeSoldiers, calculatedCounterDmg);
            let activeArmyObj = getArmyObj(s.turn);
            if (activeArmyObj) {
                activeArmyObj.soldiers -= actualCounterDmg;
                // 反撃を受けた時の士気低下のメモ
                moraleDiffs[s.turn] -= Math.round(Math.sqrt(actualCounterDmg) / 2);
            }
            if(isAtkTurnGroup) s.deadSoldiers.attacker += actualCounterDmg; else s.deadSoldiers.defender += actualCounterDmg;

            // ★修正：反撃で敵を減らした士気アップを、がんばった割合に応じて各部隊に配ります！
            if (totalCounterDmg > 0) {
                for (let role in counterDmgDetails) {
                    let shareRatio = counterDmgDetails[role] / totalCounterDmg;
                    let sharedCounterDmg = actualCounterDmg * shareRatio;
                    if (sharedCounterDmg > 0) {
                        moraleDiffs[role] += Math.round(Math.sqrt(sharedCounterDmg) / 2);
                    }
                }
            }
        }
        
        // ★今回追加：ここでメモした士気の上がり下がりを相殺して、一気に反映させます！
        for (let role in moraleDiffs) {
            if (moraleDiffs[role] !== 0) {
                let armyObj = getArmyObj(role);
                if (armyObj) {
                    armyObj.morale = Math.max(0, Math.min(100, (armyObj.morale ?? 50) + moraleDiffs[role]));
                }
            }
        }
        
        let actionName = "攻撃";
        let actionSe = 'damage001.ogg';
        if (type === 'bow' || type === 'def_bow') {
            actionName = "斉射";
            actionSe = 'bow_double';
        }
        else if (type === 'siege') actionName = "破壊";
        else if (type === 'charge' || type === 'def_charge') actionName = "突撃";
        
        pushMsg(`${activeArmyName} の${actionName}！`);
        
        pushMsg({
            type: 'damage',
            target: isAtkTurnGroup ? 'defender' : 'attacker',
            soldierDmgDetails: dmgResult.details,
            wallDmg: calculatedWallDmg,
            counterTarget: s.turn,
            counterDmg: actualCounterDmg,
            se: actionSe,
            currentStats: getCurrentStats()
        });
        
        let resultMsg = `敵兵 計${actualSoldierDmg}人`; 
        
        if (actualCounterDmg > 0) {
            resultMsg += ` を撃破し、反撃により ${actualCounterDmg}人 の損害を被った！`;
        } else {
            resultMsg += ` を撃破した！`;
        }

        if (calculatedWallDmg > 0) {
            // お城へのダメージがある場合は、改行（<br>）して付け足します
            resultMsg += `<br>城壁に ${calculatedWallDmg} の損害を与えた！`;
        }
        
        // ★ <br> を使って画面に表示しつつ、横長の記録（ログ）には改行をスペースに変えて書き込みます
        pushMsg({ text: resultMsg, log: `${activeArmyName} ${resultMsg.replace('<br>', ' ')}` });

        // ★追加：援軍の兵士数が0になって全滅した時に、撤退と同じくカードをからっぽにする処理
        const checkReinfDestroyed = () => {
            const reinfRoles = [
                { role: 'attacker_self_reinf', key: 'selfReinforcement' },
                { role: 'attacker_ally_reinf', key: 'reinforcement' },
                { role: 'defender_self_reinf', key: 'defSelfReinforcement' },
                { role: 'defender_ally_reinf', key: 'defReinforcement' }
            ];
            
            reinfRoles.forEach(r => {
                if (s[r.key]) {
                    if (s[r.key].morale <= 0 && s[r.key].soldiers > 0) {
                        s[r.key].soldiers = 0;
                        let armyName = getArmyDisplayName(r.role);
                        pushMsg(`${armyName} は士気が崩壊し、戦場から離脱した！`);
                    }
                    
                    // 援軍が存在していて、かつ兵士数が0以下になった場合
                    if (s[r.key].soldiers <= 0) {
                        let destroyedArmyName = getArmyDisplayName(r.role);
                        if (s[r.key].morale > 0) {
                            pushMsg(`${destroyedArmyName} は壊滅し、戦場から離脱した！`);
                        }
                        
                        // 裏側のデータでも「撤退した」ことにします
                        if (typeof this.retreatReinforcementForce === 'function') {
                            this.retreatReinforcementForce(r.key); 
                        } else {
                            s[r.key] = null; // 念のための安全装置
                        }
                    }
                }
            });
        };
        checkReinfDestroyed();

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

                // プレイヤーが操作できる部隊かどうかチェック
                let isMyTurn = this.checkIsMyTurn(s);

                // ★修正：プレイヤーの時はボタンを出し、AIの時は「思考中……」のメッセージを出します！
                if (isMyTurn) {
                    this.game.ui.renderWarControls(isAtkSideTurn); 
                } else {
                    const ctrl = document.getElementById('war-controls');
                    if (ctrl) {
                        // 今、誰が作戦を考えているのかを調べます
                        let army = null; let leader = null;
                        if (s.turn === 'attacker') { army = s.attacker; leader = s.atkBushos[0]; }
                        else if (s.turn === 'attacker_self_reinf') { army = s.selfReinforcement; leader = s.selfReinforcement.bushos[0]; }
                        else if (s.turn === 'attacker_ally_reinf') { army = s.reinforcement; leader = s.reinforcement.bushos[0]; }
                        else if (s.turn === 'defender') { army = s.defender; leader = s.defBusho; }
                        else if (s.turn === 'defender_self_reinf') { army = s.defSelfReinforcement; leader = s.defSelfReinforcement.bushos[0]; }
                        else if (s.turn === 'defender_ally_reinf') { army = s.defReinforcement; leader = s.defReinforcement.bushos[0]; }
                        
                        let factionName = "不明";
                        let isDogou = false; // ★土豪かどうかの目印を追加します
                        if (army) {
                            if (army.isKunishu || army.isKunishuForce) {
                                if (army.kunishuId) {
                                    const kunishu = this.game.kunishuSystem.getKunishu(army.kunishuId);
                                    if (kunishu) factionName = kunishu.getName(this.game);
                                    else factionName = "諸勢力";
                                } else {
                                    factionName = army.name || "諸勢力";
                                }
                            } else {
                                // ★修正：お城ではなく、部隊を率いている大将自身の所属大名家（clan）から名前を拾います！
                                let clanId = army.ownerClan;
                                if (clanId === undefined && leader) {
                                    clanId = leader.clan;
                                }
                                
                                // ★空き城の場合は目印をONにします
                                if (Number(clanId) === 0) {
                                    isDogou = true;
                                } else {
                                    const clan = this.game.clans.find(c => c.id === Number(clanId));
                                    // ★修正：最初から「家」の文字が入っているので、そのまま使うように直しました！
                                    if (clan) factionName = clan.name;
                                }
                            }
                        }
                        const bushoName = leader ? leader.name : "不明";

                        // UIのメッセージ枠を使って思考中を表示します
                        const armyDisplayName = isDogou ? "土豪軍" : `${factionName} ${bushoName}軍`;
                        this.game.ui.showWarThinkingMessage(armyDisplayName);
                    }
                    
                    // ★追加：裏で高速計算する時は待たずにすぐ実行、画面に出す時だけ待ちます！
                    if (!s.isPlayerInvolved) {
                        this.execWarAI();
                    } else {
                        setTimeout(() => this.execWarAI(), 800); 
                    }
                }
            } else {
                // 全員が作戦を決め終わったら、【実行（アクション）フェーズ】へ！
                s.phase = 'action';
                s.actionQueue = [];

                // ★追加：実行（アクション）フェーズに入った瞬間に、思考中の文字をきれいに消し去ります！
                const ctrl = document.getElementById('war-controls');
                if (ctrl) ctrl.innerHTML = '';
                
                const allRoles = ['attacker', 'defender', 'attacker_self_reinf', 'defender_self_reinf', 'attacker_ally_reinf', 'defender_ally_reinf'];
                const defRoles = ['defender', 'defender_self_reinf', 'defender_ally_reinf'];
                
                // ★今回変更：行動の優先順位を「撤退」→「鼓舞」→「籠城」→「挑発」→「その他」に変更しました！
                
                // 1. 撤退を最優先（一番最初）に行動させます
                allRoles.forEach(role => {
                    if (s.plannedActions[role] && s.plannedActions[role].type === 'retreat') {
                        s.actionQueue.push(role);
                    }
                });

                // 2. その次に、鼓舞を行動させます
                allRoles.forEach(role => {
                    if (s.plannedActions[role] && (s.plannedActions[role].type === 'inspire' || s.plannedActions[role].type === 'def_inspire')) {
                        s.actionQueue.push(role);
                    }
                });

                // 3. その次に、籠城を行動させます
                defRoles.forEach(role => {
                    if (s.plannedActions[role] && s.plannedActions[role].type === 'def_attack') {
                        s.actionQueue.push(role);
                    }
                });
                
                // 4. その次に、挑発を行動させます
                defRoles.forEach(role => {
                    if (s.plannedActions[role] && s.plannedActions[role].type === 'provoke') {
                        s.actionQueue.push(role);
                    }
                });

                // 5. 残りの部隊（突撃、斉射、火計、破壊など）を、いつもの順番で並べます！
                allRoles.forEach(role => {
                    // まだリストに入っていない部隊だけを追加します
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
                if (s.turn === 'attacker' && (!s.attacker || s.attacker.soldiers <= 0)) isDead = true;
                else if (s.turn === 'attacker_self_reinf' && (!s.selfReinforcement || s.selfReinforcement.soldiers <= 0)) isDead = true;
                else if (s.turn === 'attacker_ally_reinf' && (!s.reinforcement || s.reinforcement.soldiers <= 0)) isDead = true;
                else if (s.turn === 'defender' && (!s.defender || s.defender.soldiers <= 0)) isDead = true;
                else if (s.turn === 'defender_self_reinf' && (!s.defSelfReinforcement || s.defSelfReinforcement.soldiers <= 0)) isDead = true;
                else if (s.turn === 'defender_ally_reinf' && (!s.defReinforcement || s.defReinforcement.soldiers <= 0)) isDead = true;
                
                if (isDead || !action) {
                    this.advanceWarTurn();
                } else {
                    // ★追加：裏で高速計算する時は待たずにすぐ実行、画面に出す時だけ待ちます！
                    if (!s.isPlayerInvolved) {
                        this.resolveWarAction(action.type, action.extraVal);
                    } else {
                        // 少し間をあけて（演出を見やすくして）実行します
                        setTimeout(() => {
                            this.resolveWarAction(action.type, action.extraVal);
                        }, 800);
                    }
                }
            } else {
                // 全員の行動が終わったら、兵糧を消費します
                s.attacker.rice = Math.max(0, s.attacker.rice - Math.floor(s.attacker.soldiers * 0.05));
                // ★今回追加：毎ターンの終了時（ラウンドの終わり）に、攻撃側の士気を１下げます
                s.attacker.morale = Math.max(0, (s.attacker.morale ?? 50) - 1);

                if (s.selfReinforcement) {
                    s.selfReinforcement.rice = Math.max(0, s.selfReinforcement.rice - Math.floor(s.selfReinforcement.soldiers * 0.05));
                    s.selfReinforcement.morale = Math.max(0, (s.selfReinforcement.morale ?? 50) - 1);
                }
                if (s.reinforcement) {
                    s.reinforcement.rice = Math.max(0, s.reinforcement.rice - Math.floor(s.reinforcement.soldiers * 0.05));
                    s.reinforcement.morale = Math.max(0, (s.reinforcement.morale ?? 50) - 1);
                }

                s.defender.rice = Math.max(0, s.defender.rice - Math.floor(s.defender.soldiers * 0.05));
                if (s.defSelfReinforcement) s.defSelfReinforcement.rice = Math.max(0, s.defSelfReinforcement.rice - Math.floor(s.defSelfReinforcement.soldiers * 0.05));
                if (s.defReinforcement) s.defReinforcement.rice = Math.max(0, s.defReinforcement.rice - Math.floor(s.defReinforcement.soldiers * 0.05));

                // ラウンドを1つ進めます
                s.phase = 'init';
                s.round++;
                if(s.round > window.WarParams.Military.WarMaxRounds) { this.endWar(false); return; } 
                this.processWarRound();
            }
        }
    }
    
}