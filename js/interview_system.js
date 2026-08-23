/**
 * interview_system.js
 * 面談コマンドの進行・判定・台詞生成を担当する。
 * 表示とページ切替は InterviewView、人物関係の数値計算は PersonnelRules に委譲する。
 */
class InterviewSystem {
    constructor(game) {
        this.game = game;
        this.activeInterviewAttitude = null;
        this.activeRumor = null;
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
        this.activeRumor = null;
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
            .slice();
    }

    showInterviewerList() {
        if (!this.view) return;
        this.activeInterviewAttitude = null;
        this.activeRumor = null;
        const candidates = this._getInterviewCandidates();
        this.view.showInterviewerList(
            candidates,
            busho => this.startInterview(busho),
            () => this.close()
        );
    }

    startInterview(busho) {
        if (!busho || !this.view) return;

        // 面談による忠誠上昇を先に確定し、その結果を今回の面談態度へ反映する。
        // 境界を跨いだのに最初の挨拶だけ旧忠誠の態度になるズレを防ぐ。
        if (!busho.isInterviewed) {
            busho.loyalty = Math.min(100, Number(busho.loyalty || 0) + 1);
            busho.isInterviewed = true;
        }

        // 面談開始後の現在忠誠を基準に、その面談中の表面態度を一度だけ決める。
        // 以後の導入台詞も同じ態度を使い、挨拶だけ急に別人格になるのを防ぐ。
        this.activeInterviewAttitude = this._getSurfaceAttitude(busho);
        this.activeRumor = null;

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
                return '「どうぞ、何なりとお尋ねください！」';
            case 'friendly':
                return '「何なりとお申し付けください」';
            case 'polite':
                return '「どのようなご用件でしょうか」';
            case 'reserved':
                return '「……ご用件を伺いましょう」';
            case 'startled':
                return '「……それで、何のご用でしょうか」';
            default:
                return '「……何か、ご用でしょうか」';
        }
    }

    _getTopicOpening(target, attitude = this.activeInterviewAttitude) {
        const name = target && target.name ? target.name : 'その方';
        switch (attitude) {
            case 'welcoming':
            case 'friendly':
                return `${name}殿ですか。存じております。`;
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
                { label: '方針について', onClick: () => this.executeInterviewPolicy(busho) },
                { label: '他者について聞く', onClick: () => this.showTargetList(busho) },
                { label: '武将の噂', onClick: () => this.executeInterviewRumor(busho) }
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
        const concealment = this._getConcealmentProfile(busho);
        const loyaltyBand = concealment.perceivedBand;
        const loyaltyText = this._getSelfLoyaltyText(loyaltyBand, this.activeInterviewAttitude);
        const messages = [loyaltyText];

        // 深刻以下は本人が会話自体を拒むため、そこで終える。
        // それ以外は現在の心境への返答を一度完結させ、価値観は独立した次の発言として扱う。
        if (loyaltyBand !== 'serious' && loyaltyBand !== 'critical') {
            const innovationText = this._getInnovationStatusText(busho);
            if (innovationText) messages.push(innovationText);
        }

        this.view.showMessages(
            busho,
            messages.map(text => `「${text}」`),
            () => this.showMainMenu(busho)
        );
    }

    _getInnovationStatusText(busho) {
        const inno = Number(busho && busho.innovation || 0);
        // 勢力詳細の思想表示（保守 <= 33 / 中道 34-66 / 革新 >= 67）に合わせる。
        if (inno >= 67) {
            return '古い仕来りに拘りすぎず、良きものは新しくとも取り入れてゆくべきかと考えております。';
        }
        if (inno <= 33) {
            return '古くからの仕来りを軽んじず、守るべきものは守ることが肝要かと存じます。';
        }
        return '古きに固執するも、新しきに飛びつくも考えもの。肝要なのは、時勢を見極めることかと。';
    }

    _getPolicyDisclosureProfile(busho) {
        const cfg = window.MainParams.Interview.PolicyDisclosure;
        const loyalty = Math.max(0, Math.min(100, Number(busho && busho.loyalty) || 0));
        const duty = Math.max(0, Math.min(100, Number(busho && busho.duty) || 0));
        const score = loyalty * cfg.LoyaltyWeight + duty * cfg.DutyWeight;
        return {
            score,
            level: score >= cfg.FullMin ? 'full' : (score >= cfg.PartialMin ? 'partial' : 'guarded')
        };
    }

    _toneFirstMessage(text, context = 'generic', attitude = this.activeInterviewAttitude) {
        if (!text) return text;
        if (context === 'topic' || context === 'status') return text;

        if (attitude === 'polite') return `恐れながら、${text}`;
        if (attitude === 'reserved' || attitude === 'cold') {
            return text.startsWith('……') ? text : `……${text}`;
        }
        if (attitude === 'startled') {
            return text.startsWith('……') ? text : `……そ、その件でしたら、${text}`;
        }
        if (attitude === 'welcoming' && context === 'policy') return `はい。${text}`;
        return text;
    }

    _toneSequence(texts, context = 'generic', attitude = this.activeInterviewAttitude) {
        const rows = (texts || []).filter(Boolean).map(text => String(text));
        if (rows.length === 0) return [];
        // 呼びかけ・相槌・立場の前置きは最初の一文だけに付ける。
        rows[0] = this._toneFirstMessage(rows[0], context, attitude);
        return rows;
    }

    _toneTopicFollowup(text) {
        return text;
    }

    _getCommanderLegion(busho) {
        if (!busho || !this.game || !Array.isArray(this.game.legions)) return null;
        return this.game.legions.find(l => Number(l.clanId) === Number(busho.clan)
            && Number(l.commanderId) === Number(busho.id)) || null;
    }

    _getOperationTargetName(operation) {
        if (!operation || operation.type !== '攻撃') return '';
        if (operation.isKunishuTarget) {
            const kunishu = this.game.kunishuSystem && this.game.kunishuSystem.getKunishu(operation.targetId);
            return kunishu ? kunishu.getName(this.game) : '目標の諸勢力';
        }
        const target = this.game.getCastle(operation.targetId);
        return target ? target.name : '目標の城';
    }

    _getGunshiAttackPlan(clanId) {
        const clanOps = this.game && this.game.aiOperationManager && this.game.aiOperationManager.operations
            ? this.game.aiOperationManager.operations[Number(clanId)]
            : null;
        if (!clanOps) return null;

        const plans = Object.entries(clanOps)
            .map(([legionId, op]) => ({ legionId: Number(legionId), op }))
            .filter(row => row.op && row.op.type === '攻撃' && row.op.targetId !== undefined && row.op.targetId !== null)
            .map(row => {
                const op = row.op;
                const score = Number(op.planningScore ?? (op.attackTargets && op.attackTargets[0] && op.attackTargets[0].score) ?? 0);
                return { ...row, score, targetName: this._getOperationTargetName(op) };
            })
            .sort((a, b) => b.score - a.score || a.legionId - b.legionId);
        return plans[0] || null;
    }

    _getPolicyAbilityDomains(busho) {
        const cfg = window.MainParams.Interview.PolicyAdvice;
        let rows = [
            { key: 'leadership', value: Number(busho && busho.leadership || 0), order: 0 },
            { key: 'strength', value: Number(busho && busho.strength || 0), order: 1 },
            { key: 'politics', value: Number(busho && busho.politics || 0), order: 2 },
            { key: 'diplomacy', value: Number(busho && busho.diplomacy || 0), order: 3 },
            { key: 'intelligence', value: Number(busho && busho.intelligence || 0), order: 4 }
        ];

        // 軍師は智謀が高いこと自体が珍しくないため、それだけで毎回「調略」の話に偏らせない。
        // 智謀が他の主要能力の最高値より1.2倍以上突出している時だけ、調略分野を候補にする。
        if (busho && busho.isGunshi) {
            const intelligence = Number(busho.intelligence || 0);
            const bestOther = Math.max(
                Number(busho.leadership || 0),
                Number(busho.strength || 0),
                Number(busho.politics || 0),
                Number(busho.diplomacy || 0)
            );
            if (bestOther > 0 && intelligence < bestOther * Number(cfg.GunshiIntelligenceDominanceRatio)) {
                rows = rows.filter(row => row.key !== 'intelligence');
            }
        }

        return rows.sort((a, b) => b.value - a.value || a.order - b.order);
    }

    _getPolicyScopeCastles(busho) {
        if (!this.game || !busho) return [];
        const clanId = Number(busho.clan);
        if (busho.isGunshi) return this.game.getClanCastles ? this.game.getClanCastles(clanId) : [];

        const legion = this._getCommanderLegion(busho);
        if (legion && this.game.getClanCastles) {
            return this.game.getClanCastles(clanId).filter(c => Number(c.legionId) === Number(legion.legionNo));
        }

        const castle = this.game.getCastle ? this.game.getCastle(Number(busho.castleId)) : null;
        return castle ? [castle] : [];
    }

    _getBushoOperation(busho) {
        if (!this.game || !busho || !this.game.aiOperationManager || !this.game.aiOperationManager.operations) return null;
        const clanId = Number(busho.clan);
        if (busho.isGunshi) {
            const best = this._getGunshiAttackPlan(clanId);
            return best ? best.op : null;
        }

        const legion = this._getCommanderLegion(busho);
        let legionId = legion ? Number(legion.legionNo) : null;
        if (legionId === null) {
            const castle = this.game.getCastle ? this.game.getCastle(Number(busho.castleId)) : null;
            if (castle) legionId = Number(castle.legionId);
        }
        const clanOps = this.game.aiOperationManager.operations[clanId];
        return clanOps && legionId !== null ? clanOps[legionId] || null : null;
    }

    _getLeadershipPolicyText(busho, disclosure) {
        let operation = this._getBushoOperation(busho);
        let targetName = '';
        if (busho && busho.isGunshi) {
            const best = this._getGunshiAttackPlan(Number(busho.clan));
            if (best) {
                operation = best.op;
                targetName = best.targetName;
            }
        }
        if (!targetName && operation && operation.type === '攻撃') targetName = this._getOperationTargetName(operation);

        if (operation && operation.type === '攻撃' && targetName) {
            return disclosure.level === 'full'
                ? `攻めるなら、${targetName}を第一に見るのがよろしいでしょう。現在の軍勢の動きとも合っております。`
                : `攻勢に出るなら、${targetName}方面をまず見るのがよろしいかと。`;
        }
        return '攻め急ぐより、今は兵を整えて機を待つ方がよろしいかと。';
    }

    _getStrengthPolicyText(busho, disclosure) {
        const castles = this._getPolicyScopeCastles(busho).filter(c => Number(c.soldiers || 0) > 0);
        if (castles.length === 0) return '兵については、まず数を整えてから訓練に移るのがよろしいでしょう。';

        const rows = castles.map(castle => {
            const trainingMax = Math.max(1, Number(castle.maxTraining || 100));
            const moraleMax = Math.max(1, Number(castle.maxMorale || 100));
            const trainingRatio = Math.max(0, Math.min(1, Number(castle.training || 0) / trainingMax));
            const moraleRatio = Math.max(0, Math.min(1, Number(castle.morale || 0) / moraleMax));
            return { castle, trainingRatio, moraleRatio, readiness: Math.min(trainingRatio, moraleRatio) };
        }).sort((a, b) => a.readiness - b.readiness || Number(a.castle.id || 0) - Number(b.castle.id || 0));
        const worst = rows[0];
        const concern = Number(window.MainParams.Interview.PolicyAdvice.ReadinessConcernRatio);

        if (worst.trainingRatio < concern && worst.trainingRatio <= worst.moraleRatio) {
            return disclosure.level === 'full'
                ? `${worst.castle.name}の兵は、まだ訓練が十分とは申せませぬ。もう少し鍛えておくべきかと。`
                : '兵の訓練は、もう少し重ねておいた方がよろしいかと。';
        }
        if (worst.moraleRatio < concern) {
            return disclosure.level === 'full'
                ? `${worst.castle.name}の兵は、士気がやや落ちております。まずは立て直しておきたいところです。`
                : '兵の士気には、もう少し気を配った方がよろしいかと。';
        }
        return '兵の仕上がりは悪くありません。今の状態を保てば、いざという時にも動けましょう。';
    }

    _getPoliticsPolicyText(busho, disclosure) {
        const castles = this._getPolicyScopeCastles(busho);
        if (castles.length === 0 || typeof AIDomesticPriorityRules === 'undefined') {
            return '内政については、足元を見ながら手を入れてゆくのがよろしいかと。';
        }
        const plan = AIDomesticPriorityRules.getBestDomesticPlan(this.game, castles);
        if (!plan) return '内政面では、今すぐ大きく手を入れるべきところは見当たりませぬ。';

        if (disclosure.level !== 'full') {
            if (plan.type === 'repair') return '城壁の傷みには、早めに手を入れておいた方がよろしいかと。';
            if (plan.type === 'farm') return 'まだ石高を伸ばせるところがありそうです。田畑に手を入れるのがよろしいでしょう。';
            return 'まだ鉱山を伸ばせるところがありそうです。開発を進めるのがよろしいでしょう。';
        }

        if (plan.type === 'repair') return `${plan.castle.name}の城壁は傷みが目立ちます。修復を優先した方がよろしいかと。`;
        if (plan.type === 'farm') return `${plan.castle.name}はまだ石高を伸ばす余地がございます。田畑を整えるのがよろしいでしょう。`;
        return `${plan.castle.name}はまだ鉱山を伸ばす余地がございます。こちらに手を入れるのがよろしいかと。`;
    }

    _getNeighborClanIds(clanId) {
        if (!this.game || !this.game.getClanCastles || !this.game.getCastle) return [];
        const ids = new Set();
        this.game.getClanCastles(Number(clanId)).forEach(castle => {
            (castle.adjacentCastleIds || []).forEach(adjId => {
                const adj = this.game.getCastle(adjId);
                if (adj && Number(adj.ownerClan) > 0 && Number(adj.ownerClan) !== Number(clanId)) ids.add(Number(adj.ownerClan));
            });
        });
        return [...ids];
    }

    _getDiplomacyPolicyTarget(busho) {
        if (!this.game || !busho) return null;
        const clanId = Number(busho.clan);
        const clan = this.game.getClan ? this.game.getClan(clanId) : null;
        if (clan && clan.currentDiplomacyTarget && Number(clan.currentDiplomacyTarget.targetId) > 0) {
            return { ...clan.currentDiplomacyTarget, targetId: Number(clan.currentDiplomacyTarget.targetId), planned: true };
        }

        const neighbors = this._getNeighborClanIds(clanId);
        if (neighbors.length === 0 || !this.game.diplomacyManager || typeof this.game.diplomacyManager.getDiplomacyPriorityList !== 'function') return null;
        const hostile = neighbors.filter(id => {
            const rel = this.game.getRelation ? this.game.getRelation(clanId, id) : this.game.diplomacyManager.getRelation(clanId, id);
            return rel && typeof DiplomacyRules !== 'undefined' && DiplomacyRules.isHostile(rel.status);
        });
        let mainThreatId = 0;
        if (hostile.length > 0 && this.game.aiEngine && typeof this.game.aiEngine.getClanPrestige === 'function') {
            hostile.sort((a, b) => this.game.aiEngine.getClanPrestige(b) - this.game.aiEngine.getClanPrestige(a));
            mainThreatId = hostile[0];
        }
        const list = this.game.diplomacyManager.getDiplomacyPriorityList(clanId, neighbors, mainThreatId);
        return list && list[0] ? { targetId: Number(list[0].clanId), planned: false } : null;
    }

    _getDiplomacyPolicyText(busho, disclosure) {
        const target = this._getDiplomacyPolicyTarget(busho);
        if (!target) return '外交については、今すぐ大きく動くより周囲の出方を見てもよろしいかと。';
        const clan = this.game.getClan ? this.game.getClan(target.targetId) : null;
        const name = clan ? clan.name : 'その勢力';
        if (disclosure.level !== 'full') return '外交では、周辺の大名家との関係を一つずつ整えておくのがよろしいかと。';

        const actionText = {
            goodwill: '関係を深めておく',
            alliance: '同盟を視野に入れる',
            truce: '和睦を探る',
            court_truce: '和睦を探る',
            subordinate: '従属関係を検討する'
        }[target.action] || '関係を整えておく';
        return `外交では、${name}との${actionText}ことに利がありそうです。`;
    }

    _getIntrigueCandidateClanIds(busho) {
        const ids = new Set();
        if (!this.game || !busho) return [];
        const clanId = Number(busho.clan);
        const ops = this.game.aiOperationManager && this.game.aiOperationManager.operations
            ? this.game.aiOperationManager.operations[clanId]
            : null;

        const addTargets = op => {
            (op && op.sabotageTargets || []).forEach(target => {
                if (Number(target.clanId) > 0 && Number(target.clanId) !== clanId) ids.add(Number(target.clanId));
            });
        };

        if (busho.isGunshi && ops) {
            Object.values(ops).forEach(addTargets);
        } else {
            addTargets(this._getBushoOperation(busho));
        }
        if (ids.size === 0) {
            this._getNeighborClanIds(clanId).forEach(id => {
                const rel = this.game.getRelation ? this.game.getRelation(clanId, id) : null;
                const protectedRelation = rel && typeof DiplomacyRules !== 'undefined'
                    && DiplomacyRules.isProtectedFromImmediateAttack(rel.status);
                if (!protectedRelation) ids.add(id);
            });
        }
        return [...ids];
    }

    _getBestIntrigueTarget(busho) {
        if (!this.game || !busho || !Array.isArray(this.game.bushos)) return null;
        const clanIds = new Set(this._getIntrigueCandidateClanIds(busho));
        if (clanIds.size === 0) return null;
        const candidates = this.game.bushos.filter(target => clanIds.has(Number(target.clan))
            && !target.isDaimyo
            && (!window.BushoStatusRules || window.BushoStatusRules.isActive(target)));
        if (candidates.length === 0) return null;

        const rows = candidates.map(target => {
            let prob = null;
            if (this.game.strategySystem && typeof this.game.strategySystem.getHeadhuntProb === 'function') {
                prob = Number(this.game.strategySystem.getHeadhuntProb(busho.id, target.id, 100));
            }
            const fallback = (100 - Number(target.loyalty || 0)) + (100 - Number(target.duty || 0)) * 0.5;
            return { target, prob, score: Number.isFinite(prob) ? prob : fallback / 150 };
        }).sort((a, b) => b.score - a.score || Number(a.target.id || 0) - Number(b.target.id || 0));
        return rows[0] || null;
    }

    _getIntelligencePolicyText(busho, disclosure) {
        const row = this._getBestIntrigueTarget(busho);
        if (!row || (Number.isFinite(row.prob) && row.prob < Number(window.MainParams.Interview.PolicyAdvice.IntrigueCandidateMinProb))) {
            return '調略については、今すぐ崩しやすい相手は見当たりませぬ。';
        }
        if (disclosure.level !== 'full') return '敵方には、調略を仕掛ける余地のある者がいそうです。';
        const targetClan = this.game.getClan ? this.game.getClan(Number(row.target.clan)) : null;
        const prefix = targetClan ? `${targetClan.name}の` : '';
        return `調略を仕掛けるなら、${prefix}${row.target.name}殿は有力な候補かと見ております。`;
    }

    _getPolicyDomainText(domain, busho, disclosure) {
        switch (domain) {
            case 'leadership': return this._getLeadershipPolicyText(busho, disclosure);
            case 'strength': return this._getStrengthPolicyText(busho, disclosure);
            case 'politics': return this._getPoliticsPolicyText(busho, disclosure);
            case 'diplomacy': return this._getDiplomacyPolicyText(busho, disclosure);
            case 'intelligence': return this._getIntelligencePolicyText(busho, disclosure);
            default: return '';
        }
    }

    _getPolicyMessages(busho) {
        const disclosure = this._getPolicyDisclosureProfile(busho);
        if (disclosure.level === 'guarded') {
            return this._toneSequence(['今は、細かな方針まで申し上げることはございませぬ。'], 'policy');
        }

        const maxTopics = Number(window.MainParams.Interview.PolicyAdvice.MaxTopics);
        const messages = [];
        for (const row of this._getPolicyAbilityDomains(busho)) {
            const text = this._getPolicyDomainText(row.key, busho, disclosure);
            if (!text || messages.includes(text)) continue;
            messages.push(text);
            if (messages.length >= maxTopics) break;
        }
        if (messages.length === 0) messages.push('今のところ、某から申し上げるほどのことはございませぬ。');
        return this._toneSequence(messages, 'policy');
    }

    executeInterviewPolicy(busho) {
        const messages = this._getPolicyMessages(busho).map(text => `「${text}」`);
        this.view.showMessages(busho, messages, () => this.showMainMenu(busho), '方針について');
    }

    _getRumorStatDefs() {
        return [
            ['leadership', '統率'], ['strength', '武勇'], ['politics', '内政'],
            ['diplomacy', '外交'], ['intelligence', '智謀'], ['charm', '魅力']
        ];
    }

    _getRumorExpertDomain(interviewer) {
        const cfg = window.MainParams.Interview.Rumor;
        const rows = this._getRumorStatDefs()
            .map(([key, label], order) => ({ key, label, order, value: Number(interviewer && interviewer[key] || 0) }))
            .sort((a, b) => b.value - a.value || a.order - b.order);
        const best = rows[0] || null;
        return best && best.value >= Number(cfg.ExpertMinStat) ? best : null;
    }

    _getRumorRegionCastleIds(depth) {
        const result = new Set();
        if (!this.game || !Array.isArray(this.game.castles)) return result;
        const queue = [];
        for (const castle of this.game.castles) {
            if (Number(castle.ownerClan) !== Number(this.game.playerClanId)) continue;
            const id = Number(castle.id);
            if (result.has(id)) continue;
            result.add(id);
            queue.push({ castle, distance: 0 });
        }

        let head = 0;
        while (head < queue.length) {
            const row = queue[head++];
            if (row.distance >= depth) continue;
            let adjacentIds = [];
            if (this.game.mapGraph && typeof this.game.mapGraph.getAdjacentIds === 'function') {
                adjacentIds = this.game.mapGraph.getAdjacentIds(row.castle);
            } else {
                adjacentIds = (this.game.castles || [])
                    .filter(c => typeof MapGraphService !== 'undefined' && MapGraphService.isAdjacent(row.castle, c))
                    .map(c => c.id);
            }
            for (const rawId of adjacentIds) {
                const id = Number(rawId);
                if (result.has(id)) continue;
                const castle = this.game.getCastle ? this.game.getCastle(id) : this.game.castles.find(c => Number(c.id) === id);
                if (!castle) continue;
                result.add(id);
                queue.push({ castle, distance: row.distance + 1 });
            }
        }
        return result;
    }

    _getRumorRegionalCandidates(regionCastleIds) {
        const myClanId = Number(this.game.playerClanId);
        return (this.game.bushos || []).filter(target => {
            if (!target || target.isAutoLeader) return false;
            if (Number(target.clan) === myClanId) return false;
            const present = !!(window.BushoStatusRules
                && (window.BushoStatusRules.isActive(target) || window.BushoStatusRules.isRonin(target)));
            if (!present) return false;
            return regionCastleIds.has(Number(target.castleId));
        });
    }

    _getRumorTopStats(target) {
        return this._getRumorStatDefs()
            .map(([key]) => Number(target && target[key] || 0))
            .sort((a, b) => b - a);
    }

    _isRumorExpertCandidate(target, domain) {
        if (!target || !domain) return false;
        const cfg = window.MainParams.Interview.Rumor;
        const value = Number(target[domain.key] || 0);
        const best = Math.max(...this._getRumorStatDefs().map(([key]) => Number(target[key] || 0)));
        return value >= Number(cfg.CandidateMinStat)
            && value >= best - Number(cfg.CandidateBestGap);
    }

    _isRumorGeneralCandidate(target) {
        const cfg = window.MainParams.Interview.Rumor;
        const stats = this._getRumorTopStats(target);
        return stats.length >= 3
            && stats[0] >= Number(cfg.GeneralMinBestStat)
            && stats[0] + stats[1] + stats[2] >= Number(cfg.GeneralTopThreeMinTotal);
    }

    _pickRandom(items) {
        if (!Array.isArray(items) || items.length === 0) return null;
        return items[Math.floor(Math.random() * items.length)] || null;
    }

    _selectRumorTarget(interviewer) {
        const cfg = window.MainParams.Interview.Rumor;
        const domain = this._getRumorExpertDomain(interviewer);
        const depths = [Number(cfg.SearchDepth), Number(cfg.ExtendedSearchDepth)]
            .filter((value, index, array) => Number.isFinite(value) && value >= 0 && array.indexOf(value) === index);

        for (const depth of depths) {
            const regional = this._getRumorRegionalCandidates(this._getRumorRegionCastleIds(depth));
            if (domain) {
                const expertCandidates = regional.filter(target => this._isRumorExpertCandidate(target, domain));
                const target = this._pickRandom(expertCandidates);
                if (target) return { target, mode: 'expert', domain, depth };
            }
            const generalCandidates = regional.filter(target => this._isRumorGeneralCandidate(target));
            const target = this._pickRandom(generalCandidates);
            if (target) return { target, mode: 'general', domain: null, depth };
        }
        return null;
    }

    _getRumorSubjectText(target) {
        if (!target) return 'ある武将';
        if (window.BushoStatusRules && window.BushoStatusRules.isRonin(target)) {
            return `${target.name}殿という浪人`;
        }
        if (Number(target.belongKunishuId || 0) > 0) {
            const kunishu = this.game.kunishuSystem && this.game.kunishuSystem.getKunishu(target.belongKunishuId);
            if (kunishu) {
                const name = kunishu.getName(this.game);
                if (Number(kunishu.leaderId) === Number(target.id)) return `${name}の頭領、${target.name}殿`;
                return `${name}の${target.name}殿`;
            }
            // 諸勢力の castleId は地域アンカーであり実所在地とは限らない。城名には変換しない。
            return `${target.name}殿という武将`;
        }
        const clan = Number(target.clan) > 0 && this.game.getClan ? this.game.getClan(Number(target.clan)) : null;
        if (clan) {
            if (target.isDaimyo) return `${clan.name}を率いる${target.name}殿`;
            return `${clan.name}の${target.name}殿`;
        }
        return `${target.name}殿という武将`;
    }

    _getRumorOpeningText(row, attitude) {
        const subject = this._getRumorSubjectText(row.target);
        const isGeneral = row.mode === 'general';
        if (attitude === 'reserved') {
            return isGeneral
                ? `……${subject}の名なら聞いております。なかなかの御仁だとか。`
                : `……${subject}の名なら聞いております。`;
        }
        if (attitude === 'polite') {
            return isGeneral
                ? `詳しいことは存じませぬが、${subject}がなかなかの御仁だとの噂は耳にしております。`
                : `耳にした話では、${subject}が近頃評判になっているようです。`;
        }
        if (attitude === 'welcoming') {
            return isGeneral
                ? `そういえば、${subject}がなかなかの御仁だと近頃評判になっております！`
                : `そういえば、近頃${subject}の噂を耳にしました！`;
        }
        return isGeneral
            ? `詳しいことは存じませぬが、${subject}がなかなかの御仁だと噂になっております。`
            : `そういえば、近頃${subject}の噂を耳にしました。`;
    }

    _getRumorAbilityText(row, attitude) {
        if (row.mode === 'expert' && row.domain) {
            const prefix = attitude === 'reserved' ? '聞けば、' : '聞けば、';
            return `${prefix}${row.domain.label}に秀でた御仁だとか。`;
        }
        return attitude === 'reserved'
            ? '腕は立つそうです。'
            : '評判になるだけあって、なかなか腕の立つ御仁だと聞いております。';
    }

    _getRumorLoyaltyText(target) {
        if (!target) return '';
        if (window.BushoStatusRules && window.BushoStatusRules.isRonin(target)) {
            return '今は仕える主を持たず、浪々の身だそうです。';
        }
        if (Number(target.belongKunishuId || 0) > 0) {
            const kunishu = this.game.kunishuSystem && this.game.kunishuSystem.getKunishu(target.belongKunishuId);
            if (kunishu && Number(kunishu.leaderId) === Number(target.id)) {
                return `今は${kunishu.getName(this.game)}の頭領を務めているそうです。`;
            }
        }
        if (target.isDaimyo) {
            const clan = this.game.getClan ? this.game.getClan(Number(target.clan)) : null;
            return clan ? `当人が今の${clan.name}を率いております。` : '当人が一勢力を率いる立場だそうです。';
        }

        const band = this._getConcealmentProfile(target).perceivedBand;
        const lordText = Number(target.belongKunishuId || 0) > 0 ? '今の頭領' : '今の主君';
        if (band === 'stable') return `${lordText}には、かなり信を置いているとの話です。`;
        if (band === 'warning') return `${lordText}との間に、特段悪い話は聞きませぬ。`;
        if (band === 'danger' || band === 'dissatisfied') return `${lordText}には、何やら思うところがあるとも聞きます。`;
        return `${lordText}とは、あまり折り合いがよくないという噂もございます。`;
    }

    _getRumorMessages(interviewer, row) {
        if (!row || !row.target) return [];
        const attitude = this.activeInterviewAttitude;
        const messages = [this._getRumorOpeningText(row, attitude), this._getRumorAbilityText(row, attitude)];
        // reserved は口数を抑え、人物名と評判まで。良好～丁寧なら立場・主君との評判まで伝える。
        if (attitude !== 'reserved') messages.push(this._getRumorLoyaltyText(row.target));
        return messages.filter(Boolean).map(text => `「${text}」`);
    }

    executeInterviewRumor(interviewer) {
        const attitude = this.activeInterviewAttitude;
        if (attitude === 'cold') {
            this.view.showMessages(
                interviewer,
                ['「……他家の武将の噂まで、某から申し上げることはございませぬ。」'],
                () => this.showMainMenu(interviewer),
                '武将の噂'
            );
            return;
        }
        if (attitude === 'startled') {
            this.view.showMessages(
                interviewer,
                ['「……そ、そのような噂話について、今は申し上げることはございませぬ。」'],
                () => this.showMainMenu(interviewer),
                '武将の噂'
            );
            return;
        }

        // 同じ面談中に何度押しても候補を引き直さず、噂コマンドを人材検索ガチャにしない。
        if (!this.activeRumor || Number(this.activeRumor.interviewerId) !== Number(interviewer.id)) {
            const row = this._selectRumorTarget(interviewer);
            this.activeRumor = { interviewerId: Number(interviewer.id), row };
        }
        const row = this.activeRumor.row;
        if (!row) {
            const text = attitude === 'reserved'
                ? '……近頃は、これといって耳に残る武将の噂はございませぬ。'
                : '近頃は、これといって耳に残る武将の噂はございませぬな。';
            this.view.showMessages(interviewer, [`「${text}」`], () => this.showMainMenu(interviewer), '武将の噂');
            return;
        }

        this.view.showMessages(
            interviewer,
            this._getRumorMessages(interviewer, row),
            () => this.showMainMenu(interviewer),
            '武将の噂'
        );
    }

    executeInterviewTopic(interviewer, target) {
        const relation = PersonnelRules.calcRelationshipProfile(interviewer, target);
        const concealment = this._getConcealmentProfile(target);
        const roughBias = this._getOtherAssessmentBias(interviewer, target, concealment.perceivedLoyalty);
        const attitude = this.activeInterviewAttitude;

        // 本心を隠し切れず冷淡/動揺している武将は、他者についてだけ急に長広舌にはしない。
        // 基本は口数を減らし、私情が強い相手だけ短く悪く言う／控えめに庇う。
        if (attitude === 'cold' || attitude === 'startled') {
            let text;
            const slanderMin = Number(window.MainParams.Interview.OtherAssessmentBias.BlindSlanderMin);
            if (Number(roughBias.protectionShift || 0) > 0) {
                text = `……${target.name}殿ですか。あの方については、さほど案じることはないかと存じます。`;
            } else if (Number(roughBias.loyaltyPenalty || 0) >= slanderMin) {
                text = `……${target.name}殿ですか。あの方は、あまり信用なさらぬ方がよろしいかと。`;
            } else {
                text = `……${target.name}殿ですか。某から詳しく申し上げることはございませぬ。`;
            }
            this.view.showMessages(interviewer, [`「${text}」`], () => this.showMainMenu(interviewer), '他者について聞く');
            return;
        }

        const opinionText = this._getOpinionText(relation.compatibilityScore, attitude);
        const opinionDirection = this._getOpinionDirection(relation.compatibilityScore);
        const loyaltyAssessment = this._getTargetLoyaltyAssessment(interviewer, target, relation);
        const messages = [`「${this._getTopicOpening(target)}${opinionText}」`];
        // 3段階の会話列全体で逆接を管理する。1段目の本文中ですでに「ただ／もっとも」を
        // 使っている場合も使用済みとし、後続で逆接を重ねない。
        const transitionState = {
            used: /(?:^|[。！？])(?:ただ|もっとも|正直なところ)、/.test(opinionText),
            last: null,
            contactScore: Number(relation && relation.contactScore || 0)
        };

        if (attitude === 'reserved') {
            // 寡黙な態度では接触関係の説明まで重ねず、要点だけ二言で答える。
            const loyaltyText = this._bridgeAssessmentText(
                loyaltyAssessment.text,
                opinionDirection,
                loyaltyAssessment.direction,
                transitionState
            );
            messages.push(`「${loyaltyText}」`);
        } else {
            const contactDirection = this._getContactDirection(relation);
            const contactText = this._bridgeAssessmentText(
                this._getContactText(relation, interviewer, attitude),
                opinionDirection,
                contactDirection,
                transitionState
            );
            const loyaltyText = this._bridgeAssessmentText(
                loyaltyAssessment.text,
                contactDirection,
                loyaltyAssessment.direction,
                transitionState
            );
            messages.push(`「${contactText}」`, `「${loyaltyText}」`);
        }

        this.view.showMessages(interviewer, messages, () => this.showMainMenu(interviewer), '他者について聞く');
    }

    _getOpinionDirection(score) {
        if (Number(score) >= 68) return 'positive';
        if (Number(score) >= 52) return 'neutral';
        return 'negative';
    }

    _getContactDirection(relation) {
        const contact = Number(relation && relation.contactScore || 0);
        if (contact >= 52) return 'positive';
        if (contact >= 34) return 'neutral';
        return 'negative';
    }

    _getLoyaltyDirection(band) {
        if (band === 'stable') return 'positive';
        if (band === 'warning') return 'neutral';
        return 'negative';
    }

    _stripAssessmentTransition(text) {
        return String(text || '').replace(/^(?:ただ|もっとも|正直なところ|そのうえ|そのため)、?\s*/, '');
    }

    _chooseAssessmentTransition(previousDirection, currentDirection, transitionState = null) {
        // unknown は評価の中立ではなく「情報が足りない」。
        // よく交流していて直前も好意的なら「知っているが、その奥は別」という逆接の「ただ」。
        // 接触が十分でないなら「判断材料がない」という告白なので「正直なところ」を使う。
        if (currentDirection === 'unknown') {
            const contactScore = Number(transitionState && transitionState.contactScore || 0);
            if (previousDirection === 'positive' && contactScore >= 52) return 'ただ';
            if (contactScore < 52) return '正直なところ';
            return '';
        }
        // 好意的な人物評価の後に「普段はさほど話さない」という中立的な接触情報が来る
        // 場合も、ユーザーが読む意味としては軽い逆接になる。
        if (previousDirection === 'positive' && (currentDirection === 'neutral' || currentDirection === 'negative')) {
            return 'ただ';
        }
        if (previousDirection === 'neutral' && currentDirection === 'negative') return 'ただ';
        if (previousDirection === 'negative' && (currentDirection === 'neutral' || currentDirection === 'positive')) {
            return 'もっとも';
        }
        return '';
    }

    _bridgeAssessmentText(text, previousDirection, currentDirection, transitionState = null) {
        const body = this._stripAssessmentTransition(text);
        const connector = this._chooseAssessmentTransition(previousDirection, currentDirection, transitionState);
        // 3段階の会話列では明示的な接続（ただ／もっとも／正直なところ）は原則1回だけ。各文を個別に補正して
        // 「ただ、…」→「ただ、…」のように重ねるより、後段は独立文で受けた方が自然。
        if (!connector || (transitionState && transitionState.used)) return body;
        if (transitionState) {
            transitionState.used = true;
            transitionState.last = connector;
        }
        return `${connector}、${body}`;
    }

    _getOpinionText(score, attitude = this.activeInterviewAttitude) {
        if (score >= 82) return 'あの方とは意気投合します。信頼できる御仁です。';
        if (score >= 68) return '話のわかる相手です。信頼しております。';
        if (score >= 52) return '悪い方ではありません。意見が違うことはありますが。';
        if (score >= 36) return '考え方はあまり合いませぬ。ただ、務めは務めです。';
        return ['welcoming', 'friendly', 'polite'].includes(attitude)
            ? 'あの方とはどうにも反りが合いませぬ。'
            : 'あやつとはどうにも反りが合いませぬ。';
    }

    _getContactText(relation, interviewer, attitude = this.activeInterviewAttitude) {
        const contact = relation.contactScore;
        if (contact >= 70) return '普段からよく言葉を交わしております。';
        if (contact >= 52) return '必要な折には、よく話をしております。';
        if (contact >= 34) {
            if (relation.compatibilityScore >= 68) {
                return '普段はさほど話す機会がございませぬ。';
            }
            return '用向きがなければ、あまり言葉を交わしませぬ。';
        }
        if (relation.affinityDiff >= 42 && Number(interviewer.duty || 0) < 35 && Number(interviewer.ambition || 0) >= 65) {
            return ['welcoming', 'friendly', 'polite'].includes(attitude)
                ? 'あの方とは、普段ほとんど言葉を交わしませぬ。'
                : 'あやつとは、普段ほとんど口をききませぬ。';
        }
        return '普段はほとんど言葉を交わしませぬ。';
    }

    _getLoyaltyBand(loyalty) {
        return LoyaltyInsightRules.getBand(loyalty);
    }

    _shiftLoyaltyBand(band, steps) {
        return LoyaltyInsightRules.shiftBand(band, steps);
    }

    _getConcealmentProfile(busho) {
        return LoyaltyInsightRules.getConcealmentProfile(busho);
    }

    _getSelfLoyaltyText(band, attitude = this.activeInterviewAttitude) {
        const warm = attitude === 'welcoming' || attitude === 'friendly';
        const formal = attitude === 'polite';
        const guarded = attitude === 'reserved' || attitude === 'cold';
        const startled = attitude === 'startled';
        switch (band) {
            case 'stable':
                if (startled) return 'は、はい。何の不満もございませぬ。これからも務めを果たしてまいります。';
                if (guarded) return '特に不満はございませぬ。与えられた務めを果たすのみです。';
                if (formal) return '身に余る御恩、忘れたことはございませぬ。今後も務めに励む所存です。';
                return warm
                    ? '身に余る御恩、片時も忘れたことはありませぬ。この身、殿のために尽くしましょう。'
                    : '特に不満はございませぬ。これからも務めを果たしてまいります。';
            case 'warning':
                if (startled) return 'い、いえ、大きな不満など。ただ……少し思うところはございます。';
                if (guarded) return '不満というほどではございませぬ。少し思うところがある、それだけです。';
                if (formal) return '大きな不満はございませぬ。ただ、少々思うところはございます。';
                return '不満というほどではございませぬ。ただ、少し思うところはございます。';
            case 'danger':
                if (startled) return '……その、何もないとは申せませぬ。今の待遇には、少し思うところがございます。';
                if (guarded) return '大きな不満はございませぬ。ただ、今の待遇には少し思うところがございます。';
                if (formal) return '申し上げにくいことですが、今の待遇にはいささか思うところがございます。';
                return '正直に申せば、今の待遇にはいささか思うところがございます。';
            case 'dissatisfied':
                if (startled) return '……いえ、その……今のままでよいとは、申し上げられませぬ。';
                if (attitude === 'cold') return '今のままでよいとは、申し上げられませぬ。もう少しお考えいただきたい。';
                if (attitude === 'reserved') return '今の待遇には、かなり思うところがございます。';
                if (formal) return '今のままでは務めにも身が入りませぬ。もう少しお考えいただければと。';
                return '今のままでは、務めにも身が入りませぬ。もう少しお考えいただきたい。';
            case 'serious':
            case 'critical':
                if (startled) return '……っ。い、いえ、特に申し上げることはございませぬ。';
                if (formal) return '申し訳ございませぬが、今は何も申し上げる気にはなれませぬ。';
                if (warm) return '今は、何を申し上げてもよい言葉にはなりますまい。';
                return '特に申し上げることはございませぬ。お話は、それだけでしょうか。';
            default:
                return '特に申し上げることはございませぬ。';
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
        const contactScore = Number(relation && relation.contactScore || 0);
        const hardToRead = concealment.isConcealing || targetInt >= interviewerInt + 20;

        if (contactScore >= 52) {
            // 普段の人柄や様子は知っている。そのうえで主君への忠誠という奥まった部分だけ
            // 読めないため、「までは」が自然に成立する。接続詞は系列側で付与する。
            return hardToRead
                ? 'あの方は肝心な胸中をほとんど見せませぬ。殿への本心までは、某にも読み切れませぬ。'
                : '殿への胸中までは、某にも読み切れませぬ。';
        }
        if (contactScore < 34) {
            // そもそも接触が乏しい時に「までは」と言うと、一部は知っている含みが出る。
            // 本心そのものを判断できない、と素直に言い切る。
            return hardToRead
                ? 'あの方は内心を見せぬお方です。殿への本心は、某にも分かりかねます。'
                : '殿への本心は、某にも分かりかねます。';
        }
        // 中程度の接触では多少の人物像は分かるが、忠誠を断じる材料まではない。
        // 「正直なところ」は接続生成側で必要な時だけ付ける。
        return hardToRead
            ? 'あの方はなかなか内心を見せませぬ。殿への本心は、某にも読み切れませぬ。'
            : '殿への本心は、某にも分かりかねます。';
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

    _getOtherAssessmentBias(interviewer, target, observedTargetLoyalty = null) {
        const daimyo = this.game && typeof this.game.getClanDaimyo === 'function'
            ? this.game.getClanDaimyo(Number(interviewer && interviewer.clan) || Number(this.game.playerClanId))
            : null;
        return PersonnelRules.calcOtherAssessmentBias(interviewer, target, daimyo, observedTargetLoyalty);
    }


    _getBlindProtectedTargetText(bias) {
        if (!bias || Number(bias.protectionShift || 0) <= 0) return null;
        if (Number(bias.protectionShift || 0) >= 2) {
            return '胸中のすべてまでは分かりませぬが、務めぶりを見る限り、さほど案じることはないかと存じます。';
        }
        return '詳しい胸中までは読み切れませぬが、今すぐ疑うほどではないかと存じます。';
    }

    _getBlindBiasedTargetText(bias) {
        const threshold = Number(window.MainParams.Interview.OtherAssessmentBias.BlindSlanderMin);
        if (!bias || bias.loyaltyPenalty < threshold) return null;
        if (bias.loyaltyPenalty >= threshold + 12) {
            return '詳しい胸中までは読み切れませぬが、あの方をあまり信用なさらぬ方がよろしいかと存じます。';
        }
        return '胸中までは読み切れませぬ。ただ、某には少々信用の置けぬところがあるように思えます。';
    }

    _getTargetLoyaltyAssessment(interviewer, target, relation) {
        const I = window.MainParams.Interview;
        const knowledge = this._calcTargetKnowledge(interviewer, target, relation);
        const concealment = this._getConcealmentProfile(target);
        const detected = knowledge >= I.KnowledgeBlindBelow
            && this._canDetectConcealment(interviewer, target, knowledge, concealment);
        const observedLoyalty = detected ? concealment.actualLoyalty : concealment.perceivedLoyalty;
        const bias = this._getOtherAssessmentBias(interviewer, target, observedLoyalty);

        if (knowledge < I.KnowledgeBlindBelow) {
            const protectedBlindText = this._getBlindProtectedTargetText(bias);
            if (protectedBlindText) return { text: protectedBlindText, direction: 'positive' };
            const biasedBlindText = this._getBlindBiasedTargetText(bias);
            if (biasedBlindText) return { text: biasedBlindText, direction: 'negative' };
            return {
                text: this._getBlindTargetText(interviewer, target, relation, concealment),
                direction: 'unknown'
            };
        }

        const assessedLoyalty = Math.max(0, observedLoyalty - Number(bias.loyaltyPenalty || 0));
        let assessedBand = this._getLoyaltyBand(assessedLoyalty);
        if (Number(bias.protectionShift || 0) > 0) {
            assessedBand = this._shiftLoyaltyBand(assessedBand, Number(bias.protectionShift || 0));
        }
        const direction = this._getLoyaltyDirection(assessedBand);

        // 庇っている時は「偽装を見破った」事実自体を伏せ、表面上は客観的な評価として話す。
        if (detected && Number(bias.protectionShift || 0) <= 0) {
            return { text: this._getDetectedConcealmentText(assessedBand), direction };
        }

        const uncertain = knowledge < I.KnowledgeConfidentMin;
        return { text: this._getTargetLoyaltyBandText(assessedBand, uncertain), direction };
    }

    _getTargetLoyaltyText(interviewer, target, relation) {
        return this._getTargetLoyaltyAssessment(interviewer, target, relation).text;
    }
}

window.InterviewSystem = InterviewSystem;
