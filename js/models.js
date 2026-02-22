/**
 * models.js
 * モデル定義 (Clan, Castle, Busho, Kunishu)
 * 修正: 国人衆の「name」機能追加と、CSVからの「大名用/国衆用」の外交値の読み取り機能を追加
 */

class Clan {
    constructor(data) {
        Object.assign(this, data);
        this.id = Number(this.id);
        this.leaderId = Number(this.leaderId);
        // data.color, data.name 等はCSVから自動で割り当たります

        // 外交データの初期化
        this.diplomacyValue = this.diplomacyValue || {};
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
        this.maxDefense = Number(data.maxDefense !== undefined ? data.maxDefense : this.defense);
        
        this.population = Number(this.population || 0);
        
        // 城の民忠を peoplesLoyalty に変更。CSV互換性のため古い loyalty も読めるようにしておく
        this.peoplesLoyalty = Number(data.peoplesLoyalty !== undefined ? data.peoplesLoyalty : (data.loyalty || 0));
        this.maxPeoplesLoyalty = Number(data.maxPeoplesLoyalty !== undefined ? data.maxPeoplesLoyalty : 100);
        delete this.loyalty;
        
        this.training = Number(this.training || 0);
        this.morale = Number(this.morale || 0);
        
        this.kokudaka = Number(this.kokudaka || 0);
        this.maxKokudaka = Number(data.maxKokudaka !== undefined ? data.maxKokudaka : this.kokudaka);
        
        this.commerce = Number(this.commerce || 0);
        this.maxCommerce = Number(data.maxCommerce !== undefined ? data.maxCommerce : this.commerce);
        
        this.ammo = Number(this.ammo || 0);
        this.horses = Number(this.horses || 0);
        this.guns = Number(this.guns || 0);

        // ロード時に既存データがあれば維持する
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
        
        if (this.name && this.name.includes('|')) {
            // 名前に「|」が含まれていたら、そこで真っ二つに切ります
            let names = this.name.split('|');
            this.familyName = names[0]; // 1つ目（姓）を familyName の箱へ
            this.givenName = names[1];  // 2つ目（名）を givenName の箱へ
            
            // これまでのプログラムが困らないように、繋げた名前を元の name の箱に戻します
            this.name = names[0] + names[1]; 
        } else {
            // もし「|」が入っていなかった時のお守りです
            this.familyName = this.name;
            this.givenName = "";
        }
        
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
        this.faceIcon = data.faceIcon || 'unknown_face.png';

        // 派閥・システム関連パラメータの初期化
        this.achievementTotal = Number(this.achievementTotal || 0); // 功績累計
        this.recognitionNeed = Number(this.recognitionNeed || 0);   // 承認欲求
        this.factionId = Number(this.factionId || 0);               // 派閥ID

        // 国人衆関連のパラメータ追加
        this.belongKunishuId = Number(this.belongKunishuId || 0);   // 所属する国人衆ID（0なら未所属）

        // 履歴配列の初期化
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
        if (this.belongKunishuId > 0 && this.id === (window.GameApp ? window.GameApp.kunishuSystem.getKunishu(this.belongKunishuId)?.leaderId : 0)) return "国衆頭領";
        if (this.belongKunishuId > 0) return "国人衆";
        if (this.status === 'ronin') return "浪人";
        return "武将";
    }

    getFactionName() {
        if (this.factionId === 0) return "中立";
        return "派閥" + this.factionId;
    }
}

// 国人衆クラス
class Kunishu {
    constructor(data) {
        Object.assign(this, data);
        this.id = Number(this.id);
        this.castleId = Number(this.castleId);
        this.leaderId = Number(this.leaderId);
        
        this.maxSoldiers = Number(this.maxSoldiers || 1500);
        this.soldiers = Number(this.soldiers !== undefined ? this.soldiers : this.maxSoldiers);
        
        this.maxDefense = Number(this.maxDefense || 500);
        this.defense = Number(this.defense !== undefined ? this.defense : this.maxDefense);
        
        this.ideology = this.ideology || '地縁'; 
        
        // ★修正: 友好度管理の箱を「大名用」と「国人衆用」に分けました
        this.daimyoRelations = {};
        this.kunishuRelations = {};
        
        // CSVの大名用データを翻訳して箱に入れる
        if (typeof data.daimyoRelations === 'string' && data.daimyoRelations.trim() !== "") {
            const parts = data.daimyoRelations.split(',');
            parts.forEach(part => {
                const items = part.split(':');
                if (items.length >= 2) {
                    const targetId = Number(items[0].trim());
                    const value = Number(items[1].trim());
                    if (!isNaN(targetId) && !isNaN(value)) this.daimyoRelations[targetId] = value;
                }
            });
        } else if (typeof data.daimyoRelations === 'object') {
            this.daimyoRelations = data.daimyoRelations;
        }

        // CSVの国人衆用データを翻訳して箱に入れる
        if (typeof data.kunishuRelations === 'string' && data.kunishuRelations.trim() !== "") {
            const parts = data.kunishuRelations.split(',');
            parts.forEach(part => {
                const items = part.split(':');
                if (items.length >= 2) {
                    const targetId = Number(items[0].trim());
                    const value = Number(items[1].trim());
                    if (!isNaN(targetId) && !isNaN(value)) this.kunishuRelations[targetId] = value;
                }
            });
        } else if (typeof data.kunishuRelations === 'object') {
            this.kunishuRelations = data.kunishuRelations;
        }
        
        this.isDestroyed = this.isDestroyed === true;
    }

    getName(game) {
        if (this.name && this.name.trim() !== "") {
            return this.name;
        }
        const leader = game.getBusho(this.leaderId);
        return leader ? `${leader.name}衆` : "国人衆";
    }

    // ★修正: 仲良し度を調べる機能（isKunishu が true なら国人衆、何もなければ大名を調べる）
    getRelation(targetId, isKunishu = false) {
        if (isKunishu) {
            return this.kunishuRelations[targetId] !== undefined ? this.kunishuRelations[targetId] : 50;
        } else {
            return this.daimyoRelations[targetId] !== undefined ? this.daimyoRelations[targetId] : 50;
        }
    }

    // ★修正: 仲良し度を書き込む機能
    setRelation(targetId, value, isKunishu = false) {
        if (isKunishu) {
            this.kunishuRelations[targetId] = Math.max(0, Math.min(100, value));
        } else {
            this.daimyoRelations[targetId] = Math.max(0, Math.min(100, value));
        }
    }
}