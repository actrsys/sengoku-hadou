/**
 * ui_settings.js
 * 設定画面の見た目や操作（音量の変更や通知のオンオフなど）を担当するファイルです。
 */

document.addEventListener("DOMContentLoaded", () => {
    // ゲームの共通設定を入れる箱（window.GameConfig）がまだ無ければ、新しく用意します
    window.GameConfig = window.GameConfig || {};

    // =========================================
    // 1. スライダー（音量）を動かした時の処理
    // =========================================
    const updateSettingSlider = (type, value) => {
        const range = document.getElementById(`setting-${type}-volume`);
        const text = document.getElementById(`setting-${type}-text`);
        if (range && text) {
            // 白い数字の方には「%」を含めず、純粋な数値だけを入れます
            text.textContent = value;
            range.style.setProperty('--value', value + '%');
        }
    };

    // BGM・SEのスライダーそれぞれに「動いた時に数字やゲージを変える魔法」をかけます
    ['bgm', 'se'].forEach(type => {
        const range = document.getElementById(`setting-${type}-volume`);
        if (range) {
            range.addEventListener('input', (e) => {
                updateSettingSlider(type, e.target.value);
            });
            
            // ★追加：スマホでスライダーを触っている間は、画面がスクロールしないようにバリアを張ります
            range.addEventListener('touchstart', (e) => e.stopPropagation(), { passive: true });
            range.addEventListener('touchmove', (e) => e.stopPropagation(), { passive: true });

            // 最初に画面が開いた時にも、ゲージと数字をピタッと合わせておきます
            updateSettingSlider(type, range.value);
        }
    });

    // =========================================
    // 2. トグルボタン（通知・歴史イベントなど）を押した時の処理
    // =========================================
    const updateToggleSetting = (type, isTrue) => {
        const btnTrue = document.getElementById(`btn-${type}-true`);
        const btnFalse = document.getElementById(`btn-${type}-false`);
        
        // 押された方のボタンを光らせて、もう片方の光を消します
        if (btnTrue && btnFalse) {
            if (isTrue) {
                btnTrue.classList.add('active');
                btnFalse.classList.remove('active');
            } else {
                btnTrue.classList.remove('active');
                btnFalse.classList.add('active');
            }
        }
        
        // 設定の中身を更新して、ブラウザの記憶（localStorage）にも書き込みます
        if (type === 'notify') {
            window.GameConfig.aiWarNotify = isTrue;
            localStorage.setItem('aiWarNotify', isTrue ? 'true' : 'false');
        } else if (type === 'historical') {
            window.GameConfig.historicalEvent = isTrue;
            localStorage.setItem('historicalEvent', isTrue ? 'true' : 'false');
        }
    };

    // 各ボタンに「クリックされたらこの魔法を使ってね」というお約束をします
    ['notify', 'historical'].forEach(type => {
        const btnTrue = document.getElementById(`btn-${type}-true`);
        const btnFalse = document.getElementById(`btn-${type}-false`);
        
        if (btnTrue) {
            btnTrue.addEventListener('click', () => updateToggleSetting(type, true));
        }
        if (btnFalse) {
            btnFalse.addEventListener('click', () => updateToggleSetting(type, false));
        }
    });

    // =========================================
    // 3. ゲーム起動時の初期化（以前の設定を読み込む）
    // =========================================
    // AI戦争の通知の記憶を読み出します
    const savedNotify = localStorage.getItem('aiWarNotify');
    const isNotify = savedNotify !== 'false';
    window.GameConfig.aiWarNotify = isNotify;
    updateToggleSetting('notify', isNotify);

    // 歴史イベントの記憶を読み出します
    const savedHistorical = localStorage.getItem('historicalEvent');
    const isHistorical = savedHistorical !== 'false';
    window.GameConfig.historicalEvent = isHistorical;
    updateToggleSetting('historical', isHistorical);

    // =========================================
    // 4. 「閉じる」ボタンの処理
    // =========================================
    const closeBtn = document.getElementById('settings-close-btn');
    if (closeBtn) {
        closeBtn.addEventListener('click', () => {
            const modal = document.getElementById('settings-modal');
            if (modal) modal.classList.add('hidden');
        });
    }
});