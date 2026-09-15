/**
 * busho_list_sort_rules.js
 * 武将一覧で共用できる「既知情報」の検索・ソート規則を担当する。
 * 敵情報の秘匿や推定値など画面固有の事情は各View側で扱う。
 */
class BushoListSortRules {
    static getInterviewSortOptions() {
        return [
            { key: 'rank', label: '身分', defaultAsc: false },
            { key: 'name', label: '名前', defaultAsc: true },
            { key: 'castle', label: '所在', defaultAsc: true },
            { key: 'leadership', label: '統率', defaultAsc: false },
            { key: 'strength', label: '武勇', defaultAsc: false },
            { key: 'politics', label: '内政', defaultAsc: false },
            { key: 'diplomacy', label: '外交', defaultAsc: false },
            { key: 'intelligence', label: '智謀', defaultAsc: false },
            { key: 'charm', label: '魅力', defaultAsc: false },
        ];
    }

    static filterByName(items, query) {
        const list = Array.isArray(items) ? items : [];
        const needle = String(query || '').trim().toLocaleLowerCase('ja');
        if (!needle) return list.slice();
        return list.filter(busho => {
            const names = [busho && busho.name, busho && busho.yomi]
                .filter(Boolean)
                .join(' ')
                .toLocaleLowerCase('ja');
            return names.includes(needle);
        });
    }

    static sortKnown(game, items, key = 'rank', isAsc = false) {
        const list = Array.isArray(items) ? items.slice() : [];
        // 身分ソートだけは軍団所属確認が比較回数ぶん発生しやすいため、
        // この1回の同期ソート中だけ短命contextを共有します。
        const context = key === 'rank' ? this.createClanRankContext(game) : null;
        return list.sort((a, b) => {
            const cmp = this.compareKnown(game, a, b, key, isAsc, context);
            if (cmp !== 0) return cmp;
            return Number(a && a.id || 0) - Number(b && b.id || 0);
        });
    }

    static compareKnown(game, a, b, key, isAsc, context = null) {
        const direction = isAsc ? 1 : -1;

        if (key === 'name') {
            return this._compareText(
                (a && (a.yomi || a.name)) || '',
                (b && (b.yomi || b.name)) || '',
                isAsc,
                (a && a.name) || '',
                (b && b.name) || ''
            );
        }

        if (key === 'castle') {
            const infoA = this._getCastleInfo(game, a);
            const infoB = this._getCastleInfo(game, b);
            return this._compareText(infoA.yomi, infoB.yomi, isAsc, infoA.name, infoB.name);
        }

        if (key === 'rank') {
            const rankDiff = (this.getClanRank(game, a, context) - this.getClanRank(game, b, context)) * direction;
            if (rankDiff !== 0) return rankDiff;

            // 功績値そのものは非公開だが、身分順の第二キーとして同じ昇降順へ揃える。
            // 降順なら高身分・高功績、昇順なら低身分・低功績となり、並びから実績を薄く察せる。
            const achievementA = Number(a && a.achievementTotal || 0);
            const achievementB = Number(b && b.achievementTotal || 0);
            const achievementDiff = (achievementA - achievementB) * direction;
            if (achievementDiff !== 0) return achievementDiff;

            return this._compareText(
                (a && (a.yomi || a.name)) || '',
                (b && (b.yomi || b.name)) || '',
                true,
                (a && a.name) || '',
                (b && b.name) || ''
            );
        }

        const numericKeys = ['leadership', 'strength', 'politics', 'diplomacy', 'intelligence', 'charm'];
        if (numericKeys.includes(key)) {
            const av = Number(a && a[key] || 0);
            const bv = Number(b && b[key] || 0);
            return (av - bv) * direction;
        }

        return 0;
    }

    static createClanRankContext(game) {
        const commanderIdSet = new Set();
        if (game && Array.isArray(game.legions)) {
            for (let i = 0; i < game.legions.length; i++) {
                const commanderId = Number(game.legions[i] && game.legions[i].commanderId);
                if (Number.isFinite(commanderId) && commanderId > 0) commanderIdSet.add(commanderId);
            }
        }
        return { commanderIdSet, rankById: new Map() };
    }

    static getClanRank(game, busho, context = null) {
        if (!busho) return 0;
        const bushoId = Number(busho.id);
        const rankById = context && context.rankById instanceof Map ? context.rankById : null;
        if (rankById && Number.isFinite(bushoId) && rankById.has(bushoId)) return rankById.get(bushoId);

        const isGunshi = !!busho.isGunshi;
        let isCommander = !!busho.isCommander;
        if (!isCommander) {
            if (context && context.commanderIdSet instanceof Set) {
                isCommander = context.commanderIdSet.has(bushoId);
            } else {
                isCommander = !!(game && game.legions
                    && game.legions.some(l => Number(l.commanderId) === bushoId));
            }
        }

        let rank = 4;
        if (context && context.rankOrderProfile === 'castle_detail') {
            // 拠点情報から開いた在城武将一覧だけは、現地の指揮系統が見やすい順にする。
            // 大名は従来どおり最上位に置き、その下を 国主 → 城主 → 軍師 → 武将 とする。
            if (busho.isDaimyo) rank = 8;
            else if (isCommander) rank = 7;
            else if (busho.isCastellan) rank = 6;
            else if (isGunshi) rank = 5;
            else if (window.BushoStatusRules && window.BushoStatusRules.isRonin(busho)) rank = 1;
            else if (Number(busho.belongKunishuId || 0) > 0) {
                const kunishu = game && game.kunishuSystem ? game.kunishuSystem.getKunishu(busho.belongKunishuId) : null;
                rank = kunishu && Number(kunishu.leaderId) === bushoId ? 3 : 2;
            }
        } else if (busho.isDaimyo) rank = 8;
        else if (isGunshi) rank = 7;
        else if (isCommander) rank = 6;
        else if (busho.isCastellan) rank = 5;
        else if (window.BushoStatusRules && window.BushoStatusRules.isRonin(busho)) rank = 1;
        else if (Number(busho.belongKunishuId || 0) > 0) {
            const kunishu = game && game.kunishuSystem ? game.kunishuSystem.getKunishu(busho.belongKunishuId) : null;
            rank = kunishu && Number(kunishu.leaderId) === bushoId ? 3 : 2;
        }

        if (rankById && Number.isFinite(bushoId)) rankById.set(bushoId, rank);
        return rank;
    }

    static _getCastleInfo(game, busho) {
        let castle = null;
        if (game && typeof game.getCastle === 'function') castle = game.getCastle(busho && busho.castleId);
        if (!castle && game && Array.isArray(game.castles)) {
            castle = game.castles.find(c => Number(c.id) === Number(busho && busho.castleId));
        }
        if (!castle) return { yomi: 'んんん', name: 'んんん' };
        return { yomi: castle.yomi || castle.name || '', name: castle.name || '' };
    }

    static _compareText(a, b, isAsc, secondaryA = '', secondaryB = '') {
        let cmp = isAsc
            ? String(a).localeCompare(String(b), 'ja')
            : String(b).localeCompare(String(a), 'ja');
        if (cmp === 0) {
            cmp = isAsc
                ? String(secondaryA).localeCompare(String(secondaryB), 'ja')
                : String(secondaryB).localeCompare(String(secondaryA), 'ja');
        }
        return cmp;
    }
}

window.BushoListSortRules = BushoListSortRules;
