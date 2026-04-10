/**
 * custom_scrollbar.js
 * スマホでも確実につまめて動かせる、自作のスクロールバーです！
 */
class CustomScrollbar {
    constructor(listElement) {
        this.list = listElement;
        this.wrapper = this.list.parentElement;
        
        this.track = document.createElement('div');
        this.track.className = 'custom-scrollbar-track';
        
        this.thumb = document.createElement('div');
        this.thumb.className = 'custom-scrollbar-thumb';
        
        this.track.appendChild(this.thumb);
        this.wrapper.appendChild(this.track);
        
        this.isDragging = false;
        this.startY = 0;
        this.startScrollTop = 0;
        
        this.initEvents();
    }
    
    update() {
        const listHeight = this.list.clientHeight;
        const scrollHeight = this.list.scrollHeight;
        
        if (scrollHeight <= listHeight) {
            this.track.style.display = 'none';
            return;
        }
        
        this.track.style.display = 'block';
        
        let thumbHeight = Math.max(40, (listHeight / scrollHeight) * listHeight);
        this.thumb.style.height = `${thumbHeight}px`;
        
        const maxScrollTop = scrollHeight - listHeight;
        const maxThumbTop = listHeight - thumbHeight;
        const scrollRatio = this.list.scrollTop / maxScrollTop;
        
        this.thumb.style.top = `${scrollRatio * maxThumbTop}px`;
    }
    
    initEvents() {
        this.list.addEventListener('scroll', () => {
            if (!this.isDragging) {
                this.update();
            }
        });
        
        const onStart = (e) => {
            this.isDragging = true;
            this.thumb.classList.add('dragging');
            this.startY = e.type.includes('touch') ? e.touches[0].clientY : e.clientY;
            this.startScrollTop = this.list.scrollTop;
            e.preventDefault();
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