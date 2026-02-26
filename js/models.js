/**
 * models.js
 * モデル定義 (Clan, Castle, Busho, Kunishu)
 * 修正: 国人衆の「name」機能追加と、CSVからの「大名用/国人衆用」の外交値の読み取り機能を追加
 */

class Clan {
    constructor(data) {
        Object.assign(this, data);
        this.id = Number(this.id);
        this.leaderId = Number(this.leaderId);
        // data.color, data.name 等はCSVから自動で割り当たります

        // 外交データの初期化
        this.diplomacyValue = this.diplomacyValue || {};

        // CSVの initDiplomacy を翻訳して、外交の箱に入れます
        if (typeof data.initDiplomacy === 'string' && data.initDiplomacy.trim() !== "") {
            const parts = data.initDiplomacy.split('|');
            parts.forEach(part => {
                const items = part.split(':');
                if (items.length >= 3) {
                    const targetId = Number(items[0].trim());
                    const statusStr = items[1].trim();
                    const sentimentVal = Number(items[2].trim());
                    if (!isNaN(targetId) && !isNaN(sentimentVal)) {
                        this.diplomacyValue[targetId] = {
                            status: statusStr,
                            sentiment: sentimentVal
                        };
                    }
                }
            });
        }
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
        
        // 数値データの初期化（上限をセットする魔法を追加しました！）
        this.soldiers = Math.min(99999, Number(this.soldiers || 0));
        this.gold = Math.min(99999, Number(this.gold || 0));
        this.rice = Math.min(99999, Number(this.rice || 0));
        
        this.defense = Number(this.defense || 0);
        this.maxDefense = Number(data.maxDefense !== undefined ? data.maxDefense : this.defense);
        
        // 人口だけは上限が99万9999です
        this.population = Math.min(999999, Number(this.population || 0));
        
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
        
        this.ammo = Math.min(99999, Number(this.ammo || 0));
        this.horses = Math.min(99999, Number(this.horses || 0));
        this.guns = Math.min(99999, Number(this.guns || 0));

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
        
        // --- 名前（既存の処理） ---
        if (this.name && this.name.includes('|')) {
            let names = this.name.split('|');
            this.familyName = names[0];
            this.givenName = names[1];
            this.name = names[0] + names[1]; 
        } else {
            this.familyName = this.name;
            this.givenName = "";
        }
        
        // --- 能力値（既存の処理） ---
        this.leadership = Number(this.leadership || 0);
        this.strength = Number(this.strength || 0);
        this.politics = Number(this.politics || 0);
        this.diplomacy = Number(this.diplomacy || 0);
        this.intelligence = Number(this.intelligence || 0);
        this.charm = Number(this.charm || 0);

        // ★【ここから書き足し：兵科適性】
        // 何も入っていない（空っぽ）なら、最低ランクの 'E' を入れる設定です
        this.aptAshigaru = data.aptAshigaru || 'E'; // 足軽適性
        this.aptKiba = data.aptKiba || 'E';         // 騎馬適性
        this.aptTeppo = data.aptTeppo || 'E';       // 鉄砲適性

        // ★【ここから書き足し：生没年・登場年】
        // 数字として扱うために Number() で囲みます
        this.birthYear = Number(data.birthYear || 1500); // 生年（空なら1500）
        this.endYear = Number(data.endYear || 1650);     // 没年（空なら1650）
        this.startYear = Number(data.startYear || 1500); // 登場年（空なら1500）

        // ★【ここから書き足し：一門設定】
        // familyId が「1|2|3」のように届くので、使いやすいようにバラバラのリスト（配列）にします
        if (typeof data.familyId === 'string' && data.familyId.trim() !== "") {
            // 「|」で区切って、それぞれを数字に変換してリストにします
            this.familyIds = data.familyId.split('|').map(id => Number(id.trim()));
        } else {
            // 何もなければ、とりあえず 0 だけが入ったリストにします
            this.familyIds = [Number(data.familyId || 0)];
        }
        // ★追加：自分のIDも一門リストに入れておくことで、すれ違いを防ぎます！
        if (!this.familyIds.includes(this.id)) {
            this.familyIds.push(this.id);
        }
        
        // --- 忠誠・義理など（ここから下は既存の続き） ---
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
        this.isGunshi = this.isGunshi === true;
        this.status = this.status || 'active';
        this.isActionDone = this.isActionDone === true;
    }

    // UI表示用メソッド
    getRankName() {
        if (this.isDaimyo) return "大名";
        if (this.isCastellan) return "城主";
        if (this.isGunshi) return "軍師"; // ★これを書き足します！
        if (this.belongKunishuId > 0 && this.id === (window.GameApp ? window.GameApp.kunishuSystem.getKunishu(this.belongKunishuId)?.leaderId : 0)) return "頭領";
        if (this.belongKunishuId > 0) return "国衆";
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
            const parts = data.daimyoRelations.split('|'); // ★「,」ではなく「|」で区切るようにしました
            parts.forEach(part => {
                const items = part.split(':');
                if (items.length >= 3) { // ★ID、状態、関係値の3つがあるかチェックします
                    const targetId = Number(items[0].trim());
                    const statusStr = items[1].trim(); // 状態（友好など）
                    const value = Number(items[2].trim()); // 関係値
                    if (!isNaN(targetId) && !isNaN(value)) {
                        // 状態と関係値をセットにして箱にしまいます
                        this.daimyoRelations[targetId] = { status: statusStr, sentiment: value };
                    }
                }
            });
        } else if (typeof data.daimyoRelations === 'object') {
            this.daimyoRelations = data.daimyoRelations;
        }

        // CSVの国人衆用データを翻訳して箱に入れる
        if (typeof data.kunishuRelations === 'string' && data.kunishuRelations.trim() !== "") {
            const parts = data.kunishuRelations.split('|'); // ★こちらも「|」で区切ります
            parts.forEach(part => {
                const items = part.split(':');
                if (items.length >= 3) { // ★3つあるかチェック
                    const targetId = Number(items[0].trim());
                    const statusStr = items[1].trim();
                    const value = Number(items[2].trim());
                    if (!isNaN(targetId) && !isNaN(value)) {
                        this.kunishuRelations[targetId] = { status: statusStr, sentiment: value };
                    }
                }
            });
        } else if (typeof data.kunishuRelations === 'object') {
            this.kunishuRelations = data.kunishuRelations;
        }
        
        this.isDestroyed = this.isDestroyed === true;
    }
    
    getName(game) {
        // ① まず、CSVに名前が設定されているか確認して、あればそれを答えます
        if (this.name && this.name.trim() !== "") {
            return this.name;
        }
        // ② もし名前が空っぽなら、頭領の武将データを探します
        const leader = game.getBusho(this.leaderId);
        if (leader) {
            // 武将の名前（例：上杉|謙信）を「|」で割って、前の部分（上杉）だけを取ります
            const surname = leader.name.split('|')[0];
            return `${surname}衆`;
        }
        return "国人衆";
    }

    // ★修正: 仲良し度を調べる機能
    getRelation(targetId, isKunishu = false) {
        if (isKunishu) {
            // 箱の中の「sentiment（関係値）」だけを取り出して返します
            return this.kunishuRelations[targetId] !== undefined ? this.kunishuRelations[targetId].sentiment : 50;
        } else {
            return this.daimyoRelations[targetId] !== undefined ? this.daimyoRelations[targetId].sentiment : 50;
        }
    }

    // ★修正: 仲良し度を書き込む機能
    setRelation(targetId, value, isKunishu = false) {
        let newVal = Math.max(0, Math.min(100, value));
        if (isKunishu) {
            // まだデータがない相手なら、新しくセットを作ります
            if (!this.kunishuRelations[targetId]) this.kunishuRelations[targetId] = { status: '普通', sentiment: 50 };
            this.kunishuRelations[targetId].sentiment = newVal;
        } else {
            if (!this.daimyoRelations[targetId]) this.daimyoRelations[targetId] = { status: '普通', sentiment: 50 };
            this.daimyoRelations[targetId].sentiment = newVal;
        }
    }
}