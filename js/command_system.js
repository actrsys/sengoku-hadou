/**
 * command_system.js
 * ゲーム内のコマンド実行ロジックおよびフロー制御を管理するクラス
 * 修正: 出陣時・諸勢力鎮圧時に、指定した「軍馬」と「鉄砲」を持参する処理を追加しました
 */

/* ==========================================================================
   ★ メニューの階層構造（ボタンの並び順の設計図）
   ========================================================================== */
const COMMAND_MENU_STRUCTURE = [
    {
        label: "内政",
        commands: ['farm', 'commerce', 'repair', 'charity']
    },
    {
        label: "軍事",
        commands: ['war', 'draft', 'training', 'soldier_charity', 'transport', 'kunishu_subjugate']
    },
    {
        label: "対外",
        // ★ここが「入れ子（サブメニュー）」になる部分です！
        subMenus: [
            { label: "外交", commands: ['goodwill', 'alliance', 'marriage', 'dominate', 'subordinate', 'vassalage', 'break_alliance'] },
            { label: "諸勢力", commands: ['kunishu_goodwill', 'kunishu_incorporate'] },
            { label: "調略", commands: ['sabotage', 'incite', 'rumor', 'headhunt'] },
            { label: "朝廷", commands: ['tribute', 'court_truce'] }
        ]
    },
    {
        label: "取引",
        commands: ['buy_rice', 'sell_rice', 'buy_horses', 'buy_guns']
    },
    {
        label: "人事",
        commands: ['reward', 'interview', 'employ', 'move', 'succession', 'banish']
    },
    {
        label: "軍団",
        commands: ['appoint_gunshi', 'appoint'],
        subMenus: [
            {
                label: "国主任命",
                commands: [1, 2, 3, 4, 5, 6, 7, 8].map(n => 'appoint_legion_leader_' + n)
            },
            {
                label: "国主解任",
                commands: [1, 2, 3, 4, 5, 6, 7, 8].map(n => 'dismiss_legion_leader_' + n)
            },
            {
                label: "所領分配",
                commands: [1, 2, 3, 4, 5, 6, 7, 8].map(n => 'allot_fief_' + n)
            }
        ]
    },
    {
        label: "情報",
        commands: ['busho_list', 'princess_list', 'kyoten_list', 'faction_list', 'daimyo_list', 'kunishu_list']
    },
    {
        label: "システム",
        commands: ['history', 'settings', 'save', 'load', 'title']
    }
];

/* ==========================================================================
   ★ よく使う実行条件まとめ（条件の一元化）
   ========================================================================== */
const CAN_EXECUTE_RULES = {
    // --- 人事用 ---
    hasActiveBushoExceptDaimyo: (game) => {
        return game.bushos.some(b => b.clan === game.playerClanId && b.status === 'active' && !b.isDaimyo);
    },
    hasActiveBushoExceptDaimyoAndCastellan: (game) => {
        return game.bushos.some(b => b.clan === game.playerClanId && b.status === 'active' && !b.isDaimyo && !b.isCastellan);
    },
    hasEmployableRonin: (game) => {
        return game.bushos.some(b => {
            if (b.status !== 'ronin' || b.belongKunishuId > 0) return false;
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
            if (b.clan !== game.playerClanId || b.isDaimyo) return false;
            if (b.status !== 'active' && b.status !== 'unborn') return false;
            
            // unborn の中でも「出生前」フラグが立っている場合は除外する
            if (b.status === 'unborn' && b.isNotBorn) return false;

            const bFamily = Array.isArray(b.familyIds) ? b.familyIds : [];
            return bFamily.includes(daimyo.id) || dFamily.includes(b.id);
        });
    },
    // --- 軍事用 ---
    canTraining: (game, castle) => {
        const maxTraining = (window.WarParams && window.WarParams.Military && window.WarParams.Military.MaxTraining) ? window.WarParams.Military.MaxTraining : 100;
        if (castle.training >= maxTraining) return false;
        if (castle.soldiers <= 0) return false;
        return true;
    },
    canSoldierCharity: (game, castle) => {
        const maxMorale = (window.WarParams && window.WarParams.Military && window.WarParams.Military.MaxMorale) ? window.WarParams.Military.MaxMorale : 100;
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
            if (c.id !== 0 && c.id !== Number(game.playerClanId)) {
                const rel = game.getRelation(game.playerClanId, c.id);
                if (rel && rel.status === '従属') {
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
                if (b.clan !== myClanId || b.isDaimyo || b.status !== 'active') return false;
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
    canTransport: (game, castle) => {
        if (castle.soldiers <= 0 && castle.gold <= 0 && castle.rice <= 0 && (castle.horses || 0) <= 0 && (castle.guns || 0) <= 0) {
            return false;
        }
        return true;
    },
    // --- 軍事取引 ---
    canBuyRice: (game, castle) => {
        let rate = 1.0;
        if (castle && game.provinces) {
            const province = game.provinces.find(p => p.id === castle.provinceId);
            if (province && province.marketRate !== undefined) rate = province.marketRate;
        }
        const minCost = Math.floor(1 * rate);
        return castle.gold >= (minCost > 0 ? minCost : 1) && (castle.tradeLimit || 0) > 0;
    },
    canSellRice: (game, castle) => {
        return castle.rice >= 1 && (castle.tradeLimit || 0) > 0;
    },
    canBuyHorses: (game, castle) => {
        const daimyo = game.bushos.find(b => b.clan === castle.ownerClan && b.isDaimyo);
        const castellan = game.getBusho(castle.castellanId);
        const cost = GameSystem.calcBuyHorseCost(1, daimyo, castellan);
        return castle.gold >= cost;
    },
    canBuyGuns: (game, castle) => {
        const daimyo = game.bushos.find(b => b.clan === castle.ownerClan && b.isDaimyo);
        const castellan = game.getBusho(castle.castellanId);
        const cost = GameSystem.calcBuyGunCost(1, daimyo, castellan);
        return castle.gold >= cost;
    },
    // --- 臣従願のルール追加 ---
    canVassalage: (game) => {
        // 条件①：生き残っている大名家が3つ以上あるかチェックします（自分を含めて2つ以下ならダメです）
        const aliveClans = new Set(game.castles.filter(c => c.ownerClan !== 0).map(c => c.ownerClan));
        if (aliveClans.size <= 2) return false;
        
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
        costGold: 200, costRice: 0, 
        isMulti: true, hasAdvice: false, 
        startMode: 'busho_select', sortKey: 'politics',
        msg: "金: 200 (1回あたり)",
        canExecute: (game, castle) => castle.kokudaka < castle.maxKokudaka
    },
    'commerce': { 
        label: "鉱山開発", category: 'DEVELOP', 
        costGold: 200, costRice: 0, 
        isMulti: true, hasAdvice: false, 
        startMode: 'busho_select', sortKey: 'politics',
        msg: "金: 200 (1回あたり)",
        canExecute: (game, castle) => castle.commerce < castle.maxCommerce
    },
    'repair': { 
        label: "城壁修復", category: 'DEVELOP', 
        costGold: 200, costRice: 0, 
        isMulti: true, hasAdvice: false, 
        startMode: 'busho_select', sortKey: 'politics',
        msg: "金: 200 (1回あたり)",
        canExecute: (game, castle) => castle.defense < castle.maxDefense
    },
    'charity': { 
        label: "民施し", category: 'DEVELOP', 
        costGold: 0, costRice: 200, 
        isMulti: true, hasAdvice: false, 
        startMode: 'busho_select', sortKey: 'charm',
        msg: "米: 200 (1回あたり)",
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
        costGold: 0, costRice: 200, 
        isMulti: true, hasAdvice: false, 
        startMode: 'busho_select', sortKey: 'leadership',
        msg: "米: 200 (1回あたり)\n兵士の士気を上げます",
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
        costGold: 100, costRice: 0, 
        isMulti: true, hasAdvice: false, 
        startMode: 'busho_select', sortKey: 'loyalty',
        msg: "金: 100 (1人あたり)\n褒美を与えます",
        canExecute: (game, castle) => CAN_EXECUTE_RULES.hasActiveBushoExceptDaimyo(game)
    },
    'interview': { 
        label: "面談", category: 'PERSONNEL', 
        costGold: 0, costRice: 0, 
        isMulti: false, hasAdvice: false, 
        startMode: 'busho_select', sortKey: 'leadership',
        msg: "武将と面談します",
        canExecute: (game, castle) => CAN_EXECUTE_RULES.hasActiveBushoExceptDaimyo(game)
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
        sortKey: 'strength'
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

    // --- システム (SYSTEM) - UI生成用プレースホルダ ---
    'history': { label: "履歴", category: 'SYSTEM', isSystem: true, action: 'history' },
    'settings': { label: "設定", category: 'SYSTEM', isSystem: true, action: 'settings' },
    'save': { label: "セーブ", category: 'SYSTEM', isSystem: true, action: 'save' },
    'load': { label: "ロード", category: 'SYSTEM', isSystem: true, action: 'load' },
    'title': { label: "タイトルへ", category: 'SYSTEM', isSystem: true, action: 'title' }
};

// ★ここから追加：軍団1～8のコマンド設定を自動で作る魔法
const numberNames = ["", "第一席", "第二席", "第三席", "第四席", "第五席", "第六席", "第七席", "第八席"];
[1, 2, 3, 4, 5, 6, 7, 8].forEach(n => {
    COMMAND_SPECS['appoint_legion_leader_' + n] = { label: numberNames[n], category: 'LEGION', isSystem: true, action: 'appoint_legion_leader_' + n, canExecute: (game, castle) => CAN_EXECUTE_RULES.canManageLegion(game, n) };
    COMMAND_SPECS['dismiss_legion_leader_' + n] = { label: numberNames[n], category: 'LEGION', isSystem: true, action: 'dismiss_legion_leader_' + n, canExecute: (game, castle) => CAN_EXECUTE_RULES.canDismissLegion(game, n) };
    COMMAND_SPECS['allot_fief_' + n] = { label: numberNames[n], category: 'LEGION', isSystem: true, action: 'allot_fief_' + n, canExecute: (game, castle) => CAN_EXECUTE_RULES.canAllotFief(game, n) };
});
// ★ここまで

class CommandSystem {
    constructor(game) {
        this.game = game;
    }
    
    // ==========================================
    // ★ここから追加：武将を選ぶ時の「誰を出すか」「どう並べるか」のルールをまとめた魔法
    // ==========================================
    getBushoSelectorData(actionType, targetId, extraData, currentCastle) {
        let infoHtml = ""; 
        let bushos = []; 
        
        const baseType = actionType.replace('_deploy', ''); 
        const spec = this.getSpecs()[baseType] || this.getSpecs()[actionType] || {};
    
        let sortKey = spec.sortKey || 'strength';
        let isMulti = spec.isMulti || false;
        
        if (actionType === 'def_intercept_deploy' || actionType === 'def_reinf_deploy' || actionType === 'atk_reinf_deploy' || actionType === 'def_self_reinf_deploy' || actionType === 'atk_self_reinf_deploy') {
             isMulti = true;
             sortKey = 'strength';
        }

        let isEnemyTarget = false;
        let targetCastle = null;
        // ★追加: 'kunishu_headhunt_target' も敵の城を見に行くコマンドとして追加します！
        if (['rumor_target_busho','headhunt_target','kunishu_headhunt_target','view_only'].includes(actionType)) {
             isEnemyTarget = true;
             targetCastle = this.game.getCastle(targetId);
        }

        const gunshi = this.game.getClanGunshi(this.game.playerClanId);
        const myDaimyo = this.game.bushos.find(b => b.clan === this.game.playerClanId && b.isDaimyo);
        const c = currentCastle;

        // --- 条件分岐（誰をリストに出すか） ---
        if (actionType === 'employ_target') { 
            bushos = this.game.bushos.filter(b => {
                if (b.status !== 'ronin' || b.belongKunishuId > 0) return false;
                const targetCastle = this.game.getCastle(b.castleId);
                return targetCastle && targetCastle.ownerClan === this.game.playerClanId;
            });
            infoHtml = "<div>登用する浪人を選択してください</div>"; 
        }
        else if (actionType === 'employ_doer') {
            bushos = this.game.getCastleBushos(c.id).filter(b => b.clan === c.ownerClan && b.status === 'active'); 
            infoHtml = "<div>登用を行う担当官を選択してください</div>"; 
        } 
        else if (actionType === 'diplomacy_doer') { 
            bushos = this.game.getCastleBushos(c.id).filter(b => b.clan === c.ownerClan && b.status === 'active'); 
            infoHtml = "<div>外交の担当官を選択してください</div>"; 
        }
        // ★追加：貢物を持っていく使者を選ぶリスト
        else if (actionType === 'tribute_doer') { 
            bushos = this.game.getCastleBushos(c.id).filter(b => b.clan === c.ownerClan && b.status === 'active'); 
            infoHtml = "<div>朝廷への使者を選択してください</div>"; 
        }
        else if (actionType === 'rumor_target_busho') { 
            const targetCastle = this.game.getCastle(targetId);
            bushos = this.game.getCastleBushos(targetId).filter(b => b.clan === targetCastle.ownerClan && b.status === 'active' && !b.isDaimyo); 
            infoHtml = "<div>離間計の対象とする武将を選択してください</div>"; 
        }
        else if (actionType === 'rumor_doer') { 
            bushos = this.game.getCastleBushos(c.id).filter(b => b.clan === c.ownerClan && b.status === 'active'); 
            infoHtml = "<div>離間計を実行する担当官を選択してください</div>"; 
        }
        else if (actionType === 'incite_doer') { 
            bushos = this.game.getCastleBushos(c.id).filter(b => b.clan === c.ownerClan && b.status === 'active'); 
            infoHtml = "<div>民心撹乱を実行する担当官を選択してください</div>"; 
        }
        else if (actionType === 'sabotage_doer') { 
            bushos = this.game.getCastleBushos(c.id).filter(b => b.clan === c.ownerClan && b.status === 'active'); 
            infoHtml = "<div>破壊工作を実行する担当官を選択してください</div>"; 
        }
        else if (actionType === 'headhunt_target') { 
            const targetCastle = this.game.getCastle(targetId);
            bushos = this.game.getCastleBushos(targetId).filter(b => b.clan === targetCastle.ownerClan && b.status === 'active' && !b.isDaimyo); 
            infoHtml = "<div>武将引抜の対象とする武将を選択してください </div>"; 
        }
        else if (actionType === 'kunishu_incorporate_doer') {
            bushos = this.game.getCastleBushos(c.id).filter(b => b.clan === c.ownerClan && b.status === 'active'); 
            infoHtml = "<div>取込の交渉を行う担当官を選択してください</div>"; 
        }
        else if (actionType === 'headhunt_doer') {
            bushos = this.game.getCastleBushos(c.id).filter(b => b.clan === c.ownerClan && b.status === 'active'); 
            infoHtml = "<div>引抜を実行する担当官を選択してください</div>"; 
        }
        else if (actionType === 'interview') { 
            bushos = this.game.bushos.filter(b => b.clan === this.game.playerClanId && b.status === 'active' && !b.isDaimyo); 
            infoHtml = "<div>面談する武将を選択してください</div>"; 
        }
        else if (actionType === 'interview_target') {
            bushos = this.game.bushos.filter(b => b.clan === this.game.playerClanId && b.status === 'active' && b.id !== extraData.interviewer.id && !b.isDaimyo);
            infoHtml = `<div>誰についての印象を聞きますか？</div>`; 
        }
        else if (actionType === 'investigate_deploy') { 
            bushos = this.game.getCastleBushos(c.id).filter(b => b.clan === c.ownerClan && b.status === 'active'); 
            infoHtml = "<div>調査を行う武将を選択してください(複数可)</div>"; 
        }
        else if (actionType === 'view_only') { 
            bushos = this.game.getCastleBushos(targetId); 
            infoHtml = "<div>武将一覧です</div>"; 
        }
        else if (actionType === 'all_busho_list') { 
            bushos = this.game.bushos.filter(b => b.clan === this.game.playerClanId && b.status === 'active');
            infoHtml = "<div>武将一覧です</div>"; 
            isMulti = false;
        }
        else if (actionType === 'marriage_kinsman') {
            const targetClanId = this.game.getCastle(targetId).ownerClan;
            const targetLeaderId = this.game.clans.find(c => c.id === targetClanId)?.leaderId;
            const targetLeader = this.game.getBusho(targetLeaderId);
            
            bushos = this.game.bushos.filter(b => {
                if (b.clan !== targetClanId || b.status !== 'active') return false;
                // 大名本人か、直接の血縁（お互いのリストに直接IDが含まれている）かをチェックします
                const bFamily = Array.isArray(b.familyIds) ? b.familyIds : [];
                const lFamily = Array.isArray(targetLeader.familyIds) ? targetLeader.familyIds : [];
                return b.id === targetLeader.id || bFamily.includes(targetLeader.id) || lFamily.includes(b.id);
            });
            infoHtml = "<div>姫を嫁がせる相手（一門武将）を選択してください</div>";
            isMulti = false;
        }
        else if (actionType === 'war_general' || actionType === 'kunishu_war_general') {
            if (extraData && extraData.candidates) {
                bushos = extraData.candidates.map(id => this.game.getBusho(id));
            }
            infoHtml = "<div>総大将とする武将を選択してください</div>"; 
            isMulti = false;
        }
        else if (actionType === 'appoint_gunshi') {
            bushos = this.game.bushos.filter(b => 
                b.clan === this.game.playerClanId && 
                b.status === 'active' && 
                !b.isDaimyo && 
                !b.isCastellan
            );
            infoHtml = "<div>軍師に任命する武将を選択してください</div>";
        }
        else if (actionType === 'appoint_legion_leader') {
            bushos = this.game.bushos.filter(b => 
                b.clan === this.game.playerClanId && 
                b.status === 'active' && 
                !b.isDaimyo &&
                !b.isCommander
            );
            infoHtml = "<div>国主に任命する武将を選択してください</div>"; 
            isMulti = false;
        }
        else if (actionType === 'def_intercept_deploy') {
            const targetC = this.game.getCastle(targetId);
            bushos = this.game.getCastleBushos(targetId).filter(b => b.clan === targetC.ownerClan && b.status === 'active');
            infoHtml = "<div>出陣武将を選択してください（最大5名まで）</div>";
        }
        else if (actionType === 'def_reinf_deploy' || actionType === 'atk_reinf_deploy') {
            const targetC = this.game.getCastle(targetId);
            bushos = this.game.getCastleBushos(targetId).filter(b => b.clan === targetC.ownerClan && b.status === 'active');
            infoHtml = "<div>派遣する武将を選択してください（最大5名まで）</div>";
        }
        else if (actionType === 'def_self_reinf_deploy' || actionType === 'atk_self_reinf_deploy') {
            const targetC = this.game.getCastle(targetId);
            bushos = this.game.getCastleBushos(targetId).filter(b => b.clan === targetC.ownerClan && b.status === 'active');
            infoHtml = "<div>出陣武将を選択してください（最大5名まで）</div>";
        }
        else if (actionType === 'reward') {
            bushos = this.game.bushos.filter(b => 
                b.clan === this.game.playerClanId && 
                b.status === 'active' && 
                !b.isDaimyo                          
            );
            infoHtml = "<div>褒美を与える武将を選択してください</div>"; 
        }
        else if (actionType === 'banish') {
            bushos = this.game.bushos.filter(b => 
                b.clan === this.game.playerClanId && 
                b.status === 'active' && 
                !b.isDaimyo                          
            );
            infoHtml = "<div>追放する武将を選択してください</div>"; 
        }
        else if (actionType === 'succession_target') {
            const daimyo = this.game.bushos.find(b => b.clan === this.game.playerClanId && b.isDaimyo);
            if (daimyo) {
                const dFamily = Array.isArray(daimyo.familyIds) ? daimyo.familyIds : [];
                bushos = this.game.bushos.filter(b => {
                    if (b.clan !== this.game.playerClanId || b.isDaimyo) return false;
                    if (b.status !== 'active' && b.status !== 'unborn') return false;

                    // ★追加：unborn の中でも「出生前」フラグが立っている場合は除外する
                    if (b.status === 'unborn' && b.isNotBorn) return false;

                    const bFamily = Array.isArray(b.familyIds) ? b.familyIds : [];
                    return bFamily.includes(daimyo.id) || dFamily.includes(b.id);
                });
            }
            infoHtml = "<div>家督を譲る一門武将を選択してください</div>";
        }
        else {
            // ★追加: 内政などの通常の命令でも、未登場の武将や諸勢力が勝手にリストに出ないようにします
            bushos = this.game.getCastleBushos(c.id).filter(b => b.clan === c.ownerClan && b.status === 'active');
            
            if (spec.msg) {
                infoHtml = `<div>${spec.msg}</div>`;
                if (actionType === 'war_deploy') {
                    infoHtml = `<div>出陣武将を選択してください（最大5名まで）</div>`;
                }
            } else if (['farm','commerce'].includes(actionType)) { infoHtml = `<div>金: ${c.gold} (1回500)</div>`; }
            else if (['charity'].includes(actionType)) { infoHtml = `<div>金: ${c.gold}, 米: ${c.rice} (1回300)</div>`; }
            else if (['repair'].includes(actionType)) { infoHtml = `<div>金: ${c.gold} (1回300)</div>`; }
            else if (['draft'].includes(actionType)) { infoHtml = `<div>民忠: ${c.peoplesLoyalty}</div>`; }
            else if (['training','soldier_charity'].includes(actionType)) { infoHtml = `<div>状態: 訓練${c.training}/士気${c.morale}</div>`; }
            else if (actionType === 'war_deploy' || actionType === 'kunishu_subjugate_deploy') { infoHtml = `<div>出陣武将を選択してください（最大5名まで）</div>`; }
        }
        
        // --- 並び替え（ソート） ---
        const isViewOnly = actionType === 'view_only' || actionType === 'all_busho_list';
        
        bushos.sort((a,b) => {
            if (isViewOnly) {
                const getRankScore = (target) => {
                    if (target.isPrincess) return 5; // ★追加：姫を一番上にします！
                    if (target.isDaimyo || target.isCastellan) return 10; 
                    if (target.isGunshi) return 20;
                    if (target.belongKunishuId && target.belongKunishuId > 0) {
                        const kunishu = this.game.kunishuSystem.getKunishu(target.belongKunishuId);
                        const isBoss = kunishu && (Number(kunishu.leaderId) === Number(target.id));
                        if (isBoss) return 40 + (target.belongKunishuId * 0.001); 
                        return 50 + (target.belongKunishuId * 0.001); 
                    }
                    if (target.status === 'ronin') return 90; 
                    return 30; 
                };
                const rankA = getRankScore(a);
                const rankB = getRankScore(b);
                if (rankA !== rankB) return rankA - rankB;
            }

            const getSortVal = (target) => {
                 let acc = null;
                 if (isEnemyTarget && targetCastle) acc = targetCastle.investigatedAccuracy;

                 const cCastle = currentCastle;
                 try {
                     if (['farm', 'commerce'].includes(actionType)) {
                         return typeof GameSystem.calcDevelopment === 'function' ? GameSystem.calcDevelopment(target, 1.0) : target.politics;
                     }
                     if (actionType === 'repair') {
                         return typeof GameSystem.calcRepair === 'function' ? GameSystem.calcRepair(target, 1.0) : target.politics;
                     }
                     if (actionType === 'charity') {
                         return typeof GameSystem.calcCharity === 'function' ? GameSystem.calcCharity(target, 1.0) : target.charm;
                     }
                     if (actionType === 'training') {
                         return typeof GameSystem.calcTraining === 'function' ? GameSystem.calcTraining(target, cCastle.soldiers || 1, 1.0) : target.leadership;
                     }
                     if (actionType === 'soldier_charity') {
                         return typeof GameSystem.calcSoldierCharity === 'function' ? GameSystem.calcSoldierCharity(target, cCastle.soldiers || 1, 1.0) : target.leadership;
                     }
                     if (actionType === 'draft') {
                         return (target.leadership * 1.5) + (target.charm * 1.5) + (Math.sqrt(target.loyalty) * 2);
                     }
                     if (['war_deploy', 'def_intercept_deploy', 'def_reinf_deploy', 'atk_reinf_deploy', 'def_self_reinf_deploy', 'atk_self_reinf_deploy', 'kunishu_subjugate_deploy'].includes(actionType)) {
                         return (target.leadership * 1.5) + target.strength;
                     }
                 } catch (e) {
                 }

                 if (isEnemyTarget) return GameSystem.getPerceivedStatValue(target, sortKey, gunshi, acc, this.game.playerClanId, myDaimyo) || 0;
                 const val = GameSystem.getPerceivedStatValue(target, sortKey, gunshi, null, this.game.playerClanId, myDaimyo);
                 return val === null ? 0 : val;
            };
            return getSortVal(b) - getSortVal(a);
        });

        // 集めた情報を ui.js に送り返します
        return { bushos, infoHtml, isMulti, spec };
    }
    // ==========================================
    
    getSpecs() {
        return COMMAND_SPECS;
    }
    
    // ==========================================
    // ★ここから追加：カテゴリ（大枠のボタン）が押せるかどうかを判定する専門窓口
    // ==========================================
    isCategoryDisabled(categoryLabel) {
        const findMenu = (list, label) => {
            for (const item of list) {
                if (item.label === label) return item;
                if (item.subMenus) {
                    const found = findMenu(item.subMenus, label);
                    if (found) return found;
                }
            }
            return null;
        };

        const targetMenu = findMenu(COMMAND_MENU_STRUCTURE, categoryLabel);
        if (!targetMenu) return false;

        const hasExecutableCommand = (menuItem) => {
            if (menuItem.commands) {
                for (const cmdKey of menuItem.commands) {
                    if (this.canExecuteCommand(cmdKey)) return true;
                }
            }
            if (menuItem.subMenus) {
                for (const sub of menuItem.subMenus) {
                    if (hasExecutableCommand(sub)) return true;
                }
            }
            return false;
        };

        return !hasExecutableCommand(targetMenu);
    }
    // ==========================================

    // ★追加：道が繋がっているお城をまとめて調べる共通の魔法です！
    getConnectedCastles(startCastle, clanId) {
        const connectedCastles = new Set();
        const queue = [startCastle];
        connectedCastles.add(Number(startCastle.id));

        while (queue.length > 0) {
            const current = queue.shift();
            const neighbors = this.game.castles.filter(adj => 
                Number(adj.ownerClan) === Number(clanId) && 
                GameSystem.isAdjacent(current, adj) &&
                !connectedCastles.has(Number(adj.id))
            );
            for (const n of neighbors) {
                connectedCastles.add(Number(n.id));
                queue.push(n);
            }
        }
        return connectedCastles;
    }

    canExecuteCommand(type) {
        const spec = COMMAND_SPECS[type];
        if (!spec) return true;
        if (spec.isSystem && typeof spec.canExecute !== 'function') return true;

        const castle = this.game.getCurrentTurnCastle();
        if (!castle) return false;

        // 【共通ルール】未行動の武将が必要なコマンドのチェック
        const actionRequiredCommands = [
            'farm', 'commerce', 'repair', 'charity', 
            'war', 'draft', 'training', 'soldier_charity', 'transport', 'kunishu_subjugate', 
            'goodwill', 'alliance', 'marriage', 'dominate', 'subordinate', 'break_alliance', 
            'kunishu_goodwill', 'kunishu_incorporate', 
            'sabotage', 'incite', 'rumor', 'headhunt', 
            'tribute', 'court_truce', 
            'employ', 'move'
        ];
        if (actionRequiredCommands.includes(type)) {
            const activeBushos = this.game.bushos.filter(b => b.castleId === castle.id && b.clan === castle.ownerClan && b.status === 'active' && !b.isActionDone);
            if (activeBushos.length === 0) return false;
        }

        // 【共通ルール】設計図に設定されているコスト（金・兵糧）のチェック
        if (spec.costGold > 0 && castle.gold < spec.costGold) return false;
        if (spec.costRice > 0 && castle.rice < spec.costRice) return false;

        // 【個別ルール】設計図に専用のルール(canExecute)が設定されているか確認し、実行します
        if (typeof spec.canExecute === 'function') {
            if (spec.canExecute(this.game, castle) === false) {
                return false;
            }
        }

        // ★ここから追加：対象をマップで選ぶコマンドの場合、選べる対象が1つもなければ実行不可にします
        if (spec.startMode === 'map_select') {
            const validTargets = this.getValidTargets(type);
            if (!validTargets || validTargets.length === 0) {
                return false;
            }
        }

        return true;
    }
    
    getValidTargets(type) {
        // 援軍要請の時は、すでに計算されている候補リストをそのまま使います！
        if (['atk_self_reinforcement', 'atk_ally_reinforcement', 'def_self_reinforcement', 'def_ally_reinforcement'].includes(type)) {
            if (this.game.tempReinfData && this.game.tempReinfData.candidates) {
                return this.game.tempReinfData.candidates.map(c => c.id);
            }
            return [];
        }

        const spec = COMMAND_SPECS[type];
        if (!spec || !spec.targetType) return [];

        const c = this.game.getCurrentTurnCastle();
        const playerClanId = Number(this.game.playerClanId);
        
        switch (spec.targetType) {
            case 'enemy_valid': {
                // warManagerからの基本リストを取得
                const baseTargets = this.game.warManager.getValidWarTargets(c);
                // ★追加：自領と直接隣接している（同盟国などを通らない）城だけに出陣可能にします
                return baseTargets.filter(targetId => {
                    const targetCastle = this.game.getCastle(targetId);
                    if (!targetCastle || !targetCastle.adjacentCastleIds) return false;
                    return targetCastle.adjacentCastleIds.some(adjId => {
                        const adjCastle = this.game.getCastle(adjId);
                        return adjCastle && Number(adjCastle.ownerClan) === playerClanId;
                    });
                });
            }
            
            case 'enemy_all': 
                return this.game.castles.filter(target => 
                    Number(target.ownerClan) !== playerClanId && target.ownerClan !== 0
                ).map(t => t.id);

            case 'ally_other': {
                // ★修正：ターゲットごとに探すのではなく、最初に繋がっている領土をまとめて取得します（超高速化）！
                const connectedForAlly = this.getConnectedCastles(c, playerClanId);
                return this.game.castles.filter(target => {
                    if (Number(target.ownerClan) !== playerClanId || target.id === c.id) return false;
                    return connectedForAlly.has(Number(target.id));
                }).map(t => t.id);
            }
            
            case 'other_clan_all': 
                return this.game.castles.filter(target => {
                    if (target.ownerClan === 0 || Number(target.ownerClan) === playerClanId) return false;

                    // ★追加：すでにその関係になっている場合は、選べないように（暗く）する魔法！
                    const rel = this.game.getRelation(playerClanId, target.ownerClan);
                    if (rel) {
                        if (type === 'goodwill' && rel.sentiment >= 100) return false; // ★ここを追加！友好度100なら親善できないようにします
                        if (type === 'alliance' && rel.status === '同盟') return false;
                        if (type === 'dominate' && rel.status === '支配') return false;
                        if (type === 'subordinate' && rel.status === '従属') return false;
                    }
                    
                    // ★追加：降伏勧告と従属願と臣従願は、自領と接している勢力に限定します！
                    if (type === 'dominate' || type === 'subordinate' || type === 'vassalage') {
                        let isAdjacent = false;
                        const myCastles = this.game.castles.filter(myC => Number(myC.ownerClan) === playerClanId);
                        for (let mc of myCastles) {
                            if (mc.adjacentCastleIds) {
                                for (let adjId of mc.adjacentCastleIds) {
                                    const adjC = this.game.getCastle(adjId);
                                    if (adjC && Number(adjC.ownerClan) === Number(target.ownerClan)) {
                                        isAdjacent = true;
                                        break;
                                    }
                                }
                            }
                            if (isAdjacent) break;
                        }
                        if (!isAdjacent) return false;
                    }

                    // ★今回追加：臣従願は、相手の威信が自家の「5倍以上」ないと選べないようにします！
                    if (type === 'vassalage') {
                        const myClan = this.game.clans.find(myC => Number(myC.id) === playerClanId);
                        const targetClan = this.game.clans.find(tgtC => Number(tgtC.id) === target.ownerClan);
                        if (myClan && targetClan) {
                            if (targetClan.daimyoPrestige < myClan.daimyoPrestige * 5) {
                                return false;
                            }
                        }
                    }
                    
                    // その大名家の「大名（当主）」を探して、その人がいる城だけをOK（選択可能）にします！
                    const daimyo = this.game.bushos.find(b => b.clan === target.ownerClan && b.isDaimyo);
                    
                    // ★追加：降伏勧告のとき、相手の大名が「征夷大将軍（ID1の官位）」を持っていたら選べなくします！
                    if (type === 'dominate' && daimyo && daimyo.courtRankIds && daimyo.courtRankIds.includes(1)) {
                        return false;
                    }

                    return daimyo && Number(daimyo.castleId) === Number(target.id);
                }).map(t => t.id);
                
            case 'ally_clan': 
                return this.game.castles.filter(target => {
                    if (target.ownerClan === 0 || Number(target.ownerClan) === playerClanId) return false;
                    const rel = this.game.getRelation(playerClanId, target.ownerClan);
                    // ★バリア追加：rel が空っぽの時に落ちないようにガードしました！
                    return rel && rel.status === '同盟';
                }).map(t => t.id);

            case 'breakable_clan': 
                return this.game.castles.filter(target => {
                    if (target.ownerClan === 0 || Number(target.ownerClan) === playerClanId) return false;
                    const rel = this.game.getRelation(playerClanId, target.ownerClan);
                    // ★バリア追加：rel が空っぽの時に落ちないようにガードしました！
                    if (!rel || !['同盟', '支配', '従属'].includes(rel.status)) return false;
                    
                    const daimyo = this.game.bushos.find(b => b.clan === target.ownerClan && b.isDaimyo);
                    return daimyo && Number(daimyo.castleId) === Number(target.id);
                }).map(t => t.id);
                
            // ★追加：敵対している大名だけを選べるようにする絞り込みです！
            case 'hostile_clan_only':
                return this.game.castles.filter(target => {
                    if (target.ownerClan === 0 || Number(target.ownerClan) === playerClanId) return false;
                    const rel = this.game.getRelation(playerClanId, target.ownerClan);
                    // 敵対状態のみ選択可能にします！
                    if (!rel || rel.status !== '敵対') return false;
                    
                    const daimyo = this.game.bushos.find(b => b.clan === target.ownerClan && b.isDaimyo);
                    return daimyo && Number(daimyo.castleId) === Number(target.id);
                }).map(t => t.id);

            // ★追加: まだ壊滅していない諸勢力がいる城を探してリストアップします（親善コマンド用）
            case 'kunishu_valid': {
                const activeKunishus = this.game.kunishuSystem.getAliveKunishus();
                // ★ここを追加！：親善の時は、すでに友好度100の諸勢力は選べないようにします
                let validKunishus = activeKunishus;
                if (type === 'kunishu_goodwill') {
                    validKunishus = activeKunishus.filter(k => k.getRelation(playerClanId) < 100);
                }
                return [...new Set(validKunishus.map(k => k.castleId))];
            }

            case 'kunishu_incorporate_valid': {
                const activeKunishus = this.game.kunishuSystem.getAliveKunishus();
                const myClanId = playerClanId;
                const myClan = this.game.clans.find(clan => clan.id === myClanId);
                const myPrestige = myClan ? myClan.daimyoPrestige : 0;

                const validKunishus = activeKunishus.filter(k => {
                    const castle = this.game.getCastle(k.castleId);
                    // 自分の城にいること
                    if (!castle || Number(castle.ownerClan) !== myClanId) return false;
                    // 宗教ではないこと
                    if (k.ideology === '宗教') return false;
                    // 友好度95以上
                    if (k.getRelation(myClanId) < 95) return false;
                    // 兵士数が自軍威信の半分以下
                    if (k.soldiers > myPrestige / 2) return false;
                    return true;
                });
                return [...new Set(validKunishus.map(k => k.castleId))];
            }

            // ★追加: 鎮圧コマンド専用！自分の城か、隣の城だけを選べるようにします
            case 'kunishu_subjugate_valid': {
                const activeKunishus = this.game.kunishuSystem.getAliveKunishus();
                // まず諸勢力がいる城を全部集めます（Numberで数字に揃えます）
                const allKunishuCastleIds = [...new Set(activeKunishus.map(k => Number(k.castleId)))];
                
                // ★修正：共通の魔法を使って、繋がっている領土をサクッと取得します！
                const connectedCastles = this.getConnectedCastles(c, playerClanId);
                
                // 集めた城を「フィルター（ふるい）」にかけて、条件に合うものだけを残します！
                return allKunishuCastleIds.filter(targetCastleId => {
                    const targetCastle = this.game.getCastle(targetCastleId);
                    if (!targetCastle) return false; // 安全のためのストッパー
                    
                    // 条件①：道が繋がっている自分の領土かどうか？
                    const isConnected = connectedCastles.has(Number(targetCastleId));
                    // 条件②：道が繋がっている領土の「すぐ隣の城」かどうか？
                    const isNextToConnected = this.game.castles.some(myC => connectedCastles.has(Number(myC.id)) && GameSystem.isAdjacent(targetCastle, myC));
                    
                    // どちらか1つでも当てはまればOK（地図で光らせる）！
                    return isConnected || isNextToConnected;
                });
            }
            
            case 'marriage_valid': {
                // 1. まず、自分の大名家に嫁がせられる姫（未婚の姫）がいるかチェックします
                const myClan = this.game.clans.find(clan => clan.id === playerClanId);
                const hasUnmarriedPrincess = myClan && myClan.princessIds && myClan.princessIds.some(pId => {
                    const p = this.game.princesses.find(princess => princess.id === pId);
                    return p && p.status === 'unmarried';
                });
                // 未婚の姫が一人もいなければ、選べる城は「ゼロ」にしておきます
                if (!hasUnmarriedPrincess) return [];

                // 2. 他の大名家の城を「フィルター（ふるい）」にかけて、条件に合うものだけを残します
                return this.game.castles.filter(target => {
                    if (target.ownerClan === 0 || Number(target.ownerClan) === playerClanId) return false;
                    
                    // ★追加：その大名家の「大名（当主）」を探して、その人がいる城（居城）だけをOKにします！
                    const daimyo = this.game.bushos.find(b => b.clan === target.ownerClan && b.isDaimyo);
                    if (!daimyo || Number(daimyo.castleId) !== Number(target.id)) return false;

                    const targetLeaderId = this.game.clans.find(clan => clan.id === target.ownerClan)?.leaderId;
                    const targetLeader = this.game.getBusho(targetLeaderId);
                    if (targetLeader) {
                        // 相手の家の一門武将を探します
                        const kinsmen = this.game.bushos.filter(b => {
                            if (b.clan !== target.ownerClan || b.status !== 'active') return false;
                            const bFamily = Array.isArray(b.familyIds) ? b.familyIds : [];
                            const lFamily = Array.isArray(targetLeader.familyIds) ? targetLeader.familyIds : [];
                            return b.id === targetLeader.id || bFamily.includes(targetLeader.id) || lFamily.includes(b.id);
                        });
                        if (kinsmen.length > 0) return true; // 一門武将がいればOK（光らせる）！
                    }
                    return false;
                }).map(t => t.id); // 最後にIDだけのリストにして返します
            }
                
            default:
                return [];
        }
    }

    startCommand(type, targetId = null, extraData = null) {
        const spec = COMMAND_SPECS[type];
        if (!spec) {
            console.warn("Unknown command:", type);
            return;
        }

        if (spec.isSystem) {
            this.executeSystemCommand(spec.action);
            return;
        }

        switch (spec.startMode) {
            case 'map_select':
                this.enterMapSelection(type);
                break;

            case 'busho_select':
                this.game.ui.openBushoSelector(type, targetId, extraData);
                break;
            
            case 'busho_select_special':
                if (spec.subType) {
                    this.game.ui.openBushoSelector(spec.subType, targetId, extraData);
                } else {
                    this.game.ui.openBushoSelector(type, targetId, extraData);
                }
                break;

            case 'quantity_select':
                this.game.ui.openQuantitySelector(type, null, targetId);
                break;

            default:
                console.warn(`Unhandled startMode: ${spec.startMode} for command ${type}`);
                break;
        }
    }

    executeSystemCommand(action) {
        switch(action) {
            case 'save': window.GameApp.saveGameToFile(); break;
            case 'load': 
                const f = document.getElementById('load-file-input'); 
                if(f) f.click(); 
                break;
            case 'history': 
                if (this.game.ui.info) {
                    this.game.ui.info.showHistoryModal(this.game.ui.logHistory);
                } else {
                    this.game.ui.showHistoryModal(this.game.ui.logHistory);
                }
                break;
            case 'daimyo_list': this.game.ui.showDaimyoList(); break;
            case 'kunishu_list': this.game.ui.info.showAllKunishuList(); break;
            case 'faction_list': this.game.ui.showFactionList(this.game.playerClanId, true); break;
            case 'busho_list': this.game.ui.openBushoSelector('all_busho_list', null, null, null); break;
            case 'princess_list': this.game.ui.showPrincessList(); break;
            case 'kyoten_list': this.game.ui.showKyotenList(); break;
            // 「settings」と呼ばれたら小窓を開きます
            case 'settings': this.game.ui.showSettingsModal(); break;
            case 'title':
                this.game.ui.showDialog("タイトル画面に戻りますか？\n保存していないデータは失われます。", true, () => {
                    // 「はい」を押した時だけ、タイトル画面を呼び出してゲーム画面を隠します
                    this.game.ui.returnToTitle();
                    const appScreen = document.getElementById('app');
                    if (appScreen) appScreen.classList.add('hidden');
                });
                break;
            default:
                // ★追加：1〜8までの数字がついている軍団系のコマンドを一つにまとめます！
                if (action.startsWith('appoint_legion_leader_')) {
                    const no = parseInt(action.replace('appoint_legion_leader_', ''));
                    if (!isNaN(no)) this.game.ui.showAppointLegionLeaderModal(no);
                } else if (action.startsWith('dismiss_legion_leader_')) {
                    const no = parseInt(action.replace('dismiss_legion_leader_', ''));
                    if (!isNaN(no)) this.game.ui.showDismissLegionLeaderConfirm(no);
                } else if (action.startsWith('allot_fief_')) {
                    const no = parseInt(action.replace('allot_fief_', ''));
                    if (!isNaN(no)) this.game.ui.showAllotFiefModal(no);
                }
                break;
        }
    }

    handleBushoSelection(actionType, selectedIds, targetId, extraData) {
        if (!selectedIds || selectedIds.length === 0) return;
        const firstId = selectedIds[0];

        if (actionType === 'employ_target') {
            this.game.ui.openBushoSelector('employ_doer', null, { targetId: firstId });
            return;
        }
        if (actionType === 'employ_doer') {
            const doer = this.game.getBusho(firstId);
            const target = this.game.getBusho(extraData.targetId);
            const myPower = this.game.getClanTotalSoldiers(this.game.playerClanId);
            const targetPower = target.clan === 0 ? 0 : this.game.getClanTotalSoldiers(target.clan);
            const trueProb = GameSystem.getEmployProb(doer, target, myPower, targetPower);
            this.showAdviceAndExecute('employ', () => this.executeEmploy(firstId, extraData.targetId), { targetId: extraData.targetId, trueProb: trueProb });
            return;
        }

        if (actionType === 'headhunt_target') {
            this.game.ui.openBushoSelector('headhunt_doer', null, { targetId: firstId });
            return;
        }
        if (actionType === 'headhunt_doer') {
            this.game.ui.openQuantitySelector('headhunt_gold', selectedIds, extraData.targetId);
            return;
        }

        if (actionType === 'rumor_target_busho') {
            this.game.ui.openBushoSelector('rumor_doer', targetId, { targetBushoId: firstId });
            return;
        }

        // ★ここから追加：婚姻のリストで決定ボタンを押した時の動き！
        if (actionType === 'marriage_princess') {
            // 使者と姫のIDを覚えて、相手武将のリストを開きます
            this.game.ui.openBushoSelector('marriage_kinsman', targetId, { 
                doerId: extraData.doerId, 
                princessId: firstId 
            });
            return;
        }
        if (actionType === 'marriage_kinsman') {
            const doerId = extraData.doerId;
            const princessId = extraData.princessId;
            const targetBushoId = firstId;
            
            const targetClanId = this.game.getCastle(targetId).ownerClan;
            const targetClan = this.game.clans.find(c => c.id === targetClanId);
            const targetBusho = this.game.getBusho(targetBushoId);
            const princess = this.game.princesses.find(p => p.id === princessId);
            const doer = this.game.getBusho(doerId);

            const msg = `${targetClan.name} の ${targetBusho.name} に、当家の ${princess.name} を嫁がせます。\nよろしいですか？`;

            this.game.ui.showDialog(msg, true, 
                () => {
                    // ここも合図だけでとっても綺麗！
                    const prob = this.game.diplomacyManager.getDiplomacyProb(doerId, targetId, 'marriage');
                    
                    this.showAdviceAndExecute('marriage', () => {
                        this.game.diplomacyManager.executeMarriage(doerId, targetId, princessId, targetBushoId);
                    }, { trueProb: prob / 100 });
                },
                () => {
                    // いいえ：もう一度相手武将選びに戻る
                    this.game.ui.openBushoSelector('marriage_kinsman', targetId, extraData);
                }
            );
            return;
        }

        if (actionType === 'rumor_doer') {
            // ★専門部署である StrategySystem の計算魔法を呼びます！
            const trueProb = this.game.strategySystem.getRumorProb(firstId, extraData.targetBushoId);
            this.showAdviceAndExecute('rumor', () => this.game.strategySystem.executeRumor(firstId, targetId, extraData.targetBushoId), { trueProb: trueProb });
            return;
        }

        if (actionType === 'diplomacy_doer') {
            if (extraData.subAction === 'goodwill') {
                this.game.ui.openQuantitySelector('goodwill', selectedIds, targetId);
            } else if (extraData.subAction === 'alliance') {
                // 外交担当に「この条件で確率教えて！」と合図を送るだけ！
                const prob = this.game.diplomacyManager.getDiplomacyProb(firstId, targetId, 'alliance');
                this.showAdviceAndExecute('diplomacy', () => this.game.diplomacyManager.executeDiplomacy(firstId, targetId, 'alliance'), { trueProb: prob / 100 });
            } else if (extraData.subAction === 'break_alliance') {
                this.executeWithEvent('break_alliance', () => this.game.diplomacyManager.executeDiplomacy(firstId, targetId, 'break_alliance'));
            } else if (extraData.subAction === 'subordinate') {
                this.showAdviceAndExecute('diplomacy', () => this.game.diplomacyManager.executeDiplomacy(firstId, targetId, 'subordinate'), { trueProb: 1.0 });
            } else if (extraData.subAction === 'vassalage') {
                this.game.ui.showDialog(`本当に臣従しますか？\n当家は滅亡し、全ての領地を明け渡します。`, true, 
                    () => {
                        this.executeWithEvent('vassalage', () => this.game.diplomacyManager.executeVassalage(firstId, targetId));
                    },
                    null,
                    { okText: '臣従する', okClass: 'btn-danger', cancelText: 'やめる' }
                );
            } else if (extraData.subAction === 'dominate') {
                const prob = this.game.diplomacyManager.getDiplomacyProb(firstId, targetId, 'dominate');
                this.showAdviceAndExecute('diplomacy', () => this.game.diplomacyManager.executeDiplomacy(firstId, targetId, 'dominate'), { trueProb: prob / 100 });
            } else if (extraData.subAction === 'court_truce') {
                // ★追加：朝廷和睦は条件を満たしていれば確実に成功します！
                this.showAdviceAndExecute('diplomacy', () => this.game.courtRankSystem.executeCourtTruce(firstId, targetId), { trueProb: 1.0 });
            } else if (extraData.subAction === 'marriage') {
                // ★変更：新しく作った「姫専用の画面」を開きます！
                this.game.ui.showPrincessSelector(targetId, firstId);
            }
            return;
        }

        // ★追加: 貢物の使者を選んだら、いくら払うか（金額指定）の画面を開きます！
        if (actionType === 'tribute_doer') {
            this.game.ui.openQuantitySelector('tribute_gold', selectedIds, null);
            return;
        }

        // ★追加: 諸勢力のコマンド用
        if (actionType === 'kunishu_goodwill_doer') {
            this.game.ui.openQuantitySelector('goodwill', selectedIds, targetId, { isKunishu: true, kunishuId: extraData.kunishuId });
            return;
        }
        if (actionType === 'kunishu_incorporate_doer') {
            const doer = this.game.getBusho(firstId);
            const kunishu = this.game.kunishuSystem.getKunishu(extraData.kunishuId);
            
            const myClan = this.game.clans.find(c => c.id === this.game.playerClanId);
            const myPrestige = myClan ? myClan.daimyoPrestige : 0;
            const myDaimyo = this.game.bushos.find(b => b.clan === this.game.playerClanId && b.isDaimyo);
            const leader = this.game.getBusho(kunishu.leaderId);

            let baseProb = 0;
            const targetSoldiers = kunishu.soldiers || 1;
            const ratio = myPrestige / (targetSoldiers * 12);
            baseProb = 70 * ratio; 
            
            const affinityDiff = (myDaimyo && leader) ? GameSystem.calcAffinityDiff(myDaimyo.affinity, leader.affinity) : 25;
            const affinityMod = (25 - affinityDiff) / 25 * 10;
            
            const diplomacyMod = (doer.diplomacy - 50) / 50 * 10;
            
            let totalProb = baseProb + affinityMod + diplomacyMod;
            totalProb = Math.max(0, Math.min(100, totalProb)) / 100; 

            this.showAdviceAndExecute('kunishu_incorporate', () => this.game.kunishuSystem.executeKunishuIncorporate(firstId, targetId, extraData.kunishuId), { trueProb: totalProb });
            return;
        }
        if (actionType === 'kunishu_subjugate_deploy') {
             const selectedBushos = selectedIds.map(id => this.game.getBusho(id));
             const leader = selectedBushos.find(b => b.isDaimyo || b.isCastellan);
             if (leader) {
                 const others = selectedIds.filter(id => id !== leader.id);
                 const sortedIds = [leader.id, ...others];
                 this.game.ui.openQuantitySelector('war_supplies', sortedIds, targetId, { isKunishu: true, kunishuId: extraData.kunishuId });
             } else {
                 this.game.ui.openBushoSelector('kunishu_war_general', targetId, { candidates: selectedIds, kunishuId: extraData.kunishuId });
             }
             return;
        }
        if (actionType === 'kunishu_war_general') {
            const leaderId = firstId;
            const others = extraData.candidates.filter(id => id !== leaderId);
            const sortedIds = [leaderId, ...others];
            this.game.ui.openQuantitySelector('war_supplies', sortedIds, targetId, { isKunishu: true, kunishuId: extraData.kunishuId });
            return;
        }

        if (actionType === 'interview') {
            const interviewer = this.game.getBusho(firstId);
            this.game.interviewSystem.showInterviewModal(interviewer);
            return;
        }
        if (actionType === 'interview_target') {
            const target = this.game.getBusho(firstId);
            const interviewer = extraData.interviewer;
            this.game.interviewSystem.executeInterviewTopic(interviewer, target);
            return;
        }

        if (actionType === 'war_deploy') {
             const selectedBushos = selectedIds.map(id => this.game.getBusho(id));
             const leader = selectedBushos.find(b => b.isDaimyo || b.isCastellan);
             if (leader) {
                 const others = selectedIds.filter(id => id !== leader.id);
                 const sortedIds = [leader.id, ...others];
                 this.game.ui.openQuantitySelector('war_supplies', sortedIds, targetId);
             } else {
                 this.game.ui.openBushoSelector('war_general', targetId, { candidates: selectedIds });
             }
             return;
        }
        if (actionType === 'war_general') {
            const leaderId = firstId;
            const others = extraData.candidates.filter(id => id !== leaderId);
            const sortedIds = [leaderId, ...others];
            this.game.ui.openQuantitySelector('war_supplies', sortedIds, targetId);
            return;
        }

        if (actionType === 'transport_deploy') {
            this.game.ui.openQuantitySelector('transport', selectedIds, targetId);
            return;
        }
        if (actionType === 'move_deploy') {
            this.executeWithEvent('move', () => this.executeCommand('move_deploy', selectedIds, targetId));
            return;
        }

        if (actionType === 'investigate_deploy') {
            const bushos = selectedIds.map(id => this.game.getBusho(id));
            const trueProb = GameSystem.getInvestigateProb(bushos);
            this.showAdviceAndExecute('investigate', () => this.executeInvestigate(selectedIds, targetId), { trueProb: trueProb });
            return;
        }
        
        if (actionType === 'incite_doer') {
             // ★専門部署である StrategySystem の計算魔法を呼びます！
             const trueProb = this.game.strategySystem.getInciteProb(firstId, targetId);
             this.showAdviceAndExecute('incite', () => this.game.strategySystem.executeIncite(firstId, targetId), { trueProb: trueProb });
             return;
        }

        if (actionType === 'sabotage_doer') {
             const trueProb = this.game.strategySystem.getSabotageProb(firstId, targetId);
             this.showAdviceAndExecute('sabotage', () => this.game.strategySystem.executeSabotage(firstId, targetId), { trueProb: trueProb });
             return;
        }

        if (actionType === 'charity') {
            this.showAdviceAndExecute('charity', () => this.executeCharity(selectedIds), { trueProb: 1.0 });
            return;
        }

        if (['draft'].includes(actionType)) {
            this.game.ui.openQuantitySelector(actionType, selectedIds, targetId);
            return;
        }
        
        const spec = COMMAND_SPECS[actionType];
        
        if (['appoint_gunshi'].includes(actionType)) {
            this.executeWithEvent('appoint_gunshi', () => this.executeAppointGunshi(firstId));
            return;
        }
        if (actionType === 'appoint_legion_leader') {
            this.game.ui.showAppointLegionCastleSelector(firstId, extraData.legionNo);
            return;
        }

        if (actionType === 'succession_target') {
            const bushoA = this.game.getBusho(firstId);
            this.game.ui.showDialog(`${bushoA.name} に家督を譲りますか？`, true, 
                () => {
                    this.executeWithEvent('succession', () => this.executeSuccession(firstId));
                },
                null,
                { okText: '家督を譲る', okClass: 'btn-danger', cancelText: 'やめる' }
            );
            return;
        }
        
        if (actionType === 'reward') {
            this.showAdviceAndExecute('reward', () => this.executeReward(selectedIds), { trueProb: 1.0 });
            return;
        }

        if (spec && ['farm', 'commerce', 'repair', 'training', 'soldier_charity', 'appoint', 'banish'].includes(actionType)) {
            if (spec.hasAdvice) {
                this.showAdviceAndExecute(actionType, () => this.executeCommand(actionType, selectedIds, targetId), { trueProb: 1.0 });
            } else {
                this.executeWithEvent(actionType, () => this.executeCommand(actionType, selectedIds, targetId));
            }
            return;
        }

        console.warn("Unhandled busho selection type:", actionType);
    }
   
   handleQuantitySelection(type, inputs, targetId, data, extraData = null) {
        const castle = this.game.getCurrentTurnCastle();
        
        if (type === 'draft') {
            // ui.jsの方でスライダーが「兵士数（soldiers）」などに直されることを想定して、臨機応変に受け取ります
            const inputField = inputs.soldiers || inputs.amount || inputs.gold;
            const val = parseInt(inputField.num.value);
            if (val <= 0) return;
            this.showAdviceAndExecute('draft', () => this.executeDraft(data, val), { val: val, trueProb: 1.0 });
        }
        else if (type === 'goodwill') {
            const val = parseInt(inputs.gold.num.value);
            if (val < 200) { this.game.ui.showDialog("金が足りません", false); return; }
            if (val > 1500) { this.game.ui.showDialog("贈れる金は最大1500までです", false); return; }
            
            if (extraData && extraData.isKunishu) {
                this.showAdviceAndExecute('kunishu_goodwill', () => this.game.kunishuSystem.executeKunishuGoodwill(data[0], extraData.kunishuId, val), { trueProb: 1.0 });
            } else {
                // ここでも合図だけ！
                const prob = this.game.diplomacyManager.getDiplomacyProb(data[0], targetId, 'goodwill');
                this.showAdviceAndExecute('goodwill', () => this.game.diplomacyManager.executeDiplomacy(data[0], targetId, 'goodwill', val), { trueProb: prob / 100 });
            }
        }
        else if (type === 'tribute_gold') {
            // ★追加：貢物の金額が決まったら、実行の魔法を呼び出します
            const val = parseInt(inputs.gold.num.value);
            if (val < 200) { this.game.ui.showDialog("金が足りません", false); return; }
            this.executeWithEvent('tribute', () => this.game.courtRankSystem.executeTribute(data[0], val));
        }
        else if (type === 'headhunt_gold') {
            const val = parseInt(inputs.gold.num.value);
            // ★専門部署である StrategySystem の計算魔法を呼びます！
            const trueProb = this.game.strategySystem.getHeadhuntProb(data[0], targetId, val);
            this.showAdviceAndExecute('headhunt', () => this.game.strategySystem.executeHeadhunt(data[0], targetId, val), { trueProb: trueProb });
        }
        else if (type === 'transport') {
            const vals = {
                gold: parseInt(inputs.gold.num.value),
                rice: parseInt(inputs.rice.num.value),
                soldiers: parseInt(inputs.soldiers.num.value),
                horses: inputs.horses ? parseInt(inputs.horses.num.value) : 0,
                guns: inputs.guns ? parseInt(inputs.guns.num.value) : 0
            };
            if (vals.gold === 0 && vals.rice === 0 && vals.soldiers === 0 && vals.horses === 0 && vals.guns === 0) return;
            this.executeWithEvent('transport', () => this.executeTransport(data, targetId, vals));
        }
        // ★ここから追加！ 米を買うときの受け取り窓口です
        else if (type === 'buy_rice') {
            const val = parseInt(inputs.amount.num.value);
            if (val <= 0) return;
            this.executeWithEvent(type, () => this.executeTrade('buy_rice', val));
        }
        else if (type === 'sell_rice') {
            const val = parseInt(inputs.amount.num.value);
            if (val <= 0) return;
            this.executeWithEvent(type, () => this.executeTrade('sell_rice', val));
        }
        else if (['buy_ammo', 'buy_horses', 'buy_guns'].includes(type)) {
            const val = parseInt(inputs.amount.num.value);
            if (val <= 0) return;
            this.executeWithEvent(type, () => this.executeTrade(type, val));
        }
        // ★修正: 出陣時に軍馬と鉄砲の数をスライダーから読み取って渡すようにしました
        else if (type === 'war_supplies') {
            const sVal = parseInt(inputs.soldiers.num.value);
            const rVal = parseInt(inputs.rice.num.value);
            const hVal = inputs.horses ? parseInt(inputs.horses.num.value) : 0;
            const gVal = inputs.guns ? parseInt(inputs.guns.num.value) : 0;
            if (sVal <= 0) { this.game.ui.showDialog("兵士0では出陣できません", false); return; }
            
            const targetCastle = this.game.getCastle(targetId);
            
            const srcProv = this.game.provinces.find(p => p.id === castle.provinceId);
            const tgtProv = this.game.provinces.find(p => p.id === targetCastle.provinceId);
            const isHeavySnow = (srcProv && srcProv.statusEffects && srcProv.statusEffects.includes('heavySnow')) || 
                                (tgtProv && tgtProv.statusEffects && tgtProv.statusEffects.includes('heavySnow'));

            const proceedWar = () => {
                this.checkReinforcementAndStartWar(castle, targetId, data.map(id => this.game.getBusho(id)), sVal, rVal, hVal, gVal, extraData);
            };

            if (isHeavySnow) {
                this.game.ui.showDialog("大雪の影響により、被害が出る場合があります。\nそれでも出陣しますか？", true, () => {
                    this.executeWithEvent('war', () => proceedWar());
                });
            } else {
                this.executeWithEvent('war', () => proceedWar());
            }
        }
        else if (type === 'war_repair') {
             const val = parseInt(inputs.soldiers.num.value);
             if (val <= 0) return;
             this.executeWithEvent('war_repair', () => this.game.warManager.execWarCmd('repair', val));
        }
    }

    async executeWithEvent(type, executeFunc, extraContext = {}) {
        if (this.game.eventManager) {
            await this.game.eventManager.processEvents('before_command', { commandType: type, ...extraContext });
        }
        await executeFunc();
        if (this.game.eventManager) {
            await this.game.eventManager.processEvents('after_command', { commandType: type, ...extraContext });
        }
    }

    showAdviceAndExecute(actionType, executeCallback, extraContext = {}) {
        const adviceAction = { type: actionType, ...extraContext };
        this.game.gunshiSystem.showCommandAdvice(adviceAction, () => {
            this.executeWithEvent(actionType, executeCallback, extraContext);
        });
    }

    executeCommand(type, bushoIds, targetId) {
        const castle = this.game.getCurrentTurnCastle(); 
        let totalVal = 0, cost = 0, count = 0, actionName = "";
        const spec = COMMAND_SPECS[type]; 

        // ★追加：参加武将をリストアップして派閥ボーナスの倍率を出します
        const execBushos = bushoIds.map(id => this.game.getBusho(id)).filter(b => b);
        const bonusRate = GameSystem.calcFactionBonusRate(execBushos);
        
        if (type === 'appoint' || type === 'appoint_gunshi') {
            const bushos = this.game.getBusho(bushoIds[0]);
            if (type === 'appoint') { 
                const old = this.game.getBusho(castle.castellanId); if(old) old.isCastellan = false; 
                castle.castellanId = bushos.id; bushos.isCastellan = true; 
                // ★追加：もし城主になった人が軍師だったら、軍師のお仕事を外します！
                if (bushos.isGunshi) {
                    bushos.isGunshi = false;
                }
                this.game.ui.showResultModal(`${bushos.name}を城主に任命しました`); 
            }
            if (type === 'appoint_gunshi') { 
                const oldGunshi = this.game.bushos.find(b => b.clan === this.game.playerClanId && b.isGunshi); if (oldGunshi) oldGunshi.isGunshi = false; 
                bushos.isGunshi = true; 
                this.game.ui.showResultModal(`${bushos.name}を軍師に任命しました`); 
            }
            this.game.ui.updatePanelHeader(); this.game.ui.renderCommandMenu(); 
            return;
        }

        if (type === 'banish') { 
            const busho = this.game.getBusho(bushoIds[0]);
            this.game.ui.showDialog(`本当に ${busho.name} を追放しますか？`, true, () => {
                
                // ★追加：追放される武将がいた場合、自勢力の他の武将全員にショックを与えます！
                // 同じ大名家で、大名と追放される本人を除いた全員を集めます
                const otherMembers = this.game.bushos.filter(b => 
                    b.clan === busho.clan && 
                    b.id !== busho.id &&
                    !b.isDaimyo &&
                    b.status === 'active'
                );

                const isLeader = busho.isFactionLeader;

                // 集めたメンバー全員に順番にショックを与えます
                otherMembers.forEach(member => {
                    // 同じ派閥の場合（追放される武将が派閥に属している場合のみ）
                    if (busho.factionId > 0 && member.factionId === busho.factionId) {
                        if (isLeader) {
                            // リーダーが追放された場合：承認欲求を50上げてから、忠誠度を10下げます
                            this.game.factionSystem.updateRecognition(member, 50);
                            member.loyalty = Math.max(0, member.loyalty - 10);
                        } else {
                            // ただのメンバーが追放された場合：承認欲求を25上げてから、忠誠度を3下げます
                            this.game.factionSystem.updateRecognition(member, 25);
                            member.loyalty = Math.max(0, member.loyalty - 3);
                        }
                    } else {
                        // 違う派閥、または無派閥の場合：承認欲求を5上げてから、忠誠度を1下げます
                        this.game.factionSystem.updateRecognition(member, 5);
                        member.loyalty = Math.max(0, member.loyalty - 1);
                    }
                });
                
                this.game.affiliationSystem.becomeRonin(busho, 'banish');

                this.game.ui.showResultModal(`${busho.name}を追放しました`);
                this.game.ui.updatePanelHeader(); 
                this.game.ui.renderCommandMenu(); 
            });
            return; 
        }

        bushoIds.forEach(bid => {
            const busho = this.game.getBusho(bid); if (!busho) return;
            
            if (type === 'farm') { 
                if (castle.gold >= spec.costGold) { 
                    const val = GameSystem.calcDevelopment(busho, bonusRate, true); castle.gold -= spec.costGold; 
                    const oldVal = castle.kokudaka;
                    castle.kokudaka = Math.min(castle.maxKokudaka, castle.kokudaka + val); 
                    const actualVal = castle.kokudaka - oldVal;
                    totalVal += actualVal; count++; actionName = "石高開発";
                    busho.achievementTotal += Math.floor(actualVal * 0.5); 
                    this.game.factionSystem.updateRecognition(busho, 10);
                }
            }
            else if (type === 'commerce') { 
                if (castle.gold >= spec.costGold) { 
                    const val = GameSystem.calcDevelopment(busho, bonusRate, true); castle.gold -= spec.costGold; 
                    const oldVal = castle.commerce;
                    castle.commerce = Math.min(castle.maxCommerce, castle.commerce + val); 
                    const actualVal = castle.commerce - oldVal;
                    totalVal += actualVal; count++; actionName = "鉱山開発";
                    busho.achievementTotal += Math.floor(actualVal * 0.5);
                    this.game.factionSystem.updateRecognition(busho, 10);
                }
            }
            else if (type === 'repair') { 
                if (castle.gold >= spec.costGold) { 
                    const val = GameSystem.calcRepair(busho, bonusRate, true); castle.gold -= spec.costGold; 
                    const oldVal = castle.defense;
                    castle.defense = Math.min(castle.maxDefense, castle.defense + val); 
                    const actualVal = castle.defense - oldVal;
                    totalVal += actualVal; count++; actionName = "城壁修復";
                    busho.achievementTotal += Math.floor(actualVal * 0.5);
                    this.game.factionSystem.updateRecognition(busho, 10);
                }
            }
            else if (type === 'training') { 
                if (castle.gold >= spec.costGold && castle.rice >= spec.costRice) {
                    castle.gold -= spec.costGold;  
                    castle.rice -= spec.costRice;  

                    // 「その城の兵士数 (castle.soldiers)」を渡して計算してもらいます
                    const val = GameSystem.calcTraining(busho, castle.soldiers, bonusRate, true); 
                    const maxTraining = window.WarParams.Military.MaxTraining || 100;
                    const oldVal = castle.training;
                    castle.training = Math.min(maxTraining, castle.training + val); 
                    const actualVal = castle.training - oldVal;
                    totalVal += actualVal; count++; actionName = "訓練";
                    busho.achievementTotal += Math.floor(actualVal * 0.5);
                    this.game.factionSystem.updateRecognition(busho, 10);
                }
            }
            else if (type === 'soldier_charity') { 
                if (castle.gold >= spec.costGold && castle.rice >= spec.costRice) {
                    castle.gold -= spec.costGold;  
                    castle.rice -= spec.costRice;  

                    // こちらも「その城の兵士数」を渡します
                    const val = GameSystem.calcSoldierCharity(busho, castle.soldiers, bonusRate, true); 
                    const maxMorale = window.WarParams.Military.MaxMorale || 100;
                    const oldVal = castle.morale;
                    castle.morale = Math.min(maxMorale, castle.morale + val); 
                    const actualVal = castle.morale - oldVal;
                    totalVal += actualVal; count++; actionName = "兵施し";
                    busho.achievementTotal += Math.floor(actualVal * 0.5);
                    this.game.factionSystem.updateRecognition(busho, 10);
                }
            }
            else if (type === 'move_deploy') { 
                this.game.factionSystem.handleMove(busho, castle.id, targetId); 
                
                this.game.affiliationSystem.moveCastle(busho, targetId);

                count++; actionName = "移動"; 
            }
            busho.isActionDone = true;
        });

        if (count > 0 && actionName !== "移動") { 
            let detail = "";
            if (actionName === "石高開発") detail = `(現在: ${castle.kokudaka}/${castle.maxKokudaka})`;
            if (actionName === "鉱山開発") detail = `(現在: ${castle.commerce}/${castle.maxCommerce})`;
            if (actionName === "城壁修復") detail = `(現在: ${castle.defense}/${castle.maxDefense})`;
            if (actionName === "訓練") {
                const maxTraining = window.WarParams.Military.MaxTraining || 100;
                detail = `(現在: ${castle.training}/${maxTraining})`;
            }
            if (actionName === "兵施し") {
                const maxMorale = window.WarParams.Military.MaxMorale || 100;
                detail = `(現在: ${castle.morale}/${maxMorale})`;
            }
            
            this.game.ui.showResultModal(`${count}名で${actionName}を行いました\n効果: +${totalVal} ${detail}`); 
        }
        else if (actionName === "移動") { const targetName = this.game.getCastle(targetId).name; this.game.ui.showResultModal(`${count}名が${targetName}へ移動しました`); }
        this.game.ui.updatePanelHeader(); this.game.ui.renderCommandMenu();
        this.game.ui.log(`${actionName}を実行 (効果:${totalVal})`);
    }

    executeInvestigate(bushoIds, targetId) {
        const bushos = bushoIds.map(id => this.game.getBusho(id));
        const target = this.game.getCastle(targetId);
        const result = GameSystem.calcInvestigate(bushos, target);
        let msg = "";
        if (result.success) {
            target.investigatedUntil = this.game.getCurrentTurnId() + 4; target.investigatedAccuracy = result.accuracy;
            msg = `潜入に成功しました！\n情報を入手しました\n(情報の精度: ${result.accuracy}%)`;
            bushos.forEach(b => {
                b.achievementTotal += Math.floor(b.intelligence * 0.2) + 10;
                this.game.factionSystem.updateRecognition(b, 20);
            });
        } else { 
            msg = `潜入に失敗しました……\n情報は得られませんでした`; 
            bushos.forEach(b => {
                b.achievementTotal += 5; 
                this.game.factionSystem.updateRecognition(b, 10);
            });
        }
        bushos.forEach(b => b.isActionDone = true);
        this.game.ui.showResultModal(msg); this.game.ui.updatePanelHeader(); this.game.ui.renderCommandMenu(); this.game.ui.renderMap();
        this.game.ui.log(`調査実行: ${target.name} (${result.success ? '成功' : '失敗'})`);
    }

    executeEmploy(doerId, targetId) { 
        const doer = this.game.getBusho(doerId); 
        const target = this.game.getBusho(targetId); 
        
        // ★追加: もし諸勢力の武将だったら登用はできません（引抜を使いましょう）
        if (target.belongKunishuId > 0) {
            this.game.ui.showDialog(`${target.name}は諸勢力に所属しているため登用できません。`, false);
            return;
        }

        const myPower = this.game.getClanTotalSoldiers(this.game.playerClanId); 
        const targetClanId = target.clan; 
        const targetPower = targetClanId === 0 ? 0 : this.game.getClanTotalSoldiers(targetClanId); 
        const success = GameSystem.calcEmploymentSuccess(doer, target, myPower, targetPower); 
        let msg = ""; 
        if (success) { 
            const currentC = this.game.getCurrentTurnCastle(); 
            
            this.game.affiliationSystem.joinClan(target, this.game.playerClanId, currentC.id);
            
            msg = `${target.name}の登用に成功しました！`;
            const maxStat = Math.max(target.strength, target.intelligence, target.leadership, target.charm, target.diplomacy);
            doer.achievementTotal += Math.floor(maxStat * 0.3);
            this.game.factionSystem.updateRecognition(doer, 20); 
        } else { 
            msg = `${target.name}は登用に応じませんでした……`; 
            doer.achievementTotal += 5; 
            this.game.factionSystem.updateRecognition(doer, 10); 
        } 
        doer.isActionDone = true; this.game.ui.showResultModal(msg); this.game.ui.renderCommandMenu(); 
    }
    
    executeReward(bushoIds) {
        const castle = this.game.getCurrentTurnCastle();
        const daimyo = this.game.bushos.find(b => b.id === this.game.clans.find(c => c.id === this.game.playerClanId).leaderId);
        const spec = COMMAND_SPECS['reward'];
        
        let count = 0;
        let totalEffect = 0;

        bushoIds.forEach(bid => {
            const target = this.game.getBusho(bid);
            if (!target) return;

            if (castle.gold < spec.costGold) return;

            castle.gold -= spec.costGold;
            
            // ★変更：費用を100にしても効果量は元(200)と同じにするため、計算には「200」を渡します
            const effect = GameSystem.calcRewardEffect(200, daimyo, target);

            this.game.factionSystem.updateRecognition(target, -effect * 2 - 5);

            // ★追加：忠誠度をランダムで1～3アップさせる
            const loyaltyUp = Math.floor(Math.random() * 3) + 1;
            target.loyalty = Math.min(100, target.loyalty + loyaltyUp);

            count++;
            totalEffect += effect;
        });

        if (count > 0) {
            const lastBusho = this.game.getBusho(bushoIds[bushoIds.length - 1]);
            // ★変更：メッセージに「忠誠が上がった」ことも書き足しました
            this.game.ui.showResultModal(`${count}名に褒美（金${count * spec.costGold}）を与えました`);
            this.game.ui.log(`${count}名に褒美を実行 (合計効果:${totalEffect})`);
        } else {
            this.game.ui.showDialog("金が足りないため、褒美を与えられませんでした。", false);
        }

        this.game.ui.updatePanelHeader();
        this.game.ui.renderCommandMenu();
    }
    
    executeTransport(bushoIds, targetId, vals) {
        const c = this.game.getCurrentTurnCastle(); const t = this.game.getCastle(targetId);
        
        // ★ここから追加：輸送先が上限を超えないか事前にチェックして、超えるならお断りします！
        if (t.gold + vals.gold > 99999) { this.game.ui.showDialog("輸送先の「金」が上限(99,999)を超えてしまうため、輸送できません。", false); return; }
        if (t.rice + vals.rice > 99999) { this.game.ui.showDialog("輸送先の「兵糧」が上限(99,999)を超えてしまうため、輸送できません。", false); return; }
        if (t.soldiers + vals.soldiers > 99999) { this.game.ui.showDialog("輸送先の「兵数」が上限(99,999)を超えてしまうため、輸送できません。", false); return; }
        if ((t.horses || 0) + vals.horses > 99999) { this.game.ui.showDialog("輸送先の「軍馬」が上限(99,999)を超えてしまうため、輸送できません。", false); return; }
        if ((t.guns || 0) + vals.guns > 99999) { this.game.ui.showDialog("輸送先の「鉄砲」が上限(99,999)を超えてしまうため、輸送できません。", false); return; }

        // ★修正: エラーの原因だった「訓練・士気の計算式」を直接計算するように直しました
        if(vals.soldiers > 0) { 
            const totalS = t.soldiers + vals.soldiers;
            if (totalS > 0) {
                t.training = Math.floor(((t.training * t.soldiers) + (c.training * vals.soldiers)) / totalS);
                t.morale = Math.floor(((t.morale * t.soldiers) + (c.morale * vals.soldiers)) / totalS);
            }
        }
        
        c.gold -= vals.gold; c.rice -= vals.rice; c.soldiers -= vals.soldiers; t.gold += vals.gold; t.rice += vals.rice; t.soldiers += vals.soldiers;
        c.horses = Math.max(0, (c.horses || 0) - vals.horses);
        c.guns = Math.max(0, (c.guns || 0) - vals.guns);
        t.horses = (t.horses || 0) + vals.horses;
        t.guns = (t.guns || 0) + vals.guns;
        
        // ここに追加します！もし輸送元（c）の兵士が0以下になったら、訓練と士気も0にします
        if (c.soldiers <= 0) {
            c.soldiers = 0;
            c.training = 0;
            c.morale = 0;
        }
        
        bushoIds.forEach(id => {
            const b = this.game.getBusho(id);
            this.game.factionSystem.handleMove(b, c.id, targetId); 
            
            this.game.affiliationSystem.moveCastle(b, targetId);
            
            b.isActionDone = true;
        });
        
        this.game.ui.showResultModal(`${this.game.getBusho(bushoIds[0]).name}が${t.name}へ物資を輸送しました`); this.game.ui.updatePanelHeader(); this.game.ui.renderCommandMenu();
    }
    
    executeAppointGunshi(bushoId) {
        const busho = this.game.getBusho(bushoId);
        const oldGunshi = this.game.bushos.find(b => b.clan === this.game.playerClanId && b.isGunshi);
        if (oldGunshi) oldGunshi.isGunshi = false;
        busho.isGunshi = true;
        // ★ここから追加！：軍師に任命された時に、この軍師専用の「秘密の番号（タネ）」を作ります！
        busho.gunshiSeed = Math.floor(Math.random() * 10000);
        this.game.ui.showResultModal(`${busho.name}を軍師に任命しました`);
        this.game.ui.updatePanelHeader();
        this.game.ui.renderCommandMenu();
    }

    executeAppointLegionLeader(bushoId, legionNo, castleId) {
        const busho = this.game.getBusho(bushoId);
        const castle = this.game.getCastle(castleId);
        if (!busho || !castle) return;

        this.game.affiliationSystem.moveCastle(busho, castleId);

        if (!this.game.legions) this.game.legions = [];
        let legion = this.game.legions.find(l => Number(l.clanId) === Number(this.game.playerClanId) && Number(l.legionNo) === legionNo);
        if (!legion) {
            const maxId = this.game.legions.length > 0 ? Math.max(...this.game.legions.map(l => Number(l.id) || 0)) : 0;
            const legionData = { id: maxId + 1, clanId: this.game.playerClanId, legionNo: legionNo };
            legion = typeof window.Legion === 'function' ? new window.Legion(legionData) : legionData;
            this.game.legions.push(legion);
        }
        legion.commanderId = busho.id;

        const oldCastellan = this.game.getBusho(castle.castellanId);
        if (oldCastellan) {
            oldCastellan.isCastellan = false;
        }
        castle.castellanId = busho.id;
        busho.isCastellan = true;
        busho.isCommander = true;

        castle.legionId = legionNo;

        const numberNames = ["", "第一席", "第二席", "第三席", "第四席", "第五席", "第六席", "第七席", "第八席"];
        const legionName = numberNames[legionNo] || `第${legionNo}席`;
        
        const displayMessage = `${busho.name} を「${legionName}」の国主に任命し、\n${castle.name} を本拠としました`;
        
        this.game.ui.showResultModal(displayMessage);
        this.game.ui.updatePanelHeader();
        this.game.ui.renderCommandMenu();
        this.game.ui.renderMap();
    }
    
    executeTrade(type, amount) {
        const castle = this.game.getCurrentTurnCastle(); 
        // ★ごっそり書き換え！：日本共通の相場ではなく、今いる国の相場を見に行きます！
        let rate = 1.0;
        if (castle && this.game.provinces) {
            const province = this.game.provinces.find(p => p.id === castle.provinceId);
            if (province && province.marketRate !== undefined) rate = province.marketRate;
        }
        
        if(type === 'buy_rice') {
            // ★修正：端数切り捨てだと無料で買える場合があるので、切り上げ（Math.ceil）にして最低1金はかかるようにします！
            const cost = Math.max(1, Math.ceil(amount * rate));
            if(castle.gold < cost) { this.game.ui.showDialog("資金不足", false); return; } 
            // ★追加: 買うと上限を超えるならストップ
            if(castle.rice + amount > 99999) { this.game.ui.showDialog("これ以上兵糧は買えません", false); return; }
            if(amount > (castle.tradeLimit || 0)) { this.game.ui.showDialog("取引上限を超えています", false); return; }
            castle.gold -= cost; castle.rice += amount; 
            castle.tradeLimit -= amount;
            this.game.ui.showResultModal(`兵糧${amount}を購入しました\n(金-${cost})`); 
        } else if (type === 'sell_rice') { 
            if(castle.rice < amount) { this.game.ui.showDialog("兵糧不足", false); return; } 
            const gain = Math.floor(amount * rate); 
            // ★追加: 売ると金が上限を超えるならストップ
            if(castle.gold + gain > 99999) { this.game.ui.showDialog("これ以上兵糧は売れません", false); return; }
            if(amount > (castle.tradeLimit || 0)) { this.game.ui.showDialog("取引上限を超えています", false); return; }
            castle.rice -= amount; castle.gold += gain; 
            castle.tradeLimit -= amount;
            this.game.ui.showResultModal(`兵糧${amount}を売却しました\n(金+${gain})`); 
        } else if (type === 'buy_ammo') {
            // ★相場を消して、固定金額にします
            const price = parseInt(window.MainParams.Economy.PriceAmmo, 10) || 1;
            const cost = price * amount;
            if(castle.gold < cost) { this.game.ui.showDialog("資金不足", false); return; } 
            // ★追加: 矢弾のストッパー
            if((castle.ammo || 0) + amount > 99999) { this.game.ui.showDialog("これ以上矢弾は買えません", false); return; }
            castle.gold -= cost; castle.ammo = (castle.ammo || 0) + amount; 
            this.game.ui.showResultModal(`矢弾${amount}を購入しました\n(金-${cost})`); 
        } else if (type === 'buy_horses') {
            const daimyo = this.game.bushos.find(b => b.clan === castle.ownerClan && b.isDaimyo);
            const castellan = this.game.getBusho(castle.castellanId);
            const cost = GameSystem.calcBuyHorseCost(amount, daimyo, castellan);
            if(castle.gold < cost) { this.game.ui.showDialog(`資金不足です。(必要: ${cost}金)`, false); return; } 
            // ★追加: 軍馬のストッパー
            if((castle.horses || 0) + amount > 99999) { this.game.ui.showDialog("これ以上軍馬は買えません", false); return; }
            castle.gold -= cost; castle.horses = (castle.horses || 0) + amount; 
            this.game.ui.showResultModal(`軍馬${amount}を購入しました\n(金-${cost})`); 
        } else if (type === 'buy_guns') {
            const daimyo = this.game.bushos.find(b => b.clan === castle.ownerClan && b.isDaimyo);
            const castellan = this.game.getBusho(castle.castellanId);
            const cost = GameSystem.calcBuyGunCost(amount, daimyo, castellan);
            if(castle.gold < cost) { this.game.ui.showDialog(`資金不足です。(必要: ${cost}金)`, false); return; } 
            // ★追加: 鉄砲のストッパー
            if((castle.guns || 0) + amount > 99999) { this.game.ui.showDialog("これ以上鉄砲は買えません", false); return; }
            castle.gold -= cost; castle.guns = (castle.guns || 0) + amount; 
            this.game.ui.showResultModal(`鉄砲${amount}を購入しました\n(金-${cost})`); 
        }
        
        this.game.ui.updatePanelHeader(); 
        this.game.ui.renderCommandMenu();
    }

    executeDraft(bushoIds, soldiers) { 
        const castle = this.game.getCurrentTurnCastle(); 
        const busho = this.game.getBusho(bushoIds[0]); 
        
        // 選ばれた兵士数を集めるために必要な「お金」を計算します
        const costGold = GameSystem.calcDraftCost(soldiers, busho, castle.peoplesLoyalty);
        
        if(castle.gold < costGold) { this.game.ui.showDialog(`資金不足です。(必要: ${costGold}金)`, false); return; } 
        
        // ★ 人口以上の徴兵ができないようにストップをかけます
        if (castle.population < soldiers) { 
            this.game.ui.showDialog(`人口が足りません。(現在の人口: ${castle.population}人)`, false); 
            return; 
        }

        if (castle.soldiers + soldiers > 99999) {
            this.game.ui.showDialog(`兵数が上限(99,999)を超えるため、これ以上徴兵できません。\n(現在の兵数: ${castle.soldiers})`, false);
            return;
        }
        
        // 実行確定：経験値を加算します
        GameSystem.calcDraftCost(soldiers, busho, castle.peoplesLoyalty, true);

        // ★ 徴兵の割合を計算して、民忠と人口を減らす処理を行います
        const draftRatio = soldiers / castle.population;          // 徴兵した割合
        const penaltyRatio = draftRatio * 2;                      // ペナルティはその2倍
        const loyaltyPenalty = Math.floor(castle.peoplesLoyalty * penaltyRatio); // 今の民忠から減らす量
        
        castle.peoplesLoyalty = Math.max(0, castle.peoplesLoyalty - loyaltyPenalty); // 0未満にはならないようにします
        castle.population -= soldiers;                            // 徴兵した分だけ人口を減らします

        castle.gold -= costGold;
        
        // 新しく入ってきた兵士たちは、まだ訓練も受けていないので基本の低い数字になります
        const newMorale = 30; 
        const newTraining = 30; 
        
        if (castle.soldiers + soldiers > 0) {
            castle.training = Math.floor(((castle.training * castle.soldiers) + (newTraining * soldiers)) / (castle.soldiers + soldiers));
            castle.morale = Math.floor(((castle.morale * castle.soldiers) + (newMorale * soldiers)) / (castle.soldiers + soldiers));
        }
        castle.soldiers += soldiers; 
        busho.isActionDone = true; 
        
        busho.achievementTotal += 5;
        this.game.factionSystem.updateRecognition(busho, 10);
        
        // ★ 結果のメッセージに、人口と民忠が減ったことも書き足しておきます
        this.game.ui.showResultModal(`${busho.name}が徴兵を行いました\n兵士+${soldiers}\n(人口-${soldiers} / 民忠-${loyaltyPenalty})`); 
        this.game.ui.updatePanelHeader(); this.game.ui.renderCommandMenu();
    }
    
    executeCharity(bushoIds) { 
        const castle = this.game.getCurrentTurnCastle(); 
        const spec = COMMAND_SPECS['charity']; 
        
        const totalCostRice = spec.costRice * bushoIds.length;
        
        if (castle.rice < totalCostRice) { 
            this.game.ui.showDialog("物資不足", false); 
            return; 
        } 
        
        castle.rice -= totalCostRice; 
       
        let totalVal = 0;
        let count = 0;

        // ★追加：参加武将をリストアップして派閥ボーナスの倍率を出します
        const execBushos = bushoIds.map(id => this.game.getBusho(id)).filter(b => b);
        const bonusRate = GameSystem.calcFactionBonusRate(execBushos);

        bushoIds.forEach(bid => {
            const busho = this.game.getBusho(bid);
            if (!busho) return;

            const val = GameSystem.calcCharity(busho, bonusRate, true); 

            totalVal += val;
            count++;

            busho.achievementTotal += Math.floor(val * 0.5);
            this.game.factionSystem.updateRecognition(busho, 15);
            busho.isActionDone = true; 
        });

        const maxLoyalty = window.MainParams.Economy.MaxLoyalty || 100;
        const oldLoyalty = castle.peoplesLoyalty;
        castle.peoplesLoyalty = Math.min(maxLoyalty, castle.peoplesLoyalty + totalVal); 
        const actualIncrease = castle.peoplesLoyalty - oldLoyalty;
        
        this.game.ui.showResultModal(`${count}名で施しを行いました\n民忠+${actualIncrease}`); 
        this.game.ui.updatePanelHeader(); 
        this.game.ui.renderCommandMenu();
        this.game.ui.log(`${count}名で施しを実行 (効果:${actualIncrease})`);
    }

    enterMapSelection(mode) {
        this.game.lastMenuState = this.game.ui.menuState;
        this.game.selectionMode = mode;
        this.game.validTargets = []; 
        
        this.game.validTargets = this.getValidTargets(mode);
        
        this.game.ui.renderMap();
        this.game.ui.renderSelectionModeMenu(); // ★ マップを描くのと同時にメニューも「戻る」だけにします
        // this.game.ui.log(this.getSelectionGuideMessage());
    }

    getSelectionGuideMessage() {
        switch(this.game.selectionMode) {
            case 'war': return "攻撃目標を選択してください";
            case 'kunishu_subjugate': return "攻撃目標となる諸勢力がいる城を選択してください";
            case 'move': return "移動先を選択してください";
            case 'transport': return "輸送先を選択してください";
            case 'investigate': return "調査対象の城を選択してください";
            case 'incite': return "民心撹乱を行う城を選択してください";
            case 'sabotage': return "破壊工作を行う城を選択してください";
            case 'rumor': return "離間計対象の居城を選択してください";
            case 'headhunt': case 'headhunt_select_castle': return "引抜対象の居城を選択してください";
            case 'goodwill': return "親善を行う相手を選択してください";
            case 'alliance': return "同盟を行う相手を選択してください";
            case 'dominate': return "降伏勧告を行う相手を選択してください";
            case 'subordinate': return "従属願を行う相手を選択してください";
            case 'vassalage': return "臣従願を行う相手を選択してください";
            case 'kunishu_goodwill': return "親善を行う諸勢力がいる城を選択してください";
            case 'kunishu_incorporate': return "取込を行う諸勢力がいる城を選択してください";
            case 'break_alliance': return "断交する相手を選択してください";
            case 'court_truce': return "朝廷を介して和睦を行う相手を選択してください";
            case 'marriage': return "婚姻同盟を行う相手を選択してください";
            case 'atk_self_reinforcement': return "援軍を出陣させる城を選択してください";
            case 'atk_ally_reinforcement': return "援軍を要請する城を選択してください";
            case 'def_self_reinforcement': return "援軍を出陣させる城を選択してください";
            case 'def_ally_reinforcement': return "援軍を要請する城を選択してください";
            default: return "対象を選択してください";
        }
    }
    
    resolveMapSelection(targetCastle) {
        // ★追加：比較する前に、IDをすべて「数字」に揃えてあげます！
        const targetId = Number(targetCastle.id);
        const validIds = this.game.validTargets.map(id => Number(id));
        
        if (!validIds.includes(targetId)) return;
        
        const mode = this.game.selectionMode;
        
        // ==========================================
        // ★援軍要請のマップ選択時の処理
        if (['atk_self_reinforcement', 'atk_ally_reinforcement', 'def_self_reinforcement', 'def_ally_reinforcement'].includes(mode)) {
            const temp = this.game.tempReinfData;
            this.game.tempReinfData = null; // 使い終わったら消す
            this.game.ui.cancelMapSelection(true); 

            const backToMap = () => {
                // ★追加：もう一度マップに戻る時は、消してしまったデータを戻してあげます
                this.game.tempReinfData = temp;
                
                if (mode === 'atk_self_reinforcement') {
                    this.game.ui.showSelfReinforcementSelector(temp.candidates, temp.atkCastle, temp.targetCastle, temp.onComplete);
                } else if (mode === 'atk_ally_reinforcement') {
                    this.game.ui.showReinforcementSelector(temp.candidates, temp.atkCastle, temp.targetCastle, temp.atkBushos, temp.sVal, temp.rVal, temp.hVal, temp.gVal, temp.selfReinfData);
                } else if (mode === 'def_self_reinforcement') {
                    this.game.ui.showDefSelfReinforcementSelector(temp.candidates, temp.defCastle, temp.onComplete);
                } else if (mode === 'def_ally_reinforcement') {
                    this.game.ui.showDefReinforcementSelector(temp.candidates, temp.defCastle, temp.selfReinfData, temp.onComplete);
                }
            };
            
            // ★追加: 他大名か諸勢力かを選ぶ処理（自軍援軍の時はスルーします）
            if (mode === 'atk_ally_reinforcement' || mode === 'def_ally_reinforcement') {
                const myClanId = (mode === 'atk_ally_reinforcement') ? temp.atkCastle.ownerClan : temp.defCastle.ownerClan;
                const enemyClanId = (mode === 'atk_ally_reinforcement') ? temp.targetCastle.ownerClan : this.game.warManager.state.attacker.ownerClan;
                const isDefending = (mode === 'def_ally_reinforcement');
                
                const startCastle = (mode === 'atk_ally_reinforcement') ? temp.atkCastle : temp.defCastle;
                // ★修正：共通の魔法を使って、繋がっている領土をサクッと取得します！
                const connectedCastles = this.getConnectedCastles(startCastle, myClanId);

                // ★修正：条件のチェックをすべて「外交の専門部署」に任せます！
                // 【原因】ここに渡す情報が1つ抜けていてズレてしまっていました！
                const allAvailableForces = this.game.diplomacyManager.findAvailableReinforcements(
                    false, isDefending, startCastle.id, temp.targetCastle || temp.defCastle, myClanId, enemyClanId, connectedCastles
                );

                // 返ってきたリストの中から、プレイヤーがクリックした城（targetCastle）にいる勢力だけを絞り込みます
                const forces = allAvailableForces.filter(f => f.castle.id === targetCastle.id).map(f => f.force);

                if (forces.length === 0) {
                    this.game.ui.showDialog("この城には援軍を出せる勢力がいません。", false, backToMap);
                    return;
                }

                const proceedWithForce = (force) => {
                    targetCastle.selectedForce = force; // 目印のシールを貼ります！
                    if (mode === 'atk_ally_reinforcement') {
                        this.game.ui.showReinforcementGoldSelector(targetCastle, temp.atkCastle, temp.targetCastle, temp.atkBushos, temp.sVal, temp.rVal, temp.hVal, temp.gVal, temp.selfReinfData, backToMap);
                    } else {
                        this.game.ui.showDefReinforcementGoldSelector(targetCastle, temp.defCastle, temp.onComplete, backToMap);
                    }
                };

                // ★修正：諸勢力がいる場合は必ずリストを出し、大名家しかいない場合はリストを飛ばします！
                const hasKunishu = forces.some(f => f.isKunishu);
                if (!hasKunishu && forces.length === 1) {
                    proceedWithForce(forces[0]);
                } else {
                    this.game.ui.showForceSelector(forces, proceedWithForce, backToMap);
                }
                return;
            }

            // 自軍援軍の時はそのまま進む
            if (mode === 'atk_self_reinforcement') {
                this._promptPlayerAtkSelfReinforcement(targetCastle, temp.atkCastle, temp.targetCastle, temp.onComplete, backToMap);
            } else if (mode === 'def_self_reinforcement') {
                // ★修正：warManagerではなく、command_system内の魔法を直接呼び出します！
                this._promptPlayerDefSelfReinforcement(targetCastle, temp.defCastle, temp.onComplete, backToMap);
            }
            return;
        }
        // ==========================================
        
        this.game.ui.cancelMapSelection(); 

        const onBackToMap = () => {
            this.enterMapSelection(mode);
        };

        // ★変更: 諸勢力のコマンドなら、どの諸勢力を対象にするかを選びます
        if (['kunishu_subjugate', 'kunishu_goodwill', 'kunishu_incorporate'].includes(mode)) {
            let kunishus = this.game.kunishuSystem.getKunishusInCastle(targetCastle.id);

            // ★追加：取込の場合はさらに条件で絞り込みます
            if (mode === 'kunishu_incorporate') {
                const myClanId = this.game.playerClanId;
                const myClan = this.game.clans.find(c => c.id === myClanId);
                const myPrestige = myClan ? myClan.daimyoPrestige : 0;
                
                kunishus = kunishus.filter(k => {
                    if (k.ideology === '宗教') return false;
                    if (k.getRelation(myClanId) < 95) return false;
                    if (k.soldiers > myPrestige / 2) return false;
                    return true;
                });
            }

            if (kunishus.length === 0) {
                this.game.ui.showDialog("この城には行動可能な諸勢力がいません。", false);
                return;
            }

            // 選択したあとの処理をまとめる
            const proceedKunishuCommand = (selectedKunishuId) => {
                if (mode === 'kunishu_goodwill') {
                    this.game.ui.openBushoSelector('kunishu_goodwill_doer', targetCastle.id, { kunishuId: selectedKunishuId }, onBackToMap);
                } else if (mode === 'kunishu_subjugate') {
                    this.game.ui.openBushoSelector('kunishu_subjugate_deploy', targetCastle.id, { kunishuId: selectedKunishuId }, onBackToMap);
                } else if (mode === 'kunishu_incorporate') {
                    this.game.ui.openBushoSelector('kunishu_incorporate_doer', targetCastle.id, { kunishuId: selectedKunishuId }, onBackToMap);
                }
            };
            
            // ★修正: リスト側の機能に合わせて、引数に targetCastle を追加し、呼び出し元を ui.info に繋ぎ直しました！
            if (this.game.ui.info && typeof this.game.ui.info.showKunishuSelector === 'function') {
                this.game.ui.info.showKunishuSelector(kunishus, targetCastle, proceedKunishuCommand, onBackToMap);
            } else {
                this.game.ui.showKunishuSelector(kunishus, targetCastle, proceedKunishuCommand, onBackToMap);
            }
            return; // 諸勢力コマンドの場合はここで終了
        }

        if (mode === 'war') {
            this.game.ui.openBushoSelector('war_deploy', targetCastle.id, null, onBackToMap);
        } else if (mode === 'move') {
            this.game.ui.openBushoSelector('move_deploy', targetCastle.id, null, onBackToMap);
        } else if (mode === 'transport') {
            this.game.ui.openBushoSelector('transport_deploy', targetCastle.id, null, onBackToMap);
        } else if (mode === 'investigate') {
            this.game.ui.openBushoSelector('investigate_deploy', targetCastle.id, null, onBackToMap);
        } else if (mode === 'incite') {
            this.game.ui.openBushoSelector('incite_doer', targetCastle.id, null, onBackToMap);
        } else if (mode === 'sabotage') {
            this.game.ui.openBushoSelector('sabotage_doer', targetCastle.id, null, onBackToMap);
        } else if (mode === 'rumor') {
            this.game.ui.openBushoSelector('rumor_target_busho', targetCastle.id, null, onBackToMap);
        } else if (mode === 'headhunt' || mode === 'headhunt_select_castle') {
            this.game.ui.openBushoSelector('headhunt_target', targetCastle.id, null, onBackToMap);
        } else if (mode === 'goodwill') {
            this.game.ui.openBushoSelector('diplomacy_doer', targetCastle.id, { subAction: 'goodwill' }, onBackToMap);
        } else if (mode === 'alliance') {
            this.game.ui.openBushoSelector('diplomacy_doer', targetCastle.id, { subAction: 'alliance' }, onBackToMap);
        } else if (mode === 'break_alliance') {
            this.game.ui.openBushoSelector('diplomacy_doer', targetCastle.id, { subAction: 'break_alliance' }, onBackToMap);
        } else if (mode === 'subordinate') {
            this.game.ui.openBushoSelector('diplomacy_doer', targetCastle.id, { subAction: 'subordinate' }, onBackToMap);
        } else if (mode === 'vassalage') {
            this.game.ui.openBushoSelector('diplomacy_doer', targetCastle.id, { subAction: 'vassalage' }, onBackToMap);
        } else if (mode === 'dominate') {
            this.game.ui.openBushoSelector('diplomacy_doer', targetCastle.id, { subAction: 'dominate' }, onBackToMap);
        } else if (mode === 'court_truce') {
            this.game.ui.openBushoSelector('diplomacy_doer', targetCastle.id, { subAction: 'court_truce' }, onBackToMap);
        } else if (mode === 'marriage') {
            this.game.ui.openBushoSelector('diplomacy_doer', targetCastle.id, { subAction: 'marriage' }, onBackToMap);
        }
    }
    
    // ★ここから下全部、援軍を探してお願いする新しい機能です！
    checkReinforcementAndStartWar(atkCastle, targetCastleId, atkBushos, sVal, rVal, hVal, gVal, extraData = null) {
        const myClanId = atkCastle.ownerClan;
        let targetCastle = this.game.getCastle(targetCastleId);
        
        // ★追加：諸勢力の場合はダミーのターゲットオブジェクトを作る
        if (extraData && extraData.isKunishu) {
            const kunishu = this.game.kunishuSystem.getKunishu(extraData.kunishuId);
            const tgtProv = this.game.provinces.find(p => p.id === targetCastle.provinceId);
            const provName = tgtProv ? tgtProv.province : "不明な国";
            targetCastle = Object.assign({}, targetCastle, {
                name: `${provName} ${kunishu.getName(this.game)}`,
                isKunishu: true,
                kunishuId: kunishu.id,
                soldiers: kunishu.soldiers,
                rice: kunishu.soldiers * 2, // 無から湧く兵糧
                horses: kunishu.horses || 0,
                guns: kunishu.guns || 0,
                defense: kunishu.defense,
                training: kunishu.training,
                morale: kunishu.morale,
                ownerClan: -1 // ★ここを書き足し！諸勢力の陣地なので、お城の持ち主を一時的に「無所属（-1）」にします！
            });
            this.game.warManager.state = this.game.warManager.state || {};
            this.game.warManager.state.isKunishuSubjugation = true; 
        } else {
            this.game.warManager.state = this.game.warManager.state || {};
            this.game.warManager.state.isKunishuSubjugation = false;
        }
        
        const pid = this.game.playerClanId;
        
        // ★修正：共通の魔法を使って、繋がっている領土をサクッと取得します！
        const connectedCastles = this.getConnectedCastles(atkCastle, myClanId);
        
        // ★修正：条件のチェックをすべて「外交の専門部署」に任せます！
        const selfCandidates = this.game.diplomacyManager.findAvailableReinforcements(
            true, false, atkCastle.id, targetCastle, myClanId, targetCastle.ownerClan, connectedCastles
        );

        // ★追加：兵数や武将が変わるので、最新のものを引数で受け取るようにしました
        const proceedToAlly = (selfReinfData, currentAtkBushos = atkBushos, currentSVal = sVal) => {
            // ★修正：こちらも他勢力の条件チェックを「外交の専門部署」に一任します！
            const allyForceCandidates = this.game.diplomacyManager.findAvailableReinforcements(
                false, false, atkCastle.id, targetCastle, myClanId, targetCastle.ownerClan, connectedCastles
            );

            if (allyForceCandidates.length === 0) {
                this.game.warManager.startWar(atkCastle, targetCastle, currentAtkBushos, currentSVal, rVal, hVal, gVal, null, selfReinfData);
                return;
            }

            const allyCastles = [...new Set(allyForceCandidates.map(fc => fc.castle))];
            
            if (myClanId === pid && !atkCastle.isDelegated) {
                this.game.ui.showDialog("他勢力に援軍を要請しますか？", true, 
                    () => {
                        this.game.ui.showReinforcementSelector(allyCastles, atkCastle, targetCastle, currentAtkBushos, currentSVal, rVal, hVal, gVal, selfReinfData);
                    },
                    () => {
                        this.game.warManager.startWar(atkCastle, targetCastle, currentAtkBushos, currentSVal, rVal, hVal, gVal, null, selfReinfData);
                    }
                );
            } else {
                allyForceCandidates.sort((a,b) => b.force.soldiers - a.force.soldiers);
                const best = allyForceCandidates[0];
                best.castle.selectedForce = best.force; 

                // ★親善と同じように、兵力差で持参金を計算する魔法です！
                const myPower = this.game.getClanTotalSoldiers(myClanId) || 1;
                const helperPower = best.force.isKunishu ? best.force.soldiers : (this.game.getClanTotalSoldiers(best.force.id) || 1);
                const ratio = helperPower / Math.max(1, myPower);
                
                let reinfGold = 300;
                if (ratio >= 3.0) {
                    reinfGold = 1000;
                } else if (ratio > 1.5) {
                    reinfGold = 300 + ((ratio - 1.5) / 1.5) * 700;
                }
                reinfGold = Math.floor(reinfGold / 100) * 100;
                
                // 足りなければお城の全額にします
                if (reinfGold > atkCastle.gold) {
                    reinfGold = atkCastle.gold;
                }

                // ★ただし、自分が相手を「支配」しているなら強制参加なので、持参金は０にします！
                if (!best.force.isKunishu) {
                    const rel = this.game.getRelation(myClanId, best.force.id);
                    if (rel && rel.status === '支配') {
                        reinfGold = 0;
                    }
                }

                this.executeReinforcementRequest(reinfGold, best.castle, atkCastle, targetCastle, currentAtkBushos, currentSVal, rVal, hVal, gVal, selfReinfData);
            }
        };

        const askConfirmAndProceedToAlly = (selfReinfData) => {
            if (myClanId === pid && !atkCastle.isDelegated) {
                const confirmMsg = targetCastle.isKunishu ? `${targetCastle.name} を鎮圧しますか？\n今月の命令は終了となります` : `${targetCastle.name}に攻め込みますか？\n今月の命令は終了となります`;
                this.game.ui.showDialog(confirmMsg, true, 
                    async () => {
                        proceedToAlly(selfReinfData, atkBushos, sVal);
                    },
                    () => {
                        // キャンセルした時
                        if (selfReinfData) {
                            const hc = selfReinfData.castle;
                            hc.soldiers += selfReinfData.soldiers;
                            hc.rice += selfReinfData.rice;
                            hc.horses = (hc.horses || 0) + selfReinfData.horses;
                            hc.guns = (hc.guns || 0) + selfReinfData.guns;
                            selfReinfData.bushos.forEach(b => b.isActionDone = false);
                        }
                        this.game.ui.cancelMapSelection();
                        this.game.ui.scrollToActiveCastle(atkCastle);
                    },
                    { okText: '出陣する', okClass: 'btn-danger', cancelText: 'やめる' }
                );
            } else {
                proceedToAlly(selfReinfData, atkBushos, sVal);
            }
        };

        if (selfCandidates.length === 0) {
            askConfirmAndProceedToAlly(null);
        } else {
            if (myClanId === pid && !atkCastle.isDelegated) {
                this.game.ui.showDialog("他の城から援軍を出しますか？", true, 
                    () => {
                        this.game.ui.showSelfReinforcementSelector(selfCandidates, atkCastle, targetCastle, askConfirmAndProceedToAlly);
                    },
                    () => {
                        askConfirmAndProceedToAlly(null);
                    }
                );
            } else {
                selfCandidates.sort((a,b) => b.soldiers - a.soldiers);
                this.executeSelfReinforcementAuto(selfCandidates[0], atkCastle, targetCastle, askConfirmAndProceedToAlly);
            }
        }
    }
    
    executeSelfReinforcementAuto(helperCastle, atkCastle, targetCastle, onComplete) {
        const myClanId = helperCastle.ownerClan;
        
        let reinfSoldiers = Math.floor(helperCastle.soldiers * 0.5);
        if (reinfSoldiers < 500) reinfSoldiers = 500;
        if (reinfSoldiers > helperCastle.soldiers) reinfSoldiers = helperCastle.soldiers;
        
        const availableBushos = this.game.getCastleBushos(helperCastle.id).filter(b =>
            b.clan === helperCastle.ownerClan && b.status === 'active'
        ).sort((a,b) => b.strength - a.strength);

        let bushoCount = 1;
        if (reinfSoldiers >= 1500) bushoCount = 2;
        if (reinfSoldiers >= 2500) bushoCount = 3;
        if (bushoCount > availableBushos.length) bushoCount = availableBushos.length;

        const reinfBushos = availableBushos.slice(0, bushoCount);
        const reinfRice = reinfSoldiers; 
        const reinfHorses = (helperCastle.horses || 0) < reinfSoldiers * 0.2 ? 0 : Math.min(helperCastle.horses || 0, Math.floor(reinfSoldiers * 0.5)); 
        const reinfGuns = (helperCastle.guns || 0) < reinfSoldiers * 0.2 ? 0 : Math.min(helperCastle.guns || 0, Math.floor(reinfSoldiers * 0.5));

        helperCastle.soldiers = Math.max(0, helperCastle.soldiers - reinfSoldiers);
        helperCastle.rice = Math.max(0, helperCastle.rice - reinfRice);
        helperCastle.horses = Math.max(0, (helperCastle.horses || 0) - reinfHorses);
        helperCastle.guns = Math.max(0, (helperCastle.guns || 0) - reinfGuns);

        const selfReinfData = {
            castle: helperCastle, bushos: reinfBushos, soldiers: reinfSoldiers,
            rice: reinfRice, horses: reinfHorses, guns: reinfGuns, isSelf: true,
            morale: helperCastle.morale || 50, training: helperCastle.training || 50
        };
        
        // ★修正：「参戦しました」のメッセージは攻め込んだ後に war_effort.js で出すので、ここでは静かに次へ進みます！
        onComplete(selfReinfData);
    }

    // ★ 引数の最後に「backToMap」を追加
    _promptPlayerAtkSelfReinforcement(helperCastle, atkCastle, targetCastle, onComplete, backToMap) {
        const promptBusho = () => {
            this.game.ui.openBushoSelector('atk_self_reinf_deploy', helperCastle.id, {
                onConfirm: (selectedIds) => {
                    // ★追加：大雪の判定に使うために「targetCastle」を渡してあげます
                    this.handleBushoSelectionForSelfReinf(helperCastle.id, selectedIds, targetCastle, onComplete, promptBusho, backToMap);
                },
                onCancel: () => {
                    // ★ 変更：キャンセルした時は、完全にやめるのではなく城選択マップに戻ります！
                    if (backToMap) backToMap();
                    else onComplete(null);
                }
            });
        };
        promptBusho();
    }

    handleBushoSelectionForSelfReinf(helperCastleId, selectedIds, targetCastle, onComplete, promptBusho) {
        const helperCastle = this.game.getCastle(helperCastleId);
        const reinfBushos = selectedIds.map(id => this.game.getBusho(id));
        this.game.ui.openQuantitySelector('atk_self_reinf_supplies', [helperCastle], null, {
            onConfirm: (inputs) => {
                const inputData = inputs[helperCastle.id] || inputs;
                const reinfSoldiers = inputData.soldiers ? parseInt(inputData.soldiers.num.value) : 500;
                const reinfRice = inputData.rice ? parseInt(inputData.rice.num.value) : 500;
                const reinfHorses = inputData.horses ? parseInt(inputData.horses.num.value) : 0;
                const reinfGuns = inputData.guns ? parseInt(inputData.guns.num.value) : 0;

                // ★被害の計算はメイン軍の決定後（後回し）にするため、ここではデータだけ作って進みます！
                helperCastle.soldiers = Math.max(0, helperCastle.soldiers - reinfSoldiers);
                helperCastle.rice = Math.max(0, helperCastle.rice - reinfRice);
                helperCastle.horses = Math.max(0, (helperCastle.horses || 0) - reinfHorses);
                helperCastle.guns = Math.max(0, (helperCastle.guns || 0) - reinfGuns);

                const selfReinfData = {
                    castle: helperCastle, bushos: reinfBushos, soldiers: reinfSoldiers,
                    rice: reinfRice, horses: reinfHorses, guns: reinfGuns, isSelf: true,
                    morale: helperCastle.morale || 50, training: helperCastle.training || 50
                };
                
                onComplete(selfReinfData);
            },
            onCancel: promptBusho
        });
    }
    
    // ★守備側の自軍援軍を選ぶための魔法！
    _promptPlayerDefSelfReinforcement(helperCastle, defCastle, onComplete, backToMap) {
        const promptBusho = () => {
            this.game.ui.openBushoSelector('def_self_reinf_deploy', helperCastle.id, {
                onConfirm: (selectedIds) => {
                    // ★追加：大雪の判定に使うために「defCastle」を渡してあげます
                    this.handleBushoSelectionForDefSelfReinf(helperCastle.id, selectedIds, defCastle, onComplete, promptBusho);
                },
                onCancel: () => {
                    if (backToMap) backToMap();
                    else onComplete(null);
                }
            });
        };
        promptBusho();
    }

    handleBushoSelectionForDefSelfReinf(helperCastleId, selectedIds, defCastle, onComplete, promptBusho) {
        const helperCastle = this.game.getCastle(helperCastleId);
        const reinfBushosData = selectedIds;
        this.game.ui.openQuantitySelector('def_self_reinf_supplies', [helperCastle], null, {
            onConfirm: (inputs) => {
                const inputData = inputs[helperCastle.id] || inputs;
                const reinfSoldiers = inputData.soldiers ? parseInt(inputData.soldiers.num.value) : 500;
                const reinfRice = inputData.rice ? parseInt(inputData.rice.num.value) : 500;
                const reinfHorses = inputData.horses ? parseInt(inputData.horses.num.value) : 0;
                const reinfGuns = inputData.guns ? parseInt(inputData.guns.num.value) : 0;

                const srcProv = this.game.provinces.find(p => p.id === helperCastle.provinceId);
                const tgtProv = this.game.provinces.find(p => p.id === defCastle.provinceId);
                const isHeavySnow = (srcProv && srcProv.statusEffects && srcProv.statusEffects.includes('heavySnow')) || 
                                    (tgtProv && tgtProv.statusEffects && tgtProv.statusEffects.includes('heavySnow'));

                const proceedWar = async () => {
                    let finalBushos = reinfBushosData.map(id => this.game.getBusho(id));

                    helperCastle.soldiers = Math.max(0, helperCastle.soldiers - reinfSoldiers);
                    helperCastle.rice = Math.max(0, helperCastle.rice - reinfRice);
                    helperCastle.horses = Math.max(0, (helperCastle.horses || 0) - reinfHorses);
                    helperCastle.guns = Math.max(0, (helperCastle.guns || 0) - reinfGuns);

                    const selfReinfData = {
                        castle: helperCastle, bushos: finalBushos, soldiers: reinfSoldiers,
                        rice: reinfRice, horses: reinfHorses, guns: reinfGuns, isAttacker: false, isSelf: true,
                        morale: helperCastle.morale || 50, training: helperCastle.training || 50
                    };
                    
                    onComplete(selfReinfData);
                };

                if (isHeavySnow) {
                    this.game.ui.showDialog("大雪の影響により、被害が出る場合があります。\nそれでも出陣しますか？", true, () => {
                        proceedWar(); 
                    });
                } else {
                    proceedWar();
                }
            },
            onCancel: promptBusho
        });
    }

    executeReinforcementRequest(gold, helperCastle, atkCastle, targetCastle, atkBushos, sVal, rVal, hVal, gVal, selfReinfData) {
        if (gold > 0) atkCastle.gold -= gold;

        const force = helperCastle.selectedForce;
        const myClanId = atkCastle.ownerClan;
        
        // ★ここから追加：大雪の判定です
        const srcProv1 = this.game.provinces.find(p => p.id === helperCastle.provinceId);
        const srcProv2 = this.game.provinces.find(p => p.id === atkCastle.provinceId);
        const tgtProv = this.game.provinces.find(p => p.id === targetCastle.provinceId);
        const isHeavySnow = (srcProv1 && srcProv1.statusEffects && srcProv1.statusEffects.includes('heavySnow')) ||
                            (srcProv2 && srcProv2.statusEffects && srcProv2.statusEffects.includes('heavySnow')) ||
                            (tgtProv && tgtProv.statusEffects && tgtProv.statusEffects.includes('heavySnow'));

        // ★追加：戦力比較用の合計兵力算出
        let atkTotalSoldiers = sVal;
        if (selfReinfData) atkTotalSoldiers += selfReinfData.soldiers;
        const defTotalSoldiers = targetCastle.soldiers;
        
        // ★ 追加：諸勢力が選ばれていた場合の特別な処理です！
        if (force && force.isKunishu) {
            const kunishu = this.game.kunishuSystem.getKunishu(force.id);
            const currentRel = kunishu.getRelation(myClanId);
            
            // ★追加：大雪ならAI（諸勢力）は絶対に断ります！
            let isSuccess = false;
            if (!isHeavySnow) {
                // ★修正：確率の計算を、外交の専門部署にお任せします！
                const prob = this.game.diplomacyManager.getReinforcementAcceptProb(myClanId, force.id, targetCastle.ownerClan, gold, true, atkTotalSoldiers, defTotalSoldiers);
                isSuccess = (Math.random() * 100 < prob);
            }
            
            if (!isSuccess) {
                if (myClanId === this.game.playerClanId) {
                    const leader = this.game.getBusho(kunishu.leaderId);
                    const leaderName = leader ? leader.name : "頭領";
                    const nameStr = `${kunishu.getName(this.game)}の${leaderName}`;
                    
                    // ★メッセージ係にお任せします！
                    this.game.warManager.reinfMsgHelper.showRefusal(this.game, nameStr, isHeavySnow, () => {
                        this.game.warManager.startWar(atkCastle, targetCastle, atkBushos, sVal, rVal, hVal, gVal, null, selfReinfData);
                    });
                } else {
                    this.game.warManager.startWar(atkCastle, targetCastle, atkBushos, sVal, rVal, hVal, gVal, null, selfReinfData);
                }
                return;
            }
            
            // 借りを作ったので友好度が少し下がります
            kunishu.setRelation(myClanId, currentRel - 10);
            
            const rate = currentRel / 200; 
            let reinfSoldiers = Math.floor(kunishu.soldiers * rate);
            reinfSoldiers = Math.max(500, Math.min(reinfSoldiers, kunishu.soldiers));
            
            const availableBushos = this.game.kunishuSystem.getKunishuMembers(kunishu.id).sort((a,b) => b.strength - a.strength);
            let bushoCount = reinfSoldiers >= 2500 ? 3 : (reinfSoldiers >= 1500 ? 2 : 1);
            bushoCount = Math.min(bushoCount, availableBushos.length);
            const reinfBushos = availableBushos.slice(0, bushoCount);
            
            const reinfRice = reinfSoldiers; 
            const reinfHorses = 0; 
            const reinfGuns = 0;
            
            kunishu.soldiers = Math.max(0, kunishu.soldiers - reinfSoldiers);
            
            const reinforcementData = {
                castle: helperCastle, kunishuId: kunishu.id, bushos: reinfBushos, soldiers: reinfSoldiers,
                rice: reinfRice, horses: reinfHorses, guns: reinfGuns, isSelf: false, isKunishuForce: true,
                morale: kunishu.morale || 50, training: kunishu.training || 50
            };
            
            if (myClanId === this.game.playerClanId) {
                const leader = this.game.getBusho(kunishu.leaderId);
                const leaderName = leader ? leader.name : "頭領";
                const nameStr = `${kunishu.getName(this.game)}の${leaderName}`;
                
                // ★メッセージ係にお任せします！
                this.game.warManager.reinfMsgHelper.showAcceptance(this.game, nameStr, true, atkCastle.isDelegated, false, () => {
                    this.game.warManager.startWar(atkCastle, targetCastle, atkBushos, sVal, rVal, hVal, gVal, reinforcementData, selfReinfData);
                });
            } else {
                this.game.warManager.startWar(atkCastle, targetCastle, atkBushos, sVal, rVal, hVal, gVal, reinforcementData, selfReinfData);
            }
            return;
        }

        // 以降は今まで通りの大名家の処理です
        const helperClanId = helperCastle.ownerClan;
        const enemyClanId = targetCastle.ownerClan;
        const myToHelperRel = this.game.getRelation(myClanId, helperClanId);
        // helperToEnemyRel は外交専門部署で使うので、ここでは消しておきます

        if (helperClanId === this.game.playerClanId) {
            const myClanName = this.game.clans.find(c => c.id === myClanId)?.name || "不明";
            
            let targetInfoStr = "";
            const provData = this.game.provinces.find(p => p.id === targetCastle.provinceId);
            const provName = provData ? provData.province : "不明な国";

            if (targetCastle.isKunishu) {
                const kunishu = this.game.kunishuSystem.getKunishu(targetCastle.kunishuId);
                const kName = kunishu ? kunishu.getName(this.game) : "諸勢力";
                targetInfoStr = `${provName}の${kName}の攻略のため、\n`;
            } else if (targetCastle.ownerClan === 0) {
                targetInfoStr = `${provName}の${targetCastle.name}の攻略のため、\n`;
            } else {
                const targetClanName = this.game.clans.find(c => c.id === enemyClanId)?.name || "中立勢力";
                targetInfoStr = `${targetClanName}の${targetCastle.name}の攻略のため、\n`;
            }

            // ★修正：AI（要請側）から見てプレイヤー（受諾側）が「支配」されている相手かどうかを確認します！
            const isBoss = (myToHelperRel && myToHelperRel.status === '支配');
            const startSelection = () => this._promptPlayerAtkReinforcement(helperCastle, atkCastle, targetCastle, atkBushos, sVal, rVal, hVal, gVal, isBoss, selfReinfData);
            
            // ★メッセージ係にお任せします！
            this.game.warManager.reinfMsgHelper.showRequest(this.game, myClanName, targetInfoStr, gold, isBoss, true, startSelection, () => {
                this.game.diplomacyManager.updateSentiment(myClanId, helperClanId, -10);
                this.game.ui.showDialog(`援軍要請を断りました。`, false, () => {
                    this.game.warManager.startWar(atkCastle, targetCastle, atkBushos, sVal, rVal, hVal, gVal, null, selfReinfData);
                });
            });
            return;
        }

        // ★追加：大雪ならAIは絶対に断ります！
        let isSuccess = false;
        // ★修正：要請側が相手を「支配」しているなら、大雪でも何でも絶対に強制参加させます！
        if (myToHelperRel && myToHelperRel.status === '支配') {
            isSuccess = true;
        } else if (!isHeavySnow) {
            // ★修正：確率計算とサイコロは、外交の専門部署にお任せします！
            const prob = this.game.diplomacyManager.getReinforcementAcceptProb(myClanId, helperClanId, enemyClanId, gold, false, atkTotalSoldiers, defTotalSoldiers);
            isSuccess = (Math.random() * 100 < prob);
        }

        if (!isSuccess) {
            if (myClanId === this.game.playerClanId) {
                const castellan = this.game.getBusho(helperCastle.castellanId);
                const castellanName = castellan ? castellan.name : "城主";
                const nameStr = `${helperCastle.name}の${castellanName}`;
                
                // ★メッセージ係にお任せします！
                this.game.warManager.reinfMsgHelper.showRefusal(this.game, nameStr, isHeavySnow, () => {
                    this.game.warManager.startWar(atkCastle, targetCastle, atkBushos, sVal, rVal, hVal, gVal, null, selfReinfData);
                });
            } else {
                this.game.warManager.startWar(atkCastle, targetCastle, atkBushos, sVal, rVal, hVal, gVal, null, selfReinfData);
            }
            return;
        }

        if (!['支配', '従属', '同盟'].includes(myToHelperRel.status)) this.game.diplomacyManager.updateSentiment(myClanId, helperClanId, -10);

        const helperDaimyo = this.game.bushos.find(b => b.clan === helperClanId && b.isDaimyo) || { duty: 50 };
        
        const rate = (myToHelperRel.sentiment + helperDaimyo.duty) / 400;
        let reinfSoldiers = Math.floor(helperCastle.soldiers * rate);
        reinfSoldiers = Math.max(500, Math.min(reinfSoldiers, helperCastle.soldiers));
        
        const availableBushos = this.game.getCastleBushos(helperCastle.id).filter(b => b.clan === helperCastle.ownerClan && b.status === 'active').sort((a,b) => b.strength - a.strength);
        let bushoCount = reinfSoldiers >= 2500 ? 3 : (reinfSoldiers >= 1500 ? 2 : 1);
        bushoCount = Math.min(bushoCount, availableBushos.length);

        const reinfBushos = availableBushos.slice(0, bushoCount);
        const reinfRice = reinfSoldiers; 
        const reinfHorses = Math.min(helperCastle.horses || 0, Math.floor(reinfSoldiers * 0.5)); 
        const reinfGuns = Math.min(helperCastle.guns || 0, Math.floor(reinfSoldiers * 0.5));

        helperCastle.soldiers = Math.max(0, helperCastle.soldiers - reinfSoldiers);
        helperCastle.rice = Math.max(0, helperCastle.rice - reinfRice);
        helperCastle.horses = Math.max(0, (helperCastle.horses || 0) - reinfHorses);
        helperCastle.guns = Math.max(0, (helperCastle.guns || 0) - reinfGuns);

        const reinforcementData = {
            castle: helperCastle, bushos: reinfBushos, soldiers: reinfSoldiers,
            rice: reinfRice, horses: reinfHorses, guns: reinfGuns, isSelf: false,
            morale: helperCastle.morale || 50, training: helperCastle.training || 50
        };

        this.game.warManager.applyWarHostility(helperCastle.ownerClan, false, targetCastle.ownerClan, targetCastle.isKunishu, true);
        
        if (myClanId === this.game.playerClanId) {
            const castellan = this.game.getBusho(helperCastle.castellanId);
            const castellanName = castellan ? castellan.name : "城主";
            const nameStr = `${helperCastle.name}の${castellanName}`;
            
            // ★メッセージ係にお任せします！
            this.game.warManager.reinfMsgHelper.showAcceptance(this.game, nameStr, false, atkCastle.isDelegated, false, () => {
                this.game.warManager.startWar(atkCastle, targetCastle, atkBushos, sVal, rVal, hVal, gVal, reinforcementData, selfReinfData);
            });
        } else {
            this.game.warManager.startWar(atkCastle, targetCastle, atkBushos, sVal, rVal, hVal, gVal, reinforcementData, selfReinfData);
        }
    }

    _promptPlayerAtkReinforcement(helperCastle, atkCastle, targetCastle, atkBushos, sVal, rVal, hVal, gVal, isBoss, selfReinfData) {
        const promptBusho = () => {
            this.game.ui.openBushoSelector('atk_reinf_deploy', helperCastle.id, {
                hideCancel: isBoss, 
                onConfirm: (selectedBushoIds) => promptQuantity(selectedBushoIds.map(id => this.game.getBusho(id))),
                onCancel: () => this.game.ui.showDialog("援軍の派遣を取りやめました。", false, () => this.game.warManager.startWar(atkCastle, targetCastle, atkBushos, sVal, rVal, hVal, gVal, null, selfReinfData))
            });
        };
        const promptQuantity = (reinfBushos) => {
            this.game.ui.openQuantitySelector('atk_reinf_supplies', [helperCastle], null, {
                onConfirm: (inputs) => {
                    const i = inputs[helperCastle.id] || inputs;
                    const rS = i.soldiers ? parseInt(i.soldiers.num.value) : 500;
                    const rR = i.rice ? parseInt(i.rice.num.value) : 500;
                    const rH = i.horses ? parseInt(i.horses.num.value) : 0;
                    const rG = i.guns ? parseInt(i.guns.num.value) : 0;
                    this._applyManualAtkReinforcement(helperCastle, atkCastle, targetCastle, atkBushos, sVal, rVal, hVal, gVal, reinfBushos, rS, rR, rH, rG, selfReinfData);
                },
                onCancel: promptBusho
            });
        };
        promptBusho();
    }

    _applyManualAtkReinforcement(helperCastle, atkCastle, targetCastle, atkBushos, sVal, rVal, hVal, gVal, reinfBushos, reinfSoldiers, reinfRice, reinfHorses, reinfGuns, selfReinfData) {
        helperCastle.soldiers = Math.max(0, helperCastle.soldiers - reinfSoldiers);
        helperCastle.rice = Math.max(0, helperCastle.rice - reinfRice);
        helperCastle.horses = Math.max(0, (helperCastle.horses || 0) - reinfHorses);
        helperCastle.guns = Math.max(0, (helperCastle.guns || 0) - reinfGuns);

        const reinforcementData = {
            castle: helperCastle, bushos: reinfBushos, soldiers: reinfSoldiers,
            rice: reinfRice, horses: reinfHorses, guns: reinfGuns, isAttacker: true, isSelf: false,
            morale: helperCastle.morale || 50, training: helperCastle.training || 50
        };

        this.game.warManager.applyWarHostility(helperCastle.ownerClan, false, targetCastle.ownerClan, targetCastle.isKunishu, true);
        
        // ★修正：手動で友軍を出した時の「出発しました！」のお返事を復活させます！
        this.game.ui.showDialog(`自軍の同盟援軍が出発しました！\n共に ${targetCastle.name} へ侵攻します！`, false, () => {
            this.game.warManager.startWar(atkCastle, targetCastle, atkBushos, sVal, rVal, hVal, gVal, reinforcementData, selfReinfData);
        });
    }
    
    executeSuccession(newDaimyoId) {
        // ★家督相続の難しい処理は、専門の life_system.js にお任せして魔法を呼び出します！
        this.game.lifeSystem.executeSuccessionCommand(newDaimyoId);
    }

    // ★追加：所領分配の実行
    executeAllotFief(legionNo, targetLegionId, selectedCastleIds, candidateCastles) {
        let count = 0;
        
        const legion = this.game.legions ? this.game.legions.find(l => Number(l.clanId) === Number(this.game.playerClanId) && Number(l.legionNo) === Number(legionNo)) : null;
        
        candidateCastles.forEach(c => {
            const isCommanderCastle = legion && Number(c.castellanId) === Number(legion.commanderId);
            const isSelected = selectedCastleIds.includes(c.id) || isCommanderCastle;

            if (isSelected) {
                if (Number(c.legionId) !== Number(legionNo)) {
                    c.legionId = legionNo;
                    count++;
                }
            } else {
                if (Number(c.legionId) === Number(legionNo)) {
                    c.legionId = 0;
                    count++;
                }
            }
        });

        const numberNames = ["直轄", "第一席", "第二席", "第三席", "第四席", "第五席", "第六席", "第七席", "第八席"];
        const legionName = numberNames[legionNo] || `第${legionNo}席`;
        
        this.game.ui.showResultModal(`${legionName}の所領分配を完了しました。\n${count}件の拠点の所属が変更されました。`);
        this.game.ui.updatePanelHeader();
        this.game.ui.renderCommandMenu();
        this.game.ui.renderMap();
    }

    // ★追加：国主解任の実行
    executeDismissLegionLeader(legionNo) {
        if (!this.game.legions) return;
        const legion = this.game.legions.find(l => Number(l.clanId) === Number(this.game.playerClanId) && Number(l.legionNo) === legionNo);
        if (!legion || !legion.commanderId) return;

        const commander = this.game.getBusho(legion.commanderId);
        if (commander) {
            commander.isCommander = false;
        }

        // その軍団の所属をすべて直轄（ID0）に変更
        let count = 0;
        this.game.castles.forEach(c => {
            if (Number(c.ownerClan) === Number(this.game.playerClanId) && Number(c.legionId) === legionNo) {
                c.legionId = 0;
                count++;
            }
        });

        // 軍団の作戦などを破棄
        legion.commanderId = 0;
        legion.objective = null;
        legion.status = 'wait';
        legion.targetId = 0;
        legion.route = [];

        const numberNames = ["", "第一席", "第二席", "第三席", "第四席", "第五席", "第六席", "第七席", "第八席"];
        const legionName = numberNames[legionNo] || `第${legionNo}席`;
        
        const commanderName = commander ? commander.name : "不明";

        this.game.ui.showResultModal(`${commanderName} を ${legionName} の国主から解任しました。\n所属していた ${count} 件の拠点はすべて直轄領に変更されました。`);
        this.game.ui.updatePanelHeader();
        this.game.ui.renderCommandMenu();
        this.game.ui.renderMap();
    }
}