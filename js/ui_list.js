/**
 * ui_list.js
 * リストの表示を管理するファイルです
 */
class UIListManager {
    constructor(ui, game) {
        // 元のui.jsとgameの情報を覚えておきます
        this.ui = ui;
        this.game = game;
        this.closeCommonModal(); // 履歴や状態変数の初期化
    }
    
    // --- 共通モーダル（枠の使い回し）管理 ---
    closeCommonModal() {
        this._stableSortBases = {}; 

        this.modalHistory = [];
        this.currentModalInfo = null;
        if (this.ui && this.ui.selectorModal) this.ui.selectorModal.classList.add('hidden');
        
        // ★修正：「新居（list）」の記憶と「旧居（info）」の記憶、両方を空っぽにします
        const resetTargets = [this];
        if (this.ui && this.ui.info) resetTargets.push(this.ui.info);

        resetTargets.forEach(target => {
            // 武将一覧などで使う状態のリセット
            target.bushoCurrentTab = 'stats';
            target.bushoCurrentScope = 'clan';
            target.bushoCurrentSortKey = null;
            target.bushoIsSortAsc = false;
            target.bushoSavedBushos = null;
            target.bushoSavedSortedBushos = null;
            target.bushoLastSortStateKey = null;
            target.bushoLastScope = null;
            target.bushoSavedData = null;
            target.bushoSavedSelectedIds = [];
            
            // 外交リストのタブ状態リセット
            target.diploCurrentTab = 'daimyo';
            
            // 拠点一覧で使う状態のリセット
            target.currentKyotenTab = 'status';
            target.currentKyotenScope = 'clan';
            target.currentKyotenSortKey = null;
            target.isKyotenSortAsc = false;
            target.kyotenSavedCastles = null;
            target.kyotenSavedSortedCastles = null;
            target.kyotenLastSortStateKey = null;
            target.kyotenLastScope = null;
            
            target.princessCurrentScope = null;
            target.princessCurrentSortKey = null;
            target.isPrincessSortAsc = false;
            
            target.factionCurrentSortKey = null;
            target.isFactionSortAsc = false;

            // 所領分配のリセット
            target.allotFiefSelectedIds = null;
            target.allotFiefSavedState = false;
        });
    }

    // --- ソート状態の一元管理 ---
    _prepareStableSortBase(listId, baseArray, sortKey) {
        if (!this._stableSortBases) this._stableSortBases = {};
        if (!sortKey) {
            this._stableSortBases[listId] = null;
            return [...baseArray];
        }
        return this._stableSortBases[listId] ? [...this._stableSortBases[listId]] : [...baseArray];
    }

    _saveStableSortResult(listId, sortedArray) {
        if (!this._stableSortBases) this._stableSortBases = {};
        this._stableSortBases[listId] = sortedArray ? [...sortedArray] : null;
    }

    _toggleSortState(currentSortKey, currentIsAsc, clickedSortKey, defaultAscKeys) {
        if (currentSortKey === clickedSortKey) {
            const isDefaultAsc = defaultAscKeys.includes(clickedSortKey);
            if (currentIsAsc === isDefaultAsc) {
                return { key: clickedSortKey, isAsc: !currentIsAsc };
            } else {
                return { key: null, isAsc: false };
            }
        } else {
            return { key: clickedSortKey, isAsc: defaultAscKeys.includes(clickedSortKey) };
        }
    }

    pushModal(pageType, renderArgs) {
        if (!this.modalHistory) this.modalHistory = [];
        
        if (this.currentModalInfo) {
            const listEl = document.getElementById('selector-list');
            this.currentModalInfo.scrollPos = listEl ? listEl.scrollTop : 0;
            this.modalHistory.push(this.currentModalInfo);
        }
        
        this.currentModalInfo = { pageType, args: renderArgs, scrollPos: 0 };
        this._renderCurrentModal();
    }

    popModal() {
        if (!this.modalHistory || this.modalHistory.length === 0) {
            this.closeCommonModal();
            return;
        }
        this.currentModalInfo = this.modalHistory.pop();
        this._renderCurrentModal();
    }
    
    _renderCurrentModal() {
        const info = this.currentModalInfo;
        if (!info) return;

        const isInfoScreen = ['daimyo_detail', 'busho_detail', 'delegate_setting', 'kunishu_detail', 'castle_detail'].includes(info.pageType);

        const listWrapper = document.getElementById('selector-list-wrapper');
        const listContainer = document.getElementById('selector-list');
        
        if (listWrapper) {
            if (isInfoScreen) {
                listWrapper.classList.add('no-custom-scrollbar');
                if (listContainer) listContainer.style.overflow = 'hidden'; 
            } else {
                listWrapper.classList.remove('no-custom-scrollbar');
                if (listContainer) listContainer.style.overflow = '';
            }
        }

        const tabsEl = document.getElementById('selector-tabs');
        if (tabsEl) {
            if (isInfoScreen) {
                tabsEl.classList.add('hidden');
            } else {
                tabsEl.classList.remove('hidden');
                tabsEl.style.justifyContent = 'flex-start';
                tabsEl.style.paddingLeft = '10px';
                tabsEl.style.alignItems = 'flex-end';
                tabsEl.innerHTML = '<div style="display: flex; gap: 5px;"><button class="busho-tab-btn active" style="cursor: default; pointer-events: none;">基本</button></div>';
            }
        }
        
        // ★ここは一時的にすべて「ui.info」に橋渡ししておきます（今後少しずつ自分(this)に書き換えます）
        if (info.pageType === 'daimyo_list') this.ui.info._renderDaimyoList(...info.args, info.scrollPos);
        else if (info.pageType === 'daimyo_detail') this.ui.info._renderDaimyoDetail(...info.args, info.scrollPos);
        else if (info.pageType === 'busho_selector') this.ui.info._renderBushoSelector(...info.args, info.scrollPos);
        else if (info.pageType === 'busho_detail') this.ui.info._renderBushoDetail(...info.args, info.scrollPos);
        else if (info.pageType === 'kyoten_list') this.ui.info._renderKyotenList(...info.args, info.scrollPos);
        else if (info.pageType === 'diplo_list') this.ui.info._renderDiplomacyList(...info.args, info.scrollPos);
        else if (info.pageType === 'faction_list') this.ui.info._renderFactionList(...info.args, info.scrollPos);
        else if (info.pageType === 'princess_list') this.ui.info._renderPrincessList(...info.args, info.scrollPos);
        else if (info.pageType === 'delegate_list') this.ui.info._renderDelegateList(...info.args, info.scrollPos);
        else if (info.pageType === 'delegate_setting') this.ui.info._renderDelegateSetting(...info.args, info.scrollPos);
        else if (info.pageType === 'prisoner_selector') this.ui.info._renderPrisonerSelector(...info.args, info.scrollPos);
        else if (info.pageType === 'history_list') this.ui.info._renderHistoryList(...info.args, info.scrollPos);
        else if (info.pageType === 'kunishu_list') this.ui.info._renderKunishuList(...info.args, info.scrollPos);
        else if (info.pageType === 'kunishu_detail') this.ui.info._renderKunishuDetail(...info.args, info.scrollPos);
        else if (info.pageType === 'castle_detail') this.ui.info._renderCastleDetail(...info.args, info.scrollPos);
        else if (info.pageType === 'force_selector') this.ui.info._renderForceSelector(...info.args, info.scrollPos);
        else if (info.pageType === 'appoint_legion_castle') this.ui.info._renderAppointLegionCastle(...info.args, info.scrollPos);
        else if (info.pageType === 'allot_fief') this.ui.info._renderAllotFief(...info.args, info.scrollPos);
    }

    _createBarHtml(percent, type) {
        const safePercent = Math.min(100, Math.max(0, Number(percent) || 0));
        return `<div style="display: flex; align-items: center; width: 100%; height: 100%;"><div class="bar-bg bar-bg-${type}"><div class="bar-fill bar-fill-${type}" style="width:${safePercent}%;"></div></div></div>`;
    }

    _renderListModal(config) {
        this._currentListRenderId = (this._currentListRenderId || 0) + 1;
        const currentRenderId = this._currentListRenderId;

        const modal = document.getElementById('selector-modal');
        const titleEl = document.getElementById('selector-title');
        const listContainer = document.getElementById('selector-list');
        const contextEl = document.getElementById('selector-context-info');
        const tabsEl = document.getElementById('selector-tabs');
        const confirmBtn = document.getElementById('selector-confirm-btn');
        const backBtn = document.querySelector('#selector-modal .btn-secondary');

        if (!modal || !listContainer) return;
        
        listContainer.style.display = 'none';
        listContainer.innerHTML = '';
        modal.classList.remove('hidden');

        if (titleEl) titleEl.textContent = config.title || "";

        if (contextEl) {
            if (config.contextHtml) {
                contextEl.classList.remove('hidden');
                contextEl.innerHTML = config.contextHtml;
            } else {
                contextEl.classList.add('hidden');
            }
        }

        if (tabsEl) {
            if (config.tabsHtml) {
                tabsEl.classList.remove('hidden');
                tabsEl.innerHTML = config.tabsHtml;
                
                if (config.onTabClick) {
                    const tabBtns = tabsEl.querySelectorAll('.busho-tab-btn');
                    tabBtns.forEach(btn => {
                        btn.onclick = () => {
                            if (window.AudioManager) window.AudioManager.playSE('choice.ogg');
                            config.onTabClick(btn.getAttribute('data-tab'));
                        };
                    });
                }
                if (config.onScopeClick) {
                    const scopeBtns = tabsEl.querySelectorAll('.busho-scope-btn');
                    scopeBtns.forEach(btn => {
                        btn.onclick = () => {
                            if (window.AudioManager) window.AudioManager.playSE('choice.ogg');
                            config.onScopeClick(btn.getAttribute('data-scope'));
                        };
                    });
                }
            } else {
                tabsEl.classList.add('hidden');
            }
        }

        if (backBtn) {
            if (config.hideBackBtn) {
                backBtn.style.display = 'none';
            } else {
                backBtn.style.display = '';
                backBtn.textContent = (this.modalHistory && this.modalHistory.length > 0) ? '戻る' : '閉じる';
                backBtn.onclick = () => {
                    if (window.AudioManager) window.AudioManager.playSE('cancel.ogg');
                    if (config.onBack) config.onBack();
                    this._currentListRenderId++; 
                    this.popModal();
                };
                const footer = backBtn.parentElement;
                if (footer) footer.style.justifyContent = 'center';
            }
        }

        if (confirmBtn) {
            if (config.onConfirm) {
                confirmBtn.classList.remove('hidden');
                confirmBtn.disabled = true;
                confirmBtn.style.opacity = '0.5';
                confirmBtn.style.cursor = 'not-allowed';
                confirmBtn.onclick = () => {
                    this._currentListRenderId++; 
                    config.onConfirm();
                };
            } else {
                confirmBtn.classList.add('hidden');
            }
        }

        listContainer.className = `list-container ${config.listClass || ''} hide-native-scroll`;

        if (config.gridTemplateSp) listContainer.style.setProperty('--grid-cols-sp', config.gridTemplateSp);
        else listContainer.style.removeProperty('--grid-cols-sp');
        
        if (config.gridTemplatePc) listContainer.style.setProperty('--grid-cols-pc', config.gridTemplatePc);
        else listContainer.style.removeProperty('--grid-cols-pc');

        let wrapperStyle = "";
        if (config.minWidth) {
            wrapperStyle = `width: ${config.minWidth}; min-width: 100%;`;
        }

        const buildItemHtml = (item, index) => {
            const cursorStr = item.onClick ? "style='cursor:pointer;'" : "style='cursor:default;'";
            const extraClass = item.itemClass || '';
            let clickStr = "";
            let indexAttr = "";
            if (item.onClick) {
                if (typeof item.onClick === 'function') {
                    indexAttr = `data-action-index="${index}"`; 
                } else {
                    clickStr = `onclick="if(window.AudioManager) window.AudioManager.playSE('choice.ogg'); ${item.onClick}"`;
                }
            }
            const cells = item.cells.map(c => {
                const strC = String(c);
                return strC.trim().startsWith('<') ? strC : `<span>${strC}</span>`;
            }).join('');
            return `<div class="select-item ${config.itemClass || ''} ${extraClass}" ${cursorStr} ${clickStr} ${indexAttr}>${cells}</div>`;
        };

        if (!config.items || config.items.length === 0) {
            let emptyHtml = '';
            if (config.headers && config.headers.length > 0) {
                const headerCols = config.headers.map(h => h.trim().startsWith('<') ? h : `<span>${h}</span>`).join('');
                emptyHtml += `<div class="list-header ${config.headerClass || ''}">${headerCols}</div>`;
            }
            emptyHtml += config.emptyHtml || '<div style="padding: 10px; text-align: center;">データがありません。</div>';
            listContainer.innerHTML = `<div class="list-inner-wrapper" style="${wrapperStyle}">${emptyHtml}</div>`;
            listContainer.style.display = 'block';
            return;
        }

        const totalItems = config.items.length;
        const INITIAL_RENDER_COUNT = 30;
        const CHUNK_SIZE = 50;

        let assumedItemHeight = 40; 
        let requiredItems = config.scrollPos ? Math.ceil(config.scrollPos / assumedItemHeight) + 20 : INITIAL_RENDER_COUNT;
        const initialLimit = Math.min(totalItems, Math.max(INITIAL_RENDER_COUNT, requiredItems));

        let initialHtmlParts = [];
        
        if (config.headers && config.headers.length > 0) {
            const headerCols = config.headers.map(h => h.trim().startsWith('<') ? h : `<span>${h}</span>`).join('');
            initialHtmlParts.push(`<div class="list-header sortable-header ${config.headerClass || ''}">${headerCols}</div>`);
        }

        for (let i = 0; i < initialLimit; i++) {
            initialHtmlParts.push(buildItemHtml(config.items[i], i));
        }
        
        for (let i = totalItems; i < 8; i++) {
            const emptyCells = config.headers ? config.headers.map(() => `<span></span>`).join('') : '';
            initialHtmlParts.push(`<div class="select-item ${config.itemClass || ''}" style="cursor:default; pointer-events:none;">${emptyCells}</div>`);
        }

        listContainer.innerHTML = `<div class="list-inner-wrapper" style="${wrapperStyle}">${initialHtmlParts.join('')}</div>`;

        const adjustTextFit = (startIndex, endIndex) => {
            const listInner = listContainer.querySelector('.list-inner-wrapper');
            if (!listInner) return;
            const itemEls = listInner.querySelectorAll('.select-item');
            for (let i = startIndex; i < endIndex; i++) {
                if (itemEls[i]) {
                    const cells = itemEls[i].children;
                    for (let j = 0; j < cells.length; j++) {
                        const cell = cells[j];
                        if (cell.querySelector('.bar-bg') || cell.querySelector('.bar-bg-busho') || cell.querySelector('input') || cell.querySelector('img')) continue;
                        
                        if (cell.scrollWidth > cell.clientWidth && cell.clientWidth > 0) {
                            const ratio = cell.clientWidth / cell.scrollWidth;
                            const scale = Math.max(0.6, ratio * 0.95); 
                            cell.style.fontSize = `calc(100% * ${scale})`;
                        }
                    }
                }
            }
        };

        const attachEvents = (startIndex, endIndex) => {
            if (config.items) {
                const actionElements = listContainer.querySelectorAll('[data-action-index]');
                actionElements.forEach(el => {
                    if (el.dataset.eventAttached) return;
                    const index = parseInt(el.getAttribute('data-action-index'));
                    if (index >= startIndex && index < endIndex && config.items[index] && typeof config.items[index].onClick === 'function') {
                        el.addEventListener('click', config.items[index].onClick);
                        el.dataset.eventAttached = "true";
                    }
                });
            }
            
            requestAnimationFrame(() => {
                adjustTextFit(startIndex, endIndex);
            });
        };

        attachEvents(0, initialLimit);

        if (config.onSortClick) {
            const headerSpans = listContainer.querySelectorAll('.sortable-header span[data-sort]');
            headerSpans.forEach(span => {
                span.onclick = (e) => {
                    const key = e.currentTarget.getAttribute('data-sort');
                    if (!key) return;
                    if (window.AudioManager) window.AudioManager.playSE('choice.ogg');
                    config.onSortClick(key);
                };
            });
        }

        if (window.CustomScrollbar) {
            if (!this.ui.bushoScrollbar) this.ui.bushoScrollbar = new CustomScrollbar(listContainer);
        }

        listContainer.style.display = 'block';
        listContainer.scrollTop = config.scrollPos || 0;
        if (this.ui.bushoScrollbar) {
            this.ui.bushoScrollbar.update();
        }

        if (totalItems > initialLimit) {
            let currentIndex = initialLimit;
            const renderNextChunk = () => {
                if (this._currentListRenderId !== currentRenderId) return;

                const chunkParts = [];
                const endLimit = Math.min(currentIndex + CHUNK_SIZE, totalItems);
                
                for (let i = currentIndex; i < endLimit; i++) {
                    chunkParts.push(buildItemHtml(config.items[i], i));
                }
                
                const innerWrapper = listContainer.querySelector('.list-inner-wrapper');
                if (innerWrapper) {
                    innerWrapper.insertAdjacentHTML('beforeend', chunkParts.join(''));
                }
                
                attachEvents(currentIndex, endLimit);
                currentIndex = endLimit;

                if (this.ui.bushoScrollbar) this.ui.bushoScrollbar.update();

                if (currentIndex < totalItems) {
                    requestAnimationFrame(renderNextChunk);
                }
            };
            requestAnimationFrame(renderNextChunk);
        }
    }
}