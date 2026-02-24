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
                    const el = document.querySelector(`.castle-card[data-clan="${this.game.playerClanId}"]`); 
                    if(el) el.scrollIntoView({block:"center", behavior: "smooth"});
                } else {
                    const myCastle = this.game.getCurrentTurnCastle();
                    if (myCastle) {
                        this.showControlPanel(myCastle);
                        const el = document.querySelector(`.castle-card[data-clan="${this.game.playerClanId}"]`); 
                        if(el) el.scrollIntoView({block:"center", behavior: "smooth"});
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
        let listHtml = `<div style="text-align:left; padding: 10px; background: #fafafa; border: 1px solid #ccc; border-radius: 4px;">`;
        
        const activeClans = this.game.clans.filter(c => c.id !== 0 && this.game.castles.some(cs => cs.ownerClan === c.id));
        
        const clanDataList = activeClans.map(clan => {
            const castles = this.game.castles.filter(c => c.ownerClan === clan.id);
            const leader = this.game.getBusho(clan.leaderId);
            let pop = 0, sol = 0, koku = 0, gold = 0, rice = 0;
            castles.forEach(c => {
                pop += c.population;
                sol += c.soldiers;
                koku += c.kokudaka;
                gold += c.gold;
                rice += c.rice;
            });
            const power = Math.floor(pop / 2000) + Math.floor(sol / 20) + Math.floor(koku / 20) + Math.floor(gold / 50) + Math.floor(rice / 100);
            return {
                id: clan.id,
                name: clan.name,
                leaderName: leader ? leader.name : "不明",
                power: power,
                castlesCount: castles.length
            };
        });

        clanDataList.sort((a,b) => b.power - a.power);

        clanDataList.forEach(d => {
            listHtml += `<div style="border-bottom:1px dashed #bbb; padding:8px 0; cursor:pointer;" onclick="window.GameApp.ui.showFactionList(${d.id})" onmouseover="this.style.backgroundColor='#e3f2fd'" onmouseout="this.style.backgroundColor='transparent'">`;
            listHtml += `<div style="font-weight:bold; font-size:1.1rem;">${d.name} <span style="font-size:0.9rem; font-weight:normal;">(当主: ${d.leaderName})</span></div>`;
            listHtml += `<div style="color:#d32f2f; font-weight:bold; margin-top:3px;">戦力: ${d.power} <span style="font-size:0.8rem; color:#555; font-weight:normal;">(城数:${d.castlesCount})</span></div>`;
            listHtml += `</div>`;
        });
        listHtml += `</div>`;
        
        this.showResultModal(`<h3 style="margin-top:0;">大名一覧</h3>${listHtml}`);
    }

    showFactionList(clanId) {
        const clan = this.game.clans.find(c => c.id === clanId);
        if (!clan) return;

        const bushos = this.game.bushos.filter(b => b.clan === clanId && b.status === 'active');
        const factions = {};
        
        bushos.forEach(b => {
            const fId = b.factionId;
            if (!factions[fId]) {
                factions[fId] = {
                    count: 0,
                    leader: null
                };
            }
            factions[fId].count++;
            if (b.isFactionLeader) {
                factions[fId].leader = b;
            }
        });

        let listHtml = `<div style="text-align:left; padding: 10px; background: #fafafa; border: 1px solid #ccc; border-radius: 4px;">`;
        
        const fIds = Object.keys(factions).map(Number).filter(id => id !== 0);
        
        if (fIds.length === 0) {
            listHtml += `<div style="padding:8px 0;">派閥はありません。</div>`;
        } else {
            fIds.forEach(fId => {
                const fData = factions[fId];
                let factionName = "不明派閥";
                if (fData.leader) {
                    const fullName = fData.leader.name.replace(/\|/g, '');
                    factionName = `${fullName}派閥`;
                }
                listHtml += `<div style="border-bottom:1px dashed #bbb; padding:8px 0;">`;
                listHtml += `<div style="font-weight:bold; font-size:1.1rem;">${factionName}</div>`;
                listHtml += `<div style="margin-top:3px;">所属人数: ${fData.count}名</div>`;
                listHtml += `</div>`;
            });
        }
        
        if (factions[0] && factions[0].count > 0) {
            listHtml += `<div style="padding:8px 0;">`;
            listHtml += `<div style="font-weight:bold; font-size:1.1rem;">無派閥</div>`;
            listHtml += `<div style="margin-top:3px;">所属人数: ${factions[0].count}名</div>`;
            listHtml += `</div>`;
        }
        
        listHtml += `</div>`;

        const customFooter = `<button class="btn-secondary" onclick="window.GameApp.ui.showDaimyoList()">戻る</button>`;
        this.showResultModal(`<h3 style="margin-top:0;">${clan.name} 派閥一覧</h3>${listHtml}`, null, customFooter);
    }

    showResultModal(msg, onClose = null, customFooterHtml = null) { 
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
    
    closeSelector() { if (this.selectorModal) this.selectorModal.classList.add('hidden'); }

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
        let minScale = Math.min(scaleX, scaleY) * 0.9; 
        if (minScale > 0.8) minScale = 0.5;

        this.zoomStages = [
            minScale,              
            (minScale + 1.0) / 2,  
            1.0                    
        ];
        this.zoomLevel = 1; 
        this.mapScale = this.zoomStages[this.zoomLevel];
        
        this.applyMapScale();
        this.updateZoomButtons(); 
    }

    applyMapScale() {
        if(this.mapEl) {
            this.mapEl.style.transform = `scale(${this.mapScale})`;
        }
    }
    
    changeMapZoom(delta) {
        this.zoomLevel += delta;
        if (this.zoomLevel < 0) this.zoomLevel = 0;
        if (this.zoomLevel > 2) this.zoomLevel = 2;
        
        this.mapScale = this.zoomStages[this.zoomLevel];
        this.applyMapScale();
        this.updateZoomButtons();
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

						if (this.mapScale < 0.8) {
						    this.zoomLevel = 2;
						    this.mapScale = this.zoomStages[this.zoomLevel];
						    this.applyMapScale();
						    this.updateZoomButtons(); 
						    el.scrollIntoView({block: "center", inline: "center", behavior: "smooth"});
						} else {
                            if (this.currentCastle && this.currentCastle.id === c.id) {
                                this.showCastleMenuModal(c);
                            } else {
                                this.showControlPanel(c);
                            }
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
            
            if (area === mobileArea) {
                 const btn = document.createElement('button');
                 btn.className = 'cmd-btn back';
                 btn.textContent = "自拠点へ戻る";
                 btn.onclick = () => {
                     if(this.game.isProcessingAI) return;
                     const myCastle = this.game.getCurrentTurnCastle();
                     this.showControlPanel(myCastle);
                     const el = document.querySelector(`.castle-card[data-clan="${this.game.playerClanId}"]`); 
                     if(el) el.scrollIntoView({block:"center"});
                 };
                 area.appendChild(btn);
            }
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
            backBtn.onclick = () => {
                this.closeSelector();
                if (onBack) {
                    onBack(); 
                }
            };
        }

        if (this.selectorList) this.selectorList.innerHTML = '';
        const contextEl = document.getElementById('selector-context-info'); if(contextEl) contextEl.classList.remove('hidden'); 
        const c = this.currentCastle; 
        let infoHtml = ""; 
        let bushos = []; 
        
        const baseType = actionType.replace('_deploy', ''); 
        const spec = this.game.commandSystem.getSpecs()[baseType] || this.game.commandSystem.getSpecs()[actionType] || {};
    
        let sortKey = spec.sortKey || 'strength';
        let isMulti = spec.isMulti || false;
        
        if (actionType === 'def_intercept_deploy') {
             isMulti = true;
             sortKey = 'strength';
        }

        if (document.getElementById('selector-title')) {
            document.getElementById('selector-title').textContent = isMulti ? "武将を選択（複数可）" : "武将を選択"; 
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
        else if (actionType === 'war_general') {
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
            bushos = this.game.getCastleBushos(c.id).filter(b => b.status !== 'ronin');
            infoHtml = "<div>迎撃に出陣する武将を選択してください（最大5名まで）</div>";
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

        bushos.forEach(b => {
            if (actionType === 'banish' && b.isCastellan) return; 
            if (actionType === 'employ_target' && b.isDaimyo) return;
            if (actionType === 'reward' && b.isDaimyo) return; 
            
            let isSelectable = !b.isActionDone; 
            if (extraData && extraData.allowDone) isSelectable = true; 
            if (['employ_target','appoint_gunshi','rumor_target_busho','headhunt_target','interview_target','reward','view_only','war_general'].includes(actionType)) isSelectable = true;
            if (actionType === 'def_intercept_deploy') isSelectable = true;
            
            let acc = null; if (isEnemyTarget && targetCastle) acc = targetCastle.investigatedAccuracy;
            const getStat = (stat) => GameSystem.getDisplayStatHTML(b, stat, gunshi, acc, this.game.playerClanId, myDaimyo);

            const div = document.createElement('div'); div.className = `select-item ${!isSelectable ? 'disabled' : ''}`;
            const inputType = isMulti ? 'checkbox' : 'radio';
            
            const inputHtml = actionType === 'view_only' ? '' : `<input type="${inputType}" name="sel_busho" value="${b.id}" ${!isSelectable ? 'disabled' : ''} style="grid-column:1;">`;
            
            div.innerHTML = `${inputHtml}<span class="col-act" style="grid-column:2;">${b.isActionDone?'[済]':'[未]'}</span><span class="col-name" style="grid-column:3;">${b.name}</span><span class="col-rank" style="grid-column:4;">${b.getRankName()}</span><span class="col-stat" style="grid-column:5;">${getStat('leadership')}</span><span class="col-stat" style="grid-column:6;">${getStat('strength')}</span><span class="col-stat" style="grid-column:7;">${getStat('politics')}</span><span class="col-stat" style="grid-column:8;">${getStat('diplomacy')}</span><span class="col-stat" style="grid-column:9;">${getStat('intelligence')}</span><span class="col-stat" style="grid-column:10;">${getStat('charm')}</span>`;
            
            if(isSelectable && actionType !== 'view_only') { 
                div.onclick = (e) => { 
                    if(e.target.tagName === 'INPUT') { 
                        if(!isMulti) {
                            const siblings = this.selectorList.querySelectorAll('.select-item');
                            siblings.forEach(el => el.classList.remove('selected'));
                        } else {
                             const maxSelect = (actionType === 'war_deploy' || actionType === 'def_intercept_deploy') ? 5 : 999;
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
                        return;
                    } 
                    const input = div.querySelector('input');
                    if(input) {
                        if (isMulti) { 
                             const maxSelect = (actionType === 'war_deploy' || actionType === 'def_intercept_deploy') ? 5 : 999;
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
                    }
                }; 
            }
            this.selectorList.appendChild(div);
        });
        if (bushos.length === 0 && this.selectorList) this.selectorList.innerHTML = "<div style='padding:10px;'>対象となる武将がいません</div>";

        if (this.selectorConfirmBtn) {
            if (actionType === 'view_only') {
                this.selectorConfirmBtn.classList.add('hidden'); 
            } else {
                this.selectorConfirmBtn.classList.remove('hidden');
                this.selectorConfirmBtn.onclick = () => {
                    const inputs = document.querySelectorAll('input[name="sel_busho"]:checked'); if (inputs.length === 0) return;
                    const selectedIds = Array.from(inputs).map(i => parseInt(i.value)); 
                    this.closeSelector();
                    if (actionType === 'def_intercept_deploy' && extraData && extraData.onConfirm) {
                        extraData.onConfirm(selectedIds);
                    } else {
                        this.game.commandSystem.handleBushoSelection(actionType, selectedIds, targetId, extraData);
                    }
                };
            }
        }
    }
    
    // ★ 修正: 兵科（足軽・騎馬・鉄砲）の選択UIと、持参した兵器（騎馬・鉄砲）の数による制限ロジックを追加
    showUnitDivideModal(bushos, totalSoldiers, totalHorses, totalGuns, onConfirm) {
        const modal = document.getElementById('unit-divide-modal');
        const listEl = document.getElementById('divide-list');
        const confirmBtn = document.getElementById('divide-confirm-btn');
        const remainEl = document.getElementById('divide-remain-soldiers');
        const totalEl = document.getElementById('divide-total-soldiers');
        
        if (!modal || !listEl) return;
        
        // フォールバック処理（旧呼び出し用）
        if (typeof totalHorses === 'function') {
            onConfirm = totalHorses;
            totalHorses = 0;
            totalGuns = 0;
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

            // UIへの反映と再計算
            currentData.forEach(d => {
                const range = document.getElementById(`div-range-${d.id}`);
                const num = document.getElementById(`div-num-${d.id}`);
                if (range && num && parseInt(num.value) !== d.count) {
                    num.value = d.count;
                    range.value = d.count;
                }
                sum += d.count;
                if (d.type === 'kiba') usedHorses += d.count;
                if (d.type === 'teppo') usedGuns += d.count;
            });
            
            const rem = totalSoldiers - sum;
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
            `;
            listEl.appendChild(div);
            
            const range = div.querySelector(`#div-range-${b.id}`);
            const num = div.querySelector(`#div-num-${b.id}`);
            const typeSel = div.querySelector(`#div-type-${b.id}`);
            
            const onInput = (val) => {
                let v = parseInt(val) || 0;
                
                let otherSum = 0;
                listEl.querySelectorAll('input[type="number"]').forEach(inp => {
                    if (inp.id !== `div-num-${b.id}`) otherSum += parseInt(inp.value) || 0;
                });
                
                let maxAllowed = Math.max(1, totalSoldiers - otherSum);
                if (v > maxAllowed) v = maxAllowed;
                if (v < 1) v = 1;
                
                range.value = v;
                num.value = v;
                updateRemain(b.id, 'num_change');
            };

            range.oninput = (e) => onInput(e.target.value);
            num.oninput = (e) => onInput(e.target.value);
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

        const createSlider = (label, id, max, currentVal) => { 
            const wrap = document.createElement('div'); 
            wrap.className = 'qty-row'; 
            wrap.innerHTML = `<label>${label} (Max: ${max})</label><div class="qty-control"><input type="range" id="range-${id}" min="0" max="${max}" value="${currentVal}"><input type="number" id="num-${id}" min="0" max="${max}" value="${currentVal}"></div>`; 
            const range = wrap.querySelector(`#range-${id}`); 
            const num = wrap.querySelector(`#num-${id}`); 

            range.oninput = () => num.value = range.value; 

            num.oninput = () => {
                let v = parseInt(num.value);
                if (isNaN(v)) return; 
                if (v < 0) v = 0;
                if (v > max) v = max;
                if (num.value != v) num.value = v; 
                range.value = v; 
            };
            
            num.onblur = () => {
                if (num.value === "" || isNaN(parseInt(num.value))) {
                    num.value = 0;
                    range.value = 0;
                }
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
            document.getElementById('quantity-title').textContent = "迎撃部隊編成"; 
            inputs.soldiers = createSlider("出陣兵士数", "soldiers", c.soldiers, c.soldiers);
            inputs.rice = createSlider("持参兵糧", "rice", c.rice, c.rice);
            inputs.horses = createSlider("持参騎馬", "horses", c.horses, 0);
            inputs.guns = createSlider("持参鉄砲", "guns", c.guns, 0);
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
        
        this.quantityConfirmBtn.onclick = () => {
            this.quantityModal.classList.add('hidden');
            if (type === 'def_intercept' && extraData && extraData.onConfirm) {
                extraData.onConfirm(inputs);
            } else {
                this.game.commandSystem.handleQuantitySelection(type, inputs, targetId, data, extraData);
            }
        };
    }
    
    showKunishuSelector(kunishus, onSelect, onCancel, isViewOnly = false) {
        if (!this.selectorModal) return;
        this.selectorModal.classList.remove('hidden');
        
        const title = document.getElementById('selector-title');
        if (title) title.textContent = isViewOnly ? "国人衆一覧" : "対象の国衆を選択";

        const listHeader = document.querySelector('#selector-modal .list-header');
        if (listHeader) listHeader.style.display = 'none';
        
        const backBtn = document.querySelector('#selector-modal .btn-secondary');
        if(backBtn) {
            backBtn.onclick = () => {
                if (listHeader) listHeader.style.display = '';
                this.closeSelector();
                if (onCancel) onCancel();
            };
        }

        const contextEl = document.getElementById('selector-context-info');
        if (contextEl) {
            contextEl.innerHTML = isViewOnly ? "<div>この城に存在する国人衆です</div>" : "<div>対象とする国衆を選択してください</div>";
            contextEl.classList.remove('hidden');
        }

        if (this.selectorList) {
            this.selectorList.innerHTML = '';
            kunishus.forEach(k => {
                const name = k.getName(window.GameApp);
                const rel = k.getRelation(window.GameApp.playerClanId);
                const div = document.createElement('div');
                div.className = 'kunishu-item'; 
                div.innerHTML = `<strong style="margin-right:10px;">${name}</strong> <span style="font-size:0.9rem; color:#555;">(兵数:${k.soldiers} 防御:${k.defense} 友好度:${rel})</span>`;
                
                if (isViewOnly) {
                    div.style.cursor = 'default';
                } else {
                    div.onclick = () => { 
                        if (listHeader) listHeader.style.display = '';
                        this.closeSelector();
                        if (onSelect) onSelect(k.id); 
                    };
                }
                this.selectorList.appendChild(div);
            });
        }
        
        if (this.selectorConfirmBtn) {
            this.selectorConfirmBtn.classList.add('hidden');
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

        setTxt('war-atk-name', s.attacker.name);
        setTxt('war-atk-busho', s.atkBushos[0].name);
        setTxt('war-atk-soldier', s.attacker.soldiers);
        setTxt('war-atk-morale', `${s.attacker.morale} (訓練:${s.attacker.training})`);
        setTxt('war-atk-rice', s.attacker.rice); 
        updateFace('war-atk-face', s.atkBushos[0]);
        
        setTxt('war-def-name', s.defender.name);
        setTxt('war-def-busho', s.defBusho.name);
        setTxt('war-def-soldier', s.defender.soldiers);
        setTxt('war-def-wall', `${s.defender.defense} (士:${s.defender.morale}/訓:${s.defender.training})`);
        setTxt('war-def-rice', s.defender.rice); 
        updateFace('war-def-face', s.defBusho);

        setTxt('war-round', s.round);
        
        const isAtkTurn = (s.turn === 'attacker');
        const actorName = isAtkTurn ? "攻撃側" : "守備側";
        setTxt('war-turn-actor', actorName);
    }

    renderWarControls(isAtkTurn) {
        if (!this.warControls) return;
        this.warControls.innerHTML = '';
        
        const commands = this.game.warManager.getAvailableCommands(isAtkTurn);

        if (commands.length === 0) {
            this.warControls.classList.add('disabled-area');
            return;
        } else {
            this.warControls.classList.remove('disabled-area');
        }

        commands.forEach(cmd => {
            const btn = document.createElement('button');
            btn.textContent = cmd.label;
            btn.onclick = () => this.game.warManager.execWarCmd(cmd.type);
            this.warControls.appendChild(btn);
        });
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
}