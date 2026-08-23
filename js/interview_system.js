/**
 * interview_system.js
 * 面談コマンドの進行・判定・台詞生成を担当する。
 * 表示とページ切替は InterviewView、人物関係の数値計算は PersonnelRules に委譲する。
 */
class InterviewSystem {
    constructor(game) {
        this.game = game;
        this.activeInterviewAttitude = null;
    }

    get view() {
        return this.game && this.game.ui ? this.game.ui.interviewView : null;
    }

    open() {
        if (!this.view) return;
        this.showInterviewerList();
    }

    close() {
        this.activeInterviewAttitude = null;
        if (this.view) this.view.close();
        if (this.game && this.game.ui) {
            this.game.ui.updatePanelHeader();
            this.game.ui.renderCommandMenu();
        }
    }

    _getInterviewCandidates(excludeId = null) {
        return (this.game.bushos || [])
            .filter(b => b.clan === this.game.playerClanId
                && window.BushoStatusRules.isActive(b)
                && !b.isDaimyo
                && (excludeId === null || Number(b.id) !== Number(excludeId)))
            .slice()
            .sort((a, b) => {
                const leadershipDiff = Number(b.leadership || 0) - Number(a.leadership || 0);
                if (leadershipDiff !== 0) return leadershipDiff;
                return Number(a.id || 0) - Number(b.id || 0);
            });
    }

    showInterviewerList() {
        if (!this.view) return;
        this.activeInterviewAttitude = null;
        const candidates = this._getInterviewCandidates();
        this.view.showInterviewerList(
            candidates,
            busho => this.startInterview(busho),
            () => this.close()
        );
    }

    startInterview(busho) {
        if (!busho || !this.view) return;

        // 面談へ入った瞬間の本心を基準に、その面談中の表面態度を一度だけ決める。
        // 以後の導入台詞も同じ態度を使い、挨拶だけ急に別人格になるのを防ぐ。
        this.activeInterviewAttitude = this._getSurfaceAttitude(busho);

        if (!busho.isInterviewed) {
            busho.loyalty = Math.min(100, Number(busho.loyalty || 0) + 1);
            busho.isInterviewed = true;
        }

        this.view.showMessages(
            busho,
            [this._getGreetingText(busho, this.activeInterviewAttitude)],
            () => this._continueInterviewAfterGreeting(busho),
            '面談'
        );
    }

    _continueInterviewAfterGreeting(busho) {
        if (this._shouldOfferDoctor(busho)) {
            this._showDoctorPrompt(busho);
            return;
        }
        this.showMainMenu(busho);
    }

    _getSurfaceAttitude(busho) {
        const concealment = this._getConcealmentProfile(busho);
        const shownBand = concealment.perceivedBand;
        const intelligence = Number(busho.intelligence || 0);
        const duty = Number(busho.duty || 0);
        const ambition = Number(busho.ambition || 0);

        // 挨拶も「表に見せている忠誠段階」を基準にする。
        // 智謀による偽装は1～2段階だけ持ち上げ、低忠誠から最高態度へ飛ばさない。
        if (shownBand === 'stable') {
            return concealment.actualLoyalty >= 92 || duty >= 75 || concealment.bandShift >= 2 || ambition >= 65
                ? 'welcoming'
                : 'friendly';
        }
        if (shownBand === 'warning') return duty >= 55 || concealment.isConcealing ? 'polite' : 'reserved';
        if (shownBand === 'danger') return duty >= 65 || concealment.isConcealing ? 'polite' : 'reserved';
        if (shownBand === 'dissatisfied') return duty >= 70 ? 'reserved' : 'cold';
        if (shownBand === 'serious') {
            if (!concealment.isConcealing && intelligence < 55 && duty < 55 && ambition >= 55) return 'startled';
            return duty >= 70 ? 'reserved' : 'cold';
        }
        if (intelligence < 65 && duty < 60) return 'startled';
        return 'cold';
    }

    _getGreetingText(busho, attitude = this.activeInterviewAttitude) {
        switch (attitude) {
            case 'welcoming':
                return '「これはこれは、殿！　よくぞお越しくださいました！」';
            case 'friendly':
                return '「殿、お越しくださいましたか。ささ、こちらへ」';
            case 'polite':
                return '「殿。わざわざお越しいただき、恐縮です」';
            case 'reserved':
                return '「……殿。お越しでしたか」';
            case 'startled':
                return '「げっ、殿……！　い、いえ、これは失礼を。どうぞ、お入りください」';
            default:
                return '「……殿。何かございましたか」';
        }
    }

    _getMenuPrompt(attitude = this.activeInterviewAttitude) {
        switch (attitude) {
            case 'welcoming':
                return '「殿、どうぞ何なりとお尋ねください！」';
            case 'friendly':
                return '「殿、何なりとお申し付けください」';
            case 'polite':
                return '「殿、どのようなご用件でしょうか」';
            case 'reserved':
                return '「……殿。ご用件を伺いましょう」';
            case 'startled':
                return '「……それで、殿。何のご用でしょうか」';
            default:
                return '「……何か、ご用でしょうか」';
        }
    }

    _getTopicOpening(target, attitude = this.activeInterviewAttitude) {
        const name = target && target.name ? target.name : 'その方';
        switch (attitude) {
            case 'welcoming':
            case 'friendly':
                return `${name}殿ですか。ええ、存じております。`;
            case 'reserved':
            case 'cold':
            case 'startled':
                return `……${name}殿について、ですか。`;
            default:
                return `${name}殿ですか……`;
        }
    }

    _shouldOfferDoctor(busho) {
        const currentYear = Number(this.game.year || 0);
        const doctorSourceId = 'interview:doctor';
        const lifeSystem = this.game.lifeSystem;
        const hasDoctorExtension = !!(lifeSystem && lifeSystem.hasLifespanModifier(busho, doctorSourceId));
        const hasBattleDeathExtension = !!(lifeSystem && lifeSystem.hasBattleDeathLifespanExtension(busho));
        return currentYear >= (Number(busho.endYear || 0) - 1)
            && !hasDoctorExtension
            && !hasBattleDeathExtension;
    }

    _showDoctorPrompt(busho) {
        const castle = this.game.getCurrentTurnCastle();
        this.view.showPrompt(
            busho,
            `${busho.name}は調子が悪そうだ。<br>医師に診せますか？<br>（消費：金２００）`,
            [
                {
                    label: '医師に診せる',
                    className: 'btn-primary',
                    onClick: () => {
                        if (!castle || Number(castle.gold || 0) < 200) {
                            this.view.showMessages(
                                busho,
                                ['金が足りないため、医師を呼べませんでした……'],
                                () => this.showMainMenu(busho),
                                '面談',
                                { narration: true }
                            );
                            return;
                        }

                        castle.gold -= 200;
                        const currentEndYear = Number(busho.endYear);
                        const currentDeathAge = currentEndYear - Number(busho.birthYear);
                        const targetEndYear = currentDeathAge < 55
                            ? Number(busho.birthYear) + 65
                            : currentEndYear + 10;
                        const extensionYears = targetEndYear - currentEndYear;
                        if (this.game.lifeSystem) {
                            this.game.lifeSystem.setLifespanModifier(busho, 'interview:doctor', extensionYears);
                        }

                        this.view.showMessages(
                            busho,
                            [`${busho.name}は少し顔色が良くなったようです。`],
                            () => this.close(),
                            '面談',
                            { narration: true }
                        );
                    }
                },
                {
                    label: '診せない',
                    className: 'btn-secondary',
                    onClick: () => this.showMainMenu(busho)
                }
            ],
            '面談',
            { narration: true }
        );
    }

    showMainMenu(busho) {
        if (!this.view) return;
        this.view.showMenu(
            busho,
            this._getMenuPrompt(),
            [
                { label: '調子はどうだ', onClick: () => this.executeInterviewStatus(busho) },
                { label: '他者について聞く', onClick: () => this.showTargetList(busho) }
            ],
            () => this.showInterviewerList()
        );
    }

    showTargetList(interviewer) {
        if (!this.view) return;
        const candidates = this._getInterviewCandidates(interviewer.id);
        this.view.showTargetList(
            interviewer,
            candidates,
            target => this.executeInterviewTopic(interviewer, target),
            () => this.showMainMenu(interviewer)
        );
    }

    executeInterviewStatus(busho) {
        const inno = Number(busho.innovation || 0);
        let policyText = '';
        if (inno > 80) policyText = '最近のやり方は少々古臭い気がしますな。もっと新しいことをせねば。';
        else if (inno < 20) policyText = '古き良き伝統を守ることこそ肝要です。';
        else policyText = '当家のやり方に特に不満はありません。順調です。';

        const concealment = this._getConcealmentProfile(busho);
        const loyaltyBand = concealment.perceivedBand;
        const loyaltyText = this._getSelfLoyaltyText(loyaltyBand, this.activeInterviewAttitude);
        const messages = [
            `「${policyText}」`,
            `「${loyaltyText}」`
        ];

        this.view.showMessages(busho, messages, () => this.showMainMenu(busho));
    }

    executeInterviewTopic(interviewer, target) {
        const relation = PersonnelRules.calcRelationshipProfile(interviewer, target);
        const opinionText = this._getOpinionText(relation.compatibilityScore);
        const contactText = this._getContactText(relation, interviewer);
        const loyaltyText = this._getTargetLoyaltyText(interviewer, target, relation);

        const messages = [
            `「${this._getTopicOpening(target)}${opinionText}」`,
            `「${contactText}」`,
            `「${loyaltyText}」`
        ];

        this.view.showMessages(interviewer, messages, () => this.showMainMenu(interviewer), '他者について聞く');
    }

    _getOpinionText(score) {
        if (score >= 82) return 'あの方とは意気投合します。信頼できる御仁です。';
        if (score >= 68) return '話のわかる相手です。信頼しております。';
        if (score >= 52) return '悪い方ではありません。意見が違うことはありますが。';
        if (score >= 36) return '考え方はあまり合いませぬ。ただ、務めは務めです。';
        return 'あやつとはどうにも反りが合いませぬ。';
    }

    _getContactText(relation, interviewer) {
        const contact = relation.contactScore;
        if (contact >= 70) return '普段からよく言葉を交わしております。';
        if (contact >= 52) return '必要な折には、よく話をしております。';
        if (contact >= 34) {
            if (relation.compatibilityScore >= 68) {
                return '信頼はしておりますが、普段はさほど話す機会がございませぬ。';
            }
            return '用向きがなければ、あまり言葉を交わしませぬ。';
        }
        if (relation.affinityDiff >= 42 && Number(interviewer.duty || 0) < 35 && Number(interviewer.ambition || 0) >= 65) {
            return 'あやつとは、普段ほとんど口をききませぬ。';
        }
        return '普段はほとんど言葉を交わしませぬ。';
    }

    _getLoyaltyBand(loyalty) {
        const value = Math.max(0, Math.min(100, Number(loyalty) || 0));
        const stableMin = Number(window.MainParams.Gunshi.AdviceLoyalty) + 1;
        const warningMin = Number(window.MainParams.Gunshi.DangerLoyalty) + 1;
        const I = window.MainParams.Interview;

        if (value >= stableMin) return 'stable';
        if (value >= warningMin) return 'warning';
        if (value >= I.LoyaltyDangerMin) return 'danger';
        if (value >= I.LoyaltyDissatisfiedMin) return 'dissatisfied';
        if (value >= I.LoyaltySeriousMin) return 'serious';
        return 'critical';
    }

    _shiftLoyaltyBand(band, steps) {
        const bands = ['critical', 'serious', 'dissatisfied', 'danger', 'warning', 'stable'];
        const index = bands.indexOf(band);
        if (index < 0) return band;
        const shift = Math.max(0, Math.floor(Number(steps) || 0));
        return bands[Math.min(bands.length - 1, index + shift)];
    }

    _getConcealmentProfile(busho) {
        const I = window.MainParams.Interview;
        const actualLoyalty = Math.max(0, Math.min(100, Number(busho.loyalty) || 0));
        const intelligence = Math.max(0, Math.min(100, Number(busho.intelligence) || 0));
        const actualBand = this._getLoyaltyBand(actualLoyalty);
        let requestedShift = 0;

        if (intelligence >= I.ConcealHighIntelligence) {
            requestedShift = I.ConcealHighBandShift;
        } else if (intelligence >= I.ConcealMidIntelligence) {
            requestedShift = I.ConcealMidBandShift;
        }

        const perceivedBand = this._shiftLoyaltyBand(actualBand, requestedShift);
        const bands = ['critical', 'serious', 'dissatisfied', 'danger', 'warning', 'stable'];
        const actualIndex = bands.indexOf(actualBand);
        const perceivedIndex = bands.indexOf(perceivedBand);
        const bandShift = Math.max(0, perceivedIndex - actualIndex);

        return {
            actualLoyalty,
            actualBand,
            perceivedBand,
            bandShift,
            isConcealing: bandShift > 0,
            level: bandShift >= 2 ? 'strong' : (bandShift === 1 ? 'moderate' : 'none')
        };
    }

    _getSelfLoyaltyText(band, attitude = this.activeInterviewAttitude) {
        switch (band) {
            case 'stable':
                return '身に余る御恩、片時も忘れたことはありませぬ。この身は殿のために。';
            case 'warning':
                return '不満というほどではございませぬ。ただ、少し思うところはございます。';
            case 'danger':
                return attitude === 'reserved'
                    ? '……大きな不満はございませぬ。ただ、今の待遇には少し思うところがございます。'
                    : '……正直に申せば、今の待遇にはいささか思うところがございます。';
            case 'dissatisfied':
                return attitude === 'cold'
                    ? '……今のままでよいとは、申し上げられませぬ。もう少しお考えいただきたい。'
                    : '今のままでは、務めにも身が入りませぬ。もう少しお考えいただきたい。';
            case 'serious':
                return attitude === 'startled'
                    ? '……いえ、その……某にも、思うところくらいはございます。'
                    : '……某ばかりに我慢を強いるのは、おやめいただきたい。';
            default:
                return attitude === 'startled'
                    ? '……っ。い、いえ、特に申し上げることはございませぬ。'
                    : '……特に申し上げることはございませぬ。お話は、それだけでしょうか。';
        }
    }

    _calcTargetKnowledge(interviewer, target, relation) {
        let knowledge = Number(interviewer.intelligence || 0) * 0.55
            + relation.contactScore * 0.35
            + Number(interviewer.duty || 0) * 0.10;

        const intelligenceGap = Math.max(0, Number(target.intelligence || 0) - Number(interviewer.intelligence || 0));
        knowledge -= intelligenceGap * 0.35;
        knowledge -= Math.max(0, Number(target.ambition || 0) - 50) * 0.08;
        return Math.max(0, Math.min(100, knowledge));
    }

    _canDetectConcealment(interviewer, target, knowledge, concealment) {
        if (!concealment.isConcealing) return false;
        const I = window.MainParams.Interview;
        const interviewerInt = Number(interviewer.intelligence || 0);
        const targetInt = Number(target.intelligence || 0);
        return knowledge >= I.ConcealDetectKnowledgeMin
            && interviewerInt >= I.ConcealDetectIntelligenceMin
            && interviewerInt + I.ConcealDetectGapAllowance >= targetInt;
    }

    _getBlindTargetText(interviewer, target, relation, concealment) {
        const interviewerInt = Number(interviewer.intelligence || 0);
        const targetInt = Number(target.intelligence || 0);
        const hardToRead = concealment.isConcealing || targetInt >= interviewerInt + 20;

        if (relation.contactScore >= 52) {
            return hardToRead
                ? '普段から話はしておりますが、あの方は肝心な胸中をほとんど見せませぬ。殿への本心までは、某にも読み切れませぬ。'
                : '普段の様子は存じております。ただ、殿への胸中となると、某にはほとんど読み取れませぬ。';
        }
        if (relation.compatibilityScore >= 68) {
            return hardToRead
                ? '人柄については信頼しております。ただ、殿への胸中となると、あの方はなかなか内心を見せませぬ。某にもほとんど読み取れませぬ。'
                : '人柄については信頼しております。ただ、殿への胸中までは、某にもほとんど分かりませぬ。';
        }
        if (relation.contactScore < 34) {
            return hardToRead
                ? 'もともと深く話す間柄でもなく、あの方も内心を見せませぬ。殿への胸中までは、某にはほとんど分かりませぬ。'
                : '普段ほとんど言葉を交わしませぬゆえ、殿への胸中までは某にも分かりませぬ。';
        }
        return hardToRead
            ? 'あの方はなかなか内心を見せぬお方です。殿への胸中までは、某にはほとんど読み取れませぬ。'
            : '殿への胸中となると、某にはほとんど読み取れませぬ。断じられるほどの材料がございませぬ。';
    }

    _getTargetLoyaltyBandText(band, uncertain) {
        switch (band) {
            case 'stable':
                return uncertain
                    ? '見たところ、殿への忠義に疑わしいところはなさそうです。'
                    : '殿への忠義は本物でしょう。疑う余地もありません。';
            case 'warning':
                return uncertain
                    ? '今すぐ危うい様子ではありませぬが、少し思うところはありそうです。'
                    : '大きな不満はないようですが、少し思うところを抱えているようです。';
            case 'danger':
                return uncertain
                    ? '表立っては務めておりますが、待遇には少し不満があるように見えます。'
                    : '待遇に不満を抱えているようです。今のうちに気を配るべきかと。';
            case 'dissatisfied':
                return uncertain
                    ? '近頃、不満がかなり溜まっているように見受けられます。'
                    : 'かなり不満を抱えております。このまま放っておくのは危ういかと。';
            case 'serious':
                return uncertain
                    ? '殿への気持ちはかなり離れているように見えます。十分お気をつけください。'
                    : '殿への気持ちはかなり離れております。離反を警戒すべきでしょう。';
            default:
                return uncertain
                    ? '極めて危うい気配があります。油断なさらぬ方がよろしいかと。'
                    : '殿から心が離れております。いつ離反してもおかしくありませぬ。';
        }
    }

    _getDetectedConcealmentText(actualBand) {
        const detail = {
            warning: '少し思うところを抱えているようです。',
            danger: '待遇への不満を隠していると見ます。',
            dissatisfied: 'かなりの不満を抱えながら、それを表には出しておりませぬ。',
            serious: '殿への気持ちはかなり離れております。それを悟られぬよう振る舞っているのでしょう。',
            critical: '殿から心が離れております。それを悟られぬよう装っていると見て間違いありませぬ。'
        }[actualBand] || '何か思うところを隠しているようです。';
        return `表向きは何事もないように振る舞っておりますが、あれは本心ではありますまい。${detail}`;
    }

    _getTargetLoyaltyText(interviewer, target, relation) {
        if (Number(interviewer.loyalty || 0) < 40) {
            return '某自身、他人をあれこれ申せる立場ではございませぬ。殿への胸中までは量りかねます。';
        }

        const I = window.MainParams.Interview;
        const knowledge = this._calcTargetKnowledge(interviewer, target, relation);
        const concealment = this._getConcealmentProfile(target);

        if (knowledge < I.KnowledgeBlindBelow) {
            return this._getBlindTargetText(interviewer, target, relation, concealment);
        }

        if (this._canDetectConcealment(interviewer, target, knowledge, concealment)) {
            return this._getDetectedConcealmentText(concealment.actualBand);
        }

        const assessedBand = concealment.isConcealing
            ? concealment.perceivedBand
            : concealment.actualBand;
        const uncertain = knowledge < I.KnowledgeConfidentMin;
        return this._getTargetLoyaltyBandText(assessedBand, uncertain);
    }

}

window.InterviewSystem = InterviewSystem;
