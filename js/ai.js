/**
 * ai.js - 敵思考エンジン
 * 責務: 敵大名のターン処理、内政、外交、軍事判断
 * 依存: WarSystem (war.js) の計算ロジックを使用して、parameter.csvの変更を反映させる
 * 修正: 新外交システム対応（感情値による攻撃優先、支配・従属国への攻撃禁止）
 * 修正: ゲーム開始から3ターン未満は攻撃をスキップする制限を追加
 * 修正: 攻撃判定ロジックの全面改修
 */

window.AIParams = {
    AI: {
        Difficulty: 'normal',
        AbilityBase: 50, AbilitySensitivity: 3.0,
        GunshiBiasFactor: 0.5, GunshiFairnessFactor: 0.01,
        DiplomacyChance: 0.3, 
        GoodwillThreshold: 69, 
        AllianceThreshold: 70, 
        BreakAllianceDutyFactor: 0.5
    }
};

class AIEngine {
    constructor(game) {
        this.game = game;
    }

    // ★追加：大名の威信（daimyoPrestige）を取り出す魔法です！
    getClanPrestige(clanId) {
        if (clanId === 0) return 0;
        const clan = this.game.clans.find(c => c.id === clanId);
        return clan ? Math.max(1, clan.daimyoPrestige) : 1;
    }

    getDifficultyMods() {
        const diff = window.AIParams.AI.Difficulty || 'normal';
        switch(diff) {
            case 'hard': return { accuracy: 1.0, aggression: 1.2, resourceSave: 0.2 }; 
            case 'easy': return { accuracy: 0.6, aggression: 0.7, resourceSave: 0.6 }; 
            default:     return { accuracy: 0.85, aggression: 1.0, resourceSave: 0.4 }; 
        }
    }

    getAISmartness(attributeVal) {
        const mods = this.getDifficultyMods();
        const base = window.AIParams.AI.AbilityBase || 50;
        const sensitivity = window.AIParams.AI.AbilitySensitivity || 2.0;
        let prob = 0.5 + ((attributeVal - base) * sensitivity * 0.01);
        prob = Math.max(0.1, Math.min(0.95, prob));
        if (mods.accuracy > 0.9) prob += 0.1;
        if (mods.accuracy < 0.7) prob -= 0.1;
        return Math.max(0.05, Math.min(1.0, prob));
    }

    execAI(castle) {
        try {
            // ★AIが考え始める前に、すべての大名の威信を最新にします！
            this.game.updateAllClanPrestige();
            // ★自分の城で、かつ「委任されていない（直轄）」の時だけプレイヤーに操作を戻します
            if (Number(castle.ownerClan) === Number(this.game.playerClanId) && !castle.isDelegated) {
                console.warn("AI Alert: Player castle detected in AI routine. Returning control to player.");
                this.game.isProcessingAI = false;
                this.game.ui.showControlPanel(castle);
                return;
            }

            const castellan = this.game.getBusho(castle.castellanId);
            if (!castellan || castellan.isActionDone) { 
                this.game.finishTurn(); 
                return; 
            }
            
            // ★大名のお引越し（特殊な移動処理）の魔法！
            // 自分がお殿様（大名）で、性格が「好戦的（aggressive）」ではない場合だけ発動します
            if (castellan.isDaimyo && castellan.personality !== 'aggressive') {
                // 道が繋がっている自分の城をぜんぶ探します
                const myClanCastles = this.game.castles.filter(c => 
                    c.ownerClan === castle.ownerClan && 
                    GameSystem.isReachable(this.game, castle, c, castle.ownerClan)
                );
                
                // もし城が2つ以上あるなら、引っ越しを考えます
                if (myClanCastles.length > 1) {
                    // 城壁（maxDefense）が高い順番に並べ替えて、一番固い城を見つけます！
                    myClanCastles.sort((a, b) => b.maxDefense - a.maxDefense);
                    const bestCastle = myClanCastles[0];
                    
                    // 今いる城が「一番固い城」じゃなかったら、そこへ引っ越します！
                    if (bestCastle.id !== castle.id) {
                        // まず、今いる城と引っ越し先の城の荷物を全部「合体」させます
                        const totalGold = castle.gold + bestCastle.gold;
                        const totalRice = castle.rice + bestCastle.rice;
                        const totalSoldiers = castle.soldiers + bestCastle.soldiers;
                        const totalHorses = (castle.horses || 0) + (bestCastle.horses || 0);
                        const totalGuns = (castle.guns || 0) + (bestCastle.guns || 0);

                        // 訓練度と士気も、兵士の数に合わせて平均を計算します
                        const avgTraining = Math.floor(((castle.training * castle.soldiers) + (bestCastle.training * bestCastle.soldiers)) / Math.max(1, totalSoldiers));
                        const avgMorale = Math.floor(((castle.morale * castle.soldiers) + (bestCastle.morale * bestCastle.soldiers)) / Math.max(1, totalSoldiers));

                        // 合体させた荷物の「6割」を引っ越し先に、残り「4割」を今いる城に分けます
                        bestCastle.gold = Math.min(99999, Math.ceil(totalGold * 0.6));
                        castle.gold = totalGold - bestCastle.gold;
                        
                        bestCastle.rice = Math.min(99999, Math.ceil(totalRice * 0.6));
                        castle.rice = totalRice - bestCastle.rice;
                        
                        bestCastle.soldiers = Math.min(99999, Math.ceil(totalSoldiers * 0.6));
                        castle.soldiers = totalSoldiers - bestCastle.soldiers;
                        
                        bestCastle.horses = Math.min(99999, Math.ceil(totalHorses * 0.6));
                        castle.horses = totalHorses - bestCastle.horses;
                        
                        bestCastle.guns = Math.min(99999, Math.ceil(totalGuns * 0.6));
                        castle.guns = totalGuns - bestCastle.guns;

                        castle.training = avgTraining;
                        bestCastle.training = avgTraining;
                        castle.morale = avgMorale;
                        bestCastle.morale = avgMorale;

                        // 荷物を運んだら、最後にお殿様（大名）自身が引っ越します！
                        if (this.game.factionSystem && this.game.factionSystem.handleMove) {
                            this.game.factionSystem.handleMove(castellan, castle.id, bestCastle.id);
                        }
                        
                        // ★新しいお引越しセンターの魔法を使います！
                        this.game.affiliationSystem.moveCastle(castellan, bestCastle.id);
                        
                        castellan.isActionDone = true;
                        
                        // お引越しをしたので、このお城のターンはおしまいです！
                        this.game.finishTurn();
                        return;
                    }
                }
            }
            
            // ★大名の軍師任命の魔法！
            // 自分がお殿様（大名）で、プレイヤーの大名家ではない時だけ発動します
            if (castellan.isDaimyo && Number(castle.ownerClan) !== Number(this.game.playerClanId)) {
                // お家に軍師がいるかチェックします
                const currentGunshi = this.game.getClanGunshi(castle.ownerClan);
                if (!currentGunshi) {
                    // 大名と同じ派閥の人を探すための準備です
                    const daimyoFactionId = castellan.factionId;
                    
                    // 同じ大名家で、活動中の武将を全員集めます
                    const myClanBushos = this.game.bushos.filter(b => b.clan === castle.ownerClan && b.status === 'active');
                    
                    // 候補者を絞り込みます（大名じゃない、城主じゃない、大名と同じ派閥）
                    let candidates = myClanBushos.filter(b => 
                        !b.isDaimyo && 
                        !b.isCastellan && 
                        b.factionId === daimyoFactionId
                    );

                    if (candidates.length > 0) {
                        // 候補者たちを、あや瀨さんの条件に合わせて順番に並べ替えます！
                        candidates.sort((a, b) => {
                            // 1. 智謀が高い順
                            if (b.intelligence !== a.intelligence) {
                                return b.intelligence - a.intelligence; // 智謀の引き算で比べます
                            }
                            // 2. 相性の差が小さい順
                            const aDiff = GameSystem.calcAffinityDiff(a.affinity, castellan.affinity);
                            const bDiff = GameSystem.calcAffinityDiff(b.affinity, castellan.affinity);
                            if (aDiff !== bDiff) {
                                return aDiff - bDiff; // 相性差の引き算で比べます
                            }
                            // 3. 貢献度が高い順
                            const aAchieve = a.achievementTotal || 0;
                            const bAchieve = b.achievementTotal || 0;
                            if (bAchieve !== aAchieve) {
                                return bAchieve - aAchieve; // 貢献度の引き算で比べます
                            }
                            // 4. どれも同じならランダム！
                            return Math.random() - 0.5;
                        });

                        // 厳しい審査を勝ち抜いた一番上の人を、新しい軍師に任命します！
                        const newGunshi = candidates[0];
                        newGunshi.isGunshi = true;
                    }
                }
            }

            const mods = this.getDifficultyMods();
            const smartness = this.getAISmartness(castellan.intelligence);

            // 外交フェーズ (確率で実行)
            // ★書き換え！：プレイヤーの城（委任中）の場合は、勝手に外交させないようにします
            if (Number(castle.ownerClan) !== Number(this.game.playerClanId)) {
                const diplomacyChance = ((window.AIParams.AI.DiplomacyChance || 0.3) / 3) * (mods.aggression); 
                if (Math.random() < diplomacyChance) {
                    const dipResult = this.execAIDiplomacy(castle, castellan, smartness); 
                    if (dipResult === 'waiting') return; // ★ プレイヤーのお返事待ちならここで一旦ストップ！
                    if (castellan.isActionDone) { this.game.finishTurn(); return; }
                }
            }
            
            // 軍事フェーズ
            // プレイヤーの城で「城攻 不可」の場合は、攻撃をスキップします
            let skipAttack = false;
            if (Number(castle.ownerClan) === Number(this.game.playerClanId) && castle.isDelegated && !castle.allowAttack) {
                skipAttack = true; // ストップの目印をつけます
            }

            // ★修正：「年」の差だけでなく、「月」の差も足し算して正確なターン数を数えます！
            const startMonth = window.MainParams.StartMonth || 1; // 開始月（わからなければ1月とします）
            const elapsedTurns = ((this.game.year - window.MainParams.StartYear) * 12) + (this.game.month - startMonth);
            
            // ★ここも書き換え！ ストップの目印（skipAttack）がついていない時だけ攻撃します
            if (elapsedTurns >= 3 && !skipAttack) {
                // ★追加：自分が従属している「親大名」を探します
                const myClanId = castle.ownerClan;
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

                const neighbors = this.game.castles.filter(c => 
                    // ★ c.ownerClan !== 0 && （空き城も対象にしました！）
                    c.ownerClan !== myClanId && 
                    GameSystem.isReachable(this.game, castle, c, myClanId)
                );
                
                const validEnemies = neighbors.filter(target => {
                    // ★追加：空き城（0）の時は、同盟などの関係がないのでそのまま攻撃対象にします！
                    if (target.ownerClan === 0) {
                        if ((target.immunityUntil || 0) >= this.game.getCurrentTurnId()) return false;
                        return true;
                    }
                    
                    const rel = this.game.getRelation(myClanId, target.ownerClan);
                    // ★修正：外交専用の魔法を使います！
                    const isProtected = rel && this.game.diplomacyManager.isNonAggression(rel.status);
                    if (isProtected || (target.immunityUntil || 0) >= this.game.getCurrentTurnId()) return false;

                    // ★追加：親大名がいる場合、親の「同盟国」や「他の従属国（親が支配している国）」は攻撃できない
                    if (myBossId !== 0) {
                        const bossRel = this.game.getRelation(myBossId, target.ownerClan);
                        // ★修正：親大名の方も魔法を使います！
                        if (bossRel && this.game.diplomacyManager.isNonAggression(bossRel.status)) {
                            return false;
                        }
                    }

                    return true;
                });

                if (validEnemies.length > 0) {
                    const decision = this.decideAttackTarget(castle, castellan, validEnemies);
                    if (decision) {
                        if (decision.action === 'attack') {
                            // ★追加：40%の確率で「やっぱりや〜めた！」を発動する魔法
                            if (Math.random() < 0.40) {
                                // まず、自分の大名（殿様）を探します
                                const daimyo = this.game.bushos.find(b => b.clan === castle.ownerClan && b.isDaimyo) || castellan;
                                // 城主と大名の「innovation（新しいもの好き度）」を足します（0〜200になります）
                                const totalInno = castellan.innovation + daimyo.innovation;
                                // 少しだけ気分屋にするために、ランダムで -20 から +20 の揺らぎ（サイコロ）を足します
                                const randomInno = totalInno + (Math.random() * 40 - 20);
                                // お城の貯金箱から、きっちり半分の金額を取り出します（端数は切り捨て！）
                                const useGold = Math.floor(castle.gold / 2);
                                
                                // 数字が100以上なら鉄砲、100未満なら騎馬を買うことにします！
                                if (randomInno >= 100) {
                                    const priceGun = parseInt(window.MainParams.Economy.PriceGun, 10) || 50;
                                    const buyAmount = Math.floor(useGold / priceGun); 
                                    const actualCost = buyAmount * priceGun; 
                                    if (buyAmount > 0) {
                                        castle.gold -= actualCost; 
                                        castle.guns = Math.min(99999, (castle.guns || 0) + buyAmount); 
                                        castellan.isActionDone = true; 
                                    }
                                } else {
                                    const priceHorse = parseInt(window.MainParams.Economy.PriceHorse, 10) || 5;
                                    const buyAmount = Math.floor(useGold / priceHorse); 
                                    const actualCost = buyAmount * priceHorse; 
                                    if (buyAmount > 0) {
                                        castle.gold -= actualCost; 
                                        castle.horses = Math.min(99999, (castle.horses || 0) + buyAmount); 
                                        castellan.isActionDone = true; 
                                    }
                                }
                            } else {
                                // 残りの60%は、予定通り攻撃に出発します！
                                this.executeAttack(castle, decision.target, castellan, decision.sendSoldiers, decision.sendRice);
                                return; 
                            }
                        }
                    }
                }
            }
            
            // 内政フェーズ (軍事行動をしなかった場合)
            this.execInternalAffairs(castle, castellan, mods, smartness);
            this.game.finishTurn();

        } catch(e) {
            console.error("AI Logic Error:", e);
            this.game.finishTurn();
        }
    }

    decideAttackTarget(myCastle, myGeneral, enemies) {
        // 城主の性格による出陣兵士数の割合決定
        let sendRate = 0.6; // normal (バランス)
        if (myGeneral.personality === 'aggressive') sendRate = 0.8;
        if (myGeneral.personality === 'conservative') sendRate = 0.4;
        
        const sendSoldiers = Math.floor(myCastle.soldiers * sendRate);
        
        // ★ここを書き足します：出陣する兵士が0人以下の時は、攻撃を諦めます！
        if (sendSoldiers <= 0) return null;
        
        // 兵糧のチェック (連れて行く兵士数の1.5倍)
        const requiredRice = Math.floor(sendSoldiers * 1.5);
        if (myCastle.rice < requiredRice) return null;

        // --- 修正後：正確な見積もりと戦闘力比の計算 ---

        const myDaimyo = this.game.bushos.find(b => b.clan === myCastle.ownerClan && b.isDaimyo) || { personality: 'normal' };

        // =========================================================================
        // ★新規追加：周囲の敵対大名をすべて調べて、それぞれの警戒度を計算します！
        const myClanId = myCastle.ownerClan;
        const myClanCastles = this.game.castles.filter(c => c.ownerClan === myClanId);
        const myTotalPower = this.getClanPrestige(myClanId);
        
        // ★見積もりをする人（評価者）の智謀を決めます
        // プレイヤーの委任城なら「城主（myGeneral）」、敵AIなら「大名（myDaimyo）」の智謀を使います
        let evaluatorInt = 50;
        if (myClanId === this.game.playerClanId) {
            evaluatorInt = myGeneral.intelligence;
        } else {
            evaluatorInt = myDaimyo.intelligence || 50;
        }
        
        // 自領のどこかと隣接している大名家をリストアップします
        const adjacentClans = new Set();
        myClanCastles.forEach(myC => {
            this.game.castles.forEach(c => {
                if (c.ownerClan !== 0 && c.ownerClan !== myClanId && GameSystem.isAdjacent(myC, c)) {
                    adjacentClans.add(c.ownerClan);
                }
            });
        });
        
        // 警戒すべき敵対大名を複数リストアップします！
        const adjacentEnemyClans = [];
        adjacentClans.forEach(clanId => {
            const rel = this.game.getRelation(myClanId, clanId);
            // ★修正：外交専用の魔法を使います！
            const isProtected = rel && this.game.diplomacyManager.isNonAggression(rel.status);
            
            // 同盟などの保護関係になければ警戒対象！
            if (!isProtected) {
                const trueEnemyPower = this.getClanPrestige(clanId);
                
                // ★智謀によって敵の威信を見誤る魔法（智謀95以上ならほぼ正確！）
                const errorRange = Math.min(0.3, Math.max(0, (100 - evaluatorInt) / 100 * 0.3));
                const errorRate = 1.0 + (Math.random() - 0.5) * 2 * errorRange;
                const perceivedEnemyPower = trueEnemyPower * errorRate;
                
                // 見積もった威信で倍率を計算します
                const powerRatio = perceivedEnemyPower / myTotalPower;
                let penalty = 0;
                // 0.8倍から警戒しはじめ、2.5倍で警戒心マックスになります
                if (powerRatio >= 1.0) {
                    let cautionLevel = (powerRatio - 0.5) / (2.5 - 0.8);
                    cautionLevel = Math.min(1.0, Math.max(0.0, cautionLevel));
                    penalty = cautionLevel * 25; 
                }
                if (penalty > 0) {
                    // ★powerには「見誤った威信」を入れておき、後で一番脅威に感じた敵を選べるようにします
                    adjacentEnemyClans.push({ clanId: clanId, penalty: penalty, power: perceivedEnemyPower });
                }
            }
        });
        // =========================================================================

        let bestTarget = null;
        let highestProb = -1;

        enemies.forEach(target => {
            if (target.isKunishuTarget) {
                // ★諸勢力に対する攻撃確率の計算
                const kunishu = target.kunishu;
                // ★修正：諸勢力は兵力が少ないため、計算上は「2倍」にして大名家の城と同じ難易度として評価します！
                const enemyForce = (kunishu.soldiers + kunishu.defense) * 2; 
                
                let myReinfPower = 0;
                // 自軍からの援軍を見積もる
                this.game.castles.forEach(c => {
                    if (c.ownerClan === myCastle.ownerClan && c.id !== myCastle.id && c.soldiers >= 1000) {
                        const errorRange = Math.min(0.3, Math.max(0, (100 - myGeneral.intelligence) / 100 * 0.3));
                        const errorRate = 1.0 + (Math.random() - 0.5) * 2 * errorRange;
                        myReinfPower += (c.soldiers * 0.5) * errorRate;
                    }
                });

                const myForce = myCastle.soldiers + myReinfPower;
                const forceRatio = myForce / Math.max(1, enemyForce);
                
                let prob = 0;
                if (forceRatio < 1.0) { // ★見かけの兵力を2倍にした上で、互角以上でないと攻めません
                    prob = -999;
                } else if (forceRatio >= 3.0) {
                    prob = 40 + (forceRatio - 3.0) * 5;
                } else if (forceRatio >= 2.0) {
                    prob = 30 + (forceRatio - 2.0) * 10; 
                } else {
                    prob = 10 + (forceRatio - 1.0) * 20;
                }

                // 友好度による補正 (友好度が低いほど攻撃したくなる)
                const relVal = kunishu.getRelation(myCastle.ownerClan);
                prob += (30 - relVal); // 最大+30

                // 性格補正
                const getPersonalityBonus = (p) => {
                    if (p === 'aggressive') return 5;
                    if (p === 'conservative') return -5;
                    return 0;
                };
                prob += getPersonalityBonus(myDaimyo.personality);
                prob += getPersonalityBonus(myGeneral.personality);

                // 難易度補正
                const diff = window.AIParams.AI.Difficulty || 'normal';
                const diffMulti = diff === 'hard' ? 1.2 : diff === 'easy' ? 0.7 : 1.0;
                prob *= diffMulti;

                // 最大値の適用 (諸勢力相手は敵対大名と同じく最大40)
                prob = Math.min(prob, 40);

                if (prob > 0) prob = prob * 0.07;
                prob = Math.max(0, prob);

                if (prob > highestProb) {
                    highestProb = prob;
                    bestTarget = target;
                }
                return; // ここでこのループのイテレーションを終了
            }

            // ★追加：空き城の時は外交データがないので、仮の「敵対」データを作ってあげます！
            let rel = { status: '敵対', sentiment: 0 };
            if (target.ownerClan !== 0) {
                rel = this.game.getRelation(myCastle.ownerClan, target.ownerClan);
            }
            
            // 知略が低いほど、敵の数を見誤る（誤差が出る）計算
            const int = myGeneral.intelligence;
            const errorRange = Math.min(0.3, Math.max(0, (100 - int) / 100 * 0.3));
            const errorRate = 1.0 + (Math.random() - 0.5) * 2 * errorRange;

            // =========================================================================
            // ★新規追加：自分と相手、それぞれの「呼べそうな援軍の数」を見積もります！
            let myReinfPower = 0;
            let enemyReinfPower = 0;

            // ★ここから追加：① 自分と相手の「別の城からの援軍（自家援軍）」を見積もります！
            this.game.castles.forEach(c => {
                // 自分が呼べそうな自家援軍（出撃元の城以外で、兵力1000以上の城）
                if (c.ownerClan === myCastle.ownerClan && c.id !== myCastle.id && c.soldiers >= 1000) {
                    myReinfPower += (c.soldiers * 0.5) * errorRate; // 兵力の半分くらい来てくれると予想
                }
                // 相手が呼べそうな自家援軍（守る城以外で、兵力1000以上の城）
                if (c.ownerClan === target.ownerClan && c.id !== target.id && c.soldiers >= 1000) {
                    enemyReinfPower += (c.soldiers * 0.5) * errorRate; // 相手の別のお城からの援軍も警戒！
                }
            });
            // ★追加ここまで

            // ② 同盟国からの援軍を見積もる
            this.game.clans.forEach(c => {
                if (c.id === 0 || c.id === myCastle.ownerClan || c.id === target.ownerClan) return;
                
                // その大名から来てくれそうな兵士数を予想します（大体の目安として総兵力の15%くらいと予想）
                const trueClanPower = this.game.getClanTotalSoldiers(c.id) || 0;
                let expectedReinf = (trueClanPower * 0.15) * errorRate; // ここでも智謀で見誤る魔法がかかります！
                
                // 自分が呼べそうか？（同盟等で仲良し＆相手とは仲良くない）
                const myRel = this.game.getRelation(myCastle.ownerClan, c.id);
                const cToTargetRel = this.game.getRelation(c.id, target.ownerClan);
                if (myRel && this.game.diplomacyManager.isNonAggression(myRel.status) && myRel.sentiment >= 50) {
                    // ★修正：魔法を使います！
                    if (!cToTargetRel || !this.game.diplomacyManager.isNonAggression(cToTargetRel.status)) {
                        myReinfPower += expectedReinf;
                    }
                }
                
                // 相手が呼べそうか？（敵と同盟等で仲良し＆自分とは仲良くない）
                const targetRel = this.game.getRelation(target.ownerClan, c.id);
                const cToMyRel = this.game.getRelation(c.id, myCastle.ownerClan);
                if (targetRel && this.game.diplomacyManager.isNonAggression(targetRel.status) && targetRel.sentiment >= 50) {
                    // ★修正：魔法を使います！
                    if (!cToMyRel || !this.game.diplomacyManager.isNonAggression(cToMyRel.status)) {
                        enemyReinfPower += expectedReinf;
                    }
                }
            });
            // =========================================================================

            // 誤差を含めた敵の兵数と防御力
            const pEnemySoldiers = target.soldiers * errorRate;
            const pEnemyDefense = target.defense * errorRate;

            // ★修正：敵の強さに、予想される「敵の援軍」を足します
            const enemyForce = pEnemySoldiers + pEnemyDefense + enemyReinfPower;

            // ★修正：自分の強さに、予想される「味方の援軍」を足して比べます
            const myForce = myCastle.soldiers + myReinfPower;
            const forceRatio = myForce / Math.max(1, enemyForce);
            
            let prob = 0;
            if (forceRatio < 0.8) {
                // ★足切り魔法：自分の総兵力が相手の0.8倍未満なら、絶対に攻撃しない！
                prob = -999;
            } else if (forceRatio >= 3.0) {
                // 相手の3倍以上の総兵力がある時
                prob = 40 + (forceRatio - 3.0) * 5;
            } else if (forceRatio >= 2.0) {
                // 相手の2倍から3倍までの時
                prob = 30 + (forceRatio - 2.0) * 10; 
            } else if (forceRatio >= 1.0) {
                // 相手と互角から2倍までの時
                prob = 10 + (forceRatio - 1.0) * 20;
            } else {
                // 相手の0.8倍から互角までの時
                prob = (forceRatio - 0.8) * 50;
            }
            
            // 守備側武将の能力による攻撃確率低下 (最大10%)
            const enemyBushos = this.game.getCastleBushos(target.id);
            let maxLdr = 0, maxInt = 0;
            if (enemyBushos.length > 0) {
                maxLdr = Math.max(...enemyBushos.map(b => b.leadership));
                maxInt = Math.max(...enemyBushos.map(b => b.intelligence));
            }
            const ldrDrop = maxLdr >= 70 ? Math.min(5, ((maxLdr - 70) / 30) * 5) : 0;
            const intDrop = maxInt >= 70 ? Math.min(5, ((maxInt - 70) / 30) * 5) : 0;
            prob -= (ldrDrop + intDrop);

            // 友好度による補正 (50基準、最低0.1%)
            const sentiment = typeof rel.sentiment !== 'undefined' ? rel.sentiment : 50; 
            prob += (50 - sentiment) * 0.2;

            // 性格による補正関数
            const getPersonalityBonus = (p) => {
                if (p === 'aggressive') return 5;
                if (p === 'conservative') return -5;
                return 0;
            };
            
            // 大名と城主の性格補正を適用
            prob += getPersonalityBonus(myDaimyo.personality);
            prob += getPersonalityBonus(myGeneral.personality);

            // 難易度補正
            const diff = window.AIParams.AI.Difficulty || 'normal';
            const diffMulti = diff === 'hard' ? 1.2 : diff === 'easy' ? 0.7 : 1.0;
            prob *= diffMulti;

            // ★複数警戒：周りの敵からのペナルティをすべて足し算します
            let totalCautionPenalty = 0;
            adjacentEnemyClans.forEach(enemy => {
                // 「いま攻めようとしている相手」以外の敵からのペナルティだけ足します
                if (target.ownerClan !== enemy.clanId) {
                    totalCautionPenalty += enemy.penalty;
                }
            });
            prob -= totalCautionPenalty;
            
            // ★新しく戦線を広げる場合、周辺大名と威信を比較して弱いところを狙う魔法！
            // まだ「敵対」していない相手で、空き城(0)ではない場合だけ発動します
            if (target.ownerClan !== 0 && rel.status !== '敵対') {
                // ターゲットの大名家全体の威信を取得します（さっき智謀で見誤った値を使います）
                const targetData = adjacentEnemyClans.find(e => e.clanId === target.ownerClan);
                const perceivedTargetPower = targetData ? targetData.power : this.getClanPrestige(target.ownerClan);

                // 周り（自分の領地に隣り合っている）の大名たちの「平均威信」を計算します
                let totalPower = 0;
                let count = 0;
                adjacentEnemyClans.forEach(e => {
                    totalPower += e.power;
                    count++;
                });

                if (count > 0) {
                    const avgPower = totalPower / count;
                    const ratio = perceivedTargetPower / avgPower; // 平均と比べてどれくらい強いか？

                    if (ratio < 1.0) {
                        // 平均より弱い場合：狙い目なので確率をアップ！（最大で約 +8%）
                        prob += (1.0 - ratio) * 8; 
                    } else {
                        // 平均より強い場合：手強いので確率をダウン！（最大で約 -20%）
                        // 周りの平均の「2倍」の強さがある大名なら、約-15%も攻撃確率が下がります
                        prob -= (ratio - 1.0) * 15; 
                    }
                }
            }
            // =========================================================================
            // ★さらに追加：同盟国を通って遠くを攻める（飛び地への攻撃）のを控えめにする魔法！
            let isDirectlyAdjacent = false;
            
            // 攻めようとしているお城の「お隣さん（道が繋がっている城）」をチェックします
            if (target.adjacentCastleIds) {
                isDirectlyAdjacent = target.adjacentCastleIds.some(adjId => {
                    const adjCastle = this.game.getCastle(adjId);
                    // ★修正：castle ではなく myCastle に直しました！
                    return adjCastle && adjCastle.ownerClan === myCastle.ownerClan;
                });
            }

            // もし自分のお城と直接くっついていなかったら（同盟国を通る遠征だったら）
            if (!isDirectlyAdjacent) {
                // 攻めたい気持ち（確率）をガクッと減らします！
                // 確率を「半分」にした上で、さらに「10」引くことで、よっぽどの隙がない限り攻めなくなります。
                prob = (prob * 0.5) - 10; 
            }
            // ★さらに追加ここまで！
            // =========================================================================
            
            // 攻撃確率の最大値設定
            const maxProb = rel.status === '敵対' ? 40 : 20;
            
            // 最大値の適用
            prob = Math.min(prob, maxProb);

            // ★最終調整用。すべての引き算が終わった最後に×７％の魔法をかけます！
            if (prob > 0) {
                prob = prob * 0.07;
            }

            // 最小値の適用（マイナスになっていたらゼロにします）
            prob = Math.max(0, prob); 

            // ★大魔法：空き城の時は、攻め込むハードルを3倍（確率を3分の1）にします！
            if (target.ownerClan === 0) {
                prob = prob / 3;
            }

            if (prob > highestProb) {
                highestProb = prob;
                bestTarget = target;
            }
        });

        if (bestTarget && Math.random() * 100 < highestProb) {
            return { action: 'attack', target: bestTarget, sendSoldiers, sendRice: requiredRice };
        }
        
        // 攻撃する相手がいなかったら、おとなしく諦めます
        return null;
    }

    // ★ここを元のスッキリした形に差し替えます！
    executeAttack(source, target, general, sendSoldiers, sendRice) {
        if (sendSoldiers <= 0 || sendRice <= 0) {
            this.game.finishTurn();
            return;
        }
        
        // 城にいる武将（浪人以外）を集めます
        const bushos = this.game.getCastleBushos(source.id).filter(b => b.status !== 'ronin');
        
        // ★ここから追加・書き換え：戦闘力による足切りと、智謀による「見誤り」の魔法！
        // 1. 城主(general)の智謀によって、どれくらい戦闘力を見誤るか（誤差）を決めます
        let evaluatorInt = general.intelligence;
        let maxError = 0;
        if (evaluatorInt <= 50) {
            maxError = 0.2; // 智謀50以下なら最大2割（±20%）見誤る
        } else if (evaluatorInt >= 95) {
            maxError = 0;   // 智謀95以上なら正確（誤差なし）
        } else {
            // 智謀51〜94の間は、グラフの一直線のように少しずつ誤差が減っていきます
            maxError = 0.2 * (95 - evaluatorInt) / 45;
        }

        // 2. 各武将の戦闘力を見積もります
        const evaluatedBushos = bushos.map(b => {
            // 本当の戦闘力 ＝（統率 ＋ 武力 ＋ 智謀）÷ ２
            const truePower = (b.leadership + b.strength + b.intelligence) / 2;
            
            // とりあえず最初は「本当の強さ」をセットしておきます
            let perceivedPower = truePower;
            
            // ★追加：もし自分自身（城主）じゃなかったら、勘違いの計算をします！
            if (b.id !== general.id) {
                // 誤差のサイコロを振ります（1.0を中心に、-maxError から +maxError まで揺れます）
                const errorRate = 1.0 + (Math.random() - 0.5) * 2 * maxError;
                // 城主が「このくらい強いだろう」と思い込んでいる戦闘力
                perceivedPower = truePower * errorRate;
            }
            
            return { busho: b, perceivedPower: perceivedPower };
        });

        // 3. 見積もった戦闘力の中で、一番高い数値を基準（エース）にします
        let maxPower = 0;
        evaluatedBushos.forEach(eb => {
            if (eb.perceivedPower > maxPower) {
                maxPower = eb.perceivedPower;
            }
        });

        // 4. 一番強い武将の「7割以下」の武将はお留守番させます（足切り）
        const threshold = maxPower * 0.7;
        const sorted = evaluatedBushos
            .filter(eb => eb.perceivedPower > threshold) // 7割より大きい人だけ残す
            .sort((a, b) => b.perceivedPower - a.perceivedPower) // 見積もり戦闘力が強い順に並べる
            .slice(0, 5) // 最大5人まで選ぶ（既存の仕組みに合わせます）
            .map(eb => eb.busho); // 魔法の箱から武将データだけを取り出す
        // ★書き換えはここまで！

        // 援軍を探す処理へバトンタッチします
        const sendHorses = source.horses || 0;
        const sendGuns = source.guns || 0;
        this.game.commandSystem.checkReinforcementAndStartWar(source, target.id, sorted, sendSoldiers, sendRice, sendHorses, sendGuns);
        
        // （「待つ魔法」は消しました！あとはwar.jsが最後までやってくれます）
    }

    executeKunishuSubjugateAI(sourceCastle, kunishu, general, sendSoldiers, sendRice) {
        if (sendSoldiers <= 0 || sendRice <= 0) {
            this.game.finishTurn();
            return;
        }
        
        const bushos = this.game.getCastleBushos(sourceCastle.id).filter(b => b.status !== 'ronin');
        
        let evaluatorInt = general.intelligence;
        let maxError = 0;
        if (evaluatorInt <= 50) {
            maxError = 0.2;
        } else if (evaluatorInt >= 95) {
            maxError = 0;
        } else {
            maxError = 0.2 * (95 - evaluatorInt) / 45;
        }

        const evaluatedBushos = bushos.map(b => {
            const truePower = (b.leadership + b.strength + b.intelligence) / 2;
            let perceivedPower = truePower;
            if (b.id !== general.id) {
                const errorRate = 1.0 + (Math.random() - 0.5) * 2 * maxError;
                perceivedPower = truePower * errorRate;
            }
            return { busho: b, perceivedPower: perceivedPower };
        });

        let maxPower = 0;
        evaluatedBushos.forEach(eb => {
            if (eb.perceivedPower > maxPower) {
                maxPower = eb.perceivedPower;
            }
        });

        const threshold = maxPower * 0.7;
        const sorted = evaluatedBushos
            .filter(eb => eb.perceivedPower > threshold)
            .sort((a, b) => b.perceivedPower - a.perceivedPower)
            .slice(0, 5)
            .map(eb => eb.busho);

        const sendHorses = sourceCastle.horses || 0;
        const sendGuns = sourceCastle.guns || 0;
        
        // ★ commandSystem の executeKunishuSubjugate を呼び出す
        this.game.commandSystem.executeKunishuSubjugate(sourceCastle, sourceCastle.id, sorted.map(b => b.id), sendSoldiers, sendRice, sendHorses, sendGuns, kunishu);
    }

    execInternalAffairs(castle, castellan, mods, smartness) {
        // ① 大名を取得します（行動回数の計算に使います）
        const daimyo = this.game.bushos.find(b => b.clan === castle.ownerClan && b.isDaimyo) || castellan;

        // ★追加：大名の城と「自領で地続き」で繋がっているかを調べる魔法
        let isConnected = false;
        
        // もし大名がいない、またはこの城がまさに大名のいる城なら、繋がっている扱いにします
        if (!daimyo.castleId || daimyo.castleId === castle.id) {
            isConnected = true;
        } else {
            // 大名のいるお城を探します
            const daimyoCastle = this.game.castles.find(c => c.id === daimyo.castleId);
            if (daimyoCastle) {
                // 自領の城だけをたどって、大名の城から今の城まで行けるか調べます
                const visited = new Set();
                const queue = [daimyoCastle];
                visited.add(daimyoCastle.id);

                while (queue.length > 0) {
                    const currentCastle = queue.shift();
                    
                    // ゴール（今の城）にたどり着いたら、繋がっている証拠！
                    if (currentCastle.id === castle.id) {
                        isConnected = true;
                        break;
                    }
                    
                    // お隣の城を探します（同じ大名家の城だけを通ります）
                    const neighbors = this.game.castles.filter(c => 
                        c.ownerClan === castle.ownerClan && 
                        GameSystem.isAdjacent(currentCastle, c) &&
                        !visited.has(c.id)
                    );
                    
                    for (const n of neighbors) {
                        visited.add(n.id);
                        queue.push(n);
                    }
                }
            }
        }

        // ② 行動回数の計算
        let baseAP = 0;
        if (isConnected) {
            // 大名と地続きの城：「(城主内政＋城主魅力＋大名内政＋大名魅力) ÷ 2」
            baseAP = Math.floor((castellan.politics + castellan.charm + daimyo.politics + daimyo.charm) / 2);
        } else {
            // 飛び地（地続きではない）城：「(城主内政＋城主魅力) ÷ 2」
            baseAP = Math.floor((castellan.politics + castellan.charm) / 2);
        }

        // 最低1回、40ごとに+1回
        let maxActions = 1 + Math.floor(baseAP / 40);

        // お城にいる動ける武将（浪人や諸勢力ではない人）をリストアップします
        let availableBushos = this.game.getCastleBushos(castle.id).filter(b => 
            !b.isActionDone && b.status !== 'ronin' && b.belongKunishuId === 0
        );

        // 武将の人数より多くは行動できません
        maxActions = Math.min(maxActions, availableBushos.length);

        // ★追加：NPCが賢すぎるのを防ぐため、ランダムで「0回」「1回」「2回」のどれかだけ行動回数を減らします
        const reduceActions = Math.floor(Math.random() * 3); // 0, 1, 2のどれかを作る魔法です
        maxActions = Math.max(1, maxActions - reduceActions); // 減らしても、最低1回は必ず行動させます

        if (maxActions <= 0) return;

        // 城主の性格による好みの計算（相対値で最大±20%のブレ）
        const isConservative = castellan.personality === 'conservative';
        const isAggressive = castellan.personality === 'aggressive';

        // お隣の敵のお城を調べておきます（徴兵の判断用）
        const neighbors = this.game.castles.filter(c => 
            c.ownerClan !== 0 && c.ownerClan !== castle.ownerClan && GameSystem.isAdjacent(castle, c)
        );

        // ③ 決められた回数だけ、行動を繰り返します！
        for (let step = 0; step < maxActions; step++) {
            // まだ動ける武将を再確認します
            availableBushos = this.game.getCastleBushos(castle.id).filter(b => 
                !b.isActionDone && b.status !== 'ronin' && b.belongKunishuId === 0
            );

            // --- 候補となる行動の点数（スコア）をつける表を作ります ---
            let actions = [];

            // 1. 城壁修復（最大値の1/4以下なら超優先！）
            if (castle.defense < castle.maxDefense) {
                let score = 0;
                if (castle.defense <= castle.maxDefense / 4) score = 1000; // 緊急事態！
                else score = 20;
                actions.push({ type: 'repair', stat: 'politics', score: score, cost: 200 });
            }

            // 2. 施し（民忠70以下なら優先！）
            if (castle.peoplesLoyalty < 100) {
                let score = 0;
                if (castle.peoplesLoyalty <= 70) score = 500; // 結構優先！
                else score = (100 - castle.peoplesLoyalty) * 2;
                actions.push({ type: 'charity', stat: 'charm', score: score, cost: 200 }); 
            }

            // 3. 徴兵（お隣の敵と比べて、自分が少ないほど焦る、または最低限の備え）
            if (castle.population > 1000 && castle.soldiers < castle.rice / 2) {
                let scoreDraft = 0;
                let mySoldiers = Math.max(1, castle.soldiers);
                let enemyMaxSoldiers = 0;
                neighbors.forEach(n => {
                    if (n.soldiers > enemyMaxSoldiers) enemyMaxSoldiers = n.soldiers;
                });
                
                const keepSoldiers = (castellan.leadership + daimyo.leadership) * 50;

                if (enemyMaxSoldiers > mySoldiers) {
                    scoreDraft = ((enemyMaxSoldiers * 1.5 / mySoldiers) * 20); 
                } else if (castle.soldiers < keepSoldiers) {
                    scoreDraft = 30; 
                }

                if (scoreDraft > 0) {
                    actions.push({ type: 'draft', stat: 'leadership', score: scoreDraft, cost: 500 }); 
                }
            }

            // 4. 訓練
            if (castle.training < 100) {
                let score = (100 - castle.training) * 0.5;
                actions.push({ type: 'training', stat: 'leadership', score: score, cost: 0 }); 
            }

            // 5. 兵施し（士気）
            if (castle.morale < 100) {
                let score = (100 - castle.morale) * 0.5;
                actions.push({ type: 'soldier_charity', stat: 'leadership', score: score, cost: 200 }); 
            }

            // 6. 石高開発
            if (castle.kokudaka < castle.maxKokudaka) {
                actions.push({ type: 'farm', stat: 'politics', score: 30, cost: 200 });
            }

            // 7. 鉱山開発
            if (castle.commerce < castle.maxCommerce) {
                actions.push({ type: 'commerce', stat: 'politics', score: 30, cost: 200 });
            }

            // --- 性格による点数の調整 ---
            actions.forEach(a => {
                if (isConservative && ['farm', 'commerce', 'repair', 'charity'].includes(a.type)) {
                    a.score *= 1.2; 
                }
                if (isAggressive && ['draft', 'training', 'soldier_charity'].includes(a.type)) {
                    a.score *= 1.2; 
                }
                a.score *= (0.9 + Math.random() * 0.2);
            });

            // 8. 兵糧売買（特殊な判断）
            if (castle.gold < 500 && castle.rice > 3000) {
                const targetRice = Math.max(3000, Math.floor(castle.soldiers * 1.5));
                if (castle.rice > targetRice) {
                    actions.push({ type: 'sell_rice', stat: 'politics', score: 800, cost: 0 }); 
                }
            }
            if (castle.rice <= castle.soldiers * 1) {
                actions.push({ type: 'buy_rice', stat: 'politics', score: 800, cost: 0 }); 
            }

            // 9. 輸送（大名のいない城のみ）
            if (!daimyo || daimyo.castleId !== castle.id) {
                // ★修正：プレイヤーと同じように「道が繋がっているか（自領、同盟、支配を通れるか）」を判定します！
                const allyCastles = this.game.castles.filter(c => 
                    c.ownerClan === castle.ownerClan && 
                    c.id !== castle.id &&
                    GameSystem.isReachable(this.game, castle, c, castle.ownerClan)
                );
                
                for (const target of allyCastles) {
                    if ((target.soldiers <= 500 || target.gold <= 500) && castle.soldiers >= 2000 && castle.gold >= 2000) {
                        actions.push({ type: 'transport', stat: 'leadership', score: 400, cost: 0, targetId: target.id, res: 'gold_soldier' });
                        break; 
                    }
                    if (target.rice <= 2000 && castle.rice >= 5000) {
                        actions.push({ type: 'transport', stat: 'leadership', score: 400, cost: 0, targetId: target.id, res: 'rice' });
                        break;
                    }
                }
            }

            // 10. 武将の移動
            const myClanCastles = this.game.castles.filter(c => 
                c.ownerClan === castle.ownerClan && 
                c.id !== castle.id && 
                GameSystem.isReachable(this.game, castle, c, castle.ownerClan)
            );
            
            // ① 従来の空き城への移動
            const emptyCastles = myClanCastles.filter(c => c.samuraiIds.length <= 1);
            if (emptyCastles.length > 0) {
                actions.push({ type: 'move', stat: 'leadership', score: 300, cost: 0, targetId: emptyCastles[0].id });
            }
            
            // ② 派閥に属する武将は、派閥主のいる城やその隣の城に積極的に移動する
            availableBushos.forEach(b => {
                if (b.factionId !== 0 && !b.isFactionLeader && b.id !== castle.castellanId && !b.isDaimyo) {
                    const leader = this.game.bushos.find(lb => lb.isFactionLeader && lb.factionId === b.factionId);
                    if (leader && leader.castleId !== castle.id) {
                        const leaderCastle = this.game.getCastle(leader.castleId);
                        if (leaderCastle && myClanCastles.some(c => c.id === leaderCastle.id)) {
                            // 派閥主の城へ移動
                            actions.push({ type: 'move', stat: 'leadership', score: 350, cost: 0, targetId: leaderCastle.id, specificMover: b });
                        } else if (leaderCastle) {
                            // 派閥主の城に直接行けない場合、隣の城を探す
                            const neighborCastles = myClanCastles.filter(c => GameSystem.isAdjacent(c, leaderCastle));
                            if (neighborCastles.length > 0) {
                                actions.push({ type: 'move', stat: 'leadership', score: 320, cost: 0, targetId: neighborCastles[0].id, specificMover: b });
                            }
                        }
                    }
                }
            });
            if (emptyCastles.length > 0) {
                actions.push({ type: 'move', stat: 'leadership', score: 300, cost: 0, targetId: emptyCastles[0].id });
            }
            
            // ★追加 11. 登用（浪人がいる場合、超低確率）
            const ronins = this.game.getCastleBushos(castle.id).filter(b => b.status === 'ronin');
            if (ronins.length > 0) {
                // 雀の涙ほどの優先度（5点）にしてあります
                actions.push({ type: 'employ', stat: 'charm', score: 5, cost: 0, targetRonin: ronins[0] });
            }

            // ★追加: 領内の諸勢力への親善（友好度30以下の場合）
            const myKunishus = this.game.kunishuSystem.getKunishusInCastle(castle.id).filter(k => k.getRelation(castle.ownerClan) <= 30);
            myKunishus.forEach(k => {
                // 友好度が低いほどスコアが高くなる（攻撃優先度よりは低いが、内政の中では優先されやすいように調整）
                let score = (30 - k.getRelation(castle.ownerClan)) * 10 + 50; 
                actions.push({ type: 'kunishu_goodwill', stat: 'charm', score: score, cost: 300, targetKunishu: k });
            });

            // ★追加 12. 褒美（承認欲求がたまっている、または忠誠度が低い武将がいる場合）
            let rewardTargets = [];
            // ★追加：選ばれた人の中で「一番低い忠誠度」を覚えておく箱です！
            let minLoyaltyForReward = 100;
            
            const castleBushos = this.game.getCastleBushos(castle.id).filter(b => b.status !== 'ronin' && b.belongKunishuId === 0);
            
            for (let b of castleBushos) {
                if ((b.recognitionNeed || 0) < 0) {
                    continue; // マイナスの人は飛ばして、次の人の順番に行きます！
                }
                // ① 承認欲求(recognitionNeed)がたまっている場合
                if ((b.recognitionNeed || 0) > 30) { 
                    rewardTargets.push(b);
                    // 忠誠度の低さをチェックして箱を更新します
                    if (b.loyalty < minLoyaltyForReward) minLoyaltyForReward = b.loyalty;
                    continue; // この人はもうリストに入れたので、次の人へ
                }
                
                // ② 忠誠度が95以下の場合（サイコロを振って対象にする魔法です！）
                if (b.loyalty <= 95) {
                    // ★修正：確率を全体的に上げました！(95で0.5%、70以下で10%)
                    let prob = 10; // 70以下の時は問答無用で10%
                    if (b.loyalty > 70) {
                        prob = 0.5 + ((95 - b.loyalty) / 25) * 9.5; 
                    }
                    
                    // 2. お殿様（大名）の義理(duty)による確率の増減
                    // 義理が51〜100ならアップ、49〜0ならダウンします
                    const dutyMod = (daimyo.duty - 50) * 0.1;
                    
                    // 3. お殿様との相性(affinity)による確率の増減
                    // 差が0(ピッタリ)なら10%アップ、差が50(真逆)なら10%ダウンします
                    const diff = GameSystem.calcAffinityDiff(daimyo.affinity, b.affinity);
                    const affinityMod = (25 - diff) * 0.4; 
                    
                    // 全部を足して最終的な確率を出します
                    let finalProb = prob + dutyMod + affinityMod;
                    
                    // 確率のサイコロを振ります！（100面ダイス）
                    if (Math.random() * 100 < finalProb) {
                        rewardTargets.push(b);
                        if (b.loyalty < minLoyaltyForReward) minLoyaltyForReward = b.loyalty;
                    }
                }
            }

            if (rewardTargets.length > 0 && castle.gold >= 100) {
                // ★修正：一番忠誠度が低い武将に合わせて、優先度スコア（やりたさ）を計算します！
                // 忠誠95なら1点、60以下なら40点になります。
                let rewardScore = 15; // 承認欲求だけで選ばれた時などの基本点です
                if (minLoyaltyForReward <= 60) {
                    rewardScore = 40; // 60以下なら最優先の40点！
                } else if (minLoyaltyForReward <= 95) {
                    // 60〜95の間を、点数がなめらかに変わるように計算する魔法です！
                    rewardScore = 1 + ((95 - minLoyaltyForReward) / 35) * 39;
                }
                
                actions.push({ type: 'reward', stat: 'none', score: rewardScore, cost: 100, targets: rewardTargets });
            }

            // 点数が高い順に並べ替えます
            actions.sort((a, b) => b.score - a.score);

            let actionDoneInThisStep = false;

            // 一番点数が高い行動から順番に「できるかどうか」試していきます
            for (let action of actions) {
                if (action.score < 5) continue; // ★変更：登用の5点も拾えるように、足切りラインを10から5に下げました！

                // ★追加：褒美は「実行する武将（doer）」を必要としない特別な行動です！
                if (action.type === 'reward') {
                    // ★変更：城主を最優先し、次に忠誠度が低い人、最後に承認欲求が高い人を1人選びます
                    action.targets.sort((a, b) => {
                        // ① まずは「このお城の城主かどうか」をチェックして、城主を一番前に並べます
                        const aIsCastellan = (a.id === castle.castellanId) ? 1 : 0;
                        const bIsCastellan = (b.id === castle.castellanId) ? 1 : 0;
                        if (bIsCastellan !== aIsCastellan) {
                            return bIsCastellan - aIsCastellan;
                        }

                        // ② 次に、忠誠度の低さを比べます（忠誠度が低い人が先に来ます）
                        if (a.loyalty !== b.loyalty) {
                            return a.loyalty - b.loyalty;
                        }

                        // ③ 忠誠度も同じなら、最後は承認欲求の大きさを比べます
                        const aAchieve = a.recognitionNeed || 0;
                        const bAchieve = b.recognitionNeed || 0;
                        return bAchieve - aAchieve; 
                    });
                    const targetBusho = action.targets[0];
                    
                    if (castle.gold >= 100) {
                        castle.gold -= 100;
                        // 褒美の効果をプレイヤーと同じように計算（効果は200相当で据え置き）
                        const effect = GameSystem.calcRewardEffect(200, daimyo, targetBusho);
                        if (this.game.factionSystem && this.game.factionSystem.updateRecognition) {
                            this.game.factionSystem.updateRecognition(targetBusho, -effect * 2 - 5);
                        }
                        
                        // ★追加：忠誠度をランダムで1～3アップさせる（プレイヤーと同じ！）
                        const loyaltyUp = Math.floor(Math.random() * 3) + 1;
                        targetBusho.loyalty = Math.min(100, targetBusho.loyalty + loyaltyUp);
                        
                        // ★「行動済」マークもつけません！
                        actionDoneInThisStep = true; 
                        break; 
                    }
                    continue; // もしお金が足りなかったら、この行動は諦めて次を探します
                }

                // --- これより下は、実行する武将（doer）が必要な行動です ---
                if (availableBushos.length === 0) continue; // 動ける武将がいなければパスします

                // その行動に一番向いている武将を探します（能力値40以上が条件）
                const bestBushos = availableBushos.filter(b => b[action.stat] >= 40).sort((a, b) => b[action.stat] - a[action.stat]);
                if (bestBushos.length === 0) continue; // 基準を満たす人がいなければ、この行動は諦めます
                const doer = bestBushos[0];

                // 実行処理
                    const targetRonin = action.targetRonin;
                    const myPower = this.game.getClanTotalSoldiers(castle.ownerClan) || 1;
                    const success = GameSystem.calcEmploymentSuccess(doer, targetRonin, myPower, 0);
                    
                    if (success) {
                        // ★新しいお引越しセンターの魔法を使います！
                        this.game.affiliationSystem.joinClan(targetRonin, castle.ownerClan, castle.id);
                        
                        // ★プレイヤーと同じ！成功したらしっかり功績と承認欲求のご褒美をあげます
                        const maxStat = Math.max(targetRonin.strength, targetRonin.intelligence, targetRonin.leadership, targetRonin.charm, targetRonin.diplomacy);
                        doer.achievementTotal = (doer.achievementTotal || 0) + Math.floor(maxStat * 0.3);
                        if (this.game.factionSystem && this.game.factionSystem.updateRecognition) this.game.factionSystem.updateRecognition(doer, 20);
                    } else {
                        // 失敗しても少しだけ慰めのご褒美をあげます
                        doer.achievementTotal = (doer.achievementTotal || 0) + 5;
                        if (this.game.factionSystem && this.game.factionSystem.updateRecognition) this.game.factionSystem.updateRecognition(doer, 10);
                    }
                    
                    doer.isActionDone = true; 
                    actionDoneInThisStep = true; 
                    break;
                }
                if (action.type === 'repair' && castle.gold >= 200) {
                    castle.gold -= 200;
                    const val = GameSystem.calcRepair(doer);
                    const oldVal = castle.defense;
                    castle.defense = Math.min(castle.maxDefense, castle.defense + val);
                    
                    // ★プレイヤーと同じ！上がった分だけご褒美をあげます
                    const actualVal = castle.defense - oldVal;
                    doer.achievementTotal = (doer.achievementTotal || 0) + Math.floor(actualVal * 0.5);
                    if (this.game.factionSystem && this.game.factionSystem.updateRecognition) this.game.factionSystem.updateRecognition(doer, 10);
                    
                    doer.isActionDone = true; actionDoneInThisStep = true; break;
                }
                if (action.type === 'charity' && castle.rice >= 200) {
                    castle.rice -= 200;
                    
                    // ★ずるっこ禁止！プレイヤーと同じく「6で割る」厳しい計算式に直しました！
                    let val = GameSystem.calcCharity(doer, 'rice');
                    val = Math.floor(val / 6);
                    if (val < 1) val = 1;
                    
                    const oldVal = castle.peoplesLoyalty;
                    castle.peoplesLoyalty = Math.min(100, castle.peoplesLoyalty + val);
                    
                    doer.achievementTotal = (doer.achievementTotal || 0) + Math.floor(val * 0.5);
                    if (this.game.factionSystem && this.game.factionSystem.updateRecognition) this.game.factionSystem.updateRecognition(doer, 15);
                    
                    doer.isActionDone = true; actionDoneInThisStep = true; break;
                }
                if (action.type === 'draft' && castle.gold >= 500 && castle.population > 1000) {
                    // ★追加：お城の貯金箱を見て、使う金額を決める魔法！
                    let draftCost = 500; // 最初は500
                    if (castle.gold >= 5000) {
                        draftCost = 2000; // 5000以上持っていたら2000使う！
                    } else if (castle.gold >= 3000) {
                        draftCost = 1000; // 3000以上持っていたら1000使う！
                    }
                    
                    // ★修正：決めた金額（draftCost）で兵士を集めます！
                    let soldiers = GameSystem.calcDraftFromGold(draftCost, doer, castle.population);
                    soldiers = Math.floor(soldiers / 10);
                    
                    if (castle.soldiers + soldiers > 99999) {
                        soldiers = 99999 - castle.soldiers;
                    }
                    if (soldiers > 0) {
                        // ★修正：決めた金額（draftCost）だけ、お城の貯金箱から減らします！
                        castle.gold -= draftCost; 
                        
                        const newMorale = Math.max(0, castle.morale - 10);
                        const newTraining = Math.max(0, castle.training - 10);
                        castle.training = Math.floor(((castle.training * castle.soldiers) + (newTraining * soldiers)) / (castle.soldiers + soldiers));
                        castle.morale = Math.floor(((castle.morale * castle.soldiers) + (newMorale * soldiers)) / (castle.soldiers + soldiers));
                        castle.soldiers += soldiers;
                        
                        // ★プレイヤーと同じ！徴兵でもご褒美をあげます
                        doer.achievementTotal = (doer.achievementTotal || 0) + 5;
                        if (this.game.factionSystem && this.game.factionSystem.updateRecognition) this.game.factionSystem.updateRecognition(doer, 10);
                        
                        doer.isActionDone = true; 
                        actionDoneInThisStep = true; 
                        break;
                    } else {
                        continue; // 上限で増やせなかったら諦める
                    }
                }
                if (action.type === 'training') {
                    const val = GameSystem.calcTraining(doer);
                    const oldVal = castle.training;
                    castle.training = Math.min(100, castle.training + val);
                    
                    const actualVal = castle.training - oldVal;
                    doer.achievementTotal = (doer.achievementTotal || 0) + Math.floor(actualVal * 0.5);
                    if (this.game.factionSystem && this.game.factionSystem.updateRecognition) this.game.factionSystem.updateRecognition(doer, 10);
                    
                    doer.isActionDone = true; actionDoneInThisStep = true; break;
                }
                if (action.type === 'soldier_charity' && castle.rice >= 200) {
                    castle.rice -= 200;
                    const val = GameSystem.calcSoldierCharity(doer);
                    const oldVal = castle.morale;
                    castle.morale = Math.min(100, castle.morale + val);
                    
                    const actualVal = castle.morale - oldVal;
                    doer.achievementTotal = (doer.achievementTotal || 0) + Math.floor(actualVal * 0.5);
                    if (this.game.factionSystem && this.game.factionSystem.updateRecognition) this.game.factionSystem.updateRecognition(doer, 10);
                    
                    doer.isActionDone = true; actionDoneInThisStep = true; break;
                }
                if (action.type === 'farm' && castle.gold >= 200) {
                    castle.gold -= 200;
                    const val = GameSystem.calcDevelopment(doer);
                    const oldVal = castle.kokudaka;
                    castle.kokudaka = Math.min(castle.maxKokudaka, castle.kokudaka + val);
                    
                    const actualVal = castle.kokudaka - oldVal;
                    doer.achievementTotal = (doer.achievementTotal || 0) + Math.floor(actualVal * 0.5);
                    if (this.game.factionSystem && this.game.factionSystem.updateRecognition) this.game.factionSystem.updateRecognition(doer, 10);
                    
                    doer.isActionDone = true; actionDoneInThisStep = true; break;
                }
                if (action.type === 'commerce' && castle.gold >= 200) {
                    castle.gold -= 200;
                    const val = GameSystem.calcDevelopment(doer);
                    const oldVal = castle.commerce;
                    castle.commerce = Math.min(castle.maxCommerce, castle.commerce + val);
                    
                    const actualVal = castle.commerce - oldVal;
                    doer.achievementTotal = (doer.achievementTotal || 0) + Math.floor(actualVal * 0.5);
                    if (this.game.factionSystem && this.game.factionSystem.updateRecognition) this.game.factionSystem.updateRecognition(doer, 10);
                    
                    doer.isActionDone = true; actionDoneInThisStep = true; break;
                }
                
                // 特殊行動群
                if (action.type === 'sell_rice') {
                    const sellAmount = castle.rice - Math.max(3000, Math.floor(castle.soldiers * 1.5));
                    if (sellAmount > 0) {
                        const gain = Math.floor(sellAmount * this.game.marketRate);
                        // ★プレイヤーと同じ！上限(99,999)を超えないかチェックします
                        if (castle.gold + gain <= 99999) {
                            castle.rice -= sellAmount;
                            castle.gold += gain;
                            doer.isActionDone = true; actionDoneInThisStep = true; break;
                        } else {
                            continue; // 上限を超えるなら売るのをやめます
                        }
                    }
                }
                if (action.type === 'buy_rice') {
                    const buyAmount = Math.floor(castle.soldiers * 1.5) - castle.rice;
                    const cost = Math.floor(buyAmount * this.game.marketRate);
                    if (buyAmount > 0 && castle.gold >= cost + 500) {
                        // ★プレイヤーと同じ！上限(99,999)を超えないかチェックします
                        if (castle.rice + buyAmount <= 99999) {
                            castle.gold -= cost;
                            castle.rice += buyAmount;
                            doer.isActionDone = true; actionDoneInThisStep = true; break;
                        } else {
                            continue; // 上限を超えるなら買うのをやめます
                        }
                    }
                }
                if (action.type === 'transport') {
                    const targetCastle = this.game.getCastle(action.targetId);
                    if (action.res === 'gold_soldier') {
                        // ★プレイヤーと同じ！上限チェックを付けました
                        if (targetCastle.gold + 500 <= 99999 && targetCastle.soldiers + 500 <= 99999) {
                            castle.gold -= 500; castle.soldiers -= 500;
                            
                            // ★プレイヤーと同じ！兵士が移動したことによる訓練と士気の変化も計算します
                            const totalS = targetCastle.soldiers + 500;
                            targetCastle.training = Math.floor(((targetCastle.training * targetCastle.soldiers) + (castle.training * 500)) / totalS);
                            targetCastle.morale = Math.floor(((targetCastle.morale * targetCastle.soldiers) + (castle.morale * 500)) / totalS);
                            
                            targetCastle.gold += 500; targetCastle.soldiers += 500;
                        } else { continue; }
                    } else if (action.res === 'rice') {
                        // ★プレイヤーと同じ！上限チェックを付けました
                        if (targetCastle.rice + 1000 <= 99999) {
                            castle.rice -= 1000;
                            targetCastle.rice += 1000;
                        } else { continue; }
                    }
                    
                    // 【⚠️AI書き換え防止の注意書き⚠️】
                    // AIの輸送コマンドでは、プレイヤーの仕様とは異なり、絶対に武将を移動させてはいけません！
                    // ここに武将の移動処理（handleMoveなど）を追加しないこと。
                    
                    doer.isActionDone = true; actionDoneInThisStep = true; break; 
                }
                if (action.type === 'move') {
                    // ★ここを書き足し！：プレイヤーの城で「武将移動 不可」の場合は、移動を中止して別の行動を探します
                    if (Number(castle.ownerClan) === Number(this.game.playerClanId) && castle.isDelegated && !castle.allowMove) {
                        continue; 
                    }

                    let movers = [];
                    
                    if (action.specificMover) {
                        // 派閥主の元へ合流する武将の場合は、その人だけ移動リストに入れます
                        movers.push(action.specificMover);
                    } else {
                        // 従来の空き城への移動など
                        let moveCandidates = availableBushos.filter(b => b.id !== castle.castellanId);
                        let mainMover = null;
                        const factionLeader = moveCandidates.find(b => b.isFactionLeader);
                        
                        if (factionLeader) {
                            // 派閥主が見つかったら、移動リストのリーダーにします
                            mainMover = factionLeader;
                            movers.push(mainMover);
                            // 派閥主が移動する場合は、大名以外の、その城にいて、派閥に属する武将は全員お供にします
                            const followers = moveCandidates.filter(b => 
                                b.id !== mainMover.id && 
                                b.factionId === mainMover.factionId && 
                                !b.isDaimyo && 
                                !b.isFactionLeader // 別の派閥主は巻き込まない（２人同時の派閥主移動を防ぐ）
                            );
                            movers = movers.concat(followers); // リーダーとお供を合流させます
                        } else {
                            // 派閥主がいなければ、仲の悪い人を探して移動させます
                            for (let b of moveCandidates) {
                                if (GameSystem.calcAffinityDiff(castellan.affinity, b.affinity) >= 20) {
                                    mainMover = b; 
                                    movers.push(mainMover);
                                    break;
                                }
                            }
                        }
                    }

                    if (movers.length > 0) {
                        const targetCastle = this.game.getCastle(action.targetId);
                        
                        // 元の城に最低３人残るかチェックします
                        const sourceCountAfter = castle.samuraiIds.length - movers.length;
                        if (sourceCountAfter < 3) {
                            continue; // ３人未満になるなら、今回の移動は諦めます
                        }

                        // リストに入っている全員を一斉に移動させます
                        movers.forEach(mover => {
                            this.game.factionSystem.handleMove(mover, castle.id, action.targetId);
                            
                            // ★新しいお引越しセンターの魔法を使います！
                            this.game.affiliationSystem.moveCastle(mover, action.targetId);
                            
                            mover.isActionDone = true;
                        });
                        
                        actionDoneInThisStep = true; 
                        break;
                    }
                }
            }
            
            // もし何も実行できる行動がなかったら、もうこのお城の行動は終わりにします
            if (!actionDoneInThisStep) break;
        }
    }
    
    execAIDiplomacy(castle, castellan, smartness) {
        const neighbors = this.game.castles.filter(c => c.ownerClan !== 0 && c.ownerClan !== castle.ownerClan && GameSystem.isReachable(this.game, castle, c, castle.ownerClan));
        if (neighbors.length === 0) return;
        
        const uniqueNeighbors = [...new Set(neighbors.map(c => c.ownerClan))];
        const myClanId = castle.ownerClan;
        const myPower = this.getClanPrestige(myClanId);
        const myDaimyo = this.game.bushos.find(b => b.clan === myClanId && b.isDaimyo) || { duty: 50, intelligence: 50 };

        // ★修正：diplomacy.js のお引越しセンターを使って数えます！
        const allyCount = this.game.diplomacyManager.getAllyCount(myClanId);
        
        // ★追加：仲良しが2つ以上なら、外交する確率を下げる魔法（1つ増えるごとに20%ダウン）
        let sendProbModifier = 1.0;
        if (allyCount >= 2) {
            sendProbModifier = Math.max(0.1, 1.0 - (allyCount - 1) * 0.2); 
        }

        // ★追加：ここで改めて周辺の敵を判断します！（智謀による見誤りがあるためAIに残します）
        let evaluatorInt = 50;
        if (myClanId === this.game.playerClanId) {
            evaluatorInt = castellan.intelligence; 
        } else {
            evaluatorInt = myDaimyo.intelligence || 50; 
        }
        
        const enemyThreats = [];
        uniqueNeighbors.forEach(clanId => {
            const rel = this.game.getRelation(myClanId, clanId);
            // ★修正：外交専用の魔法を使います！
            const isProtected = rel && this.game.diplomacyManager.isNonAggression(rel.status);
            
            if (!isProtected) {
                const trueEnemyPower = this.getClanPrestige(clanId);
                const errorRange = Math.min(0.3, Math.max(0, (100 - evaluatorInt) / 100 * 0.3));
                const errorRate = 1.0 + (Math.random() - 0.5) * 2 * errorRange;
                const perceivedEnemyPower = trueEnemyPower * errorRate;
                
                enemyThreats.push({ clanId: clanId, power: perceivedEnemyPower });
            }
        });

        enemyThreats.sort((a, b) => b.power - a.power);
        const mainThreatId = enemyThreats.length > 0 ? enemyThreats[0].clanId : 0; 

        // ★修正：diplomacy.js から優先度の高い順番リストをもらいます！
        const diplomacyTargets = this.game.diplomacyManager.getDiplomacyPriorityList(myClanId, uniqueNeighbors, mainThreatId);

        for (let targetData of diplomacyTargets) {
            if (castellan.isActionDone) break;
            
            const targetClanId = targetData.clanId;
            const targetClanTotal = this.getClanPrestige(targetClanId);
            
            const threatData = enemyThreats.find(t => t.clanId === targetClanId);
            const perceivedTargetTotal = threatData ? threatData.power : targetClanTotal;

            const rel = this.game.getRelation(myClanId, targetClanId);
            const dutyInhibition = (myDaimyo.duty * 0.01) * (1.0 - (smartness * 0.5)); 
            
            const targetCastle = neighbors.find(c => c.ownerClan === targetClanId);
            if (!targetCastle) continue; 
            const targetCastleId = targetCastle.id;
            
            if (rel.status === '従属') {
                const ratio = targetClanTotal / myPower;
                if (ratio <= 2.0) {
                    const breakProb = 0.01 + (2.0 - Math.max(1.0, ratio)) * 0.89;
                    if (Math.random() < breakProb && Math.random() > dutyInhibition) {
                        this.game.commandSystem.executeDiplomacy(castellan.id, targetCastleId, 'break_alliance'); 
                        castellan.isActionDone = true;
                    }
                }
                continue;
            }

            if (rel.status === '同盟' || rel.status === '支配') {
                 const enemies = neighbors.filter(c => !['同盟', '支配', '従属'].includes(this.game.getRelation(myClanId, c.ownerClan).status));
                 if (enemies.length === 0 && myPower > targetClanTotal * 2.5 && Math.random() > dutyInhibition) {
                      this.game.commandSystem.executeDiplomacy(castellan.id, targetCastleId, 'break_alliance'); 
                      castellan.isActionDone = true;
                 }
                 continue;
            }

            if (targetClanTotal * 8 <= myPower) {
                if (Math.random() < 0.05) { 
                    if (targetClanId === this.game.playerClanId) {
                        this.game.commandSystem.proposeDiplomacyToPlayer(castellan, targetClanId, 'dominate', 0, () => {
                            castellan.isActionDone = true;
                            this.game.finishTurn(); 
                        });
                        return 'waiting';
                    } else {
                        this.game.commandSystem.executeDiplomacy(castellan.id, targetCastleId, 'dominate'); 
                        castellan.isActionDone = true;
                        continue;
                    }
                }
            }

            // 通常の親善・同盟のロジック
            // ★修正：diplomacy.js で計算済みの結果をそのまま使います！
            let isStrategicPartner = targetData.isStrategicPartner;

            // 「自分より相手が強い」か「戦略的パートナー（isStrategicPartner）」なら外交を考えます！
            if (myPower < perceivedTargetTotal * 0.8 || isStrategicPartner) {
                if (Math.random() < smartness * sendProbModifier) {
                    const allianceThreshold = isStrategicPartner ? (window.AIParams.AI.AllianceThreshold || 70) - 15 : (window.AIParams.AI.AllianceThreshold || 70);
                    const goodwillThreshold = isStrategicPartner ? (window.AIParams.AI.GoodwillThreshold || 40) + 20 : (window.AIParams.AI.GoodwillThreshold || 40);

                    if (rel.sentiment < goodwillThreshold) {
                         const ratio = perceivedTargetTotal / Math.max(1, myPower); 
                         
                         let willGoodwill = true;
                         if (rel.sentiment <= 50) {
                             let skipProb = (50 - rel.sentiment) * 2; 
                             if (isStrategicPartner) { 
                                 skipProb -= 30; 
                             }
                             // ★直接敵対している大名には、親善の確率をガクッと落とします！
                             if (rel.status === '敵対' && !isStrategicPartner) { 
                                 skipProb += 60; 
                             }

                             if (Math.random() * 100 < skipProb) {
                                 willGoodwill = false;
                             }
                         }

                         // ★戦略的パートナーなら、威信に関わらず親善を諦めないようにします
                         if (!willGoodwill || (rel.sentiment <= 30 && ratio < 3.0 && !isStrategicPartner)) {
                             // 何もしないで諦める
                         } else {
                             let goodwillGold = 300; 
                             if (ratio >= 3.0) {
                                 goodwillGold = 1000; 
                             } else if (ratio > 1.5) {
                                 goodwillGold = 300 + ((ratio - 1.5) / 1.5) * 700;
                             }
                             goodwillGold = Math.floor(goodwillGold / 100) * 100; 

                             if (castle.gold >= goodwillGold) {
                                 if (targetClanId === this.game.playerClanId) {
                                     this.game.commandSystem.proposeDiplomacyToPlayer(castellan, targetClanId, 'goodwill', goodwillGold, () => {
                                         castellan.isActionDone = true;
                                         this.game.finishTurn();
                                     });
                                     return 'waiting';
                                 } else {
                                     this.game.commandSystem.executeDiplomacy(castellan.id, targetCastleId, 'goodwill', goodwillGold);
                                     castellan.isActionDone = true;
                                 }
                             }
                         }
                    } else if (rel.sentiment > allianceThreshold) {
                         if (targetClanId === this.game.playerClanId) {
                             this.game.commandSystem.proposeDiplomacyToPlayer(castellan, targetClanId, 'alliance', 0, () => {
                                 castellan.isActionDone = true;
                                 this.game.finishTurn();
                             });
                             return 'waiting';
                         } else {
                             this.game.commandSystem.executeDiplomacy(castellan.id, targetCastleId, 'alliance');
                             castellan.isActionDone = true;
                         }
                    }
                }
            }
        }
    }
}