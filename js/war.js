/**
 * war.js
 * 戦争処理マネージャー & 戦争計算ロジック
 * 責務: 合戦の進行、戦闘計算、戦後処理、捕虜対応、UIコマンド定義、攻撃可能判定
 * 設定: Military, War
 * 修正: 捕虜になった武将の城主フラグ残留を防止
 */

// 戦争・軍事関連の設定定義
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
        CaptureChanceBase: 0.4, CaptureStrFactor: 0.002, PrisonerRecruitThreshold: 60
    }
};

class WarSystem {
    static calcUnitStats(bushos) { 
        const W = window.WarParams.War;
        const M = window.WarParams.Military;
        const baseStat = W.BaseStat || 30;

        if (!bushos || bushos.length === 0) return { ldr:baseStat, str:baseStat, int:baseStat, charm:baseStat }; 
        const leader = bushos[0]; 
        const subs = bushos.slice(1); 
        
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
        const M = window.WarParams.Military;
        const W = window.WarParams.War;
        const fluctuation = M.DamageFluctuation || 0.2;
        const rand = 1.0 - fluctuation + (Math.random() * fluctuation * 2);
        
        const moraleBase = W.MoraleBase || 50;
        const moraleBonus = (atkMorale - moraleBase) / 100; 
        const trainingBonus = (defTraining - moraleBase) / 100;
        
        const ldrW = W.StatsLdrWeight || 1.2;
        const strW = W.StatsStrWeight || 0.3;
        const intW = W.StatsIntWeight || 0.5;

        const atkPower = ((atkStats.ldr * ldrW) + (atkStats.str * strW) + (atkSoldiers * M.DamageSoldierPower)) * (1.0 + moraleBonus);
        const defPower = ((defStats.ldr * 1.0) + (defStats.int * intW) + (defWall * M.WallDefenseEffect) + (defSoldiers * M.DamageSoldierPower)) * (1.0 + trainingBonus);
        
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
        let baseDmg = atkPower * ratio * multiplier * rand; 
        const minDmg = W.MinDamage || 50;
        baseDmg = Math.max(minDmg, baseDmg);
        
        let counterDmg = 0;
        const counterFactor = W.CounterAtkPowerFactor !== undefined ? W.CounterAtkPowerFactor : 0.05;

        if (counterRisk > 0 && type !== 'def_attack') {
            let isAttackerAction = true;
            if (type.startsWith('def_')) isAttackerAction = false;
            const opponentPower = isAttackerAction ? defPower : atkPower;
            counterDmg = Math.floor(opponentPower * counterFactor * counterRisk);
        }
        
        return { soldierDmg: Math.floor(baseDmg * soldierRate), wallDmg: Math.floor(baseDmg * wallRate * 0.5), counterDmg: counterDmg };
    }

    static calcScheme(atkBusho, defBusho, defCastleLoyalty) { 
        const atkInt = atkBusho.intelligence; 
        const defInt = defBusho ? defBusho.intelligence : 30; 
        const baseOffset = window.WarParams.War.SchemeBaseIntOffset || 20;
        const successRate = (atkInt / (defInt + baseOffset)) * window.MainParams.Strategy.SchemeSuccessRate; 
        if (Math.random() > successRate) return { success: false, damage: 0 }; 
        const loyaltyDiv = window.WarParams.War.LoyaltyDamageFactor || 500;
        const loyaltyBonus = (1000 - defCastleLoyalty) / loyaltyDiv; 
        return { success: true, damage: Math.floor(atkInt * window.WarParams.War.SchemeDamageFactor * (1.0 + loyaltyBonus)) }; 
    }

    static calcFire(atkBusho, defBusho) { 
        const atkInt = atkBusho.intelligence; 
        const defInt = defBusho ? defBusho.intelligence : 30; 
        const successRate = (atkInt / (defInt + 10)) * window.WarParams.War.FireSuccessBase; 
        if (Math.random() > successRate) return { success: false, damage: 0 }; 
        return { success: true, damage: Math.floor(atkInt * window.WarParams.War.FireDamageFactor * (Math.random() + 0.5)) }; 
    }

    static calcRetreatScore(castle) { 
        return castle.soldiers + (castle.defense * 0.5) + (castle.gold * 0.1) + (castle.rice * 0.1) + (castle.samuraiIds.length * 100); 
    }

    static getWarAdvice(gunshi, state) {
        const r = Math.random();
        if (state.attacker.soldiers > state.defender.soldiers * 1.5) { return r > 0.3 ? "我が軍が圧倒的です。一気に攻め落としましょう。" : "油断は禁物ですが、勝利は目前です。"; } 
        else if (state.attacker.soldiers < state.defender.soldiers * 0.8) { return "敵の兵数が勝っています。無理な突撃は控えるべきかと。"; }
        return "戦況は五分五分。敵の出方を見極めましょう。";
    }
}

class WarManager {
    constructor(game) {
        this.game = game;
        this.state = { active: false };
        this.pendingPrisoners = [];
    }

    getValidWarTargets(currentCastle) {
        return this.game.castles.filter(target => 
            GameSystem.isAdjacent(currentCastle, target) && 
            target.ownerClan !== this.game.playerClanId &&
            !this.game.getRelation(this.game.playerClanId, target.ownerClan).alliance &&
            (target.immunityUntil || 0) < this.game.getCurrentTurnId()
        ).map(t => t.id);
    }

    getAvailableCommands(isAtkTurn) {
        const s = this.state;
        if (!s.isPlayerInvolved) return [];
        const pid = Number(this.game.playerClanId);
        const atkClan = Number(s.attacker.ownerClan);
        const defClan = Number(s.defender.ownerClan);
        
        const isMyTurn = (isAtkTurn && atkClan === pid) || (!isAtkTurn && defClan === pid);
        if (!isMyTurn) return []; 
        const commands = [];
        if (isAtkTurn) {
            commands.push({ label: "突撃", type: "charge" });
            commands.push({ label: "斉射", type: "bow" });
            commands.push({ label: "城攻め", type: "siege" });
            commands.push({ label: "火計", type: "fire" });
            commands.push({ label: "謀略", type: "scheme" });
            commands.push({ label: "撤退", type: "retreat" });
        } else {
            commands.push({ label: "突撃", type: "def_charge" });
            commands.push({ label: "斉射", type: "def_bow" });
            commands.push({ label: "籠城", type: "def_attack" });
            commands.push({ label: "謀略", type: "scheme" });
            commands.push({ label: "補修", type: "repair_setup" }); 
            if (this.game.castles.some(c => c.ownerClan === s.defender.ownerClan && c.id !== s.defender.id && GameSystem.isAdjacent(c, s.defender))) {
                commands.push({ label: "撤退", type: "retreat" });
            }
        }
        return commands;
    }

    getGunshiAdvice(action) {
        if (action.type === 'war') return "合戦におもむきますか？ 兵力と兵糧の確認をお忘れなく。";
        if (this.state.active) {
            const gunshi = this.game.getClanGunshi(this.game.playerClanId);
            if (!gunshi) return null;
            return WarSystem.getWarAdvice(gunshi, this.state);
        }
        return null;
    }

    async startWar(atkCastle, defCastle, atkBushos, atkSoldierCount, atkRice) {
        try {
            const pid = Number(this.game.playerClanId);
            const atkClan = Number(atkCastle.ownerClan);
            const defClan = Number(defCastle.ownerClan);

            let isPlayerInvolved = (atkClan === pid || defClan === pid);

            atkCastle.soldiers = Math.max(0, atkCastle.soldiers - atkSoldierCount);
            atkCastle.rice = Math.max(0, atkCastle.rice - atkRice);

            const atkClanData = this.game.clans.find(c => c.id === atkClan); 
            const atkGeneral = atkBushos[0].name;
            const atkArmyName = atkClanData ? atkClanData.getArmyName() : "敵軍";
            
            let defBusho = this.game.getBusho(defCastle.castellanId); 
            if (!defBusho) defBusho = {name:"守備隊長", strength:30, leadership:30, intelligence:30, charm:30};
            
            const attackerForce = { 
                name: atkCastle.name + "遠征軍", 
                ownerClan: atkCastle.ownerClan, 
                soldiers: atkSoldierCount, 
                bushos: atkBushos, 
                training: atkCastle.training, 
                morale: atkCastle.morale,
                rice: atkRice, 
                maxRice: atkRice
            };
            
            this.state = { 
                active: true, round: 1, attacker: attackerForce, sourceCastle: atkCastle, 
                defender: defCastle, atkBushos: atkBushos, defBusho: defBusho, 
                turn: 'attacker', isPlayerInvolved: isPlayerInvolved, 
                deadSoldiers: { attacker: 0, defender: 0 }, defenderGuarding: false 
            };

            const showInterceptDialog = async (onResult) => {
                if (isPlayerInvolved) {
                    await this.game.ui.showCutin(`${atkArmyName}の${atkGeneral}が\n${defCastle.name}に攻め込みました！`);
                }

                if (defClan === pid) {
                    const modal = document.getElementById('intercept-confirm-modal');
                    if (modal) {
                        modal.classList.remove('hidden');
                        document.getElementById('intercept-msg').innerText = `${atkArmyName}の${atkGeneral}が攻めてきました！\n迎撃（野戦）しますか？籠城しますか？`;
                        document.getElementById('btn-intercept').onclick = () => { modal.classList.add('hidden'); onResult('field'); };
                        document.getElementById('btn-siege').onclick = () => { modal.classList.add('hidden'); onResult('siege'); };
                    } else {
                        onResult('siege');
                    }
                } else {
                    if (defCastle.soldiers >= atkSoldierCount * 0.8) {
                        onResult('field');
                    } else {
                        onResult('siege');
                    }
                }
            };

            if (typeof window.FieldWarManager === 'undefined') {
                this.startSiegeWarPhase();
            } else {
                showInterceptDialog((choice) => {
                    if (choice === 'field') {
                        if (!isPlayerInvolved) {
                            this.resolveAutoFieldWar();
                        } else {
                            if (!this.game.fieldWarManager) {
                                this.game.fieldWarManager = new window.FieldWarManager(this.game);
                            }
                            this.game.fieldWarManager.startFieldWar(this.state, (resultType) => {
                                if (resultType === 'attacker_win' || resultType === 'defender_retreat' || resultType === 'draw_to_siege') {
                                    this.startSiegeWarPhase();
                                } else {
                                    this.endWar(false);
                                }
                            });
                        }
                    } else {
                        this.startSiegeWarPhase();
                    }
                });
            }

        } catch(e) { 
            console.error("StartWar Error:", e);
            this.state.active = false; 
            this.game.finishTurn(); 
        }
    }

    resolveAutoFieldWar() {
        const s = this.state;
        let safetyLimit = 20;
        let turn = 1;

        const atkStats = WarSystem.calcUnitStats(s.atkBushos);
        const defStats = WarSystem.calcUnitStats([s.defBusho]);
        const consumeRate = (window.WarParams.War.RiceConsumptionAtk || 0.1) * 0.5;

        while (turn <= 20 && s.attacker.soldiers > 0 && s.defender.soldiers > 0 && safetyLimit > 0) {
            let resAtk = WarSystem.calcWarDamage(atkStats, defStats, s.attacker.soldiers, s.defender.soldiers, 0, s.attacker.morale, s.defender.training, 'charge');
            s.defender.soldiers -= Math.min(s.defender.soldiers, resAtk.soldierDmg);
            s.attacker.soldiers -= Math.min(s.attacker.soldiers, resAtk.counterDmg);

            if (s.defender.soldiers <= 0 || s.attacker.soldiers <= 0) break;

            let resDef = WarSystem.calcWarDamage(defStats, atkStats, s.defender.soldiers, s.attacker.soldiers, 0, s.defender.morale, s.attacker.training, 'charge');
            s.attacker.soldiers -= Math.min(s.attacker.soldiers, resDef.soldierDmg);
            s.defender.soldiers -= Math.min(s.defender.soldiers, resDef.counterDmg);

            s.attacker.rice = Math.max(0, s.attacker.rice - Math.floor(s.attacker.soldiers * consumeRate));
            s.defender.rice = Math.max(0, s.defender.rice - Math.floor(s.defender.soldiers * consumeRate));

            if (s.attacker.rice <= 0 || s.defender.rice <= 0) break;

            if (s.attacker.soldiers < s.defender.soldiers * 0.2) break;
            if (s.defender.soldiers < s.attacker.soldiers * 0.2) break;

            turn++;
            safetyLimit--;
        }

        const atkLost = s.attacker.soldiers <= 0 || s.attacker.rice <= 0 || (s.attacker.soldiers < s.defender.soldiers * 0.2);
        const defLost = s.defender.soldiers <= 0 || s.defender.rice <= 0 || (s.defender.soldiers < s.attacker.soldiers * 0.2);

        if (atkLost && !defLost) {
            this.endWar(false); 
        } else if (defLost && !atkLost) {
            this.startSiegeWarPhase(); 
        } else if (turn > 20) {
            this.startSiegeWarPhase(); 
        } else {
            this.endWar(false);
        }
    }

    startSiegeWarPhase() {
        const s = this.state;
        const W = window.WarParams.War;
        s.defender.loyalty = Math.max(0, s.defender.loyalty - (W.AttackLoyaltyDecay || 50)); 
        s.defender.population = Math.max(0, s.defender.population - (W.AttackPopDecay || 500));
        
        if (s.isPlayerInvolved) { 
            setTimeout(() => {
                this.game.ui.setWarModalVisible(true);
                this.game.ui.clearWarLog();
                this.game.ui.log(`★ ${s.sourceCastle.name}軍が${s.defender.name}への籠城戦を開始！`); 
                this.game.ui.updateWarUI(); 
                this.processWarRound(); 
            }, 500); 
        } else { 
            setTimeout(() => { this.resolveAutoWar(); }, 100); 
        }
    }

    resolveAutoWar() { 
        try { 
            const s = this.state;
            const pid = Number(this.game.playerClanId);
            const defClan = Number(s.defender.ownerClan);

            if (s.isPlayerInvolved || defClan === pid) {
                console.warn("AutoWar aborted: Player is involved.");
                s.isPlayerInvolved = true;
                this.game.ui.setWarModalVisible(true);
                this.game.ui.updateWarUI();
                this.processWarRound();
                return;
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
            const defLost = s.defender.soldiers <= 0 || s.defender.defense <= 0 || s.defender.rice <= 0;
            this.endWar(defLost); 
        } catch(e) { console.error(e); this.endWar(false); } 
    }

    processWarRound() { 
        if (!this.state.active) return; 
        const s = this.state; 
        
        if (s.turn === 'attacker' && s.round > 1) {
             const atkCons = Math.floor(s.attacker.soldiers * window.WarParams.War.RiceConsumptionAtk);
             const defCons = Math.floor(s.defender.soldiers * window.WarParams.War.RiceConsumptionDef);
             s.attacker.rice = Math.max(0, s.attacker.rice - atkCons);
             s.defender.rice = Math.max(0, s.defender.rice - defCons);
        }

        if (s.defender.soldiers <= 0 || s.defender.defense <= 0) { this.endWar(true); return; } 
        if (s.attacker.soldiers <= 0) { this.endWar(false); return; } 
        if (s.attacker.rice <= 0) {
             if(s.isPlayerInvolved) this.game.ui.log("攻撃軍、兵糧尽きる！");
             this.endWar(false); 
             return;
        }
        if (s.defender.rice <= 0) {
             if(s.isPlayerInvolved) this.game.ui.log("守備軍、兵糧尽きる！");
             this.endWar(true); 
             return;
        }
        
        this.game.ui.updateWarUI(); 
        const isAtkTurn = (s.turn === 'attacker'); 
        this.game.ui.renderWarControls(isAtkTurn); 
        
        const pid = Number(this.game.playerClanId);
        const atkClan = Number(s.attacker.ownerClan);
        const defClan = Number(s.defender.ownerClan);
        const isMyTurn = (isAtkTurn && atkClan === pid) || (!isAtkTurn && defClan === pid);
        
        if (!isMyTurn) { setTimeout(() => this.execWarAI(), 800); } 
    }

    execWarCmd(type, extraVal = null) { 
        if (!this.state.active) return;
        if (type === 'repair_setup') { window.GameApp.ui.openQuantitySelector('war_repair', [this.state.defender], null); return; }
        if(type==='scheme'||type==='fire') this.resolveWarAction(type); 
        else { 
            const ctrl = document.getElementById('war-controls');
            if(ctrl) ctrl.classList.add('disabled-area');
            this.resolveWarAction(type, extraVal); 
        } 
    }

    execWarAI() { 
        if (!this.state.active) return; 
        const s = this.state;
        const actor = s.turn === 'attacker' ? s.atkBushos[0] : s.defBusho; 
        const isDefender = (s.turn === 'defender');
        
        const pid = Number(this.game.playerClanId);
        const currentSideClan = isDefender ? Number(s.defender.ownerClan) : Number(s.attacker.ownerClan);
        if (currentSideClan === pid) return;

        const diff = window.AIParams.AI.Difficulty || 'normal';
        let smartness = actor.intelligence / 100.0;
        if (diff === 'hard') smartness = Math.min(1.0, smartness + 0.2);
        if (diff === 'easy') smartness = Math.max(0.1, smartness - 0.2);

        if (isDefender) {
            const dangerRatio = s.defender.soldiers / (s.attacker.soldiers + 1);
            let retreatThreshold = 0.2 + (smartness * 0.2); 
            if (dangerRatio < retreatThreshold && s.defender.defense < 200) { 
                this.resolveWarAction('retreat'); return; 
            }
            const defenseRatio = s.defender.defense / (s.defender.maxDefense || 1000); 
            if (defenseRatio < 0.7 && s.defender.soldiers > 500 && Math.random() < smartness) {
                 this.resolveWarAction('repair', Math.min(s.defender.soldiers, 100)); return;
            }
        } else {
            if (s.attacker.rice < s.attacker.soldiers * 0.1 * 2) { 
                 if (s.attacker.soldiers < s.defender.soldiers * 0.5) {
                     this.resolveWarAction('retreat'); return;
                 }
            }
            if (s.attacker.soldiers < s.defender.soldiers * 0.3 && smartness > 0.5) {
                this.resolveWarAction('retreat'); return;
            }
        }

        const options = [];
        if (isDefender) options.push('def_charge', 'def_bow', 'def_attack');
        else options.push('charge', 'bow', 'siege');
        
        if (actor.intelligence > 30) options.push('scheme');
        if (actor.intelligence > 50 && !isDefender) options.push('fire');

        let bestCmd = options[0];
        let bestScore = -Infinity;
        const W = window.WarParams.War;

        options.forEach(cmd => {
            let score = 0; let multiplier = 1.0; let risk = 1.0;
            if (cmd === 'charge') { multiplier = W.ChargeMultiplier; risk = W.ChargeRisk; }
            else if (cmd === 'bow') { multiplier = W.BowMultiplier; risk = W.BowRisk; }
            else if (cmd === 'siege') { multiplier = W.SiegeMultiplier; risk = W.SiegeRisk; }
            else if (cmd === 'def_charge') { multiplier = W.DefChargeMultiplier; risk = W.DefChargeRisk; }
            else if (cmd === 'def_bow') { multiplier = W.DefBowMultiplier; risk = 0.5; }
            else if (cmd === 'def_attack') { multiplier = 0; risk = 0; } 

            const enemyDefense = isDefender ? 0 : s.defender.defense; 

            if (cmd === 'siege') score += (multiplier * 50) + (enemyDefense > 0 ? 100 : 0);
            else if (cmd === 'def_attack') score += (s.defender.soldiers < s.attacker.soldiers) ? 200 : -100;
            else score += multiplier * 100;

            score -= (risk * 50 * smartness);
            if (cmd === 'scheme' || cmd === 'fire') {
                const successProb = (actor.intelligence / 100);
                score = (successProb * 150) - (50 * smartness); 
            }
            score += (Math.random() * 200) * (1.0 - smartness);

            if (score > bestScore) { bestScore = score; bestCmd = cmd; }
        });

        this.resolveWarAction(bestCmd); 
    }

    resolveWarAction(type, extraVal = null) {
        if (!this.state.active) return;
        const s = this.state;
        if(type === 'retreat') { if(s.turn === 'attacker') { this.endWar(false, true); } else { this.executeRetreatLogic(s.defender); } return; }
        
        const isAtkTurn = (s.turn === 'attacker'); const target = isAtkTurn ? s.defender : s.attacker;
        let atkStats = WarSystem.calcUnitStats(s.atkBushos); 
        let defStats = { str: s.defBusho.strength, int: s.defBusho.intelligence, ldr: s.defBusho.leadership };
        
        if (type === 'def_attack') { 
             s.defenderGuarding = true;
             if(s.isPlayerInvolved) this.game.ui.log(`R${s.round} [守] 籠城し、守りを固めている！`);
             this.advanceWarTurn(); return;
        }
        if (type === 'repair') { 
             const soldierCost = extraVal || 50; 
             if (s.defender.soldiers > soldierCost) {
                 const W = window.WarParams.War;
                 s.defender.soldiers -= soldierCost;
                 const castleBushos = this.game.getCastleBushos(s.defender.id);
                 const politicsList = castleBushos.map(b => b.politics).sort((a,b) => b - a);
                 const maxPol = politicsList.length > 0 ? politicsList[0] : 0;
                 let subPolSum = 0; for(let i=1; i<politicsList.length; i++) subPolSum += politicsList[i];
                 let rawPower = (soldierCost * W.RepairSoldierFactor) + (maxPol * W.RepairMainPolFactor) + (subPolSum * W.RepairSubPolFactor);
                 let recover = Math.floor(rawPower * W.RepairGlobalMultiplier);
                 s.defender.defense += recover;
                 if(s.isPlayerInvolved) this.game.ui.log(`R${s.round} [守] 補修を実行！ (兵-${soldierCost} 防+${recover})`);
             } else { if(s.isPlayerInvolved) this.game.ui.log(`R${s.round} [守] 補修しようとしたが兵が足りない！`); }
             this.advanceWarTurn(); return;
        }

        if (type === 'scheme') { 
            const actor = isAtkTurn ? s.atkBushos[0] : s.defBusho; 
            const targetBusho = isAtkTurn ? s.defBusho : s.atkBushos[0]; 
            const result = WarSystem.calcScheme(actor, targetBusho, isAtkTurn ? s.defender.loyalty : 1000); 
            if (!result.success) { if (s.isPlayerInvolved) this.game.ui.log(`R${s.round} 謀略失敗！`); } 
            else { 
                target.soldiers = Math.max(0, target.soldiers - result.damage); 
                if (s.isPlayerInvolved) this.game.ui.log(`R${s.round} 謀略成功！ 兵士に${result.damage}の被害`); 
            } 
            this.advanceWarTurn(); return; 
        }
        
        if (type === 'fire') { 
            const actor = isAtkTurn ? s.atkBushos[0] : s.defBusho; 
            const targetBusho = isAtkTurn ? s.defBusho : s.atkBushos[0]; 
            const result = WarSystem.calcFire(actor, targetBusho); 
            if (!result.success) { if (s.isPlayerInvolved) this.game.ui.log(`R${s.round} 火攻失敗！`); } 
            else { 
                if(isAtkTurn) s.defender.defense = Math.max(0, s.defender.defense - result.damage); 
                else target.soldiers = Math.max(0, target.soldiers - 50); 
                if (s.isPlayerInvolved) this.game.ui.log(`R${s.round} 火攻成功！ ${isAtkTurn?'防御':'兵士'}に${result.damage}の被害`); 
            } 
            this.advanceWarTurn(); return; 
        }
        
        const result = WarSystem.calcWarDamage(atkStats, defStats, s.attacker.soldiers, s.defender.soldiers, s.defender.defense, s.attacker.morale, s.defender.training, type);
        
        let calculatedSoldierDmg = result.soldierDmg;
        let calculatedWallDmg = result.wallDmg;

        if (isAtkTurn && s.defenderGuarding) {
             calculatedSoldierDmg = Math.floor(calculatedSoldierDmg * window.WarParams.War.RojoDamageReduction); 
             calculatedWallDmg = Math.floor(calculatedWallDmg * window.WarParams.War.RojoDamageReduction);
             s.defenderGuarding = false; 
             if (s.isPlayerInvolved) this.game.ui.log(`(籠城効果によりダメージ軽減)`);
        }

        let actualSoldierDmg = Math.min(target.soldiers, calculatedSoldierDmg);
        let actualWallDmg = calculatedWallDmg;

        target.soldiers -= actualSoldierDmg;
        if(isAtkTurn) s.deadSoldiers.defender += actualSoldierDmg; else s.deadSoldiers.attacker += actualSoldierDmg;
        if (isAtkTurn) s.defender.defense = Math.max(0, s.defender.defense - actualWallDmg);
        
        if(result.counterDmg > 0) { 
            const actorArmy = isAtkTurn ? s.attacker : s.defender; 
            const actualCounterDmg = Math.min(actorArmy.soldiers, result.counterDmg);
            actorArmy.soldiers -= actualCounterDmg;
            if(isAtkTurn) s.deadSoldiers.attacker += actualCounterDmg; else s.deadSoldiers.defender += actualCounterDmg;
            if(s.isPlayerInvolved) this.game.ui.log(`(反撃被害: ${actualCounterDmg})`); 
        }
        
        if (s.isPlayerInvolved) { 
            let actionName = type.includes('bow') ? "弓攻撃" : type.includes('siege') ? "城攻め" : "力攻め"; 
            if (type.includes('def_')) actionName = type === 'def_bow' ? "斉射" : type === 'def_charge' ? "突撃" : "反撃"; 
            let msg = (actualWallDmg > 0) ? `${actionName} (兵-${actualSoldierDmg} 防-${actualWallDmg})` : `${actionName} (兵-${actualSoldierDmg})`; 
            this.game.ui.log(`R${s.round} [${isAtkTurn?'攻':'守'}] ${msg}`); 
        }
        this.advanceWarTurn();
    }

    advanceWarTurn() { 
        if (!this.state.active) return;
        const s = this.state; 
        if (s.turn === 'attacker') s.turn = 'defender'; 
        else { 
            s.turn = 'attacker'; 
            s.round++; 
            if(s.round > window.WarParams.Military.WarMaxRounds) { 
                this.endWar(false); 
                return; 
            } 
        } 
        if (s.isPlayerInvolved) this.processWarRound(); 
    }
    
    executeRetreatLogic(defCastle) {
        const candidates = this.game.castles.filter(c => c.ownerClan === defCastle.ownerClan && c.id !== defCastle.id && GameSystem.isAdjacent(c, defCastle));
        if (candidates.length === 0) { this.endWar(true); return; }
        const s = this.state;
        
        const runRetreat = (targetId) => {
            if (!targetId) { this.endWar(true); return; } 
            const target = this.game.castles.find(c => c.id === targetId);
            if(target) {
                const enemySoldiers = s.attacker.soldiers;
                const mySoldiers = defCastle.soldiers;
                const baseLoss = window.WarParams.War.RetreatResourceLossFactor; 
                let lossRate = baseLoss + (enemySoldiers / (mySoldiers + 1)) * 0.1;
                lossRate = Math.min(0.9, Math.max(0.05, lossRate)); 
                const carryGold = Math.floor(defCastle.gold * (1.0 - lossRate));
                const carryRice = Math.floor(defCastle.rice * (1.0 - lossRate));
                const lostGold = defCastle.gold - carryGold;
                target.gold += carryGold; target.rice += carryRice; target.soldiers += defCastle.soldiers;
                
                const bushos = this.game.getCastleBushos(defCastle.id);
                const capturedBushos = [];
                bushos.forEach(b => { 
                    let rate = window.WarParams.War.RetreatCaptureRate;
                    if(b.isDaimyo) rate = Math.max(0, rate - window.WarParams.War.DaimyoCaptureReduction);
                    if(Math.random() < rate) { capturedBushos.push(b); } 
                    else { 
                        b.castleId = target.id; b.isCastellan = false; target.samuraiIds.push(b.id); 
                        this.game.factionSystem.handleMove(b, defCastle.id, target.id);
                    }
                });
                defCastle.gold = lostGold; defCastle.rice = 0; defCastle.soldiers = 0; defCastle.samuraiIds = []; defCastle.castellanId = 0;
                
                this.game.updateCastleLord(defCastle);
                this.game.updateCastleLord(target);
                
                if(s.isPlayerInvolved) {
                    this.game.ui.log(`${defCastle.name}から${target.name}へ撤退しました。`);
                    this.game.ui.log(`(物資搬出率: ${(100*(1-lossRate)).toFixed(0)}%, 捕縛者: ${capturedBushos.length}名)`);
                }
                this.endWar(true, true, capturedBushos, target.id); 
            }
        };
        if (defCastle.ownerClan === this.game.playerClanId) { 
            if (candidates.length === 1) runRetreat(candidates[0].id); 
            else this.game.ui.showRetreatSelector(defCastle, candidates, (id) => runRetreat(id)); 
        } else { 
            candidates.sort((a,b) => WarSystem.calcRetreatScore(b) - WarSystem.calcRetreatScore(a)); 
            runRetreat(candidates[0].id); 
        }
    }

    endWar(attackerWon, isRetreat = false, capturedInRetreat = [], retreatTargetId = null) { 
        try {
            const s = this.state; s.active = false; 
            const W = window.WarParams.War;

            s.atkBushos.forEach(b => {
                this.game.factionSystem.recordBattle(b, s.defender.id);
                this.game.factionSystem.updateRecognition(b, 25);
            });
            const defBushos = this.game.getCastleBushos(s.defender.id).concat(this.pendingPrisoners);
            if (s.defBusho && s.defBusho.id) {
                if (!defBushos.find(b => b.id === s.defBusho.id)) defBushos.push(s.defBusho);
            }
            defBushos.forEach(b => {
                this.game.factionSystem.recordBattle(b, s.defender.id);
                this.game.factionSystem.updateRecognition(b, 25);
            });

            if (s.isPlayerInvolved) { this.game.ui.setWarModalVisible(false); }
            const isShortWar = s.round < window.WarParams.War.ShortWarTurnLimit;
            
            const baseRecov = window.WarParams.War.BaseRecoveryRate;
            const highRecov = window.WarParams.War.RetreatRecoveryRate;
            const attackerRecovered = Math.floor(s.deadSoldiers.attacker * baseRecov);
            const totalAtkSurvivors = s.attacker.soldiers + attackerRecovered;

            if (s.attacker.rice > 0) {
                if (attackerWon) { s.defender.rice += s.attacker.rice; } 
                else { const srcC = this.game.getCastle(s.sourceCastle.id); if (srcC) srcC.rice += s.attacker.rice; }
            }

            if (isRetreat && retreatTargetId) {
                const targetC = this.game.getCastle(retreatTargetId);
                if (targetC) {
                    const recovered = Math.floor(s.deadSoldiers.defender * (isShortWar ? highRecov : baseRecov));
                    targetC.soldiers += (s.defender.soldiers + recovered);
                    if (s.isPlayerInvolved && recovered > 0) this.game.ui.log(`(撤退先にて負傷兵 ${recovered}名 が復帰)`);
                }
            } else if (!isRetreat && attackerWon) {
                const survivors = Math.max(0, s.defender.soldiers);
                const recovered = Math.floor(s.deadSoldiers.defender * 0.2);
                const totalAbsorbed = survivors + recovered;
                s.defender.soldiers = totalAtkSurvivors + totalAbsorbed;
                if (s.isPlayerInvolved && totalAbsorbed > 0) this.game.ui.log(`(敵残存兵・負傷兵 計${totalAbsorbed}名 を吸収)`);
            } else if (!attackerWon) {
                const srcC = this.game.getCastle(s.sourceCastle.id); srcC.soldiers += totalAtkSurvivors; 
                const recovered = Math.floor(s.deadSoldiers.defender * baseRecov);
                s.defender.soldiers += recovered;
                if (s.isPlayerInvolved && attackerRecovered > 0) this.game.ui.log(`(遠征軍 負傷兵 ${attackerRecovered}名 が帰還)`);
            }

            if (isRetreat && capturedInRetreat.length > 0) {
                this.pendingPrisoners = capturedInRetreat;
                if (s.attacker.ownerClan === this.game.playerClanId) this.game.ui.showPrisonerModal(capturedInRetreat);
                else this.autoResolvePrisoners(capturedInRetreat, s.attacker.ownerClan);
            }
            
            if (isRetreat && attackerWon) {
                s.defender.ownerClan = s.attacker.ownerClan; s.defender.investigatedUntil = 0;
                s.defender.soldiers = totalAtkSurvivors;

                const srcC = this.game.getCastle(s.sourceCastle.id); 
                s.atkBushos.forEach((b, idx) => { 
                    srcC.samuraiIds = srcC.samuraiIds.filter(id => id !== b.id); 
                    this.game.factionSystem.handleMove(b, s.sourceCastle.id, s.defender.id); 
                    b.castleId = s.defender.id; s.defender.samuraiIds.push(b.id); 
                    b.isCastellan = false; // 城主の自動選出に任せる
                });
                
                this.game.updateCastleLord(srcC);
                this.game.updateCastleLord(s.defender);

                if (s.isPlayerInvolved) {
                    const msg = `撤退しました。\n${retreatTargetId ? '部隊は移動しました。' : '部隊は解散しました。'}`;
                    this.game.ui.showResultModal(msg, () => this.game.finishTurn());
                } else { this.game.finishTurn(); }
                return;
            }

            const currentTurnId = this.game.getCurrentTurnId();
            let resultMsg = "";
            
            if (attackerWon) { 
                const statInc = W.WinStatIncrease || 5;
                s.attacker.training = Math.min(120, s.attacker.training + statInc); s.attacker.morale = Math.min(120, s.attacker.morale + statInc); 
                this.processCaptures(s.defender, s.attacker.ownerClan);
                const atkBushos = s.atkBushos;
                const maxCharm = Math.max(...atkBushos.map(b => b.charm));
                const subCharm = atkBushos.reduce((acc, b) => acc + b.charm, 0) - maxCharm;
                const daimyo = this.game.bushos.find(b => b.clan === s.attacker.ownerClan && b.isDaimyo) || {charm: 50};
                const charmScore = maxCharm + (subCharm * 0.1) + (daimyo.charm * window.WarParams.War.DaimyoCharmWeight);
                const baseLoot = window.WarParams.War.LootingBaseRate;
                let lossRate = baseLoot - (charmScore * window.WarParams.War.LootingCharmFactor);
                lossRate = Math.max(0, lossRate); 
                if (lossRate > 0) {
                    const lostGold = Math.floor(s.defender.gold * lossRate);
                    const lostRice = Math.floor(s.defender.rice * lossRate);
                    s.defender.gold -= lostGold; s.defender.rice -= lostRice;
                    if (s.isPlayerInvolved) this.game.ui.log(`(敵兵の持ち逃げにより 金${lostGold}, 米${lostRice} が失われた)`);
                }
                
                s.defender.ownerClan = s.attacker.ownerClan; s.defender.investigatedUntil = 0; s.defender.immunityUntil = currentTurnId + 1;
                
                const srcC = this.game.getCastle(s.sourceCastle.id); 
                s.atkBushos.forEach((b, idx) => { 
                    srcC.samuraiIds = srcC.samuraiIds.filter(id => id !== b.id); 
                    this.game.factionSystem.handleMove(b, s.sourceCastle.id, s.defender.id); 
                    b.castleId = s.defender.id; s.defender.samuraiIds.push(b.id); 
                    b.isCastellan = false; // 城主自動選出に任せる
                }); 
                
                this.game.updateCastleLord(srcC);
                this.game.updateCastleLord(s.defender);
                
                resultMsg = `${s.defender.name}が制圧されました！\n勝者: ${s.attacker.name}`;
            } else { 
                s.defender.immunityUntil = currentTurnId; 
                if (isRetreat) resultMsg = `${s.defender.name}から撤退しました……`;
                else resultMsg = `${s.defender.name}を守り抜きました！\n敗者: ${s.attacker.name}`;
            } 

            if (s.isPlayerInvolved) {
                this.game.ui.showResultModal(resultMsg, () => { this.game.finishTurn(); });
            } else { this.game.finishTurn(); }
        } catch (e) {
            console.error("EndWar Error: ", e);
            if (this.state.isPlayerInvolved) {
                this.game.ui.showResultModal("合戦処理中にエラーが発生しましたが、\nゲームを継続します。", () => { this.game.finishTurn(); });
            } else { this.game.finishTurn(); }
        }
    }
    
    processCaptures(defeatedCastle, winnerClanId) { 
        const losers = this.game.getCastleBushos(defeatedCastle.id); const captives = []; const escapees = [];
        const friendlyCastles = this.game.castles.filter(c => c.ownerClan === defeatedCastle.ownerClan && c.id !== defeatedCastle.id);
        const isLastStand = friendlyCastles.length === 0;
        
        const W = window.WarParams.War;
        const captureBase = W.CaptureChanceBase || 0.4;
        const captureStrFactor = W.CaptureStrFactor || 0.002;

        losers.forEach(b => { 
            let chance = isLastStand ? 1.0 : (captureBase - (b.strength * captureStrFactor) + (Math.random() * 0.3)); 
            if (!isLastStand && defeatedCastle.soldiers > 1000) chance -= 0.2; 
            if (!isLastStand && b.isDaimyo) chance -= window.WarParams.War.DaimyoCaptureReduction;
            
            if (chance > 0.5) { 
                b.isCastellan = false; // ★【追加】捕虜になる時に城主権限を剥奪
                captives.push(b); defeatedCastle.samuraiIds = defeatedCastle.samuraiIds.filter(id => id !== b.id);
            } else { 
                if (friendlyCastles.length > 0) {
                    const escapeCastle = friendlyCastles[Math.floor(Math.random() * friendlyCastles.length)];
                    defeatedCastle.samuraiIds = defeatedCastle.samuraiIds.filter(id => id !== b.id);
                    this.game.factionSystem.handleMove(b, defeatedCastle.id, escapeCastle.id); 
                    b.castleId = escapeCastle.id; b.isCastellan = false; escapeCastle.samuraiIds.push(b.id); escapees.push(b);
                    this.game.updateCastleLord(escapeCastle);
                } else { 
                    defeatedCastle.samuraiIds = defeatedCastle.samuraiIds.filter(id => id !== b.id);
                    b.clan = 0; b.castleId = 0; b.isCastellan = false; b.status = 'ronin'; 
                }
            } 
        }); 
        if (escapees.length > 0 && (defeatedCastle.ownerClan === this.game.playerClanId || winnerClanId === this.game.playerClanId)) this.game.ui.log(`${escapees.length}名の武将が自領へ逃げ帰りました。`);
        if (captives.length > 0) { 
            this.pendingPrisoners = captives; 
            if (winnerClanId === this.game.playerClanId) this.game.ui.showPrisonerModal(captives); 
            else this.autoResolvePrisoners(captives, winnerClanId); 
        } 
    }
    
    handlePrisonerAction(index, action) { 
        const prisoner = this.pendingPrisoners[index]; const originalClanId = prisoner.clan;
        if (action === 'hire') { 
            const myBushos = this.game.bushos.filter(b=>b.clan===this.game.playerClanId); const recruiter = myBushos.find(b => b.isDaimyo) || myBushos[0]; 
            const score = (recruiter.charm * 2.0) / (prisoner.loyalty * 1.5); 
            if (prisoner.isDaimyo) alert(`${prisoner.name}「敵の軍門には下らぬ！」`); 
            else if (score > Math.random()) { 
                prisoner.clan = this.game.playerClanId; prisoner.loyalty = 50; 
                prisoner.isCastellan = false; // ★【念のため追加】加入時に一旦フラグを折る
                const targetC = this.game.getCastle(prisoner.castleId); 
                if(targetC) {
                    targetC.samuraiIds.push(prisoner.id); 
                    this.game.updateCastleLord(targetC);
                }
                alert(`${prisoner.name}を登用しました！`); 
            } 
            else alert(`${prisoner.name}は登用を拒否しました……`); 
        } else if (action === 'kill') { 
            if (prisoner.isDaimyo) this.handleDaimyoDeath(prisoner); prisoner.status = 'dead'; prisoner.clan = 0; prisoner.castleId = 0; 
        } else if (action === 'release') { 
            const friendlyCastles = this.game.castles.filter(c => c.ownerClan === originalClanId);
            if (friendlyCastles.length > 0) {
                const returnCastle = friendlyCastles[Math.floor(Math.random() * friendlyCastles.length)];
                prisoner.castleId = returnCastle.id; prisoner.isCastellan = false; prisoner.status = 'active'; returnCastle.samuraiIds.push(prisoner.id);
                this.game.factionSystem.handleMove(prisoner, 0, returnCastle.id); 
                this.game.updateCastleLord(returnCastle);
                alert(`${prisoner.name}を解放しました。(自領へ帰還しました)`);
            } else { prisoner.status = 'ronin'; prisoner.clan = 0; prisoner.castleId = 0; alert(`${prisoner.name}を解放しました。(在野へ下りました)`); }
        } 
        this.pendingPrisoners.splice(index, 1); 
        if (this.pendingPrisoners.length === 0) this.game.ui.closePrisonerModal(); else this.game.ui.showPrisonerModal(this.pendingPrisoners); 
    }
    
    handleDaimyoDeath(daimyo) { 
        const clanId = daimyo.clan; if(clanId === 0) return; 
        const candidates = this.game.bushos.filter(b => b.clan === clanId && b.id !== daimyo.id && b.status !== 'dead' && b.status !== 'ronin'); 
        if (candidates.length === 0) { 
            const clanCastles = this.game.castles.filter(c => c.ownerClan === clanId); 
            clanCastles.forEach(c => { c.ownerClan = 0; const lords = this.game.getCastleBushos(c.id); lords.forEach(l => { l.clan=0; l.status='ronin'; }); }); return; 
        } 
        if (clanId === this.game.playerClanId) this.game.ui.showSuccessionModal(candidates, (newLeaderId) => this.game.changeLeader(clanId, newLeaderId)); 
        else { candidates.sort((a,b) => (b.politics + b.charm) - (a.politics + a.charm)); this.game.changeLeader(clanId, candidates[0].id); } 
    }
    
    autoResolvePrisoners(captives, winnerClanId) { 
        const aiBushos = this.game.bushos.filter(b => b.clan === winnerClanId); 
        const leaderInt = aiBushos.length > 0 ? Math.max(...aiBushos.map(b => b.intelligence)) : 50; 
        const recruitThreshold = window.WarParams.War.PrisonerRecruitThreshold || 60;

        captives.forEach(p => { 
            if (p.isDaimyo) { this.handleDaimyoDeath(p); p.status = 'dead'; p.clan = 0; p.castleId = 0; return; } 
            if ((leaderInt / 100) > Math.random()) { 
                p.clan = winnerClanId; p.loyalty = 50; 
                p.isCastellan = false; // ★追加
                const targetC = this.game.getCastle(p.castleId);
                if (targetC && !targetC.samuraiIds.includes(p.id)) {
                    targetC.samuraiIds.push(p.id);
                    this.game.updateCastleLord(targetC);
                }
                return; 
            } 
            if (p.charm > recruitThreshold) { p.status = 'ronin'; p.clan = 0; p.castleId = 0; } 
            else { p.status = 'dead'; p.clan = 0; p.castleId = 0; } 
        }); 
    }
}