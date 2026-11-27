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
            if (typeof data.onOpen === 'function') data.onOpen();
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
        const winnerSide = !isProgress && ['attacker', 'defender'].includes(data.winnerSide) ? data.winnerSide : null;
        // 閉じる領域は確保したまま、公開前から操作も描画も止める。
        modal.classList.toggle('is-outcome-pending', !!winnerSide);
        confirmBtn.disabled = !!winnerSide;
        modal.classList.toggle('is-progress', isProgress);
        modal.classList.toggle('is-siege-progress', isProgress && frames[0].defender.defense != null);
        setText('war-result-kicker', isProgress ? '戦況' : '合戦結果');
        confirmBtn.textContent = isProgress ? '省略' : '閉じる';
        setText('war-result-title', data.title);
        setText('war-result-target', data.target, 16);
        setText('war-result-attacker', data.attacker, 8);
        setText('war-result-defender', data.defender, 8);
        setText('war-result-attacker-leader', data.attackerLeader, 8);
        setText('war-result-defender-leader', data.defenderLeader, 8);
        setText('war-result-message', data.description);
        const description = document.getElementById('war-result-description');
        if (description) description.scrollTop = 0;
        modal.classList.toggle('is-defeat', data.tone === 'defeat');
        modal.classList.toggle('is-retreat', data.tone === 'retreat');
        // 公開前に初期値をセットし、前戦の数値を見せない。
        const interval = Math.min(220, Math.max(65, Math.floor(1900 / Math.max(1, frames.length - 1))));
        if (isProgress) {
            modal.style.setProperty('--war-progress-step', `${Math.min(120, interval)}ms`);
            this._renderWarProgressFrame(frames[0], frames[0], false, frames.length === 1);
        }
        const generation = Number(this._warResultGeneration || 0) + 1;
        this._warResultGeneration = generation;
        const isCurrent = () => generation === this._warResultGeneration;
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
        const publish = () => {
            if (!isCurrent()) return false;
            this.prepareCoveredViewForOpen(modal);
            if (isProgress) {
                // 非表示中は実幅を測れない。公開と同じ描画単位で初回の幅を確定する。
                this._fitWarProgressLog();
                const log = document.getElementById('war-progress-log');
                if (log && typeof ResizeObserver === 'function') {
                    this._warProgressLogObserver = new ResizeObserver(() => {
                        if (isCurrent()) this._fitWarProgressLog();
                    });
                    this._warProgressLogObserver.observe(log);
                }
            }
            if (typeof data.onOpen === 'function') data.onOpen();
            const enableConfirm = () => {
                if (!isCurrent()) return;
                modal.classList.remove('is-outcome-pending');
                confirmBtn.disabled = false;
                this._warResultConfirm = finish;
                confirmBtn.addEventListener('click', finish, { once: true });
                // 観戦の自動終了も、演出完了後の結果を読む時間を確保する。
                if (!isProgress && autoCloseTime > 0) this._warResultTimer = setTimeout(finish, autoCloseTime);
            };
            if (winnerSide) {
                // 中立状態のpaintを確認してから、実際の勝敗だけを明暗で演出する。
                this._revealWarOutcome(modal, winnerSide, isCurrent).then(enableConfirm);
            } else enableConfirm();
            if (isProgress) {
                let index = 0;
                // 1行ログは同一ターンの数値を保ったまま順次表示する。タイマーは既存の1本のみ。
                let logIndex = 0;
                const schedule = () => {
                    const count = frames[index].logs?.length || 0;
                    const frameTime = index === frames.length - 1 ? 1400 : (index === 0 ? 300 : interval);
                    const delay = count ? Math.max(850, Math.ceil(frameTime / count)) : frameTime;
                    this._warResultTimer = setTimeout(advance, delay);
                };
                const advance = () => {
                    if (generation !== this._warResultGeneration) return;
                    if (++logIndex < (frames[index].logs?.length || 0)) {
                        this._renderWarProgressLog(frames[index].logs[logIndex]);
                    } else {
                        if (++index >= frames.length) { finish(); return; }
                        logIndex = 0;
                        this._renderWarProgressFrame(frames[index], frames[0], true, index === frames.length - 1);
                    }
                    schedule();
                };
                schedule();
            }
            return true;
        };
        // 同じ攻城戦の顔画像準備を利用。表示やタイマーはdecodeの完了後に開始する。
        const faces = [];
        for (const side of ['attacker', 'defender']) {
            const img = document.getElementById(`war-result-${side}-face`);
            if (!img) continue;
            img.style.visibility = 'hidden';
            const face = data[`${side}Face`];
            if (!face) { img.removeAttribute('src'); continue; }
            img.setAttribute('src', StatPresenter.safeFaceIconPath(face));
            faces.push(img);
        }
        if (!faces.length) return publish();
        const release = this.beginModalHandoff();
        this._warResultFaceHandoff = release;
        return Promise.all(faces.map(img => this._waitForWarFaceImage(img, isCurrent)))
            .then(publish)
            .finally(() => {
                if (this._warResultFaceHandoff === release) this._warResultFaceHandoff = null;
                release();
            });
    },

    async _revealWarOutcome(modal, winnerSide, isCurrent) {
        try {
            await this.waitForCoveredMapPaint();
            if (!isCurrent()) return;
            const cards = Array.from(modal.querySelectorAll('.war-result-army'));
            // 完了を検出できない旧環境では演出なしで確定表示し、操作不能にしない。
            const canAnimate = cards.length === 2 && cards.every(card => typeof card.getAnimations === 'function');
            if (canAnimate) modal.classList.add('is-outcome-revealing');
            modal.classList.add(`is-${winnerSide}-victory`);
            if (canAnimate) {
                const animations = cards.flatMap(card => card.getAnimations()).filter(animation => animation.animationName === 'war-result-reveal');
                await Promise.allSettled(animations.map(animation => animation.finished));
            }
        } catch (error) {
            // 表示演出の障害で戦後処理を止めない。確定済みの勝敗は保持する。
            if (isCurrent()) modal.classList.add(`is-${winnerSide}-victory`);
            console.warn('戦争リザルトの明暗演出を省略しました:', error);
        } finally {
            if (isCurrent()) modal.classList.remove('is-outcome-revealing');
        }
    },

    dismissWarResult(canceled = false) {
        this._warResultGeneration = Number(this._warResultGeneration || 0) + 1;
        if (this._warProgressLogObserver) {
            this._warProgressLogObserver.disconnect();
            this._warProgressLogObserver = null;
        }
        if (this._warResultFaceHandoff) {
            this._warResultFaceHandoff();
            this._warResultFaceHandoff = null;
        }
        if (this._warResultTimer) clearTimeout(this._warResultTimer);
        this._warResultTimer = null;
        const confirmBtn = document.getElementById('war-result-close-btn');
        if (confirmBtn && this._warResultConfirm) confirmBtn.removeEventListener('click', this._warResultConfirm);
        this._warResultConfirm = null;
        if (confirmBtn) confirmBtn.disabled = false;
        const modal = document.getElementById('war-result-modal');
        if (modal) {
            modal.classList.add('hidden');
            modal.classList.remove('is-defeat', 'is-retreat', 'is-progress', 'is-siege-progress', 'is-outcome-pending', 'is-outcome-revealing', 'is-attacker-victory', 'is-defender-victory');
        }
        for (const side of ['attacker', 'defender']) {
            const img = document.getElementById(`war-result-${side}-face`);
            if (img) { img.style.visibility = 'hidden'; img.removeAttribute('src'); }
        }
        // 一時ログは表示終了時に解放し、次の戦争や結果画面へ持ち越さない。
        const turn = document.getElementById('war-progress-turn');
        if (turn) turn.textContent = '';
        this._renderWarProgressLog('');
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
    _renderWarProgressFrame(frame, initial, animate, final = false) {
        for (const side of ['attacker', 'defender']) {
            const metrics = side === 'defender' && initial.defender.defense != null ? ['soldiers', 'rice', 'defense'] : ['soldiers', 'rice'];
            for (const metric of metrics) {
                const value = frame[side][metric];
                const max = Math.max(1, initial.attacker[metric] || 0, initial.defender[metric] || 0);
                const number = document.getElementById(`war-progress-${side}-${metric}`);
                const bar = document.getElementById(`war-progress-${side}-${metric}-bar`);
                if (number) number.textContent = value.toLocaleString('ja-JP');
                if (bar) {
                    bar.style.transition = animate ? '' : 'none';
                    bar.style.transform = `scaleX(${Math.max(0, Math.min(1, value / max))})`;
                }
            }
        }
        const turn = document.getElementById('war-progress-turn');
        if (turn) turn.textContent = `${frame.turn > 0 ? `第${frame.turn}ターン` : '開戦時'}${final ? '・決着' : ''}`;
        this._renderWarProgressLog(frame.logs?.[0]);
    },

    _renderWarProgressLog(message) {
        const log = document.getElementById('war-progress-log');
        if (!log) return;
        const text = String(message || '');
        log.title = text;
        const content = document.getElementById('war-progress-log-text') || log;
        content.textContent = text;
        this._fitWarProgressLog();
    },

    _fitWarProgressLog() {
        const log = document.getElementById('war-progress-log');
        const content = document.getElementById('war-progress-log-text');
        if (!log || !content) return;
        content.style.removeProperty('--war-log-scale');
        if (!content.textContent) return;
        const available = log.getBoundingClientRect().width;
        if (available <= 0) return;
        // 字数ではなく、現在の書体・端末・表示枠での無圧縮幅を基準とする。
        content.style.maxWidth = 'none';
        const natural = content.getBoundingClientRect().width;
        content.style.maxWidth = '';
        if (natural > available) {
            // 従来の圧縮下限を保ち、なお収まらない文字列は1行欄内で省略する。
            content.style.setProperty('--war-log-scale', Math.max(0.65, available / natural));
        }
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
