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
            endMonth_after: []     // 月末の最後（時間を進める直前）
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
    async processEvents(timing) {
        const targetEvents = this.events[timing];
        if (!targetEvents) return;

        for (const ev of targetEvents) {
            if (ev.checkCondition(this.game)) {
                await ev.execute(this.game);
                
                if (ev.isOneTime) {
                    this.events[timing] = this.events[timing].filter(e => e.id !== ev.id);
                }
            }
        }
    }
}