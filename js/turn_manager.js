/**
 * turn_manager.js
 * 月初・各拠点ターン・月末の進行順序を専門に管理します。
 * GameManager は外部互換の窓口だけを持ち、実際の月進行はここへ委譲します。
 */
class TurnManager {
    constructor(game) {
        this.game = game;
        this._allActionsDonePromptTimer = null;
        // 月初・月末・AI予約など「通常ターン進行」の寿命。ロード／タイトル復帰／新規開始で進め、
        // await後や遅延callbackが次シナリオの状態へ戻らないための単一世代境界にします。
        this._turnFlowGeneration = 0;
        // 0msの息継ぎもシナリオ遷移をまたがないよう、通常ターン継続timerを一元管理します。
        this._turnContinuationTimers = new Set();
        // 会話・選択待ちなどtimerを持たないawaitも、シナリオ切替時に旧Promiseを参照ごと残さない。
        // 世代更新の正本はこのTurnManagerに残し、購読者は中断通知だけを受ける。
        this._turnFlowAbortSubscribers = new Set();
    }

    abortForScenarioTransition() {
        this._turnFlowGeneration = Number(this._turnFlowGeneration || 0) + 1;
        this._cancelAllActionsDonePromptTimer();
        if (this._turnContinuationTimers && this._turnContinuationTimers.size > 0) {
            this._turnContinuationTimers.forEach(timerId => clearTimeout(timerId));
            this._turnContinuationTimers.clear();
        }
        if (this.game && this.game.aiTimer) {
            clearTimeout(this.game.aiTimer);
            this.game.aiTimer = null;
        }
        if (this._turnFlowAbortSubscribers && this._turnFlowAbortSubscribers.size > 0) {
            const subscribers = Array.from(this._turnFlowAbortSubscribers);
            this._turnFlowAbortSubscribers.clear();
            subscribers.forEach(entry => {
                try {
                    if (entry && typeof entry.callback === 'function') entry.callback();
                } catch (error) {
                    console.warn('ターン寿命中断通知でエラーが発生しました:', error);
                }
            });
        }
    }

    _isTurnFlowCurrent(generation) {
        const game = this.game;
        return Number(this._turnFlowGeneration || 0) === Number(generation)
            && !!game
            && game.phase === 'game'
            && !game.isRestoringSave;
    }

    // Event/AI/Diplomacyなど専門部署がawait前後で同じシナリオ寿命か確認するための公開読取窓口。
    // 世代値の更新責務はTurnManagerだけに残し、呼び出し側はtokenを比較するだけにします。
    captureTurnFlowGeneration() {
        return Number(this._turnFlowGeneration || 0);
    }

    isTurnFlowGenerationCurrent(generation) {
        return this._isTurnFlowCurrent(generation);
    }

    // timerを持たない会話・選択Promiseも、ロード／タイトル復帰で旧awaitを残さず終了するための通知窓口。
    // 正常終了時は返したunsubscribeで即座に購読を外し、長時間プレイ中に購読者を蓄積しない。
    subscribeTurnFlowAbort(generation, callback) {
        if (typeof callback !== 'function') return () => {};
        const expectedGeneration = Number(generation);
        if (!this._isTurnFlowCurrent(expectedGeneration)) {
            Promise.resolve().then(() => callback());
            return () => {};
        }
        const entry = { generation: expectedGeneration, callback };
        this._turnFlowAbortSubscribers.add(entry);
        return () => {
            if (this._turnFlowAbortSubscribers) this._turnFlowAbortSubscribers.delete(entry);
        };
    }

    scheduleTurnFlowContinuation(callback, delay = 0, options = {}) {
        return this._scheduleTurnFlowContinuation(callback, delay, options);
    }

    _cancelAllActionsDonePromptTimer() {
        if (!this._allActionsDonePromptTimer) return;
        clearTimeout(this._allActionsDonePromptTimer);
        this._allActionsDonePromptTimer = null;
    }

    // 空城スキップ・行動済みスキップ・通常ターン終了後の0ms継続も、AI予約と同じturn-flow世代へ統合します。
    // 予約後にロード／タイトル復帰／新規開始が入った場合はcallback自体を実行せず、旧turnQueueを進めません。
    _scheduleTurnFlowContinuation(callback, delay = 0, options = {}) {
        if (typeof callback !== 'function') return null;
        const game = this.game;
        const generation = Number(this._turnFlowGeneration || 0);
        const expectedIndex = Number.isInteger(options.expectedIndex) ? Number(options.expectedIndex) : null;
        const expectedCastle = options.expectedCastle || null;
        const timerId = setTimeout(() => {
            if (this._turnContinuationTimers) this._turnContinuationTimers.delete(timerId);
            if (!this._isTurnFlowCurrent(generation)) return;
            if (expectedIndex !== null && Number(game.currentIndex) !== expectedIndex) return;
            if (expectedCastle && game.turnQueue && game.turnQueue[game.currentIndex] !== expectedCastle) return;
            try {
                const result = callback();
                if (result && typeof result.catch === 'function') {
                    result.catch(error => console.error('ターン継続処理でエラーが発生しました:', error));
                }
            } catch (error) {
                console.error('ターン継続処理でエラーが発生しました:', error);
            }
        }, Math.max(0, Number(delay) || 0));
        this._turnContinuationTimers.add(timerId);
        return timerId;
    }

    async startMonth() { 
        const game = this.game;
        const turnFlowGeneration = Number(this._turnFlowGeneration || 0);
        const isCurrentFlow = () => this._isTurnFlowCurrent(turnFlowGeneration);
        if (!isCurrentFlow()) return;
        this._cancelAllActionsDonePromptTimer();
        game.hasAutoSavedThisMonth = false; // ★月が替わったので、オートセーブ済みの印を消します
        game.writeSystemDiagnostic('month_start:start');
    
        // ★追加：月初の処理が始まったら、ユーザーが勝手に操作できないように膜（ガード）を張ります！
        game.isProcessingAI = true;
        // r290：AI城ターンだけでなく月初のイベント／派閥／人事処理も長時間AI処理です。
        // 古いスマホではこの区間から地図上252城のfilter/animationと一時Canvasを軽量化し、
        // 災害ダイアログ表示中に背面の見えないGPU処理を抱え込まないようにします。
        if (typeof document !== 'undefined' && document.body && !document.body.classList.contains('is-pc')) {
            document.body.classList.add('mobile-ai-light-mode');
            if (game.ui && typeof game.ui.releaseMobileTransientMapResources === 'function') {
                game.ui.releaseMobileTransientMapResources();
            }
        }
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
        if (!isCurrentFlow()) return;

        // 日付カットイン後の月次更新が長い端末でも固まって見えないよう、
        // 既存のAIガードをそのまま月初準備表示として再利用する。
        if (game.ui && typeof game.ui.showProcessingStatus === 'function') {
            game.ui.showProcessingStatus('月初準備中...');
            if (typeof game.ui.waitForNextPaint === 'function') {
                await game.ui.waitForNextPaint();
            } else {
                await new Promise(resolve => setTimeout(resolve, 0));
            }
            if (!isCurrentFlow()) return;
        }
        
        game.ui.log(`=== ${game.year}年 ${game.month}月 ===`, { history: false });
        
        // 月初イベント【前】をチェックして実行します
        if (game.eventManager) {
            await game.eventManager.processEvents('startMonth_before');
            if (!isCurrentFlow()) return;
            game.writeSystemDiagnostic('month_start:event_before_done');
        }
        
        // 元服の処理が終わるまでしっかり待ちます！
        await game.lifeSystem.processStartMonth();
        if (!isCurrentFlow()) return;
        game.writeSystemDiagnostic('month_start:life_done');
        
        // 武将の下野（出奔）が終わるまで待ちます！
        await game.factionSystem.processStartMonth(); 
        if (!isCurrentFlow()) return;
        game.writeSystemDiagnostic('month_start:faction_done');
    
        // ★安定化：全国派閥再編などで作った一時配列を解放できるよう、
        // 次の全国処理へ入る前にブラウザへ一度制御を返します。
        await new Promise(resolve => setTimeout(resolve, 0));
        if (!isCurrentFlow()) return;
        game.affiliationSystem.processRoninMovements();
        
        game.updateAllCastlesLords();
        
        // 面談印・宿敵タイマー・諸勢力武将経験値など、武将個人の月次更新。
        game.bushos.forEach(busho => PersonnelRules.processMonthlyBushoMaintenance(busho, game));
        
        if (game.month % 3 === 0) game.factionSystem.optimizeCastellans();
        
        // 月初の拠点更新。計算式は EconomyRules / DomesticRules が担当します。
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
                if (!isCurrentFlow()) return;
            }
            
            // 官位をもらったことで威信が増えるので、念のためもう一度最新の威信を計算し直しておきます！
            game.updateAllClanPrestige();
        }
        // ==========================================
    
        // ★ここを書き足し！：月初イベント【後】（収入などの処理が終わった後）を実行します
        // ここで9月の兵糧収穫イベントなどが実行されます！
        if (game.eventManager) {
            await game.eventManager.processEvents('startMonth_after');
            if (!isCurrentFlow()) return;
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
            // getCastleBushos() は同じ城に物理的にいる人物全員を返すため、
            // 給金・役職成長は城主家に所属する通常の活動中武将だけへ限定する。
            const bushos = game.getCastleBushos(castle.id).filter(b =>
                Number(b.clan) === Number(castle.ownerClan)
                && Number(b.belongKunishuId || 0) === 0
                && window.BushoStatusRules.isActive(b)
            );
            const daimyo = daimyoByClanIdForUpkeep.get(castle.ownerClan);
            const { isGoldShort } = EconomyRules.applyMonthlyCastleUpkeep(castle, bushos, daimyo);
            bushos.forEach(busho => PersonnelRules.applyMonthlyRoleProgress(busho, isGoldShort));
        });

        // 四半期の全国AI人事はAIStaffingへ委譲し、TurnManagerは実行時期だけを指示します。
        if (game.aiStaffing) {
            game.writeSystemDiagnostic('month_start:staffing:start');
            await game.aiStaffing.processQuarterlyStaffing(game.month, game.playerClanId);
            if (!isCurrentFlow()) return;
        }
        game.writeSystemDiagnostic('month_start:staffing_done');
        if (game.aiOperationManager) {
            await game.aiOperationManager.processMonthlyOperations();
            if (!isCurrentFlow()) return;
        }
        game.writeSystemDiagnostic('month_start:operations_done');

        // スマホ観戦中に戦争・独立で延期したフル地図再描画は、戦闘Canvasやイベント地図が片付いた
        // 月初の安全地点で最大1回だけ実行します。失敗してもゲーム進行は止めず、次の安全地点へ持ち越します。
        const isMobileWatch = !!(
            game.isWatchMode && game._aiDeferredMapRefresh && game.ui &&
            typeof document !== 'undefined' && document.body && !document.body.classList.contains('is-pc')
        );
        if (isMobileWatch) {
            game.writeSystemDiagnostic('month_start:watch_map_refresh:start');
            if (typeof game.ui.releaseMobileTransientMapResources === 'function') {
                game.ui.releaseMobileTransientMapResources();
            }
            await new Promise(resolve => setTimeout(resolve, 0));
            if (!isCurrentFlow()) return;
            try {
                game.ui.renderMap();
                game._aiDeferredMapRefresh = false;
                if (typeof game.ui.waitForNextPaint === 'function') {
                    await game.ui.waitForNextPaint();
                } else {
                    await new Promise(resolve => setTimeout(resolve, 0));
                }
                if (!isCurrentFlow()) return;
                game.writeSystemDiagnostic('month_start:watch_map_refresh:done');
            } catch (error) {
                console.warn('観戦中の月次地図再描画を延期しました:', error);
                game.writeSystemDiagnostic('month_start:watch_map_refresh:deferred');
            }
        }
    
        game.currentIndex = 0; 
        game.writeSystemDiagnostic('month_start:before_turn_queue');
    
        // Round26：月末～月初の一連処理中に観戦終了が予約されていた場合は、
        // ここを「月処理が完全に一段落した安全地点」として帰還確認へ移ります。
        if (await game.tryProcessQueuedWatchReturn('month_start_complete')) return;
        if (!isCurrentFlow()) return;
    
        game.processTurn();
    }

    /** 委任城・他勢力で共通のAIターン開始処理。 */
    _scheduleAITurn(castle) {
        const game = this.game;
        const turnFlowGeneration = Number(this._turnFlowGeneration || 0);
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
            if (!this._isTurnFlowCurrent(turnFlowGeneration)) return;
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
        // タイトル復帰・ロード開始後に旧ターンのsetTimeout(0)が発火しても、
        // 旧turnQueueを裏で進めない。phaseは画面より上位のゲーム寿命境界として扱う。
        if (game.phase !== 'game' || game.isRestoringSave) return;
    
        // ★最強ストッパー１：合戦中やマップ選択中にフライングで呼ばれたら絶対に弾く！
        if (game.warManager && game.warManager.state && game.warManager.state.active) return;
        if (game.selectionMode != null) return;
        
        // ★ここを修正！ 全ての城が終わって翌月（endMonth）に行く前にも、メッセージが消えるのをじっと待ちます！
        if (game.currentIndex >= game.turnQueue.length) { 
            game.writeSystemDiagnostic('month_transition:ai_queue_done');
            if (game.ui && game.ui.waitForDialogs) {
                await game.ui.waitForDialogs();
            }
            // ロード開始などで待機中の旧月末処理が解放された場合は、復元途中の状態へ進入しません。
            if (game.phase !== 'game' || game.isRestoringSave) return;
            // ★ここから追加：全部終わって翌月に行く前に、安心感のために数字を「MAX/MAX」にしておきます！
            if (game.isProcessingAI && game.ui && game.turnQueue.length > 0) {
                game.ui.restoreAIGuardText(true); // ★強制表示
                game.ui.updateAIProgress(game.turnQueue.length, game.turnQueue.length);
                // MAX表示を一瞬見せた後は、月末処理表示へ切り替える。
                // endMonth() 側でも同じ表示を保証するため、ここでは空白状態を作らない。
                await new Promise(resolve => setTimeout(resolve, 300));
            }
            if (game.phase !== 'game' || game.isRestoringSave) return;
            game.writeSystemDiagnostic('month_transition:before_endMonth');
            await game.endMonth(); // ← ★「await」を書き足します！
            return; 
        }
    
        const expectedTurnIndex = Number(game.currentIndex);
        const castle = game.turnQueue[expectedTurnIndex]; 

        // turnQueue は通常Castleだけで構成されますが、復元失敗や将来の処理変更で
        // 欠損要素が混じっても、isDone参照より先に安全に飛ばします。
        if (!castle) {
            console.warn('ターン列に存在しない拠点が含まれていたため、安全にスキップしました。');
            if (game.isProcessingAI && game.ui) {
                game.ui.updateAIProgress(game.currentIndex + 1, game.turnQueue.length);
            }
            game.currentIndex++;
            this._scheduleTurnFlowContinuation(() => game.processTurn(), 0, { expectedIndex: game.currentIndex });
            return;
        }
        
        if (castle.isDone) {
            // ★ここを書き足し：行動済みの城をスキップする時も、一瞬だけ数字を進めます！
            if (game.isProcessingAI && game.ui) {
                game.ui.updateAIProgress(game.currentIndex + 1, game.turnQueue.length);
            }
            // ★追加：スマホがパンクしないように、ここでほんの一瞬だけ「息継ぎ（お休み）」をさせます！
            this._scheduleTurnFlowContinuation(() => game.finishTurn(), 0, {
                expectedIndex: expectedTurnIndex,
                expectedCastle: castle
            });
            return;
        }
        
        if(castle.ownerClan === 0 || !game.getClan(castle.ownerClan)) { 
            console.log(`空き城またはデータのない城をスキップしました。`);
            // ★ここを書き足し：空城をスキップする時も、一瞬だけ数字を進めます！
            if (game.isProcessingAI && game.ui) {
                game.ui.updateAIProgress(game.currentIndex + 1, game.turnQueue.length);
            }
            game.currentIndex++; 
            // ★追加：空き城を連続で飛ばす時も、スマホがパンクしないように一瞬「息継ぎ」をさせます！
            this._scheduleTurnFlowContinuation(() => game.processTurn(), 0, { expectedIndex: game.currentIndex });
            return; 
        }
        
        // ==========================================
        // ★ここに追加：画面を動かしたり「ご命令ください」を出す前に、
        // 画面上のメッセージが全部終わるまでじっと待ちます！
        if (game.ui && game.ui.waitForDialogs) {
            await game.ui.waitForDialogs();
        }
        // ==========================================

        // waitForDialogs() はロード時のforceResetModals()でも解放されます。
        // 待機前の旧turnQueue要素を復元後のゲームへ持ち込まないよう、寿命と同一要素を再確認します。
        if (game.phase !== 'game' || game.isRestoringSave) return;
        if (Number(game.currentIndex) !== expectedTurnIndex || game.turnQueue[expectedTurnIndex] !== castle) return;
        
        // 所有者判定も待機後の現在値を正本にする。会話待ちの間にイベント等で所属が変わっても古い分類を使わない。
        const ownerId = Number(castle.ownerClan);
        const playerId = Number(game.playerClanId);
        const isPlayerCastle = (ownerId === playerId);

        // 行動開始前に城の持ち主や状態が変わっていた場合の安全措置
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
        this._cancelAllActionsDonePromptTimer();
        if (game.phase !== 'game' || game.isRestoringSave) return;
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
            if (wasProcessingAI) game.writeAIDiagnostic(castle, 'turn_finished');
        }
    
        game.currentIndex++; 
    
        // Round26：戦争・外交・turn_endイベントまで含めて「今の拠点1件」が完全終了した地点です。
        // 観戦終了予約があれば次の拠点へ進まず、ここで初めて帰還確認を開きます。
        if (await game.tryProcessQueuedWatchReturn('turn_complete')) return;
    
        // ★追加：ターンが終わって次に行く時も、スマホがパンクしないように一瞬「息継ぎ」をさせます！
        this._scheduleTurnFlowContinuation(() => game.processTurn(), 0, { expectedIndex: game.currentIndex });
    }

    async endMonth() {
        const game = this.game;
        const turnFlowGeneration = Number(this._turnFlowGeneration || 0);
        const isCurrentFlow = () => this._isTurnFlowCurrent(turnFlowGeneration);
        if (!isCurrentFlow()) return;
        game.writeSystemDiagnostic('month_end:start');

        // 月末の派閥・独立・外交・寿命などは端末によって数秒かかることがあるため、
        // 既存のAIガードを再利用して「停止ではなく処理中」であることを明示する。
        if (game.ui && typeof game.ui.showProcessingStatus === 'function') {
            game.ui.showProcessingStatus('月末処理中...');
            if (typeof game.ui.waitForNextPaint === 'function') {
                await game.ui.waitForNextPaint();
            } else {
                await new Promise(resolve => setTimeout(resolve, 0));
            }
            if (!isCurrentFlow()) return;
        }
        // ==========================================
        // ★ 新しい一元管理の魔法：「画面にメッセージが出ている間は絶対に待つ」という最強の関所を作ります！
        const waitIfBusy = async () => {
            if (game.ui && typeof game.ui.waitForDialogs === 'function') {
                await game.ui.waitForDialogs();
            }
            if (!isCurrentFlow()) return false;
            // 少しだけ隙間を待つ（メッセージが連続で出るときの安全対策です）
            await new Promise(resolve => setTimeout(resolve, 300));
            return isCurrentFlow();
        };
        // ==========================================
    
        // ★ここを書き足し！：月末イベント【前】（寿命などの処理が始まる前）を実行します
        if (game.eventManager) {
            await game.eventManager.processEvents('endMonth_before');
            if (!isCurrentFlow()) return;
            game.writeSystemDiagnostic('month_end:event_before_done');
        }
        if (!(await waitIfBusy())) return; // 終わったら、画面が空っぽになるまで絶対に待つ！
    
        // 1つ目の係員：派閥
        if (game.factionSystem && typeof game.factionSystem.processEndMonth === 'function') {
            await game.factionSystem.processEndMonth(); 
            if (!isCurrentFlow()) return;
            game.writeSystemDiagnostic('month_end:faction_done');
        }
        if (!(await waitIfBusy())) return; // 終わったら、画面が空っぽになるまで絶対に待つ！
    
        // 2つ目の係員：独立（反乱して空白地になる処理など）
        if (game.independenceSystem && typeof game.independenceSystem.checkIndependence === 'function') {
            await game.independenceSystem.checkIndependence();
            if (!isCurrentFlow()) return;
            game.writeSystemDiagnostic('month_end:independence_done');
        }
        if (!(await waitIfBusy())) return; // 終わったら、画面が空っぽになるまで絶対に待つ！
        
        // 3つ目の係員：外交
        if (game.diplomacyManager && typeof game.diplomacyManager.processEndMonth === 'function') {
            game.diplomacyManager.processEndMonth();
            game.writeSystemDiagnostic('month_end:diplomacy_done');
        }
        if (!(await waitIfBusy())) return; // 終わったら、画面が空っぽになるまで絶対に待つ！
    
        // 4つ目の係員：諸勢力（反乱など）
        if (game.kunishuSystem && typeof game.kunishuSystem.processEndMonth === 'function') {
            await game.kunishuSystem.processEndMonth();
            if (!isCurrentFlow()) return;
            game.writeSystemDiagnostic('month_end:kunishu_done');
        }
        if (!(await waitIfBusy())) return; // 終わったら、画面が空っぽになるまで絶対に待つ！
        
        // 5つ目の係員：寿命
        if (game.lifeSystem && typeof game.lifeSystem.processEndMonth === 'function') {
            await game.lifeSystem.processEndMonth(); 
            if (!isCurrentFlow()) return;
            game.writeSystemDiagnostic('month_end:life_done');
        }
        if (!(await waitIfBusy())) return; // 終わったら、画面が空っぽになるまで絶対に待つ！
    
        // 6つ目の係員：月末の特別イベント（災害など）
        if (game.eventManager) {
            await game.eventManager.processEvents('endMonth_after');
            if (!isCurrentFlow()) return;
            game.writeSystemDiagnostic('month_end:event_after_done');
        }
        if (!(await waitIfBusy())) return; // 終わったら、画面が空っぽになるまで絶対に待つ！
    
        // すべての月末イベントとメッセージが完全に終わってから、ようやく時間を進めます！
        game.month++;
        if(game.month > 12) { game.month = 1; game.year++; }
        
        // ★ここから追加：月末のタイミングで大名家の表示名を更新して同名被りを防ぎます！
        game.updateClanDisplayNames();
        
        // ★修正：クリアとゲームオーバーの判定を EndingSystem (エンディング係) に任せます！
        const isEnding = await game.endingSystem.checkEnding();
        if (!isCurrentFlow()) return;
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
             // 同じ固定ダイアログへ複数の遅延確認を積まず、100ms後にも同じ拠点・同じターンで
             // 全員行動済みかを再確認する。旧ターンの確認が戦闘開始後や次の拠点へ遅れて出ないようにする。
             if (this._allActionsDonePromptTimer) return;
             const expectedCastleId = Number(c.id);
             const expectedTurnIndex = Number(game.currentIndex);
             this._allActionsDonePromptTimer = setTimeout(() => {
                 this._allActionsDonePromptTimer = null;
                 const currentCastle = game.getCurrentTurnCastle();
                 if (game.phase !== 'game' || game.isProcessingAI || game.selectionMode != null) return;
                 if (!currentCastle || Number(currentCastle.id) !== expectedCastleId || Number(game.currentIndex) !== expectedTurnIndex) return;
                 if (Number(currentCastle.ownerClan) !== Number(game.playerClanId) || currentCastle.isDone) return;
                 if (game.warManager && game.warManager.state && game.warManager.state.active) return;
                 if (game.fieldWarManager && game.fieldWarManager.active) return;
                 const currentBushos = game.getCastleBushos(currentCastle.id)
                     .filter(b => b.clan === currentCastle.ownerClan && b.status === window.GameConstants.BushoStatus.ACTIVE);
                 if (currentBushos.length === 0 || !currentBushos.every(b => b.isActionDone)) return;

                 const nav = game.getNavigatorInfo(currentCastle);
                 game.ui.showDialog("「すべての武将が行動を終えました。\n今月の命令を終了しますか？」", true, () => {
                     game.finishTurn();
                 }, null, {
                     leftFace: nav.faceIcon,
                     leftName: nav.name,
                     closeBeforeOk: true,
                     closeBeforeCancel: true
                 });
             }, 100);
        }
    }

}

window.TurnManager = TurnManager;
