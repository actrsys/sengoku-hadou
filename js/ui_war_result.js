/**
 * 専用戦争リザルトView。
 * 戦域点滅・制圧演出と勝敗の確定はWarManager、ここは表示と確定操作のみを担当。
 * 標準のボタン音はUIManagerのdocument共通監視へ任せ、ここでSEを重ねない。
 */
Object.assign(UIManager.prototype, {
    showWarResult(data, onConfirm, autoCloseTime = 0) {
        this.dismissWarResult(true);
        const modal = document.getElementById('war-result-modal');
        const confirmBtn = document.getElementById('war-result-close-btn');
        if (!modal || !confirmBtn) {
            // DOM欠落時のみ会話ダイアログへ安全に退避する。
            this.showDialog(String(data.description || ''), false, onConfirm, null, { closeBeforeOk: true });
            return;
        }
        const setText = (id, value) => {
            const el = document.getElementById(id);
            if (el) el.textContent = String(value ?? '');
        };
        setText('war-result-title', data.title);
        setText('war-result-target', data.target);
        setText('war-result-attacker', data.attacker);
        setText('war-result-defender', data.defender);
        setText('war-result-attacker-leader', data.attackerLeader);
        setText('war-result-defender-leader', data.defenderLeader);
        setText('war-result-description', data.description);
        modal.classList.toggle('is-defeat', data.tone === 'defeat');
        modal.classList.toggle('is-retreat', data.tone === 'retreat');
        modal.classList.remove('hidden');
        const generation = Number(this._warResultGeneration || 0) + 1;
        this._warResultGeneration = generation;
        const finish = () => {
            if (generation !== this._warResultGeneration) return;
            this.dismissWarResult(false);
            if (typeof onConfirm === 'function') onConfirm();
        };
        this._warResultConfirm = finish;
        confirmBtn.addEventListener('click', finish, { once: true });
        if (autoCloseTime > 0) this._warResultTimer = setTimeout(finish, autoCloseTime);
    },

    dismissWarResult(canceled = false) {
        this._warResultGeneration = Number(this._warResultGeneration || 0) + 1;
        if (this._warResultTimer) clearTimeout(this._warResultTimer);
        this._warResultTimer = null;
        const confirmBtn = document.getElementById('war-result-close-btn');
        if (confirmBtn && this._warResultConfirm) confirmBtn.removeEventListener('click', this._warResultConfirm);
        this._warResultConfirm = null;
        const modal = document.getElementById('war-result-modal');
        if (modal) {
            modal.classList.add('hidden');
            modal.classList.remove('is-defeat', 'is-retreat');
        }
        // cancelは旧戦争のPromiseを解決するだけで、戦後操作を発火させない。
        if (canceled && this._warResultCancel) {
            const resolve = this._warResultCancel;
            this._warResultCancel = null;
            resolve(false);
        } else if (!canceled) {
            this._warResultCancel = null;
        }
    },

    showWarResultAsync(data, autoCloseTime = 0) {
        return new Promise(resolve => {
            this.showWarResult(data, () => resolve(true), autoCloseTime);
            this._warResultCancel = resolve;
        });
    }
});
