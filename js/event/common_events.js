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
// ★Round16：イベント専用マップの共通基盤
// 白地図・半解像度Canvas・国マスク・タップ待ち・後始末を一元化します。
// ==========================================
window.EventMapEffects = window.EventMapEffects || (() => {
    const WHITE_MAP_SRC = './data/images/map/japan_white_map.png';
    const PROVINCE_MAP_SRC = './data/images/map/japan_provinces.png';
    const CASTLE_COLOR_MAP_SRC = './data/images/map/japan_colorcode_map.png';

    const writeDiag = (game, label) => {
        if (game && typeof game.writeSystemDiagnostic === 'function') {
            game.writeSystemDiagnostic(label);
        }
    };

    const waitForImage = async (img, timeoutMs = 1000) => {
        if (!img) return false;
        if (img.complete && img.naturalWidth > 0) {
            if (typeof img.decode === 'function') {
                try { await img.decode(); } catch (e) {}
            }
            return true;
        }
        await new Promise(resolve => {
            let done = false;
            const finish = () => {
                if (done) return;
                done = true;
                img.onload = null;
                img.onerror = null;
                resolve();
            };
            img.onload = finish;
            img.onerror = finish;
            setTimeout(finish, timeoutMs);
        });
        if (img.naturalWidth > 0 && typeof img.decode === 'function') {
            try { await img.decode(); } catch (e) {}
        }
        return img.naturalWidth > 0;
    };

    const nextPaint = () => new Promise(resolve => {
        if (typeof requestAnimationFrame === 'function') requestAnimationFrame(() => resolve());
        else setTimeout(resolve, 0);
    });

    // Round20: イベント地図を載せる間だけ、スマホの巨大通常マップを合成対象から外します。
    // 半透明暗幕の裏で通常マップ一式を保持したまま、別の1200x800画像をdecodeするピークを避けます。
    const suspendMainMapForOverlay = async (game, mapOverlay, diagPrefix = null) => {
        const isPC = document.body.classList.contains('is-pc');
        const ui = game && game.ui;
        const scroll = document.getElementById('map-scroll-container');
        const state = {
            ui,
            pausedByUs: false,
            scroll,
            oldDisplay: scroll ? scroll.style.display : '',
            isPC
        };

        // 暗幕生成途中で例外になってもcleanupOverlay()が復帰情報を拾えるよう、
        // 通常マップを触る前にrestore stateを暗幕へ結び付ける。
        mapOverlay._eventMapRestoreState = state;
        if (ui && typeof ui.pauseBackgroundUpdates === 'function' && !ui.isBackgroundPaused) {
            // pauseBackgroundUpdates()自身が途中で例外化しても、cleanup側でresumeを試せるよう先に記録する。
            state.pausedByUs = true;
            ui.pauseBackgroundUpdates();
        }

        // PCは余裕があるため従来表示を維持。スマホだけ巨大マップを一時的に外します。
        if (!isPC && scroll) scroll.style.display = 'none';
        if (diagPrefix) writeDiag(game, `${diagPrefix}:main_map_suspended`);

        // display:none をcompositorへ反映してからイベント地図を作ります。
        if (!isPC) await nextPaint();
        return state;
    };

    // Round22: スマホの軽量地図でも「海岸線・国境線」がはっきり読めるようにします。
    // 元画像をdecodeせず pixelProvinceMap から生成する軽量方針はRound20のまま維持します。
    const sampleProvinceForCanvas = (pixelProvinceMap, srcW, srcH, dstW, dstH, dx, dy) => {
        if (dx < 0 || dy < 0 || dx >= dstW || dy >= dstH) return 0;
        const sx = Math.min(srcW - 1, Math.floor(((dx + 0.5) * srcW) / dstW));
        const sy = Math.min(srcH - 1, Math.floor(((dy + 0.5) * srcH) / dstH));
        return pixelProvinceMap[sy * srcW + sx] || 0;
    };

    // province画像の境界ピクセル自体が0(透明)のデータでも、両側の国IDを見て境界として復元します。
    // これにより半解像度化しても国境が消えにくくなります。
    const isProvinceBoundaryPixel = (pixelProvinceMap, srcW, srcH, dstW, dstH, x, y) => {
        const pid = sampleProvinceForCanvas(pixelProvinceMap, srcW, srcH, dstW, dstH, x, y);
        const left  = sampleProvinceForCanvas(pixelProvinceMap, srcW, srcH, dstW, dstH, x - 1, y);
        const right = sampleProvinceForCanvas(pixelProvinceMap, srcW, srcH, dstW, dstH, x + 1, y);
        const up    = sampleProvinceForCanvas(pixelProvinceMap, srcW, srcH, dstW, dstH, x, y - 1);
        const down  = sampleProvinceForCanvas(pixelProvinceMap, srcW, srcH, dstW, dstH, x, y + 1);

        if (pid) {
            // 海岸線も国境線も境界として扱います。
            return left !== pid || right !== pid || up !== pid || down !== pid;
        }

        // 元の国境線が透明ピクセルの場合、1px先だけでは両側が0になることがあるため2px先まで確認します。
        const left2  = left  || sampleProvinceForCanvas(pixelProvinceMap, srcW, srcH, dstW, dstH, x - 2, y);
        const right2 = right || sampleProvinceForCanvas(pixelProvinceMap, srcW, srcH, dstW, dstH, x + 2, y);
        const up2    = up    || sampleProvinceForCanvas(pixelProvinceMap, srcW, srcH, dstW, dstH, x, y - 2);
        const down2  = down  || sampleProvinceForCanvas(pixelProvinceMap, srcW, srcH, dstW, dstH, x, y + 2);
        return (left2 && right2 && left2 !== right2) || (up2 && down2 && up2 !== down2);
    };

    const drawProvinceBoundaries = (dst, pixelProvinceMap, srcW, srcH, dstW, dstH, tone = 72, alpha = 245, thickness = 1) => {
        if (!dst || !pixelProvinceMap) return;
        const radius = Math.max(0, Math.floor(thickness) - 1);
        for (let y = 0; y < dstH; y++) {
            for (let x = 0; x < dstW; x++) {
                if (!isProvinceBoundaryPixel(pixelProvinceMap, srcW, srcH, dstW, dstH, x, y)) continue;

                for (let oy = -radius; oy <= radius; oy++) {
                    for (let ox = -radius; ox <= radius; ox++) {
                        // thickness=2 は境界の周囲1pxまで広げます。小さな国を潰しにくいよう円形に近い膨張にします。
                        if (radius > 0 && Math.abs(ox) + Math.abs(oy) > radius) continue;
                        const px = x + ox;
                        const py = y + oy;
                        if (px < 0 || py < 0 || px >= dstW || py >= dstH) continue;
                        const di = (py * dstW + px) * 4;
                        dst[di] = tone;
                        dst[di + 1] = tone;
                        dst[di + 2] = tone;
                        dst[di + 3] = alpha;
                    }
                }
            }
        }
    };

    const releaseCanvasBackingStore = (canvas) => {
        if (!canvas) return;
        try { canvas.width = 1; canvas.height = 1; } catch (e) {}
    };

    const createLightweightBaseCanvas = (game, options = {}) => {
        const mapW = game && game.mapWidth ? game.mapWidth : 1200;
        const mapH = game && game.mapHeight ? game.mapHeight : 800;
        const pixelProvinceMap = game && game.ui ? game.ui.pixelProvinceMap : null;
        if (!pixelProvinceMap || pixelProvinceMap.length < mapW * mapH) return null;

        const renderScale = options.renderScale || 0.5;
        const canvas = document.createElement('canvas');
        canvas.className = 'event-map-base-canvas';
        canvas.width = Math.max(1, Math.round(mapW * renderScale));
        canvas.height = Math.max(1, Math.round(mapH * renderScale));
        canvas.style.width = '100%';
        canvas.style.height = 'auto';
        canvas.style.display = 'block';
        canvas.style.pointerEvents = 'none';

        try {
            const ctx = canvas.getContext('2d');
            if (!ctx) {
                releaseCanvasBackingStore(canvas);
                return null;
            }
            const img = ctx.createImageData(canvas.width, canvas.height);
            const dst = img.data;

            // Round24：海もこの既存Canvasへ直接描きます。
            // 追加CanvasやCSSフィルタは使わず、1回のImageData生成の中だけで完結させるためGPU負荷は増やしません。
            // 海は青水色、陸地は明るい生成り色。海には18px間隔で短い1px線を入れて、
            // 古いスマホでも地図らしさを出しつつ合成レイヤーを増やさないようにします。
            for (let y = 0; y < canvas.height; y++) {
                const seaPatternRow = (y % 18) === 7;
                const seaPatternShift = (Math.floor(y / 18) * 11) % 42;
                for (let x = 0; x < canvas.width; x++) {
                    const pid = sampleProvinceForCanvas(pixelProvinceMap, mapW, mapH, canvas.width, canvas.height, x, y);
                    const di = (y * canvas.width + x) * 4;
                    if (pid) {
                        // 陸地の色
                        dst[di] = 248;
                        dst[di + 1] = 248;
                        dst[di + 2] = 244;
                        dst[di + 3] = 255;
                    } else {
                        const wave = seaPatternRow && ((x + seaPatternShift) % 42) < 16;
                        // 海・波模様
                        dst[di] = wave ? 146 : 59;
                        dst[di + 1] = wave ? 194 : 139;
                        dst[di + 2] = wave ? 238 : 199;
                        dst[di + 3] = 255;
                    }
                }
            }

            // 最後に海岸線・国境線を濃く上書きします。
            // 「透明な国境ピクセル」も復元するため、白い一枚板に見える問題を防ぎます。
            drawProvinceBoundaries(dst, pixelProvinceMap, mapW, mapH, canvas.width, canvas.height, 28, 255, 2);

            ctx.putImageData(img, 0, 0);
            return canvas;
        } catch (error) {
            // context loss / ImageData確保失敗は演出だけを諦め、通常イベント進行を止めない。
            console.warn('イベント用軽量地図Canvasの生成をスキップしました:', error);
            releaseCanvasBackingStore(canvas);
            return null;
        }
    };

    const createOverlay = async (game, options = {}) => {
        const diagPrefix = options.diagPrefix || null;
        const isPC = document.body.classList.contains('is-pc');

        // まず軽い暗幕だけを置きます。スマホは完全不透明にして裏の巨大マップを合成不要にします。
        const mapOverlay = document.createElement('div');
        mapOverlay.className = 'event-map-overlay';
        mapOverlay.style.position = 'fixed';
        mapOverlay.style.top = '0';
        mapOverlay.style.left = '0';
        mapOverlay.style.width = '100%';
        mapOverlay.style.height = '100%';
        mapOverlay.style.backgroundColor = options.overlayColor || (isPC ? 'rgba(0,0,0,0.85)' : '#000');
        mapOverlay.style.zIndex = String(options.zIndex || 7500);
        mapOverlay.style.display = 'flex';
        mapOverlay.style.justifyContent = 'center';
        mapOverlay.style.alignItems = 'center';
        try {
            document.body.appendChild(mapOverlay);
            if (diagPrefix) writeDiag(game, `${diagPrefix}:overlay_dom`);

            // createOverlay()が返る前の失敗は呼び出し側がmapOverlayを保持できないため、
            // shell生成責務の中で必ず自前rollbackする。
            await suspendMainMapForOverlay(game, mapOverlay, diagPrefix);

            const mapContainer = document.createElement('div');
            mapContainer.className = 'event-map-container';
            mapContainer.style.position = 'relative';
            mapContainer.style.width = options.width || '95%';
            mapContainer.style.maxWidth = options.maxWidth || '800px';
            mapContainer.style.border = options.border || '4px solid #fff';
            mapContainer.style.borderRadius = options.borderRadius || '8px';
            mapContainer.style.backgroundColor = options.backgroundColor || (isPC ? '#81c784' : '#b7e0f0');
            mapContainer.style.overflow = 'hidden';

            let whiteMapImg = null;
            let baseCanvas = null;

            if (!isPC && !options.forceImageBase) {
                if (diagPrefix) writeDiag(game, `${diagPrefix}:base_canvas_build`);
                baseCanvas = createLightweightBaseCanvas(game, { renderScale: options.renderScale || 0.5 });
                if (baseCanvas) {
                    mapContainer.appendChild(baseCanvas);
                    if (diagPrefix) writeDiag(game, `${diagPrefix}:base_canvas_done`);
                }
            }

            // pixelProvinceMapがまだ無い特殊ケース、またはPCだけ従来の白地図画像へフォールバックします。
            if (!baseCanvas) {
                if (diagPrefix) writeDiag(game, `${diagPrefix}:base_image_load`);
                whiteMapImg = new Image();
                whiteMapImg.src = options.mapSrc || WHITE_MAP_SRC;
                whiteMapImg.style.width = '100%';
                whiteMapImg.style.display = 'block';
                whiteMapImg.style.pointerEvents = 'none';
                mapContainer.appendChild(whiteMapImg);
            }

            mapOverlay.appendChild(mapContainer);

            if (whiteMapImg) {
                await waitForImage(whiteMapImg, options.imageTimeoutMs || 1000);
                if (diagPrefix) writeDiag(game, `${diagPrefix}:base_image_done`);
            }

            if (diagPrefix) writeDiag(game, `${diagPrefix}:overlay_ready`);
            return { mapOverlay, mapContainer, whiteMapImg, baseCanvas };
        } catch (error) {
            // 呼び出し側へ暗幕参照を返す前の失敗なので、ここで通常地図まで戻す。
            try { await cleanupOverlay(mapOverlay); } catch (cleanupError) {
                console.warn('イベント地図shell失敗後の後始末にも失敗しました:', cleanupError);
            }
            throw error;
        }
    };

    const getRenderScale = () => document.body.classList.contains('is-pc') ? 1 : 0.5;

    const ensureProvinceSource = async (game, diagPrefix = null) => {
        let mapW = Number(game.mapWidth || (typeof DataManager !== 'undefined' ? DataManager.mapImageWidth : 0) || 1200);
        let mapH = Number(game.mapHeight || (typeof DataManager !== 'undefined' ? DataManager.mapImageHeight : 0) || 800);
        let pixelProvinceMap = (game.ui && game.ui.pixelProvinceMap)
            || (typeof DataManager !== 'undefined' ? DataManager.provincePixelMap : null);

        // 通常はゲーム開始時にDataManagerが作った共有IDマップをそのまま使います。
        // 特殊な呼び出し順で未生成の場合だけ、同じ帯状1走査ローダーで作り直します。
        if ((!pixelProvinceMap || pixelProvinceMap.length < mapW * mapH)
            && typeof DataManager !== 'undefined'
            && typeof DataManager.loadProvinceMap === 'function') {
            if (diagPrefix) writeDiag(game, `${diagPrefix}:source_load`);
            try {
                await DataManager.loadProvinceMap(PROVINCE_MAP_SRC, game.provinces || []);
                pixelProvinceMap = DataManager.provincePixelMap || null;
                mapW = Number(DataManager.mapImageWidth || mapW);
                mapH = Number(DataManager.mapImageHeight || mapH);
                if (game.ui) game.ui.pixelProvinceMap = pixelProvinceMap;
            } catch (e) {
                console.error('地方IDマップの再生成に失敗しました:', e);
            }
        }

        return {
            pixelProvinceMap: pixelProvinceMap && pixelProvinceMap.length >= mapW * mapH ? pixelProvinceMap : null,
            srcW: mapW,
            srcH: mapH
        };
    };

    const createProvinceCanvas = async (game, affectedProvIds, color, options = {}) => {
        const src = await ensureProvinceSource(game, options.diagPrefix || null);
        const renderScale = options.renderScale || getRenderScale();
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(src.srcW * renderScale));
        canvas.height = Math.max(1, Math.round(src.srcH * renderScale));
        canvas.style.position = 'absolute';
        canvas.style.top = '0';
        canvas.style.left = '0';
        canvas.style.width = '100%';
        canvas.style.height = '100%';
        canvas.style.pointerEvents = 'none';
        if (options.animation) canvas.style.animation = options.animation;

        try {
            // 台風進路も同じCanvasへ追加描画するため、対象国が0件でもcontextは先に確認する。
            const ctx = canvas.getContext('2d');
            if (!ctx) {
                releaseCanvasBackingStore(canvas);
                return { canvas: null, srcW: src.srcW, srcH: src.srcH, renderScale };
            }

            const targetProvIds = affectedProvIds instanceof Set ? affectedProvIds : new Set(affectedProvIds || []);
            if (targetProvIds.size > 0 && src.pixelProvinceMap) {
                const img = ctx.createImageData(canvas.width, canvas.height);
                const dst = img.data;
                const drawR = color.r | 0, drawG = color.g | 0, drawB = color.b | 0;
                const alpha = color.a === undefined ? 180 : color.a | 0;

                for (let y = 0; y < canvas.height; y++) {
                    const sy = Math.min(src.srcH - 1, Math.floor(((y + 0.5) * src.srcH) / canvas.height));
                    for (let x = 0; x < canvas.width; x++) {
                        const sx = Math.min(src.srcW - 1, Math.floor(((x + 0.5) * src.srcW) / canvas.width));
                        if (!targetProvIds.has(src.pixelProvinceMap[sy * src.srcW + sx])) continue;
                        const di = (y * canvas.width + x) * 4;
                        dst[di] = drawR; dst[di + 1] = drawG; dst[di + 2] = drawB; dst[di + 3] = alpha;
                    }
                }

                // Round22: スマホでは災害色の上からも国境線を描き直します。
                // ベース地図に線があっても半透明/点滅色で埋もれるため、効果Canvas自身に線を持たせます。
                // 新しいCanvasは増やさないので、Round20のメモリ削減効果は維持されます。
                if (src.pixelProvinceMap && renderScale < 1) {
                    drawProvinceBoundaries(dst, src.pixelProvinceMap, src.srcW, src.srcH, canvas.width, canvas.height, 28, 245, 2);
                }

                ctx.putImageData(img, 0, 0);
            }

            return { canvas, srcW: src.srcW, srcH: src.srcH, renderScale };
        } catch (error) {
            console.warn('イベント用地方効果Canvasの生成をスキップしました:', error);
            releaseCanvasBackingStore(canvas);
            return { canvas: null, srcW: src.srcW, srcH: src.srcH, renderScale };
        }
    };

    // 台風の正確な拠点当たり判定用。
    // ゲーム開始時にDataManagerが作った「pixel -> castleId」の共有IDマップを再利用します。
    // 同色コードを共有する拠点が将来追加されても、castleId -> groupId の小さな表だけで旧色グループ挙動を保ちます。
    let castleColorIndexCache = null;
    const invalidateCaches = () => {
        // シナリオ切替時に旧castlePixelMapへの参照を残さない。
        castleColorIndexCache = null;
    };

    const ensureCastleColorIndex = async (game, diagPrefix = null) => {
        const pixelCastleMap = (game.ui && game.ui.pixelCastleMap)
            || (typeof DataManager !== 'undefined' ? DataManager.castlePixelMap : null);
        const width = Number(game.mapWidth || (typeof DataManager !== 'undefined' ? DataManager.mapImageWidth : 0) || 0);
        const height = Number(game.mapHeight || (typeof DataManager !== 'undefined' ? DataManager.mapImageHeight : 0) || 0);
        if (!pixelCastleMap || !width || !height || pixelCastleMap.length < width * height) return null;

        const signature = (game.castles || []).map(c => {
            let color = (c.castlesColorCode || c.colorCode || c.color_code || '').trim().toLowerCase();
            if (color && !color.startsWith('#')) color = '#' + color;
            return `${c.id}:${color}`;
        }).join('|');
        if (castleColorIndexCache
            && castleColorIndexCache.signature === signature
            && castleColorIndexCache.pixelCastleMap === pixelCastleMap) {
            return castleColorIndexCache;
        }

        if (diagPrefix) writeDiag(game, `${diagPrefix}:castle_index_build`);
        const colorToGroup = new Map();
        const castleGroupById = new Map();
        let nextGroup = 1;
        let maxCastleId = 0;
        for (const c of (game.castles || [])) {
            const castleId = Number(c.id) || 0;
            maxCastleId = Math.max(maxCastleId, castleId);
            let hex = (c.castlesColorCode || c.colorCode || c.color_code || '').trim().toLowerCase();
            if (!hex) continue;
            if (!hex.startsWith('#')) hex = '#' + hex;
            const m = /^#([0-9a-f]{6})$/i.exec(hex);
            if (!m) continue;
            const rgbKey = parseInt(m[1], 16);
            let groupId = colorToGroup.get(rgbKey);
            if (!groupId) {
                groupId = nextGroup++;
                colorToGroup.set(rgbKey, groupId);
            }
            castleGroupById.set(castleId, groupId);
        }

        const GroupArray = nextGroup <= 255 ? Uint8Array : (nextGroup <= 65535 ? Uint16Array : Uint32Array);
        const groupByCastleId = new GroupArray(maxCastleId + 1);
        castleGroupById.forEach((groupId, castleId) => {
            if (castleId >= 0 && castleId < groupByCastleId.length) groupByCastleId[castleId] = groupId;
        });

        castleColorIndexCache = {
            signature,
            width,
            height,
            pixelCastleMap,
            groupByCastleId,
            castleGroupById
        };
        if (diagPrefix) writeDiag(game, `${diagPrefix}:castle_index_done`);
        return castleColorIndexCache;
    };

    const waitForDismiss = async (game, mapOverlay) => {
        // Round26：観戦終了予約が、災害地図の点滅中（入力待ち開始前）に入っていた場合、
        // 後からここで永久にタップ待ちにならないよう「見終えた」扱いで先へ進めます。
        if (game && game.isWatchMode && game._watchReturnRequested) return;

        await new Promise(resolve => {
            let finished = false;
            const onTouch = () => {
                if (finished) return;
                finished = true;
                mapOverlay.removeEventListener('click', onTouch);
                mapOverlay.removeEventListener('touchstart', onTouch);
                resolve();
            };
            mapOverlay.addEventListener('click', onTouch);
            mapOverlay.addEventListener('touchstart', onTouch, { passive: true });
            if (game && game.isWatchMode) setTimeout(onTouch, 1000);
        });
    };

    const cleanupOverlay = async (mapOverlay) => {
        const restoreState = mapOverlay ? mapOverlay._eventMapRestoreState : null;
        if (mapOverlay) {
            mapOverlay.querySelectorAll('canvas').forEach(c => {
                try { c.width = 1; c.height = 1; } catch (e) {}
            });
            mapOverlay.querySelectorAll('img').forEach(img => {
                try { img.src = ''; } catch (e) {}
            });
            if (mapOverlay.parentNode) mapOverlay.parentNode.removeChild(mapOverlay);
        }
        // イベント専用の巨大RGBAキャッシュは持たず、共有IDマップはゲーム本体側で継続利用します。

        // Canvas/GPU面の解放をブラウザへ反映してから通常マップを戻します。
        await nextPaint();
        if (restoreState) {
            if (!restoreState.isPC && restoreState.scroll) {
                restoreState.scroll.style.display = restoreState.oldDisplay;
            }
            if (restoreState.pausedByUs && restoreState.ui && typeof restoreState.ui.resumeBackgroundUpdates === 'function') {
                restoreState.ui.resumeBackgroundUpdates();
            }
        }
        await new Promise(resolve => setTimeout(resolve, 0));
    };

    return {
        writeDiag,
        waitForImage,
        createOverlay,
        createLightweightBaseCanvas,
        drawProvinceBoundaries,
        getRenderScale,
        ensureProvinceSource,
        createProvinceCanvas,
        invalidateCaches,
        ensureCastleColorIndex,
        waitForDismiss,
        cleanupOverlay
    };
})();

// ==========================================
// ★ マップを光らせる共通の魔法（凶作・豊作・大雪など）
// Round16：上の共通イベント地図基盤へ統合しました。
// ==========================================
window.playProvinceMapEffect = async function(game, eventType, initialMsg, affectedProvIds, drawR, drawG, drawB) {
    if (!affectedProvIds || affectedProvIds.size === 0 || !game.ui) return;

    const diagNameMap = { '大雪': 'heavy_snow', '豊作': 'good_harvest', '凶作': 'bad_harvest', '飢饉': 'famine', '疫病': 'epidemic', '地震': 'earthquake' };
    const diagName = diagNameMap[eventType] || 'province_effect';
    const diagPrefix = `event_effect:${diagName}`;
    const fx = window.EventMapEffects;

    if (window.playEventSoundAndBlock) window.playEventSoundAndBlock();
    fx.writeDiag(game, `${diagPrefix}:dialog`);
    await game.ui.showDialogAsync(initialMsg, false, 0);

    let mapOverlay = null;
    try {
        fx.writeDiag(game, `${diagPrefix}:overlay_shell`);
        const overlayParts = await fx.createOverlay(game, { diagPrefix });
        mapOverlay = overlayParts && overlayParts.mapOverlay;
        const mapContainer = overlayParts && overlayParts.mapContainer;

        fx.writeDiag(game, `${diagPrefix}:mask_build`);
        const { canvas } = await fx.createProvinceCanvas(
            game,
            affectedProvIds,
            { r: drawR, g: drawG, b: drawB, a: 180 },
            { animation: 'blink 1s 2', diagPrefix }
        );
        if (!canvas || !mapContainer) {
            console.warn(`${eventType}の地図演出を省略しました。`);
        } else {
            mapContainer.appendChild(canvas);
            fx.writeDiag(game, `${diagPrefix}:mask_done`);

            await new Promise(resolve => setTimeout(resolve, 0));
            await new Promise(resolve => setTimeout(resolve, 2000));
            canvas.style.animation = 'none';
            canvas.style.opacity = '1.0';

            fx.writeDiag(game, `${diagPrefix}:wait_input`);
            await fx.waitForDismiss(game, mapOverlay);
        }
    } catch (error) {
        // 災害のゲーム処理と結果通知は継続し、補助地図だけを省略する。
        console.warn(`${eventType}の地図演出中にエラーが出たため、演出を省略します:`, error);
    } finally {
        if (mapOverlay) {
            fx.writeDiag(game, `${diagPrefix}:cleanup`);
            try {
                await fx.cleanupOverlay(mapOverlay);
            } catch (cleanupError) {
                console.warn(`${eventType}の地図演出後始末に失敗しました:`, cleanupError);
            }
            fx.writeDiag(game, `${diagPrefix}:cleanup_done`);
        }
    }

    const playerAffectedProvinces = new Set();
    game.castles.forEach(c => {
        if (c.ownerClan === game.playerClanId && affectedProvIds.has(c.provinceId)) {
            playerAffectedProvinces.add(c.provinceId);
        }
    });

    for (const pid of playerAffectedProvinces) {
        const p = game.getProvince(pid);
        const pName = p ? p.province : 'どこかの国';
        let msg = '';
        if (eventType === '豊作') msg = `${pName}は豊作です！`;
        else if (eventType === '凶作') msg = `${pName}は凶作に見舞われています……`;
        else if (eventType === '飢饉') msg = `${pName}で飢饉が発生し、甚大な被害が出ています……`;
        else if (eventType === '疫病') msg = `${pName}で恐ろしい疫病が猛威を振るっています……`;
        else if (eventType === '地震') msg = `${pName}で大地震による甚大な被害が出ています……`;
        else if (eventType === '大雪') msg = `${pName}は深い雪に閉ざされています……`;
        if (msg) await game.ui.showDialogAsync(msg, false, 0);
    }
};

// ==========================================
// ★ 面談：医師による寿命延長
// ==========================================
window.GameEvents.push({
    id: 'common_interview_doctor',
    timing: 'interview_after_greeting',
    isOneTime: false,

    checkCondition: function(game, context) {
        const busho = context && context.busho;
        const lifeSystem = game && game.lifeSystem;
        if (!busho || !lifeSystem) return false;

        const currentYear = Number(game.year || 0);
        const hasDoctorExtension = lifeSystem.hasLifespanModifier(busho, this.id);
        const hasBattleDeathExtension = lifeSystem.hasBattleDeathLifespanExtension(busho);
        return currentYear >= (Number(busho.endYear || 0) - 1)
            && !hasDoctorExtension
            && !hasBattleDeathExtension;
    },

    execute: async function(game, context) {
        const busho = context && context.busho;
        const view = game && game.ui ? game.ui.interviewView : null;
        if (!busho || !view) return;

        const castle = game.getCurrentTurnCastle();
        const resumeInterview = typeof context.resumeInterview === 'function' ? context.resumeInterview : () => {};
        const endInterview = typeof context.endInterview === 'function' ? context.endInterview : resumeInterview;

        view.showPrompt(
            busho,
            `${busho.name}は調子が悪そうだ。<br>医師に診せますか？<br>（消費：金２００）`,
            [
                {
                    label: '医師に診せる',
                    className: 'btn-primary',
                    onClick: () => {
                        if (!castle || Number(castle.gold || 0) < 200) {
                            view.showMessages(
                                busho,
                                ['金が足りないため、医師を呼べませんでした……'],
                                resumeInterview,
                                '面談',
                                { narration: true }
                            );
                            return;
                        }

                        castle.gold -= 200;
                        const currentEndYear = Number(busho.endYear);
                        const currentDeathAge = currentEndYear - Number(busho.birthYear);
                        const targetEndYear = currentDeathAge < 55
                            ? Number(busho.birthYear) + 65
                            : currentEndYear + 10;
                        const extensionYears = targetEndYear - currentEndYear;
                        game.lifeSystem.setLifespanModifier(busho, this.id, extensionYears);

                        view.showMessages(
                            busho,
                            [`${busho.name}は少し顔色が良くなったようです。`],
                            endInterview,
                            '面談',
                            { narration: true }
                        );
                    }
                },
                {
                    label: '診せない',
                    className: 'btn-secondary',
                    onClick: resumeInterview
                }
            ],
            '面談',
            { narration: true }
        );
    }
});

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
        // 対象となる武将のIDリスト（今川義元：ID1004009）
        // 例：1001001, 1001002, 1001003...
        const targetIds = [1004009];
        
        for (const id of targetIds) {
            const busho = game.getBusho(id);
            // このイベントは「対象と+10年」を定義するだけ。寿命変更と能力再計算は LifeSystem に任せます。
            if (busho && game.lifeSystem) {
                game.lifeSystem.setLifespanModifier(busho, this.id, 10);
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
                if (c.population < 2000 && c.peoplesLoyalty < 50) {
                    // 詰み防止：人口が2000未満かつ民忠50未満の場合は、民忠を1回復します
                    c.peoplesLoyalty = Math.min(100, c.peoplesLoyalty + 1);
                } else if (c.population < 3000) {
                    // 詰み防止：人口が3000未満の場合は、民忠を変動させません（低下しません）
                } else {
                    // それ以外（通常時）は民忠を1減らします（0未満にはならないように守ります）
                    c.peoplesLoyalty = Math.max(0, c.peoplesLoyalty - 1);
                }
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
                // 【一揆中】まずは強制解除されるかチェックします！
                if (c.population < 3000) {
                    // 詰み防止：人口が3000未満なら無条件で一揆を解除します
                    c.statusEffects = c.statusEffects.filter(s => s !== '一揆');
                    return; // 解除されたら今月の継続ダメージは受けません
                }

                // 次に通常解除されるかチェックします！
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
                // 【平常時】民忠が49以下かつ、人口が3000以上なら一揆が起きるかチェックします！
                if (c.peoplesLoyalty <= 49 && c.population >= 3000) {
                    // 民忠49で1%、0で100%の確率で発生します
                    const occurProb = 0.01 + ((49 - c.peoplesLoyalty) / 49) * 0.99;
                    
                    if (Math.random() < occurProb) {
                        // 一揆発生！シールを貼ります
                        c.statusEffects.push('一揆');
                        
                        // ★変更：自分のお城の時だけ、後でお知らせするためにメモします
                        if (c.ownerClan === game.playerClanId) {
                            playerIkkiCastles.push(c.name || "どこかの拠点");
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
                    const cName = c.name || "どこかの拠点";
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
        const getProv = (pId) => game.getProvince(pId);
        
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

            const neighbors = game.castles.filter(c => MapGraphService.isAdjacent(current.castle, c));
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
            const baseRate = window.MainParams.Economy.TradeRateBase;
            game.provinces.forEach(prov => {
                if (prov && prov.marketRate !== undefined) {
                    // 凶作では米が希少になり、金1で得られる兵糧量が減ります。
                    if (badAffected.has(prov.id)) {
                        prov.marketRate = Math.max(window.MainParams.Economy.TradeRateMin, prov.marketRate - (baseRate * 0.5));
                    } else {
                        // 周辺市場にも不足の影響が波及します。
                        prov.marketRate = Math.max(window.MainParams.Economy.TradeRateMin, prov.marketRate - (baseRate * 0.25));
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

            const neighbors = game.castles.filter(c => MapGraphService.isAdjacent(current.castle, c));
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
            const baseRate = window.MainParams.Economy.TradeRateBase;
            game.provinces.forEach(prov => {
                if (prov && prov.marketRate !== undefined) {
                    // 豊作では米が潤沢になり、金1で得られる兵糧量が増えます。
                    if (goodAffected.has(prov.id)) {
                        prov.marketRate = Math.min(window.MainParams.Economy.TradeRateMax, prov.marketRate + (baseRate * 0.5));
                    } else {
                        // 周辺市場にも供給増の影響が波及します。
                        prov.marketRate = Math.min(window.MainParams.Economy.TradeRateMax, prov.marketRate + (baseRate * 0.2));
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
            
            let riceIncome = EconomyRules.calcBaseRiceIncome(c);
            riceIncome = GameMath.applyVariance(riceIncome, window.MainParams.Economy.IncomeFluctuation);
            
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
                let popDropRate = 0.01 + (Math.random() * 0.09);
                
                // ★追加：スキルマネージャーに「スキルによる災害被害の倍率」を聞いて計算します
                if (typeof SkillManager !== 'undefined') {
                    popDropRate *= SkillManager.calcDisasterDamageModifier(c, game);
                }
                
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
                let popDropRate = 0.10 + (Math.random() * 0.10);
                
                // ★追加：スキルマネージャーに「スキルによる災害被害の倍率」を聞いて計算します
                if (typeof SkillManager !== 'undefined') {
                    popDropRate *= SkillManager.calcDisasterDamageModifier(c, game);
                }
                
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
        // 5%（100回に5回）の確率で、地震のスイッチが入ります！
        return Math.random() < 0.05;
    },
    
    execute: async function(game) {
        // 日本中にあるすべての国の「出席番号」を集めます
        const allProvIds = [...new Set(game.castles.filter(c => c.provinceId > 0).map(c => c.provinceId))];
        if (allProvIds.length === 0) return;
        
        // その中から、くじ引きで「震源地となるランダムな１つの国」を選びます
        const targetProvId = allProvIds[Math.floor(Math.random() * allProvIds.length)];

        // ★地震の規模（1〜10）をくじ引きで決めます！
        // 数字が小さいほど出やすく、大きいほど出にくい「えぐれたピラミッド状」の確率です。
        const rand = Math.random();
        let magnitude = 1;
        if (rand < 0.30) magnitude = 1;      // 30%の確率で規模1
        else if (rand < 0.55) magnitude = 2; // 25%の確率で規模2
        else if (rand < 0.75) magnitude = 3; // 20%の確率で規模3
        else if (rand < 0.87) magnitude = 4; // 12%の確率で規模4
        else if (rand < 0.94) magnitude = 5; // 7%の確率で規模5
        else if (rand < 0.97) magnitude = 6; // 3%の確率で規模6
        else if (rand < 0.985) magnitude = 7;// 1.5%の確率で規模7
        else if (rand < 0.993) magnitude = 8;// 0.8%の確率で規模8
        else if (rand < 0.998) magnitude = 9;// 0.5%の確率で規模9
        else magnitude = 10;                 // 0.2%の確率で規模10

        // 国の出席番号と、その国の「地震の規模」をセットで覚える箱を用意します
        let affectedProvinces = new Map();
        affectedProvinces.set(targetProvId, magnitude);

        // ★豊作や凶作と同じように、隣のお城を辿って地震を広げていく魔法です！
        let eqQueue = [];
        game.castles.forEach(c => {
            if (c.provinceId === targetProvId) {
                eqQueue.push({ castle: c, distance: 0 });
            }
        });

        let visitedCastles = new Set();
        eqQueue.forEach(q => visitedCastles.add(q.castle.id));

        while (eqQueue.length > 0) {
            const current = eqQueue.shift();
            // 遠くまで広がりすぎないようにストッパーをかけます
            if (current.distance >= 5) continue; 
            
            // 今見ているお城の国の「地震の規模」を調べます
            const currentMag = affectedProvinces.get(current.castle.provinceId) || 0;
            // 規模が1以下なら、これ以上他の国には伝わりません
            if (currentMag <= 1) continue; 

            // 道が繋がっているお隣さんのお城を調べます
            const neighbors = game.castles.filter(c => MapGraphService.isAdjacent(current.castle, c));
            for (let neighbor of neighbors) {
                if (!visitedCastles.has(neighbor.id)) {
                    visitedCastles.add(neighbor.id); 
                    
                    // お隣さんのお城が「まだ地震が起きていない国」かどうかチェックします
                    let canSpread = !affectedProvinces.has(neighbor.provinceId);
                    
                    // 違う国へは、35%の確率で地震が伝わります！
                    if (canSpread && Math.random() < 0.35) {
                        // 伝わる時は、規模が1段階小さくなります
                        affectedProvinces.set(neighbor.provinceId, currentMag - 1);
                        eqQueue.push({ castle: neighbor, distance: current.distance + 1 });
                    } else if (affectedProvinces.has(neighbor.provinceId)) {
                        // 同じ国の中を伝って、さらに別の国へ繋がる道を探すためにキューに入れます
                        eqQueue.push({ castle: neighbor, distance: current.distance + 1 });
                    }
                }
            }
        }

        // 被害を受けた国すべてのリストを作ります
        const affectedProvIds = new Set(affectedProvinces.keys());

        // 震源地の規模に合わせて、画面に出すメッセージを5段階で変えます！
        let eqMessage = "";
        if (magnitude <= 2) {
            eqMessage = "かすかな地鳴りとともに、大地が小さく揺れました。";
        } else if (magnitude <= 4) {
            eqMessage = "突然の地鳴りとともに、大地が揺れました！";
        } else if (magnitude <= 6) {
            eqMessage = "大きな地鳴りとともに、大地が激しく揺れました！！";
        } else if (magnitude <= 8) {
            eqMessage = "立っていられないほどの猛烈な揺れが、大地を襲いました！！";
        } else {
            eqMessage = "天地がひっくり返るかのような、未曾有の大地震が発生しました！！！";
        }

        // ★共通の魔法を呼び出します！（地震の色は、大地を思わせる茶色です）
        await window.playProvinceMapEffect(
            game, 
            '地震', 
            eqMessage, 
            affectedProvIds, 
            139, 69, 19
        );

        // 選ばれた国のお城に、それぞれの「規模」に合わせた地震の被害を与えます
        game.castles.forEach(c => {
            if (c.ownerClan === 0) return; 
            
            if (affectedProvinces.has(c.provinceId)) {
                // その国で起きている地震の規模（1〜10）を取り出します
                const m = affectedProvinces.get(c.provinceId);

                // 城防御力15につき1%のダメージ軽減率を計算します（最大100%カット）
                const defenseCutRate = Math.min(1.0, Math.floor(c.defense / 15) * 0.01);

                // 兵士数が規模に応じて減ります（規模1で約1〜3%、規模10で約10〜30%）
                const solDropRate = ((0.01 + Math.random() * 0.02) * m) * (1.0 - defenseCutRate);
                c.soldiers = Math.max(0, Math.floor(c.soldiers * (1.0 - solDropRate)));
                
                // 人口が規模に応じて減ります（規模1で約0.1〜0.5%、規模10で約1〜5%）
                let popDropRate = ((0.001 + Math.random() * 0.004) * m) * (1.0 - defenseCutRate);
                
                // ★追加：スキルマネージャーに「スキルによる災害被害の倍率」を聞いて計算します
                if (typeof SkillManager !== 'undefined') {
                    popDropRate *= SkillManager.calcDisasterDamageModifier(c, game);
                }
                
                c.population = Math.max(0, Math.floor(c.population * (1.0 - popDropRate)));
                
                // 石高が規模に応じて減ります（規模1で約1〜3%、規模10で約10〜30%）
                const kokuDropRate = ((0.01 + Math.random() * 0.02) * m) * (1.0 - defenseCutRate);
                c.kokudaka = Math.max(0, Math.floor(c.kokudaka * (1.0 - kokuDropRate)));
                
                // 城防御が規模に応じて大きく減ります（規模1で約2〜5%、規模10で約20〜50%）
                const defDropRate = (0.02 + Math.random() * 0.03) * m;
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
            // ★Round15：月初AI処理中に雪Canvasを先に確保すると、直後のイベントCanvasと
            // メモリピークが重なるため、通常マップの雪描画はプレイヤー復帰時まで延期します。
            if (game && typeof game.writeSystemDiagnostic === 'function') {
                game.writeSystemDiagnostic('event:startMonth_before:heavy_snow_trigger:snow_state_done');
            }
            if (game.ui) game.ui._snowOverlayDirty = true;

            if (game && typeof game.writeSystemDiagnostic === 'function') {
                game.writeSystemDiagnostic('event:startMonth_before:heavy_snow_trigger:effect_start');
            }
            await window.playProvinceMapEffect(
                game, 
                '大雪',
                "厳しい冬が訪れ、各地が大雪に見舞われています……", 
                allSnowProvIds, 
                99, 188, 255
            );
            if (game && typeof game.writeSystemDiagnostic === 'function') {
                game.writeSystemDiagnostic('event:startMonth_before:heavy_snow_trigger:effect_done');
            }

            // 通常プレイの月初ではisProcessingAI=trueなので描画を重ねません。
            // 非AI実行/観戦時だけ、イベント用Canvas解放後に通常マップへ反映します。
            if (game.ui && game.ui.updateSnowOverlay && (!game.isProcessingAI || game.isWatchMode)) {
                await new Promise(resolve => setTimeout(resolve, 0));
                game.ui.updateSnowOverlay();
            }
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

        // ③-1 雪が降っている国では米が不足し、金1で得られる兵糧量がジワジワ減ります。
        const baseRate = window.MainParams.Economy.TradeRateBase;
        snowProvIds.forEach(pId => {
            const prov = game.getProvince(pId);
            if (prov && prov.marketRate !== undefined) {
                // 基本相場の0.1倍ずつ交換量を下げます。
                prov.marketRate = Math.max(window.MainParams.Economy.TradeRateMin, prov.marketRate - (baseRate * 0.1));
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
                let popDropRate = 0.0001 + (Math.random() * 0.0004);
                
                // ★追加：スキルマネージャーに「スキルによる災害被害の倍率」を聞いて計算します
                if (typeof SkillManager !== 'undefined') {
                    popDropRate *= SkillManager.calcDisasterDamageModifier(c, game);
                }		
                
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
            const myCastles = game.getClanCastles(clan.id);
            if (myCastles.length === 0) return; // 城がなければスキップします
            
            // 他の大名家との関係を調べます
            game.clans.forEach(targetClan => {
                if (targetClan.id === 0 || targetClan.id === clan.id) return;
                
                // ★ GameSystemにまとめた計算式を呼び出します！
                let targetIncome = EconomyRules.calcTradeIncomeWithTarget(clan.id, targetClan.id, game);
                
                // 収入が発生し、かつプレイヤーが関係している場合だけログのメモを残します
                if (targetIncome > 0) {
                    totalTradeIncome += targetIncome;
                    
                    if (clan.id === game.playerClanId) {
                        // 自分が得た収入の場合
                        logMessages.push({
                            text: `【交易】${targetClan.name}との往来により、金${targetIncome} の収入を得ました`,
                            clanIds: [clan.id, targetClan.id]
                        });
                    } else if (targetClan.id === game.playerClanId) {
                        // 相手が自分（プレイヤー）の領地のおかげで収入を得た場合
                        logMessages.push({
                            text: `【交易】${clan.name}が当家との往来により、金${targetIncome} の利益を得ました`,
                            clanIds: [clan.id, targetClan.id]
                        });
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
                logMessages.forEach(log => game.ui.log(log.text, {
                    clanIds: log.clanIds,
                    category: 'trade',
                    inferCurrentTurn: false
                }));
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
        const ronins = game.bushos.filter(b => window.BushoStatusRules.isRonin(b) && !b.belongKunishuId && !b.isAutoLeader);
        
        // 今月すでに処理した浪人をメモしておく箱です（追い払われた人が移動先で再度判定されないようにします）
        const processedRonins = new Set();
        
        for (const ronin of ronins) {
            if (processedRonins.has(ronin.id)) continue;
            
            const currentCastle = game.getCastle(ronin.castleId);
            // 浪人がお城にいない場合や、その城が空き城（所有者が0）の場合は仕官しません
            if (!currentCastle || currentCastle.ownerClan === 0) continue; 
            
            const clanId = currentCastle.ownerClan;
            const daimyo = game.getClanDaimyo(clanId);
            const clanBushos = game.getClanBushos(clanId).filter(b => !window.LifeStatusRules.isDead(b));
            
            // 何らかの理由でその大名家に大名がいなければスキップします
            if (!daimyo) continue;
            
            // 仕官先の勢力に、浪人の「宿敵」がいるかチェックします
            let hasNemesis = false;
            if (ronin.nemesisIds && ronin.nemesisIds.length > 0) {
                hasNemesis = ronin.nemesisIds.some(nId => {
                    const nBusho = game.getBusho(nId);
                    return nBusho && nBusho.clan === clanId && !window.LifeStatusRules.isDead(nBusho);
                });
            }
            // 宿敵がいれば絶対に仕官しないので、次の浪人のチェックへ進みます
            if (hasNemesis) continue; 
            
            // 大名と浪人の相性のズレを計算します（0〜50の数字になります）
            let affDiff = 50;
            if (typeof PersonnelRules !== 'undefined' && PersonnelRules.calcAffinityDiff) {
                affDiff = PersonnelRules.calcAffinityDiff(ronin.affinity, daimyo.affinity);
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
                        const clanData = game.getClan(clanId);
                        const clanName = clanData ? clanData.name : "当家";
                        if (game.ui && game.ui.showDialogAsync) {
                            await game.ui.showDialogAsync(`「ははっ！　これから${clanName}のために身命を賭して働きまする！」`, false, 0, {
                                leftFace: ronin.faceIcon,
                                leftName: rName,
                                isEvent: true
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
// ★ 勢力からの臣従申し出イベント（月初処理後）
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
        const playerClan = game.getClan(playerClanId);
        const playerDaimyo = game.getClanDaimyo(playerClanId);
        
        // 今月すでに吸収された勢力の出席番号をメモしておく箱です（二重処理を防ぎます）
        const absorbedClans = new Set();
        // プレイヤーへの臣従は「月に1回まで」にするための目印です
        let playerOffered = false;
        // マップの描き直しが必要かどうかを覚える目印です
        let needMapUpdate = false;

        // ★ 相手の勢力を自分の勢力に吸収する共通の魔法（臣従の処理）
        const processSubordination = (subordinateClanId, dominantClanId) => {
            // 1. 吸収される側の軍団をすべて解散させます（お片付け）
            if (game.legions) {
                const myLegions = game.legions.filter(l => Number(l.clanId) === Number(subordinateClanId));
                myLegions.forEach(l => {
                    if (game.castleManager && game.castleManager.disbandLegion) {
                        game.castleManager.disbandLegion(l.id);
                    }
                });
            }

            // 2. 吸収される側のお城をすべて吸収する大名家にプレゼントして、直轄（0）にします
            const myCastles = game.getClanCastles(subordinateClanId);
            myCastles.forEach(c => {
                if (game.castleManager && game.castleManager.changeOwner) {
                    game.castleManager.changeOwner(c, dominantClanId, true, 0);
                }
            });

            // 3. 吸収される側の武将のバッジ（身分）を外し、吸収する大名家に入れます
            const myBushos = game.getClanBushos(subordinateClanId).slice();
            myBushos.forEach(b => {
                b.isDaimyo = false;
                
                game.affiliationSystem.transferClanRaw(b, dominantClanId, { syncSpouses: true });
                
                // 人事部（お引越しセンター）にお願いして、新しい殿様との相性で忠誠度を再計算します！
                if (game.affiliationSystem && game.affiliationSystem.updateLoyaltyForNewLord) {
                    game.affiliationSystem.updateLoyaltyForNewLord(b, dominantClanId);
                }
            });

            // 武将に付随しない未婚姫も、滅亡済み旧家へ取り残さない。
            game.affiliationSystem.transferUnmarriedPrincesses(subordinateClanId, dominantClanId);

            // 吸収済みリストに追加して、マップ更新の印をつけます
            absorbedClans.add(subordinateClanId);
            needMapUpdate = true;
        };

        // すべての大名家（臣従する側）を順番に探していきます
        for (const clan of game.clans) {
            // 空き城データやプレイヤー自身の勢力、今月すでに吸収された勢力、滅亡済みの勢力は飛ばします
            if (clan.id === 0 || clan.id === playerClanId || absorbedClans.has(clan.id) || clan.isDestroyed) continue;

            const aiDaimyo = game.getClanDaimyo(clan.id);
            if (!aiDaimyo) continue;

            // 自分が従属している相手（ターゲット）を書き出すためのリストです
            const targets = [];

            if (clan.diplomacyValue) {
                Object.keys(clan.diplomacyValue).forEach(tIdStr => {
                    const targetId = Number(tIdStr);
                    // 空き城、または既に吸収された勢力、または自分自身なら飛ばします
                    if (targetId === 0 || targetId === clan.id || absorbedClans.has(targetId)) return;

                    const diplomacyData = clan.diplomacyValue[targetId];
                    // 相手に従属している場合だけチェックを続けます
                    if (diplomacyData && diplomacyData.status === '従属') {
                        // プレイヤーへの臣従は月に1回までの制限があります
                        if (targetId === playerClanId && playerOffered) return;
                        
                        const targetClan = game.getClan(targetId);
                        const targetDaimyo = game.getClanDaimyo(targetId);
                        if (!targetClan || targetClan.isDestroyed || !targetDaimyo) return;

                        // 従属・支配期間のカウントが24未満なら飛ばします
                        if (diplomacyData.subordinateMonths < 24) return;
                        // 相手との関係値が100じゃないなら飛ばします
                        if (diplomacyData.sentiment !== 100) return;
                        // 相手の威信が自分の威信の12倍未満なら飛ばします
                        if (targetClan.daimyoPrestige < clan.daimyoPrestige * 12) return;

                        // 大名同士の相性のズレを計算します（0〜50の数字になります）
                        let affDiff = 25;
                        if (typeof PersonnelRules !== 'undefined' && PersonnelRules.calcAffinityDiff) {
                            affDiff = PersonnelRules.calcAffinityDiff(targetDaimyo.affinity, aiDaimyo.affinity);
                        } else {
                            const diff = Math.abs(targetDaimyo.affinity - aiDaimyo.affinity);
                            affDiff = Math.min(diff, 100 - diff);
                        }

                        // 確率の計算です（相性差50で0%、0で2%になります）
                        let prob = 2.0 * (1.0 - (affDiff / 50));
                        // さらに、従属期間が長いほど確率をアップさせます（最大3%まで）
                        prob += Math.min(3.0, Math.max(0, diplomacyData.subordinateMonths - 24) * 0.03);

                        // サイコロを振って当たった場合、臣従先の候補に入れます
                        if (Math.random() * 100 < prob) {
                            targets.push(targetClan);
                        }
                    }
                });
            }

            // 条件を満たす臣従先が一つもなければ、次の大名家のチェックに進みます
            if (targets.length === 0) continue;

            // ★ 複数の勢力に同時に従属していて、同時に条件を満たした場合の選び方です！
            let selectedTarget = targets[0];
            if (targets.length > 1) {
                // まず、自分の大名居城がある国の出席番号を取得します
                const myDaimyoCastle = game.getCastle(aiDaimyo.castleId);
                const myProvinceId = myDaimyoCastle ? myDaimyoCastle.provinceId : 0;

                targets.sort((a, b) => {
                    // その国の中にある相手のお城の数をそれぞれ数えます
                    const aCount = game.getClanCastles(a.id).filter(c => c.provinceId === myProvinceId).length;
                    const bCount = game.getClanCastles(b.id).filter(c => c.provinceId === myProvinceId).length;
                    
                    if (aCount !== bCount) {
                        return bCount - aCount; // お城の数が多い方が優先して一番上に来ます
                    }
                    // お城の数も同じなら、威信が高い方が優先されます
                    return b.daimyoPrestige - a.daimyoPrestige;
                });
                
                // 一番ふさわしい相手を決定します！
                selectedTarget = targets[0];
            }

            // 選ばれた臣従先が「プレイヤー」か「AI」かで、処理を分けます
            if (selectedTarget.id === playerClanId && playerClan && playerDaimyo) {
                // ==========================================
                // 【プレイヤーへの臣従処理（会話イベントあり）】
                // ==========================================
                playerOffered = true; // 今月はもうプレイヤーには臣従イベントが来ないようにします

                // 使者役として、対象勢力の武将の中から一番「外交」の能力が高い人を選びます
                const envoys = game.getClanBushos(clan.id).filter(b => window.BushoStatusRules.isActive(b) && !b.isDaimyo).sort((a,b) => b.diplomacy - a.diplomacy);
                const envoy = envoys.length > 0 ? envoys[0] : aiDaimyo;

                // メッセージでお見せするための名前を綺麗に整えます
                const envoyName = envoy.name.replace(/\|/g, '');
                const playerDaimyoName = playerDaimyo.name.replace(/\|/g, '');
                const aiClanName = clan.name;
                const aiDaimyoName = aiDaimyo.name.replace(/\|/g, '');
                const aiDaimyoGivenName = aiDaimyo.givenName ? aiDaimyo.givenName : aiDaimyoName;

                // 通常外交と同じ会話上の格・呼称を使う。
                const diplomacyManager = game.diplomacyManager;
                const isDaimyoSelf = (envoy.id === aiDaimyo.id);
                const myCallName = diplomacyManager ? diplomacyManager.getCallName(playerDaimyo, envoy) : `${playerDaimyo.familyNameStr || playerDaimyoName}殿`;
                const envoyCallName = diplomacyManager ? diplomacyManager.getCallName(envoy, playerDaimyo) : `${envoy.familyNameStr || envoyName}殿`;
                const greeting = diplomacyManager
                    ? diplomacyManager.buildDiplomacyGreeting(envoy, playerDaimyo)
                    : {
                        greetMsg1: isDaimyoSelf
                            ? `「${myCallName}。重大な用件ゆえ、此度はわし自ら参りました」`
                            : `「此度は${aiClanName}当主・${aiDaimyoName}様の名代として罷り越しました」`,
                        greetMsg2: isDaimyoSelf
                            ? `「これは${envoyCallName}……して、どのような御用向きでござるか？」`
                            : `「うむ。して、御用向きはいかに？」`,
                        context: null
                    };

                // 小姓役のナビゲーターを取得します
                let myCastle = game.getCastle(playerDaimyo.castleId);
                if (!myCastle) {
                    const myClanCastles = game.getClanCastles(playerClanId);
                    myCastle = myClanCastles.length > 0 ? myClanCastles[0] : null;
                }
                const nav = myCastle ? game.getNavigatorInfo(myCastle) : { faceIcon: 'unknown_face.webp', name: '小姓' };

                let introMsg = "";
                if (isDaimyoSelf) {
                    introMsg = `「殿、${aiClanName}当主・${aiDaimyoName}様がお見えになっております」`;
                } else if (greeting.context && greeting.context.envoySpecial && greeting.context.envoySpecial.level >= 2) {
                    introMsg = `「殿、${aiClanName}より${envoyCallName}がお見えになっております。使者として参られたとのことです」`;
                } else {
                    introMsg = `「殿、${aiClanName}から使者が参っております」`;
                }

                // ダイアログを出す前に、音を鳴らしてバリアを張る魔法を呼びます！
                if (window.playEventSoundAndBlock) window.playEventSoundAndBlock();
                
                await game.ui.showDialogAsync(introMsg, false, 0, {
                    leftFace: nav.faceIcon, leftName: nav.name
                });

                const greetMsg1 = greeting.greetMsg1;
                const greetMsg2 = greeting.greetMsg2;

                await game.ui.showDialogAsync(greetMsg1, false, 0, {
                    leftFace: envoy.faceIcon, leftName: envoyName
                });

                await game.ui.showDialogAsync(greetMsg2, false, 0, {
                    leftFace: playerDaimyo.faceIcon, leftName: playerDaimyoName
                });

                const commonMsgs = diplomacyManager
                    ? diplomacyManager.getDiplomacyMessages(
                        'vassalage', isDaimyoSelf, aiClanName, playerClan.name,
                        envoyCallName, myCallName, '姫', '貴家', greeting.context
                    )
                    : { demandMsg: `「どうか我らを${playerClan.name}の末席にお加えいただきたく存じます」` };

                await game.ui.showDialogAsync(commonMsgs.demandMsg, false, 0, {
                    leftFace: envoy.faceIcon, leftName: envoyName
                });

                await game.ui.showDialogAsync(`「……当家に臣従したい、ということか」`, false, 0, {
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
                    let replyAccept = commonMsgs.replyAcceptMsg || (isDaimyoSelf ? `「恐悦至極……今日より${myCallName.replace('殿', '様')}を主君と仰ぎ奉りまする」` : `「ははっ！ ありがたき幸せに存じまする！」`);
                    await game.ui.showDialogAsync(replyAccept, false, 0, {
                        leftFace: envoy.faceIcon, leftName: envoyName
                    });

                    await game.ui.showDialogAsync(`${aiClanName} が ${playerClan.name} に臣従しました！`, false, 0);
                    if (game.ui.log) game.ui.log(`${aiClanName} が ${playerClan.name} に臣従しました`, { clanIds: [clan.id, playerClanId], category: 'diplomacy', inferCurrentTurn: false });

                    // 臣従の処理を呼び出します
                    processSubordination(clan.id, playerClanId);

                } else {
                    // 家臣にすることを断った時のお返事です
                    await game.ui.showDialogAsync(`「申し出の趣は承った。されど今は、他家を取り込むつもりはない。これまでどおり当家を支えてもらいたい」`, false, 0, {
                        leftFace: playerDaimyo.faceIcon, leftName: playerDaimyoName
                    });
                    let replyReject = commonMsgs.replyRejectMsg || (isDaimyoSelf ? `「承知いたしました。此度は願いを収めます」` : `「承知いたしました。${aiDaimyoGivenName}様にはそのように申し伝えます」`);
                    await game.ui.showDialogAsync(replyReject, false, 0, {
                        leftFace: envoy.faceIcon, leftName: envoyName
                    });
                }
            } else {
                // ==========================================
                // 【AI同士の臣従処理（会話イベントなし）】
                // ==========================================
                const msg = `${clan.name} が ${selectedTarget.name} に臣従しました。`;
                
                // おしらせメッセージとログだけを出します
                await game.ui.showDialogAsync(msg, false, 0);
                if (game.ui.log) game.ui.log(msg, { clanIds: [clan.id, selectedTarget.id], category: 'diplomacy', inferCurrentTurn: false });

                // 自動的に臣従の処理を呼び出します
                processSubordination(clan.id, selectedTarget.id);
            }
        }

        // 最後に、誰かが臣従して地図に変化があった場合のみ、画面を綺麗に描き直します
        if (needMapUpdate) {
            if (game.isProcessingAI && !game.isWatchMode) {
                game._aiDeferredMapRefresh = true;
            } else {
                if (game.ui.updatePanelHeader) game.ui.updatePanelHeader();
                if (game.ui.renderCommandMenu) game.ui.renderCommandMenu();
                if (game.ui.renderMap) game.ui.renderMap();
            }
        }
    }
});