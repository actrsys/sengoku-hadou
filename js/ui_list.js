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
    // ==========================================
    // ★リスト画面の機能（勢力・外交・派閥）
    // ==========================================
    showDaimyoList() {
        this.closeCommonModal(); 
        this.pushModal('daimyo_list', []);
    }

    _renderDaimyoList(scrollPos = 0) {
        const activeClans = this.game.clans.filter(c => c.id !== 0 && this.game.castles.some(cs => cs.ownerClan === c.id));
        this.game.updateAllClanPrestige();
        
        const clanDataList = activeClans.map(clan => {
            const leader = this.game.getBusho(clan.leaderId);
            const castlesCount = this.game.castles.filter(c => c.ownerClan === clan.id).length;
            return {
                id: clan.id, name: clan.name, leaderName: leader ? leader.name : "不明",
                power: clan.daimyoPrestige, castlesCount: castlesCount
            };
        });
        
        const maxPower = clanDataList.length > 0 ? Math.max(...clanDataList.map(c => c.power)) : 1;
        clanDataList.sort((a, b) => {
            if (a.id === this.game.playerClanId) return -1;
            if (b.id === this.game.playerClanId) return 1;
            return b.power - a.power;
        });

        let items = [];

        clanDataList.forEach(d => {
            let friendScore = 50;
            let friendStatus = "";
            let statusClass = "text-white";
            if (d.id !== this.game.playerClanId) {
                const relation = this.game.getRelation(this.game.playerClanId, d.id);
                if (relation) {
                    friendScore = relation.sentiment;
                    friendStatus = relation.displayStatus || relation.status; 
                    if (friendStatus === '敵対') statusClass = 'text-red';
                    else if (friendStatus === '友好') statusClass = 'text-green';
                    else if (['同盟', '支配', '従属', '婚姻'].includes(friendStatus)) statusClass = 'text-green';
                }
            } else {
                friendStatus = "自家";
                statusClass = "text-orange";
            }

            const powerBarHtml = this._createBarHtml((d.power / maxPower) * 100, 'power');
            const friendBarHtml = d.id === this.game.playerClanId ? "" : this._createBarHtml(friendScore, 'friend');
            
            items.push({
                // ★連絡先修正：HTMLからの呼び出しを新居(list)宛てに変更
                onClick: `window.GameApp.ui.list.showDaimyoDetail(${d.id})`,
                cells: [
                    `<span class="col-daimyo-name" style="font-weight:bold;">${d.name}</span>`,
                    `<span class="col-leader-name">${d.leaderName}</span>`,
                    `<span class="col-castle-count">${d.castlesCount}</span>`,
                    `<span class="col-prestige">${powerBarHtml}</span>`,
                    `<span class="col-friend">${friendBarHtml}</span>`,
                    `<span class="col-relation ${statusClass}">${friendStatus}</span>`,
                    `<span class="col-empty pc-only"></span>`
                ]
            });
        });

        this._renderListModal({
            title: "勢力一覧",
            headers: [
                `<span class="col-daimyo-name">勢力名</span>`,
                `<span class="col-leader-name">当主</span>`,
                `<span class="col-castle-count">拠点</span>`,
                `<span class="col-prestige">威信</span>`,
                `<span class="col-friend">友好度</span>`,
                `<span class="col-relation">関係</span>`,
                `<span class="col-empty pc-only"></span>`
            ],
            headerClass: "daimyo-list-header",
            itemClass: "daimyo-list-item",
            listClass: "daimyo-list-container",
            items: items,
            scrollPos: scrollPos,
            gridTemplateSp: "2.5fr 2fr 1fr 2fr 2fr 1.5fr",
            gridTemplatePc: "140px 100px 60px 100px 100px 60px 1fr"
        });
    }

    showDaimyoDetail(clanId) {
        this.pushModal('daimyo_detail', [clanId]);
    }

    _renderDaimyoDetail(clanId, scrollPos = 0) {
        const clan = this.game.clans.find(c => c.id === clanId);
        if (!clan) return;

        const modal = document.getElementById('selector-modal');
        const title = document.getElementById('selector-title');
        const listContainer = document.getElementById('selector-list');
        const contextEl = document.getElementById('selector-context-info');
        const tabsEl = document.getElementById('selector-tabs');
        const confirmBtn = document.getElementById('selector-confirm-btn');
        const backBtn = document.querySelector('#selector-modal .btn-secondary');

        modal.classList.remove('hidden');
        if (title) title.textContent = "勢力情報";
        if (contextEl) contextEl.classList.add('hidden');
        if (tabsEl) tabsEl.classList.add('hidden');
        if (confirmBtn) confirmBtn.classList.add('hidden');

        if(backBtn) {
            backBtn.style.display = '';
            backBtn.textContent = this.modalHistory.length > 0 ? '戻る' : '閉じる';
            backBtn.onclick = () => {
                if (window.AudioManager) window.AudioManager.playSE('cancel.ogg');
                this.popModal();
            };
            const footer = backBtn.parentElement;
            if (footer) footer.style.justifyContent = 'center';
        }

        const leader = this.game.getBusho(clan.leaderId);
        const leaderName = leader ? leader.name.replace('|', '') : "不明";
        let baseCastleName = "不明";
        if (leader && leader.castleId) {
            const baseCastle = this.game.castles.find(c => c.id === leader.castleId);
            if (baseCastle) baseCastleName = baseCastle.name;
        }
        
        const clanCastles = this.game.castles.filter(c => c.ownerClan === clanId);
        const castlesCount = clanCastles.length;
        
        const clanBushos = this.game.bushos.filter(b => b.clan === clanId && b.status === 'active');
        const bushosCount = clanBushos.length;
        const hasFaction = clanBushos.some(b => (b.factionId || 0) > 0);
        
        const princessCount = clan.princessIds ? clan.princessIds.length : 0;
        
        let totalGold = 0, totalRice = 0, totalSoldiers = 0, totalHorses = 0, totalGuns = 0, totalGoldIncome = 0, totalRiceIncome = 0;
        clanCastles.forEach(c => {
            totalGold += c.gold || 0; totalRice += c.rice || 0; totalSoldiers += c.soldiers || 0;
            totalHorses += c.horses || 0; totalGuns += c.guns || 0;
            totalGoldIncome += GameSystem.calcBaseGoldIncome(c); totalRiceIncome += GameSystem.calcBaseRiceIncome(c);
        });

        let ideology = "中道", ideologyClass = "ideology-chudo"; 
        if (leader) {
            if (leader.innovation >= 67) { ideology = "革新"; ideologyClass = "ideology-kakushin"; } 
            else if (leader.innovation <= 33) { ideology = "保守"; ideologyClass = "ideology-hoshu"; }
        }

        let faceSrc = leader && leader.faceIcon ? `data/images/faceicons/${leader.faceIcon}` : "data/images/faceicons/unknown_face.webp";

        if (listContainer) {
            listContainer.className = 'list-container hide-native-scroll';
            listContainer.style.display = 'block';
            listContainer.innerHTML = `
                <div class="daimyo-detail-container" style="padding: 10px;">
                    <div class="daimyo-detail-header pc-only">
                        <div class="daimyo-detail-name">${clan.name}</div>
                        <div class="daimyo-detail-ideology ${ideologyClass}">${ideology}</div>
                    </div>
                    <div class="daimyo-detail-body">
                        <div class="daimyo-detail-left">
                            <img src="${faceSrc}" class="daimyo-detail-face" onerror="this.src='data/images/faceicons/unknown_face.webp'">
                            <div class="daimyo-detail-header sp-only">
                                <div class="daimyo-detail-name">${clan.name}</div>
                                <div class="daimyo-detail-ideology ${ideologyClass}">${ideology}</div>
                            </div>
                        </div>
                        <div class="daimyo-detail-right">
                            <div class="daimyo-detail-row daimyo-detail-2col">
                                <div class="daimyo-detail-stat-box"><span class="daimyo-detail-label">大名</span><span class="daimyo-detail-value">${leaderName}</span></div>
                                <div class="daimyo-detail-stat-box"><span class="daimyo-detail-label">本拠地</span><span class="daimyo-detail-value">${baseCastleName}</span></div>
                            </div>
                            <div class="daimyo-detail-row daimyo-detail-3col">
                                <div class="daimyo-detail-stat-box"><span class="daimyo-detail-label">城</span><span class="daimyo-detail-value">${castlesCount}</span></div>
                                <div class="daimyo-detail-stat-box"><span class="daimyo-detail-label">武将</span><span class="daimyo-detail-value">${bushosCount}</span></div>
                                <div class="daimyo-detail-stat-box"><span class="daimyo-detail-label">姫</span><span class="daimyo-detail-value">${princessCount}</span></div>
                            </div>
                            <div class="daimyo-detail-row daimyo-detail-2col">
                                <div class="daimyo-detail-stat-box"><span class="daimyo-detail-label">金</span><span class="daimyo-detail-value">${totalGold}</span></div>
                                <div class="daimyo-detail-stat-box"><span class="daimyo-detail-label">兵士</span><span class="daimyo-detail-value">${totalSoldiers}</span></div>
                            </div>
                            <div class="daimyo-detail-row daimyo-detail-2col">
                                <div class="daimyo-detail-stat-box"><span class="daimyo-detail-label">金収入/月</span><span class="daimyo-detail-value">${totalGoldIncome}</span></div>
                                <div class="daimyo-detail-stat-box"><span class="daimyo-detail-label">軍馬</span><span class="daimyo-detail-value">${totalHorses}</span></div>
                            </div>
                            <div class="daimyo-detail-row daimyo-detail-2col">
                                <div class="daimyo-detail-stat-box"><span class="daimyo-detail-label">兵糧</span><span class="daimyo-detail-value">${totalRice}</span></div>
                                <div class="daimyo-detail-stat-box"><span class="daimyo-detail-label">鉄砲</span><span class="daimyo-detail-value">${totalGuns}</span></div>
                            </div>
                            <div class="daimyo-detail-row daimyo-detail-2col">
                                <div class="daimyo-detail-stat-box"><span class="daimyo-detail-label">兵糧収入/年</span><span class="daimyo-detail-value">${totalRiceIncome}</span></div>
                                <div class="daimyo-detail-stat-box" style="visibility: hidden;"></div>
                            </div>
                        </div>
                    </div>
                    <div style="display: flex; justify-content: flex-end; gap: 10px; margin-top: 15px;">
                        <button class="daimyo-detail-action-btn" id="temp-kyoten-btn" ${castlesCount === 0 ? 'disabled' : ''}>拠点</button>
                        <button class="daimyo-detail-action-btn" id="temp-busho-btn" ${bushosCount === 0 ? 'disabled' : ''}>武将</button>
                        <button class="daimyo-detail-action-btn" id="temp-hime-btn" ${princessCount === 0 ? 'disabled' : ''}>姫</button>
                        <button class="daimyo-detail-action-btn" id="temp-faction-btn" ${!hasFaction ? 'disabled' : ''}>派閥</button>
                        <button class="daimyo-detail-action-btn" id="temp-diplo-btn">外交</button>
                    </div>
                </div>
            `;

            document.getElementById('temp-kyoten-btn').onclick = (e) => {
                e.stopPropagation();
                if (window.AudioManager) window.AudioManager.playSE('decision.ogg');
                // ★連絡先修正：拠点はまだ旧居にあるので、info宛てに呼びます
                this.ui.info.showKyotenList(clan.id);
            };

            document.getElementById('temp-diplo-btn').onclick = (e) => {
                e.stopPropagation(); 
                if (window.AudioManager) window.AudioManager.playSE('decision.ogg');
                this.showDiplomacyList(clan.id, clan.name, 'daimyo');
            };
            
            document.getElementById('temp-busho-btn').onclick = (e) => {
                e.stopPropagation();
                if (window.AudioManager) window.AudioManager.playSE('decision.ogg');
                // ★連絡先修正：武将リストはまだ旧居にあるので、info宛てに呼びます
                this.ui.info.openBushoSelector('view_only', null, { 
                    customBushos: this.game.bushos.filter(b => b.clan === clanId && b.status === 'active'),
                    customInfoHtml: `<div>${clan.name} 所属武将</div>`
                });
            };

            document.getElementById('temp-hime-btn').onclick = (e) => {
                e.stopPropagation();
                if (window.AudioManager) window.AudioManager.playSE('decision.ogg');
                this.pushModal('princess_list', [false, clan.id, 'view_clan_princess']);
            };

            document.getElementById('temp-faction-btn').onclick = (e) => {
                e.stopPropagation();
                if (window.AudioManager) window.AudioManager.playSE('decision.ogg');
                this.showFactionList(clan.id);
            };

            listContainer.scrollTop = scrollPos;
        }
    }

    showDiplomacyList(id, name, type = 'daimyo', onClose = null) {
        this.pushModal('diplo_list', [id, name, type, onClose]);
    }
    
    _renderDiplomacyList(id, name, type, onClose, scrollPos = 0) {
        if (!this.diploCurrentTab) this.diploCurrentTab = 'daimyo';

        let tabsHtml = null;
        if (type === 'daimyo') {
            tabsHtml = `
                <div style="display: flex; gap: 5px;">
                    <button class="busho-tab-btn ${this.diploCurrentTab === 'daimyo' ? 'active' : ''}" data-tab="daimyo">大名家</button>
                    <button class="busho-tab-btn ${this.diploCurrentTab === 'kunishu' ? 'active' : ''}" data-tab="kunishu">諸勢力</button>
                </div>
            `;
        } else {
            this.diploCurrentTab = 'daimyo'; 
        }

        let relations = [];

        if (type === 'daimyo' && this.diploCurrentTab === 'daimyo') {
            const activeClans = this.game.clans.filter(c => c.id !== 0 && c.id !== id && this.game.castles.some(cs => cs.ownerClan === c.id));
            relations = activeClans.map(c => {
                const rel = this.game.getRelation(id, c.id);
                return {
                    id: c.id,
                    name: c.name,
                    sentiment: rel ? rel.sentiment : 50,
                    status: rel ? (rel.displayStatus || rel.status) : "普通"
                };
            });
        } else if (type === 'daimyo' && this.diploCurrentTab === 'kunishu') {
            const activeKunishus = this.game.kunishuSystem.getAliveKunishus();
            relations = activeKunishus.map(k => {
                return {
                    id: k.id,
                    name: k.getName(this.game),
                    sentiment: k.getRelation(id, false),
                    status: k.daimyoRelations[id] ? k.daimyoRelations[id].status : "普通"
                };
            });
        } else if (type === 'kunishu') {
            const kunishu = this.game.kunishuSystem.getKunishu(id);
            if (kunishu) {
                const activeClans = this.game.clans.filter(c => c.id !== 0 && this.game.castles.some(cs => cs.ownerClan === c.id));
                relations = activeClans.map(c => {
                    return {
                        id: c.id,
                        name: c.name,
                        sentiment: kunishu.getRelation(c.id, false),
                        status: kunishu.daimyoRelations[c.id] ? kunishu.daimyoRelations[c.id].status : "普通"
                    };
                });
            }
        }

        relations.sort((a,b) => b.sentiment - a.sentiment);
        
        let items = [];
        relations.forEach(r => {
            let statusClass = "text-white";
            if (r.status === '敵対') statusClass = 'text-red';
            else if (r.status === '友好') statusClass = 'text-white';
            else if (['同盟', '支配', '従属', '婚姻'].includes(r.status)) statusClass = 'text-green';

            const friendBarHtml = this._createBarHtml(r.sentiment, 'friend');

            items.push({
                onClick: null, 
                cells: [
                    `<span class="col-daimyo-name" style="font-weight:bold;">${r.name}</span>`,
                    friendBarHtml,
                    `<span class="col-relation ${statusClass}">${r.status}</span>`,
                    ""
                ]
            });
        });

        const customHeaderCols = [
            '<span style="padding-left:5px; justify-content:flex-start;">勢力名</span>',
            '<span>友好度</span>',
            '<span>関係</span>',
            '<span></span>'
        ];

        this._renderListModal({
            title: `${name} 外交関係`,
            tabsHtml: tabsHtml,
            headers: customHeaderCols,
            headerClass: "",
            itemClass: "",
            listClass: "diplo-list-container",
            items: items,
            scrollPos: scrollPos,
            gridTemplateSp: "2fr 1.5fr 1fr 3fr",
            gridTemplatePc: "150px 100px 80px 1fr",
            onBack: onClose,
            onTabClick: (tabKey) => {
                this.diploCurrentTab = tabKey;
                const listEl = document.getElementById('selector-list');
                const scroll = listEl ? listEl.scrollTop : 0;
                this._renderDiplomacyList(id, name, type, onClose, scroll);
            }
        });
    }

    showFactionList(clanId, isDirect = false) {
        if (isDirect) {
            this.closeCommonModal(); 
        }
        this.pushModal('faction_list', [clanId, isDirect]);
    }

    _renderFactionList(clanId, isDirect, scrollPos = 0) {
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

        let fIds = Object.keys(factions).map(Number);
        const daimyo = bushos.find(b => b.isDaimyo);
        const daimyoFactionId = daimyo ? daimyo.factionId : -1;

        if (this.factionCurrentSortKey) {
            fIds = this._prepareStableSortBase('faction', fIds, this.factionCurrentSortKey);
            fIds.sort((a, b) => {
                const fDataA = factions[a];
                const fDataB = factions[b];
                const leaderA = fDataA.leader;
                const leaderB = fDataB.leader;
                let valA, valB;

                const getName = (id, leader) => id === 0 ? "無派閥" : (leader && leader.factionName ? leader.factionName : (leader ? leader.name + "派" : "不明"));
                const getYomi = (id, leader) => id === 0 ? "んんん" : (leader && leader.factionYomi ? leader.factionYomi : (leader ? (leader.yomi || leader.name) + "は" : "んんん"));

                switch(this.factionCurrentSortKey) {
                    case 'name': valA = getYomi(a, leaderA); valB = getYomi(b, leaderB); break;
                    case 'leader': valA = a === 0 ? "んんん" : (leaderA ? (leaderA.yomi || leaderA.name) : "んんん"); valB = b === 0 ? "んんん" : (leaderB ? (leaderB.yomi || leaderB.name) : "んんん"); break;
                    case 'count': valA = fDataA.count; valB = fDataB.count; break;
                    case 'seikaku': valA = a === 0 ? "んんん" : (leaderA ? (leaderA.factionSeikaku || "中道") : "んんん"); valB = b === 0 ? "んんん" : (leaderB ? (leaderB.factionSeikaku || "中道") : "んんん"); break;
                    case 'hoshin': valA = a === 0 ? "んんん" : (leaderA ? (leaderA.factionHoshin || "保守的") : "んんん"); valB = b === 0 ? "んんん" : (leaderB ? (leaderB.factionHoshin || "保守的") : "んんん"); break;
                }

                if (typeof valA === 'string' && typeof valB === 'string') {
                    let cmp = this.isFactionSortAsc ? valA.localeCompare(valB, 'ja') : valB.localeCompare(valA, 'ja');
                    if(cmp === 0 && this.factionCurrentSortKey === 'name'){
                       const nameA = getName(a, leaderA);
                       const nameB = getName(b, leaderB);
                       cmp = this.isFactionSortAsc ? nameA.localeCompare(nameB, 'ja') : nameB.localeCompare(nameA, 'ja');
                    }
                    return cmp;
                }
                if (valA === valB) return 0;
                return this.isFactionSortAsc ? (valA - valB) : (valB - valA);
            });
            this._saveStableSortResult('faction', fIds);
        } else {
            fIds.sort((a, b) => {
                if (a === daimyoFactionId) return -1; 
                if (b === daimyoFactionId) return 1;  
                if (a === 0) return 1;
                if (b === 0) return -1;
                return factions[b].count - factions[a].count; 
            });
            this._saveStableSortResult('faction', null);
        }

        let items = [];
        fIds.forEach(fId => {
            const fData = factions[fId];
            const leader = fData.leader;
            let factionNameStr = fId === 0 ? "無派閥" : (leader && leader.factionName ? leader.factionName : (leader ? leader.name + "派" : "不明"));
            let count = fData.count;
            let seikaku = fId === 0 ? "" : (leader ? (leader.factionSeikaku || "中道") : "不明");
            let hoshin = fId === 0 ? "" : (leader ? (leader.factionHoshin || "保守的") : "不明");
            
            let seikakuClass = "";
            if (seikaku === '武闘派') seikakuClass = 'text-red';
            else if (seikaku === '穏健派') seikakuClass = 'text-blue';

            let hoshinClass = "";
            if (hoshin === '革新的') hoshinClass = 'text-red';
            else if (hoshin === '保守的') hoshinClass = 'text-blue';

            let nameClass = "";
            if (fId === daimyoFactionId) {
                nameClass = "text-orange";
            }
            
            let leaderFullName = fId === 0 ? "" : (leader ? leader.name : "不明");
            
            items.push({
                // ★連絡先修正：HTMLからの呼び出しを新居(list)宛てに変更
                onClick: `window.GameApp.ui.list.showFactionBushoList(${clan.id}, ${fId}, '${factionNameStr}')`,
                cells: [
                    `<strong class="col-faction-name ${nameClass}">${factionNameStr}</strong>`,
                    `<span class="col-leader-name">${leaderFullName}</span>`,
                    `<span class="col-busho-count">${count}</span>`,
                    `<span class="col-seikaku ${seikakuClass}">${seikaku}</span>`,
                    `<span class="col-hoshin ${hoshinClass}">${hoshin}</span>`,
                    ""
                ]
            });
        });

        const getSortMark = (key) => {
            if (this.factionCurrentSortKey !== key) return '';
            return this.isFactionSortAsc ? '<span class="sort-mark">▲</span>' : '<span class="sort-mark">▼</span>';
        };

        this._renderListModal({
            title: `${clan.name} 派閥一覧`,
            headers: [
                `<span class="col-faction-name" data-sort="name">派閥名${getSortMark('name')}</span>`,
                `<span class="col-leader-name" data-sort="leader">派閥主${getSortMark('leader')}</span>`,
                `<span class="col-busho-count" data-sort="count">武将${getSortMark('count')}</span>`,
                `<span class="col-seikaku" data-sort="seikaku">方針${getSortMark('seikaku')}</span>`,
                `<span class="col-hoshin" data-sort="hoshin">思想${getSortMark('hoshin')}</span>`,
                `<span></span>`
            ],
            headerClass: "sortable-header faction-list-header",
            itemClass: "faction-list-item",
            listClass: "faction-list-container",
            items: items,
            scrollPos: scrollPos,
            gridTemplateSp: "2fr 2fr 1fr 1.2fr 1.2fr 1.5fr",
            gridTemplatePc: "120px 120px 60px 80px 80px 1fr",
            onSortClick: (sortKey) => {
                const defaultAscKeys = ['name', 'leader', 'seikaku', 'hoshin'];
                const newState = this._toggleSortState(this.factionCurrentSortKey, this.isFactionSortAsc, sortKey, defaultAscKeys);
                this.factionCurrentSortKey = newState.key;
                this.isFactionSortAsc = newState.isAsc;
                const listEl = document.getElementById('selector-list');
                const scroll = listEl ? listEl.scrollTop : 0;
                this._renderFactionList(clanId, isDirect, scroll);
            }
        });
    }

    showFactionBushoList(clanId, factionId, factionName) {
        const clan = this.game.clans.find(c => c.id === clanId);
        if (!clan) return;

        const targetBushos = this.game.bushos.filter(b => b.clan === clanId && b.status === 'active' && (b.factionId || 0) === factionId);

        // ★連絡先修正：武将リストはまだ旧居にあるので、info宛てに呼びます
        this.ui.info.openBushoSelector('view_only', null, { 
            customBushos: targetBushos,
            customInfoHtml: `<div>${clan.name} ${factionName} 所属武将</div>`,
            isFactionView: true
        });
    }
}