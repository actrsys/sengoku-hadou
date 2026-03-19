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

        // 【1】「台風が接近しています」メッセージを表示
        await game.ui.showDialogAsync("【台風接近】\n台風が接近しています……。", false, 0);

        // 【2】地図を最小表示にする
        const resetZoomBtn = document.getElementById('map-reset-zoom');
        if (resetZoomBtn) resetZoomBtn.click();

        // 【3】地図画像の取得（裏側で見えない画用紙を作る準備です）
        const mapImg = document.querySelector('#map-container img') || document.getElementById('map-image');
        if (!mapImg) {
            console.error("地図画像が見つからないため、台風の進路計算ができませんでした。");
            await game.ui.showDialogAsync("【台風通過】\n幸い、今回は大きな被害はなかったようです。", false, 0);
            return;
        }

        // 見えない画用紙（キャンバス）を作って、地図をそっくり写し書きします
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        const width = mapImg.naturalWidth || 3140;
        const height = mapImg.naturalHeight || 2440;
        canvas.width = width;
        canvas.height = height;
        ctx.drawImage(mapImg, 0, 0, width, height);

        // 【4】台風のスタート地点と設定
        let typhoonX = -200;         // 左側の画面外からスタート
        let typhoonY = height + 200; // 下側の画面外からスタート
        const typhoonRadius = 150;   // 台風の大きさ（被害が出る範囲）
        
        // 被害を受けた国の色コードをメモする箱（Setを使うと、同じ色が何度も入るのを防いでくれます）
        const damagedColorCodes = new Set(); 
        const pathData = []; // 進路を記録する箱（あとでアニメーションに使うためのものです）

        // 【5】台風を動かして進路を計算します（右上に向かって進みます）
        while (typhoonX < width + typhoonRadius && typhoonY > -typhoonRadius) {
            // 今の場所を記録します
            pathData.push({ x: typhoonX, y: typhoonY });

            // 1歩進めます（サイコロを振ってランダムな歩幅にします）
            let moveX = Math.random() * 30 + 10; // 右へ10〜40進む
            let moveY = Math.random() * 30 + 10; // 上へ10〜40進む

            // 太平洋側（右下）に向かわせるための「重み」の処理です
            // y座標が大きい（地図の下の方にいる）時は、右へ行きやすくします
            if (typhoonY > height / 2) {
                moveX += 15;
            } else {
                moveY += 15;
            }

            typhoonX += moveX;
            typhoonY -= moveY;

            // 今の場所が地図の中に入っているかチェックします
            if (typhoonX > -typhoonRadius && typhoonX < width + typhoonRadius &&
                typhoonY > -typhoonRadius && typhoonY < height + typhoonRadius) {

                // 【6】色コード検知（台風の中心と、上下左右の少し離れた場所の色を調べます）
                const checkPoints = [
                    { x: typhoonX, y: typhoonY }, // 中心
                    { x: typhoonX - typhoonRadius/2, y: typhoonY }, // 左
                    { x: typhoonX + typhoonRadius/2, y: typhoonY }, // 右
                    { x: typhoonX, y: typhoonY - typhoonRadius/2 }, // 上
                    { x: typhoonX, y: typhoonY + typhoonRadius/2 }  // 下
                ];

                for (let pt of checkPoints) {
                    if (pt.x >= 0 && pt.x < width && pt.y >= 0 && pt.y < height) {
                        // 虫眼鏡でその場所のピクセルの色データを取得します
                        const pixel = ctx.getImageData(Math.floor(pt.x), Math.floor(pt.y), 1, 1).data;
                        const r = pixel[0]; // 赤
                        const g = pixel[1]; // 緑
                        const b = pixel[2]; // 青
                        const a = pixel[3]; // 透明度

                        // 透明じゃなくて、真っ黒（海）でもない場合のみ反応します
                        if (a > 0 && !(r === 0 && g === 0 && b === 0)) {
                            // RGBの数字を「#ff0000」のようなカラーコードに変換します
                            const hexColor = "#" + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
                            damagedColorCodes.add(hexColor); // メモ帳に色を書き込みます
                        }
                    }
                }
            }
        }

        console.log("=== 台風の進路メモ ===", pathData);
        console.log("=== 読み取った色コード ===", damagedColorCodes);

        // 【7】色コードから国を特定します
        const damagedProvinces = []; // 被害を受けた国の名前を入れる箱
        const damagedProvinceIds = []; // 被害を受けた国のIDを入れる箱

        // ゲームの国データと、メモした色を見比べます
        if (game.provinces && game.provinces.length > 0) {
            for (let prov of game.provinces) {
                // prov.color_code または prov.colorCode がメモの中にあるか確認します
                const provColor = prov.color_code || prov.colorCode;
                if (damagedColorCodes.has(provColor)) {
                    damagedProvinces.push(prov.province || prov.name);
                    damagedProvinceIds.push(prov.id);
                }
            }
        }

        console.log("=== 被害を受けた国 ===", damagedProvinces);

        // 【8】結果の表示と被害処理
        if (damagedProvinces.length > 0) {
            // 国名が多すぎるとメッセージが長くなるので、最初の3つくらいだけ表示するようにしています
            const displayNames = damagedProvinces.slice(0, 3).join("、") + (damagedProvinces.length > 3 ? " など" : "");
            await game.ui.showDialogAsync(`【台風通過】\n${displayNames} で被害が発生したようです……。`, false, 0);

            // ------------------------------------------------------------------------
            // ★ ここに、以前のコードで行っていた「お米が減る」などの処理を繋げます ★
            // （今は判定の仕組みを作ったので、ここで damagedProvinceIds に入っている
            //   国のIDを使って、城の被害を計算することができます）
            // ------------------------------------------------------------------------

        } else {
            await game.ui.showDialogAsync("【台風通過】\n幸い、今回は大きな被害はなかったようです。", false, 0);
        }
    }
});