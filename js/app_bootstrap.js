/**
 * app_bootstrap.js
 * ブラウザ上でゲームを起動するための「入口」を一元管理する。
 *
 * 担当:
 * - Webフォントの先行ロードと初期表示制御
 * - 固定HTMLボタンのイベント登録
 * - game-screen のPC/スマホ表示領域調整
 * - ページ離脱時の警告
 *
 * ゲームルールや画面固有の描画はここに置かない。
 */
(function bootstrapApplication() {
    const FONT_TIMEOUT_MS = 6000;

    function initializeFonts() {
        const root = document.documentElement;
        let revealed = false;

        const reveal = (reason) => {
            if (revealed) return;
            revealed = true;
            root.classList.remove('fonts-loading');
            root.classList.add(reason === 'loaded' ? 'fonts-ready' : 'fonts-fallback');
        };

        const failSafeTimer = setTimeout(() => {
            console.warn('【FontLoader】フォント待機がタイムアウトしたため、画面表示を優先します。');
            reveal('timeout');
        }, FONT_TIMEOUT_MS);

        if (!document.fonts || typeof document.fonts.load !== 'function') {
            clearTimeout(failSafeTimer);
            reveal('unsupported');
            window.__gameFontLoadPromise = Promise.resolve(false);
            return;
        }

        const requests = [
            ['400 16px "abashiri-mincho"', '戦国覇道徳川家康今川織田武田上杉一二三四五六七八九〇'],
            ['700 16px "abashiri-mincho"', '戦国覇道徳川家康今川織田武田上杉一二三四五六七八九〇'],
            ['400 16px "FudeGoshirae"', '戦国覇道決定取消攻撃内政外交軍団一二三四五六七八九〇'],
            ['700 16px "FudeGoshirae"', '戦国覇道決定取消攻撃内政外交軍団一二三四五六七八九〇']
        ];

        window.__gameFontLoadPromise = Promise.all(
            requests.map(([font, text]) => document.fonts.load(font, text))
        ).then(async (results) => {
            const loaded = results.every(list => Array.isArray(list) && list.length > 0);
            if (!loaded) {
                throw new Error('指定したWebフォントに一致するFontFaceが見つかりませんでした。');
            }
            await document.fonts.ready;
            clearTimeout(failSafeTimer);
            reveal('loaded');
            console.info('【FontLoader】Webフォント2書体の明示ロードが完了しました。');
            return true;
        }).catch((err) => {
            clearTimeout(failSafeTimer);
            console.warn('【FontLoader】Webフォントの読み込みに失敗しました。フォールバックで表示します。', err);
            reveal('error');
            return false;
        });
    }

    function renderTitleVersion() {
        const element = document.getElementById('title-version');
        if (!element) return;

        const version = window.GameConfig?.Meta?.Version;
        if (!version) {
            element.textContent = '';
            element.classList.add('hidden');
            return;
        }

        element.textContent = `ver. ${version}`;
        element.classList.remove('hidden');
    }

    function bindStaticUiEvents() {
        const bind = (id, handler) => {
            const element = document.getElementById(id);
            if (element) element.addEventListener('click', handler);
        };
        const getGame = () => window.GameApp;

        bind('start-btn', () => getGame()?.startNewGame());
        bind('continue-btn', () => getGame()?.continueGame());
        bind('load-btn', () => getGame()?.commandSystem?.executeSystemCommand('load'));
        bind('watch-start-btn', () => getGame()?.startWatchGame());
        bind('guide-title-btn', () => getGame()?.commandSystem?.executeSystemCommand('guide'));
        bind('settings-btn', () => getGame()?.commandSystem?.executeSystemCommand('settings'));
        bind('scenario-close-btn', () => getGame()?.ui?.returnToTitle());
        bind('result-close-btn', () => getGame()?.ui?.closeResultModal());
        bind('saveload-close-btn', () => getGame()?.ui?.saveLoadView?.close());
    }

    function resizeGameScreen() {
        const screen = document.getElementById('game-screen');
        if (!screen) return;

        const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
        const viewport = window.visualViewport || null;
        const dpr = Math.max(1, window.devicePixelRatio || 1);
        const snapPhysicalPixel = value => Math.round(value * dpr) / dpr;
        const onePhysicalPixel = 1 / dpr;
        const windowW = viewport ? viewport.width : window.innerWidth;
        const windowH = viewport ? viewport.height : window.innerHeight;
        const viewportLeft = viewport ? viewport.offsetLeft : 0;
        const viewportTop = viewport ? viewport.offsetTop : 0;

        screen.style.setProperty('--screen-edge-bleed', `${onePhysicalPixel}px`);

        const applyScreenGeometry = (canvasW, canvasH, scale) => {
            const scaledW = canvasW * scale;
            const scaledH = canvasH * scale;
            const left = snapPhysicalPixel(viewportLeft + (windowW - scaledW) / 2);
            const top = snapPhysicalPixel(viewportTop + (windowH - scaledH) / 2);

            screen.style.width = `${canvasW}px`;
            screen.style.height = `${canvasH}px`;
            screen.style.position = 'absolute';
            screen.style.left = `${left}px`;
            screen.style.top = `${top}px`;
            screen.style.transformOrigin = 'top left';
            screen.style.transform = Math.abs(scale - 1) < 0.000001 ? 'none' : `scale(${scale})`;
            screen.style.overflow = 'hidden';
            screen.style.backgroundColor = '#000000';
        };

        if (!isMobile) {
            document.body.classList.add('is-pc');
            const baseWidth = 1280;
            const baseHeight = 720;
            const scale = Math.min(windowW / baseWidth, windowH / baseHeight);
            applyScreenGeometry(baseWidth, baseHeight, scale);
        } else {
            document.body.classList.remove('is-pc');
            const targetRatio = 9 / 16;
            const currentRatio = windowW / windowH;
            let finalW;
            let finalH;

            if (currentRatio > targetRatio) {
                finalH = windowH;
                finalW = windowH * targetRatio;
            } else {
                finalW = windowW;
                finalH = windowW / targetRatio;
            }

            const minMobileWidth = 360;
            let canvasW = finalW;
            let canvasH = finalH;
            let scale = 1;

            if (finalW < minMobileWidth) {
                canvasW = minMobileWidth;
                canvasH = minMobileWidth / targetRatio;
                scale = finalW / minMobileWidth;
            }

            applyScreenGeometry(canvasW, canvasH, scale);
        }

        screen.style.zoom = '';
    }

    let resizeGameScreenFrame = null;
    function scheduleResizeGameScreen() {
        if (resizeGameScreenFrame !== null) return;
        resizeGameScreenFrame = requestAnimationFrame(() => {
            resizeGameScreenFrame = null;
            resizeGameScreen();
        });
    }

    function initializeDomBindings() {
        renderTitleVersion();
        bindStaticUiEvents();
        resizeGameScreen();
    }

    initializeFonts();
    window.addEventListener('resize', scheduleResizeGameScreen, { passive: true });
    if (window.visualViewport) {
        window.visualViewport.addEventListener('resize', scheduleResizeGameScreen, { passive: true });
    }
    window.addEventListener('DOMContentLoaded', initializeDomBindings, { once: true });
    window.addEventListener('beforeunload', (event) => {
        event.preventDefault();
        event.returnValue = '';
    });
})();
