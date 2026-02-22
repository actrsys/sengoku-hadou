/**
 * war.js
 * 戦争処理マネージャー & 戦争計算ロジック
 * 修正: 捕虜の処遇結果のアラートをカスタムダイアログ（showDialog）に置き換えました
 * 修正: 迎撃時の出陣兵士・兵糧の取得処理を修正（ID指定のオブジェクト構造に対応）
 * ★追加: 国人衆の蜂起（反乱）・制圧時の特別な結末と、捕虜の特別ルールを追加しました
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
        CaptureChanceBase: 0.4, CaptureStrFactor: 0.002, PrisonerRecruitThreshold: 60
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
        
        let counterDmg = 0;
        if (counterRisk > 0 && type !== 'def_attack') {
            const opponentPower = type.startsWith('def_') ? atkPower : defPower;
            counterDmg = Math.floor(opponentPower * (W.CounterAtkPowerFactor !== undefined ? W.CounterAtkPowerFactor : 0.05) * counterRisk);
        }
        return { soldierDmg: Math.floor(baseDmg * soldierRate), wallDmg: Math.floor(baseDmg * wallRate * 0.5), counterDmg: counterDmg };
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
        const isMyTurn = (isAtkTurn && Number(s.attacker.ownerClan) === Number(this.game.playerClanId)) || (!isAtkTurn && Number(s.defender.ownerClan) === Number(this.game.playerClanId));
        if (!isMyTurn) return []; 
        const commands = [];
        if (isAtkTurn) {
            commands.push({ label: "突撃", type: "charge" }, { label: "斉射", type: "bow" }, { label: "城攻め", type: "siege" }, { label: "火計", type: "fire" }, { label: "謀略", type: "scheme" }, { label: "撤退", type: "retreat" });
        } else {
            commands.push({ label: "突撃", type: "def_charge" }, { label: "斉射", type: "def_bow" }, { label: "籠城", type: "def_attack" }, { label: "謀略", type: "scheme" }, { label: "補修", type: "repair_setup" }); 
            if (this.game.castles.some(c => c.ownerClan === s.defender.ownerClan && c.id !== s.defender.id && GameSystem.isAdjacent(c, s.defender))) commands.push({ label: "撤退", type: "retreat" });
        }
        return commands;
    }

    getGunshiAdvice(action) {
        if (action.type === 'war') return "合戦におもむきますか？ 兵力と兵糧の確認をお忘れなく。";
        if (this.state.active) { const gunshi = this.game.getClanGunshi(this.game.playerClanId); return gunshi ? WarSystem.getWarAdvice(gunshi, this.state) : null; }
        return null;
    }

    autoDivideSoldiers(bushos, totalSoldiers) {
        if (!bushos || bushos.length === 0) return [];
        if (bushos.length === 1) return [{ busho: bushos[0], soldiers: totalSoldiers }];
        const assignments = [];
        const ratioSum = 1.5 + (bushos.length - 1) * 1.0;
        const baseAmount = Math.floor(totalSoldiers / ratioSum);
        let remain = totalSoldiers;
        for (let i = 1; i < bushos.length; i++) { assignments.push({ busho: bushos[i], soldiers: baseAmount }); remain -= baseAmount; }
        assignments.unshift({ busho: bushos[0], soldiers: remain });
        return assignments;
    }

    async startWar(atkCastle, defCastle, atkBushos, atkSoldierCount, atkRice) {
        try {
            // 攻撃部隊の中に大名がいれば探し、いなければ城主を探す
            let atkLeaderIdx = atkBushos.findIndex(b => b.isDaimyo);
            if (atkLeaderIdx === -1) atkLeaderIdx = atkBushos.findIndex(b => b.isCastellan);
            // 大名か城主が見つかったら、列の一番前（総大将）に移動させる
            if (atkLeaderIdx > 0) {
                const leader = atkBushos.splice(atkLeaderIdx, 1)[0];
                atkBushos.unshift(leader);
            }
            const pid = Number(this.game.playerClanId);
            const atkClan = Number(atkCastle.ownerClan);
            const defClan = Number(defCastle.ownerClan);
            let isPlayerInvolved = (atkClan === pid || defClan === pid);

            atkCastle.soldiers = Math.max(0, atkCastle.soldiers - atkSoldierCount);
            atkCastle.rice = Math.max(0, atkCastle.rice - atkRice);
            atkBushos.forEach(b => b.isActionDone = true);

            const atkClanData = this.game.clans.find(c => c.id === atkClan); 
            // ★修正: 国人衆の場合は専用の名前を使う
            const atkArmyName = atkCastle.isKunishu ? atkCastle.name : (atkClanData ? atkClanData.getArmyName() : "敵軍");
            let defBusho = this.game.getBusho(defCastle.castellanId) || {name:"守備隊長", strength:30, leadership:30, intelligence:30, charm:30};
            
            const attackerForce = { 
                name: atkCastle.isKunishu ? atkCastle.name : atkCastle.name + "遠征軍", 
                ownerClan: atkCastle.ownerClan, 
                soldiers: atkSoldierCount, 
                bushos: atkBushos, 
                training: atkCastle.training, 
                morale: atkCastle.morale, 
                rice: atkRice, 
                maxRice: atkRice,
                isKunishu: atkCastle.isKunishu || false // ★追加: 国人衆フラグ
            };
            
            this.state = { 
                active: true, round: 1, attacker: attackerForce, sourceCastle: atkCastle, 
                defender: defCastle, atkBushos: atkBushos, defBusho: defBusho, 
                turn: 'attacker', isPlayerInvolved: isPlayerInvolved, deadSoldiers: { attacker: 0, defender: 0 }, defenderGuarding: false 
            };

            const showInterceptDialog = async (onResult) => {
                if (isPlayerInvolved) await this.game.ui.showCutin(`${atkArmyName}の${atkBushos[0].name}が\n${defCastle.name}に攻め込みました！`);

                if (defClan === pid) {
                    const modal = document.getElementById('intercept-confirm-modal');
                    if (modal) {
                        modal.classList.remove('hidden');
                        document.getElementById('intercept-msg').innerText = `${atkArmyName}の${atkBushos[0].name}が攻めてきました！\n迎撃（野戦）しますか？籠城しますか？`;
                        document.getElementById('btn-intercept').onclick = () => { 
                            modal.classList.add('hidden'); 
                            this.game.ui.openBushoSelector('def_intercept_deploy', defCastle.id, {
                                onConfirm: (selectedBushoIds) => {
                                    const defBushos = selectedBushoIds.map(id => this.game.getBusho(id));
                                    // プレイヤーが選んだ防衛部隊の中に大名か城主がいれば一番前にする
                                    let defLeaderIdx = defBushos.findIndex(b => b.isDaimyo);
                                    if (defLeaderIdx === -1) defLeaderIdx = defBushos.findIndex(b => b.isCastellan);
                                    if (defLeaderIdx > 0) {
                                        const leader = defBushos.splice(defLeaderIdx, 1)[0];
                                        defBushos.unshift(leader);
                                    }
                                    this.game.ui.openQuantitySelector('def_intercept', [defCastle], null, {
                                        onConfirm: (inputs) => {
                                            const inputData = inputs[defCastle.id] || inputs;
                                            const interceptSoldiers = inputData.soldiers || 0;
                                            const interceptRice = inputData.rice || 0;
                                            
                                            this.game.ui.showUnitDivideModal(defBushos, interceptSoldiers, (defAssignments) => {
                                                onResult('field', defAssignments, interceptRice, this.autoDivideSoldiers(atkBushos, atkSoldierCount));
                                            });
                                        }
                                    });
                                }
                            });
                        };
                        document.getElementById('btn-siege').onclick = () => { modal.classList.add('hidden'); onResult('siege'); };
                    } else onResult('siege');
                } else {
                    if (defCastle.soldiers >= atkSoldierCount * 0.8) {
                        const defBushos = this.game.getCastleBushos(defCastle.id).sort((a,b) => b.strength - a.strength).slice(0, 5);
                        // コンピュータの防衛部隊の中に大名か城主がいれば一番前にする
                        let defLeaderIdx = defBushos.findIndex(b => b.isDaimyo);
                        if (defLeaderIdx === -1) defLeaderIdx = defBushos.findIndex(b => b.isCastellan);
                        if (defLeaderIdx > 0) {
                            const leader = defBushos.splice(defLeaderIdx, 1)[0];
                            defBushos.unshift(leader);
                        }
                        const defSoldiers = defCastle.soldiers;
                        const defRice = Math.min(defCastle.rice, defSoldiers); 
                        const defAssignments = this.autoDivideSoldiers(defBushos, defSoldiers);
                        
                        if (atkClan === pid) {
                            // 国人衆の反乱時は分割画面を出さない
                            if (attackerForce.isKunishu) {
                                onResult('field', defAssignments, defRice, [{busho: atkBushos[0], soldiers: atkSoldierCount}]);
                            } else {
                                this.game.ui.showUnitDivideModal(atkBushos, atkSoldierCount, (atkAssignments) => {
                                    onResult('field', defAssignments, defRice, atkAssignments);
                                });
                            }
                        } else onResult('field', defAssignments, defRice, this.autoDivideSoldiers(atkBushos, atkSoldierCount));
                    } else onResult('siege');
                }
            };

            // 国人衆制圧戦の場合は野戦をスキップして即攻城戦へ
            if (this.state.isKunishuSubjugation) {
                this.startSiegeWarPhase();
            } else if (typeof window.FieldWarManager === 'undefined') {
                this.startSiegeWarPhase();
            } else {
                showInterceptDialog((choice, defAssignments, defRice, atkAssignments) => {
                    if (choice === 'field') {
                        this.state.atkAssignments = atkAssignments; this.state.defAssignments = defAssignments; 
                        
                        let totalDefSoldiers = 0; if(defAssignments) defAssignments.forEach(a => totalDefSoldiers += a.soldiers);
                        defCastle.soldiers = Math.max(0, defCastle.soldiers - totalDefSoldiers);
                        defCastle.rice = Math.max(0, defCastle.rice - (defRice || 0));
                        
                        this.state.defender.fieldSoldiers = totalDefSoldiers;
                        this.state.defFieldRice = defRice || 0; 

                        if (!isPlayerInvolved) this.resolveAutoFieldWar();
                        else {
                            if (!this.game.fieldWarManager) this.game.fieldWarManager = new window.FieldWarManager(this.game);
                            this.game.fieldWarManager.startFieldWar(this.state, (resultType) => {
                                defCastle.soldiers += this.state.defender.fieldSoldiers;
                                defCastle.rice += this.state.defFieldRice; 
                                if (resultType === 'attacker_win' || resultType === 'defender_retreat' || resultType === 'draw_to_siege') this.startSiegeWarPhase();
                                else this.endWar(false);
                            });
                        }
                    } else this.startSiegeWarPhase();
                });
            }
        } catch(e) { console.error("StartWar Error:", e); this.state.active = false; this.game.finishTurn(); }
    }

    resolveAutoFieldWar() {
        const s = this.state; let safetyLimit = 20; let turn = 1;
        const atkStats = WarSystem.calcUnitStats(s.atkBushos); const defStats = WarSystem.calcUnitStats([s.defBusho]);
        const consumeRate = (window.WarParams.War.RiceConsumptionAtk || 0.1) * 0.5;

        while (turn <= 20 && s.attacker.soldiers > 0 && s.defender.fieldSoldiers > 0 && safetyLimit > 0) {
            let resAtk = WarSystem.calcWarDamage(atkStats, defStats, s.attacker.soldiers, s.defender.fieldSoldiers, 0, s.attacker.morale, s.defender.training, 'charge');
            if (!s.isPlayerInvolved) { resAtk.soldierDmg = Math.floor(resAtk.soldierDmg * 0.5); resAtk.counterDmg = Math.floor(resAtk.counterDmg * 0.5); }
            s.defender.fieldSoldiers -= Math.min(s.defender.fieldSoldiers, resAtk.soldierDmg); s.attacker.soldiers -= Math.min(s.attacker.soldiers, resAtk.counterDmg);
            if (s.defender.fieldSoldiers <= 0 || s.attacker.soldiers <= 0) break;

            let resDef = WarSystem.calcWarDamage(defStats, atkStats, s.defender.fieldSoldiers, s.attacker.soldiers, 0, s.defender.morale, s.attacker.training, 'charge');
            if (!s.isPlayerInvolved) { resDef.soldierDmg = Math.floor(resDef.soldierDmg * 0.5); resDef.counterDmg = Math.floor(resDef.counterDmg * 0.5); }
            s.attacker.soldiers -= Math.min(s.attacker.soldiers, resDef.soldierDmg); s.defender.fieldSoldiers -= Math.min(s.defender.fieldSoldiers, resDef.counterDmg);

            s.attacker.rice = Math.max(0, s.attacker.rice - Math.floor(s.attacker.soldiers * consumeRate));
            s.defFieldRice = Math.max(0, s.defFieldRice - Math.floor(s.defender.fieldSoldiers * consumeRate)); 
            if (s.attacker.rice <= 0 || s.defFieldRice <= 0 || s.attacker.soldiers < s.defender.fieldSoldiers * 0.2 || s.defender.fieldSoldiers < s.attacker.soldiers * 0.2) break;

            turn++; safetyLimit--;
        }

        const atkLost = s.attacker.soldiers <= 0 || s.attacker.rice <= 0 || (s.attacker.soldiers < s.defender.fieldSoldiers * 0.2);
        const defLost = s.defender.fieldSoldiers <= 0 || s.defFieldRice <= 0 || (s.defender.fieldSoldiers < s.attacker.soldiers * 0.2);
        
        s.defender.soldiers += s.defender.fieldSoldiers; 
        s.defender.rice += s.defFieldRice; 

        if (atkLost && !defLost) this.endWar(false); 
        else if (defLost && !atkLost) this.startSiegeWarPhase(); 
        else if (turn > 20) this.startSiegeWarPhase(); 
        else this.endWar(false);
    }

    startSiegeWarPhase() {
        const s = this.state; const W = window.WarParams.War;
        
        // ★修正: 国人衆の制圧戦（ダミー城）の場合は民忠・人口の低下をスキップ
        if (!s.isKunishuSubjugation) {
            s.defender.peoplesLoyalty = Math.max(0, s.defender.peoplesLoyalty - (W.AttackLoyaltyDecay || 5)); 
            s.defender.population = Math.max(0, s.defender.population - (W.AttackPopDecay || 500));
        }
        
        if (s.isPlayerInvolved) { 
            setTimeout(() => {
                this.game.ui.setWarModalVisible(true); this.game.ui.clearWarLog();
                this.game.ui.log(`★ ${s.sourceCastle.name}軍が${s.defender.name}への籠城戦を開始！`); 
                this.game.ui.updateWarUI(); this.processWarRound(); 
            }, 500); 
        } else { setTimeout(() => { this.resolveAutoWar(); }, 100); }
    }

    resolveAutoWar() { 
        try { 
            const s = this.state;
            if (s.isPlayerInvolved || Number(s.defender.ownerClan) === Number(this.game.playerClanId)) {
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
        if ((isDefender ? Number(s.defender.ownerClan) : Number(s.attacker.ownerClan)) === Number(this.game.playerClanId)) return;

        const actor = isDefender ? s.defBusho : s.atkBushos[0]; 
        let smartness = actor.intelligence / 100.0;
        if (window.AIParams.AI.Difficulty === 'hard') smartness = Math.min(1.0, smartness + 0.2);
        if (window.AIParams.AI.Difficulty === 'easy') smartness = Math.max(0.1, smartness - 0.2);

        if (isDefender) {
            if (s.defender.soldiers / (s.attacker.soldiers + 1) < (0.2 + smartness * 0.2) && s.defender.defense < 200) { this.resolveWarAction('retreat'); return; }
            if (s.defender.defense / (s.defender.maxDefense || 1000) < 0.7 && s.defender.soldiers > 500 && Math.random() < smartness) { this.resolveWarAction('repair', Math.min(s.defender.soldiers, 100)); return; }
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
        let atkStats = WarSystem.calcUnitStats(s.atkBushos); let defStats = { str: s.defBusho.strength, int: s.defBusho.intelligence, ldr: s.defBusho.leadership };
        
        if (type === 'def_attack') { 
             s.defenderGuarding = true;
             if(s.isPlayerInvolved) this.game.ui.log(`R${s.round} [守] 籠城し、守りを固めている！`);
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
                 if(s.isPlayerInvolved) this.game.ui.log(`R${s.round} [守] 補修を実行！ (兵-${soldierCost} 防+${recover})`);
             } else { if(s.isPlayerInvolved) this.game.ui.log(`R${s.round} [守] 補修しようとしたが兵が足りない！`); }
             this.advanceWarTurn(); return;
        }

        if (type === 'scheme') { 
            const result = WarSystem.calcScheme(isAtkTurn ? s.atkBushos[0] : s.defBusho, isAtkTurn ? s.defBusho : s.atkBushos[0], isAtkTurn ? s.defender.peoplesLoyalty : (window.MainParams?.Economy?.MaxLoyalty || 100)); 
            if (!result.success) { if (s.isPlayerInvolved) this.game.ui.log(`R${s.round} 謀略失敗！`); } 
            else { 
                let actualDamage = s.isPlayerInvolved ? result.damage : Math.floor(result.damage * 0.5);
                target.soldiers = Math.max(0, target.soldiers - actualDamage); 
                if (s.isPlayerInvolved) this.game.ui.log(`R${s.round} 謀略成功！ 兵士に${actualDamage}の被害`); 
            } 
            this.advanceWarTurn(); return; 
        }
        
        if (type === 'fire') { 
            const result = WarSystem.calcFire(isAtkTurn ? s.atkBushos[0] : s.defBusho, isAtkTurn ? s.defBusho : s.atkBushos[0]); 
            if (!result.success) { if (s.isPlayerInvolved) this.game.ui.log(`R${s.round} 火攻失敗！`); } 
            else { 
                let actualDamage = s.isPlayerInvolved ? result.damage : Math.floor(result.damage * 0.5);
                let actualDefSoldierDamage = s.isPlayerInvolved ? 50 : 25;
                if(isAtkTurn) s.defender.defense = Math.max(0, s.defender.defense - actualDamage); 
                else target.soldiers = Math.max(0, target.soldiers - actualDefSoldierDamage); 
                if (s.isPlayerInvolved) this.game.ui.log(`R${s.round} 火攻成功！ ${isAtkTurn?'防御':'兵士'}に${isAtkTurn ? actualDamage : actualDefSoldierDamage}の被害`); 
            } 
            this.advanceWarTurn(); return; 
        }
        
        const result = WarSystem.calcWarDamage(atkStats, defStats, s.attacker.soldiers, s.defender.soldiers, s.defender.defense, s.attacker.morale, s.defender.training, type);
        let calculatedSoldierDmg = result.soldierDmg; let calculatedWallDmg = result.wallDmg; let calculatedCounterDmg = result.counterDmg;

        if (!s.isPlayerInvolved) {
            calculatedSoldierDmg = Math.floor(calculatedSoldierDmg * 0.5); calculatedWallDmg = Math.floor(calculatedWallDmg * 0.5); calculatedCounterDmg = Math.floor(calculatedCounterDmg * 0.5);
        }

        if (isAtkTurn && s.defenderGuarding) {
             calculatedSoldierDmg = Math.floor(calculatedSoldierDmg * window.WarParams.War.RojoDamageReduction); 
             calculatedWallDmg = Math.floor(calculatedWallDmg * window.WarParams.War.RojoDamageReduction);
             s.defenderGuarding = false; if (s.isPlayerInvolved) this.game.ui.log(`(籠城効果によりダメージ軽減)`);
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
            if(s.isPlayerInvolved) this.game.ui.log(`(反撃被害: ${actualCounterDmg})`); 
        }
        
        if (s.isPlayerInvolved) { 
            let actionName = type.includes('bow') ? "弓攻撃" : type.includes('siege') ? "城攻め" : "力攻め"; 
            if (type.includes('def_')) actionName = type === 'def_bow' ? "斉射" : type === 'def_charge' ? "突撃" : "反撃"; 
            let msg = (calculatedWallDmg > 0) ? `${actionName} (兵-${actualSoldierDmg} 防-${calculatedWallDmg})` : `${actionName} (兵-${actualSoldierDmg})`; 
            this.game.ui.log(`R${s.round} [${isAtkTurn?'攻':'守'}] ${msg}`); 
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
    
    executeRetreatLogic(defCastle) {
        const candidates = this.game.castles.filter(c => c.ownerClan === defCastle.ownerClan && c.id !== defCastle.id && GameSystem.isAdjacent(c, defCastle));
        if (candidates.length === 0) { this.endWar(true); return; }
        const s = this.state;
        
        const runRetreat = (targetId) => {
            if (!targetId) { this.endWar(true); return; } 
            const target = this.game.castles.find(c => c.id === targetId);
            if(target) {
                let lossRate = Math.min(0.9, Math.max(0.05, window.WarParams.War.RetreatResourceLossFactor + (s.attacker.soldiers / (defCastle.soldiers + 1)) * 0.1)); 
                const carryGold = Math.floor(defCastle.gold * (1.0 - lossRate)); const carryRice = Math.floor(defCastle.rice * (1.0 - lossRate));
                target.gold += carryGold; target.rice += carryRice; target.soldiers += defCastle.soldiers;
                
                const capturedBushos = [];
                this.game.getCastleBushos(defCastle.id).forEach(b => { 
                    // 🌟 ここが変わりました！浪人は撤退しないので無視します
                    if (b.status === 'ronin') return;

                    let rate = window.WarParams.War.RetreatCaptureRate;
                    if(b.isDaimyo) rate = Math.max(0, rate - window.WarParams.War.DaimyoCaptureReduction);
                    if(Math.random() < rate) { capturedBushos.push(b); } 
                    else { b.castleId = target.id; b.isCastellan = false; target.samuraiIds.push(b.id); this.game.factionSystem.handleMove(b, defCastle.id, target.id); }
                });
                defCastle.gold -= carryGold; defCastle.rice = 0; defCastle.soldiers = 0; 
                
                // 🌟 名簿を空っぽにするのではなく、浪人だけはお城に残します！
                defCastle.samuraiIds = defCastle.samuraiIds.filter(id => {
                    const busho = this.game.getBusho(id);
                    return busho && busho.status === 'ronin';
                });
                
                defCastle.castellanId = 0;
                this.game.updateCastleLord(defCastle); this.game.updateCastleLord(target);
                
                if(s.isPlayerInvolved) {
                    this.game.ui.log(`${defCastle.name}から${target.name}へ撤退しました。`);
                    this.game.ui.log(`(物資搬出率: ${(100*(1-lossRate)).toFixed(0)}%, 捕縛者: ${capturedBushos.length}名)`);
                }
                this.endWar(true, true, capturedBushos, target.id); 
            }
        };
        if (defCastle.ownerClan === this.game.playerClanId) { 
            if (candidates.length === 1) runRetreat(candidates[0].id); else this.game.ui.showRetreatSelector(defCastle, candidates, (id) => runRetreat(id)); 
        } else { candidates.sort((a,b) => WarSystem.calcRetreatScore(b) - WarSystem.calcRetreatScore(a)); runRetreat(candidates[0].id); }
    }

    endWar(attackerWon, isRetreat = false, capturedInRetreat = [], retreatTargetId = null) { 
        try {
            const s = this.state; s.active = false; 

            // ★追加: プレイヤーが国人衆を制圧（討伐）した時の処理
            if (s.isKunishuSubjugation) {
                const kunishu = this.game.kunishuSystem.getKunishu(s.defender.kunishuId);
                if (attackerWon) {
                    this.game.ui.log(`【国衆制圧】${s.defender.name}の討伐に成功しました！`);
                    if (kunishu) {
                        kunishu.isDestroyed = true;
                        kunishu.soldiers = 0;
                        const members = this.game.kunishuSystem.getKunishuMembers(kunishu.id);
                        members.forEach(b => {
                            b.belongKunishuId = 0; b.clan = 0; b.status = 'ronin'; b.isCastellan = false;
                        });
                    }
                } else {
                    this.game.ui.log(`【国衆制圧】${s.defender.name}の討伐に失敗しました……`);
                }
                
                // 生き残った攻撃部隊は元の城へ帰る処理
                const srcC = this.game.getCastle(s.sourceCastle.id); 
                if (srcC) {
                    srcC.soldiers += s.attacker.soldiers; 
                    srcC.rice += s.attacker.rice;
                }
                this.closeWar();
                return;
            }
            
            // ★追加: 国人衆が反乱（蜂起）を起こした時の処理
            if (s.attacker.isKunishu) {
                if (attackerWon) {
                    const targetC = this.game.getCastle(s.defender.id);
                    const oldOwner = targetC.ownerClan;
                    targetC.ownerClan = 0; // 城が空き地になる
                    targetC.castellanId = 0;
                    
                    // 国人衆のメンバーのIDリストを作っておきます
                    const kunishuMembers = this.game.kunishuSystem.getKunishuMembers(s.attacker.kunishuId).map(b => b.id);
                    
                    // お城にいた武将たち（守備側）の処理
                    this.game.getCastleBushos(targetC.id).forEach(b => {
                        // 国人衆のメンバー「以外」は全員浪人になり、この城に留まります
                        if (!kunishuMembers.includes(b.id)) {
                            b.status = 'ronin'; 
                            b.clan = 0; 
                            b.isCastellan = false;
                        }
                    });
                    
                    // 🌟 ここが新しいお約束です！
                    // 名簿には「国人衆のメンバー」か、または「浪人」の人だけを残します
                    targetC.samuraiIds = targetC.samuraiIds.filter(id => {
                        const busho = this.game.getBusho(id);
                        return kunishuMembers.includes(id) || (busho && busho.status === 'ronin');
                    });

                    this.game.ui.log(`【国衆蜂起】国人衆の反乱により、${targetC.name}が陥落し空白地となりました。`);
                    
                    // もし大名が城を全て失ったら滅亡
                    if (this.game.castles.filter(c => c.ownerClan === oldOwner).length === 0) {
                        this.game.ui.log(`${this.game.clans.find(c=>c.id===oldOwner)?.name}は滅亡しました。`);
                        if (oldOwner === this.game.playerClanId) {
                            setTimeout(() => {
                                this.game.ui.showDialog("全拠点を失いました。ゲームオーバーです。", false, () => {
                                    this.game.ui.returnToTitle();
                                });
                            }, 1000);
                        } else {
                            const leader = this.game.getBusho(this.game.clans.find(c=>c.id===oldOwner).leaderId);
                            if (leader) leader.status = 'dead';
                        }
                    }
                } else {
                    this.game.ui.log(`【国衆蜂起】国人衆の反乱を鎮圧しました。`);
                }
                this.closeWar();
                return;
            }

            s.atkBushos.forEach(b => { this.game.factionSystem.recordBattle(b, s.defender.id); this.game.factionSystem.updateRecognition(b, 25); });
            const defBushos = this.game.getCastleBushos(s.defender.id).concat(this.pendingPrisoners);
            if (s.defBusho && s.defBusho.id && !defBushos.find(b => b.id === s.defBusho.id)) defBushos.push(s.defBusho);
            defBushos.forEach(b => { this.game.factionSystem.recordBattle(b, s.defender.id); this.game.factionSystem.updateRecognition(b, 25); });

            if (s.isPlayerInvolved) { this.game.ui.setWarModalVisible(false); }
            
            const isShortWar = s.round < window.WarParams.War.ShortWarTurnLimit;
            const attackerRecovered = Math.floor(s.deadSoldiers.attacker * window.WarParams.War.BaseRecoveryRate);
            const totalAtkSurvivors = s.attacker.soldiers + attackerRecovered;

            if (s.attacker.rice > 0) {
                if (attackerWon) s.defender.rice += s.attacker.rice; 
                else { const srcC = this.game.getCastle(s.sourceCastle.id); if (srcC) srcC.rice += s.attacker.rice; }
            }

            if (isRetreat && retreatTargetId) {
                const targetC = this.game.getCastle(retreatTargetId);
                if (targetC) {
                    const recovered = Math.floor(s.deadSoldiers.defender * (isShortWar ? window.WarParams.War.RetreatRecoveryRate : window.WarParams.War.BaseRecoveryRate));
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
                const recovered = Math.floor(s.deadSoldiers.defender * window.WarParams.War.BaseRecoveryRate);
                s.defender.soldiers += recovered;
                if (s.isPlayerInvolved && attackerRecovered > 0) this.game.ui.log(`(遠征軍 負傷兵 ${attackerRecovered}名 が帰還)`);
            }

            if (isRetreat && capturedInRetreat.length > 0) {
                this.pendingPrisoners = capturedInRetreat;
                if (s.attacker.ownerClan === this.game.playerClanId) this.game.ui.showPrisonerModal(capturedInRetreat);
                else this.autoResolvePrisoners(capturedInRetreat, s.attacker.ownerClan);
            }
            
            if (isRetreat && attackerWon) {
                s.defender.ownerClan = s.attacker.ownerClan; s.defender.investigatedUntil = 0; s.defender.soldiers = totalAtkSurvivors;
                const srcC = this.game.getCastle(s.sourceCastle.id); 
                s.atkBushos.forEach((b) => { 
                    srcC.samuraiIds = srcC.samuraiIds.filter(id => id !== b.id); 
                    this.game.factionSystem.handleMove(b, s.sourceCastle.id, s.defender.id); 
                    b.castleId = s.defender.id; s.defender.samuraiIds.push(b.id); b.isCastellan = false; 
                });
                this.game.updateCastleLord(srcC); this.game.updateCastleLord(s.defender);
                if (s.isPlayerInvolved) this.game.ui.showResultModal(`撤退しました。\n${retreatTargetId ? '部隊は移動しました。' : '部隊は解散しました。'}`, () => this.game.finishTurn());
                else this.game.finishTurn();
                return;
            }

            let resultMsg = "";
            const isAtkPlayer = (Number(s.attacker.ownerClan) === Number(this.game.playerClanId));
            const isDefPlayer = (Number(s.defender.ownerClan) === Number(this.game.playerClanId));
            const enemyName = isAtkPlayer ? (this.game.clans.find(c => c.id === s.defender.ownerClan)?.getArmyName() || "敵軍") : s.attacker.name;

            if (attackerWon) { 
                s.attacker.training = Math.min(120, s.attacker.training + (window.WarParams.War.WinStatIncrease || 5)); s.attacker.morale = Math.min(120, s.attacker.morale + (window.WarParams.War.WinStatIncrease || 5)); 
                this.processCaptures(s.defender, s.attacker.ownerClan);
                
                const maxCharm = Math.max(...s.atkBushos.map(b => b.charm));
                const subCharm = s.atkBushos.reduce((acc, b) => acc + b.charm, 0) - maxCharm;
                const daimyo = this.game.bushos.find(b => b.clan === s.attacker.ownerClan && b.isDaimyo) || {charm: 50};
                const charmScore = maxCharm + (subCharm * 0.1) + (daimyo.charm * window.WarParams.War.DaimyoCharmWeight);
                let lossRate = Math.max(0, window.WarParams.War.LootingBaseRate - (charmScore * window.WarParams.War.LootingCharmFactor)); 
                if (lossRate > 0) {
                    const lostGold = Math.floor(s.defender.gold * lossRate); const lostRice = Math.floor(s.defender.rice * lossRate);
                    s.defender.gold -= lostGold; s.defender.rice -= lostRice;
                    if (s.isPlayerInvolved) this.game.ui.log(`(敵兵の持ち逃げにより 金${lostGold}, 米${lostRice} が失われた)`);
                }
                
                s.defender.ownerClan = s.attacker.ownerClan; s.defender.investigatedUntil = 0; s.defender.immunityUntil = this.game.getCurrentTurnId() + 1;
                
                const srcC = this.game.getCastle(s.sourceCastle.id); 
                s.atkBushos.forEach((b) => { 
                    srcC.samuraiIds = srcC.samuraiIds.filter(id => id !== b.id); 
                    this.game.factionSystem.handleMove(b, s.sourceCastle.id, s.defender.id); 
                    b.castleId = s.defender.id; s.defender.samuraiIds.push(b.id); b.isCastellan = false; 
                }); 
                this.game.updateCastleLord(srcC); this.game.updateCastleLord(s.defender);
                
                if (isAtkPlayer) resultMsg = isRetreat ? `${enemyName}は城を捨てて敗走しました！ 城を占領します！` : `${s.defender.name}を制圧しました！`;
                else if (isDefPlayer) resultMsg = isRetreat ? `${s.defender.name}を放棄し、後退します……` : `${s.defender.name}が陥落しました。敵軍がなだれ込んできます……`;
                else resultMsg = `${s.defender.name}が制圧されました！\n勝者: ${s.attacker.name}`;
            } else { 
                s.defender.immunityUntil = this.game.getCurrentTurnId(); 
                if (isAtkPlayer) resultMsg = isRetreat ? `${s.defender.name}からの撤退を決定しました……` : `${s.defender.name}を落としきることができませんでした……`;
                else if (isDefPlayer) resultMsg = isRetreat ? `${enemyName}は攻略を諦め、撤退していきました！` : `${s.defender.name}を守り抜きました！`;
                else resultMsg = isRetreat ? `${s.defender.name}から撤退しました……` : `${s.defender.name}を守り抜きました！\n敗者: ${s.attacker.name}`;
            } 

            if (s.isPlayerInvolved) this.game.ui.showResultModal(resultMsg, () => { this.game.finishTurn(); });
            else this.game.finishTurn();
        } catch (e) {
            console.error("EndWar Error: ", e);
            if (this.state.isPlayerInvolved) this.game.ui.showResultModal("合戦処理中にエラーが発生しましたが、\nゲームを継続します。", () => { this.game.finishTurn(); });
            else this.game.finishTurn();
        }
    }
    
    processCaptures(defeatedCastle, winnerClanId) { 
        const losers = this.game.getCastleBushos(defeatedCastle.id); const captives = []; const escapees = [];
        const friendlyCastles = this.game.castles.filter(c => c.ownerClan === defeatedCastle.ownerClan && c.id !== defeatedCastle.id);
        const isLastStand = friendlyCastles.length === 0;

        losers.forEach(b => { 
            // 🌟 ここが変わりました！浪人は戦に参加していないので、捕虜にせず無視します
            if (b.status === 'ronin') return;

            let chance = isLastStand ? 1.0 : ((window.WarParams.War.CaptureChanceBase || 0.4) - (b.strength * (window.WarParams.War.CaptureStrFactor || 0.002)) + (Math.random() * 0.3)); 
            if (!isLastStand && defeatedCastle.soldiers > 1000) chance -= 0.2; 
            if (!isLastStand && b.isDaimyo) chance -= window.WarParams.War.DaimyoCaptureReduction;
            
            if (chance > 0.5) { 
                b.isCastellan = false; captives.push(b); defeatedCastle.samuraiIds = defeatedCastle.samuraiIds.filter(id => id !== b.id);
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
    
    // ★ 修正：国人衆のルール（リーダーは引抜不可、解放時は帰還など）を追加
    handlePrisonerAction(index, action) { 
        const prisoner = this.pendingPrisoners[index]; 
        const originalClanId = prisoner.clan;
        const kunishu = prisoner.belongKunishuId > 0 ? this.game.kunishuSystem.getKunishu(prisoner.belongKunishuId) : null;

        if (action === 'hire') { 
            if (kunishu && prisoner.id === kunishu.leaderId) {
                this.game.ui.showDialog(`${prisoner.name}「国衆を束ねるこの俺が、お前になど仕えるか！」\n(※国人衆の代表者は登用できません)`, false); 
                return; // やり直し
            }

            const myBushos = this.game.bushos.filter(b=>b.clan===this.game.playerClanId); const recruiter = myBushos.find(b => b.isDaimyo) || myBushos[0]; 
            const score = (recruiter.charm * 2.0) / (prisoner.loyalty * 1.5); 
            if (prisoner.isDaimyo) this.game.ui.showDialog(`${prisoner.name}「敵の軍門には下らぬ！」`, false); 
            else if (score > Math.random()) { 
                prisoner.clan = this.game.playerClanId; prisoner.loyalty = 50; prisoner.isCastellan = false; 
                prisoner.belongKunishuId = 0; // 国人衆を抜ける
                const targetC = this.game.getCastle(prisoner.castleId) || this.game.getCurrentTurnCastle(); 
                if(targetC) { 
                    prisoner.castleId = targetC.id;
                    if (!targetC.samuraiIds.includes(prisoner.id)) targetC.samuraiIds.push(prisoner.id); 
                    this.game.updateCastleLord(targetC); 
                }
                this.game.ui.showDialog(`${prisoner.name}を登用しました！`, false); 
            } 
            else this.game.ui.showDialog(`${prisoner.name}は登用を拒否しました……`, false); 
        } else if (action === 'kill') { 
            if (prisoner.isDaimyo) this.handleDaimyoDeath(prisoner); 
            prisoner.status = 'dead'; prisoner.clan = 0; prisoner.castleId = 0; prisoner.belongKunishuId = 0;
        } else if (action === 'release') { 
            if (kunishu && !kunishu.isDestroyed) {
                prisoner.status = 'active'; 
                prisoner.clan = 0;
                prisoner.castleId = kunishu.castleId;
                const returnCastle = this.game.getCastle(kunishu.castleId);
                if (returnCastle && !returnCastle.samuraiIds.includes(prisoner.id)) returnCastle.samuraiIds.push(prisoner.id);
                this.game.ui.showDialog(`${prisoner.name}を解放しました。(国人衆へ帰還しました)`, false);
            } else {
                const friendlyCastles = this.game.castles.filter(c => c.ownerClan === originalClanId && originalClanId !== 0);
                if (friendlyCastles.length > 0) {
                    const returnCastle = friendlyCastles[Math.floor(Math.random() * friendlyCastles.length)];
                    prisoner.castleId = returnCastle.id; prisoner.isCastellan = false; prisoner.status = 'active'; returnCastle.samuraiIds.push(prisoner.id);
                    this.game.factionSystem.handleMove(prisoner, 0, returnCastle.id); this.game.updateCastleLord(returnCastle);
                    this.game.ui.showDialog(`${prisoner.name}を解放しました。(自領へ帰還しました)`, false);
                } else { 
                    prisoner.status = 'ronin'; prisoner.clan = 0; prisoner.castleId = 0; prisoner.belongKunishuId = 0; 
                    this.game.ui.showDialog(`${prisoner.name}を解放しました。(在野へ下りました)`, false); 
                }
            }
        } 
        this.pendingPrisoners.splice(index, 1); 
        if (this.pendingPrisoners.length === 0) this.game.ui.closePrisonerModal(); else this.game.ui.showPrisonerModal(this.pendingPrisoners); 
    }
    
    handleDaimyoDeath(daimyo) { 
        const clanId = daimyo.clan; if(clanId === 0) return; 
        const candidates = this.game.bushos.filter(b => b.clan === clanId && b.id !== daimyo.id && b.status !== 'dead' && b.status !== 'ronin'); 
        if (candidates.length === 0) { 
            this.game.castles.filter(c => c.ownerClan === clanId).forEach(c => { c.ownerClan = 0; this.game.getCastleBushos(c.id).forEach(l => { l.clan=0; l.status='ronin'; }); }); return; 
        } 
        if (clanId === this.game.playerClanId) this.game.ui.showSuccessionModal(candidates, (newLeaderId) => this.game.changeLeader(clanId, newLeaderId)); 
        else { candidates.sort((a,b) => (b.politics + b.charm) - (a.politics + a.charm)); this.game.changeLeader(clanId, candidates[0].id); } 
    }
    
    // ★ 修正：AIの捕虜処理にも国人衆ルールを追加
    autoResolvePrisoners(captives, winnerClanId) { 
        const aiBushos = this.game.bushos.filter(b => b.clan === winnerClanId); 
        const leaderInt = aiBushos.length > 0 ? Math.max(...aiBushos.map(b => b.intelligence)) : 50; 

        captives.forEach(p => { 
            if (p.isDaimyo) { this.handleDaimyoDeath(p); p.status = 'dead'; p.clan = 0; p.castleId = 0; return; } 
            
            const isKunishuBoss = (p.belongKunishuId > 0 && p.id === this.game.kunishuSystem.getKunishu(p.belongKunishuId)?.leaderId);

            if (!isKunishuBoss && (leaderInt / 100) > Math.random()) { 
                p.clan = winnerClanId; p.loyalty = 50; p.isCastellan = false; p.belongKunishuId = 0;
                const targetC = this.game.getCastle(p.castleId);
                if (targetC && !targetC.samuraiIds.includes(p.id)) { targetC.samuraiIds.push(p.id); this.game.updateCastleLord(targetC); }
                return; 
            } 
            if (p.charm > (window.WarParams.War.PrisonerRecruitThreshold || 60)) { 
                const kunishu = p.belongKunishuId > 0 ? this.game.kunishuSystem.getKunishu(p.belongKunishuId) : null;
                if (kunishu && !kunishu.isDestroyed) {
                    p.status = 'active'; p.clan = 0; p.castleId = kunishu.castleId;
                } else {
                    p.status = 'ronin'; p.clan = 0; p.castleId = 0; 
                }
            } 
            else { p.status = 'dead'; p.clan = 0; p.castleId = 0; p.belongKunishuId = 0; } 
        }); 
    }

    closeWar() { 
        this.game.ui.renderMap(); 
        if (this.state.isPlayerInvolved) { 
            this.game.ui.updatePanelHeader(); 
            this.game.ui.renderCommandMenu(); 
        }
        
        setTimeout(() => {
             this.game.finishTurn(); 
        }, 100);
    }
}