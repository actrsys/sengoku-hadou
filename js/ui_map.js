/**
 * ui_map.js
 * 画面の見た目（ui.js）のうち、マップを動かす魔法だけを担当する別館です。
 */

// ★ シナリオ別・デバイス別で最初に映すお城のIDを管理する箱
const INITIAL_MAP_CENTER_CONFIG = {
    "1560_okehazama": { // 1560年 桶狭間の戦いシナリオ
        PC: 7,      // PC版で最初に中心にする城のID
        MOBILE: 36   // スマホ版で最初に中心にする城のID
    },
    "DEFAULT": {       // 上記以外のシナリオの場合のお守り
        PC: 7,
        MOBILE: 7
    }
};

// ★ マップのズーム設定を1箇所で管理する箱
// ここでの数字は「画面にピッタリ収まる（または覆い尽くす）最小サイズ」を『 1.0 』とした時の倍率です！
const MAP_ZOOM_CONFIG = {
    PC: {
        min: 1.0, // PCの最小サイズ（1.0でピッタリ）
        mid: 4.0, // PCの中間サイズ（4.0倍）
        max: 8.0  // PCの最大サイズ（8.0倍）
    },
    MOBILE: {
        min: 1.0, // スマホの最小サイズ（1.0で画面全体を覆います）
        mid: 3.0, // スマホの中間サイズ（3.0倍）
        max: 5.0  // スマホの最大サイズ（5.0倍）
    }
};

// ★ 看板屋さん（UIManager）に、後からマップの魔法を合体させる特別な魔法です！
//  Object.assignではそれぞれのメソッドの間に必ずカンマが必要です
Object.assign(UIManager.prototype, {

    // ★Round 13：地図の慣性をズーム開始前に必ず止めます。
    _stopMapInertia() {
        if (this.inertiaFrame) {
            cancelAnimationFrame(this.inertiaFrame);
            this.inertiaFrame = null;
        }
        this.velocityX = 0;
        this.velocityY = 0;
    },

    // タイトル復帰・新規開始・ロードで前のカメラ状態を持ち越さないための正本。
    // initialZoomLevel は 0=最小、1=標準、2=最大。通常は標準、タイトルからの観戦だけ0を指定する。
    resetMapViewState(options = {}) {
        this._stopMapInertia();
        if (typeof this.abortMapEffectsForScenarioTransition === 'function') {
            this.abortMapEffectsForScenarioTransition();
        }
        if (typeof this._cancelActiveMapFocus === 'function') this._cancelActiveMapFocus();
        this._cancelActiveMapFocus = null;
        this._mapViewResetToken = Number(this._mapViewResetToken || 0) + 1;
        this._mapFocusLockCount = 0;
        this._mapFocusPrevPointerEvents = '';
        this.isZooming = false;
        this.currentCastle = null;
        this.hasInitializedMap = false;
        this.zoomLevel = undefined;
        this._initialMapZoomLevel = Number.isInteger(options.initialZoomLevel)
            ? Math.max(0, Math.min(2, options.initialZoomLevel))
            : 1;

        const sc = document.getElementById('map-scroll-container');
        if (sc) {
            sc.style.pointerEvents = '';
            sc.scrollLeft = 0;
            sc.scrollTop = 0;
        }
    },

    // ★Round 13：巨大マップの強制GPUレイヤー化はPCだけに限定します。
    // 古いスマホでは scale() だけの方が合成メモリを増やしにくく安定します。
    _getMapScaleTransform(scale, forcePcGpu = false) {
        const isPC = document.body.classList.contains('is-pc');
        return (isPC || forcePcGpu) ? `scale(${scale}) translateZ(0)` : `scale(${scale})`;
    },

    // ★Round 13：スクロール範囲用spacerを一元管理します。
    _getMapSpacer(sc) {
        let spacer = document.getElementById('map-spacer');
        if (!spacer) {
            spacer = document.createElement('div');
            spacer.id = 'map-spacer';
            spacer.style.position = 'absolute';
            spacer.style.pointerEvents = 'none';
            spacer.style.left = '0px';
            spacer.style.top = '0px';
            sc.appendChild(spacer);
            sc.style.position = 'relative';
        }
        return spacer;
    },

    _setMapSpacerSize(sc, width, height) {
        const spacer = this._getMapSpacer(sc);
        // floorだと見た目のmapよりscroll領域が最大1px弱短くなるためceilで不足を防ぎます。
        spacer.style.width = `${Math.ceil(Math.max(0, width))}px`;
        spacer.style.height = `${Math.ceil(Math.max(0, height))}px`;
    },

    // ★Round 14：地図本体をCSS backgroundではなく、常駐する画像要素として保持します。
    // 古いスマホでスクロール先の背景タイルが遅れて描画されるcheckerboardingを抑え、
    // renderMapのたびに地図画像の描画資源を捨てないようにします。
    _ensureMapBaseImage(mapW, mapH) {
        let img = this._mapBaseImage;
        if (!img) {
            img = new Image();
            img.id = 'map-base-image';
            img.alt = '';
            img.draggable = false;
            img.loading = 'eager';
            img.decoding = 'async';
            try { img.fetchPriority = 'high'; } catch (e) {}

            const markReady = () => {
                if (this.mapEl) this.mapEl.classList.add('base-map-image-ready');
            };
            img.addEventListener('load', markReady, { once: true });
            const isPC = document.body.classList.contains('is-pc');
            // スマホは表示専用地図だけ75%解像度版を使い、常駐デコードメモリを約45%削減します。
            // 論理座標・城/国IDマップは従来どおり3140x2440なのでゲーム判定には影響しません。
            img.src = isPC ? './data/images/map/japan_map.png' : './data/images/map/japan_map_mobile.png';
            this._mapBaseImage = img;

            // preload済みでもdecode済みとは限らないので、要素を保持したままdecodeを促します。
            if (typeof img.decode === 'function') {
                img.decode().then(markReady).catch(() => {});
            } else if (img.complete && img.naturalWidth > 0) {
                markReady();
            }
        }

        img.style.width = `${mapW}px`;
        img.style.height = `${mapH}px`;
        return img;
    },

    // 新規開始・ロード時に、実際に画面へ貼る地図画像そのものの読込/decode完了を待つ正規窓口。
    // DataManagerの城/国IDマップが完成していても、表示用Imageのdecodeは別の非同期処理なので、
    // ここを待たずにロード画面を閉じるとゲーム画面だけ先に出て地図が後から現れてしまう。
    async prepareMapBaseImage(mapW, mapH) {
        const img = this._ensureMapBaseImage(mapW, mapH);
        if (!img) throw new Error('表示用地図画像を準備できませんでした。');

        if (!img.complete) {
            await new Promise((resolve, reject) => {
                const onLoad = () => {
                    cleanup();
                    resolve();
                };
                const onError = () => {
                    cleanup();
                    reject(new Error(`表示用地図画像の読み込みに失敗しました: ${img.src || ''}`));
                };
                const cleanup = () => {
                    img.removeEventListener('load', onLoad);
                    img.removeEventListener('error', onError);
                };
                img.addEventListener('load', onLoad);
                img.addEventListener('error', onError);
            });
        }

        if (!img.naturalWidth || !img.naturalHeight) {
            throw new Error(`表示用地図画像の読み込みに失敗しました: ${img.src || ''}`);
        }

        // load済みでもデコード待ちのことがあるため、対応ブラウザではdecode完了まで待つ。
        // 一部WebViewではdecode()だけが失敗する場合があるので、naturalSizeが取れていればload成功を優先する。
        if (typeof img.decode === 'function') {
            try {
                await img.decode();
            } catch (error) {
                if (!img.naturalWidth || !img.naturalHeight) throw error;
            }
        }

        if (this.mapEl) this.mapEl.classList.add('base-map-image-ready');
        return img;
    },

    // 勢力色レイヤーはスマホでは内部解像度を半分にし、Canvas/ImageDataの瞬間メモリを約1/4にします。
    // CSS上の大きさは元地図と同じなので、9:16画面で見た目のサイズは変わりません。
    _getClanColorRasterSize(mapW, mapH) {
        const isPC = document.body.classList.contains('is-pc');
        const scale = isPC ? 1 : 0.5;
        return {
            width: Math.max(1, Math.round(mapW * scale)),
            height: Math.max(1, Math.round(mapH * scale)),
            scale
        };
    },

    // 全画面エフェクトもスマホでは半解像度へ落とします。
    // CSS上は原寸地図サイズへ拡大するため、城・国の論理座標や当たり判定は変わりません。
    _getMapOverlayRasterSize(mapW, mapH) {
        const isPC = document.body.classList.contains('is-pc');
        const scale = isPC ? 1 : 0.5;
        return {
            width: Math.max(1, Math.round(mapW * scale)),
            height: Math.max(1, Math.round(mapH * scale)),
            scale
        };
    },

    // 雪は細かな境界線ではなく規則的な水玉を見せる静的レイヤーなので、
    // 古いスマホでは専用に1/4解像度まで落として常駐メモリと再描画量を抑えます。
    // PCは従来どおり原寸を維持します。
    _getSnowOverlayRasterSize(mapW, mapH) {
        const isPC = document.body.classList.contains('is-pc');
        const scale = isPC ? 1 : 0.25;
        return {
            width: Math.max(1, Math.round(mapW * scale)),
            height: Math.max(1, Math.round(mapH * scale)),
            scale
        };
    },

    _sampleIdMap(pixelMap, mapW, mapH, rasterW, rasterH, x, y) {
        if (!pixelMap) return 0;
        if (rasterW === mapW && rasterH === mapH) return pixelMap[y * mapW + x] || 0;
        const sx = Math.min(mapW - 1, Math.floor(((x + 0.5) * mapW) / rasterW));
        const sy = Math.min(mapH - 1, Math.floor(((y + 0.5) * mapH) / rasterH));
        return pixelMap[sy * mapW + sx] || 0;
    },

    // 巨大な全画面ImageDataを1枚作らず、短い帯だけを生成して順番にCanvasへ転送します。
    // スマホでは1回の一時RGBAを数百KB以下へ抑えます。
    _paintCanvasByStrips(canvas, paintPixel, stripRows = null) {
        if (!canvas || typeof paintPixel !== 'function') return false;
        try {
            const ctx = canvas.getContext('2d', canvas.id === 'clan-color-overlay' ? { willReadFrequently: true } : undefined);
            if (!ctx) return false;
            const width = canvas.width;
            const height = canvas.height;
            const isPC = document.body.classList.contains('is-pc');
            const rows = Math.max(1, Number(stripRows) || (isPC ? 128 : 32));
            ctx.clearRect(0, 0, width, height);
            for (let yStart = 0; yStart < height; yStart += rows) {
                const h = Math.min(rows, height - yStart);
                const imageData = ctx.createImageData(width, h);
                const data = imageData.data;
                for (let localY = 0; localY < h; localY++) {
                    const y = yStart + localY;
                    for (let x = 0; x < width; x++) {
                        paintPixel(data, (localY * width + x) * 4, x, y, width, height);
                    }
                }
                ctx.putImageData(imageData, 0, yStart);
            }
            return true;
        } catch (error) {
            // 低メモリでCanvas backing storeが失われた場合も、UI全体を例外で止めない。
            if (canvas.id === 'clan-color-overlay') {
                this.lastClanColorsHash = null;
                this._lastClanColorOverlay = null;
            }
            if (canvas.id === 'snow-overlay') {
                this.lastSnowHash = null;
                this._snowOverlayDirty = true;
                this._lastSnowOverlay = null;
            }
            console.warn(`地図Canvas(${canvas.id || 'unknown'})の帯状描画をスキップしました:`, error);
            return false;
        }
    },

    _bindMapCanvasRecovery(canvas, canvasId) {
        if (!canvas || canvas.dataset.mapRecoveryBound === '1') return;
        canvas.dataset.mapRecoveryBound = '1';
        const invalidate = () => {
            if (canvasId === 'clan-color-overlay') {
                this.lastClanColorsHash = null;
                this._lastClanColorOverlay = null;
            }
            if (canvasId === 'snow-overlay') {
                this.lastSnowHash = null;
                this._snowOverlayDirty = true;
                this._lastSnowOverlay = null;
            }
        };
        canvas.addEventListener('contextlost', event => {
            try { if (event && typeof event.preventDefault === 'function') event.preventDefault(); } catch (e) {}
            invalidate();
        });
        canvas.addEventListener('contextrestored', () => {
            invalidate();
            if (this.isBackgroundPaused) return;
            if (canvasId === 'clan-color-overlay' && typeof this.updateClanColors === 'function') this.updateClanColors();
            if (canvasId === 'snow-overlay' && typeof this.updateSnowOverlay === 'function') this.updateSnowOverlay();
        });
    },

    // ★Round 14：普段は不要な全画面Canvasは必要になった時だけ確保します。
    _ensureMapOverlayCanvas(canvasId, zIndex = 3) {
        if (!this.mapEl) return null;
        const mapW = this.game.mapWidth || 1200;
        const mapH = this.game.mapHeight || 800;
        const raster = canvasId === 'snow-overlay'
            ? this._getSnowOverlayRasterSize(mapW, mapH)
            : this._getMapOverlayRasterSize(mapW, mapH);
        let canvas = document.getElementById(canvasId);
        if (!canvas) {
            canvas = document.createElement('canvas');
            canvas.id = canvasId;
            canvas.style.position = 'absolute';
            canvas.style.left = '0px';
            canvas.style.top = '0px';
            canvas.style.pointerEvents = 'none';
            canvas.style.zIndex = String(zIndex);
            this.mapEl.appendChild(canvas);
        }
        if (canvas.width !== raster.width || canvas.height !== raster.height) {
            canvas.width = raster.width;
            canvas.height = raster.height;
        }
        canvas.style.width = `${mapW}px`;
        canvas.style.height = `${mapH}px`;
        this._bindMapCanvasRecovery(canvas, canvasId);
        return canvas;
    },

    _releaseMapOverlayCanvas(canvasId) {
        const canvas = document.getElementById(canvasId);
        if (!canvas) return;
        try {
            const ctx = canvas.getContext('2d');
            if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
            canvas.width = 1;
            canvas.height = 1;
        } catch (e) {}
        canvas.remove();
        if (canvasId === 'snow-overlay' && this._lastSnowOverlay === canvas) {
            this._lastSnowOverlay = null;
        }
    },

    // スマホで一時的な操作レイヤーだけを解放します。
    // 勢力色と雪は地図の継続状態を表す静的レイヤーなので、AI進行やモーダル表示をまたいで保持します。
    releaseMobileTransientMapResources() {
        if (document.body.classList.contains('is-pc')) return;
        this._stopMapInertia();
        if (typeof this._cancelActiveMapFocus === 'function') this._cancelActiveMapFocus();
        ['province-overlay', 'hover-blink-overlay', 'keep-blink-overlay'].forEach(id => this._releaseMapOverlayCanvas(id));
        document.body.classList.add('mobile-memory-guard');
    },

    _isClanColorOverlayHealthy() {
        const overlay = document.getElementById('clan-color-overlay');
        if (!overlay || overlay.width <= 1 || overlay.height <= 1) return false;
        const mapW = Number(this.game.mapWidth || 1200);
        const mapH = Number(this.game.mapHeight || 800);
        const owned = this.game.castles.find(c => Number(c.ownerClan) !== 0 && Number.isFinite(Number(c.pixelX)) && Number.isFinite(Number(c.pixelY)));
        if (!owned) return true;
        const x = Math.max(0, Math.min(overlay.width - 1, Math.floor((Number(owned.pixelX) / mapW) * overlay.width)));
        const y = Math.max(0, Math.min(overlay.height - 1, Math.floor((Number(owned.pixelY) / mapH) * overlay.height)));
        try {
            const ctx = overlay.getContext('2d', { willReadFrequently: true });
            if (!ctx) return false;
            return ctx.getImageData(x, y, 1, 1).data[3] > 0;
        } catch (e) {
            return false;
        }
    },

    recoverMobileMapResources() {
        if (document.body.classList.contains('is-pc')) return;
        document.body.classList.remove('mobile-memory-guard');
        // 低メモリ時にCanvas backing storeだけ失われてもhashが同じだと再描画されないため、
        // 所有城の1pixelだけ確認して空なら勢力色を作り直します。
        if (!this._isClanColorOverlayHealthy()) {
            this.lastClanColorsHash = null;
            this._lastClanColorOverlay = null;
        }

        const hasHeavySnow = Array.isArray(this.game && this.game.provinces) && this.game.provinces.some(
            p => p.statusEffects && p.statusEffects.includes('heavySnow')
        );
        if (hasHeavySnow) {
            // 雪Canvasはモーダル/AI中も保持するため、復帰のたびに全地図を再描画しません。
            // DOM自体が無い、または明示的に縮退している時だけ再生成を予約します。
            // backing store喪失はcontextlost/contextrestoredで別途無効化します。
            const snowOverlay = document.getElementById('snow-overlay');
            if (!snowOverlay || snowOverlay.width <= 1 || snowOverlay.height <= 1) {
                this.lastSnowHash = null;
                this._snowOverlayDirty = true;
                this._lastSnowOverlay = null;
            }
        }
    },

    // ★Round14：ズーム中に強制リロードされた場合だけ既存の実機診断に痕跡を残します。
    // 正常終了したら直前の診断値へ戻すため、普段のAI診断を汚しません。
    _beginMapZoomDiagnostic(level) {
        if (document.body.classList.contains('is-pc')) return;
        try {
            if (this._mapZoomPreviousDiagnostic === undefined && typeof sessionStorage !== 'undefined') {
                this._mapZoomPreviousDiagnostic = sessionStorage.getItem('sengoku_ai_last_checkpoint_v1');
            }
        } catch (e) {
            this._mapZoomPreviousDiagnostic = null;
        }
        if (this.game && typeof this.game.writeSystemDiagnostic === 'function') {
            this.game.writeSystemDiagnostic(`map_zoom:start:${level}`);
        }
    },

    _endMapZoomDiagnostic() {
        if (document.body.classList.contains('is-pc')) return;
        if (this._mapZoomPreviousDiagnostic === undefined) return;
        try {
            if (typeof sessionStorage !== 'undefined') {
                if (this._mapZoomPreviousDiagnostic) {
                    sessionStorage.setItem('sengoku_ai_last_checkpoint_v1', this._mapZoomPreviousDiagnostic);
                } else {
                    sessionStorage.removeItem('sengoku_ai_last_checkpoint_v1');
                }
            }
        } catch (e) {}
        this._mapZoomPreviousDiagnostic = undefined;
    },

    initMapDrag() {
        this.isDraggingMap = false;
        this.dragStartX = 0;
        this.dragStartY = 0;
        this.scrollLeft = 0;
        this.scrollTop = 0;
        this.isMouseDown = false;
        
        this.velocityX = 0;
        this.velocityY = 0;
        this.lastDragTime = 0;
        this.lastDragX = 0;
        this.lastDragY = 0;
        this.inertiaFrame = null;
        
        const sc = document.getElementById('map-scroll-container');
        if (!sc) return;

        sc.addEventListener('mousedown', (e) => {
            if (e.button !== 0) return; 
            
            const isPC = document.body.classList.contains('is-pc');

            this._stopMapInertia();

            this.isMouseDown = true;
            this.isDraggingMap = false;
            this.dragStartX = e.pageX - sc.offsetLeft;
            this.dragStartY = e.pageY - sc.offsetTop;
            this.scrollLeft = sc.scrollLeft;
            this.scrollTop = sc.scrollTop;
            
            if (isPC) {
                this.lastDragTime = performance.now();
                this.lastDragX = this.dragStartX;
                this.lastDragY = this.dragStartY;
                this.velocityX = 0;
                this.velocityY = 0;
            }

            sc.classList.add('grabbing');
        });

        const endDrag = () => {
            if (!this.isMouseDown) return;
            this.isMouseDown = false;
            sc.classList.remove('grabbing');
            
            setTimeout(() => {
                this.isDraggingMap = false;
            }, 50);

            if (document.body.classList.contains('is-pc') && (Math.abs(this.velocityX) > 0.5 || Math.abs(this.velocityY) > 0.5)) {
                this.applyInertia(sc);
            }
        };
        
        sc.addEventListener('mouseleave', endDrag);
        sc.addEventListener('mouseup', endDrag);

        // ★追加：マウスが動きすぎた時にブラウザがパンクしないよう、処理を間引くためのスイッチです
        this.isMapTicking = false;

        sc.addEventListener('mousemove', (e) => {
            if (!this.isMouseDown) return;
            e.preventDefault(); 
            
            // ★追加：まだ前の画面を描き終わっていない時は、新しいマウスの動きを一旦無視します（カクツキ防止！）
            if (!this.isMapTicking) {
                window.requestAnimationFrame(() => {
                    const x = e.pageX - sc.offsetLeft;
                    const y = e.pageY - sc.offsetTop;
                    const walkX = (x - this.dragStartX);
                    const walkY = (y - this.dragStartY);
                    
                    // ★遊び（デッドゾーン）の追加：10ピクセル動くまではクリックのブレとみなします
                    if (!this.isDraggingMap) {
                        if (Math.abs(walkX) > 10 || Math.abs(walkY) > 10) {
                            this.isDraggingMap = true;
                        } else {
                            this.isMapTicking = false; // ★忘れずにスイッチを戻します
                            return; // まだ遊びの範囲内なので、ここで処理をストップして地図を動かしません
                        }
                    }

                    sc.scrollLeft = this.scrollLeft - walkX;
                    sc.scrollTop = this.scrollTop - walkY;

                    if (document.body.classList.contains('is-pc')) {
                        const now = performance.now();
                        const dt = now - this.lastDragTime;
                        if (dt > 0) {
                            this.velocityX = (x - this.lastDragX) / dt * 15;
                            this.velocityY = (y - this.lastDragY) / dt * 15;
                        }
                        this.lastDragTime = now;
                        this.lastDragX = x;
                        this.lastDragY = y;
                    }
                    
                    this.isMapTicking = false; // ★画面を描き終わったらスイッチを戻して、次の動きを受け付けます
                });
                
                this.isMapTicking = true; // ★処理中（描画中）の目印をつけます
            }
        });
        
        this.isZooming = false;
        sc.addEventListener('wheel', (e) => {
            if (document.body.classList.contains('is-pc')) {
                e.preventDefault(); 
                if (this.isZooming) return; 
                
                this.isZooming = true;
                setTimeout(() => { this.isZooming = false; }, 350); 

                if (e.deltaY < 0) this.changeMapZoom(1, e.clientX, e.clientY);       
                else if (e.deltaY > 0) this.changeMapZoom(-1, e.clientX, e.clientY); 
            }
        }, { passive: false });

        let initialPinchDist = null;

        const resetPinch = (e) => {
            if (!e || !e.touches || e.touches.length < 2) {
                initialPinchDist = null;
                this.isZooming = false;
            }
        };

        sc.addEventListener('touchstart', (e) => {
            if (e.touches.length >= 2) {
                e.preventDefault();
                this._stopMapInertia();
            }
            if (e.touches.length === 2) {
                initialPinchDist = Math.hypot(
                    e.touches[0].clientX - e.touches[1].clientX,
                    e.touches[0].clientY - e.touches[1].clientY
                );
            }
        }, { passive: false });

        sc.addEventListener('touchmove', (e) => {
            if (e.touches.length >= 2) e.preventDefault();
            if (e.touches.length !== 2 || initialPinchDist === null || this.isZooming) return;

            const t0 = e.touches[0];
            const t1 = e.touches[1];
            const currentDist = Math.hypot(
                t0.clientX - t1.clientX,
                t0.clientY - t1.clientY
            );
            const diff = currentDist - initialPinchDist;

            // ★Round 13：画面中央ではなく、実際に2本指でつまんでいる中点をズーム中心にします。
            const pinchCenterX = (t0.clientX + t1.clientX) / 2;
            const pinchCenterY = (t0.clientY + t1.clientY) / 2;

            if (diff > 50) {
                this.isZooming = true;
                setTimeout(() => { this.isZooming = false; }, 350);
                this.changeMapZoom(1, pinchCenterX, pinchCenterY);
                initialPinchDist = currentDist;
            } else if (diff < -50) {
                this.isZooming = true;
                setTimeout(() => { this.isZooming = false; }, 350);
                this.changeMapZoom(-1, pinchCenterX, pinchCenterY);
                initialPinchDist = currentDist;
            }
        }, { passive: false });

        sc.addEventListener('touchend', resetPinch, { passive: true });
        sc.addEventListener('touchcancel', resetPinch, { passive: true });
    },

    applyInertia(sc) {
        const friction = 0.92; 
        
        const animate = () => {
            this.velocityX *= friction;
            this.velocityY *= friction;
            
            if (Math.abs(this.velocityX) < 0.5 && Math.abs(this.velocityY) < 0.5) {
                this.inertiaFrame = null;
                return;
            }
            
            sc.scrollLeft -= this.velocityX;
            sc.scrollTop -= this.velocityY;
            
            this.inertiaFrame = requestAnimationFrame(animate);
        };
        
        this.inertiaFrame = requestAnimationFrame(animate);
    },
    
    fitMapToScreen() {
        if (!this.mapEl) return;
        const wrapper = document.getElementById('map-wrapper');
        const container = this.mapEl;
        
        const mapW = this.game.mapWidth || 1200;
        const mapH = this.game.mapHeight || 800;
        
        container.style.width = `${mapW}px`;
        container.style.height = `${mapH}px`;
        
        const scaleX = wrapper.clientWidth / mapW;
        const scaleY = wrapper.clientHeight / mapH;
        
        const isPC = document.body.classList.contains('is-pc');
        const config = isPC ? MAP_ZOOM_CONFIG.PC : MAP_ZOOM_CONFIG.MOBILE;

        // ★ 基準となる「画面にピッタリ合わせる（または覆い尽くす）ためのスケール」を計算します
        let baseScale = isPC ? Math.min(scaleX, scaleY) : Math.max(scaleX, scaleY);

        // ★追加：ブラウザの計算誤差によって、最小まで縮小した時に上下に背景（マップの外側）が見えてしまうのを防ぐ魔法です！
        // スマホ版の時は、絶対に隙間ができないようにほんの少しだけ（1%）大きめに覆い尽くすように補正します。
        if (!isPC) {
            baseScale = baseScale * 1.01;
        }

        // ★ 基準のスケールに対して、設定した倍率（min, mid, max）を掛け算してそれぞれのズームサイズを作ります！
        this.zoomStages = [
            baseScale * (config.min || 1.0),       
            baseScale * (config.mid || 1.5),    
            baseScale * (config.max || 2.5)     
        ];
        
        // 新しいゲーム/ロードでは地図リセット時に予約された初期ズームを使う。
        // 通常は1（標準）、タイトルからの観戦だけ0（最小）を指定する。
        if (this.zoomLevel === undefined || !this.hasInitializedMap) {
            const requested = Number.isInteger(this._initialMapZoomLevel) ? this._initialMapZoomLevel : 1;
            this.zoomLevel = Math.max(0, Math.min(this.zoomStages.length - 1, requested));
            this._initialMapZoomLevel = null;
        } else {
            if (this.zoomLevel >= this.zoomStages.length) {
                this.zoomLevel = this.zoomStages.length - 1;
            }
        }
        this.mapScale = this.zoomStages[this.zoomLevel];
        
        this.applyMapScale();
        this.updateZoomButtons(); 
    },
    
    applyMapScale() {
        if(this.mapEl) {
            const mapW = this.game.mapWidth || 1200; 
            const mapH = this.game.mapHeight || 800;
            const sc = document.getElementById('map-scroll-container');
            
            if (mapW && mapH && sc) {
                const scaledW = mapW * this.mapScale;
                const scaledH = mapH * this.mapScale;
                
                let marginLeft = 0;
                let marginTop = 0;
                
                if (scaledW < sc.clientWidth) marginLeft = (sc.clientWidth - scaledW) / 2;
                if (scaledH < sc.clientHeight) marginTop = (sc.clientHeight - scaledH) / 2;
                
                this.mapEl.style.position = 'absolute';
                this.mapEl.style.left = `${marginLeft}px`;
                this.mapEl.style.top = `${marginTop}px`;
                this.mapEl.style.margin = '0px'; 
                
                this.mapEl.style.transformOrigin = '0 0';
                this.mapEl.style.transform = this._getMapScaleTransform(this.mapScale);

                this._setMapSpacerSize(
                    sc,
                    scaledW + marginLeft * 2,
                    scaledH + marginTop * 2
                );
            }
        }
    },
    
    changeMapZoom(direction, cx = null, cy = null) {
        const sc = document.getElementById('map-scroll-container');
        const isPC = document.body.classList.contains('is-pc');
        // タイトル復帰／ロードでresetMapViewState()された後に、旧ズームrAFが新しい地図へ
        // transform/scrollを戻さないため、既存のmap view世代をこの1操作の寿命として使います。
        const mapViewResetToken = Number(this._mapViewResetToken || 0);
        const isCurrentMapView = () => Number(this._mapViewResetToken || 0) === mapViewResetToken;

        if (!sc || !this.mapEl || !Array.isArray(this.zoomStages) || this.zoomStages.length === 0) return;
        if (this.isAnimatingZoom) return;

        // 慣性移動とズームが同時にscrollLeft/Topを書き換えないようにします。
        this._stopMapInertia();

        let oldScale = this.mapScale;
        const scales = this.zoomStages;

        let closestIdx = 0;
        let minDiff = Infinity;
        scales.forEach((s, i) => {
            let diff = Math.abs(s - oldScale);
            if (diff < minDiff) { minDiff = diff; closestIdx = i; }
        });

        let nextIdx = closestIdx + direction;
        if (nextIdx < 0) nextIdx = 0;
        if (nextIdx >= scales.length) nextIdx = scales.length - 1;

        let targetScale = scales[nextIdx];
        this.zoomLevel = nextIdx;

        if (Math.abs(targetScale - oldScale) < 0.01) return;

        this._beginMapZoomDiagnostic(this.zoomLevel);

        const rect = sc.getBoundingClientRect();
        cx = cx !== null ? cx : rect.left + rect.width / 2;
        cy = cy !== null ? cy : rect.top + rect.height / 2;
        
        const scaleX = rect.width / sc.offsetWidth || 1;
        const scaleY = rect.height / sc.offsetHeight || 1;

        const clientX = (cx - rect.left) / scaleX;
        const clientY = (cy - rect.top) / scaleY;

        const mapW = this.game.mapWidth || 1200;
        const mapH = this.game.mapHeight || 800;
        const scW = sc.clientWidth; 
        const scH = sc.clientHeight;

        const oldMarginX = parseFloat(this.mapEl.style.left || 0);
        const oldMarginY = parseFloat(this.mapEl.style.top || 0);

        let targetMarginX = 0, targetMarginY = 0;
        if (mapW * targetScale < scW) targetMarginX = (scW - mapW * targetScale) / 2;
        if (mapH * targetScale < scH) targetMarginY = (scH - mapH * targetScale) / 2;

        const logicalX = (sc.scrollLeft + clientX - oldMarginX) / oldScale;
        const logicalY = (sc.scrollTop + clientY - oldMarginY) / oldScale;

        let targetScrollLeft = (logicalX * targetScale + targetMarginX) - clientX;
        let targetScrollTop = (logicalY * targetScale + targetMarginY) - clientY;

        let maxScrollLeft = Math.max(0, mapW * targetScale - scW);
        let maxScrollTop  = Math.max(0, mapH * targetScale - scH);

        if (targetScrollLeft < 0) targetScrollLeft = 0;
        if (targetScrollTop < 0) targetScrollTop = 0;
        if (targetScrollLeft > maxScrollLeft) targetScrollLeft = maxScrollLeft;
        if (targetScrollTop > maxScrollTop) targetScrollTop = maxScrollTop;

        if (mapW * targetScale <= scW) targetScrollLeft = 0;
        if (mapH * targetScale <= scH) targetScrollTop = 0;

        if (isPC) {
            this.isAnimatingZoom = true;
            
            const startScrollLeft = sc.scrollLeft;
            const startScrollTop = sc.scrollTop;
            
            const duration = 200; 
            const startTime = performance.now();

            const animate = (currentTime) => {
                if (!isCurrentMapView()) {
                    this.isAnimatingZoom = false;
                    return;
                }
                let progress = (currentTime - startTime) / duration;
                if (progress < 0) progress = 0; 
                if (progress > 1) progress = 1;
                
                const easeOut = 1 - Math.pow(1 - progress, 3);
                const currentScale = oldScale + (targetScale - oldScale) * easeOut;
                
                const currentMarginX = oldMarginX + (targetMarginX - oldMarginX) * easeOut;
                const currentMarginY = oldMarginY + (targetMarginY - oldMarginY) * easeOut;
                
                const currentScrollLeft = startScrollLeft + (targetScrollLeft - startScrollLeft) * easeOut;
                const currentScrollTop = startScrollTop + (targetScrollTop - startScrollTop) * easeOut;

                this._setMapSpacerSize(
                    sc,
                    mapW * currentScale + currentMarginX * 2,
                    mapH * currentScale + currentMarginY * 2
                );

                this.mapEl.style.position = 'absolute';
                this.mapEl.style.left = `${currentMarginX}px`;
                this.mapEl.style.top = `${currentMarginY}px`;
                this.mapEl.style.transformOrigin = '0 0';
                this.mapEl.style.transform = this._getMapScaleTransform(currentScale, true);

                sc.scrollLeft = currentScrollLeft;
                sc.scrollTop = currentScrollTop;

                if (progress < 1) {
                    requestAnimationFrame(animate); 
                } else {
                    this.mapScale = targetScale;
                    this.applyMapScale(); 
                    sc.scrollLeft = targetScrollLeft;
                    sc.scrollTop = targetScrollTop;
                    this.updateZoomButtons();
                    this.isAnimatingZoom = false;
                    this._endMapZoomDiagnostic();
                }
            };
            requestAnimationFrame(animate); 
        } else {
            // ★Round 13：overflowを hidden→auto と切り替えると、古いChromeで
            // scroll範囲の再作成と強制クランプが起きやすいため、常時autoのまま更新します。
            this.mapScale = targetScale;
            this.applyMapScale();

            // spacerとtransformを同じターンで更新した直後に目的位置を設定します。
            sc.scrollLeft = targetScrollLeft;
            sc.scrollTop = targetScrollTop;

            // 一部の古いWebViewはレイアウト確定前のscroll値を丸めるため、
            // 次フレームに「ずれていた時だけ」1回補正します。
            requestAnimationFrame(() => {
                if (!isCurrentMapView()) return;
                if (Math.abs(sc.scrollLeft - targetScrollLeft) > 0.5) sc.scrollLeft = targetScrollLeft;
                if (Math.abs(sc.scrollTop - targetScrollTop) > 0.5) sc.scrollTop = targetScrollTop;
                this._endMapZoomDiagnostic();
            });

            this.updateZoomButtons();
        }
    },
    
    // ==========================================
    // ★Round23：イベント・戦争演出で共通利用する「拠点へカメラを寄せる」魔法
    // castle / castleId / castleId配列のいずれも受け取れます。
    // transition: 'smooth' ならぬるっと移動、'instant' なら瞬時に移動します。
    // 旧 immediate オプションも互換維持（true=instant / false=smooth）。
    // ズーム倍率は変えず、現在の倍率のまま対象地点を画面中央へ寄せます。
    // ==========================================
    focusMapOnCastle(castleOrId, options = {}) {
        const sc = document.getElementById('map-scroll-container');
        if (!sc || !this.mapEl) return Promise.resolve(false);

        const rawTargets = Array.isArray(castleOrId) ? castleOrId : [castleOrId];
        const castles = rawTargets.map(target => {
            if (!target) return null;
            if (typeof target === 'object' && target.pixelX !== undefined && target.pixelY !== undefined) return target;
            return this.game && typeof this.game.getCastle === 'function' ? this.game.getCastle(Number(target)) : null;
        }).filter(c => c && Number.isFinite(Number(c.pixelX)) && Number.isFinite(Number(c.pixelY)));

        if (castles.length === 0) return Promise.resolve(false);

        // Round20のイベント地図表示中など、通常マップ自体が退避中なら無理に動かしません。
        const scStyle = window.getComputedStyle ? window.getComputedStyle(sc) : null;
        if (sc.style.display === 'none' || (scStyle && scStyle.display === 'none')) return Promise.resolve(false);
        if (sc.clientWidth <= 0 || sc.clientHeight <= 0) return Promise.resolve(false);

        this._stopMapInertia();

        // 通常操作は城アイコン（種点）を中心にします。戦闘・制圧など領域そのものを
        // 光らせる演出だけは、起動時に計算した領域重心へ寄せて「カメラ位置」と
        // 「点滅して見える位置」がスマホでも一致するようにします。
        const focusAnchor = options.anchor === 'territory' ? 'territory' : 'castle';
        const focusPoints = castles.map(c => {
            if (focusAnchor === 'territory') {
                const center = DataManager.castlePixelCenters && DataManager.castlePixelCenters[Number(c.id)];
                if (center && Number.isFinite(Number(center.x)) && Number.isFinite(Number(center.y))) {
                    return { x: Number(center.x), y: Number(center.y) };
                }
                const bounds = DataManager.castlePixelBounds && DataManager.castlePixelBounds[Number(c.id)];
                if (bounds) {
                    return { x: (bounds.minX + bounds.maxX) / 2, y: (bounds.minY + bounds.maxY) / 2 };
                }
            }
            return { x: Number(c.pixelX), y: Number(c.pixelY) };
        });
        const avgX = focusPoints.reduce((sum, p) => sum + p.x, 0) / focusPoints.length;
        const avgY = focusPoints.reduce((sum, p) => sum + p.y, 0) / focusPoints.length;

        const currentLeft = parseFloat(this.mapEl.style.left || 0) || 0;
        const currentTop = parseFloat(this.mapEl.style.top || 0) || 0;
        const scaledX = avgX * this.mapScale + currentLeft;
        const scaledY = avgY * this.mapScale + currentTop;

        const maxLeft = Math.max(0, sc.scrollWidth - sc.clientWidth);
        const maxTop = Math.max(0, sc.scrollHeight - sc.clientHeight);
        const targetLeft = Math.max(0, Math.min(maxLeft, scaledX - sc.clientWidth / 2));
        const targetTop = Math.max(0, Math.min(maxTop, scaledY - sc.clientHeight / 2));

        // ほぼ目的地なら再スクロールしません。これが二重カメラ指定の見た目上の揺れも防ぎます。
        if (Math.abs(sc.scrollLeft - targetLeft) < 1 && Math.abs(sc.scrollTop - targetTop) < 1) {
            return Promise.resolve(true);
        }

        // Round23：明示的なtransitionを最優先。旧 immediate も互換維持します。
        let transition = options.transition;
        if (transition !== 'smooth' && transition !== 'instant') {
            if (options.immediate === true) transition = 'instant';
            else if (options.immediate === false) transition = 'smooth';
            else {
                const isPC = document.body.classList.contains('is-pc');
                transition = isPC ? 'smooth' : 'instant';
            }
        }

        // OS側で「動きを減らす」が指定されている場合は瞬時移動を優先します。
        if (transition === 'smooth' && window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
            transition = 'instant';
        }

        const lockInteraction = options.lockInteraction !== false;
        if (lockInteraction) {
            if ((this._mapFocusLockCount || 0) === 0) {
                this._mapFocusPrevPointerEvents = sc.style.pointerEvents;
            }
            this._mapFocusLockCount = (this._mapFocusLockCount || 0) + 1;
            sc.style.pointerEvents = 'none';
        }

        if (this.game && typeof this.game.writeSystemDiagnostic === 'function' && options.reason && options.diagnostic !== false) {
            this.game.writeSystemDiagnostic(`map_focus:${options.reason}:${transition}:start`, castles[0]);
        }

        // 新しいカメラ命令が来たら、前のsmooth移動はそこで終わらせます。
        // イベント中の「ぱっと場面転換」が前のアニメーションに引っ張られないための処理です。
        if (typeof this._cancelActiveMapFocus === 'function') {
            this._cancelActiveMapFocus();
        }

        return new Promise(resolve => {
            let done = false;
            let rafId = 0;

            const cleanup = (result = true) => {
                if (done) return;
                done = true;
                if (rafId && typeof cancelAnimationFrame === 'function') cancelAnimationFrame(rafId);

                if (lockInteraction) {
                    this._mapFocusLockCount = Math.max(0, (this._mapFocusLockCount || 1) - 1);
                    if (this._mapFocusLockCount === 0) {
                        sc.style.pointerEvents = this._mapFocusPrevPointerEvents || '';
                        this._mapFocusPrevPointerEvents = '';
                    }
                }

                if (this._cancelActiveMapFocus === cancelSelf) {
                    this._cancelActiveMapFocus = null;
                }

                if (this.game && typeof this.game.writeSystemDiagnostic === 'function' && options.reason && options.diagnostic !== false) {
                    this.game.writeSystemDiagnostic(`map_focus:${options.reason}:${transition}:done`, castles[0]);
                }
                resolve(result);
            };

            const cancelSelf = () => cleanup(false);
            this._cancelActiveMapFocus = cancelSelf;

            if (transition === 'instant') {
                sc.scrollLeft = targetLeft;
                sc.scrollTop = targetTop;

                // spacer/transform更新直後でも確実に目的地へ置くため、次フレームに1回だけ補正します。
                if (typeof requestAnimationFrame === 'function') {
                    rafId = requestAnimationFrame(() => {
                        rafId = 0;
                        if (Math.abs(sc.scrollLeft - targetLeft) > 0.5) sc.scrollLeft = targetLeft;
                        if (Math.abs(sc.scrollTop - targetTop) > 0.5) sc.scrollTop = targetTop;
                        cleanup(true);
                    });
                } else {
                    cleanup(true);
                }
                return;
            }

            // Round23：ブラウザ依存のscroll-behavior:smoothではなく、自前のrAF補間で統一。
            // 古いAndroid/WebViewでも速度・完了タイミングをこちらで管理できます。
            const startLeft = sc.scrollLeft;
            const startTop = sc.scrollTop;
            const dx = targetLeft - startLeft;
            const dy = targetTop - startTop;
            const distance = Math.hypot(dx, dy);
            const viewportDiag = Math.max(1, Math.hypot(sc.clientWidth, sc.clientHeight));
            const distanceRatio = Math.min(3, distance / viewportDiag);
            const duration = Number.isFinite(Number(options.duration))
                ? Math.max(120, Math.min(1200, Number(options.duration)))
                : Math.round(300 + distanceRatio * 120);
            // 古い実機では最初のrAFが数百ms遅れることがあります。開始時刻との差をそのまま
            // 進捗へ使うと、最初の描画でt=1になって「ぬるっと」ではなくワープします。
            // フレーム間の実経過を積算しつつ、1フレームで進めてよい量を50msまでに制限します。
            // 高性能端末では従来どおりの所要時間、低FPS端末では少し時間をかけてでも数フレーム描画します。
            let elapsed = 0;
            let lastFrameTime = null;
            const maxFrameAdvance = 50;

            const animate = (now) => {
                if (done) return;
                const currentTime = Number.isFinite(now) ? now : ((typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now());
                if (lastFrameTime === null) {
                    lastFrameTime = currentTime;
                } else {
                    const rawDelta = Math.max(0, currentTime - lastFrameTime);
                    elapsed += Math.min(maxFrameAdvance, rawDelta);
                    lastFrameTime = currentTime;
                }
                const t = Math.max(0, Math.min(1, elapsed / duration));
                // easeOutCubic：出だしはしっかり動き、目的地では自然に止まります。
                const eased = 1 - Math.pow(1 - t, 3);
                sc.scrollLeft = startLeft + dx * eased;
                sc.scrollTop = startTop + dy * eased;

                if (t < 1) {
                    rafId = requestAnimationFrame(animate);
                } else {
                    rafId = 0;
                    sc.scrollLeft = targetLeft;
                    sc.scrollTop = targetTop;
                    cleanup(true);
                }
            };

            if (typeof requestAnimationFrame === 'function') {
                rafId = requestAnimationFrame(animate);
            } else {
                sc.scrollLeft = targetLeft;
                sc.scrollTop = targetTop;
                cleanup(true);
            }
        });
    },

    // 既存コードとの互換窓口。今後はfocusMapOnCastleを直接awaitできます。
    scrollToActiveCastle(castle = null, immediate = false) {
        const targetCastle = castle || this.currentCastle || this.game.getCurrentTurnCastle();
        return this.focusMapOnCastle(targetCastle, {
            immediate: immediate,
            reason: 'active_castle',
            // 通常のプレイヤー復帰フォーカスは後から完了して player_turn:ready を上書きしない。
            diagnostic: false
        });
    },
    
    updateZoomButtons() {
        if (!this.mapZoomInBtn || !this.mapZoomOutBtn) return;
        
        this.mapZoomInBtn.style.display = (this.zoomLevel >= 2) ? 'none' : 'flex';
        this.mapZoomOutBtn.style.display = (this.zoomLevel <= 0) ? 'none' : 'flex';
    },
    
    // シナリオ中に変化しない道路SVGは、renderMap() のたびに作り直さず同じDOMを再利用します。
    // 所有勢力・兵数・外交状態は道路レイヤーへ含めないため、ゲーム中の状態変化とは独立した静的層です。
    _getOrBuildMapRouteSvg(mapW, mapH) {
        const castles = Array.isArray(this.game.castles) ? this.game.castles : [];
        if (this._staticRouteSvg
            && this._staticRouteCastlesSource === castles
            && this._staticRouteCastlesSize === castles.length
            && this._staticRouteMapW === mapW
            && this._staticRouteMapH === mapH) {
            return this._staticRouteSvg;
        }

        const svgNS = "http://www.w3.org/2000/svg";
        const svg = document.createElementNS(svgNS, "svg");
        
        svg.setAttribute("width", mapW);
        svg.setAttribute("height", mapH);
        
        svg.style.position = "absolute";
        svg.style.left = "0px";
        svg.style.top = "0px";
        svg.style.pointerEvents = "none"; 
        svg.style.zIndex = "5"; 

        const drawnLines = new Set();
        
        // ★特定の道だけ形を変えるためのリストです！

        // Ｓ字：例：["1-2"] と書くと1番と2番の城の道がS字になります
        const forceSCurve = [];
        
        // 直線：例：["3-4"] と書くと3番と4番の城の道が真っ直ぐになります
        const forceStraight = ["17-74"];
        
        // 逆転：例：["5-6"] と書くと5番と6番の城の道の曲がる向きが逆になります
        const forceReverse = ["2-95", "15-20", "17-24", "33-42", "35-186", "38-102", "47-78", "49-78", "56-102", "58-67", "62-213", "65-99", "78-178", "78-251", "79-81", "98-101", "126-155", "153-155", "154-157", "169-171"];

        // 普通カーブ：S字を強制的に「普通のカーブ」に戻すリストです
        const forceNormalCurve = ["33-42", "47-178", "126-155"];

        // 個別にカーブの角度（深さ）を調整する箱です！
        // 今の標準サイズは「0.05 ～ 0.095」くらいです。
        const customCurveSizes = {"13-100": 1.0, "17-72": 0.3, "33-42": 0.2, "35-186": 0.3, "78-178": 0.2, "87-175": 0.16, "187-219": 0.3, "191-192": 1.1};
            // 例："7-12": 0.2,   ←かなり大回りなカーブになります
            // 例："3-5": 0.02    ←かなり直線に近い浅いカーブになります

        this.game.castles.forEach(c1 => {
            const pos1X = c1.pixelX !== undefined ? c1.pixelX : 0;
            const pos1Y = c1.pixelY !== undefined ? c1.pixelY : 0;

            if (c1.adjacentCastleIds) {
                c1.adjacentCastleIds.forEach(adjId => {
                    const c2 = this.game.getCastle(adjId);
                    if (!c2) return;

                    const pairKey = c1.id < adjId ? `${c1.id}-${adjId}` : `${adjId}-${c1.id}`;

                    if (!drawnLines.has(pairKey)) {
                        drawnLines.add(pairKey);

                        const pos2X = c2.pixelX !== undefined ? c2.pixelX : 0;
                        const pos2Y = c2.pixelY !== undefined ? c2.pixelY : 0;

                        const dx = pos2X - pos1X;
                        const dy = pos2Y - pos1Y;
                        const dist = Math.hypot(dx, dy);

                        // ★追加：距離が0（スタートとゴールが同じ場所）の時は、計算が壊れてしまうので線を引くのをやめます！
                        if (dist === 0) return;

                        let curveSize = dist * (0.05 + ((c1.id * c2.id) % 10) * 0.005);
                        
                        // もし「個別に角度を調整する箱」に数字が書かれていたら、それで上書きします！
                        if (customCurveSizes[pairKey] !== undefined) {
                            curveSize = dist * customCurveSizes[pairKey];
                        }

                        let dir = ((c1.id + c2.id) % 2 === 0) ? 1 : -1;

                        // もし「曲がる向きを逆にするリスト」にこの道が入っていたら、向きを反対にします！
                        if (forceReverse.includes(pairKey)) {
                            dir = dir * -1;
                        }

                        const nx = -dy / dist;
                        const ny = dx / dist;

                        const path = document.createElementNS(svgNS, "path");

                        let lineType = "curve"; 
                        
                        if (((c1.id + c2.id) % 3 === 0)) {
                            lineType = "s-curve";
                        }
                        
                        if (forceSCurve.includes(pairKey)) lineType = "s-curve";
                        if (forceStraight.includes(pairKey)) lineType = "straight";
                        
                        // もし「強制的に普通のカーブにするリスト」に入っていたら、S字をやめてカーブに戻します！
                        if (forceNormalCurve.includes(pairKey)) {
                            lineType = "curve";
                        }

                        if (lineType === "s-curve") {
                            const cp1X = pos1X + dx * 0.33 + nx * curveSize * dir;
                            const cp1Y = pos1Y + dy * 0.33 + ny * curveSize * dir;
                            const cp2X = pos1X + dx * 0.67 + nx * curveSize * -dir; 
                            const cp2Y = pos1Y + dy * 0.67 + ny * curveSize * -dir; 
                            
                            path.setAttribute("d", `M ${pos1X} ${pos1Y} C ${cp1X} ${cp1Y}, ${cp2X} ${cp2Y}, ${pos2X} ${pos2Y}`);
                        } else if (lineType === "straight") {
                            path.setAttribute("d", `M ${pos1X} ${pos1Y} L ${pos2X} ${pos2Y}`);
                        } else {
                            const midX = (pos1X + pos2X) / 2;
                            const midY = (pos1Y + pos2Y) / 2;
                            const cpX = midX + nx * curveSize * dir;
                            const cpY = midY + ny * curveSize * dir;
                            
                            path.setAttribute("d", `M ${pos1X} ${pos1Y} Q ${cpX} ${cpY} ${pos2X} ${pos2Y}`);
                        }

                        // ★超重要な修正：念のため、お互いの出席番号を絶対に「数字」として扱ってから確認します！
                        const numAdjId = Number(adjId);
                        const numC1Id = Number(c1.id);
                        const isSeaRoute = (c1.seaRouteIds && c1.seaRouteIds.includes(numAdjId)) || 
                                           (c2.seaRouteIds && c2.seaRouteIds.includes(numC1Id));

                        path.setAttribute("fill", "transparent");
                        
                        if (isSeaRoute) {
                            // 海路の時：少し青っぽくして、透明にして、海路っぽく点線にします！
                            path.setAttribute("stroke", "rgba(100, 200, 255, 0.7)"); 
                            path.setAttribute("stroke-width", "2.0");
                            path.setAttribute("stroke-dasharray", "6, 4"); // 6ピクセル描いて4ピクセル休む「点線」の魔法です
                        } else {
                            // 普通の陸路の時：今まで通りです
                            path.setAttribute("stroke", "rgba(255, 250, 200, 0.9)"); 
                            path.setAttribute("stroke-width", "1.5");
                            path.removeAttribute("stroke-dasharray"); // 念のため点線の魔法を消しておきます
                        }
                        
                        svg.appendChild(path);
                    }
                });
            }
        });
        

        this._staticRouteSvg = svg;
        this._staticRouteCastlesSource = castles;
        this._staticRouteCastlesSize = castles.length;
        this._staticRouteMapW = mapW;
        this._staticRouteMapH = mapH;
        return svg;
    },

    renderMap() {
        if (!this.mapEl) return;

        const mapW = this.game.mapWidth || 1200;
        const mapH = this.game.mapHeight || 800;
        const pixelCount = mapW * mapH;
        // DataManagerがロード時に1回だけ生成したコンパクトIDマップをUIへ受け渡します。
        if (DataManager.castlePixelMap && DataManager.castlePixelMap.length === pixelCount) {
            this.pixelCastleMap = DataManager.castlePixelMap;
        }
        if (DataManager.provincePixelMap && DataManager.provincePixelMap.length === pixelCount) {
            this.pixelProvinceMap = DataManager.provincePixelMap;
        }
        const baseMapImage = this._ensureMapBaseImage(mapW, mapH);

        // ★Round14：勢力色Canvasは地図の静的コア層なので、renderMapをまたいで再利用します。
        // 毎回3.8MB級のCanvasを捨てて作り直すメモリピークを避けます。
        let persistentClanColor = document.getElementById('clan-color-overlay') || this._lastClanColorOverlay || null;

        // ★Round15：雪Canvasも「雪が存在する間」は静的表示層として再利用します。
        // renderMapごとにCanvasを捨てて、別途3.8MB級ImageDataで復元する必要をなくします。
        const hasHeavySnowForRender = Array.isArray(this.game.provinces) && this.game.provinces.some(
            p => p.statusEffects && p.statusEffects.includes('heavySnow')
        );
        let persistentSnowOverlay = hasHeavySnowForRender
            ? (document.getElementById('snow-overlay') || this._lastSnowOverlay || null)
            : null;
        if (!hasHeavySnowForRender) {
            this._releaseMapOverlayCanvas('snow-overlay');
            persistentSnowOverlay = null;
            this.lastSnowHash = null;
            this._snowOverlayDirty = false;
        }

        // ★Round5/14/15：一時エフェクトCanvasだけを縮めて解放します。
        this.mapEl.querySelectorAll('canvas').forEach(oldCanvas => {
            if (oldCanvas === persistentClanColor || oldCanvas === persistentSnowOverlay) return;
            try {
                const oldCtx = oldCanvas.getContext('2d');
                if (oldCtx) oldCtx.clearRect(0, 0, oldCanvas.width, oldCanvas.height);
                oldCanvas.width = 1;
                oldCanvas.height = 1;
            } catch (e) {}
        });

        // 地図画像そのものは同じImage要素を保持し、毎回decode/raster資源を捨てません。
        this.mapEl.replaceChildren(baseMapImage);
        if (persistentClanColor) {
            const clanRaster = this._getClanColorRasterSize(mapW, mapH);
            if (persistentClanColor.width !== clanRaster.width || persistentClanColor.height !== clanRaster.height) {
                persistentClanColor.width = clanRaster.width;
                persistentClanColor.height = clanRaster.height;
            }
            persistentClanColor.style.width = `${mapW}px`;
            persistentClanColor.style.height = `${mapH}px`;
            this.mapEl.appendChild(persistentClanColor);
        }
        if (persistentSnowOverlay) {
            const snowRaster = this._getSnowOverlayRasterSize(mapW, mapH);
            if (persistentSnowOverlay.width !== snowRaster.width || persistentSnowOverlay.height !== snowRaster.height) {
                persistentSnowOverlay.width = snowRaster.width;
                persistentSnowOverlay.height = snowRaster.height;
                this._snowOverlayDirty = true;
            }
            persistentSnowOverlay.style.width = `${mapW}px`;
            persistentSnowOverlay.style.height = `${mapH}px`;
            this._bindMapCanvasRecovery(persistentSnowOverlay, 'snow-overlay');
            this.mapEl.appendChild(persistentSnowOverlay);
        }
        
        // ★追加：一旦、勢力名シールが出ている合図をリセットします
        document.body.classList.remove('showing-daimyo-labels');

        const isSelectionMode = (this.game.selectionMode !== null);
        // 選択モード中は、同じvalidTargetsを全拠点カード・勢力名ラベルから何度もincludesしない。
        // Setはincludesと同じSameValueZero比較なので候補範囲・ID型の意味を変えない。
        const validTargetSet = isSelectionMode ? new Set(this.game.validTargets) : null;
        const isDaimyoSelect = (this.game.phase === 'daimyo_select');

        // ★超重要修正：マップの大きさを計算する前に、大名選択モードの目印をつけて画面を広げておきます！
        // （これをしないと、画面が広がる前の小さいサイズでマップが作られてしまい、上下に隙間ができてしまいます）
        if (isDaimyoSelect) {
            document.body.classList.add('daimyo-select-mode');
        } else {
            document.body.classList.remove('daimyo-select-mode');
        }
        
        if (!this.hasInitializedMap && this.game.castles.length > 0) {
            this.fitMapToScreen();
            this.hasInitializedMap = true;
            
            const sc = document.getElementById('map-scroll-container');
            if (sc) {
                const initToken = Number(this._mapViewResetToken || 0);
                setTimeout(() => {
                    // リセット前の古い初期フォーカス予約は、新しいゲーム/ロードへ持ち越さない。
                    if (initToken !== Number(this._mapViewResetToken || 0) || !this.hasInitializedMap) return;
                    const isPC = document.body.classList.contains('is-pc');
                    const folderName = this.game.scenarioFolder;
                    const config = INITIAL_MAP_CENTER_CONFIG[folderName] || INITIAL_MAP_CENTER_CONFIG.DEFAULT;
                    const centerCastleId = isPC ? config.PC : config.MOBILE;
                    // 初回表示は常にシナリオ既定地点。前回選択城や現在ターン城を初期中心には使わない。
                    const centerCastle = this.game.getCastle(centerCastleId);
                    if (centerCastle) {
                        // お城が見つかったら、そこを真ん中にして映します。最初は一瞬で移動させます！
                        this.scrollToActiveCastle(centerCastle, true);
                    } else {
                        // もしお城が見つからなかった時のためのお守りです（今まで通り全体の真ん中を映します）
                        sc.scrollTo({
                            left: (sc.scrollWidth - sc.clientWidth) / 2,
                            top: (sc.scrollHeight - sc.clientHeight) / 2,
                            behavior: 'auto'
                        });
                    }
                }, 0);
            }
        }

        if (this.mapGuide) {
            if(isSelectionMode) {
                this.mapGuide.classList.remove('hidden'); 
                this.mapGuide.textContent = this.game.commandSystem.getSelectionGuideMessage();
            } else if (isDaimyoSelect) {
                // ★修正：城を選んでいる時は案内板を非表示にします！
                if (this.selectedDaimyoId) {
                    this.mapGuide.classList.add('hidden');
                } else {
                    this.mapGuide.classList.remove('hidden'); 
                    this.mapGuide.textContent = "操作する勢力を選択してください";
                }
            } else {
                this.mapGuide.classList.add('hidden'); 
            }
        }
        if (this.aiGuard) { 
            // マップで対象を選んでいる最中(isSelectionMode)は、バリアを完全に消して触れるようにします
            if (isSelectionMode) {
                this.aiGuard.classList.add('hidden'); 
            } else if (this.game.isProcessingAI) {
                // AI処理中なら絶対にバリアを張ります！
                this.aiGuard.classList.remove('hidden'); 
                
                // ただし、ダイアログなどで一時的に隠したい時(guardTextHiddenCount)は、壁ごと消すのではなく文字だけを透明にして隠します！
                if ((this.guardTextHiddenCount || 0) > 0) {
                    this.aiGuard.classList.add('hide-text');
                } else {
                    this.aiGuard.classList.remove('hide-text');
                }
            } else {
                // AI処理中でなければバリアを消します
                this.aiGuard.classList.add('hidden'); 
            }
        }

        // 変更後
        const activeCastle = this.currentCastle || this.game.getCurrentTurnCastle(); // ★今ターンが来ている城を覚えておきます
        this.updateInfoPanel(activeCastle);

        // ★追加：ポップアップの目印シールを貼るために、絶対に「今のターンの城」を取得する魔法です
        const turnCastle = this.game.getCurrentTurnCastle();

        // ==========================================
        // ★最新版：勢力の色で国を塗るための画用紙を敷きます！
        // ==========================================
        let clanColorOverlay = persistentClanColor || document.getElementById('clan-color-overlay');
        if (!clanColorOverlay) {
            const clanRaster = this._getClanColorRasterSize(mapW, mapH);
            clanColorOverlay = document.createElement('canvas');
            clanColorOverlay.id = 'clan-color-overlay';
            clanColorOverlay.width = clanRaster.width;
            clanColorOverlay.height = clanRaster.height;
            clanColorOverlay.style.position = 'absolute';
            clanColorOverlay.style.left = '0px';
            clanColorOverlay.style.top = '0px';
            clanColorOverlay.style.width = `${mapW}px`;
            clanColorOverlay.style.height = `${mapH}px`;
            clanColorOverlay.style.pointerEvents = 'none'; 
            clanColorOverlay.style.zIndex = '2'; // マップのすぐ上に敷きます
        }
        this._bindMapCanvasRecovery(clanColorOverlay, 'clan-color-overlay');
        this.mapEl.appendChild(clanColorOverlay);

        // ★Round14：普段透明な全画面Canvasは常駐させません。
        // PCのhoverだけは頻繁に使うためPC時のみ先に確保し、
        // 地方ハイライト・キープ光・雪は実際に必要になった時だけ生成します。
        if (document.body.classList.contains('is-pc')) {
            this._ensureMapOverlayCanvas('hover-blink-overlay', 3);
        }

        this.mapEl.appendChild(this._getOrBuildMapRouteSvg(mapW, mapH));
        
        this.game.castles.forEach(c => {
            const el = document.createElement('div'); el.className = 'castle-card';

            el.setAttribute('data-castle-id', String(c.id));
            el.dataset.clan = c.ownerClan;
            
            const posX = c.pixelX !== undefined ? c.pixelX : 0;
            const posY = c.pixelY !== undefined ? c.pixelY : 0;
            
            el.style.left = `${posX}px`;
            el.style.top = `${posY}px`;

            // ★城の石高と城防御の合計値によってサイズを変動させる魔法
            const totalValue = (c.kokudaka || 0) + (c.defense || 0);
            const deficit = Math.max(0, 4000 - totalValue); // 4000に足りない分を計算します
            const scaleDownPercent = Math.floor(deficit / 200); // 200不足するごとに1%縮小します
            const scaleRatio = 1 - (scaleDownPercent * 0.01);
            const currentScale = 0.41 * scaleRatio; // 基本のサイズ(0.41)に倍率を掛けます
            el.style.setProperty('--castle-scale', currentScale);

            if (c.isDone) el.classList.add('done');
            const castellan = this.game.getBusho(c.castellanId); const clanData = this.game.getClan(c.ownerClan);
            
            const castellanName = castellan ? castellan.name : '-';            
            
            // ★ 修正：大名選択画面の時はホバー情報を出さない（名前シールは後でまとめて貼ります！）
            if (isDaimyoSelect) {
                el.innerHTML = '';
            } else {
                // ★追加：城の中にいる諸勢力を調べて、左下に並べる魔法！
                let kunishuHtml = '';
                // この城にいる諸勢力のリストをもらいます
                const kunishus = this.game.kunishuSystem ? this.game.kunishuSystem.getKunishusInCastle(c.id) : [];
                
                // もし諸勢力がいたら、アイコンの箱を作ります
                if (kunishus && kunishus.length > 0) {
                    kunishuHtml = `<div class="kunishu-icons-container">`;
                    kunishus.forEach(k => {
                        const kLeader = this.game.getBusho(k.leaderId);
                        const kLeaderName = kLeader ? kLeader.name : "頭領";
                        const kName = k.getName(this.game);
                        
                        // 諸勢力の数だけ、アイコンと吹き出しを追加します！
                        kunishuHtml += `
                            <div class="kunishu-icon-wrap">
                                <img src="data/images/map/various_forces.webp" class="kunishu-icon-img">
                                <div class="hover-info kunishu-hover-info">
                                    <div class="info-line">${kName}</div>
                                    <div class="info-line">${kLeaderName}</div>
                                </div>
                            </div>
                        `;
                    });
                    kunishuHtml += `</div>`;
                }

                // ★軍団マーカーの作成（第1～第8軍団の場合のみ）
                let legionMarkerHtml = '';
                // どの勢力でも軍団に所属していればマーカーを作ります
                if (c.legionId > 0) {
                    // 漢数字に変換するためのリストを用意します
                    const kanjiNumbers = ["", "一", "二", "三", "四", "五", "六", "七", "八"];
                    const kanjiLegionId = kanjiNumbers[c.legionId] || c.legionId;
                    // 最初は隠しておきます。後で updateCastleGlows() が必要な勢力だけを表示します
                    legionMarkerHtml = `<div class="legion-marker-base legion-color-${c.legionId} hidden">${kanjiLegionId}</div>`;
                }

                // 城の吹き出しと、諸勢力のアイコン、そして軍団マーカーを合体させます！
                el.innerHTML = `
                    <div class="hover-info">
                        <div class="info-line name">${c.name}</div>
                        <div class="info-line">${clanData ? clanData.name : "中立"}</div>
                        <div class="info-line">${castellanName}</div>
                    </div>
                    ${kunishuHtml}
                    ${legionMarkerHtml}
                `;
                el.querySelectorAll('.kunishu-icon-img').forEach(img => {
                    img.addEventListener('error', () => img.classList.add('is-broken'), { once: true });
                });
            }
            
            if (isDaimyoSelect) {
                 if (c.ownerClan === 0) {
                     el.style.cursor = 'default';
                     el.classList.add('dimmed');
                 } else {
                     el.style.cursor = 'pointer';
                     el.onclick = (e) => {
                         e.stopPropagation();
                         if (this.isDraggingMap) return;
                         if (window.AudioManager) {
                             window.AudioManager.playSE('choice.ogg');
                         }
                         this.game.handleDaimyoSelect(c);
                     };
                 }
            }
            // ★修正：AIのターン中であっても、援軍などで「城を選んでいる最中(isSelectionMode)」なら操作できるようにバリアを解除します！
            else if (!this.game.isProcessingAI || isSelectionMode) {
                if (isSelectionMode) { 
                    if (validTargetSet.has(c.id)) {
                        el.classList.add('selectable-target'); 
                        el.onclick = (e) => { 
                            e.stopPropagation(); 
                            if (this.isDraggingMap) return; 
                            if (window.AudioManager) window.AudioManager.playSE('choice.ogg');
                            this.game.commandSystem.resolveMapSelection(c); 
                        };
                    } else { 
                        el.classList.add('dimmed'); 
                    }
                } else { 
                    el.onclick = (e) => {
                        e.stopPropagation();
                        if (this.isDraggingMap) return; 
                        if (this.game.isProcessingAI) return;

                        if (window.AudioManager) window.AudioManager.playSE('choice.ogg');

                        if (this.currentCastle && this.currentCastle.id === c.id) {
                            this.showCastleMenuModal(c);
                        } else {
                            this.showControlPanel(c);
                        }
                    };
                }
            } else {
                el.style.cursor = 'default'; 
            }
            
            el.onmouseenter = () => {
                // ★ここを書き足し：スマホ版の時は、カーソルを乗せた時の魔法（吹き出しなど）を使わないようにします！
                if (!document.body.classList.contains('is-pc')) return;

                const rect = el.getBoundingClientRect();
                const containerRect = document.getElementById('map-scroll-container').getBoundingClientRect();
                
                const cx = rect.left + rect.width / 2;
                const cy = rect.top + rect.height / 2;

                el.classList.remove('tooltip-bottom', 'tooltip-left', 'tooltip-right');

                if (cy - containerRect.top < 150) { 
                    el.classList.add('tooltip-bottom');
                }
                if (cx - containerRect.left < 200) { 
                    el.classList.add('tooltip-left');
                } 
                else if (containerRect.right - cx < 200) { 
                    el.classList.add('tooltip-right');
                }

                // ★追加：カーソルを合わせた城の勢力の領土を光らせます！
                const clanId = parseInt(c.ownerClan, 10);
                if (clanId !== 0) {
                    this.drawClanHighlight('hover-blink-overlay', clanId, {r: 255, g: 255, b: 255}, 120);
                }
            };

            el.onmouseleave = () => {
                // ★ここを書き足し：スマホ版の時は何もしません
                if (!document.body.classList.contains('is-pc')) return;

                el.classList.remove('tooltip-bottom', 'tooltip-left', 'tooltip-right');

                // ★追加：光らせていた領土を消します！
                this.clearClanHighlight('hover-blink-overlay');
            };
            
            this.mapEl.appendChild(el);
        });

        // ==========================================
        // ★名前を絶対に手前に出して、重ならないように避ける魔法！
        // ==========================================
        // ★書き換え：大名選択の時だけじゃなく、外交などを選んでいる時(isSelectionMode)にもシールを出します！
        if (isDaimyoSelect || isSelectionMode) {
            this.renderDaimyoLabels(validTargetSet);
        }
        
        this.updateCastleGlows();
        this.updateSnowOverlay(); // ★大雪の表示を更新します！
        this.updateClanColors(); // ★勢力の色で地図を塗る魔法を実行します！

        // ★追加：駆虎呑狼などで、キープして光らせる魔法を実行します！
        this.updateKeepHighlight();

        // ==========================================
        // ★大名選択モードの見た目とボタンを切り替える魔法です！
        // ==========================================
        const backToScenarioBtn = document.getElementById('btn-back-to-scenario');
        const confirmButtons = document.querySelector('.daimyo-confirm-buttons');

        if (isDaimyoSelect) {
            // まだ大名を選んでいない時
            if (!this.selectedDaimyoId) {
                // 大名情報の箱と、独立した「開始・戻る」ボタンを隠す
                if (this.daimyoConfirmModal) this.daimyoConfirmModal.classList.add('hidden');
                if (confirmButtons) confirmButtons.classList.add('hidden');
                
                // シナリオ選択に戻るボタンを出す
                if (backToScenarioBtn) {
                    backToScenarioBtn.classList.remove('hidden');
                    backToScenarioBtn.onclick = async () => {
                        // 二重に鳴るのを防ぐため、ここでの音の魔法を消します
                        document.body.classList.remove('daimyo-select-mode');
                        backToScenarioBtn.classList.add('hidden');

                        // 裏に残っているマップの画面（app）をしっかり隠します！
                        const appContainer = document.getElementById('app');
                        if (appContainer) {
                            appContainer.classList.add('hidden');
                        }
                        
                        await this.returnToTitle();
                        if (this.game) this.game.startNewGame();
                    };
                }
            } else {
                // 大名を選んでいる時は「シナリオ選択に戻る」を隠す
                // （大名情報や開始・戻るボタンの表示は ui.js が担当してくれます）
                if (backToScenarioBtn) backToScenarioBtn.classList.add('hidden');
            }
        } else {
            if (backToScenarioBtn) backToScenarioBtn.classList.add('hidden');
            if (confirmButtons) confirmButtons.classList.add('hidden');
        }
    },
    

    /**
     * AI観戦中の所有変更を、全城DOMを作り直さず既存カードへ反映します。
     * フルrenderMap()は低メモリ端末で大きなDOM/GPUピークになるため、
     * 城所有・城主・軍団表示と勢力色だけを局所更新し、完全再描画は安全地点へ延期します。
     */
    refreshCastleOwnershipPresentation(castleIds = []) {
        if (!this.mapEl || this.isBackgroundPaused) return false;
        const targetIds = new Set((castleIds || []).map(id => Number(id)).filter(Number.isFinite));
        if (targetIds.size === 0) return false;

        let changed = false;
        const cards = this.mapEl.querySelectorAll('.castle-card');
        cards.forEach(card => {
            const castleId = Number(card.dataset.castleId || 0);
            if (!targetIds.has(castleId)) return;
            const castle = this.game.getCastle(castleId);
            if (!castle) return;

            card.dataset.clan = castle.ownerClan;
            const clan = this.game.getClan(castle.ownerClan);
            const castellan = this.game.getBusho(castle.castellanId);

            // 城カード直下の通常hoverだけ更新し、諸勢力アイコン内のhoverは触らない。
            let hover = null;
            for (const child of card.children) {
                if (child.classList && child.classList.contains('hover-info')) {
                    hover = child;
                    break;
                }
            }
            if (hover) {
                const lines = Array.from(hover.children).filter(el => el.classList && el.classList.contains('info-line'));
                if (lines[0]) lines[0].textContent = castle.name;
                if (lines[1]) lines[1].textContent = clan ? clan.name : '中立';
                if (lines[2]) lines[2].textContent = castellan ? castellan.name : '-';
            }

            // 軍団番号は所有変更・軍団整理で変わり得るため、現在値へ同期する。
            let marker = null;
            for (const child of card.children) {
                if (child.classList && child.classList.contains('legion-marker-base')) {
                    marker = child;
                    break;
                }
            }
            const legionId = Number(castle.legionId || 0);
            if (legionId > 0) {
                const kanjiNumbers = ['', '一', '二', '三', '四', '五', '六', '七', '八'];
                if (!marker) {
                    marker = document.createElement('div');
                    card.appendChild(marker);
                }
                marker.className = `legion-marker-base legion-color-${legionId} hidden`;
                marker.textContent = kanjiNumbers[legionId] || String(legionId);
            } else if (marker) {
                marker.remove();
            }
            changed = true;
        });

        if (!changed) return false;
        this.updateCastleGlows();
        this.updateClanColors();
        if (this.currentCastle && targetIds.has(Number(this.currentCastle.id))) {
            this.updateInfoPanel(this.currentCastle);
        }
        return true;
    },

    // ★新魔法：勢力の名前を賢く並べる魔法です
    renderDaimyoLabels(validTargetSet = null) {
        const labelsData = [];
        const selectionTargetSet = this.game.selectionMode
            ? (validTargetSet || new Set(this.game.validTargets))
            : null;

        // ★追加：諸勢力コマンドや、出陣・援軍、調査などで城を選ぶ時は大名の名前シールを出さないようにします！
        const hiddenModes = [
            'kunishu_goodwill', 'kunishu_subjugate', 'kunishu_headhunt',
            'war',
            'atk_self_reinforcement', 'atk_ally_reinforcement',
            'def_self_reinforcement', 'def_ally_reinforcement',
            'investigate', 'info_investigate', 'investigation', // 調査コマンド用
            'incite', 'rumor', 'headhunt', 'headhunt_select_castle', 'sabotage', 'assassinate' // 計略コマンド用
        ];
        if (hiddenModes.includes(this.game.selectionMode)) return;

        // ★ここから追加：外交や計略以外の「自国の城しか選ばないコマンド（輸送など）」の時は名前シールを出さない魔法！
        if (this.game.selectionMode) {
            // 選べる城の中に、自分の勢力以外の城があるかチェックします
            const hasOtherClanTarget = this.game.validTargets.some(castleId => {
                const c = this.game.getCastle(castleId);
                return c && c.ownerClan !== 0 && c.ownerClan !== this.game.playerClanId;
            });
            // もし自国の城しか選べないなら、名前シールは出しません
            if (!hasOtherClanTarget) {
                return;
            }
        }
        
        // ★追加：ここまで来たら名前シールを出すので、bodyに目印をつけます！
        document.body.classList.add('showing-daimyo-labels');

        // 1. 居城を持っている大名を探して、大体の大きさを計算します
        this.game.clans.forEach(clan => {
            // ★修正：滅亡した勢力や空き家の名前シールは作らないようにします
            if (clan.id === 0 || clan.isDestroyed) return;
            if (this.game.phase !== 'daimyo_select' && clan.id === this.game.playerClanId) return;
            
            const leader = this.game.getBusho(clan.leaderId);
            if (leader && leader.castleId) {
                const castle = this.game.getCastle(leader.castleId);
                if (castle) {
                    // ★ここから追加：選べない相手の時は、名前シールを「出さない」ようにする魔法！
                    // マップ上で何かを選んでいる最中（selectionMode）で、
                    // かつ、その城が「選べるリスト（validTargets）」に入っていないなら、ここでストップします。
                    if (this.game.selectionMode && !selectionTargetSet.has(castle.id)) {
                        return;
                    }
                    // ★追加ここまで！

                    const posX = castle.pixelX !== undefined ? castle.pixelX : 0;
                    const posY = castle.pixelY !== undefined ? castle.pixelY : 0;
                    
                    labelsData.push({
                        clanId: clan.id,
                        name: clan.name,
                        castle: castle, // ★ここを追加！：お城のデータを丸ごと持たせておきます！
                        x: posX,
                        y: posY - 25, 
                        width: clan.name.length * 18 + 20, 
                        height: 28, 
                        offsetY: 0
                    });
                }
            }
        });

        // 2. ぶつかり稽古！重ならないように上下に散らばらせます
        const mapW = this.game.mapWidth || 1200;
        const mapH = this.game.mapHeight || 800;
        const paddingX = 40; // 左右の余白
        const paddingY = 80; // 上下の余白（UIと被らないように少し広めに設定します）

        let iterations = 0;
        let hasCollision = true;
        while (hasCollision && iterations < 20) { 
            hasCollision = false;

            // ★追加：壁とのぶつかり稽古（画面端に寄りすぎている場合は内側に押し返します！）
            for (let i = 0; i < labelsData.length; i++) {
                const l = labelsData[i];
                
                // 左右の壁チェック
                if (l.x - l.width / 2 < paddingX) {
                    l.x = paddingX + l.width / 2;
                    hasCollision = true;
                } else if (l.x + l.width / 2 > mapW - paddingX) {
                    l.x = mapW - paddingX - l.width / 2;
                    hasCollision = true;
                }
                
                // 上下の壁チェック
                const currentTop = l.y + l.offsetY - l.height;
                const currentBottom = l.y + l.offsetY;
                
                if (currentTop < paddingY) {
                    l.offsetY += 8;
                    hasCollision = true;
                } else if (currentBottom > mapH - paddingY) {
                    l.offsetY -= 8;
                    hasCollision = true;
                }
            }

            // ラベル同士のぶつかり稽古
            for (let i = 0; i < labelsData.length; i++) {
                for (let j = i + 1; j < labelsData.length; j++) {
                    const l1 = labelsData[i];
                    const l2 = labelsData[j];
                    
                    const left1 = l1.x - l1.width / 2;
                    const right1 = l1.x + l1.width / 2;
                    const top1 = l1.y + l1.offsetY - l1.height;
                    const bottom1 = l1.y + l1.offsetY;
                    
                    const left2 = l2.x - l2.width / 2;
                    const right2 = l2.x + l2.width / 2;
                    const top2 = l2.y + l2.offsetY - l2.height;
                    const bottom2 = l2.y + l2.offsetY;

                    if (left1 < right2 + 5 && right1 + 5 > left2 &&
                        top1 < bottom2 + 5 && bottom1 + 5 > top2) {
                        hasCollision = true;
                        
                        if (top1 < top2) {
                            l1.offsetY -= 8;
                            l2.offsetY += 8;
                        } else {
                            l1.offsetY += 8;
                            l2.offsetY -= 8;
                        }
                    }
                }
            }
            iterations++;
        }

        // 3. 計算が終わったら、実際にマップの一番手前に貼り付けます！
        labelsData.forEach(l => {
            const el = document.createElement('div');
            el.className = 'daimyo-name-label';
            el.textContent = l.name;
            el.style.position = 'absolute';
            el.style.left = `${l.x}px`;
            el.style.top = `${l.y + l.offsetY}px`;
            el.style.transform = 'translate(-50%, -100%)';
            el.style.zIndex = '200';

            // ★追加：外交先などを選んでいる時で、もし選べない相手なら少し暗くします
            if (this.game.selectionMode && !selectionTargetSet.has(l.castle.id)) {
                el.classList.add('dimmed');
            }
            
            // ★ここから追加！：名前シール自体をクリックできるようにする魔法
            el.onclick = (e) => {
                e.stopPropagation(); 
                if (this.isDraggingMap) return; // スクロール中は反応しないようにします
                
                // ★選べない相手の時は反応しないようにします
                if (this.game.selectionMode && !selectionTargetSet.has(l.castle.id)) return;

                if (window.AudioManager) window.AudioManager.playSE('choice.ogg');
                
                // ★大名選択中と、マップ選択中（外交など）で魔法を使い分けます！
                if (this.game.phase === 'daimyo_select') {
                    this.game.handleDaimyoSelect(l.castle); // お城をクリックしたのと同じ魔法を発動！
                } else if (this.game.selectionMode) {
                    this.game.commandSystem.resolveMapSelection(l.castle); // 外交などの魔法を発動！
                }
            };

            // ★追加：名前シールにカーソルを合わせた時も、領土を光らせます！
            el.onmouseenter = () => {
                if (!document.body.classList.contains('is-pc')) return;
                this.drawClanHighlight('hover-blink-overlay', l.clanId, {r: 255, g: 255, b: 255}, 120);
            };
            el.onmouseleave = () => {
                if (!document.body.classList.contains('is-pc')) return;
                this.clearClanHighlight('hover-blink-overlay');
            };
            // ★追加ここまで！

            this.mapEl.appendChild(el);
        });
    },
    
    updateCastleGlows() {
        if (this.isBackgroundPaused) return;
        if (!this.mapEl) return;
        
        // ★ 修正：大名選択画面では、選んだ大名の城だけを青く光らせます
        if (this.game.phase === 'daimyo_select') {
            const cards = this.mapEl.querySelectorAll('.castle-card');
            cards.forEach(card => {
                card.classList.remove('glow-blue', 'glow-red', 'glow-green');
                const clanId = parseInt(card.dataset.clan, 10);
                if (this.selectedDaimyoId && clanId === this.selectedDaimyoId) {
                    card.classList.add('glow-blue');
                }
                // 大名選択時は軍団マーカーを消します
                const marker = card.querySelector('.legion-marker-base');
                if (marker) marker.classList.add('hidden');
            });
            return;
        }

        let baseClanId = this.game.playerClanId;
        
        if (this.currentCastle && this.currentCastle.ownerClan !== 0) {
            baseClanId = this.currentCastle.ownerClan;
        }

        const cards = this.mapEl.querySelectorAll('.castle-card');
        // 同一勢力の拠点が複数あっても、1回の光彩更新中は同じ外交関係を1度だけ取得する。
        // キャッシュはこの同期処理のローカルだけなので外交状態の変更を跨がない。
        const relationByClan = new Map();
        cards.forEach(card => {
            const clanId = parseInt(card.dataset.clan, 10);
            
            card.classList.remove('glow-blue', 'glow-red', 'glow-green');
            
            // ★追加：基準となる勢力（選択中の城の勢力）と同じなら軍団マーカーを表示します
            const marker = card.querySelector('.legion-marker-base');
            if (marker) {
                if (clanId === baseClanId && clanId !== 0) {
                    marker.classList.remove('hidden');
                } else {
                    marker.classList.add('hidden');
                }
            }
            
            if (clanId === 0) return;
            
            if (clanId === baseClanId) {
                card.classList.add('glow-blue');
            } else {
                let rel = relationByClan.get(clanId);
                if (!relationByClan.has(clanId)) {
                    rel = this.game.getRelation(baseClanId, clanId);
                    relationByClan.set(clanId, rel || null);
                }
                if (rel) {
                    if (rel.status === '敵対') {
                        card.classList.add('glow-red');   
                    } else if (window.DiplomacyRules.isFriendly(rel.status)) {
                        card.classList.add('glow-green'); 
                    }
                }
            }
        });
    },

    // ==========================================
    // ★ここから追加！：特定の地方（または国）を光らせる魔法です！
    // ==========================================
    highlightRegion(regionId) {
        const overlay = this._ensureMapOverlayCanvas('province-overlay', 3);
        if (!overlay || !this.pixelProvinceMap) return;
        const mapW = Number(this.game.mapWidth || 1200);
        const mapH = Number(this.game.mapHeight || 800);
        if (this.pixelProvinceMap.length !== mapW * mapH) return;

        const targetProvIds = new Set(
            this.game.provinces
                .filter(p => Number(p.regionId) === Number(regionId))
                .map(p => Number(p.id))
        );
        if (targetProvIds.size === 0) return;

        this._paintCanvasByStrips(overlay, (data, i, x, y, width, height) => {
            const provinceId = this._sampleIdMap(this.pixelProvinceMap, mapW, mapH, width, height, x, y);
            if (!targetProvIds.has(Number(provinceId))) return;
            data[i] = 255;
            data[i + 1] = 50;
            data[i + 2] = 50;
            data[i + 3] = 128;
        });
        overlay.classList.add('anim-map-glow');
    },

    // 光を消す魔法です
    clearHighlight() {
        const overlay = document.getElementById('province-overlay');
        if (!overlay) return;
        if (!document.body.classList.contains('is-pc')) {
            this._releaseMapOverlayCanvas('province-overlay');
            return;
        }
        try {
            const ctx = overlay.getContext('2d');
            // PCでは再利用するため中身だけ消します。context喪失時は次回描画へ任せます。
            if (ctx) ctx.clearRect(0, 0, overlay.width, overlay.height);
        } catch (e) {}
        overlay.classList.remove('anim-map-glow');
    },

    // ==========================================
    // ★大雪の国のマップ上に、白い水玉模様を描く魔法です！
    // ==========================================
    updateSnowOverlay() {
        // モーダル等で背景更新を止めている間だけ描画を延期します。
        // AI進行中も雪は地図の継続状態なので、消したり更新を止めたりしません。
        if (this.isBackgroundPaused) {
            this._snowOverlayDirty = true;
            return;
        }

        const hasHeavySnow = Array.isArray(this.game.provinces) && this.game.provinces.some(
            p => p.statusEffects && p.statusEffects.includes('heavySnow')
        );
        if (!hasHeavySnow) {
            this._releaseMapOverlayCanvas('snow-overlay');
            this.lastSnowHash = null;
            this._snowOverlayDirty = false;
            return;
        }

        const existingOverlay = document.getElementById('snow-overlay');
        const overlay = this._ensureMapOverlayCanvas('snow-overlay', 4);
        if (!overlay) return;
        const canReusePixels = existingOverlay === overlay && this._lastSnowOverlay === overlay;
        const mapW = Number(this.game.mapWidth || 1200);
        const mapH = Number(this.game.mapHeight || 800);
        if (!this.pixelProvinceMap || this.pixelProvinceMap.length !== mapW * mapH) {
            this._snowOverlayDirty = true;
            return;
        }

        const currentSnowHash = this.game.provinces
            .map(p => p.statusEffects && p.statusEffects.includes('heavySnow') ? '1' : '0')
            .join('');
        if (canReusePixels && this.lastSnowHash === currentSnowHash && !this._snowOverlayDirty) return;

        const targetProvIds = new Set(
            this.game.provinces
                .filter(p => p.statusEffects && p.statusEffects.includes('heavySnow'))
                .map(p => Number(p.id))
        );

        const isPC = document.body.classList.contains('is-pc');
        // スマホは1/4解像度なので、4px周期・1px水玉にしてCSS拡大後の見た目を
        // 従来の半解像度時（約16px周期・約4px水玉）とほぼ揃えます。PCは従来値を維持します。
        const snowPatternStep = isPC ? 8 : 4;
        const snowDotSize = isPC ? 2 : 1;
        const snowPatternHalf = snowPatternStep / 2;
        const painted = this._paintCanvasByStrips(overlay, (data, i, x, y, width, height) => {
            const provinceId = this._sampleIdMap(this.pixelProvinceMap, mapW, mapH, width, height, x, y);
            if (!targetProvIds.has(Number(provinceId))) return;
            const modX = x % snowPatternStep;
            const modY = y % snowPatternStep;
            const firstDot = modX < snowDotSize && modY < snowDotSize;
            const secondDot = modX >= snowPatternHalf && modX < snowPatternHalf + snowDotSize
                && modY >= snowPatternHalf && modY < snowPatternHalf + snowDotSize;
            if (!(firstDot || secondDot)) return;
            data[i] = 255;
            data[i + 1] = 255;
            data[i + 2] = 255;
            data[i + 3] = 210;
        });

        // 描画失敗時に「成功済みhash」を記録すると、以後ずっと再描画されなくなるため、
        // 失敗時はキャッシュを無効のまま維持します。
        if (!painted) {
            this.lastSnowHash = null;
            this._snowOverlayDirty = true;
            this._lastSnowOverlay = null;
            return;
        }

        this.lastSnowHash = currentSnowHash;
        this._lastSnowOverlay = overlay;
        this._snowOverlayDirty = false;
    },

    // ==========================================
    // ★新魔法：国を勢力の色で塗りつぶす魔法です！
    // ==========================================
    updateClanColors() {
        const overlay = document.getElementById('clan-color-overlay');
        if (!overlay) return;

        const mapW = Number(this.game.mapWidth || 1200);
        const mapH = Number(this.game.mapHeight || 800);
        const sourcePixelMap = this.pixelCastleMap || DataManager.castlePixelMap;
        if (!sourcePixelMap || sourcePixelMap.length !== mapW * mapH) return;
        this.pixelCastleMap = sourcePixelMap;
        if (this.game && this.game.isSuspendingColorUpdate) return;

        const width = overlay.width;
        const height = overlay.height;
        if (width <= 0 || height <= 0) return;

        // 所有者一覧を毎回map→joinして巨大文字列化せず、CastleManagerが更新する所有versionを使う。
        // ownerClan直接代入は禁止・回帰監査済みなので、同じversionなら所有状態は同一。
        const currentOwnerHash = `${width}x${height}:${Number(this.game.castleOwnershipVersion || 0)}:${this.game.castles.length}`;
        if (this.lastClanColorsHash === currentOwnerHash && this._lastClanColorOverlay === overlay) return;

        const clanColors = new Map();
        for (const clan of this.game.clans) {
            if (clan.id !== 0 && clan.color) clanColors.set(Number(clan.id), DataManager.hexToRgb(clan.color));
        }

        let maxCastleId = 0, maxClanId = 0;
        for (const c of this.game.castles) {
            maxCastleId = Math.max(maxCastleId, Number(c.id) || 0);
            maxClanId = Math.max(maxClanId, Number(c.ownerClan) || 0);
        }
        const ClanArray = maxClanId <= 255 ? Uint8Array : (maxClanId <= 65535 ? Uint16Array : Uint32Array);
        const castleToClanMap = new ClanArray(maxCastleId + 1);
        for (const c of this.game.castles) castleToClanMap[Number(c.id)] = Number(c.ownerClan) || 0;

        const sampleCastleId = (x, y) => this._sampleIdMap(sourcePixelMap, mapW, mapH, width, height, x, y);
        const painted = this._paintCanvasByStrips(overlay, (data, i, x, y) => {
            const castleId = sampleCastleId(x, y);
            if (!castleId) return;
            const clanId = castleToClanMap[castleId] || 0;
            const rgb = clanId !== 0 ? clanColors.get(clanId) : null;
            if (rgb) {
                data[i] = rgb.r; data[i + 1] = rgb.g; data[i + 2] = rgb.b;
            } else {
                data[i] = 255; data[i + 1] = 255; data[i + 2] = 255;
            }
            data[i + 3] = 100;

            if (x <= 0 || y <= 0 || x >= width - 1 || y >= height - 1 || !clanId) return;
            const neighborClanIds = [
                castleToClanMap[sampleCastleId(x - 1, y)] || 0,
                castleToClanMap[sampleCastleId(x + 1, y)] || 0,
                castleToClanMap[sampleCastleId(x, y - 1)] || 0,
                castleToClanMap[sampleCastleId(x, y + 1)] || 0
            ];
            if (!neighborClanIds.some(id => id && id !== clanId)) return;
            data[i] = Math.max(0, data[i] - 50);
            data[i + 1] = Math.max(0, data[i + 1] - 50);
            data[i + 2] = Math.max(0, data[i + 2] - 50);
            data[i + 3] = 160;
        });
        if (!painted) return;

        this.lastClanColorsHash = currentOwnerHash;
        this.lastClanColorsImageData = null;
        this._lastClanColorOverlay = overlay;
    },

    // ==========================================
    // ★新魔法：特定の勢力の領土（色がついているところ）だけを光らせる魔法です！
    // ==========================================
    drawClanHighlight(canvasId, clanId, colorRGB = {r: 255, g: 255, b: 255}, alpha = 100) {
        if (!this.pixelCastleMap || clanId === 0) return;
        const overlay = this._ensureMapOverlayCanvas(canvasId, 3);
        if (!overlay) return;
        const mapW = Number(this.game.mapWidth || 1200);
        const mapH = Number(this.game.mapHeight || 800);

        const targetCastleIds = this.game.getClanCastles(clanId).map(c => Number(c.id));
        const targetIdsSet = new Set(targetCastleIds);
        if (targetIdsSet.size === 0) {
            overlay.style.filter = 'none';
            overlay.classList.remove('anim-map-glow', 'anim-map-glow-fast');
            try {
                const ctx = overlay.getContext('2d');
                if (ctx) ctx.clearRect(0, 0, overlay.width, overlay.height);
            } catch (e) {}
            return;
        }

        overlay.style.filter = `drop-shadow(0px 0px 15px rgba(${colorRGB.r}, ${colorRGB.g}, ${colorRGB.b}, 1)) blur(3px)`;
        overlay.classList.remove('anim-map-glow', 'anim-map-glow-fast');
        overlay.classList.add(canvasId === 'keep-blink-overlay' ? 'anim-map-glow-fast' : 'anim-map-glow');

        this._paintCanvasByStrips(overlay, (data, i, x, y, width, height) => {
            const castleId = this._sampleIdMap(this.pixelCastleMap, mapW, mapH, width, height, x, y);
            if (!targetIdsSet.has(Number(castleId))) return;
            data[i] = colorRGB.r;
            data[i + 1] = colorRGB.g;
            data[i + 2] = colorRGB.b;
            data[i + 3] = alpha;
        });
    },

    // 光をサッと消す魔法
    clearClanHighlight(canvasId) {
        const overlay = document.getElementById(canvasId);
        if (!overlay) return;
        
        // ★追加：光のフィルター効果も忘れずにリセット（消去）します！
        overlay.style.filter = 'none';
        overlay.classList.remove('anim-map-glow', 'anim-map-glow-fast');
        
        try {
            const ctx = overlay.getContext('2d');
            if (ctx) ctx.clearRect(0, 0, overlay.width, overlay.height);
        } catch (e) {}
    },

    // 駆虎呑狼の計などで、1つ目の勢力をキープして光らせる魔法
    updateKeepHighlight() {
        if (this.isBackgroundPaused) return;
        // もし駆虎呑狼の「2つ目の勢力選択中」で、1つ目の勢力が記録されていれば…
        if (this.game.selectionMode === 'kuko_target_b' && this.game.tempKukoData && this.game.tempKukoData.clanAId) {
            // ★色を「黄色」にして光らせます！
            // （ぼやける光の魔法は drawClanHighlight の中で自動的にかかるようになりました！）
            this.drawClanHighlight('keep-blink-overlay', this.game.tempKukoData.clanAId, {r: 255, g: 255, b: 0}, 160);
        } else {
            // ★Round14：使っていない間は1200x800の透明Canvas自体を持たないようにします。
            this._releaseMapOverlayCanvas('keep-blink-overlay');
        }
    },

    // ==========================================
    // ★追加：マップを操作できなくする透明なバリアを張る/消す魔法！
    // ==========================================
    showMapGuard() {
        this.mapGuardCount = (this.mapGuardCount || 0) + 1;
        let guard = document.getElementById('battle-blink-guard');
        if (!guard) {
            guard = document.createElement('div');
            guard.id = 'battle-blink-guard';
            guard.style.position = 'fixed';
            guard.style.top = '0';
            guard.style.left = '0';
            guard.style.width = '100vw';
            guard.style.height = '100vh';
            guard.style.zIndex = '5900';
            guard.style.pointerEvents = 'all';
            document.body.appendChild(guard);
        }
        guard.style.display = 'block';
    },
    
    hideMapGuard(force = false) {
        if (force) {
            this.mapGuardCount = 0;
        } else {
            this.mapGuardCount = Math.max(0, (this.mapGuardCount || 0) - 1);
        }
        
        if (this.mapGuardCount === 0) {
            let guard = document.getElementById('battle-blink-guard');
            if (guard) {
                guard.style.display = 'none';
            }
        }
    },

    // 戦闘点滅・制圧発光は固定マップDOM上の非同期Viewです。
    // ロード／タイトル復帰／新規開始では保留rAFを同期的に完了扱いへせず「中断」として解放し、
    // 旧演出のonHalfwayや後続処理が新シナリオへ戻るための入口を残しません。
    abortMapEffectsForScenarioTransition() {
        this._mapEffectGeneration = Number(this._mapEffectGeneration || 0) + 1;
        if (this._activeMapEffectCancels && this._activeMapEffectCancels.size > 0) {
            [...this._activeMapEffectCancels].forEach(cancel => {
                try { cancel(); } catch (e) {}
            });
            this._activeMapEffectCancels.clear();
        }
        ['battle-blink-overlay', 'capture-effect-overlay'].forEach(id => {
            const canvas = document.getElementById(id);
            if (!canvas) return;
            try {
                const ctx = canvas.getContext('2d');
                if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
                canvas.style.filter = 'none';
                canvas.width = 1;
                canvas.height = 1;
            } catch (e) {}
            if (canvas.parentNode) canvas.parentNode.removeChild(canvas);
        });
        this.hideMapGuard(true);
    },
    
    // ==========================================
    // ★追加：AIの「思考中...」の文字を一時的に透明にする魔法を一元管理（スタック式）します！
    // ※元の「ガード自体を消す魔法(hideAIGuardTemporarily)」と名前が被らないように変更！
    // ==========================================
    hideAIGuardText() {
        this.guardTextHiddenCount = (this.guardTextHiddenCount || 0) + 1;
        this.applyAIGuardTextState();
    },

    restoreAIGuardText(force = false) {
        if (force) {
            this.guardTextHiddenCount = 0;
        } else {
            this.guardTextHiddenCount = Math.max(0, (this.guardTextHiddenCount || 0) - 1);
        }
        this.applyAIGuardTextState();
    },

    applyAIGuardTextState() {
        const guard = this.aiGuard || document.getElementById('ai-guard');
        if (!guard) return;
        
        if ((this.guardTextHiddenCount || 0) > 0) {
            guard.classList.add('hide-text');
        } else {
            guard.classList.remove('hide-text');
        }
    },

    // 地図上の所有変更・戦闘点滅など、プレイヤーに見せる演出中は
    // 「思考中...」「月末処理中...」といった裏側の進捗文字を重ねない。
    // スタック式の既存APIを共通利用し、呼び出し元ごとの隠し忘れを防ぐ。
    async withAIGuardTextHiddenForMapEffect(task) {
        this.hideAIGuardText();
        try {
            return await task();
        } finally {
            this.restoreAIGuardText();
        }
    },

    // ==========================================
    // ★追加：指定したお城の領地だけをチカチカ点滅させる魔法です！
    // ==========================================
    /**
     * Round7: 城領域エフェクト用の軽量マスクを作ります。
     * 以前はマップ全体(例:1200x800)の ImageData / Canvas を複数枚同時生成していました。
     * 対象城が占める範囲だけを切り抜くことで、古いスマホの瞬間メモリ/GPU負荷を抑えます。
     */
    _buildCastleEffectMask(castleIdOrIds, expandSteps = 0, glowPadding = 24) {
        const mapWidth = Number(this.game.mapWidth || 1200);
        const mapHeight = Number(this.game.mapHeight || 800);
        const pixelMap = this.pixelCastleMap;

        if (!pixelMap || pixelMap.length < mapWidth * mapHeight) return null;

        const targetIdsArray = Array.isArray(castleIdOrIds) ? castleIdOrIds : [castleIdOrIds];
        const targetIds = new Set(targetIdsArray.map(id => Number(id)).filter(id => Number.isFinite(id)));
        if (targetIds.size === 0) return null;

        let minX = mapWidth, minY = mapHeight, maxX = -1, maxY = -1;

        // 起動時の領域構築で外接矩形も一緒に作ってあります。
        // 以前は戦闘点滅のたびに地図全766万pixelを同期走査していたため、
        // 古いスマホではここが強制リロードの大きな候補になっていました。
        const boundsByCastleId = DataManager.castlePixelBounds || null;
        if (boundsByCastleId) {
            targetIds.forEach(id => {
                const b = boundsByCastleId[Number(id)];
                if (!b) return;
                if (b.minX < minX) minX = b.minX;
                if (b.maxX > maxX) maxX = b.maxX;
                if (b.minY < minY) minY = b.minY;
                if (b.maxY > maxY) maxY = b.maxY;
            });
        }

        // 現行データは必ず起動時にboundsを作る。古いセーブ互換の全地図走査fallbackは持たない。
        if (maxX < minX || maxY < minY) return null;

        // blur / drop-shadow が切れないように余白を持たせます。
        const margin = Math.max(0, Number(expandSteps) || 0) + Math.max(0, Number(glowPadding) || 0);
        const left = Math.max(0, minX - margin);
        const top = Math.max(0, minY - margin);
        const right = Math.min(mapWidth - 1, maxX + margin);
        const bottom = Math.min(mapHeight - 1, maxY + margin);
        const width = right - left + 1;
        const height = bottom - top + 1;

        const targetPixels = new Uint8Array(width * height);

        for (let y = minY; y <= maxY; y++) {
            const srcRow = y * mapWidth;
            const dstRow = (y - top) * width;
            for (let x = minX; x <= maxX; x++) {
                if (targetIds.has(pixelMap[srcRow + x])) {
                    targetPixels[dstRow + (x - left)] = 1;
                }
            }
        }

        // 点滅用の少し太い縁取り。切り抜き領域内だけで行うので非常に小さく済みます。
        const steps = Math.max(0, Number(expandSteps) || 0);
        for (let step = 0; step < steps; step++) {
            const before = new Uint8Array(targetPixels);
            for (let y = 1; y < height - 1; y++) {
                const row = y * width;
                for (let x = 1; x < width - 1; x++) {
                    const i = row + x;
                    if (before[i] !== 0) continue;
                    if (before[i - width] === 1 || before[i + width] === 1 ||
                        before[i - 1] === 1 || before[i + 1] === 1) {
                        targetPixels[i] = 1;
                    }
                }
            }
        }

        const maskCanvas = document.createElement('canvas');
        maskCanvas.width = width;
        maskCanvas.height = height;
        try {
            const maskCtx = maskCanvas.getContext('2d');
            if (!maskCtx) {
                // 低メモリ等で2D contextを確保できない時は演出を省略し、巨大Canvasを残さない。
                try { maskCanvas.width = 1; maskCanvas.height = 1; } catch (ignore) {}
                return null;
            }
            const maskData = maskCtx.createImageData(width, height);

            for (let i = 0; i < targetPixels.length; i++) {
                if (targetPixels[i] !== 1) continue;
                const idx = i * 4;
                maskData.data[idx] = 255;
                maskData.data[idx + 1] = 255;
                maskData.data[idx + 2] = 255;
                maskData.data[idx + 3] = 255;
            }
            maskCtx.putImageData(maskData, 0, 0);
        } catch (error) {
            // ImageData確保・転送まで含め、演出用Canvas失敗は本処理を止めない。
            console.warn('戦闘領域マスクCanvasの生成を省略しました:', error);
            try { maskCanvas.width = 1; maskCanvas.height = 1; } catch (ignore) {}
            return null;
        }

        return {
            left, top, width, height, canvas: maskCanvas,
            release() {
                // Canvasのサイズを1x1に戻すと、多くのWebViewでGPUバッファも早く解放されます。
                maskCanvas.width = 1;
                maskCanvas.height = 1;
            }
        };
    },

    _createCroppedEffectOverlay(id, maskInfo, zIndex) {
        const oldOverlay = document.getElementById(id);
        if (oldOverlay) {
            try {
                oldOverlay.width = 1;
                oldOverlay.height = 1;
            } catch (e) {}
            if (oldOverlay.parentNode) oldOverlay.parentNode.removeChild(oldOverlay);
        }

        const overlay = document.createElement('canvas');
        overlay.id = id;
        overlay.width = maskInfo.width;
        overlay.height = maskInfo.height;
        overlay.style.position = 'absolute';
        overlay.style.left = `${maskInfo.left}px`;
        overlay.style.top = `${maskInfo.top}px`;
        overlay.style.pointerEvents = 'none';
        overlay.style.zIndex = String(zIndex);
        try {
            this.mapEl.appendChild(overlay);
            return overlay;
        } catch (error) {
            // DOM追加の途中で失敗しても一時Canvasを残さない。
            try {
                if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
                overlay.width = 1;
                overlay.height = 1;
            } catch (ignore) {}
            throw error;
        }
    },

    _releaseEffectOverlay(overlay, maskInfo) {
        if (overlay) {
            try {
                const ctx = overlay.getContext('2d');
                if (ctx) ctx.clearRect(0, 0, overlay.width, overlay.height);
                overlay.style.filter = 'none';
                if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
                overlay.width = 1;
                overlay.height = 1;
            } catch (e) {}
        }
        if (maskInfo && typeof maskInfo.release === 'function') {
            maskInfo.release();
        }
    },

    async playBattleBlink(castleIdOrIds, colorA, colorB, durationMs, options = {}) {
        return this.withAIGuardTextHiddenForMapEffect(async () => {
        const effectGeneration = Number(this._mapEffectGeneration || 0);
        const isCurrentEffect = () => Number(this._mapEffectGeneration || 0) === effectGeneration;
        // 戦争中は開戦時に確定した戦場カメラを維持します。
        // 開始/終了点滅のたびに同じ地点を再計算すると、スマホではモーダル開閉による
        // viewport差で数pxずれるため、戦場ロック中は再フォーカスしません。
        const warState = this.game && this.game.warManager ? this.game.warManager.state : null;
        const firstId = Array.isArray(castleIdOrIds) ? Number(castleIdOrIds[0]) : Number(castleIdOrIds);
        const usesLockedBattleCamera = !!(warState && warState.battleCameraLocked && Number(warState.battleFocusCastleId) === firstId);
        if (options.focus !== false && !usesLockedBattleCamera) {
            await this.focusMapOnCastle(castleIdOrIds, { transition: options.transition || 'smooth', reason: options.reason || 'battle_blink', anchor: 'territory' });
        }
        if (!isCurrentEffect()) return false;
        return new Promise(resolve => {
            this.showMapGuard();

            // Round7: 対象城の周囲だけの小さなCanvasを使います。
            const maskInfo = this._buildCastleEffectMask(castleIdOrIds, 2, 24);
            if (!maskInfo) {
                this.hideMapGuard();
                resolve();
                return;
            }
            if (this.game && typeof this.game.writeSystemDiagnostic === 'function') {
                const firstId = Array.isArray(castleIdOrIds) ? castleIdOrIds[0] : castleIdOrIds;
                this.game.writeSystemDiagnostic('battle_blink:mask_ready', this.game.getCastle(Number(firstId)) || null);
            }

            let overlay = null;
            let ctx = null;
            try {
                overlay = this._createCroppedEffectOverlay('battle-blink-overlay', maskInfo, 6);
                ctx = overlay.getContext('2d');
            } catch (error) {
                console.warn('戦闘点滅Canvasの準備を省略しました:', error);
                this._releaseEffectOverlay(overlay, maskInfo);
                this.hideMapGuard();
                resolve();
                return;
            }
            if (!ctx) {
                this._releaseEffectOverlay(overlay, maskInfo);
                this.hideMapGuard();
                resolve();
                return;
            }
            const width = overlay.width;
            const height = overlay.height;

            const colorA_RGB = colorA || { r: 255, g: 255, b: 255 };
            const colorB_RGB = colorB || { r: 255, g: 255, b: 255 };

            // 2色分の巨大ImageData/Canvasを持たず、同じ1枚のマスクを色だけ変えて使います。
            const paintColor = (color) => {
                ctx.clearRect(0, 0, width, height);
                ctx.save();
                ctx.fillStyle = `rgba(${color.r}, ${color.g}, ${color.b}, 0.78)`;
                ctx.fillRect(0, 0, width, height);
                ctx.globalCompositeOperation = 'destination-in';
                ctx.drawImage(maskInfo.canvas, 0, 0);
                ctx.restore();
                overlay.style.filter = `drop-shadow(0px 0px 15px rgba(${color.r}, ${color.g}, ${color.b}, 1)) blur(3px)`;
            };

            const startTime = performance.now();
            let isA = true;
            const blinkInterval = 250;
            let lastSwitchTime = startTime;

            let finished = false;
            const cancelEffect = () => finish(false);
            const finish = (completed = true) => {
                if (finished) return;
                finished = true;
                if (this._activeMapEffectCancels) this._activeMapEffectCancels.delete(cancelEffect);
                this._releaseEffectOverlay(overlay, maskInfo);
                this.hideMapGuard();
                if (completed && this.game && typeof this.game.writeSystemDiagnostic === 'function') {
                    const firstId = Array.isArray(castleIdOrIds) ? castleIdOrIds[0] : castleIdOrIds;
                    this.game.writeSystemDiagnostic('battle_blink:done', this.game.getCastle(Number(firstId)) || null);
                }
                resolve(completed);
            };
            if (!this._activeMapEffectCancels) this._activeMapEffectCancels = new Set();
            this._activeMapEffectCancels.add(cancelEffect);

            try {
                paintColor(colorA_RGB);
            } catch (error) {
                console.warn('戦闘点滅Canvasの描画を省略しました:', error);
                finish();
                return;
            }

            const animate = (currentTime) => {
                if (finished) return;
                if (!isCurrentEffect()) {
                    finish(false);
                    return;
                }
                try {
                    if (currentTime - startTime > durationMs) {
                        finish();
                        return;
                    }

                    if (currentTime - lastSwitchTime > blinkInterval) {
                        isA = !isA;
                        lastSwitchTime = currentTime;
                        paintColor(isA ? colorA_RGB : colorB_RGB);
                    }

                    requestAnimationFrame(animate);
                } catch (error) {
                    // context喪失等で演出だけ失敗しても戦争進行を止めない。
                    console.warn('戦闘点滅Canvasの描画を途中で終了しました:', error);
                    finish();
                }
            };

            requestAnimationFrame(animate);
        });
        });
    },

    // ==========================================
    // ★城が落ちた時の、フワッと白く光る魔法！
    // ==========================================
    async playCaptureEffect(castleIdOrIds, onHalfway, options = {}) {
        return this.withAIGuardTextHiddenForMapEffect(async () => {
        const effectGeneration = Number(this._mapEffectGeneration || 0);
        const isCurrentEffect = () => Number(this._mapEffectGeneration || 0) === effectGeneration;
        // 戦争中は開始時から同じ戦場カメラを維持し、制圧演出でも再フォーカスしません。
        const warState = this.game && this.game.warManager ? this.game.warManager.state : null;
        const firstId = Array.isArray(castleIdOrIds) ? Number(castleIdOrIds[0]) : Number(castleIdOrIds);
        const usesLockedBattleCamera = !!(warState && warState.battleCameraLocked && Number(warState.battleFocusCastleId) === firstId);
        if (options.focus !== false && !usesLockedBattleCamera) {
            await this.focusMapOnCastle(castleIdOrIds, { transition: options.transition || 'smooth', reason: options.reason || 'capture_effect', anchor: 'territory' });
        }
        if (!isCurrentEffect()) return false;
        return new Promise((resolve, reject) => {
            this.showMapGuard();

            // Round7: こちらも対象城周辺だけに限定します。
            const maskInfo = this._buildCastleEffectMask(castleIdOrIds, 0, 24);
            if (!maskInfo) {
                this.hideMapGuard();
                try {
                    if (typeof onHalfway === 'function') onHalfway();
                    resolve();
                } catch (error) {
                    reject(error);
                }
                return;
            }

            let overlay = null;
            let ctx = null;
            try {
                overlay = this._createCroppedEffectOverlay('capture-effect-overlay', maskInfo, 7);
                ctx = overlay.getContext('2d');
            } catch (error) {
                // 制圧演出の準備だけ失敗した場合も、所有変更等の中間処理は必ず一度進める。
                console.warn('制圧Canvasの準備を省略しました:', error);
                this._releaseEffectOverlay(overlay, maskInfo);
                this.hideMapGuard();
                try {
                    if (typeof onHalfway === 'function') onHalfway();
                    resolve();
                } catch (halfwayError) {
                    reject(halfwayError);
                }
                return;
            }
            const width = overlay.width;
            const height = overlay.height;

            let halfwayDone = false;
            let finished = false;
            const runHalfway = () => {
                if (halfwayDone || !isCurrentEffect()) return;
                halfwayDone = true;
                if (typeof onHalfway === 'function') onHalfway();
            };
            const cancelEffect = () => finish(false);
            const finish = (completed = true) => {
                if (finished) return;
                finished = true;
                if (this._activeMapEffectCancels) this._activeMapEffectCancels.delete(cancelEffect);
                this._releaseEffectOverlay(overlay, maskInfo);
                this.hideMapGuard();
                resolve(completed);
            };
            const fail = (error) => {
                if (finished) return;
                finished = true;
                if (this._activeMapEffectCancels) this._activeMapEffectCancels.delete(cancelEffect);
                this._releaseEffectOverlay(overlay, maskInfo);
                this.hideMapGuard();
                reject(error);
            };
            if (!this._activeMapEffectCancels) this._activeMapEffectCancels = new Set();
            this._activeMapEffectCancels.add(cancelEffect);

            if (!ctx) {
                // 所有変更などの本処理は演出より重要。演出だけ省略して中間処理を実行する。
                try {
                    runHalfway();
                    finish();
                } catch (error) {
                    fail(error);
                }
                return;
            }

            overlay.style.filter = 'drop-shadow(0px 0px 15px rgba(255, 255, 255, 1)) blur(3px)';

            const drawWhiteMask = (alpha) => {
                ctx.clearRect(0, 0, width, height);
                ctx.save();
                ctx.globalAlpha = Math.max(0, Math.min(1, alpha));
                ctx.fillStyle = '#ffffff';
                ctx.fillRect(0, 0, width, height);
                ctx.globalCompositeOperation = 'destination-in';
                ctx.drawImage(maskInfo.canvas, 0, 0);
                ctx.restore();
            };

            const startTime = performance.now();
            const durationRise = 800;
            const durationFlash = 600;
            const totalDuration = durationRise + durationFlash;

            const animate = (currentTime) => {
                if (finished) return;
                if (!isCurrentEffect()) {
                    finish(false);
                    return;
                }
                try {
                    const elapsed = currentTime - startTime;

                    if (elapsed < durationRise) {
                        const progress = elapsed / durationRise;
                        drawWhiteMask(progress * 0.9);
                    } else if (elapsed < totalDuration) {
                        runHalfway();
                        const progress = (elapsed - durationRise) / durationFlash;
                        drawWhiteMask(1.0 - progress);
                    }

                    if (elapsed < totalDuration) {
                        requestAnimationFrame(animate);
                    } else {
                        runHalfway();
                        finish();
                    }
                } catch (error) {
                    // Canvasだけ失敗した場合は所有変更等の中間処理を落とさず演出を終了する。
                    try {
                        runHalfway();
                        console.warn('制圧Canvasの描画を途中で終了しました:', error);
                        finish();
                    } catch (halfwayError) {
                        // 本処理自体の例外は隠さず、資源を解放して呼び出し元へ返す。
                        fail(halfwayError);
                    }
                }
            };

            requestAnimationFrame(animate);
        });
        });
    }
});