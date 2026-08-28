/**
 * custom_scrollbar.js
 * 縦スクロール専用版
 * Round 12: 長時間プレイ時のイベントリスナー残留と、ドラッグ中の二重更新を抑制
 */
class CustomScrollbar {
    constructor(listElement) {
        this.list = listElement;
        this._destroyed = false;
        this._scrollTicking = false;
        this._dragListenersAttached = false;
        this._hasOverflow = null;
        this._activeTouchId = null;
        this._savedScrollSnapType = null;
        this._scrollSnapRestoreToken = 0;

        // スマホ版（モバイル）かPC版かを自動で見分ける設定です
        this.isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
        this.isLocked = false;

        // 親が 'scroll-wrapper' じゃなければ、自動で枠を作って囲みます
        if (this.list.parentElement && this.list.parentElement.classList.contains('scroll-wrapper')) {
            this.wrapper = this.list.parentElement;
            this._createdWrapper = false;
        } else {
            this.wrapper = document.createElement('div');
            this.wrapper.className = 'scroll-wrapper';
            this._createdWrapper = true;

            // リストの大きさの情報を、外枠にも引き継ぎます
            this.wrapper.style.flex = this.list.style.flex || '1';
            this.wrapper.style.maxHeight = this.list.style.maxHeight;
            this.wrapper.style.minHeight = this.list.style.minHeight || '0';
            this.wrapper.style.overflow = 'hidden';
            this.wrapper.style.height = this.list.style.height;

            if (this.list.parentNode) {
                this.list.parentNode.insertBefore(this.wrapper, this.list);
            }
            this.wrapper.appendChild(this.list);
        }

        this.list.classList.add('hide-native-scroll');

        // ★縦用のバー
        this.trackY = document.createElement('div');
        this.trackY.className = 'custom-scrollbar-track';
        this.thumbY = document.createElement('div');
        this.thumbY.className = 'custom-scrollbar-thumb';
        this.trackY.appendChild(this.thumbY);
        this.wrapper.appendChild(this.trackY);

        // ★縦ボタン（上・下）
        this.btnUp = document.createElement('div');
        this.btnUp.className = 'custom-scrollbar-btn up';
        this.wrapper.appendChild(this.btnUp);

        this.btnDown = document.createElement('div');
        this.btnDown.className = 'custom-scrollbar-btn down';
        this.wrapper.appendChild(this.btnDown);

        // バーを掴んで引っ張る（ドラッグする）ための準備
        this.isDraggingY = false;
        this.startY = 0;
        this.startScrollTop = 0;

        this.initEvents();

        // ★Round12：生存中インスタンスを一元管理し、DOMから消えたものを後で確実に破棄できるようにします。
        CustomScrollbar.instances.add(this);
        CustomScrollbar._ensureSharedResizeListener();

        // 初回は1フレーム後に寸法を合わせます。
        this.scheduleUpdate();
    }

    getScrollStep() {
        const item = this.list.querySelector('.select-item');
        if (item) {
            const parentStyle = window.getComputedStyle(item.parentElement);
            const gap = parseFloat(parentStyle.rowGap) || parseFloat(parentStyle.gap) || 0;
            let step = item.offsetHeight + gap;
            if (step <= 0 || step > this.list.clientHeight) step = 40;
            return step;
        }
        return 40;
    }

    scheduleUpdate() {
        if (this._destroyed || this._scrollTicking) return;
        this._scrollTicking = true;
        const raf = window.requestAnimationFrame || ((cb) => setTimeout(cb, 16));
        raf(() => {
            this._scrollTicking = false;
            if (this._destroyed) return;
            // DOMから外れたリストは、その場で後始末します。
            if (!this.list || !this.list.isConnected) {
                this.destroy();
                return;
            }
            this.update();
        });
    }

    update() {
        if (this._destroyed || !this.list || !this.trackY || !this.thumbY) return;

        const listHeight = this.list.clientHeight;
        const scrollHeight = this.list.scrollHeight;
        const scrollTop = this.list.scrollTop;
        const trackHeight = this.trackY.clientHeight || listHeight;

        // display:none などでまだ寸法が確定していない時は、次回更新に任せます。
        if (listHeight <= 0 || trackHeight <= 0) return;

        const hasOverflow = scrollHeight > listHeight + 1;
        if (this._hasOverflow !== hasOverflow) {
            this._hasOverflow = hasOverflow;
            this.trackY.style.pointerEvents = hasOverflow ? 'auto' : 'none';
            this.thumbY.style.pointerEvents = hasOverflow ? 'auto' : 'none';
        }

        if (!hasOverflow) {
            if (this.thumbY.style.height !== '100%') this.thumbY.style.height = '100%';
            if (this.thumbY.style.top !== '0px') this.thumbY.style.top = '0px';
        } else {
            const thumbHeight = Math.max(40, (listHeight / scrollHeight) * trackHeight);
            const maxScrollTop = Math.max(1, scrollHeight - listHeight);
            const maxThumbTop = Math.max(0, trackHeight - thumbHeight);
            const scrollRatioY = Math.max(0, Math.min(1, scrollTop / maxScrollTop));
            const nextHeight = `${thumbHeight}px`;
            const nextTop = `${scrollRatioY * maxThumbTop}px`;
            if (this.thumbY.style.height !== nextHeight) this.thumbY.style.height = nextHeight;
            if (this.thumbY.style.top !== nextTop) this.thumbY.style.top = nextTop;
        }

        this.btnUp.classList.toggle('disabled', scrollTop <= 0);
        this.btnDown.classList.toggle('disabled', scrollTop + listHeight >= scrollHeight - 1);
    }

    _attachDragListeners() {
        if (this._dragListenersAttached) return;
        this._dragListenersAttached = true;
        document.addEventListener('mousemove', this.onDocMouseMove, { passive: false, capture: true });
        document.addEventListener('touchmove', this.onDocMouseMove, { passive: false, capture: true });
        document.addEventListener('mouseup', this.onEnd, true);
        document.addEventListener('touchend', this.onEnd, true);
        document.addEventListener('touchcancel', this.onEnd, true);
        window.addEventListener('blur', this.onEnd, true);
        window.addEventListener('pagehide', this.onEnd, true);
        document.addEventListener('visibilitychange', this.onVisibilityChange, true);
    }

    _detachDragListeners() {
        if (!this._dragListenersAttached) return;
        this._dragListenersAttached = false;
        document.removeEventListener('mousemove', this.onDocMouseMove, true);
        document.removeEventListener('touchmove', this.onDocMouseMove, true);
        document.removeEventListener('mouseup', this.onEnd, true);
        document.removeEventListener('touchend', this.onEnd, true);
        document.removeEventListener('touchcancel', this.onEnd, true);
        window.removeEventListener('blur', this.onEnd, true);
        window.removeEventListener('pagehide', this.onEnd, true);
        document.removeEventListener('visibilitychange', this.onVisibilityChange, true);
    }

    _suspendScrollSnapForDrag() {
        if (!this.list) return;
        // 仮想リストはスクロール中に行DOMを差し替えるため、古いWebViewで mandatory snap が
        // 新しいsnap先を連続再評価して自走することがあります。ドラッグ中だけsnapを止め、
        // 指を離した後に現在のDOMが落ち着いてから元のCSS指定へ戻します。
        this._scrollSnapRestoreToken++;
        if (this._savedScrollSnapType === null) this._savedScrollSnapType = this.list.style.scrollSnapType || '';
        this.list.style.scrollSnapType = 'none';
    }

    _restoreScrollSnapAfterDrag() {
        if (!this.list || this._savedScrollSnapType === null) return;
        const restoreValue = this._savedScrollSnapType;
        const token = ++this._scrollSnapRestoreToken;
        const raf = window.requestAnimationFrame || ((cb) => setTimeout(cb, 16));
        // 2フレーム待って、仮想スクロールの表示窓とつまみ位置を現在scrollTopへ同期してから戻します。
        raf(() => raf(() => {
            if (this._destroyed || this.isDraggingY || token !== this._scrollSnapRestoreToken || !this.list) return;
            this.list.style.scrollSnapType = restoreValue;
            this._savedScrollSnapType = null;
        }));
    }

    initEvents() {
        this.onListScroll = () => this.scheduleUpdate();

        // スマホ用：ローディング中やAIガード中はリスト側の指スクロールを止めます。
        if (this.isMobile) {
            this.onListTouchMove = (e) => {
                const globalLoading = document.getElementById('global-loading-screen');
                const aiGuard = document.getElementById('ai-guard');
                const warAiGuard = document.getElementById('war-ai-guard');

                const isGlobalLoading = globalLoading && !globalLoading.classList.contains('hidden');
                const isAIGuard = aiGuard && !aiGuard.classList.contains('hidden');
                const isWarAiGuard = warAiGuard && !warAiGuard.classList.contains('hidden');

                if (isGlobalLoading || isAIGuard || isWarAiGuard || this.isLocked) {
                    if (e.cancelable) e.preventDefault();
                }
            };
        }

        this.onStartY = (e) => {
            if (this._destroyed || !this._hasOverflow) return;
            const touch = e.touches && e.touches.length ? e.touches[0] : null;
            this._activeTouchId = touch ? touch.identifier : null;
            this.isDraggingY = true;
            this.thumbY.classList.add('dragging');
            this.startY = touch ? touch.clientY : e.clientY;
            this.startScrollTop = this.list.scrollTop;
            this._suspendScrollSnapForDrag();
            this._attachDragListeners();
            if (e.cancelable) e.preventDefault();
        };

        this.onMoveY = (e) => {
            if (!this.isDraggingY || this._destroyed) return;
            let point = e;
            if (e.touches) {
                point = null;
                for (let i = 0; i < e.touches.length; i++) {
                    const candidate = e.touches[i];
                    if (this._activeTouchId === null || candidate.identifier === this._activeTouchId) {
                        point = candidate;
                        break;
                    }
                }
            }
            if (!point) return;
            const currentY = point.clientY;
            const deltaY = currentY - this.startY;

            const listHeight = this.list.clientHeight;
            const scrollHeight = this.list.scrollHeight;
            const trackHeight = this.trackY.clientHeight || listHeight;
            const thumbHeight = parseFloat(this.thumbY.style.height) || trackHeight;
            const maxScrollTop = Math.max(0, scrollHeight - listHeight);
            const maxThumbTop = Math.max(0, trackHeight - thumbHeight);
            if (maxScrollTop <= 0 || maxThumbTop <= 0) return;

            const scrollRatio = deltaY / maxThumbTop;
            const nextScrollTop = this.startScrollTop + (scrollRatio * maxScrollTop);
            this.list.scrollTop = Math.max(0, Math.min(maxScrollTop, nextScrollTop));
            // ★Round12：ここではupdate()を直接呼びません。
            // scrollイベント側で1フレーム1回にまとめることで二重更新を防ぎます。
        };

        this.onEnd = () => {
            if (!this.isDraggingY && !this._dragListenersAttached) return;
            this.isDraggingY = false;
            this._activeTouchId = null;
            if (this.thumbY) this.thumbY.classList.remove('dragging');
            this._detachDragListeners();
            this.scheduleUpdate();
            this._restoreScrollSnapAfterDrag();
        };

        this.onVisibilityChange = () => {
            if (document.hidden) this.onEnd();
        };

        this.onDocMouseMove = (e) => {
            if (!this.isDraggingY) return;
            this.onMoveY(e);
            if (e.cancelable) e.preventDefault();
        };

        this.onBtnUp = () => {
            const step = this.getScrollStep();
            if (typeof this.list.scrollBy === 'function') {
                this.list.scrollBy({ top: -step, behavior: this.isMobile ? 'auto' : 'smooth' });
            } else {
                this.list.scrollTop -= step;
            }
        };
        this.onBtnDown = () => {
            const step = this.getScrollStep();
            if (typeof this.list.scrollBy === 'function') {
                this.list.scrollBy({ top: step, behavior: this.isMobile ? 'auto' : 'smooth' });
            } else {
                this.list.scrollTop += step;
            }
        };

        this.list.addEventListener('scroll', this.onListScroll, { passive: true });
        if (this.isMobile) {
            this.list.addEventListener('touchmove', this.onListTouchMove, { passive: false });
        }
        this.thumbY.addEventListener('mousedown', this.onStartY);
        this.thumbY.addEventListener('touchstart', this.onStartY, { passive: false });
        this.btnUp.addEventListener('click', this.onBtnUp);
        this.btnDown.addEventListener('click', this.onBtnDown);
    }

    destroy() {
        if (this._destroyed) return;
        this._destroyed = true;
        this.isDraggingY = false;
        this._activeTouchId = null;
        this._scrollSnapRestoreToken++;
        if (this.list && this._savedScrollSnapType !== null) {
            this.list.style.scrollSnapType = this._savedScrollSnapType;
            this._savedScrollSnapType = null;
        }
        this._detachDragListeners();

        if (this.list) {
            this.list.classList.remove('hide-native-scroll');
            if (this.onListScroll) this.list.removeEventListener('scroll', this.onListScroll);
            if (this.isMobile && this.onListTouchMove) this.list.removeEventListener('touchmove', this.onListTouchMove);
        }
        if (this.thumbY && this.onStartY) {
            this.thumbY.removeEventListener('mousedown', this.onStartY);
            this.thumbY.removeEventListener('touchstart', this.onStartY);
        }
        if (this.btnUp && this.onBtnUp) this.btnUp.removeEventListener('click', this.onBtnUp);
        if (this.btnDown && this.onBtnDown) this.btnDown.removeEventListener('click', this.onBtnDown);

        if (this.trackY) this.trackY.remove();
        if (this.btnUp) this.btnUp.remove();
        if (this.btnDown) this.btnDown.remove();

        if (this.list && this.list.customScrollbar === this) {
            this.list.customScrollbar = null;
        }

        CustomScrollbar.instances.delete(this);
        CustomScrollbar._releaseSharedResizeListenerIfUnused();
    }
}

// ★Round12：resize監視はScrollbarごとではなく1本だけにします。
CustomScrollbar.instances = new Set();
CustomScrollbar._sharedResizeHandler = null;
CustomScrollbar._ensureSharedResizeListener = function() {
    if (CustomScrollbar._sharedResizeHandler) return;
    CustomScrollbar._sharedResizeHandler = () => {
        CustomScrollbar.cleanupDisconnected();
        CustomScrollbar.instances.forEach(instance => instance.scheduleUpdate());
    };
    window.addEventListener('resize', CustomScrollbar._sharedResizeHandler, { passive: true });
};
CustomScrollbar._releaseSharedResizeListenerIfUnused = function() {
    if (CustomScrollbar.instances.size !== 0 || !CustomScrollbar._sharedResizeHandler) return;
    window.removeEventListener('resize', CustomScrollbar._sharedResizeHandler);
    CustomScrollbar._sharedResizeHandler = null;
};
CustomScrollbar.cleanupDisconnected = function() {
    Array.from(CustomScrollbar.instances).forEach(instance => {
        if (!instance.list || !instance.list.isConnected) instance.destroy();
    });
};

window.CustomScrollbar = CustomScrollbar;
