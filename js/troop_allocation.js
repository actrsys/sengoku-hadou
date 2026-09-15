/**
 * troop_allocation.js
 * 兵力・兵科の自動配分と、1部隊/1軍の兵数上限を一元管理する専門サービス。
 *
 * ルール:
 * - AI、プレイヤー編成、援軍などは同じ計算をこのサービスから利用する。
 * - 1部隊の兵数上限は config.js の GameConfig.War.TroopAllocation.MaxSoldiersPerUnit だけで定義する。
 * - 「選択武将数×1部隊上限」の計算を各呼び出し側へ複製しない。
 * - 配分係数も config.js の GameConfig.War.TroopAllocation のみで定義する。
 * - 戦争状態（海戦かどうか等）は呼び出し側で判定し、ここには値だけ渡す。
 */
class TroopAllocationService {
    static _getConfig() {
        return window.WarParams.TroopAllocation;
    }

    static getMaxSoldiersPerUnit() {
        return Math.max(1, Math.floor(Number(this._getConfig().MaxSoldiersPerUnit) || 1));
    }

    static getUnitCount(bushosOrCount) {
        if (Array.isArray(bushosOrCount)) return bushosOrCount.length;
        return Math.max(0, Math.floor(Number(bushosOrCount) || 0));
    }

    // 選択した武将数で連れ出せる総兵数。城在庫等の availableSoldiers を渡せば同時にそこで頭打ちにする。
    static getArmySoldierCap(bushosOrCount, availableSoldiers = Number.POSITIVE_INFINITY) {
        const unitCount = this.getUnitCount(bushosOrCount);
        const byUnits = unitCount * this.getMaxSoldiersPerUnit();
        const available = Number(availableSoldiers);
        if (!Number.isFinite(available)) return byUnits;
        return Math.max(0, Math.min(byUnits, Math.floor(available)));
    }

    static clampArmySoldiers(requestedSoldiers, bushosOrCount, availableSoldiers = Number.POSITIVE_INFINITY) {
        const requested = Math.max(0, Math.floor(Number(requestedSoldiers) || 0));
        return Math.min(requested, this.getArmySoldierCap(bushosOrCount, availableSoldiers));
    }

    static getRequiredUnitCount(soldiers) {
        const count = Math.max(0, Math.floor(Number(soldiers) || 0));
        if (count <= 0) return 0;
        return Math.ceil(count / this.getMaxSoldiersPerUnit());
    }

    // 部隊分割UI等で使う「この1部隊が今取れる最大値」。総兵数・他部隊・装備在庫を同じ窓口で制限する。
    static getUnitSoldierCap({
        armySoldiers,
        otherAssignedSoldiers = 0,
        equipmentStock = Number.POSITIVE_INFINITY,
        equipmentUsedByOthers = 0
    }) {
        const armyRemaining = Math.max(0, Math.floor(Number(armySoldiers) || 0) - Math.max(0, Math.floor(Number(otherAssignedSoldiers) || 0)));
        let result = Math.min(this.getMaxSoldiersPerUnit(), armyRemaining);
        const stock = Number(equipmentStock);
        if (Number.isFinite(stock)) {
            const equipmentRemaining = Math.max(0, Math.floor(stock) - Math.max(0, Math.floor(Number(equipmentUsedByOthers) || 0)));
            result = Math.min(result, equipmentRemaining);
        }
        return Math.max(0, result);
    }

    static _capInitialRequests(assignments, totalSoldiers) {
        const maxPerUnit = this.getMaxSoldiersPerUnit();
        let overflow = 0;
        assignments.forEach(assignment => {
            if (assignment.req > maxPerUnit) {
                overflow += assignment.req - maxPerUnit;
                assignment.req = maxPerUnit;
                assignment.soldiers = maxPerUnit;
            }
        });

        // 総大将の1.3倍配分で溢れた分は、他部隊へ戻す。全軍上限を先に掛けているので必ず収まる。
        const refillOrder = assignments.length > 1
            ? assignments.slice(1).concat(assignments[0])
            : assignments;
        for (const assignment of refillOrder) {
            if (overflow <= 0) break;
            const spare = maxPerUnit - assignment.req;
            if (spare <= 0) continue;
            const add = Math.min(spare, overflow);
            assignment.req += add;
            assignment.soldiers = assignment.req;
            overflow -= add;
        }

        // 整数丸めによる不足を最後に埋める。
        let current = assignments.reduce((sum, assignment) => sum + assignment.req, 0);
        let missing = Math.max(0, totalSoldiers - current);
        for (const assignment of refillOrder) {
            if (missing <= 0) break;
            const spare = maxPerUnit - assignment.req;
            if (spare <= 0) continue;
            const add = Math.min(spare, missing);
            assignment.req += add;
            assignment.soldiers = assignment.req;
            missing -= add;
        }
    }

    static autoDivideSoldiers({
        bushos,
        totalSoldiers,
        totalHorses = 0,
        totalGuns = 0,
        isSeaBattle = false,
        isPlayerUI = false
    }) {
        if (!bushos || bushos.length === 0) return [];

        totalSoldiers = this.clampArmySoldiers(totalSoldiers, bushos);
        if (totalSoldiers <= 0) return [];

        // 現行仕様：AI側で武将が1人だけの場合は装備を割り当てず足軽にする。
        if (bushos.length === 1 && !isPlayerUI) {
            return [{ busho: bushos[0], soldiers: totalSoldiers, troopType: 'ashigaru' }];
        }

        const config = this._getConfig();
        const generalRatio = config.GeneralRatio;
        const equipmentMinimumRatio = config.EquipmentMinimumRatio;
        const maxTeppoUnitRatio = config.MaxTeppoUnitRatio;
        const equipmentAptitudeWeight = config.EquipmentAptitudeWeight;
        const maxPerUnit = this.getMaxSoldiersPerUnit();

        let availableHorses = isSeaBattle ? 0 : totalHorses;
        let availableGuns = totalGuns;

        const count = bushos.length;
        const ratioSum = generalRatio + (count - 1);
        const baseAmount = Math.floor(totalSoldiers / ratioSum);

        // まず全員を足軽として基準兵数へ分配する。
        const assignments = bushos.map((busho, index) => {
            const requested = index === 0
                ? Math.floor(baseAmount * generalRatio)
                : baseAmount;
            return {
                index,
                busho,
                req: requested,
                soldiers: requested,
                troopType: 'ashigaru',
                score: busho.leadership + busho.strength,
                kibaAptitude: SkillManager.getAptitudeLevel(busho.aptKiba),
                teppoAptitude: SkillManager.getAptitudeLevel(busho.aptTeppo)
            };
        });

        // 端数は総大将へ集約した後、1部隊上限から溢れた分だけ他部隊へ戻す。
        const totalRequested = assignments.reduce((sum, assignment) => sum + assignment.req, 0);
        assignments[0].req += totalSoldiers - totalRequested;
        assignments[0].soldiers = assignments[0].req;
        this._capInitialRequests(assignments, totalSoldiers);

        let pooledSoldiers = 0;
        const maxTeppoCount = Math.floor(count * maxTeppoUnitRatio);
        let teppoCount = 0;

        // 装備は統率+武勇を主軸にしつつ、対応兵科の適性を軽く加点して優先する。
        const getEquipmentPriority = (assignment) => {
            const bestAvailableAptitude = Math.max(
                availableHorses > 0 ? assignment.kibaAptitude : 0,
                availableGuns > 0 ? assignment.teppoAptitude : 0
            );
            return assignment.score + bestAvailableAptitude * equipmentAptitudeWeight;
        };
        const sortedAssignments = [...assignments].sort((a, b) => {
            const diff = getEquipmentPriority(b) - getEquipmentPriority(a);
            if (diff !== 0) return diff;
            return a.index - b.index;
        });
        const changedAssignments = [];

        const assignEquipment = (assignment, troopType, requested) => {
            const available = troopType === 'kiba' ? availableHorses : availableGuns;
            assignment.troopType = troopType;
            const assignCount = Math.min(requested, available, maxPerUnit);
            assignment.soldiers = assignCount;
            if (troopType === 'kiba') availableHorses -= assignCount;
            else {
                availableGuns -= assignCount;
                teppoCount++;
            }
            pooledSoldiers += requested - assignCount;
            changedAssignments.push(assignment);
        };

        for (const assignment of sortedAssignments) {
            const isGeneral = assignment.index === 0;
            const requested = assignment.req;
            const threshold = (isGeneral && !isPlayerUI)
                ? requested
                : requested * equipmentMinimumRatio;
            const canUseKiba = availableHorses >= threshold;
            const canUseTeppo = availableGuns >= threshold && teppoCount < maxTeppoCount;

            if (canUseKiba && canUseTeppo) {
                const preferredType = assignment.teppoAptitude > assignment.kibaAptitude ? 'teppo' : 'kiba';
                assignEquipment(assignment, preferredType, requested);
            } else if (canUseKiba) {
                assignEquipment(assignment, 'kiba', requested);
            } else if (canUseTeppo) {
                assignEquipment(assignment, 'teppo', requested);
            }
        }

        const fillPooledIntoAshigaru = () => {
            while (pooledSoldiers > 0) {
                const candidates = assignments.filter(a => a.troopType === 'ashigaru' && a.soldiers < maxPerUnit);
                if (candidates.length === 0) break;
                const share = Math.max(1, Math.floor(pooledSoldiers / candidates.length));
                let spent = 0;
                for (const assignment of candidates) {
                    if (pooledSoldiers <= 0) break;
                    const spare = maxPerUnit - assignment.soldiers;
                    const add = Math.min(spare, share, pooledSoldiers);
                    if (add <= 0) continue;
                    assignment.soldiers += add;
                    pooledSoldiers -= add;
                    spent += add;
                }
                if (spent <= 0) break;
            }
        };

        fillPooledIntoAshigaru();

        // 装備不足で兵が余り、足軽の空きもない場合は、装備部隊を1つずつ足軽へ戻して受け皿を作る。
        for (let i = changedAssignments.length - 1; pooledSoldiers > 0 && i >= 0; i--) {
            const assignment = changedAssignments[i];
            if (assignment.troopType === 'ashigaru') continue;
            assignment.troopType = 'ashigaru';
            fillPooledIntoAshigaru();
        }

        // 最後の安全網。上限内でまだ不足があれば足軽化して埋め、1部隊上限は絶対に超えない。
        let assignedTotal = assignments.reduce((sum, assignment) => sum + assignment.soldiers, 0);
        let missing = totalSoldiers - assignedTotal;
        if (missing > 0) {
            for (const assignment of assignments) {
                if (missing <= 0) break;
                const spare = maxPerUnit - assignment.soldiers;
                if (spare <= 0) continue;
                if (assignment.troopType !== 'ashigaru') assignment.troopType = 'ashigaru';
                const add = Math.min(spare, missing);
                assignment.soldiers += add;
                missing -= add;
            }
        }

        return assignments.map(assignment => ({
            busho: assignment.busho,
            soldiers: Math.min(maxPerUnit, assignment.soldiers),
            troopType: assignment.troopType
        }));
    }
}

window.TroopAllocationService = TroopAllocationService;
