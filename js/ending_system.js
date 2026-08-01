/**
 * ending_system.js
 * ゲームクリア（天下統一）やゲームオーバー（滅亡）を一元管理するシステムです。
 */

class EndingSystem {
    constructor(game) {
        this.game = game;
    }

    // ★ゲームクリア（天下統一）の処理です
    async processGameClear() {
        if (this.game.ui) {
            // クリアのメッセージを出して、タイトル画面に戻します
            await this.game.ui.showDialogAsync("天下統一！", false, 0);
            this.game.ui.returnToTitle();
        }
    }

    // ★ゲームオーバー（自勢力滅亡）の処理です
    // メッセージの内容（reasonMsg）は、呼び出す時に自由に変更できるようにしています
    async processGameOver(reasonMsg = "我が大名家は滅亡しました……") {
        if (this.game.ui) {
            // 滅亡のメッセージを出して、タイトル画面に戻します
            await this.game.ui.showDialogAsync(reasonMsg, false, 0);
            this.game.ui.returnToTitle();
        }
    }

    // ★毎月の終わりなどに呼ばれる、クリア・ゲームオーバーの総合チェックです
    async checkEnding() {
        // 生き残っている大名家を集めます
        const aliveClans = this.game.clans.filter(c => c.id !== 0 && !c.isDestroyed);
        // プレイヤーがその中にいるか確認します
        const playerAlive = aliveClans.some(c => c.id === this.game.playerClanId);
        
        // 残っているのが1家だけで、それがプレイヤーなら「天下統一」です！
        if (aliveClans.length === 1 && playerAlive) {
            await this.processGameClear();
            return true; // エンディングを迎えたという合図を返します
        } 
        // 観戦モードではなく、かつプレイヤーが生き残っていなければ「滅亡」です…
        else if (!this.game.isWatchMode && !playerAlive) {
            await this.processGameOver("我が大名家は滅亡しました……");
            return true; // エンディングを迎えたという合図を返します
        }
        
        // どちらでもなければ、まだゲームは続きます
        return false;
    }
}