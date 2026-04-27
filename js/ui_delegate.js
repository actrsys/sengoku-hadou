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
        // 大名のいるお城以外をリストアップします
        const myCastles = this.game.castles.filter(c => c.ownerClan === this.game.playerClanId && c.id !== daimyoCastleId);

        // 全部委任されているかチェックします
        const isAllDelegated = myCastles.length > 0 && myCastles.every(c => c.isDelegated);
        const toggleAllBtn = document.getElementById('btn-toggle-all-delegate');
        
        if (toggleAllBtn) {
            toggleAllBtn.className = `btn-secondary btn-small ${isAllDelegated ? "btn-toggle-delegated" : "btn-toggle-direct"}`;
            toggleAllBtn.onclick = () => {
                if (window.AudioManager) window.AudioManager.playSE('choice.ogg');
                const newState = !isAllDelegated;
                myCastles.forEach(c => {
                    const hasCastellan = c.castellanId && c.castellanId > 0;
                    if (hasCastellan) {
                        c.isDelegated = newState; // 城主がいれば切り替え
                    } else if (!newState) {
                        c.isDelegated = false; // 城主がいない城でも「直轄」に戻すことは許可します
                    }
                });
                this.renderList();
            };
        }

        let html = `
            <div class="list-header delegate-list-header">
                <span class="col-castle-name" style="justify-content:flex-start; padding-left:5px;">拠点名</span>
                <span class="col-castellan">城主</span>
                <span class="col-attack">城攻</span>
                <span class="col-move">武将移動</span>
                <span class="col-status">状態</span>
            </div>
        `;

        if (myCastles.length === 0) {
            html += '<div style="padding: 10px; text-align: center;">委任できる城がありません。</div>';
            listContainer.innerHTML = `<div class="list-inner-wrapper">${html}</div>`;
            return;
        }

        // 1つ1つのお城のボタンを作っていきます
        myCastles.forEach(c => {
            const hasCastellan = c.castellanId && c.castellanId > 0;
            const castellan = this.game.getBusho(c.castellanId);
            const castellanName = castellan ? castellan.name : "なし";

            // 状態ボタン
            let statusBtnClass = c.isDelegated ? "btn-status-delegated" : "btn-status-direct";
            let statusText = c.isDelegated ? "委任" : "直轄";
            let statusDisabled = (!hasCastellan && !c.isDelegated) ? "disabled" : "";

            // 城攻めボタン
            let attackBtnClass = c.allowAttack ? "btn-allow" : "btn-deny";
            let attackText = c.allowAttack ? "許可" : "不可";
            let attackDisabled = !c.isDelegated ? "disabled" : "";

            // 武将移動ボタン
            let moveBtnClass = c.allowMove ? "btn-allow" : "btn-deny";
            let moveText = c.allowMove ? "許可" : "不可";
            let moveDisabled = !c.isDelegated ? "disabled" : "";

            html += `
                <div class="select-item delegate-list-item" style="cursor:default;">
                    <span class="col-castle-name" style="font-weight:bold; justify-content:flex-start; padding-left:5px;">${c.name}</span>
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

        listContainer.innerHTML = `<div class="list-inner-wrapper" style="width: 100%; min-width: 100%;">${html}</div>`;
        if (this.ui.bushoScrollbar) {
            this.ui.bushoScrollbar.update();
        }
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