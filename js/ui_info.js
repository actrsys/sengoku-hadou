/**
 * ui_info.js
 * リストなどの情報ウインドウの表示を管理するファイルです
 */
class UIInfoManager {
    constructor(ui, game) {
        // 元のui.jsとgameの情報を覚えておきます
        this.ui = ui;
        this.game = game;
        this.selectorView = new SelectorModalView(ui);
        this.closeCommonModal(); // 履歴や状態変数の初期化
    }
    
    // --- 共通モーダル（枠の使い回し）管理 ---
    // 数量指定など別モーダルを一段だけ重ねる時は、親の一覧状態を破棄せず一時的に隠します。
    // close→open で作り直すと選択ID・タブ・ソート・modalHistoryを失うため、子画面の戻り先保持はこの窓口を使います。
    suspendCommonModalForChild() {
        if (this._commonModalSuspendedForChild) return true;
        const elements = this.selectorView ? this.selectorView.getElements() : null;
        if (!this.currentModalInfo || !elements || !elements.modal || elements.modal.classList.contains('hidden')) return false;
        elements.modal.classList.add('hidden');
        this._commonModalSuspendedForChild = true;
        return true;
    }

    resumeCommonModalFromChild() {
        if (!this._commonModalSuspendedForChild) return false;
        const elements = this.selectorView ? this.selectorView.getElements() : null;
        this._commonModalSuspendedForChild = false;
        if (!this.currentModalInfo || !elements || !elements.modal) return false;
        elements.modal.classList.remove('hidden');
        return true;
    }

    closeCommonModal() {
        this._commonModalSuspendedForChild = false;
        // 閉じた画面の遅延描画・仮想スクロール処理を即座に無効化します。
        // 古いスマホでは、非表示DOMの裏で分割描画が続いたり、scroll handler のクロージャが
        // 大量の武将配列を保持し続けるだけでも、通常地図復帰時のメモリピークに繋がります。
        this._stopActiveListRendering();
        this._stableSortBases = {}; // ★全リスト共通の「前回の並び順」を記憶する箱をリセットします
        this._listItemsCache = {};  // ★全リスト共通の「重い一覧HTML生成結果」を記憶する箱をリセットします

        this.modalHistory = [];
        this.currentModalInfo = null;
        const canDiagnose = this.game && this.game.phase !== 'title' && typeof this.game.writeSystemDiagnostic === 'function';
        if (canDiagnose) this.game.writeSystemDiagnostic('ui:modal_close:start');
        if (this.selectorView) this.selectorView.close();
        if (canDiagnose) this.game.writeSystemDiagnostic('ui:modal_close:selector_done');
        
        // リストを完全に閉じる時に背景更新を再開します。強制リロード調査では
        // この復帰処理の前後を分けて記録し、原因を推測で断定しないようにします。
        if (this.ui && typeof this.ui.resumeBackgroundUpdates === 'function') {
            if (canDiagnose) this.game.writeSystemDiagnostic('ui:modal_close:recovery_start');
            this.ui.resumeBackgroundUpdates('ui:modal_close');
            if (canDiagnose) this.game.writeSystemDiagnostic('ui:modal_close:recovery_done');
        }
        // 武将一覧などで使う状態のリセット
        this.bushoCurrentTab = 'stats';
        this.bushoCurrentScope = 'clan';
        this.bushoCurrentSortKey = null;
        this.bushoIsSortAsc = false;
        this.bushoSavedBushos = null;
        this.bushoSavedSortedBushos = null;
        this.bushoLastSortStateKey = null;
        this.bushoLastScope = null;
        this.bushoSavedData = null;
        this.bushoSavedSelectedIds = [];
        
        // 武将詳細のタブ初期化
        this.bushoDetailCurrentTab = 'status';
        
        // 外交リストのタブ状態リセット
        this.diploCurrentTab = 'daimyo';
        this.diploCurrentSortKey = null;
        this.isDiploSortAsc = false;
        
        // 勢力一覧で使う状態のリセット
        this.daimyoCurrentTab = 'status';
        this.daimyoCurrentSortKey = null;
        this.isDaimyoSortAsc = false;
        
        // 拠点一覧で使う状態のリセット
        this.currentKyotenTab = 'status';
        this.currentKyotenScope = 'clan';
        this.currentKyotenSortKey = null;
        this.isKyotenSortAsc = false;
        this.kyotenSavedCastles = null;
        this.kyotenSavedSortedCastles = null;
        this.kyotenCastleBushoStatsMap = null;
        this.kyotenLastSortStateKey = null;
        this.kyotenLastScope = null;
        
        this.princessCurrentScope = null;
        this.princessCurrentSortKey = null;
        this.isPrincessSortAsc = false;
        
        this.factionCurrentSortKey = null;
        this.isFactionSortAsc = false;

        // 行動履歴は開くたび「自国」を既定にします。
        this.historyCurrentScope = 'clan';

        // 諸勢力一覧で使う状態のリセット
        this.kunishuCurrentSortKey = null;
        this.isKunishuSortAsc = false;

        // 所領分配のリセット
        this.allotFiefSelectedIds = null;
        this.allotFiefSavedState = false;
        
        // ★全リスト共通の選択状態を記憶する箱
        this.commonSelectedIds = [];
        if (canDiagnose) {
            this.game.writeSystemDiagnostic('ui:modal_close:state_reset_done');
            // 古い実機で描画/GPU反映時に落ちる場合を切り分けるため、次フレーム到達も記録する。
            requestAnimationFrame(() => {
                if (this.game && this.game.phase !== 'title' && typeof this.game.writeSystemDiagnostic === 'function') {
                    this.game.writeSystemDiagnostic('ui:modal_close:next_frame_done');
                }
            });
        }
    }

    _stopActiveListRendering() {
        this._currentListRenderId = (this._currentListRenderId || 0) + 1;
        const listContainer = (this.ui && this.ui.selectorList) || document.getElementById('selector-list');
        if (!listContainer) return;
        if (listContainer._virtualScrollHandler) {
            listContainer.removeEventListener('scroll', listContainer._virtualScrollHandler);
            listContainer._virtualScrollHandler = null;
        }
        if (listContainer._virtualScrollCleanup) {
            listContainer._virtualScrollCleanup();
            listContainer._virtualScrollCleanup = null;
        }
    }

    // --- 共通モーダルのガワ ---
    _openInfoShell(title, { tabsHtml = null, showTabs = false } = {}) {
        // 一覧→詳細の遷移でも、旧一覧の仮想スクロール処理を詳細画面の裏へ残しません。
        this._stopActiveListRendering();
        // 詳細DOMを生成する前に旧一覧DOMと画像参照を解放します。履歴には画面条件と
        // scrollPosだけを保持しているため、戻る時は正本データから安全に再描画できます。
        if (this.selectorView && typeof this.selectorView.releaseListContent === 'function') {
            this.selectorView.releaseListContent({ resetScroll: true });
        }
        return this.selectorView.open({
            title,
            tabsHtml,
            showTabs,
            backLabel: (this.modalHistory && this.modalHistory.length > 0) ? '戻る' : '閉じる',
            onBack: () => {
                this.popModal();
            }
        });
    }

    // --- ソート状態の一元管理 ---
    // ★新機能：全リスト共通で「前回の並び順（ベース）」を取得する魔法
    _prepareStableSortBase(listId, baseArray, sortKey) {
        if (!this._stableSortBases) this._stableSortBases = {};
        // ★修正：ソートキーがない場合や、前回のリストと人数が違う場合は記憶をリセットします
        if (!sortKey || !this._stableSortBases[listId] || this._stableSortBases[listId].length !== baseArray.length) {
            this._stableSortBases[listId] = null;
            return [...baseArray];
        }
        return [...this._stableSortBases[listId]];
    }

    // ★新機能：並べ替えが終わったあとに、その結果を共通の箱に保存する魔法
    _saveStableSortResult(listId, sortedArray) {
        if (!this._stableSortBases) this._stableSortBases = {};
        // ★修正：空っぽ（null）が渡された時は、複製しようとせずにそのまま空っぽにします！
        this._stableSortBases[listId] = sortedArray ? [...sortedArray] : null;
    }

    // ==========================================
    // ★新機能：一覧の行HTML（重い生成処理）を使い回すための共通の魔法
    // タブ・絞り込み・並び順・選択状態が前回の描画と全く同じ時だけ、
    // 高コストな再生成をサボって使い回します。
    // 武将一覧のような件数の多いリストで、詳細画面との行き来を
    // 一瞬で終わらせるのが狙いです（他のリストからも共通で使えます）。
    // ==========================================
    _getCachedListItems(listId, cacheKey, buildItemsFn) {
        if (!this._listItemsCache) this._listItemsCache = {};
        const cached = this._listItemsCache[listId];
        if (cached && cached.key === cacheKey) {
            return cached.items;
        }
        const items = buildItemsFn();
        this._listItemsCache[listId] = { key: cacheKey, items };
        return items;
    }

    // ★新機能：明示的にキャッシュを捨てたい時に使う魔法（一覧を開き直す時などに呼びます）
    _invalidateListItemsCache(listId) {
        if (this._listItemsCache) delete this._listItemsCache[listId];
    }

    _toggleSortState(currentSortKey, currentIsAsc, clickedSortKey, defaultAscKeys) {
        if (currentSortKey === clickedSortKey) {
            const isDefaultAsc = defaultAscKeys.includes(clickedSortKey);
            // 2回目のクリック（現在の向きがデフォルトと同じ）なら逆向きにする
            if (currentIsAsc === isDefaultAsc) {
                return { key: clickedSortKey, isAsc: !currentIsAsc };
            } else {
                // 3回目のクリック（現在の向きがデフォルトと逆）ならソートを解除する
                return { key: null, isAsc: false };
            }
        } else {
            // 1回目のクリック（新しいキー）ならデフォルトの向きでソートする
            return { key: clickedSortKey, isAsc: defaultAscKeys.includes(clickedSortKey) };
        }
    }

    // ==========================================
    // ★共通化ツール：リストの選択・解除を行う魔法
    // ==========================================
    handleCommonSelect(itemId, element, isMulti = false) {
        if (!this.commonSelectedIds) this.commonSelectedIds = [];

        const isAlreadySelected = element.classList.contains('selected');
        let input = element.querySelector('input[type="checkbox"], input[type="radio"]');

        if (!isMulti) {
            // 単一選択の場合：他の選択をすべて消す
            const allItems = document.querySelectorAll('.select-item');
            allItems.forEach(item => {
                item.classList.remove('selected');
                const inp = item.querySelector('input[type="checkbox"], input[type="radio"]');
                if (inp) inp.checked = false;
            });

            if (isAlreadySelected) {
                // すでに選ばれていたものをもう一度押した時は、選択を解除します（外す）
                this.commonSelectedIds = [];
            } else {
                // 新しく選んだ時は、それをリストに入れます
                element.classList.add('selected');
                if (input) input.checked = true;
                this.commonSelectedIds = [itemId];
            }
        } else {
            // 複数選択の場合：その項目だけを付け外しする
            if (isAlreadySelected) {
                element.classList.remove('selected');
                if (input) input.checked = false;
                this.commonSelectedIds = this.commonSelectedIds.filter(id => id !== itemId);
            } else {
                element.classList.add('selected');
                if (input) input.checked = true;
                if (!this.commonSelectedIds.includes(itemId)) {
                    this.commonSelectedIds.push(itemId);
                }
            }
        }

        if (window.AudioManager) window.AudioManager.playSE('choice.ogg');
        this.updateCommonConfirmBtn();
    }

    _withChoiceSound(action) {
        return (event) => {
            if (window.AudioManager) window.AudioManager.playSE('choice.ogg');
            return action(event);
        };
    }

    _createDelegatedListEvent(nativeEvent, currentTarget) {
        // Proxyは古いAndroid WebViewで未実装の世代があり、一覧行を押した瞬間だけ
        // ReferenceErrorになるため使用しません。リスト側が実際に必要とするイベント情報だけを
        // 小さな互換オブジェクトにして渡します。
        return {
            originalEvent: nativeEvent,
            type: nativeEvent ? nativeEvent.type : 'click',
            target: nativeEvent ? nativeEvent.target : currentTarget,
            currentTarget: currentTarget,
            preventDefault: () => { if (nativeEvent && nativeEvent.preventDefault) nativeEvent.preventDefault(); },
            stopPropagation: () => { if (nativeEvent && nativeEvent.stopPropagation) nativeEvent.stopPropagation(); },
            stopImmediatePropagation: () => {
                if (nativeEvent && nativeEvent.stopImmediatePropagation) nativeEvent.stopImmediatePropagation();
                else if (nativeEvent && nativeEvent.stopPropagation) nativeEvent.stopPropagation();
            }
        };
    }

    _bindImageFallbacks(container) {
        if (!container) return;
        container.querySelectorAll('[data-face-fallback]').forEach(img => {
            img.addEventListener('error', () => {
                const fallback = img.dataset.faceFallback;
                if (!fallback || img.dataset.fallbackApplied === 'true') return;
                img.dataset.fallbackApplied = 'true';
                img.src = fallback;
            }, { once: true });
        });
        container.querySelectorAll('[data-hide-on-error]').forEach(img => {
            img.addEventListener('error', () => img.classList.add('hidden'), { once: true });
        });
    }

    updateCommonConfirmBtn(minCount = 1) {
        const enabled = !!(this.commonSelectedIds && this.commonSelectedIds.length >= minCount);
        if (this.selectorView && typeof this.selectorView.setConfirmEnabled === 'function') {
            this.selectorView.setConfirmEnabled(enabled);
            return;
        }
        const confirmBtn = document.getElementById('selector-confirm-btn');
        if (confirmBtn) confirmBtn.disabled = !enabled;
    }

    // ==========================================
    // ★共通化ツール：ソート用の共通の魔法
    // ==========================================

    // ★全リスト共通で使える「▲▼マークを作る魔法」
    _getCommonSortMark(currentSortKey, isAsc, targetKey) {
        if (currentSortKey !== targetKey) return '';
        return isAsc ? '<span class="sort-mark">▲</span>' : '<span class="sort-mark">▼</span>';
    }

    // ★全リスト共通で使える「文字や数字の大小を比べて並び順を決める魔法」
    _compareForSort(valA, valB, isAsc, fallbackCmp = 0) {
        if (typeof valA === 'string' && typeof valB === 'string') {
            let cmp = isAsc ? valA.localeCompare(valB, 'ja') : valB.localeCompare(valA, 'ja');
            return cmp === 0 ? fallbackCmp : cmp;
        }
        if (valA === valB) return fallbackCmp;
        return isAsc ? (valA - valB) : (valB - valA);
    }

    pushModal(pageType, renderArgs) {
        if (!this.modalHistory) this.modalHistory = [];
        
        // ★ここを書き足し：新しい画面（リストなど）を開く時に、背景の更新をストップします！
        if (this.ui && typeof this.ui.pauseBackgroundUpdates === 'function') {
            this.ui.pauseBackgroundUpdates();
        }
        if (this.game && typeof this.game.writeSystemDiagnostic === 'function') {
            this.game.writeSystemDiagnostic(`ui:modal:${pageType}`);
        }

        if (this.currentModalInfo) {
            // 今開いている画面のスクロール位置をメモしておきます
            const listEl = document.getElementById('selector-list');
            this.currentModalInfo.scrollPos = listEl ? listEl.scrollTop : 0;
            this.modalHistory.push(this.currentModalInfo);
        }
        
        this.currentModalInfo = { pageType, args: renderArgs, scrollPos: 0 };
        this._renderCurrentModal();
    }

    // 婚姻などの多段選択では、親画面の選択状態を履歴側へ預けてから子画面を開く。
    // close→openで擬似的に戻り先を作ると、共通Back処理のpopと競合して新しい画面まで閉じるため、
    // 「履歴を積む」「子画面の選択は空から始める」を一つの入口にまとめる。
    pushSelectionModal(pageType, renderArgs) {
        if (this.currentModalInfo) {
            this.currentModalInfo.selectedIds = [...(this.commonSelectedIds || [])];
        }
        this.commonSelectedIds = [];
        this.pushModal(pageType, renderArgs);
    }

    popModal() {
        if (!this.modalHistory || this.modalHistory.length === 0) {
            this.closeCommonModal();
            return;
        }
        // 履歴から一つ前の画面を取り出して復元します
        this.currentModalInfo = this.modalHistory.pop();
        this.commonSelectedIds = Array.isArray(this.currentModalInfo.selectedIds)
            ? [...this.currentModalInfo.selectedIds]
            : [];
        if (this.currentModalInfo.pageType === 'busho_selector' && this.currentModalInfo.bushoViewState) {
            const view = this.currentModalInfo.bushoViewState;
            this.bushoCurrentTab = view.tab || 'stats';
            this.bushoCurrentScope = view.scope || 'clan';
            this.bushoCurrentSortKey = view.sortKey || null;
            this.bushoIsSortAsc = !!view.isSortAsc;
            // 子一覧の再生成可能キャッシュは親へ持ち越さず、復元した条件で作り直します。
            this.bushoSavedBushos = null;
            this.bushoSavedSortedBushos = null;
            this.bushoLastSortStateKey = null;
            this.bushoLastScope = null;
            this.bushoSavedData = null;
            this._invalidateListItemsCache('busho');
        }
        this._renderCurrentModal();
    }
    
    _renderCurrentModal() {
        const info = this.currentModalInfo;
        if (!info) return;

        // ★ここで「情報系画面」かどうかをタグ付け（判定）します
        const isInfoScreen = ['daimyo_detail', 'busho_detail', 'delegate_setting', 'kunishu_detail', 'castle_detail'].includes(info.pageType);

        // ★枠の大元で、スクロールバーの表示/非表示をクラスで一括管理します
        const listWrapper = document.getElementById('selector-list-wrapper');
        const listContainer = document.getElementById('selector-list');
        // ★大枠のウインドウ（modal-content）も取得して、二重スクロールを防ぎます
        const selectorModal = document.getElementById('selector-modal');
        const modalContent = selectorModal ? selectorModal.querySelector('.modal-content') : null;
        
        if (listWrapper) {
            if (isInfoScreen) {
                listWrapper.classList.add('no-custom-scrollbar');
                if (listContainer) listContainer.style.overflow = 'hidden'; 
                // 情報画面は中身が長いので、大枠でスクロールさせます
                if (modalContent) modalContent.style.setProperty('overflow-y', 'auto', 'important');
            } else {
                listWrapper.classList.remove('no-custom-scrollbar');
                if (listContainer) listContainer.style.overflow = '';
                // リスト画面はリスト自体がスクロールするので、大枠の標準スクロールバーは封印します
                if (modalContent) modalContent.style.setProperty('overflow-y', 'hidden', 'important');
            }
        }

        // ★枠の大元で、タブの表示/非表示（ダミータブ）を一括管理します
        const tabsEl = document.getElementById('selector-tabs');
        if (tabsEl) {
            const isPc = document.body.classList.contains('is-pc'); // ★PCかスマホか調べる魔法を追加します
            if (isInfoScreen) {
                tabsEl.classList.add('hidden');
            } else {
                tabsEl.classList.remove('hidden');
                tabsEl.style.justifyContent = 'flex-start';
                tabsEl.style.paddingLeft = '10px';
                tabsEl.style.alignItems = 'flex-end';
                tabsEl.innerHTML = `<div class="busho-list-tabs"><button class="busho-tab-btn active is-static-tab">${isPc ? '基本' : '基'}</button></div>`;
            }
        }
        
        // どの画面を描くか判定して専用の魔法を呼び出します
        if (info.pageType === 'daimyo_list') this._renderDaimyoList(...info.args, info.scrollPos);
        else if (info.pageType === 'daimyo_detail') this._renderDaimyoDetail(...info.args, info.scrollPos);
        else if (info.pageType === 'busho_selector') this._renderBushoSelector(...info.args, info.scrollPos);
        else if (info.pageType === 'busho_detail') this._renderBushoDetail(...info.args, info.scrollPos);
        else if (info.pageType === 'kyoten_list') this._renderKyotenList(...info.args, info.scrollPos);
        else if (info.pageType === 'diplo_list') this._renderDiplomacyList(...info.args, info.scrollPos);
        else if (info.pageType === 'faction_list') this._renderFactionList(...info.args, info.scrollPos);
        else if (info.pageType === 'princess_list') this._renderPrincessList(...info.args, info.scrollPos);
        else if (info.pageType === 'delegate_list') this._renderDelegateList(...info.args, info.scrollPos);
        else if (info.pageType === 'delegate_setting') this._renderDelegateSetting(...info.args, info.scrollPos);
        else if (info.pageType === 'history_list') this._renderHistoryList(...info.args, info.scrollPos);
        else if (info.pageType === 'kunishu_list') this._renderKunishuList(...info.args, info.scrollPos);
        else if (info.pageType === 'kunishu_detail') this._renderKunishuDetail(...info.args, info.scrollPos);
        else if (info.pageType === 'castle_detail') this._renderCastleDetail(...info.args, info.scrollPos);
        else if (info.pageType === 'force_selector') this._renderForceSelector(...info.args, info.scrollPos);
        else if (info.pageType === 'appoint_legion_castle') this._renderAppointLegionCastle(...info.args, info.scrollPos);
        else if (info.pageType === 'allot_fief') this._renderAllotFief(...info.args, info.scrollPos);
        else if (info.pageType === 'princess_detail') this._renderPrincessDetail(...info.args, info.scrollPos);
    }
    
    showDaimyoList() {
        this.closeCommonModal(); 
        this.pushModal('daimyo_list', [false, null, null]);
    }

    showDaimyoSelector(onSelect, onBack) {
        this.closeCommonModal();
        this.pushModal('daimyo_list', [true, onSelect, onBack]);
    }

    _renderDaimyoList(isSelectMode = false, onSelect = null, onBack = null, scrollPos = 0) {
        const activeClans = this.game.clans.filter(c => c.id !== 0 && this.game.getClanCastles(c.id).length > 0);
        this.game.updateAllClanPrestige();

        // 所属索引が正本になったので、全国4000人を一覧表示のたびに再グループ化せず、
        // 実際に表示する現存勢力の所属者だけを局所的に活動中判定します。
        const activeBushosByClan = new Map();
        for (const clan of activeClans) {
            const activeMembers = [];
            for (const b of this.game.getClanBushos(clan.id)) {
                if (window.BushoStatusRules.isActive(b)) activeMembers.push(b);
            }
            activeBushosByClan.set(Number(clan.id), activeMembers);
        }
        
        if (!this.daimyoCurrentTab) this.daimyoCurrentTab = 'status';

        const isPc = document.body.classList.contains('is-pc'); // ★PCかスマホか調べる魔法を追加します

        let tabsHtml = `
            <div class="busho-list-tabs">
                <button class="busho-tab-btn ${this.daimyoCurrentTab === 'status' ? 'active' : ''}" data-tab="status">${isPc ? '基本' : '基'}</button>
                <button class="busho-tab-btn ${this.daimyoCurrentTab === 'military' ? 'active' : ''}" data-tab="military">${isPc ? '軍事' : '軍'}</button>
                <button class="busho-tab-btn ${this.daimyoCurrentTab === 'economy' ? 'active' : ''}" data-tab="economy">${isPc ? '経済' : '経'}</button>
                <button class="busho-tab-btn ${this.daimyoCurrentTab === 'power' ? 'active' : ''}" data-tab="power">${isPc ? '国力' : '国'}</button>
            </div>
        `;
        
        const clanDataList = activeClans.map(clan => {
            const leader = this.game.getBusho(clan.leaderId);
            
            let totalSoldiers = 0, totalHorses = 0, totalGuns = 0;
            let totalKokudaka = 0, totalCommerce = 0, totalGold = 0, totalRice = 0;
            let totalPopulation = 0, totalMaxKokudaka = 0, totalMaxCommerce = 0;
            
            const clanCastles = this.game.getClanCastles(clan.id);
            const castlesCount = clanCastles.length;
            
            clanCastles.forEach(c => {
                totalSoldiers += c.soldiers || 0;
                totalHorses += c.horses || 0;
                totalGuns += c.guns || 0;
                totalKokudaka += c.kokudaka || 0;
                totalCommerce += c.commerce || 0;
                totalGold += c.gold || 0;
                totalRice += c.rice || 0;
                totalPopulation += c.population || 0;
                totalMaxKokudaka += c.maxKokudaka !== undefined ? c.maxKokudaka : (c.kokudaka || 0);
                totalMaxCommerce += c.maxCommerce !== undefined ? c.maxCommerce : (c.commerce || 0);
            });

            // ★表示側で計算は行わず、勢力データに保存されている値を読むだけにします
            let totalGoldIncome = clan.goldIncome || 0;
            let totalRiceIncome = clan.riceIncome || 0;
            
            const clanBushos = activeBushosByClan.get(Number(clan.id)) || [];
            const bushosCount = clanBushos.length;

            let totalGoldConsume = 0;
            if (leader) {
                clanBushos.forEach(b => {
                    totalGoldConsume += b.getSalary(leader);
                });
            }
            let totalRiceConsume = Math.floor(totalSoldiers * window.MainParams.Economy.ConsumeRicePerSoldier) * 12;

            const princessCount = clan.princessIds ? clan.princessIds.length : 0;
            
            let friendScore = 50;
            let friendStatus = "普通";
            let isMarriage = false;
            if (clan.id !== this.game.playerClanId) {
                const relation = this.game.getRelation(this.game.playerClanId, clan.id);
                if (relation) {
                    friendScore = relation.sentiment;
                    // 婚姻は基本外交statusとは独立して表示する。
                    friendStatus = relation.status || "普通";
                    isMarriage = relation.isMarriage === true;
                }
            } else {
                friendStatus = "自家";
            }
            
            return {
                id: clan.id, 
                name: clan.name, 
                yomi: clan.yomi || clan.name,
                leaderName: leader ? leader.name : "不明",
                leaderYomi: leader ? (leader.yomi || leader.name) : "んんん",
                power: clan.daimyoPrestige, 
                castlesCount: castlesCount,
                soldiers: totalSoldiers,
                horses: totalHorses,
                guns: totalGuns,
                bushosCount: bushosCount,
                princessCount: princessCount,
                kokudaka: totalKokudaka,
                commerce: totalCommerce,
                gold: totalGold,
                goldIncome: totalGoldIncome,
                rice: totalRice,
                riceIncome: totalRiceIncome,
                population: totalPopulation,
                maxKokudaka: totalMaxKokudaka,
                maxCommerce: totalMaxCommerce,
                goldConsume: totalGoldConsume,
                riceConsume: totalRiceConsume,
                friendScore: friendScore,
                friendStatus: friendStatus,
                isMarriage: isMarriage
            };
        });
        
        const maxPower = clanDataList.length > 0 ? Math.max(...clanDataList.map(c => c.power)) : 1;
        
        if (this.daimyoCurrentSortKey) {
            let sortedList = this._prepareStableSortBase('daimyo', clanDataList, this.daimyoCurrentSortKey);
            sortedList.sort((a, b) => {
                let valA, valB;
                
                switch (this.daimyoCurrentSortKey) {
                    case 'name': valA = a.yomi; valB = b.yomi; break;
                    case 'leader': valA = a.leaderYomi; valB = b.leaderYomi; break;
                    case 'castlesCount': valA = a.castlesCount; valB = b.castlesCount; break;
                    case 'power': valA = a.power; valB = b.power; break;
                    case 'soldiers': valA = a.soldiers; valB = b.soldiers; break;
                    case 'horses': valA = a.horses; valB = b.horses; break;
                    case 'guns': valA = a.guns; valB = b.guns; break;
                    case 'bushosCount': valA = a.bushosCount; valB = b.bushosCount; break;
                    case 'princessCount': valA = a.princessCount; valB = b.princessCount; break;
                    case 'kokudaka': valA = a.kokudaka; valB = b.kokudaka; break;
                    case 'commerce': valA = a.commerce; valB = b.commerce; break;
                    case 'gold': valA = a.gold; valB = b.gold; break;
                    case 'goldIncome': valA = a.goldIncome; valB = b.goldIncome; break;
                    case 'rice': valA = a.rice; valB = b.rice; break;
                    case 'riceIncome': valA = a.riceIncome; valB = b.riceIncome; break;
                    case 'population': valA = a.population; valB = b.population; break;
                    case 'maxKokudaka': valA = a.maxKokudaka; valB = b.maxKokudaka; break;
                    case 'maxCommerce': valA = a.maxCommerce; valB = b.maxCommerce; break;
                    case 'goldConsume': valA = a.goldConsume; valB = b.goldConsume; break;
                    case 'riceConsume': valA = a.riceConsume; valB = b.riceConsume; break;
                    case 'friend': 
                        valA = a.id === this.game.playerClanId ? 999 : a.friendScore;
                        valB = b.id === this.game.playerClanId ? 999 : b.friendScore;
                        break;
                    case 'relation':
                        const relationRank = { "自家": 0, "同盟": 1, "支配": 2, "従属": 3, "友好": 4, "和睦": 5, "普通": 6, "敵対": 7 };
                        valA = relationRank[a.friendStatus] !== undefined ? relationRank[a.friendStatus] : 6;
                        valB = relationRank[b.friendStatus] !== undefined ? relationRank[b.friendStatus] : 6;
                        break;
                    case 'marriage': valA = a.isMarriage ? 1 : 0; valB = b.isMarriage ? 1 : 0; break;
                }

                let fallbackCmp = 0;
                if (this.daimyoCurrentSortKey === 'name') {
                    fallbackCmp = this.isDaimyoSortAsc ? a.name.localeCompare(b.name, 'ja') : b.name.localeCompare(a.name, 'ja');
                } else if (this.daimyoCurrentSortKey === 'leader') {
                    fallbackCmp = this.isDaimyoSortAsc ? a.leaderName.localeCompare(b.leaderName, 'ja') : b.leaderName.localeCompare(a.leaderName, 'ja');
                }
                
                return this._compareForSort(valA, valB, this.isDaimyoSortAsc, fallbackCmp);
            });
            this._saveStableSortResult('daimyo', sortedList);
            clanDataList.splice(0, clanDataList.length, ...sortedList);
        } else {
            clanDataList.sort((a, b) => {
                if (a.id === this.game.playerClanId) return -1;
                if (b.id === this.game.playerClanId) return 1;
                return b.power - a.power;
            });
            this._saveStableSortResult('daimyo', null);
        }

        const getSortMark = (key) => this._getCommonSortMark(this.daimyoCurrentSortKey, this.isDaimyoSortAsc, key);
        
        let headers = [];
        let gridSpStr = "";
        let gridPcStr = "";
        
        let contextHtml = null;
        if (isSelectMode) {
            contextHtml = "<div>担当する勢力を選択してください</div>";
        }
        
        if (this.daimyoCurrentTab === 'status') {
            gridSpStr = "1.5fr 1.3fr 0.9fr 1.3fr 1.3fr 0.9fr 0.8fr";
            gridPcStr = "140px 100px 60px 100px 100px 60px 50px 1fr";
            headers = [
                `<span data-sort="name">勢力名${getSortMark('name')}</span>`,
                `<span data-sort="leader">当主${getSortMark('leader')}</span>`,
                `<span data-sort="castlesCount">拠点${getSortMark('castlesCount')}</span>`,
                `<span data-sort="power">威信${getSortMark('power')}</span>`,
                `<span data-sort="friend">友好度${getSortMark('friend')}</span>`,
                `<span data-sort="relation">関係${getSortMark('relation')}</span>`,
                `<span data-sort="marriage">婚姻${getSortMark('marriage')}</span>`,
                `<span class="pc-only"></span>`
            ];
        } else if (this.daimyoCurrentTab === 'military') {
            gridSpStr = "1.5fr 1fr 1fr 1.5fr 1.5fr 1.5fr";
            gridPcStr = "140px 60px 60px 80px 80px 80px 1fr";
            headers = [
                `<span data-sort="name">勢力名${getSortMark('name')}</span>`,
                `<span data-sort="bushosCount">武将${getSortMark('bushosCount')}</span>`,
                `<span data-sort="princessCount">姫${getSortMark('princessCount')}</span>`,
                `<span data-sort="soldiers">兵士${getSortMark('soldiers')}</span>`,
                `<span data-sort="horses">軍馬${getSortMark('horses')}</span>`,
                `<span data-sort="guns">鉄砲${getSortMark('guns')}</span>`,
                `<span class="pc-only"></span>`
            ];
        } else if (this.daimyoCurrentTab === 'economy') {
            gridSpStr = "1.5fr 1fr 1.1fr 1.1fr 1.1fr 1.1fr 1.1fr";
            gridPcStr = "140px 80px 80px 80px 80px 80px 80px 1fr";
            headers = [
                `<span data-sort="name">勢力名${getSortMark('name')}</span>`,
                `<span data-sort="gold">金${getSortMark('gold')}</span>`,
                `<span data-sort="goldIncome">月収入${getSortMark('goldIncome')}</span>`,
                `<span data-sort="goldConsume">月支出${getSortMark('goldConsume')}</span>`,
                `<span data-sort="rice">兵糧${getSortMark('rice')}</span>`,
                `<span data-sort="riceIncome">年収穫${getSortMark('riceIncome')}</span>`,
                `<span data-sort="riceConsume">米消費${getSortMark('riceConsume')}</span>`,
                `<span class="pc-only"></span>`
            ];
        } else if (this.daimyoCurrentTab === 'power') {
            gridSpStr = "1.5fr 1.5fr 1.25fr 1.25fr 1.25fr 1.25fr";
            gridPcStr = "140px 100px 80px 80px 80px 80px 1fr";
            headers = [
                `<span data-sort="name">勢力名${getSortMark('name')}</span>`,
                `<span data-sort="population">人口${getSortMark('population')}</span>`,
                `<span data-sort="kokudaka">石高${getSortMark('kokudaka')}</span>`,
                `<span data-sort="maxKokudaka">最大石高${getSortMark('maxKokudaka')}</span>`,
                `<span data-sort="commerce">鉱山${getSortMark('commerce')}</span>`,
                `<span data-sort="maxCommerce">最大鉱山${getSortMark('maxCommerce')}</span>`,
                `<span class="pc-only"></span>`
            ];
        }

        // ★追加：勢力名が4文字以上の場合は縮小する魔法
        const getCompressedTextHtml = (text, threshold) => {
            if (!text) return "";
            if (text.length >= threshold) {
                // ★修正：縮み具合を少し緩やかにしました（0.1 → 0.05）
                let scale = 1.0 - (text.length - (threshold - 1)) * 0.05;
                // ★修正：これ以上小さくならない下限も少し緩めました（0.55 → 0.75）
                if (scale < 0.75) scale = 0.75;
                return `<span class="compressed-list-text" style="--text-scale:${scale}; --text-unscale:${1/scale};">${text}</span>`;
            }
            return text;
        };

        let items = [];

        clanDataList.forEach(d => {
            const compressedDaimyoName = getCompressedTextHtml(d.name, 4); // ★魔法をかけます！

            let cells = [];
            if (this.daimyoCurrentTab === 'status') {
                let statusClass = "text-white";
                if (d.friendStatus === '敵対') statusClass = 'text-red';
                else if (['同盟', '支配', '従属', '婚姻', '和睦', '友好'].includes(d.friendStatus)) statusClass = 'text-green';
                else if (d.friendStatus === '自家') statusClass = 'text-orange';

                const powerBarHtml = this._createBarHtml((d.power / maxPower) * 100, 'power');
                const friendBarHtml = d.id === this.game.playerClanId ? "" : this._createBarHtml(d.friendScore, 'friend');
                
                cells = [
                    `<span class="col-daimyo-name">${compressedDaimyoName}</span>`,
                    `<span class="col-leader-name">${d.leaderName}</span>`,
                    `<span class="col-castle-count">${d.castlesCount}</span>`,
                    `<span class="col-prestige">${powerBarHtml}</span>`,
                    `<span class="col-friend">${friendBarHtml}</span>`,
                    `<span class="col-relation ${statusClass}">${d.friendStatus}</span>`,
                    `<span class="col-marriage">${d.isMarriage ? "◯" : ""}</span>`,
                    `<span class="col-empty pc-only"></span>`
                ];
            } else if (this.daimyoCurrentTab === 'military') {
                cells = [
                    `<span class="col-daimyo-name">${compressedDaimyoName}</span>`,
                    `<span class="col-busho-count">${d.bushosCount}</span>`,
                    `<span class="col-busho-count">${d.princessCount}</span>`,
                    `<span class="col-soldiers">${d.soldiers}</span>`,
                    `<span class="col-horses">${d.horses}</span>`,
                    `<span class="col-guns">${d.guns}</span>`,
                    `<span class="col-empty pc-only"></span>`
                ];
            } else if (this.daimyoCurrentTab === 'economy') {
                const formatNum = (num) => (!isPc && num >= 10000) ? Math.floor(num / 1000) + '千' : num;
                cells = [
                    `<span class="col-daimyo-name">${compressedDaimyoName}</span>`,
                    `<span class="col-gold">${formatNum(d.gold)}</span>`,
                    `<span class="col-gold-income">${formatNum(d.goldIncome)}</span>`,
                    `<span class="col-gold-consume">${formatNum(d.goldConsume)}</span>`,
                    `<span class="col-rice">${formatNum(d.rice)}</span>`,
                    `<span class="col-rice-income">${formatNum(d.riceIncome)}</span>`,
                    `<span class="col-rice-consume">${formatNum(d.riceConsume)}</span>`,
                    `<span class="col-empty pc-only"></span>`
                ];
            } else if (this.daimyoCurrentTab === 'power') {
                cells = [
                    `<span class="col-daimyo-name">${compressedDaimyoName}</span>`,
                    `<span class="col-population">${d.population}</span>`,
                    `<span class="col-kokudaka">${d.kokudaka}</span>`,
                    `<span class="col-kokudaka">${d.maxKokudaka}</span>`,
                    `<span class="col-commerce">${d.commerce}</span>`,
                    `<span class="col-commerce">${d.maxCommerce}</span>`,
                    `<span class="col-empty pc-only"></span>`
                ];
            }
            
            const isSelected = this.commonSelectedIds && this.commonSelectedIds.includes(d.id);
            let onClickStr = null;
            if (isSelectMode) {
                onClickStr = (e) => this.handleCommonSelect(d.id, e.currentTarget, false);
            } else {
                onClickStr = this._withChoiceSound(() => this.showDaimyoDetail(d.id));
            }

            items.push({
                onClick: onClickStr,
                cells: cells,
                itemClass: isSelectMode && isSelected ? "selected" : ""
            });
        });

        this._renderListModal({
            title: isSelectMode ? "勢力選択" : "勢力一覧",
            contextHtml: contextHtml,
            tabsHtml: tabsHtml,
            headers: headers,
            headerClass: "sortable-header daimyo-list-header",
            itemClass: "daimyo-list-item",
            listClass: "daimyo-list-container",
            items: items,
            scrollPos: scrollPos,
            gridTemplateSp: gridSpStr,
            gridTemplatePc: gridPcStr,
            onBack: isSelectMode ? onBack : null,
            backLabel: isSelectMode && onBack ? '戻る' : null,
            onConfirm: isSelectMode ? () => {
                if (!this.commonSelectedIds || this.commonSelectedIds.length === 0) return;
                const selectedId = this.commonSelectedIds[0];
                this.closeCommonModal();
                if (onSelect) onSelect(selectedId);
            } : null,
            onTabClick: (tabKey) => {
                this.daimyoCurrentTab = tabKey;
                const listEl = document.getElementById('selector-list');
                const scroll = listEl ? listEl.scrollTop : 0;
                this._renderDaimyoList(isSelectMode, onSelect, onBack, scroll);
            },
            onSortClick: (sortKey) => {
                const defaultAscKeys = ['name', 'leader', 'relation'];
                const newState = this._toggleSortState(this.daimyoCurrentSortKey, this.isDaimyoSortAsc, sortKey, defaultAscKeys);
                this.daimyoCurrentSortKey = newState.key;
                this.isDaimyoSortAsc = newState.isAsc;
                const listEl = document.getElementById('selector-list');
                const scroll = listEl ? listEl.scrollTop : 0;
                this._renderDaimyoList(isSelectMode, onSelect, onBack, scroll);
            }
        });

        if (isSelectMode) this.updateCommonConfirmBtn();
    }

    showDaimyoDetail(clanId) {
        this.pushModal('daimyo_detail', [clanId]);
    }

    _renderDaimyoDetail(clanId, scrollPos = 0) {
        const clan = this.game.getClan(clanId);
        if (!clan) return;

        const shell = this._openInfoShell("勢力情報");
        if (!shell) return;
        const { listContainer } = shell;

        const leader = this.game.getBusho(clan.leaderId);
        const leaderName = leader ? leader.name.replace('|', '') : "不明";
        let baseCastleName = "不明";
        if (leader && leader.castleId) {
            const baseCastle = this.game.getCastle(leader.castleId);
            if (baseCastle) baseCastleName = baseCastle.name;
        }
        
        const clanCastles = this.game.getClanCastles(clanId);
        const castlesCount = clanCastles.length;
        
        // ★武将のリストを取得して、人数と「派閥があるか」を調べます
        const clanBushos = this.game.getClanBushos(clanId).filter(b => window.BushoStatusRules.isActive(b));
        const bushosCount = clanBushos.length;
        const hasFaction = clanBushos.some(b => (b.factionId || 0) > 0);
        
        const princessCount = clan.princessIds ? clan.princessIds.length : 0;
        
        let totalGold = 0, totalRice = 0, totalSoldiers = 0, totalHorses = 0, totalGuns = 0;
        let totalPopulation = 0, totalKokudaka = 0, totalCommerce = 0;
        let roninCount = 0;

        clanCastles.forEach(c => {
            totalGold += c.gold || 0; 
            totalRice += c.rice || 0; 
            totalSoldiers += c.soldiers || 0;
            totalHorses += c.horses || 0; 
            totalGuns += c.guns || 0;
            totalPopulation += c.population || 0;
            totalKokudaka += c.kokudaka || 0;
            totalCommerce += c.commerce || 0;
            for (const b of this.game.getCastleBushos(c.id)) {
                if (window.BushoStatusRules.isRonin(b)) roninCount++;
            }
        });

        // ★表示側で計算は行わず、勢力データに保存されている値を読むだけにします
        let totalGoldIncome = clan.goldIncome || 0;
        let totalRiceIncome = clan.riceIncome || 0;

        let totalGoldConsume = 0;
        if (leader) {
            clanBushos.forEach(b => {
                totalGoldConsume += b.getSalary(leader);
            });
        }
        let consumeRiceYear = Math.floor(totalSoldiers * window.MainParams.Economy.ConsumeRicePerSoldier) * 12;

        let ideology = "中道", ideologyClass = "ideology-chudo"; 
        if (leader) {
            if (leader.innovation >= 67) { ideology = "革新"; ideologyClass = "ideology-kakushin"; } 
            else if (leader.innovation <= 33) { ideology = "保守"; ideologyClass = "ideology-hoshu"; }
        }

        let faceSrc = leader && leader.faceIcon ? `data/images/faceicons/${leader.faceIcon}` : "data/images/faceicons/unknown_face.webp";

        const makeRow = (label, value) => {
            const longLabelClass = label.length >= 3 ? ' is-long-label' : '';
            return `<div class="info-detail-stat-box"><span class="info-detail-stat-label${longLabelClass}">${label}</span><span class="info-detail-stat-value">${value}</span></div>`;
        };
        const makeEmptyRow = () => `<div class="info-detail-stat-box is-placeholder"><span>&nbsp;</span><span>&nbsp;</span></div>`;

        const clanYomi = clan.yomi || "";
        const ideologyHtml = `<div class="daimyo-detail-ideology info-detail-ideology ${ideologyClass}">${ideology}</div>`;

        if (listContainer) {
            listContainer.className = 'list-container hide-native-scroll';
            listContainer.style.display = 'block';
            listContainer.innerHTML = `
                <div class="kyoten-detail-wrapper info-detail-wrapper">
                    
                    <!-- 【ヘッダー部】 左上に顔グラ、右にテキスト情報 -->
                    <div class="info-detail-header">
                        <div class="info-detail-face-column">
                            <img src="${faceSrc}" class="info-detail-face" data-face-fallback="data/images/faceicons/unknown_face.webp">
                        </div>
                        <div class="info-detail-main">
                            <!-- 勢力名 -->
                            <div class="info-detail-title-row">
                                <div class="info-detail-title-block">
                                    <span class="info-detail-yomi">${clanYomi}</span>
                                    <span class="info-detail-name">${clan.name}</span>
                                </div>
                            </div>
                            <!-- 大名＆イデオロギー -->
                            <div class="info-detail-subinfo">
                                <div class="info-detail-owner-line">大名 <span class="info-detail-owner-value">${leaderName}</span></div>
                                ${ideologyHtml}
                            </div>
                        </div>
                    </div>

                    <!-- 【ステータス部：上段】 -->
                    <div class="info-detail-grid info-detail-grid-upper">
                        <!-- 左列：武将・姫・浪人 -->
                        <div class="info-detail-group">
                            ${makeRow('武将', bushosCount)}
                            ${makeRow('姫', princessCount)}
                            ${makeRow('浪人', roninCount)}
                        </div>
                        
                        <!-- 中央列：拠点・石高・鉱山 -->
                        <div class="info-detail-group">
                            ${makeRow('拠点', castlesCount)}
                            ${makeRow('石高', totalKokudaka)}
                            ${makeRow('鉱山', totalCommerce)}
                        </div>

                        <!-- 右列：軍馬・鉄砲・空箱 -->
                        <div class="info-detail-group">
                            ${makeRow('軍馬', totalHorses)}
                            ${makeRow('鉄砲', totalGuns)}
                            ${makeEmptyRow()}
                        </div>
                    </div>

                    <!-- 【ステータス部：下段】 -->
                    <div class="info-detail-grid info-detail-grid-lower">
                        
                        <!-- 左列：金・兵糧 ＋ 独立した人口 -->
                        <div class="info-detail-column">
                            <div class="info-detail-group">
                                ${makeRow('金', totalGold)}
                                ${makeRow('兵糧', totalRice)}
                            </div>
                            <div class="info-detail-group">
                                ${makeRow('人口', totalPopulation)}
                            </div>
                        </div>

                        <!-- 中央列：月収入・年収穫 ＋ 見えない箱 -->
                        <div class="info-detail-column">
                            <div class="info-detail-group">
                                ${makeRow('月収入', totalGoldIncome)}
                                ${makeRow('年収穫', totalRiceIncome)}
                            </div>
                            <div class="info-detail-group is-placeholder">
                                ${makeEmptyRow()}
                            </div>
                        </div>
                        
                        <!-- 右列：月支出・米消費 ＋ 独立した兵士 -->
                        <div class="info-detail-column">
                            <div class="info-detail-group">
                                ${makeRow('月支出', totalGoldConsume)}
                                ${makeRow('米消費', consumeRiceYear)}
                            </div>
                            <div class="info-detail-group">
                                ${makeRow('兵士', totalSoldiers)}
                            </div>
                        </div>
                    </div>

                    <!-- フッター（アクションボタン） -->
                    <div class="info-detail-footer info-detail-footer-end">
                        <div class="info-detail-actions">
                            <button class="daimyo-detail-action-btn" id="temp-kyoten-btn" ${castlesCount === 0 ? 'disabled' : ''}>拠点</button>
                            <button class="daimyo-detail-action-btn" id="temp-busho-btn" ${bushosCount === 0 ? 'disabled' : ''}>武将</button>
                            <button class="daimyo-detail-action-btn" id="temp-hime-btn" ${princessCount === 0 ? 'disabled' : ''}>姫</button>
                            <button class="daimyo-detail-action-btn" id="temp-faction-btn" ${!hasFaction ? 'disabled' : ''}>派閥</button>
                            <button class="daimyo-detail-action-btn" id="temp-diplo-btn">外交</button>
                        </div>
                    </div>
                </div>
            `;

            this._bindImageFallbacks(listContainer);

            document.getElementById('temp-kyoten-btn').onclick = (e) => {
                e.stopPropagation();
                this.showKyotenList(clan.id);
            };

            document.getElementById('temp-diplo-btn').onclick = (e) => {
                e.stopPropagation(); 
                this.showDiplomacyList(clan.id, clan.name, 'daimyo');
            };
            
            document.getElementById('temp-busho-btn').onclick = (e) => {
                e.stopPropagation();
                this.openBushoSelector('view_only', null, { 
                    customBushos: this.game.getClanBushos(clanId).filter(b => window.BushoStatusRules.isActive(b)),
                    customInfoHtml: `<div>${clan.name} 所属武将</div>`
                });
            };

            document.getElementById('temp-hime-btn').onclick = (e) => {
                e.stopPropagation();
                this.pushModal('princess_list', [false, clan.id, 'view_clan_princess']);
            };

            document.getElementById('temp-faction-btn').onclick = (e) => {
                e.stopPropagation();
                this.showFactionList(clan.id);
            };

            // ★情報画面ではスクロールバーは不要なので、位置を戻すだけにします
            listContainer.scrollTop = scrollPos;
        }
    }

    showDiplomacyList(id, name, type = 'daimyo', onClose = null) {
        this.pushModal('diplo_list', [id, name, type, onClose]);
    }
    
    _renderDiplomacyList(id, name, type, onClose, scrollPos = 0) {
        if (!this.diploCurrentTab) this.diploCurrentTab = 'daimyo';

        const isPc = document.body.classList.contains('is-pc'); // ★PCかスマホか調べる魔法を追加します

        let tabsHtml = null;
        if (type === 'daimyo') {
            tabsHtml = `
                <div class="busho-list-tabs">
                    <button class="busho-tab-btn ${this.diploCurrentTab === 'daimyo' ? 'active' : ''}" data-tab="daimyo">${isPc ? '大名家' : '大'}</button>
                    <button class="busho-tab-btn ${this.diploCurrentTab === 'kunishu' ? 'active' : ''}" data-tab="kunishu">${isPc ? '諸勢力' : '諸'}</button>
                </div>
            `;
        } else {
            this.diploCurrentTab = 'daimyo'; 
        }

        let relations = [];

        if (type === 'daimyo' && this.diploCurrentTab === 'daimyo') {
            const activeClans = this.game.clans.filter(c => c.id !== 0 && c.id !== id && this.game.getClanCastles(c.id).length > 0);
            relations = activeClans.map(c => {
                const rel = this.game.getRelation(id, c.id);
                return {
                    id: c.id,
                    name: c.name,
                    sentiment: rel ? rel.sentiment : 50,
                    // 婚姻は別列で示すため、関係列には基本statusだけを表示する。
                    status: rel ? (rel.status || "普通") : "普通",
                    trucePeriod: rel ? (rel.trucePeriod || 0) : 0,
                    isMarriage: rel ? rel.isMarriage === true : false
                };
            });
        } else if (type === 'daimyo' && this.diploCurrentTab === 'kunishu') {
            const activeKunishus = this.game.kunishuSystem.getAliveKunishus();
            relations = activeKunishus.map(k => {
                return {
                    id: k.id,
                    name: k.getName(this.game),
                    sentiment: k.getRelation(id, false),
                    status: k.daimyoRelations[id] ? k.daimyoRelations[id].status : "普通",
                    trucePeriod: k.daimyoRelations[id] ? (k.daimyoRelations[id].trucePeriod || 0) : 0,
                    isMarriage: false
                };
            });
        } else if (type === 'kunishu') {
            const kunishu = this.game.kunishuSystem.getKunishu(id);
            if (kunishu) {
                const activeClans = this.game.clans.filter(c => c.id !== 0 && this.game.getClanCastles(c.id).length > 0);
                relations = activeClans.map(c => {
                    return {
                        id: c.id,
                        name: c.name,
                        sentiment: kunishu.getRelation(c.id, false),
                        status: kunishu.daimyoRelations[c.id] ? kunishu.daimyoRelations[c.id].status : "普通",
                        trucePeriod: kunishu.daimyoRelations[c.id] ? (kunishu.daimyoRelations[c.id].trucePeriod || 0) : 0,
                        isMarriage: false
                    };
                });
            }
        }

        if (this.diploCurrentSortKey) {
            relations = this._prepareStableSortBase('diplomacy', relations, this.diploCurrentSortKey);
            relations.sort((a, b) => {
                let valA, valB;
                switch(this.diploCurrentSortKey) {
                    case 'name': valA = a.name; valB = b.name; break;
                    case 'sentiment': valA = a.sentiment; valB = b.sentiment; break;
                    case 'status':
                        const relationRank = { "自家": 0, "同盟": 1, "支配": 2, "従属": 3, "友好": 4, "和睦": 5, "普通": 6, "敵対": 7 };
                        valA = relationRank[a.status] !== undefined ? relationRank[a.status] : 6;
                        valB = relationRank[b.status] !== undefined ? relationRank[b.status] : 6;
                        break;
                    case 'period': valA = a.trucePeriod || 0; valB = b.trucePeriod || 0; break;
                    case 'marriage': valA = a.isMarriage ? 1 : 0; valB = b.isMarriage ? 1 : 0; break;
                }

                let fallbackCmp = 0;
                if (this.diploCurrentSortKey === 'name') {
                    fallbackCmp = this.isDiploSortAsc ? a.name.localeCompare(b.name, 'ja') : b.name.localeCompare(a.name, 'ja');
                }
                
                return this._compareForSort(valA, valB, this.isDiploSortAsc, fallbackCmp);
            });
            this._saveStableSortResult('diplomacy', relations);
        } else {
            relations.sort((a, b) => b.sentiment - a.sentiment);
            this._saveStableSortResult('diplomacy', null);
        }

        let items = [];
        relations.forEach(r => {
            let statusClass = "text-white";
            if (r.status === '敵対') statusClass = 'text-red';
            else if (['同盟', '支配', '従属', '婚姻', '和睦', '友好'].includes(r.status)) statusClass = 'text-green';

            const friendBarHtml = this._createBarHtml(r.sentiment, 'friend');

            let periodStr = "";
            if (r.status === '和睦' && r.trucePeriod > 0) {
                periodStr = `${r.trucePeriod}ヶ月`;
            }

            items.push({
                onClick: null, 
                cells: [
                    `<span class="col-daimyo-name list-text-strong">${r.name}</span>`,
                    friendBarHtml,
                    `<span class="col-relation ${statusClass}">${r.status}</span>`,
                    `<span class="col-period">${periodStr}</span>`,
                    `<span class="col-marriage">${r.isMarriage ? "◯" : ""}</span>`,
                    ""
                ]
            });
        });

        const getSortMark = (key) => this._getCommonSortMark(this.diploCurrentSortKey, this.isDiploSortAsc, key);

        // カスタムの列幅を指定するためのヘッダーを作ります
        const customHeaderCols = [
            `<span class="col-name-left" data-sort="name">勢力名${getSortMark('name')}</span>`,
            `<span data-sort="sentiment">友好度${getSortMark('sentiment')}</span>`,
            `<span data-sort="status">関係${getSortMark('status')}</span>`,
            `<span class="col-period" data-sort="period">期間${getSortMark('period')}</span>`,
            `<span data-sort="marriage">婚姻${getSortMark('marriage')}</span>`,
            '<span></span>'
        ];

        this._renderListModal({
            title: `${name} 外交関係`,
            tabsHtml: tabsHtml,
            headers: customHeaderCols,
            headerClass: "sortable-header diplo-list-header",
            itemClass: "diplo-list-item",
            listClass: "diplo-list-container",
            items: items,
            scrollPos: scrollPos,
            gridTemplateSp: "2fr 1.5fr 1fr 1fr 0.8fr 1.2fr",
            gridTemplatePc: "150px 100px 80px 80px 50px 1fr",
            onBack: onClose,
            onTabClick: (tabKey) => {
                this.diploCurrentTab = tabKey;
                const listEl = document.getElementById('selector-list');
                const scroll = listEl ? listEl.scrollTop : 0;
                this._renderDiplomacyList(id, name, type, onClose, scroll);
            },
            onSortClick: (sortKey) => {
                const defaultAscKeys = ['name', 'status'];
                const newState = this._toggleSortState(this.diploCurrentSortKey, this.isDiploSortAsc, sortKey, defaultAscKeys);
                this.diploCurrentSortKey = newState.key;
                this.isDiploSortAsc = newState.isAsc;
                const listEl = document.getElementById('selector-list');
                const scroll = listEl ? listEl.scrollTop : 0;
                this._renderDiplomacyList(id, name, type, onClose, scroll);
            }
        });
    }

    // 派閥再編で現在表示中の派閥一覧だけを更新します。
    // 旧専用modalを探したり新規openし直さず、共通Selectorの現在画面を正本として再描画します。
    refreshOpenFactionList(targetClanId = null) {
        const info = this.currentModalInfo;
        const elements = this.selectorView ? this.selectorView.getElements() : null;
        if (!info || info.pageType !== 'faction_list' || !elements || !elements.modal) return false;
        if (elements.modal.classList.contains('hidden') || this._commonModalSuspendedForChild) return false;

        const openClanId = info.args ? info.args[0] : null;
        if (targetClanId !== null && Number(openClanId) !== Number(targetClanId)) return false;

        const listEl = document.getElementById('selector-list');
        info.scrollPos = listEl ? listEl.scrollTop : (info.scrollPos || 0);
        this._renderCurrentModal();
        return true;
    }

    showFactionList(clanId, isDirect = false) {
        if (isDirect) {
            this.closeCommonModal(); 
        }
        this.pushModal('faction_list', [clanId, isDirect]);
    }

    _renderFactionList(clanId, isDirect, scrollPos = 0) {
        const clan = this.game.getClan(clanId);
        if (!clan) return;
        
        const bushos = this.game.getClanBushos(clanId).filter(b => window.BushoStatusRules.isActive(b));
        const factions = {};
        
        bushos.forEach(b => {
            const fId = b.factionId;
            if (!factions[fId]) {
                factions[fId] = { count: 0, leader: null };
            }
            factions[fId].count++;
            if (b.isFactionLeader) { factions[fId].leader = b; }
        });

        let fIds = Object.keys(factions).map(Number); // ★constからletに変更します
        const daimyo = bushos.find(b => b.isDaimyo);
        const daimyoFactionId = daimyo ? daimyo.factionId : -1;

        if (this.factionCurrentSortKey) {
            fIds = this._prepareStableSortBase('faction', fIds, this.factionCurrentSortKey); // ★共通の魔法
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

                let fallbackCmp = 0;
                if(this.factionCurrentSortKey === 'name'){
                    const nameA = getName(a, leaderA);
                    const nameB = getName(b, leaderB);
                    fallbackCmp = this.isFactionSortAsc ? nameA.localeCompare(nameB, 'ja') : nameB.localeCompare(nameA, 'ja');
                }
                
                return this._compareForSort(valA, valB, this.isFactionSortAsc, fallbackCmp);
            });
            this._saveStableSortResult('faction', fIds); // ★結果を保存
        } else {
            fIds.sort((a, b) => {
                if (a === daimyoFactionId) return -1; 
                if (b === daimyoFactionId) return 1;  
                if (a === 0) return 1;
                if (b === 0) return -1;
                return factions[b].count - factions[a].count; 
            });
            this._saveStableSortResult('faction', null); // ★リセット
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
                onClick: this._withChoiceSound(() => this.showFactionBushoList(clan.id, fId, factionNameStr)),
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

        const getSortMark = (key) => this._getCommonSortMark(this.factionCurrentSortKey, this.isFactionSortAsc, key);

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
        const clan = this.game.getClan(clanId);
        if (!clan) return;

        const targetBushos = this.game.getClanBushos(clanId).filter(b => window.BushoStatusRules.isActive(b) && (b.factionId || 0) === factionId);

        this.openBushoSelector('view_only', null, { 
            customBushos: targetBushos,
            customInfoHtml: `<div>${clan.name} ${factionName} 所属武将</div>`,
            isFactionView: true
        });
    }
    
    showPrisonerSelector(phaseType, captives, onConfirm, onBack) {
        const contextHtml = phaseType === 'hire'
            ? "<div>登用する武将を選択してください</div>"
            : "<div>処断する武将を選択してください</div>";
        const disabledIds = phaseType === 'hire'
            ? captives.filter(b => b.hasRefusedHire).map(b => Number(b.id))
            : [];

        // 捕虜だけの専用一覧は持たず、既存の「行動列なし」共通武将選択を使う。
        // allowDone は既存の行動非消費経路で、スマホ用の幅・タブ・ソートも共通化される。
        this.openBushoSelector('prisoner_treatment', null, {
            customBushos: captives,
            customInfoHtml: contextHtml,
            customTitle: "武将を選択（複数可）",
            customIsMulti: true,
            customDisabledIds: disabledIds,
            allowDone: true,
            onConfirm
        }, onBack);
    }

    showSettingsModal() {
        const modal = document.getElementById('settings-modal');
        const bgmSlider = document.getElementById('setting-bgm-volume');
        const bgmText = document.getElementById('setting-bgm-text');
        const seSlider = document.getElementById('setting-se-volume');
        const seText = document.getElementById('setting-se-text');

        if (!modal || !bgmSlider || !seSlider) return;

        if (window.AudioManager) {
            bgmSlider.value = Math.round(window.AudioManager.userBgmVolume * 100);
            bgmText.textContent = bgmSlider.value + '%';
            
            seSlider.value = Math.round(window.AudioManager.userSeVolume * 100);
            seText.textContent = seSlider.value + '%';
        }

        bgmSlider.oninput = (e) => {
            const val = e.target.value;
            bgmText.textContent = val + '%';
            if (window.AudioManager) {
                window.AudioManager.setBgmVolume(val / 100); 
            }
        };

        seSlider.oninput = (e) => {
            const val = e.target.value;
            seText.textContent = val + '%';
            if (window.AudioManager) {
                window.AudioManager.setSeVolume(val / 100);
            }
        };
        
        seSlider.onchange = () => {
             if (window.AudioManager) window.AudioManager.playSE('choice.ogg');
        };
        
        modal.classList.remove('hidden');
    }

    // ==========================================
    // ★リスト画面の共通生成工場（ステップ１）
    // ==========================================
    _createBarHtml(percent, type) {
        const safePercent = Math.min(100, Math.max(0, Number(percent) || 0));
        return `<div class="list-bar-cell"><div class="bar-bg bar-bg-${type}"><div class="bar-fill bar-fill-${type}" style="--bar-value:${safePercent}%;"></div></div></div>`;
    }

    _renderListModal(config) {
        this._stopActiveListRendering();
        const currentRenderId = this._currentListRenderId;

        const shell = this.selectorView.open({
            title: config.title || '',
            contextHtml: config.contextHtml || null,
            tabsHtml: config.tabsHtml || null,
            hideBackBtn: !!config.hideBackBtn,
            backLabel: config.backLabel || ((this.modalHistory && this.modalHistory.length > 0) ? '戻る' : '閉じる'),
            onBack: () => {
                if (config.onBack) config.onBack();
                this._currentListRenderId++;
                this.popModal();
            },
            onConfirm: config.onConfirm ? () => {
                this._currentListRenderId++;
                config.onConfirm();
            } : null,
            confirmDisabled: !!config.onConfirm
        });
        if (!shell) return;

        const { listContainer, tabsEl } = shell;
        listContainer.style.display = 'none';
        listContainer.innerHTML = '';
        // タブ切り替えとスコープ切り替えは一覧内容側の責務としてここで登録する。
        if (tabsEl && config.tabsHtml) {
            if (config.onTabClick) {
                tabsEl.querySelectorAll('.busho-tab-btn').forEach(btn => {
                    btn.onclick = () => {
                        if (window.AudioManager) window.AudioManager.playSE('choice.ogg');
                        config.onTabClick(btn.getAttribute('data-tab'));
                    };
                });
            }
            if (config.onScopeClick) {
                tabsEl.querySelectorAll('.busho-scope-btn').forEach(btn => {
                    btn.onclick = () => {
                        if (window.AudioManager) window.AudioManager.playSE('choice.ogg');
                        config.onScopeClick(btn.getAttribute('data-scope'));
                    };
                });
            }
        }

        listContainer.className = `list-container ${config.listClass || ''} hide-native-scroll`;

        if (config.gridTemplateSp) listContainer.style.setProperty('--grid-cols-sp', config.gridTemplateSp);
        else listContainer.style.removeProperty('--grid-cols-sp');
        
        if (config.gridTemplatePc) listContainer.style.setProperty('--grid-cols-pc', config.gridTemplatePc);
        else listContainer.style.removeProperty('--grid-cols-pc');

        const wrapperStyle = config.minWidth ? ` style="--list-min-width:${config.minWidth};"` : '';
        const wrapperClass = config.minWidth ? ' has-custom-min-width' : '';

        // ★軽量化：大量リストは「行データそのもの」も必要な分だけ作れるようにします。
        // config.items の代わりに itemCount + getItem(index) を渡せます。
        const hasLazyItems = Number.isFinite(config.itemCount) && typeof config.getItem === 'function';
        const totalItems = hasLazyItems ? Math.max(0, Number(config.itemCount) || 0) : ((config.items && config.items.length) || 0);
        const getItemAt = (index) => hasLazyItems ? config.getItem(index) : config.items[index];

        const buildItemHtml = (item, index) => {
            if (!item) return '';
            const extraClass = item.itemClass || '';
            const actionClass = typeof item.onClick === 'function' ? 'is-clickable' : 'is-static';
            const indexAttr = typeof item.onClick === 'function' ? `data-action-index="${index}"` : '';

            // ★追加：スクロールで順番がズレないよう、データ上の「本当の出席番号（index）」を見て色分けのシールを貼ります！
            const stripeClass = (index % 2 === 1) ? "row-striped" : "";

            // 先ほどの文字数を数える魔法は取り消して、シンプルな形に戻します
            const cells = item.cells.map(c => {
                const strC = String(c);
                return strC.trim().startsWith('<') ? strC : `<span>${strC}</span>`;
            }).join('');
            
            // ★変更：クラスのリストに ${stripeClass} を追加します
            return `<div class="select-item ${config.itemClass || ''} ${extraClass} ${stripeClass} ${actionClass}" ${indexAttr}>${cells}</div>`;
        };

        if (totalItems === 0) {
            let emptyHtml = '';
            if (config.headers && config.headers.length > 0) {
                const headerCols = config.headers.map(h => h.trim().startsWith('<') ? h : `<span>${h}</span>`).join('');
                emptyHtml += `<div class="list-header ${config.headerClass || ''}">${headerCols}</div>`;
            }
            emptyHtml += config.emptyHtml || '<div class="list-empty-message">データがありません。</div>';
            listContainer.innerHTML = `<div class="list-inner-wrapper${wrapperClass}"${wrapperStyle}>${emptyHtml}</div>`;
            listContainer.style.display = 'block';
            return;
        }

        const INITIAL_RENDER_COUNT = 30;
        const CHUNK_SIZE = 50;
        const VIRTUALIZE_THRESHOLD = 150; // ★これを超える件数のリストは「仮想スクロール」に切り替えます

        // ★「文字数」を数えて、文字数が多い場合だけ文字を小さくします
        // （仮想スクロールでは常に「今表示中の行」だけをチェックすれば十分なので引数なしにしました）
        const adjustTextFit = () => {
            if (config.skipTextFit) return;
            const listInner = listContainer.querySelector('.list-inner-wrapper');
            if (!listInner) return;
            const itemEls = listInner.querySelectorAll('.select-item');

            itemEls.forEach(itemEl => {
                const cells = itemEl.children;
                for (let j = 0; j < cells.length; j++) {
                    const cell = cells[j];

                    // 名前の列だけを対象にします
                    const isNameCol = cell.classList.contains('col-name') ||
                                      cell.classList.contains('col-daimyo-name') ||
                                      cell.classList.contains('col-kunishu-name') ||
                                      cell.classList.contains('col-faction-name') ||
                                      cell.classList.contains('col-princess-name') ||
                                      cell.classList.contains('col-castle-name') ||
                                      cell.classList.contains('col-leader-name') ||
                                      cell.classList.contains('col-father') ||
                                      cell.classList.contains('col-husband') ||
                                      cell.classList.contains('col-castellan');

                    if (!isNameCol) continue;

                    // ゲージやアイコンなどの複雑な要素がある場合はスキップします
                    if (cell.querySelector('.bar-bg') || cell.querySelector('.bar-bg-busho') || cell.querySelector('input') || cell.querySelector('img')) continue;

                    // ★追加：前回 ui_info_busho.js で「最初から縮めた状態」にした要素を見つけたら、二重処理によるチラつきを防ぐためロボットをストップさせます！
                    if (cell.querySelector('.compressed-list-text, .busho-compressed-text')) continue;

                    const textLen = cell.textContent.trim().length;

                    // 4文字を超える場合（5文字以上）のみ縮小します
                    if (textLen > 4) {
                        const scale = Math.max(0.6, 1.0 - ((textLen - 4) * 0.1));
                        cell.style.fontSize = `calc(100% * ${scale})`;
                    }
                }
            });
        };

        // ★一つ一つの行にクリックの監視をつけるのではなく、リストの大元に1つだけ監視をつけます！（イベントデリゲーション）
        const attachDelegatedClick = (innerWrapper) => {
            if (innerWrapper.dataset.eventDelegated) return;
            innerWrapper.dataset.eventDelegated = "true";
            innerWrapper.addEventListener('click', (e) => {
                const targetItem = e.target.closest('[data-action-index]');
                if (targetItem) {
                    const index = parseInt(targetItem.getAttribute('data-action-index'));
                    const item = getItemAt(index);
                    if (item && typeof item.onClick === 'function') {
                        // 大枠のイベントを行クリックとして扱うため、必要な情報だけを持つ
                        // 古いWebView互換のイベントオブジェクトへ置き換えて渡します。
                        item.onClick(this._createDelegatedListEvent(e, targetItem));
                    }
                }
            });
        };

        const attachSortClicks = () => {
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
        };

        // ==========================================
        // ★新機能：件数が多いリストは「仮想スクロール」にして、見えている行だけ描画します
        // ==========================================
        if (!config.disableVirtualization && totalItems > VIRTUALIZE_THRESHOLD) {
            let rowHeight = 40; // 仮の行の高さ（実測できたら後で補正します）
            const isMobile = !document.body.classList.contains('is-pc');
            const isTouchInput = document.body.classList.contains('is-touch-input');
            const BUFFER_ROWS = isMobile ? 10 : 15; // 低メモリ端末では画面外DOMを少しだけ減らします
            const WINDOW_STEP_ROWS = isMobile ? 4 : 2; // 数pxごとの全行作り直しを避け、見た目を変えずDOM churnを抑えます
            let lastRange = { start: -1, end: -1 };

            // 古いWebViewでは「仮想DOM差し替え」とCSS mandatory scroll-snapの組み合わせで、
            // snap対象が消えるたび次候補へ再評価され、指を離しても端まで自走することがあります。
            // タッチ入力の仮想一覧ではnative snapを止め、スクロール停止後の一回だけJSで行境界へ揃えます。
            // 横向きタブレットがPCレイアウトでも、古いWebViewのsnap自走対策は外しません。
            // マウス入力PCと150件以下の通常一覧は従来のCSS snapをそのまま使います。
            const useManagedMobileSnap = isTouchInput;
            const previousInlineScrollSnapType = listContainer.style.scrollSnapType || '';
            let managedSnapTimer = null;
            if (useManagedMobileSnap) {
                listContainer.style.scrollSnapType = 'none';
                listContainer.dataset.virtualManagedSnap = 'true';
            }

            let headerHtml = '';
            if (config.headers && config.headers.length > 0) {
                const headerCols = config.headers.map(h => h.trim().startsWith('<') ? h : `<span>${h}</span>`).join('');
                headerHtml = `<div class="list-header sortable-header ${config.headerClass || ''}">${headerCols}</div>`;
            }

            listContainer.innerHTML = `<div class="list-inner-wrapper${wrapperClass}"${wrapperStyle}>${headerHtml}<div class="virtual-scroll-body"></div></div>`;

            const innerWrapper = listContainer.querySelector('.list-inner-wrapper');
            const scrollBody = innerWrapper.querySelector('.virtual-scroll-body');

            // ★元々の行間の隙間(gap)の設定を、そのまま引き継ぎます
            const gapPx = parseFloat(window.getComputedStyle(innerWrapper).rowGap) || parseFloat(window.getComputedStyle(innerWrapper).gap) || 0;
            scrollBody.style.gap = `${gapPx}px`;

            attachDelegatedClick(innerWrapper);
            attachSortClicks();

            const renderVisibleWindow = (force = false) => {
                if (this._currentListRenderId !== currentRenderId) return;

                const viewportHeight = listContainer.clientHeight || 400;
                const scrollTop = listContainer.scrollTop;

                const rawStartIndex = Math.max(0, Math.floor(scrollTop / rowHeight) - BUFFER_ROWS);
                const startIndex = Math.floor(rawStartIndex / WINDOW_STEP_ROWS) * WINDOW_STEP_ROWS;
                const visibleRowCount = Math.ceil(viewportHeight / rowHeight) + BUFFER_ROWS * 2 + WINDOW_STEP_ROWS;
                const endIndex = Math.min(totalItems, startIndex + visibleRowCount);

                if (!force && startIndex === lastRange.start && endIndex === lastRange.end) return;
                lastRange = { start: startIndex, end: endIndex };

                const rowsHtml = [];
                for (let i = startIndex; i < endIndex; i++) {
                    rowsHtml.push(buildItemHtml(getItemAt(i), i));
                }

                scrollBody.style.paddingTop = `${startIndex * rowHeight}px`;
                scrollBody.style.paddingBottom = `${Math.max(0, (totalItems - endIndex) * rowHeight)}px`;
                scrollBody.innerHTML = rowsHtml.join('');

                if (!config.skipTextFit) requestAnimationFrame(adjustTextFit);
            };

            // ★追加：スクロールのたびに毎回計算しすぎないよう、アニメーションフレームとタイマーで間引きます！
            let scrollTicking = false;
            let scrollTimeout = null;
            let scrollRafId = null;
            let measureRafId = null;

            const scheduleManagedRowSnap = (delay = 120) => {
                if (!useManagedMobileSnap) return;
                if (managedSnapTimer) clearTimeout(managedSnapTimer);
                managedSnapTimer = setTimeout(() => {
                    managedSnapTimer = null;
                    if (this._currentListRenderId !== currentRenderId || !listContainer.isConnected || document.hidden) return;
                    const scrollbar = listContainer.customScrollbar;
                    if (scrollbar && scrollbar.isDraggingY) return;

                    const maxScrollTop = Math.max(0, listContainer.scrollHeight - listContainer.clientHeight);
                    if (maxScrollTop <= 0 || rowHeight <= 0) return;
                    const currentScrollTop = Math.max(0, Math.min(maxScrollTop, Number(listContainer.scrollTop) || 0));
                    const snappedScrollTop = Math.max(0, Math.min(maxScrollTop, Math.round(currentScrollTop / rowHeight) * rowHeight));
                    if (Math.abs(snappedScrollTop - currentScrollTop) <= 0.5) return;

                    // smoothは使わず1回だけ確定位置へ置く。scrollイベントが1回増えても次回は同値なので収束します。
                    listContainer.scrollTop = snappedScrollTop;
                }, Math.max(0, Number(delay) || 0));
            };
            if (useManagedMobileSnap) listContainer._scheduleVirtualRowSnap = scheduleManagedRowSnap;

            const scrollHandler = () => {
                // 指を離してスクロールがピタッと止まった時のための保険タイマーです
                if (scrollTimeout) clearTimeout(scrollTimeout);
                scrollTimeout = setTimeout(() => {
                    renderVisibleWindow();
                    scrollTicking = false;
                }, 50);

                if (scrollTicking) return;
                scrollTicking = true;

                scrollRafId = requestAnimationFrame(() => {
                    scrollRafId = null;
                    renderVisibleWindow();
                    scrollTicking = false; // 次のフレームですぐに描画を許可します
                });
                if (useManagedMobileSnap) scheduleManagedRowSnap(120);
            };

            // passive: true をつけることで、スクロール自体が指に吸い付くように滑らかになります
            listContainer.addEventListener('scroll', scrollHandler, { passive: true });
            listContainer._virtualScrollHandler = scrollHandler;
            listContainer._virtualScrollCleanup = () => {
                if (scrollTimeout) {
                    clearTimeout(scrollTimeout);
                    scrollTimeout = null;
                }
                if (scrollRafId !== null && typeof cancelAnimationFrame === 'function') {
                    cancelAnimationFrame(scrollRafId);
                    scrollRafId = null;
                }
                if (measureRafId !== null && typeof cancelAnimationFrame === 'function') {
                    cancelAnimationFrame(measureRafId);
                    measureRafId = null;
                }
                if (managedSnapTimer) {
                    clearTimeout(managedSnapTimer);
                    managedSnapTimer = null;
                }
                if (useManagedMobileSnap) {
                    if (listContainer._scheduleVirtualRowSnap === scheduleManagedRowSnap) listContainer._scheduleVirtualRowSnap = null;
                    delete listContainer.dataset.virtualManagedSnap;
                    listContainer.style.scrollSnapType = previousInlineScrollSnapType;
                }
                scrollTicking = false;
            };

            // ★スクロール位置を復元できるように、まず仮の行の高さで全体の高さだけ確保してからスクロールさせます
            scrollBody.style.paddingBottom = `${Math.max(0, (totalItems - 1) * rowHeight)}px`;
            listContainer.style.display = 'block';
            listContainer.scrollTop = config.scrollPos || 0;

            renderVisibleWindow(true);

            measureRafId = requestAnimationFrame(() => {
                measureRafId = null;
                // ★実際の行の高さを測って、仮の値とズレていたら補正して描画し直します
                const sample = scrollBody.querySelector('.select-item');
                if (sample) {
                    const measured = sample.offsetHeight + gapPx;
                    if (measured > 0 && Math.abs(measured - rowHeight) > 1) {
                        rowHeight = measured;
                        lastRange = { start: -1, end: -1 };
                        renderVisibleWindow(true);
                    }
                }
                if (this.ui && typeof this.ui.updateCustomScrollbars === 'function') {
                    this.ui.updateCustomScrollbars(listContainer);
                }
            });

            return;
        }

        // ==========================================
        // ★従来通りの描画（件数が少ないリスト向け・変更なし）
        // ==========================================
        let assumedItemHeight = 40; 
        let requiredItems = config.scrollPos ? Math.ceil(config.scrollPos / assumedItemHeight) + 20 : INITIAL_RENDER_COUNT;
        const initialLimit = Math.min(totalItems, Math.max(INITIAL_RENDER_COUNT, requiredItems));

        let initialHtmlParts = [];

        if (config.headers && config.headers.length > 0) {
            const headerCols = config.headers.map(h => h.trim().startsWith('<') ? h : `<span>${h}</span>`).join('');
            initialHtmlParts.push(`<div class="list-header sortable-header ${config.headerClass || ''}">${headerCols}</div>`);
        }

        for (let i = 0; i < initialLimit; i++) {
            initialHtmlParts.push(buildItemHtml(getItemAt(i), i));
        }

        for (let i = totalItems; i < 8; i++) {
            const emptyCells = config.headers ? config.headers.map(() => `<span></span>`).join('') : '';
            initialHtmlParts.push(`<div class="select-item ${config.itemClass || ''} is-static is-placeholder-row">${emptyCells}</div>`);
        }

        listContainer.innerHTML = `<div class="list-inner-wrapper${wrapperClass}"${wrapperStyle}>${initialHtmlParts.join('')}</div>`;

        const innerWrapper = listContainer.querySelector('.list-inner-wrapper');
        attachDelegatedClick(innerWrapper);

        if (!config.skipTextFit) requestAnimationFrame(adjustTextFit);
        attachSortClicks();

        listContainer.style.display = 'block';
        listContainer.scrollTop = config.scrollPos || 0;

        setTimeout(() => {
            if (this.ui && typeof this.ui.updateCustomScrollbars === 'function') {
                this.ui.updateCustomScrollbars(listContainer);
            }
        }, 10);

        if (totalItems > initialLimit) {
            let currentIndex = initialLimit;
            const renderNextChunk = () => {
                if (this._currentListRenderId !== currentRenderId) return;

                const chunkParts = [];
                const endLimit = Math.min(currentIndex + CHUNK_SIZE, totalItems);

                for (let i = currentIndex; i < endLimit; i++) {
                    chunkParts.push(buildItemHtml(getItemAt(i), i));
                }

                const innerWrapper = listContainer.querySelector('.list-inner-wrapper');
                if (innerWrapper) {
                    innerWrapper.insertAdjacentHTML('beforeend', chunkParts.join(''));
                }

                if (!config.skipTextFit) requestAnimationFrame(adjustTextFit);
                currentIndex = endLimit;

                setTimeout(() => {
                    if (this.ui && typeof this.ui.updateCustomScrollbars === 'function') {
                        this.ui.updateCustomScrollbars(listContainer);
                    }
                }, 10);

                if (currentIndex < totalItems) {
                    requestAnimationFrame(renderNextChunk);
                }
            };
            requestAnimationFrame(renderNextChunk);
        }
    }

    // ==========================================
    // ★姫一覧＆姫選択の魔法（共通モーダル対応版）
    // ==========================================

    showPrincessList() {
        this.pushModal('princess_list', [false, null, null]);
    }

    showPrincessSelector(targetCastleId, doerId) {
        this.pushSelectionModal('princess_list', [true, targetCastleId, doerId]);
    }
    
    _renderPrincessList(isSelectMode, targetCastleId, doerId, scrollPos = 0) {
        const myClanId = this.game.playerClanId;
        const myClan = this.game.getClan(myClanId);
        
        let myPrincesses = [];
        if (myClan) {
            let pIds = Array.isArray(myClan.princessIds) ? [...myClan.princessIds] : [];
            const myBushos = this.game.getClanBushos(myClanId).filter(b => window.BushoStatusRules.isActive(b));
            myBushos.forEach(b => {
                if (Array.isArray(b.wifeIds)) {
                    b.wifeIds.forEach(wId => {
                        if (!pIds.includes(wId)) {
                            pIds.push(wId);
                        }
                    });
                }
            });
            myPrincesses = pIds
                .map(id => this.game.getPrincess(id))
                .filter(p => p !== undefined); 
        }

        let princesses = [];
        let tabsHtml = null;
        
        if (isSelectMode) {
            // ★自家の大名を取得します
            const myDaimyo = this.game.getClanDaimyo(myClanId);
            
            princesses = myPrincesses.filter(p => {
                // 未婚でなければリストに入れません
                if (p.status !== 'unmarried') return false;
                
                // ★大名が存在し、一門であるかチェックします
                if (myDaimyo) {
                    const pFamily = Array.isArray(p.familyIds) ? p.familyIds : [];
                    const dFamily = Array.isArray(myDaimyo.familyIds) ? myDaimyo.familyIds : [];
                    if (pFamily.some(fId => dFamily.includes(fId))) {
                        return true;
                    }
                }
                return false; // 一門でなければリストから除外します
            });
            this.selectedPrincessId = null; 
        } else if (doerId === 'view_clan_princess') {
            const viewClanId = targetCastleId;
            const viewClan = this.game.getClan(viewClanId);
            let pIds = viewClan && Array.isArray(viewClan.princessIds) ? [...viewClan.princessIds] : [];
            const clanBushos = this.game.getClanBushos(viewClanId).filter(b => window.BushoStatusRules.isActive(b));
            clanBushos.forEach(b => {
                if (Array.isArray(b.wifeIds)) {
                    b.wifeIds.forEach(wId => {
                        if (!pIds.includes(wId)) pIds.push(wId);
                    });
                }
            });
            princesses = pIds.map(id => this.game.getPrincess(id)).filter(p => p !== undefined && window.LifeStatusRules.isPresent(p));
        } else if (doerId === 'view_busho_wife') {
            const targetBusho = this.game.getBusho(targetCastleId);
            let pIds = targetBusho && Array.isArray(targetBusho.wifeIds) ? targetBusho.wifeIds : [];
            princesses = pIds.map(id => this.game.getPrincess(id)).filter(p => p !== undefined && window.LifeStatusRules.isPresent(p));
        } else {
            if (!this.princessCurrentScope) this.princessCurrentScope = 'clan';

            if (this.princessCurrentScope === 'clan' && myPrincesses.length === 0) {
                this.princessCurrentScope = 'all';
            }
            
            if (this.princessCurrentScope === 'clan') {
                princesses = myPrincesses;
            } else {
                princesses = this.game.princesses.filter(p => window.LifeStatusRules.isPresent(p));
            }

            const isPc = document.body.classList.contains('is-pc'); // ★PCかスマホか調べる魔法を追加します

            tabsHtml = `
                <div class="busho-scope-tabs">
                    <button class="busho-scope-btn ${this.princessCurrentScope === 'clan' ? 'active' : ''}" data-scope="clan">${isPc ? '自家' : '自'}</button>
                    <button class="busho-scope-btn ${this.princessCurrentScope === 'all' ? 'active' : ''}" data-scope="all">${isPc ? '全国' : '全'}</button>
                </div>
            `;
        }

        if (this.princessCurrentSortKey) {
            princesses = this._prepareStableSortBase('princess', princesses, this.princessCurrentSortKey); // ★共通の魔法
            princesses.sort((a, b) => {
                let valA, valB;
                const fatherA = this.game.getBusho(a.realFatherId);
                const fatherB = this.game.getBusho(b.realFatherId);
                const husbandA = this.game.getBusho(a.husbandId);
                const husbandB = this.game.getBusho(b.husbandId);
                const clanA = this.game.getClan(a.currentClanId);
                const clanB = this.game.getClan(b.currentClanId);

                switch(this.princessCurrentSortKey) {
                    case 'name': 
                        valA = a.yomi || a.name; 
                        valB = b.yomi || b.name; 
                        break;
                    case 'clan': 
                        valA = clanA ? (clanA.yomi || clanA.name) : "んんん"; 
                        valB = clanB ? (clanB.yomi || clanB.name) : "んんん"; 
                        break;
                    case 'age': 
                        valA = this.game.year - a.birthYear; 
                        valB = this.game.year - b.birthYear; 
                        break;
                    case 'family': 
                        const getFamilyScore = (p, clan) => {
                            let mark = 0;
                            if (clan) {
                                const daimyo = this.game.getBusho(clan.leaderId);
                                if (daimyo) {
                                    const pFamily = Array.isArray(p.familyIds) ? p.familyIds : [];
                                    const dFamily = Array.isArray(daimyo.familyIds) ? daimyo.familyIds : [];
                                    if (pFamily.some(fId => dFamily.includes(fId))) mark = 1;
                                }
                            }
                            return mark;
                        };
                        valA = getFamilyScore(a, clanA); 
                        valB = getFamilyScore(b, clanB); 
                        break;
                    case 'father': 
                        valA = fatherA ? (fatherA.yomi || fatherA.name) : "んんん"; 
                        valB = fatherB ? (fatherB.yomi || fatherB.name) : "んんん"; 
                        break;
                    case 'husband': 
                        valA = husbandA ? (husbandA.yomi || husbandA.name) : "んんん"; 
                        valB = husbandB ? (husbandB.yomi || husbandB.name) : "んんん"; 
                        break;
                }

                const nameA = a.yomi || a.name;
                const nameB = b.yomi || b.name;
                const fallbackCmp = this.isPrincessSortAsc ? nameA.localeCompare(nameB, 'ja') : nameB.localeCompare(nameA, 'ja');
                
                return this._compareForSort(valA, valB, this.isPrincessSortAsc, fallbackCmp);
            });
            this._saveStableSortResult('princess', princesses); // ★結果を保存
        } else {
            this._saveStableSortResult('princess', null); // ★リセット
        }

        const items = princesses.map(p => {
            const age = this.game.year - p.birthYear + 1;
            const father = this.game.getBusho(p.realFatherId);
            const husband = this.game.getBusho(p.husbandId);
            
            const targetClanId = Number(p.currentClanId) || 0;
            const targetClan = this.game.getClan(targetClanId);
            const clanName = targetClan ? targetClan.name : "無所属";

            let familyMark = "";
            if (targetClan) {
                const daimyo = this.game.getBusho(targetClan.leaderId);
                if (daimyo) {
                    const pFamily = Array.isArray(p.familyIds) ? p.familyIds : [];
                    const dFamily = Array.isArray(daimyo.familyIds) ? daimyo.familyIds : [];
                    if (pFamily.some(fId => dFamily.includes(fId))) familyMark = "◯";
                }
            }

            const isSelected = this.commonSelectedIds && this.commonSelectedIds.includes(p.id);
            return {
                onClick: isSelectMode ? (e) => this.handleCommonSelect(p.id, e.currentTarget, false) : this._withChoiceSound(() => this.showPrincessDetail(p.id)),
                cells: [
                    `<strong class="col-princess-name">${p.name}</strong>`,
                    `<span class="col-clan">${clanName}</span>`,
                    `<span class="col-age">${age}</span>`,
                    `<span class="col-family">${familyMark}</span>`,
                    `<span class="col-father">${father ? father.name : "不明"}</span>`,
                    `<span class="col-husband">${husband ? husband.name : "なし"}</span>`,
                    `<span class="pc-only"></span>` 
                ],
                itemClass: isSelectMode && isSelected ? "selected" : ""
            };
        });

        let contextHtml = null;
        if (isSelectMode) {
            contextHtml = "<div>嫁がせる姫を選択してください</div>";
        }

        const getSortMark = (key) => this._getCommonSortMark(this.princessCurrentSortKey, this.isPrincessSortAsc, key);

        this._renderListModal({
            title: "姫一覧",
            contextHtml: contextHtml,
            tabsHtml: tabsHtml,
            headers: [
                `<span data-sort="name">姫${getSortMark('name')}</span>`,
                `<span data-sort="clan">勢力${getSortMark('clan')}</span>`,
                `<span data-sort="age">年齢${getSortMark('age')}</span>`,
                `<span data-sort="family">一門${getSortMark('family')}</span>`,
                `<span data-sort="father">父親${getSortMark('father')}</span>`,
                `<span data-sort="husband">配偶者${getSortMark('husband')}</span>`,
                `<span class="pc-only"></span>`
            ],
            headerClass: "sortable-header princess-list-header",
            itemClass: "princess-list-item",
            listClass: "princess-list-container",
            items: items,
            scrollPos: scrollPos,
            gridTemplateSp: "1.3fr 1.5fr 0.8fr 0.8fr 1.5fr 1.5fr",
            gridTemplatePc: "95px 100px 50px 50px 100px 100px 1fr",
            // 選択モードも共通のmodalHistoryへ一段だけ戻す。外交・自家婚姻で戻り先を直書きしない。
            onBack: null,
            onConfirm: isSelectMode ? () => this.confirmPrincessSelection(targetCastleId, doerId) : null,
            onScopeClick: (scopeKey) => {
                this.princessCurrentScope = scopeKey;
                this._saveStableSortResult('princess', null); // ★追加：スコープ変更時にソートの記憶をリセット
                this._renderPrincessList(isSelectMode, targetCastleId, doerId, 0);
            },
            onSortClick: (sortKey) => {
                const defaultAscKeys = ['name', 'clan', 'father', 'husband'];
                const newState = this._toggleSortState(this.princessCurrentSortKey, this.isPrincessSortAsc, sortKey, defaultAscKeys);
                this.princessCurrentSortKey = newState.key;
                this.isPrincessSortAsc = newState.isAsc;
                const listEl = document.getElementById('selector-list');
                const scroll = listEl ? listEl.scrollTop : 0;
                this._renderPrincessList(isSelectMode, targetCastleId, doerId, scroll);
            }
        });
        
        if (isSelectMode) this.updateCommonConfirmBtn();
    }

    confirmPrincessSelection(targetCastleId, doerId) {
        if (!this.commonSelectedIds || this.commonSelectedIds.length === 0) return;
        const selectedId = this.commonSelectedIds[0];
        
        this.game.commandSystem.handleBushoSelection('marriage_princess', [selectedId], targetCastleId, { doerId: doerId });
    }
    
    // ==========================================
    // ★城主委任リストの魔法（共通モーダル対応版）
    // ==========================================
    showDelegateListModal() {
        this.closeCommonModal(); 
        this.pushModal('delegate_list', []);
    }

    _renderDelegateList(scrollPos = 0) {
        const daimyo = this.game.getClanDaimyo(this.game.playerClanId);
        const daimyoCastleId = daimyo ? daimyo.castleId : -1;
        const myCastles = this.game.getClanCastles(this.game.playerClanId).filter(c => c.id !== daimyoCastleId);

        const isAllDelegated = myCastles.length > 0 && myCastles.every(c => c.isDelegated);
        let toggleBtnClass = isAllDelegated ? "btn-toggle-delegated" : "btn-toggle-direct";

        const contextHtml = `<button id="btn-toggle-all-delegate" data-se="choice.ogg" class="btn-secondary btn-small ${toggleBtnClass}">一括</button>`;

        let items = [];
        myCastles.forEach(c => {
            const statusClass = c.isDelegated ? 'text-blue' : 'text-red';
            const statusText = c.isDelegated ? '委任' : '直轄';
            const attackText = c.allowAttack ? '許可' : '不可';
            const attackClass = c.allowAttack ? 'text-blue' : 'text-gray';
            const moveText = c.allowMove ? '許可' : '不可';
            const moveClass = c.allowMove ? 'text-blue' : 'text-gray';
            const attackDisplay = c.isDelegated ? `<span class="${attackClass}">${attackText}</span>` : `<span class="text-gray"></span>`;
            const moveDisplay = c.isDelegated ? `<span class="${moveClass}">${moveText}</span>` : `<span class="text-gray"></span>`;

            items.push({
                onClick: this._withChoiceSound(() => this.showDelegateSettingModal(c.id)),
                cells: [
                    `<span class="col-castle-name col-name-left list-text-strong">${c.name}</span>`,
                    attackDisplay,
                    moveDisplay,
                    `<span class="${statusClass} list-text-strong">${statusText}</span>`
                ]
            });
        });

        this._renderListModal({
            title: "委任設定",
            contextHtml: contextHtml,
            headers: ["拠点名", "城攻", "武将移動", "状態"],
            headerClass: "delegate-list-header",
            itemClass: "delegate-list-item",
            listClass: "delegate-list-container",
            items: items,
            emptyHtml: '<div class="list-empty-message">委任できる拠点がありません。</div>',
            scrollPos: scrollPos,
            gridTemplateSp: "1.5fr 1fr 1fr 1fr",
            gridTemplatePc: "200px 100px 100px 100px"
        });

        // contextHtml は _renderListModal() 内で同期生成済みなので、旧timerを挟まず現在DOMへ直接bindする。
        // 画面を素早く切り替えた時に古い委任一覧のクロージャが次の固定DOMへ結び付く経路を作らない。
        const toggleAllBtn = document.getElementById('btn-toggle-all-delegate');
        if (toggleAllBtn) {
            toggleAllBtn.onclick = () => {
                const newState = !isAllDelegated;
                myCastles.forEach(c => c.isDelegated = newState);
                const listContainer = document.getElementById('selector-list');
                this._renderDelegateList(listContainer ? listContainer.scrollTop : 0);
            };
        }
    }

    showDelegateSettingModal(castleId) {
        this.pushModal('delegate_setting', [castleId]);
    }

    _renderDelegateSetting(castleId, scrollPos = 0) {
        const castle = this.game.getCastle(castleId);
        if (!castle) return;

        const shell = this._openInfoShell(`${castle.name}の委任設定`);
        if (!shell) return;
        const { listContainer } = shell;

        if (listContainer) {
            listContainer.className = 'list-container hide-native-scroll';
            listContainer.style.display = 'block';
            listContainer.innerHTML = `
                <div class="delegate-setting-panel">
                    <div class="delegate-setting-mode-buttons">
                        <button id="btn-direct-control" data-se="choice.ogg" class="delegate-btn ${!castle.isDelegated ? 'active' : ''}">直轄</button>
                        <button id="btn-delegate-control" data-se="choice.ogg" class="delegate-btn ${castle.isDelegated ? 'active' : ''}">委任</button>
                    </div>
                    
                    <div id="delegate-options" class="delegate-options ${castle.isDelegated ? 'is-enabled' : 'is-disabled'}">
                        <div class="delegate-option-row">
                            <span class="delegate-option-label">城攻め：</span>
                            <button id="btn-attack-deny" data-se="choice.ogg" class="delegate-sub-btn ${!castle.allowAttack ? 'active' : ''}" ${!castle.isDelegated ? 'disabled' : ''}>不可</button>
                            <button id="btn-attack-allow" data-se="choice.ogg" class="delegate-sub-btn ${castle.allowAttack ? 'active-allow' : ''}" ${!castle.isDelegated ? 'disabled' : ''}>許可</button>
                        </div>
                        <div>
                            <span class="delegate-option-label">武将移動：</span>
                            <button id="btn-move-deny" data-se="choice.ogg" class="delegate-sub-btn ${!castle.allowMove ? 'active' : ''}" ${!castle.isDelegated ? 'disabled' : ''}>不可</button>
                            <button id="btn-move-allow" data-se="choice.ogg" class="delegate-sub-btn ${castle.allowMove ? 'active-allow' : ''}" ${!castle.isDelegated ? 'disabled' : ''}>許可</button>
                        </div>
                    </div>
                </div>
            `;

            const updateView = () => this._renderDelegateSetting(castleId, listContainer.scrollTop);

            document.getElementById('btn-direct-control').onclick = () => {
                castle.isDelegated = false;
                updateView();
            };
            document.getElementById('btn-delegate-control').onclick = () => {
                castle.isDelegated = true;
                updateView();
            };
            document.getElementById('btn-attack-deny').onclick = () => {
                castle.allowAttack = false;
                updateView();
            };
            document.getElementById('btn-attack-allow').onclick = () => {
                castle.allowAttack = true;
                updateView();
            };
            document.getElementById('btn-move-deny').onclick = () => {
                castle.allowMove = false;
                updateView();
            };
            document.getElementById('btn-move-allow').onclick = () => {
                castle.allowMove = true;
                updateView();
            };
        }
    }
    
    // ==========================================
    // ★ここから追加：大名選択の確認画面の魔法！
    // ==========================================
    showDaimyoConfirmModal(clanId, clanName, soldiers, leader, onStart) {
        if (!this.ui.daimyoConfirmModal) return;

        // ★選択中の大名を記憶して、光を更新します
        this.ui.selectedDaimyoId = clanId;
        this.ui.updateCastleGlows();

        // ★追加：大名を選んだら、マップをスッキリさせるために名前シールを隠す合図を出します！
        document.body.classList.add('hide-daimyo-labels');
        
        // ★追加：「操作する勢力を選択してください」の案内板も隠します！
        const mapGuide = document.getElementById('map-guide');
        if (mapGuide) mapGuide.classList.add('hidden');

        this.ui.daimyoConfirmModal.classList.remove('hidden');
        
        // ★ここから追加：独立させたボタンを表示する魔法です
        const confirmButtons = document.querySelector('.daimyo-confirm-buttons');
        if (confirmButtons) confirmButtons.classList.remove('hidden');
        
        // ★修正：大名情報が出た時に「シナリオ選択に戻る」ボタンを確実に隠す魔法です！
        const backToScenarioBtn = document.getElementById('btn-back-to-scenario');
        if (backToScenarioBtn) backToScenarioBtn.classList.add('hidden');
        
        // 大名の情報を集めて合算します
        const clanCastles = this.game.getClanCastles(clanId);
        const castlesCount = clanCastles.length;
        
        let totalPopulation = 0;
        let totalKokudaka = 0;
        let totalCommerce = 0;
        let totalGold = 0;
        let totalRice = 0;
        let totalHorses = 0;
        let totalGuns = 0;
        
        clanCastles.forEach(c => {
            totalPopulation += (c.population || 0);
            totalKokudaka += (c.kokudaka || 0);
            totalCommerce += (c.commerce || 0);
            totalGold += (c.gold || 0);
            totalRice += (c.rice || 0);
            totalHorses += (c.horses || 0);
            totalGuns += (c.guns || 0);
        });

        // 武将の数と姫の数も数えます
        const bushosCount = this.game.getClanBushos(clanId).filter(b => window.LifeStatusRules.isPresent(b)).length;
        const clanData = this.game.getClan(clanId);
        const princessCount = clanData && clanData.princessIds ? clanData.princessIds.length : 0;
        const clanYomi = clanData ? (clanData.yomi || "") : "";

        let faceHtml = "";
        if (leader && leader.faceIcon) {
            faceHtml = `<img src="data/images/faceicons/${leader.faceIcon}" class="daimyo-confirm-face" data-hide-on-error="true">`;
        } else {
            faceHtml = `<div class="daimyo-confirm-face daimyo-confirm-face-empty"></div>`;
        }

        const makeRow = (label, value) => {
            const longLabelClass = label.length >= 3 ? ' is-long-label' : '';
            return `<div class="daimyo-confirm-stat-box"><span class="daimyo-confirm-stat-label${longLabelClass}">${label}</span><span class="daimyo-confirm-stat-value">${value}</span></div>`;
        };
        const makeEmptyRow = () => `<div class="daimyo-confirm-stat-box is-placeholder"><span>&nbsp;</span><span>&nbsp;</span></div>`;

        if (this.ui.daimyoConfirmBody) {
            this.ui.daimyoConfirmBody.innerHTML = `
                <h3>勢力情報</h3>
                <div class="scroll-wrapper no-custom-scrollbar daimyo-confirm-scroll">
                    <div class="list-container hide-native-scroll daimyo-confirm-list">
                        <div class="kyoten-detail-wrapper daimyo-confirm-info">
                            
                            <!-- 【ヘッダー部】 左上に顔グラ、右にテキスト情報 -->
                            <div class="daimyo-confirm-header">
                                <div class="daimyo-confirm-face-column">
                                    ${faceHtml}
                                </div>
                                <div class="daimyo-confirm-main">
                                    <!-- 勢力名 -->
                                    <div class="daimyo-confirm-title-row">
                                        <div class="info-detail-title-block">
                                            <span class="daimyo-confirm-yomi">${clanYomi}</span>
                                            <span class="daimyo-confirm-name">${clanName}</span>
                                        </div>
                                    </div>
                                    <!-- 大名 -->
                                    <div class="daimyo-confirm-subinfo">
                                        <div class="daimyo-confirm-owner">大名 <span class="daimyo-confirm-owner-value">${leader ? leader.name : "不明"}</span></div>
                                    </div>
                                </div>
                            </div>

                            <!-- 【ステータス部：上段】 -->
                            <div class="daimyo-confirm-group daimyo-confirm-group-upper">
                                <div class="daimyo-confirm-grid">
                                    ${makeRow('拠点', castlesCount)}
                                    ${makeRow('武将', bushosCount)}
                                    ${makeRow('姫', princessCount)}
                                </div>
                                <div class="daimyo-confirm-grid">
                                    ${makeRow('人口', totalPopulation)}
                                    ${makeRow('石高', totalKokudaka)}
                                    ${makeRow('鉱山', totalCommerce)}
                                </div>
                            </div>

                            <!-- 【ステータス部：下段】 -->
                            <div class="info-detail-group">
                                <div class="daimyo-confirm-grid">
                                    ${makeEmptyRow()}
                                    ${makeRow('軍馬', totalHorses)}
                                    ${makeRow('鉄砲', totalGuns)}
                                </div>
                                <div class="daimyo-confirm-grid">
                                    ${makeRow('兵士', soldiers)}
                                    ${makeRow('金', totalGold)}
                                    ${makeRow('兵糧', totalRice)}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            `;
        }
        
        if (this.ui.daimyoConfirmBody) this._bindImageFallbacks(this.ui.daimyoConfirmBody);

        const startBtn = document.getElementById('daimyo-confirm-start-btn');
        if (startBtn) {
            startBtn.onclick = () => {
                if (window.AudioManager) {
                    window.AudioManager.playBGM('SC_ex_Town2_Fortress.ogg');
                }

                this.ui.daimyoConfirmModal.classList.add('hidden');
                if (confirmButtons) confirmButtons.classList.add('hidden'); // 分離したボタンも隠す
                
                this.ui.selectedDaimyoId = null; 
                document.body.classList.remove('daimyo-select-mode'); 
                document.body.classList.remove('hide-daimyo-labels'); 
                onStart();
            };
        }
        const backBtn = document.getElementById('daimyo-confirm-back-btn');
        if (backBtn) {
            backBtn.onclick = () => {
                this.ui.selectedDaimyoId = null; 
                this.ui.updateCastleGlows();     
                document.body.classList.remove('hide-daimyo-labels'); 
                this.ui.renderMap(); 
            };
        }
    }
    
    // ==========================================
    // ★諸勢力情報の魔法
    // ==========================================
    showKunishuDetail(kunishuId) {
        this.pushModal('kunishu_detail', [kunishuId]);
    }

    _renderKunishuDetail(kunishuId, scrollPos = 0) {
        const kunishu = this.game.kunishuSystem.getKunishu(kunishuId);
        if (!kunishu) return;

        const shell = this._openInfoShell("諸勢力情報");
        if (!shell) return;
        const { listContainer } = shell;

        const leader = this.game.getBusho(kunishu.leaderId);
        const leaderName = leader ? leader.name.replace('|', '') : "不明";
        let baseCastleName = "不明";
        let provinceName = "不明";
        let provinceYomi = "";
        if (kunishu.castleId) {
            const baseCastle = this.game.getCastle(kunishu.castleId);
            if (baseCastle) {
                baseCastleName = baseCastle.name;
                if (this.game.provinces) {
                    const province = this.game.getProvince(baseCastle.provinceId);
                    if (province) {
                        provinceName = province.province;
                        provinceYomi = province.provinceYomi || "";
                    }
                }
            }
        }

        const bushosCount = this.game.kunishuSystem.getKunishuMembers(kunishuId).length;
        const kunishuName = kunishu.getName(this.game);
        const kunishuYomi = kunishu.yomi || "";
        const ideology = kunishu.ideology || "地縁";

        // 諸勢力のイデオロギーカラー（大名家のCSSを流用します）
        let ideologyClass = "ideology-chudo";
        if (ideology === '宗教') ideologyClass = "ideology-hoshu"; 
        else if (ideology === '傭兵') ideologyClass = "ideology-kakushin";

        const ideologyHtml = `<div class="daimyo-detail-ideology info-detail-ideology ${ideologyClass}">${ideology}</div>`;

        let faceSrc = leader && leader.faceIcon ? `data/images/faceicons/${leader.faceIcon}` : "data/images/faceicons/unknown_face.webp";

        const makeRow = (label, value) => {
            const longLabelClass = label.length >= 3 ? ' is-long-label' : '';
            return `<div class="info-detail-stat-box"><span class="info-detail-stat-label${longLabelClass}">${label}</span><span class="info-detail-stat-value">${value}</span></div>`;
        };
        const makeEmptyRow = () => `<div class="info-detail-stat-box is-placeholder"><span>&nbsp;</span><span>&nbsp;</span></div>`;

        if (listContainer) {
            listContainer.className = 'list-container hide-native-scroll';
            listContainer.style.display = 'block';
            listContainer.innerHTML = `
                <div class="kyoten-detail-wrapper info-detail-wrapper">
                    
                    <!-- 【ヘッダー部】 左上に顔グラ、右にテキスト情報 -->
                    <div class="info-detail-header">
                        <div class="info-detail-face-column">
                            <img src="${faceSrc}" class="info-detail-face" data-face-fallback="data/images/faceicons/unknown_face.webp">
                        </div>
                        <div class="info-detail-main">
                            <!-- 国名＆諸勢力名 -->
                            <div class="info-detail-title-row">
                                <div class="info-detail-title-block">
                                    <span class="info-detail-yomi">${provinceYomi}</span>
                                    <span class="info-detail-name">${provinceName}</span>
                                </div>
                                <div class="info-detail-title-block">
                                    <span class="info-detail-yomi">${kunishuYomi}</span>
                                    <span class="info-detail-name">${kunishuName}</span>
                                </div>
                            </div>
                            <!-- 頭領＆イデオロギー -->
                            <div class="info-detail-subinfo">
                                <div class="info-detail-owner-line">頭領 <span class="info-detail-owner-value">${leaderName}</span></div>
                                ${ideologyHtml}
                            </div>
                        </div>
                    </div>

                    <!-- 【ステータス部：上段】 -->
                    <div class="info-detail-grid info-detail-grid-upper">
                        <!-- 左列：武将・所在・空箱 -->
                        <div class="info-detail-group">
                            ${makeRow('武将', bushosCount)}
                            ${makeRow('所在', baseCastleName)}
                            ${makeEmptyRow()}
                        </div>
                        
                        <!-- 中央列：兵士・訓練・士気 -->
                        <div class="info-detail-group">
                            ${makeRow('兵士', kunishu.soldiers)}
                            ${makeRow('訓練', kunishu.training)}
                            ${makeRow('士気', kunishu.morale)}
                        </div>

                        <!-- 右列：軍馬・鉄砲・防御 -->
                        <div class="info-detail-group">
                            ${makeRow('軍馬', kunishu.horses || 0)}
                            ${makeRow('鉄砲', kunishu.guns || 0)}
                            ${makeRow('防御', kunishu.defense)}
                        </div>
                    </div>

                    <!-- フッター（アクションボタン） -->
                    <div class="info-detail-footer info-detail-footer-end">
                        <div class="info-detail-actions">
                            <button class="daimyo-detail-action-btn" id="temp-kunishu-busho-btn">武将</button>
                            <button class="daimyo-detail-action-btn" id="temp-kunishu-diplo-btn">外交</button>
                        </div>
                    </div>
                </div>
            `;

            this._bindImageFallbacks(listContainer);

            document.getElementById('temp-kunishu-diplo-btn').onclick = (e) => {
                e.stopPropagation(); 
                this.showDiplomacyList(kunishu.id, kunishuName, 'kunishu');
            };

            document.getElementById('temp-kunishu-busho-btn').onclick = (e) => {
                e.stopPropagation();
                this.openBushoSelector('view_only', null, { 
                    customBushos: this.game.kunishuSystem.getKunishuMembers(kunishuId),
                    customInfoHtml: `<div>${kunishuName} 所属武将</div>`
                });
            };

            // ★情報画面ではスクロールバーは不要なので、位置を戻すだけにします
            listContainer.scrollTop = scrollPos;
        }
    }

    // ==========================================
    // ★諸勢力一覧＆選択の魔法（共通モーダル対応版）
    // ==========================================
    showKunishuList(kunishus, castle, onBack) {
        this.pushModal('kunishu_list', [kunishus, castle, false, onBack, null]);
    }

    showAllKunishuList() {
        this.closeCommonModal(); 
        const allKunishus = this.game.kunishuSystem.getAliveKunishus();
        this.pushModal('kunishu_list', [allKunishus, null, false, null, null]);
    }

    // ★新規追加：鎮圧などで諸勢力を選択するための窓口
    showKunishuSelector(kunishus, castle, onConfirm, onBack = null) {
        this.closeCommonModal();
        this.pushModal('kunishu_list', [kunishus, castle, true, onBack, onConfirm]);
    }

    // ★引数に isSelectMode と onConfirm を追加して両対応にしました
    _renderKunishuList(kunishus, castle, isSelectMode = false, onBack = null, onConfirm = null, scrollPos = 0) {
        let contextHtml = `<div>${castle ? castle.name + 'に存在する諸勢力です' : '全国の諸勢力一覧です'}</div>`;
        if (isSelectMode) {
            contextHtml = "<div>対象とする諸勢力をお選びください</div>";
        }
        let modeClassStr = isSelectMode ? "" : "view-mode";

        if (this.kunishuCurrentSortKey) {
            kunishus = this._prepareStableSortBase('kunishu', kunishus, this.kunishuCurrentSortKey);
            kunishus.sort((a, b) => {
                let valA, valB;
                const leaderA = this.game.getBusho(a.leaderId);
                const leaderB = this.game.getBusho(b.leaderId);
                const castleA = this.game.getCastle(a.castleId);
                const castleB = this.game.getCastle(b.castleId);
                
                let provinceA = null, provinceB = null;
                if (castleA && this.game.provinces) provinceA = this.game.getProvince(castleA.provinceId);
                if (castleB && this.game.provinces) provinceB = this.game.getProvince(castleB.provinceId);

                switch(this.kunishuCurrentSortKey) {
                    case 'name':
                        valA = a.yomi || a.getName(this.game);
                        valB = b.yomi || b.getName(this.game);
                        break;
                    case 'leader':
                        valA = leaderA ? (leaderA.yomi || leaderA.name) : "んんん";
                        valB = leaderB ? (leaderB.yomi || leaderB.name) : "んんん";
                        break;
                    case 'castle':
                        valA = castleA ? (castleA.yomi || castleA.name) : "んんん";
                        valB = castleB ? (castleB.yomi || castleB.name) : "んんん";
                        break;
                    case 'province':
                        valA = provinceA ? (provinceA.provinceYomi || provinceA.province) : "んんん";
                        valB = provinceB ? (provinceB.provinceYomi || provinceB.province) : "んんん";
                        break;
                    case 'soldiers':
                        valA = a.soldiers;
                        valB = b.soldiers;
                        break;
                    case 'friend':
                        valA = a.getRelation(this.game.playerClanId);
                        valB = b.getRelation(this.game.playerClanId);
                        break;
                    case 'relation':
                        const getRelRank = (k) => {
                            const r = k.getRelation(this.game.playerClanId);
                            if (r >= 70) return 0; // 友好
                            if (r < 40) return 2;  // 敵対
                            return 1;              // 普通
                        };
                        valA = getRelRank(a);
                        valB = getRelRank(b);
                        break;
                }

                let fallbackCmp = 0;
                if (this.kunishuCurrentSortKey === 'name') {
                    const nameA = a.getName(this.game);
                    const nameB = b.getName(this.game);
                    fallbackCmp = this.isKunishuSortAsc ? nameA.localeCompare(nameB, 'ja') : nameB.localeCompare(nameA, 'ja');
                }
                
                return this._compareForSort(valA, valB, this.isKunishuSortAsc, fallbackCmp);
            });
            this._saveStableSortResult('kunishu', kunishus);
        } else {
            this._saveStableSortResult('kunishu', null);
        }

        let items = [];
        kunishus.forEach(kunishu => {
            const kunishuName = kunishu.getName(this.game);
            const leader = this.game.getBusho(kunishu.leaderId);
            const leaderName = leader ? leader.name : "不明";
            const castleObj = this.game.getCastle(kunishu.castleId);
            const castleName = castleObj ? castleObj.name : "不明";
            
            let provinceName = "不明";
            if (castleObj && this.game.provinces) {
                const province = this.game.getProvince(castleObj.provinceId);
                if (province) provinceName = province.province;
            }

            const relVal = kunishu.getRelation(this.game.playerClanId);
            const friendBarHtml = this._createBarHtml(relVal, 'friend');
            
            let relStatus = "普通";
            let relClass = "text-white";
            if (relVal >= 70) { relStatus = "友好"; relClass = "text-green"; }
            else if (relVal < 40) { relStatus = "敵対"; relClass = "text-red"; }

            const isSelected = this.commonSelectedIds && this.commonSelectedIds.includes(kunishu.id);
            let onClickStr = null;
            if (isSelectMode) {
                onClickStr = (e) => this.handleCommonSelect(kunishu.id, e.currentTarget, false);
            } else {
                onClickStr = this._withChoiceSound(() => this.showKunishuDetail(kunishu.id));
            }
            
            items.push({
                onClick: onClickStr,
                cells: [
                    `<strong class="col-kunishu-name">${kunishuName}</strong>`,
                    `<span class="col-leader-name">${leaderName}</span>`,
                    `<span class="col-castle-name">${castleName}</span>`,
                    `<span class="col-province">${provinceName}</span>`,
                    `<span class="col-soldiers">${kunishu.soldiers}</span>`,
                    `<span class="col-friend">${friendBarHtml}</span>`,
                    `<span class="col-relation ${relClass} list-text-strong">${relStatus}</span>`,
                    `<span class="col-empty pc-only"></span>`
                ],
                itemClass: isSelectMode && isSelected ? "selected" : ""
            });
        });
        
        const getSortMark = (key) => this._getCommonSortMark(this.kunishuCurrentSortKey, this.isKunishuSortAsc, key);

        this._renderListModal({
            title: "諸勢力一覧",
            contextHtml: contextHtml,
            headers: [
                `<span data-sort="name">勢力名${getSortMark('name')}</span>`,
                `<span data-sort="leader">頭領${getSortMark('leader')}</span>`,
                `<span data-sort="castle">所在${getSortMark('castle')}</span>`,
                `<span data-sort="province">所属${getSortMark('province')}</span>`,
                `<span data-sort="soldiers">兵士${getSortMark('soldiers')}</span>`,
                `<span data-sort="friend">友好度${getSortMark('friend')}</span>`,
                `<span data-sort="relation">関係${getSortMark('relation')}</span>`,
                `<span class="col-empty pc-only"></span>`
            ],
            headerClass: `sortable-header kunishu-list-header ${modeClassStr}`,
            itemClass: `kunishu-list-item ${modeClassStr}`,
            listClass: "kunishu-list-container",
            items: items,
            scrollPos: scrollPos,
            gridTemplateSp: "2.0fr 2.3fr 2.3fr 1.5fr 1.5fr 1.8fr 1fr",
            gridTemplatePc: "120px 120px 120px 60px 80px 100px 60px 1fr",
            onBack: onBack,
            backLabel: isSelectMode && onBack ? '戻る' : null,
            onConfirm: isSelectMode ? () => {
                if (!this.commonSelectedIds || this.commonSelectedIds.length === 0) return;
                const selectedId = this.commonSelectedIds[0];
                this.closeCommonModal(); 
                if (onConfirm) onConfirm(selectedId); 
            } : null,
            onSortClick: (sortKey) => {
                const defaultAscKeys = ['name', 'leader', 'castle', 'province', 'relation'];
                const newState = this._toggleSortState(this.kunishuCurrentSortKey, this.isKunishuSortAsc, sortKey, defaultAscKeys);
                this.kunishuCurrentSortKey = newState.key;
                this.isKunishuSortAsc = newState.isAsc;
                const listEl = document.getElementById('selector-list');
                const scroll = listEl ? listEl.scrollTop : 0;
                this._renderKunishuList(kunishus, castle, isSelectMode, onBack, onConfirm, scroll);
            }
        });
        
        if (isSelectMode) this.updateCommonConfirmBtn();
    }
    
    // ==========================================
    // ★行動履歴の魔法（共通モーダル対応版）
    // ==========================================
    showHistoryModal() {
        this.closeCommonModal();
        this.historyCurrentScope = 'clan';
        this.pushModal('history_list', []);
    }

    _renderHistoryList(scrollPos = 0) {
        const system = this.game.historySystem;
        const scope = this.historyCurrentScope === 'national' ? 'national' : 'clan';
        const historyList = system ? system.getEntries(scope, this.game.playerClanId) : [];
        const items = [];
        let lastMonthKey = null;
        [...historyList].reverse().forEach(entry => {
            const year = Number(entry && entry.year) || 0;
            const month = Number(entry && entry.month) || 0;
            const monthKey = year > 0 && month > 0 ? `${year}-${month}` : 'unknown';
            if (monthKey !== lastMonthKey) {
                items.push({
                    onClick: null,
                    cells: [`<span class="history-month-label">${year > 0 && month > 0 ? `${year}年 ${month}月` : '時期不明'}</span>`],
                    itemClass: "history-month-divider"
                });
                lastMonthKey = monthKey;
            }
            items.push({
                onClick: null,
                cells: [String(entry?.text || '')],
                itemClass: "history-list-item"
            });
        });
        const tabsHtml = `<div class="busho-list-tabs history-scope-tabs">
            <button class="busho-tab-btn ${scope === 'clan' ? 'active' : ''}" data-tab="clan">自国</button>
            <button class="busho-tab-btn ${scope === 'national' ? 'active' : ''}" data-tab="national">全国</button>
        </div>`;

        this._renderListModal({
            title: "行動履歴",
            tabsHtml,
            onTabClick: (nextScope) => {
                this.historyCurrentScope = nextScope === 'national' ? 'national' : 'clan';
                this._renderHistoryList(0);
            },
            items,
            emptyHtml: `<div class="history-empty-msg">${scope === 'clan' ? '自国に関する履歴はありません。' : '自国が関与しない全国の履歴はありません。'}</div>`,
            gridTemplateSp: "1fr",
            gridTemplatePc: "1fr",
            // 履歴は折返し行と月区切りで行高が一定ではないため、固定行高前提の仮想スクロールを使わない。
            // 30件ずつ段階描画する通常経路で500件まで滑らかに追加します。
            disableVirtualization: true,
            scrollPos
        });
    }

    // ==========================================
    // ★援軍の勢力選択リストの魔法（共通モーダル対応版）
    // ==========================================
    showForceSelector(forces, onSelect, onCancel, message = "対象の勢力を選択してください") {
        this.closeCommonModal(); 
        this.pushModal('force_selector', [forces, onSelect, onCancel, message]);
    }

    _renderForceSelector(forces, onSelect, onCancel, message = "対象の勢力を選択してください", scrollPos = 0) {
        let contextHtml = `<div>${message}</div>`;
        this.currentForces = forces;
        this.selectedForceIndex = null;

        let items = [];
        forces.forEach((item, index) => {
            // ★修正：データが { castle, force } の形で送られてくるようになったため、中身を取り出します
            const force = item.force || item; 

            let relVal = 50;
            let relStatus = "普通";
            let statusClass = "text-white";

            if (force.isKunishu) {
                const k = this.game.kunishuSystem.getKunishu(force.id);
                if (k) relVal = k.getRelation(this.game.playerClanId);
                
                if (relVal >= 70) { relStatus = "友好"; statusClass = "text-green"; }
                else if (relVal < 40) { relStatus = "敵対"; statusClass = "text-red"; }
            } else {
                const rel = this.game.getRelation(this.game.playerClanId, force.id);
                if (rel) {
                    relVal = rel.sentiment;
                    relStatus = rel.status;
                    if (relStatus === '敵対') statusClass = 'text-red';
                    else if (['同盟', '支配', '従属', '和睦', '友好'].includes(relStatus)) statusClass = 'text-green';
                }
            }
            const friendBarHtml = this._createBarHtml(relVal, 'friend');
            const isSelected = this.commonSelectedIds && this.commonSelectedIds.includes(index);
            
            items.push({
                onClick: (e) => this.handleCommonSelect(index, e.currentTarget, false),
                cells: [
                    `<strong class="col-kunishu-name">${force.name}</strong>`,
                    `<span class="col-leader-name">${force.leaderName}</span>`,
                    `<span>${force.soldiers}</span>`,
                    `<span>${friendBarHtml}</span>`,
                    `<span class="${statusClass} list-text-strong">${relStatus}</span>`
                ],
                itemClass: isSelected ? "selected" : ""
            });
        });

        this._renderListModal({
            title: "勢力一覧",
            contextHtml: contextHtml,
            headers: ["勢力名", "武将", "兵士", "友好度", "関係"],
            headerClass: "force-list-header",
            itemClass: "force-list-item",
            listClass: "",
            items: items,
            scrollPos: scrollPos,
            gridTemplateSp: "1.5fr 1fr 1fr 1.5fr 1fr",
            gridTemplatePc: "150px 120px 100px 1fr 80px",
            onBack: onCancel,
            backLabel: onCancel ? '戻る' : null,
            onConfirm: () => {
                if (!this.commonSelectedIds || this.commonSelectedIds.length === 0) return;
                const selectedIndex = this.commonSelectedIds[0];
                this.closeCommonModal(); 
                const selectedItem = this.currentForces[selectedIndex];
                const selectedForce = selectedItem.force || selectedItem;
                if (onSelect) onSelect(selectedForce); 
            }
        });
        
        this.updateCommonConfirmBtn();
    }
    
    // ==========================================
    // ★ ここから追加：姫の詳細画面の魔法です
    // ==========================================
    showPrincessDetail(princessId) {
        this.pushModal('princess_detail', [princessId]);
    }

    _renderPrincessDetail(princessId, scrollPos = 0) {
        const princess = this.game.getPrincess(princessId);
        if (!princess) return;

        const shell = this._openInfoShell("姫情報");
        if (!shell) return;
        const { listContainer } = shell;

        let faceHtml = princess.faceIcon ? `<img src="data/images/faceicons/${princess.faceIcon}" class="daimyo-detail-face" data-face-fallback="data/images/faceicons/unknown_princess_face.webp">` : `<img src="data/images/faceicons/unknown_princess_face.webp" class="daimyo-detail-face">`;

        let affiliationName = "無所属";
        let isFamily = false;
        let lordName = "なし";
        
        // 所属表示は婚姻状態に関係なく、現在所属 currentClanId を正本にします。
        const clanId = Number(princess.currentClanId) || 0;
        if (clanId > 0) {
            const clan = this.game.getClan(clanId);
            if (clan) {
                affiliationName = clan.name;
                const daimyo = this.game.getBusho(clan.leaderId); 
                if (daimyo) {
                    lordName = daimyo.name;
                    // 一門かどうかを確認します
                    const pFamily = Array.isArray(princess.familyIds) ? princess.familyIds : [];
                    const dFamily = Array.isArray(daimyo.familyIds) ? daimyo.familyIds : [];
                    if (pFamily.some(fId => dFamily.includes(fId))) {
                        isFamily = true;
                    }
                }
            }
        }

        const age = this.game.year - princess.birthYear + 1;
        const ageStr = `${age}歳`;
        
        const father = this.game.getBusho(princess.realFatherId);
        const fatherName = father ? father.name : "不明";

        const husband = this.game.getBusho(princess.husbandId);
        const husbandName = husband ? husband.name : "なし";

        // ステータスの枠だけを作って中は空っぽにする魔法です
        const getEmptyStatRow = (label) => `
            <div class="daimyo-detail-stat-box busho-detail-stat-box">
                <span class="daimyo-detail-label busho-detail-stat-label">${label}</span>
                <span class="busho-detail-stat-grade princess-empty-grade">-</span>
                <div class="busho-stat-bar-wrapper busho-detail-stat-bar">
                    <div class="bar-bg-busho busho-detail-bar-base">
                        <div class="bar-fill-busho princess-empty-bar"></div>
                    </div>
                    <div class="exp-bar-bg busho-detail-bar-base is-placeholder"></div>
                </div>
            </div>
        `;

        const displayYomi = princess.yomi || "";
        const displayName = princess.name || "姫";

        const makeRow = (label, value) => {
            const longLabelClass = label.length >= 3 ? ' is-long-label' : '';
            return `<div class="daimyo-detail-stat-box"><span class="daimyo-detail-label princess-detail-label${longLabelClass}">${label}</span><span class="daimyo-detail-value">${value}</span></div>`;
        };

        const statHtml = `
            <div class="busho-detail-group busho-detail-group-grow">
                ${getEmptyStatRow('統率')}
                ${getEmptyStatRow('武勇')}
                ${getEmptyStatRow('内政')}
                ${getEmptyStatRow('外交')}
                ${getEmptyStatRow('智謀')}
                ${getEmptyStatRow('魅力')}
            </div>
        `;

        const infoHtml = `
            <div class="busho-detail-info-column">
                <div class="busho-detail-group">
                    ${makeRow('所在', '&nbsp;')}
                    ${makeRow('主君', lordName)}
                </div>
                <div class="busho-detail-group">
                    ${makeRow('年齢', ageStr)}
                    ${makeRow('一門', isFamily ? "◯" : "&nbsp;")}
                    ${makeRow('父親', fatherName)}
                    ${makeRow('配偶者', husbandName)}
                </div>
            </div>
        `;

        const rightContentHtml = `
            <div class="busho-detail-status-layout">
                ${statHtml}
                ${infoHtml}
            </div>
        `;

        if (listContainer) {
            listContainer.className = 'list-container hide-native-scroll';
            listContainer.style.display = 'block';
            listContainer.innerHTML = `
                <div class="daimyo-detail-container busho-detail-container princess-detail-container">
                    <div class="daimyo-detail-header busho-detail-header-pc pc-only">
                        <div class="busho-detail-heading-stack">
                            <span class="busho-detail-yomi pc-only-yomi">${displayYomi}</span>
                            <div class="busho-detail-name-row pc-name-row">
                                <div class="daimyo-detail-name busho-detail-name-pc">${displayName}</div>
                            </div>
                            <div class="busho-detail-meta pc-meta">
                                <span>${affiliationName}</span>
                            </div>
                        </div>
                    </div>
                    <div class="daimyo-detail-body">
                        <div class="daimyo-detail-left">
                            ${faceHtml}
                            <div class="daimyo-detail-header busho-detail-header-sp sp-only">
                                <span class="busho-detail-yomi sp-yomi">${displayYomi}</span>
                                <div class="busho-detail-name-row sp-name-row">
                                    <div class="daimyo-detail-name busho-detail-name-sp">${displayName}</div>
                                </div>
                                <div class="busho-detail-meta sp-meta">
                                    <span>${affiliationName}</span>
                                </div>
                            </div>
                        </div>
                        <div class="daimyo-detail-right busho-detail-right">
                            ${rightContentHtml}
                        </div>
                    </div>
                </div>
            `;

            this._bindImageFallbacks(listContainer);
            listContainer.scrollTop = scrollPos;
        }
    }
    
}