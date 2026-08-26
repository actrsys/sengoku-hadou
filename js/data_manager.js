/**
 * data_manager.js
 * シナリオ定義、CSV/BIN読み込み、初期データ結合を専門管理します。
 * GameManager は読み込みのタイミングだけを指揮し、データ形式や読み込み手順はここへ委譲します。
 */

/* ==========================================================================
   ★ シナリオ定義 & 設定
   ========================================================================== */
const SCENARIOS = [
    { name: "1560年 桶狭間の戦い", desc: "永禄三年、畿内では三好氏が権勢を誇っていた。東国では武田・北条・長尾が覇を競い、中国地方では毛利氏が雄飛し、諸大名の争いの火は絶えない。そのような折、海道一の弓取り・今川義元が大軍を率いて尾張へ侵攻を開始した。これを迎え撃つは織田信長。彼はいまだ、尾張一国すら纏め上げられていない。", folder: "1560_okehazama", startYear: 1560, startMonth: 4 }
];



/* ==========================================================================
    データ管理 (DataManager)
   ========================================================================== */
class DataManager {
    // ★汎用姫は名前と読みを対で保持します。
    static genericPrincessProfiles = [];

    // シナリオ切替時の巨大IDマップを明示的に解放する正規窓口。
    // UIやイベント側にも同じTypedArrayへの共有参照があるため、GameManagerからそれらを切った後に呼ぶ。
    static releaseMapResources() {
        this.provincePixelMap = null;
        this.castlePixelMap = null;
        this.castlePixelBounds = null;
        this.castlePixelCenters = null;
        this.provincePixelCount = 0;
        this.mapImageWidth = 0;
        this.mapImageHeight = 0;
    }
    
    static async loadAll(folderName, options = {}) {
        const selectedScenario = SCENARIOS.find(s => s.folder === folderName);
        if (selectedScenario) {
            window.MainParams.StartYear = selectedScenario.startYear;
            window.MainParams.StartMonth = selectedScenario.startMonth;
        }
        const path = `./data/scenarios/${folderName}/`;
        const onProgress = typeof options.onProgress === 'function' ? options.onProgress : null;
        const progress = (value, label) => {
            if (onProgress) onProgress(Math.max(0, Math.min(100, Number(value) || 0)), label || '');
        };
        try {
            progress(4, 'シナリオデータを読み込んでいます');
            if (window.MainParams.System.UseRandomNames) {
                // ★ここから追加：generic_princess.csv を読み込む魔法です！
                try {
                    const princessNamesText = await this.fetchText("./data/generic_princess.csv");
                    this.parseGenericPrincessProfiles(princessNamesText);
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
            progress(20, 'データを展開しています');
            await this.yieldToBrowser();
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
            progress(34, '地図データを準備しています');
            await this.yieldToBrowser();

            // 城色画像は「領域」ではなく各城の種点だけを持つため、まず座標だけを低メモリで取得します。
            // その後、国IDマップを1回走査で生成し、国内の最寄り城へ各ピクセルを割り当てて領土IDマップを作ります。
            // 巨大RGBA配列や全画面BFSキューは保持せず、古いスマホでは帯ごとにブラウザへ制御を返します。
            try {
                await this.loadCastleSeedPoints('./data/images/map/japan_colorcode_map.png', castles, {
                    onProgress: ratio => progress(36 + ratio * 12, '城の位置を解析しています')
                });
            } catch (e) {
                console.log("城位置画像の解析をスキップしました");
            }

            try {
                await this.loadProvinceMap('./data/images/map/japan_provinces.png', provinces, {
                    onProgress: ratio => progress(48 + ratio * 18, '国境データを解析しています')
                });
                await this.buildCastleTerritoryMap(castles, provinces, {
                    onProgress: ratio => progress(66 + ratio * 20, '勢力領域を準備しています')
                });
            } catch (e) {
                console.log("領土地図の解析をスキップしました");
            }
            progress(88, 'ゲームデータを仕上げています');
            await this.yieldToBrowser();

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
            if (window.LifeStatusRules.isUnavailable(p)) {
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

            // ゲーム開始時点ですでに経過済みの「年代指定顔」は PortraitRules を正本にして解決します。
            // daimyo: 等の非年代条件はこの段階では扱わず、後段の専門処理へ残します。
            if (b.faceChange && window.PortraitRules) {
                const latestFaceData = window.PortraitRules.getLatestYearFace(b.faceChange, startYear);
                if (latestFaceData) b.faceIcon = latestFaceData;
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
    // generic_princess.csv の名前と読みを、架空姫生成用プロフィールとして保持します。
    static parseGenericPrincessProfiles(text) {
        const lines = text.split('\n').map(l => l.trim()).filter(l => l);
        this.genericPrincessProfiles = [];
        if (lines.length < 2) return;

        for (let i = 1; i < lines.length; i++) {
            const parts = lines[i].split(',');
            const name = (parts[0] || '').trim();
            const yomi = (parts[1] || '').trim();
            if (name) this.genericPrincessProfiles.push({ name, yomi });
        }
    }

    /** ブラウザへ描画・入力処理の時間を返します。古いスマホで長時間メインスレッドを占有しないために使います。 */
    static yieldToBrowser() {
        return new Promise(resolve => {
            if (typeof requestAnimationFrame === 'function') {
                requestAnimationFrame(() => setTimeout(resolve, 0));
            } else {
                setTimeout(resolve, 0);
            }
        });
    }

    static createCompactIdArray(maxId, length) {
        if (maxId <= 255) return new Uint8Array(length);
        if (maxId <= 65535) return new Uint16Array(length);
        return new Uint32Array(length);
    }

    static async loadImageElement(url) {
        return new Promise(resolve => {
            const img = new Image();
            img.decoding = 'async';
            img.onload = () => resolve(img);
            img.onerror = () => resolve(null);
            img.src = url;
        });
    }

    // ============================================
    // 地図画像の低メモリ解析
    // ============================================
    static async scanImageByStrips(url, onStrip, options = {}) {
        const onProgress = typeof options.onProgress === 'function' ? options.onProgress : null;
        const img = await this.loadImageElement(url);
        if (!img) return null;

        const width = img.naturalWidth || img.width;
        const height = img.naturalHeight || img.height;
        if (!width || !height) return null;

        const isPC = document.body && document.body.classList.contains('is-pc');
        // 古いスマホは一時RGBAと連続CPU時間を抑え、PCはyield回数を減らします。
        const stripHeightBase = isPC ? 128 : 32;
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = Math.min(stripHeightBase, height);
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        if (!ctx) return null;

        for (let yStart = 0; yStart < height; yStart += stripHeightBase) {
            const stripHeight = Math.min(stripHeightBase, height - yStart);
            ctx.clearRect(0, 0, width, canvas.height);
            ctx.drawImage(img, 0, yStart, width, stripHeight, 0, 0, width, stripHeight);
            let imageData = ctx.getImageData(0, 0, width, stripHeight);
            await onStrip(imageData.data, width, stripHeight, yStart, height);
            imageData = null;
            if (onProgress) onProgress((yStart + stripHeight) / height);
            await this.yieldToBrowser();
        }

        try { canvas.width = 1; canvas.height = 1; } catch (e) {}
        try { img.src = ''; } catch (e) {}
        await this.yieldToBrowser();
        return { width, height };
    }

    // 城色画像は各領域を塗った画像ではなく、各城の位置を示す数ピクセルの種点画像です。
    // ここでは巨大なpixelMapを作らず、各城の最初の一致座標だけを取得します。
    static async loadCastleSeedPoints(url, castles, options = {}) {
        const colorToCastleId = new Map();
        const castleById = new Map();
        const foundIds = new Set();
        for (const c of castles) {
            const castleId = Number(c.id) || 0;
            castleById.set(castleId, c);
            if (!/^#?[0-9a-f]{6}$/i.test(String(c.castlesColorCode || '').trim())) continue;
            const rgb = this.hexToRgb(c.castlesColorCode);
            colorToCastleId.set((rgb.r << 16) | (rgb.g << 8) | rgb.b, castleId);
        }

        const result = await this.scanImageByStrips(url, async (data, width, stripHeight, yStart) => {
            const stripPixels = width * stripHeight;
            for (let p = 0; p < stripPixels; p++) {
                const i = p * 4;
                if (data[i + 3] === 0) continue;
                const key = (data[i] << 16) | (data[i + 1] << 8) | data[i + 2];
                const castleId = colorToCastleId.get(key) || 0;
                if (!castleId || foundIds.has(castleId)) continue;
                const localY = Math.floor(p / width);
                const x = p - localY * width;
                const castle = castleById.get(castleId);
                if (castle) {
                    castle.pixelX = x;
                    castle.pixelY = yStart + localY;
                }
                foundIds.add(castleId);
                if (foundIds.size >= colorToCastleId.size) break;
            }
        }, options);

        if (!result) {
            console.warn('カラーマップの画像の読み込みに失敗しました！');
            return;
        }
        for (const c of castles) {
            if (c.castlesColorCode && !foundIds.has(Number(c.id))) {
                console.warn(`色 ${c.castlesColorCode} が ${c.name} のために見つかりませんでした！`);
            }
        }
        this.mapImageWidth = result.width;
        this.mapImageHeight = result.height;
    }

    static hexToRgb(hex) {
        const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex || '');
        return result ? {
            r: parseInt(result[1], 16),
            g: parseInt(result[2], 16),
            b: parseInt(result[3], 16)
        } : { r: 0, g: 0, b: 0 };
    }

    static async loadProvinceMap(url, provinces = [], options = {}) {
        let maxProvinceId = 0;
        const colorToProvinceId = new Map();
        for (const p of provinces) {
            const provinceId = Number(p.id) || 0;
            maxProvinceId = Math.max(maxProvinceId, provinceId);
            if (!/^#?[0-9a-f]{6}$/i.test(String(p.color_code || '').trim())) continue;
            const rgb = this.hexToRgb(p.color_code);
            colorToProvinceId.set((rgb.r << 16) | (rgb.g << 8) | rgb.b, provinceId);
        }

        let pixelMap = null;
        let territoryPixelCount = 0;
        const result = await this.scanImageByStrips(url, async (data, width, stripHeight, yStart, totalHeight) => {
            if (!pixelMap) pixelMap = this.createCompactIdArray(maxProvinceId, width * totalHeight);
            const stripPixels = width * stripHeight;
            const base = yStart * width;
            for (let p = 0; p < stripPixels; p++) {
                const i = p * 4;
                if (data[i + 3] === 0) continue;
                const key = (data[i] << 16) | (data[i + 1] << 8) | data[i + 2];
                const provinceId = colorToProvinceId.get(key) || 0;
                if (provinceId) {
                    pixelMap[base + p] = provinceId;
                    territoryPixelCount++;
                }
            }
        }, options);

        if (!result) {
            console.warn('地方マップ画像の読み込みに失敗しました！');
            this.provincePixelMap = null;
            return;
        }
        // 城色画像と国画像は同寸。万一先にサイズが分からなかった場合だけ、正しい長さへ作り直します。
        const requiredLength = result.width * result.height;
        if (!pixelMap || pixelMap.length !== requiredLength) {
            const rebuilt = this.createCompactIdArray(maxProvinceId, requiredLength);
            if (pixelMap) rebuilt.set(pixelMap.subarray(0, Math.min(pixelMap.length, rebuilt.length)));
            pixelMap = rebuilt;
        }
        this.provincePixelMap = pixelMap;
        this.provincePixelCount = territoryPixelCount;
        if (!this.mapImageWidth) this.mapImageWidth = result.width;
        if (!this.mapImageHeight) this.mapImageHeight = result.height;
    }

    // 国IDマップと城の種点から、各国の全ピクセルを最寄りの城へ割り当てます。
    // r83までの巨大BFSキュー（地図全画素分のInt32Array）は使わず、常駐は国ID＋城IDの2本だけです。
    static async buildCastleTerritoryMap(castles, provinces = [], options = {}) {
        const width = Number(this.mapImageWidth) || 0;
        const height = Number(this.mapImageHeight) || 0;
        const provinceMap = this.provincePixelMap;
        if (!width || !height || !provinceMap || provinceMap.length !== width * height) {
            this.castlePixelMap = null;
            this.castlePixelBounds = null;
            this.castlePixelCenters = null;
            return;
        }

        let maxCastleId = 0;
        let maxProvinceId = 0;
        for (const c of castles) maxCastleId = Math.max(maxCastleId, Number(c.id) || 0);
        for (const p of provinces) maxProvinceId = Math.max(maxProvinceId, Number(p.id) || 0);
        const candidatesByProvince = Array.from({ length: maxProvinceId + 1 }, () => []);
        for (const c of castles) {
            const pid = Number(c.provinceId) || 0;
            const x = Math.floor(Number(c.pixelX));
            const y = Math.floor(Number(c.pixelY));
            if (!pid || !Number.isFinite(x) || !Number.isFinite(y)) continue;
            candidatesByProvince[pid].push({ id: Number(c.id) || 0, x, y });
        }

        const output = this.createCompactIdArray(maxCastleId, width * height);
        // 戦闘点滅などが毎回地図全766万pixelを走査しなくて済むよう、
        // 城領域の外接矩形も領域構築と同時に作ります。常駐量は252城ぶんだけです。
        const boundsByCastleId = Array.from({ length: maxCastleId + 1 }, () => null);
        // カメラと領域エフェクトの視覚中心を一致させるため、領域構築と同時に
        // 各城領域の重心も集計します。252城ぶんの数値だけなので常駐メモリはごく小さいです。
        const centerStatsByCastleId = Array.from({ length: maxCastleId + 1 }, () => null);
        const includeInBounds = (castleId, x, y) => {
            const id = Number(castleId) || 0;
            if (!id) return;
            let b = boundsByCastleId[id];
            if (!b) {
                boundsByCastleId[id] = { minX: x, maxX: x, minY: y, maxY: y };
            } else {
                if (x < b.minX) b.minX = x;
                if (x > b.maxX) b.maxX = x;
                if (y < b.minY) b.minY = y;
                if (y > b.maxY) b.maxY = y;
            }
            let stat = centerStatsByCastleId[id];
            if (!stat) {
                stat = centerStatsByCastleId[id] = { sumX: 0, sumY: 0, count: 0 };
            }
            stat.sumX += x;
            stat.sumY += y;
            stat.count++;
        };
        const onProgress = typeof options.onProgress === 'function' ? options.onProgress : null;
        const isPC = document.body && document.body.classList.contains('is-pc');

        // r83の8方向multi-source BFSを維持します。ただし旧版のように地図全766万pixel分の
        // Int32キューを確保せず、国領域として実在するpixel数（現行地図で約94万）だけを確保します。
        const territoryPixelCount = Math.max(1, Number(this.provincePixelCount) || provinceMap.reduce((n, id) => n + (id ? 1 : 0), 0));
        let queue = new Uint32Array(territoryPixelCount);
        let head = 0;
        let tail = 0;

        for (const c of castles) {
            const x = Math.floor(Number(c.pixelX));
            const y = Math.floor(Number(c.pixelY));
            if (!Number.isFinite(x) || !Number.isFinite(y) || x < 0 || x >= width || y < 0 || y >= height) continue;
            const idx = y * width + x;
            if (provinceMap[idx] !== Number(c.provinceId)) continue;
            if (output[idx] === 0) {
                if (tail < queue.length) queue[tail++] = idx;
                output[idx] = Number(c.id) || 0;
                includeInBounds(output[idx], x, y);
            }
        }

        const dx = [0, 1, 0, -1, 1, 1, -1, -1];
        const dy = [-1, 0, 1, 0, -1, 1, 1, -1];
        const yieldEvery = isPC ? 262144 : 65536;
        let nextYield = yieldEvery;
        while (head < tail) {
            const currIdx = queue[head++];
            const x = currIdx % width;
            const y = Math.floor(currIdx / width);
            const castleId = output[currIdx];
            const provinceId = provinceMap[currIdx];
            for (let d = 0; d < 8; d++) {
                const nx = x + dx[d];
                const ny = y + dy[d];
                if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue;
                const nIdx = ny * width + nx;
                if (output[nIdx] !== 0 || provinceMap[nIdx] !== provinceId) continue;
                output[nIdx] = castleId;
                includeInBounds(castleId, nx, ny);
                if (tail < queue.length) queue[tail++] = nIdx;
            }
            if (head >= nextYield) {
                if (onProgress) onProgress(Math.min(0.9, (head / territoryPixelCount) * 0.9));
                nextYield += yieldEvery;
                await this.yieldToBrowser();
            }
        }

        // 種点のない飛び地など、BFSで到達できなかった部分だけ同じ国の最寄り城へ割り当てます。
        const rowsPerChunk = isPC ? 128 : 24;
        for (let yStart = 0; yStart < height; yStart += rowsPerChunk) {
            const yEnd = Math.min(height, yStart + rowsPerChunk);
            for (let y = yStart; y < yEnd; y++) {
                let idx = y * width;
                for (let x = 0; x < width; x++, idx++) {
                    if (!provinceMap[idx] || output[idx]) continue;
                    const candidates = candidatesByProvince[provinceMap[idx]];
                    if (!candidates || candidates.length === 0) continue;
                    let bestId = candidates[0].id;
                    let bestDist = Infinity;
                    for (let cIndex = 0; cIndex < candidates.length; cIndex++) {
                        const c = candidates[cIndex];
                        const dist = (x - c.x) * (x - c.x) + (y - c.y) * (y - c.y);
                        if (dist < bestDist) {
                            bestDist = dist;
                            bestId = c.id;
                        }
                    }
                    output[idx] = bestId;
                    includeInBounds(bestId, x, y);
                }
            }
            if (onProgress) onProgress(0.9 + (yEnd / height) * 0.1);
            await this.yieldToBrowser();
        }

        // 一時BFSキューはここで参照を切り、ゲーム中は国ID＋城IDの2本だけを保持します。
        queue = null;
        const centersByCastleId = centerStatsByCastleId.map((stat, id) => {
            if (stat && stat.count > 0) {
                return { x: stat.sumX / stat.count, y: stat.sumY / stat.count };
            }
            const b = boundsByCastleId[id];
            return b ? { x: (b.minX + b.maxX) / 2, y: (b.minY + b.maxY) / 2 } : null;
        });
        this.castlePixelMap = output;
        this.castlePixelBounds = boundsByCastleId;
        this.castlePixelCenters = centersByCastleId;
    }



}

// Classic script間の互換窓口。既存コードの SCENARIOS / DataManager 参照はそのまま使えます。
window.ScenarioDefinitions = SCENARIOS;
window.DataManager = DataManager;
