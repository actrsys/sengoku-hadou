/**
 * guide_view.js
 * タイトル画面とゲーム中から共通利用する「指南書」表示を専門管理します。
 * 記事本文は guide_data.js、コマンド名称・階層は command_catalog.js を正本とします。
 */
class GuideView {
    constructor(ui, game) {
        this.ui = ui;
        this.game = game;
        this.modal = document.getElementById('guide-modal');
        this.nav = document.getElementById('guide-nav');
        this.title = document.getElementById('guide-article-title');
        this.commandList = document.getElementById('guide-command-list');
        this.body = document.getElementById('guide-article-body');
        this.closeBtn = document.getElementById('guide-close-btn');
        this.activeArticleId = 'basics';
        this.activeCommandId = null;
        this.activeCommandGroupLabel = null;
        this.activeTopicId = null;
        this.activeTopicGroupId = null;
        this.didPauseBackground = false;

        if (this.closeBtn) this.closeBtn.addEventListener('click', () => this.close());
        this._renderNavigation();
    }

    open(articleId = 'basics') {
        if (!this.modal) return;
        const requested = this._getArticle(articleId) || this._getArticle('basics') || GUIDE_ARTICLES[0];
        if (!requested) return;

        this.activeArticleId = requested.id;
        this.activeCommandId = null;
        this.activeCommandGroupLabel = null;
        this.activeTopicId = null;
        this.activeTopicGroupId = null;
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

    _getMenu(menuLabel) {
        return (typeof COMMAND_MENU_STRUCTURE !== 'undefined' ? COMMAND_MENU_STRUCTURE : [])
            .find(entry => entry && entry.label === menuLabel) || null;
    }

    _getCommandLabel(commandId, fallback = '') {
        const spec = typeof COMMAND_SPECS !== 'undefined' ? COMMAND_SPECS[commandId] : null;
        return spec && spec.label ? spec.label : fallback;
    }

    _getCollapsedGroupCommandId(groupLabel) {
        if (typeof GUIDE_COLLAPSED_COMMAND_GROUPS === 'undefined' || !GUIDE_COLLAPSED_COMMAND_GROUPS) return null;
        return GUIDE_COLLAPSED_COMMAND_GROUPS[groupLabel] || null;
    }

    _getCommandDoc(commandId) {
        if (typeof GUIDE_COMMAND_DOCS === 'undefined' || !GUIDE_COMMAND_DOCS) return null;
        return GUIDE_COMMAND_DOCS[commandId] || null;
    }

    _getCommandGroupDoc(articleId, groupLabel) {
        if (typeof GUIDE_COMMAND_GROUP_DOCS === 'undefined' || !GUIDE_COMMAND_GROUP_DOCS) return null;
        return GUIDE_COMMAND_GROUP_DOCS[`${articleId}:${groupLabel}`] || null;
    }

    _getTopicDoc(topicId) {
        if (typeof GUIDE_TOPIC_DOCS === 'undefined' || !GUIDE_TOPIC_DOCS) return null;
        return GUIDE_TOPIC_DOCS[topicId] || null;
    }

    _getTopicItem(article, topicId) {
        const items = article && Array.isArray(article.topicItems) ? article.topicItems : [];
        for (const item of items) {
            if (!item) continue;
            if (item.id === topicId) return item;
            if (Array.isArray(item.items)) {
                const child = item.items.find(entry => entry && entry.id === topicId);
                if (child) return child;
            }
        }
        return null;
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
                this.activeCommandId = null;
                this.activeCommandGroupLabel = null;
                this.activeTopicId = null;
                this.activeTopicGroupId = null;
                this._renderNavigation();
                this._renderArticle(article);
            });
            this.nav.appendChild(button);
        });
    }

    _renderSections(sections) {
        if (!this.body) return;
        this.body.textContent = '';

        (sections || []).forEach(section => {
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

    _withOverview(lead, sections) {
        const result = Array.isArray(sections) ? sections.slice() : [];
        const text = typeof lead === 'string' ? lead.trim() : '';
        if (text) result.unshift({ heading: '概要', text });
        return result;
    }

    _renderArticle(article) {
        let displayTitle = article.label || article.title || '';
        let sections = article.sections || [];

        if (this.activeTopicId) {
            const topicDoc = this._getTopicDoc(this.activeTopicId);
            const topicItem = this._getTopicItem(article, this.activeTopicId);
            if (topicItem) displayTitle = topicItem.label || displayTitle;
            if (topicDoc) {
                sections = this._withOverview(topicDoc.lead, topicDoc.sections);
            }
        } else if (this.activeCommandId) {
            const commandDoc = this._getCommandDoc(this.activeCommandId);
            const commandLabel = this._getActiveCommandDisplayLabel(article, this.activeCommandId);
            displayTitle = commandLabel || displayTitle;
            if (commandDoc) {
                sections = this._withOverview(commandDoc.lead, commandDoc.sections);
            }
        } else if (this.activeCommandGroupLabel) {
            displayTitle = this.activeCommandGroupLabel;
            const groupDoc = this._getCommandGroupDoc(article.id, this.activeCommandGroupLabel);
            if (groupDoc) {
                sections = this._withOverview(groupDoc.lead, groupDoc.sections);
            } else {
                sections = [];
            }
        } else if (this.activeTopicGroupId) {
            const group = this._getTopicItem(article, this.activeTopicGroupId);
            displayTitle = group && group.label ? group.label : displayTitle;
            const groupDoc = this._getTopicDoc(this.activeTopicGroupId);
            if (groupDoc) {
                sections = this._withOverview(groupDoc.lead, groupDoc.sections);
            } else {
                sections = [];
            }
        } else {
            // 大分類の導入文も本文先頭の「概要」へ収めます。
            sections = this._withOverview(article.lead, article.sections);
        }

        if (this.title) this.title.textContent = displayTitle;
        this._renderSections(sections);
        this._renderExplorer(article);
    }

    _getActiveCommandDisplayLabel(article, commandId) {
        const menu = article && article.commandMenuLabel ? this._getMenu(article.commandMenuLabel) : null;
        if (!menu) return this._getCommandLabel(commandId, '');

        for (const item of menu.items || []) {
            if (typeof item === 'string' && item === commandId) return this._getCommandLabel(commandId, '');
            if (!item || typeof item !== 'object') continue;
            const collapsedId = this._getCollapsedGroupCommandId(item.label);
            if (collapsedId === commandId) return item.label;
            if (Array.isArray(item.items) && item.items.includes(commandId)) return this._getCommandLabel(commandId, item.label);
        }
        return this._getCommandLabel(commandId, '');
    }

    _createCommandButton(label, options = {}) {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'guide-command-btn';
        if (options.group) button.classList.add('guide-command-group-btn');
        if (options.child) button.classList.add('guide-command-child-btn');
        if (options.active) button.classList.add('active');
        button.textContent = label;
        if (typeof options.onClick === 'function') button.addEventListener('click', options.onClick);
        return button;
    }

    _renderExplorer(article) {
        if (article && Array.isArray(article.topicItems) && article.topicItems.length > 0) {
            this._renderTopicExplorer(article);
            return;
        }
        this._renderCommandExplorer(article);
    }

    _renderTopicExplorer(article) {
        if (!this.commandList) return;
        this.commandList.textContent = '';
        const items = Array.isArray(article.topicItems) ? article.topicItems : [];
        this.commandList.classList.toggle('hidden', items.length === 0);
        if (items.length === 0) return;

        const primary = document.createElement('div');
        primary.className = 'guide-command-primary';
        primary.appendChild(this._createCommandButton('概要', {
            active: !this.activeTopicId && !this.activeTopicGroupId,
            onClick: () => {
                this.activeTopicId = null;
                this.activeTopicGroupId = null;
                this._renderArticle(article);
            }
        }));

        items.forEach(item => {
            if (!item || !item.id) return;
            const hasChildren = Array.isArray(item.items) && item.items.length > 0;
            primary.appendChild(this._createCommandButton(item.label || item.id, {
                group: hasChildren,
                active: this.activeTopicId === item.id || this.activeTopicGroupId === item.id,
                onClick: () => {
                    if (hasChildren) {
                        this.activeTopicId = null;
                        this.activeTopicGroupId = this.activeTopicGroupId === item.id ? null : item.id;
                    } else {
                        this.activeTopicId = item.id;
                        this.activeTopicGroupId = null;
                    }
                    this._renderArticle(article);
                }
            }));
        });
        this.commandList.appendChild(primary);

        if (!this.activeTopicGroupId) return;
        const activeGroup = items.find(item => item && item.id === this.activeTopicGroupId);
        if (!activeGroup || !Array.isArray(activeGroup.items)) return;

        const children = document.createElement('div');
        children.className = 'guide-command-children';
        activeGroup.items.forEach(item => {
            if (!item || !item.id || !this._getTopicDoc(item.id)) return;
            children.appendChild(this._createCommandButton(item.label || item.id, {
                child: true,
                active: this.activeTopicId === item.id,
                onClick: () => {
                    this.activeTopicId = item.id;
                    this.activeTopicGroupId = activeGroup.id;
                    this._renderArticle(article);
                }
            }));
        });
        if (children.childElementCount > 0) this.commandList.appendChild(children);
    }

    _renderCommandExplorer(article) {
        if (!this.commandList) return;
        this.commandList.textContent = '';
        const menuLabel = article.commandMenuLabel || '';
        const menu = menuLabel ? this._getMenu(menuLabel) : null;
        this.commandList.classList.toggle('hidden', !menu);
        if (!menu) return;

        const primary = document.createElement('div');
        primary.className = 'guide-command-primary';

        primary.appendChild(this._createCommandButton('概要', {
            active: !this.activeCommandId && !this.activeCommandGroupLabel,
            onClick: () => {
                this.activeCommandId = null;
                this.activeCommandGroupLabel = null;
                this.activeTopicId = null;
                this.activeTopicGroupId = null;
                this._renderArticle(article);
            }
        }));

        (menu.items || []).forEach(item => {
            if (typeof item === 'string') {
                const doc = this._getCommandDoc(item);
                if (!doc) return;
                const label = this._getCommandLabel(item, item);
                primary.appendChild(this._createCommandButton(label, {
                    active: this.activeCommandId === item,
                    onClick: () => {
                        this.activeCommandId = item;
                        this.activeCommandGroupLabel = null;
                        this._renderArticle(article);
                    }
                }));
                return;
            }

            if (!item || !Array.isArray(item.items)) return;
            const collapsedId = this._getCollapsedGroupCommandId(item.label);
            if (collapsedId && this._getCommandDoc(collapsedId)) {
                primary.appendChild(this._createCommandButton(item.label, {
                    active: this.activeCommandId === collapsedId,
                    onClick: () => {
                        this.activeCommandId = collapsedId;
                        this.activeCommandGroupLabel = null;
                        this._renderArticle(article);
                    }
                }));
                return;
            }

            const hasDocs = item.items.some(id => this._getCommandDoc(id));
            if (!hasDocs) return;
            primary.appendChild(this._createCommandButton(item.label, {
                group: true,
                active: this.activeCommandGroupLabel === item.label,
                onClick: () => {
                    this.activeCommandId = null;
                    this.activeCommandGroupLabel = this.activeCommandGroupLabel === item.label ? null : item.label;
                    this._renderArticle(article);
                }
            }));
        });
        this.commandList.appendChild(primary);

        if (!this.activeCommandGroupLabel) return;
        const activeGroup = (menu.items || []).find(item => item && typeof item === 'object' && item.label === this.activeCommandGroupLabel);
        if (!activeGroup || !Array.isArray(activeGroup.items)) return;

        const children = document.createElement('div');
        children.className = 'guide-command-children';
        activeGroup.items.forEach(commandId => {
            const doc = this._getCommandDoc(commandId);
            if (!doc) return;
            const label = this._getCommandLabel(commandId, commandId);
            children.appendChild(this._createCommandButton(label, {
                child: true,
                active: this.activeCommandId === commandId,
                onClick: () => {
                    this.activeCommandId = commandId;
                    this.activeCommandGroupLabel = activeGroup.label;
                    this._renderArticle(article);
                }
            }));
        });
        if (children.childElementCount > 0) this.commandList.appendChild(children);
    }
}
