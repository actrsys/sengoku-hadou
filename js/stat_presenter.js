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
}

window.StatPresenter = StatPresenter;
