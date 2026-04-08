/**
 * ui.js
 * 画面の見た目や操作（UI）を担当するファイルです。
 */

class UIManager {
    constructor(game) {
        this.game = game; this.currentCastle = null; this.menuState = 'MAIN';
        this.logHistory = [];
        this.mapScale = 1.0;
        this.selectedDaimyoId = null; // ★追加：選択中の大名を記憶する箱

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
        this.globalLoadingScreen = document.getElementById('global-loading-screen'); // ★追加：新しいロード画面を操作する準備
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
        
        this.pcNewUiContainer = document.getElementById('pc-new-ui-container');
        this.pcNewStatusPanel = document.getElementById('pc-new-status-panel');
        this.pcNewCommandArea = document.getElementById('pc-new-command-area');
        this.pcMenuPath = [];
        
        // ★ここを書き足します！
        // 情報表示の専門家（さっき作った新しい箱）を準備しておきます
        this.info = new UIInfoManager(this, this.game);
        
        this.warModal = document.getElementById('war-modal');
        this.warLog = document.getElementById('war-log');
        this.warControls = document.getElementById('war-controls');

        this.daimyoConfirmModal = document.getElementById('daimyo-confirm-modal');
        this.daimyoConfirmBody = document.getElementById('daimyo-confirm-body');

        this.unitDivideModal = document.getElementById('unit-divide-modal');

        this.bushoDetailModal = document.getElementById('busho-detail-modal');
        this.bushoDetailBody = document.getElementById('busho-detail-body');

        this.onResultModalClose = null;

        // ★結果画面の外側（黒い背景）を押して閉じた時にも音が鳴る
        if (this.resultModal) {
            this.resultModal.addEventListener('click', (e) => { 
                if (e.target === this.resultModal) { 
                    // ★ここから追加：選択が必須の画面（いつもの「閉じる」ボタンがない時）は、閉じられないように守ります！
                    const footer = document.getElementById('result-footer');
                    if (footer && !footer.innerHTML.includes('closeResultModal')) {
                        return; // 閉じずに何もしないで、そのまま待ちます
                    }
                    // ★追加ここまで

                    if (window.AudioManager) window.AudioManager.playSE('cancel.ogg'); 
                    this.closeResultModal(); 
                } 
            });
        }

        // ★ここから追加：単なるメッセージ表示のウインドウも、外側を押して閉じられるようにします！
        const dialogModal = document.getElementById('dialog-modal');
        if (dialogModal) {
            dialogModal.addEventListener('click', (e) => {
                // ウインドウの外側（黒い背景）を押したか確認します
                if (e.target === dialogModal) {
                    const cancelBtn = document.getElementById('dialog-btn-cancel');
                    // キャンセルボタンが隠れている（＝選択肢がない単なるメッセージの）時だけ閉じます
                    if (cancelBtn && cancelBtn.classList.contains('hidden')) {
                        const okBtn = document.getElementById('dialog-btn-ok');
                        if (okBtn) {
                            // 背景を押して閉じたので、キャンセルの音を鳴らして「閉じる」ボタンを押したことにします
                            if (window.AudioManager) window.AudioManager.playSE('cancel.ogg');
                            okBtn.click();
                        }
                    }
                }
            });
        }
        // ★追加ここまで
        
        if (this.mapZoomInBtn) {
            this.mapZoomInBtn.onclick = (e) => { e.stopPropagation(); this.changeMapZoom(1); };
        }
        if (this.mapZoomOutBtn) {
            this.mapZoomOutBtn.onclick = (e) => { e.stopPropagation(); this.changeMapZoom(-1); };
        }

        this.initMapDrag();
        this.initContextMenu();
        this.initSidebarResize(); 
        let lastTouchEnd = 0;
        document.addEventListener('touchend', (event) => {
            const now = (new Date()).getTime();
            if (now - lastTouchEnd <= 300) {
                event.preventDefault(); 
            }
            lastTouchEnd = now;

            // ★ここから書き足し：タッチが終わった瞬間に、ボタンなどから「カーソルが乗っている状態」を強制的に引き剥がす魔法です！
            if (event.target && typeof event.target.blur === 'function') {
                setTimeout(() => {
                    event.target.blur();
                }, 50); // クリックの邪魔にならないよう、ほんの少しだけ待ってから引き剥がします
            }
            // ★書き足すのはここまで！
        }, false);
        
        document.addEventListener('touchmove', (e) => {
            if (e.touches.length > 1) {
                e.preventDefault();
            }
        }, { passive: false });
        
        const titleScreen = document.getElementById('title-screen');
        const tapMessage = document.getElementById('tap-to-proceed');
        const menuButtons = document.getElementById('menu-buttons');

        if (titleScreen && tapMessage && menuButtons) {
            // ★ async（アシンク）をつけて、「待つ」魔法を使えるようにします
            const onTitleClick = async () => {
                // 何度も押されないように、1回押されたらクリックの魔法を解除します
                titleScreen.removeEventListener('click', onTitleClick);

                // ★追加：ここで専用のロード画面をパッと出します！
                this.showLoadingScreen();

                // 音を鳴らす準備（ブラウザのルールで、ユーザーが画面を触った瞬間に鳴らすのが一番安全です）
                if (window.AudioManager) {
                    window.AudioManager.playBGM('SC_ex_Town1_Castle.ogg');
                }

                // ★ 画像と音声を並列（一斉）に読み込むためのリストを作ります
                const imageUrls = [
                    './data/images/map/japan_map.png',
                    './data/images/map/shiro_icon001.png',
                    './data/images/map/japan_colorcode_map.png',
                    './data/images/map/japan_white_map.png',
                    './data/images/map/japan_provinces.png'
                ];
                const audioUrls = [
                    'data/music/bgm/SC_ex_Town1_Castle.ogg',
                    'data/music/bgm/SC_ex_Town2_Fortress.ogg',
                    'data/music/se/decision.ogg',
                    'data/music/se/choice.ogg',
                    'data/music/se/cancel.ogg'
                ];

                // すべてのファイルを「一斉に」読み込み開始します
                const promises = [
                    ...imageUrls.map(url => new Promise(res => {
                        const img = new Image();
                        img.onload = img.onerror = res;
                        img.src = url;
                    })),
                    ...audioUrls.map(url => new Promise(res => {
                        const audio = new Audio();
                        audio.oncanplaythrough = audio.onerror = res;
                        audio.src = url;
                        audio.load();
                    }))
                ];

                // 全員の準備が整うのを待ちます
                await Promise.all(promises);

                // 準備が終わったら、メッセージを隠してメニューボタンを出します！
                tapMessage.classList.add('hidden');
                menuButtons.classList.remove('hidden');

                // ★追加：裏側の準備がすべて終わったら、ロード画面をサッと隠します！
                this.hideLoadingScreen();
            };
            titleScreen.addEventListener('click', onTitleClick);
        }
        
        document.addEventListener('wheel', (e) => {
            const listObj = e.target.closest('.list-container, .result-body, #divide-list, .daimyo-list-container, .faction-list-container');
            if (listObj) {
                e.preventDefault();
                listObj.scrollBy({ top: Math.sign(e.deltaY) * 30, behavior: 'smooth' });
            }
        }, { passive: false });
        
        let isListMouseDown = false;
        let hasListDragged = false;
        let listStartY = 0;
        let listStartScrollY = 0;
        let currentDragList = null;
        let lastDragDelta = 0; 

        document.addEventListener('mousedown', (e) => {
            if (!document.body.classList.contains('is-pc')) return;

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
                    lastDragDelta = 0; 
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
                lastDragDelta = walk; 
            }
        });

        const endListDrag = () => {
            if (isListMouseDown) {
                if (currentDragList && hasListDragged) {
                    currentDragList.style.scrollSnapType = 'y mandatory';
                    document.body.style.userSelect = '';
                    if (lastDragDelta < 0) {
                        currentDragList.scrollBy({ top: 15, behavior: 'smooth' }); 
                    } else {
                        currentDragList.scrollBy({ top: -15, behavior: 'smooth' }); 
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

        this.dialogQueue = []; 
        this.isDialogShowing = false; 

        document.addEventListener('click', (e) => {
            const btn = e.target.closest('button');
            if (!btn) return; 

            // ★追加：合戦のコマンドボタンは個別に音を鳴らすので、共通の音をキャンセルします！
            if (btn.closest('#war-controls')) return;

            const text = btn.textContent.trim();
            
            // ★ここを書き足し！：個別に音を鳴らす設定をしたボタンは、共通の「decision.ogg」をキャンセルします
            if (["一括", "直轄", "委任", "不可", "許可"].includes(text)) return;

            if (window.AudioManager) {
                // ★「シナリオ選択に戻る」をリストに仲間入りさせます！
                if (["戻る", "閉じる", "拒否", "やめる", "撤退", "解放", "処断", "シナリオ選択に戻る"].includes(text)) {
                    window.AudioManager.playSE('cancel.ogg');
                } else {
                    window.AudioManager.playSE('decision.ogg');
                }
            }
        }, true);
        
        let resizeTimer = null;
        let savedLogicalX = null;
        let savedLogicalY = null;

        window.addEventListener('resize', () => {
            if (this.hasInitializedMap && this.game && (this.game.phase === 'game' || this.game.phase === 'daimyo_select')) {
                if (resizeTimer) clearTimeout(resizeTimer);
                
                resizeTimer = setTimeout(() => {
                    const sc = document.getElementById('map-scroll-container');
                    if (!sc) return;
                    const currentLeft = parseFloat(this.mapEl.style.left || 0);
                    const currentTop = parseFloat(this.mapEl.style.top || 0);
                    const logX = (sc.scrollLeft + sc.clientWidth / 2 - currentLeft) / this.mapScale;
                    const logY = (sc.scrollTop + sc.clientHeight / 2 - currentTop) / this.mapScale;

                    this.fitMapToScreen();
                    
                    const newLeft = parseFloat(this.mapEl.style.left || 0);
                    const newTop = parseFloat(this.mapEl.style.top || 0);
                    sc.scrollLeft = (logX * this.mapScale + newLeft) - sc.clientWidth / 2;
                    sc.scrollTop = (logY * this.mapScale + newTop) - sc.clientHeight / 2;
                }, 200); 
            }
        });
    } 
    
    hideAIGuardTemporarily() {
        const aiGuard = document.getElementById('ai-guard');
        if (aiGuard && !aiGuard.classList.contains('hidden')) {
            aiGuard.classList.add('hidden');
            this.guardHiddenCount = (this.guardHiddenCount || 0) + 1;
        } else if (this.guardHiddenCount > 0) {
            this.guardHiddenCount++; 
        }
    }
    
    // ==========================================
    // ★ここから追加！：AI思考中に進捗を表示する魔法です！
    updateAIProgress(current, total) {
        if (!this.aiGuard) return;
        // ぐるぐる回るアイコンと一緒に、「思考中... (今の数/全部の数)」と表示します
        this.aiGuard.innerHTML = `<div class="loading-spinner"></div>思考中... (${current}/${total})`;
    }
    // ★追加ここまで！
    // ==========================================

    async waitForDialogs() {
        const isVisible = (id) => {
            const el = document.getElementById(id);
            return el && !el.classList.contains('hidden');
        };

        let didWait = false; 

        // ★書き換え：チェックする条件をひとまとめにします
        const checkActive = () => {
            return (this.dialogQueue && this.dialogQueue.length > 0) ||
            isVisible('dialog-modal') ||
            isVisible('result-modal') ||
            isVisible('intercept-confirm-modal') ||
            isVisible('unit-divide-modal') ||
            isVisible('prisoner-modal') ||
            isVisible('selector-modal') || 
            isVisible('quantity-modal') || 
            isVisible('war-modal') ||      // ★ここを追加！！！戦争画面が開いている間も待ちます！
            isVisible('cutin-overlay') ||  // ★ここを書き足し！！！月替わりのカットイン表示中も絶対に待ちます！
            this.game.selectionMode != null;
        };

        while (checkActive()) {
            didWait = true; 
            await new Promise(resolve => setTimeout(resolve, 200));
            
            // ★追加：ダイアログが消えたと思っても、次のダイアログが出るまでの隙間（プログラムの準備時間）を考慮して、念のため少し待ってからもう一度確認します！
            if (!checkActive()) {
                await new Promise(resolve => setTimeout(resolve, 500)); 
            }
        }
        
        if (didWait) {
            await new Promise(resolve => setTimeout(resolve, 100));
        }
    }
    
    restoreAIGuard() {
        if (this.guardHiddenCount > 0) {
            this.guardHiddenCount--;
            if (this.guardHiddenCount === 0 && this.game && this.game.isProcessingAI) {
                // ★追加：マップで援軍の城を選んでいる最中は、絶対に膜を復活させない魔法！
                if (!this.game.selectionMode) {
                    const aiGuard = document.getElementById('ai-guard');
                    if (aiGuard) aiGuard.classList.remove('hidden');
                }
            }
        }
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

    showDialogAsync(msg, isConfirm = false, autoCloseTime = 0) {
        return new Promise(resolve => {
            this.dialogQueue.push({ msg, isConfirm, onOk: resolve, onCancel: resolve, autoCloseTime });
            if (!this.isDialogShowing) {
                this.processDialogQueue();
            }
        });
    }

    showDialog(msg, isConfirm, onOk, onCancel = null) {
        this.dialogQueue.push({ msg, isConfirm, onOk, onCancel, autoCloseTime: 0 });
        if (!this.isDialogShowing) {
            this.processDialogQueue();
        }
    }

    processDialogQueue() {
        if (this.dialogQueue.length === 0) {
            this.isDialogShowing = false;
            return;
        }

        this.isDialogShowing = true;
        const dialog = this.dialogQueue.shift(); 

        const modal = document.getElementById('dialog-modal');
        const msgEl = document.getElementById('dialog-message');
        const okBtn = document.getElementById('dialog-btn-ok');
        const cancelBtn = document.getElementById('dialog-btn-cancel');

        this.hideAIGuardTemporarily();

        if (!modal) {
            if (dialog.isConfirm) {
                if (confirm(dialog.msg)) { if (dialog.onOk) dialog.onOk(); } else { if (dialog.onCancel) dialog.onCancel(); }
            } else {
                alert(dialog.msg);
                if (dialog.onOk) dialog.onOk();
            }
            this.restoreAIGuard(); 
            this.processDialogQueue(); 
            return;
        }

        msgEl.innerHTML = dialog.msg.replace(/\n/g, '<br>');
        
        let autoCloseTimer = null;

        const cleanupAndNext = (callback) => {
            if (autoCloseTimer) clearTimeout(autoCloseTimer);
            modal.classList.add('hidden');
            
            this.restoreAIGuard();

            // ★追加：ダイアログを閉じた時に、鳴っているSEを0.1秒でスッと消す魔法です！
            if (window.AudioManager && typeof window.AudioManager.fadeOutSe === 'function') {
                window.AudioManager.fadeOutSe(0.1);
            }

            // ★ここを書き足します！：今のダイアログが閉じたので「表示中」の合図を消します！
            this.isDialogShowing = false;

            const executeNext = () => {
                setTimeout(() => {
                    this.processDialogQueue();
                }, 10);
            };

            try {
                if (callback) {
                    const result = callback();
                    if (result instanceof Promise) {
                        result.catch(e => console.error(e)).finally(executeNext);
                        return; 
                    }
                }
            } catch (e) {
                console.error("ダイアログの処理中にエラー:", e);
            }
            
            executeNext();
        };

        okBtn.onclick = () => { okBtn.onclick = null; cleanupAndNext(dialog.onOk); };

        const footer = okBtn.parentElement; // ★追加：ボタンが入っているフッターの箱を取得します

        if (dialog.isConfirm) {
            cancelBtn.classList.remove('hidden'); 
            cancelBtn.onclick = () => { cancelBtn.onclick = null; cleanupAndNext(dialog.onCancel); };
            okBtn.textContent = '了承';
            okBtn.className = 'btn-primary';
            footer.style.justifyContent = 'center';
        } else {
            cancelBtn.classList.add('hidden'); 
            okBtn.textContent = '閉じる';
            okBtn.className = 'btn-secondary';
            footer.style.justifyContent = 'center';
        }

        modal.classList.remove('hidden');

        if (dialog.autoCloseTime > 0) {
            autoCloseTimer = setTimeout(() => {
                if (!modal.classList.contains('hidden')) {
                    okBtn.click();
                }
            }, dialog.autoCloseTime);
        }
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

        return `<div class="status-bar-container ${emptyBgClass}"><div class="status-bar-fill ${fillClass}" style="width: ${percent}%;"></div><div class="status-bar-text">${displayText}</div></div>`;
    }

    initContextMenu() {
        // 右クリックや長押しのメニューはバグの温床になるので、まるごと封印しました！
        this.contextMenu = document.getElementById('custom-context-menu');
    }

    showContextMenu(x, y) {
        // メニューを出さないように、魔法を空っぽにしました！
    }

    hideContextMenu() {
        // エラーが出ないように、念のため「メニューを隠す」お約束だけ残しておきます
        if (this.contextMenu) this.contextMenu.classList.add('hidden');
    }

    // ★追加：ロード画面をパッと出す魔法
    showLoadingScreen() {
        if (this.globalLoadingScreen) {
            this.globalLoadingScreen.classList.remove('hidden');
        }
    }

    // ★追加：ロード画面をサッと隠す魔法
    hideLoadingScreen() {
        if (this.globalLoadingScreen) {
            this.globalLoadingScreen.classList.add('hidden');
        }
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
        if(this.aiGuard) this.aiGuard.classList.add('hidden'); 
        
        // ★ここから追加：さっき作った、コマンドを初期化して隠す魔法をここでも使います！
        if (typeof this.clearCommandMenu === 'function') {
            this.clearCommandMenu();
        }
        
        // ★ここから書き足し：前に遊んでいた時の画面の枠をしっかり隠します！
        if(this.panelEl) this.panelEl.classList.add('hidden'); // PC版のサイドバーを隠します
        if(this.statusContainer) this.statusContainer.innerHTML = ''; // PC版の上の情報も消します
        if(this.pcNewUiContainer) this.pcNewUiContainer.classList.add('hidden');
        if(this.pcNewStatusPanel) this.pcNewStatusPanel.innerHTML = '';
        if(this.pcNewCommandArea) this.pcNewCommandArea.innerHTML = '';
        if(this.mobileTopLeft) this.mobileTopLeft.innerHTML = ''; // スマホ版の上の情報を消します
        if(this.mobileFloatingInfo) this.mobileFloatingInfo.innerHTML = ''; // スマホ版の時計を消します
        if(this.mobileFloatingMarket) this.mobileFloatingMarket.innerHTML = ''; // スマホ版の相場を消します
        const cmdGrid = document.getElementById('command-area');
        if(cmdGrid) cmdGrid.style.display = 'none'; // スマホ版のボタン置き場を隠します
        // ★書き足すのはここまで！

        this.hideContextMenu();
    }

    log(msg) { 
        this.logHistory.unshift(`[${this.game.year}年${this.game.month}月] ${msg}`);
        if(this.logHistory.length > 50) this.logHistory.pop();
        
        if(this.game.warManager && this.game.warManager.state.active && this.game.warManager.state.isPlayerInvolved && this.warLog) {
             const div = document.createElement('div');
             div.innerHTML = msg; // ★textContent から innerHTML に変更しました！
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
                div.innerHTML = log; // ★textContent から innerHTML に変更しました！
                div.style.borderBottom = "1px solid #eee";
                div.style.padding = "5px";
                div.style.fontSize = "0.85rem";
                this.historyList.appendChild(div);
            });
        }
    }
    
    showDaimyoList() {
        this.info.showDaimyoList();
    }
    
    // ==========================================
    // ★大名家詳細画面を表示する魔法
    // ==========================================
    showDaimyoDetail(clanId) {
        this.info.showDaimyoDetail(clanId);
    }

    // ==========================================
    // ★姫一覧と姫選択画面の案内板
    // ==========================================
    showPrincessList() {
        this.info.showPrincessList();
    }

    showPrincessSelector(targetCastleId, doerId) {
        this.info.showPrincessSelector(targetCastleId, doerId);
    }

    // ==========================================
    // ★ここから追加：委任する城の一覧を出す魔法
    // ==========================================
    showDelegateListModal() {
        const modal = document.getElementById('delegate-list-modal');
        const listEl = document.getElementById('delegate-list');
        if (!modal || !listEl) return;

        // 大名のいる城（本拠地）を探します
        const daimyo = this.game.bushos.find(b => b.clan === this.game.playerClanId && b.isDaimyo);
        const daimyoCastleId = daimyo ? daimyo.castleId : -1;

        // 自分の城のリストを作成（大名のいる城は除外します）
        const myCastles = this.game.castles.filter(c => c.ownerClan === this.game.playerClanId && c.id !== daimyoCastleId);

        // ==========================================
        // ★ここから追加！：一括切替ボタンの魔法
        // ==========================================
        const toggleAllBtn = document.getElementById('btn-toggle-all-delegate');
        if (toggleAllBtn) {
            // 今、リストにある城が「すべて委任状態」になっているか調べます
            const isAllDelegated = myCastles.length > 0 && myCastles.every(c => c.isDelegated);
            
            // ★書き換え！：ボタンの文字だけでなく、背景色と枠線の色も一緒に変えます
            if (isAllDelegated) {
                toggleAllBtn.textContent = '一括';
                toggleAllBtn.style.color = '#d32f2f';             // 文字を赤に
                toggleAllBtn.style.backgroundColor = '#ffebee';   // 背景を薄い赤に
                toggleAllBtn.style.borderColor = '#d32f2f';       // 枠線を赤に
            } else {
                toggleAllBtn.textContent = '一括';
                toggleAllBtn.style.color = '#1976d2';             // 文字を青に
                toggleAllBtn.style.backgroundColor = '#e3f2fd';   // 背景を薄い青に
                toggleAllBtn.style.borderColor = '#1976d2';       // 枠線を青に
            }

            // ボタンを押した時の処理
            toggleAllBtn.onclick = () => {
                if (window.AudioManager) window.AudioManager.playSE('choice.ogg');
                
                // 今が「すべて委任」なら全員「直轄(false)」に、それ以外なら全員「委任(true)」にします！
                const newState = !isAllDelegated;
                myCastles.forEach(c => c.isDelegated = newState);
                
                // もう一度画面を描き直して、文字や色を更新します
                this.showDelegateListModal();
            };
        }
        // ★追加ここまで！
        // ==========================================

        listEl.innerHTML = '';
        if (myCastles.length === 0) {
            listEl.innerHTML = '<div style="padding: 10px; text-align: center;">委任できる城がありません。</div>';
        } else {
            myCastles.forEach(c => {
                const div = document.createElement('div');
                div.className = 'select-item';
                div.style.display = 'flex';
                div.style.justifyContent = 'space-between';
                div.style.padding = '15px';
                
                // 直轄なら赤っぽく、委任なら青っぽく文字色を変えます
                const statusColor = c.isDelegated ? '#1976d2' : '#d32f2f';
                const statusText = c.isDelegated ? '委任' : '直轄';
                
                div.innerHTML = `
                    <span style="font-weight:bold; font-size: 1.1rem;">${c.name}</span>
                    <span style="color:${statusColor}; font-weight:bold; font-size: 1.1rem;">${statusText}</span>
                `;
                
                div.onclick = () => {
                    if (window.AudioManager) window.AudioManager.playSE('choice.ogg');
                    // 城をクリックしたら、個別の設定画面を開きます
                    this.showDelegateSettingModal(c, () => {
                        // 戻ってきたら一覧を更新して出し直します
                        this.showDelegateListModal();
                    });
                };
                listEl.appendChild(div);
            });
        }
        if (listEl) {
            listEl.scrollTop = 0;
        }
        modal.classList.remove('hidden');
    }

    // 個別の「直轄・委任」切り替え画面を出す魔法
    // 個別の「直轄・委任・詳細設定」画面を出す魔法
    showDelegateSettingModal(castle, onBack) {
        const modal = document.getElementById('delegate-setting-modal');
        const title = document.getElementById('delegate-setting-title');
        const btnDirect = document.getElementById('btn-direct-control');
        const btnDelegate = document.getElementById('btn-delegate-control');
        
        // 詳細設定のボタンたち
        const optionsDiv = document.getElementById('delegate-options');
        const btnAttackDeny = document.getElementById('btn-attack-deny');
        const btnAttackAllow = document.getElementById('btn-attack-allow');
        const btnMoveDeny = document.getElementById('btn-move-deny');
        const btnMoveAllow = document.getElementById('btn-move-allow');

        if (!modal || !title || !btnDirect || !btnDelegate) return;

        title.textContent = `${castle.name} の委任設定`;

        // ボタンの色や状態を更新する魔法
        const updateButtons = () => {
            // ① 直轄か委任かの表示
            if (castle.isDelegated) {
                btnDelegate.classList.add('active');
                btnDirect.classList.remove('active');
                
                // 委任中は詳細設定を選べるようにします
                optionsDiv.style.opacity = '1';
                btnAttackDeny.disabled = false;
                btnAttackAllow.disabled = false;
                btnMoveDeny.disabled = false;
                btnMoveAllow.disabled = false;
            } else {
                btnDirect.classList.add('active');
                btnDelegate.classList.remove('active');
                
                // 直轄中は詳細設定を選べないように（半透明に）します
                optionsDiv.style.opacity = '0.5';
                btnAttackDeny.disabled = true;
                btnAttackAllow.disabled = true;
                btnMoveDeny.disabled = true;
                btnMoveAllow.disabled = true;
            }

            // ② 城攻の設定表示
            if (castle.allowAttack) {
                btnAttackAllow.classList.add('active-allow');
                btnAttackAllow.classList.remove('active');
                btnAttackDeny.classList.remove('active', 'active-allow');
            } else {
                btnAttackDeny.classList.add('active');
                btnAttackDeny.classList.remove('active-allow');
                btnAttackAllow.classList.remove('active', 'active-allow');
            }

            // ③ 武将移動の設定表示
            if (castle.allowMove) {
                btnMoveAllow.classList.add('active-allow');
                btnMoveAllow.classList.remove('active');
                btnMoveDeny.classList.remove('active', 'active-allow');
            } else {
                btnMoveDeny.classList.add('active');
                btnMoveDeny.classList.remove('active-allow');
                btnMoveAllow.classList.remove('active', 'active-allow');
            }
        };

        updateButtons(); // 画面を開いた時の色をセット

        // それぞれのボタンを押した時の処理
        btnDirect.onclick = () => {
            if (window.AudioManager) window.AudioManager.playSE('choice.ogg');
            castle.isDelegated = false;
            updateButtons();
        };
        btnDelegate.onclick = () => {
            if (window.AudioManager) window.AudioManager.playSE('choice.ogg');
            castle.isDelegated = true;
            updateButtons();
        };
        btnAttackDeny.onclick = () => {
            if (window.AudioManager) window.AudioManager.playSE('choice.ogg');
            castle.allowAttack = false;
            updateButtons();
        };
        btnAttackAllow.onclick = () => {
            if (window.AudioManager) window.AudioManager.playSE('choice.ogg');
            castle.allowAttack = true;
            updateButtons();
        };
        btnMoveDeny.onclick = () => {
            if (window.AudioManager) window.AudioManager.playSE('choice.ogg');
            castle.allowMove = false;
            updateButtons();
        };
        btnMoveAllow.onclick = () => {
            if (window.AudioManager) window.AudioManager.playSE('choice.ogg');
            castle.allowMove = true;
            updateButtons();
        };

        const backBtn = modal.querySelector('.btn-secondary');
        if (backBtn) {
            backBtn.onclick = () => {
                modal.classList.add('hidden');
                if (onBack) onBack(); // 戻るボタンで一覧画面に戻ります
            };
        }

        modal.classList.remove('hidden');
    }
    
    showDiplomacyList(clanId, clanName) {
        this.info.showDiplomacyList(clanId, clanName);
    }
    
    showFactionList(clanId, isDirect = false) {
        this.info.showFactionList(clanId, isDirect);
    }

    showResultModal(msg, onClose = null, customFooterHtml = null) { 
        this.hideAIGuardTemporarily(); 
        if (this.resultBody) {
            this.resultBody.innerHTML = msg.replace(/\n/g, '<br>');
            // ここがリストを一番上に戻す魔法です！
            this.resultBody.scrollTop = 0;
        }
        const footer = document.getElementById('result-footer');
        if (footer) {
            if (customFooterHtml !== null) {
                footer.innerHTML = customFooterHtml;
            } else {
                // ★変更：青色（btn-primary）からグレー（btn-secondary）に変更します！
                footer.innerHTML = `<button class="btn-secondary" onclick="window.GameApp.ui.closeResultModal()">閉じる</button>`;
            }
        }
        if (this.resultModal) this.resultModal.classList.remove('hidden'); 
        this.onResultModalClose = onClose;
    }
    
    closeResultModal() { 
        if (this.resultModal) this.resultModal.classList.add('hidden'); 
        this.restoreAIGuard(); 
        
        // ★追加：結果画面を閉じた時に、鳴っているSEを0.1秒でスッと消す魔法です！
        if (window.AudioManager && typeof window.AudioManager.fadeOutSe === 'function') {
            window.AudioManager.fadeOutSe(0.1);
        }

        // ★ここから書き足します！
        // 小窓を閉じる時に、必ず「いつもの閉じるボタン」に戻しておきます！
        const footer = document.getElementById('result-footer');
        if (footer) {
            // ★変更：青色（btn-primary）からグレー（btn-secondary）に変更します！
            footer.innerHTML = `<button class="btn-secondary" onclick="window.GameApp.ui.closeResultModal()">閉じる</button>`;
        }
        // ★書き足すのはここまで！
        
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
        this.restoreAIGuard(); 
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
    
    // 専用のメッセージ魔法はもう使わないので、お掃除しました！
    
    showScenarioSelection(scenarios, onSelect) {
        this.forceResetModals();
        if (!this.scenarioScreen) return;
        this.scenarioScreen.classList.remove('hidden'); 
        
        const descBox = document.getElementById('scenario-desc-box');
        if (descBox) {
            descBox.style.display = 'none';
            descBox.innerHTML = '';
        }

        if (this.scenarioList) {
            this.scenarioList.innerHTML = '';
            // 縦並びにしてスクロールを禁止する魔法のクラスに書き換えます
            this.scenarioList.className = 'scenario-list-vertical';
            
            let selectedScenario = null; // 今選ばれているシナリオを覚えておく箱です

            scenarios.forEach((s, index) => {
                const div = document.createElement('div'); 
                div.className = 'clan-btn';
                // 名前だけを真ん中に表示するようにします
                div.innerHTML = `<strong>${s.name}</strong>`;
                
                div.onclick = () => { 
                    // 1回目に押した時（選択した時）
                    if (selectedScenario !== s) {
                        if (window.AudioManager) window.AudioManager.playSE('choice.ogg');
                        
                        // 他のボタンの色を元に戻して、今押したボタンだけ色を変えます
                        Array.from(this.scenarioList.children).forEach(child => child.classList.remove('selected'));
                        div.classList.add('selected');
                        selectedScenario = s;

                        // 下の説明用の窓に文章を出して、見えるようにします
                        if (descBox) {
                            descBox.innerHTML = `<strong style="font-size:1.1rem;">${s.name}</strong><br><br>${s.desc}`;
                            descBox.style.display = 'block';
                        }
                    } 
                    // 2回目に押した時（決定した時）
                    else {
                        if (window.AudioManager) window.AudioManager.playSE('decision.ogg');
                        
                        this.scenarioScreen.classList.add('hidden'); 
                        onSelect(s.folder); 
                    }
                };
                this.scenarioList.appendChild(div);

                // 一番最初のシナリオ（indexが0）なら、最初から選んだ状態にします
                if (index === 0) {
                    div.classList.add('selected');
                    selectedScenario = s;
                    if (descBox) {
                        descBox.innerHTML = `<strong style="font-size:1.1rem;">${s.name}</strong><br><br>${s.desc}`;
                        descBox.style.display = 'block';
                    }
                }
            });
        }
    }
    async returnToTitle() { 
        // ★追加：お掃除を始める前に、画面をロード画面で隠します
        this.showLoadingScreen();
        await new Promise(resolve => setTimeout(resolve, 50));

        this.forceResetModals();
        const ts = document.getElementById('title-screen');
        if(ts) ts.classList.remove('hidden'); 
        
        // ★ここから下を書き足します！
        if (window.AudioManager) {
            window.AudioManager.playBGM('SC_ex_Town1_Castle.ogg');
        }
        // ★書き足すのはここまで！

        // ★追加：お掃除が終わってタイトル画面が出たら、少し待ってからロード画面を隠します
        await new Promise(resolve => setTimeout(resolve, 100));
        this.hideLoadingScreen();
    }
    
    // ★ ここをごっそり差し替え！：大名選択の確認画面を、ギュッと小さくコンパクトにする魔法です！
    showDaimyoConfirmModal(clanId, clanName, soldiers, leader, onStart) {
        // 情報専門の ui_info.js にまるごとお任せします
        this.info.showDaimyoConfirmModal(clanId, clanName, soldiers, leader, onStart);
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
        
        let provinceName = "";
        if (this.game.provinces) {
            const province = this.game.provinces.find(p => p.id === castle.provinceId);
            if (province) {
                provinceName = province.province;
            }
        }
        
        let faceHtml = "";
        if (castellan && castellan.faceIcon) {
            faceHtml = `<img src="data/images/faceicons/${castellan.faceIcon}" onerror="this.style.display='none'">`;
        }

        // ★ここから追加：城が「保護期間（戦乱）」かどうかをチェックする魔法です！
        let isProtected = false;
        // ゲーム内の「immunityUntil」という数字で管理されている保護期間をチェックします！
        if (castle.immunityUntil && castle.immunityUntil >= this.game.getCurrentTurnId()) {
            isProtected = true;
        } 
        // もし statusEffects という「状態異常のシール」で管理されていた場合
        else if (castle.statusEffects && castle.statusEffects.includes('戦乱')) {
            isProtected = true;
        }

        // 戦乱中や一揆中なら、マークの部品を作ります
        let statusMarks = "";
        if (isProtected) {
            statusMarks += `<span class="sp-senran-mark">戦乱</span>`;
        }
        // ★追加：一揆状態なら、一揆マークを並べて追加します！
        if (castle.statusEffects && castle.statusEffects.includes('一揆')) {
            // 戦乱マークと同じデザイン（クラス）を使いつつ、横に並んだ時にくっつかないよう隙間をあけます
            statusMarks += `<span class="sp-senran-mark" style="margin-left: 5px;">一揆</span>`;
        }

        let clanHtml = "";
        if (Number(castle.ownerClan) !== 0) {
            clanHtml = `<span class="sp-clan">${clanName}</span>`;
        }

        let content = `
            <div class="sp-info-header">
                ${clanHtml}
                <span class="sp-province">${provinceName}</span>
                <span class="sp-castle">${castle.name}${statusMarks}</span>
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
                <div class="sp-footer-box"><span>金</span><span>${mask(castle.gold)}</span></div>
                <div class="sp-footer-box"><span>兵糧</span><span>${mask(castle.rice)}</span></div>
                <div class="sp-footer-box"><span>兵数</span><span>${mask(castle.soldiers)}</span></div>
            </div>
        `;

        if (this.mobileTopLeft) {
            this.mobileTopLeft.innerHTML = content;
        }
        
        if (this.statusContainer && document.body.classList.contains('is-pc')) {
            this.statusContainer.innerHTML = content;
        }
        
        if (this.pcNewStatusPanel && document.body.classList.contains('is-pc')) {
            this.pcNewStatusPanel.innerHTML = content;
        }

        if (this.mobileFloatingInfo) {
            this.mobileFloatingInfo.innerHTML = `
                <div class="floating-time">${this.game.year}年 ${this.game.month}月</div>
            `;
        }

        // ★城にいる浪人の数を数える魔法！
        let roninCount = 0;
        if (this.game && this.game.bushos) {
            // 状態が「浪人（ronin）」になっている人を数えるように変更します！
            roninCount = this.game.bushos.filter(b => b.castleId === castle.id && b.status === 'ronin').length;
        }

        // ★今の城がある「国（地方）」の米相場を調べます！
        let currentRate = 1.0;
        if (castle && this.game.provinces) {
            const province = this.game.provinces.find(p => p.id === castle.provinceId);
            if (province && province.marketRate !== undefined) {
                currentRate = province.marketRate;
            }
        }

        if (this.mobileFloatingMarket) {
            // ★根本解決：見えない空白ブロックが生まれないように、絶対に改行せずに1行で繋げて出力します！
            this.mobileFloatingMarket.innerHTML = `<div class="floating-market">浪人 ${roninCount}人</div><div class="floating-market">米相場 ${currentRate.toFixed(1)}</div>`;
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
        
        // ★修正：敵のターン中（AIターン）に援軍のために自城をクリックした時、
        // AIフラグが勝手に消し飛んでしまわないように守ります！
        if (Number(castle.ownerClan) === Number(this.game.playerClanId)) {
            if (!this.game.selectionMode && !this.game.isProcessingAI) {
                this.game.isProcessingAI = false;
            }
        }
        
        // パソコンの画面のときは、古いサイドバーを隠して新しい箱を出します
        if (document.body.classList.contains('is-pc')) {
            if(this.panelEl) this.panelEl.classList.add('hidden');
            if(this.pcNewUiContainer) this.pcNewUiContainer.classList.remove('hidden');
        } else {
            // スマホの画面のときは、今まで通りの箱を出します
            if(this.panelEl) this.panelEl.classList.remove('hidden');
            if(this.pcNewUiContainer) this.pcNewUiContainer.classList.add('hidden');
        }
        this.updatePanelHeader();
        
        // ★ 変更：マップで何かを選んでいる最中は、専用の「戻る」メニューにします！
        if (this.game.selectionMode) {
            this.renderSelectionModeMenu();
        }
        else if (Number(castle.ownerClan) === Number(this.game.playerClanId)) {
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
        this.updateCastleGlows();
    }
    
    // ★ マップ選択中専用の、スッキリしたメニューを描く魔法
    renderSelectionModeMenu() {
        const capturedMode = this.game.selectionMode;
        const capturedData = this.game.tempReinfData;

        // ★最強の魔法：メニューが作られた時、援軍の気配が少しでもあれば、UI自身に「絶対に消えないフラグ」を立てます！
        const modeStrForCheck = String(capturedMode || "");
        if (modeStrForCheck.includes('reinf') || modeStrForCheck.includes('ally') || modeStrForCheck.includes('self') || capturedData) {
            this._activeReinforcementFlag = true;
        }
        
        const mobileArea = document.getElementById('command-area');
        const pcArea = document.getElementById('pc-new-command-area');
        const areas = [mobileArea, pcArea];
        
        areas.forEach(area => {
            if(!area) return;
            area.innerHTML = '';
            
            let targetNode = area;
            if (area.id === 'pc-new-command-area') {
                const col = document.createElement('div');
                col.className = 'pc-cmd-col';
                area.appendChild(col);
                targetNode = col;
            }
            
            const btn = document.createElement('button');
            btn.className = 'cmd-btn back';
            btn.textContent = "戻る";
            
            // ★超重要修正！：e（イベント）を受け取って、クリックが裏のマップに貫通するのを防ぎます！
            btn.onclick = (e) => {
                if (e) {
                    e.stopPropagation(); // 裏側の要素（マップの城など）にクリックを伝えないバリア！
                    e.preventDefault();
                }
                
                // ★修正：敵のターン中（守備の援軍選択中）でも戻れるように、AI処理中のブロックを消し去ります！
                // （ここにあった if(this.game.isProcessingAI) return; を削除しました）

                const currentMode = String(this.game.selectionMode || "");
                const currentData = this.game.tempReinfData || capturedData;

                let isReinfAction = false;
                if (currentMode.includes('reinf') || modeStrForCheck.includes('reinf') || 
                    currentMode.includes('ally') || modeStrForCheck.includes('ally') || 
                    currentMode.includes('self') || modeStrForCheck.includes('self') || 
                    currentData) {
                    isReinfAction = true;
                }
                
                // 裏側のデータが消え去っていても、フラグが立っていれば問答無用で援軍扱いします
                if (this._activeReinforcementFlag) {
                    isReinfAction = true;
                }

                if (isReinfAction) {
                    let confirmMessage = "援軍を要請するのをやめますか？"; // 基本はこれ
                    
                    // 自軍のデータが入っているかどうかの確認
                    const isSelfMode = currentMode.includes('self') || modeStrForCheck.includes('self');
                    const isAllyMode = currentMode.includes('ally') || modeStrForCheck.includes('ally'); // ★追加
                    
                    let isSelfData = false;
                    // ★修正：諸勢力（自分の城にいる）へのお願いの時に「出す」と勘違いしないようにガードします！
                    if (!isAllyMode && currentData && currentData.candidates && currentData.candidates.length > 0) {
                        if (currentData.candidates[0] && currentData.candidates[0].ownerClan === this.game.playerClanId) {
                            isSelfData = true;
                        }
                    }

                    if (isSelfMode || isSelfData) {
                        confirmMessage = "援軍を出すのをやめますか？";
                    }

                    this.showDialog(confirmMessage, true,
                        () => {
                            // 「戻る」時はフラグを折って、記憶を復元してから安全にキャンセル処理へ向かいます
                            this._activeReinforcementFlag = false;
                            this.game.selectionMode = capturedMode || this.game.selectionMode;
                            this.game.tempReinfData = currentData;
                            
                            this.cancelMapSelection(false); 
                            this.scrollToActiveCastle();
                        },
                        () => {
                            // 「いいえ（やめない）」を選んだ時は何もしません
                        }
                    );
                } else {
                    // 援軍以外の普通の行動なら、小窓を出さずにすぐキャンセル
                    this.cancelMapSelection(false); 
                    this.scrollToActiveCastle();
                }
            };
            targetNode.appendChild(btn);
        });
    }
    
    renderEnemyViewMenu() {
        const mobileArea = document.getElementById('command-area');
        const pcArea = document.getElementById('pc-new-command-area');
        const areas = [mobileArea, pcArea];
        areas.forEach(area => {
            if(!area) return;
            area.innerHTML = '';
            
            let targetNode = area;
            if (area.id === 'pc-new-command-area') {
                const col = document.createElement('div');
                col.className = 'pc-cmd-col';
                area.appendChild(col);
                targetNode = col;
            }
            
            const btn = document.createElement('button');
            btn.className = 'cmd-btn back';
            btn.textContent = "自拠点へ戻る";
            btn.onclick = () => {
                if(this.game.isProcessingAI) return;
                const myCastle = this.game.getCurrentTurnCastle();
                this.showControlPanel(myCastle);
                this.scrollToActiveCastle(myCastle);
            };
            targetNode.appendChild(btn);
        });
    }

    cancelMapSelection(keepMenuState = false) { 
        this._activeReinforcementFlag = false; // ★追加：マップ選択が終わる時は、必ずフラグを折ってリセットします！
        const prevMode = this.game.selectionMode; 
        this.game.selectionMode = null; 
        this.game.validTargets = []; 
        this.renderMap();

        // ★援軍要請をキャンセルした時の処理
        if (this.game.tempReinfData && ['atk_self_reinforcement', 'atk_ally_reinforcement', 'def_self_reinforcement', 'def_ally_reinforcement'].includes(prevMode)) {
            const temp = this.game.tempReinfData;
            this.game.tempReinfData = null;
            if (temp.onCancel) temp.onCancel();
        }
        
        if (!keepMenuState) {
            if (this.game.lastMenuState) {
                this.menuState = this.game.lastMenuState;
                this.game.lastMenuState = null;
            } else {
                this.menuState = 'MAIN';
                this.pcMenuPath = [];
            }
            this.renderCommandMenu();
        }
    }
    
    renderCommandMenu() {
        const mobileArea = document.getElementById('command-area');
        
        if (mobileArea) {
            mobileArea.innerHTML = '';
            
            const createBtn = (label, cls, onClick) => { 
                const btn = document.createElement('button'); 
                btn.className = `cmd-btn ${cls || ''}`; 
                btn.textContent = label; 
                btn.onclick = () => {
                    if (this.game.isProcessingAI) return;
                    this.cancelMapSelection(true);
                    onClick();
                }; 
                mobileArea.appendChild(btn); 
            };
            
            const cmd = (type) => this.game.commandSystem.startCommand(type);
            const menu = (targetMenu) => { this.menuState = targetMenu; this.renderCommandMenu(); };
            const specs = this.game.commandSystem.getSpecs();
            
            if (this.menuState === 'MAIN') {
                COMMAND_MENU_STRUCTURE.forEach(item => {
                    createBtn(item.label, "category", () => menu(item.label));
                });

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
                mobileArea.appendChild(finishBtn);
            } else {
                let currentMenuInfo = null;
                let parentMenuName = 'MAIN';

                for (const topItem of COMMAND_MENU_STRUCTURE) {
                    if (topItem.label === this.menuState) {
                        currentMenuInfo = topItem;
                        break;
                    }
                    if (topItem.subMenus) {
                        for (const sub of topItem.subMenus) {
                            if (sub.label === this.menuState) {
                                currentMenuInfo = sub;
                                parentMenuName = topItem.label;
                                break;
                            }
                        }
                    }
                }

                if (!currentMenuInfo) {
                    menu('MAIN');
                } else {
                    let btnCount = 0;
                    if (currentMenuInfo.commands) {
                        currentMenuInfo.commands.forEach(key => {
                            const spec = specs[key];
                            if (spec) {
                                createBtn(spec.label, "", () => cmd(key));
                                btnCount++;
                            }
                        });
                    }

                    if (currentMenuInfo.subMenus) {
                        currentMenuInfo.subMenus.forEach(sub => {
                            createBtn(sub.label, "category", () => menu(sub.label));
                            btnCount++;
                        });
                    }

                    const emptyCount = 3 - (btnCount % 3);
                    if (emptyCount < 3) {
                        for(let i=0; i<emptyCount; i++) {
                            const d = document.createElement('div');
                            mobileArea.appendChild(d);
                        }
                    }
                    createBtn("戻る", "back", () => menu(parentMenuName));
                }
            }
        }
        
        if (document.body.classList.contains('is-pc')) {
            this.renderPcCommandMenu();
        }
    }

    renderPcCommandMenu() {
        const pcArea = document.getElementById('pc-new-command-area');
        if (!pcArea) return;
        pcArea.innerHTML = '';

        const specs = this.game.commandSystem.getSpecs();
        const cmd = (type) => this.game.commandSystem.startCommand(type);
        
        if (!this.pcMenuPath) this.pcMenuPath = [];

        const createCol = () => {
            const col = document.createElement('div');
            col.className = 'pc-cmd-col';
            pcArea.appendChild(col);
            return col;
        };

        const createBtn = (area, label, cls, onClick) => { 
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

        const col1 = createCol();
        
        COMMAND_MENU_STRUCTURE.forEach(item => {
            const isActive = this.pcMenuPath[0] === item.label;
            createBtn(col1, item.label, isActive ? "category active" : "category", () => {
                if (isActive) {
                    this.pcMenuPath = [];
                } else {
                    this.pcMenuPath = [item.label];
                }
                this.renderPcCommandMenu();
            });
        });
        
        createBtn(col1, "命令終了", "finish", () => {
            if (this.game.isProcessingAI) return;
            this.cancelMapSelection(true);
            this.showDialog("今月の命令を終了しますか？", true, () => {
                this.game.finishTurn();
            });
        });

        const renderSubMenu = (menuList, pathIndex, parentCol) => {
            if (this.pcMenuPath.length <= pathIndex) return;
            const activeLabel = this.pcMenuPath[pathIndex];
            const activeItem = menuList.find(m => m.label === activeLabel);
            
            if (!activeItem) return;

            const col = createCol();
            
            if (activeItem.commands) {
                activeItem.commands.forEach(key => {
                    const spec = specs[key];
                    if (spec) {
                        createBtn(col, spec.label, "", () => cmd(key));
                    }
                });
            }

            if (activeItem.subMenus) {
                activeItem.subMenus.forEach(sub => {
                    const isActive = this.pcMenuPath[pathIndex + 1] === sub.label;
                    createBtn(col, sub.label, isActive ? "category active" : "category", () => {
                        this.pcMenuPath = this.pcMenuPath.slice(0, pathIndex + 1);
                        if (!isActive) this.pcMenuPath.push(sub.label);
                        this.renderPcCommandMenu();
                    });
                });
                renderSubMenu(activeItem.subMenus, pathIndex + 1, col);
            }

            createBtn(col, "戻る", "back", () => {
                this.pcMenuPath = this.pcMenuPath.slice(0, pathIndex);
                this.renderPcCommandMenu();
            });
        };

        renderSubMenu(COMMAND_MENU_STRUCTURE, 0, col1);
    }

    clearCommandMenu() {
        this.menuState = 'MAIN';
        this.pcMenuPath = [];
        const mobileArea = document.getElementById('command-area');
        if (mobileArea) mobileArea.innerHTML = '';
        const pcArea = document.getElementById('pc-new-command-area');
        if (pcArea) pcArea.innerHTML = '';
    }
    
    openGunshiModal(gunshi, msg, onConfirm) {
        if (this.gunshiModal) {
            this.gunshiModal.classList.remove('hidden'); 
            if (this.gunshiName) this.gunshiName.textContent = `軍師: ${gunshi ? gunshi.name : '不明'}`; 
            if (this.gunshiMessage) this.gunshiMessage.textContent = msg;
        }
        if (this.gunshiExecuteBtn) {
            this.gunshiExecuteBtn.onclick = () => { 
                if (this.gunshiModal) this.gunshiModal.classList.add('hidden'); 
                onConfirm(); // 実行ボタンを押したら、約束の処理(onConfirm)を進めます
            };
        }
    }
    
    openBushoSelector(actionType, targetId = null, extraData = null, onBack = null) {
        if (actionType === 'appoint' && this.currentCastle) { const isDaimyoHere = this.game.getCastleBushos(this.currentCastle.id).some(b => b.isDaimyo); if (isDaimyoHere) { this.showDialog("大名の居城は城主を変更できません", false); return; } }
        
        this.hideAIGuardTemporarily(); 
        if (this.selectorModal) this.selectorModal.classList.remove('hidden'); 
        if (document.getElementById('selector-title')) document.getElementById('selector-title').textContent = "武将を選択"; 
        
        const isViewMode = (actionType === 'view_only' || actionType === 'all_busho_list');

        const backBtn = document.querySelector('#selector-modal .btn-secondary');
        if(backBtn) {
            const footer = backBtn.parentElement; // ★追加：ボタンが入っているフッターの箱を取得します
            if (extraData && extraData.hideCancel) {
                backBtn.style.display = 'none';
            } else {
                backBtn.style.display = ''; 
                
                if (isViewMode) {
                    backBtn.textContent = '閉じる';
                } else {
                    backBtn.textContent = '戻る';
                }
                if (footer) footer.style.justifyContent = 'center';

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

        const c = this.currentCastle; 
        
        // ★さっき作った新しい魔法で、武将のリストとメッセージをまとめて受け取ります！
        const data = this.game.commandSystem.getBushoSelectorData(actionType, targetId, extraData, c);
        let bushos = data.bushos;
        let infoHtml = data.infoHtml;
        let isMulti = data.isMulti;
        let spec = data.spec;

        if (actionType === 'view_only' || actionType === 'all_busho_list') {
            const getSortRank = (b) => {
                if (b.isDaimyo) return 1;
                if (b.isCastellan) return 2;
                if (b.status === 'ronin') return 6;
                if (b.belongKunishuId > 0) {
                    const isLeader = b.id === (window.GameApp ? window.GameApp.kunishuSystem.getKunishu(b.belongKunishuId)?.leaderId : 0);
                    return isLeader ? 4 : 5;
                }
                return 3;
            };
            bushos.sort((a, b) => getSortRank(a) - getSortRank(b));
        }

        const contextEl = document.getElementById('selector-context-info');
        if(contextEl) {
            contextEl.classList.remove('hidden');
            contextEl.innerHTML = infoHtml;
        }

        // 画面のタイトルを変えます
        if (document.getElementById('selector-title')) {
            if (actionType === 'view_only' || actionType === 'all_busho_list') {
                document.getElementById('selector-title').textContent = "武将一覧";
            } else {
                document.getElementById('selector-title').textContent = isMulti ? "武将を選択（複数可）" : "武将を選択"; 
            }
        }

        // 相手の城を調べるかどうかの準備（表示の時に使います）
        let isEnemyTarget = false;
        let targetCastle = null;
        if (['rumor_target_busho','headhunt_target','view_only'].includes(actionType)) {
             isEnemyTarget = true;
             targetCastle = this.game.getCastle(targetId);
        }
        const gunshi = this.game.getClanGunshi(this.game.playerClanId);
        const myDaimyo = this.game.bushos.find(b => b.clan === this.game.playerClanId && b.isDaimyo);
        const updateContextCost = () => { 
            if (!isMulti || !contextEl) return; 
            const checkedCount = document.querySelectorAll('input[name="sel_busho"]:checked').length; 
            let cost = 0, item = ""; 
            if (spec.costGold > 0) { cost = checkedCount * spec.costGold; item = "金"; }
            if (spec.costRice > 0) { cost = checkedCount * spec.costRice; item = "米"; }
            
            if (cost > 0) {
                 contextEl.innerHTML = `<div>消費予定 ${item}: ${cost} (所持: ${item==='金'?c.gold:c.rice})</div>`; 
            } else if (actionType === 'war_deploy' || actionType === 'def_intercept_deploy' || actionType === 'def_reinf_deploy' || actionType === 'atk_reinf_deploy' || actionType === 'def_self_reinf_deploy' || actionType === 'atk_self_reinf_deploy' || actionType === 'kunishu_subjugate_deploy') {
                 contextEl.innerHTML = `<div>出陣武将: ${checkedCount}名 / 最大5名</div>`;
            }
        };

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

        // ★追加：タブ要素の準備と切り替えの魔法
        const tabsEl = document.getElementById('selector-tabs');
        let currentTab = 'stats'; // 最初は能力(stats)タブにしておきます
        
        if (isViewMode && tabsEl) {
            tabsEl.classList.remove('hidden');
            tabsEl.innerHTML = `
                <button class="busho-tab-btn active" data-tab="stats">能力</button>
                <button class="busho-tab-btn" data-tab="status">状態</button>
            `;
            const tabBtns = tabsEl.querySelectorAll('.busho-tab-btn');
            tabBtns.forEach(btn => {
                btn.onclick = () => {
                    if (window.AudioManager) window.AudioManager.playSE('choice.ogg');
                    tabBtns.forEach(b => b.classList.remove('active'));
                    btn.classList.add('active');
                    currentTab = btn.getAttribute('data-tab');
                    renderList(); // タブが切り替わったらリストを描き直します！
                };
            });
        } else if (tabsEl) {
            // 見るだけじゃない時はタブを隠します
            tabsEl.classList.add('hidden');
        }

        // ★リストを描画する部分を「関数」としてまとめました！
        const renderList = () => {
            if (!this.selectorList) return;
            this.selectorList.innerHTML = '';
            
            // 選ばれているタブに合わせて、リストの一番上の見出しを変えます
            if (currentTab === 'stats') {
                this.selectorList.innerHTML = `
                    <div class="list-header">
                        <span class="col-act">行動</span><span class="col-name">名前</span><span class="col-rank">身分</span><span class="col-stat">統率</span><span class="col-stat">武勇</span><span class="col-stat">政務</span><span class="col-stat">外交</span><span class="col-stat">智謀</span><span class="col-stat">魅力</span>
                    </div>
                `;
            } else {
                this.selectorList.innerHTML = `
                    <div class="list-header status-mode">
                        <span class="col-name">名前</span><span class="col-faction">勢力</span><span class="col-castle">所在</span><span class="col-rank">身分</span><span class="col-age">年齢</span><span class="col-family">一門</span><span class="col-salary">俸禄</span><span></span>
                    </div>
                `;
            }

            bushos.forEach(b => {
                if (actionType === 'banish' && b.isCastellan) return; 
                if (actionType === 'employ_target' && b.isDaimyo) return;
                if (actionType === 'reward' && b.isDaimyo) return; 
                
                let isSelectable = !b.isActionDone; 
                if (extraData && extraData.allowDone) isSelectable = true; 
                if (['appoint','employ_target','appoint_gunshi','rumor_target_busho','headhunt_target','interview','interview_target','reward','view_only','war_general', 'kunishu_war_general', 'all_busho_list', 'marriage_princess', 'marriage_kinsman'].includes(actionType)) isSelectable = true;
                if (actionType === 'def_intercept_deploy' || actionType === 'def_reinf_deploy' || actionType === 'atk_reinf_deploy') isSelectable = true;
                
                let acc = null; if (isEnemyTarget && targetCastle) acc = targetCastle.investigatedAccuracy;
                const getStat = (stat) => GameSystem.getDisplayStatHTML(b, stat, gunshi, acc, this.game.playerClanId, myDaimyo);

                const div = document.createElement('div'); 
                div.className = `select-item ${!isSelectable ? 'disabled' : ''}`;
                
                // 状態タブの時は、CSSで幅を変えるための目印（status-mode）を貼ります
                if (currentTab === 'status') div.classList.add('status-mode');

                const inputType = isMulti ? 'checkbox' : 'radio';
                
                let inputHtml = '';
                if (!isViewMode) {
                    inputHtml = `<input type="${inputType}" name="sel_busho" value="${b.id}" ${!isSelectable ? 'disabled' : ''} style="display:none;">`;
                }
                
                // ここでタブによって中身のデータを切り替えます！
                if (currentTab === 'stats') {
                    // 能力タブ（今まで通り）
                    div.innerHTML = `<span class="col-act">${inputHtml}${b.isActionDone?'[済]':'[未]'}</span><span class="col-name">${b.name}</span><span class="col-rank">${b.getRankName()}</span><span class="col-stat">${getStat('leadership')}</span><span class="col-stat">${getStat('strength')}</span><span class="col-stat">${getStat('politics')}</span><span class="col-stat">${getStat('diplomacy')}</span><span class="col-stat">${getStat('intelligence')}</span><span class="col-stat">${getStat('charm')}</span>`;
                } else {
                    // 状態タブ
                    let forceName = "浪人";
                    let familyMark = "";
                    
                    // 勢力名と一門判定
                    if (b.belongKunishuId > 0) {
                        const kunishu = this.game.kunishuSystem.getKunishu(b.belongKunishuId);
                        forceName = kunishu ? kunishu.getName(this.game) : "諸勢力";
                    } else if (b.clan > 0) {
                        const clan = this.game.clans.find(c => c.id === b.clan);
                        forceName = clan ? clan.name : "大名家";
                        
                        const daimyo = clan ? this.game.getBusho(clan.leaderId) : null;
                        if (daimyo && (b.id === daimyo.id || b.isDaimyo)) {
                            familyMark = "◯";
                        } else if (daimyo) {
                            const bFamily = Array.isArray(b.familyIds) ? b.familyIds : [];
                            const dFamily = Array.isArray(daimyo.familyIds) ? daimyo.familyIds : [];
                            if (bFamily.includes(daimyo.id) || dFamily.includes(b.id)) {
                                familyMark = "◯";
                            }
                        }
                    }
                    
                    const bCastle = this.game.getCastle(b.castleId);
                    const bCastleName = bCastle ? bCastle.name : "-";
                    const age = this.game.year - b.birthYear;
                    
                    let salary = "-";
                    if (b.clan > 0 && !b.isDaimyo && b.status !== 'ronin') {
                        const clan = this.game.clans.find(c => c.id === b.clan);
                        const daimyo = clan ? this.game.getBusho(clan.leaderId) : null;
                        salary = b.getSalary(daimyo);
                        if (salary === 0) salary = "-";
                    }

                    div.innerHTML = `<span class="col-name">${b.name}</span><span class="col-faction">${forceName}</span><span class="col-castle">${bCastleName}</span><span class="col-rank">${b.getRankName()}</span><span class="col-age">${age}</span><span class="col-family">${familyMark}</span><span class="col-salary">${salary}</span><span></span>`;
                }
                
                if (actionType === 'view_only' || actionType === 'all_busho_list') {
                    div.onclick = () => {
                        if (window.AudioManager) window.AudioManager.playSE('choice.ogg');
                        this.showBushoDetailModal(b);
                    };
                    div.style.cursor = 'pointer'; // カーソルを指の形にする魔法
                } else if (isSelectable) { 
                    div.onclick = (e) => {
                        if (window.AudioManager) window.AudioManager.playSE('choice.ogg');

                        // 【パターン1】チェックボックスの四角い部分を直接ポチッと押した時の動き
                        if(e.target.tagName === 'INPUT') { 
                            if(!isMulti) {
                                const siblings = this.selectorList.querySelectorAll('.select-item');
                                siblings.forEach(el => el.classList.remove('selected'));
                            } else {
                                 const maxSelect = (actionType === 'war_deploy' || actionType === 'def_intercept_deploy' || actionType === 'def_reinf_deploy' || actionType === 'atk_reinf_deploy' || actionType === 'def_self_reinf_deploy' || actionType === 'atk_self_reinf_deploy' || actionType === 'kunishu_subjugate_deploy') ? 5 : 999;
                                 const currentChecked = this.selectorList.querySelectorAll('input[name="sel_busho"]:checked').length;
                                 if(e.target.checked && currentChecked > maxSelect) {
                                     e.target.checked = false;
                                     this.showDialog(`出陣できる武将は最大${maxSelect}名までです。`, false);
                                     return;
                                 }

                                 // ★ ここから追加：金や兵糧のオーバーチェック（チェックボックスを直接押した時）
                                 if (e.target.checked) {
                                     if (spec.costGold > 0 && currentChecked * spec.costGold > c.gold) {
                                         e.target.checked = false; 
                                         this.showDialog(`金が足りないため、これ以上選べません。`, false);
                                         return;
                                     }
                                     if (spec.costRice > 0 && currentChecked * spec.costRice > c.rice) {
                                         e.target.checked = false; 
                                         this.showDialog(`兵糧が足りないため、これ以上選べません。`, false);
                                         return;
                                     }
                                 }
                            }
                            if(e.target.checked) div.classList.add('selected');
                            else div.classList.remove('selected');
                            updateContextCost();
                            updateBushoConfirmBtn(); 
                            return;
                        } 
                        
                        // 【パターン2】武将の名前など、行のどこかを押した時の動き
                        const input = div.querySelector('input');
                        if(input) {
                            if (isMulti) { 
                                 const maxSelect = (actionType === 'war_deploy' || actionType === 'def_intercept_deploy' || actionType === 'def_reinf_deploy' || actionType === 'atk_reinf_deploy' || actionType === 'def_self_reinf_deploy' || actionType === 'atk_self_reinf_deploy' || actionType === 'kunishu_subjugate_deploy') ? 5 : 999;
                                 const currentChecked = this.selectorList.querySelectorAll('input[name="sel_busho"]:checked').length;
                                 if(!input.checked && currentChecked >= maxSelect) {
                                     this.showDialog(`出陣できる武将は最大${maxSelect}名までです。`, false);
                                     return;
                                 }

                                 // ★ ここから追加：金や兵糧のオーバーチェック（武将の行を押した時）
                                 if (!input.checked) {
                                     if (spec.costGold > 0 && (currentChecked + 1) * spec.costGold > c.gold) {
                                         this.showDialog(`金が足りないため、これ以上選べません。`, false);
                                         return;
                                     }
                                     if (spec.costRice > 0 && (currentChecked + 1) * spec.costRice > c.rice) {
                                         this.showDialog(`兵糧が足りないため、これ以上選べません。`, false);
                                         return;
                                     }
                                 }

                                 input.checked = !input.checked; 
                            } else { 
                                 input.checked = true; const allItems = this.selectorList.querySelectorAll('.select-item'); allItems.forEach(item => item.classList.remove('selected')); 
                            }
                            if(input.checked) div.classList.add('selected'); else div.classList.remove('selected');
                            updateContextCost(); 
                            updateBushoConfirmBtn(); 
                        }
                    };
                }
                this.selectorList.appendChild(div);
            });
            if (bushos.length === 0 && this.selectorList) this.selectorList.innerHTML = "<div style='padding:10px;'>対象となる武将がいません</div>";
        };

        // 準備が整ったので、最初の1回目を描画します！
        renderList();
        
        if (this.selectorList) {
            this.selectorList.scrollTop = 0;
        }
        
        if (this.selectorConfirmBtn) {
            if (actionType === 'view_only' || actionType === 'all_busho_list') {
                this.selectorConfirmBtn.classList.add('hidden'); 
            } else {
                this.selectorConfirmBtn.classList.remove('hidden');
                
                updateBushoConfirmBtn();

                this.selectorConfirmBtn.onclick = () => {
                    const inputs = document.querySelectorAll('input[name="sel_busho"]:checked'); if (inputs.length === 0) return;
                    const selectedIds = Array.from(inputs).map(i => parseInt(i.value)); 
                    this.closeSelector();
                    if (extraData && extraData.onConfirm) {
                        extraData.onConfirm(selectedIds);
                    } else {
                        this.game.commandSystem.handleBushoSelection(actionType, selectedIds, targetId, extraData);
                    }
                };
            }
        }
    }
    
    showBushoDetailModal(busho) {
        this.info.showBushoDetailModal(busho);
    }

    showUnitDivideModal(bushos, totalSoldiers, totalHorses, totalGuns, onConfirm, onCancel = null) {
        const modal = document.getElementById('unit-divide-modal');
        const listEl = document.getElementById('divide-list');
        const confirmBtn = document.getElementById('divide-confirm-btn');
        const footer = confirmBtn.parentElement;
        if (footer) footer.style.justifyContent = 'center';
        const remainEl = document.getElementById('divide-remain-soldiers');
        const totalEl = document.getElementById('divide-total-soldiers');
        
        if (!modal || !listEl) return;
        
        if (typeof totalHorses === 'function') {
            onCancel = totalGuns; 
            onConfirm = totalHorses;
            totalHorses = 0;
            totalGuns = 0;
        }

        this.hideAIGuardTemporarily(); // ★これを追加します！

        const cancelBtn = modal.querySelector('.btn-secondary');
        if (cancelBtn) {
            cancelBtn.onclick = () => {
                modal.classList.add('hidden');
                this.restoreAIGuard(); // ★これを追加します！
                if (onCancel) onCancel(); 
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
            
            const currentData = bushos.map(b => {
                const typeEl = document.getElementById(`div-type-${b.id}`);
                const numEl = document.getElementById(`div-num-${b.id}`);
                const typeVal = typeEl ? typeEl.value : 'ashigaru';
                let numVal = numEl ? parseInt(numEl.value) || 0 : 0;
                return { id: b.id, type: typeVal, count: numVal };
            });

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

            sum = currentData.reduce((s, d) => s + d.count, 0);
            usedHorses = currentData.filter(d => d.type === 'kiba').reduce((s, d) => s + d.count, 0);
            usedGuns = currentData.filter(d => d.type === 'teppo').reduce((s, d) => s + d.count, 0);
            
            const rem = totalSoldiers - sum;

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

        const gunshi = this.game.getClanGunshi(this.game.playerClanId);
        const myDaimyo = this.game.bushos.find(b => b.clan === this.game.playerClanId && b.isDaimyo);

        bushos.forEach((b, index) => {
            const div = document.createElement('div');
            div.style.marginBottom = "15px";
            div.style.padding = "10px";
            div.style.border = "1px solid #ccc";
            div.style.borderRadius = "4px";
            div.style.background = "#fff";
            
            const getStat = (stat) => GameSystem.getDisplayStatHTML(b, stat, gunshi, null, this.game.playerClanId, myDaimyo);
            
            div.innerHTML = `
                <div style="font-weight:bold; margin-bottom:5px; display:flex; align-items:center;">
                    ${b.name} 
                    <span style="font-size:0.8rem; margin-left:10px; display:flex; gap:5px; font-weight:normal;">
                        (統:${getStat('leadership')} 武:${getStat('strength')} 智:${getStat('intelligence')})
                    </span>
                </div>
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
            this.restoreAIGuard(); // ★これを追加します！
            onConfirm(finalAssignments);
        };
    }

    showInterviewModal(busho) {
        const currentYear = this.game.year;
        const castle = this.game.getCurrentTurnCastle();

        if (currentYear >= (busho.endYear - 1)) {
            this.showDialog(`${busho.name}は調子が悪そうだ。\n医師に診せますか？\n（消費：金２００）`, true, 
                () => {
                    if (castle.gold < 200) {
                        this.showDialog("金が足りないため、医師を呼べませんでした……", false, () => {
                            this.renderNormalInterview(busho);
                        });
                        return; 
                    }

                    castle.gold -= 200;
                    busho.endYear = Number(busho.endYear) + 1;
                    this.showResultModal(`${busho.name}は少し顔色が良くなったようです`);
                    
                    this.updatePanelHeader();
                    this.renderCommandMenu();
                },
                () => {
                    this.renderNormalInterview(busho);
                }
            );
            return; 
        }

        this.renderNormalInterview(busho);
    }

    renderNormalInterview(busho) {
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
        this.hideAIGuardTemporarily(); 
        if (this.resultModal) this.resultModal.classList.remove('hidden');
        this.onResultModalClose = onProceed;

        if (window.AudioManager) {
            window.AudioManager.playSE('myturn.ogg');
        }
    }

    openQuantitySelector(type, data, targetId, extraData = null) {
        if (!this.quantityModal) return;
        this.hideAIGuardTemporarily(); // ★これを追加します！
        
        // ★追加：複数スライダーの時だけ全画面にするための目印をつけます
        const isMultiMode = ['war_supplies', 'def_intercept', 'def_reinf_supplies', 'atk_reinf_supplies', 'def_self_reinf_supplies', 'atk_self_reinf_supplies', 'transport'].includes(type);
        if (isMultiMode) {
            this.quantityModal.classList.add('multi-slider-mode');
        } else {
            this.quantityModal.classList.remove('multi-slider-mode');
        }

        this.quantityModal.classList.remove('hidden'); 
        if (this.quantityContainer) this.quantityContainer.innerHTML = '';
        if (this.charityTypeSelector) this.charityTypeSelector.classList.add('hidden'); 
        if (this.tradeTypeInfo) this.tradeTypeInfo.classList.add('hidden'); 
        const c = this.currentCastle;

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
                isValid = true; 
            } else if (type === 'war_supplies' || type === 'def_intercept' || type === 'def_reinf_supplies' || type === 'atk_reinf_supplies') {
                const s = parseInt(document.getElementById('num-soldiers')?.value) || 0;
                if (s <= 0) isValid = false; 
            } else {
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

            // ★追加：複数スライダーの時の、上部の「残数」表示をパタパタ更新します！
            if (['war_supplies', 'def_intercept', 'def_reinf_supplies', 'atk_reinf_supplies', 'def_self_reinf_supplies', 'atk_self_reinf_supplies', 'transport'].includes(type)) {
                let sCastle = c;
                if (type === 'def_intercept') sCastle = (data && data.length > 0) ? data[0] : c;
                if (type === 'def_reinf_supplies' || type === 'atk_reinf_supplies' || type === 'def_self_reinf_supplies' || type === 'atk_self_reinf_supplies') sCastle = (data && data.length > 0) ? data[0] : c;
                
                const updateStock = (id, baseVal) => {
                    const el = document.getElementById(`multi-stock-${id}`);
                    if (el) {
                        const v = parseInt(document.getElementById(`num-${id}`)?.value) || 0;
                        el.textContent = baseVal - v;
                    }
                };
                updateStock('gold', sCastle.gold);
                updateStock('rice', sCastle.rice);
                updateStock('soldiers', sCastle.soldiers);
                updateStock('horses', sCastle.horses || 0);
                updateStock('guns', sCastle.guns || 0);
            }

            // ★追加：スライダーを動かすたびに呼ばれるこの場所で、必要資金を計算してパタパタ表示します！
            const displayEl = document.getElementById('dynamic-cost-display');
            if (displayEl) {
                // 計算に使うために、大名と城主をここでも探しておきます
                const daimyo = this.game.bushos.find(b => b.clan === c.ownerClan && b.isDaimyo);
                const castellan = this.game.getBusho(c.castellanId);
                
                // ★修正：「金」が上、「アイテム」が下になるように２行の順番を入れ替えました！
                const makeGrid = (itemName, afterItem, afterGold) => {
                    return `
                        <div style="display: inline-grid; grid-template-columns: max-content max-content minmax(3em, auto); column-gap: 1em; text-align: left;">
                            <div>　金</div>
                            <div>▶</div>
                            <div style="text-align: right;">${Math.floor(afterGold)}</div>
                            <div>${itemName}</div>
                            <div>▶</div>
                            <div style="text-align: right;">${Math.floor(afterItem)}</div>
                        </div>
                    `;
                };
                
                if (type === 'draft') {
                    const amount = parseInt(document.getElementById('num-soldiers')?.value) || 0;
                    const busho = this.game.getBusho(data[0]);
                    const cost = GameSystem.calcDraftCost(amount, busho, c.peoplesLoyalty);
                    displayEl.innerHTML = makeGrid("兵士", c.soldiers + amount, c.gold - cost);
                } else if (type === 'buy_rice') {
                    const amount = parseInt(document.getElementById('num-amount')?.value) || 0;
                    let rate = 1.0;
                    if (c && this.game.provinces) {
                        const province = this.game.provinces.find(p => p.id === c.provinceId);
                        if (province && province.marketRate !== undefined) rate = province.marketRate;
                    }
                    const cost = Math.ceil(amount * rate);
                    displayEl.innerHTML = makeGrid("兵糧", c.rice + amount, c.gold - cost);
                } else if (type === 'sell_rice') {
                    const amount = parseInt(document.getElementById('num-amount')?.value) || 0;
                    let rate = 1.0;
                    if (c && this.game.provinces) {
                        const province = this.game.provinces.find(p => p.id === c.provinceId);
                        if (province && province.marketRate !== undefined) rate = province.marketRate;
                    }
                    const profit = Math.floor(amount * rate);
                    displayEl.innerHTML = makeGrid("兵糧", c.rice - amount, c.gold + profit);
                } else if (type === 'buy_horses') {
                    const amount = parseInt(document.getElementById('num-amount')?.value) || 0;
                    const cost = GameSystem.calcBuyHorseCost(amount, daimyo, castellan);
                    displayEl.innerHTML = makeGrid("騎馬", (c.horses || 0) + amount, c.gold - cost);
                } else if (type === 'buy_guns') {
                    const amount = parseInt(document.getElementById('num-amount')?.value) || 0;
                    const cost = GameSystem.calcBuyGunCost(amount, daimyo, castellan);
                    displayEl.innerHTML = makeGrid("鉄砲", (c.guns || 0) + amount, c.gold - cost);
                }
            }
        };

        const createSlider = (label, id, max, currentVal, minVal = 0, isTransport = false, targetCurrent = 0, targetMaxLimit = 99999) => {
            const wrap = document.createElement('div');
            wrap.className = 'qty-row';
            
            const labelStyle = "width: 4em; min-width: 4em; text-align:center; font-weight:bold; background-color: #546e7a; color: #fff; border-radius: 3px; padding: 4px 0; margin-right: 5px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;";
            const isSingle = !(['war_supplies', 'def_intercept', 'def_reinf_supplies', 'atk_reinf_supplies', 'def_self_reinf_supplies', 'atk_self_reinf_supplies', 'transport'].includes(type));
            
            // ボタンの位置と表示を自動で切り替える仕組み
            const updateButtons = (v) => {
                const bMin = wrap.querySelector(`#btn-min-${id}`);
                const bHalf = wrap.querySelector(`#btn-half-${id}`);
                const bMax = wrap.querySelector(`#btn-max-${id}`);
                const currentMax = isTransport ? Math.min(max, targetMaxLimit - targetCurrent) : max;
                const currentMin = isTransport ? 0 : minVal;

                // 変更できない状態（0の時など）
                if (currentMax <= currentMin) {
                    if (bMin) { bMin.style.display = 'block'; bMin.disabled = true; bMin.style.order = 1; }
                    if (bHalf) { bHalf.style.display = 'block'; bHalf.disabled = true; bHalf.style.order = 3; }
                    if (bMax) { bMax.style.display = 'none'; }
                    return;
                }

                if (v <= currentMin) {
                    // 最小の時：「最小(無効)」ゲージ「半分(有効)」を表示
                    if (bMin) { bMin.style.display = 'block'; bMin.disabled = true; bMin.style.order = 1; }
                    if (bHalf) { bHalf.style.display = 'block'; bHalf.disabled = false; bHalf.style.order = 3; }
                    if (bMax) { bMax.style.display = 'none'; }
                } else if (v >= currentMax) {
                    // 最大の時：「半分(有効)」ゲージ「最大(無効)」を表示
                    if (bMin) { bMin.style.display = 'none'; }
                    if (bHalf) { bHalf.style.display = 'block'; bHalf.disabled = false; bHalf.style.order = 1; }
                    if (bMax) { bMax.style.display = 'block'; bMax.disabled = true; bMax.style.order = 3; }
                } else {
                    // 中間の時：「最小(有効)」ゲージ「最大(有効)」を表示
                    if (bMin) { bMin.style.display = 'block'; bMin.disabled = false; bMin.style.order = 1; }
                    if (bHalf) { bHalf.style.display = 'none'; }
                    if (bMax) { bMax.style.display = 'block'; bMax.disabled = false; bMax.style.order = 3; }
                }
            };

            if (isTransport) {
                const actualMaxTransport = Math.min(max, targetMaxLimit - targetCurrent);
                wrap.innerHTML = `
                    <div class="qty-control" style="display:flex; align-items:center; gap:5px;">
                        <span style="${labelStyle} order:0;">${label}</span>
                        <button class="qty-shortcut-btn" id="btn-min-${id}" style="order:1;">最小</button>
                        <button class="qty-shortcut-btn" id="btn-half-${id}" style="order:3;">半分</button>
                        <input type="range" id="range-${id}" min="0" max="${actualMaxTransport}" value="0" style="flex:1; order:2;">
                        <button class="qty-shortcut-btn" id="btn-max-${id}" style="order:3;">最大</button>
                        <input type="number" id="num-tgt-${id}" min="${targetCurrent}" max="${targetCurrent + actualMaxTransport}" value="${targetCurrent}" style="order:4;">
                        <input type="hidden" id="num-${id}" value="0">
                    </div>
                `;
                
                const range = wrap.querySelector(`#range-${id}`);
                const numTgt = wrap.querySelector(`#num-tgt-${id}`);
                const numHidden = wrap.querySelector(`#num-${id}`);
                
                const setVal = (v) => {
                    if (v < 0) v = 0;
                    if (v > actualMaxTransport) v = actualMaxTransport;
                    range.value = v;
                    numHidden.value = v;
                    numTgt.value = targetCurrent + v;
                    updateButtons(v);
                    checkValidQuantity();
                };

                wrap.querySelector(`#btn-min-${id}`).onclick = () => setVal(0);
                wrap.querySelector(`#btn-half-${id}`).onclick = () => setVal(Math.floor(actualMaxTransport / 2));
                wrap.querySelector(`#btn-max-${id}`).onclick = () => setVal(actualMaxTransport);

                const rangeHandler = () => { 
                    let v = parseInt(range.value);
                    if (v > 0 && v < actualMaxTransport) { 
                        if (actualMaxTransport <= 999) {
                            v = Math.round(v / 10) * 10; 
                        } else {
                            v = Math.round(v / 100) * 100; 
                        }
                    }
                    
                    // 【追加】ここで上限・下限を超えないようにブロックします
                    if (v > actualMaxTransport) v = actualMaxTransport;
                    if (v < 0) v = 0;
                    
                    range.value = v;
                    numHidden.value = v;
                    numTgt.value = targetCurrent + v;
                    updateButtons(v);
                    checkValidQuantity(); 
                };
                range.oninput = rangeHandler;
                range.onchange = rangeHandler; // ★スマホで指を離した時の最終確認

                const numTgtHandler = () => {
                    let v = parseInt(numTgt.value);
                    if (isNaN(v)) return;
                    if (v < targetCurrent) v = targetCurrent;
                    if (v > targetCurrent + actualMaxTransport) v = targetCurrent + actualMaxTransport;
                    const transAmount = v - targetCurrent;
                    range.value = transAmount;
                    numHidden.value = transAmount;
                    updateButtons(transAmount);
                    checkValidQuantity();
                };
                numTgt.oninput = numTgtHandler;
                numTgt.onchange = numTgtHandler; // ★スマホで指を離した時の最終確認
                
                updateButtons(0);
                this.quantityContainer.appendChild(wrap);
                return { range, num: numHidden };
                
            } else {
                if (isSingle) {
                    wrap.innerHTML = `
                        <div style="font-weight:bold; margin-bottom:8px; text-align:left; color:#333; font-size:1.05rem;">${label}</div>
                        <div class="qty-control" style="display:flex; align-items:center; gap:5px;">
                            <button class="qty-shortcut-btn" id="btn-min-${id}" style="order:1;">最小</button>
                            <button class="qty-shortcut-btn" id="btn-half-${id}" style="order:3;">半分</button>
                            <input type="range" id="range-${id}" min="${minVal}" max="${max}" value="${currentVal}" style="flex:1; order:2;">
                            <button class="qty-shortcut-btn" id="btn-max-${id}" style="order:3;">最大</button>
                            <input type="number" id="num-${id}" min="${minVal}" max="${max}" value="${currentVal}" style="order:4;">
                        </div>
                    `;
                } else {
                    wrap.innerHTML = `
                        <div class="qty-control" style="display:flex; align-items:center; gap:5px;">
                            <span style="${labelStyle} order:0;">${label}</span>
                            <button class="qty-shortcut-btn" id="btn-min-${id}" style="order:1;">最小</button>
                            <button class="qty-shortcut-btn" id="btn-half-${id}" style="order:3;">半分</button>
                            <input type="range" id="range-${id}" min="${minVal}" max="${max}" value="${currentVal}" style="flex:1; order:2;">
                            <button class="qty-shortcut-btn" id="btn-max-${id}" style="order:3;">最大</button>
                            <input type="number" id="num-${id}" min="${minVal}" max="${max}" value="${currentVal}" style="order:4;">
                        </div>
                    `;
                }
                
                const range = wrap.querySelector(`#range-${id}`);
                const num = wrap.querySelector(`#num-${id}`);
                
                const setVal = (v) => {
                    let actualMax = parseInt(range.max);
                    if (v < minVal) v = minVal;
                    if (v > actualMax) v = actualMax;
                    range.value = v;
                    num.value = v;
                    updateButtons(v);
                    checkValidQuantity();
                };

                wrap.querySelector(`#btn-min-${id}`).onclick = () => setVal(minVal);
                wrap.querySelector(`#btn-half-${id}`).onclick = () => setVal(Math.floor((minVal + max) / 2));
                wrap.querySelector(`#btn-max-${id}`).onclick = () => setVal(max);

                const rangeHandler = () => { 
                    let v = parseInt(range.value);
                    if (v > minVal && v < max) { 
                        if (max <= 999) {
                            v = Math.round(v / 10) * 10; 
                        } else {
                            v = Math.round(v / 100) * 100; 
                        }
                    }
                    
                    // 【追加】ここで上限・下限を超えないようにブロックします
                    if (v > max) v = max;
                    if (v < minVal) v = minVal;
                    
                    range.value = v;
                    num.value = v;
                    updateButtons(v);
                    checkValidQuantity(); 
                };
                range.oninput = rangeHandler;
                range.onchange = rangeHandler; // ★スマホで指を離した時の最終確認

                const numHandler = () => { 
                    let v = parseInt(num.value);
                    if (isNaN(v)) return;
                    if (v < minVal) v = minVal;
                    if (v > max) v = max;
                    range.value = v;
                    updateButtons(v);
                    checkValidQuantity();
                };
                num.oninput = numHandler;
                num.onchange = numHandler; // ★スマホで指を離した時の最終確認

                updateButtons(currentVal);
                this.quantityContainer.appendChild(wrap);
                return { range, num };
            }
        };

        let inputs = {};
        
        // ★追加：計算のために大名と城主をあらかじめ探しておきます
        const daimyo = this.game.bushos.find(b => b.clan === c.ownerClan && b.isDaimyo);
        const castellan = this.game.getBusho(c.castellanId);

        // ★今回追加：複数スライダー画面のための「上部の物資・残数表示」
        const isMultiSliderMode = ['war_supplies', 'def_intercept', 'def_reinf_supplies', 'atk_reinf_supplies', 'def_self_reinf_supplies', 'atk_self_reinf_supplies', 'transport'].includes(type);
        let sourceCastleForMulti = c;
        if (type === 'def_intercept') sourceCastleForMulti = (data && data.length > 0) ? data[0] : c;
        if (type === 'def_reinf_supplies' || type === 'atk_reinf_supplies' || type === 'def_self_reinf_supplies' || type === 'atk_self_reinf_supplies') sourceCastleForMulti = (data && data.length > 0) ? data[0] : c;

        if (isMultiSliderMode) {
            const stockDiv = document.createElement('div');
            stockDiv.style.cssText = "background: #f0f4f8; padding: 10px; border-radius: 6px; border: 1px solid #ccc; margin-bottom: 15px; font-size: 0.95rem; font-weight: bold;";
            stockDiv.innerHTML = `
                <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px;">
                    <div style="background: #ffffff; padding: 6px 8px; border-radius: 4px; border: 1px solid #ddd; display: flex; justify-content: space-between; align-items: center;">
                        <span style="color:#555;">金</span><span id="multi-stock-gold">${sourceCastleForMulti.gold}</span>
                    </div>
                    <div style="background: #ffffff; padding: 6px 8px; border-radius: 4px; border: 1px solid #ddd; display: flex; justify-content: space-between; align-items: center;">
                        <span style="color:#555;">兵糧</span><span id="multi-stock-rice">${sourceCastleForMulti.rice}</span>
                    </div>
                    <div style="background: #ffffff; padding: 6px 8px; border-radius: 4px; border: 1px solid #ddd; display: flex; justify-content: space-between; align-items: center;">
                        <span style="color:#555;">兵士</span><span id="multi-stock-soldiers">${sourceCastleForMulti.soldiers}</span>
                    </div>
                    <div style="background: #ffffff; padding: 6px 8px; border-radius: 4px; border: 1px solid #ddd; display: flex; justify-content: space-between; align-items: center;">
                        <span style="color:#555;">騎馬</span><span id="multi-stock-horses">${sourceCastleForMulti.horses || 0}</span>
                    </div>
                    <div style="background: #ffffff; padding: 6px 8px; border-radius: 4px; border: 1px solid #ddd; display: flex; justify-content: space-between; align-items: center;">
                        <span style="color:#555;">鉄砲</span><span id="multi-stock-guns">${sourceCastleForMulti.guns || 0}</span>
                    </div>
                </div>
            `;
            this.quantityContainer.appendChild(stockDiv);
        }
        
        if (type === 'draft') {
            document.getElementById('quantity-title').textContent = "徴兵"; 
            
            const busho = this.game.getBusho(data[0]);
            const maxAffordable = GameSystem.calcDraftFromGold(c.gold, busho, c.peoplesLoyalty);
            const maxSoldiers = Math.min(c.population, 99999 - c.soldiers, maxAffordable);
            
            // ★変更：相場の金額を小数点以下1桁で表示します！
            const efficiency = ((busho.leadership * 1.5) + (busho.charm * 1.5) + (Math.sqrt(busho.loyalty) * 2) + (Math.sqrt(c.peoplesLoyalty) * 2)) / 500;
            const singleCost = 1 / efficiency;
            
            this.tradeTypeInfo.classList.remove('hidden'); 
            this.tradeTypeInfo.textContent = `兵士 1人 ＝ 金 ${singleCost.toFixed(1)}`;

            // ★変更：スライダーより前に数字の箱を作って、スライダーの上に表示させます！
            const costDiv = document.createElement('div');
            costDiv.id = 'dynamic-cost-display';
            costDiv.style.cssText = "display: flex; justify-content: center; font-weight:bold; color:#1976d2; margin-bottom:15px; font-size:1.1rem;";
            this.quantityContainer.appendChild(costDiv);

            inputs.soldiers = createSlider("兵士数", "soldiers", maxSoldiers, 0);
            
        } else if (type === 'charity') {
            document.getElementById('quantity-title').textContent = "施し"; this.charityTypeSelector.classList.remove('hidden'); const count = data.length; this.quantityContainer.innerHTML = `<p>選択武将数: ${count}名</p>`;
        } else if (type === 'goodwill') {
            document.getElementById('quantity-title').textContent = "贈与金指定"; inputs.gold = createSlider("金", "gold", c.gold, 100);
        } else if (type === 'headhunt_gold') {
            document.getElementById('quantity-title').textContent = "持参金 (任意)"; inputs.gold = createSlider("金", "gold", c.gold, 0);
        } else if (type === 'tribute_gold') {
            document.getElementById('quantity-title').textContent = "献上金 (最大1500)"; 
            const maxTributeGold = Math.min(1500, c.gold);
            inputs.gold = createSlider("金", "gold", maxTributeGold, 0);
        } else if (type === 'war_supplies') {
            document.getElementById('quantity-title').textContent = "出陣用意"; 
            inputs.soldiers = createSlider("兵士", "soldiers", c.soldiers, c.soldiers);
            inputs.rice = createSlider("兵糧", "rice", c.rice, c.rice);
            inputs.horses = createSlider("騎馬", "horses", c.horses, 0);
            inputs.guns = createSlider("鉄砲", "guns", c.guns, 0);
        } else if (type === 'def_intercept') { 
            const interceptCastle = (data && data.length > 0) ? data[0] : c;
            document.getElementById('quantity-title').textContent = "迎撃部隊編成"; 
            inputs.soldiers = createSlider("出陣兵士数", "soldiers", interceptCastle.soldiers, interceptCastle.soldiers);
            inputs.rice = createSlider("兵糧", "rice", interceptCastle.rice, interceptCastle.rice);
            inputs.horses = createSlider("騎馬", "horses", interceptCastle.horses || 0, 0);
            inputs.guns = createSlider("鉄砲", "guns", interceptCastle.guns || 0, 0);
        } else if (type === 'def_reinf_supplies' || type === 'atk_reinf_supplies' || type === 'def_self_reinf_supplies' || type === 'atk_self_reinf_supplies') { 
            const helperCastle = (data && data.length > 0) ? data[0] : c;
            let titleText = "";
            if (type === 'def_reinf_supplies') titleText = "守備援軍の部隊編成";
            else if (type === 'atk_reinf_supplies') titleText = "攻撃援軍の部隊編成";
            else if (type === 'def_self_reinf_supplies') titleText = "守備自軍援軍の部隊編成";
            else if (type === 'atk_self_reinf_supplies') titleText = "攻撃自軍援軍の部隊編成";
            document.getElementById('quantity-title').textContent = titleText;
            inputs.soldiers = createSlider("兵士", "soldiers", helperCastle.soldiers, helperCastle.soldiers, 500);
            inputs.rice = createSlider("兵糧", "rice", helperCastle.rice, helperCastle.rice, 500);
            inputs.horses = createSlider("騎馬", "horses", helperCastle.horses || 0, 0, 0);
            inputs.guns = createSlider("鉄砲", "guns", helperCastle.guns || 0, 0, 0);
        } else if (type === 'transport') {
            document.getElementById('quantity-title').textContent = "輸送";
            
            const header = document.createElement('div');
            header.className = 'qty-row'; // 行のスタイルを合わせます
            header.style.marginBottom = '5px';
            header.style.fontSize = '0.85rem';
            header.style.color = '#333';
            // スライダー行と全く同じ要素構成にして、ボタンなどは透明化して配置します
            header.innerHTML = `
                <div class="qty-control" style="display:flex; align-items:center; gap:5px;">
                    <div style="width: 4em; min-width: 4em; margin-right: 5px; order:0;"></div>
                    <button class="qty-shortcut-btn" style="visibility:hidden; pointer-events:none; order:1;">空</button>
                    <div style="flex:1; order:2;"></div>
                    <button class="qty-shortcut-btn" style="visibility:hidden; pointer-events:none; order:3;">空</button>
                    <div style="width: 50px; text-align: center; font-weight: bold; order:4;">輸送先</div>
                </div>
            `;
            this.quantityContainer.appendChild(header);

            const tCastle = this.game.getCastle(targetId); // 輸送先の城のデータを取得します
            
            // 引数は (ラベル, ID, 自分の城の数, 最初は0, 最低は0, 輸送モードフラグ, 相手の城の数, 相手の城の上限) です
            inputs.gold = createSlider("金", "gold", c.gold, 0, 0, true, tCastle.gold, 99999);
            inputs.rice = createSlider("兵糧", "rice", c.rice, 0, 0, true, tCastle.rice, 99999);
            inputs.soldiers = createSlider("兵士", "soldiers", c.soldiers, 0, 0, true, tCastle.soldiers, 99999);
            inputs.horses = createSlider("騎馬", "horses", c.horses || 0, 0, 0, true, tCastle.horses || 0, 99999);
            inputs.guns = createSlider("鉄砲", "guns", c.guns || 0, 0, 0, true, tCastle.guns || 0, 99999);
        } else if (type === 'buy_rice') {
            document.getElementById('quantity-title').textContent = "兵糧購入"; 
            let rate = 1.0;
            if (c && this.game.provinces) {
                const province = this.game.provinces.find(p => p.id === c.provinceId);
                if (province && province.marketRate !== undefined) rate = province.marketRate;
            }
            const maxBuy = Math.floor(c.gold / rate);
            this.tradeTypeInfo.classList.remove('hidden'); 
            // ★変更：相場の金額を小数点以下1桁で表示します！
            this.tradeTypeInfo.textContent = `兵糧 10 ＝ 金 ${(10 * rate).toFixed(1)}`;

            // ★変更：スライダーより前に数字の箱を作って、スライダーの上に表示させます！
            const costDiv = document.createElement('div');
            costDiv.id = 'dynamic-cost-display';
            costDiv.style.cssText = "display: flex; justify-content: center; font-weight:bold; color:#1976d2; margin-bottom:15px; font-size:1.1rem;";
            this.quantityContainer.appendChild(costDiv);

            inputs.amount = createSlider("購入量", "amount", maxBuy, 0);
            
        } else if (type === 'sell_rice') {
            document.getElementById('quantity-title').textContent = "兵糧売却"; 
            let rate = 1.0;
            if (c && this.game.provinces) {
                const province = this.game.provinces.find(p => p.id === c.provinceId);
                if (province && province.marketRate !== undefined) rate = province.marketRate;
            }
            this.tradeTypeInfo.classList.remove('hidden'); 
            // ★変更：相場の金額を小数点以下1桁で表示します！
            this.tradeTypeInfo.textContent = `兵糧 10 ＝ 金 ${(10 * rate).toFixed(1)}`;

            // ★変更：スライダーより前に数字の箱を作って、スライダーの上に表示させます！
            const costDiv = document.createElement('div');
            costDiv.id = 'dynamic-cost-display';
            costDiv.style.cssText = "display: flex; justify-content: center; font-weight:bold; color:#1976d2; margin-bottom:15px; font-size:1.1rem;";
            this.quantityContainer.appendChild(costDiv);

            inputs.amount = createSlider("売却量", "amount", c.rice, 0);

        } else if (type === 'buy_ammo') {
            document.getElementById('quantity-title').textContent = "矢弾購入"; 
            const price = parseInt(window.MainParams.Economy.PriceAmmo, 10) || 1;
            const maxBuy = price > 0 ? Math.floor(c.gold / price) : 0;
            this.tradeTypeInfo.classList.remove('hidden'); 
            this.tradeTypeInfo.textContent = `固定価格: 金${price.toFixed(1)} / 1個`; // 念のためこちらも揃えます
            inputs.amount = createSlider("購入量", "amount", maxBuy, 0);
        } else if (type === 'buy_horses') {
            document.getElementById('quantity-title').textContent = "騎馬購入"; 
            const maxBuy = GameSystem.calcBuyHorseAmount(c.gold, daimyo, castellan);
            const realMaxBuy = Math.min(maxBuy, 99999 - (c.horses || 0));

            // ★変更：さっき作った「正確な単価の魔法」を使って表示します
            const unitPrice = GameSystem.calcBuyHorseUnitPrice(daimyo, castellan);
            this.tradeTypeInfo.classList.remove('hidden'); 
            this.tradeTypeInfo.textContent = `騎馬 1頭 ＝ 金 ${unitPrice.toFixed(1)}`;

            // ★変更：スライダーより前に数字の箱を作って、スライダーの上に表示させます！
            const costDiv = document.createElement('div');
            costDiv.id = 'dynamic-cost-display';
            costDiv.style.cssText = "display: flex; justify-content: center; font-weight:bold; color:#1976d2; margin-bottom:15px; font-size:1.1rem;";
            this.quantityContainer.appendChild(costDiv);

            inputs.amount = createSlider("購入量", "amount", realMaxBuy, 0);

        } else if (type === 'buy_guns') {
            document.getElementById('quantity-title').textContent = "鉄砲購入"; 
            const maxBuy = GameSystem.calcBuyGunAmount(c.gold, daimyo, castellan);
            const realMaxBuy = Math.min(maxBuy, 99999 - (c.guns || 0));

            // ★変更：さっき作った「正確な単価の魔法」を使って表示します
            const unitPrice = GameSystem.calcBuyGunUnitPrice(daimyo, castellan);
            this.tradeTypeInfo.classList.remove('hidden'); 
            this.tradeTypeInfo.textContent = `鉄砲 1挺 ＝ 金 ${unitPrice.toFixed(1)}`;

            // ★変更：スライダーより前に数字の箱を作って、スライダーの上に表示させます！
            const costDiv = document.createElement('div');
            costDiv.id = 'dynamic-cost-display';
            costDiv.style.cssText = "display: flex; justify-content: center; font-weight:bold; color:#1976d2; margin-bottom:15px; font-size:1.1rem;";
            this.quantityContainer.appendChild(costDiv);

            inputs.amount = createSlider("購入量", "amount", realMaxBuy, 0);

        } else if (type === 'war_repair') {
            const s = this.game.warManager.state;
            const defender = s.defender;
            const maxSoldiers = Math.min(window.WarParams.War.RepairMaxSoldiers, defender.soldiers);
            document.getElementById('quantity-title').textContent = "補修 (兵士選択)";
            inputs.soldiers = createSlider("使用兵士数", "soldiers", maxSoldiers, Math.min(50, maxSoldiers));
        }
        
        checkValidQuantity(); 

        const closeQuantityModal = () => {
            this.quantityModal.classList.add('hidden');
            this.restoreAIGuard(); // ★これを追加します！
            if (this.quantityConfirmBtn) {
                this.quantityConfirmBtn.disabled = false;
                this.quantityConfirmBtn.style.opacity = 1.0;
            }
        };

        this.quantityConfirmBtn.onclick = () => {
            closeQuantityModal(); 
            if (extraData && extraData.onConfirm) {
                extraData.onConfirm(inputs);
            } else {
                this.game.commandSystem.handleQuantitySelection(type, inputs, targetId, data, extraData);
            }
        };

        const cancelBtn = this.quantityModal.querySelector('.btn-secondary');
        if (cancelBtn) {
            cancelBtn.onclick = () => {
                closeQuantityModal(); 
                if (extraData && extraData.onCancel) {
                    extraData.onCancel(); 
                }
            };
        }
    }
    
    // ---------------------------------------------------------
    // 魔法①：大名家と諸勢力が混ざった「援軍用」のリスト（外交デザイン版・空白なし）
    // ---------------------------------------------------------
    showForceSelector(forces, onSelect, onCancel) {
        const modal = document.getElementById('selector-modal');
        const list = document.getElementById('selector-list');
        const contextInfo = document.getElementById('selector-context-info');
        const confirmBtn = document.getElementById('selector-confirm-btn');
        
        // ★ここを追加：武将専用のタブをしっかり隠します！
        const tabsEl = document.getElementById('selector-tabs');
        if (tabsEl) tabsEl.classList.add('hidden');
        
        if (!modal || !list || !contextInfo) return;
        
        const titleEl = document.getElementById('selector-title');
        if (titleEl) titleEl.textContent = "勢力一覧";

        contextInfo.innerHTML = "<div>援軍を要請する勢力を選択してください</div>";
        
        const listHeader = modal.querySelector('.list-header');
        if (listHeader) listHeader.style.display = 'none';

        list.innerHTML = `
            <div class="kunishu-list-header" style="grid-template-columns: 1.5fr 1fr 1fr 1.5fr;">
                <span>勢力名</span><span>代表者</span><span>兵数</span><span>友好度</span>
            </div>
        `;
        list.classList.remove('view-mode');
        
        let selectedForce = null;
        
        forces.forEach(force => {
            const item = document.createElement('div');
            item.className = 'kunishu-list-item';
            item.style.cursor = 'pointer';
            item.style.gridTemplateColumns = '1.5fr 1fr 1fr 1.5fr';
            
            let relVal = 50;
            if (force.isKunishu) {
                const k = this.game.kunishuSystem.getKunishu(force.id);
                if (k) relVal = k.getRelation(this.game.playerClanId);
            } else {
                const rel = this.game.getRelation(this.game.playerClanId, force.id);
                if (rel) relVal = rel.sentiment;
            }
            const relPercent = Math.min(100, Math.max(0, Number(relVal) || 0));
            const friendBarHtml = `<div class="bar-bg bar-bg-friend"><div class="bar-fill bar-fill-friend" style="width:${relPercent}%;"></div></div>`;
            
            item.innerHTML = `
                <strong class="col-kunishu-name">${force.name}</strong>
                <span>${force.leaderName}</span>
                <span>${force.soldiers}</span>
                <span>${friendBarHtml}</span>
            `;
            
            item.onclick = () => {
                if (window.AudioManager) window.AudioManager.playSE('choice.ogg');
                Array.from(list.querySelectorAll('.kunishu-list-item')).forEach(c => c.classList.remove('selected'));
                item.classList.add('selected');
                selectedForce = force;
                
                if (confirmBtn) {
                    confirmBtn.disabled = false;
                    confirmBtn.style.opacity = 1.0;
                }
            };
            list.appendChild(item);
        });
        
        if (confirmBtn) {
            confirmBtn.disabled = true;
            confirmBtn.style.opacity = 0.5;
            
            confirmBtn.onclick = () => {
                if (!selectedForce) {
                    this.showDialog("勢力を選択してください", false);
                    return;
                }
                if (listHeader) listHeader.style.display = ''; 
                modal.classList.add('hidden');
                onSelect(selectedForce);
            };
        }
        
        const cancelBtn = modal.querySelector('.btn-secondary');
        if (cancelBtn) {
            cancelBtn.onclick = () => {
                if (listHeader) listHeader.style.display = ''; 
                modal.classList.add('hidden');
                if (onCancel) onCancel();
            };
        }
        
        modal.classList.remove('hidden');
    }

    // ---------------------------------------------------------
    // 魔法②：諸勢力専用のリスト（空白なし完全版）
    // ---------------------------------------------------------
    showKunishuSelector(kunishus, onSelect, onCancel, isViewOnly = false) {
        const modal = document.getElementById('selector-modal');
        const list = document.getElementById('selector-list');
        const contextInfo = document.getElementById('selector-context-info');
        const confirmBtn = document.getElementById('selector-confirm-btn');
        
        // ★ここを追加：武将専用のタブをしっかり隠します！
        const tabsEl = document.getElementById('selector-tabs');
        if (tabsEl) tabsEl.classList.add('hidden');
        
        if (!modal || !list || !contextInfo) return;
        
        const title = document.getElementById('selector-title');
        if (title) title.textContent = isViewOnly ? "諸勢力一覧" : "対象とする諸勢力を選択";

        contextInfo.innerHTML = isViewOnly ? "<div>この城に存在する諸勢力です</div>" : "<div>対象とする諸勢力を選択してください</div>";
        
        const listHeader = modal.querySelector('.list-header');
        if (listHeader) listHeader.style.display = 'none';

        list.innerHTML = `
            <div class="kunishu-list-header" style="grid-template-columns: 1.5fr 1fr 1fr 1.5fr;">
                <span>勢力名</span><span>兵数</span><span>防御</span><span>友好度</span>
            </div>
        `;
        
        list.classList.remove('view-mode');
        
        let selectedKunishuId = null;
        
        kunishus.forEach(kunishu => {
            const item = document.createElement('div');
            item.className = 'kunishu-list-item';
            item.style.gridTemplateColumns = '1.5fr 1fr 1fr 1.5fr';
            
            const kunishuName = kunishu.getName(this.game);
            const relVal = kunishu.getRelation(this.game.playerClanId);
            const relPercent = Math.min(100, Math.max(0, Number(relVal) || 0));
            const friendBarHtml = `<div class="bar-bg bar-bg-friend"><div class="bar-fill bar-fill-friend" style="width:${relPercent}%;"></div></div>`;
            
            item.innerHTML = `<strong class="col-kunishu-name">${kunishuName}</strong><span>${kunishu.soldiers}</span><span>${kunishu.defense}</span><span>${friendBarHtml}</span>`;
            
            if (isViewOnly) {
                item.style.cursor = 'default';
            } else {
                item.style.cursor = 'pointer';
                item.onclick = () => {
                    if (window.AudioManager) window.AudioManager.playSE('choice.ogg');
                    Array.from(list.querySelectorAll('.kunishu-list-item')).forEach(c => c.classList.remove('selected'));
                    item.classList.add('selected');
                    selectedKunishuId = kunishu.id;
                    
                    if (confirmBtn) {
                        confirmBtn.disabled = false;
                        confirmBtn.style.opacity = 1.0;
                    }
                };
            }
            list.appendChild(item);
        });
        
        if (confirmBtn) {
            if (isViewOnly) {
                confirmBtn.classList.add('hidden');
            } else {
                confirmBtn.classList.remove('hidden');
                confirmBtn.disabled = true;
                confirmBtn.style.opacity = 0.5;
                
                confirmBtn.onclick = () => {
                    if (!selectedKunishuId) {
                        this.showDialog("諸勢力を選択してください", false);
                        return;
                    }
                    if (listHeader) listHeader.style.display = ''; 
                    modal.classList.add('hidden');
                    if (onSelect) onSelect(selectedKunishuId);
                };
            }
        }
        
        const cancelBtn = modal.querySelector('.btn-secondary');
        if (cancelBtn) {
            cancelBtn.onclick = () => {
                if (listHeader) listHeader.style.display = ''; 
                modal.classList.add('hidden');
                if (onCancel) onCancel();
            };
        }
        
        modal.classList.remove('hidden');
    }
    
    setWarModalVisible(visible) {
        if (!this.warModal) return;
        if (visible) {
            this.warModal.classList.remove('hidden');
        } else {
            this.warModal.classList.add('hidden');
            // ★追加：戦争が終わって画面を閉じる時に、カードの「部隊がいたよシール」を全部ひっぺがします
            const allCards = document.querySelectorAll('.responsive-army-box, .army-box');
            allCards.forEach(card => {
                card.dataset.hasUnit = 'false';
            });
        }
    }
    
    clearWarLog() {
        if (this.warLog) this.warLog.innerHTML = '';
    }

    addWarDetailLog(msg) {
        if(this.game.warManager && this.game.warManager.state.active && this.game.warManager.state.isPlayerInvolved && this.warLog) {
             const div = document.createElement('div');
             div.innerHTML = msg;
             this.warLog.appendChild(div);
             this.warLog.scrollTop = this.warLog.scrollHeight;
        }
    }
    
    showWarActionMessage(messages, onClick) {
        if (!this.warControls) return;

        const warAiGuard = document.getElementById('war-ai-guard');
        if (warAiGuard) warAiGuard.classList.add('hidden');
        this.warControls.classList.remove('disabled-area');

        this.warControls.innerHTML = ''; 
        const allCards = document.querySelectorAll('.army-box, .responsive-army-box');
        allCards.forEach(c => c.classList.remove('active-command-turn'));
        
        const isPc = document.body.classList.contains('is-pc');
        const msgFontSize = isPc ? '' : 'font-size: 60%; line-height: 1.4;';

        const msgContainer = document.createElement('div');
        msgContainer.className = 'war-action-message-container';
        msgContainer.style.cssText = 'text-align: left; position: relative; display: block; padding: 15px; box-sizing: border-box; height: 100%;';
        
        const textContainer = document.createElement('div');
        textContainer.className = 'war-action-message-text';
        textContainer.style.cssText = `text-align: left; width: 100%; display: block; ${msgFontSize}`;
        
        const promptContainer = document.createElement('div');
        promptContainer.className = 'war-action-message-prompt';
        promptContainer.textContent = '▼'; 
        
        if (isPc) {
            promptContainer.style.cssText = 'position: absolute; bottom: 5px; left: 50%; transform: translateX(-50%); font-size: 1.2rem; color: #eee; cursor: pointer;';
        } else {
            promptContainer.style.cssText = 'position: absolute; bottom: 5px; right: 15px; font-size: 0.8rem; color: #eee; cursor: pointer;';
        }

        msgContainer.appendChild(textContainer);
        msgContainer.appendChild(promptContainer);
        this.warControls.appendChild(msgContainer);
        
        let isFinished = false;
        let isPaused = false; 
        let currentTimer = null;
        let isClickLocked = false; // ★追加：クリックを無視するための鍵
        if (!Array.isArray(messages)) messages = [messages];
        let currentIndex = 0;

        const skipToEnd = () => {
            if (isFinished) return;
            isFinished = true;
            if (currentTimer) clearTimeout(currentTimer);

            while (currentIndex < messages.length) {
                const item = messages[currentIndex++];
                let msgText = typeof item === 'string' ? item : (item.text || '');
                
                let isSpecialMsg = /color\s*:\s*(#d32f2f|red)/i.test(msgText); 

                if (isSpecialMsg) {
                    textContainer.innerHTML = ''; 
                }
                
                if (msgText) {
                    textContainer.innerHTML += (textContainer.innerHTML ? '<br>' : '') + msgText;
                }
                
                if (typeof item !== 'string' && item) {
                    if (item.type === 'damage' || item.type === 'recover') this.playDamageAnimation(item);
                }
            }
            if (window.AudioManager) window.AudioManager.playSE('decision.ogg');
            setTimeout(onClick, 300); 
        };

        msgContainer.onclick = (e) => {
            e.stopPropagation(); e.preventDefault();
            // ★追加：鍵がかかっている間（1秒間）はクリックしても何も起きません
            if (isClickLocked) return;
            if (isFinished) return;
            
            if (isPaused) {
                isPaused = false;
                promptContainer.textContent = '▼'; 
                if (window.AudioManager) window.AudioManager.playSE('decision.ogg');
                processNext();
            } else {
                skipToEnd();
            }
        };

        const processNext = () => {
            if (isFinished) return;
            if (currentIndex >= messages.length) {
                promptContainer.style.visibility = 'hidden';
                currentTimer = setTimeout(() => { if (!isFinished) { isFinished = true; onClick(); } }, 1200);
                return;
            }
            const item = messages[currentIndex++];
            let waitTime = 700;
            
            let msgText = typeof item === 'string' ? item : (item.text || '');
            let isSpecialMsg = /color\s*:\s*(#d32f2f|red)/i.test(msgText); 

            if (isSpecialMsg) {
                textContainer.innerHTML = ''; 
            }

            if (typeof item === 'string') {
                textContainer.innerHTML += (textContainer.innerHTML ? '<br>' : '') + item;
            } else if (item.text) {
                if (item.se && window.AudioManager) window.AudioManager.playSE(item.se);
                textContainer.innerHTML += (textContainer.innerHTML ? '<br>' : '') + item.text;
                if (item.type === 'damage' || item.type === 'recover') {
                    this.playDamageAnimation(item);
                    waitTime = 900;
                }
            } else if (item.type === 'damage' || item.type === 'recover') {
                this.playDamageAnimation(item);
                waitTime = 900;
            } else { waitTime = 0; }

            textContainer.scrollTop = textContainer.scrollHeight;

            if (isSpecialMsg) {
                isPaused = true;
                
                // ★追加：赤文字の時は1秒間クリックできなくします
                isClickLocked = true;
                promptContainer.style.visibility = 'hidden'; // ロック中は進める合図（▼）も隠します
                
                setTimeout(() => {
                    isClickLocked = false; // 1秒経ったら鍵を開けます
                    // 鍵が開いたら、進める合図（▼）を出します
                    if (!isFinished && isPaused) {
                        promptContainer.textContent = '▼'; 
                        promptContainer.style.visibility = 'visible';
                    }
                }, 1000);
                
                return; 
            }

            currentTimer = setTimeout(processNext, waitTime);
        };
        processNext();
    }

    playDamageAnimation(data) {
        // 送られてきたお手紙（data）の中に音（se）の指定があればそれを鳴らします
        if (window.AudioManager) {
            let soundFile = data.se || 'damage001.ogg';
            if (soundFile === 'bow_double') {
                // 発射音のタイマー
                window.AudioManager.playSE('bow001.mp3');
                setTimeout(() => { window.AudioManager.playSE('bow001.mp3'); }, 150);
                setTimeout(() => { window.AudioManager.playSE('bow001.mp3'); }, 300);

                // 命中音のタイマー
                setTimeout(() => { window.AudioManager.playSE('bow_hit001.mp3'); }, 550);
                setTimeout(() => { window.AudioManager.playSE('bow_hit001.mp3'); }, 700);
                setTimeout(() => { window.AudioManager.playSE('bow_hit001.mp3'); }, 950);
            } else {
                window.AudioManager.playSE(soundFile);
            }
        }

        // 対象の「役割（role）」ごとに、どのカードを揺らすか探す魔法です！
        // ★修正：回復の時は揺らさずに出すように、isRecover という合図を追加しました
        const applyAnim = (role, dmgStr, isRecover = false) => {
            let targetCard = null;
            if (role === 'attacker') {
                const n = document.getElementById('war-atk-name');
                if (n) targetCard = n.closest('.responsive-army-box, .army-box');
            } else if (role === 'attacker_self_reinf') {
                targetCard = document.getElementById('war-atk-self-reinf-card');
            } else if (role === 'attacker_ally_reinf') {
                targetCard = document.getElementById('war-atk-ally-reinf-card');
            } else if (role === 'defender') {
                const n = document.getElementById('war-def-name');
                if (n) targetCard = n.closest('.responsive-army-box, .army-box');
            } else if (role === 'defender_self_reinf') {
                targetCard = document.getElementById('war-def-self-reinf-card');
            } else if (role === 'defender_ally_reinf') {
                targetCard = document.getElementById('war-def-ally-reinf-card');
            }

            if (targetCard) {
                targetCard.style.position = 'relative'; 
                
                targetCard.classList.remove('anim-damage-shake', 'anim-damage-flash');
                void targetCard.offsetWidth; 
                
                // ★追加：回復じゃない時（ダメージの時）だけ揺らします
                if (!isRecover) {
                    targetCard.classList.add('anim-damage-shake', 'anim-damage-flash');
                }
                
                const pop = document.createElement('div');
                // ★追加：回復の時は緑色のデザイン（recover-popup）を使います！
                pop.className = isRecover ? 'recover-popup anim-popup-text' : 'damage-popup anim-popup-text';
                pop.innerHTML = dmgStr;
                
                // ★追加：どのカードでも絶対に「ど真ん中」から文字が出るように固定する魔法です！
                pop.style.position = 'absolute';
                pop.style.top = '50%';
                pop.style.left = '50%';
                pop.style.transform = 'translate(-50%, -50%)';
                pop.style.zIndex = '100'; // 他のものより一番手前に出します
                pop.style.pointerEvents = 'none'; // 文字が邪魔でクリックできなくなるのを防ぎます

                // ★追加：数字たちが迷子にならないように、このカードを基準（relative）にします！
                targetCard.style.position = 'relative';

                targetCard.appendChild(pop);

                setTimeout(() => {
                    targetCard.classList.remove('anim-damage-shake', 'anim-damage-flash');
                    if (pop.parentNode) pop.parentNode.removeChild(pop);
                }, 1000);
            }
        };

        // 城の防御力の文字がある場所を揺らす専用の魔法です！
        const applyWallAnim = (dmgStr, isRecover = false) => {
            let wallEl = document.getElementById('war-def-wall-info');
            if (wallEl) {
                // ★修正：揺らす対象を「数字だけ」に、赤く光らせる対象を「八角形の枠」にします！
                let hexWrap = wallEl.closest('.war-wall-hexagon-wrap');
                
                if (!hexWrap) hexWrap = wallEl;
                
                wallEl.classList.remove('anim-damage-shake'); // 数字の揺れをリセット
                hexWrap.classList.remove('anim-damage-flash'); // 枠の赤い光をリセット
                void wallEl.offsetWidth; 
                void hexWrap.offsetWidth; 
                
                // ★追加：回復じゃない時（ダメージの時）だけ効果を出します
                if (!isRecover) {
                    wallEl.classList.add('anim-damage-shake'); // ★数字だけを揺らします
                    hexWrap.classList.add('anim-damage-flash');    // 枠の中だけ赤く光らせます
                }
                
                const pop = document.createElement('div');
                // ★追加：回復の時は緑色のデザインを使います！
                pop.className = isRecover ? 'recover-popup anim-popup-text' : 'damage-popup anim-popup-text';
                pop.innerHTML = dmgStr;
                
                // ★追加：城壁のダメージも絶対に「ど真ん中」から文字が出るように固定します！
                pop.style.position = 'absolute';
                pop.style.top = '50%';
                pop.style.left = '50%';
                pop.style.transform = 'translate(-50%, -50%)';
                pop.style.zIndex = '100';
                pop.style.pointerEvents = 'none';

                // ★追加：ダメージの文字（-50など）の基準を八角形の枠にします！
                hexWrap.style.position = 'relative';
                // 数字そのものではなく、動かない枠の方にダメージ文字をくっつけます
                hexWrap.appendChild(pop);

                setTimeout(() => {
                    wallEl.classList.remove('anim-damage-shake');
                    hexWrap.classList.remove('anim-damage-flash');
                    if (pop.parentNode) pop.parentNode.removeChild(pop);
                }, 1000);
            }
        };

        // ★追加：回復（recover）の時と、ダメージの時で動きを分けます！
        if (data.type === 'recover') {
            if (data.soldierCost > 0) {
                applyAnim(data.targetRole, `-${data.soldierCost}`, false); // 兵士は減るので赤で揺らします
            }
            if (data.wallRecover > 0) {
                applyWallAnim(`+${data.wallRecover}`, true); // 城壁は回復なので緑で揺らしません
            }
        } else {
            // 今までのダメージ処理
            if (data.soldierDmgDetails) {
                for (const [role, dmg] of Object.entries(data.soldierDmgDetails)) {
                    if (dmg > 0) applyAnim(role, `-${dmg}`);
                }
            } else if (data.soldierDmg && data.soldierDmg > 0) {
                applyAnim(data.target, `-${data.soldierDmg}`);
            }

            if (data.wallDmg && data.wallDmg > 0) applyWallAnim(`-${data.wallDmg}`);
            if (data.counterDmg && data.counterDmg > 0 && data.counterTarget) applyAnim(data.counterTarget, `-${data.counterDmg}`);
        }

        // アニメーションが始まって少し経った時（0.4秒後）に、画面の数字を更新する魔法
        if (data.currentStats) {
            setTimeout(() => {
                const updateTxt = (id, val) => {
                    const el = document.getElementById(id);
                    if (el) {
                        if (el.textContent === '---') return;

                        if (id === 'war-def-wall-info') {
                            el.innerHTML = `<span style="color:#fdea60;">${val}</span>`;
                        } else if (id.includes('soldier')) {
                            el.textContent = val + '人';
                        } else {
                            el.textContent = val;
                        }
                    }
                };

                updateTxt('war-atk-soldier', data.currentStats.atkSoldiers);
                updateTxt('war-atk-self-reinf-soldier', data.currentStats.atkSelfSoldiers);
                updateTxt('war-atk-ally-reinf-soldier', data.currentStats.atkAllySoldiers);
                updateTxt('war-def-soldier', data.currentStats.defSoldiers);
                updateTxt('war-def-self-reinf-soldier', data.currentStats.defSelfSoldiers);
                updateTxt('war-def-ally-reinf-soldier', data.currentStats.defAllySoldiers);
                updateTxt('war-def-wall-info', data.currentStats.wallDefense);

                // ★今回追加：war.jsから送られてきた「士気」の最新データも、兵士数と同時に画面に書き込みます！
                updateTxt('war-atk-morale', data.currentStats.atkMorale);
                updateTxt('war-def-morale', data.currentStats.defMorale);
                
                updateTxt('war-atk-self-reinf-morale', data.currentStats.atkSelfMorale);
                updateTxt('war-atk-ally-reinf-morale', data.currentStats.atkAllyMorale);
                updateTxt('war-def-self-reinf-morale', data.currentStats.defSelfMorale);
                updateTxt('war-def-ally-reinf-morale', data.currentStats.defAllyMorale);
                
                // スマホ用の縦並びレイアウト時の士気も念のため同時に更新します
                updateTxt('war-atk-self-reinf-morale-sp', data.currentStats.atkSelfMorale);
                updateTxt('war-atk-ally-reinf-morale-sp', data.currentStats.atkAllyMorale);
                updateTxt('war-def-self-reinf-morale-sp', data.currentStats.defSelfMorale);
                updateTxt('war-def-ally-reinf-morale-sp', data.currentStats.defAllyMorale);

                let highlightIds = [];
                
                // ★追加：回復の時は、特別な光らせ方をします！
                if (data.type === 'recover') {
                    // 兵士が減った部隊は黄色く光らせます
                    if (data.targetRole === 'defender') highlightIds.push('war-def-soldier');
                    if (data.targetRole === 'defender_self_reinf') highlightIds.push('war-def-self-reinf-soldier');
                    if (data.targetRole === 'defender_ally_reinf') highlightIds.push('war-def-ally-reinf-soldier');
                    
                    // 城壁は「緑色」に光らせます！
                    const wallEl = document.getElementById('war-def-wall-info');
                    if (wallEl) {
                        wallEl.style.transition = 'color 0.2s';
                        wallEl.style.color = '#388e3c'; // 緑色！
                        setTimeout(() => { wallEl.style.color = ''; }, 300);
                    }
                } else {
                    const addHighlight = (role) => {
                        if (role === 'attacker') highlightIds.push('war-atk-soldier');
                        if (role === 'attacker_self_reinf') highlightIds.push('war-atk-self-reinf-soldier');
                        if (role === 'attacker_ally_reinf') highlightIds.push('war-atk-ally-reinf-soldier');
                        if (role === 'defender') highlightIds.push('war-def-soldier');
                        if (role === 'defender_self_reinf') highlightIds.push('war-def-self-reinf-soldier');
                        if (role === 'defender_ally_reinf') highlightIds.push('war-def-ally-reinf-soldier');
                    };

                    if (data.soldierDmgDetails) {
                        for (const [role, dmg] of Object.entries(data.soldierDmgDetails)) {
                            if (dmg > 0) addHighlight(role);
                        }
                    } else if (data.soldierDmg && data.soldierDmg > 0) {
                        addHighlight(data.target);
                    }

                    if (data.counterDmg && data.counterDmg > 0 && data.counterTarget) {
                        addHighlight(data.counterTarget);
                    }
                    
                    // 城壁がダメージを受けた時は黄色く光らせます
                    if (data.wallDmg && data.wallDmg > 0) {
                        const wallEl = document.getElementById('war-def-wall-info');
                        if (wallEl) {
                            wallEl.style.transition = 'color 0.2s';
                            wallEl.style.color = '#fdea60'; // 黄色！
                            setTimeout(() => { wallEl.style.color = ''; }, 300);
                        }
                    }
                }

                highlightIds = [...new Set(highlightIds)];

                highlightIds.forEach(id => {
                    const el = document.getElementById(id);
                    if (el && el.textContent !== '---') { 
                        el.style.transition = 'color 0.2s';
                        el.style.color = '#fdea60'; // 兵士が減った時は黄色
                        setTimeout(() => { el.style.color = ''; }, 300); 
                    }
                });

                // ★追加：ダメージを受けた結果、援軍が壊滅（消滅）していたら即座にフェードインで消します！
                const s = this.game.warManager.state;
                const checkAndFadeOut = (prefix, reinfData) => {
                    if (!reinfData) {
                        const card = document.getElementById(`war-${prefix}-reinf-card`);
                        if (card) {
                            const titleEl = card.querySelector('.responsive-army-title');
                            if (titleEl && titleEl.style.visibility !== 'hidden') {
                                this.applyEmptyCardAnimation(card);
                            }
                        }
                    }
                };
                checkAndFadeOut('atk-self', s.selfReinforcement);
                checkAndFadeOut('atk-ally', s.reinforcement);
                checkAndFadeOut('def-self', s.defSelfReinforcement);
                checkAndFadeOut('def-ally', s.defReinforcement);

            }, 400); 
        }
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
                el.src = `data/images/faceicons/${busho.faceIcon}`;
                el.classList.remove('hidden');
                el.onerror = () => { el.src = 'data/images/faceicons/unknown_face.webp'; }; 
            } else {
                el.src = 'data/images/faceicons/unknown_face.webp';
                el.classList.remove('hidden');
            }
        };

        setTxt('war-date-info', `${this.game.year}年 ${this.game.month}月`);
        const maxRounds = window.WarParams?.Military?.WarMaxRounds || 10;
        
        const turnEl = document.getElementById('war-turn-info');
        if (turnEl) turnEl.innerHTML = `残り <span class="turn-number">${Math.max(0, maxRounds - s.round + 1)}</span>ターン`;
        
        const wallEl = document.getElementById('war-def-wall-info');
        if (wallEl) wallEl.innerHTML = `<span style="color:#fdea60;">${s.defender.defense}</span>`;

        const titleNameEl = document.getElementById('war-title-name');
        if (titleNameEl) {
            // ★修正：スマホで長くなった時に単語の途中で改行されないよう、名前と種類のブロックを分けます
            if (s.defender.isKunishu) {
                titleNameEl.innerHTML = `<span style="display:inline-block;">${s.defender.name}</span> <span style="display:inline-block;">鎮圧戦</span>`;
            } else {
                titleNameEl.innerHTML = `<span style="display:inline-block;">${s.defender.name}</span> <span style="display:inline-block;">攻防戦</span>`;
            }
        }
        
        const atkClan = this.game.clans.find(c => c.id === s.attacker.ownerClan);
        const atkName = s.attacker.isKunishu ? s.attacker.name : (atkClan ? atkClan.name : "土豪");
        setTxt('war-atk-name', atkName);
        
        const atkTitleEl = document.getElementById('war-atk-name').parentElement;
        if (atkName.length >= 8) {
            atkTitleEl.classList.add('title-long-text');
        } else {
            atkTitleEl.classList.remove('title-long-text');
        }
        
        setTxt('war-atk-busho', s.atkBushos[0].name.split('|').join('') + '軍');
        setTxt('war-atk-soldier', s.attacker.soldiers + '人');
        setTxt('war-atk-morale', s.attacker.morale);
        setTxt('war-atk-training', s.attacker.training);
        setTxt('war-atk-rice', s.attacker.rice); 
        updateFace('war-atk-face', s.atkBushos[0]);
        
        const defClan = this.game.clans.find(c => c.id === s.defender.ownerClan);
        const defNameText = s.defender.isKunishu ? s.defender.name : (defClan ? defClan.name : "土豪");
        setTxt('war-def-name', defNameText);
        
        const defTitleEl = document.getElementById('war-def-name').parentElement;
        if (defNameText.length >= 8) {
            defTitleEl.classList.add('title-long-text');
        } else {
            defTitleEl.classList.remove('title-long-text');
        }

        setTxt('war-def-busho', s.defBusho.name.split('|').join('') + '軍');
        setTxt('war-def-soldier', s.defender.soldiers + '人');
        setTxt('war-def-morale', s.defender.morale);
        setTxt('war-def-training', s.defender.training);
        setTxt('war-def-rice', s.defender.rice); 
        updateFace('war-def-face', s.defBusho);
        
        // ★HTMLに用意した枠へ、援軍の情報を流し込む魔法です！
        const updateReinfCardUI = (prefix, reinfData, fallbackClanId) => {
            const card = document.getElementById(`war-${prefix}-reinf-card`);
            if (!card) return;

            const orgEl = document.getElementById(`war-${prefix}-reinf-org`);
            const faceContainer = document.getElementById(`war-${prefix}-reinf-face-container`);
            const faceImg = document.getElementById(`war-${prefix}-reinf-face`);
            const emptyIcon = document.getElementById(`war-${prefix}-reinf-empty-icon`);
            const bushoEl = document.getElementById(`war-${prefix}-reinf-busho`);
            const soldierEl = document.getElementById(`war-${prefix}-reinf-soldier`);
            const riceEl = document.getElementById(`war-${prefix}-reinf-rice`);
            const moraleEl = document.getElementById(`war-${prefix}-reinf-morale`);
            const trainingEl = document.getElementById(`war-${prefix}-reinf-training`);
            const moraleSpEl = document.getElementById(`war-${prefix}-reinf-morale-sp`);
            const trainingSpEl = document.getElementById(`war-${prefix}-reinf-training-sp`);
            
            const titleEl = card.querySelector('.responsive-army-title');
            const statsEl = card.querySelector('.responsive-army-stats');

            if (!reinfData) {
                // 誰も来ていない（空っぽ）時
                // ★修正：カードに「直前まで部隊がいたよシール」が貼られているか確認します
                const wasHere = card.dataset.hasUnit === 'true';
                
                if (wasHere) {
                    // さっきまで部隊がいたなら、アニメーションで消します
                    this.applyEmptyCardAnimation(card);
                    card.dataset.hasUnit = 'false'; // シールを「いない」に貼り替えます
                } else {
                    // 最初から空っぽ、またはアニメーション完了済みの時はそのまま空にする
                    card.style.background = 'linear-gradient(to top right, #eeeeee, #777777)';
                    
                    // 中身の要素をすべて透明にして、レイアウト（大きさ）だけを維持します
                    titleEl.style.visibility = 'hidden';
                    bushoEl.style.visibility = 'hidden';
                    card.querySelector('.reinf-content-wrap').style.visibility = 'hidden';

                    orgEl.textContent = '';
                    bushoEl.textContent = '';
                    soldierEl.textContent = '';
                    riceEl.textContent = '';
                    moraleEl.textContent = '';
                    trainingEl.textContent = '';
                    if(moraleSpEl) moraleSpEl.textContent = '';
                    if(trainingSpEl) trainingSpEl.textContent = '';
                    
                    card.dataset.hasUnit = 'false'; // 念のためシールを「いない」にしておきます
                }
            } else {
                // 援軍が来ている時は、所属に応じた鮮やかなグラデーションにします！
                card.dataset.hasUnit = 'true'; // ★追加：部隊が「いる」というシールを貼ります！
                
                card.style.backgroundColor = ''; 
                if (prefix === 'atk-self') card.style.background = 'linear-gradient(to top right, #ffcdd2, #d32f2f)';
                else if (prefix === 'atk-ally') card.style.background = 'linear-gradient(to top right, #ffecb3, #f57c00)';
                else if (prefix === 'def-self') card.style.background = 'linear-gradient(to top right, #b3e5fc, #0288d1)';
                else if (prefix === 'def-ally') card.style.background = 'linear-gradient(to top right, #b2dfdb, #00897b)';
                
                card.style.textShadow = '1px 1px 2px rgba(0,0,0,0.6)';
                
                // 透明化を解除して見えるようにします
                titleEl.style.visibility = '';
                bushoEl.style.visibility = '';
                card.querySelector('.reinf-content-wrap').style.visibility = '';

                faceContainer.classList.remove('hidden');
                emptyIcon.classList.add('hidden');

                const leader = reinfData.bushos && reinfData.bushos.length > 0 ? reinfData.bushos[0] : null;
                const leaderName = leader ? leader.name.split('|').join('') + "軍" : "不明";
                
                if (leader && leader.faceIcon) {
                    faceImg.src = `data/images/faceicons/${leader.faceIcon}`;
                    faceImg.onerror = () => { faceImg.src = 'data/images/faceicons/unknown_face.webp'; };
                } else {
                    faceImg.src = 'data/images/faceicons/unknown_face.webp';
                }

                let orgName = "";
                if (reinfData.isKunishuForce) {
                    orgName = this.game.kunishuSystem.getKunishu(reinfData.kunishuId)?.getName(this.game) || "諸勢力";
                } else {
                    let targetClanId = fallbackClanId;
                    if (reinfData.ownerClan !== undefined) {
                        targetClanId = reinfData.ownerClan;
                    } else if (leader && leader.ownerClan !== undefined) {
                        targetClanId = leader.ownerClan;
                    } else if (reinfData.castle && reinfData.castle.ownerClan !== undefined) {
                        targetClanId = reinfData.castle.ownerClan;
                    }
                    const clan = this.game.clans.find(c => c.id === targetClanId);
                    orgName = clan ? clan.name : "土豪";
                }

                // ここでHTMLに値を流し込みます
                orgEl.textContent = orgName;
                orgEl.textContent = orgName;
                bushoEl.textContent = leaderName;
                soldierEl.textContent = (reinfData.soldiers || 0) + '人';
                riceEl.textContent = reinfData.rice || 0;
                moraleEl.textContent = reinfData.morale || 0;
                trainingEl.textContent = reinfData.training || 0;
                if(moraleSpEl) moraleSpEl.textContent = reinfData.morale || 0;
                if(trainingSpEl) trainingSpEl.textContent = reinfData.training || 0;
            }
        };
        
        // メイン部隊と同じように、4つの援軍カードをまとめて更新します
        updateReinfCardUI('atk-self', s.selfReinforcement, s.attacker.ownerClan);
        updateReinfCardUI('atk-ally', s.reinforcement, s.attacker.ownerClan);
        updateReinfCardUI('def-self', s.defSelfReinforcement, s.defender.ownerClan);
        updateReinfCardUI('def-ally', s.defReinforcement, s.defender.ownerClan);
        
        // ★ ハイライトの更新
        const allCards = document.querySelectorAll('.army-box, .responsive-army-box');
        allCards.forEach(c => c.classList.remove('active-command-turn'));

        if (s.phase === 'command') {
            let targetCard = null;
            if (s.turn === 'attacker') {
                const n = document.getElementById('war-atk-name');
                if (n) targetCard = n.closest('.responsive-army-box, .army-box');
            } else if (s.turn === 'defender') {
                const n = document.getElementById('war-def-name');
                if (n) targetCard = n.closest('.responsive-army-box, .army-box');
            } else if (s.turn === 'attacker_self_reinf') {
                targetCard = document.getElementById('war-atk-self-reinf-card');
            } else if (s.turn === 'attacker_ally_reinf') {
                targetCard = document.getElementById('war-atk-ally-reinf-card');
            } else if (s.turn === 'defender_self_reinf') {
                targetCard = document.getElementById('war-def-self-reinf-card');
            } else if (s.turn === 'defender_ally_reinf') {
                targetCard = document.getElementById('war-def-ally-reinf-card');
            }
            if (targetCard) {
                targetCard.classList.add('active-command-turn');
            }
        }
    }

    // ui.js の renderWarControls をまるごと以下に差し替え！

    renderWarControls(isAtkTurn) {
        if (!this.warControls) return;
        
        const s = this.game.warManager.state;
        const pid = Number(this.game.playerClanId);
        
        // ★修正: 自分が操作できる部隊かどうかを、それぞれの役割ごとに厳密にチェックします！
        // これにより、自分がメイン軍の時に友軍を操作したり、自分が援軍の時にメイン軍を操作してしまうのを防ぎます。
        let isMyTurn = false;
        if (s.turn === 'attacker' && Number(s.attacker.ownerClan) === pid && !s.sourceCastle.isDelegated) isMyTurn = true;
        if (s.turn === 'attacker_self_reinf' && Number(s.selfReinforcement.castle.ownerClan) === pid && !s.selfReinforcement.castle.isDelegated) isMyTurn = true;
        if (s.turn === 'attacker_ally_reinf' && Number(s.reinforcement.castle.ownerClan) === pid && !s.reinforcement.castle.isDelegated) isMyTurn = true;
        if (s.turn === 'defender' && Number(s.defender.ownerClan) === pid && !s.defender.isDelegated) isMyTurn = true;
        if (s.turn === 'defender_self_reinf' && Number(s.defSelfReinforcement.castle.ownerClan) === pid && !s.defSelfReinforcement.castle.isDelegated) isMyTurn = true;
        if (s.turn === 'defender_ally_reinf' && Number(s.defReinforcement.castle.ownerClan) === pid && !s.defReinforcement.castle.isDelegated) isMyTurn = true;
        
        let options = [];
        
        // ★修正: 順番が回ってきたのが「攻撃陣営」か「守備陣営」かで、出すコマンドを切り替えます
        if (isAtkTurn) {
            options = [
                { label: "突撃", type: "charge", desc: "突撃します。敵兵士を減らし、城壁にも少し被害を与えます。" }, 
                { label: "斉射", type: "bow", desc: "遠距離から射撃を行います。反撃を受けにくい攻撃です。" }, 
                { label: "破壊", type: "siege", desc: "城壁を破壊します。反撃のリスクは高いですが、城壁に大きな被害を与えます。" },
                { label: "火計", type: "fire", desc: "知略を用いて城に火を放ちます。成功すると敵の防御力を無視して城壁を削ります。" }, 
                { label: "鼓舞", type: "inspire", desc: "味方を鼓舞して、部隊の士気を高めます。" }
            ];
        } else {
            options = [
                { label: "突撃", type: "def_charge", desc: "突撃します。敵兵士を減らします。" },
                { label: "斉射", type: "def_bow", desc: "遠距離から射撃を行います。反撃を受けにくい攻撃です。" }, 
                { label: "籠城", type: "def_attack", desc: "守りを固めます。このターン、敵から受けるダメージを半分にします。" },
                { label: "挑発", type: "provoke", desc: "敵を挑発します。成功すると敵の「突撃」を誘い、反撃で与える被害が増えます。" }, 
                { label: "鼓舞", type: "def_inspire", desc: "味方を鼓舞して、部隊の士気を高めます。" }
            ];
        }

        // ★撤退コマンドの追加（本隊と援軍で処理を分けます）
        if (s.turn === 'attacker') {
            options.push({ label: "撤退", type: "retreat", desc: "戦場から離脱し、退却します。" });
        } else if (s.turn === 'defender') {
            // ★修正：中立の空き城（ownerClanが0）の守備軍は、撤退できないようにガードを追加します！
            if (s.defender.ownerClan !== 0 && this.game.castles.some(c => c.ownerClan === s.defender.ownerClan && c.id !== s.defender.id && GameSystem.isReachable(this.game, s.defender, c, s.defender.ownerClan))) {
                options.push({ label: "撤退", type: "retreat", desc: "城を捨てて、安全な城へ退却します。" });
            }
        } else {
            // 援軍の場合は攻撃・守備に関わらず撤退可能
            options.push({ label: "撤退", type: "retreat", desc: "戦場から離脱し、退却します。" });
        }

        this.warControls.innerHTML = '';

        // ★左側のボタンを入れる箱（3分の2）
        const btnContainer = document.createElement('div');
        btnContainer.className = 'war-controls-buttons';

        // ★右側の説明を入れる箱（3分の1）
        const descContainer = document.createElement('div');
        descContainer.className = 'war-controls-desc';
        descContainer.innerHTML = '<div style="color:#666; text-align:center; margin-top:15px;">命令を選択してください</div>';

        // 2つの箱を画面に追加します
        this.warControls.appendChild(btnContainer);
        this.warControls.appendChild(descContainer);

        let selectedBtnInfo = null; // ★今どのボタンが「1回押された状態」かを覚えておく箱です

        options.forEach(cmd => {
            const btn = document.createElement('button');
            btn.textContent = cmd.label;
            
            btn.onclick = () => {
                if(!isMyTurn) return;

                // もし「既に選ばれているボタン」をもう一度押したら、ついに実行します！
                if (selectedBtnInfo === cmd.type) {
                    if (window.AudioManager) window.AudioManager.playSE('decision.ogg');
                    this.game.warManager.execWarCmd(cmd.type);
                } else {
                    // 初めて押した時（または別のボタンから乗り換えた時）
                    if (window.AudioManager) window.AudioManager.playSE('choice.ogg');
                    
                    selectedBtnInfo = cmd.type; // 選んだボタンを記憶
                    
                    // 右側の箱に説明を書き出します
                    descContainer.innerHTML = `
                        <div style="font-weight:bold; font-size:1.1rem; border-bottom:1px solid #ccc; padding-bottom:5px; margin-bottom:5px;">${cmd.label}</div>
                        <div>${cmd.desc}</div>
                        <div style="margin-top:8px; color:#d32f2f; font-weight:bold; font-size:0.85rem;">もう一度押すと実行します</div>
                    `;

                    // すべてのボタンの「選択中」の光を消して、今押したボタンだけを光らせます
                    Array.from(btnContainer.children).forEach(b => b.classList.remove('active-cmd'));
                    btn.classList.add('active-cmd');
                }
            };
            btnContainer.appendChild(btn);
        });

        const guard = document.getElementById('war-ai-guard');
        if (!isMyTurn) {
            this.warControls.classList.add('disabled-area');
            if (guard) {
                guard.classList.remove('hidden');
                const textEl = document.getElementById('war-ai-guard-text');
                if (textEl) textEl.textContent = isAtkTurn ? "攻撃軍 思考中..." : "守備軍 思考中...";
            }
        } else {
            this.warControls.classList.remove('disabled-area');
            if (guard) guard.classList.add('hidden');
        }
    }

    showRetreatSelector(castle, candidates, onSelect) {
        const modal = document.getElementById('retreat-modal');
        const list = document.getElementById('retreat-list');
        if (!modal || !list) return; 
        
        modal.classList.remove('hidden'); 
        list.innerHTML = '';
        
        candidates.forEach(c => {
            const div = document.createElement('div'); 
            // 撤退専用のデザイン（retreat-btn）を使います
            div.className = 'retreat-btn'; 
            div.innerHTML = `<div style="text-align:center;"><strong>${c.name}</strong><br><small>兵数:${c.soldiers} 防御:${c.defense}</small></div>`;
            
            div.onclick = () => { 
                if (window.AudioManager) window.AudioManager.playSE('choice.ogg');
                modal.classList.add('hidden'); 
                onSelect(c.id); 
            };
            list.appendChild(div);
        });
    }

    showPrisonerModal(captives) {
        this.info.showPrisonerModal(captives);
    }
    closePrisonerModal() {
        this.info.closePrisonerModal();
    }
    
    showDaimyoPrisonerModal(prisoner) {
        this.info.showDaimyoPrisonerModal(prisoner);
    }
    
    showSuccessionModal(candidates, onSelect) {
        if (!this.successionModal) return;
        this.successionModal.classList.remove('hidden');
        if (this.successionList) {
            this.successionList.innerHTML = '';

            const gunshi = this.game.getClanGunshi(this.game.playerClanId);
            const myDaimyo = this.game.bushos.find(b => b.clan === this.game.playerClanId && b.isDaimyo);

            candidates.forEach(c => {
                const div = document.createElement('div');
                div.className = 'select-item';
                div.style.display = 'flex';
                div.style.alignItems = 'center';
                
                const getStat = (stat) => GameSystem.getDisplayStatHTML(c, stat, gunshi, null, this.game.playerClanId, myDaimyo);

                div.innerHTML = `
                    <span style="flex:1; font-weight:bold;">${c.name}</span> 
                    <span style="display:flex; gap:5px; align-items:center;">統:${getStat('leadership')} 政:${getStat('politics')}</span>
                `;
                div.onclick = () => {
                    this.successionModal.classList.add('hidden');
                    onSelect(c.id);
                };
                this.successionList.appendChild(div);
            });
        }
    }
    
    showReinforcementSelector(candidateCastles, atkCastle, targetCastle, atkBushos, sVal, rVal, hVal, gVal, selfReinfData) {
        this.forceResetModals();
        this.game.tempReinfData = {
            candidates: candidateCastles, // ★ これを追加！
            atkCastle, targetCastle, atkBushos, sVal, rVal, hVal, gVal, selfReinfData,
            onCancel: () => this.game.warManager.startWar(atkCastle, targetCastle, atkBushos, sVal, rVal, hVal, gVal, null, selfReinfData)
        };
        this.game.selectionMode = 'atk_ally_reinforcement';
        this.game.validTargets = candidateCastles.map(c => c.id);
        this.renderMap();
        this.log("援軍を要請する勢力の城を選択してください。");
        this.renderSelectionModeMenu(); // ★これを追加してメニューを「戻る」だけにします！
    }

    showReinforcementGoldSelector(helperCastle, atkCastle, targetCastle, atkBushos, sVal, rVal, hVal, gVal, selfReinfData, backToMap) {
        const rel = this.game.getRelation(this.game.playerClanId, helperCastle.ownerClan);
        if (rel.status === '支配') {
            this.game.commandSystem.executeReinforcementRequest(0, helperCastle, atkCastle, targetCastle, atkBushos, sVal, rVal, hVal, gVal, selfReinfData);
            return;
        }

        if (!this.quantityModal) return;
        this.quantityModal.classList.remove('hidden'); 
        if (this.quantityContainer) this.quantityContainer.innerHTML = '';
        if (this.charityTypeSelector) this.charityTypeSelector.classList.add('hidden'); 
        if (this.tradeTypeInfo) this.tradeTypeInfo.classList.add('hidden'); 

        document.getElementById('quantity-title').textContent = "使者に持たせる金 (最大1500)"; 
        const maxGold = Math.min(1500, atkCastle.gold);

        const wrap = document.createElement('div'); 
        wrap.className = 'qty-row'; 
        wrap.innerHTML = `<label>持参金 (Max: ${maxGold})</label><div class="qty-control"><input type="range" id="range-reinf-gold" min="0" max="${maxGold}" value="0"><input type="number" id="num-reinf-gold" min="0" max="${maxGold}" value="0"></div>`; 
        this.quantityContainer.appendChild(wrap); 

        const range = wrap.querySelector(`#range-reinf-gold`); 
        const num = wrap.querySelector(`#num-reinf-gold`); 
        const setVal = (v) => { if (v < 0) v = 0; if (v > maxGold) v = maxGold; range.value = v; num.value = v; };
        range.oninput = () => num.value = range.value; 
        num.oninput = () => { let v = parseInt(num.value); if (!isNaN(v)) setVal(v); };

        this.quantityConfirmBtn.onclick = () => {
            this.quantityModal.classList.add('hidden');
            this.game.commandSystem.executeReinforcementRequest(parseInt(num.value) || 0, helperCastle, atkCastle, targetCastle, atkBushos, sVal, rVal, hVal, gVal, selfReinfData);
        };
        
        const cancelBtn = this.quantityModal.querySelector('.btn-secondary');
        if (cancelBtn) {
            cancelBtn.onclick = () => {
                this.quantityModal.classList.add('hidden');
                // ★ 変更：キャンセルした時にマップ選択に戻ります
                if (backToMap) backToMap();
                else this.game.warManager.startWar(atkCastle, targetCastle, atkBushos, sVal, rVal, hVal, gVal, null, selfReinfData);
            };
        }
    }

    showSelfReinforcementSelector(candidateCastles, atkCastle, targetCastle, onComplete) {
        this.forceResetModals();
        this.game.tempReinfData = {
            candidates: candidateCastles, // ★ これを追加！
            atkCastle, targetCastle, onComplete,
            onCancel: () => onComplete(null)
        };
        this.game.selectionMode = 'atk_self_reinforcement';
        this.game.validTargets = candidateCastles.map(c => c.id);
        this.renderMap();
        this.log("援軍を出陣させる城を選択してください。");
        this.renderSelectionModeMenu(); // ★これを追加してメニューを「戻る」だけにします！
    }
    
    showDefReinforcementSelector(candidateCastles, defCastle, selfReinfData, onComplete) {
        // ※引数のズレを吸収する処理
        if (typeof selfReinfData === 'function') {
            onComplete = selfReinfData;
            selfReinfData = null;
        }
        this.forceResetModals();
        this.game.tempReinfData = {
            candidates: candidateCastles, // ★ これを追加！
            defCastle, onComplete, selfReinfData,
            onCancel: () => onComplete()
        };
        this.game.selectionMode = 'def_ally_reinforcement';
        this.game.validTargets = candidateCastles.map(c => c.id);
        this.renderMap();
        this.log("援軍を要請する勢力の城を選択してください。");
        this.renderSelectionModeMenu(); // ★これを追加してメニューを「戻る」だけにします！
    }

    showDefReinforcementGoldSelector(helperCastle, defCastle, onComplete, backToMap) {
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

        document.getElementById('quantity-title').textContent = "使者に持たせる金 (最大1500)"; 
        const maxGold = Math.min(1500, defCastle.gold);

        const wrap = document.createElement('div'); 
        wrap.className = 'qty-row'; 
        wrap.innerHTML = `<label>持参金 (Max: ${maxGold})</label><div class="qty-control"><input type="range" id="range-def-gold" min="0" max="${maxGold}" value="0"><input type="number" id="num-def-gold" min="0" max="${maxGold}" value="0"></div>`; 
        this.quantityContainer.appendChild(wrap); 

        const range = wrap.querySelector(`#range-def-gold`); 
        const num = wrap.querySelector(`#num-def-gold`); 
        const setVal = (v) => { if (v < 0) v = 0; if (v > maxGold) v = maxGold; range.value = v; num.value = v; };
        range.oninput = () => num.value = range.value; 
        num.oninput = () => { let v = parseInt(num.value) || 0; setVal(v); };

        this.quantityConfirmBtn.onclick = () => {
            this.quantityModal.classList.add('hidden');
            this.game.warManager.executeDefReinforcement(parseInt(num.value) || 0, helperCastle, defCastle, onComplete);
        };
        const cancelBtn = this.quantityModal.querySelector('.btn-secondary');
        if (cancelBtn) { 
            cancelBtn.onclick = () => { 
                this.quantityModal.classList.add('hidden'); 
                // ★ 変更：キャンセルした時にマップ選択に戻ります
                if (backToMap) backToMap();
                else onComplete(); 
            }; 
        }
    }

    showDefSelfReinforcementSelector(candidateCastles, defCastle, onComplete) {
        this.forceResetModals();
        this.game.tempReinfData = {
            candidates: candidateCastles, // ★ これを追加！
            defCastle, onComplete,
            onCancel: () => onComplete(null)
        };
        this.game.selectionMode = 'def_self_reinforcement';
        this.game.validTargets = candidateCastles.map(c => c.id);
        this.renderMap();
        this.log("援軍を出陣させる城を選択してください。");
        this.renderSelectionModeMenu(); // ★これを追加してメニューを「戻る」だけにします！
    }
    
    showSettingsModal() {
        this.info.showSettingsModal();
    }

    // ==========================================
    // ★追加：部隊が消滅した時に、上からからっぽのカードをフェードインさせる魔法
    // ==========================================
    applyEmptyCardAnimation(card) {
        if (!card) return;
        // 既にアニメーション中なら何もしない
        if (card.querySelector('.empty-cover-overlay')) return;

        // 魔法の幕（グラデーションのカバー）を作ってカードに被せます
        const overlay = document.createElement('div');
        overlay.className = 'empty-cover-overlay';
        card.appendChild(overlay);

        // ほんの少し待ってから、フワッと表示（フェードイン）させます
        requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                overlay.classList.add('show-overlay');
            });
        });

        // 1秒後（フェードインが完全に終わった後）に、中身を透明にして幕を取り外します
        setTimeout(() => {
            card.style.background = 'linear-gradient(to top right, #eeeeee, #777777)';
            
            const titleEl = card.querySelector('.responsive-army-title');
            const bushoEl = card.querySelector('.reinf-busho-label');
            const wrapEl = card.querySelector('.reinf-content-wrap');
            
            if (titleEl) titleEl.style.visibility = 'hidden';
            if (bushoEl) bushoEl.style.visibility = 'hidden';
            if (wrapEl) wrapEl.style.visibility = 'hidden';

            const orgEl = card.querySelector('[id$="-org"]');
            const soldierEl = card.querySelector('[id$="-soldier"]');
            const riceEl = card.querySelector('[id$="-rice"]');
            const moraleEl = card.querySelector('[id$="-morale"]');
            const trainingEl = card.querySelector('[id$="-training"]');
            if (orgEl) orgEl.textContent = '';
            if (bushoEl) bushoEl.textContent = '';
            if (soldierEl) soldierEl.textContent = '';
            if (riceEl) riceEl.textContent = '';
            if (moraleEl) moraleEl.textContent = '';
            if (trainingEl) trainingEl.textContent = '';
            
            // 幕はもう不要なので消します
            if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
        }, 1000);
    }
    
    // AIの思考中メッセージを戦闘用メッセージ枠に表示する
    showWarThinkingMessage(armyName) {
        if (!this.warControls) return;
        this.warControls.innerHTML = '';
        
        const isPc = document.body.classList.contains('is-pc');
        const msgFontSize = isPc ? '' : 'font-size: 60%; line-height: 1.4;';

        const msgContainer = document.createElement('div');
        msgContainer.className = 'war-action-message-container';
        msgContainer.style.cssText = 'text-align: left; position: relative; display: block; padding: 15px; box-sizing: border-box; height: 100%;';
        
        const textContainer = document.createElement('div');
        textContainer.className = 'war-action-message-text';
        textContainer.style.cssText = `text-align: left; width: 100%; display: block; ${msgFontSize}`;
        textContainer.innerHTML = `<span style="color: #eee;">${armyName} が作戦を思案中...</span>`;
        
        msgContainer.onclick = (e) => {
            e.stopPropagation();
            e.preventDefault();
        };

        msgContainer.appendChild(textContainer);
        this.warControls.appendChild(msgContainer);
    }
}
