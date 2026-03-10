/**
 * command_system.js
 * ゲーム内のコマンド実行ロジックおよびフロー制御を管理するクラス
 * 修正: 出陣時・国人衆討伐時に、指定した「騎馬」と「鉄砲」を持参する処理を追加しました
 */

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
        msg: "資金に応じて徴兵します" 
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
    // ★追加: 国人衆を攻める（鎮圧する）ための軍事コマンド
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
    'daimyo_list': {
        label: "大名", category: 'INFO',
        isSystem: true, action: 'daimyo_list'
    },

    // --- 対外：大名家 (FOREIGN_DAIMYO) ---
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

    // --- 対外：国衆 (FOREIGN_KUNISHU) ---
    'kunishu_goodwill': {
        label: "国衆親善", category: 'FOREIGN_KUNISHU',
        costGold: 0, costRice: 0,
        isMulti: false, hasAdvice: true,
        startMode: 'map_select', targetType: 'kunishu_valid'
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
    'save': { label: "ファイル保存", category: 'SYSTEM', isSystem: true, action: 'save' },
    'load': { label: "ファイル読込", category: 'SYSTEM', isSystem: true, action: 'load' },
    'settings': { label: "設定", category: 'SYSTEM', isSystem: true, action: 'settings' },
    'history': { label: "履歴", category: 'SYSTEM', isSystem: true, action: 'history' }
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
            bushos = this.game.getCastleBushos(c.id).filter(b => b.status === 'ronin'); 
            infoHtml = "<div>登用する在野武将を選択してください</div>"; 
        } 
        else if (actionType === 'employ_doer') { 
            bushos = this.game.getCastleBushos(c.id).filter(b => b.status !== 'ronin'); 
            infoHtml = "<div>登用を行う担当官を選択してください</div>"; 
        } 
        else if (actionType === 'diplomacy_doer') { 
            bushos = this.game.getCastleBushos(c.id).filter(b => b.status !== 'ronin'); 
            infoHtml = "<div>外交の担当官を選択してください</div>"; 
        }
        // ★追加：貢物を持っていく使者を選ぶリスト
        else if (actionType === 'tribute_doer') { 
            bushos = this.game.getCastleBushos(c.id).filter(b => b.status !== 'ronin'); 
            infoHtml = "<div>朝廷への使者を選択してください</div>"; 
        }
        else if (actionType === 'rumor_target_busho') { 
            bushos = this.game.getCastleBushos(targetId).filter(b => b.status !== 'ronin' && !b.isDaimyo); 
            infoHtml = "<div>流言の対象とする武将を選択してください</div>"; 
        }
        else if (actionType === 'rumor_doer') { 
            bushos = this.game.getCastleBushos(c.id).filter(b => b.status !== 'ronin'); 
            infoHtml = "<div>流言を実行する担当官を選択してください</div>"; 
        }
        else if (actionType === 'incite_doer') { 
            bushos = this.game.getCastleBushos(c.id).filter(b => b.status !== 'ronin'); 
            infoHtml = "<div>扇動を実行する担当官を選択してください</div>"; 
        }
        else if (actionType === 'headhunt_target') { 
            bushos = this.game.getCastleBushos(targetId).filter(b => b.status !== 'ronin' && !b.isDaimyo && b.belongKunishuId === 0); 
            infoHtml = "<div>引抜の対象とする武将を選択してください </div>"; 
        }
        // ★追加: 国人衆を引き抜く時に、自分の城の武将が表示されてしまうバグを直す魔法のブロックです！
        else if (actionType === 'kunishu_headhunt_target') { 
            bushos = this.game.getCastleBushos(targetId).filter(b => b.status !== 'ronin' && b.belongKunishuId === extraData.kunishuId); 
            infoHtml = "<div>引抜の対象とする国衆武将を選択してください </div>"; 
        }
        else if (actionType === 'headhunt_doer') {
            bushos = this.game.getCastleBushos(c.id).filter(b => b.status !== 'ronin'); 
            infoHtml = "<div>引抜を実行する担当官を選択してください</div>"; 
        }
        else if (actionType === 'interview') { 
            bushos = this.game.getCastleBushos(c.id).filter(b => b.status !== 'ronin' && !b.isDaimyo); 
            infoHtml = "<div>面談する武将を選択してください</div>"; 
        }
        else if (actionType === 'interview_target') { 
            bushos = this.game.bushos.filter(b => b.clan === this.game.playerClanId && b.status !== 'dead' && b.status !== 'ronin' && b.status !== 'unborn' && b.id !== extraData.interviewer.id && !b.isDaimyo);
            infoHtml = `<div>誰についての印象を聞きますか？</div>`; 
        }
        else if (actionType === 'investigate_deploy') { 
            bushos = this.game.getCastleBushos(c.id).filter(b => b.status !== 'ronin'); 
            infoHtml = "<div>調査を行う武将を選択してください(複数可)</div>"; 
        }
        else if (actionType === 'view_only') { 
            bushos = this.game.getCastleBushos(targetId); 
            infoHtml = "<div>武将一覧 (精度により情報は隠蔽されます)</div>"; 
        }
        else if (actionType === 'all_busho_list') { 
            bushos = this.game.bushos.filter(b => b.clan === this.game.playerClanId && b.status !== 'dead' && b.status !== 'ronin' && b.status !== 'unborn');
            infoHtml = "<div>我が軍の武将一覧です</div>"; 
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
            // ★追加: 内政などの通常の命令でも、未登場の武将や国人衆が勝手にリストに出ないようにします
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
        }

        // --- 並び替え（ソート） ---
        bushos.sort((a,b) => {
            const getRankScore = (target) => {
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
            case 'enemy_valid': 
                return this.game.warManager.getValidWarTargets(c);
            
            case 'enemy_all': 
                return this.game.castles.filter(target => 
                    Number(target.ownerClan) !== playerClanId && target.ownerClan !== 0
                ).map(t => t.id);

            case 'ally_other': 
                return this.game.castles.filter(target => 
                    Number(target.ownerClan) === playerClanId && target.id !== c.id &&
                    GameSystem.isReachable(this.game, c, target, playerClanId) // ★道が繋がっているか調べます！
                ).map(t => t.id);
            
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

            // ★追加: まだ壊滅していない国人衆がいる城を探してリストアップします（親善コマンド用）
            case 'kunishu_valid': {
                const activeKunishus = this.game.kunishuSystem.getAliveKunishus();
                // ★ここを追加！：親善の時は、すでに友好度100の国人衆は選べないようにします
                let validKunishus = activeKunishus;
                if (type === 'kunishu_goodwill') {
                    validKunishus = activeKunishus.filter(k => k.getRelation(playerClanId) < 100);
                }
                return [...new Set(validKunishus.map(k => k.castleId))];
            }

            // ★追加: 制圧コマンド専用！自分の城か、隣の城だけを選べるようにします
            case 'kunishu_subjugate_valid': {
                const activeKunishus = this.game.kunishuSystem.getAliveKunishus();
                // まず国人衆がいる城を全部集めます
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
            case 'delegate_list': this.game.ui.showDelegateListModal(); break;
            // ★ここを書き足し！：「settings」と呼ばれたら小窓を開きます
            case 'settings': this.game.ui.showSettingsModal(); break;
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
        if (actionType === 'rumor_doer') {
            const doer = this.game.getBusho(firstId);
            const targetBusho = this.game.getBusho(extraData.targetBushoId);
            const trueProb = GameSystem.getRumorProb(doer, targetBusho);
            this.showAdviceAndExecute('rumor', () => this.executeRumor(firstId, targetId, extraData.targetBushoId), { trueProb: trueProb });
            return;
        }

        if (actionType === 'diplomacy_doer') {
            if (extraData.subAction === 'goodwill') {
                this.game.ui.openQuantitySelector('goodwill', selectedIds, targetId);
            } else if (extraData.subAction === 'alliance') {
                const doer = this.game.getBusho(firstId);
                const targetCastle = this.game.getCastle(targetId);
                const relation = this.game.getRelation(doer.clan, targetCastle.ownerClan);
                const chance = relation.sentiment + doer.diplomacy;
                const trueProb = chance > 120 ? 0.7 : 0.0;
                this.showAdviceAndExecute('diplomacy', () => this.executeDiplomacy(firstId, targetId, 'alliance'), { trueProb: trueProb });
            } else if (extraData.subAction === 'break_alliance') {
                this.executeDiplomacy(firstId, targetId, 'break_alliance');
            } else if (extraData.subAction === 'subordinate') {
                this.showAdviceAndExecute('diplomacy', () => this.executeDiplomacy(firstId, targetId, 'subordinate'), { trueProb: 1.0 });
            } else if (extraData.subAction === 'dominate') {
                const doer = this.game.getBusho(firstId);
                const targetCastle = this.game.getCastle(targetId);
                const targetClanId = targetCastle.ownerClan;
                const myPower = this.game.getClanTotalSoldiers(doer.clan);
                const targetPower = this.game.getClanTotalSoldiers(targetClanId) || 1;
                const powerRatio = myPower / targetPower;
                let trueProb = 0;
                if (powerRatio >= 5) {
                    let prob = 20;
                    if (powerRatio >= 15) prob = 70;
                    else prob = 20 + (powerRatio - 5) * (50 / 10);
                    if (doer.diplomacy >= 50) prob += Math.min(10, (doer.diplomacy - 50) * 0.2);
                    let isAlreadySubordinate = false;
                    this.game.clans.forEach(c => {
                        if (c.id !== targetClanId && c.id !== doer.clan) {
                            const rel = this.game.getRelation(targetClanId, c.id);
                            if (rel && rel.status === '従属') isAlreadySubordinate = true;
                        }
                    });
                    if (isAlreadySubordinate) prob *= 0.2;
                    trueProb = prob / 100;
                }
                this.showAdviceAndExecute('diplomacy', () => this.executeDiplomacy(firstId, targetId, 'dominate'), { trueProb: trueProb });
            } else if (extraData.subAction === 'court_truce') {
                // ★追加：朝廷和睦は条件を満たしていれば確実に成功します！
                this.showAdviceAndExecute('diplomacy', () => this.executeCourtTruce(firstId, targetId), { trueProb: 1.0 });
            }
            return;
        }

        // ★追加: 貢物の使者を選んだら、いくら払うか（金額指定）の画面を開きます！
        if (actionType === 'tribute_doer') {
            this.game.ui.openQuantitySelector('tribute_gold', selectedIds, null);
            return;
        }

        // ★追加: 国人衆のコマンド用
        if (actionType === 'kunishu_goodwill_doer') {
            this.game.ui.openQuantitySelector('goodwill', selectedIds, targetId, { isKunishu: true, kunishuId: extraData.kunishuId });
            return;
        }
        if (actionType === 'kunishu_headhunt_target') {
            this.game.ui.openBushoSelector('kunishu_headhunt_doer', null, { targetId: firstId, kunishuId: extraData.kunishuId });
            return;
        }
        if (actionType === 'kunishu_headhunt_doer') {
            this.game.ui.openQuantitySelector('headhunt_gold', selectedIds, extraData.targetId, { isKunishu: true, kunishuId: extraData.kunishuId });
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
             const trueProb = GameSystem.getInciteProb(doer);
             this.showAdviceAndExecute('incite', () => this.executeIncite(firstId, targetId), { trueProb: trueProb });
             return;
        }

        if (actionType === 'charity') {
            this.showAdviceAndExecute('charity', () => this.executeCharity(selectedIds, 'rice'), { trueProb: 1.0 });
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
            const val = parseInt(inputs.gold.num.value);
            if (val <= 0) return;
            this.showAdviceAndExecute('draft', () => this.executeDraft(data, val), { val: val, trueProb: 1.0 });
        }
        else if (type === 'goodwill') {
            const val = parseInt(inputs.gold.num.value);
            if (val < 100) { this.game.ui.showDialog("金が足りません(最低100)", false); return; }
            
            // ★追加: 国人衆への親善なら
            if (extraData && extraData.isKunishu) {
                this.showAdviceAndExecute('kunishu_goodwill', () => this.executeKunishuGoodwill(data[0], extraData.kunishuId, val), { trueProb: 1.0 });
            } else {
                this.showAdviceAndExecute('goodwill', () => this.executeDiplomacy(data[0], targetId, 'goodwill', val), { trueProb: 1.0 });
            }
        }
        else if (type === 'tribute_gold') {
            // ★追加：貢物の金額が決まったら、実行の魔法を呼び出します
            const val = parseInt(inputs.gold.num.value);
            if (val <= 0) return;
            this.showAdviceAndExecute('tribute', () => this.executeTribute(data[0], val), { trueProb: 1.0 });
        }
        else if (type === 'headhunt_gold') {
            const val = parseInt(inputs.gold.num.value);
            // ★追加: 国人衆からの引き抜きなら
            if (extraData && extraData.isKunishu) {
                const doer = this.game.getBusho(data[0]);
                const target = this.game.getBusho(targetId);
                const kunishu = this.game.kunishuSystem.getKunishu(extraData.kunishuId);
                const targetLord = this.game.getBusho(kunishu.leaderId) || { affinity: 50 }; 
                const newLord = this.game.bushos.find(b => b.clan === this.game.playerClanId && b.isDaimyo) || { affinity: 50 };
                const trueProb = GameSystem.getHeadhuntProb(doer, target, val, targetLord, newLord);
                this.showAdviceAndExecute('kunishu_headhunt', () => this.executeKunishuHeadhunt(data[0], targetId, val, extraData.kunishuId), { trueProb: trueProb });
            } else {
                const doer = this.game.getBusho(data[0]);
                const target = this.game.getBusho(targetId);
                const targetLord = this.game.bushos.find(b => b.clan === target.clan && b.isDaimyo) || { affinity: 50 }; 
                const newLord = this.game.bushos.find(b => b.clan === this.game.playerClanId && b.isDaimyo) || { affinity: 50 }; 
                const trueProb = GameSystem.getHeadhuntProb(doer, target, val, targetLord, newLord);
                this.showAdviceAndExecute('headhunt', () => this.executeHeadhunt(data[0], targetId, val), { trueProb: trueProb });
            }
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
            
            const targetName = this.game.getCastle(targetId).name;
            
            // ★国人衆の制圧なら
            if (extraData && extraData.isKunishu) {
                const kunishu = this.game.kunishuSystem.getKunishu(extraData.kunishuId);
                
                // ★頭領の名前ではなく、国人衆の正式な名前を取得する魔法を使います
                const kunishuName = kunishu.getName(this.game);
                
                // ★メッセージの中身も、取得した「kunishuName」をそのまま表示するように直しました
                this.game.ui.showDialog(`${targetName}周辺に根付く ${kunishuName} を討伐しますか？\n今月の命令は終了となります`, true, () => {
                    this.executeKunishuSubjugate(castle, targetId, data, sVal, rVal, hVal, gVal, kunishu);
                });
            } else {
                // ★修正：「攻め込みますか？」の確認は後回しにして、まずは自軍の援軍を探す魔法に直結させます！
                const bushos = data.map(id => this.game.getBusho(id));
                this.checkReinforcementAndStartWar(castle, targetId, bushos, sVal, rVal, hVal, gVal);
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

                    const val = GameSystem.calcTraining(busho); 
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

                    const val = GameSystem.calcSoldierCharity(busho); 
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
        
        // ★追加: もし国人衆の武将だったら登用はできません（引抜を使いましょう）
        if (target.belongKunishuId > 0) {
            this.game.ui.showDialog(`${target.name}は国人衆に所属しているため登用できません。`, false);
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

    executeDiplomacy(doerId, targetCastleId, type, gold = 0) {
        const doer = this.game.getBusho(doerId);
        const targetCastle = this.game.getCastle(targetCastleId);
        if (!targetCastle) return;
        
        const targetClanId = targetCastle.ownerClan;
        let msg = "";
        const isPlayerInvolved = (doer.clan === this.game.playerClanId || targetClanId === this.game.playerClanId);

        const myPower = this.game.getClanTotalSoldiers(doer.clan) || 1;
        const targetPower = this.game.getClanTotalSoldiers(targetClanId) || 1;

        if (type === 'goodwill') {
            let isSuccess = true;
            if (targetClanId !== this.game.playerClanId) {
                isSuccess = this.game.diplomacyManager.checkDiplomacySuccess(doer.clan, targetClanId, type, doer.diplomacy, myPower, targetPower);
            }

            if (isSuccess) {
                const increase = this.calcGoodwillIncrease(gold, doer);
                this.game.diplomacyManager.updateSentiment(doer.clan, targetClanId, increase);
                
                const castle = this.game.getCastle(doer.castleId); 
                if(castle) castle.gold -= gold;
                
                msg = `${doer.name}が親善を行いました\n友好度が上昇しました`;
                doer.achievementTotal += Math.floor(doer.diplomacy * 0.2) + 10;
                this.game.factionSystem.updateRecognition(doer, 15);
            } else {
                msg = `${this.game.clans.find(c => c.id === targetClanId).name} に親善の品を突き返されました……\n友好度は変わりませんでした`;
                doer.achievementTotal += 5;
                this.game.factionSystem.updateRecognition(doer, 5);
            }

        } else if (type === 'alliance') {
            let isSuccess = this.game.diplomacyManager.checkDiplomacySuccess(doer.clan, targetClanId, type, doer.diplomacy, myPower, targetPower);

            if (isSuccess) {
                this.game.diplomacyManager.changeStatus(doer.clan, targetClanId, '同盟');
                msg = `同盟の締結に成功しました！`;
                doer.achievementTotal += Math.floor(doer.diplomacy * 0.2) + 10;
                this.game.factionSystem.updateRecognition(doer, 30);
            } else {
                this.game.diplomacyManager.updateSentiment(doer.clan, targetClanId, -10);
                msg = `同盟の締結に失敗しました……`;
                doer.achievementTotal += 5;
                this.game.factionSystem.updateRecognition(doer, 10);
            }

        } else if (type === 'break_alliance') {
            const result = this.game.diplomacyManager.applyBreakAlliancePenalty(doer.clan, targetClanId);

            msg = `${result.oldStatus}関係を破棄しました`;
            if (result.isBetrayal) {
                msg += `\n諸大名からの心証が悪化しました……`;
            }
            doer.achievementTotal += 5;
            this.game.factionSystem.updateRecognition(doer, 10);

        } else if (type === 'subordinate') {
            this.clearDominationRelations(doer.clan);
            this.game.diplomacyManager.changeStatus(doer.clan, targetClanId, '従属');
            msg = `${this.game.clans.find(c => c.id === targetClanId).name} に従属しました！`;
            doer.achievementTotal += Math.floor(doer.diplomacy * 0.2) + 10;
            this.game.factionSystem.updateRecognition(doer, 30);

        } else if (type === 'dominate') {
            let isSuccess = this.game.diplomacyManager.checkDiplomacySuccess(doer.clan, targetClanId, type, doer.diplomacy, myPower, targetPower);
            
            if (myPower / targetPower < 5) {
                msg = `要求を跳ね除けられました……`;
                doer.achievementTotal += 5;
                this.game.factionSystem.updateRecognition(doer, 10);
            } else if (isSuccess) {
                this.clearDominationRelations(targetClanId);
                this.game.diplomacyManager.changeStatus(doer.clan, targetClanId, '支配');
                msg = `${this.game.clans.find(c => c.id === targetClanId).name} を支配下に置くことに成功しました！`;
                doer.achievementTotal += Math.floor(doer.diplomacy * 0.2) + 20;
                this.game.factionSystem.updateRecognition(doer, 40);
            } else {
                this.game.diplomacyManager.updateSentiment(doer.clan, targetClanId, -20);
                msg = `支配の要求は拒否されました……`;
                doer.achievementTotal += 5;
                this.game.factionSystem.updateRecognition(doer, 10);
            }
        }
        
        doer.isActionDone = true;
        if (isPlayerInvolved) {
            this.game.ui.showResultModal(msg);
            if (doer.clan === this.game.playerClanId) {
                this.game.ui.updatePanelHeader();
                this.game.ui.renderCommandMenu();
            }
        }
    }

    executeSubjugation(winnerClanId, loserClanId) {
        this.game.diplomacyManager.changeStatus(winnerClanId, loserClanId, '支配');
        const winner = this.game.clans.find(c => Number(c.id) === Number(winnerClanId));
        const loser = this.game.clans.find(c => Number(c.id) === Number(loserClanId));
        if (winner && loser) {
            this.game.ui.log(`${winner.name}が${loser.name}を従属させました`);
        }
    }

    executeHeadhunt(doerId, targetBushoId, gold) {
        const doer = this.game.getBusho(doerId);
        const target = this.game.getBusho(targetBushoId);
        const castle = this.game.getCurrentTurnCastle();
        if (castle.gold < gold) { this.game.ui.showDialog("資金が足りません", false); return; }
        
        castle.gold -= gold;
        const targetLord = this.game.bushos.find(b => b.clan === target.clan && b.isDaimyo) || { affinity: 50 }; 
        const newLord = this.game.bushos.find(b => b.clan === this.game.playerClanId && b.isDaimyo) || { affinity: 50 }; 
        
        let isSuccess = GameSystem.calcHeadhunt(doer, target, gold, targetLord, newLord);
        if (target.isCastellan && isSuccess) {
            if (Math.random() > 0.33) {
                isSuccess = false;
            }
        }
        
        if (isSuccess) {
            const oldCastle = this.game.getCastle(target.castleId);
            const oldClanId = target.clan;
            const newClanId = this.game.playerClanId;
            
            // ==========================================
            // ★ここから書き足し！：他の大名家から移ってくるので、功績を半分にします！
            // 元々大名家にいて、しかも「違う大名家」に移る時だけ半分にします
            if (oldClanId !== 0 && oldClanId !== newClanId) {
                target.achievementTotal = Math.floor(target.achievementTotal / 2);
            }
            // ==========================================
            
            if (target.isCastellan && oldCastle) {
                // ■ 城主を引き抜いた場合（城ごと寝返る！）
                
                // 城の持ち主をプレイヤーの大名家に変更
                oldCastle.ownerClan = newClanId;
                
                // 城主自身のデータもプレイヤーの大名家に変更
                target.clan = newClanId;
                target.loyalty = 100; // 寝返ったので忠誠はMAX！
                target.isActionDone = true;
                target.status = 'active';
                
                // ■ 同じ城にいる部下たちの処理（independence_systemの機能を使います）
                // これにより、部下がついてくるか、逃げるか、捕まるかが自動で決まります
                const indSys = this.game.independenceSystem;
                const captiveMsgs = indSys.resolveSubordinates(oldCastle, target, targetLord, newClanId, oldClanId);
                
                // 城の城主データを更新
                this.game.updateCastleLord(oldCastle);

                // メッセージの作成
                let msg = `${doer.name}の引抜工作が成功！\n${target.name}が【${oldCastle.name}】ごと我が軍に寝返りました！`;
                if (captiveMsgs && captiveMsgs.length > 0) {
                    msg += '\n\n' + captiveMsgs.join('\n');
                }
                this.game.ui.showResultModal(msg);

            } else {
                // ■ 普通の武将（城主以外）を引き抜いた場合
                
                target.belongKunishuId = 0; 
                target.isActionDone = true; 
                
                // ★新しいお引越しセンターの魔法を使います！
                this.game.affiliationSystem.joinClan(target, newClanId, castle.id);
                
                // メッセージ表示
                this.game.ui.showResultModal(`${doer.name}の引抜工作が成功！\n${target.name}が我が軍に加わりました！`);
            }
            
            const maxStat = Math.max(target.strength, target.intelligence, target.leadership, target.charm, target.diplomacy);
            doer.achievementTotal += Math.floor(maxStat * 0.3);
            this.game.factionSystem.updateRecognition(doer, 25);
        } else {
            this.game.ui.showResultModal(`${doer.name}の引抜工作は失敗しました……\n${target.name}は応じませんでした`);
            doer.achievementTotal += 5;
            this.game.factionSystem.updateRecognition(doer, 10);
        }
        doer.isActionDone = true; this.game.ui.updatePanelHeader(); this.game.ui.renderCommandMenu();
    }
    
    // ★追加: 国人衆との親善処理です
    executeKunishuGoodwill(doerId, kunishuId, gold) {
        const doer = this.game.getBusho(doerId);
        const kunishu = this.game.kunishuSystem.getKunishu(kunishuId);
        if (!kunishu) return;
        
        const castle = this.game.getCurrentTurnCastle();
        if (castle.gold < gold) { this.game.ui.showDialog("資金が足りません", false); return; }
        castle.gold -= gold;

        const increase = this.calcGoodwillIncrease(gold, doer);
        
        const currentRel = kunishu.getRelation(this.game.playerClanId);
        kunishu.setRelation(this.game.playerClanId, currentRel + increase);
        const newRel = kunishu.getRelation(this.game.playerClanId);

        const kunishuName = kunishu.getName(this.game);
        
        doer.isActionDone = true;
        doer.achievementTotal += Math.floor(doer.diplomacy * 0.2) + 10;
        this.game.factionSystem.updateRecognition(doer, 15);

        this.game.ui.showResultModal(`${doer.name}が ${kunishuName} と親善を行いました\n友好度が上昇しました`);
        this.game.ui.updatePanelHeader();
        this.game.ui.renderCommandMenu();
    }

    // ★追加: 国人衆の武将を味方に引き抜く処理です
    executeKunishuHeadhunt(doerId, targetBushoId, gold, kunishuId) {
        const doer = this.game.getBusho(doerId);
        const target = this.game.getBusho(targetBushoId);
        const kunishu = this.game.kunishuSystem.getKunishu(kunishuId);
        
        const castle = this.game.getCurrentTurnCastle();
        if (castle.gold < gold) { this.game.ui.showDialog("資金が足りません", false); return; }
        
        if (kunishu && target.id === kunishu.leaderId) {
            this.game.ui.showDialog("国人衆の頭領は引き抜けません！", false);
            return;
        }

        castle.gold -= gold;
        
        // 相手のボス（国人衆の頭領）と新しいボス（自軍の大名）のデータを用意
        const targetLord = this.game.getBusho(kunishu.leaderId) || { affinity: 50 }; 
        const newLord = this.game.bushos.find(b => b.clan === this.game.playerClanId && b.isDaimyo) || { affinity: 50 }; 
        
        let isSuccess = GameSystem.calcHeadhunt(doer, target, gold, targetLord, newLord);

        if (isSuccess) {
            target.belongKunishuId = 0; // 国人衆を抜ける
            target.isActionDone = true; 
            
            // ★新しいお引越しセンターの魔法を使います！
            this.game.affiliationSystem.joinClan(target, this.game.playerClanId, castle.id);
            
            this.game.ui.showResultModal(`${doer.name}の引抜工作が成功！\n${target.name}が国人衆を離れ、我が軍に加わりました！`);
            const maxStat = Math.max(target.strength, target.intelligence, target.leadership, target.charm, target.diplomacy);
            doer.achievementTotal += Math.floor(maxStat * 0.3);
            this.game.factionSystem.updateRecognition(doer, 25);
        } else {
            this.game.ui.showResultModal(`${doer.name}の引抜工作は失敗しました……\n${target.name}は応じませんでした`);
            doer.achievementTotal += 5;
            this.game.factionSystem.updateRecognition(doer, 10);
        }
        doer.isActionDone = true; this.game.ui.updatePanelHeader(); this.game.ui.renderCommandMenu();
    }
    
    // ★追加: 国人衆を攻めて壊滅させるための処理（必ず攻城戦になります）
    // ★修正: 騎馬（sendHorses）と鉄砲（sendGuns）も出陣時に持っていくようにしました
    executeKunishuSubjugate(atkCastle, targetCastleId, atkBushosIds, sendSoldiers, sendRice, sendHorses, sendGuns, kunishu) {
        const atkBushos = atkBushosIds.map(id => this.game.getBusho(id));
        const targetCastle = this.game.getCastle(targetCastleId);
        
        // 攻撃する側（プレイヤー）の城から、出陣する数だけ兵士や兵糧、騎馬、鉄砲を減らします
        atkCastle.soldiers = Math.max(0, atkCastle.soldiers - sendSoldiers);
        atkCastle.rice = Math.max(0, atkCastle.rice - sendRice);
        atkCastle.horses = Math.max(0, (atkCastle.horses || 0) - sendHorses);
        atkCastle.guns = Math.max(0, (atkCastle.guns || 0) - sendGuns);
        atkBushos.forEach(b => b.isActionDone = true);

        // 国人衆側の準備（一時的なダミーの城と軍団を作ります）
        const kunishuName = kunishu.getName(this.game);
        const leader = this.game.getBusho(kunishu.leaderId);
        // この戦い限定の「守備側データ」を作成
        const dummyDefender = {
            id: targetCastleId,
            name: kunishuName, // ←★城の名前をくっつけず、国人衆の名前（伊賀衆など）だけにします！
            ownerClan: -1,
            soldiers: kunishu.soldiers,
            defense: kunishu.defense,
            maxDefense: kunishu.maxDefense,
            training: 50,
            morale: 80,
            rice: Math.floor(kunishu.soldiers * 1.5), 
            isKunishu: true,
            kunishuId: kunishu.id,
            peoplesLoyalty: 100, // 下がっても国人衆には影響なし
            population: 1000,
            samuraiIds: [] 
        };

        // ★修正: 出陣する遠征軍の荷物に「horses（騎馬）」と「guns（鉄砲）」を追加しました！
        const attackerForce = { 
            name: atkCastle.name + "遠征軍", ownerClan: atkCastle.ownerClan, soldiers: sendSoldiers, 
            bushos: atkBushos, training: atkCastle.training, morale: atkCastle.morale, rice: sendRice, maxRice: sendRice,
            horses: sendHorses, guns: sendGuns
        };

        // ★修正: 国人衆への攻撃をしたので、友好度を低下させます
        let currentRel = kunishu.getRelation(this.game.playerClanId);
        let nextRel = currentRel;
        if (currentRel >= 60) nextRel = 30;
        else if (currentRel >= 31) nextRel -= 30;
        else nextRel = 0;
        kunishu.setRelation(this.game.playerClanId, nextRel);

        // 戦争マネージャーにデータを渡してスタート
        this.game.warManager.state = { 
            active: true, round: 1, attacker: attackerForce, sourceCastle: atkCastle, 
            defender: dummyDefender, atkBushos: atkBushos, defBusho: leader || {name:"国人衆", strength:50, intelligence:50, leadership:50}, 
            turn: 'attacker', isPlayerInvolved: true, deadSoldiers: { attacker: 0, defender: 0 }, defenderGuarding: false,
            isKunishuSubjugation: true // 制圧戦であることをマーク
        };

        // 野戦を飛ばして、いきなり攻城戦からスタート
        this.game.warManager.startSiegeWarPhase();
        this.game.ui.updatePanelHeader();
        this.game.ui.renderCommandMenu();
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
    
    executeIncite(doerId, targetId) { 
        const doer = this.game.getBusho(doerId); 
        const target = this.game.getCastle(targetId); 
        const result = GameSystem.calcIncite(doer); 
        if(result.success) { 
            const oldVal = target.peoplesLoyalty;
            target.peoplesLoyalty = Math.max(0, target.peoplesLoyalty - result.val); 
            const actualDrop = oldVal - target.peoplesLoyalty;
            this.game.ui.showResultModal(`${doer.name}の扇動が成功！\n${target.name}の民忠が${actualDrop}低下しました`); 
            doer.achievementTotal += Math.floor(doer.intelligence * 0.2) + 10;
            this.game.factionSystem.updateRecognition(doer, 20); 
        } else { 
            this.game.ui.showResultModal(`${doer.name}の扇動は失敗しました`); 
            doer.achievementTotal += 5; 
            this.game.factionSystem.updateRecognition(doer, 10); 
        } 
        doer.isActionDone = true; this.game.ui.updatePanelHeader(); this.game.ui.renderCommandMenu(); 
    }

    executeRumor(doerId, castleId, targetBushoId) { 
        const doer = this.game.getBusho(doerId); 
        const targetBusho = this.game.getBusho(targetBushoId); 
        
        let result = GameSystem.calcRumor(doer, targetBusho); 
        if (targetBusho.isCastellan && result.success) {
            if (Math.random() > 0.33) {
                result.success = false;
            }
        }

        if(result.success) { 
            const oldVal = targetBusho.loyalty;
            targetBusho.loyalty = Math.max(0, targetBusho.loyalty - result.val); 
            const actualDrop = oldVal - targetBusho.loyalty;
            this.game.ui.showResultModal(`${doer.name}の流言が成功！\n${targetBusho.name}の忠誠が低下しました`);
            doer.achievementTotal += Math.floor(doer.intelligence * 0.2) + 10;
            this.game.factionSystem.updateRecognition(doer, 20); 
        } else { 
            this.game.ui.showResultModal(`${doer.name}の流言は失敗しました`); 
            doer.achievementTotal += 5; 
            this.game.factionSystem.updateRecognition(doer, 10); 
        } 
        doer.isActionDone = true; this.game.ui.updatePanelHeader(); this.game.ui.renderCommandMenu(); 
    }

    executeTrade(type, amount) {
        const castle = this.game.getCurrentTurnCastle(); 
        const rate = this.game.marketRate;
        
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

    executeDraft(bushoIds, gold) { 
        const castle = this.game.getCurrentTurnCastle(); 
        if(castle.gold < gold) { this.game.ui.showDialog("資金不足", false); return; } 
        
        const busho = this.game.getBusho(bushoIds[0]); 
        let soldiers = GameSystem.calcDraftFromGold(gold, busho, castle.population); 
        soldiers = Math.floor(soldiers / 10);
        
        if (castle.soldiers + soldiers > 99999) {
            this.game.ui.showDialog(`兵数が上限(99,999)を超えるため、これ以上徴兵できません。\n(現在の兵数: ${castle.soldiers})`, false);
            return;
        }
        
        castle.gold -= gold;
        
        const newMorale = Math.max(0, castle.morale - 10); 
        const newTraining = Math.max(0, castle.training - 10); 
        
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
    
    executeCharity(bushoIds, type) { 
        const castle = this.game.getCurrentTurnCastle(); 
        const spec = COMMAND_SPECS['charity']; 
        
        let singleCostGold = 0, singleCostRice = 0; 
        if (type === 'gold' || type === 'both') singleCostGold = spec.costGold; 
        if (type === 'rice' || type === 'both') singleCostRice = spec.costRice; 

        const totalCostGold = singleCostGold * bushoIds.length;
        const totalCostRice = singleCostRice * bushoIds.length;
        
        if (castle.gold < totalCostGold || castle.rice < totalCostRice) { 
            this.game.ui.showDialog("物資不足", false); 
            return; 
        } 
        
        castle.gold -= totalCostGold; 
        castle.rice -= totalCostRice; 
       
        let totalVal = 0;
        let count = 0;

        bushoIds.forEach(bid => {
            const busho = this.game.getBusho(bid);
            if (!busho) return;

            let val = GameSystem.calcCharity(busho, type); 
            val = Math.floor(val / 6); 
            if (val < 1) val = 1;

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
            case 'war': return "攻撃目標を選択してください(攻略直後の城は選択不可)";
            case 'kunishu_subjugate': return "討伐する国人衆がいる城を選択してください";
            case 'move': return "移動先を選択してください";
            case 'transport': return "輸送先を選択してください";
            case 'investigate': return "調査対象の城を選択してください";
            case 'incite': return "扇動対象の城を選択してください";
            case 'rumor': return "流言対象の城を選択してください";
            case 'headhunt': case 'headhunt_select_castle': return "引抜対象の居城を選択してください";
            case 'kunishu_headhunt': return "引抜対象の国人衆がいる城を選択してください";
            case 'goodwill': case 'alliance': return "外交相手を選択してください";
            case 'kunishu_goodwill': return "親善を行う国人衆がいる城を選択してください";
            case 'break_alliance': return "同盟破棄する相手を選択してください";
            case 'court_truce': return "和睦を行う相手を選択してください"; // ★これを追加！
            // ★ここから下を追加！
            case 'atk_self_reinforcement': return "援軍を出陣させる城を選択してください";
            case 'atk_ally_reinforcement': return "援軍を要請する城を選択してください";
            case 'def_self_reinforcement': return "援軍を出陣させる城を選択してください";
            case 'def_ally_reinforcement': return "援軍を要請する城を選択してください";
            // ★追加ここまで
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

            // ★追加: 他大名か国衆かを選ぶ処理（自軍援軍の時はスルーします）
            if (mode === 'atk_ally_reinforcement' || mode === 'def_ally_reinforcement') {
                const forces = [];
                const myClanId = (mode === 'atk_ally_reinforcement') ? temp.atkCastle.ownerClan : temp.defCastle.ownerClan;
                const enemyClanId = (mode === 'atk_ally_reinforcement') ? temp.targetCastle.ownerClan : this.game.warManager.state.attacker.ownerClan;

                // 1. 大名家が援軍を出せるかチェック
                if (targetCastle.ownerClan !== 0 && targetCastle.ownerClan !== myClanId && targetCastle.ownerClan !== enemyClanId) {
                    const rel = this.game.getRelation(myClanId, targetCastle.ownerClan);
                    const enemyRel = this.game.getRelation(targetCastle.ownerClan, enemyClanId);
                    if (rel && ['友好', '同盟', '支配', '従属'].includes(rel.status) && rel.sentiment >= 50) {
                        if (!enemyRel || !this.game.diplomacyManager.isNonAggression(enemyRel.status)) {
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

                // 2. 国人衆が援軍を出せるかチェック
                const kunishus = this.game.kunishuSystem.getKunishusInCastle(targetCastle.id);
                kunishus.forEach(k => {
                    if (k.getRelation(myClanId) >= 70 && k.soldiers >= 1000) {
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

                if (forces.length === 1) {
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
                if (this.game.warManager && this.game.warManager._promptPlayerDefSelfReinforcement) {
                    this.game.warManager._promptPlayerDefSelfReinforcement(targetCastle, temp.defCastle, temp.onComplete, backToMap);
                }
            }
            return;
        }
        // ==========================================
        
        this.game.ui.cancelMapSelection(); 

        const onBackToMap = () => {
            this.enterMapSelection(mode);
        };

        // ★変更: 国人衆のコマンドなら、どの国人衆を対象にするかを選びます
        if (['kunishu_subjugate', 'kunishu_headhunt', 'kunishu_goodwill'].includes(mode)) {
            const kunishus = this.game.kunishuSystem.getKunishusInCastle(targetCastle.id);
            if (kunishus.length === 0) {
                this.game.ui.showDialog("この城には行動可能な国人衆がいません。", false);
                return;
            }

            // 選択したあとの処理をまとめる
            const proceedKunishuCommand = (selectedKunishuId) => {
                if (mode === 'kunishu_goodwill') {
                    this.game.ui.openBushoSelector('kunishu_goodwill_doer', targetCastle.id, { kunishuId: selectedKunishuId }, onBackToMap);
                } else if (mode === 'kunishu_headhunt') {
                    this.game.ui.openBushoSelector('kunishu_headhunt_target', targetCastle.id, { kunishuId: selectedKunishuId }, onBackToMap);
                } else if (mode === 'kunishu_subjugate') {
                    this.game.ui.openBushoSelector('kunishu_subjugate_deploy', targetCastle.id, { kunishuId: selectedKunishuId }, onBackToMap);
                }
            };
            
            // 🌟 1つしかいないならそのまま進み、複数いるなら「選ぶ画面」を出します！
            if (kunishus.length === 1) {
                proceedKunishuCommand(kunishus[0].id);
            } else {
                // ↓ここに「, onBackToMap」を書き足しました！
                this.game.ui.showKunishuSelector(kunishus, proceedKunishuCommand, onBackToMap);
            }
            return; // 国衆コマンドの場合はここで終了
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
        }
    }
    
    clearDominationRelations(clanId) {
        this.game.clans.forEach(c => {
            if (c.id !== clanId) {
                const rel = this.game.getRelation(clanId, c.id);
                if (rel && (rel.status === '支配' || rel.status === '従属')) {
                    this.game.diplomacyManager.changeStatus(clanId, c.id, '普通');
                }
            }
        });
    }
    
    // ★追加: AIからプレイヤーへの外交提案を受ける処理
    proposeDiplomacyToPlayer(doer, targetClanId, type, gold, onComplete) {
        // ★ aiGuard を消す魔法を削除しました
        const doerClan = this.game.clans.find(c => c.id === doer.clan);

        // ★追加：使者を出したAIの城からお金を減らす処理
        if (type === 'goodwill') {
            const doerCastle = this.game.getCastle(doer.castleId);
            if (doerCastle) doerCastle.gold = Math.max(0, doerCastle.gold - gold);
        }

        let title = "使者の来訪";
        let msg = "";
        
        if (type === 'goodwill') {
            msg = `${doerClan.name} の ${doer.name} が使者として訪れました。\n親善の証として 金${gold} を持参しています。\n受け取りますか？`;
        } else if (type === 'alliance') {
            msg = `${doerClan.name} の ${doer.name} が使者として訪れました。\n当家との「同盟」を提案しています。\n受諾しますか？`;
        } else if (type === 'dominate') {
            msg = `${doerClan.name} の ${doer.name} が使者として訪れました。\n当家に「従属」するよう要求しています。\n受諾しますか？`;
        }

        // はい／いいえ を選べるダイアログを出します
        this.game.ui.showDialog(msg, true, 
            () => {
                // 【受諾（OK）を選んだ時】
                if (type === 'goodwill') {
                    const myCastle = this.game.castles.find(c => c.ownerClan === targetClanId);
                    if (myCastle) myCastle.gold = Math.min(99999, myCastle.gold + gold);
                    const increase = this.calcGoodwillIncrease(gold, doer);
                    this.game.diplomacyManager.updateSentiment(doer.clan, targetClanId, increase);
                    this.game.ui.showResultModal(`${doerClan.name} からの親善を受け入れました！\n友好度が上昇しました`, () => {
                        // ★修正: 画面がフリーズしないように、0.1秒だけ待ってから次に進むようにしました
                        if (onComplete) setTimeout(onComplete, 100);
                    });
                } else if (type === 'alliance') {
                    this.game.diplomacyManager.changeStatus(doer.clan, targetClanId, '同盟');
                    this.game.ui.showResultModal(`${doerClan.name} と同盟を結びました！`, () => {
                        // ★修正: 画面がフリーズしないように、0.1秒だけ待ってから次に進むようにしました
                        if (onComplete) setTimeout(onComplete, 100);
                    });
                } else if (type === 'dominate') {
                    this.clearDominationRelations(targetClanId);
                    this.game.diplomacyManager.changeStatus(doer.clan, targetClanId, '支配');
                    this.game.ui.showResultModal(`${doerClan.name} に従属しました……`, () => {
                        // ★修正: 画面がフリーズしないように、0.1秒だけ待ってから次に進むようにしました
                        if (onComplete) setTimeout(onComplete, 100);
                    });
                }
            },
            () => {
                // 【拒否（キャンセル）を選んだ時】
                if (type === 'goodwill') {
                    // おまけ：もし親善を拒否されたら、AIの城にお金を返してあげる処理を追加しました
                    const doerCastle = this.game.getCastle(doer.castleId);
                    if (doerCastle) doerCastle.gold = Math.min(99999, doerCastle.gold + gold);
                    this.game.ui.showResultModal(`親善の品を突き返しました。`, () => {
                        if (onComplete) setTimeout(onComplete, 100);
                    });
                } else if (type === 'alliance') {
                    this.game.diplomacyManager.updateSentiment(doer.clan, targetClanId, -10);
                    this.game.ui.showResultModal(`同盟の提案を拒否しました。`, () => {
                        if (onComplete) setTimeout(onComplete, 100);
                    });
                } else if (type === 'dominate') {
                    this.game.diplomacyManager.updateSentiment(doer.clan, targetClanId, -20);
                    this.game.ui.showResultModal(`従属の要求を断固として拒否しました！`, () => {
                        if (onComplete) setTimeout(onComplete, 100);
                    });
                }
            }
        );
    }
    
    // ★ここから下全部、援軍を探してお願いする新しい機能です！
    checkReinforcementAndStartWar(atkCastle, targetCastleId, atkBushos, sVal, rVal, hVal, gVal) {
        const myClanId = atkCastle.ownerClan;
        const targetCastle = this.game.getCastle(targetCastleId);
        const pid = this.game.playerClanId;
        
        let selfCandidates = [];
        this.game.castles.forEach(c => {
            if (c.ownerClan !== myClanId || c.id === atkCastle.id) return;
            const isNextToMyAnyCastle = this.game.castles.some(myC => myC.ownerClan === myClanId && GameSystem.isAdjacent(c, myC));
            const isNextToEnemy = GameSystem.isAdjacent(c, targetCastle);
            if (!isNextToMyAnyCastle && !isNextToEnemy) return;
            if (c.soldiers < 1000) return;
            const normalBushos = this.game.getCastleBushos(c.id).filter(b => !b.isDaimyo && !b.isCastellan && b.status !== 'ronin' && b.belongKunishuId === 0);
            if (normalBushos.length === 0) return;
            selfCandidates.push(c);
        });

        const proceedToAlly = (selfReinfData) => {
            let allyForceCandidates = [];
            this.game.castles.forEach(c => {
                // 1. 大名家
                if (c.ownerClan !== 0 && c.ownerClan !== myClanId && c.ownerClan !== targetCastle.ownerClan) {
                    const rel = this.game.getRelation(myClanId, c.ownerClan);
                    const enemyRel = this.game.getRelation(c.ownerClan, targetCastle.ownerClan);
                    if (rel && ['友好', '同盟', '支配', '従属'].includes(rel.status) && rel.sentiment >= 50) {
                        if (!enemyRel || !this.game.diplomacyManager.isNonAggression(enemyRel.status)) {
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
                
                // 2. 国人衆
                const kunishus = this.game.kunishuSystem.getKunishusInCastle(c.id);
                kunishus.forEach(k => {
                    if (k.getRelation(myClanId) >= 70 && k.soldiers >= 1000) {
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
                this.game.warManager.startWar(atkCastle, targetCastle, atkBushos, sVal, rVal, hVal, gVal, null, selfReinfData);
                return;
            }

            // マップで光らせるための「城のリスト（重複なし）」を作る
            const allyCastles = [...new Set(allyForceCandidates.map(fc => fc.castle))];

            if (myClanId === pid && !atkCastle.isDelegated) {
                this.game.ui.showDialog("他勢力（他大名・国衆）に援軍を要請しますか？", true, 
                    () => {
                        this.game.ui.showReinforcementSelector(allyCastles, atkCastle, targetCastle, atkBushos, sVal, rVal, hVal, gVal, selfReinfData);
                    },
                    () => {
                        this.game.warManager.startWar(atkCastle, targetCastle, atkBushos, sVal, rVal, hVal, gVal, null, selfReinfData);
                    }
                );
            } else {
                // AIの場合：一番兵士数が多い勢力に頼みます
                allyForceCandidates.sort((a,b) => b.force.soldiers - a.force.soldiers);
                const best = allyForceCandidates[0];
                best.castle.selectedForce = best.force; // シールを貼る
                this.executeReinforcementRequest(0, best.castle, atkCastle, targetCastle, atkBushos, sVal, rVal, hVal, gVal, selfReinfData);
            }
        };

        // ★追加：自軍援軍の処理が終わったあとに、「攻め込みますか？」の最終確認を挟むための魔法
        const askConfirmAndProceedToAlly = (selfReinfData) => {
            if (myClanId === pid && !atkCastle.isDelegated) {
                this.game.ui.showDialog(`${targetCastle.name}に攻め込みますか？\n今月の命令は終了となります`, true, 
                    () => {
                        // 「はい」：そのまま同盟軍を探す（出陣）に進みます！
                        proceedToAlly(selfReinfData);
                    },
                    () => {
                        // 「いいえ」：キャンセルした時は、もし自軍の援軍が決まっていたら城に帰してあげます！
                        if (selfReinfData) {
                            const hc = selfReinfData.castle;
                            // 減らした兵士や物資を戻します
                            hc.soldiers += selfReinfData.soldiers;
                            hc.rice += selfReinfData.rice;
                            hc.horses = (hc.horses || 0) + selfReinfData.horses;
                            hc.guns = (hc.guns || 0) + selfReinfData.guns;
                            // 行動済みを解除します
                            selfReinfData.bushos.forEach(b => b.isActionDone = false);
                            
                            let colorClass = "log-color-atk";
                            this.game.ui.log(`【自軍援軍】出陣が取りやめられたため、<span class="${colorClass}">${hc.name}</span> の援軍は帰還しました。`);
                        }
                    }
                );
            } else {
                proceedToAlly(selfReinfData);
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
            rice: reinfRice, horses: reinfHorses, guns: reinfGuns, isAttacker: true, isSelf: true
        };
        
        // ★修正：攻撃軍はプレイヤー・敵に関係なく「ピンク(log-color-atk)」にします
        let colorClass = "log-color-atk";
        const leaderName = reinfBushos.length > 0 ? reinfBushos[0].name : "総大将";
        if (targetCastle.ownerClan === this.game.playerClanId) {
            this.game.ui.showDialog(`${helperCastle.name}の${leaderName}が敵の援軍として参戦しました！`, false, () => {
                 onComplete(selfReinfData);
            });
        } else {
            this.game.ui.log(`【自軍援軍】<span class="${colorClass}">${helperCastle.name}</span> から攻撃の援軍が参戦しました。`);
            onComplete(selfReinfData);
        }
    }

    // ★ 引数の最後に「backToMap」を追加
    _promptPlayerAtkSelfReinforcement(helperCastle, atkCastle, targetCastle, onComplete, backToMap) {
        const promptBusho = () => {
            this.game.ui.openBushoSelector('atk_self_reinf_deploy', helperCastle.id, {
                onConfirm: (selectedIds) => {
                    this.handleBushoSelectionForSelfReinf(helperCastle.id, selectedIds, onComplete, promptBusho, backToMap);
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

    handleBushoSelectionForSelfReinf(helperCastleId, selectedIds, onComplete, promptBusho) {
        const helperCastle = this.game.getCastle(helperCastleId);
        const reinfBushos = selectedIds.map(id => this.game.getBusho(id));
        this.game.ui.openQuantitySelector('atk_self_reinf_supplies', [helperCastle], null, {
            onConfirm: (inputs) => {
                const inputData = inputs[helperCastle.id] || inputs;
                const reinfSoldiers = inputData.soldiers ? parseInt(inputData.soldiers.num.value) : 500;
                const reinfRice = inputData.rice ? parseInt(inputData.rice.num.value) : 500;
                const reinfHorses = inputData.horses ? parseInt(inputData.horses.num.value) : 0;
                const reinfGuns = inputData.guns ? parseInt(inputData.guns.num.value) : 0;

                helperCastle.soldiers = Math.max(0, helperCastle.soldiers - reinfSoldiers);
                helperCastle.rice = Math.max(0, helperCastle.rice - reinfRice);
                helperCastle.horses = Math.max(0, (helperCastle.horses || 0) - reinfHorses);
                helperCastle.guns = Math.max(0, (helperCastle.guns || 0) - reinfGuns);
                reinfBushos.forEach(b => b.isActionDone = true);

                const selfReinfData = {
                    castle: helperCastle, bushos: reinfBushos, soldiers: reinfSoldiers,
                    rice: reinfRice, horses: reinfHorses, guns: reinfGuns, isAttacker: true, isSelf: true
                };
                
                // ★修正：こちらも同じく「ピンク(log-color-atk)」にします
                let colorClass = "log-color-atk";
                this.game.ui.log(`【自軍援軍】<span class="${colorClass}">${helperCastle.name}</span> から攻撃の援軍が出発しました。`);
                onComplete(selfReinfData);
            },
            onCancel: promptBusho
        });
    }

    executeReinforcementRequest(gold, helperCastle, atkCastle, targetCastle, atkBushos, sVal, rVal, hVal, gVal, selfReinfData) {
        if (gold > 0) atkCastle.gold -= gold;

        const force = helperCastle.selectedForce;
        const myClanId = atkCastle.ownerClan;
        
        // ★ 追加：国人衆が選ばれていた場合の特別な処理です！
        if (force && force.isKunishu) {
            const kunishu = this.game.kunishuSystem.getKunishu(force.id);
            const currentRel = kunishu.getRelation(myClanId);
            
            let prob = currentRel - 50; 
            prob += Math.floor((gold / 1500) * 15);
            prob += 50; 
            
            let isSuccess = (Math.random() * 100 < prob);
            
            if (!isSuccess) {
                if (myClanId === this.game.playerClanId) {
                    const leader = this.game.getBusho(kunishu.leaderId);
                    const leaderName = leader ? leader.name : "頭領";
                    this.game.ui.showDialog(`${kunishu.getName(this.game)}の${leaderName}は援軍を拒否しました……`, false, () => this.game.warManager.startWar(atkCastle, targetCastle, atkBushos, sVal, rVal, hVal, gVal, null, selfReinfData));
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
                rice: reinfRice, horses: reinfHorses, guns: reinfGuns, isAttacker: true, isSelf: false, isKunishuForce: true
            };
            
            if (myClanId === this.game.playerClanId) {
                const leader = this.game.getBusho(kunishu.leaderId);
                const leaderName = leader ? leader.name : "頭領";
                this.game.ui.showDialog(`${kunishu.getName(this.game)}の${leaderName}が援軍要請を承諾しました！`, false, () => {
                    this.game.warManager.startWar(atkCastle, targetCastle, atkBushos, sVal, rVal, hVal, gVal, reinforcementData, selfReinfData);
                });
            } else {
                const leaderName = reinfBushos.length > 0 ? reinfBushos[0].name : "頭領";
                if (targetCastle.ownerClan === this.game.playerClanId) {
                    this.game.ui.showDialog(`${kunishu.getName(this.game)}の${leaderName}が敵の援軍として向かっています！`, false, () => {
                        this.game.warManager.startWar(atkCastle, targetCastle, atkBushos, sVal, rVal, hVal, gVal, reinforcementData, selfReinfData);
                    });
                } else {
                    this.game.ui.log(`【同盟援軍】${atkCastle.name}軍の要請により、${kunishu.getName(this.game)}が攻撃の援軍として参戦しました。`);
                    this.game.warManager.startWar(atkCastle, targetCastle, atkBushos, sVal, rVal, hVal, gVal, reinforcementData, selfReinfData);
                }
            }
            return;
        }

        // 以降は今まで通りの大名家の処理です
        const helperClanId = helperCastle.ownerClan;
        const enemyClanId = targetCastle.ownerClan;
        const myToHelperRel = this.game.getRelation(myClanId, helperClanId);
        const helperToEnemyRel = this.game.getRelation(helperClanId, enemyClanId);

        if (helperClanId === this.game.playerClanId) {
            const myClanName = this.game.clans.find(c => c.id === myClanId)?.name || "不明";
            const targetClanName = this.game.clans.find(c => c.id === enemyClanId)?.name || "敵軍";
            const isBoss = (myToHelperRel.status === '従属');
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

        let isSuccess = false;
        if (myToHelperRel.status === '支配') isSuccess = true;
        else {
            let prob = (myToHelperRel.sentiment >= 50) ? (myToHelperRel.sentiment - 49) : 0;
            prob += Math.floor((gold / 1500) * 15);
            if (myToHelperRel.status === '同盟' || myToHelperRel.status === '従属') prob += 30;
            if (helperToEnemyRel) prob -= Math.floor((helperToEnemyRel.sentiment - 50) * (20 / 50)); 
            if (Math.random() * 100 < prob) isSuccess = true;
        }

        if (!isSuccess) {
            if (myClanId === this.game.playerClanId) {
                const castellan = this.game.getBusho(helperCastle.castellanId);
                const castellanName = castellan ? castellan.name : "城主";
                this.game.ui.showDialog(`${helperCastle.name}の${castellanName}は援軍を拒否しました……`, false, () => this.game.warManager.startWar(atkCastle, targetCastle, atkBushos, sVal, rVal, hVal, gVal, null, selfReinfData));
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
            rice: reinfRice, horses: reinfHorses, guns: reinfGuns, isAttacker: true, isSelf: false
        };

        const helperClanName = this.game.clans.find(c => c.id === helperClanId)?.name || "同盟援軍";
        this.game.warManager.applyWarHostility(helperCastle.ownerClan, false, targetCastle.ownerClan, targetCastle.isKunishu, true);
        
        if (myClanId === this.game.playerClanId) {
            const castellan = this.game.getBusho(helperCastle.castellanId);
            const castellanName = castellan ? castellan.name : "城主";
            this.game.ui.showDialog(`${helperCastle.name}の${castellanName}が援軍要請を承諾しました！`, false, () => {
                this.game.warManager.startWar(atkCastle, targetCastle, atkBushos, sVal, rVal, hVal, gVal, reinforcementData, selfReinfData);
            });
        } else {
            const leaderName = reinfBushos.length > 0 ? reinfBushos[0].name : "総大将";
            if (targetCastle.ownerClan === this.game.playerClanId) {
                this.game.ui.showDialog(`${helperClanName}の${leaderName}が敵の援軍として参戦しました！`, false, () => {
                    this.game.warManager.startWar(atkCastle, targetCastle, atkBushos, sVal, rVal, hVal, gVal, reinforcementData, selfReinfData);
                });
            } else {
                this.game.ui.log(`【同盟援軍】${atkCastle.name}軍の要請により、${helperClanName}が攻撃の援軍として参戦しました。`);
                this.game.warManager.startWar(atkCastle, targetCastle, atkBushos, sVal, rVal, hVal, gVal, reinforcementData, selfReinfData);
            }
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
            rice: reinfRice, horses: reinfHorses, guns: reinfGuns, isAttacker: true, isSelf: false
        };

        this.game.warManager.applyWarHostility(helperCastle.ownerClan, false, targetCastle.ownerClan, targetCastle.isKunishu, true);
        this.game.ui.showDialog(`自軍の同盟援軍が出発しました！\n共に ${targetCastle.name} へ侵攻します！`, false, () => {
            this.game.warManager.startWar(atkCastle, targetCastle, atkBushos, sVal, rVal, hVal, gVal, reinforcementData, selfReinfData);
        });
    }
    
    // ==========================================
    // ★追加：朝廷に貢物を贈る魔法！
    // ==========================================
    executeTribute(doerId, gold) {
        const doer = this.game.getBusho(doerId);
        const castle = this.game.getCurrentTurnCastle();
        
        if (castle.gold < gold) {
            this.game.ui.showDialog("資金が足りません", false);
            return;
        }
        
        // お城の貯金箱からお金を減らします
        castle.gold -= gold;
        
        // 魔法で大名家の「朝廷への貢献度」をアップさせます！
        this.game.courtRankSystem.addContribution(this.game.playerClanId, gold);
        
        // ★追加：信用の上昇値を計算します（金1500・外交100で225程度、最低1）
        const trustIncrease = Math.max(1, Math.floor(gold * (doer.diplomacy / 100) * 0.15));
        
        // 新しく作った魔法で、大名家の「朝廷からの信用」をアップさせます！
        this.game.courtRankSystem.addTrust(this.game.playerClanId, trustIncrease);
        
        // 確認のために、今の貢献度と信用がいくつになったか取得しておきます
        const currentContribution = this.game.courtRankSystem.getContribution(this.game.playerClanId);
        const currentTrust = this.game.courtRankSystem.getTrust(this.game.playerClanId);
        
        // 使者は行動済みにします
        doer.isActionDone = true;
        // 頑張って貢物を運んだので、少しだけ実績を与えます（金額が多いほど少しボーナス）
        doer.achievementTotal += 5 + Math.floor(gold / 500);
        this.game.factionSystem.updateRecognition(doer, 10);
        
        this.game.ui.showResultModal(`${doer.name}を使者として、朝廷に 金${gold} を献上しました！`);
        
        this.game.ui.updatePanelHeader();
        this.game.ui.renderCommandMenu();
    }
    
    // ==========================================
    // ★追加：朝廷の信用を消費して強制的に和睦する魔法！
    // ==========================================
    executeCourtTruce(doerId, targetCastleId) {
        const doer = this.game.getBusho(doerId);
        const targetCastle = this.game.getCastle(targetCastleId);
        if (!targetCastle) return;

        const targetClanId = targetCastle.ownerClan;
        const targetClanName = this.game.clans.find(c => c.id === targetClanId).name;
        
        const castle = this.game.getCurrentTurnCastle();
        const costGold = 2000;

        // 金と信用の最終確認（念のためもう一度チェックします）
        const currentTrust = this.game.courtRankSystem.getTrust(this.game.playerClanId);
        if (castle.gold < costGold || currentTrust < 500) {
            this.game.ui.showDialog("、実行できませんでした。", false);
            return;
        }

        // お城の貯金箱からお金を減らします
        castle.gold -= costGold;
        
        // 信用を「500」消費（マイナス）します！
        this.game.courtRankSystem.addTrust(this.game.playerClanId, -500);

        // ★あや瀨さんが作ってくれた魔法を使って、外交状態を強制的に「和睦」にし、期間を「6」にセットします！
        this.game.diplomacyManager.changeStatus(this.game.playerClanId, targetClanId, '和睦', 6);

        // 使者は行動済みにします
        doer.isActionDone = true;
        doer.achievementTotal += Math.floor(doer.diplomacy * 0.2) + 10;
        this.game.factionSystem.updateRecognition(doer, 20);

        // 信用がどれくらい減ったかは見せないようにします
        this.game.ui.showResultModal(`朝廷の威光により、${targetClanName} との間に和睦が結ばれました！\n（和睦期間：６ヶ月）`);
        
        this.game.ui.updatePanelHeader();
        this.game.ui.renderCommandMenu();
    }
}