/**
 * custom_scrollbar.js
 * 縦スクロール専用版
 */
class CustomScrollbar {
    constructor(listElement) {
        this.list = listElement;
        
        // 親が 'scroll-wrapper' じゃなければ、自動で枠を作って囲んであげる魔法！
        if (this.list.parentElement && this.list.parentElement.classList.contains('scroll-wrapper')) {
            this.wrapper = this.list.parentElement;
        } else {
            this.wrapper = document.createElement('div');
            this.wrapper.className = 'scroll-wrapper';
            
            // リストの大きさの情報を、外枠にも引き継いでおきます
            this.wrapper.style.flex = this.list.style.flex || '1';
            this.wrapper.style.maxHeight = this.list.style.maxHeight;
            // ★フレックスボックス内で要素がはみ出さない（押し出されない）ための絶対的なおまじないです！
            this.wrapper.style.minHeight = this.list.style.minHeight || '0';
            this.wrapper.style.overflow = 'hidden';
            this.wrapper.style.height = this.list.style.height;
            
            if (this.list.parentNode) {
                this.list.parentNode.insertBefore(this.wrapper, this.list);
            }
            this.wrapper.appendChild(this.list);
        }
        
        // 元からあるスマホやパソコンのスクロールバーを隠す魔法をかけます
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

        // 行の高さ（1行分）を自動で計算してズレをなくす魔法の計算式です
        const getScrollStep = () => {
            // ★修正：ui_info.jsで作られる「実際の1行（.select-item）」を直接探し出して測ります
            const item = this.list.querySelector('.select-item');
            
            if (item) {
                // その行を囲んでいる親要素（list-inner-wrapper）の隙間設定も取得します
                const parentStyle = window.getComputedStyle(item.parentElement);
                const gap = parseFloat(parentStyle.rowGap) || parseFloat(parentStyle.gap) || 0;
                
                let step = item.offsetHeight + gap;
                
                // 安全装置：もし測った高さがおかしい場合は、ui_info.jsの基本値(40)に合わせます
                if (step <= 0 || step > this.list.clientHeight) {
                    step = 40;
                }
                return step;
            }
            return 40; // 要素が何もない時の安全な基本値です
        };

        // ボタンのクリックイベント（計算した1行分をスクロールします）
        this.btnUp.addEventListener('click', () => {
            if (typeof this.list.scrollBy === 'function') {
                this.list.scrollBy({ top: -getScrollStep(), behavior: 'smooth' });
            } else {
                // 古いブラウザなどで scrollBy が使えない場合の安全装置です
                this.list.scrollTop -= getScrollStep();
            }
        });
        this.btnDown.addEventListener('click', () => {
            if (typeof this.list.scrollBy === 'function') {
                this.list.scrollBy({ top: getScrollStep(), behavior: 'smooth' });
            } else {
                // 古いブラウザなどで scrollBy が使えない場合の安全装置です
                this.list.scrollTop += getScrollStep();
            }
        });
        
        // スマホ版（モバイル）かPC版かを自動で見分ける設定です
        this.isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
        this.isLocked = false;

        // バーを掴んで引っ張る（ドラッグする）ための準備をします
        this.isDraggingY = false;
        this.startY = 0;
        this.startScrollTop = 0;
        
        this.initEvents();
    }
    
    update() {
        const listHeight = this.list.clientHeight;
        const scrollHeight = this.list.scrollHeight;
        const scrollTop = this.list.scrollTop;

        const trackHeight = this.trackY.clientHeight || listHeight;
        
        // 制限を外して、スマホ版でもバーを掴めるようにします
        this.trackY.style.pointerEvents = 'auto';
        this.thumbY.style.pointerEvents = 'auto';
        
        if (scrollHeight <= listHeight) {
            this.thumbY.style.height = '100%';
            this.thumbY.style.top = '0px';
            // スクロールが不要な状態の時は掴めないようにします
            this.thumbY.style.pointerEvents = 'none';
        } else {
            let thumbHeight = Math.max(40, (listHeight / scrollHeight) * trackHeight);
            this.thumbY.style.height = `${thumbHeight}px`;
            const maxScrollTop = scrollHeight - listHeight;
            const maxThumbTop = trackHeight - thumbHeight;
            const scrollRatioY = scrollTop / maxScrollTop;
            this.thumbY.style.top = `${scrollRatioY * maxThumbTop}px`;
        }

        // --- ボタンの色（有効・無効）の更新 ---
        // 上端なら「上」ボタンを銀色に
        this.btnUp.classList.toggle('disabled', scrollTop <= 0);
        // 下端なら「下」ボタンを銀色に
        this.btnDown.classList.toggle('disabled', scrollTop + listHeight >= scrollHeight - 1);
    }
    
    initEvents() {
        this.onListScroll = () => {
            // ★軽量化：スクロール時の計算に少しだけ休憩（アニメーションフレーム）を挟み、スマホでのカクつきを防ぎます！
            if (!this._scrollTicking) {
                requestAnimationFrame(() => {
                    this.update();
                    this._scrollTicking = false;
                });
                this._scrollTicking = true;
            }
        };

        // スマホ（モバイルデバイス）用の指スワイプ制御の処理です
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

        // スマホ・PC共通のドラッグ（バーを掴んでスクロールさせる処理）です// 差し替え後
        this.onStartY = (e) => {
            this.isDraggingY = true;
            this.thumbY.classList.add('dragging');
            this.startY = e.touches ? e.touches[0].clientY : e.clientY;
            this.startScrollTop = this.list.scrollTop;

            // ★追加：ドラッグ中に毎回リフローが起きないよう、開始時に一度だけ寸法を測って覚えておきます
            this.dragListHeight = this.list.clientHeight;
            this.dragScrollHeight = this.list.scrollHeight;
            this.dragTrackHeight = this.trackY.clientHeight || this.dragListHeight;
            this.dragThumbHeight = parseFloat(this.thumbY.style.height);
            this._dragTicking = false;
            
            if (e.cancelable) e.preventDefault();
        };

        this.onMoveY = (e) => {
            if (!this.isDraggingY) return;
            const currentY = e.touches ? e.touches[0].clientY : e.clientY;
            this._pendingDeltaY = currentY - this.startY;

            // ★追加：連続で発生するタッチ・マウス移動を間引き、1フレームにつき1回だけ反映します
            if (this._dragTicking) return;
            this._dragTicking = true;
            requestAnimationFrame(() => {
                this._dragTicking = false;
                if (!this.isDraggingY) return;

                const maxScrollTop = this.dragScrollHeight - this.dragListHeight;
                const maxThumbTop = this.dragTrackHeight - this.dragThumbHeight;
                if (maxThumbTop === 0) return;

                const scrollRatio = this._pendingDeltaY / maxThumbTop;
                this.list.scrollTop = this.startScrollTop + (scrollRatio * maxScrollTop);

                this.update();
            });
        };
        
        this.onEnd = () => {
            this.isDraggingY = false;
            this.thumbY.classList.remove('dragging');
        };

        this.onDocMouseMove = (e) => {
            if (this.isDraggingY) {
                this.onMoveY(e);
                // ドラッグ中も画面が裏で動かないように固定します
                if (e.cancelable) e.preventDefault();
            }
        };
        
        this.onWindowResize = () => this.update();

        // ここから実際にイベントを取り付けます
        this.list.addEventListener('scroll', this.onListScroll);
        
        if (this.isMobile) {
            // スマホ版：指でのスワイプ監視
            this.list.addEventListener('touchmove', this.onListTouchMove, { passive: false });
        }
        
        // PC・スマホ共通：マウス操作やタッチ操作を取り付けます
        this.thumbY.addEventListener('mousedown', this.onStartY);
        this.thumbY.addEventListener('touchstart', this.onStartY, { passive: false });
        
        document.addEventListener('mousemove', this.onDocMouseMove, { passive: false });
        document.addEventListener('touchmove', this.onDocMouseMove, { passive: false });
        
        document.addEventListener('mouseup', this.onEnd);
        document.addEventListener('touchend', this.onEnd);
        
        window.addEventListener('resize', this.onWindowResize);
    }

    // ★お片付けの魔法
    destroy() {
        if (this.trackY) this.trackY.remove();
        if (this.btnUp) this.btnUp.remove();
        if (this.btnDown) this.btnDown.remove();
        
        this.list.classList.remove('hide-native-scroll');
        
        if (this.onListScroll) this.list.removeEventListener('scroll', this.onListScroll);
        
        // 取り付けたイベントを、綺麗にお片付け（解除）します
        if (this.isMobile) {
            if (this.onListTouchMove) {
                this.list.removeEventListener('touchmove', this.onListTouchMove);
            }
        }
        if (this.thumbY && this.onStartY) {
            this.thumbY.removeEventListener('mousedown', this.onStartY);
            this.thumbY.removeEventListener('touchstart', this.onStartY);
        }
        if (this.onDocMouseMove) {
            document.removeEventListener('mousemove', this.onDocMouseMove);
            document.removeEventListener('touchmove', this.onDocMouseMove);
        }
        if (this.onEnd) {
            document.removeEventListener('mouseup', this.onEnd);
            document.removeEventListener('touchend', this.onEnd);
        }

        if (this.onWindowResize) window.removeEventListener('resize', this.onWindowResize);
    }
}
window.CustomScrollbar = CustomScrollbar;