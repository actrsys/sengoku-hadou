/**
 * turn_manager.js
 * 月初・各拠点ターン・月末の進行順序を専門に管理します。
 * GameManager は外部互換の窓口だけを持ち、実際の月進行はここへ委譲します。
 */
class TurnManager {
    constructor(game) {
        this.game = game;
    }

    async startMonth() { 
        const game = this.game;
        game.hasAutoSavedThisMonth = false; // ★月が替わったので、オートセーブ済みの印を消します
        game.writeSystemDiagnostic('month_start:start');
    
        // ★追加：月初の処理が始まったら、ユーザーが勝手に操作できないように膜（ガード）を張ります！
        game.isProcessingAI = true;
        if (game.ui && game.ui.aiGuard) {
            game.ui.aiGuard.classList.remove('hidden');
            game.ui.hideAIGuardText(); // ★中身を壊さずに、透明にして文字だけ隠します！
        }
        
        // 月初の派閥所属恩恵は派閥システムへ委譲します。
        game.factionSystem.applyStartMonthSameFactionEffects();
        
        // ★月が替わったら軍師の報告印を消します
        if (game.gunshiSystem) game.gunshiSystem.onStartMonth();
        
        // 国別の月次相場更新は経済ルールへ委譲します。
        EconomyRules.updateMonthlyProvinceMarketRates(game);
        // 年月や相場が新しくなったので、イベントが始まる前に画面の表示を最新にします！
        if (game.ui) {
            const displayCastle = game.ui.currentCastle || game.getCurrentTurnCastle();
            if (displayCastle) {
                game.ui.updateInfoPanel(displayCastle);
            }
        }
        
        await game.ui.showCutin(`${game.year}年 ${game.month}月`);
        
        game.ui.log(`=== ${game.year}年 ${game.month}月 ===`, { history: false });
        
        // 月初イベント【前】をチェックして実行します
        if (game.eventManager) {
            await game.eventManager.processEvents('startMonth_before');
            game.writeSystemDiagnostic('month_start:event_before_done');
        }
        
        // 元服の処理が終わるまでしっかり待ちます！
        await game.lifeSystem.processStartMonth();
        game.writeSystemDiagnostic('month_start:life_done');
        
        // 武将の下野（出奔）が終わるまで待ちます！
        await game.factionSystem.processStartMonth(); 
        game.writeSystemDiagnostic('month_start:faction_done');
    
        // ★安定化：全国派閥再編などで作った一時配列を解放できるよう、
        // 次の全国処理へ入る前にブラウザへ一度制御を返します。
        await new Promise(resolve => setTimeout(resolve, 0));        
        game.affiliationSystem.processRoninMovements();
        
        game.updateAllCastlesLords();
        
        // 面談印・宿敵タイマー・諸勢力武将経験値など、武将個人の月次更新。
        game.bushos.forEach(busho => PersonnelRules.processMonthlyBushoMaintenance(busho, game));
        
        if (game.month % 3 === 0) game.factionSystem.optimizeCastellans();
        
        // 月初の拠点更新。計算式は EconomyRules / DomesticRules / SkillManager が担当します。
        const daimyoByClanIdForGrowth = new Map();
        const ownedCastleCountByClanId = new Map();
        game.clans.forEach(clan => {
            if (clan.id === 0 || clan.isDestroyed) return;
            const daimyo = game.getBusho(clan.leaderId);
            if (daimyo) daimyoByClanIdForGrowth.set(clan.id, daimyo);
            ownedCastleCountByClanId.set(clan.id, game.getClanCastles(clan.id).length);
        });

        game.castles.forEach(castle => {
            if (castle.ownerClan === 0) return;
            castle.isDone = false;

            if (typeof SkillManager !== 'undefined' && typeof SkillManager.calcMonthlyDefenseBonus === 'function') {
                const defBonus = SkillManager.calcMonthlyDefenseBonus(castle, game);
                if (defBonus > 0) castle.defense = Math.min(castle.maxDefense, castle.defense + defBonus);
            }

            const income = EconomyRules.calcMonthlyGoldIncome(castle, game);
            castle.gold = Math.min(99999, castle.gold + income);

            const neighborMultiplier = DomesticRules.calcNeighborGrowthMultiplier(castle, game);
            const populationGrowth = DomesticRules.calcMonthlyPopulationGrowth(castle, neighborMultiplier);
            castle.population = Math.min(999999, Math.max(0, castle.population + populationGrowth));

            const daimyo = daimyoByClanIdForGrowth.get(castle.ownerClan);
            if (daimyo) {
                const ownedCount = ownedCastleCountByClanId.get(castle.ownerClan) || 0;
                const soldierGrowth = DomesticRules.calcMonthlySoldierGrowth(castle, daimyo, ownedCount, neighborMultiplier);
                castle.soldiers = Math.min(99999, castle.soldiers + soldierGrowth);
            }

            castle.tradeLimit = EconomyRules.calcMonthlyTradeLimit(castle);
        });

        // ★ここを書き換え！：空っぽの城（中立）も仲間はずれにせず、一緒に混ぜて順番リストに入れます！
        const allCastles = [...game.castles];
        allCastles.sort(() => Math.random() - 0.5); 
        game.turnQueue = [...allCastles];
    
        // ★毎月の初めに、最新の威信を計算し直します！
        game.updateAllClanPrestige();
    
        // ==========================================
        // ★追加：ここで官位の授与チェックを行います！
        const promotionMsgs = game.courtRankSystem.processMonthlyPromotions();
        if (promotionMsgs && promotionMsgs.length > 0) {
            // 複数の大名が受かった場合は、一人ずつ順番にお知らせを出します
            for (const msg of promotionMsgs) {
                await game.ui.showDialogAsync(msg, false, 0);
            }
            
            // 官位をもらったことで威信が増えるので、念のためもう一度最新の威信を計算し直しておきます！
            game.updateAllClanPrestige();
        }
        // ==========================================
    
        // ★ここを書き足し！：月初イベント【後】（収入などの処理が終わった後）を実行します
        // ここで9月の兵糧収穫イベントなどが実行されます！
        if (game.eventManager) {
            await game.eventManager.processEvents('startMonth_after');
            game.writeSystemDiagnostic('month_start:event_after_done');
        }
    
        // 収入・イベント後の維持費と、役職ごとの月次成長を専門部署へ委譲します。
        const daimyoByClanIdForUpkeep = new Map();
        game.clans.forEach(clan => {
            if (clan.id === 0 || clan.isDestroyed) return;
            const daimyo = game.getBusho(clan.leaderId);
            if (daimyo) daimyoByClanIdForUpkeep.set(clan.id, daimyo);
        });

        game.castles.forEach(castle => {
            if (castle.ownerClan === 0) return;
            const bushos = game.getCastleBushos(castle.id);
            const daimyo = daimyoByClanIdForUpkeep.get(castle.ownerClan);
            const { isGoldShort } = EconomyRules.applyMonthlyCastleUpkeep(castle, bushos, daimyo);
            bushos.forEach(busho => PersonnelRules.applyMonthlyRoleProgress(busho, isGoldShort));
        });

        // 四半期の全国AI人事はAIStaffingへ委譲し、TurnManagerは実行時期だけを指示します。
        if (game.aiStaffing) {
            await game.aiStaffing.processQuarterlyStaffing(game.month, game.playerClanId);
        }
        game.writeSystemDiagnostic('month_start:staffing_done');
        if (game.aiOperationManager) {
            await game.aiOperationManager.processMonthlyOperations();
        }
        game.writeSystemDiagnostic('month_start:operations_done');
    
        game.currentIndex = 0; 
        game.writeSystemDiagnostic('month_start:before_turn_queue');
    
        // Round26：月末～月初の一連処理中に観戦終了が予約されていた場合は、
        // ここを「月処理が完全に一段落した安全地点」として帰還確認へ移ります。
        if (await game.tryProcessQueuedWatchReturn('month_start_complete')) return;
    
        game.processTurn();
    }

    /** 委任城・他勢力で共通のAIターン開始処理。 */
    _scheduleAITurn(castle) {
        const game = this.game;
        game.isProcessingAI = true;
        // AI進行中は操作できないため、スマホでは背面マップの非必須Canvas/フィルタを外して
        // GPUメモリの余裕を作ります。戦闘演出は必要時に小さなCanvasを作り直します。
        if (game.ui && typeof game.ui.releaseMobileTransientMapResources === 'function') {
            game.ui.releaseMobileTransientMapResources();
        }
        if (typeof document !== 'undefined' && document.body && !document.body.classList.contains('is-pc')) {
            document.body.classList.add('mobile-ai-light-mode');
        }
        if (game.ui.aiGuard) {
            game.ui.aiGuard.classList.remove('hidden');
            game.ui.restoreAIGuardText(true);
        }
        // 観戦かプレイ中かでAI進行ロジックは変えない。UIを閉じた直後に落ちた場合も
        // modal_closeの古い診断が残らないよう、共通AIターンの予約地点を記録します。
        if (typeof game.writeAIDiagnostic === 'function') game.writeAIDiagnostic(castle, 'ai_turn:scheduled');
        game.ui.updateAIProgress(game.currentIndex + 1, game.turnQueue.length);
        if (game.ui) game.ui.currentCastle = castle;

        const delay = 30;
        game.aiTimer = setTimeout(async () => {
            if (game.warManager.state.active) return;
            if (game.turnQueue[game.currentIndex] !== castle) return;
            try {
                await game.aiEngine.execAI(castle);
            } catch (error) {
                console.error('AI Error caught:', error);
                game.finishTurn();
            }
        }, delay);
    }

    async processTurn() {  // ★最初に async を付けます！
        const game = this.game;
        if (game.aiTimer) {
            clearTimeout(game.aiTimer);
            game.aiTimer = null;
        }
    
        // ★最強ストッパー１：合戦中やマップ選択中にフライングで呼ばれたら絶対に弾く！
        if (game.warManager && game.warManager.state && game.warManager.state.active) return;
        if (game.selectionMode != null) return;
        
        // ★ここを修正！ 全ての城が終わって翌月（endMonth）に行く前にも、メッセージが消えるのをじっと待ちます！
        if (game.currentIndex >= game.turnQueue.length) { 
            game.writeSystemDiagnostic('month_transition:ai_queue_done');
            if (game.ui && game.ui.waitForDialogs) {
                await game.ui.waitForDialogs();
            }
            // ★ここから追加：全部終わって翌月に行く前に、安心感のために数字を「MAX/MAX」にしておきます！
            if (game.isProcessingAI && game.ui && game.turnQueue.length > 0) {
                game.ui.restoreAIGuardText(true); // ★強制表示
                game.ui.updateAIProgress(game.turnQueue.length, game.turnQueue.length);
                // ★追加：MAXになった数字を一瞬だけ見せてから、月末イベントの邪魔にならないように表示を消します！
                await new Promise(resolve => setTimeout(resolve, 300));
                if (game.ui) {
                    game.ui.hideAIGuardText(); // ★中身を壊さずに、透明にして文字だけを隠します！
                }
            }
            game.writeSystemDiagnostic('month_transition:before_endMonth');
            await game.endMonth(); // ← ★「await」を書き足します！
            return; 
        }
    
        const castle = game.turnQueue[game.currentIndex]; 
        
        if (castle.isDone) {
            // ★ここを書き足し：行動済みの城をスキップする時も、一瞬だけ数字を進めます！
            if (game.isProcessingAI && game.ui) {
                game.ui.updateAIProgress(game.currentIndex + 1, game.turnQueue.length);
            }
            // ★追加：スマホがパンクしないように、ここでほんの一瞬だけ「息継ぎ（お休み）」をさせます！
            setTimeout(() => {
                game.finishTurn();
            }, 0);
            return;
        }
        
        if(!castle || castle.ownerClan === 0 || !game.clans.find(c => Number(c.id) === Number(castle.ownerClan))) { 
            console.log(`空き城またはデータのない城をスキップしました。`);
            // ★ここを書き足し：空城をスキップする時も、一瞬だけ数字を進めます！
            if (game.isProcessingAI && game.ui) {
                game.ui.updateAIProgress(game.currentIndex + 1, game.turnQueue.length);
            }
            game.currentIndex++; 
            // ★追加：空き城を連続で飛ばす時も、スマホがパンクしないように一瞬「息継ぎ」をさせます！
            setTimeout(() => {
                game.processTurn(); 
            }, 0);
            return; 
        }
        
        const ownerId = Number(castle.ownerClan);
        const playerId = Number(game.playerClanId);
        const isPlayerCastle = (ownerId === playerId);
    
        // ==========================================
        // ★ここに追加：画面を動かしたり「ご命令ください」を出す前に、
        // 画面上のメッセージが全部終わるまでじっと待ちます！
        if (game.ui && game.ui.waitForDialogs) {
            await game.ui.waitForDialogs();
        }
        // ==========================================
        
        // ★イベント追加：各城の行動開始前
        if (game.eventManager) {
            await game.eventManager.processEvents('turn_start', castle);
        }
    
        // 行動開始前イベントで城の持ち主や状態が変わった場合の安全措置
        if (castle.isDone || castle.ownerClan === 0) {
            game.finishTurn();
            return;
        }
        
        if (isPlayerCastle) {
            // ==========================================
            // ★ごっそり差し替え！委任のチェックを入れます
            // ==========================================
            if (castle.isDelegated) {
                // 委任されている場合はAIに任せます！
                this._scheduleAITurn(castle);
            } else {
                // 直轄（今まで通りプレイヤーが動かす）の場合
                game.isProcessingAI = false; 
                if (typeof document !== 'undefined' && document.body) document.body.classList.remove('mobile-ai-light-mode');
                if (game.ui && typeof game.ui.recoverMobileMapResources === 'function') game.ui.recoverMobileMapResources();
                game.writeSystemDiagnostic('player_turn:enter', castle);
    
                // ★毎月一番最初の自分のターンで、裏側でオートセーブを走らせます！
                if (!game.hasAutoSavedThisMonth && (window.UserSettings ? window.UserSettings.autoSave : true)) {
                    game.hasAutoSavedThisMonth = true;
                    // ★ゲーム開始直後の最初の月は、意味がないのでオートセーブをスキップします！
                    if (game.year !== game.gameStartYear || game.month !== game.gameStartMonth) {
                        // ★安定化：オートセーブをAI進行と並走させない。
                        // 古いスマホでは「全データ保存」とAI思考が重なるとメモリの山ができるため、
                        // 保存が終わってから操作を返します。
                        game.writeSystemDiagnostic('player_turn:before_autosave', castle);
                        await game.executeAutoSave();
                        game.writeSystemDiagnostic('player_turn:after_autosave', castle);
                    }
                }
    
                if(game.ui.aiGuard) game.ui.aiGuard.classList.add('hidden');
    
                // ★Round5：プレイヤー復帰時のフルマップ描画はここ1回だけ。
                game.writeSystemDiagnostic('player_turn:before_render', castle);
                game.ui.renderMap();
                game._aiDeferredMapRefresh = false;
                game.writeSystemDiagnostic('player_turn:after_render', castle);
                game.ui.scrollToActiveCastle(castle);
                
                game.ui.showTurnStartDialog(castle, () => {
                    game.gunshiSystem.checkAndShowAdvice(castle, async () => {
                        // ★イベント追加：コマンドの選択前（手動操作時）
                        if (game.eventManager) {
                            await game.eventManager.processEvents('before_command', castle);
                        }
                        game.ui.showControlPanel(castle); 
                        game.writeSystemDiagnostic('player_turn:ready', castle);
                    });
                });
            }
        } else {
            // プレイヤー以外の勢力も、委任城と同じAIターン開始窓口を使います。
            this._scheduleAITurn(castle);
        }
    }

    async finishTurn() { 
        const game = this.game;
        const wasProcessingAI = game.isProcessingAI;
    
        // ★最強ストッパー２：合戦中やマップ選択中なら、絶対にターンを勝手に終わらせない！
        if (game.warManager && game.warManager.state && game.warManager.state.active) return; 
        if (game.selectionMode != null) return;
        
        if (game.ui && typeof game.ui.hideAIWarThinking === 'function') {
            game.ui.hideAIWarThinking();
        }
    
        if (game.aiTimer) { clearTimeout(game.aiTimer); game.aiTimer = null; }
    
        game.selectionMode = null;
    
        // ★ここから追加：ターン終了時、必ずコマンドの階層を初期化して非表示にします！
        if (game.ui && typeof game.ui.clearCommandMenu === 'function') {
            game.ui.clearCommandMenu();
        }
        
        // ★ここから追加：自分のターンが終わった瞬間に、いったん膜を張って操作をブロックします！
        game.isProcessingAI = true;
        if (game.ui && game.ui.aiGuard) {
            game.ui.aiGuard.classList.remove('hidden');
            game.ui.restoreAIGuardText(true); // ★透明マントを脱いで文字を見せます！
        }
        
        // ★追加：月末のイベント処理中（独立や反乱など）は、ここでストップします！
        if (game.currentIndex >= game.turnQueue.length) {
            return;
        }
    
        const castle = game.getCurrentTurnCastle(); 
        if(castle) {
            castle.isDone = true;
            if (wasProcessingAI) game.writeAIDiagnostic(castle, 'turn_end:event');
            // ★イベント追加：各城の行動終了直後
            if (game.eventManager) {
                await game.eventManager.processEvents('turn_end', castle);
            }
            if (wasProcessingAI) game.writeAIDiagnostic(castle, 'turn_finished');
        }
    
        game.currentIndex++; 
    
        // Round26：戦争・外交・turn_endイベントまで含めて「今の拠点1件」が完全終了した地点です。
        // 観戦終了予約があれば次の拠点へ進まず、ここで初めて帰還確認を開きます。
        if (await game.tryProcessQueuedWatchReturn('turn_complete')) return;
    
        // ★追加：ターンが終わって次に行く時も、スマホがパンクしないように一瞬「息継ぎ」をさせます！
        setTimeout(() => {
            game.processTurn(); 
        }, 0);
    }

    async endMonth() {
        const game = this.game;
        game.writeSystemDiagnostic('month_end:start');
        // ==========================================
        // ★ 新しい一元管理の魔法：「画面にメッセージが出ている間は絶対に待つ」という最強の関所を作ります！
        const waitIfBusy = async () => {
            if (game.ui && typeof game.ui.waitForDialogs === 'function') {
                await game.ui.waitForDialogs();
            }
            // 少しだけ隙間を待つ（メッセージが連続で出るときの安全対策です）
            await new Promise(resolve => setTimeout(resolve, 300));
        };
        // ==========================================
    
        // ★ここを書き足し！：月末イベント【前】（寿命などの処理が始まる前）を実行します
        if (game.eventManager) {
            await game.eventManager.processEvents('endMonth_before');
            game.writeSystemDiagnostic('month_end:event_before_done');
        }
        await waitIfBusy(); // 終わったら、画面が空っぽになるまで絶対に待つ！
    
        // 1つ目の係員：派閥
        if (game.factionSystem && typeof game.factionSystem.processEndMonth === 'function') {
            await game.factionSystem.processEndMonth(); 
            game.writeSystemDiagnostic('month_end:faction_done');
        }
        await waitIfBusy(); // 終わったら、画面が空っぽになるまで絶対に待つ！
    
        // 2つ目の係員：独立（反乱して空白地になる処理など）
        if (game.independenceSystem && typeof game.independenceSystem.checkIndependence === 'function') {
            await game.independenceSystem.checkIndependence();
            game.writeSystemDiagnostic('month_end:independence_done');
        }
        await waitIfBusy(); // 終わったら、画面が空っぽになるまで絶対に待つ！
        
        // 3つ目の係員：外交
        if (game.diplomacyManager && typeof game.diplomacyManager.processEndMonth === 'function') {
            game.diplomacyManager.processEndMonth();
            game.writeSystemDiagnostic('month_end:diplomacy_done');
        }
        await waitIfBusy(); // 終わったら、画面が空っぽになるまで絶対に待つ！
    
        // 4つ目の係員：諸勢力（反乱など）
        if (game.kunishuSystem && typeof game.kunishuSystem.processEndMonth === 'function') {
            await game.kunishuSystem.processEndMonth();
            game.writeSystemDiagnostic('month_end:kunishu_done');
        }
        await waitIfBusy(); // 終わったら、画面が空っぽになるまで絶対に待つ！
        
        // 5つ目の係員：寿命
        if (game.lifeSystem && typeof game.lifeSystem.processEndMonth === 'function') {
            await game.lifeSystem.processEndMonth(); 
            game.writeSystemDiagnostic('month_end:life_done');
        }
        await waitIfBusy(); // 終わったら、画面が空っぽになるまで絶対に待つ！
    
        // 6つ目の係員：月末の特別イベント（災害など）
        if (game.eventManager) {
            await game.eventManager.processEvents('endMonth_after');
            game.writeSystemDiagnostic('month_end:event_after_done');
        }
        await waitIfBusy(); // 終わったら、画面が空っぽになるまで絶対に待つ！
    
        // すべての月末イベントとメッセージが完全に終わってから、ようやく時間を進めます！
        game.month++;
        if(game.month > 12) { game.month = 1; game.year++; }
        
        // ★ここから追加：月末のタイミングで大名家の表示名を更新して同名被りを防ぎます！
        game.updateClanDisplayNames();
        
        // ★修正：クリアとゲームオーバーの判定を EndingSystem (エンディング係) に任せます！
        const isEnding = await game.endingSystem.checkEnding();
        if (!isEnding) {
            // エンディングでなければ次の月へ進みます
            game.writeSystemDiagnostic('month_end:before_startMonth');
            await game.startMonth(); 
        }
    }

    checkAllActionsDone() {
        const game = this.game;
        const c = game.getCurrentTurnCastle();
        if (!c || Number(c.ownerClan) !== Number(game.playerClanId)) return; 
    
        if (game.isProcessingAI) return;
    
        const bushos = game.getCastleBushos(c.id).filter(b => b.clan === c.ownerClan && b.status === window.GameConstants.BushoStatus.ACTIVE);
        
        if(bushos.length > 0 && bushos.every(b => b.isActionDone)) {
             setTimeout(() => {
                 const nav = game.getNavigatorInfo(c);
                 game.ui.showDialog("「すべての武将が行動を終えました。\n今月の命令を終了しますか？」", true, () => {
                     game.finishTurn();
                 }, null, {
                     leftFace: nav.faceIcon,
                     leftName: nav.name
                 });
             }, 100);
        }
    }

}

window.TurnManager = TurnManager;
