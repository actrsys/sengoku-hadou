/**
 * ui_info_busho.js
 * 武将一覧や詳細に関する機能を UIInfoManager に合体させるファイルです
 * Object.assignではそれぞれのメソッドの間に必ずカンマが必要です
 */
Object.assign(UIInfoManager.prototype, {

    showBushoDetailModal(busho) {
        this.pushModal('busho_detail', [busho]);
    },
    
    _renderBushoDetail(busho, scrollPos = 0) {
        const modal = document.getElementById('selector-modal');
        const title = document.getElementById('selector-title');
        const listContainer = document.getElementById('selector-list');
        const contextEl = document.getElementById('selector-context-info');
        const tabsEl = document.getElementById('selector-tabs');
        const confirmBtn = document.getElementById('selector-confirm-btn');
        const backBtn = document.querySelector('#selector-modal .btn-secondary');

        modal.classList.remove('hidden');
        if (title) title.textContent = "武将情報";
        if (contextEl) contextEl.classList.add('hidden');
        if (tabsEl) tabsEl.classList.add('hidden');
        if (confirmBtn) confirmBtn.classList.add('hidden');

        if(backBtn) {
            backBtn.style.display = '';
            backBtn.textContent = this.modalHistory.length > 0 ? '戻る' : '閉じる';
            backBtn.onclick = () => {
                if (window.AudioManager) window.AudioManager.playSE('cancel.ogg');
                this.popModal();
            };
            const footer = backBtn.parentElement;
            if (footer) footer.style.justifyContent = 'center';
        }

        let faceHtml = busho.faceIcon ? `<img src="data/images/faceicons/${busho.faceIcon}" class="daimyo-detail-face" onerror="this.src='data/images/faceicons/unknown_face.webp'">` : `<img src="data/images/faceicons/unknown_face.webp" class="daimyo-detail-face">`;

        let affiliationName = "なし";
        let isFamily = false; 
        if (busho.belongKunishuId > 0) {
            let kunishu = null;
            if (this.game.kunishuSystem && typeof this.game.kunishuSystem.getKunishu === 'function') kunishu = this.game.kunishuSystem.getKunishu(busho.belongKunishuId);
            else if (this.game.kunishus) kunishu = this.game.kunishus.find(k => k.id === busho.belongKunishuId);
            
            if (kunishu) {
                affiliationName = kunishu.getName(this.game);
                const leader = this.game.getBusho(kunishu.leaderId);
                if (leader && busho.id !== leader.id) {
                    const bFamily = Array.isArray(busho.familyIds) ? busho.familyIds : [];
                    const lFamily = Array.isArray(leader.familyIds) ? leader.familyIds : [];
                    if (bFamily.includes(leader.id) || lFamily.includes(busho.id)) isFamily = true;
                }
            } else {
                affiliationName = "諸勢力";
            }
        } else if (busho.clan > 0) {
            const clan = this.game.clans.find(c => c.id === busho.clan);
            if (clan) {
                affiliationName = clan.name;
                const daimyo = this.game.getBusho(clan.leaderId); 
                if (daimyo && busho.id !== daimyo.id && !busho.isDaimyo) {
                    const bFamily = Array.isArray(busho.familyIds) ? busho.familyIds : [];
                    const dFamily = Array.isArray(daimyo.familyIds) ? daimyo.familyIds : [];
                    if (bFamily.includes(daimyo.id) || dFamily.includes(busho.id)) isFamily = true;
                }
            }
        }

        const castle = this.game.getCastle(busho.castleId);
        const castleName = castle ? castle.name : "不明";
        const age = busho.isAutoLeader ? "" : (this.game.year - busho.birthYear + 1);
        const ageStr = busho.isAutoLeader ? age : `${age}歳`;

        let rankName = "";
        try {
            if (busho.courtRankIds && this.game.courtRankSystem) {
                let ids = busho.courtRankIds;
                if (typeof ids === 'string') ids = ids.split(',').map(id => Number(id));
                if (Array.isArray(ids)) {
                    let highestRank = null;
                    ids.forEach(id => {
                        let rank = null;
                        if (typeof this.game.courtRankSystem.getRank === 'function') rank = this.game.courtRankSystem.getRank(id);
                        else if (this.game.courtRankSystem.ranks) {
                            if (Array.isArray(this.game.courtRankSystem.ranks)) rank = this.game.courtRankSystem.ranks.find(r => r.id === id);
                            else rank = this.game.courtRankSystem.ranks[id];
                        }
                        if (rank && (!highestRank || rank.rankNo < highestRank.rankNo)) highestRank = rank;
                    });
                    if (highestRank) {
                        let displayName = highestRank.rankName2 || highestRank.rankName1 || "";
                        if (displayName) rankName = `<span class="busho-detail-rank">${displayName}</span>`;
                    }
                }
            }
        } catch (error) {}

        let salary = "";
        if (busho.clan > 0 && !busho.isDaimyo && busho.status !== 'ronin') {
            const clan = this.game.clans.find(c => c.id === busho.clan);
            const daimyo = clan ? this.game.getBusho(clan.leaderId) : null;
            salary = busho.getSalary(daimyo);
            if (salary === 0) salary = "";
        }

        let factionNameStr = busho.factionName || "";

        const gunshi = this.game.getClanGunshi(this.game.playerClanId);
        const myDaimyo = this.game.bushos.find(b => b.clan === this.game.playerClanId && b.isDaimyo);
        let acc = null;
        if (busho.clan !== this.game.playerClanId && busho.clan !== 0 && castle) acc = castle.investigatedAccuracy;

        const getStatRow = (statKey, label) => {
            const gradeHtml = GameSystem.getDisplayStatHTML(busho, statKey, gunshi, acc, this.game.playerClanId, myDaimyo);
            let perceived = GameSystem.getPerceivedStatValue(busho, statKey, gunshi, acc, this.game.playerClanId, myDaimyo);
            if (busho.clan === this.game.playerClanId && busho.isDaimyo) perceived = busho[statKey];
            
            let percent = perceived !== null ? Math.max(0, perceived) : 0;
            if(perceived === null) percent = 0; 

            let basePercent = Math.min(100, percent);
            let overPercent = percent > 100 ? percent - 100 : 0;
            let overBarHtml = overPercent > 0 ? `<div class="bar-fill-busho-over" style="width:${overPercent}%;"></div>` : "";
            let fillClass = overPercent > 0 ? "bar-fill-busho over-connected" : "bar-fill-busho";

            return `
                <div class="daimyo-detail-stat-box" style="padding-right: 5px;">
                    <span class="daimyo-detail-label">${label}</span>
                    <span class="daimyo-detail-value" style="display:flex; align-items:center; flex:1; justify-content: flex-end;">
                        <div class="bar-bg-busho">
                            <div class="${fillClass}" style="width:${basePercent}%;"></div>
                            ${overBarHtml}
                        </div>
                        <div style="width: 30px; text-align: center; font-weight: bold;">${gradeHtml}</div>
                    </span>
                </div>
            `;
        };

        const yomiStr = busho.yomi ? busho.yomi : "";

        if (listContainer) {
            listContainer.className = 'list-container hide-native-scroll';
            listContainer.style.display = 'block';
            listContainer.innerHTML = `
                <div class="daimyo-detail-container" style="padding: 10px;">
                    <div class="daimyo-detail-header pc-only" style="margin-bottom: 10px;">
                        <div style="display:flex; flex-direction:column;">
                            <span style="font-size:0.8rem; color:#ccc; margin-bottom:2px;">${yomiStr}</span>
                            <div style="display:flex; align-items:center; gap:10px;">
                                <div class="daimyo-detail-name" style="font-size: 1.5rem;">${busho.name}</div>
                                ${rankName}
                            </div>
                        </div>
                    </div>
                    <div class="daimyo-detail-body">
                        <div class="daimyo-detail-left">
                            ${faceHtml}
                            <div class="daimyo-detail-header sp-only" style="flex-direction:column; align-items:flex-start; gap:2px; margin-bottom: 0; justify-content: center;">
                                <span style="font-size:0.75rem; color:#ccc;">${yomiStr}</span>
                                <div style="display:flex; align-items:center; gap:5px;">
                                    <div class="daimyo-detail-name" style="font-size:1.3rem;">${busho.name}</div>
                                    ${rankName}
                                </div>
                            </div>
                        </div>
                        <div class="daimyo-detail-right">
                            <div class="daimyo-detail-row daimyo-detail-2col">
                                <div class="daimyo-detail-stat-box"><span class="daimyo-detail-label">勢力</span><span class="daimyo-detail-value">${affiliationName}</span></div>
                                <div class="daimyo-detail-stat-box"><span class="daimyo-detail-label">所在</span><span class="daimyo-detail-value">${castleName}</span></div>
                            </div>
                            <div class="daimyo-detail-row daimyo-detail-2col">
                                <div class="daimyo-detail-stat-box"><span class="daimyo-detail-label">身分</span><span class="daimyo-detail-value">${busho.getRankName()}</span></div>
                                <div class="daimyo-detail-stat-box"><span class="daimyo-detail-label">年齢</span><span class="daimyo-detail-value">${ageStr}</span></div>
                            </div>
                            <div class="daimyo-detail-row daimyo-detail-2col">
                                ${getStatRow('leadership', '統率')}
                                ${getStatRow('strength', '武勇')}
                            </div>
                            <div class="daimyo-detail-row daimyo-detail-2col">
                                ${getStatRow('politics', '内政')}
                                ${getStatRow('diplomacy', '外交')}
                            </div>
                            <div class="daimyo-detail-row daimyo-detail-2col">
                                ${getStatRow('intelligence', '智謀')}
                                ${getStatRow('charm', '魅力')}
                            </div>
                            <div class="daimyo-detail-row daimyo-detail-2col">
                                <div class="daimyo-detail-stat-box"><span class="daimyo-detail-label">俸禄</span><span class="daimyo-detail-value">${salary}</span></div>
                                <div class="daimyo-detail-stat-box"><span class="daimyo-detail-label">一門</span><span class="daimyo-detail-value">${isFamily ? "◯" : ""}</span></div>
                            </div>
                            <div class="daimyo-detail-row">
                                <div class="daimyo-detail-stat-box"><span class="daimyo-detail-label">派閥</span><span class="daimyo-detail-value">${factionNameStr}</span></div>
                            </div>
                        </div>
                    </div>
                </div>
            `;
            listContainer.scrollTop = scrollPos;
        }
    },
    
    showBushoDetailModalById(bushoId) {
        const busho = this.game.getBusho(bushoId);
        if (busho) this.showBushoDetailModal(busho);
    },
    
    _saveBushoSelection() {
        const inputs = document.querySelectorAll('input[name="sel_busho"]:checked');
        if (inputs) {
            this.bushoSavedSelectedIds = Array.from(inputs).map(i => parseInt(i.value));
        } else {
            this.bushoSavedSelectedIds = [];
        }
    },

    _updateBushoSelectorUI() {
        const ctx = this._bushoSelectorContext;
        if (!ctx) return;
        
        const checkedCount = document.querySelectorAll('input[name="sel_busho"]:checked').length; 
        const contextEl = document.getElementById('selector-context-info');
        const confirmBtn = document.getElementById('selector-confirm-btn');

        if (contextEl && ctx.isMulti) {
            let cost = 0, item = ""; 
            if (ctx.costGold > 0) { cost = checkedCount * ctx.costGold; item = "金"; }
            if (ctx.costRice > 0) { cost = checkedCount * ctx.costRice; item = "米"; }
            if (cost > 0) {
                 contextEl.innerHTML = `<div>消費予定 ${item}: ${cost} (所持: ${item==='金'?ctx.c.gold:ctx.c.rice})</div>`; 
            } else if (['war_deploy', 'def_intercept_deploy', 'def_reinf_deploy', 'atk_reinf_deploy', 'def_self_reinf_deploy', 'atk_self_reinf_deploy', 'kunishu_subjugate_deploy'].includes(ctx.actionType)) {
                 contextEl.innerHTML = `<div>出陣武将: ${checkedCount}名 / 最大5名</div>`;
            }
        }

        if (confirmBtn && !ctx.isViewMode) {
            if (checkedCount > 0) {
                confirmBtn.disabled = false;
                confirmBtn.style.opacity = 1.0;
            } else {
                confirmBtn.disabled = true;
                confirmBtn.style.opacity = 0.5;
            }
        }
    },

    handleBushoSelect(e, isMulti, costGold, costRice, actionType) {
        let div = e.currentTarget;
        let input = null;

        if (e.target.tagName === 'INPUT') {
            input = e.target;
        } else {
            input = div.querySelector('input');
        }

        if (!input) return;

        const c = this._bushoSelectorContext ? this._bushoSelectorContext.c : this.ui.currentCastle;
        const isAlreadySelected = div.classList.contains('selected');

        if (e.target.tagName === 'INPUT') { 
            if(!isMulti) {
                const siblings = document.querySelectorAll('.select-item');
                siblings.forEach(el => el.classList.remove('selected'));
                const allInputs = document.querySelectorAll('input[name="sel_busho"]');
                allInputs.forEach(inp => inp.checked = false);
                
                if (isAlreadySelected) {
                    input.checked = false;
                } else {
                    input.checked = true;
                    div.classList.add('selected');
                }
            } else {
                 const maxSelect = ['war_deploy', 'def_intercept_deploy', 'def_reinf_deploy', 'atk_reinf_deploy', 'def_self_reinf_deploy', 'atk_self_reinf_deploy', 'kunishu_subjugate_deploy'].includes(actionType) ? 5 : 999;
                 const currentChecked = document.querySelectorAll('input[name="sel_busho"]:checked').length;
                 if(e.target.checked && currentChecked > maxSelect) {
                     e.target.checked = false;
                     this.ui.showDialog(`出陣できる武将は最大${maxSelect}名までです。`, false);
                     return;
                 }
                 if (e.target.checked) {
                     if (costGold > 0 && currentChecked * costGold > c.gold) {
                         e.target.checked = false; this.ui.showDialog(`金が足りないため、これ以上選べません。`, false); return;
                     }
                     if (costRice > 0 && currentChecked * costRice > c.rice) {
                         e.target.checked = false; this.ui.showDialog(`兵糧が足りないため、これ以上選べません。`, false); return;
                     }
                 }
            }
            if(e.target.checked) div.classList.add('selected'); else div.classList.remove('selected');
            this._updateBushoSelectorUI(); 
            return;
        } 
        
        if (isMulti) { 
             const maxSelect = ['war_deploy', 'def_intercept_deploy', 'def_reinf_deploy', 'atk_reinf_deploy', 'def_self_reinf_deploy', 'atk_self_reinf_deploy', 'kunishu_subjugate_deploy'].includes(actionType) ? 5 : 999;
             const currentChecked = document.querySelectorAll('input[name="sel_busho"]:checked').length;
             if(!input.checked && currentChecked >= maxSelect) {
                 this.ui.showDialog(`出陣できる武将は最大${maxSelect}名までです。`, false); return;
             }
             if (!input.checked) {
                 if (costGold > 0 && (currentChecked + 1) * costGold > c.gold) {
                     this.ui.showDialog(`金が足りないため、これ以上選べません。`, false); return;
                 }
                 if (costRice > 0 && (currentChecked + 1) * costRice > c.rice) {
                     this.ui.showDialog(`兵糧が足りないため、これ以上選べません。`, false); return;
                 }
             }
             input.checked = !input.checked; 
        } else { 
             const allItems = document.querySelectorAll('.select-item'); 
             allItems.forEach(item => item.classList.remove('selected')); 
             const allInputs = document.querySelectorAll('input[name="sel_busho"]');
             allInputs.forEach(inp => inp.checked = false);

             if (!isAlreadySelected) {
                 input.checked = true; 
             }
        }
        if(input.checked) div.classList.add('selected'); else div.classList.remove('selected');
        
        this._updateBushoSelectorUI();
    },
    
    // ==========================================
    // ★武将一覧＆武将選択の魔法（共通モーダル対応版）
    // ==========================================
    
    openBushoSelector(actionType, targetId = null, extraData = null, onBack = null) {
        if (actionType === 'appoint' && this.ui.currentCastle) { const isDaimyoHere = this.game.getCastleBushos(this.ui.currentCastle.id).some(b => b.isDaimyo); if (isDaimyoHere) { this.ui.showDialog("大名の居城は城主を変更できません", false); return; } }
        
        // ★ここから追加：面談で他の武将を選ぶ際に戻るを押したら、面談画面に戻るようにします
        if (actionType === 'interview_target' && extraData && extraData.interviewer) {
            extraData.onCancel = () => {
                this.ui.reopenInterviewModal(extraData.interviewer);
            };
        }
        
        // ★修正：新しく武将一覧を開くときは、以前開いたリストの記憶（キャッシュ）を消してリセットします
        this.bushoCurrentSortKey = null;
        this.bushoIsSortAsc = false;
        this.bushoSavedBushos = null;
        this.bushoSavedSortedBushos = null;
        this.bushoLastSortStateKey = null;
        this.bushoLastScope = null;
        this.bushoSavedData = null;

        if (actionType === 'view_only' || actionType === 'all_busho_list') {
            this.pushModal('busho_selector', [actionType, targetId, extraData, onBack]);
        } else {
            this.closeCommonModal(); // アクションの時は新しく開くので履歴ごとリセットします
            this.pushModal('busho_selector', [actionType, targetId, extraData, onBack]);
        }
    },
    
    _renderBushoSelector(actionType, targetId, extraData, onBack, scrollPos = 0) {
        this.ui.hideAIGuardTemporarily(); 
        
        const isViewMode = (actionType === 'view_only' || actionType === 'all_busho_list');
        
        // ★追加：行動を消費しないコマンドかどうかを判定します
        let isActionFree = false;
        if (extraData && extraData.allowDone) isActionFree = true; 
        if (['appoint','appoint_legion_leader','employ_target','appoint_gunshi','rumor_target_busho','headhunt_target','interview','interview_target','reward','war_general', 'kunishu_war_general', 'marriage_princess', 'marriage_kinsman', 'succession'].includes(actionType)) isActionFree = true;
        if (['def_intercept_deploy', 'def_reinf_deploy', 'atk_reinf_deploy', 'def_self_reinf_deploy', 'atk_self_reinf_deploy', 'kunishu_subjugate_deploy'].includes(actionType)) isActionFree = true;
        
        // ★追加：行動列を隠すかどうかのフラグです
        const hideActionCol = isViewMode || isActionFree;
        
        const c = this.ui.currentCastle;
        
        // ★キャッシュを利用して毎回重い処理が走るのを防ぐ魔法
        let bushos, infoHtml, isMulti, spec;
        if (this.bushoSavedData && this.bushoSavedData.actionType === actionType && this.bushoSavedData.targetId === targetId) {
            bushos = this.bushoSavedData.bushos;
            infoHtml = this.bushoSavedData.infoHtml;
            isMulti = this.bushoSavedData.isMulti;
            spec = this.bushoSavedData.spec;
        } else {
            // ★修正：イベントからの呼び出し時など、特別に武将リストが渡されている場合はシステムへの問い合わせをスキップしてエラーを防ぎます！
            if (extraData && extraData.customBushos) {
                bushos = extraData.customBushos;
                infoHtml = extraData.customInfoHtml || "";
                isMulti = false;
                spec = {};
                this.bushoSavedData = { actionType, targetId, bushos, infoHtml, isMulti, spec };
            } else {
                const data = this.game.commandSystem.getBushoSelectorData(actionType, targetId, extraData, c);
                bushos = data.bushos;
                infoHtml = data.infoHtml;
                isMulti = data.isMulti;
                spec = data.spec || {};
                this.bushoSavedData = { actionType, targetId, bushos, infoHtml, isMulti, spec };
            }
            this.bushoSavedBushos = null;
            this.bushoSavedSortedBushos = null;
        }

        // クリック処理などで使う状態を保存しておきます
        this._bushoSelectorContext = {
            isMulti: isMulti,
            costGold: spec.costGold || 0,
            costRice: spec.costRice || 0,
            actionType: actionType,
            isViewMode: isViewMode,
            c: c
        };
        
        let titleStr = "";
        if (extraData && extraData.customTitle) {
            titleStr = extraData.customTitle;
        } else if (isViewMode) {
            titleStr = "武将一覧";
        } else {
            titleStr = isMulti ? "武将を選択（複数可）" : "武将を選択"; 
        }

        let isEnemyTarget = false;
        let targetCastle = null;
        if (['rumor_target_busho','headhunt_target','view_only'].includes(actionType)) {
             isEnemyTarget = true;
             targetCastle = this.game.getCastle(targetId);
        }
        const gunshi = this.game.getClanGunshi(this.game.playerClanId);
        const myDaimyo = this.game.bushos.find(b => b.clan === this.game.playerClanId && b.isDaimyo);
        
        // デフォルトではヘッダーのソート状態を指定せず、コマンドごとの最適な計算結果順（初期並び順）で表示します
        // （ユーザーがヘッダーをクリックした時のみ this.bushoCurrentSortKey が設定され、ソートが実行されます）

        let tabsHtml = null;
        if (isViewMode) {
            let scopeHtml = '';
            if (actionType === 'all_busho_list') {
                scopeHtml = `
                    <div style="display: flex; gap: 5px; margin-left: 15px;">
                        <button class="busho-scope-btn ${this.bushoCurrentScope === 'clan' ? 'active' : ''}" data-scope="clan">自家</button>
                        <button class="busho-scope-btn ${this.bushoCurrentScope === 'all' ? 'active' : ''}" data-scope="all">全国</button>
                    </div>
                `;
            }
            tabsHtml = `
                <div style="display: flex; gap: 5px;">
                    <button class="busho-tab-btn ${this.bushoCurrentTab === 'stats' ? 'active' : ''}" data-tab="stats">基本</button>
                    <button class="busho-tab-btn ${this.bushoCurrentTab === 'status' ? 'active' : ''}" data-tab="status">状態</button>
                </div>
                ${scopeHtml}
            `;
        }

        let displayBushos;
        if (!this.bushoSavedBushos || this.bushoLastScope !== this.bushoCurrentScope) {
            let baseBushos = [...bushos]; 
            if (actionType === 'all_busho_list' && this.bushoCurrentScope === 'all') {
                baseBushos = this.game.bushos.filter(b => {
                    if (b.status === 'unborn' || b.status === 'dead') return false;
                    if (b.clan > 0 || b.belongKunishuId > 0 || b.status === 'ronin') return true;
                    return false;
                });
            }
            this.bushoLastScope = this.bushoCurrentScope;
            this.bushoSavedBushos = baseBushos;
            this.bushoSavedSortedBushos = null; // スコープが変わったらソートキャッシュは破棄
        }

        const getSortRankAll = (b) => {
            const isGunshi = b.isGunshi || (b.clan > 0 && this.game.clans.find(c => c.id === b.clan)?.gunshiId === b.id);
            const isCommander = window.GameApp && window.GameApp.legions && window.GameApp.legions.some(l => l.commanderId === b.id);
            if (b.clan === this.game.playerClanId) return b.isDaimyo ? 10000 : (isCommander ? 9500 : (b.isCastellan ? 9000 : (isGunshi ? 8500 : 8000)));
            if (b.clan > 0) return 5000 - b.clan * 10 + (b.isDaimyo ? 4 : (isCommander ? 3.5 : (b.isCastellan ? 3 : (isGunshi ? 2 : 1))));
            if (b.belongKunishuId > 0) return 2000 - b.belongKunishuId * 10 + (b.id === (window.GameApp ? window.GameApp.kunishuSystem.getKunishu(b.belongKunishuId)?.leaderId : 0) ? 2 : 1);
            if (b.status === 'ronin') return 1000;
            return 0;
        };
        const getSortRankClan = (b) => {
            const isGunshi = b.isGunshi || (b.clan > 0 && this.game.clans.find(c => c.id === b.clan)?.gunshiId === b.id);
            const isCommander = window.GameApp && window.GameApp.legions && window.GameApp.legions.some(l => l.commanderId === b.id);
            if (b.isDaimyo) return 8;
            if (isCommander) return 7;
            if (b.isCastellan) return 6;
            if (isGunshi) return 5; 
            if (b.status === 'ronin') return 1;
            if (b.belongKunishuId > 0) {
                const isLeader = b.id === (window.GameApp ? window.GameApp.kunishuSystem.getKunishu(b.belongKunishuId)?.leaderId : 0);
                return isLeader ? 3 : 2;
            }
            return 4; 
        };
        
        let acc = null;
        if (isEnemyTarget && targetCastle) acc = targetCastle.investigatedAccuracy;

        const selectedIdsStr = (this.bushoSavedSelectedIds || []).sort().join('_');
        const currentSortStateKey = `${this.bushoCurrentSortKey}_${this.bushoIsSortAsc}_${selectedIdsStr}`;

        if (this.bushoSavedSortedBushos && this.bushoLastSortStateKey === currentSortStateKey) {
            displayBushos = this.bushoSavedSortedBushos;
        } else {
            displayBushos = this._prepareStableSortBase('busho', this.bushoSavedBushos, this.bushoCurrentSortKey); // ★共通の魔法

            if (this.bushoCurrentSortKey) {
                displayBushos.sort((a, b) => {
                    const selA = (this.bushoSavedSelectedIds || []).includes(a.id) ? 1 : 0;
                    const selB = (this.bushoSavedSelectedIds || []).includes(b.id) ? 1 : 0;
                    if (selA !== selB) return selB - selA;

                    let valA = 0, valB = 0;
                    if (this.bushoCurrentSortKey === 'action') {
                        valA = a.isActionDone ? 1 : 0; valB = b.isActionDone ? 1 : 0;
                    } else if (this.bushoCurrentSortKey === 'name') {
                        const yomiA = a.yomi || a.name || ""; const yomiB = b.yomi || b.name || "";
                        let cmp = this.bushoIsSortAsc ? yomiA.localeCompare(yomiB, 'ja') : yomiB.localeCompare(yomiA, 'ja');
                        if (cmp === 0) {
                            const nameA = a.name || ""; const nameB = b.name || "";
                            cmp = this.bushoIsSortAsc ? nameA.localeCompare(nameB, 'ja') : nameB.localeCompare(nameA, 'ja');
                        }
                        return cmp;
                    } else if (this.bushoCurrentSortKey === 'rank') {
                        valA = getSortRankClan(a); valB = getSortRankClan(b);
                    } else if (this.bushoCurrentSortKey === 'faction') {
                        const isRoninA = a.status === 'ronin'; const isRoninB = b.status === 'ronin';
                        if (isRoninA && !isRoninB) return 1;
                        if (!isRoninA && isRoninB) return -1;
                        const getFactionInfo = (busho) => {
                            if (busho.belongKunishuId > 0) {
                                const kunishu = this.game.kunishuSystem.getKunishu(busho.belongKunishuId);
                                return { yomi: kunishu ? (kunishu.yomi || kunishu.name || "") : "んんん", name: kunishu ? (kunishu.name || "") : "んんん" };
                            } else if (busho.clan > 0) {
                                const clan = this.game.clans.find(c => c.id === busho.clan);
                                return { yomi: clan ? (clan.yomi || clan.name || "") : "んんん", name: clan ? (clan.name || "") : "んんん" };
                            }
                            return { yomi: "んんん", name: "んんん" };
                        };
                        const infoA = getFactionInfo(a); const infoB = getFactionInfo(b);
                        let cmp = this.bushoIsSortAsc ? infoA.yomi.localeCompare(infoB.yomi, 'ja') : infoB.yomi.localeCompare(infoA.yomi, 'ja');
                        if (cmp === 0) cmp = this.bushoIsSortAsc ? infoA.name.localeCompare(infoB.name, 'ja') : infoB.name.localeCompare(infoA.name, 'ja');
                        return cmp;
                    } else if (this.bushoCurrentSortKey === 'castle') {
                        const getCastleInfo = (busho) => {
                            const castle = this.game.getCastle(busho.castleId);
                            return { yomi: castle ? (castle.yomi || castle.name || "") : "んんん", name: castle ? (castle.name || "") : "んんん" };
                        };
                        const infoA = getCastleInfo(a); const infoB = getCastleInfo(b);
                        let cmp = this.bushoIsSortAsc ? infoA.yomi.localeCompare(infoB.yomi, 'ja') : infoB.yomi.localeCompare(infoA.yomi, 'ja');
                        if (cmp === 0) cmp = this.bushoIsSortAsc ? infoA.name.localeCompare(infoB.name, 'ja') : infoB.name.localeCompare(infoA.name, 'ja');
                        return cmp;
                    } else if (this.bushoCurrentSortKey === 'faction_leader') {
                        const getLeaderInfo = (busho) => {
                            if (busho.factionId > 0 && busho.clan > 0 && busho.factionName) {
                                return { yomi: busho.factionYomi || "んんん", name: busho.factionName };
                            }
                            return { yomi: "んんん", name: "んんん" };
                        };
                        const infoA = getLeaderInfo(a); const infoB = getLeaderInfo(b);
                        let cmp = this.bushoIsSortAsc ? infoA.yomi.localeCompare(infoB.yomi, 'ja') : infoB.yomi.localeCompare(infoA.yomi, 'ja');
                        if (cmp === 0) cmp = this.bushoIsSortAsc ? infoA.name.localeCompare(infoB.name, 'ja') : infoB.name.localeCompare(infoA.name, 'ja');
                        return cmp;
                    } else if (this.bushoCurrentSortKey === 'age') {
                        const isNullA = a.isAutoLeader; const isNullB = b.isAutoLeader;
                        if (isNullA && !isNullB) return 1;
                        if (!isNullA && isNullB) return -1;
                        valA = isNullA ? 0 : this.game.year - a.birthYear;
                        valB = isNullB ? 0 : this.game.year - b.birthYear;
                    } else if (this.bushoCurrentSortKey === 'family') {
                        const checkFamily = (busho) => {
                            if (busho.clan > 0) {
                                const clan = this.game.clans.find(c => c.id === busho.clan);
                                const daimyo = clan ? this.game.getBusho(clan.leaderId) : null;
                                if (daimyo && (busho.id === daimyo.id || busho.isDaimyo)) return 1;
                                if (daimyo) {
                                    const bFam = Array.isArray(busho.familyIds) ? busho.familyIds : [];
                                    const dFam = Array.isArray(daimyo.familyIds) ? daimyo.familyIds : [];
                                    if (bFam.includes(daimyo.id) || dFam.includes(busho.id)) return 1;
                                }
                            }
                            return 0;
                        };
                        valA = checkFamily(a); valB = checkFamily(b);
                    } else if (this.bushoCurrentSortKey === 'salary') {
                        const daimyoA = a.clan > 0 ? this.game.getBusho(this.game.clans.find(c=>c.id===a.clan)?.leaderId) : null;
                        const daimyoB = b.clan > 0 ? this.game.getBusho(this.game.clans.find(c=>c.id===b.clan)?.leaderId) : null;
                        valA = a.clan > 0 && !a.isDaimyo && a.status !== 'ronin' ? a.getSalary(daimyoA) : 0;
                        valB = b.clan > 0 && !b.isDaimyo && b.status !== 'ronin' ? b.getSalary(daimyoB) : 0;
                    } else {
                        const getAccForSort = (busho) => {
                            const c = this.game.getCastle(busho.castleId);
                            if (c && c.investigatedUntil >= this.game.getCurrentTurnId()) return c.investigatedAccuracy;
                            return acc;
                        };

                        let perceivedA = GameSystem.getPerceivedStatValue(a, this.bushoCurrentSortKey, gunshi, getAccForSort(a), this.game.playerClanId, myDaimyo);
                        let perceivedB = GameSystem.getPerceivedStatValue(b, this.bushoCurrentSortKey, gunshi, getAccForSort(b), this.game.playerClanId, myDaimyo);

                        if (a.clan === this.game.playerClanId && a.isDaimyo) perceivedA = a[this.bushoCurrentSortKey];
                        if (b.clan === this.game.playerClanId && b.isDaimyo) perceivedB = b[this.bushoCurrentSortKey];

                        const isMaskedA = perceivedA === null; const isMaskedB = perceivedB === null;
                        
                        if (isMaskedA && !isMaskedB) return 1;  
                        if (!isMaskedA && isMaskedB) return -1; 
                        
                        const getGradeValue = (val) => {
                            if (val >= 96) return 12; if (val >= 91) return 11; if (val >= 81) return 10; if (val >= 76) return 9;
                            if (val >= 66) return 8; if (val >= 61) return 7; if (val >= 51) return 6; if (val >= 46) return 5;
                            if (val >= 36) return 4; if (val >= 31) return 3; if (val >= 21) return 2; return 1;
                        };

                        if (isMaskedA && isMaskedB) {
                            valA = 0; valB = 0;
                        } else {
                            const gradeA = getGradeValue(perceivedA); const gradeB = getGradeValue(perceivedB);
                            if (gradeA === gradeB) { valA = a[this.bushoCurrentSortKey] || 0; valB = b[this.bushoCurrentSortKey] || 0; } 
                            else { valA = gradeA; valB = gradeB; }
                        }
                    }
                    
                    const checkContent = (val) => {
                        if (val === false || val === '-' || val === '' || val === null || val === undefined) return 0;
                        if (typeof val === 'number') return val;
                        return 1;
                    };
                    valA = checkContent(valA); valB = checkContent(valB);
                    if (valA === valB) return 0; 
                    return this.bushoIsSortAsc ? (valA - valB) : (valB - valA);
                });
                this._saveStableSortResult('busho', displayBushos); // ★結果を保存
            } else {
                if (extraData && extraData.isFactionView) {
                    displayBushos.sort((a, b) => {
                        const selA = (this.bushoSavedSelectedIds || []).includes(a.id) ? 1 : 0;
                        const selB = (this.bushoSavedSelectedIds || []).includes(b.id) ? 1 : 0;
                        if (selA !== selB) return selB - selA;

                        if (a.isFactionLeader && !b.isFactionLeader) return -1;
                        if (!a.isFactionLeader && b.isFactionLeader) return 1;
                        if (a.isDaimyo && !b.isDaimyo) return -1;
                        if (!a.isDaimyo && b.isDaimyo) return 1;
                        return getSortRankClan(b) - getSortRankClan(a);
                    });
                } else if (actionType === 'all_busho_list' && this.bushoCurrentScope === 'all') {
                    displayBushos.sort((a, b) => {
                        const selA = (this.bushoSavedSelectedIds || []).includes(a.id) ? 1 : 0;
                        const selB = (this.bushoSavedSelectedIds || []).includes(b.id) ? 1 : 0;
                        if (selA !== selB) return selB - selA;
                        
                        return getSortRankAll(b) - getSortRankAll(a);
                    });
                } else if (isViewMode) {
                    displayBushos.sort((a, b) => {
                        const selA = (this.bushoSavedSelectedIds || []).includes(a.id) ? 1 : 0;
                        const selB = (this.bushoSavedSelectedIds || []).includes(b.id) ? 1 : 0;
                        if (selA !== selB) return selB - selA;
                        
                        return getSortRankClan(b) - getSortRankClan(a);
                    });
                }
                this._saveStableSortResult('busho', null); // ★リセット
            }

            this.bushoSavedSortedBushos = displayBushos;
            this.bushoLastSortStateKey = currentSortStateKey;
        }

        const getSortMark = (key) => {
            if (this.bushoCurrentSortKey !== key) return '';
            return this.bushoIsSortAsc ? '<span class="sort-mark">▲</span>' : '<span class="sort-mark">▼</span>';
        };

        let headers = [];
        let headerClassStr = "sortable-header";
        let itemClassStr = "";

        if (isViewMode) {
            headerClassStr += " view-mode";
            itemClassStr += " view-mode";
        }
        
        let gridSpStr = "";
        let gridPcStr = "";

        if (this.bushoCurrentTab === 'stats') {
            if (hideActionCol) {
                // 基本タブ・行動列なしの幅（左から：名前, 身分, 統率, 武勇, 内政, 外交, 智謀, 魅力）
                gridSpStr = "2.4fr 1.4fr 1.2fr 1.2fr 1.2fr 1.2fr 1.2fr 1.2fr";
                gridPcStr = "100px 60px 1fr 1fr 1fr 1fr 1fr 1fr";
            } else {
                // 基本タブ・行動列ありの幅（左から：行動, 名前, 身分, 統率, 武勇, 内政, 外交, 智謀, 魅力）
                gridSpStr = "25px 2.4fr 1.4fr 1.2fr 1.2fr 1.2fr 1.2fr 1.2fr 1.2fr";
                gridPcStr = "35px 100px 60px 1fr 1fr 1fr 1fr 1fr 1fr";
            }
            headers = [
                !hideActionCol ? `<span class="col-act" data-sort="action">行動${getSortMark('action')}</span>` : null,
                `<span class="col-name" data-sort="name">名前${getSortMark('name')}</span>`,
                `<span class="col-rank" data-sort="rank">身分${getSortMark('rank')}</span>`,
                `<span class="col-stat" data-sort="leadership">統率${getSortMark('leadership')}</span>`,
                `<span class="col-stat" data-sort="strength">武勇${getSortMark('strength')}</span>`,
                `<span class="col-stat" data-sort="politics">内政${getSortMark('politics')}</span>`,
                `<span class="col-stat" data-sort="diplomacy">外交${getSortMark('diplomacy')}</span>`,
                `<span class="col-stat" data-sort="intelligence">智謀${getSortMark('intelligence')}</span>`,
                `<span class="col-stat" data-sort="charm">魅力${getSortMark('charm')}</span>`
            ].filter(Boolean);
        } else {
            headerClassStr += " status-mode";
            itemClassStr += " status-mode";
            if (hideActionCol) {
                // 状態タブ・行動列なしの幅（左から：名前, 勢力, 所在, 年齢, 一門, 俸禄, 派閥）
                gridSpStr = "2.4fr 2fr 2fr 0.9fr 0.9fr 0.9fr 1.9fr";
                gridPcStr = "100px 140px 140px 50px 50px 60px 1fr";
            } else {
                // 状態タブ・行動列ありの幅（左から：行動, 名前, 勢力, 所在, 年齢, 一門, 俸禄, 派閥）
                gridSpStr = "25px 2.4fr 2fr 2fr 0.9fr 0.9fr 0.9fr 1.9fr";
                gridPcStr = "35px 100px 140px 140px 50px 50px 60px 1fr";
            }
            headers = [
                !hideActionCol ? `<span class="col-act" data-sort="action">行動${getSortMark('action')}</span>` : null,
                `<span class="col-name" data-sort="name">名前${getSortMark('name')}</span>`,
                // 横スクロールに戻す時のために残しておきます： `<span class="col-rank" data-sort="rank">身分${getSortMark('rank')}</span>`,
                `<span class="col-faction" data-sort="faction">勢力${getSortMark('faction')}</span>`,
                `<span class="col-castle" data-sort="castle">所在${getSortMark('castle')}</span>`,
                `<span class="col-age" data-sort="age">年齢${getSortMark('age')}</span>`,
                `<span class="col-family" data-sort="family">一門${getSortMark('family')}</span>`,
                `<span class="col-salary" data-sort="salary">俸禄${getSortMark('salary')}</span>`,
                `<span class="col-faction-leader" data-sort="faction_leader">派閥${getSortMark('faction_leader')}</span>`
            ].filter(Boolean);
        }

        let items = [];
        displayBushos.forEach(b => {
            if (actionType === 'banish' && b.isCastellan) return; 
            if (actionType === 'employ_target' && b.isDaimyo) return;
            if (actionType === 'reward' && b.isDaimyo) return; 
            
            let isSelectable = !b.isActionDone; 
            if (isActionFree) isSelectable = true; 
            
            const isSelected = (this.bushoSavedSelectedIds || []).includes(b.id);
            
            let currentAcc = null;
            const bCastle = this.game.getCastle(b.castleId);
            if (bCastle && bCastle.investigatedUntil >= this.game.getCurrentTurnId()) {
                currentAcc = bCastle.investigatedAccuracy;
            } else if (isEnemyTarget && targetCastle) {
                currentAcc = targetCastle.investigatedAccuracy;
            }
            const getStat = (stat) => GameSystem.getDisplayStatHTML(b, stat, gunshi, currentAcc, this.game.playerClanId, myDaimyo);

            const inputType = isMulti ? 'checkbox' : 'radio';
            let inputHtml = !isViewMode ? `<input type="${inputType}" name="sel_busho" value="${b.id}" ${!isSelectable ? 'disabled' : ''} ${isSelected ? 'checked' : ''} style="display:none;">` : '';

            let cells = [];
            if (this.bushoCurrentTab === 'stats') {
                cells = [
                    !hideActionCol ? `<span class="col-act">${inputHtml}${b.isActionDone?'済':'未'}</span>` : null,
                    `<span class="col-name">${hideActionCol && !isViewMode ? inputHtml : ''}${b.name}</span>`,
                    `<span class="col-rank">${b.getRankName()}</span>`,
                    `<span class="col-stat">${getStat('leadership')}</span>`,
                    `<span class="col-stat">${getStat('strength')}</span>`,
                    `<span class="col-stat">${getStat('politics')}</span>`,
                    `<span class="col-stat">${getStat('diplomacy')}</span>`,
                    `<span class="col-stat">${getStat('intelligence')}</span>`,
                    `<span class="col-stat">${getStat('charm')}</span>`
                ].filter(Boolean);
            } else {
                let forceName = ""; 
                let familyMark = "";
                if (b.belongKunishuId > 0) {
                    const kunishu = this.game.kunishuSystem.getKunishu(b.belongKunishuId);
                    forceName = kunishu ? kunishu.getName(this.game) : "諸勢力";
                } else if (b.clan > 0) {
                    const clan = this.game.clans.find(c => c.id === b.clan);
                    forceName = clan ? clan.name : "大名家";
                    const daimyo = clan ? this.game.getBusho(clan.leaderId) : null;
                    if (daimyo && (b.id === daimyo.id || b.isDaimyo)) { familyMark = "◯"; }
                    else if (daimyo) {
                        const bFamily = Array.isArray(b.familyIds) ? b.familyIds : [];
                        const dFamily = Array.isArray(daimyo.familyIds) ? daimyo.familyIds : [];
                        if (bFamily.includes(daimyo.id) || dFamily.includes(b.id)) familyMark = "◯";
                    }
                }
                const bCastleName = bCastle ? bCastle.name : "";
                const age = b.isAutoLeader ? "" : (this.game.year - b.birthYear + 1);
                let salary = "";
                if (b.clan > 0 && !b.isDaimyo && b.status !== 'ronin') {
                    const clan = this.game.clans.find(c => c.id === b.clan);
                    const daimyo = clan ? this.game.getBusho(clan.leaderId) : null;
                    salary = b.getSalary(daimyo);
                    if (salary === 0) salary = "";
                }
                let factionNameStr = b.factionName || "";
                
                cells = [
                    !hideActionCol ? `<span class="col-act">${inputHtml}${b.isActionDone?'済':'未'}</span>` : null,
                    `<span class="col-name">${hideActionCol && !isViewMode ? inputHtml : ''}${b.name}</span>`,
                    // 横スクロールに戻す時のために残しておきます： `<span class="col-rank">${b.getRankName()}</span>`,
                    `<span class="col-faction">${forceName}</span>`,
                    `<span class="col-castle">${bCastleName}</span>`,
                    `<span class="col-age">${age}</span>`,
                    `<span class="col-family">${familyMark}</span>`,
                    `<span class="col-salary">${salary}</span>`,
                    `<span class="col-faction-leader">${factionNameStr}</span>`
                ].filter(Boolean);
            }
            
            let onClickStr = "";
            let itemClassThis = itemClassStr;
            
            if (!isSelectable && !isViewMode) {
                itemClassThis += " disabled";
            } else {
                if (isSelected) {
                    itemClassThis += " selected";
                }
                
                if (isViewMode) {
                    onClickStr = `window.GameApp.ui.info.showBushoDetailModalById(${b.id})`;
                } else {
                    onClickStr = `window.GameApp.ui.info.handleBushoSelect(event, ${isMulti}, ${spec.costGold || 0}, ${spec.costRice || 0}, '${actionType}')`;
                }
            }

            items.push({
                onClick: onClickStr,
                cells: cells,
                itemClass: itemClassThis
            });
        });
        
        let onConfirmHandler = null;
        if (!isViewMode) {
            onConfirmHandler = () => {
                const inputs = document.querySelectorAll('input[name="sel_busho"]:checked'); 
                if (inputs.length === 0) return;
                const selectedIds = Array.from(inputs).map(i => parseInt(i.value)); 
                this.closeCommonModal(); 
                if (extraData && extraData.onConfirm) {
                    extraData.onConfirm(selectedIds);
                } else {
                    this.game.commandSystem.handleBushoSelection(actionType, selectedIds, targetId, extraData);
                }
            };
        }

        let colStr = "";
        
        // 基本タブ・状態タブの時は横幅の制限を外して画面内に収めます
        // （将来「状態タブ」だけ横スクロールに戻す場合は、ここから `|| this.bushoCurrentTab === 'status'` を消すだけでOK）
        let isFitMode = this.bushoCurrentTab === 'stats' || this.bushoCurrentTab === 'status';
        let minW = isFitMode ? "100%" : (isViewMode ? "700px" : "750px");

        // CSSで見た目を微調整するための目印を追加します
        if (this.bushoCurrentTab === 'stats') {
            headerClassStr += " stats-mode";
            itemClassStr += " stats-mode";
        }

        this._renderListModal({
            title: titleStr,
            tabsHtml: tabsHtml,
            contextHtml: !isViewMode ? infoHtml : null,
            headers: headers,
            headerClass: headerClassStr,
            itemClass: itemClassStr,
            listClass: "",
            items: items,
            scrollPos: scrollPos,
            minWidth: minW,
            gridTemplateSp: gridSpStr,
            gridTemplatePc: gridPcStr,
            onBack: () => {
                if (onBack) onBack(); 
                else if (extraData && extraData.onCancel) extraData.onCancel();
            },
            onConfirm: onConfirmHandler,
            hideBackBtn: extraData && extraData.hideCancel,
            onTabClick: (tabKey) => {
                this._saveBushoSelection();
                this.bushoCurrentTab = tabKey;
                const listEl = document.getElementById('selector-list');
                const scroll = listEl ? listEl.scrollTop : 0;
                this._renderBushoSelector(actionType, targetId, extraData, onBack, scroll);
            },
            onScopeClick: (scopeKey) => {
                this._saveBushoSelection();
                this.bushoCurrentScope = scopeKey;
                const listEl = document.getElementById('selector-list');
                const scroll = listEl ? listEl.scrollTop : 0;
                this._renderBushoSelector(actionType, targetId, extraData, onBack, scroll);
            },
            onSortClick: (sortKey) => {
                this._saveBushoSelection();
                const defaultAscKeys = ['name', 'faction', 'castle', 'faction_leader'];
                const newState = this._toggleSortState(this.bushoCurrentSortKey, this.bushoIsSortAsc, sortKey, defaultAscKeys);
                this.bushoCurrentSortKey = newState.key;
                this.bushoIsSortAsc = newState.isAsc;
                const listEl = document.getElementById('selector-list');
                const scroll = listEl ? listEl.scrollTop : 0;
                this._renderBushoSelector(actionType, targetId, extraData, onBack, scroll);
            }
        });

        this._updateBushoSelectorUI();
    }
});