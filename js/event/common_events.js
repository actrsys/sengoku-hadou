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
// ★ ９月の豊作・凶作イベント ＆ 兵糧収入処理（マップ演出付き・事前ステータス連動版）
// ==========================================
window.GameEvents.push({
    id: "harvest_event_september",
    timing: "startMonth_after", 
    isOneTime: false,
    
    checkCondition: function(game) {
        return game.month === 9; // ９月に実行します
    },
    
    execute: async function(game) {
        // =========================================================
        // 【準備】便利な道具（関数）を用意します
        // =========================================================
        const getProv = (pId) => game.provinces.find(p => p.id === pId);
        
        const addStatus = (pId, status) => {
            const p = getProv(pId);
            if (p) {
                if (!p.statusEffects) p.statusEffects = [];
                if (!p.statusEffects.includes(status)) p.statusEffects.push(status);
            }
        };
        
        const hasStatus = (pId, status) => {
            const p = getProv(pId);
            return p && p.statusEffects && p.statusEffects.includes(status);
        };

        const playMapEffect = async (eventType, affectedProvIds) => {
            if (affectedProvIds.size === 0 || !game.ui) return;
            
            const initialMsg = eventType === '豊作' 
                ? "【秋の訪れ】\n今年は各地で豊作の秋を迎えています！"
                : "【秋の訪れ】\n今年は各地で凶作に見舞われています……";
            await game.ui.showDialogAsync(initialMsg, false, 0);

            const resetZoomBtn = document.getElementById('map-reset-zoom');
            if (resetZoomBtn) resetZoomBtn.click();

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
                canvas.style.animation = 'blink 1s 2'; 

                const ctx = canvas.getContext('2d');
                const targetColors = [];
                const hexToRgb = (hex) => {
                    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
                    return result ? { r: parseInt(result[1], 16), g: parseInt(result[2], 16), b: parseInt(result[3], 16) } : null;
                };
                
                affectedProvIds.forEach(pId => {
                    const pData = getProv(pId);
                    if (pData && pData.color_code) {
                        const rgb = hexToRgb(pData.color_code);
                        if (rgb) targetColors.push(rgb);
                    }
                });

                if (targetColors.length > 0) {
                    const srcData = window.ProvinceImageDataCache.data;
                    const newImgData = ctx.createImageData(canvas.width, canvas.height);
                    const dstData = newImgData.data;

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
                                dstData[i+3] = 180; 
                            }
                        }
                    }
                    ctx.putImageData(newImgData, 0, 0);
                }
                mapContainer.appendChild(canvas);
                
                await new Promise(resolve => setTimeout(resolve, 2000));
                canvas.style.animation = 'none';
                canvas.style.opacity = '1.0';
            }

            await new Promise(resolve => {
                const onTouch = () => {
                    mapOverlay.removeEventListener('click', onTouch);
                    mapOverlay.removeEventListener('touchstart', onTouch);
                    resolve(); 
                };
                mapOverlay.addEventListener('click', onTouch);
                mapOverlay.addEventListener('touchstart', onTouch, { passive: true });
            });

            document.body.removeChild(mapOverlay);
            await new Promise(resolve => setTimeout(resolve, 1000));

            const playerAffectedProvinces = new Set();
            game.castles.forEach(c => {
                if (c.ownerClan === game.playerClanId && affectedProvIds.has(c.provinceId)) {
                    playerAffectedProvinces.add(c.provinceId);
                }
            });
            
            for (let pid of playerAffectedProvinces) {
                const p = getProv(pid);
                const pName = p ? p.province : "どこかの国";
                const msg = eventType === '豊作'
                    ? `【豊作の報せ】\n${pName}は豊作です！`
                    : `【凶作の報せ】\n${pName}は凶作に見舞われています……`;
                await game.ui.showDialogAsync(msg, false, 0);
            }
        };

        // =========================================================
        // 【実行１】まずは「凶作」の処理を行います
        // =========================================================
        let badAffected = new Set();
        let badQueue = [];

        // ① すでに「凶作シール」や「豊作シール」が貼られている国を確認します
        game.provinces.forEach(p => {
            if (hasStatus(p.id, 'badHarvest')) {
                badAffected.add(p.id); // すでに凶作なら被害リストに入れます
            }
        });

        // 最初から凶作の国にある城を、伝染のスタート地点（距離0）として準備します
        game.castles.forEach(c => {
            if (badAffected.has(c.provinceId)) {
                badQueue.push({ castle: c, distance: 0 });
            }
        });

        // ② 15%の確率で「新しい凶作」が発生するか判定します
        if (Math.random() < 0.15) {
            // 新規発生の候補（まだどちらのシールも貼られていない国）を探します
            const validBadProvinceIds = [...new Set(game.castles.filter(c => c.provinceId > 0).map(c => c.provinceId))].filter(pid => {
                return !hasStatus(pid, 'badHarvest') && !hasStatus(pid, 'goodHarvest');
            });
            
            if (validBadProvinceIds.length > 0) {
                const provinceRands = validBadProvinceIds.map(pid => ({ id: pid, rand: Math.floor(Math.random() * 1000) }));
                provinceRands.sort((a, b) => b.rand - a.rand);
                
                const candidates = provinceRands.slice(0, 5);
                let successCandidates = candidates.filter(c => {
                    const p = getProv(c.id);
                    if (p && (p.regionId === 1 || p.regionId === 3)) return Math.random() < 0.6; // 東北・甲信は60%
                    return Math.random() < 0.3; // それ以外は30%
                });
                
                if (successCandidates.length === 0 && candidates.length > 0) {
                    successCandidates = candidates.filter(c => c.rand === candidates[0].rand);
                }

                // 新しく凶作になった国をリストに追加し、スタート地点として準備します
                const startProvinceIds = successCandidates.map(c => c.id);
                startProvinceIds.forEach(pid => {
                    badAffected.add(pid);
                    game.castles.forEach(c => {
                        if (c.provinceId === pid) badQueue.push({ castle: c, distance: 0 });
                    });
                });
            }
        }

        // ③ 凶作を隣の城へ伝染させます
        let visitedBadCastles = new Set();
        badQueue.forEach(q => visitedBadCastles.add(q.castle.id));

        while (badQueue.length > 0) {
            const current = badQueue.shift();
            if (current.distance >= 5) continue; 

            const neighbors = game.castles.filter(c => GameSystem.isAdjacent(current.castle, c));
            for (let neighbor of neighbors) {
                if (!visitedBadCastles.has(neighbor.id)) {
                    visitedBadCastles.add(neighbor.id); 
                    
                    // 伝染先としてOKか確認（まだどちらのシールも貼られていないこと）
                    let canSpread = !hasStatus(neighbor.provinceId, 'badHarvest') && 
                                    !hasStatus(neighbor.provinceId, 'goodHarvest') && 
                                    !badAffected.has(neighbor.provinceId);
                    
                    if (canSpread && Math.random() < 0.35) {
                        badAffected.add(neighbor.provinceId);
                        badQueue.push({ castle: neighbor, distance: current.distance + 1 });
                    }
                }
            }
        }
        
        // ④ 被害が出た国があれば、すべてにシールを貼ってマップ演出を出します
        if (badAffected.size > 0) {
            badAffected.forEach(pId => addStatus(pId, 'badHarvest'));
            await playMapEffect('凶作', badAffected);
        }

        // =========================================================
        // 【実行２】次に「豊作」の処理を行います
        // =========================================================
        let goodAffected = new Set();
        let goodQueue = [];

        // ① すでに「豊作シール」が貼られている国を確認します
        game.provinces.forEach(p => {
            if (hasStatus(p.id, 'goodHarvest')) {
                goodAffected.add(p.id); 
            }
        });

        // 最初から豊作の国にある城を、伝染のスタート地点として準備します
        game.castles.forEach(c => {
            if (goodAffected.has(c.provinceId)) {
                goodQueue.push({ castle: c, distance: 0 });
            }
        });

        // ② 15%の確率で「新しい豊作」が発生するか判定します
        if (Math.random() < 0.15) {
            // 新規発生の候補（東北・甲信ではなく、どちらのシールも貼られていない国）を探します
            const validGoodProvinceIds = [...new Set(game.castles.filter(c => c.provinceId > 0).map(c => c.provinceId))].filter(pid => {
                const p = getProv(pid);
                return p && p.regionId !== 1 && p.regionId !== 3 && 
                       !hasStatus(pid, 'badHarvest') && !hasStatus(pid, 'goodHarvest');
            });
            
            if (validGoodProvinceIds.length > 0) {
                const provinceRands = validGoodProvinceIds.map(pid => ({ id: pid, rand: Math.floor(Math.random() * 1000) }));
                provinceRands.sort((a, b) => b.rand - a.rand);
                
                const candidates = provinceRands.slice(0, 5);
                let successCandidates = candidates.filter(c => Math.random() < 0.3); // 豊作はどこでも30%
                
                if (successCandidates.length === 0 && candidates.length > 0) {
                    successCandidates = candidates.filter(c => c.rand === candidates[0].rand);
                }

                const startProvinceIds = successCandidates.map(c => c.id);
                startProvinceIds.forEach(pid => {
                    goodAffected.add(pid);
                    game.castles.forEach(c => {
                        if (c.provinceId === pid) goodQueue.push({ castle: c, distance: 0 });
                    });
                });
            }
        }

        // ③ 豊作を隣の城へ伝染させます
        let visitedGoodCastles = new Set();
        goodQueue.forEach(q => visitedGoodCastles.add(q.castle.id));

        while (goodQueue.length > 0) {
            const current = goodQueue.shift();
            if (current.distance >= 5) continue; 

            const neighbors = game.castles.filter(c => GameSystem.isAdjacent(current.castle, c));
            for (let neighbor of neighbors) {
                if (!visitedGoodCastles.has(neighbor.id)) {
                    visitedGoodCastles.add(neighbor.id); 
                    
                    // 伝染先としてOKか確認（東北・甲信ではなく、どちらのシールも貼られていないこと）
                    const p = getProv(neighbor.provinceId);
                    let canSpread = p && p.regionId !== 1 && p.regionId !== 3 && 
                                    !hasStatus(neighbor.provinceId, 'badHarvest') && 
                                    !hasStatus(neighbor.provinceId, 'goodHarvest') && 
                                    !goodAffected.has(neighbor.provinceId);
                    
                    if (canSpread && Math.random() < 0.35) {
                        goodAffected.add(neighbor.provinceId);
                        goodQueue.push({ castle: neighbor, distance: current.distance + 1 });
                    }
                }
            }
        }
        
        // ④ 豊作の国があれば、すべてにシールを貼ってマップ演出を出します
        if (goodAffected.size > 0) {
            goodAffected.forEach(pId => addStatus(pId, 'goodHarvest'));
            await playMapEffect('豊作', goodAffected);
        }

        // =========================================================
        // 【実行３】日本中の城で「９月の兵糧収入」を計算します！
        // =========================================================
        game.castles.forEach(c => {
            if (c.ownerClan === 0) return; 
            
            const baseRice = (c.kokudaka / 2) + c.peoplesLoyalty;
            let riceIncome = Math.floor(baseRice * window.MainParams.Economy.IncomeRiceRate);
            riceIncome = GameSystem.applyVariance(riceIncome, window.MainParams.Economy.IncomeFluctuation);
            
            if (hasStatus(c.provinceId, 'badHarvest')) {
                riceIncome = Math.floor(riceIncome * 0.5); 
            } else if (hasStatus(c.provinceId, 'goodHarvest')) {
                riceIncome = Math.floor(riceIncome * 1.5); 
            }
            
            c.rice = Math.min(99999, c.rice + riceIncome);
        });

        // =========================================================
        // 【お片付け】来年に向けて、貼ったシールを綺麗に剥がしておきます
        // =========================================================
        game.provinces.forEach(p => {
            if (p.statusEffects) {
                p.statusEffects = p.statusEffects.filter(s => s !== 'badHarvest' && s !== 'goodHarvest');
            }
        });
    }
});