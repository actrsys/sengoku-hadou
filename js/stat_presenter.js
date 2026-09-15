/**
 * stat_presenter.js
 * 能力値などの表示専用フォーマッタ。
 * ゲーム計算からHTML生成を分離する。
 */
class StatPresenter {
    static getGradeParts(val) {
        const value = Number(val || 0);
        if (value >= 110) return { base: 'S', sub: '+', cls: 'rank-s' };
        if (value >= 100) return { base: 'S', sub: '',  cls: 'rank-s' };
        if (value >= 90) return { base: 'A', sub: '+', cls: 'rank-a' };
        if (value >= 80) return { base: 'A', sub: '',  cls: 'rank-a' };
        if (value >= 70) return { base: 'B', sub: '+', cls: 'rank-b' };
        if (value >= 60) return { base: 'B', sub: '',  cls: 'rank-b' };
        if (value >= 50) return { base: 'C', sub: '+', cls: 'rank-c' };
        if (value >= 40) return { base: 'C', sub: '',  cls: 'rank-c' };
        if (value >= 30) return { base: 'D', sub: '+', cls: 'rank-d' };
        if (value >= 20) return { base: 'D', sub: '',  cls: 'rank-d' };
        if (value >= 10) return { base: 'E', sub: '+', cls: 'rank-e' };
        return { base: 'E', sub: '', cls: 'rank-e' };
    }

    static toGradeText(val) {
        const grade = this.getGradeParts(val);
        return `${grade.base}${grade.sub}`;
    }

    static toGradeHTML(val) {
        const grade = this.getGradeParts(val);
        return `
            <span class="grade-container ${grade.cls}">
                <span class="grade-main">${grade.base}</span>
                <span class="grade-sub">${grade.sub}</span>
            </span>`;
    }

    // 適性ランク（S～E）も武将詳細と同じランク文字で表示します。
    static toAptitudeHTML(rank) {
        const normalized = String(rank || 'E').trim().toUpperCase();
        const base = /^[SABCDE]$/.test(normalized) ? normalized : 'E';
        return `<span class="grade-container rank-${base.toLowerCase()}"><span class="grade-main">${base}</span></span>`;
    }

    static getPerceivedStatValue(target, statName, gunshi, castleAccuracy, playerClanId, daimyo = null) {
        return target[statName];
    }

    static getDisplayStatHTML(target, statName, gunshi, castleAccuracy = null, playerClanId = 0, daimyo = null) {
        return this.toGradeHTML(target[statName]);
    }

    // 武将の肩書き表示はモデルではなく表示層で組み立てます。
    static getBushoRankName(busho, game) {
        if (!busho) return "武将";
        const S = (window.GameConstants && window.GameConstants.BushoStatus) || { ACTIVE: 'active', RONIN: 'ronin', UNBORN: 'unborn' };
        if (busho.status === S.UNBORN) return busho.isNotBorn ? "出生前" : "元服前";
        if (busho.isDaimyo) return "大名";
        if (busho.isGunshi) return "軍師";
        const isLegionCommander = busho.isCommander || !!(game && game.legions && game.legions.some(l => Number(l.commanderId) === Number(busho.id)));
        if (busho.status === S.ACTIVE && isLegionCommander) return "国主";
        if (busho.isCastellan) return "城主";
        if ((busho.belongKunishuId || 0) > 0) {
            const kunishu = game && game.kunishuSystem ? game.kunishuSystem.getKunishu(busho.belongKunishuId) : null;
            if (kunishu && Number(kunishu.leaderId) === Number(busho.id)) return "頭領";
            return "諸勢力";
        }
        if (busho.status === S.RONIN) return "浪人";
        return "武将";
    }
}

window.StatPresenter = StatPresenter;
