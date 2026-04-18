/**
 * custom_scrollbar.js
 * 軸固定スクロール機能付き（縦・横対応版！）
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

        // ★横用のバー
        this.trackX = document.createElement('div');
        this.trackX.className = 'custom-scrollbar-track-x';
        this.thumbX = document.createElement('div');
        this.thumbX.className = 'custom-scrollbar-thumb-x';
        this.trackX.appendChild(this.thumbX);
        this.wrapper.appendChild(this.trackX);

        // ★横ボタン（左・右）
        this.btnLeft = document.createElement('div');
        this.btnLeft.className = 'custom-scrollbar-btn left';
        this.wrapper.appendChild(this.btnLeft);

        this.btnRight = document.createElement('div');
        this.btnRight.className = 'custom-scrollbar-btn right';
        this.wrapper.appendChild(this.btnRight);

        // ボタンのクリックイベント（１行分スクロール）
        this.btnUp.addEventListener('click', () => this.list.scrollBy({ top: -36, behavior: 'smooth' }));
        this.btnDown.addEventListener('click', () => this.list.scrollBy({ top: 36, behavior: 'smooth' }));
        this.btnLeft.addEventListener('click', () => this.list.scrollBy({ left: -60, behavior: 'smooth' }));
        this.btnRight.addEventListener('click', () => this.list.scrollBy({ left: 60, behavior: 'smooth' }));
        
        this.isDraggingY = false;
        this.isDraggingX = false;
        this.lockAxis = null;
        this.startY = 0;
        this.startX = 0;
        this.startScrollTop = 0;
        this.startScrollLeft = 0;
        
        this.initEvents();
    }
    
    update() {
        const listHeight = this.list.clientHeight;
        const scrollHeight = this.list.scrollHeight;
        const listWidth = this.list.clientWidth;
        const scrollWidth = this.list.scrollWidth;
        const scrollTop = this.list.scrollTop;
        const scrollLeft = this.list.scrollLeft;

        // --- 縦のバーの更新 ---
        const trackHeight = this.trackY.clientHeight || listHeight;
        if (scrollHeight <= listHeight) {
            // ★修正：スクロール不要な時は縦のバーとボタンを隠す魔法
            this.trackY.style.display = 'none';
            this.btnUp.style.display = 'none';
            this.btnDown.style.display = 'none';
            this.thumbY.style.pointerEvents = 'none';
        } else {
            // ★修正：スクロールが必要な時は表示する
            this.trackY.style.display = 'block';
            this.btnUp.style.display = 'flex';
            this.btnDown.style.display = 'flex';
            this.thumbY.style.pointerEvents = 'auto';
            let thumbHeight = Math.max(40, (listHeight / scrollHeight) * trackHeight);
            this.thumbY.style.height = `${thumbHeight}px`;
            const maxScrollTop = scrollHeight - listHeight;
            const maxThumbTop = trackHeight - thumbHeight;
            const scrollRatioY = scrollTop / maxScrollTop;
            this.thumbY.style.top = `${scrollRatioY * maxThumbTop}px`;
        }

        // --- 横のバーの更新 ---
        const actualTrackWidth = this.trackX.clientWidth || listWidth;
        if (scrollWidth <= listWidth) {
            // ★修正：スクロール不要な時は横のバーとボタンを隠す魔法
            this.trackX.style.display = 'none';
            this.btnLeft.style.display = 'none';
            this.btnRight.style.display = 'none';
        } else {
            // ★修正：スクロールが必要な時は表示する
            this.trackX.style.display = 'block';
            this.btnLeft.style.display = 'flex';
            this.btnRight.style.display = 'flex';
            this.thumbX.style.pointerEvents = 'auto';
            let thumbWidth = Math.max(40, (listWidth / scrollWidth) * actualTrackWidth);
            this.thumbX.style.width = `${thumbWidth}px`;
            const maxScrollLeft = scrollWidth - listWidth;
            const maxThumbLeft = actualTrackWidth - thumbWidth;
            const scrollRatioX = scrollLeft / maxScrollLeft;
            this.thumbX.style.left = `${scrollRatioX * maxThumbLeft}px`;
        }

        // --- 右下の隙間埋めブロックの更新 ---
        // ★追加：縦と横、両方のスクロールバーが出ている時だけ表示します
        if (scrollHeight > listHeight && scrollWidth > listWidth) {
            this.wrapper.classList.add('has-custom-scrollbar');
        } else {
            this.wrapper.classList.remove('has-custom-scrollbar');
        }

        // --- ボタンの色（有効・無効）の更新 ---
        this.btnUp.classList.toggle('disabled', scrollTop <= 0);
        this.btnDown.classList.toggle('disabled', scrollTop + listHeight >= scrollHeight - 1);
        this.btnLeft.classList.toggle('disabled', scrollLeft <= 0);
        this.btnRight.classList.toggle('disabled', scrollLeft + listWidth >= scrollWidth - 1);
    }
    
    initEvents() {
        // リスト本体のタッチ操作（軸固定用）
        this.list.addEventListener('touchstart', (e) => {
            if (e.touches.length > 1) return; // 指２本以上の時は無視します
            this.lockAxis = null;
            this.startY = e.touches[0].clientY;
            this.startX = e.touches[0].clientX;
            // 一度スクロール制限を解除しておきます
            this.list.style.overflowX = 'auto';
            this.list.style.overflowY = 'scroll';
        }, { passive: true });

        this.list.addEventListener('touchmove', (e) => {
            if (e.touches.length > 1) return;
            
            // すでに動かす方向（軸）が決まっている場合は何もしません
            if (this.lockAxis) return;

            const currentY = e.touches[0].clientY;
            const currentX = e.touches[0].clientX;
            const diffY = Math.abs(currentY - this.startY);
            const diffX = Math.abs(currentX - this.startX);

            // 指が5ピクセル以上動いた時に、どっちに動かしたいのか判定します
            if (diffX > 5 || diffY > 5) {
                this.lockAxis = diffX > diffY ? 'x' : 'y';
                
                // 動かさない方向のスクロールを一時的に禁止する魔法です！
                if (this.lockAxis === 'x') {
                    this.list.style.overflowY = 'hidden';
                } else if (this.lockAxis === 'y') {
                    this.list.style.overflowX = 'hidden';
                }
            }
        }, { passive: true });

        // 指を離した時や、画面外に出た時にスクロール制限を元に戻します
        const onListTouchEnd = () => {
            this.lockAxis = null;
            this.list.style.overflowX = 'auto';
            this.list.style.overflowY = 'scroll';
        };
        this.list.addEventListener('touchend', onListTouchEnd, { passive: true });
        this.list.addEventListener('touchcancel', onListTouchEnd, { passive: true });

        this.list.addEventListener('scroll', () => {
            if (!this.isDraggingY && !this.isDraggingX) this.update();
        });
        
        // 縦つまみのドラッグ操作
        const onStartY = (e) => {
            this.isDraggingY = true;
            this.thumbY.classList.add('dragging');
            this.startY = e.type.includes('touch') ? e.touches[0].clientY : e.clientY;
            this.startScrollTop = this.list.scrollTop;
            if (e.cancelable) e.preventDefault();
        };
        const onMoveY = (e) => {
            if (!this.isDraggingY) return;
            const currentY = e.type.includes('touch') ? e.touches[0].clientY : e.clientY;
            const deltaY = currentY - this.startY;
            
            const listHeight = this.list.clientHeight;
            const scrollHeight = this.list.scrollHeight;
            const trackHeight = this.trackY.clientHeight || listHeight; // ★ここもトラックの高さにする魔法！
            const thumbHeight = parseFloat(this.thumbY.style.height);
            
            const maxScrollTop = scrollHeight - listHeight;
            const maxThumbTop = trackHeight - thumbHeight; // ★トラックの高さを使います
            
            const scrollRatio = deltaY / maxThumbTop;
            this.list.scrollTop = this.startScrollTop + (scrollRatio * maxScrollTop);
            
            this.update();
            if (e.cancelable) e.preventDefault();
        };

        // ★横つまみのドラッグ操作（新しく追加！）
        const onStartX = (e) => {
            this.isDraggingX = true;
            this.thumbX.classList.add('dragging');
            this.startX = e.type.includes('touch') ? e.touches[0].clientX : e.clientX;
            this.startScrollLeft = this.list.scrollLeft;
            if (e.cancelable) e.preventDefault();
        };
        const onMoveX = (e) => {
            if (!this.isDraggingX) return;
            const currentX = e.type.includes('touch') ? e.touches[0].clientX : e.clientX;
            const deltaX = currentX - this.startX;
            
            const listWidth = this.list.clientWidth;
            const scrollWidth = this.list.scrollWidth;
            const thumbWidth = parseFloat(this.thumbX.style.width);
            
            const maxScrollLeft = scrollWidth - listWidth;
            const actualTrackWidth = this.trackX.clientWidth || listWidth;
            const maxThumbLeft = actualTrackWidth - thumbWidth;
            
            const scrollRatio = deltaX / maxThumbLeft;
            this.list.scrollLeft = this.startScrollLeft + (scrollRatio * maxScrollLeft);
            
            this.update();
            if (e.cancelable) e.preventDefault();
        };
        
        const onEnd = () => {
            this.isDraggingY = false;
            this.isDraggingX = false;
            this.thumbY.classList.remove('dragging');
            this.thumbX.classList.remove('dragging');
        };
        
        this.thumbY.addEventListener('touchstart', onStartY, { passive: false });
        this.thumbY.addEventListener('mousedown', onStartY);

        this.thumbX.addEventListener('touchstart', onStartX, { passive: false });
        this.thumbX.addEventListener('mousedown', onStartX);

        document.addEventListener('touchmove', (e) => {
            if (this.isDraggingY) onMoveY(e);
            if (this.isDraggingX) onMoveX(e);
        }, { passive: false });
        
        document.addEventListener('mousemove', (e) => {
            if (this.isDraggingY) onMoveY(e);
            if (this.isDraggingX) onMoveX(e);
        });

        document.addEventListener('touchend', onEnd);
        document.addEventListener('mouseup', onEnd);
        
        window.addEventListener('resize', () => this.update());

        // ★追加：外枠に「スクロールバーがあるよ」という目印のシールを貼ります
        this.wrapper.classList.add('has-custom-scrollbar');
    }

    // ★追加：スクロールバーの部品を画面から綺麗にお片付けする魔法です
    destroy() {
        if (this.trackY) this.trackY.remove();
        if (this.btnUp) this.btnUp.remove();
        if (this.btnDown) this.btnDown.remove();
        if (this.trackX) this.trackX.remove();
        if (this.btnLeft) this.btnLeft.remove();
        if (this.btnRight) this.btnRight.remove();
        
        this.list.classList.remove('hide-native-scroll');
        
        if (this.wrapper) {
            // ★目印のシールも剥がして、右下の四角い枠（隙間埋め）も消します
            this.wrapper.classList.remove('has-custom-scrollbar');
        }
    }
}
window.CustomScrollbar = CustomScrollbar;