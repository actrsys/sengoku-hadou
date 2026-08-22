/**
 * ui_bindings.js
 * index.html に固定配置されているボタンのイベント登録を一元管理する。
 * HTML は構造とIDだけを持ち、ゲーム処理の関数名を直接知らない。
 */
(function bindStaticUiEvents() {
    const bind = (id, handler) => {
        const element = document.getElementById(id);
        if (!element) return;
        element.addEventListener('click', handler);
    };

    const getGame = () => window.GameApp;
    const hide = id => {
        const element = document.getElementById(id);
        if (element) element.classList.add('hidden');
    };

    const initialize = () => {
        bind('start-btn', () => getGame()?.startNewGame());
        bind('continue-btn', () => getGame()?.continueGame());
        bind('load-btn', () => getGame()?.commandSystem?.executeSystemCommand('load'));
        bind('watch-start-btn', () => getGame()?.startWatchGame());
        bind('settings-btn', () => getGame()?.commandSystem?.executeSystemCommand('settings'));

        bind('scenario-close-btn', () => getGame()?.ui?.returnToTitle());
        bind('quantity-back-btn', () => hide('quantity-modal'));
        bind('result-close-btn', () => getGame()?.ui?.closeResultModal());
        bind('gunshi-back-btn', () => hide('gunshi-modal'));
        bind('saveload-close-btn', () => hide('saveload-modal'));
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initialize, { once: true });
    } else {
        initialize();
    }
})();
