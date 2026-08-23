/**
 * busho_list_sort_rules.js
 * 武将一覧で共用できる「既知情報」の検索・ソート規則を担当する。
 * 敵情報の秘匿や推定値など画面固有の事情は各View側で扱う。
 */
class BushoListSortRules {
    static getInterviewSortOptions() {
        return [
            { key: 'leadership', label: '統率', defaultAsc: false },
            { key: 'strength', label: '武勇', defaultAsc: false },
            { key: 'politics', label: '内政', defaultAsc: false },
            { key: 'diplomacy', label: '外交', defaultAsc: false },
            { key: 'intelligence', label: '智謀', defaultAsc: false },
            { key: 'charm', label: '魅力', defaultAsc: false },
            { key: 'name', label: '名前', defaultAsc: true },
            { key: 'castle', label: '所在', defaultAsc: true },
            { key: 'rank', label: '身分', defaultAsc: false }
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

    static sortKnown(game, items, key = 'leadership', isAsc = false) {
        const list = Array.isArray(items) ? items.slice() : [];
        return list.sort((a, b) => {
            const cmp = this.compareKnown(game, a, b, key, isAsc);
            if (cmp !== 0) return cmp;
            return Number(a && a.id || 0) - Number(b && b.id || 0);
        });
    }

    static compareKnown(game, a, b, key, isAsc) {
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
            return (this.getClanRank(game, a) - this.getClanRank(game, b)) * direction;
        }

        const numericKeys = ['leadership', 'strength', 'politics', 'diplomacy', 'intelligence', 'charm'];
        if (numericKeys.includes(key)) {
            const av = Number(a && a[key] || 0);
            const bv = Number(b && b[key] || 0);
            return (av - bv) * direction;
        }

        return 0;
    }

    static getClanRank(game, busho) {
        if (!busho) return 0;
        const isGunshi = !!busho.isGunshi || !!(busho.clan > 0 && game && game.clans
            && Number(game.clans.find(c => Number(c.id) === Number(busho.clan))?.gunshiId) === Number(busho.id));
        const isCommander = !!busho.isCommander || !!(game && game.legions
            && game.legions.some(l => Number(l.commanderId) === Number(busho.id)));
        if (busho.isDaimyo) return 8;
        if (isCommander) return 7;
        if (busho.isCastellan) return 6;
        if (isGunshi) return 5;
        if (window.BushoStatusRules && window.BushoStatusRules.isRonin(busho)) return 1;
        if (Number(busho.belongKunishuId || 0) > 0) {
            const kunishu = game && game.kunishuSystem ? game.kunishuSystem.getKunishu(busho.belongKunishuId) : null;
            return kunishu && Number(kunishu.leaderId) === Number(busho.id) ? 3 : 2;
        }
        return 4;
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
