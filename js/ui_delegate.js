/**
 * ui_delegate.js
 * 城の委任設定リストを管理する専用のファイルです
 */
class UIDelegateManager {
    constructor(ui, game) {
        this.ui = ui;
        this.game = game;
    }

    // 新しい委任モーダルを開く魔法です
    showModal() {
        const modal = document.getElementById('delegate-modal');
        if (!modal) return;
        modal.classList.remove('hidden');
        this.renderList();
    }

    // 委任モーダルを閉じる魔法です
    closeModal() {
        const modal = document.getElementById('delegate-modal');
        if (modal) modal.classList.add('hidden');
        if (window.AudioManager) window.AudioManager.playSE('cancel.ogg');
    }

    // リストの中身を作る魔法です
    renderList() {
        const listContainer = document.getElementById('delegate-list');
        if (!listContainer) return;

        const daimyo = this.game.bushos.find(b => b.clan === this.game.playerClanId && b.isDaimyo);
        const daimyoCastleId = daimyo ? daimyo.castleId : -1;
        const myCastles = this.game.castles.filter(c => c.ownerClan === this.game.playerClanId && c.id !== daimyoCastleId);

        let html = `
            <div class="delegate-bulk-row">
                <span class="col-castle-name"></span>
                <span class="col-castellan"></span>
                <span class="col-attack"><button class="delegate-header-btn" onclick="window.GameApp.ui.delegate.toggleAllAttack()">一括</button></span>
                <span class="col-move"><button class="delegate-header-btn" onclick="window.GameApp.ui.delegate.toggleAllMove()">一括</button></span>
                <span class="col-status"><button class="delegate-header-btn" onclick="window.GameApp.ui.delegate.toggleAllStatus()">一括</button></span>
            </div>
            <div class="list-header delegate-list-header">
                <span class="col-castle-name">拠点名</span>
                <span class="col-castellan">城主</span>
                <span class="col-attack">城攻め</span>
                <span class="col-move">武将移動</span>
                <span class="col-status">状態</span>
            </div>
        `;

        myCastles.forEach(c => {
            const hasCastellan = c.castellanId && c.castellanId > 0;
            const castellan = this.game.getBusho(c.castellanId);
            const castellanName = castellan ? castellan.name : "なし";

            let statusBtnClass = c.isDelegated ? "btn-status-on" : "btn-status-off";
            let statusText = c.isDelegated ? "委任" : "直轄";
            let statusDisabled = (!hasCastellan && !c.isDelegated) ? "disabled" : "";

            let attackBtnClass = c.allowAttack ? "btn-status-on" : "btn-status-off";
            let attackText = c.allowAttack ? "許可" : "不可";
            let attackDisabled = !c.isDelegated ? "disabled" : "";

            let moveBtnClass = c.allowMove ? "btn-status-on" : "btn-status-off";
            let moveText = c.allowMove ? "許可" : "不可";
            let moveDisabled = !c.isDelegated ? "disabled" : "";

            html += `
                <div class="select-item delegate-list-item" style="cursor:default;">
                    <span class="col-castle-name">${c.name}</span>
                    <span class="col-castellan">${castellanName}</span>
                    <span class="col-attack">
                        <button class="delegate-inline-btn ${attackBtnClass}" onclick="window.GameApp.ui.delegate.toggleAttack(${c.id})" ${attackDisabled}>${attackText}</button>
                    </span>
                    <span class="col-move">
                        <button class="delegate-inline-btn ${moveBtnClass}" onclick="window.GameApp.ui.delegate.toggleMove(${c.id})" ${moveDisabled}>${moveText}</button>
                    </span>
                    <span class="col-status">
                        <button class="delegate-inline-btn ${statusBtnClass}" onclick="window.GameApp.ui.delegate.toggleStatus(${c.id})" ${statusDisabled}>${statusText}</button>
                    </span>
                </div>
            `;
        });

        for (let i = myCastles.length; i < 7; i++) {
            html += `
                <div class="select-item delegate-list-item empty-row" style="cursor:default;">
                    <span class="col-castle-name"></span>
                    <span class="col-castellan"></span>
                    <span class="col-attack"></span>
                    <span class="col-move"></span>
                    <span class="col-status"></span>
                </div>
            `;
        }

        listContainer.innerHTML = `<div class="list-inner-wrapper" style="width: 100%; min-width: 100%;">${html}</div>`;
    }

    toggleAllStatus() {
        const daimyo = this.game.bushos.find(b => b.clan === this.game.playerClanId && b.isDaimyo);
        const daimyoCastleId = daimyo ? daimyo.castleId : -1;
        const myCastles = this.game.castles.filter(c => c.ownerClan === this.game.playerClanId && c.id !== daimyoCastleId);
        
        const hasDirectWithCastellan = myCastles.some(c => !c.isDelegated && c.castellanId && c.castellanId > 0);
        
        if (window.AudioManager) window.AudioManager.playSE('choice.ogg');
        
        const newState = hasDirectWithCastellan;
        
        myCastles.forEach(c => {
            const hasCastellan = c.castellanId && c.castellanId > 0;
            if (hasCastellan) {
                c.isDelegated = newState;
            } else if (!newState) {
                c.isDelegated = false;
            }
        });
        this.renderList();
    }

    toggleAllAttack() {
        const daimyo = this.game.bushos.find(b => b.clan === this.game.playerClanId && b.isDaimyo);
        const daimyoCastleId = daimyo ? daimyo.castleId : -1;
        const delegatedCastles = this.game.castles.filter(c => c.ownerClan === this.game.playerClanId && c.id !== daimyoCastleId && c.isDelegated);
        
        if (delegatedCastles.length === 0) return;

        const hasDeny = delegatedCastles.some(c => !c.allowAttack);
        
        if (window.AudioManager) window.AudioManager.playSE('choice.ogg');
        
        const newState = hasDeny;
        delegatedCastles.forEach(c => c.allowAttack = newState);
        this.renderList();
    }

    toggleAllMove() {
        const daimyo = this.game.bushos.find(b => b.clan === this.game.playerClanId && b.isDaimyo);
        const daimyoCastleId = daimyo ? daimyo.castleId : -1;
        const delegatedCastles = this.game.castles.filter(c => c.ownerClan === this.game.playerClanId && c.id !== daimyoCastleId && c.isDelegated);
        
        if (delegatedCastles.length === 0) return;

        const hasDeny = delegatedCastles.some(c => !c.allowMove);
        
        if (window.AudioManager) window.AudioManager.playSE('choice.ogg');
        
        const newState = hasDeny;
        delegatedCastles.forEach(c => c.allowMove = newState);
        this.renderList();
    }

    toggleStatus(castleId) {
        const castle = this.game.castles.find(c => c.id === castleId);
        if (!castle) return;
        const hasCastellan = castle.castellanId && castle.castellanId > 0;
        
        if (!castle.isDelegated && !hasCastellan) {
            this.ui.showDialog("城主がいないため委任できません。", false);
            return;
        }
        if (window.AudioManager) window.AudioManager.playSE('choice.ogg');
        castle.isDelegated = !castle.isDelegated;
        this.renderList();
    }

    toggleAttack(castleId) {
        const castle = this.game.castles.find(c => c.id === castleId);
        if (!castle || !castle.isDelegated) return;
        if (window.AudioManager) window.AudioManager.playSE('choice.ogg');
        castle.allowAttack = !castle.allowAttack;
        this.renderList();
    }

    toggleMove(castleId) {
        const castle = this.game.castles.find(c => c.id === castleId);
        if (!castle || !castle.isDelegated) return;
        if (window.AudioManager) window.AudioManager.playSE('choice.ogg');
        castle.allowMove = !castle.allowMove;
        this.renderList();
    }
}