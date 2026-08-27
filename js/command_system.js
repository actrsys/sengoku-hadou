/**
 * command_system.js
 * コマンド開始・対象選択・実行フローを管理する司令塔。
 * コマンド定義/実行条件は command_catalog.js、セーブ/ロード画面は SaveLoadView に委譲します。
 */

class CommandSystem {
    constructor(game) {
        this.game = game;
    }
    
    // ==========================================
    // ★追加：金や兵糧が足りているかチェックして、足りなければメッセージを出す共通の魔法です
    // ==========================================
    checkResource(castle, needGold = 0, needRice = 0) {
        if (needGold > 0 && castle.gold < needGold) {
            this.game.ui.showDialog(`資金が足りないため実行できませんでした。`, false);
            return false;
        }
        if (needRice > 0 && castle.rice < needRice) {
            this.game.ui.showDialog(`兵糧が足りないため実行できませんでした。`, false);
            return false;
        }
        return true;
    }

    /**
     * コマンド実行後のUI更新とメッセージ表示を一元管理する魔法です
     * マップの更新を先に行い、画面表示を最新にしてから結果メッセージを出します。
     * @param {string} msg - 結果画面に表示するメッセージ（不要な場合は null）
     * @param {boolean} needsMapUpdate - マップの再描画が必要かどうか
     * @param {string} logMsg - 履歴に残すログメッセージ（不要な場合は null）
     */
    finishCommand(msg, needsMapUpdate = false, logMsg = null) {
        // 1. まず画面の表示を最新の状態に更新します
        this.game.ui.updatePanelHeader();
        this.game.ui.renderCommandMenu();
        if (needsMapUpdate) {
            this.game.ui.renderMap();
        }
        
        // 2. ログを残します。全国履歴へ切り替えても主語が失われないよう、実際の大名家名を明記します。
        if (logMsg) {
            const playerClan = this.game.getClan ? this.game.getClan(this.game.playerClanId) : null;
            const clanName = playerClan ? playerClan.name : '自家';
            const tagged = String(logMsg).match(/^(【[^】]+】)(.*)$/);
            const historyText = tagged
                ? `${tagged[1]}${clanName}は${tagged[2]}`
                : `${clanName}は${logMsg}`;
            this.game.ui.log(historyText, { clanIds: [this.game.playerClanId], category: 'command', inferCurrentTurn: false });
        }
        
        // 3. 全ての更新が終わってから、最後にメッセージを表示して背景をストップさせます！
        if (msg) {
            this.game.ui.showResultModal(msg);
        }
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
        if (['rumor_target_busho','headhunt_target','assassinate_target','kunishu_headhunt_target','view_only'].includes(actionType)) {
             isEnemyTarget = true;
             targetCastle = this.game.getCastle(targetId);
        }

        const gunshi = this.game.getClanGunshi(this.game.playerClanId);
        const myDaimyo = this.game.getClanDaimyo(this.game.playerClanId);
        const c = currentCastle;

        // --- 条件分岐（誰をリストに出すか） ---
        if (actionType === 'employ_target') { 
            bushos = [];
            // 登用対象は自領拠点に実在する浪人だけなので、全国武将を走査せず
            // 自領の samuraiIds 正本から候補を集めます。
            for (const ownedCastle of this.game.getClanCastles(this.game.playerClanId)) {
                for (const b of this.game.getCastleBushos(ownedCastle.id)) {
                    if (window.BushoStatusRules.isRonin(b) && Number(b.belongKunishuId || 0) === 0) bushos.push(b);
                }
            }
            infoHtml = "<div>登用する浪人を選択してください</div>"; 
        }
        else if (actionType === 'employ_doer') {
            bushos = this.game.getCastleBushos(c.id).filter(b => b.clan === c.ownerClan && window.BushoStatusRules.isActive(b)); 
            infoHtml = "<div>登用を行う担当官を選択してください</div>"; 
        } 
        else if (actionType === 'diplomacy_doer') { 
            bushos = this.game.getCastleBushos(c.id).filter(b => b.clan === c.ownerClan && window.BushoStatusRules.isActive(b)); 
            infoHtml = "<div>外交の担当官を選択してください</div>"; 
        }
        // ★追加：貢物を持っていく使者を選ぶリスト
        else if (actionType === 'tribute_doer') { 
            bushos = this.game.getCastleBushos(c.id).filter(b => b.clan === c.ownerClan && window.BushoStatusRules.isActive(b)); 
            infoHtml = "<div>朝廷への使者を選択してください</div>"; 
        }
        else if (actionType === 'rumor_target_busho') { 
            const targetCastle = this.game.getCastle(targetId);
            bushos = this.game.getCastleBushos(targetId).filter(b => b.clan === targetCastle.ownerClan && Number(b.belongKunishuId || 0) === 0 && window.BushoStatusRules.isActive(b) && !b.isDaimyo); 
            infoHtml = "<div>離間計の対象とする武将を選択してください</div>"; 
        }
        else if (actionType === 'rumor_doer') { 
            bushos = this.game.getCastleBushos(c.id).filter(b => b.clan === c.ownerClan && window.BushoStatusRules.isActive(b)); 
            infoHtml = "<div>離間計を実行する担当官を選択してください</div>"; 
        }
        else if (actionType === 'incite_doer') { 
            bushos = this.game.getCastleBushos(c.id).filter(b => b.clan === c.ownerClan && window.BushoStatusRules.isActive(b)); 
            infoHtml = "<div>民心撹乱を実行する担当官を選択してください</div>"; 
        }
        else if (actionType === 'sabotage_doer') { 
            bushos = this.game.getCastleBushos(c.id).filter(b => b.clan === c.ownerClan && window.BushoStatusRules.isActive(b)); 
            infoHtml = "<div>破壊工作を実行する担当官を選択してください</div>"; 
        }
        else if (actionType === 'headhunt_target') { 
            const targetCastle = this.game.getCastle(targetId);
            bushos = this.game.getCastleBushos(targetId).filter(b => b.clan === targetCastle.ownerClan && Number(b.belongKunishuId || 0) === 0 && window.BushoStatusRules.isActive(b) && !b.isDaimyo); 
            infoHtml = "<div>武将引抜の対象とする武将を選択してください </div>"; 
        }
        else if (actionType === 'assassinate_target') { 
            const targetCastle = this.game.getCastle(targetId);
            bushos = this.game.getCastleBushos(targetId).filter(b => b.clan === targetCastle.ownerClan && Number(b.belongKunishuId || 0) === 0 && window.BushoStatusRules.isActive(b) && !b.isDaimyo); 
            infoHtml = "<div>暗殺の対象とする武将を選択してください</div>"; 
        }
        else if (actionType === 'kuko_doer') {
            bushos = this.game.getCastleBushos(c.id).filter(b => b.clan === c.ownerClan && window.BushoStatusRules.isActive(b)); 
            infoHtml = "<div>駆虎呑狼を実行する担当官を選択してください</div>"; 
        }
        else if (actionType === 'kunishu_incorporate_doer') {
            bushos = this.game.getCastleBushos(c.id).filter(b => b.clan === c.ownerClan && window.BushoStatusRules.isActive(b)); 
            infoHtml = "<div>取込の交渉を行う担当官を選択してください</div>"; 
        }
        else if (actionType === 'headhunt_doer') {
            bushos = this.game.getCastleBushos(c.id).filter(b => b.clan === c.ownerClan && window.BushoStatusRules.isActive(b)); 
            infoHtml = "<div>引抜を実行する担当官を選択してください</div>"; 
        }
        else if (actionType === 'assassinate_doer') {
            bushos = this.game.getCastleBushos(c.id).filter(b => b.clan === c.ownerClan && window.BushoStatusRules.isActive(b)); 
            infoHtml = "<div>暗殺を実行する担当官を選択してください</div>"; 
        }
        else if (actionType === 'arrange_marriage_busho') { 
            bushos = this.game.getClanBushos(this.game.playerClanId).filter(b => window.BushoStatusRules.isActive(b) && !b.isDaimyo && !b.female); 
            infoHtml = "<div>姫を嫁がせる武将を選択してください</div>"; 
            if (extraData) extraData.allowDone = true;
        }
        else if (actionType === 'investigate_deploy') { 
            bushos = this.game.getCastleBushos(c.id).filter(b => b.clan === c.ownerClan && window.BushoStatusRules.isActive(b)); 
            infoHtml = "<div>調査を行う武将を選択してください(複数可)</div>"; 
        }
        else if (actionType === 'view_only') { 
            bushos = this.game.getCastleBushos(targetId); 
            infoHtml = "<div>武将一覧です</div>"; 
        }
        else if (actionType === 'all_busho_list') { 
            bushos = this.game.getClanBushos(this.game.playerClanId).filter(b => window.BushoStatusRules.isActive(b));
            infoHtml = "<div>武将一覧です</div>"; 
            isMulti = false;
        }
        else if (actionType === 'marriage_kinsman') {
            const targetClanId = this.game.getCastle(targetId).ownerClan;
            const targetLeaderId = this.game.getClan(targetClanId)?.leaderId;
            const targetLeader = this.game.getBusho(targetLeaderId);
            
            bushos = this.game.getClanBushos(targetClanId).filter(b => {
                if (!window.BushoStatusRules.isActive(b) || b.female) return false;
                // 大名本人か、直接の血縁（お互いのリストに直接IDが含まれている）かをチェックします
                const bFamily = Array.isArray(b.familyIds) ? b.familyIds : [];
                const lFamily = Array.isArray(targetLeader.familyIds) ? targetLeader.familyIds : [];
                return b.id === targetLeader.id || bFamily.includes(targetLeader.id) || lFamily.includes(b.id);
            });
            infoHtml = "<div>姫を嫁がせる相手を選択してください</div>";
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
            bushos = this.game.getClanBushos(this.game.playerClanId).filter(b => 
                window.BushoStatusRules.isActive(b) && 
                !b.isDaimyo && 
                !b.isCommander &&
                !b.isCastellan
            );
            infoHtml = "<div>軍師に任命する武将を選択してください</div>";
        }
        else if (actionType === 'appoint_legion_leader') {
            bushos = this.game.getClanBushos(this.game.playerClanId).filter(b => 
                window.BushoStatusRules.isActive(b) && 
                !b.isDaimyo &&
                !b.isCommander
            );
            infoHtml = "<div>国主に任命する武将を選択してください</div>"; 
            isMulti = false;
        }
        else if (actionType === 'def_intercept_deploy') {
            const targetC = this.game.getCastle(targetId);
            bushos = this.game.getCastleBushos(targetId).filter(b => b.clan === targetC.ownerClan && window.BushoStatusRules.isActive(b));
            infoHtml = "<div>出陣武将を選択してください（最大5名まで）</div>";
        }
        else if (actionType === 'def_reinf_deploy' || actionType === 'atk_reinf_deploy') {
            const targetC = this.game.getCastle(targetId);
            bushos = this.game.getCastleBushos(targetId).filter(b => b.clan === targetC.ownerClan && window.BushoStatusRules.isActive(b));
            infoHtml = "<div>派遣する武将を選択してください（最大5名まで）</div>";
        }
        else if (actionType === 'def_self_reinf_deploy' || actionType === 'atk_self_reinf_deploy') {
            const targetC = this.game.getCastle(targetId);
            bushos = this.game.getCastleBushos(targetId).filter(b => b.clan === targetC.ownerClan && window.BushoStatusRules.isActive(b));
            infoHtml = "<div>出陣武将を選択してください（最大5名まで）</div>";
        }
        else if (actionType === 'reward') {
            bushos = this.game.getClanBushos(this.game.playerClanId).filter(b => 
                window.BushoStatusRules.isActive(b) && 
                !b.isDaimyo                          
            );
            infoHtml = "<div>褒美を与える武将を選択してください</div>"; 
        }
        else if (actionType === 'banish') {
            bushos = this.game.getClanBushos(this.game.playerClanId).filter(b => 
                window.BushoStatusRules.isActive(b) && 
                !b.isDaimyo                          
            );
            infoHtml = "<div>追放する武将を選択してください</div>"; 
        }
        else if (actionType === 'succession_target') {
            const daimyo = this.game.getClanDaimyo(this.game.playerClanId);
            if (daimyo) {
                const dFamily = Array.isArray(daimyo.familyIds) ? daimyo.familyIds : [];
                bushos = this.game.getClanBushos(this.game.playerClanId).filter(b => {
                    if (b.isDaimyo || b.isRetired) return false; // 隠居状態（isRetired）は除外する
                    if (!window.BushoStatusRules.isActive(b) && !window.LifeStatusRules.isUnborn(b)) return false;

                    // ★追加：unborn の中でも「出生前」フラグが立っている場合は除外する
                    if (window.LifeStatusRules.isUnborn(b) && b.isNotBorn) return false;

                    const bFamily = Array.isArray(b.familyIds) ? b.familyIds : [];
                    return bFamily.includes(daimyo.id) || dFamily.includes(b.id);
                });
            }
            infoHtml = "<div>家督を譲る一門武将を選択してください</div>";
        }
        else if (actionType === 'adopt_son_target') {
            const daimyo = this.game.getClanDaimyo(this.game.playerClanId);
            if (daimyo) {
                bushos = this.game.getClanBushos(this.game.playerClanId).filter(b => {
                    if (!window.BushoStatusRules.isActive(b) || b.isDaimyo) return false;
                    return b.birthYear >= daimyo.birthYear + 15;
                });
            }
            infoHtml = "<div>養子にする武将を選択してください</div>";
        }
        else {
            // ★追加: 内政などの通常の命令でも、未登場の武将や諸勢力が勝手にリストに出ないようにします
            bushos = this.game.getCastleBushos(c.id).filter(b => b.clan === c.ownerClan && window.BushoStatusRules.isActive(b));
            
            if (spec.msg) {
                infoHtml = `<div>${spec.msg}</div>`;
                if (actionType === 'war_deploy') {
                    infoHtml = `<div>出陣武将を選択してください（最大5名まで）</div>`;
                }
            } else if (['farm'].includes(actionType)) { infoHtml = `<div>金: ${c.gold} (1回${window.MainParams.CommandCost.Farm})</div>`; }
            else if (['commerce'].includes(actionType)) { infoHtml = `<div>金: ${c.gold} (1回${window.MainParams.CommandCost.Commerce})</div>`; }
            else if (['charity'].includes(actionType)) { infoHtml = `<div>金: ${c.gold}, 米: ${c.rice} (1回${window.MainParams.CommandCost.Charity})</div>`; }
            else if (['repair'].includes(actionType)) { infoHtml = `<div>金: ${c.gold} (1回${window.MainParams.CommandCost.Repair})</div>`; }
            else if (['draft'].includes(actionType)) { infoHtml = `<div>民忠: ${c.peoplesLoyalty}</div>`; }
            else if (['training','soldier_charity'].includes(actionType)) { infoHtml = `<div>状態: 訓練${c.training}/士気${c.morale}</div>`; }
            else if (actionType === 'war_deploy' || actionType === 'kunishu_subjugate_deploy') { infoHtml = `<div>出陣武将を選択してください（最大5名まで）</div>`; }
        }
        
        // --- 並び替え（ソート） ---
        const isViewOnly = actionType === 'view_only' || actionType === 'all_busho_list';
        
        bushos.sort((a,b) => {
            if (actionType === 'reward') {
                if (gunshi && this.game.gunshiSystem) {
                    return this.game.gunshiSystem.compareLoyaltyAssessments(a, b, gunshi);
                }
                // 軍師不在時は真の忠誠を使った並べ替えをしない。
                return String(a.name || '').localeCompare(String(b.name || ''), 'ja');
            }

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
                    if (window.BushoStatusRules.isRonin(target)) return 90; 
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
                         return DomesticRules.calcDevelopment(target, 1.0);
                     }
                     if (actionType === 'repair') {
                         return DomesticRules.calcRepair(target, 1.0);
                     }
                     if (actionType === 'charity') {
                         return DomesticRules.calcCharity(target, 1.0);
                     }
                     if (actionType === 'training') {
                         return DomesticRules.calcTraining(target, cCastle.soldiers || 1, 1.0);
                     }
                     if (actionType === 'soldier_charity') {
                         return DomesticRules.calcSoldierCharity(target, cCastle.soldiers || 1, 1.0);
                     }
                     if (actionType === 'draft') {
                         // ★変更：城の実際の民忠と人口を渡して、リアルな「徴兵効率」でソートします
                         return DomesticRules.calcDraftEfficiency(target, cCastle.peoplesLoyalty, cCastle.population);
                     }
                     if (['war_deploy', 'def_intercept_deploy', 'def_reinf_deploy', 'atk_reinf_deploy', 'def_self_reinf_deploy', 'atk_self_reinf_deploy', 'kunishu_subjugate_deploy'].includes(actionType)) {
                         return (target.leadership * 1.5) + target.strength;
                     }

                     // ==========================================
                     // ★変更：計算式を strategy_system.js の共通処理から呼び出すようにしました
                     // ==========================================
                     if (actionType === 'sabotage_doer') {
                         return StrategySystem.calcSabotageScore(target);
                     }
                     if (actionType === 'incite_doer') {
                         return StrategySystem.calcInciteScore(target);
                     }
                     if (actionType === 'rumor_doer') {
                         return StrategySystem.calcRumorScore(target);
                     }
                     if (actionType === 'headhunt_doer') {
                         return StrategySystem.calcHeadhuntScore(target);
                     }
                     if (actionType === 'assassinate_doer') {
                         return StrategySystem.calcAssassinateScore(target);
                     }
                     if (actionType === 'kuko_doer') {
                         return StrategySystem.calcKukoScore(target);
                     }
                     // ==========================================
                     // ★追加：外交コマンドの時は、外交の専門部署に「成功率」を計算させてそれで並べ替えます！
                     if (actionType === 'diplomacy_doer' && extraData && extraData.subAction) {
                         const subType = extraData.subAction;
                         if (['goodwill', 'alliance', 'subordinate', 'truce', 'marriage', 'dominate'].includes(subType)) {
                             // diplomacy.js で一元管理されている魔法を呼び出します
                             if (this.game && this.game.diplomacyManager && typeof this.game.diplomacyManager.getDiplomacyProb === 'function') {
                                 const prob = this.game.diplomacyManager.getDiplomacyProb(target.id, targetId, subType);
                                 // 同じ成功率なら、外交力が高い人が少しだけ上に来るように「小数点」でオマケをつけます
                                 return prob + (target.diplomacy * 0.001);
                             }
                         }
                         // 成功率の計算がないもの（朝廷和睦や断交など）は、シンプルに外交力を使います
                         return target.diplomacy;
                     }
                     // ==========================================
                 } catch (e) {
                 }

                 if (isEnemyTarget) return StatPresenter.getPerceivedStatValue(target, sortKey, gunshi, acc, this.game.playerClanId, myDaimyo) || 0;
                 const val = StatPresenter.getPerceivedStatValue(target, sortKey, gunshi, null, this.game.playerClanId, myDaimyo);
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
                if (typeof item === 'object' && item !== null) {
                    if (item.label === label) return item;
                    if (item.items) {
                        const found = findMenu(item.items, label);
                        if (found) return found;
                    }
                }
            }
            return null;
        };

        const targetMenu = findMenu(COMMAND_MENU_STRUCTURE, categoryLabel);
        if (!targetMenu) return false;

        const hasExecutableCommand = (menuItem) => {
            if (menuItem.items) {
                for (const item of menuItem.items) {
                    if (typeof item === 'string') {
                        if (this.canExecuteCommand(item)) return true;
                    } else if (typeof item === 'object' && item !== null) {
                        if (hasExecutableCommand(item)) return true;
                    }
                }
            }
            return false;
        };

        return !hasExecutableCommand(targetMenu);
    }
    
    // 移行互換窓口。接続探索の計算本体は MapGraphService に一元化しています。
    getConnectedCastles(startCastle, clanId) {
        return this.game.mapGraph.getOwnedConnectedIds(startCastle, clanId);
    }

    getConnectedCastlesForMove(startCastle, clanId) {
        return this.game.mapGraph.getConnectedOwnIdsForMove(startCastle, clanId);
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
            'goodwill', 'truce', 'alliance', 'marriage', 'dominate', 'subordinate', 'break_alliance',
            'kunishu_goodwill', 'kunishu_incorporate', 
            'sabotage', 'incite', 'rumor', 'headhunt', 'assassinate', 'kuko',
            'tribute', 'court_truce',
            'employ', 'move'
        ];
        if (actionRequiredCommands.includes(type)) {
            // ★Round12：可否判定だけなので配列を作らず、1人見つかった時点で終了します。
            const hasActiveBusho = this.game.getCastleBushos(castle.id).some(b => b.clan === castle.ownerClan && window.BushoStatusRules.isActive(b) && !b.isActionDone);
            if (!hasActiveBusho) return false;
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

        let targetType = '';
        if (type === 'kuko_target_b') {
            targetType = 'kuko_target_b';
        } else {
            const spec = COMMAND_SPECS[type];
            if (!spec || !spec.targetType) return [];
            targetType = spec.targetType;
        }

        const c = this.game.getCurrentTurnCastle();
        const playerClanId = Number(this.game.playerClanId);
        switch (targetType) {
            case 'enemy_valid': {
                // warManagerからの基本リストを取得
                const baseTargets = this.game.warManager.getValidWarTargets(c);
                const playerClanCastles = this.game.getClanCastles(playerClanId);
                // ★追加：自領と直接隣接している（同盟国などを通らない）城だけに出陣可能にします
                return baseTargets.filter(targetId => {
                    const targetCastle = this.game.getCastle(targetId);
                    if (!targetCastle) return false;
                    return playerClanCastles.some(myCastle =>
                        MapGraphService.isAdjacent(targetCastle, myCastle)
                    );
                });
            }
            
            case 'enemy_all': 
                return this.game.castles.filter(target => 
                    Number(target.ownerClan) !== playerClanId && target.ownerClan !== 0
                ).map(t => t.id);

            case 'ally_other': {
                // ★修正：同盟・支配・従属を通って繋がっている領土をまとめて取得します！
                const connectedForAlly = this.getConnectedCastlesForMove(c, playerClanId);
                const playerClanCastles = this.game.getClanCastles(playerClanId);
                return playerClanCastles.filter(target => {
                    if (target.id === c.id) return false;
                    
                    // ★追加：大雪の国の城は移動・輸送先に選べないようにします！
                    const tgtProv = this.game.getProvince(target.provinceId);
                    if (tgtProv && tgtProv.statusEffects && tgtProv.statusEffects.includes('heavySnow')) {
                        return false;
                    }

                    return connectedForAlly.has(Number(target.id));
                }).map(t => t.id);
            }
            
            case 'other_clan_all': {
                // 自領という候補集合はこの1回の判定中は不変。各候補勢力ごとに全国拠点を再検索しません。
                const playerClanCastles = this.game.getClanCastles(playerClanId);
                return this.game.castles.filter(target => {
                    if (target.ownerClan === 0 || Number(target.ownerClan) === playerClanId) return false;

                    // ★追加：すでにその関係になっている場合は、選べないように（暗く）する魔法！
                    const rel = this.game.getRelation(playerClanId, target.ownerClan);
                    if (rel) {
                        if (type === 'goodwill' && rel.sentiment >= 100) return false; // ★ここを追加！友好度100なら親善できないようにします
                        if (type === 'alliance' && rel.status === window.GameConstants.DiplomacyStatus.ALLIANCE) return false;
                        if (type === 'dominate' && rel.status === window.GameConstants.DiplomacyStatus.DOMINANT) return false;
                        if (type === 'subordinate' && rel.status === window.GameConstants.DiplomacyStatus.SUBORDINATE) return false;
                    }
                    
                    // ★追加：降伏勧告と従属願と臣従願は、自領と接している勢力に限定します！
                    if (type === 'dominate' || type === 'subordinate' || type === 'vassalage') {
                        const targetClanCastles = this.game.getClanCastles(target.ownerClan);
                        const isAdjacent = playerClanCastles.some(myCastle =>
                            targetClanCastles.some(otherCastle => MapGraphService.isAdjacent(myCastle, otherCastle))
                        );
                        if (!isAdjacent) return false;
                    }

                    // ★今回追加：臣従願は、相手の威信が自家の「5倍以上」ないと選べないようにします！
                    if (type === 'vassalage') {
                        const myClan = this.game.getClan(playerClanId);
                        const targetClan = this.game.getClan(target.ownerClan);
                        if (myClan && targetClan) {
                            if (targetClan.daimyoPrestige < myClan.daimyoPrestige * 5) {
                                return false;
                            }
                        }
                    }
                    
                    // その大名家の「大名（当主）」を探して、その人がいる城だけをOK（選択可能）にします！
                    const daimyo = this.game.getClanDaimyo(target.ownerClan);
                    
                    // ★追加：降伏勧告のとき、相手の大名が「征夷大将軍（ID1の官位）」を持っていたら選べなくします！
                    if (type === 'dominate' && daimyo && daimyo.courtRankIds && daimyo.courtRankIds.includes(1)) {
                        return false;
                    }

                    return daimyo && Number(daimyo.castleId) === Number(target.id);
                }).map(t => t.id);
            }
                
            case 'kuko_target_b':
                return this.game.castles.filter(target => {
                    // 自勢力や空き城は選べないようにします
                    if (target.ownerClan === 0 || Number(target.ownerClan) === playerClanId) return false;
                    // すでに1回目で選んだ勢力Aも選べないようにします
                    if (Number(target.ownerClan) === this.game.tempKukoData.clanAId) return false;
                    
                    const daimyo = this.game.getClanDaimyo(target.ownerClan);
                    return daimyo && Number(daimyo.castleId) === Number(target.id);
                }).map(t => t.id);

            case 'ally_clan': 
                return this.game.castles.filter(target => {
                    if (target.ownerClan === 0 || Number(target.ownerClan) === playerClanId) return false;
                    const rel = this.game.getRelation(playerClanId, target.ownerClan);
                    // ★バリア追加：rel が空っぽの時に落ちないようにガードしました！
                    return rel && rel.status === window.GameConstants.DiplomacyStatus.ALLIANCE;
                }).map(t => t.id);

            case 'breakable_clan': 
                return this.game.castles.filter(target => {
                    if (target.ownerClan === 0 || Number(target.ownerClan) === playerClanId) return false;
                    const rel = this.game.getRelation(playerClanId, target.ownerClan);
                    // ★バリア追加：rel が空っぽの時に落ちないようにガードしました！
                    if (!rel || !window.DiplomacyRules.isAllianceOrVassal(rel.status)) return false;
                    
                    const daimyo = this.game.getClanDaimyo(target.ownerClan);
                    return daimyo && Number(daimyo.castleId) === Number(target.id);
                }).map(t => t.id);
                
            // ★追加：敵対している大名だけを選べるようにする絞り込みです！
            case 'hostile_clan_only':
                return this.game.castles.filter(target => {
                    if (target.ownerClan === 0 || Number(target.ownerClan) === playerClanId) return false;
                    const rel = this.game.getRelation(playerClanId, target.ownerClan);
                    // 敵対状態のみ選択可能にします！
                    if (!rel || rel.status !== window.GameConstants.DiplomacyStatus.HOSTILE) return false;
                    
                    const daimyo = this.game.getClanDaimyo(target.ownerClan);
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
                const myClan = this.game.getClan(myClanId);
                const myPrestige = myClan ? myClan.daimyoPrestige : 0;

                const validKunishus = activeKunishus.filter(k => {
                    const castle = this.game.getCastle(k.castleId);
                    // 自分の城にいること
                    if (!castle || Number(castle.ownerClan) !== myClanId) return false;
                    // 宗教、商人ではないこと
                    if (k.ideology === '宗教' || k.ideology === '商人') return false;
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
                // 商人以外の生きている諸勢力を取得します
                const activeKunishus = this.game.kunishuSystem.getAliveKunishus().filter(k => k.ideology !== '商人');
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
                    const isNextToConnected = this.game.castles.some(myC => connectedCastles.has(Number(myC.id)) && MapGraphService.isAdjacent(targetCastle, myC));
                    
                    // どちらか1つでも当てはまればOK（地図で光らせる）！
                    return isConnected || isNextToConnected;
                });
            }
            
            case 'marriage_valid': {
                // 1. まず、自分の大名家に嫁がせられる姫（未婚の姫）がいるかチェックします
                const myClan = this.game.getClan(playerClanId);
                const hasUnmarriedPrincess = myClan && myClan.princessIds && myClan.princessIds.some(pId => {
                    const p = this.game.getPrincess(pId);
                    return p && p.status === 'unmarried';
                });
                // 未婚の姫が一人もいなければ、選べる城は「ゼロ」にしておきます
                if (!hasUnmarriedPrincess) return [];

                // 2. 他の大名家の城を「フィルター（ふるい）」にかけて、条件に合うものだけを残します
                return this.game.castles.filter(target => {
                    if (target.ownerClan === 0 || Number(target.ownerClan) === playerClanId) return false;
                    
                    // ★追加：その大名家の「大名（当主）」を探して、その人がいる城（居城）だけをOKにします！
                    const daimyo = this.game.getClanDaimyo(target.ownerClan);
                    if (!daimyo || Number(daimyo.castleId) !== Number(target.id)) return false;

                    const targetLeaderId = this.game.getClan(target.ownerClan)?.leaderId;
                    const targetLeader = this.game.getBusho(targetLeaderId);
                    if (targetLeader) {
                        // 相手の家の一門武将を探します
                        const kinsmen = this.game.getClanBushos(target.ownerClan).filter(b => {
                            if (!window.BushoStatusRules.isActive(b)) return false;
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

            case 'interview':
                if (this.game.interviewSystem) this.game.interviewSystem.open();
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
            case 'guide':
                if (this.game.ui.guideView) this.game.ui.guideView.open();
                break;
            case 'save': 
                // セーブ画面（スロット選択）を開きます
                this.game.ui.saveLoadView.open('save');
                break;
            case 'reward_all':
                this.game.ui.showDialog(`金${window.MainParams.CommandCost.RewardAll}を支払い、家臣全員に褒美を与えます。よろしいですか？`, true, () => {
                    this.executeRewardAll();
                }, null, { okText: '実行', cancelText: 'やめる' });
                break;
            case 'load':
                // ロード画面（スロット選択）を開きます
                this.game.ui.saveLoadView.open('load');
                break;
            case 'history':
                if (this.game.ui.info) {
                    this.game.ui.info.showHistoryModal();
                } else {
                    this.game.ui.showHistoryModal();
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
            case 'legion_council':
                if (this.game.ui.legionCouncilView) this.game.ui.legionCouncilView.requestOpen();
                break;
            case 'watch':
                this.game.ui.showDialog("AI同士の戦いを観戦しますか？\n（画面の右クリック、または長押しで中断できます）", true, () => {
                    this.game.startWatchMode();
                }, null, { okText: '観戦する', okClass: 'btn-primary', cancelText: 'やめる' });
                break;
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
    
    // ==========================================
    // ★セーブ・ロードのスロット選択画面を作る魔法
    // ==========================================

    
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
            const trueProb = PersonnelRules.getEmployProb(doer, target, myPower, targetPower, this.game);
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

        if (actionType === 'assassinate_target') {
            this.game.ui.openBushoSelector('assassinate_doer', null, { targetId: firstId });
            return;
        }
        
        if (actionType === 'assassinate_doer') {
            const trueProb = this.game.strategySystem.getAssassinateProb(firstId, extraData.targetId);
            this.showAdviceAndExecute('assassinate', () => this.game.strategySystem.executeAssassinate(firstId, extraData.targetId), { trueProb: trueProb });
            return;
        }

        if (actionType === 'kuko_doer') {
            const data = this.game.tempKukoData;
            this.game.tempKukoData = null; 
            
            const trueProb = this.game.strategySystem.getKukoProb(firstId, data.clanAId, data.clanBId);
            const expectedDamage = this.game.strategySystem.getKukoExpectedDamage(firstId, data.clanAId, data.clanBId);
            this.showAdviceAndExecute('kuko', () => this.game.strategySystem.executeKuko(firstId, data.clanAId, data.clanBId), { trueProb: trueProb, expectedDamage: expectedDamage });
            return;
        }

        if (actionType === 'rumor_target_busho') {
            this.game.ui.openBushoSelector('rumor_doer', targetId, { targetBushoId: firstId });
            return;
        }

        // ★ここから追加：婚姻のリストで決定ボタンを押した時の動き！
        if (actionType === 'marriage_princess') {
            // 自勢力の縁組の場合は、確認ダイアログを出してから結婚させます
            if (!targetId && this.game.ui.info && this.game.ui.info.arrangeMarriageBushoId) {
                const busho = this.game.getBusho(this.game.ui.info.arrangeMarriageBushoId);
                const princess = this.game.getPrincess(firstId);
                
                const msg = `${busho.name} に ${princess.name} を嫁がせます。よろしいですか？`;
                
                this.game.ui.showDialog(msg, true, 
                    () => {
                        this.executeWithEvent('arrange_marriage', () => this.executeArrangeMarriage(busho, princess));
                        this.game.ui.info.arrangeMarriageBushoId = null; // リセット
                    },
                    null,
                    { okText: '嫁がせる', cancelText: 'やめる' }
                );
                return;
            }

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
            const targetClan = this.game.getClan(targetClanId);
            const targetBusho = this.game.getBusho(targetBushoId);
            const princess = this.game.getPrincess(princessId);
            const doer = this.game.getBusho(doerId);

            const msg = `${targetClan.name} の ${targetBusho.name} に、当家の ${princess.name} を嫁がせます。よろしいですか？`;

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
                },
                { okText: '嫁がせる', cancelText: 'やめる' }
            );
            return;
        }

        if (actionType === 'rumor_doer') {
            // ★専門部署である StrategySystem の計算魔法を呼びます！
            const trueProb = this.game.strategySystem.getRumorProb(firstId, extraData.targetBushoId);
            const expectedDamage = this.game.strategySystem.getRumorExpectedDamage(firstId, extraData.targetBushoId);
            this.showAdviceAndExecute('rumor', () => this.game.strategySystem.executeRumor(firstId, targetId, extraData.targetBushoId), { trueProb: trueProb, expectedDamage: expectedDamage });
            return;
        }

        if (actionType === 'diplomacy_doer') {
            if (extraData.subAction === 'goodwill') {
                this.game.ui.openQuantitySelector('goodwill', selectedIds, targetId);
            } else if (extraData.subAction === 'alliance') {
                // 外交担当に「この条件で確率教えて！」と合図を送るだけ！
                const prob = this.game.diplomacyManager.getDiplomacyProb(firstId, targetId, 'alliance');
                this.showAdviceAndExecute('alliance', () => this.game.diplomacyManager.executeDiplomacy(firstId, targetId, 'alliance'), { trueProb: prob / 100 });
            } else if (extraData.subAction === 'break_alliance') {
                this.executeWithEvent('break_alliance', () => this.game.diplomacyManager.executeDiplomacy(firstId, targetId, 'break_alliance'));
            } else if (extraData.subAction === 'subordinate') {
                const prob = this.game.diplomacyManager.getDiplomacyProb(firstId, targetId, 'subordinate');
                this.showAdviceAndExecute('subordinate', () => this.game.diplomacyManager.executeDiplomacy(firstId, targetId, 'subordinate'), { trueProb: prob / 100 });
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
                this.showAdviceAndExecute('dominate', () => this.game.diplomacyManager.executeDiplomacy(firstId, targetId, 'dominate'), { trueProb: prob / 100 });
            } else if (extraData.subAction === 'truce') {
                const prob = this.game.diplomacyManager.getDiplomacyProb(firstId, targetId, 'truce');
                this.showAdviceAndExecute('truce', () => this.game.diplomacyManager.executeDiplomacy(firstId, targetId, 'truce'), { trueProb: prob / 100 });
            } else if (extraData.subAction === 'court_truce') {
                // ★追加：朝廷和睦は条件を満たしていれば確実に成功します！
                this.showAdviceAndExecute('court_truce', () => this.game.courtRankSystem.executeCourtTruce(firstId, targetId), { trueProb: 1.0 });
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
            
            const totalProb = this.game.kunishuSystem.calcIncorporateProbability(
                doer,
                kunishu,
                this.game.playerClanId
            ) / 100;

            this.showAdviceAndExecute('kunishu_incorporate', () => this.game.kunishuSystem.executeKunishuIncorporate(firstId, targetId, extraData.kunishuId), { trueProb: totalProb });
            return;
        }
        if (actionType === 'kunishu_subjugate_deploy') {
             const selectedBushos = selectedIds.map(id => this.game.getBusho(id));
             const leader = selectedBushos.find(b => b.isDaimyo || b.isCastellan);
             if (leader || selectedIds.length === 1) {
                 // 総大将候補が一人だけなら選択画面を出す意味がないため、その武将を自動確定します。
                 const leaderId = leader ? leader.id : selectedIds[0];
                 const others = selectedIds.filter(id => id !== leaderId);
                 const sortedIds = [leaderId, ...others];
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

        if (actionType === 'arrange_marriage_busho') {
            const princesses = this.game.princesses.filter(p => p.currentClanId === this.game.playerClanId && p.status === 'unmarried');
            
            if (princesses.length === 0) {
                this.game.ui.showDialog("嫁がせる未婚の姫がいません。", false);
                return;
            }

            this.game.ui.info.arrangeMarriageBushoId = firstId;
            this.game.ui.showPrincessSelector(null, null);
            return;
        }

        if (actionType === 'war_deploy') {
             const selectedBushos = selectedIds.map(id => this.game.getBusho(id));
             const leader = selectedBushos.find(b => b.isDaimyo || b.isCastellan);
             if (leader || selectedIds.length === 1) {
                 // 総大将候補が一人だけなら選択画面を出さず、そのまま総大将として進めます。
                 const leaderId = leader ? leader.id : selectedIds[0];
                 const others = selectedIds.filter(id => id !== leaderId);
                 const sortedIds = [leaderId, ...others];
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
            const trueProb = PersonnelRules.getInvestigateProb(bushos);
            this.showAdviceAndExecute('investigate', () => this.executeInvestigate(selectedIds, targetId), { trueProb: trueProb });
            return;
        }
        
        if (actionType === 'incite_doer') {
             // ★専門部署である StrategySystem の計算魔法を呼びます！
             const trueProb = this.game.strategySystem.getInciteProb(firstId, targetId);
             const expectedDamage = this.game.strategySystem.getInciteExpectedDamage(firstId, targetId);
             this.showAdviceAndExecute('incite', () => this.game.strategySystem.executeIncite(firstId, targetId), { trueProb: trueProb, expectedDamage: expectedDamage });
             return;
        }

        if (actionType === 'sabotage_doer') {
             const trueProb = this.game.strategySystem.getSabotageProb(firstId, targetId);
             const expectedDamage = this.game.strategySystem.getSabotageExpectedDamage(firstId, targetId);
             this.showAdviceAndExecute('sabotage', () => this.game.strategySystem.executeSabotage(firstId, targetId), { trueProb: trueProb, expectedDamage: expectedDamage });
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

        if (actionType === 'adopt_son_target') {
            const bushoA = this.game.getBusho(firstId);
            this.game.ui.showDialog(`${bushoA.name} を養子にしますか？`, true, 
                () => {
                    this.executeWithEvent('adopt_son', () => this.executeAdoptSon(firstId));
                },
                null,
                { okText: '養子にする', cancelText: 'やめる' }
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
                const prob = this.game.diplomacyManager.getDiplomacyProb(data[0], targetId, 'goodwill', val);
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
            
            const srcProv = this.game.getProvince(castle.provinceId);
            const tgtProv = this.game.getProvince(targetCastle.provinceId);
            const isHeavySnow = (srcProv && srcProv.statusEffects && srcProv.statusEffects.includes('heavySnow')) || 
                                (tgtProv && tgtProv.statusEffects && tgtProv.statusEffects.includes('heavySnow'));

            const proceedWar = () => {
                this.game.warPreparationController.checkReinforcementAndStartWar(castle, targetId, data.map(id => this.game.getBusho(id)), sVal, rVal, hVal, gVal, extraData);
            };

            if (isHeavySnow) {
                this.game.ui.showDialog("大雪の影響により、被害が出る場合があります。\nそれでも出陣しますか？", true, () => {
                    this.executeWithEvent('war', () => proceedWar());
                }, null, { closeBeforeOk: true });
            } else {
                this.executeWithEvent('war', () => proceedWar());
            }
        }
    }

    async executeWithEvent(type, executeFunc, extraContext = {}) {
        // 外交は軍師助言・事前イベント・人物画像decodeなど複数の await をまたいで会話へ遷移します。
        // その間だけ旧ダイアログを保持し、固定msのタイムアウトによる黒画面の露出を防ぎます。
        const diplomacyHandoffTypes = new Set([
            'goodwill', 'alliance', 'marriage', 'break_alliance',
            'subordinate', 'vassalage', 'dominate', 'truce', 'court_truce'
        ]);
        const ui = this.game?.ui;
        const holdDialogHandoff = diplomacyHandoffTypes.has(type)
            && ui
            && typeof ui.beginDialogHandoffHold === 'function'
            && typeof ui.endDialogHandoffHold === 'function';

        if (holdDialogHandoff) ui.beginDialogHandoffHold();
        try {
            if (this.game.eventManager) {
                await this.game.eventManager.processEvents('before_command', { commandType: type, ...extraContext });
            }
            await executeFunc();
            if (this.game.eventManager) {
                await this.game.eventManager.processEvents('after_command', { commandType: type, ...extraContext });
            }
        } finally {
            // 実行途中で対象消失などにより会話/結果が出なかった場合も、使者選択画面を残しっぱなしにしません。
            if (holdDialogHandoff && typeof ui.completeVisualHandoff === 'function') ui.completeVisualHandoff();
            if (holdDialogHandoff) ui.endDialogHandoffHold();
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
        const bonusRate = DomesticRules.calcFactionBonusRate(execBushos);
        
        // 差し替え後
        if (type === 'appoint') {
            const bushos = this.game.getBusho(bushoIds[0]);
            if (type === 'appoint') { 
                const old = this.game.getBusho(castle.castellanId); if(old) old.isCastellan = false; 
                castle.castellanId = bushos.id; bushos.isCastellan = true; 
                // ★追加：もし城主になった人が軍師だったら、軍師のお仕事を外します！
                if (bushos.isGunshi) {
                    this.game.affiliationSystem.clearGunshiRole(bushos);
                }
                this.finishCommand(`${bushos.name}を城主に任命しました`, false, `【城主任命】${this.game.getClan(this.game.playerClanId)?.name || '当家'}は${bushos.fullName || bushos.name}を${castle.name}城主に任命しました。`); 
            }
            return;
        }

        if (type === 'banish') { 
            const busho = this.game.getBusho(bushoIds[0]);
            this.game.ui.showDialog(`本当に ${busho.name} を追放しますか？`, true, () => {
                
                // ★追加：追放される武将がいた場合、自勢力の他の武将全員にショックを与えます！
                // 同じ大名家で、大名と追放される本人を除いた全員を集めます
                const otherMembers = this.game.getClanBushos(busho.clan).filter(b => 
                    b.id !== busho.id &&
                    !b.isDaimyo &&
                    window.BushoStatusRules.isActive(b)
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

                this.finishCommand(`${busho.name}を追放しました`, false, `【追放】${this.game.getClan(this.game.playerClanId)?.name || '当家'}は${busho.fullName || busho.name}を追放しました。`);
            });
            return; 
        }

        bushoIds.forEach(bid => {
            const busho = this.game.getBusho(bid); if (!busho) return;
            
            if (type === 'farm') { 
                if (castle.gold >= spec.costGold) { 
                    const val = DomesticRules.calcDevelopment(busho, bonusRate, true); castle.gold -= spec.costGold; 
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
                    const val = DomesticRules.calcDevelopment(busho, bonusRate, true); castle.gold -= spec.costGold; 
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
                    const val = DomesticRules.calcRepair(busho, bonusRate, true); castle.gold -= spec.costGold; 
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
                    const val = DomesticRules.calcTraining(busho, castle.soldiers, bonusRate, true); 
                    const maxTraining = window.WarParams.Military.MaxTrainingNormal;
                    const oldVal = castle.training;
                    castle.training = oldVal >= maxTraining ? oldVal : Math.min(maxTraining, oldVal + val); 
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
                    const val = DomesticRules.calcSoldierCharity(busho, castle.soldiers, bonusRate, true); 
                    const maxMorale = window.WarParams.Military.MaxMoraleNormal;
                    const oldVal = castle.morale;
                    castle.morale = oldVal >= maxMorale ? oldVal : Math.min(maxMorale, oldVal + val); 
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
        
        let resultMsg = null;
        let logMsg = null;
        if (count > 0 && actionName !== "移動") { 
            let detail = "";
            if (actionName === "石高開発") detail = `(現在: ${castle.kokudaka}/${castle.maxKokudaka})`;
            if (actionName === "鉱山開発") detail = `(現在: ${castle.commerce}/${castle.maxCommerce})`;
            if (actionName === "城壁修復") detail = `(現在: ${castle.defense}/${castle.maxDefense})`;
            if (actionName === "訓練") {
                const maxTraining = window.WarParams.Military.MaxTrainingGauge;
                detail = `(現在: ${castle.training}/${maxTraining})`;
            }
            if (actionName === "兵施し") {
                const maxMorale = window.WarParams.Military.MaxMoraleGauge;
                detail = `(現在: ${castle.morale}/${maxMorale})`;
            }
            
            resultMsg = `${count}名で${actionName}を行いました\n効果: +${totalVal} ${detail}`;
            logMsg = `【${actionName}】${castle.name}で${actionName}を実行しました。`;
        }
        else if (actionName === "移動") { 
            const targetName = this.game.getCastle(targetId).name; 
            resultMsg = `${count}名が${targetName}へ移動しました`; 
            logMsg = `【配置変更】${castle.name}から${targetName}へ武将を移動しました。`;
        }
        
        if (resultMsg || logMsg) {
            this.finishCommand(resultMsg, false, logMsg);
        } else {
            this.finishCommand(null);
        }
    }

    executeInvestigate(bushoIds, targetId) {
        const bushos = bushoIds.map(id => this.game.getBusho(id));
        const target = this.game.getCastle(targetId);
        const result = PersonnelRules.calcInvestigate(bushos, target);
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
        this.finishCommand(msg, true);
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
        const success = PersonnelRules.calcEmploymentSuccess(doer, target, myPower, targetPower, this.game); 
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
        doer.isActionDone = true;
        const clanName = this.game.getClan(this.game.playerClanId)?.name || '当家';
        const employLog = success
            ? `【登用】${clanName}は${target.fullName || target.name}の登用に成功しました。`
            : `【登用】${clanName}の${target.fullName || target.name}への登用は成立しませんでした。`;
        this.finishCommand(msg, false, employLog);
    }
    
    executeReward(bushoIds) {
        const castle = this.game.getCurrentTurnCastle();
        const daimyo = this.game.getClanDaimyo(this.game.playerClanId);
        const spec = COMMAND_SPECS['reward'];
        
        // ★追加：実行前に1人分の褒美すら払えない場合は、共通魔法で弾きます
        if (!this.checkResource(castle, spec.costGold, 0)) return;

        let count = 0;
        let totalEffect = 0; // （※ログ表示用に残しておきますが、厳密な効果量は一元化魔法の中で計算されるため、おおよその目安になります）

        bushoIds.forEach(bid => {
            const target = this.game.getBusho(bid);
            if (!target) return;

            if (castle.gold < spec.costGold) return;

            castle.gold -= spec.costGold;
            
            // ★修正：新しく作った一元化の魔法を呼び出して、忠誠度アップと承認欲求ダウンをまとめて行います！
            PersonnelRules.applyRewardEffect(target, daimyo, this.game);

            count++;
            // ★ログ用のおおよその効果量として記録しておきます
            totalEffect += PersonnelRules.calcRewardEffect(daimyo, target);
        });
        
        let msg = null;
        let logMsg = null;
        if (count > 0) {
            msg = `${count}名に褒美（金${count * spec.costGold}）を与えました`;
            logMsg = `${count}名の家臣に褒美を与えました。`;
        }

        this.finishCommand(msg, false, logMsg);
    }
    
    executeRewardAll() {
        const castle = this.game.getCurrentTurnCastle();
        const cost = window.MainParams.CommandCost.RewardAll;
        // ★変更：共通魔法でチェックします
        if (!this.checkResource(castle, cost, 0)) return;

        const daimyo = this.game.getClanDaimyo(this.game.playerClanId);
        
        // 褒美の対象となる武将を集める
        const targets = this.game.getClanBushos(this.game.playerClanId).filter(b => 
            window.BushoStatusRules.isActive(b) && 
            !b.isDaimyo
        );

        if (targets.length === 0) {
            this.game.ui.showDialog("褒美を与える武将がいません。", false);
            return;
        }

        // 金を消費
        castle.gold -= cost;
        
        let count = 0;
        let totalEffect = 0; // ログ用

        // ★修正：全員に「2回分」の効果を一元化の魔法を使って適用します！
        targets.forEach(target => {
            // 1回目の効果
            PersonnelRules.applyRewardEffect(target, daimyo, this.game);
            // 2回目の効果
            PersonnelRules.applyRewardEffect(target, daimyo, this.game);

            count++;
            // ★ログ用のおおよその効果量（2回分）を記録しておきます
            totalEffect += PersonnelRules.calcRewardEffect(daimyo, target) * 2;
        });
        
        this.finishCommand(`${count}名の家臣に褒美を与えました`, false, `${count}名の家臣に一括して褒美を与えました。`);
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
        
        this.finishCommand(`${this.game.getBusho(bushoIds[0]).name}が${t.name}へ物資を輸送しました`);
    }
    
    executeAppointGunshi(bushoId) {
        const busho = this.game.getBusho(bushoId);
        if (!busho || !this.game.affiliationSystem.appointClanGunshi(this.game.playerClanId, busho)) return;
        // 軍師に任命された時に、この軍師専用の「秘密の番号（タネ）」を作ります。
        busho.gunshiSeed = Math.floor(Math.random() * 10000);
        this.finishCommand(`${busho.name}を軍師に任命しました`);
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
            const legionData = {
                id: maxId + 1,
                clanId: this.game.playerClanId,
                legionNo: legionNo,
                commanderId: busho.id,
                establishedTurnId: this.game.getCurrentTurnId()
            };
            legion = new Legion(legionData);
            this.game.legions.push(legion);
        } else {
            legion.commanderId = busho.id;
            // 解散済み席次の再利用も「新設」と同じ扱いにして、24ヶ月の整理猶予を正しくリセットする。
            legion.establishedTurnId = this.game.getCurrentTurnId();
        }

        const oldCastellan = this.game.getBusho(castle.castellanId);
        if (oldCastellan) {
            oldCastellan.isCastellan = false;
        }
        castle.castellanId = busho.id;
        busho.isCastellan = true;
        busho.isCommander = true;
        if (busho.isGunshi) this.game.affiliationSystem.clearGunshiRole(busho);

        castle.legionId = legionNo;

        const numberNames = ["", "第一席", "第二席", "第三席", "第四席", "第五席", "第六席", "第七席", "第八席"];
        const legionName = numberNames[legionNo] || `第${legionNo}席`;
        
        const displayMessage = `${busho.name} を「${legionName}」の国主に任命し、\n${castle.name} を本拠としました`;
        
        this.finishCommand(displayMessage, true, `【国主任命】${this.game.getClan(this.game.playerClanId)?.name || '当家'}は${busho.fullName || busho.name}を国主に任命し、${castle.name}を本拠としました。`);
    }
    
    executeTrade(type, amount) {
        const castle = this.game.getCurrentTurnCastle(); 
        const daimyo = this.game.getClanDaimyo(castle.ownerClan);
        const castellan = this.game.getBusho(castle.castellanId);

        // ★一元化された共通魔法を呼び出して、必要な費用（または利益）を一発で計算します！
        const tradeData = EconomyRules.calcTradeCostAndRate(type, amount, castle, daimyo, castellan, this.game.provinces, this.game);
        const costOrGain = tradeData.cost;
        
        let msg = null;
        if(type === 'buy_rice') {
            // ★変更：共通魔法でチェックします
            if(!this.checkResource(castle, costOrGain, 0)) return;
            // ★追加: 買うと上限を超えるならストップ
            if(castle.rice + amount > 99999) { this.game.ui.showDialog("これ以上兵糧は買えません", false); return; }
            if(costOrGain > (castle.tradeLimit || 0)) { this.game.ui.showDialog("取引上限を超えています", false); return; }
            castle.gold -= costOrGain; castle.rice += amount; 
            castle.tradeLimit -= costOrGain;
            msg = `兵糧${amount}を購入しました\n(金-${costOrGain})`; 
        } else if (type === 'sell_rice') { 
            // ★変更：売却なのでお金が足りるかのチェックはなし
            if(!this.checkResource(castle, 0, amount)) return;
            // ★追加: 売ると金が上限を超えるならストップ
            if(castle.gold + costOrGain > 99999) { this.game.ui.showDialog("これ以上兵糧は売れません", false); return; }
            if(costOrGain > (castle.tradeLimit || 0)) { this.game.ui.showDialog("取引上限を超えています", false); return; }
            castle.rice -= amount; castle.gold += costOrGain; 
            castle.tradeLimit -= costOrGain;
            msg = `兵糧${amount}を売却しました\n(金+${costOrGain})`; 
        } else if (type === 'buy_ammo') {
            if(!this.checkResource(castle, costOrGain, 0)) return;
            if((castle.ammo || 0) + amount > 99999) { this.game.ui.showDialog("これ以上矢弾は買えません", false); return; }
            castle.gold -= costOrGain; castle.ammo = (castle.ammo || 0) + amount; 
            msg = `矢弾${amount}を購入しました\n(金-${costOrGain})`; 
        } else if (type === 'buy_horses') {
            if(!this.checkResource(castle, costOrGain, 0)) return;
            if((castle.horses || 0) + amount > 99999) { this.game.ui.showDialog("これ以上軍馬は買えません", false); return; }
            castle.gold -= costOrGain; castle.horses = (castle.horses || 0) + amount; 
            msg = `軍馬${amount}を購入しました\n(金-${costOrGain})`; 
        } else if (type === 'buy_guns') {
            if(!this.checkResource(castle, costOrGain, 0)) return;
            if((castle.guns || 0) + amount > 99999) { this.game.ui.showDialog("これ以上鉄砲は買えません", false); return; }
            castle.gold -= costOrGain; castle.guns = (castle.guns || 0) + amount; 
            msg = `鉄砲${amount}を購入しました\n(金-${costOrGain})`; 
        }
        
        this.finishCommand(msg);
    }

    executeDraft(bushoIds, soldiers) { 
        const castle = this.game.getCurrentTurnCastle(); 
        const busho = this.game.getBusho(bushoIds[0]); 
        
        // 選ばれた兵士数を集めるために必要な「お金」を計算します
        // ★変更：お城の人口（castle.population）も渡して、正しい金額を計算させます
        const costGold = DomesticRules.calcDraftCost(soldiers, busho, castle.peoplesLoyalty, castle.population);
        
        // ★変更：共通魔法でチェックします
        if(!this.checkResource(castle, costGold, 0)) return;
        
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
        // ★変更：経験値計算の窓口にも、忘れずにお城の人口を渡します
        DomesticRules.calcDraftCost(soldiers, busho, castle.peoplesLoyalty, castle.population, true);

        // ★ 徴兵による民忠と人口の減少処理を、GameSystemの専門の魔法にお任せします！
        const loyaltyPenalty = DomesticRules.applyDraftPenalty(castle, soldiers);

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
        this.finishCommand(`${busho.name}が徴兵を行いました\n兵士+${soldiers}\n(人口-${soldiers} / 民忠-${loyaltyPenalty})`, false, `【徴兵】${castle.name}で徴兵を行いました。`);
    }
    
    executeCharity(bushoIds) { 
        const castle = this.game.getCurrentTurnCastle(); 
        const spec = COMMAND_SPECS['charity']; 
        
        const totalCostRice = spec.costRice * bushoIds.length;
        
        // ★変更：共通魔法でチェックします
        if (!this.checkResource(castle, 0, totalCostRice)) return;
        
        castle.rice -= totalCostRice;
       
        let totalVal = 0;
        let count = 0;

        // ★追加：参加武将をリストアップして派閥ボーナスの倍率を出します
        const execBushos = bushoIds.map(id => this.game.getBusho(id)).filter(b => b);
        const bonusRate = DomesticRules.calcFactionBonusRate(execBushos);

        bushoIds.forEach(bid => {
            const busho = this.game.getBusho(bid);
            if (!busho) return;

            const val = DomesticRules.calcCharity(busho, bonusRate, true); 

            totalVal += val;
            count++;

            busho.achievementTotal += Math.floor(val * 0.5);
            this.game.factionSystem.updateRecognition(busho, 15);
            busho.isActionDone = true; 
        });

        const maxLoyalty = window.MainParams.Economy.MaxLoyalty;
        const oldLoyalty = castle.peoplesLoyalty;
        castle.peoplesLoyalty = Math.min(maxLoyalty, castle.peoplesLoyalty + totalVal); 
        const actualIncrease = castle.peoplesLoyalty - oldLoyalty;
        
        this.finishCommand(`${count}名で施しを行いました\n民忠+${actualIncrease}`, false, `【民施し】${castle.name}で民施しを行いました。`);
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
            case 'kunishu_subjugate': return "攻撃目標となる諸勢力がいる拠点を選択してください";
            case 'move': return "移動先を選択してください";
            case 'transport': return "輸送先を選択してください";
            case 'investigate': return "調査対象の拠点を選択してください";
            case 'incite': return "民心撹乱を行う拠点を選択してください";
            case 'sabotage': return "破壊工作を行う拠点を選択してください";
            case 'rumor': return "離間計対象の居城を選択してください";
            case 'headhunt': case 'headhunt_select_castle': return "引抜対象の居城を選択してください";
            case 'assassinate': return "暗殺対象の居城を選択してください";
            case 'kuko': return "駆虎呑狼の標的となる一つ目の勢力を選択してください";
            case 'kuko_target_b': return "駆虎呑狼の標的となる二つ目の勢力を選択してください";
            case 'goodwill': return "親善を行う相手を選択してください";
            case 'alliance': return "同盟を行う相手を選択してください";
            case 'dominate': return "降伏勧告を行う相手を選択してください";
            case 'subordinate': return "従属願を行う相手を選択してください";
            case 'vassalage': return "臣従願を行う相手を選択してください";
            case 'kunishu_goodwill': return "親善を行う諸勢力がいる拠点を選択してください";
            case 'kunishu_incorporate': return "取込を行う諸勢力がいる拠点を選択してください";
            case 'break_alliance': return "断交する相手を選択してください";
            case 'court_truce': return "朝廷を介して和睦を行う相手を選択してください";
            case 'marriage': return "婚姻を結ぶ相手を選択してください";
            case 'truce': return "和睦交渉を行う相手を選択してください";
            case 'atk_self_reinforcement': return "援軍を出陣させる拠点を選択してください";
            case 'atk_ally_reinforcement': return "援軍を要請する拠点を選択してください";
            case 'def_self_reinforcement': return "援軍を出陣させる拠点を選択してください";
            case 'def_ally_reinforcement': return "援軍を要請する拠点を選択してください";
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
                    this.game.ui.showDialog("この拠点には援軍を出せる勢力がいません。", false, backToMap);
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
                this.game.warPreparationController.promptPlayerAtkSelfReinforcement(targetCastle, temp.atkCastle, temp.targetCastle, temp.onComplete, backToMap);
            } else if (mode === 'def_self_reinforcement') {
                // ★修正：warManagerではなく、command_system内の魔法を直接呼び出します！
                this.game.warPreparationController.promptPlayerDefSelfReinforcement(targetCastle, temp.defCastle, temp.onComplete, backToMap);
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
                const myClan = this.game.getClan(myClanId);
                const myPrestige = myClan ? myClan.daimyoPrestige : 0;
                
                kunishus = kunishus.filter(k => {
                    if (k.ideology === '宗教' || k.ideology === '商人') return false;
                    if (k.getRelation(myClanId) < 95) return false;
                    if (k.soldiers > myPrestige / 2) return false;
                    return true;
                });
            } else if (mode === 'kunishu_subjugate') {
                // 鎮圧の場合も商人は対象外にします
                kunishus = kunishus.filter(k => k.ideology !== '商人');
            }

            if (kunishus.length === 0) {
                this.game.ui.showDialog("この拠点には行動可能な諸勢力がいません。", false);
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
        
        if (mode === 'kuko_target_b') {
            this.game.tempKukoData.clanBId = targetCastle.ownerClan;
            const currentCastleId = this.game.getCurrentTurnCastle().id;
            this.game.ui.openBushoSelector('kuko_doer', currentCastleId, null, onBackToMap);
            return;
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
            this.game.ui.openBushoSelector('rumor_target_busho', targetCastle.id, { allowDone: true }, onBackToMap);
        } else if (mode === 'headhunt' || mode === 'headhunt_select_castle') {
            this.game.ui.openBushoSelector('headhunt_target', targetCastle.id, { allowDone: true }, onBackToMap);
        } else if (mode === 'assassinate') {
            this.game.ui.openBushoSelector('assassinate_target', targetCastle.id, { allowDone: true }, onBackToMap);
        } else if (mode === 'kuko') {
            this.game.tempKukoData = { clanAId: targetCastle.ownerClan };
            this.enterMapSelection('kuko_target_b');
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
        } else if (mode === 'truce') {
            this.game.ui.openBushoSelector('diplomacy_doer', targetCastle.id, { subAction: 'truce' }, onBackToMap);
        } else if (mode === 'court_truce') {
            this.game.ui.openBushoSelector('diplomacy_doer', targetCastle.id, { subAction: 'court_truce' }, onBackToMap);
        } else if (mode === 'marriage') {
            this.game.ui.openBushoSelector('diplomacy_doer', targetCastle.id, { subAction: 'marriage' }, onBackToMap);
        }
    }
    
    executeSuccession(newDaimyoId) {
        // ★家督相続の難しい処理は、専門の life_system.js にお任せして魔法を呼び出します！
        this.game.lifeSystem.executeSuccessionCommand(newDaimyoId);
    }

    executeAdoptSon(targetId) {
        const targetBusho = this.game.getBusho(targetId);
        const daimyo = this.game.getClanDaimyo(this.game.playerClanId);
        if (!targetBusho || !daimyo) return;

        // ① 子供側に養父（大名）のIDをセットします
        targetBusho.adoptiveFatherId = daimyo.id;
        
        // baseFamilyIds / familyIds は派生値なので直接編集せず、正本の養父IDから全体を再構築します。
        FamilyLinker.rebuildAllFamilyIds(this.game.bushos, this.game.princesses);

        this.finishCommand(`${targetBusho.name} を養子として迎え入れました。以降、${targetBusho.name} は当家の一門武将となります。`);
    }

    // ★追加：所領分配の実行
    executeAllotFief(legionNo, selectedCastleIds, candidateCastles) {
        let count = 0;
        
        const legion = this.game.legions ? this.game.legions.find(l => Number(l.clanId) === Number(this.game.playerClanId) && Number(l.legionNo) === Number(legionNo)) : null;
        
        // どんな形でIDが送られてきても、確実に「数字」として取り出せるようにする安全装置です
        const numSelectedIds = new Set(selectedCastleIds.map(item => {
            if (typeof item === 'object' && item !== null) return Number(item.id);
            return Number(item);
        }));

        // 候補リストが空っぽで送られてきた場合の保険として、自分の全てのお城を対象にします。
        // ownerClan一致だけが旧条件なので、同値な勢力別所有城索引を使います。
        const targetCastles = candidateCastles || this.game.getClanCastles(this.game.playerClanId);
        
        targetCastles.forEach(c => {
            // ★ここが一番重要です！画面用の「コピー」ではなく、ゲーム本体の「本物のお城データ」を直接引っ張り出して書き換えます
            const realCastle = this.game.getCastle(c.id || c);
            if (!realCastle) return;

            const isCommanderCastle = legion && Number(realCastle.castellanId) === Number(legion.commanderId);
            const isSelected = numSelectedIds.has(Number(realCastle.id)) || isCommanderCastle;

            if (isSelected) {
                if (Number(realCastle.legionId) !== Number(legionNo)) {
                    realCastle.legionId = legionNo;
                    count++;
                }
            } else {
                if (Number(realCastle.legionId) === Number(legionNo)) {
                    realCastle.legionId = 0;
                    count++;
                }
            }
        });

        const numberNames = ["直轄", "第一席", "第二席", "第三席", "第四席", "第五席", "第六席", "第七席", "第八席"];
        const legionName = numberNames[legionNo] || `第${legionNo}席`;
        
        this.finishCommand(`${legionName}の所領分配を完了しました。\n${count}件の拠点の所属が変更されました。`, true, `【所領分配】${this.game.getClan(this.game.playerClanId)?.name || '当家'}は${legionName}の所領を変更しました。`);
    }
    
    executeArrangeMarriage(busho, princess) {
        princess.husbandId = busho.id;
        princess.status = 'married';
        
        if (!busho.wifeIds.includes(princess.id)) {
            busho.wifeIds.push(princess.id);
        }

        // ★ゲーム全体の一門状態を最新に更新します！
        FamilyLinker.rebuildAllFamilyIds(this.game.bushos, this.game.princesses);

        busho.loyalty = 100;

        this.finishCommand(`${busho.name} と ${princess.name} の祝言が執り行われました。新たな縁によって、当家の結束はより一層強固なものとなりました。`, false, `【婚姻】${this.game.getClan(this.game.playerClanId)?.name || '当家'}で${busho.fullName || busho.name}と${princess.name}の祝言が執り行われました。`);
    }

    // ★追加：国主解任の実行
    executeDismissLegionLeader(legionNo) {
        if (!this.game.legions) return;
        const legion = this.game.legions.find(l => Number(l.clanId) === Number(this.game.playerClanId) && Number(l.legionNo) === legionNo);
        if (!legion || !legion.commanderId) return;

        const commander = this.game.getBusho(legion.commanderId);
        // 軍団モデル・所属城・AI計画の破棄は CastleManager の正規窓口へ任せます。
        const count = this.game.castleManager.disbandLegion(legion.id);
        
        const numberNames = ["", "第一席", "第二席", "第三席", "第四席", "第五席", "第六席", "第七席", "第八席"];
        const legionName = numberNames[legionNo] || `第${legionNo}席`;
        
        const commanderName = commander ? commander.name : "不明";

        this.finishCommand(`${commanderName} を ${legionName} の国主から解任しました。所属していた ${count} 件の拠点はすべて直轄領に変更されました。`, true, `【国主解任】${this.game.getClan(this.game.playerClanId)?.name || '当家'}は${commanderName}を国主から解任し、所領を直轄へ戻しました。`);
    }
}