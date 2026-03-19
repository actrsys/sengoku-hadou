/**
 * event_manager.js
 * ゲーム内の月初・月末イベントを管理するシステムです。
 */

// イベントファイルが先に入れておいたデータを拾うための「共通の引き出し」を用意します
window.GameEvents = window.GameEvents || [];

class EventManager {
    constructor(game) {
        this.game = game;
        this.startMonthEvents = [];
        this.endMonthEvents = [];
        
        // 共通の引き出しに入っているイベントを、月初用と月末用に仕分けます
        window.GameEvents.forEach(ev => this.registerEvent(ev));
    }

    // イベントを登録する魔法です
    registerEvent(eventData) {
        if (eventData.timing === 'startMonth') {
            this.startMonthEvents.push(eventData);
        } else if (eventData.timing === 'endMonth') {
            this.endMonthEvents.push(eventData);
        }
    }

    // 月初に呼ばれる魔法
    async processStartMonthEvents() {
        for (const ev of this.startMonthEvents) {
            // 条件をクリアしているかチェックします
            if (ev.checkCondition(this.game)) {
                await ev.execute(this.game);
                
                // 1回きりのイベントなら、実行したあとにリストから消すなどの処理も可能です
                if (ev.isOneTime) {
                    this.startMonthEvents = this.startMonthEvents.filter(e => e.id !== ev.id);
                }
            }
        }
    }

    // 月末に呼ばれる魔法
    async processEndMonthEvents() {
        for (const ev of this.endMonthEvents) {
            if (ev.checkCondition(this.game)) {
                await ev.execute(this.game);
                
                if (ev.isOneTime) {
                    this.endMonthEvents = this.endMonthEvents.filter(e => e.id !== ev.id);
                }
            }
        }
    }
}