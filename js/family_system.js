/**
 * family_system.js
 * 親子・養子・婚姻などの正本データから、一門判定用の派生キャッシュを再構築する専門部署。
 * baseFamilyIds / familyIds は入力データではなく、必ずここで作り直す。
 */
class FamilyLinker {
    static rebuildAllFamilyIds(bushos, princesses = []) {
        const safeBushos = Array.isArray(bushos) ? bushos : [];
        const safePrincesses = Array.isArray(princesses) ? princesses : [];
        const allPeople = [...safeBushos, ...safePrincesses];
        const allPeopleMap = new Map();

        // 派生値は前回値を一切引き継がない。関係解除・養子先変更でも古い一門が残らないよう、毎回ゼロから作る。
        allPeople.forEach(person => {
            const id = Number(person && person.id) || 0;
            if (id <= 0) return;
            allPeopleMap.set(id, person);
            person.baseFamilyIds = [id];
            person.familyIds = [id];
        });

        this._rebuildBaseFamilies(allPeople, allPeopleMap);
        const familyContext = this._buildFamilyContext(safeBushos, safePrincesses, allPeople);

        // 姫→武将の順序は従来と同じ。個人familyIdsはbaseFamilyIdsだけを参照するため、相互依存は作らない。
        safePrincesses.forEach(person => {
            person.familyIds = this._buildPersonalFamilyIds(person, allPeopleMap, familyContext, false);
        });
        safeBushos.forEach(person => {
            person.familyIds = this._buildPersonalFamilyIds(person, allPeopleMap, familyContext, true);
        });
    }

    static _rebuildBaseFamilies(allPeople, allPeopleMap) {
        // 実父・養父で結ばれた男系/養家の一門は「連結成分」なので、反復伝播ではなくUnion-Findで一度に求める。
        const parent = new Map();
        const rank = new Map();
        allPeopleMap.forEach((_person, id) => {
            parent.set(id, id);
            rank.set(id, 0);
        });

        const find = id => {
            let root = parent.get(id);
            if (root === undefined) return 0;
            while (root !== parent.get(root)) root = parent.get(root);
            let current = id;
            while (current !== root) {
                const next = parent.get(current);
                parent.set(current, root);
                current = next;
            }
            return root;
        };

        const unite = (a, b) => {
            if (!parent.has(a) || !parent.has(b)) return;
            let rootA = find(a);
            let rootB = find(b);
            if (!rootA || !rootB || rootA === rootB) return;
            const rankA = rank.get(rootA) || 0;
            const rankB = rank.get(rootB) || 0;
            if (rankA < rankB) [rootA, rootB] = [rootB, rootA];
            parent.set(rootB, rootA);
            if (rankA === rankB) rank.set(rootA, rankA + 1);
        };

        allPeople.forEach(person => {
            const id = Number(person && person.id) || 0;
            if (!parent.has(id)) return;
            const realFatherId = Number(person.realFatherId) || 0;
            const adoptiveFatherId = Number(person.adoptiveFatherId) || 0;
            if (realFatherId > 0) unite(id, realFatherId);
            if (adoptiveFatherId > 0) unite(id, adoptiveFatherId);
        });

        // allPeopleの元順序を保つことで、派生配列の並びも毎回決定的にする。
        const componentMembers = new Map();
        allPeople.forEach(person => {
            const id = Number(person && person.id) || 0;
            if (!parent.has(id)) return;
            const root = find(id);
            if (!componentMembers.has(root)) componentMembers.set(root, []);
            componentMembers.get(root).push(id);
        });

        allPeople.forEach(person => {
            const id = Number(person && person.id) || 0;
            if (!parent.has(id)) return;
            const members = componentMembers.get(find(id)) || [id];
            // 従来どおり自分自身を先頭に置き、それ以外を安定順で続ける。
            person.baseFamilyIds = [id, ...members.filter(memberId => memberId !== id)];
        });
    }

    static _buildFamilyContext(bushos, princesses, allPeople) {
        const childrenByMotherId = new Map();
        allPeople.forEach((person, index) => {
            const motherId = Number(person && person.realMotherId) || 0;
            if (motherId <= 0) return;
            if (!childrenByMotherId.has(motherId)) childrenByMotherId.set(motherId, []);
            childrenByMotherId.get(motherId).push({ id: Number(person.id), index });
        });

        // 武将から見た「娘・養女・実姉妹に当たる既婚姫の夫」を姫CSVの順序で記録する。
        const bushosByRealFatherId = new Map();
        bushos.forEach(busho => {
            const fatherId = Number(busho && busho.realFatherId) || 0;
            if (fatherId <= 0) return;
            if (!bushosByRealFatherId.has(fatherId)) bushosByRealFatherId.set(fatherId, []);
            bushosByRealFatherId.get(fatherId).push(busho);
        });

        const marriageHusbandsByBushoId = new Map();
        const pushHusband = (bushoId, husbandId) => {
            bushoId = Number(bushoId) || 0;
            husbandId = Number(husbandId) || 0;
            if (bushoId <= 0 || husbandId <= 0) return;
            if (!marriageHusbandsByBushoId.has(bushoId)) marriageHusbandsByBushoId.set(bushoId, []);
            const list = marriageHusbandsByBushoId.get(bushoId);
            if (!list.includes(husbandId)) list.push(husbandId);
        };

        princesses.forEach(princess => {
            if (!princess || princess.status !== 'married' || !(Number(princess.husbandId) > 0)) return;
            const targets = new Set();
            const realFatherId = Number(princess.realFatherId) || 0;
            const adoptiveFatherId = Number(princess.adoptiveFatherId) || 0;
            if (realFatherId > 0) targets.add(realFatherId);
            if (adoptiveFatherId > 0) targets.add(adoptiveFatherId);
            if (realFatherId > 0) {
                const siblings = bushosByRealFatherId.get(realFatherId) || [];
                siblings.forEach(busho => {
                    if (Number(busho.id) !== Number(princess.id)) targets.add(Number(busho.id));
                });
            }
            targets.forEach(id => pushHusband(id, princess.husbandId));
        });

        return { childrenByMotherId, marriageHusbandsByBushoId };
    }

    static _buildPersonalFamilyIds(person, allPeopleMap, familyContext, isBusho) {
        const familyIds = [];
        const seen = new Set();
        const add = id => {
            id = Number(id) || 0;
            if (id <= 0 || seen.has(id)) return;
            seen.add(id);
            familyIds.push(id);
        };
        const addMany = ids => {
            if (!Array.isArray(ids)) return;
            ids.forEach(add);
        };

        addMany(person.baseFamilyIds);

        const realFatherId = Number(person.realFatherId) || 0;
        const realMotherId = Number(person.realMotherId) || 0;
        const adoptiveFatherId = Number(person.adoptiveFatherId) || 0;
        add(realFatherId);
        add(realMotherId);
        add(adoptiveFatherId);

        // 母方の男系/養家一門は本人のfamilyIdsへだけ一方通行で加える。
        if (realMotherId > 0) {
            const mother = allPeopleMap.get(realMotherId);
            if (mother) addMany(mother.baseFamilyIds);
        }

        if (isBusho) {
            const wifeIds = Array.isArray(person.wifeIds) ? person.wifeIds : [];
            wifeIds.forEach(wifeId => {
                const wife = allPeopleMap.get(Number(wifeId));
                if (wife) addMany(wife.baseFamilyIds);
            });

            const husbandIds = familyContext.marriageHusbandsByBushoId.get(Number(person.id)) || [];
            addMany(husbandIds);
        } else {
            const husbandId = Number(person.husbandId) || 0;
            if (husbandId > 0) {
                const husband = allPeopleMap.get(husbandId);
                if (husband) addMany(husband.baseFamilyIds);
            }
        }

        // 男系/養家一門の女性を母に持つ人物を、従来仕様どおり母系親族として追加する。
        const maternal = [];
        (person.baseFamilyIds || []).forEach(motherId => {
            const children = familyContext.childrenByMotherId.get(Number(motherId));
            if (children) maternal.push(...children);
        });
        maternal.sort((a, b) => a.index - b.index);
        maternal.forEach(entry => add(entry.id));

        return familyIds;
    }
}

window.FamilyLinker = FamilyLinker;
