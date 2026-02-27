/**
 * ui.js
 * 画面の見た目や操作（UI）を担当するファイルです。
 * 修正：野戦用の兵科（騎馬・鉄砲）を指定するためのUIと兵力分配画面のロジックを追加
 */

class UIManager {
    constructor(game) {
        this.game = game; this.currentCastle = null; this.menuState = 'MAIN';
        this.logHistory = [];
        this.mapScale = 1.0;

        this.mapEl = document.getElementById('map-container'); 
        this.panelEl = document.getElementById('pc-sidebar'); 
        this.statusContainer = document.getElementById('pc-status-panel'); 
        this.mobileTopLeft = document.getElementById('mobile-top-left');
        this.mobileBottomInfo = document.getElementById('mobile-bottom-info');
        
        this.mobileFloatingInfo = document.getElementById('mobile-floating-info'); 
        this.mobileFloatingMarket = document.getElementById('mobile-floating-market'); 
        
        this.logEl = document.getElementById('log-content'); 
        this.selectorModal = document.getElementById('selector-modal');
        this.selectorList = document.getElementById('selector-list'); 
        this.selectorContextInfo = document.getElementById('selector-context-info');
        this.selectorConfirmBtn = document.getElementById('selector-confirm-btn');
        this.cutinOverlay = document.getElementById('cutin-overlay');
        this.cutinMessage = document.getElementById('cutin-message'); 
        this.quantityModal = document.getElementById('quantity-modal');
        this.quantityContainer = document.getElementById('quantity-container'); 
        this.quantityConfirmBtn = document.getElementById('quantity-confirm-btn');
        this.mapGuide = document.getElementById('map-guide'); 
        this.prisonerModal = document.getElementById('prisoner-modal');
        this.prisonerList = document.getElementById('prisoner-list'); 
        this.successionModal = document.getElementById('succession-modal');
        this.successionList = document.getElementById('succession-list'); 
        this.resultModal = document.getElementById('result-modal');
        this.resultBody = document.getElementById('result-body'); 
        this.gunshiModal = document.getElementById('gunshi-modal');
        this.gunshiName = document.getElementById('gunshi-name'); 
        this.gunshiMessage = document.getElementById('gunshi-message');
        this.gunshiExecuteBtn = document.getElementById('gunshi-execute-btn');
        this.charityTypeSelector = document.getElementById('charity-type-selector');
        this.aiGuard = document.getElementById('ai-guard');
        this.tradeTypeInfo = document.getElementById('trade-type-info');
        this.scenarioScreen = document.getElementById('scenario-modal');
        this.scenarioList = document.getElementById('scenario-list');
		this.mapZoomInBtn = document.getElementById('map-zoom-in');
		this.mapZoomOutBtn = document.getElementById('map-zoom-out');
        this.historyModal = document.getElementById('history-modal');
        this.historyList = document.getElementById('history-list');
        
        this.warModal = document.getElementById('war-modal');
        this.warLog = document.getElementById('war-log');
        this.warControls = document.getElementById('war-controls');

        this.daimyoConfirmModal = document.getElementById('daimyo-confirm-modal');
        this.daimyoConfirmBody = document.getElementById('daimyo-confirm-body');

        this.unitDivideModal = document.getElementById('unit-divide-modal');

        this.onResultModalClose = null;

        if (this.resultModal) this.resultModal.addEventListener('click', (e) => { if (e.target === this.resultModal) this.closeResultModal(); });
		if (this.mapZoomInBtn) {
		    this.mapZoomInBtn.onclick = (e) => { e.stopPropagation(); this.changeMapZoom(1); };
		}
		if (this.mapZoomOutBtn) {
		    this.mapZoomOutBtn.onclick = (e) => { e.stopPropagation(); this.changeMapZoom(-1); };
		}

        this.initMapDrag();
        this.initContextMenu();
        this.initSidebarResize(); 
		// ダブルタップによるズームを禁止する呪文
		let lastTouchEnd = 0;
		document.addEventListener('touchend', (event) => {
		    const now = (new Date()).getTime();
		    if (now - lastTouchEnd <= 600) {
		        event.preventDefault(); // 0.6秒以内の2回タップを「無効」にします
		    }
		    lastTouchEnd = now;
		}, false);
		
		// ★ スマホブラウザ全体の2本指拡大（ピンチズーム）を禁止する強力な呪文
		document.addEventListener('touchmove', (e) => {
		    if (e.touches.length > 1) {
		        e.preventDefault();
		    }
		}, { passive: false });
		
		const titleScreen = document.getElementById('title-screen');
		const tapMessage = document.getElementById('tap-to-proceed');
		const menuButtons = document.getElementById('menu-buttons');

		if (titleScreen && tapMessage && menuButtons) {
		    // 画面がクリック（タップ）された時の処理
		    const onTitleClick = () => {
		        if (window.AudioManager) {
			        window.AudioManager.playBGM('SC_ex_Town1_Castle.ogg');
			    }
		        
		        // メッセージを消す
		        tapMessage.classList.add('hidden');
		        // ボタンを表示する
		        menuButtons.classList.remove('hidden');
		        // 一回動いたら、この命令はもう使わないので消します
		        titleScreen.removeEventListener('click', onTitleClick);
		    };

		    // 画面全体に「クリックを監視してね」と命令します
		    titleScreen.addEventListener('click', onTitleClick);
		}
		
        document.addEventListener('wheel', (e) => {
            // カクカクスクロールするリストの箱を探します
            const listObj = e.target.closest('.list-container, .result-body, #divide-list, .daimyo-list-container, .faction-list-container');
            if (listObj) {
                // いつもの「複数行一気にスクロールしちゃう動き」を強制ストップ！
                e.preventDefault();
                // ホイールを回した方向に、ほんの少しだけ動かします。
                // あとは「カクカクスクロール（scroll-snap）」の魔法が、次の1行に自動でピタッと吸い寄せてくれます！
                listObj.scrollBy({ top: Math.sign(e.deltaY) * 30, behavior: 'smooth' });
            }
        }, { passive: false });
        
        // =========================================================
        // ★ マウスドラッグでスマホみたいにスクロールさせる魔法
        // =========================================================
        let isListMouseDown = false;
        let hasListDragged = false;
        let listStartY = 0;
        let listStartScrollY = 0;
        let currentDragList = null;
        let lastDragDelta = 0; // ★追加：最後に動かした方向を記憶する箱

        document.addEventListener('mousedown', (e) => {
            const listObj = e.target.closest('.list-container, .result-body, #divide-list, .daimyo-list-container, .faction-list-container');
            if (listObj) {
                const rect = listObj.getBoundingClientRect();
                const isScrollbar = (e.clientX > rect.right - 20); 
                
                if (!isScrollbar) {
                    isListMouseDown = true;
                    hasListDragged = false;
                    currentDragList = listObj;
                    listStartY = e.pageY;
                    listStartScrollY = listObj.scrollTop;
                    lastDragDelta = 0; // 記憶をリセット
                }
            }
        });

        document.addEventListener('mousemove', (e) => {
            if (!isListMouseDown || !currentDragList) return;
            const walk = (e.pageY - listStartY) * 1.2; 
            
            if (Math.abs(walk) > 5) {
                hasListDragged = true;
                document.body.style.userSelect = 'none';
                currentDragList.style.scrollSnapType = 'none';
                currentDragList.scrollTop = listStartScrollY - walk;
                lastDragDelta = walk; // ★追加：どちらにどれくらいドラッグしたか記憶！
            }
        });

        const endListDrag = () => {
            if (isListMouseDown) {
                if (currentDragList && hasListDragged) {
                    currentDragList.style.scrollSnapType = 'y mandatory';
                    document.body.style.userSelect = '';
                    
                    // ★変更：ドラッグした方向に向かって、素直にピタッと吸い寄せる魔法！
                    // （lastDragDelta がマイナス ＝ マウスを上に動かした ＝ リストを下へ見ようとした）
                    if (lastDragDelta < 0) {
                        currentDragList.scrollBy({ top: 15, behavior: 'smooth' }); // 下の項目へ吸着！
                    } else {
                        currentDragList.scrollBy({ top: -15, behavior: 'smooth' }); // 上の項目へ吸着！
                    }
                }
                isListMouseDown = false;
                currentDragList = null;
            }
        };

        document.addEventListener('mouseup', endListDrag);

        document.addEventListener('click', (e) => {
            if (hasListDragged) {
                e.stopPropagation();
                e.preventDefault();
                hasListDragged = false; 
            }
        }, true);
        // =========================================================

    }
    
    initSidebarResize() {
        const sidebar = document.getElementById('pc-sidebar');
        const resizer = document.getElementById('sidebar-resizer');
        if (!sidebar || !resizer) return; 

        let isResizing = false;

        resizer.addEventListener('mousedown', (e) => {
            isResizing = true;
            document.body.style.cursor = 'col-resize'; 
            e.preventDefault(); 
        });

        document.addEventListener('mousemove', (e) => {
            if (!isResizing) return;
            const newWidth = document.body.clientWidth - e.clientX;
            if (newWidth >= 280 && newWidth <= 800) {
                sidebar.style.width = `${newWidth}px`;
            }
        });

        document.addEventListener('mouseup', () => {
            if (isResizing) {
                isResizing = false;
                document.body.style.cursor = ''; 
            }
        });
    }

    showDialog(msg, isConfirm, onOk, onCancel = null) {
        if (this.aiGuard) this.aiGuard.classList.add('hidden');
        const modal = document.getElementById('dialog-modal');
        const msgEl = document.getElementById('dialog-message');
        const okBtn = document.getElementById('dialog-btn-ok');
        const cancelBtn = document.getElementById('dialog-btn-cancel');

        if (!modal) {
            if (isConfirm) {
                if (confirm(msg)) { if (onOk) onOk(); } else { if (onCancel) onCancel(); }
            } else {
                alert(msg);
                if (onOk) onOk();
            }
            return;
        }

        msgEl.innerHTML = msg.replace(/\n/g, '<br>');
        
        okBtn.onclick = () => {
            modal.classList.add('hidden'); 
            if (onOk) onOk();              
        };

        if (isConfirm) {
            cancelBtn.classList.remove('hidden'); 
            cancelBtn.onclick = () => {
                modal.classList.add('hidden');
                if (onCancel) onCancel();
            };
        } else {
            cancelBtn.classList.add('hidden'); 
        }

        modal.classList.remove('hidden');
    }

    getStatusBarHTML(value, max, colorType, isVisible) {
        let percent = 0;
        let fillClass = colorType === 'blue' ? 'bar-fill-blue' : 'bar-fill-lightblue';
        let emptyBgClass = ''; 
        let displayText = value;

        if (!isVisible) {
            percent = 0;
            emptyBgClass = 'status-bar-empty-bg';
            displayText = "？";
        } else if (max > 0) {
            percent = (value / max) * 100;
            if (percent > 100) percent = 100;
            if (percent < 0) percent = 0;
        } else {
            percent = 0;
            emptyBgClass = 'status-bar-empty-bg';
        }

        return `
            <div class="status-bar-container ${emptyBgClass}">
                <div class="status-bar-fill ${fillClass}" style="width: ${percent}%;"></div>
                <div class="status-bar-text">${displayText}</div>
            </div>
        `;
    }

    initMapDrag() {
        this.isDraggingMap = false;
        this.dragStartX = 0;
        this.dragStartY = 0;
        this.scrollLeft = 0;
        this.scrollTop = 0;
        this.isMouseDown = false;
        
        const sc = document.getElementById('map-scroll-container');
        if (!sc) return;

        sc.addEventListener('mousedown', (e) => {
            if (e.button !== 0) return; 
            this.isMouseDown = true;
            this.isDraggingMap = false;
            this.dragStartX = e.pageX - sc.offsetLeft;
            this.dragStartY = e.pageY - sc.offsetTop;
            this.scrollLeft = sc.scrollLeft;
            this.scrollTop = sc.scrollTop;
            sc.classList.add('grabbing');
        });

        sc.addEventListener('mouseleave', () => {
            this.isMouseDown = false;
            sc.classList.remove('grabbing');
        });

        sc.addEventListener('mouseup', () => {
            this.isMouseDown = false;
            sc.classList.remove('grabbing');
            setTimeout(() => {
                this.isDraggingMap = false;
            }, 50);
        });

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
        });
        
        // =========================================================
        // ★ マウスホイールでマップを拡大縮小する魔法（PC用）
        // =========================================================
        let isZooming = false; // ★追加：連続ズームを防ぐストッパー
        sc.addEventListener('wheel', (e) => {
            if (document.body.classList.contains('is-pc')) {
                e.preventDefault(); 
                if (isZooming) return; // ズーム中は次の命令を無視します！
                
                isZooming = true;
                setTimeout(() => { isZooming = false; }, 350); // アニメーションが終わるまで待つ

                if (e.deltaY < 0) this.changeMapZoom(1, e.clientX, e.clientY);       
                else if (e.deltaY > 0) this.changeMapZoom(-1, e.clientX, e.clientY); 
            }
        }, { passive: false });

        // =========================================================
        // ★ 2本指のピンチ操作でマップを拡大縮小する魔法（スマホ用）
        // =========================================================
        let initialPinchDist = null;
        let pinchCenter = null; // ★追加：指と指の中心点を記憶する箱

        sc.addEventListener('touchstart', (e) => {
            if (e.touches.length === 2) {
                initialPinchDist = Math.hypot(
                    e.touches[0].pageX - e.touches[1].pageX,
                    e.touches[0].pageY - e.touches[1].pageY
                );
                // ★追加：指と指の真ん中の座標を計算して記録します
                pinchCenter = {
                    x: (e.touches[0].clientX + e.touches[1].clientX) / 2,
                    y: (e.touches[0].clientY + e.touches[1].clientY) / 2
                };
            }
        }, { passive: false });

        sc.addEventListener('touchmove', (e) => {
            if (e.touches.length === 2) {
                e.preventDefault(); 
                if (initialPinchDist === null) return;
                
                const currentDist = Math.hypot(
                    e.touches[0].pageX - e.touches[1].pageX,
                    e.touches[0].pageY - e.touches[1].pageY
                );
                
                const diff = currentDist - initialPinchDist;
                if (diff > 50) {
                    this.changeMapZoom(1, pinchCenter.x, pinchCenter.y);  // 中心点を指定して拡大！
                    initialPinchDist = currentDist; 
                    // ★ズームするたびに中心点も更新
                    pinchCenter = {
                        x: (e.touches[0].clientX + e.touches[1].clientX) / 2,
                        y: (e.touches[0].clientY + e.touches[1].clientY) / 2
                    };
                } else if (diff < -50) {
                    this.changeMapZoom(-1, pinchCenter.x, pinchCenter.y); // 中心点を指定して縮小！
                    initialPinchDist = currentDist;
                    pinchCenter = {
                        x: (e.touches[0].clientX + e.touches[1].clientX) / 2,
                        y: (e.touches[0].clientY + e.touches[1].clientY) / 2
                    };
                }
            }
        }, { passive: false });

        sc.addEventListener('touchend', (e) => {
            if (e.touches.length < 2) {
                initialPinchDist = null;
                pinchCenter = null; // リセット
            }
        });
    }
    
    initContextMenu() {
        this.contextMenu = document.getElementById('custom-context-menu');
        this.ctxMenuBack = document.getElementById('ctx-menu-back');
        this.ctxMenuFinish = document.getElementById('ctx-menu-finish');
        this.longPressTimer = null;

        document.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            if(this.game.warManager && this.game.warManager.state.active) return;
            this.showContextMenu(e.pageX, e.pageY);
        });

        document.addEventListener('touchstart', (e) => {
            if (e.touches.length > 1) return; 
            const touch = e.touches[0];
            const x = touch.pageX;
            const y = touch.pageY;
            
            this.longPressTimer = setTimeout(() => {
                if(this.game.warManager && this.game.warManager.state.active) return;
                this.showContextMenu(x, y);
            }, 500);
        }, { passive: true });

        document.addEventListener('touchmove', () => {
            if (this.longPressTimer) {
                clearTimeout(this.longPressTimer);
                this.longPressTimer = null;
            }
        }, { passive: true });

        document.addEventListener('touchend', () => {
            if (this.longPressTimer) {
                clearTimeout(this.longPressTimer);
                this.longPressTimer = null;
            }
        });

        document.addEventListener('click', (e) => {
            if (!this.contextMenu) return;
            if (!this.contextMenu.classList.contains('hidden')) {
                this.hideContextMenu();
            }
        });
    }

    showContextMenu(x, y) {
        if (!this.contextMenu) return;
        if (this.game.phase !== 'game' && this.game.phase !== 'daimyo_select') return;

        this.contextMenu.style.left = `${x}px`;
        this.contextMenu.style.top = `${y}px`;
        this.contextMenu.classList.remove('hidden');

        if (this.ctxMenuBack) {
            if (this.game.selectionMode) {
                this.ctxMenuBack.textContent = "戻る";
            } else {
                this.ctxMenuBack.textContent = "自拠点に戻る";
            }

            this.ctxMenuBack.onclick = (e) => {
                e.stopPropagation();
                this.hideContextMenu();
                if(this.game.isProcessingAI) return;
                
                if (this.game.selectionMode) {
                    this.cancelMapSelection(false); 
                    // ★変更：縦も横も真ん中（inline: "center"）になるように追加しました！
                    const el = document.querySelector('.castle-card.active-turn'); 
                    if(el) el.scrollIntoView({block:"center", inline: "center", behavior: "smooth"});
                } else {
                    const myCastle = this.game.getCurrentTurnCastle();
                    if (myCastle) {
                        this.showControlPanel(myCastle);
                        // ★変更：縦も横も真ん中（inline: "center"）になるように追加しました！
                        const el = document.querySelector('.castle-card.active-turn'); 
                        if(el) el.scrollIntoView({block:"center", inline: "center", behavior: "smooth"});
                    }
                }
            };
        }
        if (this.ctxMenuFinish) {
            this.ctxMenuFinish.onclick = (e) => {
                e.stopPropagation();
                this.hideContextMenu();
                if(this.game.isProcessingAI) return;
                this.showDialog("今月の命令を終了しますか？", true, () => {
                    this.game.finishTurn();
                });
            };
        }
    }

    hideContextMenu() {
        if (this.contextMenu) this.contextMenu.classList.add('hidden');
    }

    forceResetModals() {
        const modals = document.querySelectorAll('.modal');
        modals.forEach(m => {
            m.classList.add('hidden');
            m.style.display = ''; 
        });
        if(this.cutinOverlay) this.cutinOverlay.classList.add('hidden');
        if(this.warModal) this.warModal.classList.add('hidden');
        if(this.unitDivideModal) this.unitDivideModal.classList.add('hidden');
        if(this.aiGuard) this.aiGuard.classList.add('hidden'); // ★追加：リセットする時にガードも一緒に隠します
        this.hideContextMenu();
    }

    log(msg) { 
        this.logHistory.unshift(`[${this.game.year}年${this.game.month}月] ${msg}`);
        if(this.logHistory.length > 50) this.logHistory.pop();
        
        if(this.game.warManager && this.game.warManager.state.active && this.game.warManager.state.isPlayerInvolved && this.warLog) {
             const div = document.createElement('div');
             div.textContent = msg;
             this.warLog.appendChild(div);
             this.warLog.scrollTop = this.warLog.scrollHeight;
        }
    }
    
    showHistoryModal() {
        if (!this.historyModal) return;
        this.historyModal.classList.remove('hidden');
        if (this.historyList) {
            this.historyList.innerHTML = '';
            this.logHistory.forEach(log => {
                const div = document.createElement('div');
                div.textContent = log;
                div.style.borderBottom = "1px solid #eee";
                div.style.padding = "5px";
                div.style.fontSize = "0.85rem";
                this.historyList.appendChild(div);
            });
        }
    }
    
    showDaimyoList() {
        // ★ ヘッダーをスクロールの箱の中に【入れ込む】ことで、スクロールバーの食い込みズレを防ぎます！
        let listHtml = '<div class="daimyo-list-container"><div class="daimyo-list-header"><span>大名家名</span><span>当主名</span><span>戦力</span><span>城数</span><span>友好度</span><span>関係</span></div>';
        
        const activeClans = this.game.clans.filter(c => c.id !== 0 && this.game.castles.some(cs => cs.ownerClan === c.id));
        
        const clanDataList = activeClans.map(clan => {
            const castles = this.game.castles.filter(c => c.ownerClan === clan.id);
            const leader = this.game.getBusho(clan.leaderId);
            let pop = 0, sol = 0, koku = 0, gold = 0, rice = 0;
            castles.forEach(c => { pop += c.population; sol += c.soldiers; koku += c.kokudaka; gold += c.gold; rice += c.rice; });
            const power = Math.floor(pop / 2000) + Math.floor(sol / 20) + Math.floor(koku / 20) + Math.floor(gold / 50) + Math.floor(rice / 100);
            return {
                id: clan.id, name: clan.name, leaderName: leader ? leader.name : "不明",
                power: power, castlesCount: castles.length
            };
        });

        clanDataList.sort((a,b) => b.power - a.power);

        clanDataList.forEach(d => {
            let friendScore = "-";
            let friendStatus = "-";
            
            if (d.id !== this.game.playerClanId) {
                const relation = this.game.getRelation(this.game.playerClanId, d.id);
                if (relation) {
                    friendScore = relation.sentiment;
                    friendStatus = relation.status;
                }
            }

            // ★名前を左寄せにするための目印（col-daimyo-name など）をつけます
            listHtml += `<div class="daimyo-list-item"><span class="col-daimyo-name" style="font-weight:bold;">${d.name}</span><span class="col-leader-name">${d.leaderName}</span><span style="color:#d32f2f; font-weight:bold;">${d.power}</span><span>${d.castlesCount}</span><span style="color:#1976d2;">${friendScore}</span><span>${friendStatus}</span></div>`;
        });
        listHtml += '</div>';
        
        // 結果画面のタイトル部分にくっつけて表示します
        this.showResultModal(`<h3 style="margin-top:0; border-bottom: 2px solid #ddd; padding-bottom: 10px; flex-shrink:0;">大名一覧</h3>${listHtml}`, () => {
            // ★ ウインドウを閉じる時に、外側の箱の魔法を解除します
            if (this.resultBody) {
                this.resultBody.style.overflowY = '';
                this.resultBody.style.display = '';
                this.resultBody.style.flexDirection = '';
            }
        });

        // ★ 大名一覧を開いている間だけ、外側の箱のスクロールを消して内側だけを動かします！
        if (this.resultBody) {
            this.resultBody.style.overflowY = 'hidden';
            this.resultBody.style.display = 'flex';
            this.resultBody.style.flexDirection = 'column';
        }
    }

    showFactionList(clanId, isDirect = false) {
        const clan = this.game.clans.find(c => c.id === clanId);
        if (!clan) return;

        const bushos = this.game.bushos.filter(b => b.clan === clanId && b.status === 'active');
        const factions = {};
        
        bushos.forEach(b => {
            const fId = b.factionId;
            if (!factions[fId]) {
                factions[fId] = { count: 0, leader: null };
            }
            factions[fId].count++;
            if (b.isFactionLeader) { factions[fId].leader = b; }
        });

        const fIds = Object.keys(factions).map(Number).filter(id => id !== 0);
        let nonFactionCount = factions[0] ? factions[0].count : 0;
        
        // ★ 無派閥を右上に出し、表のヘッダーを作ります（改行をなくして1行に繋げます！）
        let listHtml = `<div style="text-align:right; font-weight:bold; color:#555; font-size:0.9rem; margin-bottom:5px;">無派閥: ${nonFactionCount}名</div><div class="faction-list-container"><div class="faction-list-header"><span>派閥主</span><span>武将数</span><span>性格</span><span>方針</span></div>`;
        
        if (fIds.length === 0) {
            listHtml += `<div style="padding:10px;">派閥はありません。</div>`;
        } else {
            fIds.forEach(fId => {
                const fData = factions[fId];
                const leader = fData.leader;
                let leaderName = leader ? leader.name : "不明";
                let count = fData.count;
                let seikaku = "不明";
                let hoshin = "不明";
                
                if (leader) {
                    const mil = (leader.leadership + leader.strength) / 2;
                    const pol = (leader.politics + leader.diplomacy) / 2;
                    if (mil > pol * 1.2) seikaku = "武闘派";
                    else if (pol > mil * 1.2) seikaku = "穏健派";
                    else seikaku = "中道";
                    
                    const inn = leader.innovation || 0;
                    if (inn >= 66) hoshin = "革新派";
                    else if (inn >= 36) hoshin = "中道";
                    else hoshin = "保守派";
                }
                
                // ★ ここも改行をなくして1行に繋げます！
                listHtml += `<div class="faction-list-item"><strong class="col-faction-name">${leaderName}</strong><span>${count}</span><span style="color:${seikaku === '武闘派' ? '#d32f2f' : (seikaku === '穏健派' ? '#1976d2' : '#388e3c')};">${seikaku}</span><span style="color:${hoshin === '革新派' ? '#e91e63' : (hoshin === '保守派' ? '#795548' : '#388e3c')};">${hoshin}</span></div>`;
            });
        }
        listHtml += `</div>`;

        let customFooter = "";
        if (isDirect) {
            customFooter = `<button class="btn-primary" onclick="window.GameApp.ui.closeResultModal()">閉じる</button>`;
        } else {
            customFooter = `<button class="btn-secondary" onclick="window.GameApp.ui.showDaimyoList()">戻る</button>`;
        }
        
        this.showResultModal(`<h3 style="margin-top:0; border-bottom: 2px solid #ddd; padding-bottom: 10px; flex-shrink:0;">${clan.name} 派閥一覧</h3>${listHtml}`, () => {
            // ウインドウを閉じる時に外側の箱の魔法を解除します
            if (this.resultBody) {
                this.resultBody.style.overflowY = '';
                this.resultBody.style.display = '';
                this.resultBody.style.flexDirection = '';
            }
        }, customFooter);

        // 表を開いている間だけ、外側の箱のスクロールを消して内側だけを動かします
        if (this.resultBody) {
            this.resultBody.style.overflowY = 'hidden';
            this.resultBody.style.display = 'flex';
            this.resultBody.style.flexDirection = 'column';
        }
    }

    showResultModal(msg, onClose = null, customFooterHtml = null) { 
        if (this.aiGuard) this.aiGuard.classList.add('hidden');
        if (this.resultBody) this.resultBody.innerHTML = msg.replace(/\n/g, '<br>'); 
        const footer = document.getElementById('result-footer');
        if (footer) {
            if (customFooterHtml !== null) {
                footer.innerHTML = customFooterHtml;
            } else {
                footer.innerHTML = `<button class="btn-primary" onclick="window.GameApp.ui.closeResultModal()">閉じる</button>`;
            }
        }
        if (this.resultModal) this.resultModal.classList.remove('hidden'); 
        this.onResultModalClose = onClose;
    }
    
    closeResultModal() { 
        if (this.resultModal) this.resultModal.classList.add('hidden'); 
        
        if (this.onResultModalClose) {
            const cb = this.onResultModalClose;
            this.onResultModalClose = null;
            cb();
        } else if (this.game) {
            this.game.checkAllActionsDone();
        }
    }
    
    closeSelector() { 
        if (this.selectorModal) this.selectorModal.classList.add('hidden'); 
        // ★追加：ウインドウを閉じる時に、必ず決定ボタンを元の押せる状態にリセットします
        if (this.selectorConfirmBtn) {
            this.selectorConfirmBtn.disabled = false;
            this.selectorConfirmBtn.style.opacity = 1.0;
        }
    }

    showCutin(msg) { 
        return new Promise((resolve) => {
            if (this.cutinMessage) this.cutinMessage.textContent = msg; 
            if (this.cutinOverlay) {
                this.cutinOverlay.classList.remove('hidden'); 
                this.cutinOverlay.classList.add('fade-in'); 
                
                setTimeout(() => { 
                    this.cutinOverlay.classList.remove('fade-in'); 
                    this.cutinOverlay.classList.add('fade-out'); 
                    
                    setTimeout(() => { 
                        this.cutinOverlay.classList.add('hidden'); 
                        this.cutinOverlay.classList.remove('fade-out'); 
                        resolve();
                    }, 500); 
                }, 2000); 
            } else {
                resolve();
            }
        });
    }
    
    showScenarioSelection(scenarios, onSelect) {
        this.forceResetModals();
        if (!this.scenarioScreen) return;
        this.scenarioScreen.classList.remove('hidden'); 
        if (this.scenarioList) {
            this.scenarioList.innerHTML = '';
            scenarios.forEach(s => {
                const div = document.createElement('div'); div.className = 'clan-btn';
                div.innerHTML = `<div style="text-align:left;"><strong>${s.name}</strong><br><small>${s.desc}</small></div>`;
                div.onclick = () => { this.scenarioScreen.classList.add('hidden'); onSelect(s.folder); };
                this.scenarioList.appendChild(div);
            });
        }
    }
    returnToTitle() { 
        this.forceResetModals();
        const ts = document.getElementById('title-screen');
        if(ts) ts.classList.remove('hidden'); 
    }
    
    showDaimyoConfirmModal(clanName, soldiers, leader, onStart) {
        if (!this.daimyoConfirmModal) return;
        this.daimyoConfirmModal.classList.remove('hidden');
        
        let faceHtml = "";
        if (leader && leader.faceIcon) {
            faceHtml = `<img src="data/faceicons/${leader.faceIcon}" class="daimyo-confirm-face" onerror="this.style.display='none'">`;
        }

        if (this.daimyoConfirmBody) {
            this.daimyoConfirmBody.innerHTML = `
                <h3 style="margin-top:0;">${clanName}</h3>
                ${faceHtml}
                <p>この大名家でゲームを開始しますか？</p>
                <p><strong>総兵士数: ${soldiers}</strong></p>
            `;
        }
        
        const startBtn = document.getElementById('daimyo-confirm-start-btn');
        if (startBtn) {
            startBtn.onclick = () => {
                this.daimyoConfirmModal.classList.add('hidden');
                onStart();
            };
        }
        const backBtn = document.getElementById('daimyo-confirm-back-btn');
        if (backBtn) {
            backBtn.onclick = () => {
                this.daimyoConfirmModal.classList.add('hidden');
            };
        }
    }
    
    fitMapToScreen() {
        if (!this.mapEl) return;
        const wrapper = document.getElementById('map-wrapper');
        const container = this.mapEl;
        const maxX = Math.max(...this.game.castles.map(c => c.x)) + 2;
        const maxY = Math.max(...this.game.castles.map(c => c.y)) + 2;
        const tileSize = 80;
        const gap = 10;
        const mapW = maxX * (tileSize + gap);
        const mapH = maxY * (tileSize + gap);
        
        container.style.width = `${mapW}px`;
        container.style.height = `${mapH}px`;
        
        const scaleX = wrapper.clientWidth / mapW;
        const scaleY = wrapper.clientHeight / mapH;
        
        // ★変更1：余白を少し戻して（ズームを少し大きくして）画面にピッタリ合わせます
        let minScale = Math.min(scaleX, scaleY); 
        if (document.body.classList.contains('is-pc')) {
            minScale *= 0.90; // PCは元々の丁度よかったサイズに戻します
        } else {
            minScale *= 0.82; // スマホは小さくしすぎたので、見切れないギリギリのサイズに調整します！
        }
        
        // ★変更2：最大サイズを計算します（スマホは1.0、PCはウィンドウサイズに合わせて現在の2倍くらいに！）
        let maxScale = 1.0;
        if (document.body.classList.contains('is-pc')) {
            // PCのウィンドウ幅に合わせて、大体2.0倍くらいになるように計算します
            maxScale = Math.max(1.5, wrapper.clientWidth / 600); 
            if (maxScale > 2.5) maxScale = 2.5; // 大きくなりすぎないためのストッパー
        }

        this.zoomStages = [
            minScale,              
            (minScale + maxScale) / 2,  
            maxScale                    
        ];
        
        // ★変更3：大名選択の時は、最初から一番引いた状態（最小ズーム）でスタート！
        if (this.game.phase === 'daimyo_select') {
            this.zoomLevel = 0; 
        } else {
            this.zoomLevel = 1; 
        }
        this.mapScale = this.zoomStages[this.zoomLevel];
        
        this.applyMapScale();
        this.updateZoomButtons(); 
    }

    applyMapScale() {
        if(this.mapEl) {
            this.mapEl.style.transform = `scale(${this.mapScale})`;
            
            // ★ スクロール領域のはみ出し（透明な余白）を消し去る魔法
            const mapW = this.mapEl.offsetWidth;
            const mapH = this.mapEl.offsetHeight;
            const sc = document.getElementById('map-scroll-container');
            
            if (mapW && mapH && sc) {
                // transform: scale によって出来てしまう余白のサイズを計算
                const diffX = (mapW - mapW * this.mapScale) / 2;
                const diffY = (mapH - mapH * this.mapScale) / 2;
                
                // スクロールエリアの大きさ（パディング 20px * 2 を引いた実際の広さ）
                const scW = sc.clientWidth - 40; 
                const scH = sc.clientHeight - 40;
                
                // 実際の見た目のマップサイズ
                const scaledW = mapW * this.mapScale;
                const scaledH = mapH * this.mapScale;
                
                // 基本はマイナスのマージンで余白を相殺
                let marginX = -diffX;
                let marginY = -diffY;
                
                // もし画面よりマップの方が小さければ、中央に寄せるためにプラスの余白を足す
                if (scaledW < scW) {
                    marginX += (scW - scaledW) / 2;
                }
                if (scaledH < scH) {
                    marginY += (scH - scaledH) / 2;
                }
                
                this.mapEl.style.margin = `${marginY}px ${marginX}px`;
            }
        }
    }
    
    changeMapZoom(delta, cx = null, cy = null) {
        if (this.isAnimatingZoom) return; // アニメーション中は次のズームを無視！
        
        const oldLevel = this.zoomLevel;
        this.zoomLevel += delta;
        if (this.zoomLevel < 0) this.zoomLevel = 0;
        if (this.zoomLevel > 2) this.zoomLevel = 2;
        
        if (this.zoomLevel === oldLevel) return; // 限界ならストップ

        const oldScale = this.mapScale;
        const targetScale = this.zoomStages[this.zoomLevel];
        this.mapScale = targetScale;

        const sc = document.getElementById('map-scroll-container');
        
        if (sc && cx !== null && cy !== null) {
            this.isAnimatingZoom = true;
            
            const rect = sc.getBoundingClientRect();
            // コンテナ内でのマウス・指の相対座標
            const relX = cx - rect.left;
            const relY = cy - rect.top;

            // ★ 記事の理論の核心：マウスが指しているマップの「絶対座標（スケール1の時の本来の位置）」を逆算します！
            const mapBaseX = (sc.scrollLeft + relX) / oldScale;
            const mapBaseY = (sc.scrollTop + relY) / oldScale;

            const duration = 250; // アニメーション時間（0.25秒）
            const startTime = performance.now();

            // JSで1秒間に60回、スケールとスクロール位置を同期させる最強のアニメーション魔法
            const animate = (currentTime) => {
                const elapsed = currentTime - startTime;
                let progress = elapsed / duration;
                if (progress > 1) progress = 1;
                
                // イージング関数（最初早く、最後ゆっくり「ぬるっと」止まる）
                const easeOut = 1 - Math.pow(1 - progress, 3);
                
                // 現在のコマのスケールを計算
                const currentScale = oldScale + (targetScale - oldScale) * easeOut;
                
                // マップの見た目を大きく（小さく）する
                this.mapEl.style.transform = `scale(${currentScale})`;
                
                // ★ スケールが変わっても、マウス位置の「絶対座標」が常に画面の同じ場所(relX, relY)に来るようにスクロールを合わせ続ける！
                sc.scrollLeft = (mapBaseX * currentScale) - relX;
                sc.scrollTop = (mapBaseY * currentScale) - relY;

                if (progress < 1) {
                    requestAnimationFrame(animate); // まだアニメーション中なら次も呼ぶ
                } else {
                    // アニメーション完了時に、はみ出し防止の margin などを綺麗に再計算する
                    this.applyMapScale();
                    this.updateZoomButtons();
                    this.isAnimatingZoom = false;
                }
            };
            requestAnimationFrame(animate);
        } else {
            // マウス座標がない場合（ボタンでのズーム等）は中央基準で一気に変更
            this.applyMapScale();
            this.updateZoomButtons();
        }
    }

    updateZoomButtons() {
        if (!this.mapZoomInBtn || !this.mapZoomOutBtn) return;
        
        this.mapZoomInBtn.style.display = (this.zoomLevel >= 2) ? 'none' : 'flex';
        this.mapZoomOutBtn.style.display = (this.zoomLevel <= 0) ? 'none' : 'flex';
    }
    
    showCastleMenuModal(castle) {
        const modal = document.getElementById('castle-menu-modal');
        if (!modal) return;
        modal.classList.remove('hidden'); 
        
        const btnBusho = document.getElementById('btn-busho-list');
        if (btnBusho) {
            btnBusho.onclick = () => {
                modal.classList.add('hidden'); 
                this.openBushoSelector('view_only', castle.id, null, () => { this.showCastleMenuModal(castle); }); 
            };
        }

        const btnKunishu = document.getElementById('btn-kunishu-list');
        if (btnKunishu) {
            const kunishus = this.game.kunishuSystem.getKunishusInCastle(castle.id);
            if (kunishus && kunishus.length > 0) {
                btnKunishu.style.display = ''; 
                btnKunishu.onclick = () => {
                    modal.classList.add('hidden'); 
                    this.showKunishuSelector(
                        kunishus, 
                        null, 
                        () => { this.showCastleMenuModal(castle); },
                        true 
                    );
                };
            } else {
                btnKunishu.style.display = 'none'; 
            }
        }
    }
    
    renderMap() {
        if (!this.mapEl) return;
        this.mapEl.innerHTML = ''; 
        
        if (!this.hasInitializedMap && this.game.castles.length > 0) {
            this.fitMapToScreen();
            this.hasInitializedMap = true;
            
            const sc = document.getElementById('map-scroll-container');
            if (sc) {
                setTimeout(() => {
                    sc.scrollTop = (sc.scrollHeight - sc.clientHeight) / 2;
                    sc.scrollLeft = (sc.scrollWidth - sc.clientWidth) / 2;
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
                this.mapGuide.textContent = "開始する大名家の城を選択してください";
            } else {
                this.mapGuide.classList.add('hidden'); 
            }
        }
        if (this.aiGuard) { if (this.game.isProcessingAI) this.aiGuard.classList.remove('hidden'); else this.aiGuard.classList.add('hidden'); }

        this.updateInfoPanel(this.currentCastle || this.game.getCurrentTurnCastle());

        this.game.castles.forEach(c => {
            const el = document.createElement('div'); el.className = 'castle-card';
            el.dataset.clan = c.ownerClan; el.style.setProperty('--c-x', c.x + 1); el.style.setProperty('--c-y', c.y + 1);
            if (c.isDone) el.classList.add('done'); if (this.game.getCurrentTurnCastle() === c && !c.isDone) el.classList.add('active-turn');
            const castellan = this.game.getBusho(c.castellanId); const clanData = this.game.clans.find(cl => cl.id === c.ownerClan);
            
            const isVisible = isDaimyoSelect || this.game.isCastleVisible(c);
            
            const soldierText = isVisible ? c.soldiers : "不明"; 
            const castellanName = castellan ? castellan.name : '-';            
            
            el.innerHTML = `<div class="card-header"><h3>${c.name}</h3></div><div class="card-owner">${clanData ? clanData.name : "中立"}</div><div class="param-grid"><div class="param-item"><span>城主</span> <strong>${castellanName}</strong></div><div class="param-item"><span>兵数</span> ${soldierText}</div></div>`;
            if(clanData) el.style.borderTop = `5px solid ${clanData.color}`;
            
            if (isDaimyoSelect) {
                 el.style.cursor = 'pointer';
                 if (c.ownerClan === 0) {
                     el.classList.add('dimmed');
                 } else {
                     el.classList.add('selectable-target'); 
                 }
                 el.onclick = (e) => {
                     e.stopPropagation();
                     if (this.isDraggingMap) return;
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

                        // ★変更：自動拡大（ズーム）の魔法を消して、いつでもすぐにメニューを開くようにしました！
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
            this.mapEl.appendChild(el);
        });
    }

    updatePanelHeader() { 
        if (!this.currentCastle) return; 
        if(this.statusContainer) {
            this.statusContainer.innerHTML = ''; 
        }
        this.updateInfoPanel(this.currentCastle);
    }

    updateInfoPanel(castle) {
        if (!castle) return;
        if (this.game.phase === 'daimyo_select') return;
        
        const isVisible = this.game.isCastleVisible(castle);
        
        const mask = (val) => isVisible ? val : "不明";
        const maskPop = (val) => isVisible ? `${val}人` : "不明";
        
        const castellan = this.game.getBusho(castle.castellanId);
        const clanData = this.game.clans.find(cd => cd.id === castle.ownerClan);
        const clanName = clanData ? clanData.name : "中立";
        const castellanName = castellan ? castellan.name : "-";
        
        let faceHtml = "";
        if (castellan && castellan.faceIcon) {
            faceHtml = `<img src="data/faceicons/${castellan.faceIcon}" onerror="this.style.display='none'">`;
        }

        let content = `
            <div class="sp-info-header">
                <span class="sp-clan">${clanName}</span>
                <span class="sp-castle">${castle.name}</span>
                <span class="sp-lord-label">城主</span>
                <span class="sp-lord-name">${castellanName}</span>
            </div>
            <div class="sp-info-body">
                <div class="sp-face-wrapper">${faceHtml}</div>
                <div class="sp-params-grid">
                    <div class="sp-label">石高</div><div class="sp-val">${this.getStatusBarHTML(castle.kokudaka, castle.maxKokudaka, 'blue', isVisible)}</div>
                    <div class="sp-label">訓練</div><div class="sp-val">${this.getStatusBarHTML(castle.training, 100, 'lightblue', isVisible)}</div>
                    <div class="sp-label">騎馬</div><div class="sp-val-right">${mask(castle.horses || 0)}</div>
                    
                    <div class="sp-label">鉱山</div><div class="sp-val">${this.getStatusBarHTML(castle.commerce, castle.maxCommerce, 'blue', isVisible)}</div>
                    <div class="sp-label">士気</div><div class="sp-val">${this.getStatusBarHTML(castle.morale, 100, 'lightblue', isVisible)}</div>
                    <div class="sp-label">鉄砲</div><div class="sp-val-right">${mask(castle.guns || 0)}</div>
                    
                    <div class="sp-label">民忠</div><div class="sp-val">${this.getStatusBarHTML(castle.peoplesLoyalty, castle.maxPeoplesLoyalty, 'lightblue', isVisible)}</div>
                    <div class="sp-label">防御</div><div class="sp-val">${this.getStatusBarHTML(castle.defense, castle.maxDefense, 'lightblue', isVisible)}</div>
                    <div class="sp-empty"></div><div class="sp-empty"></div>
                    
                    <div class="sp-label">人口</div><div class="sp-val-left" style="grid-column: 2 / span 5;">${maskPop(castle.population)}</div>
                </div>
            </div>
            <div class="sp-info-footer">
                <span>金　${mask(castle.gold)}</span>
                <span>兵糧　${mask(castle.rice)}</span>
                <span>兵数　${mask(castle.soldiers)}</span>
            </div>
        `;

        if (this.mobileTopLeft) {
            this.mobileTopLeft.innerHTML = content;
        }

        if (this.statusContainer && window.innerWidth >= 769) {
            this.statusContainer.innerHTML = content;
        }

        if (this.mobileFloatingInfo) {
            this.mobileFloatingInfo.innerHTML = `
                <div class="floating-time">${this.game.year}年 ${this.game.month}月</div>
            `;
        }

        if (this.mobileFloatingMarket) {
            this.mobileFloatingMarket.innerHTML = `
                <div class="floating-market">米相場 ${this.game.marketRate.toFixed(1)}</div>
            `;
        }

        const cmdGrid = document.getElementById('command-area');
        if(cmdGrid) {
            cmdGrid.style.display = 'grid'; 
        }
        if (this.mobileBottomInfo) {
            this.mobileBottomInfo.innerHTML = ``; 
        }
    }

    showControlPanel(castle) { 
        this.currentCastle = castle; 
        
        if (Number(castle.ownerClan) === Number(this.game.playerClanId)) {
            this.game.isProcessingAI = false;
        }

        if(this.panelEl) this.panelEl.classList.remove('hidden');
        this.updatePanelHeader(); 
        
        if (Number(castle.ownerClan) === Number(this.game.playerClanId)) {
             if (!this.game.selectionMode) {
                 if (this.game.getCurrentTurnCastle() === castle) {
                     this.menuState = 'MAIN';
                     this.renderCommandMenu(); 
                 } else {
                     this.renderEnemyViewMenu();
                 }
             }
        } else {
            this.renderEnemyViewMenu();
        }
    }

    renderEnemyViewMenu() {
        const mobileArea = document.getElementById('command-area');
        const pcArea = document.getElementById('pc-command-area');
        const areas = [mobileArea, pcArea];
        areas.forEach(area => {
            if(!area) return;
            area.innerHTML = '';
            
            // ★変更：スマホ(mobileArea)だけでなく、PC版でもボタンを作るように「if」を消しました！
            const btn = document.createElement('button');
            btn.className = 'cmd-btn back';
            btn.textContent = "自拠点へ戻る";
            btn.onclick = () => {
                if(this.game.isProcessingAI) return;
                const myCastle = this.game.getCurrentTurnCastle();
                this.showControlPanel(myCastle);
                // ★変更：現在ターンの自分の城を探して、縦も横も真ん中に持ってくるように直しました！
                const el = document.querySelector('.castle-card.active-turn'); 
                if(el) el.scrollIntoView({block:"center", inline: "center", behavior: "smooth"});
            };
            area.appendChild(btn);
        });
    }

    cancelMapSelection(keepMenuState = false) { 
        this.game.selectionMode = null; 
        this.game.validTargets = []; 
        this.renderMap();
        if (!keepMenuState) {
            if (this.game.lastMenuState) {
                this.menuState = this.game.lastMenuState;
                this.game.lastMenuState = null;
            } else {
                this.menuState = 'MAIN';
            }
            this.renderCommandMenu();
        }
    }

    renderCommandMenu() {
        const mobileArea = document.getElementById('command-area');
        const pcArea = document.getElementById('pc-command-area');
        const areas = [mobileArea, pcArea];
        
        const CATEGORY_MAP = {
            'DEVELOP': "内政", 'MILITARY': "軍事", 
            'DIPLOMACY': "外交", 'STRATEGY': "調略", 
            'PERSONNEL': "人事", 'INFO': "情報"
        };
        
        areas.forEach(area => {
            if(!area) return;
            area.innerHTML = '';
            
            const createBtn = (label, cls, onClick) => { 
                const btn = document.createElement('button'); 
                btn.className = `cmd-btn ${cls || ''}`; 
                btn.textContent = label; 
                btn.onclick = () => {
                    if (this.game.isProcessingAI) return;
                    this.cancelMapSelection(true);
                    onClick();
                }; 
                area.appendChild(btn); 
            };
            
            const cmd = (type) => this.game.commandSystem.startCommand(type);
            const menu = (targetMenu) => { this.menuState = targetMenu; this.renderCommandMenu(); };
            
            if (this.menuState === 'MAIN') {
                Object.keys(CATEGORY_MAP).forEach(key => {
                    createBtn(CATEGORY_MAP[key], "category", () => menu(key));
                });
                
                const sysBtn = document.createElement('button');
                sysBtn.className = `cmd-btn category`;
                sysBtn.textContent = "機能";
                sysBtn.style.gridColumn = "span 1";
                sysBtn.style.marginTop = "2px"; 
                sysBtn.onclick = () => {
                    if (this.game.isProcessingAI) return;
                    this.cancelMapSelection(true);
                    menu('SYSTEM');
                };
                area.appendChild(sysBtn);

                const finishBtn = document.createElement('button');
                finishBtn.className = `cmd-btn finish`;
                finishBtn.textContent = "命令終了";
                finishBtn.style.gridColumn = "span 2";
                finishBtn.onclick = () => {
                    if (this.game.isProcessingAI) return;
                    this.cancelMapSelection(true);
                    this.showDialog("今月の命令を終了しますか？", true, () => {
                        this.game.finishTurn();
                    });
                };
                area.appendChild(finishBtn);
                
                return;
            }

            const specs = this.game.commandSystem.getSpecs();
            const relevantCommands = Object.entries(specs).filter(([, s]) => s.category === this.menuState);

            relevantCommands.forEach(([key, spec]) => {
                createBtn(spec.label, "", () => cmd(key));
            });

            if (this.menuState === 'MILITARY') {
                createBtn("取引", "category", () => menu('MIL_TRADE'));
            }

            const emptyCount = 3 - ((relevantCommands.length + (this.menuState === 'MILITARY' ? 1 : 0)) % 3);
            if (emptyCount < 3) {
                for(let i=0; i<emptyCount; i++) {
                    const d = document.createElement('div');
                    area.appendChild(d);
                }
            }

            if (this.menuState === 'MIL_TRADE') {
                createBtn("戻る", "back", () => menu('MILITARY'));
            } else {
                createBtn("戻る", "back", () => menu('MAIN'));
            }
        });
    }
    
    showGunshiAdvice(action, onConfirm) {
        if (action.type === 'war' || this.game.warManager.state.active) {
            const warAdvice = this.game.warManager.getGunshiAdvice(action);
            if (warAdvice) {
                const gunshi = this.game.getClanGunshi(this.game.playerClanId);
                if (this.gunshiModal) {
                    this.gunshiModal.classList.remove('hidden'); 
                    if(this.gunshiName) this.gunshiName.textContent = `軍師: ${gunshi ? gunshi.name : '不明'}`; 
                    if(this.gunshiMessage) this.gunshiMessage.textContent = warAdvice;
                }
                if (this.gunshiExecuteBtn) this.gunshiExecuteBtn.onclick = () => { if(this.gunshiModal) this.gunshiModal.classList.add('hidden'); onConfirm(); };
                return;
            }
        }

        const spec = this.game.commandSystem.getSpecs()[action.type];
        if (spec && spec.hasAdvice === false) {
             onConfirm();
             return;
        }

        const gunshi = this.game.getClanGunshi(this.game.playerClanId); 
        if (!gunshi) { onConfirm(); return; }
        
        const seed = this.game.year * 100 + this.game.month + (action.type.length) + (action.targetId || 0) + (action.val || 0);
        const msg = GameSystem.getGunshiAdvice(gunshi, action, seed);
        
        if (this.gunshiModal) {
            this.gunshiModal.classList.remove('hidden'); 
            if(this.gunshiName) this.gunshiName.textContent = `軍師: ${gunshi ? gunshi.name : '不明'}`; 
            if(this.gunshiMessage) this.gunshiMessage.textContent = msg;
        }
        if (this.gunshiExecuteBtn) this.gunshiExecuteBtn.onclick = () => { if(this.gunshiModal) this.gunshiModal.classList.add('hidden'); onConfirm(); };
    }

    openBushoSelector(actionType, targetId = null, extraData = null, onBack = null) {
        if (actionType === 'appoint' && this.currentCastle) { const isDaimyoHere = this.game.getCastleBushos(this.currentCastle.id).some(b => b.isDaimyo); if (isDaimyoHere) { this.showDialog("大名の居城は城主を変更できません", false); return; } }
        
        if (this.selectorModal) this.selectorModal.classList.remove('hidden'); 
        if (document.getElementById('selector-title')) document.getElementById('selector-title').textContent = "武将を選択"; 
        
        const backBtn = document.querySelector('#selector-modal .btn-secondary');
        if(backBtn) {
            // ★追加：hideCancel という合図があったら、ボタンを隠す！
            if (extraData && extraData.hideCancel) {
                backBtn.style.display = 'none';
            } else {
                backBtn.style.display = ''; // 隠れていたものを元に戻す
                backBtn.onclick = () => {
                    this.closeSelector();
                    if (onBack) {
                        onBack(); 
                    } else if (extraData && extraData.onCancel) {
                        extraData.onCancel(); 
                    }
                };
            }
        }

        // ★項目名をスクロールの箱の中に作り直します！
        const isViewMode = (actionType === 'view_only' || actionType === 'all_busho_list');
        if (this.selectorList) {
            // ★変更：常に9列（空白列なし）にします！
            this.selectorList.innerHTML = `
                <div class="list-header" id="selector-list-header">
                    <span>行動</span><span>名前</span><span>身分</span><span>統率</span><span>武力</span><span>内政</span><span>外交</span><span>智謀</span><span>魅力</span>
                </div>
            `;
        }
        const contextEl = document.getElementById('selector-context-info'); if(contextEl) contextEl.classList.remove('hidden'); 
        const c = this.currentCastle; 
        let infoHtml = ""; 
        let bushos = []; 
        
        const baseType = actionType.replace('_deploy', ''); 
        const spec = this.game.commandSystem.getSpecs()[baseType] || this.game.commandSystem.getSpecs()[actionType] || {};
    
        let sortKey = spec.sortKey || 'strength';
        let isMulti = spec.isMulti || false;
        
        if (actionType === 'def_intercept_deploy' || actionType === 'def_reinf_deploy') {
             isMulti = true;
             sortKey = 'strength';
        }

        if (document.getElementById('selector-title')) {
            // ★変更：ただ見るだけの時は「武将一覧」という名前にします
            if (actionType === 'view_only' || actionType === 'all_busho_list') {
                document.getElementById('selector-title').textContent = "武将一覧";
            } else {
                document.getElementById('selector-title').textContent = isMulti ? "武将を選択（複数可）" : "武将を選択"; 
            }
        }

        let isEnemyTarget = false;
        let targetCastle = null;
        if (['rumor_target_busho','headhunt_target','view_only'].includes(actionType)) {
             isEnemyTarget = true;
             targetCastle = this.game.getCastle(targetId);
        }

        const gunshi = this.game.getClanGunshi(this.game.playerClanId);
        const myDaimyo = this.game.bushos.find(b => b.clan === this.game.playerClanId && b.isDaimyo);

        if (actionType === 'employ_target') { 
            bushos = this.game.getCastleBushos(c.id).filter(b => b.status === 'ronin'); 
            infoHtml = "<div>登用する在野武将を選択してください</div>"; 
        } 
        else if (actionType === 'employ_doer') { 
            bushos = this.game.getCastleBushos(c.id).filter(b => b.status !== 'ronin'); 
            infoHtml = "<div>登用を行う担当官を選択してください</div>"; 
        } 
        else if (actionType === 'diplomacy_doer') { 
            bushos = this.game.getCastleBushos(c.id).filter(b => b.status !== 'ronin'); 
            infoHtml = "<div>外交の担当官を選択してください</div>"; 
        }
        else if (actionType === 'rumor_target_busho') { 
            bushos = this.game.getCastleBushos(targetId).filter(b => b.status !== 'ronin' && !b.isDaimyo); 
            infoHtml = "<div>流言の対象とする武将を選択してください</div>"; 
        }
        else if (actionType === 'rumor_doer') { 
            bushos = this.game.getCastleBushos(c.id).filter(b => b.status !== 'ronin'); 
            infoHtml = "<div>流言を実行する担当官を選択してください</div>"; 
        }
        else if (actionType === 'incite_doer') { 
            bushos = this.game.getCastleBushos(c.id).filter(b => b.status !== 'ronin'); 
            infoHtml = "<div>扇動を実行する担当官を選択してください</div>"; 
        }
        else if (actionType === 'headhunt_target') { 
            bushos = this.game.getCastleBushos(targetId).filter(b => b.status !== 'ronin' && !b.isDaimyo); 
            infoHtml = "<div>引抜の対象とする武将を選択してください </div>"; 
        }
        else if (actionType === 'headhunt_doer') { 
            bushos = this.game.getCastleBushos(c.id).filter(b => b.status !== 'ronin'); 
            infoHtml = "<div>引抜を実行する担当官を選択してください</div>"; 
        }
        else if (actionType === 'interview') { 
            bushos = this.game.getCastleBushos(c.id).filter(b => b.status !== 'ronin' && !b.isDaimyo); 
            infoHtml = "<div>面談する武将を選択してください</div>"; 
        }
        else if (actionType === 'interview_target') { 
            bushos = this.game.bushos.filter(b => b.clan === this.game.playerClanId && b.status !== 'dead' && b.status !== 'ronin' && b.id !== extraData.interviewer.id && !b.isDaimyo); 
            infoHtml = `<div>誰についての印象を聞きますか？</div>`; 
        }
        else if (actionType === 'investigate_deploy') { 
            bushos = this.game.getCastleBushos(c.id).filter(b => b.status !== 'ronin'); 
            infoHtml = "<div>調査を行う武将を選択してください(複数可)</div>"; 
        }
        else if (actionType === 'view_only') { 
            bushos = this.game.getCastleBushos(targetId); 
            infoHtml = "<div>武将一覧 (精度により情報は隠蔽されます)</div>"; 
        }
        else if (actionType === 'all_busho_list') { 
            bushos = this.game.bushos.filter(b => b.clan === this.game.playerClanId && b.status !== 'dead' && b.status !== 'ronin'); 
            infoHtml = "<div>我が軍の武将一覧です</div>"; 
            isMulti = false;
        }
        else if (actionType === 'war_general' || actionType === 'kunishu_war_general') {
            if (extraData && extraData.candidates) {
                bushos = extraData.candidates.map(id => this.game.getBusho(id));
            }
            infoHtml = "<div>総大将とする武将を選択してください</div>"; 
            isMulti = false;
        }
        else if (actionType === 'appoint_gunshi') {
            bushos = this.game.bushos.filter(b => 
                b.clan === this.game.playerClanId && 
                b.status !== 'dead' && 
                b.status !== 'ronin' &&
                !b.isDaimyo && 
                !b.isCastellan
            );
            infoHtml = "<div>軍師に任命する武将を選択してください</div>";
        }
        else if (actionType === 'def_intercept_deploy') {
            bushos = this.game.getCastleBushos(targetId).filter(b => b.status !== 'ronin');
            infoHtml = "<div>迎撃に出陣する武将を選択してください（最大5名まで）</div>";
        }
        else if (actionType === 'def_reinf_deploy') {
            bushos = this.game.getCastleBushos(targetId).filter(b => b.status !== 'ronin');
            infoHtml = "<div>援軍に派遣する武将を選択してください（最大5名まで）</div>";
        }
        else {
            bushos = this.game.getCastleBushos(c.id).filter(b => b.status !== 'ronin');
            
            if (spec.msg) {
                infoHtml = `<div>${spec.msg}</div>`;
                if (actionType === 'war_deploy') {
                    infoHtml = `<div>出陣する武将を選択してください（最大5名まで）</div>`;
                }
            } else if (['farm','commerce'].includes(actionType)) { infoHtml = `<div>金: ${c.gold} (1回500)</div>`; }
            else if (['charity'].includes(actionType)) { infoHtml = `<div>金: ${c.gold}, 米: ${c.rice} (1回300)</div>`; }
            else if (['repair'].includes(actionType)) { infoHtml = `<div>金: ${c.gold} (1回300)</div>`; }
            else if (['draft'].includes(actionType)) { infoHtml = `<div>民忠: ${c.peoplesLoyalty}</div>`; }
            else if (['training','soldier_charity'].includes(actionType)) { infoHtml = `<div>状態: 訓練${c.training}/士気${c.morale}</div>`; }
        }
        if (contextEl) contextEl.innerHTML = infoHtml;
        
        bushos.sort((a,b) => {
        
            const getRankScore = (target) => {
                if (target.isDaimyo || target.isCastellan) return 10; 
                if (target.isGunshi) return 20; 

                if (target.belongKunishuId && target.belongKunishuId > 0) {
                    const kunishu = this.game.kunishuSystem.getKunishu(target.belongKunishuId);
                    const isBoss = kunishu && (Number(kunishu.leaderId) === Number(target.id));
                    
                    if (isBoss) return 40 + (target.belongKunishuId * 0.001); 
                    return 50 + (target.belongKunishuId * 0.001); 
                }

                if (target.status === 'ronin') return 90; 

                return 30; 
            };

            const rankA = getRankScore(a);
            const rankB = getRankScore(b);

            if (rankA !== rankB) {
                return rankA - rankB;
            }

            const getSortVal = (target) => {
                 let acc = null;
                 if (isEnemyTarget && targetCastle) acc = targetCastle.investigatedAccuracy;
                 if (isEnemyTarget) return GameSystem.getPerceivedStatValue(target, sortKey, gunshi, acc, this.game.playerClanId, myDaimyo) || 0;
                 const val = GameSystem.getPerceivedStatValue(target, sortKey, gunshi, null, this.game.playerClanId, myDaimyo);
                 return val === null ? 0 : val;
            };
            return getSortVal(b) - getSortVal(a);
        });
        const updateContextCost = () => { 
            if (!isMulti || !contextEl) return; 
            const checkedCount = document.querySelectorAll('input[name="sel_busho"]:checked').length; 
            let cost = 0, item = ""; 
            if (spec.costGold > 0) { cost = checkedCount * spec.costGold; item = "金"; }
            if (spec.costRice > 0) { cost = checkedCount * spec.costRice; item = "米"; }
            
            if (cost > 0) {
                 contextEl.innerHTML = `<div>消費予定 ${item}: ${cost} (所持: ${item==='金'?c.gold:c.rice})</div>`; 
            } else if (actionType === 'war_deploy' || actionType === 'def_intercept_deploy') {
                 contextEl.innerHTML = `<div>出陣武将: ${checkedCount}名 / 最大5名</div>`;
            }
        };

        // ★追加：誰も選んでいない時は決定ボタンを押せなくする魔法
        const updateBushoConfirmBtn = () => {
            if (!this.selectorConfirmBtn) return;
            if (actionType === 'view_only' || actionType === 'all_busho_list') return; 

            const checkedCount = this.selectorList.querySelectorAll('input[name="sel_busho"]:checked').length;
            if (checkedCount > 0) {
                this.selectorConfirmBtn.disabled = false;
                this.selectorConfirmBtn.style.opacity = 1.0;
            } else {
                this.selectorConfirmBtn.disabled = true;
                this.selectorConfirmBtn.style.opacity = 0.5;
            }
        };

        bushos.forEach(b => {
            if (actionType === 'banish' && b.isCastellan) return; 
            if (actionType === 'employ_target' && b.isDaimyo) return;
            if (actionType === 'reward' && b.isDaimyo) return; 
            
            let isSelectable = !b.isActionDone; 
            if (extraData && extraData.allowDone) isSelectable = true; 
            if (['employ_target','appoint_gunshi','rumor_target_busho','headhunt_target','interview','interview_target','reward','view_only','war_general', 'kunishu_war_general', 'all_busho_list'].includes(actionType)) isSelectable = true;
            if (actionType === 'def_intercept_deploy' || actionType === 'def_reinf_deploy') isSelectable = true;
            
            let acc = null; if (isEnemyTarget && targetCastle) acc = targetCastle.investigatedAccuracy;
            const getStat = (stat) => GameSystem.getDisplayStatHTML(b, stat, gunshi, acc, this.game.playerClanId, myDaimyo);

            const div = document.createElement('div'); div.className = `select-item ${!isSelectable ? 'disabled' : ''}`;
            const inputType = isMulti ? 'checkbox' : 'radio';
            
            let inputHtml = '';
            if (!isViewMode) {
                // ★変更：透明な箱（span）をなくして、inputだけをこっそり作ります
                inputHtml = `<input type="${inputType}" name="sel_busho" value="${b.id}" ${!isSelectable ? 'disabled' : ''} style="display:none;">`;
            }
            
            // ★変更：一番左にあった透明な箱を消して、inputを「行動」の中に隠します！
            div.innerHTML = `<span class="col-act">${inputHtml}${b.isActionDone?'[済]':'[未]'}</span><span class="col-name">${b.name}</span><span class="col-rank">${b.getRankName()}</span><span class="col-stat">${getStat('leadership')}</span><span class="col-stat">${getStat('strength')}</span><span class="col-stat">${getStat('politics')}</span><span class="col-stat">${getStat('diplomacy')}</span><span class="col-stat">${getStat('intelligence')}</span><span class="col-stat">${getStat('charm')}</span>`;
            
            if(isSelectable && actionType !== 'view_only' && actionType !== 'all_busho_list') { 
                div.onclick = (e) => {
                    if(e.target.tagName === 'INPUT') { 
                        if(!isMulti) {
                            const siblings = this.selectorList.querySelectorAll('.select-item');
                            siblings.forEach(el => el.classList.remove('selected'));
                        } else {
                             const maxSelect = (actionType === 'war_deploy' || actionType === 'def_intercept_deploy' || actionType === 'def_reinf_deploy') ? 5 : 999;
                             const currentChecked = this.selectorList.querySelectorAll('input[name="sel_busho"]:checked').length;
                             if(e.target.checked && currentChecked > maxSelect) {
                                 e.target.checked = false;
                                 this.showDialog(`出陣できる武将は最大${maxSelect}人までです。`, false);
                                 return;
                             }
                        }
                        if(e.target.checked) div.classList.add('selected');
                        else div.classList.remove('selected');
                        updateContextCost();
                        updateBushoConfirmBtn(); // ★追加
                        return;
                    } 
                    const input = div.querySelector('input');
                    if(input) {
                        if (isMulti) { 
                             const maxSelect = (actionType === 'war_deploy' || actionType === 'def_intercept_deploy' || actionType === 'def_reinf_deploy') ? 5 : 999;
                             const currentChecked = this.selectorList.querySelectorAll('input[name="sel_busho"]:checked').length;
                             if(!input.checked && currentChecked >= maxSelect) {
                                 this.showDialog(`出陣できる武将は最大${maxSelect}人までです。`, false);
                                 return;
                             }
                             input.checked = !input.checked; 
                        } else { 
                             input.checked = true; const allItems = this.selectorList.querySelectorAll('.select-item'); allItems.forEach(item => item.classList.remove('selected')); 
                        }
                        if(input.checked) div.classList.add('selected'); else div.classList.remove('selected');
                        updateContextCost(); 
                        updateBushoConfirmBtn(); // ★追加
                    }
                }; 
            }
            this.selectorList.appendChild(div);
        });
        if (bushos.length === 0 && this.selectorList) this.selectorList.innerHTML = "<div style='padding:10px;'>対象となる武将がいません</div>";

        if (this.selectorConfirmBtn) {
            if (actionType === 'view_only' || actionType === 'all_busho_list') {
                this.selectorConfirmBtn.classList.add('hidden'); 
            } else {
                this.selectorConfirmBtn.classList.remove('hidden');
                
                // ★追加：画面を開いた直後は「誰も選んでいない状態」にセットする
                updateBushoConfirmBtn();

                this.selectorConfirmBtn.onclick = () => {
                    const inputs = document.querySelectorAll('input[name="sel_busho"]:checked'); if (inputs.length === 0) return;
                    const selectedIds = Array.from(inputs).map(i => parseInt(i.value)); 
                    this.closeSelector();
                    if ((actionType === 'def_intercept_deploy' || actionType === 'def_reinf_deploy') && extraData && extraData.onConfirm) {
                        extraData.onConfirm(selectedIds);
                    } else {
                        this.game.commandSystem.handleBushoSelection(actionType, selectedIds, targetId, extraData);
                    }
                };
            }
        }
    }
    
    // ★ 修正: 兵科（足軽・騎馬・鉄砲）の選択UIと、持参した兵器（騎馬・鉄砲）の数による制限ロジックを追加
    showUnitDivideModal(bushos, totalSoldiers, totalHorses, totalGuns, onConfirm, onCancel = null) { // ★修正：onCancel を受け取れるように追加
        const modal = document.getElementById('unit-divide-modal');
        const listEl = document.getElementById('divide-list');
        const confirmBtn = document.getElementById('divide-confirm-btn');
        const remainEl = document.getElementById('divide-remain-soldiers');
        const totalEl = document.getElementById('divide-total-soldiers');
        
        if (!modal || !listEl) return;
        
        // フォールバック処理（旧呼び出し用）
        if (typeof totalHorses === 'function') {
            onCancel = totalGuns; // ★引数がずれた場合の対応を追加
            onConfirm = totalHorses;
            totalHorses = 0;
            totalGuns = 0;
        }

        // ★追加：キャンセルボタンが押されたときの処理
        const cancelBtn = modal.querySelector('.btn-secondary');
        if (cancelBtn) {
            cancelBtn.onclick = () => {
                modal.classList.add('hidden');
                if (onCancel) onCancel(); // キャンセルの合図を送る！
            };
        }

        modal.classList.remove('hidden');
        totalEl.textContent = totalSoldiers;
        listEl.innerHTML = '';
        
        let assignments = bushos.map(b => ({ id: b.id, count: 0, type: 'ashigaru' }));
        
        let ratioSum = 1.5 + (bushos.length - 1) * 1.0;
        let baseAmount = Math.floor(totalSoldiers / ratioSum);
        let remain = totalSoldiers;

        for (let i = 1; i < bushos.length; i++) {
            assignments[i].count = baseAmount;
            remain -= baseAmount;
        }
        if (assignments.length > 0) {
            assignments[0].count = remain; 
        }

        const updateRemain = (triggerBushoId = null, triggerType = null) => {
            let sum = 0;
            let usedHorses = 0;
            let usedGuns = 0;
            
            // 各部隊の兵科と設定兵士数を取得
            const currentData = bushos.map(b => {
                const typeEl = document.getElementById(`div-type-${b.id}`);
                const numEl = document.getElementById(`div-num-${b.id}`);
                const typeVal = typeEl ? typeEl.value : 'ashigaru';
                let numVal = numEl ? parseInt(numEl.value) || 0 : 0;
                return { id: b.id, type: typeVal, count: numVal };
            });

            // 兵科変更や数値変更時に持参上限を超えていないかチェックしてクリップする
            if (triggerType === 'type_change' && triggerBushoId) {
                const bData = currentData.find(d => d.id === triggerBushoId);
                if (bData && bData.type === 'kiba') {
                    const otherKiba = currentData.filter(d => d.id !== triggerBushoId && d.type === 'kiba').reduce((s, d) => s + d.count, 0);
                    const maxKiba = Math.max(0, totalHorses - otherKiba);
                    if (bData.count > maxKiba) {
                        bData.count = maxKiba;
                        if (bData.count < 1) bData.count = 1; 
                        if (maxKiba === 0) {
                            bData.type = 'ashigaru';
                            document.getElementById(`div-type-${triggerBushoId}`).value = 'ashigaru';
                        }
                    }
                } else if (bData && bData.type === 'teppo') {
                    const otherTeppo = currentData.filter(d => d.id !== triggerBushoId && d.type === 'teppo').reduce((s, d) => s + d.count, 0);
                    const maxTeppo = Math.max(0, totalGuns - otherTeppo);
                    if (bData.count > maxTeppo) {
                        bData.count = maxTeppo;
                        if (bData.count < 1) bData.count = 1;
                        if (maxTeppo === 0) {
                            bData.type = 'ashigaru';
                            document.getElementById(`div-type-${triggerBushoId}`).value = 'ashigaru';
                        }
                    }
                }
            } else if (triggerType === 'num_change' && triggerBushoId) {
                const bData = currentData.find(d => d.id === triggerBushoId);
                if (bData && bData.type === 'kiba') {
                    const otherKiba = currentData.filter(d => d.id !== triggerBushoId && d.type === 'kiba').reduce((s, d) => s + d.count, 0);
                    const maxKiba = Math.max(0, totalHorses - otherKiba);
                    if (bData.count > maxKiba) bData.count = maxKiba;
                } else if (bData && bData.type === 'teppo') {
                    const otherTeppo = currentData.filter(d => d.id !== triggerBushoId && d.type === 'teppo').reduce((s, d) => s + d.count, 0);
                    const maxTeppo = Math.max(0, totalGuns - otherTeppo);
                    if (bData.count > maxTeppo) bData.count = maxTeppo;
                }
            }

            // 各武将の兵士数合計を計算
            sum = currentData.reduce((s, d) => s + d.count, 0);
            usedHorses = currentData.filter(d => d.type === 'kiba').reduce((s, d) => s + d.count, 0);
            usedGuns = currentData.filter(d => d.type === 'teppo').reduce((s, d) => s + d.count, 0);
            
            const rem = totalSoldiers - sum;

            // UIへの反映（最大値の変更はせず、値だけを合わせます）
            currentData.forEach(d => {
                const range = document.getElementById(`div-range-${d.id}`);
                const num = document.getElementById(`div-num-${d.id}`);
                if (!range || !num) return;

                if (parseInt(num.value) !== d.count) {
                    num.value = d.count;
                    range.value = d.count;
                }
            });
            
            remainEl.innerHTML = `${rem} <span style="font-size:0.8rem; color:#333; margin-left: 10px;">(騎馬残:${Math.max(0, totalHorses - usedHorses)} 鉄砲残:${Math.max(0, totalGuns - usedGuns)})</span>`;
            
            if (rem === 0) {
                remainEl.style.color = "green";
                confirmBtn.disabled = false;
                confirmBtn.style.opacity = 1.0;
            } else {
                remainEl.style.color = "red";
                confirmBtn.disabled = true;
                confirmBtn.style.opacity = 0.5;
            }
        };

        bushos.forEach((b, index) => {
            const div = document.createElement('div');
            div.style.marginBottom = "15px";
            div.style.padding = "10px";
            div.style.border = "1px solid #ccc";
            div.style.borderRadius = "4px";
            div.style.background = "#fff";
            
            div.innerHTML = `
                <div style="font-weight:bold; margin-bottom:5px;">${b.name} <small>(統:${b.leadership} 武:${b.strength} 智:${b.intelligence})</small></div>
                <div style="margin-bottom:5px;">
                    <select id="div-type-${b.id}" style="padding:4px; font-size:0.9rem;">
                        <option value="ashigaru">足軽</option>
                        <option value="kiba">騎馬</option>
                        <option value="teppo">鉄砲</option>
                    </select>
                </div>
                <div class="qty-control">
                    <input type="range" id="div-range-${b.id}" min="1" max="${totalSoldiers}" value="${assignments[index].count}">
                    <input type="number" id="div-num-${b.id}" min="1" max="${totalSoldiers}" value="${assignments[index].count}">
                </div>
                <div class="qty-shortcuts">
                    <button class="qty-shortcut-btn" id="div-btn-min-${b.id}">最小</button>
                    <button class="qty-shortcut-btn" id="div-btn-half-${b.id}">半分</button>
                    <button class="qty-shortcut-btn" id="div-btn-max-${b.id}">最大</button>
                </div>
            `;
            listEl.appendChild(div);
            
            const range = div.querySelector(`#div-range-${b.id}`);
            const num = div.querySelector(`#div-num-${b.id}`);
            const typeSel = div.querySelector(`#div-type-${b.id}`);
            
            const onInput = (val, mode = 'normal') => {
                let v = parseInt(val) || 0;
                
                // 動的に限界値を計算します
                let otherSum = 0;
                let otherHorses = 0;
                let otherGuns = 0;
                bushos.forEach(busho => {
                    if (busho.id !== b.id) {
                        const tEl = document.getElementById(`div-type-${busho.id}`);
                        const nEl = document.getElementById(`div-num-${busho.id}`);
                        const t = tEl ? tEl.value : 'ashigaru';
                        const c = parseInt(nEl ? nEl.value : 0) || 0;
                        otherSum += c;
                        if (t === 'kiba') otherHorses += c;
                        if (t === 'teppo') otherGuns += c;
                    }
                });
                
                let maxAllowed = totalSoldiers - otherSum;
                const myType = typeSel.value;
                if (myType === 'kiba') maxAllowed = Math.min(maxAllowed, totalHorses - otherHorses);
                if (myType === 'teppo') maxAllowed = Math.min(maxAllowed, totalGuns - otherGuns);
                if (maxAllowed < 1) maxAllowed = 1;

                if (mode === 'max') {
                    v = maxAllowed;
                } else if (mode === 'half') {
                    v = Math.floor((1 + maxAllowed) / 2);
                } else {
                    if (v > maxAllowed) v = maxAllowed;
                    if (v < 1) v = 1;
                }
                
                range.value = v;
                num.value = v;
                updateRemain(b.id, 'num_change');
            };

            range.oninput = (e) => onInput(e.target.value);
            num.oninput = (e) => onInput(e.target.value);

            const btnMin = div.querySelector(`#div-btn-min-${b.id}`);
            const btnHalf = div.querySelector(`#div-btn-half-${b.id}`);
            const btnMax = div.querySelector(`#div-btn-max-${b.id}`);
            
            btnMin.onclick = () => onInput(1);
            btnHalf.onclick = () => onInput(0, 'half');
            btnMax.onclick = () => onInput(0, 'max');
            num.onblur = (e) => {
                if(e.target.value === "" || isNaN(parseInt(e.target.value))) {
                    onInput(1);
                }
            };
            typeSel.onchange = () => {
                updateRemain(b.id, 'type_change');
            };
        });

        updateRemain();

        confirmBtn.onclick = () => {
            let sum = 0;
            const finalAssignments = [];
            bushos.forEach(b => {
                const val = parseInt(document.getElementById(`div-num-${b.id}`).value) || 0;
                const typeVal = document.getElementById(`div-type-${b.id}`).value;
                sum += val;
                finalAssignments.push({ busho: b, soldiers: val, troopType: typeVal });
            });
            
            if (sum !== totalSoldiers) {
                this.showDialog("未分配の兵士がいます。兵士を残さず分配してください。", false);
                return;
            }
            
            modal.classList.add('hidden');
            onConfirm(finalAssignments);
        };
    }

    showInterviewModal(busho) {
        if (!this.resultModal) return;
        this.resultModal.classList.remove('hidden');
        let content = "";
        const isSelf = busho.isDaimyo && busho.clan === this.game.playerClanId;
        if (isSelf) {
            content = `<h3>独り言 (${busho.name})</h3><div style="margin:20px 0; text-align:left;"><p>（ふむ……${busho.ambition >= 80 ? "天下統一も夢ではないか。" : "家の安泰こそ第一。無理は禁物だ。"}）</p><p>（家中の者たちはどう思っているのか……）</p><div style="margin-top:20px; display:flex; flex-direction:column; gap:10px;"><button class="btn-primary" id="interview-ask">他者について考える</button><button class="btn-secondary" onclick="window.GameApp.ui.reopenInterviewSelector()">戻る</button></div></div>`;
        } else {
            content = `<h3>${busho.name}との面談</h3><div style="margin:20px 0; text-align:left;"><p>「殿、どのようなご用件でしょうか？」</p><div style="margin-top:20px; display:flex; flex-direction:column; gap:10px;"><button class="btn-primary" id="interview-status">調子はどうだ</button><button class="btn-primary" id="interview-ask">他者について聞く</button><button class="btn-secondary" onclick="window.GameApp.ui.reopenInterviewSelector()">戻る</button></div></div>`;
        }
        if (this.resultBody) this.resultBody.innerHTML = content;
        
        const statusBtn = document.getElementById('interview-status');
        if (statusBtn) statusBtn.onclick = () => { this.game.commandSystem.executeInterviewStatus(busho); };
        
        const askBtn = document.getElementById('interview-ask');
        if (askBtn) askBtn.onclick = () => { 
            this.closeResultModal(); 
            this.openBushoSelector('interview_target', null, { interviewer: busho }); 
        };
    }
    reopenInterviewSelector() { this.closeResultModal(); this.openBushoSelector('interview', null, {allowDone: true}); }
    
    reopenInterviewModal(busho) {
        this.closeResultModal();
        setTimeout(() => this.showInterviewModal(busho), 100);
    }

    showTurnStartDialog(castle, onProceed) {
        const msg = `
            <div style="text-align:center; padding: 10px;">
                <div style="font-weight:bold; margin-bottom:10px; font-size:1.1rem;">小姓</div>
                <div style="margin-bottom:20px; font-size:1rem;">「殿、${castle.name}にご命令ください。」</div>
            </div>
        `;
        if (this.resultBody) this.resultBody.innerHTML = msg;
        if (this.resultModal) this.resultModal.classList.remove('hidden');
        this.onResultModalClose = onProceed;
    }

    // ★ 修正: 出陣時、迎撃時に「持参騎馬」「持参鉄砲」を指定するスライダーを追加
    openQuantitySelector(type, data, targetId, extraData = null) {
        if (!this.quantityModal) return;
        this.quantityModal.classList.remove('hidden'); 
        if (this.quantityContainer) this.quantityContainer.innerHTML = '';
        if (this.charityTypeSelector) this.charityTypeSelector.classList.add('hidden'); 
        if (this.tradeTypeInfo) this.tradeTypeInfo.classList.add('hidden'); 
        const c = this.currentCastle;

        // ★追加：スライダーの値を見て、0だったら決定ボタンを押せなくする魔法
        const checkValidQuantity = () => {
            if (!this.quantityConfirmBtn) return;
            let isValid = true;

            if (type === 'transport') {
                const g = parseInt(document.getElementById('num-gold')?.value) || 0;
                const r = parseInt(document.getElementById('num-rice')?.value) || 0;
                const s = parseInt(document.getElementById('num-soldiers')?.value) || 0;
                const h = parseInt(document.getElementById('num-horses')?.value) || 0;
                const gun = parseInt(document.getElementById('num-guns')?.value) || 0;
                if (g === 0 && r === 0 && s === 0 && h === 0 && gun === 0) isValid = false;
            } else if (type === 'headhunt_gold' || type === 'charity') {
                // 引抜の持参金は任意（0でもOK）、施しは金米固定なので常にOK
                isValid = true; 
            } else if (type === 'war_supplies' || type === 'def_intercept' || type === 'def_reinf_supplies') {
                const s = parseInt(document.getElementById('num-soldiers')?.value) || 0;
                if (s <= 0) isValid = false; // 兵士0での出陣はダメ
            } else {
                // その他の購入や徴兵などは、代表的な入力欄が0ならダメ
                const inputsEl = document.querySelectorAll('.qty-control input[type="number"]');
                if (inputsEl.length > 0) {
                    const val = parseInt(inputsEl[0].value) || 0;
                    if (val <= 0) isValid = false;
                }
            }

            if (isValid) {
                this.quantityConfirmBtn.disabled = false;
                this.quantityConfirmBtn.style.opacity = 1.0;
            } else {
                this.quantityConfirmBtn.disabled = true;
                this.quantityConfirmBtn.style.opacity = 0.5;
            }
        };

        const createSlider = (label, id, max, currentVal, minVal = 0) => { 
            const wrap = document.createElement('div'); 
            wrap.className = 'qty-row'; 
            wrap.innerHTML = `
                <label>${label} (Max: <span id="max-label-${id}">${max}</span>)</label>
                <div class="qty-control">
                    <input type="range" id="range-${id}" min="${minVal}" max="${max}" value="${currentVal}">
                    <input type="number" id="num-${id}" min="${minVal}" max="${max}" value="${currentVal}">
                </div>
                <div class="qty-shortcuts">
                    <button class="qty-shortcut-btn" id="btn-min-${id}">最小</button>
                    <button class="qty-shortcut-btn" id="btn-half-${id}">半分</button>
                    <button class="qty-shortcut-btn" id="btn-max-${id}">最大</button>
                </div>
            `; 
            
            const range = wrap.querySelector(`#range-${id}`); 
            const num = wrap.querySelector(`#num-${id}`); 

            const setVal = (v) => {
                let actualMax = parseInt(range.max);
                if (v < minVal) v = minVal;
                if (v > actualMax) v = actualMax;
                range.value = v;
                num.value = v;
                checkValidQuantity(); // ★追加
            };

            wrap.querySelector(`#btn-min-${id}`).onclick = () => setVal(minVal);
            wrap.querySelector(`#btn-half-${id}`).onclick = () => {
                let actualMax = parseInt(range.max);
                setVal(Math.floor((minVal + actualMax) / 2));
            };
            wrap.querySelector(`#btn-max-${id}`).onclick = () => setVal(parseInt(range.max));

            range.oninput = () => { num.value = range.value; checkValidQuantity(); }; // ★変更

            num.oninput = () => {
                let actualMax = parseInt(range.max);
                let v = parseInt(num.value);
                if (isNaN(v)) return; 
                if (v < minVal) v = minVal;
                if (v > actualMax) v = actualMax;
                if (num.value != v) num.value = v; 
                range.value = v; 
                checkValidQuantity(); // ★追加
            };
            
            num.onblur = () => {
                if (num.value === "" || isNaN(parseInt(num.value))) {
                    num.value = minVal;
                    range.value = minVal;
                }
                checkValidQuantity(); // ★追加
            };

            this.quantityContainer.appendChild(wrap); 
            return { range, num }; 
        };

        let inputs = {};
        
        if (type === 'draft') {
            document.getElementById('quantity-title').textContent = "徴兵資金"; inputs.gold = createSlider("金", "gold", c.gold, 0);
        } else if (type === 'charity') {
            document.getElementById('quantity-title').textContent = "施し"; this.charityTypeSelector.classList.remove('hidden'); const count = data.length; this.quantityContainer.innerHTML = `<p>選択武将数: ${count}名</p>`;
        } else if (type === 'goodwill') {
            document.getElementById('quantity-title').textContent = "贈与金指定"; inputs.gold = createSlider("金", "gold", c.gold, 100);
        } else if (type === 'headhunt_gold') {
            document.getElementById('quantity-title').textContent = "持参金 (任意)"; inputs.gold = createSlider("金", "gold", c.gold, 0);
        } else if (type === 'war_supplies') {
            document.getElementById('quantity-title').textContent = "出陣兵数・兵糧・兵器指定"; 
            inputs.soldiers = createSlider("兵士数", "soldiers", c.soldiers, c.soldiers);
            inputs.rice = createSlider("持参兵糧", "rice", c.rice, c.rice);
            inputs.horses = createSlider("持参騎馬", "horses", c.horses, 0);
            inputs.guns = createSlider("持参鉄砲", "guns", c.guns, 0);
        } else if (type === 'def_intercept') { 
            // ★修正：別の城（c）ではなく、攻められた城（interceptCastle）のデータを正しく読み込むようにしました！
            const interceptCastle = (data && data.length > 0) ? data[0] : c;
            document.getElementById('quantity-title').textContent = "迎撃部隊編成"; 
            inputs.soldiers = createSlider("出陣兵士数", "soldiers", interceptCastle.soldiers, interceptCastle.soldiers);
            inputs.rice = createSlider("持参兵糧", "rice", interceptCastle.rice, interceptCastle.rice);
            inputs.horses = createSlider("持参騎馬", "horses", interceptCastle.horses || 0, 0);
            inputs.guns = createSlider("持参鉄砲", "guns", interceptCastle.guns || 0, 0);
        } else if (type === 'def_reinf_supplies') { 
            const helperCastle = (data && data.length > 0) ? data[0] : c;
            document.getElementById('quantity-title').textContent = "防衛援軍の部隊編成"; 
            inputs.soldiers = createSlider("出陣兵士数", "soldiers", helperCastle.soldiers, helperCastle.soldiers, 500);
            inputs.rice = createSlider("持参兵糧", "rice", helperCastle.rice, helperCastle.rice, 500);
            inputs.horses = createSlider("持参騎馬", "horses", helperCastle.horses || 0, 0, 0);
            inputs.guns = createSlider("持参鉄砲", "guns", helperCastle.guns || 0, 0, 0);
        } else if (type === 'transport') {
            document.getElementById('quantity-title').textContent = "輸送物資指定"; 
            inputs.gold = createSlider("金", "gold", c.gold, 0); 
            inputs.rice = createSlider("兵糧", "rice", c.rice, 0); 
            inputs.soldiers = createSlider("兵士", "soldiers", c.soldiers, 0);
            inputs.horses = createSlider("騎馬", "horses", c.horses || 0, 0);
            inputs.guns = createSlider("鉄砲", "guns", c.guns || 0, 0);
        } else if (type === 'buy_rice') {
            document.getElementById('quantity-title').textContent = "兵糧購入"; const rate = this.game.marketRate; const maxBuy = Math.floor(c.gold / rate);
            this.tradeTypeInfo.classList.remove('hidden'); this.tradeTypeInfo.textContent = `相場: ${rate.toFixed(2)} (金1 -> 米${(1/rate).toFixed(2)})`;
            inputs.amount = createSlider("購入量(米)", "amount", maxBuy, 0);
        } else if (type === 'sell_rice') {
            document.getElementById('quantity-title').textContent = "兵糧売却"; const rate = this.game.marketRate;
            this.tradeTypeInfo.classList.remove('hidden'); this.tradeTypeInfo.textContent = `相場: ${rate.toFixed(2)} (米1 -> 金${rate.toFixed(2)})`;
            inputs.amount = createSlider("売却量(米)", "amount", c.rice, 0);
        } else if (type === 'buy_ammo') {
            document.getElementById('quantity-title').textContent = "矢弾購入"; 
            const rate = this.game.marketRate; 
            const price = Math.floor(window.MainParams.Economy.PriceAmmo * rate);
            const maxBuy = price > 0 ? Math.floor(c.gold / price) : 0;
            this.tradeTypeInfo.classList.remove('hidden'); 
            this.tradeTypeInfo.textContent = `相場影響価格: 金${price} / 1個`;
            inputs.amount = createSlider("購入量", "amount", maxBuy, 0);
        } else if (type === 'buy_horses') {
            document.getElementById('quantity-title').textContent = "騎馬購入"; 
            const rate = this.game.marketRate; 
            const price = Math.floor(window.MainParams.Economy.PriceHorse * rate);
            const maxBuy = price > 0 ? Math.floor(c.gold / price) : 0;
            this.tradeTypeInfo.classList.remove('hidden'); 
            this.tradeTypeInfo.textContent = `相場影響価格: 金${price} / 1頭`;
            inputs.amount = createSlider("購入量", "amount", maxBuy, 0);
        } else if (type === 'buy_guns') {
            document.getElementById('quantity-title').textContent = "鉄砲購入"; 
            const rate = this.game.marketRate; 
            const price = Math.floor(window.MainParams.Economy.PriceGun * rate);
            const maxBuy = price > 0 ? Math.floor(c.gold / price) : 0;
            this.tradeTypeInfo.classList.remove('hidden'); 
            this.tradeTypeInfo.textContent = `相場影響価格: 金${price} / 1挺`;
            inputs.amount = createSlider("購入量", "amount", maxBuy, 0);
        } else if (type === 'war_repair') {
            const s = this.game.warManager.state;
            const defender = s.defender;
            const maxSoldiers = Math.min(window.WarParams.War.RepairMaxSoldiers, defender.soldiers);
            document.getElementById('quantity-title').textContent = "補修 (兵士選択)";
            inputs.soldiers = createSlider("使用兵士数", "soldiers", maxSoldiers, Math.min(50, maxSoldiers));
        }
        
        checkValidQuantity(); // ★追加：画面を開いた直後に一度チェックする

        // ★追加：ウインドウを閉じる時にボタンを元気な状態に戻す魔法
        const closeQuantityModal = () => {
            this.quantityModal.classList.add('hidden');
            if (this.quantityConfirmBtn) {
                this.quantityConfirmBtn.disabled = false;
                this.quantityConfirmBtn.style.opacity = 1.0;
            }
        };

        this.quantityConfirmBtn.onclick = () => {
            closeQuantityModal(); // ★変更
            if ((type === 'def_intercept' || type === 'def_reinf_supplies') && extraData && extraData.onConfirm) {
                extraData.onConfirm(inputs);
            } else {
                this.game.commandSystem.handleQuantitySelection(type, inputs, targetId, data, extraData);
            }
        };

        // ★追加：キャンセルボタン（戻る）を押したときの処理
        const cancelBtn = this.quantityModal.querySelector('.btn-secondary');
        if (cancelBtn) {
            cancelBtn.onclick = () => {
                closeQuantityModal(); // ★変更
                if (extraData && extraData.onCancel) {
                    extraData.onCancel(); // キャンセルの合図を送る！
                }
            };
        }
    }
    
    showKunishuSelector(kunishus, onSelect, onCancel, isViewOnly = false) {
        if (!this.selectorModal) return;
        this.selectorModal.classList.remove('hidden');
        
        const title = document.getElementById('selector-title');
        if (title) title.textContent = isViewOnly ? "国人衆一覧" : "対象の国衆を選択";

        const backBtn = document.querySelector('#selector-modal .btn-secondary');
        if(backBtn) {
            backBtn.onclick = () => {
                const listHeader = document.querySelector('#selector-modal .list-header');
                if (listHeader) listHeader.style.display = ''; // ヘッダーを戻す
                this.closeSelector();
                if (onCancel) onCancel(); // 国衆画面の正しいキャンセル処理
            };
        }

        const contextEl = document.getElementById('selector-context-info');
        if (contextEl) {
            contextEl.innerHTML = isViewOnly ? "<div>この城に存在する国人衆です</div>" : "<div>対象とする国衆を選択してください</div>";
            contextEl.classList.remove('hidden');
        }

        // 武将リスト用のヘッダー（名前、統率など）を隠します
        const listHeader = document.querySelector('#selector-modal .list-header');
        if (listHeader) listHeader.style.display = 'none';

        let selectedKunishuId = null; // 選んだ国衆を記憶する箱

        if (this.selectorList) {
            this.selectorList.innerHTML = `
                <div class="kunishu-list-header ${isViewOnly ? 'view-mode' : ''}">
                    ${isViewOnly ? '' : '<span></span>'}<span>勢力名</span><span>兵数</span><span>防御</span><span>友好度</span>
                </div>
            `;
            if (isViewOnly) this.selectorList.classList.add('view-mode');
            else this.selectorList.classList.remove('view-mode');
            
            kunishus.forEach(k => {
                const name = k.getName(window.GameApp);
                const rel = k.getRelation(window.GameApp.playerClanId);
                const div = document.createElement('div');
                div.className = 'kunishu-list-item'; 
                
                if (isViewOnly) {
                    // ★見るだけモード（先頭の空箱なし）
                    div.innerHTML = `<strong class="col-kunishu-name">${name}</strong><span>${k.soldiers}</span><span>${k.defense}</span><span>${rel}</span>`;
                    div.style.cursor = 'default';
                } else {
                    // ★選択モード（先頭に空箱あり）
                    div.innerHTML = `<span></span><strong class="col-kunishu-name">${name}</strong><span>${k.soldiers}</span><span>${k.defense}</span><span>${rel}</span>`;
                    div.style.cursor = 'pointer';
                    
                    div.onclick = () => {
                        // 一旦すべての選択色を消す
                        const allItems = this.selectorList.querySelectorAll('.kunishu-list-item');
                        allItems.forEach(item => {
                            item.classList.remove('selected');
                        });
                        
                        // クリックした行に色を付ける
                        div.classList.add('selected');
                        selectedKunishuId = k.id;
                        
                        // 決定ボタンを押せるようにする
                        if (this.selectorConfirmBtn) {
                            this.selectorConfirmBtn.disabled = false;
                            this.selectorConfirmBtn.style.opacity = 1.0;
                        }
                    };
                }
                this.selectorList.appendChild(div);
            });
        }
        
        if (this.selectorConfirmBtn) {
            if (isViewOnly) {
                // 見るだけの時は決定ボタンを隠す
                this.selectorConfirmBtn.classList.add('hidden');
            } else {
                // 選ぶ時は決定ボタンを表示して、最初は押せないようにしておく
                this.selectorConfirmBtn.classList.remove('hidden');
                this.selectorConfirmBtn.disabled = true;
                this.selectorConfirmBtn.style.opacity = 0.5;

                this.selectorConfirmBtn.onclick = () => {
                    if (selectedKunishuId !== null) {
                        if (listHeader) listHeader.style.display = ''; // ヘッダーを戻す
                        this.closeSelector();
                        if (onSelect) onSelect(selectedKunishuId); 
                    }
                };
            }
        }
    }
    
    setWarModalVisible(visible) {
        if (!this.warModal) return;
        if (visible) this.warModal.classList.remove('hidden');
        else this.warModal.classList.add('hidden');
    }

    clearWarLog() {
        if (this.warLog) this.warLog.innerHTML = '';
    }

    updateWarUI() {
        if (!this.game.warManager.state.active) return;
        const s = this.game.warManager.state;
        
        const setTxt = (id, val) => { 
            const el = document.getElementById(id); 
            if(el) el.textContent = val; 
        };
        
        const updateFace = (id, busho) => {
            const el = document.getElementById(id);
            if (!el) return;
            if (busho && busho.faceIcon) {
                el.src = `data/faceicons/${busho.faceIcon}`;
                el.classList.remove('hidden');
                el.onerror = () => { el.classList.add('hidden'); }; 
            } else {
                el.classList.add('hidden');
            }
        };

        setTxt('war-date-info', `${this.game.year}年 ${this.game.month}月`);
        const maxRounds = window.WarParams?.Military?.WarMaxRounds || 10;
        
        const turnEl = document.getElementById('war-turn-info');
        if (turnEl) turnEl.innerHTML = `残り <span style="color:#fdea60;">${Math.max(0, maxRounds - s.round + 1)}</span>ターン`;
        
        const wallEl = document.getElementById('war-def-wall-info');
        if (wallEl) wallEl.innerHTML = `城防御 <span style="color:#fdea60;">${s.defender.defense}</span>`;

        if (s.defender.isKunishu) {
            setTxt('war-title-name', `${s.defender.name} 鎮圧戦`);
        } else {
            setTxt('war-title-name', `${s.defender.name} 攻防戦`);
        }

        // 攻撃軍の情報を入れます
        const atkClan = this.game.clans.find(c => c.id === s.attacker.ownerClan);
        const atkName = s.attacker.isKunishu ? s.attacker.name : (atkClan ? atkClan.name : "不明な勢力");
        setTxt('war-atk-name', atkName);
        
        // ★ここを追加：名前が5文字以上なら、タイトル全体を小さくする魔法をかけます！
        const atkTitleEl = document.getElementById('war-atk-name').parentElement;
        if (atkName.length >= 5) {
            atkTitleEl.classList.add('title-long-text');
        } else {
            atkTitleEl.classList.remove('title-long-text');
        }
        
        setTxt('war-atk-busho', s.atkBushos[0].name);
        setTxt('war-atk-soldier', s.attacker.soldiers);
        setTxt('war-atk-morale', s.attacker.morale);
        setTxt('war-atk-training', s.attacker.training);
        setTxt('war-atk-rice', s.attacker.rice); 
        updateFace('war-atk-face', s.atkBushos[0]);
        
        // 守備軍の情報を入れます
        const defClan = this.game.clans.find(c => c.id === s.defender.ownerClan);
        const defNameText = s.defender.isKunishu ? s.defender.name : (defClan ? defClan.name : "不明な勢力");
        setTxt('war-def-name', defNameText);
        
        // ★ここを追加：守備側も同じように、長ければ小さくする魔法をかけます！
        const defTitleEl = document.getElementById('war-def-name').parentElement;
        if (defNameText.length >= 5) {
            defTitleEl.classList.add('title-long-text');
        } else {
            defTitleEl.classList.remove('title-long-text');
        }

        setTxt('war-def-busho', s.defBusho.name);
        setTxt('war-def-soldier', s.defender.soldiers);
        setTxt('war-def-morale', s.defender.morale);
        setTxt('war-def-training', s.defender.training);
        setTxt('war-def-rice', s.defender.rice); 
        updateFace('war-def-face', s.defBusho);
    }

    renderWarControls(isAtkTurn) {
        if (!this.warControls) return;
        
        const s = this.game.warManager.state;
        const pid = Number(this.game.playerClanId);
        
        // 自分が攻撃側か守備側かを判定
        const amIAttacker = (Number(s.attacker.ownerClan) === pid);
        const amIDefender = (Number(s.defender.ownerClan) === pid);
        
        // 今がプレイヤーの操作する番かどうか
        const isMyTurn = (isAtkTurn && amIAttacker) || (!isAtkTurn && amIDefender);
        
        // ★変更：自分の番じゃなくてもコマンドを組み立てて画面に出すようにしました
        let options = [];
        if (amIAttacker || (isAtkTurn && !amIDefender)) {
            // 自分が攻撃側（または完全観戦中）なら攻撃コマンド
            options = [
                { label: "突撃", type: "charge" }, { label: "斉射", type: "bow" }, { label: "城攻め", type: "siege" },
                { label: "火計", type: "fire" }, { label: "謀略", type: "scheme" }, { label: "撤退", type: "retreat" }
            ];
        } else {
            // 自分が守備側なら守備コマンド
            options = [
                { label: "突撃", type: "def_charge" }, { label: "斉射", type: "def_bow" }, { label: "籠城", type: "def_attack" },
                { label: "謀略", type: "scheme" }, { label: "補修", type: "repair_setup" }
            ];
            if (this.game.castles.some(c => c.ownerClan === s.defender.ownerClan && c.id !== s.defender.id && GameSystem.isReachable(this.game, s.defender, c, s.defender.ownerClan))) {
                options.push({ label: "撤退", type: "retreat" });
            }
        }

        // コマンドボタンを画面に作ります（消さずに残します）
        this.warControls.innerHTML = '';
        options.forEach(cmd => {
            const btn = document.createElement('button');
            btn.textContent = cmd.label;
            btn.onclick = () => {
                // 自分の番の時だけボタンが効くようにします
                if(isMyTurn) this.game.warManager.execWarCmd(cmd.type);
            };
            this.warControls.appendChild(btn);
        });

        // ★追加：自分の番じゃない時は、ボタンの上に半透明の黒い膜（思考中ガード）をかぶせます！
        const guard = document.getElementById('war-ai-guard');
        if (!isMyTurn) {
            this.warControls.classList.add('disabled-area');
            if (guard) {
                guard.classList.remove('hidden');
                const textEl = document.getElementById('war-ai-guard-text');
                if (textEl) textEl.textContent = isAtkTurn ? "攻撃軍 思考中..." : "守備軍 思考中...";
            }
        } else {
            // 自分の番が回ってきたら膜を取り除きます
            this.warControls.classList.remove('disabled-area');
            if (guard) guard.classList.add('hidden');
        }
    }

    showRetreatSelector(castle, candidates, onSelect) {
        if (!this.scenarioScreen) return; 
        this.scenarioScreen.classList.remove('hidden'); 
        const title = this.scenarioScreen.querySelector('h2');
        if(title) title.textContent = "撤退先選択";
        
        if (this.scenarioList) {
            this.scenarioList.innerHTML = '';
            candidates.forEach(c => {
                const div = document.createElement('div'); div.className = 'scenario-item';
                div.innerHTML = `<div class="scenario-title">${c.name}</div><div class="scenario-desc">兵数:${c.soldiers} 防御:${c.defense}</div>`;
                div.onclick = () => { 
                    this.scenarioScreen.classList.add('hidden'); 
                    onSelect(c.id); 
                };
                this.scenarioList.appendChild(div);
            });
        }
    }

    showPrisonerModal(captives) {
        if (!this.prisonerModal) return;
        this.prisonerModal.classList.remove('hidden');
        if (this.prisonerList) {
            this.prisonerList.innerHTML = '';
            captives.forEach((p, index) => {
                const div = document.createElement('div');
                div.className = 'select-item';
                div.style.display = 'flex';
                div.style.justifyContent = 'space-between';
                div.style.alignItems = 'center';
                
                div.innerHTML = `
                    <div style="flex:1;">
                        <strong>${p.name}</strong> (${p.getRankName()})<br>
                        統:${p.leadership} 武:${p.strength} 智:${p.intelligence} 忠:${p.loyalty}
                    </div>
                    <div style="display:flex; gap:5px;">
                        <button class="btn-primary" onclick="window.GameApp.warManager.handlePrisonerAction(${index}, 'hire')">登用</button>
                        <button class="btn-secondary" onclick="window.GameApp.warManager.handlePrisonerAction(${index}, 'release')">解放</button>
                        <button class="btn-danger" onclick="window.GameApp.warManager.handlePrisonerAction(${index}, 'kill')">処断</button>
                    </div>
                `;
                this.prisonerList.appendChild(div);
            });
        }
    }
    closePrisonerModal() {
        if(this.prisonerModal) this.prisonerModal.classList.add('hidden');
    }

    showSuccessionModal(candidates, onSelect) {
        if (!this.successionModal) return;
        this.successionModal.classList.remove('hidden');
        if (this.successionList) {
            this.successionList.innerHTML = '';
            candidates.forEach(c => {
                const div = document.createElement('div');
                div.className = 'select-item';
                div.innerHTML = `<span>${c.name}</span> <span>統:${c.leadership} 政:${c.politics}</span>`;
                div.onclick = () => {
                    this.successionModal.classList.add('hidden');
                    onSelect(c.id);
                };
                this.successionList.appendChild(div);
            });
        }
    }
    
    // ★ここから下を追加：援軍を選ぶ画面を出す機能です
    showReinforcementSelector(candidateCastles, atkCastle, targetCastle, atkBushos, sVal, rVal, hVal, gVal) {
        if (!this.selectorModal) return;
        this.selectorModal.classList.remove('hidden');
        
        const title = document.getElementById('selector-title');
        if (title) title.textContent = "援軍の要請";

        const listHeader = document.querySelector('#selector-modal .list-header');
        if (listHeader) listHeader.style.display = 'none'; // ヘッダーは消す
        
        const backBtn = document.querySelector('#selector-modal .btn-secondary');
        if(backBtn) {
            backBtn.onclick = () => {
                // キャンセルしたら援軍なしで戦争スタート！
                if (listHeader) listHeader.style.display = '';
                this.closeSelector();
                this.game.warManager.startWar(atkCastle, targetCastle, atkBushos, sVal, rVal, hVal, gVal);
            };
        }

        const contextEl = document.getElementById('selector-context-info');
        if (contextEl) {
            contextEl.innerHTML = `<div>援軍を要請する城を選択してください。<br>（キャンセルすると援軍なしで出陣します）</div>`;
            contextEl.classList.remove('hidden');
        }

        if (this.selectorList) {
            this.selectorList.innerHTML = '';
            candidateCastles.forEach(c => {
                const clanData = this.game.clans.find(clan => clan.id === c.ownerClan);
                const clanName = clanData ? clanData.name : "不明";
                const rel = this.game.getRelation(this.game.playerClanId, c.ownerClan);
                
                const div = document.createElement('div');
                div.className = 'kunishu-item'; // デザインは国衆のものを流用して綺麗にします
                div.innerHTML = `<strong style="margin-right:10px;">${clanName} (${c.name})</strong> <span style="font-size:0.9rem; color:#555;">(兵数:${c.soldiers} 友好度:${rel.sentiment} [${rel.status}])</span>`;
                
                div.onclick = () => { 
                    if (listHeader) listHeader.style.display = '';
                    this.closeSelector();
                    // 城を選んだら、お金を送る画面に進みます！
                    this.showReinforcementGoldSelector(c, atkCastle, targetCastle, atkBushos, sVal, rVal, hVal, gVal);
                };
                this.selectorList.appendChild(div);
            });
        }
        
        if (this.selectorConfirmBtn) {
            this.selectorConfirmBtn.classList.add('hidden');
        }
    }

    showReinforcementGoldSelector(helperCastle, atkCastle, targetCastle, atkBushos, sVal, rVal, hVal, gVal) {
        // 相手を「支配」しているならお金は送らない
        const rel = this.game.getRelation(this.game.playerClanId, helperCastle.ownerClan);
        if (rel.status === '支配') {
            this.game.commandSystem.executeReinforcementRequest(0, helperCastle, atkCastle, targetCastle, atkBushos, sVal, rVal, hVal, gVal);
            return;
        }

        // お金を送るスライダー画面の準備
        if (!this.quantityModal) return;
        this.quantityModal.classList.remove('hidden'); 
        if (this.quantityContainer) this.quantityContainer.innerHTML = '';
        if (this.charityTypeSelector) this.charityTypeSelector.classList.add('hidden'); 
        if (this.tradeTypeInfo) this.tradeTypeInfo.classList.add('hidden'); 

        document.getElementById('quantity-title').textContent = "援軍の使者に持たせる金 (最大1500)"; 
        
        // 自分の城の金と1500の、少ない方が上限です
        const maxGold = Math.min(1500, atkCastle.gold);

        const wrap = document.createElement('div'); 
        wrap.className = 'qty-row'; 
        wrap.innerHTML = `
            <label>持参金 (Max: ${maxGold})</label>
            <div class="qty-control">
                <input type="range" id="range-reinf-gold" min="0" max="${maxGold}" value="0">
                <input type="number" id="num-reinf-gold" min="0" max="${maxGold}" value="0">
            </div>
            <div class="qty-shortcuts">
                <button class="qty-shortcut-btn" id="btn-min-reinf">最小</button>
                <button class="qty-shortcut-btn" id="btn-half-reinf">半分</button>
                <button class="qty-shortcut-btn" id="btn-max-reinf">最大</button>
            </div>
        `; 
        this.quantityContainer.appendChild(wrap); 

        const range = wrap.querySelector(`#range-reinf-gold`); 
        const num = wrap.querySelector(`#num-reinf-gold`); 
        
        const setVal = (v) => {
            if (v < 0) v = 0; if (v > maxGold) v = maxGold;
            range.value = v; num.value = v;
        };
        wrap.querySelector('#btn-min-reinf').onclick = () => setVal(0);
        wrap.querySelector('#btn-half-reinf').onclick = () => setVal(Math.floor(maxGold / 2));
        wrap.querySelector('#btn-max-reinf').onclick = () => setVal(maxGold);

        range.oninput = () => num.value = range.value; 
        num.oninput = () => {
            let v = parseInt(num.value);
            if (isNaN(v)) return; 
            setVal(v);
        };

        this.quantityConfirmBtn.onclick = () => {
            this.quantityModal.classList.add('hidden');
            const gold = parseInt(num.value) || 0;
            // 決定したら援軍の計算処理にバトンタッチ！
            this.game.commandSystem.executeReinforcementRequest(gold, helperCastle, atkCastle, targetCastle, atkBushos, sVal, rVal, hVal, gVal);
        };

        const cancelBtn = this.quantityModal.querySelector('.btn-secondary');
        if (cancelBtn) {
            cancelBtn.onclick = () => {
                this.quantityModal.classList.add('hidden');
                // キャンセルしたら援軍なしで戦争をスタートする！
                this.game.warManager.startWar(atkCastle, targetCastle, atkBushos, sVal, rVal, hVal, gVal);
            };
        }
    }
    
    // ★ここから追加: 守備側（攻められた時）の援軍を選ぶ画面です
    showDefReinforcementSelector(candidateCastles, defCastle, onComplete) {
        if (!this.selectorModal) return;
        this.selectorModal.classList.remove('hidden');
        const title = document.getElementById('selector-title');
        if (title) title.textContent = "防衛の援軍要請";

        const listHeader = document.querySelector('#selector-modal .list-header');
        if (listHeader) listHeader.style.display = 'none'; 
        
        const backBtn = document.querySelector('#selector-modal .btn-secondary');
        if(backBtn) {
            backBtn.onclick = () => {
                if (listHeader) listHeader.style.display = '';
                this.closeSelector();
                // キャンセルしたら援軍なしで迎撃・籠城の選択へ進みます
                onComplete();
            };
        }

        const contextEl = document.getElementById('selector-context-info');
        if (contextEl) {
            contextEl.innerHTML = `<div>敵が攻めてきました！援軍を要請する城を選択してください。<br>（キャンセルすると援軍なしで戦います）</div>`;
            contextEl.classList.remove('hidden');
        }

        if (this.selectorList) {
            this.selectorList.innerHTML = '';
            candidateCastles.forEach(c => {
                const clanData = this.game.clans.find(clan => clan.id === c.ownerClan);
                const rel = this.game.getRelation(this.game.playerClanId, c.ownerClan);
                const div = document.createElement('div');
                div.className = 'kunishu-item'; 
                div.innerHTML = `<strong style="margin-right:10px;">${clanData ? clanData.name : "不明"} (${c.name})</strong> <span style="font-size:0.9rem; color:#555;">(兵数:${c.soldiers} 友好度:${rel.sentiment} [${rel.status}])</span>`;
                
                div.onclick = () => { 
                    if (listHeader) listHeader.style.display = '';
                    this.closeSelector();
                    // 城を選んだら、お金の選択画面へ！
                    this.showDefReinforcementGoldSelector(c, defCastle, onComplete);
                };
                this.selectorList.appendChild(div);
            });
        }
        if (this.selectorConfirmBtn) this.selectorConfirmBtn.classList.add('hidden');
    }

    showDefReinforcementGoldSelector(helperCastle, defCastle, onComplete) {
        const rel = this.game.getRelation(this.game.playerClanId, helperCastle.ownerClan);
        if (rel.status === '支配') {
            this.game.warManager.executeDefReinforcement(0, helperCastle, defCastle, onComplete);
            return;
        }

        if (!this.quantityModal) return;
        this.quantityModal.classList.remove('hidden'); 
        if (this.quantityContainer) this.quantityContainer.innerHTML = '';
        if (this.charityTypeSelector) this.charityTypeSelector.classList.add('hidden'); 
        if (this.tradeTypeInfo) this.tradeTypeInfo.classList.add('hidden'); 

        document.getElementById('quantity-title').textContent = "援軍の使者に持たせる金 (最大1500)"; 
        const maxGold = Math.min(1500, defCastle.gold);

        const wrap = document.createElement('div'); 
        wrap.className = 'qty-row'; 
        wrap.innerHTML = `
            <label>持参金 (Max: ${maxGold})</label>
            <div class="qty-control">
                <input type="range" id="range-def-gold" min="0" max="${maxGold}" value="0">
                <input type="number" id="num-def-gold" min="0" max="${maxGold}" value="0">
            </div>
            <div class="qty-shortcuts">
                <button class="qty-shortcut-btn" id="btn-min-def">最小</button>
                <button class="qty-shortcut-btn" id="btn-half-def">半分</button>
                <button class="qty-shortcut-btn" id="btn-max-def">最大</button>
            </div>
        `; 
        this.quantityContainer.appendChild(wrap); 

        const range = wrap.querySelector(`#range-def-gold`); 
        const num = wrap.querySelector(`#num-def-gold`); 
        
        const setVal = (v) => {
            if (v < 0) v = 0; if (v > maxGold) v = maxGold;
            range.value = v; num.value = v;
        };
        wrap.querySelector('#btn-min-def').onclick = () => setVal(0);
        wrap.querySelector('#btn-half-def').onclick = () => setVal(Math.floor(maxGold / 2));
        wrap.querySelector('#btn-max-def').onclick = () => setVal(maxGold);

        range.oninput = () => num.value = range.value; 
        num.oninput = () => {
            let v = parseInt(num.value) || 0;
            setVal(v);
        };

        this.quantityConfirmBtn.onclick = () => {
            this.quantityModal.classList.add('hidden');
            const gold = parseInt(num.value) || 0;
            // 決定したら援軍の計算処理にバトンタッチ！
            this.game.warManager.executeDefReinforcement(gold, helperCastle, defCastle, onComplete);
        };

        // ★追加：キャンセルボタンが押されたときの処理
        const cancelBtn = this.quantityModal.querySelector('.btn-secondary');
        if (cancelBtn) {
            cancelBtn.onclick = () => {
                this.quantityModal.classList.add('hidden');
                onComplete(); // キャンセルしたら援軍なしで進める！
            };
        }
    }
    
}