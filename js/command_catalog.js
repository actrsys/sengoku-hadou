/**
 * command_catalog.js
 * コマンドのメニュー構造・実行条件・仕様表の正本。
 * CommandSystem / UI はここで定義された COMMAND_MENU_STRUCTURE / COMMAND_SPECS を参照します。
 */

/* ==========================================================================
   ★ メニューの階層構造（ボタンの並び順の設計図）
   ========================================================================== */
const COMMAND_MENU_STRUCTURE = [
    {
        label: "内政",
        items: ['farm', 'commerce', 'repair', 'charity']
    },
    {
        label: "軍事",
        items: ['war', 'draft', 'training', 'soldier_charity', 'move', 'transport']
    },
    {
        label: "対外",
        items: [
            { label: "外交", items: ['goodwill', 'truce', 'alliance', 'marriage', 'dominate', 'subordinate', 'vassalage', 'break_alliance'] },
            { label: "諸勢力", items: ['kunishu_goodwill', 'kunishu_incorporate', 'kunishu_subjugate'] },
            { label: "計略", items: ['sabotage', 'incite', 'rumor', 'headhunt', 'assassinate', 'kuko'] },
            { label: "朝廷", items: ['tribute', 'court_truce'] }
        ]
    },
    {
        label: "取引",
        items: ['buy_rice', 'sell_rice', 'buy_horses', 'buy_guns']
    },
    {
        label: "組織",
        items: [
            'employ',
            'interview',
            { label: "任命", items: ['appoint_gunshi', 'appoint'] },
            { label: "賞罰", items: ['reward', 'reward_all', 'banish'] },
            { label: "縁組", items: ['arrange_marriage', 'adopt_son'] },
            'succession'
        ]
    },
    {
        label: "国主",
        items: [
            'legion_council',
            {
                label: "国主任命",
                items: [1, 2, 3, 4, 5, 6, 7, 8].map(n => 'appoint_legion_leader_' + n)
            },
            {
                label: "国主解任",
                items: [1, 2, 3, 4, 5, 6, 7, 8].map(n => 'dismiss_legion_leader_' + n)
            },
            {
                label: "所領分配",
                items: [1, 2, 3, 4, 5, 6, 7, 8].map(n => 'allot_fief_' + n)
            }
        ]
    },
    {
        label: "情報",
        items: ['busho_list', 'princess_list', 'kyoten_list', 'faction_list', 'daimyo_list', 'kunishu_list']
    },
    {
        label: "システム",
        items: ['guide', 'history', 'settings', 'save', 'load', 'watch', 'title']
    }
];

/* ==========================================================================
   ★ よく使う実行条件まとめ（条件の一元化）
   ========================================================================== */
const CAN_EXECUTE_RULES = {
    // --- 人事用 ---
    hasActiveBushoExceptDaimyo: (game) => {
        return game.bushos.some(b => b.clan === game.playerClanId && window.BushoStatusRules.isActive(b) && !b.isDaimyo);
    },
    hasActiveBushoExceptDaimyoAndCastellan: (game) => {
        return game.bushos.some(b => b.clan === game.playerClanId && window.BushoStatusRules.isActive(b) && !b.isDaimyo && !b.isCastellan);
    },
    hasEmployableRonin: (game) => {
        return game.bushos.some(b => {
            if (!window.BushoStatusRules.isRonin(b) || b.belongKunishuId > 0) return false;
            const targetCastle = game.getCastle(b.castleId);
            return targetCastle && targetCastle.ownerClan === game.playerClanId;
        });
    },
    canManageLegion: (game, legionNumber) => {
        const myCastles = game.castles.filter(c => Number(c.ownerClan) === Number(game.playerClanId));
        if (myCastles.length <= 1) return false;
        if (game.legions) {
            const hasLegion = game.legions.some(l => Number(l.clanId) === Number(game.playerClanId) && Number(l.legionNo) === legionNumber && Number(l.commanderId) > 0);
            if (hasLegion) return false;
        }
        return legionNumber <= myCastles.length;
    },
    // 国主解任用の判定ルール（国主が存在する時だけ押せるようにします）
    canDismissLegion: (game, legionNumber) => {
        if (!game.legions) return false;
        const legion = game.legions.find(l => Number(l.clanId) === Number(game.playerClanId) && Number(l.legionNo) === legionNumber && Number(l.commanderId) > 0);
        return !!legion;
    },
    // 所領分配用の判定ルール（国主が存在する時だけ押せるようにします）
    canAllotFief: (game, legionNumber) => {
        const myCastles = game.castles.filter(c => Number(c.ownerClan) === Number(game.playerClanId));
        if (myCastles.length <= 1) return false;
        if (game.legions) {
            const hasLegion = game.legions.some(l => Number(l.clanId) === Number(game.playerClanId) && Number(l.legionNo) === legionNumber && Number(l.commanderId) > 0);
            return hasLegion;
        }
        return false;
    },
    hasSuccessor: (game) => {
        const daimyo = game.bushos.find(b => b.clan === game.playerClanId && b.isDaimyo);
        if (!daimyo) return false;
        const dFamily = Array.isArray(daimyo.familyIds) ? daimyo.familyIds : [];
        return game.bushos.some(b => {
            // active（登場済み）または unborn（元服前）を対象にする
            // 隠居状態（isRetired）は除外する
            if (b.clan !== game.playerClanId || b.isDaimyo || b.isRetired) return false;
            if (!window.BushoStatusRules.isActive(b) && !window.LifeStatusRules.isUnborn(b)) return false;
            
            // unborn の中でも「出生前」フラグが立っている場合は除外する
            if (window.LifeStatusRules.isUnborn(b) && b.isNotBorn) return false;

            const bFamily = Array.isArray(b.familyIds) ? b.familyIds : [];
            return bFamily.includes(daimyo.id) || dFamily.includes(b.id);
        });
    },
    canAdoptSon: (game) => {
        // 条件①：家督相続できる武将が「いない」こと
        if (CAN_EXECUTE_RULES.hasSuccessor(game)) return false;

        // 条件②：養子にできる武将（自勢力で活動中、大名ではなく、15歳以上若い）が1人以上いること
        const daimyo = game.bushos.find(b => b.clan === game.playerClanId && b.isDaimyo);
        if (!daimyo) return false;
        
        return game.bushos.some(b => {
            if (b.clan !== game.playerClanId || !window.BushoStatusRules.isActive(b) || b.isDaimyo) return false;
            return b.birthYear >= daimyo.birthYear + 15;
        });
    },
    // --- 軍事用 ---
    canTraining: (game, castle) => {
        const maxTraining = window.WarParams.Military.MaxTraining;
        if (castle.training >= maxTraining) return false;
        if (castle.soldiers <= 0) return false;
        return true;
    },
    canSoldierCharity: (game, castle) => {
        const maxMorale = window.WarParams.Military.MaxMoraleCharity;
        if (castle.morale >= maxMorale) return false;
        if (castle.soldiers <= 0) return false;
        return true;
    },
    // --- 外交・朝廷・諸勢力用 ---
    hasGold200: (game, castle) => {
        return castle.gold >= 200;
    },
    hasUnmarriedPrincess: (game) => {
        const myClan = game.clans.find(c => c.id === game.playerClanId);
        return myClan && myClan.princessIds && myClan.princessIds.some(pId => {
            const p = game.princesses.find(princess => princess.id === pId);
            return p && p.status === 'unmarried';
        });
    },
    isNotSubordinate: (game) => {
        let isSubordinate = false;
        game.clans.forEach(c => {
            if (c.id !== 0 && c.id !== Number(game.playerClanId) && !c.isDestroyed) {
                const rel = game.getRelation(game.playerClanId, c.id);
                if (rel && rel.status === window.GameConstants.DiplomacyStatus.SUBORDINATE) {
                    isSubordinate = true;
                }
            }
        });
        return !isSubordinate;
    },
    hasCourtTrust500: (game) => {
        const currentTrust = game.courtRankSystem ? game.courtRankSystem.getTrust(game.playerClanId) : 0;
        return currentTrust >= 500;
    },
    canSubordinate: (game, castle) => {
        const myClanId = game.playerClanId;
        // 条件①：未婚の一門の姫がいるか
        const myClan = game.clans.find(c => c.id === myClanId);
        const hasPrincess = myClan && myClan.princessIds && myClan.princessIds.some(pId => {
            const p = game.princesses.find(princess => princess.id === pId);
            return p && p.status === 'unmarried';
        });
        if (hasPrincess) return true;

        // 条件②：大名以外の一門武将がいるか
        const daimyo = game.bushos.find(b => b.clan === myClanId && b.isDaimyo);
        let hasKinsman = false;
        if (daimyo) {
            const dFamily = Array.isArray(daimyo.familyIds) ? daimyo.familyIds : [];
            hasKinsman = game.bushos.some(b => {
                if (b.clan !== myClanId || b.isDaimyo || !window.BushoStatusRules.isActive(b)) return false;
                const bFamily = Array.isArray(b.familyIds) ? b.familyIds : [];
                return bFamily.includes(daimyo.id) || dFamily.includes(b.id);
            });
        }
        if (hasKinsman) return true;

        // 条件③：城を２つ以上持っているか
        const myCastles = game.castles.filter(c => Number(c.ownerClan) === Number(myClanId));
        if (myCastles.length >= 2) return true;

        return false;
    },
    // --- 移動・輸送用 ---
    canMoveOrTransport: (game, castle) => {
        const province = game.provinces.find(p => p.id === castle.provinceId);
        if (province && province.statusEffects && province.statusEffects.includes('heavySnow')) {
            return false;
        }
        return true;
    },
    canTransport: (game, castle) => {
        if (!CAN_EXECUTE_RULES.canMoveOrTransport(game, castle)) return false;
        if (castle.soldiers <= 0 && castle.gold <= 0 && castle.rice <= 0 && (castle.horses || 0) <= 0 && (castle.guns || 0) <= 0) {
            return false;
        }
        return true;
    },
    // --- 軍事取引 ---
    canBuyRice: (game, castle) => {
        // ★一元化されたため、単価の事前計算は削除し、シンプルに金1以上かつ取引枠があるかで判定します
        return castle.gold >= 1 && (castle.tradeLimit || 0) > 0;
    },
    canSellRice: (game, castle) => {
        return castle.rice >= 1 && (castle.tradeLimit || 0) > 0;
    },
    canBuyHorses: (game, castle) => {
        const daimyo = game.bushos.find(b => b.clan === castle.ownerClan && b.isDaimyo);
        const castellan = game.getBusho(castle.castellanId);
        const cost = EconomyRules.calcBuyHorseCost(1, daimyo, castellan, this.game);
        return castle.gold >= cost;
    },
    canBuyGuns: (game, castle) => {
        // ★追加：1542年以前は鉄砲伝来前なので買えません！
        if (game.year <= 1542) return false;
        
        const daimyo = game.bushos.find(b => b.clan === castle.ownerClan && b.isDaimyo);
        const castellan = game.getBusho(castle.castellanId);
        const cost = EconomyRules.calcBuyGunCost(1, daimyo, castellan, this.game);
        return castle.gold >= cost;
    },
    // --- 臣従願のルール追加 ---
    canVassalage: (game) => {
        // 条件①：生き残っている大名家が3つ以上あるかチェックします（自分を含めて2つ以下ならダメです）
        const aliveClans = game.clans.filter(c => c.id !== 0 && !c.isDestroyed);
        if (aliveClans.length <= 2) return false;
        
        // 条件②：お隣さんの大名家の中に、自家の「5倍以上」の威信を持つ大名家があるかチェックします
        const myClanId = game.playerClanId;
        const myClan = game.clans.find(c => c.id === myClanId);
        if (!myClan) return false;
        
        const myPrestige = myClan.daimyoPrestige;
        const myCastles = game.castles.filter(c => Number(c.ownerClan) === Number(myClanId));
        
        let hasValidTarget = false;
        for (let mc of myCastles) {
            if (mc.adjacentCastleIds) {
                for (let adjId of mc.adjacentCastleIds) {
                    const adjC = game.getCastle(adjId);
                    if (adjC && adjC.ownerClan !== 0 && adjC.ownerClan !== myClanId) {
                        const targetClan = game.clans.find(c => c.id === adjC.ownerClan);
                        if (targetClan && targetClan.daimyoPrestige >= myPrestige * 5) {
                            hasValidTarget = true;
                            break;
                        }
                    }
                }
            }
            if (hasValidTarget) break;
        }
        
        return hasValidTarget;
    },
    // --- 情報用 ---
    hasFaction: (game) => {
        // 自勢力の武将の中に、派閥（factionIdが1以上）に所属している人がいるかチェックします
        return game.bushos.some(b => b.clan === game.playerClanId && b.factionId > 0);
    }
};

/* ==========================================================================
   ★ コマンド定義 (COMMAND_SPECS)
   ========================================================================== */
const COMMAND_SPECS = {
    // --- 内政 (DEVELOP) ---
    'farm': { 
        label: "石高開発", category: 'DEVELOP', 
        get costGold() { return window.MainParams.CommandCost.Farm; }, costRice: 0, 
        isMulti: true, hasAdvice: false, 
        startMode: 'busho_select', sortKey: 'politics',
        get msg() { return `金: ${window.MainParams.CommandCost.Farm} (1回あたり)`; },
        canExecute: (game, castle) => castle.kokudaka < castle.maxKokudaka
    },
    'commerce': { 
        label: "鉱山開発", category: 'DEVELOP', 
        get costGold() { return window.MainParams.CommandCost.Commerce; }, costRice: 0, 
        isMulti: true, hasAdvice: false, 
        startMode: 'busho_select', sortKey: 'politics',
        get msg() { return `金: ${window.MainParams.CommandCost.Commerce} (1回あたり)`; },
        canExecute: (game, castle) => castle.commerce < castle.maxCommerce
    },
    'repair': { 
        label: "城壁修復", category: 'DEVELOP', 
        get costGold() { return window.MainParams.CommandCost.Repair; }, costRice: 0, 
        isMulti: true, hasAdvice: false, 
        startMode: 'busho_select', sortKey: 'politics',
        get msg() { return `金: ${window.MainParams.CommandCost.Repair} (1回あたり)`; },
        canExecute: (game, castle) => castle.defense < castle.maxDefense
    },
    'charity': { 
        label: "民施し", category: 'DEVELOP', 
        costGold: 0, get costRice() { return window.MainParams.CommandCost.Charity; }, 
        isMulti: true, hasAdvice: false, 
        startMode: 'busho_select', sortKey: 'charm',
        get msg() { return `米: ${window.MainParams.CommandCost.Charity} (1回あたり)`; },
        canExecute: (game, castle) => castle.peoplesLoyalty < castle.maxPeoplesLoyalty
    },
    
    // --- 軍事取引 (MIL_TRADE) ---
    'buy_rice': {
        label: "兵糧購入", category: 'MIL_TRADE',
        costGold: 0, costRice: 0,
        isMulti: false, hasAdvice: false,
        startMode: 'quantity_select',
        msg: "金を払い兵糧を買います",
        canExecute: (game, castle) => CAN_EXECUTE_RULES.canBuyRice(game, castle)
    },
    'sell_rice': {
        label: "兵糧売却", category: 'MIL_TRADE',
        costGold: 0, costRice: 0,
        isMulti: false, hasAdvice: false,
        startMode: 'quantity_select',
        msg: "兵糧を売り金を得ます",
        canExecute: (game, castle) => CAN_EXECUTE_RULES.canSellRice(game, castle)
    },
    'buy_horses': {
        label: "軍馬購入", category: 'MIL_TRADE',
        costGold: 0, costRice: 0,
        isMulti: false, hasAdvice: false,
        startMode: 'quantity_select',
        msg: "金を払い軍馬を買います",
        canExecute: (game, castle) => CAN_EXECUTE_RULES.canBuyHorses(game, castle)
    },
    'buy_guns': {
        label: "鉄砲購入", category: 'MIL_TRADE',
        costGold: 0, costRice: 0,
        isMulti: false, hasAdvice: false,
        startMode: 'quantity_select',
        msg: "金を払い鉄砲を買います",
        canExecute: (game, castle) => CAN_EXECUTE_RULES.canBuyGuns(game, castle)
    },

    // --- 軍事 (MILITARY) ---
    'war': { 
        label: "出陣", category: 'MILITARY', 
        costGold: 0, costRice: 0, 
        isMulti: true, hasAdvice: false, 
        startMode: 'map_select', targetType: 'enemy_valid', 
        sortKey: 'strength'
    },
    'draft': { 
        label: "徴兵", category: 'MILITARY', 
        costGold: 0, costRice: 0, 
        isMulti: false, hasAdvice: false, 
        startMode: 'busho_select', sortKey: 'leadership',
        msg: "徴兵する兵士数を指定します" 
    },
    'training': { 
        label: "訓練", category: 'MILITARY', 
        costGold: 0, costRice: 0, 
        isMulti: true, hasAdvice: false, 
        startMode: 'busho_select', sortKey: 'leadership',
        msg: "兵士の訓練度を上げます",
        canExecute: (game, castle) => CAN_EXECUTE_RULES.canTraining(game, castle)
    },
    'soldier_charity': { 
        label: "兵施し", category: 'MILITARY', 
        costGold: 0, get costRice() { return window.MainParams.CommandCost.SoldierCharity; }, 
        isMulti: true, hasAdvice: false, 
        startMode: 'busho_select', sortKey: 'leadership',
        get msg() { return `米: ${window.MainParams.CommandCost.SoldierCharity} (1回あたり)\n兵士の士気を上げます`; },
        canExecute: (game, castle) => CAN_EXECUTE_RULES.canSoldierCharity(game, castle)
    },
    'transport': { 
        label: "輸送", category: 'MILITARY', 
        costGold: 0, costRice: 0, 
        isMulti: true, hasAdvice: false, 
        startMode: 'map_select', targetType: 'ally_other',
        sortKey: 'strength',
        canExecute: (game, castle) => CAN_EXECUTE_RULES.canTransport(game, castle)
    },
    'kunishu_subjugate': { 
        label: "諸勢力鎮圧", category: 'MILITARY', 
        costGold: 0, costRice: 0, 
        isMulti: true, hasAdvice: true, 
        startMode: 'map_select', targetType: 'kunishu_subjugate_valid',
        sortKey: 'strength'
    },

    // --- 人事 (PERSONNEL) ---
    'reward': { 
        label: "褒美", category: 'PERSONNEL', 
        get costGold() { return window.MainParams.CommandCost.Reward; }, costRice: 0, 
        isMulti: true, hasAdvice: false, 
        startMode: 'busho_select', sortKey: 'loyalty',
        get msg() { return `金: ${window.MainParams.CommandCost.Reward} (1人あたり)\n褒美を与えます`; },
        canExecute: (game, castle) => CAN_EXECUTE_RULES.hasActiveBushoExceptDaimyo(game)
    },
    'reward_all': { 
        label: "一括褒美", category: 'PERSONNEL', 
        get costGold() { return window.MainParams.CommandCost.RewardAll; }, costRice: 0, 
        isSystem: true, action: 'reward_all',
        canExecute: (game, castle) => CAN_EXECUTE_RULES.hasActiveBushoExceptDaimyo(game) && castle.gold >= window.MainParams.CommandCost.RewardAll
    },
    'interview': {
        label: "面談", category: 'PERSONNEL', 
        costGold: 0, costRice: 0, 
        isMulti: false, hasAdvice: false, 
        startMode: 'interview',
        msg: "武将と面談します",
        canExecute: (game, castle) => CAN_EXECUTE_RULES.hasActiveBushoExceptDaimyo(game)
    },
    'arrange_marriage': { 
        label: "婚姻", category: 'PERSONNEL', 
        costGold: 0, costRice: 0, 
        isMulti: false, hasAdvice: false, 
        startMode: 'busho_select_special', subType: 'arrange_marriage_busho',
        sortKey: 'leadership',
        msg: "姫を嫁がせる武将を選択してください",
        canExecute: (game, castle) => CAN_EXECUTE_RULES.hasUnmarriedPrincess(game) && game.bushos.some(b => b.clan === game.playerClanId && window.BushoStatusRules.isActive(b) && !b.isDaimyo && !b.female)
    },
    'employ': {
        label: "登用", category: 'PERSONNEL', 
        costGold: 0, costRice: 0, 
        isMulti: false, hasAdvice: true, 
        startMode: 'busho_select_special', subType: 'employ_target',
        sortKey: 'strength',
        msg: "在野武将を登用します",
        canExecute: (game, castle) => CAN_EXECUTE_RULES.hasEmployableRonin(game)
    },
    'move': { 
        label: "移動", category: 'PERSONNEL', 
        costGold: 0, costRice: 0, 
        isMulti: true, hasAdvice: false, 
        startMode: 'map_select', targetType: 'ally_other',
        sortKey: 'strength',
        canExecute: (game, castle) => CAN_EXECUTE_RULES.canMoveOrTransport(game, castle)
    },
    'banish': {
        label: "追放", category: 'PERSONNEL',
        costGold: 0, costRice: 0, 
        isMulti: false, hasAdvice: false, 
        startMode: 'busho_select', sortKey: 'loyalty',
        msg: "武将を追放します",
        canExecute: (game, castle) => CAN_EXECUTE_RULES.hasActiveBushoExceptDaimyo(game)
    },
    'succession': { 
        label: "家督相続", category: 'PERSONNEL', 
        costGold: 0, costRice: 0, 
        isMulti: false, hasAdvice: false, 
        startMode: 'busho_select_special', subType: 'succession_target',
        sortKey: 'leadership',
        msg: "家督を譲る一門武将を選択します",
        canExecute: (game, castle) => CAN_EXECUTE_RULES.hasSuccessor(game)
    },
    'adopt_son': { 
        label: "養子", category: 'PERSONNEL', 
        costGold: 0, costRice: 0, 
        isMulti: false, hasAdvice: false, 
        startMode: 'busho_select_special', subType: 'adopt_son_target',
        sortKey: 'leadership',
        msg: "養子にする武将を選択します",
        canExecute: (game, castle) => CAN_EXECUTE_RULES.canAdoptSon(game)
    },
    
    // --- 軍団 (LEGION) ---
    'appoint_gunshi': { 
        label: "軍師任命", category: 'LEGION', 
        costGold: 0, costRice: 0, 
        isMulti: false, hasAdvice: false, 
        startMode: 'busho_select', sortKey: 'intelligence',
        msg: "軍師を任命します",
        canExecute: (game, castle) => CAN_EXECUTE_RULES.hasActiveBushoExceptDaimyoAndCastellan(game)
    },
    'appoint': { 
        label: "城主任命", category: 'LEGION', 
        costGold: 0, costRice: 0, 
        isMulti: false, hasAdvice: false, 
        startMode: 'busho_select', sortKey: 'leadership',
        msg: "城主を任命します",
        canExecute: (game, castle) => {
            const daimyo = game.bushos.find(b => b.clan === game.playerClanId && b.isDaimyo);
            if (daimyo && Number(daimyo.castleId) === Number(castle.id)) return false;
            
            // ★追加：国主の居城の城主も、勝手に変えられないようにします
            const castellan = game.getBusho(castle.castellanId);
            if (castellan && castellan.isCommander) return false;

            return true;
        }
    },

    // --- 対外：調略 (FOREIGN_STRATEGY) ---
    'sabotage': { 
        label: "破壊工作", category: 'FOREIGN_STRATEGY', 
        costGold: 0, costRice: 0, 
        isMulti: false, hasAdvice: true, 
        startMode: 'map_select',  targetType: 'enemy_all',
        sortKey: 'intelligence' 
    },
    'incite': { 
        label: "民心撹乱", category: 'FOREIGN_STRATEGY', 
        costGold: 0, costRice: 0, 
        isMulti: false, hasAdvice: true, 
        startMode: 'map_select', targetType: 'enemy_all',
        sortKey: 'intelligence' 
    },
    'rumor': { 
        label: "離間計", category: 'FOREIGN_STRATEGY', 
        costGold: 0, costRice: 0, 
        isMulti: false, hasAdvice: true, 
        startMode: 'map_select', targetType: 'enemy_all',
        sortKey: 'intelligence' 
    },
    'headhunt': { 
        label: "武将引抜", category: 'FOREIGN_STRATEGY', 
        costGold: 0, costRice: 0,
        isMulti: false, hasAdvice: true, 
        startMode: 'map_select', targetType: 'enemy_all',
        sortKey: 'intelligence'
    },
    'assassinate': { 
        label: "暗殺", category: 'FOREIGN_STRATEGY', 
        costGold: 0, costRice: 0, 
        isMulti: false, hasAdvice: true, 
        startMode: 'map_select', targetType: 'enemy_all',
        sortKey: 'intelligence' 
    },
    'kuko': {
        label: "駆虎呑狼", category: 'FOREIGN_STRATEGY', 
        costGold: 0, costRice: 0, 
        isMulti: false, hasAdvice: true, 
        startMode: 'map_select', targetType: 'other_clan_all',
        sortKey: 'intelligence' 
    },

    // --- 情報 (INFO) ---
    'busho_list': {
        label: "武将", category: 'INFO',
        isSystem: true, action: 'busho_list'
    },
    'faction_list': {
        label: "派閥", category: 'INFO',
        isSystem: true, action: 'faction_list',
        canExecute: (game, castle) => CAN_EXECUTE_RULES.hasFaction(game)
    },
    'princess_list': {
        label: "姫", category: 'INFO',
        isSystem: true, action: 'princess_list'
    },
    'kyoten_list': {
        label: "拠点", category: 'INFO',
        isSystem: true, action: 'kyoten_list'
    },
    'daimyo_list': {
        label: "勢力", category: 'INFO',
        isSystem: true, action: 'daimyo_list'
    },
    'kunishu_list': {
        label: "諸勢力", category: 'INFO',
        isSystem: true, action: 'kunishu_list'
    },

    // --- 対外：外交 (FOREIGN_DAIMYO) ---
    'goodwill': {
        label: "親善", category: 'FOREIGN_DAIMYO',
        costGold: 0, costRice: 0,
        isMulti: false, hasAdvice: true,
        startMode: 'map_select', targetType: 'other_clan_all',
        canExecute: (game, castle) => CAN_EXECUTE_RULES.hasGold200(game, castle)
    },
    'alliance': {
        label: "同盟", category: 'FOREIGN_DAIMYO',
        costGold: 0, costRice: 0,
        isMulti: false, hasAdvice: true,
        startMode: 'map_select', targetType: 'other_clan_all'
    },
    'marriage': {
        label: "婚姻", category: 'FOREIGN_DAIMYO',
        costGold: 0, costRice: 0,
        isMulti: false, hasAdvice: true,
        startMode: 'map_select', targetType: 'marriage_valid',
        canExecute: (game, castle) => CAN_EXECUTE_RULES.hasUnmarriedPrincess(game)
    },
    'truce': {
        label: "和睦", category: 'FOREIGN_DAIMYO',
        costGold: 0, costRice: 0,
        isMulti: false, hasAdvice: true,
        startMode: 'map_select', targetType: 'hostile_clan_only'
    },
    'dominate': {
        label: "降伏勧告", category: 'FOREIGN_DAIMYO',
        costGold: 0, costRice: 0,
        isMulti: false, hasAdvice: true,
        startMode: 'map_select', targetType: 'other_clan_all',
        canExecute: (game, castle) => CAN_EXECUTE_RULES.isNotSubordinate(game)
    },
    'subordinate': {
        label: "従属願", category: 'FOREIGN_DAIMYO',
        costGold: 0, costRice: 0,
        isMulti: false, hasAdvice: true,
        startMode: 'map_select', targetType: 'other_clan_all',
        canExecute: (game, castle) => CAN_EXECUTE_RULES.canSubordinate(game, castle)
    },
    'vassalage': {
        label: "臣従願", category: 'FOREIGN_DAIMYO',
        costGold: 0, costRice: 0,
        isMulti: false, hasAdvice: false,
        startMode: 'map_select', targetType: 'other_clan_all',
        canExecute: (game, castle) => CAN_EXECUTE_RULES.canVassalage(game)
    },
    'break_alliance': {
        label: "断交", category: 'FOREIGN_DAIMYO',
        costGold: 0, costRice: 0,
        isMulti: false, hasAdvice: false,
        startMode: 'map_select', targetType: 'breakable_clan'
    },

    // --- 対外：諸勢力 (FOREIGN_KUNISHU) ---
    'kunishu_goodwill': {
        label: "諸勢力親善", category: 'FOREIGN_KUNISHU',
        costGold: 0, costRice: 0,
        isMulti: false, hasAdvice: true,
        startMode: 'map_select', targetType: 'kunishu_valid',
        canExecute: (game, castle) => CAN_EXECUTE_RULES.hasGold200(game, castle)
    },
    'kunishu_incorporate': {
        label: "諸勢力取込", category: 'FOREIGN_KUNISHU',
        costGold: 0, costRice: 0,
        isMulti: false, hasAdvice: true,
        startMode: 'map_select', targetType: 'kunishu_incorporate_valid'
    },

    // --- 朝廷 (DIPLOMACY_COURT) ---
    'tribute': {
        label: "貢物", category: 'DIPLOMACY_COURT',
        costGold: 0, costRice: 0,
        isMulti: false, hasAdvice: false,
        startMode: 'busho_select_special', subType: 'tribute_doer', sortKey: 'politics',
        msg: "朝廷に使者を送り、金を献上します",
        canExecute: (game, castle) => CAN_EXECUTE_RULES.hasGold200(game, castle)
    },
    'court_truce': {
        label: "朝廷和睦", category: 'DIPLOMACY_COURT',
        costGold: 2000, costRice: 0,
        isMulti: false, hasAdvice: true,
        startMode: 'map_select', targetType: 'hostile_clan_only',
        msg: "朝廷の威光により、敵対大名と和睦します",
        canExecute: (game, castle) => CAN_EXECUTE_RULES.hasCourtTrust500(game)
    },

    // --- 国主評定 ---
    'legion_council': {
        label: "評定", category: 'LEGION', isSystem: true, action: 'legion_council',
        canExecute: (game) => !!(game.legionPolicySystem && game.legionPolicySystem.canHoldCouncil(game.playerClanId))
    },

    // --- システム (SYSTEM) - UI生成用プレースホルダ ---
    'guide': { label: "指南書", category: 'SYSTEM', isSystem: true, action: 'guide' },
    'history': { label: "履歴", category: 'SYSTEM', isSystem: true, action: 'history' },
    'settings': { label: "設定", category: 'SYSTEM', isSystem: true, action: 'settings' },
    'save': { label: "セーブ", category: 'SYSTEM', isSystem: true, action: 'save' },
    'load': { 
        label: "ロード", category: 'SYSTEM', isSystem: true, action: 'load',
        canExecute: (game) => game.hasSaveData === true
    },
    'watch': { label: "観戦する", category: 'SYSTEM', isSystem: true, action: 'watch' },
    'title': { label: "タイトルへ", category: 'SYSTEM', isSystem: true, action: 'title' }
};

// ★ここから追加：軍団1～8のコマンド設定を自動で作る魔法
const numberNames = ["", "第一席", "第二席", "第三席", "第四席", "第五席", "第六席", "第七席", "第八席"];
[1, 2, 3, 4, 5, 6, 7, 8].forEach(n => {
    COMMAND_SPECS['appoint_legion_leader_' + n] = { label: numberNames[n], category: 'LEGION', isSystem: true, action: 'appoint_legion_leader_' + n, canExecute: (game, castle) => CAN_EXECUTE_RULES.canManageLegion(game, n) };
    COMMAND_SPECS['dismiss_legion_leader_' + n] = { label: numberNames[n], category: 'LEGION', isSystem: true, action: 'dismiss_legion_leader_' + n, canExecute: (game, castle) => CAN_EXECUTE_RULES.canDismissLegion(game, n) };
    COMMAND_SPECS['allot_fief_' + n] = { label: numberNames[n], category: 'LEGION', isSystem: true, action: 'allot_fief_' + n, canExecute: (game, castle) => CAN_EXECUTE_RULES.canAllotFief(game, n) };
});

