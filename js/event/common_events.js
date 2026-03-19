/**
 * common_events.js
 * イベントの書き方の見本です。
 */

// 共通の引き出しを用意して、そこにこのイベントを入れます
window.GameEvents = window.GameEvents || [];

window.GameEvents.push({
    id: "typhoon_event_01",
    timing: "endMonth_after",
    isOneTime: false,
    
    // ①：イベントが発生するかどうかのチェックです！
    checkCondition: function(game) {
        // 0.000... 〜 0.999... の間のランダムな数字（サイコロ）を振ります
        const dice = Math.random();
        
        // 月によって、当たり（発生）になる確率を変えます
        if (game.month === 8 && dice < 0.10) return true; // 8月は10%
        if (game.month === 9 && dice < 0.30) return true; // 9月は30%
        if (game.month === 10 && dice < 0.03) return true; // 10月は3%
        if (game.month === 11 && dice < 0.01) return true; // 11月は1%
        
        // それ以外の月や、サイコロが外れた時は「発生しない（false）」にします
        return false;
    },
    
    // ②：台風が発生した時に実行される中身です！
    execute: async function(game) {
        // 【1】台風の基本の大きさを決めます（1〜10）
        // 真ん中が出やすくなるように、「0〜4のサイコロ」と「0〜5のサイコロ」を足して、最後に1を足します
        const baseScale = Math.floor(Math.random() * 5) + Math.floor(Math.random() * 6) + 1;
        
        // 【2】日本中のすべてのお城を一つずつ順番に見ていきます
        game.castles.forEach(castle => {
            // お城がどの地方（国）にあるか、地方のデータ帳（game.provinces）から探します
            const provinceData = game.provinces.find(p => p.id === castle.provinceId);
            
            // もしデータが見つからなかったり、台風確率が設定されていなければ、このお城は飛ばします
            if (!provinceData || !provinceData.typhoon) return;
            
            // 【3】この国に台風が直撃するかどうか、国の確率（typhoon）でサイコロを振ります！
            if (Math.random() < provinceData.typhoon) {
                
                // 直撃しました！国の被害規模を「-1、0、+1」のどれかランダムでズラします
                const shift = Math.floor(Math.random() * 3) - 1;
                let finalScale = baseScale + shift;
                
                // 規模が「0以下」や「11以上」にならないように、1〜10の間に閉じ込める魔法です
                finalScale = Math.max(1, Math.min(10, finalScale));
                
                // 【4】規模に合わせて、減らす割合（パーセント）を計算します
                // 石高と防御は、規模1につき3%減ります（規模10なら30%）
                const kokuDefDropPercent = finalScale * 0.03;
                
                // 今の数字から、計算した割合の分を引きます（Math.floorは端数を切り捨てる魔法です）
                castle.kokudaka = Math.floor(castle.kokudaka * (1.0 - kokuDefDropPercent));
                castle.defense = Math.floor(castle.defense * (1.0 - kokuDefDropPercent));
                
                // 規模が6以上の時だけ、兵士と人口も減ります！
                if (finalScale >= 6) {
                    // 兵士は規模6で4%、規模10で20%になるように計算します
                    const soldierDropPercent = (finalScale - 5) * 0.04;
                    // 人口は規模6で2%、規模10で10%になるように計算します
                    const popDropPercent = (finalScale - 5) * 0.02;
                    
                    castle.soldiers = Math.floor(castle.soldiers * (1.0 - soldierDropPercent));
                    castle.population = Math.floor(castle.population * (1.0 - popDropPercent));
                }
            }
        });
        
        // すべてのお城の計算が終わったら、プレイヤーにお知らせを出します
        await game.ui.showDialogAsync(`【台風発生】\n秋の嵐が吹き荒れ、各地に被害が出ました……。\n（今回の台風規模：${baseScale}）`, false, 0);
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