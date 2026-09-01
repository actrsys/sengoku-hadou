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
    const MOBILE_TRANSITION_CHECKPOINT_KEY = 'sengoku_mobile_transition_checkpoint_v1';

    function resolveEarlyMobileLowMemoryMode() {
        const nav = window.navigator || {};
        const ua = String(nav.userAgent || '');
        const touch = Number(nav.maxTouchPoints || 0) > 0 || /iPhone|iPad|iPod|Android|Mobile/i.test(ua);
        if (!touch) return false;

        const displayMode = window.UserSettings ? window.UserSettings.displayMode : 'auto';
        if (displayMode === 'light') return true;
        if (displayMode === 'normal') return false;

        // 通常スマホまで安全モードへ巻き込まない。明確に小メモリ、または
        // 375x667級までの旧iPhone画面クラスだけを対象にする。
        // iOSはdeviceMemoryを公開しないうえ、同じ小型筐体へ新しいOSが入ることがあるため、
        // 小型iPhoneだけはOS世代で安全モードを解除しない。
        const screenObj = window.screen || {};
        const width = Number(screenObj.width || window.innerWidth || 0);
        const height = Number(screenObj.height || window.innerHeight || 0);
        const shortEdge = (width > 0 && height > 0) ? Math.min(width, height) : 0;
        const longEdge = (width > 0 && height > 0) ? Math.max(width, height) : 0;
        const deviceMemory = Number(nav.deviceMemory || 0);
        const hardwareConcurrency = Number(nav.hardwareConcurrency || 0);

        if (deviceMemory > 0 && deviceMemory <= 2) return true;

        const isIPhoneLike = /iPhone|iPod/i.test(ua);
        if (isIPhoneLike && shortEdge > 0 && longEdge > 0
            && shortEdge <= 390 && longEdge <= 700) {
            return true;
        }

        // AndroidはdeviceMemory非対応の古いWebViewだけ補助判定する。現行の大画面端末は対象外。
        if (/Android/i.test(ua) && !(deviceMemory > 0)
            && hardwareConcurrency > 0 && hardwareConcurrency <= 4
            && shortEdge > 0 && longEdge > 0
            && shortEdge <= 360 && longEdge <= 640) {
            return true;
        }
        return false;
    }

    const displayModePreference = window.UserSettings ? window.UserSettings.displayMode : 'auto';
    const earlyMobileLowMemoryMode = resolveEarlyMobileLowMemoryMode();
    window.__displayModePreference = displayModePreference;
    window.__mobileLowMemoryModeSource = earlyMobileLowMemoryMode ? (displayModePreference === 'light' ? 'manual' : 'auto') : 'normal';
    window.__mobileLowMemoryMode = earlyMobileLowMemoryMode;
    if (earlyMobileLowMemoryMode) {
        document.documentElement.classList.add('mobile-low-memory');
    } else if (document && typeof document.createElement === 'function' && document.head) {
        // 通常端末だけ従来の網走明朝preloadを維持する。低メモリ端末はfont fetch自体を始めない。
        const fontPreload = document.createElement('link');
        fontPreload.rel = 'preload';
        fontPreload.href = 'data/fonts/abashiri-mincho.woff2?v=1';
        fontPreload.as = 'font';
        fontPreload.type = 'font/woff2';
        fontPreload.crossOrigin = 'anonymous';
        document.head.appendChild(fontPreload);
    }

    function showEarlyPersistentTransitionCheckpoint() {
        if (typeof localStorage === 'undefined') return;
        try {
            const raw = localStorage.getItem(MOBILE_TRANSITION_CHECKPOINT_KEY);
            if (!raw) return;
            const data = JSON.parse(raw);
            if (!data || !data.phase) return;
            if (data.time && Date.now() - data.time > 2 * 60 * 60 * 1000) {
                localStorage.removeItem(MOBILE_TRANSITION_CHECKPOINT_KEY);
                return;
            }
            if (document.getElementById('mobile-transition-checkpoint-badge') || document.getElementById('ai-last-checkpoint-badge')) return;
            const el = document.createElement('div');
            el.id = 'mobile-transition-checkpoint-badge';
            el.textContent = `前回停止位置: 画面操作　${data.phase}`;
            el.title = 'タップすると閉じます';
            el.addEventListener('click', () => {
                el.remove();
                try { localStorage.removeItem(MOBILE_TRANSITION_CHECKPOINT_KEY); } catch (_) {}
            });
            document.body.appendChild(el);
        } catch (_) {}
    }

    function initializeFonts() {
        const root = document.documentElement;
        let revealed = false;

        const reveal = (reason) => {
            if (revealed) return;
            revealed = true;
            root.classList.remove('fonts-loading');
            root.classList.add(reason === 'loaded' ? 'fonts-ready' : 'fonts-fallback');
        };

        // iPhone 6/7/8/SE級の低メモリ端末ではWebフォント2書体とも読まない。
        // iOS標準の明朝系へ寄せ、フォント展開・glyph atlasの常駐メモリを抑える。
        if (earlyMobileLowMemoryMode) {
            reveal('unsupported');
            window.__gameFontLoadPromise = Promise.resolve(false);
            console.info('【FontLoader】低メモリ端末ではWebフォントを読み込まずシステム明朝を使用します。');
            return;
        }

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
            ['700 16px "abashiri-mincho"', '戦国覇道徳川家康今川織田武田上杉一二三四五六七八九〇']
        ];
        // 低メモリ端末は上でreturn済み。通常端末だけ従来どおり2書体を明示ロードする。
        if (!earlyMobileLowMemoryMode) {
            requests.push(
                ['400 16px "FudeGoshirae"', '戦国覇道決定取消攻撃内政外交軍団一二三四五六七八九〇'],
                ['700 16px "FudeGoshirae"', '戦国覇道決定取消攻撃内政外交軍団一二三四五六七八九〇']
            );
        }

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
            console.info(`【FontLoader】Webフォント${earlyMobileLowMemoryMode ? '1書体（低メモリ）' : '2書体'}の明示ロードが完了しました。`);
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

    function renderDisplayModeIndicator() {
        const element = document.getElementById('legacy-safe-mode-indicator');
        if (!element) return;
        if (!earlyMobileLowMemoryMode) {
            element.textContent = '';
            return;
        }
        element.textContent = displayModePreference === 'light' ? '軽量モード' : '軽量モード（自動）';
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

    const PC_LOGICAL_WIDTH = 1280;
    const PC_LOGICAL_HEIGHT = 720;
    const MOBILE_TARGET_RATIO = 9 / 16;
    const MIN_TOUCH_PC_SCALE = 0.75;

    function mediaMatches(query) {
        try {
            return !!(window.matchMedia && window.matchMedia(query).matches);
        } catch (_) {
            return false;
        }
    }

    function isTouchFirstDevice() {
        const ua = navigator.userAgent || '';
        const maxTouchPoints = Number(navigator.maxTouchPoints || 0);
        const mobileUa = /iPhone|iPad|iPod|Android|Mobile/i.test(ua);
        // iPadOS はデスクトップ向けUAで Macintosh を名乗る場合がある。
        const ipadDesktopUa = /Macintosh/i.test(ua) && maxTouchPoints > 1;
        const coarseTouchDevice = maxTouchPoints > 0
            && mediaMatches('(pointer: coarse)')
            && mediaMatches('(hover: none)');
        return mobileUa || ipadDesktopUa || coarseTouchDevice;
    }

    function resolveGameLayoutMode(layoutW, layoutH, touchInput = isTouchFirstDevice()) {
        if (!touchInput) return 'pc';

        // タッチ主体端末は縦持ちならスマホUIを正本にする。横持ちでも
        // PC論理画面を75%以上で収められない場合は、PC UIを押し潰さずスマホUIへ寄せる。
        const isLandscape = layoutW > layoutH;
        const pcScale = Math.min(layoutW / PC_LOGICAL_WIDTH, layoutH / PC_LOGICAL_HEIGHT);
        return isLandscape && pcScale >= MIN_TOUCH_PC_SCALE ? 'pc' : 'mobile';
    }

    function resizeGameScreen() {
        const screen = document.getElementById('game-screen');
        if (!screen) return;

        const viewport = window.visualViewport || null;
        const dpr = Math.max(1, window.devicePixelRatio || 1);
        const snapPhysicalPixel = value => Math.round(value * dpr) / dpr;
        const onePhysicalPixel = 1 / dpr;
        const windowW = viewport ? viewport.width : window.innerWidth;
        const windowH = viewport ? viewport.height : window.innerHeight;
        const viewportLeft = viewport ? viewport.offsetLeft : 0;
        const viewportTop = viewport ? viewport.offsetTop : 0;
        // ソフトキーボードで縮む visualViewport ではなく、レイアウトviewportをモード判定の正本にする。
        const layoutW = window.innerWidth || windowW;
        const layoutH = window.innerHeight || windowH;
        const isTouchInput = isTouchFirstDevice();
        const layoutMode = resolveGameLayoutMode(layoutW, layoutH, isTouchInput);
        const isPC = layoutMode === 'pc';
        const previousLayoutMode = document.body.dataset.layoutMode || '';

        document.body.classList.toggle('is-pc', isPC);
        // レイアウト方式と入力方式は別物。横向きタブレットはPCレイアウトでも入力はタッチのまま。
        document.body.classList.toggle('is-touch-input', isTouchInput);
        document.body.dataset.layoutMode = layoutMode;
        document.body.dataset.inputMode = isTouchInput ? 'touch' : 'mouse';

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

        if (isPC) {
            const scale = Math.min(windowW / PC_LOGICAL_WIDTH, windowH / PC_LOGICAL_HEIGHT);
            applyScreenGeometry(PC_LOGICAL_WIDTH, PC_LOGICAL_HEIGHT, scale);
        } else {
            const targetRatio = MOBILE_TARGET_RATIO;
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

        if (previousLayoutMode && previousLayoutMode !== layoutMode
            && typeof window.dispatchEvent === 'function' && typeof CustomEvent === 'function') {
            window.dispatchEvent(new CustomEvent('game-layout-mode-change', {
                detail: { mode: layoutMode, previousMode: previousLayoutMode }
            }));
        }
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
        renderDisplayModeIndicator();
        bindStaticUiEvents();
        resizeGameScreen();
        // GameManager生成より前でも、前回WebKitプロセス停止のcheckpointをタイトル上へ表示できるようにする。
        showEarlyPersistentTransitionCheckpoint();
    }

    initializeFonts();
    window.addEventListener('resize', scheduleResizeGameScreen, { passive: true });
    window.addEventListener('orientationchange', scheduleResizeGameScreen, { passive: true });
    if (window.visualViewport) {
        window.visualViewport.addEventListener('resize', scheduleResizeGameScreen, { passive: true });
    }
    window.addEventListener('DOMContentLoaded', initializeDomBindings, { once: true });
    window.addEventListener('beforeunload', (event) => {
        event.preventDefault();
        event.returnValue = '';
    });
})();
