/**
 * selector_modal_view.js
 * 共通の情報/選択モーダル（#selector-modal）の「ガワ」だけを担当するView。
 *
 * UIInfoManager は一覧や詳細の内容を作ることに集中し、タイトル・タブ領域・
 * 決定/戻るボタン・共通DOM取得はこのViewを通して扱う。
 */
class SelectorModalView {
    constructor(ui) {
        this.ui = ui;
    }

    getElements() {
        const modal = (this.ui && this.ui.selectorModal) || document.getElementById('selector-modal');
        if (!modal) return null;

        return {
            modal,
            titleEl: document.getElementById('selector-title'),
            listContainer: (this.ui && this.ui.selectorList) || document.getElementById('selector-list'),
            listWrapper: document.getElementById('selector-list-wrapper'),
            contextEl: (this.ui && this.ui.selectorContextInfo) || document.getElementById('selector-context-info'),
            tabsEl: document.getElementById('selector-tabs'),
            confirmBtn: (this.ui && this.ui.selectorConfirmBtn) || document.getElementById('selector-confirm-btn'),
            backBtn: document.getElementById('selector-back-btn') || modal.querySelector('.btn-secondary'),
            modalContent: modal.querySelector('.modal-content')
        };
    }

    setConfirmEnabled(enabled) {
        const elements = this.getElements();
        const confirmBtn = elements && elements.confirmBtn;
        if (!confirmBtn) return;
        confirmBtn.disabled = !enabled;
        // 見た目は共通CSSの :disabled に任せ、過去画面のinline opacity/cursorを持ち越さない。
        if (confirmBtn.style && typeof confirmBtn.style.removeProperty === 'function') {
            confirmBtn.style.removeProperty('opacity');
            confirmBtn.style.removeProperty('cursor');
        } else if (confirmBtn.style) {
            confirmBtn.style.opacity = '';
            confirmBtn.style.cursor = '';
        }
    }

    open({
        title = '',
        contextHtml = null,
        tabsHtml = null,
        showTabs = false,
        hideBackBtn = false,
        backLabel = '閉じる',
        onBack = null,
        onConfirm = null,
        confirmDisabled = false
    } = {}) {
        const elements = this.getElements();
        if (!elements || !elements.listContainer) return null;

        const { modal, titleEl, contextEl, tabsEl, confirmBtn, backBtn } = elements;
        modal.classList.remove('hidden');

        if (titleEl) titleEl.textContent = title;

        if (contextEl) {
            if (contextHtml !== null && contextHtml !== undefined && contextHtml !== '') {
                contextEl.innerHTML = contextHtml;
                contextEl.classList.remove('hidden');
            } else {
                contextEl.innerHTML = '';
                contextEl.classList.add('hidden');
            }
        }

        if (tabsEl) {
            // 前に開いていた詳細画面固有の見た目を次の一覧へ持ち越さない。
            tabsEl.classList.remove('busho-detail-tabs');
            if (tabsHtml !== null && tabsHtml !== undefined) {
                tabsEl.innerHTML = tabsHtml;
                tabsEl.classList.remove('hidden');
            } else if (showTabs) {
                tabsEl.classList.remove('hidden');
            } else {
                tabsEl.innerHTML = '';
                tabsEl.classList.add('hidden');
            }
        }

        if (confirmBtn) {
            // 標準決定ボタンは共通button-SEの既定 decision に任せる。
            delete confirmBtn.dataset.se;
            if (typeof onConfirm === 'function') {
                confirmBtn.classList.remove('hidden');
                confirmBtn.onclick = onConfirm;
                this.setConfirmEnabled(!confirmDisabled);
            } else {
                confirmBtn.classList.add('hidden');
                confirmBtn.disabled = false;
                if (confirmBtn.style && typeof confirmBtn.style.removeProperty === 'function') {
                    confirmBtn.style.removeProperty('opacity');
                    confirmBtn.style.removeProperty('cursor');
                } else if (confirmBtn.style) {
                    confirmBtn.style.opacity = '';
                    confirmBtn.style.cursor = '';
                }
                confirmBtn.onclick = null;
            }
        }

        if (backBtn) {
            if (hideBackBtn) {
                backBtn.style.display = 'none';
                backBtn.onclick = null;
            } else {
                backBtn.style.display = '';
                backBtn.textContent = backLabel;
                backBtn.dataset.se = 'cancel.ogg';
                backBtn.onclick = typeof onBack === 'function' ? onBack : null;
            }
        }

        return elements;
    }

    releaseListContent({ resetScroll = true } = {}) {
        const elements = this.getElements();
        if (!elements || !elements.listContainer) return;

        const { listContainer } = elements;
        if (listContainer._virtualScrollHandler) {
            listContainer.removeEventListener('scroll', listContainer._virtualScrollHandler);
            listContainer._virtualScrollHandler = null;
        }
        if (listContainer._virtualScrollCleanup) {
            listContainer._virtualScrollCleanup();
            listContainer._virtualScrollCleanup = null;
        }

        // 旧一覧の画像decode領域とDOMを、次画面のHTMLを組み立てる前に解放できる共通窓口。
        // innerHTML置換だけだとブラウザ実装によっては新旧DOMが一時的に重なるため、
        // 先にsrc参照を切ってから内容を空にし、古いスマホの瞬間メモリを抑えます。
        const images = listContainer.querySelectorAll('img');
        for (let i = 0; i < images.length; i++) images[i].removeAttribute('src');
        listContainer.innerHTML = '';
        if (resetScroll) listContainer.scrollTop = 0;
    }

    close() {
        const elements = this.getElements();
        if (!elements) return;

        const { modal, contextEl, tabsEl, confirmBtn, backBtn } = elements;
        modal.classList.add('hidden');

        // 非表示にするだけだと、仮想スクロールのクロージャや画像DOMが大量データへの参照を
        // 保持したままになります。通常地図を復帰する前に画面内容を解放し、古いスマホの
        // 一時メモリピークを下げます。見た目が必要な間は close() 自体が呼ばれないため、
        // handoff 中の表示は従来どおり維持されます。
        this.releaseListContent({ resetScroll: true });
        if (contextEl) contextEl.innerHTML = '';
        if (tabsEl) tabsEl.innerHTML = '';
        if (confirmBtn) confirmBtn.onclick = null;
        if (backBtn) backBtn.onclick = null;
    }
}

window.SelectorModalView = SelectorModalView;
