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

        this.bushoDetailModal = document.getElementById('busho-detail-modal');
        this.bushoDetailBody = document.getElementById('busho-detail-body');

        this.onResultModalClose = null;

        // ★結果画面の外側（黒い背景）を押して閉じた時にも音が鳴る
        if (this.resultModal) {
            this.resultModal.addEventListener('click', (e) => { 
                if (e.target === this.resultModal) { 
                    if (window.AudioManager) window.AudioManager.playSE('cancel.ogg'); 
                    this.closeResultModal(); 
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
        let lastTouchEnd = 0;
        document.addEventListener('touchend', (event) => {
            const now = (new Date()).getTime();
            if (now - lastTouchEnd <= 300) {
                event.preventDefault(); 
            }
            lastTouchEnd = now;
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

                // メッセージを「準備中」に変えて、点滅も止めます
                tapMessage.textContent = "データを準備しています...";
                tapMessage.style.animation = "none";
                tapMessage.style.opacity = "1";

                // 音を鳴らす準備（ブラウザのルールで、ユーザーが画面を触った瞬間に鳴らすのが一番安全です）
                if (window.AudioManager) {
                    window.AudioManager.playBGM('SC_ex_Town1_Castle.ogg');
                }

                // ★ ここによく使う重い画像の道順（URL）を書きます！
                // 他にも最初からサクッと出したい画像があれば、ここに「,」で区切って足してくださいね
                const imageUrls = [
                    './data/images/map/japan_map.png',
                    './data/images/map/shiro_icon001.png',
                    './data/images/field_war_images/butai_icon.png'
                ];

                // 画像を裏側でこっそり読み込む魔法
                const loadImages = imageUrls.map(url => {
                    return new Promise((resolve) => {
                        const img = new Image();
                        img.onload = () => resolve();  // 成功したらOK！
                        img.onerror = () => resolve(); // 失敗しても、ゲームを止めないためにOK扱いにします
                        img.src = url;
                    });
                });

                // 画像が全部読み終わるまで、ここでじっと待ちます
                await Promise.all(loadImages);

                // 準備が終わったら、メッセージを隠してメニューボタンを出します！
                tapMessage.classList.add('hidden');
                menuButtons.classList.remove('hidden');
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

            const text = btn.textContent.trim();
            
            // ★ここを書き足し！：個別に音を鳴らす設定をしたボタンは、共通の「decision.ogg」をキャンセルします
            if (["一括", "直轄", "委任", "不可", "許可"].includes(text)) return;

            if (window.AudioManager) {
                if (["戻る", "閉じる", "拒否", "やめる", "撤退", "解放", "処断"].includes(text)) {
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

        while (
            (this.dialogQueue && this.dialogQueue.length > 0) ||
            isVisible('dialog-modal') ||
            isVisible('result-modal') ||
            isVisible('intercept-confirm-modal') ||
            isVisible('unit-divide-modal') ||
            isVisible('prisoner-modal')
        ) {
            didWait = true; 
            await new Promise(resolve => setTimeout(resolve, 200));
        }
        if (didWait) {
            await new Promise(resolve => setTimeout(resolve, 100));
        }
    }
    
    restoreAIGuard() {
        if (this.guardHiddenCount > 0) {
            this.guardHiddenCount--;
            if (this.guardHiddenCount === 0 && this.game && this.game.isProcessingAI) {
                const aiGuard = document.getElementById('ai-guard');
                if (aiGuard) aiGuard.classList.remove('hidden');
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

        if (dialog.isConfirm) {
            cancelBtn.classList.remove('hidden'); 
            cancelBtn.onclick = () => { cancelBtn.onclick = null; cleanupAndNext(dialog.onCancel); };
        } else {
            cancelBtn.classList.add('hidden'); 
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

        return `
            <div class="status-bar-container ${emptyBgClass}">
                <div class="status-bar-fill ${fillClass}" style="width: ${percent}%;"></div>
                <div class="status-bar-text">${displayText}</div>
            </div>
        `;
    }

    initContextMenu() {
        // 右クリックや長押しのメニューはバグの温床になるので、まるごと封印しました！
        this.contextMenu = document.getElementById('custom-context-menu');
    }

    showContextMenu(x, y) {
        // メニューを出さないように、魔法を空っぽにしました！
    }s

    hideContextMenu() {
        // エラーが出ないように、念のため「メニューを隠す」お約束だけ残しておきます
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
        if(this.aiGuard) this.aiGuard.classList.add('hidden'); 
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
        let listHtml = '<div class="daimyo-list-container"><div class="daimyo-list-header"><span>大名家名</span><span>当主名</span><span>城数</span><span>威信</span><span>友好度</span><span>関係</span></div>';
        
        const activeClans = this.game.clans.filter(c => c.id !== 0 && this.game.castles.some(cs => cs.ownerClan === c.id));
        
        // 念のため、一覧を開く直前にも最新の威信を計算し直しておきます
        this.game.updateAllClanPrestige();
        
        const clanDataList = activeClans.map(clan => {
            const leader = this.game.getBusho(clan.leaderId);
            // 城の数だけ、ここで数えます
            const castlesCount = this.game.castles.filter(c => c.ownerClan === clan.id).length;
            
            return {
                id: clan.id, 
                name: clan.name, 
                leaderName: leader ? leader.name : "不明",
                // ★今まで計算していた部分を消して、大名の箱から直接取り出します！
                power: clan.daimyoPrestige, 
                castlesCount: castlesCount
            };
        });
        
        clanDataList.sort((a,b) => b.power - a.power);
        
        const maxPower = clanDataList.length > 0 ? clanDataList[0].power : 1;

        clanDataList.forEach(d => {
            let friendScore = 50;
            let friendStatus = "-";
            let statusColor = "";
            let hasRelation = false;
            
            if (d.id !== this.game.playerClanId) {
                const relation = this.game.getRelation(this.game.playerClanId, d.id);
                if (relation) {
                    friendScore = relation.sentiment;
                    friendStatus = relation.status;
                    hasRelation = true;
                    
                    if (friendStatus === '敵対') statusColor = 'color:#d32f2f;';
                    else if (friendStatus === '友好') statusColor = 'color:#388e3c;';
                    else if (['同盟', '支配', '従属'].includes(friendStatus)) statusColor = 'color:#1976d2;';
                }
            }

            const powerPercent = Math.min(100, (d.power / maxPower) * 100);
            const powerBarHtml = `<div class="bar-bg bar-bg-power"><div class="bar-fill bar-fill-power" style="width:${powerPercent}%;"></div></div>`;

            let friendBarHtml = "-";
            if (d.id === this.game.playerClanId) {
                friendBarHtml = "-"; 
            } else {
                const friendPercent = Math.min(100, Math.max(0, friendScore));
                friendBarHtml = `<div class="bar-bg bar-bg-friend"><div class="bar-fill bar-fill-friend" style="width:${friendPercent}%;"></div></div>`;
            }

            listHtml += `<div class="daimyo-list-item" style="cursor:pointer;" onclick="if(window.AudioManager) window.AudioManager.playSE('choice.ogg'); window.GameApp.ui.showDiplomacyList(${d.id}, '${d.name}')"><span class="col-daimyo-name" style="font-weight:bold;">${d.name}</span><span class="col-leader-name">${d.leaderName}</span><span>${d.castlesCount}</span><span>${powerBarHtml}</span><span>${friendBarHtml}</span><span style="${statusColor}">${friendStatus}</span></div>`;
        });
        listHtml += '</div>';
        
        this.showResultModal(`<h3 style="margin-top:0; border-bottom: 2px solid #ddd; padding-bottom: 10px; flex-shrink:0;">大名一覧</h3>${listHtml}`, () => {
            if (this.resultBody) {
                this.resultBody.style.overflowY = '';
                this.resultBody.style.display = '';
                this.resultBody.style.flexDirection = '';
            }
        });

        if (this.resultBody) {
            this.resultBody.style.overflowY = 'hidden';
            this.resultBody.style.display = 'flex';
            this.resultBody.style.flexDirection = 'column';
        }
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
        let listHtml = '<div class="daimyo-list-container"><div class="daimyo-list-header" style="grid-template-columns: 2fr 1.5fr 1fr;"><span>大名家名</span><span>友好度</span><span>関係</span></div>';
        
        const activeClans = this.game.clans.filter(c => c.id !== 0 && c.id !== clanId && this.game.castles.some(cs => cs.ownerClan === c.id));
        
        const relations = activeClans.map(c => {
            const rel = this.game.getRelation(clanId, c.id);
            return {
                id: c.id,
                name: c.name,
                sentiment: rel ? rel.sentiment : 50,
                status: rel ? rel.status : "普通"
            };
        });

        relations.sort((a,b) => b.sentiment - a.sentiment);

        relations.forEach(r => {
            let statusColor = "";
            if (r.status === '敵対') statusColor = 'color:#d32f2f;';
            else if (r.status === '友好') statusColor = 'color:#388e3c;';
            else if (['同盟', '支配', '従属'].includes(r.status)) statusColor = 'color:#1976d2;';

            const friendPercent = Math.min(100, Math.max(0, r.sentiment));
            const friendBarHtml = `<div class="bar-bg bar-bg-friend"><div class="bar-fill bar-fill-friend" style="width:${friendPercent}%;"></div></div>`;

            listHtml += `<div class="daimyo-list-item" style="grid-template-columns: 2fr 1.5fr 1fr;"><span class="col-daimyo-name" style="font-weight:bold;">${r.name}</span><span>${friendBarHtml}</span><span style="${statusColor}">${r.status}</span></div>`;
        });
        listHtml += '</div>';
        
        const customFooter = `<button class="btn-secondary" onclick="window.GameApp.ui.showDaimyoList()">戻る</button>`;
        
        this.showResultModal(`<h3 style="margin-top:0; border-bottom: 2px solid #ddd; padding-bottom: 10px; flex-shrink:0;">${clanName} 外交関係</h3>${listHtml}`, () => {
            if (this.resultBody) {
                this.resultBody.style.overflowY = '';
                this.resultBody.style.display = '';
                this.resultBody.style.flexDirection = '';
            }
        }, customFooter);

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
        
        const daimyo = bushos.find(b => b.isDaimyo);
        const daimyoFactionId = daimyo ? daimyo.factionId : -1;
        
        fIds.sort((a, b) => {
            if (a === daimyoFactionId) return -1; 
            if (b === daimyoFactionId) return 1;  
            return factions[b].count - factions[a].count; 
        });
        
        let listHtml = `<div class="faction-list-container"><div class="faction-list-header"><span>派閥主</span><span>武将数</span><span>方針</span><span>思想</span></div>`;
        
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
                    seikaku = leader.factionSeikaku || "中道";
                    hoshin = leader.factionHoshin || "保守的";
                }
                
                let seikakuColor = "";
                if (seikaku === '武闘派') seikakuColor = 'color:#d32f2f;';
                else if (seikaku === '穏健派') seikakuColor = 'color:#1976d2;';

                let hoshinColor = "";
                if (hoshin === '革新的') hoshinColor = 'color:#e91e63;';
                else if (hoshin === '保守的') hoshinColor = 'color:#1976d2;';

                let nameStyle = "";
                if (fId === daimyoFactionId) {
                    nameStyle = "color: darkorange;";
                }

                listHtml += `<div class="faction-list-item"><strong class="col-faction-name" style="${nameStyle}">${leaderName}</strong><span>${count}</span><span style="${seikakuColor}">${seikaku}</span><span style="${hoshinColor}">${hoshin}</span></div>`;
            });
        }
        
        if (nonFactionCount > 0) {
            listHtml += `<div class="faction-list-item"><strong class="col-faction-name">無派閥</strong><span>${nonFactionCount}</span><span>-</span><span>-</span></div>`;
        }
        
        listHtml += `</div>`;

        let customFooter = "";
        if (isDirect) {
            customFooter = `<button class="btn-primary" onclick="window.GameApp.ui.closeResultModal()">閉じる</button>`;
        } else {
            customFooter = `<button class="btn-secondary" onclick="window.GameApp.ui.showDaimyoList()">戻る</button>`;
        }
        
        this.showResultModal(`<h3 style="margin-top:0; border-bottom: 2px solid #ddd; padding-bottom: 10px; flex-shrink:0;">${clan.name} 派閥一覧</h3>${listHtml}`, () => {
            if (this.resultBody) {
                this.resultBody.style.overflowY = '';
                this.resultBody.style.display = '';
                this.resultBody.style.flexDirection = '';
            }
        }, customFooter);

        if (this.resultBody) {
            this.resultBody.style.overflowY = 'hidden';
            this.resultBody.style.display = 'flex';
            this.resultBody.style.flexDirection = 'column';
        }
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
                footer.innerHTML = `<button class="btn-primary" onclick="window.GameApp.ui.closeResultModal()">閉じる</button>`;
            }
        }
        if (this.resultModal) this.resultModal.classList.remove('hidden'); 
        this.onResultModalClose = onClose;
    }
    
    closeResultModal() { 
        if (this.resultModal) this.resultModal.classList.add('hidden'); 
        this.restoreAIGuard(); 
        
        // ★ここから書き足します！
        // 小窓を閉じる時に、必ず「いつもの閉じるボタン」に戻しておきます！
        const footer = document.getElementById('result-footer');
        if (footer) {
            footer.innerHTML = `<button class="btn-primary" onclick="window.GameApp.ui.closeResultModal()">閉じる</button>`;
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
    
    // ==========================================
    // ★ここから追加：メッセージの魔法！
    // ==========================================
    showTapMessage(msg) {
        return new Promise((resolve) => {
            let overlay = document.getElementById('tap-message-overlay');
            
            if (!overlay) {
                overlay = document.createElement('div');
                overlay.id = 'tap-message-overlay';
                overlay.className = 'modal'; // 他の画面と同じ黒い下敷きを使います
                overlay.style.zIndex = '99999';
                document.body.appendChild(overlay);
            }
            
            // 白いウィンドウの中に、メッセージと「閉じる」ボタンを置きます
            overlay.innerHTML = `
                <div class="modal-content" style="max-width: 450px; text-align: center;">
                    <div style="font-size: 1.1rem; line-height: 1.5; font-weight: bold; color: #333; margin-bottom: 20px; padding-top: 10px;">
                        ${msg.replace(/\n/g, '<br>')}
                    </div>
                    <div class="modal-footer" style="justify-content: center; border-top: none; padding-bottom: 0;">
                        <button class="btn-primary" id="tap-msg-close-btn">閉じる</button>
                    </div>
                </div>
            `;
            
            overlay.classList.remove('hidden');

            const onClick = (e) => {
                // ウィンドウの「外側（黒い背景）」か、「閉じるボタン」を押したか調べます
                const isBackground = (e.target === overlay);
                const isCloseBtn = (e.target.id === 'tap-msg-close-btn');

                // 外側かボタンを押した時だけ、画面を閉じる魔法を発動します！
                if (isBackground || isCloseBtn) {
                    e.stopPropagation();
                    e.preventDefault();
                    overlay.classList.add('hidden');
                    overlay.removeEventListener('click', onClick);
                    
                    // 背景を押して閉じた時だけ、ここで「閉じる音（cancel.ogg）」を鳴らします
                    // （ボタンを押した時は、ゲーム共通の魔法で自動で音が鳴ります）
                    if (isBackground && window.AudioManager) {
                        window.AudioManager.playSE('cancel.ogg');
                    }
                    
                    resolve(); // 止めていた時間を動かします！
                }
            };
            
            // 下敷き全体にクリックの魔法をセット！
            overlay.addEventListener('click', onClick);
        });
    }
    // ==========================================
    
    showScenarioSelection(scenarios, onSelect) {
        this.forceResetModals();
        if (!this.scenarioScreen) return;
        this.scenarioScreen.classList.remove('hidden'); 
        if (this.scenarioList) {
            this.scenarioList.innerHTML = '';
            scenarios.forEach(s => {
                const div = document.createElement('div'); div.className = 'clan-btn';
                div.innerHTML = `<div style="text-align:left;"><strong>${s.name}</strong><br><small>${s.desc}</small></div>`;
                div.onclick = () => { 
                    if (window.AudioManager) window.AudioManager.playSE('choice.ogg');
                    
                    this.scenarioScreen.classList.add('hidden'); 
                    onSelect(s.folder); 
                };
                this.scenarioList.appendChild(div);
            });
        }
    }
    returnToTitle() { 
        this.forceResetModals();
        const ts = document.getElementById('title-screen');
        if(ts) ts.classList.remove('hidden'); 
    }
    
    // ★ ここをごっそり差し替え！：大名選択の確認画面を、ギュッと小さくコンパクトにする魔法です！
    showDaimyoConfirmModal(clanId, clanName, soldiers, leader, onStart) {
        if (!this.daimyoConfirmModal) return;

        // ★選択中の大名を記憶して、光を更新します
        this.selectedDaimyoId = clanId;
        this.updateCastleGlows();

        // ★追加：大名を選んだら、マップをスッキリさせるために名前シールを隠す合図を出します！
        document.body.classList.add('hide-daimyo-labels');

        this.daimyoConfirmModal.classList.remove('hidden');
        
        let faceHtml = "";
        if (leader && leader.faceIcon) {
            faceHtml = `<img src="data/images/faceicons/${leader.faceIcon}" class="daimyo-confirm-face" onerror="this.style.display='none'">`;
        }

        if (this.daimyoConfirmBody) {
            this.daimyoConfirmBody.innerHTML = `
                <div class="daimyo-confirm-compact">
                    ${faceHtml}
                    <div class="daimyo-confirm-info">
                        <h3 style="margin:0 0 5px 0; font-size:1.2rem; border:none; padding:0;">${clanName}</h3>
                        <div style="font-size:0.95rem; margin-bottom: 3px;">当主：${leader ? leader.name : "不明"}</div>
                        <div style="font-size:0.95rem; font-weight:bold; color:#d32f2f;">総兵数：${soldiers}</div>
                    </div>
                </div>
            `;
        }
        
        const startBtn = document.getElementById('daimyo-confirm-start-btn');
        if (startBtn) {
            startBtn.style.display = '';
            startBtn.textContent = "この大名で開始"; 
            startBtn.onclick = () => {
                if (window.AudioManager) {
                    window.AudioManager.playBGM('SC_ex_Town2_Fortress.ogg');
                }

                this.daimyoConfirmModal.classList.add('hidden');
                this.selectedDaimyoId = null; 
                document.body.classList.remove('daimyo-select-mode'); 
                // ★追加：ゲームが始まったら隠す合図を解除します
                document.body.classList.remove('hide-daimyo-labels'); 
                onStart();
            };
        }
        const backBtn = document.getElementById('daimyo-confirm-back-btn');
        if (backBtn) {
            backBtn.style.display = '';
            backBtn.textContent = "やめる";
            backBtn.onclick = () => {
                this.selectedDaimyoId = null; 
                this.updateCastleGlows();     
                // ★追加：「やめる」を押したら隠す合図を解除して、名前シールを復活させます
                document.body.classList.remove('hide-daimyo-labels'); 
                this.renderMap(); 
            };
        }
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
        
        let faceHtml = "";
        if (castellan && castellan.faceIcon) {
            faceHtml = `<img src="data/images/faceicons/${castellan.faceIcon}" onerror="this.style.display='none'">`;
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

        // ★城にいる浪人の数を数える魔法！
        let roninCount = 0;
        if (this.game && this.game.bushos) {
            // 「死んでいない（deadじゃない）」かつ「未登場（unbornじゃない）」かつ「諸勢力ではない（belongKunishuIdが0）」人を数えるように変更します！
            roninCount = this.game.bushos.filter(b => b.castleId === castle.id && Number(b.clan) === 0 && Number(b.belongKunishuId) === 0 && b.status !== 'dead' && b.status !== 'unborn').length;
        }

        if (this.mobileFloatingMarket) {
            this.mobileFloatingMarket.innerHTML = `
                <div class="floating-market">浪人 ${roninCount}人</div>
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
        const mobileArea = document.getElementById('command-area');
        const pcArea = document.getElementById('pc-command-area');
        const areas = [mobileArea, pcArea];
        areas.forEach(area => {
            if(!area) return;
            area.innerHTML = '';
            
            const btn = document.createElement('button');
            btn.className = 'cmd-btn back';
            btn.textContent = "戻る";
            btn.onclick = () => {
                if(this.game.isProcessingAI) return;
                
                // ★ 自軍か他大名家かで、聞く言葉を変える魔法です！
                const selfReinfModes = ['atk_self_reinforcement', 'def_self_reinforcement'];
                const allyReinfModes = ['atk_ally_reinforcement', 'def_ally_reinforcement'];
                
                let confirmMessage = "";
                if (selfReinfModes.includes(this.game.selectionMode)) {
                    confirmMessage = "援軍を出すのをやめますか？";
                } else if (allyReinfModes.includes(this.game.selectionMode)) {
                    confirmMessage = "援軍を要請するのをやめますか？";
                }

                // ★ メッセージがセットされていたら、確認の小窓を出します
                if (confirmMessage !== "") {
                    this.showDialog(confirmMessage, true, 
                        () => {
                            // 「はい（やめる）」を選んだ時は、そのままキャンセルして次に進みます
                            this.cancelMapSelection(false); 
                            this.scrollToActiveCastle();
                        },
                        () => {
                            // 「いいえ（やめない）」を選んだ時は、何もしないので城を選ぶ画面のままになります
                        }
                    );
                } else {
                    // 援軍以外の普通のマップ選択の時は、いつも通りすぐにキャンセルします
                    this.cancelMapSelection(false); 
                    this.scrollToActiveCastle();
                }
            };
            area.appendChild(btn);
        });
    }
    
    renderEnemyViewMenu() {
        const mobileArea = document.getElementById('command-area');
        const pcArea = document.getElementById('pc-command-area');
        const areas = [mobileArea, pcArea];
        areas.forEach(area => {
            if(!area) return;
            area.innerHTML = '';
            
            const btn = document.createElement('button');
            btn.className = 'cmd-btn back';
            btn.textContent = "自拠点へ戻る";
            btn.onclick = () => {
                if(this.game.isProcessingAI) return;
                const myCastle = this.game.getCurrentTurnCastle();
                this.showControlPanel(myCastle);
                this.scrollToActiveCastle(myCastle);
            };
            area.appendChild(btn);
        });
    }

    cancelMapSelection(keepMenuState = false) { 
        const prevMode = this.game.selectionMode; // ★これを追加
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
            'FOREIGN': "対外", 
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
            // ★追加：対外メニューの時に「大名家」「調略」「諸勢力」「朝廷」へのボタンを出します
            if (this.menuState === 'FOREIGN') {
                createBtn("大名家", "category", () => menu('FOREIGN_DAIMYO'));
                createBtn("調略", "category", () => menu('FOREIGN_STRATEGY'));
                createBtn("諸勢力", "category", () => menu('FOREIGN_KUNISHU'));
                createBtn("朝廷", "category", () => menu('DIPLOMACY_COURT'));
            }
            
            // 空きマスの計算も少しだけ変えます
            let extraBtnCount = 0;
            if (this.menuState === 'MILITARY') extraBtnCount = 1;
            if (this.menuState === 'FOREIGN') extraBtnCount = 4;
            
            const emptyCount = 3 - ((relevantCommands.length + extraBtnCount) % 3);
            if (emptyCount < 3) {
                for(let i=0; i<emptyCount; i++) {
                    const d = document.createElement('div');
                    area.appendChild(d);
                }
            }

            if (this.menuState === 'MIL_TRADE') {
                createBtn("戻る", "back", () => menu('MILITARY'));
            } else if (['FOREIGN_DAIMYO', 'FOREIGN_STRATEGY', 'FOREIGN_KUNISHU', 'DIPLOMACY_COURT'].includes(this.menuState)) {
                // ★追加：大名家や調略などのメニューにいる時は、戻るボタンで「対外」に戻ります
                createBtn("戻る", "back", () => menu('FOREIGN'));
            } else {
                createBtn("戻る", "back", () => menu('MAIN'));
            }
        });
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
        
        const backBtn = document.querySelector('#selector-modal .btn-secondary');
        if(backBtn) {
            if (extraData && extraData.hideCancel) {
                backBtn.style.display = 'none';
            } else {
                backBtn.style.display = ''; 
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

        const isViewMode = (actionType === 'view_only' || actionType === 'all_busho_list');
        if (this.selectorList) {
            this.selectorList.innerHTML = `
                <div class="list-header">
                    <span class="col-act">行動</span><span class="col-name">名前</span><span class="col-rank">身分</span><span class="col-stat">統率</span><span class="col-stat">武勇</span><span class="col-stat">政務</span><span class="col-stat">外交</span><span class="col-stat">智謀</span><span class="col-stat">魅力</span>
                </div>
            `;
        }
        
        const c = this.currentCastle; 
        
        // ★さっき作った新しい魔法で、武将のリストとメッセージをまとめて受け取ります！
        const data = this.game.commandSystem.getBushoSelectorData(actionType, targetId, extraData, c);
        let bushos = data.bushos;
        let infoHtml = data.infoHtml;
        let isMulti = data.isMulti;
        let spec = data.spec;

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
            } else if (actionType === 'war_deploy' || actionType === 'def_intercept_deploy') {
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

        bushos.forEach(b => {
            if (actionType === 'banish' && b.isCastellan) return; 
            if (actionType === 'employ_target' && b.isDaimyo) return;
            if (actionType === 'reward' && b.isDaimyo) return; 
            
            let isSelectable = !b.isActionDone; 
            if (extraData && extraData.allowDone) isSelectable = true; 
            if (['appoint','employ_target','appoint_gunshi','rumor_target_busho','headhunt_target','interview','interview_target','reward','view_only','war_general', 'kunishu_war_general', 'all_busho_list'].includes(actionType)) isSelectable = true;
            if (actionType === 'def_intercept_deploy' || actionType === 'def_reinf_deploy' || actionType === 'atk_reinf_deploy') isSelectable = true;
            
            let acc = null; if (isEnemyTarget && targetCastle) acc = targetCastle.investigatedAccuracy;
            const getStat = (stat) => GameSystem.getDisplayStatHTML(b, stat, gunshi, acc, this.game.playerClanId, myDaimyo);

            const div = document.createElement('div'); div.className = `select-item ${!isSelectable ? 'disabled' : ''}`;
            const inputType = isMulti ? 'checkbox' : 'radio';
            
            let inputHtml = '';
            if (!isViewMode) {
                inputHtml = `<input type="${inputType}" name="sel_busho" value="${b.id}" ${!isSelectable ? 'disabled' : ''} style="display:none;">`;
            }
            
            div.innerHTML = `<span class="col-act">${inputHtml}${b.isActionDone?'[済]':'[未]'}</span><span class="col-name">${b.name}</span><span class="col-rank">${b.getRankName()}</span><span class="col-stat">${getStat('leadership')}</span><span class="col-stat">${getStat('strength')}</span><span class="col-stat">${getStat('politics')}</span><span class="col-stat">${getStat('diplomacy')}</span><span class="col-stat">${getStat('intelligence')}</span><span class="col-stat">${getStat('charm')}</span>`;
            
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
                             const maxSelect = (actionType === 'war_deploy' || actionType === 'def_intercept_deploy' || actionType === 'def_reinf_deploy' || actionType === 'atk_reinf_deploy') ? 5 : 999;
                             const currentChecked = this.selectorList.querySelectorAll('input[name="sel_busho"]:checked').length;
                             if(e.target.checked && currentChecked > maxSelect) {
                                 e.target.checked = false;
                                 this.showDialog(`出陣できる武将は最大${maxSelect}名までです。`, false);
                                 return;
                             }

                             // ★ ここから追加：金や兵糧のオーバーチェック（チェックボックスを直接押した時）
                             if (e.target.checked) {
                                 // spec.costGold は1人あたりの必要な金、c.gold は城の今の貯金です
                                 if (spec.costGold > 0 && currentChecked * spec.costGold > c.gold) {
                                     e.target.checked = false; // 無理なのでチェックを外します
                                     this.showDialog(`金が足りないため、これ以上選べません。`, false);
                                     return;
                                 }
                                 if (spec.costRice > 0 && currentChecked * spec.costRice > c.rice) {
                                     e.target.checked = false; // 無理なのでチェックを外します
                                     this.showDialog(`兵糧が足りないため、これ以上選べません。`, false);
                                     return;
                                 }
                             }
                             // ★ 追加ここまで
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
                             const maxSelect = (actionType === 'war_deploy' || actionType === 'def_intercept_deploy' || actionType === 'def_reinf_deploy') ? 5 : 999;
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
                             // ★ 追加ここまで

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
        if (!this.bushoDetailModal || !this.bushoDetailBody) return;

        let faceHtml = "";
        if (busho.faceIcon) {
            faceHtml = `<img src="data/images/faceicons/${busho.faceIcon}" style="width: 100px; height: 100px; object-fit: cover; border: 2px solid #333; border-radius: 4px; background: #eee;" onerror="this.src='data/images/faceicons/unknown_face.webp'">`;
        }

        let affiliationName = "なし";
        let isFamily = false; // ★一門かどうかを判定する箱
        
        if (busho.belongKunishuId > 0) {
            let kunishu = null;
            if (this.game.kunishuSystem && typeof this.game.kunishuSystem.getKunishu === 'function') {
                kunishu = this.game.kunishuSystem.getKunishu(busho.belongKunishuId);
            } else if (this.game.kunishus) {
                kunishu = this.game.kunishus.find(k => k.id === busho.belongKunishuId);
            }
            
            if (kunishu) {
                affiliationName = kunishu.getName(this.game);
                
                // ★頭領を探して、一門かどうかチェック！
                const leader = this.game.getBusho(kunishu.leaderId);
                // 自分が頭領ではなく、頭領が存在する場合
                if (leader && busho.id !== leader.id) {
                    if (busho.familyIds && leader.familyIds) {
                        // お互いの家族リストに共通のIDがあるか確認します
                        isFamily = busho.familyIds.some(id => leader.familyIds.includes(id));
                    }
                }
            } else {
                affiliationName = "諸勢力";
            }
            
        } else if (busho.clan > 0) {
            const clan = this.game.clans.find(c => c.id === busho.clan);
            if (clan) {
                affiliationName = clan.name;
                
                // ★大名を探して、一門かどうかチェック！
                const daimyo = this.game.getBusho(clan.leaderId); 
                // 自分が大名ではなく、大名が存在する場合
                if (daimyo && busho.id !== daimyo.id && !busho.isDaimyo) {
                    if (busho.familyIds && daimyo.familyIds) {
                        isFamily = busho.familyIds.some(id => daimyo.familyIds.includes(id));
                    }
                }
            }
        }

        let familyBadge = "";
        if (isFamily) {
            // ★深紅の背景に白文字、枠線なしでスッキリと馴染むデザインにしました
            familyBadge = `<span style="font-size: 0.8rem; background: #8b0000; color: #ffffff; padding: 2px 6px; border-radius: 4px; margin-left: 10px; box-shadow: 1px 1px 2px rgba(0,0,0,0.3);">一門</span>`;
        }

        const castle = this.game.getCastle(busho.castleId);
        const castleName = castle ? castle.name : "不明";

        const age = this.game.year - busho.birthYear;

        let rankName = "";
        try {
            if (busho.courtRankIds && this.game.courtRankSystem) {
                let ids = busho.courtRankIds;
                
                if (typeof ids === 'string') {
                    ids = ids.split(',').map(id => Number(id));
                }

                if (Array.isArray(ids)) {
                    let highestRank = null;
                    ids.forEach(id => {
                        let rank = null;
                        if (typeof this.game.courtRankSystem.getRank === 'function') {
                            rank = this.game.courtRankSystem.getRank(id);
                        } else if (this.game.courtRankSystem.ranks) {
                            if (Array.isArray(this.game.courtRankSystem.ranks)) {
                                rank = this.game.courtRankSystem.ranks.find(r => r.id === id);
                            } else {
                                rank = this.game.courtRankSystem.ranks[id];
                            }
                        }

                        if (rank) {
                            if (!highestRank || rank.rankNo < highestRank.rankNo) {
                                highestRank = rank;
                            }
                        }
                    });
                    
                    if (highestRank) {
                        let displayName = highestRank.rankName2 || highestRank.rankName1 || "";
                        if (displayName) {
                            // ★親要素で上下を揃えるので、vertical-alignは外してスッキリさせました
                            rankName = `<span style="font-size: 0.9rem; background: #d4af37; color: #fff; padding: 2px 6px; border-radius: 4px; margin-left: 10px;">${displayName}</span>`;
                        }
                    }
                }
            }
        } catch (error) {
            console.log("官位エラー回避", error);
            rankName = "";
        }

        const gunshi = this.game.getClanGunshi(this.game.playerClanId);
        const myDaimyo = this.game.bushos.find(b => b.clan === this.game.playerClanId && b.isDaimyo);
        
        let acc = null;
        if (busho.clan !== this.game.playerClanId && busho.clan !== 0) {
            if (castle) acc = castle.investigatedAccuracy;
        }

        const getStat = (stat) => GameSystem.getDisplayStatHTML(busho, stat, gunshi, acc, this.game.playerClanId, myDaimyo);

        this.bushoDetailBody.innerHTML = `
            <div style="display: flex; gap: 20px; align-items: flex-start; margin-bottom: 20px;">
                <div style="flex-shrink: 0;">${faceHtml}</div>
                <div style="flex: 1;">
                    <div style="display: flex; align-items: center; font-size: 1.3rem; font-weight: bold; margin-bottom: 10px; border-bottom: 2px solid #ccc; padding-bottom: 5px;">
                        <span>${busho.name}</span>${rankName}
                    </div>
                    
                    <div style="display: grid; grid-template-columns: 80px 1fr; gap: 5px; font-size: 0.95rem;">
                        <div style="color: #666; display: flex; align-items: center;">所属</div>
                        <div style="font-weight: bold; display: flex; align-items: center;">${affiliationName}${familyBadge}</div>
                        
                        <div style="color: #666; display: flex; align-items: center;">所在城</div>
                        <div style="font-weight: bold; display: flex; align-items: center;">${castleName}</div>
                        
                        <div style="color: #666; display: flex; align-items: center;">身分</div>
                        <div style="font-weight: bold; display: flex; align-items: center;">${busho.getRankName()}</div>
                        
                        <div style="color: #666; display: flex; align-items: center;">年齢</div>
                        <div style="font-weight: bold; display: flex; align-items: center;">${age}歳</div>
                    </div>
                </div>
            </div>
            <div style="background: #f9f9f9; padding: 15px; border-radius: 8px; border: 1px solid #ddd;">
                <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; text-align: center;">
                    <div><div style="font-size: 0.8rem; color: #666;">統率</div><div style="font-size: 1.2rem; font-weight: bold;">${getStat('leadership')}</div></div>
                    <div><div style="font-size: 0.8rem; color: #666;">武勇</div><div style="font-size: 1.2rem; font-weight: bold;">${getStat('strength')}</div></div>
                    <div><div style="font-size: 0.8rem; color: #666;">政務</div><div style="font-size: 1.2rem; font-weight: bold;">${getStat('politics')}</div></div>
                    <div><div style="font-size: 0.8rem; color: #666;">外交</div><div style="font-size: 1.2rem; font-weight: bold;">${getStat('diplomacy')}</div></div>
                    <div><div style="font-size: 0.8rem; color: #666;">智謀</div><div style="font-size: 1.2rem; font-weight: bold;">${getStat('intelligence')}</div></div>
                    <div><div style="font-size: 0.8rem; color: #666;">魅力</div><div style="font-size: 1.2rem; font-weight: bold;">${getStat('charm')}</div></div>
                </div>
            </div>
        `;

        this.bushoDetailModal.classList.remove('hidden');
    }

    showUnitDivideModal(bushos, totalSoldiers, totalHorses, totalGuns, onConfirm, onCancel = null) {
        const modal = document.getElementById('unit-divide-modal');
        const listEl = document.getElementById('divide-list');
        const confirmBtn = document.getElementById('divide-confirm-btn');
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
    }

    openQuantitySelector(type, data, targetId, extraData = null) {
        if (!this.quantityModal) return;
        this.hideAIGuardTemporarily(); // ★これを追加します！
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
                checkValidQuantity(); 
            };

            wrap.querySelector(`#btn-min-${id}`).onclick = () => setVal(minVal);
            wrap.querySelector(`#btn-half-${id}`).onclick = () => {
                let actualMax = parseInt(range.max);
                setVal(Math.floor((minVal + actualMax) / 2));
            };
            wrap.querySelector(`#btn-max-${id}`).onclick = () => setVal(parseInt(range.max));

            range.oninput = () => { num.value = range.value; checkValidQuantity(); }; 

            num.oninput = () => {
                let actualMax = parseInt(range.max);
                let v = parseInt(num.value);
                if (isNaN(v)) return; 
                if (v < minVal) v = minVal;
                if (v > actualMax) v = actualMax;
                if (num.value != v) num.value = v; 
                range.value = v; 
                checkValidQuantity(); 
            };
            
            num.onblur = () => {
                if (num.value === "" || isNaN(parseInt(num.value))) {
                    num.value = minVal;
                    range.value = minVal;
                }
                checkValidQuantity(); 
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
        } else if (type === 'tribute_gold') {
            // ★追加：献上金のスライダーです
            document.getElementById('quantity-title').textContent = "献上金 (最大1500)"; 
            const maxTributeGold = Math.min(1500, c.gold); // 最大1500までの制限をかけます
            inputs.gold = createSlider("金", "gold", maxTributeGold, 0);
        } else if (type === 'war_supplies') {
            document.getElementById('quantity-title').textContent = "出陣兵数・兵糧・兵器指定"; 
            inputs.soldiers = createSlider("兵士数", "soldiers", c.soldiers, c.soldiers);
            inputs.rice = createSlider("持参兵糧", "rice", c.rice, c.rice);
            inputs.horses = createSlider("持参騎馬", "horses", c.horses, 0);
            inputs.guns = createSlider("持参鉄砲", "guns", c.guns, 0);
        } else if (type === 'def_intercept') { 
            const interceptCastle = (data && data.length > 0) ? data[0] : c;
            document.getElementById('quantity-title').textContent = "迎撃部隊編成"; 
            inputs.soldiers = createSlider("出陣兵士数", "soldiers", interceptCastle.soldiers, interceptCastle.soldiers);
            inputs.rice = createSlider("持参兵糧", "rice", interceptCastle.rice, interceptCastle.rice);
            inputs.horses = createSlider("持参騎馬", "horses", interceptCastle.horses || 0, 0);
            inputs.guns = createSlider("持参鉄砲", "guns", interceptCastle.guns || 0, 0);
        } else if (type === 'def_reinf_supplies' || type === 'atk_reinf_supplies' || type === 'def_self_reinf_supplies' || type === 'atk_self_reinf_supplies') { 
            const helperCastle = (data && data.length > 0) ? data[0] : c;
            let titleText = "";
            if (type === 'def_reinf_supplies') titleText = "守備援軍の部隊編成";
            else if (type === 'atk_reinf_supplies') titleText = "攻撃援軍の部隊編成";
            else if (type === 'def_self_reinf_supplies') titleText = "守備自軍援軍の部隊編成";
            else if (type === 'atk_self_reinf_supplies') titleText = "攻撃自軍援軍の部隊編成";
            document.getElementById('quantity-title').textContent = titleText;
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
            const price = parseInt(window.MainParams.Economy.PriceAmmo, 10) || 1;
            const maxBuy = price > 0 ? Math.floor(c.gold / price) : 0;
            this.tradeTypeInfo.classList.remove('hidden'); 
            this.tradeTypeInfo.textContent = `固定価格: 金${price} / 1個`;
            inputs.amount = createSlider("購入量", "amount", maxBuy, 0);
        } else if (type === 'buy_horses') {
            document.getElementById('quantity-title').textContent = "騎馬購入"; 
            const price = parseInt(window.MainParams.Economy.PriceHorse, 10) || 5;
            const maxBuy = price > 0 ? Math.floor(c.gold / price) : 0;
            this.tradeTypeInfo.classList.remove('hidden'); 
            this.tradeTypeInfo.textContent = `固定価格: 金${price} / 1頭`;
            inputs.amount = createSlider("購入量", "amount", maxBuy, 0);
        } else if (type === 'buy_guns') {
            document.getElementById('quantity-title').textContent = "鉄砲購入"; 
            const price = parseInt(window.MainParams.Economy.PriceGun, 10) || 50;
            const maxBuy = price > 0 ? Math.floor(c.gold / price) : 0;
            this.tradeTypeInfo.classList.remove('hidden'); 
            this.tradeTypeInfo.textContent = `固定価格: 金${price} / 1挺`;
            inputs.amount = createSlider("購入量", "amount", maxBuy, 0);
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
    
    showKunishuSelector(kunishus, onSelect, onCancel, isViewOnly = false) {
        if (!this.selectorModal) return;
        this.selectorModal.classList.remove('hidden');
        
        const title = document.getElementById('selector-title');
        if (title) title.textContent = isViewOnly ? "諸勢力一覧" : "対象の諸勢力を選択";

        const backBtn = document.querySelector('#selector-modal .btn-secondary');
        if(backBtn) {
            backBtn.onclick = () => {
                const listHeader = document.querySelector('#selector-modal .list-header');
                if (listHeader) listHeader.style.display = ''; 
                this.closeSelector();
                if (onCancel) onCancel(); 
            };
        }

        const contextEl = document.getElementById('selector-context-info');
        if (contextEl) {
            contextEl.innerHTML = isViewOnly ? "<div>この城に存在する諸勢力です</div>" : "<div>対象とする諸勢力を選択してください</div>";
            contextEl.classList.remove('hidden');
        }

        const listHeader = document.querySelector('#selector-modal .list-header');
        if (listHeader) listHeader.style.display = 'none';

        let selectedKunishuId = null; 

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
                const relVal = k.getRelation(window.GameApp.playerClanId);
                
                const relPercent = Math.min(100, Math.max(0, Number(relVal) || 0));
                const friendBarHtml = `<div class="bar-bg bar-bg-friend"><div class="bar-fill bar-fill-friend" style="width:${relPercent}%;"></div></div>`;

                const div = document.createElement('div');
                div.className = 'kunishu-list-item'; 
                
                if (isViewOnly) {
                    div.innerHTML = `<strong class="col-kunishu-name">${name}</strong><span>${k.soldiers}</span><span>${k.defense}</span><span>${friendBarHtml}</span>`;
                    div.style.cursor = 'default';
                } else {
                    div.innerHTML = `<span></span><strong class="col-kunishu-name">${name}</strong><span>${k.soldiers}</span><span>${k.defense}</span><span>${friendBarHtml}</span>`;
                    div.style.cursor = 'pointer';
                    
                    div.onclick = () => {
                        if (window.AudioManager) window.AudioManager.playSE('choice.ogg');
                        
                        const allItems = this.selectorList.querySelectorAll('.kunishu-list-item');
                        allItems.forEach(item => {
                            item.classList.remove('selected');
                        });
                        
                        div.classList.add('selected');
                        selectedKunishuId = k.id;
                        
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
                this.selectorConfirmBtn.classList.add('hidden');
            } else {
                this.selectorConfirmBtn.classList.remove('hidden');
                this.selectorConfirmBtn.disabled = true;
                this.selectorConfirmBtn.style.opacity = 0.5;

                this.selectorConfirmBtn.onclick = () => {
                    if (selectedKunishuId !== null) {
                        if (listHeader) listHeader.style.display = ''; 
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

    addWarDetailLog(msg) {
        if(this.game.warManager && this.game.warManager.state.active && this.game.warManager.state.isPlayerInvolved && this.warLog) {
             const div = document.createElement('div');
             div.innerHTML = msg;
             this.warLog.appendChild(div);
             this.warLog.scrollTop = this.warLog.scrollHeight;
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
                // ★書き換え：もし画像が見つからなかったら、のっぺらぼうを表示します
                el.onerror = () => { el.src = 'data/images/faceicons/unknown_face.webp'; }; 
            } else {
                // ★書き換え：武将がいない時や画像が設定されていない時は、のっぺらぼうを表示します
                el.src = 'data/images/faceicons/unknown_face.webp';
                el.classList.remove('hidden');
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

        const atkClan = this.game.clans.find(c => c.id === s.attacker.ownerClan);
        const atkName = s.attacker.isKunishu ? s.attacker.name : (atkClan ? atkClan.name : "野武士");
        setTxt('war-atk-name', atkName);
        
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
        
        const defClan = this.game.clans.find(c => c.id === s.defender.ownerClan);
        const defNameText = s.defender.isKunishu ? s.defender.name : (defClan ? defClan.name : "野武士");
        setTxt('war-def-name', defNameText);
        
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
        
        const amIAttacker = (Number(s.attacker.ownerClan) === pid);
        const amIDefender = (Number(s.defender.ownerClan) === pid);
        
        const isMyTurn = (isAtkTurn && amIAttacker) || (!isAtkTurn && amIDefender);
        
        let options = [];
        if (amIAttacker || (isAtkTurn && !amIDefender)) {
            options = [
                { label: "突撃", type: "charge" }, { label: "斉射", type: "bow" }, { label: "城攻め", type: "siege" },
                { label: "火計", type: "fire" }, { label: "謀略", type: "scheme" }, { label: "撤退", type: "retreat" }
            ];
        } else {
            options = [
                { label: "突撃", type: "def_charge" }, { label: "斉射", type: "def_bow" }, { label: "籠城", type: "def_attack" },
                { label: "謀略", type: "scheme" }, { label: "補修", type: "repair_setup" }
            ];
            if (this.game.castles.some(c => c.ownerClan === s.defender.ownerClan && c.id !== s.defender.id && GameSystem.isReachable(this.game, s.defender, c, s.defender.ownerClan))) {
                options.push({ label: "撤退", type: "retreat" });
            }
        }

        this.warControls.innerHTML = '';
        options.forEach(cmd => {
            const btn = document.createElement('button');
            btn.textContent = cmd.label;
            btn.onclick = () => {
                if(isMyTurn) this.game.warManager.execWarCmd(cmd.type);
            };
            this.warControls.appendChild(btn);
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
                    if (window.AudioManager) window.AudioManager.playSE('choice.ogg');
                    
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
                
                let hireBtnHtml = '';
                if (p.hasRefusedHire) {
                    hireBtnHtml = `<button class="btn-primary" disabled style="opacity:0.5; background-color: #666;">拒否</button>`;
                } else {
                    hireBtnHtml = `<button class="btn-primary" onclick="window.GameApp.warManager.handlePrisonerAction(${index}, 'hire')">登用</button>`;
                }
                
                div.innerHTML = `
                    <div style="flex:1;">
                        <strong>${p.name}</strong> (${p.getRankName()})<br>
                        統:${p.leadership} 武:${p.strength} 智:${p.intelligence}
                    </div>
                    <div style="display:flex; gap:5px;">
                        ${hireBtnHtml}
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
    
    showDaimyoPrisonerModal(prisoner) {
        this.hideAIGuardTemporarily();
        
        let hireBtnHtml = '';
        if (prisoner.hasRefusedHire) {
            hireBtnHtml = `<button class="btn-primary" disabled style="opacity:0.5; background-color: #666;">拒否</button>`;
        } else {
            hireBtnHtml = `<button class="btn-primary" onclick="window.GameApp.warManager.handleDaimyoPrisonerAction('hire')">登用</button>`;
        }

        const content = `
            <div style="text-align:center; padding: 10px;">
                <h3 style="margin-top:0;">敵大名 捕縛！</h3>
                <p style="font-size:1.1rem;">敵大名・<strong>${prisoner.name}</strong>を捕縛しました。<br>処遇を決めてください。</p>
                <div style="margin-top:20px; display:flex; justify-content:center; gap:10px;">
                    ${hireBtnHtml}
                    <button class="btn-secondary" onclick="window.GameApp.warManager.handleDaimyoPrisonerAction('release')">解放</button>
                    <button class="btn-danger" onclick="window.GameApp.warManager.handleDaimyoPrisonerAction('kill')">処断</button>
                </div>
            </div>
        `;
        this.showResultModal(content, null, ""); 
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
    
    // ★ ここからまるごと追加！：設定画面を開いて、スライダーを動かせるようにする魔法です！
    showSettingsModal() {
        const modal = document.getElementById('settings-modal');
        const bgmSlider = document.getElementById('setting-bgm-volume');
        const bgmText = document.getElementById('setting-bgm-text');
        const seSlider = document.getElementById('setting-se-volume');
        const seText = document.getElementById('setting-se-text');

        if (!modal || !bgmSlider || !seSlider) return;

        // 今の音量（1.0なら100%）をスライダーにセットします
        if (window.AudioManager) {
            bgmSlider.value = Math.round(window.AudioManager.userBgmVolume * 100);
            bgmText.textContent = bgmSlider.value + '%';
            
            seSlider.value = Math.round(window.AudioManager.userSeVolume * 100);
            seText.textContent = seSlider.value + '%';
        }

        // BGMのスライダーを動かしたときの処理
        bgmSlider.oninput = (e) => {
            const val = e.target.value;
            bgmText.textContent = val + '%';
            if (window.AudioManager) {
                // 100を1.0に直して渡します
                window.AudioManager.setBgmVolume(val / 100); 
            }
        };

        // SEのスライダーを動かしたときの処理
        seSlider.oninput = (e) => {
            const val = e.target.value;
            seText.textContent = val + '%';
            if (window.AudioManager) {
                window.AudioManager.setSeVolume(val / 100);
            }
        };
        
        // つまみを離したときに「ピロッ」と鳴らして音量を確認できるようにします
        seSlider.onchange = () => {
             if (window.AudioManager) window.AudioManager.playSE('choice.ogg');
        };

        modal.classList.remove('hidden');
    }
}

// ★ここから下を、ui.jsのファイルのいちばん下に貼り付けてください！
Object.assign(UIManager.prototype, {
    showForceSelector(forces, onSelect, onCancel) {
        const modal = document.getElementById('selector-modal');
        const list = document.getElementById('selector-list');
        const contextInfo = document.getElementById('selector-context-info');
        const confirmBtn = document.getElementById('selector-confirm-btn');
        
        if (!modal || !list || !contextInfo) return;
        
        contextInfo.innerHTML = "<div>援軍を要請する勢力を選択してください</div>";
        list.innerHTML = "";
        
        let selectedForce = null;
        
        forces.forEach(force => {
            const item = document.createElement('div');
            item.className = 'list-item';
            
            item.innerHTML = `
                <div class="busho-info">
                    <div class="busho-name">${force.name}</div>
                    <div class="busho-stat">代表: ${force.leaderName}</div>
                    <div class="busho-stat">兵数: ${force.soldiers}</div>
                </div>
            `;
            
            item.onclick = () => {
                Array.from(list.children).forEach(c => c.classList.remove('selected'));
                item.classList.add('selected');
                selectedForce = force;
            };
            list.appendChild(item);
        });
        
        confirmBtn.onclick = () => {
            if (!selectedForce) {
                this.showDialog("勢力を選択してください", false);
                return;
            }
            modal.classList.add('hidden');
            onSelect(selectedForce);
        };
        
        // ★修正: 存在しない関数を呼んでエラーになっていた部分を正しいキャンセル処理に直しました
        const cancelBtn = document.getElementById('selector-cancel-btn');
        if (cancelBtn) {
            cancelBtn.onclick = () => {
                modal.classList.add('hidden');
                if (onCancel) onCancel();
            };
        }
        
        modal.classList.remove('hidden');
    }
});