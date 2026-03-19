/**
 * common_events.js
 * イベントの書き方の見本です。
 */

// 共通の引き出しを用意して、そこにこのイベントを入れます
window.GameEvents = window.GameEvents || [];

window.GameEvents.push({
    id: "typhoon_event_01",
    timing: "endMonth", // 'startMonth'（月初）か 'endMonth'（月末）を指定します
    isOneTime: false,   // true にすると、1回発生したら二度と発生しなくなります
    
    // イベントが発生するかどうかの条件をチェックします
    checkCondition: function(game) {
        // 例：毎年9月の月末（10月になる直前）に10%の確率で発生
        if (game.month === 9) {
            return Math.random() < 0.1;
        }
        return false;
    },
    
    // 条件を満たした時に実行される中身です
    execute: async function(game) {
        // プレイヤーにダイアログで知らせます
        await game.ui.showDialogAsync("【台風発生】\n秋の嵐が吹き荒れました……。", false, 0);
        
        // ここに被害の処理（兵糧が減る、防御が下がるなど）を自由に書くことができます
        // 例: game.castles.forEach(c => { c.rice = Math.floor(c.rice * 0.8); });
    }
});