/**
 * independence_system.js
 * 城主の独立（謀反）システム
 */

class IndependenceSystem {
    constructor(game) {
        this.game = game;
    }

    /**
     * 月末に呼び出されるメイン処理
     */
    async checkIndependence() {
        const potentialRebels = this.game.castles.filter(c => {
            if (c.ownerClan === 0) return false; 
            if (!c.castellanId) return false; 
            const castellan = this.game.getBusho(c.castellanId);
            if (!castellan || castellan.isDaimyo) return false; 
            if (castellan.belongKunishuId > 0) return false;
            const clanCastles = this.game.castles.filter(cl => cl.ownerClan === c.ownerClan);
            if (clanCastles.length <= 1) return false;
            return true;
        });

        const I = window.WarParams.Independence || {};
        const thresholdBase = I.ThresholdBase || 29;
        const dutyDiv = I.ThresholdDutyDiv || 2;
        const ambDiv = I.ThresholdAmbitionDiv || 5;

        for (const castle of potentialRebels) {
            const castellan = this.game.getBusho(castle.castellanId);
            const daimyo = this.game.bushos.find(b => b.clan === castle.ownerClan && b.isDaimyo);
            if (!castellan || !daimyo) continue;
            if (daimyo.factionId !== 0 && castellan.factionId === daimyo.factionId) continue; 

            const threshold = thresholdBase + ((50 - castellan.duty) / dutyDiv) + ((castellan.ambition - 50) / ambDiv);
            if (castellan.loyalty <= threshold) {
                await this.calculateAndExecute(castle, castellan, daimyo, threshold);
            }
        }
    }

    /**
     * 大名の総合ステータスによる補正値の計算 (200~400の範囲で -20~+20)
     */
    calcDaimyoPowerBonus(busho) {
        const total = busho.leadership + busho.strength + busho.politics + busho.diplomacy + busho.intelligence;
        const diff = total - 300;
        const clampedDiff = Math.max(-100, Math.min(100, diff));
        return (clampedDiff / 100) * 20;
    }

    /**
     * ★新機能：新しい主君への忠誠度を動的に計算する
     * 元の忠誠が低いほど、新しい体制への期待で忠誠が上がる（最大100）
     */
    calcNewLoyalty(oldLoyalty) {
        const bonus = 100 - oldLoyalty;
        return Math.min(100, 80 + bonus);
    }

    async calculateAndExecute(castle, castellan, daimyo, threshold) {
        const I = window.WarParams.Independence || {};
        const probLoyalty = I.ProbLoyaltyFactor || 2;
        const probAffinity = I.ProbAffinityFactor || 0.5;
        const daimyoBonus = this.calcDaimyoPowerBonus(daimyo);
        const affinityDiff = GameSystem.calcAffinityDiff(castellan.affinity, daimyo.affinity);
        
        let prob = ((threshold - castellan.loyalty) * probLoyalty) + (affinityDiff * probAffinity) - (daimyoBonus * 2);
        
        // 大名と「一門」関係なら、独立する確率をグッと減らすおまじない！
        // 城主(castellan)と大名(daimyo)の家族ID(familyIds)に共通のものがあるか調べます
        const isFamily = castellan.familyIds.some(id => daimyo.familyIds.includes(id));
        if (isFamily) {
            prob = prob * 0.7; // 一門なら、独立する確率を７０％に減らします！
        }
        
        if (prob <= 0) return;
        if (Math.random() * 1000 < prob) {
            // ★変更：いきなり独立するのではなく、お家乗っ取りの作戦会議を開きます！
            await this.planCoupDetatOrRebellion(castle, castellan, daimyo);
        }
    }

    async executeRebellion(castle, castellan, oldDaimyo) {
        const oldClanId = castle.ownerClan;
        const I = window.WarParams.Independence || {};

        // --- ★追加：派閥主を神輿（みこし）に担ぐ処理 ---
        let rebellionLeader = castellan; // デフォルトは謀反を起こした城主
        let isProxyRebellion = false;    // 神輿担ぎかどうかを覚える旗

        // もし独立を起こす城主が派閥に属していて、なおかつ派閥主ではない場合
        if (castellan.factionId !== 0 && !castellan.isFactionLeader) {
            // 同じ大名家で、同じ派閥のリーダー（派閥主）を探す
            const factionLeader = this.game.bushos.find(b => b.clan === oldClanId && b.factionId === castellan.factionId && b.isFactionLeader && !b.belongKunishuId);
            if (factionLeader) {
                // 派閥主が、今の殿様よりも独立計画に賛同してくれるかを計算
                const { joinScore, stayScore } = this.calculateLoyaltyScores(factionLeader, castellan, oldDaimyo);
                if (joinScore > stayScore) {
                    rebellionLeader = factionLeader; // 派閥主が神輿になる！
                    isProxyRebellion = true;
                }
            }
        }

        // --- ★ここから：寝返り先を探す処理 ---
        let targetClanId = null;
        let targetDaimyo = null;
        let bestScore = -1;

        // ★変更：寝返り前の「今のままの大名家の戦力」を計算します
        const oldClanPower = this.calcClanPower(oldClanId);

        // 相性の計算基準を rebellionLeader（神輿になる人物）に変更
        const oldAffinityDiff = GameSystem.calcAffinityDiff(rebellionLeader.affinity, oldDaimyo.affinity);

        for (const clan of this.game.clans) {
            if (clan.id === 0 || clan.id === oldClanId) continue; 
            const rel = this.game.getRelation(oldClanId, clan.id);
            if (!rel || rel.status !== '敵対') continue;
            
            // その敵対大名が持っている城の中に、ここから「3マス以内」の城があるか探します
            const enemyCastles = this.game.castles.filter(c => c.ownerClan === clan.id);
            let isNear = false; // 最初は「近くない」としておきます
            for (const ec of enemyCastles) {
                // タテの距離とヨコの距離を足して、何マス離れているか計算します
                const distance = Math.abs(castle.x - ec.x) + Math.abs(castle.y - ec.y);
                if (distance <= 3) {
                    isNear = true; // 3マス以内の城が見つかったら「近い！」とメモします
                    break; // 1つでも見つかればOKなので、探すのをやめます
                }
            }
            // もし3マス以内に城が1つもなかったら、この大名家は遠すぎるので無視（スキップ）します
            if (!isNear) continue; 
            
            const enemyDaimyo = this.game.bushos.find(b => b.clan === clan.id && b.isDaimyo);
            if (!enemyDaimyo) continue;

            // ★変更：寝返り前の「そのままの敵対大名の戦力」を計算します
            let enemyCurrentPower = this.calcClanPower(clan.id);
            
            // 相性の計算基準を rebellionLeader に変更
            const enemyAffinityDiff = GameSystem.calcAffinityDiff(rebellionLeader.affinity, enemyDaimyo.affinity);
            let affinityBonus = 0;
            if (enemyAffinityDiff < oldAffinityDiff) {
                affinityBonus = oldAffinityDiff - enemyAffinityDiff; 
            }

            // ★変更：「今の敵対大名戦力」 ＞ 「今の元大名戦力」 になるなら候補に入れます
            if ((enemyCurrentPower + affinityBonus) > oldClanPower) {
                const score = enemyCurrentPower + affinityBonus;
                if (score > bestScore) {
                    bestScore = score;
                    targetClanId = clan.id;
                    targetDaimyo = enemyDaimyo;
                }
            }
        }
        // --- ★ここまで ---

        let isDefection = false;
        let newClanId;
        let newClanName;
        
        if (targetClanId) {
            isDefection = true;
            newClanId = targetClanId;
            const targetClan = this.game.clans.find(c => c.id === targetClanId);
            newClanName = targetClan ? targetClan.name : "敵対大名";

            // ★追加：大名家が変わるので功績半分！
            if (castellan.clan !== 0 && castellan.clan !== newClanId) {
                castellan.achievementTotal = Math.floor((castellan.achievementTotal || 0) / 2);
            }
            castellan.clan = newClanId;
            castellan.loyalty = 100;
            this.game.affiliationSystem.changeCastleOwner(castle, newClanId);
            
        } else {
            newClanId = Math.max(...this.game.clans.map(c => c.id)) + 1;
            const newColor = '#' + Math.floor(Math.random()*16777215).toString(16).padStart(6, '0');
            // ★新大名家の名前は神輿の人物ベース
            const familyName = rebellionLeader.familyName || rebellionLeader.name; 
            newClanName = `${familyName}家`;

            const newClan = new Clan({
                id: newClanId, name: newClanName, color: newColor, leaderId: rebellionLeader.id
            });
            this.game.clans.push(newClan);

            rebellionLeader.isDaimyo = true;
            
            // ★大名家が変わる（新設）ので功績半分！
            if (castellan.clan !== 0 && castellan.clan !== newClanId) {
                castellan.achievementTotal = Math.floor((castellan.achievementTotal || 0) / 2);
            }
            castellan.clan = newClanId;
            castellan.loyalty = 100;
            this.game.affiliationSystem.changeCastleOwner(castle, newClanId);

            const oldClan = this.game.clans.find(c => c.id === oldClanId);
            if (oldClan) oldClan.diplomacyValue[newClanId] = { status: '敵対', sentiment: 0 };
            newClan.diplomacyValue[oldClanId] = { status: '敵対', sentiment: 0 };
        }

        // ★神輿（派閥主）本人の処遇
        if (isProxyRebellion) {
            const leaderCastle = this.game.castles.find(c => c.id === rebellionLeader.castleId);
            // ★神輿（派閥主）も大名家が変わるので功績半分！
            if (rebellionLeader.clan !== 0 && rebellionLeader.clan !== newClanId) {
                rebellionLeader.achievementTotal = Math.floor((rebellionLeader.achievementTotal || 0) / 2);
            }
            if (rebellionLeader.isCastellan && leaderCastle) {
                // 派閥主がどこかの城主なら、その城も新勢力になる
                this.game.affiliationSystem.changeCastleOwner(leaderCastle, newClanId);
                rebellionLeader.clan = newClanId;
                rebellionLeader.loyalty = 100;
            } else {
                // 城主でない（どこかの城の部下）なら、脱出して起点の城に合流する
                if (leaderCastle) {
                    leaderCastle.samuraiIds = leaderCastle.samuraiIds.filter(id => id !== rebellionLeader.id);
                    this.game.updateCastleLord(leaderCastle);
                }
                rebellionLeader.clan = newClanId;
                rebellionLeader.loyalty = 100;
                rebellionLeader.castleId = castle.id;
                castle.samuraiIds.push(rebellionLeader.id);
            }
        }

        // 部下たちの去就
        // ★主君の基準を rebellionLeader にする
        let captiveMsgs = this.resolveSubordinates(castle, rebellionLeader, oldDaimyo, newClanId, oldClanId);

        // ★派閥主が別の城の城主だった場合、その城の部下たちも処遇を決定する
        if (isProxyRebellion && rebellionLeader.isCastellan) {
            const leaderCastle = this.game.castles.find(c => c.id === rebellionLeader.castleId);
            if (leaderCastle && leaderCastle.id !== castle.id) {
                const extraMsgs = this.resolveSubordinates(leaderCastle, rebellionLeader, oldDaimyo, newClanId, oldClanId);
                if (extraMsgs.length > 0) captiveMsgs = captiveMsgs.concat(extraMsgs);
                this.game.updateCastleLord(leaderCastle);
            }
        }

        // ★基準を rebellionLeader にして派閥全体の呼応を処理
        this.resolveFactionWideRebellion(rebellionLeader, oldClanId, newClanId, oldDaimyo);
        this.resolveDistantFactionMembers(rebellionLeader, oldClanId, newClanId, oldDaimyo);

        this.game.updateCastleLord(castle);

        const oldClanName = this.game.clans.find(c => c.id === oldClanId)?.name || "不明";
        let msg = "";
        
        // ★メッセージの出し分け
        if (isProxyRebellion) {
            if (isDefection) {
                msg = `${oldClanName} ${castle.name}の${castellan.name}が派閥主・${rebellionLeader.name}を擁立し、敵対する${newClanName}へ寝返りました！`;
            } else {
                msg = `${oldClanName} ${castle.name}の${castellan.name}が派閥主・${rebellionLeader.name}を大名として擁立し、独立を宣言しました！`;
            }
        } else {
            if (isDefection) {
                msg = `${oldClanName} ${castle.name}の${castellan.name}が、敵対する${newClanName}へ寝返りました！`;
            } else {
                msg = `${oldClanName}の${castellan.name}が${castle.name}にて独立しました！`;
            }
        }
        
        // ★追加：独立や寝返りで勢力が大きく変わるので、威信を最新に更新しておきます！
        if (window.GameApp) window.GameApp.updateAllClanPrestige();
        
        this.game.ui.log(msg);
        if (captiveMsgs && captiveMsgs.length > 0) msg += '\n\n' + captiveMsgs.join('\n');
        await this.game.ui.showDialogAsync(msg, false, 0);
    }

    calculateLoyaltyScores(busho, newDaimyo, oldDaimyo) {
        const affNew = GameSystem.calcAffinityDiff(busho.affinity, newDaimyo.affinity);
        const affOld = GameSystem.calcAffinityDiff(busho.affinity, oldDaimyo.affinity);
        let joinScore = (100 - affNew) * 2.0 + (busho.ambition * 0.5);
        let stayScore = (100 - affOld) * 2.0 + (busho.loyalty * 0.5);

        joinScore += this.calcDaimyoPowerBonus(newDaimyo);
        stayScore += this.calcDaimyoPowerBonus(oldDaimyo);

        if (busho.loyalty < 90) joinScore += (90 - busho.loyalty);
        joinScore += (50 - busho.duty) * 0.4;

        if (busho.factionId !== 0) {
            if (busho.factionId === newDaimyo.factionId) joinScore += 50;
            if (busho.factionId === oldDaimyo.factionId) stayScore += 50;
        }
        return { joinScore, stayScore };
    }

    resolveSubordinates(castle, newDaimyo, oldDaimyo, newClanId, oldClanId) {
        const subordinates = this.game.getCastleBushos(castle.id).filter(b => b.id !== newDaimyo.id && b.status !== 'ronin' && b.clan === oldClanId && !b.belongKunishuId);
        const captives = [], joiners = [];
        const escapeCastles = this.game.castles.filter(c => c.ownerClan === oldClanId && c.id !== castle.id);
        
        subordinates.forEach(busho => {
            const { joinScore, stayScore } = this.calculateLoyaltyScores(busho, newDaimyo, oldDaimyo);
            if (joinScore > stayScore) {
                const oldLoy = busho.loyalty;
                // ★大名家が変わるので功績半分！
                if (busho.clan !== 0 && busho.clan !== newClanId) {
                    busho.achievementTotal = Math.floor((busho.achievementTotal || 0) / 2);
                }
                busho.clan = newClanId;
                busho.loyalty = this.calcNewLoyalty(oldLoy);
                joiners.push(busho);
            } else {
                if (escapeCastles.length > 0 && busho.duty >= 30) {
                    if ((busho.strength + busho.intelligence) * (Math.random() + 0.5) > (newDaimyo.leadership + newDaimyo.intelligence) * 0.8) {
                        const target = escapeCastles[Math.floor(Math.random() * escapeCastles.length)];
                        // ★新しいお引越しセンターの魔法を使います！
                        this.game.affiliationSystem.moveCastle(busho, target.id);
                        this.game.updateCastleLord(target);
                    } else {
                        castle.samuraiIds = castle.samuraiIds.filter(id => id !== busho.id);
                        busho.castleId = 0; captives.push(busho);
                    }
                } else {
                    const oldLoy = busho.loyalty;
                    // ★大名家が変わるので功績半分！
                    if (busho.clan !== 0 && busho.clan !== newClanId) {
                        busho.achievementTotal = Math.floor((busho.achievementTotal || 0) / 2);
                    }
                    busho.clan = newClanId;
                    busho.loyalty = Math.min(40, this.calcNewLoyalty(oldLoy) - 50); // 消極的合流は低めに設定
                    joiners.push(busho);
                }
            }
        });
        if (joiners.length > 0) this.game.ui.log(`  -> ${castle.name}にて${joiners.length}名が追随しました。`);
        return captives.length > 0 ? this.handleCaptives(captives, oldClanId, newClanId, newDaimyo) : [];
    }

    resolveFactionWideRebellion(leader, oldClanId, newClanId, oldDaimyo) {
        const otherCastles = this.game.castles.filter(c => c.ownerClan === oldClanId && c.castellanId !== 0 && c.castellanId !== leader.id);
        otherCastles.forEach(castle => {
            const busho = this.game.getBusho(castle.castellanId);
            if (busho && busho.factionId !== 0 && busho.factionId === leader.factionId && !busho.belongKunishuId) {
                const { joinScore, stayScore } = this.calculateLoyaltyScores(busho, leader, oldDaimyo);
                if (joinScore > stayScore) {
                    this.game.ui.log(`  -> 呼応！${castle.name}城主の${busho.name}が${leader.name}に与しました！`);
                    const oldLoy = busho.loyalty;
                    this.game.affiliationSystem.changeCastleOwner(castle, newClanId);
                    // ★大名家が変わるので功績半分！
                    if (busho.clan !== 0 && busho.clan !== newClanId) {
                        busho.achievementTotal = Math.floor((busho.achievementTotal || 0) / 2);
                    }
                    busho.clan = newClanId;
                    busho.loyalty = this.calcNewLoyalty(oldLoy);
                    this.resolveSubordinates(castle, leader, oldDaimyo, newClanId, oldClanId);
                    this.game.updateCastleLord(castle);
                }
            }
        });
    }

    resolveDistantFactionMembers(newDaimyo, oldClanId, newClanId, oldDaimyo) {
        if (newDaimyo.factionId === 0) return; 
        const potential = this.game.bushos.filter(b => b.clan === oldClanId && !b.isCastellan && b.status === 'active' && b.factionId === newDaimyo.factionId && !b.belongKunishuId);
        const mainCastle = this.game.castles.find(c => c.castellanId === newDaimyo.id);
        if (!mainCastle) return;

        potential.forEach(busho => {
            const { joinScore, stayScore } = this.calculateLoyaltyScores(busho, newDaimyo, oldDaimyo);
            if (joinScore > stayScore && Math.random() * 300 < joinScore) {
                const oldCastle = this.game.castles.find(c => c.id === busho.castleId);
                if (oldCastle) {
                    oldCastle.samuraiIds = oldCastle.samuraiIds.filter(id => id !== busho.id);
                    this.game.updateCastleLord(oldCastle);
                }
                // ★大名家が変わるので功績半分！
                if (busho.clan !== 0 && busho.clan !== newClanId) {
                    busho.achievementTotal = Math.floor((busho.achievementTotal || 0) / 2);
                }
                busho.clan = newClanId;
                busho.castleId = mainCastle.id;
                busho.loyalty = 100; // 駆けつけた場合は特別に100
                mainCastle.samuraiIds.push(busho.id);
                this.game.ui.log(`  -> ${busho.name}が城を脱出し、${newDaimyo.name}の元へ駆けつけました！`);
            }
        });
    }

    handleCaptives(captives, oldClanId, newClanId, newDaimyo) {
        const returnCastles = this.game.castles.filter(c => c.ownerClan === oldClanId);
        let alertMsgs = [];
        captives.forEach(p => {
            if (oldClanId === this.game.playerClanId) {
                if (GameSystem.calcAffinityDiff(p.affinity, newDaimyo.affinity) > 60) {
                    p.status = 'dead'; p.clan = 0;
                    alertMsgs.push(`処断：${p.name} は処断されました。`);
                } else {
                    if (returnCastles.length > 0) {
                        const target = returnCastles[Math.floor(Math.random() * returnCastles.length)];
                        p.clan = oldClanId; p.castleId = target.id; target.samuraiIds.push(p.id);
                        this.game.updateCastleLord(target);
                    } else { 
                        // ★新しいお引越しセンターの魔法を使います！
                        this.game.affiliationSystem.becomeRonin(p);
                    }
                    alertMsgs.push(`解放：${p.name} は解放されました。`);
                }
            } else if (newClanId === this.game.playerClanId) {
                // ★プレイヤーの城に寝返った場合、戦争画面ではないので捕虜画面を出さず、逃がしてあげる魔法にします！
                if (returnCastles.length > 0) {
                    const target = returnCastles[Math.floor(Math.random() * returnCastles.length)];
                    p.clan = oldClanId; p.castleId = target.id; target.samuraiIds.push(p.id);
                    this.game.updateCastleLord(target);
                } else {
                    // ★逃げる城がなければ浪人にします
                    this.game.affiliationSystem.becomeRonin(p);
                }
                alertMsgs.push(`${p.name} は元の主君のもとへ逃げ去りました。`);
            } else {
                if (Math.random() < 0.3) { p.status = 'dead'; p.clan = 0; }
                else if (returnCastles.length > 0) {
                    const target = returnCastles[Math.floor(Math.random() * returnCastles.length)];
                    p.clan = oldClanId; p.castleId = target.id; target.samuraiIds.push(p.id);
                    this.game.updateCastleLord(target);
                } else {
                    // ★AIの場合も、逃げる城がなければ浪人になるように安全対策を入れます！
                    this.game.affiliationSystem.becomeRonin(p);
                }
            }
        });
        return alertMsgs;
    }
    
    /**
     * 大名家の総戦力を計算する道具
     */
    calcClanPower(clanId) {
        let pop = 0, sol = 0, koku = 0, gold = 0, rice = 0;
        const clanCastles = this.game.castles.filter(c => c.ownerClan === clanId);
        clanCastles.forEach(c => { 
            pop += c.population; sol += c.soldiers; koku += c.kokudaka; gold += c.gold; rice += c.rice; 
        });
        return Math.floor(pop / 2000) + Math.floor(sol / 20) + Math.floor(koku / 20) + Math.floor(gold / 50) + Math.floor(rice / 100);
    }

    /**
     * 城単体の戦力を計算する道具
     */
    calcCastlePower(castle) {
        return Math.floor(castle.population / 2000) + Math.floor(castle.soldiers / 20) + Math.floor(castle.kokudaka / 20) + Math.floor(castle.gold / 50) + Math.floor(castle.rice / 100);
    }
    
    // =========================================================================
    // ★ここから追加：お家乗っ取りの作戦会議と、裏での決戦を行う魔法！
    // =========================================================================

    async planCoupDetatOrRebellion(castle, castellan, oldDaimyo) {
        // 1. まずは反乱のリーダー（神輿）を探します。
        let rebellionLeader = castellan;
        const oldClanId = castle.ownerClan;
        
        if (castellan.factionId !== 0 && !castellan.isFactionLeader) {
            const factionLeader = this.game.bushos.find(b => b.clan === oldClanId && b.factionId === castellan.factionId && b.isFactionLeader && !b.belongKunishuId);
            if (factionLeader) {
                const { joinScore, stayScore } = this.calculateLoyaltyScores(factionLeader, castellan, oldDaimyo);
                if (joinScore > stayScore) {
                    rebellionLeader = factionLeader;
                }
            }
        }

        // 2. 勢力内の全員（諸勢力以外）を呼び出して、どっちの味方か振り分けます。
        const allMembers = this.game.bushos.filter(b => b.clan === oldClanId && b.status === 'active' && !b.belongKunishuId);
        const totalMembers = allMembers.length;

        let rebelMembers = [];
        let daimyoMembers = [];

        // 全員が必ずどちらかに属するように、スコアの条件を少しずつ甘くしていくループです
        let thresholdOffset = 0;
        let allAssigned = false;

        while (!allAssigned && thresholdOffset < 100) {
            rebelMembers = [];
            daimyoMembers = [];

            for (const b of allMembers) {
                // 本人たちは確定で自分の陣営へ
                if (b.id === rebellionLeader.id) {
                    rebelMembers.push(b);
                    continue;
                }
                if (b.id === oldDaimyo.id) {
                    daimyoMembers.push(b);
                    continue;
                }

                // すでに派閥に属している場合
                if (b.factionId !== 0) {
                    // リーダーと同じ派閥なら反乱軍、それ以外はすべて主家（大名）軍
                    if (b.factionId === rebellionLeader.factionId) {
                        rebelMembers.push(b);
                    } else {
                        daimyoMembers.push(b);
                    }
                } else {
                    // 無所属の場合は、スコアで判定します（offset分だけ条件を緩和します）
                    const { joinScore, stayScore } = this.calculateLoyaltyScores(b, rebellionLeader, oldDaimyo);
                    if (joinScore + thresholdOffset > stayScore) {
                        rebelMembers.push(b);
                    } else {
                        daimyoMembers.push(b);
                    }
                }
            }

            if (rebelMembers.length + daimyoMembers.length === totalMembers) {
                allAssigned = true;
            } else {
                thresholdOffset += 5; // まだ迷っている人がいたら、条件を甘くして再計算
            }
        }

        // 3. 反乱軍が全体の「3分の2」以上いるかチェック！
        if (rebelMembers.length >= totalMembers * (2 / 3)) {
            this.game.ui.log(`【お家乗っ取り】${rebellionLeader.name}派の勢力が拡大し、クーデターが発生しました！`);
            await this.game.ui.showDialogAsync(`【お家乗っ取り】\n当家において${rebellionLeader.name}派が多数を占めました！\nこれより、主家と反乱軍による決戦を行います！`);

            // 裏で野戦を行います！
            const result = await this.executeSecretFieldWar(daimyoMembers, rebelMembers, oldDaimyo, rebellionLeader);

            if (result === 'rebel_win') {
                // 【反乱軍の勝利】
                await this.game.ui.showDialogAsync(`【お家乗っ取り 成功】\n反乱軍が勝利しました！\n${oldDaimyo.name}は討ち死にし、${rebellionLeader.name}が新たな大名となります！`);
                this.game.ui.log(`反乱軍が勝利し、${oldDaimyo.name}は討ち死にしました。`);

                // 大名死亡処理（life_systemにお任せします）
                await this.game.lifeSystem.executeDeath(oldDaimyo);

                // 反乱リーダーを新たな大名に
                rebellionLeader.isDaimyo = true;
                
                // 勢力名を変更
                const clan = this.game.clans.find(c => c.id === oldClanId);
                if (clan) {
                    const familyName = rebellionLeader.familyName || rebellionLeader.name.split('|')[0] || rebellionLeader.name;
                    clan.name = `${familyName}家`;
                    clan.leaderId = rebellionLeader.id;
                }
                // 勢力情報が変わったので威信を更新
                if (window.GameApp) window.GameApp.updateAllClanPrestige();

            } else if (result === 'daimyo_win') {
                // 【主家軍の勝利】
                await this.game.ui.showDialogAsync(`【お家乗っ取り 失敗】\n主家軍が勝利し、反乱を鎮圧しました！\n主家軍の武将に功績が与えられます。`);
                this.game.ui.log(`主家軍が勝利し、反乱は鎮圧されました。反乱分子は独立を強行します。`);

                // 主家軍に功績+3000
                daimyoMembers.forEach(b => {
                    b.achievementTotal = (b.achievementTotal || 0) + 3000;
                });
                
                // 功績が変わったので派閥を再計算
                this.game.factionSystem.updateFactions();

                // その後、敗れた反乱分子たちは通常の独立処理へ移行
                await this.executeRebellion(castle, castellan, oldDaimyo);

            } else {
                // 【引き分け】
                await this.game.ui.showDialogAsync(`【お家乗っ取り 失敗】\n決着がつかず、反乱軍は城を占拠して独立を宣言しました！`);
                this.game.ui.log(`お家乗っ取りは引き分けに終わりました。反乱軍は全員追従して独立します。`);

                // 全員を強制的に追従させるため、一時的に派閥IDを反乱リーダーと同じにします
                const dummyFactionId = rebellionLeader.factionId || 999;
                rebellionLeader.factionId = dummyFactionId;
                rebellionLeader.isFactionLeader = true;
                rebelMembers.forEach(b => {
                    b.factionId = dummyFactionId;
                });

                // 通常の独立処理へ
                await this.executeRebellion(castle, castellan, oldDaimyo);
            }

        } else {
            // 3分の2未満なら、最初から普通の独立として処理します
            await this.executeRebellion(castle, castellan, oldDaimyo);
        }
    }

    async executeSecretFieldWar(daimyoMembers, rebelMembers, oldDaimyo, rebellionLeader) {
        // それぞれ強い順（統率＋武勇）に5人選びます
        const sortByStr = (a, b) => (b.leadership + b.strength) - (a.leadership + a.strength);
        const daimyoTeamBushos = [...daimyoMembers].sort(sortByStr).slice(0, 5);
        const rebelTeamBushos = [...rebelMembers].sort(sortByStr).slice(0, 5);

        // 大名と反乱リーダーは確実に入れます
        if (!daimyoTeamBushos.includes(oldDaimyo)) daimyoTeamBushos[0] = oldDaimyo;
        if (!rebelTeamBushos.includes(rebellionLeader)) rebelTeamBushos[0] = rebellionLeader;

        // 兵士を全体の人数比で分けます（合計10000人）
        const totalBushos = daimyoMembers.length + rebelMembers.length;
        const daimyoSoldiersTotal = Math.floor(10000 * (daimyoMembers.length / totalBushos));
        const rebelSoldiersTotal = 10000 - daimyoSoldiersTotal;

        // 簡易的な部隊データを作成する道具です
        const createTeam = (bushos, totalSoldiers, morale, training) => {
            const team = [];
            const perUnit = Math.floor(totalSoldiers / bushos.length);
            bushos.forEach(b => {
                team.push({ busho: b, soldiers: perUnit, morale: morale, training: training });
            });
            return team;
        };

        const daimyoTeam = createTeam(daimyoTeamBushos, daimyoSoldiersTotal, 50, 50);
        const rebelTeam = createTeam(rebelTeamBushos, rebelSoldiersTotal, 100, 100);

        // 裏で30ターン殴り合います（兵糧はお互い15000あるという設定で、ここでは省略）
        let turn = 0;
        while (turn < 30) {
            const aliveDaimyo = daimyoTeam.filter(u => u.soldiers > 0);
            const aliveRebel = rebelTeam.filter(u => u.soldiers > 0);

            // どちらかが全滅したら終了
            if (aliveDaimyo.length === 0) return 'rebel_win';
            if (aliveRebel.length === 0) return 'daimyo_win';

            // ランダムに1対1で殴り合います
            const atkUnit = aliveDaimyo[Math.floor(Math.random() * aliveDaimyo.length)];
            const defUnit = aliveRebel[Math.floor(Math.random() * aliveRebel.length)];

            // ダメージ計算（NPC戦と同じく0.333倍の補正をかけます）
            const calcDamage = (atkU, defU) => {
                let atkS = Math.max(0, atkU.soldiers);
                let defS = Math.max(0, defU.soldiers);
                let atkBase = Math.sqrt(atkS) + (atkU.busho.leadership * 1.5 + atkU.busho.strength) * (atkS / (atkS + 150));
                let defBase = Math.sqrt(defS) + (defU.busho.leadership * 1.5 + defU.busho.intelligence) * (defS / (defS + 150));

                let atkFinal = atkBase * (1 + (atkU.morale * 1.5 + atkU.training) / 1000);
                let defFinal = defBase * (1 + (defU.morale + defU.training * 1.5) / 1000);

                let dmgRatio = (atkFinal + defFinal) > 0 ? (atkFinal / (atkFinal + defFinal)) : 0;
                return Math.floor(atkFinal * dmgRatio * 0.333); 
            };

            // 主家軍の攻撃
            defUnit.soldiers -= calcDamage(atkUnit, defUnit);

            // 反乱軍の反撃（生きていれば）
            if (defUnit.soldiers > 0) {
                atkUnit.soldiers -= calcDamage(defUnit, atkUnit);
            }

            turn++;
        }

        // 30ターンで決着がつかなければ引き分け
        return 'draw';
    }

    // =========================================================================
    // ★ここまで追加
    // =========================================================================
}