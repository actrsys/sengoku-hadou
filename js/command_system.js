/**
 * command_system.js
 * ゲーム内のコマンド実行ロジックおよびフロー制御を管理するクラス
 */

/* ==========================================================================
   ★ コマンド定義 (COMMAND_SPECS)
   ========================================================================== */
const COMMAND_SPECS = {
    // 内政
    'farm': { label: "石高開発", costGold: 500, costRice: 0, multi: true, next: 'execute' },
    'commerce': { label: "商業開発", costGold: 500, costRice: 0, multi: true, next: 'execute' },
    'repair': { label: "城壁修復", costGold: 300, costRice: 0, multi: true, next: 'execute' },
    'training': { label: "訓練", costGold: 0, costRice: 0, multi: true, next: 'execute' },
    'soldier_charity': { label: "兵施し", costGold: 0, costRice: 0, multi: true, next: 'execute' },
    'charity': { label: "施し", costGold: 300, costRice: 300, multi: true, next: 'quantity_selector' }, // 特殊: タイプ選択へ
    
    // 軍事
    'draft': { label: "徴兵", costGold: 0, costRice: 0, multi: true, next: 'quantity_selector' },
    'transport': { label: "輸送", costGold: 0, costRice: 0, multi: true, next: 'quantity_selector' },
    'war': { label: "出陣", costGold: 0, costRice: 0, multi: true, next: 'war_setup' },

    // 人事
    'appoint': { label: "城主任命", multi: false, next: 'execute' },
    'appoint_gunshi': { label: "軍師任命", multi: false, next: 'execute' },
    'banish': { label: "追放", multi: false, next: 'execute' },
    'interview': { label: "面談", multi: false, next: 'modal_interview' },
    'reward': { label: "褒美", multi: false, next: 'quantity_selector' },
    'move': { label: "移動", multi: true, next: 'execute_move' },
    'employ': { label: "登用", multi: false, next: 'complex_employ' }, // 登用はフローが特殊

    // 調略
    'investigate': { label: "調査", multi: true, next: 'advice_execute' },
    'incite': { label: "扇動", multi: false, next: 'advice_execute' },
    'rumor': { label: "流言", multi: false, next: 'complex_rumor' },
    'headhunt': { label: "引抜", multi: false, next: 'complex_headhunt' },
    
    // 外交・商人
    'diplomacy': { label: "外交", multi: false, next: 'complex_diplomacy' },
    'trade': { label: "取引", multi: false, next: 'quantity_selector' }
};

class CommandSystem {
    constructor(game) {
        this.game = game; // GameManagerのインスタンスへの参照
    }

    /* ==========================================================================
       ★ フロー制御 (Flow Control)
       UIから呼び出されるエントリポイント
       ========================================================================== */

    /**
     * コマンド開始処理
     * @param {string} type コマンドタイプ
     * @param {number|null} targetId 対象ID（城IDなど）
     * @param {object|null} extraData 追加データ
     */
    startCommand(type, targetId = null, extraData = null) {
        const spec = COMMAND_SPECS[type];
        const castle = this.game.getCurrentTurnCastle();

        // 基本的なリソースチェック（実行前に弾けるもの）
        if (spec) {
            if (spec.costGold > 0 && castle.gold < spec.costGold) {
                alert(`金が足りません (必要: ${spec.costGold})`);
                return;
            }
            if (spec.costRice > 0 && castle.rice < spec.costRice) {
                alert(`兵糧が足りません (必要: ${spec.costRice})`);
                return;
            }
        }

        // コマンドタイプ別の初期UI呼び出し
        switch (type) {
            // 武将選択から始まるもの
            case 'farm':
            case 'commerce':
            case 'repair':
            case 'training':
            case 'soldier_charity':
            case 'draft':
            case 'charity':
            case 'appoint':
            case 'appoint_gunshi':
            case 'banish':
            case 'interview':
            case 'reward':
                this.game.ui.openBushoSelector(type, targetId, extraData);
                break;

            // マップ選択から始まるもの（UI側でMapSelectionに入るが、完了後はここに戻ってくる）
            case 'war':
            case 'move':
            case 'transport':
            case 'investigate':
            case 'incite':
            case 'rumor':
            case 'headhunt':
            case 'diplomacy':
                // これらはUIのMenuから直接 enterMapSelection が呼ばれるため、ここには来ない想定
                // ただし、Map選択後のコールバックで openBushoSelector が呼ばれ、その後の決定処理で handleBushoSelection に来る
                console.warn(`startCommand called for map-based action: ${type}. Should be handled via map selection.`);
                break;
            
            // 商人
            case 'buy_rice':
            case 'sell_rice':
                this.game.ui.openQuantitySelector(type, null, targetId);
                break;
                
            default:
                console.warn("Unknown command start:", type);
                break;
        }
    }

    /**
     * 武将選択後の処理ハンドラ
     * UIManager.selectorConfirmBtn.onclick から呼ばれる
     */
    handleBushoSelection(actionType, selectedIds, targetId, extraData) {
        if (!selectedIds || selectedIds.length === 0) return;
        const firstId = selectedIds[0];

        // --- 複合フローの分岐 ---

        // 登用: 対象選択 -> 実行武将選択
        if (actionType === 'employ_target') {
            this.game.ui.openBushoSelector('employ_doer', null, { targetId: firstId });
            return;
        }
        // 登用: 実行武将選択 -> 実行
        if (actionType === 'employ_doer') {
            this.showAdviceAndExecute('employ', () => this.executeEmploy(firstId, extraData.targetId), { targetId: extraData.targetId });
            return;
        }

        // 引抜: 対象選択 -> 実行武将選択
        if (actionType === 'headhunt_target') {
            this.game.ui.openBushoSelector('headhunt_doer', null, { targetId: firstId });
            return;
        }
        // 引抜: 実行武将選択 -> 金額入力
        if (actionType === 'headhunt_doer') {
            this.game.ui.openQuantitySelector('headhunt_gold', selectedIds, extraData.targetId);
            return;
        }

        // 流言: 対象武将選択 -> 実行武将選択
        if (actionType === 'rumor_target_busho') {
            this.game.ui.openBushoSelector('rumor_doer', targetId, { targetBushoId: firstId });
            return;
        }
        // 流言: 実行武将選択 -> 実行
        if (actionType === 'rumor_doer') {
            this.showAdviceAndExecute('rumor', () => this.executeRumor(firstId, targetId, extraData.targetBushoId));
            return;
        }

        // 外交: 実行武将選択 -> (親善なら金額、同盟なら即実行)
        if (actionType === 'diplomacy_doer') {
            if (extraData.subAction === 'goodwill') {
                this.game.ui.openQuantitySelector('goodwill', selectedIds, targetId);
            } else if (extraData.subAction === 'alliance') {
                this.showAdviceAndExecute('diplomacy', () => this.executeDiplomacy(firstId, targetId, 'alliance'));
            } else if (extraData.subAction === 'break_alliance') {
                // 同盟破棄は軍師助言なしで即実行（警告はMap選択時に出したいが、現状は即実行）
                this.executeDiplomacy(firstId, targetId, 'break_alliance');
            }
            return;
        }

        // 面談関連
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

        // 戦争: 武将選択 -> (総大将判定) -> 兵站選択
        if (actionType === 'war_deploy') {
             // 総大将判定ロジック
             const selectedBushos = selectedIds.map(id => this.game.getBusho(id));
             const leader = selectedBushos.find(b => b.isDaimyo || b.isCastellan);
             if (leader) {
                 // 大名か城主がいれば自動的に総大将に設定し、配列の先頭へ
                 const others = selectedIds.filter(id => id !== leader.id);
                 const sortedIds = [leader.id, ...others];
                 this.game.ui.openQuantitySelector('war_supplies', sortedIds, targetId);
             } else {
                 // いなければ総大将選択へ
                 this.game.ui.openBushoSelector('war_general', targetId, { candidates: selectedIds });
             }
             return;
        }
        if (actionType === 'war_general') {
            // 総大将が選ばれた
            const leaderId = firstId;
            const others = extraData.candidates.filter(id => id !== leaderId);
            const sortedIds = [leaderId, ...others];
            this.game.ui.openQuantitySelector('war_supplies', sortedIds, targetId);
            return;
        }

        // 移動・輸送
        if (actionType === 'transport_deploy') {
            this.game.ui.openQuantitySelector('transport', selectedIds, targetId);
            return;
        }
        if (actionType === 'move_deploy') {
            this.executeCommand('move_deploy', selectedIds, targetId);
            return;
        }

        // 調査
        if (actionType === 'investigate_deploy') {
            this.showAdviceAndExecute('investigate', () => this.executeInvestigate(selectedIds, targetId));
            return;
        }
        
        // 扇動
        if (actionType === 'incite_doer') {
             this.showAdviceAndExecute('incite', () => this.executeIncite(firstId, targetId));
             return;
        }

        // --- 単純フロー (数量選択へ) ---
        if (['draft', 'charity', 'reward'].includes(actionType)) {
            this.game.ui.openQuantitySelector(actionType, selectedIds, targetId);
            return;
        }

        // --- 単純フロー (即実行) ---
        if (['farm', 'commerce', 'repair', 'training', 'soldier_charity', 'appoint', 'appoint_gunshi', 'banish'].includes(actionType)) {
            // appoint_gunshi, appoint, banish は軍師助言なし、その他はあり
            if (['appoint', 'appoint_gunshi', 'banish'].includes(actionType)) {
                if (actionType === 'appoint_gunshi') this.executeAppointGunshi(firstId);
                else this.executeCommand(actionType, selectedIds, targetId);
            } else {
                this.showAdviceAndExecute(actionType, () => this.executeCommand(actionType, selectedIds, targetId));
            }
            return;
        }

        console.warn("Unhandled busho selection type:", actionType);
    }

    /**
     * 数量・項目選択後の処理ハンドラ
     * UIManager.quantityConfirmBtn.onclick から呼ばれる
     */
    handleQuantitySelection(type, inputs, targetId, data) {
        // dataは通常 selectedIds (Array)
        const castle = this.game.getCurrentTurnCastle();

        if (type === 'reward') {
            const val = parseInt(inputs.gold.num.value);
            if (val <= 0) return;
            this.executeReward(data[0], val);
        }
        else if (type === 'draft') {
            const val = parseInt(inputs.gold.num.value);
            if (val <= 0) return;
            this.showAdviceAndExecute('draft', () => this.executeDraft(data, val), { val: val });
        }
        else if (type === 'charity') {
            // UI側でラジオボタンの値を取得して inputs に入れている想定、あるいはUIから直接値を渡す形への変更が必要
            // 既存UIの構造上、ラジオボタンは quantityModal 内にあるため、UI側で値を取得してここへ渡すのが理想だが、
            // ここでは簡易的に document から取得する（既存ロジック踏襲）
            const charityTypeEl = document.querySelector('input[name="charityType"]:checked');
            if (!charityTypeEl) return;
            const charityType = charityTypeEl.value;
            this.showAdviceAndExecute('charity', () => this.executeCharity(data, charityType));
        }
        else if (type === 'goodwill') {
            const val = parseInt(inputs.gold.num.value);
            if (val < 100) { alert("金が足りません(最低100)"); return; }
            this.showAdviceAndExecute('goodwill', () => this.executeDiplomacy(data[0], targetId, 'goodwill', val));
        }
        else if (type === 'headhunt_gold') {
            const val = parseInt(inputs.gold.num.value);
            this.showAdviceAndExecute('headhunt', () => this.executeHeadhunt(data[0], targetId, val));
        }
        else if (type === 'transport') {
            const vals = {
                gold: parseInt(inputs.gold.num.value),
                rice: parseInt(inputs.rice.num.value),
                soldiers: parseInt(inputs.soldiers.num.value)
            };
            if (vals.gold === 0 && vals.rice === 0 && vals.soldiers === 0) return;
            this.executeTransport(data, targetId, vals);
        }
        else if (type === 'buy_rice') {
            const val = parseInt(inputs.amount.num.value);
            if (val <= 0) return;
            this.executeTrade('buy', val);
        }
        else if (type === 'sell_rice') {
            const val = parseInt(inputs.amount.num.value);
            if (val <= 0) return;
            this.executeTrade('sell', val);
        }
        else if (type === 'war_supplies') {
            const sVal = parseInt(inputs.soldiers.num.value);
            const rVal = parseInt(inputs.rice.num.value);
            if (sVal <= 0) { alert("兵士0では出陣できません"); return; }
            
            const targetName = this.game.getCastle(targetId).name;
            if (!confirm(`${targetName}に攻め込みますか？\n今月の命令は終了となります。`)) return;

            const bushos = data.map(id => this.game.getBusho(id));
            this.game.warManager.startWar(castle, this.game.getCastle(targetId), bushos, sVal, rVal);
        }
        else if (type === 'war_repair') {
             const val = parseInt(inputs.soldiers.num.value);
             if (val <= 0) return;
             this.game.warManager.execWarCmd('repair', val);
        }
    }

    /**
     * 軍師助言を表示して実行するラッパー
     */
    showAdviceAndExecute(actionType, executeCallback, extraContext = {}) {
        const adviceAction = { type: actionType, ...extraContext };
        this.game.ui.showGunshiAdvice(adviceAction, executeCallback);
    }

    /* ==========================================================================
       ★ コマンド実行ロジック (Execution Logic)
       ========================================================================== */

    executeCommand(type, bushoIds, targetId) {
        const castle = this.game.getCurrentTurnCastle(); let totalVal = 0, cost = 0, count = 0, actionName = "";
        
        if (type === 'appoint' || type === 'appoint_gunshi') {
            const busho = this.game.getBusho(bushoIds[0]);
            if (type === 'appoint') { 
                const old = this.game.getBusho(castle.castellanId); if(old) old.isCastellan = false; 
                castle.castellanId = busho.id; busho.isCastellan = true; 
                this.game.ui.showResultModal(`${busho.name}を城主に任命しました`); 
            }
            if (type === 'appoint_gunshi') { 
                const oldGunshi = this.game.bushos.find(b => b.clan === this.game.playerClanId && b.isGunshi); if (oldGunshi) oldGunshi.isGunshi = false; 
                busho.isGunshi = true; 
                this.game.ui.showResultModal(`${busho.name}を軍師に任命しました`); 
            }
            this.game.ui.updatePanelHeader(); this.game.ui.renderCommandMenu(); 
            return;
        }

        bushoIds.forEach(bid => {
            const busho = this.game.getBusho(bid); if (!busho) return;
            if (type === 'farm') { 
                if (castle.gold >= 500) { 
                    const val = GameSystem.calcDevelopment(busho); castle.gold -= 500; 
                    castle.kokudaka = Math.min(castle.maxKokudaka, castle.kokudaka + val); 
                    totalVal += val; count++; actionName = "石高開発";
                    busho.achievementTotal += Math.floor(val * 0.5); 
                    this.game.factionSystem.updateRecognition(busho, 10);
                }
            }
            else if (type === 'commerce') { 
                if (castle.gold >= 500) { 
                    const val = GameSystem.calcDevelopment(busho); castle.gold -= 500; 
                    castle.commerce = Math.min(castle.maxCommerce, castle.commerce + val); 
                    totalVal += val; count++; actionName = "商業開発";
                    busho.achievementTotal += Math.floor(val * 0.5);
                    this.game.factionSystem.updateRecognition(busho, 10);
                }
            }
            else if (type === 'repair') { 
                if (castle.gold >= 300) { 
                    const val = GameSystem.calcRepair(busho); castle.gold -= 300; 
                    castle.defense = Math.min(castle.maxDefense, castle.defense + val); 
                    totalVal += val; count++; actionName = "城壁修復";
                    busho.achievementTotal += Math.floor(val * 0.5);
                    this.game.factionSystem.updateRecognition(busho, 10);
                }
            }
            else if (type === 'training') { 
                const val = GameSystem.calcTraining(busho); castle.training = Math.min(100, castle.training + val); totalVal += val; count++; actionName = "訓練";
                busho.achievementTotal += Math.floor(val * 0.5);
                this.game.factionSystem.updateRecognition(busho, 10);
            }
            else if (type === 'soldier_charity') { 
                const val = GameSystem.calcSoldierCharity(busho); castle.morale = Math.min(100, castle.morale + val); totalVal += val; count++; actionName = "兵施し";
                busho.achievementTotal += Math.floor(val * 0.5);
                this.game.factionSystem.updateRecognition(busho, 10);
            }
            else if (type === 'banish') { if(!confirm(`本当に ${busho.name} を追放しますか？`)) return; busho.status = 'ronin'; busho.clan = 0; busho.isCastellan = false; this.game.ui.showResultModal(`${busho.name}を追放しました`); this.game.ui.updatePanelHeader(); this.game.ui.renderCommandMenu(); return; }
            else if (type === 'move_deploy') { 
                this.game.factionSystem.handleMove(busho, castle.id, targetId); 
                const targetC = this.game.getCastle(targetId); castle.samuraiIds = castle.samuraiIds.filter(id => id !== busho.id); targetC.samuraiIds.push(busho.id); busho.castleId = targetId; count++; actionName = "移動"; 
            }
            busho.isActionDone = true;
        });

        if (count > 0 && actionName !== "移動") { 
            let detail = "";
            if (actionName === "石高開発") detail = `(現在: ${castle.kokudaka}/${castle.maxKokudaka})`;
            if (actionName === "商業開発") detail = `(現在: ${castle.commerce}/${castle.maxCommerce})`;
            if (actionName === "城壁修復") detail = `(現在: ${castle.defense}/${castle.maxDefense})`;
            if (actionName === "訓練") detail = `(現在: ${castle.training}/100)`;
            if (actionName === "兵施し") detail = `(現在: ${castle.morale}/100)`;
            
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
            msg = `潜入に成功しました！\n情報を入手しました。\n(情報の精度: ${result.accuracy}%)`;
            bushos.forEach(b => {
                b.achievementTotal += Math.floor(b.intelligence * 0.2) + 10;
                this.game.factionSystem.updateRecognition(b, 20);
            });
        } else { 
            msg = `潜入に失敗しました……\n情報は得られませんでした。`; 
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
        const myPower = this.game.getClanTotalSoldiers(this.game.playerClanId); 
        const targetClanId = target.clan; 
        const targetPower = targetClanId === 0 ? 0 : this.game.getClanTotalSoldiers(targetClanId); 
        const success = GameSystem.calcEmploymentSuccess(doer, target, myPower, targetPower); 
        let msg = ""; 
        if (success) { 
            const oldCastle = this.game.getCastle(target.castleId); 
            if(oldCastle && oldCastle.samuraiIds.includes(target.id)) { oldCastle.samuraiIds = oldCastle.samuraiIds.filter(id => id !== target.id); } 
            const currentC = this.game.getCurrentTurnCastle(); 
            currentC.samuraiIds.push(target.id); 
            target.castleId = currentC.id; 
            target.clan = this.game.playerClanId; 
            target.status = 'active'; 
            target.loyalty = 50; 
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

    executeDiplomacy(doerId, targetClanId, type, gold = 0) {
        const doer = this.game.getBusho(doerId);
        const relation = this.game.getRelation(doer.clan, targetClanId);
        let msg = "";
        const isPlayerInvolved = (doer.clan === this.game.playerClanId || targetClanId === this.game.playerClanId);

        if (type === 'goodwill') {
            const baseBonus = (gold / 100) + (doer.diplomacy + doer.charm) * 0.1;
            const increase = Math.floor(baseBonus * (0.8 + Math.random() * 0.4));
            relation.friendship = Math.min(100, relation.friendship + increase);
            const castle = this.game.getCastle(doer.castleId); 
            if(castle) castle.gold -= gold;
            msg = `${doer.name}が親善を行いました。\n友好度が${increase}上昇しました`;
            doer.achievementTotal += Math.floor(doer.diplomacy * 0.2) + 10;
            this.game.factionSystem.updateRecognition(doer, 15);

        } else if (type === 'alliance') {
            const chance = relation.friendship + doer.diplomacy;
            if (chance > 120 && Math.random() > 0.3) {
                relation.alliance = true;
                msg = `同盟の締結に成功しました！`;
                doer.achievementTotal += Math.floor(doer.diplomacy * 0.2) + 10;
                this.game.factionSystem.updateRecognition(doer, 30);
            } else {
                relation.friendship = Math.max(0, relation.friendship - 10);
                msg = `同盟の締結に失敗しました……`;
                doer.achievementTotal += 5;
                this.game.factionSystem.updateRecognition(doer, 10);
            }
        } else if (type === 'break_alliance') {
            relation.alliance = false;
            relation.friendship = Math.max(0, relation.friendship - 60);
            msg = `同盟を破棄しました。`;
            doer.achievementTotal += 5;
            this.game.factionSystem.updateRecognition(doer, 10);
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

    executeHeadhunt(doerId, targetBushoId, gold) {
        const doer = this.game.getBusho(doerId);
        const target = this.game.getBusho(targetBushoId);
        const castle = this.game.getCurrentTurnCastle();
        if (castle.gold < gold) { alert("資金が足りません"); return; }
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
            if(oldCastle) {
                oldCastle.samuraiIds = oldCastle.samuraiIds.filter(id => id !== target.id);
                if (target.isCastellan) { target.isCastellan = false; oldCastle.castellanId = 0; }
            }
            target.clan = this.game.playerClanId; target.castleId = castle.id; target.loyalty = 50; target.isActionDone = true; castle.samuraiIds.push(target.id);
            this.game.ui.showResultModal(`${doer.name}の引抜工作が成功！\n${target.name}が我が軍に加わりました！`);
            const maxStat = Math.max(target.strength, target.intelligence, target.leadership, target.charm, target.diplomacy);
            doer.achievementTotal += Math.floor(maxStat * 0.3);
            this.game.factionSystem.updateRecognition(doer, 25);
        } else {
            this.game.ui.showResultModal(`${doer.name}の引抜工作は失敗しました……\n${target.name}は応じませんでした。`);
            doer.achievementTotal += 5;
            this.game.factionSystem.updateRecognition(doer, 10);
        }
        doer.isActionDone = true; this.game.ui.updatePanelHeader(); this.game.ui.renderCommandMenu();
    }

    executeReward(bushoId, gold) {
        const target = this.game.getBusho(bushoId);
        const daimyo = this.game.bushos.find(b => b.id === this.game.clans.find(c => c.id === this.game.playerClanId).leaderId);
        const castle = this.game.getCurrentTurnCastle();
        if(castle.gold < gold) { alert("金が足りません"); return; }
        castle.gold -= gold;
        const effect = GameSystem.calcRewardEffect(gold, daimyo, target);
        let msg = "";
        
        this.game.factionSystem.updateRecognition(target, -effect * 2);

        if (target.loyalty >= 100) {
            msg = "「もったいなきお言葉。この身、命尽きるまで殿のために！」\n(これ以上の忠誠は望めないほど、心服しているようだ)";
        } else {
            if (effect > 8) {
                msg = "「ありがたき幸せ！」\n(顔をほころばせ、深く感謝しているようだ)";
            } else if (effect > 0) {
                msg = "「はっ、頂戴いたします。」\n(恭しく受け取った)";
            } else {
                msg = "「……。」\n(不満があるようだ)";
            }
        }

        this.game.ui.showResultModal(`${target.name}に金${gold}を与えました。\n${msg}`);
        this.game.ui.updatePanelHeader(); this.game.ui.renderCommandMenu();
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
            loyaltyText = "特に不満はありません。与えられた役目は果たします。";
            attitudeText = "";
        } else if (perceivedLoyalty >= 25) {
            loyaltyText = "……少し、待遇を見直してはいただけませぬか。";
            attitudeText = "";
        } else {
            loyaltyText = "……。";
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
            if (interviewer.ambition > 80) comment = "「俺の力を持ってすれば、<br>天下も夢ではない……はずだ。」";
            else if (interviewer.personality === 'cautious') comment = "「慎重に行かねば、足元をすくわれよう。」";
            else comment = "「今のところは順調か……<br>いや、油断はできん。」";
            
            const returnScript = `window.GameApp.ui.reopenInterviewModal(window.GameApp.getBusho(${interviewer.id}))`;
            this.game.ui.showResultModal(`<strong>${interviewer.name}</strong><br>「${target.name}か……」<br><br>${comment}<br><br><button class='btn-secondary' onclick='${returnScript}'>戻る</button>`);
            return;
        }

        const dist = GameSystem.calcValueDistance(interviewer, target); 
        const affinityDiff = GameSystem.calcAffinityDiff(interviewer.affinity, target.affinity); 
        
        let affinityText = "";
        if (dist < 15) affinityText = "あの方とは意気投合します。素晴らしいお方です。";
        else if (dist < 30) affinityText = "話のわかる相手だと思います。信頼できます。";
        else if (dist < 50) affinityText = "悪くはありませんが、時折意見が食い違います。";
        else if (dist < 70) affinityText = "考え方がどうも合いません。理解に苦しみます。";
        else affinityText = "あやつとは反りが合いません。<br>顔も見たくない程です。";

        let loyaltyText = "";
        let togaki = ""; 

        if (interviewer.loyalty < 40) {
            loyaltyText = "さあ……？<br>他人の腹の内など、某には分かりかねます。";
            togaki = "";
        }
        else if (affinityDiff > 35) { 
            if (interviewer.intelligence >= 80) {
                loyaltyText = "あやつは危険です。,.<br>裏で妙な動きをしているとの噂も……。";
                togaki = "";
            } else {
                loyaltyText = "あやつとは口もききませぬゆえ、何も存じませぬ。";
                togaki = "";
            }
        }
        else if (target.intelligence > interviewer.intelligence + 20) {
            loyaltyText = "なかなか内心を見せぬお方です。";
            togaki = "";
        }
        else {
            const tLoyalty = target.loyalty;
            if (tLoyalty >= 85) loyaltyText = "殿への忠義は本物でしょう。疑う余地もありません。";
            else if (tLoyalty >= 65) loyaltyText = "不審な点はありませぬ。真面目に務めております。";
            else if (tLoyalty >= 45) loyaltyText = "今のところは大人しくしておりますが……。";
            else if (tLoyalty >= 25) loyaltyText = "近頃、何やら不満を漏らしているようです。";
            else loyaltyText = "油断なりませぬ。野心を抱いている気配があります。";
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
        if(vals.soldiers > 0) { t.training = GameSystem.calcWeightedAvg(t.training, t.soldiers, c.training, vals.soldiers); t.morale = GameSystem.calcWeightedAvg(t.morale, t.soldiers, c.morale, vals.soldiers); }
        c.gold -= vals.gold; c.rice -= vals.rice; c.soldiers -= vals.soldiers; t.gold += vals.gold; t.rice += vals.rice; t.soldiers += vals.soldiers;
        
        bushoIds.forEach(id => {
            const b = this.game.getBusho(id);
            this.game.factionSystem.handleMove(b, c.id, targetId); 
            b.isActionDone = true;
        });
        
        this.game.ui.showResultModal(`${this.game.getBusho(bushoIds[0]).name}が${t.name}へ物資を輸送しました`); this.game.ui.updatePanelHeader(); this.game.ui.renderCommandMenu();
    }

    executeAppointGunshi(bushoId) { const busho = this.game.getBusho(bushoId); const oldGunshi = this.game.bushos.find(b => b.clan === this.game.playerClanId && b.isGunshi); if (oldGunshi) oldGunshi.isGunshi = false; busho.isGunshi = true; this.game.ui.showResultModal(`${busho.name}を軍師に任命しました`); this.game.ui.updatePanelHeader(); this.game.ui.renderCommandMenu(); }

    executeIncite(doerId, targetId) { 
        const doer = this.game.getBusho(doerId); 
        const target = this.game.getCastle(targetId); 
        const result = GameSystem.calcIncite(doer); 
        if(result.success) { 
            target.loyalty = Math.max(0, target.loyalty - result.val); 
            this.game.ui.showResultModal(`${doer.name}の扇動が成功！\n${target.name}の民忠が${result.val}低下しました`); 
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
            targetBusho.loyalty = Math.max(0, targetBusho.loyalty - result.val); 
            this.game.ui.showResultModal(`${doer.name}の流言が成功！\n${targetBusho.name}の忠誠が${result.val}低下しました`); 
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
        const castle = this.game.getCurrentTurnCastle(); const rate = this.game.marketRate;
        if(type === 'buy') { const cost = Math.floor(amount * rate); if(castle.gold < cost) { alert("資金不足"); return; } castle.gold -= cost; castle.rice += amount; this.game.ui.showResultModal(`兵糧${amount}を購入しました\n(金-${cost})`); } else { if(castle.rice < amount) { alert("兵糧不足"); return; } const gain = Math.floor(amount * rate); castle.rice -= amount; castle.gold += gain; this.game.ui.showResultModal(`兵糧${amount}を売却しました\n(金+${gain})`); }
        this.game.ui.updatePanelHeader(); this.game.ui.renderCommandMenu();
    }

    executeDraft(bushoIds, gold) { 
        const castle = this.game.getCurrentTurnCastle(); 
        if(castle.gold < gold) { alert("資金不足"); return; } 
        castle.gold -= gold; 
        const busho = this.game.getBusho(bushoIds[0]); 
        const soldiers = GameSystem.calcDraftFromGold(gold, busho, castle.population); 
        const newMorale = Math.max(0, castle.morale - 10); 
        const newTraining = Math.max(0, castle.training - 10); 
        
        castle.training = GameSystem.calcWeightedAvg(castle.training, castle.soldiers, newTraining, soldiers); 
        castle.morale = GameSystem.calcWeightedAvg(castle.morale, castle.soldiers, newMorale, soldiers); 
        castle.soldiers += soldiers; 
        busho.isActionDone = true; 
        
        busho.achievementTotal += 5;
        this.game.factionSystem.updateRecognition(busho, 10);
        this.game.ui.showResultModal(`${busho.name}が徴兵を行いました\n兵士+${soldiers}`); 
        this.game.ui.updatePanelHeader(); this.game.ui.renderCommandMenu();
    }

    executeCharity(bushoIds, type) { 
        const castle = this.game.getCurrentTurnCastle(); 
        const busho = this.game.getBusho(bushoIds[0]); 
        let costGold = 0, costRice = 0; 
        if (type === 'gold' || type === 'both') costGold = 300; 
        if (type === 'rice' || type === 'both') costRice = 300; 
        
        if (castle.gold < costGold || castle.rice < costRice) { alert("物資不足"); return; } 
        castle.gold -= costGold; castle.rice -= costRice; 
        
        const val = GameSystem.calcCharity(busho, type); 
        castle.loyalty = Math.min(1000, castle.loyalty + val); 
        busho.isActionDone = true; 
        
        busho.achievementTotal += Math.floor(val * 0.5);
        this.game.factionSystem.updateRecognition(busho, 15);
        this.game.ui.showResultModal(`${busho.name}が施しを行いました\n民忠+${val}`); 
        this.game.ui.updatePanelHeader(); this.game.ui.renderCommandMenu();
    }
}