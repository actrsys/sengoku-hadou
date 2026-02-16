/**
 * ai.js - 敵思考エンジン
 * 責務: 敵大名のターン処理、内政、外交、軍事判断
 */

class AIEngine {
    constructor(game) {
        this.game = game;
    }

    // AIの賢さ判定 (GameSystemから移動)
    getAISmartness(attributeVal) {
        const base = GAME_SETTINGS.AI.AbilityBase;
        const diff = attributeVal - base; 
        const factor = GAME_SETTINGS.AI.AbilitySensitivity * 0.01; 
        let prob = 0.5 + (diff * factor); 
        return Math.max(0.1, Math.min(0.95, prob)); 
    }

    // AIメインループ
    execAI(castle) {
        try {
            const castellan = this.game.getBusho(castle.castellanId);
            if (!castellan || castellan.isActionDone) { this.game.finishTurn(); return; }
            
            if (this.game.month % 3 === 0 && Math.random() < GAME_SETTINGS.AI.DiplomacyChance) { 
                this.execAIDiplomacy(castle, castellan); 
            }
            
            const enemies = this.game.castles.filter(c => c.ownerClan !== 0 && c.ownerClan !== castle.ownerClan && GameSystem.isAdjacent(castle, c));
            const validEnemies = enemies.filter(e => !this.game.getRelation(castle.ownerClan, e.ownerClan).alliance && (e.immunityUntil||0) < this.game.getCurrentTurnId());
            const intelligenceFactor = this.getAISmartness(castellan.intelligence);
            let bestTarget = null; let maxScore = -1;
            
            validEnemies.forEach(target => {
                let noise = (Math.random() - 0.5) * 2000 * (1.0 - intelligenceFactor);
                let perceivedEnemyPower = target.soldiers + (target.defense / 2) + noise;
                let threshold = GAME_SETTINGS.AI.Aggressiveness;
                if (castellan.innovation > 70) threshold -= 0.3; if (castellan.innovation < 30) threshold += 0.3;
                if (castellan.personality === 'aggressive') threshold -= 0.2; if (castellan.personality === 'cautious') threshold += 0.3;
                const ratio = castle.soldiers / (Math.max(1, perceivedEnemyPower));
                if (ratio > threshold && castle.soldiers > 800) { let score = ratio + (Math.random() * 0.5); if (score > maxScore) { maxScore = score; bestTarget = target; } }
            });
            
            const shouldAttack = bestTarget && (Math.random() < intelligenceFactor || maxScore > 2.0);
            
            if (shouldAttack) {
                 let sendSoldiers = 0;
                 if (Math.random() < intelligenceFactor) {
                     let needed = Math.floor((bestTarget.soldiers + bestTarget.defense) * 1.2);
                     sendSoldiers = Math.min(needed, Math.max(0, castle.soldiers - 300));
                 } else { sendSoldiers = Math.floor(castle.soldiers * (GAME_SETTINGS.AI.SoliderSendRate + (Math.random()*0.2 - 0.1))); }
                 
                 sendSoldiers = Math.max(sendSoldiers, Math.min(1000, castle.soldiers));
                 
                 if (sendSoldiers > 500 && sendSoldiers < castle.soldiers) { 
                     // WarManager経由で戦争開始
                     this.game.warManager.startWar(castle, bestTarget, [castellan], sendSoldiers); 
                 } else { 
                     this.execAIDomestic(castle, castellan, intelligenceFactor); 
                 }
            } else { 
                this.execAIDomestic(castle, castellan, intelligenceFactor); 
            }
        } catch(e) { 
            console.error("AI Error:", e); 
            this.game.finishTurn(); 
        }
    }
    
    // AI外交
    execAIDomestic(castle, castellan, smartness) {
        if(castle.gold > 500) {
            const balanceCheck = Math.random() < smartness;
            if (balanceCheck) {
                if(castle.training < 60) { castle.training += 5; castle.gold -= 300; }
                else if(castle.loyalty < 50) { castle.loyalty += 5; castle.gold -= 300; castle.rice -= 300; }
                else if(castle.rice < castle.soldiers * 2 && castle.gold > 1000) { castle.rice += 500; castle.gold -= Math.floor(500 * this.game.marketRate); } 
                else { const val = GameSystem.calcDevelopment(castellan); castle.kokudaka+=val; castle.gold-=500; }
            } else {
                const rnd = Math.random();
                if (rnd < 0.5) { const val = GameSystem.calcDevelopment(castellan); castle.kokudaka+=val; castle.gold-=500; }
                else { const val = GameSystem.calcDevelopment(castellan); castle.commerce+=val; castle.gold-=500; }
            }
        }
        castellan.isActionDone = true; 
        this.game.finishTurn();
    }
    
    // AI外交
    execAIDiplomacy(castle, castellan) {
        const myPower = this.game.getClanTotalSoldiers(castle.ownerClan);
        const neighbors = this.game.castles.filter(c => c.ownerClan !== 0 && c.ownerClan !== castle.ownerClan && GameSystem.isAdjacent(castle, c));
        const uniqueNeighbors = [...new Set(neighbors.map(c => c.ownerClan))];
        const myDaimyo = this.game.bushos.find(b => b.clan === castle.ownerClan && b.isDaimyo) || { duty: 50 };
        uniqueNeighbors.forEach(targetClanId => {
            const targetClanTotal = this.game.getClanTotalSoldiers(targetClanId);
            const rel = this.game.getRelation(castle.ownerClan, targetClanId);
            const smartness = this.getAISmartness(castellan.intelligence);
            if (rel.alliance) {
                 const enemies = neighbors.filter(c => !this.game.getRelation(castle.ownerClan, c.ownerClan).alliance);
                 const dutyFactor = 1.0 - (myDaimyo.duty * 0.01 * GAME_SETTINGS.AI.BreakAllianceDutyFactor); 
                 if (enemies.length === 0 && myPower > targetClanTotal * 2.0 && Math.random() < smartness * dutyFactor) { this.game.executeDiplomacy(castellan.id, targetClanId, 'break_alliance'); }
                 return;
            }
            if (myPower < targetClanTotal * 0.8) {
                if (Math.random() < smartness) {
                    if (rel.friendship < GAME_SETTINGS.AI.GoodwillThreshold && castle.gold > 500) { this.game.executeDiplomacy(castellan.id, targetClanId, 'goodwill', 200); } else if (rel.friendship > GAME_SETTINGS.AI.AllianceThreshold) { this.game.executeDiplomacy(castellan.id, targetClanId, 'alliance'); }
                } else { if (Math.random() < 0.1) this.game.executeDiplomacy(castellan.id, targetClanId, 'alliance'); }
            }
        });
    }
}
