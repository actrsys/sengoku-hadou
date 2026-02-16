/**
 * war.js
 * 戦争処理マネージャー & 戦争計算ロジック
 * 責務: 合戦の進行、戦闘計算、戦後処理、捕虜対応、UIコマンド定義、攻撃可能判定
 * 設定: Military, War
 */

// 戦争・軍事関連の設定定義
// parameter.csv の値(2026-02-16時点)と同期済み
window.WarParams = {
    // 【Military】: 軍事内政、基本能力、静的な係数
    Military: {
        // 徴兵関連
        DraftBase: 50,
        DraftStatBonus: 1.5,
        DraftPopBonusFactor: 0.00005,
        DraftFluctuation: 0.15,

        // 訓練関連
        BaseTraining: 0,
        TrainingLdrEffect: 0.3,
        TrainingStrEffect: 0.2,
        TrainingFluctuation: 0.15,

        // 士気関連
        BaseMorale: 0,
        MoraleLdrEffect: 0.2,
        MoraleCharmEffect: 0.2,
        MoraleFluctuation: 0.2,

        // 戦闘基本定数
        WarMaxRounds: 10,           // 最大ラウンド数
        DamageSoldierPower: 0.05,   // 兵数がダメージに与える影響
        WallDefenseEffect: 0.5,     // 城壁防御効果
        DamageFluctuation: 0.2,     // ダメージ乱数幅
        
        // 相性ボーナス
        FactionBonus: 1.1,          // 革新/保守一致ボーナス
        FactionPenalty: 0.8         // 不一致ペナルティ
    },

    // 【War】: 合戦中のアクション倍率、戦術、戦後処理
    War: {
        // 攻撃側アクション倍率・リスク
        ChargeMultiplier: 1.5,      // 突撃攻撃力
        ChargeRisk: 1.8,            // 突撃反撃被ダメージ係数
        ChargeSoldierDmgRate: 1.0,  // 突撃：対兵士倍率
        ChargeWallDmgRate: 0.1,     // 突撃：対城壁倍率

        BowMultiplier: 0.6,         // 斉射攻撃力
        BowRisk: 0.5,               // 斉射反撃被ダメージ係数

        SiegeMultiplier: 1.0,       // 城攻め攻撃力
        SiegeWallRate: 0.5,         // 城攻め：対城壁倍率
        SiegeRisk: 10.0,             // 城攻め反撃被ダメージ係数

        // 防御側アクション倍率
        DefChargeMultiplier: 1.2,   // 防御側突撃
        DefChargeRisk: 2.0,         // 防御側突撃リスク
        DefBowMultiplier: 0.5,      // 防御側斉射
        RojoDamageReduction: 0.7,   // 籠城時の被ダメージ軽減率

        // 反撃計算
        CounterAtkPowerFactor: 0.05, // 反撃時の敵能力参照係数

        // 補修コマンド
        RepairMaxSoldiers: 500,     // 最大投入兵数
        RepairSoldierFactor: 0.05,  // 兵数係数
        RepairMainPolFactor: 0.25,  // 城主政治力係数
        RepairSubPolFactor: 0.05,   // 副将政治力係数
        RepairGlobalMultiplier: 0.4, // 全体補正

        // 計略・火計
        SchemeDamageFactor: 4,      // 謀略ダメージ係数
        FireSuccessBase: 0.25,      // 火計成功率
        FireDamageFactor: 0.8,      // 火計ダメージ係数

        // 戦後処理・撤退・捕縛
        ShortWarTurnLimit: 5,       // 短期決戦判定ターン
        BaseRecoveryRate: 0.2,      // 通常負傷兵回復率
        RetreatRecoveryRate: 0.3,   // 撤退時回復率
        RetreatCaptureRate: 0.1,    // 撤退時捕縛率
        DaimyoCaptureReduction: 0.3,// 大名捕縛回避補正
        RetreatResourceLossFactor: 0.2, // 撤退時物資損失
        LootingBaseRate: 0.3,       // 略奪率
        LootingCharmFactor: 0.002,  // 略奪抑制魅力係数
        DaimyoCharmWeight: 0.1      // 略奪抑制大名魅力重み
    }
};

/* ==========================================================================
   WarSystem: 計算・判定ロジック
   ========================================================================== */
class WarSystem {
    // 部隊の能力値を計算（統率、武力、知略、補正など）
    static calcUnitStats(bushos) { 
        if (!bushos || bushos.length === 0) return { ldr:30, str:30, int:30, charm:30 }; 
        const sorted = [...bushos].sort((a,b) => b.leadership - a.leadership); 
        const leader = sorted[0]; const subs = sorted.slice(1); 
        let totalLdr = leader.leadership; let totalStr = leader.strength; let totalInt = leader.intelligence; 
        
        // 陣営ボーナス（革新・保守の相性）
        let factionBonusMultiplier = 1.0;
        if (subs.length > 0) {
            const leaderFaction = leader.getFactionName ? leader.getFactionName() : "中立";
            let sameFactionCount = 0; let oppFactionCount = 0; 
            subs.forEach(b => { 
                totalLdr += b.leadership * 0.2; totalStr += b.strength * 0.2; totalInt += b.intelligence * 0.2; 
                const f = b.getFactionName ? b.getFactionName() : "中立";
                if (f === leaderFaction) sameFactionCount++;
                else if ((leaderFaction === "革新派" && f === "保守派") || (leaderFaction === "保守派" && f === "革新派")) oppFactionCount++;
            });
            if (oppFactionCount > 0) factionBonusMultiplier = window.WarParams.Military.FactionPenalty;
            else if (sameFactionCount === subs.length) factionBonusMultiplier = window.WarParams.Military.FactionBonus;
        }
        return { ldr: Math.floor(totalLdr * factionBonusMultiplier), str: Math.floor(totalStr * factionBonusMultiplier), int: Math.floor(totalInt * factionBonusMultiplier), charm: leader.charm }; 
    }

    // 戦闘ダメージ計算
    static calcWarDamage(atkStats, defStats, atkSoldiers, defSoldiers, defWall, atkMorale, defTraining, type) {
        // 設定値の取得簡略化
        const M = window.WarParams.Military;
        const W = window.WarParams.War;

        const fluctuation = M.DamageFluctuation || 0.2;
        const rand = 1.0 - fluctuation + (Math.random() * fluctuation * 2);
        const moraleBonus = (atkMorale - 50) / 100; 
        const trainingBonus = (defTraining - 50) / 100;
        
        // 攻撃力・防御力の基礎計算
        const atkPower = ((atkStats.ldr * 1.2) + (atkStats.str * 0.3) + (atkSoldiers * M.DamageSoldierPower)) * (1.0 + moraleBonus);
        const defPower = ((defStats.ldr * 1.0) + (defStats.int * 0.5) + (defWall * M.WallDefenseEffect) + (defSoldiers * M.DamageSoldierPower)) * (1.0 + trainingBonus);
        
        let multiplier = 1.0, soldierRate = 1.0, wallRate = 0.0, counterRisk = 1.0;
        
        // アクションタイプごとの倍率適用
        switch(type) {
            case 'bow': 
                multiplier = W.BowMultiplier; 
                wallRate = 0.0; 
                counterRisk = W.BowRisk; 
                break;
            case 'siege': 
                multiplier = W.SiegeMultiplier; 
                soldierRate = 0.05; 
                wallRate = W.SiegeWallRate; 
                counterRisk = W.SiegeRisk; 
                break;
            case 'charge': 
                multiplier = W.ChargeMultiplier; 
                soldierRate = W.ChargeSoldierDmgRate; 
                wallRate = W.ChargeWallDmgRate;       
                counterRisk = W.ChargeRisk; 
                break;
            case 'def_bow': 
                multiplier = W.DefBowMultiplier; 
                wallRate = 0.0; 
                break;
            case 'def_attack': 
                multiplier = 0.0; 
                wallRate = 0.0; 
                break; 
            case 'def_charge': 
                multiplier = W.DefChargeMultiplier; 
                wallRate = 0.0; 
                counterRisk = W.DefChargeRisk; 
                break; 
        }
        
        // 基本ダメージ計算
        const ratio = atkPower / (atkPower + defPower);
        let baseDmg = atkPower * ratio * multiplier * rand; 
        baseDmg = Math.max(50, baseDmg);
        
        // 反撃ダメージ計算
        let counterDmg = 0;
        const counterFactor = W.CounterAtkPowerFactor !== undefined ? W.CounterAtkPowerFactor : 0.05;

        if (counterRisk > 0 && type !== 'def_attack') {
            let isAttackerAction = true;
            if (type.startsWith('def_')) isAttackerAction = false;
            const opponentPower = isAttackerAction ? defPower : atkPower;
            counterDmg = Math.floor(opponentPower * counterFactor * counterRisk);
        }
        
        return { 
            soldierDmg: Math.floor(baseDmg * soldierRate), 
            wallDmg: Math.floor(baseDmg * wallRate * 0.5), 
            counterDmg: counterDmg 
        };
    }

    // 謀略
    static calcScheme(atkBusho, defBusho, defCastleLoyalty) { 
        const atkInt = atkBusho.intelligence; 
        const defInt = defBusho ? defBusho.intelligence : 30; 
        const successRate = (atkInt / (defInt + 20)) * window.MainParams.Strategy.SchemeSuccessRate; 
        
        if (Math.random() > successRate) return { success: false, damage: 0 }; 
        
        const loyaltyBonus = (1000 - defCastleLoyalty) / 500; 
        return { success: true, damage: Math.floor(atkInt * window.WarParams.War.SchemeDamageFactor * (1.0 + loyaltyBonus)) }; 
    }

    // 火攻め
    static calcFire(atkBusho, defBusho) { 
        const atkInt = atkBusho.intelligence; 
        const defInt = defBusho ? defBusho.intelligence : 30; 
        const successRate = (atkInt / (defInt + 10)) * window.WarParams.War.FireSuccessBase; 
        
        if (Math.random() > successRate) return { success: false, damage: 0 }; 
        
        return { success: true, damage: Math.floor(atkInt * window.WarParams.War.FireDamageFactor * (Math.random() + 0.5)) }; 
    }

    // 撤退時のスコア計算（AI判断用）
    static calcRetreatScore(castle) { 
        return castle.soldiers + (castle.defense * 0.5) + (castle.gold * 0.1) + (castle.rice * 0.1) + (castle.samuraiIds.length * 100); 
    }

    // 軍師の助言（戦争用）
    static getWarAdvice(gunshi, state) {
        const r = Math.random();
        if (state.attacker.soldiers > state.defender.soldiers * 1.5) {
             return r > 0.3 ? "我が軍が圧倒的です。一気に攻め落としましょう。" : "油断は禁物ですが、勝利は目前です。";
        } else if (state.attacker.soldiers < state.defender.soldiers * 0.8) {
             return "敵の兵数が勝っています。無理な突撃は控えるべきかと。";
        }
        return "戦況は五分五分。敵の出方を見極めましょう。";
    }
}


/* ==========================================================================
   WarManager: 進行管理・UI連携
   ========================================================================== */
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

        const isMyTurn = (isAtkTurn && s.attacker.ownerClan === this.game.playerClanId) ||
                         (!isAtkTurn && s.defender.ownerClan === this.game.playerClanId);

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

            const friendlyCastles = this.game.castles.filter(c => c.ownerClan === s.defender.ownerClan && c.id !== s.defender.id && GameSystem.isAdjacent(c, s.defender));
            if (friendlyCastles.length > 0) {
                commands.push({ label: "撤退", type: "retreat" });
            }
        }
        return commands;
    }

    getGunshiAdvice(action) {
        if (action.type === 'war') {
            return "合戦におもむきますか？ 兵力と兵糧の確認をお忘れなく。";
        }
        if (this.state.active) {
            const gunshi = this.game.getClanGunshi(this.game.playerClanId);
            if (!gunshi) return null;
            return WarSystem.getWarAdvice(gunshi, this.state);
        }
        return null;
    }

    startWar(atkCastle, defCastle, atkBushos, atkSoldierCount) {
        try {
            const isPlayerInvolved = (atkCastle.ownerClan === this.game.playerClanId || defCastle.ownerClan === this.game.playerClanId);
            const atkClan = this.game.clans.find(c => c.id === atkCastle.ownerClan); 
            const atkGeneral = atkBushos[0].name;
            const atkArmyName = atkClan ? atkClan.getArmyName() : atkClan.name;
            
            if (isPlayerInvolved) {
                this.game.ui.showCutin(`${atkArmyName}の${atkGeneral}が\n${defCastle.name}に攻め込みました！`);
            }
            
            let defBusho = this.game.getBusho(defCastle.castellanId); 
            if (!defBusho) defBusho = {name:"守備隊長", strength:30, leadership:30, intelligence:30, charm:30};
            
            const attackerForce = { name: atkCastle.name + "遠征軍", ownerClan: atkCastle.ownerClan, soldiers: atkSoldierCount, bushos: atkBushos, training: atkCastle.training, morale: atkCastle.morale };
            
            this.state = { 
                active: true, 
                round: 1, 
                attacker: attackerForce, 
                sourceCastle: atkCastle, 
                defender: defCastle, 
                atkBushos: atkBushos, 
                defBusho: defBusho, 
                turn: 'attacker', 
                isPlayerInvolved: isPlayerInvolved, 
                deadSoldiers: { attacker: 0, defender: 0 }, 
                defenderGuarding: false 
            };
            
            defCastle.loyalty = Math.max(0, defCastle.loyalty - 50); 
            defCastle.population = Math.max(0, defCastle.population - 500);
            
            if (isPlayerInvolved) { 
                setTimeout(() => {
                    const warModal = document.getElementById('war-modal');
                    if (warModal) warModal.classList.remove('hidden'); 
                    const warLog = document.getElementById('war-log');
                    if (warLog) warLog.innerHTML = ''; 
                    this.game.ui.log(`★ ${atkCastle.name}が出陣(兵${atkSoldierCount})！ ${defCastle.name}へ攻撃！`); 
                    this.game.ui.updateWarUI(); 
                    this.processWarRound(); 
                }, 1000);
            } else { 
                setTimeout(() => { 
                    this.resolveAutoWar(); 
                }, 100); 
            }
        } catch(e) { 
            console.error("StartWar Error:", e); 
            this.game.finishTurn(); 
        }
    }

    resolveAutoWar() { 
        try { 
            const s = this.state; 
            let safetyLimit = 100; 
            while(s.round <= window.WarParams.Military.WarMaxRounds && s.attacker.soldiers > 0 && s.defender.soldiers > 0 && s.defender.defense > 0 && safetyLimit > 0) { 
                this.resolveWarAction('charge'); 
                if (s.attacker.soldiers <= 0 || s.defender.soldiers <= 0) break; 
                safetyLimit--;
            } 
            this.endWar(s.defender.soldiers <= 0 || s.defender.defense <= 0); 
        } catch(e) { 
            console.error(e); 
            this.endWar(false); 
        } 
    }

    processWarRound() { 
        if (!this.state.active) return; 
        const s = this.state; 
        if (s.defender.soldiers <= 0 || s.defender.defense <= 0) { this.endWar(true); return; } 
        if (s.attacker.soldiers <= 0) { this.endWar(false); return; } 
        
        this.game.ui.updateWarUI(); 
        const isAtkTurn = (s.turn === 'attacker'); 
        this.game.ui.renderWarControls(isAtkTurn); 
        
        const isMyTurn = (isAtkTurn && s.attacker.ownerClan === this.game.playerClanId) ||
                         (!isAtkTurn && s.defender.ownerClan === this.game.playerClanId);
        
        if (!isMyTurn) { 
            setTimeout(() => this.execWarAI(), 800); 
        } 
    }

    execWarCmd(type, extraVal = null) { 
        if (type === 'repair_setup') {
             const s = this.state;
             window.GameApp.ui.openQuantitySelector('war_repair', [s.defender], null);
             return;
        }
        if(type==='scheme'||type==='fire') this.resolveWarAction(type); 
        else { 
            document.getElementById('war-controls').classList.add('disabled-area'); 
            this.resolveWarAction(type, extraVal); 
        } 
    }

    execWarAI() { 
        const s = this.state;
        const actor = s.turn === 'attacker' ? s.atkBushos[0] : s.defBusho; 
        const isDefender = (s.turn === 'defender');

        if (isDefender) {
            const dangerRatio = s.defender.soldiers / (s.attacker.soldiers + 1);
            let retreatThreshold = 0.2; 
            if (actor.intelligence >= window.AIParams.AI.WarHighIntThreshold) retreatThreshold = 0.4; 
            
            if (dangerRatio < retreatThreshold && s.defender.defense < 200) { 
                this.resolveWarAction('retreat'); return; 
            }

            const defenseRatio = s.defender.defense / (s.defender.maxDefense || 1000); 
            if (defenseRatio < 0.7 && s.defender.soldiers > 500 && Math.random() < 0.4) {
                 this.resolveWarAction('repair', 50); return;
            }
        }

        let cmd = 'charge'; 
        const isHighInt = actor.intelligence >= window.AIParams.AI.WarHighIntThreshold;
        if (isHighInt) {
            const opp = isDefender ? s.attacker : s.defender;
            const oppWall = isDefender ? 0 : s.defender.defense; 
            if (oppWall > 500 && Math.random() < 0.7) cmd = 'siege'; 
            else if (opp.soldiers < 500 && Math.random() < 0.8) cmd = 'charge'; 
            else cmd = 'bow'; 
            if (Math.random() < 0.3) cmd = 'scheme';
        } else {
            const r = Math.random();
            if (r < 0.4) cmd = 'charge'; else if (r < 0.7) cmd = 'bow'; else cmd = 'siege';
        }

        if (isDefender) {
            if (cmd === 'charge') cmd = 'def_charge'; 
            if (cmd === 'bow') cmd = 'def_bow'; 
            if (cmd === 'siege') {
                if (s.defender.soldiers < s.attacker.soldiers * 0.5) cmd = 'def_attack'; 
                else cmd = 'def_charge'; 
            }
        }
        this.resolveWarAction(cmd); 
    }

    resolveWarAction(type, extraVal = null) {
        if (!this.state.active) return;
        const s = this.state;
        if(type === 'retreat') { if(s.turn === 'attacker') { this.endWar(false); } else { this.executeRetreatLogic(s.defender); } return; }
        const isAtkTurn = (s.turn === 'attacker'); const target = isAtkTurn ? s.defender : s.attacker;
        
        let atkStats = WarSystem.calcUnitStats(s.atkBushos); 
        let defStats = { str: s.defBusho.strength, int: s.defBusho.intelligence, ldr: s.defBusho.leadership };
        
        if (type === 'def_attack') { 
             s.defenderGuarding = true;
             if(s.isPlayerInvolved) this.game.ui.log(`R${s.round} [守] 籠城し、守りを固めている！`);
             this.advanceWarTurn();
             return;
        }
        if (type === 'repair') { 
             const soldierCost = extraVal || 50; 
             if (s.defender.soldiers > soldierCost) {
                 const W = window.WarParams.War;
                 s.defender.soldiers -= soldierCost;
                 const castleBushos = this.game.getCastleBushos(s.defender.id);
                 const politicsList = castleBushos.map(b => b.politics).sort((a,b) => b - a);
                 const maxPol = politicsList.length > 0 ? politicsList[0] : 0;
                 let subPolSum = 0;
                 for(let i=1; i<politicsList.length; i++) subPolSum += politicsList[i];

                 let rawPower = (soldierCost * W.RepairSoldierFactor) + 
                                (maxPol * W.RepairMainPolFactor) + 
                                (subPolSum * W.RepairSubPolFactor);
                 
                 let recover = Math.floor(rawPower * W.RepairGlobalMultiplier);
                 s.defender.defense += recover;
                 
                 if(s.isPlayerInvolved) this.game.ui.log(`R${s.round} [守] 補修を実行！ (兵-${soldierCost} 防+${recover})`);
             } else {
                 if(s.isPlayerInvolved) this.game.ui.log(`R${s.round} [守] 補修しようとしたが兵が足りない！`);
             }
             this.advanceWarTurn();
             return;
        }

        if (type === 'scheme') { 
            const actor = isAtkTurn ? s.atkBushos[0] : s.defBusho; 
            const targetBusho = isAtkTurn ? s.defBusho : s.atkBushos[0]; 
            const result = WarSystem.calcScheme(actor, targetBusho, isAtkTurn ? s.defender.loyalty : 1000); 
            if (!result.success) { 
                if (s.isPlayerInvolved) this.game.ui.log(`R${s.round} 謀略失敗！`); 
            } else { 
                target.soldiers = Math.max(0, target.soldiers - result.damage); 
                if (s.isPlayerInvolved) this.game.ui.log(`R${s.round} 謀略成功！ 兵士に${result.damage}の被害`); 
            } 
            this.advanceWarTurn(); return; 
        }
        
        if (type === 'fire') { 
            const actor = isAtkTurn ? s.atkBushos[0] : s.defBusho; 
            const targetBusho = isAtkTurn ? s.defBusho : s.atkBushos[0]; 
            const result = WarSystem.calcFire(actor, targetBusho); 
            if (!result.success) { 
                if (s.isPlayerInvolved) this.game.ui.log(`R${s.round} 火攻失敗！`); 
            } else { 
                if(isAtkTurn) s.defender.defense = Math.max(0, s.defender.defense - result.damage); 
                else target.soldiers = Math.max(0, target.soldiers - 50); 
                if (s.isPlayerInvolved) this.game.ui.log(`R${s.round} 火攻成功！ ${isAtkTurn?'防御':'兵士'}に${result.damage}の被害`); 
            } 
            this.advanceWarTurn(); return; 
        }
        
        const result = WarSystem.calcWarDamage(atkStats, defStats, s.attacker.soldiers, s.defender.soldiers, s.defender.defense, s.attacker.morale, s.defender.training, type);
        let actualSoldierDmg = Math.min(target.soldiers, result.soldierDmg);
        let actualWallDmg = result.wallDmg;

        if (isAtkTurn && s.defenderGuarding) {
             actualSoldierDmg = Math.floor(actualSoldierDmg * window.WarParams.War.RojoDamageReduction); 
             actualWallDmg = Math.floor(actualWallDmg * window.WarParams.War.RojoDamageReduction);
             s.defenderGuarding = false; 
             if (s.isPlayerInvolved) this.game.ui.log(`(籠城効果によりダメージ軽減)`);
        }

        target.soldiers -= actualSoldierDmg;
        if(isAtkTurn) s.deadSoldiers.defender += actualSoldierDmg; else s.deadSoldiers.attacker += actualSoldierDmg;
        if (isAtkTurn) s.defender.defense = Math.max(0, s.defender.defense - actualWallDmg);
        
        if(result.counterDmg > 0) { 
            const counterDmg = result.counterDmg; 
            const actorArmy = isAtkTurn ? s.attacker : s.defender; 
            actorArmy.soldiers = Math.max(0, actorArmy.soldiers - counterDmg); 
            if(isAtkTurn) s.deadSoldiers.attacker += counterDmg; else s.deadSoldiers.defender += counterDmg; // 負傷計算用にカウント
            if(s.isPlayerInvolved) this.game.ui.log(`(反撃被害: ${counterDmg})`); 
        }
        
        if (s.isPlayerInvolved) { 
            let actionName = type.includes('bow') ? "弓攻撃" : type.includes('siege') ? "城攻め" : "力攻め"; 
            if (type.includes('def_')) actionName = type === 'def_bow' ? "斉射" : type === 'def_charge' ? "突撃" : "反撃"; 
            let msg = (actualWallDmg > 0) ? `${actionName} (兵-${actualSoldierDmg} 防-${actualWallDmg})` : `${actionName} (兵-${actualSoldierDmg})`; 
            this.game.ui.log(`R${s.round} [${isAtkTurn?'攻':'守'}] ${msg}`); 
        }
        this.advanceWarTurn();
    }

    advanceWarTurn() { const s = this.state; if (s.turn === 'attacker') s.turn = 'defender'; else { s.turn = 'attacker'; s.round++; if(s.round > window.WarParams.Military.WarMaxRounds) { this.endWar(false); return; } } if (s.isPlayerInvolved) this.processWarRound(); }
    
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
                const safeBushos = [];
                const capturedBushos = [];
                const retreatCaptureRate = window.WarParams.War.RetreatCaptureRate;

                bushos.forEach(b => { 
                    let rate = retreatCaptureRate;
                    if(b.isDaimyo) rate = Math.max(0, rate - window.WarParams.War.DaimyoCaptureReduction);

                    if(Math.random() < rate) {
                         capturedBushos.push(b);
                    } else {
                         b.castleId = target.id; 
                         b.isCastellan = false; 
                         target.samuraiIds.push(b.id);
                         safeBushos.push(b);
                    }
                });

                defCastle.gold = lostGold; 
                defCastle.rice = 0; 
                defCastle.soldiers = 0; 
                defCastle.samuraiIds = []; 
                defCastle.castellanId = 0;
                
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
        } 
        else { 
            candidates.sort((a,b) => WarSystem.calcRetreatScore(b) - WarSystem.calcRetreatScore(a)); 
            runRetreat(candidates[0].id); 
        }
    }

    endWar(attackerWon, isRetreat = false, capturedInRetreat = [], retreatTargetId = null) { 
        const s = this.state; s.active = false; 
        if (s.isPlayerInvolved) {
            const warModal = document.getElementById('war-modal');
            if(warModal) warModal.classList.add('hidden'); 
        }

        const isShortWar = s.round < window.WarParams.War.ShortWarTurnLimit;
        const baseRecov = window.WarParams.War.BaseRecoveryRate;
        const highRecov = window.WarParams.War.RetreatRecoveryRate;

        // 【修正】負傷兵の回復を計算
        const attackerRecovered = Math.floor(s.deadSoldiers.attacker * baseRecov);
        const totalAtkSurvivors = s.attacker.soldiers + attackerRecovered;

        if (isRetreat && retreatTargetId) {
             const targetC = this.game.getCastle(retreatTargetId);
             if (targetC) {
                 const recovered = Math.floor(s.deadSoldiers.defender * (isShortWar ? highRecov : baseRecov));
                 targetC.soldiers += (s.defender.soldiers + recovered);
                 if (s.isPlayerInvolved && recovered > 0) {
                     this.game.ui.log(`(撤退先にて負傷兵 ${recovered}名 が復帰)`);
                 }
             }
        } 
        else if (!isRetreat && attackerWon) {
             const survivors = Math.max(0, s.defender.soldiers);
             const recovered = Math.floor(s.deadSoldiers.defender * 0.2);
             const totalAbsorbed = survivors + recovered;
             
             // 占領後の城の兵士 ＝ 攻撃側の生き残り ＋ 吸収した敵兵
             s.defender.soldiers = totalAtkSurvivors + totalAbsorbed;
             
             if (s.isPlayerInvolved && totalAbsorbed > 0) {
                 this.game.ui.log(`(敵残存兵・負傷兵 計${totalAbsorbed}名 を吸収)`);
             }
        } 
        else if (!isRetreat && !attackerWon) {
             // 攻撃失敗時：攻撃側は元の城に戻る（生存兵＋回復分）
             const srcC = this.game.getCastle(s.sourceCastle.id); 
             srcC.soldiers += totalAtkSurvivors; 

             // 防御側は自分の城で回復
             const recovered = Math.floor(s.deadSoldiers.defender * baseRecov);
             s.defender.soldiers += recovered;
             
             if (s.isPlayerInvolved && attackerRecovered > 0) {
                 this.game.ui.log(`(遠征軍 負傷兵 ${attackerRecovered}名 が帰還)`);
             }
        }

        if (isRetreat && capturedInRetreat.length > 0) {
             this.pendingPrisoners = capturedInRetreat;
             if (s.attacker.ownerClan === this.game.playerClanId) {
                this.game.ui.showPrisonerModal(capturedInRetreat);
             } else {
                this.autoResolvePrisoners(capturedInRetreat, s.attacker.ownerClan);
             }
        }
        
        if (isRetreat) {
             s.defender.ownerClan = s.attacker.ownerClan; 
             s.defender.investigatedUntil = 0;
             s.atkBushos.forEach((b, idx) => { 
                const srcC = this.game.getCastle(s.sourceCastle.id); 
                srcC.samuraiIds = srcC.samuraiIds.filter(id => id !== b.id); 
                b.castleId = s.defender.id; 
                s.defender.samuraiIds.push(b.id); 
                if(idx === 0) { b.isCastellan = true; s.defender.castellanId = b.id; } else b.isCastellan = false; 
            });
            this.game.finishTurn();
            return;
        }

        const currentTurnId = this.game.getCurrentTurnId();
        if (attackerWon) { 
            s.attacker.training = Math.min(120, s.attacker.training + 5); 
            s.attacker.morale = Math.min(120, s.attacker.morale + 5); 
            
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
                 s.defender.gold -= lostGold;
                 s.defender.rice -= lostRice;
                 if (s.isPlayerInvolved) this.game.ui.log(`(敵兵の持ち逃げにより 金${lostGold}, 米${lostRice} が失われた)`);
            }

            s.defender.ownerClan = s.attacker.ownerClan; 
            s.defender.investigatedUntil = 0;
            s.defender.immunityUntil = currentTurnId + 1;
            
            s.atkBushos.forEach((b, idx) => { 
                const srcC = this.game.getCastle(s.sourceCastle.id); 
                srcC.samuraiIds = srcC.samuraiIds.filter(id => id !== b.id); 
                b.castleId = s.defender.id; 
                s.defender.samuraiIds.push(b.id); 
                if(idx === 0) { b.isCastellan = true; s.defender.castellanId = b.id; } else b.isCastellan = false; 
            }); 
        } else { 
            s.defender.immunityUntil = currentTurnId;
        } 
        
        this.game.finishTurn();
    }
    
    processCaptures(defeatedCastle, winnerClanId) { 
        const losers = this.game.getCastleBushos(defeatedCastle.id); 
        const captives = []; 
        const escapees = [];
        const friendlyCastles = this.game.castles.filter(c => c.ownerClan === defeatedCastle.ownerClan && c.id !== defeatedCastle.id);
        const isLastStand = friendlyCastles.length === 0;

        losers.forEach(b => { 
            let chance = isLastStand ? 1.0 : (0.4 - (b.strength * 0.002) + (Math.random() * 0.3)); 
            if (!isLastStand && defeatedCastle.soldiers > 1000) chance -= 0.2; 
            if (!isLastStand && b.isDaimyo) chance -= window.WarParams.War.DaimyoCaptureReduction;

            if (chance > 0.5) {
                captives.push(b); 
            } else { 
                if (friendlyCastles.length > 0) {
                    const escapeCastle = friendlyCastles[Math.floor(Math.random() * friendlyCastles.length)];
                    defeatedCastle.samuraiIds = defeatedCastle.samuraiIds.filter(id => id !== b.id);
                    b.castleId = escapeCastle.id;
                    b.isCastellan = false;
                    escapeCastle.samuraiIds.push(b.id);
                    escapees.push(b);
                } else {
                    b.clan = 0; b.castleId = 0; b.isCastellan = false; b.status = 'ronin'; 
                }
            } 
        }); 
        
        if (escapees.length > 0 && (defeatedCastle.ownerClan === this.game.playerClanId || winnerClanId === this.game.playerClanId)) {
             this.game.ui.log(`${escapees.length}名の武将が自領へ逃げ帰りました。`);
        }

        if (captives.length > 0) { 
            this.pendingPrisoners = captives; 
            if (winnerClanId === this.game.playerClanId) {
                this.game.ui.showPrisonerModal(captives); 
            } else {
                this.autoResolvePrisoners(captives, winnerClanId); 
            }
        } 
    }
    
    handlePrisonerAction(index, action) { 
        const prisoner = this.pendingPrisoners[index]; 
        const originalClanId = prisoner.clan;

        if (action === 'hire') { 
            const myBushos = this.game.bushos.filter(b=>b.clan===this.game.playerClanId); 
            const recruiter = myBushos.find(b => b.isDaimyo) || myBushos[0]; 
            const score = (recruiter.charm * 2.0) / (prisoner.loyalty * 1.5); 
            if (prisoner.isDaimyo) alert(`${prisoner.name}「敵の軍門には下らぬ！」`); 
            else if (score > Math.random()) { prisoner.clan = this.game.playerClanId; prisoner.loyalty = 50; const targetC = this.game.getCastle(prisoner.castleId); if(targetC) targetC.samuraiIds.push(prisoner.id); alert(`${prisoner.name}を登用しました！`); } 
            else alert(`${prisoner.name}は登用を拒否しました……`); 
        } 
        else if (action === 'kill') { 
            if (prisoner.isDaimyo) this.handleDaimyoDeath(prisoner); 
            prisoner.status = 'dead'; prisoner.clan = 0; prisoner.castleId = 0; 
        } 
        else if (action === 'release') { 
            const friendlyCastles = this.game.castles.filter(c => c.ownerClan === originalClanId);
            if (friendlyCastles.length > 0) {
                const returnCastle = friendlyCastles[Math.floor(Math.random() * friendlyCastles.length)];
                prisoner.castleId = returnCastle.id;
                prisoner.isCastellan = false;
                prisoner.status = 'active'; 
                returnCastle.samuraiIds.push(prisoner.id);
                alert(`${prisoner.name}を解放しました。(自領へ帰還しました)`);
            } else {
                prisoner.status = 'ronin'; prisoner.clan = 0; prisoner.castleId = 0; 
                alert(`${prisoner.name}を解放しました。(在野へ下りました)`);
            }
        } 
        this.pendingPrisoners.splice(index, 1); 
        if (this.pendingPrisoners.length === 0) this.game.ui.closePrisonerModal(); 
        else this.game.ui.showPrisonerModal(this.pendingPrisoners); 
    }
    
    handleDaimyoDeath(daimyo) { 
        const clanId = daimyo.clan; if(clanId === 0) return; 
        const candidates = this.game.bushos.filter(b => b.clan === clanId && b.id !== daimyo.id && b.status !== 'dead' && b.status !== 'ronin'); 
        if (candidates.length === 0) { 
            const clanCastles = this.game.castles.filter(c => c.ownerClan === clanId); 
            clanCastles.forEach(c => { c.ownerClan = 0; const lords = this.game.getCastleBushos(c.id); lords.forEach(l => { l.clan=0; l.status='ronin'; }); }); 
            return; 
        } 
        if (clanId === this.game.playerClanId) this.game.ui.showSuccessionModal(candidates, (newLeaderId) => this.game.changeLeader(clanId, newLeaderId)); 
        else { candidates.sort((a,b) => (b.politics + b.charm) - (a.politics + a.charm)); this.game.changeLeader(clanId, candidates[0].id); } 
    }
    
    autoResolvePrisoners(captives, winnerClanId) { 
        const aiBushos = this.game.bushos.filter(b => b.clan === winnerClanId); 
        const leaderInt = aiBushos.length > 0 ? Math.max(...aiBushos.map(b => b.intelligence)) : 50; 
        captives.forEach(p => { 
            if (p.isDaimyo) { 
                this.handleDaimyoDeath(p); p.status = 'dead'; p.clan = 0; p.castleId = 0; return; 
            } 
            if ((leaderInt / 100) > Math.random()) { 
                p.clan = winnerClanId; p.loyalty = 50; return; 
            } 
            if (p.charm > 60) { p.status = 'ronin'; p.clan = 0; p.castleId = 0; } 
            else { p.status = 'dead'; p.clan = 0; p.castleId = 0; } 
        }); 
    }
}