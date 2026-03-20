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
// ★ ９月の豊作・凶作イベント ＆ 兵糧収入処理（マップ演出付き）
// ==========================================
window.GameEvents.push({
    id: "harvest_event_september",
    timing: "startMonth_after", 
    isOneTime: false,
    
    checkCondition: function(game) {
        return game.month === 9;
    },
    
    execute: async function(game) {
        // ① イベント発生の判定（100%で発生、さらに50%で豊作か凶作）
        const isEventYear = Math.random() < 1.0;
        let eventType = null; 
        
        if (isEventYear) {
            eventType = Math.random() < 0.5 ? '豊作' : '凶作';
        }

        let affectedProvinces = new Set();

        // ② イベントが起きた時の国の伝染計算
        if (eventType) {
            const allProvinceIds = [...new Set(game.castles.filter(c => c.provinceId > 0).map(c => c.provinceId))];
            
            const provinceRands = allProvinceIds.map(pid => {
                return { id: pid, rand: Math.floor(Math.random() * 1000) };
            });
            provinceRands.sort((a, b) => b.rand - a.rand);
            
            const candidates = provinceRands.slice(0, 3);
            let successCandidates = candidates.filter(c => Math.random() < 0.3);
            
            if (successCandidates.length === 0 && candidates.length > 0) {
                const maxRand = candidates[0].rand;
                successCandidates = candidates.filter(c => c.rand === maxRand);
            }

            const startProvinceIds = successCandidates.map(c => c.id);
            startProvinceIds.forEach(pid => affectedProvinces.add(pid));

            let queue = [];
            game.castles.forEach(c => {
                if (startProvinceIds.includes(c.provinceId)) {
                    queue.push({ castle: c, distance: 0 });
                }
            });

            let visitedCastles = new Set();
            queue.forEach(q => visitedCastles.add(q.castle.id));

            while (queue.length > 0) {
                const current = queue.shift();
                const currentCastle = current.castle;
                const dist = current.distance;

                if (dist >= 5) continue; 

                const neighbors = game.castles.filter(c => GameSystem.isAdjacent(currentCastle, c));

                for (let neighbor of neighbors) {
                    if (!visitedCastles.has(neighbor.id)) {
                        visitedCastles.add(neighbor.id); 
                        if (Math.random() < 0.2) {
                            affectedProvinces.add(neighbor.provinceId);
                            queue.push({ castle: neighbor, distance: dist + 1 });
                        }
                    }
                }
            }
            
            // ③ ★ここから追加！マップをピカピカさせる魔法です！
            if (affectedProvinces.size > 0 && game.ui) {
                // まずは導入のダイアログを出します
                await game.ui.showDialogAsync("【秋の訪れ】\n今年の収穫の様子はどうでしょうか……", false, 0);

                // ズームをリセットします
                const resetZoomBtn = document.getElementById('map-reset-zoom');
                if (resetZoomBtn) resetZoomBtn.click();

                // マップの背景（黒いフィルター）を作ります
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

                // 地方の色分けデータを読み込みます（台風と同じです）
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
                        } catch (e) { console.error("画像読み取りエラー:", e); }
                    }
                }

                // 色を塗るための透明なキャンバスを作ります
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
                    canvas.style.animation = 'blink 1s 2'; // ピカピカさせます

                    const ctx = canvas.getContext('2d');
                    const targetColors = [];
                    const hexToRgb = (hex) => {
                        const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
                        return result ? { r: parseInt(result[1], 16), g: parseInt(result[2], 16), b: parseInt(result[3], 16) } : null;
                    };
                    
                    // 被害に遭った国の色を調べます
                    affectedProvinces.forEach(pId => {
                        const pData = game.provinces.find(p => p.id === pId);
                        if (pData && pData.color_code) {
                            const rgb = hexToRgb(pData.color_code);
                            if (rgb) targetColors.push(rgb);
                        }
                    });

                    // キャンバスに色を塗ります！
                    if (targetColors.length > 0) {
                        const srcData = window.ProvinceImageDataCache.data;
                        const newImgData = ctx.createImageData(canvas.width, canvas.height);
                        const dstData = newImgData.data;

                        // 豊作なら「黄金色」、凶作なら「赤紫色」にします
                        const drawR = eventType === '豊作' ? 255 : 180;
                        const drawG = eventType === '豊作' ? 215 : 0;
                        const drawB = eventType === '豊作' ? 0 : 180;

                        for (let i = 0; i < srcData.length; i += 4) {
                            const r = srcData[i], g = srcData[i+1], b = srcData[i+2], a = srcData[i+3];
                            if (a > 0) {
                                let isTarget = false;
                                for (let c of targetColors) {
                                    if (r === c.r && g === c.g && b === c.b) {
                                        isTarget = true;
                                        break;
                                    }
                                }
                                if (isTarget) {
                                    dstData[i] = drawR;
                                    dstData[i+1] = drawG;
                                    dstData[i+2] = drawB;
                                    dstData[i+3] = 180; // 半透明
                                }
                            }
                        }
                        ctx.putImageData(newImgData, 0, 0);
                    }
                    mapContainer.appendChild(canvas);
                    
                    // ピカピカのアニメーションが終わるまで少し待ちます
                    await new Promise(resolve => setTimeout(resolve, 2000));
                    canvas.style.animation = 'none';
                    canvas.style.opacity = '1.0';
                }

                // プレイヤーが画面を触るまでストップして待ちます！
                await new Promise(resolve => {
                    const onTouch = () => {
                        mapOverlay.removeEventListener('click', onTouch);
                        mapOverlay.removeEventListener('touchstart', onTouch);
                        resolve(); 
                    };
                    mapOverlay.addEventListener('click', onTouch);
                    mapOverlay.addEventListener('touchstart', onTouch, { passive: true });
                });

                // マップを片付けます
                document.body.removeChild(mapOverlay);
                await new Promise(resolve => setTimeout(resolve, 1000));

                // どこの国で発生したかのお知らせダイアログを出します
                const pNames = Array.from(affectedProvinces).map(pid => {
                    const p = game.provinces.find(prov => prov.id === pid);
                    return p ? p.province : "どこかの国";
                });
                const uniquePNames = [...new Set(pNames)];
                const msg = `【${eventType}】\n${uniquePNames.join('、')} を中心とした地域で\n${eventType}となりました！`;
                await game.ui.showDialogAsync(msg, false, 0);
            }
        }

        // ④ 最後に、日本中のすべてのお城で「９月の兵糧収入」を計算します！
        game.castles.forEach(c => {
            if (c.ownerClan === 0) return; 
            
            const baseRice = (c.kokudaka / 2) + c.peoplesLoyalty;
            let riceIncome = Math.floor(baseRice * window.MainParams.Economy.IncomeRiceRate);
            riceIncome = GameSystem.applyVariance(riceIncome, window.MainParams.Economy.IncomeFluctuation);
            
            if (eventType && affectedProvinces.has(c.provinceId)) {
                if (eventType === '豊作') {
                    riceIncome = Math.floor(riceIncome * 1.5);
                } else if (eventType === '凶作') {
                    riceIncome = Math.floor(riceIncome * 0.5);
                }
            }
            c.rice = Math.min(99999, c.rice + riceIncome);
        });
    }
});