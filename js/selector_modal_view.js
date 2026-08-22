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
            if (typeof onConfirm === 'function') {
                confirmBtn.classList.remove('hidden');
                confirmBtn.disabled = !!confirmDisabled;
                confirmBtn.style.opacity = confirmDisabled ? '0.5' : '';
                confirmBtn.style.cursor = confirmDisabled ? 'not-allowed' : '';
                confirmBtn.onclick = onConfirm;
            } else {
                confirmBtn.classList.add('hidden');
                confirmBtn.disabled = false;
                confirmBtn.style.opacity = '';
                confirmBtn.style.cursor = '';
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
                backBtn.onclick = typeof onBack === 'function' ? onBack : null;
            }
        }

        return elements;
    }

    close() {
        const elements = this.getElements();
        if (elements) elements.modal.classList.add('hidden');
    }
}

window.SelectorModalView = SelectorModalView;
