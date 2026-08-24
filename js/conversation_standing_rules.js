/**
 * conversation_standing_rules.js
 * 会話上の「人物・大名家の格」を一元管理する。
 * 身分・官位・功績・大名家の威信は別軸で保持し、台詞側が必要な軸だけ参照する。
 */
class ConversationStandingRules {
    static _config() {
        return window.MainParams.ConversationStanding;
    }

    static getHighestCourtRank(game, busho) {
        if (!game || !game.courtRankSystem || !busho) return null;
        if (typeof game.courtRankSystem.getHighestRankData === 'function') {
            return game.courtRankSystem.getHighestRankData(busho);
        }
        const ids = Array.isArray(busho.courtRankIds) ? busho.courtRankIds : [];
        const ranks = ids.map(id => game.courtRankSystem.getRankData(id)).filter(Boolean);
        if (!ranks.length) return null;
        ranks.sort((a, b) => Number(a.rankNo || 999) - Number(b.rankNo || 999));
        return ranks[0];
    }

    static getSpecialAuthority(game, busho) {
        if (!game || !game.courtRankSystem || !busho) return { level: 0, key: 'none' };
        const ids = Array.isArray(busho.courtRankIds) ? busho.courtRankIds.map(Number) : [];
        if (ids.includes(Number(game.courtRankSystem.RANK_ID_SHOGUN))) {
            return { level: 3, key: 'shogun' };
        }
        const candidates = Array.isArray(game.courtRankSystem.RANK_IDS_CANDIDATE)
            ? game.courtRankSystem.RANK_IDS_CANDIDATE.map(Number)
            : [];
        if (candidates.some(id => ids.includes(id))) {
            return { level: 2, key: 'shogun_candidate' };
        }
        return { level: 0, key: 'none' };
    }

    static getClanRoleRank(game, busho) {
        if (!busho) return 0;
        if (window.BushoListSortRules && typeof window.BushoListSortRules.getClanRank === 'function') {
            return Number(window.BushoListSortRules.getClanRank(game, busho) || 0);
        }
        if (busho.isDaimyo) return 8;
        if (busho.isGunshi) return 7;
        if (busho.isCommander) return 6;
        if (busho.isCastellan) return 5;
        return 4;
    }

    static compareCourtStanding(game, a, b) {
        // 戻り値は「aの方が上」なら正、「bの方が上」なら負。
        const sa = this.getSpecialAuthority(game, a);
        const sb = this.getSpecialAuthority(game, b);
        // 征夷大将軍だけは通常官位とは別格。左馬頭（将軍候補）は人物への礼遇では特別扱いするが、
        // 大名家同士の官位比較そのものは既存rankNoに従う。
        if (sa.key === 'shogun' && sb.key !== 'shogun') return 1;
        if (sb.key === 'shogun' && sa.key !== 'shogun') return -1;

        const ra = this.getHighestCourtRank(game, a);
        const rb = this.getHighestCourtRank(game, b);
        if (ra && rb) {
            const an = Number(ra.rankNo || 999);
            const bn = Number(rb.rankNo || 999);
            if (an !== bn) return Math.sign(bn - an); // rankNoが小さい側が上
            return 0;
        }
        if (ra && !rb) return 1;
        if (!ra && rb) return -1;
        return 0;
    }

    static compareAchievement(a, b) {
        // 戻り値は「aの方が功績上」なら正。大差だけを会話へ使う。
        const cfg = this._config();
        const mild = Number(cfg.AchievementRespectGap);
        const strong = Number(cfg.AchievementStrongGap);
        const av = Number(a && a.achievementTotal || 0);
        const bv = Number(b && b.achievementTotal || 0);
        const diff = av - bv;
        if (diff >= strong) return 2;
        if (diff >= mild) return 1;
        if (diff <= -strong) return -2;
        if (diff <= -mild) return -1;
        return 0;
    }

    static getPersonalStanding(game, speaker, target) {
        const roleDiff = this.getClanRoleRank(game, target) - this.getClanRoleRank(game, speaker);
        const courtRelation = -this.compareCourtStanding(game, speaker, target); // target上位なら正
        const achievementRelation = -this.compareAchievement(speaker, target); // target上位なら正
        const targetSpecial = this.getSpecialAuthority(game, target);
        const speakerSpecial = this.getSpecialAuthority(game, speaker);

        let deferenceLevel = 0;
        if (targetSpecial.level >= 3) {
            deferenceLevel = 3;
        } else if (targetSpecial.level >= 2 && targetSpecial.level > speakerSpecial.level) {
            deferenceLevel = 3;
        } else {
            if (courtRelation > 0) deferenceLevel += 2;
            else if (courtRelation < 0) deferenceLevel -= 1;

            if (roleDiff >= 2) deferenceLevel += 2;
            else if (roleDiff === 1) deferenceLevel += 1;
            else if (roleDiff <= -2) deferenceLevel -= 1;

            if (achievementRelation >= 2) deferenceLevel += 1;
            else if (achievementRelation <= -2) deferenceLevel -= 1;

            deferenceLevel = Math.max(-1, Math.min(2, deferenceLevel));
        }

        const thirdPerson = deferenceLevel >= 2 ? 'あのお方' : (deferenceLevel < 0 ? 'あの者' : 'あの方');
        const guardedThirdPerson = deferenceLevel >= 1 ? 'あの方' : 'あやつ';
        const knowVerb = deferenceLevel >= 3
            ? 'よく存じ上げております'
            : (deferenceLevel >= 2 ? '存じ上げております' : (deferenceLevel === 1 ? 'よく存じております' : '存じております'));

        return {
            roleDiff,
            courtRelation,
            achievementRelation,
            deferenceLevel,
            targetSpecial,
            speakerSpecial,
            thirdPerson,
            guardedThirdPerson,
            knowVerb
        };
    }

    static getDiplomaticCallName(game, busho) {
        if (!busho) return '殿';
        const special = this.getSpecialAuthority(game, busho);
        if (special.key === 'shogun') return '公方様';

        const rank = this.getHighestCourtRank(game, busho);
        if (special.key === 'shogun_candidate' && rank) {
            return `${rank.rankName2 || '左馬頭'}様`;
        }
        if (rank) return `${rank.rankName2}殿`;

        let name = busho.givenName || '';
        if (!name && busho.name) name = String(busho.name).replace(/^[^|]*\|?/, '');
        if (!name) name = busho.fullName || '殿';
        return `${name}殿`;
    }

    static getInterviewTargetCallName(game, speaker, target) {
        if (!target) return 'その方';
        const standing = this.getPersonalStanding(game, speaker, target);
        const special = standing.targetSpecial;
        if (special.key === 'shogun') return '公方様';

        const rank = this.getHighestCourtRank(game, target);
        if (special.key === 'shogun_candidate' && rank) return `${rank.rankName2 || '左馬頭'}様`;
        if (rank) {
            const family = target.familyNameStr || (target.fullName ? String(target.fullName).slice(0, Math.max(0, String(target.fullName).length - String(target.givenName || '').length)) : '');
            return `${family || ''}${rank.rankName2}殿`;
        }
        return `${target.name || target.fullName || 'その方'}殿`;
    }

    static getAchievementHint(standing) {
        if (!standing) return '';
        if (Number(standing.achievementRelation || 0) >= 2) return 'その働きは、家中でもよく知られております。';
        if (Number(standing.achievementRelation || 0) === 1) return 'これまでの働きも、よく耳にしております。';
        return '';
    }

    static compareDaimyoClans(game, clanAId, clanBId) {
        // AがBより上なら overallRelation > 0。
        const clanA = game && typeof game.getClan === 'function' ? game.getClan(clanAId) : null;
        const clanB = game && typeof game.getClan === 'function' ? game.getClan(clanBId) : null;
        const daimyoA = game && typeof game.getClanDaimyo === 'function' ? game.getClanDaimyo(clanAId) : null;
        const daimyoB = game && typeof game.getClanDaimyo === 'function' ? game.getClanDaimyo(clanBId) : null;

        const formalRelation = this.compareCourtStanding(game, daimyoA, daimyoB);
        const rankA = this.getHighestCourtRank(game, daimyoA);
        const rankB = this.getHighestCourtRank(game, daimyoB);
        const specialA = this.getSpecialAuthority(game, daimyoA);
        const specialB = this.getSpecialAuthority(game, daimyoB);
        const sameCourtRank = !!rankA && !!rankB && Number(rankA.rankNo) === Number(rankB.rankNo)
            && (specialA.key === 'shogun') === (specialB.key === 'shogun');
        const bothUnranked = !rankA && !rankB
            && specialA.key !== 'shogun' && specialB.key !== 'shogun';

        let prestigeRelation = 0;
        if (formalRelation === 0 && (sameCourtRank || bothUnranked)) {
            const cfg = this._config();
            const mildRatio = Number(cfg.PrestigeMildRatio);
            const clearRatio = Number(cfg.PrestigeClearRatio);
            const ap = Math.max(1, Number(clanA && clanA.daimyoPrestige || 0));
            const bp = Math.max(1, Number(clanB && clanB.daimyoPrestige || 0));
            const ratio = ap / bp;
            if (ratio >= clearRatio) prestigeRelation = 2;
            else if (ratio >= mildRatio) prestigeRelation = 1;
            else if (ratio <= 1 / clearRatio) prestigeRelation = -2;
            else if (ratio <= 1 / mildRatio) prestigeRelation = -1;
        }

        const overallRelation = formalRelation !== 0 ? formalRelation : prestigeRelation;
        return { clanA, clanB, daimyoA, daimyoB, formalRelation, prestigeRelation, overallRelation };
    }

    static getDiplomacyContext(game, envoy, receiverDaimyo) {
        const senderClanId = Number(envoy && envoy.clan || 0);
        const receiverClanId = Number(receiverDaimyo && receiverDaimyo.clan || 0);
        const clanStanding = this.compareDaimyoClans(game, senderClanId, receiverClanId);
        const personal = this.getPersonalStanding(game, receiverDaimyo, envoy);
        const envoySpecial = this.getSpecialAuthority(game, envoy);
        const senderDaimyo = clanStanding.daimyoA;
        const envoyVsLordCourt = this.compareCourtStanding(game, envoy, senderDaimyo);

        let receiverDeferenceLevel = 0;
        if (envoySpecial.level >= 3) receiverDeferenceLevel = 3;
        else if (envoySpecial.level >= 2) receiverDeferenceLevel = 3;
        else {
            if (clanStanding.overallRelation >= 2) receiverDeferenceLevel += 2;
            else if (clanStanding.overallRelation === 1) receiverDeferenceLevel += 1;

            // 使者本人の家中での重みも「誰を寄越したか」という礼遇差に使う。
            // 大名との上下を逆転させるのではなく、同じ使者でも軍師・国主・城主なら少し丁重になる程度。
            const envoyRoleRank = this.getClanRoleRank(game, envoy);
            if (envoyRoleRank >= 7) receiverDeferenceLevel += 1;
            else if (envoyRoleRank >= 6 && clanStanding.overallRelation >= 0) receiverDeferenceLevel += 1;
            else if (envoyRoleRank >= 5 && clanStanding.overallRelation >= 1) receiverDeferenceLevel += 1;

            if (personal.deferenceLevel >= 2) receiverDeferenceLevel += 1;
            else if (personal.deferenceLevel === 1) receiverDeferenceLevel += 1;

            const cfg = this._config();
            const envoyAchievement = Number(envoy && envoy.achievementTotal || 0);
            if (envoyAchievement >= Number(cfg.AchievementLegendMin)) receiverDeferenceLevel += 1;
            else if (envoyAchievement >= Number(cfg.AchievementRenownMin) && clanStanding.overallRelation >= 0) receiverDeferenceLevel += 1;

            receiverDeferenceLevel = Math.min(2, receiverDeferenceLevel);
        }

        let senderDeferenceLevel = 0;
        if (clanStanding.overallRelation <= -2) senderDeferenceLevel = 2;
        else if (clanStanding.overallRelation === -1) senderDeferenceLevel = 1;
        if (this.getSpecialAuthority(game, receiverDaimyo).level >= 2) senderDeferenceLevel = Math.max(senderDeferenceLevel, 2);

        const envoyOutranksLord = envoySpecial.level > this.getSpecialAuthority(game, senderDaimyo).level
            || envoyVsLordCourt > 0;

        return {
            clanStanding,
            personal,
            senderDaimyo,
            receiverDaimyo,
            envoySpecial,
            envoyOutranksLord,
            receiverDeferenceLevel,
            senderDeferenceLevel
        };
    }
}

window.ConversationStandingRules = ConversationStandingRules;
