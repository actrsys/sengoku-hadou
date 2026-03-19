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

        // ★★★ 進路を表示するかどうかのスイッチ ★★★
        // true  にすると、黄色い点線で進路を描画します。
        // false にすると、進路は描画されません（本番用）。
        const SHOW_TYPHOON_PATH = true;

        // 【1】「台風が接近しています」メッセージを表示
        await game.ui.showDialogAsync("【台風接近】\n台風が接近しています……。", false, 0);

        // 【2】地図を最小表示にする
        const resetZoomBtn = document.getElementById('map-reset-zoom');
        if (resetZoomBtn) resetZoomBtn.click();

        // 【3】被害の計算結果を入れる箱を準備
        const damagedProvinceMap = new Map();
        const damagedPlayerCastles = [];      
        const baseScale = Math.floor(Math.random() * 5) + Math.floor(Math.random() * 6) + 1;

        // 【4】白地図のウインドウを作ります
        const mapOverlay = document.createElement('div');
        mapOverlay.style.position = 'fixed';
        mapOverlay.style.top = '0';
        mapOverlay.style.left = '0';
        mapOverlay.style.width = '100%';
        mapOverlay.style.height = '100%';
        mapOverlay.style.backgroundColor = 'rgba(0,0,0,0.85)';
        mapOverlay.style.zIndex = '7500'; 
        mapOverlay.style.display = 'flex';
        mapOverlay.style.justifyContent = 'center';
        mapOverlay.style.alignItems = 'flex-start';
        mapOverlay.style.paddingTop = '5vh'; 

        const mapContainer = document.createElement('div');
        mapContainer.style.position = 'relative';
        
        if (window.innerWidth > 768) {
            mapContainer.style.width = '66%'; 
            mapContainer.style.maxWidth = '800px'; 
        } else {
            mapContainer.style.width = '95%'; 
            mapContainer.style.maxWidth = 'none';
        }

        mapContainer.style.border = '4px solid #fff';
        mapContainer.style.borderRadius = '8px';
        mapContainer.style.backgroundColor = '#81c784';
        mapContainer.style.overflow = 'hidden';

        const whiteMapImg = new Image();
        whiteMapImg.src = './data/images/map/japan_white_map.png'; 
        whiteMapImg.style.width = '100%';
        whiteMapImg.style.display = 'block';

        mapContainer.appendChild(whiteMapImg);
        mapOverlay.appendChild(mapContainer);
        document.body.appendChild(mapOverlay);

        await new Promise(resolve => {
            if (whiteMapImg.complete) resolve();
            else {
                whiteMapImg.onload = resolve;
                whiteMapImg.onerror = resolve;
                setTimeout(resolve, 1000); 
            }
        });

        // 【5】色分け地図（japan_provinces.png）を裏側で読み込みます
        if (!window.ProvinceImageDataCache) {
            const provMapImg = new Image();
            provMapImg.src = './data/images/map/japan_provinces.png';
            
            await new Promise(resolve => {
                if (provMapImg.complete) resolve();
                else {
                    provMapImg.onload = resolve;
                    provMapImg.onerror = resolve;
                    setTimeout(resolve, 1000); 
                }
            });

            if (provMapImg.naturalWidth > 0) {
                const tempCanvas = document.createElement('canvas');
                tempCanvas.width = provMapImg.naturalWidth;
                tempCanvas.height = provMapImg.naturalHeight;
                const tempCtx = tempCanvas.getContext('2d');
                tempCtx.drawImage(provMapImg, 0, 0);
                try {
                    window.ProvinceImageDataCache = tempCtx.getImageData(0, 0, tempCanvas.width, tempCanvas.height);
                } catch (e) {
                    console.error("画像読み取りエラー:", e);
                }
            }
        }

        // ====== ★ ここから新しい台風の進路計算です ★ ======
        // ★新しいメモ帳：台風が通った道を記録しておくための箱です
        const pathData = [];

        if (window.ProvinceImageDataCache) {
            const width = window.ProvinceImageDataCache.width;
            const height = window.ProvinceImageDataCache.height;
            const data = window.ProvinceImageDataCache.data;

            const getPixelHex = (x, y) => {
                x = Math.floor(x); y = Math.floor(y);
                if (x < 0 || x >= width || y < 0 || y >= height) return null;
                const idx = (y * width + x) * 4;
                if (data[idx+3] === 0) return null; 
                if (data[idx] === 0 && data[idx+1] === 0 && data[idx+2] === 0) return null; 
                return "#" + ((1 << 24) + (data[idx] << 16) + (data[idx+1] << 8) + data[idx+2]).toString(16).slice(1);
            };

            let r = Math.pow(Math.random(), 3); 
            let typhoonX = -500 + (r * (width * 0.7 + 500)); 
            let typhoonY = height + 500;
            
            let typhoonRadius = 180;
            const damagedColorCodes = new Set(); 
            const windStrength = Math.random() * 30 + 10; 
            
            let wasOnLand = false; 
            let landCount = 0; 

            while (typhoonX < width + typhoonRadius && typhoonY > -typhoonRadius && typhoonRadius > 30) {
                // 歩くたびに、今の場所をメモ帳に書き込みます
                pathData.push({ x: typhoonX, y: typhoonY });

                let moveX = Math.random() * 20 + 5;
                let moveY = Math.random() * 25 + 15;

                if (wasOnLand) {
                    let yMultiplier = Math.max(0.1, 0.5 - (landCount * 0.05));
                    moveY *= yMultiplier; 
                    moveX *= 0.8; 
                }

                if (typhoonY < height * 0.6) {
                    moveX += windStrength; 
                    moveY *= 0.6; 
                }
                if (typhoonY < height * 0.2) {
                    moveX += windStrength * 1.5; 
                    moveY *= 0.2; 
                }

                typhoonX += moveX;
                typhoonY -= moveY;

                let onLand = false;

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
                        const hex = getPixelHex(pt.x, pt.y);
                        if (hex) {
                            damagedColorCodes.add(hex.toLowerCase());
                            onLand = true; 
                        }
                    }
                }

                let baseDecay = 0.8; 
                let northFactor = Math.max(0, (height - typhoonY) / height); 
                let northDecay = 3.0 * northFactor; 

                if (onLand) {
                    landCount++;
                    let landDecay = 3.0 + (landCount * 0.3); 
                    typhoonRadius -= (baseDecay + northDecay + landDecay);
                } else {
                    landCount = 0; 
                    typhoonRadius -= (baseDecay + northDecay);
                }

                wasOnLand = onLand;
            }
            
            // 最後に消えた場所もメモしておきます
            pathData.push({ x: typhoonX, y: typhoonY });

            if (game.provinces && game.provinces.length > 0) {
                for (let prov of game.provinces) {
                    const provColor = prov.color_code || prov.colorCode;
                    if (provColor && damagedColorCodes.has(provColor.toLowerCase())) {
                        const shift = Math.floor(Math.random() * 3) - 1;
                        let finalScale = Math.max(1, Math.min(10, baseScale + shift));
                        damagedProvinceMap.set(prov.id, finalScale); 
                    }
                }
            }
        }
        // ====== ★ 台風の進路計算おわり ★ ======

        // 【6】お米や兵士を減らす処理
        game.castles.forEach(castle => {
            if (damagedProvinceMap.has(castle.provinceId)) {
                const finalScale = damagedProvinceMap.get(castle.provinceId);
                const dropPercent = finalScale * 0.03;
                
                castle.kokudaka = Math.floor(castle.kokudaka * (1.0 - dropPercent));
                castle.defense = Math.floor(castle.defense * (1.0 - dropPercent));
                
                if (finalScale >= 6) {
                    castle.soldiers = Math.floor(castle.soldiers * (1.0 - ((finalScale - 5) * 0.04)));
                    castle.population = Math.floor(castle.population * (1.0 - ((finalScale - 5) * 0.02)));
                }

                if (castle.ownerClan === game.playerClanId) {
                    damagedPlayerCastles.push({ castle: castle, scale: finalScale });
                }
            }
        });

        // 【7】被害の青い光 ＋ 黄色い点線の描画
        if (damagedProvinceMap.size > 0 || SHOW_TYPHOON_PATH) {
            
            if (window.ProvinceImageDataCache) {
                const canvas = document.createElement('canvas');
                canvas.width = window.ProvinceImageDataCache.width;
                canvas.height = window.ProvinceImageDataCache.height;
                canvas.style.position = 'absolute';
                canvas.style.top = '0';
                canvas.style.left = '0';
                canvas.style.width = '100%';
                canvas.style.height = '100%';
                canvas.style.pointerEvents = 'none';
                
                // 被害がある時だけピコンピコンと点滅させます
                if (damagedProvinceMap.size > 0) {
                    canvas.style.animation = 'blink 1s 2';
                }

                const ctx = canvas.getContext('2d');
                
                // --- ① 青く光らせる処理 ---
                if (damagedProvinceMap.size > 0) {
                    const targetColors = [];
                    const hexToRgb = (hex) => {
                        const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
                        return result ? { r: parseInt(result[1], 16), g: parseInt(result[2], 16), b: parseInt(result[3], 16) } : null;
                    };
                    
                    damagedProvinceMap.forEach((scale, pId) => {
                        const pData = game.provinces.find(p => p.id === pId);
                        if (pData && pData.color_code) {
                            const rgb = hexToRgb(pData.color_code);
                            if (rgb) targetColors.push(rgb);
                        }
                    });

                    if (targetColors.length > 0) {
                        const srcData = window.ProvinceImageDataCache.data;
                        const newImgData = ctx.createImageData(canvas.width, canvas.height);
                        const dstData = newImgData.data;

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
                                    dstData[i] = 0;
                                    dstData[i+1] = 0;
                                    dstData[i+2] = 255;
                                    dstData[i+3] = 180;
                                }
                            }
                        }
                        ctx.putImageData(newImgData, 0, 0);
                    }
                }

                // --- ② 黄色い点線の進路を描く処理 ---
                if (SHOW_TYPHOON_PATH && pathData.length > 0) {
                    ctx.beginPath();
                    ctx.setLineDash([20, 20]); // 20ピクセル描いて、20ピクセル隙間をあける（点線）
                    ctx.strokeStyle = 'rgba(255, 255, 0, 0.8)'; // 半透明の黄色
                    ctx.lineWidth = 12; // 線の太さ
                    ctx.lineCap = 'round'; // 線の端っこを丸くする
                    ctx.lineJoin = 'round'; // 折れ曲がる部分を丸くする

                    // メモ帳の最初の場所に筆を置く
                    ctx.moveTo(pathData[0].x, pathData[0].y);
                    // メモ帳の場所を順番に線で結んでいく
                    for (let i = 1; i < pathData.length; i++) {
                        ctx.lineTo(pathData[i].x, pathData[i].y);
                    }
                    ctx.stroke(); // 実際に線を引く
                    ctx.setLineDash([]); // 点線の設定をリセットしておく
                }

                mapContainer.appendChild(canvas);

                await new Promise(resolve => setTimeout(resolve, 2000));

                canvas.style.animation = 'none';
                canvas.style.opacity = '1.0';
            }

            if (damagedProvinceMap.size > 0) {
                await game.ui.showDialogAsync("【台風発生】\n各地で被害が発生しているようです……。", false, 0);
            } else {
                await game.ui.showDialogAsync("【台風通過】\n幸い、今回は大きな被害はなかったようです。", false, 0);
            }

        } else {
            // 被害もなく、線も表示しない設定の時
            await game.ui.showDialogAsync("【台風通過】\n幸い、今回は大きな被害はなかったようです。", false, 0);
        }

        // 【8】プレイヤーがメッセージを閉じたら、白地図ウインドウを消します
        document.body.removeChild(mapOverlay);
        await new Promise(resolve => setTimeout(resolve, 3000));

        // 【9】自軍の城の被害報告
        for (const data of damagedPlayerCastles) {
            await game.ui.showDialogAsync(`【被害報告】\n我が家の ${data.castle.name} が台風の被害を受けました……。\n（局地規模：${data.scale}）`, false, 0);
        }
    }
});