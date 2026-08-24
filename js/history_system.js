/**
 * history_system.js
 * ゲーム内の「行動履歴」を専門管理します。
 * UIの一時メッセージとは分離し、年月・関係勢力・種類を持つ構造化データとして保存します。
 */
class HistorySystem {
    constructor(game) {
        this.game = game;
        this.entries = [];
    }

    clear() {
        this.entries = [];
    }

    _normalizeClanIds(ids) {
        const list = Array.isArray(ids) ? ids : (ids === undefined || ids === null ? [] : [ids]);
        return [...new Set(list.map(Number).filter(id => Number.isInteger(id) && id > 0))];
    }

    _inferClanIds(options = {}) {
        const explicit = this._normalizeClanIds(options.clanIds);
        if (explicit.length > 0) return explicit;

        const ids = [];
        if (Array.isArray(options.bushoIds) && this.game && typeof this.game.getBusho === 'function') {
            options.bushoIds.forEach(id => {
                const busho = this.game.getBusho(Number(id));
                if (busho && Number(busho.clan) > 0) ids.push(Number(busho.clan));
            });
        }
        if (Array.isArray(options.castleIds) && this.game && typeof this.game.getCastle === 'function') {
            options.castleIds.forEach(id => {
                const castle = this.game.getCastle(Number(id));
                if (castle && Number(castle.ownerClan) > 0) ids.push(Number(castle.ownerClan));
            });
        }
        if (ids.length > 0) return this._normalizeClanIds(ids);

        // 合戦中の従来ログは戦争System側に多数残っているため、参加勢力だけは安全に補完します。
        const state = this.game && this.game.warManager ? this.game.warManager.state : null;
        if (state && state.active) {
            if (state.attacker && Number(state.attacker.ownerClan) > 0) ids.push(Number(state.attacker.ownerClan));
            if (state.defender && Number(state.defender.ownerClan) > 0) ids.push(Number(state.defender.ownerClan));
        }
        if (ids.length > 0) return this._normalizeClanIds(ids);

        // 現在手番への関連付けは、呼び出し側が明示した場合だけ使う。
        // 月次・歴史イベントなど関係勢力を確定できないログを、たまたま実行中の手番勢力へ誤帰属させない。
        if (options.inferCurrentTurn === true && this.game && typeof this.game.getCurrentTurnCastle === 'function') {
            const castle = this.game.getCurrentTurnCastle();
            if (castle && Number(castle.ownerClan) > 0) ids.push(Number(castle.ownerClan));
        }
        return this._normalizeClanIds(ids);
    }

    record(text, options = {}) {
        const cleanText = String(text || '').trim();
        if (!cleanText) return null;
        const entry = {
            year: Number(options.year ?? this.game?.year ?? 0),
            month: Number(options.month ?? this.game?.month ?? 0),
            text: cleanText,
            clanIds: this._inferClanIds(options),
            category: String(options.category || 'general')
        };
        this.entries.push(entry);
        const maxEntries = Number(window.GameConfig.History.MaxEntries);
        if (this.entries.length > maxEntries) {
            this.entries.splice(0, this.entries.length - maxEntries);
        }
        return entry;
    }

    getEntries(scope = 'clan', clanId = null) {
        const entries = Array.isArray(this.entries) ? this.entries : [];
        if (scope === 'all') return [...entries];
        const targetClanId = Number(clanId ?? this.game?.playerClanId ?? 0);
        if (targetClanId <= 0) return [];
        return entries.filter(entry => Array.isArray(entry.clanIds) && entry.clanIds.includes(targetClanId));
    }

    serialize() {
        return (this.entries || []).map(entry => ({
            year: Number(entry.year) || 0,
            month: Number(entry.month) || 0,
            text: String(entry.text || ''),
            clanIds: this._normalizeClanIds(entry.clanIds),
            category: String(entry.category || 'general')
        }));
    }

    load(entries) {
        this.clear();
        if (!Array.isArray(entries)) return;
        entries.forEach(raw => {
            if (typeof raw === 'string') {
                this.record(raw, { clanIds: [], category: 'legacy', inferCurrentTurn: false });
                return;
            }
            if (!raw || typeof raw !== 'object') return;
            this.record(raw.text, {
                year: raw.year,
                month: raw.month,
                clanIds: raw.clanIds,
                category: raw.category,
                inferCurrentTurn: false
            });
        });
    }

    formatEntry(entry) {
        if (!entry) return '';
        const y = Number(entry.year) || 0;
        const m = Number(entry.month) || 0;
        const prefix = y > 0 && m > 0 ? `[${y}年${m}月] ` : '';
        return `${prefix}${entry.text || ''}`;
    }
}

window.HistorySystem = HistorySystem;
