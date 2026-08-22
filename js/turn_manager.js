/**
 * turn_manager.js
 * 月初・各拠点ターン・月末の進行順序を専門に管理します。
 * GameManager は外部互換の窓口だけを持ち、実際の月進行はここへ委譲します。
 */
class TurnManager {
    constructor(game) {
        this.game = game;
    }

    async startMonth() { 
        const game = this.game;
        game.hasAutoSavedThisMonth = false; // ★月が替わったので、オートセーブ済みの印を消します
        game.writeSystemDiagnostic('month_start:start');
    
        // ★追加：月初の処理が始まったら、ユーザーが勝手に操作できないように膜（ガード）を張ります！
        game.isProcessingAI = true;
        if (game.ui && game.ui.aiGuard) {
            game.ui.aiGuard.classList.remove('hidden');
            game.ui.hideAIGuardText(); // ★中身を壊さずに、透明にして文字だけ隠します！
        }
        
        // 大名と同じ派閥に属している武将の忠誠度アップと承認欲求ダウン（設定値から読み込み）
        const F = window.WarParams.Faction;
        const minRec = F.MinRecognition;
        const decayRec = F.SameFactionRecognitionDecay;
        const boostLoy = F.SameFactionLoyaltyBoost;
    
        game.clans.forEach(clan => {
            if (clan.id !== 0 && !clan.isDestroyed) {
                const daimyo = game.getBusho(clan.leaderId); // ★高速化：全武将から探す代わりに、勢力が覚えているIDで一瞬で見つけます
                if (daimyo && daimyo.factionId > 0) {
                    const clanCastles = game.getClanCastles(clan.id);
                    clanCastles.forEach(c => {
                        const bushos = game.getCastleBushos(c.id);
                        bushos.forEach(b => {
                            if (b.status === 'active' && b.factionId === daimyo.factionId) {
                                // 設定された数値ぶん忠誠度を上げます
                                b.loyalty = Math.min(100, b.loyalty + boostLoy);
                                // 設定された数値ぶん承認欲求を下げます（最小値チェックも設定から読み込み）
                                b.recognitionNeed = Math.max(minRec, (b.recognitionNeed || 0) - decayRec);
                            }
                        });
                    });
                }
            }
        });
        
        // ★月が替わったら軍師の報告印を消します
        if (game.gunshiSystem) game.gunshiSystem.onStartMonth();
        
        // ★ごっそり差し替え！：相場の変動を「国（province）ごと」に計算するようにします！
        const fluc = window.MainParams.Economy.TradeFluctuation; 
        const baseRate = window.MainParams.Economy.TradeRateBase; // ★基本相場を読み込みます
        
        // 季節の風（季節の動きは日本全国共通です！）
        let seasonForce = 0;
        if (game.month === 9) {
            // 9月は収穫の秋！お米が市場に溢れるので、相場が一気に下がります（安くなる）
            // 基本相場の0.5倍〜1.0倍の幅でランダムに下がります
            let randomDown = (baseRate * 0.5) + (Math.random() * (baseRate * 0.5));
            seasonForce = -randomDown;
        } else {
            // それ以外の月は、だんだんお米が減っていくので、毎月少しずつ相場が上がります（高くなる）
            // 基本相場の0.05倍ずつ上がります
            seasonForce = baseRate * 0.05; 
        }
    
        // ==========================================
        // ★ここから追加：隣の国と相場を引っ張り合う魔法！
        // まず、「どの国とどの国が隣り合っているか」のリスト（つながりマップ）を作ります
        const adjProvinces = {};
        game.provinces.forEach(p => adjProvinces[p.id] = new Set());
    
        // 日本中のお城を調べて、道が繋がっているお城同士の「国」をメモします
        game.castles.forEach(c => {
            if (c.provinceId > 0 && c.adjacentCastleIds) {
                c.adjacentCastleIds.forEach(adjId => {
                    const adjCastle = game.getCastle(adjId);
                    // 違う国にあるお城と道が繋がっていたら、お互いの国を「お隣さん」としてメモ！
                    if (adjCastle && adjCastle.provinceId > 0 && adjCastle.provinceId !== c.provinceId) {
                        adjProvinces[c.provinceId].add(adjCastle.provinceId);
                        adjProvinces[adjCastle.provinceId].add(c.provinceId);
                    }
                });
            }
        });
    
        // 上から順番に相場を書き換えると不公平になるので、
        // まずは「来月の新しい相場」を別のメモ帳（nextRates）に下書きします
        const nextRates = new Map();
    
        game.provinces.forEach(p => {
            // 国ごとのサイコロと、ゴムの力
            const change = (Math.random() * (fluc * 2)) - fluc;
            const rubberForce = (baseRate - p.marketRate) * 0.1; // ★基本相場を基準に引っ張ります
            
            // ★お隣さんから引っ張られる力！
            let neighborForce = 0;
            const neighborIds = adjProvinces[p.id];
            
            if (neighborIds && neighborIds.size > 0) {
                let neighborTotalRate = 0;
                // お隣さんの相場を全部足し算します
                neighborIds.forEach(nId => {
                    const nProv = game.provinces.find(prov => prov.id === nId);
                    if (nProv) neighborTotalRate += nProv.marketRate;
                });
                // 足した相場を、お隣さんの数で割り算して「平均値」を出します
                const neighborAverage = neighborTotalRate / neighborIds.size;
                
                // お隣さんたちの平均値との「差」の、ほんの少し（5%）だけそっちに引っ張られます！
                neighborForce = (neighborAverage - p.marketRate) * 0.05; 
            }
    
            // 全て足し合わせて、下書き用のメモ帳に書き込みます
            let newRate = p.marketRate + change + rubberForce + seasonForce + neighborForce;
            newRate = Math.max(window.MainParams.Economy.TradeRateMin, Math.min(window.MainParams.Economy.TradeRateMax, newRate));
            nextRates.set(p.id, newRate);
        });
    
        // 最後に、メモ帳を見ながら全ての国の相場を一斉に書き換えます！
        game.provinces.forEach(p => {
            if (nextRates.has(p.id)) {
                p.marketRate = nextRates.get(p.id);
            }
        });
        // 年月や相場が新しくなったので、イベントが始まる前に画面の表示を最新にします！
        if (game.ui) {
            const displayCastle = game.ui.currentCastle || game.getCurrentTurnCastle();
            if (displayCastle) {
                game.ui.updateInfoPanel(displayCastle);
            }
        }
        
        await game.ui.showCutin(`${game.year}年 ${game.month}月`);
        
        game.ui.log(`=== ${game.year}年 ${game.month}月 ===`);
        
        // 月初イベント【前】をチェックして実行します
        if (game.eventManager) {
            await game.eventManager.processEvents('startMonth_before');
            game.writeSystemDiagnostic('month_start:event_before_done');
        }
        
        // 元服の処理が終わるまでしっかり待ちます！
        await game.lifeSystem.processStartMonth();
        game.writeSystemDiagnostic('month_start:life_done');
        
        // 武将の下野（出奔）が終わるまで待ちます！
        await game.factionSystem.processStartMonth(); 
        game.writeSystemDiagnostic('month_start:faction_done');
    
        // ★安定化：全国派閥再編などで作った一時配列を解放できるよう、
        // 次の全国処理へ入る前にブラウザへ一度制御を返します。
        await new Promise(resolve => setTimeout(resolve, 0));        
        game.affiliationSystem.processRoninMovements();
        
        game.updateAllCastlesLords();
        
        // 毎月、全武将の宿敵のタイマーを1ずつ減らす処理です
        game.bushos.forEach(b => {
            // 活動中の武将と浪人のみが対象です（まだ生まれていない人や亡くなった人は無視します）
            if (b.status === 'active' || b.status === 'ronin') {
                // ★追加：月が替わったら面談の記録をリセットします
                b.isInterviewed = false;
    
                if (b.nemesisList && b.nemesisList.length > 0) {
                    // タイマーを1減らして、0より大きい（まだ怒っている）宿敵だけをリストに残します
                    b.nemesisList = b.nemesisList.filter(nemesis => {
                        nemesis.count -= 1;
                        return nemesis.count > 0;
                    });
                    // 他のシステムが混乱しないように、IDだけのリストも最新の状態に書き直しておきます
                    b.nemesisIds = b.nemesisList.map(n => n.id);
                }
    
                // ★追加：諸勢力武将に毎月経験値を地道に与える処理
                if (b.status === 'active' && (b.belongKunishuId || 0) > 0) {
                    const kunishu = game.kunishuSystem ? game.kunishuSystem.getKunishu(b.belongKunishuId) : null;
                    if (kunishu) {
                        const isLeader = (b.id === kunishu.leaderId);
                        
                        // 頭領は1〜3、それ以外は0〜2の経験値を与えます
                        if (isLeader) {
                            b.expLeadership = (b.expLeadership || 0) + Math.floor(Math.random() * 3) + 1;
                            b.expStrength = (b.expStrength || 0) + Math.floor(Math.random() * 3) + 1;
                            b.expPolitics = (b.expPolitics || 0) + Math.floor(Math.random() * 3) + 1;
                            b.expDiplomacy = (b.expDiplomacy || 0) + Math.floor(Math.random() * 3) + 1;
                            b.expIntelligence = (b.expIntelligence || 0) + Math.floor(Math.random() * 3) + 1;
                        } else {
                            b.expLeadership = (b.expLeadership || 0) + Math.floor(Math.random() * 3);
                            b.expStrength = (b.expStrength || 0) + Math.floor(Math.random() * 3);
                            b.expPolitics = (b.expPolitics || 0) + Math.floor(Math.random() * 3);
                            b.expDiplomacy = (b.expDiplomacy || 0) + Math.floor(Math.random() * 3);
                            b.expIntelligence = (b.expIntelligence || 0) + Math.floor(Math.random() * 3);
                        }
                    }
                }
            }
        });
        
        if (game.month % 3 === 0) game.factionSystem.optimizeCastellans();
        
        // ★高速化：この先のループで城の数だけ「全武将リスト」を探し直すのを防ぐため、先に「勢力ID→大名」の索引を1回だけ作ります！
        const daimyoByClanIdForGrowth = new Map();
        game.clans.forEach(clan => {
            if (clan.id !== 0 && !clan.isDestroyed) {
                const d = game.getBusho(clan.leaderId);
                if (d) daimyoByClanIdForGrowth.set(clan.id, d);
            }
        });
    
        game.castles.forEach(c => {
            if (c.ownerClan === 0) return;
            c.isDone = false;
    
            // ★追加：月初の拠点防御力上昇スキルの効果を適用します
            if (typeof SkillManager !== 'undefined' && typeof SkillManager.calcMonthlyDefenseBonus === 'function') {
                const defBonus = SkillManager.calcMonthlyDefenseBonus(c, game);
                if (defBonus > 0) {
                    c.defense = Math.min(c.maxDefense, c.defense + defBonus);
                }
            }
    
            let income = EconomyRules.calcBaseGoldIncome(c);
            income = GameMath.applyVariance(income, window.MainParams.Economy.IncomeFluctuation);
            if (game.month === 3) income += income * 3;
    
            // ★ 新しくまとめた港ボーナスの計算式を呼び出します
            let portBonus = EconomyRules.calcPortBonus(c, game);
            
            // 3月の3倍ボーナスの後に足し算をするので、このボーナスは3倍にはなりません
            income += portBonus;
            
            // ★追加：一揆状態の城は金収入が０になります！（港ボーナスも一緒に0になります）
            if (c.statusEffects && c.statusEffects.includes('一揆')) {
                income = 0;
            }
            
            c.gold = Math.min(99999, c.gold + income);
            
            // ９月の兵糧収入計算式
            // ★ここは common_events.js の「豊作・凶作イベント」にお引っ越ししました！
            
            let currentLoyalty = Math.max(0, Math.min(100, c.peoplesLoyalty));
            
            // ★詰み防止：人口2000未満かつ民忠60未満の場合は、民忠60の想定で人口増減を計算します
            let calcLoyalty = currentLoyalty;
            if (c.population < 2000 && currentLoyalty < 60) {
                calcLoyalty = 60;
            }
            
            let growth = Math.floor(((Math.sqrt(c.population) * 2) * ((calcLoyalty - 50) / 100)) + (calcLoyalty / 4));
    
            // ==========================================
            // ★新しく追加：隣のお城が「敵」か「味方」かを調べて、増える量を計算する魔法！
            // ==========================================
            let neighborMultiplier = 1.2; // 基本は一番多い「120%（1.2倍）」にしておきます
            let totalAdjacent = 0; // 道が繋がっている隣のお城の数
            let hostileAdjacent = 0; // そのうち、敵かもしれないお城の数
    
            if (c.adjacentCastleIds && c.adjacentCastleIds.length > 0) {
                totalAdjacent = c.adjacentCastleIds.length;
                c.adjacentCastleIds.forEach(adjId => {
                    const adjCastle = game.getCastle(adjId);
                    if (adjCastle) {
                        let isHostile = false; // 「敵かな？」という目印（最初は違うにしておくよ）
                        
                        if (adjCastle.ownerClan === c.ownerClan) {
                            // 同じ大名家のお城なら、もちろん味方！
                            isHostile = false;
                        } else if (adjCastle.ownerClan === 0) {
                            // 誰も住んでいない空き家も、野盗がいるかもしれないので敵扱いにするよ
                            isHostile = true;
                        } else {
                            // 他の大名家のお城の場合は、仲良し手帳（外交データ）を見ます
                            const rel = game.getRelation(c.ownerClan, adjCastle.ownerClan);
                            // 同盟、支配、従属、友好のどれかなら味方！ それ以外は敵扱い！
                            if (rel && ['同盟', '支配', '従属', '友好'].includes(rel.status)) {
                                isHostile = false;
                            } else {
                                isHostile = true;
                            }
                        }
                        
                        // もし「敵だ！」と分かったら、敵の数を１つ増やします
                        if (isHostile) {
                            hostileAdjacent++;
                        }
                    } else {
                        // 万が一お城のデータが見つからなかったら、数え間違いを防ぐために全体の数を１つ減らすよ
                        totalAdjacent--;
                    }
                });
    
                // 隣にお城がある場合だけ、計算をします
                if (totalAdjacent > 0) {
                    // 全部の数で100%（1.0）を割って、敵の数だけ引き算します。最後に最低保証の20%（0.2）を足します！
                    neighborMultiplier = 0.2 + (1.0 - (hostileAdjacent / totalAdjacent));
                }
            }
    
            // 人口が増える場合だけ、調べた倍率（120%〜20%）をかけ算してあげるよ
            if (growth > 0) {
                growth = Math.floor(growth * neighborMultiplier);
    
                // ★追加・移動：人口が石高に対して少ない場合、人口の増加量をアップします！（過疎地ボーナス）
                // エラーを防ぐため、石高は最低でも「1」として計算します
                const popKokuRatio = c.population / Math.max(1, c.kokudaka);
                let popLowBonus = 1.0; // 基本は1.0倍（そのまま）です
    
                // ① 人口が石高以下の時（1倍以下）
                if (popKokuRatio <= 1) {
                    popLowBonus = 3.0; // 3倍にします
                } 
                // ② 人口が石高の5倍以下の時
                else if (popKokuRatio <= 5) {
                    // 1倍〜5倍の間で、3.0倍から1.5倍まで滑らかに減らしていきます
                    popLowBonus = 3.0 - ((popKokuRatio - 1) / 4) * 1.5;
                } 
                // ③ 人口が石高の10倍以下の時
                else if (popKokuRatio <= 10) {
                    // 5倍〜10倍の間で、1.5倍から1.0倍まで滑らかに減らしていきます
                    popLowBonus = 1.5 - ((popKokuRatio - 5) / 5) * 0.5;
                }
    
                // 最後に、計算したボーナス倍率を掛け算します
                growth = Math.floor(growth * popLowBonus);
            }
            // ==========================================
    
            // ★追加：新しい計算式で「拠点スコア（人口の実質的な上限）」を計算します
            // 石高ボーナス：√石高 * 500
            const kokudakaBonus = Math.sqrt(Math.max(0, c.kokudaka)) * 500;
            
            // 城壁ボーナス：√城防御 * 200
            const defenseBonus = Math.sqrt(Math.max(0, c.defense)) * 200;
            
            // 民忠スコア：(民忠 ÷ 100) + 0.5
            const loyaltyScore = (c.peoplesLoyalty / 100) + 0.5;
            
            // 拠点スコアを計算します（石高ボーナス＋城壁ボーナス×民忠スコア）
            const baseScore = (kokudakaBonus + defenseBonus) * loyaltyScore;
    
            // 人口が拠点スコア以上の時、増える量を20分の1にします
            if (growth > 0 && c.population >= baseScore) {
                growth = Math.floor(growth / 20);
            }
    
            c.population = Math.min(999999, Math.max(0, c.population + growth));
    
            // ★追加：毎月の兵士の自然増加計算
            // まず、このお城の持ち主である大名様を探し出します
            const daimyoBusho = daimyoByClanIdForGrowth.get(c.ownerClan);
            if (daimyoBusho) {
                // 1. 大名補正の計算
                // まずは能力値の平均を出して、0.0〜1.0の割合にします（能力補正）
                const statBonus = (daimyoBusho.leadership + daimyoBusho.strength + daimyoBusho.politics + daimyoBusho.diplomacy + daimyoBusho.intelligence + daimyoBusho.charm) / 600;
                
                // 次に、６つの能力の中で一番高い数字を見つけ出します
                const highestStat = Math.max(daimyoBusho.leadership, daimyoBusho.strength, daimyoBusho.politics, daimyoBusho.diplomacy, daimyoBusho.intelligence, daimyoBusho.charm);
                
                // 一番高い数字を特化能力補正にします
                const specialtyBonus = 0.5 + (highestStat * 0.005);
                
                // ２つを掛け算して、最終的な大名補正にします
                const daimyoBonus = statBonus * specialtyBonus;
                
                // 2. 民忠補正: 民忠 * 0.01
                const loyaltyBonus = c.peoplesLoyalty * 0.01;
                
                // 3. 増加量の基本値: √城の人口 * ((大名補正 + 民忠補正) / 2) * 1.25(調整用)
                const baseGrowth = Math.sqrt(c.population) * ((daimyoBonus + loyaltyBonus) / 2) * 1.25;
    
                // ★追加：城の所有数によるブレーキです！
                // まず、このお城の持ち主が、全部でいくつお城を持っているか数えます
                const ownedCastlesCount = game.getClanCastles(c.ownerClan).length;
                // 城の所有数を25で割り、1を足してペナルティ値とします（最低でも1なので安全です）
                const castlePenalty = 1 + (ownedCastlesCount / 25);
                
                // 基本値から先に城数ブレーキで「割り算」をして、抑制された基本値を作ります
                const suppressedGrowth = baseGrowth / castlePenalty;
    
                // ★追加：人口に対する兵士の割合を計算して、ブレーキをかけます！
                // 兵士の割合が50%で0.375倍になり、75%で0.0625倍（雀の涙）になります。
                const soldierRatio = c.population > 0 ? (c.soldiers / c.population) : 1.0;
                const penaltyMultiplier = Math.max(0, 1.0 - (soldierRatio * 1.25));
    
                // 最後に、城数で抑制された基本値に、割合ブレーキを「掛け算」します！
                let soldierGrowth = Math.floor(suppressedGrowth * penaltyMultiplier);
    
                // ==========================================
                // さっき調べた倍率を、兵士が増える数にもかけ算します
                if (soldierGrowth > 0) {
                    soldierGrowth = Math.floor(soldierGrowth * neighborMultiplier);
                }
                // ==========================================
    
                // 計算した増える人数を、今のお城の兵士の数に足し合わせます（最大99999人まで）
                c.soldiers = Math.min(99999, c.soldiers + Math.max(0, soldierGrowth));
            }
            
            // 毎月月初に取引上限を決定（最大値まで回復）
            c.tradeLimit = Math.floor((c.population / 50) + (c.kokudaka * 4));
        });
    
        // ★ここを書き換え！：空っぽの城（中立）も仲間はずれにせず、一緒に混ぜて順番リストに入れます！
        const allCastles = [...game.castles];
        allCastles.sort(() => Math.random() - 0.5); 
        game.turnQueue = [...allCastles];
    
        // ★毎月の初めに、最新の威信を計算し直します！
        game.updateAllClanPrestige();
    
        // ==========================================
        // ★追加：ここで官位の授与チェックを行います！
        const promotionMsgs = game.courtRankSystem.processMonthlyPromotions();
        if (promotionMsgs && promotionMsgs.length > 0) {
            // 複数の大名が受かった場合は、一人ずつ順番にお知らせを出します
            for (const msg of promotionMsgs) {
                await game.ui.showDialogAsync(msg, false, 0);
            }
            
            // 官位をもらったことで威信が増えるので、念のためもう一度最新の威信を計算し直しておきます！
            game.updateAllClanPrestige();
        }
        // ==========================================
    
        // ★ここを書き足し！：月初イベント【後】（収入などの処理が終わった後）を実行します
        // ここで9月の兵糧収穫イベントなどが実行されます！
        if (game.eventManager) {
            await game.eventManager.processEvents('startMonth_after');
            game.writeSystemDiagnostic('month_start:event_after_done');
        }
    
        // ★ここから新しく書き足し！：収入やイベントが全部終わった「後」に、金や兵糧を消費します！
        // ★高速化：ここでも城の数だけ「全武将リスト」を探し直すのを防ぐため、先に索引を1回だけ作ります！
        const daimyoByClanIdForUpkeep = new Map();
        game.clans.forEach(clan => {
            if (clan.id !== 0 && !clan.isDestroyed) {
                const d = game.getBusho(clan.leaderId);
                if (d) daimyoByClanIdForUpkeep.set(clan.id, d);
            }
        });
    
        game.castles.forEach(c => {
            if (c.ownerClan === 0) return;
    
            const bushos = game.getCastleBushos(c.id);
            const daimyo = daimyoByClanIdForUpkeep.get(c.ownerClan);
            
            let consumeGold = 0;
            bushos.forEach(b => {
                consumeGold += b.getSalary(daimyo);
            });
            
            const isGoldShort = (c.gold - consumeGold < 0);
            
            const consumeRice = Math.floor(c.soldiers * window.MainParams.Economy.ConsumeRicePerSoldier);
            if (c.rice - consumeRice < 0) {
                c.rice = 0;
                c.soldiers = Math.floor(c.soldiers * 0.95);
            } else {
                c.rice -= consumeRice;
            }
            
            c.gold = Math.max(0, c.gold - consumeGold);
            
            bushos.forEach(b => {
                b.isActionDone = false;
                
                // 毎月城主の功績が５増えます
                if (b.isCastellan) {
                    b.achievementTotal += 5;
                } else if (b.isGunshi) {
                    // 毎月軍師の功績が３増えます
                    b.achievementTotal += 3;
                }
                
                // 大名・国主は追加で功績が２増えます
                if (b.isDaimyo || b.isCommander) {
                    b.achievementTotal += 2;
                }
    
                // 役職ごとの経験値追加
                if (b.isCastellan) {
                    b.expStrength = (b.expStrength || 0) + 1;
                    b.expPolitics = (b.expPolitics || 0) + 3;
                }
                
                if (b.isDaimyo || b.isCommander) {
                    b.expLeadership = (b.expLeadership || 0) + 2;
                    b.expDiplomacy = (b.expDiplomacy || 0) + 3;
                    b.expIntelligence = (b.expIntelligence || 0) + 2;
                }
                
                if (b.isGunshi) {
                    b.expLeadership = (b.expLeadership || 0) + 2;
                    b.expIntelligence = (b.expIntelligence || 0) + 5;
                    b.expPolitics = (b.expPolitics || 0) + 2;
                    b.expDiplomacy = (b.expDiplomacy || 0) + 3;
                }
    
                // 金が足りなかったら城にいる家臣の忠誠度が１下がる
                if (!b.isDaimyo && isGoldShort) {
                    b.loyalty = Math.max(0, b.loyalty - 1);
                }
            });
    
            // もし兵糧不足などで兵士が0以下になったら、訓練と士気も0にします
            if (c.soldiers <= 0) {
                c.soldiers = 0;
                c.training = 0;
                c.morale = 0;
            }
        });
    
        // ★ここから追加：毎月の初めに、各大名家に「作戦会議（カウントダウンの進行や新しい目標決め）」をさせます！
        if (game.month === 1 || game.month === 4 || game.month === 7 || game.month === 10) {
            if (game.aiStaffing) {
                // ★安定化：四半期の全国人事を1本の長い同期処理にせず、数勢力ごとにブラウザへ制御を返します。
                let staffingProcessed = 0;
                for (const clan of game.clans) {
                    // ★修正：滅亡フラグをチェックして、生き残っている勢力だけ会議をします
                    if (clan.id !== 0 && !clan.isDestroyed && clan.id !== game.playerClanId) {
                        // ★追加：国主を決める前に、まずは大名自身に最適な居城を探させてお引越しさせます！
                        const daimyo = game.getBusho(clan.leaderId); // ★高速化：索引を使って一瞬で見つけます
                        if (daimyo && daimyo.castleId) {
                            const daimyoCastle = game.getCastle(daimyo.castleId);
                            if (daimyoCastle) {
                                game.aiStaffing.relocateDaimyo(daimyoCastle, daimyo);
                            }
                        }
    
                        // ★変更：解散は1月のみ実行し、新設と合わせて条件を満たす限りループさせます！
                        if (game.month === 1) {
                            let changed = true;
                            let loopCount = 0; // 無限ループ防止（念のため最大10回まで）
                            while (changed && loopCount < 10) {
                                changed = false;
                                const disbanded = game.aiStaffing.checkLegionDisband(clan.id);
                                const created = game.aiStaffing.createNewLegionIfNeeded(clan.id);
                                
                                // 解散か新設、どちらかが実行されたら「状況が変わった」としてもう1度ループします
                                if (disbanded || created) {
                                    changed = true;
                                }
                                loopCount++;
                            }
                        } else {
                            // 4, 7, 10月は解散は行わず、新設のみをループ実行します
                            let created = true;
                            let loopCount = 0;
                            while (created && loopCount < 10) {
                                created = game.aiStaffing.createNewLegionIfNeeded(clan.id);
                                loopCount++;
                            }
                        }
    
                        staffingProcessed++;
                        if (staffingProcessed % 4 === 0) {
                            await new Promise(resolve => setTimeout(resolve, 0));
                        }
                    }
                }
            }
        }
        game.writeSystemDiagnostic('month_start:staffing_done');
        if (game.aiOperationManager) {
            await game.aiOperationManager.processMonthlyOperations();
        }
        game.writeSystemDiagnostic('month_start:operations_done');
    
        game.currentIndex = 0; 
        game.writeSystemDiagnostic('month_start:before_turn_queue');
    
        // Round26：月末～月初の一連処理中に観戦終了が予約されていた場合は、
        // ここを「月処理が完全に一段落した安全地点」として帰還確認へ移ります。
        if (await game.tryProcessQueuedWatchReturn('month_start_complete')) return;
    
        game.processTurn();
    }

    async processTurn() {  // ★最初に async を付けます！
        const game = this.game;
        if (game.aiTimer) {
            clearTimeout(game.aiTimer);
            game.aiTimer = null;
        }
    
        // ★最強ストッパー１：合戦中やマップ選択中にフライングで呼ばれたら絶対に弾く！
        if (game.warManager && game.warManager.state && game.warManager.state.active) return;
        if (game.selectionMode != null) return;
        
        // ★ここを修正！ 全ての城が終わって翌月（endMonth）に行く前にも、メッセージが消えるのをじっと待ちます！
        if (game.currentIndex >= game.turnQueue.length) { 
            game.writeSystemDiagnostic('month_transition:ai_queue_done');
            if (game.ui && game.ui.waitForDialogs) {
                await game.ui.waitForDialogs();
            }
            // ★ここから追加：全部終わって翌月に行く前に、安心感のために数字を「MAX/MAX」にしておきます！
            if (game.isProcessingAI && game.ui && game.turnQueue.length > 0) {
                game.ui.restoreAIGuardText(true); // ★強制表示
                game.ui.updateAIProgress(game.turnQueue.length, game.turnQueue.length);
                // ★追加：MAXになった数字を一瞬だけ見せてから、月末イベントの邪魔にならないように表示を消します！
                await new Promise(resolve => setTimeout(resolve, 300));
                if (game.ui) {
                    game.ui.hideAIGuardText(); // ★中身を壊さずに、透明にして文字だけを隠します！
                }
            }
            game.writeSystemDiagnostic('month_transition:before_endMonth');
            await game.endMonth(); // ← ★「await」を書き足します！
            return; 
        }
    
        const castle = game.turnQueue[game.currentIndex]; 
        
        if (castle.isDone) {
            // ★ここを書き足し：行動済みの城をスキップする時も、一瞬だけ数字を進めます！
            if (game.isProcessingAI && game.ui) {
                game.ui.updateAIProgress(game.currentIndex + 1, game.turnQueue.length);
            }
            // ★追加：スマホがパンクしないように、ここでほんの一瞬だけ「息継ぎ（お休み）」をさせます！
            setTimeout(() => {
                game.finishTurn();
            }, 0);
            return;
        }
        
        if(!castle || castle.ownerClan === 0 || !game.clans.find(c => Number(c.id) === Number(castle.ownerClan))) { 
            console.log(`空き城またはデータのない城をスキップしました。`);
            // ★ここを書き足し：空城をスキップする時も、一瞬だけ数字を進めます！
            if (game.isProcessingAI && game.ui) {
                game.ui.updateAIProgress(game.currentIndex + 1, game.turnQueue.length);
            }
            game.currentIndex++; 
            // ★追加：空き城を連続で飛ばす時も、スマホがパンクしないように一瞬「息継ぎ」をさせます！
            setTimeout(() => {
                game.processTurn(); 
            }, 0);
            return; 
        }
        
        const ownerId = Number(castle.ownerClan);
        const playerId = Number(game.playerClanId);
        const isPlayerCastle = (ownerId === playerId);
    
        // ==========================================
        // ★ここに追加：画面を動かしたり「ご命令ください」を出す前に、
        // 画面上のメッセージが全部終わるまでじっと待ちます！
        if (game.ui && game.ui.waitForDialogs) {
            await game.ui.waitForDialogs();
        }
        // ==========================================
        
        // ★イベント追加：各城の行動開始前
        if (game.eventManager) {
            await game.eventManager.processEvents('turn_start', castle);
        }
    
        // 行動開始前イベントで城の持ち主や状態が変わった場合の安全措置
        if (castle.isDone || castle.ownerClan === 0) {
            game.finishTurn();
            return;
        }
        
        if (isPlayerCastle) {
            // ==========================================
            // ★ごっそり差し替え！委任のチェックを入れます
            // ==========================================
            if (castle.isDelegated) {
                // 委任されている場合はAIに任せます！
                game.isProcessingAI = true; 
                if(game.ui.aiGuard) {
                    game.ui.aiGuard.classList.remove('hidden'); 
                    game.ui.restoreAIGuardText(true); // ★透明マントを脱いで文字を見せます！
                }
                
                game.ui.updateAIProgress(game.currentIndex + 1, game.turnQueue.length);
                // ただし、UIに現在の城だけは認識させておきます。
                if (game.ui) game.ui.currentCastle = castle;
                
                const delay = 30;
    
                game.aiTimer = setTimeout(async () => {
                    if (game.warManager.state.active) return;
                    if (game.turnQueue[game.currentIndex] !== castle) return;
                    try {
                        await game.aiEngine.execAI(castle); // AIにバトンタッチ！
                    } catch(e) {
                        console.error("AI Error caught:", e);
                        game.finishTurn(); 
                    }
                }, delay); 
            } else {
                // 直轄（今まで通りプレイヤーが動かす）の場合
                game.isProcessingAI = false; 
                game.writeSystemDiagnostic('player_turn:enter', castle);
    
                // ★毎月一番最初の自分のターンで、裏側でオートセーブを走らせます！
                if (!game.hasAutoSavedThisMonth && window.GameConfig && window.GameConfig.autoSave) {
                    game.hasAutoSavedThisMonth = true;
                    // ★ゲーム開始直後の最初の月は、意味がないのでオートセーブをスキップします！
                    if (game.year !== game.gameStartYear || game.month !== game.gameStartMonth) {
                        // ★安定化：オートセーブをAI進行と並走させない。
                        // 古いスマホでは「全データ保存」とAI思考が重なるとメモリの山ができるため、
                        // 保存が終わってから操作を返します。
                        game.writeSystemDiagnostic('player_turn:before_autosave', castle);
                        await game.executeAutoSave();
                        game.writeSystemDiagnostic('player_turn:after_autosave', castle);
                    }
                }
    
                if(game.ui.aiGuard) game.ui.aiGuard.classList.add('hidden');
    
                // ★Round5：プレイヤー復帰時のフルマップ描画はここ1回だけ。
                game.writeSystemDiagnostic('player_turn:before_render', castle);
                game.ui.renderMap();
                game._aiDeferredMapRefresh = false;
                game.writeSystemDiagnostic('player_turn:after_render', castle);
                game.ui.scrollToActiveCastle(castle);
                
                game.ui.showTurnStartDialog(castle, () => {
                    game.gunshiSystem.checkAndShowAdvice(castle, async () => {
                        // ★イベント追加：コマンドの選択前（手動操作時）
                        if (game.eventManager) {
                            await game.eventManager.processEvents('before_command', castle);
                        }
                        game.ui.showControlPanel(castle); 
                        game.writeSystemDiagnostic('player_turn:ready', castle);
                    });
                });
            }
        } else {
            // ★ここから「プレイヤー以外の勢力」のターンの処理を一つにまとめました！
            game.isProcessingAI = true;
            if(game.ui.aiGuard) {
                game.ui.aiGuard.classList.remove('hidden'); 
                game.ui.restoreAIGuardText(true); // ★透明マントを脱いで文字を見せます！
            }
            
            // 進捗を表示
            game.ui.updateAIProgress(game.currentIndex + 1, game.turnQueue.length);
            
            // UI側に現在の城だけをこっそり教えておきます。
            if (game.ui) game.ui.currentCastle = castle;
            
            const delay = 30;
    
            game.aiTimer = setTimeout(async () => {
                if (game.warManager.state.active) return;
                if (game.turnQueue[game.currentIndex] !== castle) return;
                try {
                    await game.aiEngine.execAI(castle);
                } catch(e) {
                    console.error("AI Error caught:", e);
                    game.finishTurn(); 
                }
            }, delay); 
        }
    }

    async finishTurn() { 
        const game = this.game;
        const wasProcessingAI = game.isProcessingAI;
    
        // ★最強ストッパー２：合戦中やマップ選択中なら、絶対にターンを勝手に終わらせない！
        if (game.warManager && game.warManager.state && game.warManager.state.active) return; 
        if (game.selectionMode != null) return;
        
        if (game.ui && typeof game.ui.hideAIWarThinking === 'function') {
            game.ui.hideAIWarThinking();
        }
    
        if (game.aiTimer) { clearTimeout(game.aiTimer); game.aiTimer = null; }
    
        game.selectionMode = null;
    
        // ★ここから追加：ターン終了時、必ずコマンドの階層を初期化して非表示にします！
        if (game.ui && typeof game.ui.clearCommandMenu === 'function') {
            game.ui.clearCommandMenu();
        }
        
        // ★ここから追加：自分のターンが終わった瞬間に、いったん膜を張って操作をブロックします！
        game.isProcessingAI = true;
        if (game.ui && game.ui.aiGuard) {
            game.ui.aiGuard.classList.remove('hidden');
            game.ui.restoreAIGuardText(true); // ★透明マントを脱いで文字を見せます！
        }
        
        // ★追加：月末のイベント処理中（独立や反乱など）は、ここでストップします！
        if (game.currentIndex >= game.turnQueue.length) {
            return;
        }
    
        const castle = game.getCurrentTurnCastle(); 
        if(castle) {
            castle.isDone = true;
            if (wasProcessingAI) game.writeAIDiagnostic(castle, 'turn_end:event');
            // ★イベント追加：各城の行動終了直後
            if (game.eventManager) {
                await game.eventManager.processEvents('turn_end', castle);
            }
            if (wasProcessingAI) game.writeAIDiagnostic(castle, 'turn_finished');
        }
    
        game.currentIndex++; 
    
        // Round26：戦争・外交・turn_endイベントまで含めて「今の拠点1件」が完全終了した地点です。
        // 観戦終了予約があれば次の拠点へ進まず、ここで初めて帰還確認を開きます。
        if (await game.tryProcessQueuedWatchReturn('turn_complete')) return;
    
        // ★追加：ターンが終わって次に行く時も、スマホがパンクしないように一瞬「息継ぎ」をさせます！
        setTimeout(() => {
            game.processTurn(); 
        }, 0);
    }

    async endMonth() {
        const game = this.game;
        game.writeSystemDiagnostic('month_end:start');
        // ==========================================
        // ★ 新しい一元管理の魔法：「画面にメッセージが出ている間は絶対に待つ」という最強の関所を作ります！
        const waitIfBusy = async () => {
            if (game.ui && typeof game.ui.waitForDialogs === 'function') {
                await game.ui.waitForDialogs();
            }
            // 少しだけ隙間を待つ（メッセージが連続で出るときの安全対策です）
            await new Promise(resolve => setTimeout(resolve, 300));
        };
        // ==========================================
    
        // ★ここを書き足し！：月末イベント【前】（寿命などの処理が始まる前）を実行します
        if (game.eventManager) {
            await game.eventManager.processEvents('endMonth_before');
            game.writeSystemDiagnostic('month_end:event_before_done');
        }
        await waitIfBusy(); // 終わったら、画面が空っぽになるまで絶対に待つ！
    
        // 1つ目の係員：派閥
        if (game.factionSystem && typeof game.factionSystem.processEndMonth === 'function') {
            await game.factionSystem.processEndMonth(); 
            game.writeSystemDiagnostic('month_end:faction_done');
        }
        await waitIfBusy(); // 終わったら、画面が空っぽになるまで絶対に待つ！
    
        // 2つ目の係員：独立（反乱して空白地になる処理など）
        if (game.independenceSystem && typeof game.independenceSystem.checkIndependence === 'function') {
            await game.independenceSystem.checkIndependence();
            game.writeSystemDiagnostic('month_end:independence_done');
        }
        await waitIfBusy(); // 終わったら、画面が空っぽになるまで絶対に待つ！
        
        // 3つ目の係員：外交
        if (game.diplomacyManager && typeof game.diplomacyManager.processEndMonth === 'function') {
            game.diplomacyManager.processEndMonth();
            game.writeSystemDiagnostic('month_end:diplomacy_done');
        }
        await waitIfBusy(); // 終わったら、画面が空っぽになるまで絶対に待つ！
    
        // 4つ目の係員：諸勢力（反乱など）
        if (game.kunishuSystem && typeof game.kunishuSystem.processEndMonth === 'function') {
            await game.kunishuSystem.processEndMonth();
            game.writeSystemDiagnostic('month_end:kunishu_done');
        }
        await waitIfBusy(); // 終わったら、画面が空っぽになるまで絶対に待つ！
        
        // 5つ目の係員：寿命
        if (game.lifeSystem && typeof game.lifeSystem.processEndMonth === 'function') {
            await game.lifeSystem.processEndMonth(); 
            game.writeSystemDiagnostic('month_end:life_done');
        }
        await waitIfBusy(); // 終わったら、画面が空っぽになるまで絶対に待つ！
    
        // 6つ目の係員：月末の特別イベント（災害など）
        if (game.eventManager) {
            await game.eventManager.processEvents('endMonth_after');
            game.writeSystemDiagnostic('month_end:event_after_done');
        }
        await waitIfBusy(); // 終わったら、画面が空っぽになるまで絶対に待つ！
    
        // すべての月末イベントとメッセージが完全に終わってから、ようやく時間を進めます！
        game.month++;
        if(game.month > 12) { game.month = 1; game.year++; }
        
        // ★ここから追加：月末のタイミングで大名家の表示名を更新して同名被りを防ぎます！
        game.updateClanDisplayNames();
        
        // ★修正：クリアとゲームオーバーの判定を EndingSystem (エンディング係) に任せます！
        const isEnding = await game.endingSystem.checkEnding();
        if (!isEnding) {
            // エンディングでなければ次の月へ進みます
            game.writeSystemDiagnostic('month_end:before_startMonth');
            await game.startMonth(); 
        }
    }

    checkAllActionsDone() {
        const game = this.game;
        const c = game.getCurrentTurnCastle();
        if (!c || Number(c.ownerClan) !== Number(game.playerClanId)) return; 
    
        if (game.isProcessingAI) return;
    
        const bushos = game.getCastleBushos(c.id).filter(b => b.clan === c.ownerClan && b.status === 'active');
        
        if(bushos.length > 0 && bushos.every(b => b.isActionDone)) {
             setTimeout(() => {
                 const nav = game.getNavigatorInfo(c);
                 game.ui.showDialog("「すべての武将が行動を終えました。\n今月の命令を終了しますか？」", true, () => {
                     game.finishTurn();
                 }, null, {
                     leftFace: nav.faceIcon,
                     leftName: nav.name
                 });
             }, 100);
        }
    }

}

window.TurnManager = TurnManager;
