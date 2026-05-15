/**
 * common_events.js
 * ゲーム内の共通イベント（毎月発生するものなど）を入れるファイルです。
 */

// ==========================================
// ★ イベントの始まりに音を鳴らして、少しの間画面を守る魔法
// ==========================================
window.playEventSoundAndBlock = function() {
    if (window.AudioManager) window.AudioManager.playSE('event001.ogg');
};

// ==========================================
// ★ マップを光らせる共通の魔法（いろんなイベントで使い回せます！）
// ==========================================
window.playProvinceMapEffect = async function(game, eventType, initialMsg, affectedProvIds, drawR, drawG, drawB) {
    if (affectedProvIds.size === 0 || !game.ui) return;
    
    // ★ダイアログを出す前に、音を鳴らしてバリアを張る魔法を呼びます！
    if (window.playEventSoundAndBlock) window.playEventSoundAndBlock();
    
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
        if (eventType === '豊作') msg = `${pName}は豊作です！`;
        else if (eventType === '凶作') msg = `${pName}は凶作に見舞われています……`;
        else if (eventType === '飢饉') msg = `${pName}で飢饉が発生し、甚大な被害が出ています……`;
        else if (eventType === '疫病') msg = `${pName}で恐ろしい疫病が猛威を振るっています……`;
        else if (eventType === '地震') msg = `${pName}で大地震による甚大な被害が出ています……`;
        else if (eventType === '大雪') msg = `${pName}は深い雪に閉ざされています……`; // ★これを書き足しました！
        
        await game.ui.showDialogAsync(msg, false, 0);
    }
};

// ==========================================
// ★ ゲーム開始時：特定武将の寿命延長
// ==========================================
window.GameEvents.push({
    id: "common_life_extension",
    timing: "game_start",            // ゲーム開始直後のタイミング
    isOneTime: true,                 // 1回だけ実行します
    
    checkCondition: function(game) {
        // ゲーム開始時に必ず実行するので、無条件で true を返します
        return true;
    },
    
    execute: async function(game) {
        // 対象となる武将のIDリスト（今川義元、足利義輝、三好長慶）
        const targetIds = [1004001, 1017001, 1020001];
        
        for (const id of targetIds) {
            const busho = game.getBusho(id);
            // 武将が見つかったら、寿命（没年）を5年延ばします
            if (busho) {
                busho.endYear += 10;
            }
        }
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

// ==========================================
// ★ 毎月の一揆イベント（発生・継続・解除）
// ==========================================
window.GameEvents.push({
    id: "ikki_event_monthly",
    timing: "startMonth_before", // 収入の前に実行します
    isOneTime: false,
    
    checkCondition: function(game) {
        return true; // 毎月必ずチェックします
    },
    
    execute: async function(game) {
        let playerIkkiCastles = []; // ★変更：自分の大名家で一揆が起きた城だけをメモする箱にします

        game.castles.forEach(c => {
            // 城のシール帳がなければ用意します
            if (!c.statusEffects) c.statusEffects = [];

            if (c.ownerClan === 0) {
                // 空き城になったら、一揆のシールを綺麗に剥がしておきます
                c.statusEffects = c.statusEffects.filter(s => s !== '一揆');
                return; // 空き城での一揆処理はおしまいです
            }

            const isIkki = c.statusEffects.includes('一揆');
            
            if (isIkki) {
                // 【一揆中】まずは解除されるかチェックします！
                if (c.peoplesLoyalty >= 50) {
                    // 民忠50で25%、95以上で100%の確率で解除されます
                    let clearProb = 0.25;
                    if (c.peoplesLoyalty >= 95) {
                        clearProb = 1.0;
                    } else {
                        clearProb = 0.25 + ((c.peoplesLoyalty - 50) / 45) * 0.75;
                    }
                    
                    if (Math.random() < clearProb) {
                        // 解除成功！シールを剥がして次の城へ行きます
                        c.statusEffects = c.statusEffects.filter(s => s !== '一揆');
                        return; // 解除されたら今月の継続ダメージは受けません
                    }
                }
                
                // 【一揆継続】解除されなかったら、今月の被害を受けます
                c.kokudaka = Math.max(0, Math.floor(c.kokudaka * 0.95));     // 石高5%減少
                c.defense = Math.max(0, Math.floor(c.defense * 0.95));       // 防御5%減少
                c.population = Math.max(0, Math.floor(c.population * 0.98)); // 人口2%減少

            } else {
                // 【平常時】民忠が49以下なら、一揆が起きるかチェックします！
                if (c.peoplesLoyalty <= 49) {
                    // 民忠49で1%、0で100%の確率で発生します
                    const occurProb = 0.01 + ((49 - c.peoplesLoyalty) / 49) * 0.99;
                    
                    if (Math.random() < occurProb) {
                        // 一揆発生！シールを貼ります
                        c.statusEffects.push('一揆');
                        
                        // ★変更：自分のお城の時だけ、後でお知らせするためにメモします
                        if (c.ownerClan === game.playerClanId) {
                            playerIkkiCastles.push(c.name || "どこかの城");
                        }
                        
                        // 発生した瞬間の大きな被害を受けます
                        c.kokudaka = Math.max(0, Math.floor(c.kokudaka * 0.90));     // 石高10%減少
                        c.defense = Math.max(0, Math.floor(c.defense * 0.90));       // 防御10%減少
                        c.population = Math.max(0, Math.floor(c.population * 0.95)); // 人口5%減少
                    }
                }
            }
        });
        
        // ★変更：自分のお城で一揆が起きていたら、１つずつ順番に画面でお知らせします
        if (playerIkkiCastles.length > 0 && game.ui) {
            // ★お知らせを出す前に、音を鳴らしてバリアを張ります！
            if (window.playEventSoundAndBlock) window.playEventSoundAndBlock();
            
            for (let cName of playerIkkiCastles) {
                const msg = `領民の不満が爆発し、当家の「${cName}」で一揆が発生しました！`;
                await game.ui.showDialogAsync(msg, false, 0);
            }
        }
    }
});

// ==========================================
// ★ 毎月の兵糧攻めイベント（発生・継続・解除）
// ==========================================
window.GameEvents.push({
    id: "starving_tactics_monthly",
    timing: "startMonth_before", // 収入の前に実行します
    isOneTime: false,
    
    checkCondition: function(game) {
        return true; // 毎月必ずチェックします
    },
    
    execute: async function(game) {
        game.castles.forEach(c => {
            // 城のシール帳がなければ用意します
            if (!c.statusEffects) c.statusEffects = [];

            if (c.ownerClan === 0) {
                // 空き城になったら、兵糧攻めのシールを綺麗に剥がしておきます
                c.statusEffects = c.statusEffects.filter(s => s !== '糧攻');
                return; // 空き城での兵糧攻め処理はおしまいです
            }

            let isSurrounded = false;
            
            // 道が繋がっている城（お隣さん）がいるかチェックします
            if (c.adjacentCastleIds && c.adjacentCastleIds.length > 0) {
                isSurrounded = true; // 最初は「包囲されている」と仮定します
                
                for (let adjId of c.adjacentCastleIds) {
                    const adjCastle = game.getCastle(adjId);
                    if (!adjCastle) continue;
                    
                    // お隣さんが「敵」かどうか調べます
                    let isEnemy = false;
                    if (adjCastle.ownerClan !== 0 && adjCastle.ownerClan !== c.ownerClan) {
                        const rel = game.getRelation(c.ownerClan, adjCastle.ownerClan);
                        // ★関係が明確に「敵対」の時だけ、包囲している敵としてカウントします！
                        if (rel && rel.status === '敵対') {
                            isEnemy = true;
                        }
                    }
                    
                    // もしお隣さんが「敵じゃない（味方、同盟、支配、空き城）」なら、包囲されていません！
                    if (!isEnemy) {
                        isSurrounded = false;
                        break; // １つでも安全な道があればチェック終了です
                    }
                }
            }
            
            const hasSeal = c.statusEffects.includes('糧攻');
            
            if (isSurrounded) {
                // 【兵糧攻め状態】
                // シールが貼られていなければ貼ります
                if (!hasSeal) {
                    c.statusEffects.push('糧攻');
                }
                
                // 毎月のダメージ（士気と民忠が今の数字から10%下がります）
                c.morale = Math.floor(c.morale * 0.90);
                c.peoplesLoyalty = Math.floor(c.peoplesLoyalty * 0.90);
                
                // 画面には出さず、左下のログにだけこっそり書き残します
                if (game.ui && game.ui.log) {
                    const cName = c.name || "どこかの城";
                    game.ui.log(`【兵糧攻め】${cName}は敵軍に完全に包囲されています……`);
                }
            } else {
                // 【解除または安全】
                if (hasSeal) {
                    // 包囲が解けたら、シールを綺麗に剥がします
                    c.statusEffects = c.statusEffects.filter(s => s !== '糧攻');
                }
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

            // ★ここから追加：日本中の米相場を動かします！
            game.provinces.forEach(prov => {
                if (prov && prov.marketRate !== undefined) {
                    // もしこの国が「凶作（badAffected）」に入っていたら 1.0 アップ！
                    if (badAffected.has(prov.id)) {
                        prov.marketRate = Math.min(window.MainParams.Economy.TradeRateMax, prov.marketRate + 1.0);
                    } else {
                        // 凶作じゃない他の国も、影響を受けて 0.5 アップ！
                        prov.marketRate = Math.min(window.MainParams.Economy.TradeRateMax, prov.marketRate + 0.5);
                    }
                }
            });

            // ★共通の魔法を呼び出します！（凶作の色は赤紫色）
            await window.playProvinceMapEffect(game, '凶作', "今年は各地で凶作に見舞われています……", badAffected, 180, 0, 180);
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

            // ★ここから追加：日本中の米相場を動かします！
            game.provinces.forEach(prov => {
                if (prov && prov.marketRate !== undefined) {
                    // もしこの国が「豊作（goodAffected）」に入っていたら 0.8 ダウン！
                    if (goodAffected.has(prov.id)) {
                        prov.marketRate = Math.max(window.MainParams.Economy.TradeRateMin, prov.marketRate - 0.8);
                    } else {
                        // 豊作じゃない他の国も、影響を受けて 0.2 ダウン！
                        prov.marketRate = Math.max(window.MainParams.Economy.TradeRateMin, prov.marketRate - 0.2);
                    }
                }
            });

            // ★共通の魔法を呼び出します！（豊作の色は黄金色）
            await window.playProvinceMapEffect(game, '豊作', "今年は各地で豊作の秋を迎えています！", goodAffected, 255, 215, 0);
        }

        // =========================================================
        // 【実行３】日本中の城で「９月の兵糧収入」を計算します！
        // =========================================================
        game.castles.forEach(c => {
            if (c.ownerClan === 0) return; 
            
            let riceIncome = GameSystem.calcBaseRiceIncome(c);
            riceIncome = GameSystem.applyVariance(riceIncome, window.MainParams.Economy.IncomeFluctuation);
            
            if (hasStatus(c.provinceId, 'badHarvest')) {
                riceIncome = Math.floor(riceIncome * 0.8);  //凶作なら80％の収入
            } else if (hasStatus(c.provinceId, 'goodHarvest')) {
                riceIncome = Math.floor(riceIncome * 1.3);  //豊作なら130%の収入
            }
            
            // ★追加：一揆状態の城は兵糧収入が４分の１になります！
            if (c.statusEffects && c.statusEffects.includes('一揆')) {
                riceIncome = Math.floor(riceIncome / 4);
            }
            // ★追加：兵糧攻め状態の城は兵糧収入が８分の１になります！
            if (c.statusEffects && c.statusEffects.includes('糧攻')) {
                riceIncome = Math.floor(riceIncome / 8);
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
            "各地で深刻な飢饉が発生しています……", 
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
            "恐ろしい疫病が流行の兆しを見せています……", 
            affectedProvIds, 
            128, 0, 128
        );

        // 選ばれた国のお城に疫病の被害を与えます
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
            "大きな地鳴りとともに、大地が激しく揺れました！", 
            affectedProvIds, 
            139, 69, 19
        );

        // 選ばれた国のお城に地震の被害を与えます
        game.castles.forEach(c => {
            if (c.ownerClan === 0) return; 
            
            if (affectedProvIds.has(c.provinceId)) {
                // 城防御力15につき1%のダメージ軽減率を計算します（最大100%カット）
                const defenseCutRate = Math.min(1.0, Math.floor(c.defense / 15) * 0.01);

                // 兵士数が 5% ～ 15% ランダムで減ります（防御力で被害軽減）
                const solDropRate = (0.05 + (Math.random() * 0.10)) * (1.0 - defenseCutRate);
                c.soldiers = Math.max(0, Math.floor(c.soldiers * (1.0 - solDropRate)));
                
                // 人口が 0.1% ～ 5% ランダムで減ります（防御力で被害軽減）
                const popDropRate = (0.001 + (Math.random() * 0.049)) * (1.0 - defenseCutRate);
                c.population = Math.max(0, Math.floor(c.population * (1.0 - popDropRate)));
                
                // 石高が 5% ～ 30% ランダムで減ります（防御力で被害軽減）
                const kokuDropRate = (0.05 + (Math.random() * 0.25)) * (1.0 - defenseCutRate);
                c.kokudaka = Math.max(0, Math.floor(c.kokudaka * (1.0 - kokuDropRate)));
                
                // 城防御が 20% ～ 50% も大きく減ります（城壁や門のダメージは軽減しません）
                const defDropRate = 0.20 + (Math.random() * 0.30);
                c.defense = Math.max(0, Math.floor(c.defense * (1.0 - defDropRate)));
            }
        });
    }
});

// ==========================================
// ★ 季節イベント：大雪の発生（12〜2月の月初の処理前）
// ==========================================
window.GameEvents.push({
    id: "heavy_snow_trigger",
    timing: "startMonth_before", 
    isOneTime: false,
    
    checkCondition: function(game) {
        // 12月、1月、2月の時だけ実行します
        return [12, 1, 2].includes(game.month);
    },
    
    execute: async function(game) {
        let isNewSnowAdded = false; // 新しく雪が降る国が増えたかどうかのメモです
        const allSnowProvIds = new Set(); // 今月雪が降っているすべての国を入れる箱です

        game.provinces.forEach(p => {
            const hasSnow = p.statusEffects && p.statusEffects.includes('heavySnow');
            
            if (hasSnow) {
                allSnowProvIds.add(p.id);
            } else {
                let willSnow = false;
                
                // ★ 新しい魔法：国ごとの「雪が降る確率」のリストです
                // 100%は「1.0」、1%は「0.01」という書き方をします
                const snowProbabilities = {
                    67: 0.99, // 蝦夷国 (99%)
                    1:  0.99, // 陸奥国 (99%)
                    2:  0.99, // 出羽国 (99%)
                    65: 0.97, // 佐渡国 (97%)
                    3:  0.97, // 越後国 (97%)
                    4:  0.95, // 越中国 (95%)
                    5:  0.93, // 越前国 (93%)
                    6:  0.95, // 加賀国 (95%)
                    7:  0.95, // 能登国 (95%)
                    8:  0.70, // 若狭国 (70%)
                    9:  0.20, // 甲斐国 (20%)
                    10: 0.60, // 信濃国 (60%)
                    11: 0.60, // 上野国 (60%)
                    12: 0.60, // 下野国 (60%)
                    13: 0.02, // 上総国 (2%)
                    14: 0.01, // 下総国 (1%)
                    15: 0.15, // 常陸国 (15%)
                    17: 0.15, // 武蔵国 (15%)
                    27: 0.02, // 美濃国 (2%)
                    28: 0.30, // 飛騨国 (30%)
                    29: 0.01, // 近江国 (1%)
                    38: 0.10  // 丹後国 (10%)
                };

                // リストに書かれている国ならその数字を、書かれていなければ 0（降らない）にします
                const prob = snowProbabilities[p.id] || 0;

                // もし確率が0より大きくて、サイコロが確率の中に収まったら雪を降らせます！
                if (prob > 0 && Math.random() < prob) {
                    willSnow = true;
                }

                if (willSnow) {
                    allSnowProvIds.add(p.id);
                    isNewSnowAdded = true; 
                    
                    if (!p.statusEffects) p.statusEffects = [];
                    p.statusEffects.push('heavySnow');
                }
            }
        });

        if (isNewSnowAdded && allSnowProvIds.size > 0) {
            if (game.ui && game.ui.updateSnowOverlay) game.ui.updateSnowOverlay();

            await window.playProvinceMapEffect(
                game, 
                '大雪',
                "厳しい冬が訪れ、各地が大雪に見舞われています……", 
                allSnowProvIds, 
                99, 188, 255
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
            let hadSnow = false; // 日本のどこかに雪が積もっていたかをメモする箱です

            game.provinces.forEach(p => {
                // その国に雪のシールが貼られているかチェックします
                if (p.statusEffects && p.statusEffects.includes('heavySnow')) {
                    hadSnow = true; // 雪が積もっている国を見つけました！
                    // 雪のシールを綺麗に剥がします
                    p.statusEffects = p.statusEffects.filter(s => s !== 'heavySnow');
                }
            });

            // どこかに雪が積もっていたなら、春の訪れをメッセージだけでお知らせします
            if (hadSnow && game.ui) {
                // ★春の訪れとともに、マップの水玉模様を消します！
                if (game.ui.updateSnowOverlay) game.ui.updateSnowOverlay();

                await game.ui.showDialogAsync("雪解けの季節です", false, 0);
            }
            
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

        // ③-1 まずは雪が降っている国の米相場をジワジワと上げます！
        snowProvIds.forEach(pId => {
            const prov = game.provinces.find(p => p.id === pId);
            if (prov && prov.marketRate !== undefined) {
                prov.marketRate = Math.min(window.MainParams.Economy.TradeRateMax, prov.marketRate + 0.1);
            }
        });

        // ③-2 雪が降っている国のお城に、毎月のジワジワとした被害を与えます
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

// ==========================================
// ★ 毎月の交易収入イベント（隣接する友好国などとの往来）
// ==========================================
window.GameEvents.push({
    id: "trade_income_monthly",
    timing: "startMonth_after", // 月初の収入処理が終わった後に実行します
    isOneTime: false,
    
    checkCondition: function(game) {
        return true; // 毎月必ず実行します
    },
    
    execute: async function(game) {
        // 各大名家ごとに順番に計算します
        game.clans.forEach(clan => {
            if (clan.id === 0) return; // 空き家は除外します
            
            let totalTradeIncome = 0;
            let logMessages = [];
            
            // まずは自分の領地（お城のリスト）を集めます
            const myCastles = game.castles.filter(c => c.ownerClan === clan.id);
            if (myCastles.length === 0) return; // 城がなければスキップします
            
            // 他の大名家との関係を調べます
            game.clans.forEach(targetClan => {
                if (targetClan.id === 0 || targetClan.id === clan.id) return;
                
                const rel = game.getRelation(clan.id, targetClan.id);
                // 関係が「友好」「同盟」「支配」「従属」のいずれかの場合のみ
                if (rel && ['友好', '同盟', '支配', '従属'].includes(rel.status)) {
                    const sentiment = rel.sentiment;
                    const targetCastles = game.castles.filter(c => c.ownerClan === targetClan.id);
                    
                    let targetIncome = 0;
                    
                    // 相手の城を一つずつ見て、自分の城と繋がっているか（隣接しているか）チェックします
                    targetCastles.forEach(tc => {
                        let isAdjacentToMe = false;
                        for (let mc of myCastles) {
                            if (GameSystem.isAdjacent(mc, tc)) {
                                isAdjacentToMe = true;
                                break;
                            }
                        }
                        
                        // 繋がっていれば（飛び地でなければ）、その城の人口から収入を計算します
                        if (isAdjacentToMe) {
                            // 収入量 = √人口 * (関係値 / 200)
                            const income = Math.floor(Math.sqrt(tc.population) * (sentiment / 200));
                            targetIncome += income;
                        }
                    });
                    
                    // 収入が発生し、かつプレイヤーが関係している場合だけログのメモを残します
                    if (targetIncome > 0) {
                        totalTradeIncome += targetIncome;
                        
                        if (clan.id === game.playerClanId) {
                            // 自分が得た収入の場合
                            logMessages.push(`【交易】${targetClan.name}との往来により、金${targetIncome} の収入を得ました`);
                        } else if (targetClan.id === game.playerClanId) {
                            // 相手が自分（プレイヤー）の領地のおかげで収入を得た場合
                            logMessages.push(`【交易】${clan.name}が当家との往来により、金${targetIncome} の利益を得ました`);
                        }
                    }
                }
            });
            
            // 集めた収入を、大名の居城に入れます
            if (totalTradeIncome > 0) {
                const leader = game.getBusho(clan.leaderId);
                if (leader) {
                    const daimyoCastle = game.getCastle(leader.castleId);
                    if (daimyoCastle) {
                        daimyoCastle.gold = Math.min(99999, daimyoCastle.gold + totalTradeIncome);
                    }
                }
            }
            
            // プレイヤーに関係するメモがあれば、左下のログに出力します
            if (logMessages.length > 0 && game.ui && game.ui.log) {
                logMessages.forEach(msg => game.ui.log(msg));
            }
        });
    }
});

// ==========================================
// ★ 毎月の浪人仕官イベント
// ==========================================
window.GameEvents.push({
    id: "ronin_employment_monthly",
    timing: "startMonth_after", 
    isOneTime: false,
    
    checkCondition: function(game) {
        return true; 
    },
    
    execute: async function(game) {
        // 諸勢力の頭領などでない、純粋な「浪人」だけをリストアップします
        const ronins = game.bushos.filter(b => b.status === 'ronin' && !b.belongKunishuId && !b.isAutoLeader);
        
        // 今月すでに処理した浪人をメモしておく箱です（追い払われた人が移動先で再度判定されないようにします）
        const processedRonins = new Set();
        
        for (const ronin of ronins) {
            if (processedRonins.has(ronin.id)) continue;
            
            const currentCastle = game.getCastle(ronin.castleId);
            // 浪人がお城にいない場合や、その城が空き城（所有者が0）の場合は仕官しません
            if (!currentCastle || currentCastle.ownerClan === 0) continue; 
            
            const clanId = currentCastle.ownerClan;
            const clanBushos = game.bushos.filter(b => b.clan === clanId && b.status !== 'dead');
            const daimyo = clanBushos.find(b => b.isDaimyo);
            
            // 何らかの理由でその大名家に大名がいなければスキップします
            if (!daimyo) continue;
            
            // 仕官先の勢力に、浪人の「宿敵」がいるかチェックします
            let hasNemesis = false;
            if (ronin.nemesisIds && ronin.nemesisIds.length > 0) {
                hasNemesis = ronin.nemesisIds.some(nId => {
                    const nBusho = game.getBusho(nId);
                    return nBusho && nBusho.clan === clanId && nBusho.status !== 'dead';
                });
            }
            // 宿敵がいれば絶対に仕官しないので、次の浪人のチェックへ進みます
            if (hasNemesis) continue; 
            
            // 大名と浪人の相性のズレを計算します（0〜50の数字になります）
            let affDiff = 50;
            if (typeof GameSystem !== 'undefined' && GameSystem.calcAffinityDiff) {
                affDiff = GameSystem.calcAffinityDiff(ronin.affinity, daimyo.affinity);
            } else {
                const diff = Math.abs(ronin.affinity - daimyo.affinity);
                affDiff = Math.min(diff, 100 - diff);
            }
            
            // 確率を計算します。
            // 基本確率2%(0.02) + 相性による変動分(最大±3%。相性差0で+3%, 25で0%, 50で-3%)
            let prob = 0.02 + 0.03 * (1.0 - (affDiff / 25));
            // 確率が0%を下回った場合は0%（カンスト最低値）にします
            prob = Math.max(0, prob);
            
            // サイコロを振って当たった場合、仕官の処理に入ります
            if (prob > 0 && Math.random() < prob) {
                processedRonins.add(ronin.id); // 処理済みとしてメモします
                
                if (clanId === game.playerClanId) {
                    // プレイヤーの勢力への仕官なら、ダイアログを表示して選択してもらいます
                    const rName = ronin.name.replace(/\|/g, ''); 
                    const nav = game.getNavigatorInfo(currentCastle);
                    const msg = `殿、${rName}という者が仕官先を求めて参りました。家臣に取り立てますか？`;
                    
                    if (window.playEventSoundAndBlock) window.playEventSoundAndBlock();
                    
                    // ゲームに元々あるダイアログ機能（決定・キャンセル付き）を呼び出します
                    const isEmployed = await new Promise(resolve => {
                        if (game.ui && game.ui.showDialog) {
                            // 第2引数を true にすると、自動で決定・キャンセルボタンが出ます
                            game.ui.showDialog(msg, true, 
                                () => { resolve(true); },  // 決定を選んだ場合
                                () => { resolve(false); }, // キャンセルを選んだ場合
                                { 
                                    leftFace: nav.faceIcon, 
                                    leftName: nav.name,
                                    okText: '家臣にする', // ←決定ボタンの文字を変更
                                    cancelText: '追い払う'     // ←キャンセルボタンの文字を変更
                                }
                            );
                        } else {
                            // 万が一UIが見つからない場合の安全策
                            resolve(false);
                        }
                    });
                    
                    if (isEmployed) {
                        game.affiliationSystem.joinClan(ronin, clanId, currentCastle.id);
                        
                        // ここから追加した部分です。勢力（大名家）の名前を調べて、メッセージ画面を出します。
                        const clanData = game.clans.find(c => c.id === clanId);
                        const clanName = clanData ? clanData.name : "当家";
                        if (game.ui && game.ui.showDialogAsync) {
                            await game.ui.showDialogAsync(`「ははっ！　これから${clanName}のために身命を賭して働きまする！」`, false, 0, {
                                leftFace: ronin.faceIcon,
                                leftName: rName
                            });
                            // さらにシステムメッセージを追加します。
                            await game.ui.showDialogAsync(`${rName}が${clanName}に加わりました！`, false, 0);
                        }
                        
                    } else {
                        const otherCastles = game.castles.filter(c => c.ownerClan !== clanId && c.ownerClan !== 0);
                        if (otherCastles.length > 0) {
                            otherCastles.sort((a, b) => {
                                const distA = Math.pow(a.x - currentCastle.x, 2) + Math.pow(a.y - currentCastle.y, 2);
                                const distB = Math.pow(b.x - currentCastle.x, 2) + Math.pow(b.y - currentCastle.y, 2);
                                return distA - distB;
                            });
                            const target = otherCastles[0];
                            game.affiliationSystem.leaveCastle(ronin);
                            game.affiliationSystem.enterCastle(ronin, target.id);
                        }
                    }
                } else {
                    game.affiliationSystem.joinClan(ronin, clanId, currentCastle.id);
                }
            }
        }
    }
});

// ==========================================
// ★ AI勢力からの臣従申し出イベント（月初処理後）
// ==========================================
window.GameEvents.push({
    id: "ai_vassalage_offer_monthly",
    timing: "startMonth_after",
    isOneTime: false,
    
    checkCondition: function(game) {
        return true; 
    },
    
    execute: async function(game) {
        if (!game.ui) return;

        const playerClanId = game.playerClanId;
        const playerClan = game.clans.find(c => c.id === playerClanId);
        const playerDaimyo = game.bushos.find(b => b.clan === playerClanId && b.isDaimyo);
        if (!playerClan || !playerDaimyo) return;

        let vassalageOfferClan = null;
        let envoy = null;
        let aiDaimyo = null;

        // すべての大名家の中から、条件を満たす勢力を順番に探していきます
        for (const clan of game.clans) {
            // 空き城データやプレイヤー自身の勢力は飛ばします
            if (clan.id === 0 || clan.id === playerClanId) continue;

            const diplomacyData = game.diplomacyManager.getDiplomacyData(clan.id, playerClanId);
            // プレイヤーに「従属」していない場合は飛ばします
            if (!diplomacyData || diplomacyData.status !== '従属') continue;

            // 従属・支配期間のカウントが24未満なら飛ばします
            if (diplomacyData.subordinateMonths < 24) continue;
            // プレイヤーとの関係値が100じゃないなら飛ばします
            if (diplomacyData.sentiment !== 100) continue;

            // プレイヤーの威信が相手の威信の12倍未満なら飛ばします
            if (playerClan.daimyoPrestige < clan.daimyoPrestige * 12) continue;

            // 複数の勢力に従属していないか（八方美人じゃないか）をチェックします
            let subordinateCount = 0;
            if (clan.diplomacyValue) {
                Object.values(clan.diplomacyValue).forEach(d => {
                    if (d.status === '従属') subordinateCount++;
                });
            }
            if (subordinateCount > 1) continue;

            const tempAiDaimyo = game.bushos.find(b => b.clan === clan.id && b.isDaimyo);
            if (!tempAiDaimyo) continue;

            // 大名同士の相性のズレを計算します（0〜50の数字になります）
            let affDiff = 25;
            if (typeof GameSystem !== 'undefined' && GameSystem.calcAffinityDiff) {
                affDiff = GameSystem.calcAffinityDiff(playerDaimyo.affinity, tempAiDaimyo.affinity);
            } else {
                const diff = Math.abs(playerDaimyo.affinity - tempAiDaimyo.affinity);
                affDiff = Math.min(diff, 100 - diff);
            }

            // 確率の計算です（相性差50で0%、0で2%になります）
            let prob = 2.0 * (1.0 - (affDiff / 50));
            // さらに、従属期間が長いほど確率をアップさせます（最大3%まで）
            prob += Math.min(3.0, Math.max(0, diplomacyData.subordinateMonths - 24) * 0.03);

            // サイコロを振って当たった場合、臣従イベントの対象に決定します！
            if (Math.random() * 100 < prob) {
                vassalageOfferClan = clan;
                aiDaimyo = tempAiDaimyo;
                break; // １度にいくつも来ると大変なので、１か月に１勢力までとします
            }
        }

        // 条件を満たす勢力がいなかったら、ここで魔法は終了です
        if (!vassalageOfferClan) return;

        // 使者役として、対象勢力の武将の中から一番「外交」の能力が高い人を選びます
        const envoys = game.bushos.filter(b => b.clan === vassalageOfferClan.id && b.status === 'active' && !b.isDaimyo).sort((a,b) => b.diplomacy - a.diplomacy);
        // もし他に武将がいなければ、仕方ないので大名自身にお使いに行ってもらいます
        envoy = envoys.length > 0 ? envoys[0] : aiDaimyo;

        // メッセージでお見せするための名前を綺麗に整えます（「織田|信長」の「|」を消す魔法です）
        const envoyName = envoy.name.replace(/\|/g, '');
        const playerDaimyoName = playerDaimyo.name.replace(/\|/g, '');
        const aiClanName = vassalageOfferClan.name;
        const aiDaimyoName = aiDaimyo.name.replace(/\|/g, '');
        // 下の名前がわかれば下の名前を、わからなければフルネームを使います
        const aiDaimyoGivenName = aiDaimyo.givenName ? aiDaimyo.givenName : aiDaimyoName;

        // ダイアログを出す前に、音を鳴らしてバリアを張る魔法を呼びます！
        if (window.playEventSoundAndBlock) window.playEventSoundAndBlock();
        
        await game.ui.showDialogAsync(`${aiClanName}より御使者が参っております。`, false, 0);

        await game.ui.showDialogAsync(`「此度は${aiClanName}当主・${aiDaimyoName}の名代として罷り越しました。急な訪問、平にご容赦くだされ」`, false, 0, {
            leftFace: envoy.faceIcon, leftName: envoyName
        });

        await game.ui.showDialogAsync(`「うむ。して、御用向きはいかに？」`, false, 0, {
            leftFace: playerDaimyo.faceIcon, leftName: playerDaimyoName
        });

        await game.ui.showDialogAsync(`「はっ……どうか我らを${playerClan.name}の末席にお加えいただきたく存じます」`, false, 0, {
            leftFace: envoy.faceIcon, leftName: envoyName
        });

        await game.ui.showDialogAsync(`「なんと、家臣になりたいと申されるか」`, false, 0, {
            leftFace: playerDaimyo.faceIcon, leftName: playerDaimyoName
        });

        // プレイヤーに決断してもらいます！
        const isAccepted = await new Promise(resolve => {
            game.ui.showDialog(`${aiClanName}を家臣に加えますか？`, true, 
                () => resolve(true),
                () => resolve(false),
                { okText: '家臣にする', okClass: 'btn-primary', cancelText: '断る' }
            );
        });

        if (isAccepted) {
            // 家臣にすることを承諾した時のお返事です
            await game.ui.showDialogAsync(`「よくぞご決心なされた。今後はその力、${playerClan.name}で存分に振るわれよ」`, false, 0, {
                leftFace: playerDaimyo.faceIcon, leftName: playerDaimyoName
            });
            await game.ui.showDialogAsync(`「ははっ！　ありがたき幸せに存じまする！」`, false, 0, {
                leftFace: envoy.faceIcon, leftName: envoyName
            });

            await game.ui.showDialogAsync(`${aiClanName} が ${playerClan.name} に臣従しました！`, false, 0);

            // ここから、相手の勢力を自分の勢力に吸収する魔法（臣従の処理）を行います
            const myClanId = vassalageOfferClan.id; // 吸収される側（AI）
            const targetClanId = playerClanId;      // 吸収する側（プレイヤー）

            // 1. AI側の軍団をすべて解散させます（お片付け）
            if (game.legions) {
                const myLegions = game.legions.filter(l => Number(l.clanId) === Number(myClanId));
                myLegions.forEach(l => {
                    if (game.castleManager && game.castleManager.disbandLegion) {
                        game.castleManager.disbandLegion(l.id);
                    }
                });
            }

            // 2. AI側のお城をすべてプレイヤーの大名家にプレゼントして、直轄（0）にします
            const myCastles = game.castles.filter(c => Number(c.ownerClan) === Number(myClanId));
            myCastles.forEach(c => {
                if (game.castleManager && game.castleManager.changeOwner) {
                    game.castleManager.changeOwner(c, targetClanId, true, 0);
                }
            });

            // 3. AI側の武将のバッジ（身分）を外し、プレイヤーの大名家に入れます
            const myBushos = game.bushos.filter(b => Number(b.clan) === Number(myClanId));
            myBushos.forEach(b => {
                b.isDaimyo = false;
                b.isCommander = false;
                b.isGunshi = false;
                
                b.clan = targetClanId;
                
                // 人事部（お引越しセンター）にお願いして、新しい殿様との相性で忠誠度を再計算します！
                if (game.affiliationSystem && game.affiliationSystem.updateLoyaltyForNewLord) {
                    game.affiliationSystem.updateLoyaltyForNewLord(b, targetClanId);
                }
            });

            // 最後に、新しい大名家の情報に合わせて画面を綺麗に描き直します
            if (game.ui.updatePanelHeader) game.ui.updatePanelHeader();
            if (game.ui.renderCommandMenu) game.ui.renderCommandMenu();
            if (game.ui.renderMap) game.ui.renderMap();

        } else {
            // 家臣にすることを断った時のお返事です
            await game.ui.showDialogAsync(`「すまぬが、他家を取り込むつもりはない。これまで通り当家を支えていただききたく存ずる」`, false, 0, {
                leftFace: playerDaimyo.faceIcon, leftName: playerDaimyoName
            });
            await game.ui.showDialogAsync(`「……承知仕った。${aiDaimyoGivenName}様にはそのようにお伝えし申す」`, false, 0, {
                leftFace: envoy.faceIcon, leftName: envoyName
            });
        }
    }
});