class UIInfoManager {
    constructor(ui, game) {
        // 元のui.jsとgameの情報を覚えておきます
        this.ui = ui;
        this.game = game;
        this.viewStack = []; // 画面の履歴を覚えるリュックサックです
        this.currentRenderFunc = null; // 今表示している画面の作り方です
    }

    // 共通の枠を開く魔法です
    openUnifiedModal(renderFunc, isBack = false) {
        const modal = document.getElementById('unified-modal');
        if (!modal) return;

        const bodyEl = document.getElementById('unified-body');

        // 戻るボタンで開いた時以外で、すでに画面が開いていれば、今の状態をリュックサックにしまいます
        if (!isBack && !modal.classList.contains('hidden') && this.currentRenderFunc) {
            this.viewStack.push({
                renderFunc: this.currentRenderFunc,
                scrollLeft: bodyEl.scrollLeft,
                scrollTop: bodyEl.scrollTop
            });
        }

        // 新しい画面の作り方を記憶して、実際に画面を作ります
        this.currentRenderFunc = renderFunc;
        renderFunc();
        
        modal.classList.remove('hidden');
    }

    // 1つ前の画面に戻る魔法です
    goBackUnifiedModal() {
        if (window.AudioManager) window.AudioManager.playSE('cancel.ogg');
        
        if (this.viewStack.length > 0) {
            // リュックサックから1つ前の状態を取り出します
            const prevState = this.viewStack.pop();
            // 前の作り方で画面を作り直します
            this.openUnifiedModal(prevState.renderFunc, true);
            
            // ちょっと待ってから、スクロールの位置を復元します
            setTimeout(() => {
                const bodyEl = document.getElementById('unified-body');
                if (bodyEl) {
                    bodyEl.scrollLeft = prevState.scrollLeft;
                    bodyEl.scrollTop = prevState.scrollTop;
                    if (this.unifiedScrollbar) this.unifiedScrollbar.update();
                }
            }, 10);
        } else {
            // リュックサックが空っぽなら、完全に閉じます
            this.closeUnifiedModal();
        }
    }

    // 完全に閉じる魔法です
    closeUnifiedModal() {
        const modal = document.getElementById('unified-modal');
        if (modal) modal.classList.add('hidden');
        this.viewStack = []; // リュックサックを空っぽにします
        this.currentRenderFunc = null;
    }
    
    showDaimyoList() {
        const renderFunc = () => {
            let listHtml = '<div class="daimyo-list-header"><span>勢力名</span><span>当主名</span><span>城数</span><span>威信</span><span>友好度</span><span>関係</span></div>';
            
            const activeClans = this.game.clans.filter(c => c.id !== 0 && this.game.castles.some(cs => cs.ownerClan === c.id));
            
            this.game.updateAllClanPrestige();
            
            const clanDataList = activeClans.map(clan => {
                const leader = this.game.getBusho(clan.leaderId);
                const castlesCount = this.game.castles.filter(c => c.ownerClan === clan.id).length;
                
                return {
                    id: clan.id, 
                    name: clan.name, 
                    leaderName: leader ? leader.name : "不明",
                    power: clan.daimyoPrestige, 
                    castlesCount: castlesCount
                };
            });
            
            const maxPower = clanDataList.length > 0 ? Math.max(...clanDataList.map(c => c.power)) : 1;

            clanDataList.sort((a, b) => {
                if (a.id === this.game.playerClanId) return -1;
                if (b.id === this.game.playerClanId) return 1;
                return b.power - a.power;
            });

            clanDataList.forEach(d => {
                let friendScore = 50;
                let friendStatus = "";
                let statusColor = "";
                let hasRelation = false;
                
                if (d.id !== this.game.playerClanId) {
                    const relation = this.game.getRelation(this.game.playerClanId, d.id);
                    if (relation) {
                        friendScore = relation.sentiment;
                        friendStatus = relation.displayStatus || relation.status; 
                        hasRelation = true;
                        if (friendStatus === '敵対') statusColor = 'color:#d32f2f;';
                        else if (friendStatus === '友好') statusColor = 'color:#388e3c;';
                        else if (['同盟', '支配', '従属', '婚姻'].includes(friendStatus)) statusColor = 'color:#1976d2;';
                    }
                }

                const powerPercent = Math.min(100, (d.power / maxPower) * 100);
                const powerBarHtml = `<div class="bar-bg bar-bg-power"><div class="bar-fill bar-fill-power" style="width:${powerPercent}%;"></div></div>`;

                let friendBarHtml = "";
                if (d.id === this.game.playerClanId) {
                    friendBarHtml = ""; 
                } else {
                    const friendPercent = Math.min(100, Math.max(0, friendScore));
                    friendBarHtml = `<div class="bar-bg bar-bg-friend"><div class="bar-fill bar-fill-friend" style="width:${friendPercent}%;"></div></div>`;
                }

                listHtml += `<div class="daimyo-list-item" style="cursor:pointer;" onclick="if(window.AudioManager) window.AudioManager.playSE('choice.ogg'); window.GameApp.ui.info.showDaimyoDetail(${d.id})"><span class="col-daimyo-name" style="font-weight:bold;">${d.name}</span><span class="col-leader-name">${d.leaderName}</span><span>${d.castlesCount}</span><span>${powerBarHtml}</span><span>${friendBarHtml}</span><span style="${statusColor}">${friendStatus}</span></div>`;
            });

            const itemCount = clanDataList.length;
            for (let i = itemCount; i < 8; i++) {
                listHtml += `<div class="daimyo-list-item" style="cursor:default; pointer-events:none;"><span></span><span></span><span></span><span></span><span></span><span></span></div>`;
            }
            
            // 共通枠へ表示する内容をセットします
            document.getElementById('unified-title').textContent = "勢力一覧";
            document.getElementById('unified-context-info').classList.add('hidden');
            
            const tabsEl = document.getElementById('unified-tabs');
            tabsEl.innerHTML = `<div style="display: flex; gap: 5px;"><button class="busho-tab-btn active" style="cursor: default; pointer-events: none;">基本</button></div>`;
            tabsEl.classList.remove('hidden');
            tabsEl.style.justifyContent = 'flex-start';
            tabsEl.style.paddingLeft = '10px';
            tabsEl.style.alignItems = 'flex-end';

            const bodyEl = document.getElementById('unified-body');
            bodyEl.className = 'daimyo-list-container hide-native-scroll'; // CSSを勢力一覧用にお着替え
            bodyEl.innerHTML = listHtml;
            bodyEl.style.minWidth = '100%';

            // 使わないボタンは隠して、戻るボタンの動きを設定します
            document.getElementById('unified-extra-btn').classList.add('hidden');
            document.getElementById('unified-extra-btn2').classList.add('hidden');
            document.getElementById('unified-confirm-btn').classList.add('hidden');
            const backBtn = document.getElementById('unified-back-btn');
            backBtn.textContent = '閉じる';
            backBtn.onclick = () => {
                if (window.AudioManager) window.AudioManager.playSE('cancel.ogg');
                this.goBackUnifiedModal();
            };

            // スクロールバーの長さを合わせます
            if (window.CustomScrollbar) {
                if (!this.unifiedScrollbar) this.unifiedScrollbar = new CustomScrollbar(bodyEl);
                setTimeout(() => this.unifiedScrollbar.update(), 10);
            }
        };

        // 作り方を教えながら、枠を開く魔法を呼びます
        this.openUnifiedModal(renderFunc);
    }

    showDaimyoDetail(clanId) {
        const renderFunc = () => {
            const clan = this.game.clans.find(c => c.id === clanId);
            if (!clan) return;

            const leader = this.game.getBusho(clan.leaderId);
            const leaderName = leader ? leader.name.replace('|', '') : "不明";
            
            let baseCastleName = "不明";
            if (leader && leader.castleId) {
                const baseCastle = this.game.castles.find(c => c.id === leader.castleId);
                if (baseCastle) {
                    baseCastleName = baseCastle.name;
                }
            }

            const clanCastles = this.game.castles.filter(c => c.ownerClan === clanId);
            const castlesCount = clanCastles.length;
            const bushosCount = this.game.bushos.filter(b => b.clan === clanId && b.status === 'active').length;
            const princessCount = clan.princessIds ? clan.princessIds.length : 0;
            
            let totalGold = 0;
            let totalRice = 0;
            let totalSoldiers = 0;
            let totalHorses = 0;
            let totalGuns = 0;
            let totalGoldIncome = 0;
            let totalRiceIncome = 0;
            
            clanCastles.forEach(c => {
                totalGold += c.gold || 0;
                totalRice += c.rice || 0;
                totalSoldiers += c.soldiers || 0;
                totalHorses += c.horses || 0;
                totalGuns += c.guns || 0;
                totalGoldIncome += GameSystem.calcBaseGoldIncome(c);
                totalRiceIncome += GameSystem.calcBaseRiceIncome(c);
            });

            let ideology = "中道";
            let ideologyClass = "ideology-chudo"; 
            if (leader) {
                if (leader.innovation >= 67) {
                    ideology = "革新";
                    ideologyClass = "ideology-kakushin";
                } else if (leader.innovation <= 33) {
                    ideology = "保守";
                    ideologyClass = "ideology-hoshu";
                }
            }

            let faceSrc = "data/images/faceicons/unknown_face.webp";
            if (leader && leader.faceIcon) {
                faceSrc = `data/images/faceicons/${leader.faceIcon}`;
            }

            // 共通枠への設定
            document.getElementById('unified-title').textContent = "勢力情報";
            document.getElementById('unified-context-info').classList.add('hidden');
            document.getElementById('unified-tabs').classList.add('hidden');

            const bodyEl = document.getElementById('unified-body');
            bodyEl.className = 'modal-body'; // スクロールが効くようにします
            bodyEl.innerHTML = `
                <div class="daimyo-detail-container">
                    <div class="daimyo-detail-header pc-only">
                        <div class="daimyo-detail-name">${clan.name}</div>
                        <div class="daimyo-detail-ideology ${ideologyClass}">${ideology}</div>
                    </div>
                    <div class="daimyo-detail-body">
                        <div class="daimyo-detail-left">
                            <img src="${faceSrc}" class="daimyo-detail-face" onerror="this.src='data/images/faceicons/unknown_face.webp'">
                            <div class="daimyo-detail-header sp-only">
                                <div class="daimyo-detail-name">${clan.name}</div>
                                <div class="daimyo-detail-ideology ${ideologyClass}">${ideology}</div>
                            </div>
                        </div>
                        <div class="daimyo-detail-right">
                            <div class="daimyo-detail-row daimyo-detail-2col">
                                <div class="daimyo-detail-stat-box"><span class="daimyo-detail-label">大名</span><span class="daimyo-detail-value">${leaderName}</span></div>
                                <div class="daimyo-detail-stat-box"><span class="daimyo-detail-label">本拠地</span><span class="daimyo-detail-value">${baseCastleName}</span></div>
                            </div>
                            <div class="daimyo-detail-row daimyo-detail-3col">
                                <div class="daimyo-detail-stat-box"><span class="daimyo-detail-label">城</span><span class="daimyo-detail-value">${castlesCount}</span></div>
                                <div class="daimyo-detail-stat-box"><span class="daimyo-detail-label">武将</span><span class="daimyo-detail-value">${bushosCount}</span></div>
                                <div class="daimyo-detail-stat-box"><span class="daimyo-detail-label">姫</span><span class="daimyo-detail-value">${princessCount}</span></div>
                            </div>
                            <div class="daimyo-detail-row daimyo-detail-2col">
                                <div class="daimyo-detail-stat-box"><span class="daimyo-detail-label">金</span><span class="daimyo-detail-value">${totalGold}</span></div>
                                <div class="daimyo-detail-stat-box"><span class="daimyo-detail-label">兵士</span><span class="daimyo-detail-value">${totalSoldiers}</span></div>
                            </div>
                            <div class="daimyo-detail-row daimyo-detail-2col">
                                <div class="daimyo-detail-stat-box"><span class="daimyo-detail-label">金収入/月</span><span class="daimyo-detail-value">${totalGoldIncome}</span></div>
                                <div class="daimyo-detail-stat-box"><span class="daimyo-detail-label">軍馬</span><span class="daimyo-detail-value">${totalHorses}</span></div>
                            </div>
                            <div class="daimyo-detail-row daimyo-detail-2col">
                                <div class="daimyo-detail-stat-box"><span class="daimyo-detail-label">兵糧</span><span class="daimyo-detail-value">${totalRice}</span></div>
                                <div class="daimyo-detail-stat-box"><span class="daimyo-detail-label">鉄砲</span><span class="daimyo-detail-value">${totalGuns}</span></div>
                            </div>
                            <div class="daimyo-detail-row daimyo-detail-2col">
                                <div class="daimyo-detail-stat-box"><span class="daimyo-detail-label">兵糧収入/年</span><span class="daimyo-detail-value">${totalRiceIncome}</span></div>
                                <div class="daimyo-detail-stat-box" style="visibility: hidden;"></div>
                            </div>
                        </div>
                    </div>
                </div>
            `;

            // 左側にアクションボタン（武将・外交）を置きます
            const btn1 = document.getElementById('unified-extra-btn');
            btn1.textContent = '武将';
            btn1.classList.remove('hidden');
            btn1.onclick = () => {
                if (window.AudioManager) window.AudioManager.playSE('decision.ogg');
                const targetBushos = this.game.bushos.filter(b => b.clan === clanId && b.status === 'active');
                this.openBushoSelector('view_only', null, { 
                    customBushos: targetBushos,
                    customInfoHtml: `<div>${clan.name} 所属武将</div>`
                });
            };

            const btn2 = document.getElementById('unified-extra-btn2');
            btn2.textContent = '外交';
            btn2.classList.remove('hidden');
            btn2.onclick = () => {
                if (window.AudioManager) window.AudioManager.playSE('decision.ogg');
                this.showDiplomacyList(clan.id, clan.name); // 外交も後でこの枠に統合できます！
            };

            document.getElementById('unified-confirm-btn').classList.add('hidden');
            
            const backBtn = document.getElementById('unified-back-btn');
            backBtn.textContent = '戻る';
            backBtn.onclick = () => {
                if (window.AudioManager) window.AudioManager.playSE('cancel.ogg');
                this.goBackUnifiedModal();
            };

            if (window.CustomScrollbar) {
                if (!this.unifiedScrollbar) this.unifiedScrollbar = new CustomScrollbar(bodyEl);
                setTimeout(() => this.unifiedScrollbar.update(), 10);
            }
        };

        this.openUnifiedModal(renderFunc);
    }

    openBushoSelector(actionType, targetId = null, extraData = null, onBack = null) {
        // 大名居城チェックはそのまま残します
        if (actionType === 'appoint' && this.ui.currentCastle) { const isDaimyoHere = this.game.getCastleBushos(this.ui.currentCastle.id).some(b => b.isDaimyo); if (isDaimyoHere) { this.ui.showDialog("大名の居城は城主を変更できません", false); return; } }
        
        this.ui.hideAIGuardTemporarily(); 
        
        const renderFunc = () => {
            const isViewMode = (actionType === 'view_only' || actionType === 'all_busho_list');
            const c = this.ui.currentCastle; 
            
            const data = this.game.commandSystem.getBushoSelectorData(actionType, targetId, extraData, c);
            let bushos = extraData && extraData.customBushos ? extraData.customBushos : data.bushos;
            let infoHtml = extraData && extraData.customInfoHtml ? extraData.customInfoHtml : data.infoHtml;
            let isMulti = data.isMulti;
            let spec = data.spec || {};
            
            document.getElementById('unified-title').textContent = isViewMode ? "武将一覧" : (isMulti ? "武将を選択（複数可）" : "武将を選択");

            const contextEl = document.getElementById('unified-context-info');
            if (isViewMode) {
                contextEl.classList.add('hidden');
            } else {
                contextEl.classList.remove('hidden');
                contextEl.innerHTML = infoHtml;
            }

            let isEnemyTarget = false;
            let targetCastle = null;
            if (['rumor_target_busho','headhunt_target','view_only'].includes(actionType)) {
                isEnemyTarget = true;
                targetCastle = this.game.getCastle(targetId);
            }
            const gunshi = this.game.getClanGunshi(this.game.playerClanId);
            const myDaimyo = this.game.bushos.find(b => b.clan === this.game.playerClanId && b.isDaimyo);
            
            const bodyEl = document.getElementById('unified-body');
            bodyEl.className = 'list-container hide-native-scroll'; // リスト用の服に着替えます

            const updateContextCost = () => { 
                if (!isMulti || !contextEl) return; 
                const checkedCount = bodyEl.querySelectorAll('input[name="sel_busho"]:checked').length; 
                let cost = 0, item = ""; 
                if (spec.costGold > 0) { cost = checkedCount * spec.costGold; item = "金"; }
                if (spec.costRice > 0) { cost = checkedCount * spec.costRice; item = "米"; }
                
                if (cost > 0) {
                     contextEl.innerHTML = `<div>消費予定 ${item}: ${cost} (所持: ${item==='金'?c.gold:c.rice})</div>`; 
                } else if (actionType === 'war_deploy' || actionType === 'def_intercept_deploy' || actionType === 'def_reinf_deploy' || actionType === 'atk_reinf_deploy' || actionType === 'def_self_reinf_deploy' || actionType === 'atk_self_reinf_deploy' || actionType === 'kunishu_subjugate_deploy') {
                     contextEl.innerHTML = `<div>出陣武将: ${checkedCount}名 / 最大5名</div>`;
                }
            };

            const confirmBtn = document.getElementById('unified-confirm-btn');
            const updateBushoConfirmBtn = () => {
                if (!confirmBtn) return;
                if (isViewMode) return; 
                const checkedCount = bodyEl.querySelectorAll('input[name="sel_busho"]:checked').length;
                if (checkedCount > 0) {
                    confirmBtn.disabled = false;
                    confirmBtn.style.opacity = 1.0;
                } else {
                    confirmBtn.disabled = true;
                    confirmBtn.style.opacity = 0.5;
                }
            };

            const tabsEl = document.getElementById('unified-tabs');
            let currentTab = 'stats';
            let currentScope = 'clan'; 
            let currentSortKey = null; 
            let isSortAsc = false;     
            
            if (isViewMode && tabsEl) {
                tabsEl.classList.remove('hidden');
                tabsEl.style.justifyContent = 'flex-start';
                tabsEl.style.paddingLeft = '10px';
                tabsEl.style.alignItems = 'flex-end';
                
                let scopeHtml = '';
                if (actionType === 'all_busho_list') {
                    scopeHtml = `
                        <div style="display: flex; gap: 5px; margin-left: 15px;">
                            <button class="busho-scope-btn active" data-scope="clan">自家</button>
                            <button class="busho-scope-btn" data-scope="all">全国</button>
                        </div>
                    `;
                }
                
                tabsEl.innerHTML = `
                    <div style="display: flex; gap: 5px;">
                        <button class="busho-tab-btn active" data-tab="stats">基本</button>
                        <button class="busho-tab-btn" data-tab="status">状態</button>
                    </div>
                    ${scopeHtml}
                `;
                
                const tabBtns = tabsEl.querySelectorAll('.busho-tab-btn');
                tabBtns.forEach(btn => {
                    btn.onclick = () => {
                        if (window.AudioManager) window.AudioManager.playSE('choice.ogg');
                        tabBtns.forEach(b => b.classList.remove('active'));
                        btn.classList.add('active');
                        currentTab = btn.getAttribute('data-tab');
                        renderList(); 
                    };
                });

                const scopeBtns = tabsEl.querySelectorAll('.busho-scope-btn');
                scopeBtns.forEach(btn => {
                    btn.onclick = () => {
                        if (window.AudioManager) window.AudioManager.playSE('choice.ogg');
                        scopeBtns.forEach(b => b.classList.remove('active'));
                        btn.classList.add('active');
                        currentScope = btn.getAttribute('data-scope');
                        renderList();
                    };
                });
            } else if (tabsEl) {
                tabsEl.classList.add('hidden');
            }

            let savedBushos = null; 
            let lastScope = null;   

            // リストを描画する関数です（今までの処理と同じです）
            const renderList = () => {
                if (!bodyEl) return;
                bodyEl.innerHTML = '';
                
                let displayBushos;
                if (!savedBushos || lastScope !== currentScope) {
                    displayBushos = [...bushos]; 
                    if (actionType === 'all_busho_list' && currentScope === 'all') {
                        displayBushos = this.game.bushos.filter(b => {
                            if (b.status === 'unborn' || b.status === 'dead') return false;
                            if (b.clan > 0 || b.belongKunishuId > 0 || b.status === 'ronin') return true;
                            return false;
                        });
                    }
                    lastScope = currentScope;
                } else {
                    displayBushos = [...savedBushos];
                }

                const getSortRankAll = (b) => {
                    const isGunshi = b.isGunshi || (b.clan > 0 && this.game.clans.find(c => c.id === b.clan)?.gunshiId === b.id);
                    if (b.clan === this.game.playerClanId) {
                        return b.isDaimyo ? 10000 : (b.isCastellan ? 9000 : (isGunshi ? 8500 : 8000));
                    }
                    if (b.clan > 0) return 5000 - b.clan * 10 + (b.isDaimyo ? 3 : (b.isCastellan ? 2 : (isGunshi ? 1.5 : 1)));
                    if (b.belongKunishuId > 0) return 2000 - b.belongKunishuId * 10 + (b.id === (window.GameApp ? window.GameApp.kunishuSystem.getKunishu(b.belongKunishuId)?.leaderId : 0) ? 2 : 1);
                    if (b.status === 'ronin') return 1000;
                    return 0;
                };
                const getSortRankClan = (b) => {
                    const isGunshi = b.isGunshi || (b.clan > 0 && this.game.clans.find(c => c.id === b.clan)?.gunshiId === b.id);
                    if (b.isDaimyo) return 7;
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

                if (currentSortKey) {
                    displayBushos.sort((a, b) => {
                        let valA = 0;
                        let valB = 0;
                        
                        if (currentSortKey === 'action') {
                            valA = a.isActionDone ? 1 : 0;
                            valB = b.isActionDone ? 1 : 0;
                        } else if (currentSortKey === 'name') {
                            const yomiA = a.yomi || a.name || "";
                            const yomiB = b.yomi || b.name || "";
                            let cmp = isSortAsc ? yomiA.localeCompare(yomiB, 'ja') : yomiB.localeCompare(yomiA, 'ja');
                            if (cmp === 0) {
                                const nameA = a.name || "";
                                const nameB = b.name || "";
                                cmp = isSortAsc ? nameA.localeCompare(nameB, 'ja') : nameB.localeCompare(nameA, 'ja');
                            }
                            return cmp;
                        } else if (currentSortKey === 'rank') {
                            valA = getSortRankClan(a);
                            valB = getSortRankClan(b);
                        } else if (currentSortKey === 'faction') {
                            const isRoninA = a.status === 'ronin';
                            const isRoninB = b.status === 'ronin';
                            if (isRoninA && !isRoninB) return 1;
                            if (!isRoninA && isRoninB) return -1;

                            const getFactionInfo = (busho) => {
                                if (busho.belongKunishuId > 0) {
                                    const kunishu = this.game.kunishuSystem.getKunishu(busho.belongKunishuId);
                                    return {
                                        yomi: kunishu ? (kunishu.yomi || kunishu.name || "") : "んんん",
                                        name: kunishu ? (kunishu.name || "") : "んんん"
                                    };
                                } else if (busho.clan > 0) {
                                    const clan = this.game.clans.find(c => c.id === busho.clan);
                                    return {
                                        yomi: clan ? (clan.yomi || clan.name || "") : "んんん",
                                        name: clan ? (clan.name || "") : "んんん"
                                    };
                                }
                                return { yomi: "んんん", name: "んんん" };
                            };
                            const infoA = getFactionInfo(a);
                            const infoB = getFactionInfo(b);
                            let cmp = isSortAsc ? infoA.yomi.localeCompare(infoB.yomi, 'ja') : infoB.yomi.localeCompare(infoA.yomi, 'ja');
                            if (cmp === 0) {
                                cmp = isSortAsc ? infoA.name.localeCompare(infoB.name, 'ja') : infoB.name.localeCompare(infoA.name, 'ja');
                            }
                            return cmp;
                        } else if (currentSortKey === 'castle') {
                            const getCastleInfo = (busho) => {
                                const castle = this.game.getCastle(busho.castleId);
                                return {
                                    yomi: castle ? (castle.yomi || castle.name || "") : "んんん",
                                    name: castle ? (castle.name || "") : "んんん"
                                };
                            };
                            const infoA = getCastleInfo(a);
                            const infoB = getCastleInfo(b);
                            let cmp = isSortAsc ? infoA.yomi.localeCompare(infoB.yomi, 'ja') : infoB.yomi.localeCompare(infoA.yomi, 'ja');
                            if (cmp === 0) {
                                cmp = isSortAsc ? infoA.name.localeCompare(infoB.name, 'ja') : infoB.name.localeCompare(infoA.name, 'ja');
                            }
                            return cmp;
                        } else if (currentSortKey === 'faction_leader') {
                            const getLeaderInfo = (busho) => {
                                if (busho.factionId > 0 && busho.clan > 0) {
                                    const clanBushos = this.game.bushos.filter(b => b.clan === busho.clan && b.status === 'active');
                                    const factionLeaders = clanBushos.filter(b => b.isFactionLeader);
                                    const myLeader = factionLeaders.find(leader => leader.factionId === busho.factionId);
                                    
                                    if (myLeader) {
                                        const sameFamilyLeaders = factionLeaders.filter(leader => leader.familyName && leader.familyName === myLeader.familyName && leader.id !== myLeader.id);
                                        
                                        let yomiStr = "";
                                        let nameStr = "";
                                        if (!myLeader.givenName) {
                                            yomiStr = (myLeader.familyYomi || myLeader.yomi || "") + "は";
                                            nameStr = myLeader.familyName + "派";
                                        } else if (sameFamilyLeaders.length > 0) {
                                            yomiStr = (myLeader.givenYomi || myLeader.yomi || "") + "は";
                                            nameStr = myLeader.givenName + "派";
                                        } else {
                                            yomiStr = (myLeader.familyYomi || myLeader.yomi || "") + "は";
                                            nameStr = myLeader.familyName + "派";
                                        }
                                        return { yomi: yomiStr, name: nameStr };
                                    }
                                }
                                return { yomi: "んんん", name: "んんん" };
                            };
                            const infoA = getLeaderInfo(a);
                            const infoB = getLeaderInfo(b);
                            let cmp = isSortAsc ? infoA.yomi.localeCompare(infoB.yomi, 'ja') : infoB.yomi.localeCompare(infoA.yomi, 'ja');
                            if (cmp === 0) {
                                cmp = isSortAsc ? infoA.name.localeCompare(infoB.name, 'ja') : infoB.name.localeCompare(infoA.name, 'ja');
                            }
                            return cmp;
                        } else if (currentSortKey === 'age') {
                            const isNullA = a.isAutoLeader;
                            const isNullB = b.isAutoLeader;
                            if (isNullA && !isNullB) return 1;
                            if (!isNullA && isNullB) return -1;

                            valA = isNullA ? 0 : this.game.year - a.birthYear;
                            valB = isNullB ? 0 : this.game.year - b.birthYear;
                        } else if (currentSortKey === 'family') {
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
                            valA = checkFamily(a);
                            valB = checkFamily(b);
                        } else if (currentSortKey === 'salary') {
                            const daimyoA = a.clan > 0 ? this.game.getBusho(this.game.clans.find(c=>c.id===a.clan)?.leaderId) : null;
                            const daimyoB = b.clan > 0 ? this.game.getBusho(this.game.clans.find(c=>c.id===b.clan)?.leaderId) : null;
                            valA = a.clan > 0 && !a.isDaimyo && a.status !== 'ronin' ? a.getSalary(daimyoA) : 0;
                            valB = b.clan > 0 && !b.isDaimyo && b.status !== 'ronin' ? b.getSalary(daimyoB) : 0;
                        } else {
                            const getAccForSort = (busho) => {
                                const c = this.game.getCastle(busho.castleId);
                                if (c && c.investigatedUntil >= this.game.getCurrentTurnId()) {
                                    return c.investigatedAccuracy;
                                }
                                return acc;
                            };

                            let perceivedA = GameSystem.getPerceivedStatValue(a, currentSortKey, gunshi, getAccForSort(a), this.game.playerClanId, myDaimyo);
                            let perceivedB = GameSystem.getPerceivedStatValue(b, currentSortKey, gunshi, getAccForSort(b), this.game.playerClanId, myDaimyo);

                            if (a.clan === this.game.playerClanId && a.isDaimyo) perceivedA = a[currentSortKey];
                            if (b.clan === this.game.playerClanId && b.isDaimyo) perceivedB = b[currentSortKey];

                            const isMaskedA = perceivedA === null;
                            const isMaskedB = perceivedB === null;
                            
                            if (isMaskedA && !isMaskedB) return 1;  
                            if (!isMaskedA && isMaskedB) return -1; 
                            
                            const getGradeValue = (val) => {
                                if (val >= 96) return 12; 
                                if (val >= 91) return 11; 
                                if (val >= 81) return 10; 
                                if (val >= 76) return 9;  
                                if (val >= 66) return 8;  
                                if (val >= 61) return 7;  
                                if (val >= 51) return 6;  
                                if (val >= 46) return 5;  
                                if (val >= 36) return 4;  
                                if (val >= 31) return 3;  
                                if (val >= 21) return 2;  
                                return 1;                 
                            };

                            if (isMaskedA && isMaskedB) {
                                valA = 0;
                                valB = 0;
                            } else {
                                const gradeA = getGradeValue(perceivedA);
                                const gradeB = getGradeValue(perceivedB);

                                if (gradeA === gradeB) {
                                    valA = a[currentSortKey] || 0;
                                    valB = b[currentSortKey] || 0;
                                } else {
                                    valA = gradeA;
                                    valB = gradeB;
                                }
                            }
                        }
                        
                        const checkContent = (val) => {
                            if (val === false || val === '-' || val === '' || val === null || val === undefined) return 0;
                            if (typeof val === 'number') return val;
                            return 1;
                        };
                        
                        valA = checkContent(valA);
                        valB = checkContent(valB);
                        
                        if (valA === valB) return 0; 
                        return isSortAsc ? (valA - valB) : (valB - valA);
                    });
                } else {
                    if (extraData && extraData.isFactionView) {
                        displayBushos.sort((a, b) => {
                            if (a.isFactionLeader && !b.isFactionLeader) return -1;
                            if (!a.isFactionLeader && b.isFactionLeader) return 1;
                            if (a.isDaimyo && !b.isDaimyo) return -1;
                            if (!a.isDaimyo && b.isDaimyo) return 1;
                            return getSortRankClan(b) - getSortRankClan(a);
                        });
                    } else if (actionType === 'all_busho_list' && currentScope === 'all') {
                        displayBushos.sort((a, b) => getSortRankAll(b) - getSortRankAll(a));
                    } else if (actionType === 'view_only' || actionType === 'all_busho_list') {
                        displayBushos.sort((a, b) => getSortRankClan(b) - getSortRankClan(a));
                    }
                }

                savedBushos = [...displayBushos];

                const getSortMark = (key) => {
                    if (currentSortKey !== key) return '';
                    return isSortAsc ? ' ▲' : ' ▼';
                };
                
                if (currentTab === 'stats') {
                    if (isViewMode) {
                        bodyEl.innerHTML = `
                            <div class="list-header sortable-header view-mode" style="align-items: center;">
                                <span class="col-name" data-sort="name">名前${getSortMark('name')}</span><span class="col-rank" data-sort="rank">身分${getSortMark('rank')}</span><span class="col-stat" data-sort="leadership">統率${getSortMark('leadership')}</span><span class="col-stat" data-sort="strength">武勇${getSortMark('strength')}</span><span class="col-stat" data-sort="politics">内政${getSortMark('politics')}</span><span class="col-stat" data-sort="diplomacy">外交${getSortMark('diplomacy')}</span><span class="col-stat" data-sort="intelligence">智謀${getSortMark('intelligence')}</span><span class="col-stat" data-sort="charm">魅力${getSortMark('charm')}</span>
                            </div>
                        `;
                    } else {
                        bodyEl.innerHTML = `
                            <div class="list-header sortable-header" style="align-items: center;">
                                <span class="col-act" data-sort="action">行動${getSortMark('action')}</span><span class="col-name" data-sort="name">名前${getSortMark('name')}</span><span class="col-rank" data-sort="rank">身分${getSortMark('rank')}</span><span class="col-stat" data-sort="leadership">統率${getSortMark('leadership')}</span><span class="col-stat" data-sort="strength">武勇${getSortMark('strength')}</span><span class="col-stat" data-sort="politics">内政${getSortMark('politics')}</span><span class="col-stat" data-sort="diplomacy">外交${getSortMark('diplomacy')}</span><span class="col-stat" data-sort="intelligence">智謀${getSortMark('intelligence')}</span><span class="col-stat" data-sort="charm">魅力${getSortMark('charm')}</span>
                            </div>
                        `;
                    }
                } else {
                    if (isViewMode) {
                        bodyEl.innerHTML = `
                            <div class="list-header status-mode sortable-header view-mode" style="grid-template-columns: 1.5fr 1fr 1.5fr 1.5fr 0.8fr 0.8fr 0.8fr 1fr 1.5fr 0.2fr; align-items: center; min-width: 900px;">
                                <span class="col-name" data-sort="name">名前${getSortMark('name')}</span><span class="col-rank" data-sort="rank">身分${getSortMark('rank')}</span><span class="col-faction" data-sort="faction">勢力${getSortMark('faction')}</span><span class="col-castle" data-sort="castle">所在${getSortMark('castle')}</span><span class="col-act" data-sort="action">行動${getSortMark('action')}</span><span class="col-age" data-sort="age">年齢${getSortMark('age')}</span><span class="col-family" data-sort="family">一門${getSortMark('family')}</span><span class="col-salary" data-sort="salary">俸禄${getSortMark('salary')}</span><span class="col-faction-leader" data-sort="faction_leader">派閥${getSortMark('faction_leader')}</span><span></span>
                            </div>
                        `;
                    } else {
                        bodyEl.innerHTML = `
                            <div class="list-header status-mode sortable-header" style="grid-template-columns: 1.5fr 1fr 1.5fr 1.5fr 0.8fr 0.8fr 1fr 1.5fr 0.2fr; align-items: center; min-width: 850px;">
                                <span class="col-name" data-sort="name">名前${getSortMark('name')}</span><span class="col-rank" data-sort="rank">身分${getSortMark('rank')}</span><span class="col-faction" data-sort="faction">勢力${getSortMark('faction')}</span><span class="col-castle" data-sort="castle">所在${getSortMark('castle')}</span><span class="col-age" data-sort="age">年齢${getSortMark('age')}</span><span class="col-family" data-sort="family">一門${getSortMark('family')}</span><span class="col-salary" data-sort="salary">俸禄${getSortMark('salary')}</span><span class="col-faction-leader" data-sort="faction_leader">派閥${getSortMark('faction_leader')}</span><span></span>
                            </div>
                        `;
                    }
                }

                const headerSpans = bodyEl.querySelectorAll('.sortable-header span[data-sort]');
                headerSpans.forEach(span => {
                    span.onclick = (e) => {
                        const key = e.currentTarget.getAttribute('data-sort');
                        if (!key) return;
                        if (window.AudioManager) window.AudioManager.playSE('choice.ogg');
                        
                        if (currentSortKey === key) {
                            isSortAsc = !isSortAsc;
                        } else {
                            currentSortKey = key;
                            isSortAsc = false; 
                            if (['name', 'faction', 'castle', 'faction_leader'].includes(key)) {
                                isSortAsc = true;
                            }
                        }
                        renderList(); 
                    };
                });

                displayBushos.forEach(b => {
                    if (actionType === 'banish' && b.isCastellan) return; 
                    if (actionType === 'employ_target' && b.isDaimyo) return;
                    if (actionType === 'reward' && b.isDaimyo) return; 
                    
                    let isSelectable = !b.isActionDone; 
                    if (extraData && extraData.allowDone) isSelectable = true; 
                    if (['appoint','employ_target','appoint_gunshi','rumor_target_busho','headhunt_target','interview','interview_target','reward','view_only','war_general', 'kunishu_war_general', 'all_busho_list', 'marriage_princess', 'marriage_kinsman'].includes(actionType)) isSelectable = true;
                    if (actionType === 'def_intercept_deploy' || actionType === 'def_reinf_deploy' || actionType === 'atk_reinf_deploy') isSelectable = true;
                    
                    let currentAcc = null;
                    const bCastle = this.game.getCastle(b.castleId);
                    if (bCastle && bCastle.investigatedUntil >= this.game.getCurrentTurnId()) {
                        currentAcc = bCastle.investigatedAccuracy;
                    } else if (isEnemyTarget && targetCastle) {
                        currentAcc = targetCastle.investigatedAccuracy;
                    }
                    const getStat = (stat) => GameSystem.getDisplayStatHTML(b, stat, gunshi, currentAcc, this.game.playerClanId, myDaimyo);

                    const div = document.createElement('div'); 
                    div.className = `select-item ${!isSelectable ? 'disabled' : ''}`;
                    
                    if (currentTab === 'status') {
                        div.classList.add('status-mode');
                        if (isViewMode) {
                            div.style.gridTemplateColumns = "1.5fr 1fr 1.5fr 1.5fr 0.8fr 0.8fr 0.8fr 1fr 1.5fr 0.2fr";
                            div.style.minWidth = "900px";
                        } else {
                            div.style.gridTemplateColumns = "1.5fr 1fr 1.5fr 1.5fr 0.8fr 0.8fr 1fr 1.5fr 0.2fr";
                            div.style.minWidth = "850px";
                        }
                    }
                    if (isViewMode) div.classList.add('view-mode');

                    const inputType = isMulti ? 'checkbox' : 'radio';
                    
                    let inputHtml = '';
                    if (!isViewMode) {
                        inputHtml = `<input type="${inputType}" name="sel_busho" value="${b.id}" ${!isSelectable ? 'disabled' : ''} style="display:none;">`;
                    }
                    
                    if (currentTab === 'stats') {
                        if (isViewMode) {
                            div.innerHTML = `<span class="col-name">${b.name}</span><span class="col-rank">${b.getRankName()}</span><span class="col-stat">${getStat('leadership')}</span><span class="col-stat">${getStat('strength')}</span><span class="col-stat">${getStat('politics')}</span><span class="col-stat">${getStat('diplomacy')}</span><span class="col-stat">${getStat('intelligence')}</span><span class="col-stat">${getStat('charm')}</span>`;
                        } else {
                            div.innerHTML = `<span class="col-act">${inputHtml}${b.isActionDone?'済':'未'}</span><span class="col-name">${b.name}</span><span class="col-rank">${b.getRankName()}</span><span class="col-stat">${getStat('leadership')}</span><span class="col-stat">${getStat('strength')}</span><span class="col-stat">${getStat('politics')}</span><span class="col-stat">${getStat('diplomacy')}</span><span class="col-stat">${getStat('intelligence')}</span><span class="col-stat">${getStat('charm')}</span>`;
                        }
                    } else {
                        let forceName = "-"; 
                        let familyMark = "";
                        
                        if (b.belongKunishuId > 0) {
                            const kunishu = this.game.kunishuSystem.getKunishu(b.belongKunishuId);
                            forceName = kunishu ? kunishu.getName(this.game) : "諸勢力";
                        } else if (b.clan > 0) {
                            const clan = this.game.clans.find(c => c.id === b.clan);
                            forceName = clan ? clan.name : "大名家";
                            
                            const daimyo = clan ? this.game.getBusho(clan.leaderId) : null;
                            if (daimyo && (b.id === daimyo.id || b.isDaimyo)) {
                                familyMark = "◯";
                            } else if (daimyo) {
                                const bFamily = Array.isArray(b.familyIds) ? b.familyIds : [];
                                const dFamily = Array.isArray(daimyo.familyIds) ? daimyo.familyIds : [];
                                if (bFamily.includes(daimyo.id) || dFamily.includes(b.id)) {
                                    familyMark = "◯";
                                }
                            }
                        }
                        
                        const bCastle = this.game.getCastle(b.castleId);
                        const bCastleName = bCastle ? bCastle.name : "-";
                        const age = b.isAutoLeader ? "-" : (this.game.year - b.birthYear);
                        
                        let salary = "-";
                        if (b.clan > 0 && !b.isDaimyo && b.status !== 'ronin') {
                            const clan = this.game.clans.find(c => c.id === b.clan);
                            const daimyo = clan ? this.game.getBusho(clan.leaderId) : null;
                            salary = b.getSalary(daimyo);
                            if (salary === 0) salary = "-";
                        }

                        let factionNameStr = "-";
                        if (b.factionId > 0 && b.clan > 0) {
                            const clanBushos = this.game.bushos.filter(busho => busho.clan === b.clan && busho.status === 'active');
                            const factionLeaders = clanBushos.filter(busho => busho.isFactionLeader);
                            const myLeader = factionLeaders.find(leader => leader.factionId === b.factionId);
                            
                            if (myLeader) {
                                const sameFamilyLeaders = factionLeaders.filter(leader => leader.familyName && leader.familyName === myLeader.familyName && leader.id !== myLeader.id);
                                
                                if (!myLeader.givenName) {
                                    factionNameStr = myLeader.familyName + "派";
                                } else if (sameFamilyLeaders.length > 0) {
                                    factionNameStr = myLeader.givenName + "派";
                                } else {
                                    factionNameStr = myLeader.familyName + "派";
                                }
                            }
                        }

                        if (isViewMode) {
                            div.innerHTML = `<span class="col-name">${b.name}</span><span class="col-rank">${b.getRankName()}</span><span class="col-faction">${forceName}</span><span class="col-castle">${bCastleName}</span><span class="col-act">${b.isActionDone?'済':'未'}</span><span class="col-age">${age}</span><span class="col-family">${familyMark}</span><span class="col-salary">${salary}</span><span class="col-faction-leader">${factionNameStr}</span><span></span>`;
                        } else {
                            div.innerHTML = `<span class="col-name">${inputHtml}${b.name}</span><span class="col-rank">${b.getRankName()}</span><span class="col-faction">${forceName}</span><span class="col-castle">${bCastleName}</span><span class="col-age">${age}</span><span class="col-family">${familyMark}</span><span class="col-salary">${salary}</span><span class="col-faction-leader">${factionNameStr}</span><span></span>`;
                        }
                    }
                    
                    if (actionType === 'view_only' || actionType === 'all_busho_list') {
                        div.onclick = () => {
                            if (window.AudioManager) window.AudioManager.playSE('choice.ogg');
                            this.ui.showBushoDetailModal(b);
                        };
                        div.style.cursor = 'pointer'; 
                    } else if (isSelectable) { 
                        div.onclick = (e) => {
                            if (window.AudioManager) window.AudioManager.playSE('choice.ogg');

                            if(e.target.tagName === 'INPUT') { 
                                if(!isMulti) {
                                    const siblings = bodyEl.querySelectorAll('.select-item');
                                    siblings.forEach(el => el.classList.remove('selected'));
                                } else {
                                     const maxSelect = (actionType === 'war_deploy' || actionType === 'def_intercept_deploy' || actionType === 'def_reinf_deploy' || actionType === 'atk_reinf_deploy' || actionType === 'def_self_reinf_deploy' || actionType === 'atk_self_reinf_deploy' || actionType === 'kunishu_subjugate_deploy') ? 5 : 999;
                                     const currentChecked = bodyEl.querySelectorAll('input[name="sel_busho"]:checked').length;
                                     if(e.target.checked && currentChecked > maxSelect) {
                                         e.target.checked = false;
                                         this.ui.showDialog(`出陣できる武将は最大${maxSelect}名までです。`, false);
                                         return;
                                     }

                                     if (e.target.checked) {
                                         if (spec.costGold > 0 && currentChecked * spec.costGold > c.gold) {
                                             e.target.checked = false; 
                                             this.ui.showDialog(`金が足りないため、これ以上選べません。`, false);
                                             return;
                                         }
                                         if (spec.costRice > 0 && currentChecked * spec.costRice > c.rice) {
                                             e.target.checked = false; 
                                             this.ui.showDialog(`兵糧が足りないため、これ以上選べません。`, false);
                                             return;
                                         }
                                     }
                                }
                                if(e.target.checked) div.classList.add('selected');
                                else div.classList.remove('selected');
                                updateContextCost();
                                updateBushoConfirmBtn(); 
                                return;
                            } 
                            
                            const input = div.querySelector('input');
                            if(input) {
                                if (isMulti) { 
                                     const maxSelect = (actionType === 'war_deploy' || actionType === 'def_intercept_deploy' || actionType === 'def_reinf_deploy' || actionType === 'atk_reinf_deploy' || actionType === 'def_self_reinf_deploy' || actionType === 'atk_self_reinf_deploy' || actionType === 'kunishu_subjugate_deploy') ? 5 : 999;
                                     const currentChecked = bodyEl.querySelectorAll('input[name="sel_busho"]:checked').length;
                                     if(!input.checked && currentChecked >= maxSelect) {
                                         this.ui.showDialog(`出陣できる武将は最大${maxSelect}名までです。`, false);
                                         return;
                                     }

                                     if (!input.checked) {
                                         if (spec.costGold > 0 && (currentChecked + 1) * spec.costGold > c.gold) {
                                             this.ui.showDialog(`金が足りないため、これ以上選べません。`, false);
                                             return;
                                         }
                                         if (spec.costRice > 0 && (currentChecked + 1) * spec.costRice > c.rice) {
                                             this.ui.showDialog(`兵糧が足りないため、これ以上選べません。`, false);
                                             return;
                                         }
                                     }

                                     input.checked = !input.checked; 
                                } else { 
                                     input.checked = true; const allItems = bodyEl.querySelectorAll('.select-item'); allItems.forEach(item => item.classList.remove('selected')); 
                                }
                                if(input.checked) div.classList.add('selected'); else div.classList.remove('selected');
                                updateContextCost(); 
                                updateBushoConfirmBtn(); 
                            }
                        };
                    }
                    bodyEl.appendChild(div);
                });
                
                let itemCount = displayBushos.length;
                if (itemCount === 0 && bodyEl) {
                    bodyEl.innerHTML = "<div style='padding:10px;'>対象となる武将がいません</div>";
                    itemCount = 1;
                }
                
                for (let i = itemCount; i < 8; i++) {
                    const dummyDiv = document.createElement('div');
                    dummyDiv.className = 'select-item';
                    dummyDiv.style.cursor = 'default';
                    dummyDiv.style.pointerEvents = 'none';
                    if (currentTab === 'status') {
                        dummyDiv.classList.add('status-mode');
                        if (isViewMode) {
                            dummyDiv.style.gridTemplateColumns = "1.5fr 1fr 1.5fr 1.5fr 0.8fr 0.8fr 0.8fr 1fr 1.5fr 0.2fr";
                            dummyDiv.style.minWidth = "900px";
                        } else {
                            dummyDiv.style.gridTemplateColumns = "1.5fr 1fr 1.5fr 1.5fr 0.8fr 0.8fr 1fr 1.5fr 0.2fr";
                            dummyDiv.style.minWidth = "850px";
                        }
                    }
                    if (isViewMode) dummyDiv.classList.add('view-mode');
                    
                    let dummySpans = "";
                    if (currentTab === 'stats') {
                        if (isViewMode) dummySpans = "<span></span><span></span><span></span><span></span><span></span><span></span><span></span><span></span>";
                        else dummySpans = "<span></span><span></span><span></span><span></span><span></span><span></span><span></span><span></span><span></span>";
                    } else {
                        if (isViewMode) dummySpans = "<span></span><span></span><span></span><span></span><span></span><span></span><span></span><span></span><span></span><span></span>";
                        else dummySpans = "<span></span><span></span><span></span><span></span><span></span><span></span><span></span><span></span><span></span>";
                    }
                    dummyDiv.innerHTML = dummySpans;
                    bodyEl.appendChild(dummyDiv);
                }
                
                if (window.CustomScrollbar) {
                    if (!this.unifiedScrollbar) this.unifiedScrollbar = new CustomScrollbar(bodyEl);
                    setTimeout(() => this.unifiedScrollbar.update(), 10);
                }
            };

            // ここで一度中身を作ります
            renderList();

            // 不要なボタンを隠して、決定と戻るを設定します
            document.getElementById('unified-extra-btn').classList.add('hidden');
            document.getElementById('unified-extra-btn2').classList.add('hidden');

            const backBtn = document.getElementById('unified-back-btn');
            if (extraData && extraData.hideCancel) {
                backBtn.style.display = 'none';
            } else {
                backBtn.style.display = ''; 
                backBtn.textContent = isViewMode ? '閉じる' : '戻る';
                backBtn.onclick = () => {
                    if (window.AudioManager) window.AudioManager.playSE('cancel.ogg');
                    if (onBack) {
                        onBack(); 
                    } else if (extraData && extraData.onCancel) {
                        extraData.onCancel(); 
                    }
                    this.goBackUnifiedModal();
                };
            }

            if (confirmBtn) {
                if (isViewMode) {
                    confirmBtn.classList.add('hidden'); 
                } else {
                    confirmBtn.classList.remove('hidden');
                    updateBushoConfirmBtn();

                    confirmBtn.onclick = () => {
                        const inputs = document.querySelectorAll('input[name="sel_busho"]:checked'); if (inputs.length === 0) return;
                        const selectedIds = Array.from(inputs).map(i => parseInt(i.value)); 
                        // 完全に閉じてから、決定した動きに進みます
                        this.closeUnifiedModal();
                        if (extraData && extraData.onConfirm) {
                            extraData.onConfirm(selectedIds);
                        } else {
                            this.game.commandSystem.handleBushoSelection(actionType, selectedIds, targetId, extraData);
                        }
                    };
                }
            }
        };

        this.openUnifiedModal(renderFunc);
    }
    
    // ==========================================
    // ★ここから追加：数量選択（スライダー）の魔法です！
    // ==========================================
    openQuantitySelector(type, data, targetId, extraData = null) {
        if (!this.ui.quantityModal) return;
        this.ui.hideAIGuardTemporarily(); // ★これを追加します！
        
        // ★追加：複数スライダーの時だけ全画面にするための目印をつけます
        const isMultiMode = ['war_supplies', 'def_intercept', 'def_reinf_supplies', 'atk_reinf_supplies', 'def_self_reinf_supplies', 'atk_self_reinf_supplies', 'transport'].includes(type);
        if (isMultiMode) {
            this.ui.quantityModal.classList.add('multi-slider-mode');
        } else {
            this.ui.quantityModal.classList.remove('multi-slider-mode');
        }

        this.ui.quantityModal.classList.remove('hidden'); 
        if (this.ui.quantityContainer) this.ui.quantityContainer.innerHTML = '';
        if (this.ui.charityTypeSelector) this.ui.charityTypeSelector.classList.add('hidden'); 
        if (this.ui.tradeTypeInfo) this.ui.tradeTypeInfo.classList.add('hidden'); 
        const c = this.ui.currentCastle;

        const checkValidQuantity = () => {
            if (!this.ui.quantityConfirmBtn) return;
            let isValid = true;

            if (type === 'transport') {
                const g = parseInt(document.getElementById('num-gold')?.value) || 0;
                const r = parseInt(document.getElementById('num-rice')?.value) || 0;
                const s = parseInt(document.getElementById('num-soldiers')?.value) || 0;
                const h = parseInt(document.getElementById('num-horses')?.value) || 0;
                const gun = parseInt(document.getElementById('num-guns')?.value) || 0;
                if (g === 0 && r === 0 && s === 0 && h === 0 && gun === 0) isValid = false;
            } else if (type === 'headhunt_gold' || type === 'charity') {
                isValid = true; 
            } else if (type === 'war_supplies' || type === 'def_intercept' || type === 'def_reinf_supplies' || type === 'atk_reinf_supplies') {
                const s = parseInt(document.getElementById('num-soldiers')?.value) || 0;
                if (s <= 0) isValid = false; 
            } else {
                const inputsEl = document.querySelectorAll('.qty-control input[type="number"]');
                if (inputsEl.length > 0) {
                    const val = parseInt(inputsEl[0].value) || 0;
                    if (val <= 0) isValid = false;
                }
            }

            if (isValid) {
                this.ui.quantityConfirmBtn.disabled = false;
                this.ui.quantityConfirmBtn.style.opacity = 1.0;
            } else {
                this.ui.quantityConfirmBtn.disabled = true;
                this.ui.quantityConfirmBtn.style.opacity = 0.5;
            }

            // ★追加：複数スライダーの時の、上部の「残数」表示をパタパタ更新します！
            if (['war_supplies', 'def_intercept', 'def_reinf_supplies', 'atk_reinf_supplies', 'def_self_reinf_supplies', 'atk_self_reinf_supplies', 'transport'].includes(type)) {
                let sCastle = c;
                if (type === 'def_intercept') sCastle = (data && data.length > 0) ? data[0] : c;
                if (type === 'def_reinf_supplies' || type === 'atk_reinf_supplies' || type === 'def_self_reinf_supplies' || type === 'atk_self_reinf_supplies') sCastle = (data && data.length > 0) ? data[0] : c;
                
                const updateStock = (id, baseVal) => {
                    const el = document.getElementById(`multi-stock-${id}`);
                    if (el) {
                        const v = parseInt(document.getElementById(`num-${id}`)?.value) || 0;
                        el.textContent = baseVal - v;
                    }
                };
                updateStock('gold', sCastle.gold);
                updateStock('rice', sCastle.rice);
                updateStock('soldiers', sCastle.soldiers);
                updateStock('horses', sCastle.horses || 0);
                updateStock('guns', sCastle.guns || 0);
            }

            // ★追加：スライダーを動かすたびに呼ばれるこの場所で、必要資金を計算してパタパタ表示します！
            const displayEl = document.getElementById('dynamic-cost-display');
            if (displayEl) {
                // 計算に使うために、大名と城主をここでも探しておきます
                const daimyo = this.game.bushos.find(b => b.clan === c.ownerClan && b.isDaimyo);
                const castellan = this.game.getBusho(c.castellanId);
                
                // ★修正：「金」が上、「アイテム」が下になるように２行の順番を入れ替えました！
                const makeGrid = (itemName, afterItem, afterGold) => {
                    return `
                        <div style="display: inline-grid; grid-template-columns: max-content max-content minmax(3em, auto); column-gap: 1em; text-align: left;">
                            <div>　金</div>
                            <div>▶</div>
                            <div style="text-align: right;">${Math.floor(afterGold)}</div>
                            <div>${itemName}</div>
                            <div>▶</div>
                            <div style="text-align: right;">${Math.floor(afterItem)}</div>
                        </div>
                    `;
                };
                
                if (type === 'draft') {
                    const amount = parseInt(document.getElementById('num-soldiers')?.value) || 0;
                    const busho = this.game.getBusho(data[0]);
                    const cost = GameSystem.calcDraftCost(amount, busho, c.peoplesLoyalty);
                    displayEl.innerHTML = makeGrid("兵士", c.soldiers + amount, c.gold - cost);
                } else if (type === 'buy_rice') {
                    const amount = parseInt(document.getElementById('num-amount')?.value) || 0;
                    let rate = 1.0;
                    if (c && this.game.provinces) {
                        const province = this.game.provinces.find(p => p.id === c.provinceId);
                        if (province && province.marketRate !== undefined) rate = province.marketRate;
                    }
                    const cost = Math.ceil(amount * rate);
                    displayEl.innerHTML = makeGrid("兵糧", c.rice + amount, c.gold - cost);
                } else if (type === 'sell_rice') {
                    const amount = parseInt(document.getElementById('num-amount')?.value) || 0;
                    let rate = 1.0;
                    if (c && this.game.provinces) {
                        const province = this.game.provinces.find(p => p.id === c.provinceId);
                        if (province && province.marketRate !== undefined) rate = province.marketRate;
                    }
                    const profit = Math.floor(amount * rate);
                    displayEl.innerHTML = makeGrid("兵糧", c.rice - amount, c.gold + profit);
                } else if (type === 'buy_horses') {
                    const amount = parseInt(document.getElementById('num-amount')?.value) || 0;
                    const cost = GameSystem.calcBuyHorseCost(amount, daimyo, castellan);
                    displayEl.innerHTML = makeGrid("軍馬", (c.horses || 0) + amount, c.gold - cost);
                } else if (type === 'buy_guns') {
                    const amount = parseInt(document.getElementById('num-amount')?.value) || 0;
                    const cost = GameSystem.calcBuyGunCost(amount, daimyo, castellan);
                    displayEl.innerHTML = makeGrid("鉄砲", (c.guns || 0) + amount, c.gold - cost);
                }
            }
        };
        
        const createSlider = (label, id, max, currentVal, minVal = 0, isTransport = false, targetCurrent = 0, targetMaxLimit = 99999) => {
            const wrap = document.createElement('div');
            wrap.className = 'qty-row';
            
            const isSingle = !(['war_supplies', 'def_intercept', 'def_reinf_supplies', 'atk_reinf_supplies', 'def_self_reinf_supplies', 'atk_self_reinf_supplies', 'transport'].includes(type));
            
            // ボタンの位置と表示を自動で切り替える仕組み
            const updateButtons = (v) => {
                const bMin = wrap.querySelector(`#btn-min-${id}`);
                const bHalf = wrap.querySelector(`#btn-half-${id}`);
                const bMax = wrap.querySelector(`#btn-max-${id}`);
                const currentMax = isTransport ? Math.min(max, targetMaxLimit - targetCurrent) : max;
                const currentMin = isTransport ? 0 : minVal;

                // 変更できない状態（0の時など）
                if (currentMax <= currentMin) {
                    if (bMin) { bMin.style.display = ''; bMin.disabled = true; bMin.style.order = 1; }
                    if (bHalf) { bHalf.style.display = ''; bHalf.disabled = true; bHalf.style.order = 3; }
                    if (bMax) { bMax.style.display = 'none'; }
                    return;
                }

                if (v <= currentMin) {
                    // 最小の時：「最小(無効)」ゲージ「半分(有効)」を表示
                    if (bMin) { bMin.style.display = ''; bMin.disabled = true; bMin.style.order = 1; }
                    if (bHalf) { bHalf.style.display = ''; bHalf.disabled = false; bHalf.style.order = 3; }
                    if (bMax) { bMax.style.display = 'none'; }
                } else if (v >= currentMax) {
                    // 最大の時：「半分(有効)」ゲージ「最大(無効)」を表示
                    if (bMin) { bMin.style.display = 'none'; }
                    if (bHalf) { bHalf.style.display = ''; bHalf.disabled = false; bHalf.style.order = 1; }
                    if (bMax) { bMax.style.display = ''; bMax.disabled = true; bMax.style.order = 3; }
                } else {
                    // 中間の時：「最小(有効)」ゲージ「最大(有効)」を表示
                    if (bMin) { bMin.style.display = ''; bMin.disabled = false; bMin.style.order = 1; }
                    if (bHalf) { bHalf.style.display = 'none'; }
                    if (bMax) { bMax.style.display = ''; bMax.disabled = false; bMax.style.order = 3; }
                }
            };
            
            if (isTransport) {
                const actualMaxTransport = Math.min(max, targetMaxLimit - targetCurrent);
                wrap.innerHTML = `
                    <div class="slider-row-label">${label}</div>
                    <div class="qty-control" style="display:flex; align-items:center; gap:5px;">
                        <button class="qty-shortcut-btn" id="btn-min-${id}" style="order:1;">最小</button>
                        <button class="qty-shortcut-btn" id="btn-half-${id}" style="order:3;">半分</button>
                        <input type="range" id="range-${id}" min="0" max="${actualMaxTransport}" value="0" style="flex:1; order:2;">
                        <button class="qty-shortcut-btn" id="btn-max-${id}" style="order:3;">最大</button>
                        <input type="number" id="num-tgt-${id}" min="${targetCurrent}" max="${targetCurrent + actualMaxTransport}" value="${targetCurrent}" style="order:4;">
                        <input type="hidden" id="num-${id}" value="0">
                    </div>
                `;
                
                const range = wrap.querySelector(`#range-${id}`);
                const numTgt = wrap.querySelector(`#num-tgt-${id}`);
                const numHidden = wrap.querySelector(`#num-${id}`);
                
                const setVal = (v) => {
                    if (v < 0) v = 0;
                    if (v > actualMaxTransport) v = actualMaxTransport;
                    range.value = v;
                    numHidden.value = v;
                    numTgt.value = targetCurrent + v;
                    updateButtons(v);
                    checkValidQuantity();
                };

                wrap.querySelector(`#btn-min-${id}`).onclick = () => setVal(0);
                wrap.querySelector(`#btn-half-${id}`).onclick = () => setVal(Math.floor(actualMaxTransport / 2));
                wrap.querySelector(`#btn-max-${id}`).onclick = () => setVal(actualMaxTransport);

                const rangeHandler = () => { 
                    let v = parseInt(range.value);
                    if (v > 0 && v < actualMaxTransport) { 
                        if (actualMaxTransport <= 999) {
                            v = Math.round(v / 10) * 10; 
                        } else {
                            v = Math.round(v / 100) * 100; 
                        }
                    }
                    
                    // 【追加】ここで上限・下限を超えないようにブロックします
                    if (v > actualMaxTransport) v = actualMaxTransport;
                    if (v < 0) v = 0;
                    
                    range.value = v;
                    numHidden.value = v;
                    numTgt.value = targetCurrent + v;
                    updateButtons(v);
                    checkValidQuantity(); 
                };
                range.oninput = rangeHandler;
                range.onchange = rangeHandler; // ★スマホで指を離した時の最終確認

                const numTgtHandler = () => {
                    let v = parseInt(numTgt.value);
                    if (isNaN(v)) return;
                    if (v < targetCurrent) v = targetCurrent;
                    if (v > targetCurrent + actualMaxTransport) v = targetCurrent + actualMaxTransport;
                    const transAmount = v - targetCurrent;
                    range.value = transAmount;
                    numHidden.value = transAmount;
                    updateButtons(transAmount);
                    checkValidQuantity();
                };
                numTgt.oninput = numTgtHandler;
                numTgt.onchange = numTgtHandler; // ★スマホで指を離した時の最終確認
                
                updateButtons(0);
                this.ui.quantityContainer.appendChild(wrap);
                return { range, num: numHidden };
                
            } else {
                // isSingle（単体か複数か）に関わらず、全て同じ黄色い文字のデザインに統一します！
                wrap.innerHTML = `
                    <div class="slider-row-label">${label}</div>
                    <div class="qty-control" style="display:flex; align-items:center; gap:5px;">
                        <button class="qty-shortcut-btn" id="btn-min-${id}" style="order:1;">最小</button>
                        <button class="qty-shortcut-btn" id="btn-half-${id}" style="order:3;">半分</button>
                        <input type="range" id="range-${id}" min="${minVal}" max="${max}" value="${currentVal}" style="flex:1; order:2;">
                        <button class="qty-shortcut-btn" id="btn-max-${id}" style="order:3;">最大</button>
                        <input type="number" id="num-${id}" min="${minVal}" max="${max}" value="${currentVal}" style="order:4;">
                    </div>
                `;
                
                const range = wrap.querySelector(`#range-${id}`);
                const num = wrap.querySelector(`#num-${id}`);
                
                const setVal = (v) => {
                    let actualMax = parseInt(range.max);
                    if (v < minVal) v = minVal;
                    if (v > actualMax) v = actualMax;
                    range.value = v;
                    num.value = v;
                    updateButtons(v);
                    checkValidQuantity();
                };

                wrap.querySelector(`#btn-min-${id}`).onclick = () => setVal(minVal);
                wrap.querySelector(`#btn-half-${id}`).onclick = () => setVal(Math.floor((minVal + max) / 2));
                wrap.querySelector(`#btn-max-${id}`).onclick = () => setVal(max);

                const rangeHandler = () => { 
                    let v = parseInt(range.value);
                    if (v > minVal && v < max) { 
                        if (max <= 999) {
                            v = Math.round(v / 10) * 10; 
                        } else {
                            v = Math.round(v / 100) * 100; 
                        }
                    }
                    
                    // 【追加】ここで上限・下限を超えないようにブロックします
                    if (v > max) v = max;
                    if (v < minVal) v = minVal;
                    
                    range.value = v;
                    num.value = v;
                    updateButtons(v);
                    checkValidQuantity(); 
                };
                range.oninput = rangeHandler;
                range.onchange = rangeHandler; // ★スマホで指を離した時の最終確認

                const numHandler = () => { 
                    let v = parseInt(num.value);
                    if (isNaN(v)) return;
                    if (v < minVal) v = minVal;
                    if (v > max) v = max;
                    range.value = v;
                    updateButtons(v);
                    checkValidQuantity();
                };
                num.oninput = numHandler;
                num.onchange = numHandler; // ★スマホで指を離した時の最終確認

                updateButtons(currentVal);
                this.ui.quantityContainer.appendChild(wrap);
                return { range, num };
            }
        };

        let inputs = {};
        
        // ★追加：計算のために大名と城主をあらかじめ探しておきます
        const daimyo = this.game.bushos.find(b => b.clan === c.ownerClan && b.isDaimyo);
        const castellan = this.game.getBusho(c.castellanId);

        // ★今回追加：複数スライダー画面のための「上部の物資・残数表示」
        const isMultiSliderMode = ['war_supplies', 'def_intercept', 'def_reinf_supplies', 'atk_reinf_supplies', 'def_self_reinf_supplies', 'atk_self_reinf_supplies', 'transport'].includes(type);
        let sourceCastleForMulti = c;
        if (type === 'def_intercept') sourceCastleForMulti = (data && data.length > 0) ? data[0] : c;
        if (type === 'def_reinf_supplies' || type === 'atk_reinf_supplies' || type === 'def_self_reinf_supplies' || type === 'atk_self_reinf_supplies') sourceCastleForMulti = (data && data.length > 0) ? data[0] : c;

        if (isMultiSliderMode) {
            const stockDiv = document.createElement('div');
            stockDiv.className = 'slider-stock-info'; // ★CSSに任せる名札
            stockDiv.innerHTML = `
                <div class="stock-grid">
                    <div class="stock-item"><span class="stock-label">金</span><span id="multi-stock-gold">${sourceCastleForMulti.gold}</span></div>
                    <div class="stock-item"><span class="stock-label">兵糧</span><span id="multi-stock-rice">${sourceCastleForMulti.rice}</span></div>
                    <div class="stock-item"><span class="stock-label">兵士</span><span id="multi-stock-soldiers">${sourceCastleForMulti.soldiers}</span></div>
                    <div class="stock-item"><span class="stock-label">軍馬</span><span id="multi-stock-horses">${sourceCastleForMulti.horses || 0}</span></div>
                    <div class="stock-item"><span class="stock-label">鉄砲</span><span id="multi-stock-guns">${sourceCastleForMulti.guns || 0}</span></div>
                </div>
            `;
            this.ui.quantityContainer.appendChild(stockDiv);
        }
        
        if (type === 'draft') {
            document.getElementById('quantity-title').textContent = "徴兵"; 
            
            const busho = this.game.getBusho(data[0]);
            let maxAffordable = GameSystem.calcDraftFromGold(c.gold, busho, c.peoplesLoyalty);
            // 金額の端数でお金が足りなくならないよう、確実な数まで減らします
            while (maxAffordable > 0 && GameSystem.calcDraftCost(maxAffordable, busho, c.peoplesLoyalty) > c.gold) {
                maxAffordable--;
            }
            // 城の兵士数の上限(99,999)を超えないようにします
            const maxSoldiers = Math.min(c.population, 99999 - c.soldiers, maxAffordable);
            
            // ★変更：相場の金額を小数点以下1桁で表示します！
            const efficiency = ((busho.leadership * 1.5) + (busho.charm * 1.5) + (Math.sqrt(busho.loyalty) * 2) + (Math.sqrt(c.peoplesLoyalty) * 2)) / 500;
            const singleCost = 1 / efficiency;
            
            this.ui.tradeTypeInfo.classList.remove('hidden'); 
            this.ui.tradeTypeInfo.textContent = `兵士 1人 ＝ 金 ${singleCost.toFixed(1)}`;

            // ★変更：スライダーより前に数字の箱を作って、スライダーの上に表示させます！
            const costDiv = document.createElement('div');
            costDiv.id = 'dynamic-cost-display';
            costDiv.style.cssText = "display: flex; justify-content: center; font-weight:bold; color:#1976d2; margin-bottom:15px; font-size:1.1rem;";
            this.ui.quantityContainer.appendChild(costDiv);

            inputs.soldiers = createSlider("兵士数", "soldiers", maxSoldiers, 0);
            
        } else if (type === 'charity') {
            document.getElementById('quantity-title').textContent = "施し"; this.ui.charityTypeSelector.classList.remove('hidden'); const count = data.length; this.ui.quantityContainer.innerHTML = `<p>選択武将数: ${count}名</p>`;
        } else if (type === 'goodwill') {
            document.getElementById('quantity-title').textContent = "贈与金指定"; 
            const maxGoodwillGold = Math.max(200, Math.min(1500, c.gold));
            inputs.gold = createSlider("金", "gold", maxGoodwillGold, 200, 200);
        } else if (type === 'headhunt_gold') {
            document.getElementById('quantity-title').textContent = "持参金 (任意)"; inputs.gold = createSlider("金", "gold", c.gold, 0);
        } else if (type === 'tribute_gold') {
            document.getElementById('quantity-title').textContent = "献上金 (最大1500)"; 
            const maxTributeGold = Math.max(200, Math.min(1500, c.gold));
            inputs.gold = createSlider("金", "gold", maxTributeGold, 200, 200);
        } else if (type === 'war_supplies') {
            document.getElementById('quantity-title').textContent = "出陣用意"; 
            inputs.soldiers = createSlider("兵士", "soldiers", c.soldiers, c.soldiers);
            inputs.rice = createSlider("兵糧", "rice", c.rice, c.rice);
            inputs.horses = createSlider("軍馬", "horses", c.horses, 0);
            inputs.guns = createSlider("鉄砲", "guns", c.guns, 0);
        } else if (type === 'def_intercept') { 
            const interceptCastle = (data && data.length > 0) ? data[0] : c;
            document.getElementById('quantity-title').textContent = "迎撃部隊編成"; 
            inputs.soldiers = createSlider("兵士", "soldiers", interceptCastle.soldiers, interceptCastle.soldiers);
            inputs.rice = createSlider("兵糧", "rice", interceptCastle.rice, interceptCastle.rice);
            inputs.horses = createSlider("軍馬", "horses", interceptCastle.horses || 0, 0);
            inputs.guns = createSlider("鉄砲", "guns", interceptCastle.guns || 0, 0);
        } else if (type === 'def_reinf_supplies' || type === 'atk_reinf_supplies' || type === 'def_self_reinf_supplies' || type === 'atk_self_reinf_supplies') { 
            const helperCastle = (data && data.length > 0) ? data[0] : c;
            let titleText = "";
            if (type === 'def_reinf_supplies') titleText = "守備援軍の部隊編成";
            else if (type === 'atk_reinf_supplies') titleText = "攻撃援軍の部隊編成";
            else if (type === 'def_self_reinf_supplies') titleText = "守備自軍援軍の部隊編成";
            else if (type === 'atk_self_reinf_supplies') titleText = "攻撃自軍援軍の部隊編成";
            document.getElementById('quantity-title').textContent = titleText;
            inputs.soldiers = createSlider("兵士", "soldiers", helperCastle.soldiers, helperCastle.soldiers, 500);
            inputs.rice = createSlider("兵糧", "rice", helperCastle.rice, helperCastle.rice, 500);
            inputs.horses = createSlider("軍馬", "horses", helperCastle.horses || 0, 0, 0);
            inputs.guns = createSlider("鉄砲", "guns", helperCastle.guns || 0, 0, 0);
        } else if (type === 'transport') {
            document.getElementById('quantity-title').textContent = "輸送";
            
            const header = document.createElement('div');
            header.className = 'qty-row'; // 行のスタイルを合わせます
            header.style.marginBottom = '5px';
            // スライダー行と全く同じ要素構成にして、ボタンなどは透明化して配置します
            // ★変更：左側の項目名を黄色文字にしたのに合わせて、ここも構造を合わせます
            header.innerHTML = `
                <div class="slider-row-label" style="visibility:hidden;">ダミー</div>
                <div class="qty-control" style="display:flex; align-items:center; gap:5px;">
                    <button class="qty-shortcut-btn" style="visibility:hidden; pointer-events:none; order:1;">空</button>
                    <div style="flex:1; order:2;"></div>
                    <button class="qty-shortcut-btn" style="visibility:hidden; pointer-events:none; order:3;">空</button>
                    <div style="width: 48px; text-align: center; font-weight: bold; order:4; color: #ffd54f; font-size: 0.85rem; text-shadow: 1px 1px 0 #000, -1px -1px 0 #000, 1px -1px 0 #000, -1px 1px 0 #000;">輸送先</div>
                </div>
            `;
            this.ui.quantityContainer.appendChild(header);

            const tCastle = this.game.getCastle(targetId); // 輸送先の城のデータを取得します
            
            // 引数は (ラベル, ID, 自分の城の数, 最初は0, 最低は0, 輸送モードフラグ, 相手の城の数, 相手の城の上限) です
            inputs.gold = createSlider("金", "gold", c.gold, 0, 0, true, tCastle.gold, 99999);
            inputs.rice = createSlider("兵糧", "rice", c.rice, 0, 0, true, tCastle.rice, 99999);
            inputs.soldiers = createSlider("兵士", "soldiers", c.soldiers, 0, 0, true, tCastle.soldiers, 99999);
            inputs.horses = createSlider("軍馬", "horses", c.horses || 0, 0, 0, true, tCastle.horses || 0, 99999);
            inputs.guns = createSlider("鉄砲", "guns", c.guns || 0, 0, 0, true, tCastle.guns || 0, 99999);
        } else if (type === 'buy_rice') {
            document.getElementById('quantity-title').textContent = "兵糧購入"; 
            let rate = 1.0;
            if (c && this.game.provinces) {
                const province = this.game.provinces.find(p => p.id === c.provinceId);
                if (province && province.marketRate !== undefined) rate = province.marketRate;
            }
            let maxBuy = Math.floor(c.gold / rate);
            // 金額の端数でお金が足りなくならないよう、確実な数まで減らします
            while (maxBuy > 0 && Math.ceil(maxBuy * rate) > c.gold) {
                maxBuy--;
            }
            // 城の兵糧上限(99,999)を超えないようにします
            const realMaxBuy = Math.min(maxBuy, 99999 - c.rice);

            this.ui.tradeTypeInfo.classList.remove('hidden'); 
            // ★変更：相場の金額を小数点以下1桁で表示します！
            this.ui.tradeTypeInfo.textContent = `兵糧 10 ＝ 金 ${(10 * rate).toFixed(1)}`;

            // ★変更：スライダーより前に数字の箱を作って、スライダーの上に表示させます！
            const costDiv = document.createElement('div');
            costDiv.id = 'dynamic-cost-display';
            costDiv.style.cssText = "display: flex; justify-content: center; font-weight:bold; color:#1976d2; margin-bottom:15px; font-size:1.1rem;";
            this.ui.quantityContainer.appendChild(costDiv);

            inputs.amount = createSlider("購入量", "amount", realMaxBuy, 0);
            
        } else if (type === 'sell_rice') {
            document.getElementById('quantity-title').textContent = "兵糧売却"; 
            let rate = 1.0;
            if (c && this.game.provinces) {
                const province = this.game.provinces.find(p => p.id === c.provinceId);
                if (province && province.marketRate !== undefined) rate = province.marketRate;
            }
            // 売ったお金が所持金の上限(99,999)を超えないように、売れる最大量を逆算します
            const maxSellByGold = Math.floor((99999 - c.gold) / rate);
            const realMaxSell = Math.min(c.rice, maxSellByGold);

            this.ui.tradeTypeInfo.classList.remove('hidden'); 
            // ★変更：相場の金額を小数点以下1桁で表示します！
            this.ui.tradeTypeInfo.textContent = `兵糧 10 ＝ 金 ${(10 * rate).toFixed(1)}`;

            // ★変更：スライダーより前に数字の箱を作って、スライダーの上に表示させます！
            const costDiv = document.createElement('div');
            costDiv.id = 'dynamic-cost-display';
            costDiv.style.cssText = "display: flex; justify-content: center; font-weight:bold; color:#1976d2; margin-bottom:15px; font-size:1.1rem;";
            this.ui.quantityContainer.appendChild(costDiv);

            inputs.amount = createSlider("売却量", "amount", realMaxSell, 0);

        } else if (type === 'buy_ammo') {
            document.getElementById('quantity-title').textContent = "矢弾購入"; 
            const price = parseInt(window.MainParams.Economy.PriceAmmo, 10) || 1;
            const maxBuy = price > 0 ? Math.floor(c.gold / price) : 0;
            // 城の矢弾上限(99,999)を超えないようにします
            const realMaxBuy = Math.min(maxBuy, 99999 - (c.ammo || 0));

            this.ui.tradeTypeInfo.classList.remove('hidden'); 
            this.ui.tradeTypeInfo.textContent = `固定価格: 金${price.toFixed(1)} / 1個`; // 念のためこちらも揃えます
            inputs.amount = createSlider("購入量", "amount", realMaxBuy, 0);

        } else if (type === 'buy_horses') {
            document.getElementById('quantity-title').textContent = "軍馬購入"; 
            let maxBuy = GameSystem.calcBuyHorseAmount(c.gold, daimyo, castellan);
            // 金額の端数でお金が足りなくならないよう、確実な数まで減らします
            while (maxBuy > 0 && GameSystem.calcBuyHorseCost(maxBuy, daimyo, castellan) > c.gold) {
                maxBuy--;
            }
            // 城の軍馬上限(99,999)を超えないようにします
            const realMaxBuy = Math.min(maxBuy, 99999 - (c.horses || 0));

            // ★変更：さっき作った「正確な単価の魔法」を使って表示します
            const unitPrice = GameSystem.calcBuyHorseUnitPrice(daimyo, castellan);
            this.ui.tradeTypeInfo.classList.remove('hidden'); 
            this.ui.tradeTypeInfo.textContent = `軍馬 1頭 ＝ 金 ${unitPrice.toFixed(1)}`;

            // ★変更：スライダーより前に数字の箱を作って、スライダーの上に表示させます！
            const costDiv = document.createElement('div');
            costDiv.id = 'dynamic-cost-display';
            costDiv.style.cssText = "display: flex; justify-content: center; font-weight:bold; color:#1976d2; margin-bottom:15px; font-size:1.1rem;";
            this.ui.quantityContainer.appendChild(costDiv);

            inputs.amount = createSlider("購入量", "amount", realMaxBuy, 0);

        } else if (type === 'buy_guns') {
            document.getElementById('quantity-title').textContent = "鉄砲購入"; 
            let maxBuy = GameSystem.calcBuyGunAmount(c.gold, daimyo, castellan);
            // 金額の端数でお金が足りなくならないよう、確実な数まで減らします
            while (maxBuy > 0 && GameSystem.calcBuyGunCost(maxBuy, daimyo, castellan) > c.gold) {
                maxBuy--;
            }
            // 城の鉄砲上限(99,999)を超えないようにします
            const realMaxBuy = Math.min(maxBuy, 99999 - (c.guns || 0));

            // ★変更：さっき作った「正確な単価の魔法」を使って表示します
            const unitPrice = GameSystem.calcBuyGunUnitPrice(daimyo, castellan);
            this.ui.tradeTypeInfo.classList.remove('hidden'); 
            this.ui.tradeTypeInfo.textContent = `鉄砲 1挺 ＝ 金 ${unitPrice.toFixed(1)}`;

            // ★変更：スライダーより前に数字の箱を作って、スライダーの上に表示させます！
            const costDiv = document.createElement('div');
            costDiv.id = 'dynamic-cost-display';
            costDiv.style.cssText = "display: flex; justify-content: center; font-weight:bold; color:#1976d2; margin-bottom:15px; font-size:1.1rem;";
            this.ui.quantityContainer.appendChild(costDiv);

            inputs.amount = createSlider("購入量", "amount", realMaxBuy, 0);

        } else if (type === 'war_repair') {
            const s = this.game.warManager.state;
            const defender = s.defender;
            const maxSoldiers = Math.min(window.WarParams.War.RepairMaxSoldiers, defender.soldiers);
            document.getElementById('quantity-title').textContent = "補修 (兵士選択)";
            inputs.soldiers = createSlider("使用兵士数", "soldiers", maxSoldiers, Math.min(50, maxSoldiers));
        }
        
        checkValidQuantity(); 

        const closeQuantityModal = () => {
            this.ui.quantityModal.classList.add('hidden');
            this.ui.restoreAIGuard(); // ★これを追加します！
            if (this.ui.quantityConfirmBtn) {
                this.ui.quantityConfirmBtn.disabled = false;
                this.ui.quantityConfirmBtn.style.opacity = 1.0;
            }
        };

        this.ui.quantityConfirmBtn.onclick = () => {
            closeQuantityModal(); 
            if (extraData && extraData.onConfirm) {
                extraData.onConfirm(inputs);
            } else {
                this.game.commandSystem.handleQuantitySelection(type, inputs, targetId, data, extraData);
            }
        };

        const cancelBtn = this.ui.quantityModal.querySelector('.btn-secondary');
        if (cancelBtn) {
            cancelBtn.onclick = () => {
                closeQuantityModal(); 
                if (extraData && extraData.onCancel) {
                    extraData.onCancel(); 
                }
            };
        }
    }

    // ==========================================
    // ★ここから追加：部隊分割（スライダー）の魔法です！
    // ==========================================
    showUnitDivideModal(bushos, totalSoldiers, totalHorses, totalGuns, onConfirm, onCancel = null) {
        const modal = document.getElementById('unit-divide-modal');
        const listEl = document.getElementById('divide-list');
        const confirmBtn = document.getElementById('divide-confirm-btn');
        const footer = confirmBtn.parentElement;
        if (footer) footer.style.justifyContent = 'center';
        const stockContainer = document.getElementById('divide-stock-container');
        
        if (!modal || !listEl) return;
        
        if (typeof totalHorses === 'function') {
            onCancel = totalGuns; 
            onConfirm = totalHorses;
            totalHorses = 0;
            totalGuns = 0;
        }

        this.ui.hideAIGuardTemporarily();
        
        const cancelBtn = modal.querySelector('.btn-secondary');
        if (cancelBtn) {
            cancelBtn.onclick = () => {
                modal.classList.add('hidden');
                this.ui.restoreAIGuard();
                if (onCancel) onCancel(); 
            };
        }

        modal.classList.remove('hidden');
        listEl.innerHTML = '';

        if (stockContainer) {
            stockContainer.className = 'slider-stock-info'; // ★CSSに任せる名札
            stockContainer.innerHTML = `
                <div class="stock-grid">
                    <div class="stock-item"><span class="stock-label">兵士</span><span id="divide-stock-soldiers">0</span></div>
                    <div class="stock-item"><span class="stock-label">軍馬</span><span id="divide-stock-horses">0</span></div>
                    <div class="stock-item"><span class="stock-label">鉄砲</span><span id="divide-stock-guns">0</span></div>
                </div>
            `;
        }
        
        let assignments = bushos.map(b => ({ id: b.id, count: 0, type: 'ashigaru' }));
        
        let ratioSum = 1.5 + (bushos.length - 1) * 1.0;
        let baseAmount = Math.floor(totalSoldiers / ratioSum);
        let remain = totalSoldiers;

        for (let i = 1; i < bushos.length; i++) {
            assignments[i].count = baseAmount;
            remain -= baseAmount;
        }
        if (assignments.length > 0) {
            assignments[0].count = remain; 
        }

        const updateRemain = (triggerBushoId = null, triggerType = null) => {
            let sum = 0;
            let usedHorses = 0;
            let usedGuns = 0;
            
            const currentData = bushos.map(b => {
                const typeEl = document.getElementById(`div-type-${b.id}`);
                const numEl = document.getElementById(`div-num-${b.id}`);
                const typeVal = typeEl ? typeEl.value : 'ashigaru';
                let numVal = numEl ? parseInt(numEl.value) || 0 : 0;
                return { id: b.id, type: typeVal, count: numVal };
            });

            if (triggerType === 'type_change' && triggerBushoId) {
                const bData = currentData.find(d => d.id === triggerBushoId);
                if (bData && bData.type === 'kiba') {
                    const otherKiba = currentData.filter(d => d.id !== triggerBushoId && d.type === 'kiba').reduce((s, d) => s + d.count, 0);
                    const maxKiba = Math.max(0, totalHorses - otherKiba);
                    if (bData.count > maxKiba) {
                        bData.count = maxKiba;
                        if (bData.count < 1) bData.count = 1; 
                        if (maxKiba === 0) {
                            bData.type = 'ashigaru';
                            document.getElementById(`div-type-${triggerBushoId}`).value = 'ashigaru';
                        }
                    }
                } else if (bData && bData.type === 'teppo') {
                    const otherTeppo = currentData.filter(d => d.id !== triggerBushoId && d.type === 'teppo').reduce((s, d) => s + d.count, 0);
                    const maxTeppo = Math.max(0, totalGuns - otherTeppo);
                    if (bData.count > maxTeppo) {
                        bData.count = maxTeppo;
                        if (bData.count < 1) bData.count = 1;
                        if (maxTeppo === 0) {
                            bData.type = 'ashigaru';
                            document.getElementById(`div-type-${triggerBushoId}`).value = 'ashigaru';
                        }
                    }
                }
            } else if (triggerType === 'num_change' && triggerBushoId) {
                const bData = currentData.find(d => d.id === triggerBushoId);
                if (bData && bData.type === 'kiba') {
                    const otherKiba = currentData.filter(d => d.id !== triggerBushoId && d.type === 'kiba').reduce((s, d) => s + d.count, 0);
                    const maxKiba = Math.max(0, totalHorses - otherKiba);
                    if (bData.count > maxKiba) bData.count = maxKiba;
                } else if (bData && bData.type === 'teppo') {
                    const otherTeppo = currentData.filter(d => d.id !== triggerBushoId && d.type === 'teppo').reduce((s, d) => s + d.count, 0);
                    const maxTeppo = Math.max(0, totalGuns - otherTeppo);
                    if (bData.count > maxTeppo) bData.count = maxTeppo;
                }
            }

            sum = currentData.reduce((s, d) => s + d.count, 0);
            usedHorses = currentData.filter(d => d.type === 'kiba').reduce((s, d) => s + d.count, 0);
            usedGuns = currentData.filter(d => d.type === 'teppo').reduce((s, d) => s + d.count, 0);
            
            const rem = totalSoldiers - sum;
            currentData.forEach(d => {
                const range = document.getElementById(`div-range-${d.id}`);
                const num = document.getElementById(`div-num-${d.id}`);
                if (!range || !num) return;

                if (parseInt(num.value) !== d.count) {
                    num.value = d.count;
                    range.value = d.count;
                }

                // ボタンの表示・非表示を数量指定スライダーと揃える魔法
                let otherSum = sum - d.count;
                let maxAllowed = totalSoldiers - otherSum;
                if (d.type === 'kiba') {
                    let otherHorses = usedHorses - d.count; 
                    maxAllowed = Math.min(maxAllowed, totalHorses - otherHorses);
                }
                if (d.type === 'teppo') {
                    let otherGuns = usedGuns - d.count;
                    maxAllowed = Math.min(maxAllowed, totalGuns - otherGuns);
                }
                if (maxAllowed < 1) maxAllowed = 1;

                const btnMin = document.getElementById(`div-btn-min-${d.id}`);
                const btnHalf = document.getElementById(`div-btn-half-${d.id}`);
                const btnMax = document.getElementById(`div-btn-max-${d.id}`);
                
                if (btnMin && btnHalf && btnMax) {
                    if (maxAllowed <= 1) {
                        btnMin.style.display = ''; btnMin.disabled = true; btnMin.style.order = 1;
                        btnHalf.style.display = ''; btnHalf.disabled = true; btnHalf.style.order = 3;
                        btnMax.style.display = 'none';
                    } else if (d.count <= 1) {
                        // 最小の時：「最小(無効)」と「半分(有効)」を表示
                        btnMin.style.display = ''; btnMin.disabled = true; btnMin.style.order = 1;
                        btnHalf.style.display = ''; btnHalf.disabled = false; btnHalf.style.order = 3;
                        btnMax.style.display = 'none';
                    } else if (d.count >= maxAllowed) {
                        // 最大の時：「半分(有効)」と「最大(無効)」を表示
                        btnMin.style.display = 'none';
                        btnHalf.style.display = ''; btnHalf.disabled = false; btnHalf.style.order = 1;
                        btnMax.style.display = ''; btnMax.disabled = true; btnMax.style.order = 3;
                    } else {
                        // 中間の時：「最小(有効)」と「最大(有効)」を表示
                        btnMin.style.display = ''; btnMin.disabled = false; btnMin.style.order = 1;
                        btnHalf.style.display = 'none';
                        btnMax.style.display = ''; btnMax.disabled = false; btnMax.style.order = 3;
                    }
                }
            });
            
            const stockSoldiers = document.getElementById('divide-stock-soldiers');
            const stockHorses = document.getElementById('divide-stock-horses');
            const stockGuns = document.getElementById('divide-stock-guns');

            if (stockSoldiers) stockSoldiers.textContent = rem;
            if (stockHorses) stockHorses.textContent = Math.max(0, totalHorses - usedHorses);
            if (stockGuns) stockGuns.textContent = Math.max(0, totalGuns - usedGuns);
            
            if (rem === 0) {
                confirmBtn.disabled = false;
                confirmBtn.style.opacity = 1.0;
            } else {
                confirmBtn.disabled = true;
                confirmBtn.style.opacity = 0.5;
            }
        };
        
        const gunshi = this.game.getClanGunshi(this.game.playerClanId);
        const myDaimyo = this.game.bushos.find(b => b.clan === this.game.playerClanId && b.isDaimyo);

        bushos.forEach((b, index) => {
            const div = document.createElement('div');
            div.className = 'qty-row divide-row';
            
            div.innerHTML = `
                <div style="font-weight:bold; width:100%; margin-bottom:0; display:flex; align-items:center; justify-content:space-between;">
                    <span class="slider-row-label">${b.name}</span>
                    <div class="troop-type-selector" id="troop-type-group-${b.id}">
                        <button class="troop-type-btn active" data-type="ashigaru">足軽</button>
                        <button class="troop-type-btn" data-type="kiba">騎馬</button>
                        <button class="troop-type-btn" data-type="teppo">鉄砲</button>
                    </div>
                </div>
                <div class="qty-control" style="display:flex; align-items:center; gap:5px;">
                    <button class="qty-shortcut-btn" id="div-btn-min-${b.id}" style="order:1;">最小</button>
                    <button class="qty-shortcut-btn" id="div-btn-half-${b.id}" style="order:3;">半分</button>
                    <input type="range" id="div-range-${b.id}" min="1" max="${totalSoldiers}" value="${assignments[index].count}" style="flex:1; order:2;">
                    <button class="qty-shortcut-btn" id="div-btn-max-${b.id}" style="order:3;">最大</button>
                    <input type="number" id="div-num-${b.id}" min="1" max="${totalSoldiers}" value="${assignments[index].count}" style="order:4;">
                </div>
                <input type="hidden" id="div-type-${b.id}" value="ashigaru">
            `;
            listEl.appendChild(div);
            
            const range = div.querySelector(`#div-range-${b.id}`);
            const num = div.querySelector(`#div-num-${b.id}`);
            const typeSel = div.querySelector(`#div-type-${b.id}`);
            
            const onInput = (val, mode = 'normal') => {
                let v = parseInt(val) || 0;
                
                let otherSum = 0;
                let otherHorses = 0;
                let otherGuns = 0;
                bushos.forEach(busho => {
                    if (busho.id !== b.id) {
                        const tEl = document.getElementById(`div-type-${busho.id}`);
                        const nEl = document.getElementById(`div-num-${busho.id}`);
                        const t = tEl ? tEl.value : 'ashigaru';
                        const c = parseInt(nEl ? nEl.value : 0) || 0;
                        otherSum += c;
                        if (t === 'kiba') otherHorses += c;
                        if (t === 'teppo') otherGuns += c;
                    }
                });
                
                let maxAllowed = totalSoldiers - otherSum;
                const myType = typeSel.value;
                if (myType === 'kiba') maxAllowed = Math.min(maxAllowed, totalHorses - otherHorses);
                if (myType === 'teppo') maxAllowed = Math.min(maxAllowed, totalGuns - otherGuns);
                if (maxAllowed < 1) maxAllowed = 1;

                if (mode === 'max') {
                    v = maxAllowed;
                } else if (mode === 'half') {
                    v = Math.floor((1 + maxAllowed) / 2);
                } else if (mode === 'range') {
                    // ★追加：スライダーを動かした時だけ、10単位・100単位で丸める魔法！
                    if (v > 1 && v < maxAllowed) {
                        // 全体の兵数が999以下なら10単位、1000以上なら100単位で丸めます
                        if (totalSoldiers <= 999) {
                            v = Math.round(v / 10) * 10;
                        } else {
                            v = Math.round(v / 100) * 100;
                        }
                    }
                    if (v > maxAllowed) v = maxAllowed;
                    if (v < 1) v = 1;
                } else {
                    if (v > maxAllowed) v = maxAllowed;
                    if (v < 1) v = 1;
                }
                
                range.value = v;
                num.value = v;
                updateRemain(b.id, 'num_change');
            };

            range.oninput = (e) => onInput(e.target.value, 'range'); // ★変更：スライダーからの入力だと教えます
            range.onchange = (e) => onInput(e.target.value, 'range'); // ★追加：スマホで指を離した時の最終確認
            num.oninput = (e) => onInput(e.target.value);

            const btnMin = div.querySelector(`#div-btn-min-${b.id}`);
            const btnHalf = div.querySelector(`#div-btn-half-${b.id}`);
            const btnMax = div.querySelector(`#div-btn-max-${b.id}`);
            
            btnMin.onclick = () => { if (window.AudioManager) window.AudioManager.playSE('choice.ogg'); onInput(1); };
            btnHalf.onclick = () => { if (window.AudioManager) window.AudioManager.playSE('choice.ogg'); onInput(0, 'half'); };
            btnMax.onclick = () => { if (window.AudioManager) window.AudioManager.playSE('choice.ogg'); onInput(0, 'max'); };
            num.onblur = (e) => {
                if(e.target.value === "" || isNaN(parseInt(e.target.value))) {
                    onInput(1);
                }
            };
            
            const typeBtns = div.querySelectorAll(`#troop-type-group-${b.id} .troop-type-btn`);
            typeBtns.forEach(btn => {
                btn.onclick = () => {
                    if (window.AudioManager) window.AudioManager.playSE('choice.ogg');
                    typeBtns.forEach(b => b.classList.remove('active'));
                    btn.classList.add('active');
                    typeSel.value = btn.getAttribute('data-type');
                    updateRemain(b.id, 'type_change');
                };
            });
        });

        updateRemain();

        confirmBtn.onclick = () => {
            let sum = 0;
            const finalAssignments = [];
            bushos.forEach(b => {
                const val = parseInt(document.getElementById(`div-num-${b.id}`).value) || 0;
                const typeVal = document.getElementById(`div-type-${b.id}`).value;
                sum += val;
                finalAssignments.push({ busho: b, soldiers: val, troopType: typeVal });
            });
            
            if (sum !== totalSoldiers) {
                this.ui.showDialog("未分配の兵士がいます。兵士を残さず分配してください。", false);
                return;
            }
            
            modal.classList.add('hidden');
            this.ui.restoreAIGuard(); 
            onConfirm(finalAssignments);
        };
    }
}