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
            shogun_death: []       // 将軍が死亡した直後に呼ばれる特別な引き出し
        };
        
        window.GameEvents.forEach(ev => this.registerEvent(ev));
    }

    registerEvent(eventData) {
        const t = eventData.timing;
        // 指定された引き出しがあれば、そこに入れます
        if (this.events[t]) {
            this.events[t].push(eventData);
        } 
        // もし古い書き方（startMonth や endMonth）で書かれたイベントがあっても、自動で振り分けます
        else if (t === 'startMonth') {
            this.events['startMonth_before'].push(eventData);
        } else if (t === 'endMonth') {
            this.events['endMonth_after'].push(eventData);
        }
    }

    // 指定したタイミング（引き出し）のイベントをまとめて実行する魔法です
    async processEvents(timing, context = null) { 
        const targetEvents = this.events[timing];
        if (!targetEvents) return;

        // ゲームのセーブデータに残る「スタンプ帳（flags）」を準備します
        this.game.flags = this.game.flags || {};

        // 設定で「歴史イベントが発生しない」になっているか確認します
        const isHistoricalOff = (window.GameConfig && window.GameConfig.historicalEvent === false);

        for (const ev of targetEvents) {
            // もし設定がオフで、かつ歴史イベント（IDが "historical_" で始まる）なら、このイベントは無視します！
            if (isHistoricalOff && ev.id && ev.id.startsWith("historical_")) {
                continue;
            }

            // 一度きりのイベントで、かつ既にスタンプが押されているなら、条件確認すら飛ばします
            if (ev.isOneTime && this.game.flags[ev.id]) {
                continue;
            }

            if (ev.checkCondition(this.game, context)) {
                // ★修正：前回の誤った魔法を元に戻し、「一度きり（isOneTime）」のイベントだけを記録するように直します！
                // これで毎月起こる汎用イベントがスタンプ帳に刻まれてしまう不具合が直ります。
                if (ev.isOneTime) {
                    this.game.flags = this.game.flags || {};
                    this.game.flags[ev.id] = true;
                    
                    // さらに絶対にセーブデータに残すため、本物のゲーム本体にも念押しで記録します
                    if (window.GameApp) {
                        window.GameApp.flags = window.GameApp.flags || {};
                        window.GameApp.flags[ev.id] = true;
                    }
                }

                // 「try〜catch」という安全装置で魔法を実行します
                try {
                    await ev.execute(this.game, context);    
                } catch (error) {
                    // 裏側で透明なエラーが起きても、ゲームが止まらないようにしてここで受け止めます
                    console.warn(`イベント ${ev.id} の実行中にエラーが出ましたが、進行を継続します:`, error);
                }
                
                if (ev.isOneTime) {
                    // 今のゲーム中も処理を軽くするために配列から消しておきます
                    this.events[timing] = this.events[timing].filter(e => e.id !== ev.id);
                }
            }
        }
    }
}