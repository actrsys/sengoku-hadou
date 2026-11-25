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
        const setText = (id, value, compressAt = 0) => {
            const el = document.getElementById(id);
            if (!el) return;
            const text = String(value ?? '');
            el.title = text;
            // 既存の武将・軍名表示と同じ文字圧縮を利用し、固定欄から溢れる場合だけ省略する。
            if (compressAt && typeof this._getCompressedTextHtml === 'function') {
                el.innerHTML = this._getCompressedTextHtml(text, compressAt);
            } else el.textContent = text;
        };
        const frames = Array.isArray(data.progressFrames) ? data.progressFrames : [];
        const isProgress = frames.length > 0;
        modal.classList.toggle('is-progress', isProgress);
        setText('war-result-kicker', isProgress ? '戦況' : '合戦結果');
        confirmBtn.textContent = isProgress ? '省略' : '閉じる';
        setText('war-result-title', data.title);
        setText('war-result-target', data.target, 16);
        setText('war-result-attacker', data.attacker, 8);
        setText('war-result-defender', data.defender, 8);
        setText('war-result-attacker-leader', data.attackerLeader, 8);
        setText('war-result-defender-leader', data.defenderLeader, 8);
        setText('war-result-description', data.description);
        const description = document.getElementById('war-result-description');
        if (description) description.scrollTop = 0;
        modal.classList.toggle('is-defeat', data.tone === 'defeat');
        modal.classList.toggle('is-retreat', data.tone === 'retreat');
        // 公開前に初期値をセットし、前戦の数値を見せない。
        const interval = Math.min(220, Math.max(65, Math.floor(1900 / Math.max(1, frames.length - 1))));
        if (isProgress) {
            modal.style.setProperty('--war-progress-step', `${Math.min(120, interval)}ms`);
            this._renderWarProgressFrame(frames[0], frames[0], false);
        }
        this.prepareCoveredViewForOpen(modal);
        const generation = Number(this._warResultGeneration || 0) + 1;
        this._warResultGeneration = generation;
        const finish = () => {
            if (generation !== this._warResultGeneration) return;
            const completeHandoff = typeof this.beginModalHandoff === 'function'
                ? this.beginModalHandoff() : () => {};
            this.dismissWarResult(false);
            try {
                const result = typeof onConfirm === 'function' ? onConfirm() : null;
                if (result && typeof result.then === 'function') {
                    Promise.resolve(result).then(completeHandoff, error => {
                        completeHandoff();
                        console.error('戦争リザルト後処理に失敗しました:', error);
                    });
                } else {
                    completeHandoff();
                }
            } catch (error) {
                completeHandoff();
                throw error;
            }
        };
        this._warResultConfirm = finish;
        confirmBtn.addEventListener('click', finish, { once: true });
        if (isProgress) {
            let index = 0;
            const advance = () => {
                if (generation !== this._warResultGeneration) return;
                if (++index >= frames.length) { finish(); return; }
                this._renderWarProgressFrame(frames[index], frames[0], true);
                this._warResultTimer = setTimeout(advance, index === frames.length - 1 ? 380 : interval);
            };
            this._warResultTimer = setTimeout(advance, frames.length === 1 ? 650 : 300);
        } else if (autoCloseTime > 0) this._warResultTimer = setTimeout(finish, autoCloseTime);
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
            modal.classList.remove('is-defeat', 'is-retreat', 'is-progress');
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

    // 両軍共通の初期最大値を固定基準にする。バーはレイアウトを変えない。
    _renderWarProgressFrame(frame, initial, animate) {
        for (const side of ['attacker', 'defender']) {
            for (const metric of ['soldiers', 'rice']) {
                const value = frame[side][metric];
                const max = Math.max(1, initial.attacker[metric], initial.defender[metric]);
                const number = document.getElementById(`war-progress-${side}-${metric}`);
                const bar = document.getElementById(`war-progress-${side}-${metric}-bar`);
                if (number) number.textContent = value.toLocaleString('ja-JP');
                if (bar) {
                    bar.style.transition = animate ? '' : 'none';
                    bar.style.transform = `scaleX(${Math.max(0, Math.min(1, value / max))})`;
                }
            }
        }
        const detail = document.getElementById('war-result-description');
        if (detail) detail.textContent = `${frame.turn > 0 ? `第${frame.turn}ターン` : '開戦時'}\n兵力・兵糧は参加援軍を含む`;
    },

    showWarProgressAsync(data, frames) {
        if (!frames.length || !document.getElementById('war-result-modal') || !document.getElementById('war-result-close-btn') || !document.getElementById('war-progress-attacker-soldiers-bar')) return Promise.resolve(true);
        return this.showWarResultAsync({ ...data, progressFrames: frames });
    },

    showWarResultAsync(data, autoCloseTime = 0) {
        return new Promise(resolve => {
            this.showWarResult(data, () => resolve(true), autoCloseTime);
            this._warResultCancel = resolve;
        });
    }
});
