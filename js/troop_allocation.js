/**
 * troop_allocation.js
 * 兵力・兵科の自動配分を一元管理する専門サービス。
 *
 * ルール:
 * - AI、プレイヤー編成、援軍などは同じ計算をこのサービスから利用する。
 * - 配分係数は config.js の GameConfig.War.TroopAllocation のみで定義する。
 * - 戦争状態（海戦かどうか等）は呼び出し側で判定し、ここには値だけ渡す。
 */
class TroopAllocationService {
    static autoDivideSoldiers({
        bushos,
        totalSoldiers,
        totalHorses = 0,
        totalGuns = 0,
        isSeaBattle = false,
        isPlayerUI = false
    }) {
        if (!bushos || bushos.length === 0) return [];

        // 現行仕様：AI側で武将が1人だけの場合は装備を割り当てず足軽にする。
        if (bushos.length === 1 && !isPlayerUI) {
            return [{ busho: bushos[0], soldiers: totalSoldiers, troopType: 'ashigaru' }];
        }

        const config = window.WarParams.TroopAllocation;
        const generalRatio = config.GeneralRatio;
        const equipmentMinimumRatio = config.EquipmentMinimumRatio;
        const maxTeppoUnitRatio = config.MaxTeppoUnitRatio;
        const equipmentAptitudeWeight = config.EquipmentAptitudeWeight;

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

        // 端数は総大将へ集約する。
        const totalRequested = assignments.reduce((sum, assignment) => sum + assignment.req, 0);
        assignments[0].req += totalSoldiers - totalRequested;
        assignments[0].soldiers = assignments[0].req;

        let pooledSoldiers = 0;
        const maxTeppoCount = Math.floor(count * maxTeppoUnitRatio);
        let teppoCount = 0;

        // 装備は統率+武勇を主軸にしつつ、対応兵科の適性を軽く加点して優先する。
        // 適性だけで低能力武将が最優先にならないよう、加点幅は GameConfig 側で控えめに管理する。
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
        let lastChangedAssignment = null;

        const assignEquipment = (assignment, troopType, requested) => {
            const available = troopType === 'kiba' ? availableHorses : availableGuns;
            assignment.troopType = troopType;
            const assignCount = Math.min(requested, available);
            assignment.soldiers = assignCount;
            if (troopType === 'kiba') availableHorses -= assignCount;
            else {
                availableGuns -= assignCount;
                teppoCount++;
            }
            pooledSoldiers += requested - assignCount;
            lastChangedAssignment = assignment;
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
                // 両方使える時だけ適性の高い方を選ぶ。同値なら従来どおり騎馬を優先する。
                const preferredType = assignment.teppoAptitude > assignment.kibaAptitude ? 'teppo' : 'kiba';
                assignEquipment(assignment, preferredType, requested);
            } else if (canUseKiba) {
                assignEquipment(assignment, 'kiba', requested);
            } else if (canUseTeppo) {
                assignEquipment(assignment, 'teppo', requested);
            }
        }

        let ashigaruAssignments = assignments.filter(a => a.troopType === 'ashigaru');

        // AI側では余剰兵を受け取る足軽部隊を最低1部隊残す。
        // プレイヤー編成では兵科を崩さず総大将へ余剰兵を戻す。
        if (pooledSoldiers > 0 && ashigaruAssignments.length === 0 && lastChangedAssignment) {
            if (isPlayerUI) {
                assignments[0].soldiers += pooledSoldiers;
                pooledSoldiers = 0;
            } else {
                lastChangedAssignment.troopType = 'ashigaru';
                pooledSoldiers -= lastChangedAssignment.req - lastChangedAssignment.soldiers;
                lastChangedAssignment.soldiers = lastChangedAssignment.req;
                ashigaruAssignments.push(lastChangedAssignment);
            }
        }

        if (pooledSoldiers > 0 && ashigaruAssignments.length > 0) {
            const share = Math.floor(pooledSoldiers / ashigaruAssignments.length);
            const remainder = pooledSoldiers % ashigaruAssignments.length;

            ashigaruAssignments.forEach((assignment, index) => {
                assignment.soldiers += share;
                if (index < remainder) assignment.soldiers += 1;
            });
        }

        return assignments.map(assignment => ({
            busho: assignment.busho,
            soldiers: assignment.soldiers,
            troopType: assignment.troopType
        }));
    }
}

window.TroopAllocationService = TroopAllocationService;
