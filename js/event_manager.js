/**
 * event_manager.js
 * ゲーム内の月初・月末イベントを管理するシステムです。
 */

window.GameEvents = window.GameEvents || [];

class EventManager {
    constructor(game) {
        this.game = game;
        // 4つの引き出しを用意します
        this.events = {
            startMonth_before: [], // 月初の最初（収入などの前）
            startMonth_after: [],  // 月初の最後（収入などの後）
            endMonth_before: [],   // 月末の最初（派閥や寿命などの前）
            endMonth_after: [],    // 月末の最後（時間を進める直前）
            before_battle: [],     // 戦闘開始直前の特別な引き出し
            after_field_war: [],   // 野戦終了直後の特別な引き出し
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

        for (const ev of targetEvents) {
            // 一度きりのイベントで、かつ既にスタンプが押されているなら、条件確認すら飛ばします
            if (ev.isOneTime && this.game.flags[ev.id]) {
                continue;
            }

            if (ev.checkCondition(this.game, context)) { 
                // イベントを実行する「前」にスタンプを押します。
                // ★大修正：歴史イベントを作る時に「isOneTime: true」を書き忘れていても、
                // イベントの名前（id）さえあれば、絶対に本物のスタンプ帳に記録を残す最強の魔法にしました！
                if (ev.id) {
                    this.game.flags[ev.id] = true;
                    
                    // 念のため、本物のゲーム本体（GameApp）にも直接スタンプを刻み込みます
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