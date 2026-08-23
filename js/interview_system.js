/**
 * interview_system.js
 * 面談コマンドの進行・判定・台詞生成を担当する。
 * 表示とページ切替は InterviewView、人物関係の数値計算は PersonnelRules に委譲する。
 */
class InterviewSystem {
    constructor(game) {
        this.game = game;
    }

    get view() {
        return this.game && this.game.ui ? this.game.ui.interviewView : null;
    }

    open() {
        if (!this.view) return;
        this.showInterviewerList();
    }

    close() {
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
        const candidates = this._getInterviewCandidates();
        this.view.showInterviewerList(
            candidates,
            busho => this.startInterview(busho),
            () => this.close()
        );
    }

    startInterview(busho) {
        if (!busho || !this.view) return;

        if (!busho.isInterviewed) {
            busho.loyalty = Math.min(100, Number(busho.loyalty || 0) + 1);
            busho.isInterviewed = true;
        }

        if (this._shouldOfferDoctor(busho)) {
            this._showDoctorPrompt(busho);
            return;
        }

        this.showMainMenu(busho);
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
                                () => this.showMainMenu(busho)
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
                            () => this.close()
                        );
                    }
                },
                {
                    label: '診せない',
                    className: 'btn-secondary',
                    onClick: () => this.showMainMenu(busho)
                }
            ]
        );
    }

    showMainMenu(busho) {
        if (!this.view) return;
        this.view.showMenu(
            busho,
            '「殿、どのようなご用件でしょうか？」',
            [
                { label: '調子はどうだ', className: 'btn-primary', onClick: () => this.executeInterviewStatus(busho) },
                { label: '他者について聞く', onClick: () => this.showTargetList(busho) },
                { label: '戻る', onClick: () => this.showInterviewerList() }
            ]
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

        let perceivedLoyalty = Number(busho.loyalty || 0);
        if (Number(busho.intelligence || 0) >= 85 && perceivedLoyalty < 80) {
            perceivedLoyalty = Math.max(perceivedLoyalty, 90);
        } else if (Number(busho.intelligence || 0) >= 70 && perceivedLoyalty < 60) {
            perceivedLoyalty = Math.max(perceivedLoyalty, 70);
        }

        let loyaltyText = '';
        let attitudeText = '';
        if (perceivedLoyalty >= 85) {
            loyaltyText = '身に余る御恩、片時も忘れたことはありませぬ。この身は殿のために。';
        } else if (perceivedLoyalty >= 65) {
            loyaltyText = '家中はよく治まっております。何も心配なさりませぬよう。';
        } else if (perceivedLoyalty >= 45) {
            loyaltyText = '特に不満はありません。与えられた役目は果たします。';
        } else if (perceivedLoyalty >= 25) {
            loyaltyText = '……少し、待遇を見直してはいただけませぬか。';
        } else {
            loyaltyText = '……。';
            attitudeText = '目を合わせようとしない。危険な気配を感じる。';
        }

        const messages = [
            `「${policyText}」`,
            `「${loyaltyText}」`
        ];
        if (attitudeText) messages.push(attitudeText);

        this.view.showMessages(busho, messages, () => this.showMainMenu(busho));
    }

    executeInterviewTopic(interviewer, target) {
        const relation = PersonnelRules.calcRelationshipProfile(interviewer, target);
        const opinionText = this._getOpinionText(relation.compatibilityScore);
        const contactText = this._getContactText(relation, interviewer);
        const loyaltyText = this._getTargetLoyaltyText(interviewer, target, relation);

        const messages = [
            `「${target.name}殿ですか……<br>${opinionText}」`,
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

    _getTargetLoyaltyText(interviewer, target, relation) {
        if (Number(interviewer.loyalty || 0) < 40) {
            return 'さあ……。他人の腹の内など、某には量りかねます。';
        }

        let knowledge = Number(interviewer.intelligence || 0) * 0.55
            + relation.contactScore * 0.35
            + Number(interviewer.duty || 0) * 0.10;

        const intelligenceGap = Math.max(0, Number(target.intelligence || 0) - Number(interviewer.intelligence || 0));
        knowledge -= intelligenceGap * 0.35;
        knowledge -= Math.max(0, Number(target.ambition || 0) - 50) * 0.08;
        knowledge = Math.max(0, Math.min(100, knowledge));

        if (knowledge < 40) {
            return '詳しいところまでは存じませぬ。腹の内を断じるほどには分かっておりませぬ。';
        }

        const loyalty = Number(target.loyalty || 0);
        const uncertain = knowledge < 62;
        if (loyalty >= 85) return uncertain
            ? '見たところ、殿への忠義に疑わしいところはなさそうです。'
            : '殿への忠義は本物でしょう。疑う余地もありません。';
        if (loyalty >= 65) return uncertain
            ? '少なくとも、今のところ不審な様子は見受けられませぬ。'
            : '不審な点はありませぬ。真面目に務めております。';
        if (loyalty >= 45) return uncertain
            ? '表立って不満は見せませぬが、少し気に留めておくべきかと。'
            : '今のところは大人しくしておりますが、多少思うところはありそうです。';
        if (loyalty >= 25) return uncertain
            ? '近頃、何やら思うところがあるようには見えます。'
            : '近頃、何やら不満を漏らしているようです。';
        return uncertain
            ? '少々危うい気配があります。注意しておいた方がよろしいかと。'
            : '油断なりませぬ。殿から心が離れつつあるように見えます。';
    }
}

window.InterviewSystem = InterviewSystem;
