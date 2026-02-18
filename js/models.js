/**
 * models.js
 * データモデル定義 (Clan, Busho, Castle)
 */

class Clan { 
    constructor(data) { Object.assign(this, data); } 
    getArmyName() { return this.name ? this.name.replace(/(家|衆)$/, "") + "軍" : "軍"; }
}

class Busho {
    constructor(data) {
        Object.assign(this, data); this.fatigue = 0; this.isActionDone = false;
        
        // パラメータのデフォルト値を先に設定（性格判定で使用するため）
        if(this.charm === undefined) this.charm = 50; 
        if(this.diplomacy === undefined) this.diplomacy = 50;
        if(this.ambition === undefined) this.ambition = 50; 
        if(this.affinity === undefined) this.affinity = 50;
        if(this.duty === undefined) this.duty = 50; 
        if(this.leadership === undefined) this.leadership = this.strength;

        const sysParams = window.WarParams ? window.WarParams.System : {};
        const hermitLimit = sysParams.HermitAmbitionLimit || 30;
        const statDiff = sysParams.PersonalityStatDiff || 20;

        // 性格決定ロジック
        if(!this.personality) {
            // 【変更】野心30未満は隠遁者(hermit)
            if (this.ambition < hermitLimit) {
                this.personality = 'hermit';
            }
            else if (this.strength > this.intelligence + statDiff) this.personality = 'aggressive';
            else if (this.intelligence > this.strength + statDiff) this.personality = 'cautious';
            else this.personality = 'balanced';
        }

        if(this.innovation === undefined) this.innovation = Math.min(100, Math.max(0, 50 + (this.intelligence - 50) * 0.5 + (Math.random() * 40 - 20))); 
        if(this.cooperation === undefined) this.cooperation = Math.min(100, Math.max(0, 50 + (this.charm - 50) * 0.5 + (Math.random() * 40 - 20)));
        this.isDaimyo = false; this.isGunshi = false; this.isCastellan = false;
        if(this.clan === 0 && !this.status) this.status = 'ronin';

        // --- 派閥・承認欲求システム用拡張 ---
        // 累計功績
        this.achievementTotal = this.achievementTotal || 0;
        // 承認欲求 (-100:恩義 ～ 100:不満)
        this.recognitionNeed = this.recognitionNeed || 0;
        // 所属派閥ID (0:なし)
        this.factionId = this.factionId || 0;
        // 現在の城に到着したターン (ゲーム開始時は0と仮定、ロード時は維持)
        this.arrivalTurn = this.arrivalTurn !== undefined ? this.arrivalTurn : 0;
        // 滞在履歴 [{castleId, start, end}] (3ヶ月以上のみ記録)
        this.stayHistory = this.stayHistory || [];
        // 参戦履歴 [Year_Month_CastleID]
        this.battleHistory = this.battleHistory || [];
    }
    getRankName() { if(this.isDaimyo) return "大名"; if(this.clan === 0) return "在野"; if(this.isGunshi) return "軍師"; if(this.isCastellan) return "城主"; return "一般"; }
    getFactionName() { 
        const sysParams = window.WarParams ? window.WarParams.System : {};
        const high = sysParams.FactionInnovationHigh || 70;
        const low = sysParams.FactionInnovationLow || 30;

        if (this.innovation >= high) return "革新派"; 
        if (this.innovation <= low) return "保守派"; 
        return "中道派"; 
    }
}

class Castle {
    constructor(data) {
        Object.assign(this, data); this.samuraiIds = this.samuraiIds || [];
        this.maxDefense = (data.defense || 500) * 2; this.maxKokudaka = (data.kokudaka || 500) * 2; this.maxCommerce = (data.commerce || 500) * 2;
        this.maxLoyalty = 1000; this.isDone = false;
        if(this.loyalty === undefined) this.loyalty = 500; if(this.population === undefined) this.population = 10000;
        if(this.training === undefined) this.training = 50; if(this.morale === undefined) this.morale = 50;
        this.investigatedUntil = 0; this.investigatedAccuracy = 0;
        this.immunityUntil = 0; 
    }
}