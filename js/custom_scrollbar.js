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
        
        // ★横用のバー（新しく追加！）
        this.trackX = document.createElement('div');
        this.trackX.className = 'custom-scrollbar-track-x';
        this.thumbX = document.createElement('div');
        this.thumbX.className = 'custom-scrollbar-thumb-x';
        this.trackX.appendChild(this.thumbX);
        this.wrapper.appendChild(this.trackX);
        
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
        // --- 縦のバーの更新 ---
        const listHeight = this.list.clientHeight;
        const scrollHeight = this.list.scrollHeight;
        
        this.trackY.style.display = 'block';
        if (scrollHeight <= listHeight) {
            this.thumbY.style.height = '100%';
            this.thumbY.style.top = '0px';
            this.thumbY.style.pointerEvents = 'none';
            this.trackY.style.display = 'none'; // 必要ない時は軌道も隠します
        } else {
            this.thumbY.style.pointerEvents = 'auto';
            let thumbHeight = Math.max(40, (listHeight / scrollHeight) * listHeight);
            this.thumbY.style.height = `${thumbHeight}px`;
            
            const maxScrollTop = scrollHeight - listHeight;
            const maxThumbTop = listHeight - thumbHeight;
            const scrollRatioY = this.list.scrollTop / maxScrollTop;
            this.thumbY.style.top = `${scrollRatioY * maxThumbTop}px`;
        }

        // --- ★横のバーの更新（新しく追加！） ---
        const listWidth = this.list.clientWidth;
        const scrollWidth = this.list.scrollWidth;

        this.trackX.style.display = 'block';
        if (scrollWidth <= listWidth) {
            this.thumbX.style.width = '100%';
            this.thumbX.style.left = '0px';
            this.thumbX.style.pointerEvents = 'none';
            this.trackX.style.display = 'none'; // 必要ない時は軌道も隠します
        } else {
            this.thumbX.style.pointerEvents = 'auto';
            let thumbWidth = Math.max(40, (listWidth / scrollWidth) * listWidth);
            this.thumbX.style.width = `${thumbWidth}px`;
            
            const maxScrollLeft = scrollWidth - listWidth;
            // 縦のバーを避けるため、実際の横軌道の長さを測ります
            const actualTrackWidth = this.trackX.clientWidth || listWidth;
            const maxThumbLeft = actualTrackWidth - thumbWidth;
            
            const scrollRatioX = this.list.scrollLeft / maxScrollLeft;
            this.thumbX.style.left = `${scrollRatioX * maxThumbLeft}px`;
        }
    }
    
    initEvents() {
        // リスト本体のタッチ操作（軸固定用）
        this.list.addEventListener('touchstart', (e) => {
            if (e.touches.length > 1) return; // 指２本以上の時は無視します
            this.lockAxis = null;
            this.startY = e.touches[0].clientY;
            this.startX = e.touches[0].clientX;
            this.startScrollTop = this.list.scrollTop;
            this.startScrollLeft = this.list.scrollLeft;
        }, { passive: true });

        this.list.addEventListener('touchmove', (e) => {
            if (e.touches.length > 1) return;
            const currentY = e.touches[0].clientY;
            const currentX = e.touches[0].clientX;
            const diffY = Math.abs(currentY - this.startY);
            const diffX = Math.abs(currentX - this.startX);

            if (!this.lockAxis) {
                if (diffX > 5 || diffY > 5) {
                    this.lockAxis = diffX > diffY ? 'x' : 'y';
                }
            }

            // 横に動かしている時は縦の動きを打ち消し、縦の時は横を打ち消します
            if (this.lockAxis === 'x') {
                this.list.scrollTop = this.startScrollTop;
            } else if (this.lockAxis === 'y') {
                this.list.scrollLeft = this.startScrollLeft;
            }
        }, { passive: false });

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
            const thumbHeight = parseFloat(this.thumbY.style.height);
            
            const maxScrollTop = scrollHeight - listHeight;
            const maxThumbTop = listHeight - thumbHeight;
            
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
    }
}

// ★ここが大事！これを書き忘れてごめんね！
window.CustomScrollbar = CustomScrollbar;