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
        if (game.month === 7 && dice < 0.05) return true;
        if (game.month === 8 && dice < 0.15) return true;
        if (game.month === 9 && dice < 0.6) return true;
        if (game.month === 10 && dice < 0.15) return true;
        if (game.month === 11 && dice < 0.05) return true;
        return false;
    },
    
    execute: async function(game) {
        console.log("=== 台風イベント開始 ===");

        const SHOW_TYPHOON_PATH = true;

        // ★ダイアログを出す前に、音を鳴らしてバリアを張る魔法を呼びます！
        if (window.playEventSoundAndBlock) window.playEventSoundAndBlock();

        await game.ui.showDialogAsync("台風が接近しています……", false, 0);

        const resetZoomBtn = document.getElementById('map-reset-zoom');
        if (resetZoomBtn) resetZoomBtn.click();

        const damagedProvinceMap = new Map();
        const damagedPlayerCastles = [];      
        
        let baseScale = 1;
        const scaleDice = Math.random() * 100; 

        if (scaleDice < 10) {
            baseScale = 1; 
        } else if (scaleDice < 35) {
            baseScale = 2; 
        } else if (scaleDice < 65) {
            baseScale = 3; 
        } else if (scaleDice < 85) {
            baseScale = 4; 
        } else if (scaleDice < 93) {
            baseScale = 5; 
        } else if (scaleDice < 97) {
            baseScale = 6; 
        } else if (scaleDice < 99) {
            baseScale = 7; 
        } else {
            baseScale = Math.floor(Math.random() * 3) + 8; 
        }

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
        mapContainer.style.width = '95%';
        mapContainer.style.maxWidth = '800px';
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
            
            let initialScale = Math.min(10, Math.max(1, baseScale));
            let typhoonRadius = 100 + (initialScale * 15); 
            
            const damagedColorCodes = new Set(); 
            const windStrength = 40 - (initialScale * 3) + (Math.random() * 5); 
            
            let wasOnLand = false; 
            let landCount = 0; 

            while (typhoonX < width + typhoonRadius && typhoonY > -typhoonRadius && typhoonY < height + 1000 && typhoonRadius > 30) {
                
                pathData.push({ x: typhoonX, y: typhoonY, radius: typhoonRadius });

                let moveX = Math.random() * 20 + 5;
                let moveY = Math.random() * 30 + 15 + (initialScale * 1.5); 

                let progress = Math.max(0, (height + 500 - typhoonY) / height); 
                
                moveX += windStrength * progress * 1.0; 
                
                let fallPower = 30 - (initialScale * 2); 
                moveY -= fallPower * Math.pow(progress, 1.5); 

                if (wasOnLand) {
                    moveY -= 5; 
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

                let baseDecay = (Math.random() * 1.0) - 0.5; 
                let northDecay = 0.3 * progress; 

                if (onLand) {
                    landCount++;
                    let landDecay = 0.2 + (landCount * 0.05); 
                    typhoonRadius -= (baseDecay + northDecay + landDecay);
                } else {
                    landCount = 0; 
                    typhoonRadius -= (baseDecay + northDecay);
                }

                if (typhoonRadius > 250) typhoonRadius = 250;

                wasOnLand = onLand;
            }
            
            pathData.push({ x: typhoonX, y: typhoonY, radius: typhoonRadius });

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

        // ７月か８月の台風なら、被害を受けた国に「凶作」のシールを貼ります！
        if (game.month === 7 || game.month === 8) {
            damagedProvinceMap.forEach((scale, pId) => {
                const p = game.provinces.find(prov => prov.id === pId);
                if (p) {
                    if (!p.statusEffects) p.statusEffects = [];
                    if (!p.statusEffects.includes('badHarvest')) {
                        p.statusEffects.push('badHarvest');
                    }
                }
            });
        }
        
        // 台風の被害を受けた国だけでなく、他の国にも影響を出します！
        if (damagedProvinceMap.size > 0) {
            game.provinces.forEach(prov => {
                if (prov && prov.marketRate !== undefined) {
                    // 台風の被害を受けた国かどうか調べます
                    if (damagedProvinceMap.has(prov.id)) {
                        // 被害を受けた国は 0.3 アップします！
                        prov.marketRate = Math.min(window.MainParams.Economy.TradeRateMax, prov.marketRate + 0.3);
                    } else {
                        // 被害を受けていない他の国も、影響で 0.1 アップします！
                        prov.marketRate = Math.min(window.MainParams.Economy.TradeRateMax, prov.marketRate + 0.1);
                    }
                }
            });
        }
        
        game.castles.forEach(castle => {
            if (damagedProvinceMap.has(castle.provinceId)) {
                const finalScale = damagedProvinceMap.get(castle.provinceId);
                const dropPercent = finalScale * 0.03;
                
                // 城防御力15につき1%のダメージ軽減率を計算します（最大100%カット）
                const defenseCutRate = Math.min(1.0, Math.floor(castle.defense / 15) * 0.01);
                const actualDropPercent = dropPercent * (1.0 - defenseCutRate);
                
                castle.kokudaka = Math.floor(castle.kokudaka * (1.0 - actualDropPercent));
                castle.defense = Math.floor(castle.defense * (1.0 - dropPercent)); // 防御のダメージは軽減しません
                
                if (finalScale >= 6) {
                    const solDropRate = ((finalScale - 5) * 0.04) * (1.0 - defenseCutRate);
                    castle.soldiers = Math.floor(castle.soldiers * (1.0 - solDropRate));
                    
                    const popDropRate = ((finalScale - 5) * 0.02) * (1.0 - defenseCutRate);
                    castle.population = Math.floor(castle.population * (1.0 - popDropRate));
                }

                if (castle.ownerClan === game.playerClanId) {
                    damagedPlayerCastles.push({ castle: castle, scale: finalScale });
                }
            }
        });

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
                
                if (damagedProvinceMap.size > 0) {
                    canvas.style.animation = 'blink 1s 2';
                }

                const ctx = canvas.getContext('2d');
                
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
                                    // ★ ここが修正ポイントです！完全に一致する色だけを正解にします
                                    if (r === c.r && g === c.g && b === c.b) {
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

                if (SHOW_TYPHOON_PATH && pathData.length > 0) {
                    ctx.lineWidth = 3; 
                    ctx.strokeStyle = 'rgba(255, 255, 0, 0.4)'; 
                    ctx.setLineDash([8, 8]); 

                    for (let i = 0; i < pathData.length; i++) {
                        if (i % 2 === 0 || i === pathData.length - 1) {
                            ctx.beginPath();
                            ctx.arc(pathData[i].x, pathData[i].y, Math.max(0, pathData[i].radius), 0, Math.PI * 2);
                            ctx.stroke();
                        }
                    }

                    ctx.beginPath();
                    ctx.setLineDash([20, 20]); 
                    ctx.strokeStyle = 'rgba(255, 255, 0, 0.8)'; 
                    ctx.lineWidth = 12; 
                    ctx.lineCap = 'round'; 
                    ctx.lineJoin = 'round'; 

                    ctx.moveTo(pathData[0].x, pathData[0].y);
                    for (let i = 1; i < pathData.length; i++) {
                        ctx.lineTo(pathData[i].x, pathData[i].y);
                    }
                    ctx.stroke(); 
                    ctx.setLineDash([]); 
                }

                mapContainer.appendChild(canvas);

                await new Promise(resolve => setTimeout(resolve, 2000));

                canvas.style.animation = 'none';
                canvas.style.opacity = '1.0';
            }

            // ★文字は出さずに、プレイヤーが画面を触る（クリックやタップする）までストップして待ちます！
            await new Promise(resolve => {
                const onTouch = () => {
                    mapOverlay.removeEventListener('click', onTouch);
                    mapOverlay.removeEventListener('touchstart', onTouch);
                    resolve(); // 触ってくれたらストッパーを解除して先に進みます！
                };
                mapOverlay.addEventListener('click', onTouch);
                mapOverlay.addEventListener('touchstart', onTouch, { passive: true });
            });

            // メッセージを出す前に、まず地図（mapOverlay）を画面から消します
            document.body.removeChild(mapOverlay);

            if (damagedProvinceMap.size > 0) {
                await game.ui.showDialogAsync("各地で被害が発生しているようです……", false, 0);
            } else {
                await game.ui.showDialogAsync("今回は大きな被害はなかったようです。", false, 0);
            }

        } else {
            // 被害がなかった場合も、ここで忘れずに地図を消します
            document.body.removeChild(mapOverlay);
            await game.ui.showDialogAsync("今回は大きな被害はなかったようです。", false, 0);
        }

        // ★マップを閉じた後の硬直時間を3秒（3000）から1秒（1000）に減らしました！
        await new Promise(resolve => setTimeout(resolve, 1000));

        for (const data of damagedPlayerCastles) {
            await game.ui.showDialogAsync(` ${data.castle.name} が台風の被害を受けました……`, false, 0);
        }
    }
});