/**
 * 初回ページの軽量ロード幕専用。
 * 本編CSS・スクリプトと書体が揃う前でも状態を見せるため、
 * 起動処理を描画フレームの後へ送る。ゲームルール・本編ロード幕は扱わない。
 * スクリプトの順序と対象は index.html の template を正本とする。
 */
(function startInitialPageLoading() {
    'use strict';
    const overlay = document.getElementById('startup-loading-screen');
    const progress = document.getElementById('startup-progress-bar');
    const counter = document.getElementById('startup-progress');
    const status = document.getElementById('startup-status');
    const retry = document.getElementById('startup-retry');
    const manifest = document.getElementById('startup-script-manifest');
    if (!overlay || !manifest) return;

    const report = (percent, message) => {
        if (progress) progress.style.width = `${percent}%`;
        if (counter) counter.textContent = `${percent}%`;
        if (status) status.textContent = message;
    };
    if (retry) retry.addEventListener('click', () => window.location.reload());

    // requestAnimationFrame 内で大量の同期処理を始めない。少なくとも最初の
    // ロード画面のpaint機会を渡してから、大きなCSSとJSを読み始める。
    const givePaintOpportunity = () => new Promise(resolve => {
        requestAnimationFrame(() => setTimeout(resolve, 0));
    });

    function loadStylesheet(src) {
        return new Promise((resolve, reject) => {
            const link = document.createElement('link');
            link.rel = 'stylesheet';
            link.href = src;
            link.onload = resolve;
            link.onerror = () => reject(new Error(`CSSの読込に失敗: ${src}`));
            document.head.appendChild(link);
        });
    }

    function loadScript(src) {
        return new Promise((resolve, reject) => {
            const element = document.createElement('script');
            // 動的追加のscriptは既定でasync。明示的にfalseとして
            // manifestに記された旧来の同期script順を維持する。
            element.async = false;
            element.src = src;
            element.onload = resolve;
            element.onerror = () => reject(new Error(`JavaScriptの読込に失敗: ${src}`));
            document.body.appendChild(element);
        });
    }

    async function run() {
        const sources = Array.from(manifest.content.querySelectorAll('script[src]'),
            element => element.getAttribute('src'));
        if (!sources.length || sources[sources.length - 1] !== 'js/game.js') {
            throw new Error('起動用スクリプト一覧が正しくありません');
        }
        // 最初のpaint。ゲーム用font-faceや複雑なCSSはまだ存在しない。
        await givePaintOpportunity();
        report(5, '画面を準備しています');
        await Promise.all([
            loadStylesheet('css/style.css'),
            loadStylesheet('css/animation.css')
        ]);
        report(14, 'ゲームプログラムを読み込んでいます');
        await givePaintOpportunity();

        // 連続で約70本を実行すると低速端末の描画が長く停止する。
        // 複数本の取得は並行しつつ、その実行はasync=falseで元の順番を守り、
        // まとまりごとにブラウザへ描画・入力機会を渡す。
        const batchSize = 8;
        for (let start = 0; start < sources.length; start += batchSize) {
            const batch = sources.slice(start, start + batchSize);
            await Promise.all(batch.map(loadScript));
            const completed = Math.min(sources.length, start + batch.length);
            report(14 + Math.floor(78 * completed / sources.length), 'ゲームプログラムを読み込んでいます');
            await givePaintOpportunity();
        }
        if (typeof window.__refreshTitleVersion === 'function') window.__refreshTitleVersion();
        if (!window.GameApp || !window.GameApp.ui) {
            throw new Error('ゲーム本体の初期化が完了していません');
        }
        report(95, 'タイトル画面を準備しています');
        if (window.__titleFontLoadPromise) await window.__titleFontLoadPromise;
        // タイトル書体の失敗時は app_bootstrap の既存fallbackが公開責務を持つ。
        report(100, '完了');
        await givePaintOpportunity();
        overlay.hidden = true;
    }

    run().catch(error => {
        console.error('【StartupLoader】初回起動に失敗:', error);
        report(0, '起動に失敗しました。再読み込みしてください。');
        if (retry) retry.hidden = false;
    });
})();
