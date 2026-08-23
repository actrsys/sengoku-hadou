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
        this.globalLoadingScreen = document.getElementById('global-loading-screen');
        this.loadingStatus = document.getElementById('loading-status');
        this.loadingProgressBar = document.getElementById('loading-progress-bar');
        this.loadingProgressText = document.getElementById('loading-progress-text');
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
        
        // 情報表示の専門家（さっき作った新しい箱）を準備しておきます
        this.info = new UIInfoManager(this, this.game);
        // ★追加：スライダーの専門家を準備しておきます
        this.slider = new UISliderManager(this, this.game);
        // セーブ／ロードのスロット選択画面は専用Viewへ委譲します。
        this.saveLoadView = new SaveLoadView(this, this.game);
        // 国主評定の表示・一時編集は専用Viewへ委譲します。
        this.legionCouncilView = new LegionCouncilView(this, this.game);
        
        this.warModal = document.getElementById('war-modal');
        this.warLog = document.getElementById('war-log');
        this.warControls = document.getElementById('war-controls');

        this.daimyoConfirmModal = document.getElementById('daimyo-confirm-modal');
        this.daimyoConfirmBody = document.getElementById('daimyo-confirm-body');

        this.unitDivideModal = document.getElementById('unit-divide-modal');

        this.bushoDetailModal = document.getElementById('busho-detail-modal');
        this.bushoDetailBody = document.getElementById('busho-detail-body');

        this.onResultModalClose = null;

        // イベント中のメッセージ送りだけは、外側を押して進められるように残します
        const dialogModal = document.getElementById('dialog-modal');
        if (dialogModal) {
            dialogModal.addEventListener('click', (e) => {
                // ウインドウの外側（黒い背景）を押したか確認します
                if (e.target === dialogModal) {
                    // ★ここが重要です：イベント中かどうかを判定して、イベントの時だけ動かします
                    if (dialogModal.classList.contains('event-dialog-modal')) {
                        const cancelBtn = document.getElementById('dialog-btn-cancel');
                        // 選択肢がない単なるメッセージの時だけ進めます
                        if (!cancelBtn || cancelBtn.classList.contains('hidden')) {
                            const okBtn = document.getElementById('dialog-btn-ok');
                            if (okBtn) {
                                // イベント中の選択音を鳴らします
                                if (window.AudioManager) {
                                    window.AudioManager.playSE('choice.ogg');
                                }
                                okBtn.click();
                            }
                        }
                    }
                    // イベント以外（普通のメッセージ等）の場合は何もしません＝ボタンを押すまで閉じません
                }
            });
        }
        
        if (this.mapZoomInBtn) {
            this.mapZoomInBtn.onclick = (e) => { e.stopPropagation(); this.changeMapZoom(1); };
        }
        if (this.mapZoomOutBtn) {
            this.mapZoomOutBtn.onclick = (e) => { e.stopPropagation(); this.changeMapZoom(-1); };
        }

        this.initMapDrag();
        this.initContextMenu();
        this.initSidebarResize(); 
        // ★スマホ安全対策：ブラウザ標準のダブルタップ拡大を確実に止めます。
        // 近い位置を短時間で2回触った時だけ止めるので、別々のボタンを素早く押す操作は妨げません。
        let lastTouchEnd = 0;
        let lastTouchX = 0;
        let lastTouchY = 0;
        document.addEventListener('touchend', (event) => {
            const now = Date.now();
            const touch = event.changedTouches && event.changedTouches[0];
            const x = touch ? touch.clientX : 0;
            const y = touch ? touch.clientY : 0;
            const dx = x - lastTouchX;
            const dy = y - lastTouchY;
            const isNearPreviousTap = (dx * dx + dy * dy) <= (40 * 40);

            if (now - lastTouchEnd <= 320 && isNearPreviousTap && event.cancelable) {
                event.preventDefault();
            }

            lastTouchEnd = now;
            lastTouchX = x;
            lastTouchY = y;

            if (event.target && typeof event.target.blur === 'function') {
                setTimeout(() => {
                    event.target.blur();
                }, 50);
            }
        }, { passive: false });

        // ★iOS Safari系のブラウザ標準ピンチ拡大を停止。
        // マップの2本指ズームはui_map.jsのtouchイベントで独自処理するため、その機能は残ります。
        ['gesturestart', 'gesturechange', 'gestureend'].forEach(type => {
            document.addEventListener(type, (event) => {
                if (event.cancelable) event.preventDefault();
            }, { passive: false });
        });

        document.addEventListener('touchmove', (e) => {
            if (e.touches.length > 1 && e.cancelable) {
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

                // タイトルでは必要最小限だけを準備します。
                // 巨大な地図画像を何枚も同時decodeすると古いスマホの瞬間メモリが跳ねるため、
                // 国色・城色・イベント用白地図は実際に必要な段階まで読み込みません。
                // タイトル段階は城アイコンだけを先読みします。
                // SEの canplaythrough 待ちは古いWebViewで止まりやすいため行わず、音は必要時にAudioManagerへ任せます。
                this.updateLoadingProgress(10, '基本データを準備しています');
                await new Promise(res => {
                    const img = new Image();
                    img.onload = img.onerror = res;
                    img.decoding = 'async';
                    img.src = './data/images/map/shiro_icon001.png';
                });
                this.updateLoadingProgress(85, '基本データを準備しています');
                await this.waitForNextPaint();

                // セーブデータがあるかチェックしてボタンを制御します
                this.updateLoadingProgress(90, 'セーブデータを確認しています');
                await this.checkSaveDataForTitle();
                this.updateLoadingProgress(100, '準備完了');
                await this.waitForNextPaint();

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
                    
                    setTimeout(() => {
                        hasListDragged = false;
                    }, 100);
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
        // ★Round12：会話顔は直近だけを小さく先読みし、登場人物が多いイベントでも次行待ちを減らします。
        this._dialogFacePreloadCache = new Map();
        this._dialogFacePreloadCacheLimit = 4;
        this._dialogGuardHeld = false;

        document.addEventListener('click', (e) => {
            const btn = e.target.closest('button');
            if (!btn) return; 

            // 合戦のコマンドボタンは個別に音を鳴らすので、共通の音をキャンセルします！
            if (btn.closest('#war-controls')) return;
            
            // タブ切り替えボタンも個別に音を鳴らすので、共通の音をキャンセルします！
            if (btn.classList.contains('busho-tab-btn') || btn.classList.contains('busho-scope-btn')) return;

            // 兵科ボタンは個別に音を鳴らすのでキャンセルします！
            if (btn.classList.contains('troop-type-btn')) return;

            // イベントダイアログ内の隠しボタンによる決定音を防ぐため、共通の音をキャンセルします！
            if (btn.closest('.event-dialog-modal')) return;

            // ボタン側が data-se で明示した場合は、文言に依存せずそのSEへ統一します。
            // 動的UIでも「許可/禁止」のような対になる選択音を同じ音へ揃えられます。
            const explicitSe = btn.dataset ? btn.dataset.se : '';
            if (explicitSe) {
                if (window.AudioManager) window.AudioManager.playSE(explicitSe);
                return;
            }

            const text = btn.textContent.trim();
            
            // 個別に音を鳴らす設定をしたボタンは、共通の「decision.ogg」をキャンセルします
            if (["一括", "直轄", "委任", "不可", "許可"].includes(text)) return;

            if (window.AudioManager) {
                if (text === "処断する") {
                    window.AudioManager.playSE('zangeki001.ogg');
                } else if (["戻る", "閉じる", "いいえ", "やめる", "撤退", "解放", "処断", "シナリオ選択に戻る"].includes(text)) {
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
                const sc = document.getElementById('map-scroll-container');
                if (!sc) return;

                // サイズ変更が始まった瞬間に、今の中心の場所を箱にしまいます
                if (savedLogicalX === null && savedLogicalY === null) {
                    const currentLeft = parseFloat(this.mapEl.style.left || 0);
                    const currentTop = parseFloat(this.mapEl.style.top || 0);
                    savedLogicalX = (sc.scrollLeft + sc.clientWidth / 2 - currentLeft) / this.mapScale;
                    savedLogicalY = (sc.scrollTop + sc.clientHeight / 2 - currentTop) / this.mapScale;
                }

                if (resizeTimer) clearTimeout(resizeTimer);
                
                resizeTimer = setTimeout(() => {
                    this.fitMapToScreen();
                    
                    const newLeft = parseFloat(this.mapEl.style.left || 0);
                    const newTop = parseFloat(this.mapEl.style.top || 0);
                    
                    // 最初に覚えておいた場所を中心にするようにスクロールします
                    if (savedLogicalX !== null && savedLogicalY !== null) {
                        sc.scrollLeft = (savedLogicalX * this.mapScale + newLeft) - sc.clientWidth / 2;
                        sc.scrollTop = (savedLogicalY * this.mapScale + newTop) - sc.clientHeight / 2;
                    }
                    
                    // 次のサイズ変更のために、覚えた場所を綺麗に空っぽにしておきます
                    savedLogicalX = null;
                    savedLogicalY = null;
                }, 200); 
            }
        });
        
        // ★ここから追加：ウィンドウ付属のボタンを外に出す改修
        const modals = document.querySelectorAll('.modal');
        modals.forEach(modal => {
            const content = modal.querySelector('.modal-content');
            const footer = modal.querySelector('.modal-footer');
            if (content && footer && !footer.classList.contains('modal-footer-inside')) {
                // 標準モーダルはフッターを外へ出す。専用全画面などはHTML側の汎用指定で内部保持できる。
                modal.appendChild(footer);
            }
        });
    }

    _getCompressedTextHtml(text, threshold, isStrong = false) {
        if (!text) return "";
        if (text.length < threshold) return text;
        const step = isStrong ? 0.15 : 0.1;
        const minScale = isStrong ? 0.55 : 0.65;
        let scale = 1.0 - (text.length - (threshold - 1)) * step;
        if (scale < minScale) scale = minScale;
        return `<span class="compressed-list-text ui-compressed-text" style="--text-scale:${scale}; --text-unscale:${1 / scale};">${text}</span>`;
    }

    // ==========================================
    // ★ここから追加：背景の更新をストップして超軽量化する魔法！
    // ==========================================
    pauseBackgroundUpdates() {
        this.isBackgroundPaused = true;
        document.body.classList.add('background-paused');
        if (typeof this.releaseMobileTransientMapResources === 'function') {
            this.releaseMobileTransientMapResources();
        }
        
        // もし情報パネルのマーク切り替えタイマーが動いていたら、無駄なので止めます
        if (this._statusCarouselTimer) {
            clearInterval(this._statusCarouselTimer);
            this._statusCarouselTimer = null;
        }
    }

    resumeBackgroundUpdates(diagnosticPrefix = '') {
        const mark = (stage) => {
            if (!diagnosticPrefix || !this.game || this.game.phase === 'title' || typeof this.game.writeSystemDiagnostic !== 'function') return;
            this.game.writeSystemDiagnostic(`${diagnosticPrefix}:${stage}`);
        };

        this.isBackgroundPaused = false;
        document.body.classList.remove('background-paused');
        mark('recover_map_start');
        if (typeof this.recoverMobileMapResources === 'function') {
            this.recoverMobileMapResources();
        }
        mark('recover_map_done');
        
        // まだゲームが始まっていない時（タイトル画面など）はここで終わります
        if (!this.game || this.game.phase === 'title') return;

        // 止めていた間に「お城の兵士数」や「勢力の色」が変わったかもしれないので、
        // 再開のタイミングで一気に最新の状態に書き換えます。
        const activeCastle = this.currentCastle || (this.game ? this.game.getCurrentTurnCastle() : null);
        mark('info_start');
        if (activeCastle) {
            this.updateInfoPanel(activeCastle);
        }
        mark('info_done');
        if (typeof this.updateCastleGlows === 'function') {
            mark('castle_glows_start');
            this.updateCastleGlows();
            mark('castle_glows_done');
        }
        if (typeof this.updateClanColors === 'function') {
            mark('clan_colors_start');
            this.updateClanColors();
            mark('clan_colors_done');
        }
        if (typeof this.updateSnowOverlay === 'function') {
            mark('snow_start');
            this.updateSnowOverlay();
            mark('snow_done');
        }
        if (typeof this.updateKeepHighlight === 'function') {
            mark('keep_highlight_start');
            this.updateKeepHighlight();
            mark('keep_highlight_done');
        }
    }
    // ==========================================

    hideAIGuardTemporarily() {
        const aiGuard = document.getElementById('ai-guard');
        // ★変更：壁そのものを消すのではなく、文字だけを透明にして壁を残します！
        if (aiGuard && !aiGuard.classList.contains('hidden') && aiGuard.style.opacity !== '0') {
            aiGuard.style.opacity = '0';
            this.guardHiddenCount = (this.guardHiddenCount || 0) + 1;
        } else if (this.guardHiddenCount > 0) {
            this.guardHiddenCount++; 
        }
    }
    
    // ==========================================
    // Round24：AI進捗表示の状態を正規化します。
    // 戦争・援軍・迎撃などで一時非表示カウンタが複数段積まれ、restoreが1回だけだと
    // opacity:0 が残ることがありました。AI進捗を更新する瞬間を「表示状態の最終権威」にします。
    _hasAIProgressBlockingUI() {
        if (!this.game) return false;
        if (this.game.selectionMode != null) return true;
        const visible = (id) => {
            const el = document.getElementById(id);
            return !!(el && !el.classList.contains('hidden'));
        };
        return visible('dialog-modal') ||
            visible('result-modal') ||
            visible('intercept-confirm-modal') ||
            visible('unit-divide-modal') ||
            visible('prisoner-modal') ||
            visible('selector-modal') ||
            visible('quantity-modal') ||
            visible('war-modal') ||
            visible('cutin-overlay');
    }

    normalizeAIProgressGuard() {
        const guard = this.aiGuard || document.getElementById('ai-guard');
        if (!guard || !this.game || !this.game.isProcessingAI || this._hasAIProgressBlockingUI()) return false;

        // ここは新しいAI拠点へ進む／MAX表示する安定地点なので、過去の一時非表示を持ち越しません。
        this.guardHiddenCount = 0;
        this.guardTextHiddenCount = 0;
        guard.style.opacity = '1';
        guard.style.display = '';
        guard.classList.remove('hidden');
        guard.classList.remove('hide-text');
        return true;
    }

    // AI思考中に進捗を表示する魔法です！
    updateAIProgress(current, total) {
        if (!this.aiGuard) return;

        // Round24：数字だけ更新されてガードが透明のまま、という状態を自己修復します。
        this.normalizeAIProgressGuard();

        // ★軽量化：AIの城ターンごとに innerHTML を丸ごと作り直さず、数字だけ更新します。
        let currentEl = this.aiGuard.querySelector('[data-ai-progress-current]');
        let totalEl = this.aiGuard.querySelector('[data-ai-progress-total]');
        if (!currentEl || !totalEl) {
            this.aiGuard.innerHTML = `<div class="loading-spinner"></div><div>思考中... (<span data-ai-progress-current class="ai-progress-number is-current"></span> / <span data-ai-progress-total class="ai-progress-number is-total"></span>)</div>`;
            currentEl = this.aiGuard.querySelector('[data-ai-progress-current]');
            totalEl = this.aiGuard.querySelector('[data-ai-progress-total]');
        }
        const currentText = String(current);
        const totalText = String(total);
        if (currentEl && currentEl.textContent !== currentText) currentEl.textContent = currentText;
        if (totalEl && totalEl.textContent !== totalText) totalEl.textContent = totalText;
    }

    async waitForDialogs() {
        const isVisible = (id) => {
            const el = document.getElementById(id);
            return el && !el.classList.contains('hidden');
        };

        let didWait = false; 

        // チェックする条件をひとまとめにします
        const checkActive = () => {
            return (this.dialogQueue && this.dialogQueue.length > 0) ||
            isVisible('dialog-modal') ||
            isVisible('result-modal') ||
            isVisible('intercept-confirm-modal') ||
            isVisible('unit-divide-modal') ||
            isVisible('prisoner-modal') ||
            isVisible('selector-modal') || 
            isVisible('quantity-modal') || 
            isVisible('war-modal') ||      // 戦争画面が開いている間も待ちます！
            isVisible('cutin-overlay') ||  // 月替わりのカットイン表示中も絶対に待ちます！
            this.game.selectionMode != null;
        };

        while (checkActive()) {
            didWait = true; 
            await new Promise(resolve => setTimeout(resolve, 200));
            
            // ダイアログが消えたと思っても、次のダイアログが出るまでの隙間（プログラムの準備時間）を考慮して、念のため少し待ってからもう一度確認します！
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
            if (this.guardHiddenCount === 0) {
                const aiGuard = document.getElementById('ai-guard');
                if (aiGuard) {
                    // ★修正：プレイヤーのターン中など、すぐに表示しない場合でも透明化の魔法だけは確実に解いておきます！
                    aiGuard.style.opacity = '1';
                    
                    if (typeof this.applyAIGuardTextState === 'function') this.applyAIGuardTextState();
                    if (this.game && this.game.isProcessingAI) {
                        // マップで援軍の城を選んでいる最中は、絶対に膜を復活させない魔法！
                        if (!this.game.selectionMode) {
                            aiGuard.classList.remove('hidden');
                        }
                    }
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

    // ★Round12：会話用の顔画像を、DOMへ出す前に読み込み・デコードしておきます。
    // 同じ顔を短時間に何度も使う場合は、小さな先読みキャッシュを共有します。
    _getDialogFaceTemplatePromise(faceIcon) {
        if (!faceIcon || typeof Image === 'undefined') return Promise.resolve(null);
        if (!this._dialogFacePreloadCache) this._dialogFacePreloadCache = new Map();

        if (this._dialogFacePreloadCache.has(faceIcon)) {
            const hit = this._dialogFacePreloadCache.get(faceIcon);
            // Mapの末尾へ移し、直近使用順にします。
            this._dialogFacePreloadCache.delete(faceIcon);
            this._dialogFacePreloadCache.set(faceIcon, hit);
            return hit;
        }

        const loadOne = async (src) => {
            const img = new Image();
            img.alt = '';
            img.draggable = false;
            img.loading = 'eager';
            img.decoding = 'async';
            img.width = 85;
            img.height = 85;
            img.src = src;

            const waitLoad = () => new Promise(resolve => {
                if (img.complete) {
                    resolve(img.naturalWidth > 0);
                    return;
                }
                let settled = false;
                const done = (ok) => {
                    if (settled) return;
                    settled = true;
                    clearTimeout(timer);
                    img.onload = null;
                    img.onerror = null;
                    resolve(ok);
                };
                const timer = setTimeout(() => done(false), 1500);
                img.onload = () => done(img.naturalWidth > 0);
                img.onerror = () => done(false);
            });

            try {
                if (typeof img.decode === 'function') {
                    await img.decode();
                    if (img.naturalWidth > 0) return img;
                }
            } catch (e) {
                // decode() が失敗した場合も通常のload完了を確認します。
            }
            return (await waitLoad()) ? img : null;
        };

        const promise = (async () => {
            let img = await loadOne(`data/images/faceicons/${faceIcon}`);
            if (!img && faceIcon !== 'unknown_face.webp') {
                img = await loadOne('data/images/faceicons/unknown_face.webp');
            }
            return img;
        })();

        this._dialogFacePreloadCache.set(faceIcon, promise);
        const limit = Math.max(2, this._dialogFacePreloadCacheLimit || 4);
        while (this._dialogFacePreloadCache.size > limit) {
            const oldestKey = this._dialogFacePreloadCache.keys().next().value;
            this._dialogFacePreloadCache.delete(oldestKey);
        }
        return promise;
    }

    preloadDialogFace(faceIcon) {
        if (!faceIcon) return;
        // 先読みは待たずに開始だけします。失敗は実表示時のフォールバックに任せます。
        this._getDialogFaceTemplatePromise(faceIcon).catch(() => null);
    }

    async _prepareDialogFaceImage(faceIcon) {
        if (!faceIcon || typeof Image === 'undefined') return null;
        const template = await this._getDialogFaceTemplatePromise(faceIcon);
        if (!template) return null;

        // 同じImage要素そのものを使い回すとDOM間を移動してしまうので、表示用は複製します。
        const img = template.cloneNode(false);
        img.alt = '';
        img.draggable = false;
        img.loading = 'eager';
        img.decoding = 'async';
        img.width = 85;
        img.height = 85;

        // 先読み済みリソースなので通常は即時完了。念のため表示前decodeを保証します。
        try {
            if (typeof img.decode === 'function') await img.decode();
        } catch (e) {
            // clone側のdecodeが使えない古いWebViewでは、既に読み込み済みのsrcをそのまま使用します。
        }
        return img;
    }

    _prepareDialogFaces(customOpts) {
        const leftFace = customOpts?.leftFace || null;
        const rightFace = customOpts?.rightFace || null;
        return Promise.all([
            this._prepareDialogFaceImage(leftFace),
            this._prepareDialogFaceImage(rightFace)
        ]).then(([leftImg, rightImg]) => ({ leftImg, rightImg }));
    }

    // ★Round19：イベント会話の継ぎ目で暗幕や会話枠が一瞬消えないよう、
    // 「次のダイアログが来るかもしれない短い猶予」を管理します。
    _cancelDialogHandoffClose() {
        if (this._dialogHandoffTimer) {
            clearTimeout(this._dialogHandoffTimer);
            this._dialogHandoffTimer = null;
        }
        this._dialogHandoffPending = false;
    }

    _scheduleDialogHandoffClose(closeFn, graceMs = 180) {
        this._cancelDialogHandoffClose();
        const token = (this._dialogHandoffToken || 0) + 1;
        this._dialogHandoffToken = token;
        this._dialogHandoffPending = true;

        // 画面は残したまま「現在のダイアログ処理」は完了扱いにします。
        // この猶予中に showDialog/showDialogAsync が来れば、古い画面を隠さず次へ引き継げます。
        this.isDialogShowing = false;

        this._dialogHandoffTimer = setTimeout(() => {
            if (!this._dialogHandoffPending || token !== this._dialogHandoffToken) return;
            this._dialogHandoffTimer = null;
            this._dialogHandoffPending = false;
            closeFn();
        }, Math.max(0, graceMs));
    }

    showDialogAsync(msg, isConfirm = false, autoCloseTime = 0, customOpts = null) {
        // ★追加：確認ダイアログ（はい/いいえ等）や、複数の選択肢があるかをチェックします
        const hasChoices = isConfirm || (customOpts && customOpts.choices && customOpts.choices.length > 0);
        
        // ★変更：観戦モード中でも、選択肢がない時だけ自動で閉じるようにします
        if (this.game && this.game.isWatchMode && autoCloseTime === 0 && !hasChoices) {
            autoCloseTime = 1000;
        }
        const faceLoadPromise = this._prepareDialogFaces(customOpts);
        return new Promise(resolve => {
            this.dialogQueue.push({ msg, isConfirm, onOk: resolve, onCancel: resolve, autoCloseTime, customOpts, faceLoadPromise });
            if (!this.isDialogShowing || this._dialogHandoffPending) {
                this._cancelDialogHandoffClose();
                this.processDialogQueue();
            }
        });
    }

    showDialog(msg, isConfirm, onOk, onCancel = null, customOpts = null) {
        let autoCloseTime = 0;
        // ★追加：確認ダイアログ（はい/いいえ等）や、複数の選択肢があるかをチェックします
        const hasChoices = isConfirm || (customOpts && customOpts.choices && customOpts.choices.length > 0);
        
        // ★変更：観戦モード中でも、選択肢がない時だけ自動で閉じるようにします
        if (this.game && this.game.isWatchMode && !hasChoices) {
            autoCloseTime = 1000;
        }
        const faceLoadPromise = this._prepareDialogFaces(customOpts);
        this.dialogQueue.push({ msg, isConfirm, onOk, onCancel, autoCloseTime: autoCloseTime, customOpts, faceLoadPromise });
        if (!this.isDialogShowing || this._dialogHandoffPending) {
            this._cancelDialogHandoffClose();
            this.processDialogQueue();
        }
    }
    
    async processDialogQueue() {
        // ★Round19：猶予中に次のダイアログが来た場合、旧画面を隠す予定だけ取り消します。
        if (this._dialogHandoffPending) this._cancelDialogHandoffClose();
        if (this.dialogQueue.length === 0) {
            this.isDialogShowing = false;
            return;
        }

        this.isDialogShowing = true;
        const dialog = this.dialogQueue.shift();
        
        const modal = document.getElementById('dialog-modal');

        const msgEl = document.getElementById('dialog-message');
        const leftFaceEl = document.getElementById('dialog-left-face');
        const leftNameEl = document.getElementById('dialog-left-name');
        const rightFaceEl = document.getElementById('dialog-right-face');
        const rightNameEl = document.getElementById('dialog-right-name');
        
        // ★修正：okBtnが消えてしまっていてもエラーにならないように安全に探します！
        let okBtn = document.getElementById('dialog-btn-ok');
        let cancelBtn = document.getElementById('dialog-btn-cancel');

        // ★Round12：連続会話中はAIガードの一時非表示カウントを積み増さず、シーケンス全体で1回だけ保持します。
        if (!this._dialogGuardHeld) {
            this.hideAIGuardTemporarily();
            this._dialogGuardHeld = true;
        }

        if (!modal) {
            if (dialog.isConfirm) {
                if (confirm(dialog.msg)) { if (dialog.onOk) dialog.onOk(); } else { if (dialog.onCancel) dialog.onCancel(); }
            } else {
                alert(dialog.msg);
                if (dialog.onOk) dialog.onOk();
            }
            if (this._dialogGuardHeld) {
                this.restoreAIGuard();
                this._dialogGuardHeld = false;
            }
            this.processDialogQueue(); 
            return;
        }

        // ★Round 11：次の顔画像のデコードが終わるまでは、現在表示中のメッセージと顔をそのまま維持します。
        // 先に文章だけ切り替えると「次の台詞＋前の顔」が一瞬見えるため、文章も顔と同じタイミングで更新します。

        // スマホ版の場合は強制的に左側に寄せて、右側を空にする処理
        let leftFace = dialog.customOpts?.leftFace;
        let leftName = dialog.customOpts?.leftName;
        let rightFace = dialog.customOpts?.rightFace;
        let rightName = dialog.customOpts?.rightName;

        let movedRightFaceToLeft = false;
        if (!document.body.classList.contains('is-pc')) {
            // 右側にしか設定されていない場合は左側に移動します
            if (rightFace && !leftFace) {
                leftFace = rightFace;
                leftName = rightName;
                movedRightFaceToLeft = true;
            }
            // 右側は常にクリアして空っぽにします
            rightFace = null;
            rightName = null;
        }
        
        // ★Round 9：次の顔画像は、完全に読み込み・デコードしてから1回でDOMへ差し替えます。
        // ダイアログをキューに入れた時点から先読みしているので、通常はここで待たされません。
        let preparedFaces = { leftImg: null, rightImg: null };
        try {
            preparedFaces = dialog.faceLoadPromise ? await dialog.faceLoadPromise : await this._prepareDialogFaces(dialog.customOpts);
        } catch (e) {
            console.warn('会話用顔画像の事前デコードに失敗しました:', e);
        }
        if (movedRightFaceToLeft) {
            preparedFaces.leftImg = preparedFaces.rightImg;
            preparedFaces.rightImg = null;
        }

        // ★Round12：ここまでは現在表示中の会話画面に一切触れません。
        // 次の顔が準備できた後で初めて前回の配置を掃除し、同じ処理単位で次の内容へ切り替えます。
        if (modal) {
            modal.style.display = '';
            modal.style.flexDirection = '';
            modal.style.justifyContent = '';
            const resetFooter = modal.querySelector('.modal-footer');
            if (resetFooter) {
                resetFooter.style.position = '';
                resetFooter.style.top = '';
                resetFooter.style.bottom = '';
                resetFooter.style.left = '';
                resetFooter.style.transform = '';
                resetFooter.style.zIndex = '';
                resetFooter.style.width = '';
                resetFooter.style.maxWidth = '';
                resetFooter.style.padding = '';
                resetFooter.style.margin = '';
                resetFooter.style.justifyContent = '';
                resetFooter.style.pointerEvents = '';
                resetFooter.style.order = '';
                resetFooter.style.removeProperty('margin-top');
                resetFooter.style.removeProperty('margin-bottom');
            }
            const resetContent = modal.querySelector('.modal-content');
            if (resetContent) resetContent.style.removeProperty('margin-top');
        }

        const setFaceAndName = (faceEl, nameEl, faceIcon, nameText, preparedImg) => {
            let hasContent = false;
            if (faceEl) {
                if (faceIcon && preparedImg) {
                    const wrapper = document.createElement('div');
                    wrapper.className = 'sp-face-wrapper dialog-face-wrapper';
                    preparedImg.className = 'dialog-face-img';
                    wrapper.appendChild(preparedImg);
                    // ★Round 11：空にしてから append する2段階更新をやめ、1回のDOM更新で旧顔→新顔へ交換します。
                    faceEl.replaceChildren(wrapper);
                    hasContent = true;
                } else {
                    faceEl.replaceChildren();
                }
            }
            if (nameEl) {
                if (nameText) {
                    nameEl.textContent = nameText;
                    nameEl.classList.remove('hidden');
                    hasContent = true;
                } else {
                    nameEl.classList.add('hidden');
                }
            }
            
            // どちらか一方しかいない場合は、いない方のスペースを消して詰め、メッセージを広くします
            if (faceEl && faceEl.parentElement) {
                faceEl.parentElement.style.display = hasContent ? 'flex' : 'none';
            }
        };

        // ★Round 11：次の画像が準備できた同じ処理単位の中で、文章と顔をまとめて更新します。
        // これにより「次の台詞＋前の顔」や、顔だけ空になるフレームを作りません。
        msgEl.innerHTML = dialog.msg.replace(/\n/g, '<br>');
        setFaceAndName(leftFaceEl, leftNameEl, leftFace, leftName, preparedFaces.leftImg);
        setFaceAndName(rightFaceEl, rightNameEl, rightFace, rightName, preparedFaces.rightImg);
        
        let autoCloseTimer = null;

        const cleanupAndNext = (callback) => {
            if (autoCloseTimer) clearTimeout(autoCloseTimer);

            // ★Round19：選択肢の有無に関係なく、次の会話が来る可能性がある間は
            // 暗幕・会話枠・現在の本文/顔を維持します。
            // 以前は選択肢だけ即 closeCompletely() していたため、分岐のたびに高確率で1フレーム以上の隙間が発生していました。
            const hasQueuedChoices = dialog.isConfirm || !!(dialog.customOpts && dialog.customOpts.choices && dialog.customOpts.choices.length > 0);

            // 連打防止。見た目の配置は変えず、入力だけ止めます。
            const currentFooter = modal.querySelector('.modal-footer');
            if (currentFooter) currentFooter.style.pointerEvents = 'none';
            modal.removeEventListener('click', this._currentEventClickHandler);
            modal.style.cursor = '';
            const currentContent = modal.querySelector('.modal-content');
            if (currentContent) {
                currentContent.removeEventListener('click', this._currentEventClickHandler);
                currentContent.style.cursor = '';
            }

            const closeCompletely = () => {
                modal.classList.add('hidden');
                if (leftFaceEl) leftFaceEl.replaceChildren();
                if (rightFaceEl) rightFaceEl.replaceChildren();
                if (this._dialogGuardHeld) {
                    this.restoreAIGuard();
                    this._dialogGuardHeld = false;
                }
                this.isDialogShowing = false;
            };

            const continueOrClose = () => {
                if (this.dialogQueue.length > 0) {
                    // 次の画像の decode 中も今の会話画面を保持し、準備完了時に中身だけ交換します。
                    this.isDialogShowing = true;
                    this.processDialogQueue();
                    return;
                }

                // 次の会話がまだ積まれていなくても、分岐処理や setTimeout(0) 等を1つ挟むだけで
                // すぐ次が来るケースがあります。イベント/会話は少し長め、通常UIは短めに待ちます。
                const isConversationLike = isBottomMessage || hasQueuedChoices;
                const graceMs = isConversationLike ? 220 : 80;
                this._scheduleDialogHandoffClose(closeCompletely, graceMs);
            };

            // ★追加：ダイアログを進めた時に、鳴っているSEを0.1秒でスッと消す魔法です！
            if (window.AudioManager && typeof window.AudioManager.fadeOutSe === 'function') {
                window.AudioManager.fadeOutSe(0.1);
            }

            const scheduleHandoff = () => {
                // showDialogAsync の resolve() で再開する async/await の継続処理を先に走らせ、
                // 次の会話がキューへ積まれた後で「維持して続行／完全に閉じる」を判定します。
                if (typeof queueMicrotask === 'function') {
                    queueMicrotask(continueOrClose);
                } else {
                    Promise.resolve().then(continueOrClose);
                }
            };

            try {
                if (callback) {
                    const result = callback();
                    // ★Round17：コールバックが async でも、その Promise の完了を待ってから
                    // ダイアログを handoff してはいけません。
                    // コールバック内で showDialogAsync() を await すると、
                    // 「現在のダイアログは callback 完了待ち / 次のダイアログは現在の終了待ち」
                    // という相互待ち（デッドロック）になります。
                    // Promise はエラー監視だけ行い、画面の handoff 自体は即座に予約します。
                    if (result && typeof result.then === 'function') {
                        result.catch(e => console.error(e));
                    }
                }
            } catch (e) {
                console.error("ダイアログの処理中にエラー:", e);
            }

            scheduleHandoff();
        };
        
        // ★修正：okBtnが見つからなくても、安全にフッター（ボタンの置き場）を見つける魔法です！
        let footer = null;
        if (okBtn) {
            footer = okBtn.parentElement;
        } else {
            footer = modal.querySelector('.modal-footer');
        }

        const modalContent = modal.querySelector('.modal-content');
        if (modalContent) {
            modalContent.style.position = ''; // ★この1行をお掃除部分に追加
        }
        // ★追加：前回のイベント設定が残っていたら、画面全体と枠内の両方から綺麗に消しておきます
        modal.removeEventListener('click', this._currentEventClickHandler);
        modal.style.cursor = '';
        if (modalContent) {
            modalContent.removeEventListener('click', this._currentEventClickHandler);
            modalContent.style.cursor = '';
        }

        // --- 根本改修：フッターのボタンを動的に生成し、何個でも並べられるようにします ---
        if (footer) footer.innerHTML = ''; 

        // イベントモード専用のクリック操作
        this._currentEventClickHandler = (e) => {
            if (e.target.closest('button')) return;
            // ★変更：外側（黒背景）をクリックした時も進めるように、ガードを削除しました！
            e.stopPropagation();
            if (window.AudioManager) window.AudioManager.playSE('choice.ogg');
            
            // 一度進めたら、連続で押されないようにクリック機能を外しておきます
            modal.removeEventListener('click', this._currentEventClickHandler);
            modal.style.cursor = '';
            if (modalContent) {
                modalContent.removeEventListener('click', this._currentEventClickHandler);
                modalContent.style.cursor = '';
            }
            
            // 擬似的に「決定」の動作をさせます（引数なしのonOkを呼び出します）
            cleanupAndNext(dialog.onOk);
        };

        const isEventMode = dialog.customOpts && dialog.customOpts.isEvent;
        // ★追加：顔画像や名前が設定されていて、誰かが喋っているかどうかの判定
        const isSpeaking = !!(leftFace || leftName || rightFace || rightName);
        
        // ★修正の取り消し：やっぱり面談画面もメッセージは下側に配置します！
        const isBottomMessage = isEventMode || isSpeaking;
        
        const hasCustomChoices = dialog.customOpts && dialog.customOpts.choices && dialog.customOpts.choices.length > 0;
        // はい/いいえ等の確認ダイアログも含めて選択肢があるかどうかの判定
        const hasChoices = hasCustomChoices || dialog.isConfirm;

        if (isBottomMessage) {
            modal.classList.add('event-dialog-modal');
            modal.classList.remove('interview-dialog-modal');

            // メッセージを画面の一番下に配置
            modal.style.display = 'flex';
            modal.style.flexDirection = 'column';
            modal.style.justifyContent = 'flex-end';
            
            if (hasChoices) {
                // 選択肢がある場合
                modal.classList.add('event-choices-active');

                if (footer) {
                    footer.classList.remove('hidden');
                    
                    // ★変更：メッセージ枠の「すぐ上」に配置する魔法
                    // 親要素(modal)が縦並びのリストになっているので、順番(order)を入れ替えるだけで上にきます！
                    footer.style.position = 'relative'; 
                    footer.style.order = '-1'; 
                    
                    // ★最上部に飛んでしまう原因だった「上の空きスペース（margin-top: auto）」を、
                    // 強力な魔法(!important)で上書きし、メッセージ枠から奪い取ってボタン（footer）の上に作らせます！
                    footer.style.setProperty('margin-top', 'auto', 'important');
                    footer.style.setProperty('margin-bottom', '15px', 'important'); // メッセージ枠との隙間
                    
                    if (modalContent) {
                        // メッセージ枠の上の空きスペースを消して、ボタンのすぐ下にくっつけます
                        modalContent.style.setProperty('margin-top', '0', 'important');
                    }
                    
                    footer.style.top = '';
                    footer.style.bottom = '';
                    footer.style.left = '';
                    footer.style.transform = '';
                    footer.style.zIndex = '1000';
                    footer.style.padding = '0';
                    footer.style.justifyContent = 'center';
                    
                    if (document.body.classList.contains('is-pc')) {
                        footer.style.width = '80%';
                        footer.style.maxWidth = '600px';
                        footer.style.flexDirection = 'row'; // ★PC版は横並び
                        footer.style.gap = '10px';
                    } else {
                        footer.style.width = '100%';
                        footer.style.maxWidth = '100%';
                        // ★スマホ版で、面談の時だけ縦に並べる魔法！
                        if (dialog.customOpts && dialog.customOpts.isInterview) {
                            footer.style.flexDirection = 'column';
                            footer.style.gap = '12px';
                            // ★面談の時だけ、メッセージ枠との隙間を少し上に広げて余裕を持たせます！
                            footer.style.setProperty('margin-bottom', '30px', 'important');
                        } else {
                            footer.style.flexDirection = 'row';
                            footer.style.gap = '10px';
                        }
                    }
                }
            } else {
                // 選択肢がなく、閉じるだけの場合：ボタンを隠して画面クリックで進行
                modal.classList.remove('event-choices-active');
                if (footer) {
                    footer.classList.add('hidden');
                    footer.style.flexDirection = ''; // お掃除
                    footer.style.gap = '';
                }

                // ★変更：画面のどこ（黒背景でも枠内でも）をタッチしても進めるようにします
                modal.style.cursor = 'pointer';
                modal.addEventListener('click', this._currentEventClickHandler);
                
                if (modalContent) {
                    modalContent.style.cursor = 'pointer';
                }
            }
        } else {
            // 下側配置ではない通常のダイアログ
            modal.classList.remove('event-dialog-modal');
            modal.classList.remove('event-choices-active');
            
            if (footer) {
                footer.style.flexDirection = ''; // お掃除
                footer.style.gap = '';
            }

            if (dialog.customOpts && dialog.customOpts.isInterview) {
                modal.classList.add('interview-dialog-modal');
            } else {
                modal.classList.remove('interview-dialog-modal');
            }

            modal.style.display = 'flex';
            modal.style.flexDirection = 'column';
            modal.style.justifyContent = 'center'; // 通常時は画面の中央付近にまとめます

            if (footer) {
                footer.classList.remove('hidden');
                footer.style.justifyContent = 'center';
                if (dialog.customOpts && dialog.customOpts.isInterview) {
                    footer.classList.remove('right');
                    footer.style.justifyContent = '';
                }
            }
        }

        // --- ボタンの生成 ---
        if (hasCustomChoices) {
            if (footer) {
                dialog.customOpts.choices.forEach((choice, index) => {
                    const btn = document.createElement('button');
                    // 最初の選択肢を「okBtn」として扱えるようにお名前シールを貼ります
                    if (index === 0) btn.id = 'dialog-btn-ok';

                    if (dialog.customOpts.isInterview) {
                        btn.className = 'interview-choice-btn';
                    } else {
                        btn.className = choice.className || 'btn-secondary';
                    }
                    btn.textContent = choice.label;
                    
                    if (choice.disabled) {
                        btn.disabled = true;
                        btn.classList.add('disabled');
                    }

                    btn.onclick = (e) => {
                        e.stopPropagation();
                        if (window.AudioManager) {
                            if (choice.label === "戻る" || choice.label === "いいえ") window.AudioManager.playSE('cancel.ogg');
                            else window.AudioManager.playSE('decision.ogg');
                        }
                        // ★Round19：ここで選択肢用レイアウトを外すと、次の会話まで一瞬配置が跳ねるため維持します。
                        cleanupAndNext(choice.onClick);
                    };
                    footer.appendChild(btn);
                });
            }
        } else if (!isBottomMessage || hasChoices) {
            // 通常の確認(isConfirm)か、通常の閉じるダイアログでボタンを表示する場合
            if (footer) {
                if (dialog.isConfirm) {
                    const okB = document.createElement('button');
                    okB.id = 'dialog-btn-ok'; 
                    okB.className = dialog.customOpts?.okClass || 'btn-primary';
                    okB.textContent = dialog.customOpts?.okText || 'はい';
                    okB.onclick = (e) => {
                        e.stopPropagation();
                        if (modal.classList.contains('event-dialog-modal') && window.AudioManager) {
                            window.AudioManager.playSE('decision.ogg');
                        }
                        cleanupAndNext(dialog.onOk);
                    };
                    footer.appendChild(okB);

                    const canB = document.createElement('button');
                    canB.id = 'dialog-btn-cancel'; 
                    canB.className = dialog.customOpts?.cancelClass || 'btn-secondary';
                    canB.textContent = dialog.customOpts?.cancelText || 'いいえ';
                    canB.onclick = (e) => {
                        e.stopPropagation();
                        if (modal.classList.contains('event-dialog-modal') && window.AudioManager) {
                            window.AudioManager.playSE('cancel.ogg');
                        }
                        cleanupAndNext(dialog.onCancel);
                    };
                    footer.appendChild(canB);
                } else if (!isBottomMessage) {
                    // 通常の閉じるボタン
                    const closeB = document.createElement('button');
                    closeB.id = 'dialog-btn-ok'; 
                    closeB.className = dialog.customOpts?.okClass || 'btn-secondary';
                    closeB.textContent = dialog.customOpts?.okText || '閉じる';
                    closeB.onclick = (e) => {
                        e.stopPropagation();
                        cleanupAndNext(dialog.onOk);
                    };
                    footer.appendChild(closeB);
                }
            }
        }

        modal.classList.remove('hidden');

        if (dialog.autoCloseTime > 0) {
            autoCloseTimer = setTimeout(() => {
                if (!modal.classList.contains('hidden')) {
                    // ★修正：今の画面にある本物のokBtnを探して押します
                    const currentOkBtn = document.getElementById('dialog-btn-ok');
                    if (currentOkBtn) {
                        currentOkBtn.click();
                    } else {
                        // ★追加：ボタンがないイベント画面などの場合は、直接「次へ進む」魔法を呼び出します！
                        cleanupAndNext(dialog.onOk);
                    }
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
            
            if (percent >= 100) {
                fillClass = 'bar-fill-maxgreen';
            }
        } else {
            percent = 0;
            emptyBgClass = 'status-bar-empty-bg';
        }

        return `<div class="status-bar-container ${emptyBgClass}"><div class="status-bar-fill ${fillClass}" style="--status-bar-width:${percent}%;"></div><div class="status-bar-text">${displayText}</div></div>`;
    }

    // ==========================================
    // Round26：観戦終了予約はイベントへ割り込むダイアログではなく、
    // 操作不能の小さな案内だけを出します。ゲーム状態には触れません。
    // ==========================================
    showWatchReturnReserved(message = '観戦終了を予約しました') {
        let notice = document.getElementById('watch-return-reserved-notice');
        if (!notice) {
            notice = document.createElement('div');
            notice.id = 'watch-return-reserved-notice';
            document.body.appendChild(notice);
        }
        notice.textContent = message;
    }

    hideWatchReturnReserved() {
        const notice = document.getElementById('watch-return-reserved-notice');
        if (notice && notice.parentNode) notice.parentNode.removeChild(notice);
    }

    initContextMenu() {
        this.contextMenu = document.getElementById('custom-context-menu');

        // ★右クリックやスマホの長押しで実行する中身をひとまとめにします
        const executeContextMenuAction = (e) => {
            // Round26：観戦中の右クリック／長押しは、どんなイベント画面の最中でも
            // 「閉じる」等を押さず、まず観戦終了の予約だけを行います。
            // 2回目以降はGameManager側の予約フラグで無視されます。
            if (this.game && this.game.isWatchMode) {
                if (e && e.preventDefault) e.preventDefault();
                if (typeof this.game.requestWatchReturn === 'function') {
                    const accepted = this.game.requestWatchReturn();
                    // 災害イベント地図などが「確認タップ待ち」まで進んでいる場合は、
                    // 帰還予約をした操作を「地図を見終えた」入力としても扱います。
                    // イベント本体や被害計算は飛ばさず、この待ちだけを解除します。
                    if (accepted) {
                        const passiveEventMap = document.querySelector('.event-map-overlay');
                        if (passiveEventMap && typeof passiveEventMap.click === 'function') {
                            setTimeout(() => {
                                if (passiveEventMap.isConnected) passiveEventMap.click();
                            }, 0);
                        }
                    }
                }
                return;
            }

            // ==========================================
            // ★PC版のみ「閉じる」「戻る」「いいえ」を右クリックで押せる魔法！
            // ==========================================
            if (document.body.classList.contains('is-pc')) {
                const buttons = Array.from(document.querySelectorAll('button'));
                const targetTexts = ['閉じる', '戻る', 'いいえ'];
                // 一番手前にあるボタンを見つけるために、リストを逆順にしてから探します
                const cancelBtn = buttons.reverse().find(btn => 
                    targetTexts.includes(btn.textContent.trim()) && 
                    btn.offsetParent !== null && // 画面に表示されているか
                    !btn.closest('.hidden') &&   // 親の枠ごと隠されていないか
                    !btn.disabled                // 押せない状態になっていないか
                );

                if (cancelBtn) {
                    if (e && e.preventDefault) e.preventDefault();
                    cancelBtn.click();
                    return; // ボタンを押したら、これより下の処理（命令終了など）はストップします！
                }
            }
            // ==========================================

            // ★追加：野戦や攻城戦中は右クリックで「命令終了」を誤爆させないようにガードします！
            if (this.game) {
                if (this.game.fieldWarManager && this.game.fieldWarManager.active) {
                    if (e && e.preventDefault) e.preventDefault();
                    return;
                }
                if (this.game.warManager && this.game.warManager.state && this.game.warManager.state.active) {
                    if (e && e.preventDefault) e.preventDefault();
                    return;
                }
            }

            // ★追加：他のウインドウ（設定やinfoウインドウ、ダイアログなど）が開いている時は反応しないようにガードします！
            // これで「命令を終了しますか？」という確認画面が出ている時の連打も防げます！
            const openModal = document.querySelector('.modal:not(.hidden)');
            if (openModal) {
                if (e && e.preventDefault) e.preventDefault(); // ブラウザ本来のメニューも出さないようにします
                return; // ここで処理を終わらせて、ボタンを押すのをやめます
            }

            // 画面の中に「命令終了」のボタンがあるか”すべて”探して集めます
            const finishBtns = document.querySelectorAll('.cmd-btn.finish');
            
            // 集めたボタンの中から、実際に画面に表示されている（隠れていない）本物のボタンを探します
            let visibleBtn = null;
            finishBtns.forEach(btn => {
                if (btn.offsetParent !== null) {
                    visibleBtn = btn;
                }
            });
            
            // 表示されている本物のボタンが見つかった時だけ、ポチッと押します！
            if (visibleBtn) {
                // ボタンが出ている時だけ、ブラウザ本来の右クリックメニューが出ないように防ぎます
                if (e && e.preventDefault) e.preventDefault(); 
                visibleBtn.click();
            }
        };

        // ★ここから追加：代わりに、右クリックで「命令終了」を押したことにする魔法です！
        document.addEventListener('contextmenu', executeContextMenuAction);

        // ★ここからさらに追加！：スマホでは「contextmenu」がうまく動かないので、自分で長押しを数える魔法を追加します！
        let longPressTimer = null;
        let isLongPress = false;

        document.addEventListener('touchstart', (e) => {
            // 指が2本以上の時は無視します
            if (e.touches.length > 1) return;
            isLongPress = false;
            
            // 指を置いた瞬間にタイマーをスタートします（0.6秒）
            longPressTimer = setTimeout(() => {
                isLongPress = true;
                executeContextMenuAction(e);
            }, 600);
        }, { passive: false });

        document.addEventListener('touchmove', () => {
            // 指が動いたら長押しのキャンセルです
            if (longPressTimer) {
                clearTimeout(longPressTimer);
                longPressTimer = null;
            }
        }, { passive: false });

        document.addEventListener('touchend', (e) => {
            // 指を離した時もタイマーを止めます
            if (longPressTimer) {
                clearTimeout(longPressTimer);
                longPressTimer = null;
            }
            // もし既に長押しが発動していたら、余計なクリックが起きないように防ぎます
            if (isLongPress) {
                if (e.cancelable) e.preventDefault();
            }
        }, { passive: false });
    }

    showContextMenu(x, y) {
        // メニューを出さないように、魔法を空っぽにしました！
    }

    hideContextMenu() {
        // エラーが出ないように、念のため「メニューを隠す」お約束だけ残しておきます
        if (this.contextMenu) this.contextMenu.classList.add('hidden');
    }

    // ==========================================
    // ★ここから追加：画面内のリストに自作スクロールバーをつける魔法
    // ==========================================
    updateCustomScrollbars(targetRoot = document) {
        // ★Round12：まずDOMから外れた古いScrollbarを破棄し、documentに残るtouchmove等の参照を解放します。
        if (typeof CustomScrollbar !== 'undefined' && typeof CustomScrollbar.cleanupDisconnected === 'function') {
            CustomScrollbar.cleanupDisconnected();
        }

        const selectors = [
            '.list-container',
            '#divide-list',
            '.daimyo-list-container',
            '.faction-list-container',
            '.princess-list-container',
            '#history-list'
        ];

        // targetRootを渡した場合は、その部分だけを更新できます。従来どおり引数なしなら画面全体です。
        const root = targetRoot && typeof targetRoot.querySelectorAll === 'function' ? targetRoot : document;
        const targets = [];
        if (root.matches && root.matches(selectors.join(', '))) targets.push(root);
        root.querySelectorAll(selectors.join(', ')).forEach(el => targets.push(el));

        targets.forEach(listEl => {
            if (listEl.customScrollbar && !listEl.customScrollbar._destroyed) {
                // update()直呼びではなく1フレームにまとめます。
                if (typeof listEl.customScrollbar.scheduleUpdate === 'function') listEl.customScrollbar.scheduleUpdate();
                else listEl.customScrollbar.update();
            } else if (typeof CustomScrollbar !== 'undefined') {
                listEl.customScrollbar = new CustomScrollbar(listEl);
            }
        });
    }
    // ==========================================

    // ロード画面。装飾アニメーションではなく、実際の処理段階と進捗率を表示します。
    showLoadingScreen(label = '準備しています', progress = 0) {
        if (this.globalLoadingScreen) this.globalLoadingScreen.classList.remove('hidden');
        this.updateLoadingProgress(progress, label);
    }

    updateLoadingProgress(progress, label = null) {
        const value = Math.max(0, Math.min(100, Math.round(Number(progress) || 0)));
        if (label !== null && this.loadingStatus) this.loadingStatus.textContent = String(label);
        if (this.loadingProgressBar) this.loadingProgressBar.style.width = `${value}%`;
        if (this.loadingProgressText) this.loadingProgressText.textContent = `${value}%`;
    }

    // 重い処理の前後で明示的に描画機会を作るための共通窓口です。
    waitForNextPaint() {
        return new Promise(resolve => {
            if (typeof requestAnimationFrame === 'function') requestAnimationFrame(() => setTimeout(resolve, 0));
            else setTimeout(resolve, 0);
        });
    }

    hideLoadingScreen() {
        if (this.globalLoadingScreen) this.globalLoadingScreen.classList.add('hidden');
    }

    // ★追加：タイトル画面でセーブデータがあるかチェックする魔法
    async checkSaveDataForTitle() {
        const continueBtn = document.getElementById('continue-btn');
        const loadBtn = document.getElementById('load-btn');
        if (!continueBtn && !loadBtn) return;

        let hasData = false;
        
        // データベースから読み込む機能が使えるか確認します
        if (typeof loadFromDB === 'function') {
            for (let i = 1; i <= 5; i++) {
                try {
                    const rawData = await loadFromDB("sengoku_save_slot" + i);
                    if (rawData) {
                        hasData = true;
                        break; // 1つでもデータが見つかればOKです
                    }
                } catch (e) {
                    console.error("セーブデータ確認エラー:", e);
                }
            }
        }
        
        // ★追加：ゲーム本体にセーブデータがあるかないかの印を付けておきます
        if (this.game) this.game.hasSaveData = hasData;

        // データがない場合はボタンを押せなくして、少し透明（半透明）にします
        if (!hasData) {
            if (continueBtn) {
                continueBtn.disabled = true;
                continueBtn.style.opacity = '0.5';
                continueBtn.style.cursor = 'not-allowed';
            }
            if (loadBtn) {
                loadBtn.disabled = true;
                loadBtn.style.opacity = '0.5';
                loadBtn.style.cursor = 'not-allowed';
            }
        } else {
            // データがある場合は普通に押せるように戻します
            if (continueBtn) {
                continueBtn.disabled = false;
                continueBtn.style.opacity = '1';
                continueBtn.style.cursor = 'pointer';
            }
            if (loadBtn) {
                loadBtn.disabled = false;
                loadBtn.style.opacity = '1';
                loadBtn.style.cursor = 'pointer';
            }
        }
    }

    forceResetModals() {
        // ★ここを書き足し：強制リセットの時は、背景ストップも確実に解除しておきます！
        if (this.isBackgroundPaused) {
            this.resumeBackgroundUpdates();
        }

        const modals = document.querySelectorAll('.modal');
        modals.forEach(m => {
            m.classList.add('hidden');
            m.style.display = ''; 
        });
        if(this.cutinOverlay) this.cutinOverlay.classList.add('hidden');
        if(this.warModal) this.warModal.classList.add('hidden');
        if(this.unitDivideModal) this.unitDivideModal.classList.add('hidden');
        if(this.aiGuard) {
            this.aiGuard.classList.add('hidden'); 
            this.aiGuard.classList.remove('hide-text');
            this.aiGuard.style.opacity = '1'; // もし透明になっていたら元に戻しておきます！
            this.guardHiddenCount = 0;        // 何回隠したかの記憶もきれいに忘れます！
            this.guardTextHiddenCount = 0;    // 文字だけを隠す側のスタックも同時に初期化します
        }
        
        if (typeof this.hideAIWarThinking === 'function') {
            this.hideAIWarThinking();
        }
        
        // コマンドを初期化して隠す魔法をここでも使います！
        if (typeof this.clearCommandMenu === 'function') {
            this.clearCommandMenu();
        }
        
        // 前に遊んでいた時の画面の枠をしっかり隠します！
        if(this.panelEl) this.panelEl.classList.add('hidden'); // PC版のサイドバーを隠します
        if(this.statusContainer) this.statusContainer.innerHTML = ''; // PC版の上の情報も消します
        if(this.pcNewUiContainer) this.pcNewUiContainer.classList.add('hidden');
        if(this.pcNewStatusPanel) this.pcNewStatusPanel.innerHTML = '';
        if(this.pcNewCommandArea) this.pcNewCommandArea.innerHTML = '';
        if(this.mobileTopLeft) this.mobileTopLeft.innerHTML = ''; // スマホ版の上の情報を消します
        if(this.mobileFloatingInfo) this.mobileFloatingInfo.innerHTML = ''; // スマホ版の時計を消します
        if(this.mobileFloatingMarket) this.mobileFloatingMarket.innerHTML = ''; // スマホ版の相場を消します
        const cmdGrid = document.getElementById('command-area');
        if(cmdGrid) cmdGrid.style.display = 'none'; // スマホ版のボタン置き場を隠します0

        this.hideContextMenu();
    }
    
    log(msg) { 
        this.logHistory.push(`[${this.game.year}年${this.game.month}月] ${msg}`);
        if(this.logHistory.length > 50) this.logHistory.shift();
        
        if(this.game.warManager && this.game.warManager.state.active && this.game.warManager.state.isPlayerInvolved && this.warLog) {
             const div = document.createElement('div');
             div.innerHTML = msg;
             this.warLog.appendChild(div);
             this.warLog.scrollTop = this.warLog.scrollHeight;
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

    showKyotenList() {
        this.info.showKyotenList();
    }

    showAppointLegionLeaderModal(legionNo) {
        this.info.openBushoSelector('appoint_legion_leader', null, { legionNo: legionNo });
    }
    
    showAppointLegionCastleSelector(bushoId, legionNo) {
        if (this.info) {
            this.info.showAppointLegionCastleSelector(bushoId, legionNo);
        }
    }

    showDismissLegionLeaderConfirm(legionNo) {
        if (!this.game.legions) return;
        const legion = this.game.legions.find(l => Number(l.clanId) === Number(this.game.playerClanId) && Number(l.legionNo) === legionNo);
        if (!legion || !legion.commanderId) return;
        
        const commander = this.game.getBusho(legion.commanderId);
        if (!commander) return;

        this.showDialog(`${commander.name} を国主の座から解任しますか？`, true, 
            () => {
                this.game.commandSystem.executeDismissLegionLeader(legionNo);
            },
            null,
            { okText: '解任する', okClass: 'btn-danger', cancelText: 'やめる' }
        );
    }

    showAllotFiefModal(legionNo) {
        this.info.showAllotFiefModal(legionNo);
    }
    
    showDiplomacyList(clanId, clanName) {
        this.info.showDiplomacyList(clanId, clanName);
    }
    
    showFactionList(clanId, isDirect = false) {
        this.info.showFactionList(clanId, isDirect);
    }

    showResultModal(msg, onClose = null, customFooterHtml = null) { 
        this.hideAIGuardTemporarily(); 

        // ★ここを書き足し：結果画面を開いている間も背景をストップします！
        this.pauseBackgroundUpdates();
        
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
                footer.innerHTML = `<button class="btn-secondary result-close-dynamic">閉じる</button>`;
                const closeBtn = footer.querySelector('.result-close-dynamic');
                if (closeBtn) closeBtn.addEventListener('click', () => this.closeResultModal());
            }
        }
        if (this.resultModal) this.resultModal.classList.remove('hidden'); 
        this.onResultModalClose = onClose;
    }
    
    closeResultModal() { 
        if (this.resultModal) this.resultModal.classList.add('hidden'); 
        this.restoreAIGuard(); 
        
        // ★ここを書き足し：結果画面を閉じたら背景を再開します！
        this.resumeBackgroundUpdates();

        // ★追加：結果画面を閉じた時に、鳴っているSEを0.1秒でスッと消す魔法です！
        if (window.AudioManager && typeof window.AudioManager.fadeOutSe === 'function') {
            window.AudioManager.fadeOutSe(0.1);
        }

        // ★今回追加：もし外交用のBGMが鳴っていたら、結果画面を閉じた瞬間に元のBGMに戻します！
        if (window.AudioManager && window.AudioManager.currentBgmName === 'SC_ex_Scene3_Odyssey.ogg') {
            if (typeof window.AudioManager.restoreMemorizedBgm === 'function') {
                window.AudioManager.restoreMemorizedBgm();
            } else if (window.AudioManager._memorizedBgm) {
                window.AudioManager.playBGM(window.AudioManager._memorizedBgm);
                window.AudioManager._memorizedBgm = null;
            }
        }

        // 小窓を閉じる時に、必ず「いつもの閉じるボタン」に戻しておきます！
        const footer = document.getElementById('result-footer');
        if (footer) {
            // ★変更：青色（btn-primary）からグレー（btn-secondary）に変更します！
            footer.innerHTML = `<button class="btn-secondary result-close-dynamic">閉じる</button>`;
            const closeBtn = footer.querySelector('.result-close-dynamic');
            if (closeBtn) closeBtn.addEventListener('click', () => this.closeResultModal());
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
        
        const confirmBtn = document.getElementById('scenario-confirm-btn');

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
                    if (selectedScenario !== s) {
                        if (window.AudioManager) window.AudioManager.playSE('choice.ogg');
                        
                        // 他のボタンの色を元に戻して、今押したボタンだけ色を変えます
                        Array.from(this.scenarioList.children).forEach(child => child.classList.remove('selected'));
                        div.classList.add('selected');
                        selectedScenario = s;

                        // 下の説明用の窓に文章を出して、見えるようにします
                        if (descBox) {
                            descBox.innerHTML = `<div class="scenario-desc-text">${s.desc}</div>`;
                            descBox.style.display = 'flex';
                        }
                    }
                };
                this.scenarioList.appendChild(div);

                // 一番最初のシナリオ（indexが0）なら、最初から選んだ状態にします
                if (index === 0) {
                    div.classList.add('selected');
                    selectedScenario = s;
                    if (descBox) {
                        descBox.innerHTML = `<div class="scenario-desc-text">${s.desc}</div>`;
                        descBox.style.display = 'flex';
                    }
                }
            });
            
            // 決定ボタンを押した時の動きを登録します
            if (confirmBtn) {
                confirmBtn.onclick = () => {
                    if (selectedScenario) {
                        if (window.AudioManager) window.AudioManager.playSE('decision.ogg');
                        this.scenarioScreen.classList.add('hidden'); 
                        onSelect(selectedScenario.folder); 
                    }
                };
            }
        }
    }
    async returnToTitle() { 
        // ★追加：お掃除を始める前に、画面をロード画面で隠します
        this.showLoadingScreen();
        await new Promise(resolve => setTimeout(resolve, 50));

        this.forceResetModals();

        // ★ここを追加：ゲームのステータスを「タイトル画面」に戻す魔法！
        if (this.game) this.game.phase = 'title';

        const ts = document.getElementById('title-screen');
        if(ts) ts.classList.remove('hidden'); 
        
        // ★ここから下を書き足します！
        if (window.AudioManager) {
            window.AudioManager.playBGM('SC_ex_Town1_Castle.ogg');
        }
        // ★書き足すのはここまで！

        // ★追加：お掃除が終わってタイトル画面が出たら、少し待ってからロード画面を隠します
        await new Promise(resolve => setTimeout(resolve, 100));

        // ★ここを追加：タイトルに戻った時にもセーブデータがあるかチェックしてボタンを更新します
        await this.checkSaveDataForTitle();

        this.hideLoadingScreen();
    }
    
    // ★ ここをごっそり差し替え！：大名選択の確認画面を、ギュッと小さくコンパクトにする魔法です！
    showDaimyoConfirmModal(clanId, clanName, soldiers, leader, onStart) {
        // 情報専門の ui_info.js にまるごとお任せします
        this.info.showDaimyoConfirmModal(clanId, clanName, soldiers, leader, onStart);
    }

    showCastleMenuModal(castle) {
        // ★修正：以前のちっちゃいポップアップはやめて、新しい「拠点情報」画面を呼び出します！
        this.info.showCastleDetail(castle.id);
    }
    
    updatePanelHeader() { 
        if (!this.currentCastle) return; 
        if(this.statusContainer) {
            this.statusContainer.innerHTML = ''; 
        }
        this.updateInfoPanel(this.currentCastle);
    }

    updateInfoPanel(castle) {
        // ★ここを書き足し：背景ストップ中は、重たい画面の書き換えをサボります！
        if (this.isBackgroundPaused) return;

        if (!castle) return;
        if (this.game.phase === 'daimyo_select') return;
        
        const isVisible = this.game.isCastleVisible(castle);
        
        const mask = (val) => isVisible ? val : "不明";
        const maskPop = (val) => isVisible ? `${val}人` : "不明";
        
        const castellan = this.game.getBusho(castle.castellanId);
        const clanData = this.game.clans.find(cd => cd.id === castle.ownerClan);
        const clanName = clanData ? clanData.name : "中立";
        
        const getCompressedBushoNameHtml = (busho) => {
            if (!busho) return "-";
            if (busho.givenName) {
                return this._getCompressedTextHtml(busho.familyName, 3) + this._getCompressedTextHtml(busho.givenName, 3);
            } else {
                return this._getCompressedTextHtml(busho.name.replace('|', ''), 5);
            }
        };

        const compressedClanName = this._getCompressedTextHtml(clanName, 4);
        const compressedCastellanName = getCompressedBushoNameHtml(castellan);
        
        let provinceName = "";
        if (this.game.provinces) {
            const province = this.game.provinces.find(p => p.id === castle.provinceId);
            if (province) {
                provinceName = province.province;
            }
        }
        
        let faceHtml = "";
        if (castellan && castellan.faceIcon) {
            faceHtml = `<img class="sp-castellan-face" src="data/images/faceicons/${castellan.faceIcon}">`;
        }

        // ★城にいるアクティブな自軍武将の数を数える魔法です！
        let activeBushoCount = 0;
        if (castle.ownerClan !== 0 && this.game && this.game.bushos) {
            activeBushoCount = this.game.bushos.filter(b => b.castleId === castle.id && b.clan === castle.ownerClan && window.BushoStatusRules.isActive(b)).length;
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

        // 状態異常などのマークを作ります
        let statusMarksHtml = "";
        if (isProtected) {
            statusMarksHtml += `<div class="status-mark mark-senran">戦乱</div>`;
        }
        if (castle.statusEffects) {
            if (castle.statusEffects.includes('一揆')) {
                statusMarksHtml += `<div class="status-mark mark-ikki">一揆</div>`;
            }
            if (castle.statusEffects.includes('糧攻')) {
                statusMarksHtml += `<div class="status-mark mark-starve">糧攻</div>`;
            }
        }

        // 大雪のシールは「城」ではなく「国（地方）」に貼られているので、国をチェックします
        if (this.game.provinces) {
            const province = this.game.provinces.find(p => p.id === castle.provinceId);
            if (province && province.statusEffects && province.statusEffects.includes('heavySnow')) {
                statusMarksHtml += `<div class="status-mark mark-snow">大雪</div>`;
            }
        }

        let clanHtml = "";
        if (Number(castle.ownerClan) !== 0) {
            clanHtml = `<span class="sp-clan">${compressedClanName}</span>`;
        }

        const isPc = document.body.classList.contains('is-pc');
        let content = "";

        if (isPc) {
            content = `
                <div class="sp-info-header">${clanHtml}<span class="sp-province">${provinceName}</span><span class="sp-castle">${castle.name}</span><span class="sp-lord-label">城主</span><span class="sp-lord-name">${compressedCastellanName}</span></div>
                <div class="sp-info-body">
                    <div class="sp-face-wrapper">${faceHtml}</div>
                    <div class="sp-params-grid">
                        <div class="sp-label">石高</div><div class="sp-val">${this.getStatusBarHTML(castle.kokudaka, castle.maxKokudaka, 'blue', isVisible)}</div>
                        <div class="sp-label">訓練</div><div class="sp-val">${this.getStatusBarHTML(castle.training, 100, 'lightblue', isVisible)}</div>
                        <div class="sp-label">軍馬</div><div class="sp-val-right sp-val-compact">${mask(castle.horses || 0)}</div>
                        
                        <div class="sp-label">鉱山</div><div class="sp-val">${this.getStatusBarHTML(castle.commerce, castle.maxCommerce, 'blue', isVisible)}</div>
                        <div class="sp-label">士気</div><div class="sp-val">${this.getStatusBarHTML(castle.morale, 100, 'lightblue', isVisible)}</div>
                        <div class="sp-label">鉄砲</div><div class="sp-val-right sp-val-compact">${mask(castle.guns || 0)}</div>
                        
                        <div class="sp-label">民忠</div><div class="sp-val">${this.getStatusBarHTML(castle.peoplesLoyalty, castle.maxPeoplesLoyalty, 'lightblue', isVisible)}</div>
                        <div class="sp-label">防御</div><div class="sp-val">${this.getStatusBarHTML(castle.defense, castle.maxDefense, 'lightblue', isVisible)}</div>
                        <div class="sp-empty"></div><div class="sp-empty"></div>
                        
                        <div class="sp-label">人口</div><div class="sp-val-left sp-population-value">${maskPop(castle.population)}</div>
                        <div class="sp-label">武将</div><div class="sp-val-right">${maskPop(activeBushoCount)}</div>
                    </div>
                </div>
                <div class="sp-info-footer">
                    <div class="sp-footer-box"><span>金</span><span>${mask(castle.gold)}</span></div>
                    <div class="sp-footer-box"><span>兵糧</span><span>${mask(castle.rice)}</span></div>
                    <div class="sp-footer-box"><span>兵士</span><span>${mask(castle.soldiers)}</span></div>
                </div>
                ${statusMarksHtml ? `<div class="status-marks-container">${statusMarksHtml}</div>` : ''}
            `;
        } else {
            content = `
                <div class="sp-info-header">${clanHtml}<span class="sp-province">${provinceName}</span><span class="sp-castle">${castle.name}</span><span class="sp-lord-label">城主</span><span class="sp-lord-name">${compressedCastellanName}</span></div>
                <div class="sp-info-body">
                    <div class="sp-face-column">
                        <div class="sp-face-wrapper">${faceHtml}</div>
                        ${statusMarksHtml ? `<div class="status-marks-carousel">${statusMarksHtml}</div>` : ''}
                    </div>
                    <div class="sp-params-grid">
                        <div class="sp-label">石高</div><div class="sp-val">${this.getStatusBarHTML(castle.kokudaka, castle.maxKokudaka, 'blue', isVisible)}</div>
                        <div class="sp-label">訓練</div><div class="sp-val">${this.getStatusBarHTML(castle.training, 100, 'lightblue', isVisible)}</div>
                        <div class="sp-label">軍馬</div><div class="sp-val-right">${mask(castle.horses || 0)}</div>
                        
                        <div class="sp-label">鉱山</div><div class="sp-val">${this.getStatusBarHTML(castle.commerce, castle.maxCommerce, 'blue', isVisible)}</div>
                        <div class="sp-label">士気</div><div class="sp-val">${this.getStatusBarHTML(castle.morale, 100, 'lightblue', isVisible)}</div>
                        <div class="sp-label">鉄砲</div><div class="sp-val-right">${mask(castle.guns || 0)}</div>
                        
                        <div class="sp-label">民忠</div><div class="sp-val">${this.getStatusBarHTML(castle.peoplesLoyalty, castle.maxPeoplesLoyalty, 'lightblue', isVisible)}</div>
                        <div class="sp-label">防御</div><div class="sp-val">${this.getStatusBarHTML(castle.defense, castle.maxDefense, 'lightblue', isVisible)}</div>
                        <div class="sp-empty"></div><div class="sp-empty"></div>
                        
                        <div class="sp-label">人口</div><div class="sp-val-left sp-population-value">${maskPop(castle.population)}</div>
                        <div class="sp-label">武将</div><div class="sp-val-right">${maskPop(activeBushoCount)}</div>
                    </div>
                </div>
                <div class="sp-info-footer">
                    <div class="sp-footer-box"><span>金</span><span>${mask(castle.gold)}</span></div>
                    <div class="sp-footer-box"><span>兵糧</span><span>${mask(castle.rice)}</span></div>
                    <div class="sp-footer-box"><span>兵士</span><span>${mask(castle.soldiers)}</span></div>
                </div>
            `;
        }

        if (this.mobileTopLeft) {
            this.mobileTopLeft.innerHTML = content;

            const castellanFace = this.mobileTopLeft.querySelector('.sp-castellan-face');
            if (castellanFace) {
                castellanFace.addEventListener('error', () => castellanFace.classList.add('is-broken'), { once: true });
            }
            
            if (!isPc) {
                const carousel = this.mobileTopLeft.querySelector('.status-marks-carousel');
                if (carousel) {
                    const marks = carousel.querySelectorAll('.status-mark');
                    if (marks.length > 0) {
                        let currentIndex = 0;
                        marks[0].classList.add('active'); // fade-inクラスを付けないので初回は一瞬で出ます
                        
                        if (this._statusCarouselTimer) clearInterval(this._statusCarouselTimer);
                        
                        if (marks.length > 1) {
                            // 複数ある場合はタップ可能にし、タイマーを回す
                            carousel.style.cursor = 'pointer';
                            
                            const showNext = () => {
                                marks[currentIndex].classList.remove('active', 'fade-in');
                                currentIndex = (currentIndex + 1) % marks.length;
                                marks[currentIndex].classList.add('active', 'fade-in'); // 切り替わる時だけふわっとさせる
                            };
                            this._statusCarouselTimer = setInterval(showNext, 2500);
                            
                            carousel.onclick = (e) => {
                                e.stopPropagation();
                                clearInterval(this._statusCarouselTimer);
                                showNext();
                                this._statusCarouselTimer = setInterval(showNext, 2500);
                            };
                        } else {
                            // 1つしかない場合はタップ反応を完全に消す
                            carousel.style.cursor = 'default';
                            carousel.onclick = (e) => { e.stopPropagation(); };
                        }
                    }
                }
            }
        }
        
        if (this.statusContainer && isPc) {
            this.statusContainer.innerHTML = content;
        }
        
        if (this.pcNewStatusPanel && isPc) {
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
            roninCount = this.game.bushos.filter(b => b.castleId === castle.id && window.BushoStatusRules.isRonin(b)).length;
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
        
        // ★敵のターン中（AIターン）に援軍のために自城をクリックした時、
        // AIフラグが勝手に消し飛んでしまわないように守ります！
        if (Number(castle.ownerClan) === Number(this.game.playerClanId)) {
            if (!this.game.selectionMode && !this.game.isProcessingAI) {
                this.game.isProcessingAI = false;
            }
        }
        
        // ★AIのターン進行中は、重たい画面更新（DOM操作）をスキップして超軽量化します！
        if (this.game.isProcessingAI) {
            // 外交や援軍などの特別な選択中でない限り、画面をいちいち書き換えるのを防ぎます
            if (!this.game.selectionMode && Number(castle.ownerClan) !== Number(this.game.playerClanId)) {
                this.clearCommandMenu();
                return; // ここで処理を止めて、情報パネルや光（Glow）の更新をスキップします！
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
        else if (this.game.isProcessingAI) {
            // ★追加：AIのターン進行中は、コマンドボタンを隠してスッキリさせます！
            this.clearCommandMenu();
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
        
        // ★ここから追加：親の箱が隠れていてボタンが見えなくなるのを防ぐ魔法です！
        if (document.body.classList.contains('is-pc')) {
            const pcContainer = document.getElementById('pc-new-ui-container');
            if (pcContainer) pcContainer.classList.remove('hidden');
        } else {
            // スマホ版の場合も念のため表示状態に戻します
            if (mobileArea) mobileArea.style.display = 'grid';
        }
        
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
                        },
                        { okText: 'やめる', okClass: 'btn-danger', cancelText: '続ける' }
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
            btn.textContent = "自拠点へ";
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
        const overlay = document.getElementById('command-overlay');
        const mobileArea = document.getElementById('command-area');
        if (mobileArea) {
            mobileArea.innerHTML = '';
            const createBtn = (label, cls, onClick, isDisabled = false) => {
                const btn = document.createElement('button');
                btn.className = `cmd-btn ${cls || ''}`;
                btn.textContent = label;
                if (isDisabled) {
                    btn.disabled = true;
                    btn.classList.add('disabled');
                }
                btn.onclick = () => {
                    if (this.game.isProcessingAI) return;
                    this.cancelMapSelection(true);
                    onClick();
                };
                mobileArea.appendChild(btn);
            };
            const cmd = (type) => this.game.commandSystem.startCommand(type);
            const menu = (targetMenu) => {
                this.menuState = targetMenu;
                this.renderCommandMenu();
            };
            
            const specs = this.game.commandSystem.getSpecs();
            
            if (this.menuState === 'MAIN') {
                COMMAND_MENU_STRUCTURE.forEach(item => {
                    // ★修正：ルールの専門家（command_system.js）にチェックしてもらいます
                    const isDisabled = this.game.commandSystem.isCategoryDisabled(item.label);
                    createBtn(item.label, "category", () => menu(item.label), isDisabled);
                });
                const finishBtn = document.createElement('button');
                finishBtn.className = `cmd-btn finish`;
                finishBtn.textContent = "命令終了";
                finishBtn.onclick = () => {
                    if (this.game.isProcessingAI) return;
                    this.cancelMapSelection(true);
                    const nav = this.game.getNavigatorInfo(this.currentCastle);
                    this.showDialog("「今月の命令を終了しますか？」", true, () => {
                        this.game.finishTurn();
                    }, null, {
                        leftFace: nav.faceIcon,
                        leftName: nav.name
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
                    if (topItem.items) {
                        for (const sub of topItem.items) {
                            if (typeof sub === 'object' && sub !== null && sub.label === this.menuState) {
                                currentMenuInfo = sub;
                                parentMenuName = topItem.label;
                                break;
                            }
                        }
                        if (currentMenuInfo) break;
                    }
                }
                
                if (!currentMenuInfo) {
                    menu('MAIN');
                } else {
                    let btnCount = 0;
                    if (currentMenuInfo.items) {
                        currentMenuInfo.items.forEach(item => {
                            if (typeof item === 'string') {
                                const spec = specs[item];
                                if (spec) {
                                    const isDisabled = typeof this.game.commandSystem.canExecuteCommand === 'function' ? !this.game.commandSystem.canExecuteCommand(item) : false;
                                    createBtn(spec.label, "", () => cmd(item), isDisabled);
                                    btnCount++;
                                }
                            } else if (typeof item === 'object' && item !== null) {
                                const isDisabled = this.game.commandSystem.isCategoryDisabled(item.label);
                                createBtn(item.label, "category", () => menu(item.label), isDisabled);
                                btnCount++;
                            }
                        });
                    }
                    const emptyCount = 2 - (btnCount % 3);
                    for(let i=0; i<emptyCount; i++) {
                        const d = document.createElement('div');
                        mobileArea.appendChild(d);
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
        const createBtn = (area, label, cls, onClick, isDisabled = false) => {
            const btn = document.createElement('button');
            btn.className = `cmd-btn ${cls || ''}`;
            btn.textContent = label;
            if (isDisabled) {
                btn.disabled = true;
                btn.classList.add('disabled');
            }
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
            // ★修正：PC版でもルールの専門家（command_system.js）にチェックしてもらいます
            const isDisabled = this.game.commandSystem.isCategoryDisabled(item.label);
            createBtn(col1, item.label, isActive ? "category active" : "category", () => {
                if (isActive) {
                    this.pcMenuPath = [];
                } else {
                    this.pcMenuPath = [item.label];
                }
                this.renderPcCommandMenu();
            }, isDisabled); // ★ここも忘れずに isDisabled を渡します
        });
        createBtn(col1, "命令終了", "finish", () => {
            if (this.game.isProcessingAI) return;
            this.cancelMapSelection(true);
            const nav = this.game.getNavigatorInfo(this.currentCastle);
            this.showDialog("「今月の命令を終了しますか？」", true, () => {
                this.game.finishTurn();
            }, null, {
                leftFace: nav.faceIcon,
                leftName: nav.name
            });
        });
        
        const renderSubMenu = (menuList, pathIndex, parentCol) => {
            if (this.pcMenuPath.length <= pathIndex) return;
            
            const activeLabel = this.pcMenuPath[pathIndex];
            const activeItem = menuList.find(m => typeof m === 'object' && m !== null && m.label === activeLabel);
            if (!activeItem) return;
            
            const col = createCol();
            
            if (activeItem.items) {
                activeItem.items.forEach(item => {
                    if (typeof item === 'string') {
                        const spec = specs[item];
                        if (spec) {
                            const isDisabled = typeof this.game.commandSystem.canExecuteCommand === 'function' ? !this.game.commandSystem.canExecuteCommand(item) : false;
                            createBtn(col, spec.label, "", () => cmd(item), isDisabled);
                        }
                    } else if (typeof item === 'object' && item !== null) {
                        const isActive = this.pcMenuPath[pathIndex + 1] === item.label;
                        const isDisabled = this.game.commandSystem.isCategoryDisabled(item.label);
                        createBtn(col, item.label, isActive ? "category active" : "category", () => {
                            this.pcMenuPath = this.pcMenuPath.slice(0, pathIndex + 1);
                            if (!isActive) this.pcMenuPath.push(item.label);
                            this.renderPcCommandMenu();
                        }, isDisabled);
                    }
                });
                renderSubMenu(activeItem.items, pathIndex + 1, col);
            }
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
        // 顔の画像が設定されていない場合は、シルエット画像を使います
        const faceIcon = gunshi && gunshi.faceIcon ? gunshi.faceIcon : 'unknown_face.webp';
        const gunshiName = gunshi ? gunshi.name : '不明';

        // メッセージを「」で囲みます
        const formattedMsg = `「${msg}」`;

        // 顔グラフィック付きのダイアログを呼び出す魔法に横流しします
        this.showDialog(formattedMsg, true, onConfirm, null, {
            leftFace: faceIcon,
            leftName: `${gunshiName}`,
            okText: '実行',
            okClass: 'btn-primary',
            cancelText: '戻る',
            cancelClass: 'btn-secondary'
        });
    }
    
    openBushoSelector(actionType, targetId = null, extraData = null, onBack = null) {
        this.info.openBushoSelector(actionType, targetId, extraData, onBack);
    }
    
    showBushoDetailModal(busho) {
        this.info.showBushoDetailModal(busho);
    }

    showUnitDivideModal(bushos, totalSoldiers, totalHorses, totalGuns, onConfirm, onCancel = null) {
        this.slider.showUnitDivideModal(bushos, totalSoldiers, totalHorses, totalGuns, onConfirm, onCancel);
    }
    
    showTurnStartDialog(castle, onProceed) {
        const nav = this.game.getNavigatorInfo(castle);
        const msg = `「殿、${castle.name}にご命令ください」`;

        if (window.AudioManager) {
            window.AudioManager.playSE('myturn.ogg');
        }

        this.showDialog(msg, false, onProceed, null, { 
            leftFace: nav.faceIcon, 
            leftName: nav.name 
        });
    }

    openQuantitySelector(type, data, targetId, extraData = null) {
        this.slider.openQuantitySelector(type, data, targetId, extraData);
    }
    
    // ---------------------------------------------------------
    // 魔法①：大名家と諸勢力が混ざった「援軍用」のリスト（共通化版）
    // ---------------------------------------------------------
    showForceSelector(forces, onSelect, onCancel) {
        // ★修正：手動で作っていたリストをやめ、情報専門部署（ui_info.js）の共通リストに任せます！
        this.info.showForceSelector(forces, onSelect, onCancel);
    }
    
    setWarModalVisible(visible) {
        if (!this.warModal) return;
        if (visible) {
            // 援軍参加などで開戦時にはプレイヤー非関与だった戦争が手動戦闘へ切り替わる場合も、
            // モーダルを出す前に同じ戦場中心をカメラの正本にします。
            const openingWarState = this.game && this.game.warManager ? this.game.warManager.state : null;
            if (openingWarState && Number(openingWarState.battleFocusCastleId) > 0 && !openingWarState.battleCameraLocked && typeof this.focusMapOnCastle === 'function') {
                openingWarState.battleCameraLocked = true;
                this.focusMapOnCastle(Number(openingWarState.battleFocusCastleId), {
                    transition: 'smooth',
                    reason: 'battle_modal_open',
                    anchor: 'territory',
                    diagnostic: false,
                    lockInteraction: false
                });
            }
            this.warModal.classList.remove('hidden');
            // ★追加：攻城戦が始まる時に、平時のコマンドリストを綺麗にお掃除して非表示にします！
            if (typeof this.clearCommandMenu === 'function') {
                this.clearCommandMenu();
            }
        } else {
            this.warModal.classList.add('hidden');

            // スマホでは戦争モーダルの表示/非表示で地図の可視領域寸法が微妙に変わる場合があります。
            // 戦争中にカメラを固定している場合は、モーダルを閉じたDOM状態で同じ戦場中心へ
            // 即時補正します。focusMapOnCastleはclientWidth/Height参照時に同期レイアウトを行うため、
            // 次の描画フレームより前に正しい位置へ戻せます。
            const warState = this.game && this.game.warManager ? this.game.warManager.state : null;
            if (warState && warState.battleCameraLocked && Number(warState.battleFocusCastleId) > 0 && typeof this.focusMapOnCastle === 'function') {
                this.focusMapOnCastle(Number(warState.battleFocusCastleId), {
                    transition: 'instant',
                    reason: 'battle_modal_close',
                    anchor: 'territory',
                    diagnostic: false,
                    lockInteraction: false
                });
            }

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
        
        const msgContainer = document.createElement('div');
        msgContainer.className = 'war-action-message-container';
        
        const textContainer = document.createElement('div');
        textContainer.className = 'war-action-message-text';
        
        const promptContainer = document.createElement('div');
        promptContainer.className = 'war-action-message-prompt';
        promptContainer.textContent = '▼'; 
        
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
                
                // ★修正：連続でダメージを受けた時にアニメーションが途切れないよう、クラス解除のタイマーをリセットします
                if (targetCard.damageAnimTimer) clearTimeout(targetCard.damageAnimTimer);
                
                targetCard.classList.remove('anim-damage-shake', 'anim-damage-flash', 'anim-damage-shake-flash');
                void targetCard.offsetWidth; 
                
                // ★修正：揺れと点滅を両立させるため、合成クラス（anim-damage-shake-flash）を使います！
                if (!isRecover) {
                    targetCard.classList.add('anim-damage-shake-flash');
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

                // アニメーションクラスを外す処理（タイマーで管理）
                targetCard.damageAnimTimer = setTimeout(() => {
                    targetCard.classList.remove('anim-damage-shake', 'anim-damage-flash', 'anim-damage-shake-flash');
                }, 1000);

                // 数字のポップアップを消す処理（独立させておくことで確実に消えるようにします）
                setTimeout(() => {
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
                
                // ★修正：タイマーをリセットして連続ダメージでも綺麗に動くようにします
                if (wallEl.damageAnimTimer) clearTimeout(wallEl.damageAnimTimer);
                
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

                // アニメーションクラスを外す処理（タイマー管理）
                wallEl.damageAnimTimer = setTimeout(() => {
                    wallEl.classList.remove('anim-damage-shake');
                    hexWrap.classList.remove('anim-damage-flash');
                }, 1000);

                // 数字のポップアップを消す処理
                setTimeout(() => {
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
                            el.innerHTML = `<span class="war-highlight-value">${val}</span>`;
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

        const getCompressedBushoNameHtml = (busho, isStrong = false) => {
            if (!busho) return "不明";
            if (busho.givenName) {
                // 姓と名が分かれている場合は、それぞれ3文字以上で縮小します
                return this._getCompressedTextHtml(busho.familyName, 3, isStrong) + this._getCompressedTextHtml(busho.givenName, 3, isStrong);
            } else {
                // 分かれていない場合は、5文字以上で縮小します
                return this._getCompressedTextHtml(busho.name.replace('|', ''), 5, isStrong);
            }
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
        const maxRounds = window.WarParams.Military.WarMaxRounds;
        
        const turnEl = document.getElementById('war-turn-info');
        if (turnEl) turnEl.innerHTML = `残り <span class="turn-number">${Math.max(0, maxRounds - s.round + 1)}</span>ターン`;
        
        const wallEl = document.getElementById('war-def-wall-info');
        if (wallEl) wallEl.innerHTML = `<span class="war-highlight-value">${s.defender.defense}</span>`;

        const titleNameEl = document.getElementById('war-title-name');
        if (titleNameEl) {
            // ★修正：スマホで長くなった時に単語の途中で改行されないよう、名前と種類のブロックを分けます
            if (s.defender.isKunishu) {
                titleNameEl.innerHTML = `<span class="war-title-segment">${s.defender.name}</span> <span class="war-title-segment">鎮圧戦</span>`;
            } else {
                titleNameEl.innerHTML = `<span class="war-title-segment">${s.defender.name}</span> <span class="war-title-segment">攻防戦</span>`;
            }
        }
        
        const atkClan = this.game.clans.find(c => c.id === s.attacker.ownerClan);
        let atkName = "土豪";
        if (s.attacker.isKunishu) {
            const kunishu = this.game.kunishuSystem ? this.game.kunishuSystem.getKunishu(s.attacker.kunishuId) : null;
            atkName = kunishu ? kunishu.getName(this.game) : s.attacker.name;
        } else if (atkClan) {
            atkName = atkClan.name;
        } else {
            const prov = this.game.provinces.find(p => p.id === s.sourceCastle.provinceId);
            atkName = prov ? prov.province : "土豪";
        }
        
        // ★修正：さっき作った魔法で縮小した文字（HTML）を入れます！
        const atkNameEl = document.getElementById('war-atk-name');
        if (atkNameEl) atkNameEl.innerHTML = this._getCompressedTextHtml(atkName, 4);
        
        const atkTitleEl = document.getElementById('war-atk-name').parentElement;
        if (atkName.length >= 8) {
            atkTitleEl.classList.add('title-long-text');
        } else {
            atkTitleEl.classList.remove('title-long-text');
        }
        
        // ★修正：武将名も魔法を使って縮小します！
        const atkBushoEl = document.getElementById('war-atk-busho');
        if (atkBushoEl) atkBushoEl.innerHTML = getCompressedBushoNameHtml(s.atkBushos[0]) + '軍';
        
        setTxt('war-atk-soldier', s.attacker.soldiers + '人');
        setTxt('war-atk-rice', s.attacker.rice); 
        setTxt('war-atk-training', s.attacker.training);
        setTxt('war-atk-morale', s.attacker.morale);
        setTxt('war-atk-horses', s.attacker.horses || 0);
        setTxt('war-atk-guns', s.attacker.guns || 0);
        updateFace('war-atk-face', s.atkBushos[0]);
        
        const defClan = this.game.clans.find(c => c.id === s.defender.ownerClan);
        let defNameText = "土豪";
        if (s.defender.isKunishu) {
            const kunishu = this.game.kunishuSystem ? this.game.kunishuSystem.getKunishu(s.defender.kunishuId) : null;
            defNameText = kunishu ? kunishu.getName(this.game) : s.defender.name;
        } else if (defClan) {
            defNameText = defClan.name;
        } else {
            const prov = this.game.provinces.find(p => p.id === s.defender.provinceId);
            defNameText = prov ? prov.province : "土豪";
        }
        
        // ★修正：守備側も魔法で縮小します！
        const defNameEl = document.getElementById('war-def-name');
        if (defNameEl) defNameEl.innerHTML = this._getCompressedTextHtml(defNameText, 4);
        
        const defTitleEl = document.getElementById('war-def-name').parentElement;
        if (defNameText.length >= 8) {
            defTitleEl.classList.add('title-long-text');
        } else {
            defTitleEl.classList.remove('title-long-text');
        }

        // ★修正：武将名も魔法で縮小します！
        const defBushoEl = document.getElementById('war-def-busho');
        if (defBushoEl) defBushoEl.innerHTML = getCompressedBushoNameHtml(s.defBusho) + '軍';
        
        setTxt('war-def-soldier', s.defender.soldiers + '人');
        setTxt('war-def-rice', s.defender.rice); 
        setTxt('war-def-training', s.defender.training);
        setTxt('war-def-morale', s.defender.morale);
        setTxt('war-def-horses', s.defender.horses || 0);
        setTxt('war-def-guns', s.defender.guns || 0);
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
            const trainingEl = document.getElementById(`war-${prefix}-reinf-training`);
            const moraleEl = document.getElementById(`war-${prefix}-reinf-morale`);
            const horsesEl = document.getElementById(`war-${prefix}-reinf-horses`);
            const gunsEl = document.getElementById(`war-${prefix}-reinf-guns`);
            
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

                    // ★修正：innerHTMLで空っぽにします
                    orgEl.innerHTML = '';
                    bushoEl.innerHTML = '';
                    soldierEl.textContent = '';
                    riceEl.textContent = '';
                    trainingEl.textContent = '';
                    moraleEl.textContent = '';
                    if(horsesEl) horsesEl.textContent = '';
                    if(gunsEl) gunsEl.textContent = '';
                    
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

                // ★追加：スマホ版かどうかを調べて、援軍を少し強めに縮小するための目印を作ります
                const isMobile = !document.body.classList.contains('is-pc');

                const leader = reinfData.bushos && reinfData.bushos.length > 0 ? reinfData.bushos[0] : null;
                // ★修正：魔法を使って武将名を縮小します！
                const leaderNameHtml = leader ? getCompressedBushoNameHtml(leader, isMobile) + "軍" : "不明";
                
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
                // ★修正：勢力名も魔法を使って縮小します！
                orgEl.innerHTML = this._getCompressedTextHtml(orgName, 4, isMobile);
                bushoEl.innerHTML = leaderNameHtml;
                soldierEl.textContent = (reinfData.soldiers || 0) + '人';
                riceEl.textContent = reinfData.rice || 0;
                trainingEl.textContent = reinfData.training || 0;
                moraleEl.textContent = reinfData.morale || 0;
                if(horsesEl) horsesEl.textContent = reinfData.horses || 0;
                if(gunsEl) gunsEl.textContent = reinfData.guns || 0;
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
            options.push({ label: "撤退", type: "retreat", desc: "戦場から離脱し、自領へと退却します。" });
        } else if (s.turn === 'defender') {
            // ★修正：中立の空き城（ownerClanが0）の守備軍は、撤退できないようにガードを追加します！
            if (s.defender.ownerClan !== 0 && this.game.castles.some(c => c.ownerClan === s.defender.ownerClan && c.id !== s.defender.id && MapGraphService.isReachable(this.game, s.defender, c, s.defender.ownerClan))) {
                options.push({ label: "撤退", type: "retreat", desc: "城を捨てて、近隣の安全な城へ退却します。" });
            }
        } else {
            // 援軍の場合は攻撃・守備に関わらず撤退可能
            options.push({ label: "撤退", type: "retreat", desc: "戦場から離脱し、元の城へ引き上げます。" });
        }

        this.warControls.innerHTML = '';

        // ★左側のボタンを入れる箱（3分の2）
        const btnContainer = document.createElement('div');
        btnContainer.className = 'war-controls-buttons';

        // ★右側の説明を入れる箱（3分の1）
        const descContainer = document.createElement('div');
        descContainer.className = 'war-controls-desc';
        descContainer.innerHTML = '<div class="war-command-placeholder">命令を選択してください</div>';

        // 2つの箱を画面に追加します
        this.warControls.appendChild(btnContainer);
        this.warControls.appendChild(descContainer);

        let selectedBtnInfo = null; // ★今どのボタンが「1回押された状態」かを覚えておく箱です

        options.forEach(cmd => {
            const btn = document.createElement('button');
            // ★追加：内政ボタンと同じデザイン（cmd-btn）を適用します
            btn.className = 'cmd-btn';
            if (cmd.type === 'retreat') {
                btn.classList.add('back'); // 撤退ボタンは「戻る」と同じグレーのデザインにします
            }
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
                        <div class="war-command-desc-title">${cmd.label}</div>
                        <div>${cmd.desc}</div>
                        <div class="war-command-desc-confirm">もう一度押すと実行します</div>
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
                div.className = 'select-item succession-select-item';
                
                const getStat = (stat) => StatPresenter.getDisplayStatHTML(c, stat, gunshi, null, this.game.playerClanId, myDaimyo);

                div.innerHTML = `
                    <span class="succession-candidate-name">${c.name}</span> 
                    <span class="succession-candidate-stats">統:${getStat('leadership')} 政:${getStat('politics')}</span>
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
            this.game.warPreparationController.executeReinforcementRequest(0, helperCastle, atkCastle, targetCastle, atkBushos, sVal, rVal, hVal, gVal, selfReinfData);
            return;
        }

        // 情報専門の ui_slider.js が持っている共通の数量選択スライダー（openQuantitySelector）を呼び出します
        this.slider.openQuantitySelector('reinf_gold', [atkCastle], null, {
            onConfirm: (inputs) => {
                const gold = inputs.gold ? parseInt(inputs.gold.num.value) : 0;
                this.game.warPreparationController.executeReinforcementRequest(gold, helperCastle, atkCastle, targetCastle, atkBushos, sVal, rVal, hVal, gVal, selfReinfData);
            },
            onCancel: () => {
                if (backToMap) backToMap();
                else this.game.warManager.startWar(atkCastle, targetCastle, atkBushos, sVal, rVal, hVal, gVal, null, selfReinfData);
            }
        });
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

        // 情報専門の ui_slider.js が持っている共通の数量選択スライダー（openQuantitySelector）を呼び出します
        this.slider.openQuantitySelector('reinf_gold', [defCastle], null, {
            onConfirm: (inputs) => {
                const gold = inputs.gold ? parseInt(inputs.gold.num.value) : 0;
                this.game.warManager.executeDefReinforcement(gold, helperCastle, defCastle, onComplete);
            },
            onCancel: () => {
                if (backToMap) backToMap();
                else onComplete(); 
            }
        });
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
            const trainingEl = card.querySelector('[id$="-training"]');
            const moraleEl = card.querySelector('[id$="-morale"]');
            const horsesEl = card.querySelector('[id$="-horses"]');
            const gunsEl = card.querySelector('[id$="-guns"]');
            if (orgEl) orgEl.textContent = '';
            if (bushoEl) bushoEl.textContent = '';
            if (soldierEl) soldierEl.textContent = '';
            if (riceEl) riceEl.textContent = '';
            if (trainingEl) trainingEl.textContent = '';
            if (moraleEl) moraleEl.textContent = '';
            if (horsesEl) horsesEl.textContent = '';
            if (gunsEl) gunsEl.textContent = '';
            
            if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
        }, 1000);
    }
    
    // AIの思考中メッセージを戦闘用メッセージ枠に表示する
    showWarThinkingMessage(armyName) {
        if (!this.warControls) return;
        this.warControls.innerHTML = '';
        
        const msgContainer = document.createElement('div');
        msgContainer.className = 'war-action-message-container';
        
        const textContainer = document.createElement('div');
        textContainer.className = 'war-action-message-text';
        textContainer.innerHTML = `<span>${armyName} が作戦を思案中...</span>`;
        
        msgContainer.onclick = (e) => {
            e.stopPropagation();
            e.preventDefault();
        };

        msgContainer.appendChild(textContainer);
        this.warControls.appendChild(msgContainer);
    }
    
    showAIWarThinking() {
        let el = document.getElementById('ai-war-thinking');
        if (!el) {
            el = document.createElement('div');
            el.id = 'ai-war-thinking';
            el.innerText = '戦争思考中...';
            const gameScreen = document.getElementById('game-screen');
            if (gameScreen) gameScreen.appendChild(el);
        }
        el.classList.remove('hidden');
    }

    hideAIWarThinking() {
        const el = document.getElementById('ai-war-thinking');
        if (el) {
            el.classList.add('hidden');
        }
    }
}