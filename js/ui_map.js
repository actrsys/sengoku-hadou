/**
 * ui_map.js
 * 画面の見た目（ui.js）のうち、マップを動かす魔法だけを担当する別館です。
 */

// ★ マップのズーム設定を1箇所で管理する箱
const MAP_ZOOM_CONFIG = {
    PC: {
        minMargin: 1.05, // PCの最小サイズの時の余白（1.0でピッタリ）
        mid: 2,        // PCの中間サイズ
        max: 3.5         // PCの最大サイズ
    },
    MOBILE: {
        minMargin: 1, // スマホの最小サイズの時の余白
        mid: 1,        // スマホの中間サイズ
        max: 2         // スマホの最大サイズ
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
    
    scrollToActiveCastle(castle = null) {
        const targetCastle = castle || this.currentCastle || this.game.getCurrentTurnCastle();
        const sc = document.getElementById('map-scroll-container');
        if (!sc || !targetCastle) return;
        
        const posX = targetCastle.pixelX !== undefined ? targetCastle.pixelX : (targetCastle.x * 80 + 40);
        const posY = targetCastle.pixelY !== undefined ? targetCastle.pixelY : (targetCastle.y * 80 + 40);
        
        const currentLeft = parseFloat(this.mapEl.style.left || 0);
        const currentTop = parseFloat(this.mapEl.style.top || 0);
        
        const scaledX = posX * this.mapScale + currentLeft;
        const scaledY = posY * this.mapScale + currentTop;
        
        sc.scrollTo({
            left: scaledX - sc.clientWidth / 2,
            top: scaledY - sc.clientHeight / 2,
            behavior: 'smooth'
        });
    },
    
    updateZoomButtons() {
        if (!this.mapZoomInBtn || !this.mapZoomOutBtn) return;
        
        this.mapZoomInBtn.style.display = (this.zoomLevel >= 2) ? 'none' : 'flex';
        this.mapZoomOutBtn.style.display = (this.zoomLevel <= 0) ? 'none' : 'flex';
    },
    
    renderMap() {
        if (!this.mapEl) return;
        this.mapEl.innerHTML = ''; 
        
        if (!this.hasInitializedMap && this.game.castles.length > 0) {
            this.fitMapToScreen();
            this.hasInitializedMap = true;
            
            const sc = document.getElementById('map-scroll-container');
            if (sc) {
                setTimeout(() => {
                    // ★ここを差し替え！：ID35番のお城を探して、そこにカメラを合わせる魔法です！
                    const centerCastle = this.game.getCastle(35);
                    if (centerCastle) {
                        // お城が見つかったら、そこを真ん中にして映します
                        this.scrollToActiveCastle(centerCastle);
                    } else {
                        // もしお城が見つからなかった時のためのお守りです（今まで通り全体の真ん中を映します）
                        sc.scrollTop = (sc.scrollHeight - sc.clientHeight) / 2;
                        sc.scrollLeft = (sc.scrollWidth - sc.clientWidth) / 2;
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
                this.mapGuide.classList.remove('hidden'); 
                this.mapGuide.textContent = "操作する大名家を選択してください";
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

        const svgNS = "http://www.w3.org/2000/svg";
        const svg = document.createElementNS(svgNS, "svg");
        
        const mapW = this.game.mapWidth || 1200;
        const mapH = this.game.mapHeight || 800;
        svg.setAttribute("width", mapW);
        svg.setAttribute("height", mapH);
        
        svg.style.position = "absolute";
        svg.style.left = "0px";
        svg.style.top = "0px";
        svg.style.pointerEvents = "none"; 
        svg.style.zIndex = "5"; 

        const drawnLines = new Set();
        
        const forceSCurve = [];
        const forceStraight = [];

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

                        const curveSize = dist * (0.05 + ((c1.id * c2.id) % 10) * 0.005);
                        const dir = ((c1.id + c2.id) % 2 === 0) ? 1 : -1;

                        const nx = -dy / dist;
                        const ny = dx / dist;

                        const path = document.createElementNS(svgNS, "path");

                        let lineType = "curve"; 
                        
                        if (((c1.id + c2.id) % 3 === 0)) {
                            lineType = "s-curve";
                        }
                        
                        if (forceSCurve.includes(pairKey)) lineType = "s-curve";
                        if (forceStraight.includes(pairKey)) lineType = "straight";

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

                        path.setAttribute("fill", "transparent");
                        path.setAttribute("stroke", "rgba(255, 250, 200, 0.9)"); 
                        path.setAttribute("stroke-width", "1.5");
                        svg.appendChild(path);
                    }
                });
            }
        });
        
        this.mapEl.appendChild(svg);
        
        this.game.castles.forEach(c => {
            const el = document.createElement('div'); el.className = 'castle-card';
            
            // ★修正：『activeCastle』の代わりに、さっき覚えた『turnCastle』を使うようにします！
            if (!isSelectionMode && turnCastle && c.id === turnCastle.id && c.ownerClan === this.game.playerClanId && !c.isDelegated) {
                el.classList.add('current-turn');
            }

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
            else if (!this.game.isProcessingAI) {
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

        // ==========================================
        // ★スマホで大名を選ぶ時専用の「ボトムバー」を出す魔法です！
        // ==========================================
        if (isDaimyoSelect) {
            document.body.classList.add('daimyo-select-mode'); // 「今は大名選択中だよ！」という目印をつけます
            
            // まだ大名を選んでいない時は、案内メッセージを出しておきます
            if (this.daimyoConfirmModal && !this.selectedDaimyoId) {
                this.daimyoConfirmModal.classList.remove('hidden');
                if (this.daimyoConfirmBody) {
                    this.daimyoConfirmBody.innerHTML = `
                        <div style="text-align:center; padding: 20px 0; color: #555; font-size: 1.05rem; font-weight: bold;">
                            操作する大名家を選択してください。
                        </div>
                    `;
                }
                const startBtn = document.getElementById('daimyo-confirm-start-btn');
                const backBtn = document.getElementById('daimyo-confirm-back-btn');
                if(startBtn) startBtn.style.display = 'none'; // ボタンは隠します
                if(backBtn) backBtn.style.display = 'none';
            }
        } else {
            document.body.classList.remove('daimyo-select-mode'); // 終わったら目印を外します
        }
        // ==========================================
    },
    
    // ★新魔法：大名家の名前を賢く並べる魔法です
    renderDaimyoLabels() {
        const labelsData = [];

        // ★追加：諸勢力コマンドや、出陣・援軍などで城を選ぶ時は大名の名前シールを出さないようにします！
        const hiddenModes = [
            'kunishu_goodwill', 'kunishu_subjugate', 'kunishu_headhunt',
            'war',
            'atk_self_reinforcement', 'atk_ally_reinforcement',
            'def_self_reinforcement', 'def_ally_reinforcement'
        ];
        if (hiddenModes.includes(this.game.selectionMode)) return;

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
    }
}); // 合体魔法はここで終わり