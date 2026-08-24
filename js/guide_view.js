/**
 * guide_view.js
 * タイトル画面とゲーム中から共通利用する「指南書」表示を専門管理します。
 */
class GuideView {
    constructor(ui, game) {
        this.ui = ui;
        this.game = game;
        this.modal = document.getElementById('guide-modal');
        this.nav = document.getElementById('guide-nav');
        this.title = document.getElementById('guide-article-title');
        this.lead = document.getElementById('guide-article-lead');
        this.commandList = document.getElementById('guide-command-list');
        this.body = document.getElementById('guide-article-body');
        this.closeBtn = document.getElementById('guide-close-btn');
        this.activeArticleId = 'basics';
        this.didPauseBackground = false;

        if (this.closeBtn) this.closeBtn.addEventListener('click', () => this.close());
        this._renderNavigation();
    }

    open(articleId = 'basics') {
        if (!this.modal) return;
        const requested = this._getArticle(articleId) || this._getArticle('basics') || GUIDE_ARTICLES[0];
        if (!requested) return;

        this.activeArticleId = requested.id;
        this._renderNavigation();
        this._renderArticle(requested);

        const titleScreen = document.getElementById('title-screen');
        const isTitleVisible = !!(titleScreen && !titleScreen.classList.contains('hidden'));
        this.didPauseBackground = !isTitleVisible && !!(this.ui && typeof this.ui.pauseBackgroundUpdates === 'function');
        if (this.didPauseBackground) this.ui.pauseBackgroundUpdates();

        this.modal.classList.remove('hidden');
        if (this.closeBtn) this.closeBtn.focus();
    }

    close() {
        if (!this.modal || this.modal.classList.contains('hidden')) return;
        this.modal.classList.add('hidden');
        if (this.didPauseBackground && this.ui && typeof this.ui.resumeBackgroundUpdates === 'function') {
            this.ui.resumeBackgroundUpdates('guide_close');
        }
        this.didPauseBackground = false;
    }

    _getArticle(articleId) {
        return (GUIDE_ARTICLES || []).find(article => article.id === articleId) || null;
    }

    _renderNavigation() {
        if (!this.nav) return;
        this.nav.textContent = '';
        (GUIDE_ARTICLES || []).forEach(article => {
            const button = document.createElement('button');
            button.type = 'button';
            button.className = 'guide-nav-btn';
            if (article.id === this.activeArticleId) button.classList.add('active');
            button.textContent = article.label;
            button.addEventListener('click', () => {
                this.activeArticleId = article.id;
                this._renderNavigation();
                this._renderArticle(article);
            });
            this.nav.appendChild(button);
        });
    }

    _renderArticle(article) {
        if (this.title) this.title.textContent = article.title || '';
        if (this.lead) this.lead.textContent = article.lead || '';
        this._renderCommandList(article.commandMenuLabel || '');
        if (!this.body) return;
        this.body.textContent = '';

        (article.sections || []).forEach(section => {
            const sectionEl = document.createElement('section');
            sectionEl.className = 'guide-section';

            const heading = document.createElement('h4');
            heading.textContent = section.heading || '';
            sectionEl.appendChild(heading);

            if (section.text) {
                const paragraph = document.createElement('p');
                paragraph.textContent = section.text;
                sectionEl.appendChild(paragraph);
            }

            if (Array.isArray(section.bullets) && section.bullets.length > 0) {
                const list = document.createElement('ul');
                section.bullets.forEach(text => {
                    const item = document.createElement('li');
                    item.textContent = text;
                    list.appendChild(item);
                });
                sectionEl.appendChild(list);
            }

            this.body.appendChild(sectionEl);
        });
    }

    _renderCommandList(menuLabel) {
        if (!this.commandList) return;
        this.commandList.textContent = '';
        this.commandList.classList.toggle('hidden', !menuLabel);
        if (!menuLabel) return;

        const menu = (typeof COMMAND_MENU_STRUCTURE !== 'undefined' ? COMMAND_MENU_STRUCTURE : [])
            .find(entry => entry && entry.label === menuLabel);
        if (!menu) return;

        const labels = [];
        const collect = items => {
            (items || []).forEach(item => {
                if (typeof item === 'string') {
                    const spec = typeof COMMAND_SPECS !== 'undefined' ? COMMAND_SPECS[item] : null;
                    if (spec && spec.label) labels.push(spec.label);
                } else if (item && Array.isArray(item.items)) {
                    collect(item.items);
                }
            });
        };
        collect(menu.items);

        labels.forEach(label => {
            const chip = document.createElement('span');
            chip.className = 'guide-command-chip';
            chip.textContent = label;
            this.commandList.appendChild(chip);
        });
    }
}
