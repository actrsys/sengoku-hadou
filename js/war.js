/**
 * war.js
 * 戦争処理マネージャー & 戦争計算ロジック
 * 修正: 捕虜の処遇結果のアラートをカスタムダイアログ（showDialog）に置き換えました
 * 修正: 迎撃時の出陣兵士・兵糧の取得処理を修正（ID指定のオブジェクト構造に対応）
 * ★追加: 国人衆の蜂起（反乱）・制圧時の特別な結末と、捕虜の特別ルールを追加しました
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
        RiceConsumptionAtk: 0.1, RiceConsumptionDef: 0.05,
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

    getAvailableCommands(isAtkTurn) {
        const s = this.state;
        if (!s.isPlayerInvolved) return [];
        
        // ★変更：委任城の場合はコマンドを選べないようにします
        let isMyTurn = false;
        if (isAtkTurn && Number(s.attacker.ownerClan) === Number(this.game.playerClanId) && !s.sourceCastle.isDelegated) isMyTurn = true;
        if (!isAtkTurn && Number(s.defender.ownerClan) === Number(this.game.playerClanId) && !s.defender.isDelegated) isMyTurn = true;
        
        if (!isMyTurn) return []; 
        const commands = [];
        if (isAtkTurn) {
            commands.push({ label: "突撃", type: "charge" }, { label: "斉射", type: "bow" }, { label: "城攻め", type: "siege" }, { label: "火計", type: "fire" }, { label: "謀略", type: "scheme" }, { label: "撤退", type: "retreat" });
        } else {
            commands.push({ label: "突撃", type: "def_charge" }, { label: "斉射", type: "def_bow" }, { label: "籠城", type: "def_attack" }, { label: "謀略", type: "scheme" }, { label: "補修", type: "repair_setup" }); 
            if (this.game.castles.some(c => c.ownerClan === s.defender.ownerClan && c.id !== s.defender.id && GameSystem.isReachable(this.game, s.defender, c, s.defender.ownerClan))) commands.push({ label: "撤退", type: "retreat" });
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

        while (turn <= 20 && s.attacker.soldiers > 0 && s.defender.fieldSoldiers > 0 && safetyLimit > 0) {
            let resAtk = WarSystem.calcWarDamage(atkStats, defStats, s.attacker.soldiers, s.defender.fieldSoldiers, 0, s.attacker.morale, s.defender.training, 'charge');
            // ★0.5を0.195に変更しました！
            if (!s.isPlayerInvolved) { resAtk.soldierDmg = Math.floor(resAtk.soldierDmg * 0.195); resAtk.counterDmg = Math.floor(resAtk.counterDmg * 0.195); }
            
            // ★修正: 減った兵士の数を計算して、負傷兵の箱（deadSoldiers）に入れます！
            let actDefDmg1 = Math.min(s.defender.fieldSoldiers, resAtk.soldierDmg);
            let actAtkDmg1 = Math.min(s.attacker.soldiers, resAtk.counterDmg);
            s.defender.fieldSoldiers -= actDefDmg1; 
            s.attacker.soldiers -= actAtkDmg1;
            s.deadSoldiers.defender += actDefDmg1;
            s.deadSoldiers.attacker += actAtkDmg1;

            if (s.defender.fieldSoldiers <= 0 || s.attacker.soldiers <= 0) break;
            
            let resDef = WarSystem.calcWarDamage(defStats, atkStats, s.defender.fieldSoldiers, s.attacker.soldiers, 0, s.defender.morale, s.attacker.training, 'charge');
            // ★0.5を0.195に変更しました！
            if (!s.isPlayerInvolved) { resDef.soldierDmg = Math.floor(resDef.soldierDmg * 0.195); resDef.counterDmg = Math.floor(resDef.counterDmg * 0.195); }
            
            // ★修正: こちらも同じように減った兵士を負傷兵の箱に入れます！
            let actAtkDmg2 = Math.min(s.attacker.soldiers, resDef.soldierDmg);
            let actDefDmg2 = Math.min(s.defender.fieldSoldiers, resDef.counterDmg);
            s.attacker.soldiers -= actAtkDmg2; 
            s.defender.fieldSoldiers -= actDefDmg2;
            s.deadSoldiers.attacker += actAtkDmg2;
            s.deadSoldiers.defender += actDefDmg2;
            
            s.attacker.rice = Math.max(0, s.attacker.rice - Math.floor(s.attacker.soldiers * consumeRate));
            s.defFieldRice = Math.max(0, s.defFieldRice - Math.floor(s.defender.fieldSoldiers * consumeRate)); 
            if (s.attacker.rice <= 0 || s.defFieldRice <= 0 || s.attacker.soldiers < s.defender.fieldSoldiers * 0.2 || s.defender.fieldSoldiers < s.attacker.soldiers * 0.2) break;

            turn++; safetyLimit--;
        }

        const atkLost = s.attacker.soldiers <= 0 || s.attacker.rice <= 0 || (s.attacker.soldiers < s.defender.fieldSoldiers * 0.2);
        const defLost = s.defender.fieldSoldiers <= 0 || s.defFieldRice <= 0 || (s.defender.fieldSoldiers < s.attacker.soldiers * 0.2);
        
        if (s.atkAssignments) {
            const originalAtkSoldiers = s.atkAssignments.reduce((sum, a) => sum + a.soldiers, 0);
            const atkSurviveRate = originalAtkSoldiers > 0 ? Math.max(0, s.attacker.soldiers) / originalAtkSoldiers : 0;
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
        
        // 国人衆の制圧戦（ダミー城）の場合は民忠・人口の低下をスキップ
        if (!s.isKunishuSubjugation) {
            // ★変更：民忠を現在の2割減らす
            const dropLoyalty = Math.floor(s.defender.peoplesLoyalty * 0.2);
            s.defender.peoplesLoyalty = Math.max(0, s.defender.peoplesLoyalty - dropLoyalty); 
            
            // ★変更：人口を攻撃側の兵士数の2割減らす
            const dropPopulation = Math.floor(s.attacker.soldiers * 0.2);
            s.defender.population = Math.max(0, s.defender.population - dropPopulation);
        }
        
        if (s.isPlayerInvolved) { 
            this.game.ui.setWarModalVisible(true); this.game.ui.clearWarLog();
            
            // ★ここから追加：攻城戦スタート時にBGMを切り替える！
            if (window.AudioManager) {
                window.AudioManager.memorizeCurrentBgm(); 
                window.AudioManager.playBGM('07_Underworld dance.ogg'); // ←★ここを、先ほどカタログに登録した攻城戦用の曲名に変えます！
            }
            // ★追加ここまで
            
            setTimeout(() => {
                this.game.ui.log(`★ ${s.sourceCastle.name}軍が${s.defender.name}への攻城戦を開始！`);
                this.game.ui.updateWarUI(); this.processWarRound(); 
            }, 500); 
        } else { setTimeout(() => { this.resolveAutoWar(); }, 100); }
    }

    resolveAutoWar() { 
        try { 
            const s = this.state;
            // ★変更: 委任城なら強制的に手動戦闘になるのを防ぎます！
            if (s.isPlayerInvolved || (Number(s.defender.ownerClan) === Number(this.game.playerClanId) && !s.defender.isDelegated)) {
                s.isPlayerInvolved = true; this.game.ui.setWarModalVisible(true); this.game.ui.updateWarUI(); this.processWarRound(); return;
            }

            let safetyLimit = 100; 
            while(s.round <= window.WarParams.Military.WarMaxRounds && s.attacker.soldiers > 0 && s.defender.soldiers > 0 && s.defender.defense > 0 && safetyLimit > 0) { 
                this.resolveWarAction('charge'); 
                if (s.attacker.soldiers <= 0 || s.defender.soldiers <= 0) break; 
                s.attacker.rice = Math.max(0, s.attacker.rice - Math.floor(s.attacker.soldiers * window.WarParams.War.RiceConsumptionAtk));
                s.defender.rice = Math.max(0, s.defender.rice - Math.floor(s.defender.soldiers * window.WarParams.War.RiceConsumptionDef));
                if (s.attacker.rice <= 0 || s.defender.rice <= 0) break;
                safetyLimit--;
            } 
            this.endWar(s.defender.soldiers <= 0 || s.defender.defense <= 0 || s.defender.rice <= 0); 
        } catch(e) { console.error(e); this.endWar(false); } 
    }

    processWarRound() { 
        if (!this.state.active) return; 
        const s = this.state; 
        if (s.turn === 'attacker' && s.round > 1) {
             s.attacker.rice = Math.max(0, s.attacker.rice - Math.floor(s.attacker.soldiers * window.WarParams.War.RiceConsumptionAtk));
             s.defender.rice = Math.max(0, s.defender.rice - Math.floor(s.defender.soldiers * window.WarParams.War.RiceConsumptionDef));
        }

        if (s.defender.soldiers <= 0 || s.defender.defense <= 0) { this.endWar(true); return; } 
        if (s.attacker.soldiers <= 0) { this.endWar(false); return; } 
        if (s.attacker.rice <= 0) { if(s.isPlayerInvolved) this.game.ui.log("攻撃軍、兵糧尽きる！"); this.endWar(false); return; }
        if (s.defender.rice <= 0) { if(s.isPlayerInvolved) this.game.ui.log("守備軍、兵糧尽きる！"); this.endWar(true); return; }
        
        this.game.ui.updateWarUI(); this.game.ui.renderWarControls(s.turn === 'attacker'); 
        const isMyTurn = (s.turn === 'attacker' && Number(s.attacker.ownerClan) === Number(this.game.playerClanId)) || (s.turn !== 'attacker' && Number(s.defender.ownerClan) === Number(this.game.playerClanId));
        if (!isMyTurn) setTimeout(() => this.execWarAI(), 800); 
    }

    execWarCmd(type, extraVal = null) { 
        if (!this.state.active) return;
        if (type === 'repair_setup') { window.GameApp.ui.openQuantitySelector('war_repair', [this.state.defender], null); return; }
        if(type==='scheme'||type==='fire') this.resolveWarAction(type); 
        else { const ctrl = document.getElementById('war-controls'); if(ctrl) ctrl.classList.add('disabled-area'); this.resolveWarAction(type, extraVal); } 
    }

    execWarAI() { 
        if (!this.state.active) return; 
        const s = this.state; const isDefender = (s.turn === 'defender');
        
        // ★変更: 委任されている城はAIが操作するようにします！
        let isPlayerControlled = false;
        if (isDefender && Number(s.defender.ownerClan) === Number(this.game.playerClanId) && !s.defender.isDelegated) isPlayerControlled = true;
        if (!isDefender && Number(s.attacker.ownerClan) === Number(this.game.playerClanId) && !s.sourceCastle.isDelegated) isPlayerControlled = true;
        
        if (isPlayerControlled) return;

        const actor = isDefender ? s.defBusho : s.atkBushos[0];
        let smartness = actor.intelligence / 100.0;
        if (window.AIParams.AI.Difficulty === 'hard') smartness = Math.min(1.0, smartness + 0.2);
        if (window.AIParams.AI.Difficulty === 'easy') smartness = Math.max(0.1, smartness - 0.2);

        if (isDefender) {
            if (s.defender.soldiers / (s.attacker.soldiers + 1) < (0.2 + smartness * 0.2) && s.defender.defense < 200) { this.resolveWarAction('retreat'); return; }
            if (s.defender.defense / (s.defender.maxDefense || 1000) < 0.2 && s.defender.soldiers > 1000 && Math.random() < smartness) { this.resolveWarAction('repair', Math.min(s.defender.soldiers, 100)); return; }
        } else {
            if (s.attacker.rice < s.attacker.soldiers * 0.2 && s.attacker.soldiers < s.defender.soldiers * 0.5) { this.resolveWarAction('retreat'); return; }
            if (s.attacker.soldiers < s.defender.soldiers * 0.3 && smartness > 0.5) { this.resolveWarAction('retreat'); return; }
        }

        const options = isDefender ? ['def_charge', 'def_bow', 'def_attack'] : ['charge', 'bow', 'siege'];
        if (actor.intelligence > 30) options.push('scheme');
        if (actor.intelligence > 50 && !isDefender) options.push('fire');

        let bestCmd = options[0]; let bestScore = -Infinity; const W = window.WarParams.War;

        options.forEach(cmd => {
            let score = 0; let multiplier = 1.0; let risk = 1.0;
            if (cmd === 'charge') { multiplier = W.ChargeMultiplier; risk = W.ChargeRisk; }
            else if (cmd === 'bow') { multiplier = W.BowMultiplier; risk = W.BowRisk; }
            else if (cmd === 'siege') { multiplier = W.SiegeMultiplier; risk = W.SiegeRisk; }
            else if (cmd === 'def_charge') { multiplier = W.DefChargeMultiplier; risk = W.DefChargeRisk; }
            else if (cmd === 'def_bow') { multiplier = W.DefBowMultiplier; risk = 0.5; }
            else if (cmd === 'def_attack') { multiplier = 0; risk = 0; } 

            if (cmd === 'siege') score += (multiplier * 50) + (s.defender.defense > 0 ? 100 : 0);
            else if (cmd === 'def_attack') score += (s.defender.soldiers < s.attacker.soldiers) ? 200 : -100;
            else score += multiplier * 100;

            score -= (risk * 50 * smartness);
            if (cmd === 'scheme' || cmd === 'fire') score = ((actor.intelligence / 100) * 150) - (50 * smartness); 
            score += (Math.random() * 50) * (1.0 - smartness);
            if (score > bestScore) { bestScore = score; bestCmd = cmd; }
        });
        this.resolveWarAction(bestCmd); 
    }

    resolveWarAction(type, extraVal = null) {
        if (!this.state.active) return;
        const s = this.state;
        if(type === 'retreat') { if(s.turn === 'attacker') { this.endWar(false, true); } else { this.executeRetreatLogic(s.defender); } return; }
        
        const isAtkTurn = (s.turn === 'attacker'); const target = isAtkTurn ? s.defender : s.attacker;
        let atkStats = WarSystem.calcUnitStats(s.atkBushos); let defStats = { str: s.defBusho.strength, int: s.defBusho.intelligence, ldr: s.defBusho.leadership };
        
        if (type === 'def_attack') { 
             s.defenderGuarding = true;
             if(s.isPlayerInvolved) this.game.ui.addWarDetailLog(`R${s.round} [守] 籠城し、守りを固めている！`);
             this.advanceWarTurn(); return;
        }
        if (type === 'repair') { 
             const soldierCost = extraVal || 50; 
             if (s.defender.soldiers > soldierCost) {
                 const W = window.WarParams.War; s.defender.soldiers -= soldierCost;
                 const castleBushos = this.game.getCastleBushos(s.defender.id);
                 const polList = castleBushos.map(b => b.politics).sort((a,b) => b - a);
                 const maxPol = polList.length > 0 ? polList[0] : 0;
                 let subPolSum = 0; for(let i=1; i<polList.length; i++) subPolSum += polList[i];
                 let recover = Math.floor(((soldierCost * W.RepairSoldierFactor) + (maxPol * W.RepairMainPolFactor) + (subPolSum * W.RepairSubPolFactor)) * W.RepairGlobalMultiplier);
                 s.defender.defense += recover;
                 if(s.isPlayerInvolved) this.game.ui.addWarDetailLog(`R${s.round} [守] 補修を実行！ (兵-${soldierCost} 防+${recover})`);
             } else { if(s.isPlayerInvolved) this.game.ui.addWarDetailLog(`R${s.round} [守] 補修しようとしたが兵が足りない！`); }
             this.advanceWarTurn(); return;
        }

        if (type === 'scheme') {
            const result = WarSystem.calcScheme(isAtkTurn ? s.atkBushos[0] : s.defBusho, isAtkTurn ? s.defBusho : s.atkBushos[0], isAtkTurn ? s.defender.peoplesLoyalty : (window.MainParams?.Economy?.MaxLoyalty || 100));
            if (!result.success) { if (s.isPlayerInvolved) this.game.ui.addWarDetailLog(`R${s.round} 謀略失敗！`); }
            else {
                // ★0.5を0.195に変更しました！
                let actualDamage = s.isPlayerInvolved ? result.damage : Math.floor(result.damage * 0.195);
                target.soldiers = Math.max(0, target.soldiers - actualDamage);
                if (s.isPlayerInvolved) this.game.ui.addWarDetailLog(`R${s.round} 謀略成功！ 兵士に${actualDamage}の被害`);
            }
            this.advanceWarTurn(); return;
        }

        if (type === 'fire') {
            const result = WarSystem.calcFire(isAtkTurn ? s.atkBushos[0] : s.defBusho, isAtkTurn ? s.defBusho : s.atkBushos[0]);
            if (!result.success) { if (s.isPlayerInvolved) this.game.ui.addWarDetailLog(`R${s.round} 火攻失敗！`); }
            else {
                // ★0.5を0.195に変更しました！
                let actualDamage = s.isPlayerInvolved ? result.damage : Math.floor(result.damage * 0.195);
                // ★25（半分のダメージ）を16（3分の1のダメージ）に変更しました！
                let actualDefSoldierDamage = s.isPlayerInvolved ? 50 : 16;
                if(isAtkTurn) s.defender.defense = Math.max(0, s.defender.defense - actualDamage);
                else target.soldiers = Math.max(0, target.soldiers - actualDefSoldierDamage);
                if (s.isPlayerInvolved) this.game.ui.addWarDetailLog(`R${s.round} 火攻成功！ ${isAtkTurn?'防御':'兵士'}に${isAtkTurn ? actualDamage : actualDefSoldierDamage}の被害`);
            }
            this.advanceWarTurn(); return;
        }
        
        const result = WarSystem.calcWarDamage(atkStats, defStats, s.attacker.soldiers, s.defender.soldiers, s.defender.defense, s.attacker.morale, s.defender.training, type);
        let calculatedSoldierDmg = result.soldierDmg; let calculatedWallDmg = result.wallDmg; let calculatedCounterDmg = result.counterDmg;

        if (!s.isPlayerInvolved) {
            // ★0.5を0.195に変更しました！
            calculatedSoldierDmg = Math.floor(calculatedSoldierDmg * 0.195); calculatedWallDmg = Math.floor(calculatedWallDmg * 0.195); calculatedCounterDmg = Math.floor(calculatedCounterDmg * 0.195);
        }

        if (isAtkTurn && s.defenderGuarding) {
             calculatedSoldierDmg = Math.floor(calculatedSoldierDmg * window.WarParams.War.RojoDamageReduction); 
             calculatedWallDmg = Math.floor(calculatedWallDmg * window.WarParams.War.RojoDamageReduction);
             s.defenderGuarding = false; if (s.isPlayerInvolved) this.game.ui.addWarDetailLog(`(籠城効果によりダメージ軽減)`);
        }

        let actualSoldierDmg = Math.min(target.soldiers, calculatedSoldierDmg);
        target.soldiers -= actualSoldierDmg;
        if(isAtkTurn) { s.deadSoldiers.defender += actualSoldierDmg; s.defender.defense = Math.max(0, s.defender.defense - calculatedWallDmg); } 
        else s.deadSoldiers.attacker += actualSoldierDmg;
        
        if(calculatedCounterDmg > 0) { 
            const actorArmy = isAtkTurn ? s.attacker : s.defender; 
            const actualCounterDmg = Math.min(actorArmy.soldiers, calculatedCounterDmg);
            actorArmy.soldiers -= actualCounterDmg;
            if(isAtkTurn) s.deadSoldiers.attacker += actualCounterDmg; else s.deadSoldiers.defender += actualCounterDmg;
            if(s.isPlayerInvolved) this.game.ui.addWarDetailLog(`(反撃被害: ${actualCounterDmg})`); 
        }
        
        if (s.isPlayerInvolved) { 
            let actionName = type.includes('bow') ? "弓攻撃" : type.includes('siege') ? "城攻め" : "力攻め"; 
            if (type.includes('def_')) actionName = type === 'def_bow' ? "斉射" : type === 'def_charge' ? "突撃" : "反撃"; 
            let msg = (calculatedWallDmg > 0) ? `${actionName} (兵-${actualSoldierDmg} 防-${calculatedWallDmg})` : `${actionName} (兵-${actualSoldierDmg})`; 
            this.game.ui.addWarDetailLog(`R${s.round} [${isAtkTurn?'攻':'守'}] ${msg}`); 
        }
        this.advanceWarTurn();
    }

    advanceWarTurn() { 
        if (!this.state.active) return;
        const s = this.state; 
        if (s.turn === 'attacker') s.turn = 'defender'; 
        else { 
            s.turn = 'attacker'; s.round++; 
            if(s.round > window.WarParams.Military.WarMaxRounds) { this.endWar(false); return; } 
        } 
        if (s.isPlayerInvolved) this.processWarRound(); 
    }
    
}