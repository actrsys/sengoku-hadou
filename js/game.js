/**
 * game.js
 * 戦国シミュレーションゲームのメイン進行（GameManager）。
 * データ・保存・計算規則・UIは各専門ファイルへ分離しています。
 */

window.onerror = function(message, source, lineno, colno, error) {
    console.error("Global Error:", message, "Line:", lineno);
    return false;
};

/* ==========================================================================
   GameManager
   - 計算規則は DomesticRules / EconomyRules / PersonnelRules / GameMath へ分離
   - 表示整形は StatPresenter、地図探索は MapGraphService が担当
   ========================================================================== */
class GameManager {
    constructor() { 
        this.year = window.MainParams.StartYear; 
        this.month = window.MainParams.StartMonth; 
        this.castles = []; 
        this.bushos = []; 
        this.legions = []; // ★今回追加：軍団の名簿を入れておく空っぽの箱です
        // モデルが window.GameApp 全体を直接参照しないよう、能力計算に必要な最小限のresolverだけを注入します。
        if (typeof Busho !== 'undefined' && typeof Busho.configureRuntime === 'function') {
            Busho.configureRuntime({ getClanDaimyo: (clanId) => this.getClanDaimyo(clanId) });
        }
        this.turnQueue = []; 
        this.currentIndex = 0; 
        this.playerClanId = 1;
        // 起動中のUI初期化が前回の実機診断を上書きしないよう、UI生成前からタイトル状態を正本化する。
        this.phase = 'title';
        // タイトル／システムのロード可否はSaveManagerが検査した結果だけを反映する。未検査時は選択不可。
        this.hasSaveData = false;
        this.historySystem = new HistorySystem(this);
        this.ui = new UIManager(this); 
        this.saveManager = new SaveManager(this);
        this.turnManager = new TurnManager(this);
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
        // 国主評定の方針・開催権・AI制約は専門部署で一元管理します。
        this.legionPolicySystem = new LegionPolicySystem(this);
        // 城の隣接索引・接続探索は全システムでこの1インスタンスを共有します。
        this.mapGraph = new MapGraphService(this);
        this.reinforcementService = new ReinforcementService(this);
        this.commandSystem = new CommandSystem(this);
        this.warManager = new WarManager(this);
        this.warPreparationController = new WarPreparationController(this);
        
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
        // UserSettings は保存と通知だけを担当し、歴史常駐効果の解除は EventManager へ委譲します。
        this._userSettingChangedHandler = (event) => {
            const detail = event && event.detail ? event.detail : {};
            if (detail.key !== 'historicalEvent') return;
            const manager = this.eventManager;
            if (!manager || typeof manager.onHistoricalEventSettingChanged !== 'function') return;
            Promise.resolve(manager.onHistoricalEventSettingChanged(detail.value)).catch(error => {
                console.warn('歴史イベント設定変更時の常駐効果同期に失敗しました:', error);
            });
        };
        window.addEventListener('user-setting-changed', this._userSettingChangedHandler);
        // ★ 城の管理を専門に行うシステムを呼び出します！
        this.castleManager = new CastleManager(this);
        // ★ 面談システムを呼び出します！
        this.interviewSystem = new InterviewSystem(this);
        // ★ エンディング（クリア・ゲームオーバー）を管理するシステムを呼び出します！
        this.endingSystem = new EndingSystem(this);
        
        this.hasAutoSavedThisMonth = false; // ★追加：その月にオートセーブしたかどうかを覚えておく箱です

        // ★実機診断：強制リロード前にAIがどこまで進んでいたか、同一タブのsessionStorageから復元します。
        setTimeout(() => this._showPreviousAIDiagnostic(), 0);
    }

    writeSystemDiagnostic(phase, castle = null) {
        // ★Round5 実機診断：AI城だけでなく月末・月初・プレイヤー復帰まで記録します。
        if (typeof sessionStorage === 'undefined') return;
        // 初期化中・タイトル中は前回クラッシュ位置を上書きしない。
        if (!this.phase || this.phase === 'title') return;
        if (document.body && document.body.classList.contains('is-pc')) return;
        try {
            // キュー位置は対象城を明示している処理だけに付ける。
            // 月次・UI・イベント等へ直前のAI currentIndex を持ち越さない。
            const isQueuePhase = !!castle;
            const data = {
                year: this.year,
                month: this.month,
                index: isQueuePhase ? this.currentIndex + 1 : 0,
                total: isQueuePhase && this.turnQueue ? this.turnQueue.length : 0,
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
            let checkpointText = '処理中';
            if (Number(data.total) > 0) checkpointText = `${data.index || '?'} / ${data.total}`;
            else if (String(data.phase || '').startsWith('month_') || String(data.phase || '').startsWith('month')) checkpointText = '月次処理';
            else if (String(data.phase || '').startsWith('ui:')) checkpointText = '画面操作';
            el.textContent = `前回停止位置: ${checkpointText}${castleText}　${data.phase || '不明'}`;
            el.title = 'タップすると閉じます';
            el.addEventListener('click', () => el.remove());
            document.body.appendChild(el);
        } catch (e) {
        }
    }

    getRelation(id1, id2) {
        // 外交データは DiplomacyManager の正本をそのまま返す。
        // 表示用の別名や旧API互換値を正本オブジェクトへ書き込まない。
        return this.diplomacyManager.getRelation(id1, id2);
    }

    // シナリオ／セーブ切替時に、前データを参照している検索索引を先に切ります。
    // 配列そのものは復元処理が置き換えますが、Mapが旧武将・旧拠点を保持したままだと
    // 古い低メモリ端末で新旧データが重なる瞬間のピークが大きくなります。
    releaseScenarioDataIndexes() {
        this._bushoMap = null;
        this._bushoMapSource = null;
        this._bushoMapSize = -1;
        this._castleMap = null;
        this._castleMapSource = null;
        this._castleMapSize = -1;
        this._clanMap = null;
        this._clanMapSource = null;
        this._clanMapSize = -1;
        this._provinceMap = null;
        this._provinceMapSource = null;
        this._provinceMapSize = -1;
        this._princessMap = null;
        this._princessMapSource = null;
        this._princessMapSize = -1;

        this._clanBushosMap = null;
        this._clanBushosSource = null;
        this._clanBushosSize = -1;
        this._clanBushosVersion = -1;
        this._clanCastlesMap = null;
        this._clanCastlesSource = null;
        this._clanCastlesVersion = -1;

        this._provinceCastlesMap = null;
        this._regionProvincesMap = null;
        this._regionCastlesMap = null;
        this._territoryIndexCastlesSource = null;
        this._territoryIndexCastlesSize = -1;
        this._territoryIndexProvincesSource = null;
        this._territoryIndexProvincesSize = -1;
    }

    // タイトル復帰・新規シナリオ読込前に、旧シナリオの巨大IDマップ共有参照をまとめて切る。
    // 地図画像そのものは共通資産なので解放対象にせず、シナリオごとに再構築されるTypedArrayだけを対象とする。
    releaseScenarioMapResources() {
        this.releaseScenarioDataIndexes();
        if (this.ui) {
            this.ui.pixelCastleMap = null;
            this.ui.pixelProvinceMap = null;
            this.ui.lastClanColorsHash = null;
        }
        if (window.EventMapEffects && typeof window.EventMapEffects.invalidateCaches === 'function') {
            window.EventMapEffects.invalidateCaches();
        }
        if (typeof DataManager !== 'undefined' && typeof DataManager.releaseMapResources === 'function') {
            DataManager.releaseMapResources();
        }
    }
    
    startNewGame(options = {}) {
        const startInWatchMode = !!(options && options.watchMode);
        this.releaseScenarioMapResources();
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
            if (this.historySystem) this.historySystem.clear();
            this.ui.clearWarLog();
            if (typeof this.ui.resetMapViewState === 'function') {
                this.ui.resetMapViewState({ initialZoomLevel: startInWatchMode ? 0 : 1 });
            } else {
                this.ui.currentCastle = null;
                this.ui.hasInitializedMap = false;
            }
            this.ui.selectedDaimyoId = null; // 選んでいた大名の記憶も消します
        }
        
        // ★スタンプ帳を真っ白にして、イベントの引き出しも新品に取り替えます！
        this.flags = {};
        this.eventManager = new EventManager(this);
        
        // 新規ゲームへ前ゲームのAI作戦・所領履歴・人事評価を持ち越さない。
        if (this.aiOperationManager && typeof this.aiOperationManager.resetAllState === 'function') {
            this.aiOperationManager.resetAllState();
        }
        if (this.aiStaffing && typeof this.aiStaffing.resetCaches === 'function') {
            this.aiStaffing.resetCaches();
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
        // 直接再読込される経路でも旧マップを保持したまま新しいTypedArrayを作らない。
        this.releaseScenarioMapResources();
        if (this.ui && typeof this.ui.resetMapViewState === 'function') {
            this.ui.resetMapViewState({ initialZoomLevel: startInWatchMode ? 0 : 1 });
        }
        // ★追加：シナリオの準備を始める前に、画面をロード画面で隠します
        if (this.ui) this.ui.showLoadingScreen('シナリオを準備しています', 0);
        // 古いスマホでもロード画面を確実に1フレーム描いてから重い処理へ入ります。
        if (this.ui && typeof this.ui.waitForNextPaint === 'function') await this.ui.waitForNextPaint();

        try {
            document.getElementById('title-screen').classList.add('hidden'); 

            const data = await DataManager.loadAll(folder, {
                onProgress: (value, label) => {
                    if (this.ui) this.ui.updateLoadingProgress(Math.round(value * 0.72), label);
                }
            }); 
            this.clans = data.clans; this.castles = data.castles; this.bushos = data.bushos;
            // 地図IDマップはDataManagerとUIで同じTypedArrayを共有し、巨大な複製を作りません。
            if (this.ui) {
                this.ui.pixelCastleMap = DataManager.castlePixelMap || null;
                this.ui.pixelProvinceMap = DataManager.provincePixelMap || null;
            }
            if (typeof SkillManager !== 'undefined') {
                SkillManager.validateBushoSkills(this.bushos, folder);
            }
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

            if (this.ui) this.ui.updateLoadingProgress(74, '寿命・登場状態を初期化しています');
            // 討死武将の初期延命はモデル生成時ではなく、寿命専門部署で一度だけ適用します。
            this.lifeSystem.initializeBattleDeathLifespans(this.year);
            if (this.ui && typeof this.ui.waitForNextPaint === 'function') await this.ui.waitForNextPaint();
            
            // ★ここを書き足し！：諸勢力の頭領がいないかチェックして、いなければ自動で作ってもらいます！
            this.kunishuSystem.generateMissingLeaders();
            
            // ★ここを書き足し！：ゲーム開始の瞬間に、全員の年齢による能力値変動を計算します！
            this.lifeSystem.updateAllBushosAge();

            // ★追加：ゲーム開始時に、各大名家にランダムな姫をある程度割り振ります！
            this.lifeSystem.distributeInitialPrincesses();

            // ★今回追加：ゲーム開始時に、武将の年齢と得意な能力に応じた経験値をプレゼントします！
            this.bushos.forEach(b => {
                // まだ生まれていない武将は対象外とします
                if (window.LifeStatusRules.isUnborn(b)) return;

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

            if (this.ui) this.ui.updateLoadingProgress(82, '初期イベントを確認しています');
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

            if (this.ui) this.ui.updateLoadingProgress(90, '地図を読み込んでいます');
            // 城/国IDマップだけでなく、実際に画面へ貼るPC/スマホ用の地図画像もdecode完了まで待つ。
            // ゲーム画面を先に出して地図だけ後から現れる状態を作らない。
            if (this.ui && typeof this.ui.prepareMapBaseImage === 'function') {
                await this.ui.prepareMapBaseImage(this.mapWidth, this.mapHeight);
            }
            if (this.ui) this.ui.updateLoadingProgress(96, '地図を描画しています');
            this.ui.renderMap();
            // カットイン表示を消しました！

            // レイアウト・Canvas描画を端末へ反映させてからロード画面を閉じます。
            if (this.ui) this.ui.updateLoadingProgress(100, '準備完了');
            if (this.ui && typeof this.ui.waitForNextPaint === 'function') await this.ui.waitForNextPaint();
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
        const clan = this.getClan(castle.ownerClan);
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
    getProvince(id) {
        // 国データもUI更新や一覧ソートから頻繁に参照するため、毎回findせず共通索引を使います。
        if (this._provinceMapSource !== this.provinces || this._provinceMapSize !== this.provinces.length) {
            this._provinceMap = new Map();
            this.provinces.forEach(p => this._provinceMap.set(Number(p.id), p));
            this._provinceMapSource = this.provinces;
            this._provinceMapSize = this.provinces.length;
        }
        return this._provinceMap.get(Number(id));
    }
    getPrincess(id) {
        // 姫も婚姻・会話・情報表示からID参照されるため、配列の先頭から毎回探さない。
        // ランダム姫追加時は配列長が変わるので自動的に再構築される。
        if (this._princessMapSource !== this.princesses || this._princessMapSize !== this.princesses.length) {
            this._princessMap = new Map();
            this.princesses.forEach(p => this._princessMap.set(Number(p.id), p));
            this._princessMapSource = this.princesses;
            this._princessMapSize = this.princesses.length;
        }
        return this._princessMap.get(Number(id));
    }
    _ensureTerritoryStaticIndexes() {
        // provinceId / regionId はシナリオ地理の静的構造なので、国・地方ごとの拠点集合を共有する。
        // 所有者などゲーム中に変化する状態は索引へ焼き込まない。
        const castles = this.castles || [];
        const provinces = this.provinces || [];
        if (this._territoryIndexCastlesSource === castles
            && this._territoryIndexCastlesSize === castles.length
            && this._territoryIndexProvincesSource === provinces
            && this._territoryIndexProvincesSize === provinces.length) return;

        const provinceMap = new Map();
        const regionProvinceMap = new Map();
        const regionCastleMap = new Map();
        const provinceRegionMap = new Map();

        for (const province of provinces) {
            const provinceId = Number(province.id) || 0;
            const regionId = Number(province.regionId) || 0;
            provinceRegionMap.set(provinceId, regionId);
            let regionProvinces = regionProvinceMap.get(regionId);
            if (!regionProvinces) {
                regionProvinces = [];
                regionProvinceMap.set(regionId, regionProvinces);
            }
            regionProvinces.push(province);
        }

        for (const castle of castles) {
            const provinceId = Number(castle.provinceId) || 0;
            let provinceCastles = provinceMap.get(provinceId);
            if (!provinceCastles) {
                provinceCastles = [];
                provinceMap.set(provinceId, provinceCastles);
            }
            provinceCastles.push(castle);

            const regionId = provinceRegionMap.get(provinceId) || 0;
            let regionCastles = regionCastleMap.get(regionId);
            if (!regionCastles) {
                regionCastles = [];
                regionCastleMap.set(regionId, regionCastles);
            }
            regionCastles.push(castle);
        }

        this._provinceCastlesMap = provinceMap;
        this._regionProvincesMap = regionProvinceMap;
        this._regionCastlesMap = regionCastleMap;
        this._territoryIndexCastlesSource = castles;
        this._territoryIndexCastlesSize = castles.length;
        this._territoryIndexProvincesSource = provinces;
        this._territoryIndexProvincesSize = provinces.length;
    }
    getProvinceCastles(provinceId) {
        this._ensureTerritoryStaticIndexes();
        return this._provinceCastlesMap.get(Number(provinceId) || 0) || [];
    }
    getRegionProvinces(regionId) {
        this._ensureTerritoryStaticIndexes();
        return this._regionProvincesMap.get(Number(regionId) || 0) || [];
    }
    getRegionCastles(regionId) {
        this._ensureTerritoryStaticIndexes();
        return this._regionCastlesMap.get(Number(regionId) || 0) || [];
    }
    // 勢力所属は AffiliationSystem が唯一の書換窓口なので、所属変更versionを使って
    // 「勢力ID→所属武将配列」を安全に共有します。活動中/死亡などの状態は変動するため
    // 索引へ焼き込まず、呼び出し側がこの小さな候補集合に対して判定します。
    getClanBushos(clanId) {
        const version = this.bushoAffiliationVersion || 0;
        if (this._clanBushosSource !== this.bushos
            || this._clanBushosSize !== this.bushos.length
            || this._clanBushosVersion !== version) {
            this._clanBushosMap = new Map();
            for (const busho of this.bushos) {
                const id = Number(busho.clan) || 0;
                let members = this._clanBushosMap.get(id);
                if (!members) {
                    members = [];
                    this._clanBushosMap.set(id, members);
                }
                members.push(busho);
            }
            this._clanBushosSource = this.bushos;
            this._clanBushosSize = this.bushos.length;
            this._clanBushosVersion = version;
        }
        return this._clanBushosMap.get(Number(clanId) || 0) || [];
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
        return this.getClanBushos(numericClanId).find(b => b.isDaimyo);
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
    // ★ 修正：まだ生まれていない人（unborn）や亡くなった人（dead）は無視するようにします。
    // map→filter の二重配列を作らず、一度の走査で必要な人物だけ返します。
    getCastleBushos(cid) {
        const castle = this.getCastle(cid);
        if (!castle || !Array.isArray(castle.samuraiIds) || castle.samuraiIds.length === 0) return [];
        const result = [];
        for (const id of castle.samuraiIds) {
            const busho = this.getBusho(id);
            if (busho && window.LifeStatusRules.isPresent(busho)) result.push(busho);
        }
        return result;
    }
    getCurrentTurnCastle() { return this.turnQueue[this.currentIndex]; }
    getCurrentTurnId() { return this.year * 12 + this.month; }
    getClanTotalSoldiers(clanId) { return this.getClanCastles(clanId).reduce((sum, c) => sum + c.soldiers, 0); }
    getClanGunshi(clanId) {
        return this.getClanBushos(clanId).find(b => b.isGunshi && window.BushoStatusRules.isActive(b));
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
                    const wife = this.getPrincess(wId);
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
            goldIncome += EconomyRules.calcExpectedGoldIncome(c, this);
            riceIncome += EconomyRules.calcBaseRiceIncome(c);
        }

        goldIncome += EconomyRules.calcClanTradeIncome(clan.id, this);
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
                                const province = this.getProvince(myProvId);
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
    
    // 月進行の実処理は TurnManager に一元化します。既存呼び出しとの互換窓口だけを残します。
    async startMonth() { return this.turnManager.startMonth(); }
    async processTurn() { return this.turnManager.processTurn(); }
    async finishTurn() { return this.turnManager.finishTurn(); }
    async endMonth() { return this.turnManager.endMonth(); }
    checkAllActionsDone() { return this.turnManager.checkAllActionsDone(); }

    changeLeader(clanId, newLeaderId) { 
        this.getClanBushos(clanId).forEach(b => b.isDaimyo = false); 
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
    // セーブ／ロードは SaveManager が専門管理します。
    // 既存の呼び出し元を壊さないため、GameManager には薄い互換窓口だけ残します。
    // ==========================================
    showSaveGuard() { return this.saveManager.showSaveGuard(); }
    hideSaveGuard() { return this.saveManager.hideSaveGuard(); }
    _createSaveDataObj(options = {}) { return this.saveManager._createSaveDataObj(options); }
    generateSaveMapImage() { return this.saveManager.generateSaveMapImage(); }
    _restoreSaveDataObj(data) { return this.saveManager._restoreSaveDataObj(data); }
    _encryptData(obj) { return this.saveManager._encryptData(obj); }
    _decryptData(uint8) { return this.saveManager._decryptData(uint8); }
    saveGameToFile() { return this.saveManager.saveGameToFile(); }
    loadGameFromFile(event) { return this.saveManager.loadGameFromFile(event); }
    saveGameToLocal(slotNo = 1) { return this.saveManager.saveGameToLocal(slotNo); }
    loadGameFromLocal(slotNo = 1, prefix = "sengoku_save_slot") { return this.saveManager.loadGameFromLocal(slotNo, prefix); }
    executeAutoSave() { return this.saveManager.executeAutoSave(); }
    continueGame() { return this.saveManager.continueGame(); }

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
        const previousPlayerClanId = Number(this.playerClanId);
        this._prepareFreshWatchMode(previousPlayerClanId);
        const prepare = this.aiOperationManager && typeof this.aiOperationManager.onClanBecameAIControlled === 'function'
            ? this.aiOperationManager.onClanBecameAIControlled(previousPlayerClanId)
            : null;
        Promise.resolve(prepare)
            .catch(error => console.error('観戦開始時のAI作戦準備に失敗しました:', error))
            .finally(() => this.processTurn());
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
            const selectedClan = this.getClan(selectedClanId);
            if (!selectedClan) {
                this.cancelQueuedWatchReturn();
                return;
            }
            this.ui.showDialog(`${selectedClan.name}でゲームを再開しますか？`, true, () => {
                this.isWatchMode = false;
                this.playerClanId = selectedClan.id;
                this._resetWatchReturnState();
                if (this.aiOperationManager && typeof this.aiOperationManager.onClanBecamePlayerControlled === 'function') {
                    this.aiOperationManager.onClanBecamePlayerControlled(selectedClan.id);
                }
                
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
