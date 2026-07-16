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

        // ボタンのクリックイベント（１行分スクロール）
        this.btnUp.addEventListener('click', () => this.list.scrollBy({ top: -36, behavior: 'smooth' }));
        this.btnDown.addEventListener('click', () => this.list.scrollBy({ top: 36, behavior: 'smooth' }));
        
        this.isDraggingY = false;
        this.startY = 0;
        this.startScrollTop = 0;
        
        this.initEvents();
    }
    
    update() {
        const listHeight = this.list.clientHeight;
        const scrollHeight = this.list.scrollHeight;
        const scrollTop = this.list.scrollTop;

        // --- 縦のバーの更新 ---
        const trackHeight = this.trackY.clientHeight || listHeight;
        if (scrollHeight <= listHeight) {
            this.thumbY.style.height = '100%';
            this.thumbY.style.top = '0px';
            this.thumbY.style.pointerEvents = 'none';
        } else {
            this.thumbY.style.pointerEvents = 'auto';
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
            if (!this.isDraggingY) {
                // ★軽量化：スクロール時の計算に少しだけ休憩（アニメーションフレーム）を挟み、スマホでのカクつきを防ぎます！
                if (!this._scrollTicking) {
                    requestAnimationFrame(() => {
                        this.update();
                        this._scrollTicking = false;
                    });
                    this._scrollTicking = true;
                }
            }
        };

        // 縦つまみのドラッグ操作
        this.onStartY = (e) => {
            this.isDraggingY = true;
            this.thumbY.classList.add('dragging');
            this.startY = e.type.includes('touch') ? e.touches[0].clientY : e.clientY;
            this.startScrollTop = this.list.scrollTop;
            if (e.cancelable) e.preventDefault();
        };
        
        this.onMoveY = (e) => {
            if (!this.isDraggingY) return;
            const currentY = e.type.includes('touch') ? e.touches[0].clientY : e.clientY;
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
            if (e.cancelable) e.preventDefault();
        };
        
        this.onEnd = () => {
            this.isDraggingY = false;
            this.thumbY.classList.remove('dragging');
        };

        this.onDocTouchMove = (e) => {
            if (this.isDraggingY) this.onMoveY(e);
        };

        this.onDocMouseMove = (e) => {
            if (this.isDraggingY) this.onMoveY(e);
        };
        
        this.onWindowResize = () => this.update();

        // ここから実際にイベントを取り付けます
        this.list.addEventListener('scroll', this.onListScroll);
        
        this.thumbY.addEventListener('touchstart', this.onStartY, { passive: false });
        this.thumbY.addEventListener('mousedown', this.onStartY);

        document.addEventListener('touchmove', this.onDocTouchMove, { passive: false });
        document.addEventListener('mousemove', this.onDocMouseMove);
        document.addEventListener('touchend', this.onEnd);
        document.addEventListener('mouseup', this.onEnd);
        window.addEventListener('resize', this.onWindowResize);
    }

    // ★お片付けの魔法
    destroy() {
        if (this.trackY) this.trackY.remove();
        if (this.btnUp) this.btnUp.remove();
        if (this.btnDown) this.btnDown.remove();
        
        this.list.classList.remove('hide-native-scroll');
        
        if (this.onListScroll) this.list.removeEventListener('scroll', this.onListScroll);
        
        if (this.onStartY) {
            this.thumbY.removeEventListener('touchstart', this.onStartY);
            this.thumbY.removeEventListener('mousedown', this.onStartY);
        }

        if (this.onDocTouchMove) document.removeEventListener('touchmove', this.onDocTouchMove);
        if (this.onDocMouseMove) document.removeEventListener('mousemove', this.onDocMouseMove);
        if (this.onEnd) {
            document.removeEventListener('touchend', this.onEnd);
            document.removeEventListener('mouseup', this.onEnd);
        }
        if (this.onWindowResize) window.removeEventListener('resize', this.onWindowResize);
    }
}
window.CustomScrollbar = CustomScrollbar;