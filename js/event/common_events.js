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
    
    checkCondition: function(game) {
        const dice = Math.random();
        if (game.month === 8 && dice < 0.10) return true;
        if (game.month === 9 && dice < 0.30) return true;
        if (game.month === 10 && dice < 0.03) return true;
        if (game.month === 11 && dice < 0.01) return true;
        return false;
    },
    
    execute: async function(game) {
        // 【1】「台風が接近しています」メッセージを表示（ここで時間は自動的に止まります）
        await game.ui.showDialogAsync("【台風接近】\n台風が接近しています……。", false, 0);

        // 【2】地図を最小表示にする
        // もし画面に「ズームをリセットするボタン」があれば、こっそり押して一番引いた状態にします
        const resetZoomBtn = document.getElementById('map-reset-zoom');
        if (resetZoomBtn) resetZoomBtn.click();

        // 【3】被害の計算（表には見えない裏側の処理です）
        const damagedProvinceIds = new Set(); // 被害を受けた「地方」の出席番号リスト
        const damagedPlayerCastles = [];      // 被害を受けた「自軍の城」のリスト
        
        const baseScale = Math.floor(Math.random() * 5) + Math.floor(Math.random() * 6) + 1;

        game.castles.forEach(castle => {
            const provinceData = game.provinces.find(p => p.id === castle.provinceId);
            if (!provinceData || !provinceData.typhoon) return;

            // 国（地方）ごとの確率で台風が直撃するかチェック！
            if (Math.random() < provinceData.typhoon) {
                // 直撃した地方の番号をメモしておきます
                damagedProvinceIds.add(castle.provinceId);
                
                const shift = Math.floor(Math.random() * 3) - 1;
                let finalScale = Math.max(1, Math.min(10, baseScale + shift));
                const dropPercent = finalScale * 0.03;
                
                castle.kokudaka = Math.floor(castle.kokudaka * (1.0 - dropPercent));
                castle.defense = Math.floor(castle.defense * (1.0 - dropPercent));
                
                if (finalScale >= 6) {
                    castle.soldiers = Math.floor(castle.soldiers * (1.0 - ((finalScale - 5) * 0.04)));
                    castle.population = Math.floor(castle.population * (1.0 - ((finalScale - 5) * 0.02)));
                }

                // もし自分の城だったら、後で報告するためにメモしておきます
                if (castle.ownerClan === game.playerClanId) {
                    damagedPlayerCastles.push({ castle: castle, scale: finalScale });
                }
            }
        });

        // 【4】白地図のウインドウを画面の一番手前に作ります！
        const mapOverlay = document.createElement('div');
        mapOverlay.style.position = 'fixed';
        mapOverlay.style.top = '0';
        mapOverlay.style.left = '0';
        mapOverlay.style.width = '100%';
        mapOverlay.style.height = '100%';
        mapOverlay.style.backgroundColor = 'rgba(0,0,0,0.85)';
        mapOverlay.style.zIndex = '99999'; // 絶対に一番手前に来るようにします
        mapOverlay.style.display = 'flex';
        mapOverlay.style.justifyContent = 'center';
        mapOverlay.style.alignItems = 'center';

        const mapContainer = document.createElement('div');
        mapContainer.style.position = 'relative';
        mapContainer.style.width = '90%';
        mapContainer.style.maxWidth = '800px';
        mapContainer.style.border = '4px solid #fff';
        mapContainer.style.borderRadius = '8px';
        mapContainer.style.backgroundColor = '#81c784'; // 海の背景色
        mapContainer.style.overflow = 'hidden';

        const whiteMapImg = new Image();
        whiteMapImg.src = './data/images/map/japan_white_map.png';
        whiteMapImg.style.width = '100%';
        whiteMapImg.style.display = 'block';

        mapContainer.appendChild(whiteMapImg);
        mapOverlay.appendChild(mapContainer);
        document.body.appendChild(mapOverlay);

        // 白地図の画像がしっかり読み込まれるまで、一瞬だけ待ちます
        await new Promise(resolve => {
            whiteMapImg.onload = resolve;
            whiteMapImg.onerror = resolve; // 万が一画像が無くても止まらないようにします
        });

        // 【5】被害を受けた地方を青く塗る魔法のキャンバスを重ねます
        if (damagedProvinceIds.size > 0 && window.DataManager && DataManager.provinceImageData) {
            const canvas = document.createElement('canvas');
            canvas.width = DataManager.mapImageWidth || whiteMapImg.naturalWidth;
            canvas.height = DataManager.mapImageHeight || whiteMapImg.naturalHeight;
            canvas.style.position = 'absolute';
            canvas.style.top = '0';
            canvas.style.left = '0';
            canvas.style.width = '100%';
            canvas.style.height = '100%';
            canvas.style.pointerEvents = 'none';
            
            // CSSにある魔法「blink」を使って、青色をチカチカ点滅させます！
            canvas.style.animation = 'blink 1s infinite';

            const ctx = canvas.getContext('2d');
            const targetColors = [];
            
            // 被害を受けた地方の「マップの色」をリストアップします
            damagedProvinceIds.forEach(pId => {
                const pData = game.provinces.find(p => p.id === pId);
                if (pData && pData.color_code) {
                    const rgb = DataManager.hexToRgb(pData.color_code);
                    if (rgb) targetColors.push(rgb);
                }
            });

            if (targetColors.length > 0) {
                const srcData = DataManager.provinceImageData.data;
                const newImgData = ctx.createImageData(canvas.width, canvas.height);
                const dstData = newImgData.data;

                // 1ピクセルずつ調べて、被害を受けた地方の色なら「青色（半透明）」に塗り替えます
                for (let i = 0; i < srcData.length; i += 4) {
                    const r = srcData[i], g = srcData[i+1], b = srcData[i+2], a = srcData[i+3];
                    if (a > 0) {
                        let isTarget = false;
                        for (let c of targetColors) {
                            if (Math.abs(r - c.r) < 5 && Math.abs(g - c.g) < 5 && Math.abs(b - c.b) < 5) {
                                isTarget = true;
                                break;
                            }
                        }
                        if (isTarget) {
                            dstData[i] = 0;     // 赤
                            dstData[i+1] = 0;   // 緑
                            dstData[i+2] = 255; // 青をMAX！
                            dstData[i+3] = 180; // 少し透けさせる
                        }
                    }
                }
                ctx.putImageData(newImgData, 0, 0);
            }
            mapContainer.appendChild(canvas);

            // プレイヤーに青い点滅を2秒間見てもらいます
            await new Promise(resolve => setTimeout(resolve, 2000));

            // 点滅を止めて、青色に光りっぱなしの状態にします！
            canvas.style.animation = 'none';
            canvas.style.opacity = '0.8';

            // 【6】ここでメッセージを表示します
            await game.ui.showDialogAsync("【台風発生】\n各地で被害が発生しているようです……。", false, 0);

        } else {
            // どこにも被害がなかった時のメッセージです
            await game.ui.showDialogAsync("【台風通過】\n幸い、今回は大きな被害はなかったようです。", false, 0);
        }

        // 【7】プレイヤーがメッセージを閉じたら、白地図ウインドウを消します
        document.body.removeChild(mapOverlay);

        // 【8】ウインドウが消えてから、嵐の後の静けさ……「3秒間」じっと待ちます
        await new Promise(resolve => setTimeout(resolve, 3000));

        // 【9】自軍の城の被害を、1つずつ個別に報告します
        for (const data of damagedPlayerCastles) {
            await game.ui.showDialogAsync(`【被害報告】\n我が家の ${data.castle.name} が台風の被害を受けました……。\n（局地規模：${data.scale}）`, false, 0);
        }

        // この行が終わると、自動的に時間が再び動き出します！
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