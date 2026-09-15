/**
 * map_graph.js
 * 城同士の隣接関係・接続探索を一元管理する地図グラフ専門サービス。
 *
 * CSVで片側にだけ隣接IDが記載されている場合も、ゲーム内の従来仕様どおり
 * 双方向の道として扱う。隣接索引は城配列が差し替わるまで再利用する。
 */
class MapGraphService {
    constructor(game) {
        this.game = game;
        this._source = null;
        this._size = -1;
        this._adjacencyMap = null;
    }

    static isAdjacent(castleA, castleB) {
        if (!castleA || !castleB) return false;
        const aToB = Array.isArray(castleA.adjacentCastleIds) && castleA.adjacentCastleIds.includes(castleB.id);
        const bToA = Array.isArray(castleB.adjacentCastleIds) && castleB.adjacentCastleIds.includes(castleA.id);
        return aToB || bToA;
    }

    /**
     * static探索からもインスタンス側と同じ双方向隣接規則を使う。
     * 通常はGameが共有するMapGraphServiceの索引を利用し、軽量な単体利用時だけ直接補完する。
     */
    static getAdjacentIds(game, castle) {
        if (!game || !castle) return [];
        if (game.mapGraph && typeof game.mapGraph.getAdjacentIds === 'function') {
            return game.mapGraph.getAdjacentIds(castle);
        }

        const castleId = Number(castle.id);
        const ids = new Set(Array.isArray(castle.adjacentCastleIds) ? castle.adjacentCastleIds.map(Number) : []);
        if (Array.isArray(game.castles)) {
            for (const other of game.castles) {
                if (!other || Number(other.id) === castleId || !Array.isArray(other.adjacentCastleIds)) continue;
                if (other.adjacentCastleIds.some(id => Number(id) === castleId)) ids.add(Number(other.id));
            }
        }
        ids.delete(castleId);
        return Array.from(ids);
    }


    /**
     * 同盟・支配・従属領を通過して、目標城まで到達できるか判定する。
     */
    static isReachable(game, startCastle, targetCastle, movingClanId) {
        if (!game || !startCastle || !targetCastle) return false;
        if (this.isAdjacent(startCastle, targetCastle)) return true;

        const visited = new Set([Number(startCastle.id)]);
        const queue = [startCastle];
        let head = 0;
        const movingId = Number(movingClanId);
        const passableClanCache = new Map([[0, false]]);
        if (Number.isFinite(movingId)) passableClanCache.set(movingId, true);

        const canPassClan = (ownerClan) => {
            const ownerId = Number(ownerClan);
            if (ownerId === movingId) return true;
            if (ownerId === 0) return false;
            // 不正値は別々の生値を同一候補へ丸めないためキャッシュしない。
            if (Number.isFinite(ownerId) && passableClanCache.has(ownerId)) {
                return passableClanCache.get(ownerId);
            }
            const rel = game.getRelation(movingClanId, ownerClan);
            const passable = !!(rel && window.DiplomacyRules.canPassTerritory(rel.status));
            if (Number.isFinite(ownerId)) passableClanCache.set(ownerId, passable);
            return passable;
        };

        while (head < queue.length) {
            const current = queue[head++];
            const adjacentIds = this.getAdjacentIds(game, current);
            for (const adjId of adjacentIds) {
                const next = game.getCastle(adjId);
                if (!next) continue;
                if (Number(next.id) === Number(targetCastle.id)) return true;

                const nextId = Number(next.id);
                if (visited.has(nextId)) continue;

                if (canPassClan(next.ownerClan)) {
                    visited.add(nextId);
                    queue.push(next);
                }
            }
        }
        return false;
    }

    /**
     * 起点から自領（必要なら同一軍団）だけを辿り、内側と境界城を返す。
     */
    static getReachableTerritory(game, startCastle, isLegionOnly = false) {
        const myCastles = new Set();
        const enemyCastles = new Set();
        if (!game || !startCastle) return { myCastles: [], enemyCastles: [] };

        const clanId = startCastle.ownerClan;
        const legionId = startCastle.legionId;
        const queue = [startCastle];
        let head = 0;
        myCastles.add(startCastle.id);

        while (head < queue.length) {
            const current = queue[head++];
            const adjacentIds = this.getAdjacentIds(game, current);
            for (const adjId of adjacentIds) {
                const adjCastle = game.getCastle(adjId);
                if (!adjCastle) continue;
                const isMyTerritory = (adjCastle.ownerClan === clanId) &&
                    (!isLegionOnly || adjCastle.legionId === legionId || legionId === 0);
                if (isMyTerritory) {
                    if (!myCastles.has(adjId)) {
                        myCastles.add(adjId);
                        queue.push(adjCastle);
                    }
                } else {
                    enemyCastles.add(adjId);
                }
            }
        }

        return {
            myCastles: Array.from(myCastles).map(id => game.getCastle(id)),
            enemyCastles: Array.from(enemyCastles).map(id => game.getCastle(id))
        };
    }

    /**
     * 最短到達経路の最後の一歩が海路かを判定する。
     */
    static isSeaRoute(game, startCastle, targetCastle, movingClanId) {
        if (!game || !startCastle || !targetCastle) return false;
        if (startCastle.id === targetCastle.id) return false;

        const visited = new Set([startCastle.id]);
        const queue = [startCastle];
        let head = 0;
        const movingId = Number(movingClanId);
        const passableClanCache = new Map([[0, false]]);
        if (Number.isFinite(movingId)) passableClanCache.set(movingId, true);

        const canPassClan = (ownerClan) => {
            const ownerId = Number(ownerClan);
            if (ownerId === movingId) return true;
            if (ownerId === 0) return false;
            if (Number.isFinite(ownerId) && passableClanCache.has(ownerId)) {
                return passableClanCache.get(ownerId);
            }
            const rel = game.getRelation(movingClanId, ownerClan);
            const passable = !!(rel && window.DiplomacyRules.canPassTerritory(rel.status));
            if (Number.isFinite(ownerId)) passableClanCache.set(ownerId, passable);
            return passable;
        };

        while (head < queue.length) {
            const current = queue[head++];
            const adjacentIds = this.getAdjacentIds(game, current);
            for (const adjId of adjacentIds) {
                const next = game.getCastle(adjId);
                if (!next) continue;

                if (next.id === targetCastle.id) {
                    return !!((current.seaRouteIds && current.seaRouteIds.includes(next.id)) ||
                        (next.seaRouteIds && next.seaRouteIds.includes(current.id)));
                }

                if (visited.has(next.id)) continue;
                if (canPassClan(next.ownerClan)) {
                    visited.add(next.id);
                    queue.push(next);
                }
            }
        }
        return false;
    }

    invalidate() {
        this._source = null;
        this._size = -1;
        this._adjacencyMap = null;
    }

    _ensureIndex() {
        const castles = this.game.castles || [];
        if (this._source === castles && this._size === castles.length && this._adjacencyMap) return;

        const sets = new Map();
        for (const castle of castles) sets.set(Number(castle.id), new Set());

        for (const castle of castles) {
            const fromId = Number(castle.id);
            const adjacentIds = Array.isArray(castle.adjacentCastleIds) ? castle.adjacentCastleIds : [];
            for (const rawId of adjacentIds) {
                const toId = Number(rawId);
                if (!sets.has(toId) || toId === fromId) continue;
                sets.get(fromId).add(toId);
                sets.get(toId).add(fromId);
            }
        }

        this._adjacencyMap = new Map();
        sets.forEach((set, id) => this._adjacencyMap.set(id, Array.from(set)));
        this._source = castles;
        this._size = castles.length;
    }

    getAdjacentIds(castle) {
        if (!castle) return [];
        this._ensureIndex();
        return this._adjacencyMap.get(Number(castle.id)) || [];
    }

    getAdjacentCastles(castle) {
        const result = [];
        for (const id of this.getAdjacentIds(castle)) {
            const adjacent = this.game.getCastle(id);
            if (adjacent) result.push(adjacent);
        }
        return result;
    }

    getOwnedConnectedIds(startCastle, clanId) {
        const connected = new Set();
        if (!startCastle) return connected;

        const targetClanId = Number(clanId);
        const queue = [startCastle];
        let head = 0;
        connected.add(Number(startCastle.id));

        while (head < queue.length) {
            const current = queue[head++];
            for (const adjacentId of this.getAdjacentIds(current)) {
                const id = Number(adjacentId);
                if (connected.has(id)) continue;
                const adjacent = this.game.getCastle(id);
                if (!adjacent || Number(adjacent.ownerClan) !== targetClanId) continue;
                connected.add(id);
                queue.push(adjacent);
            }
        }

        return connected;
    }

    /**
     * 同盟・支配・従属勢力の領地を通過して到達できる「自勢力の城」だけを返す。
     * CommandSystemで使っていた移動・輸送用探索の現行仕様をそのまま集約する。
     */
    getConnectedOwnIdsForMove(startCastle, clanId) {
        const connectedOwn = new Set();
        if (!startCastle) return connectedOwn;

        const movingClanId = Number(clanId);
        const visited = new Set([Number(startCastle.id)]);
        const queue = [startCastle];
        let head = 0;
        const passableClanCache = new Map([[movingClanId, true], [0, false]]);

        const canPassClan = (ownerClan) => {
            const ownerId = Number(ownerClan);
            if (passableClanCache.has(ownerId)) return passableClanCache.get(ownerId);
            const relation = this.game.getRelation(clanId, ownerClan);
            const passable = !!(relation && window.DiplomacyRules.canPassTerritory(relation.status));
            passableClanCache.set(ownerId, passable);
            return passable;
        };

        while (head < queue.length) {
            const current = queue[head++];
            for (const adjacentId of this.getAdjacentIds(current)) {
                const id = Number(adjacentId);
                if (visited.has(id)) continue;
                const adjacent = this.game.getCastle(id);
                if (!adjacent || !canPassClan(adjacent.ownerClan)) continue;

                visited.add(id);
                queue.push(adjacent);
                if (Number(adjacent.ownerClan) === movingClanId) connectedOwn.add(id);
            }
        }

        connectedOwn.add(Number(startCastle.id));
        return connectedOwn;
    }
}

window.MapGraphService = MapGraphService;
