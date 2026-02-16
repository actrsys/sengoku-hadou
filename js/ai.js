/**
 * ai.js - 敵思考エンジン
 * 責務: 敵大名のターン処理、内政、外交、軍事判断
 * 依存: WarSystem (war.js) の計算ロジックを使用して、parameter.csvの変更を反映させる
 */

class AIEngine {
    constructor(game) {
        this.game = game;
    }

    // AIの賢さ判定
    getAISmartness(attributeVal) {
        const base = GAME_SETTINGS.AI.AbilityBase || 50;
        const diff = attributeVal - base; 
        const factor = (GAME_SETTINGS.AI.AbilitySensitivity || 2.0) * 0.01; 
        let prob = 0.5 + (diff * factor); 
        return Math.max(0.1, Math.min(0.95, prob)); 
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
            
            // 1. 外交フェーズ (3ヶ月に1回)
            if (this.game.month % 3 === 0 && Math.random() < (GAME_SETTINGS.AI.DiplomacyChance || 0.3)) { 
                this.execAIDiplomacy(castle, castellan); 
                if (castellan.isActionDone) { this.game.finishTurn(); return; }
            }
            
            // 2. 戦争フェーズ (攻撃判断)
            // WarManagerを通じて攻撃可能なリストを取得してもよいが、
            // AIは「勝てるかどうか」をWarSystemを使って計算する
            const neighbors = this.game.castles.filter(c => 
                c.ownerClan !== 0 && 
                c.ownerClan !== castle.ownerClan && 
                GameSystem.isAdjacent(castle, c)
            );
            
            // 同盟関係などを除外
            const validEnemies = neighbors.filter(target => {
                const rel = this.game.getRelation(castle.ownerClan, target.ownerClan);
                return !rel.alliance && (target.immunityUntil || 0) < this.game.getCurrentTurnId();
            });

            if (validEnemies.length > 0 && castle.soldiers > 500) {
                // 攻撃的な性格、または兵数が十分多い場合に検討
                const aggressiveness = GAME_SETTINGS.AI.Aggressiveness || 1.5;
                if (Math.random() < aggressiveness * 0.5) {
                    const target = this.decideAttackTarget(castle, castellan, validEnemies);
                    if (target) {
                        // 攻撃実行
                        this.executeAttack(castle, target, castellan);
                        return; // 攻撃したらターン終了
                    }
                }
            }
            
            // 3. 内政フェーズ (攻撃しなかった場合)
            this.execInternalAffairs(castle, castellan);
            
            // ターン終了
            this.game.finishTurn();

        } catch(e) {
            console.error("AI Logic Error:", e);
            this.game.finishTurn();
        }
    }

    /**
     * 攻撃対象の決定
     * WarSystemの計算式を使って勝率を予測する
     */
    decideAttackTarget(myCastle, myGeneral, enemies) {
        let bestTarget = null;
        let bestScore = -9999;
        
        // 自軍の戦力計算 (WarSystemを利用)
        const myBushos = this.game.getCastleBushos(myCastle.id).filter(b => b.status !== 'ronin');
        // 出陣可能武将（大将+副将候補）
        const availableBushos = myBushos.sort((a,b) => b.leadership - a.leadership).slice(0, 3);
        const myStats = WarSystem.calcUnitStats(availableBushos);
        const mySoldiers = Math.floor(myCastle.soldiers * (GAME_SETTINGS.AI.SoliderSendRate || 0.8));

        enemies.forEach(target => {
            // 敵軍の戦力予測
            const enemyBushos = this.game.getCastleBushos(target.id);
            // 敵武将が不明な場合はデフォルト値
            const enemyGeneral = enemyBushos.reduce((a, b) => a.leadership > b.leadership ? a : b, { leadership: 40, strength: 40, intelligence: 40 });
            // WarSystemの計算には配列が必要
            const enemyStats = WarSystem.calcUnitStats(enemyBushos.length > 0 ? enemyBushos : [enemyGeneral]);
            
            // 簡易シミュレーション: WarSystem.calcWarDamage を使用
            // ※「突撃」でお互いに殴り合ったと仮定
            const myDmg = WarSystem.calcWarDamage(myStats, enemyStats, mySoldiers, target.soldiers, target.defense, myCastle.morale, target.training, 'charge');
            const enemyDmg = WarSystem.calcWarDamage(enemyStats, myStats, target.soldiers, mySoldiers, myCastle.defense, target.morale, myCastle.training, 'charge'); // 敵の反撃(chargeと仮定)

            // 評価スコア算出
            // 敵へのダメージ - 自分が受けるダメージ + 敵の資源(魅力)
            let score = (myDmg.soldierDmg * 1.5) - (enemyDmg.soldierDmg) + (myDmg.wallDmg * 2.0);
            
            // 敵の兵数が少なければボーナス
            if (target.soldiers < mySoldiers * 0.5) score += 1000;
            // 敵の城防御が低ければボーナス
            if (target.defense < 100) score += 500;
            
            // 知略による補正（罠の回避など）
            if (myGeneral.intelligence < enemyGeneral.intelligence - 20) score -= 500;

            if (score > bestScore) {
                bestScore = score;
                bestTarget = target;
            }
        });

        // 閾値を超えた場合のみ攻撃決行
        if (bestScore > 500) { // この閾値はバランス調整が必要
            return bestTarget;
        }
        return null;
    }

    /**
     * 攻撃実行
     */
    executeAttack(source, target, general) {
        const bushos = this.game.getCastleBushos(source.id).filter(b => b.status !== 'ronin');
        // 統率順にソートして上位3名を連れて行く
        const sorted = bushos.sort((a,b) => b.leadership - a.leadership).slice(0, 3);
        
        // 兵数は設定された割合または全軍
        const sendSoldiers = Math.floor(source.soldiers * (GAME_SETTINGS.AI.SoliderSendRate || 0.8));
        
        if (sendSoldiers <= 0) return;

        source.soldiers -= sendSoldiers;
        
        // WarManagerに処理を委譲
        this.game.warManager.startWar(source, target, sorted, sendSoldiers);
    }

    /**
     * 内政判断
     */
    execInternalAffairs(castle, castellan) {
        const S = GAME_SETTINGS.Economy;
        const M = GAME_SETTINGS.Military;
        
        // 優先順位判断
        // 1. 忠誠度が低いなら施し (反乱防止)
        if (castle.loyalty < 40 && castle.gold > 300) {
            // Charity
            if (Math.random() < 0.8) {
                // コマンド実行は簡略化のため直接リソース操作、またはCommandSystem経由が良いが、
                // ここではロジックを直書きして整合性を保つ
                const cost = 300;
                castle.gold -= cost;
                const val = GameSystem.calcCharity(castellan, 'money');
                castle.loyalty = Math.min(100, castle.loyalty + val);
                castellan.isActionDone = true;
                return;
            }
        }

        // 2. 兵が少ないなら徴兵
        if (castle.soldiers < 300 && castle.gold > 200 && castle.population > 1000) {
            if (Math.random() < 0.7) {
                const cost = Math.min(castle.gold, 500);
                castle.gold -= cost;
                const soldiers = GameSystem.calcDraftFromGold(cost, castellan, castle.population);
                castle.soldiers += soldiers;
                castle.population -= Math.floor(soldiers * 0.1);
                castellan.isActionDone = true;
                return;
            }
        }

        // 3. 訓練
        if (castle.training < 60) {
             const increase = GameSystem.calcTraining(castellan);
             castle.training = Math.min(120, castle.training + increase);
             castellan.isActionDone = true;
             return;
        }

        // 4. 開発 (金・米)
        // 金欠なら商業、そうでなければ石高
        const type = (castle.gold < 500) ? 'commerce' : 'farm';
        if (castle.gold >= 500) { // 開発コスト
             castle.gold -= 500;
             const val = GameSystem.calcDevelopment(castellan);
             if (type === 'commerce') castle.commerce += val;
             else castle.kokudaka += val;
             castellan.isActionDone = true;
             return;
        }

        // 何もできない場合
        castellan.isActionDone = true;
    }

    /**
     * 外交判断
     */
    execAIDiplomacy(castle, castellan) {
        const neighbors = this.game.castles.filter(c => c.ownerClan !== 0 && c.ownerClan !== castle.ownerClan && GameSystem.isAdjacent(castle, c));
        if (neighbors.length === 0) return;
        
        // 隣接勢力を重複なしで取得
        const uniqueNeighbors = [...new Set(neighbors.map(c => c.ownerClan))];
        const myPower = this.game.getClanTotalSoldiers(castle.ownerClan);
        const myDaimyo = this.game.bushos.find(b => b.clan === castle.ownerClan && b.isDaimyo) || { duty: 50 };

        uniqueNeighbors.forEach(targetClanId => {
            if (castellan.isActionDone) return;

            const targetClanTotal = this.game.getClanTotalSoldiers(targetClanId);
            const rel = this.game.getRelation(castle.ownerClan, targetClanId);
            const smartness = this.getAISmartness(castellan.intelligence);

            // 1. 同盟破棄判断 (圧倒的に有利、かつ義理が低い、かつ敵が周りにいない)
            if (rel.alliance) {
                 const enemies = neighbors.filter(c => !this.game.getRelation(castle.ownerClan, c.ownerClan).alliance);
                 const dutyFactor = 1.0 - (myDaimyo.duty * 0.01 * (GAME_SETTINGS.AI.BreakAllianceDutyFactor || 0.5)); 
                 
                 if (enemies.length === 0 && myPower > targetClanTotal * 2.0 && Math.random() < smartness * dutyFactor) {
                      // 外交実行
                      this.game.commandSystem.executeDiplomacy(castellan.id, targetClanId, 'break_alliance'); 
                      // AIの場合はexecuteDiplomacy内でisActionDoneされる想定だが、念のため
                      castellan.isActionDone = true;
                 }
                 return;
            }

            // 2. 親善・同盟判断 (自分が弱い場合)
            if (myPower < targetClanTotal * 0.8) {
                if (Math.random() < smartness) {
                    if (rel.friendship < (GAME_SETTINGS.AI.GoodwillThreshold || 40) && castle.gold > 500) {
                         this.game.commandSystem.executeDiplomacy(castellan.id, targetClanId, 'goodwill', 200); 
                    } else if (rel.friendship > (GAME_SETTINGS.AI.AllianceThreshold || 70)) {
                         this.game.commandSystem.executeDiplomacy(castellan.id, targetClanId, 'alliance');
                    }
                }
            }
        });
    }
}