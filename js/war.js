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

    getValidWarTargets(currentCastle) {
        const myClanId = this.game.playerClanId;
        
        // 自分が従属している「親大名」を探します
        let myBossId = 0;
        for (const c of this.game.clans) {
            if (c.id !== myClanId) {
                const r = this.game.getRelation(myClanId, c.id);
                if (r && r.status === '従属') {
                    myBossId = c.id;
                    break;
                }
            }
        }

        return this.game.castles.filter(target => {
            // 基本的なチェック（道が繋がっているか、自分の城じゃないか、免疫期間じゃないか）
            if (!GameSystem.isReachable(this.game, currentCastle, target, myClanId)) return false;
            if (target.ownerClan === myClanId) return false;
            if ((target.immunityUntil || 0) >= this.game.getCurrentTurnId()) return false;
            
            // 直接の「同盟・支配・従属」は攻撃不可（※中立の城以外でチェックします）
            if (target.ownerClan !== 0) {
                const rel = this.game.getRelation(myClanId, target.ownerClan);
                if (['同盟', '支配', '従属'].includes(rel.status)) return false;

                // ★追加：親大名がいる場合、親の「同盟国」や「他の従属国（親が支配している国）」は攻撃できない
                if (myBossId !== 0) {
                    const bossRel = this.game.getRelation(myBossId, target.ownerClan);
                    if (bossRel && ['同盟', '支配'].includes(bossRel.status)) {
                        return false; // 攻撃先リストに入れません
                    }
                }
            }

            return true;
        }).map(t => t.id);
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
            if (this.game.castles.some(c => c.ownerClan === s.defender.ownerClan && c.id !== s.defender.id && GameSystem.isReachable(this.game, s.defender, c, s.defender.ownerClan))) commands.push({ label: "撤退", type: "retreat" });
        }
        return commands;
    }

    getGunshiAdvice(action) {
        if (action.type === 'war') return "合戦におもむきますか？ 兵力と兵糧の確認をお忘れなく。";
        if (this.state.active) { const gunshi = this.game.getClanGunshi(this.game.playerClanId); return gunshi ? WarSystem.getWarAdvice(gunshi, this.state) : null; }
        return null;
    }
    
    // ★修正: AIが鉄砲・騎馬を「強さ順」に賢く配分し、余った兵士を足軽で均等に分けるロジックを追加
    autoDivideSoldiers(bushos, totalSoldiers, totalHorses = 0, totalGuns = 0) {
        if (!bushos || bushos.length === 0) return [];
        if (bushos.length === 1) return [{ busho: bushos[0], soldiers: totalSoldiers, troopType: 'ashigaru' }];
        
        const N = bushos.length;
        // 総大将は他部隊の1.3倍の兵力にする
        const ratioSum = 1.3 + (N - 1) * 1.0;
        const baseAmount = Math.floor(totalSoldiers / ratioSum);
        
        // 1. まずは全員「足軽」として、必要な兵数（req）の目標を決めます
        let assignments = bushos.map((b, i) => {
            let req = (i === 0) ? Math.floor(baseAmount * 1.3) : baseAmount;
            return { 
                index: i,             // 元の順番を覚えておくための番号札
                busho: b, 
                req: req, 
                soldiers: req,        // とりあえず目標人数をセット
                troopType: 'ashigaru',
                score: b.leadership + b.strength // ★強さ（統率＋武勇）の合計点！
            };
        });

        // 割り切れない余り兵士を総大将に足す
        let totalReq = assignments.reduce((sum, a) => sum + a.req, 0);
        assignments[0].req += (totalSoldiers - totalReq);
        assignments[0].soldiers = assignments[0].req;

        let availableHorses = totalHorses;
        let availableGuns = totalGuns;
        let poolSoldiers = 0; // 余った兵士を貯めるプール
        
        const maxTeppoCount = Math.floor(N / 2);
        let teppoCount = 0;

        // ★追加: 順番待ちの列を「合計点（強さ）が高い順」に並び替えます！
        let sortedAssigns = [...assignments].sort((a, b) => b.score - a.score);

        // 万が一、全員が馬か鉄砲になってしまった時に、「最後に変身した人」を覚えておく箱です
        let lastChangedAssign = null;

        // 2. 強い人から順番に、馬や鉄砲を配っていきます
        for (let a of sortedAssigns) {
            let isGeneral = (a.index === 0);
            let req = a.req;
            
            // ★追加: 総大将は100%揃わないとダメ。他の人は50%でOKというルール
            let threshold = isGeneral ? req : req * 0.5;

            // 騎馬の判定
            if (availableHorses >= threshold) {
                a.troopType = 'kiba';
                let assignCount = Math.min(req, availableHorses);
                a.soldiers = assignCount;
                availableHorses -= assignCount;
                poolSoldiers += (req - assignCount); // 減らした分の兵士はプールへ
                lastChangedAssign = a;               // 最後に変身した人を記憶
            } 
            // 鉄砲の判定
            else if (availableGuns >= threshold && teppoCount < maxTeppoCount) {
                a.troopType = 'teppo';
                let assignCount = Math.min(req, availableGuns);
                a.soldiers = assignCount;
                availableGuns -= assignCount;
                poolSoldiers += (req - assignCount);
                teppoCount++;
                lastChangedAssign = a;               // 最後に変身した人を記憶
            }
        }

        // 3. 今「足軽」のままの部隊をピックアップします
        let ashigaruAssigns = assignments.filter(a => a.troopType === 'ashigaru');

        // ★修正: 余った兵士がいるのに、足軽が「ゼロ」になってしまった時だけ特別ルール発動！
        if (poolSoldiers > 0 && ashigaruAssigns.length === 0 && lastChangedAssign) {
            // 最後に変身した人に「ごめん、足軽に戻って！」とお願いします
            lastChangedAssign.troopType = 'ashigaru';
            // 足軽に戻るので、プールに貯めていた「減らした分の兵士」を元に戻して帳尻を合わせます
            poolSoldiers -= (lastChangedAssign.req - lastChangedAssign.soldiers);
            lastChangedAssign.soldiers = lastChangedAssign.req;
            // この人を足軽グループに入れます
            ashigaruAssigns.push(lastChangedAssign);
        }

        // ★追加: 余った兵士（プール）を、足軽みんなで「均等に」分け合います
        if (poolSoldiers > 0 && ashigaruAssigns.length > 0) {
            let share = Math.floor(poolSoldiers / ashigaruAssigns.length); // 1人あたりの配分
            let remainder = poolSoldiers % ashigaruAssigns.length;         // 割り切れなかった余り
            
            ashigaruAssigns.forEach((a, i) => {
                a.soldiers += share;
                // 割り切れなかった分は、先頭の人から順番に1人ずつ足していきます
                if (i < remainder) {
                    a.soldiers += 1;
                }
            });
        }

        // 4. 配り終わったら、元の「総大将が一番上」の順番に戻して結果を返します
        return assignments.map(a => ({
            busho: a.busho,
            soldiers: a.soldiers,
            troopType: a.troopType
        }));
    }

    async startWar(atkCastle, defCastle, atkBushos, atkSoldierCount, atkRice, atkHorses = 0, atkGuns = 0, reinforcementData = null) {
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

            // ★追加: 援軍が来ている場合、援軍元の城から兵士や物資を減らして、攻撃軍に合流させます！
            if (reinforcementData) {
                const helperCastle = reinforcementData.castle;
                // 援軍の城から出陣する分を引く
                helperCastle.soldiers = Math.max(0, helperCastle.soldiers - reinforcementData.soldiers);
                helperCastle.rice = Math.max(0, helperCastle.rice - reinforcementData.rice);
                helperCastle.horses = Math.max(0, (helperCastle.horses || 0) - reinforcementData.horses);
                helperCastle.guns = Math.max(0, (helperCastle.guns || 0) - reinforcementData.guns);
                reinforcementData.bushos.forEach(b => b.isActionDone = true);
                
                // 攻撃軍の総戦力に、援軍の分を足し算する（一緒に戦うため）
                atkSoldierCount += reinforcementData.soldiers;
                atkRice += reinforcementData.rice;
                atkHorses += reinforcementData.horses;
                atkGuns += reinforcementData.guns;
                
                // 武将たちも攻撃軍のリストに合流させます
                atkBushos = atkBushos.concat(reinforcementData.bushos);
                
                // 援軍として参加したのがプレイヤーだった場合、プレイヤーが関わっている戦争として扱います
                if (helperCastle.ownerClan === pid) {
                    isPlayerInvolved = true;
                }
            }

            // ★追加: AI（プレイヤー以外）が攻撃を仕掛ける場合、城にある馬と鉄砲をすべて持ち出す！
            if (atkClan !== pid && !atkCastle.isKunishu) {
                atkHorses = atkCastle.horses || 0;
                atkGuns = atkCastle.guns || 0;
            }

            atkCastle.soldiers = Math.max(0, atkCastle.soldiers - atkSoldierCount);
            atkCastle.rice = Math.max(0, atkCastle.rice - atkRice);
            atkCastle.horses = Math.max(0, (atkCastle.horses || 0) - atkHorses);
            atkCastle.guns = Math.max(0, (atkCastle.guns || 0) - atkGuns);
            atkBushos.forEach(b => b.isActionDone = true);

            const atkClanData = this.game.clans.find(c => c.id === atkClan); 
            // 国人衆の場合は専用の名前を使う
            const atkArmyName = atkCastle.isKunishu ? atkCastle.name : (atkClanData ? atkClanData.getArmyName() : "敵軍");
            
            // ★修正1：守備側の総大将を正しく設定する（国人衆の頭領にも対応）
            let defBusho = null;
            if (defCastle.isKunishu) {
                const kunishu = this.game.kunishuSystem.getKunishu(defCastle.kunishuId);
                defBusho = kunishu ? this.game.getBusho(kunishu.leaderId) : null;
            } else {
                defBusho = this.game.getBusho(defCastle.castellanId);
            }
            if (!defBusho) defBusho = {name:"守備隊長", strength:30, leadership:30, intelligence:30, charm:30};
            
            const attackerForce = {
                name: atkCastle.isKunishu ? atkCastle.name : atkCastle.name + "遠征軍", 
                ownerClan: atkCastle.ownerClan, 
                soldiers: atkSoldierCount, 
                bushos: atkBushos, 
                training: atkCastle.training, 
                morale: atkCastle.morale, 
                rice: atkRice, 
                maxRice: atkRice,
                horses: atkHorses,
                guns: atkGuns,
                isKunishu: atkCastle.isKunishu || false 
            };
            
            this.state = { 
                active: true, round: 1, attacker: attackerForce, sourceCastle: atkCastle, 
                defender: defCastle, atkBushos: atkBushos, defBusho: defBusho, 
                turn: 'attacker', isPlayerInvolved: isPlayerInvolved, deadSoldiers: { attacker: 0, defender: 0 }, defenderGuarding: false,
                // ★追加: あとで援軍を自分の城に帰せるように、戦争データに援軍パックを覚えておきます
                reinforcement: reinforcementData 
            };
            
            const showInterceptDialog = async (onResult) => {
	            if (isPlayerInvolved) await this.game.ui.showCutin(`${atkArmyName}の${atkBushos[0].name}が\n${defCastle.name}に攻め込みました！`);

                this.checkDefenderReinforcement(defCastle, atkClan, () => {
                    
                    // ★追加：守備側の総兵士数を計算（援軍含む）
                    const totalDefSoldiers = defCastle.soldiers + (this.state.defReinforcement ? this.state.defReinforcement.soldiers : 0);

    	            if (defClan === pid) {
    	                if (totalDefSoldiers <= 0) {
    	                    if (isPlayerInvolved) this.game.ui.log("城に兵士がいないため、迎撃（野戦）に出られません！");
    	                    onResult('siege');
    	                } else {
                            const modal = document.getElementById('intercept-confirm-modal');
                            if (modal) {
                                // ★ aiGuard を消す魔法を削除しました
                                modal.classList.remove('hidden');
                                document.getElementById('intercept-msg').innerText = `${atkArmyName}の${atkBushos[0].name}が攻めてきました！\n敵軍: ${atkSoldierCount} 対 自軍: ${totalDefSoldiers}\n迎撃（野戦）しますか？籠城しますか？`;
                                
                                document.getElementById('btn-intercept').onclick = () => { 
                                    modal.classList.add('hidden'); 
                                    this.game.ui.openBushoSelector('def_intercept_deploy', defCastle.id, {
                                        onConfirm: (selectedBushoIds) => {
                                            const defBushos = selectedBushoIds.map(id => this.game.getBusho(id));
                                            let defLeaderIdx = defBushos.findIndex(b => b.isDaimyo);
                                            if (defLeaderIdx === -1) defLeaderIdx = defBushos.findIndex(b => b.isCastellan);
                                            if (defLeaderIdx > 0) {
                                                const leader = defBushos.splice(defLeaderIdx, 1)[0];
                                                defBushos.unshift(leader);
                                            }
                                            this.game.ui.openQuantitySelector('def_intercept', [defCastle], null, {
                                                onConfirm: (inputs) => {
                                                    const inputData = inputs[defCastle.id] || inputs;
                                                    const interceptSoldiers = inputData.soldiers ? parseInt(inputData.soldiers.num.value) : (inputData.soldiers || 0);
                                                    const interceptRice = inputData.rice ? parseInt(inputData.rice.num.value) : (inputData.rice || 0);
                                                    const interceptHorses = inputData.horses ? parseInt(inputData.horses.num.value) : 0;
                                                    const interceptGuns = inputData.guns ? parseInt(inputData.guns.num.value) : 0;
                                                    
                                                    this.game.ui.showUnitDivideModal(defBushos, interceptSoldiers, interceptHorses, interceptGuns, (myDefAssignments) => {
                                                        // ★守備側援軍の自動編成と合流
                                                        let finalDefAssignments = myDefAssignments;
                                                        if (this.state.defReinforcement) {
                                                            const r = this.state.defReinforcement;
                                                            const rAssign = this.autoDivideSoldiers(r.bushos, r.soldiers, r.horses, r.guns);
                                                            finalDefAssignments = finalDefAssignments.concat(rAssign);
                                                        }

                                                        // ★攻撃軍（AI本隊＋援軍）の自動編成と合流
                                                        let finalAtkAssignments = [];
                                                        if (this.state.reinforcement) {
                                                            const r = this.state.reinforcement;
                                                            const mainBushos = atkBushos.filter(b => !r.bushos.some(rb => rb.id === b.id));
                                                            const mainAssign = this.autoDivideSoldiers(mainBushos, Math.max(0, atkSoldierCount - r.soldiers), Math.max(0, atkHorses - r.horses), Math.max(0, atkGuns - r.guns));
                                                            const rAssign = this.autoDivideSoldiers(r.bushos, r.soldiers, r.horses, r.guns);
                                                            finalAtkAssignments = mainAssign.concat(rAssign);
                                                        } else {
                                                            finalAtkAssignments = this.autoDivideSoldiers(atkBushos, atkSoldierCount, atkHorses, atkGuns);
                                                        }

                                                        onResult('field', finalDefAssignments, interceptRice, finalAtkAssignments, interceptHorses, interceptGuns);
                                                    },
                                                    // ★兵士配分画面でキャンセルしたら、最初の選択画面に戻す
                                                    () => { modal.classList.remove('hidden'); }
                                                    );
                                                },
                                                // ★兵数入力画面でキャンセルしたら、最初の選択画面に戻す
                                                onCancel: () => { modal.classList.remove('hidden'); }
                                            });
                                        },
                                        // ★武将選択画面でキャンセルしたら、最初の選択画面に戻す
                                        onCancel: () => { modal.classList.remove('hidden'); }
                                    });
                                };
                                document.getElementById('btn-siege').onclick = () => { modal.classList.add('hidden'); onResult('siege'); };
                            } else onResult('siege');
                        }
                    } else {
                        if (totalDefSoldiers >= atkSoldierCount * 0.8) {
                            let availableDefBushos = this.game.getCastleBushos(defCastle.id).filter(b => b.status !== 'dead');
                            if (!defCastle.isKunishu) {
                                availableDefBushos = availableDefBushos.filter(b => Number(b.clan) === Number(defCastle.ownerClan));
                            } else {
                                availableDefBushos = availableDefBushos.filter(b => b.belongKunishuId === defCastle.kunishuId);
                            }
                            const defBushos = availableDefBushos.sort((a,b) => b.strength - a.strength).slice(0, 5);
                            
                            let defLeaderIdx = defBushos.findIndex(b => b.isDaimyo);
                            if (defLeaderIdx === -1) defLeaderIdx = defBushos.findIndex(b => b.isCastellan);
                            if (defLeaderIdx > 0) {
                                const leader = defBushos.splice(defLeaderIdx, 1)[0];
                                defBushos.unshift(leader);
                            }
                            
                            const defSoldiers = defCastle.soldiers;
                            const defRice = Math.min(defCastle.rice, defSoldiers); 
                            const defHorses = defCastle.horses || 0;
                            const defGuns = defCastle.guns || 0;

                            // ★守備側（AI本隊＋援軍）の自動編成と合流
                            const mainDefAssignments = this.autoDivideSoldiers(defBushos, defSoldiers, defHorses, defGuns);
                            let finalDefAssignments = mainDefAssignments;
                            if (this.state.defReinforcement) {
                                const r = this.state.defReinforcement;
                                const rAssign = this.autoDivideSoldiers(r.bushos, r.soldiers, r.horses, r.guns);
                                finalDefAssignments = finalDefAssignments.concat(rAssign);
                            }
                            
                            if (atkClan === pid) {
                                if (attackerForce.isKunishu) {
                                    onResult('field', finalDefAssignments, defRice, [{busho: atkBushos[0], soldiers: atkSoldierCount, troopType: 'ashigaru'}], defHorses, defGuns);
                                } else {
                                    // ★攻撃側（プレイヤー本隊）のみを抽出して編成画面へ
                                    let myAtkBushos = atkBushos;
                                    let myAtkSoldierCount = atkSoldierCount;
                                    let myAtkHorses = atkHorses;
                                    let myAtkGuns = atkGuns;
                                    
                                    if (this.state.reinforcement) {
                                        const r = this.state.reinforcement;
                                        myAtkBushos = atkBushos.filter(b => !r.bushos.some(rb => rb.id === b.id));
                                        myAtkSoldierCount = Math.max(0, atkSoldierCount - r.soldiers);
                                        myAtkHorses = Math.max(0, atkHorses - r.horses);
                                        myAtkGuns = Math.max(0, atkGuns - r.guns);
                                    }

                                    this.game.ui.showUnitDivideModal(myAtkBushos, myAtkSoldierCount, myAtkHorses, myAtkGuns, (myAtkAssignments) => {
                                        let finalAtkAssignments = myAtkAssignments;
                                        // ★編成後に攻撃側援軍を自動編成して合流
                                        if (this.state.reinforcement) {
                                            const r = this.state.reinforcement;
                                            const rAssign = this.autoDivideSoldiers(r.bushos, r.soldiers, r.horses, r.guns);
                                            finalAtkAssignments = finalAtkAssignments.concat(rAssign);
                                        }
                                        onResult('field', finalDefAssignments, defRice, finalAtkAssignments, defHorses, defGuns);
                                    });
                                }
                            } else {
                                // ★攻撃側（AI本隊＋援軍）の自動編成と合流
                                let finalAtkAssignments = [];
                                if (this.state.reinforcement) {
                                    const r = this.state.reinforcement;
                                    const mainBushos = atkBushos.filter(b => !r.bushos.some(rb => rb.id === b.id));
                                    const mainAssign = this.autoDivideSoldiers(mainBushos, Math.max(0, atkSoldierCount - r.soldiers), Math.max(0, atkHorses - r.horses), Math.max(0, atkGuns - r.guns));
                                    const rAssign = this.autoDivideSoldiers(r.bushos, r.soldiers, r.horses, r.guns);
                                    finalAtkAssignments = mainAssign.concat(rAssign);
                                } else {
                                    finalAtkAssignments = this.autoDivideSoldiers(atkBushos, atkSoldierCount, atkHorses, atkGuns);
                                }
                                onResult('field', finalDefAssignments, defRice, finalAtkAssignments, defHorses, defGuns);
                            }
                        } else onResult('siege');
                    }
                }); 
            };

            // 国人衆制圧戦の場合は野戦をスキップして即攻城戦へ
            if (this.state.isKunishuSubjugation) {
                this.startSiegeWarPhase();
            } else if (typeof window.FieldWarManager === 'undefined') {
                this.startSiegeWarPhase();
            } else {
                showInterceptDialog((choice, defAssignments, defRice, atkAssignments, interceptHorses = 0, interceptGuns = 0) => {
                    
                    // ★追加: 野戦か籠城かが決まったこのタイミングで、守備側の援軍を城（防衛軍）に正式合流させる！
                    if (this.state.defReinforcement) {
                        const reinf = this.state.defReinforcement;
                        defCastle.soldiers += reinf.soldiers;
                        defCastle.rice += reinf.rice;
                        defCastle.horses = (defCastle.horses || 0) + reinf.horses;
                        defCastle.guns = (defCastle.guns || 0) + reinf.guns;
                        reinf.bushos.forEach(b => {
                            b.castleId = defCastle.id;
                            if (!defCastle.samuraiIds.includes(b.id)) defCastle.samuraiIds.push(b.id);
                        });
                    }

                    if (choice === 'field') {
                    
                        this.state.atkAssignments = atkAssignments; this.state.defAssignments = defAssignments; 
                        
                        let totalDefSoldiers = 0; if(defAssignments) defAssignments.forEach(a => totalDefSoldiers += a.soldiers);
                        defCastle.soldiers = Math.max(0, defCastle.soldiers - totalDefSoldiers);
                        defCastle.rice = Math.max(0, defCastle.rice - (defRice || 0));
                        defCastle.horses = Math.max(0, (defCastle.horses || 0) - interceptHorses);
                        defCastle.guns = Math.max(0, (defCastle.guns || 0) - interceptGuns);
                        
                        this.state.defender.fieldSoldiers = totalDefSoldiers;
                        this.state.defFieldRice = defRice || 0; 
                        this.state.defender.fieldHorses = interceptHorses;
                        this.state.defender.fieldGuns = interceptGuns;

                        if (!isPlayerInvolved) this.resolveAutoFieldWar();
                        else {
                            if (!this.game.fieldWarManager) this.game.fieldWarManager = new window.FieldWarManager(this.game);
                            this.game.fieldWarManager.startFieldWar(this.state, (resultType) => {
                                defCastle.soldiers += this.state.defender.fieldSoldiers;
                                defCastle.rice += this.state.defFieldRice; 
                                defCastle.horses = (defCastle.horses || 0) + (this.state.defender.fieldHorses || 0);
                                defCastle.guns = (defCastle.guns || 0) + (this.state.defender.fieldGuns || 0);
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
            setTimeout(() => {
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
        const candidates = this.game.castles.filter(c => c.ownerClan === defCastle.ownerClan && c.id !== defCastle.id && GameSystem.isReachable(this.game, defCastle, c, defCastle.ownerClan));
        if (candidates.length === 0) { this.endWar(true); return; }
        const s = this.state;
        
        const runRetreat = (targetId) => {
            if (!targetId) { this.endWar(true); return; } 
            const target = this.game.castles.find(c => c.id === targetId);
            if(target) {
                let lossRate = Math.min(0.9, Math.max(0.05, window.WarParams.War.RetreatResourceLossFactor + (s.attacker.soldiers / (defCastle.soldiers + 1)) * 0.1)); 
                const carryGold = Math.floor(defCastle.gold * (1.0 - lossRate)); const carryRice = Math.floor(defCastle.rice * (1.0 - lossRate));
                // ★追加：逃げ込んだ先の城がパンクしないように上限をかけます
                target.gold = Math.min(99999, target.gold + carryGold); 
                target.rice = Math.min(99999, target.rice + carryRice); 
                target.soldiers = Math.min(99999, target.soldiers + defCastle.soldiers);
                target.horses = Math.min(99999, (target.horses || 0) + (defCastle.horses || 0));
                target.guns = Math.min(99999, (target.guns || 0) + (defCastle.guns || 0));
                
                const capturedBushos = [];
                this.game.getCastleBushos(defCastle.id).forEach(b => { 
                    if (b.status === 'ronin') return;

                    let chance = 0.5 - (b.strength * (window.WarParams.War.CaptureStrFactor || 0.002)) + (Math.random() * 0.3);
                    if (defCastle.soldiers > 1000) chance -= 0.2;
                    if (b.isDaimyo) chance -= window.WarParams.War.DaimyoCaptureReduction;
                    if (chance > 0.5) { capturedBushos.push(b); }
                    else { b.castleId = target.id; b.isCastellan = false; target.samuraiIds.push(b.id); this.game.factionSystem.handleMove(b, defCastle.id, target.id); }
                });
                defCastle.gold -= carryGold; defCastle.rice = 0; defCastle.soldiers = 0; 
                defCastle.horses = 0; defCastle.guns = 0;
                
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
    
    async endWar(attackerWon, isRetreat = false, capturedInRetreat = [], retreatTargetId = null) { // ★ async を追加
        try {
            const s = this.state; s.active = false;

            // ★変更：順番待ちができるように async を付けます
            const finishWarProcess = async () => {
                const winnerClan = s.attacker.ownerClan; // 勝ったのは攻撃側です
                if (this.pendingPrisoners && this.pendingPrisoners.length > 0) {
                    // 捕虜がいる場合
                    if (winnerClan === this.game.playerClanId) {
                        // プレイヤーが勝ったなら、ここで初めて捕虜画面を出します
                        this.game.ui.showPrisonerModal(this.pendingPrisoners);
                    } else {
                        // ★変更：AIの捕虜処理が終わるまで「待つ(await)」ようにします
                        await this.autoResolvePrisoners(this.pendingPrisoners, winnerClan);
                        this.pendingPrisoners = [];
                        this.game.finishTurn();
                    }
                } else {
                    // 捕虜がいなければ、そのまま時間を進めます
                    this.game.finishTurn();
                }
            };
            
            // 兵士の減った割合を計算して、馬と鉄砲も減らす（壊れる）処理
            // 野戦があった場合、ここでの horses と guns は既に野戦生き残り数に更新されており、
            // originalAtkSoldiers も攻城戦開始時の兵数（野戦生き残り数）となるため、攻城戦での損耗だけが反映される。
            const originalAtkSoldiers = Math.max(1, s.attacker.soldiers + s.deadSoldiers.attacker);
            const atkSurviveRate = Math.max(0, s.attacker.soldiers) / originalAtkSoldiers;
            
            s.attacker.horses = Math.floor((s.attacker.horses || 0) * atkSurviveRate);
            s.attacker.guns = Math.floor((s.attacker.guns || 0) * atkSurviveRate);            

            // 防衛側（城）の馬と鉄砲も、兵士の損耗に合わせて壊れるようにする
            if (!s.defender.isKunishu) {
                const originalDefSoldiers = s.defender.soldiers + s.deadSoldiers.defender;
                const defSurviveRate = originalDefSoldiers > 0 ? (Math.max(0, s.defender.soldiers) / originalDefSoldiers) : 0;
                s.defender.horses = Math.floor((s.defender.horses || 0) * defSurviveRate);
                s.defender.guns = Math.floor((s.defender.guns || 0) * defSurviveRate);
            }
            
            // 援軍部隊を元の城に帰還させる処理
            if (s.reinforcement) {
                const reinf = s.reinforcement;
                const helperCastle = this.game.getCastle(reinf.castle.id); 
                
                if (helperCastle) {
                    let surviveRate = 0;
                    if (reinf.isAttacker) {
                        surviveRate = atkSurviveRate;
                    } else {
                        // 守備側の援軍用（次回以降作ります！）
                        const originalDefSoldiers = s.defender.soldiers + s.deadSoldiers.defender;
                        surviveRate = originalDefSoldiers > 0 ? (Math.max(0, s.defender.soldiers) / originalDefSoldiers) : 0;
                    }

                    // 援軍の兵士も、全体の損耗率に合わせて減らします
                    const returnSoldiers = Math.floor(reinf.soldiers * surviveRate);
                    const returnHorses = Math.floor(reinf.horses * surviveRate);
                    const returnGuns = Math.floor(reinf.guns * surviveRate);
                    
                    let returnRice = 0;
                    if (reinf.isAttacker) {
                        const ratio = s.attacker.soldiers > 0 ? (returnSoldiers / s.attacker.soldiers) : 0;
                        returnRice = Math.floor(s.attacker.rice * Math.min(1.0, ratio));
                        
                        // メインの攻撃軍のデータから、援軍の分を引いておきます（借りパク防止！）
                        s.attacker.rice = Math.max(0, s.attacker.rice - returnRice);
                        s.attacker.soldiers = Math.max(0, s.attacker.soldiers - returnSoldiers);
                        s.attacker.horses = Math.max(0, (s.attacker.horses || 0) - returnHorses);
                        s.attacker.guns = Math.max(0, (s.attacker.guns || 0) - returnGuns);
                        
                        // 攻撃軍の武将リストから、援軍武将を抜きます
                        reinf.bushos.forEach(rb => {
                            s.atkBushos = s.atkBushos.filter(b => b.id !== rb.id);
                        });
                    }

                    // 援軍元の城に、残った物資と兵士を戻します
                    helperCastle.soldiers = Math.min(99999, helperCastle.soldiers + returnSoldiers);
                    helperCastle.rice = Math.min(99999, helperCastle.rice + returnRice);
                    helperCastle.horses = Math.min(99999, (helperCastle.horses || 0) + returnHorses);
                    helperCastle.guns = Math.min(99999, (helperCastle.guns || 0) + returnGuns);
                    
                    // 武将を元の城に戻します（捕虜になる処理をすっ飛ばして無事に帰ります）
                    reinf.bushos.forEach(b => {
                        b.castleId = helperCastle.id;
                        b.isCastellan = false;
                        if (!helperCastle.samuraiIds.includes(b.id)) {
                            helperCastle.samuraiIds.push(b.id);
                        }
                    });
                    this.game.updateCastleLord(helperCastle);

                    // 友好度の増減（勝ったら+10、負けや撤退は-10）
                    const myClanId = reinf.isAttacker ? s.sourceCastle.ownerClan : s.defender.ownerClan;
                    const helperClanId = helperCastle.ownerClan;
                    
                    let isWin = false;
                    if (reinf.isAttacker) {
                        isWin = attackerWon && !isRetreat;
                    } else {
                        isWin = !attackerWon && !isRetreat;
                    }
                    
                    if (isWin) {
                        this.game.diplomacyManager.updateSentiment(myClanId, helperClanId, 5);
                        if (s.isPlayerInvolved) this.game.ui.log(`(援軍が勝利に貢献し、${this.game.clans.find(c=>c.id===helperClanId)?.name}との友好度が上がりました)`);
                    } else {
                        this.game.diplomacyManager.updateSentiment(myClanId, helperClanId, -5);
                        if (s.isPlayerInvolved) this.game.ui.log(`(敗北/撤退により、${this.game.clans.find(c=>c.id===helperClanId)?.name}との友好度が下がりました)`);
                    }
                }
            }
            
            // ★最終追加: 守備側の援軍部隊も元の城に帰還させる処理
            if (s.defReinforcement) {
                const defReinf = s.defReinforcement;
                const helperCastle = this.game.getCastle(defReinf.castle.id);
                
                if (helperCastle) {
                    const originalDefSoldiers = s.defender.soldiers + s.deadSoldiers.defender;
                    const surviveRate = originalDefSoldiers > 0 ? (Math.max(0, s.defender.soldiers) / originalDefSoldiers) : 0;

                    // 残った兵士、馬、鉄砲の計算
                    const returnSoldiers = Math.floor(defReinf.soldiers * surviveRate);
                    const returnHorses = Math.floor(defReinf.horses * surviveRate);
                    const returnGuns = Math.floor(defReinf.guns * surviveRate);
                    
                    // 防衛側の城のデータから、援軍分を差し引く（借りパク防止！）
                    s.defender.soldiers = Math.max(0, s.defender.soldiers - returnSoldiers);
                    s.defender.horses = Math.max(0, (s.defender.horses || 0) - returnHorses);
                    s.defender.guns = Math.max(0, (s.defender.guns || 0) - returnGuns);

                    // 援軍元の城に、残った物資と兵士を戻す
                    helperCastle.soldiers = Math.min(99999, helperCastle.soldiers + returnSoldiers);
                    helperCastle.horses = Math.min(99999, (helperCastle.horses || 0) + returnHorses);
                    helperCastle.guns = Math.min(99999, (helperCastle.guns || 0) + returnGuns);

                    // 守備側の城の武将リストから援軍武将を抜く
                    defReinf.bushos.forEach(rb => {
                        const idx = s.defender.samuraiIds.indexOf(rb.id);
                        if (idx !== -1) s.defender.samuraiIds.splice(idx, 1);
                    });

                    // 援軍武将を元の城に戻す
                    defReinf.bushos.forEach(b => {
                        b.castleId = helperCastle.id;
                        b.isCastellan = false;
                        if (!helperCastle.samuraiIds.includes(b.id)) {
                            helperCastle.samuraiIds.push(b.id);
                        }
                    });
                    this.game.updateCastleLord(helperCastle);

                    // 友好度の増減（防衛成功で+5、陥落で-5）
                    const myClanId = s.defender.ownerClan;
                    const helperClanId = helperCastle.ownerClan;
                    
                    if (!attackerWon && !isRetreat) {
                        this.game.diplomacyManager.updateSentiment(myClanId, helperClanId, 5);
                        if (s.isPlayerInvolved) this.game.ui.log(`(防衛援軍が成功し、${this.game.clans.find(c=>c.id===helperClanId)?.name}との友好度が上がりました)`);
                    } else {
                        this.game.diplomacyManager.updateSentiment(myClanId, helperClanId, -5);
                        if (s.isPlayerInvolved) this.game.ui.log(`(防衛失敗により、${this.game.clans.find(c=>c.id===helperClanId)?.name}との友好度が下がりました)`);
                    }
                }
            }
            
            // プレイヤーが国人衆を制圧（討伐）した時の処理
            if (s.isKunishuSubjugation) {
                const kunishu = this.game.kunishuSystem.getKunishu(s.defender.kunishuId);
                let resultMsg = ""; 
                
                if (attackerWon) {
                    resultMsg = `【国衆制圧】\n${s.defender.name}の討伐に成功しました！`;
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
                    resultMsg = `【討伐失敗】\n${s.defender.name}の討伐に失敗しました……`;
                    this.game.ui.log(`【国衆制圧】${s.defender.name}の討伐に失敗しました……`);
                    
                    if (kunishu) {
                        kunishu.soldiers = s.defender.soldiers;
                        kunishu.defense = s.defender.defense;
                    }
                }
                
                const srcC = this.game.getCastle(s.sourceCastle.id);
                if (srcC) {
                    // ★追加：帰還した城が上限を超えないようにします
                    srcC.soldiers = Math.min(99999, srcC.soldiers + s.attacker.soldiers); 
                    srcC.rice = Math.min(99999, srcC.rice + s.attacker.rice);
                    srcC.horses = Math.min(99999, (srcC.horses || 0) + (s.attacker.horses || 0));
                    srcC.guns = Math.min(99999, (srcC.guns || 0) + (s.attacker.guns || 0));
                }
                
                if (s.isPlayerInvolved) {
                    this.game.ui.setWarModalVisible(false);
                    this.game.ui.showResultModal(resultMsg, () => { this.closeWar(); });
                } else {
                    this.closeWar();
                }
                return;
            }
            
            // 国人衆が反乱（蜂起）を起こした時の処理
            if (s.attacker.isKunishu) {
                let resultMsg = ""; 
                
                if (attackerWon) {
                    const targetC = this.game.getCastle(s.defender.id);
                    const oldOwner = targetC.ownerClan;
                    targetC.ownerClan = 0; 
                    targetC.castellanId = 0;
                    
                    const kunishuMembers = this.game.kunishuSystem.getKunishuMembers(s.attacker.kunishuId).map(b => b.id);
                    
                    this.game.getCastleBushos(targetC.id).forEach(b => {
                        if (!kunishuMembers.includes(b.id)) {
                            b.status = 'ronin'; 
                            b.clan = 0; 
                            b.isCastellan = false;
                        }
                    });
                    
                    targetC.samuraiIds = targetC.samuraiIds.filter(id => {
                        const busho = this.game.getBusho(id);
                        return kunishuMembers.includes(id) || (busho && busho.status === 'ronin');
                    });

                    resultMsg = `【国衆蜂起】\n国人衆の反乱により、${targetC.name}が陥落し空白地となりました。`;
                    this.game.ui.log(`【国衆蜂起】国人衆の反乱により、${targetC.name}が陥落し空白地となりました。`);
                    
                    if (this.game.castles.filter(c => c.ownerClan === oldOwner).length === 0) {
                        const clanName = this.game.clans.find(c=>c.id===oldOwner)?.name || "不明";
                        const extMsg = `${clanName}は滅亡しました。`;
                        this.game.ui.log(extMsg);
                        
                        // ★追加：滅亡のダイアログを出して時間を止めます
                        await new Promise(resolve => {
                            const autoClose = setTimeout(() => {
                                const modal = document.getElementById('dialog-modal');
                                const okBtn = document.getElementById('dialog-ok-btn');
                                if (modal && !modal.classList.contains('hidden') && okBtn) {
                                    okBtn.click();
                                }
                            }, 5000);

                            this.game.ui.showDialog(extMsg, false, () => {
                                clearTimeout(autoClose);
                                resolve();
                            });
                        });

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
                    resultMsg = `【国衆蜂起】\n国人衆の反乱を鎮圧しました。`;
                    this.game.ui.log(`【国衆蜂起】国人衆の反乱を鎮圧しました。`);
                }
                
                if (s.isPlayerInvolved) {
                    this.game.ui.setWarModalVisible(false);
                    this.game.ui.showResultModal(resultMsg, () => { this.closeWar(); });
                } else {
                    this.closeWar();
                }
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
                // ★追加：戦争終了時の兵糧合流でも上限を超えないようにします
                if (attackerWon) s.defender.rice = Math.min(99999, s.defender.rice + s.attacker.rice); 
                else { const srcC = this.game.getCastle(s.sourceCastle.id); if (srcC) srcC.rice = Math.min(99999, srcC.rice + s.attacker.rice); }
            }

            // ★修正：攻撃軍が城に入って「兵士数」が勘違いされる前に、捕縛の処理を行います！
            if (!isRetreat && attackerWon) {
                this.processCaptures(s.defender, s.attacker.ownerClan);
            }

            if (isRetreat && retreatTargetId) {
                const targetC = this.game.getCastle(retreatTargetId);
                if (targetC) {
                    const recovered = Math.floor(s.deadSoldiers.defender * (isShortWar ? window.WarParams.War.RetreatRecoveryRate : window.WarParams.War.BaseRecoveryRate));
                    // ★追加：撤退先での兵士合流にストッパー！
                    targetC.soldiers = Math.min(99999, targetC.soldiers + s.defender.soldiers + recovered);
                    if (s.isPlayerInvolved && recovered > 0) this.game.ui.log(`(撤退先にて負傷兵 ${recovered}名 が復帰)`);
                }
            } else if (!isRetreat && attackerWon) {
                const survivors = Math.max(0, s.defender.soldiers);
                const recovered = Math.floor(s.deadSoldiers.defender * 0.2);
                const totalAbsorbed = survivors + recovered;
                // ★追加：城を奪った時の兵士や馬、鉄砲の合流にストッパー！
                s.defender.soldiers = Math.min(99999, totalAtkSurvivors + totalAbsorbed);
                s.defender.horses = Math.min(99999, (s.defender.horses || 0) + (s.attacker.horses || 0));
                s.defender.guns = Math.min(99999, (s.defender.guns || 0) + (s.attacker.guns || 0));
                if (s.isPlayerInvolved && totalAbsorbed > 0) this.game.ui.log(`(敵残存兵・負傷兵 計${totalAbsorbed}名 を吸収)`);
            } else if (!attackerWon) {
                const srcC = this.game.getCastle(s.sourceCastle.id);
                // ★追加：負けて帰ってきた遠征軍の兵士、馬、鉄砲の合流にストッパー！
                srcC.soldiers = Math.min(99999, srcC.soldiers + totalAtkSurvivors);
                srcC.horses = Math.min(99999, (srcC.horses || 0) + (s.attacker.horses || 0));
                srcC.guns = Math.min(99999, (srcC.guns || 0) + (s.attacker.guns || 0));
                const recovered = Math.floor(s.deadSoldiers.defender * window.WarParams.War.BaseRecoveryRate);
                s.defender.soldiers = Math.min(99999, s.defender.soldiers + recovered);
                if (s.isPlayerInvolved && attackerRecovered > 0) this.game.ui.log(`(遠征軍 負傷兵 ${attackerRecovered}名 が帰還)`);
            }

            if (isRetreat && capturedInRetreat.length > 0) {
                this.pendingPrisoners = capturedInRetreat;
            }
            
            if (isRetreat && attackerWon) {
                s.defender.ownerClan = s.attacker.ownerClan; s.defender.investigatedUntil = 0; s.defender.soldiers = totalAtkSurvivors;
                
                // ★追加: 敵が撤退して空になった城を占領した時、持ってきた馬と鉄砲を城に格納する
                s.defender.horses = (s.attacker.horses || 0);
                s.defender.guns = (s.attacker.guns || 0);

                const srcC = this.game.getCastle(s.sourceCastle.id);
                s.atkBushos.forEach((b) => { 
                    srcC.samuraiIds = srcC.samuraiIds.filter(id => id !== b.id); 
                    this.game.factionSystem.handleMove(b, s.sourceCastle.id, s.defender.id); 
                    b.castleId = s.defender.id; s.defender.samuraiIds.push(b.id); b.isCastellan = false; 
                });
                this.game.updateCastleLord(srcC); this.game.updateCastleLord(s.defender);
                
                // ★書き足し１：守備側が撤退した時の履歴ログ
                const atkClanData1 = this.game.clans.find(c => c.id === s.attacker.ownerClan);
                const atkArmyName1 = s.attacker.isKunishu ? s.attacker.name : (atkClanData1 ? atkClanData1.getArmyName() : "敵軍");
                this.game.ui.log(`【合戦結果】守備軍の撤退により、${atkArmyName1}が${s.defender.name}を占領しました。`);
                
                if (s.isPlayerInvolved) {
                    this.game.ui.showResultModal(`撤退しました。\n${retreatTargetId ? '部隊は移動しました。' : '部隊は解散しました。'}`, finishWarProcess);
                } else {
                    finishWarProcess();
                }
                return;
            }

            let resultMsg = "";
            const isAtkPlayer = (Number(s.attacker.ownerClan) === Number(this.game.playerClanId));
            const isDefPlayer = (Number(s.defender.ownerClan) === Number(this.game.playerClanId));
            const enemyName = isAtkPlayer ? (this.game.clans.find(c => c.id === s.defender.ownerClan)?.getArmyName() || "敵軍") : s.attacker.name;

            if (attackerWon) { 
                // ★ここから書き足し：城側が負けた・撤退した時の追加減少
                if (!s.defender.isKunishu && !s.isKunishuSubjugation && !s.attacker.isKunishu) {
                    // 民忠をさらに現在の2割減らす
                    const dropLoyaltyEnd = Math.floor(s.defender.peoplesLoyalty * 0.2);
                    s.defender.peoplesLoyalty = Math.max(0, s.defender.peoplesLoyalty - dropLoyaltyEnd);

                    // 人口を制圧時点の攻撃側の兵士数の2割減らす
                    const dropPopulationEnd = Math.floor(s.attacker.soldiers * 0.2);
                    s.defender.population = Math.max(0, s.defender.population - dropPopulationEnd);
                }
                // ★書き足しここまで

                s.attacker.training = Math.min(120, s.attacker.training + (window.WarParams.War.WinStatIncrease || 5)); s.attacker.morale = Math.min(120, s.attacker.morale + (window.WarParams.War.WinStatIncrease || 5)); 
                
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
                // ★書き足し２：攻撃側が勝利して制圧した時の履歴ログ
                const atkClanData2 = this.game.clans.find(c => c.id === s.attacker.ownerClan);
                const atkArmyName2 = s.attacker.isKunishu ? s.attacker.name : (atkClanData2 ? atkClanData2.getArmyName() : "敵軍");
                this.game.ui.log(`【合戦結果】${atkArmyName2}が${s.defender.name}を制圧しました。`);
            } else { 
                s.defender.immunityUntil = this.game.getCurrentTurnId(); 
                if (isAtkPlayer) resultMsg = isRetreat ? `${s.defender.name}からの撤退を決定しました……` : `${s.defender.name}を落としきることができませんでした……`;
                else if (isDefPlayer) resultMsg = isRetreat ? `${enemyName}は攻略を諦め、撤退していきました！` : `${s.defender.name}を守り抜きました！`;
                else resultMsg = isRetreat ? `${s.defender.name}から撤退しました……` : `${s.defender.name}を守り抜きました！\n敗者: ${s.attacker.name}`;
                // ★書き足し３：攻撃側が負けた（または撤退した）時の履歴ログ
                const defClanData = this.game.clans.find(c => c.id === s.defender.ownerClan);
                const defArmyName = s.defender.isKunishu ? s.defender.name : (defClanData ? defClanData.getArmyName() : "守備軍");
                if (isRetreat) {
                     const atkClanData3 = this.game.clans.find(c => c.id === s.attacker.ownerClan);
                     const atkArmyName3 = s.attacker.isKunishu ? s.attacker.name : (atkClanData3 ? atkClanData3.getArmyName() : "攻撃軍");
                     this.game.ui.log(`【合戦結果】${atkArmyName3}は${s.defender.name}の攻略を諦め、撤退しました。`);
                } else {
                     this.game.ui.log(`【合戦結果】${defArmyName}が${s.defender.name}の防衛に成功しました。`);
                }
            } 

            if (s.isPlayerInvolved) this.game.ui.showResultModal(resultMsg, finishWarProcess);
            else finishWarProcess();
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
            // ★ 修正: 未登場の武将を巻き込んで捕虜や浪人にしないように守ります！
            if (b.status === 'ronin' || b.status === 'unborn' || b.status === 'dead') return;

            let chance = isLastStand ? 1.0 : ((window.WarParams.War.CaptureChanceBase || 0.7) - (b.strength * (window.WarParams.War.CaptureStrFactor || 0.002)) + (Math.random() * 0.3));
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
        } 
    }
    
    async handlePrisonerAction(index, action) { // ★ async を追加
        const prisoner = this.pendingPrisoners[index]; 
        const originalClanId = prisoner.clan;
        const kunishu = prisoner.belongKunishuId > 0 ? this.game.kunishuSystem.getKunishu(prisoner.belongKunishuId) : null;

        // ★追加：ダイアログの「OKボタン」を押した後に、次の処理へ進むための特別な箱を用意しました
        const nextStep = () => {
            this.pendingPrisoners.splice(index, 1); 
            if (this.pendingPrisoners.length === 0) {
                this.game.ui.closePrisonerModal();
                this.game.finishTurn();
            } else {
                this.game.ui.showPrisonerModal(this.pendingPrisoners); 
            }
        };

        if (action === 'hire') { 
            if (kunishu && prisoner.id === kunishu.leaderId) {
                this.game.ui.showDialog(`${prisoner.name}「国衆を束ねるこの俺が、お前になど仕えるか！」\n(※国人衆の代表者は登用できません)`, false); 
                return; // やり直し
            }

            const myBushos = this.game.bushos.filter(b=>b.clan===this.game.playerClanId); const recruiter = myBushos.find(b => b.isDaimyo) || myBushos[0]; 
            const score = (recruiter.charm * 2.0) / (prisoner.loyalty * 1.5); 
            
            // ★変更：メッセージの後に「nextStep」を渡して、ボタンが押されるまで待つようにしました
            if (prisoner.isDaimyo) {
                this.game.ui.showDialog(`${prisoner.name}「敵の軍門には下らぬ！」`, false, nextStep); 
            } else if (score > Math.random()) { 
                prisoner.clan = this.game.playerClanId; prisoner.loyalty = 50; prisoner.isCastellan = false; 
                prisoner.belongKunishuId = 0; 
                const targetC = this.game.getCastle(prisoner.castleId) || this.game.getCurrentTurnCastle(); 
                if(targetC) { 
                    prisoner.castleId = targetC.id;
                    if (!targetC.samuraiIds.includes(prisoner.id)) targetC.samuraiIds.push(prisoner.id); 
                    this.game.updateCastleLord(targetC); 
                }
                this.game.ui.showDialog(`${prisoner.name}を登用しました！`, false, nextStep); 
            } else {
                this.game.ui.showDialog(`${prisoner.name}は登用を拒否しました……`, false, nextStep); 
            }
        } else if (action === 'kill') { 
            if (prisoner.isDaimyo) {
                await this.handleDaimyoDeath(prisoner); // ★ await を追加
                prisoner.isDaimyo = false; 
            }
            this.game.lifeSystem.executeDeath(prisoner);
            prisoner.clan = 0; prisoner.castleId = 0; prisoner.belongKunishuId = 0;
            
            // 処断はメッセージがないので、そのまま次へ進めます
            nextStep();
            
        } else if (action === 'release') { 
            // ★変更：こちらもメッセージの後に「nextStep」を渡して待つようにしました
            if (kunishu && !kunishu.isDestroyed) {
                prisoner.status = 'active'; 
                prisoner.clan = 0;
                prisoner.castleId = kunishu.castleId;
                const returnCastle = this.game.getCastle(kunishu.castleId);
                if (returnCastle && !returnCastle.samuraiIds.includes(prisoner.id)) returnCastle.samuraiIds.push(prisoner.id);
                this.game.ui.showDialog(`${prisoner.name}を解放しました。(国人衆へ帰還しました)`, false, nextStep);
            } else {
                const friendlyCastles = this.game.castles.filter(c => c.ownerClan === originalClanId && originalClanId !== 0);
                if (friendlyCastles.length > 0) {
                    const returnCastle = friendlyCastles[Math.floor(Math.random() * friendlyCastles.length)];
                    prisoner.castleId = returnCastle.id; prisoner.isCastellan = false; prisoner.status = 'active'; returnCastle.samuraiIds.push(prisoner.id);
                    this.game.factionSystem.handleMove(prisoner, 0, returnCastle.id); this.game.updateCastleLord(returnCastle);
                    this.game.ui.showDialog(`${prisoner.name}を解放しました。(自領へ帰還しました)`, false, nextStep);
                } else { 
                    prisoner.status = 'ronin'; prisoner.clan = 0; prisoner.castleId = 0; prisoner.belongKunishuId = 0; 
                    this.game.ui.showDialog(`${prisoner.name}を解放しました。(在野へ下りました)`, false, nextStep); 
                }
            }
        } 
    }
    
    // ★ここを書き換えました！大名が亡くなった時の後継者選びです！
    async handleDaimyoDeath(daimyo) { // ★ async を追加
        const clanId = daimyo.clan; 
        if(clanId === 0) return; 
        
        // 1. 生きている一門がいるかチェック
        const activeFamily = this.game.bushos.filter(b => b.clan === clanId && b.id !== daimyo.id && b.status === 'active' && daimyo.familyIds.some(fId => b.familyIds.includes(fId)));
        
        // ★追加: もし生きている一門が0人なら、未登場の一門を探して強制的に登場させる
        if (activeFamily.length === 0) {
            const unbornFamily = this.game.bushos.filter(b => b.status === 'unborn' && daimyo.familyIds.some(fId => b.familyIds.includes(fId)));
            
            if (unbornFamily.length > 0) {
                // 相性 -> 年齢順に並べ替え
                unbornFamily.sort((a,b) => {
                    const diffA = Math.abs((daimyo.affinity || 0) - (a.affinity || 0));
                    const diffB = Math.abs((daimyo.affinity || 0) - (b.affinity || 0));
                    if (diffA !== diffB) return diffA - diffB;
                    return a.birthYear - b.birthYear;
                });

                // 一番有力な候補を強制登場させる
                const heir = unbornFamily[0];
                const clanCastles = this.game.castles.filter(c => c.ownerClan === clanId);
                const baseCastle = clanCastles.length > 0 ? clanCastles[0] : null;

                if (baseCastle) {
                    heir.status = 'active';
                    heir.clan = clanId;
                    heir.castleId = baseCastle.id;
                    heir.loyalty = 100;
                    if (!baseCastle.samuraiIds.includes(heir.id)) baseCastle.samuraiIds.push(heir.id);
                    this.game.ui.log(`【緊急継承】${daimyo.name.replace('|','')}の血縁、まだ幼い${heir.name.replace('|','')}が元服し、家督を継ぐため立ち上がりました！`);
                }
            }
        }

        // ★修正：緊急登場が終わった「後」で、同じ大名家の候補を探し直します！
        const candidates = this.game.bushos.filter(b => b.clan === clanId && b.id !== daimyo.id && b.status !== 'dead' && b.status !== 'ronin'); 
        
        // もし誰もいなかったら、その大名家は滅亡です…
        if (candidates.length === 0) { 
            const clan = this.game.clans.find(c => c.id === clanId);
            const msg = `${daimyo.name.replace('|','')}が処断され、後継ぎがいないため【${clan ? clan.name : '不明'}家】は滅亡しました……`;
            this.game.ui.log(msg);

            // ★追加：滅亡のダイアログを出して時間を止めます
            await new Promise(resolve => {
                const autoClose = setTimeout(() => {
                    const modal = document.getElementById('dialog-modal');
                    const okBtn = document.getElementById('dialog-ok-btn');
                    if (modal && !modal.classList.contains('hidden') && okBtn) {
                        okBtn.click();
                    }
                }, 5000);

                this.game.ui.showDialog(msg, false, () => {
                    clearTimeout(autoClose);
                    resolve();
                });
            });

            this.game.castles.filter(c => c.ownerClan === clanId).forEach(c => { 
                c.ownerClan = 0; 
                this.game.getCastleBushos(c.id).forEach(l => { 
                    // ★ 修正：出番待ち（未登場）や死亡した武将を巻き込んで浪人にしないように守ります！
                    if (l.status === 'unborn' || l.status === 'dead') return;
                    l.clan = 0; 
                    l.status = 'ronin'; 
                }); 
            }); 
            return; 
        }
        
        // プレイヤーの場合は、自分で選ぶ画面を出します！
        if (clanId === this.game.playerClanId) {
            this.game.ui.showSuccessionModal(candidates, (newLeaderId) => this.game.changeLeader(clanId, newLeaderId)); 
        } else { 
            // AIの場合は、自動で一番ふさわしい人を計算して選びます
            candidates.forEach(b => {
                // 1. 一門（家族・親戚）かどうかをチェック！
                b._isRelative = daimyo.familyIds.some(fId => b.familyIds.includes(fId));
                // 2. 仲良し度（相性）の差を計算！差が小さいほど仲良し！
                b._affinityDiff = Math.abs((daimyo.affinity || 0) - (b.affinity || 0));
                // 3. 今までの計算式（政治＋魅力）！
                b._baseScore = b.politics + b.charm;
            });

            // 順番に並べ替えます
            candidates.sort((a,b) => {
                // まずは一門かどうかを最優先！
                if (a._isRelative && !b._isRelative) return -1;
                if (!a._isRelative && b._isRelative) return 1;
                
                // 一門同士、または一門じゃない者同士なら次へ
                if (a._isRelative && b._isRelative) {
                    // 相性の差が小さい人を優先！
                    if (a._affinityDiff !== b._affinityDiff) return a._affinityDiff - b._affinityDiff;
                    // 相性も同じなら、年齢が上の人（生まれた年が昔の人）を優先！
                    if (a.birthYear !== b.birthYear) return a.birthYear - b.birthYear;
                }
                
                // それでも同じ、または一門じゃない場合は、今までの計算式で勝負！
                return b._baseScore - a._baseScore;
            });
            
            // 一番上に来た人を新しい大名にします！
            this.game.changeLeader(clanId, candidates[0].id); 
        } 
    }
    
    async autoResolvePrisoners(captives, winnerClanId) { // ★ async を追加
        const aiBushos = this.game.bushos.filter(b => b.clan === winnerClanId); 
        const leaderInt = aiBushos.length > 0 ? Math.max(...aiBushos.map(b => b.intelligence)) : 50; 

        // ★変更：forEach を for...of に変えて順番待ちできるようにします
        for (const p of captives) { 
            // ★変更：大名が処断される時
            if (p.isDaimyo) { 
                await this.handleDaimyoDeath(p); // ★ await を追加
                p.isDaimyo = false; // 大名マークを外します
                this.game.lifeSystem.executeDeath(p); // 共通のお片付け魔法
                p.clan = 0; p.castleId = 0; p.belongKunishuId = 0; 
                continue; // ★ return を continue に変更します
            } 
            
            const isKunishuBoss = (p.belongKunishuId > 0 && p.id === this.game.kunishuSystem.getKunishu(p.belongKunishuId)?.leaderId);

            if (!isKunishuBoss && (leaderInt / 100) > Math.random()) { 
                p.clan = winnerClanId; p.loyalty = 50; p.isCastellan = false; p.belongKunishuId = 0;
                const targetC = this.game.getCastle(p.castleId);
                if (targetC && !targetC.samuraiIds.includes(p.id)) { targetC.samuraiIds.push(p.id); this.game.updateCastleLord(targetC); }
                continue; // ★修正！「return;」を「continue;」に直しました！これで途中で終わらなくなります！
            } 
            if (p.charm > (window.WarParams.War.PrisonerRecruitThreshold || 60)) { 
                const kunishu = p.belongKunishuId > 0 ? this.game.kunishuSystem.getKunishu(p.belongKunishuId) : null;
                if (kunishu && !kunishu.isDestroyed) {
                    p.status = 'active'; p.clan = 0; p.castleId = kunishu.castleId;
                } else {
                    p.status = 'ronin'; p.clan = 0; p.castleId = 0; 
                }
            } 
            else { 
                // ★変更：一般武将が処断される時
                this.game.lifeSystem.executeDeath(p); // 共通のお片付け魔法
                p.clan = 0; p.castleId = 0; p.belongKunishuId = 0; 
            } 
        } // ★ for...of に変えたので閉じカッコを変更します
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
    
    // ★ここから追加: 守備側が援軍を呼べるかチェックする機能
    checkDefenderReinforcement(defCastle, atkClanId, onComplete) {
        const defClanId = defCastle.ownerClan;
        const pid = this.game.playerClanId;
        
        // 国人衆の反乱など、特殊な戦いなら援軍は呼べません
        if (defClanId === 0 || defCastle.isKunishu || this.state.isKunishuSubjugation) {
            onComplete();
            return;
        }

        let candidateCastles = [];

        this.game.castles.forEach(c => {
            if (c.ownerClan === 0 || c.ownerClan === defClanId || c.ownerClan === atkClanId) return;

            const rel = this.game.getRelation(defClanId, c.ownerClan);
            if (!['友好', '同盟', '支配', '従属'].includes(rel.status)) return;
            if (rel.sentiment < 50) return;

            const enemyRel = this.game.getRelation(c.ownerClan, atkClanId);
            if (['同盟', '支配', '従属'].includes(enemyRel.status)) return;

            // ★変更: 守備側は「攻められている大名が所有しているいずれかの城」に隣接している城にだけ呼べます
            const isNextToMyAnyCastle = this.game.castles.some(myC => myC.ownerClan === defClanId && GameSystem.isAdjacent(c, myC));
            if (!isNextToMyAnyCastle) return;

            if (c.soldiers < 1000) return;
            if (c.rice < 500) return;

            const normalBushos = this.game.getCastleBushos(c.id).filter(b => 
                !b.isDaimyo && !b.isCastellan && b.status !== 'ronin' && b.belongKunishuId === 0
            );
            if (normalBushos.length === 0) return;

            candidateCastles.push(c);
        });

        if (candidateCastles.length === 0) {
            onComplete();
            return;
        }

        if (defClanId === pid) {
            // プレイヤーが守備側なら、UIを出して選ばせる
            this.game.ui.showDefReinforcementSelector(candidateCastles, defCastle, onComplete);
        } else {
            // AIが守備側なら、一番兵士が多いところに自動で頼みます
            candidateCastles.sort((a,b) => b.soldiers - a.soldiers);
            const bestCastle = candidateCastles[0];
            // AIは金を持たせません（ケチ）
            this.executeDefReinforcement(0, bestCastle, defCastle, onComplete);
        }
    }

    executeDefReinforcement(gold, helperCastle, defCastle, onComplete) {
        if (gold > 0) defCastle.gold -= gold;

        const myClanId = defCastle.ownerClan;
        const helperClanId = helperCastle.ownerClan;
        const enemyClanId = this.state.attacker.ownerClan;

        const myToHelperRel = this.game.getRelation(myClanId, helperClanId);
        const helperToEnemyRel = this.game.getRelation(helperClanId, enemyClanId);

        if (helperClanId === this.game.playerClanId) {
            const myClanName = this.game.clans.find(c => c.id === myClanId)?.name || "不明";
            const isBoss = (myToHelperRel.status === '従属');

            // ★ aiGuard を消す魔法を削除しました

            // ★武将選択画面を呼び出す合図
            const startSelection = () => {
                this._promptPlayerDefReinforcement(helperCastle, defCastle, myToHelperRel, onComplete, isBoss);
            };

            if (isBoss) {
                const msg = `主家である ${myClanName} (${defCastle.name}) から防衛の援軍要請が届きました。\n（使者持参金: ${gold}）\n当家は従属しているため、直ちに出陣します！`;
                this.game.ui.showDialog(msg, false, startSelection);
            } else {
                const msg = `${myClanName} (${defCastle.name}) から防衛の援軍要請が届きました。\n（使者持参金: ${gold}）\n援軍を派遣しますか？`;
                this.game.ui.showDialog(msg, true, 
                    startSelection,
                    () => {
                        this.game.diplomacyManager.updateSentiment(myClanId, helperClanId, -10);
                        this.game.ui.showDialog(`援軍要請を断りました。`, false, onComplete);
                    }
                );
            }
            return;
        }

        let isSuccess = false;

        if (myToHelperRel.status === '支配') {
            isSuccess = true;
        } else {
            let prob = 0;
            if (myToHelperRel.sentiment >= 50) prob += (myToHelperRel.sentiment - 49); 
            prob += Math.floor((gold / 1500) * 15);
            if (myToHelperRel.status === '同盟' || myToHelperRel.status === '従属') prob += 30;
            if (helperToEnemyRel && helperToEnemyRel.sentiment >= 50) {
                prob -= Math.floor((helperToEnemyRel.sentiment - 50) * (20 / 50)) + 1; 
            }
            prob += 10; 
            if (Math.random() * 100 < prob) isSuccess = true;
        }

        if (!isSuccess) {
            if (myClanId === this.game.playerClanId) {
                this.game.ui.showDialog(`${helperCastle.name}への防衛援軍要請は断られました……。\n自軍のみで防衛します。`, false, onComplete);
            } else {
                onComplete();
            }
            return;
        }

        this._applyDefReinforcement(helperCastle, defCastle, myToHelperRel, onComplete);
    }

    // ★追加：援軍が来る処理を新しく作って分離しました
    _applyDefReinforcement(helperCastle, defCastle, myToHelperRel, onComplete) {
        const myClanId = defCastle.ownerClan;
        const helperClanId = helperCastle.ownerClan;

        if (!['支配', '従属', '同盟'].includes(myToHelperRel.status)) {
            this.game.diplomacyManager.updateSentiment(myClanId, helperClanId, -10);
        }

        const helperDaimyo = this.game.bushos.find(b => b.clan === helperClanId && b.isDaimyo) || { duty: 50 };
        let maxSendable = Math.floor(helperCastle.soldiers * 0.5);
        if (maxSendable < 500) maxSendable = 500;
        if (maxSendable > helperCastle.soldiers) maxSendable = helperCastle.soldiers;

        let reinfSoldiers = Math.floor(maxSendable * (((myToHelperRel.sentiment / 100) + (helperDaimyo.duty / 100)) / 2 + 0.5));
        if (reinfSoldiers < 500) reinfSoldiers = 500;
        if (reinfSoldiers > 3000) reinfSoldiers = 3000;
        if (reinfSoldiers > helperCastle.soldiers) reinfSoldiers = helperCastle.soldiers;

        const availableBushos = this.game.getCastleBushos(helperCastle.id).filter(b => 
            !b.isDaimyo && !b.isCastellan && b.status !== 'ronin' && b.belongKunishuId === 0
        ).sort((a,b) => b.strength - a.strength);

        let bushoCount = 1;
        if (reinfSoldiers >= 1500) bushoCount = 2;
        if (reinfSoldiers >= 2500) bushoCount = 3;
        if (bushoCount > availableBushos.length) bushoCount = availableBushos.length;

        const reinfBushos = availableBushos.slice(0, bushoCount);

        let reinfRice = reinfSoldiers; 
        if (reinfRice < 500) reinfRice = 500; // 最低でも兵糧500は持っていく！
        if (reinfRice > helperCastle.rice) reinfRice = helperCastle.rice; // 城にある限界は超えないようにする
        
        const reinfHorses = Math.min(helperCastle.horses || 0, Math.floor(reinfSoldiers * 0.5)); 
        const reinfGuns = Math.min(helperCastle.guns || 0, Math.floor(reinfSoldiers * 0.5));

        // 援軍元の城から減らす
        helperCastle.soldiers = Math.max(0, helperCastle.soldiers - reinfSoldiers);
        helperCastle.rice = Math.max(0, helperCastle.rice - reinfRice);
        helperCastle.horses = Math.max(0, (helperCastle.horses || 0) - reinfHorses);
        helperCastle.guns = Math.max(0, (helperCastle.guns || 0) - reinfGuns);
        reinfBushos.forEach(b => b.isActionDone = true);

        // 守備側の援軍パックとして state に保存
        this.state.defReinforcement = {
            castle: helperCastle,
            bushos: reinfBushos,
            soldiers: reinfSoldiers,
            rice: reinfRice,      
            horses: reinfHorses,
            guns: reinfGuns
        };
        
        // プレイヤーが関わる戦争にする
        if (helperClanId === this.game.playerClanId) {
            this.state.isPlayerInvolved = true;
        }

        const helperClanName = this.game.clans.find(c => c.id === helperClanId)?.name || "援軍";

        if (myClanId === this.game.playerClanId || helperClanId === this.game.playerClanId) {
            this.game.ui.showDialog(`${helperClanName} (${helperCastle.name}) が防衛の援軍に駆けつけました！`, false, onComplete);
        } else {
            onComplete();
        }
    }
    
    // ★ここから追加：プレイヤーが武将と兵数を選ぶための新しい処理
    _promptPlayerDefReinforcement(helperCastle, defCastle, myToHelperRel, onComplete, isBoss) {
        const promptBusho = () => {
            this.game.ui.openBushoSelector('def_reinf_deploy', helperCastle.id, {
                hideCancel: isBoss, // ★追加：主君からの命令なら「戻る(キャンセル)」ボタンを隠す！
                onConfirm: (selectedBushoIds) => {
                    const reinfBushos = selectedBushoIds.map(id => this.game.getBusho(id));
                    promptQuantity(reinfBushos);
                },
                onCancel: () => {
                    // ★主君の時はそもそもボタンが見えないので、ここに来るのは主君じゃない時だけです！
                    this.game.ui.showDialog("援軍の派遣を取りやめました。", false, onComplete);
                }
            });
        };

        const promptQuantity = (reinfBushos) => {
            this.game.ui.openQuantitySelector('def_reinf_supplies', [helperCastle], null, {
                onConfirm: (inputs) => {
                    const inputData = inputs[helperCastle.id] || inputs;
                    const reinfSoldiers = inputData.soldiers ? parseInt(inputData.soldiers.num.value) : 500;
                    const reinfRice = inputData.rice ? parseInt(inputData.rice.num.value) : 500;
                    const reinfHorses = inputData.horses ? parseInt(inputData.horses.num.value) : 0;
                    const reinfGuns = inputData.guns ? parseInt(inputData.guns.num.value) : 0;

                    this._applyManualDefReinforcement(helperCastle, defCastle, myToHelperRel, reinfBushos, reinfSoldiers, reinfRice, reinfHorses, reinfGuns, onComplete);
                },
                onCancel: () => {
                    promptBusho(); // 戻るボタンで武将選択に戻ります
                }
            });
        };

        promptBusho(); // 最初に武将選択画面を呼び出します
    }

    _applyManualDefReinforcement(helperCastle, defCastle, myToHelperRel, reinfBushos, reinfSoldiers, reinfRice, reinfHorses, reinfGuns, onComplete) {
        const myClanId = defCastle.ownerClan;
        const helperClanId = helperCastle.ownerClan;

        // 援軍元の城から減らす
        helperCastle.soldiers = Math.max(0, helperCastle.soldiers - reinfSoldiers);
        helperCastle.rice = Math.max(0, helperCastle.rice - reinfRice);
        helperCastle.horses = Math.max(0, (helperCastle.horses || 0) - reinfHorses);
        helperCastle.guns = Math.max(0, (helperCastle.guns || 0) - reinfGuns);
        reinfBushos.forEach(b => b.isActionDone = true);

        // 守備側の援軍パックとして state に保存
        this.state.defReinforcement = {
            castle: helperCastle,
            bushos: reinfBushos,
            soldiers: reinfSoldiers,
            rice: reinfRice,
            horses: reinfHorses,
            guns: reinfGuns
        };

        this.state.isPlayerInvolved = true;
        const helperClanName = this.game.clans.find(c => c.id === helperClanId)?.name || "援軍";
        this.game.ui.showDialog(`${helperClanName} (${helperCastle.name}) が防衛の援軍に出発しました！`, false, onComplete);
    }
    // ★追加ここまで
    
}