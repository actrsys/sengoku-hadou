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

    // --- 調略 (STRATEGY) ---
    'investigate': { 
        label: "調査", category: 'STRATEGY', 
        costGold: 0, costRice: 0, 
        isMulti: true, hasAdvice: true, 
        startMode: 'map_select', targetType: 'enemy_all',
        sortKey: 'intelligence' 
    },
    'incite': { 
        label: "扇動", category: 'STRATEGY', 
        costGold: 0, costRice: 0, 
        isMulti: false, hasAdvice: true, 
        startMode: 'map_select', targetType: 'enemy_all',
        sortKey: 'intelligence' 
    },
    'rumor': { 
        label: "流言", category: 'STRATEGY', 
        costGold: 0, costRice: 0, 
        isMulti: false, hasAdvice: true, 
        startMode: 'map_select', targetType: 'enemy_all',
        sortKey: 'intelligence' 
    },
    'headhunt': { 
        label: "引抜", category: 'STRATEGY', 
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
        isSystem: true, action: 'faction_list'
    },
    'daimyo_list': {
        label: "大名", category: 'INFO',
        isSystem: true, action: 'daimyo_list'
    },

    // --- 外交 (DIPLOMACY) ---
    'goodwill': {
        label: "親善", category: 'DIPLOMACY',
        costGold: 0, costRice: 0,
        isMulti: false, hasAdvice: true,
        startMode: 'map_select', targetType: 'other_clan_all'
    },
    'alliance': {
        label: "同盟", category: 'DIPLOMACY',
        costGold: 0, costRice: 0,
        isMulti: false, hasAdvice: true,
        startMode: 'map_select', targetType: 'other_clan_all'
    },
    'dominate': {
        label: "支配", category: 'DIPLOMACY',
        costGold: 0, costRice: 0,
        isMulti: false, hasAdvice: true,
        startMode: 'map_select', targetType: 'other_clan_all'
    },
    'subordinate': {
        label: "従属", category: 'DIPLOMACY',
        costGold: 0, costRice: 0,
        isMulti: false, hasAdvice: true,
        startMode: 'map_select', targetType: 'other_clan_all'
    },
    'break_alliance': {
        label: "破棄", category: 'DIPLOMACY',
        costGold: 0, costRice: 0,
        isMulti: false, hasAdvice: false,
        startMode: 'map_select', targetType: 'breakable_clan'
    },
    // ★追加: 国人衆と仲良くするための外交コマンド
    'kunishu_goodwill': {
        label: "国衆親善", category: 'DIPLOMACY',
        costGold: 0, costRice: 0,
        isMulti: false, hasAdvice: true,
        startMode: 'map_select', targetType: 'kunishu_valid'
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
                    
                    // ★ここを追加：その大名家の「大名（当主）」を探して、その人がいるお城だけをOK（選択可能）にします！
                    const daimyo = this.game.bushos.find(b => b.clan === target.ownerClan && b.isDaimyo);
                    return daimyo && Number(daimyo.castleId) === Number(target.id);
                }).map(t => t.id);
                
            case 'ally_clan': 
                return this.game.castles.filter(target => 
                    target.ownerClan !== 0 && 
                    Number(target.ownerClan) !== playerClanId &&
                    this.game.getRelation(playerClanId, target.ownerClan).status === '同盟'
                ).map(t => t.id);

            case 'breakable_clan': 
                return this.game.castles.filter(target => {
                    if (target.ownerClan === 0 || Number(target.ownerClan) === playerClanId) return false;
                    const status = this.game.getRelation(playerClanId, target.ownerClan).status;
                    if (!['同盟', '支配', '従属'].includes(status)) return false;
                    
                    // ★ここを追加：こちらも「大名（当主）」がいるお城だけをOK（選択可能）にします！
                    const daimyo = this.game.bushos.find(b => b.clan === target.ownerClan && b.isDaimyo);
                    return daimyo && Number(daimyo.castleId) === Number(target.id);
                }).map(t => t.id);
                
            // ★追加: まだ壊滅していない国人衆がいる城を探してリストアップします（親善コマンド用）
            case 'kunishu_valid': {
                const activeKunishus = this.game.kunishuSystem.getAliveKunishus();
                return [...new Set(activeKunishus.map(k => k.castleId))];
            }

            // ★追加: 制圧コマンド専用！自分の城か、隣の城だけを選べるようにします
            case 'kunishu_subjugate_valid': {
                const activeKunishus = this.game.kunishuSystem.getAliveKunishus();
                // まず国人衆がいるお城を全部集めます
                const allKunishuCastleIds = [...new Set(activeKunishus.map(k => k.castleId))];
                
                // 集めたお城を「フィルター（ふるい）」にかけて、条件に合うものだけを残します！
                return allKunishuCastleIds.filter(targetCastleId => {
                    const targetCastle = this.game.getCastle(targetCastleId);
                    
                    // 条件①：自分が持っているお城かどうか？
                    const isMyCastle = (Number(targetCastle.ownerClan) === playerClanId);
                    // 条件②：今まさに命令を出そうとしているお城（c）から道が繋がっているか？
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
            }
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
            
            // ★追加: 国人衆の制圧なら
            if (extraData && extraData.isKunishu) {
                const kunishu = this.game.kunishuSystem.getKunishu(extraData.kunishuId);
                const kunishuLeader = this.game.getBusho(kunishu.leaderId);
                
                this.game.ui.showDialog(`${targetName}にいる ${kunishuLeader ? kunishuLeader.name : "国人"}衆 を討伐しますか？\n今月の命令は終了となります`, true, () => {
                    this.executeKunishuSubjugate(castle, targetId, data, sVal, rVal, hVal, gVal, kunishu);
                });
            } else {
                this.game.ui.showDialog(`${targetName}に攻め込みますか？\n今月の命令は終了となります`, true, () => {
                    const bushos = data.map(id => this.game.getBusho(id));
                    // ★ここを書き換え！いきなり戦争を始めず、援軍を探す機能にバトンタッチします！
                    this.checkReinforcementAndStartWar(castle, targetId, bushos, sVal, rVal, hVal, gVal);
                });
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
    
    // ★追加：親善の友好度アップを計算する専用の数式
    calcGoodwillIncrease(gold, doer) {
        let baseIncrease = 0;
        if (gold <= 1000) {
            // 1000までは 金100につき1 上がる（金500なら5、金1000なら10）
            baseIncrease = gold / 100; 
        } else {
            // 1000を超えた分は上がり幅が小さくなる（金3000で約13になる計算）
            baseIncrease = 10 + (Math.sqrt(gold - 1000) / Math.sqrt(2000)) * 3;
        }

        // 武将の外交ステータスによる補正（平均50を基準に -5 〜 +5）
        let dipBonus = (doer.diplomacy - 50) / 10;
        dipBonus = Math.max(-5, Math.min(5, dipBonus)); // 最大5、最小-5に制限

        // 金額が少ない時は、補正の影響も小さくする（金500なら最大±2.5）
        let scale = Math.min(1.0, gold / 1000);
        dipBonus *= scale;

        // 基準値に補正を足して、最後に±10%程度のランダムな揺らぎを入れる
        let totalFloat = (baseIncrease + dipBonus) * (0.9 + Math.random() * 0.2);
        
        // 最低でも1は上がるようにして、整数にする
        return Math.max(1, Math.round(totalFloat));
    }

    executeDiplomacy(doerId, targetCastleId, type, gold = 0) {
        const doer = this.game.getBusho(doerId);
        const targetCastle = this.game.getCastle(targetCastleId);
        if (!targetCastle) return;
        
        // 城のデータから、相手の大名家IDを取得します！
        const targetClanId = targetCastle.ownerClan;

        const relation = this.game.getRelation(doer.clan, targetClanId);
        let msg = "";
        const isPlayerInvolved = (doer.clan === this.game.playerClanId || targetClanId === this.game.playerClanId);

        if (type === 'goodwill') {
            let isSuccess = true;

            // ★修正: 相手の大名がAIの場合、受ける確率を厳しく計算します
            if (targetClanId !== this.game.playerClanId) {
                let acceptProb = 100;
                
                // ① 友好度が50以下の場合は、基本確率を下げる
                if (relation.sentiment <= 50) {
                    acceptProb = relation.sentiment * 2; // 友好度50で100%、0で0%
                }
                
                // 共通の敵対大名がいるかチェック
                const commonEnemy = this.game.clans.some(c => {
                    if (c.id === 0 || c.id === doer.clan || c.id === targetClanId) return false;
                    const r1 = this.game.getRelation(doer.clan, c.id);
                    const r2 = this.game.getRelation(targetClanId, c.id);
                    return r1 && r2 && r1.status === '敵対' && r2.status === '敵対';
                });

                if (commonEnemy) {
                    acceptProb += 30; // 共通の敵がいれば受け入れやすくする
                }

                // ② ★追加：自分がすでに仲良くしている大名の数で確率を下げる
                let allyCount = 0;
                this.game.clans.forEach(c => {
                    if (c.id !== 0 && c.id !== targetClanId) {
                        const r = this.game.getRelation(targetClanId, c.id);
                        if (r && ['同盟', '支配', '従属'].includes(r.status)) {
                            allyCount++;
                        }
                    }
                });
                if (allyCount >= 2) {
                    acceptProb -= (allyCount - 1) * 20; // 2個で-20%、3個で-40%
                }

                // ③ ★追加：相手の戦力が自分より低い場合、確率を線形で削る
                const myPower = this.game.getClanTotalSoldiers(targetClanId) || 1;
                const doerPower = this.game.getClanTotalSoldiers(doer.clan) || 1;
                if (myPower > doerPower) {
                    // 相手の戦力が自分の半分なら確率も半分にする魔法
                    const ratio = doerPower / myPower;
                    acceptProb *= ratio;
                }

                if (Math.random() * 100 > acceptProb) {
                    isSuccess = false;
                }
            }

            if (isSuccess) {
                const increase = this.calcGoodwillIncrease(gold, doer);
                
                this.game.diplomacyManager.updateSentiment(doer.clan, targetClanId, increase);
                const newRelation = this.game.getRelation(doer.clan, targetClanId);

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
            // ★修正: 同盟を受ける確率も厳しく計算します
            const commonEnemy = this.game.clans.some(c => {
                if (c.id === 0 || c.id === doer.clan || c.id === targetClanId) return false;
                const r1 = this.game.getRelation(doer.clan, c.id);
                const r2 = this.game.getRelation(targetClanId, c.id);
                return r1 && r2 && r1.status === '敵対' && r2.status === '敵対';
            });

            let threshold = commonEnemy ? 90 : 120; // 閾値（これを超えないと土俵に上がれない）
            let acceptProb = commonEnemy ? 90 : 70; // 基本の成功確率（100%中）

            // ① ★追加：自分がすでに仲良くしている大名の数で確率を下げる
            let allyCount = 0;
            this.game.clans.forEach(c => {
                if (c.id !== 0 && c.id !== targetClanId) {
                    const r = this.game.getRelation(targetClanId, c.id);
                    if (r && ['同盟', '支配', '従属'].includes(r.status)) {
                        allyCount++;
                    }
                }
            });
            if (allyCount >= 2) {
                acceptProb -= (allyCount - 1) * 20; // 確率を下げる
                threshold += (allyCount - 1) * 10;  // 閾値を上げる（厳しくなる）
            }

            // ② ★追加：相手の戦力が自分より低い場合、確率を線形で削る
            const myPower = this.game.getClanTotalSoldiers(targetClanId) || 1;
            const doerPower = this.game.getClanTotalSoldiers(doer.clan) || 1;
            if (myPower > doerPower) {
                const ratio = doerPower / myPower;
                acceptProb *= ratio;
            }

            const chance = relation.sentiment + doer.diplomacy;
            
            // サイコロを振ります！ (chance が threshold を超えていて、かつ確率のサイコロをクリアしたら成功)
            if (chance > threshold && (Math.random() * 100) < acceptProb) {
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
            const oldStatus = relation.status;
            const oldSentiment = relation.sentiment; // ★追加：破棄前の友好度を覚えておく

            // ★追加：破棄のペナルティを計算する
            let targetDrop = -60; // デフォルトは-60
            let globalDrop = 0; // 他の大名への影響
            let isBetrayal = false;

            if (oldStatus === '同盟') {
                if (oldSentiment >= 70) {
                    targetDrop = -70; // 相手との友好度ダウン
                    globalDrop = -10; // 他の大名との友好度ダウン
                    isBetrayal = true;
                }
            } else if (oldStatus === '従属') {
                if (oldSentiment >= 70) {
                    targetDrop = -100; // 相手との友好度ダウン
                    globalDrop = -10; // 他の大名との友好度ダウン
                    isBetrayal = true;
                }
            }

            // 相手との友好度を下げる（0未満にはならない仕組みが裏で動いています）
            this.game.diplomacyManager.updateSentiment(doer.clan, targetClanId, targetDrop);

            // ★ここを修正：下がった後の友好度に応じて、ステータスを当てはめ直します！
            const newRel = this.game.getRelation(doer.clan, targetClanId);
            let newStatus = '普通';
            if (newRel.sentiment <= 39) {
                newStatus = '敵対'; // 39以下なら敵対
            } else if (newRel.sentiment >= 70) {
                newStatus = '友好'; // 70以上なら友好
            }
            // 計算した新しいステータス（関係）をセットします！
            this.game.diplomacyManager.changeStatus(doer.clan, targetClanId, newStatus);

            // 信義に背いた場合、他のすべての大名との友好度も下がる
            if (isBetrayal) {
                this.game.clans.forEach(c => {
                    // 自分と破棄相手以外で、かつ中立(0)ではない大名すべてにペナルティ
                    if (c.id !== 0 && c.id !== doer.clan && c.id !== targetClanId) {
                        this.game.diplomacyManager.updateSentiment(doer.clan, c.id, globalDrop);
                    }
                });
            }

            msg = `${oldStatus}関係を破棄しました`;
            if (isBetrayal) {
                msg += `\n諸大名からの心証が悪化しました……`;
            }
            doer.achievementTotal += 5;
            this.game.factionSystem.updateRecognition(doer, 10);

        } else if (type === 'subordinate') {
            // 他の大名との支配・従属関係をすべて解消します
            this.clearDominationRelations(doer.clan);
            
            // 相手との関係を「従属」にします
            this.game.diplomacyManager.changeStatus(doer.clan, targetClanId, '従属');
            msg = `${this.game.clans.find(c => c.id === targetClanId).name} に従属しました！`;
            doer.achievementTotal += Math.floor(doer.diplomacy * 0.2) + 10;
            this.game.factionSystem.updateRecognition(doer, 30);
        } else if (type === 'dominate') {
            const myPower = this.game.getClanTotalSoldiers(doer.clan);
            const targetPower = this.game.getClanTotalSoldiers(targetClanId) || 1; // 0除算防止
            
            const powerRatio = myPower / targetPower;
            
            if (powerRatio < 5) {
                msg = `要求を跳ね除けられました……`;
                doer.achievementTotal += 5;
                this.game.factionSystem.updateRecognition(doer, 10);
            } else {
                // 基本確率 (5倍で20%、15倍以上で70%)
                let prob = 20;
                if (powerRatio >= 15) {
                    prob = 70;
                } else {
                    prob = 20 + (powerRatio - 5) * (50 / 10);
                }
                
                // 外交補正 (50以上で最大+10%)
                if (doer.diplomacy >= 50) {
                    const dipBonus = Math.min(10, (doer.diplomacy - 50) * 0.2);
                    prob += dipBonus;
                }
                
                // 相手が既に他の大名に従属しているか確認
                let isAlreadySubordinate = false;
                this.game.clans.forEach(c => {
                    if (c.id !== targetClanId && c.id !== doer.clan) {
                        const rel = this.game.getRelation(targetClanId, c.id);
                        if (rel && rel.status === '従属') {
                            isAlreadySubordinate = true;
                        }
                    }
                });
                
                if (isAlreadySubordinate) {
                    prob *= 0.2; // 確率を8割減らします
                }
                
                if (Math.random() * 100 < prob) {
                    // 成功！
                    this.clearDominationRelations(targetClanId);
                    this.game.diplomacyManager.changeStatus(doer.clan, targetClanId, '支配');
                    msg = `${this.game.clans.find(c => c.id === targetClanId).name} を支配下に置くことに成功しました！`;
                    doer.achievementTotal += Math.floor(doer.diplomacy * 0.2) + 20;
                    this.game.factionSystem.updateRecognition(doer, 40);
                } else {
                    // 失敗……
                    this.game.diplomacyManager.updateSentiment(doer.clan, targetClanId, -20);
                    msg = `支配の要求は拒否されました……`;
                    doer.achievementTotal += 5;
                    this.game.factionSystem.updateRecognition(doer, 10);
                }
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
                
                // お城の持ち主をプレイヤーの大名家に変更
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
                
                // お城の城主データを更新
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
        
        // 攻撃する側（プレイヤー）のお城から、出陣する数だけ兵士や兵糧、騎馬、鉄砲を減らします
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
            name: kunishuName, // ←★お城の名前をくっつけず、国人衆の名前（伊賀衆など）だけにします！
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
        // this.game.ui.log(this.getSelectionGuideMessage()); // ←★行の頭に「//」を付けてお休みにしました！
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
            default: return "対象を選択してください";
        }
    }
    
    resolveMapSelection(targetCastle) {
        if (!this.game.validTargets.includes(targetCastle.id)) return;
        
        const mode = this.game.selectionMode;
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
    
    // ★追加: ここから下全部、援軍を探してお願いする新しい機能です！
    checkReinforcementAndStartWar(atkCastle, targetCastleId, atkBushos, sVal, rVal, hVal, gVal) {
        const myClanId = atkCastle.ownerClan;
        const targetCastle = this.game.getCastle(targetCastleId);
        const enemyClanId = targetCastle.ownerClan;
        const pid = this.game.playerClanId;
        
        // 援軍を呼べる城をリストアップします
        let candidateCastles = [];

        this.game.castles.forEach(c => {
            if (c.ownerClan === 0 || c.ownerClan === myClanId || c.ownerClan === enemyClanId) return;

            // 関係と友好度のチェック
            const rel = this.game.getRelation(myClanId, c.ownerClan);
            if (!['友好', '同盟', '支配', '従属'].includes(rel.status)) return;
            if (rel.sentiment < 50) return;

            // 相手が戦争相手と仲良し（同盟・支配・従属）ならダメ
            const enemyRel = this.game.getRelation(c.ownerClan, enemyClanId);
            if (enemyRel && ['同盟', '支配', '従属'].includes(enemyRel.status)) return; // ★「enemyRel &&」を書き足してエラーを防ぎます！

            // ★変更: 攻撃側の条件: 自分の所有しているいずれかの城、または攻撃先に隣接しているか
            const isNextToMyAnyCastle = this.game.castles.some(myC => myC.ownerClan === myClanId && GameSystem.isAdjacent(c, myC));
            const isNextToEnemy = GameSystem.isAdjacent(c, targetCastle);
            if (!isNextToMyAnyCastle && !isNextToEnemy) return;

            // 兵士が1000人以上いるか
            if (c.soldiers < 1000) return;

            // 一般武将が最低1人いるか（大名・城主・浪人・国人衆以外）
            const bushosInCastle = this.game.getCastleBushos(c.id);
            const normalBushos = bushosInCastle.filter(b => 
                !b.isDaimyo && !b.isCastellan && b.status !== 'ronin' && b.belongKunishuId === 0
            );
            if (normalBushos.length === 0) return;
            
            candidateCastles.push(c);
        });

        // 呼べる城がなかったら、そのまま戦争スタート！
        if (candidateCastles.length === 0) {
            this.game.warManager.startWar(atkCastle, targetCastle, atkBushos, sVal, rVal, hVal, gVal);
            return;
        }

        // 呼べる城があったら、UIに「誰を呼ぶ？」と聞く画面を出してもらいます
        // ★変更: 委任城の場合はプレイヤーに聞かず、AIが自動で援軍を頼みます！
        if (myClanId === pid && !atkCastle.isDelegated) {
            // プレイヤーならUIに「誰を呼ぶ？」と聞く画面を出してもらいます
            this.game.ui.showReinforcementSelector(candidateCastles, atkCastle, targetCastle, atkBushos, sVal, rVal, hVal, gVal);
        } else {
            // ★追加: AIが攻撃側の場合、一番兵士が多い城に自動で援軍を頼みます！
            candidateCastles.sort((a,b) => b.soldiers - a.soldiers);
            const bestCastle = candidateCastles[0];
            this.executeReinforcementRequest(0, bestCastle, atkCastle, targetCastle, atkBushos, sVal, rVal, hVal, gVal);
        }
    }
    
    // ★追加: 援軍が来てくれるかどうかの計算をして、出陣準備をする機能です
    executeReinforcementRequest(gold, helperCastle, atkCastle, targetCastle, atkBushos, sVal, rVal, hVal, gVal) {
        // まず、約束したお金を払います（自腹です！）
        if (gold > 0) {
            atkCastle.gold -= gold;
        }

        const myClanId = atkCastle.ownerClan;
        const helperClanId = helperCastle.ownerClan;
        const enemyClanId = targetCastle.ownerClan;

        const myToHelperRel = this.game.getRelation(myClanId, helperClanId);
        const helperToEnemyRel = this.game.getRelation(helperClanId, enemyClanId);

        // ★ここから追加：プレイヤーへの攻撃援軍要請！
        if (helperClanId === this.game.playerClanId) {
            const myClanName = this.game.clans.find(c => c.id === myClanId)?.name || "不明";
            const targetClanName = this.game.clans.find(c => c.id === enemyClanId)?.name || "敵軍";
            const isBoss = (myToHelperRel.status === '従属'); // 相手が主君かどうか
            
            const startSelection = () => {
                this._promptPlayerAtkReinforcement(helperCastle, atkCastle, targetCastle, atkBushos, sVal, rVal, hVal, gVal, isBoss);
            };

            if (isBoss) {
                const msg = `主家である ${myClanName} (${atkCastle.name}) が ${targetClanName} (${targetCastle.name}) へ侵攻します。\n当家に攻撃の援軍要請が届きました！\n（使者持参金: ${gold}）\n当家は従属しているため、直ちに出陣します！`;
                this.game.ui.showDialog(msg, false, startSelection);
            } else {
                const msg = `${myClanName} (${atkCastle.name}) が ${targetClanName} (${targetCastle.name}) へ侵攻します。\n当家に攻撃の援軍要請が届きました。\n（使者持参金: ${gold}）\n援軍を派遣しますか？`;
                this.game.ui.showDialog(msg, true, 
                    startSelection,
                    () => {
                        this.game.diplomacyManager.updateSentiment(myClanId, helperClanId, -10);
                        this.game.ui.showDialog(`援軍要請を断りました。`, false, () => {
                            // プレイヤーが断った場合、AIはそのまま単独で戦争を開始します
                            this.game.warManager.startWar(atkCastle, targetCastle, atkBushos, sVal, rVal, hVal, gVal);
                        });
                    }
                );
            }
            return;
        }
        // ★追加はここまで！

        let isSuccess = false;

        // 条件①：相手を「支配」している場合は、絶対に断れません！（成功率100%）
        if (myToHelperRel.status === '支配') {
            isSuccess = true;
        } else {
            // 基本の成功率（友好度50で1%、100で51%）
            let prob = 0;
            if (myToHelperRel.sentiment >= 50) {
                prob += (myToHelperRel.sentiment - 49); 
            }

            // 金による上昇（最大1500で+15%）
            prob += Math.floor((gold / 1500) * 15);

            // 相手と「同盟」または自分が相手に「従属」している場合は+30%
            if (myToHelperRel.status === '同盟' || myToHelperRel.status === '従属') {
                prob += 30;
            }

            // 50を基準にして、敵との仲が悪い（50より下）と参加しやすくなり、仲が良い（50より上）と参加しにくくなります
            if (helperToEnemyRel) {
                const drop = Math.floor((helperToEnemyRel.sentiment - 50) * (20 / 50)); 
                prob -= drop;
            }

            // サイコロを振ります！
            if (Math.random() * 100 < prob) {
                isSuccess = true;
            }
        }

        // もし断られてしまったら……
        if (!isSuccess) {
            if (myClanId === this.game.playerClanId) {
                this.game.ui.showDialog(`${helperCastle.name}への援軍要請は断られました……\n自軍のみで出陣します。`, false, () => {
                    this.game.warManager.startWar(atkCastle, targetCastle, atkBushos, sVal, rVal, hVal, gVal);
                });
            } else {
                // AIならダイアログを出さずに出陣
                this.game.warManager.startWar(atkCastle, targetCastle, atkBushos, sVal, rVal, hVal, gVal);
            }
            return;
        }

        // 見事、援軍が来てくれることになりました！
        // 支配・従属・同盟の特別な関係じゃない場合は、参戦するかわりに友好度が-10されます
        if (!['支配', '従属', '同盟'].includes(myToHelperRel.status)) {
            this.game.diplomacyManager.updateSentiment(myClanId, helperClanId, -10);
        }

        // 援軍の兵士数を決めます（AIは自分の城の半分までしか出しません）
        const helperDaimyo = this.game.bushos.find(b => b.clan === helperClanId && b.isDaimyo) || { duty: 50 };
        let maxSendable = Math.floor(helperCastle.soldiers * 0.5);
        if (maxSendable < 500) maxSendable = 500; // ただし最低500人は出そうと頑張る
        if (maxSendable > helperCastle.soldiers) maxSendable = helperCastle.soldiers;

        // 仲の良さと、大名の「義理」の高さで、送ってくれる兵士数が増えます
        const sentimentBonus = myToHelperRel.sentiment / 100; 
        const dutyBonus = helperDaimyo.duty / 100; 
        let reinfSoldiers = Math.floor(maxSendable * ((sentimentBonus + dutyBonus) / 2 + 0.5));
        
        // 兵士数のルール（最低500、最大3000）
        if (reinfSoldiers < 500) reinfSoldiers = 500;
        if (reinfSoldiers > 3000) reinfSoldiers = 3000;
        if (reinfSoldiers > helperCastle.soldiers) reinfSoldiers = helperCastle.soldiers;

        // 援軍に来てくれる「一般武将」を選びます（強い順）
        const availableBushos = this.game.getCastleBushos(helperCastle.id).filter(b => 
            !b.isDaimyo && !b.isCastellan && b.status !== 'ronin' && b.belongKunishuId === 0
        ).sort((a,b) => b.strength - a.strength);

        // 兵士数に合わせて武将の人数を増やします（1500で2人、2500で3人）
        let bushoCount = 1;
        if (reinfSoldiers >= 1500) bushoCount = 2;
        if (reinfSoldiers >= 2500) bushoCount = 3;
        if (bushoCount > availableBushos.length) bushoCount = availableBushos.length;

        const reinfBushos = availableBushos.slice(0, bushoCount);

        // 持ってくる兵糧、馬、鉄砲の数を計算します
        const reinfRice = reinfSoldiers; 
        const reinfHorses = Math.min(helperCastle.horses || 0, Math.floor(reinfSoldiers * 0.5)); 
        const reinfGuns = Math.min(helperCastle.guns || 0, Math.floor(reinfSoldiers * 0.5));

        // 用意した援軍の情報を、１つの「箱（データパック）」にまとめます
        const reinforcementData = {
            castle: helperCastle,
            bushos: reinfBushos,
            soldiers: reinfSoldiers,
            rice: reinfRice,
            horses: reinfHorses,
            guns: reinfGuns,
            isAttacker: true
        };

        const helperClanName = this.game.clans.find(c => c.id === helperClanId)?.name || "援軍";
        
        // ★追加: 攻撃側援軍が参戦したことによる、守備側との友好度低下
        this.game.warManager.applyWarHostility(helperClanId, false, enemyClanId, targetCastle.isKunishu, true);
        
        if (myClanId === this.game.playerClanId) {
            // メッセージを出して、いざ出陣！
            this.game.ui.showDialog(`${helperClanName} (${helperCastle.name}) が援軍要請を承諾しました！\n共に ${targetCastle.name} へ出陣します！`, false, () => {
                // まとめた「援軍パック(reinforcementData)」を渡します！
                this.game.warManager.startWar(atkCastle, targetCastle, atkBushos, sVal, rVal, hVal, gVal, reinforcementData);
            });
        } else {
            // ★AIの場合はダイアログを出さず、ログだけ残して出陣
            this.game.ui.log(`【援軍情報】${atkCastle.name}軍の要請により、${helperClanName}が攻撃の援軍として参戦しました。`);
            this.game.warManager.startWar(atkCastle, targetCastle, atkBushos, sVal, rVal, hVal, gVal, reinforcementData);
        }
    }

    // ★ここから追加：プレイヤーが攻撃の援軍要請を受けた時の武将・兵数選択フロー
    _promptPlayerAtkReinforcement(helperCastle, atkCastle, targetCastle, atkBushos, sVal, rVal, hVal, gVal, isBoss) {
        const promptBusho = () => {
            this.game.ui.openBushoSelector('atk_reinf_deploy', helperCastle.id, {
                hideCancel: isBoss, 
                onConfirm: (selectedBushoIds) => {
                    const reinfBushos = selectedBushoIds.map(id => this.game.getBusho(id));
                    promptQuantity(reinfBushos);
                },
                onCancel: () => {
                    this.game.ui.showDialog("援軍の派遣を取りやめました。", false, () => {
                        this.game.warManager.startWar(atkCastle, targetCastle, atkBushos, sVal, rVal, hVal, gVal);
                    });
                }
            });
        };

        const promptQuantity = (reinfBushos) => {
            this.game.ui.openQuantitySelector('atk_reinf_supplies', [helperCastle], null, {
                onConfirm: (inputs) => {
                    const inputData = inputs[helperCastle.id] || inputs;
                    const reinfSoldiers = inputData.soldiers ? parseInt(inputData.soldiers.num.value) : 500;
                    const reinfRice = inputData.rice ? parseInt(inputData.rice.num.value) : 500;
                    const reinfHorses = inputData.horses ? parseInt(inputData.horses.num.value) : 0;
                    const reinfGuns = inputData.guns ? parseInt(inputData.guns.num.value) : 0;

                    this._applyManualAtkReinforcement(helperCastle, atkCastle, targetCastle, atkBushos, sVal, rVal, hVal, gVal, reinfBushos, reinfSoldiers, reinfRice, reinfHorses, reinfGuns);
                },
                onCancel: () => {
                    promptBusho(); // 戻るボタンで武将選択に戻る
                }
            });
        };

        promptBusho(); // 最初に武将選択画面を呼び出す
    }

    _applyManualAtkReinforcement(helperCastle, atkCastle, targetCastle, atkBushos, sVal, rVal, hVal, gVal, reinfBushos, reinfSoldiers, reinfRice, reinfHorses, reinfGuns) {
        // 援軍元の城から減らす
        helperCastle.soldiers = Math.max(0, helperCastle.soldiers - reinfSoldiers);
        helperCastle.rice = Math.max(0, helperCastle.rice - reinfRice);
        helperCastle.horses = Math.max(0, (helperCastle.horses || 0) - reinfHorses);
        helperCastle.guns = Math.max(0, (helperCastle.guns || 0) - reinfGuns);
        reinfBushos.forEach(b => b.isActionDone = true);

        // 援軍パック
        const reinforcementData = {
            castle: helperCastle,
            bushos: reinfBushos,
            soldiers: reinfSoldiers,
            rice: reinfRice,
            horses: reinfHorses,
            guns: reinfGuns,
            isAttacker: true
        };

        // 攻撃側援軍が参戦したことによる、守備側との友好度低下
        this.game.warManager.applyWarHostility(helperCastle.ownerClan, false, targetCastle.ownerClan, targetCastle.isKunishu, true);
        
        this.game.ui.showDialog(`自軍の援軍が出発しました！\n共に ${targetCastle.name} へ侵攻します！`, false, () => {
            this.game.warManager.startWar(atkCastle, targetCastle, atkBushos, sVal, rVal, hVal, gVal, reinforcementData);
        });
    }
    // ★追加はここまで！
    
}