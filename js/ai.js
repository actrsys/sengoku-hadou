/**
 * ai.js - 敵思考エンジン
 * 責務: 敵大名のターン処理、内政、外交、軍事判断
 * 依存: WarSystem (war.js) の計算ロジックを使用して、parameter.csvの変更を反映させる
 * 設定: AI
 */

// AI関連の設定定義
window.AIParams = {
    AI: {
        // 難易度設定: 'easy' | 'normal' | 'hard'
        // easy: 判断ミスが多い、消極的
        // normal: 標準
        // hard: 判断が正確、隙あらば攻める、資源管理が徹底
        Difficulty: 'normal',

        Aggressiveness: 1.5, SoldierSendRate: 0.8,
        AbilityBase: 50, AbilitySensitivity: 2.0,
        GunshiBiasFactor: 0.5, GunshiFairnessFactor: 0.01,
        
        // 旧来の閾値は廃止し、係数として利用
        DiplomacyChance: 0.3, 
        GoodwillThreshold: 40, 
        AllianceThreshold: 70, 
        BreakAllianceDutyFactor: 0.5
    }
};

class AIEngine {
    constructor(game) {
        this.game = game;
    }

    /**
     * 難易度による補正値を取得
     * @returns {Object} { accuracy: 判定精度(0-1), aggression: 攻撃性倍率, resourceSave: 資源温存率 }
     */
    getDifficultyMods() {
        const diff = window.AIParams.AI.Difficulty || 'normal';
        switch(diff) {
            case 'hard': return { accuracy: 1.0, aggression: 1.2, resourceSave: 0.2 }; // 賢く、好戦的、無駄遣いしない
            case 'easy': return { accuracy: 0.6, aggression: 0.7, resourceSave: 0.6 }; // 鈍く、消極的、溜め込みがち
            default:     return { accuracy: 0.85, aggression: 1.0, resourceSave: 0.4 }; // normal
        }
    }

    // AIの賢さ判定 (0.0 - 1.0)
    // 難易度と知略によって変動
    getAISmartness(attributeVal) {
        const mods = this.getDifficultyMods();
        const base = window.AIParams.AI.AbilityBase || 50;
        const sensitivity = window.AIParams.AI.AbilitySensitivity || 2.0;
        
        // 能力値による基本確率
        let prob = 0.5 + ((attributeVal - base) * sensitivity * 0.01);
        prob = Math.max(0.1, Math.min(0.95, prob));

        // 難易度による補正（Hardなら全体的に賢くなる）
        if (mods.accuracy > 0.9) prob += 0.1;
        if (mods.accuracy < 0.7) prob -= 0.1;

        return Math.max(0.05, Math.min(1.0, prob));
    }

    // AIメインループ
    execAI(castle) {
        try {
            const castellan = this.game.getBusho(castle.castellanId);
            // 城主不在や行動済みなら終了
            if (!castellan || castellan.isActionDone) { 
                this.game.finishTurn(); 
                return; 
            }
            
            const mods = this.getDifficultyMods();
            const smartness = this.getAISmartness(castellan.intelligence);

            // 1. 外交フェーズ (3ヶ月に1回)
            // 知略が高いほど、あるいは外交担当官がいるほど外交頻度が上がる等の調整も可能だが、
            // ここではランダム性を残しつつ難易度で頻度を変える
            if (this.game.month % 3 === 0) {
                const diplomacyChance = (window.AIParams.AI.DiplomacyChance || 0.3) * (mods.aggression); 
                if (Math.random() < diplomacyChance) {
                    this.execAIDiplomacy(castle, castellan, smartness); 
                    if (castellan.isActionDone) { this.game.finishTurn(); return; }
                }
            }
            
            // 2. 戦争フェーズ (攻撃判断)
            // 隣接敵対国を取得
            const neighbors = this.game.castles.filter(c => 
                c.ownerClan !== 0 && 
                c.ownerClan !== castle.ownerClan && 
                GameSystem.isAdjacent(castle, c)
            );
            
            // 攻撃対象候補 (同盟除外、不可侵期間除外)
            const validEnemies = neighbors.filter(target => {
                const rel = this.game.getRelation(castle.ownerClan, target.ownerClan);
                return !rel.alliance && (target.immunityUntil || 0) < this.game.getCurrentTurnId();
            });

            // 兵士数が最低限(500)以上かつ、好戦性判定をクリアすれば攻撃検討
            // 知略が高いほど「勝てる時」に確実に攻めるため、乱数依存を減らす
            const aggroBase = (window.AIParams.AI.Aggressiveness || 1.5) * mods.aggression;
            const threshold = 500; 

            if (validEnemies.length > 0 && castle.soldiers > threshold) {
                // 好戦的性格、または知略による機会判断
                const personalityFactor = (castellan.personality === 'aggressive') ? 1.5 : 1.0;
                // 知略が高いほど「攻めるべきか」の判断を毎ターン行う（乱数でスキップしない）
                const checkChance = smartness > 0.7 ? 1.0 : (0.5 * aggroBase * personalityFactor);

                if (Math.random() < checkChance) {
                    const target = this.decideAttackTarget(castle, castellan, validEnemies, mods, smartness);
                    if (target) {
                        this.executeAttack(castle, target, castellan);
                        return; // 攻撃したらターン終了
                    }
                }
            }
            
            // 3. 内政フェーズ (攻撃しなかった場合)
            this.execInternalAffairs(castle, castellan, mods, smartness);
            
            // ターン終了
            this.game.finishTurn();

        } catch(e) {
            console.error("AI Logic Error:", e);
            this.game.finishTurn();
        }
    }

    /**
     * 攻撃対象の決定
     * WarSystemの計算式を使って勝率・損害・利益をより詳細にシミュレーションする
     */
    decideAttackTarget(myCastle, myGeneral, enemies, mods, smartness) {
        let bestTarget = null;
        let bestScore = -Infinity;
        
        // 自軍戦力
        const myBushos = this.game.getCastleBushos(myCastle.id).filter(b => b.status !== 'ronin');
        const availableBushos = myBushos.sort((a,b) => b.leadership - a.leadership).slice(0, 3);
        const myStats = WarSystem.calcUnitStats(availableBushos);
        const sendSoldiers = Math.floor(myCastle.soldiers * (window.AIParams.AI.SoldierSendRate || 0.8));

        enemies.forEach(target => {
            // 1. 偵察精度 (知略と難易度依存)
            // smartnessが高いほど、敵の情報を正確に見積もる
            // 低い場合、敵兵数を過小評価したり、防御度を無視したりする
            const errorMargin = (1.0 - smartness) * (mods.accuracy === 1.0 ? 0.1 : 0.5); 
            const perceive = (val) => Math.floor(val * (1.0 + (Math.random() - 0.5) * 2 * errorMargin));

            const enemyBushos = this.game.getCastleBushos(target.id);
            const enemyGeneral = enemyBushos.reduce((a, b) => a.leadership > b.leadership ? a : b, { leadership: 40, strength: 40, intelligence: 40 });
            const enemyStats = WarSystem.calcUnitStats(enemyBushos.length > 0 ? enemyBushos : [enemyGeneral]);
            
            // 認識上の敵戦力
            const pEnemySoldiers = perceive(target.soldiers);
            const pEnemyDefense = perceive(target.defense);
            const pEnemyTraining = perceive(target.training);

            // 2. 簡易シミュレーション (1ターン分の突撃交換)
            const myDmg = WarSystem.calcWarDamage(myStats, enemyStats, sendSoldiers, pEnemySoldiers, pEnemyDefense, myCastle.morale, pEnemyTraining, 'charge');
            // 敵からの反撃 (敵は「突撃」か「斉射」で反撃してくると想定)
            // 賢いAIは敵が「籠城」するリスクも考慮するが、ここでは標準的な反撃で計算
            const enemyDmg = WarSystem.calcWarDamage(enemyStats, myStats, pEnemySoldiers, sendSoldiers, myCastle.defense, target.morale, myCastle.training, 'charge'); 

            // 3. スコアリング
            // 期待損害 (自分の兵士被害)
            const expectedLoss = enemyDmg.soldierDmg;
            // 期待戦果 (敵兵士被害 + 城壁被害)
            const expectedGain = myDmg.soldierDmg + (myDmg.wallDmg * 2.0);
            
            // 戦果 / 損害 比率
            let score = expectedGain - (expectedLoss * (2.0 - smartness)); // 賢いほど損害を重く見る

            // 攻略成功の見込みボーナス
            // 敵兵を全滅できそう、かつ城壁を削りきれそうなら大幅プラス
            if (pEnemySoldiers < myDmg.soldierDmg * 3) score += 2000 * smartness; // 3ターン程度で倒せるなら
            if (pEnemyDefense < 100) score += 500;

            // 敵の資源(魅力)ボーナス
            // 賢いAIは金・米がある城を狙う
            const resourceValue = (target.gold + target.rice) * 0.5 * smartness;
            score += resourceValue;

            // 罠・計略リスク
            // 自分の知略が低く、敵の知略が高い場合、見えないマイナス補正がかかるはずだが
            // AI視点では「気づかない」ので補正しない。
            // ただし「慎重さ」として、知略差がある場合はスコアを下げる
            if (myGeneral.intelligence < enemyGeneral.intelligence - 10) {
                score -= 300 * smartness; // 賢いAIは知略負けを恐れる
            }

            if (score > bestScore) {
                bestScore = score;
                bestTarget = target;
            }
        });

        // 攻撃実行閾値
        // 難易度が高いほど、確実に勝てる戦い(高スコア)を選ぶ傾向、または隙を見逃さない
        // Easyの場合は低いスコアでも特攻することがある
        const threshold = 300 * mods.accuracy; 

        if (bestScore > threshold) {
            return bestTarget;
        }
        return null;
    }

    executeAttack(source, target, general) {
        const bushos = this.game.getCastleBushos(source.id).filter(b => b.status !== 'ronin');
        const sorted = bushos.sort((a,b) => b.leadership - a.leadership).slice(0, 3);
        const sendSoldiers = Math.floor(source.soldiers * (window.AIParams.AI.SoldierSendRate || 0.8));
        
        if (sendSoldiers <= 0) return;
        source.soldiers -= sendSoldiers;
        this.game.warManager.startWar(source, target, sorted, sendSoldiers);
    }

    /**
     * 内政判断
     * 状況と性格に応じて柔軟に行動を選択する
     */
    execInternalAffairs(castle, castellan, mods, smartness) {
        // 現在のリソース状態
        const gold = castle.gold;
        const rice = castle.rice;
        const soldiers = castle.soldiers;
        
        // 行動の優先度スコアを計算
        // 1. 治安維持 (Loyalty)
        // 民忠が低いと反乱リスクがあるため最優先
        let scoreCharity = 0;
        if (castle.loyalty < 40) scoreCharity = (100 - castle.loyalty) * 2;
        
        // 2. 軍備増強 (Draft)
        // 兵が少ない、または好戦的であれば優先
        let scoreDraft = 0;
        const safeSoldierCount = 300 + (smartness * 500); // 賢いほど多くの常備兵を求める
        if (soldiers < safeSoldierCount && castle.population > 1000) {
            scoreDraft = (safeSoldierCount - soldiers) * 0.2;
            if (mods.aggression > 1.0) scoreDraft *= 1.5;
        }

        // 3. 訓練 (Training)
        let scoreTraining = 0;
        if (castle.training < 100) {
            scoreTraining = (100 - castle.training) * 0.5;
            // 戦争直前(兵が多い)なら訓練優先度アップ
            if (soldiers > 500) scoreTraining *= 1.5;
        }

        // 4. 開発 (Develop)
        // 金欠なら商業、余裕があれば石高
        let scoreCommerce = 0;
        let scoreFarm = 0;
        if (gold < 500) scoreCommerce = (500 - gold) * 0.5; // 金欠時は緊急度高
        else scoreCommerce = 20; // 恒常的な開発
        
        // 米は秋にしか入らないため、賢いAIは春～夏に石高を上げる
        scoreFarm = 20;
        if (smartness > 0.6 && this.game.month < 8) scoreFarm += 10;

        // コストチェックと実行判定
        // 優先度が高い順にチェックし、実行可能なら実行して終了
        const actions = [
            { type: 'charity', score: scoreCharity, cost: 300 },
            { type: 'draft', score: scoreDraft, cost: Math.min(gold, 500) }, // cost変動だが簡易的に
            { type: 'training', score: scoreTraining, cost: 0 },
            { type: 'commerce', score: scoreCommerce, cost: 500 },
            { type: 'farm', score: scoreFarm, cost: 500 }
        ];

        // スコアにランダム性と性格補正を加える
        actions.forEach(a => {
            a.score *= (0.8 + Math.random() * 0.4); // 20%の揺らぎ
            if (castellan.politics > 70 && (a.type === 'commerce' || a.type === 'farm')) a.score *= 1.2;
            if (castellan.leadership > 70 && (a.type === 'draft' || a.type === 'training')) a.score *= 1.2;
            if (castellan.charm > 70 && a.type === 'charity') a.score *= 1.2;
        });

        // ソート
        actions.sort((a,b) => b.score - a.score);

        for (let action of actions) {
            if (action.score < 10) continue; // 低すぎる動機では行動しない

            if (action.type === 'charity' && gold >= action.cost) {
                 castle.gold -= action.cost;
                 castle.loyalty = Math.min(100, castle.loyalty + GameSystem.calcCharity(castellan, 'money'));
                 castellan.isActionDone = true; return;
            }
            if (action.type === 'draft' && gold >= 200 && castle.population > 1000) {
                 const useGold = Math.min(gold, 500);
                 castle.gold -= useGold;
                 const gain = GameSystem.calcDraftFromGold(useGold, castellan, castle.population);
                 castle.soldiers += gain;
                 castle.population -= Math.floor(gain * 0.1);
                 castellan.isActionDone = true; return;
            }
            if (action.type === 'training') {
                 castle.training = Math.min(120, castle.training + GameSystem.calcTraining(castellan));
                 castellan.isActionDone = true; return;
            }
            if ((action.type === 'commerce' || action.type === 'farm') && gold >= 500) {
                 castle.gold -= 500;
                 const val = GameSystem.calcDevelopment(castellan);
                 if (action.type === 'commerce') castle.commerce += val;
                 else castle.kokudaka += val;
                 castellan.isActionDone = true; return;
            }
        }

        // 何もしなかった
        castellan.isActionDone = true;
    }

    /**
     * 外交判断
     */
    execAIDiplomacy(castle, castellan, smartness) {
        const neighbors = this.game.castles.filter(c => c.ownerClan !== 0 && c.ownerClan !== castle.ownerClan && GameSystem.isAdjacent(castle, c));
        if (neighbors.length === 0) return;
        
        const uniqueNeighbors = [...new Set(neighbors.map(c => c.ownerClan))];
        const myPower = this.game.getClanTotalSoldiers(castle.ownerClan);
        const myDaimyo = this.game.bushos.find(b => b.clan === castle.ownerClan && b.isDaimyo) || { duty: 50 };

        for (let targetClanId of uniqueNeighbors) {
            if (castellan.isActionDone) break;

            const targetClanTotal = this.game.getClanTotalSoldiers(targetClanId);
            const rel = this.game.getRelation(castle.ownerClan, targetClanId);
            
            // 1. 同盟破棄判断
            // 圧倒的に有利、かつ義理が低い、かつ他の脅威がない
            if (rel.alliance) {
                 const enemies = neighbors.filter(c => !this.game.getRelation(castle.ownerClan, c.ownerClan).alliance);
                 // 義理堅さと知略の天秤。知略が高いと「今は裏切るべきか」を冷徹に判断する
                 const dutyInhibition = (myDaimyo.duty * 0.01) * (1.0 - (smartness * 0.5)); 
                 
                 // 敵がおらず、戦力が2倍以上差があり、義理チェックをパスしたら破棄
                 if (enemies.length === 0 && myPower > targetClanTotal * 2.5 && Math.random() > dutyInhibition) {
                      this.game.commandSystem.executeDiplomacy(castellan.id, targetClanId, 'break_alliance'); 
                      castellan.isActionDone = true;
                 }
                 continue;
            }

            // 2. 親善・同盟判断 (劣勢時)
            // 自分が弱く、相手が強い場合、生き残るためにすり寄る
            if (myPower < targetClanTotal * 0.8) {
                // 知略が高いほど、適切な相手（最も脅威度が高い相手）と同盟を結ぼうとする
                if (Math.random() < smartness) {
                    if (rel.friendship < (window.AIParams.AI.GoodwillThreshold || 40) && castle.gold > 500) {
                         this.game.commandSystem.executeDiplomacy(castellan.id, targetClanId, 'goodwill', 200); 
                         castellan.isActionDone = true;
                    } else if (rel.friendship > (window.AIParams.AI.AllianceThreshold || 70)) {
                         this.game.commandSystem.executeDiplomacy(castellan.id, targetClanId, 'alliance');
                         castellan.isActionDone = true;
                    }
                }
            }
        }
    }
}
