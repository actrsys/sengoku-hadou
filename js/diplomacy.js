/**
 * diplomacy.js
 * 外交システムを管理するクラス
 * 大名（Clan）間の感情値と関係状態を管理します。
 */

class DiplomacyManager {
    constructor(game) {
        this.game = game;
    }

    /**
     * 遅延初期化とデータ取得
     * データが存在しない場合はデフォルト値を生成して返します
     */
    getDiplomacyData(clanId, targetId) {
        const clan = this.game.getClan(clanId);
        if (!clan) return null;

        if (!clan.diplomacyValue) {
            clan.diplomacyValue = {};
        }

        if (!clan.diplomacyValue[targetId]) {
            // 相手側(targetId)のデータに自分(clanId)への設定があるか確認します
            const targetClan = this.game.getClan(targetId);
            if (targetClan && targetClan.diplomacyValue && targetClan.diplomacyValue[clanId]) {
                // もし相手側が設定を持っていれば、同じ値をコピーします
                const oppData = targetClan.diplomacyValue[clanId];
                let mirroredStatus = oppData.status;
                if (oppData.status === window.GameConstants.DiplomacyStatus.DOMINANT) {
                    mirroredStatus = window.GameConstants.DiplomacyStatus.SUBORDINATE;
                } else if (oppData.status === window.GameConstants.DiplomacyStatus.SUBORDINATE) {
                    mirroredStatus = window.GameConstants.DiplomacyStatus.DOMINANT;
                }
                clan.diplomacyValue[targetId] = {
                    status: mirroredStatus,
                    sentiment: oppData.sentiment,
                    trucePeriod: oppData.trucePeriod || 0,
                    isMarriage: oppData.isMarriage || false,
                    isEvent: oppData.isEvent || false, // ★追加：イベントフラグもコピーします
                    hostageIds: oppData.hostageIds ? [...oppData.hostageIds] : [], // ★相手が人質リストを持っていればコピー（同期）します
                    subordinateMonths: oppData.subordinateMonths || 0 // ★追加：従属・支配の継続月数も同期します
                };
            } else {
                // どちらも持っていなければ、初期値の50になります
                clan.diplomacyValue[targetId] = {
                    status: window.GameConstants.DiplomacyStatus.NORMAL, // 状態値の正本は GameConstants
                    sentiment: 50,  // 感情値: 0 - 100
                    trucePeriod: 0, // ★初期値は0にします
                    isMarriage: false, // ★今回追加：最初は結婚のシールは貼っていません
                    isEvent: false, // ★追加：最初はイベントフラグもなし
                    hostageIds: [], // ★新しく空っぽの人質リストを用意します
                    subordinateMonths: 0 // ★追加：従属・支配関係の継続月数を覚える箱
                };
            }
        }
        return clan.diplomacyValue[targetId];
    }

    /**
     * 二国間の現在の関係を返す
     */
    getRelation(clanId, targetId) {
        return this.getDiplomacyData(clanId, targetId);
    }

    /**
     * 婚姻は同盟・支配・従属などの基本状態とは別軸で保持する。
     * status変更側からこのフラグを副作用で消さず、婚姻そのものの成立・解消時だけ更新する。
     */
    setMarriageRelation(clanId, targetId, enabled) {
        const dataA = this.getDiplomacyData(clanId, targetId);
        const dataB = this.getDiplomacyData(targetId, clanId);
        if (!dataA || !dataB) return false;
        const value = enabled === true;
        dataA.isMarriage = value;
        dataB.isMarriage = value;
        return true;
    }

    setSentimentAbsolute(clanId, targetId, value) {
        const dataA = this.getDiplomacyData(clanId, targetId);
        const dataB = this.getDiplomacyData(targetId, clanId);
        if (!dataA || !dataB) return false;
        const numeric = Number(value);
        const sentiment = Math.max(0, Math.min(100, Number.isFinite(numeric) ? numeric : 50));
        dataA.sentiment = sentiment;
        dataB.sentiment = sentiment;
        return true;
    }

    setEventRelationFlag(clanId, targetId, enabled) {
        const dataA = this.getDiplomacyData(clanId, targetId);
        const dataB = this.getDiplomacyData(targetId, clanId);
        if (!dataA || !dataB) return false;
        const value = enabled === true;
        dataA.isEvent = value;
        dataB.isEvent = value;
        return true;
    }

    _hasActiveMarriageBetweenClans(clanAId, clanBId) {
        if (!Array.isArray(this.game.princesses)) return false;
        const a = Number(clanAId);
        const b = Number(clanBId);
        return this.game.princesses.some(p => {
            if (!p || p.status !== 'married' || Number(p.husbandId || 0) <= 0) return false;
            if (p.isDiplomaticMarriageActive === false) return false;
            if (window.LifeStatusRules && window.LifeStatusRules.isUnavailable(p)) return false;
            const husband = this.game.getBusho ? this.game.getBusho(p.husbandId) : null;
            if (!husband) return false;
            const origin = Number(p.originalClanId || 0);
            const husbandClan = Number(husband.clan || p.currentClanId || 0);
            return (origin === a && husbandClan === b) || (origin === b && husbandClan === a);
        });
    }

    refreshMarriageRelation(clanAId, clanBId) {
        const hasMarriage = this._hasActiveMarriageBetweenClans(clanAId, clanBId);
        this.setMarriageRelation(clanAId, clanBId, hasMarriage);
        return hasMarriage;
    }

    /**
     * 謀反・独立で政権が組み替わった時の外交再編を一元管理する。
     * 旧家の対外感情を反転して30～50へ収め、特殊statusを破棄する従来結果を保つ。
     * 通常の独立新勢力は従来どおり旧家の婚姻を引き継がない。旧大名家を謀反側が
     * 乗っ取る政権交代だけ preserveMarriageByFamily を使い、婚姻中の姫について
     * 「夫側の系統を除く実血縁かつ一門の現役武将」が新政権に残る場合のみ、
     * 外交婚姻を維持する。姫本人の所属・夫婦関係・originalClanId は変更しない。
     */
    reorganizeRelationsAfterRebellion(sourceClanId, successorClanId, { preserveMarriageByFamily = false } = {}) {
        sourceClanId = Number(sourceClanId) || 0;
        successorClanId = Number(successorClanId) || 0;
        if (sourceClanId <= 0 || successorClanId <= 0) return false;

        const sourceClan = this.game.getClan(sourceClanId);
        const successorClan = this.game.getClan(successorClanId);
        if (!sourceClan || !successorClan) return false;

        const relationSnapshots = [];
        (this.game.clans || []).forEach(otherClan => {
            const otherId = Number(otherClan && otherClan.id) || 0;
            if (otherId <= 0 || otherId === sourceClanId || otherId === successorClanId) return;
            const relation = this.getDiplomacyData(sourceClanId, otherId);
            if (!relation) return;
            relationSnapshots.push({
                otherId,
                sentiment: Number(relation.sentiment ?? 50),
                isMarriage: relation.isMarriage === true
            });
        });

        // 肉親一門による婚姻継承は、旧大名家IDをそのまま新政権が引き継ぐ政権交代だけの例外。
        // 新IDで独立する通常独立には適用せず、従来どおり旧家の婚姻をコピーしない。
        const shouldPreserveMarriageByFamily = preserveMarriageByFamily && sourceClanId === successorClanId;
        const marriageReorganization = shouldPreserveMarriageByFamily
            ? this._collectRebellionMarriageTargets(sourceClanId, successorClanId, relationSnapshots)
            : { inheritedTargets: new Set(), decisions: [] };
        const inheritedMarriageTargets = marriageReorganization.inheritedTargets;
        marriageReorganization.decisions.forEach(decision => {
            decision.princess.isDiplomaticMarriageActive = decision.keep === true;
        });

        relationSnapshots.forEach(snapshot => {
            const inverted = Math.max(30, Math.min(50, 100 - snapshot.sentiment));
            let status = window.GameConstants.DiplomacyStatus.NORMAL;
            if (inverted >= 70) status = window.GameConstants.DiplomacyStatus.FRIENDLY;
            if (inverted <= 30) status = window.GameConstants.DiplomacyStatus.HOSTILE;

            this.changeStatus(successorClanId, snapshot.otherId, status);
            const relationA = this.getDiplomacyData(successorClanId, snapshot.otherId);
            const relationB = this.getDiplomacyData(snapshot.otherId, successorClanId);
            if (relationA) relationA.sentiment = inverted;
            if (relationB) relationB.sentiment = inverted;
            this.setMarriageRelation(
                successorClanId,
                snapshot.otherId,
                inheritedMarriageTargets.has(snapshot.otherId)
            );
        });

        // 旧家から分離して新勢力を立てた場合だけ、旧家との関係は従来どおり即時敵対にする。
        if (sourceClanId !== successorClanId) {
            this.changeStatus(sourceClanId, successorClanId, window.GameConstants.DiplomacyStatus.HOSTILE);
            const relationA = this.getDiplomacyData(sourceClanId, successorClanId);
            const relationB = this.getDiplomacyData(successorClanId, sourceClanId);
            if (relationA) relationA.sentiment = 0;
            if (relationB) relationB.sentiment = 0;
            this.setMarriageRelation(sourceClanId, successorClanId, false);
        }

        // 諸勢力との関係反転も外交再編の一部としてここから専門部署へ依頼する。
        if (this.game.kunishuSystem && typeof this.game.kunishuSystem.getAliveKunishus === 'function') {
            const aliveKunishus = this.game.kunishuSystem.getAliveKunishus();
            aliveKunishus.forEach(kunishu => {
                const oldSentiment = Number(kunishu.getRelation(sourceClanId) ?? 50);
                const inverted = Math.max(30, Math.min(50, 100 - oldSentiment));
                this.game.kunishuSystem.setRelation(kunishu, successorClanId, inverted);
            });
        }

        return true;
    }

    _collectRebellionMarriageTargets(sourceClanId, successorClanId, relationSnapshots) {
        const marriageRelationTargets = new Set(
            relationSnapshots.filter(snapshot => snapshot.isMarriage).map(snapshot => Number(snapshot.otherId))
        );
        if (marriageRelationTargets.size === 0 || !Array.isArray(this.game.princesses)) {
            return { inheritedTargets: new Set(), decisions: [] };
        }

        if (window.FamilyLinker && typeof window.FamilyLinker.rebuildAllFamilyIds === 'function') {
            window.FamilyLinker.rebuildAllFamilyIds(this.game.bushos || [], this.game.princesses || []);
        }

        const kinContext = this._buildBloodKinContext();
        const inheritedTargets = new Set();
        const decisions = [];

        this.game.princesses.forEach(princess => {
            if (!princess || princess.status !== 'married' || Number(princess.husbandId || 0) <= 0) return;
            if (window.LifeStatusRules && window.LifeStatusRules.isUnavailable(princess)) return;

            const husband = this.game.getBusho ? this.game.getBusho(princess.husbandId) : null;
            if (!husband) return;

            const originClanId = Number(princess.originalClanId || 0);
            const husbandClanId = Number(husband.clan || princess.currentClanId || 0);
            let otherClanId = 0;

            // 姫が旧家出身なら嫁ぎ先、姫が他家出身なら旧家/後継家に残った夫の実家を婚姻相手として見る。
            if (originClanId === sourceClanId && husbandClanId > 0 && husbandClanId !== sourceClanId && husbandClanId !== successorClanId) {
                otherClanId = husbandClanId;
            } else if (originClanId > 0 && originClanId !== sourceClanId
                && (husbandClanId === sourceClanId || husbandClanId === successorClanId)) {
                otherClanId = originClanId;
            }

            if (!marriageRelationTargets.has(otherClanId)) return;
            const keep = this._hasBloodFamilyMemberInSuccessor(princess, husband, successorClanId, kinContext);
            decisions.push({ princess, keep });
            if (keep) inheritedTargets.add(otherClanId);
        });

        return { inheritedTargets, decisions };
    }

    _buildBloodKinContext() {
        const people = [...(this.game.bushos || []), ...(this.game.princesses || [])];
        const personById = new Map();
        const adjacency = new Map();
        const ensure = id => {
            id = Number(id) || 0;
            if (id <= 0) return null;
            if (!adjacency.has(id)) adjacency.set(id, new Set());
            return adjacency.get(id);
        };

        people.forEach(person => {
            const id = Number(person && person.id) || 0;
            if (id <= 0) return;
            personById.set(id, person);
            ensure(id);
        });

        people.forEach(person => {
            const childId = Number(person && person.id) || 0;
            if (childId <= 0) return;
            [person.realFatherId, person.realMotherId].forEach(rawParentId => {
                const parentId = Number(rawParentId) || 0;
                if (parentId <= 0 || !personById.has(parentId)) return;
                ensure(childId).add(parentId);
                ensure(parentId).add(childId);
            });
        });

        return { adjacency };
    }

    _hasBloodFamilyMemberInSuccessor(princess, husband, successorClanId, kinContext) {
        const startId = Number(princess && princess.id) || 0;
        if (startId <= 0) return false;

        const bloodKinIds = new Set([startId]);
        const queue = [startId];
        const adjacency = kinContext && kinContext.adjacency ? kinContext.adjacency : new Map();
        while (queue.length > 0) {
            const current = queue.shift();
            const relatives = adjacency.get(current) || [];
            relatives.forEach(relativeId => {
                const id = Number(relativeId) || 0;
                if (id <= 0 || bloodKinIds.has(id)) return;
                bloodKinIds.add(id);
                queue.push(id);
            });
        }

        // 「一門」であることも必要。婚姻で広がっただけの人物は、血が繋がっていてもここでは継承根拠にしない。
        const princessFamilyIds = new Set((princess.familyIds || []).map(id => Number(id) || 0));
        // 夫本人・夫の男系/養家一門は除外し、「夫側に残ったから婚姻継承」とは判定しない。
        const husbandLineIds = new Set((husband && husband.baseFamilyIds || []).map(id => Number(id) || 0));
        if (husband && Number(husband.id) > 0) husbandLineIds.add(Number(husband.id));

        return (this.game.bushos || []).some(busho => {
            const id = Number(busho && busho.id) || 0;
            if (id <= 0 || Number(busho.clan) !== Number(successorClanId)) return false;
            const isActive = window.BushoStatusRules && typeof window.BushoStatusRules.isActive === 'function'
                ? window.BushoStatusRules.isActive(busho)
                : busho.status === window.GameConstants.BushoStatus.ACTIVE;
            if (!isActive || busho.isHostage === true) return false;
            return bloodKinIds.has(id) && princessFamilyIds.has(id) && !husbandLineIds.has(id);
        });
    }

    applyMarriageSentimentBoost(clanId, targetId) {
        const cfg = window.MainParams.Diplomacy.Marriage;
        const dataA = this.getDiplomacyData(clanId, targetId);
        const dataB = this.getDiplomacyData(targetId, clanId);
        if (!dataA || !dataB) return;
        const current = Math.max(Number(dataA.sentiment || 0), Number(dataB.sentiment || 0));
        const next = Math.min(100, Math.max(cfg.SentimentFloor, current + cfg.SentimentIncrease));
        // 友好度の増減と「普通/友好/敵対」の閾値処理は既存の updateSentiment() を正本にする。
        // 同盟・支配・従属・和睦などの特殊statusは updateSentiment 側で保護されるため、婚姻だけで上書きされない。
        dataA.sentiment = current;
        dataB.sentiment = current;
        this.updateSentiment(clanId, targetId, next - current);
    }

    getMarriageDiplomacyBonus(type, relation) {
        if (!relation || relation.isMarriage !== true) return 0;
        const cfg = window.MainParams.Diplomacy.Marriage;
        if (type === 'goodwill') return cfg.GoodwillProbBonus;
        if (type === 'alliance') return cfg.AllianceProbBonus;
        if (type === 'dominate') return cfg.DominateProbBonus;
        if (type === 'subordinate') return cfg.SubordinateProbBonus;
        return 0;
    }

    _getPrincessOriginClanId(princess) {
        if (!princess) return 0;
        const explicitClanId = Number(princess.originalClanId);
        if (Number.isFinite(explicitClanId) && explicitClanId > 0) return explicitClanId;

        // 姫の実父は現行データの realFatherId を正本にする。旧 fatherId へはフォールバックしない。
        const fatherId = Number(princess.realFatherId);
        const father = Number.isFinite(fatherId) && fatherId > 0 && this.game.getBusho
            ? this.game.getBusho(fatherId)
            : null;
        return Number(father && father.clan) || 0;
    }

    _chooseAIPrincessConflictTreatment(princess) {
        const holderClanId = Number(princess && princess.currentClanId || 0);
        const originClanId = Number(princess && princess.originalClanId || 0);
        const holderDaimyo = this.game.getClanDaimyo ? this.game.getClanDaimyo(holderClanId) : null;
        const holderDutyRaw = holderDaimyo && holderDaimyo.duty !== undefined ? holderDaimyo.duty : 50;
        const duty = Math.max(0, Math.min(100, Number(holderDutyRaw)));
        const relation = originClanId > 0 ? this.getRelation(holderClanId, originClanId) : null;
        const sentiment = Math.max(0, Math.min(100, Number(relation && relation.sentiment || 0)));

        // 開戦しただけで嫁いだ姫を五分五分で処断する旧挙動は避ける。
        // 基本は据置か離縁・返還で、処断は低義理かつ深刻な敵対時の少数例に留める。
        const killProb = Math.max(1, Math.min(15,
            2 + Math.max(0, 45 - duty) * 0.18 + Math.max(0, 20 - sentiment) * 0.12
        ));
        const releaseProb = Math.max(20, Math.min(48, 24 + duty * 0.22));
        const roll = Math.random() * 100;
        if (roll < killProb) return 'kill';
        if (roll < killProb + releaseProb) return 'release';
        return 'stay';
    }


    _awaitDiplomacyChoice(message, choices, customOpts = {}) {
        return new Promise(resolve => {
            const wrappedChoices = choices.map(choice => ({
                ...choice,
                onClick: () => resolve(choice.value)
            }));
            this.game.ui.showDialog(message, false, null, null, {
                ...customOpts,
                choices: wrappedChoices
            });
        });
    }

    async _resolvePlayerPrincessConflict(princess) {
        const originClanId = this._getPrincessOriginClanId(princess);
        const holderClanId = Number(princess && princess.currentClanId || 0);
        const historyClanIds = [originClanId, holderClanId];
        const originClan = this.game.clans.find(c => Number(c.id) === Number(originClanId));
        const originClanName = originClan ? originClan.name : "他勢力";
        const choice = await this._awaitDiplomacyChoice(
            `${originClanName}から嫁いできた${princess.name}の処遇を決定してください。`,
            [
                { label: '据置', value: 'stay', className: 'btn-primary' },
                { label: '処断', value: 'kill', className: 'btn-danger' },
                { label: '送り返す', value: 'release', className: 'btn-secondary' }
            ]
        );

        if (choice === 'stay') {
            await this.game.ui.showDialogAsync(
                `「これも戦国の世の習い。最後までお供いたしましょう」`,
                false,
                0,
                { leftFace: princess.faceIcon || 'unknown_face.webp', leftName: princess.name }
            );
            this.game.ui.log(`${princess.name} は引き続き妻として留まることになりました`, { clanIds: historyClanIds, category: 'family', inferCurrentTurn: false });
            return;
        }

        const husband = this.game.getBusho(princess.husbandId);
        const marriageTargetClanId = Number(husband && husband.clan || princess.currentClanId || 0);
        if (husband && husband.wifeIds) husband.wifeIds = husband.wifeIds.filter(id => id !== princess.id);
        princess.husbandId = 0;

        if (choice === 'kill') {
            await this.game.ui.showDialogAsync(
                `「私の怨恨は悪鬼となり、数年ならずして家名断絶せしむことでしょう」`,
                false,
                0,
                { leftFace: princess.faceIcon || 'unknown_face.webp', leftName: princess.name }
            );
            this.game.lifeSystem.setLifeStatusRaw(princess, window.GameConstants.BushoStatus.DEAD);
            FamilyLinker.rebuildAllFamilyIds(this.game.bushos, this.game.princesses);
            if (originClanId > 0 && marriageTargetClanId > 0) this.refreshMarriageRelation(originClanId, marriageTargetClanId);
            this.game.ui.log(`${princess.name} を処断しました`, { clanIds: historyClanIds, category: 'family', inferCurrentTurn: false });
            await this.game.ui.showDialogAsync(`${princess.name}を処断しました。`, false, 0);
            return;
        }

        await this.game.ui.showDialogAsync(
            `「黄泉の国までお連れいただきとうございました……」`,
            false,
            0,
            { leftFace: princess.faceIcon || 'unknown_face.webp', leftName: princess.name }
        );
        princess.status = 'unmarried';
        princess.currentClanId = originClanId;
        if (originClan) {
            if (!Array.isArray(originClan.princessIds)) originClan.princessIds = [];
            if (!originClan.princessIds.includes(princess.id)) originClan.princessIds.push(princess.id);
        }
        FamilyLinker.rebuildAllFamilyIds(this.game.bushos, this.game.princesses);
        if (originClanId > 0 && marriageTargetClanId > 0) this.refreshMarriageRelation(originClanId, marriageTargetClanId);
        this.game.ui.log(`${princess.name} と離縁し、実家へ送り返しました`, { clanIds: historyClanIds, category: 'family', inferCurrentTurn: false });
        await this.game.ui.showDialogAsync(`${princess.name}を親元へと送り返しました。`, false, 0);
    }

    async _resolveAIPrincessConflict(princess) {
        const aiChoice = this._chooseAIPrincessConflictTreatment(princess);
        const holderClanId = Number(princess && princess.currentClanId || 0);
        const aiClan = this.game.clans.find(c => Number(c.id) === Number(holderClanId));
        const aiClanName = aiClan ? aiClan.name : "敵勢力";
        const originClanId = this._getPrincessOriginClanId(princess);
        const historyClanIds = [originClanId, holderClanId];
        const husband = this.game.getBusho(princess.husbandId);
        const marriageTargetClanId = Number(husband && husband.clan || princess.currentClanId || 0);

        if (aiChoice === 'stay') {
            this.game.ui.log(`${princess.name} は敵対後も${aiClanName}に妻として留まりました`, { clanIds: historyClanIds, category: 'family', inferCurrentTurn: false });
            return;
        }

        if (husband && husband.wifeIds) husband.wifeIds = husband.wifeIds.filter(id => id !== princess.id);
        princess.husbandId = 0;
        FamilyLinker.rebuildAllFamilyIds(this.game.bushos, this.game.princesses);

        if (aiChoice === 'kill') {
            this.game.lifeSystem.setLifeStatusRaw(princess, window.GameConstants.BushoStatus.DEAD);
            if (originClanId > 0 && marriageTargetClanId > 0) this.refreshMarriageRelation(originClanId, marriageTargetClanId);
            this.game.ui.log(`${princess.name} は${aiClanName}によって処断されました……`, { clanIds: historyClanIds, category: 'family', inferCurrentTurn: false });
            if (originClanId === Number(this.game.playerClanId)) {
                await this.game.ui.showDialogAsync(`${princess.name} は${aiClanName}によって処断されました……`, false, 0);
            }
            return;
        }

        princess.status = 'unmarried';
        princess.currentClanId = originClanId;
        const originClan = this.game.clans.find(c => Number(c.id) === Number(originClanId));
        if (originClan) {
            if (!Array.isArray(originClan.princessIds)) originClan.princessIds = [];
            if (!originClan.princessIds.includes(princess.id)) originClan.princessIds.push(princess.id);
        }
        if (originClanId > 0 && marriageTargetClanId > 0) this.refreshMarriageRelation(originClanId, marriageTargetClanId);
        this.game.ui.log(`${princess.name} は${aiClanName}によって離縁され、戻って参りました`, { clanIds: historyClanIds, category: 'family', inferCurrentTurn: false });
        if (originClanId === Number(this.game.playerClanId)) {
            await this.game.ui.showDialogAsync(`${princess.name} は離縁され、戻って参りました。`, false, 0);
        }
    }

    async _resolveCapturedHostagesAfterBreak(records) {
        if (!Array.isArray(records) || records.length === 0) return;
        records.forEach(record => this._convertCapturedHostageToPrisoner(record));

        const playerClanId = Number(this.game.playerClanId);
        const playerCapturedRecords = records.filter(record => Number(record.captorClanId) === playerClanId);
        const aiCapturedRecords = records.filter(record => Number(record.captorClanId) !== playerClanId);
        const aiResultMsgs = [];

        if (aiCapturedRecords.length > 0 && this.game.warManager) {
            const aiClans = [...new Set(aiCapturedRecords.map(record => Number(record.captorClanId)).filter(id => id > 0))];
            for (const captorClanId of aiClans) {
                const clanRecords = aiCapturedRecords.filter(record => Number(record.captorClanId) === captorClanId);
                const hostages = clanRecords.map(record => record.busho).filter(Boolean);
                const clan = this.game.clans.find(c => Number(c.id) === captorClanId);
                const clanName = clan ? clan.name : "他勢力";
                const playerOriginHostages = clanRecords
                    .filter(record => Number(record.originClanId) === playerClanId)
                    .map(record => record.busho)
                    .filter(Boolean);

                await this.game.warManager.autoResolvePrisoners(hostages, captorClanId);

                playerOriginHostages.forEach(busho => {
                    if (window.LifeStatusRules.isDead(busho)) {
                        aiResultMsgs.push(`人質として送っていた ${busho.name} は${clanName} によって処断されました……`);
                        this.game.ui.log(`${busho.name} は ${clanName} によって処断されました`, { clanIds: [record.originClanId, record.captorClanId], category: 'diplomacy', inferCurrentTurn: false });
                    } else if (Number(busho.clan) === captorClanId) {
                        aiResultMsgs.push(`人質として送っていた ${busho.name} は${clanName} に臣従しました……`);
                        this.game.ui.log(`${busho.name} は ${clanName} に登用されました`, { clanIds: [record.originClanId, record.captorClanId], category: 'diplomacy', inferCurrentTurn: false });
                    } else {
                        aiResultMsgs.push(`人質として送っていた ${busho.name} は無事に解放され、戻って参りました！`);
                        this.game.ui.log(`${busho.name} が ${clanName} より解放されました`, { clanIds: [record.originClanId, record.captorClanId], category: 'diplomacy', inferCurrentTurn: false });
                    }
                });
            }
        }

        if (aiResultMsgs.length > 0) {
            await this.game.ui.showDialogAsync(aiResultMsgs.join('\n'), false, 0);
        }

        if (playerCapturedRecords.length > 0 && this.game.warManager) {
            const playerCaptured = playerCapturedRecords.map(record => record.busho).filter(Boolean);
            await new Promise(resolve => {
                this.game.warManager.pendingPrisoners = playerCaptured;
                this.game.warManager.pendingKills = [];
                this.game.warManager.startPrisonerPhase({
                    skipWarCleanup: true,
                    onComplete: resolve
                });
            });
        }
    }

    async resolveBreakAllianceConsequences(result) {
        if (!result || result.becameHostile !== true) return;

        const playerClanId = Number(this.game.playerClanId);
        const escapedRecords = Array.isArray(result.escapedHostageRecords) ? result.escapedHostageRecords : [];
        for (const record of escapedRecords) {
            const busho = record && record.busho;
            if (!busho) continue;
            if (Number(record.originClanId) === playerClanId) {
                this.game.ui.log(`人質として預けていた ${busho.name} は脱走し、戻って参りました！`, { clanIds: [record.originClanId, record.captorClanId], category: 'diplomacy', inferCurrentTurn: false });
                await this.game.ui.showDialogAsync(`人質として預けていた ${busho.name} は脱走し、無事に帰還しました！`, false, 0);
            } else if (Number(record.captorClanId) === playerClanId) {
                this.game.ui.log(`当家に預けられていた ${busho.name} は脱走し、実家へ戻りました`, { clanIds: [record.originClanId, record.captorClanId], category: 'diplomacy', inferCurrentTurn: false });
                await this.game.ui.showDialogAsync(`当家に預けられていた ${busho.name} は脱走し、実家へ戻りました。`, false, 0);
            }
        }

        const princesses = Array.isArray(result.atMercyPrincesses) ? result.atMercyPrincesses : [];
        for (const princess of princesses) {
            if (Number(princess.currentClanId) === playerClanId) {
                await this._resolvePlayerPrincessConflict(princess);
            } else {
                await this._resolveAIPrincessConflict(princess);
            }
        }

        await this._resolveCapturedHostagesAfterBreak(result.capturedHostageRecords || []);
    }

    _countHostileClans(clanId, { directOnly = false } = {}) {
        const allowed = directOnly ? new Set(this._getDirectNeighborClanIds(clanId).map(Number)) : null;
        let count = 0;
        this.game.clans.forEach(c => {
            const id = Number(c.id || 0);
            if (id <= 0 || id === Number(clanId) || c.isDestroyed) return;
            if (allowed && !allowed.has(id)) return;
            const rel = this.getRelation(clanId, id);
            if (rel && rel.status === window.GameConstants.DiplomacyStatus.HOSTILE) count++;
        });
        return count;
    }

    /**
     * 感情値を加減し、閾値に応じて自動でステータスを変動させる
     */
    updateSentiment(clanId, targetId, delta) {
        const dataA = this.getDiplomacyData(clanId, targetId);
        const dataB = this.getDiplomacyData(targetId, clanId);

        if (!dataA || !dataB) return;

        const update = (data) => {
            data.sentiment = Math.max(0, Math.min(100, data.sentiment + delta));
            
            // ★変更：和睦中も、勝手に状態が戻らないように保護します！
            if (window.DiplomacyRules.isBasicSentimentStatus(data.status)) {
                if (data.sentiment >= 70) {
                    data.status = window.GameConstants.DiplomacyStatus.FRIENDLY;
                } else if (data.sentiment <= 30) {
                    data.status = window.GameConstants.DiplomacyStatus.HOSTILE;
                } else {
                    data.status = window.GameConstants.DiplomacyStatus.NORMAL;
                }
            }
        };

        update(dataA);
        update(dataB);
    }
    
    /**
     * 強制的に状態を変更し、相手側も同期する
     * ★追加：和睦の時に、期間（trucePeriod）も一緒に設定できるようにしました！
     */
    changeStatus(clanId, targetId, newStatus, trucePeriod = 0) {
        const dataA = this.getDiplomacyData(clanId, targetId);
        const dataB = this.getDiplomacyData(targetId, clanId);

        if (!dataA || !dataB) return;

        const oldStatusA = dataA.status;
        // 支配/従属を継続する時だけ継続月数を保つ。主従の向きが逆転した場合は新しい関係として0から数える。
        if (!window.DiplomacyRules.isVassalRelation(newStatus)
            || !window.DiplomacyRules.isVassalRelation(oldStatusA)
            || oldStatusA !== newStatus) {
            dataA.subordinateMonths = 0;
            dataB.subordinateMonths = 0;
        }

        // 基本外交statusだけを書き換える。婚姻(isMarriage)と人質(hostageIds)は独立した付加関係なので、
        // 同盟⇔支配/従属などの格上げ・格下げで副作用的に消してはいけない。
        // 和睦期間は和睦statusだけに属する値なので、別statusへ移る時に古い値を残さない。
        dataA.status = newStatus;
        dataA.trucePeriod = newStatus === window.GameConstants.DiplomacyStatus.TRUCE ? trucePeriod : 0;

        // 状態の反転処理と同調
        if (newStatus === window.GameConstants.DiplomacyStatus.DOMINANT) {
            dataB.status = window.GameConstants.DiplomacyStatus.SUBORDINATE;
        } else if (newStatus === window.GameConstants.DiplomacyStatus.SUBORDINATE) {
            dataB.status = window.GameConstants.DiplomacyStatus.DOMINANT;
        } else {
            // 同盟・敵対・和睦などは共通
            dataB.status = newStatus;
        }
        dataB.trucePeriod = newStatus === window.GameConstants.DiplomacyStatus.TRUCE ? trucePeriod : 0;

        // イベント保護は「そのイベントが作った関係」にだけ属する。後から別statusへ変わったら持ち越さない。
        // 歴史イベント側は changeStatus() の後で必要な関係にだけ isEvent=true を付け直す。
        if (oldStatusA !== newStatus) {
            dataA.isEvent = false;
            dataB.isEvent = false;
        }

        // ★今回追加：関係が変化したので、両方の大名家の「今月の外交目標」をリセットします！
        const clanA = this.game.clans.find(c => c.id === clanId);
        if (clanA && clanA.currentDiplomacyTarget && clanA.currentDiplomacyTarget.targetId === targetId) {
            clanA.currentDiplomacyTarget = null;
        }
        
        const clanB = this.game.clans.find(c => c.id === targetId);
        if (clanB && clanB.currentDiplomacyTarget && clanB.currentDiplomacyTarget.targetId === clanId) {
            clanB.currentDiplomacyTarget = null;
        }
    }

    /**
     * ★新しく追加！：毎月末に呼ばれて、和睦の期間を減らす魔法です
     */
    processEndMonth() {
        this.game.clans.forEach(clan => {
            if (!clan.diplomacyValue || clan.isDestroyed) return;
            
            for (const targetId in clan.diplomacyValue) {
                const data = clan.diplomacyValue[targetId];
                
                // ★追加：状態が「支配」か「従属」だったら、継続期間を1ヶ月増やします
                if (window.DiplomacyRules.isVassalRelation(data.status)) {
                    data.subordinateMonths = (data.subordinateMonths || 0) + 1;
                }

                // もし状態が「和睦」で、期間が1以上残っていたら…
                if (data.status === window.GameConstants.DiplomacyStatus.TRUCE && data.trucePeriod > 0) {
                    data.trucePeriod -= 1; // 期間を1ヶ月減らします
                    
                    // 減らした結果、期間が0になったら…
                    if (data.trucePeriod <= 0) {
                        // 感情値（仲の良さ）に合わせて、元の状態に戻します！
                        if (data.sentiment >= 70) {
                            data.status = window.GameConstants.DiplomacyStatus.FRIENDLY;
                        } else if (data.sentiment <= 30) {
                            data.status = window.GameConstants.DiplomacyStatus.HOSTILE;
                        } else {
                            data.status = window.GameConstants.DiplomacyStatus.NORMAL;
                        }
                    }
                }
            }
        });
    }
    
    /**
     * 指定した大名家の同盟・支配・従属の数を数えます
     */
    getAllyCount(clanId) {
        let count = 0;
        this.game.clans.forEach(c => {
            if (c.id !== 0 && c.id !== clanId && !c.isDestroyed) {
                const r = this.getRelation(clanId, c.id);
                if (r && window.DiplomacyRules.isAllianceOrVassal(r.status)) {
                    count++;
                }
            }
        });
        return count;
    }

    /**
     * 戦略的パートナー（共通の敵がいる、または背後を突ける）かどうかと、そのスコアを判定します
     */
    evaluateStrategicValue(myClanId, targetClanId, mainThreatId) {
        let isStrategicPartner = false;
        let priorityBonus = 0;

        if (mainThreatId !== 0 && mainThreatId !== targetClanId) {
            const targetToThreatRel = this.getRelation(targetClanId, mainThreatId);
            const myToThreatRel = this.getRelation(myClanId, mainThreatId);
            const rel = this.getRelation(myClanId, targetClanId);
            
            // ① 共通の敵がいる場合
            if (targetToThreatRel && window.DiplomacyRules.isHostile(targetToThreatRel.status) && myToThreatRel && window.DiplomacyRules.isHostile(myToThreatRel.status)) {
                isStrategicPartner = true;
                priorityBonus += 1000;
            } 
            // ② 敵対していない相手で、怖い敵の背後を突ける場合
            else if (!window.DiplomacyRules.isHostile(rel.status)) {
                const isFriendlyWithThreat = targetToThreatRel && window.DiplomacyRules.isFriendly(targetToThreatRel.status);
                if (!isFriendlyWithThreat) {
                    let isAdjacent = false;
                    const threatCastles = this.game.getClanCastles(mainThreatId);
                    const targetCastles = this.game.getClanCastles(targetClanId);
                    
                    for (let tc of targetCastles) {
                        for (let mc of threatCastles) {
                            if (MapGraphService.isAdjacent(tc, mc)) {
                                isAdjacent = true; break;
                            }
                        }
                        if (isAdjacent) break;
                    }
                    if (isAdjacent) {
                        isStrategicPartner = true;
                        priorityBonus += 300;
                    }
                }
            }
        }
        return { isStrategicPartner, priorityBonus };
    }

    /**
     * AIが外交相手を選ぶための「優先度リスト」を作成します
     */
    getDiplomacyPriorityList(myClanId, uniqueNeighbors, mainThreatId) {
        const diplomacyTargets = [];
        uniqueNeighbors.forEach(targetClanId => {
            let priority = 0;
            const rel = this.getRelation(myClanId, targetClanId);
            
            // 1. 戦略的価値を調べる
            const strategic = this.evaluateStrategicValue(myClanId, targetClanId, mainThreatId);
            priority += strategic.priorityBonus;
            
            // 2. 現在の仲の良さで評価する
            if (!window.DiplomacyRules.isHostile(rel.status)) {
                priority += rel.sentiment * 2;
            } else {
                priority -= 500;
            }

            // ★追加：臣従イベントを目指す相手への優先度（スコア）アップ！
            if (rel.status === '従属' && rel.sentiment < 100) {
                const myClanData = this.game.clans.find(c => c.id === myClanId);
                const targetClanData = this.game.clans.find(c => c.id === targetClanId);
                if (myClanData && targetClanData) {
                    // 相手の威信が自分の12倍以上あるかを調べます
                    if (targetClanData.daimyoPrestige >= myClanData.daimyoPrestige * 12) {
                        // 従属期間が長いほど、臣従を急ぐためスコアを高くします
                        if ((rel.subordinateMonths || 0) >= 20) {
                            priority += 150; // 24ヶ月に近いので大きく加点して最優先に！
                        } else if ((rel.subordinateMonths || 0) >= 12) {
                            priority += 50;  // 期間が近づいてきたら少し加点して意識し始めます
                        }
                    }
                }
            }
            
            diplomacyTargets.push({ 
                clanId: targetClanId, 
                priority: priority,
                isStrategicPartner: strategic.isStrategicPartner 
            });
        });

        // 優先度が高い順に並べ替える
        diplomacyTargets.sort((a, b) => b.priority - a.priority);
        return diplomacyTargets;
    }
    
    /**
     * 親善による友好度の上昇量を計算します
     */
    calcGoodwillIncrease(gold, doer) {
        const statBonus = ((doer.diplomacy * 1.5) + (Math.sqrt(doer.loyalty) * 2)) / 20;
        const goldBonus = gold / 1000;
        const totalFloat = statBonus * goldBonus;
        return Math.max(1, Math.round(totalFloat));
    }
    
    /**
     * 外交の成功確率（％）を計算して返す魔法です
     * 武将のIDなどから、必要な情報を自動で集めて計算します！
     */
    getDiplomacyProb(doerId, targetId, type, gold = 0) {
        // IDから必要な情報を自分で集めます
        const doer = this.game.getBusho(doerId);
        const targetCastle = this.game.getCastle(targetId);
        const targetClanId = targetCastle.ownerClan;
        const doerClanId = doer.clan;
        const doerDiplomacy = doer.diplomacy;
        const myPower = this.game.getClanTotalSoldiers(doerClanId) || 1;
        const targetPower = this.game.getClanTotalSoldiers(targetClanId) || 1;

        const relation = this.getRelation(doerClanId, targetClanId);
        
        // 共通の敵がいるか
        const commonEnemy = this.game.clans.some(c => {
            if (c.id === 0 || c.id === doerClanId || c.id === targetClanId || c.isDestroyed) return false;
            const r1 = this.getRelation(doerClanId, c.id);
            const r2 = this.getRelation(targetClanId, c.id);
            return r1 && r2 && r1.status === '敵対' && r2.status === '敵対';
        });

        // 仲良しの大名家の数
        const allyCount = this.getAllyCount(targetClanId);
        
        let finalProb = 0;

        if (type === 'goodwill') {
            let acceptProb = 100;
            if (relation.sentiment <= 50) acceptProb = relation.sentiment * 2;
            if (commonEnemy) acceptProb += 30;
            if (allyCount >= 2) acceptProb -= (allyCount - 1) * 20;
            if (targetPower > myPower) acceptProb *= (Math.sqrt(myPower) / Math.sqrt(targetPower));
            
            // ★追加：持参した金による確率アップ（15金につき0.1%アップ。1500金で最大10%アップします）
            acceptProb += (gold / 15) * 0.1;
            
            // 技能による外交補正は SkillManager の現行共通APIだけを使います。
            if (typeof SkillManager !== 'undefined') {
                acceptProb += SkillManager.calcDiplomacyProbBonus('goodwill', doer, this.game);
            }
            
            // ★友好・同盟・支配・従属のいずれかの関係なら最終的な確率に+50%、和睦は+30%します
            if (window.DiplomacyRules.isFriendly(relation.status)) {
                acceptProb += 50;
            } else if (relation.status === '和睦') {
                acceptProb += 30;
            }
            // 婚姻はstatusとは独立した信頼材料として親善判定を後押しする。
            acceptProb += this.getMarriageDiplomacyBonus(type, relation);
            
            finalProb = Math.max(0, Math.min(100, acceptProb));

            // ★兵力差などで確率が下がっても、必ず50%以上の成功率になるお守り
            if (window.DiplomacyRules.isFriendly(relation.status) && finalProb < 50) {
                finalProb = 50;
            }
        }
        else if (type === 'alliance' || type === 'subordinate' || type === 'truce') {
            // 共通敵補正は同盟・従属願の『共に同じ相手へ備える』判断だけに使う。
            // 和睦でこれを使うと、A・B双方と敵対中にAと和睦しただけで、
            // Bとの和睦成功率まで変わるという他戦線依存が発生するため適用しない。
            const useCommonEnemyBonus = type !== 'truce' && commonEnemy;
            let threshold = useCommonEnemyBonus ? 90 : 120; 
            let acceptProb = useCommonEnemyBonus ? 90 : 70; 

            // 和睦と従属願の場合は、同盟よりもハードルを下げて成功しやすくします
            if (type === 'subordinate' || type === 'truce') {
                threshold -= 20; // 成功に必要な点数の基準を下げます
                acceptProb += 10; // 基本の成功確率を少し上げます
            }

            if (allyCount >= 2) {
                acceptProb -= (allyCount - 1) * 20; 
                threshold += (allyCount - 1) * 10;  
            }

            // 相手の方が兵力が多い場合のペナルティ計算
            if (targetPower > myPower) {
                // ただし、従属願（相手にひれ伏す）の場合は兵力差による確率低下をナシにします！
                if (type !== 'subordinate') {
                    acceptProb *= (Math.sqrt(myPower) / Math.sqrt(targetPower));
                }
            }

            const chance = relation.sentiment + doerDiplomacy;

            // ★追加: 技能による同盟ボーナス
            if (type === 'alliance' && typeof SkillManager !== 'undefined' && SkillManager.calcDiplomacyProbBonus) {
                acceptProb += SkillManager.calcDiplomacyProbBonus('alliance', doer, this.game);
            }

            if (type === 'subordinate') {
                const targetDaimyo = this.game.getClanDaimyo(targetClanId);
                const targetDuty = targetDaimyo ? targetDaimyo.duty : 50;
                acceptProb += (targetDuty - 50); 
            } else if (type === 'truce') {
                // 和睦を「受ける」判断は受諾側(targetClanId)が抱える敵対数を見る。
                // 申し込む側の敵対数は和睦を申し込む動機にだけ使い、ここへ混ぜない。
                const receiverEnemyCount = this._countHostileClans(targetClanId);
                acceptProb += (receiverEnemyCount * 15);
            }

            // 婚姻は同盟・従属願の成立を後押しするが、基本status自体は変えない。
            acceptProb += this.getMarriageDiplomacyBonus(type, relation);

            if (chance > threshold) {
                finalProb = Math.min(100, acceptProb);
            } else {
                finalProb = chance - threshold;
            }
        }
        // ★ここから追加：婚姻の成功確率（同盟より少し成功しやすく緩和します！）
        else if (type === 'marriage') {
            let threshold = commonEnemy ? 90 : 120; 
            let acceptProb = commonEnemy ? 90 : 70; 

            if (allyCount >= 2) {
                acceptProb -= (allyCount - 1) * 20; 
                threshold += (allyCount - 1) * 10;  
            }

            // ★緩和その１：兵力差による確率の低下を「3分の2」に緩和します！
            if (targetPower > myPower) {
                // 本来ならどれくらい確率を引かれるか（ペナルティの量）を計算します。兵力にはルートをかけて緩和します。
                const penalty = 1.0 - (Math.sqrt(myPower) / Math.sqrt(targetPower));
                // ペナルティの量を「3分の2」にオマケしてあげます
                const mitigatedPenalty = penalty * (2 / 3);
                // オマケしたあとのペナルティを使って、最終的な確率を計算します
                acceptProb *= (1.0 - mitigatedPenalty);
            }

            // ★緩和その２：友好度が低いことによるマイナス影響を「2分の1」に緩和します！
            // 満点(100)からどれくらい友好度が下がっているかを計算します
            const sentimentDrop = 100 - relation.sentiment;
            // 下がってしまった分を「半分（2分の1）だけ大目に見る」という魔法をかけます
            const effectiveSentiment = relation.sentiment + (sentimentDrop / 2);

            // オマケしてもらった友好度を使って、成功のハードルを超えられるかチェックします
            const chance = effectiveSentiment + doerDiplomacy;
            if (chance > threshold) {
                finalProb = Math.min(100, acceptProb);
            } else {
                finalProb = chance - threshold;
            }
        }
        else if (type === 'dominate') {
            const powerRatio = myPower / Math.max(1, targetPower);
            if (powerRatio >= 5) {
                let prob = 20;
                if (powerRatio >= 15) prob = 70;
                else prob = 20 + (powerRatio - 5) * (50 / 10);
                
                if (doerDiplomacy >= 50) prob += Math.min(10, (doerDiplomacy - 50) * 0.2);
                // 姻戚関係にある相手への降伏勧告は、完全な他家より受け入れられやすい。
                prob += this.getMarriageDiplomacyBonus(type, relation);
                
                let isAlreadySubordinate = false;
                this.game.clans.forEach(c => {
                    if (c.id !== 0 && c.id !== targetClanId && c.id !== doerClanId && !c.isDestroyed) {
                        const rel = this.getRelation(targetClanId, c.id);
                        if (rel && rel.status === '従属') isAlreadySubordinate = true;
                    }
                });
                
                if (isAlreadySubordinate) prob *= 0.2;
                
                finalProb = Math.max(0, Math.min(100, prob));
            }
        }

        // ★追加：使者を送った側の大名が、送られた側の大名の宿敵リストに入っている場合は確率を半減
        if (finalProb > 0) {
            const doerDaimyo = this.game.getClanDaimyo(doerClanId);
            const targetDaimyo = this.game.getClanDaimyo(targetClanId);
            
            if (doerDaimyo && targetDaimyo && targetDaimyo.nemesisIds && targetDaimyo.nemesisIds.includes(doerDaimyo.id)) {
                finalProb = Math.floor(finalProb / 2);
            }
        }

        return finalProb;
    }
    
    /**
     * 「支配」関係による強制援軍かどうかを一元判定します。
     * ＜表裏比興＞などで主家の要請を拒否できる場合は強制扱いにしません。
     */
    _isForcedBossReinforcement(requesterClanId, helperForceId, isKunishu = false) {
        if (isKunishu) return false;
        const relation = this.getRelation(requesterClanId, helperForceId);
        if (!relation || relation.status !== '支配') return false;

        if (typeof SkillManager !== 'undefined' && SkillManager.canDeclineBossReinforcement(helperForceId, this.game)) {
            return false;
        }
        return true;
    }

    /**
     * 他の大名家や諸勢力が援軍要請を承諾する確率（％）を計算する魔法です（最新版）
     */
    getReinforcementAcceptProb(myClanId, helperForceId, enemyClanId, gold, isKunishu, myTotalSoldiers, enemyTotalSoldiers, helperCastleId = 0) {
        if (this._isForcedBossReinforcement(myClanId, helperForceId, isKunishu)) {
            return 100;
        }

        let sentiment = 50;
        let relationStatus = '普通';
        let helperToEnemySentiment = 50;
        let duty = 50;
        let isMarriage = false; // 結婚しているかを記録する箱を用意します

        if (isKunishu) {
            const kunishu = this.game.kunishuSystem.getKunishu(helperForceId);
            if (!kunishu) return 0;
            sentiment = kunishu.getRelation(myClanId);
            helperToEnemySentiment = (enemyClanId === 0) ? 50 : kunishu.getRelation(enemyClanId);
            const leader = this.game.getBusho(kunishu.leaderId);
            duty = leader ? leader.duty : 50;
        } else {
            const myToHelperRel = this.getRelation(myClanId, helperForceId);
            sentiment = myToHelperRel ? myToHelperRel.sentiment : 50;
            relationStatus = myToHelperRel ? myToHelperRel.status : '普通';
            isMarriage = myToHelperRel ? myToHelperRel.isMarriage : false; // 結婚シールを確認します
            
            const helperToEnemyRel = (enemyClanId === 0) ? null : this.getRelation(helperForceId, enemyClanId);
            helperToEnemySentiment = helperToEnemyRel ? helperToEnemyRel.sentiment : 50;
            
            const helperDaimyo = this.game.getClanDaimyo(helperForceId);
            duty = helperDaimyo ? helperDaimyo.duty : 50;
        }

        // ★AIが援軍を受諾する確率を求める計算式
        const sentimentBonus = sentiment / 200;
        const goldBonus = Math.min(1500, gold) / 20000;
        
        let relationBonus = 0;
        if (relationStatus === '同盟') {
            // 同盟そのものの援軍ボーナス。婚姻は下で独立して加算する。
            relationBonus = 0.15;
        } else if (relationStatus === '従属') {
            // 自分が相手に従属（支配されている状態）している時だけ、相手の義理に合わせて0%〜30%の間で変動させます
            relationBonus = duty * 0.003;
        }
        if (isMarriage) {
            // 婚姻は同盟・支配・従属などのstatusに依存せず、姻戚として援軍受諾を後押しする。
            relationBonus += window.MainParams.Diplomacy.Marriage.ReinforcementProbBonus;
        }
        
        const enemyHateBonus = (50 - helperToEnemySentiment) / 100;
        const powerBonus = -1 + ((Math.sqrt(Math.max(1, myTotalSoldiers)) / 2) / Math.max(0.1, (Math.sqrt(Math.max(1, enemyTotalSoldiers)) / 2)));
        const dutyBonus = 0.5 + (duty / 100);
        
        // ★追加：勢力A（要請元）が滅びたら勢力B（敵）と勢力C（援軍先）が隣接してしまい、かつ敵が強大な場合のバッファ維持ボーナス
        let bufferBonus = 0;
        if (!isKunishu && enemyClanId !== 0) {
            const helperTotalSoldiers = this.game.getClanTotalSoldiers(helperForceId) || 1;
            // 敵が自分（援軍先）の8割以上の兵力を持っている（格上かそれに迫る勢い）
            if (enemyTotalSoldiers >= helperTotalSoldiers * 0.8) {
                let isAlreadyAdjacent = false;
                let willBeAdjacent = false;
                
                const helperCastles = this.game.castles.filter(c => c.ownerClan === helperForceId);
                const enemyCastles = this.game.castles.filter(c => c.ownerClan === enemyClanId);
                const myCastles = this.game.castles.filter(c => c.ownerClan === myClanId);
                
                // 初めから隣接しているかチェック
                for (let hc of helperCastles) {
                    for (let ec of enemyCastles) {
                        if (MapGraphService.isAdjacent(hc, ec)) {
                            isAlreadyAdjacent = true;
                            break;
                        }
                    }
                    if (isAlreadyAdjacent) break;
                }
                
                // 隣接していない場合、要請元の城が敵に奪われたら隣接してしまうかチェック
                if (!isAlreadyAdjacent) {
                    for (let hc of helperCastles) {
                        for (let mc of myCastles) {
                            if (MapGraphService.isAdjacent(hc, mc)) {
                                willBeAdjacent = true;
                                break;
                            }
                        }
                        if (willBeAdjacent) break;
                    }
                    
                    // 新たに強敵と隣接してしまうならボーナス（0.15 = 15%）を設定
                    if (willBeAdjacent) {
                        bufferBonus = 0.15;
                    }
                }
            }
        }
        
        let successRate = ((sentimentBonus + goldBonus + relationBonus + enemyHateBonus + powerBonus + bufferBonus) * dutyBonus);
        
        // 0%～100%の範囲に収める
        let prob = Math.max(0, Math.min(1, successRate)) * 100;
        
        // ★お願いした先の大名家の該当拠点（軍団）が攻撃の作戦中だったら確率を半分にする
        if (!isKunishu && this.game.aiOperationManager && this.game.aiOperationManager.operations) {
            const clanOps = this.game.aiOperationManager.operations[helperForceId];
            if (clanOps) {
                let targetLegionId = 0;
                if (helperCastleId) {
                    const hCastle = this.game.getCastle(helperCastleId);
                    if (hCastle) targetLegionId = hCastle.legionId || 0;
                }
                const helperOp = clanOps[targetLegionId];
                if (helperOp && helperOp.type === '攻撃') {
                    prob = Math.floor(prob / 2);
                }
            }
        }

        // ★追加：要請した側の大名が、要請された側の大名の宿敵なら確率半減
        if (!isKunishu && prob > 0) {
            const myDaimyo = this.game.getClanDaimyo(myClanId);
            const helperDaimyo = this.game.getClanDaimyo(helperForceId);
            if (myDaimyo && helperDaimyo && helperDaimyo.nemesisIds && helperDaimyo.nemesisIds.includes(myDaimyo.id)) {
                prob = Math.floor(prob / 2);
            }
        }

        return Math.max(0, Math.min(100, prob));
    }

    /**
     * 大名家へ援軍を要請するときの持参金を共通計算します。
     * 攻撃側・守備側で同じ戦力比ルールを使い、支配下の勢力は0金とします。
     */
    calcReinforcementOfferGold(requesterClanId, helperClanId, availableGold = 0) {
        const requesterPower = this.game.getClanTotalSoldiers(requesterClanId) || 1;
        const helperPower = this.game.getClanTotalSoldiers(helperClanId) || 1;
        const ratio = helperPower / Math.max(1, requesterPower);

        let gold = 300;
        if (ratio >= 3.0) {
            gold = 1000;
        } else if (ratio > 1.5) {
            gold = 300 + ((ratio - 1.5) / 1.5) * 700;
        }
        gold = Math.floor(gold / 100) * 100;
        gold = Math.min(gold, Math.max(0, Number(availableGold) || 0));

        const relation = this.game.getRelation(requesterClanId, helperClanId);
        if (relation && relation.status === window.GameConstants.DiplomacyStatus.DOMINANT) return 0;
        return gold;
    }

    /**
     * AIが援軍要請を受けたときの「実効承諾確率」を返します。
     *
     * - 通常の確率計算は getReinforcementAcceptProb() に一元化
     * - 大雪中は原則として援軍を拒否
     * - ただし「支配」関係で、援軍拒否可能スキルを持たない場合は強制参加
     *
     * 実際にサイコロを振る処理とは分離し、AIの候補評価でも同じ確率を使えるようにします。
     */
    getAIReinforcementAcceptanceInfo({
        requesterClanId,
        helperForceId,
        enemyClanId,
        gold = 0,
        isKunishu = false,
        requesterTotalSoldiers = 0,
        enemyTotalSoldiers = 0,
        helperCastleId = 0,
        isHeavySnow = false
    }) {
        const forcedByDominance = this._isForcedBossReinforcement(requesterClanId, helperForceId, isKunishu);

        // 大雪時は原則拒否。ただし、拒否権のない「支配」関係だけは強制参加します。
        if (isHeavySnow && !forcedByDominance) {
            return {
                probability: 0,
                forcedByDominance: false,
                blockedByHeavySnow: true
            };
        }

        const probability = forcedByDominance
            ? 100
            : this.getReinforcementAcceptProb(
                requesterClanId,
                helperForceId,
                enemyClanId,
                gold,
                isKunishu,
                requesterTotalSoldiers,
                enemyTotalSoldiers,
                helperCastleId
            );

        return {
            probability: Math.max(0, Math.min(100, probability)),
            forcedByDominance,
            blockedByHeavySnow: false
        };
    }

    /**
     * AI援軍要請の最終承諾判定。
     * 攻撃側・守備側とも必ずこの窓口からサイコロを振ります。
     */
    checkAIReinforcementAcceptance(options, randomFn = Math.random) {
        const info = this.getAIReinforcementAcceptanceInfo(options);
        const accepted = info.forcedByDominance || (randomFn() * 100 < info.probability);
        return { ...info, accepted };
    }

    /**
     * 外交の成功判定を行います
     */
    checkDiplomacySuccess(doerId, targetId, type, gold = 0) {
        // 外交担当が自分で計算した確率を使って、サイコロを振ります
        const prob = this.getDiplomacyProb(doerId, targetId, type, gold);
        return (Math.random() * 100) < prob;
    }
    
    _returnEscapedHostageHome(hostage) {
        if (!hostage) return false;
        const originClanId = Number(hostage.originalClanId) || 0;
        hostage.isHostage = false;
        hostage.originalClanId = undefined;

        const friendlyCastles = this.game.castles.filter(c => Number(c.ownerClan) === originClanId);
        if (originClanId > 0 && friendlyCastles.length > 0) {
            const escapeCastle = friendlyCastles[Math.floor(Math.random() * friendlyCastles.length)];
            // joinClan は人質受け渡し時の功績・派閥処理をもう一度発生させるため使わない。
            this.game.affiliationSystem.setClanIdRaw(hostage, originClanId);
            this.game.affiliationSystem.moveCastle(hostage, escapeCastle.id);
        } else {
            this.game.affiliationSystem.becomeRonin(hostage);
        }
        return true;
    }

    _makeCapturedHostageRecord(hostage) {
        if (!hostage) return { busho: null, originClanId: 0, captorClanId: 0 };
        return {
            busho: hostage,
            originClanId: Number(hostage.originalClanId) || 0,
            captorClanId: Number(hostage.clan) || 0
        };
    }

    _convertCapturedHostageToPrisoner(record) {
        const hostage = record && record.busho;
        if (!hostage) return null;
        const originClanId = Number(record.originClanId) || 0;
        hostage.isHostage = false;
        hostage.originalClanId = undefined;
        if (originClanId > 0) {
            // 物理的な拘束先（castleId）はそのままに、通常捕虜が期待する元所属だけ復元する。
            this.game.affiliationSystem.setClanIdRaw(hostage, originClanId);
        }
        return hostage;
    }

    /**
     * 同盟や従属を破棄した時のペナルティを計算して適用します
     */
    applyBreakAlliancePenalty(doerClanId, targetClanId, doerBusho = null) {
        const relation = this.getRelation(doerClanId, targetClanId);
        const oldStatus = relation.status;
        const oldSentiment = relation.sentiment;

        let targetDrop = -60; 
        let globalDrop = 0; 
        let isBetrayal = false;
        let isBreakDomination = false;

        if (oldStatus === '同盟' && oldSentiment >= 70) {
            targetDrop = -70; globalDrop = -10; isBetrayal = true;
        } else if (oldStatus === '従属' && oldSentiment >= 70) {
            targetDrop = -100; globalDrop = -10; isBetrayal = true;
        } else if (oldStatus === '支配') {
            targetDrop = -100; 
            globalDrop = -15;  
            isBetrayal = true; 
            isBreakDomination = true; 
        }

        // ★追加: 表裏比興によるペナルティ軽減処理
        let mods = { targetDropMult: 1.0, globalDropMult: 1.0, preventLoyaltyDrop: false };
        if (typeof SkillManager !== 'undefined') {
            mods = SkillManager.getBreakAlliancePenaltyModifiers(doerBusho, doerClanId, this.game);
        }

        // スキルの効果に合わせて数値を増減させます
        targetDrop = Math.floor(targetDrop * mods.targetDropMult);
        globalDrop = Math.floor(globalDrop * mods.globalDropMult);

        this.updateSentiment(doerClanId, targetClanId, targetDrop);

        const newRel = this.getRelation(doerClanId, targetClanId);
        let newStatus = '普通';
        if (newRel.sentiment <= 30) newStatus = '敵対';
        else if (newRel.sentiment >= 70) newStatus = '友好';
        this.changeStatus(doerClanId, targetClanId, newStatus);

        if (isBetrayal) {
            this.game.clans.forEach(c => {
                if (c.id !== 0 && c.id !== doerClanId && c.id !== targetClanId && !c.isDestroyed) {
                    this.updateSentiment(doerClanId, c.id, globalDrop);
                }
            });
        }

        // 忠誠低下を防ぐ効果がなければ、そのまま低下させます
        if (isBreakDomination && !mods.preventLoyaltyDrop) {
            this.game.bushos.forEach(busho => {
                if (busho.clan === doerClanId && window.BushoStatusRules.isActive(busho) && !busho.isDaimyo) {
                    busho.loyalty = Math.max(0, busho.loyalty - 5); 
                }
            });
        }
        
        // 婚姻・人質は基本statusとは別軸で保持する。
        // 関係破棄の結果が実際の敵対に至った時だけ、人質の脱走/拘束と嫁いだ姫の処遇へ進む。
        const becameHostile = newStatus === window.GameConstants.DiplomacyStatus.HOSTILE;
        let atMercyPrincesses = [];
        let capturedHostages = [];
        let capturedHostageRecords = [];
        let escapedHostages = [];
        let escapedHostageRecords = [];

        if (becameHostile) {
            this.game.bushos.forEach(b => {
                if (b.isHostage && ((Number(b.originalClanId) === Number(doerClanId) && Number(b.clan) === Number(targetClanId)) || (Number(b.originalClanId) === Number(targetClanId) && Number(b.clan) === Number(doerClanId)))) {
                    let chance = 0.5 - ((b.strength ?? 30) * 0.002) + (Math.random() * 0.3);
                    if (chance > 0.5) capturedHostages.push(b);
                    else escapedHostages.push(b);
                }
            });

            if (this.game.princesses) {
                this.game.princesses.forEach(p => {
                    const originClan = this._getPrincessOriginClanId(p);
                    const isBreakerPrincessInTarget = (originClan === doerClanId && p.currentClanId === targetClanId);
                    const isTargetPrincessInBreaker = (originClan === targetClanId && p.currentClanId === doerClanId);
                    if (p.status === 'married' && (isBreakerPrincessInTarget || isTargetPrincessInBreaker)) {
                        atMercyPrincesses.push(p);
                    }
                });
            }

            // 逃げ切った人質は、帰還前に元所属/受入側を記録してから人質関係を終了する。
            // 人質中は一時的に受入家の clan を持つため、城だけでなく所属も実家へ戻す。
            escapedHostageRecords = escapedHostages.map(b => this._makeCapturedHostageRecord(b));
            escapedHostages.forEach(b => {
                this._returnEscapedHostageHome(b);
            });

            // 捕まった人質も外交上の「人質」ではなく通常の捕虜へ移行する。
            // 捕虜処遇は prisoner.clan を元所属として参照するため、所属を実家へ戻した上で、
            // 捕らえた側は別レコードに保持して後続処理へ渡す。
            capturedHostageRecords = capturedHostages.map(b => this._makeCapturedHostageRecord(b));

            // 敵対化した時点で外交上の「人質」という担保関係は終了する。
            // 婚姻フラグは姫の処遇が決まるまで維持する。
            const dataA = this.getDiplomacyData(doerClanId, targetClanId);
            const dataB = this.getDiplomacyData(targetClanId, doerClanId);
            if (dataA) dataA.hostageIds = [];
            if (dataB) dataB.hostageIds = [];
        }

        return { 
            oldStatus, newStatus, becameHostile, isBetrayal, isBreakDomination,
            atMercyPrincesses, capturedHostages, capturedHostageRecords, escapedHostages, escapedHostageRecords 
        };
    }
    
    /**
     * 外交の経験値を計算し加算する魔法です
     * 内政などと同じ仕様で、isExecuteフラグを受け取ります
     */
    calcDiplomacyExp(doer, type, isSuccess, isExecute = false) {
        if (!doer) return 0;
        let exp = 0;
        
        if (['goodwill', 'subordinate', 'truce', 'break_alliance'].includes(type)) {
            exp = 5;
        } else if (['alliance', 'marriage', 'dominate'].includes(type)) {
            exp = isSuccess ? 15 : 5;
        }

        if (isExecute) {
            doer.expDiplomacy = (doer.expDiplomacy || 0) + exp;
        }
        
        return exp;
    }

    /**
     * 指定した関係が「攻撃してはいけない関係（不可侵）」かどうかを判定します
     */
    isNonAggression(status) {
        return ['同盟', '支配', '従属', '和睦'].includes(status);
    }

    /**
     * 武将の敬称付き呼び名を取得する共通窓口。
     * 官位・将軍候補・将軍の扱いは ConversationStandingRules を正本とする。
     */
    getCallName(busho, speaker = null) {
        if (window.ConversationStandingRules) {
            return window.ConversationStandingRules.getDiplomaticCallName(this.game, busho, speaker);
        }
        return busho ? `${busho.familyNameStr || busho.fullName || ''}殿` : '殿';
    }

    _getDaimyoReference(daimyo, clanName, suffix = '様') {
        if (!daimyo) return `${clanName || '当家'}当主${suffix}`;
        const special = window.ConversationStandingRules
            ? window.ConversationStandingRules.getSpecialAuthority(this.game, daimyo)
            : { key: 'none' };
        if (special.key === 'shogun') return `公方${suffix}`;
        const rank = window.ConversationStandingRules
            ? window.ConversationStandingRules.getHighestCourtRank(this.game, daimyo)
            : null;
        if (rank) return `${rank.rankName2}${suffix}`;
        return `${clanName || '当家'}当主・${daimyo.fullName}${suffix}`;
    }

    /**
     * 外交会話用の関係温度を返す。
     * 格式とは混ぜず、敵対なら少し硬く、友好的な関係なら少し柔らかい言い回しへ使う。
     */
    getDiplomacyRelationshipTone(senderClanId, receiverClanId) {
        // 会話表示のためだけに外交データを新規生成しない。既存の関係状態を読むだけに留める。
        const senderClan = this.game && typeof this.game.getClan === 'function' ? this.game.getClan(senderClanId) : null;
        const receiverClan = this.game && typeof this.game.getClan === 'function' ? this.game.getClan(receiverClanId) : null;
        const relation = senderClan && senderClan.diplomacyValue ? senderClan.diplomacyValue[receiverClanId] : null;
        const reverse = receiverClan && receiverClan.diplomacyValue ? receiverClan.diplomacyValue[senderClanId] : null;
        const current = relation || reverse || null;
        const status = current ? current.status : null;
        if (window.DiplomacyRules && window.DiplomacyRules.isHostile(status)) {
            return { key: 'hostile', status, sentiment: Number(current && current.sentiment || 0) };
        }
        if (window.DiplomacyRules && window.DiplomacyRules.isFriendly(status)) {
            return { key: 'friendly', status, sentiment: Number(current && current.sentiment || 0) };
        }
        return { key: 'neutral', status, sentiment: Number(current && current.sentiment || 0) };
    }

    /**
     * 大名家の格式・威信と使者本人の身分/官位/功績を踏まえ、外交導入を一元生成する。
     * 使者は主君の格を背負う。ただし将軍・左馬頭など本人が特殊な公的権威を持つ場合は、
     * 主君の「名代」として自分を下げず、本人自身がこの外交を取り持つ立場として話す。
     * 敵対/友好の関係温度は格式とは別軸で、応対の愛想だけへ薄く反映する。
     */
    buildDiplomacyGreeting(senderBusho, receiverDaimyo) {
        const senderClan = this.game.getClan(senderBusho && senderBusho.clan);
        const senderClanName = senderClan ? senderClan.name : '当家';
        const senderCallName = this.getCallName(senderBusho, receiverDaimyo);
        const receiverCallName = this.getCallName(receiverDaimyo, senderBusho);
        const context = window.ConversationStandingRules
            ? window.ConversationStandingRules.getDiplomacyContext(this.game, senderBusho, receiverDaimyo)
            : { receiverDeferenceLevel: 0, senderDeferenceLevel: 0, envoyOutranksLord: false, senderDaimyo: this.game.getClanDaimyo(senderBusho.clan), envoySpecial: { level: 0, key: 'none' } };
        context.relationshipTone = this.getDiplomacyRelationshipTone(senderBusho && senderBusho.clan, receiverDaimyo && receiverDaimyo.clan);
        const senderFamilyRelation = context.senderToReceiverFamilyRelation || 'none';
        const receiverFamilyRelation = context.receiverToSenderFamilyRelation || 'none';
        const senderAddressesFamily = window.ConversationStandingRules
            && window.ConversationStandingRules.isDirectFamilyRelation(senderFamilyRelation);
        const receiverAddressesFamily = window.ConversationStandingRules
            && window.ConversationStandingRules.isDirectFamilyRelation(receiverFamilyRelation);
        const receiverRegardsSenderAsSeniorFamily = window.ConversationStandingRules
            && window.ConversationStandingRules.isSeniorFamilyRelation(receiverFamilyRelation);

        let greetMsg1 = '';
        let greetMsg2 = '';

        if (senderBusho && senderBusho.isDaimyo) {
            const senderPosture = context.senderSpeakerPosture && context.senderSpeakerPosture.key || 'normal';
            if (senderPosture === 'senior_close') {
                greetMsg1 = `「${receiverCallName}。大事な話があって、わし自ら来た」`;
            } else if (senderPosture === 'senior_extended') {
                greetMsg1 = `「${receiverCallName}。少し大事な用向きがあって、わし自ら参った」`;
            } else if (senderPosture === 'higher_court') {
                greetMsg1 = `「${receiverCallName}。大事な用向きゆえ、わし自ら参った」`;
            } else if (Number(context.senderDeferenceLevel || 0) >= 2) {
                greetMsg1 = `「${receiverCallName}。折り入ってお願いがあり、某自ら参上いたしました」`;
            } else if (Number(context.senderDeferenceLevel || 0) === 1) {
                greetMsg1 = `「${receiverCallName}。大事な用向きゆえ、わし自ら参りました」`;
            } else {
                greetMsg1 = `「${receiverCallName}。大事な用件ゆえ、わし自ら参りました」`;
            }
        } else {
            const senderDaimyo = context.senderDaimyo || this.game.getClanDaimyo(senderBusho.clan);
            const envoySpecial = context.envoySpecial || { level: 0, key: 'none' };
            const familyLead = senderAddressesFamily ? `${receiverCallName}。` : '';
            if (Number(envoySpecial.level || 0) >= 3) {
                greetMsg1 = `「${familyLead}両家のため、此度はわし自ら参った」`;
            } else if (Number(envoySpecial.level || 0) >= 2) {
                greetMsg1 = `「${familyLead}両家のため、此度は某自ら参った」`;
            } else if (context.envoyOutranksLord) {
                const daimyoRef = this._getDaimyoReference(senderDaimyo, senderClanName, '殿');
                greetMsg1 = `「${familyLead}此度は${daimyoRef}の意を受け、使者として参りました」`;
            } else {
                const daimyoRef = this._getDaimyoReference(senderDaimyo, senderClanName, '様');
                if (senderAddressesFamily) {
                    // 父上・兄上等へ「お目通りを賜り」は他人行儀すぎるので、家族呼称を使う時は用件だけ簡潔に述べる。
                    greetMsg1 = `「${familyLead}此度は${daimyoRef}の名代として参りました」`;
                } else {
                    greetMsg1 = Number(context.senderDeferenceLevel || 0) >= 2
                        ? `「此度は${daimyoRef}の名代として参りました。お目通り、かたじなく存じます」`
                        : `「此度は${daimyoRef}の名代として罷り越しました」`;
                }
            }
        }

        const receiverDeference = Number(context.receiverDeferenceLevel || 0);
        const relationshipTone = context.relationshipTone && context.relationshipTone.key || 'neutral';
        if (receiverAddressesFamily) {
            // 親族本人への応対では、格式による敬称より家族呼称を優先する。ただし敵対/友好の温度は残す。
            // 年長親族には「父上か」のようなぞんざいな係助詞を付けず、年少側は「信忠か」のように自然に受ける。
            if (receiverRegardsSenderAsSeniorFamily) {
                if (relationshipTone === 'hostile') {
                    greetMsg2 = `「……${senderCallName}。して、此度はどのような御用でしょうか？」`;
                } else if (relationshipTone === 'friendly') {
                    greetMsg2 = `「${senderCallName}。よくお越しくださいました。御用向きは？」`;
                } else {
                    greetMsg2 = `「${senderCallName}。して、此度はどのような御用向きでしょうか？」`;
                }
            } else if (relationshipTone === 'hostile') {
                greetMsg2 = `「……${senderCallName}か。して、用向きは？」`;
            } else if (relationshipTone === 'friendly') {
                greetMsg2 = `「${senderCallName}か。よく来た。して、用向きは？」`;
            } else {
                greetMsg2 = `「${senderCallName}か。して、此度の用向きは？」`;
            }
        } else if (relationshipTone === 'hostile') {
            if (receiverDeference >= 3) {
                greetMsg2 = `「これは${senderCallName}。……御用向きを承りましょう」`;
            } else if (receiverDeference === 2) {
                greetMsg2 = `「${senderCallName}か。……して、此度の御用向きは？」`;
            } else if (receiverDeference === 1) {
                greetMsg2 = `「${senderCallName}か。使者の役目は承った。して、御用向きは？」`;
            } else if (senderBusho && senderBusho.isDaimyo) {
                greetMsg2 = `「……これは${senderCallName}。して、此度は何用にござるか？」`;
            } else {
                greetMsg2 = `「……使者か。して、用向きは？」`;
            }
        } else if (relationshipTone === 'friendly') {
            if (receiverDeference >= 3) {
                greetMsg2 = `「これは${senderCallName}。よくお越しくだされた。御用向きを承ろう」`;
            } else if (receiverDeference === 2) {
                greetMsg2 = `「これは${senderCallName}。遠路ご苦労であった。御用向きは？」`;
            } else if (receiverDeference === 1) {
                greetMsg2 = `「これは${senderCallName}。使者の役目、ご苦労にござる。御用向きは？」`;
            } else if (senderBusho && senderBusho.isDaimyo) {
                greetMsg2 = `「これは${senderCallName}。よう参られた。御用向きはいかに？」`;
            } else {
                greetMsg2 = `「おお、使者か。して、御用向きはいかに？」`;
            }
        } else if (receiverDeference >= 3) {
            greetMsg2 = `「これは${senderCallName}。御自らとは……御用向きを承りましょう」`;
        } else if (receiverDeference === 2) {
            greetMsg2 = `「これは${senderCallName}。遠路ご足労いただいた。御用向きは？」`;
        } else if (receiverDeference === 1) {
            greetMsg2 = `「${senderCallName}か。使者の役目、ご苦労にござる。御用向きは？」`;
        } else if (senderBusho && senderBusho.isDaimyo) {
            greetMsg2 = `「これは${senderCallName}……御用向きはいかに？」`;
        } else {
            greetMsg2 = `「うむ。して、御用向きはいかに？」`;
        }

        return { greetMsg1, greetMsg2, context };
    }

    _styleDiplomacyTextForSpeaker(text, postureKey) {
        let result = String(text || '');
        if (!['senior_close', 'senior_extended', 'higher_court'].includes(postureKey)) return result;

        if (window.ConversationStandingRules
            && typeof window.ConversationStandingRules.applyIndependentDaimyoRegister === 'function') {
            result = window.ConversationStandingRules.applyIndependentDaimyoRegister(result);
        }

        result = result
            .replace(/承知仕った/g, '承知した')
            .replace(/承知いたす/g, '承知した')
            .replace(/承知いたしました/g, '承知した')
            .replace(/左様にござるか/g, 'そうか')
            .replace(/左様にござる/g, 'そうだな')
            .replace(/にござる/g, 'だ')
            .replace(/存ずる/g, '思う')
            .replace(/存じまする/g, '思う')
            .replace(/頂戴いたす/g, '受け取ろう')
            .replace(/お受けいたそう/g, '受けよう')
            .replace(/返答いたす/g, '返答しよう')
            .replace(/お願いいたす/g, '頼みたい')
            .replace(/お願い申し上げる/g, '頼みたい')
            .replace(/参りましょうぞ/g, '参ろう')
            .replace(/参りましょう/g, '参ろう')
            .replace(/なされる/g, 'する')
            .replace(/なされた/g, 'した')
            .replace(/なされよ/g, 'されよ');

        if (postureKey === 'senior_close') {
            return result
                .replace(/さすがは([^。]+)。くれぐれも約定を違えられぬよう頼みたい/g, 'さすがは$1だ。約定は違えるでないぞ')
                .replace(/ご承諾いただけるか/g, '承知してくれるか')
                .replace(/吉日を選びましょうぞ/g, '吉日を選ぶとしよう')
                .replace(/ではこれにて失礼いたす/g, 'では、今日はこれで戻ろう')
                .replace(/どうぞお受け取りくだされ/g, '受け取ってくれ')
                .replace(/どうかお納めくだされ/g, '納めてくれ')
                .replace(/お引き取りくだされ/g, '今日は引き取ってくれ')
                .replace(/お引き取りを/g, '今日は引き取ってくれ')
                .replace(/ご容赦くだされ/g, 'そこは分かってくれ')
                .replace(/ご一考いただきたい/g, '一度考えてみてくれ')
                .replace(/いただきたい/g, 'もらいたい')
                .replace(/くだされ/g, 'くれ')
                .replace(/賜りたく/g, '受けたく')
                .replace(/願いたく/g, '願って');
        }

        return result
            .replace(/ご承諾いただけるか/g, '承知してもらえるか')
            .replace(/吉日を選びましょうぞ/g, '吉日を選ぶとしよう')
            .replace(/ではこれにて失礼いたす/g, 'では、今日はこれで失礼しよう')
            .replace(/どうぞお受け取りくだされ/g, '受け取ってもらいたい')
            .replace(/どうかお納めくだされ/g, '納めてもらいたい')
            .replace(/お引き取りくだされ/g, '引き取ってもらいたい')
            .replace(/お引き取りを/g, '引き取ってもらいたい')
            .replace(/ご容赦くだされ/g, 'そこは容赦してもらいたい')
            .replace(/ご一考いただきたい/g, '一度考えてもらいたい')
            .replace(/いただきたい/g, 'もらいたい')
            .replace(/くだされ/g, 'もらいたい')
            .replace(/賜りたく/g, '受けたく')
            .replace(/願いたく/g, '願って');
    }

    _applyDiplomacyConversationRegisters(messages, conversationContext) {
        if (!conversationContext) return messages;
        const senderPosture = conversationContext.senderSpeakerPosture && conversationContext.senderSpeakerPosture.key || 'normal';
        const receiverPosture = conversationContext.receiverSpeakerPosture && conversationContext.receiverSpeakerPosture.key || 'normal';
        return {
            demandMsg: this._styleDiplomacyTextForSpeaker(messages.demandMsg, senderPosture),
            acceptMsg: this._styleDiplomacyTextForSpeaker(messages.acceptMsg, receiverPosture),
            rejectMsg: this._styleDiplomacyTextForSpeaker(messages.rejectMsg, receiverPosture),
            replyAcceptMsg: this._styleDiplomacyTextForSpeaker(messages.replyAcceptMsg, senderPosture),
            replyRejectMsg: this._styleDiplomacyTextForSpeaker(messages.replyRejectMsg, senderPosture)
        };
    }

    /**
     * 従属家が主家へ「主従を解いて同盟へ改めたい」と申し入れる時の共通会話。
     * 「対等」を直接突きつける言い方は避けつつ、主従解消の意思は曖昧にしない。
     * プレイヤー発・AI発のどちらも同じ文面を通し、片側だけ別の意味にならないようにする。
     */
    _getVassalAllianceUpgradeMessages(conversationContext = null) {
        const senderPosture = conversationContext && conversationContext.senderSpeakerPosture
            ? conversationContext.senderSpeakerPosture.key : 'normal';
        const receiverPosture = conversationContext && conversationContext.receiverSpeakerPosture
            ? conversationContext.receiverSpeakerPosture.key : 'normal';
        return {
            demandMsg: this._styleDiplomacyTextForSpeaker(
                `「長らくの御庇護により、当家が家を保てたこと、深く感謝しております」`,
                senderPosture
            ),
            demandMsg2: this._styleDiplomacyTextForSpeaker(
                `「願わくば主従の約を解き、これよりは盟友として力を合わせることをお許しいただきたく存じます」`,
                senderPosture
            ),
            acceptMsg: this._styleDiplomacyTextForSpeaker(
                `「申し出の趣、よく分かった。よかろう。今日より主従の約を解き、盟友として共に歩もう」`,
                receiverPosture
            ),
            rejectMsg: this._styleDiplomacyTextForSpeaker(
                `「申し出の趣は承った。されど、今はまだ主従の約を解く時ではない。今しばらく力を貸してもらいたい」`,
                receiverPosture
            ),
            replyAcceptMsg: this._styleDiplomacyTextForSpeaker(
                `「かたじけない。これまでの御恩を忘れず、盟友として力を合わせて参りましょう」`,
                senderPosture
            ),
            replyRejectMsg: this._styleDiplomacyTextForSpeaker(
                `「承知いたしました。此度は願いを収め、これまでどおり務めを果たします」`,
                senderPosture
            )
        };
    }

    /**
     * 外交会話のメッセージを一括管理する魔法です
     */
    getDiplomacyMessages(type, isSenderDaimyo, senderClanName, receiverClanName, senderCallName, receiverCallName, princessName = "姫", targetBushoName = "貴家", conversationContext = null) {
        let demandMsg = "";
        let acceptMsg = "";
        let rejectMsg = "";
        let replyAcceptMsg = "";
        let replyRejectMsg = "";

        if (type === 'goodwill') {
            demandMsg = `「両家の仲を深めたく参りました。心ばかりですが、お受け取りくだされ」`;
            acceptMsg = isSenderDaimyo ? `「${senderCallName}直々の御厚意、かたじけない。ありがたく頂戴いたします」` : `「ありがたい申し出にござる。御厚意、確かに頂戴いたす」`;
            rejectMsg = `「お心遣いはありがたいが、此度は受け取れぬ。お持ち帰り願いたい」`;
            replyAcceptMsg = isSenderDaimyo
                ? `「かたじけない。これを機に、両家の仲がさらに深まれば何よりにござる」`
                : `「ありがたきお言葉。主君へも確かに申し伝えます」`;
            replyRejectMsg = isSenderDaimyo
                ? `「そうか。では、此度はこれまでとしよう」`
                : `「承知いたしました。主君にはそのように申し伝えます」`;
        } else if (type === 'alliance') {
            demandMsg = `「両家繁栄の為、どうか我らと盟約を結んでくだされ」`;
            acceptMsg = `「うむ、承知仕った。これより我らは盟友にござる」`;
            rejectMsg = `「重大事ゆえ、今は盟約を結べぬ。此度は見送らせてもらいたい」`;
            replyAcceptMsg = isSenderDaimyo
                ? `「うむ。では、これよりは盟友として力を合わせて参ろう」`
                : `「かたじけない。この盟約、主君へ確かに申し伝えます」`;
            replyRejectMsg = isSenderDaimyo
                ? `「そうか。では、此度はこれまでとしよう」`
                : `「承知いたしました。主君にはそのように申し伝えます」`;
        } else if (type === 'dominate') {
            demandMsg = `「もはや大勢は決し申した。これ以上の抵抗は無益。${senderClanName}の傘下に加わられよ」`;
            acceptMsg = `「……承知仕った。かくなる上は${senderClanName}に従属いたす」`;
            rejectMsg = `「断る。まだ当家が膝を屈する時ではない。その申し出は受けられぬ」`;
            replyAcceptMsg = `「かたじけない。共に${senderClanName}を盛り立てて参りましょうぞ」`;
            replyRejectMsg = isSenderDaimyo
                ? `「そうか。ならば此度はこれまでとしよう」`
                : `「承知いたした。申し出は確かにお伝え申した。では、これにて失礼いたす」`;
        } else if (type === 'truce') {
            demandMsg = isSenderDaimyo
                ? `「${receiverCallName}。これ以上兵を損なうは本意ではない。互いに矛を収め、兵を休めぬか」`
                : `「これ以上戦を長引かせても兵を損なうばかり。互いに矛を収め、和睦を結びたく参りました」`;
            acceptMsg = `「……よかろう。当家にも戦を長引かせる益はない。互いに兵を退き、約定を結ぼう」`;
            rejectMsg = `「……今ここで兵を退く理由はない。和睦の話は受けられぬ」`;
            replyAcceptMsg = isSenderDaimyo
                ? `「かたじけない。約定は違えぬ。これにて両家、しばし矛を収めよう」`
                : `「ご承諾、かたじけなく存じます。此度の約定、主君へ確かに申し伝えまする」`;
            replyRejectMsg = isSenderDaimyo
                ? `「そうか。ならば此度はこれまでとしよう」`
                : `「承知いたしました。主君にはその旨、確かに申し伝えます」`;
        } else if (type === 'vassalage') {
            demandMsg = `「どうか我らを${receiverClanName}の末席にお加えいただきたく存じます」`;
            acceptMsg = `「よくぞご決心なされた。今後はその力、当家で存分に振るわれよ」`;
            replyAcceptMsg = isSenderDaimyo ? `「恐悦至極……今日より${receiverCallName.replace('殿', '様')}を主君と仰ぎ奉りまする」` : `「ははっ！　ありがたき幸せに存じまする！」`;
        } else if (type === 'subordinate') {
            demandMsg = `「当家は${receiverClanName}の傘下に入りたく存じます。どうか御庇護を賜りたく……」`;
            acceptMsg = `「申し出の趣、承知した。これより当家が後ろ盾となろう」`;
            rejectMsg = `「申し出の趣は承った。されど今は、貴家を庇護に迎える時ではない。此度は見送ろう」`;
            replyAcceptMsg = isSenderDaimyo ? `「ありがたき幸せ……此度の御恩、決して忘れませぬ」` : `「ありがたきお言葉。主君へ急ぎ申し伝えます」`;
            replyRejectMsg = isSenderDaimyo
                ? `「承知いたしました。此度は願いを収めます」`
                : `「承知いたしました。主君にはそのように申し伝えます」`;
        } else if (type === 'marriage') {
            demandMsg = `「両家の縁を深めるため、当家の${princessName}を${targetBushoName}に娶っていただきたい」`;
            acceptMsg = `「願ってもない申し出にござる。ありがたくお受けいたそう」`;
            rejectMsg = `「ううむ……こればかりはお受けいたしかねる。どうかお引き取りくだされ」`;
            replyAcceptMsg = isSenderDaimyo
                ? `「かたじけない。では帰国ののち、吉日を定めるとしよう」`
                : `「ご承諾、かたじけなく存じます。主君へ持ち帰り、早速吉日を定めましょう」`;
            replyRejectMsg = isSenderDaimyo
                ? `「そうか。此度は残念だが、致し方あるまい」`
                : `「承知いたしました。主君にはそのように申し伝えます」`;
        }

        // 同じ外交内容でも、官位・威信・使者本人の格によって礼の厚さだけを薄く変える。
        // 成否や外交効果そのものは変えず、隠れた格差を会話から少し推測できる程度に留める。
        const senderRespect = Number(conversationContext && conversationContext.senderDeferenceLevel || 0);
        const receiverRespect = Number(conversationContext && conversationContext.receiverDeferenceLevel || 0);
        if (senderRespect >= 2) {
            if (type === 'goodwill') demandMsg = `「両家の御縁を深めたく、心ばかりの品をお持ちいたしました。どうかお納めくだされ」`;
            if (type === 'alliance') demandMsg = `「恐れながら、両家繁栄のため盟約をお結びいただきたく存じます」`;
            if (type === 'truce') demandMsg = `「これ以上兵を損なうは双方のためになりますまい。矛を収め、和睦をお願いしたく参りました」`;
        } else if (senderRespect === 1) {
            if (type === 'alliance') demandMsg = `「両家繁栄のため、盟約を結んでいただきたく参りました」`;
            if (type === 'truce' && !isSenderDaimyo) demandMsg = `「これ以上戦を長引かせぬため、両家の和睦につきご一考いただきたく存じます」`;
        }

        if (receiverRespect >= 2) {
            if (type === 'goodwill') {
                acceptMsg = `「これはかたじけない。御厚意、ありがたく頂戴いたします」`;
                rejectMsg = `「ありがたいお申し出ながら、今はお受けいたしかねます。ご容赦くだされ」`;
            } else if (type === 'alliance') {
                acceptMsg = `「承知いたしました。これより両家、盟友として力を合わせましょう」`;
                rejectMsg = `「重大事ゆえ、今しばらく家中で評議いたしたく存じます」`;
            } else if (type === 'truce') {
                acceptMsg = `「承知いたしました。此度は矛を収めることといたしましょう」`;
            }
        }

        // 将軍・左馬頭本人は、使者か大名本人かを問わず普通の家臣・大名テンプレートへ落とさない。
        // 本人の公的権威から、この外交を自ら勧め、取り持つ常体にする。
        const envoySpecialLevel = Number(conversationContext && conversationContext.envoySpecial && conversationContext.envoySpecial.level || 0);
        if (envoySpecialLevel >= 2) {
            if (type === 'goodwill') {
                demandMsg = `「両家の仲を深めたい。心ばかりの品だ、受け取ってもらいたい」`;
                replyAcceptMsg = `「うむ。両家の間が、これを機に少しでも近づけば何よりだ」`;
                replyRejectMsg = `「そうか。此度は致し方あるまい」`;
            } else if (type === 'alliance') {
                demandMsg = `「両家で盟約を結びたい。どうだ、考えてもらいたい」`;
                replyAcceptMsg = `「うむ。この盟約が末永く続くことを願おう」`;
                replyRejectMsg = `「そうか。此度は致し方あるまい」`;
            } else if (type === 'truce') {
                demandMsg = `「これ以上の争いは双方のためになるまい。矛を収め、和睦するのがよかろう」`;
                replyAcceptMsg = `「うむ。これで両家の争いも収まろう」`;
                replyRejectMsg = `「そうか。なお争いを続けるというなら、致し方あるまい」`;
            } else if (type === 'dominate') {
                demandMsg = `「大勢は決しておる。${senderClanName}の傘下に入るのがよかろう」`;
            } else if (type === 'vassalage') {
                demandMsg = `「我らが${receiverClanName}の末席に加わるのがよかろう」`;
                replyAcceptMsg = `「うむ。これよりは共に歩んで参ろう」`;
                replyRejectMsg = `「そうか。此度は致し方あるまい」`;
            } else if (type === 'subordinate') {
                demandMsg = `「当家は${receiverClanName}の庇護を受けるのがよかろう」`;
                replyAcceptMsg = `「うむ。当家としても異存はあるまい」`;
                replyRejectMsg = `「そうか。此度は致し方あるまい」`;
            } else if (type === 'marriage') {
                demandMsg = `「両家の縁を深めるなら、当家の${princessName}を${targetBushoName}に娶ってもらいたい」`;
            }
        }

        // 関係温度は格とは別軸。敵対相手には礼を保ったまま少し硬く、友好的な相手には断る時も角を立てない。
        const relationshipTone = conversationContext && conversationContext.relationshipTone && conversationContext.relationshipTone.key || 'neutral';
        if (relationshipTone === 'hostile') {
            if (type === 'goodwill') {
                acceptMsg = `「……品は受け取ろう。遺恨はあれど、此度の厚意は受けておく」`;
                rejectMsg = `「……今さら親善の品とはな。此度は受け取れぬ。お持ち帰りくだされ」`;
            } else if (type === 'alliance') {
                acceptMsg = `「……承知した。これまでの遺恨はいったん置き、盟約を結ぶといたそう」`;
                rejectMsg = `「……盟約とは、にわかには信じ難い話よ。此度はお断りいたす」`;
            } else if (type === 'marriage') {
                rejectMsg = `「……両家の間柄を思えば、今その縁談を受けるわけには参らぬ」`;
            }
        } else if (relationshipTone === 'friendly') {
            if (type === 'goodwill') {
                acceptMsg = `「かたじけない。変わらぬ御厚意、ありがたく頂戴します」`;
                rejectMsg = `「お心遣い、ありがたく存じます。ただ、此度はお受けいたしかねます」`;
            } else if (type === 'alliance') {
                rejectMsg = `「ありがたいお話なれど、今は盟約を結ぶ時ではござらぬ。ご容赦を」`;
            } else if (type === 'marriage') {
                rejectMsg = `「ありがたいお話なれど、此度の縁談はお受けいたしかねます。ご容赦くだされ」`;
            }
        }

        // 敵対温度は愛想を削るだけで、将軍・左馬頭・明確な高官への最低限の格式までは消さない。
        // 特に和睦・従属要求の拒否で「何をほざくか」等へ落ちるのを防ぐ。
        if (receiverRespect >= 2) {
            if (type === 'truce') {
                rejectMsg = `「……此度の和睦には応じられぬ。どうかお引き取り願いたい」`;
            } else if (type === 'dominate') {
                rejectMsg = `「……申し出は受けられぬ。まだ従うつもりはない。お引き取り願いたい」`;
            } else if (type === 'subordinate') {
                rejectMsg = `「……申し出はありがたいが、今は受け入れられぬ。お引き取り願いたい」`;
            }
        }

        return this._applyDiplomacyConversationRegisters(
            { demandMsg, acceptMsg, rejectMsg, replyAcceptMsg, replyRejectMsg },
            conversationContext
        );
    }
    
    /**
     * プレイヤー側から外交を行った時の会話ダイアログを再生する魔法です
     */
    async playDiplomacyConversation(senderBusho, receiverDaimyo, type, isSuccess, princess = null, targetBusho = null) {
        if (!this.game.ui.showDialogAsync) return; 

        // ★会話劇が始まった瞬間に、今のBGMをメモして外交用のBGMに変更します！
        if (window.AudioManager) {
            window.AudioManager.memorizeCurrentBgm();
            window.AudioManager.playBGM('SC_ex_Scene3_Odyssey.ogg');
        }

        const senderClan = this.game.clans.find(c => c.id === senderBusho.clan);
        const receiverClan = this.game.clans.find(c => c.id === receiverDaimyo.clan);

        const isSenderDaimyo = senderBusho.isDaimyo;
        const senderClanName = senderClan ? senderClan.name : "当家";
        const receiverClanName = receiverClan ? receiverClan.name : "貴家";

        const senderCallName = this.getCallName(senderBusho, receiverDaimyo);
        const receiverCallName = this.getCallName(receiverDaimyo, senderBusho);

        const senderNameStr = senderBusho.fullName;
        const receiverNameStr = receiverDaimyo.fullName;

        let princessName = "姫";
        if (princess) princessName = princess.name;

        let targetBushoName = "貴家";
        if (targetBusho) {
            // 縁談だけ独自の「姓+官位+殿」を作らず、将軍・左馬頭・官位・血縁を含む共通呼称へ通す。
            targetBushoName = this.getCallName(targetBusho, senderBusho);
        }

        const greeting = this.buildDiplomacyGreeting(senderBusho, receiverDaimyo);
        const { greetMsg1, greetMsg2, context: conversationContext } = greeting;
        const msgs = this.getDiplomacyMessages(
            type, isSenderDaimyo, senderClanName, receiverClanName,
            senderCallName, receiverCallName, princessName, targetBushoName, conversationContext
        );
        const currentRelation = this.getRelation(senderBusho.clan, receiverDaimyo.clan);
        const isVassalAllianceUpgrade = type === 'alliance'
            && currentRelation
            && currentRelation.status === window.GameConstants.DiplomacyStatus.SUBORDINATE;
        if (isVassalAllianceUpgrade) {
            Object.assign(msgs, this._getVassalAllianceUpgradeMessages(conversationContext));
        }

        // ★修正：プレイヤーが使者を送った時は、驚かす必要がないのでSE（playEventSoundAndBlock）を鳴らさないように削除しました！

        await this.game.ui.showDialogAsync(greetMsg1, false, 0, { leftFace: senderBusho.faceIcon, leftName: senderNameStr });
        await this.game.ui.showDialogAsync(greetMsg2, false, 0, { leftFace: receiverDaimyo.faceIcon, leftName: receiverNameStr });

        if (msgs.demandMsg) {
            await this.game.ui.showDialogAsync(msgs.demandMsg, false, 0, { leftFace: senderBusho.faceIcon, leftName: senderNameStr });
        }
        if (msgs.demandMsg2) {
            await this.game.ui.showDialogAsync(msgs.demandMsg2, false, 0, { leftFace: senderBusho.faceIcon, leftName: senderNameStr });
        }

        if (isSuccess === true) {
            if (msgs.acceptMsg) await this.game.ui.showDialogAsync(msgs.acceptMsg, false, 0, { leftFace: receiverDaimyo.faceIcon, leftName: receiverNameStr });
            if (msgs.replyAcceptMsg) await this.game.ui.showDialogAsync(msgs.replyAcceptMsg, false, 0, { leftFace: senderBusho.faceIcon, leftName: senderNameStr });
        } else if (isSuccess === false) {
            if (msgs.rejectMsg) await this.game.ui.showDialogAsync(msgs.rejectMsg, false, 0, { leftFace: receiverDaimyo.faceIcon, leftName: receiverNameStr });
            if (msgs.replyRejectMsg) await this.game.ui.showDialogAsync(msgs.replyRejectMsg, false, 0, { leftFace: senderBusho.faceIcon, leftName: senderNameStr });
        } else if (isSuccess === 'negotiate') {
            const rawNegotiateMsg = type === 'truce'
                ? `「和睦には異存ない。されど、ただ矛を収めるだけでは家中が納得せぬ。条件を一つ飲んでもらいたい」`
                : type === 'subordinate'
                    ? `「従属には異存ない。されど、無条件で庇護に迎えるわけにはいかぬ。条件を一つ飲んでもらいたい」`
                    : `「うむ……無条件でというわけにはいかぬな」`;
            const negotiateMsg = this._styleDiplomacyTextForSpeaker(
                rawNegotiateMsg,
                conversationContext && conversationContext.receiverSpeakerPosture ? conversationContext.receiverSpeakerPosture.key : 'normal'
            );
            await this.game.ui.showDialogAsync(negotiateMsg, false, 0, { leftFace: receiverDaimyo.faceIcon, leftName: receiverNameStr });
        }
    }
    
    /**
     * ★新設：同盟が成立した時のデータ書き換えを一手に引き受ける専門の魔法です
     */
    applyAllianceData(clanA, clanB) {
        const relation = this.getRelation(clanA, clanB);
        if (relation) {
            if (relation.sentiment < 31) {
                relation.sentiment = 50;
            } else {
                relation.sentiment = Math.min(100, relation.sentiment + 20);
            }
            const oppRelation = this.getRelation(clanB, clanA);
            if (oppRelation) oppRelation.sentiment = relation.sentiment;
        }
        
        // 状態を同盟に変更する処理もここにまとめます
        this.changeStatus(clanA, clanB, '同盟');
    }

    /**
     * ★新設：支配・従属が成立した時のデータ書き換えを一手に引き受ける専門の魔法です
     */
    applyDominationData(dominantClanId, subordinateClanId) {
        // 関係値の調整
        const relation = this.getRelation(dominantClanId, subordinateClanId);
        if (relation) {
            if (relation.sentiment <= 40) {
                relation.sentiment = 50;
            } else {
                relation.sentiment = Math.min(100, relation.sentiment + 10);
            }
            const oppRelation = this.getRelation(subordinateClanId, dominantClanId);
            if (oppRelation) oppRelation.sentiment = relation.sentiment;
        }

        // 状態を支配・従属に変更します
        // （changeStatusの仕様で、片方を「支配」にすると相手側は自動で「従属」になります）
        this.changeStatus(dominantClanId, subordinateClanId, '支配');

        // ★支配した側の大名家の「今月の外交目標」を親善に書き換えます
        const dominantClan = this.game.clans.find(c => c.id === dominantClanId);
        if (dominantClan && dominantClan.currentDiplomacyTarget && dominantClan.currentDiplomacyTarget.targetId === subordinateClanId) {
            dominantClan.currentDiplomacyTarget.action = 'goodwill';
            dominantClan.currentDiplomacyTarget.gold = 300;
        }
    }
    
    /**
     * ★新設：外交の結果表示と、それに伴う画面の更新をひとまとめに行う魔法です！
     */
    _recordDiplomacyHistory(text, clanIds = []) {
        if (!text || !this.game.historySystem) return;
        this.game.historySystem.record(text, { clanIds, category: 'diplomacy', inferCurrentTurn: false });
    }

    showDiplomacyResult(doerClanId, isPlayerInvolved, msg, logMsg = "", aiMsg = "", onClose = null, relatedClanIds = null) {
        const historyClanIds = Array.isArray(relatedClanIds) && relatedClanIds.length > 0 ? relatedClanIds : [doerClanId];
        const historyText = logMsg || aiMsg;
        if (historyText) this._recordDiplomacyHistory(historyText, historyClanIds);

        if (isPlayerInvolved) {
            if (doerClanId === this.game.playerClanId) {
                this.game.ui.updatePanelHeader();
                this.game.ui.renderCommandMenu();
                this.game.ui.renderMap();
            }
            this.game.ui.showResultModal(msg, onClose);
        } else if (aiMsg !== "") {
            this.game.ui.showDialog(aiMsg, false, onClose);
        } else {
            // メッセージが無い場合も、閉じられた後の処理だけはちゃんと引き継ぎます
            if (onClose) onClose();
        }
    }
    
    /**
     * 外交コマンドを実行する魔法です
     */
    async executeDiplomacy(doerId, targetCastleId, type, gold = 0) {
        const doer = this.game.getBusho(doerId);
        const targetCastle = this.game.getCastle(targetCastleId);
        if (!targetCastle) return;
        
        const targetClanId = targetCastle.ownerClan;
        let msg = "";
        let aiMsg = ""; 
        let logMsg = ""; 
        const isPlayerInvolved = (doer.clan === this.game.playerClanId || targetClanId === this.game.playerClanId);

        const doerClanName = this.game.clans.find(c => c.id === doer.clan).name;
        const targetClanName = this.game.clans.find(c => c.id === targetClanId).name;

        if (type === 'goodwill') {
            let isSuccess = true;
            if (targetClanId !== this.game.playerClanId) {
                isSuccess = this.checkDiplomacySuccess(doerId, targetCastleId, type, gold);
            }

            if (doer.clan === this.game.playerClanId && targetClanId !== this.game.playerClanId) {
                const targetDaimyo = this.game.getClanDaimyo(targetClanId);
                if (targetDaimyo) await this.playDiplomacyConversation(doer, targetDaimyo, type, isSuccess);
            }

            this.calcDiplomacyExp(doer, type, isSuccess, true);

            if (isSuccess) {
                const increase = this.calcGoodwillIncrease(gold, doer);
                this.updateSentiment(doer.clan, targetClanId, increase);
                
                const castle = this.game.getCastle(doer.castleId); 
                if(castle) castle.gold -= gold;
                
                msg = `${doer.name}の働きにより、${targetClanName}との関係が改善しました！`;
                logMsg = `${doerClanName}が${targetClanName}に親善を行いました`;
                doer.achievementTotal += Math.floor(doer.diplomacy * 0.2) + 10;
                this.game.factionSystem.updateRecognition(doer, 15);
            } else {
                msg = `${this.game.clans.find(c => c.id === targetClanId).name} に親善の品を突き返されました……`;
                this._recordDiplomacyHistory(`【外交】${doerClanName}の${targetClanName}への親善は受け入れられませんでした。`, [doer.clan, targetClanId]);
                doer.achievementTotal += 5;
                this.game.factionSystem.updateRecognition(doer, 5);
            }

        } else if (type === 'alliance') {
            const allianceRelationBefore = this.getRelation(doer.clan, targetClanId);
            const isVassalAllianceUpgrade = allianceRelationBefore
                && allianceRelationBefore.status === window.GameConstants.DiplomacyStatus.SUBORDINATE;
            let isSuccess = this.checkDiplomacySuccess(doerId, targetCastleId, type);

            if (doer.clan === this.game.playerClanId && targetClanId !== this.game.playerClanId) {
                const targetDaimyo = this.game.getClanDaimyo(targetClanId);
                if (targetDaimyo) await this.playDiplomacyConversation(doer, targetDaimyo, type, isSuccess);
            }

            this.calcDiplomacyExp(doer, type, isSuccess, true);

            if (isSuccess) {
                this.applyAllianceData(doer.clan, targetClanId);
                
                const doerClan = this.game.clans.find(c => c.id === doer.clan);
                if (doerClan && doerClan.currentDiplomacyTarget && doerClan.currentDiplomacyTarget.targetId === targetClanId) {
                    doerClan.currentDiplomacyTarget.action = 'goodwill';
                    
                    const myPower = this.game.getClanTotalSoldiers(doer.clan) || 1;
                    const targetPower = this.game.getClanTotalSoldiers(targetClanId) || 1;
                    const ratio = targetPower / Math.max(1, myPower);
                    let goodwillGold = 300; 
                    
                    if (ratio >= 3.0) {
                        goodwillGold = 1000; 
                    } else if (ratio > 1.5) {
                        goodwillGold = 300 + ((ratio - 1.5) / 1.5) * 700; 
                    }
                    
                    doerClan.currentDiplomacyTarget.gold = Math.floor(goodwillGold / 100) * 100;
                }

                msg = isVassalAllianceUpgrade
                    ? `${targetClanName}との主従関係を解き、同盟を結びました！`
                    : `同盟の締結に成功しました！`;
                if (!isPlayerInvolved) {
                    aiMsg = isVassalAllianceUpgrade
                        ? `${doerClanName} が ${targetClanName} との主従関係を解き、同盟を結びました！`
                        : `${doerClanName} が ${targetClanName} と同盟を締結しました！`;
                } else {
                    logMsg = isVassalAllianceUpgrade
                        ? `${doerClanName}が${targetClanName}との主従関係を解き、同盟を結びました`
                        : `${doerClanName}が${targetClanName}と同盟を結びました`;
                }
                doer.achievementTotal += Math.floor(doer.diplomacy * 0.2) + 10;
                this.game.factionSystem.updateRecognition(doer, 30);
            } else {
                this.updateSentiment(doer.clan, targetClanId, window.MainParams.Diplomacy.FailureSentiment.Alliance);
                msg = isVassalAllianceUpgrade
                    ? `${targetClanName}に主従関係の解消と同盟への移行を願いましたが、受け入れられませんでした。`
                    : `同盟の締結に失敗しました……`;
                this._recordDiplomacyHistory(
                    isVassalAllianceUpgrade
                        ? `【外交】${doerClanName}の${targetClanName}への主従解消・同盟移行の申し出は成立しませんでした。`
                        : `【外交】${doerClanName}の${targetClanName}への同盟提案は成立しませんでした。`,
                    [doer.clan, targetClanId]
                );
                doer.achievementTotal += 5;
                this.game.factionSystem.updateRecognition(doer, 10);
            }

        } else if (type === 'break_alliance') {
            const result = this.applyBreakAlliancePenalty(doer.clan, targetClanId, doer);
            this.calcDiplomacyExp(doer, type, true, true);

            msg = `${result.oldStatus}関係を破棄しました`;
            logMsg = `${doerClanName}が${targetClanName}との関係を破棄しました`;
            if (result.isBetrayal) msg += `\n諸大名からの心証が悪化しました……`;
            if (result.isBreakDomination) msg += `\n家臣団の中でも動揺が広がっているようです……`;
            
            doer.isActionDone = true;
            this.showDiplomacyResult(doer.clan, isPlayerInvolved, msg, logMsg, "", () => {
                this.resolveBreakAllianceConsequences(result).catch(e => console.error('断交後処遇の実行に失敗しました:', e));
            }, [doer.clan, targetClanId]);
            return;
            
        } else if (type === 'subordinate') {
            const prob = this.getDiplomacyProb(doerId, targetCastleId, type);
            const dice = Math.random() * 100;
            const isSuccess = dice < prob;
            const canNegotiate = !isSuccess && dice < (prob + 30);
            
            this.calcDiplomacyExp(doer, type, isSuccess || canNegotiate, true);

            let subordinationConversation = null;
            if (doer.clan === this.game.playerClanId && targetClanId !== this.game.playerClanId) {
                const targetDaimyo = this.game.getClanDaimyo(targetClanId);
                if (targetDaimyo) {
                    const greeting = this.buildDiplomacyGreeting(doer, targetDaimyo);
                    subordinationConversation = { senderBusho: doer, receiverDaimyo: targetDaimyo, context: greeting.context };
                    let convSuccess = false;
                    if (isSuccess) convSuccess = true;
                    else if (canNegotiate) convSuccess = 'negotiate';
                    await this.playDiplomacyConversation(doer, targetDaimyo, type, convSuccess);
                }
            }

            const handleSuccess = (conditionType, conditionData) => {
                this.applyDominationData(targetClanId, doer.clan);

                let conditionMsg = "";
                if (conditionType === 'marriage') {
                    const princess = conditionData.princess;
                    const busho = conditionData.busho;
                    this._applyMarriageLinkData(
                        princess.id, busho.id, doer.clan, targetClanId,
                        { isMainWife: false, boostSentiment: true }
                    );
                    conditionMsg = `\n${princess.name} が ${busho.name} の側室として迎えられました。`;
                } else if (conditionType === 'hostage') {
                    this.applyHostageData(conditionData.busho.id, doer.clan, targetClanId);
                    conditionMsg = `\n${conditionData.busho.name} を人質として差し出しました。`;
                } else if (conditionType === 'castle') {
                    this.applyCastleCessionData(conditionData.castle.id, doer.clan, targetClanId);
                    conditionMsg = `\n${conditionData.castle.name} を割譲しました。`;
                }

                msg = `${this.game.clans.find(c => c.id === targetClanId).name} に従属しました！${conditionMsg}`;
                if (!isPlayerInvolved) aiMsg = `${targetClanName} が ${doerClanName} を支配下に置きました！`;
                else logMsg = `${doerClanName}が${targetClanName}に従属しました`;
                doer.achievementTotal += Math.floor(doer.diplomacy * 0.2) + 10;
                this.game.factionSystem.updateRecognition(doer, 30);

                doer.isActionDone = true;
                this.showDiplomacyResult(doer.clan, isPlayerInvolved, msg, logMsg, aiMsg, null, [doer.clan, targetClanId]);
            };
            
            const handleFailure = (wasNegotiation = false) => {
                this.updateSentiment(doer.clan, targetClanId, window.MainParams.Diplomacy.FailureSentiment.Dominate);
                msg = wasNegotiation
                    ? `条件が折り合わず、${this.game.clans.find(c => c.id === targetClanId).name} への従属を断念しました。`
                    : `${this.game.clans.find(c => c.id === targetClanId).name} に従属の願いを受け入れてもらえませんでした。`;
                this._recordDiplomacyHistory(`【外交】${doerClanName}の${targetClanName}への従属願は成立しませんでした。`, [doer.clan, targetClanId]);
                doer.achievementTotal += 5;
                this.game.factionSystem.updateRecognition(doer, 10);
                
                doer.isActionDone = true;
                this.showDiplomacyResult(doer.clan, isPlayerInvolved, msg, "", "", null, [doer.clan, targetClanId]);
            };
            
            if (isSuccess) {
                handleSuccess('none', null);
            } else if (canNegotiate) {
                this.negotiateSubordinationConditions(
                    doer.clan, targetClanId, handleSuccess, () => handleFailure(true), subordinationConversation
                );
            } else {
                handleFailure(false);
            }
            return;
            
        } else if (type === 'truce') {
            const prob = this.getDiplomacyProb(doerId, targetCastleId, type);
            const dice = Math.random() * 100;
            const isSuccess = dice < prob;
            const canNegotiate = !isSuccess && dice < (prob + 30);

            this.calcDiplomacyExp(doer, type, isSuccess || canNegotiate, true);

            let truceConversation = null;
            if (doer.clan === this.game.playerClanId && targetClanId !== this.game.playerClanId) {
                const targetDaimyo = this.game.getClanDaimyo(targetClanId);
                if (targetDaimyo) {
                    const greeting = this.buildDiplomacyGreeting(doer, targetDaimyo);
                    truceConversation = { senderBusho: doer, receiverDaimyo: targetDaimyo, context: greeting.context };
                    let convSuccess = false;
                    if (isSuccess) convSuccess = true;
                    else if (canNegotiate) convSuccess = 'negotiate';
                    await this.playDiplomacyConversation(doer, targetDaimyo, type, convSuccess);
                }
            }

            const handleSuccess = (conditionType, conditionData) => {
                this.changeStatus(doer.clan, targetClanId, '和睦', 6);
                
                const relationA = this.getDiplomacyData(doer.clan, targetClanId);
                const relationB = this.getDiplomacyData(targetClanId, doer.clan);
                if (relationA) relationA.sentiment = 50;
                if (relationB) relationB.sentiment = 50;

                const conditionMsg = this._applyTruceConditionData(
                    conditionType, conditionData, doer.clan, targetClanId, { receiverPerspective: false }
                );
                
                msg = `${this.game.clans.find(c => c.id === targetClanId).name} との和睦が成立しました！${conditionMsg}`;
                if (!isPlayerInvolved) aiMsg = `${doerClanName} と ${targetClanName} が和睦しました。`;
                else logMsg = `${doerClanName}が${targetClanName}と和睦しました`;
                
                doer.achievementTotal += Math.floor(doer.diplomacy * 0.2) + 10;
                this.game.factionSystem.updateRecognition(doer, 30);

                doer.isActionDone = true;
                this.showDiplomacyResult(doer.clan, isPlayerInvolved, msg, logMsg, aiMsg, null, [doer.clan, targetClanId]);
            };
            
            const handleFailure = (wasNegotiation = false) => {
                this.updateSentiment(doer.clan, targetClanId, window.MainParams.Diplomacy.FailureSentiment.Alliance);
                msg = wasNegotiation
                    ? `条件が折り合わず、${this.game.clans.find(c => c.id === targetClanId).name} との和睦は決裂しました。`
                    : `${this.game.clans.find(c => c.id === targetClanId).name} に和睦を拒まれました。`;
                this._recordDiplomacyHistory(`【外交】${doerClanName}と${targetClanName}の和睦交渉は成立しませんでした。`, [doer.clan, targetClanId]);
                doer.achievementTotal += 5;
                this.game.factionSystem.updateRecognition(doer, 10);
                
                doer.isActionDone = true;
                this.showDiplomacyResult(doer.clan, isPlayerInvolved, msg, "", "", null, [doer.clan, targetClanId]);
            };
            
            if (isSuccess) {
                handleSuccess('none', null);
            } else if (canNegotiate) {
                this.negotiateTruceConditions(
                    doer.clan, targetClanId, handleSuccess, () => handleFailure(true), truceConversation
                );
            } else {
                handleFailure(false);
            }
            return;
            
        } else if (type === 'dominate') {
            let isSuccess = false;
            
            const myPower = this.game.getClanTotalSoldiers(doer.clan) || 1;
            const targetPower = this.game.getClanTotalSoldiers(targetClanId) || 1;
            
            if (myPower / targetPower < 5) {
                isSuccess = false;
            } else {
                isSuccess = this.checkDiplomacySuccess(doerId, targetCastleId, type);
            }

            if (doer.clan === this.game.playerClanId && targetClanId !== this.game.playerClanId) {
                const targetDaimyo = this.game.getClanDaimyo(targetClanId);
                if (targetDaimyo) await this.playDiplomacyConversation(doer, targetDaimyo, type, isSuccess);
            }

            this.calcDiplomacyExp(doer, type, isSuccess, true);

            if (isSuccess) {
                this.applyDominationData(doer.clan, targetClanId);

                msg = `${this.game.clans.find(c => c.id === targetClanId).name} を支配下に置くことに成功しました！`;
                if (!isPlayerInvolved) aiMsg = `${doerClanName} が ${targetClanName} を支配下に置きました！`;
                else logMsg = `${doerClanName}が${targetClanName}を支配下に置きました`;
                doer.achievementTotal += Math.floor(doer.diplomacy * 0.2) + 20;
                this.game.factionSystem.updateRecognition(doer, 40);
            } else {
                this.updateSentiment(doer.clan, targetClanId, window.MainParams.Diplomacy.FailureSentiment.Dominate);
                msg = `支配の要求は拒否されました……`;
                this._recordDiplomacyHistory(`【外交】${doerClanName}の${targetClanName}への降伏勧告は拒否されました。`, [doer.clan, targetClanId]);
                doer.achievementTotal += 5;
                this.game.factionSystem.updateRecognition(doer, 10);
            }
        } else if (type === 'court_truce') {
            this.game.courtRankSystem.applyCourtTruce(doer, targetClanId, gold);

            msg = `朝廷の仲裁により、${targetClanName} との和睦が成立しました！`;
            if (!isPlayerInvolved) aiMsg = `朝廷の仲裁により、${doerClanName} と ${targetClanName} との和睦が成立しました。`;
            else logMsg = `${doerClanName}が朝廷に働きかけ${targetClanName}と和睦しました`;

            if (targetClanId === this.game.playerClanId) {
                msg = `朝廷の介入により、当家は ${doerClanName} と和睦することになりました……`;
            }
        }
        
        doer.isActionDone = true;
        this.showDiplomacyResult(doer.clan, isPlayerInvolved, msg, logMsg, aiMsg, null, [doer.clan, targetClanId]);
    }
    
    /**
     * 指定した大名家の支配・従属関係をクリアする魔法です
     */
    clearDominationRelations(clanId) {
        this.game.clans.forEach(c => {
            if (c.id !== 0 && c.id !== clanId && !c.isDestroyed) {
                const rel = this.game.getRelation(clanId, c.id);
                if (rel && (rel.status === '支配' || rel.status === '従属')) {
                    this.changeStatus(clanId, c.id, '普通');
                }
            }
        });
    }
    
    /**
     * 従属により指定した拠点を割譲する処理
     */
    applyCastleCessionData(castleId, subordinateClanId, dominantClanId) {
        const castleA = this.game.getCastle(castleId);
        if (!castleA) return;

        const myCastles = this.game.castles.filter(c => c.ownerClan === subordinateClanId && c.id !== castleId);
        if (myCastles.length === 0) return;

        const myLegionCastles = myCastles.filter(c => c.legionId === castleA.legionId);
        const daimyo = this.game.getClanDaimyo(subordinateClanId);
        const isDaimyoInA = (daimyo && daimyo.castleId === castleId);
        const commanderInA = this.game.bushos.find(b =>
            Number(b.castleId) === Number(castleId) &&
            b.isCommander &&
            Number(b.clan) === Number(subordinateClanId) &&
            Number(b.belongKunishuId || 0) === 0 &&
            window.BushoStatusRules.isActive(b)
        );

        let castleB = null;

        if (isDaimyoInA) {
            const directCastles = myCastles.filter(c => c.legionId === 0);
            if (directCastles.length > 0) {
                castleB = directCastles[0];
            } else {
                const noCommanderCastles = myCastles.filter(c => {
                    const lord = this.game.getBusho(c.castellanId);
                    return !(lord && lord.isCommander);
                });
                if (noCommanderCastles.length > 0) {
                    castleB = noCommanderCastles[0];
                } else {
                    castleB = myCastles[0];
                }
            }
        } else {
            // ★変更：城を譲り渡す際、居残る武将や物資の避難先を「大名居城」に最優先で固定します
            if (daimyo && daimyo.castleId) {
                castleB = this.game.getCastle(daimyo.castleId);
            }
            if (!castleB && myLegionCastles.length > 0) {
                castleB = myLegionCastles[0];
            } else if (!castleB) {
                const directCastles = myCastles.filter(c => c.legionId === 0);
                if (directCastles.length > 0) {
                    castleB = directCastles[0];
                } else {
                    castleB = myCastles[0];
                }
            }
        }

        if (!castleB) castleB = myCastles[0];

        const bushosInA = this.game.getCastleBushos(castleId).filter(b => b.clan === subordinateClanId && window.BushoStatusRules.isActive(b));
        const lordB = this.game.getBusho(castleB.castellanId);

        if (isDaimyoInA && castleB.legionId !== 0 && lordB && lordB.isCommander) {
            lordB.isCastellan = false;
            const targetLegionNo = Number(castleB.legionId);
            const legion = this.game.legions.find(l => Number(l.clanId) === Number(subordinateClanId) && Number(l.legionNo) === targetLegionNo);
            if (legion) this.game.castleManager.disbandLegion(legion.id);
        }

        let disbandedCommander = false;
        if (commanderInA && myLegionCastles.length === 0) {
            commanderInA.isCastellan = false;
            const targetLegionNo = Number(castleA.legionId);
            const legion = this.game.legions.find(l => Number(l.clanId) === Number(subordinateClanId) && Number(l.legionNo) === targetLegionNo);
            if (legion) this.game.castleManager.disbandLegion(legion.id);
            disbandedCommander = true;
        }

        bushosInA.forEach(b => {
            const wasCastellan = b.isCastellan;
            // 一旦全員の城主フラグを外します
            b.isCastellan = false;

            // 大名か、解散されなかった国主で、元々城主だった場合のみ
            if (wasCastellan && (b.isDaimyo || b.isCommander) && !disbandedCommander) {
                // 移動先Bの城主が国主で、自分が大名ではない場合は城主になれません
                if (lordB && lordB.isCommander && !b.isDaimyo) {
                    // 何もしない（Aでの城主身分は剥奪のまま）
                } else {
                    if (lordB) lordB.isCastellan = false;
                    b.isCastellan = true;
                    castleB.castellanId = b.id;
                }
            }

            this.game.affiliationSystem.moveCastle(b, castleB.id);
        });

        // ★追加：合流先の訓練と士気を割合に応じて再計算します！
        const totalSoldiers = castleB.soldiers + castleA.soldiers;
        if (totalSoldiers > 0) {
            castleB.training = Math.floor(((castleB.training || 0) * castleB.soldiers + (castleA.training || 0) * castleA.soldiers) / totalSoldiers);
            castleB.morale = Math.floor(((castleB.morale || 0) * castleB.soldiers + (castleA.morale || 0) * castleA.soldiers) / totalSoldiers);
        }

        // ★追加：物資（金・兵糧・兵士・馬・鉄砲）を全て引越し先のお城に運びます！
        castleB.gold = Math.min(99999, castleB.gold + castleA.gold);
        castleB.rice = Math.min(99999, castleB.rice + castleA.rice);
        castleB.soldiers = Math.min(99999, castleB.soldiers + castleA.soldiers);
        castleB.horses = Math.min(99999, (castleB.horses || 0) + (castleA.horses || 0));
        castleB.guns = Math.min(99999, (castleB.guns || 0) + (castleA.guns || 0));

        // 運び終わったので、元の城（A）の物資はからっぽにします。
        castleA.gold = 0;
        castleA.rice = 0;
        castleA.soldiers = 0;
        castleA.horses = 0;
        castleA.guns = 0;

        if (castleA.soldiers < 1500) castleA.soldiers = 1500;
        if (castleA.rice < 2500) castleA.rice = 2500;
        if (castleA.defense < 200) castleA.defense = Math.min(200, castleA.maxDefense || 9999);
        if (castleA.peoplesLoyalty < 51) castleA.peoplesLoyalty = 51;
        // ★追加：割譲した城の訓練・士気が50未満の場合は50にします！
        if ((castleA.training || 0) < 50) castleA.training = 50;
        if ((castleA.morale || 0) < 50) castleA.morale = 50;

        this.game.castleManager.changeOwner(castleA, dominantClanId, true);
    }

    /**
     * 従属・支配の際の条件交渉を行う魔法です
     */
    negotiateSubordinationConditions(subordinateClanId, dominantClanId, onSuccess, onFailure, conversation = null) {
        const subClan = this.game.clans.find(c => c.id === subordinateClanId);
        const domClan = this.game.clans.find(c => c.id === dominantClanId);
        if (!subClan || !domClan) {
            if (onFailure) onFailure();
            return;
        }

        const isPlayer = (subordinateClanId === this.game.playerClanId);
        if (!isPlayer) {
            if (onSuccess) onSuccess('none', null);
            return;
        }

        const senderBusho = conversation && conversation.senderBusho ? conversation.senderBusho : this.game.getClanDaimyo(subordinateClanId);
        const receiverDaimyo = conversation && conversation.receiverDaimyo ? conversation.receiverDaimyo : this.game.getClanDaimyo(dominantClanId);
        const context = conversation && conversation.context ? conversation.context : null;
        const senderFace = senderBusho ? senderBusho.faceIcon : 'unknown_face.webp';
        const senderName = senderBusho ? senderBusho.fullName : subClan.name;
        const receiverFace = receiverDaimyo ? receiverDaimyo.faceIcon : 'unknown_face.webp';
        const receiverName = receiverDaimyo ? receiverDaimyo.fullName : domClan.name;

        let options = [];
        let availablePrincess = null;
        if (subClan.princessIds && subClan.princessIds.length > 0) {
            for (let pId of subClan.princessIds) {
                const p = this.game.princesses.find(pr => pr.id === pId && pr.status === 'unmarried');
                if (p) {
                    availablePrincess = p;
                    break;
                }
            }
        }

        if (availablePrincess) {
            const domBushos = this.game.bushos.filter(b => b.clan === dominantClanId && window.BushoStatusRules.isActive(b) && !b.female);
            const domDaimyo = this.game.getClanDaimyo(dominantClanId);
            domBushos.sort((a, b) => {
                const getWeight = (target) => {
                    const isKinsman = domDaimyo && (target.id === domDaimyo.id || (Array.isArray(target.familyIds) && target.familyIds.includes(domDaimyo.id)) || (domDaimyo.familyIds && domDaimyo.familyIds.includes(target.id)));
                    const isUnmarried = (!target.wifeIds || target.wifeIds.length === 0);
                    if (isKinsman && isUnmarried) return 4;
                    if (isKinsman) return 3;
                    if (isUnmarried) return 2;
                    return 1;
                };
                const weightA = getWeight(a);
                const weightB = getWeight(b);
                if (weightA !== weightB) return weightB - weightA;
                return Math.abs(a.birthYear - availablePrincess.birthYear) - Math.abs(b.birthYear - availablePrincess.birthYear);
            });
            const targetBusho = domBushos.length > 0 ? domBushos[0] : null;
            if (targetBusho) options.push({ type: 'marriage', princess: availablePrincess, busho: targetBusho });
        }

        const daimyo = this.game.getClanDaimyo(subordinateClanId);
        if (daimyo) {
            const dFamily = Array.isArray(daimyo.familyIds) ? daimyo.familyIds : [];
            const kinsmen = this.game.bushos.filter(b => {
                if (b.clan !== subordinateClanId || b.isDaimyo || !window.BushoStatusRules.isActive(b)) return false;
                const bFamily = Array.isArray(b.familyIds) ? b.familyIds : [];
                return bFamily.includes(daimyo.id) || dFamily.includes(b.id);
            });
            if (kinsmen.length > 0) options.push({ type: 'hostage', busho: kinsmen[0] });
        }

        const subCastles = this.game.castles.filter(c => Number(c.ownerClan) === subordinateClanId);
        if (subCastles.length >= 2) {
            const domCastles = this.game.castles.filter(c => Number(c.ownerClan) === dominantClanId);
            const targetCastle = subCastles.find(sc => {
                const castellan = this.game.getBusho(sc.castellanId);
                if (castellan && castellan.isDaimyo) return false;
                return domCastles.some(dc => MapGraphService.isAdjacent(sc, dc));
            });
            if (targetCastle) options.push({ type: 'castle', castle: targetCastle });
        }

        if (options.length === 0) {
            const noTerms = this._styleDiplomacyTextForSpeaker(
                `「されど、今ここで折り合える条件も見当たらぬ。此度は話を見送るほかあるまい」`,
                context && context.receiverSpeakerPosture ? context.receiverSpeakerPosture.key : 'normal'
            );
            this.game.ui.showDialog(noTerms, false, () => {
                if (onFailure) onFailure();
            }, null, { leftFace: receiverFace, leftName: receiverName });
            return;
        }

        const selectedOption = options[Math.floor(Math.random() * options.length)];
        let conditionText = '';
        if (selectedOption.type === 'marriage') {
            conditionText = `「従属の証として、貴家の${selectedOption.princess.name}を当家の${selectedOption.busho.name}殿へ迎えたい。それを条件としよう」`;
        } else if (selectedOption.type === 'hostage') {
            conditionText = `「従属の証として、${selectedOption.busho.name}殿を当家へ預けてもらいたい。それなら庇護を受け入れよう」`;
        } else if (selectedOption.type === 'castle') {
            conditionText = `「境目の${selectedOption.castle.name}を当家へ割譲してもらいたい。それを従属の条件としよう」`;
        }
        conditionText = this._styleDiplomacyTextForSpeaker(
            conditionText,
            context && context.receiverSpeakerPosture ? context.receiverSpeakerPosture.key : 'normal'
        );

        const acceptCondition = () => {
            const reply = this._styleDiplomacyTextForSpeaker(
                `「承知いたしました。その条件を受け、貴家の御庇護に従います」`,
                context && context.senderSpeakerPosture ? context.senderSpeakerPosture.key : 'normal'
            );
            this.game.ui.showDialog(reply, false, () => {
                if (onSuccess) onSuccess(selectedOption.type, selectedOption);
            }, null, { leftFace: senderFace, leftName: senderName });
        };

        const rejectCondition = () => {
            const reply = this._styleDiplomacyTextForSpeaker(
                `「……その条件まではお受けできませぬ。此度の願いは取り下げます」`,
                context && context.senderSpeakerPosture ? context.senderSpeakerPosture.key : 'normal'
            );
            this.game.ui.showDialog(reply, false, () => {
                if (onFailure) onFailure();
            }, null, { leftFace: senderFace, leftName: senderName });
        };

        this.game.ui.showDialog(conditionText, false, null, null, {
            leftFace: receiverFace,
            leftName: receiverName,
            choices: [
                { label: '条件を受ける', className: 'btn-primary', onClick: acceptCondition },
                { label: '断る', className: 'btn-secondary', onClick: rejectCondition }
            ]
        });
    }

    /**
     * 人質が送られた時のデータ書き換え魔法です
     */
    applyHostageData(hostageId, subordinateClanId, dominantClanId) {
        const hostage = this.game.getBusho(hostageId);
        if (!hostage) return;

        // 相手の大名（当主）がどこにいるか探します
        const dominantDaimyo = this.game.getClanDaimyo(dominantClanId);
        const targetCastleId = dominantDaimyo ? dominantDaimyo.castleId : null;

        if (!targetCastleId) return;

        // 元の大名家のIDを覚えておきます
        hostage.originalClanId = subordinateClanId;
        // 人質シールのフラグを立てます
        hostage.isHostage = true;

        // 人事部（お引越しセンター）にお願いして、相手大名の居城へお引越し＆所属変更させます
        // ※この時、相性計算を飛ばして忠誠度を強制的に100にします！
        this.game.affiliationSystem.joinClan(hostage, dominantClanId, targetCastleId, 100);

        // 人質リストに追加します（自分と相手、両方の外交データに同じように記録します）
        const relationA = this.getDiplomacyData(subordinateClanId, dominantClanId);
        if (relationA && relationA.hostageIds && !relationA.hostageIds.includes(hostageId)) {
            relationA.hostageIds.push(hostageId);
        }
        
        const relationB = this.getDiplomacyData(dominantClanId, subordinateClanId);
        if (relationB && relationB.hostageIds && !relationB.hostageIds.includes(hostageId)) {
            relationB.hostageIds.push(hostageId);
        }
    }

    /**
     * 婚姻が成立した時の、データ書き換え一斉処理です
     */
    _applyMarriageLinkData(princessId, targetBushoId, sourceClanId, targetClanId, { isMainWife = false, boostSentiment = true } = {}) {
        const sourceClan = this.game.clans.find(c => Number(c.id) === Number(sourceClanId));
        const princess = this.game.princesses.find(p => Number(p.id) === Number(princessId));
        const targetBusho = this.game.getBusho(targetBushoId);
        if (!princess || !targetBusho || !sourceClan) return false;

        princess.currentClanId = targetClanId;
        princess.husbandId = targetBushoId;
        princess.status = 'married';
        princess.isDiplomaticMarriageActive = true;
        if (Number(princess.originalClanId || 0) <= 0) princess.originalClanId = sourceClanId;

        if (!Array.isArray(sourceClan.princessIds)) sourceClan.princessIds = [];
        sourceClan.princessIds = sourceClan.princessIds.filter(id => Number(id) !== Number(princessId));

        if (!Array.isArray(targetBusho.wifeIds)) targetBusho.wifeIds = [];
        if (!targetBusho.wifeIds.includes(princessId)) {
            if (isMainWife) targetBusho.wifeIds.unshift(princessId);
            else targetBusho.wifeIds.push(princessId);
        }

        FamilyLinker.rebuildAllFamilyIds(this.game.bushos, this.game.princesses);
        this.setMarriageRelation(sourceClanId, targetClanId, true);
        if (boostSentiment) this.applyMarriageSentimentBoost(sourceClanId, targetClanId);
        return true;
    }

    applyMarriageLinkData(princessId, targetBushoId, sourceClanId, targetClanId, options = {}) {
        return this._applyMarriageLinkData(princessId, targetBushoId, sourceClanId, targetClanId, options);
    }

    applyMarriageData(princessId, targetBushoId, targetClanId, isMainWife = false) {
        // 対外婚姻コマンドは現在プレイヤー側から行うため、実家はplayerClanIdを正本にする。
        // 婚姻成立は姻戚フラグと友好度だけを更新し、同盟・支配・従属などのstatusは上書きしない。
        return this.applyMarriageLinkData(
            princessId, targetBushoId, this.game.playerClanId, targetClanId,
            { isMainWife, boostSentiment: true }
        );
    }

    /**
     * 婚姻コマンドを実行する魔法です
     */
    async executeMarriage(doerId, targetCastleId, princessId, targetBushoId) {
        const doer = this.game.getBusho(doerId);
        const targetCastle = this.game.getCastle(targetCastleId);
        if (!targetCastle) return;
        
        const targetClanId = targetCastle.ownerClan;
        const targetClan = this.game.clans.find(c => c.id === targetClanId);
        const targetBusho = this.game.getBusho(targetBushoId);
        const princess = this.game.princesses.find(p => p.id === princessId);

        const isSuccess = this.checkDiplomacySuccess(doerId, targetCastleId, 'marriage');
        
        if (doer.clan === this.game.playerClanId && targetClanId !== this.game.playerClanId) {
            const targetDaimyo = this.game.getClanDaimyo(targetClanId);
            // ★変更：会話処理に向けて、姫と対象武将のオブジェクトをパスします
            if (targetDaimyo) await this.playDiplomacyConversation(doer, targetDaimyo, 'marriage', isSuccess, princess, targetBusho);
        }

        this.calcDiplomacyExp(doer, 'marriage', isSuccess, true);

        if (isSuccess) {
            this.applyMarriageData(princessId, targetBushoId, targetClanId, true); 
            doer.isActionDone = true;
            doer.achievementTotal += Math.floor(doer.diplomacy * 0.2) + 20;
            this.game.factionSystem.updateRecognition(doer, 30);

            const doerClan = this.game.clans.find(c => c.id === doer.clan);
            const msg = `${targetClan.name} と婚姻関係を結びました！\n${princess.name} は ${targetBusho.name} の正室として迎えられました。`;
            const logMsg = `${doerClan.name}が${targetClan.name}と婚姻関係を結びました`;

            this.showDiplomacyResult(doer.clan, true, msg, logMsg, "", null, [doer.clan, targetClanId]);
        } else {
            this.updateSentiment(doer.clan, targetClanId, window.MainParams.Diplomacy.FailureSentiment.Alliance);
            doer.isActionDone = true;
            doer.achievementTotal += 5;
            this.game.factionSystem.updateRecognition(doer, 10);

            const msg = `${targetClan.name} との婚姻交渉に失敗しました……`;
            this._recordDiplomacyHistory(`【外交】${doerClan.name}と${targetClan.name}の婚姻交渉は成立しませんでした。`, [doer.clan, targetClanId]);
            this.showDiplomacyResult(doer.clan, true, msg, "", "", null, [doer.clan, targetClanId]);
        }
    }

    /**
     * 臣従願を実行して、相手の大名家に乗り換える魔法です！
     */
    async executeVassalage(doerId, targetCastleId) {
        const targetCastle = this.game.getCastle(targetCastleId);
        if (!targetCastle) return;
        
        const targetClanId = targetCastle.ownerClan;
        const myClanId = this.game.playerClanId;
        
        const targetClan = this.game.clans.find(c => c.id === targetClanId);
        const doer = this.game.getBusho(doerId);

        if (doer && doer.clan === this.game.playerClanId && targetClanId !== this.game.playerClanId) {
            const targetDaimyo = this.game.getClanDaimyo(targetClanId);
            if (targetDaimyo) await this.playDiplomacyConversation(doer, targetDaimyo, 'vassalage', true);
        }
        
        // 1. プレイヤー側の軍団をすべて解散させます（お片付け）
        if (this.game.legions) {
            const myLegions = this.game.legions.filter(l => Number(l.clanId) === Number(myClanId));
            myLegions.forEach(l => {
                this.game.castleManager.disbandLegion(l.id);
            });
        }
        
        // 2. プレイヤー側のお城をすべて対象の大名家にプレゼントして、直轄（0）にします
        const myCastles = this.game.castles.filter(c => Number(c.ownerClan) === Number(myClanId));
        myCastles.forEach(c => {
            this.game.castleManager.changeOwner(c, targetClanId, true, 0);
        });
        
        // 3. プレイヤー側の武将のバッジ（身分）を外し、新しい大名家に入れます
        const myBushos = this.game.bushos.filter(b => Number(b.clan) === Number(myClanId));
        myBushos.forEach(b => {
            b.isDaimyo = false;
            
            this.game.affiliationSystem.transferClanRaw(b, targetClanId, { syncSpouses: true });
            
            // 人事部（お引越しセンター）にお願いして、新しい殿様との相性で忠誠度を再計算します！
            this.game.affiliationSystem.updateLoyaltyForNewLord(b, targetClanId);
        });

        // 武将に付随しない未婚姫も、臣従で消えた旧家へ残さない。
        this.game.affiliationSystem.transferUnmarriedPrincesses(myClanId, targetClanId);

        // 外交担当者に行動完了のシールを貼ります
        if (doer) doer.isActionDone = true;
        
        this._recordDiplomacyHistory(`【臣従】${this.game.getClan(myClanId)?.name || '当家'}が${targetClan.name}に臣従しました。`, [myClanId, targetClanId]);

        // 4. プレイヤーの操作担当を、新しい大名家に切り替えます！
        this.game.playerClanId = targetClanId;
        
        const msg = `当家は ${targetClan.name} に臣従しました。これより ${targetClan.name} として天下統一を目指します！`;
        
        // ★臣従の場合は、自分の操作担当(playerClanId)が相手の大名家(targetClanId)に切り替わっているので注意！
        // 画面を更新させるために、実行者として targetClanId を渡します。
        this.showDiplomacyResult(targetClanId, true, msg);
    }

    /**
     * 戦闘などで敗北した勢力を従属させる処理です
     */
    executeSubjugation(winnerClanId, loserClanId) {
        this.changeStatus(winnerClanId, loserClanId, '支配');
        const winner = this.game.clans.find(c => Number(c.id) === Number(winnerClanId));
        const loser = this.game.clans.find(c => Number(c.id) === Number(loserClanId));
        if (winner && loser) {
            this.game.ui.log(`${winner.name}が${loser.name}を従属させました`, { clanIds: [winnerClanId, loserClanId], category: 'diplomacy', inferCurrentTurn: false });
        }
    }
    
    /**
     * AIからプレイヤーへの外交提案を受ける処理です
     */
    proposeDiplomacyToPlayer(doer, targetClanId, type, gold, onComplete, score = 0) {
        const doerClan = this.game.clans.find(c => c.id === doer.clan);

        if (type === 'goodwill') {
            const doerCastle = this.game.getCastle(doer.castleId);
            if (doerCastle) doerCastle.gold = Math.max(0, doerCastle.gold - gold);
        }

        const targetClan = this.game.clans.find(c => c.id === targetClanId);
        const myDaimyo = this.game.getClanDaimyo(targetClanId);
        const enemyDaimyo = this.game.getClanDaimyo(doer.clan);
        
        let myCastle = null;
        if (myDaimyo) myCastle = this.game.getCastle(myDaimyo.castleId);
        if (!myCastle) myCastle = this.game.castles.find(c => c.ownerClan === targetClanId);
        const nav = myCastle ? this.game.getNavigatorInfo(myCastle) : { faceIcon: 'unknown_face.webp', name: '小姓' };

        const isEnemy = this.game.getRelation(targetClanId, doer.clan)?.status === '敵対';
        const isDaimyoSelf = (doer.isDaimyo);
        const enemyDaimyoName = enemyDaimyo ? enemyDaimyo.fullName : "当主";

        const myCallName = this.getCallName(myDaimyo, doer);
        const enemyCallName = this.getCallName(doer, myDaimyo);
        const greeting = this.buildDiplomacyGreeting(doer, myDaimyo);
        const conversationContext = greeting.context;

        let introMsg = "";
        if (isDaimyoSelf) {
            if (isEnemy) {
                introMsg = type === 'truce'
                    ? `「殿、${doerClan.name}当主・${enemyDaimyoName}殿が、和睦の件で面会を求めております。お会いになりますか？」`
                    : `「殿、${doerClan.name}当主・${enemyDaimyoName}殿が面会を求めております。お会いになりますか？」`;
            } else {
                introMsg = `「殿、${doerClan.name}当主・${enemyDaimyoName}様がお見えになっております。お会いになられますか？」`;
            }
        } else if (conversationContext && conversationContext.envoySpecial && conversationContext.envoySpecial.level >= 2) {
            introMsg = `「殿、${doerClan.name}より${enemyCallName}が使者として参っております。お会いになりますか？」`;
        } else {
            introMsg = `「殿、${doerClan.name} から使者が参っております。お会いになられますか？」`;
        }

        const myDaimyoFace = myDaimyo ? myDaimyo.faceIcon : 'unknown_face.webp';
        const myDaimyoNameStr = myDaimyo ? myDaimyo.fullName : '当主';
        const doerNameStr = doer.fullName;

        const msgs = this.getDiplomacyMessages(
            type, isDaimyoSelf, doerClan.name, targetClan.name,
            enemyCallName, myCallName, '姫', '貴家', conversationContext
        );

        const currentProposalRelation = this.getRelation(doer.clan, targetClanId);
        const isVassalAllianceUpgrade = type === 'alliance'
            && currentProposalRelation
            && currentProposalRelation.status === window.GameConstants.DiplomacyStatus.SUBORDINATE;
        if (isVassalAllianceUpgrade) {
            // 高義理の従属家による平和的な主従解消は、プレイヤー発と同じ共通会話を使う。
            Object.assign(msgs, this._getVassalAllianceUpgradeMessages(conversationContext));
        }

        // ★修正：使者が来た瞬間はBGMを変えず、代わりに「使者が来ました！」というお知らせのSEを鳴らします！
        if (window.playEventSoundAndBlock) window.playEventSoundAndBlock();

        const doReject = () => {
            this.calcDiplomacyExp(doer, type, false, true);
            const rejectNames = { goodwill: '親善', alliance: '同盟', dominate: '従属要求', truce: '和睦' };
            const rejectHistory = isVassalAllianceUpgrade
                ? `【外交】${targetClan.name}は${doerClan.name}からの主従解消・同盟移行の申し出を認めませんでした。`
                : `【外交】${targetClan.name}は${doerClan.name}からの${rejectNames[type] || '提案'}を拒否しました。`;
            this._recordDiplomacyHistory(rejectHistory, [doer.clan, targetClanId]);

            if (type === 'goodwill') {
                const doerCastle = this.game.getCastle(doer.castleId);
                if (doerCastle) doerCastle.gold = Math.min(99999, doerCastle.gold + gold);
                this.game.ui.showResultModal(`親善の品を突き返しました。`, () => {
                    if (onComplete) setTimeout(onComplete, 100);
                });
            } else if (type === 'alliance') {
                this.updateSentiment(doer.clan, targetClanId, window.MainParams.Diplomacy.FailureSentiment.Alliance);
                this.game.ui.showResultModal(isVassalAllianceUpgrade ? `主従関係の解消と同盟への移行を見送りました。` : `同盟の提案を拒否しました。`, () => {
                    if (onComplete) setTimeout(onComplete, 100);
                });
            } else if (type === 'dominate') {
                this.updateSentiment(doer.clan, targetClanId, window.MainParams.Diplomacy.FailureSentiment.Dominate);
                this.game.ui.showResultModal(`従属の要求を断固として拒否しました！`, () => {
                    if (onComplete) setTimeout(onComplete, 100);
                });
            } else if (type === 'truce') {
                this.updateSentiment(doer.clan, targetClanId, window.MainParams.Diplomacy.FailureSentiment.Alliance);
                this.game.ui.showResultModal(`和睦の打診を拒否しました。`, () => {
                    if (onComplete) setTimeout(onComplete, 100);
                });
            }
        };

        const rejectAction = () => {
            let msg1 = msgs.rejectMsg;
            let msg2 = msgs.replyRejectMsg;

            this.game.ui.showDialog(msg1, false, () => {
                this.game.ui.showDialog(msg2, false, doReject, null, {
                    leftFace: doer.faceIcon, leftName: doerNameStr
                });
            }, null, {
                leftFace: myDaimyoFace, leftName: myDaimyoNameStr
            });
        };

        const doAccept = () => {
            this.calcDiplomacyExp(doer, type, true, true);

            if (type === 'goodwill') {
                const myCastleObj = this.game.castles.find(c => c.ownerClan === targetClanId);
                if (myCastleObj) myCastleObj.gold = Math.min(99999, myCastleObj.gold + gold);
                const increase = this.calcGoodwillIncrease(gold, doer);
                this.updateSentiment(doer.clan, targetClanId, increase);
                this.game.ui.log(`【外交】${targetClan.name}は${doerClan.name}からの親善を受け入れました。`, { clanIds: [doer.clan, targetClanId], category: 'diplomacy', inferCurrentTurn: false });
                this.game.ui.showResultModal(`${doerClan.name}との関係が改善しました！`, () => {
                    if (onComplete) setTimeout(onComplete, 100);
                });
            } else if (type === 'alliance') {
                this.applyAllianceData(doer.clan, targetClanId);
                
                const allianceLog = isVassalAllianceUpgrade
                    ? `【外交】${targetClan.name}は${doerClan.name}との主従関係を解き、同盟を結びました。`
                    : `【外交】${targetClan.name}は${doerClan.name}と同盟を結びました。`;
                this.game.ui.log(allianceLog, { clanIds: [doer.clan, targetClanId], category: 'diplomacy', inferCurrentTurn: false });
                this.game.ui.showResultModal(isVassalAllianceUpgrade ? `${doerClan.name}との主従関係を解き、同盟を結びました！` : `${doerClan.name} と同盟を結びました！`, () => {
                    if (onComplete) setTimeout(onComplete, 100);
                });
            } else if (type === 'dominate') {
                this.applyDominationData(doer.clan, targetClanId);

                this.game.ui.log(`【外交】${targetClan.name}は${doerClan.name}に従属しました。`, { clanIds: [doer.clan, targetClanId], category: 'diplomacy', inferCurrentTurn: false });
                this.game.ui.showResultModal(`${doerClan.name} に従属しました……`, () => {
                    if (onComplete) setTimeout(onComplete, 100);
                });
            } else if (type === 'truce') {
                this.changeStatus(doer.clan, targetClanId, '和睦', 6);
                const relationA = this.getDiplomacyData(doer.clan, targetClanId);
                const relationB = this.getDiplomacyData(targetClanId, doer.clan);
                if (relationA) relationA.sentiment = 50;
                if (relationB) relationB.sentiment = 50;

                this.game.ui.log(`【外交】${targetClan.name}は${doerClan.name}と和睦しました。`, { clanIds: [doer.clan, targetClanId], category: 'diplomacy', inferCurrentTurn: false });
                this.game.ui.showResultModal(`${doerClan.name} と和睦しました。`, () => {
                    if (onComplete) setTimeout(onComplete, 100);
                });
            }
        };

        const acceptAction = () => {
            let msg1 = msgs.acceptMsg;
            let msg2 = msgs.replyAcceptMsg;

            if (msg1 && msg2) {
                this.game.ui.showDialog(msg1, false, () => {
                    this.game.ui.showDialog(msg2, false, doAccept, null, {
                        leftFace: doer.faceIcon, leftName: doerNameStr
                    });
                }, null, {
                    leftFace: myDaimyoFace, leftName: myDaimyoNameStr
                });
            } else {
                doAccept();
            }
        };

        // 和睦条件を詰める時も、別の事務的な確認画面へ飛ばさず使者との会話を続ける。
        const negotiateAction = () => {
            const requiredScore = 60;
            const penalty = 30;

            const finishBreakdown = () => {
                const reply = this._styleDiplomacyTextForSpeaker(
                    `「左様にござるか。ならば此度の話はここまでにいたしましょう」`,
                    conversationContext && conversationContext.senderSpeakerPosture ? conversationContext.senderSpeakerPosture.key : 'normal'
                );
                this.game.ui.showDialog(reply, false, doReject, null, {
                    leftFace: doer.faceIcon,
                    leftName: doerNameStr
                });
            };

            const offerUnconditionalFallback = (message) => {
                this.game.ui.showDialog(message, false, null, null, {
                    leftFace: doer.faceIcon,
                    leftName: doerNameStr,
                    choices: [
                        { label: '無条件で和睦', className: 'btn-primary', onClick: acceptAction },
                        { label: '交渉を打ち切る', className: 'btn-secondary', onClick: finishBreakdown }
                    ]
                });
            };

            if (score - penalty < requiredScore) {
                const noConcessionRaw = isDaimyoSelf
                    ? `「和睦は望むが、そこまで譲るつもりはない。無条件で矛を収められぬなら、此度は持ち帰ろう」`
                    : `「和睦は願っておりますが、そこまでの譲歩は申しつかっておりませぬ。無条件でなければ、此度は持ち帰ります」`;
                const noConcession = this._styleDiplomacyTextForSpeaker(
                    noConcessionRaw,
                    conversationContext && conversationContext.senderSpeakerPosture ? conversationContext.senderSpeakerPosture.key : 'normal'
                );
                offerUnconditionalFallback(noConcession);
                return;
            }

            const options = this._buildTruceConditionOptions(doer.clan, targetClanId, { aiVsAi: false });
            const selectedOption = this._selectTruceConditionOption(options, doer.clan, targetClanId, score);
            if (!selectedOption) {
                const noTermsRaw = isDaimyoSelf
                    ? `「条件を求める考えは分かった。だが今は差し出せるものがない。無条件の和睦を考えてもらいたい」`
                    : `「条件を求められるのはもっとも。されど今は差し出せるものがござらぬ。無条件の和睦をお考え願いたい」`;
                const noTerms = this._styleDiplomacyTextForSpeaker(
                    noTermsRaw,
                    conversationContext && conversationContext.senderSpeakerPosture ? conversationContext.senderSpeakerPosture.key : 'normal'
                );
                offerUnconditionalFallback(noTerms);
                return;
            }

            const onConditionAccept = () => {
                this.changeStatus(doer.clan, targetClanId, '和睦', 6);
                const relationA = this.getDiplomacyData(doer.clan, targetClanId);
                const relationB = this.getDiplomacyData(targetClanId, doer.clan);
                if (relationA) relationA.sentiment = 50;
                if (relationB) relationB.sentiment = 50;

                const conditionMsg = this._applyTruceConditionData(
                    selectedOption.type, selectedOption, doer.clan, targetClanId, { receiverPerspective: true }
                );
                this.calcDiplomacyExp(doer, type, true, true);
                this.game.ui.log(`【外交】${targetClan.name}は${doerClan.name}と条件付きで和睦しました。`, { clanIds: [doer.clan, targetClanId], category: 'diplomacy', inferCurrentTurn: false });
                this.game.ui.showResultModal(`${doerClan.name} と和睦しました。${conditionMsg}`, () => {
                    if (onComplete) setTimeout(onComplete, 100);
                });
            };

            const onConditionReject = () => {
                const conditionRejectRaw = isDaimyoSelf
                    ? `「その条件でも叶わぬか……。残念だが、此度は兵を収めるには至らぬようだ」`
                    : `「その条件でも叶いませぬか……。残念ながら、此度は兵を収めるには至らぬようにござる」`;
                const reply = this._styleDiplomacyTextForSpeaker(
                    conditionRejectRaw,
                    conversationContext && conversationContext.senderSpeakerPosture ? conversationContext.senderSpeakerPosture.key : 'normal'
                );
                this.game.ui.showDialog(reply, false, doReject, null, {
                    leftFace: doer.faceIcon,
                    leftName: doerNameStr
                });
            };

            const conditionText = this._getTruceConditionOfferText(selectedOption, conversationContext);
            this.game.ui.showDialog(conditionText, false, null, null, {
                leftFace: doer.faceIcon,
                leftName: doerNameStr,
                choices: [
                    { label: 'その条件で和睦', className: 'btn-primary', onClick: onConditionAccept },
                    { label: '断る', className: 'btn-secondary', onClick: onConditionReject }
                ]
            });
        };

        this.game.ui.showDialog(introMsg, true,
            () => {
                // ★「面会する」を選んで本格的に会話劇が始まる瞬間に、外交用のBGMに変更します！
                if (window.AudioManager) {
                    window.AudioManager.memorizeCurrentBgm();
                    window.AudioManager.playBGM('SC_ex_Scene3_Odyssey.ogg');
                }

                const greetMsg1 = greeting.greetMsg1;
                const greetMsg2 = greeting.greetMsg2;

                this.game.ui.showDialog(greetMsg1, false, () => {
                    this.game.ui.showDialog(greetMsg2, false, () => {
                        let demandMsg = msgs.demandMsg;
                        let confirmMsg = "";
                        let okText = "";
                        let cancelText = "";
                        
                        if (type === 'goodwill') {
                            confirmMsg = `「${doerClan.name}からの親善の品をお受け取りになられますか？\n（手土産金：${gold}）」`;
                            okText = '受け取る';
                            cancelText = '突き返す';
                        } else if (type === 'alliance') {
                            if (isVassalAllianceUpgrade) {
                                confirmMsg = `「殿、${doerClan.name}は主従の約を解き、同盟へ改めたいとの申し出です。お認めになりますか？」`;
                                okText = '盟友として認める';
                                cancelText = '今は認めない';
                            } else {
                                confirmMsg = `「${doerClan.name}との同盟を承諾なされますか？」`;
                                okText = '同盟する';
                                cancelText = '断る';
                            }
                        } else if (type === 'dominate') {
                            confirmMsg = `「殿……${doerClan.name} に従属なされますか？」`;
                            okText = '従属する';
                            cancelText = '断る';
                        } else if (type === 'truce') {
                            confirmMsg = `「${doerClan.name} との和睦をお受けなされますか？」`;
                        }

                        const showDecision = () => {
                            if (type === 'truce') {
                                this.game.ui.showDialog(confirmMsg, false, null, null, {
                                    leftFace: nav.faceIcon, leftName: nav.name,
                                    choices: [
                                        { label: '和睦する', className: 'btn-primary', onClick: acceptAction },
                                        { label: '条件を示させる', className: 'btn-danger', onClick: negotiateAction },
                                        { label: '断る', className: 'btn-secondary', onClick: rejectAction }
                                    ]
                                });
                            } else {
                                this.game.ui.showDialog(confirmMsg, true,
                                    acceptAction,
                                    rejectAction,
                                    {
                                        leftFace: nav.faceIcon, leftName: nav.name,
                                        okText: okText, okClass: 'btn-primary',
                                        cancelText: cancelText, cancelClass: 'btn-danger'
                                    }
                                );
                            }
                        };
                        const showRemainingDemand = () => {
                            if (msgs.demandMsg2) {
                                this.game.ui.showDialog(msgs.demandMsg2, false, showDecision, null, {
                                    leftFace: doer.faceIcon, leftName: doerNameStr
                                });
                                return;
                            }
                            showDecision();
                        };

                        this.game.ui.showDialog(demandMsg, false,
                            showRemainingDemand,
                            null,
                            {
                                leftFace: doer.faceIcon, leftName: doerNameStr
                            }
                        );
                    }, null, {
                        leftFace: myDaimyoFace, leftName: myDaimyoNameStr
                    });
                }, null, {
                    leftFace: doer.faceIcon, leftName: doerNameStr
                });
            },
            () => {
                doReject();
            },
            {
                leftFace: nav.faceIcon, leftName: nav.name,
                okText: '面会する', okClass: 'btn-primary',
                cancelText: isVassalAllianceUpgrade ? '面会を見送る' : '追い返す', cancelClass: 'btn-secondary'
            }
        );
    }
    
    /**
     * AI和睦で「現在の前線相手」だけを扱うための共通判定。
     * 親善・同盟などは二段先の外交候補も許すが、和睦は実際に領地が接している敵対勢力に限定する。
     */
    _getDirectNeighborClanIds(clanId) {
        const ownCastles = this.game.getClanCastles ? this.game.getClanCastles(clanId) : [];
        const result = new Set();
        ownCastles.forEach(castle => {
            const adjacentIds = Array.isArray(castle.adjacentCastleIds) ? castle.adjacentCastleIds : [];
            adjacentIds.forEach(adjId => {
                const adjacent = this.game.getCastle ? this.game.getCastle(adjId) : null;
                const ownerClan = adjacent ? Number(adjacent.ownerClan || 0) : 0;
                if (ownerClan > 0 && ownerClan !== Number(clanId)) result.add(ownerClan);
            });
        });
        return [...result];
    }

    areClansDirectlyAdjacent(clanAId, clanBId) {
        const targetId = Number(clanBId);
        if (targetId <= 0 || Number(clanAId) === targetId) return false;
        return this._getDirectNeighborClanIds(clanAId).some(id => Number(id) === targetId);
    }

    canAttemptAITruce(clanId, targetClanId) {
        const clan = this.game.clans.find(c => Number(c.id) === Number(clanId));
        const target = this.game.clans.find(c => Number(c.id) === Number(targetClanId));
        if (!clan || !target || clan.isDestroyed || target.isDestroyed) return false;
        const rel = this.getRelation(clanId, targetClanId);
        if (!rel || rel.status !== window.GameConstants.DiplomacyStatus.HOSTILE) return false;
        return this.areClansDirectlyAdjacent(clanId, targetClanId);
    }

    _getAITrucePressureScore(clanId, opponentClanId) {
        const myPower = Math.max(1, Number(this.game.getClanTotalSoldiers(clanId) || 1));
        const opponentPower = Math.max(1, Number(this.game.getClanTotalSoldiers(opponentClanId) || 1));
        const directEnemyIds = this._getDirectNeighborClanIds(clanId).filter(id => {
            const rel = this.getRelation(clanId, id);
            return rel && rel.status === window.GameConstants.DiplomacyStatus.HOSTILE;
        });

        let totalEnemyCount = 0;
        this.game.clans.forEach(c => {
            if (Number(c.id) <= 0 || Number(c.id) === Number(clanId) || c.isDestroyed) return;
            const rel = this.getRelation(clanId, c.id);
            if (rel && rel.status === window.GameConstants.DiplomacyStatus.HOSTILE) totalEnemyCount++;
        });

        const powerPressure = Math.min(45, (opponentPower / myPower) * 15);
        const directFrontPressure = directEnemyIds.length * 22;
        const extraWarPressure = Math.min(12, Math.max(0, totalEnemyCount - directEnemyIds.length) * 4);
        const castleCount = this.game.getClanCastles ? this.game.getClanCastles(clanId).length : 0;
        const survivalPressure = castleCount > 0 && castleCount <= 2 ? 10 : 0;
        return Math.max(0, Math.min(120, directFrontPressure + powerPressure + extraWarPressure + survivalPressure));
    }

    _getAITruceConditionAcceptanceProb(requestClanId, targetClanId, option) {
        if (!option) return 0;
        const pressure = this._getAITrucePressureScore(requestClanId, targetClanId);
        const requestPower = Math.max(1, Number(this.game.getClanTotalSoldiers(requestClanId) || 1));
        const targetPower = Math.max(1, Number(this.game.getClanTotalSoldiers(targetClanId) || 1));
        const ratio = requestPower / targetPower;
        const costPenalty = option.type === 'castle' ? 44 : (option.type === 'hostage' ? 24 : 8);

        let acceptProb = 18 + (pressure * 0.72) - costPenalty;
        if (ratio < 0.65) acceptProb += 10;
        else if (ratio > 1.5) acceptProb -= 12;

        if (option.type === 'marriage') acceptProb += 5;
        if (option.type === 'castle') {
            const castleCount = this.game.getClanCastles ? this.game.getClanCastles(requestClanId).length : 0;
            if (castleCount <= 2) acceptProb -= 20;
            else if (castleCount === 3) acceptProb -= 8;
        }

        return Math.max(5, Math.min(90, Math.round(acceptProb)));
    }

    _checkAITruceConditionAcceptance(requestClanId, targetClanId, option) {
        const prob = this._getAITruceConditionAcceptanceProb(requestClanId, targetClanId, option);
        return (Math.random() * 100) < prob;
    }

    getVassalIndependenceDisposition(subordinateClanId, dominantClanId, subordinatePower = null, dominantPower = null) {
        const rel = this.getRelation(subordinateClanId, dominantClanId);
        if (!rel || rel.status !== window.GameConstants.DiplomacyStatus.SUBORDINATE || rel.isEvent) {
            return { desire: 0, peacefulPreference: 100, wantsIndependence: false, prefersPeaceful: true };
        }

        const cfg = window.AIParams.AI.VassalIndependence;
        const daimyo = this.game.getClanDaimyo(subordinateClanId);
        const ambitionRaw = daimyo && daimyo.ambition !== undefined ? daimyo.ambition : 50;
        const dutyRaw = daimyo && daimyo.duty !== undefined ? daimyo.duty : 50;
        const ambition = Math.max(0, Math.min(100, Number(ambitionRaw)));
        const duty = Math.max(0, Math.min(100, Number(dutyRaw)));
        const subPower = Math.max(1, Number(subordinatePower !== null ? subordinatePower : this.game.getClanTotalSoldiers(subordinateClanId)) || 1);
        const bossPower = Math.max(1, Number(dominantPower !== null ? dominantPower : this.game.getClanTotalSoldiers(dominantClanId)) || 1);
        const powerRatio = subPower / bossPower;
        const parityBonus = (Math.min(1.5, powerRatio) / 1.5) * cfg.PowerParityWeight;
        const lowSentimentBonus = Math.max(0, 70 - Number(rel.sentiment || 0)) * cfg.LowSentimentWeight;
        const monthsBonus = Math.min(cfg.MonthsMaxBonus, (Number(rel.subordinateMonths || 0) / 24) * cfg.MonthsMaxBonus);

        const desire = Math.max(0, Math.min(100,
            ambition * cfg.AmbitionWeight
            + parityBonus
            + lowSentimentBonus
            + monthsBonus
            - duty * cfg.DutyRestraintWeight
        ));

        let peacefulPreference = duty * cfg.PeacefulDutyWeight
            + Number(rel.sentiment || 0) * cfg.PeacefulSentimentWeight
            + (100 - ambition) * cfg.PeacefulLowAmbitionWeight;
        if (rel.isMarriage) peacefulPreference += cfg.PeacefulMarriageBonus;
        peacefulPreference = Math.max(0, Math.min(100, peacefulPreference));

        return {
            desire,
            peacefulPreference,
            ambition,
            duty,
            powerRatio,
            wantsIndependence: desire >= cfg.DesireThreshold,
            prefersPeaceful: peacefulPreference >= cfg.PeacefulRouteThreshold
        };
    }

    /**
     * AIが特定の相手に対して、どの外交コマンドを実行するか判定して返す魔法です
     */
     
    determineAIDiplomacyAction(myClanId, targetClanId, myPower, targetClanTotal, perceivedTargetTotal, myDaimyoDuty, smartness, isStrategicPartner, allyCount) {
        const rel = this.getRelation(myClanId, targetClanId);

        // ★追加：相手の大名から「宿敵」として恨まれている場合、交渉しても失敗しやすいので外交対象から外します！
        // （無駄な資金や行動回数を消費しないようにする賢いAIの魔法です）
        const myDaimyo = this.game.getClanDaimyo(myClanId); // ★高速化：索引を使って一瞬で見つけます
        const targetDaimyo = this.game.getClanDaimyo(targetClanId); // ★高速化：索引を使って一瞬で見つけます
        if (myDaimyo && targetDaimyo && targetDaimyo.nemesisIds && targetDaimyo.nemesisIds.includes(myDaimyo.id)) {
            return { action: 'none', gold: 0 };
        }

        // 従属家が対等化を望む場合、義理が高いほどいきなり主家へ刃を向けず、
        // まず親善を重ねてから「従属→同盟」への平和的な格上げを申し入れる。
        if (rel && rel.status === window.GameConstants.DiplomacyStatus.SUBORDINATE && !rel.isEvent) {
            const disposition = this.getVassalIndependenceDisposition(myClanId, targetClanId, myPower, targetClanTotal);
            if (disposition.wantsIndependence && disposition.prefersPeaceful) {
                const cfg = window.AIParams.AI.VassalIndependence;
                const excessDesire = Math.max(0, disposition.desire - cfg.DesireThreshold);
                const actionChance = Math.min(0.85,
                    (cfg.PeacefulActionBaseChance + excessDesire * cfg.PeacefulActionDesireScale)
                    * (0.5 + disposition.peacefulPreference / 200)
                );
                if (Math.random() < actionChance) {
                    const allianceThreshold = window.AIParams.AI.AllianceThreshold;
                    if (Number(rel.sentiment || 0) < allianceThreshold) {
                        return { action: 'goodwill', gold: 300, reason: 'vassal_peaceful_upgrade' };
                    }
                    return { action: 'alliance', gold: 0, reason: 'vassal_peaceful_upgrade' };
                }
            }
        }
        
        // AI和睦は現在の前線相手だけを対象にする。
        // 二段先まで広げた一般外交候補から、領地が接していない敵対勢力へ和睦を打診しない。
        const directEnemyIds = this._getDirectNeighborClanIds(myClanId).filter(cId => {
            const clan = this.game.clans.find(c => Number(c.id) === Number(cId));
            if (!clan || clan.isDestroyed) return false;
            const r = this.getRelation(myClanId, cId);
            return r && r.status === window.GameConstants.DiplomacyStatus.HOSTILE;
        });
        const enemyCount = directEnemyIds.length;
        const canAttemptTruce = this.canAttemptAITruce(myClanId, targetClanId);

        const myClan = this.game.clans.find(c => c.id === myClanId);
        const courtTrust = myClan ? (myClan.courtTrust || 0) : 0;

        if (canAttemptTruce && enemyCount >= 2) {
            let isAttackTarget = false;
            if (this.game.aiOperationManager && this.game.aiOperationManager.operations[myClanId]) {
                const ops = this.game.aiOperationManager.operations[myClanId];
                for (const legId in ops) {
                    const op = ops[legId];
                    if (op.type === '攻撃' && op.attackTargets) {
                        if (op.attackTargets.some(t => {
                            const tCastle = this.game.getCastle(t.targetId);
                            return tCastle && tCastle.ownerClan === targetClanId;
                        })) {
                            isAttackTarget = true;
                            break;
                        }
                    }
                }
            }
            if (!isAttackTarget) {
                let truceProb = (enemyCount - 1) * 0.2;
                if (Math.random() < truceProb) {
                    if (courtTrust >= 500) {
                        return { action: 'court_truce', gold: 2000 };
                    } else {
                        // ★変更：朝廷和睦ができない時、和睦したい度合い（スコア）を計算して判定
                        let truceScore = (enemyCount * 15) + ((targetClanTotal / Math.max(1, myPower)) * 10);
                        if (truceScore >= 60) {
                            return { action: 'truce', gold: 0, score: truceScore };
                        }
                    }
                }
            }
        }

        // 仲良しが2つ以上なら、外交する確率を下げる魔法（1つ増えるごとに20%ダウン）
        let sendProbModifier = 1.0;
        if (allyCount >= 2) {
            sendProbModifier = Math.max(0.1, 1.0 - (allyCount - 1) * 0.2); 
        }

        // 自分がどこかに従属しているかチェックします
        let amISubordinate = false;
        this.game.clans.forEach(c => {
            if (c.id !== 0 && c.id !== myClanId && !c.isDestroyed) {
                const r = this.getRelation(myClanId, c.id);
                if (r && r.status === '従属') {
                    amISubordinate = true;
                }
            }
        });

        // 支配要求の判定
        // ★相手の大名が「征夷大将軍」を持っているかをチェックします！
        // 官位システムが持っている将軍IDを使います
        const isTargetShogun = targetDaimyo && targetDaimyo.courtRankIds && targetDaimyo.courtRankIds.includes(this.game.courtRankSystem.RANK_ID_SHOGUN);

        // ★すでに「支配」している相手には、もう支配要求を行わないようにチェックを書き足します！
        // さらに、相手が征夷大将軍の場合は支配要求（降伏勧告）を行わないようにガードを追加します！
        if (!amISubordinate && rel.status !== '支配' && targetClanTotal * 8 <= myPower && !isTargetShogun) {
            // 自分の領地と相手の領地が直接くっついているか調べます
            let isDirectlyAdjacent = false;
            const myCastles = this.game.getClanCastles(myClanId);
            const targetCastles = this.game.getClanCastles(targetClanId);
            
            for (let mc of myCastles) {
                for (let tc of targetCastles) {
                    // お城同士の道が繋がっているか確認します
                    if (MapGraphService.isAdjacent(mc, tc)) {
                        isDirectlyAdjacent = true;
                        break;
                    }
                }
                if (isDirectlyAdjacent) break;
            }

            let isSafeToDominate = true;

            // チェック１：同じ「国（尾張など）」に城を持っているか調べます
            const myProvinces = new Set();
            myCastles.forEach(c => myProvinces.add(c.provinceId));

            for (let tc of targetCastles) {
                if (myProvinces.has(tc.provinceId)) {
                    isSafeToDominate = false; 
                    break;
                }
            }

            // チェック２：二条城（城ID:26）への道を塞いでしまわないか調べます
            if (isSafeToDominate) {
                const nijoCastleId = 26;
                const nijoCastle = this.game.castles.find(c => c.id === nijoCastleId);
                
                if (nijoCastle && nijoCastle.ownerClan !== myClanId) {
                    let queue = [];
                    let visited = new Set();
                    let parentMap = new Map(); 
                    
                    for (let mc of myCastles) {
                        queue.push(mc.id);
                        visited.add(mc.id);
                    }
                    
                    let foundNijo = false;
                    
                    while (queue.length > 0) {
                        let currentId = queue.shift();
                        
                        if (currentId === nijoCastleId) {
                            foundNijo = true;
                            break; 
                        }
                        
                        let currentCastle = this.game.castles.find(c => c.id === currentId);
                        if (currentCastle && currentCastle.adjacentCastleIds) {
                            for (let adjId of currentCastle.adjacentCastleIds) {
                                if (!visited.has(adjId)) {
                                    let adjCastle = this.game.castles.find(c => c.id === adjId);
                                    if (adjCastle) {
                                        if (adjCastle.ownerClan === myClanId || adjCastle.ownerClan === 0 || adjCastle.ownerClan === targetClanId || adjCastle.id === nijoCastleId) {
                                            visited.add(adjId);
                                            parentMap.set(adjId, currentId); 
                                            queue.push(adjId);
                                        }
                                    }
                                }
                            }
                        }
                    }
                    
                    if (foundNijo) {
                        let currId = nijoCastleId;
                        while (parentMap.has(currId)) {
                            let pId = parentMap.get(currId);
                            let pCastle = this.game.castles.find(c => c.id === pId);
                            
                            if (pCastle && pCastle.ownerClan === targetClanId) {
                                isSafeToDominate = false;
                                break;
                            }
                            currId = pId; 
                        }
                    }
                }
            }

            if (isDirectlyAdjacent && isSafeToDominate && Math.random() < 0.05) { 
                return { action: 'dominate', gold: 0 };
            }
        }

        // 親善・同盟の判定
        // ★修正：同盟や支配・従属状態の相手でも、条件を満たせば親善を行うようにしました！

        // ★追加：臣従イベントの条件（相手の威信12倍以上、従属期間20ヶ月以上）を満たしているか調べます
        let isAimingVassalage = false;
        if (rel.status === '従属' && rel.sentiment < 100) {
            const myClanData = this.game.clans.find(c => c.id === myClanId);
            const targetClanData = this.game.clans.find(c => c.id === targetClanId);
            if (myClanData && targetClanData && targetClanData.daimyoPrestige >= myClanData.daimyoPrestige * 12 && (rel.subordinateMonths || 0) >= 20) {
                isAimingVassalage = true;
            }
        }
        
        // ★修正：臣従を目指している場合も、外交の土俵に上がれるように条件に追加します
        if (myPower < perceivedTargetTotal * 0.8 || isStrategicPartner || isAimingVassalage) {
            if (Math.random() < smartness * sendProbModifier) {
                const allianceThreshold = isStrategicPartner ? (window.AIParams.AI.AllianceThreshold) - 15 : (window.AIParams.AI.AllianceThreshold);
                let goodwillThreshold = isStrategicPartner ? (window.AIParams.AI.GoodwillThreshold) + 20 : (window.AIParams.AI.GoodwillThreshold);

                // ★追加：同盟、支配、従属関係にある相手には、関係値が100になるまで親善の対象にします！
                if (window.DiplomacyRules.isAllianceOrVassal(rel.status)) {
                    goodwillThreshold = 100;
                }

                if (rel.sentiment < goodwillThreshold) {
                     const ratio = perceivedTargetTotal / Math.max(1, myPower); 
                     
                     let willGoodwill = true;
                     if (rel.sentiment <= 50) {
                         let skipProb = (50 - rel.sentiment) * 2; 
                         if (isStrategicPartner) { 
                             skipProb -= 30; 
                         }
                         if (rel.status === '敵対' && !isStrategicPartner) { 
                             skipProb += 60; 
                         }

                         // ★追加：臣従を狙っている場合は、足切りされる確率を半分に減らしてあげます
                         if (isAimingVassalage) {
                             skipProb = skipProb / 2;
                         }

                         if (Math.random() * 100 < skipProb) {
                             willGoodwill = false;
                         }
                     }

                     // ★追加：同盟・支配・従属相手への親善は、大名の義理が低いほどサボりやすくなります！
                     if (willGoodwill && window.DiplomacyRules.isAllianceOrVassal(rel.status)) {
                         // 義理100で1.0(100%実行)、義理0で0.5(50%の確率で実行)になる計算式です
                         let executeProb = 0.5 + (myDaimyoDuty / 200);
                         // ★追加：臣従を目指している時は、サボる確率を少し減らします（確率を+20%アップ）
                         if (isAimingVassalage) {
                             executeProb = Math.min(1.0, executeProb + 0.2);
                         }

                         // サイコロを振って、確率より大きい数字が出たら親善をサボります
                         if (Math.random() > executeProb) {
                             willGoodwill = false;
                         }
                     }

                     if (!willGoodwill || (rel.sentiment <= 30 && ratio < 3.0 && !isStrategicPartner && !isAimingVassalage)) {
                         return { action: 'none', gold: 0 };
                     } else {
                         // ★追加：関係値が100以上の時は親善しません（念のためのストッパーです）
                         if (rel.sentiment >= 100) {
                             return { action: 'none', gold: 0 };
                         }

                         let goodwillGold = 300; 
                         if (ratio >= 3.0) {
                             goodwillGold = 1000; 
                         } else if (ratio > 1.5) {
                             goodwillGold = 300 + ((ratio - 1.5) / 1.5) * 700;
                         }

                         // ★追加：臣従を目指している場合は、少しだけ奮発して親善しやすくします
                         if (isAimingVassalage && goodwillGold < 600) {
                             goodwillGold = 600;
                         }

                         // ★ここから追加：成功率が70%未満なら、金額を上乗せして確率を上げる賢いAIの魔法！
                         if (myDaimyo && targetDaimyo && targetDaimyo.castleId) {
                             // お金0でのベース成功率を予測します
                             // （※もしこのコードを ai.js に書いている場合は、this.getDiplomacyProb を this.game.diplomacyManager.getDiplomacyProb に変更してください）
                             const baseProb = this.getDiplomacyProb(myDaimyo.id, targetDaimyo.castleId, 'goodwill', 0);
                             
                             if (baseProb < 70) {
                                 // 70%に届くために足りない確率を計算します
                                 const shortage = 70 - baseProb;
                                 // 1%上げるのに150金（0.1%で15金）必要なので、必要な追加金額を計算します
                                 const neededGold = Math.ceil(shortage * 150);
                                 
                                 // AIが元々予定していた金額より多く必要なら、奮発して金額を増やします
                                 if (goodwillGold < neededGold) {
                                     goodwillGold = neededGold;
                                 }
                             }
                         }

                         // 最大1500金までに制限して、100金単位で綺麗に丸めます
                         goodwillGold = Math.min(1500, Math.floor(goodwillGold / 100) * 100); 
                         
                         // 0金で親善しないように最低額を200金に保証します
                         if (goodwillGold < 200) goodwillGold = 200; 

                         return { action: 'goodwill', gold: goodwillGold };
                     }
                } else if (rel.sentiment > allianceThreshold) {
                     // ★追加：すでに同盟や支配をしている相手には、新しく「同盟」の提案はしません
                     if (!window.DiplomacyRules.isAllianceOrVassal(rel.status)) {
                         return { action: 'alliance', gold: 0 };
                     }
                }
            }
        }

        return { action: 'none', gold: 0 };
    }
    
    /**
     * ★今回追加：同盟や従属を破棄して攻撃する時の、破棄スコア（やりたさ）を計算する魔法です！
     * いままでの確率の計算式をそのまま使って、100点満点のスコアにしてお返しします。
     */
    calcBreakAllianceScore(myClanId, targetClanId, myPower, targetClanTotal, myDaimyoDuty, neighbors) {
        const rel = this.getRelation(myClanId, targetClanId);
        if (!rel) return -999;

        // 自分が相手に従属している時の独立判断。
        // 野望が低い大名は独立そのものを考えにくく、義理が高い大名は同盟格上げを優先して直接攻撃を抑える。
        if (rel.status === '従属') {
            const myClan = this.game.clans.find(c => Number(c.id) === Number(myClanId));
            const diplomacyPlan = myClan && myClan.currentDiplomacyTarget;
            if (diplomacyPlan
                && Number(diplomacyPlan.targetId) === Number(targetClanId)
                && diplomacyPlan.reason === 'vassal_peaceful_upgrade'
                && (diplomacyPlan.action === 'goodwill' || diplomacyPlan.action === 'alliance')) {
                return -999;
            }

            const disposition = this.getVassalIndependenceDisposition(myClanId, targetClanId, myPower, targetClanTotal);
            if (!disposition.wantsIndependence) return -999;

            const cfg = window.AIParams.AI.VassalIndependence;
            let directness = 1 - (disposition.duty / 100) * cfg.DirectBreakDutySuppression;
            if (disposition.prefersPeaceful) directness *= 0.45;
            const score = (15 + Math.max(0, disposition.desire - cfg.DesireThreshold)) * directness;
            return score > 0 ? score : -999;
        }

        // 相手が同盟している時の計算です
        if (rel.status === '同盟') {
            if (rel.sentiment >= 50) return -999; // 仲良し度50以上なら絶対に裏切りません！

            let breakScore = 0; 
            let minEnemyPower = -1; 
            
            const uniqueClans = [...new Set(neighbors.map(c => c.ownerClan))];
            uniqueClans.forEach(clanId => {
                const clan = this.game.clans.find(c => c.id === clanId);
                if (!clan || clan.isDestroyed) return;
                
                const r = this.getRelation(myClanId, clanId);
                if (r && !window.DiplomacyRules.isAllianceOrVassal(r.status)) {
                    const p = Math.max(1, clan.daimyoPrestige);
                    if (minEnemyPower === -1 || p < minEnemyPower) {
                        minEnemyPower = p;
                    }
                }
            });

            let comparePower = minEnemyPower !== -1 ? minEnemyPower : myPower;
            const powerRatio = targetClanTotal / comparePower;
            
            if (powerRatio < 1.0) {
                breakScore += (1.0 - powerRatio) * 2.5; // (0.025 * 100)
            }

            if (rel.sentiment < 50) {
                breakScore += (50 - rel.sentiment) * 0.3; 
            }

            breakScore += (50 - myDaimyoDuty) * 0.3;

            return breakScore > 0 ? breakScore : -999;
        }

        return -999;
    }

    /**
     * ★新規追加：援軍として呼べるお城や諸勢力のリストを探す専門の魔法です！
     * 自勢力・他勢力、攻撃・守備のすべてをここで判定し、全権を担います。
     */
    findAvailableReinforcements(isSelf, isDefending, initiatorCastleId, targetCastle, myClanId, enemyClanId, connectedCastles) {
        let forces = [];
        
        // ★追加：敵対陣営に参加している勢力（大名家や諸勢力）を除外するためのリストを作成
        const hostileClans = new Set();
        const hostileKunishus = new Set();

        if (enemyClanId) {
            hostileClans.add(Number(enemyClanId));
        }

        if (this.game.warManager && this.game.warManager.state && this.game.warManager.state.active) {
            const s = this.game.warManager.state;
            
            // 自分が防衛側なら、攻撃陣営（メイン、援軍）を敵とみなす
            if (isDefending) {
                if (s.attacker) {
                    if (s.attacker.isKunishu) hostileKunishus.add(Number(s.attacker.kunishuId));
                    else hostileClans.add(Number(s.attacker.ownerClan));
                }
                if (s.reinforcement) {
                    if (s.reinforcement.isKunishuForce) hostileKunishus.add(Number(s.reinforcement.kunishuId));
                    else hostileClans.add(Number(s.reinforcement.castle.ownerClan));
                }
                if (s.selfReinforcement) {
                    hostileClans.add(Number(s.selfReinforcement.castle.ownerClan));
                }
            } 
            // 自分が攻撃側なら、防衛陣営（メイン、援軍）を敵とみなす
            else {
                if (s.defender) {
                    if (s.defender.isKunishu) hostileKunishus.add(Number(s.defender.kunishuId));
                    else hostileClans.add(Number(s.defender.ownerClan));
                }
                if (s.oldDefClanId) hostileClans.add(Number(s.oldDefClanId));

                if (s.defReinforcement) {
                    if (s.defReinforcement.isKunishuForce) hostileKunishus.add(Number(s.defReinforcement.kunishuId));
                    else hostileClans.add(Number(s.defReinforcement.castle.ownerClan));
                }
                if (s.defSelfReinforcement) {
                    hostileClans.add(Number(s.defSelfReinforcement.castle.ownerClan));
                }
            }
        }

        // ★Round10：援軍候補ごとに全城を some() し直さないよう、
        // 「接続領＋その隣接城」と「攻撃対象＋その隣接城」を1回だけ集合化します。
        // isAdjacent() と同じく、隣接IDが片側にしか書かれていない場合も両方向として扱います。
        const connectedIdSet = new Set(Array.from(connectedCastles || [], id => Number(id)));
        const connectedOrAdjacentIds = new Set(connectedIdSet);
        const targetId = Number(targetCastle.id);
        const targetOrAdjacentIds = new Set([targetId]);

        for (const castle of this.game.castles) {
            const castleId = Number(castle.id);
            for (const rawAdjId of (castle.adjacentCastleIds || [])) {
                const adjId = Number(rawAdjId);
                if (connectedIdSet.has(castleId)) connectedOrAdjacentIds.add(adjId);
                if (connectedIdSet.has(adjId)) connectedOrAdjacentIds.add(castleId);
                if (castleId === targetId) targetOrAdjacentIds.add(adjId);
                if (adjId === targetId) targetOrAdjacentIds.add(castleId);
            }
        }

        this.game.castles.forEach(c => {
            // 1. 共通の条件：大雪の国からは出陣できません
            const prov = this.game.provinces.find(p => p.id === c.provinceId);
            if (prov && prov.statusEffects && prov.statusEffects.includes('heavySnow')) return;
            
            // ★修正：自分自身（出陣元の城）および対象（攻撃/防衛されている城）かどうかを判定します
            const isInitiatorOrTarget = (Number(c.id) === Number(initiatorCastleId) || Number(c.id) === Number(targetCastle.id));

            // 2. 自勢力（自分の別のお城）を探す場合
            if (isSelf) {
                // ★大名家の自軍援軍として、出陣元や対象の城は除外します
                if (isInitiatorOrTarget) return;

                if (Number(c.ownerClan) !== Number(myClanId)) return;
                
                // 道が繋がっているか、すぐ隣か
                const isConnected = connectedOrAdjacentIds.has(Number(c.id));
                const isNextToEnemy = targetOrAdjacentIds.has(Number(c.id));
                
                if (isConnected || isNextToEnemy) {
                    const availableBushos = this.game.getCastleBushos(c.id).filter(b => b.clan === c.ownerClan && window.BushoStatusRules.isActive(b));
                    // 守備の場合は兵糧も500必要
                    const minRice = isDefending ? 500 : 0;
                    
                    if (c.soldiers >= 1000 && c.rice >= minRice && availableBushos.length > 0) {
                        forces.push(c); // 自勢力の場合はお城のデータをそのまま渡します
                    }
                }
            } 
            // 3. 他勢力（同盟国や諸勢力）を探す場合
            else {
                // 目標が諸勢力かどうかで敵大名を判定
                const isTargetKunishu = targetCastle.isKunishu;
                const actualEnemyClanId = isTargetKunishu ? 0 : Number(enemyClanId);
                const cOwnerClanId = Number(c.ownerClan);

                // --- 大名家のチェック ---
                // ★大名家の他勢力援軍として、出陣元や対象の城は除外します
                if (!isInitiatorOrTarget && cOwnerClanId !== 0 && cOwnerClanId !== Number(myClanId)) {
                    // ★追加：敵対陣営として参加確定している勢力は呼べない
                    if (hostileClans.has(cOwnerClanId)) {
                        // 除外
                    } else {
                        const enemyRel = this.getRelation(cOwnerClanId, actualEnemyClanId);
                        const isEnemyAlly = enemyRel && window.DiplomacyRules.isProtectedFromImmediateAttack(enemyRel.status);
                        const isEnemyMaxGoodwill = enemyRel && enemyRel.sentiment >= 100;
                        
                        // 敵と仲良し過ぎないかチェック（戦争相手と同盟・支配・従属等ではないか）
                        if (!isEnemyAlly && !isEnemyMaxGoodwill && (!enemyRel || !this.isNonAggression(enemyRel.status))) {
                            
                            // ★自分と「同盟・支配・従属」関係にあるかをチェックします！
                            const myRel = this.getRelation(Number(myClanId), cOwnerClanId);
                            const isMyAllyOrVassal = myRel && window.DiplomacyRules.isAllianceOrVassal(myRel.status);
                            
                            // ★同盟・支配・従属関係であれば、自勢力を通って繋がる拠点（攻撃先と隣接していなくても）を援軍として呼べるようにします！
                            let isConnected = false;
                            if (isMyAllyOrVassal) {
                                isConnected = connectedOrAdjacentIds.has(Number(c.id));
                            }
                            
                            // 自軍側が応援を呼ぶ時は、対象と直接隣接していればOK（敵の敵は味方として）
                            const isNextToEnemy = !isDefending && (targetOrAdjacentIds.has(Number(c.id)));
                            
                            if (isConnected || isNextToEnemy) {
                                const availableBushos = this.game.getCastleBushos(c.id).filter(b => b.clan === c.ownerClan && window.BushoStatusRules.isActive(b));
                                const minRice = isDefending ? 500 : 0;
                                
                                if (c.soldiers >= 1000 && c.rice >= minRice && availableBushos.length > 0) {
                                    const clan = this.game.clans.find(clanInfo => clanInfo.id === c.ownerClan);
                                    const castellan = this.game.getBusho(c.castellanId) || {name: "城主"};
                                    forces.push({ castle: c, force: { isKunishu: false, id: c.ownerClan, name: clan ? clan.name : "大名家", leaderName: castellan.name, soldiers: c.soldiers } });
                                }
                            }
                        }
                    }
                }

                // --- 諸勢力のチェック ---
                // その城にいる諸勢力を全員チェックします
                const kunishus = this.game.kunishuSystem.getKunishusInCastle(c.id);
                kunishus.forEach(k => {
                    // 攻撃対象の諸勢力自身は呼べないようにガード
                    if (isTargetKunishu && targetCastle.kunishuId === k.id) return;
                    
                    // ★追加：敵対陣営として参加確定している諸勢力は呼べない
                    if (hostileKunishus.has(Number(k.id))) return;

                    // ★今回追加：商人勢力は戦わないので援軍として呼べないようにガードします！
                    if (k.ideology === '商人') return;

                    const enemyKunishuRel = isTargetKunishu ? 0 : k.getRelation(actualEnemyClanId);
                    // ★関係条件（友好度）を撤廃。兵力と敵との関係のみチェック
                    const canRequest = isTargetKunishu ? 
                        (k.soldiers >= 1000) : 
                        (k.soldiers >= 1000 && enemyKunishuRel < 100);

                    if (canRequest) {
                        const isConnected = connectedOrAdjacentIds.has(Number(c.id));
                        const isNextToEnemy = !isDefending && (targetOrAdjacentIds.has(Number(c.id)));
                        
                        if (isConnected || isNextToEnemy) {
                            const members = this.game.kunishuSystem.getKunishuMembers(k.id);
                            if (members.length > 0) {
                                const leader = this.game.getBusho(k.leaderId) || members[0];
                                forces.push({ castle: c, force: { isKunishu: true, id: k.id, name: k.getName(this.game), leaderName: leader.name, soldiers: k.soldiers } });
                            }
                        }
                    }
                });
            }
        });

        return forces;
    }

    /**
     * 和睦条件の候補を一元生成する。
     * 条件交渉は外交会話の一部として扱い、プレイヤー向け/AI向けで候補生成を重複させない。
     */
    _buildTruceConditionOptions(requestClanId, targetClanId, { aiVsAi = false } = {}) {
        const reqClan = this.game.clans.find(c => Number(c.id) === Number(requestClanId));
        const tgtClan = this.game.clans.find(c => Number(c.id) === Number(targetClanId));
        if (!reqClan || !tgtClan) return [];

        const options = [];
        const reqDaimyo = this.game.getClanDaimyo(requestClanId);
        const tgtDaimyo = this.game.getClanDaimyo(targetClanId);

        // 縁組。90000番台はゲーム中に生成した架空姫。
        // AI同士では史実姫を自動消費せず、プレイヤーが条件を差し出す場合も架空姫を先に要求する。
        const princessIds = Array.isArray(reqClan.princessIds) ? reqClan.princessIds : [];
        const unmarriedPrincesses = princessIds
            .map(id => this.game.princesses.find(p => Number(p.id) === Number(id)))
            .filter(p => p && p.status === 'unmarried');
        const generatedPrincess = unmarriedPrincesses.find(p => Number(p.id) >= 90000) || null;
        let availablePrincess = null;
        if (aiVsAi) {
            availablePrincess = generatedPrincess;
        } else if (Number(requestClanId) === Number(this.game.playerClanId)) {
            availablePrincess = generatedPrincess || unmarriedPrincesses[0] || null;
        } else {
            availablePrincess = unmarriedPrincesses[0] || null;
        }
        if (availablePrincess) {
            const targetBushos = this.game.bushos
                .filter(b => Number(b.clan) === Number(targetClanId) && window.BushoStatusRules.isActive(b) && !b.female && (!aiVsAi || !Array.isArray(b.wifeIds) || b.wifeIds.length === 0))
                .sort((a, b) => {
                    const weight = busho => {
                        const familyIds = Array.isArray(busho.familyIds) ? busho.familyIds : [];
                        const daimyoFamilyIds = tgtDaimyo && Array.isArray(tgtDaimyo.familyIds) ? tgtDaimyo.familyIds : [];
                        const isKinsman = !!(tgtDaimyo && (Number(busho.id) === Number(tgtDaimyo.id) || familyIds.includes(tgtDaimyo.id) || daimyoFamilyIds.includes(busho.id)));
                        const isUnmarried = !Array.isArray(busho.wifeIds) || busho.wifeIds.length === 0;
                        if (isKinsman && isUnmarried) return 4;
                        if (isKinsman) return 3;
                        if (isUnmarried) return 2;
                        return 1;
                    };
                    const diff = weight(b) - weight(a);
                    if (diff !== 0) return diff;
                    return Math.abs(Number(a.birthYear || 0) - Number(availablePrincess.birthYear || 0))
                        - Math.abs(Number(b.birthYear || 0) - Number(availablePrincess.birthYear || 0));
                });
            if (targetBushos[0]) options.push({ type: 'marriage', princess: availablePrincess, busho: targetBushos[0] });
        }

        // 人質。AI同士は一門が少ない家から自動で取り上げない既存の安全策を維持する。
        if (reqDaimyo) {
            const dFamily = Array.isArray(reqDaimyo.familyIds) ? reqDaimyo.familyIds : [];
            const kinsmen = this.game.bushos.filter(b => {
                if (Number(b.clan) !== Number(requestClanId) || b.isDaimyo || !window.BushoStatusRules.isActive(b)) return false;
                const bFamily = Array.isArray(b.familyIds) ? b.familyIds : [];
                return bFamily.includes(reqDaimyo.id) || dFamily.includes(b.id);
            });
            if (kinsmen.length > 0 && (!aiVsAi || kinsmen.length > 3)) {
                options.push({ type: 'hostage', busho: kinsmen[0] });
            }
        }

        // 城割譲。大名居城は除外し、相手領と接する境目の城だけを候補にする。
        const reqCastles = this.game.castles.filter(c => Number(c.ownerClan) === Number(requestClanId));
        if (reqCastles.length >= 2) {
            const reqDaimyoCastleId = reqDaimyo ? Number(reqDaimyo.castleId) : -1;
            const tgtCastles = this.game.castles.filter(c => Number(c.ownerClan) === Number(targetClanId));
            const candidateCastles = reqCastles.filter(c => {
                if (Number(c.id) === reqDaimyoCastleId) return false;
                if (aiVsAi && Number(c.legionId || 0) !== 0) return false;
                const castellan = this.game.getBusho(c.castellanId);
                if (!aiVsAi && castellan && castellan.isDaimyo) return false;
                return tgtCastles.some(dc => MapGraphService.isAdjacent(c, dc));
            });
            if (candidateCastles[0]) options.push({ type: 'castle', castle: candidateCastles[0] });
        }

        return options;
    }

    /**
     * 条件の重さを戦況に合わせて選ぶ。
     * 大きく劣勢なら城、やや劣勢なら人質、拮抗なら縁組を優先し、
     * 「たまたま乱数で最も重い条件が飛んでくる」印象を避ける。
     */
    _selectTruceConditionOption(options, requestClanId, targetClanId, pressureScore = 0) {
        if (!Array.isArray(options) || options.length === 0) return null;
        const requestPower = Math.max(1, Number(this.game.getClanTotalSoldiers(requestClanId) || 1));
        const targetPower = Math.max(1, Number(this.game.getClanTotalSoldiers(targetClanId) || 1));
        const ratio = requestPower / targetPower;
        const pressure = Number(pressureScore || 0);
        let priority;
        if (pressure >= 90 || ratio < 0.65) priority = ['castle', 'hostage', 'marriage'];
        else if (pressure >= 75 || ratio < 0.85) priority = ['hostage', 'castle', 'marriage'];
        else priority = ['marriage', 'hostage', 'castle'];
        for (const type of priority) {
            const found = options.find(option => option.type === type);
            if (found) return found;
        }
        return options[0];
    }

    _getTruceConditionDemandText(option, conversationContext = null) {
        if (!option) return '';
        let text = '';
        if (option.type === 'marriage') {
            text = `「和睦の証として、貴家の${option.princess.name}姫と当家の${option.busho.name}との縁組を願いたい。それなら兵を退こう」`;
        } else if (option.type === 'hostage') {
            text = `「和睦の証として、${option.busho.name}殿を当家へ預けてもらいたい。それなら此度の戦を収めよう」`;
        } else if (option.type === 'castle') {
            text = `「境目の${option.castle.name}を当家へ渡してもらいたい。それをもって兵を退こう」`;
        }
        const posture = conversationContext && conversationContext.receiverSpeakerPosture
            ? conversationContext.receiverSpeakerPosture.key
            : 'normal';
        return this._styleDiplomacyTextForSpeaker(text, posture);
    }

    _getTruceConditionOfferText(option, conversationContext = null) {
        if (!option) return '';
        let text = '';
        if (option.type === 'marriage') {
            text = `「和睦の証として、当家の${option.princess.name}姫を${option.busho.name}殿へ嫁がせましょう。この縁で矛を収めていただきたい」`;
        } else if (option.type === 'hostage') {
            text = `「では和睦の証として、当家の${option.busho.name}を人質に出そう。それで兵を退いていただけるか」`;
        } else if (option.type === 'castle') {
            text = `「では境目の${option.castle.name}を貴家へ渡しましょう。それで此度の戦を収めていただきたい」`;
        }
        const posture = conversationContext && conversationContext.senderSpeakerPosture
            ? conversationContext.senderSpeakerPosture.key
            : 'normal';
        return this._styleDiplomacyTextForSpeaker(text, posture);
    }

    /**
     * 和睦条件の実データ反映を一元化する。
     * requestClanId が条件を差し出す側、targetClanId が受け取る側。
     */
    _applyTruceConditionData(conditionType, conditionData, requestClanId, targetClanId, { receiverPerspective = false } = {}) {
        if (!conditionType || conditionType === 'none' || !conditionData) return '';
        const requestClan = this.game.clans.find(c => Number(c.id) === Number(requestClanId));
        const relationA = this.getDiplomacyData(requestClanId, targetClanId);
        const relationB = this.getDiplomacyData(targetClanId, requestClanId);

        if (conditionType === 'marriage') {
            const princess = conditionData.princess;
            const busho = conditionData.busho;
            if (!princess || !busho) return '';
            // 和睦条件としての縁組は通常の婚姻外交とは性格が異なり、
            // 人質・城割譲と同じく「和睦の担保」として扱う。
            // 婚姻関係そのものは成立させるが、通常婚姻の大幅な友好度上昇は適用しない。
            this._applyMarriageLinkData(
                princess.id, busho.id, requestClanId, targetClanId,
                { isMainWife: false, boostSentiment: false }
            );
            return `\n${princess.name}と${busho.name}の縁組が結ばれました。`;
        }

        if (conditionType === 'hostage' && conditionData.busho) {
            this.applyHostageData(conditionData.busho.id, requestClanId, targetClanId);
            return receiverPerspective
                ? `\n${conditionData.busho.name}を和睦の証として預かりました。`
                : `\n${conditionData.busho.name}を和睦の証として差し出しました。`;
        }

        if (conditionType === 'castle' && conditionData.castle) {
            this.applyCastleCessionData(conditionData.castle.id, requestClanId, targetClanId);
            return receiverPerspective
                ? `\n${conditionData.castle.name}を受け取りました。`
                : `\n${conditionData.castle.name}を割譲しました。`;
        }

        return '';
    }

    /**
     * 和睦の際の条件交渉。
     * プレイヤーが申し込んだ場合は、相手当主が会話の中で具体条件を提示してから選ばせる。
     */
    negotiateTruceConditions(requestClanId, targetClanId, onSuccess, onFailure, conversation = null) {
        const reqClan = this.game.clans.find(c => Number(c.id) === Number(requestClanId));
        const tgtClan = this.game.clans.find(c => Number(c.id) === Number(targetClanId));
        if (!reqClan || !tgtClan) {
            if (onFailure) onFailure();
            return;
        }

        const isPlayer = Number(requestClanId) === Number(this.game.playerClanId);
        const isTargetPlayer = Number(targetClanId) === Number(this.game.playerClanId);

        // AIからプレイヤーへの条件交渉は proposeDiplomacyToPlayer 側で、プレイヤーの選択を含めて処理する。
        if (!isPlayer && isTargetPlayer) {
            if (onSuccess) onSuccess('none', null);
            return;
        }

        const aiVsAi = !isPlayer && !isTargetPlayer;
        const options = this._buildTruceConditionOptions(requestClanId, targetClanId, { aiVsAi });
        const pressureScore = aiVsAi ? this._getAITrucePressureScore(requestClanId, targetClanId) : 0;
        const selectedOption = this._selectTruceConditionOption(options, requestClanId, targetClanId, pressureScore);
        if (!selectedOption) {
            if (onFailure) onFailure();
            return;
        }

        if (aiVsAi) {
            // 相手が条件を出しただけで自動成立させず、申し込んだ側AIが
            // 「その譲歩をしてまで和睦したいか」を改めて判定する。
            if (this._checkAITruceConditionAcceptance(requestClanId, targetClanId, selectedOption)) {
                if (onSuccess) onSuccess(selectedOption.type, selectedOption);
            } else if (onFailure) {
                onFailure();
            }
            return;
        }

        const senderBusho = conversation && conversation.senderBusho ? conversation.senderBusho : this.game.getClanDaimyo(requestClanId);
        const receiverDaimyo = conversation && conversation.receiverDaimyo ? conversation.receiverDaimyo : this.game.getClanDaimyo(targetClanId);
        const context = conversation && conversation.context ? conversation.context : null;
        const conditionText = this._getTruceConditionDemandText(selectedOption, context);
        const receiverFace = receiverDaimyo ? receiverDaimyo.faceIcon : 'unknown_face.webp';
        const receiverName = receiverDaimyo ? receiverDaimyo.fullName : tgtClan.name;
        const senderFace = senderBusho ? senderBusho.faceIcon : 'unknown_face.webp';
        const senderName = senderBusho ? senderBusho.fullName : reqClan.name;

        const acceptCondition = () => {
            const reply = this._styleDiplomacyTextForSpeaker(
                `「承知いたしました。その条件にて和睦を願います。約定は違えませぬ」`,
                context && context.senderSpeakerPosture ? context.senderSpeakerPosture.key : 'normal'
            );
            this.game.ui.showDialog(reply, false, () => {
                if (onSuccess) onSuccess(selectedOption.type, selectedOption);
            }, null, { leftFace: senderFace, leftName: senderName });
        };

        const rejectCondition = () => {
            const reply = this._styleDiplomacyTextForSpeaker(
                `「……その条件は受けられませぬ。残念ながら、此度の和睦は見送るほかありますまい」`,
                context && context.senderSpeakerPosture ? context.senderSpeakerPosture.key : 'normal'
            );
            this.game.ui.showDialog(reply, false, () => {
                if (onFailure) onFailure();
            }, null, { leftFace: senderFace, leftName: senderName });
        };

        this.game.ui.showDialog(conditionText, false, null, null, {
            leftFace: receiverFace,
            leftName: receiverName,
            choices: [
                { label: '条件を受ける', className: 'btn-primary', onClick: acceptCondition },
                { label: '断る', className: 'btn-secondary', onClick: rejectCondition }
            ]
        });
    }

}