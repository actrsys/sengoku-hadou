/**
 * interview_view.js
 * 面談専用モーダルの表示と入力だけを担当する。
 * 面談の判定・台詞生成は InterviewSystem、人物関係計算は PersonnelRules に委譲する。
 * 武将一覧の検索・ソート規則は BushoListSortRules を共用する。
 * button のSEは共通button監視へ委譲し、特殊音だけ data-se で宣言する。
 */
class InterviewView {
    constructor(ui, game) {
        this.ui = ui;
        this.game = game;

        this.modal = document.getElementById('interview-modal');
        this.content = document.getElementById('interview-session-content');
        this.title = document.getElementById('interview-session-title');
        this.hint = document.getElementById('interview-session-hint');
        this.summaryPanel = document.getElementById('interview-session-summary-panel');
        this.name = document.getElementById('interview-session-name');
        this.meta = document.getElementById('interview-session-meta');
        this.stats = document.getElementById('interview-session-stats');
        this.body = document.getElementById('interview-session-body');
        this.pager = document.getElementById('interview-session-pager');
        this.pageLabel = document.getElementById('interview-session-page-label');
        this.prevBtn = document.getElementById('interview-session-prev-btn');
        this.nextBtn = document.getElementById('interview-session-next-btn');
        this.inlineActions = document.getElementById('interview-session-inline-actions');
        this.footer = document.getElementById('interview-session-footer');

        this.page = 0;
        this.pageItems = [];
        this.pageSize = 0;
        this.onPageItemSelect = null;
        this.listSortKey = 'leadership';
        this.listSortAsc = false;
        this.listQuery = '';
        this.currentSpeaker = null;
        this._messageAdvanceHandler = null;
        this._listGrid = null;
        this._listCount = null;
        this._listDirection = null;
        this._searchComposing = false;
    }

    _isPc() {
        return document.body.classList.contains('is-pc');
    }

    _ensureOpen() {
        if (!this.modal || !this.modal.classList.contains('hidden')) return;
        this.modal.classList.remove('hidden');
        if (typeof this.ui.pauseBackgroundUpdates === 'function') this.ui.pauseBackgroundUpdates();
    }

    close() {
        if (!this.modal || this.modal.classList.contains('hidden')) return;
        this._clearMessageAdvance();
        this.modal.classList.add('hidden');
        this._clearView();
        if (typeof this.ui.resumeBackgroundUpdates === 'function') this.ui.resumeBackgroundUpdates();
    }

    _clearView() {
        this._clearMessageAdvance();
        if (this.body) this.body.replaceChildren();
        if (this.inlineActions) {
            this.inlineActions.replaceChildren();
            this.inlineActions.classList.add('hidden');
        }
        if (this.footer) {
            this.footer.replaceChildren();
            this.footer.classList.add('hidden');
        }
        if (this.pager) this.pager.classList.add('hidden');
        this.pageItems = [];
        this.page = 0;
        this.pageSize = 0;
        this.listQuery = '';
        this.onPageItemSelect = null;
        this.currentSpeaker = null;
        this._listGrid = null;
        this._listCount = null;
        this._listDirection = null;
        this._searchComposing = false;
        if (this.content) this.content.classList.remove('interview-conversation-active');
    }

    _setHeader(title, hint = '') {
        if (this.title) this.title.textContent = title || '面談';
        if (this.hint) {
            this.hint.textContent = hint || '';
            this.hint.classList.toggle('hidden', !hint);
        }
    }

    _setSpeaker(busho = null) {
        this.currentSpeaker = busho || null;
        if (!this.summaryPanel || !this.name) return;
        if (!busho) {
            this.summaryPanel.classList.add('hidden');
            if (this.content) this.content.classList.add('speaker-hidden');
            this.name.textContent = '';
            if (this.meta) this.meta.replaceChildren();
            if (this.stats) this.stats.replaceChildren();
            return;
        }

        this.summaryPanel.classList.remove('hidden');
        if (this.content) this.content.classList.remove('speaker-hidden');
        this.name.textContent = busho.name || '';
        this._renderSpeakerSummary(busho);
    }

    _renderSpeakerSummary(busho) {
        if (this.meta) {
            this.meta.replaceChildren();
            const castle = this.game && typeof this.game.getCastle === 'function'
                ? this.game.getCastle(busho.castleId)
                : (this.game.castles || []).find(c => Number(c.id) === Number(busho.castleId));
            const rank = window.StatPresenter
                ? StatPresenter.getBushoRankName(busho, this.game)
                : '武将';
            const age = busho.isAutoLeader || !Number.isFinite(Number(busho.birthYear))
                ? ''
                : `${Math.max(0, Number(this.game.year || 0) - Number(busho.birthYear) + 1)}歳`;
            const entries = [
                castle ? `所在：${castle.name}` : '',
                rank ? `身分：${rank}` : '',
                age ? `年齢：${age}` : ''
            ].filter(Boolean);
            entries.forEach(text => {
                const row = document.createElement('div');
                row.className = 'interview-session-meta-row';
                row.textContent = text;
                this.meta.appendChild(row);
            });
        }

        if (this.stats) {
            this.stats.replaceChildren();
            const statDefs = [
                ['統率', 'leadership'], ['武勇', 'strength'], ['内政', 'politics'],
                ['外交', 'diplomacy'], ['智謀', 'intelligence'], ['魅力', 'charm']
            ];
            const gunshi = this.game && typeof this.game.getClanGunshi === 'function'
                ? this.game.getClanGunshi(this.game.playerClanId)
                : null;
            const daimyo = this.game && typeof this.game.getClanDaimyo === 'function'
                ? this.game.getClanDaimyo(this.game.playerClanId)
                : null;
            statDefs.forEach(([label, key]) => {
                const cell = document.createElement('div');
                cell.className = 'interview-session-stat';
                const labelEl = document.createElement('span');
                labelEl.className = 'interview-session-stat-label';
                labelEl.textContent = label;
                const valueEl = document.createElement('span');
                valueEl.className = 'interview-session-stat-value';
                valueEl.innerHTML = window.StatPresenter
                    ? StatPresenter.getDisplayStatHTML(busho, key, gunshi, null, this.game.playerClanId, daimyo)
                    : '';
                cell.append(labelEl, valueEl);
                this.stats.appendChild(cell);
            });
        }
    }

    _bindButton(button, onClick, sound = null) {
        if (sound) button.dataset.se = sound;
        button.onclick = () => {
            if (onClick) onClick();
        };
        return button;
    }

    _makeFooterButton(label, onClick, className = 'btn-secondary', sound = null) {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = className;
        button.textContent = label;
        const resolvedSound = sound || (
            label === '戻る' || label.includes('終える') || label === 'やめる' || label === '診せない'
                ? 'cancel.ogg'
                : null
        );
        return this._bindButton(button, onClick, resolvedSound);
    }

    _makeInlineButton(label, onClick) {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'daimyo-detail-action-btn interview-session-inline-btn';
        button.textContent = label;
        return this._bindButton(button, onClick, 'choice.ogg');
    }

    _renderFooterActions(choices) {
        if (!this.footer) return;
        this.footer.replaceChildren();
        (choices || []).forEach(choice => {
            const button = this._makeFooterButton(
                choice.label,
                choice.onClick,
                choice.className || 'btn-secondary',
                choice.sound || null
            );
            if (choice.disabled) button.disabled = true;
            this.footer.appendChild(button);
        });
        this.footer.classList.toggle('hidden', !choices || choices.length === 0);
    }

    _renderInlineActions(choices) {
        if (!this.inlineActions) return;
        this.inlineActions.replaceChildren();
        (choices || []).forEach(choice => {
            const button = this._makeInlineButton(choice.label, choice.onClick);
            if (choice.disabled) button.disabled = true;
            this.inlineActions.appendChild(button);
        });
        this.inlineActions.classList.toggle('hidden', !choices || choices.length === 0);
    }

    _clearMessageAdvance() {
        if (this.modal && this._messageAdvanceHandler) {
            this.modal.removeEventListener('click', this._messageAdvanceHandler);
        }
        this._messageAdvanceHandler = null;
        if (this.modal) this.modal.classList.remove('interview-message-advance');
    }

    _setMessageAdvance(onAdvance) {
        this._clearMessageAdvance();
        if (!this.modal || typeof onAdvance !== 'function') return;
        this.modal.classList.add('interview-message-advance');
        this._messageAdvanceHandler = (event) => {
            if (event.target.closest('button, input, select, textarea, a')) return;
            event.stopPropagation();
            this._clearMessageAdvance();
            if (window.AudioManager) window.AudioManager.playSE('choice.ogg');
            onAdvance();
        };
        this.modal.addEventListener('click', this._messageAdvanceHandler);
    }

    showInterviewerList(candidates, onSelect, onClose) {
        this._clearMessageAdvance();
        this._ensureOpen();
        this._setHeader('面談', '面談する武将を選んでください。');
        this._setSpeaker(null);
        this._renderPagedList(candidates, onSelect, 'interviewer');
        this._renderInlineActions([]);
        this._renderFooterActions([
            { label: '面談を終える', onClick: onClose, className: 'btn-secondary', sound: 'cancel.ogg' }
        ]);
    }

    showTargetList(interviewer, candidates, onSelect, onBack) {
        this._clearMessageAdvance();
        this._ensureOpen();
        this._setHeader('他者について聞く', '誰についての印象を聞きますか？');
        this._setSpeaker(interviewer);
        this._renderPagedList(candidates, onSelect, 'target');
        this._renderInlineActions([]);
        this._renderFooterActions([
            { label: '戻る', onClick: onBack, className: 'btn-secondary', sound: 'cancel.ogg' }
        ]);
    }

    _renderPagedList(items, onSelect, mode) {
        if (!this.body) return;
        if (this.content) this.content.classList.remove('interview-conversation-active');
        this.pageItems = Array.isArray(items) ? items.slice() : [];
        this.page = 0;
        this.listQuery = '';
        this.onPageItemSelect = onSelect;
        this.pageSize = this._isPc() ? 12 : 8;
        this._searchComposing = false;
        this.body.className = `interview-session-body interview-session-list-view ${mode === 'target' ? 'target-list-view' : 'interviewer-list-view'}`;
        this.body.replaceChildren();

        const tools = this._createListTools();
        this._listGrid = document.createElement('div');
        this._listGrid.className = 'interview-session-person-grid';
        this.body.append(tools, this._listGrid);
        this._renderCurrentPage();
    }

    _getVisibleListItems() {
        const filtered = window.BushoListSortRules
            ? BushoListSortRules.filterByName(this.pageItems, this.listQuery)
            : this.pageItems.slice();
        if (!window.BushoListSortRules) return filtered;
        return BushoListSortRules.sortKnown(this.game, filtered, this.listSortKey, this.listSortAsc);
    }

    _createListTools() {
        const tools = document.createElement('div');
        tools.className = 'interview-session-list-tools';

        const search = document.createElement('input');
        search.type = 'search';
        search.className = 'interview-session-search';
        search.placeholder = '名前で探す';
        search.autocomplete = 'off';
        search.enterKeyHint = 'search';
        search.value = this.listQuery;
        search.setAttribute('aria-label', '武将名で検索');

        const applySearch = () => {
            this.listQuery = search.value;
            this.page = 0;
            this._renderCurrentPage();
        };
        search.addEventListener('compositionstart', () => {
            this._searchComposing = true;
        });
        search.addEventListener('compositionend', () => {
            this._searchComposing = false;
            applySearch();
        });
        search.addEventListener('input', (event) => {
            this.listQuery = search.value;
            if (this._searchComposing || event.isComposing) return;
            applySearch();
        });

        const sortWrap = document.createElement('span');
        sortWrap.className = 'interview-session-sort-wrap';
        const sortSelect = document.createElement('select');
        sortSelect.className = 'interview-session-sort-select';
        sortSelect.setAttribute('aria-label', '並び順');
        const options = window.BushoListSortRules ? BushoListSortRules.getInterviewSortOptions() : [];
        options.forEach(option => {
            const opt = document.createElement('option');
            opt.value = option.key;
            opt.textContent = option.label;
            opt.selected = option.key === this.listSortKey;
            sortSelect.appendChild(opt);
        });
        sortSelect.onchange = () => {
            this.listSortKey = sortSelect.value;
            const selected = options.find(option => option.key === this.listSortKey);
            this.listSortAsc = selected ? selected.defaultAsc : false;
            this.page = 0;
            if (window.AudioManager) window.AudioManager.playSE('choice.ogg');
            this._renderCurrentPage();
        };
        sortWrap.appendChild(sortSelect);

        const direction = this._makeInlineButton(this.listSortAsc ? '昇順' : '降順', () => {
            this.listSortAsc = !this.listSortAsc;
            this.page = 0;
            this._renderCurrentPage();
        });
        direction.classList.add('interview-session-sort-direction');
        this._listDirection = direction;

        const count = document.createElement('span');
        count.className = 'interview-session-list-count';
        this._listCount = count;

        tools.append(search, sortWrap, direction, count);
        return tools;
    }

    _renderCurrentPage() {
        if (!this.body || !this._listGrid) return;

        const listItems = this._getVisibleListItems();
        const totalPages = Math.max(1, Math.ceil(listItems.length / Math.max(1, this.pageSize)));
        this.page = Math.max(0, Math.min(this.page, totalPages - 1));
        const start = this.page * this.pageSize;
        const visibleItems = listItems.slice(start, start + this.pageSize);

        this._listGrid.replaceChildren();
        visibleItems.forEach(busho => {
            const button = document.createElement('button');
            button.type = 'button';
            button.className = 'interview-session-person';
            button.setAttribute('aria-label', busho.name || '武将');

            const img = document.createElement('img');
            img.className = 'interview-session-person-face';
            img.src = `data/images/faceicons/${busho.faceIcon || 'unknown_face.webp'}`;
            img.alt = '';
            img.onerror = () => {
                img.onerror = null;
                img.src = 'data/images/faceicons/unknown_face.webp';
            };

            const text = document.createElement('span');
            text.className = 'interview-session-person-name';
            text.textContent = busho.name || '';

            button.append(img, text);
            button.onclick = () => {
                if (this.onPageItemSelect) this.onPageItemSelect(busho);
            };
            this._listGrid.appendChild(button);
        });

        if (visibleItems.length === 0) {
            const empty = document.createElement('div');
            empty.className = 'interview-session-list-empty';
            empty.textContent = '該当する武将はいません。';
            this._listGrid.appendChild(empty);
        }

        if (this._listCount) {
            this._listCount.textContent = listItems.length === this.pageItems.length
                ? `${this.pageItems.length}人`
                : `${listItems.length}/${this.pageItems.length}人`;
        }
        if (this._listDirection) this._listDirection.textContent = this.listSortAsc ? '昇順' : '降順';

        const showPager = totalPages > 1;
        if (this.pager) this.pager.classList.toggle('hidden', !showPager);
        if (this.pageLabel) this.pageLabel.textContent = `${this.page + 1} / ${totalPages}`;
        if (this.prevBtn) {
            this.prevBtn.disabled = this.page <= 0;
            this.prevBtn.onclick = () => {
                if (this.page <= 0) return;
                this.page -= 1;
                this._renderCurrentPage();
            };
        }
        if (this.nextBtn) {
            this.nextBtn.disabled = this.page >= totalPages - 1;
            this.nextBtn.onclick = () => {
                if (this.page >= totalPages - 1) return;
                this.page += 1;
                this._renderCurrentPage();
            };
        }
    }

    _createConversationFace(busho) {
        const faceColumn = document.createElement('div');
        faceColumn.className = 'dialog-face-column interview-session-dialog-face-column';

        const nameLabel = document.createElement('div');
        nameLabel.className = 'dialog-name-label interview-session-dialog-name-label';
        nameLabel.textContent = busho && busho.name ? busho.name : '';

        const faceSpace = document.createElement('div');
        faceSpace.className = 'interview-session-dialog-face-space';
        const wrapper = document.createElement('div');
        wrapper.className = 'sp-face-wrapper dialog-face-wrapper';
        const img = document.createElement('img');
        img.className = 'dialog-face-img';
        img.src = `data/images/faceicons/${(busho && busho.faceIcon) || 'unknown_face.webp'}`;
        img.alt = '';
        img.onerror = () => {
            img.onerror = null;
            img.src = 'data/images/faceicons/unknown_face.webp';
        };
        wrapper.appendChild(img);
        faceSpace.appendChild(wrapper);
        faceColumn.append(nameLabel, faceSpace);
        return faceColumn;
    }

    _renderConversationMessage(busho, message, options = {}) {
        if (!this.body) return;
        const narration = !!options.narration;
        if (this.content) this.content.classList.add('interview-conversation-active');
        this.body.className = `interview-session-body interview-session-conversation-view${narration ? ' interview-session-narration-view' : ''}`;
        this.body.replaceChildren();

        const dialogBody = document.createElement('div');
        dialogBody.className = 'dialog-body-container interview-session-dialog-body';
        if (!narration) dialogBody.appendChild(this._createConversationFace(busho || this.currentSpeaker));

        const messageArea = document.createElement('div');
        messageArea.className = 'message-area interview-session-message-area';
        messageArea.innerHTML = message || '';
        dialogBody.appendChild(messageArea);
        this.body.appendChild(dialogBody);
    }

    showMenu(busho, message, choices, onBack) {
        this._clearMessageAdvance();
        this._ensureOpen();
        this._setHeader('面談', '話したい内容を選んでください。');
        this._setSpeaker(busho);
        if (this.pager) this.pager.classList.add('hidden');
        this._renderConversationMessage(busho, message);
        this._renderInlineActions(choices);
        this._renderFooterActions(onBack ? [
            { label: '戻る', onClick: onBack, className: 'btn-secondary', sound: 'cancel.ogg' }
        ] : []);
    }

    showPrompt(busho, message, choices, title = '面談', options = {}) {
        this._clearMessageAdvance();
        this._ensureOpen();
        this._setHeader(title, '');
        this._setSpeaker(busho);
        if (this.pager) this.pager.classList.add('hidden');
        this._renderConversationMessage(busho, message, options);
        this._renderInlineActions([]);
        this._renderFooterActions(choices);
    }

    showMessages(busho, messages, onDone, title = '面談', options = {}) {
        const queue = (Array.isArray(messages) ? messages : [messages]).filter(Boolean);
        if (queue.length === 0) {
            if (onDone) onDone();
            return;
        }

        this._ensureOpen();
        this._setSpeaker(busho);
        if (this.pager) this.pager.classList.add('hidden');

        let index = 0;
        const render = () => {
            this._setHeader(title, queue.length > 1 ? `${index + 1} / ${queue.length}` : '');
            this._renderConversationMessage(busho, queue[index], options);
            this._renderInlineActions([]);
            this._renderFooterActions([]);
            this._setMessageAdvance(() => {
                if (index >= queue.length - 1) {
                    if (onDone) onDone();
                    return;
                }
                index += 1;
                render();
            });
        };
        render();
    }
}

window.InterviewView = InterviewView;
