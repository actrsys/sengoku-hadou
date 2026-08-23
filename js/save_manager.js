/**
 * save_manager.js
 * セーブ／ロード、保存データの構築・復元、IndexedDB を専門管理します。
 * GameManager は公開APIの互換窓口だけを持ち、実処理はこの部署へ委譲します。
 */

class SaveManager {
    constructor(game) {
        this.game = game;
    }

    showSaveGuard() {
        let el = document.getElementById('save-guard');
        if (!el) {
            el = document.createElement('div');
            el.id = 'save-guard';
            el.className = 'save-guard hidden';

            const message = document.createElement('div');
            message.className = 'save-guard-message';
            message.textContent = '保存中...';
            el.appendChild(message);
            document.body.appendChild(el);
        }
        el.classList.remove('hidden');
    }

    hideSaveGuard() {
        const el = document.getElementById('save-guard');
        if (el) {
            el.classList.add('hidden');
        }
    }

    // どんな方法でセーブする時も、この魔法で「今のゲームの全データ」をひとまとめにします
    async _createSaveDataObj(options = {}) {
        let scenarioIndex = SCENARIOS.findIndex(s => s.folder === this.game.scenarioFolder);
        let scenarioName = "不明なシナリオ";
        let scenarioNo = "";
        if (scenarioIndex !== -1) {
            scenarioName = SCENARIOS[scenarioIndex].name;
            scenarioNo = `シナリオ${scenarioIndex + 1}`;
        } else if (this.game.scenarioName) {
            scenarioName = this.game.scenarioName;
            scenarioNo = this.game.scenarioNo;
        }
        const now = new Date();
        const saveTime = `${now.getFullYear()}/${String(now.getMonth() + 1).padStart(2, '0')}/${String(now.getDate()).padStart(2, '0')} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

        // ★安定化：オートセーブ時は勢力図サムネイルを作らない選択ができます。
        // フルサイズCanvas→縮小Canvasの同時生成は、低メモリ端末では大きな瞬間負荷になります。
        const includeThumbnail = options.includeThumbnail !== false;
        const mapThumbnail = includeThumbnail ? await this.generateSaveMapImage() : null;

        return { 
            year: this.game.year, 
            month: this.game.month, 
            gameStartYear: this.game.gameStartYear || window.MainParams.StartYear,
            gameStartMonth: this.game.gameStartMonth || window.MainParams.StartMonth,
            scenarioFolder: this.game.scenarioFolder,
            scenarioName: scenarioName,
            scenarioNo: scenarioNo,
            saveTime: saveTime,
            saveTimestamp: now.getTime(),
            mapThumbnail: mapThumbnail, // ★追加：撮った写真も一緒に保存します
            castles: this.game.castles,
            bushos: this.game.bushos,
            clans: this.game.clans,
            princesses: this.game.princesses,
            provinces: this.game.provinces,
            legions: this.game.legions,
            playerClanId: this.game.playerClanId,
            kunishus: this.game.kunishuSystem.kunishus,
            mapWidth: this.game.mapWidth,
            mapHeight: this.game.mapHeight,
            aiOperations: this.game.aiOperationManager.save(),
            turnQueueIds: this.game.turnQueue.map(c => c.id),
            currentIndex: this.game.currentIndex,
            flags: this.game.flags || {}
        };
    }
    
    // ==========================================
    // ★追加：セーブデータ用の勢力図画像を生成する魔法（修正版）
    // ==========================================
    async generateSaveMapImage() {
        return new Promise(async (resolve) => {
            const w = this.game.mapWidth || 1200;
            const h = this.game.mapHeight || 800;

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
        if (this.game.ui) this.game.ui.updateLoadingProgress(5, 'セーブデータを復元しています');
        // --- お掃除作業 ---
        this.game.isProcessingAI = false; 
        this.game.isWatchMode = false; 
        this.game.originalPlayerClanId = null; 
        // ロードした直後は無意味なオートセーブが走らないよう、すでに「セーブ済み」の印をつけておきます！
        this.game.hasAutoSavedThisMonth = true;
        if (this.game.aiTimer) { clearTimeout(this.game.aiTimer); this.game.aiTimer = null; }
        this.game.selectionMode = null;
        this.game.validTargets = [];
        this.game.lastMenuState = null;
        if (this.game.warManager && this.game.warManager.state) this.game.warManager.state.active = false;
        if (this.game.ui) {
            this.game.ui.logHistory = [];
            this.game.ui.clearWarLog();
            if (typeof this.game.ui.clearCommandMenu === 'function') this.game.ui.clearCommandMenu();
        }
        this.game.eventManager = new EventManager(this.game);
        if (this.game.gunshiSystem) this.game.gunshiSystem.onStartMonth();
        
        // --- 復元作業 ---
        this.game.flags = d.flags || {};
        this.game.year = d.year;
        this.game.month = d.month;
        this.game.gameStartYear = d.gameStartYear || window.MainParams.StartYear;
        this.game.gameStartMonth = d.gameStartMonth || window.MainParams.StartMonth;
        this.game.playerClanId = d.playerClanId || 1;
        
        this.game.scenarioFolder = d.scenarioFolder || "";
        this.game.scenarioName = d.scenarioName || "不明なシナリオ";
        this.game.scenarioNo = d.scenarioNo || "";
        
        this.game.mapWidth = d.mapWidth;
        this.game.mapHeight = d.mapHeight;
        this.game.aiOperationManager.load(d.aiOperations);

        // ロード時も巨大画像を同時decodeしません。基本地図だけを先に確認し、
        // 城色・国色マップは後でDataManagerが1枚ずつ解析します。
        if (this.game.ui) this.game.ui.updateLoadingProgress(12, '地図の大きさを確認しています');
        await new Promise(resolve => {
            const img = new Image();
            img.decoding = 'async';
            img.onload = () => {
                this.game.mapWidth = img.naturalWidth || img.width || this.game.mapWidth || 1200;
                this.game.mapHeight = img.naturalHeight || img.height || this.game.mapHeight || 800;
                resolve();
            };
            img.onerror = () => resolve();
            img.src = './data/images/map/japan_map.png';
        });
        if (this.game.ui && typeof this.game.ui.waitForNextPaint === 'function') await this.game.ui.waitForNextPaint();

        this.game.castles = d.castles.map(c => new Castle(c)); 
        this.game.bushos = d.bushos.map(b => new Busho(b));
        
        // ★ここから追加：セーブデータを読み込んだ後に、最新の武将データ(CSV)から「適性・技能・能力値・性格」だけを上書き（同期）する魔法です！
        try {
            // 今プレイしているシナリオのフォルダを探します
            const path = `./data/scenarios/${this.game.scenarioFolder}/`;
            // 最新の武将ファイル（warriors.bin または warriors.csv）を読み込みます
            const bushosText = await DataManager.fetchCompressed(path + "warriors.bin").catch(() => DataManager.fetchText(path + "warriors.csv"));
            // 読み込んだ文字を、武将のリストに翻訳します
            const latestBushos = DataManager.parseCSV(bushosText, Busho);
            
            // 最新の武将リストを「出席番号（ID）」でパッと探せるように、早見表を作ります
            const latestBushoMap = new Map();
            latestBushos.forEach(b => latestBushoMap.set(b.id, b));
            
            // セーブデータから復元した自分の武将たちを1人ずつチェックします
            this.game.bushos.forEach(savedBusho => {
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

        this.game.princesses = (d.princesses || []).map(p => new Princess(p));
        this.game.provinces = (d.provinces || []).map(p => new Province(p));
        this.game.legions = (d.legions || []).map(l => new Legion({ ...l, establishedTurnId: l.establishedTurnId || this.game.getCurrentTurnId() }));

        // 保存データには巨大なpixel mapを入れず、ロード時に種点→国ID→領土IDの順で低メモリ再生成します。
        if (this.game.ui) this.game.ui.updateLoadingProgress(35, '城の位置を解析しています');
        await DataManager.loadCastleSeedPoints('./data/images/map/japan_colorcode_map.png', this.game.castles, {
            onProgress: ratio => this.game.ui && this.game.ui.updateLoadingProgress(35 + ratio * 10, '城の位置を解析しています')
        });
        await DataManager.loadProvinceMap('./data/images/map/japan_provinces.png', this.game.provinces, {
            onProgress: ratio => this.game.ui && this.game.ui.updateLoadingProgress(47 + ratio * 14, '国境データを解析しています')
        });
        await DataManager.buildCastleTerritoryMap(this.game.castles, this.game.provinces, {
            onProgress: ratio => this.game.ui && this.game.ui.updateLoadingProgress(62 + ratio * 18, '勢力領域を準備しています')
        });
        if (this.game.ui && typeof this.game.ui.waitForNextPaint === 'function') await this.game.ui.waitForNextPaint();
        
        FamilyLinker.rebuildAllFamilyIds(this.game.bushos, this.game.princesses);

        this.game.legions.forEach(legion => {
            const commander = this.game.bushos.find(b => b.id === legion.commanderId);
            if (commander) commander.isCommander = true;
        });

        if (d.kunishus) {
            this.game.kunishuSystem.setKunishuData(d.kunishus.map(k => new Kunishu(k)));
        } else {
            this.game.kunishuSystem.setKunishuData([]);
        }

        if (d.clans) {
            this.game.clans = d.clans.map(c => new Clan(c));
        } else {
            const scenario = SCENARIOS[0]; 
            const data = await DataManager.loadAll(scenario.folder);
            this.game.clans = data.clans;
        }
        
        const courtRanksText = await DataManager.fetchText("./data/imperialCourtRank.csv").catch(() => "");
        const courtRanks = courtRanksText ? DataManager.parseCSV(courtRanksText, CourtRank) : [];
        this.game.courtRankSystem.setRankData(courtRanks);

        document.getElementById('title-screen').classList.add('hidden');
        document.getElementById('app').classList.remove('hidden'); 
        
        this.game.phase = 'game';
        
        if (d.turnQueueIds && d.turnQueueIds.length > 0) {
            this.game.turnQueue = d.turnQueueIds.map(id => this.game.castles.find(c => c.id === id)).filter(c => c !== undefined);
            this.game.currentIndex = d.currentIndex || 0;
        } else {
            this.game.turnQueue = [...this.game.castles].sort(() => Math.random() - 0.5);
            this.game.currentIndex = 0;
        }
        
        if (typeof SkillManager !== 'undefined') {
            SkillManager.validateBushoSkills(this.game.bushos, this.game.scenarioFolder || 'save-data');
        }

        this.game.updateAllCastlesLords();
        this.game.lifeSystem.updateAllBushosAge();

        // セーブ時に歴史常駐効果が有効でも、現在のユーザー設定が歴史イベントOFFなら
        // ロード直後に解除して「設定OFFなのに効果だけ残る」状態を作らない。
        if (window.UserSettings && window.UserSettings.historicalEvent === false
            && this.game.eventManager && typeof this.game.eventManager.onHistoricalEventSettingChanged === 'function') {
            await this.game.eventManager.onHistoricalEventSettingChanged(false);
        }

        this.game.updateClanDisplayNames();

        if (this.game.ui) this.game.ui.updateLoadingProgress(90, '地図を描画しています');
        this.game.ui.hasInitializedMap = false;
        this.game.ui.pixelCastleMap = null;
        this.game.ui.pixelProvinceMap = null;
        this.game.ui.lastClanColorsHash = null;
        this.game.ui.renderMap();
        if (this.game.ui) this.game.ui.updateLoadingProgress(100, '準備完了');
        if (this.game.ui && typeof this.game.ui.waitForNextPaint === 'function') await this.game.ui.waitForNextPaint();

        if (window.AudioManager) {
            window.AudioManager.playBGM('SC_ex_Town2_Fortress.ogg');
        }

        // ★追加：画面の準備が整ったので、ここでロード画面を隠します
        if (this.game.ui) this.game.ui.hideLoadingScreen();

        await this.game.ui.showCutin(`ロード完了: ${this.game.year}年 ${this.game.month}月`);
        this.game.processTurn();
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
            a.download = `sengoku_save_${this.game.year}_${this.game.month}.sav`; // ★拡張子を.savに変更します
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
                if (this.game.ui) {
                    this.game.ui.showDialog("セーブデータの読み込みに失敗しました。", false);
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
            this.game.hasSaveData = true; // ★追加：セーブしたので「データあり」の印をつけます
            
            // ★追加：もしメニューが開いていたら、ロードボタンを押せるように画面を更新します
            if (this.game.ui && typeof this.game.ui.renderCommandMenu === 'function') {
                this.game.ui.renderCommandMenu();
            }

            if (this.game.ui) this.game.ui.showDialog(`スロット ${slotNo} にセーブが完了しました。`, false);
        } catch (e) {
            console.error("セーブエラーの詳細:", e);
            if (this.game.ui) {
                this.game.ui.showDialog("セーブに失敗しました。エラー原因: " + e.message, false);
            }
        } finally {
            this.hideSaveGuard(); // ★追加：保存が終わったらバリアを解除します
        }
    }

    // スロットからロード (IndexedDB)
    async loadGameFromLocal(slotNo = 1, prefix = "sengoku_save_slot") { 
        // ★追加：ロードが始まった瞬間にロード画面で蓋をします！
        if (this.game.ui) this.game.ui.showLoadingScreen();

        let rawData = null;
        try {
            rawData = await loadFromDB(prefix + slotNo);
        } catch (e) {
            console.error("ロードエラー:", e);
        }

        if (!rawData) {
            if (this.game.ui) {
                this.game.ui.hideLoadingScreen(); // ★エラーで止まる時は蓋を開けます
                this.game.ui.showDialog(`スロット ${slotNo} にはセーブデータがありません。`, false);
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
            if (this.game.ui) {
                this.game.ui.hideLoadingScreen(); // ★エラーの時も蓋を開けます
                this.game.ui.showDialog("セーブデータの読み込みに失敗しました。", false);
            }
        }
    }

    // ★追加：オートセーブを実行する魔法
    async executeAutoSave() {
        // ★安定化：何らかの経路で二重呼び出しされても、同時に2本走らせません。
        if (this.game._autoSaveInProgress) return;
        this.game._autoSaveInProgress = true;
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
            this.game._autoSaveInProgress = false;
            this.hideSaveGuard();
        }
    }

    /**
     * IndexedDBから取得した保存値を、旧形式/暗号化形式を吸収してゲームデータへ戻します。
     * UIは暗号化方式を知らず、この窓口から復号済みデータを受け取ります。
     */
    decodeStoredData(rawData) {
        if (!rawData) return null;
        if (rawData instanceof Uint8Array) {
            try {
                return this._decryptData(rawData);
            } catch (error) {
                console.warn('セーブデータの復号に失敗しました:', error);
                return null;
            }
        }
        return rawData;
    }

    getSaveTimestamp(data) {
        if (!data) return 0;
        return data.saveTimestamp || (data.saveTime ? new Date(data.saveTime).getTime() : 0);
    }

    /**
     * セーブスロット表示用の復号済みデータを一括取得します。
     * 表示順やラベルはView側、保存形式/DBアクセスはSaveManager側が担当します。
     */
    async readSaveSlots(prefix, count = 5) {
        const rows = await Promise.all(
            Array.from({ length: count }, (_, index) => {
                const slotNo = index + 1;
                return loadFromDB(prefix + slotNo)
                    .then(rawData => ({ slotNo, rawData }))
                    .catch(() => ({ slotNo, rawData: null }));
            })
        );

        return rows.map(({ slotNo, rawData }) => {
            const data = this.decodeStoredData(rawData);
            return {
                originalSlotNo: slotNo,
                data,
                saveTimestamp: this.getSaveTimestamp(data),
                hasData: !!(data && data.year)
            };
        });
    }

    // ★追加：最新のセーブデータを自動で見つけて読み込む魔法 (続きから)
    async continueGame() {
        // ★追加：探している間に操作されないようにロード画面で蓋をします！
        if (this.game.ui) this.game.ui.showLoadingScreen();

        let latestSlot = -1;
        let latestTime = 0;
        let latestPrefix = "";

        // 手動セーブとオートセーブ、両方のお部屋を探しに行きます
        const prefixes = ["sengoku_save_slot", "sengoku_autosave_slot"];

        for (const prefix of prefixes) {
            const slots = await this.readSaveSlots(prefix);
            for (const slot of slots) {
                if (!slot.data) continue;
                const time = slot.saveTimestamp;
                if (time > latestTime) {
                    latestTime = time;
                    latestSlot = slot.originalSlotNo;
                    latestPrefix = prefix;
                } else if (latestSlot === -1) {
                    // 時間が記録されていなければ、とりあえず見つけたスロットをメモします
                    latestSlot = slot.originalSlotNo;
                    latestPrefix = prefix;
                }
            }
        }

        // 一番新しいデータが見つかったら、それを読み込みます！
        if (latestSlot !== -1) {
            this.loadGameFromLocal(latestSlot, latestPrefix);
        } else {
            if (this.game.ui) {
                this.game.ui.hideLoadingScreen(); // ★データがなくてやめる時は蓋を開けます
                this.game.ui.showDialog("セーブデータが見つかりません。", false);
            }
        }
    }
}

window.SaveManager = SaveManager;

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