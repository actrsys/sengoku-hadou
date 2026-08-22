/**
 * legion_council_view.js
 * 評定専用View。表示・一時編集・確定操作だけを担当する。
 * 方針の正規化、保存、月1回判定は LegionPolicySystem に委譲する。
 */
class LegionCouncilView {
    constructor(ui, game) {
        this.ui = ui;
        this.game = game;
        this.modal = document.getElementById('legion-council-modal');
        this.leftSeats = document.getElementById('legion-council-left');
        this.rightSeats = document.getElementById('legion-council-right');
        this.date = document.getElementById('legion-council-date');
        this.clanName = document.getElementById('legion-council-clan-name');
        this.finishBtn = document.getElementById('legion-council-finish-btn');
        this.orderModal = document.getElementById('legion-council-order-modal');
        this.orderTitle = document.getElementById('legion-council-order-title');
        this.orderBody = document.getElementById('legion-council-order-body');
        this.orderConfirmBtn = document.getElementById('legion-council-order-confirm-btn');
        this.orderBackBtn = document.getElementById('legion-council-order-back-btn');
        this.draft = {};
        this.members = [];
        this.editingLegionNo = null;
        this.editingPolicy = null;

        if (this.finishBtn) this.finishBtn.onclick = () => this.confirmFinish();
        if (this.orderConfirmBtn) this.orderConfirmBtn.onclick = () => this.confirmOrderEditor();
        if (this.orderBackBtn) this.orderBackBtn.onclick = () => this.closeOrderEditor();
    }

    get system() {
        return this.game.legionPolicySystem;
    }

    requestOpen() {
        const clanId = Number(this.game.playerClanId);
        if (!this.system || !this.system.hasCouncilMembers(clanId)) {
            this.ui.showDialog('評定に列席できる国主がいません。', false, null, null, { okText: '閉じる' });
            return;
        }
        if (!this.system.canHoldCouncil(clanId)) {
            this.ui.showDialog('今月はすでに評定を開催しています。\n評定は一月に一度だけ開催できます。', false, null, null, { okText: '閉じる' });
            return;
        }

        const nav = this.game.getNavigatorInfo ? this.game.getNavigatorInfo(this.ui.currentCastle) : null;
        this.ui.showDialog('評定を開きますか？\n評定は一月に一度のみ開催できます。', true, () => {
            if (!this.system.beginCouncil(clanId)) {
                this.ui.showDialog('今月は評定を開催できません。', false, null, null, { okText: '閉じる' });
                return;
            }
            this.open();
        }, null, {
            okText: '評定を開く',
            okClass: 'btn-primary',
            cancelText: '戻る',
            leftFace: nav ? nav.faceIcon : null,
            leftName: nav ? nav.name : ''
        });
    }

    open() {
        if (!this.modal || !this.system) return;
        const clanId = Number(this.game.playerClanId);
        this.members = this.system.getCouncilMembers(clanId);
        this.draft = {};
        this.members.forEach(m => {
            this.draft[m.legionNo] = { ...m.policy };
        });
        this.editingLegionNo = null;
        this.editingPolicy = null;

        const clan = this.game.clans.find(c => Number(c.id) === clanId);
        if (this.clanName) this.clanName.textContent = clan ? `${clan.name} 評定` : '評定';
        if (this.date) this.date.textContent = `${this.game.year}年 ${this.game.month}月`;

        this.renderSeats();
        this.modal.classList.remove('hidden');
        if (typeof this.ui.pauseBackgroundUpdates === 'function') this.ui.pauseBackgroundUpdates();
    }

    close() {
        this.closeOrderEditor();
        if (this.modal) this.modal.classList.add('hidden');
        this.draft = {};
        this.members = [];
        this.editingLegionNo = null;
        this.editingPolicy = null;
        if (typeof this.ui.resumeBackgroundUpdates === 'function') this.ui.resumeBackgroundUpdates();
    }

    _policySummaryHtml(policy) {
        const offenseText = policy.allowOffense ? '攻勢許可' : '攻勢禁止';
        const hostilityText = !policy.allowOffense ? '新規交戦―' : (policy.allowNewHostility ? '新規交戦許可' : '新規交戦禁止');
        return `<span class="legion-council-policy-chip">${offenseText}</span><span class="legion-council-policy-chip">${hostilityText}</span>`;
    }

    _seatHtml(member) {
        const policy = this.draft[member.legionNo] || member.policy;
        const face = member.commander.faceIcon || 'unknown_face.webp';
        const labels = ['', '第一', '第二', '第三', '第四', '第五', '第六', '第七', '第八'];
        const name = member.commander.name || '不明';
        return `
            <div class="legion-council-seat" data-legion-no="${member.legionNo}" role="button" tabindex="0" aria-label="${labels[member.legionNo]}国主 ${name} の命令を開く">
                <div class="legion-council-seat-heading">${labels[member.legionNo]}国主</div>
                <img class="legion-council-face" src="data/images/faceicons/${face}" alt="">
                <div class="legion-council-name">${name}</div>
                <div class="legion-council-policy-summary">${this._policySummaryHtml(policy)}</div>
                <div class="legion-council-seat-hint">選択して命令を変更</div>
            </div>`;
    }

    renderSeats() {
        if (!this.leftSeats || !this.rightSeats) return;
        const left = this.members.filter(m => m.legionNo >= 1 && m.legionNo <= 4);
        const right = this.members.filter(m => m.legionNo >= 5 && m.legionNo <= 8);
        this.leftSeats.innerHTML = left.map(m => this._seatHtml(m)).join('');
        this.rightSeats.innerHTML = right.map(m => this._seatHtml(m)).join('');

        this.modal.querySelectorAll('.legion-council-face').forEach(img => {
            img.onerror = () => {
                img.onerror = null;
                img.src = 'data/images/faceicons/unknown_face.webp';
            };
        });

        this.modal.querySelectorAll('.legion-council-seat').forEach(seat => {
            const open = () => this.openOrderEditor(Number(seat.dataset.legionNo));
            seat.onclick = open;
            seat.onkeydown = event => {
                if (event.key !== 'Enter' && event.key !== ' ') return;
                event.preventDefault();
                open();
            };
        });
    }

    openOrderEditor(legionNo) {
        if (!this.orderModal || !this.orderBody) return;
        const member = this.members.find(m => Number(m.legionNo) === Number(legionNo));
        if (!member) return;
        this.editingLegionNo = Number(legionNo);
        this.editingPolicy = { ...(this.draft[member.legionNo] || member.policy || this.system.getDefaultPolicy()) };
        this.renderOrderEditor();
        if (window.AudioManager) window.AudioManager.playSE('choice.ogg');
        this.orderModal.classList.remove('hidden');
    }

    closeOrderEditor() {
        if (this.orderModal) this.orderModal.classList.add('hidden');
        this.editingLegionNo = null;
        this.editingPolicy = null;
    }

    confirmOrderEditor() {
        const legionNo = Number(this.editingLegionNo || 0);
        if (!legionNo || !this.editingPolicy) {
            this.closeOrderEditor();
            return;
        }
        this.draft[legionNo] = this.system.normalizePolicy(this.editingPolicy);
        this.renderSeats();
        this.closeOrderEditor();
    }

    renderOrderEditor() {
        if (!this.orderBody) return;
        const member = this.members.find(m => Number(m.legionNo) === Number(this.editingLegionNo));
        if (!member) {
            this.orderBody.innerHTML = '';
            return;
        }

        const policy = this.editingPolicy || this.draft[member.legionNo] || this.system.getDefaultPolicy();
        const labels = ['', '第一', '第二', '第三', '第四', '第五', '第六', '第七', '第八'];
        if (this.orderTitle) this.orderTitle.textContent = `${labels[member.legionNo]}国主　${member.commander.name}`;

        this.orderBody.innerHTML = `
            <div class="legion-council-order-row">
                <div class="legion-council-order-label">
                    <strong>攻勢</strong>
                    <small>他家・諸勢力への自主的な攻撃</small>
                </div>
                <div class="legion-council-toggle" data-key="allowOffense">
                    <button type="button" data-value="true" data-se="choice.ogg" class="ui-toggle-btn ${policy.allowOffense ? 'active' : ''}">許可</button>
                    <button type="button" data-value="false" data-se="choice.ogg" class="ui-toggle-btn ${!policy.allowOffense ? 'active' : ''}">禁止</button>
                </div>
            </div>
            <div class="legion-council-order-row${policy.allowOffense ? '' : ' disabled-row'}">
                <div class="legion-council-order-label">
                    <strong>新規交戦</strong>
                    <small>現在敵対でない大名家への攻撃</small>
                </div>
                <div class="legion-council-toggle" data-key="allowNewHostility">
                    <button type="button" data-value="true" data-se="choice.ogg" class="ui-toggle-btn ${policy.allowNewHostility ? 'active' : ''}" ${policy.allowOffense ? '' : 'disabled'}>許可</button>
                    <button type="button" data-value="false" data-se="choice.ogg" class="ui-toggle-btn ${!policy.allowNewHostility ? 'active' : ''}" ${policy.allowOffense ? '' : 'disabled'}>禁止</button>
                </div>
            </div>
            `;

        this.orderBody.querySelectorAll('.legion-council-toggle button').forEach(btn => {
            btn.onclick = () => {
                const wrap = btn.closest('.legion-council-toggle');
                const key = wrap.dataset.key;
                const value = btn.dataset.value === 'true';
                if (!this.editingPolicy) this.editingPolicy = { ...(this.draft[member.legionNo] || this.system.getDefaultPolicy()) };
                this.editingPolicy[key] = value;
                this.renderOrderEditor();
            };
        });
    }

    confirmFinish() {
        this.ui.showDialog('この内容で国主への命令を確定し、評定を終えますか？', true, () => {
            const changed = this.system.commitPolicies(this.game.playerClanId, this.draft);
            this.close();
            this.ui.showResultModal(`評定を終えました。\n${changed > 0 ? `${changed}軍団の方針を変更しました。` : '方針の変更はありません。'}`);
            if (typeof this.ui.renderCommandMenu === 'function') this.ui.renderCommandMenu();
        }, null, {
            okText: '命令を確定',
            okClass: 'btn-primary',
            cancelText: '戻る'
        });
    }
}

window.LegionCouncilView = LegionCouncilView;
