/**
 * common_events.js
 * ゲーム内の共通イベント（毎月発生するものなど）を入れるファイルです。
 */

// ==========================================
// ★ マップを光らせる共通の魔法（いろんなイベントで使い回せます！）
// ==========================================
window.playProvinceMapEffect = async function(game, eventType, initialMsg, affectedProvIds, drawR, drawG, drawB) {
    if (affectedProvIds.size === 0 || !game.ui) return;
    
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
        
        const getProv = (pId) => game.provinces.find(p => p.id === pId);

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

    // プレイヤーの領地の被害報告
    const playerAffectedProvinces = new Set();
    game.castles.forEach(c => {
        if (c.ownerClan === game.playerClanId && affectedProvIds.has(c.provinceId)) {
            playerAffectedProvinces.add(c.provinceId);
        }
    });
    
    for (let pid of playerAffectedProvinces) {
        const p = game.provinces.find(prov => prov.id === pid);
        const pName = p ? p.province : "どこかの国";
        let msg = "";
        if (eventType === '豊作') msg = `【豊作の報せ】\n${pName}は豊作です！`;
        else if (eventType === '凶作') msg = `【凶作の報せ】\n${pName}は凶作に見舞われています……`;
        else if (eventType === '飢饉') msg = `【飢饉の報せ】\n${pName}で飢饉が発生し、甚大な被害が出ています……`;
        else if (eventType === '疫病') msg = `【疫病の報せ】\n${pName}で恐ろしい疫病が猛威を振るっています……`;
        else if (eventType === '地震') msg = `【地震の報せ】\n${pName}で大地震による甚大な被害が出ています……`;
        else if (eventType === '大雪') msg = `【大雪の報せ】\n${pName}は深い雪に閉ざされています……`; // ★これを書き足しました！
        
        await game.ui.showDialogAsync(msg, false, 0);
    }
};

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
// ★ ９月の豊作・凶作イベント ＆ 兵糧収入処理（スッキリ版）
// ==========================================
window.GameEvents.push({
    id: "harvest_event_september",
    timing: "startMonth_after", 
    isOneTime: false,
    
    checkCondition: function(game) {
        return game.month === 9; 
    },
    
    execute: async function(game) {
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

        // =========================================================
        // 【実行１】「凶作」の処理を行います
        // =========================================================
        let badAffected = new Set();
        let badQueue = [];

        game.provinces.forEach(p => {
            if (hasStatus(p.id, 'badHarvest')) badAffected.add(p.id); 
        });

        game.castles.forEach(c => {
            if (badAffected.has(c.provinceId)) badQueue.push({ castle: c, distance: 0 });
        });
        
        // 15%の確率で「新しい凶作」が発生するか判定します
        if (Math.random() < 0.15) {
            const validBadProvinceIds = [...new Set(game.castles.filter(c => c.provinceId > 0).map(c => c.provinceId))].filter(pid => {
                return !hasStatus(pid, 'badHarvest') && !hasStatus(pid, 'goodHarvest');
            });
            
            if (validBadProvinceIds.length > 0) {
                const provinceRands = validBadProvinceIds.map(pid => ({ id: pid, rand: Math.floor(Math.random() * 1000) }));
                provinceRands.sort((a, b) => b.rand - a.rand);
                
                const candidates = provinceRands.slice(0, 5);
                let successCandidates = candidates.filter(c => {
                    const p = getProv(c.id);
                    if (p && (p.regionId === 1 || p.regionId === 3)) return Math.random() < 0.6; 
                    return Math.random() < 0.3; 
                });
                
                if (successCandidates.length === 0 && candidates.length > 0) {
                    successCandidates = candidates.filter(c => c.rand === candidates[0].rand);
                }

                const startProvinceIds = successCandidates.map(c => c.id);
                startProvinceIds.forEach(pid => {
                    badAffected.add(pid);
                    game.castles.forEach(c => {
                        if (c.provinceId === pid) badQueue.push({ castle: c, distance: 0 });
                    });
                });
            }
        }

        let visitedBadCastles = new Set();
        badQueue.forEach(q => visitedBadCastles.add(q.castle.id));

        while (badQueue.length > 0) {
            const current = badQueue.shift();
            if (current.distance >= 5) continue; 

            const neighbors = game.castles.filter(c => GameSystem.isAdjacent(current.castle, c));
            for (let neighbor of neighbors) {
                if (!visitedBadCastles.has(neighbor.id)) {
                    visitedBadCastles.add(neighbor.id); 
                    
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
        
        if (badAffected.size > 0) {
            badAffected.forEach(pId => addStatus(pId, 'badHarvest'));
            // ★共通の魔法を呼び出します！（凶作の色は赤紫色）
            await window.playProvinceMapEffect(game, '凶作', "【秋の訪れ】\n今年は各地で凶作に見舞われています……", badAffected, 180, 0, 180);
        }

        // =========================================================
        // 【実行２】「豊作」の処理を行います
        // =========================================================
        let goodAffected = new Set();
        let goodQueue = [];

        game.provinces.forEach(p => {
            if (hasStatus(p.id, 'goodHarvest')) goodAffected.add(p.id); 
        });

        game.castles.forEach(c => {
            if (goodAffected.has(c.provinceId)) goodQueue.push({ castle: c, distance: 0 });
        });
        
        // 15%の確率で「新しい豊作」が発生するか判定します
        if (Math.random() < 0.15) {
            const validGoodProvinceIds = [...new Set(game.castles.filter(c => c.provinceId > 0).map(c => c.provinceId))].filter(pid => {
                const p = getProv(pid);
                return p && p.regionId !== 1 && p.regionId !== 3 && 
                       !hasStatus(pid, 'badHarvest') && !hasStatus(pid, 'goodHarvest');
            });
            
            if (validGoodProvinceIds.length > 0) {
                const provinceRands = validGoodProvinceIds.map(pid => ({ id: pid, rand: Math.floor(Math.random() * 1000) }));
                provinceRands.sort((a, b) => b.rand - a.rand);
                
                const candidates = provinceRands.slice(0, 5);
                let successCandidates = candidates.filter(c => Math.random() < 0.3); 
                
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

        let visitedGoodCastles = new Set();
        goodQueue.forEach(q => visitedGoodCastles.add(q.castle.id));

        while (goodQueue.length > 0) {
            const current = goodQueue.shift();
            if (current.distance >= 5) continue; 

            const neighbors = game.castles.filter(c => GameSystem.isAdjacent(current.castle, c));
            for (let neighbor of neighbors) {
                if (!visitedGoodCastles.has(neighbor.id)) {
                    visitedGoodCastles.add(neighbor.id); 
                    
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
        
        if (goodAffected.size > 0) {
            goodAffected.forEach(pId => addStatus(pId, 'goodHarvest'));
            // ★共通の魔法を呼び出します！（豊作の色は黄金色）
            await window.playProvinceMapEffect(game, '豊作', "【秋の訪れ】\n今年は各地で豊作の秋を迎えています！", goodAffected, 255, 215, 0);
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
                riceIncome = Math.floor(riceIncome * 0.8);  //凶作なら80％の収入
            } else if (hasStatus(c.provinceId, 'goodHarvest')) {
                riceIncome = Math.floor(riceIncome * 1.3);  //豊作なら130%の収入
            }
            
            c.rice = Math.min(99999, c.rice + riceIncome);
        });

        // =========================================================
        // 【お片付け】来年に向けてシールを剥がし、飢饉の種をまきます
        // =========================================================
        game.provinces.forEach(p => {
            if (p.statusEffects) {
                const hadBadHarvest = p.statusEffects.includes('badHarvest');
                
                p.statusEffects = p.statusEffects.filter(s => s !== 'badHarvest' && s !== 'goodHarvest');
                
                // 凶作だったなら、20%の確率で「飢饉（famine）」のシールを新しく貼ります
                if (hadBadHarvest && Math.random() < 0.20) {
                    if (!p.statusEffects.includes('famine')) {
                        p.statusEffects.push('famine');
                    }
                }
            }
        });
    }
});

// ==========================================
// ★ １０月の飢饉イベント（兵士と人口の減少）
// ==========================================
window.GameEvents.push({
    id: "famine_event_october",
    timing: "startMonth_after", // 10月の開始時（月初の処理後）に実行します
    isOneTime: false,
    
    checkCondition: function(game) {
        // １０月に実行します
        return game.month === 10;
    },
    
    execute: async function(game) {
        let famineProvIds = new Set();
        
        // ① 「famine（飢饉）」のシールが貼られている国を探します
        game.provinces.forEach(p => {
            if (p.statusEffects && p.statusEffects.includes('famine')) {
                famineProvIds.add(p.id);
            }
        });

        // 飢饉の国が１つもなければ、何もしないでおしまいです
        if (famineProvIds.size === 0) return;

        // ② ★共通の魔法を呼び出します！（飢饉の色は濃い赤色です）
        await window.playProvinceMapEffect(
            game, 
            '飢饉', 
            "【凶荒】\n各地で深刻な飢饉が発生しています……", 
            famineProvIds, 
            120, 0, 0 // 暗くて濃い赤色の数字です
        );

        // ③ 飢饉の国にあるお城ごとに、兵士と人口、そして民忠を減らします！
        game.castles.forEach(c => {
            if (c.ownerClan === 0) return; 
            
            // このお城がある国が、飢饉のリストに入っていたら…
            if (famineProvIds.has(c.provinceId)) {
                // 兵士数が 10% ～ 30% ランダムで減ります！
                const solDropRate = 0.10 + (Math.random() * 0.20);
                c.soldiers = Math.max(0, Math.floor(c.soldiers * (1.0 - solDropRate)));
                
                // 人口が 1% ～ 10% ランダムで減ります！
                const popDropRate = 0.01 + (Math.random() * 0.09);
                c.population = Math.max(0, Math.floor(c.population * (1.0 - popDropRate)));
                
                // ★追加：兵士と人口の減少割合（％）を足し算して、民忠のダウン量を決めます！
                const loyaltyDrop = Math.floor(solDropRate * 100) + Math.floor(popDropRate * 100);
                c.peoplesLoyalty = Math.max(0, c.peoplesLoyalty - loyaltyDrop);
            }
        });

        // ④ 【お片付け】飢饉の被害が終わったので、シールを綺麗に剥がしておきます
        game.provinces.forEach(p => {
            if (p.statusEffects) {
                // 'famine' という文字以外のシールだけを残します
                p.statusEffects = p.statusEffects.filter(s => s !== 'famine');
            }
        });
    }
});

// ==========================================
// ★ 不定期イベント：疫病（月末処理後）
// ==========================================
window.GameEvents.push({
    id: "epidemic_event_random",
    timing: "endMonth_after", // 月末の処理が終わった後に判定します
    isOneTime: false,
    
    checkCondition: function(game) {
        // 0.2%（1000回に2回）の確率で、疫病のスイッチが入ります
        return Math.random() < 0.002;
    },
    
    execute: async function(game) {
        // 日本中にあるすべての国の「出席番号」を集めます
        const allProvIds = [...new Set(game.castles.filter(c => c.provinceId > 0).map(c => c.provinceId))];
        if (allProvIds.length === 0) return;
        
        // その中から、くじ引きで「ランダムな１つの国」を選びます
        const targetProvId = allProvIds[Math.floor(Math.random() * allProvIds.length)];
        const affectedProvIds = new Set([targetProvId]);

        // ★共通の魔法を呼び出します！（疫病の色は、毒々しい紫色です）
        await window.playProvinceMapEffect(
            game, 
            '疫病', 
            "【疫病流行】\n各地で恐ろしい疫病が流行の兆しを見せています……", 
            affectedProvIds, 
            128, 0, 128
        );

        // 選ばれた国のお城に被害を与えます
        game.castles.forEach(c => {
            if (c.ownerClan === 0) return; 
            
            if (affectedProvIds.has(c.provinceId)) {
                // 兵士数が 10% ～ 30% ランダムで減ります
                const solDropRate = 0.10 + (Math.random() * 0.20);
                c.soldiers = Math.max(0, Math.floor(c.soldiers * (1.0 - solDropRate)));
                
                // 人口が 10% ～ 20% ランダムで減ります
                const popDropRate = 0.10 + (Math.random() * 0.10);
                c.population = Math.max(0, Math.floor(c.population * (1.0 - popDropRate)));
                
                // 兵士と人口の減少割合（％）を足し算して、民忠をガクッと下げます
                const loyaltyDrop = Math.floor(solDropRate * 100) + Math.floor(popDropRate * 100);
                c.peoplesLoyalty = Math.max(0, c.peoplesLoyalty - loyaltyDrop);
            }
        });
    }
});

// ==========================================
// ★ 不定期イベント：地震（月末処理後）
// ==========================================
window.GameEvents.push({
    id: "earthquake_event_random",
    timing: "endMonth_after", // これも月末の処理が終わった後に判定します
    isOneTime: false,
    
    checkCondition: function(game) {
        // 0.2%（1000回に2回）の確率で、地震のスイッチが入ります
        return Math.random() < 0.002;
    },
    
    execute: async function(game) {
        // 日本中にあるすべての国の「出席番号」を集めます
        const allProvIds = [...new Set(game.castles.filter(c => c.provinceId > 0).map(c => c.provinceId))];
        if (allProvIds.length === 0) return;
        
        // その中から、くじ引きで「ランダムな１つの国」を選びます
        const targetProvId = allProvIds[Math.floor(Math.random() * allProvIds.length)];
        const affectedProvIds = new Set([targetProvId]);

        // ★共通の魔法を呼び出します！（地震の色は、大地を思わせる茶色です）
        await window.playProvinceMapEffect(
            game, 
            '地震', 
            "【大地震】\n大きな地鳴りとともに、大地が激しく揺れました！", 
            affectedProvIds, 
            139, 69, 19
        );

        // 選ばれた国のお城に被害を与えます
        game.castles.forEach(c => {
            if (c.ownerClan === 0) return; 
            
            if (affectedProvIds.has(c.provinceId)) {
                // 兵士数が 5% ～ 15% ランダムで減ります
                const solDropRate = 0.05 + (Math.random() * 0.10);
                c.soldiers = Math.max(0, Math.floor(c.soldiers * (1.0 - solDropRate)));
                
                // 人口が 0.1% ～ 5% ランダムで減ります
                const popDropRate = 0.001 + (Math.random() * 0.049);
                c.population = Math.max(0, Math.floor(c.population * (1.0 - popDropRate)));
                
                // 石高が 5% ～ 30% ランダムで減ります（田んぼが崩れてしまいます）
                const kokuDropRate = 0.05 + (Math.random() * 0.25);
                c.kokudaka = Math.max(0, Math.floor(c.kokudaka * (1.0 - kokuDropRate)));
                
                // 城防御が 20% ～ 50% も大きく減ります（城壁や門が壊れてしまいます）
                const defDropRate = 0.20 + (Math.random() * 0.30);
                c.defense = Math.max(0, Math.floor(c.defense * (1.0 - defDropRate)));
            }
        });
    }
});

// ==========================================
// ★ 季節イベント：大雪の発生（11〜2月の月末処理後）
// ==========================================
window.GameEvents.push({
    id: "heavy_snow_trigger",
    timing: "endMonth_after", // 11〜2月の月末の処理が終わった後に判定します
    isOneTime: false,
    
    checkCondition: function(game) {
        // 11月、12月、1月、2月の時だけ実行します
        return [11, 12, 1, 2].includes(game.month);
    },
    
    execute: async function(game) {
        const regionsToSnow = new Set();
        
        // 地方ごとに発生確率を判定します
        if (Math.random() < 0.98) regionsToSnow.add(1); // 東北（98%）
        if (Math.random() < 0.95) regionsToSnow.add(2); // 北陸（95%）
        if (Math.random() < 0.40) regionsToSnow.add(3); // 甲信（40%）
        if (Math.random() < 0.03) regionsToSnow.add(4); // 関東（3%）
        
        // どこも大雪の判定が成功しなかったら、何もせずにおしまいです
        if (regionsToSnow.size === 0) return;

        let isNewSnowAdded = false; // 新しく雪が降る国が増えたかどうかのメモです
        const allSnowProvIds = new Set(); // 今月雪が降っているすべての国を入れる箱です

        // 国ごとにチェックしていきます
        game.provinces.forEach(p => {
            const hasSnow = p.statusEffects && p.statusEffects.includes('heavySnow');
            
            if (hasSnow) {
                // ① すでに雪のシールが貼られている国は、そのまま箱に入れます
                allSnowProvIds.add(p.id);
            } else if (regionsToSnow.has(p.regionId)) {
                // ② まだ雪のシールがなくて、今回大雪の判定が成功した地方の国の場合
                allSnowProvIds.add(p.id);
                isNewSnowAdded = true; // 新しく雪が降る国が増えました！
                
                // 新しく雪のシールを貼ります
                if (!p.statusEffects) p.statusEffects = [];
                p.statusEffects.push('heavySnow');
            }
        });

        // ★新しく雪が降る国が増えた時だけ、すべての雪国をまとめて地図で光らせます！
        if (isNewSnowAdded && allSnowProvIds.size > 0) {
            await window.playProvinceMapEffect(
                game, 
                '大雪', 
                "【大雪】\n厳しい冬が訪れ、各地が大雪に見舞われています……", 
                allSnowProvIds, 
                125, 199, 255
            );
        }
    }
});

// ==========================================
// ★ 季節イベント：大雪の被害 ＆ ３月の雪解け（各処理の開始前）
// ==========================================
window.GameEvents.push({
    id: "heavy_snow_damage_and_clear",
    timing: "startMonth_before", // ★毎月の各処理が始まる「前」に実行します
    isOneTime: false,
    
    checkCondition: function(game) {
        // 毎月必ずチェックします
        return true;
    },
    
    execute: async function(game) {
        // ① もし３月だったら、ダメージは与えずに雪のシールを全部剥がします（雪解け）
        if (game.month === 3) {
            game.provinces.forEach(p => {
                if (p.statusEffects) {
                    p.statusEffects = p.statusEffects.filter(s => s !== 'heavySnow');
                }
            });
            return; // ここで処理はおしまいです
        }

        // ② ３月以外の場合、大雪シールが貼られている国を探します
        const snowProvIds = new Set();
        game.provinces.forEach(p => {
            if (p.statusEffects && p.statusEffects.includes('heavySnow')) {
                snowProvIds.add(p.id);
            }
        });

        // 雪が降っている国がなければ、何もしないでおしまいです
        if (snowProvIds.size === 0) return;

        // ③ 雪が降っている国のお城に、毎月のジワジワとした被害を与えます
        game.castles.forEach(c => {
            if (c.ownerClan === 0) return; 
            
            if (snowProvIds.has(c.provinceId)) {
                // 石高が 1% ～ 5% ランダムで減ります
                const kokuDropRate = 0.01 + (Math.random() * 0.04);
                c.kokudaka = Math.max(0, Math.floor(c.kokudaka * (1.0 - kokuDropRate)));
                
                // 城防御が 1% ～ 5% ランダムで減ります
                const defDropRate = 0.01 + (Math.random() * 0.04);
                c.defense = Math.max(0, Math.floor(c.defense * (1.0 - defDropRate)));

                // 兵士数が 1% ～ 5% ランダムで減ります（凍傷や逃亡）
                const solDropRate = 0.01 + (Math.random() * 0.04);
                c.soldiers = Math.max(0, Math.floor(c.soldiers * (1.0 - solDropRate)));
                
                // 人口が 0.01% ～ 0.05% ランダムで減ります
                // （0.01% は小数にすると 0.0001 になります）
                const popDropRate = 0.0001 + (Math.random() * 0.0004);
                c.population = Math.max(0, Math.floor(c.population * (1.0 - popDropRate)));
                
                // 民忠が 1 ～ 5 ランダムで下がります
                const loyaltyDrop = Math.floor(Math.random() * 5) + 1;
                c.peoplesLoyalty = Math.max(0, c.peoplesLoyalty - loyaltyDrop);

                // 士気が 3 ～ 5 ランダムで下がります
                const moraleDrop = Math.floor(Math.random() * 3) + 3;
                c.morale = Math.max(0, c.morale - moraleDrop);
            }
        });
    }
});