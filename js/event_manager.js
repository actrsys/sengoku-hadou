/**
 * event_manager.js
 * ゲーム内の月初・月末イベントを管理するシステムです。
 */

window.GameEvents = window.GameEvents || [];

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

        window.GameEvents.forEach(ev => this.registerEvent(ev));
    }

    _normalizeTiming(timing) {
        if (timing === 'startMonth') return 'startMonth_before';
        if (timing === 'endMonth') return 'endMonth_after';
        return timing;
    }

    registerEvent(eventData) {
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

    /**
     * 常駐イベントの状態変化だけを監視します。
     * false -> true で onEnter、true -> false で onExit を1回だけ実行します。
     * 状態は game.flags に保存してセーブ/ロード後も復元します。
     * 歴史イベントをOFFにした場合、historical_ 常駐イベントは条件を評価せず false へ遷移させ、
     * 適用中の常駐効果を onExit で解除します。再ON後は次の登録タイミングで条件を再評価します。
     */
    async processResidentEvents(timing, context = null, isHistoricalOff = false) {
        const targetEvents = this.residentEvents[timing];
        if (!targetEvents || targetEvents.length === 0) return;

        this.game.flags = this.game.flags || {};
        const stateBook = this.game.flags.__residentEventStates || (this.game.flags.__residentEventStates = {});

        for (const ev of targetEvents) {
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

                // 効果の適用/解除が正常終了してから状態を保存します。
                stateBook[ev.id] = { active: isActive };
            } catch (error) {
                console.warn(`常駐イベント ${ev.id} の状態更新中にエラーが出ましたが、進行を継続します:`, error);
            }
        }
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

    // 指定したタイミング（引き出し）のイベントをまとめて実行する魔法です
    async processEvents(timing, context = null) { 
        const targetEvents = this.events[timing];
        if (!targetEvents) return;

        // ゲームのセーブデータに残る「スタンプ帳（flags）」を準備します
        this.game.flags = this.game.flags || {};

        // 設定で「歴史イベントが発生しない」になっているか確認します
        const isHistoricalOff = (window.UserSettings && window.UserSettings.historicalEvent === false);

        // 常駐イベントは通常イベントとは別枠で先に同期します。
        // 常駐イベントの状態変化は「その月に起きた歴史イベント1件」には数えません。
        await this.processResidentEvents(timing, context, isHistoricalOff);

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

            if (ev.checkCondition(this.game, context)) {

                // 「try〜catch」という安全装置で魔法を実行します
                try {
                    if (this.game && typeof this.game.writeSystemDiagnostic === 'function') {
                        this.game.writeSystemDiagnostic(`event:${timing}:${ev.id}:execute`);
                    }
                    await ev.execute(this.game, context);
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
                    // 裏側で透明なエラーが起きても、ゲームが止まらないようにしてここで受け止めます
                    console.warn(`イベント ${ev.id} の実行中にエラーが出ましたが、進行を継続します:`, error);
                }
            }
        }

        // ★追加：全てのイベントのチェックと実行が終わった後、お片付けシールが貼られていたら1回だけ画面を更新します
        if (needRefreshScreen && timing !== 'game_start' && window.EventAction && window.EventAction.refreshScreen) {
            if (this.game && typeof this.game.writeSystemDiagnostic === 'function') {
                this.game.writeSystemDiagnostic(`event:${timing}:refresh`);
            }
            // event_managerの中では「this.game」という名前でゲームデータを管理しているので、それを渡します
            // ★Round10：段階更新が終わるまで待ちます。
            await window.EventAction.refreshScreen(this.game);
            if (this.game && typeof this.game.writeSystemDiagnostic === 'function') {
                this.game.writeSystemDiagnostic(`event:${timing}:refresh_done`);
            }
        }
    }
}