/**
 * gunshi_system.js
 * 軍師によるアドバイスや報告を管理するシステム
 */
class GunshiSystem {
    constructor(game) {
        this.game = game;
        // 今月すでにアドバイスしたかどうかの印
        this.hasShownAdviceThisMonth = false;
    }

    _getPlayerDaimyo() {
        if (!this.game || typeof this.game.getClanDaimyo !== 'function') return null;
        return this.game.getClanDaimyo(Number(this.game.playerClanId) || 0) || null;
    }

    _getSpeakerPosture(gunshi) {
        const daimyo = this._getPlayerDaimyo();
        if (!window.ConversationStandingRules || !daimyo || !gunshi
            || typeof window.ConversationStandingRules.getDaimyoSpeakerPosture !== 'function') {
            return { key: 'normal', relation: 'none' };
        }
        return window.ConversationStandingRules.getDaimyoSpeakerPosture(this.game, gunshi, daimyo);
    }

    _usesIndependentDaimyoRegister(gunshi) {
        return ['senior_close', 'senior_extended', 'higher_court'].includes(this._getSpeakerPosture(gunshi).key);
    }

    _styleForSpeaker(gunshi, text) {
        const posture = this._getSpeakerPosture(gunshi);
        if (!['senior_close', 'senior_extended', 'higher_court'].includes(posture.key)) return String(text || '');
        let result = String(text || '');
        if (window.ConversationStandingRules
            && typeof window.ConversationStandingRules.applyIndependentDaimyoRegister === 'function') {
            result = window.ConversationStandingRules.applyIndependentDaimyoRegister(result);
        }

        // 軍師助言固有の活用だけをここで整える。対象人物への敬称は触らず、
        // 「誰に話しているか」による文末・助言姿勢だけを変える。
        result = result
            .replace(/警護が厚く厳しいかと/g, '警護が厚く、厳しいだろう')
            .replace(/我が軍が圧倒的だ。一気に攻め落としましょう/g, '我が軍が圧倒的だ。一気に攻め落とすのがよい')
            .replace(/油断は禁物ですが/g, '油断は禁物だが')
            .replace(/敵の兵数が勝っています/g, '敵の兵数が勝っている')
            .replace(/敵の出方を見極めましょう/g, '敵の出方を見極めるとよい')
            .replace(/援軍が予想されます/g, '援軍も来るだろう')
            .replace(/誰も在城しておりません/g, '誰も在城しておらぬ')
            .replace(/お味方/g, '味方');

        if (posture.key === 'senior_close') {
            return result
                .replace(/合戦におもむきますか？ 兵力と兵糧の確認を忘れぬようにな。/g, '合戦におもむくか。兵と兵糧の備えは怠るな。')
                .replace(/合戦におもむきますか/g, '合戦におもむくか')
                .replace(/油断めさるな/g, '油断するな');
        }
        if (posture.key === 'senior_extended') {
            return result
                .replace(/合戦におもむきますか？ 兵力と兵糧の確認を忘れぬようにな。/g, '合戦におもむくか。兵と兵糧の備えは確かめておくがよい。')
                .replace(/合戦におもむきますか/g, '合戦におもむくか')
                .replace(/やめておいた方がよい/g, 'やめておくのがよかろう')
                .replace(/油断めさるな/g, '油断は禁物だ');
        }
        return result
            .replace(/合戦におもむきますか？ 兵力と兵糧の確認を忘れぬようにな。/g, '合戦におもむくか。兵と兵糧の備えは見ておいた方がよかろう。')
            .replace(/合戦におもむきますか/g, '合戦におもむくか')
            .replace(/やめておいた方がよい/g, 'やめておくのがよかろう')
            .replace(/油断めさるな/g, '油断は禁物だ');
    }

    _getDaimyoAddress(gunshi) {
        const daimyo = this._getPlayerDaimyo();
        if (!daimyo || !window.ConversationStandingRules) return '殿';
        if (typeof window.ConversationStandingRules.getInterviewDaimyoCallName === 'function') {
            return window.ConversationStandingRules.getInterviewDaimyoCallName(this.game, gunshi, daimyo);
        }
        return '殿';
    }

    _getTargetCallName(gunshi, target) {
        const daimyo = this._getPlayerDaimyo();
        if (!target || !window.ConversationStandingRules) return `${target && target.name ? target.name : 'その者'}殿`;

        // 当主の父・祖父・兄などが軍師の場合、普通の格下家臣まで一律「○○殿」とは呼ばない。
        // ただし軍師・国主・高官・特殊権威や近親者への敬意は、対象側の規則としてそのまま残す。
        const posture = this._getSpeakerPosture(gunshi);
        if (['senior_close', 'senior_extended'].includes(posture.key)
            && typeof window.ConversationStandingRules.getPersonalStanding === 'function'
            && typeof window.ConversationStandingRules.getHouseholdElderTargetCallName === 'function') {
            const isFamily = typeof window.ConversationStandingRules.areFamily === 'function'
                && window.ConversationStandingRules.areFamily(gunshi, target);
            const standing = window.ConversationStandingRules.getPersonalStanding(this.game, gunshi, target);
            const special = window.ConversationStandingRules.getSpecialAuthority(this.game, target);
            const targetOutranksSpeaker = window.ConversationStandingRules.compareCourtStanding(this.game, target, gunshi) > 0;
            if (!isFamily && Number(standing && standing.deferenceLevel || 0) <= 0
                && Number(special && special.level || 0) < 2 && !targetOutranksSpeaker) {
                return window.ConversationStandingRules.getHouseholdElderTargetCallName(this.game, gunshi, target);
            }
        }

        if (typeof window.ConversationStandingRules.getInterviewTargetCallName === 'function') {
            return window.ConversationStandingRules.getInterviewTargetCallName(this.game, gunshi, target, daimyo);
        }
        return `${target.name}殿`;
    }

    _getSelfConcernMessage(gunshi, alert) {
        const posture = this._getSpeakerPosture(gunshi);
        if (posture.key === 'senior_close') {
            return alert === 'red'
                ? '今の扱いには、こちらも思うところがある。このままでは務めにも差し障る。少し考えてもらいたい'
                : 'こちらの扱いについては、少し思うところがある。今一度考えてもらえるとありがたい';
        }
        if (posture.key === 'senior_extended' || posture.key === 'higher_court') {
            return alert === 'red'
                ? '今の扱いについては、こちらにも思うところがある。務めに差し障る前に、一度考えてもらいたい'
                : '今の扱いについては、こちらにも少し思うところがある。一度考えてもらえるとありがたい';
        }
        return alert === 'red'
            ? '恐れながら申し上げます。今の待遇では、務めにも差し障りがございます。どうかご配慮を賜りたく存じます'
            : '恐れながら、某の待遇につきまして、今少しご配慮いただければ幸いにございます';
    }

    _getLoyaltyConcernStyle(target) {
        const daimyo = this._getPlayerDaimyo();
        if (!window.ConversationStandingRules || !daimyo || !target
            || typeof window.ConversationStandingRules.getLoyaltyExpressionStyle !== 'function') return 'fealty';
        return window.ConversationStandingRules.getLoyaltyExpressionStyle(this.game, daimyo, target);
    }

    _getDaimyoThoughtReference(gunshi) {
        const posture = this._getSpeakerPosture(gunshi);
        if (posture.key === 'normal') return '殿のお考え';
        return `${this._getDaimyoAddress(gunshi)}の考え`;
    }

    _buildLoyaltyConcernMessage(gunshi, item, hasPrevious = false) {
        const target = item.busho;
        const alert = item.assessment.alert;
        const callName = this._getTargetCallName(gunshi, target);
        const style = this._getLoyaltyConcernStyle(target);
        const daimyoThought = this._getDaimyoThoughtReference(gunshi);
        const independent = this._usesIndependentDaimyoRegister(gunshi);

        if (style === 'family') {
            if (alert === 'red') {
                const follow = independent ? '早めに一度話をした方がよい' : '早めに一度お話しになった方がよろしいかと';
                return `${callName}は、${daimyoThought}にかなり強く思うところがおありのようです。${follow}`;
            }
            const follow = independent ? '一度話を聞いてみるとよい' : '一度お話を聞かれてはいかがでしょう';
            return `${callName}は、近頃${daimyoThought}と少々食い違うところがおありのようです。${follow}`;
        }
        if (style === 'authority') {
            if (alert === 'red') {
                const follow = independent ? '軽く見ず、折を見て考えを聞いておくとよい' : '軽く見ず、折を見てお考えを聞かれた方がよろしいかと';
                return `${callName}は、${daimyoThought}に強く思うところがおありのようです。${follow}`;
            }
            const follow = independent ? '折を見て考えを聞いておくとよい' : '折を見てお考えを聞かれてもよろしいかと';
            return `${callName}にも、${daimyoThought}について多少思うところはおありのようです。${follow}`;
        }

        if (alert === 'red') {
            return `${callName}は待遇への不満が深いように見受けられます。どうか早めのご配慮を`;
        }
        const particle = hasPrevious ? 'にも' : 'には';
        return `${callName}${particle}少々思うところがあるようです。今のうちにお取り計らいを`;
    }

    getSituationDaimyoSortieText(gunshi) {
        const posture = this._getSpeakerPosture(gunshi);
        const address = this._getDaimyoAddress(gunshi);
        if (posture.key === 'senior_close') return `${address}自ら出るなら、味方の士気も上がるだろう。`;
        if (posture.key === 'senior_extended') return `${address}自ら出るなら、味方の士気も上がるだろう。`;
        if (posture.key === 'higher_court') return `${address}自ら出るなら、味方の士気も上がるだろう。`;
        return '殿自ら出陣なされるとあらば、お味方の戦意も高まることでしょう。';
    }

    // 月が替わったときに呼ばれる処理
    onStartMonth() {
        // 月初めに印をリセットします
        this.hasShownAdviceThisMonth = false;
    }

    getAdviceQuality(gunshi) {
        if (!gunshi) return { score: 0, reliability: 0 };
        const Q = window.MainParams.Gunshi.AdviceQuality;
        const L = window.MainParams.Gunshi.LoyaltyInsight;
        const intelligence = Math.max(0, Math.min(100, Number(gunshi.intelligence) || 0));
        const loyalty = Math.max(0, Math.min(100, Number(gunshi.loyalty) || 0));
        const duty = Math.max(0, Math.min(100, Number(gunshi.duty) || 0));
        const score = intelligence * Q.IntelligenceWeight
            + loyalty * Q.LoyaltyWeight
            + duty * Q.DutyWeight;
        const reliability = loyalty * L.ReliabilityLoyaltyWeight
            + duty * L.ReliabilityDutyWeight;
        return { score: Math.max(0, Math.min(100, score)), reliability, intelligence, loyalty, duty };
    }

    getLoyaltyAssessment(target, gunshi = null) {
        const adviser = gunshi || this.game.getClanGunshi(this.game.playerClanId);
        if (!target || !adviser) {
            return { alert: 'none', priority: 0, assessedBand: 'stable', severity: 0, confidence: 0, detectedConcealment: false };
        }

        const profile = LoyaltyInsightRules.getConcealmentProfile(target);
        const quality = this.getAdviceQuality(adviser);
        const L = window.MainParams.Gunshi.LoyaltyInsight;
        const targetIntelligence = Math.max(0, Math.min(100, Number(target.intelligence) || 0));
        const isSelf = Number(target.id) === Number(adviser.id);
        const detectPower = quality.intelligence + quality.duty * L.DetectDutyWeight;
        const canDetect = !isSelf && profile.isConcealing
            && quality.intelligence >= L.DetectIntelligenceMin
            && detectPower + L.DetectGapAllowance >= targetIntelligence;

        // 軍師本人については「自分の偽装を自分で看破する」扱いにしない。
        // ただし大名の智謀が高ければ、軍師が「この殿にはごまかしが通じない」と判断し、
        // 自分で掛けた偽装だけを1～2段階ほど控える。真の忠誠より悪く報告することはない。
        let assessedBand = canDetect ? profile.actualBand : profile.perceivedBand;
        let selfConcealmentCounterShift = 0;
        if (isSelf && profile.bandShift > 0) {
            const daimyo = this.game && typeof this.game.getClanDaimyo === 'function'
                ? this.game.getClanDaimyo(this.game.playerClanId)
                : (this.game && Array.isArray(this.game.bushos)
                    ? this.game.bushos.find(b => Number(b.clan) === Number(this.game.playerClanId) && b.isDaimyo)
                    : null);
            const daimyoIntelligence = Math.max(0, Math.min(100, Number(daimyo && daimyo.intelligence) || 0));
            const I = window.MainParams.Interview;
            const requestedCounterShift = daimyoIntelligence >= I.ConcealHighIntelligence
                ? I.ConcealHighBandShift
                : (daimyoIntelligence >= I.ConcealMidIntelligence ? I.ConcealMidBandShift : 0);
            selfConcealmentCounterShift = Math.min(profile.bandShift, requestedCounterShift);
            assessedBand = LoyaltyInsightRules.shiftBand(profile.perceivedBand, -selfConcealmentCounterShift);
        }

        // 忠誠・義理が極端に低い軍師は、見えている危険を主君へやや甘く報告する。
        // ランダムな嘘ではなく段階を一定量だけ緩め、同じ月・同じ軍師で表示が揺れないようにする。
        let reportShift = 0;
        if (quality.reliability < L.VerySoftReportBelow) reportShift = 2;
        else if (quality.reliability < L.SoftReportBelow) reportShift = 1;
        assessedBand = LoyaltyInsightRules.shiftBand(assessedBand, reportShift);

        const alert = LoyaltyInsightRules.getAlertLevel(assessedBand);
        return {
            alert,
            priority: alert === 'red' ? 2 : (alert === 'orange' ? 1 : 0),
            assessedBand,
            severity: LoyaltyInsightRules.getBandSeverity(assessedBand),
            confidence: quality.score,
            reliability: quality.reliability,
            detectedConcealment: canDetect,
            isSelfAssessment: isSelf,
            selfConcealmentCounterShift,
            actualBand: profile.actualBand,
            perceivedBand: profile.perceivedBand
        };
    }

    compareLoyaltyAssessments(a, b, gunshi = null) {
        const adviser = gunshi || this.game.getClanGunshi(this.game.playerClanId);
        if (!adviser) {
            return String(a && a.name || '').localeCompare(String(b && b.name || ''), 'ja');
        }
        const aa = this.getLoyaltyAssessment(a, adviser);
        const bb = this.getLoyaltyAssessment(b, adviser);
        if (aa.priority !== bb.priority) return bb.priority - aa.priority; // 赤→橙→無色
        if (aa.severity !== bb.severity) return bb.severity - aa.severity;
        return String(a && a.name || '').localeCompare(String(b && b.name || ''), 'ja');
    }

    // ターン開始時に軍師の所見として不満を報告する処理
    checkAndShowAdvice(castle, onComplete) {
        if (this.hasShownAdviceThisMonth) {
            if (onComplete) onComplete();
            return;
        }

        const gunshi = this.game.getClanGunshi(this.game.playerClanId);
        if (!gunshi) {
            if (onComplete) onComplete();
            return;
        }
        this.hasShownAdviceThisMonth = true;

        // 真の忠誠を直接読むのではなく、褒美一覧と同じ軍師所見を正本にする。
        const reports = this.game.bushos
            .filter(b => b.clan === this.game.playerClanId
                && window.BushoStatusRules.isActive(b)
                && !b.isDaimyo
                && !(b.belongKunishuId > 0))
            .map(busho => ({ busho, assessment: this.getLoyaltyAssessment(busho, gunshi) }))
            .filter(item => item.assessment.priority > 0)
            .sort((a, b) => this.compareLoyaltyAssessments(a.busho, b.busho, gunshi));

        if (reports.length === 0) {
            if (onComplete) onComplete();
            return;
        }

        const selfReport = reports.find(item => Number(item.busho.id) === Number(gunshi.id)) || null;
        const otherReports = reports.filter(item => Number(item.busho.id) !== Number(gunshi.id));
        const red = otherReports.filter(item => item.assessment.alert === 'red');
        const orange = otherReports.filter(item => item.assessment.alert === 'orange');
        const messageList = [];

        // 軍師本人の不満も、本人と当主の距離感に応じた一人称へする。
        // 智謀で隠し切れた場合は selfReport 自体が残らないため、本人からは何も申告しない。
        if (selfReport) messageList.push(this._getSelfConcernMessage(gunshi, selfReport.assessment.alert));

        // 通常家臣だけは従来どおり複数人をまとめて「待遇」へ言及できる。
        // 一門・将軍・左馬頭は同じ「忠誠低下」でも理由を待遇に決めつけず、
        // 殿の考えとの食い違い／理解・協調として一人ずつ慎重に報告する。
        const appendConcernGroup = (items, alert) => {
            const ordinary = items.filter(item => this._getLoyaltyConcernStyle(item.busho) === 'fealty');
            const relational = items.filter(item => this._getLoyaltyConcernStyle(item.busho) !== 'fealty');

            if (ordinary.length >= 3) {
                if (alert === 'red') {
                    messageList.push(`${this._getTargetCallName(gunshi, ordinary[0].busho)}以下${ordinary.length}名、待遇への不満が深いように見受けられます。どうか早めのご配慮を`);
                } else {
                    const particle = messageList.length > 0 ? 'にも' : 'には';
                    messageList.push(`${this._getTargetCallName(gunshi, ordinary[0].busho)}以下${ordinary.length}名${particle}、少々思うところがあるようです。今のうちにお取り計らいを`);
                }
            } else {
                ordinary.forEach(item => messageList.push(this._buildLoyaltyConcernMessage(gunshi, item, messageList.length > 0)));
            }
            relational.forEach(item => messageList.push(this._buildLoyaltyConcernMessage(gunshi, item, messageList.length > 0)));
        };

        appendConcernGroup(red, 'red');
        appendConcernGroup(orange, 'orange');

        let msgIndex = 0;
        const showNext = () => {
            if (msgIndex >= messageList.length) {
                if (onComplete) onComplete();
                return;
            }
            const address = (msgIndex === 0) ? `${this._getDaimyoAddress(gunshi)}、` : '';
            const styledBody = this._styleForSpeaker(gunshi, messageList[msgIndex]);
            const msg = `「${address}${styledBody}」`;
            msgIndex++;
            this.game.ui.showDialog(msg, false, showNext, null, {
                leftFace: gunshi.faceIcon,
                leftName: gunshi.name
            });
        };
        showNext();
    }
    // ==========================================
    // ★コマンド実行前のアドバイスを表示する魔法です
    showCommandAdvice(action, onConfirm) {
        // 戦争のアドバイスがあれば、それを優先して表示します
        if (action.type === 'war' || this.game.warManager.state.active) {
            const warAdvice = this.game.warManager.getGunshiAdvice(action);
            if (warAdvice) {
                const gunshi = this.game.getClanGunshi(this.game.playerClanId);
                // ui.js の小窓を開く魔法を呼び出します
                this.game.ui.openGunshiModal(gunshi, this._styleForSpeaker(gunshi, warAdvice), onConfirm);
                return;
            }
        }

        // アドバイスが要らないコマンドの場合は、すぐに実行(onConfirm)します
        const spec = this.game.commandSystem.getSpecs()[action.type];
        if (spec && spec.hasAdvice === false) {
             onConfirm();
             return;
        }

        // 自分の軍師を探します（いなければすぐに実行します）
        const gunshi = this.game.getClanGunshi(this.game.playerClanId); 
        if (!gunshi) { onConfirm(); return; }
        
        // 秘密の番号（シード）を作って、アドバイスのメッセージを作ります
        const seed = this.game.year * 100 + this.game.month + (action.type.length) + (action.targetId || 0) + (action.val || 0);
        const msg = this.getAdviceMessage(gunshi, action, seed);
        
        // ui.js の小窓を開く魔法を呼び出します
        this.game.ui.openGunshiModal(gunshi, this._styleForSpeaker(gunshi, msg), onConfirm);
    }

    // ★軍師の賢さによって、言うこと（予測）が変わる魔法です
    getAdviceMessage(gunshi, action, seed) { 
        // 実際の成功確率を受け取ります（無い場合は絶対に成功するコマンドとして扱います）
        let trueProb = action.trueProb !== undefined ? action.trueProb : 1.0;
        
        // ★追加：もし確率が「0〜100（パーセント）」の数字で届いた場合は、「0.0〜1.0」の形に直してあげます！
        if (trueProb > 1.0) {
            trueProb = trueProb / 100;
        }
        
        // 助言の質は智謀を主軸に、軍師自身の忠誠・義理も加味する。
        // 「見抜く力」と「主君へ誠実に伝える姿勢」の両方が助言精度へ反映される。
        const adviceQuality = this.getAdviceQuality(gunshi);
        let accuracy = 0.5 + (adviceQuality.score / 100) * 0.49;
        if (accuracy > 0.99) accuracy = 0.99;

        // 推測がどれくらいブレるかの幅を決めます
        const maxError = 1.0 - accuracy;
        
        // ランダムなノイズ（-1.0 〜 +1.0）を作ってブレさせます
        // ※ GameMath.seededRandom を使うようにしました
        const noise = (GameMath.seededRandom(seed) - 0.5) * 2;
        let perceivedProb = trueProb + noise * maxError;
        perceivedProb = Math.max(0.0, Math.min(1.0, perceivedProb));
        
        // ★追加：従属願と和睦の場合は、確率によって言うことを切り替えます！
        if (action.type === 'subordinate' || action.type === 'truce') {
            if (perceivedProb > 0.95) return "必ずや受け入れられるでしょう。無条件で話がまとまるはずです！"; 
            if (perceivedProb > 0.7) return "おそらく上手くいくでしょう。何かしら要求されるでしょうが、話はまとまるはずです。"; 
            if (perceivedProb > 0.4) return "五分五分といったところです。何かしらの条件を要求される可能性が高いでしょう。"; 
            if (perceivedProb > 0.15) return "厳しい交渉になるでしょう。"; 
            return "おやめください。条件を提示するまでもなく、門前払いされるでしょう。"; 
        }

        // ★追加：暗殺の場合は成功率が非常に低いため、専用の低い基準で判定します！
        if (action.type === 'assassinate') {
            if (perceivedProb >= 0.15) return "暗殺の機としては上々です。実行に移すべきかと！";
            if (perceivedProb >= 0.10) return "隙があるように見受けられます。運が良ければ仕留められましょう。"; 
            if (perceivedProb >= 0.05) return "警護が厚く厳しいかと。刃を届かせるのは至難の業です。"; 
            if (perceivedProb >= 0.01) return "警戒されており危険です。今は好機ではありませぬ。"; 
            return "おやめください。失敗する未来しか見えませぬ。"; 
        }
        
        // ★計略コマンド（離間計・破壊工作・民心撹乱）の場合は、成功率と効果量の組み合わせで自然なつなぎ言葉にします
        if (action.type === 'rumor' || action.type === 'sabotage' || action.type === 'incite' || action.type === 'kuko') {
            let probMsg = "";
            let probIsHigh = false;
            let probIsLow = false;
            
            if (perceivedProb > 0.95) { probMsg = "まず接触できるでしょう"; probIsHigh = true; }
            else if (perceivedProb > 0.7) { probMsg = "おそらく接触できるでしょう"; probIsHigh = true; }
            else if (perceivedProb > 0.4) { probMsg = "接触できるかは五分五分といったところです"; }
            else if (perceivedProb > 0.15) { probMsg = "接触は難しいでしょう"; probIsLow = true; }
            else { probMsg = "まず接触は不可能でしょう"; probIsLow = true; }
            
            if (action.type === 'sabotage' || action.type === 'incite' || action.type === 'kuko') {
                if (perceivedProb > 0.95) { probMsg = "まず失敗はしないでしょう"; probIsHigh = true; }
                else if (perceivedProb > 0.7) { probMsg = "おそらく潜り込ませられるでしょう"; probIsHigh = true; }
                else if (perceivedProb > 0.4) { probMsg = "潜り込ませられるかは五分五分といったところです"; }
                else if (perceivedProb > 0.15) { probMsg = "警戒が厳しく、潜り込ませるのは難しいでしょう"; probIsLow = true; }
                else { probMsg = "まず潜り込ませるのは不可能でしょう"; probIsLow = true; }
            }

            let perceivedDamage = action.expectedDamage || 0;
            // 予測ダメージにも少しノイズ（軍師の勘違い）を加えます
            perceivedDamage = Math.max(1, Math.floor(perceivedDamage + (noise * 5 * maxError)));
            
            let damageMsg = "";
            let damageIsHigh = false;

            // コマンドごとにダメージのセリフを変えます
            if (action.type === 'rumor') {
                if (perceivedDamage >= 9) { damageMsg = "相手に大きな疑心を植え付けられることと存じます。"; damageIsHigh = true; }
                else if (perceivedDamage >= 6) { damageMsg = "今の待遇に疑問を持たせられることと存じます。"; damageIsHigh = true; }
                else if (perceivedDamage >= 3) { damageMsg = "大きな効果は見込めないかと存じます。"; damageIsHigh = false; }
                else { damageMsg = "かの者の信頼が揺らぐ事はないかと存じます。"; damageIsHigh = false; }
            } else if (action.type === 'sabotage') {
                if (perceivedDamage >= 12) { damageMsg = "城の防備を大きく破壊できることと存じます。"; damageIsHigh = true; }
                else if (perceivedDamage >= 8) { damageMsg = "城の防備をそれなりに削れることと存じます。"; damageIsHigh = true; }
                else if (perceivedDamage >= 4) { damageMsg = "大きな効果は見込めないかと存じます。"; damageIsHigh = false; }
                else { damageMsg = "ほとんど影響は無いかと存じます。"; damageIsHigh = false; }
            } else if (action.type === 'incite') {
                if (perceivedDamage >= 9) { damageMsg = "領民の心を大きく引き離せることと存じます。"; damageIsHigh = true; }
                else if (perceivedDamage >= 6) { damageMsg = "それなりに領民の動揺を誘えることと存じます。"; damageIsHigh = true; }
                else if (perceivedDamage >= 3) { damageMsg = "大きな効果は見込めないかと存じます。"; damageIsHigh = false; }
                else { damageMsg = "領民たちが惑わされる事はないかと存じます。"; damageIsHigh = false; }
            } else if (action.type === 'kuko') {
                if (perceivedDamage >= 6) { damageMsg = "両家の間に亀裂を生じさせられることと存じます。"; damageIsHigh = true; }
                else if (perceivedDamage >= 4) { damageMsg = "両家の関係を悪化させられることと存じます。"; damageIsHigh = true; }
                else if (perceivedDamage >= 2) { damageMsg = "大きな効果は見込めないかと存じます。"; damageIsHigh = false; }
                else { damageMsg = "両家の関係が揺らぐ事はないかと存じます。"; damageIsHigh = false; }
            }
            
            // 成功率と効果量の高低で、言い回しを変えます
            let successKari = (action.type === 'rumor') ? "面会" : "潜入";

            if (probIsHigh && damageIsHigh) {
                return `${probMsg}。${damageMsg}`;
            } else if (probIsHigh && !damageIsHigh) {
                return `${probMsg}が、${damageMsg}`;
            } else if (probIsLow && damageIsHigh) {
                return `${probMsg}。ただ、${successKari}さえ叶えば${damageMsg}`;
            } else if (probIsLow && !damageIsHigh) {
                return `${probMsg}。万が一${successKari}が叶ったところで、${damageMsg}`;
            } else {
                // 五分五分の場合
                if (damageIsHigh) {
                    return `${probMsg}が、成功の暁には${damageMsg}`;
                } else {
                    return `${probMsg}。仮に${successKari}が叶ったところで、${damageMsg}`;
                }
            }
        }

        if (perceivedProb > 0.95) return "必ずや成功するでしょう。好機です！";
        if (perceivedProb > 0.7) return "おそらく上手くいくでしょう。"; 
        if (perceivedProb > 0.4) return "五分五分といったところです。油断めさるな。"; 
        if (perceivedProb > 0.15) return "厳しい結果になるかもしれません。"; 
        return "おやめください。失敗する未来が見えます。"; 
    }
}
window.GunshiSystem = GunshiSystem;
