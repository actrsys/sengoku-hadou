/**
 * tab_session.js
 * 同一オリジンの別タブで本編を開始した場合、先に遊んでいたタブの操作を終了する。
 * スロットのデータ形式や月次の進行状態は変更せず、通常のタイトル復帰を利用する。
 */
class TabSessionCoordinator {
    constructor(host = window) {
        this.host = host;
        this.key = 'sengoku-active-game-tab-v1';
        this.id = (host.crypto && typeof host.crypto.randomUUID === 'function')
            ? host.crypto.randomUUID()
            : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
        this.claimed = false;
        this.onLost = null;
        this.storage = null;
        try {
            // file:// / プライベートモード等でアクセス不可でも起動を妨げない。
            const storage = host.localStorage;
            if (storage) {
                storage.getItem(this.key);
                this.storage = storage;
            }
        } catch (_) {}
        if (typeof host.addEventListener === 'function') {
            host.addEventListener('storage', event => {
                if (event.key === this.key) {
                    this.checkOwnership();
                }
            });
            // バックグラウンド時にstorage通知が遅延した端末でも復帰時に再確認する。
            host.addEventListener('focus', () => this.checkOwnership());
        }
    }

    claim() {
        if (!this.storage) {
            this.claimed = true;
            return true;
        }
        try {
            this.storage.setItem(this.key, this.id);
            this.claimed = this.storage.getItem(this.key) === this.id;
        } catch (_) {
            // 保存領域へのアクセスが後から拒否された場合は従来の単タブ動作を維持する。
            this.storage = null;
            this.claimed = true;
        }
        return this.claimed;
    }

    isOwner() {
        if (!this.claimed) return false;
        if (!this.storage) return true;
        try { return this.storage.getItem(this.key) === this.id; }
        catch (_) { return false; }
    }

    checkOwnership() {
        if (!this.claimed || this.isOwner()) return;
        this.claimed = false;
        if (typeof this.onLost === 'function') this.onLost();
    }
}
window.TabSessionCoordinator = TabSessionCoordinator;
