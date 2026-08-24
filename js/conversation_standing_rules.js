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

        return {
            roleDiff,
            courtRelation,
            achievementRelation,
            deferenceLevel,
            targetSpecial,
            speakerSpecial,
            thirdPerson,
            guardedThirdPerson
        };
    }

    static _getFamilyName(busho) {
        if (!busho) return '';
        return String(busho.familyNameStr || busho.familyName || '').trim();
    }

    static _getGivenName(busho) {
        if (!busho) return '';
        return String(busho.givenName || '').trim();
    }

    static _getFullName(busho) {
        if (!busho) return '';
        const fullName = String(busho.fullName || busho.name || '').replace(/\|/g, '').trim();
        if (fullName) return fullName;
        return `${this._getFamilyName(busho)}${this._getGivenName(busho)}`.trim();
    }

    static areFamily(a, b) {
        if (!a || !b) return false;
        if (Number(a.id) > 0 && Number(a.id) === Number(b.id)) return true;
        const aFamily = Array.isArray(a.familyIds) ? a.familyIds.map(Number) : [];
        const bFamily = Array.isArray(b.familyIds) ? b.familyIds.map(Number) : [];
        if (!aFamily.length || !bFamily.length) return false;
        const bSet = new Set(bFamily);
        return aFamily.some(id => bSet.has(Number(id)));
    }

    static _getBusho(game, id) {
        const targetId = Number(id) || 0;
        if (!game || targetId <= 0) return null;
        if (typeof game.getBusho === 'function') return game.getBusho(targetId) || null;
        return Array.isArray(game.bushos)
            ? game.bushos.find(b => Number(b && b.id) === targetId) || null
            : null;
    }

    /**
     * adoptiveFatherId は養父・義父だけでなく、武将として登録された母親の参照にも使われる。
     * ここでは subject から target への直接関係だけを扱い、target.female なら母、それ以外は義父と解釈する。
     * adoptiveFatherId から兄弟・祖父などの派生関係は推論しない。
     */
    static getAdoptiveParentRelation(subject, target) {
        if (!subject || !target) return 'none';
        const targetId = Number(target.id) || 0;
        if (targetId <= 0 || Number(subject.adoptiveFatherId) !== targetId) return 'none';
        return target.female === true ? 'mother' : 'adoptive_father';
    }

    /**
     * 面談の会話文で使う、話者本人から見た近親関係。
     * adoptiveFatherId の直接関係を先に見てから、realFatherId 系の確実な血縁へフォールバックする。
     */
    static getSpeakerFamilyDialogueRelation(game, speaker, target) {
        const adoptive = this.getAdoptiveParentRelation(speaker, target);
        if (adoptive !== 'none') return adoptive;
        return this.getPaternalRelation(game, speaker, target);
    }

    /**
     * realFatherId だけを正本として、subject から見た target の実父系血縁を返す。
     * realMotherId は養父用途と混在するため、会話の血縁判定には使わない。
     */
    static getPaternalRelation(game, subject, target) {
        if (!subject || !target) return 'none';
        const subjectId = Number(subject.id) || 0;
        const targetId = Number(target.id) || 0;
        if (subjectId <= 0 || targetId <= 0 || subjectId === targetId) return 'none';

        const subjectFatherId = Number(subject.realFatherId) || 0;
        const targetFatherId = Number(target.realFatherId) || 0;
        if (subjectFatherId === targetId) return 'father';
        if (targetFatherId === subjectId) return 'son';

        if (subjectFatherId > 0 && subjectFatherId === targetFatherId) {
            const subjectBirth = Number(subject.birthYear);
            const targetBirth = Number(target.birthYear);
            if (Number.isFinite(subjectBirth) && Number.isFinite(targetBirth) && subjectBirth !== targetBirth) {
                return targetBirth < subjectBirth ? 'older_brother' : 'younger_brother';
            }
        }

        const subjectFather = this._getBusho(game, subjectFatherId);
        if (subjectFather && Number(subjectFather.realFatherId) === targetId) return 'grandfather';

        // 父方の伯父・叔父は、subject の実父と target が同じ実父を持つ兄弟かどうかで判定する。
        // birthYear が同年・不明で上下を確定できない場合は誤判定を避けて通常呼称へ戻す。
        if (subjectFather && targetFatherId > 0 && Number(subjectFather.realFatherId) === targetFatherId) {
            const fatherBirth = Number(subjectFather.birthYear);
            const targetBirth = Number(target.birthYear);
            if (Number.isFinite(fatherBirth) && Number.isFinite(targetBirth) && fatherBirth !== targetBirth) {
                return targetBirth < fatherBirth ? 'older_uncle' : 'younger_uncle';
            }
        }

        const targetFather = this._getBusho(game, targetFatherId);
        if (targetFather && Number(targetFather.realFatherId) === subjectId) return 'grandson';
        return 'none';
    }

    /**
     * 面談で本人が当主へ直接呼びかける時の血縁呼称。
     * 直接の家族呼称は官位・身分より優先し、父・兄・祖父・父方の伯父/叔父を簡潔に扱う。
     */
    static getDirectFamilyCallName(game, speaker, addressee) {
        const relation = this.getSpeakerFamilyDialogueRelation(game, speaker, addressee);
        if (relation === 'mother') return '母上';
        if (relation === 'adoptive_father') return '義父上';
        if (relation === 'father') return '父上';
        if (relation === 'older_brother') return '兄上';
        if (relation === 'grandfather') return '祖父上';
        if (relation === 'older_uncle') return '伯父上';
        if (relation === 'younger_uncle') return '叔父上';
        return null;
    }

    /**
     * 面談で第三者が「質問者から見た親族」に言及する時の呼称。
     * 官位呼びより下位の規則として使い、隠し数値ではなく関係性を自然に匂わせる。
     */
    static getRelativeReferenceCallName(game, questioner, target) {
        const relation = this.getPaternalRelation(game, questioner, target);
        if (relation === 'father') return '御父君';
        if (relation === 'son') return '御子息様';
        if (relation === 'older_brother') return '御兄上';
        if (relation === 'younger_brother') return '御舎弟';
        if (relation === 'grandfather') return '御祖父君';
        if (relation === 'grandson') return 'お孫様';
        if (relation === 'older_uncle') return '御伯父上';
        if (relation === 'younger_uncle') return '御叔父上';
        return null;
    }

    /**
     * 面談の「他者について」で、話者本人から見た実父系血縁を呼称へ反映する。
     * 父・兄・祖父・父方の伯父/叔父は官位より家族呼称を優先する。弟・子・孫は、官位持ちなら
     * 官位名を敬称なしで呼び、無官なら諱を呼び捨てにして家族内の距離感を出す。
     */
    static getSpeakerFamilyReferenceCallName(game, speaker, target) {
        const relation = this.getSpeakerFamilyDialogueRelation(game, speaker, target);
        if (relation === 'mother') return '母上';
        if (relation === 'adoptive_father') return '義父上';
        if (relation === 'father') return '父上';
        if (relation === 'older_brother') return '兄上';
        if (relation === 'grandfather') return '祖父上';
        if (relation === 'older_uncle') return '伯父上';
        if (relation === 'younger_uncle') return '叔父上';
        if (!['younger_brother', 'son', 'grandson'].includes(relation)) return null;

        const special = this.getSpecialAuthority(game, target);
        if (special.key === 'shogun') return '公方様';

        const rank = this.getHighestCourtRank(game, target);
        if (rank) return String(rank.rankName2 || '').trim() || this._getGivenName(target) || this._getFullName(target);
        return this._getGivenName(target) || this._getFullName(target) || 'その者';
    }

    /**
     * 無官の人物を会話中でどう呼ぶかを一元管理する。
     * 原則は姓呼び。同姓同士だけ識別を補い、一門なら諱、一門でなければフルネームにする。
     */
    static getUnrankedCallName(speaker, target, suffix = '殿') {
        if (!target) return `その方${suffix}`;
        const family = this._getFamilyName(target);
        const given = this._getGivenName(target);
        const full = this._getFullName(target) || family || given || 'その方';
        const speakerFamily = this._getFamilyName(speaker);
        const sameSurname = !!speakerFamily && !!family && speakerFamily === family;

        if (sameSurname) {
            if (this.areFamily(speaker, target) && given) return `${given}${suffix}`;
            return `${full}${suffix}`;
        }
        if (family) return `${family}${suffix}`;
        return `${full}${suffix}`;
    }

    static getDiplomaticCallName(game, busho, speaker = null) {
        if (!busho) return '殿';
        const special = this.getSpecialAuthority(game, busho);
        if (special.key === 'shogun') return '公方様';

        const rank = this.getHighestCourtRank(game, busho);
        if (special.key === 'shogun_candidate' && rank) {
            return `${rank.rankName2 || '左馬頭'}様`;
        }
        if (rank) return `${rank.rankName2}殿`;

        return this.getUnrankedCallName(speaker, busho, '殿');
    }

    static getInterviewTargetCallName(game, speaker, target, questioner = null) {
        if (!target) return 'その方';

        // 答える本人にとっての実父系血縁を最優先する。
        // ただし年少側（弟・子・孫）は官位があれば官位名、無官なら諱を敬称なしで呼ぶ。
        const speakerFamilyCall = this.getSpeakerFamilyReferenceCallName(game, speaker, target);
        if (speakerFamilyCall) return speakerFamilyCall;

        const standing = this.getPersonalStanding(game, speaker, target);
        const special = standing.targetSpecial;
        if (special.key === 'shogun') return '公方様';

        const rank = this.getHighestCourtRank(game, target);
        if (special.key === 'shogun_candidate' && rank) return `${rank.rankName2 || '左馬頭'}様`;
        if (rank) return `${rank.rankName2}殿`;

        const actualQuestioner = questioner || (game && typeof game.getClanDaimyo === 'function'
            ? game.getClanDaimyo(Number(game.playerClanId) || Number(speaker && speaker.clan) || 0)
            : null);
        const relativeCall = this.getRelativeReferenceCallName(game, actualQuestioner, target);
        if (relativeCall) return relativeCall;

        // 無官の軍師は、質問者・話者どちらの一門でもない時だけ役職名で呼ぶ。
        // 大名家の血縁者や話者本人の一門なら、血縁・一門側の呼称を優先する。
        if (target.isGunshi
            && !this.areFamily(actualQuestioner, target)
            && !this.areFamily(speaker, target)) {
            return '軍師殿';
        }

        // 面談で第三者が当主と同姓の無官武将を指す時に「織田殿」等とすると、
        // 質問者である当主自身を指しているように聞こえる。より優先される続柄・役職呼称が
        // ない場合は、当主との一門関係にかかわらずフルネームで識別する。
        const questionerFamily = this._getFamilyName(actualQuestioner);
        const targetFamily = this._getFamilyName(target);
        if (questionerFamily && targetFamily && questionerFamily === targetFamily
            && Number(actualQuestioner && actualQuestioner.id) !== Number(target.id)) {
            const full = this._getFullName(target);
            if (full) return `${full}殿`;
        }

        return this.getUnrankedCallName(speaker, target, '殿');
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
