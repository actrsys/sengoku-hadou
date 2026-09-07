/**
 * event_manager.js
 * ゲーム内の月初・月末イベントを管理するシステムです。
 */

window.GameEvents = window.GameEvents || [];


// 月初/月末・戦闘イベントも通常ターン進行の一部なので、await後にロード／タイトル復帰を跨がない。
// EventManager自身がTurnManagerの世代を読むだけにし、世代更新責務はTurnManagerへ残す。
window.EventFlowGuard = window.EventFlowGuard || {
    capture(game) {
        const tm = game && game.turnManager;
        if (tm && typeof tm.captureTurnFlowGeneration === 'function') {
            return tm.captureTurnFlowGeneration();
        }
        return null;
    },
    isCurrent(game, generation) {
        if (!game) return false;
        const tm = game.turnManager;
        if (generation !== null && generation !== undefined
            && tm && typeof tm.isTurnFlowGenerationCurrent === 'function') {
            return tm.isTurnFlowGenerationCurrent(generation);
        }
        if (game.isRestoringSave) return false;
        return typeof game.phase !== 'string' || game.phase === 'game';
    },
    assertCurrent(game, generation) {
        if (this.isCurrent(game, generation)) return;
        const error = new Error('イベント実行中にシナリオ寿命が切り替わりました');
        error.code = 'EVENT_FLOW_ABORTED';
        throw error;
    },
    isAbortError(error) {
        return !!error && error.code === 'EVENT_FLOW_ABORTED';
    },
    _createAbortError() {
        const error = new Error('イベント実行中にシナリオ寿命が切り替わりました');
        error.code = 'EVENT_FLOW_ABORTED';
        return error;
    },
    async _awaitWithAbort(game, generation, pending) {
        this.assertCurrent(game, generation);
        const tm = game && game.turnManager;
        if (!tm || typeof tm.subscribeTurnFlowAbort !== 'function') {
            const result = await pending;
            this.assertCurrent(game, generation);
            return result;
        }

        return await new Promise((resolve, reject) => {
            let settled = false;
            let unsubscribe = () => {};
            const settleAbort = () => {
                if (settled) return;
                settled = true;
                unsubscribe();
                reject(this._createAbortError());
            };
            unsubscribe = tm.subscribeTurnFlowAbort(generation, settleAbort);

            Promise.resolve(pending).then(result => {
                if (settled) return;
                settled = true;
                unsubscribe();
                try {
                    this.assertCurrent(game, generation);
                    resolve(result);
                } catch (error) {
                    reject(error);
                }
            }, error => {
                if (settled) return;
                settled = true;
                unsubscribe();
                reject(error);
            });
        });
    },
    async showDialogAsync(game, ...args) {
        const generation = this.capture(game);
        return this._awaitWithAbort(game, generation, game.ui.showDialogAsync(...args));
    },
    async waitForChoice(game, registerChoice) {
        const generation = this.capture(game);
        this.assertCurrent(game, generation);
        const pending = new Promise(resolve => registerChoice(resolve));
        return this._awaitWithAbort(game, generation, pending);
    },
    async focusMapOnCastle(game, castleId, options = {}) {
        const generation = this.capture(game);
        this.assertCurrent(game, generation);
        const result = await game.ui.focusMapOnCastle(castleId, options);
        this.assertCurrent(game, generation);
        return result;
    }
};

class EventManager {
    constructor(game) {
        this.game = game;
        // イベントを入れるための引き出しを用意します
        this.events = {
            game_start: [],        // ゲーム開始直後の特別な引き出し
            startMonth_before: [], // 月初の最初（収入などの前）
            startMonth_after: [],  // 月初の最後（収入などの後）
            endMonth_before: [],   // 月末の最初（派閥や寿命などの前）
            endMonth_after: [],    // 月末の最後（時間を進める直前）
            before_battle: [],     // 戦闘開始直前の特別な引き出し
            
            // ★ここから追加：戦争全体用の引き出し
            before_war: [],           // 戦争：開始処理前
            start_war: [],            // 戦争：開始処理後
            before_war_end: [],       // 戦争：終了処理前
            after_war: [],            // 戦争：終了処理後

            // ★ここから追加：野戦用の引き出し
            before_field_war: [],     // 野戦：戦争開始前
            start_field_war: [],      // 野戦：戦闘開始後
            before_field_war_end: [], // 野戦：戦闘終了前
            after_field_war: [],      // 野戦：戦闘終了後

            // ★ここから追加：籠城戦用の引き出し
            before_siege_war: [],     // 籠城戦：戦争開始前
            start_siege_war: [],      // 籠城戦：戦闘開始後
            before_siege_war_end: [], // 籠城戦：戦闘終了前
            after_siege_war: [],      // 籠城戦：戦闘終了後
            
            // ★ここから追加：コマンド用の引き出し
            before_command: [],       // コマンド実行直前
            after_command: [],        // コマンド実行直後

            interview_after_greeting: [], // 面談：挨拶直後の特殊コモンイベント

            after_battle_blink: [], // 地図の点滅が終わった直後の特別な引き出し
            busho_death: []         // 武将が死亡した瞬間に呼ばれる特別な引き出し
        };
        
        // 常駐イベントは通常イベントとは別の引き出しで管理します。
        // EventManager は「条件が成立した/外れた」という状態遷移だけを担当し、
        // 実際の効果内容は各イベントファイルと専門Systemへ委譲します。
        this.residentEvents = {};
        Object.keys(this.events).forEach(timing => {
            this.residentEvents[timing] = [];
        });

        // 途中年代シナリオの開始前補正対象。歴史イベント定義側が historicalDate を持つ場合だけ登録します。
        // シナリオ開始月より前に史実上終了しているイベントは、画面へ見せる前に無演出で解決します。
        this.scenarioStartHistoricalEvents = [];

        window.GameEvents.forEach(ev => this.registerEvent(ev));
    }

    _normalizeTiming(timing) {
        if (timing === 'startMonth') return 'startMonth_before';
        if (timing === 'endMonth') return 'endMonth_after';
        return timing;
    }

    registerEvent(eventData) {
        if (eventData && eventData.id && eventData.id.startsWith('historical_') && eventData.historicalDate) {
            this.scenarioStartHistoricalEvents.push(eventData);
        }

        // 常駐イベントだけは複数タイミングを監視できます。
        // 例：月初に適用しつつ、寿命判定直前の月末にも再確認する。
        if (eventData && eventData.type === 'resident') {
            const requestedTimings = Array.isArray(eventData.timings)
                ? eventData.timings
                : [eventData.timing];
            requestedTimings.forEach(rawTiming => {
                const timing = this._normalizeTiming(rawTiming);
                if (timing && this.residentEvents[timing]) {
                    this.residentEvents[timing].push(eventData);
                }
            });
            return;
        }

        const t = this._normalizeTiming(eventData.timing);
        // 指定された引き出しがあれば、そこに入れます
        if (this.events[t]) {
            this.events[t].push(eventData);
        }
    }

    _isScenarioStartAfterHistoricalDate(historicalDate) {
        if (!historicalDate) return false;
        const targetYear = Number(historicalDate.year);
        const targetMonth = Number(historicalDate.month || 1);
        if (!Number.isFinite(targetYear) || !Number.isFinite(targetMonth)) return false;

        const startYear = Number(this.game && (this.game.gameStartYear ?? this.game.year));
        const startMonth = Number(this.game && (this.game.gameStartMonth ?? this.game.month));
        if (!Number.isFinite(startYear) || !Number.isFinite(startMonth)) return false;

        // 同じ月から始めるシナリオでは、その月のイベントとして通常発火できる余地を残します。
        // 「史実月を過ぎたシナリオ」だけを開始前に消化済みへします。
        return startYear > targetYear || (startYear === targetYear && startMonth > targetMonth);
    }

    _isScenarioStartAtOrAfterDate(date) {
        if (!date) return false;
        const targetYear = Number(date.year);
        const targetMonth = Number(date.month || 1);
        if (!Number.isFinite(targetYear) || !Number.isFinite(targetMonth)) return false;

        const startYear = Number(this.game && (this.game.gameStartYear ?? this.game.year));
        const startMonth = Number(this.game && (this.game.gameStartMonth ?? this.game.month));
        if (!Number.isFinite(startYear) || !Number.isFinite(startMonth)) return false;

        return startYear > targetYear || (startYear === targetYear && startMonth >= targetMonth);
    }

    _removeOneTimeEventFromQueues(eventId) {
        if (!eventId) return;
        Object.keys(this.events).forEach(timing => {
            const list = this.events[timing];
            if (!Array.isArray(list) || list.length === 0) return;
            this.events[timing] = list.filter(ev => !ev || ev.id !== eventId);
        });
    }

    /**
     * 途中年代から始める新規シナリオ専用の「開始前史実解決」です。
     * シナリオ選択後のロード画面内で呼び、勢力選択画面などが最初に表示される前に完了させます。
     *
     * - historicalDate を開始月がすでに過ぎている一度きり歴史イベントを対象にする。
     * - イベント本編の execute() は呼ばず、演出・ログ・選択肢を再生しない。
     * - 必要な派生状態だけ applyScenarioStartState() で補正する。
     * - 補正成功後に flags[eventId] = true とし、通常進行で再発火させない。
     * - 「歴史イベントOFF」は未来のスクリプト発火設定であり、過去のシナリオ初期状態には適用しない。
     */
    async applyScenarioStartHistoricalSettlements(context = null) {
        const targets = Array.isArray(this.scenarioStartHistoricalEvents)
            ? this.scenarioStartHistoricalEvents
            : [];
        if (targets.length === 0) return [];

        this.game.flags = this.game.flags || {};
        const settledIds = [];

        for (const ev of targets) {
            if (!ev || !ev.id || ev.isOneTime !== true) continue;
            if (this.game.flags[ev.id]) continue;
            const shouldSettleAtScenarioStart = ev.scenarioStartSettlementDate
                ? this._isScenarioStartAtOrAfterDate(ev.scenarioStartSettlementDate)
                : this._isScenarioStartAfterHistoricalDate(ev.historicalDate);
            if (!shouldSettleAtScenarioStart) continue;

            try {
                if (typeof ev.applyScenarioStartState === 'function') {
                    await ev.applyScenarioStartState(this.game, context);
                }

                // 状態補正が正常終了してから消化済みにする。途中エラー時に未補正のまま封印しない。
                this.game.flags[ev.id] = true;
                this._removeOneTimeEventFromQueues(ev.id);
                settledIds.push(ev.id);

                if (this.game && typeof this.game.writeSystemDiagnostic === 'function') {
                    this.game.writeSystemDiagnostic(`scenario_start_history:settled:${ev.id}`);
                }
            } catch (error) {
                if (ev.scenarioStartSettlementRequired === true) {
                    throw new Error(`必須のシナリオ開始前歴史イベント補正 ${ev.id} に失敗しました: ${error && error.message ? error.message : error}`);
                }
                console.warn(`シナリオ開始前の歴史イベント補正 ${ev.id} に失敗したため、未発生のまま残します:`, error);
            }
        }

        return settledIds;
    }

    /**
     * 常駐イベントの状態変化だけを監視します。
     * false -> true で onEnter、true -> false で onExit を1回だけ実行します。
     * 状態は game.flags に保存してセーブ/ロード後も復元します。
     * 歴史イベントをOFFにした場合、historical_ 常駐イベントは条件を評価せず false へ遷移させ、
     * 適用中の常駐効果を onExit で解除します。再ON後は次の登録タイミングで条件を再評価します。
     */
    async processResidentEvents(timing, context = null, isHistoricalOff = false, flowGeneration = undefined) {
        const targetEvents = this.residentEvents[timing];
        if (!targetEvents || targetEvents.length === 0) return true;
        const generation = flowGeneration === undefined ? window.EventFlowGuard.capture(this.game) : flowGeneration;
        const isCurrentFlow = () => window.EventFlowGuard.isCurrent(this.game, generation);
        if (!isCurrentFlow()) return false;

        this.game.flags = this.game.flags || {};
        const stateBook = this.game.flags.__residentEventStates || (this.game.flags.__residentEventStates = {});

        for (const ev of targetEvents) {
            if (!isCurrentFlow()) return false;
            const isHistorical = ev.id && ev.id.startsWith('historical_');
            const saved = stateBook[ev.id];
            const wasActive = saved === true || (saved && saved.active === true);
            let isActive = false;

            // 歴史イベントOFF中は、適用済みの historical_ 常駐効果を解除する。
            // 条件が成立していてもOFF設定を優先し、再ONまでは再適用しない。
            if (isHistoricalOff && isHistorical) {
                isActive = false;
            } else {
                try {
                    isActive = !!ev.checkCondition(this.game, context);
                } catch (error) {
                    console.warn(`常駐イベント ${ev.id} の条件判定中にエラーが出ましたが、進行を継続します:`, error);
                    continue;
                }
            }

            if (isActive === wasActive) continue;

            try {
                if (this.game && typeof this.game.writeSystemDiagnostic === 'function') {
                    this.game.writeSystemDiagnostic(`resident_event:${timing}:${ev.id}:${isActive ? 'enter' : 'exit'}`);
                }

                if (isActive) {
                    if (typeof ev.onEnter === 'function') {
                        await ev.onEnter(this.game, context);
                    }
                } else if (typeof ev.onExit === 'function') {
                    await ev.onExit(this.game, context);
                }

                if (!isCurrentFlow()) return false;
                // 効果の適用/解除が正常終了し、同じシナリオ寿命であることを確認してから状態を保存します。
                stateBook[ev.id] = { active: isActive };
            } catch (error) {
                if (window.EventFlowGuard.isAbortError(error) || !isCurrentFlow()) return false;
                console.warn(`常駐イベント ${ev.id} の状態更新中にエラーが出ましたが、進行を継続します:`, error);
            }
        }
        return isCurrentFlow();
    }

    /**
     * 設定画面で歴史イベントをOFFにした瞬間、現在適用中の歴史常駐効果だけを解除します。
     * ONへの切替では即時発火させず、各イベントが登録した次のタイミングで条件を再評価します。
     */
    async onHistoricalEventSettingChanged(enabled, context = null) {
        if (enabled !== false) return;

        this.game.flags = this.game.flags || {};
        const stateBook = this.game.flags.__residentEventStates || (this.game.flags.__residentEventStates = {});
        const seen = new Set();

        for (const events of Object.values(this.residentEvents)) {
            for (const ev of events || []) {
                if (!ev || !ev.id || !ev.id.startsWith('historical_') || seen.has(ev.id)) continue;
                seen.add(ev.id);

                const saved = stateBook[ev.id];
                const wasActive = saved === true || (saved && saved.active === true);
                if (!wasActive) continue;

                try {
                    if (typeof ev.onExit === 'function') await ev.onExit(this.game, context);
                    stateBook[ev.id] = { active: false };
                    if (this.game && typeof this.game.writeSystemDiagnostic === 'function') {
                        this.game.writeSystemDiagnostic(`resident_event:setting_off:${ev.id}:exit`);
                    }
                } catch (error) {
                    console.warn(`常駐イベント ${ev.id} のOFF時解除中にエラーが出ましたが、進行を継続します:`, error);
                }
            }
        }
    }

    /**
     * 面談の挨拶直後に成立するコモンイベントを最大1件だけ実行します。
     * 面談は専用オーバーレイ内で進行するため、通常 processEvents() の画面更新は行いません。
     * 何も成立しなければ false を返し、InterviewSystem が通常メニューへ進みます。
     */
    async processInterviewEvent(context = null) {
        const timing = 'interview_after_greeting';
        const targetEvents = this.events[timing] || [];
        if (targetEvents.length === 0) return false;

        this.game.flags = this.game.flags || {};
        const isHistoricalOff = (window.UserSettings && window.UserSettings.historicalEvent === false);

        for (const ev of targetEvents) {
            const isHistorical = !!(ev.id && ev.id.startsWith('historical_'));
            if (isHistoricalOff && isHistorical) continue;
            if (ev.isOneTime && this.game.flags[ev.id]) continue;

            let matched = false;
            try {
                matched = !!ev.checkCondition(this.game, context);
            } catch (error) {
                console.warn(`面談イベント ${ev.id} の条件判定中にエラーが出ましたが、面談を継続します:`, error);
                continue;
            }
            if (!matched) continue;

            try {
                if (this.game && typeof this.game.writeSystemDiagnostic === 'function') {
                    this.game.writeSystemDiagnostic(`event:${timing}:${ev.id}:execute`);
                }
                await ev.execute(this.game, context);
                if (ev.isOneTime) this.game.flags[ev.id] = true;
                if (this.game && typeof this.game.writeSystemDiagnostic === 'function') {
                    this.game.writeSystemDiagnostic(`event:${timing}:${ev.id}:done`);
                }
                return true;
            } catch (error) {
                if (window.EventFlowGuard.isAbortError(error)) return false;
                console.warn(`面談イベント ${ev.id} の実行中にエラーが出ましたが、通常面談へ戻します:`, error);
                return false;
            }
        }
        return false;
    }

    // 指定したタイミング（引き出し）のイベントをまとめて実行する魔法です
    async processEvents(timing, context = null) { 
        const targetEvents = this.events[timing];
        if (!targetEvents) return;
        const flowGeneration = window.EventFlowGuard.capture(this.game);
        const isCurrentFlow = () => window.EventFlowGuard.isCurrent(this.game, flowGeneration);
        if (!isCurrentFlow()) return;

        // ゲームのセーブデータに残る「スタンプ帳（flags）」を準備します
        this.game.flags = this.game.flags || {};

        // 設定で「歴史イベントが発生しない」になっているか確認します
        const isHistoricalOff = (window.UserSettings && window.UserSettings.historicalEvent === false);

        // 常駐イベントは通常イベントとは別枠で先に同期します。
        // 常駐イベントの状態変化は「その月に起きた歴史イベント1件」には数えません。
        if (!await this.processResidentEvents(timing, context, isHistoricalOff, flowGeneration)) return;
        if (!isCurrentFlow()) return;

        // ★追加：このタイミングで歴史イベントがすでに起きたかをメモする変数です
        let historicalEventOccurred = false;
        // ★追加：お片付け（画面更新）が必要かどうかをメモするシールを用意します
        let needRefreshScreen = false;

        for (const ev of targetEvents) {
            const isHistorical = ev.id && ev.id.startsWith("historical_");

            // もし設定がオフで、かつ歴史イベントなら、このイベントは無視します！
            if (isHistoricalOff && isHistorical) {
                continue;
            }

            // ★追加：「ゲーム開始時」以外で、すでにこのタイミングで歴史イベントが起きていたら、他の歴史イベントはお休みにします
            if (timing !== 'game_start' && isHistorical && historicalEventOccurred) {
                continue;
            }

            // 一度きりイベント用のスタンプ帳を統一して扱います
            const gameFlags = this.game.flags || {};

            // GameManager自身のflagsを正本として、一度きりイベントの再実行を防ぎます。
            if (ev.isOneTime && gameFlags[ev.id]) {
                continue;
            }

            let matched = false;
            try {
                matched = !!ev.checkCondition(this.game, context);
            } catch (error) {
                // 常駐イベント・面談イベントと同じく、1イベントの条件判定失敗で
                // 月初/月末や戦闘進行そのものを止めない。
                console.warn(`イベント ${ev.id} の条件判定中にエラーが出ましたが、進行を継続します:`, error);
                continue;
            }

            if (matched) {

                // 「try〜catch」という安全装置で魔法を実行します
                try {
                    if (this.game && typeof this.game.writeSystemDiagnostic === 'function') {
                        this.game.writeSystemDiagnostic(`event:${timing}:${ev.id}:execute`);
                    }
                    await ev.execute(this.game, context);
                    if (!isCurrentFlow()) return;
                    if (this.game && typeof this.game.writeSystemDiagnostic === 'function') {
                        this.game.writeSystemDiagnostic(`event:${timing}:${ev.id}:done`);
                    }

                    // ★追加：イベントが実行されたので、後でお片付けをするためのシールを貼ります
                    needRefreshScreen = true;

                    // 一度きりイベントは「正常終了後」にスタンプを押します
                    if (ev.isOneTime) {
                        this.game.flags = this.game.flags || {};
                        this.game.flags[ev.id] = true;

                        // 今のゲーム中も処理を軽くするために配列から消しておきます
                        this.events[timing] = this.events[timing].filter(e => e.id !== ev.id);
                    }

                    // 歴史イベントが起きたことを記録します
                    if (isHistorical) {
                        historicalEventOccurred = true;
                    }

                } catch (error) {
                    if (window.EventFlowGuard.isAbortError(error) || !isCurrentFlow()) return;
                    // 裏側で透明なエラーが起きても、ゲームが止まらないようにしてここで受け止めます
                    console.warn(`イベント ${ev.id} の実行中にエラーが出ましたが、進行を継続します:`, error);
                }
            }
        }

        // ★追加：全てのイベントのチェックと実行が終わった後、お片付けシールが貼られていたら1回だけ画面を更新します
        if (!isCurrentFlow()) return;
        if (needRefreshScreen && timing !== 'game_start' && window.EventAction && window.EventAction.refreshScreen) {
            if (this.game && typeof this.game.writeSystemDiagnostic === 'function') {
                this.game.writeSystemDiagnostic(`event:${timing}:refresh`);
            }
            // event_managerの中では「this.game」という名前でゲームデータを管理しているので、それを渡します
            // ★Round10：段階更新が終わるまで待ちます。
            await window.EventAction.refreshScreen(this.game);
            if (!isCurrentFlow()) return;
            if (this.game && typeof this.game.writeSystemDiagnostic === 'function') {
                this.game.writeSystemDiagnostic(`event:${timing}:refresh_done`);
            }
        }
    }
}