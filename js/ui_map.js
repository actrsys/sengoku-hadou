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
    "1562_kiyosudoumei": { // 1562年 清洲同盟シナリオ
        PC: 7,      // 例：PC版で最初に中心にする城のID
        MOBILE: 36  // 例：スマホ版で最初に中心にする城のID
    },
    "DEFAULT": {       // 上記以外のシナリオの場合のお守り
        PC: 7,
        MOBILE: 7
    }
};

// ★ マップのズーム設定を1箇所で管理する箱
const MAP_ZOOM_CONFIG = {
    PC: {
        minMargin: 1.0, // PCの最小サイズの時の余白（1.0で縦の高さにピッタリ合わせます！）
        mid: 1.1,        // PCの中間サイズ
        max: 2.5         // PCの最大サイズ
    },
    MOBILE: {
        minMargin: 1, // スマホの最小サイズの時の余白
        mid: 0.7,        // スマホの中間サイズ
        max: 1         // スマホの最大サイズ
    }
};

// ★ 看板屋さん（UIManager）に、後からマップの魔法を合体させる特別な魔法です！
Object.assign(UIManager.prototype, {

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

            if (this.inertiaFrame) {
                cancelAnimationFrame(this.inertiaFrame);
                this.inertiaFrame = null;
            }

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

        sc.addEventListener('mousemove', (e) => {
            if (!this.isMouseDown) return;
            e.preventDefault(); 
            const x = e.pageX - sc.offsetLeft;
            const y = e.pageY - sc.offsetTop;
            const walkX = (x - this.dragStartX);
            const walkY = (y - this.dragStartY);
            
            if (Math.abs(walkX) > 5 || Math.abs(walkY) > 5) {
                this.isDraggingMap = true;
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

        sc.addEventListener('touchstart', (e) => {
            if (e.touches.length === 2) {
                initialPinchDist = Math.hypot(
                    e.touches[0].pageX - e.touches[1].pageX,
                    e.touches[0].pageY - e.touches[1].pageY
                );
            }
        }, { passive: false });

        sc.addEventListener('touchmove', (e) => {
            if (e.touches.length === 2) {
                e.preventDefault(); 
                if (initialPinchDist === null) return;
                
                if (this.isZooming) return;

                const currentDist = Math.hypot(
                    e.touches[0].pageX - e.touches[1].pageX,
                    e.touches[0].pageY - e.touches[1].pageY
                );
                
                const diff = currentDist - initialPinchDist;
                
                const rect = sc.getBoundingClientRect();
                const centerX = rect.left + rect.width / 2;
                const centerY = rect.top + rect.height / 2;

                if (diff > 50) {
                    this.isZooming = true; setTimeout(() => { this.isZooming = false; }, 350); 
                    this.changeMapZoom(1, centerX, centerY);
                    initialPinchDist = currentDist; 
                } else if (diff < -50) {
                    this.isZooming = true; setTimeout(() => { this.isZooming = false; }, 350); 
                    this.changeMapZoom(-1, centerX, centerY);
                    initialPinchDist = currentDist;
                }
            }
        }, { passive: false });

        sc.addEventListener('touchend', (e) => {
            if (e.touches.length < 2) {
                initialPinchDist = null;
            }
        });
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

        let minScale = isPC ? Math.min(scaleX, scaleY) * config.minMargin : Math.max(scaleX, scaleY) * config.minMargin;

        this.zoomStages = [
            minScale,       
            config.mid,    
            config.max     
        ];
        
        if (this.zoomLevel === undefined) {
            if (this.game.phase === 'daimyo_select') {
                // 0 番目：一番小さいサイズ（min） 1 番目：中くらいのサイズ（mid） 2 番目：一番大きいサイズ（max）
                this.zoomLevel = 1; 
            } else {
                this.zoomLevel = 1; 
            }
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
                this.mapEl.style.transform = `scale(${this.mapScale})`;

                let spacer = document.getElementById('map-spacer');
                if (!spacer) {
                    spacer = document.createElement('div');
                    spacer.id = 'map-spacer';
                    spacer.style.position = 'absolute';
                    spacer.style.pointerEvents = 'none';
                    sc.appendChild(spacer);
                    sc.style.position = 'relative'; 
                }
                spacer.style.left = '0px';
                spacer.style.top = '0px';
                spacer.style.width = `${Math.floor(scaledW + marginLeft * 2)}px`;
                spacer.style.height = `${Math.floor(scaledH + marginTop * 2)}px`;
            }
        }
    },
    
    changeMapZoom(direction, cx = null, cy = null) {
        const sc = document.getElementById('map-scroll-container');
        const isPC = document.body.classList.contains('is-pc'); 

        if (this.isAnimatingZoom) return;

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
                let progress = (currentTime - startTime) / duration;
                if (progress < 0) progress = 0; 
                if (progress > 1) progress = 1;
                
                const easeOut = 1 - Math.pow(1 - progress, 3);
                const currentScale = oldScale + (targetScale - oldScale) * easeOut;
                
                const currentMarginX = oldMarginX + (targetMarginX - oldMarginX) * easeOut;
                const currentMarginY = oldMarginY + (targetMarginY - oldMarginY) * easeOut;
                
                const currentScrollLeft = startScrollLeft + (targetScrollLeft - startScrollLeft) * easeOut;
                const currentScrollTop = startScrollTop + (targetScrollTop - startScrollTop) * easeOut;

                let spacer = document.getElementById('map-spacer');
                if (!spacer) {
                    spacer = document.createElement('div');
                    spacer.id = 'map-spacer';
                    spacer.style.position = 'absolute';
                    spacer.style.pointerEvents = 'none';
                    sc.appendChild(spacer);
                    sc.style.position = 'relative';
                }
                spacer.style.width = `${Math.floor(mapW * currentScale + currentMarginX * 2)}px`;
                spacer.style.height = `${Math.floor(mapH * currentScale + currentMarginY * 2)}px`;

                this.mapEl.style.position = 'absolute';
                this.mapEl.style.left = `${currentMarginX}px`;
                this.mapEl.style.top = `${currentMarginY}px`;
                this.mapEl.style.transformOrigin = '0 0';
                this.mapEl.style.transform = `scale(${currentScale})`;

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
                }
            };
            requestAnimationFrame(animate); 
        } else {
            // ★ここをごっそり差し替え！：スクロールのガタつきを防ぐための魔法
            sc.style.overflow = 'hidden'; 
            
            // ズームアウト（小さく）する時は、先にスクロール位置を移動させておきます
            if (targetScale < oldScale) {
                sc.scrollLeft = targetScrollLeft;
                sc.scrollTop = targetScrollTop;
            }
            
            this.mapScale = targetScale;
            this.applyMapScale();
            
            // ズームイン（大きく）する時は、サイズを変えた後に移動させます
            sc.scrollLeft = targetScrollLeft;
            sc.scrollTop = targetScrollTop;
            
            sc.style.overflow = 'auto';
            this.updateZoomButtons();
        }
    },
    
    scrollToActiveCastle(castle = null, immediate = false) {
        const targetCastle = castle || this.currentCastle || this.game.getCurrentTurnCastle();
        const sc = document.getElementById('map-scroll-container');
        if (!sc || !targetCastle) return;

        // ★ここから追加：移動が始まる前に、透明なバリアを張って操作できなくします
        sc.style.pointerEvents = 'none';
        
        const posX = targetCastle.pixelX !== undefined ? targetCastle.pixelX : (targetCastle.x * 80 + 40);
        const posY = targetCastle.pixelY !== undefined ? targetCastle.pixelY : (targetCastle.y * 80 + 40);
        
        const currentLeft = parseFloat(this.mapEl.style.left || 0);
        const currentTop = parseFloat(this.mapEl.style.top || 0);
        
        const scaledX = posX * this.mapScale + currentLeft;
        const scaledY = posY * this.mapScale + currentTop;
        
        const targetLeft = scaledX - sc.clientWidth / 2;
        const targetTop = scaledY - sc.clientHeight / 2;

        sc.scrollTo({
            left: targetLeft,
            top: targetTop,
            behavior: immediate ? 'auto' : 'smooth'
        });

        // ★ここを書き換え：スクロールが終わったか監視して、終わってから0.2秒待ちます！
        const finishScroll = () => {
            setTimeout(() => {
                sc.style.pointerEvents = '';
            }, 200); // スクロール完了から0.2秒（200ミリ秒）待ってバリア解除
        };

        if (immediate) {
            finishScroll(); // 一瞬で移動する時はすぐにタイマーをスタート
        } else {
            let scrollTimer;
            let isScrolling = false;

            const checkScroll = () => {
                isScrolling = true;
                clearTimeout(scrollTimer);
                // スクロールが100ミリ秒止まったら「完了した」とみなします
                scrollTimer = setTimeout(() => {
                    sc.removeEventListener('scroll', checkScroll);
                    finishScroll();
                }, 100); 
            };

            // ブラウザが「スクロールしてるよ！」と教えてくれるたびにチェックします
            sc.addEventListener('scroll', checkScroll);

            // すでに目的地にいるなど、スクロールが全く起きなかった時のお守り
            setTimeout(() => {
                if (!isScrolling) {
                    sc.removeEventListener('scroll', checkScroll);
                    clearTimeout(scrollTimer);
                    finishScroll();
                }
            }, 200);
        }
    },
    
    updateZoomButtons() {
        if (!this.mapZoomInBtn || !this.mapZoomOutBtn) return;
        
        this.mapZoomInBtn.style.display = (this.zoomLevel >= 2) ? 'none' : 'flex';
        this.mapZoomOutBtn.style.display = (this.zoomLevel <= 0) ? 'none' : 'flex';
    },
    
    renderMap() {
        if (!this.mapEl) return;
        this.mapEl.innerHTML = ''; 
        
        // ★追加：一旦、勢力名シールが出ている合図をリセットします
        document.body.classList.remove('showing-daimyo-labels');
        
        if (!this.hasInitializedMap && this.game.castles.length > 0) {
            this.fitMapToScreen();
            this.hasInitializedMap = true;
            
            const sc = document.getElementById('map-scroll-container');
            if (sc) {
                setTimeout(() => {
                    // ★ここを差し替え！：シナリオのフォルダ名とデバイスに合わせて、最初に中心にするお城を決める魔法です！
                    const isPC = document.body.classList.contains('is-pc'); // 今がPC版かどうか調べます
                    const folderName = this.game.scenarioFolder; // さっき覚えさせたシナリオのフォルダ名を取り出します
                    
                    // ゲームの続きから（ロード時など）の場合は、今ターンの城を優先します
                    const currentTarget = this.currentCastle || this.game.getCurrentTurnCastle();
                    
                    // 設定箱の中から、今のシナリオ用の設定を探します（無ければDEFAULTを使います）
                    const config = INITIAL_MAP_CENTER_CONFIG[folderName] || INITIAL_MAP_CENTER_CONFIG.DEFAULT;
                    // PCかスマホかで、使うIDを選びます
                    const centerCastleId = isPC ? config.PC : config.MOBILE;
                    
                    const centerCastle = currentTarget || this.game.getCastle(centerCastleId);
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

        const isSelectionMode = (this.game.selectionMode !== null);
        const isDaimyoSelect = (this.game.phase === 'daimyo_select');

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
            // ★修正：マップで何かを選んでいる最中や、一時的に隠している時は、思考中の膜を復活させない魔法！
            if (this.game.isProcessingAI && !isSelectionMode && (this.guardHiddenCount || 0) === 0) {
                this.aiGuard.classList.remove('hidden'); 
            } else {
                this.aiGuard.classList.add('hidden'); 
            }
        }

        // 変更後
        const activeCastle = this.currentCastle || this.game.getCurrentTurnCastle(); // ★今ターンが来ている城を覚えておきます
        this.updateInfoPanel(activeCastle);

        // ★追加：ポップアップの目印シールを貼るために、絶対に「今のターンの城」を取得する魔法です
        const turnCastle = this.game.getCurrentTurnCastle();

        const mapW = this.game.mapWidth || 1200;
        const mapH = this.game.mapHeight || 800;
        
        // ==========================================
        // ★最新版：勢力の色で国を塗るための画用紙を敷きます！
        // ==========================================
        let clanColorOverlay = document.getElementById('clan-color-overlay');
        if (!clanColorOverlay) {
            clanColorOverlay = document.createElement('canvas');
            clanColorOverlay.id = 'clan-color-overlay';
            clanColorOverlay.width = mapW;
            clanColorOverlay.height = mapH;
            clanColorOverlay.style.position = 'absolute';
            clanColorOverlay.style.left = '0px';
            clanColorOverlay.style.top = '0px';
            clanColorOverlay.style.pointerEvents = 'none'; 
            clanColorOverlay.style.zIndex = '2'; // マップのすぐ上に敷きます
        }
        this.mapEl.appendChild(clanColorOverlay);

        // 地方を光らせるための「透明な画用紙（キャンバス）」を敷いておきます！
        const overlay = document.createElement('canvas');
        overlay.id = 'province-overlay';
        overlay.width = mapW;
        overlay.height = mapH;
        overlay.style.position = 'absolute';
        overlay.style.left = '0px';
        overlay.style.top = '0px';
        overlay.style.pointerEvents = 'none'; // クリックの邪魔をしないようにする魔法です
        overlay.style.zIndex = '3'; // お城の線より下、マップ画像より上に敷きます
        overlay.classList.add('anim-map-glow'); // ぼわーっと光るアニメーションの準備
        this.mapEl.appendChild(overlay);
        
        // ==========================================
        // ★今回追加：大雪を表現するための水玉キャンバスを敷きます！
        // ==========================================
        const snowOverlay = document.createElement('canvas');
        snowOverlay.id = 'snow-overlay';
        snowOverlay.width = mapW;
        snowOverlay.height = mapH;
        snowOverlay.style.position = 'absolute';
        snowOverlay.style.left = '0px';
        snowOverlay.style.top = '0px';
        snowOverlay.style.pointerEvents = 'none'; 
        snowOverlay.style.zIndex = '4'; // province-overlay(3)より上、SVG(5)やお城(10)より下
        this.mapEl.appendChild(snowOverlay);

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
        const forceReverse = ["2-95", "15-20", "17-24", "33-42", "38-102", "47-78", "49-78", "56-102", "58-67", "65-99", "79-81", "98-101", "126-155", "153-155", "154-157", "169-171"];

        // 普通カーブ：S字を強制的に「普通のカーブ」に戻すリストです
        const forceNormalCurve = ["33-42", "47-178", "126-155"];

        // 個別にカーブの角度（深さ）を調整する箱です！
        // 今の標準サイズは「0.05 ～ 0.095」くらいです。
        const customCurveSizes = {
            "33-42": 0.2,
            "87-175": 0.16,
            "17-72": 0.3,
            // 例："7-12": 0.2,   ←かなり大回りなカーブになります
            // 例："3-5": 0.02    ←かなり直線に近い浅いカーブになります
        };

        this.game.castles.forEach(c1 => {
            const pos1X = c1.pixelX !== undefined ? c1.pixelX : (c1.x * 80 + 40);
            const pos1Y = c1.pixelY !== undefined ? c1.pixelY : (c1.y * 80 + 40);

            if (c1.adjacentCastleIds) {
                c1.adjacentCastleIds.forEach(adjId => {
                    const c2 = this.game.getCastle(adjId);
                    if (!c2) return;

                    const pairKey = c1.id < adjId ? `${c1.id}-${adjId}` : `${adjId}-${c1.id}`;

                    if (!drawnLines.has(pairKey)) {
                        drawnLines.add(pairKey);

                        const pos2X = c2.pixelX !== undefined ? c2.pixelX : (c2.x * 80 + 40);
                        const pos2Y = c2.pixelY !== undefined ? c2.pixelY : (c2.y * 80 + 40);

                        const dx = pos2X - pos1X;
                        const dy = pos2Y - pos1Y;
                        const dist = Math.hypot(dx, dy);

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
        
        this.mapEl.appendChild(svg);
        
        this.game.castles.forEach(c => {
            const el = document.createElement('div'); el.className = 'castle-card';

            el.dataset.clan = c.ownerClan;
            
            const posX = c.pixelX !== undefined ? c.pixelX : (c.x * 80 + 40);
            const posY = c.pixelY !== undefined ? c.pixelY : (c.y * 80 + 40);
            
            el.style.left = `${posX}px`;
            el.style.top = `${posY}px`;

            if (c.isDone) el.classList.add('done');
            const castellan = this.game.getBusho(c.castellanId); const clanData = this.game.clans.find(cl => cl.id === c.ownerClan);
            
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
                                <img src="data/images/map/various_forces.webp" class="kunishu-icon-img" onerror="this.style.display='none'">
                                <div class="hover-info kunishu-hover-info">
                                    <div class="info-line">${kName}</div>
                                    <div class="info-line">${kLeaderName}</div>
                                </div>
                            </div>
                        `;
                    });
                    kunishuHtml += `</div>`;
                }

                // 城の吹き出しと、諸勢力のアイコンを一緒にセットします！
                el.innerHTML = `
                    <div class="hover-info">
                        <div class="info-line name">${c.name}</div>
                        <div class="info-line">${clanData ? clanData.name : "中立"}</div>
                        <div class="info-line">${castellanName}</div>
                    </div>
                    ${kunishuHtml}
                `;
            }
            
            if (isDaimyoSelect) {
                 el.style.cursor = 'pointer';
                 if (c.ownerClan === 0) {
                     el.classList.add('dimmed');
                 } 
                 // ★ 修正：赤いピカピカをなくすため selectable-target を削除
                 
                 el.onclick = (e) => {
                     e.stopPropagation();
                     if (this.isDraggingMap) return;
                     if (window.AudioManager && c.ownerClan !== 0) {
                         window.AudioManager.playSE('choice.ogg');
                     }
                     this.game.handleDaimyoSelect(c);
                 };
            }
            // ★修正：AIのターン中であっても、援軍などで「城を選んでいる最中(isSelectionMode)」なら操作できるようにバリアを解除します！
            else if (!this.game.isProcessingAI || isSelectionMode) {
                if (isSelectionMode) { 
                    if (this.game.validTargets.includes(c.id)) {
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
            };

            el.onmouseleave = () => {
                // ★ここを書き足し：スマホ版の時は何もしません
                if (!document.body.classList.contains('is-pc')) return;

                el.classList.remove('tooltip-bottom', 'tooltip-left', 'tooltip-right');
            };
            
            this.mapEl.appendChild(el);
        });

        // ==========================================
        // ★名前を絶対に手前に出して、重ならないように避ける魔法！
        // ==========================================
        // ★書き換え：大名選択の時だけじゃなく、外交などを選んでいる時(isSelectionMode)にもシールを出します！
        if (isDaimyoSelect || isSelectionMode) {
            this.renderDaimyoLabels();
        }
        
        this.updateCastleGlows();
        this.updateSnowOverlay(); // ★大雪の表示を更新します！
        this.updateClanColors(); // ★勢力の色で地図を塗る魔法を実行します！

        // ==========================================
        // ★大名選択モードの見た目とボタンを切り替える魔法です！
        // ==========================================
        const backToScenarioBtn = document.getElementById('btn-back-to-scenario');
        const confirmButtons = document.querySelector('.daimyo-confirm-buttons');

        if (isDaimyoSelect) {
            document.body.classList.add('daimyo-select-mode'); // 「今は大名選択中だよ！」という目印をつけます
            
            // まだ大名を選んでいない時
            if (!this.selectedDaimyoId) {
                // 大名情報の箱と、独立した「開始・戻る」ボタンを隠す
                if (this.daimyoConfirmModal) this.daimyoConfirmModal.classList.add('hidden');
                if (confirmButtons) confirmButtons.classList.add('hidden');
                
                // シナリオ選択に戻るボタンを出す
                if (backToScenarioBtn) {
                    backToScenarioBtn.classList.remove('hidden');
                    backToScenarioBtn.onclick = () => {
                        // ★修正：二重に鳴るのを防ぐため、ここでの音の魔法を消します
                        document.body.classList.remove('daimyo-select-mode');
                        backToScenarioBtn.classList.add('hidden');
                        this.returnToTitle(); 
                        if (window.GameApp) window.GameApp.startNewGame();
                    };
                }
            } else {
                // 大名を選んでいる時は「シナリオ選択に戻る」を隠す
                // （大名情報や開始・戻るボタンの表示は ui.js が担当してくれます）
                if (backToScenarioBtn) backToScenarioBtn.classList.add('hidden');
            }
        } else {
            document.body.classList.remove('daimyo-select-mode'); // 終わったら目印を外します
            if (backToScenarioBtn) backToScenarioBtn.classList.add('hidden');
            if (confirmButtons) confirmButtons.classList.add('hidden');
        }
        // ==========================================
    },
    
    // ★新魔法：勢力の名前を賢く並べる魔法です
    renderDaimyoLabels() {
        const labelsData = [];

        // ★追加：諸勢力コマンドや、出陣・援軍、調査などで城を選ぶ時は大名の名前シールを出さないようにします！
        const hiddenModes = [
            'kunishu_goodwill', 'kunishu_subjugate', 'kunishu_headhunt',
            'war',
            'atk_self_reinforcement', 'atk_ally_reinforcement',
            'def_self_reinforcement', 'def_ally_reinforcement',
            'investigate', 'info_investigate', 'investigation', // 調査コマンド用
            'incite', 'rumor', 'headhunt', 'headhunt_select_castle', 'sabotage' // 調略コマンド用
        ];
        if (hiddenModes.includes(this.game.selectionMode)) return;

        // ★ここから追加：外交や調略以外の「自国の城しか選ばないコマンド（輸送など）」の時は名前シールを出さない魔法！
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
            // ★修正：大名を選ぶ画面の時はみんなの名前を出し、ゲームが始まってからは自分の家の名前を隠すようにします！
            if (clan.id === 0) return;
            if (this.game.phase !== 'daimyo_select' && clan.id === this.game.playerClanId) return;
            
            const leader = this.game.getBusho(clan.leaderId);
            if (leader && leader.castleId) {
                const castle = this.game.getCastle(leader.castleId);
                if (castle) {
                    // ★ここから追加：選べない相手の時は、名前シールを「出さない」ようにする魔法！
                    // マップ上で何かを選んでいる最中（selectionMode）で、
                    // かつ、その城が「選べるリスト（validTargets）」に入っていないなら、ここでストップします。
                    if (this.game.selectionMode && !this.game.validTargets.includes(castle.id)) {
                        return;
                    }
                    // ★追加ここまで！

                    const posX = castle.pixelX !== undefined ? castle.pixelX : (castle.x * 80 + 40);
                    const posY = castle.pixelY !== undefined ? castle.pixelY : (castle.y * 80 + 40);
                    
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
        let iterations = 0;
        let hasCollision = true;
        while (hasCollision && iterations < 20) { 
            hasCollision = false;
            for (let i = 0; i < labelsData.length; i++) {
                for (let j = i + 1; j < labelsData.length; j++) {
                    const l1 = labelsData[i];
                    const l2 = labelsData[j];
                    
                    const left1 = l1.x - l1.width / 2;
                    const right1 = l1.x + l1.width / 2;
                    const top1 = l1.y + l1.offsetY - l1.height;
                    const bottom1 = l1.y + l1.offsetY;
                    
                    // ==========================================
                    // ★ここから下の４行が抜けていました！ごめんなさい！
                    const left2 = l2.x - l2.width / 2;
                    const right2 = l2.x + l2.width / 2;
                    const top2 = l2.y + l2.offsetY - l2.height;
                    const bottom2 = l2.y + l2.offsetY;
                    // ★書き足すのはここまで！
                    // ==========================================

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
            if (this.game.selectionMode && !this.game.validTargets.includes(l.castle.id)) {
                el.classList.add('dimmed');
            }
            
            // ★ここから追加！：名前シール自体をクリックできるようにする魔法
            el.onclick = (e) => {
                e.stopPropagation(); 
                if (this.isDraggingMap) return; // スクロール中は反応しないようにします
                
                // ★選べない相手の時は反応しないようにします
                if (this.game.selectionMode && !this.game.validTargets.includes(l.castle.id)) return;

                if (window.AudioManager) window.AudioManager.playSE('choice.ogg');
                
                // ★大名選択中と、マップ選択中（外交など）で魔法を使い分けます！
                if (this.game.phase === 'daimyo_select') {
                    this.game.handleDaimyoSelect(l.castle); // お城をクリックしたのと同じ魔法を発動！
                } else if (this.game.selectionMode) {
                    this.game.commandSystem.resolveMapSelection(l.castle); // 外交などの魔法を発動！
                }
            };
            // ★追加ここまで！

            this.mapEl.appendChild(el);
        });
    },
    
    updateCastleGlows() {
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
            });
            return;
        }

        let baseClanId = this.game.playerClanId;
        
        if (this.currentCastle && this.currentCastle.ownerClan !== 0) {
            baseClanId = this.currentCastle.ownerClan;
        }

        const cards = this.mapEl.querySelectorAll('.castle-card');
        cards.forEach(card => {
            const clanId = parseInt(card.dataset.clan, 10);
            
            card.classList.remove('glow-blue', 'glow-red', 'glow-green');
            
            if (clanId === 0) return;
            
            if (clanId === baseClanId) {
                card.classList.add('glow-blue');
            } else {
                const rel = this.game.getRelation(baseClanId, clanId);
                if (rel) {
                    if (rel.status === '敵対') {
                        card.classList.add('glow-red');   
                    } else if (['友好', '同盟', '支配', '従属'].includes(rel.status)) {
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
        const overlay = document.getElementById('province-overlay');
        if (!overlay) return;
        const ctx = overlay.getContext('2d');
        const width = overlay.width;
        const height = overlay.height;
        
        // まずは前に塗った色を全部消して、画用紙を綺麗にします
        ctx.clearRect(0, 0, width, height);

        // DataManagerにこっそりしまっておいた画像データ（裏側の秘密マップ）をもらいます
        const sourceData = DataManager.provinceImageData;
        
        // ★修正：ロードしたばかりで画像データが無い場合は、読み込んでからやり直します！
        if (!sourceData) {
            const provMapImg = new Image();
            provMapImg.src = './data/images/map/japan_provinces.png';
            provMapImg.onload = () => {
                const tempCanvas = document.createElement('canvas');
                tempCanvas.width = provMapImg.naturalWidth;
                tempCanvas.height = provMapImg.naturalHeight;
                const tempCtx = tempCanvas.getContext('2d');
                tempCtx.drawImage(provMapImg, 0, 0);
                DataManager.provinceImageData = tempCtx.getImageData(0, 0, tempCanvas.width, tempCanvas.height);
                this.highlightRegion(regionId);
            };
            return;
        }

        // 指定された地方（regionId）に含まれる国の「色コード」を全部集めます
        const targetColors = this.game.provinces
            .filter(p => p.regionId === regionId)
            .map(p => DataManager.hexToRgb(p.color_code));

        if (targetColors.length === 0) return;

        // 新しく色を塗るための透明な絵の具セットを作ります
        const outputData = ctx.createImageData(width, height);

        // 画像の「点（ピクセル）」を1個ずつ調べていきます！
        for (let i = 0; i < sourceData.data.length; i += 4) {
            const r = sourceData.data[i];
            const g = sourceData.data[i+1];
            const b = sourceData.data[i+2];
            const a = sourceData.data[i+3];

            if (a === 0) continue; // 透明な場所は無視して次へ

            // 集めた色コードと完全に一致するかチェックします
            let match = false;
            for (let c of targetColors) {
                // 別の国を巻き込まないように、ピッタリ同じ色だけを塗ります
                if (r === c.r && g === c.g && b === c.b) {
                    match = true;
                    break;
                }
            }

            if (match) {
                // 一致したら、赤色で半透明に塗ります！（色はR, G, Bの数字で自由に変えられます）
                outputData.data[i] = 255;   // R（赤：マックス）
                outputData.data[i+1] = 50;  // G（緑：少し）
                outputData.data[i+2] = 50;  // B（青：少し）
                outputData.data[i+3] = 128; // A（透明度。255が真っ暗、0が透明、128は半透明）
            }
        }

        // 完成した絵の具を、画用紙にドーンと乗せます！
        ctx.putImageData(outputData, 0, 0);
    },

    // 光を消す魔法です
    clearHighlight() {
        const overlay = document.getElementById('province-overlay');
        if (!overlay) return;
        const ctx = overlay.getContext('2d');
        // 画用紙を綺麗にするだけ！
        ctx.clearRect(0, 0, overlay.width, overlay.height);
    },

    // ==========================================
    // ★大雪の国のマップ上に、白い水玉模様を描く魔法です！
    // ==========================================
    updateSnowOverlay() {
        const overlay = document.getElementById('snow-overlay');
        if (!overlay) return;

        // DataManagerにこっそりしまっておいた画像データ（裏側の秘密マップ）をもらいます
        const sourceData = DataManager.provinceImageData;
        
        // ★修正：ロードしたばかりで画像データが無い場合は、読み込んでからやり直します！
        if (!sourceData) {
            const provMapImg = new Image();
            provMapImg.src = './data/images/map/japan_provinces.png';
            provMapImg.onload = () => {
                const tempCanvas = document.createElement('canvas');
                tempCanvas.width = provMapImg.naturalWidth;
                tempCanvas.height = provMapImg.naturalHeight;
                const tempCtx = tempCanvas.getContext('2d');
                tempCtx.drawImage(provMapImg, 0, 0);
                DataManager.provinceImageData = tempCtx.getImageData(0, 0, tempCanvas.width, tempCanvas.height);
                this.updateSnowOverlay();
            };
            return;
        }

        // ★ここから記憶の魔法！
        // 全部の国の大雪状態を「0（降ってない）」「1（降ってる）」という文字にして繋げます
        const currentSnowHash = this.game.provinces.map(p => p.statusEffects && p.statusEffects.includes('heavySnow') ? '1' : '0').join('');
        
        // もし前回の状態と全く同じで、しかも記憶した絵（写真）が残っていれば…
        if (this.lastSnowHash === currentSnowHash && this.lastSnowImageData && this.lastSnowImageData.width === overlay.width) {
            // 新しく計算せずに、記憶しておいた写真をそのまま画用紙に貼り付けて終わります！（超軽量化！）
            const ctx = overlay.getContext('2d');
            ctx.putImageData(this.lastSnowImageData, 0, 0);
            return;
        }
        // 今の状態を「前回」として記憶しておきます
        this.lastSnowHash = currentSnowHash;
        // ★記憶の魔法ここまで！

        const ctx = overlay.getContext('2d');
        const width = overlay.width;
        const height = overlay.height;
        
        // まずは前の雪を全部消して綺麗にします
        ctx.clearRect(0, 0, width, height);

        // 「heavySnow（大雪）」のシールが貼られている国の色コードを全部集めます
        const targetColors = this.game.provinces
            .filter(p => p.statusEffects && p.statusEffects.includes('heavySnow'))
            .map(p => DataManager.hexToRgb(p.color_code));

        if (targetColors.length === 0) {
            // ★雪が全く無い場合も「透明な絵」として記憶しておきます
            this.lastSnowImageData = ctx.getImageData(0, 0, width, height);
            return;
        }

        // 新しく雪を降らせるための透明な絵の具セットを作ります
        const outputData = ctx.createImageData(width, height);

        // 画像の「点（ピクセル）」を1個ずつ調べていきます！
        for (let i = 0; i < sourceData.data.length; i += 4) {
            const r = sourceData.data[i];
            const g = sourceData.data[i+1];
            const b = sourceData.data[i+2];
            const a = sourceData.data[i+3];

            if (a === 0) continue; // 透明な場所は無視して次へ

            // 大雪の国かどうかチェックします
            let match = false;
            for (let c of targetColors) {
                // 別の国を巻き込まないように、ピッタリ同じ色だけを塗ります
                if (r === c.r && g === c.g && b === c.b) {
                    match = true;
                    break;
                }
            }

            if (match) {
                // 水玉模様を描くために、今のピクセルが「どこ」にあるか計算します
                const pixelIndex = i / 4;
                const x = pixelIndex % width;
                const y = Math.floor(pixelIndex / width);

                // 8ピクセルごとに2x2の四角い白い雪（水玉）を描きます！
                const modX = x % 8;
                const modY = y % 8;
                if ((modX < 2 && modY < 2) || (modX >= 4 && modX < 6 && modY >= 4 && modY < 6)) {
                    outputData.data[i] = 255;     // R（白）
                    outputData.data[i+1] = 255;   // G（白）
                    outputData.data[i+2] = 255;   // B（白）
                    outputData.data[i+3] = 210;   // A（少し透ける白）
                }
            }
        }
        
        // 完成した雪の絵の具を、画用紙にドーンと乗せます！
        ctx.putImageData(outputData, 0, 0);
        
        // ★ここで描いた雪の絵（写真）を丸ごと記憶します！
        this.lastSnowImageData = outputData;
    },

    // ==========================================
    // ★新魔法：国を勢力の色で塗りつぶす魔法です！
    // ==========================================
    updateClanColors() {
        // ★追加：独立や謀反の演出中は、色がフライングで変わらないようにストップをかけます！
        if (this.game && this.game.isSuspendingColorUpdate) return;

        const overlay = document.getElementById('clan-color-overlay');
        if (!overlay) return;

        const sourceData = DataManager.provinceImageData;
        if (!sourceData) {
            const provMapImg = new Image();
            provMapImg.src = './data/images/map/japan_provinces.png';
            provMapImg.onload = () => {
                const tempCanvas = document.createElement('canvas');
                tempCanvas.width = provMapImg.naturalWidth;
                tempCanvas.height = provMapImg.naturalHeight;
                const tempCtx = tempCanvas.getContext('2d');
                tempCtx.drawImage(provMapImg, 0, 0);
                DataManager.provinceImageData = tempCtx.getImageData(0, 0, tempCanvas.width, tempCanvas.height);
                this.updateClanColors();
            };
            return;
        }

        // ★ここから記憶の魔法！
        // お城の持ち主の「出席番号」を全員分繋げた文字の暗号を作ります（例：1,1,2,0,3...）
        const currentOwnerHash = this.game.castles.map(c => c.ownerClan).join(',');
        
        // もし前回の状態と全く同じで、しかも記憶した絵（写真）が残っていれば…
        if (this.lastClanColorsHash === currentOwnerHash && this.lastClanColorsImageData && this.lastClanColorsImageData.width === overlay.width) {
            // 新しく計算せずに、記憶しておいた写真をそのまま画用紙に貼り付けて終わります！（超軽量化！）
            const ctx = overlay.getContext('2d');
            ctx.putImageData(this.lastClanColorsImageData, 0, 0);
            return;
        }
        // 今の状態を「前回」として記憶しておきます
        this.lastClanColorsHash = currentOwnerHash;
        // ★記憶の魔法ここまで！

        const ctx = overlay.getContext('2d');
        const width = overlay.width;
        const height = overlay.height;
        ctx.clearRect(0, 0, width, height);

        // 1. 国の色とデータを紐付けます（文字列ではなく数字に変換して超高速化！）
        const colorToProvince = new Map();
        this.game.provinces.forEach(p => {
            const rgb = DataManager.hexToRgb(p.color_code);
            if (rgb) {
                // R, G, Bの色をビット演算で「１つの数字」に合体させます
                const colorInt = (rgb.r << 16) | (rgb.g << 8) | rgb.b;
                colorToProvince.set(colorInt, p);
            }
        });

        // 2. 国ごとの「お城のリスト」と「全員同じ勢力かどうか」を事前に調べます
        const provinceInfo = new Map();
        this.game.provinces.forEach(p => {
            const castles = this.game.castles.filter(c => c.provinceId === p.id);
            let owner = -1; 
            if (castles.length > 0) {
                const firstOwner = castles[0].ownerClan;
                if (castles.every(c => c.ownerClan === firstOwner)) owner = firstOwner;
            } else {
                owner = 0; 
            }
            provinceInfo.set(p.id, { castles, owner });
        });

        const clanColors = new Map();
        this.game.clans.forEach(clan => {
            if (clan.id !== 0 && clan.color) clanColors.set(clan.id, DataManager.hexToRgb(clan.color));
        });

        const outputData = ctx.createImageData(width, height);
        const sd = sourceData.data;

        // ★ここから陣取りゲーム（幅優先探索）の準備です！
        const pixelSize = width * height;
        const pixelClanMap = new Int32Array(pixelSize);
        const provinceMap = new Int32Array(pixelSize);
        
        // ① 画像の全ての点が「どの国」か調べます（文字を使わずに計算を軽くします）
        for (let i = 0; i < sd.length; i += 4) {
            if (sd[i+3] === 0) continue; // 透明（海）なら飛ばす
            const colorInt = (sd[i] << 16) | (sd[i+1] << 8) | sd[i+2];
            const province = colorToProvince.get(colorInt);
            if (province) {
                provinceMap[i / 4] = province.id;
            }
        }
        
        // ② 複数の勢力がいる国は、お城から陣取りゲームをスタートするための準備をします
        const queueX = new Int32Array(pixelSize);
        const queueY = new Int32Array(pixelSize);
        const queueClan = new Int32Array(pixelSize);
        const queueCastleId = new Int32Array(pixelSize); 
        const queueProvId = new Int32Array(pixelSize); // ★追加：正しい国のIDを覚える箱
        let head = 0;
        let tail = 0;
        
        const distanceMap = new Int32Array(pixelSize);
        distanceMap.fill(999999);

        // ★追加：各ピクセルが「どの城の領地か」を記録する新しい箱を用意します！
        if (!this.pixelCastleMap || this.pixelCastleMap.length !== pixelSize) {
            this.pixelCastleMap = new Int32Array(pixelSize);
        }
        this.pixelCastleMap.fill(0);

        provinceInfo.forEach((info, provId) => {
            // ★変更：１つの勢力しかいない国でも、どの城の領土かを記録するために全城から陣取りさせます！
            info.castles.forEach(c => {
                const cx = Math.floor(c.pixelX !== undefined ? c.pixelX : (c.x * 80 + 40));
                const cy = Math.floor(c.pixelY !== undefined ? c.pixelY : (c.y * 80 + 40));
                
                if (cx >= 0 && cx < width && cy >= 0 && cy < height) {
                    const idx = cy * width + cx;
                    queueX[tail] = cx;
                    queueY[tail] = cy;
                    queueClan[tail] = c.ownerClan;
                    queueCastleId[tail] = c.id; 
                    queueProvId[tail] = provId; // ★お城が本来所属している「正解の国ID」を持たせます
                    tail++;
                    
                    pixelClanMap[idx] = c.ownerClan;
                    this.pixelCastleMap[idx] = c.id; 
                    distanceMap[idx] = 0;
                }
            });
        });

        // ③ 水が広がるように、同じ国の中だけを陣取りしていきます
        const dx = [0, 1, 0, -1];
        const dy = [-1, 0, 1, 0];
        
        while (head < tail) {
            const x = queueX[head];
            const y = queueY[head];
            const clanId = queueClan[head];
            const qCastleId = queueCastleId[head]; 
            const qProvId = queueProvId[head]; // ★正解の国IDを取り出す
            head++;
            
            const currIdx = y * width + x;
            const currDist = distanceMap[currIdx];

            for (let d = 0; d < 4; d++) {
                const nx = x + dx[d];
                const ny = y + dy[d];
                
                if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
                    const nIdx = ny * width + nx;
                    
                    // ★修正：スタートしたピクセルの色ではなく、「正解の国ID(qProvId)」と比較します！
                    // これで、お城の位置が境界線（黒い線＝国IDが0）に重なっていても、
                    // 海や境界線全体に水が広がってしまうバグを完全に防げます！
                    if (provinceMap[nIdx] === qProvId) {
                        if (distanceMap[nIdx] > currDist + 1) {
                            distanceMap[nIdx] = currDist + 1;
                            pixelClanMap[nIdx] = clanId;
                            this.pixelCastleMap[nIdx] = qCastleId; 
                            
                            queueX[tail] = nx;
                            queueY[tail] = ny;
                            queueClan[tail] = clanId;
                            queueCastleId[tail] = qCastleId; 
                            queueProvId[tail] = qProvId; // ★次へパス
                            tail++;
                        }
                    }
                }
            }
        }

        // ④ 陣取りの結果を使って、実際に画用紙（outputData）に色を塗ります！
        for (let i = 0; i < sd.length; i += 4) {
            if (sd[i+3] === 0) continue;

            const pxIdx = i / 4;
            const provId = provinceMap[pxIdx];
            if (provId === 0) continue;

            const info = provinceInfo.get(provId);
            let targetClanId = pixelClanMap[pxIdx]; // ★変更
            let targetCastleId = this.pixelCastleMap[pxIdx]; // ★追加

            // もし海を隔てた「飛び地」などでお城から陣取りが届かなかった場所は、今まで通り直線距離で塗ります
            if (targetClanId === 0 && info.castles.length > 0) {
                const px = pxIdx % width;
                const py = Math.floor(pxIdx / width);
                let minDistSq = Infinity;
                for (let j = 0; j < info.castles.length; j++) {
                    const c = info.castles[j];
                    const cx = c.pixelX !== undefined ? c.pixelX : (c.x * 80 + 40);
                    const cy = c.pixelY !== undefined ? c.pixelY : (c.y * 80 + 40);
                    // 計算を軽くするため、二乗の記号（**2）ではなく掛け算を使います
                    const dSq = (px - cx) * (px - cx) + (py - cy) * (py - cy);
                    if (dSq < minDistSq) {
                        minDistSq = dSq;
                        targetClanId = c.ownerClan;
                        targetCastleId = c.id; // ★追加
                    }
                }
                this.pixelCastleMap[pxIdx] = targetCastleId; // ★追加
            }

            // info.owner !== -1（全城が同じ勢力）の場合は念のため上書き
            if (info.owner !== -1) {
                targetClanId = info.owner;
            }

            const clanRgb = (targetClanId !== 0) ? clanColors.get(targetClanId) : null;
            if (clanRgb) {
                outputData.data[i] = clanRgb.r;
                outputData.data[i+1] = clanRgb.g;
                outputData.data[i+2] = clanRgb.b;
            } else {
                outputData.data[i] = 255;
                outputData.data[i+1] = 255;
                outputData.data[i+2] = 255;
            }
            outputData.data[i+3] = 100; // 少し透明にします
        }

        // ★ここから追加：色を1px広く塗る（じわっと滲ませる）魔法です！
        // 一度塗り終わった絵をコピーして「お手本」にします
        const tempOutput = new Uint8ClampedArray(outputData.data);
        
        // 絵の端っこはチェックできないので、1ピクセル内側から調べます
        for (let y = 1; y < height - 1; y++) {
            for (let x = 1; x < width - 1; x++) {
                const idx = (y * width + x) * 4;
                
                // もし今の場所が「まだ塗られていない（透明）」なら…
                if (tempOutput[idx + 3] === 0) {
                    // 上・下・左・右の場所を計算します
                    const up = ((y - 1) * width + x) * 4;
                    const down = ((y + 1) * width + x) * 4;
                    const left = (y * width + (x - 1)) * 4;
                    const right = (y * width + (x + 1)) * 4;

                    // もし上下左右のどこかに色が塗られていたら、その色をコッソリ借ります！
                    if (tempOutput[up + 3] > 0) {
                        outputData.data[idx] = tempOutput[up];
                        outputData.data[idx+1] = tempOutput[up+1];
                        outputData.data[idx+2] = tempOutput[up+2];
                        outputData.data[idx+3] = tempOutput[up+3];
                    } else if (tempOutput[down + 3] > 0) {
                        outputData.data[idx] = tempOutput[down];
                        outputData.data[idx+1] = tempOutput[down+1];
                        outputData.data[idx+2] = tempOutput[down+2];
                        outputData.data[idx+3] = tempOutput[down+3];
                    } else if (tempOutput[left + 3] > 0) {
                        outputData.data[idx] = tempOutput[left];
                        outputData.data[idx+1] = tempOutput[left+1];
                        outputData.data[idx+2] = tempOutput[left+2];
                        outputData.data[idx+3] = tempOutput[left+3];
                    } else if (tempOutput[right + 3] > 0) {
                        outputData.data[idx] = tempOutput[right];
                        outputData.data[idx+1] = tempOutput[right+1];
                        outputData.data[idx+2] = tempOutput[right+2];
                        outputData.data[idx+3] = tempOutput[right+3];
                    }
                }
            }
        }
        // ★追加ここまで！

        ctx.putImageData(outputData, 0, 0);
        
        // ★ここで描いた勢力の色（写真）を丸ごと記憶します！
        this.lastClanColorsImageData = outputData;
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
            guard.style.zIndex = '500';
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

    // ==========================================
    // ★追加：指定したお城の領地だけをチカチカ点滅させる魔法です！
    // ==========================================
    playBattleBlink(castleIdOrIds, colorA, colorB, durationMs) {
        return new Promise(resolve => {
            // タッチ防止の透明な壁を作ります（共通の魔法を使います）
            this.showMapGuard();

            // 点滅を描くための新しい透明な画用紙を作ります
            let overlay = document.getElementById('battle-blink-overlay');
            if (!overlay) {
                overlay = document.createElement('canvas');
                overlay.id = 'battle-blink-overlay';
                overlay.width = this.game.mapWidth || 1200;
                overlay.height = this.game.mapHeight || 800;
                overlay.style.position = 'absolute';
                overlay.style.left = '0px';
                overlay.style.top = '0px';
                overlay.style.pointerEvents = 'none';
                overlay.style.zIndex = '6'; // 勢力色の画用紙より少し上に置きます
                this.mapEl.appendChild(overlay);
            }
            
            const ctx = overlay.getContext('2d');
            const width = overlay.width;
            const height = overlay.height;
            const outputDataA = ctx.createImageData(width, height);
            const outputDataB = ctx.createImageData(width, height);
            
            // ピクセルマップから、そのお城の領地だけを抜き出して色を塗ります
            if (this.pixelCastleMap) {
                // 中立(0)や諸勢力の場合は白にするためのデフォルト値
                const colorA_RGB = colorA || { r: 255, g: 255, b: 255 };
                const colorB_RGB = colorB || { r: 255, g: 255, b: 255 };

                // ★追加：2ピクセル分広く塗るための準備
                const targetPixels = new Uint8Array(width * height);

                // ★修正：１つの城でも、複数の城でも同時に光るようにリストにします！
                const targetIds = Array.isArray(castleIdOrIds) ? castleIdOrIds : [castleIdOrIds];

                // まずは本来のお城の領地をマークします
                for (let i = 0; i < this.pixelCastleMap.length; i++) {
                    if (targetIds.includes(this.pixelCastleMap[i])) {
                        targetPixels[i] = 1;
                    }
                }

                // ★2回繰り返すことで、2ピクセル分外側に広げます
                for (let step = 0; step < 2; step++) {
                    const tempPixels = new Uint8Array(targetPixels);
                    for (let y = 1; y < height - 1; y++) {
                        for (let x = 1; x < width - 1; x++) {
                            const i = y * width + x;
                            if (tempPixels[i] === 0) {
                                // 上下左右のどこかが 1 なら、ここも 1 にします
                                if (tempPixels[i - width] === 1 ||
                                    tempPixels[i + width] === 1 ||
                                    tempPixels[i - 1] === 1 ||
                                    tempPixels[i + 1] === 1) {
                                    targetPixels[i] = 1;
                                }
                            }
                        }
                    }
                }

                for (let i = 0; i < targetPixels.length; i++) {
                    if (targetPixels[i] === 1) {
                        const idx = i * 4;
                        outputDataA.data[idx] = colorA_RGB.r;
                        outputDataA.data[idx+1] = colorA_RGB.g;
                        outputDataA.data[idx+2] = colorA_RGB.b;
                        outputDataA.data[idx+3] = 200;
                        
                        outputDataB.data[idx] = colorB_RGB.r;
                        outputDataB.data[idx+1] = colorB_RGB.g;
                        outputDataB.data[idx+2] = colorB_RGB.b;
                        outputDataB.data[idx+3] = 200; 
                    }
                }
            }
            
            let startTime = performance.now();
            let isA = true;
            const blinkInterval = 250; // 0.25秒ごとに色を切り替えます（チカチカ早すぎないように）
            let lastSwitchTime = startTime;

            // アニメーションを動かす魔法です
            const animate = (currentTime) => {
                if (currentTime - startTime > durationMs) {
                    ctx.clearRect(0, 0, width, height);
                    this.hideMapGuard(); // 共通の魔法で壁を消します
                    resolve();
                    return;
                }
                
                if (currentTime - lastSwitchTime > blinkInterval) {
                    isA = !isA;
                    lastSwitchTime = currentTime;
                    ctx.clearRect(0, 0, width, height);
                    ctx.putImageData(isA ? outputDataA : outputDataB, 0, 0);
                }
                
                requestAnimationFrame(animate);
            };
            
            ctx.putImageData(outputDataA, 0, 0);
            requestAnimationFrame(animate);
        });
    },

    // ==========================================
    // ★ここから追加：城が落ちた時の、障壁がフワッと立ち上って白く光る魔法！
    // ==========================================
    playCaptureEffect(castleIdOrIds, onHalfway) {
        return new Promise(resolve => {
            // アニメーション中に画面を触れないようにバリアを張ります（共通の魔法を使います）
            this.showMapGuard();

            // エフェクトを描くための「専用の透明な画用紙」を用意します
            let overlay = document.getElementById('capture-effect-overlay');
            if (!overlay) {
                overlay = document.createElement('canvas');
                overlay.id = 'capture-effect-overlay';
                overlay.width = this.game.mapWidth || 1200;
                overlay.height = this.game.mapHeight || 800;
                overlay.style.position = 'absolute';
                overlay.style.left = '0px';
                overlay.style.top = '0px';
                overlay.style.pointerEvents = 'none';
                overlay.style.zIndex = '7';
                this.mapEl.appendChild(overlay);
            }
            
            const ctx = overlay.getContext('2d');
            const width = overlay.width;
            const height = overlay.height;
            
            const targetPixels = new Uint8Array(width * height);
            const edgePixels = new Uint8Array(width * height);
            
            if (this.pixelCastleMap) {
                // ★修正：１つの城でも、複数の城でも同時に光るようにリストにします！
                const targetIds = Array.isArray(castleIdOrIds) ? castleIdOrIds : [castleIdOrIds];

                for (let i = 0; i < this.pixelCastleMap.length; i++) {
                    if (targetIds.includes(this.pixelCastleMap[i])) {
                        targetPixels[i] = 1;
                    }
                }
                for (let y = 1; y < height - 1; y++) {
                    for (let x = 1; x < width - 1; x++) {
                        const i = y * width + x;
                        if (targetPixels[i] === 1) {
                            if (targetPixels[i - width] === 0 || targetPixels[i + width] === 0 ||
                                targetPixels[i - 1] === 0 || targetPixels[i + 1] === 0) {
                                edgePixels[i] = 1;
                            }
                        }
                    }
                }
            }
            
            let startTime = performance.now();
            const durationRise = 800;
            const durationFlash = 600;
            const totalDuration = durationRise + durationFlash;
            let halfwayDone = false;

            const animate = (currentTime) => {
                const elapsed = currentTime - startTime;
                ctx.clearRect(0, 0, width, height);

                if (elapsed < durationRise) {
                    const progress = elapsed / durationRise;
                    const riseY = progress * 40;
                    const alpha = 1.0 - progress;
                    const imgData = ctx.createImageData(width, height);
                    for (let i = 0; i < targetPixels.length; i++) {
                        if (targetPixels[i] === 1) {
                            const idx = i * 4;
                            imgData.data[idx] = 255;
                            imgData.data[idx+1] = 255;
                            imgData.data[idx+2] = 255;
                            imgData.data[idx+3] = Math.floor(255 * (progress * 0.9));
                        }
                    }
                    ctx.putImageData(imgData, 0, 0);
                } else if (elapsed < totalDuration) {
                    if (!halfwayDone) {
                        halfwayDone = true;
                        if (onHalfway) onHalfway();
                    }
                    const progress = (elapsed - durationRise) / durationFlash;
                    const alpha = 1.0 - progress;
                    const imgData = ctx.createImageData(width, height);
                    for (let i = 0; i < targetPixels.length; i++) {
                        if (targetPixels[i] === 1) {
                            const idx = i * 4;
                            imgData.data[idx] = 255;
                            imgData.data[idx+1] = 255;
                            imgData.data[idx+2] = 255;
                            imgData.data[idx+3] = Math.floor(255 * alpha);
                        }
                    }
                    ctx.putImageData(imgData, 0, 0);
                }

                if (elapsed < totalDuration) {
                    requestAnimationFrame(animate);
                } else {
                    ctx.clearRect(0, 0, width, height);
                    this.hideMapGuard(); // 終わったらバリアを消します
                    resolve();
                }
            };
            requestAnimationFrame(animate);
        });
    }
});