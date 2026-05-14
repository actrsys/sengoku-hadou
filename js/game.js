/**
 * game.js
 * 戦国シミュレーションゲーム (Main / Data / System)
 * UIManagerは ui.js に移動しました。
 */

window.onerror = function(message, source, lineno, colno, error) {
    console.error("Global Error:", message, "Line:", lineno);
    return false;
};

/* ==========================================================================
   ★ シナリオ定義 & 設定
   ========================================================================== */
const SCENARIOS = [
    { name: "1560年 桶狭間の戦い", desc: "海道一の弓取り・今川義元が大軍で上洛を狙う。", folder: "1560_okehazama", startYear: 1560, startMonth: 4 }//,
    // { name: "1562年 清洲同盟", desc: "桶狭間より２年。２人の英雄は清州の地にて再会を果たす。", folder: "1562_kiyosudoumei", startYear: 1562, startMonth: 1 }
];

window.MainParams = {
    StartYear: 1560, StartMonth: 4,
    System: { UseRandomNames: true },
    Economy: {
        IncomeGoldRate: 1,IncomeRiceRate: 10.0, IncomeFluctuation: 0.15,
        ConsumeRicePerSoldier: 0.03, ConsumeGoldPerBusho: 10,
        BaseDevelopment: 10, PoliticsEffect: 0.6, DevelopFluctuation: 0.15,
        BaseRepair: 20, RepairEffect: 0.6, RepairFluctuation: 0.15,
        BaseCharity: 10, CharmEffect: 0.4, CharityFluctuation: 0.15,
        TradeRateMin: 0.7, TradeRateMax: 1.8, TradeFluctuation: 0.3,
        PriceAmmo: 1, PriceHorse: 2, PriceGun: 5
    },
    Strategy: {
        InvestigateDifficulty: 50, InciteFactor: 150, RumorFactor: 50, SchemeSuccessRate: 0.25, EmploymentDiff: 1.5,
        HeadhuntBaseDiff: 50, HeadhuntGoldEffect: 0.01, HeadhuntGoldMaxEffect: 15,
        HeadhuntIntWeight: 0.8, HeadhuntLoyaltyWeight: 1.0, HeadhuntDutyWeight: 0.8,
        RewardBaseEffect: 10, RewardGoldFactor: 0.1, RewardDistancePenalty: 0.2,
        AffinityLordWeight: 0.5, AffinityNewLordWeight: 0.6, AffinityDoerWeight: 0.4
    }
};

/* ==========================================================================
    データ管理 (DataManager)
   ========================================================================== */
class DataManager {
    static genericNames = { surnames: [], names: [] };
    // ★追加：汎用の姫の名前を入れる箱を用意します！
    static genericPrincessNames = [];
    
    static async loadAll(folderName) {
        const selectedScenario = SCENARIOS.find(s => s.folder === folderName);
        if (selectedScenario) {
            window.MainParams.StartYear = selectedScenario.startYear;
            window.MainParams.StartMonth = selectedScenario.startMonth;
        }
        const path = `./data/scenarios/${folderName}/`;
        try {
            await this.loadParameters("./data/parameter.csv");
            if (window.MainParams.System.UseRandomNames) {
                try {
                    const namesText = await this.fetchText("./data/generic_officer.csv");
                    this.parseGenericNames(namesText);
                } catch (e) { console.warn("汎用武将名ファイルなし"); }
                
                // ★ここから追加：generic_princess.csv を読み込む魔法です！
                try {
                    const princessNamesText = await this.fetchText("./data/generic_princess.csv");
                    this.parseGenericPrincessNames(princessNamesText);
                } catch (e) { console.warn("汎用姫名ファイルなし"); }
            }
            // ★今回追加：princess.csv と legions.csv も一緒に読み込むようにリストに加えます！
            const [clansText, castlesText, bushosText, kunishusText, courtRanksText, princessesText, provincesText, legionsText] = await Promise.all([                
                this.fetchText(path + "clans.csv"),                
                this.fetchText(path + "castles.csv"),                
                this.fetchText(path + "warriors.csv"),
                this.fetchText(path + "kunishuClan.csv").catch(() => ""),
                this.fetchText("./data/imperialCourtRank.csv").catch(() => ""),
                this.fetchText(path + "princess.csv").catch(() => ""), 
                this.fetchText("./data/provinces_map.csv").catch(() => ""),
                this.fetchText(path + "legions.csv").catch(() => "") // ★軍団データを読み込みます（なければ空文字）
            ]);
            const clans = this.parseCSV(clansText, Clan);
            const castles = this.parseCSV(castlesText, Castle);
            const bushos = this.parseCSV(bushosText, Busho);
            const kunishus = kunishusText ? this.parseCSV(kunishusText, Kunishu) : [];
            const courtRanks = courtRanksText ? this.parseCSV(courtRanksText, CourtRank) : [];
            const princesses = princessesText ? this.parseCSV(princessesText, Princess) : [];
            const provinces = provincesText ? this.parseCSV(provincesText, Province) : [];
            // ★新しく作った軍団クラス（器）に流し込みます
            const legions = legionsText ? this.parseCSV(legionsText, Legion) : [];
            
            // ★準備係（joinData）に、軍団の名簿も一緒に渡して初期設定を行います
            this.joinData(clans, castles, bushos, princesses, legions);
            if (bushos.length < 50) this.generateGenericBushos(bushos, castles, clans);
            
            try {
                await this.loadColorMap('./data/images/map/japan_colorcode_map.png', castles);
            } catch (e) {
                console.log("マップ画像の解析をスキップしました");
            }

            try {
                await this.loadProvinceMap('./data/images/map/japan_provinces.png');
            } catch (e) {
                console.log("地方マップ画像の解析をスキップしました");
            }

            // ★完成した全データをゲーム本体に返します！
            return { clans, castles, bushos, kunishus, courtRanks, princesses, provinces, legions, mapWidth: this.mapImageWidth, mapHeight: this.mapImageHeight };
        } catch (error) {
            console.error(error);
            alert(`データの読み込みに失敗しました。\nフォルダ構成を確認してください。`);
            throw error;
        }
    }
    static async loadParameters(url) {
        try {
            const text = await this.fetchText(url);
            const lines = text.split('\n').map(l => l.trim()).filter(l => l);
            for (let i = 1; i < lines.length; i++) {
                const parts = lines[i].split(',');
                if (parts.length < 2) continue;
                const key = parts[0].trim();
                let val = parts[1].trim();
                if (val.toLowerCase() === 'true') val = true;
                else if (val.toLowerCase() === 'false') val = false;
                else if (!isNaN(Number(val))) val = Number(val);
                this.setSettingValue(key, val);
            }
        } catch (e) { console.warn("parameter.csv default"); }
    }
    static setSettingValue(keyPath, value) {
        const keys = keyPath.split('.');
        const category = keys[0];
        
        let targetObj = null;
        if (category === "Military" || category === "War") {
            if (window.WarParams) targetObj = window.WarParams;
        } else if (category === "AI") {
            if (window.AIParams) targetObj = window.AIParams;
        } else {
            targetObj = window.MainParams;
        }

        if (!targetObj) return;

        let current = targetObj;
        for (let i = 0; i < keys.length - 1; i++) {
            if (!current[keys[i]]) current[keys[i]] = {};
            current = current[keys[i]];
        }
        current[keys[keys.length - 1]] = value;
    }
    static async fetchText(url) {
        // ★ここから追加した魔法です！
        // 「Date.now()」を使って、今この瞬間の「時間」の数字を作ります。
        // それをURLの最後にくっつけることで、ブラウザに「これは新しいファイルだよ！」と信じ込ませます。
        const mark = url.includes('?') ? '&v=' : '?v=';
        const noCacheUrl = url + mark + Date.now();
        
        // 元々は fetch(url) だったところを、おまじない付きの fetch(noCacheUrl) に変えています！
        const response = await fetch(noCacheUrl);
        
        if (!response.ok) throw new Error(`Failed to load ${url}`);
        let text = await response.text();
        if (text.charCodeAt(0) === 0xFEFF) {
            text = text.slice(1);
        }
        return text;
    }
    
    // ★ゲーム開始時の状態を作る魔法です！（今回から軍団の名簿も受け取ります）
    static joinData(clans, castles, bushos, princesses = [], legions = []) {
        const startYear = window.MainParams.StartYear; // 今のシナリオの開始年（例：1560年）
        
        castles.forEach(c => c.samuraiIds = []);
        bushos.forEach(b => {
            // ==========================================
            // ★ゲーム開始時点で「すでに改名しているはず」の武将の名前と読み仮名を変えておく魔法です！
            if (b.nameChange) {
                const changes = b.nameChange.split('/');
                let latestYear = -1;
                let latestFamilyName = "";
                let latestGivenName = "";
                let latestFamilyYomi = "";
                let latestGivenYomi = "";

                for (const change of changes) {
                    const parts = change.split(':');
                    if (parts.length === 3) {
                        const targetYear = Number(parts[0].trim());
                        // ゲーム開始年「以前」か「同じ年」に起きた改名イベントの中で、一番新しいものを探します
                        if (targetYear <= startYear && targetYear > latestYear) {
                            latestYear = targetYear;
                            
                            // 新しい名前を「|」で姓と名に分けます
                            const newNameParts = parts[1].trim().split('|');
                            latestFamilyName = newNameParts[0] === "0" ? (latestFamilyName || b.familyName) : (newNameParts[0] || ""); 
                            latestGivenName = newNameParts[1] === "0" ? (latestGivenName || b.givenName) : (newNameParts[1] || "");  
                            
                            // 新しい読み仮名も「|」で姓と名に分けます
                            const newYomiParts = parts[2].trim().split('|');
                            latestFamilyYomi = newYomiParts[0] === "0" ? (latestFamilyYomi || b.familyYomi) : (newYomiParts[0] || ""); 
                            latestGivenYomi = newYomiParts[1] === "0" ? (latestGivenYomi || b.givenYomi) : (newYomiParts[1] || "");  
                        }
                    }
                }

                // もし改名データが見つかったら、最初からその名前と読み仮名にしておきます！
                if (latestYear !== -1) {
                    b.familyName = latestFamilyName;
                    b.givenName = latestGivenName;
                    b.name = latestFamilyName + latestGivenName;
                    
                    b.familyYomi = latestFamilyYomi;
                    b.givenYomi = latestGivenYomi;
                    b.yomi = latestFamilyYomi + latestGivenYomi;
                }
            }
            
            // ★ゲーム開始時点で既に寿命を迎えている（昔に亡くなっている）、またはダミー用（startYearが9999）武将の処理です！
            if (b.endYear < startYear || b.startYear === 9999) {
                b.status = 'dead'; // 「死亡」の印をつけます
                b.isDaimyo = false;
                b.isCastellan = false;
                // 既に亡くなっているか、ダミーの人物なので、お城の中には入れません！
            }
            
            // もし武将の「登場年」が「開始年」よりも未来だったら…（まだ生まれてない、または元服前）
            else if (b.startYear > startYear) {
                b.status = 'unborn'; // 「未登場」の印をつけます
                // ここにあった「b.clan = 0;」を消しました！元々の所属データを残します！
                b.isDaimyo = false;
                b.isCastellan = false;
                // まだ登場していないので、お城の中には入れません！
            } else {
                    // 既に登場している武将は、いつも通りの準備をします
                    const clan = clans.find(cl => Number(cl.leaderId) === Number(b.id));
                    if (clan) {
                        b.isDaimyo = true;
                        b.loyalty = 100; // ★大名は自分の家なので、忠誠度は絶対に100にします！
                        
                        // ★ここから追加：開始時点で既に大名なら、「daimyo:」の改名を適用します！
                        if (b.nameChange && b.nameChange.includes('daimyo:')) {
                            const changes = b.nameChange.split('/');
                            for (const change of changes) {
                                const parts = change.split(':');
                                if (parts.length === 3 && parts[0].trim() === 'daimyo') {
                                    const newNameParts = parts[1].trim().split('|');
                                    b.familyName = newNameParts[0] === "0" ? b.familyName : (newNameParts[0] || ""); 
                                    b.givenName = newNameParts[1] === "0" ? b.givenName : (newNameParts[1] || "");  
                                    b.name = b.familyName + b.givenName;
                                    
                                    const newYomiParts = parts[2].trim().split('|');
                                    b.familyYomi = newYomiParts[0] === "0" ? b.familyYomi : (newYomiParts[0] || ""); 
                                    b.givenYomi = newYomiParts[1] === "0" ? b.givenYomi : (newYomiParts[1] || "");  
                                    b.yomi = b.familyYomi + b.givenYomi;
                                }
                            }
                        }

                        // ★開始時点で既に大名なら、「daimyo:」の顔変更データを適用します！
                        if (b.faceChange && b.faceChange.startsWith('daimyo:')) {
                            const newFace = b.faceChange.split(':')[1].trim();
                            if (newFace) {
                                b.faceIcon = newFace;
                            }
                        }
                        
                        // ★大名の名前が変わっていたら、大名家の名前も自動で「〇〇家」に合わせます！
                        clan.name = b.familyName + "家";
                        clan.baseName = clan.name; // ★元々の名前の箱にも入れておきます！
                    }
                    const castleAsCastellan = castles.find(cs => Number(cs.castellanId) === Number(b.id));
                if (castleAsCastellan) b.isCastellan = true;
                
                if (b.clan === 0 && (b.belongKunishuId || 0) === 0) {
                    b.status = 'ronin';
                    b.loyalty = 50; // ★浪人の場合も、ゲーム開始時に忠誠度を50にしておきます！
                } else {
                    b.status = 'active'; // 明確に「活動中」にします
                }
                
                // お城の中に武将を入れてあげます
                const c = castles.find(castle => Number(castle.id) === Number(b.castleId));
                if(c) c.samuraiIds.push(b.id);
            }

            // ★今回追加：ゲーム開始の瞬間に、姫の名簿を使って「武将の一門関係（血の繋がり）」を繋ぎます！
            b.updateFamilyIds(princesses);
            
            // ★今回追加：軍師の設定
            if (b.clan !== 0) {
                const clan = clans.find(cl => cl.id === b.clan);
                if (clan && Number(clan.gunshiId) === Number(b.id)) {
                    b.isGunshi = true;
                }
            }
        });

        // ★今回追加：姫自身にも一門情報（父親・夫）を持たせます！
        princesses.forEach(p => {
            p.updateFamilyIds(bushos);
        });

        // ★ここから軍団の初期設定です！
        legions.forEach(legion => {
            // 軍団長に就任する武将を探します
            const commander = bushos.find(b => b.id === legion.commanderId);
            if (commander) {
                // ★ここを書き足し！：軍団長（国主）のシールをしっかり貼ります！
                commander.isCommander = true;

                // ★修正：武将本人ではなく、その武将がいる「お城」に軍団番号を書き込みます
                const castle = castles.find(c => c.id === commander.castleId);
                if (castle) {
                    castle.legionId = legion.legionNo;
                }
            }

            // この軍団に所属するはずのお城を探してシールを貼ります
            castles.forEach(c => {
                // CSVなどでお城側に直接legionIdが書かれていない場合の保険として、
                // 軍団長のいるお城と同じ軍団にするなどの処理も可能ですが、
                // まずは「お城が主体」でデータを管理する形に整えました。
                if (c.ownerClan === legion.clanId) {
                    // 必要に応じて、ここでお城の所属軍団を決定するロジックを書き足せます
                }
            });
        });
    }
    
    static parseCSV(text, ModelClass) {
        const lines = text.split('\n').map(l => l.trim()).filter(l => l);
        if (lines.length === 0) return [];
        
        const headers = lines[0].split(',').map(h => {
            let val = h.trim();
            if (val.charCodeAt(0) === 0xFEFF) val = val.slice(1);
            if (val.startsWith('"') && val.endsWith('"')) val = val.slice(1, -1);
            return val;
        });

        const result = [];
        for (let i = 1; i < lines.length; i++) {
            const values = lines[i].split(',');
            if(values.length < headers.length) continue;
            
            const data = {};
            headers.forEach((header, index) => {
                let val = values[index];
                if (val !== undefined) {
                    val = val.trim();
                    if (val.startsWith('"') && val.endsWith('"')) val = val.slice(1, -1);
                    
                    if (!isNaN(Number(val)) && val !== "") val = Number(val);
                    if (val === "true" || val === "TRUE") val = true;
                    if (val === "false" || val === "FALSE") val = false;
                }
                data[header] = val;
            });
            result.push(new ModelClass(data));
        }
        return result;
    }
    static parseGenericNames(text) {
        const lines = text.split('\n').map(l => l.trim()).filter(l => l);
        if (lines.length < 2) return;
        for (let i = 1; i < lines.length; i++) {
            const [surname, name] = lines[i].split(',');
            if (surname) this.genericNames.surnames.push(surname.trim());
            if (name) this.genericNames.names.push(name.trim());
        }
    }

    // ★ここから追加：読み込んだ generic_princess.csv の文字を、名前のリストに翻訳する魔法です！
    static parseGenericPrincessNames(text) {
        // 読み込んだ文字を1行ずつバラバラにして、整理します
        const lines = text.split('\n').map(l => l.trim()).filter(l => l);
        if (lines.length < 2) return; // 1行目（見出し）しかなければ終わります
        
        // 2行目から順番に名前を読み取っていきます
        for (let i = 1; i < lines.length; i++) {
            // カンマ（,）で区切られている場合は、最初の項目を名前として受け取ります
            const name = lines[i].split(',')[0];
            if (name) {
                // 用意しておいた汎用姫のリストに名前を書き込みます
                this.genericPrincessNames.push(name.trim());
            }
        }
    }

    static generateGenericBushos(bushos, castles, clans) {
        let idCounter = 90000;
        const personalities = ['aggressive', 'cautious', 'balanced'];
        const useRandom = window.MainParams.System.UseRandomNames && this.genericNames.surnames.length > 0;
        clans.forEach(clan => {
            const clanCastles = castles.filter(c => Number(c.ownerClan) === Number(clan.id));
            if(clanCastles.length === 0) return;
            for(let i=0; i<3; i++) {
                const castle = clanCastles[Math.floor(Math.random() * clanCastles.length)];
                const p = personalities[Math.floor(Math.random() * personalities.length)];
                let bName = `武将|${String.fromCharCode(65+i)}`;
                if (useRandom) {
                    const s = this.genericNames.surnames[Math.floor(Math.random() * this.genericNames.surnames.length)];
                    const n = this.genericNames.names[Math.floor(Math.random() * this.genericNames.names.length)];
                    bName = `${s}|${n}`;
                }
                bushos.push(new Busho({
                    id: idCounter++, name: bName, 
                    strength: 30+Math.floor(Math.random()*40), leadership: 30+Math.floor(Math.random()*40), 
                    politics: 30+Math.floor(Math.random()*40), diplomacy: 30+Math.floor(Math.random()*40), 
                    intelligence: 30+Math.floor(Math.random()*40), charm: 30+Math.floor(Math.random()*40), 
                    loyalty: 80, duty: 30+Math.floor(Math.random()*60),
                    innovation: Math.floor(Math.random() * 100), cooperation: Math.floor(Math.random() * 100),
                    clan: clan.id, castleId: castle.id, isCastellan: false, 
                    personality: p, ambition: 30+Math.floor(Math.random()*40), affinity: Math.floor(Math.random()*100)
                }));
                castle.samuraiIds.push(idCounter-1);
            }
        });
    }
    
        // ============================================
    // ★ここから書き足し！：画像から色を探す魔法です！
    // ============================================
    static async loadColorMap(url, castles) {
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.onload = () => {
                // 透明な画用紙（キャンバス）を作って画像を写し取ります
                const canvas = document.createElement('canvas');
                canvas.width = img.width;
                canvas.height = img.height;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0);
                
                // 画像の点（ピクセル）のデータを全部読み取ります
                const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
                const data = imageData.data;

                // お城のリストを一つずつ見ていきます
                for (let c of castles) {
                    if (c.castlesColorCode) {
                        const targetColor = this.hexToRgb(c.castlesColorCode);
                        let found = false;
                        
                        // 点を一つずつ調べて、同じ色かチェックします
                        for (let i = 0; i < data.length; i += 4) {
                            if (data[i] === targetColor.r && data[i+1] === targetColor.g && data[i+2] === targetColor.b) {
                                // 同じ色を見つけたら、その場所（XとY）をメモします！
                                const pixelIndex = i / 4;
                                c.pixelX = pixelIndex % canvas.width;
                                c.pixelY = Math.floor(pixelIndex / canvas.width);
                                found = true;
                                break; // 見つけたら次のお城へ
                            }
                        }
                        if (!found) {
                            console.warn(`色 ${c.castlesColorCode} が ${c.name} のために見つかりませんでした！`);
                        }
                    }
                }
                
                // 画像の大きさもメモしておきます
                this.mapImageWidth = img.width;
                this.mapImageHeight = img.height;
                resolve();
            };
            img.onerror = () => {
                console.warn("カラーマップの画像の読み込みに失敗しました！");
                resolve(); // 失敗してもゲームが止まらないようにします
            };
            img.src = url;
        });
    }

    static hexToRgb(hex) {
        // "#ff0000" のような文字を、赤・緑・青の数字に変換する魔法です
        const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
        return result ? {
            r: parseInt(result[1], 16),
            g: parseInt(result[2], 16),
            b: parseInt(result[3], 16)
        } : { r: 0, g: 0, b: 0 };
    }

    // ★ここから追加！：地方マップの画像を読み込んで「透明な下敷き」として保存する魔法です！
    static async loadProvinceMap(url) {
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.onload = () => {
                const canvas = document.createElement('canvas');
                canvas.width = img.width;
                canvas.height = img.height;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0);
                // 画像の点（ピクセル）のデータを、ゲーム中いつでも使えるように大事にしまっておきます
                this.provinceImageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
                resolve();
            };
            img.onerror = () => {
                console.warn("地方マップ画像の読み込みに失敗しました！");
                resolve(); // 失敗してもゲームが止まらないようにします
            };
            img.src = url;
        });
    }
}

/* ==========================================================================
   GameSystem
   ========================================================================== */
class GameSystem {
    static seededRandom(seed) { let x = Math.sin(seed++) * 10000; return x - Math.floor(x); }
    static applyVariance(val, fluctuation) {
        if (!fluctuation || fluctuation === 0) return Math.floor(val);
        const min = 1.0 - fluctuation; const max = 1.0 + fluctuation;
        const rate = min + Math.random() * (max - min);
        return Math.floor(val * rate);
    }
    
    // ★ここをごっそり差し替え！：マスの位置（xとy）の計算を消して、リストの数字で判断します！
    static isAdjacent(c1, c2) { 
        // どちらかのお城のデータが無かったら「繋がってない」にします
        if (!c1 || !c2) return false;
        
        // お城1のリストに、お城2のIDが入っているか？
        const c1HasC2 = c1.adjacentCastleIds && c1.adjacentCastleIds.includes(c2.id);
        // お城2のリストに、お城1のIDが入っているか？
        const c2HasC1 = c2.adjacentCastleIds && c2.adjacentCastleIds.includes(c1.id);
        
        // どちらか片方のリストにでもIDが書いてあれば「道が繋がっている」ということにします！
        return c1HasC2 || c2HasC1;
    }
    
    static toGradeHTML(val) {
        let base = "", sub = "", cls = "";
        if (val >= 110) { base = "S"; sub = "+"; cls = "rank-s"; } 
        else if (val >= 100) { base = "S"; sub = "";  cls = "rank-s"; }
        else if (val >= 90) { base = "A"; sub = "+"; cls = "rank-a"; } 
        else if (val >= 80) { base = "A"; sub = "";  cls = "rank-a"; }
        else if (val >= 70) { base = "B"; sub = "+"; cls = "rank-b"; } 
        else if (val >= 60) { base = "B"; sub = "";  cls = "rank-b"; }
        else if (val >= 50) { base = "C"; sub = "+"; cls = "rank-c"; } 
        else if (val >= 40) { base = "C"; sub = "";  cls = "rank-c"; }
        else if (val >= 30) { base = "D"; sub = "+"; cls = "rank-d"; } 
        else if (val >= 20) { base = "D"; sub = "";  cls = "rank-d"; }
        else if (val >= 10) { base = "E"; sub = "+"; cls = "rank-e"; } 
        else { base = "E"; sub = ""; cls = "rank-e"; }

        return `
            <span class="grade-container ${cls}">
                <span class="grade-main">${base}</span>
                <span class="grade-sub">${sub}</span>
            </span>`;
    }
    static getPerceivedStatValue(target, statName, gunshi, castleAccuracy, playerClanId, daimyo = null) {
        return target[statName];
    }
    
    static getDisplayStatHTML(target, statName, gunshi, castleAccuracy = null, playerClanId = 0, daimyo = null) {
        return this.toGradeHTML(target[statName]);
    }

    static calcDevelopment(busho, bonusRate = 1.0, isExecute = false) { 
        if (isExecute) busho.expPolitics = (busho.expPolitics || 0) + 10;
        return Math.max(1, Math.round((((busho.politics * 1.5) + (Math.sqrt(busho.loyalty) * 2)) / 20) * bonusRate)); 
    }
    static calcRepair(busho, bonusRate = 1.0, isExecute = false) { 
        if (isExecute) busho.expPolitics = (busho.expPolitics || 0) + 10;
        return Math.max(1, Math.round((((busho.politics * 1.5) + (Math.sqrt(busho.loyalty) * 2)) / 15) * bonusRate)); 
    }
    static calcCharity(busho, bonusRate = 1.0, isExecute = false) { 
        if (isExecute) busho.expPolitics = (busho.expPolitics || 0) + 5;
        return Math.max(1, Math.round((((busho.politics * 1.5) + busho.charm + (Math.sqrt(busho.loyalty) * 2)) / 30) * bonusRate)); 
    }
    
    // 新しい計算式です。兵士数(soldiers)を引数として受け取ります
    static calcTraining(busho, soldiers, bonusRate = 1.0, isExecute = false) { 
        if (isExecute) {
            busho.expLeadership = (busho.expLeadership || 0) + 3;
            busho.expStrength = (busho.expStrength || 0) + 5;
        }
        const safeSoldiers = Math.max(1, soldiers); // 兵士0の時は計算エラーを防ぐため1として扱います
        const val = (((busho.leadership * 1.5) + busho.strength + (Math.sqrt(busho.loyalty) * 2)) / (Math.sqrt(safeSoldiers) * 0.5)) * bonusRate;
        return Math.max(1, Math.round(val)); 
    }
    static calcSoldierCharity(busho, soldiers, bonusRate = 1.0, isExecute = false) { 
        if (isExecute) {
            busho.expLeadership = (busho.expLeadership || 0) + 3;
            busho.expStrength = (busho.expStrength || 0) + 5;
        }
        const safeSoldiers = Math.max(1, soldiers); // こちらも同じく兵士0の時は1として扱います
        const val = (((busho.politics * 1.5) + busho.charm + (Math.sqrt(busho.loyalty) * 2)) / (Math.sqrt(safeSoldiers) * 0.5)) * bonusRate;
        return Math.max(1, Math.round(val)); 
    }

    // ★追加：同じ派閥のみで実行した時のボーナス倍率を計算します
    static calcFactionBonusRate(bushos) {
        if (!bushos || bushos.length < 2) return 1.0;
        const factionId = bushos[0].factionId;
        if (factionId === 0) return 1.0; // 無所属は派閥として扱いません
        const isSameFaction = bushos.every(b => b.factionId === factionId);
        if (isSameFaction) {
            return 1.0 + (bushos.length - 1) * 0.1;
        }
        return 1.0;
    }

    static calcBaseGoldIncome(castle) {
        const baseGold = (castle.population * 0.01) + (castle.peoplesLoyalty / 2) + (castle.commerce / 4);
        return Math.floor(baseGold * window.MainParams.Economy.IncomeGoldRate);
    }
    
    static calcBaseRiceIncome(castle) {
        const baseRice = (castle.kokudaka + castle.peoplesLoyalty) * (Math.sqrt(castle.peoplesLoyalty) + 2);
        return Math.floor(baseRice);
    }
    
    // AI用：お金を指定して、集まる兵士数を計算します
    static calcDraftFromGold(gold, busho, peoplesLoyalty) { 
        const efficiency = ((busho.leadership * 1.5) + (busho.charm * 1.5) + (Math.sqrt(busho.loyalty) * 2) + (Math.sqrt(peoplesLoyalty) * 2)) / 500;
        return Math.floor(gold * efficiency); 
    }
    // プレイヤー用：集めたい兵士数を指定して、必要なお金を計算します
    static calcDraftCost(soldiers, busho, peoplesLoyalty, isExecute = false) { 
        if (isExecute) {
            busho.expLeadership = (busho.expLeadership || 0) + Math.floor(soldiers / 300);
            busho.expStrength = (busho.expStrength || 0) + Math.floor(soldiers / 200);
        }
        const efficiency = ((busho.leadership * 1.5) + (busho.charm * 1.5) + (Math.sqrt(busho.loyalty) * 2) + (Math.sqrt(peoplesLoyalty) * 2)) / 500;
        return Math.ceil(soldiers / efficiency); 
    }

    // ============================================
    // ★軍馬・鉄砲の購入計算を共通化する魔法です！
    // ============================================
    
    // 取引の効率を計算します
    static calcBuyEquipEfficiency(daimyo, castellan, itemType) {
        const divisor = itemType === 'horse' ? 150 : 300;
        const daimyoEff = daimyo ? ((daimyo.politics * 1.5) + (daimyo.charm * 1.5)) / divisor : 0;
        const castellanEff = castellan ? ((castellan.politics * 1.5) + (castellan.charm * 1.5)) / divisor : 0;
        let totalEff = daimyoEff + castellanEff;
        return totalEff > 0 ? totalEff : 0.1;
    }

    // そのお城が軍馬や鉄砲の産地かどうかを判定する魔法です
    static isProdCastle(c, itemType) {
        if (!c) return false;
        
        if (itemType === 'horse') {
            if (c.id === 157) return true;
            if ([15, 36, 61, 62, 63, 64, 68].includes(c.provinceId)) return true; 
            if (window.GameApp && window.GameApp.provinces) {
                const prov = window.GameApp.provinces.find(p => p.id === c.provinceId);
                if (prov && (prov.regionId === 1 || prov.regionId === 3)) return true;
            }
        } else if (itemType === 'gun') {
            if ([33, 42, 185, 186].includes(c.id)) return true;
        }
        return false;
    }

    // 画面の相場表示に使う「小数点まで正確な1個の単価」を出す魔法
    static calcBuyEquipUnitPrice(daimyo, castellan, itemType) {
        const eff = this.calcBuyEquipEfficiency(daimyo, castellan, itemType);
        const basePrice = itemType === 'horse' ? 2 : 5;
        let unitPrice = basePrice / (1 + eff / 10);
        
        let hasProdCastle = false;
        
        if (daimyo && window.GameApp && window.GameApp.castles) {
            hasProdCastle = window.GameApp.castles.some(c => c.ownerClan === daimyo.clan && this.isProdCastle(c, itemType));
        } else if (castellan && window.GameApp && window.GameApp.castles) {
            const myCastle = window.GameApp.castles.find(c => c.id === castellan.castleId);
            hasProdCastle = this.isProdCastle(myCastle, itemType);
        } else if (castellan && itemType === 'gun') {
            // 万が一の予備チェック（鉄砲用）
            hasProdCastle = [33, 42, 185, 186].includes(castellan.castleId);
        }
        
        // 産地を持っていたら単価を半額にします！
        if (hasProdCastle) {
            unitPrice = unitPrice / 2;
        }
        
        return unitPrice;
    }

    static calcBuyEquipCost(amount, daimyo, castellan, itemType) {
        const unitPrice = this.calcBuyEquipUnitPrice(daimyo, castellan, itemType);
        return Math.ceil(amount * unitPrice);
    }

    static calcBuyEquipAmount(gold, daimyo, castellan, itemType) {
        const unitPrice = this.calcBuyEquipUnitPrice(daimyo, castellan, itemType);
        return Math.floor(gold / unitPrice);
    }

    // 他の場所からの呼び出しが今まで通り動くように、窓口だけ残しておきます
    static calcBuyHorseEfficiency(daimyo, castellan) { return this.calcBuyEquipEfficiency(daimyo, castellan, 'horse'); }
    static calcBuyHorseUnitPrice(daimyo, castellan) { return this.calcBuyEquipUnitPrice(daimyo, castellan, 'horse'); }
    static calcBuyHorseCost(amount, daimyo, castellan) { return this.calcBuyEquipCost(amount, daimyo, castellan, 'horse'); }
    static calcBuyHorseAmount(gold, daimyo, castellan) { return this.calcBuyEquipAmount(gold, daimyo, castellan, 'horse'); }

    static calcBuyGunEfficiency(daimyo, castellan) { return this.calcBuyEquipEfficiency(daimyo, castellan, 'gun'); }
    static calcBuyGunUnitPrice(daimyo, castellan) { return this.calcBuyEquipUnitPrice(daimyo, castellan, 'gun'); }
    static calcBuyGunCost(amount, daimyo, castellan) { return this.calcBuyEquipCost(amount, daimyo, castellan, 'gun'); }
    static calcBuyGunAmount(gold, daimyo, castellan) { return this.calcBuyEquipAmount(gold, daimyo, castellan, 'gun'); }

    static isReachable(game, startCastle, targetCastle, movingClanId) {
        // ★追加：もし城のデータが空っぽだったら、エラーになる前にすぐストップします！
        if (!startCastle || !targetCastle) return false;

        if (this.isAdjacent(startCastle, targetCastle)) return true;

        const visited = new Set();
        const queue = [{ castle: startCastle, distance: 0 }];
        visited.add(startCastle.id);

        while (queue.length > 0) {
            const currentData = queue.shift();
            const current = currentData.castle;
            const currentDist = currentData.distance;

            const neighbors = [];
            if (current.adjacentCastleIds) {
                current.adjacentCastleIds.forEach(adjId => {
                    const c = game.getCastle(adjId);
                    if (c) neighbors.push(c);
                });
            }
            
            for (const next of neighbors) {
                if (next.id === targetCastle.id) return true;
                
                if (!visited.has(next.id)) {
                    let canPass = false;
                    
                    // 自分のお城（自領）だけを通り抜けられるようにします！
                    if (Number(next.ownerClan) === Number(movingClanId)) {
                        canPass = true;
                    } 
                    
                    if (canPass) {
                        visited.add(next.id);
                        queue.push({ castle: next, distance: currentDist + 1 });
                    }
                }
            }
        }
        return false;
    }
    
    static calcInvestigate(bushos, targetCastle) {
        if (!bushos || bushos.length === 0) return { success: false, accuracy: 0 };
        
        const maxStrBusho = bushos.reduce((a,b) => a.strength > b.strength ? a : b);
        const maxIntBusho = bushos.reduce((a,b) => a.intelligence > b.intelligence ? a : b);
        
        const assistStr = bushos.filter(b => b !== maxStrBusho).reduce((sum, b) => sum + b.strength, 0) * 0.2;
        const assistInt = bushos.filter(b => b !== maxIntBusho).reduce((sum, b) => sum + b.intelligence, 0) * 0.2;
        
        const totalStr = maxStrBusho.strength + assistStr;
        const totalInt = maxIntBusho.intelligence + assistInt;
        
        const difficulty = 30 + Math.random() * window.MainParams.Strategy.InvestigateDifficulty;
        const isSuccess = totalStr > difficulty;
        
        let accuracy = 0;
        if (isSuccess) {
            accuracy = Math.min(100, Math.max(10, (totalInt * 0.8) + (Math.random() * 20)));
        }
        
        return { success: isSuccess, accuracy: Math.floor(accuracy) };
    }
    
    static getInvestigateProb(bushos) {
        if (!bushos || bushos.length === 0) return 0;
        const maxStrBusho = bushos.reduce((a,b) => a.strength > b.strength ? a : b);
        const assistStr = bushos.filter(b => b !== maxStrBusho).reduce((sum, b) => sum + b.strength, 0) * 0.2;
        const totalStr = maxStrBusho.strength + assistStr;
        const diffMax = 30 + window.MainParams.Strategy.InvestigateDifficulty;
        if (totalStr >= diffMax) return 1.0;
        if (totalStr <= 30) return 0.0;
        return (totalStr - 30) / window.MainParams.Strategy.InvestigateDifficulty;
    }

    static getEmployProb(recruiter, target, recruiterClanPower, targetClanPower) {
        // ★追加：諸勢力に所属している武将（頭領など）は引き抜けないようにガードします！
        if ((target.belongKunishuId || 0) > 0) return 0;
        
        if (target.clan !== 0 && target.ambition > 70 && recruiterClanPower < targetClanPower * 0.7) return 0; 
        const affDiff = this.calcAffinityDiff(recruiter.affinity, target.affinity);
        let affBonus = (affDiff < 10) ? 30 : (affDiff < 25) ? 15 : (affDiff > 40) ? -10 : 0; 
        const resistance = target.clan === 0 ? target.ambition : target.loyalty * window.MainParams.Strategy.EmploymentDiff; 
        const base = recruiter.charm + affBonus;
        if (base <= 0) return 0;
        const threshold = resistance / base - 0.5;
        if (threshold >= 1.0) return 0;
        if (threshold <= 0.0) return 1.0;
        
        let prob = 1.0 - threshold;
        
        // ★追加：宿敵が登用主の大名家にいる場合は、成功率を半分にします！
        if (target.nemesisIds && target.nemesisIds.length > 0 && window.GameApp) {
            const hasNemesis = target.nemesisIds.some(nId => {
                const nBusho = window.GameApp.getBusho(nId);
                return nBusho && nBusho.clan === recruiter.clan && nBusho.status !== 'dead';
            });
            if (hasNemesis) {
                prob *= 0.5;
            }
        }
        
        return prob;
    }

    static calcAffinityDiff(a, b) { const diff = Math.abs(a - b); return Math.min(diff, 100 - diff); }
    static calcValueDistance(a, b) {
        const diffInno = Math.abs(a.innovation - b.innovation);
        const coopFactor = (a.cooperation + b.cooperation) / 200; 
        let dist = diffInno * (1.0 - (coopFactor * 0.5)); 
        const classicAff = this.calcAffinityDiff(a.affinity, b.affinity); 
        return Math.floor(dist * 0.8 + classicAff * 0.4); 
    }
    static calcRewardEffect(gold, daimyo, target) {
        const S = window.MainParams.Strategy;
        const dist = this.calcValueDistance(daimyo, target);
        let penalty = dist * S.RewardDistancePenalty;
        let baseIncrease = S.RewardBaseEffect + (gold * S.RewardGoldFactor);
        let actualIncrease = baseIncrease - penalty;
        if (actualIncrease < 0) actualIncrease = 0;
        return Math.floor(actualIncrease);
    }
    
    static calcEmploymentSuccess(recruiter, target, recruiterClanPower, targetClanPower) {
        // ★追加：諸勢力に所属している武将（頭領など）は引き抜けないようにガードします！
        if ((target.belongKunishuId || 0) > 0) return false;

        if (target.clan !== 0 && target.ambition > 70 && recruiterClanPower < targetClanPower * 0.7) return false; 
        const affDiff = this.calcAffinityDiff(recruiter.affinity, target.affinity);
        let affBonus = (affDiff < 10) ? 30 : (affDiff < 25) ? 15 : (affDiff > 40) ? -10 : 0; 
        let resistance = target.clan === 0 ? target.ambition : target.loyalty * window.MainParams.Strategy.EmploymentDiff; 
        
        // ★追加：宿敵が登用主の大名家にいる場合は、抵抗値を2倍（成功しにくく）します！
        if (target.nemesisIds && target.nemesisIds.length > 0 && window.GameApp) {
            const hasNemesis = target.nemesisIds.some(nId => {
                const nBusho = window.GameApp.getBusho(nId);
                return nBusho && nBusho.clan === recruiter.clan && nBusho.status !== 'dead';
            });
            if (hasNemesis) {
                resistance *= 2;
            }
        }
        
        return ((recruiter.charm + affBonus) * (Math.random() + 0.5)) > resistance; 
    }
}

/* ==========================================================================
   GameManager
   ========================================================================== */
class GameManager {
    constructor() { 
        this.year = window.MainParams.StartYear; 
        this.month = window.MainParams.StartMonth; 
        this.castles = []; 
        this.bushos = []; 
        this.legions = []; // ★今回追加：軍団の名簿を入れておく空っぽの箱です
        this.turnQueue = []; 
        this.currentIndex = 0; 
        this.playerClanId = 1;
        this.ui = new UIManager(this); 
        this.selectionMode = null; 
        this.validTargets = []; 
        this.isProcessingAI = false; 
        this.marketRate = 1.0; 
        this.lastMenuState = null;
        this.aiTimer = null; 
        
        this.kunishuSystem = new KunishuSystem(this);
        this.commandSystem = new CommandSystem(this);
        this.warManager = new WarManager(this);
        
        // FieldWarManagerが存在するか確認してから準備する安全な書き方です
        if (typeof FieldWarManager !== 'undefined') {
            this.fieldWarManager = new FieldWarManager(this);
        } else {
            console.error("【エラー】FieldWarManagerが見つかりません。field_war.jsの読み込みに失敗しています。");
        }
        
        this.aiEngine = new AIEngine(this);
        this.aiStaffing = new AIStaffing(this);
        this.aiOperationManager = new AIOperationManager(this);
        this.independenceSystem = new IndependenceSystem(this);
        this.factionSystem = new FactionSystem(this); 
        this.diplomacyManager = new DiplomacyManager(this);
        // ★ 官位を管理するシステムを呼び出します
        this.courtRankSystem = new CourtRankSystem(this);
        // ★ 調略を管理するシステムを呼び出します
        this.strategySystem = new StrategySystem(this);
        // ★ 寿命と登場を管理するシステムを呼び出します
        this.lifeSystem = new LifeSystem(this);
        // ★ 軍師のシステムを呼び出します
        this.gunshiSystem = new GunshiSystem(this);
        // ★ お引越しセンターを開店します！
        this.affiliationSystem = new AffiliationSystem(this);
        // ★ 月初・月末のイベントを管理するシステムを呼び出します！
        this.eventManager = new EventManager(this);
        // ★ 城の管理を専門に行うシステムを呼び出します！
        this.castleManager = new CastleManager(this);
        // ★ 面談システムを呼び出します！
        this.interviewSystem = new InterviewSystem(this);
        
        this.phase = 'title';
    }
    
    getRelation(id1, id2) { 
        const rel = this.diplomacyManager.getRelation(id1, id2); 
        if (rel) {
            rel.alliance = (rel.status === '同盟');
            rel.friendship = rel.sentiment;
            // ★追加：画面の見た目だけを変えるための「表示用の名前」を用意します！
            rel.displayStatus = (rel.status === '同盟' && rel.isMarriage) ? '婚姻' : rel.status;
        }
        return rel;
    }
    
    startNewGame() {
        if(this.ui) this.ui.forceResetModals();
        
        // ★前回のゲームの記憶やフラグを綺麗にお掃除します！
        this.isProcessingAI = false; // AI思考中フラグを解除！
        if (this.aiTimer) {
            clearTimeout(this.aiTimer);
            this.aiTimer = null;
        }
        this.turnQueue = [];
        this.currentIndex = 0;
        this.selectionMode = null;
        this.validTargets = [];
        this.lastMenuState = null;
        if (this.warManager && this.warManager.state) {
            this.warManager.state.active = false;
        }
        if (this.ui) {
            this.ui.logHistory = [];
            this.ui.clearWarLog();
            this.ui.currentCastle = null; // 前の城の記憶を消します
            this.ui.hasInitializedMap = false; // マップも最初から作り直すようにします
            this.ui.selectedDaimyoId = null; // 選んでいた大名の記憶も消します
        }
        
        // ★スタンプ帳を真っ白にして、イベントの引き出しも新品に取り替えます！
        this.flags = {};
        this.eventManager = new EventManager(this);
        
        // ★AIの作戦データも真っ白にします（これで保護期間無視のバグを防ぎます）！
        if (this.aiOperationManager) {
            this.aiOperationManager.operations = {};
            this.aiOperationManager.draftBases = {};
        }
        
        this.ui.showScenarioSelection(SCENARIOS, (folder) => {
            this.loadScenario(folder);
        });
    }
    
    async loadScenario(folder) {
        // ★追加：シナリオの準備を始める前に、画面をロード画面で隠します
        if (this.ui) this.ui.showLoadingScreen();
        // ★追加：ロード画面がしっかり表示されるまで、ほんの一瞬（0.05秒）だけ待ちます
        await new Promise(resolve => setTimeout(resolve, 50));

        try {
            document.getElementById('title-screen').classList.add('hidden'); 

            const data = await DataManager.loadAll(folder); 
            this.clans = data.clans; this.castles = data.castles; this.bushos = data.bushos; 
            // ★今回追加：ゲーム本体（GameApp）に、姫の名簿を持たせます！
            this.princesses = data.princesses || []; 
            // ★今回追加：ゲーム本体に、地方の名簿も持たせます！
            this.provinces = data.provinces || [];
            
            // ★今回追加：新しいゲームを始める時は、読み込んだ軍団の名簿をしっかり受け取ります！
            this.legions = data.legions || [];
            
            this.year = window.MainParams.StartYear;
            this.month = window.MainParams.StartMonth;
            
            // ★修正：ゲーム開始時の年と月を、ゲーム本体にしっかり記憶させます！
            this.gameStartYear = this.year;
            this.gameStartMonth = this.month;
            
            // ★追加：今のシナリオのフォルダ名をゲーム全体で覚えておく魔法です！
            this.scenarioFolder = folder;
            
            this.kunishuSystem.setKunishuData(data.kunishus || []);
            this.courtRankSystem.setRankData(data.courtRanks || []);
            
            // ★ここを書き足し！：諸勢力の頭領がいないかチェックして、いなければ自動で作ってもらいます！
            this.kunishuSystem.generateMissingLeaders();
            
            // ★ここを書き足し！：ゲーム開始の瞬間に、全員の年齢による能力値変動を計算します！
            this.lifeSystem.updateAllBushosAge();

            // ★追加：ゲーム開始時に、各大名家にランダムな姫をある程度割り振ります！
            this.lifeSystem.distributeInitialPrincesses();

            // ★今回追加：ゲーム開始時に、武将の年齢と得意な能力に応じた経験値をプレゼントします！
            this.bushos.forEach(b => {
                // まだ生まれていない武将は対象外とします
                if (b.status === 'unborn') return;

                // 年齢を計算します（現在の年 - 生まれた年）
                let age = this.year - b.birthYear;
                
                // 万が一、年齢がマイナス（生まれる前など）の場合は処理をスキップします！
                if (age < 0) return;

                // ５つの能力の「基本の高さ」と「経験値を入れる箱の名前」をセットにしてリスト化します
                let stats = [
                    { name: 'expLeadership', val: b.baseLeadership },
                    { name: 'expStrength', val: b.baseStrength },
                    { name: 'expPolitics', val: b.basePolitics },
                    { name: 'expDiplomacy', val: b.baseDiplomacy },
                    { name: 'expIntelligence', val: b.baseIntelligence }
                ];

                // 数値が高い（大きい）順に並び替えます
                stats.sort((x, y) => y.val - x.val);

                // 一番高い数値をメモしておきます
                let highestVal = stats[0].val;
                
                // 一番高い数値と同じ数値を持つ能力を集めます（同率一位が複数いないかチェックします）
                let firstPlaceStats = stats.filter(s => s.val === highestVal);

                if (firstPlaceStats.length > 1) {
                    // ③ 同率一位が複数ある場合：年齢×15の経験値を、その複数の能力に均等に割り振ります
                    let totalExp = age * 15;
                    let expPerStat = Math.ceil(totalExp / firstPlaceStats.length); // 小数点以下は繰り上げます
                    
                    firstPlaceStats.forEach(s => {
                        b[s.name] += expPerStat;
                    });
                } else {
                    // ① 一番高い能力が単独の場合：一番上の能力に年齢×10の経験値を与えます
                    b[stats[0].name] += age * 10;
                    
                    // ② 二番目に高い能力が複数あるかチェックします
                    let secondHighestVal = stats[1].val;
                    let secondPlaceStats = stats.filter(s => s.val === secondHighestVal);
                    
                    if (secondPlaceStats.length > 1) {
                        // 二番目が同率で複数ある場合：年齢×5の経験値を均等に割り振ります
                        let totalSecondExp = age * 5;
                        let expPerSecondStat = Math.ceil(totalSecondExp / secondPlaceStats.length); // 小数点以下は繰り上げます
                        secondPlaceStats.forEach(s => {
                            b[s.name] += expPerSecondStat;
                        });
                    } else {
                        // 二番目も単独の場合：そのまま年齢×5の経験値を与えます
                        b[stats[1].name] += age * 5;
                    }
                }
            });

            // ★ここから追加：ゲーム開始時の特別なイベント（寿命の延長など）を実行します！
            if (this.eventManager) {
                await this.eventManager.processEvents('game_start');
            }
            
            // ★ここから追加：大名家の表示名を更新して同名被りを防ぎます！
            this.updateClanDisplayNames();
            
            // ★ここを書き足し！：画像の大きさをゲーム全体で覚えるようにします！
            this.mapWidth = data.mapWidth || 1200;
            this.mapHeight = data.mapHeight || 800;
            
            this.preloadFaceIcons();
            
            document.getElementById('app').classList.remove('hidden');
            
            this.phase = 'daimyo_select';
            this.ui.renderMap();
            // カットイン表示を消しました！

            // ★追加：マップの準備がすべて終わったら、少しだけ待ってからロード画面を隠します
            await new Promise(resolve => setTimeout(resolve, 100));
            if (this.ui) this.ui.hideLoadingScreen();
            
        } catch (e) {
            if (this.ui) this.ui.hideLoadingScreen();
            console.error(e);
            alert("シナリオデータの読み込みに失敗しました。");
            this.ui.returnToTitle();
        }
    }
    
    // ==========================================
    // ★ここから追加！：ゲームの裏側で、武将の顔画像を少しずつ読み込んでおく魔法です！
    // ==========================================
    preloadFaceIcons() {
        const faceFiles = new Set();
        this.bushos.forEach(b => {
            if (b.faceIcon && b.faceIcon !== 'unknown_face.webp') {
                faceFiles.add(b.faceIcon);
            }
        });

        const urls = Array.from(faceFiles).map(filename => `./data/images/faceicons/${filename}`);
        
        // ブラウザが一度に処理しやすい「10枚ずつ」の束にして、一斉に読み込みます
        const batchSize = 10;
        const loadBatch = async (startIndex) => {
            if (startIndex >= urls.length) return;
            
            const batch = urls.slice(startIndex, startIndex + batchSize);
            await Promise.all(batch.map(url => new Promise(res => {
                const img = new Image();
                img.onload = img.onerror = res;
                img.src = url;
            })));
            
            // 次の束へ進みます
            loadBatch(startIndex + batchSize);
        };

        loadBatch(0);
    }
    
    handleDaimyoSelect(castle) {
        const clan = this.clans.find(c => c.id === castle.ownerClan);
        if (!clan) return;

        const totalSoldiers = this.getClanTotalSoldiers(clan.id);
        const leader = this.getBusho(clan.leaderId);
        
        // ★ 変更：引数に clan.id を追加して大名選択の光を制御します
        this.ui.showDaimyoConfirmModal(clan.id, clan.name, totalSoldiers, leader, () => {
             this.playerClanId = Number(clan.id);
             this.phase = 'game';
             this.ui.renderMap(); 
             this.init();
        });
    }

    init() { this.startMonth(); }
    getBusho(id) { 
        if (!id || Number(id) === 0) return undefined;
        return this.bushos.find(b => Number(b.id) === Number(id)); 
    }
    getCastle(id) { return this.castles.find(c => Number(c.id) === Number(id)); }
    // ★ 修正：まだ生まれていない人（unborn）や亡くなった人（dead）は無視するようにします
    getCastleBushos(cid) { const c = this.castles.find(c => Number(c.id) === Number(cid)); return c ? c.samuraiIds.map(id => this.getBusho(id)).filter(b => b && b.status !== 'unborn' && b.status !== 'dead') : []; }
    getCurrentTurnCastle() { return this.turnQueue[this.currentIndex]; }
    getCurrentTurnId() { return this.year * 12 + this.month; }
    getClanTotalSoldiers(clanId) { return this.castles.filter(c => Number(c.ownerClan) === Number(clanId)).reduce((sum, c) => sum + c.soldiers, 0); }
    getClanGunshi(clanId) { return this.bushos.find(b => Number(b.clan) === Number(clanId) && b.isGunshi && b.status === 'active'); }

    getNavigatorInfo(castle) {
        let faceIcon = 'koshou.webp';
        let name = '小姓';
        
        const ownerClanId = castle.ownerClan;
        const daimyo = this.bushos.find(b => b.clan === ownerClanId && b.isDaimyo);
        
        if (daimyo && Number(daimyo.castleId) === Number(castle.id)) {
            let hasSpecialPrincess = false;
            if (daimyo.wifeIds && daimyo.wifeIds.length > 0) {
                for (const wId of daimyo.wifeIds) {
                    const wife = this.princesses.find(p => Number(p.id) === Number(wId));
                    if (wife && wife.faceIcon && wife.faceIcon !== 'unknown_princess_face.webp') {
                        faceIcon = wife.faceIcon;
                        name = wife.name;
                        hasSpecialPrincess = true;
                        break;
                    }
                }
            }
        } else {
            const castellan = this.getBusho(castle.castellanId);
            if (castellan) {
                faceIcon = castellan.faceIcon || 'unknown_face.webp';
                name = castellan.name.split('|').join('');
            }
        }
        
        return { faceIcon, name };
    }

    isCastleVisible(castle) { 
        return true; 
    }
    
    // ==========================================
    // ★全ての大名の「威信（daimyoPrestige）」を計算して箱に入れる魔法です
    updateAllClanPrestige() {
        this.clans.forEach(clan => {
            if (clan.id === 0) return; // 空き家（中立）は計算しません
            const castles = this.castles.filter(c => c.ownerClan === clan.id);
            let pop = 0, sol = 0, koku = 0, gold = 0, rice = 0;
            castles.forEach(c => { 
                pop += c.population; 
                sol += c.soldiers; 
                koku += c.kokudaka; 
                gold += c.gold; 
                rice += c.rice; 
            });
            
            // まずは今まで通り、兵士やお金から「基本の威信」を計算します
            const basePrestige = Math.floor(pop / 200) + Math.floor(sol / 20) + Math.floor(koku / 20) + Math.floor(gold / 150) + Math.floor(rice / 300);
            
            // ★追加：後で官位を得る計算などに使えるよう、ベースの素の威信を記憶しておきます
            clan.basePrestige = basePrestige;

            // ★追加：大名の武将データから官位ボーナスを取得します
            let rankBonus = 0;
            const leader = this.getBusho(clan.leaderId);
            if (leader) {
                rankBonus = this.courtRankSystem.getBushoRankBonus(leader);
            }
            
            // ベース威信と官位ボーナスを足し算して、最終的な威信にします
            clan.daimyoPrestige = basePrestige + rankBonus;
            
        });
    }
    // ==========================================

    // ★大名家の表示名を更新する魔法です（同名被りの回避）
    updateClanDisplayNames() {
        if (!this.provinces) return;

        // ★追加：現在生き残っている（城を1つ以上持っている）大名家の出席番号リストを作ります
        const aliveClanIds = new Set(this.castles.filter(c => c.ownerClan !== 0).map(c => c.ownerClan));

        // まず、今の大名に合わせて本来の名前（baseName）を更新します
        this.clans.forEach(clan => {
            // ★変更：空き家（0）や、生き残りリストに入っていない（滅亡した）大名家は無視します
            if (clan.id === 0 || !aliveClanIds.has(clan.id)) return; 
            const leader = this.getBusho(clan.leaderId);
            if (leader && leader.familyName) {
                clan.baseName = leader.familyName + "家";
            } else if (!clan.baseName) {
                clan.baseName = clan.name;
            }
            // 表示用の名前を一旦本来の名前にリセットします
            clan.name = clan.baseName;
        });

        // 本来の名前で被っている数を数えます
        const nameCounts = {};
        this.clans.forEach(clan => {
            if (clan.id === 0 || !aliveClanIds.has(clan.id)) return; // ★ここも同じようにガードします
            const baseName = clan.baseName;
            nameCounts[baseName] = (nameCounts[baseName] || 0) + 1;
        });

        // 1回目のチェック：被っていたら国名（「国」抜き）をつける
        this.clans.forEach(clan => {
            if (clan.id === 0 || !aliveClanIds.has(clan.id)) return; // ★ここもガード
            const baseName = clan.baseName;
            if (nameCounts[baseName] > 1) {
                const leader = this.getBusho(clan.leaderId);
                if (leader) {
                    const castle = this.getCastle(leader.castleId);
                    if (castle) {
                        const province = this.provinces.find(p => p.id === castle.provinceId);
                        if (province && province.province) {
                            const provName = province.province.replace(/国$/, "");
                            clan.name = provName + baseName;
                        }
                    }
                }
            }
        });

        // 新しい名前で被っている数をもう一度数えます
        const newNameCounts = {};
        this.clans.forEach(clan => {
            if (clan.id === 0 || !aliveClanIds.has(clan.id)) return; // ★ここもガード
            newNameCounts[clan.name] = (newNameCounts[clan.name] || 0) + 1;
        });

        // 2回目のチェック：国名をつけても被っていたら城名（「城」抜き）をつける
        this.clans.forEach(clan => {
            if (clan.id === 0 || !aliveClanIds.has(clan.id)) return; // ★ここもガード
            const baseName = clan.baseName;
            if (nameCounts[baseName] > 1 && newNameCounts[clan.name] > 1) {
                const leader = this.getBusho(clan.leaderId);
                if (leader) {
                    const castle = this.getCastle(leader.castleId);
                    if (castle && castle.name) {
                        const castleName = castle.name.replace(/城$/, "");
                        clan.name = castleName + baseName;
                    }
                }
            }
        });
    }

    // ★城主を決める仕事は、すべて人事部（affiliationSystem）に転送します！
    updateCastleLord(castle) {
        this.affiliationSystem.updateCastleLord(castle);
    }
    
    electCastellan(castle, bushos) {
        this.affiliationSystem.electCastellan(castle, bushos);
    }

    updateAllCastlesLords() {
        this.affiliationSystem.updateAllCastlesLords();
    }
    
    async startMonth() { 
        // ★追加：月初の処理が始まったら、ユーザーが勝手に操作できないように膜（ガード）を張ります！
        this.isProcessingAI = true;
        if (this.ui && this.ui.aiGuard) {
            this.ui.aiGuard.classList.remove('hidden');
            this.ui.hideAIGuardText(); // ★中身を壊さずに、透明にして文字だけ隠します！
        }

        // ★月が替わったら軍師の報告印を消します
        if (this.gunshiSystem) this.gunshiSystem.onStartMonth();
        
        // ★ごっそり差し替え！：相場の変動を「国（province）ごと」に計算するようにします！
        const fluc = window.MainParams.Economy.TradeFluctuation; // 動く幅（0.3）
        
        // 季節の風（季節の動きは日本全国共通です！）
        let seasonForce = 0;
        if (this.month === 9) {
            // 9月は収穫の秋！お米が市場に溢れるので、相場が一気に下がります（安くなる）
            let randomDown = (Math.floor(Math.random() * 51) / 100) + 0.5;
            seasonForce = -randomDown;
        } else {
            // それ以外の月は、だんだんお米が減っていくので、毎月少しずつ相場が上がります（高くなる）
            seasonForce = 0.05;
        }

        // ==========================================
        // ★ここから追加：隣の国と相場を引っ張り合う魔法！
        // まず、「どの国とどの国が隣り合っているか」のリスト（つながりマップ）を作ります
        const adjProvinces = {};
        this.provinces.forEach(p => adjProvinces[p.id] = new Set());

        // 日本中のお城を調べて、道が繋がっているお城同士の「国」をメモします
        this.castles.forEach(c => {
            if (c.provinceId > 0 && c.adjacentCastleIds) {
                c.adjacentCastleIds.forEach(adjId => {
                    const adjCastle = this.getCastle(adjId);
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

        this.provinces.forEach(p => {
            // 国ごとのサイコロと、ゴムの力
            const change = (Math.random() * (fluc * 2)) - fluc;
            const rubberForce = (1.0 - p.marketRate) * 0.1;
            
            // ★お隣さんから引っ張られる力！
            let neighborForce = 0;
            const neighborIds = adjProvinces[p.id];
            
            if (neighborIds && neighborIds.size > 0) {
                let neighborTotalRate = 0;
                // お隣さんの相場を全部足し算します
                neighborIds.forEach(nId => {
                    const nProv = this.provinces.find(prov => prov.id === nId);
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
        this.provinces.forEach(p => {
            if (nextRates.has(p.id)) {
                p.marketRate = nextRates.get(p.id);
            }
        });
        // 年月や相場が新しくなったので、イベントが始まる前に画面の表示を最新にします！
        if (this.ui) {
            const displayCastle = this.ui.currentCastle || this.getCurrentTurnCastle();
            if (displayCastle) {
                this.ui.updateInfoPanel(displayCastle);
            }
        }
        
        await this.ui.showCutin(`${this.year}年 ${this.month}月`);
        
        this.ui.log(`=== ${this.year}年 ${this.month}月 ===`);
        
        // 月初イベント【前】をチェックして実行します
        if (this.eventManager) {
            await this.eventManager.processEvents('startMonth_before');
        }
        
        // 元服の処理が終わるまでしっかり待ちます！
        await this.lifeSystem.processStartMonth();
        
        // 武将の下野（出奔）が終わるまで待ちます！
        await this.factionSystem.processStartMonth(); 
        
        this.affiliationSystem.processRoninMovements();
        
        this.updateAllCastlesLords();
        
        // 毎月、全武将の宿敵のタイマーを1ずつ減らす処理です
        this.bushos.forEach(b => {
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
                    const kunishu = this.kunishuSystem ? this.kunishuSystem.getKunishu(b.belongKunishuId) : null;
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
        
        if (this.month % 3 === 0) this.factionSystem.optimizeCastellans();
        
        this.castles.forEach(c => {
            if (c.ownerClan === 0) return;
            c.isDone = false;

            let income = GameSystem.calcBaseGoldIncome(c);
            income = GameSystem.applyVariance(income, window.MainParams.Economy.IncomeFluctuation);
            if (this.month === 3) income += income * 3;

            // ★ここから追加：港拠点の交易収入ボーナス！
            //春日山城(ID2)、石山御坊(ID33)、松波城(ID72)、尾山御坊(ID74)、北庄城(ID76)、立花山城(ID148)、平戸城(ID155)、内城(ID169)、厳原城(ID174)、安濃津城(予定)、土崎港(予定)、十三湊(予定)
            const portCastleIds = [2, 33, 72, 74, 76, 148, 155, 169, 174]; // 港拠点のIDリスト
            let portBonus = 0;
            if (portCastleIds.includes(c.id)) {
                // 同じ勢力が持っているすべてのお城の総人口を計算します
                const clanCastles = this.castles.filter(castle => castle.ownerClan === c.ownerClan);
                const totalClanPopulation = clanCastles.reduce((sum, castle) => sum + castle.population, 0);
                
                // ボーナスの計算式です
                portBonus = Math.floor((c.population / 500) + (c.peoplesLoyalty / 2) + (totalClanPopulation / 1000));
            }
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
            let growth = Math.floor(((Math.sqrt(c.population) * 2) * ((currentLoyalty - 50) / 100)) + (currentLoyalty / 4));
            c.population = Math.min(999999, Math.max(0, c.population + growth));

            // ★追加：毎月の兵士の自然増加計算
            // まず、このお城の持ち主である大名様を探し出します
            const daimyoBusho = this.bushos.find(b => b.clan === c.ownerClan && b.isDaimyo);
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
                const ownedCastlesCount = this.castles.filter(castle => castle.ownerClan === c.ownerClan).length;
                // 城の所有数を25で割り、1を足してペナルティ値とします（最低でも1なので安全です）
                const castlePenalty = 1 + (ownedCastlesCount / 25);
                
                // 基本値から先に城数ブレーキで「割り算」をして、抑制された基本値を作ります
                const suppressedGrowth = baseGrowth / castlePenalty;

                // ★追加：人口に対する兵士の割合を計算して、ブレーキをかけます！
                // 兵士の割合が50%で0.375倍になり、75%で0.0625倍（雀の涙）になります。
                const soldierRatio = c.population > 0 ? (c.soldiers / c.population) : 1.0;
                const penaltyMultiplier = Math.max(0, 1.0 - (soldierRatio * 1.25));

                // 最後に、城数で抑制された基本値に、割合ブレーキを「掛け算」します！
                const soldierGrowth = Math.floor(suppressedGrowth * penaltyMultiplier);

                // 計算した増える人数を、今のお城の兵士の数に足し合わせます（最大99999人まで）
                c.soldiers = Math.min(99999, c.soldiers + Math.max(0, soldierGrowth));
            }
            
            // ★追加：毎月月初に取引上限を決定（最大値まで回復）
            c.tradeLimit = Math.floor((c.population / 50) + (c.kokudaka * 4));
        });

        // ★ここを書き換え！：空っぽの城（中立）も仲間はずれにせず、一緒に混ぜて順番リストに入れます！
        const allCastles = [...this.castles];
        allCastles.sort(() => Math.random() - 0.5); 
        this.turnQueue = [...allCastles];

        // ★毎月の初めに、最新の威信を計算し直します！
        this.updateAllClanPrestige();

        // ==========================================
        // ★追加：ここで官位の授与チェックを行います！
        const promotionMsgs = this.courtRankSystem.processMonthlyPromotions();
        if (promotionMsgs && promotionMsgs.length > 0) {
            // 複数の大名が受かった場合は、一人ずつ順番にお知らせを出します
            for (const msg of promotionMsgs) {
                await this.ui.showDialogAsync(msg, false, 0);
            }
            
            // 官位をもらったことで威信が増えるので、念のためもう一度最新の威信を計算し直しておきます！
            this.updateAllClanPrestige();
        }
        // ==========================================

        // ★ここを書き足し！：月初イベント【後】（収入などの処理が終わった後）を実行します
        // ここで9月の兵糧収穫イベントなどが実行されます！
        if (this.eventManager) {
            await this.eventManager.processEvents('startMonth_after');
        }

        // ★ここから新しく書き足し！：収入やイベントが全部終わった「後」に、金や兵糧を消費します！
        this.castles.forEach(c => {
            if (c.ownerClan === 0) return;

            const bushos = this.getCastleBushos(c.id);
            const daimyo = this.bushos.find(b => b.clan === c.ownerClan && b.isDaimyo);
            
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
                
                // 毎月城主と軍師の功績が５増えます
                if (b.isCastellan || b.isGunshi) {
                    b.achievementTotal += 5;
                }
                
                // 大名・国主は追加で功績が２増えます
                if (b.isDaimyo || b.isCommander) {
                    b.achievementTotal += 2;
                }

                // 役職ごとの経験値追加
                if (b.isCastellan) {
                    b.expStrength = (b.expStrength || 0) + 3;
                    b.expPolitics = (b.expPolitics || 0) + 3;
                }
                
                if (b.isDaimyo || b.isCommander) {
                    b.expLeadership = (b.expLeadership || 0) + 5;
                    b.expDiplomacy = (b.expDiplomacy || 0) + 5;
                    b.expIntelligence = (b.expIntelligence || 0) + 2;
                }
                
                if (b.isGunshi) {
                    b.expLeadership = (b.expLeadership || 0) + 5;
                    b.expIntelligence = (b.expIntelligence || 0) + 5;
                    b.expPolitics = (b.expPolitics || 0) + 2;
                    b.expDiplomacy = (b.expDiplomacy || 0) + 2;
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
        if (this.month === 1 || this.month === 4 || this.month === 7 || this.month === 10) {
            if (this.aiStaffing) {
                this.clans.forEach(clan => {
                    if (clan.id !== 0 && clan.id !== this.playerClanId) {
                        // ★追加：国主を決める前に、まずは大名自身に最適な居城を探させてお引越しさせます！
                        const daimyo = this.bushos.find(b => b.clan === clan.id && b.isDaimyo);
                        if (daimyo && daimyo.castleId) {
                            const daimyoCastle = this.getCastle(daimyo.castleId);
                            if (daimyoCastle) {
                                this.aiStaffing.relocateDaimyo(daimyoCastle, daimyo);
                            }
                        }

                        this.aiStaffing.createNewLegionIfNeeded(clan.id);
                    }
                });
            }
        }
        if (this.aiOperationManager) {
            await this.aiOperationManager.processMonthlyOperations();
        }

        this.currentIndex = 0; 
        this.processTurn();
    }

    async processTurn() {  // ★最初に async を付けます！
        if (this.aiTimer) {
            clearTimeout(this.aiTimer);
            this.aiTimer = null;
        }

        // ★最強ストッパー１：合戦中やマップ選択中にフライングで呼ばれたら絶対に弾く！
        if (this.warManager && this.warManager.state && this.warManager.state.active) return;
        if (this.selectionMode != null) return;
        
        // ★ここを修正！ 全ての城が終わって翌月（endMonth）に行く前にも、メッセージが消えるのをじっと待ちます！
        if (this.currentIndex >= this.turnQueue.length) { 
            if (this.ui && this.ui.waitForDialogs) {
                await this.ui.waitForDialogs();
            }
            // ★ここから追加：全部終わって翌月に行く前に、安心感のために数字を「MAX/MAX」にしておきます！
            if (this.isProcessingAI && this.ui && this.turnQueue.length > 0) {
                this.ui.restoreAIGuardText(true); // ★強制表示
                this.ui.updateAIProgress(this.turnQueue.length, this.turnQueue.length);
                // ★追加：MAXになった数字を一瞬だけ見せてから、月末イベントの邪魔にならないように表示を消します！
                await new Promise(resolve => setTimeout(resolve, 300));
                if (this.ui) {
                    this.ui.hideAIGuardText(); // ★中身を壊さずに、透明にして文字だけを隠します！
                }
            }
            await this.endMonth(); // ← ★「await」を書き足します！
            return; 
        }

        const castle = this.turnQueue[this.currentIndex]; 
        
        if (castle.isDone) {
            // ★ここを書き足し：行動済みの城をスキップする時も、一瞬だけ数字を進めます！
            if (this.isProcessingAI && this.ui) {
                this.ui.updateAIProgress(this.currentIndex + 1, this.turnQueue.length);
                this.ui.showControlPanel(castle); // ★追加：スキップ時も城の情報をババッと切り替えます！
            }
            // ★追加：スマホがパンクしないように、ここでほんの一瞬だけ「息継ぎ（お休み）」をさせます！
            setTimeout(() => {
                this.finishTurn();
            }, 0);
            return;
        }

        if(!castle || castle.ownerClan === 0 || !this.clans.find(c => Number(c.id) === Number(castle.ownerClan))) { 
            console.log(`空き城またはデータのない城をスキップしました。`);
            // ★ここを書き足し：空城をスキップする時も、一瞬だけ数字を進めます！
            if (this.isProcessingAI && this.ui) {
                this.ui.updateAIProgress(this.currentIndex + 1, this.turnQueue.length);
                this.ui.showControlPanel(castle); // ★追加：スキップ時も城の情報をババッと切り替えます！
            }
            this.currentIndex++; 
            // ★追加：空き城を連続で飛ばす時も、スマホがパンクしないように一瞬「息継ぎ」をさせます！
            setTimeout(() => {
                this.processTurn(); 
            }, 0);
            return; 
        }
        
        const ownerId = Number(castle.ownerClan);
        const playerId = Number(this.playerClanId);
        const isPlayerCastle = (ownerId === playerId);

        const isVisible = this.isCastleVisible(castle);
            const isNeighbor = this.castles.some(c => Number(c.ownerClan) === playerId && GameSystem.isAdjacent(c, castle));
            const isImportant = isVisible || isNeighbor;
            
        // ==========================================
        // ★ここに追加：画面を動かしたり「ご命令ください」を出す前に、
        // 画面上のメッセージが全部終わるまでじっと待ちます！
        if (this.ui && this.ui.waitForDialogs) {
            await this.ui.waitForDialogs();
        }
        // ==========================================
        
        // ★イベント追加：各城の行動開始前
        if (this.eventManager) {
            await this.eventManager.processEvents('turn_start', castle);
        }

        // 行動開始前イベントで城の持ち主や状態が変わった場合の安全措置
        if (castle.isDone || castle.ownerClan === 0) {
            this.finishTurn();
            return;
        }

        // ★超軽量化：AIのターン中はマップの再描画をストップします！
        // プレイヤーの直轄城（手動操作）の時だけマップを綺麗に描き直すようにしました。
        if (isPlayerCastle && !castle.isDelegated) {
            this.ui.renderMap();
        }

        if (isPlayerCastle) {
            // ==========================================
            // ★ごっそり差し替え！委任のチェックを入れます
            // ==========================================
            if (castle.isDelegated) {
                // 委任されている場合はAIに任せます！
                this.isProcessingAI = true; 
                if(this.ui.aiGuard) {
                    this.ui.aiGuard.classList.remove('hidden'); 
                    this.ui.restoreAIGuardText(true); // ★透明マントを脱いで文字を見せます！
                }
                
                this.ui.updateAIProgress(this.currentIndex + 1, this.turnQueue.length);
                this.ui.showControlPanel(castle);
                
                const delay = isImportant ? 30 : 30;

                this.aiTimer = setTimeout(async () => {
                    if (this.warManager.state.active) return;
                    if (this.turnQueue[this.currentIndex] !== castle) return;
                    try {
                        await this.aiEngine.execAI(castle); // AIにバトンタッチ！
                    } catch(e) {
                        console.error("AI Error caught:", e);
                        this.finishTurn(); 
                    }
                }, delay); 
            } else {
                // 直轄（今まで通りプレイヤーが動かす）の場合
                this.isProcessingAI = false; 
                if(this.ui.aiGuard) this.ui.aiGuard.classList.add('hidden'); 

                this.ui.renderMap(); 
                this.ui.scrollToActiveCastle(castle);
                
                this.ui.showTurnStartDialog(castle, () => {
                    this.gunshiSystem.checkAndShowAdvice(castle, async () => {
                        // ★イベント追加：コマンドの選択前（手動操作時）
                        if (this.eventManager) {
                            await this.eventManager.processEvents('before_command', castle);
                        }
                        this.ui.showControlPanel(castle); 
                    });
                });
            }
        } else {
            // ★ここから「プレイヤー以外の勢力」のターンの処理を一つにまとめました！
            this.isProcessingAI = true;
            if(this.ui.aiGuard) {
                this.ui.aiGuard.classList.remove('hidden'); 
                this.ui.restoreAIGuardText(true); // ★透明マントを脱いで文字を見せます！
            }
            
            // 進捗を表示
            this.ui.updateAIProgress(this.currentIndex + 1, this.turnQueue.length);
            // パネルに情報を表示
            this.ui.showControlPanel(castle);
            
            const delay = isImportant ? 30 : 30;

            this.aiTimer = setTimeout(async () => {
                if (this.warManager.state.active) return;
                if (this.turnQueue[this.currentIndex] !== castle) return;
                try {
                    await this.aiEngine.execAI(castle);
                } catch(e) {
                    console.error("AI Error caught:", e);
                    this.finishTurn(); 
                }
            }, delay); 
        }
    }
    
    async finishTurn() { 
        // ★最強ストッパー２：合戦中やマップ選択中なら、絶対にターンを勝手に終わらせない！
        if (this.warManager && this.warManager.state && this.warManager.state.active) return; 
        if (this.selectionMode != null) return;
        
        if (this.aiTimer) { clearTimeout(this.aiTimer); this.aiTimer = null; }

        this.selectionMode = null; 

        // ★ここから追加：ターン終了時、必ずコマンドの階層を初期化して非表示にします！
        if (this.ui && typeof this.ui.clearCommandMenu === 'function') {
            this.ui.clearCommandMenu();
        }
        
        // ★ここから追加：自分のターンが終わった瞬間に、いったん膜を張って操作をブロックします！
        this.isProcessingAI = true;
        if (this.ui && this.ui.aiGuard) {
            this.ui.aiGuard.classList.remove('hidden');
            this.ui.restoreAIGuardText(true); // ★透明マントを脱いで文字を見せます！
        }
        
        // ★追加：月末のイベント処理中（独立や反乱など）は、ここでストップします！
        if (this.currentIndex >= this.turnQueue.length) {
            return;
        }

        const castle = this.getCurrentTurnCastle(); 
        if(castle) {
            castle.isDone = true; 
            // ★イベント追加：各城の行動終了直後
            if (this.eventManager) {
                await this.eventManager.processEvents('turn_end', castle);
            }
        }
        
        this.currentIndex++; 
        // ★追加：ターンが終わって次に行く時も、スマホがパンクしないように一瞬「息継ぎ」をさせます！
        setTimeout(() => {
            this.processTurn(); 
        }, 0);
    }

    async endMonth() {
        // ==========================================
        // ★ 新しい一元管理の魔法：「画面にメッセージが出ている間は絶対に待つ」という最強の関所を作ります！
        const waitIfBusy = async () => {
            if (this.ui && typeof this.ui.waitForDialogs === 'function') {
                await this.ui.waitForDialogs();
            }
            // 少しだけ隙間を待つ（メッセージが連続で出るときの安全対策です）
            await new Promise(resolve => setTimeout(resolve, 300));
        };
        // ==========================================

        // ★ここを書き足し！：月末イベント【前】（寿命などの処理が始まる前）を実行します
        if (this.eventManager) {
            await this.eventManager.processEvents('endMonth_before');
        }
        await waitIfBusy(); // 終わったら、画面が空っぽになるまで絶対に待つ！

        // 1つ目の係員：派閥
        if (this.factionSystem && typeof this.factionSystem.processEndMonth === 'function') {
            await this.factionSystem.processEndMonth(); 
        }
        await waitIfBusy(); // 終わったら、画面が空っぽになるまで絶対に待つ！

        // 2つ目の係員：独立（反乱して空白地になる処理など）
        if (this.independenceSystem && typeof this.independenceSystem.checkIndependence === 'function') {
            await this.independenceSystem.checkIndependence();
        }
        await waitIfBusy(); // 終わったら、画面が空っぽになるまで絶対に待つ！
        
        // 3つ目の係員：外交
        if (this.diplomacyManager && typeof this.diplomacyManager.processEndMonth === 'function') {
            this.diplomacyManager.processEndMonth();
        }
        await waitIfBusy(); // 終わったら、画面が空っぽになるまで絶対に待つ！

        // 4つ目の係員：諸勢力（反乱など）
        if (this.kunishuSystem && typeof this.kunishuSystem.processEndMonth === 'function') {
            await this.kunishuSystem.processEndMonth();
        }
        await waitIfBusy(); // 終わったら、画面が空っぽになるまで絶対に待つ！
        
        // 5つ目の係員：寿命
        if (this.lifeSystem && typeof this.lifeSystem.processEndMonth === 'function') {
            await this.lifeSystem.processEndMonth(); 
        }
        await waitIfBusy(); // 終わったら、画面が空っぽになるまで絶対に待つ！

        // 6つ目の係員：月末の特別イベント（災害など）
        if (this.eventManager) {
            await this.eventManager.processEvents('endMonth_after');
        }
        await waitIfBusy(); // 終わったら、画面が空っぽになるまで絶対に待つ！

        // すべての月末イベントとメッセージが完全に終わってから、ようやく時間を進めます！
        this.month++;
        if(this.month > 12) { this.month = 1; this.year++; }
        
        // ★ここから追加：月末のタイミングで大名家の表示名を更新して同名被りを防ぎます！
        this.updateClanDisplayNames();
        
        const clans = new Set(this.castles.filter(c => c.ownerClan !== 0).map(c => c.ownerClan)); 
        const playerAlive = clans.has(this.playerClanId);
        
        if (clans.size === 1 && playerAlive) {
            this.ui.showDialog("天下統一！", false, () => {
                this.ui.returnToTitle(); 
            });
        } else if (!playerAlive) {
            this.ui.showDialog("我が大名家は滅亡しました……", false, () => {
                this.ui.returnToTitle(); 
            });
        } else {
            this.startMonth(); 
        }
    }
    
    checkAllActionsDone() {
        const c = this.getCurrentTurnCastle();
        if (!c || Number(c.ownerClan) !== Number(this.playerClanId)) return; 

        if (this.isProcessingAI) return;

        const bushos = this.getCastleBushos(c.id).filter(b => b.clan === c.ownerClan && b.status === 'active');
        
        if(bushos.length > 0 && bushos.every(b => b.isActionDone)) {
             setTimeout(() => {
                 const nav = this.getNavigatorInfo(c);
                 this.ui.showDialog("「すべての武将が行動を終えました。\n今月の命令を終了しますか？」", true, () => {
                     this.finishTurn();
                 }, null, {
                     leftFace: nav.faceIcon,
                     leftName: nav.name
                 });
             }, 100);
        }
    }

    changeLeader(clanId, newLeaderId) { 
        this.bushos.filter(b => b.clan === clanId).forEach(b => b.isDaimyo = false); 
        const newLeader = this.getBusho(newLeaderId); 
        if(newLeader) { 
            newLeader.isDaimyo = true; 
            newLeader.loyalty = 100; // ★新しく大名になったら、忠誠度を100にします！
            this.clans.find(c => c.id === clanId).leaderId = newLeaderId; 
            
            // ★追加：新しい大名が住んでいるお城を直轄（軍団ID: 0）に戻します
            const daimyoCastle = this.getCastle(newLeader.castleId);
            if (daimyoCastle) {
                daimyoCastle.legionId = 0;
            }
        } 
        this.updateAllCastlesLords();
    }
    
    saveGameToFile() { 
        const data = { 
            year: this.year, 
            month: this.month, 
            gameStartYear: this.gameStartYear || window.MainParams.StartYear,
            gameStartMonth: this.gameStartMonth || window.MainParams.StartMonth,
            marketRate: this.marketRate,
            castles: this.castles, 
            bushos: this.bushos, 
            clans: this.clans,
            princesses: this.princesses, // ★姫の名簿もセーブデータに書き込みます
            provinces: this.provinces, // ★地方の名簿もセーブデータに書き込みます
            legions: this.legions, // ★今回追加：軍団の名簿もセーブデータに書き込みます
            playerClanId: this.playerClanId,
            kunishus: this.kunishuSystem.kunishus,
            mapWidth: this.mapWidth,
            mapHeight: this.mapHeight,
            aiOperations: this.aiOperationManager.save(),
            turnQueueIds: this.turnQueue.map(c => c.id),
            currentIndex: this.currentIndex,
            flags: this.flags || {}
        };
        const blob = new Blob([JSON.stringify(data, null, 2)], {type: 'application/json'}); 
        const url = URL.createObjectURL(blob); 
        const a = document.createElement('a'); a.href = url; a.download = `sengoku_save_${this.year}_${this.month}.json`; a.click(); URL.revokeObjectURL(url); 
    }
    
    loadGameFromFile(e) { 
        const file = e.target.files[0]; if (!file) return; 
        
        // ★ここを書き足し！：同じファイルを選んでも反応するように、選択状態をリセットします
        e.target.value = '';
        
        const reader = new FileReader(); 
        reader.onload = async (evt) => {
            try { 
                // ★ここから追加：前のゲームの記憶やフラグを綺麗にお掃除します！
                this.isProcessingAI = false; // AI思考中フラグを解除！
                if (this.aiTimer) {
                    clearTimeout(this.aiTimer);
                    this.aiTimer = null;
                }
                this.selectionMode = null;
                this.validTargets = [];
                this.lastMenuState = null;
                if (this.warManager && this.warManager.state) {
                    this.warManager.state.active = false;
                }
                if (this.ui) {
                    this.ui.logHistory = [];
                    this.ui.clearWarLog();
                    // ★ここから追加：さっき作った、コマンドを初期化して隠す魔法をロードの時にも使います！
                    if (typeof this.ui.clearCommandMenu === 'function') {
                        this.ui.clearCommandMenu();
                    }
                }
                
                // ★追加：過去に戻るために、イベントの引き出しを新品に取り替えておきます！
                this.eventManager = new EventManager(this);
                
                const d = JSON.parse(evt.target.result); 
                this.flags = d.flags || {};
                this.year = d.year;
                this.month = d.month;
                this.gameStartYear = d.gameStartYear || window.MainParams.StartYear;
                this.gameStartMonth = d.gameStartMonth || window.MainParams.StartMonth;
                this.playerClanId = d.playerClanId || 1;
                this.marketRate = d.marketRate !== undefined ? d.marketRate : 1.0;
                
                // ★マップの大きさをセーブデータから復元します
                this.mapWidth = d.mapWidth;
                this.mapHeight = d.mapHeight;
                
                // ★追加：AIの作戦データを復元します
                this.aiOperationManager.load(d.aiOperations);

                // ★ 地図だけでなく、お城や地方の画像も全部揃うまで「必ず」待機するようにします
                const imageUrls = [
                    './data/images/map/japan_map.png',
                    './data/images/map/shiro_icon001.png',
                    './data/images/map/japan_colorcode_map.png',
                    './data/images/map/japan_white_map.png',
                    './data/images/map/japan_provinces.png'
                ];

                await Promise.all(imageUrls.map(url => new Promise(resolve => {
                    const img = new Image();
                    img.onload = () => {
                        // もし読み込んだのがメインの地図だったら、その大きさをゲームに教えます
                        if (url.includes('japan_map.png')) {
                            this.mapWidth = img.width;
                            this.mapHeight = img.height;
                        }
                        resolve();
                    };
                    img.onerror = () => {
                        // 失敗してもゲームが止まらないようにします
                        if (url.includes('japan_map.png')) {
                            this.mapWidth = 1200;
                            this.mapHeight = 800;
                        }
                        resolve();
                    };
                    img.src = url;
                })));

                this.castles = d.castles.map(c => new Castle(c)); 
                this.bushos = d.bushos.map(b => new Busho(b));
                // ★今回追加：セーブデータから姫の名簿を元通りに復元します
                this.princesses = (d.princesses || []).map(p => new Princess(p));
                // ★今回追加：セーブデータから地方の名簿を元通りに復元します
                this.provinces = (d.provinces || []).map(p => new Province(p));
                // ★今回追加：セーブデータから軍団の名簿を元通りに復元します
                this.legions = (d.legions || []).map(l => new Legion(l));
                
                // ★追加：ロード時に姫の一門情報を再構築します
                this.princesses.forEach(p => p.updateFamilyIds(this.bushos));

                // ★ここを書き足し！：古いデータでシールが剥がれている場合のために、名簿を見て貼り直します！
                this.legions.forEach(legion => {
                    const commander = this.bushos.find(b => b.id === legion.commanderId);
                    if (commander) {
                        commander.isCommander = true;
                    }
                });

                if (d.kunishus) {
                    this.kunishuSystem.setKunishuData(d.kunishus.map(k => new Kunishu(k)));
                } else {
                    this.kunishuSystem.setKunishuData([]);
                }

                if (d.clans) {
                    this.clans = d.clans.map(c => new Clan(c));
                } else {
                    const scenario = SCENARIOS[0]; 
                    await DataManager.loadParameters("./data/parameter.csv");
                    const data = await DataManager.loadAll(scenario.folder);
                    this.clans = data.clans;
                }
                
                // セーブデータ読み込み時にも官位マスタデータをセットします
                const courtRanksText = await DataManager.fetchText("./data/imperialCourtRank.csv").catch(() => "");
                const courtRanks = courtRanksText ? DataManager.parseCSV(courtRanksText, CourtRank) : [];
                this.courtRankSystem.setRankData(courtRanks);

                document.getElementById('title-screen').classList.add('hidden');
                document.getElementById('app').classList.remove('hidden'); 
                
                this.phase = 'game';
                
                // セーブデータのメモから順番を復元します！
                if (d.turnQueueIds && d.turnQueueIds.length > 0) {
                    // メモ書きがある場合は、そのIDの順番通りに城を並べ直して、続きから始めます
                    this.turnQueue = d.turnQueueIds.map(id => this.castles.find(c => c.id === id)).filter(c => c !== undefined);
                    this.currentIndex = d.currentIndex || 0;
                } else {
                    // 古いセーブデータなどでメモ書きがない場合は、全ての城を混ぜて最初からにします（空城も含めます）
                    this.turnQueue = [...this.castles].sort(() => Math.random() - 0.5);
                    this.currentIndex = 0;
                }
                
                this.updateAllCastlesLords();

                // ロードした時も、念のため年齢による能力変動を再計算しておきます
                this.lifeSystem.updateAllBushosAge();

                // ★ここから追加：ロード時にも大名家の表示名を更新して同名被りを防ぎます！
                this.updateClanDisplayNames();

                // カットインを出す「前」に、先にマップを描いておく魔法です！
                this.ui.hasInitializedMap = false;
                this.ui.renderMap();

                // セーブデータを読み込んだ瞬間にBGMを切り替えます
                if (window.AudioManager) {
                    window.AudioManager.playBGM('SC_ex_Town2_Fortress.ogg');
                }

                // マップが描かれた綺麗な画面の上で、カットインをゆっくり出します
                await this.ui.showCutin(`ロード完了: ${this.year}年 ${this.month}月`);
                
                this.processTurn();
            } catch(err) { console.error(err); alert("セーブデータの読み込みに失敗しました"); } 
// ------------------------------
        }; 
        reader.readAsText(file); 
    }
}

window.addEventListener('DOMContentLoaded', () => {
    // 右クリックメニューが出ないようにする設定です
    document.addEventListener('contextmenu', (e) => {
        e.preventDefault();
    }, { passive: false });

    // スマホ特有の「引っ張って更新」やスワイプによる誤動作を完全に防ぐ魔法です！
    document.addEventListener('touchmove', (e) => {
        // スクロールできる場所（地図やリストなど）以外を触った時は、画面が動かないように固定します
        if (!e.target.closest('.scroll-wrapper, .list-container, #map-scroll-container, .fw-map-scroll, .scenario-desc-box, .result-body, .message-area')) {
            e.preventDefault();
        }
    }, { passive: false });

    // ゲームの本体（心臓）を新しく作って、動き出せるようにします
    window.GameApp = new GameManager();
});