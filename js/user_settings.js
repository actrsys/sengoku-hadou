/**
 * user_settings.js
 * ユーザー個人の表示・通知・保存設定の正本。
 *
 * GameConfig はゲームルール/バランス値だけを持ち、ユーザー設定はここへ分離する。
 * localStorage のキーやデフォルト値を利用側へ散らさない。
 */
class UserSettingsManager {
    static DEFAULTS = Object.freeze({
        aiWarNotify: true,
        historicalEvent: true,
        autoSave: true,
        bgmVolume: 1.0,
        seVolume: 1.0,
        displayMode: 'auto'
    });

    static STORAGE_KEYS = Object.freeze({
        aiWarNotify: 'aiWarNotify',
        historicalEvent: 'historicalEvent',
        autoSave: 'autoSave',
        bgmVolume: 'userBgmVolume',
        seVolume: 'userSeVolume',
        displayMode: 'userDisplayMode'
    });

    constructor(storage = null) {
        this.storage = storage || this._resolveStorage();
        this.reload();
    }

    _resolveStorage() {
        try {
            return window.localStorage || null;
        } catch (_) {
            return null;
        }
    }

    _read(key) {
        if (!this.storage) return null;
        try {
            return this.storage.getItem(key);
        } catch (_) {
            return null;
        }
    }

    _write(key, value) {
        if (!this.storage) return;
        try {
            this.storage.setItem(key, String(value));
        } catch (_) {
            // 保存不能な環境でもゲーム本体は継続する。
        }
    }

    _readBoolean(name) {
        const raw = this._read(UserSettingsManager.STORAGE_KEYS[name]);
        if (raw === null) return UserSettingsManager.DEFAULTS[name];
        return raw !== 'false';
    }

    _readVolume(name) {
        const raw = this._read(UserSettingsManager.STORAGE_KEYS[name]);
        if (raw === null || raw === '') return UserSettingsManager.DEFAULTS[name];
        const value = Number(raw);
        if (!Number.isFinite(value)) return UserSettingsManager.DEFAULTS[name];
        return Math.max(0, Math.min(1, value));
    }


    _readDisplayMode() {
        const raw = this._read(UserSettingsManager.STORAGE_KEYS.displayMode);
        return ['auto', 'normal', 'light'].includes(raw)
            ? raw
            : UserSettingsManager.DEFAULTS.displayMode;
    }

    reload() {
        this.aiWarNotify = this._readBoolean('aiWarNotify');
        this.historicalEvent = this._readBoolean('historicalEvent');
        this.autoSave = this._readBoolean('autoSave');
        this.bgmVolume = this._readVolume('bgmVolume');
        this.seVolume = this._readVolume('seVolume');
        this.displayMode = this._readDisplayMode();
        return this;
    }

    setAiWarNotify(value) {
        this.aiWarNotify = !!value;
        this._write(UserSettingsManager.STORAGE_KEYS.aiWarNotify, this.aiWarNotify);
        return this.aiWarNotify;
    }

    setHistoricalEvent(value) {
        this.historicalEvent = !!value;
        this._write(UserSettingsManager.STORAGE_KEYS.historicalEvent, this.historicalEvent);
        if (typeof window.dispatchEvent === 'function' && typeof window.CustomEvent === 'function') {
            window.dispatchEvent(new window.CustomEvent('user-setting-changed', {
                detail: { key: 'historicalEvent', value: this.historicalEvent }
            }));
        }
        return this.historicalEvent;
    }

    setAutoSave(value) {
        this.autoSave = !!value;
        this._write(UserSettingsManager.STORAGE_KEYS.autoSave, this.autoSave);
        return this.autoSave;
    }

    setDisplayMode(value) {
        const normalized = ['auto', 'normal', 'light'].includes(value)
            ? value
            : UserSettingsManager.DEFAULTS.displayMode;
        this.displayMode = normalized;
        this._write(UserSettingsManager.STORAGE_KEYS.displayMode, this.displayMode);
        return this.displayMode;
    }

    setBgmVolume(value) {
        const normalized = Math.max(0, Math.min(1, Number(value)));
        this.bgmVolume = Number.isFinite(normalized) ? normalized : UserSettingsManager.DEFAULTS.bgmVolume;
        this._write(UserSettingsManager.STORAGE_KEYS.bgmVolume, this.bgmVolume);
        return this.bgmVolume;
    }

    setSeVolume(value) {
        const normalized = Math.max(0, Math.min(1, Number(value)));
        this.seVolume = Number.isFinite(normalized) ? normalized : UserSettingsManager.DEFAULTS.seVolume;
        this._write(UserSettingsManager.STORAGE_KEYS.seVolume, this.seVolume);
        return this.seVolume;
    }
}

window.UserSettingsManager = UserSettingsManager;
window.UserSettings = new UserSettingsManager();
