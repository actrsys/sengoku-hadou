/**
 * typhoon_event.js
 * 台風イベント専用のファイルです。
 */

window.GameEvents = window.GameEvents || [];

window.GameEvents.push({
    id: "typhoon_event_01",
    timing: "endMonth_after",
    isOneTime: false,
    
    checkCondition: function(game) {
        const dice = Math.random();
        if (game.month === 8 && dice < 0.10) return true;
        if (game.month === 9 && dice < 1.00) return true;
        if (game.month === 10 && dice < 0.03) return true;
        if (game.month === 11 && dice < 0.01) return true;
        return false;
    },
    
    execute: async function(game) {
        console.log("=== 台風イベント開始 ===");

        await game.ui.showDialogAsync("【台風接近】\n台風が接近しています……。", false, 0);

        const resetZoomBtn = document.getElementById('map-reset-zoom');
        if (resetZoomBtn) resetZoomBtn.click();

        const mapImg = document.querySelector('#map-container img') || document.getElementById('map-image');
        if (!mapImg) {
            console.error("地図画像が見つからないため、台風の進路計算ができませんでした。");
            return;
        }

        const width = mapImg.naturalWidth || 3140;
        const height = mapImg.naturalHeight || 2440;

        // 【1】まずは裏側で見えない画用紙（キャンバス）を作り、色を調べます
        const offCanvas = document.createElement('canvas');
        offCanvas.width = width;
        offCanvas.height = height;
        const offCtx = offCanvas.getContext('2d', { willReadFrequently: true });
        offCtx.drawImage(mapImg, 0, 0, width, height);

        let typhoonX = -200;
        let typhoonY = height + 200;
        const typhoonRadius = 150;
        
        const damagedColorCodes = new Set(); // 拾った色をとりあえず入れる箱

        // 台風を進ませます
        while (typhoonX < width + typhoonRadius && typhoonY > -typhoonRadius) {
            let moveX = Math.random() * 30 + 10;
            let moveY = Math.random() * 30 + 10;

            if (typhoonY > height / 2) moveX += 15;
            else moveY += 15;

            typhoonX += moveX;
            typhoonY -= moveY;

            if (typhoonX > -typhoonRadius && typhoonX < width + typhoonRadius &&
                typhoonY > -typhoonRadius && typhoonY < height + typhoonRadius) {

                const checkPoints = [
                    { x: typhoonX, y: typhoonY },
                    { x: typhoonX - typhoonRadius/2, y: typhoonY },
                    { x: typhoonX + typhoonRadius/2, y: typhoonY },
                    { x: typhoonX, y: typhoonY - typhoonRadius/2 },
                    { x: typhoonX, y: typhoonY + typhoonRadius/2 }
                ];

                for (let pt of checkPoints) {
                    if (pt.x >= 0 && pt.x < width && pt.y >= 0 && pt.y < height) {
                        const pixel = offCtx.getImageData(Math.floor(pt.x), Math.floor(pt.y), 1, 1).data;
                        if (pixel[3] > 0) { // 透明でなければ色を16進数（#ff0000など）に変換
                            const hexColor = "#" + ((1 << 24) + (pixel[0] << 16) + (pixel[1] << 8) + pixel[2]).toString(16).slice(1);
                            damagedColorCodes.add(hexColor);
                        }
                    }
                }
            }
        }

        // 【2】完全一致のチェック（ノイズの無視）
        const damagedProvinces = [];
        const damagedProvinceIds = [];
        const targetColors = new Set(); // 光らせる対象の「正しい色コード」だけを入れる箱

        if (game.provinces && game.provinces.length > 0) {
            for (let prov of game.provinces) {
                const provColor = prov.color_code || prov.colorCode;
                // 台風が拾った色の中に、国の正しい色が「完全に一致」で存在するかチェック
                if (provColor && damagedColorCodes.has(provColor)) {
                    damagedProvinces.push(prov.province || prov.name);
                    damagedProvinceIds.push(prov.id);
                    targetColors.add(provColor.toLowerCase()); // 光らせるために記憶
                }
            }
        }

        // 【3】画面に地図を表示して、被害を受けた国を青く光らせます（あや瀨さんの元の機能を復活）
        const mapOverlay = document.createElement('div');
        mapOverlay.style.position = 'fixed';
        mapOverlay.style.top = '0';
        mapOverlay.style.left = '0';
        mapOverlay.style.width = '100vw';
        mapOverlay.style.height = '100vh';
        mapOverlay.style.backgroundColor = 'rgba(0, 0, 0, 0.8)';
        mapOverlay.style.zIndex = '9999';
        mapOverlay.style.display = 'flex';
        mapOverlay.style.justifyContent = 'center';
        mapOverlay.style.alignItems = 'center';

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        canvas.style.maxWidth = '90vw';
        canvas.style.maxHeight = '90vh';
        canvas.style.objectFit = 'contain';
        
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        ctx.drawImage(mapImg, 0, 0, width, height);

        // 対象の国がある場合、その国だけ色を変えます
        if (targetColors.size > 0) {
            const imgData = ctx.getImageData(0, 0, width, height);
            const data = imgData.data;
            for (let i = 0; i < data.length; i += 4) {
                const r = data[i];
                const g = data[i+1];
                const b = data[i+2];
                if (data[i+3] > 0) {
                    const hex = "#" + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
                    // ピクセルの色が、被害を受けた国の色と完全一致したら青く塗る
                    if (targetColors.has(hex)) {
                        data[i] = 0;     // R
                        data[i+1] = 0;   // G
                        data[i+2] = 255; // B (青)
                        data[i+3] = 180; // A (半透明)
                    }
                }
            }
            ctx.putImageData(imgData, 0, 0);
        }

        mapOverlay.appendChild(canvas);
        document.body.appendChild(mapOverlay);

        // アニメーションの代わりに2秒間表示して見せます
        await new Promise(resolve => setTimeout(resolve, 2000));

        // 【4】結果の表示
        if (damagedProvinces.length > 0) {
            const displayNames = damagedProvinces.slice(0, 3).join("、") + (damagedProvinces.length > 3 ? " など" : "");
            await game.ui.showDialogAsync(`【台風発生】\n各地で被害が発生しているようです……。\n（${displayNames}）`, false, 0);

            // ★ ここにお米などが減る処理を書きます

        } else {
            await game.ui.showDialogAsync("【台風通過】\n幸い、今回は大きな被害はなかったようです。", false, 0);
        }

        // 【5】プレイヤーがメッセージを閉じたら、地図を片付けて3秒待ちます（元の処理）
        document.body.removeChild(mapOverlay);
        await new Promise(resolve => setTimeout(resolve, 3000));
    }
});