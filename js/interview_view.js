/**
 * interview_view.js
 * 面談専用モーダルの表示と入力だけを担当する。
 * 面談の判定・台詞生成は InterviewSystem、人物関係計算は PersonnelRules に委譲する。
 */
class InterviewView {
    constructor(ui, game) {
        this.ui = ui;
        this.game = game;

        this.modal = document.getElementById('interview-modal');
        this.content = document.getElementById('interview-session-content');
        this.title = document.getElementById('interview-session-title');
        this.hint = document.getElementById('interview-session-hint');
        this.facePanel = document.getElementById('interview-session-face-panel');
        this.face = document.getElementById('interview-session-face');
        this.name = document.getElementById('interview-session-name');
        this.body = document.getElementById('interview-session-body');
        this.pager = document.getElementById('interview-session-pager');
        this.pageLabel = document.getElementById('interview-session-page-label');
        this.prevBtn = document.getElementById('interview-session-prev-btn');
        this.nextBtn = document.getElementById('interview-session-next-btn');
        this.actions = document.getElementById('interview-session-actions');

        this.page = 0;
        this.pageItems = [];
        this.pageSize = 0;
        this.onPageItemSelect = null;
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
        this.modal.classList.add('hidden');
        this._clearView();
        if (typeof this.ui.resumeBackgroundUpdates === 'function') this.ui.resumeBackgroundUpdates();
    }

    _clearView() {
        if (this.body) this.body.replaceChildren();
        if (this.actions) this.actions.replaceChildren();
        if (this.pager) this.pager.classList.add('hidden');
        this.pageItems = [];
        this.page = 0;
        this.pageSize = 0;
        this.onPageItemSelect = null;
    }

    _setHeader(title, hint = '') {
        if (this.title) this.title.textContent = title || '面談';
        if (this.hint) {
            this.hint.textContent = hint || '';
            this.hint.classList.toggle('hidden', !hint);
        }
    }

    _setSpeaker(busho = null) {
        if (!this.facePanel || !this.face || !this.name) return;
        if (!busho) {
            this.facePanel.classList.add('hidden');
            if (this.content) this.content.classList.add('speaker-hidden');
            this.face.removeAttribute('src');
            this.name.textContent = '';
            return;
        }

        this.facePanel.classList.remove('hidden');
        if (this.content) this.content.classList.remove('speaker-hidden');
        this.face.src = `data/images/faceicons/${busho.faceIcon || 'unknown_face.webp'}`;
        this.face.alt = '';
        this.face.onerror = () => {
            this.face.onerror = null;
            this.face.src = 'data/images/faceicons/unknown_face.webp';
        };
        this.name.textContent = busho.name || '';
    }

    _makeButton(label, onClick, className = 'btn-secondary') {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = `interview-session-btn ${className}`;
        button.textContent = label;
        button.onclick = () => {
            if (window.AudioManager) {
                const isBack = label === '戻る' || label.includes('終える') || label === 'やめる';
                window.AudioManager.playSE(isBack ? 'cancel.ogg' : 'decision.ogg');
            }
            if (onClick) onClick();
        };
        return button;
    }

    _renderActions(choices) {
        if (!this.actions) return;
        this.actions.replaceChildren();
        (choices || []).forEach(choice => {
            const button = this._makeButton(choice.label, choice.onClick, choice.className || 'btn-secondary');
            if (choice.disabled) button.disabled = true;
            this.actions.appendChild(button);
        });
    }

    showInterviewerList(candidates, onSelect, onClose) {
        this._ensureOpen();
        this._setHeader('面談', '面談する武将を選んでください。');
        this._setSpeaker(null);
        this._renderPagedList(candidates, onSelect, 'interviewer');
        this._renderActions([
            { label: '面談を終える', onClick: onClose, className: 'btn-secondary' }
        ]);
    }

    showTargetList(interviewer, candidates, onSelect, onBack) {
        this._ensureOpen();
        this._setHeader('他者について聞く', '誰についての印象を聞きますか？');
        this._setSpeaker(interviewer);
        this._renderPagedList(candidates, onSelect, 'target');
        this._renderActions([
            { label: '戻る', onClick: onBack, className: 'btn-secondary' }
        ]);
    }

    _renderPagedList(items, onSelect, mode) {
        if (!this.body) return;
        this.pageItems = Array.isArray(items) ? items.slice() : [];
        this.page = 0;
        this.onPageItemSelect = onSelect;
        this.pageSize = this._isPc() ? 12 : 8;
        this.page = Math.min(this.page, Math.max(0, Math.ceil(this.pageItems.length / this.pageSize) - 1));
        this.body.className = `interview-session-body interview-session-list-view ${mode === 'target' ? 'target-list-view' : 'interviewer-list-view'}`;
        this._renderCurrentPage();
    }

    _renderCurrentPage() {
        if (!this.body) return;
        this.body.replaceChildren();

        const totalPages = Math.max(1, Math.ceil(this.pageItems.length / Math.max(1, this.pageSize)));
        this.page = Math.max(0, Math.min(this.page, totalPages - 1));
        const start = this.page * this.pageSize;
        const visibleItems = this.pageItems.slice(start, start + this.pageSize);

        const grid = document.createElement('div');
        grid.className = 'interview-session-person-grid';

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
                if (window.AudioManager) window.AudioManager.playSE('decision.ogg');
                if (this.onPageItemSelect) this.onPageItemSelect(busho);
            };
            grid.appendChild(button);
        });

        this.body.appendChild(grid);

        const showPager = totalPages > 1;
        if (this.pager) this.pager.classList.toggle('hidden', !showPager);
        if (this.pageLabel) this.pageLabel.textContent = `${this.page + 1} / ${totalPages}`;
        if (this.prevBtn) {
            this.prevBtn.disabled = this.page <= 0;
            this.prevBtn.onclick = () => {
                if (this.page <= 0) return;
                this.page -= 1;
                if (window.AudioManager) window.AudioManager.playSE('choice.ogg');
                this._renderCurrentPage();
            };
        }
        if (this.nextBtn) {
            this.nextBtn.disabled = this.page >= totalPages - 1;
            this.nextBtn.onclick = () => {
                if (this.page >= totalPages - 1) return;
                this.page += 1;
                if (window.AudioManager) window.AudioManager.playSE('choice.ogg');
                this._renderCurrentPage();
            };
        }
    }

    showMenu(busho, message, choices) {
        this._ensureOpen();
        this._setHeader('面談', '話したい内容を選んでください。');
        this._setSpeaker(busho);
        if (this.pager) this.pager.classList.add('hidden');
        if (this.body) {
            this.body.className = 'interview-session-body interview-session-conversation-view';
            this.body.innerHTML = `<div class="interview-session-message">${message}</div>`;
        }
        this._renderActions(choices);
    }

    showPrompt(busho, message, choices, title = '面談') {
        this._ensureOpen();
        this._setHeader(title, '');
        this._setSpeaker(busho);
        if (this.pager) this.pager.classList.add('hidden');
        if (this.body) {
            this.body.className = 'interview-session-body interview-session-conversation-view';
            this.body.innerHTML = `<div class="interview-session-message">${message}</div>`;
        }
        this._renderActions(choices);
    }

    showMessages(busho, messages, onDone, title = '面談') {
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
            const isLast = index >= queue.length - 1;
            this._setHeader(title, queue.length > 1 ? `${index + 1} / ${queue.length}` : '');
            if (this.body) {
                this.body.className = 'interview-session-body interview-session-conversation-view';
                this.body.innerHTML = `<div class="interview-session-message">${queue[index]}</div>`;
            }
            this._renderActions([
                {
                    label: isLast ? '戻る' : '次へ',
                    className: isLast ? 'btn-secondary' : 'btn-primary',
                    onClick: () => {
                        if (isLast) {
                            if (onDone) onDone();
                        } else {
                            index += 1;
                            render();
                        }
                    }
                }
            ]);
        };
        render();
    }
}

window.InterviewView = InterviewView;
