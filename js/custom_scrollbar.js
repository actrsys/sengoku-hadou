/**
 * custom_scrollbar.js
 * 軸固定スクロール機能付き
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
        
        this.track = document.createElement('div');
        this.track.className = 'custom-scrollbar-track';
        
        this.thumb = document.createElement('div');
        this.thumb.className = 'custom-scrollbar-thumb';
        
        this.track.appendChild(this.thumb);
        this.wrapper.appendChild(this.track);
        
        this.isDragging = false;
        this.lockAxis = null; // 'x' か 'y' を固定するための変数
        this.startY = 0;
        this.startX = 0;
        this.startScrollTop = 0;
        this.startScrollLeft = 0;
        
        this.initEvents();
    }
    
    update() {
        const listHeight = this.list.clientHeight;
        const scrollHeight = this.list.scrollHeight;
        
        this.track.style.display = 'block';
        
        if (scrollHeight <= listHeight) {
            this.thumb.style.height = '100%';
            this.thumb.style.top = '0px';
            this.thumb.style.pointerEvents = 'none';
            return;
        }
        
        this.thumb.style.pointerEvents = 'auto';
        
        let thumbHeight = Math.max(40, (listHeight / scrollHeight) * listHeight);
        this.thumb.style.height = `${thumbHeight}px`;
        
        const maxScrollTop = scrollHeight - listHeight;
        const maxThumbTop = listHeight - thumbHeight;
        const scrollRatio = this.list.scrollTop / maxScrollTop;
        
        this.thumb.style.top = `${scrollRatio * maxThumbTop}px`;
    }
    
    initEvents() {
        // リスト本体のタッチ操作（軸固定用）
        this.list.addEventListener('touchstart', (e) => {
            this.lockAxis = null;
            this.startY = e.touches[0].clientY;
            this.startX = e.touches[0].clientX;
            this.startScrollTop = this.list.scrollTop;
            this.startScrollLeft = this.list.scrollLeft;
        }, { passive: true });

        this.list.addEventListener('touchmove', (e) => {
            const currentY = e.touches[0].clientY;
            const currentX = e.touches[0].clientX;
            const diffY = Math.abs(currentY - this.startY);
            const diffX = Math.abs(currentX - this.startX);

            // 最初に動いた方向に軸を固定（閾値5px）
            if (!this.lockAxis) {
                if (diffX > 5 || diffY > 5) {
                    this.lockAxis = diffX > diffY ? 'x' : 'y';
                }
            }

            // 固定された軸以外への移動を打ち消す
            if (this.lockAxis === 'x') {
                this.list.scrollTop = this.startScrollTop;
            } else if (this.lockAxis === 'y') {
                this.list.scrollLeft = this.startScrollLeft;
            }
        }, { passive: false });

        this.list.addEventListener('scroll', () => {
            if (!this.isDragging) this.update();
        });
        
        // つまみのドラッグ操作
        const onStart = (e) => {
            this.isDragging = true;
            this.thumb.classList.add('dragging');
            this.startY = e.type.includes('touch') ? e.touches[0].clientY : e.clientY;
            this.startScrollTop = this.list.scrollTop;
            if (e.cancelable) e.preventDefault();
        };
        
        const onMove = (e) => {
            if (!this.isDragging) return;
            const currentY = e.type.includes('touch') ? e.touches[0].clientY : e.clientY;
            const deltaY = currentY - this.startY;
            
            const listHeight = this.list.clientHeight;
            const scrollHeight = this.list.scrollHeight;
            const thumbHeight = parseFloat(this.thumb.style.height);
            
            const maxScrollTop = scrollHeight - listHeight;
            const maxThumbTop = listHeight - thumbHeight;
            
            const scrollRatio = deltaY / maxThumbTop;
            this.list.scrollTop = this.startScrollTop + (scrollRatio * maxScrollTop);
            
            this.update();
            if (e.cancelable) e.preventDefault();
        };
        
        const onEnd = () => {
            this.isDragging = false;
            this.thumb.classList.remove('dragging');
        };
        
        this.thumb.addEventListener('touchstart', onStart, { passive: false });
        this.thumb.addEventListener('mousedown', onStart);
        document.addEventListener('touchmove', onMove, { passive: false });
        document.addEventListener('mousemove', onMove);
        document.addEventListener('touchend', onEnd);
        document.addEventListener('mouseup', onEnd);
        window.addEventListener('resize', () => this.update());
    }
}
window.CustomScrollbar = CustomScrollbar;