/**
 * common_events.js
 * イベントの書き方の見本です。
 */

// 共通の引き出しを用意して、そこにこのイベントを入れます
window.GameEvents = window.GameEvents || [];

window.GameEvents.push({
    id: "typhoon_event_01",
    timing: "endMonth_after", // 月末の最後に実行します
    isOneTime: false,         // true にすると、1回発生したら二度と発生しなくなります
    
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

// ==========================================
// ★ 民忠低下イベント（月初の収入処理が終わった後に実行！）
// ==========================================
window.GameEvents.push({
    id: "peoples_loyalty_decrease_monthly",
    timing: "startMonth_after", // ★ 月初（収入処理の後）に指定しました！
    isOneTime: false,
    
    checkCondition: function(game) {
        return true; // 毎月必ず発生させたいので、いつでもOK
    },
    
    execute: async function(game) {
        // 全てのお城を順番に見ていきます
        game.castles.forEach(c => {
            // 空き城（ownerClan === 0）ではない時だけ
            if (c.ownerClan !== 0) {
                // 民忠を1減らします（0未満にはならないように守ります）
                c.peoplesLoyalty = Math.max(0, c.peoplesLoyalty - 1);
            }
        });
    }
});