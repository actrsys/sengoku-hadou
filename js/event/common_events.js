/**
 * common_events.js
 * ゲーム内の共通イベント（毎月発生するものなど）を入れるファイルです。
 */

window.GameEvents = window.GameEvents || [];

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

// ==========================================
// ★ ９月の豊作・凶作イベント ＆ 兵糧収入処理
// ==========================================
window.GameEvents.push({
    id: "harvest_event_september",
    timing: "startMonth_after", // 月初の収入などのあとに実行します
    isOneTime: false,
    
    checkCondition: function(game) {
        // ９月になった時だけ、このイベントのスイッチを入れます
        return game.month === 9;
    },
    
    execute: async function(game) {
        // 全体の15%の確率で「豊作」か「凶作」のイベントが起きます（0.15より小さければ当たり）
        const isEventYear = Math.random() < 0.15;
        let eventType = null; // 何も起きなければ null のままです
        
        if (isEventYear) {
            // 当たった場合、さらに半々（50%）の確率で豊作か凶作かを決めます
            eventType = Math.random() < 0.5 ? '豊作' : '凶作';
        }

        // 影響を受ける国（provinceId）の出席番号をメモしておく箱を作ります
        let affectedProvinces = new Set();

        if (eventType) {
            // ① 日本中にあるすべての国の「出席番号（provinceId）」を集めます
            const allProvinceIds = [...new Set(game.castles.filter(c => c.provinceId > 0).map(c => c.provinceId))];
            
            // ② 国ごとに、0〜999のランダムな数字（サイコロ）を振ってメモします
            const provinceRands = allProvinceIds.map(pid => {
                return { id: pid, rand: Math.floor(Math.random() * 1000) };
            });
            
            // ③ サイコロの数字が大きい順に並べ替えます
            provinceRands.sort((a, b) => b.rand - a.rand);
            
            // ④ 上位３つの国を「候補」としてピックアップします
            const candidates = provinceRands.slice(0, 3);
            
            // ⑤ 候補になった国ごとに、30%（0.3）の確率で「発生成功！」の判定をします
            let successCandidates = candidates.filter(c => Math.random() < 0.3);
            
            // ⑥ もし３つともハズレてしまったら、一番サイコロの数字が大きかった国をムリヤリ成功にします
            // （同じ数字の国が複数あったら、一緒に成功にします）
            if (successCandidates.length === 0 && candidates.length > 0) {
                const maxRand = candidates[0].rand;
                successCandidates = candidates.filter(c => c.rand === maxRand);
            }

            // 成功した国の出席番号を、メモ箱（affectedProvinces）に入れます
            const startProvinceIds = successCandidates.map(c => c.id);
            startProvinceIds.forEach(pid => affectedProvinces.add(pid));

            // ⑦ ここから、隣の城へ伝染していくかどうかのチェックです！
            let queue = [];
            // まずはスタート地点の国にあるすべてのお城を、「距離０」として準備リストに入れます
            game.castles.forEach(c => {
                if (startProvinceIds.includes(c.provinceId)) {
                    queue.push({ castle: c, distance: 0 });
                }
            });

            // 何度も同じお城を調べないように、調べ終わったお城のIDをメモする箱です
            let visitedCastles = new Set();
            queue.forEach(q => visitedCastles.add(q.castle.id));

            // 準備リストが空っぽになるまで、伝染チェックを繰り返します
            while (queue.length > 0) {
                const current = queue.shift();
                const currentCastle = current.castle;
                const dist = current.distance;

                // 最大５つ先までしか伝染しないので、距離５に達したらそこでおしまいです
                if (dist >= 5) continue; 

                // ゲームの機能を使って、今いるお城と「道が繋がっている隣の城」を探します
                const neighbors = game.castles.filter(c => GameSystem.isAdjacent(currentCastle, c));

                for (let neighbor of neighbors) {
                    // まだ調べていないお城だったらチェックします
                    if (!visitedCastles.has(neighbor.id)) {
                        visitedCastles.add(neighbor.id); 
                        
                        // 20%（0.2）の確率で伝染成功！
                        if (Math.random() < 0.2) {
                            // 伝染したお城がある国の出席番号を、影響を受ける国のメモ箱に追加します
                            affectedProvinces.add(neighbor.provinceId);
                            // 成功したので、そのお城を「距離＋１」として準備リストに追加し、さらに奥へ伝染させます
                            queue.push({ castle: neighbor, distance: dist + 1 });
                        }
                    }
                }
            }
            
            // ⑧ もし１つでも影響を受ける国があったら、画面にお知らせを出します！
            if (affectedProvinces.size > 0 && game.ui) {
                // 影響を受ける国の出席番号から、国の名前（〇〇国）を探します
                const pNames = Array.from(affectedProvinces).map(pid => {
                    const p = game.provinces.find(prov => prov.id === pid);
                    return p ? p.province : "どこかの国";
                });
                
                // 同じ国の名前が何度も出ないように整理します
                const uniquePNames = [...new Set(pNames)];
                const msg = `${uniquePNames.join('、')} を中心とした地域で\n【${eventType}】となりました！`;
                
                // プレイヤーが「OK」を押すまで待ってくれるダイアログを出します
                await game.ui.showDialogAsync(msg, false, 0);
            }
        }

        // ⑨ 最後に、日本中のすべてのお城で「９月の兵糧収入」を計算します！
        // （イベントが起きなかった85%の年も、ここでお米が入ります）
        game.castles.forEach(c => {
            // 空き家（中立）のお城にはお米は入りません
            if (c.ownerClan === 0) return; 
            
            // 今まで game.js にあった、基本のお米の計算式です
            const baseRice = (c.kokudaka / 2) + c.peoplesLoyalty;
            let riceIncome = Math.floor(baseRice * window.MainParams.Economy.IncomeRiceRate);
            riceIncome = GameSystem.applyVariance(riceIncome, window.MainParams.Economy.IncomeFluctuation);
            
            // ★ もしイベントが起きていて、このお城の国が「影響を受ける国」に入っていたら…
            if (eventType && affectedProvinces.has(c.provinceId)) {
                if (eventType === '豊作') {
                    // 豊作ならお米が 1.5倍！
                    riceIncome = Math.floor(riceIncome * 1.5);
                } else if (eventType === '凶作') {
                    // 凶作ならお米が 半分（0.5倍）に…
                    riceIncome = Math.floor(riceIncome * 0.5);
                }
            }
            
            // 計算したお米をお城の蔵に入れます（上限は 99999 です）
            c.rice = Math.min(99999, c.rice + riceIncome);
        });
    }
});