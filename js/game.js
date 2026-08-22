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
    { name: "1560年 桶狭間の戦い", desc: "海道一の弓取り・今川義元が大軍で上洛を狙う。", folder: "1560_okehazama", startYear: 1560, startMonth: 4 },
    { name: "1560年 テストシナリオ", desc: "テスト用モード", folder: "1560_test", startYear: 1560, startMonth: 4 }
    // { name: "1562年 清洲同盟", desc: "桶狭間より２年。２人の英雄は清州の地にて再会を果たす。", folder: "1562_kiyosudoumei", startYear: 1562, startMonth: 1 }
];



/* ==========================================================================
    データ管理 (DataManager)
   ========================================================================== */
class DataManager {
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
            if (window.MainParams.System.UseRandomNames) {
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
                this.fetchCompressed(path + "warriors.bin").catch(() => this.fetchText(path + "warriors.csv")), // ★ .binがない場合は .csv を読み込む魔法です！
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
            throw error;
        }
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
    
    static async fetchCompressed(url) {
        // キャッシュ（古いデータ）を読み込まないためのおまじないです
        const mark = url.includes('?') ? '&v=' : '?v=';
        const noCacheUrl = url + mark + Date.now();
        
        const response = await fetch(noCacheUrl);
        if (!response.ok) throw new Error(`Failed to load ${url}`);
        
        // 1. データを「文字」ではなく「バイナリ（ArrayBuffer）」として受け取ります
        const arrayBuffer = await response.arrayBuffer();
        
        // 2. pakoを使って、圧縮されたバイナリデータを元の状態に解凍します
        const decompressed = pako.inflate(new Uint8Array(arrayBuffer));
        
        // 3. 解凍したデータを、人間の読める「文字（テキスト）」に戻します
        const textDecoder = new TextDecoder("utf-8");
        let text = textDecoder.decode(decompressed);
        
        // 先頭に不要な見えない文字（BOM）があれば取り除きます
        if (text.charCodeAt(0) === 0xFEFF) {
            text = text.slice(1);
        }
        return text; // 解凍済みのCSVテキストとして返します
    }
    
    // ★ゲーム開始時の状態を作る魔法です！（今回から軍団の名簿も受け取ります）
    static joinData(clans, castles, bushos, princesses = [], legions = []) {
        const startYear = window.MainParams.StartYear; // 今のシナリオの開始年（例：1560年）
        
        // ★高速化：お城や大名家などをIDから一瞬で探せる「早見表（Map）」を作っておきます！
        const clanMap = new Map();
        clans.forEach(c => clanMap.set(Number(c.id), c));
        
        const castleMap = new Map();
        castles.forEach(c => castleMap.set(Number(c.id), c));

        const bushoMap = new Map();
        bushos.forEach(b => bushoMap.set(Number(b.id), b));

        // ★大名（leaderId）や城主（castellanId）から逆引きできる専用の早見表も作ります
        const clanLeaderMap = new Map();
        clans.forEach(c => clanLeaderMap.set(Number(c.leaderId), c));

        const castellanMap = new Map();
        castles.forEach(c => castellanMap.set(Number(c.castellanId), c));

        // ★武将と同じように、ダミー用（startYearが9999）の姫や、
        // 開始年よりも前に寿命を迎えている（昔に亡くなっている）姫を死亡扱いにします！
        princesses.forEach(p => {
            if (p.startYear === 9999 || p.endYear < startYear) {
                p.status = 'dead';
            } else if (p.birthYear > startYear) {
                p.status = 'unborn';  // 武将と同じ 'unborn' に統一します
                p.isNotBorn = true;   // まだ生まれていない姫（出生前）
            } else if (p.startYear > startYear) {
                p.status = 'unborn';
                p.isNotBorn = false;  // 生まれてはいるが、まだ登場の年齢になっていない姫
            }
            
            // ★ここを追加：まだ登場していない姫は、大名家の「姫の名簿」から一旦名前を消しておきます！
            if (p.status === 'dead' || p.status === 'unborn') {
                clans.forEach(clan => {
                    if (clan.princessIds && clan.princessIds.includes(p.id)) {
                        clan.princessIds = clan.princessIds.filter(id => id !== p.id);
                    }
                });
            }
        });

        castles.forEach(c => c.samuraiIds = []);
        bushos.forEach(b => {
            // ==========================================
            // ★ゲーム開始時点で「すでに改名しているはず」の武将の名前と読み仮名を変えておく魔法です！
            if (b.nameChange) {
                const changes = b.nameChange.split('/');
                const validChanges = [];

                for (const change of changes) {
                    const parts = change.split(':');
                    if (parts.length === 3) {
                        const targetYear = Number(parts[0].trim());
                        // ゲーム開始年「以前」か「同じ年」に起きた改名イベントを集めます
                        // （daimyoなどの文字が入っていてNaNになるものは無視します）
                        if (!isNaN(targetYear) && targetYear <= startYear) {
                            validChanges.push({
                                year: targetYear,
                                nameData: parts[1].trim(),
                                yomiData: parts[2].trim()
                            });
                        }
                    }
                }

                // 順番に上書きするために、年代の古い順（昇順）に並び替えます
                validChanges.sort((a, b) => a.year - b.year);

                // 古いものから順番に名前と読み仮名を更新していきます
                for (const change of validChanges) {
                    b.applyNameChangeData(change.nameData, change.yomiData);
                }
            }

            // ★ここから追加：ゲーム開始時点で「すでに顔が変わっているはず」の武将の顔グラを変えておく魔法です！
            if (b.faceChange) {
                const changes = b.faceChange.split('/');
                let latestYear = -1;
                let latestFaceData = "";

                for (const change of changes) {
                    const parts = change.split(':');
                    if (parts.length === 2) {
                        const targetYear = Number(parts[0].trim());
                        // 条件が数字（年）で、ゲーム開始年「以前」か「同じ年」の中で一番新しいものを探します
                        if (!isNaN(targetYear) && targetYear <= startYear && targetYear > latestYear) {
                            latestYear = targetYear;
                            latestFaceData = parts[1].trim();
                        }
                    }
                }

                // もし過去の顔変更データが見つかったら、最初からその顔にしておきます！
                if (latestYear !== -1 && latestFaceData) {
                    b.faceIcon = latestFaceData;
                }
            }
            
            // ★ゲーム開始時点で既に寿命を迎えている（昔に亡くなっている）、またはダミー用（startYearが9999）武将の処理です！
            if (b.endYear < startYear || b.startYear === 9999 || b.status === 'dead') {
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
                    // ★高速化：早見表（clanLeaderMap）を使って大名をパッと探します！
                    const clan = clanLeaderMap.get(Number(b.id));
                    if (clan) {
                        b.isDaimyo = true;
                        b.loyalty = 100; // ★大名は自分の家なので、忠誠度は絶対に100にします！
                        
                        // ★ここから追加：開始時点で既に大名なら、「daimyo:」の改名を適用します！
                        if (b.nameChange && b.nameChange.includes('daimyo:')) {
                            const changes = b.nameChange.split('/');
                            for (const change of changes) {
                                const parts = change.split(':');
                                if (parts.length === 3 && parts[0].trim() === 'daimyo') {
                                    // ★修正：新しく作った共通の改名魔法を呼び出します！
                                    b.applyNameChangeData(parts[1].trim(), parts[2].trim());
                                }
                            }
                        }

                        // ★開始時点で既に大名なら、「daimyo:」の顔変更データを適用します！
                        // （「/」区切りで複数指定されている場合にも対応させます）
                        if (b.faceChange && b.faceChange.includes('daimyo:')) {
                            const changes = b.faceChange.split('/');
                            for (const change of changes) {
                                const parts = change.split(':');
                                if (parts.length === 2 && parts[0].trim() === 'daimyo') {
                                    const newFace = parts[1].trim();
                                    if (newFace) {
                                        b.faceIcon = newFace;
                                    }
                                }
                            }
                        }
                        
                        // ★大名の名前が変わっていたら、大名家の名前も自動で「〇〇家」に合わせます！
                        clan.name = b.familyName + "家";
                        clan.baseName = clan.name; // ★元々の名前の箱にも入れておきます！
                    }
                    // ★高速化：早見表（castellanMap）を使って城主をパッと探します！
                    const castleAsCastellan = castellanMap.get(Number(b.id));
                if (castleAsCastellan) b.isCastellan = true;
                
                if (b.clan === 0 && (b.belongKunishuId || 0) === 0) {
                    b.status = 'ronin';
                    b.loyalty = 50; // ★浪人の場合も、ゲーム開始時に忠誠度を50にしておきます！
                } else {
                    b.status = 'active'; // 明確に「活動中」にします
                }
                
                // お城の中に武将を入れてあげます
                // ★高速化：早見表（castleMap）からお城をパッと探します！
                const c = castleMap.get(Number(b.castleId));
                if(c) c.samuraiIds.push(b.id);
            }
            
            // ★今回追加：軍師の設定
            if (b.clan !== 0) {
                // ★高速化：早見表（clanMap）から大名家をパッと探します！
                const clan = clanMap.get(Number(b.clan));
                if (clan && Number(clan.gunshiId) === Number(b.id)) {
                    b.isGunshi = true;
                }
            }
        });
        
        // ★追加：ゲーム開始時点で亡くなっている武将や姫の「配偶者のつながり」を綺麗にお掃除します！
        // 1. 亡くなっている姫の夫から、妻の記録を消します
        princesses.forEach(p => {
            if (p.status === 'dead' && p.husbandId > 0) {
                // ★高速化：早見表から旦那さんをパッと探します！
                const husband = bushoMap.get(Number(p.husbandId));
                if (husband && husband.wifeIds) {
                    husband.wifeIds = husband.wifeIds.filter(id => id !== p.id);
                }
                p.husbandId = 0;
            }
        });

        // 2. 亡くなっている武将の妻から、夫の記録を消して「未婚（未亡人）」に戻します
        bushos.forEach(b => {
            if (b.status === 'dead' && b.wifeIds && b.wifeIds.length > 0) {
                b.wifeIds = []; // 亡くなった武将の奥さんリストも空っぽにします
            }
        });

        // ★今回追加：すべての武将と姫の初期設定、および亡くなった配偶者のお掃除が終わった【一番最後】に、
        // まとめて一門関係（金庫の繋がり、娘婿、母方の実家など）を完璧な順番で構築します！
        FamilyLinker.rebuildAllFamilyIds(bushos, princesses);

        // ★ここから軍団の初期設定です！
        legions.forEach(legion => {
            // 軍団長に就任する武将を探します
            // ★高速化：早見表から軍団長をパッと探します！
            const commander = bushoMap.get(Number(legion.commanderId));
            if (commander) {
                // ★ここを書き足し！：軍団長（国主）のシールをしっかり貼ります！
                commander.isCommander = true;

                // ★修正：武将本人ではなく、その武将がいる「お城」に軍団番号を書き込みます
                // ★高速化：早見表からお城をパッと探します！
                const castle = castleMap.get(Number(commander.castleId));
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
    
    // 城同士の直接隣接判定は地図グラフ専門サービスへ一元化します。
    static isAdjacent(c1, c2) {
        return MapGraphService.isAdjacent(c1, c2);
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
        
        let finalVal = Math.max(1, Math.round(val)); 
        // ★追加：武芸適性による訓練効果アップ
        if (typeof SkillManager !== 'undefined') {
            finalVal += SkillManager.calcBugeiTrainingBonus(busho);
        }
        return finalVal;
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

    // ★追加：軍師が警告を出す「不満を持っている武将」かどうかの判定を一元化します
    static isUnhappyBusho(busho) {
        // 武将データが無い場合や、大名・諸勢力は対象外にします
        if (!busho || busho.isDaimyo || busho.belongKunishuId > 0) return false;
        
        const advLoyalty = window.MainParams.Gunshi.AdviceLoyalty;
        
        // 忠誠度が基準値以下の武将を不満と判定します
        return busho.loyalty <= advLoyalty;
    }

    static calcBaseGoldIncome(castle) {
        const baseGold = (castle.population * 0.01) + (castle.peoplesLoyalty / 2) + (castle.commerce / 4);
        return Math.floor(baseGold * window.MainParams.Economy.IncomeGoldRate);
    }
    
    static calcBaseRiceIncome(castle) {
        // 以前の計算式
        // const baseRice = (castle.kokudaka + castle.peoplesLoyalty) * (Math.sqrt(castle.peoplesLoyalty) + 2);

        // 新しい計算式：現在石高 × 現在民忠 / 10
        // エラー防止のため、民忠がマイナスになった場合は0として計算する安全対策を入れています
        const safeLoyalty = Math.max(0, castle.peoplesLoyalty);
        const baseRice = castle.kokudaka * safeLoyalty / 10;
        
        return Math.floor(baseRice);
    }

    // ★追加：徴兵の武将能力部分の計算（リストの並び替えなどにも使います）
    static calcDraftBushoScore(busho) {
        return (busho.leadership * 1.5) + (busho.charm * 1.5) + (Math.sqrt(busho.loyalty) * 2);
    }

    // ★追加：徴兵の「効率」を計算します（ここが複数ファイルで使われる大元の式です）
    // （他のファイルから人口が送られてこなかった時の保険として、デフォルトを20000にしています）
    static calcDraftEfficiency(busho, peoplesLoyalty, population = 20000) {
        const bushoScore = this.calcDraftBushoScore(busho);
        const baseEfficiency = (bushoScore + (Math.sqrt(peoplesLoyalty) * 2)) / 500;
        
        // 人口が0などで計算がおかしくならないよう、最低でも100人はいるものとして安全に計算します
        const safePopulation = Math.max(100, population);
        
        // 人口20000人を基準（1.0倍）として、4乗根（0.25乗）で倍率を計算します
        const popMultiplier = Math.pow(safePopulation / 20000, 0.25);
        
        return baseEfficiency * popMultiplier;
    }

    // ★追加：徴兵の「兵士1人あたりの単価」を計算する一元化窓口です
    static calcDraftUnitPrice(busho, peoplesLoyalty, population = 20000) {
        const efficiency = this.calcDraftEfficiency(busho, peoplesLoyalty, population);
        // 万が一効率が0になってエラー（0割り）が起きるのを防ぐための安全装置です
        if (efficiency <= 0) return 9999; 
        return 1 / efficiency;
    }

    // AI用：お金を指定して、集まる兵士数を計算します
    static calcDraftFromGold(gold, busho, peoplesLoyalty, population = 20000) { 
        const efficiency = this.calcDraftEfficiency(busho, peoplesLoyalty, population);
        return Math.floor(gold * efficiency); 
    }
    // プレイヤー用：集めたい兵士数を指定して、必要なお金を計算します
    static calcDraftCost(soldiers, busho, peoplesLoyalty, population = 20000, isExecute = false) { 
        if (isExecute) {
            busho.expLeadership = (busho.expLeadership || 0) + Math.floor(soldiers / 300);
            busho.expStrength = (busho.expStrength || 0) + Math.floor(soldiers / 200);
        }
        const efficiency = this.calcDraftEfficiency(busho, peoplesLoyalty, population);
        return Math.ceil(soldiers / efficiency); 
    }
    
    // ==========================================
    // ★追加：商人系諸勢力による割引率（お得度）を計算する魔法
    // ==========================================
    static getMerchantDiscount(clanId) {
        if (!window.GameApp || !window.GameApp.kunishuSystem) return 0;
        let maxDiscount = 0;
        const kunishus = window.GameApp.kunishuSystem.getAliveKunishus();
        
        for (let k of kunishus) {
            if (k.ideology === '商人') {
                const rel = k.getRelation(clanId);
                // 友好度60以上の時だけ割引してくれます
                if (rel >= 60) {
                    // 友好度4につき1%（0.01）割引します
                    const discount = Math.floor((rel - 60) / 4) * 0.01;
                    // 複数の商人と仲が良くても、一番高い割引率1つだけを適用します
                    if (discount > maxDiscount) maxDiscount = discount;
                }
            }
        }
        // 最大でも10%（0.10）までにストップをかけます
        return Math.min(0.10, maxDiscount); 
    }
    
    // ==========================================
    // ★追加：徴兵時に民忠と人口を減らす処理を一元化する魔法
    // ==========================================
    static applyDraftPenalty(castle, soldiers) {
        // 人口が0以下の時は何もしないように安全対策をします
        if (castle.population <= 0) return 0;
        
        // 徴兵した割合を計算します
        const draftRatio = soldiers / castle.population;
        
        // ペナルティの割合（2倍）を計算します
        const penaltyRatio = draftRatio * 2;
        
        // 今の民忠からどれくらい減らすかを計算します
        const loyaltyPenalty = Math.floor(castle.peoplesLoyalty * penaltyRatio);
        
        // 実際の城のステータスから、民忠と人口を減らします（0未満にはならないようにします）
        castle.peoplesLoyalty = Math.max(0, castle.peoplesLoyalty - loyaltyPenalty);
        castle.population = Math.max(0, castle.population - soldiers);
        
        // 減らした民忠の量を返してあげます（結果のメッセージ表示などに使えます）
        return loyaltyPenalty;
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
            // 岩村城(4)、黒川城(61)、塩生城(62)、日野江城(157)、隈本城(158)、岩尾城(159)、蠣崎城(191)、野辺地城(192)、八戸城(193)、三戸城(194)、花輪館(196)、白石城(206)、三春城(211)、須賀川城(212)、杉目城(214)、二本松城(215)、猪苗代城(216)
            if ([4, 61, 62, 157, 158, 159, 191, 192, 193, 194, 196, 206, 211, 212, 214, 215, 216].includes(c.id)) return true;
            // 常陸国(ID15)、淡路国(ID36)、日向国(ID62)、薩摩国(ID63)、大隅国(ID64)、対馬国(ID68)
            if ([15, 36, 62, 63, 64, 68].includes(c.provinceId)) return true; 
            if (window.GameApp && window.GameApp.provinces) {
                const prov = window.GameApp.provinces.find(p => p.id === c.provinceId);
                // 甲信地方(ID3)
                if (prov && prov.regionId === 3) return true;
            }
        } else if (itemType === 'gun') {
            // 石山御坊(ID33)、雑賀城(ID42)、赤尾木城(ID185)、今浜城(ID186)
            if ([33, 42, 185, 186].includes(c.id)) return true;
        }
        return false;
    }
    
    // そのお城が港かどうかを判定する魔法です
    static isPortCastle(c) {
        if (!c) return false;
        // 港となる拠点のIDを、ここ一箇所だけで管理します
        //春日山城(ID2)、石山御坊(ID33)、松波城(ID72)、尾山御坊(ID74)、北庄城(ID76)、立花山城(ID148)、平戸城(ID155)、内城(ID169)、厳原城(ID174)、湊城(ID219)、安濃津城(ID251)
        const portCastleIds = [2, 33, 72, 74, 76, 148, 155, 169, 174, 219, 251];
        return portCastleIds.includes(c.id);
    }
    
    // 画面の相場表示に使う「小数点まで正確な1個の単価」を出す魔法
    static calcBuyEquipUnitPrice(daimyo, castellan, itemType) {
        const eff = this.calcBuyEquipEfficiency(daimyo, castellan, itemType);
        let basePrice = itemType === 'horse' ? 2 : 5;
        
        // ★ここから追加：鉄砲伝来による価格変動（1543年：20倍 → 1553年：15倍 → 1573年：1倍）
        if (itemType === 'gun' && window.GameApp) {
            const y = window.GameApp.year;
            const m = window.GameApp.month;
            if (y >= 1543 && y < 1553) {
                // 10年間（120ヶ月）かけて20倍から15倍に緩やかに下がります
                const monthsPassed = (y - 1543) * 12 + (m - 1);
                basePrice *= (20.0 - (5.0 * (monthsPassed / 120)));
            } else if (y >= 1553 && y < 1573) {
                // 20年間（240ヶ月）かけて15倍から1倍にどんどん下がります
                const monthsPassed = (y - 1553) * 12 + (m - 1);
                basePrice *= (15.0 - (14.0 * (monthsPassed / 240)));
            } else if (y <= 1542) {
                // 1542年以前は買えませんが、念のためとんでもなく高い値段にしておきます
                basePrice *= 9999; 
            }
            // 1573年以降は変動なし（1倍）のままになります
        }

        let unitPrice = basePrice / (1 + eff / 10);
        
        let hasProdCastle = false;
        let hasVassalProdCastle = false; // ★追加：支配している勢力が産地を持っているか
        const myClanId = daimyo ? daimyo.clan : (castellan ? castellan.clan : 0);
        
        if (daimyo && window.GameApp && window.GameApp.castles) {
            hasProdCastle = window.GameApp.castles.some(c => c.ownerClan === daimyo.clan && this.isProdCastle(c, itemType));
        } else if (castellan && window.GameApp && window.GameApp.castles) {
            const myCastle = window.GameApp.castles.find(c => c.id === castellan.castleId);
            hasProdCastle = this.isProdCastle(myCastle, itemType);
        } else if (castellan && itemType === 'gun') {
            // 万が一の予備チェック（鉄砲用）
            hasProdCastle = [33, 42, 185, 186].includes(castellan.castleId);
        }
        
        // ★追加：自分が産地を持っていなければ、支配している勢力が産地を持っているか探します
        if (!hasProdCastle && myClanId > 0 && window.GameApp && window.GameApp.clans && window.GameApp.castles) {
            const clans = window.GameApp.clans.filter(c => c.id !== 0 && c.id !== myClanId && !c.isDestroyed);
            for (let otherClan of clans) {
                const rel = window.GameApp.getRelation(myClanId, otherClan.id);
                // 自分から見て相手を「支配」している場合
                if (rel && rel.status === '支配') {
                    // その支配勢力が産地を持っているかチェック
                    const vassalHasProd = window.GameApp.castles.some(c => c.ownerClan === otherClan.id && this.isProdCastle(c, itemType));
                    if (vassalHasProd) {
                        hasVassalProdCastle = true;
                        break; // 1つでも見つかればOK
                    }
                }
            }
        }
        
        // ★ここから今回追加：産地による割引効果の計算
        let prodDiscount = 0.5; // 自領産地の基本割引率（0.5 ＝ 50%オフ ＝ 単価1/2）
        let vassalProdDiscount = 0.25; // 従属産地の基本割引率（0.25 ＝ 25%オフ ＝ 単価3/4）
        let baseDiscountRate = 1.0; // ★追加：年代による効果の出にくさを表す倍率

        if (itemType === 'gun' && window.GameApp) {
            const y = window.GameApp.year;
            const m = window.GameApp.month;
            if (y >= 1543 && y < 1563) {
                // 1543年〜1563年の20年間（240ヶ月）で、割引率が0.2（20%オフ＝単価4/5）から0.5（50%オフ＝単価1/2）へ徐々に増えます
                const monthsPassed = (y - 1543) * 12 + (m - 1);
                prodDiscount = 0.2 + (0.3 * (monthsPassed / 240));
                // 従属勢力はその半分の恩恵とします（0.1 → 0.25 へ徐々に増える）
                vassalProdDiscount = prodDiscount / 2;
                // 本来の50%割引に対して、今どれくらいの倍率で効果が出ているかを計算します
                baseDiscountRate = prodDiscount / 0.5;
            } else if (y <= 1542) {
                // 1542年以前はそもそも鉄砲がないので割引なし
                prodDiscount = 0;
                vassalProdDiscount = 0;
                baseDiscountRate = 0;
            }
        }

        // ★追加：産地諸勢力による割引の計算
        let kunishuProdDiscount = 0;
        if (myClanId > 0 && window.GameApp && window.GameApp.kunishuSystem && window.GameApp.castles) {
            const kunishus = window.GameApp.kunishuSystem.getAliveKunishus();
            for (let k of kunishus) {
                const castle = window.GameApp.castles.find(c => c.id === k.castleId);
                // その諸勢力がいる城が、馬や鉄砲の産地かどうかチェック
                if (this.isProdCastle(castle, itemType)) {
                    const rel = k.getRelation(myClanId);
                    if (rel >= 60) {
                        // 友好度60以上の時、友好度2につき1%（0.01）割引します
                        let discount = Math.floor((rel - 60) / 2) * 0.01;
                        discount = Math.min(0.20, discount); // 最大20%まで
                        // 鉄砲伝来初期などの「効果の出にくさ（年代減少）」を諸勢力にも適用します
                        discount = discount * baseDiscountRate;
                        
                        if (discount > kunishuProdDiscount) {
                            kunishuProdDiscount = discount;
                        }
                    }
                }
            }
        }

        // ★変更：自領、従属、諸勢力の中で一番「割引率の高いもの」を優先します！
        let finalProdDiscount = 0;
        if (hasProdCastle) finalProdDiscount = prodDiscount;
        if (hasVassalProdCastle && vassalProdDiscount > finalProdDiscount) finalProdDiscount = vassalProdDiscount;
        if (kunishuProdDiscount > finalProdDiscount) finalProdDiscount = kunishuProdDiscount;

        // 産地割引を単価に適用します
        unitPrice = unitPrice * (1.0 - finalProdDiscount);
        
        // ★追加：商人系諸勢力による割引の計算（産地割引とさらに重複します！）
        if (myClanId > 0) {
            const merchantDiscount = this.getMerchantDiscount(myClanId);
            if (merchantDiscount > 0) {
                // 商人と仲が良いと、さらに単価が安くなります！
                unitPrice = unitPrice * (1.0 - merchantDiscount);
            }
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
        // ★Round10：AI出陣直前に何度も通るため、到達判定の一時オブジェクト生成を減らします。
        if (!startCastle || !targetCastle) return false;

        if (this.isAdjacent(startCastle, targetCastle)) return true;

        const visited = new Set([Number(startCastle.id)]);
        const queue = [startCastle];
        let head = 0;

        while (head < queue.length) {
            const current = queue[head++];
            const adjacentIds = current.adjacentCastleIds || [];

            for (const adjId of adjacentIds) {
                const next = game.getCastle(adjId);
                if (!next) continue;
                if (Number(next.id) === Number(targetCastle.id)) return true;

                const nextId = Number(next.id);
                if (visited.has(nextId)) continue;

                let canPass = false;
                if (Number(next.ownerClan) === Number(movingClanId)) {
                    canPass = true;
                } else if (Number(next.ownerClan) !== 0) {
                    const rel = game.getRelation(movingClanId, next.ownerClan);
                    if (rel && ['同盟', '支配', '従属'].includes(rel.status)) canPass = true;
                }

                if (canPass) {
                    visited.add(nextId);
                    queue.push(next);
                }
            }
        }
        return false;
    }
    
    // ==========================================
    // ★追加：起点となるお城から、「自領（または自軍団）」だけを通って辿り着けるお城のリストと、その外側（隣接する敵城など）のリストをまとめて取得する一元化魔法です！
    // ==========================================
    static getReachableTerritory(game, startCastle, isLegionOnly = false) {
        const myCastles = new Set();
        const enemyCastles = new Set();
        
        // ★起点のお城が存在しないなどのエラーを防ぎます
        if (!startCastle) return { myCastles: [], enemyCastles: [] };
        
        const clanId = startCastle.ownerClan;
        const legionId = startCastle.legionId;
        const queue = [startCastle];
        myCastles.add(startCastle.id);
        
        while (queue.length > 0) {
            const current = queue.shift();
            
            if (current.adjacentCastleIds) {
                current.adjacentCastleIds.forEach(adjId => {
                    const adjCastle = game.getCastle(adjId);
                    if (adjCastle) {
                        // 自領かどうかの判定（isLegionOnlyがtrueなら軍団も一致するか見ます）
                        // ★修正：直轄（軍団ID0）の場合は、isLegionOnlyがtrueでも軍団制限を無視して通れるようにします！
                        const isMyTerritory = (adjCastle.ownerClan === clanId) && (!isLegionOnly || adjCastle.legionId === legionId || legionId === 0);
                        
                        if (isMyTerritory) {
                            // 自領ならさらに奥へ進むためにキューに入れます
                            if (!myCastles.has(adjId)) {
                                myCastles.add(adjId);
                                queue.push(adjCastle);
                            }
                        } else {
                            // 自領以外は境界線（直接攻撃できるターゲット）としてメモします
                            enemyCastles.add(adjId);
                        }
                    }
                });
            }
        }
        
        // お城のデータそのもののリストに変換して返します
        return { 
            myCastles: Array.from(myCastles).map(id => game.getCastle(id)), 
            enemyCastles: Array.from(enemyCastles).map(id => game.getCastle(id)) 
        };
    }
    
    // ★最短ルートの中で「最後の一歩（攻撃先への道）」が海路かどうかを調べる魔法です！
    static isSeaRoute(game, startCastle, targetCastle, movingClanId) {
        if (!startCastle || !targetCastle) return false;
        if (startCastle.id === targetCastle.id) return false;

        const visited = new Set();
        const queue = [{ castle: startCastle }];
        visited.add(startCastle.id);

        while (queue.length > 0) {
            const currentData = queue.shift();
            const current = currentData.castle;

            const neighbors = [];
            if (current.adjacentCastleIds) {
                current.adjacentCastleIds.forEach(adjId => {
                    const c = game.getCastle(adjId);
                    if (c) neighbors.push(c);
                });
            }
            
            for (const next of neighbors) {
                if (next.id === targetCastle.id) {
                    // 目標に到着した！ この最短ルートの「最後の一歩」が海路かどうかをチェックします
                    if (current.seaRouteIds && current.seaRouteIds.includes(next.id)) {
                        return true; // 最後が海路なら海戦！
                    }
                    return false; // 最後が陸路なら陸戦！
                }
                
                if (!visited.has(next.id)) {
                    let canPass = false;
                    
                    if (Number(next.ownerClan) === Number(movingClanId)) {
                        canPass = true;
                    } else if (next.ownerClan !== 0) {
                        const rel = game.getRelation(movingClanId, next.ownerClan);
                        if (rel && ['同盟', '支配', '従属'].includes(rel.status)) {
                            canPass = true;
                        }
                    }
                    
                    if (canPass) {
                        visited.add(next.id);
                        queue.push({ castle: next });
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
        
        // ★追加：一門の武将が自勢力にいる場合は成功率+0.2
        if (window.GameApp) {
            const hasFamily = window.GameApp.bushos.some(b => b.clan === recruiter.clan && b.status !== 'dead' && b.id !== target.id && b.familyIds && target.familyIds && b.familyIds.some(fId => target.familyIds.includes(fId)));
            if (hasFamily) {
                prob += 0.2;
                prob = Math.max(0, Math.min(1.0, prob));
            }
        }

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
        
        // ★追加：スキルマネージャーから登用の成功率ボーナスを受け取ります
        if (typeof SkillManager !== 'undefined') {
            prob += SkillManager.calcEmployProbBonus(recruiter, window.GameApp);
        }
        
        // 確率が0より小さくなったり1.0（100%）を超えないように制限して返します
        return Math.max(0, Math.min(1.0, prob));
    }

    static calcAffinityDiff(a, b) { const diff = Math.abs(a - b); return Math.min(diff, 100 - diff); }
    static calcValueDistance(a, b) {
        const diffInno = Math.abs(a.innovation - b.innovation);
        const coopFactor = (a.cooperation + b.cooperation) / 200; 
        let dist = diffInno * (1.0 - (coopFactor * 0.5)); 
        const classicAff = this.calcAffinityDiff(a.affinity, b.affinity); 
        return Math.floor(dist * 0.8 + classicAff * 0.4); 
    }
    static calcRewardEffect(daimyo, target) {
        const S = window.MainParams.Strategy;
        const dist = this.calcValueDistance(daimyo, target);
        let penalty = dist * S.RewardDistancePenalty;
        let baseIncrease = S.RewardBaseEffect;
        let actualIncrease = baseIncrease - penalty;
        if (actualIncrease < 0) actualIncrease = 0;
        return Math.floor(actualIncrease);
    }

    // ==========================================
    // ★ここから追加：褒美の効果（忠誠度アップと承認欲求ダウン）を一元化する魔法！
    // ==========================================
    static applyRewardEffect(busho, daimyo, game) { // ★修正：お金の引数を消しました
        // 1. 忠誠度のアップ（1〜3）
        const loyaltyUp = Math.floor(Math.random() * 3) + 1;
        busho.loyalty = Math.min(100, busho.loyalty + loyaltyUp);

        // 2. 承認欲求のダウン
        // まず、大名との相性などから「効果のベース（effect）」を計算します
        const effect = this.calcRewardEffect(daimyo, busho);
        // そのベースを使って、実際にどれくらい下げるか（-effect * 2 - 5）を計算して適用します
        if (game && game.factionSystem && typeof game.factionSystem.updateRecognition === 'function') {
            game.factionSystem.updateRecognition(busho, -effect * 2 - 5);
        }

        // 画面にお知らせ（ログなど）を出すために、上がった忠誠度の数字を返してあげます
        return loyaltyUp;
    }
    
    static calcEmploymentSuccess(recruiter, target, recruiterClanPower, targetClanPower) {
        const prob = this.getEmployProb(recruiter, target, recruiterClanPower, targetClanPower);
        return Math.random() < prob;
    }

    // ==========================================
    // ★追加：徴兵の「実際に可能な最大数」を計算する一元化窓口
    // ==========================================
    static calcMaxDraftAmount(castle, busho) {
        // ★変更：計算の窓口に「お城の人口」もセットで渡すようにしました
        let maxAffordable = this.calcDraftFromGold(castle.gold, busho, castle.peoplesLoyalty, castle.population);
        // 端数でお金が足りなくならないよう、確実な数まで減らします
        while (maxAffordable > 0 && this.calcDraftCost(maxAffordable, busho, castle.peoplesLoyalty, castle.population) > castle.gold) {
            maxAffordable--;
        }
        // 人口や城の最大兵数（99999）を超えないようにします
        return Math.min(castle.population, 99999 - castle.soldiers, maxAffordable);
    }

    // ==========================================
    // ★追加：米の相場計算を根本的に一元化する魔法群
    // ==========================================
    static getBaseRiceRate(castle, provinces) {
        let rate = window.MainParams.Economy.TradeRateBase;
        if (castle && provinces) {
            const province = provinces.find(p => p.id === castle.provinceId);
            if (province && province.marketRate !== undefined) rate = province.marketRate;
        }
        return rate;
    }

    static getRiceActualRate(type, castle, provinces) {
        const baseRate = this.getBaseRiceRate(castle, provinces);
        const myClanId = castle ? castle.ownerClan : 0;
        const merchantDiscount = this.getMerchantDiscount(myClanId);
        
        let displayRate = baseRate;
        if (type === 'buy_rice') {
            displayRate = baseRate * (1.0 - merchantDiscount);
        } else if (type === 'sell_rice') {
            displayRate = baseRate * (1.0 + merchantDiscount);
        }
        
        return {
            actualRate: displayRate / 10, // ★÷10の計算をここで完全に一元化
            displayRateStr: displayRate.toFixed(1) // 画面表示用の文字
        };
    }

    // ==========================================
    // ★追加：取引の「実際に可能な最大数」を計算する一元化窓口
    // ==========================================
    static calcMaxTradeAmount(type, castle, daimyo, castellan, provinces) {
        if (type === 'buy_rice') {
            const rateInfo = this.getRiceActualRate('buy_rice', castle, provinces);
            const actualRate = rateInfo.actualRate;
            const maxGold = Math.min(castle.gold, castle.tradeLimit || 0);
            let maxBuy = Math.floor(maxGold / actualRate);
            while (maxBuy > 0 && Math.ceil(maxBuy * actualRate) > maxGold) {
                maxBuy--;
            }
            return Math.min(maxBuy, 99999 - castle.rice);
        }
        else if (type === 'sell_rice') {
            const rateInfo = this.getRiceActualRate('sell_rice', castle, provinces);
            const actualRate = rateInfo.actualRate;
            const maxGain = Math.min(99999 - castle.gold, castle.tradeLimit || 0);
            const maxSellByGold = Math.floor(maxGain / actualRate);
            return Math.min(castle.rice, maxSellByGold);
        }
        else if (type === 'buy_ammo') {
            const price = parseInt(window.MainParams.Economy.PriceAmmo, 10) || 1;
            const maxBuy = price > 0 ? Math.floor(castle.gold / price) : 0;
            return Math.min(maxBuy, 99999 - (castle.ammo || 0));
        }
        else if (type === 'buy_horses') {
            let maxBuy = this.calcBuyHorseAmount(castle.gold, daimyo, castellan);
            while (maxBuy > 0 && this.calcBuyHorseCost(maxBuy, daimyo, castellan) > castle.gold) {
                maxBuy--;
            }
            return Math.min(maxBuy, 99999 - (castle.horses || 0));
        }
        else if (type === 'buy_guns') {
            let maxBuy = this.calcBuyGunAmount(castle.gold, daimyo, castellan);
            while (maxBuy > 0 && this.calcBuyGunCost(maxBuy, daimyo, castellan) > castle.gold) {
                maxBuy--;
            }
            return Math.min(maxBuy, 99999 - (castle.guns || 0));
        }
        return 0;
    }

    // ==========================================
    // ★追加：取引の「必要な費用（または利益）」と「単価」を計算する一元化窓口
    // ==========================================
    static calcTradeCostAndRate(type, amount, castle, daimyo, castellan, provinces) {
        let cost = 0;
        let rateStr = "0.0";

        if (type === 'buy_rice') {
            const rateInfo = this.getRiceActualRate('buy_rice', castle, provinces);
            cost = Math.ceil(amount * rateInfo.actualRate);
            rateStr = rateInfo.displayRateStr;
        } else if (type === 'sell_rice') {
            const rateInfo = this.getRiceActualRate('sell_rice', castle, provinces);
            cost = Math.floor(amount * rateInfo.actualRate); // 売却の場合は利益
            rateStr = rateInfo.displayRateStr;
        } else if (type === 'buy_ammo') {
            const price = parseInt(window.MainParams.Economy.PriceAmmo, 10) || 1;
            cost = price * amount;
            rateStr = price.toFixed(1);
        } else if (type === 'buy_horses') {
            cost = this.calcBuyHorseCost(amount, daimyo, castellan);
            rateStr = this.calcBuyHorseUnitPrice(daimyo, castellan).toFixed(1);
        } else if (type === 'buy_guns') {
            cost = this.calcBuyGunCost(amount, daimyo, castellan);
            rateStr = this.calcBuyGunUnitPrice(daimyo, castellan).toFixed(1);
        }
        return { cost, rateStr };
    }

    // ==========================================
    // ★ここから追加：AIがお金を使う時の「給金計算」と「予算管理」の一元化魔法！
    // ==========================================
    // ① 月の基本収入（港ボーナス込み）を予測します
    // ★追加：港ボーナスの計算を一箇所にまとめます
    static calcPortBonus(castle, game) {
        let portBonus = 0;
        if (this.isPortCastle(castle) && game) {
            const clanCastles = game.castles.filter(c => c.ownerClan === castle.ownerClan);
            const totalClanPopulation = clanCastles.reduce((sum, c) => sum + c.population, 0);
            portBonus = Math.floor((castle.population / 500) + (castle.peoplesLoyalty / 2) + (totalClanPopulation / 1000));
        }
        return portBonus;
    }

    // ★追加：特定の勢力との交易収入を計算します
    static calcTradeIncomeWithTarget(clanId, targetClanId, game) {
        const clan = game.getClan(clanId);
        const targetClan = game.getClan(targetClanId);
        if (!clan || !targetClan) return 0;
        
        const rel = game.getRelation(clanId, targetClanId);
        if (!rel || !['友好', '同盟', '支配', '従属'].includes(rel.status)) return 0;
        
        const myCastles = game.getClanCastles(clanId);
        const targetCastles = game.getClanCastles(targetClanId);
        if (myCastles.length === 0 || targetCastles.length === 0) return 0;
        
        let targetIncome = 0;
        const sentiment = rel.sentiment;
        
        targetCastles.forEach(tc => {
            let isAdjacentToMe = false;
            for (let mc of myCastles) {
                if (this.isAdjacent(mc, tc)) {
                    isAdjacentToMe = true;
                    break;
                }
            }
            const baseIncome = Math.sqrt(tc.population) * (sentiment / 200);
            if (isAdjacentToMe) {
                targetIncome += Math.floor(baseIncome);
            } else {
                targetIncome += Math.floor(baseIncome / 3);
            }
        });
        return targetIncome;
    }

    // ★追加：勢力全体の交易収入を合計します
    static calcClanTradeIncome(clanId, game) {
        let total = 0;
        game.clans.forEach(targetClan => {
            if (targetClan.id !== 0 && targetClan.id !== clanId && !targetClan.isDestroyed) {
                total += this.calcTradeIncomeWithTarget(clanId, targetClan.id, game);
            }
        });
        return total;
    }

    static calcExpectedGoldIncome(castle, game) {
        let income = this.calcBaseGoldIncome(castle);
        // ★ 新しく作った港ボーナスの計算式を呼び出します
        income += this.calcPortBonus(castle, game);
        
        if (castle.statusEffects && castle.statusEffects.includes('一揆')) {
            income = 0;
        }
        return income;
    }

    // ② 城にいる武将全員の「来月の給金合計」を計算します
    static calcCastleSalary(castle, game) {
        if (!game) return 0;
        const bushos = game.getCastleBushos(castle.id).filter(b => b.clan === castle.ownerClan && b.status === 'active');
        const daimyo = game.bushos.find(b => b.clan === castle.ownerClan && b.isDaimyo);
        let consumeGold = 0;
        bushos.forEach(b => {
            consumeGold += b.getSalary(daimyo);
        });
        return consumeGold;
    }

    // ③ AIが自由に使っていい「利用可能なお金（予算）」を計算します
    static calcAvailableGoldForAI(castle, game) {
        const income = this.calcExpectedGoldIncome(castle, game);
        const salary = this.calcCastleSalary(castle, game);
        
        // (支出 - 収入) に 100 の余裕を足します。
        // もし収入の方が多くてマイナスになっても、念のため最低 100 は手元に残します！
        const requiredSafeGold = Math.max(100, (salary - income) + 100);
        
        // 今の所持金から、残すべき安全なお金を引いた額が「自由に使えるお金」です
        return Math.max(0, castle.gold - requiredSafeGold);
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
        this.lastMenuState = null;
        this.aiTimer = null;

        // Round26：観戦終了はその場で割り込まず、安全な処理区切りまで予約して待ちます。
        this._watchReturnRequested = false;
        this._watchReturnInProgress = false;
        this._watchReturnSafePoint = null;
        
        this.kunishuSystem = new KunishuSystem(this);
        // 城の隣接索引・接続探索は全システムでこの1インスタンスを共有します。
        this.mapGraph = new MapGraphService(this);
        this.reinforcementService = new ReinforcementService(this);
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
        // ★ 計略を管理するシステムを呼び出します
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
        // ★ エンディング（クリア・ゲームオーバー）を管理するシステムを呼び出します！
        this.endingSystem = new EndingSystem(this);
        
        this.hasAutoSavedThisMonth = false; // ★追加：その月にオートセーブしたかどうかを覚えておく箱です
        this.phase = 'title';

        // ★実機診断：強制リロード前にAIがどこまで進んでいたか、同一タブのsessionStorageから復元します。
        setTimeout(() => this._showPreviousAIDiagnostic(), 0);
    }

    writeSystemDiagnostic(phase, castle = null) {
        // ★Round5 実機診断：AI城だけでなく月末・月初・プレイヤー復帰まで記録します。
        if (typeof sessionStorage === 'undefined') return;
        if (document.body && document.body.classList.contains('is-pc')) return;
        try {
            const data = {
                year: this.year,
                month: this.month,
                index: this.currentIndex + 1,
                total: this.turnQueue ? this.turnQueue.length : 0,
                castleId: castle ? castle.id : 0,
                castleName: castle ? castle.name : '',
                clanId: castle ? castle.ownerClan : 0,
                phase: phase || '',
                time: Date.now()
            };
            sessionStorage.setItem('sengoku_ai_last_checkpoint_v1', JSON.stringify(data));
            const oldBadge = document.getElementById('ai-last-checkpoint-badge');
            if (oldBadge) oldBadge.remove();
        } catch (e) {
        }
    }

    writeAIDiagnostic(castle, phase) {
        this.writeSystemDiagnostic(phase, castle);
    }

    _showPreviousAIDiagnostic() {
        if (typeof sessionStorage === 'undefined') return;
        try {
            const raw = sessionStorage.getItem('sengoku_ai_last_checkpoint_v1');
            if (!raw) return;
            const data = JSON.parse(raw);
            if (!data || data.phase === 'turn_finished' || data.phase === 'player_turn:ready') return;
            if (data.time && Date.now() - data.time > 2 * 60 * 60 * 1000) return;
            if (document.getElementById('ai-last-checkpoint-badge')) return;

            const el = document.createElement('div');
            el.id = 'ai-last-checkpoint-badge';
            const castleText = data.castleId ? `　${data.castleName || '城'}(ID:${data.castleId})` : '';
            el.textContent = `前回停止位置: ${data.index || '?'} / ${data.total || '?'}${castleText}　${data.phase || '不明'}`;
            el.title = 'タップすると閉じます';
            el.style.cssText = 'position:fixed;left:8px;bottom:8px;z-index:20000;max-width:calc(100vw - 16px);padding:6px 9px;background:rgba(0,0,0,.82);color:#fff;font-size:11px;line-height:1.35;border-radius:5px;pointer-events:auto;';
            el.onclick = () => el.remove();
            document.body.appendChild(el);
        } catch (e) {
        }
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
    
    startNewGame(options = {}) {
        const startInWatchMode = !!(options && options.watchMode);
        if(this.ui) this.ui.forceResetModals();
        
        // ★前回のゲームの記憶やフラグを綺麗にお掃除します！
        this.isProcessingAI = false; // AI思考中フラグを解除！
        this.isWatchMode = false; // ★追加：観戦モードも解除！
        this.originalPlayerClanId = null;
        this.hasAutoSavedThisMonth = false;
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
            this.loadScenario(folder, { startInWatchMode });
        });
    }

    // Round27：タイトル画面の「観戦する」。
    // シナリオ選択までは「はじめから」と完全に共用し、選択後だけ大名選択を飛ばして観戦開始します。
    startWatchGame() {
        this.startNewGame({ watchMode: true });
    }
    
    async loadScenario(folder, options = {}) {
        const startInWatchMode = !!(options && options.startInWatchMode);
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
            
            // ★相場をゲーム開始時に基本相場（TradeRateBase）にリセットします！
            this.provinces.forEach(p => {
                p.marketRate = window.MainParams.Economy.TradeRateBase;
            });
            
            // ★今回追加：新しいゲームを始める時は、読み込んだ軍団の名簿をしっかり受け取ります！
            this.legions = data.legions || [];
            
            this.year = window.MainParams.StartYear;
            this.month = window.MainParams.StartMonth;
            
            // ★修正：ゲーム開始時の年と月を、ゲーム本体にしっかり記憶させます！
            this.gameStartYear = this.year;
            this.gameStartMonth = this.month;
            
            // ★追加：今のシナリオのフォルダ名をゲーム全体で覚えておく魔法です！
            this.scenarioFolder = folder;

            // Round27：タイトルから観戦開始した場合は、game_startイベントより前に観戦状態へ入ります。
            // これでゲーム開始イベントも「プレイヤー勢力なし」の通常観戦ルールで処理されます。
            if (startInWatchMode) {
                this._prepareFreshWatchMode(null);
            }
            
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

            // Round27：タイトルから観戦を選んだ場合は、大名選択画面を経由しません。
            // 先に観戦状態へしておくことで、ゲーム開始直後の月初イベントも通常の観戦ルール（AI分岐・自動送り）で処理されます。
            if (startInWatchMode) {
                this.phase = 'game';
            } else {
                this.phase = 'daimyo_select';
            }

            this.ui.renderMap();
            // カットイン表示を消しました！

            // ★追加：マップの準備がすべて終わったら、少しだけ待ってからロード画面を隠します
            await new Promise(resolve => setTimeout(resolve, 100));
            if (this.ui) this.ui.hideLoadingScreen();

            // 観戦開始はロード画面を閉じてから。通常の「はじめから」と同じ startMonth() を入口にします。
            if (startInWatchMode) {
                setTimeout(() => this.init(), 0);
            }
            
        } catch (e) {
            if (startInWatchMode) {
                this.isWatchMode = false;
                this.originalPlayerClanId = null;
                this.playerClanId = 1;
                this._watchReturnRequested = false;
                this._watchReturnInProgress = false;
                this._watchReturnSafePoint = null;
            }
            if (this.ui) this.ui.hideLoadingScreen();
            console.error(e);
            if (this.ui) {
                this.ui.showDialog("シナリオデータの読み込みに失敗しました。", false, () => {
                    this.ui.returnToTitle();
                });
            } else {
                this.returnToTitle();
            }
        }
    }
    
    // ==========================================
    // ★軽量化：顔画像の大量プリロードを抑制します。
    // スマホでは一覧に出ていない数千枚まで先読みすると、画像デコードキャッシュだけで
    // WebView がメモリ不足になりやすいため、必要になった画像を通常の <img> 読み込みに任せます。
    // PCでも「大名・城主」など最初に見える可能性が高い顔だけ、少量ずつアイドル時に読み込みます。
    // ==========================================
    preloadFaceIcons() {
        const isPc = document.body.classList.contains('is-pc');
        if (!isPc) return;

        const faceFiles = new Set();
        const addFaceByBushoId = (id) => {
            const b = this.getBusho(id);
            if (b && b.faceIcon && b.faceIcon !== 'unknown_face.webp') faceFiles.add(b.faceIcon);
        };

        // 重要人物だけを優先。全武将はプリロードしません。
        this.clans.forEach(c => addFaceByBushoId(c.leaderId));
        this.castles.forEach(c => addFaceByBushoId(c.castellanId));

        const urls = Array.from(faceFiles)
            .slice(0, 96)
            .map(filename => `./data/images/faceicons/${filename}`);
        const batchSize = 4;

        const scheduleIdle = (fn) => {
            if ('requestIdleCallback' in window) {
                window.requestIdleCallback(fn, { timeout: 500 });
            } else {
                setTimeout(fn, 50);
            }
        };

        const loadBatch = async (startIndex) => {
            if (startIndex >= urls.length) return;
            const batch = urls.slice(startIndex, startIndex + batchSize);
            await Promise.all(batch.map(url => new Promise(resolve => {
                const img = new Image();
                img.onload = img.onerror = resolve;
                img.decoding = 'async';
                img.src = url;
            })));
            scheduleIdle(() => loadBatch(startIndex + batchSize));
        };

        scheduleIdle(() => loadBatch(0));
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
        // ★高速化：毎回全員を先頭から探す(find)代わりに、ID→武将の「索引（Map）」を作って一瞬で見つけます！
        // （セーブ読込などで配列そのものが入れ替わった時も自動で作り直されるよう、参照と件数の両方をチェックします）
        if (this._bushoMapSource !== this.bushos || this._bushoMapSize !== this.bushos.length) {
            this._bushoMap = new Map();
            this.bushos.forEach(b => this._bushoMap.set(Number(b.id), b));
            this._bushoMapSource = this.bushos;
            this._bushoMapSize = this.bushos.length;
        }
        return this._bushoMap.get(Number(id));
    }
    getCastle(id) {
        // ★高速化：お城も同じように索引（Map）を使って一瞬で見つけます！
        if (this._castleMapSource !== this.castles || this._castleMapSize !== this.castles.length) {
            this._castleMap = new Map();
            this.castles.forEach(c => this._castleMap.set(Number(c.id), c));
            this._castleMapSource = this.castles;
            this._castleMapSize = this.castles.length;
        }
        return this._castleMap.get(Number(id));
    }
    getClan(id) {
        // ★高速化：勢力も同じように索引（Map）を使って一瞬で見つけます！
        if (this._clanMapSource !== this.clans || this._clanMapSize !== this.clans.length) {
            this._clanMap = new Map();
            this.clans.forEach(c => this._clanMap.set(Number(c.id), c));
            this._clanMapSource = this.clans;
            this._clanMapSize = this.clans.length;
        }
        return this._clanMap.get(Number(id));
    }
    // ★高速化：「勢力ID→大名武将」を一瞬で取り出します（毎回全武将から探す代わりに、勢力が覚えているIDを使います）
    getClanDaimyo(clanId) {
        const numericClanId = Number(clanId);
        const clan = this.getClan(numericClanId);
        if (clan) {
            const leader = this.getBusho(clan.leaderId);
            // leaderId が正常なら最速経路。セーブ移行直後などで一時的に不整合でも、
            // 以前の「clan + isDaimyo 検索」と同じ結果へフォールバックします。
            if (leader && Number(leader.clan) === numericClanId && leader.isDaimyo) return leader;
        }
        return this.bushos.find(b => Number(b.clan) === numericClanId && b.isDaimyo);
    }
    // ★高速化：「勢力ID→持ち城リスト」を一瞬で取り出します。
    // お城の持ち主（ownerClan）が変わった時だけ索引を作り直すよう、
    // castle_manager.js と affiliation_system.js 側で this.castleOwnershipVersion を1つ増やしてもらいます。
    getClanCastles(clanId) {
        const version = this.castleOwnershipVersion || 0;
        if (this._clanCastlesSource !== this.castles || this._clanCastlesVersion !== version) {
            this._clanCastlesMap = new Map();
            this.castles.forEach(c => {
                if (!this._clanCastlesMap.has(c.ownerClan)) this._clanCastlesMap.set(c.ownerClan, []);
                this._clanCastlesMap.get(c.ownerClan).push(c);
            });
            this._clanCastlesSource = this.castles;
            this._clanCastlesVersion = version;
        }
        return this._clanCastlesMap.get(Number(clanId)) || [];
    }
    // ★ 修正：まだ生まれていない人（unborn）や亡くなった人（dead）は無視するようにします
    getCastleBushos(cid) { const c = this.getCastle(cid); return c ? c.samuraiIds.map(id => this.getBusho(id)).filter(b => b && b.status !== 'unborn' && b.status !== 'dead') : []; }
    getCurrentTurnCastle() { return this.turnQueue[this.currentIndex]; }
    getCurrentTurnId() { return this.year * 12 + this.month; }
    getClanTotalSoldiers(clanId) { return this.getClanCastles(clanId).reduce((sum, c) => sum + c.soldiers, 0); }
    getClanGunshi(clanId) {
        const clan = this.getClan(clanId);
        if (clan && clan.gunshiId) {
            const gunshi = this.getBusho(clan.gunshiId);
            if (gunshi && Number(gunshi.clan) === Number(clanId) && gunshi.isGunshi && gunshi.status === 'active') return gunshi;
        }
        return this.bushos.find(b => Number(b.clan) === Number(clanId) && b.isGunshi && b.status === 'active');
    }

    getNavigatorInfo(castle) {
        let faceIcon = 'koshou.webp';
        let name = '小姓';
        
        const ownerClanId = castle.ownerClan;
        const daimyo = this.getClanDaimyo(ownerClanId);
        
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
    // ★軽量化：1勢力だけ威信・収入を更新できるように分割します。
    // AIの「1城ごとの思考」で全勢力を再計算する必要はありません。
    // ==========================================
    updateClanPrestige(clanId) {
        const clan = this.getClan(clanId);
        if (!clan || clan.id === 0 || clan.isDestroyed) return;

        const castles = this.getClanCastles(clan.id);
        let pop = 0, sol = 0, koku = 0, gold = 0, rice = 0;
        let goldIncome = 0;
        let riceIncome = 0;

        for (const c of castles) {
            pop += c.population;
            sol += c.soldiers;
            koku += c.kokudaka;
            gold += c.gold;
            rice += c.rice;
            goldIncome += GameSystem.calcExpectedGoldIncome(c, this);
            riceIncome += GameSystem.calcBaseRiceIncome(c);
        }

        goldIncome += GameSystem.calcClanTradeIncome(clan.id, this);
        clan.goldIncome = goldIncome;
        clan.riceIncome = riceIncome;

        const basePrestige = Math.floor(pop / 200) + Math.floor(sol / 20) + Math.floor(koku / 20) + Math.floor(gold / 150) + Math.floor(rice / 300);
        clan.basePrestige = basePrestige;

        let rankBonus = 0;
        const leader = this.getBusho(clan.leaderId);
        if (leader && this.courtRankSystem) {
            rankBonus = this.courtRankSystem.getBushoRankBonus(leader);
        }
        clan.daimyoPrestige = basePrestige + rankBonus;
    }

    // 全勢力の再計算が本当に必要な月初・大きな状態変更用。
    updateAllClanPrestige() {
        for (const clan of this.clans) {
            if (clan.id === 0 || clan.isDestroyed) continue;
            this.updateClanPrestige(clan.id);
        }
    }
    
    // ★大名家の表示名を更新する魔法です（同名被りの回避）
    updateClanDisplayNames() {
        if (!this.provinces) return;

        // まず、今の大名に合わせて本来の名前（baseName）と読み（baseYomi）を更新します
        this.clans.forEach(clan => {
            // ★修正：城の数ではなく、滅亡フラグ（isDestroyed）で判定するようにしました
            if (clan.id === 0 || clan.isDestroyed) return; 
            const leader = this.getBusho(clan.leaderId);
            if (leader && leader.familyName) {
                clan.baseName = leader.familyName + "家";
                clan.baseYomi = (leader.familyYomi || "") + "け"; // ★読み仮名も「〇〇け」で覚えます
            } else {
                if (!clan.baseName) clan.baseName = clan.name;
                if (!clan.baseYomi) clan.baseYomi = clan.yomi;
            }
            // 表示用の名前と読みを一旦本来のものにリセットします
            clan.name = clan.baseName;
            clan.yomi = clan.baseYomi;
        });

        // 本来の名前でグループ分けをして、被っている大名家をまとめます
        const clanGroups = {};
        this.clans.forEach(clan => {
            if (clan.id === 0 || clan.isDestroyed) return; 
            const baseName = clan.baseName;
            if (!clanGroups[baseName]) clanGroups[baseName] = [];
            clanGroups[baseName].push(clan);
        });

        // 1回目のチェック：被っていたら、威信が2位以下の勢力に国名（「国」抜き）をつける
        // ★追加：ただし、同じ国に同名の勢力がいる場合は、最初から城名をつけるようにします！
        Object.values(clanGroups).forEach(group => {
            if (group.length > 1) {
                // まずは今まで通り、大名の威信（daimyoPrestige）が高い順に並べ替えます
                group.sort((a, b) => b.daimyoPrestige - a.daimyoPrestige);

                // 各勢力がいる地方（国）をリストアップしておきます
                const clanProvinces = {};
                group.forEach(clan => {
                    const leader = this.getBusho(clan.leaderId);
                    if (leader) {
                        const castle = this.getCastle(leader.castleId);
                        if (castle) {
                            clanProvinces[clan.id] = castle.provinceId;
                        }
                    }
                });

                // ★改修：同じ国に同名の勢力がいて「城名」での判別が必要になる場合のみ、
                // 居城名と家名が一致する勢力を探し出して、特例として一番上（本筋）に移動させます！
                const matchingClanIndex = group.findIndex(clan => {
                    const myProvId = clanProvinces[clan.id];
                    // 同じ国に別の同名勢力がいるかチェック
                    const hasSameProvClan = group.some(otherClan => otherClan.id !== clan.id && clanProvinces[otherClan.id] === myProvId);
                    
                    if (hasSameProvClan) {
                        const leader = this.getBusho(clan.leaderId);
                        if (leader) {
                            const castle = this.getCastle(leader.castleId);
                            if (castle && castle.name) {
                                const castleBase = castle.shortName;
                                const clanBase = clan.baseName.replace(/家$/, "");
                                if (castleBase === clanBase) return true;
                            }
                        }
                    }
                    return false;
                });

                // 一致する家が見つかった場合（かつ、すでに威信トップではない場合）、先頭に移動させます
                if (matchingClanIndex > 0) {
                    const matchClan = group.splice(matchingClanIndex, 1)[0];
                    group.unshift(matchClan);
                }

                // 威信トップ（[0]）には何もつけず、2位以下（[1]以降）にだけ名前をつけます
                for (let i = 1; i < group.length; i++) {
                    const clan = group[i];
                    const leader = this.getBusho(clan.leaderId);
                    if (leader) {
                        const castle = this.getCastle(leader.castleId);
                        if (castle) {
                            const myProvId = castle.provinceId;
                            // 同じグループの中に、同じ国（provinceId）にいる別の勢力がいるかチェックします
                            const hasSameProvClan = group.some(otherClan => otherClan.id !== clan.id && clanProvinces[otherClan.id] === myProvId);

                            if (hasSameProvClan) {
                                // 同じ国に別の同名勢力がいる場合は、国名ではなく最初から城名（拠点名）をつけます
                                if (castle.name) {
                                    const castleName = castle.shortName;
                                    const castleYomi = castle.shortYomi;
                                    clan.name = castleName + clan.baseName;
                                    clan.yomi = castleYomi + clan.baseYomi;
                                }
                            } else {
                                // いなければ今まで通り国名をつける
                                const province = this.provinces.find(p => p.id === myProvId);
                                if (province && province.province) {
                                    const provName = province.shortName;
                                    // ★国名の読みから「のくに」を抜きます
                                    const provYomi = province.shortYomi;
                                    clan.name = provName + clan.baseName;
                                    clan.yomi = provYomi + clan.baseYomi;
                                }
                            }
                        }
                    }
                }
            }
        });

        // 新しい名前で被っている数をもう一度数えます
        const newNameCounts = {};
        this.clans.forEach(clan => {
            if (clan.id === 0 || clan.isDestroyed) return;
            newNameCounts[clan.name] = (newNameCounts[clan.name] || 0) + 1;
        });

        // 2回目のチェック：国名をつけても被っていたら城・館・御所の名前をつける
        Object.values(clanGroups).forEach(group => {
            if (group.length > 1) {
                // ここでも威信2位以下の勢力だけを対象に、まだ名前が被っているかチェックします
                for (let i = 1; i < group.length; i++) {
                    const clan = group[i];
                    if (newNameCounts[clan.name] > 1) {
                        const leader = this.getBusho(clan.leaderId);
                        if (leader) {
                            const castle = this.getCastle(leader.castleId);
                            if (castle && castle.name) {
                                // ★城だけでなく、館（やかた）、御所（ごしょ）、御坊（ごぼう）も抜くように対応します
                                const castleName = castle.shortName;
                                // ★読み仮名からも、じょう、やかた、ごしょ、ごぼうを抜きます
                                const castleYomi = castle.shortYomi;
                                clan.name = castleName + clan.baseName;
                                clan.yomi = castleYomi + clan.baseYomi;
                            }
                        }
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
        this.hasAutoSavedThisMonth = false; // ★月が替わったので、オートセーブ済みの印を消します
        this.writeSystemDiagnostic('month_start:start');

        // ★追加：月初の処理が始まったら、ユーザーが勝手に操作できないように膜（ガード）を張ります！
        this.isProcessingAI = true;
        if (this.ui && this.ui.aiGuard) {
            this.ui.aiGuard.classList.remove('hidden');
            this.ui.hideAIGuardText(); // ★中身を壊さずに、透明にして文字だけ隠します！
        }
        
        // 大名と同じ派閥に属している武将の忠誠度アップと承認欲求ダウン（設定値から読み込み）
        const F = window.WarParams.Faction;
        const minRec = F.MinRecognition;
        const decayRec = F.SameFactionRecognitionDecay;
        const boostLoy = F.SameFactionLoyaltyBoost;

        this.clans.forEach(clan => {
            if (clan.id !== 0 && !clan.isDestroyed) {
                const daimyo = this.getBusho(clan.leaderId); // ★高速化：全武将から探す代わりに、勢力が覚えているIDで一瞬で見つけます
                if (daimyo && daimyo.factionId > 0) {
                    const clanCastles = this.getClanCastles(clan.id);
                    clanCastles.forEach(c => {
                        const bushos = this.getCastleBushos(c.id);
                        bushos.forEach(b => {
                            if (b.status === 'active' && b.factionId === daimyo.factionId) {
                                // 設定された数値ぶん忠誠度を上げます
                                b.loyalty = Math.min(100, b.loyalty + boostLoy);
                                // 設定された数値ぶん承認欲求を下げます（最小値チェックも設定から読み込み）
                                b.recognitionNeed = Math.max(minRec, (b.recognitionNeed || 0) - decayRec);
                            }
                        });
                    });
                }
            }
        });
        
        // ★月が替わったら軍師の報告印を消します
        if (this.gunshiSystem) this.gunshiSystem.onStartMonth();
        
        // ★ごっそり差し替え！：相場の変動を「国（province）ごと」に計算するようにします！
        const fluc = window.MainParams.Economy.TradeFluctuation; 
        const baseRate = window.MainParams.Economy.TradeRateBase; // ★基本相場を読み込みます
        
        // 季節の風（季節の動きは日本全国共通です！）
        let seasonForce = 0;
        if (this.month === 9) {
            // 9月は収穫の秋！お米が市場に溢れるので、相場が一気に下がります（安くなる）
            // 基本相場の0.5倍〜1.0倍の幅でランダムに下がります
            let randomDown = (baseRate * 0.5) + (Math.random() * (baseRate * 0.5));
            seasonForce = -randomDown;
        } else {
            // それ以外の月は、だんだんお米が減っていくので、毎月少しずつ相場が上がります（高くなる）
            // 基本相場の0.05倍ずつ上がります
            seasonForce = baseRate * 0.05; 
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
            const rubberForce = (baseRate - p.marketRate) * 0.1; // ★基本相場を基準に引っ張ります
            
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
            this.writeSystemDiagnostic('month_start:event_before_done');
        }
        
        // 元服の処理が終わるまでしっかり待ちます！
        await this.lifeSystem.processStartMonth();
        this.writeSystemDiagnostic('month_start:life_done');
        
        // 武将の下野（出奔）が終わるまで待ちます！
        await this.factionSystem.processStartMonth(); 
        this.writeSystemDiagnostic('month_start:faction_done');

        // ★安定化：全国派閥再編などで作った一時配列を解放できるよう、
        // 次の全国処理へ入る前にブラウザへ一度制御を返します。
        await new Promise(resolve => setTimeout(resolve, 0));        
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
        
        // ★高速化：この先のループで城の数だけ「全武将リスト」を探し直すのを防ぐため、先に「勢力ID→大名」の索引を1回だけ作ります！
        const daimyoByClanIdForGrowth = new Map();
        this.clans.forEach(clan => {
            if (clan.id !== 0 && !clan.isDestroyed) {
                const d = this.getBusho(clan.leaderId);
                if (d) daimyoByClanIdForGrowth.set(clan.id, d);
            }
        });

        this.castles.forEach(c => {
            if (c.ownerClan === 0) return;
            c.isDone = false;

            // ★追加：月初の拠点防御力上昇スキルの効果を適用します
            if (typeof SkillManager !== 'undefined' && typeof SkillManager.calcMonthlyDefenseBonus === 'function') {
                const defBonus = SkillManager.calcMonthlyDefenseBonus(c, this);
                if (defBonus > 0) {
                    c.defense = Math.min(c.maxDefense, c.defense + defBonus);
                }
            }

            let income = GameSystem.calcBaseGoldIncome(c);
            income = GameSystem.applyVariance(income, window.MainParams.Economy.IncomeFluctuation);
            if (this.month === 3) income += income * 3;

            // ★ 新しくまとめた港ボーナスの計算式を呼び出します
            let portBonus = GameSystem.calcPortBonus(c, this);
            
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
            
            // ★詰み防止：人口2000未満かつ民忠60未満の場合は、民忠60の想定で人口増減を計算します
            let calcLoyalty = currentLoyalty;
            if (c.population < 2000 && currentLoyalty < 60) {
                calcLoyalty = 60;
            }
            
            let growth = Math.floor(((Math.sqrt(c.population) * 2) * ((calcLoyalty - 50) / 100)) + (calcLoyalty / 4));

            // ==========================================
            // ★新しく追加：隣のお城が「敵」か「味方」かを調べて、増える量を計算する魔法！
            // ==========================================
            let neighborMultiplier = 1.2; // 基本は一番多い「120%（1.2倍）」にしておきます
            let totalAdjacent = 0; // 道が繋がっている隣のお城の数
            let hostileAdjacent = 0; // そのうち、敵かもしれないお城の数

            if (c.adjacentCastleIds && c.adjacentCastleIds.length > 0) {
                totalAdjacent = c.adjacentCastleIds.length;
                c.adjacentCastleIds.forEach(adjId => {
                    const adjCastle = this.getCastle(adjId);
                    if (adjCastle) {
                        let isHostile = false; // 「敵かな？」という目印（最初は違うにしておくよ）
                        
                        if (adjCastle.ownerClan === c.ownerClan) {
                            // 同じ大名家のお城なら、もちろん味方！
                            isHostile = false;
                        } else if (adjCastle.ownerClan === 0) {
                            // 誰も住んでいない空き家も、野盗がいるかもしれないので敵扱いにするよ
                            isHostile = true;
                        } else {
                            // 他の大名家のお城の場合は、仲良し手帳（外交データ）を見ます
                            const rel = this.getRelation(c.ownerClan, adjCastle.ownerClan);
                            // 同盟、支配、従属、友好のどれかなら味方！ それ以外は敵扱い！
                            if (rel && ['同盟', '支配', '従属', '友好'].includes(rel.status)) {
                                isHostile = false;
                            } else {
                                isHostile = true;
                            }
                        }
                        
                        // もし「敵だ！」と分かったら、敵の数を１つ増やします
                        if (isHostile) {
                            hostileAdjacent++;
                        }
                    } else {
                        // 万が一お城のデータが見つからなかったら、数え間違いを防ぐために全体の数を１つ減らすよ
                        totalAdjacent--;
                    }
                });

                // 隣にお城がある場合だけ、計算をします
                if (totalAdjacent > 0) {
                    // 全部の数で100%（1.0）を割って、敵の数だけ引き算します。最後に最低保証の20%（0.2）を足します！
                    neighborMultiplier = 0.2 + (1.0 - (hostileAdjacent / totalAdjacent));
                }
            }

            // 人口が増える場合だけ、調べた倍率（120%〜20%）をかけ算してあげるよ
            if (growth > 0) {
                growth = Math.floor(growth * neighborMultiplier);

                // ★追加・移動：人口が石高に対して少ない場合、人口の増加量をアップします！（過疎地ボーナス）
                // エラーを防ぐため、石高は最低でも「1」として計算します
                const popKokuRatio = c.population / Math.max(1, c.kokudaka);
                let popLowBonus = 1.0; // 基本は1.0倍（そのまま）です

                // ① 人口が石高以下の時（1倍以下）
                if (popKokuRatio <= 1) {
                    popLowBonus = 3.0; // 3倍にします
                } 
                // ② 人口が石高の5倍以下の時
                else if (popKokuRatio <= 5) {
                    // 1倍〜5倍の間で、3.0倍から1.5倍まで滑らかに減らしていきます
                    popLowBonus = 3.0 - ((popKokuRatio - 1) / 4) * 1.5;
                } 
                // ③ 人口が石高の10倍以下の時
                else if (popKokuRatio <= 10) {
                    // 5倍〜10倍の間で、1.5倍から1.0倍まで滑らかに減らしていきます
                    popLowBonus = 1.5 - ((popKokuRatio - 5) / 5) * 0.5;
                }

                // 最後に、計算したボーナス倍率を掛け算します
                growth = Math.floor(growth * popLowBonus);
            }
            // ==========================================

            // ★追加：新しい計算式で「拠点スコア（人口の実質的な上限）」を計算します
            // 石高ボーナス：√石高 * 500
            const kokudakaBonus = Math.sqrt(Math.max(0, c.kokudaka)) * 500;
            
            // 城壁ボーナス：√城防御 * 200
            const defenseBonus = Math.sqrt(Math.max(0, c.defense)) * 200;
            
            // 民忠スコア：(民忠 ÷ 100) + 0.5
            const loyaltyScore = (c.peoplesLoyalty / 100) + 0.5;
            
            // 拠点スコアを計算します（石高ボーナス＋城壁ボーナス×民忠スコア）
            const baseScore = (kokudakaBonus + defenseBonus) * loyaltyScore;

            // 人口が拠点スコア以上の時、増える量を20分の1にします
            if (growth > 0 && c.population >= baseScore) {
                growth = Math.floor(growth / 20);
            }

            c.population = Math.min(999999, Math.max(0, c.population + growth));

            // ★追加：毎月の兵士の自然増加計算
            // まず、このお城の持ち主である大名様を探し出します
            const daimyoBusho = daimyoByClanIdForGrowth.get(c.ownerClan);
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
                const ownedCastlesCount = this.getClanCastles(c.ownerClan).length;
                // 城の所有数を25で割り、1を足してペナルティ値とします（最低でも1なので安全です）
                const castlePenalty = 1 + (ownedCastlesCount / 25);
                
                // 基本値から先に城数ブレーキで「割り算」をして、抑制された基本値を作ります
                const suppressedGrowth = baseGrowth / castlePenalty;

                // ★追加：人口に対する兵士の割合を計算して、ブレーキをかけます！
                // 兵士の割合が50%で0.375倍になり、75%で0.0625倍（雀の涙）になります。
                const soldierRatio = c.population > 0 ? (c.soldiers / c.population) : 1.0;
                const penaltyMultiplier = Math.max(0, 1.0 - (soldierRatio * 1.25));

                // 最後に、城数で抑制された基本値に、割合ブレーキを「掛け算」します！
                let soldierGrowth = Math.floor(suppressedGrowth * penaltyMultiplier);

                // ==========================================
                // さっき調べた倍率を、兵士が増える数にもかけ算します
                if (soldierGrowth > 0) {
                    soldierGrowth = Math.floor(soldierGrowth * neighborMultiplier);
                }
                // ==========================================

                // 計算した増える人数を、今のお城の兵士の数に足し合わせます（最大99999人まで）
                c.soldiers = Math.min(99999, c.soldiers + Math.max(0, soldierGrowth));
            }
            
            // 毎月月初に取引上限を決定（最大値まで回復）
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
            this.writeSystemDiagnostic('month_start:event_after_done');
        }

        // ★ここから新しく書き足し！：収入やイベントが全部終わった「後」に、金や兵糧を消費します！
        // ★高速化：ここでも城の数だけ「全武将リスト」を探し直すのを防ぐため、先に索引を1回だけ作ります！
        const daimyoByClanIdForUpkeep = new Map();
        this.clans.forEach(clan => {
            if (clan.id !== 0 && !clan.isDestroyed) {
                const d = this.getBusho(clan.leaderId);
                if (d) daimyoByClanIdForUpkeep.set(clan.id, d);
            }
        });

        this.castles.forEach(c => {
            if (c.ownerClan === 0) return;

            const bushos = this.getCastleBushos(c.id);
            const daimyo = daimyoByClanIdForUpkeep.get(c.ownerClan);
            
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
                
                // 毎月城主の功績が５増えます
                if (b.isCastellan) {
                    b.achievementTotal += 5;
                } else if (b.isGunshi) {
                    // 毎月軍師の功績が３増えます
                    b.achievementTotal += 3;
                }
                
                // 大名・国主は追加で功績が２増えます
                if (b.isDaimyo || b.isCommander) {
                    b.achievementTotal += 2;
                }

                // 役職ごとの経験値追加
                if (b.isCastellan) {
                    b.expStrength = (b.expStrength || 0) + 1;
                    b.expPolitics = (b.expPolitics || 0) + 3;
                }
                
                if (b.isDaimyo || b.isCommander) {
                    b.expLeadership = (b.expLeadership || 0) + 2;
                    b.expDiplomacy = (b.expDiplomacy || 0) + 3;
                    b.expIntelligence = (b.expIntelligence || 0) + 2;
                }
                
                if (b.isGunshi) {
                    b.expLeadership = (b.expLeadership || 0) + 2;
                    b.expIntelligence = (b.expIntelligence || 0) + 5;
                    b.expPolitics = (b.expPolitics || 0) + 2;
                    b.expDiplomacy = (b.expDiplomacy || 0) + 3;
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
                // ★安定化：四半期の全国人事を1本の長い同期処理にせず、数勢力ごとにブラウザへ制御を返します。
                let staffingProcessed = 0;
                for (const clan of this.clans) {
                    // ★修正：滅亡フラグをチェックして、生き残っている勢力だけ会議をします
                    if (clan.id !== 0 && !clan.isDestroyed && clan.id !== this.playerClanId) {
                        // ★追加：国主を決める前に、まずは大名自身に最適な居城を探させてお引越しさせます！
                        const daimyo = this.getBusho(clan.leaderId); // ★高速化：索引を使って一瞬で見つけます
                        if (daimyo && daimyo.castleId) {
                            const daimyoCastle = this.getCastle(daimyo.castleId);
                            if (daimyoCastle) {
                                this.aiStaffing.relocateDaimyo(daimyoCastle, daimyo);
                            }
                        }

                        // ★変更：解散は1月のみ実行し、新設と合わせて条件を満たす限りループさせます！
                        if (this.month === 1) {
                            let changed = true;
                            let loopCount = 0; // 無限ループ防止（念のため最大10回まで）
                            while (changed && loopCount < 10) {
                                changed = false;
                                const disbanded = this.aiStaffing.checkLegionDisband(clan.id);
                                const created = this.aiStaffing.createNewLegionIfNeeded(clan.id);
                                
                                // 解散か新設、どちらかが実行されたら「状況が変わった」としてもう1度ループします
                                if (disbanded || created) {
                                    changed = true;
                                }
                                loopCount++;
                            }
                        } else {
                            // 4, 7, 10月は解散は行わず、新設のみをループ実行します
                            let created = true;
                            let loopCount = 0;
                            while (created && loopCount < 10) {
                                created = this.aiStaffing.createNewLegionIfNeeded(clan.id);
                                loopCount++;
                            }
                        }

                        staffingProcessed++;
                        if (staffingProcessed % 4 === 0) {
                            await new Promise(resolve => setTimeout(resolve, 0));
                        }
                    }
                }
            }
        }
        this.writeSystemDiagnostic('month_start:staffing_done');
        if (this.aiOperationManager) {
            await this.aiOperationManager.processMonthlyOperations();
        }
        this.writeSystemDiagnostic('month_start:operations_done');

        this.currentIndex = 0; 
        this.writeSystemDiagnostic('month_start:before_turn_queue');

        // Round26：月末～月初の一連処理中に観戦終了が予約されていた場合は、
        // ここを「月処理が完全に一段落した安全地点」として帰還確認へ移ります。
        if (await this.tryProcessQueuedWatchReturn('month_start_complete')) return;

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
            this.writeSystemDiagnostic('month_transition:ai_queue_done');
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
            this.writeSystemDiagnostic('month_transition:before_endMonth');
            await this.endMonth(); // ← ★「await」を書き足します！
            return; 
        }

        const castle = this.turnQueue[this.currentIndex]; 
        
        if (castle.isDone) {
            // ★ここを書き足し：行動済みの城をスキップする時も、一瞬だけ数字を進めます！
            if (this.isProcessingAI && this.ui) {
                this.ui.updateAIProgress(this.currentIndex + 1, this.turnQueue.length);
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
                // ただし、UIに現在の城だけは認識させておきます。
                if (this.ui) this.ui.currentCastle = castle;
                
                const delay = 30;

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
                this.writeSystemDiagnostic('player_turn:enter', castle);

                // ★毎月一番最初の自分のターンで、裏側でオートセーブを走らせます！
                if (!this.hasAutoSavedThisMonth && window.GameConfig && window.GameConfig.autoSave) {
                    this.hasAutoSavedThisMonth = true;
                    // ★ゲーム開始直後の最初の月は、意味がないのでオートセーブをスキップします！
                    if (this.year !== this.gameStartYear || this.month !== this.gameStartMonth) {
                        // ★安定化：オートセーブをAI進行と並走させない。
                        // 古いスマホでは「全データ保存」とAI思考が重なるとメモリの山ができるため、
                        // 保存が終わってから操作を返します。
                        this.writeSystemDiagnostic('player_turn:before_autosave', castle);
                        await this.executeAutoSave();
                        this.writeSystemDiagnostic('player_turn:after_autosave', castle);
                    }
                }

                if(this.ui.aiGuard) this.ui.aiGuard.classList.add('hidden');

                // ★Round5：プレイヤー復帰時のフルマップ描画はここ1回だけ。
                this.writeSystemDiagnostic('player_turn:before_render', castle);
                this.ui.renderMap();
                this._aiDeferredMapRefresh = false;
                this.writeSystemDiagnostic('player_turn:after_render', castle);
                this.ui.scrollToActiveCastle(castle);
                
                this.ui.showTurnStartDialog(castle, () => {
                    this.gunshiSystem.checkAndShowAdvice(castle, async () => {
                        // ★イベント追加：コマンドの選択前（手動操作時）
                        if (this.eventManager) {
                            await this.eventManager.processEvents('before_command', castle);
                        }
                        this.ui.showControlPanel(castle); 
                        this.writeSystemDiagnostic('player_turn:ready', castle);
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
            
            // UI側に現在の城だけをこっそり教えておきます。
            if (this.ui) this.ui.currentCastle = castle;
            
            const delay = 30;

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
        const wasProcessingAI = this.isProcessingAI;

        // ★最強ストッパー２：合戦中やマップ選択中なら、絶対にターンを勝手に終わらせない！
        if (this.warManager && this.warManager.state && this.warManager.state.active) return; 
        if (this.selectionMode != null) return;
        
        if (this.ui && typeof this.ui.hideAIWarThinking === 'function') {
            this.ui.hideAIWarThinking();
        }

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
            if (wasProcessingAI) this.writeAIDiagnostic(castle, 'turn_end:event');
            // ★イベント追加：各城の行動終了直後
            if (this.eventManager) {
                await this.eventManager.processEvents('turn_end', castle);
            }
            if (wasProcessingAI) this.writeAIDiagnostic(castle, 'turn_finished');
        }

        this.currentIndex++; 

        // Round26：戦争・外交・turn_endイベントまで含めて「今の拠点1件」が完全終了した地点です。
        // 観戦終了予約があれば次の拠点へ進まず、ここで初めて帰還確認を開きます。
        if (await this.tryProcessQueuedWatchReturn('turn_complete')) return;

        // ★追加：ターンが終わって次に行く時も、スマホがパンクしないように一瞬「息継ぎ」をさせます！
        setTimeout(() => {
            this.processTurn(); 
        }, 0);
    }

    async endMonth() {
        this.writeSystemDiagnostic('month_end:start');
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
            this.writeSystemDiagnostic('month_end:event_before_done');
        }
        await waitIfBusy(); // 終わったら、画面が空っぽになるまで絶対に待つ！

        // 1つ目の係員：派閥
        if (this.factionSystem && typeof this.factionSystem.processEndMonth === 'function') {
            await this.factionSystem.processEndMonth(); 
            this.writeSystemDiagnostic('month_end:faction_done');
        }
        await waitIfBusy(); // 終わったら、画面が空っぽになるまで絶対に待つ！

        // 2つ目の係員：独立（反乱して空白地になる処理など）
        if (this.independenceSystem && typeof this.independenceSystem.checkIndependence === 'function') {
            await this.independenceSystem.checkIndependence();
            this.writeSystemDiagnostic('month_end:independence_done');
        }
        await waitIfBusy(); // 終わったら、画面が空っぽになるまで絶対に待つ！
        
        // 3つ目の係員：外交
        if (this.diplomacyManager && typeof this.diplomacyManager.processEndMonth === 'function') {
            this.diplomacyManager.processEndMonth();
            this.writeSystemDiagnostic('month_end:diplomacy_done');
        }
        await waitIfBusy(); // 終わったら、画面が空っぽになるまで絶対に待つ！

        // 4つ目の係員：諸勢力（反乱など）
        if (this.kunishuSystem && typeof this.kunishuSystem.processEndMonth === 'function') {
            await this.kunishuSystem.processEndMonth();
            this.writeSystemDiagnostic('month_end:kunishu_done');
        }
        await waitIfBusy(); // 終わったら、画面が空っぽになるまで絶対に待つ！
        
        // 5つ目の係員：寿命
        if (this.lifeSystem && typeof this.lifeSystem.processEndMonth === 'function') {
            await this.lifeSystem.processEndMonth(); 
            this.writeSystemDiagnostic('month_end:life_done');
        }
        await waitIfBusy(); // 終わったら、画面が空っぽになるまで絶対に待つ！

        // 6つ目の係員：月末の特別イベント（災害など）
        if (this.eventManager) {
            await this.eventManager.processEvents('endMonth_after');
            this.writeSystemDiagnostic('month_end:event_after_done');
        }
        await waitIfBusy(); // 終わったら、画面が空っぽになるまで絶対に待つ！

        // すべての月末イベントとメッセージが完全に終わってから、ようやく時間を進めます！
        this.month++;
        if(this.month > 12) { this.month = 1; this.year++; }
        
        // ★ここから追加：月末のタイミングで大名家の表示名を更新して同名被りを防ぎます！
        this.updateClanDisplayNames();
        
        // ★修正：クリアとゲームオーバーの判定を EndingSystem (エンディング係) に任せます！
        const isEnding = await this.endingSystem.checkEnding();
        if (!isEnding) {
            // エンディングでなければ次の月へ進みます
            this.writeSystemDiagnostic('month_end:before_startMonth');
            await this.startMonth(); 
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
            this.getClan(clanId).leaderId = newLeaderId; 
            
            // ★追加：新しい大名が住んでいるお城を直轄（軍団ID: 0）に戻します
            const daimyoCastle = this.getCastle(newLeader.castleId);
            if (daimyoCastle) {
                daimyoCastle.legionId = 0;
            }
        } 
        this.updateAllCastlesLords();
    }
    
    // ==========================================
    // ★ここから整理整頓！：セーブとロードの「共通の魔法（まとめ）」です
    // ==========================================
    
    // ★追加：保存中に画面を触れなくするガード（バリア）の魔法！
    showSaveGuard() {
        let el = document.getElementById('save-guard');
        if (!el) {
            el = document.createElement('div');
            el.id = 'save-guard';
            el.innerHTML = '<div style="animation: blink-loading 1.5s infinite;">保存中...</div>';
            // 戦争思考中と同じような点滅文字と、画面全体を覆う半透明の黒背景を設定します
            el.style.cssText = "position: fixed; top: 0; left: 0; width: 100vw; height: 100vh; background: rgba(0,0,0,0.6); z-index: 9999; display: flex; justify-content: center; align-items: center; color: #ffffff; font-size: 2rem; font-weight: bold; text-shadow: 2px 2px 4px #000, -2px -2px 4px #000, 2px -2px 4px #000, -2px 2px 4px #000; pointer-events: all;";
            document.body.appendChild(el);
        }
        el.style.display = 'flex';
    }

    hideSaveGuard() {
        const el = document.getElementById('save-guard');
        if (el) {
            el.style.display = 'none';
        }
    }

    // どんな方法でセーブする時も、この魔法で「今のゲームの全データ」をひとまとめにします
    async _createSaveDataObj(options = {}) {
        let scenarioIndex = SCENARIOS.findIndex(s => s.folder === this.scenarioFolder);
        let scenarioName = "不明なシナリオ";
        let scenarioNo = "";
        if (scenarioIndex !== -1) {
            scenarioName = SCENARIOS[scenarioIndex].name;
            scenarioNo = `シナリオ${scenarioIndex + 1}`;
        } else if (this.scenarioName) {
            scenarioName = this.scenarioName;
            scenarioNo = this.scenarioNo;
        }
        const now = new Date();
        const saveTime = `${now.getFullYear()}/${String(now.getMonth() + 1).padStart(2, '0')}/${String(now.getDate()).padStart(2, '0')} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

        // ★安定化：オートセーブ時は勢力図サムネイルを作らない選択ができます。
        // フルサイズCanvas→縮小Canvasの同時生成は、低メモリ端末では大きな瞬間負荷になります。
        const includeThumbnail = options.includeThumbnail !== false;
        const mapThumbnail = includeThumbnail ? await this.generateSaveMapImage() : null;

        return { 
            year: this.year, 
            month: this.month, 
            gameStartYear: this.gameStartYear || window.MainParams.StartYear,
            gameStartMonth: this.gameStartMonth || window.MainParams.StartMonth,
            scenarioFolder: this.scenarioFolder,
            scenarioName: scenarioName,
            scenarioNo: scenarioNo,
            saveTime: saveTime,
            saveTimestamp: now.getTime(),
            mapThumbnail: mapThumbnail, // ★追加：撮った写真も一緒に保存します
            castles: this.castles,
            bushos: this.bushos,
            clans: this.clans,
            princesses: this.princesses,
            provinces: this.provinces,
            legions: this.legions,
            playerClanId: this.playerClanId,
            kunishus: this.kunishuSystem.kunishus,
            mapWidth: this.mapWidth,
            mapHeight: this.mapHeight,
            aiOperations: this.aiOperationManager.save(),
            turnQueueIds: this.turnQueue.map(c => c.id),
            currentIndex: this.currentIndex,
            flags: this.flags || {}
        };
    }
    
    // ==========================================
    // ★追加：セーブデータ用の勢力図画像を生成する魔法（修正版）
    // ==========================================
    async generateSaveMapImage() {
        return new Promise(async (resolve) => {
            const w = this.mapWidth || 1200;
            const h = this.mapHeight || 800;

            // 白地図を読み込みます
            const loadImg = (src) => new Promise(res => { 
                const img = new Image(); 
                img.onload = () => res(img); 
                img.onerror = () => res(null); 
                img.src = src; 
            });
            const whiteMapImg = await loadImg('./data/images/map/japan_white_map.png');

            if (!whiteMapImg) {
                resolve(null); return; 
            }

            const canvas = document.createElement('canvas');
            canvas.width = w;
            canvas.height = h;
            const ctx = canvas.getContext('2d');

            // 1. まずは白地図を描きます
            ctx.drawImage(whiteMapImg, 0, 0, w, h);

            // 2. 画面に表示されている「色塗り済みの透明フィルム」をそのまま重ねます！
            const clanColorOverlay = document.getElementById('clan-color-overlay');
            if (clanColorOverlay) {
                ctx.drawImage(clanColorOverlay, 0, 0, w, h);
            } else if (this.ui && this.ui.lastClanColorsImageData) {
                // 万が一画面に無い場合も、記憶しておいたデータから復元して重ねます
                const tempCanvas = document.createElement('canvas');
                tempCanvas.width = w;
                tempCanvas.height = h;
                tempCanvas.getContext('2d').putImageData(this.ui.lastClanColorsImageData, 0, 0);
                ctx.drawImage(tempCanvas, 0, 0, w, h);
            }

            // 3. データが重くならないように、最後に「1/4のサイズ」に縮小して写真を撮ります
            const thumbCanvas = document.createElement('canvas');
            const scale = 0.25; 
            thumbCanvas.width = w * scale;
            thumbCanvas.height = h * scale;
            const thumbCtx = thumbCanvas.getContext('2d');
            thumbCtx.imageSmoothingEnabled = true;
            thumbCtx.imageSmoothingQuality = 'high';
            thumbCtx.drawImage(canvas, 0, 0, thumbCanvas.width, thumbCanvas.height);

            // ★超重要：ブラウザのセキュリティ制限（CORS）でエラーになるのを防ぐバリアです！
            try {
                const dataUrl = thumbCanvas.toDataURL('image/jpeg', 0.6);
                resolve(dataUrl);
            } catch (e) {
                console.warn("セキュリティ制限により、セーブ用画像の生成をスキップしました:", e);
                resolve(null); // エラーが起きてもゲームが止まらないようにします
            }
        });
    }
    
    // どんな方法でロードした時も、この魔法で「受け取ったデータ」をゲーム内に展開します
    async _restoreSaveDataObj(d) {
        // --- お掃除作業 ---
        this.isProcessingAI = false; 
        this.isWatchMode = false; 
        this.originalPlayerClanId = null; 
        // ロードした直後は無意味なオートセーブが走らないよう、すでに「セーブ済み」の印をつけておきます！
        this.hasAutoSavedThisMonth = true;
        if (this.aiTimer) { clearTimeout(this.aiTimer); this.aiTimer = null; }
        this.selectionMode = null;
        this.validTargets = [];
        this.lastMenuState = null;
        if (this.warManager && this.warManager.state) this.warManager.state.active = false;
        if (this.ui) {
            this.ui.logHistory = [];
            this.ui.clearWarLog();
            if (typeof this.ui.clearCommandMenu === 'function') this.ui.clearCommandMenu();
        }
        this.eventManager = new EventManager(this);
        if (this.gunshiSystem) this.gunshiSystem.onStartMonth();
        
        // --- 復元作業 ---
        this.flags = d.flags || {};
        this.year = d.year;
        this.month = d.month;
        this.gameStartYear = d.gameStartYear || window.MainParams.StartYear;
        this.gameStartMonth = d.gameStartMonth || window.MainParams.StartMonth;
        this.playerClanId = d.playerClanId || 1;
        
        this.scenarioFolder = d.scenarioFolder || "";
        this.scenarioName = d.scenarioName || "不明なシナリオ";
        this.scenarioNo = d.scenarioNo || "";
        
        this.mapWidth = d.mapWidth;
        this.mapHeight = d.mapHeight;
        this.aiOperationManager.load(d.aiOperations);

        // 地図や画像の読み込み
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
                if (url.includes('japan_map.png')) {
                    this.mapWidth = img.width;
                    this.mapHeight = img.height;
                }
                resolve();
            };
            img.onerror = () => {
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
        
        // ★ここから追加：セーブデータを読み込んだ後に、最新の武将データ(CSV)から「適性・技能・能力値・性格」だけを上書き（同期）する魔法です！
        try {
            // 今プレイしているシナリオのフォルダを探します
            const path = `./data/scenarios/${this.scenarioFolder}/`;
            // 最新の武将ファイル（warriors.bin または warriors.csv）を読み込みます
            const bushosText = await DataManager.fetchCompressed(path + "warriors.bin").catch(() => DataManager.fetchText(path + "warriors.csv"));
            // 読み込んだ文字を、武将のリストに翻訳します
            const latestBushos = DataManager.parseCSV(bushosText, Busho);
            
            // 最新の武将リストを「出席番号（ID）」でパッと探せるように、早見表を作ります
            const latestBushoMap = new Map();
            latestBushos.forEach(b => latestBushoMap.set(b.id, b));
            
            // セーブデータから復元した自分の武将たちを1人ずつチェックします
            this.bushos.forEach(savedBusho => {
                // 最新のデータの中に同じIDの人がいるか探します
                const latestData = latestBushoMap.get(savedBusho.id);
                if (latestData) {
                    // ① 適性と技能の差し替え
                    savedBusho.aptAshigaru = latestData.aptAshigaru; // 足軽
                    savedBusho.aptKiba = latestData.aptKiba;         // 騎馬
                    savedBusho.aptTeppo = latestData.aptTeppo;       // 鉄砲
                    savedBusho.aptYumi = latestData.aptYumi;         // 弓術
                    savedBusho.aptBugei = latestData.aptBugei;       // 武芸
                    savedBusho.aptNinjutsu = latestData.aptNinjutsu; // 忍術
                    savedBusho.aptMaritime = latestData.aptMaritime; // 操船
                    savedBusho.skill = latestData.skill;             // 技能

                    // ② 性格・相性パラメータの差し替え（絶対変動しないもの）
                    savedBusho.innovation = latestData.innovation;   // 革新
                    savedBusho.cooperation = latestData.cooperation; // 協調
                    savedBusho.ambition = latestData.ambition;       // 野心
                    savedBusho.duty = latestData.duty;               // 義理
                    savedBusho.affinity = latestData.affinity;       // 相性

                    // ③ 魅力の差し替え（経験値による変動がないためそのまま）
                    savedBusho.charm = latestData.charm;

                    // ④ 他の5つの能力値は、「全盛期の基礎値（ベース）」を差し替えます！
                    savedBusho.baseLeadership = latestData.baseLeadership;     // 統率
                    savedBusho.baseStrength = latestData.baseStrength;         // 武勇
                    savedBusho.basePolitics = latestData.basePolitics;         // 政治
                    savedBusho.baseDiplomacy = latestData.baseDiplomacy;       // 外交
                    savedBusho.baseIntelligence = latestData.baseIntelligence; // 智謀
                }
            });
        } catch (error) {
            // 万が一ファイルの読み込みに失敗しても、ゲームが止まらないようにする安全装置です
            console.warn("最新の武将データの読み込み（同期）に失敗しましたが、ゲームはそのまま続行します。", error);
        }
        // ★追加ここまで！

        this.princesses = (d.princesses || []).map(p => new Princess(p));
        this.provinces = (d.provinces || []).map(p => new Province(p));
        this.legions = (d.legions || []).map(l => new Legion(l));
        
        FamilyLinker.rebuildAllFamilyIds(this.bushos, this.princesses);

        this.legions.forEach(legion => {
            const commander = this.bushos.find(b => b.id === legion.commanderId);
            if (commander) commander.isCommander = true;
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
            const data = await DataManager.loadAll(scenario.folder);
            this.clans = data.clans;
        }
        
        const courtRanksText = await DataManager.fetchText("./data/imperialCourtRank.csv").catch(() => "");
        const courtRanks = courtRanksText ? DataManager.parseCSV(courtRanksText, CourtRank) : [];
        this.courtRankSystem.setRankData(courtRanks);

        document.getElementById('title-screen').classList.add('hidden');
        document.getElementById('app').classList.remove('hidden'); 
        
        this.phase = 'game';
        
        if (d.turnQueueIds && d.turnQueueIds.length > 0) {
            this.turnQueue = d.turnQueueIds.map(id => this.castles.find(c => c.id === id)).filter(c => c !== undefined);
            this.currentIndex = d.currentIndex || 0;
        } else {
            this.turnQueue = [...this.castles].sort(() => Math.random() - 0.5);
            this.currentIndex = 0;
        }
        
        this.updateAllCastlesLords();
        this.lifeSystem.updateAllBushosAge();
        this.updateClanDisplayNames();

        this.ui.hasInitializedMap = false;
        this.ui.renderMap();

        if (window.AudioManager) {
            window.AudioManager.playBGM('SC_ex_Town2_Fortress.ogg');
        }

        // ★追加：画面の準備が整ったので、ここでロード画面を隠します
        if (this.ui) this.ui.hideLoadingScreen();

        await this.ui.showCutin(`ロード完了: ${this.year}年 ${this.month}月`);
        this.processTurn();
    }

    // ==========================================
    // セーブ実行部分
    // ==========================================

    // ★追加：セーブデータをバイナリにして暗号化する魔法
    _encryptData(obj) {
        // 1. まずはデータを文字にします
        const jsonStr = JSON.stringify(obj);
        // 2. 文字をバイナリ（数字の配列）に変換します
        const encoder = new TextEncoder();
        const uint8 = encoder.encode(jsonStr);
        // 3. パスワードを決めて、データを混ぜ合わせます（暗号化）
        const key = "SengokuHadoKey";
        for (let i = 0; i < uint8.length; i++) {
            uint8[i] ^= key.charCodeAt(i % key.length);
        }
        return uint8; // 暗号化されたバイナリデータを返します
    }

    // ★追加：暗号化されたバイナリデータを元に戻す魔法
    _decryptData(uint8) {
        const key = "SengokuHadoKey";
        const decrypted = new Uint8Array(uint8.length);
        // 1. パスワードを使って、混ぜ合わさったデータを元に戻します（復号化）
        for (let i = 0; i < uint8.length; i++) {
            decrypted[i] = uint8[i] ^ key.charCodeAt(i % key.length);
        }
        // 2. バイナリを文字に戻して、ゲーム用のデータに変換します
        const decoder = new TextDecoder();
        const jsonStr = decoder.decode(decrypted);
        return JSON.parse(jsonStr);
    }

    // ファイルへセーブ
    async saveGameToFile() { 
        this.showSaveGuard(); // ★追加：保存中のバリアを張ります
        try {
            const data = await this._createSaveDataObj(); // ★待つように変更
            const encryptedData = this._encryptData(data); // ★暗号化します
            const blob = new Blob([encryptedData], {type: 'application/octet-stream'}); // ★バイナリデータとして保存します
            const url = URL.createObjectURL(blob); 
            const a = document.createElement('a'); 
            a.href = url; 
            a.download = `sengoku_save_${this.year}_${this.month}.sav`; // ★拡張子を.savに変更します
            a.click(); 
            URL.revokeObjectURL(url); 
        } finally {
            this.hideSaveGuard(); // ★追加：保存が終わったらバリアを解除します
        }
    }
    
    // ファイルからロード
    loadGameFromFile(e) { 
        const file = e.target.files[0]; if (!file) return; 
        e.target.value = '';
        
        const reader = new FileReader(); 
        reader.onload = async (evt) => {
            try { 
                const uint8 = new Uint8Array(evt.target.result); // ★バイナリデータとして受け取ります
                const d = this._decryptData(uint8); // ★復号化します
                await this._restoreSaveDataObj(d);
            } catch(err) { 
                console.error(err); 
                if (this.ui) {
                    this.ui.showDialog("セーブデータの読み込みに失敗しました。", false);
                }
            } 
        }; 
        reader.readAsArrayBuffer(file); // ★テキストではなくバイナリとして読み込む魔法に変更します
    }
    
    // スロットへセーブ (IndexedDB)
    async saveGameToLocal(slotNo = 1) { 
        this.showSaveGuard(); // ★追加：保存中のバリアを張ります
        try {
            const data = await this._createSaveDataObj(); // ★待つように変更
            const encryptedData = this._encryptData(data); // ★暗号化します
            await saveToDB("sengoku_save_slot" + slotNo, encryptedData);
            this.hasSaveData = true; // ★追加：セーブしたので「データあり」の印をつけます
            
            // ★追加：もしメニューが開いていたら、ロードボタンを押せるように画面を更新します
            if (this.ui && typeof this.ui.renderCommandMenu === 'function') {
                this.ui.renderCommandMenu();
            }

            if (this.ui) this.ui.showDialog(`スロット ${slotNo} にセーブが完了しました。`, false);
        } catch (e) {
            console.error("セーブエラーの詳細:", e);
            if (this.ui) {
                this.ui.showDialog("セーブに失敗しました。エラー原因: " + e.message, false);
            }
        } finally {
            this.hideSaveGuard(); // ★追加：保存が終わったらバリアを解除します
        }
    }

    // スロットからロード (IndexedDB)
    async loadGameFromLocal(slotNo = 1, prefix = "sengoku_save_slot") { 
        // ★追加：ロードが始まった瞬間にロード画面で蓋をします！
        if (this.ui) this.ui.showLoadingScreen();

        let rawData = null;
        try {
            rawData = await loadFromDB(prefix + slotNo);
        } catch (e) {
            console.error("ロードエラー:", e);
        }

        if (!rawData) {
            if (this.ui) {
                this.ui.hideLoadingScreen(); // ★エラーで止まる時は蓋を開けます
                this.ui.showDialog(`スロット ${slotNo} にはセーブデータがありません。`, false);
            }
            return;
        }

        try {
            let d;
            // ★以前の暗号化されていないデータも読み込めるようにする思いやりです
            if (rawData instanceof Uint8Array) {
                d = this._decryptData(rawData); // ★復号化します
            } else {
                d = rawData;
            }
            await this._restoreSaveDataObj(d);
        } catch(err) { 
            console.error(err); 
            if (this.ui) {
                this.ui.hideLoadingScreen(); // ★エラーの時も蓋を開けます
                this.ui.showDialog("セーブデータの読み込みに失敗しました。", false);
            }
        }
    }

    // ★追加：オートセーブを実行する魔法
    async executeAutoSave() {
        // ★安定化：何らかの経路で二重呼び出しされても、同時に2本走らせません。
        if (this._autoSaveInProgress) return;
        this._autoSaveInProgress = true;
        this.showSaveGuard();
        try {
            let autoSaveIndex = parseInt(localStorage.getItem('autoSaveIndex')) || 1;

            // ★低メモリ端末対策
            // オートセーブは内部IndexedDB専用なので、勢力図サムネイルを省き、
            // JSON.stringify→巨大文字列→TextEncoder→巨大Uint8Array という一時的な二重・三重保持も避けます。
            // ロード側は従来から「Uint8Arrayなら復号、オブジェクトならそのまま」に対応しているため互換性があります。
            const data = await this._createSaveDataObj({ includeThumbnail: false });
            await saveToDB("sengoku_autosave_slot" + autoSaveIndex, data);

            autoSaveIndex++;
            if (autoSaveIndex > 5) autoSaveIndex = 1;
            localStorage.setItem('autoSaveIndex', autoSaveIndex);
        } catch (e) {
            console.error("オートセーブに失敗しました:", e);
        } finally {
            this._autoSaveInProgress = false;
            this.hideSaveGuard();
        }
    }

    // ★追加：最新のセーブデータを自動で見つけて読み込む魔法 (続きから)
    async continueGame() {
        // ★追加：探している間に操作されないようにロード画面で蓋をします！
        if (this.ui) this.ui.showLoadingScreen();

        let latestSlot = -1;
        let latestTime = 0;
        let latestPrefix = "";

        // 手動セーブとオートセーブ、両方のお部屋を探しに行きます
        const prefixes = ["sengoku_save_slot", "sengoku_autosave_slot"];

        for (const prefix of prefixes) {
            for (let i = 1; i <= 5; i++) {
                try {
                    const rawData = await loadFromDB(prefix + i);
                    if (rawData) {
                        let d = rawData;
                        // 暗号化されたデータなら一度開いて中身を見ます
                        if (d instanceof Uint8Array) {
                            try {
                                d = this._decryptData(d);
                            } catch(err) {
                                d = null;
                            }
                        }
                        // ★セーブした時間をミリ秒優先で見て、一番新しいものを探します
                        if (d) {
                            const time = d.saveTimestamp || (d.saveTime ? new Date(d.saveTime).getTime() : 0);
                            if (time > latestTime) {
                                latestTime = time;
                                latestSlot = i;
                                latestPrefix = prefix;
                            } else if (latestSlot === -1) {
                                // 時間が記録されていなければ、とりあえず見つけたスロットをメモします
                                latestSlot = i;
                                latestPrefix = prefix;
                            }
                        }
                    }
                } catch (e) {
                    console.error("セーブデータ取得エラー:", e);
                }
            }
        }

        // 一番新しいデータが見つかったら、それを読み込みます！
        if (latestSlot !== -1) {
            this.loadGameFromLocal(latestSlot, latestPrefix);
        } else {
            if (this.ui) {
                this.ui.hideLoadingScreen(); // ★データがなくてやめる時は蓋を開けます
                this.ui.showDialog("セーブデータが見つかりません。", false);
            }
        }
    }
    
    // ==========================================
    // 観戦モードの切り替え
    // ==========================================
    // Round27：途中からの観戦と、タイトルから最初から観戦する処理で状態初期化を共用します。
    _prepareFreshWatchMode(originalPlayerClanId = null) {
        this.originalPlayerClanId = originalPlayerClanId;
        this.playerClanId = -100;
        this.isWatchMode = true;
        this._watchReturnRequested = false;
        this._watchReturnInProgress = false;
        this._watchReturnSafePoint = null;
        if (this.ui && typeof this.ui.hideWatchReturnReserved === 'function') {
            this.ui.hideWatchReturnReserved();
        }
        if (this.ui && typeof this.ui.clearCommandMenu === 'function') {
            this.ui.clearCommandMenu();
        }
    }

    startWatchMode() {
        // ゲーム途中から観戦する場合は、戻る時の参考として元の担当勢力を覚えておきます。
        this._prepareFreshWatchMode(this.playerClanId);
        this.processTurn();
    }

    // Round26：右クリック／長押しでは、その場で選択画面を出さず「帰還予約」だけを立てます。
    // 予約後の同じ操作は無視され、現在の戦争・イベント・月処理を途中で切断しません。
    requestWatchReturn() {
        if (!this.isWatchMode) return false;
        if (this._watchReturnRequested || this._watchReturnInProgress) return false;

        this._watchReturnRequested = true;
        this._watchReturnSafePoint = null;
        if (typeof this.writeSystemDiagnostic === 'function') {
            this.writeSystemDiagnostic('watch_return:requested');
        }
        if (this.ui && typeof this.ui.showWatchReturnReserved === 'function') {
            this.ui.showWatchReturnReserved('観戦終了を予約しました\n現在の処理が終わるまで待機します');
        }
        return true;
    }

    // Round26：呼び出すのは「拠点1件の完了後」または「月初処理の全完了後」だけです。
    // 念のため戦闘・選択・残存ダイアログも確認してから帰還確認へ進みます。
    async tryProcessQueuedWatchReturn(reason = 'safe_point') {
        if (!this.isWatchMode || !this._watchReturnRequested || this._watchReturnInProgress) return false;
        if (this.warManager && this.warManager.state && this.warManager.state.active) return false;
        if (this.fieldWarManager && this.fieldWarManager.active) return false;
        if (this.selectionMode != null) return false;

        if (this.ui && typeof this.ui.waitForDialogs === 'function') {
            await this.ui.waitForDialogs();
        }

        // wait中に状態が変わった場合は、もう一度条件を確認します。
        if (!this.isWatchMode || !this._watchReturnRequested || this._watchReturnInProgress) return false;
        if (this.warManager && this.warManager.state && this.warManager.state.active) return false;
        if (this.fieldWarManager && this.fieldWarManager.active) return false;
        if (this.selectionMode != null) return false;

        // 災害イベント地図・占領点滅などが万一残っている時は、その場では割り込みません。
        const eventOverlay = typeof document !== 'undefined' ? document.querySelector('.event-map-overlay') : null;
        const battleGuard = typeof document !== 'undefined' ? document.getElementById('battle-blink-guard') : null;
        if (eventOverlay || (battleGuard && battleGuard.style.display !== 'none')) return false;

        this._watchReturnInProgress = true;
        this._watchReturnSafePoint = reason;
        if (this.aiTimer) {
            clearTimeout(this.aiTimer);
            this.aiTimer = null;
        }
        if (this.ui && typeof this.ui.hideWatchReturnReserved === 'function') {
            this.ui.hideWatchReturnReserved();
        }
        if (typeof this.writeSystemDiagnostic === 'function') {
            this.writeSystemDiagnostic(`watch_return:safe:${reason}`);
        }

        // 以前と同じ確認自体は残しますが、「安全地点」に到着してから初めて表示します。
        this.ui.showDialog('観戦をやめますか？', true, () => {
            this.stopWatchMode();
        }, () => {
            this.cancelQueuedWatchReturn();
        }, { okText: '観戦をやめる', okClass: 'btn-primary', cancelText: '観戦を続ける' });
        return true;
    }

    _resetWatchReturnState() {
        this._watchReturnRequested = false;
        this._watchReturnInProgress = false;
        this._watchReturnSafePoint = null;
        if (this.ui && typeof this.ui.hideWatchReturnReserved === 'function') {
            this.ui.hideWatchReturnReserved();
        }
    }

    // 帰還確認・勢力選択をキャンセルした時は、止めていた安全地点から観戦を再開します。
    cancelQueuedWatchReturn() {
        const shouldResume = this.isWatchMode;
        this._resetWatchReturnState();
        if (!shouldResume) return;

        this.isProcessingAI = true;
        if (this.ui && this.ui.aiGuard) {
            this.ui.aiGuard.classList.remove('hidden');
            if (typeof this.ui.restoreAIGuardText === 'function') this.ui.restoreAIGuardText(true);
            if (this.turnQueue && this.turnQueue.length > 0 && typeof this.ui.updateAIProgress === 'function') {
                const displayIndex = Math.min(this.currentIndex + 1, this.turnQueue.length);
                this.ui.updateAIProgress(displayIndex, this.turnQueue.length);
            }
        }
        setTimeout(() => this.processTurn(), 0);
    }

    stopWatchMode() {
        if (!this.ui) {
            location.reload();
            return;
        }

        // この画面を開いている間はAI進行を完全に止めたままにします。
        if (this.aiTimer) {
            clearTimeout(this.aiTimer);
            this.aiTimer = null;
        }

        this.ui.info.showDaimyoSelector((selectedClanId) => {
            const selectedClan = this.clans.find(c => c.id === selectedClanId);
            if (!selectedClan) {
                this.cancelQueuedWatchReturn();
                return;
            }
            this.ui.showDialog(`${selectedClan.name}でゲームを再開しますか？`, true, () => {
                this.isWatchMode = false;
                this.playerClanId = selectedClan.id;
                this._resetWatchReturnState();
                
                if (this.ui.clearCommandMenu) {
                    this.ui.clearCommandMenu();
                }
                if (this.ui.aiGuard) this.ui.aiGuard.classList.add('hidden');
                this.ui.renderMap();

                // Round26：安全地点でAI進行を止めているため、担当勢力決定後に明示的に再開します。
                setTimeout(() => this.processTurn(), 0);
            }, () => {
                this.cancelQueuedWatchReturn();
            }, { okText: '再開する', okClass: 'btn-primary', cancelText: '観戦を続ける' });
        }, () => {
            this.cancelQueuedWatchReturn();
        });
    }

}

window.addEventListener('DOMContentLoaded', () => {
    document.addEventListener('contextmenu', (e) => {
        e.preventDefault();
    }, { passive: false });

    document.addEventListener('touchmove', (e) => {
        if (!e.target.closest('.scroll-wrapper, .list-container, #map-scroll-container, .fw-map-scroll, .scenario-desc-box, .result-body, .message-area')) {
            e.preventDefault();
        }
    }, { passive: false });

    window.GameApp = new GameManager();
});

// ==========================================
// セーブデータを大容量の倉庫（IndexedDB）に保存・読み込みする魔法
// ==========================================
const DB_NAME = 'SengokuHadoDB';
const STORE_NAME = 'saves';

function initDB() {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, 1);
        request.onupgradeneeded = (e) => {
            e.target.result.createObjectStore(STORE_NAME);
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

async function saveToDB(key, data) {
    const db = await initDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        let finished = false;
        const closeAndFinish = (ok, value) => {
            if (finished) return;
            finished = true;
            try { db.close(); } catch (_) {}
            if (ok) resolve(value);
            else reject(value);
        };

        tx.objectStore(STORE_NAME).put(data, key);
        tx.oncomplete = () => closeAndFinish(true);
        tx.onerror = () => closeAndFinish(false, tx.error);
        tx.onabort = () => closeAndFinish(false, tx.error || new Error('IndexedDB transaction aborted'));
    });
}

async function loadFromDB(key) {
    const db = await initDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readonly');
        const request = tx.objectStore(STORE_NAME).get(key);
        let result;
        let finished = false;
        const closeAndFinish = (ok, value) => {
            if (finished) return;
            finished = true;
            try { db.close(); } catch (_) {}
            if (ok) resolve(value);
            else reject(value);
        };

        request.onsuccess = () => { result = request.result; };
        request.onerror = () => closeAndFinish(false, request.error);
        tx.oncomplete = () => closeAndFinish(true, result);
        tx.onerror = () => closeAndFinish(false, tx.error || request.error);
        tx.onabort = () => closeAndFinish(false, tx.error || request.error || new Error('IndexedDB transaction aborted'));
    });
}