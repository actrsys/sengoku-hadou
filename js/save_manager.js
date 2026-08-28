/**
 * save_manager.js
 * セーブ／ロード、保存データの構築・復元、IndexedDB を専門管理します。
 * GameManager は公開APIの互換窓口だけを持ち、実処理はこの部署へ委譲します。
 */

const SAVE_SCHEMA_VERSION = 2;

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

    // baseFamilyIds / familyIds は親子・養子・婚姻から再構築できる派生キャッシュなので保存しません。
    // 4,000人超の配列重複をセーブへ持ち込まず、JSON化・IndexedDB structured clone時の容量と一時メモリを抑えます。
    _serializePersonForSave(person) {
        const result = {};
        Object.keys(person || {}).forEach(key => {
            if (key === 'baseFamilyIds' || key === 'familyIds' || key === 'isCommander') return;
            result[key] = person[key];
        });
        return result;
    }

    // ゲーム本体を書き換える前に、復元へ進んでよいセーブかを軽量検査する。
    // ここでは保存構造と主要ID参照だけを見る。画像decode等の実行時失敗は復元側の安全復旧で扱う。
    _validateSaveDataStructure(data) {
        const fail = message => { throw new Error(`セーブデータ検証エラー: ${message}`); };
        if (!data || typeof data !== 'object' || Array.isArray(data)) fail('ルートがオブジェクトではありません');
        if (Number(data.saveSchemaVersion) !== SAVE_SCHEMA_VERSION) {
            fail(`非対応のセーブ形式です (schema=${data.saveSchemaVersion ?? 'none'})`);
        }

        const gameStartYear = Number(data.gameStartYear);
        const gameStartMonth = Number(data.gameStartMonth);
        if (!Number.isInteger(gameStartYear) || gameStartYear < 1) fail('gameStartYear が不正です');
        if (!Number.isInteger(gameStartMonth) || gameStartMonth < 1 || gameStartMonth > 12) fail('gameStartMonth が不正です');
        if (typeof data.scenarioName !== 'string' || !data.scenarioName.trim()) fail('scenarioName がありません');
        if (typeof data.scenarioNo !== 'string') fail('scenarioNo が不正です');
        if (!Number.isFinite(Number(data.saveTimestamp)) || Number(data.saveTimestamp) <= 0) fail('saveTimestamp が不正です');
        if (typeof data.saveTime !== 'string' || !data.saveTime.trim()) fail('saveTime がありません');

        if (typeof data.scenarioFolder !== 'string' || !data.scenarioFolder.trim()) fail('scenarioFolder がありません');
        const scenarioFolder = data.scenarioFolder;
        if (typeof SCENARIOS !== 'undefined' && Array.isArray(SCENARIOS)
            && !SCENARIOS.some(s => s && s.folder === scenarioFolder)) {
            fail(`未登録のシナリオです (${scenarioFolder})`);
        }

        const year = Number(data.year);
        const month = Number(data.month);
        if (!Number.isInteger(year) || year < 1) fail('year が不正です');
        if (!Number.isInteger(month) || month < 1 || month > 12) fail('month が不正です');

        const requiredArrays = ['castles', 'bushos', 'clans', 'princesses', 'provinces', 'legions', 'kunishus', 'turnQueueIds', 'historyEntries'];
        requiredArrays.forEach(key => {
            if (!Array.isArray(data[key])) fail(`${key} が配列ではありません`);
        });
        if (data.castles.length === 0) fail('castles が空です');
        if (data.bushos.length === 0) fail('bushos が空です');
        if (data.clans.length === 0) fail('clans が空です');

        const collectIds = (rows, label) => {
            const ids = new Set();
            rows.forEach((row, index) => {
                if (!row || typeof row !== 'object' || Array.isArray(row)) fail(`${label}[${index}] が不正です`);
                const id = Number(row.id);
                if (!Number.isInteger(id) || id <= 0) fail(`${label}[${index}].id が不正です`);
                if (ids.has(id)) fail(`${label} のID ${id} が重複しています`);
                ids.add(id);
            });
            return ids;
        };

        const castleIds = collectIds(data.castles, 'castles');
        const bushoIds = collectIds(data.bushos, 'bushos');
        const clanIds = collectIds(data.clans, 'clans');
        collectIds(data.princesses, 'princesses');
        collectIds(data.provinces, 'provinces');
        collectIds(data.legions, 'legions');
        collectIds(data.kunishus, 'kunishus');

        data.bushos.forEach((busho, index) => {
            if (!Array.isArray(busho.nemesisList)) fail(`bushos[${index}].nemesisList が現行形式ではありません`);
        });
        data.princesses.forEach((princess, index) => {
            if (typeof princess.isDiplomaticMarriageActive !== 'boolean') {
                fail(`princesses[${index}].isDiplomaticMarriageActive が現行形式ではありません`);
            }
            const originalClanId = Number(princess.originalClanId || 0);
            const currentClanId = Number(princess.currentClanId || 0);
            const husbandId = Number(princess.husbandId || 0);
            if (originalClanId !== 0 && !clanIds.has(originalClanId)) fail(`princesses[${index}].originalClanId の参照先がありません`);
            if (currentClanId !== 0 && !clanIds.has(currentClanId)) fail(`princesses[${index}].currentClanId の参照先がありません`);
            if (husbandId !== 0 && !bushoIds.has(husbandId)) fail(`princesses[${index}].husbandId の参照先がありません`);
        });
        const bushoById = new Map(data.bushos.map(b => [Number(b.id), b]));
        const legionSeatKeys = new Set();
        const legionCommanderIds = new Set();
        data.legions.forEach((legion, index) => {
            if (!Object.prototype.hasOwnProperty.call(legion, 'establishedTurnId')
                || !Number.isFinite(Number(legion.establishedTurnId))) {
                fail(`legions[${index}].establishedTurnId が現行形式ではありません`);
            }
            const clanId = Number(legion.clanId || 0);
            const legionNo = Number(legion.legionNo || 0);
            const commanderId = Number(legion.commanderId || 0);
            if (clanId === 0 || !clanIds.has(clanId)) fail(`legions[${index}].clanId の参照先がありません`);
            if (!Number.isInteger(legionNo) || legionNo < 1 || legionNo > 8) fail(`legions[${index}].legionNo が不正です`);
            const seatKey = `${clanId}:${legionNo}`;
            if (legionSeatKeys.has(seatKey)) fail(`legions の軍団席 ${seatKey} が重複しています`);
            legionSeatKeys.add(seatKey);
            if (commanderId !== 0) {
                if (!bushoIds.has(commanderId)) fail(`legions[${index}].commanderId の参照先がありません`);
                if (legionCommanderIds.has(commanderId)) fail(`legions の国主 ${commanderId} が重複しています`);
                legionCommanderIds.add(commanderId);
                const commander = bushoById.get(commanderId);
                if (Number(commander?.clan || 0) !== clanId) fail(`legions[${index}].commanderId の所属勢力が一致しません`);
            }
        });
        data.kunishus.forEach((kunishu, index) => {
            if (typeof kunishu.networkTag !== 'string') fail(`kunishus[${index}].networkTag が現行形式ではありません`);
            const castleId = Number(kunishu.castleId || 0);
            const leaderId = Number(kunishu.leaderId || 0);
            if (castleId === 0 || !castleIds.has(castleId)) fail(`kunishus[${index}].castleId の参照先がありません`);
            if (leaderId !== 0 && !bushoIds.has(leaderId)) fail(`kunishus[${index}].leaderId の参照先がありません`);
        });
        data.historyEntries.forEach((entry, index) => {
            if (!entry || typeof entry !== 'object' || Array.isArray(entry)) fail(`historyEntries[${index}] が現行形式ではありません`);
            if (typeof entry.text !== 'string' || !Array.isArray(entry.clanIds) || typeof entry.category !== 'string') {
                fail(`historyEntries[${index}] が現行形式ではありません`);
            }
        });

        data.castles.forEach((castle, index) => {
            const ownerClan = Number(castle.ownerClan || 0);
            if (ownerClan !== 0 && !clanIds.has(ownerClan)) fail(`castles[${index}].ownerClan の参照先がありません`);
            const castellanId = Number(castle.castellanId || 0);
            if (castellanId !== 0 && !bushoIds.has(castellanId)) fail(`castles[${index}].castellanId の参照先がありません`);
            if (!Array.isArray(castle.samuraiIds)) fail(`castles[${index}].samuraiIds が現行形式ではありません`);
            const seenSamuraiIds = new Set();
            castle.samuraiIds.forEach((rawId, samuraiIndex) => {
                const id = Number(rawId);
                if (!Number.isInteger(id) || !bushoIds.has(id)) fail(`castles[${index}].samuraiIds[${samuraiIndex}] の参照先がありません`);
                if (seenSamuraiIds.has(id)) fail(`castles[${index}].samuraiIds の武将ID ${id} が重複しています`);
                seenSamuraiIds.add(id);
            });
        });

        data.bushos.forEach((busho, index) => {
            const clanId = Number(busho.clan || 0);
            if (clanId !== 0 && !clanIds.has(clanId)) fail(`bushos[${index}].clan の参照先がありません`);
            const castleId = Number(busho.castleId || 0);
            if (castleId !== 0 && !castleIds.has(castleId)) fail(`bushos[${index}].castleId の参照先がありません`);
        });
        // 在城名簿は武将の castleId と同じ人物を指す必要があります。
        // 死亡・未登場など名簿に載らない人物は許容し、名簿に書かれた側だけ整合性を検査します。
        data.castles.forEach((castle, castleIndex) => {
            castle.samuraiIds.forEach((rawId, samuraiIndex) => {
                const busho = bushoById.get(Number(rawId));
                if (busho && Number(busho.castleId || 0) !== Number(castle.id)) {
                    fail(`castles[${castleIndex}].samuraiIds[${samuraiIndex}] と武将castleIdが一致しません`);
                }
            });
        });

        data.clans.forEach((clan, index) => {
            const leaderId = Number(clan.leaderId || 0);
            if (leaderId !== 0 && !bushoIds.has(leaderId)) fail(`clans[${index}].leaderId の参照先がありません`);
        });

        const turnQueueSeen = new Set();
        data.turnQueueIds.forEach((rawId, index) => {
            const id = Number(rawId);
            if (!Number.isInteger(id) || !castleIds.has(id)) fail(`turnQueueIds[${index}] の城IDが不正です`);
            if (turnQueueSeen.has(id)) fail(`turnQueueIds の城ID ${id} が重複しています`);
            turnQueueSeen.add(id);
        });
        const playerClanId = Number(data.playerClanId);
        if (!Number.isInteger(playerClanId) || (playerClanId !== -100 && !clanIds.has(playerClanId))) {
            fail('playerClanId が不正です');
        }
        const currentIndex = Number(data.currentIndex);
        if (!Number.isInteger(currentIndex) || currentIndex < 0
            || (data.turnQueueIds.length > 0 && currentIndex >= data.turnQueueIds.length)) {
            fail('currentIndex が不正です');
        }

        const mapWidth = Number(data.mapWidth);
        const mapHeight = Number(data.mapHeight);
        if (!Number.isFinite(mapWidth) || mapWidth <= 0 || !Number.isFinite(mapHeight) || mapHeight <= 0) {
            fail('地図サイズが不正です');
        }
        if (!data.flags || typeof data.flags !== 'object' || Array.isArray(data.flags)) fail('flags が不正です');
        if (!data.aiOperations || typeof data.aiOperations !== 'object' || Array.isArray(data.aiOperations)) fail('aiOperations が不正です');
        ['operations', 'draftBases', 'grandObjectives', 'historyOwnedCastles'].forEach(key => {
            const value = data.aiOperations[key];
            if (!value || typeof value !== 'object' || Array.isArray(value)) fail(`aiOperations.${key} が不正です`);
        });

        return true;
    }

    async _recoverFromFailedRestore() {
        this.game.isRestoringSave = false;
        this.game.isProcessingAI = false;
        this.game.isWatchMode = false;
        this.game.originalPlayerClanId = null;
        this.game.selectionMode = null;
        this.game.validTargets = [];
        this.game.lastMenuState = null;
        // turnQueue は旧Castleオブジェクトを直接保持するため、新配列生成前に参照を切ります。
        this.game.turnQueue = [];
        this.game.currentIndex = 0;
        if (this.game.aiTimer) { clearTimeout(this.game.aiTimer); this.game.aiTimer = null; }
        if (this.game.warManager && this.game.warManager.state) this.game.warManager.state.active = false;
        if (this.game.ui) {
            if (typeof this.game.ui.resetMapViewState === 'function') this.game.ui.resetMapViewState();
            this.game.ui.hideLoadingScreen();
            if (typeof this.game.ui.forceResetModals === 'function') this.game.ui.forceResetModals();

            const message = "セーブデータの復元中に問題が発生したため、タイトルへ戻ります。";
            if (typeof this.game.ui.showDialogAsync === 'function') {
                await this.game.ui.showDialogAsync(message, false);
            } else if (typeof this.game.ui.showDialog === 'function') {
                await new Promise(resolve => this.game.ui.showDialog(message, false, resolve));
            }

            if (typeof this.game.ui.returnToTitle === 'function') {
                await this.game.ui.returnToTitle();
                return;
            }
        }
        this.game.phase = 'title';
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
            saveSchemaVersion: SAVE_SCHEMA_VERSION,
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
            bushos: this.game.bushos.map(b => this._serializePersonForSave(b)),
            clans: this.game.clans,
            princesses: this.game.princesses.map(p => this._serializePersonForSave(p)),
            provinces: this.game.provinces,
            legions: this.game.legions,
            playerClanId: this.game.playerClanId,
            kunishus: this.game.kunishuSystem.kunishus,
            mapWidth: this.game.mapWidth,
            mapHeight: this.game.mapHeight,
            aiOperations: this.game.aiOperationManager.save(),
            turnQueueIds: this.game.turnQueue.map(c => c.id),
            currentIndex: this.game.currentIndex,
            flags: this.game.flags || {},
            historyEntries: this.game.historySystem ? this.game.historySystem.serialize() : []
        };
    }
    
    // ==========================================
    // ★追加：セーブデータ用の勢力図画像を生成する魔法（修正版）
    // ==========================================
    async generateSaveMapImage() {
        const w = this.game.mapWidth || 1200;
        const h = this.game.mapHeight || 800;
        const scale = 0.25;
        const thumbW = Math.max(1, Math.round(w * scale));
        const thumbH = Math.max(1, Math.round(h * scale));

        // サムネイルのためだけに3140x2440の白地図とCanvasを確保しない。
        // 1/4サイズの専用画像へ、勢力色Canvasを直接縮小合成します。
        const loadImg = (src) => new Promise(res => {
            const img = new Image();
            img.decoding = 'async';
            img.onload = () => res(img);
            img.onerror = () => res(null);
            img.src = src;
        });
        const whiteMapImg = await loadImg('./data/images/map/japan_white_map_thumb.png');
        if (!whiteMapImg) return null;

        let thumbCanvas = null;
        try {
            thumbCanvas = document.createElement('canvas');
            thumbCanvas.width = thumbW;
            thumbCanvas.height = thumbH;
            const thumbCtx = thumbCanvas.getContext('2d');
            if (!thumbCtx) return null;

            thumbCtx.imageSmoothingEnabled = true;
            thumbCtx.imageSmoothingQuality = 'medium';
            thumbCtx.drawImage(whiteMapImg, 0, 0, thumbW, thumbH);

            const clanColorOverlay = document.getElementById('clan-color-overlay');
            if (clanColorOverlay && clanColorOverlay.width > 1 && clanColorOverlay.height > 1) {
                thumbCtx.drawImage(clanColorOverlay, 0, 0, thumbW, thumbH);
            }

            return thumbCanvas.toDataURL('image/jpeg', 0.6);
        } catch (e) {
            // 画像デコード・Canvas生成・drawImage・toDataURLのどこで失敗しても、
            // セーブ全体を待機状態にせずサムネイルなしで継続します。
            console.warn('セーブ用勢力図画像の生成をスキップしました:', e);
            return null;
        } finally {
            // 失敗経路を含め、低メモリ端末で画像/Canvas backing storeを保持しない。
            if (thumbCanvas) {
                try { thumbCanvas.width = 1; thumbCanvas.height = 1; } catch (ignore) {}
            }
            try { whiteMapImg.src = ''; } catch (ignore) {}
        }
    }
    
    // どんな方法でロードした時も、この魔法で「受け取ったデータ」をゲーム内に展開します
    async _restoreSaveDataObj(d) {
        this._validateSaveDataStructure(d);
        this.game.isRestoringSave = true;
        if (this.game.turnManager && typeof this.game.turnManager.abortForScenarioTransition === 'function') {
            this.game.turnManager.abortForScenarioTransition();
        }
        if (this.game.ui) this.game.ui.updateLoadingProgress(5, 'セーブデータを復元しています');
        if (this.game.warManager && typeof this.game.warManager.abortForScenarioTransition === 'function') {
            this.game.warManager.abortForScenarioTransition();
        }
        if (this.game.fieldWarManager && typeof this.game.fieldWarManager.abortForScenarioTransition === 'function') {
            this.game.fieldWarManager.abortForScenarioTransition();
        }
        // 前ゲームの巨大地図TypedArrayと各種ID索引を、新しい保存データ展開より先に解放します。
        // 低メモリ端末で旧データと新データが同時に保持される時間を短くします。
        if (typeof this.game.releaseScenarioMapResources === 'function') this.game.releaseScenarioMapResources();
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
        // turnQueue は旧Castleオブジェクトを直接保持するため、新配列生成前に参照を切ります。
        this.game.turnQueue = [];
        this.game.currentIndex = 0;
        if (this.game.warManager && this.game.warManager.state) this.game.warManager.state.active = false;
        if (this.game.ui) {
            if (this.game.historySystem) this.game.historySystem.clear();
            this.game.ui.clearWarLog();
            if (typeof this.game.ui.clearCommandMenu === 'function') this.game.ui.clearCommandMenu();
        }
        this.game.eventManager = new EventManager(this.game);
        if (this.game.gunshiSystem) this.game.gunshiSystem.onStartMonth();
        if (this.game.aiStaffing && typeof this.game.aiStaffing.resetCaches === 'function') {
            this.game.aiStaffing.resetCaches();
        }
        
        // --- 復元作業 ---
        this.game.flags = d.flags;
        this.game.year = d.year;
        this.game.month = d.month;
        this.game.gameStartYear = d.gameStartYear;
        this.game.gameStartMonth = d.gameStartMonth;
        this.game.playerClanId = d.playerClanId;
        if (this.game.historySystem) this.game.historySystem.load(d.historyEntries);
        
        this.game.scenarioFolder = d.scenarioFolder;
        this.game.scenarioName = d.scenarioName;
        this.game.scenarioNo = d.scenarioNo;
        
        this.game.mapWidth = d.mapWidth;
        this.game.mapHeight = d.mapHeight;
        this.game.aiOperationManager.load(d.aiOperations);

        // ロード時も巨大画像を同時decodeしません。基本地図だけを先に確認し、
        // 城色・国色マップは後でDataManagerが1枚ずつ解析します。
        if (this.game.ui) this.game.ui.updateLoadingProgress(12, '地図の大きさを確認しています');
        await new Promise(resolve => {
            const img = new Image();
            img.decoding = 'async';
            const finish = (loaded) => {
                if (loaded) {
                    this.game.mapWidth = img.naturalWidth || img.width || this.game.mapWidth || 1200;
                    this.game.mapHeight = img.naturalHeight || img.height || this.game.mapHeight || 800;
                }
                img.onload = null;
                img.onerror = null;
                // 寸法確認だけの一時Imageなので、次の巨大地図解析へ進む前にdecode資源を解放する。
                try { img.src = ''; } catch (e) {}
                resolve();
            };
            img.onload = () => finish(true);
            img.onerror = () => finish(false);
            img.src = './data/images/map/japan_map.png';
        });
        if (this.game.ui && typeof this.game.ui.waitForNextPaint === 'function') await this.game.ui.waitForNextPaint();

        this.game.castles = d.castles.map(c => new Castle(c)); 
        this.game.bushos = d.bushos.map(b => new Busho(b));
        
        this.game.princesses = d.princesses.map(p => new Princess(p));
        this.game.provinces = d.provinces.map(p => new Province(p));
        this.game.legions = d.legions.map(l => new Legion(l));

        // 保存データには巨大なpixel mapを入れず、ロード時に種点→国ID→領土IDの順で低メモリ再生成します。
        if (this.game.ui) this.game.ui.updateLoadingProgress(35, '拠点の位置を解析しています');
        await DataManager.loadCastleSeedPoints('./data/images/map/japan_colorcode_map.png', this.game.castles, {
            onProgress: ratio => this.game.ui && this.game.ui.updateLoadingProgress(35 + ratio * 10, '拠点の位置を解析しています')
        });
        await DataManager.loadProvinceMap('./data/images/map/japan_provinces.png', this.game.provinces, {
            onProgress: ratio => this.game.ui && this.game.ui.updateLoadingProgress(47 + ratio * 14, '国境データを解析しています')
        });
        await DataManager.buildCastleTerritoryMap(this.game.castles, this.game.provinces, {
            onProgress: ratio => this.game.ui && this.game.ui.updateLoadingProgress(62 + ratio * 18, '勢力領域を準備しています')
        });
        if (this.game.ui && typeof this.game.ui.waitForNextPaint === 'function') await this.game.ui.waitForNextPaint();
        
        FamilyLinker.rebuildAllFamilyIds(this.game.bushos, this.game.princesses);

        // isCommander は Legion.commanderId から導出する実行時キャッシュです。
        // 保存側の古いフラグを持ち越さず、現行の軍団モデルだけから再構築します。
        this.game.bushos.forEach(busho => { busho.isCommander = false; });
        this.game.legions.forEach(legion => {
            const commander = this.game.getBusho(legion.commanderId);
            if (commander) commander.isCommander = true;
        });
        // isCastellan も Castle.castellanId と対になる実行時キャッシュとして再構築します。
        // 保存済みフラグをそのまま城主選出へ使うと、壊れた二重城主状態を再現してしまうためです。
        this.game.bushos.forEach(busho => { busho.isCastellan = false; });
        this.game.castles.forEach(castle => {
            const castellan = this.game.getBusho(castle.castellanId);
            if (castellan
                && Number(castellan.castleId) === Number(castle.id)
                && Number(castellan.clan) === Number(castle.ownerClan)) {
                castellan.isCastellan = true;
            }
        });

        this.game.kunishuSystem.setKunishuData(d.kunishus.map(k => new Kunishu(k)));
        this.game.clans = d.clans.map(c => new Clan(c));
        
        const courtRanksText = await DataManager.fetchText("./data/imperialCourtRank.csv").catch(() => "");
        const courtRanks = courtRanksText ? DataManager.parseCSV(courtRanksText, CourtRank) : [];
        this.game.courtRankSystem.setRankData(courtRanks);

        document.getElementById('title-screen').classList.add('hidden');
        document.getElementById('app').classList.remove('hidden'); 
        
        this.game.phase = 'game';
        
        this.game.turnQueue = d.turnQueueIds.map(id => this.game.getCastle(id));
        this.game.currentIndex = d.currentIndex;
        
        if (typeof SkillManager !== 'undefined') {
            SkillManager.validateBushoSkills(this.game.bushos, this.game.scenarioFolder);
        }

        this.game.updateAllCastlesLords();
        this.game.isRestoringSave = false;
        this.game.lifeSystem.updateAllBushosAge();

        // セーブ時に歴史常駐効果が有効でも、現在のユーザー設定が歴史イベントOFFなら
        // ロード直後に解除して「設定OFFなのに効果だけ残る」状態を作らない。
        if (window.UserSettings && window.UserSettings.historicalEvent === false
            && this.game.eventManager && typeof this.game.eventManager.onHistoricalEventSettingChanged === 'function') {
            await this.game.eventManager.onHistoricalEventSettingChanged(false);
        }

        this.game.updateClanDisplayNames();

        if (this.game.ui) this.game.ui.updateLoadingProgress(90, '地図を読み込んでいます');
        if (this.game.ui && typeof this.game.ui.resetMapViewState === 'function') {
            this.game.ui.resetMapViewState({ initialZoomLevel: 1 });
        } else if (this.game.ui) {
            this.game.ui.currentCastle = null;
            this.game.ui.hasInitializedMap = false;
        }
        this.game.ui.pixelCastleMap = null;
        this.game.ui.pixelProvinceMap = null;
        this.game.ui.lastClanColorsHash = null;
        // セーブ復元時も、実際に表示するPC/スマホ用Imageのload/decode完了を待ってから描画する。
        // 以前の「寸法確認用の一時Image」が読み込み済みでも、表示用Imageは別なのでここで明示的に待つ。
        if (this.game.ui && typeof this.game.ui.prepareMapBaseImage === 'function') {
            await this.game.ui.prepareMapBaseImage(this.game.mapWidth, this.game.mapHeight);
        }
        if (this.game.ui) this.game.ui.updateLoadingProgress(96, '地図を描画しています');
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
        if (this.game.ui) this.game.ui.showLoadingScreen('セーブデータを確認しています', 0);
        
        const reader = new FileReader(); 
        reader.onload = async (evt) => {
            let restoreStarted = false;
            try { 
                const uint8 = new Uint8Array(evt.target.result); // ★バイナリデータとして受け取ります
                const d = this._decryptData(uint8); // ★復号化します
                this._validateSaveDataStructure(d); // ゲーム状態へ触る前に構造・主要参照を検査します
                restoreStarted = true;
                await this._restoreSaveDataObj(d);
            } catch(err) { 
                console.error(err); 
                if (restoreStarted) {
                    await this._recoverFromFailedRestore();
                    return;
                }
                if (this.game.ui) {
                    this.game.ui.hideLoadingScreen();
                    this.game.ui.showDialog("セーブデータの構造を確認できなかったため、読み込みを中止しました。", false);
                }
            } 
        }; 
        reader.onerror = () => {
            if (this.game.ui) {
                this.game.ui.hideLoadingScreen();
                this.game.ui.showDialog("セーブファイルを読み取れませんでした。", false);
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

            if (this.game.ui) this.game.ui.showDialog(`スロット${slotNo}にセーブが完了しました。`, false);
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
                this.game.ui.showDialog(`スロット${slotNo}にはセーブデータがありません。`, false);
            }
            return;
        }

        let restoreStarted = false;
        try {
            let d;
            if (rawData instanceof Uint8Array) {
                d = this._decryptData(rawData);
            } else {
                d = rawData;
            }
            this._validateSaveDataStructure(d); // ゲーム状態へ触る前に構造・主要参照を検査します
            restoreStarted = true;
            await this._restoreSaveDataObj(d);
        } catch(err) { 
            console.error(err); 
            if (restoreStarted) {
                await this._recoverFromFailedRestore();
                return;
            }
            if (this.game.ui) {
                this.game.ui.hideLoadingScreen();
                this.game.ui.showDialog("セーブデータの構造を確認できなかったため、読み込みを中止しました。", false);
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
            // SaveManagerは現在仕様として、手動のUint8Arrayと低メモリ用オートセーブのオブジェクトを両方扱います。
            const data = await this._createSaveDataObj({ includeThumbnail: false });
            await saveToDB("sengoku_autosave_slot" + autoSaveIndex, data);
            // オートセーブもロード可能データなので、システムメニューのロード可否へ即時反映します。
            this.game.hasSaveData = true;

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
     * IndexedDBから現在形式の保存値を復元します。
     * 手動セーブは暗号化Uint8Array、低メモリ向けオートセーブは構造化オブジェクトのため、
     * UIは保存媒体の違いを知らず、この窓口から共通のゲームデータを受け取ります。
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

    isCurrentSaveSchema(data) {
        return !!data && Number(data.saveSchemaVersion) === SAVE_SCHEMA_VERSION;
    }

    // タイトル・システム・ロード画面で共通利用する「実際に読み込めるセーブ」の正本判定。
    // 単にIndexedDBへ値が存在するだけでは有効とせず、現行schemaかつ復元前構造検査を通るものだけを対象にします。
    isLoadableSaveData(data) {
        if (!this.isCurrentSaveSchema(data)) return false;
        try {
            this._validateSaveDataStructure(data);
            return true;
        } catch (_) {
            return false;
        }
    }

    getSaveTimestamp(data) {
        if (!this.isCurrentSaveSchema(data)) return 0;
        return Number(data.saveTimestamp) || 0;
    }

    async hasAnyLoadableSaveData(prefixes = ['sengoku_save_slot', 'sengoku_autosave_slot']) {
        for (const prefix of prefixes) {
            const slots = await this.readSaveSlots(prefix);
            if (slots.some(slot => slot.hasData)) return true;
        }
        return false;
    }

    async refreshLoadAvailability() {
        const hasData = await this.hasAnyLoadableSaveData();
        this.game.hasSaveData = hasData;
        return hasData;
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
            const hasData = this.isLoadableSaveData(data);
            return {
                originalSlotNo: slotNo,
                data,
                saveTimestamp: hasData ? this.getSaveTimestamp(data) : 0,
                hasData
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
                if (!slot.hasData) continue;
                const time = slot.saveTimestamp;
                if (time > latestTime) {
                    latestTime = time;
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