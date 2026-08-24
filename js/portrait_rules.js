/**
 * portrait_rules.js
 * 武将の顔変更文字列のうち、年代条件とその他条件を安全に解釈する共通Rulesです。
 * 年代による顔の決定だけを担当し、大名就任・歴史イベント等の発火条件そのものは各専門Systemへ残します。
 */
const PortraitRules = Object.freeze({
    _entries(faceChange) {
        if (!faceChange || typeof faceChange !== 'string') return [];
        return faceChange.split('/')
            .map(raw => raw.trim())
            .filter(Boolean)
            .map(raw => {
                const separator = raw.indexOf(':');
                if (separator < 0) return { raw, condition: '', face: '', year: null };
                const condition = raw.slice(0, separator).trim();
                const face = raw.slice(separator + 1).trim();
                const numericYear = /^\d+$/.test(condition) ? Number(condition) : null;
                return {
                    raw,
                    condition,
                    face,
                    year: Number.isInteger(numericYear) ? numericYear : null
                };
            });
    },

    getYearEntries(faceChange) {
        return this._entries(faceChange).filter(entry => entry.year !== null && entry.face);
    },

    getNonYearEntries(faceChange) {
        return this._entries(faceChange).filter(entry => entry.year === null);
    },

    getLatestYearFace(faceChange, year) {
        const currentYear = Number(year);
        if (!Number.isFinite(currentYear)) return '';

        let latestYear = -Infinity;
        let latestFace = '';
        for (const entry of this.getYearEntries(faceChange)) {
            // 既存の開始時処理と同じく、同一年の重複では先に書かれた指定を優先します。
            if (entry.year <= currentYear && entry.year > latestYear) {
                latestYear = entry.year;
                latestFace = entry.face;
            }
        }
        return latestFace;
    },

    getExactYearFace(faceChange, year) {
        const targetYear = Number(year);
        if (!Number.isFinite(targetYear)) return '';

        let face = '';
        for (const entry of this.getYearEntries(faceChange)) {
            // 年次処理は従来どおり記載順に上書きし、同一年なら後の指定を採用します。
            if (entry.year === targetYear) face = entry.face;
        }
        return face;
    },

    getNamedFace(faceChange, conditionName) {
        const target = String(conditionName || '').trim();
        if (!target) return '';
        let face = '';
        for (const entry of this.getNonYearEntries(faceChange)) {
            if (entry.condition === target && entry.face) face = entry.face;
        }
        return face;
    },

    hasUnsupportedNonYearCondition(faceChange, supportedConditions = []) {
        const supported = new Set((supportedConditions || []).map(value => String(value).trim()));
        return this.getNonYearEntries(faceChange).some(entry => !supported.has(entry.condition));
    },

    replaceYearRules(savedFaceChange, latestFaceChange) {
        const latestYearRules = this.getYearEntries(latestFaceChange).map(entry => entry.raw);
        const savedNonYearRules = this.getNonYearEntries(savedFaceChange).map(entry => entry.raw);
        return [...latestYearRules, ...savedNonYearRules].filter(Boolean).join('/');
    }
});

if (typeof window !== 'undefined') window.PortraitRules = PortraitRules;
