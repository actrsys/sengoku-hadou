/**
 * ui_settings.js
 * 設定画面の見た目と操作を担当する。
 * 設定値の保存・正本は UserSettings、音量反映は AudioManager に任せる。
 */

document.addEventListener('DOMContentLoaded', () => {
    const settings = window.UserSettings;

    const updateSettingSlider = (type, value) => {
        const range = document.getElementById(`setting-${type}-volume`);
        const text = document.getElementById(`setting-${type}-text`);
        if (range && text) {
            text.textContent = value;
            range.style.setProperty('--value', value + '%');
        }
    };

    // 音量スライダー: UserSettings の保存値を画面へ反映する。
    ['bgm', 'se'].forEach(type => {
        const range = document.getElementById(`setting-${type}-volume`);
        if (!range) return;

        const ratio = type === 'bgm'
            ? (settings ? settings.bgmVolume : 1)
            : (settings ? settings.seVolume : 1);
        range.value = Math.round(ratio * 100);
        updateSettingSlider(type, range.value);

        range.addEventListener('input', (e) => {
            updateSettingSlider(type, e.target.value);
        });
        range.addEventListener('touchstart', (e) => e.stopPropagation(), { passive: true });
        range.addEventListener('touchmove', (e) => e.stopPropagation(), { passive: true });
    });

    const updateToggleSetting = (type, isTrue, persist = true) => {
        const btnTrue = document.getElementById(`btn-${type}-true`);
        const btnFalse = document.getElementById(`btn-${type}-false`);

        if (btnTrue && btnFalse) {
            btnTrue.classList.toggle('active', isTrue);
            btnFalse.classList.toggle('active', !isTrue);
        }

        if (!persist || !settings) return;
        if (type === 'notify') settings.setAiWarNotify(isTrue);
        else if (type === 'historical') settings.setHistoricalEvent(isTrue);
        else if (type === 'autosave') settings.setAutoSave(isTrue);
    };

    ['notify', 'historical', 'autosave'].forEach(type => {
        const btnTrue = document.getElementById(`btn-${type}-true`);
        const btnFalse = document.getElementById(`btn-${type}-false`);

        if (btnTrue) {
            btnTrue.addEventListener('click', () => {
                updateToggleSetting(type, true);
            });
        }
        if (btnFalse) {
            btnFalse.addEventListener('click', () => {
                updateToggleSetting(type, false);
            });
        }
    });


    const updateDisplayModeSetting = (mode, persist = true) => {
        const normalized = ['auto', 'normal', 'light'].includes(mode) ? mode : 'auto';
        ['auto', 'normal', 'light'].forEach(value => {
            const btn = document.getElementById(`btn-display-mode-${value}`);
            if (btn) btn.classList.toggle('active', value === normalized);
        });
        if (persist && settings) settings.setDisplayMode(normalized);
    };

    ['auto', 'normal', 'light'].forEach(mode => {
        const btn = document.getElementById(`btn-display-mode-${mode}`);
        if (btn) btn.addEventListener('click', () => updateDisplayModeSetting(mode));
    });

    updateDisplayModeSetting(settings ? settings.displayMode : 'auto', false);

    // UserSettings は user_settings.js の読込時に localStorage から復元済み。
    updateToggleSetting('notify', settings ? settings.aiWarNotify : true, false);
    updateToggleSetting('historical', settings ? settings.historicalEvent : true, false);
    updateToggleSetting('autosave', settings ? settings.autoSave : true, false);

    const closeBtn = document.getElementById('settings-close-btn');
    if (closeBtn) {
        closeBtn.addEventListener('click', () => {
            const modal = document.getElementById('settings-modal');
            if (modal) modal.classList.add('hidden');
        });
    }

    const settingsModal = document.getElementById('settings-modal');
    if (settingsModal) {
        const observer = new MutationObserver(() => {
            if (settingsModal.classList.contains('hidden')) return;
            ['bgm', 'se'].forEach(type => {
                const range = document.getElementById(`setting-${type}-volume`);
                if (range) updateSettingSlider(type, range.value);
            });
        });
        observer.observe(settingsModal, { attributes: true, attributeFilter: ['class'] });
    }
});
