/**
 * stat_presenter.js
 * 能力値などの表示専用フォーマッタ。
 * ゲーム計算からHTML生成を分離する。
 */
class StatPresenter {
    static toGradeHTML(val) {
        let base = "", sub = "", cls = "";
        if (val >= 110) { base = "S"; sub = "+"; cls = "rank-s"; } 
        else if (val >= 100) { base = "S"; sub = "";  cls = "rank-s"; }
        else if (val >= 90) { base = "A"; sub = "+"; cls = "rank-a"; } 
        else if (val >= 80) { base = "A"; sub = "";  cls = "rank-a"; }
        else if (val >= 70) { base = "B"; sub = "+"; cls = "rank-b"; } 
        else if (val >= 60) { base = "B"; sub = "";  cls = "rank-b"; }
        else if (val >= 50) { base = "C"; sub = "+"; cls = "rank-c"; } 
        else if (val >= 40) { base = "C"; sub = "";  cls = "rank-c"; }
        else if (val >= 30) { base = "D"; sub = "+"; cls = "rank-d"; } 
        else if (val >= 20) { base = "D"; sub = "";  cls = "rank-d"; }
        else if (val >= 10) { base = "E"; sub = "+"; cls = "rank-e"; } 
        else { base = "E"; sub = ""; cls = "rank-e"; }

        return `
            <span class="grade-container ${cls}">
                <span class="grade-main">${base}</span>
                <span class="grade-sub">${sub}</span>
            </span>`;
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
