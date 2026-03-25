/**
 * command_system.js
 * ゲーム内のコマンド実行ロジックおよびフロー制御を管理するクラス
 * 修正: 出陣時・諸勢力鎮圧時に、指定した「騎馬」と「鉄砲」を持参する処理を追加しました
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
            { label: "外交", commands: ['goodwill', 'alliance', 'marriage', 'dominate', 'subordinate', 'break_alliance'] }, // ★ 'marriage' を追加！
            { label: "調略", commands: ['incite', 'rumor', 'headhunt'] },
            { label: "諸勢力", commands: ['kunishu_goodwill', 'kunishu_incorporate'] },
            { label: "朝廷", commands: ['tribute', 'court_truce'] }
        ]
    },
    {
        label: "取引",
        commands: ['buy_rice', 'sell_rice', 'buy_horses', 'buy_guns']
    },
    {
        label: "人事",
        commands: ['appoint_gunshi', 'appoint', 'delegate', 'reward', 'interview', 'employ', 'move', 'banish']
    },
    {
        label: "情報",
        commands: ['investigate', 'busho_list', 'princess_list', 'faction_list', 'daimyo_list']
    },
    {
        label: "システム",
        commands: ['history', 'settings', 'save', 'load', 'title']
    }
];

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
        msg: "金: 200 (1回あたり)" 
    },
    'commerce': { 
        label: "鉱山開発", category: 'DEVELOP', 
        costGold: 200, costRice: 0, 
        isMulti: true, hasAdvice: false, 
        startMode: 'busho_select', sortKey: 'politics',
        msg: "金: 200 (1回あたり)" 
    },
    'repair': { 
        label: "城壁修復", category: 'DEVELOP', 
        costGold: 200, costRice: 0, 
        isMulti: true, hasAdvice: false, 
        startMode: 'busho_select', sortKey: 'politics',
        msg: "金: 200 (1回あたり)" 
    },
    'charity': { 
        label: "施し", category: 'DEVELOP', 
        costGold: 0, costRice: 200, 
        isMulti: true, hasAdvice: false, 
        startMode: 'busho_select', sortKey: 'charm',
        msg: "米: 200 (1回あたり)" 
    },

    // --- 軍事取引 (MIL_TRADE) ---
    'buy_rice': {
        label: "兵糧購入", category: 'MIL_TRADE',
        costGold: 0, costRice: 0,
        isMulti: false, hasAdvice: false,
        startMode: 'quantity_select',
        msg: "金を払い兵糧を買います"
    },
    'sell_rice': {
        label: "兵糧売却", category: 'MIL_TRADE',
        costGold: 0, costRice: 0,
        isMulti: false, hasAdvice: false,
        startMode: 'quantity_select',
        msg: "兵糧を売り金を得ます"
    },
    'buy_horses': {
        label: "騎馬購入", category: 'MIL_TRADE',
        costGold: 0, costRice: 0,
        isMulti: false, hasAdvice: false,
        startMode: 'quantity_select',
        msg: "金を払い騎馬を買います"
    },
    'buy_guns': {
        label: "鉄砲購入", category: 'MIL_TRADE',
        costGold: 0, costRice: 0,
        isMulti: false, hasAdvice: false,
        startMode: 'quantity_select',
        msg: "金を払い鉄砲を買います"
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
        msg: "兵士の訓練度を上げます" 
    },
    'soldier_charity': { 
        label: "兵施し", category: 'MILITARY', 
        costGold: 0, costRice: 200, 
        isMulti: true, hasAdvice: false, 
        startMode: 'busho_select', sortKey: 'leadership',
        msg: "米: 200 (1回あたり)\n兵士の士気を上げます" 
    },
    'transport': { 
        label: "輸送", category: 'MILITARY', 
        costGold: 0, costRice: 0, 
        isMulti: true, hasAdvice: false, 
        startMode: 'map_select', targetType: 'ally_other',
        sortKey: 'strength' 
    },
    // ★追加: 諸勢力を攻める（鎮圧する）ための軍事コマンド
    'kunishu_subjugate': { 
        label: "鎮圧", category: 'MILITARY', 
        costGold: 0, costRice: 0, 
        isMulti: true, hasAdvice: true, 
        startMode: 'map_select', targetType: 'kunishu_subjugate_valid', // ← 専用の合言葉にしました！
        sortKey: 'strength'
    },

    // --- 人事 (PERSONNEL) ---
    'appoint_gunshi': { 
        label: "軍師任命", category: 'PERSONNEL', 
        costGold: 0, costRice: 0, 
        isMulti: false, hasAdvice: false, 
        startMode: 'busho_select', sortKey: 'intelligence',
        msg: "軍師を任命します" 
    },
    'appoint': { 
        label: "城主任命", category: 'PERSONNEL', 
        costGold: 0, costRice: 0, 
        isMulti: false, hasAdvice: false, 
        startMode: 'busho_select', sortKey: 'leadership',
        msg: "城主を任命します" 
    },
    'delegate': { 
        label: "城主委任", category: 'PERSONNEL', 
        isSystem: true, action: 'delegate_list' 
    },
    'reward': { 
        label: "褒美", category: 'PERSONNEL', 
        costGold: 100, costRice: 0, 
        isMulti: true, hasAdvice: false, 
        startMode: 'busho_select', sortKey: 'loyalty',
        msg: "金: 100 (1人あたり)\n褒美を与えます" 
    },
    'interview': { 
        label: "面談", category: 'PERSONNEL', 
        costGold: 0, costRice: 0, 
        isMulti: false, hasAdvice: false, 
        startMode: 'busho_select', sortKey: 'leadership',
        msg: "武将と面談します" 
    },
    'employ': { 
        label: "登用", category: 'PERSONNEL', 
        costGold: 0, costRice: 0, 
        isMulti: false, hasAdvice: true, 
        startMode: 'busho_select_special', subType: 'employ_target',
        sortKey: 'strength',
        msg: "在野武将を登用します" 
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
        msg: "武将を追放します" 
    },

    // --- 対外：調略 (FOREIGN_STRATEGY) ---
    'incite': { 
        label: "扇動", category: 'FOREIGN_STRATEGY', 
        costGold: 0, costRice: 0, 
        isMulti: false, hasAdvice: true, 
        startMode: 'map_select', targetType: 'enemy_all',
        sortKey: 'intelligence' 
    },
    'rumor': { 
        label: "流言", category: 'FOREIGN_STRATEGY', 
        costGold: 0, costRice: 0, 
        isMulti: false, hasAdvice: true, 
        startMode: 'map_select', targetType: 'enemy_all',
        sortKey: 'intelligence' 
    },
    'headhunt': { 
        label: "引抜", category: 'FOREIGN_STRATEGY', 
        costGold: 0, costRice: 0,
        isMulti: false, hasAdvice: true, 
        startMode: 'map_select', targetType: 'enemy_all',
        sortKey: 'intelligence'
    },

    // --- 情報 (INFO) ---
    'investigate': { 
        label: "調査", category: 'INFO', 
        costGold: 0, costRice: 0, 
        isMulti: true, hasAdvice: true, 
        startMode: 'map_select', targetType: 'enemy_all',
        sortKey: 'intelligence' 
    },
    'busho_list': {
        label: "武将", category: 'INFO',
        isSystem: true, action: 'busho_list'
    },
    'faction_list': {
        label: "派閥", category: 'INFO',
        isSystem: true, action: 'faction_list'
    },
    'princess_list': {
        label: "姫", category: 'INFO',
        isSystem: true, action: 'princess_list'
    },
    'daimyo_list': {
        label: "勢力", category: 'INFO',
        isSystem: true, action: 'daimyo_list'
    },

    // --- 対外：外交 (FOREIGN_DAIMYO) ---
    'goodwill': {
        label: "親善", category: 'FOREIGN_DAIMYO',
        costGold: 0, costRice: 0,
        isMulti: false, hasAdvice: true,
        startMode: 'map_select', targetType: 'other_clan_all'
    },
    'alliance': {
        label: "同盟", category: 'FOREIGN_DAIMYO',
        costGold: 0, costRice: 0,
        isMulti: false, hasAdvice: true,
        startMode: 'map_select', targetType: 'other_clan_all'
    },
    // ★今回追加：婚姻の設計図です！
    'marriage': {
        label: "婚姻", category: 'FOREIGN_DAIMYO',
        costGold: 0, costRice: 0,
        isMulti: false, hasAdvice: true,
        startMode: 'map_select', targetType: 'marriage_valid' // 婚姻専用の相手を選ぶ合言葉にします
    },
    'dominate': {
        label: "支配", category: 'FOREIGN_DAIMYO',
        costGold: 0, costRice: 0,
        isMulti: false, hasAdvice: true,
        startMode: 'map_select', targetType: 'other_clan_all'
    },
    'subordinate': {
        label: "従属", category: 'FOREIGN_DAIMYO',
        costGold: 0, costRice: 0,
        isMulti: false, hasAdvice: true,
        startMode: 'map_select', targetType: 'other_clan_all'
    },
    'break_alliance': {
        label: "破棄", category: 'FOREIGN_DAIMYO',
        costGold: 0, costRice: 0,
        isMulti: false, hasAdvice: false,
        startMode: 'map_select', targetType: 'breakable_clan'
    },

    // --- 対外：諸勢力 (FOREIGN_KUNISHU) ---
    'kunishu_goodwill': {
        label: "諸勢力親善", category: 'FOREIGN_KUNISHU',
        costGold: 0, costRice: 0,
        isMulti: false, hasAdvice: true,
        startMode: 'map_select', targetType: 'kunishu_valid'
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
        isMulti: false, hasAdvice: true,
        startMode: 'busho_select_special', subType: 'tribute_doer', sortKey: 'politics',
        msg: "朝廷に使者を送り、金を献上します"
    },
    'court_truce': {
        label: "和睦", category: 'DIPLOMACY_COURT',
        costGold: 2000, costRice: 0,
        isMulti: false, hasAdvice: true,
        startMode: 'map_select', targetType: 'hostile_clan_only',
        msg: "朝廷の威光により、敵対大名と和睦します"
    },

    // --- システム (SYSTEM) - UI生成用プレースホルダ ---
    'history': { label: "履歴", category: 'SYSTEM', isSystem: true, action: 'history' },
    'settings': { label: "設定", category: 'SYSTEM', isSystem: true, action: 'settings' },
    'save': { label: "ファイル保存", category: 'SYSTEM', isSystem: true, action: 'save' },
    'load': { label: "ファイル読込", category: 'SYSTEM', isSystem: true, action: 'load' },
    'title': { label: "タイトルへ", category: 'SYSTEM', isSystem: true, action: 'title' } // ★この１行を書き足します！
};

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
            bushos = this.game.getCastleBushos(c.id).filter(b => b.status === 'ronin' && b.belongKunishuId === 0); 
            infoHtml = "<div>登用する在野武将を選択してください</div>"; 
        }
        else if (actionType === 'employ_doer') { 
            bushos = this.game.getCastleBushos(c.id).filter(b => b.status !== 'ronin' && b.belongKunishuId === 0); 
            infoHtml = "<div>登用を行う担当官を選択してください</div>"; 
        } 
        else if (actionType === 'diplomacy_doer') { 
            bushos = this.game.getCastleBushos(c.id).filter(b => b.status !== 'ronin' && b.belongKunishuId === 0); 
            infoHtml = "<div>外交の担当官を選択してください</div>"; 
        }
        // ★追加：貢物を持っていく使者を選ぶリスト
        else if (actionType === 'tribute_doer') { 
            bushos = this.game.getCastleBushos(c.id).filter(b => b.status !== 'ronin' && b.belongKunishuId === 0); 
            infoHtml = "<div>朝廷への使者を選択してください</div>"; 
        }
        else if (actionType === 'rumor_target_busho') { 
            bushos = this.game.getCastleBushos(targetId).filter(b => b.status !== 'ronin' && !b.isDaimyo && b.belongKunishuId === 0); 
            infoHtml = "<div>流言の対象とする武将を選択してください</div>"; 
        }
        else if (actionType === 'rumor_doer') { 
            bushos = this.game.getCastleBushos(c.id).filter(b => b.status !== 'ronin' && b.belongKunishuId === 0); 
            infoHtml = "<div>流言を実行する担当官を選択してください</div>"; 
        }
        else if (actionType === 'incite_doer') { 
            bushos = this.game.getCastleBushos(c.id).filter(b => b.status !== 'ronin' && b.belongKunishuId === 0); 
            infoHtml = "<div>扇動を実行する担当官を選択してください</div>"; 
        }
        else if (actionType === 'headhunt_target') { 
            bushos = this.game.getCastleBushos(targetId).filter(b => b.status !== 'ronin' && !b.isDaimyo && b.belongKunishuId === 0); 
            infoHtml = "<div>引抜の対象とする武将を選択してください </div>"; 
        }
        else if (actionType === 'kunishu_incorporate_doer') {
            bushos = this.game.getCastleBushos(c.id).filter(b => b.status !== 'ronin' && b.belongKunishuId === 0); 
            infoHtml = "<div>取込の交渉を行う担当官を選択してください</div>"; 
        }
        else if (actionType === 'headhunt_doer') {
            bushos = this.game.getCastleBushos(c.id).filter(b => b.status !== 'ronin' && b.belongKunishuId === 0); 
            infoHtml = "<div>引抜を実行する担当官を選択してください</div>"; 
        }
        else if (actionType === 'interview') { 
            bushos = this.game.getCastleBushos(c.id).filter(b => b.status !== 'ronin' && !b.isDaimyo && b.belongKunishuId === 0); 
            infoHtml = "<div>面談する武将を選択してください</div>"; 
        }
        else if (actionType === 'interview_target') { 
            bushos = this.game.bushos.filter(b => b.clan === this.game.playerClanId && b.status !== 'dead' && b.status !== 'ronin' && b.status !== 'unborn' && b.id !== extraData.interviewer.id && !b.isDaimyo && b.belongKunishuId === 0);
            infoHtml = `<div>誰についての印象を聞きますか？</div>`; 
        }
        else if (actionType === 'investigate_deploy') { 
            bushos = this.game.getCastleBushos(c.id).filter(b => b.status !== 'ronin' && b.belongKunishuId === 0); 
            infoHtml = "<div>調査を行う武将を選択してください(複数可)</div>"; 
        }
        else if (actionType === 'view_only') { 
            bushos = this.game.getCastleBushos(targetId); 
            infoHtml = "<div>武将一覧 (精度により情報は隠蔽されます)</div>"; 
        }
        // 【差し替え後】（間の部分が消えます！）
        else if (actionType === 'all_busho_list') { 
            bushos = this.game.bushos.filter(b => b.clan === this.game.playerClanId && b.status !== 'dead' && b.status !== 'ronin' && b.status !== 'unborn' && b.belongKunishuId === 0);
            infoHtml = "<div>我が軍の武将一覧です</div>"; 
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
                b.status !== 'dead' && 
                b.status !== 'ronin' &&
                b.status !== 'unborn' &&
                !b.isDaimyo && 
                !b.isCastellan
            );
            infoHtml = "<div>軍師に任命する武将を選択してください</div>";
        }
        else if (actionType === 'def_intercept_deploy') {
            bushos = this.game.getCastleBushos(targetId).filter(b => b.status !== 'ronin' && b.status !== 'dead' && b.status !== 'unborn' && b.belongKunishuId === 0);
            infoHtml = "<div>迎撃に出陣する武将を選択してください（最大5名まで）</div>";
        }
        else if (actionType === 'def_reinf_deploy') {
            bushos = this.game.getCastleBushos(targetId).filter(b => b.status !== 'ronin' && b.status !== 'dead' && b.status !== 'unborn' && b.belongKunishuId === 0);
            infoHtml = "<div>援軍に派遣する武将を選択してください（最大5名まで）</div>";
        }
        else if (actionType === 'atk_reinf_deploy') {
            bushos = this.game.getCastleBushos(targetId).filter(b => b.status !== 'ronin' && b.status !== 'dead' && b.status !== 'unborn' && b.belongKunishuId === 0);
            infoHtml = "<div>援軍に派遣する武将を選択してください（最大5名まで）</div>";
        }
        else if (actionType === 'def_self_reinf_deploy' || actionType === 'atk_self_reinf_deploy') {
            bushos = this.game.getCastleBushos(targetId).filter(b => b.status !== 'ronin' && b.status !== 'dead' && b.status !== 'unborn' && b.belongKunishuId === 0);
            infoHtml = "<div>援軍として出陣する武将を選択してください（最大5名まで）</div>";
        }
        
        else if (actionType === 'reward') {
            bushos = this.game.bushos.filter(b => 
                b.clan === this.game.playerClanId && 
                b.status !== 'dead' &&               
                b.status !== 'ronin' &&              
                b.status !== 'unborn' &&             
                !b.isDaimyo                          
            );
            infoHtml = "<div>褒美を与える武将を選択してください</div>"; 
        }
        else {
            // ★追加: 内政などの通常の命令でも、未登場の武将や諸勢力が勝手にリストに出ないようにします
            bushos = this.game.getCastleBushos(c.id).filter(b => b.status !== 'ronin' && b.status !== 'dead' && b.status !== 'unborn' && b.belongKunishuId === 0);
            
            if (spec.msg) {
                infoHtml = `<div>${spec.msg}</div>`;
                if (actionType === 'war_deploy') {
                    infoHtml = `<div>出陣する武将を選択してください（最大5名まで）</div>`;
                }
            } else if (['farm','commerce'].includes(actionType)) { infoHtml = `<div>金: ${c.gold} (1回500)</div>`; }
            else if (['charity'].includes(actionType)) { infoHtml = `<div>金: ${c.gold}, 米: ${c.rice} (1回300)</div>`; }
            else if (['repair'].includes(actionType)) { infoHtml = `<div>金: ${c.gold} (1回300)</div>`; }
            else if (['draft'].includes(actionType)) { infoHtml = `<div>民忠: ${c.peoplesLoyalty}</div>`; }
            else if (['training','soldier_charity'].includes(actionType)) { infoHtml = `<div>状態: 訓練${c.training}/士気${c.morale}</div>`; }
            else if (actionType === 'war_deploy' || actionType === 'kunishu_subjugate_deploy') { infoHtml = `<div>出陣する武将を選択してください（最大5名まで）</div>`; }
        }

        // --- 並び替え（ソート） ---
        bushos.sort((a,b) => {
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

            const getSortVal = (target) => {
                 let acc = null;
                 if (isEnemyTarget && targetCastle) acc = targetCastle.investigatedAccuracy;
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

    getValidTargets(type) {
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

            case 'ally_other': 
                return this.game.castles.filter(target => {
                    if (Number(target.ownerClan) !== playerClanId || target.id === c.id) return false;
                    
                    // ★追加：自領のみを通って辿り着けるか調べる魔法！
                    const visited = new Set();
                    const queue = [c];
                    visited.add(c.id);

                    while (queue.length > 0) {
                        const current = queue.shift();
                        if (current.id === target.id) return true;

                        const neighbors = this.game.castles.filter(adj => 
                            adj.ownerClan === playerClanId && 
                            GameSystem.isAdjacent(current, adj) &&
                            !visited.has(adj.id)
                        );

                        for (const n of neighbors) {
                            visited.add(n.id);
                            queue.push(n);
                        }
                    }
                    return false;
                }).map(t => t.id);
            
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
                    
                    // その大名家の「大名（当主）」を探して、その人がいる城だけをOK（選択可能）にします！
                    const daimyo = this.game.bushos.find(b => b.clan === target.ownerClan && b.isDaimyo);
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
                const myClan = this.game.clans.find(c => c.id === myClanId);
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
                // まず諸勢力がいる城を全部集めます
                const allKunishuCastleIds = [...new Set(activeKunishus.map(k => k.castleId))];
                
                // 集めた城を「フィルター（ふるい）」にかけて、条件に合うものだけを残します！
                return allKunishuCastleIds.filter(targetCastleId => {
                    const targetCastle = this.game.getCastle(targetCastleId);
                    
                    // 条件①：自分が持っている城かどうか？
                    const isMyCastle = (Number(targetCastle.ownerClan) === playerClanId);
                    // 条件②：今まさに命令を出そうとしている城（c）から道が繋がっているか？
                    const isNeighbor = GameSystem.isReachable(this.game, c, targetCastle, playerClanId);
                    
                    // どちらか1つでも当てはまればOK（地図で光らせる）！
                    return isMyCastle || isNeighbor;
                });
            }
            
            case 'marriage_valid': {
                // 1. まず、自分の大名家に嫁がせられる姫（未婚の姫）がいるかチェックします
                const myClan = this.game.clans.find(c => c.id === playerClanId);
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

        const castle = this.game.getCurrentTurnCastle();

        if (type === 'farm' && castle.kokudaka >= castle.maxKokudaka) { this.game.ui.showDialog("これ以上石高は上げられません", false); return; }
        if (type === 'commerce' && castle.commerce >= castle.maxCommerce) { this.game.ui.showDialog("これ以上鉱山は上げられません", false); return; }
        if (type === 'repair' && castle.defense >= castle.maxDefense) { this.game.ui.showDialog("これ以上城壁は上げられません", false); return; }
        if (type === 'charity' && castle.peoplesLoyalty >= castle.maxPeoplesLoyalty) { this.game.ui.showDialog("これ以上民忠は上げられません", false); return; }
        
        const maxTraining = (window.WarParams && window.WarParams.Military && window.WarParams.Military.MaxTraining) ? window.WarParams.Military.MaxTraining : 100;
        const maxMorale = (window.WarParams && window.WarParams.Military && window.WarParams.Military.MaxMorale) ? window.WarParams.Military.MaxMorale : 100;
        if (type === 'training' && castle.training >= maxTraining) { this.game.ui.showDialog("これ以上訓練は上げられません", false); return; }
        if (type === 'soldier_charity' && castle.morale >= maxMorale) { this.game.ui.showDialog("これ以上士気は上げられません", false); return; }

        // ここにストッパーを追加します。兵士が0以下の時は実行できなくします
        if ((type === 'training' || type === 'soldier_charity') && castle.soldiers <= 0) {
            this.game.ui.showDialog("兵士がいません", false);
            return;
        }

        if (spec.costGold > 0 && castle.gold < spec.costGold) {
            this.game.ui.showDialog(`金が足りません (必要: ${spec.costGold})`, false);
            return;
        }
        if (spec.costRice > 0 && castle.rice < spec.costRice) {
            this.game.ui.showDialog(`兵糧が足りません (必要: ${spec.costRice})`, false);
            return;
        }

        // ★追加：朝廷による和睦の時、信用の値をチェックします（具体的な数字は見せません）
        if (type === 'court_truce') {
            const currentTrust = this.game.courtRankSystem.getTrust(this.game.playerClanId);
            if (currentTrust < 500) {
                this.game.ui.showDialog("朝廷に働きかけるための信用が足りないようです……", false);
                return;
            }
        }

        // ★追加：婚姻コマンドの時、我が家に嫁がせる姫がいるかチェックします！
        if (type === 'marriage') {
            const myClan = this.game.clans.find(c => c.id === this.game.playerClanId);
            const hasUnmarriedPrincess = myClan && myClan.princessIds && myClan.princessIds.some(pId => {
                const p = this.game.princesses.find(princess => princess.id === pId);
                return p && p.status === 'unmarried';
            });
            
            if (!hasUnmarriedPrincess) {
                this.game.ui.showDialog("我が家には、他国へ嫁がせることができる未婚の姫がおりませぬ。", false);
                return; // ここで「お帰りください」と処理を終わらせます
            }
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
            case 'history': this.game.ui.showHistoryModal(); break;
            case 'daimyo_list': this.game.ui.showDaimyoList(); break;
            case 'faction_list': this.game.ui.showFactionList(this.game.playerClanId, true); break;
            case 'busho_list': this.game.ui.openBushoSelector('all_busho_list', null, null, null); break;
            case 'princess_list': this.game.ui.showPrincessList(); break;
            case 'delegate_list': this.game.ui.showDelegateListModal(); break;
            // ★ここを書き足し！：「settings」と呼ばれたら小窓を開きます
            case 'settings': this.game.ui.showSettingsModal(); break;
            // ★ここから下を書き足します！
            case 'title':
                this.game.ui.showDialog("タイトル画面に戻りますか？\n保存していないデータは失われます。", true, () => {
                    // 「はい」を押した時だけ、タイトル画面を呼び出してゲーム画面を隠します
                    this.game.ui.returnToTitle();
                    const appScreen = document.getElementById('app');
                    if (appScreen) appScreen.classList.add('hidden');
                });
                break;
            // ★書き足すのはここまで！
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
                    // ★追加：diplomacy.js の専門部署に「marriage（婚姻）」の確率計算をお願いします！
                    const myPower = this.game.getClanTotalSoldiers(doer.clan) || 1;
                    const targetPower = this.game.getClanTotalSoldiers(targetClanId) || 1;
                    const isSuccess = this.game.diplomacyManager.checkDiplomacySuccess(doer.clan, targetClanId, 'marriage', doer.diplomacy, myPower, targetPower);

                    if (isSuccess) {
                        // 成功した時の処理
                        this.applyMarriageData(princessId, targetBushoId, targetClanId);
                        doer.isActionDone = true;
                        doer.achievementTotal += Math.floor(doer.diplomacy * 0.2) + 20;
                        this.game.factionSystem.updateRecognition(doer, 30);

                        this.game.ui.showResultModal(`${targetClan.name} と婚姻同盟を結びました！\n${princess.name} は ${targetBusho.name} の正室として迎えられました。`, () => {
                            this.game.ui.updatePanelHeader();
                            this.game.ui.renderCommandMenu();
                            this.game.ui.renderMap();
                        });
                    } else {
                        // 失敗した時の処理
                        this.game.diplomacyManager.updateSentiment(doer.clan, targetClanId, -10); // 断られたので少し仲が悪くなります
                        doer.isActionDone = true;
                        doer.achievementTotal += 5;
                        this.game.factionSystem.updateRecognition(doer, 10);

                        this.game.ui.showResultModal(`${targetClan.name} に婚姻を断られました……\n使者は失意のまま帰還しました。`, () => {
                            this.game.ui.updatePanelHeader();
                            this.game.ui.renderCommandMenu();
                            this.game.ui.renderMap();
                        });
                    }
                }, 
                () => {
                    // いいえ：もう一度相手武将選びに戻る
                    this.game.ui.openBushoSelector('marriage_kinsman', targetId, extraData);
                }
            );
            return;
        }

        if (actionType === 'rumor_doer') {
            const doer = this.game.getBusho(firstId);
            const targetBusho = this.game.getBusho(extraData.targetBushoId);
            // ★専門部署である StrategySystem の計算魔法を呼びます！
            const trueProb = StrategySystem.getRumorProb(doer, targetBusho);
            this.showAdviceAndExecute('rumor', () => this.game.strategySystem.executeRumor(firstId, targetId, extraData.targetBushoId), { trueProb: trueProb });
            return;
        }

        if (actionType === 'diplomacy_doer') {
            const doer = this.game.getBusho(firstId);
            const targetCastle = this.game.getCastle(targetId);
            const targetClanId = targetCastle.ownerClan;
            const myPower = this.game.getClanTotalSoldiers(doer.clan);
            const targetPower = this.game.getClanTotalSoldiers(targetClanId) || 1;

            if (extraData.subAction === 'goodwill') {
                this.game.ui.openQuantitySelector('goodwill', selectedIds, targetId);
            } else if (extraData.subAction === 'alliance') {
                const prob = this.game.diplomacyManager.getDiplomacyProb(doer.clan, targetClanId, 'alliance', doer.diplomacy, myPower, targetPower);
                this.showAdviceAndExecute('diplomacy', () => this.executeDiplomacy(firstId, targetId, 'alliance'), { trueProb: prob / 100 });
            } else if (extraData.subAction === 'break_alliance') {
                this.executeDiplomacy(firstId, targetId, 'break_alliance');
            } else if (extraData.subAction === 'subordinate') {
                this.showAdviceAndExecute('diplomacy', () => this.executeDiplomacy(firstId, targetId, 'subordinate'), { trueProb: 1.0 });
            } else if (extraData.subAction === 'dominate') {
                const prob = this.game.diplomacyManager.getDiplomacyProb(doer.clan, targetClanId, 'dominate', doer.diplomacy, myPower, targetPower);
                this.showAdviceAndExecute('diplomacy', () => this.executeDiplomacy(firstId, targetId, 'dominate'), { trueProb: prob / 100 });
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
            this.game.ui.showInterviewModal(interviewer);
            return;
        }
        if (actionType === 'interview_target') {
            const target = this.game.getBusho(firstId);
            const interviewer = extraData.interviewer;
            this.executeInterviewTopic(interviewer, target);
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
            this.executeCommand('move_deploy', selectedIds, targetId);
            return;
        }

        if (actionType === 'investigate_deploy') {
            const bushos = selectedIds.map(id => this.game.getBusho(id));
            const trueProb = GameSystem.getInvestigateProb(bushos);
            this.showAdviceAndExecute('investigate', () => this.executeInvestigate(selectedIds, targetId), { trueProb: trueProb });
            return;
        }
        
        if (actionType === 'incite_doer') {
             const doer = this.game.getBusho(firstId);
             // ★専門部署である StrategySystem の計算魔法を呼びます！
             const trueProb = StrategySystem.getInciteProb(doer);
             this.showAdviceAndExecute('incite', () => this.game.strategySystem.executeIncite(firstId, targetId), { trueProb: trueProb });
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
             this.executeAppointGunshi(firstId);
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
                this.executeCommand(actionType, selectedIds, targetId);
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
            if (val < 100) { this.game.ui.showDialog("金が足りません(最低100)", false); return; }
            
            // ★追加: 諸勢力への親善なら
            if (extraData && extraData.isKunishu) {
                this.showAdviceAndExecute('kunishu_goodwill', () => this.game.kunishuSystem.executeKunishuGoodwill(data[0], extraData.kunishuId, val), { trueProb: 1.0 });
            } else {
                this.showAdviceAndExecute('goodwill', () => this.executeDiplomacy(data[0], targetId, 'goodwill', val), { trueProb: 1.0 });
            }
        }
        else if (type === 'tribute_gold') {
            // ★追加：貢物の金額が決まったら、実行の魔法を呼び出します
            const val = parseInt(inputs.gold.num.value);
            if (val <= 0) return;
            this.showAdviceAndExecute('tribute', () => this.game.courtRankSystem.executeTribute(data[0], val), { trueProb: 1.0 });
        }
        else if (type === 'headhunt_gold') {
            const val = parseInt(inputs.gold.num.value);
            const doer = this.game.getBusho(data[0]);
            const target = this.game.getBusho(targetId);
            const targetLord = this.game.bushos.find(b => b.clan === target.clan && b.isDaimyo) || { affinity: 50 }; 
            const newLord = this.game.bushos.find(b => b.clan === this.game.playerClanId && b.isDaimyo) || { affinity: 50 }; 
            // ★専門部署である StrategySystem の計算魔法を呼びます！
            const trueProb = StrategySystem.getHeadhuntProb(doer, target, val, targetLord, newLord);
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
            this.executeTransport(data, targetId, vals);
        }
        // ★ここから追加！ 米を買うときの受け取り窓口です
        else if (type === 'buy_rice') {
            const val = parseInt(inputs.amount.num.value);
            if (val <= 0) return;
            this.executeTrade('buy_rice', val);
        }
        // ★追加ここまで！
        else if (type === 'sell_rice') {
            const val = parseInt(inputs.amount.num.value);
            if (val <= 0) return;
            this.executeTrade('sell_rice', val);
        }
        else if (['buy_ammo', 'buy_horses', 'buy_guns'].includes(type)) {
            const val = parseInt(inputs.amount.num.value);
            if (val <= 0) return;
            this.executeTrade(type, val);
        }
        // ★修正: 出陣時に騎馬と鉄砲の数をスライダーから読み取って渡すようにしました
        else if (type === 'war_supplies') {
            const sVal = parseInt(inputs.soldiers.num.value);
            const rVal = parseInt(inputs.rice.num.value);
            const hVal = inputs.horses ? parseInt(inputs.horses.num.value) : 0;
            const gVal = inputs.guns ? parseInt(inputs.guns.num.value) : 0;
            if (sVal <= 0) { this.game.ui.showDialog("兵士0では出陣できません", false); return; }
            
            const targetCastle = this.game.getCastle(targetId);
            const targetName = targetCastle.name;
            
            const srcProv = this.game.provinces.find(p => p.id === castle.provinceId);
            const tgtProv = this.game.provinces.find(p => p.id === targetCastle.provinceId);
            const isHeavySnow = (srcProv && srcProv.statusEffects && srcProv.statusEffects.includes('heavySnow')) || 
                                (tgtProv && tgtProv.statusEffects && tgtProv.statusEffects.includes('heavySnow'));

            const proceedWar = () => {
                if (extraData && extraData.isKunishu) {
                    const kunishu = this.game.kunishuSystem.getKunishu(extraData.kunishuId);
                    const kunishuName = kunishu.getName(this.game);
                    
                    this.game.ui.showDialog(`${targetName}周辺に根付く ${kunishuName} を鎮圧しますか？\n今月の命令は終了となります`, true, async () => {
                        let finalSVal = sVal;
                        let finalBushosData = [...data];
                        let finalBushos = finalBushosData.map(id => this.game.getBusho(id));

                        if (isHeavySnow) {
                            const survivingBushos = [];
                            for (let b of finalBushos) {
                                if (Math.random() < 0.10) {
                                    await this.game.ui.showDialogAsync(`【強行軍】\n我が軍の${b.name}が凍死しました……`, false, 0);
                                    await this.game.lifeSystem.executeDeath(b);
                                } else {
                                    survivingBushos.push(b);
                                }
                            }
                            finalBushos = survivingBushos;
                            finalBushosData = finalBushos.map(b => b.id);

                            // ★武将が全滅したら兵士の遭難処理は飛ばします！
                            if (finalBushos.length > 0) {
                                const lossRate = 0.20 + Math.random() * 0.30;
                                const lostSoldiers = Math.floor(finalSVal * lossRate);
                                finalSVal -= lostSoldiers;

                                if (lostSoldiers > 0) {
                                    await this.game.ui.showDialogAsync(`【強行軍】\n我が軍の兵士${lostSoldiers}人が遭難しました……`, false, 0);
                                }
                            }

                            if (finalBushos.length === 0) {
                                await this.game.ui.showDialogAsync("【強行軍】\n我が軍は行方不明になりました……", false, 0);
                                castle.soldiers = Math.max(0, castle.soldiers - sVal);
                                castle.rice = Math.max(0, castle.rice - rVal);
                                castle.horses = Math.max(0, (castle.horses || 0) - hVal);
                                castle.guns = Math.max(0, (castle.guns || 0) - gVal);
                                this.game.ui.updatePanelHeader();
                                this.game.ui.renderCommandMenu();
                                return;
                            }
                        }
                        this.game.kunishuSystem.executeKunishuSubjugate(castle, targetId, finalBushosData, finalSVal, rVal, hVal, gVal, kunishu);
                    });
                } else {
                    // ★大名への攻撃なら被害判定は「後回し」にして、援軍の準備へ進みます！
                    this.checkReinforcementAndStartWar(castle, targetId, data.map(id => this.game.getBusho(id)), sVal, rVal, hVal, gVal);
                }
            };

            if (isHeavySnow) {
                this.game.ui.showDialog("大雪の影響により、被害が出る場合があります。\nそれでも出陣しますか？", true, () => {
                    proceedWar();
                });
            } else {
                proceedWar();
            }
        }
        else if (type === 'war_repair') {
             const val = parseInt(inputs.soldiers.num.value);
             if (val <= 0) return;
             this.game.warManager.execWarCmd('repair', val);
        }
    }

    showAdviceAndExecute(actionType, executeCallback, extraContext = {}) {
        const adviceAction = { type: actionType, ...extraContext };
        this.game.gunshiSystem.showCommandAdvice(adviceAction, executeCallback);
    }

    executeCommand(type, bushoIds, targetId) {
        const castle = this.game.getCurrentTurnCastle(); 
        let totalVal = 0, cost = 0, count = 0, actionName = "";
        const spec = COMMAND_SPECS[type]; 
        
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
                
                // ★新しいお引越しセンターの魔法を使います！
                this.game.affiliationSystem.becomeRonin(busho);

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
                    const val = GameSystem.calcDevelopment(busho); castle.gold -= spec.costGold; 
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
                    const val = GameSystem.calcDevelopment(busho); castle.gold -= spec.costGold; 
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
                    const val = GameSystem.calcRepair(busho); castle.gold -= spec.costGold; 
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
                    const val = GameSystem.calcTraining(busho, castle.soldiers); 
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
                    const val = GameSystem.calcSoldierCharity(busho, castle.soldiers); 
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
                
                // ★新しいお引越しセンターの魔法を使います！
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
            
            // ★新しいお引越しセンターの魔法を使います！
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
    
    // ★修正：外交専用の魔法を呼び出すようにしました
    calcGoodwillIncrease(gold, doer) {
        return this.game.diplomacyManager.calcGoodwillIncrease(gold, doer.diplomacy);
    }

    // ★修正：外交の複雑な処理は、すべて外交の専門部署（diplomacy.js）にお任せするようにしました！
    executeDiplomacy(doerId, targetCastleId, type, gold = 0) {
        this.game.diplomacyManager.executeDiplomacy(doerId, targetCastleId, type, gold);
    }

    executeSubjugation(winnerClanId, loserClanId) {
        this.game.diplomacyManager.changeStatus(winnerClanId, loserClanId, '支配');
        const winner = this.game.clans.find(c => Number(c.id) === Number(winnerClanId));
        const loser = this.game.clans.find(c => Number(c.id) === Number(loserClanId));
        if (winner && loser) {
            this.game.ui.log(`${winner.name}が${loser.name}を従属させました`);
        }
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

    executeInterviewStatus(busho) {
        const inno = busho.innovation;
        let policyText = "";
        if (inno > 80) policyText = "最近のやり方は少々古臭い気がしますな。<br>もっと新しいことをせねば。";
        else if (inno < 20) policyText = "古き良き伝統を守ることこそ肝要です。";
        else policyText = "当家のやり方に特に不満はありません。順調です。";
        
        let perceivedLoyalty = busho.loyalty;
        if (busho.intelligence >= 85 && busho.loyalty < 80) {
            perceivedLoyalty = Math.max(perceivedLoyalty, 90);
        } else if (busho.intelligence >= 70 && busho.loyalty < 60) {
            perceivedLoyalty = Math.max(perceivedLoyalty, 70);
        }

        let loyaltyText = "";
        let attitudeText = ""; 

        if (perceivedLoyalty >= 85) {
            loyaltyText = "身に余る御恩、片時も忘れたことはありませぬ。<br>この身は殿のために。";
            attitudeText = "";
        } else if (perceivedLoyalty >= 65) {
            loyaltyText = "家中はよく治まっております。<br>何も心配なさりませぬよう。";
            attitudeText = "";
        } else if (perceivedLoyalty >= 45) {
            loyaltyText = "特に不満はありません。<br>与えられた役目は果たします。";
            attitudeText = "";
        } else if (perceivedLoyalty >= 25) {
            loyaltyText = "……少し、待遇を見直してはいただけませぬか。";
            attitudeText = "";
        } else {
            loyaltyText = "……";
            attitudeText = "(目を合わせようとしない。<br>危険な気配を感じる。)";
        }

        const displayParts = [];
        displayParts.push(`「${policyText}<br>${loyaltyText}」`); 
        if (attitudeText) displayParts.push(attitudeText); 

        let msg = displayParts.filter(Boolean).join('<br>');
        
        msg += `<br><br><button class='btn-secondary' onclick='window.GameApp.ui.reopenInterviewModal(window.GameApp.getBusho(${busho.id}))'>戻る</button>`;
        this.game.ui.showResultModal(msg);
    }

    executeInterviewTopic(interviewer, target) {
        if (interviewer.id === target.id) {
            let comment = "";
            if (interviewer.ambition > 80) comment = "「俺の力を持ってすれば、<br>天下も夢ではない……はずだ」";
            else if (interviewer.personality === 'cautious') comment = "「慎重に行かねば、<br>足元をすくわれよう」";
            else comment = "「今のところは順調か……<br>いや、油断はできん」";
            
            const returnScript = `window.GameApp.ui.reopenInterviewModal(window.GameApp.getBusho(${interviewer.id}))`;
            this.game.ui.showResultModal(`<strong>${interviewer.name}</strong><br>「${target.name}か……」<br><br>${comment}<br><br><button class='btn-secondary' onclick='${returnScript}'>戻る</button>`);
            return;
        }

        const dist = GameSystem.calcValueDistance(interviewer, target); 
        const affinityDiff = GameSystem.calcAffinityDiff(interviewer.affinity, target.affinity); 
        
        let affinityText = "";
        if (dist < 15) affinityText = "あの方とは意気投合します。素晴らしいお方です。";
        else if (dist < 30) affinityText = "話のわかる相手だと思います。<br>信頼できます。";
        else if (dist < 50) affinityText = "悪くはありませんが、時折意見が食い違います。";
        else if (dist < 70) affinityText = "考え方がどうも合いません。<br>理解に苦しみます。";
        else affinityText = "あやつとは反りが合いません。<br>顔も見たくない程です。";

        let loyaltyText = "";
        let togaki = ""; 

        if (interviewer.loyalty < 40) {
            loyaltyText = "さあ……？<br>他人の腹の内など某には量りかねます。";
            togaki = "";
        }
        else if (affinityDiff > 35) { 
            if (interviewer.intelligence >= 80) {
                loyaltyText = "あやつは危険です。<br>裏で妙な動きをしているとの噂も……";
                togaki = "";
            } else {
                loyaltyText = "あやつとは口もききませぬゆえ、<br>何も存じませぬ。";
                togaki = "";
            }
        }
        else if (target.intelligence > interviewer.intelligence + 20) {
            loyaltyText = "なかなか内心を見せぬお方です。";
            togaki = "";
        }
        else {
            const tLoyalty = target.loyalty;
            if (tLoyalty >= 85) loyaltyText = "殿への忠義は本物でしょう。<br>疑う余地もありません。";
            else if (tLoyalty >= 65) loyaltyText = "不審な点はありませぬ。<br>真面目に務めております。";
            else if (tLoyalty >= 45) loyaltyText = "今のところは大人しくしておりますが……";
            else if (tLoyalty >= 25) loyaltyText = "近頃、何やら不満を漏らしているようです。";
            else loyaltyText = "油断なりませぬ。<br>野心を抱いている気配があります。";
        }

        const targetCall = `${target.name}殿ですか……`;
        const displayParts = [];
        displayParts.push(`<strong>${interviewer.name}</strong>`); 
        displayParts.push(`「${targetCall}<br>${affinityText}<br>${loyaltyText}」`); 
        
        if (togaki) {
            displayParts.push(togaki); 
        }

        let msg = displayParts.filter(Boolean).join('<br>');
        
        const returnScript = `window.GameApp.ui.reopenInterviewModal(window.GameApp.getBusho(${interviewer.id}))`;
        msg += `<br><br><button class='btn-secondary' onclick='${returnScript}'>戻る</button>`;
        this.game.ui.showResultModal(msg);
    }
    
    executeTransport(bushoIds, targetId, vals) {
        const c = this.game.getCurrentTurnCastle(); const t = this.game.getCastle(targetId);
        
        // ★ここから追加：輸送先が上限を超えないか事前にチェックして、超えるならお断りします！
        if (t.gold + vals.gold > 99999) { this.game.ui.showDialog("輸送先の「金」が上限(99,999)を超えてしまうため、輸送できません。", false); return; }
        if (t.rice + vals.rice > 99999) { this.game.ui.showDialog("輸送先の「兵糧」が上限(99,999)を超えてしまうため、輸送できません。", false); return; }
        if (t.soldiers + vals.soldiers > 99999) { this.game.ui.showDialog("輸送先の「兵数」が上限(99,999)を超えてしまうため、輸送できません。", false); return; }
        if ((t.horses || 0) + vals.horses > 99999) { this.game.ui.showDialog("輸送先の「騎馬」が上限(99,999)を超えてしまうため、輸送できません。", false); return; }
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
            
            // ★新しいお引越しセンターの魔法を使います！
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
        // ★追加ここまで！

        this.game.ui.showResultModal(`${busho.name}を軍師に任命しました`); 
        this.game.ui.updatePanelHeader(); 
        this.game.ui.renderCommandMenu(); 
    }

    executeTrade(type, amount) {
        const castle = this.game.getCurrentTurnCastle(); 
        // ★ごっそり書き換え！：日本共通の相場ではなく、今いる国の相場を見に行きます！
        let rate = 1.0;
        if (castle && this.game.provinces) {
            const province = this.game.provinces.find(p => p.id === castle.provinceId);
            if (province && province.marketRate !== undefined) rate = province.marketRate;
        }
        // ★書き換えここまで！
        
        if(type === 'buy_rice') { 
            const cost = Math.floor(amount * rate);
            if(castle.gold < cost) { this.game.ui.showDialog("資金不足", false); return; } 
            // ★追加: 買うと上限を超えるならストップ
            if(castle.rice + amount > 99999) { this.game.ui.showDialog("これ以上兵糧は買えません", false); return; }
            castle.gold -= cost; castle.rice += amount; 
            this.game.ui.showResultModal(`兵糧${amount}を購入しました\n(金-${cost})`); 
        } else if (type === 'sell_rice') { 
            if(castle.rice < amount) { this.game.ui.showDialog("兵糧不足", false); return; } 
            const gain = Math.floor(amount * rate); 
            // ★追加: 売ると金が上限を超えるならストップ
            if(castle.gold + gain > 99999) { this.game.ui.showDialog("これ以上兵糧は売れません", false); return; }
            castle.rice -= amount; castle.gold += gain; 
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
            // ★相場を消して、固定金額にします
            const price = parseInt(window.MainParams.Economy.PriceHorse, 10) || 5;
            const cost = price * amount;
            if(castle.gold < cost) { this.game.ui.showDialog("資金不足", false); return; } 
            // ★追加: 騎馬のストッパー
            if((castle.horses || 0) + amount > 99999) { this.game.ui.showDialog("これ以上騎馬は買えません", false); return; }
            castle.gold -= cost; castle.horses = (castle.horses || 0) + amount; 
            this.game.ui.showResultModal(`騎馬${amount}を購入しました\n(金-${cost})`); 
        } else if (type === 'buy_guns') {
            // ★相場を消して、固定金額にします
            const price = parseInt(window.MainParams.Economy.PriceGun, 10) || 50;
            const cost = price * amount;
            if(castle.gold < cost) { this.game.ui.showDialog("資金不足", false); return; } 
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
        
        if (castle.soldiers + soldiers > 99999) {
            this.game.ui.showDialog(`兵数が上限(99,999)を超えるため、これ以上徴兵できません。\n(現在の兵数: ${castle.soldiers})`, false);
            return;
        }
        
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
        this.game.ui.showResultModal(`${busho.name}が徴兵を行いました\n兵士+${soldiers}`); 
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

        bushoIds.forEach(bid => {
            const busho = this.game.getBusho(bid);
            if (!busho) return;

            const val = GameSystem.calcCharity(busho); 

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
            case 'incite': return "扇動対象の城を選択してください";
            case 'rumor': return "流言対象の城を選択してください";
            case 'headhunt': case 'headhunt_select_castle': return "引抜対象の居城を選択してください";
            case 'goodwill': return "親善を行う相手を選択してください";
            case 'alliance': return "同盟を行う相手を選択してください";
            case 'dominate': return "支配下に置く相手を選択してください";
            case 'subordinate': return "従属する相手を選択してください";
            case 'kunishu_goodwill': return "親善を行う諸勢力がいる城を選択してください";
            case 'kunishu_incorporate': return "取込を行う諸勢力がいる城を選択してください";
            case 'break_alliance': return "関係を破棄する相手を選択してください";
            case 'court_truce': return "和睦を行う相手を選択してください";
            case 'marriage': return "婚姻同盟を行う相手を選択してください";
            case 'atk_self_reinforcement': return "援軍を出陣させる城を選択してください";
            case 'atk_ally_reinforcement': return "援軍を要請する城を選択してください";
            case 'def_self_reinforcement': return "援軍を出陣させる城を選択してください";
            case 'def_ally_reinforcement': return "援軍を要請する城を選択してください";
            default: return "対象を選択してください";
        }
    }
    
    resolveMapSelection(targetCastle) {
        if (!this.game.validTargets.includes(targetCastle.id)) return;
        
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
                const forces = [];
                const myClanId = (mode === 'atk_ally_reinforcement') ? temp.atkCastle.ownerClan : temp.defCastle.ownerClan;
                const enemyClanId = (mode === 'atk_ally_reinforcement') ? temp.targetCastle.ownerClan : this.game.warManager.state.attacker.ownerClan;

                // 1. 大名家が援軍を出せるかチェック
                if (targetCastle.ownerClan !== 0 && targetCastle.ownerClan !== myClanId && targetCastle.ownerClan !== enemyClanId) {
                    const rel = this.game.getRelation(myClanId, targetCastle.ownerClan);
                    const enemyRel = this.game.getRelation(targetCastle.ownerClan, enemyClanId);
                    if (rel && ['友好', '同盟', '支配', '従属'].includes(rel.status) && rel.sentiment >= 50) {
                        // ★修正：敵対大名と「同盟・支配・従属」関係にあるか、友好度が100の場合はダメ！という魔法です
                        const isEnemyAlly = enemyRel && ['同盟', '支配', '従属'].includes(enemyRel.status);
                        const isEnemyMaxGoodwill = enemyRel && enemyRel.sentiment >= 100;
                        if (!isEnemyAlly && !isEnemyMaxGoodwill && (!enemyRel || !this.game.diplomacyManager.isNonAggression(enemyRel.status))) {
                            const normalBushos = this.game.getCastleBushos(targetCastle.id).filter(b => !b.isDaimyo && !b.isCastellan && b.status !== 'ronin' && b.belongKunishuId === 0);
                            const minRice = (mode === 'def_ally_reinforcement') ? 500 : 0;
                            if (targetCastle.soldiers >= 1000 && targetCastle.rice >= minRice && normalBushos.length > 0) {
                                const clan = this.game.clans.find(c => c.id === targetCastle.ownerClan);
                                const castellan = this.game.getBusho(targetCastle.castellanId) || {name: "城主"};
                                forces.push({ isKunishu: false, id: targetCastle.ownerClan, name: clan ? clan.name : "大名家", leaderName: castellan.name, soldiers: targetCastle.soldiers });
                            }
                        }
                    }
                }

                // 2. 諸勢力が援軍を出せるかチェック
                const kunishus = this.game.kunishuSystem.getKunishusInCastle(targetCastle.id);
                kunishus.forEach(k => {
                    // ★修正：敵対大名との友好度が100の時はダメ！という魔法です
                    const enemyKunishuRel = k.getRelation(enemyClanId);
                    if (k.getRelation(myClanId) >= 70 && k.soldiers >= 1000 && enemyKunishuRel < 100) {
                        const members = this.game.kunishuSystem.getKunishuMembers(k.id);
                        if (members.length > 0) {
                            const leader = this.game.getBusho(k.leaderId) || members[0];
                            forces.push({ isKunishu: true, id: k.id, name: k.getName(this.game), leaderName: leader.name, soldiers: k.soldiers });
                        }
                    }
                });

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
            
            // ★修正: 1つしかない場合でも、必ず一覧画面を開いて確認できるようにします！
            this.game.ui.showKunishuSelector(kunishus, proceedKunishuCommand, onBackToMap);
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
        } else if (mode === 'dominate') {
            this.game.ui.openBushoSelector('diplomacy_doer', targetCastle.id, { subAction: 'dominate' }, onBackToMap);
        } else if (mode === 'court_truce') {
            // ★追加：朝廷和睦の使者選びへ繋げます
            this.game.ui.openBushoSelector('diplomacy_doer', targetCastle.id, { subAction: 'court_truce' }, onBackToMap);
        } else if (mode === 'marriage') {
            // ★今回追加：婚姻の使者選びへ繋げます
            this.game.ui.openBushoSelector('diplomacy_doer', targetCastle.id, { subAction: 'marriage' }, onBackToMap);
        }
    }
    
    // ★修正：この処理も専門部署にお任せします！
    clearDominationRelations(clanId) {
        this.game.diplomacyManager.clearDominationRelations(clanId);
    }
    
    // ★修正：AIからの外交提案の処理も、専門部署（diplomacy.js）にお任せします！
    proposeDiplomacyToPlayer(doer, targetClanId, type, gold, onComplete) {
        this.game.diplomacyManager.proposeDiplomacyToPlayer(doer, targetClanId, type, gold, onComplete);
    }
    
    // ★ここから下全部、援軍を探してお願いする新しい機能です！
    checkReinforcementAndStartWar(atkCastle, targetCastleId, atkBushos, sVal, rVal, hVal, gVal) {
        const myClanId = atkCastle.ownerClan;
        const targetCastle = this.game.getCastle(targetCastleId);
        const pid = this.game.playerClanId;
        
        let selfCandidates = [];
        this.game.castles.forEach(c => {
            if (c.ownerClan !== myClanId || c.id === atkCastle.id) return;

            // ★追加：そのお城がある国が「大雪」だったら、援軍候補から外します！
            const prov = this.game.provinces.find(p => p.id === c.provinceId);
            if (prov && prov.statusEffects && prov.statusEffects.includes('heavySnow')) return;

            const isNextToMyAnyCastle = this.game.castles.some(myC => myC.ownerClan === myClanId && GameSystem.isAdjacent(c, myC));
            const isNextToEnemy = GameSystem.isAdjacent(c, targetCastle);
            if (!isNextToMyAnyCastle && !isNextToEnemy) return;
            if (c.soldiers < 1000) return;
            const normalBushos = this.game.getCastleBushos(c.id).filter(b => !b.isDaimyo && !b.isCastellan && b.status !== 'ronin' && b.belongKunishuId === 0);
            if (normalBushos.length === 0) return;
            selfCandidates.push(c);
        });

        // ★追加：兵数や武将が変わるので、最新のものを引数で受け取るようにしました
        const proceedToAlly = (selfReinfData, currentAtkBushos = atkBushos, currentSVal = sVal) => {
            let allyForceCandidates = [];
            this.game.castles.forEach(c => {
                // ★追加：そのお城がある国が「大雪」だったら、援軍候補から外します！
                const prov = this.game.provinces.find(p => p.id === c.provinceId);
                if (prov && prov.statusEffects && prov.statusEffects.includes('heavySnow')) return;

                if (c.ownerClan !== 0 && c.ownerClan !== myClanId && c.ownerClan !== targetCastle.ownerClan) {
                    const rel = this.game.getRelation(myClanId, c.ownerClan);
                    const enemyRel = this.game.getRelation(c.ownerClan, targetCastle.ownerClan);
                    if (rel && ['友好', '同盟', '支配', '従属'].includes(rel.status) && rel.sentiment >= 50) {
                        const isEnemyAlly = enemyRel && ['同盟', '支配', '従属'].includes(enemyRel.status);
                        const isEnemyMaxGoodwill = enemyRel && enemyRel.sentiment >= 100;
                        if (!isEnemyAlly && !isEnemyMaxGoodwill && (!enemyRel || !this.game.diplomacyManager.isNonAggression(enemyRel.status))) {
                            const isNextToMyAnyCastle = this.game.castles.some(myC => myC.ownerClan === myClanId && GameSystem.isAdjacent(c, myC));
                            const isNextToEnemy = GameSystem.isAdjacent(c, targetCastle);
                            if (isNextToMyAnyCastle || isNextToEnemy) {
                                const normalBushos = this.game.getCastleBushos(c.id).filter(b => !b.isDaimyo && !b.isCastellan && b.status !== 'ronin' && b.belongKunishuId === 0);
                                if (c.soldiers >= 1000 && normalBushos.length > 0) {
                                    allyForceCandidates.push({ castle: c, force: { isKunishu: false, id: c.ownerClan, name: this.game.clans.find(clan=>clan.id===c.ownerClan)?.name || "大名", soldiers: c.soldiers } });
                                }
                            }
                        }
                    }
                }
                
                const kunishus = this.game.kunishuSystem.getKunishusInCastle(c.id);
                kunishus.forEach(k => {
                    const enemyKunishuRel = k.getRelation(targetCastle.ownerClan);
                    if (k.getRelation(myClanId) >= 70 && k.soldiers >= 1000 && enemyKunishuRel < 100) {
                        const isNextToMyAnyCastle = this.game.castles.some(myC => myC.ownerClan === myClanId && GameSystem.isAdjacent(c, myC));
                        const isNextToEnemy = GameSystem.isAdjacent(c, targetCastle);
                        if (isNextToMyAnyCastle || isNextToEnemy) {
                            const members = this.game.kunishuSystem.getKunishuMembers(k.id);
                            if (members.length > 0) {
                                allyForceCandidates.push({ castle: c, force: { isKunishu: true, id: k.id, name: k.getName(this.game), soldiers: k.soldiers } });
                            }
                        }
                    }
                });
            });

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
                this.game.ui.showDialog(`${targetCastle.name}に攻め込みますか？\n今月の命令は終了となります`, true, 
                    async () => {
                        // ★「はい」を押した直後に、メイン軍と援軍の雪の被害をまとめて計算します！
                        let finalAtkBushos = [...atkBushos];
                        let finalSVal = sVal;
                        
                        const srcProv = this.game.provinces.find(p => p.id === atkCastle.provinceId);
                        const tgtProv = this.game.provinces.find(p => p.id === targetCastle.provinceId);
                        const isMainHeavySnow = (srcProv && srcProv.statusEffects && srcProv.statusEffects.includes('heavySnow')) || 
                                                (tgtProv && tgtProv.statusEffects && tgtProv.statusEffects.includes('heavySnow'));
                                                
                        let isSelfReinfHeavySnow = false;
                        if (selfReinfData) {
                            const reinfProv = this.game.provinces.find(p => p.id === selfReinfData.castle.provinceId);
                            isSelfReinfHeavySnow = (reinfProv && reinfProv.statusEffects && reinfProv.statusEffects.includes('heavySnow')) || 
                                                   (tgtProv && tgtProv.statusEffects && tgtProv.statusEffects.includes('heavySnow'));
                        }

                        // ★メイン軍の被害判定
                        if (isMainHeavySnow) {
                            const survivingBushos = [];
                            for (let b of finalAtkBushos) {
                                if (Math.random() < 0.10) {
                                    await this.game.ui.showDialogAsync(`【強行軍】\n我が軍の${b.name}が凍死しました……`, false, 0);
                                    await this.game.lifeSystem.executeDeath(b);
                                } else {
                                    survivingBushos.push(b);
                                }
                            }
                            finalAtkBushos = survivingBushos;

                            const lossRate = 0.20 + Math.random() * 0.30;
                            const lostSoldiers = Math.floor(finalSVal * lossRate);
                            finalSVal -= lostSoldiers;

                            if (lostSoldiers > 0) {
                                await this.game.ui.showDialogAsync(`【強行軍】\n我が軍の兵士${lostSoldiers}人が遭難しました……`, false, 0);
                            }
                        }

                        // ★自軍援軍の被害判定
                        if (selfReinfData && isSelfReinfHeavySnow) {
                            const survivingReinfBushos = [];
                            for (let b of selfReinfData.bushos) {
                                if (Math.random() < 0.10) {
                                    await this.game.ui.showDialogAsync(`【強行軍】\n援軍の${b.name}が凍死しました……`, false, 0);
                                    await this.game.lifeSystem.executeDeath(b);
                                } else {
                                    survivingReinfBushos.push(b);
                                }
                            }
                            selfReinfData.bushos = survivingReinfBushos;

                            const lossRate = 0.20 + Math.random() * 0.30;
                            const lostSoldiers = Math.floor(selfReinfData.soldiers * lossRate);
                            selfReinfData.soldiers -= lostSoldiers;

                            if (lostSoldiers > 0) {
                                await this.game.ui.showDialogAsync(`【強行軍】\n援軍の兵士${lostSoldiers}人が遭難しました……`, false, 0);
                            }
                        }

                        // ★メイン軍が全滅してしまった時の特別ルール！
                        if (finalAtkBushos.length === 0) {
                            await this.game.ui.showDialogAsync("【強行軍】\n我が軍は行方不明になりました……", false, 0);
                            atkCastle.soldiers = Math.max(0, atkCastle.soldiers - sVal);
                            atkCastle.rice = Math.max(0, atkCastle.rice - rVal);
                            atkCastle.horses = Math.max(0, (atkCastle.horses || 0) - hVal);
                            atkCastle.guns = Math.max(0, (atkCastle.guns || 0) - gVal);
                            
                            // メイン軍がいないのに援軍が生き残っていたら、城へ帰します
                            if (selfReinfData && selfReinfData.bushos.length > 0) {
                                const hc = selfReinfData.castle;
                                hc.soldiers = Math.min(99999, hc.soldiers + selfReinfData.soldiers);
                                hc.rice = Math.min(99999, hc.rice + selfReinfData.rice);
                                hc.horses = Math.min(99999, (hc.horses || 0) + selfReinfData.horses);
                                hc.guns = Math.min(99999, (hc.guns || 0) + selfReinfData.guns);
                                selfReinfData.bushos.forEach(b => b.isActionDone = false);
                                await this.game.ui.showDialogAsync("メイン軍が壊滅したため、援軍は元の城へ帰還しました。", false, 0);
                            } else if (selfReinfData && selfReinfData.bushos.length === 0) {
                                // 援軍も全滅していたらそのまま消滅
                                await this.game.ui.showDialogAsync("援軍も行方不明になりました……", false, 0);
                            }
                            
                            this.game.ui.updatePanelHeader();
                            this.game.ui.renderCommandMenu();
                            return; // 戦争を中止します
                        }

                        // ★援軍だけ全滅した場合
                        if (selfReinfData && selfReinfData.bushos.length === 0) {
                            await this.game.ui.showDialogAsync("【強行軍】\n援軍は行方不明になりました……", false, 0);
                            selfReinfData = null; // 援軍はなかったことにします
                        }

                        proceedToAlly(selfReinfData, finalAtkBushos, finalSVal);
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
                            let colorClass = "log-color-atk";
                            this.game.ui.log(`【自軍援軍】出陣が取りやめられたため、<span class="${colorClass}">${hc.name}</span> の援軍は帰還しました。`);
                        }
                    }
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
            !b.isDaimyo && !b.isCastellan && b.status !== 'ronin' && b.belongKunishuId === 0
        ).sort((a,b) => b.strength - a.strength);

        let bushoCount = 1;
        if (reinfSoldiers >= 1500) bushoCount = 2;
        if (reinfSoldiers >= 2500) bushoCount = 3;
        if (bushoCount > availableBushos.length) bushoCount = availableBushos.length;

        const reinfBushos = availableBushos.slice(0, bushoCount);
        const reinfRice = reinfSoldiers; 
        const reinfHorses = Math.min(helperCastle.horses || 0, Math.floor(reinfSoldiers * 0.5)); 
        const reinfGuns = Math.min(helperCastle.guns || 0, Math.floor(reinfSoldiers * 0.5));

        helperCastle.soldiers = Math.max(0, helperCastle.soldiers - reinfSoldiers);
        helperCastle.rice = Math.max(0, helperCastle.rice - reinfRice);
        helperCastle.horses = Math.max(0, (helperCastle.horses || 0) - reinfHorses);
        helperCastle.guns = Math.max(0, (helperCastle.guns || 0) - reinfGuns);
        reinfBushos.forEach(b => b.isActionDone = true);

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
                reinfBushos.forEach(b => b.isActionDone = true);

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
                    let finalSVal = reinfSoldiers;
                    let finalBushosData = [...reinfBushosData];
                    let finalBushos = finalBushosData.map(id => this.game.getBusho(id));

                    if (isHeavySnow) {
                        // ★修正：武将の凍死を先に判定します！
                        const survivingBushos = [];
                        for (let b of finalBushos) {
                            if (Math.random() < 0.10) {
                                await this.game.ui.showDialogAsync(`【強行軍】\n我が軍の${b.name}が凍死しました……`, false, 0);
                                await this.game.lifeSystem.executeDeath(b);
                            } else {
                                survivingBushos.push(b);
                            }
                        }
                        finalBushos = survivingBushos;

                        // ★その次に兵士の遭難を判定します！
                        const lossRate = 0.20 + Math.random() * 0.30;
                        const lostSoldiers = Math.floor(finalSVal * lossRate);
                        finalSVal -= lostSoldiers;

                        if (lostSoldiers > 0) {
                            await this.game.ui.showDialogAsync(`【強行軍】\n我が軍の兵士${lostSoldiers}人が遭難しました……`, false, 0);
                        }

                        if (finalBushos.length === 0) {
                            await this.game.ui.showDialogAsync("【強行軍】\n我が軍は行方不明になりました……", false, 0);
                            helperCastle.soldiers = Math.max(0, helperCastle.soldiers - reinfSoldiers);
                            helperCastle.rice = Math.max(0, helperCastle.rice - reinfRice);
                            helperCastle.horses = Math.max(0, (helperCastle.horses || 0) - reinfHorses);
                            helperCastle.guns = Math.max(0, (helperCastle.guns || 0) - reinfGuns);
                            
                            this.game.ui.updatePanelHeader();
                            this.game.ui.renderCommandMenu();
                            onComplete(null);
                            return;
                        }
                    }

                    helperCastle.soldiers = Math.max(0, helperCastle.soldiers - reinfSoldiers);
                    helperCastle.rice = Math.max(0, helperCastle.rice - reinfRice);
                    helperCastle.horses = Math.max(0, (helperCastle.horses || 0) - reinfHorses);
                    helperCastle.guns = Math.max(0, (helperCastle.guns || 0) - reinfGuns);
                    finalBushos.forEach(b => b.isActionDone = true);

                    const selfReinfData = {
                        castle: helperCastle, bushos: finalBushos, soldiers: finalSVal,
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
        
        // ★ 追加：諸勢力が選ばれていた場合の特別な処理です！
        if (force && force.isKunishu) {
            const kunishu = this.game.kunishuSystem.getKunishu(force.id);
            const currentRel = kunishu.getRelation(myClanId);
            
            // ★追加：大雪ならAI（諸勢力）は絶対に断ります！
            let isSuccess = false;
            if (!isHeavySnow) {
                let prob = currentRel - 50; 
                prob += Math.floor((gold / 1500) * 15);
                prob += 50; 
                isSuccess = (Math.random() * 100 < prob);
            }
            
            if (!isSuccess) {
                if (myClanId === this.game.playerClanId) {
                    const leader = this.game.getBusho(kunishu.leaderId);
                    const leaderName = leader ? leader.name : "頭領";
                    // ★大雪の時はメッセージを変えます！
                    const reasonMsg = isHeavySnow ? "大雪のため、" : "";
                    this.game.ui.showDialog(`${reasonMsg}${kunishu.getName(this.game)}の${leaderName}は援軍を拒否しました……`, false, () => this.game.warManager.startWar(atkCastle, targetCastle, atkBushos, sVal, rVal, hVal, gVal, null, selfReinfData));
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
            reinfBushos.forEach(b => b.isActionDone = true);
            
            const reinforcementData = {
                castle: helperCastle, kunishuId: kunishu.id, bushos: reinfBushos, soldiers: reinfSoldiers,
                rice: reinfRice, horses: reinfHorses, guns: reinfGuns, isSelf: false, isKunishuForce: true,
                morale: kunishu.morale || 50, training: kunishu.training || 50
            };
            
            // ★修正：プレイヤーがお願いした時だけ「承諾しました！」のお返事を復活させます！（AIのフライング報告は消したままです）
            if (myClanId === this.game.playerClanId) {
                const leader = this.game.getBusho(kunishu.leaderId);
                const leaderName = leader ? leader.name : "頭領";
                
                // ★追加：出陣元の城が「委任」されている（AI城主）かどうかでメッセージを変えます！
                if (atkCastle.isDelegated) {
                    this.game.ui.showDialog(`${kunishu.getName(this.game)}の${leaderName}が援軍として参戦しました！`, false, () => {
                        this.game.warManager.startWar(atkCastle, targetCastle, atkBushos, sVal, rVal, hVal, gVal, reinforcementData, selfReinfData);
                    });
                } else {
                    this.game.ui.showDialog(`${kunishu.getName(this.game)}の${leaderName}が援軍要請を承諾しました！`, false, () => {
                        this.game.warManager.startWar(atkCastle, targetCastle, atkBushos, sVal, rVal, hVal, gVal, reinforcementData, selfReinfData);
                    });
                }
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
            const targetClanName = this.game.clans.find(c => c.id === enemyClanId)?.name || "敵軍";
            // ★修正：AI（要請側）から見てプレイヤー（受諾側）が「支配」されている相手かどうかを確認します！
            const isBoss = (myToHelperRel && myToHelperRel.status === '支配');
            const startSelection = () => this._promptPlayerAtkReinforcement(helperCastle, atkCastle, targetCastle, atkBushos, sVal, rVal, hVal, gVal, isBoss, selfReinfData);
            
            if (isBoss) {
                this.game.ui.showDialog(`主家である ${myClanName} が侵攻します。\n当家は従属しているため直ちに出陣します！`, false, startSelection);
            } else {
                this.game.ui.showDialog(`${myClanName} から攻撃の援軍要請が届きました。(持参金: ${gold})\n援軍を派遣しますか？`, true, startSelection, () => {
                    this.game.diplomacyManager.updateSentiment(myClanId, helperClanId, -10);
                    this.game.ui.showDialog(`援軍要請を断りました。`, false, () => this.game.warManager.startWar(atkCastle, targetCastle, atkBushos, sVal, rVal, hVal, gVal, null, selfReinfData));
                });
            }
            return;
        }

        // ★追加：大雪ならAIは絶対に断ります！
        let isSuccess = false;
        // ★修正：要請側が相手を「支配」しているなら、大雪でも何でも絶対に強制参加させます！
        if (myToHelperRel && myToHelperRel.status === '支配') {
            isSuccess = true;
        } else if (!isHeavySnow) {
            // ★修正：確率計算とサイコロは、外交の専門部署にお任せします！
            const prob = this.game.diplomacyManager.getReinforcementAcceptProb(myClanId, helperClanId, enemyClanId, gold);
            isSuccess = (Math.random() * 100 < prob);
        }

        if (!isSuccess) {
            if (myClanId === this.game.playerClanId) {
                const castellan = this.game.getBusho(helperCastle.castellanId);
                const castellanName = castellan ? castellan.name : "城主";
                const reasonMsg = isHeavySnow ? "大雪のため、" : "";
                this.game.ui.showDialog(`${reasonMsg}${helperCastle.name}の${castellanName}は援軍を拒否しました……`, false, () => this.game.warManager.startWar(atkCastle, targetCastle, atkBushos, sVal, rVal, hVal, gVal, null, selfReinfData));
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
        
        const availableBushos = this.game.getCastleBushos(helperCastle.id).filter(b => !b.isDaimyo && !b.isCastellan && b.status !== 'ronin' && b.belongKunishuId === 0).sort((a,b) => b.strength - a.strength);
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
        reinfBushos.forEach(b => b.isActionDone = true);

        const reinforcementData = {
            castle: helperCastle, bushos: reinfBushos, soldiers: reinfSoldiers,
            rice: reinfRice, horses: reinfHorses, guns: reinfGuns, isSelf: false,
            morale: helperCastle.morale || 50, training: helperCastle.training || 50
        };

        this.game.warManager.applyWarHostility(helperCastle.ownerClan, false, targetCastle.ownerClan, targetCastle.isKunishu, true);
        
        // ★修正：同じく、プレイヤーがお願いした時だけ「承諾しました！」のお返事を復活させます！
        if (myClanId === this.game.playerClanId) {
            const castellan = this.game.getBusho(helperCastle.castellanId);
            const castellanName = castellan ? castellan.name : "城主";
            
            // ★追加：こちらも委任城主（AI）ならメッセージを「参戦しました！」に変えます！
            if (atkCastle.isDelegated) {
                this.game.ui.showDialog(`${helperCastle.name}の${castellanName}が同盟軍として参戦しました！`, false, () => {
                    this.game.warManager.startWar(atkCastle, targetCastle, atkBushos, sVal, rVal, hVal, gVal, reinforcementData, selfReinfData);
                });
            } else {
                this.game.ui.showDialog(`${helperCastle.name}の${castellanName}が援軍要請を承諾しました！`, false, () => {
                    this.game.warManager.startWar(atkCastle, targetCastle, atkBushos, sVal, rVal, hVal, gVal, reinforcementData, selfReinfData);
                });
            }
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
        reinfBushos.forEach(b => b.isActionDone = true);

        const reinforcementData = {
            castle: helperCastle, bushos: reinfBushos, soldiers: reinfSoldiers,
            rice: reinfRice, horses: reinfHorses, guns: reinfGuns, isAttacker: true, isSelf: false,
            morale: helperCastle.morale || 50, training: helperCastle.training || 50
        };

        this.game.warManager.applyWarHostility(helperCastle.ownerClan, false, targetCastle.ownerClan, targetCastle.isKunishu, true);
        
        // ★修正：手動で同盟軍を出した時の「出発しました！」のお返事を復活させます！
        this.game.ui.showDialog(`自軍の同盟援軍が出発しました！\n共に ${targetCastle.name} へ侵攻します！`, false, () => {
            this.game.warManager.startWar(atkCastle, targetCastle, atkBushos, sVal, rVal, hVal, gVal, reinforcementData, selfReinfData);
        });
    }
    
    // ★修正：婚姻のデータ書き換え処理も、専門部署（diplomacy.js）にお任せします！
    applyMarriageData(princessId, targetBushoId, targetClanId) {
        this.game.diplomacyManager.applyMarriageData(princessId, targetBushoId, targetClanId);
    }
}