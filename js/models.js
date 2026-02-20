/* ==========================================================================
   モデル定義 (Clan, Castle, Busho)
   ========================================================================== */

class Clan {
    constructor(data) {
        Object.assign(this, data);
        this.id = Number(this.id);
        this.leaderId = Number(this.leaderId);
        // data.color, data.name 等はCSVから自動で割り当たります
    }

    // UI等で表示するための軍団名取得
    getArmyName() {
        return this.name ? this.name.replace("家", "軍") : "不明な軍";
    }
}

class Castle {
    constructor(data) {
        Object.assign(this, data);
        this.id = Number(this.id);
        this.ownerClan = Number(this.ownerClan);
        this.castellanId = Number(this.castellanId);
        this.x = Number(this.x);
        this.y = Number(this.y);
        
        // 数値データの初期化（CSVに値がない場合の安全策）
        this.soldiers = Number(this.soldiers || 0);
        this.gold = Number(this.gold || 0);
        this.rice = Number(this.rice || 0);
        this.defense = Number(this.defense || 0);
        this.population = Number(this.population || 0);
        this.loyalty = Number(this.loyalty || 0);
        this.training = Number(this.training || 0);
        this.morale = Number(this.morale || 0);
        this.kokudaka = Number(this.kokudaka || 0);
        this.commerce = Number(this.commerce || 0);
        
        this.ammo = Number(this.ammo || 0);
        this.horses = Number(this.horses || 0);
        this.guns = Number(this.guns || 0);

        // 修正: ロード時に既存データがあれば維持する
        this.samuraiIds = Array.isArray(this.samuraiIds) ? this.samuraiIds : [];
        // isDoneはロードデータにあればそれを使う（デフォルトはfalse）
        this.isDone = this.isDone === true;
        
        // 調査・視界関連
        this.investigatedUntil = Number(this.investigatedUntil || 0);
        this.investigatedAccuracy = Number(this.investigatedAccuracy || 0);
    }
}

class Busho {
    constructor(data) {
        Object.assign(this, data);
        this.id = Number(this.id);
        this.clan = Number(this.clan);
        this.castleId = Number(this.castleId);
        
        // 能力値
        this.leadership = Number(this.leadership || 0);
        this.strength = Number(this.strength || 0);
        this.politics = Number(this.politics || 0);
        this.diplomacy = Number(this.diplomacy || 0);
        this.intelligence = Number(this.intelligence || 0);
        this.charm = Number(this.charm || 0);
        
        // 忠誠・義理・野心など
        this.loyalty = Number(this.loyalty || 0);
        this.duty = Number(this.duty || 0);
        this.ambition = Number(this.ambition || 0);
        this.affinity = Number(this.affinity || 0);
        this.innovation = Number(this.innovation || 50);
        this.cooperation = Number(this.cooperation || 50);

        // 顔画像ファイル名 (例: "nobunaga.png")。未設定なら null または undefined
        this.faceIcon = data.faceIcon || null;

        // 派閥・システム関連パラメータの初期化
        this.achievementTotal = Number(this.achievementTotal || 0); // 功績累計
        this.recognitionNeed = Number(this.recognitionNeed || 0);   // 承認欲求
        this.factionId = Number(this.factionId || 0);               // 派閥ID

        // 履歴配列の初期化
        // 既存データ(ロード時など)にあればそれを使用、なければ空配列で初期化
        this.battleHistory = Array.isArray(this.battleHistory) ? this.battleHistory : [];
        this.stayHistory = Array.isArray(this.stayHistory) ? this.stayHistory : [];

        // ステータスフラグ
        this.isDaimyo = this.isDaimyo === true;
        this.isCastellan = this.isCastellan === true;
        this.status = this.status || 'active';
        this.isActionDone = this.isActionDone === true;
    }

    // UI表示用メソッド
    getRankName() {
        if (this.isDaimyo) return "大名";
        if (this.isCastellan) return "城主";
        if (this.status === 'ronin') return "浪人";
        return "武将";
    }

    // 派閥名取得メソッド
    getFactionName() {
        if (this.factionId === 0) return "中立";
        // 派閥IDが存在する場合、識別用の文字列を返す
        return "派閥" + this.factionId;
    }
}