/**
 * legion_policy_system.js
 * 国主（軍団）への評定方針を一元管理する専門部署。
 *
 * 責務:
 * - 方針データの既定値・正規化・保存
 * - 月1回の評定開催権管理
 * - 国主AIが攻撃してよいかの判定
 *
 * UIの見た目やAIの作戦立案そのものは担当しない。
 */
class LegionPolicySystem {
    constructor(game) {
        this.game = game;
    }

    getDefaultPolicy() {
        // 既存挙動を維持するため、未設定の軍団は従来どおり自由裁量。
        return {
            allowOffense: true,
            allowNewHostility: true
        };
    }

    normalizePolicy(raw) {
        const base = this.getDefaultPolicy();
        if (!raw || typeof raw !== 'object') return base;
        return {
            allowOffense: raw.allowOffense !== false,
            allowNewHostility: raw.allowNewHostility !== false
        };
    }

    getLegion(clanId, legionNo) {
        clanId = Number(clanId);
        legionNo = Number(legionNo);
        if (!this.game.legions) return null;
        return this.game.legions.find(l =>
            Number(l.clanId) === clanId && Number(l.legionNo) === legionNo
        ) || null;
    }

    isActiveLegion(clanId, legionNo) {
        const legion = this.getLegion(clanId, legionNo);
        if (!legion || Number(legion.commanderId || 0) <= 0) return false;
        const commander = this.game.getBusho(legion.commanderId);
        return !!(
            commander &&
            window.BushoStatusRules.isActive(commander) &&
            Number(commander.clan) === Number(clanId)
        );
    }

    getPolicy(clanId, legionNo) {
        const legion = this.getLegion(clanId, legionNo);
        if (!legion) return this.getDefaultPolicy();
        const normalized = this.normalizePolicy(legion.policy);
        // 古いセーブでも、一度参照したら正規形に寄せる。
        legion.policy = normalized;
        return { ...normalized };
    }

    setPolicy(clanId, legionNo, policy) {
        const legion = this.getLegion(clanId, legionNo);
        if (!legion) return false;
        legion.policy = this.normalizePolicy(policy);
        return true;
    }

    getCouncilMembers(clanId) {
        clanId = Number(clanId);
        const members = [];
        for (let legionNo = 1; legionNo <= 8; legionNo++) {
            const legion = this.getLegion(clanId, legionNo);
            if (!legion || Number(legion.commanderId || 0) <= 0) continue;
            const commander = this.game.getBusho(legion.commanderId);
            if (!commander || !window.BushoStatusRules.isActive(commander) || Number(commander.clan) !== clanId) continue;
            members.push({
                legionNo,
                legion,
                commander,
                policy: this.getPolicy(clanId, legionNo)
            });
        }
        return members;
    }

    hasCouncilMembers(clanId) {
        return this.getCouncilMembers(clanId).length > 0;
    }

    _getCouncilTurns() {
        if (!this.game.flags) this.game.flags = {};
        if (!this.game.flags.legionCouncilLastTurnByClan || typeof this.game.flags.legionCouncilLastTurnByClan !== 'object') {
            this.game.flags.legionCouncilLastTurnByClan = {};
        }
        return this.game.flags.legionCouncilLastTurnByClan;
    }

    hasHeldCouncilThisMonth(clanId) {
        const turns = this._getCouncilTurns();
        return Number(turns[Number(clanId)] || 0) === Number(this.game.getCurrentTurnId());
    }

    canHoldCouncil(clanId) {
        clanId = Number(clanId);
        if (!clanId || clanId !== Number(this.game.playerClanId)) return false;
        if (!this.hasCouncilMembers(clanId)) return false;
        return !this.hasHeldCouncilThisMonth(clanId);
    }

    beginCouncil(clanId) {
        clanId = Number(clanId);
        if (!this.canHoldCouncil(clanId)) return false;
        this._getCouncilTurns()[clanId] = Number(this.game.getCurrentTurnId());
        return true;
    }

    commitPolicies(clanId, policiesByLegionNo) {
        clanId = Number(clanId);
        if (!policiesByLegionNo || typeof policiesByLegionNo !== 'object') return 0;

        let changed = 0;
        for (const [legionNoRaw, rawPolicy] of Object.entries(policiesByLegionNo)) {
            const legionNo = Number(legionNoRaw);
            if (legionNo < 1 || legionNo > 8 || !this.isActiveLegion(clanId, legionNo)) continue;

            const before = this.getPolicy(clanId, legionNo);
            const after = this.normalizePolicy(rawPolicy);
            if (before.allowOffense !== after.allowOffense || before.allowNewHostility !== after.allowNewHostility) {
                changed++;
            }
            this.setPolicy(clanId, legionNo, after);

            // 今月すでに立案済みの攻撃作戦が新方針に反する場合も即時整理する。
            if (this.game.aiOperationManager && typeof this.game.aiOperationManager.reconcileLegionPolicy === 'function') {
                this.game.aiOperationManager.reconcileLegionPolicy(clanId, legionNo);
            }
        }
        return changed;
    }

    isPolicyEnforcedForClan(clanId) {
        // 評定はプレイヤーが国主へ出した命令。観戦中やAI操作中は保存値を残したまま拘束だけ外す。
        // これにより観戦から同じ勢力へ戻った時は以前の命令を復元できる。
        return !this.game.isWatchMode && Number(clanId) === Number(this.game.playerClanId);
    }

    isOffenseAllowed(clanId, legionNo) {
        legionNo = Number(legionNo || 0);
        if (legionNo === 0 || !this.isPolicyEnforcedForClan(clanId)) return true;
        return this.getPolicy(clanId, legionNo).allowOffense;
    }

    isNewHostilityAllowed(clanId, legionNo) {
        legionNo = Number(legionNo || 0);
        if (legionNo === 0 || !this.isPolicyEnforcedForClan(clanId)) return true;
        return this.getPolicy(clanId, legionNo).allowNewHostility;
    }

    canAttackClan(clanId, legionNo, targetClanId) {
        clanId = Number(clanId);
        legionNo = Number(legionNo || 0);
        targetClanId = Number(targetClanId || 0);

        if (!this.isOffenseAllowed(clanId, legionNo)) return false;
        if (targetClanId === 0) return true; // 空き城への進出は新規交戦ではない。
        if (this.isNewHostilityAllowed(clanId, legionNo)) return true;

        const rel = this.game.getRelation(clanId, targetClanId);
        return !!(rel && window.DiplomacyRules.isHostile(rel.status));
    }

    canAttackTarget(clanId, legionNo, target) {
        if (!this.isOffenseAllowed(clanId, legionNo)) return false;
        if (!target) return false;
        // 諸勢力は「新規の大名家との交戦」ではないため、攻勢許可だけを見る。
        if (target.isKunishuTarget || target.isKunishu) return true;
        return this.canAttackClan(clanId, legionNo, target.ownerClan);
    }

    isOperationAllowed(clanId, legionNo, operation) {
        if (!operation || operation.type !== '攻撃') return true;
        // 歴史イベントが直接発生させた強制作戦は評定で上書きしない。
        if (operation.isEventOperation) return true;
        if (!this.isOffenseAllowed(clanId, legionNo)) return false;
        if (operation.isKunishuTarget) return true;

        const targetCastle = this.game.getCastle(operation.targetId);
        if (!targetCastle) return false;
        return this.canAttackClan(clanId, legionNo, targetCastle.ownerClan);
    }
}

window.LegionPolicySystem = LegionPolicySystem;
