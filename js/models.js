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
        
        // ★元々の大名家の名前を覚える箱を用意します（同名被り回避用）
        this.baseName = data.baseName || data.name || "";
        
        // ★大名家の読み仮名を覚える箱を用意します
        this.yomi = data.yomi || "";
        this.baseYomi = data.baseYomi || data.yomi || "";

        // ★追加：大名家が滅亡したかどうかの印を覚える箱を用意します
        this.isDestroyed = data.isDestroyed === true;

        // 外交データの初期化
        this.diplomacyValue = this.diplomacyValue || {};
        
        // 大名の戦力（威信）を覚えておく箱です
        this.daimyoPrestige = Number(data.daimyoPrestige || 0);

        // ★朝廷への貢献度を覚えておく箱です（上限は99999にします）
        this.courtContribution = Number(data.courtContribution || 0);
        
        // ★朝廷からの信用を覚えておく箱です（上限は1000にします）
        this.courtTrust = Number(data.courtTrust || 0);
        
        // ★今回追加：今月の外交相手（ターゲット）を覚えておくための箱です！
        this.currentDiplomacyTarget = null;
        
        // ★姫のID（出席番号）だけをリスト（配列）で覚えておく箱です
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

                        // ★「イベント」という文字が含まれていたらイベントシールのフラグを立てます。
                        let isEvent = false;
                        if (statusStr.includes('イベント')) {
                            isEvent = true;
                            // 「イベント」の文字を取り除きます
                            statusStr = statusStr.replace('イベント', '');
                        }
                        
                        // ★「婚姻」という文字が含まれていたら結婚シールを貼ります。
                        // 同盟の場合は婚姻、従属・支配は従属婚姻・支配婚姻と記述
                        let isMarriage = false;
                        if (statusStr.includes('婚姻')) {
                            isMarriage = true;
                            // 「婚姻」の文字を取り除きます（「従属婚姻」なら「従属」だけが残ります）
                            statusStr = statusStr.replace('婚姻', '');
                        }
                        
                        // もし単に「婚姻」や「イベント」とだけ書かれていて空っぽになったら、今まで通り基本の「同盟」にします
                        if (statusStr === '') {
                            statusStr = '同盟';
                        }

                        this.diplomacyValue[targetId] = {
                            status: statusStr,
                            sentiment: sentimentVal,
                            trucePeriod: trucePeriod,
                            isMarriage: isMarriage,
                            isEvent: isEvent, // ★追加：イベントによる関係かを覚える箱
                            hostageIds: [], // ★新しく人質の出席番号リスト（配列）を追加します
                            subordinateMonths: 0 // ★追加：従属・支配関係の継続月数を覚える箱
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
        this.sortNo = Number(data.sortNo || 0);
        this.yomi = data.yomi || "";
        this.ownerClan = Number(this.ownerClan);
        this.castellanId = Number(this.castellanId);
        this.provinceId = Number(this.provinceId || 0); // ★ここを追加！地方の出席番号を覚えるスペースです
        
        // ★今回追加：道だけでなく「海路」かどうかを覚える新しい箱を作ります
        this.adjacentCastleIds = [];
        this.seaRouteIds = []; 
        
        if (data.adjacentCastleIds && Array.isArray(data.adjacentCastleIds)) {
            // ★超重要な修正：昔のデータが「文字の"17"」だった場合、「数字の17」に直して箱に入れます！
            // こうしないと、文字と数字が別物扱いされて線が引かれないバグが起きます
            this.adjacentCastleIds = data.adjacentCastleIds.map(id => Number(id));
            
            if (Array.isArray(data.seaRouteIds)) {
                this.seaRouteIds = data.seaRouteIds.map(id => Number(id));
            }
        }

        // CSVから届いた文字があれば、海路の「s」を見逃さないように必ずチェックします！
        if (typeof data.adjacentCastle === 'string' && data.adjacentCastle.trim() !== "") {
            // CSVから「2|94s|10」のような文字で届いたら、１つずつ確認します
            const parts = data.adjacentCastle.split('|');
            parts.forEach(part => {
                const cleanPart = part.trim();
                if (cleanPart === "") return;
                
                // 「s」が含まれているかチェックします（大文字の「S」でも大丈夫なようにします）
                const isSea = cleanPart.toLowerCase().includes('s');
                // 「s」を取り除いて、純粋な数字だけにします
                const id = parseInt(cleanPart, 10);
                
                if (!isNaN(id)) {
                    // もしまだ普通の「繋がっているお城リスト」に入っていなければ、追加します
                    if (!this.adjacentCastleIds.includes(id)) {
                        this.adjacentCastleIds.push(id);
                    }
                    // 「s」がついていて、まだ「海路リスト」に入っていなければ追加します
                    if (isSea && !this.seaRouteIds.includes(id)) {
                        this.seaRouteIds.push(id);
                    }
                }
            });
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
        this.maxTraining = Number(data.maxTraining !== undefined ? data.maxTraining : 100);

        this.morale = Number(this.morale || 0);
        const defaultMaxMorale = (window.WarParams && window.WarParams.Military && window.WarParams.Military.MaxMoraleBase) ? window.WarParams.Military.MaxMoraleBase : 120;
        this.maxMorale = Number(data.maxMorale !== undefined ? data.maxMorale : defaultMaxMorale);
        
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
        
        // ★委任されているかどうかを覚える箱（軍団IDが0以外なら自動で委任状態）
        Object.defineProperty(this, 'isDelegated', {
            get: function() { return this.legionId > 0; },
            set: function(val) { /* 何もしない（エラー防止用） */ }
        });

        // ★委任中の細かい許可設定（移動と城攻めは一旦すべて許可）
        Object.defineProperty(this, 'allowAttack', {
            get: function() { return true; },
            set: function(val) { /* 何もしない */ }
        });
        Object.defineProperty(this, 'allowMove', {
            get: function() { return true; },
            set: function(val) { /* 何もしない */ }
        });

        // ★一揆や豪雪などの「状態異常」のシールを複数貼っておくための箱です
        this.statusEffects = Array.isArray(data.statusEffects) ? data.statusEffects : [];
        
        // ★ここから追加：攻撃された時の記憶を残すための箱です
        this.lastAttackedOwnerId = Number(data.lastAttackedOwnerId || 0); // 攻撃された時に誰の城だったか
        this.lastAttackerClanId = Number(data.lastAttackerClanId || 0);   // 攻撃してきた勢力のID
        this.lastAttackerIsKunishu = data.lastAttackerIsKunishu === true; // 攻撃してきたのが諸勢力かどうか

        // ★今回追加：どの軍団に所属しているか（0は直轄、1～8が各軍団）
        this.legionId = Number(data.legionId || 0);

        // ★追加：毎月の兵糧取引上限
        this.tradeLimit = Number(data.tradeLimit || 0);
    }

    // ★追加：自勢力の道が繋がっているお城をまとめて洗い出す共通の魔法です！
    getConnectedCastles(game) {
        const connectedCastles = new Set();
        const queue = [this];
        connectedCastles.add(Number(this.id));

        while (queue.length > 0) {
            const current = queue.shift();
            const neighbors = game.castles.filter(adj => 
                Number(adj.ownerClan) === Number(this.ownerClan) && 
                GameSystem.isAdjacent(current, adj) &&
                !connectedCastles.has(Number(adj.id))
            );
            for (const n of neighbors) {
                connectedCastles.add(Number(n.id));
                queue.push(n);
            }
        }
        return connectedCastles;
    }
}

class Busho {
    constructor(data) {
        Object.assign(this, data);
        this.id = Number(this.id);
        this.clan = Number(this.clan);
        this.castleId = Number(this.castleId);
        
        // --- 名前と読み仮名の処理 ---
        if (this.name && this.name.includes('|')) {
            // CSVなどから「織田|信長」の形式で読み込んだ時の処理です
            let names = this.name.split('|');
            this.familyName = names[0];
            this.givenName = names[1];
            this.name = names[0] + names[1]; 
        } else if (!this.familyName) {
            // セーブデータから読み込んだ時はすでに「familyName（姓）」を持っているので、
            // 空っぽの時だけフルネームを入れるようにして上書きを防ぎます
            this.familyName = this.name;
            this.givenName = "";
        }

        // 新しく読み仮名（yomi）も同じように処理する仕組みを足します！
        if (this.yomi && this.yomi.includes('|')) {
            // 「おだ|のぶなが」を姓と名に分けます
            let yomis = this.yomi.split('|');
            this.familyYomi = yomis[0];
            this.givenYomi = yomis[1];
            this.yomi = yomis[0] + yomis[1]; // 「おだのぶなが」のように繋げたものも覚えます
        } else if (!this.familyYomi) {
            // yomiが空っぽだったり、| が無い場合の安全策です
            this.familyYomi = this.yomi || "";
            this.givenYomi = "";
            this.yomi = this.yomi || "";
        }
        
        // --- 能力値と経験値の処理 ---
        // 1. 古いセーブデータやCSVから読み込んだ基本の能力値を「_」付きの秘密の箱に入れます
        this._leadership = Number(data._leadership !== undefined ? data._leadership : (data.leadership || 0));
        this._strength = Number(data._strength !== undefined ? data._strength : (data.strength || 0));
        this._politics = Number(data._politics !== undefined ? data._politics : (data.politics || 0));
        this._diplomacy = Number(data._diplomacy !== undefined ? data._diplomacy : (data.diplomacy || 0));
        this._intelligence = Number(data._intelligence !== undefined ? data._intelligence : (data.intelligence || 0));
        this.charm = Number(data.charm || 0); // 魅力は経験値を持たないのでそのままにします

        // 2. 新しく用意した「経験値」の箱です。最初は0が入ります
        this.expLeadership = Number(data.expLeadership || 0);
        this.expStrength = Number(data.expStrength || 0);
        this.expPolitics = Number(data.expPolitics || 0);
        this.expDiplomacy = Number(data.expDiplomacy || 0);
        this.expIntelligence = Number(data.expIntelligence || 0);

        // ★【ここから書き足し：能力の基礎値】
        // 全盛期の能力を覚える箱。古い箱や秘密の箱から数字をもらいます
        this.baseLeadership = Number(data.baseLeadership !== undefined ? data.baseLeadership : this._leadership);
        this.baseStrength = Number(data.baseStrength !== undefined ? data.baseStrength : this._strength);
        this.basePolitics = Number(data.basePolitics !== undefined ? data.basePolitics : this._politics);
        this.baseDiplomacy = Number(data.baseDiplomacy !== undefined ? data.baseDiplomacy : this._diplomacy);
        this.baseIntelligence = Number(data.baseIntelligence !== undefined ? data.baseIntelligence : this._intelligence);

        // 3. Object.assignのせいで勝手に作られてしまった古い名前の箱を、綺麗にお掃除します
        // （これをしないと、後で作る自動計算の仕組みがうまく動きません）
        delete this.leadership;
        delete this.strength;
        delete this.politics;
        delete this.diplomacy;
        delete this.intelligence;

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
        
        // ★【生没年・登場年】
        // 数字として扱うために Number() で囲みます
        this.birthYear = Number(data.birthYear || 1500); // 生年（空なら1500）
        this.endYear = Number(data.endYear || 1650);     // 没年（空なら1650）
        this.startYear = Number(data.startYear || 1500); // 登場年（空なら1500）

        // ★追加：本来の没年（初期データ）をメモしておきます
        this.originalEndYear = Number(data.endYear || 1650);

        this.nameChange = data.nameChange || ""; // 変わる年:新しい名前:新しい読み仮名/変わる年... の形式の改名データ

        // ★【ここから書き足し：討死武将の延命処理】
        // CSVから討死フラグを受け取ってシールを貼ります（TRUEなら true になります）
        this.isKilledInBattle = data.isKilledInBattle === true;

        // ★追加1：セーブデータ読み込み時に「何度も寿命が延びてしまうバグ」を防ぐためのシールです
        this.isLifeExtended = data.isLifeExtended === true;

        // ★追加2：今のシナリオの「開始年」をゲームの設定から取得します
        const currentStartYear = (window.MainParams && window.MainParams.StartYear) ? window.MainParams.StartYear : 1560;
        
        // ★絶対防壁：いかなる場合も、初期endYearがシナリオ開始年未満（1560年スタートなら1559以下）の武将は絶対に登場させません！
        if (!this.isLifeExtended && this.originalEndYear < currentStartYear) {
            this.isKilledInBattle = false; // 延命フラグを強制的に折ります
            this.status = 'dead'; // 強制的に死亡状態にしてお城に入れないようにします
        }
        // もし討死フラグがあり、まだ延命処理がされておらず、かつ「ゲーム開始時点でまだ生きている（没年が開始年以上）」場合のみ寿命を書き換えます！
        else if (this.isKilledInBattle && !this.isLifeExtended && this.endYear >= currentStartYear) {
            // まず、本来死ぬはずだった時の年齢を計算します（没年 - 生年）
            const originalDeathAge = this.endYear - this.birthYear;
            
            // 分岐の基準を「45歳」にします
            if (originalDeathAge < 45) {
                // 本来45歳未満で死ぬはずだった場合は、「55歳まで生きる」ように没年を上書きします
                this.endYear = this.birthYear + 55;
            } else {
                // 本来45歳以上生きるはずだった場合は、元の寿命に「10年」を足して上書きします
                this.endYear = this.endYear + 10;
            }

            // 延命処理が無事に終わった印をつけます
            this.isLifeExtended = true;
        }
        
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

        // ★【ここから書き足し：実父母・養父・養子の設定】
        // 新しく実父と実母の出席番号を覚える箱を用意します
        this.realFatherId = Number(data.realFatherId || 0);
        this.realMotherId = Number(data.realMotherId || 0);

        // 養父（お父さん）の出席番号を覚えておきます
        this.adoptiveFatherId = Number(data.adoptiveFatherId || data.adoptiveFather || 0);

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
        
        // ★【ここから書き足し：宿敵の設定（タイマー付きに進化）】
        // 宿敵（敵対する武将）の出席番号と、怒りが収まるまでの「タイマー（月数）」をセットで覚えておくための箱です
        this.nemesisList = [];

        // セーブデータから読み込んだ時（すでに新しいタイマー付きの箱がある場合）
        if (data.nemesisList && Array.isArray(data.nemesisList)) {
            this.nemesisList = data.nemesisList;
        } 
        // 古いセーブデータ（タイマー無しの昔の箱）が残っている場合
        else if (data.nemesisIds && Array.isArray(data.nemesisIds)) {
            data.nemesisIds.forEach(id => {
                if (id > 0) {
                    this.nemesisList.push({ id: Number(id), count: 60 }); // デフォルトの60ヶ月をセットします
                }
            });
        } 
        // CSVなどから「1:30|2」のような文字で届いた場合
        else if (typeof data.nemesis === 'string' && data.nemesis.trim() !== "") {
            const parts = String(data.nemesis).split('|');
            parts.forEach(part => {
                // 「:」があるか確認して、左側（出席番号）と右側（期間）に切り分けます
                const items = part.split(':');
                const id = Number(items[0].trim());
                
                if (!isNaN(id) && id > 0) {
                    // もし「:」の右側に期間が書いてあればその数字を、書いてなければ基本の「60」を使います
                    let count = 60;
                    if (items.length >= 2) {
                        const parsedCount = Number(items[1].trim());
                        // ちゃんと数字として読み取れた場合だけ、その数字を採用します
                        if (!isNaN(parsedCount) && parsedCount > 0) {
                            count = parsedCount;
                        }
                    }
                    this.nemesisList.push({ id: id, count: count });
                }
            });
        }
        // 数字が1つだけ入っていた場合
        else if (Number(data.nemesis) > 0) {
            this.nemesisList.push({ id: Number(data.nemesis), count: 60 });
        }

        // ★他のシステムが今まで通り「数字だけのリスト」を探しに来てもエラーにならないように、
        // タイマー無しのIDだけのリストも自動で作っておきます！
        this.nemesisIds = this.nemesisList.map(n => n.id);

        // --- 忠誠・義理など（ここから下は既存の続き） ---
        this.loyalty = Number(this.loyalty || 0);
        this.duty = Number(this.duty || 0);
        this.ambition = Number(this.ambition || 0);
        this.affinity = Number(this.affinity || 0);
        this.innovation = Number(this.innovation || 50);
        this.cooperation = Number(this.cooperation || 50);

        // 顔画像ファイル名 (例: "nobunaga.png")。未設定なら null または undefined
        // ★修正：「通常顔|daimyo:大名顔」のような設定を読み取れるようにします！
        if (data.faceChange !== undefined) {
            // セーブデータから読み込んだ場合はそのまま使います
            this.faceIcon = data.faceIcon || 'unknown_face.webp';
            this.faceChange = data.faceChange || "";
        } else if (data.faceIcon && typeof data.faceIcon === 'string' && data.faceIcon.includes('|')) {
            // CSVから「|」区切りで読み込んだ場合、分割して箱に入れます
            const parts = data.faceIcon.split('|');
            this.faceIcon = parts[0].trim() || 'unknown_face.webp';
            this.faceChange = parts[1].trim();
        } else {
            // 今まで通りの普通のデータの場合
            this.faceIcon = data.faceIcon || 'unknown_face.webp';
            this.faceChange = "";
        }

        // 派閥・システム関連パラメータの初期化
        this.achievementTotal = Number(this.achievementTotal || 0); // 功績累計
        this.recognitionNeed = Number(this.recognitionNeed || 0);   // 承認欲求
        this.factionId = Number(this.factionId || 0);               // 派閥ID
        
        // ★ここに追加：派閥の「方針」と「思想」を覚えておくための箱です！
        this.factionSeikaku = this.factionSeikaku || "無所属";
        this.factionHoshin = this.factionHoshin || "無所属";
        this.factionName = this.factionName || "";
        this.factionYomi = this.factionYomi || "";

        // ★今回追加：軍師としての「秘密の番号（タネ）」を覚えておく箱です！
        this.gunshiSeed = Number(data.gunshiSeed || 0);

        // 諸勢力関連のパラメータ追加
        this.belongKunishuId = Number(this.belongKunishuId || 0);   // 所属する諸勢力ID（0なら未所属）

        // ★人質システムの追加
        // 元々の所属（実家）を覚える箱です。最初は今の所属と同じにします。
        this.originalClanId = Number(data.originalClanId || data.clan || 0);
        // 今人質として働いているかどうかのシールです。デフォルトは「いいえ(false)」です。
        this.isHostage = data.isHostage === true;

        // 履歴配列の初期化
        this.battleHistory = Array.isArray(this.battleHistory) ? this.battleHistory : [];
        this.stayHistory = Array.isArray(this.stayHistory) ? this.stayHistory : [];

        // ステータスフラグ
        this.isDaimyo = this.isDaimyo === true;
        this.isCastellan = this.isCastellan === true;
        this.isGunshi = this.isGunshi === true;
        this.isCommander = this.isCommander === true;
        this.isRetired = data.isRetired === true;
        this.status = this.status || 'active';
        this.isActionDone = this.isActionDone === true;

        // ★追加：今月面談を行ったかどうかを覚える専用の枠です
        this.isInterviewed = data.isInterviewed === true;

        // ★ここを書き足し！：自動生成された頭領かどうかの「秘密のシール」を貼る専用の枠です！
        this.isAutoLeader = data.isAutoLeader === true;

        // ★今回追加：引抜や離間計を仕掛けてきた勢力の出席番号を覚えるための箱です！
        this.lastApproachedClanId = Number(data.lastApproachedClanId || 0);

        // ★追加：最後に褒美をもらった月（ターンID）を覚える箱です！
        this.lastRewardedTurnId = Number(data.lastRewardedTurnId || 0);

        // ★追加：野戦で重傷を負った（死亡フラグが立った）かを覚える箱です！
        this.deathFlag = data.deathFlag === true;
    }

    // ★新しく追加：武将自身のデータには軍団IDを持たせず、今いる「お城」のデータを覗きに行く魔法です！
    // こうしておけば、お城の軍団が変われば武将の軍団も自動で変わるので、間違いが起きません。
    get legionId() {
        // もしお城のデータが見つからなかったら、とりあえず「0（直轄）」と答えます
        if (!window.GameApp || !window.GameApp.castles) return 0;
        const castle = window.GameApp.castles.find(c => c.id === this.castleId);
        return castle ? castle.legionId : 0;
    }

    // ==========================================
    // ★能力値と経験値の成長ルールを「1箇所にまとめる」司令塔の魔法
    // ==========================================
    _getMaxBonus(baseVal) {
        // 基礎値が90未満なら最大+30、90以上なら最大+20 というルールをここにまとめます！
        // 将来ルールを変えたい時は、ここだけを書き換えればOKです。
        return baseVal < 90 ? 30 : 20;
    }

    _calculateStat(statKey, expKey) {
        const baseVal = this['_' + statKey] || 0;
        const currentExp = this[expKey] || 0;
        
        // 司令塔から「最大でどれくらい上がるか」のルールを聞き出します
        const maxBonus = this._getMaxBonus(baseVal);
        
        // 実際の成長量（経験値を100で割った数。ただし最大値は超えないようにします）
        const bonus = Math.min(maxBonus, Math.floor(currentExp / 100));
        
        // 能力値の限界値（基礎値100なら最大120など）
        const maxLimit = baseVal < 90 ? 110 : 120;
        
        return Math.min(maxLimit, baseVal + bonus);
    }

    // ==========================================
    // ★能力値の自動計算（ゲッター・セッター）
    // 誰かが「leadershipはいくつ？」と聞いた時は、計算用の魔法を呼び出すだけで済ませます。
    // ==========================================
    get leadership() { return this._calculateStat('leadership', 'expLeadership'); }
    get strength() { return this._calculateStat('strength', 'expStrength'); }
    get politics() { return this._calculateStat('politics', 'expPolitics'); }
    get diplomacy() { return this._calculateStat('diplomacy', 'expDiplomacy'); }
    get intelligence() { return this._calculateStat('intelligence', 'expIntelligence'); }

    // 逆に、年齢の変化などで「leadershipを80にして！」と命令された時は、秘密の箱だけにその数字をしまいます。
    set leadership(val) { this._leadership = val; }
    set strength(val) { this._strength = val; }
    set politics(val) { this._politics = val; }
    set diplomacy(val) { this._diplomacy = val; }
    set intelligence(val) { this._intelligence = val; }

    // ==========================================
    // ★経験値の進行度やカンスト状態を計算する魔法
    // これも司令塔のルール（_getMaxBonus）を使って計算します。
    // ==========================================
    getExpInfo(statKey) {
        const expKeys = {
            'leadership': 'expLeadership',
            'strength': 'expStrength',
            'politics': 'expPolitics',
            'diplomacy': 'expDiplomacy',
            'intelligence': 'expIntelligence'
        };
        const expKey = expKeys[statKey];

        // 経験値がない能力（魅力など）の場合は空っぽを返します
        if (!expKey || typeof this[expKey] !== 'number') {
            return null; 
        }

        const baseVal = this['_' + statKey] || 0;
        
        // ★司令塔から「最大＋いくつ？」を聞き出して、それを100倍して最大経験値（3000など）を割り出します！
        const maxExp = this._getMaxBonus(baseVal) * 100;
        const currentExp = this[expKey];

        if (currentExp >= maxExp) {
            return { percent: 100, isMax: true };
        } else {
            return { percent: currentExp % 100, isMax: false };
        }
    }
    // ==========================================
    
    // UI表示用メソッド
    getRankName() {
        if (this.status === 'unborn') {
            if (this.isNotBorn) return "出生前"; // ★フラグが立っていれば「出生前」と表示
            return "元服前";
        }
        if (this.isDaimyo) return "大名";
        if (this.isGunshi) return "軍師";
        if (this.isRetired) return "隠居";
        
        // 国主のシールを持っているか、軍団の名簿に載っているか、両方チェックします！
        const isLegionCommander = this.isCommander || (window.GameApp && window.GameApp.legions && window.GameApp.legions.some(l => l.commanderId === this.id));
        if (this.status === 'active' && isLegionCommander) return "国主";
        
        if (this.isCastellan) return "城主";
        if (this.belongKunishuId > 0 && this.id === (window.GameApp ? window.GameApp.kunishuSystem.getKunishu(this.belongKunishuId)?.leaderId : 0)) return "頭領";
        if (this.belongKunishuId > 0) return "諸勢力";
        if (this.status === 'ronin') return "浪人";
        return "武将";
    }
    getFactionName() {
        if (this.factionId === 0) return "中立";
        return "派閥" + this.factionId;
    }

    getSalary(daimyo) {
        if (this.isCastellan) return 0;
        if (this.isDaimyo) return 0;
        
        if (daimyo) {
            const isDirectFamily = this.familyIds.some(fId => daimyo.familyIds.includes(fId));
            if (isDirectFamily) return 0;
        }

        const baseSalary = 5;
        const ambitionBonus = Math.floor((this.ambition || 0) / 10);
        const bonus = Math.floor((this.achievementTotal || 0) / 30);
        
        return baseSalary + ambitionBonus + bonus;
    }

    // ★奥さんが増えたり減ったりした時に、一門リストを作り直す機能
    // 修正：お母さんの実家を引き継ぐために、引数に "姫の名簿" を追加しました
    updateFamilyIds(bushos = [], princesses = []) {
        // ★安全対策：他のシステムから呼ばれた時に名簿がなければ、ゲーム本体から借ります！
        if (bushos.length === 0 && window.GameApp) bushos = window.GameApp.bushos;
        if (princesses.length === 0 && window.GameApp) princesses = window.GameApp.princesses;

        // まずは普段使う用のリストに、金庫（baseFamilyIds）の中身を丸写しします
        this.familyIds = [...this.baseFamilyIds];
        
        // ★実父・実母・養父が設定されていて、まだリストに入っていなければ全員追加します！
        const parentIds = [this.realFatherId, this.realMotherId, this.adoptiveFatherId];
        parentIds.forEach(pId => {
            if (pId > 0 && !this.familyIds.includes(pId)) {
                this.familyIds.push(pId);
            }
        });

        const allPeople = [...bushos, ...princesses];

        // ★今回追加：実母の親戚（一門）を、自分にだけ「一方通行」でコピーします！
        if (this.realMotherId > 0) {
            const mother = allPeople.find(p => p.id === this.realMotherId);
            if (mother && mother.baseFamilyIds) {
                mother.baseFamilyIds.forEach(fId => {
                    if (!this.familyIds.includes(fId)) {
                        this.familyIds.push(fId);
                    }
                });
            }
        }

        // 次に、自分の奥さんリスト（ID）を順番に見ていきます
        this.wifeIds.forEach(wId => {
            // 姫の名簿から、奥さんのデータを探します
            const wifeData = princesses.find(p => p.id === wId);
            if (wifeData && wifeData.baseFamilyIds) {
                // 奥さんが持っている「一門リスト」を一方通行でコピーします！
                wifeData.baseFamilyIds.forEach(fId => {
                    if (!this.familyIds.includes(fId)) {
                        this.familyIds.push(fId);
                    }
                });
            }
        });

        // ★今回追加：自分の娘（実の娘、または養女）や、実姉妹の「お婿さん（夫）」を、自分の一門（familyIds）として迎え入れます！
        // これにより、お婿さんが自勢力にいる場合、優先的に大名の後継ぎになれる（直系として機能する）ようになります！
        princesses.forEach(p => {
            // 1. 自分の娘（実娘・養女）がお嫁にいっている場合
            const isMyDaughter = (p.realFatherId === this.id || p.adoptiveFatherId === this.id);
            if (isMyDaughter && p.status === 'married' && p.husbandId > 0) {
                if (!this.familyIds.includes(p.husbandId)) {
                    this.familyIds.push(p.husbandId);
                }
            }

            // 2. 自分の姉妹がお嫁にいっている場合
            // （実父が同じお姫様で、自分自身とは異なるIDの場合）
            if (this.realFatherId > 0 && this.realFatherId === p.realFatherId && p.id !== this.id) {
                if (p.status === 'married' && p.husbandId > 0) {
                    if (!this.familyIds.includes(p.husbandId)) {
                        this.familyIds.push(p.husbandId);
                    }
                }
            }
        });
    }
}

// ★姫クラス
class Princess {
    constructor(data) {
        Object.assign(this, data);
        this.id = Number(this.id);
        this.name = data.name || "姫";
        this.yomi = data.yomi || "";
        this.birthYear = Number(this.birthYear || 1500);
        
        // ★今回追加：登場年、没年、顔画像
        this.startYear = Number(this.startYear || 1500); // 登場年
        this.endYear = Number(this.endYear || 1650);     // 没年
        this.faceIcon = data.faceIcon || 'unknown_princess_face.webp'; // 姫用の汎用画像
        
        this.originalClanId = Number(this.originalClanId || 0); // 生まれた大名家のID
        
        this.realFatherId = Number(data.realFatherId || data.fatherId || 0); 
        this.realMotherId = Number(data.realMotherId || data.motherId || 0);
        this.adoptiveFatherId = Number(data.adoptiveFatherId || 0);
        
        // ★ゲーム中にコロコロ変わるデータ（最初は実家と同じにしておきます）
        this.currentClanId = Number(data.currentClanId !== undefined ? data.currentClanId : this.originalClanId);
        this.husbandId = Number(this.husbandId || 0); // 夫の武将ID
        
        // 状態（unmarried:未婚, married:既婚, unborn:登場前, dead:死亡 など）
        this.status = data.status || 'unmarried';     

        // ★ここから追加：一門設定
        this.baseFamilyIds = [];
        if (data.baseFamilyIds && Array.isArray(data.baseFamilyIds)) {
            this.baseFamilyIds = data.baseFamilyIds;
        } else if (data.familyIds && Array.isArray(data.familyIds)) {
            this.baseFamilyIds = data.familyIds;
        } else if (typeof data.familyId === 'string' && data.familyId.trim() !== "") {
            this.baseFamilyIds = String(data.familyId).split('|').map(id => Number(id.trim()));
        } else if (Number(data.familyId) > 0) {
            this.baseFamilyIds = [Number(data.familyId)];
        }
        
        if (!this.baseFamilyIds.includes(this.id)) {
            this.baseFamilyIds.push(this.id);
        }

        this.familyIds = [...this.baseFamilyIds];
    }

    // ★追加：父親や夫の一門を反映させる機能
    updateFamilyIds(bushos = [], princesses = []) {
        // ★安全対策
        if (bushos.length === 0 && window.GameApp) bushos = window.GameApp.bushos;
        if (princesses.length === 0 && window.GameApp) princesses = window.GameApp.princesses;

        this.familyIds = [...this.baseFamilyIds];

        // 実父・実母・養父のリストを作って、順番に確認します
        const parentIds = [this.realFatherId, this.realMotherId, this.adoptiveFatherId];
        
        parentIds.forEach(pId => {
            if (pId > 0 && !this.familyIds.includes(pId)) {
                this.familyIds.push(pId);
            }
        });

        const allPeople = [...bushos, ...princesses];

        // ★今回追加：実母の親戚（一門）を、自分にだけ「一方通行」でコピーします！
        if (this.realMotherId > 0) {
            const mother = allPeople.find(p => p.id === this.realMotherId);
            if (mother && mother.baseFamilyIds) {
                mother.baseFamilyIds.forEach(fId => {
                    if (!this.familyIds.includes(fId)) {
                        this.familyIds.push(fId);
                    }
                });
            }
        }

        // 夫の一門を追加（夫がいる間だけ追加する）
        if (this.husbandId > 0) {
            const husband = bushos.find(b => b.id === this.husbandId);
            if (husband && husband.baseFamilyIds) {
                husband.baseFamilyIds.forEach(fId => {
                    if (!this.familyIds.includes(fId)) {
                        this.familyIds.push(fId);
                    }
                });
            }
        }
    }
}

// 諸勢力クラス
class Kunishu {
    constructor(data) {
        Object.assign(this, data);
        this.id = Number(this.id);
        
        // ★諸勢力の読み仮名を覚える箱を追加します
        this.yomi = data.yomi || "";
        
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
        
        // ★友好度管理の箱です
        this.daimyoRelations = {};
        
        // CSVの大名用データを翻訳して箱に入れる
        if (typeof data.daimyoRelations === 'string' && data.daimyoRelations.trim() !== "") {
            const parts = data.daimyoRelations.split('|');
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
        
        this.isDestroyed = data.isDestroyed === true;
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

    // ★修正: 仲良し度を調べる機能（大名用の箱だけを見ます）
    getRelation(targetId) {
        return this.daimyoRelations[targetId] !== undefined ? this.daimyoRelations[targetId].sentiment : 50;
    }

    // ★修正: 仲良し度を書き込む機能（傭兵ボーナス追加）
    setRelation(targetId, value) {
        // 今の友好度を調べて、どれくらい増減するのか計算します
        let currentVal = this.getRelation(targetId);
        let diff = value - currentVal;
        
        // 傭兵で、かつ友好度が増える時だけ、増える量を1.2倍にします！
        if (this.ideology === '傭兵' && diff > 0) {
            diff = diff * 1.2;
            value = currentVal + diff;
        }
        
        let newVal = Math.max(0, Math.min(100, value));
        
        // ★友好度の数値に合わせて、状態（status）の文字も自動で切り替える魔法です！
        let newStatus = '普通';
        if (newVal >= 70) {
            newStatus = '友好';
        } else if (newVal <= 30) {
            newStatus = '敵対';
        }

        if (!this.daimyoRelations[targetId]) this.daimyoRelations[targetId] = { status: '普通', sentiment: 50 };
        this.daimyoRelations[targetId].sentiment = newVal;
        this.daimyoRelations[targetId].status = newStatus; // ★状態も更新します
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

// 地方（Province）クラス
class Province {
    constructor(data) {
        Object.assign(this, data);
        
        // ★CSVから読み込んだデータを、確実な形にして箱にしまいます
        this.id = Number(this.id || 0);             // 国の出席番号（例：23）
        this.sortNo = Number(data.sortNo || 0);
        this.province = data.province || "";        // 国の名前（例：尾張国）
        this.provinceYomi = data.provinceYomi || "";
        this.regionId = Number(this.regionId || 0); // 地方の出席番号（例：5）
        this.region = data.region || "";            // 地方の名前（例：東海）
        this.regionYomi = data.regionYomi || "";
        this.color_code = data.color_code || "";    // マップ用の色（例：#ff5d00）
        this.typhoon = Number(this.typhoon || 0);   // 台風の発生確率（例：0.15）
        this.marketRate = data.marketRate !== undefined ? Number(data.marketRate) : 1.0; // 国ごとの米相場（例：1.0）
        this.statusEffects = Array.isArray(data.statusEffects) ? data.statusEffects : []; // ★豊作・凶作などの「状態異常」
    }
}

// ★全員のデータが揃った後に、親と子の一門リストをガッチャンコする魔法
class FamilyLinker {
    // ★今回追加：ゲーム全体の一門関係を、正しい順番で一気に完成させる司令塔（窓口）です！
    static rebuildAllFamilyIds(bushos, princesses = []) {
        // 1. まずは男系（実父・養父）の絶対的な繋がりである「金庫（baseFamilyIds）」を完成させます
        this.linkAdoptiveRelations(bushos, princesses);
        
        // 2. 次に、姫の個人の繋がり（母方の実家や、夫の繋がり）を個別にコピーさせます
        princesses.forEach(p => p.updateFamilyIds(bushos, princesses));
        
        // 3. 最後に、武将の個人の繋がり（母方の実家、妻の実家、娘婿や義弟）をコピーさせます
        // ※武将が娘婿を認識するためには「姫のデータが完成している」必要があるので、一番最後に実行します！
        bushos.forEach(b => b.updateFamilyIds(bushos, princesses));
    }

    static linkAdoptiveRelations(bushos, princesses = []) {
        const allPeople = [...bushos, ...princesses];
        
        allPeople.forEach(b => {
            // ★家と家が完全に混ざらないように、「実父」と「養父」の男系の繋がりだけで金庫を作ります！
            // （実母の繋がりは後で個人のリストにだけ一方通行でコピーさせます）
            const parentIds = [b.realFatherId, b.adoptiveFatherId];
            parentIds.forEach(pId => {
                if (pId > 0) {
                    // ★直接「金庫（baseFamilyIds）」に書き込みます
                    if (!b.baseFamilyIds.includes(pId)) {
                        b.baseFamilyIds.push(pId);
                    }
                    // 全員の名簿から親を探します
                    let parent = allPeople.find(p => p.id === pId);

                    if (parent && parent.baseFamilyIds) {
                        // 親の金庫にも自分の番号を入れます
                        if (!parent.baseFamilyIds.includes(b.id)) {
                            parent.baseFamilyIds.push(b.id);
                        }
                    }
                }
            });
        });

        let changed = true;
        while (changed) {
            changed = false;
            // ★武将と姫、両方の名簿を合わせた「全員の名簿」を作って親戚を探します！
            allPeople.forEach(person => {
                let currentFamilySet = new Set([...person.baseFamilyIds]);
                let originalSize = currentFamilySet.size;

                person.baseFamilyIds.forEach(fId => {
                    const relative = allPeople.find(r => r.id === fId);
                    if (relative && relative.baseFamilyIds) {
                        relative.baseFamilyIds.forEach(id => {
                            currentFamilySet.add(id);
                        });
                    }
                });

                if (currentFamilySet.size > originalSize) {
                    person.baseFamilyIds = Array.from(currentFamilySet);
                    changed = true;
                }
            });
        }
    }
}

// ★軍団（Legion）クラスを新しく追加しました！
class Legion {
    constructor(data) {
        Object.assign(this, data);
        
        // 軍団の出席番号（ゲーム全体で重ならない固有のID）
        this.id = Number(this.id || 0);
        // どの大名家に所属している軍団か
        this.clanId = Number(this.clanId || 0);
        // その大名家の中で第何席次か？（0は直轄。1〜8）
        this.legionNo = Number(this.legionNo || 1);
        
        // ★ここを修正：CSVの一番右端の項目は、見えない「改行マーク」がくっついて迷子になりやすいです！
        // なので、色々なパターンの名前で探しに行って、確実に出席番号を見つけ出します。
        const foundCommanderId = data.commanderId || data['commanderId\r'] || data['commanderId\n'] || this.commanderId || 0;
        // 国主を任されている武将の出席番号
        this.commanderId = Number(foundCommanderId);
    }
}