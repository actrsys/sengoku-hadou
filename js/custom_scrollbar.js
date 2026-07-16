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
            this.wrapper.style.minHeight = this.list.style.minHeight;
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
            if (this.list.children.length > 0) {
                const item = this.list.children[0];
                const style = window.getComputedStyle(this.list);
                const gap = parseFloat(style.rowGap) || parseFloat(style.gap) || 0;
                return item.offsetHeight + gap; // 1行の高さ＋隙間
            }
            return 36;
        };

        // ボタンのクリックイベント（計算した1行分をスクロールします）
        this.btnUp.addEventListener('click', () => this.list.scrollBy({ top: -getScrollStep(), behavior: 'smooth' }));
        this.btnDown.addEventListener('click', () => this.list.scrollBy({ top: getScrollStep(), behavior: 'smooth' }));
        
        // スマホ版（モバイル）かPC版かを自動で見分ける設定です
        this.isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
        this.isLocked = false;

        // PC版の時だけ、マウスでバーを掴んで引っ張る（ドラッグする）ための準備をします
        if (!this.isMobile) {
            this.isDraggingY = false;
            this.startY = 0;
            this.startScrollTop = 0;
        }
        
        this.initEvents();
    }
    
    update() {
        const listHeight = this.list.clientHeight;
        const scrollHeight = this.list.scrollHeight;
        const scrollTop = this.list.scrollTop;

        // --- 縦のバーの更新 ---
        const trackHeight = this.trackY.clientHeight || listHeight;
        
        // スマホ版の時だけバーを触れなく（見るだけ）し、PC版では掴めるようにします
        if (this.isMobile) {
            this.trackY.style.pointerEvents = 'none';
            this.thumbY.style.pointerEvents = 'none';
        } else {
            this.trackY.style.pointerEvents = 'auto';
            this.thumbY.style.pointerEvents = 'auto';
        }
        
        if (scrollHeight <= listHeight) {
            this.thumbY.style.height = '100%';
            this.thumbY.style.top = '0px';
            // PC版でスクロールが不要な状態の時は掴めないようにします
            if (!this.isMobile) {
                this.thumbY.style.pointerEvents = 'none';
            }
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

        // PC用のマウスドラッグ（バーを掴んでスクロールさせる処理）です
        if (!this.isMobile) {
            this.onStartY = (e) => {
                this.isDraggingY = true;
                this.thumbY.classList.add('dragging');
                this.startY = e.clientY;
                this.startScrollTop = this.list.scrollTop;
            };
            
            this.onMoveY = (e) => {
                if (!this.isDraggingY) return;
                const currentY = e.clientY;
                const deltaY = currentY - this.startY;
                
                const listHeight = this.list.clientHeight;
                const scrollHeight = this.list.scrollHeight;
                const trackHeight = this.trackY.clientHeight || listHeight; 
                const thumbHeight = parseFloat(this.thumbY.style.height);
                
                const maxScrollTop = scrollHeight - listHeight;
                const maxThumbTop = trackHeight - thumbHeight; 
                
                const scrollRatio = deltaY / maxThumbTop;
                this.list.scrollTop = this.startScrollTop + (scrollRatio * maxScrollTop);
                
                this.update();
            };
            
            this.onEnd = () => {
                this.isDraggingY = false;
                this.thumbY.classList.remove('dragging');
            };

            this.onDocMouseMove = (e) => {
                if (this.isDraggingY) this.onMoveY(e);
            };
        }
        
        this.onWindowResize = () => this.update();

        // ここから実際にイベントを取り付けます
        this.list.addEventListener('scroll', this.onListScroll);
        
        if (this.isMobile) {
            // スマホ版：指でのスワイプのみ監視します
            this.list.addEventListener('touchmove', this.onListTouchMove, { passive: false });
        } else {
            // PC版：マウス操作（クリックやドラッグ）のみ監視します
            this.thumbY.addEventListener('mousedown', this.onStartY);
            document.addEventListener('mousemove', this.onDocMouseMove);
            document.addEventListener('mouseup', this.onEnd);
        }
        
        window.addEventListener('resize', this.onWindowResize);
    }

    // ★お片付けの魔法
    destroy() {
        if (this.trackY) this.trackY.remove();
        if (this.btnUp) this.btnUp.remove();
        if (this.btnDown) this.btnDown.remove();
        
        this.list.classList.remove('hide-native-scroll');
        
        if (this.onListScroll) this.list.removeEventListener('scroll', this.onListScroll);
        
        // スマホ版とPC版でそれぞれ取り付けたイベントを、綺麗にお片付け（解除）します
        if (this.isMobile) {
            if (this.onListTouchMove) {
                this.list.removeEventListener('touchmove', this.onListTouchMove);
            }
        } else {
            if (this.thumbY && this.onStartY) {
                this.thumbY.removeEventListener('mousedown', this.onStartY);
            }
            if (this.onDocMouseMove) {
                document.removeEventListener('mousemove', this.onDocMouseMove);
            }
            if (this.onEnd) {
                document.removeEventListener('mouseup', this.onEnd);
            }
        }

        if (this.onWindowResize) window.removeEventListener('resize', this.onWindowResize);
    }
}
window.CustomScrollbar = CustomScrollbar;