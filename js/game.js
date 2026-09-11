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
        if (typeof sessionStorage === 'undefined' && typeof localStorage === 'undefined') return;
        try {
            // WebKitのページプロセスが強制終了すると、ゲームDOM自体が消えてその場ではログを表示できない。
            // 一覧→詳細の短い遷移だけはlocalStorageへも退避しているため、次回正常起動時はそちらを優先して回収する。
            let raw = null;
            let fromPersistentTransition = false;
            if (typeof localStorage !== 'undefined') {
                raw = localStorage.getItem('sengoku_mobile_transition_checkpoint_v1');
                fromPersistentTransition = !!raw;
            }
            if (!raw && typeof sessionStorage !== 'undefined') {
                raw = sessionStorage.getItem('sengoku_ai_last_checkpoint_v1');
            }
            if (!raw) return;
            const data = JSON.parse(raw);
            if (!data || data.phase === 'turn_finished' || data.phase === 'player_turn:ready') return;
            if (data.time && Date.now() - data.time > 2 * 60 * 60 * 1000) {
                if (fromPersistentTransition && typeof localStorage !== 'undefined') {
                    localStorage.removeItem('sengoku_mobile_transition_checkpoint_v1');
                }
                return;
            }
            if (document.getElementById('ai-last-checkpoint-badge') || document.getElementById('mobile-transition-checkpoint-badge')) return;

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

            // ページプロセス停止後はユーザーが報告する前に再度落ちる可能性があるため、
            // 永続checkpointは表示しただけでは消さない。バッジをユーザーが閉じた時、または正常遷移完了時に消す。
            if (fromPersistentTransition) {
                el.addEventListener('click', () => {
                    try { localStorage.removeItem('sengoku_mobile_transition_checkpoint_v1'); } catch (_) {}
                }, { once: true });
            }
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

        // 軍団の clanId / legionNo / id は軍団生成後に変えない静的識別子なので、
        // 武将・拠点と同じく短命索引をシナリオ境界で解放する。
        this._legionByClanNoMap = null;
        this._legionByIdMap = null;
        this._clanLegionsMap = null;
        this._legionIndexSource = null;
        this._legionIndexSize = -1;
        this._castleColorDirtyIds = null;

        this._clanBushosMap = null;
        this._clanBushosSource = null;
        this._clanBushosSize = -1;
        this._clanBushosVersion = -1;
        this._clanCastlesMap = null;
        this._clanCastlesSource = null;
        this._clanCastlesSize = -1;
        this._clanCastlesVersion = -1;

        this._provinceCastlesMap = null;
        this._regionProvincesMap = null;
        this._regionCastlesMap = null;
        this._territoryIndexCastlesSource = null;
        this._territoryIndexCastlesSize = -1;
        this._territoryIndexProvincesSource = null;
        this._territoryIndexProvincesSize = -1;

        // MapGraphService も旧 castles 配列と隣接Mapを保持するため、同じ切替境界で必ず解放する。
        if (this.mapGraph && typeof this.mapGraph.invalidate === 'function') {
            this.mapGraph.invalidate();
        }
    }

    // タイトル復帰・新規シナリオ読込前に、旧シナリオの巨大IDマップ共有参照をまとめて切る。
    // 地図画像そのものは共通資産なので解放対象にせず、シナリオごとに再構築されるTypedArrayだけを対象とする。
    releaseScenarioMapResources() {
        this.releaseScenarioDataIndexes();
        // PC向け顔画像のアイドル先読みが旧シナリオのまま後続batchを開始しないよう世代を進める。
        this._facePreloadGeneration = Number(this._facePreloadGeneration || 0) + 1;
        if (this.ui) {
            this.ui.pixelCastleMap = null;
            this.ui.pixelProvinceMap = null;
            this.ui.lastClanColorsHash = null;
            if (typeof this.ui.releaseScenarioTransientCaches === 'function') {
                this.ui.releaseScenarioTransientCaches();
            }
        }
        if (window.EventMapEffects && typeof window.EventMapEffects.invalidateCaches === 'function') {
            window.EventMapEffects.invalidateCaches();
        }
        if (typeof DataManager !== 'undefined' && typeof DataManager.releaseMapResources === 'function') {
            DataManager.releaseMapResources();
        }
    }
    
    async startNewGame(options = {}) {
        const startInWatchMode = !!(options && options.watchMode);
        if (this.turnManager && typeof this.turnManager.abortForScenarioTransition === 'function') {
            this.turnManager.abortForScenarioTransition();
        }
        if (this.warManager && typeof this.warManager.abortForScenarioTransition === 'function') {
            this.warManager.abortForScenarioTransition();
        }
        if (this.fieldWarManager && typeof this.fieldWarManager.abortForScenarioTransition === 'function') {
            this.fieldWarManager.abortForScenarioTransition();
        }
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
        
        try {
            await DataManager.loadScenarioDefinitions();
        } catch (error) {
            console.error(error);
            if (this.ui) {
                this.ui.showDialog("シナリオ一覧の読み込みに失敗しました。", false, () => {
                    this.ui.returnToTitle();
                }, null, { closeBeforeOk: true });
            }
            return;
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
            this.scenarioDefinition = data.scenario || DataManager.getScenarioDefinition(folder) || null;
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

            // 途中年代シナリオでは、史実上すでに終了した歴史イベントをロード画面の裏で無演出解決します。
            // 大名選択・観戦画面を初めて見せる時点で名前・所属等を完成状態にし、開始後の突然変化を防ぎます。
            if (this.eventManager && typeof this.eventManager.applyScenarioStartHistoricalSettlements === 'function') {
                if (this.ui) this.ui.updateLoadingProgress(73, '開始時点までの史実を反映しています');
                await this.eventManager.applyScenarioStartHistoricalSettlements();
            }

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
                }, null, { closeBeforeOk: true });
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

        // 同一GameManagerで再読込された場合、前回のrequestIdleCallback/setTimeout予約は
        // キャンセルAPIの有無に依存せず世代tokenで無効化する。実行中batchは最大4枚だけで、
        // 完了後に次batchを予約しないため旧シナリオの先読みが新シナリオと並走し続けない。
        const preloadGeneration = Number(this._facePreloadGeneration || 0) + 1;
        this._facePreloadGeneration = preloadGeneration;
        const isCurrentGeneration = () => preloadGeneration === Number(this._facePreloadGeneration || 0);

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
            const guarded = () => {
                if (!isCurrentGeneration()) return;
                fn();
            };
            if ('requestIdleCallback' in window && typeof window.requestIdleCallback === 'function') {
                window.requestIdleCallback(guarded, { timeout: 500 });
            } else {
                setTimeout(guarded, 50);
            }
        };

        const loadBatch = async (startIndex) => {
            if (!isCurrentGeneration() || startIndex >= urls.length) return;
            const batch = urls.slice(startIndex, startIndex + batchSize);
            await Promise.all(batch.map(url => new Promise(resolve => {
                const img = new Image();
                img.onload = img.onerror = resolve;
                img.decoding = 'async';
                img.src = url;
            })));
            if (!isCurrentGeneration()) return;
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
    _ensureLegionStaticIndexes() {
        // Legion の clanId / legionNo / id は生成・ロード時に確定し、在職状況は commanderId だけが変わる。
        // そのため静的識別子だけを索引化し、動的な commanderId は索引へ焼き込まない。
        const legions = Array.isArray(this.legions) ? this.legions : [];
        if (this._legionIndexSource === legions && this._legionIndexSize === legions.length) return;

        const byClanNo = new Map();
        const byId = new Map();
        const byClan = new Map();
        for (const legion of legions) {
            const clanId = Number(legion.clanId);
            const legionNo = Number(legion.legionNo);
            const id = Number(legion.id);
            if (Number.isFinite(clanId)) {
                let list = byClan.get(clanId);
                if (!list) {
                    list = [];
                    byClan.set(clanId, list);
                }
                list.push(legion);
                // 旧 find() と同じく、重複があっても先頭の軍団を返す。
                if (Number.isFinite(legionNo)) {
                    const key = `${clanId}:${legionNo}`;
                    if (!byClanNo.has(key)) byClanNo.set(key, legion);
                }
            }
            if (Number.isFinite(id) && !byId.has(id)) byId.set(id, legion);
        }
        this._legionByClanNoMap = byClanNo;
        this._legionByIdMap = byId;
        this._clanLegionsMap = byClan;
        this._legionIndexSource = legions;
        this._legionIndexSize = legions.length;
    }
    getLegionByClanNo(clanId, legionNo) {
        this._ensureLegionStaticIndexes();
        const c = Number(clanId);
        const n = Number(legionNo);
        if (!Number.isFinite(c) || !Number.isFinite(n)) return undefined;
        return this._legionByClanNoMap.get(`${c}:${n}`);
    }
    getLegionById(id) {
        this._ensureLegionStaticIndexes();
        const numericId = Number(id);
        return Number.isFinite(numericId) ? this._legionByIdMap.get(numericId) : undefined;
    }
    getClanLegions(clanId) {
        this._ensureLegionStaticIndexes();
        const numericClanId = Number(clanId);
        return Number.isFinite(numericClanId) ? (this._clanLegionsMap.get(numericClanId) || []) : [];
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
            const provinceId = Number(province.id);
            const regionId = Number(province.regionId);
            // 不正IDを0へ丸めると旧filter/findより候補が広がるため、索引へ混ぜない。
            if (!Number.isFinite(provinceId) || !Number.isFinite(regionId)) continue;
            provinceRegionMap.set(provinceId, regionId);
            let regionProvinces = regionProvinceMap.get(regionId);
            if (!regionProvinces) {
                regionProvinces = [];
                regionProvinceMap.set(regionId, regionProvinces);
            }
            regionProvinces.push(province);
        }

        for (const castle of castles) {
            const provinceId = Number(castle.provinceId);
            if (!Number.isFinite(provinceId)) continue;
            let provinceCastles = provinceMap.get(provinceId);
            if (!provinceCastles) {
                provinceCastles = [];
                provinceMap.set(provinceId, provinceCastles);
            }
            provinceCastles.push(castle);

            // 旧ロジックは「対応する国データが存在し、そのregionIdが一致する城」だけを
            // 地方候補にしていた。未知provinceIdをregion 0へ丸めると候補が広がるため、
            // 国が見つからない城は地方索引へ入れない。
            if (!provinceRegionMap.has(provinceId)) continue;
            const regionId = provinceRegionMap.get(provinceId);
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
        const numericProvinceId = Number(provinceId);
        return Number.isFinite(numericProvinceId) ? (this._provinceCastlesMap.get(numericProvinceId) || []) : [];
    }
    getRegionProvinces(regionId) {
        this._ensureTerritoryStaticIndexes();
        const numericRegionId = Number(regionId);
        return Number.isFinite(numericRegionId) ? (this._regionProvincesMap.get(numericRegionId) || []) : [];
    }
    getRegionCastles(regionId) {
        this._ensureTerritoryStaticIndexes();
        const numericRegionId = Number(regionId);
        return Number.isFinite(numericRegionId) ? (this._regionCastlesMap.get(numericRegionId) || []) : [];
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
                const id = Number(busho.clan);
                // 不正な所属値を clan 0 へ丸めると浪人候補を広げるため、旧Number比較同様に除外する。
                if (!Number.isFinite(id)) continue;
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
        const numericClanId = Number(clanId);
        return Number.isFinite(numericClanId) ? (this._clanBushosMap.get(numericClanId) || []) : [];
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
        const castles = this.castles || [];
        if (this._clanCastlesSource !== castles
            || this._clanCastlesSize !== castles.length
            || this._clanCastlesVersion !== version) {
            this._clanCastlesMap = new Map();
            for (const castle of castles) {
                const ownerClanId = Number(castle.ownerClan);
                // ownerClanはモデル上numberだが、復元境界の文字列数値も旧Number比較と同じ集合へ入れる。
                // NaN等の不正値を「0」に丸めると浪人/無所属城へ候補が広がるので索引しない。
                if (!Number.isFinite(ownerClanId)) continue;
                let owned = this._clanCastlesMap.get(ownerClanId);
                if (!owned) {
                    owned = [];
                    this._clanCastlesMap.set(ownerClanId, owned);
                }
                owned.push(castle);
            }
            this._clanCastlesSource = castles;
            this._clanCastlesSize = castles.length;
            this._clanCastlesVersion = version;
        }
        const numericClanId = Number(clanId);
        return Number.isFinite(numericClanId) ? (this._clanCastlesMap.get(numericClanId) || []) : [];
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
    
    // ★勢力の表示名を更新します（同名被りの回避）。
    // 大名家と諸勢力を同じ名前空間で扱いますが、同名時の無修飾名は必ず大名家を優先します。
    // 諸勢力はデータ上の name / yomi を変更せず、displayName / displayYomi だけを更新します。
    updateClanDisplayNames() {
        if (!this.provinces) return;

        const activeClans = (this.clans || []).filter(clan => clan && clan.id !== 0 && !clan.isDestroyed);
        const activeKunishus = this.kunishuSystem && typeof this.kunishuSystem.getAliveKunishus === 'function'
            ? this.kunishuSystem.getAliveKunishus()
            : [];

        // 大名家は従来どおり、現在の当主姓を表示名の正本にします。
        activeClans.forEach(clan => {
            const leader = this.getBusho(clan.leaderId);
            if (leader && leader.familyName) {
                clan.baseName = leader.familyName + "家";
                clan.baseYomi = (leader.familyYomi || "") + "け";
            } else {
                if (!clan.baseName) clan.baseName = clan.name;
                if (!clan.baseYomi) clan.baseYomi = clan.yomi;
            }
            clan.name = clan.baseName;
            clan.yomi = clan.baseYomi;
        });

        // 諸勢力はシナリオデータ名を正本のまま保持し、表示キャッシュだけを初期化します。
        activeKunishus.forEach(kunishu => {
            const baseName = typeof kunishu.getBaseName === 'function' ? kunishu.getBaseName(this) : (kunishu.name || '諸勢力');
            const baseYomi = typeof kunishu.getBaseYomi === 'function' ? kunishu.getBaseYomi(this) : (kunishu.yomi || '');
            kunishu.baseName = baseName;
            kunishu.baseYomi = baseYomi;
            kunishu.displayName = baseName;
            kunishu.displayYomi = baseYomi;
        });

        const getLocation = entry => {
            let castle = null;
            if (entry.type === 'clan') {
                const leader = this.getBusho(entry.force.leaderId);
                if (leader) castle = this.getCastle(leader.castleId);
            } else {
                castle = this.getCastle(entry.force.castleId);
            }
            const province = castle ? this.getProvince(castle.provinceId) : null;
            return { castle, province, provinceId: castle ? Number(castle.provinceId) : 0 };
        };

        const setDisplay = (entry, name, yomi) => {
            if (entry.type === 'clan') {
                entry.force.name = name;
                entry.force.yomi = yomi;
            } else {
                entry.force.displayName = name;
                entry.force.displayYomi = yomi;
            }
            entry.displayName = name;
            entry.displayYomi = yomi;
        };

        // 共通データの「備考」に移した識別用名称は、同名解消が必要な時だけ使います。
        // 「能島村上家。瀬戸内水軍」のような補足付き備考は先頭文だけを識別名候補にします。
        const getDisplayHint = entry => {
            if (entry.type !== 'clan') return '';
            const raw = String(entry.force.displayHint || entry.force.note || '').trim();
            if (!raw) return '';
            return raw.split(/[。\r\n]/, 1)[0].trim();
        };

        const entries = [];
        activeClans.forEach(clan => entries.push({
            type: 'clan', force: clan, baseName: clan.baseName || clan.name || '', baseYomi: clan.baseYomi || clan.yomi || ''
        }));
        activeKunishus.forEach(kunishu => entries.push({
            type: 'kunishu', force: kunishu, baseName: kunishu.baseName || kunishu.name || '諸勢力', baseYomi: kunishu.baseYomi || kunishu.yomi || ''
        }));

        const groups = new Map();
        for (const entry of entries) {
            if (!groups.has(entry.baseName)) groups.set(entry.baseName, []);
            groups.get(entry.baseName).push(entry);
        }

        for (const group of groups.values()) {
            if (group.length <= 1) continue;

            // 大名家が1つでも存在する同名グループでは、無修飾名の優先権は必ず大名家側にあります。
            // 大名家同士の優先順位だけ、従来どおり威信→IDで決めます。
            const clanEntries = group.filter(entry => entry.type === 'clan');
            clanEntries.sort((a, b) => {
                const prestigeDiff = Number(b.force.daimyoPrestige || 0) - Number(a.force.daimyoPrestige || 0);
                if (prestigeDiff !== 0) return prestigeDiff;
                return Number(a.force.id) - Number(b.force.id);
            });

            const locationByEntry = new Map(group.map(entry => [entry, getLocation(entry)]));

            // 従来特例：同じ国に同名勢力がいる時、居城名と家名が一致する大名家は本筋として優先。
            const matchingClanIndex = clanEntries.findIndex(entry => {
                const loc = locationByEntry.get(entry);
                if (!loc || !loc.castle) return false;
                const hasSameProvinceForce = group.some(other => {
                    if (other === entry) return false;
                    const otherLoc = locationByEntry.get(other);
                    return otherLoc && otherLoc.provinceId === loc.provinceId;
                });
                if (!hasSameProvinceForce) return false;
                const castleBase = loc.castle.shortName;
                const clanBase = entry.baseName.replace(/家$/, "");
                return !!castleBase && castleBase === clanBase;
            });
            if (matchingClanIndex > 0) {
                const match = clanEntries.splice(matchingClanIndex, 1)[0];
                clanEntries.unshift(match);
            }

            const kunishuEntries = group
                .filter(entry => entry.type === 'kunishu')
                .sort((a, b) => Number(a.force.id) - Number(b.force.id));
            const ordered = clanEntries.concat(kunishuEntries);

            // 大名家がある時だけ、その最優先大名家1つが本来名を保持します。
            // 諸勢力しかない同名グループは威信で優劣を付けられないため、全勢力へ識別語を付けます。
            const primaryClan = clanEntries.length > 0 ? clanEntries[0] : null;
            const targets = primaryClan ? ordered.filter(entry => entry !== primaryClan) : ordered.slice();

            for (const entry of targets) {
                const loc = locationByEntry.get(entry);
                if (!loc || !loc.castle) continue;

                const hasSameProvinceForce = ordered.some(other => {
                    if (other === entry) return false;
                    const otherLoc = locationByEntry.get(other);
                    return otherLoc && otherLoc.provinceId === loc.provinceId;
                });

                const castleName = loc.castle.shortName || '';
                const castleYomi = loc.castle.shortYomi || '';
                const provName = loc.province ? (loc.province.shortName || '') : '';
                const provYomi = loc.province ? (loc.province.shortYomi || '') : '';
                let autoName = '';
                let autoYomi = '';
                if (hasSameProvinceForce && castleName) {
                    autoName = castleName + entry.baseName;
                    autoYomi = castleYomi + entry.baseYomi;
                } else if (provName) {
                    autoName = provName + entry.baseName;
                    autoYomi = provYomi + entry.baseYomi;
                } else if (castleName) {
                    autoName = castleName + entry.baseName;
                    autoYomi = castleYomi + entry.baseYomi;
                }

                // 大名家の管理表に識別用備考があれば名称だけそれを優先します。
                // 読みは位置情報から安全に生成できる場合の従来値を使い、備考から無理に推測しません。
                const hint = getDisplayHint(entry);
                if (hint) setDisplay(entry, hint, autoYomi || entry.baseYomi);
                else if (autoName) setDisplay(entry, autoName, autoYomi);
            }

            // 位置情報・備考を使っても衝突が残った場合だけ、城名へ寄せ直します。
            // それでも同一城の同名諸勢力が残る極端なケースはIDを最終識別子として付け、UI上の同名を残しません。
            const resolveRemainingDuplicates = () => {
                const byName = new Map();
                for (const entry of ordered) {
                    const currentName = entry.type === 'clan' ? entry.force.name : entry.force.displayName;
                    if (!byName.has(currentName)) byName.set(currentName, []);
                    byName.get(currentName).push(entry);
                }
                for (const sameNameEntries of byName.values()) {
                    if (sameNameEntries.length <= 1) continue;
                    for (const entry of sameNameEntries) {
                        if (primaryClan && entry === primaryClan) continue;
                        const loc = locationByEntry.get(entry);
                        if (!loc || !loc.castle || !loc.castle.shortName) continue;
                        setDisplay(entry, loc.castle.shortName + entry.baseName, (loc.castle.shortYomi || '') + entry.baseYomi);
                    }
                }
            };
            resolveRemainingDuplicates();

            const finalCounts = new Map();
            for (const entry of ordered) {
                const currentName = entry.type === 'clan' ? entry.force.name : entry.force.displayName;
                finalCounts.set(currentName, (finalCounts.get(currentName) || 0) + 1);
            }
            for (const entry of ordered) {
                if (primaryClan && entry === primaryClan) continue;
                const currentName = entry.type === 'clan' ? entry.force.name : entry.force.displayName;
                if ((finalCounts.get(currentName) || 0) <= 1) continue;
                const suffix = entry.type === 'kunishu' ? `（諸勢力${entry.force.id}）` : `（勢力${entry.force.id}）`;
                setDisplay(entry, currentName + suffix, entry.displayYomi || entry.baseYomi);
            }
        }
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
        const turnManager = this.turnManager;
        const watchFlowGeneration = turnManager && typeof turnManager.captureTurnFlowGeneration === 'function'
            ? turnManager.captureTurnFlowGeneration()
            : null;
        const expectedIndex = Number(this.currentIndex);
        const expectedCastle = this.turnQueue && Number.isInteger(expectedIndex)
            ? this.turnQueue[expectedIndex] || null
            : null;

        this._prepareFreshWatchMode(previousPlayerClanId);
        const prepare = this.aiOperationManager && typeof this.aiOperationManager.onClanBecameAIControlled === 'function'
            ? this.aiOperationManager.onClanBecameAIControlled(previousPlayerClanId)
            : null;
        Promise.resolve(prepare)
            .catch(error => console.error('観戦開始時のAI作戦準備に失敗しました:', error))
            .finally(() => {
                // AI作戦準備は大勢力では協調yieldを挟む。待機中にロード／タイトル復帰が入った場合、
                // 準備完了後の旧processTurnを新シナリオへ持ち込まない。
                if (this.phase !== 'game' || this.isRestoringSave || !this.isWatchMode) return;
                if (watchFlowGeneration !== null
                    && turnManager && typeof turnManager.isTurnFlowGenerationCurrent === 'function'
                    && !turnManager.isTurnFlowGenerationCurrent(watchFlowGeneration)) return;
                if (Number.isInteger(expectedIndex) && Number(this.currentIndex) !== expectedIndex) return;
                if (expectedCastle && this.turnQueue && this.turnQueue[this.currentIndex] !== expectedCastle) return;

                if (turnManager && typeof turnManager.scheduleTurnFlowContinuation === 'function') {
                    turnManager.scheduleTurnFlowContinuation(() => this.processTurn(), 0, {
                        expectedIndex: Number.isInteger(expectedIndex) ? expectedIndex : null,
                        expectedCastle
                    });
                } else {
                    this.processTurn();
                }
            });
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
        }, {
            okText: '観戦をやめる',
            okClass: 'btn-primary',
            cancelText: '観戦を続ける',
            closeBeforeOk: true,
            closeBeforeCancel: true
        });
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

    // 観戦復帰で止めていたターンを再開する予約もTurnManagerの寿命管理へ統合します。
    // 0msでもロード／タイトル復帰と競合し得るため、生のsetTimeoutからprocessTurnを呼びません。
    _scheduleWatchTurnResume() {
        const resume = () => this.processTurn();
        const turnManager = this.turnManager;
        if (turnManager && typeof turnManager.scheduleTurnFlowContinuation === 'function') {
            const expectedIndex = Number(this.currentIndex);
            const expectedCastle = this.turnQueue && Number.isInteger(expectedIndex)
                ? this.turnQueue[expectedIndex] || null
                : null;
            return turnManager.scheduleTurnFlowContinuation(resume, 0, {
                expectedIndex: Number.isInteger(expectedIndex) ? expectedIndex : null,
                expectedCastle
            });
        }
        return setTimeout(() => {
            if (this.phase !== 'game' || this.isRestoringSave) return;
            resume();
        }, 0);
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
        this._scheduleWatchTurnResume();
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
                this._scheduleWatchTurnResume();
            }, () => {
                this.cancelQueuedWatchReturn();
            }, {
                okText: '再開する',
                okClass: 'btn-primary',
                cancelText: '観戦を続ける',
                closeBeforeOk: true,
                closeBeforeCancel: true
            });
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
