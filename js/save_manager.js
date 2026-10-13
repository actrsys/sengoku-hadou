/**
 * save_manager.js
 * セーブ／ロード、保存データの構築・復元、IndexedDB を専門管理します。
 * GameManager は公開APIの互換窓口だけを持ち、実処理はこの部署へ委譲します。
 */

const SAVE_SCHEMA_VERSION = 2;

class SaveManager {
    constructor(game) {
        this.game = game;
        // ファイル保存・手動保存・オートセーブが重なっても、最後の保存が終わるまで入力を遮る。
        this._saveGuardCount = 0;
    }

    showSaveGuard() {
        this._saveGuardCount++;
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
        this._saveGuardCount = Math.max(0, this._saveGuardCount - 1);
        if (this._saveGuardCount !== 0) return;
        const el = document.getElementById('save-guard');
        if (el) {
            el.classList.add('hidden');
        }
    }

    // 同一スロットへの複数の保存要求を要求順に処理する。
    // save-guard は入力遮断だけを担い、非同期の書込順序までは保証しない。
    // スロット単位で待機するため、他スロットやファイル保存を不要に直列化しない。
    _withSerializedSlotSave(storageKey, work) {
        const tasks = this._slotSaveTasks || (this._slotSaveTasks = new Map());
        const previous = tasks.get(storageKey);
        const task = (async () => {
            if (previous) {
                try { await previous; } catch (_) { /* 前の保存が失敗しても後続は実行可能 */ }
            }
            return work();
        })();
        tasks.set(storageKey, task);
        const release = () => {
            if (tasks.get(storageKey) === task) tasks.delete(storageKey);
        };
        task.then(release, release);
        return task;
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
        if (typeof SCENARIOS !== 'undefined' && Array.isArray(SCENARIOS) && SCENARIOS.length > 0
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
            // 生家・嫁ぎ先は既に滅亡した大名家のIDも履歴として保持する。
            // data.clans はシナリオ時点で有効な勢力だけなので、所属先の現存を必須にしない。
            if (!Number.isInteger(originalClanId) || originalClanId < 0) fail(`princesses[${index}].originalClanId が不正です`);
            if (!Number.isInteger(currentClanId) || currentClanId < 0) fail(`princesses[${index}].currentClanId が不正です`);
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
            // 死亡・未登場武将の旧所属は、滅亡勢力であっても史料上の履歴として残す。
            // 活動中の武将だけ、現在有効な大名家を参照することを必須とする。
            const isHistorical = window.LifeStatusRules && window.LifeStatusRules.isUnavailable(busho);
            if (!Number.isInteger(clanId) || clanId < 0
                || (clanId !== 0 && !clanIds.has(clanId) && !isHistorical)) {
                fail(`bushos[${index}].clan の参照先がありません`);
            }
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

    _captureLoadRequestFlow() {
        const turnManager = this.game && this.game.turnManager;
        if (!turnManager || typeof turnManager.captureTurnFlowGeneration !== 'function'
            || typeof turnManager.isTurnFlowGenerationLatest !== 'function') return null;
        const generation = turnManager.captureTurnFlowGeneration();
        return {
            generation,
            isLatest: () => turnManager.isTurnFlowGenerationLatest(generation)
        };
    }

    // 保存要求は発行時のターン世代とシナリオに属する。
    // 手動・自動で同じ判定を使い、画面遷移後に旧保存が新ゲームを更新しないようにする。
    _captureSaveRequestCurrent() {
        const flow = this._captureLoadRequestFlow();
        const scenarioFolder = this.game.scenarioFolder;
        return () => (!flow || flow.isLatest()) && this.game.scenarioFolder === scenarioFolder;
    }

    async _recoverFromFailedRestore() {
        const turnManager = this.game && this.game.turnManager;
        const recoveryGeneration = turnManager && typeof turnManager.captureTurnFlowGeneration === 'function'
            ? turnManager.captureTurnFlowGeneration()
            : null;
        const isRecoveryLatest = () => recoveryGeneration === null
            || (turnManager
                && typeof turnManager.isTurnFlowGenerationLatest === 'function'
                && turnManager.isTurnFlowGenerationLatest(recoveryGeneration));
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

            if (!isRecoveryLatest()) return;
            if (typeof this.game.ui.returnToTitle === 'function') {
                await this.game.ui.returnToTitle();
                return;
            }
        }
        if (!isRecoveryLatest()) return;
        this.game.phase = 'title';
    }

    // どんな方法でセーブする時も、この魔法で「今のゲームの全データ」をひとまとめにします
    async _createSaveDataObj(options = {}) {
        // 縮小地図は画像の読み込みをawaitする。待機中のタイトル復帰・別ロードで
        // メタ情報だけ旧シナリオ、城・武将だけ新シナリオになる保存を防ぐ。
        const saveFlow = this._captureLoadRequestFlow();
        const savedScenarioFolder = this.game.scenarioFolder;
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
        if ((saveFlow && !saveFlow.isLatest()) || this.game.scenarioFolder !== savedScenarioFolder) {
            return null; // 古いゲームの保存を成立させない。呼出元が書込を中止する。
        }

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
        // 復元処理は最初のawaitより前に遷移世代を所有する。
        // シナリオ定義の読込待ち中にタイトル復帰や別ロードが始まっても、
        // 古い復元が後からabortForScenarioTransition()して新しい遷移を奪い返さないようにする。
        const turnManager = this.game.turnManager;
        if (!turnManager || typeof turnManager.abortForScenarioTransition !== 'function'
            || typeof turnManager.captureTurnFlowGeneration !== 'function'
            || typeof turnManager.isTurnFlowGenerationLatest !== 'function') {
            throw new Error('ターン寿命管理を初期化できないため、セーブ復元を中止します');
        }
        turnManager.abortForScenarioTransition();
        const restoreFlowGeneration = turnManager.captureTurnFlowGeneration();
        const isRestoreFlowLatest = () => turnManager.isTurnFlowGenerationLatest(restoreFlowGeneration);
        this.game.isRestoringSave = true;

        try {
        await DataManager.loadScenarioDefinitions();
        if (!isRestoreFlowLatest()) return false;
        this._validateSaveDataStructure(d);
        if (!isRestoreFlowLatest()) return false;
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
        this.game.scenarioDefinition = DataManager.getScenarioDefinition(d.scenarioFolder) || null;
        
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
        if (!isRestoreFlowLatest()) return false;
        if (this.game.ui && typeof this.game.ui.waitForNextPaint === 'function') await this.game.ui.waitForNextPaint();
        if (!isRestoreFlowLatest()) return false;

        this.game.castles = d.castles.map(c => new Castle(c)); 
        this.game.bushos = d.bushos.map(b => new Busho(b));
        
        this.game.princesses = d.princesses.map(p => new Princess(p));
        this.game.provinces = d.provinces.map(p => new Province(p));
        this.game.legions = d.legions.map(l => new Legion(l));

        // 保存データには巨大なpixel mapを入れず、ロード時に種点→国ID→領土IDの順で低メモリ再生成します。
        if (this.game.ui) this.game.ui.updateLoadingProgress(35, '拠点の位置を解析しています');
        await DataManager.loadCastleSeedPoints('./data/images/map/japan_colorcode_map.png', this.game.castles, {
            isCurrent: isRestoreFlowLatest,
            onProgress: ratio => isRestoreFlowLatest() && this.game.ui && this.game.ui.updateLoadingProgress(35 + ratio * 10, '拠点の位置を解析しています')
        });
        if (!isRestoreFlowLatest()) return false;
        await DataManager.loadProvinceMap('./data/images/map/japan_provinces.png', this.game.provinces, {
            isCurrent: isRestoreFlowLatest,
            onProgress: ratio => isRestoreFlowLatest() && this.game.ui && this.game.ui.updateLoadingProgress(47 + ratio * 14, '国境データを解析しています')
        });
        if (!isRestoreFlowLatest()) return false;
        await DataManager.buildCastleTerritoryMap(this.game.castles, this.game.provinces, {
            isCurrent: isRestoreFlowLatest,
            onProgress: ratio => isRestoreFlowLatest() && this.game.ui && this.game.ui.updateLoadingProgress(62 + ratio * 18, '勢力領域を準備しています')
        });
        if (!isRestoreFlowLatest()) return false;
        if (this.game.ui && typeof this.game.ui.waitForNextPaint === 'function') await this.game.ui.waitForNextPaint();
        if (!isRestoreFlowLatest()) return false;
        
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
        
        const commonData = await DataManager.loadCommonData();
        if (!isRestoreFlowLatest()) return false;
        const courtRanks = commonData.courtRanks.map(row => new CourtRank(row));
        this.game.courtRankSystem.setRankData(courtRanks);

        this.game.ui.showGameSurface();
        
        this.game.phase = 'game';
        
        this.game.turnQueue = d.turnQueueIds.map(id => this.game.getCastle(id));
        this.game.currentIndex = d.currentIndex;
        
        if (typeof SkillManager !== 'undefined') {
            SkillManager.validateBushoSkills(this.game.bushos, this.game.scenarioFolder);
        }

        this.game.updateAllCastlesLords();
        this.game.lifeSystem.updateAllBushosAge();

        // セーブ時に歴史常駐効果が有効でも、現在のユーザー設定が歴史イベントOFFなら
        // ロード直後に解除して「設定OFFなのに効果だけ残る」状態を作らない。
        if (window.UserSettings && window.UserSettings.historicalEvent === false
            && this.game.eventManager && typeof this.game.eventManager.onHistoricalEventSettingChanged === 'function') {
            await this.game.eventManager.onHistoricalEventSettingChanged(false);
            if (!isRestoreFlowLatest()) return false;
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
            if (!isRestoreFlowLatest()) return false;
        }
        if (this.game.ui) this.game.ui.updateLoadingProgress(96, '地図を描画しています');
        this.game.ui.renderMap();
        if (this.game.ui) this.game.ui.updateLoadingProgress(100, '準備完了');
        if (this.game.ui && typeof this.game.ui.waitForNextPaint === 'function') await this.game.ui.waitForNextPaint();
        if (!isRestoreFlowLatest()) return false;

        if (window.AudioManager) {
            window.AudioManager.playBGM('SC_ex_Town2_Fortress.ogg');
        }

        // ★追加：画面の準備が整ったので、ここでロード画面を隠します
        if (this.game.ui) await this.game.ui.hideLoadingScreen();
        if (!isRestoreFlowLatest()) return false;

        await this.game.ui.showCutin(`ロード完了: ${this.game.year}年 ${this.game.month}月`);
        if (!isRestoreFlowLatest()) return false;

        // 復元中フラグは、地図・カットインを含む全awaitが終わるまで維持する。
        // ここから先だけ通常入力とTurnManagerの通常進行を再開できる。
        this.game.isRestoringSave = false;
        turnManager.scheduleTurnFlowContinuation(() => this.game.processTurn(), 0, {
            expectedIndex: Number(this.game.currentIndex)
        });
        return true;
        } catch (error) {
            // 復元中に別のロード／タイトル復帰が世代を更新した後で旧awaitがrejectしても、
            // 古い復元の失敗回復処理で新しい状態をタイトルへ巻き戻さない。
            if (!isRestoreFlowLatest()) return false;
            throw error;
        }
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
            if (!data) return; // 保存準備中に別シナリオへ遷移した場合は書き込まない。
            this._validateSaveDataStructure(data);
            const encryptedData = this._encryptData(data); // ★暗号化します
            const blob = new Blob([encryptedData], {type: 'application/octet-stream'}); // ★バイナリデータとして保存します
            const url = URL.createObjectURL(blob); 
            const a = document.createElement('a'); 
            a.href = url; 
            a.download = `sengoku_save_${data.year}_${data.month}.sav`; // ★拡張子を.savに変更します
            a.click(); 
            URL.revokeObjectURL(url); 
        } catch (e) {
            console.error('ファイルセーブに失敗しました:', e);
            if (this.game.ui) this.game.ui.showDialog('ファイルセーブに失敗しました。エラー原因: ' + e.message, false);
        } finally {
            this.hideSaveGuard(); // ★追加：保存が終わったらバリアを解除します
        }
    }
    
    // ファイルからロード
    loadGameFromFile(e) { 
        const file = e.target.files[0]; if (!file) return; 
        e.target.value = '';
        // 外部セーブは信用できない。FileReader・復号用バッファ・JSON.parseで
        // 同じデータを複数回メモリ保持するため、異常に大きいファイルは読込前に拒否する。
        const MAX_SAVE_IMPORT_BYTES = 32 * 1024 * 1024;
        if (Number.isFinite(file.size) && file.size > MAX_SAVE_IMPORT_BYTES) {
            if (this.game.ui) this.game.ui.showDialog('セーブファイルが大きすぎるため、読み込みを中止しました。', false);
            return;
        }
        const requestFlow = this._captureLoadRequestFlow();
        if (!requestFlow) return;
        if (this.game.ui) this.game.ui.showLoadingScreen('セーブデータを確認しています', 0);
        
        const reader = new FileReader(); 
        reader.onload = async (evt) => {
            if (!requestFlow.isLatest()) return;
            let restoreStarted = false;
            let restoreFlow = null;
            try { 
                const uint8 = new Uint8Array(evt.target.result); // ★バイナリデータとして受け取ります
                const d = this._decryptData(uint8); // ★復号化します
                this._validateSaveDataStructure(d); // ゲーム状態へ触る前に構造・主要参照を検査します
                if (!requestFlow.isLatest()) return;
                restoreStarted = true;
                // _restoreSaveDataObjは最初のawaitより前にTurnManager世代を取得する。
                // 呼び出しごとにその世代を保持し、後発ロードのisRestoringSaveを所有権と誤認しない。
                const restorePromise = this._restoreSaveDataObj(d);
                restoreFlow = this._captureLoadRequestFlow();
                await restorePromise;
            } catch(err) { 
                if (!(restoreStarted ? restoreFlow : requestFlow)?.isLatest()) return;
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
            if (!requestFlow.isLatest()) return;
            if (this.game.ui) {
                this.game.ui.hideLoadingScreen();
                this.game.ui.showDialog("セーブファイルを読み取れませんでした。", false);
            }
        };
        reader.readAsArrayBuffer(file); // ★テキストではなくバイナリとして読み込む魔法に変更します
    }
    
    // スロットへセーブ (IndexedDB)
    async saveGameToLocal(slotNo = 1) {
        const storageKey = "sengoku_save_slot" + slotNo;
        // 順番待ちの間にタイトル復帰・別シナリオ開始が発生した保存要求は破棄する。
        // 世代取得をキュー内へ遅らせると、古い要求が新シナリオを保存してしまう。
        const isRequestCurrent = this._captureSaveRequestCurrent();
        this.showSaveGuard();
        try {
            await this._withSerializedSlotSave(storageKey, async () => {
                if (!isRequestCurrent()) return;
                // 一覧表示後に保存領域の読込が失敗し始めた場合は、
                // 読めない既存スロットを上書きしない。スナップショット生成前に検証する。
                try {
                    await loadFromDB(storageKey);
                } catch (_) {
                    throw new Error('保存先スロットの読込に失敗したため、既存データを保護して保存を中止しました。');
                }
                if (!isRequestCurrent()) return;
                const data = await this._createSaveDataObj();
                if (!data || !isRequestCurrent()) return;
                this._validateSaveDataStructure(data);
                const encryptedData = this._encryptData(data);
                if (!isRequestCurrent()) return;
                await saveToDB(storageKey, encryptedData);
                // 読み戻しも同じキュー内に保持し、後続保存との照合を取り違えない。
                const writtenData = this.decodeStoredData(await loadFromDB(storageKey));
                if (!this.isLoadableSaveData(writtenData) || Number(writtenData.saveTimestamp) !== Number(data.saveTimestamp)) {
                    throw new Error('保存直後の読み戻し検証に失敗しました。');
                }
                if (!isRequestCurrent()) return;
                this.game.hasSaveData = true;
                if (this.game.ui && typeof this.game.ui.renderCommandMenu === 'function') {
                    this.game.ui.renderCommandMenu();
                }
                if (this.game.ui) this.game.ui.showDialog(`スロット${slotNo}にセーブが完了しました。`, false);
            });
        } catch (e) {
            console.error("セーブエラーの詳細:", e);
            if (isRequestCurrent() && this.game.ui) {
                this.game.ui.showDialog("セーブに失敗しました。エラー原因: " + e.message, false);
            }
        } finally {
            this.hideSaveGuard();
        }
    }

    // スロットからロード (IndexedDB)
    async loadGameFromLocal(slotNo = 1, prefix = "sengoku_save_slot") { 
        // DB読込自体はまだゲーム状態を置換しないが、待ち時間に別遷移が始まった場合は
        // 古いロード要求が後から復元を開始しないよう、要求開始時のTurnManager世代を保持する。
        const requestFlow = this._captureLoadRequestFlow();
        if (!requestFlow) return;
        // ★追加：ロードが始まった瞬間にロード画面で蓋をします！
        if (this.game.ui) this.game.ui.showLoadingScreen();

        let rawData = null;
        try {
            rawData = await loadFromDB(prefix + slotNo);
        } catch (e) {
            if (!requestFlow.isLatest()) return;
            console.error("ロードエラー:", e);
            // DBアクセス失敗と実際の空スロットは別。ロードを中断して再試行を案内する。
            if (this.game.ui) {
                this.game.ui.hideLoadingScreen();
                this.game.ui.showDialog(`スロット${slotNo}の読込に失敗しました。保存領域を確認して再試行してください。`, false);
            }
            return;
        }
        if (!requestFlow.isLatest()) return;

        if (!rawData) {
            if (this.game.ui) {
                this.game.ui.hideLoadingScreen(); // ★エラーで止まる時は蓋を開けます
                this.game.ui.showDialog(`スロット${slotNo}にはセーブデータがありません。`, false);
            }
            return;
        }

        let restoreStarted = false;
        let restoreFlow = null;
        try {
            let d;
            if (rawData instanceof Uint8Array) {
                d = this._decryptData(rawData);
            } else {
                d = rawData;
            }
            this._validateSaveDataStructure(d); // ゲーム状態へ触る前に構造・主要参照を検査します
            if (!requestFlow.isLatest()) return;
            restoreStarted = true;
            const restorePromise = this._restoreSaveDataObj(d);
            restoreFlow = this._captureLoadRequestFlow();
            await restorePromise;
        } catch(err) { 
            if (!(restoreStarted ? restoreFlow : requestFlow)?.isLatest()) return;
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
        // 同じゲーム内での二重実行は抑止する。ただし画面遷移で寿命が切れた
        // 旧シナリオの書込待ちが、新しいシナリオの自動保存を阻害してはならない。
        // 寿命判定は既存のTurnManager世代とシナリオ名を共通窓口から取得する。
        if (this._activeAutoSaveRequest && this._activeAutoSaveRequest.isCurrent()) return;
        const request = {isCurrent: this._captureSaveRequestCurrent()};
        this._activeAutoSaveRequest = request;
        this.game._autoSaveInProgress = true;
        this.showSaveGuard();
        try {
            // 保存先はロード一覧が扱う1～5だけに限定する。破損したlocalStorage値で
            // 参照されないスロットへ保存してしまうことを避ける。
            const storedIndex = Number(localStorage.getItem('autoSaveIndex'));
            const autoSaveIndex = Number.isInteger(storedIndex) && storedIndex >= 1 && storedIndex <= 5
                ? storedIndex : 1;
            const storageKey = 'sengoku_autosave_slot' + autoSaveIndex;

            // オートセーブは内部IndexedDB専用なので勢力図サムネイルを省き、
            // 低メモリ端末向けに巨大な暗号化バッファも生成しない。
            const data = await this._createSaveDataObj({ includeThumbnail: false });
            if (!data || !request.isCurrent()) return;
            this._validateSaveDataStructure(data);
            if (!request.isCurrent()) return;

            // 手動保存と同じスロット単位の直列化を使う。旧ゲームの書込みが
            // 開始済みでも、後発ゲームのセーブが先に完了してから巻き戻されない。
            await this._withSerializedSlotSave(storageKey, async () => {
                if (!request.isCurrent()) return;
                await saveToDB(storageKey, data);
                if (!request.isCurrent()) return;
                this.game.hasSaveData = true;
                localStorage.setItem('autoSaveIndex', autoSaveIndex === 5 ? 1 : autoSaveIndex + 1);
            });
        } catch (e) {
            console.error('オートセーブに失敗しました:', e);
        } finally {
            // 古い保存のfinallyで新しい保存中フラグを解除しない。
            if (this._activeAutoSaveRequest === request) {
                this._activeAutoSaveRequest = null;
                this.game._autoSaveInProgress = false;
            }
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

    async refreshLoadAvailability(options = {}) {
        const isCurrent = typeof options.isCurrent === 'function' ? options.isCurrent : () => true;
        const hasData = await this.hasAnyLoadableSaveData();
        // タイトルの古い確認結果で、新しく作成したセーブや別画面の状態を上書きしない。
        if (!isCurrent()) return null;
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
                    .then(rawData => ({ slotNo, rawData, readError: false }))
                    // DBへのアクセス失敗を「空スロット」と見なすと、読めない既存データを
                    // 空き扱いして上書きできてしまう。復号・形式不一致とは区別する。
                    .catch(() => ({ slotNo, rawData: null, readError: true }));
            })
        );

        return rows.map(({ slotNo, rawData, readError }) => {
            const data = readError ? null : this.decodeStoredData(rawData);
            const hasData = !readError && this.isLoadableSaveData(data);
            // 現行形式でロード不可でも、DB内に実際のレコードが存在するなら空欄とは表示しない。
            // 開発中は旧スキーマへの互換処理を持たないが、意図的な上書きは可能にする。
            const invalidData = !readError && rawData != null && !hasData;
            return {
                originalSlotNo: slotNo,
                data,
                saveTimestamp: hasData ? this.getSaveTimestamp(data) : 0,
                hasData,
                readError,
                invalidData
            };
        });
    }

    // ★追加：最新のセーブデータを自動で見つけて読み込む魔法 (続きから)
    async continueGame() {
        // 「続きから」のスロット探索中にも別の開始／タイトル遷移が起こり得るため、
        // 探索開始時の世代だけを保持し、古い検索結果からロードを開始しない。
        const requestFlow = this._captureLoadRequestFlow();
        if (!requestFlow) return;
        // ★追加：探している間に操作されないようにロード画面で蓋をします！
        if (this.game.ui) this.game.ui.showLoadingScreen();

        let latestSlot = -1;
        let latestTime = 0;
        let latestPrefix = "";

        // 手動セーブとオートセーブ、両方のお部屋を探しに行きます
        const prefixes = ["sengoku_save_slot", "sengoku_autosave_slot"];

        for (const prefix of prefixes) {
            const slots = await this.readSaveSlots(prefix);
            if (!requestFlow.isLatest()) return;
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
        if (!requestFlow.isLatest()) return;
        if (latestSlot !== -1) {
            await this.loadGameFromLocal(latestSlot, latestPrefix);
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