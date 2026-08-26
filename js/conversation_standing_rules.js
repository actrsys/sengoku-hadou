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
        const shogunId = Number(game.courtRankSystem.RANK_ID_SHOGUN);
        if (ids.includes(shogunId)) {
            return { level: 3, key: 'shogun', rankId: shogunId };
        }
        const candidates = Array.isArray(game.courtRankSystem.RANK_IDS_CANDIDATE)
            ? game.courtRankSystem.RANK_IDS_CANDIDATE.map(Number)
            : [];
        const candidateId = candidates.find(id => ids.includes(id));
        if (candidateId !== undefined) {
            return { level: 2, key: 'shogun_candidate', rankId: Number(candidateId) };
        }
        return { level: 0, key: 'none', rankId: 0 };
    }

    static getSpecialAuthorityCallName(game, busho) {
        const special = this.getSpecialAuthority(game, busho);
        if (special.key === 'shogun') return '公方様';
        if (special.key === 'shogun_candidate') {
            const rank = game && game.courtRankSystem && typeof game.courtRankSystem.getRankData === 'function'
                ? game.courtRankSystem.getRankData(Number(special.rankId))
                : null;
            return `${(rank && rank.rankName2) || '左馬頭'}様`;
        }
        return null;
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
    static getAdoptiveFamilyDialogueRelation(subject, target) {
        if (!subject || !target) return 'none';
        const subjectId = Number(subject.id) || 0;
        const targetId = Number(target.id) || 0;
        if (subjectId <= 0 || targetId <= 0 || subjectId === targetId) return 'none';

        // 子→adoptiveFatherId の直接参照は、参照先の性別で母／義父を判定する。
        if (Number(subject.adoptiveFatherId) === targetId) {
            return target.female === true ? 'mother' : 'adoptive_father';
        }
        // 逆向きは「その人物が自分を親として参照している」という直接関係だけを見る。
        // 養父・義父・武将母のいずれでも、親側からは年少の子として扱う。
        if (Number(target.adoptiveFatherId) === subjectId) return 'adoptive_child';
        return 'none';
    }

    /**
     * 直接会話で使う、話者本人から見た近親関係。
     * adoptiveFatherId は直接関係だけを扱い、realFatherId 系の確実な血縁へフォールバックする。
     */
    static getSpeakerFamilyDialogueRelation(game, speaker, target) {
        const adoptive = this.getAdoptiveFamilyDialogueRelation(speaker, target);
        if (adoptive !== 'none') return adoptive;
        return this.getPaternalRelation(game, speaker, target);
    }

    /**
     * realFatherId だけを正本として、subject から見た target の実父系血縁を返す。
     * realMotherId は princess.csv 側の人物参照なので、武将同士の直接会話判定には使わない。
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

        // 伯父・叔父側から甥・姪を見る逆方向。target の実父が subject の実兄弟なら、
        // subject から見た target は年少の傍系親族として扱う。
        // 性別で呼称を分ける用途ではないため、会話上は sibling_child にまとめる。
        if (targetFather && subjectFatherId > 0
            && Number(targetFather.realFatherId) === subjectFatherId
            && Number(targetFather.id) !== subjectId) {
            return 'sibling_child';
        }
        return 'none';
    }

    /**
     * 面談で本人が当主へ直接呼びかける時の血縁呼称。
     * 直接の家族呼称は官位・身分より優先し、父・兄・祖父・父方の伯父/叔父を簡潔に扱う。
     */
    static isSeniorFamilyRelation(relation) {
        return ['mother', 'adoptive_father', 'father', 'older_brother', 'grandfather', 'older_uncle', 'younger_uncle'].includes(relation);
    }

    static isYoungerFamilyRelation(relation) {
        return ['younger_brother', 'son', 'grandson', 'adoptive_child', 'sibling_child'].includes(relation);
    }

    static isDirectFamilyRelation(relation) {
        return this.isSeniorFamilyRelation(relation) || this.isYoungerFamilyRelation(relation);
    }

    /**
     * 面談で、話者が当主に対してどの距離感で話すかを返す。
     * 血縁と官位を一つの「格スコア」にはせず、家族としての立場を先に判定し、
     * 血縁がない場合だけ公的格式を見る。
     */
    static getDaimyoSpeakerPosture(game, speaker, daimyo) {
        const relation = this.getSpeakerFamilyDialogueRelation(game, speaker, daimyo);

        // 話者が当主の父・祖父・実兄・武将母・義父に当たる場合。
        if (['son', 'younger_brother', 'grandson', 'adoptive_child'].includes(relation)) {
            return { key: 'senior_close', relation };
        }

        // 話者が当主の伯父・叔父に当たる場合。
        if (relation === 'sibling_child') {
            return { key: 'senior_extended', relation };
        }

        // 家族呼称が成立する関係では、官位による上下より家族としての距離感を優先する。
        if (this.isDirectFamilyRelation(relation)) {
            return { key: 'family_other', relation };
        }

        // 将軍・左馬頭（将軍候補）は通常官位ランクとは別の特殊権威。
        // 話し相手が特殊権威を持つ時は、こちらの通常官位が上でも上位者口調へ反転させない。
        // 左馬頭はrankNoだけを見ると下位になり得るため、必ず通常官位比較より先に処理する。
        const special = this.getSpecialAuthority(game, speaker);
        const addresseeSpecial = this.getSpecialAuthority(game, daimyo);
        if (addresseeSpecial.level >= 2 && special.level < addresseeSpecial.level) {
            return { key: 'normal', relation: 'none', respectsSpecialAuthority: addresseeSpecial.key };
        }
        if (special.level >= 2) {
            return { key: 'higher_court', relation: 'none', specialAuthority: special.key };
        }

        // その他の人物は、本人の官位が当主より上なら少し上位者らしい口調を許す。
        if (this.compareCourtStanding(game, speaker, daimyo) > 0) {
            return { key: 'higher_court', relation: 'none' };
        }

        return { key: 'normal', relation: relation || 'none' };
    }

    // 旧名は面談側の公開入口として維持するが、判定の正本は会話全体で使える名称へ移す。
    static getInterviewSpeakerPosture(game, speaker, daimyo) {
        return this.getDaimyoSpeakerPosture(game, speaker, daimyo);
    }

    static usesIndependentDaimyoRegister(game, speaker, daimyo) {
        const posture = this.getDaimyoSpeakerPosture(game, speaker, daimyo);
        return ['senior_close', 'senior_extended', 'higher_court'].includes(posture.key);
    }

    /**
     * 当主に対して家中年長者・高格式者が話す時の常体レジスター。
     * 面談と軍師助言で同じ変換を使い、「誰について話すか」による敬意とは分離する。
     */
    static applyIndependentDaimyoRegister(text) {
        let result = String(text || '');
        const replacements = [
            [/^恐れながら、/, ''],
            [/^恐れながら申し上げます。/, ''],
            [/^はい。/, ''],
            [/某から詳しく申し上げることはございませぬ/g, '詳しく言うことはない'],
            [/某から申し上げるほどのことはございませぬ/g, '特に言うほどのことはない'],
            [/某から申し上げることはございませぬ/g, '言うことはない'],
            [/申し上げるほどのことはございませぬ/g, '言うほどのことはない'],
            [/申し上げることはございませぬ/g, '言うことはない'],
            [/申し上げる/g, '言う'],
            [/申せませぬ/g, '言えぬ'],
            [/ございませぬ/g, 'ない'],
            [/ございます/g, 'ある'],
            [/ありませぬ/g, 'ない'],
            [/合いませぬ/g, '合わぬ'],
            [/交わしませぬ/g, '交わさぬ'],
            [/見せませぬ/g, '見せぬ'],
            [/見当たりませぬ/g, '見当たらぬ'],
            [/聞きませぬ/g, '聞かぬ'],
            [/聞きます/g, '聞く'],
            [/意気投合します/g, '意気投合する'],
            [/と見ます/g, 'と見る'],
            [/存じませぬ/g, '知らぬ'],
            [/ことと存じます/g, 'ことだろう'],
            [/かと存じます/g, 'と思う'],
            [/存じます/g, '思う'],
            [/おられます/g, 'おられる'],
            [/おりませぬ/g, 'おらぬ'],
            [/おります/g, 'おる'],
            [/いたしませぬ/g, 'せぬ'],
            [/いたします/g, 'する'],
            [/読み切れませぬ/g, '読み切れぬ'],
            [/分かりませぬ/g, '分からぬ'],
            [/分かりかねます/g, '分からぬ'],
            [/見受けられます/g, '見える'],
            [/見えませぬ/g, '見えぬ'],
            [/見えます/g, '見える'],
            [/望めませぬ/g, '望めぬ'],
            [/油断はなりませぬ/g, '油断は禁物だ'],
            [/ありますまい/g, 'あるまい'],
            [/なさらぬ/g, 'せぬ'],
            [/お気をつけください/g, '気をつけた方がよい'],
            [/おやめください/g, 'やめておいた方がよい'],
            [/お忘れなく/g, '忘れぬようにな'],
            [/かもしれません/g, 'かもしれぬ'],
            [/につきまして/g, 'について'],
            [/べきかと(?=[！!？?]|$)/g, 'べきだろう'],
            [/られましょう/g, 'られるだろう'],
            [/ご配慮を賜りたく思う/g, '配慮してもらいたい'],
            [/ご配慮を賜りたく存じます/g, '配慮してもらいたい'],
            [/ご配慮いただければ幸いにある/g, 'もう少し配慮してもらえればありがたい'],
            [/ご配慮いただければ幸いにございます/g, 'もう少し配慮してもらえればありがたい'],
            [/どうか早めのご配慮を/g, '早めに手を打った方がよい'],
            [/今のうちにお取り計らいを/g, '今のうちに手を打った方がよい'],
            [/某にも/g, ''],
            [/ありません/g, 'ない'],
            [/よろしいでしょう/g, 'よいだろう'],
            [/よろしいかと/g, 'よいと思う'],
            [/よろしい/g, 'よい'],
            [/べきかと見ておる/g, 'べきと見ておる'],
            [/候補かと見ておる/g, '候補と見ておる'],
            [/べきかと考えておる/g, 'べきだと考えておる'],
            [/肝要かと思う/g, '肝要だと思う'],
            [/気を配るべきかと。/g, '気を配るべきだろう。'],
            [/放っておくのは危ういかと。/g, '放っておくのは危ういだろう。'],
            [/べきかと。/g, 'べきだろう。'],
            [/ことかと。/g, 'ことだろう。'],
            [/との話です/g, 'との話だ'],
            [/でしょう/g, 'だろう'],
            [/ようです/g, 'ようだ'],
            [/そうです/g, 'そうだ'],
            [/ところです/g, 'ところだ'],
            [/御仁です/g, '御仁だ'],
            [/評判です/g, '評判だ'],
            [/耳にしました/g, '耳にした'],
            [/動けましょう/g, '動けるだろう'],
            [/ですな/g, 'だな'],
            [/です(?=[。！？]|$)/g, 'だ'],
            [/あります/g, 'ある']
        ];
        for (const [pattern, replacement] of replacements) result = result.replace(pattern, replacement);
        return result;
    }

    /**
     * 忠誠値を会話でどう言い換えるか。判定値自体は LoyaltyInsightRules のまま、
     * 一門と特殊権威だけ通常家臣の「忠義」表現から外す。
     */
    static getLoyaltyExpressionStyle(game, questioner, target) {
        const special = this.getSpecialAuthority(game, target);
        if (special && Number(special.level || 0) >= 2) return 'authority';
        if (questioner && target && this.areFamily(questioner, target)) return 'family';
        return 'fealty';
    }

    /**
     * 当主より上位の公的格式を持つ話者が、面談で当主へ呼びかけるための呼称。
     * 通常の家臣用「殿」だけにせず、官位・姓を含む既存の外交呼称規則を再利用する。
     */
    static getInterviewDaimyoCallName(game, speaker, daimyo) {
        const familyCall = this.getDirectFamilyCallName(game, speaker, daimyo);
        if (familyCall) return familyCall;
        const special = this.getSpecialAuthority(game, speaker);
        if (special.level >= 2 || this.compareCourtStanding(game, speaker, daimyo) > 0) {
            return this.getDiplomaticCallName(game, daimyo, speaker);
        }
        return '殿';
    }

    /**
     * 当主の父・祖父・兄など「家中の年長者」が、自分より明確に格下の家臣を評する時の呼称。
     * 高官・特殊権威を持つ相手には使わず、通常の格式判定を優先する。
     */
    static getHouseholdElderTargetCallName(game, speaker, target) {
        if (!target) return 'その者';
        const special = this.getSpecialAuthority(game, target);
        if (special.key === 'shogun') return '公方様';
        const rank = this.getHighestCourtRank(game, target);
        if (rank) return String(rank.rankName2 || '').trim() || this._getGivenName(target) || this._getFullName(target);
        if (target.isGunshi) return '軍師';
        const family = this._getFamilyName(target);
        const given = this._getGivenName(target);
        const full = this._getFullName(target);
        const speakerFamily = this._getFamilyName(speaker);
        if (family && speakerFamily && family === speakerFamily) return full || given || family;
        return family || full || given || 'その者';
    }

    static _getYoungerFamilyCallName(game, target) {
        if (!target) return null;
        const special = this.getSpecialAuthority(game, target);
        if (special.key === 'shogun') return '公方様';
        const rank = this.getHighestCourtRank(game, target);
        if (rank) return String(rank.rankName2 || '').trim() || this._getGivenName(target) || this._getFullName(target);
        return this._getGivenName(target) || this._getFullName(target) || null;
    }

    static getDirectFamilyCallName(game, speaker, addressee) {
        const relation = this.getSpeakerFamilyDialogueRelation(game, speaker, addressee);
        if (relation === 'mother') return '母上';
        if (relation === 'adoptive_father') return '義父上';
        if (relation === 'father') return '父上';
        if (relation === 'older_brother') return '兄上';
        if (relation === 'grandfather') return '祖父上';
        if (relation === 'older_uncle') return '伯父上';
        if (relation === 'younger_uncle') return '叔父上';
        if (this.isYoungerFamilyRelation(relation)) {
            return this._getYoungerFamilyCallName(game, addressee);
        }
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
        if (relation === 'older_brother') return '御兄君';
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
        if (!this.isYoungerFamilyRelation(relation)) return null;
        return this._getYoungerFamilyCallName(game, target) || 'その者';
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
        // 外交でも本人同士の近親呼称を最優先する。敵対・友好や官位は口調の温度へ残し、
        // 家族なのに「参議殿」等へ戻る違和感を避ける。
        if (speaker) {
            const familyCall = this.getDirectFamilyCallName(game, speaker, busho);
            if (familyCall) return familyCall;
        }
        const specialCall = this.getSpecialAuthorityCallName(game, busho);
        if (specialCall) return specialCall;

        const rank = this.getHighestCourtRank(game, busho);
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
        const specialCall = this.getSpecialAuthorityCallName(game, target);
        if (specialCall) return specialCall;

        const rank = this.getHighestCourtRank(game, target);
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

    static getAchievementHint(standing, context = null) {
        if (!standing) return '';
        const achievementRelation = Number(standing.achievementRelation || 0);
        const specialLevel = Number(standing.targetSpecial && standing.targetSpecial.level || 0);

        // 将軍・左馬頭（将軍候補）は、所属家での「働き」を褒める通常家臣向けの功績表現へ落とさない。
        // 功績差が会話へ滲む場面でも、本人の公的格式と周囲からの敬意を示す言い方へ置き換える。
        if (specialLevel >= 2 && achievementRelation >= 1) {
            return '家中でも一目置かれております。';
        }

        // 当主の父・祖父・兄など年長近親者を、普通の家臣と同じ「働き」で査定する言い方は避ける。
        // 数値は見せず、家中での重み・信頼として功績の高さを匂わせる。
        const game = context && context.game;
        const questioner = context && context.questioner;
        const target = context && context.target;
        if (game && questioner && target && achievementRelation >= 1) {
            const relation = this.getSpeakerFamilyDialogueRelation(game, questioner, target);
            if (['mother', 'adoptive_father', 'father', 'older_brother', 'grandfather'].includes(relation)) {
                if (achievementRelation >= 2) {
                    return '家中でも、お言葉に重みのあるお方です。';
                }
                return '家中でも重きをなしておられます。';
            }
            if (['older_uncle', 'younger_uncle'].includes(relation)) {
                if (achievementRelation >= 2) {
                    return '家中でも一目置かれております。';
                }
                return '家中でも頼りにされております。';
            }
        }

        if (achievementRelation >= 2) return 'その働きは家中でも知られております。';
        if (achievementRelation === 1) return 'これまでの働きも、よく耳にしております。';
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
        const senderToReceiverFamilyRelation = this.getSpeakerFamilyDialogueRelation(game, envoy, receiverDaimyo);
        const receiverToSenderFamilyRelation = this.getSpeakerFamilyDialogueRelation(game, receiverDaimyo, envoy);
        // 挨拶だけでなく外交の本題・承諾・拒否まで同じ話者距離を通す。
        // 「誰に話しているか」と「相手の格式」を分け、親族・特殊権威・高官の口調を途中で失わない。
        const senderSpeakerPosture = this.getDaimyoSpeakerPosture(game, envoy, receiverDaimyo);
        const receiverSpeakerPosture = this.getDaimyoSpeakerPosture(game, receiverDaimyo, envoy);

        return {
            clanStanding,
            personal,
            senderDaimyo,
            receiverDaimyo,
            envoySpecial,
            envoyOutranksLord,
            receiverDeferenceLevel,
            senderDeferenceLevel,
            senderToReceiverFamilyRelation,
            receiverToSenderFamilyRelation,
            senderSpeakerPosture,
            receiverSpeakerPosture
        };
    }
}

window.ConversationStandingRules = ConversationStandingRules;
