/**
 * models.js
 * モデル定義 (Clan, Castle, Busho, Kunishu)
 * 修正: 諸勢力の「name」機能追加と、CSVからの「大名用/諸勢力用」の外交値の読み取り機能を追加
 */

class Clan {
    constructor(data) {
        Object.assign(this, data);
        this.id = Number(this.id);
        this.leaderId = Number(this.leaderId);
        // data.color, data.name 等はCSVから自動で割り当たります

        // 外交データの初期化
        this.diplomacyValue = this.diplomacyValue || {};
        
        // 大名の戦力（威信）を覚えておく箱です
        this.daimyoPrestige = Number(data.daimyoPrestige || 0);

        // ★今回追加：朝廷への貢献度を覚えておく箱です（上限は99999にします）
        this.courtContribution = Number(data.courtContribution || 0);
        
        // ★今回追加：朝廷からの信用を覚えておく箱です（上限は1000にします）
        this.courtTrust = Number(data.courtTrust || 0);
        
        // ★今回変更：姫のID（出席番号）だけをリスト（配列）で覚えておく箱です
        this.princessIds = [];
        if (data.princessIds && Array.isArray(data.princessIds)) {
            // セーブデータから読み込んだ場合
            this.princessIds = data.princessIds;
        } else if (typeof data.princess === 'string' && data.princess.trim() !== "") {
            // CSVから「1|2|5」のように届いた文字を、数字のリストにします
            this.princessIds = String(data.princess).split('|').map(id => Number(id.trim()));
        } else if (Number(data.princess) > 0) {
            // 数字が1つだけ入っていた場合
            this.princessIds = [Number(data.princess)];
        }
        
        // 大名自身が持っていた官位の仕組みは、武将の機能にお引っ越ししたため削除しました！
        
        // ★ここから書き足し：セーブデータから読み込んだ時は、すでに外交の箱に中身が入っているので、上書きしないようにガードします！
        const hasSavedDiplomacy = data.diplomacyValue && Object.keys(data.diplomacyValue).length > 0;

        // CSVの initDiplomacy を翻訳して、外交の箱に入れます（新規ゲームの時だけ！）
        if (!hasSavedDiplomacy && typeof data.initDiplomacy === 'string' && data.initDiplomacy.trim() !== "") {
            const parts = data.initDiplomacy.split('|');
            parts.forEach(part => {
                const items = part.split(':');
                if (items.length >= 3) {
                    const targetId = Number(items[0].trim());
                    let statusStr = items[1].trim();
                    const sentimentVal = Number(items[2].trim());
                    if (!isNaN(targetId) && !isNaN(sentimentVal)) {
                        // ★ここから追加：和睦の期間を記録する箱を用意します
                        let trucePeriod = 0;
                        if (statusStr.startsWith('和睦')) {
                            // 「和睦6」の「和睦」という文字だけ消して、数字の「6」を取り出します
                            const periodStr = statusStr.replace('和睦', '');
                            if (periodStr !== '') {
                                trucePeriod = Number(periodStr);
                            }
                            // 状態の名前は「和睦」という文字だけに揃えます
                            statusStr = '和睦';
                        }
                        
                        this.diplomacyValue[targetId] = {
                            status: statusStr,
                            sentiment: sentimentVal,
                            trucePeriod: trucePeriod, // ★取り出した期間も一緒にメモしておきます
                            isMarriage: false // ★今回追加：結婚で結ばれた同盟かどうかのシールです（最初は貼ってない状態）
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
        this.provinceId = Number(this.provinceId || 0); // ★ここを追加！地方の出席番号を覚えるスペースです
        if (data.adjacentCastleIds && Array.isArray(data.adjacentCastleIds)) {
            // セーブデータから読み込んだ時はそのまま使います
            this.adjacentCastleIds = data.adjacentCastleIds;
        } else if (typeof data.adjacentCastle === 'string' && data.adjacentCastle.trim() !== "") {
            // CSVから「2|3|10」のような文字で届いたら、「|」で区切って数字のリストに変身させます！
            this.adjacentCastleIds = data.adjacentCastle.split('|').map(id => Number(id.trim()));
        } else {
            // 何も書かれていなかったら空っぽのリストにしておきます
            this.adjacentCastleIds = [];
        }
        this.castlesColorCode = data.castlesColorCode || "";
        
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
        
        // ★前回書き足し：委任されているかどうかを覚える箱（最初はfalse＝直轄）
        this.isDelegated = data.isDelegated === true;

        // ★今回書き足し！：委任中の細かい許可設定（デフォルトは false ＝ 不可）
        this.allowAttack = data.allowAttack === true;
        this.allowMove = data.allowMove === true;

        // ★今回新しく追加！：一揆や豪雪などの「状態異常」のシールを複数貼っておくための箱です
        this.statusEffects = Array.isArray(data.statusEffects) ? data.statusEffects : [];
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

        // ★【ここから書き足し：能力の基礎値】
        // 年齢によって能力が下がっても、元の「全盛期の能力」を忘れないように箱に入れておきます！
        this.baseLeadership = Number(data.baseLeadership !== undefined ? data.baseLeadership : this.leadership);
        this.baseStrength = Number(data.baseStrength !== undefined ? data.baseStrength : this.strength);
        this.basePolitics = Number(data.basePolitics !== undefined ? data.basePolitics : this.politics);
        this.baseDiplomacy = Number(data.baseDiplomacy !== undefined ? data.baseDiplomacy : this.diplomacy);
        this.baseIntelligence = Number(data.baseIntelligence !== undefined ? data.baseIntelligence : this.intelligence);

        // ★【ここから書き足し：兵科適性】
        // 何も入っていない（空っぽ）なら、最低ランクの 'E' を入れる設定です
        this.aptAshigaru = data.aptAshigaru || 'E'; // 足軽適性
        this.aptKiba = data.aptKiba || 'E';         // 騎馬適性
        this.aptTeppo = data.aptTeppo || 'E';       // 鉄砲適性

        // ★【ここから書き足し：官位】
        if (data.courtRankIds && Array.isArray(data.courtRankIds)) {
            // セーブデータから読み込んだ時は、すでにリストになっているのでそのまま使います！
            this.courtRankIds = data.courtRankIds;
        } else if (data.courtRank !== undefined && data.courtRank !== null && String(data.courtRank).trim() !== "") {
            // CSVから読み込んだ時は、「1|2」のような文字を区切ってリストにします
            this.courtRankIds = String(data.courtRank).split('|').map(id => Number(id.trim()));
        } else {
            this.courtRankIds = []; // 何も持っていなければ空っぽのリストにします
        }
        // ★【ここから書き足し：生没年・登場年】
        // 数字として扱うために Number() で囲みます
        this.birthYear = Number(data.birthYear || 1500); // 生年（空なら1500）
        this.endYear = Number(data.endYear || 1650);     // 没年（空なら1650）
        this.startYear = Number(data.startYear || 1500); // 登場年（空なら1500）
        this.nameChange = data.nameChange || ""; // 年:姓:名|年:姓:名... の形式の改名データ
        
        // ★【ここから書き足し：奥さん（姫）の設定】
        // 姫の「ID（出席番号）」だけを覚えておきます
        this.wifeIds = [];
        if (data.wifeIds && Array.isArray(data.wifeIds)) {
            this.wifeIds = data.wifeIds;
        } else if (typeof data.wife === 'string' && data.wife.trim() !== "") {
            // CSVから「1|2」で届いた文字を数字のリストにします
            this.wifeIds = String(data.wife).split('|').map(id => Number(id.trim()));
        } else if (Number(data.wife) > 0) {
            this.wifeIds = [Number(data.wife)];
        }

        // ★【ここから書き足し：一門設定（修正版）】
        if (data.baseFamilyIds && Array.isArray(data.baseFamilyIds)) {
            this.baseFamilyIds = data.baseFamilyIds;
        } else if (data.familyIds && Array.isArray(data.familyIds)) {
            this.baseFamilyIds = data.familyIds;
        } else if (typeof data.familyId === 'string' && data.familyId.trim() !== "") {
            this.baseFamilyIds = String(data.familyId).split('|').map(id => Number(id.trim()));
        } else if (Number(data.familyId) > 0) {
            this.baseFamilyIds = [Number(data.familyId)];
        } else {
            this.baseFamilyIds = [];
        }
        
        if (!this.baseFamilyIds.includes(this.id)) {
            this.baseFamilyIds.push(this.id);
        }

        // 血縁リストと奥さんリストを合体させる機能は、後で姫の名簿を読み込んでから呼び出します！
        this.familyIds = [...this.baseFamilyIds];
        
        // --- 忠誠・義理など（ここから下は既存の続き） ---
        this.loyalty = Number(this.loyalty || 0);
        this.duty = Number(this.duty || 0);
        this.ambition = Number(this.ambition || 0);
        this.affinity = Number(this.affinity || 0);
        this.innovation = Number(this.innovation || 50);
        this.cooperation = Number(this.cooperation || 50);

        // 顔画像ファイル名 (例: "nobunaga.png")。未設定なら null または undefined
        this.faceIcon = data.faceIcon || 'unknown_face.webp';

        // 派閥・システム関連パラメータの初期化
        this.achievementTotal = Number(this.achievementTotal || 0); // 功績累計
        this.recognitionNeed = Number(this.recognitionNeed || 0);   // 承認欲求
        this.factionId = Number(this.factionId || 0);               // 派閥ID
        
        // ★ここに追加：派閥の「方針」と「思想」を覚えておくための箱です！
        this.factionSeikaku = this.factionSeikaku || "無所属";
        this.factionHoshin = this.factionHoshin || "無所属";

        // ★今回追加：軍師としての「秘密の番号（タネ）」を覚えておく箱です！
        this.gunshiSeed = Number(data.gunshiSeed || 0);

        // 諸勢力関連のパラメータ追加
        this.belongKunishuId = Number(this.belongKunishuId || 0);   // 所属する諸勢力ID（0なら未所属）

        // 履歴配列の初期化
        this.battleHistory = Array.isArray(this.battleHistory) ? this.battleHistory : [];
        this.stayHistory = Array.isArray(this.stayHistory) ? this.stayHistory : [];

        // ステータスフラグ
        this.isDaimyo = this.isDaimyo === true;
        this.isCastellan = this.isCastellan === true;
        this.isGunshi = this.isGunshi === true;
        this.status = this.status || 'active';
        this.isActionDone = this.isActionDone === true;

        // ★ここを書き足し！：自動生成された頭領かどうかの「秘密のシール」を貼る専用の枠です！
        this.isAutoLeader = data.isAutoLeader === true;
    }

    // UI表示用メソッド
    getRankName() {
        if (this.status === 'unborn') {
            if (this.clan === 0) return "登場前:浪人";
            return "登場前:仕官";
        }
        if (this.isDaimyo) return "大名";
        if (this.isCastellan) return "城主";
        if (this.isGunshi) return "軍師";
        if (this.belongKunishuId > 0 && this.id === (window.GameApp ? window.GameApp.kunishuSystem.getKunishu(this.belongKunishuId)?.leaderId : 0)) return "頭領";
        if (this.belongKunishuId > 0) return "諸勢力";
        if (this.status === 'ronin') return "浪人";
        return "武将";
    }
    getFactionName() {
        if (this.factionId === 0) return "中立";
        return "派閥" + this.factionId;
    }

    // ★新しく書き足す魔法の機能：奥さんが増えたり減ったりした時に、一門リストを作り直す機能です
    // 今回から「姫全員の名簿（princesses）」を渡してもらうようにしました
    updateFamilyIds(princesses = []) {
        // まずは普段使う用のリストに、金庫（baseFamilyIds）の中身を丸写しします
        this.familyIds = [...this.baseFamilyIds];
        
        // 次に、自分の奥さんリスト（ID）を順番に見ていきます
        this.wifeIds.forEach(wId => {
            // 姫の名簿から、奥さんのデータを探します
            const wifeData = princesses.find(p => p.id === wId);
            // 奥さんのデータが見つかって、そのお父さんのIDがまだリストに入っていなければ追加します！
            if (wifeData && !this.familyIds.includes(wifeData.fatherId)) {
                this.familyIds.push(wifeData.fatherId);
            }
        });
    }
}

// ★新しく追加：姫クラス
class Princess {
    constructor(data) {
        Object.assign(this, data);
        this.id = Number(this.id);
        this.name = data.name || "姫";
        this.birthYear = Number(this.birthYear || 1500);
        
        // ★今回追加：登場年、没年、顔画像
        this.startYear = Number(this.startYear || 1500); // 登場年
        this.endYear = Number(this.endYear || 1650);     // 没年
        this.faceIcon = this.faceIcon || 'unknown_face.webp'; // 姫用の汎用画像があればその名前に変えてもOKです
        
        this.originalClanId = Number(this.originalClanId || 0); // 生まれた大名家のID
        this.fatherId = Number(this.fatherId || 0);             // 父親（武将）のID
        
        // ★ゲーム中にコロコロ変わるデータ（最初は実家と同じにしておきます）
        this.currentClanId = Number(data.currentClanId !== undefined ? data.currentClanId : this.originalClanId);
        this.husbandId = Number(this.husbandId || 0); // 夫の武将ID
        
        // 状態（unmarried:未婚, married:既婚, unborn:登場前, dead:死亡 など）
        this.status = data.status || 'unmarried';     
    }
}

// 諸勢力クラス
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
        
        // ★追加: 馬と鉄砲のステータス
        this.maxHorses = Number(this.maxHorses || 300);
        this.horses = Number(this.horses !== undefined ? this.horses : this.maxHorses);
        
        this.maxGuns = Number(this.maxGuns || 100);
        this.guns = Number(this.guns !== undefined ? this.guns : this.maxGuns);

        // ★今回追加：訓練度（training）と士気（morale）のステータス
        this.defaultTraining = Number(data.defaultTraining !== undefined ? data.defaultTraining : (data.training !== undefined ? data.training : 50));
        this.training = Number(this.training !== undefined ? this.training : this.defaultTraining);

        this.defaultMorale = Number(data.defaultMorale !== undefined ? data.defaultMorale : (data.morale !== undefined ? data.morale : 50));
        this.morale = Number(this.morale !== undefined ? this.morale : this.defaultMorale);
        
        this.ideology = this.ideology || '地縁';
        
        // ★修正: 友好度管理の箱を「大名用」と「諸勢力用」に分けました
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

        // CSVの諸勢力用データを翻訳して箱に入れる
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
        return "諸勢力";
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

    // ★修正: 仲良し度を書き込む機能（傭兵ボーナス追加）
    setRelation(targetId, value, isKunishu = false) {
        // 今の友好度を調べて、どれくらい増減するのか計算します
        let currentVal = this.getRelation(targetId, isKunishu);
        let diff = value - currentVal;
        
        // 傭兵で、かつ友好度が増える時だけ、増える量を1.2倍にします！
        if (this.ideology === '傭兵' && diff > 0) {
            diff = diff * 1.2;
            value = currentVal + diff;
        }
        
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

// 官位クラス
class CourtRank {
    constructor(data) {
        Object.assign(this, data);
        this.id = Number(this.id);
        this.rankNo = Number(this.rankNo);
        this.necessaryPrestige = Number(this.necessaryPrestige);
        this.gainPrestige = Number(this.gainPrestige);
    }
}

// ★新しく追加：地方（Province）クラス
class Province {
    constructor(data) {
        Object.assign(this, data);
        
        // ★CSVから読み込んだデータを、確実な形にして箱にしまいます
        this.id = Number(this.id || 0);             // 国の出席番号（例：23）
        this.province = data.province || "";        // 国の名前（例：尾張国）
        this.regionId = Number(this.regionId || 0); // 地方の出席番号（例：5）
        this.region = data.region || "";            // 地方の名前（例：東海）
        this.color_code = data.color_code || "";    // マップ用の色（例：#ff5d00）
        this.typhoon = Number(this.typhoon || 0);   // 台風の発生確率（例：0.15）
        this.marketRate = data.marketRate !== undefined ? Number(data.marketRate) : 1.0; // 国ごとの米相場（例：1.0）
        this.statusEffects = Array.isArray(data.statusEffects) ? data.statusEffects : []; // ★豊作・凶作などの「状態異常」
    }
}