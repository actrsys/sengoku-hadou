/**
 * ui_info.js
 * リストの表示を管理するファイルです
 */
class UIInfoManager {
    constructor(ui, game) {
        // 元のui.jsとgameの情報を覚えておきます
        this.ui = ui;
        this.game = game;
        this.closeCommonModal(); // 履歴や状態変数の初期化
    }
    
    // --- 共通モーダル（枠の使い回し）管理 ---
    closeCommonModal() {
        this._stableSortBases = {}; // ★全リスト共通の「前回の並び順」を記憶する箱をリセットします

        this.modalHistory = [];
        this.currentModalInfo = null;
        if (this.ui && this.ui.selectorModal) this.ui.selectorModal.classList.add('hidden');
        
        // 武将一覧などで使う状態のリセット
        this.bushoCurrentTab = 'stats';
        this.bushoCurrentScope = 'clan';
        this.bushoCurrentSortKey = null;
        this.bushoIsSortAsc = false;
        this.bushoSavedBushos = null;
        this.bushoSavedSortedBushos = null;
        this.bushoLastSortStateKey = null;
        this.bushoLastScope = null;
        this.bushoSavedData = null;
        this.bushoSavedSelectedIds = [];
        
        // 外交リストのタブ状態リセット
        this.diploCurrentTab = 'daimyo';
        
        // 勢力一覧で使う状態のリセット
        this.daimyoCurrentSortKey = null;
        this.isDaimyoSortAsc = false;
        
        // 拠点一覧で使う状態のリセット
        this.currentKyotenTab = 'status';
        this.currentKyotenScope = 'clan';
        this.currentKyotenSortKey = null;
        this.isKyotenSortAsc = false;
        this.kyotenSavedCastles = null;
        this.kyotenSavedSortedCastles = null;
        this.kyotenLastSortStateKey = null;
        this.kyotenLastScope = null;
        
        this.princessCurrentScope = null;
        this.princessCurrentSortKey = null;
        this.isPrincessSortAsc = false;
        
        this.factionCurrentSortKey = null;
        this.isFactionSortAsc = false;

        // 所領分配のリセット
        this.allotFiefSelectedIds = null;
        this.allotFiefSavedState = false;
    }

    // --- ソート状態の一元管理 ---
    // ★新機能：全リスト共通で「前回の並び順（ベース）」を取得する魔法
    _prepareStableSortBase(listId, baseArray, sortKey) {
        if (!this._stableSortBases) this._stableSortBases = {};
        if (!sortKey) {
            this._stableSortBases[listId] = null;
            return [...baseArray];
        }
        return this._stableSortBases[listId] ? [...this._stableSortBases[listId]] : [...baseArray];
    }

    // ★新機能：並べ替えが終わったあとに、その結果を共通の箱に保存する魔法
    _saveStableSortResult(listId, sortedArray) {
        if (!this._stableSortBases) this._stableSortBases = {};
        // ★修正：空っぽ（null）が渡された時は、複製しようとせずにそのまま空っぽにします！
        this._stableSortBases[listId] = sortedArray ? [...sortedArray] : null;
    }

    _toggleSortState(currentSortKey, currentIsAsc, clickedSortKey, defaultAscKeys) {
        if (currentSortKey === clickedSortKey) {
            const isDefaultAsc = defaultAscKeys.includes(clickedSortKey);
            // 2回目のクリック（現在の向きがデフォルトと同じ）なら逆向きにする
            if (currentIsAsc === isDefaultAsc) {
                return { key: clickedSortKey, isAsc: !currentIsAsc };
            } else {
                // 3回目のクリック（現在の向きがデフォルトと逆）ならソートを解除する
                return { key: null, isAsc: false };
            }
        } else {
            // 1回目のクリック（新しいキー）ならデフォルトの向きでソートする
            return { key: clickedSortKey, isAsc: defaultAscKeys.includes(clickedSortKey) };
        }
    }

    // ==========================================
    // ★共通化ツール：ソート用の共通の魔法
    // ==========================================

    // ★全リスト共通で使える「▲▼マークを作る魔法」
    _getCommonSortMark(currentSortKey, isAsc, targetKey) {
        if (currentSortKey !== targetKey) return '';
        return isAsc ? '<span class="sort-mark">▲</span>' : '<span class="sort-mark">▼</span>';
    }

    // ★全リスト共通で使える「文字や数字の大小を比べて並び順を決める魔法」
    _compareForSort(valA, valB, isAsc, fallbackCmp = 0) {
        if (typeof valA === 'string' && typeof valB === 'string') {
            let cmp = isAsc ? valA.localeCompare(valB, 'ja') : valB.localeCompare(valA, 'ja');
            return cmp === 0 ? fallbackCmp : cmp;
        }
        if (valA === valB) return fallbackCmp;
        return isAsc ? (valA - valB) : (valB - valA);
    }

    pushModal(pageType, renderArgs) {
        if (!this.modalHistory) this.modalHistory = [];
        
        if (this.currentModalInfo) {
            // 今開いている画面のスクロール位置をメモしておきます
            const listEl = document.getElementById('selector-list');
            this.currentModalInfo.scrollPos = listEl ? listEl.scrollTop : 0;
            this.modalHistory.push(this.currentModalInfo);
        }
        
        this.currentModalInfo = { pageType, args: renderArgs, scrollPos: 0 };
        this._renderCurrentModal();
    }

    popModal() {
        if (!this.modalHistory || this.modalHistory.length === 0) {
            this.closeCommonModal();
            return;
        }
        // 履歴から一つ前の画面を取り出して復元します
        this.currentModalInfo = this.modalHistory.pop();
        this._renderCurrentModal();
    }
    
    _renderCurrentModal() {
        const info = this.currentModalInfo;
        if (!info) return;

        // ★ここで「情報系画面」かどうかをタグ付け（判定）します
        const isInfoScreen = ['daimyo_detail', 'busho_detail', 'delegate_setting', 'kunishu_detail', 'castle_detail'].includes(info.pageType);

        // ★枠の大元で、スクロールバーの表示/非表示をクラスで一括管理します
        const listWrapper = document.getElementById('selector-list-wrapper');
        const listContainer = document.getElementById('selector-list');
        
        if (listWrapper) {
            if (isInfoScreen) {
                listWrapper.classList.add('no-custom-scrollbar');
                if (listContainer) listContainer.style.overflow = 'hidden'; 
            } else {
                listWrapper.classList.remove('no-custom-scrollbar');
                if (listContainer) listContainer.style.overflow = '';
            }
        }

        // ★枠の大元で、タブの表示/非表示（ダミータブ）を一括管理します
        const tabsEl = document.getElementById('selector-tabs');
        if (tabsEl) {
            if (isInfoScreen) {
                tabsEl.classList.add('hidden');
            } else {
                tabsEl.classList.remove('hidden');
                tabsEl.style.justifyContent = 'flex-start';
                tabsEl.style.paddingLeft = '10px';
                tabsEl.style.alignItems = 'flex-end';
                tabsEl.innerHTML = '<div style="display: flex; gap: 5px;"><button class="busho-tab-btn active" style="cursor: default; pointer-events: none;">基本</button></div>';
            }
        }
        
        // どの画面を描くか判定して専用の魔法を呼び出します
        if (info.pageType === 'daimyo_list') this._renderDaimyoList(...info.args, info.scrollPos);
        else if (info.pageType === 'daimyo_detail') this._renderDaimyoDetail(...info.args, info.scrollPos);
        else if (info.pageType === 'busho_selector') this._renderBushoSelector(...info.args, info.scrollPos);
        else if (info.pageType === 'busho_detail') this._renderBushoDetail(...info.args, info.scrollPos);
        else if (info.pageType === 'kyoten_list') this._renderKyotenList(...info.args, info.scrollPos);
        else if (info.pageType === 'diplo_list') this._renderDiplomacyList(...info.args, info.scrollPos);
        else if (info.pageType === 'faction_list') this._renderFactionList(...info.args, info.scrollPos);
        else if (info.pageType === 'princess_list') this._renderPrincessList(...info.args, info.scrollPos);
        else if (info.pageType === 'delegate_list') this._renderDelegateList(...info.args, info.scrollPos);
        else if (info.pageType === 'delegate_setting') this._renderDelegateSetting(...info.args, info.scrollPos);
        else if (info.pageType === 'prisoner_selector') this._renderPrisonerSelector(...info.args, info.scrollPos);
        else if (info.pageType === 'history_list') this._renderHistoryList(...info.args, info.scrollPos);
        else if (info.pageType === 'kunishu_list') this._renderKunishuList(...info.args, info.scrollPos);
        else if (info.pageType === 'kunishu_detail') this._renderKunishuDetail(...info.args, info.scrollPos);
        else if (info.pageType === 'castle_detail') this._renderCastleDetail(...info.args, info.scrollPos);
        else if (info.pageType === 'force_selector') this._renderForceSelector(...info.args, info.scrollPos);
        else if (info.pageType === 'appoint_legion_castle') this._renderAppointLegionCastle(...info.args, info.scrollPos);
        else if (info.pageType === 'allot_fief') this._renderAllotFief(...info.args, info.scrollPos);
    }
    
    showDaimyoList() {
        this.closeCommonModal(); 
        this.pushModal('daimyo_list', []);
    }

    _renderDaimyoList(scrollPos = 0) {
        const activeClans = this.game.clans.filter(c => c.id !== 0 && this.game.castles.some(cs => cs.ownerClan === c.id));
        this.game.updateAllClanPrestige();
        
        const clanDataList = activeClans.map(clan => {
            const leader = this.game.getBusho(clan.leaderId);
            const castlesCount = this.game.castles.filter(c => c.ownerClan === clan.id).length;
            
            let friendScore = 50;
            let friendStatus = "普通";
            if (clan.id !== this.game.playerClanId) {
                const relation = this.game.getRelation(this.game.playerClanId, clan.id);
                if (relation) {
                    friendScore = relation.sentiment;
                    friendStatus = relation.displayStatus || relation.status; 
                }
            } else {
                friendStatus = "自家";
            }
            
            return {
                id: clan.id, 
                name: clan.name, 
                yomi: clan.yomi || clan.name,
                leaderName: leader ? leader.name : "不明",
                leaderYomi: leader ? (leader.yomi || leader.name) : "んんん",
                power: clan.daimyoPrestige, 
                castlesCount: castlesCount,
                friendScore: friendScore,
                friendStatus: friendStatus
            };
        });
        
        const maxPower = clanDataList.length > 0 ? Math.max(...clanDataList.map(c => c.power)) : 1;
        
        if (this.daimyoCurrentSortKey) {
            let sortedList = this._prepareStableSortBase('daimyo', clanDataList, this.daimyoCurrentSortKey);
            sortedList.sort((a, b) => {
                let valA, valB;
                
                switch (this.daimyoCurrentSortKey) {
                    case 'name': valA = a.yomi; valB = b.yomi; break;
                    case 'leader': valA = a.leaderYomi; valB = b.leaderYomi; break;
                    case 'castlesCount': valA = a.castlesCount; valB = b.castlesCount; break;
                    case 'power': valA = a.power; valB = b.power; break;
                    case 'friend': 
                        valA = a.id === this.game.playerClanId ? 999 : a.friendScore;
                        valB = b.id === this.game.playerClanId ? 999 : b.friendScore;
                        break;
                    case 'relation':
                        const relationRank = { "自家": 0, "婚姻": 1, "同盟": 2, "支配": 3, "従属": 4, "友好": 5, "普通": 6, "敵対": 7 };
                        valA = relationRank[a.friendStatus] !== undefined ? relationRank[a.friendStatus] : 6;
                        valB = relationRank[b.friendStatus] !== undefined ? relationRank[b.friendStatus] : 6;
                        break;
                }

                let fallbackCmp = 0;
                if (this.daimyoCurrentSortKey === 'name') {
                    fallbackCmp = this.isDaimyoSortAsc ? a.name.localeCompare(b.name, 'ja') : b.name.localeCompare(a.name, 'ja');
                } else if (this.daimyoCurrentSortKey === 'leader') {
                    fallbackCmp = this.isDaimyoSortAsc ? a.leaderName.localeCompare(b.leaderName, 'ja') : b.leaderName.localeCompare(a.leaderName, 'ja');
                }
                
                return this._compareForSort(valA, valB, this.isDaimyoSortAsc, fallbackCmp);
            });
            this._saveStableSortResult('daimyo', sortedList);
            clanDataList.splice(0, clanDataList.length, ...sortedList);
        } else {
            clanDataList.sort((a, b) => {
                if (a.id === this.game.playerClanId) return -1;
                if (b.id === this.game.playerClanId) return 1;
                return b.power - a.power;
            });
            this._saveStableSortResult('daimyo', null);
        }

        let items = [];

        clanDataList.forEach(d => {
            let statusClass = "text-white";
            if (d.friendStatus === '敵対') statusClass = 'text-red';
            else if (d.friendStatus === '友好') statusClass = 'text-green';
            else if (['同盟', '支配', '従属', '婚姻'].includes(d.friendStatus)) statusClass = 'text-green';
            else if (d.friendStatus === '自家') statusClass = 'text-orange';

            const powerBarHtml = this._createBarHtml((d.power / maxPower) * 100, 'power');
            const friendBarHtml = d.id === this.game.playerClanId ? "" : this._createBarHtml(d.friendScore, 'friend');
            
            items.push({
                onClick: `window.GameApp.ui.info.showDaimyoDetail(${d.id})`,
                cells: [
                    `<span class="col-daimyo-name" style="font-weight:bold;">${d.name}</span>`,
                    `<span class="col-leader-name">${d.leaderName}</span>`,
                    `<span class="col-castle-count">${d.castlesCount}</span>`,
                    `<span class="col-prestige">${powerBarHtml}</span>`,
                    `<span class="col-friend">${friendBarHtml}</span>`,
                    `<span class="col-relation ${statusClass}">${d.friendStatus}</span>`,
                    `<span class="col-empty pc-only"></span>`
                ]
            });
        });

        const getSortMark = (key) => this._getCommonSortMark(this.daimyoCurrentSortKey, this.isDaimyoSortAsc, key);

        this._renderListModal({
            title: "勢力一覧",
            headers: [
                `<span class="col-daimyo-name" data-sort="name">勢力名${getSortMark('name')}</span>`,
                `<span class="col-leader-name" data-sort="leader">当主${getSortMark('leader')}</span>`,
                `<span class="col-castle-count" data-sort="castlesCount">拠点${getSortMark('castlesCount')}</span>`,
                `<span class="col-prestige" data-sort="power">威信${getSortMark('power')}</span>`,
                `<span class="col-friend" data-sort="friend">友好度${getSortMark('friend')}</span>`,
                `<span class="col-relation" data-sort="relation">関係${getSortMark('relation')}</span>`,
                `<span class="col-empty pc-only"></span>`
            ],
            headerClass: "sortable-header daimyo-list-header",
            itemClass: "daimyo-list-item",
            listClass: "daimyo-list-container",
            items: items,
            scrollPos: scrollPos,
            gridTemplateSp: "2.5fr 2fr 1fr 2fr 2fr 1.5fr",
            gridTemplatePc: "140px 100px 60px 100px 100px 60px 1fr",
            onSortClick: (sortKey) => {
                const defaultAscKeys = ['name', 'leader', 'relation'];
                const newState = this._toggleSortState(this.daimyoCurrentSortKey, this.isDaimyoSortAsc, sortKey, defaultAscKeys);
                this.daimyoCurrentSortKey = newState.key;
                this.isDaimyoSortAsc = newState.isAsc;
                const listEl = document.getElementById('selector-list');
                const scroll = listEl ? listEl.scrollTop : 0;
                this._renderDaimyoList(scroll);
            }
        });
    }

    showDaimyoDetail(clanId) {
        this.pushModal('daimyo_detail', [clanId]);
    }

    _renderDaimyoDetail(clanId, scrollPos = 0) {
        const clan = this.game.clans.find(c => c.id === clanId);
        if (!clan) return;

        const modal = document.getElementById('selector-modal');
        const title = document.getElementById('selector-title');
        const listContainer = document.getElementById('selector-list');
        const contextEl = document.getElementById('selector-context-info');
        const tabsEl = document.getElementById('selector-tabs');
        const confirmBtn = document.getElementById('selector-confirm-btn');
        const backBtn = document.querySelector('#selector-modal .btn-secondary');

        modal.classList.remove('hidden');
        if (title) title.textContent = "勢力情報";
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

        const leader = this.game.getBusho(clan.leaderId);
        const leaderName = leader ? leader.name.replace('|', '') : "不明";
        let baseCastleName = "不明";
        if (leader && leader.castleId) {
            const baseCastle = this.game.castles.find(c => c.id === leader.castleId);
            if (baseCastle) baseCastleName = baseCastle.name;
        }
        
        const clanCastles = this.game.castles.filter(c => c.ownerClan === clanId);
        const castlesCount = clanCastles.length;
        
        // ★武将のリストを取得して、人数と「派閥があるか」を調べます
        const clanBushos = this.game.bushos.filter(b => b.clan === clanId && b.status === 'active');
        const bushosCount = clanBushos.length;
        const hasFaction = clanBushos.some(b => (b.factionId || 0) > 0);
        
        const princessCount = clan.princessIds ? clan.princessIds.length : 0;
        
        let totalGold = 0, totalRice = 0, totalSoldiers = 0, totalHorses = 0, totalGuns = 0, totalGoldIncome = 0, totalRiceIncome = 0;
        clanCastles.forEach(c => {
            totalGold += c.gold || 0; totalRice += c.rice || 0; totalSoldiers += c.soldiers || 0;
            totalHorses += c.horses || 0; totalGuns += c.guns || 0;
            totalGoldIncome += GameSystem.calcBaseGoldIncome(c); totalRiceIncome += GameSystem.calcBaseRiceIncome(c);
        });

        let ideology = "中道", ideologyClass = "ideology-chudo"; 
        if (leader) {
            if (leader.innovation >= 67) { ideology = "革新"; ideologyClass = "ideology-kakushin"; } 
            else if (leader.innovation <= 33) { ideology = "保守"; ideologyClass = "ideology-hoshu"; }
        }

        let faceSrc = leader && leader.faceIcon ? `data/images/faceicons/${leader.faceIcon}` : "data/images/faceicons/unknown_face.webp";

        if (listContainer) {
            listContainer.className = 'list-container hide-native-scroll';
            listContainer.style.display = 'block';
            listContainer.innerHTML = `
                <div class="daimyo-detail-container" style="padding: 10px;">
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
                    <div style="display: flex; justify-content: flex-end; gap: 10px; margin-top: 15px;">
                        <button class="daimyo-detail-action-btn" id="temp-kyoten-btn" ${castlesCount === 0 ? 'disabled' : ''}>拠点</button>
                        <button class="daimyo-detail-action-btn" id="temp-busho-btn" ${bushosCount === 0 ? 'disabled' : ''}>武将</button>
                        <button class="daimyo-detail-action-btn" id="temp-hime-btn" ${princessCount === 0 ? 'disabled' : ''}>姫</button>
                        <button class="daimyo-detail-action-btn" id="temp-faction-btn" ${!hasFaction ? 'disabled' : ''}>派閥</button>
                        <button class="daimyo-detail-action-btn" id="temp-diplo-btn">外交</button>
                    </div>
                </div>
            `;

            document.getElementById('temp-kyoten-btn').onclick = (e) => {
                e.stopPropagation();
                if (window.AudioManager) window.AudioManager.playSE('decision.ogg');
                this.showKyotenList(clan.id);
            };

            document.getElementById('temp-diplo-btn').onclick = (e) => {
                e.stopPropagation(); 
                if (window.AudioManager) window.AudioManager.playSE('decision.ogg');
                this.showDiplomacyList(clan.id, clan.name, 'daimyo');
            };
            
            document.getElementById('temp-busho-btn').onclick = (e) => {
                e.stopPropagation();
                if (window.AudioManager) window.AudioManager.playSE('decision.ogg');
                this.openBushoSelector('view_only', null, { 
                    customBushos: this.game.bushos.filter(b => b.clan === clanId && b.status === 'active'),
                    customInfoHtml: `<div>${clan.name} 所属武将</div>`
                });
            };

            document.getElementById('temp-hime-btn').onclick = (e) => {
                e.stopPropagation();
                if (window.AudioManager) window.AudioManager.playSE('decision.ogg');
                this.pushModal('princess_list', [false, clan.id, 'view_clan_princess']);
            };

            document.getElementById('temp-faction-btn').onclick = (e) => {
                e.stopPropagation();
                if (window.AudioManager) window.AudioManager.playSE('decision.ogg');
                this.showFactionList(clan.id);
            };

            // ★情報画面ではスクロールバーは不要なので、位置を戻すだけにします
            listContainer.scrollTop = scrollPos;
        }
    }

    showDiplomacyList(id, name, type = 'daimyo', onClose = null) {
        this.pushModal('diplo_list', [id, name, type, onClose]);
    }
    
    _renderDiplomacyList(id, name, type, onClose, scrollPos = 0) {
        if (!this.diploCurrentTab) this.diploCurrentTab = 'daimyo';

        let tabsHtml = null;
        if (type === 'daimyo') {
            tabsHtml = `
                <div style="display: flex; gap: 5px;">
                    <button class="busho-tab-btn ${this.diploCurrentTab === 'daimyo' ? 'active' : ''}" data-tab="daimyo">大名家</button>
                    <button class="busho-tab-btn ${this.diploCurrentTab === 'kunishu' ? 'active' : ''}" data-tab="kunishu">諸勢力</button>
                </div>
            `;
        } else {
            this.diploCurrentTab = 'daimyo'; 
        }

        let relations = [];

        if (type === 'daimyo' && this.diploCurrentTab === 'daimyo') {
            const activeClans = this.game.clans.filter(c => c.id !== 0 && c.id !== id && this.game.castles.some(cs => cs.ownerClan === c.id));
            relations = activeClans.map(c => {
                const rel = this.game.getRelation(id, c.id);
                return {
                    id: c.id,
                    name: c.name,
                    sentiment: rel ? rel.sentiment : 50,
                    status: rel ? (rel.displayStatus || rel.status) : "普通"
                };
            });
        } else if (type === 'daimyo' && this.diploCurrentTab === 'kunishu') {
            const activeKunishus = this.game.kunishuSystem.getAliveKunishus();
            relations = activeKunishus.map(k => {
                return {
                    id: k.id,
                    name: k.getName(this.game),
                    sentiment: k.getRelation(id, false),
                    status: k.daimyoRelations[id] ? k.daimyoRelations[id].status : "普通"
                };
            });
        } else if (type === 'kunishu') {
            const kunishu = this.game.kunishuSystem.getKunishu(id);
            if (kunishu) {
                const activeClans = this.game.clans.filter(c => c.id !== 0 && this.game.castles.some(cs => cs.ownerClan === c.id));
                relations = activeClans.map(c => {
                    return {
                        id: c.id,
                        name: c.name,
                        sentiment: kunishu.getRelation(c.id, false),
                        status: kunishu.daimyoRelations[c.id] ? kunishu.daimyoRelations[c.id].status : "普通"
                    };
                });
            }
        }

        relations.sort((a,b) => b.sentiment - a.sentiment);
        
        let items = [];
        relations.forEach(r => {
            let statusClass = "text-white";
            if (r.status === '敵対') statusClass = 'text-red';
            else if (r.status === '友好') statusClass = 'text-white';
            else if (['同盟', '支配', '従属', '婚姻'].includes(r.status)) statusClass = 'text-green';

            const friendBarHtml = this._createBarHtml(r.sentiment, 'friend');

            items.push({
                onClick: null, 
                cells: [
                    `<span class="col-daimyo-name" style="font-weight:bold;">${r.name}</span>`,
                    friendBarHtml,
                    `<span class="col-relation ${statusClass}">${r.status}</span>`,
                    ""
                ]
            });
        });

        // カスタムの列幅を指定するためのヘッダーを作ります
        const customHeaderCols = [
            '<span style="padding-left:5px; justify-content:flex-start;">勢力名</span>',
            '<span>友好度</span>',
            '<span>関係</span>',
            '<span></span>'
        ];

        this._renderListModal({
            title: `${name} 外交関係`,
            tabsHtml: tabsHtml,
            headers: customHeaderCols,
            headerClass: "",
            itemClass: "",
            listClass: "diplo-list-container",
            items: items,
            scrollPos: scrollPos,
            gridTemplateSp: "2fr 1.5fr 1fr 3fr",
            gridTemplatePc: "150px 100px 80px 1fr",
            onBack: onClose,
            onTabClick: (tabKey) => {
                this.diploCurrentTab = tabKey;
                const listEl = document.getElementById('selector-list');
                const scroll = listEl ? listEl.scrollTop : 0;
                this._renderDiplomacyList(id, name, type, onClose, scroll);
            }
        });
    }

    showFactionList(clanId, isDirect = false) {
        if (isDirect) {
            this.closeCommonModal(); 
        }
        this.pushModal('faction_list', [clanId, isDirect]);
    }

    _renderFactionList(clanId, isDirect, scrollPos = 0) {
        const clan = this.game.clans.find(c => c.id === clanId);
        if (!clan) return;
        
        const bushos = this.game.bushos.filter(b => b.clan === clanId && b.status === 'active');
        const factions = {};
        
        bushos.forEach(b => {
            const fId = b.factionId;
            if (!factions[fId]) {
                factions[fId] = { count: 0, leader: null };
            }
            factions[fId].count++;
            if (b.isFactionLeader) { factions[fId].leader = b; }
        });

        let fIds = Object.keys(factions).map(Number); // ★constからletに変更します
        const daimyo = bushos.find(b => b.isDaimyo);
        const daimyoFactionId = daimyo ? daimyo.factionId : -1;

        if (this.factionCurrentSortKey) {
            fIds = this._prepareStableSortBase('faction', fIds, this.factionCurrentSortKey); // ★共通の魔法
            fIds.sort((a, b) => {
                const fDataA = factions[a];
                const fDataB = factions[b];
                const leaderA = fDataA.leader;
                const leaderB = fDataB.leader;
                let valA, valB;

                const getName = (id, leader) => id === 0 ? "無派閥" : (leader && leader.factionName ? leader.factionName : (leader ? leader.name + "派" : "不明"));
                const getYomi = (id, leader) => id === 0 ? "んんん" : (leader && leader.factionYomi ? leader.factionYomi : (leader ? (leader.yomi || leader.name) + "は" : "んんん"));

                switch(this.factionCurrentSortKey) {
                    case 'name': valA = getYomi(a, leaderA); valB = getYomi(b, leaderB); break;
                    case 'leader': valA = a === 0 ? "んんん" : (leaderA ? (leaderA.yomi || leaderA.name) : "んんん"); valB = b === 0 ? "んんん" : (leaderB ? (leaderB.yomi || leaderB.name) : "んんん"); break;
                    case 'count': valA = fDataA.count; valB = fDataB.count; break;
                    case 'seikaku': valA = a === 0 ? "んんん" : (leaderA ? (leaderA.factionSeikaku || "中道") : "んんん"); valB = b === 0 ? "んんん" : (leaderB ? (leaderB.factionSeikaku || "中道") : "んんん"); break;
                    case 'hoshin': valA = a === 0 ? "んんん" : (leaderA ? (leaderA.factionHoshin || "保守的") : "んんん"); valB = b === 0 ? "んんん" : (leaderB ? (leaderB.factionHoshin || "保守的") : "んんん"); break;
                }

                let fallbackCmp = 0;
                if(this.factionCurrentSortKey === 'name'){
                    const nameA = getName(a, leaderA);
                    const nameB = getName(b, leaderB);
                    fallbackCmp = this.isFactionSortAsc ? nameA.localeCompare(nameB, 'ja') : nameB.localeCompare(nameA, 'ja');
                }
                
                return this._compareForSort(valA, valB, this.isFactionSortAsc, fallbackCmp);
            });
            this._saveStableSortResult('faction', fIds); // ★結果を保存
        } else {
            fIds.sort((a, b) => {
                if (a === daimyoFactionId) return -1; 
                if (b === daimyoFactionId) return 1;  
                if (a === 0) return 1;
                if (b === 0) return -1;
                return factions[b].count - factions[a].count; 
            });
            this._saveStableSortResult('faction', null); // ★リセット
        }

        let items = [];
        fIds.forEach(fId => {
            const fData = factions[fId];
            const leader = fData.leader;
            let factionNameStr = fId === 0 ? "無派閥" : (leader && leader.factionName ? leader.factionName : (leader ? leader.name + "派" : "不明"));
            let count = fData.count;
            let seikaku = fId === 0 ? "" : (leader ? (leader.factionSeikaku || "中道") : "不明");
            let hoshin = fId === 0 ? "" : (leader ? (leader.factionHoshin || "保守的") : "不明");
            
            let seikakuClass = "";
            if (seikaku === '武闘派') seikakuClass = 'text-red';
            else if (seikaku === '穏健派') seikakuClass = 'text-blue';

            let hoshinClass = "";
            if (hoshin === '革新的') hoshinClass = 'text-red';
            else if (hoshin === '保守的') hoshinClass = 'text-blue';

            let nameClass = "";
            if (fId === daimyoFactionId) {
                nameClass = "text-orange";
            }
            
            let leaderFullName = fId === 0 ? "" : (leader ? leader.name : "不明");
            
            items.push({
                onClick: `window.GameApp.ui.info.showFactionBushoList(${clan.id}, ${fId}, '${factionNameStr}')`,
                cells: [
                    `<strong class="col-faction-name ${nameClass}">${factionNameStr}</strong>`,
                    `<span class="col-leader-name">${leaderFullName}</span>`,
                    `<span class="col-busho-count">${count}</span>`,
                    `<span class="col-seikaku ${seikakuClass}">${seikaku}</span>`,
                    `<span class="col-hoshin ${hoshinClass}">${hoshin}</span>`,
                    ""
                ]
            });
        });

        const getSortMark = (key) => this._getCommonSortMark(this.factionCurrentSortKey, this.isFactionSortAsc, key);

        this._renderListModal({
            title: `${clan.name} 派閥一覧`,
            headers: [
                `<span class="col-faction-name" data-sort="name">派閥名${getSortMark('name')}</span>`,
                `<span class="col-leader-name" data-sort="leader">派閥主${getSortMark('leader')}</span>`,
                `<span class="col-busho-count" data-sort="count">武将${getSortMark('count')}</span>`,
                `<span class="col-seikaku" data-sort="seikaku">方針${getSortMark('seikaku')}</span>`,
                `<span class="col-hoshin" data-sort="hoshin">思想${getSortMark('hoshin')}</span>`,
                `<span></span>`
            ],
            headerClass: "sortable-header faction-list-header",
            itemClass: "faction-list-item",
            listClass: "faction-list-container",
            items: items,
            scrollPos: scrollPos,
            gridTemplateSp: "2fr 2fr 1fr 1.2fr 1.2fr 1.5fr",
            gridTemplatePc: "120px 120px 60px 80px 80px 1fr",
            onSortClick: (sortKey) => {
                const defaultAscKeys = ['name', 'leader', 'seikaku', 'hoshin'];
                const newState = this._toggleSortState(this.factionCurrentSortKey, this.isFactionSortAsc, sortKey, defaultAscKeys);
                this.factionCurrentSortKey = newState.key;
                this.isFactionSortAsc = newState.isAsc;
                const listEl = document.getElementById('selector-list');
                const scroll = listEl ? listEl.scrollTop : 0;
                this._renderFactionList(clanId, isDirect, scroll);
            }
        });
    }

    showFactionBushoList(clanId, factionId, factionName) {
        const clan = this.game.clans.find(c => c.id === clanId);
        if (!clan) return;

        const targetBushos = this.game.bushos.filter(b => b.clan === clanId && b.status === 'active' && (b.factionId || 0) === factionId);

        this.openBushoSelector('view_only', null, { 
            customBushos: targetBushos,
            customInfoHtml: `<div>${clan.name} ${factionName} 所属武将</div>`,
            isFactionView: true
        });
    }
    
    showBushoDetailModal(busho) {
        this.pushModal('busho_detail', [busho]);
    }
    
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
    }
    
    showBushoDetailModalById(bushoId) {
        const busho = this.game.getBusho(bushoId);
        if (busho) this.showBushoDetailModal(busho);
    }
    
    _saveBushoSelection() {
        const inputs = document.querySelectorAll('input[name="sel_busho"]:checked');
        if (inputs) {
            this.bushoSavedSelectedIds = Array.from(inputs).map(i => parseInt(i.value));
        } else {
            this.bushoSavedSelectedIds = [];
        }
    }

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
    }

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
    }
    
    showPrisonerSelector(phaseType, captives, onConfirm, onBack) {
        this.closeCommonModal(); 
        this.pushModal('prisoner_selector', [phaseType, captives, onConfirm, onBack]);
    }

    _renderPrisonerSelector(phaseType, captives, onConfirm, onBack, scrollPos = 0) {
        const titleStr = phaseType === 'hire' ? "武将を選択（複数可）" : "武将を選択（複数可）";
        const contextHtml = phaseType === 'hire' ? "<div>登用する武将を選択してください</div>" : "<div>処断する武将を選択してください</div>";

        let items = [];
        const gunshi = this.game.getClanGunshi(this.game.playerClanId);
        const myDaimyo = this.game.bushos.find(b => b.clan === this.game.playerClanId && b.isDaimyo);

        captives.forEach((b) => {
            let isSelectable = true;
            // 登用フェーズで断った人は選べないようにします
            if (phaseType === 'hire' && b.hasRefusedHire) isSelectable = false;

            const inputType = 'checkbox';
            let inputHtml = `<input type="${inputType}" name="sel_prisoner" value="${b.id}" ${!isSelectable ? 'disabled' : ''} style="display:none;">`;

            const getStat = (stat) => GameSystem.getDisplayStatHTML(b, stat, gunshi, null, this.game.playerClanId, myDaimyo);

            let cells = [
                `<span class="col-act">${inputHtml}${!isSelectable ? '済' : '未'}</span>`,
                `<span class="col-name">${b.name}</span>`,
                `<span class="col-rank">${b.getRankName()}</span>`,
                `<span class="col-stat">${getStat('leadership')}</span>`,
                `<span class="col-stat">${getStat('strength')}</span>`,
                `<span class="col-stat">${getStat('politics')}</span>`,
                `<span class="col-stat">${getStat('diplomacy')}</span>`,
                `<span class="col-stat">${getStat('intelligence')}</span>`,
                `<span class="col-stat">${getStat('charm')}</span>`
            ];

            // 断った武将は暗くして触れないようにします
            let itemClassThis = "stats-mode";
            if (!isSelectable) itemClassThis += " disabled";

            items.push({
                onClick: !isSelectable ? null : `window.GameApp.ui.info.handlePrisonerSelect(event)`,
                cells: cells,
                itemClass: itemClassThis
            });
        });

        this._renderListModal({
            title: titleStr,
            contextHtml: contextHtml,
            headers: [
                `<span class="col-act">行動</span>`,
                `<span class="col-name">名前</span>`,
                `<span class="col-rank">身分</span>`,
                `<span class="col-stat">統率</span>`,
                `<span class="col-stat">武勇</span>`,
                `<span class="col-stat">内政</span>`,
                `<span class="col-stat">外交</span>`,
                `<span class="col-stat">智謀</span>`,
                `<span class="col-stat">魅力</span>`
            ],
            headerClass: "sortable-header stats-mode",
            itemClass: "",
            listClass: "",
            items: items,
            scrollPos: scrollPos,
            minWidth: "750px",
            gridTemplateSp: "25px 2fr 1.8fr 1.2fr 1.2fr 1.2fr 1.2fr 1.2fr 1.2fr",
            gridTemplatePc: "35px 100px 60px 1fr 1fr 1fr 1fr 1fr 1fr",
            onBack: onBack,
            onConfirm: () => {
                const inputs = document.querySelectorAll('input[name="sel_prisoner"]:checked'); 
                if (inputs.length === 0) return;
                const selectedIds = Array.from(inputs).map(i => parseInt(i.value)); 
                this.closeCommonModal(); 
                if (onConfirm) onConfirm(selectedIds);
            }
        });

        this._updatePrisonerSelectorUI();
    }

    handlePrisonerSelect(e) {
        let div = e.currentTarget;
        let input = e.target.tagName === 'INPUT' ? e.target : div.querySelector('input');
        if (!input) return;

        if (e.target.tagName !== 'INPUT') {
             input.checked = !input.checked; 
        }
        if(input.checked) div.classList.add('selected'); else div.classList.remove('selected');
        this._updatePrisonerSelectorUI();
    }

    _updatePrisonerSelectorUI() {
        const checkedCount = document.querySelectorAll('input[name="sel_prisoner"]:checked').length; 
        const confirmBtn = document.getElementById('selector-confirm-btn');

        if (confirmBtn) {
            if (checkedCount > 0) {
                confirmBtn.disabled = false;
                confirmBtn.style.opacity = 1.0;
            } else {
                confirmBtn.disabled = true;
                confirmBtn.style.opacity = 0.5;
            }
        }
    }
    
    showDaimyoPrisonerModal(prisoner, options = {}) {
        this.ui.hideAIGuardTemporarily();
        
        // オプションの中に hideHire（登用を隠す）の指示がない時だけ、登用ボタンを作ります
        let hireBtnHtml = '';
        if (!options.hideHire) {
            if (prisoner.hasRefusedHire) {
                hireBtnHtml = `<button class="btn-primary" disabled style="opacity:0.5; background-color: #666;">拒否</button>`;
            } else {
                hireBtnHtml = `<button class="btn-primary" onclick="window.GameApp.warManager.handleDaimyoPrisonerAction('hire')">登用</button>`;
            }
        }

        // 大名か姫かで、画面に表示されるタイトルと説明文を変えてあげます
        const titleText = options.hideHire ? '姫の処遇' : '敵大名 捕縛！';
        const descText = options.hideHire ? `<strong>${prisoner.name}</strong>を捕らえました。<br>処遇を決めてください。` : `敵大名・<strong>${prisoner.name}</strong>を捕縛しました。<br>処遇を決めてください。`;

        // ボタンの並びを姫と大名で切り替えます
        let buttonsHtml = '';
        if (options.hideHire) {
            // 姫の場合：解放（灰）、据置（青）、処断（赤）の順番にします
            buttonsHtml = `
                <button class="btn-secondary" onclick="window.GameApp.warManager.handleDaimyoPrisonerAction('release')">解放</button>
                <button class="btn-primary" onclick="window.GameApp.warManager.handleDaimyoPrisonerAction('keep')">据置</button>
                <button class="btn-danger" onclick="window.GameApp.warManager.handleDaimyoPrisonerAction('kill')">処断</button>
            `;
        } else {
            // 大名の場合：登用（青）、解放（灰）、処断（赤）
            buttonsHtml = `
                ${hireBtnHtml}
                <button class="btn-secondary" onclick="window.GameApp.warManager.handleDaimyoPrisonerAction('release')">解放</button>
                <button class="btn-danger" onclick="window.GameApp.warManager.handleDaimyoPrisonerAction('kill')">処断</button>
            `;
        }

        const content = `
            <div style="text-align:center; padding: 10px;">
                <h3 style="margin-top:0;">${titleText}</h3>
                <p style="font-size:1.1rem;">${descText}</p>
                <div style="margin-top:20px; display:flex; justify-content:center; gap:10px;">
                    ${buttonsHtml}
                </div>
            </div>
        `;
        this.ui.showResultModal(content, null, ""); 
    }
    
    showSettingsModal() {
        const modal = document.getElementById('settings-modal');
        const bgmSlider = document.getElementById('setting-bgm-volume');
        const bgmText = document.getElementById('setting-bgm-text');
        const seSlider = document.getElementById('setting-se-volume');
        const seText = document.getElementById('setting-se-text');

        if (!modal || !bgmSlider || !seSlider) return;

        if (window.AudioManager) {
            bgmSlider.value = Math.round(window.AudioManager.userBgmVolume * 100);
            bgmText.textContent = bgmSlider.value + '%';
            
            seSlider.value = Math.round(window.AudioManager.userSeVolume * 100);
            seText.textContent = seSlider.value + '%';
        }

        bgmSlider.oninput = (e) => {
            const val = e.target.value;
            bgmText.textContent = val + '%';
            if (window.AudioManager) {
                window.AudioManager.setBgmVolume(val / 100); 
            }
        };

        seSlider.oninput = (e) => {
            const val = e.target.value;
            seText.textContent = val + '%';
            if (window.AudioManager) {
                window.AudioManager.setSeVolume(val / 100);
            }
        };
        
        seSlider.onchange = () => {
             if (window.AudioManager) window.AudioManager.playSE('choice.ogg');
        };
        
        modal.classList.remove('hidden');
    }

    // ==========================================
    // ★リスト画面の共通生成工場（ステップ１）
    // ==========================================
    _createBarHtml(percent, type) {
        const safePercent = Math.min(100, Math.max(0, Number(percent) || 0));
        return `<div style="display: flex; align-items: center; width: 100%; height: 100%;"><div class="bar-bg bar-bg-${type}"><div class="bar-fill bar-fill-${type}" style="width:${safePercent}%;"></div></div></div>`;
    }

    _renderListModal(config) {
        this._currentListRenderId = (this._currentListRenderId || 0) + 1;
        const currentRenderId = this._currentListRenderId;

        const modal = document.getElementById('selector-modal');
        const titleEl = document.getElementById('selector-title');
        const listContainer = document.getElementById('selector-list');
        const contextEl = document.getElementById('selector-context-info');
        const tabsEl = document.getElementById('selector-tabs');
        const confirmBtn = document.getElementById('selector-confirm-btn');
        const backBtn = document.querySelector('#selector-modal .btn-secondary');

        if (!modal || !listContainer) return;
        
        listContainer.style.display = 'none';
        listContainer.innerHTML = '';
        modal.classList.remove('hidden');

        if (titleEl) titleEl.textContent = config.title || "";

        if (contextEl) {
            if (config.contextHtml) {
                contextEl.classList.remove('hidden');
                contextEl.innerHTML = config.contextHtml;
            } else {
                contextEl.classList.add('hidden');
            }
        }

        if (tabsEl) {
            if (config.tabsHtml) {
                tabsEl.classList.remove('hidden');
                tabsEl.innerHTML = config.tabsHtml;
                
                // タブ切り替えとスコープ切り替えの一元化
                if (config.onTabClick) {
                    const tabBtns = tabsEl.querySelectorAll('.busho-tab-btn');
                    tabBtns.forEach(btn => {
                        btn.onclick = () => {
                            if (window.AudioManager) window.AudioManager.playSE('choice.ogg');
                            config.onTabClick(btn.getAttribute('data-tab'));
                        };
                    });
                }
                if (config.onScopeClick) {
                    const scopeBtns = tabsEl.querySelectorAll('.busho-scope-btn');
                    scopeBtns.forEach(btn => {
                        btn.onclick = () => {
                            if (window.AudioManager) window.AudioManager.playSE('choice.ogg');
                            config.onScopeClick(btn.getAttribute('data-scope'));
                        };
                    });
                }
            } else {
                tabsEl.classList.add('hidden');
            }
        }

        if (backBtn) {
            if (config.hideBackBtn) {
                backBtn.style.display = 'none';
            } else {
                backBtn.style.display = '';
                backBtn.textContent = (this.modalHistory && this.modalHistory.length > 0) ? '戻る' : '閉じる';
                backBtn.onclick = () => {
                    if (window.AudioManager) window.AudioManager.playSE('cancel.ogg');
                    if (config.onBack) config.onBack();
                    this._currentListRenderId++; 
                    this.popModal();
                };
                const footer = backBtn.parentElement;
                if (footer) footer.style.justifyContent = 'center';
            }
        }

        if (confirmBtn) {
            if (config.onConfirm) {
                confirmBtn.classList.remove('hidden');
                confirmBtn.disabled = true;
                confirmBtn.style.opacity = '0.5';
                confirmBtn.style.cursor = 'not-allowed';
                confirmBtn.onclick = () => {
                    this._currentListRenderId++; 
                    config.onConfirm();
                };
            } else {
                confirmBtn.classList.add('hidden');
            }
        }

        listContainer.className = `list-container ${config.listClass || ''} hide-native-scroll`;

        if (config.gridTemplateSp) listContainer.style.setProperty('--grid-cols-sp', config.gridTemplateSp);
        else listContainer.style.removeProperty('--grid-cols-sp');
        
        if (config.gridTemplatePc) listContainer.style.setProperty('--grid-cols-pc', config.gridTemplatePc);
        else listContainer.style.removeProperty('--grid-cols-pc');

        let wrapperStyle = "";
        if (config.minWidth) {
            wrapperStyle = `width: ${config.minWidth}; min-width: 100%;`;
        }

        const buildItemHtml = (item, index) => {
            const cursorStr = item.onClick ? "style='cursor:pointer;'" : "style='cursor:default;'";
            const extraClass = item.itemClass || '';
            let clickStr = "";
            let indexAttr = "";
            if (item.onClick) {
                if (typeof item.onClick === 'function') {
                    indexAttr = `data-action-index="${index}"`; 
                } else {
                    clickStr = `onclick="if(window.AudioManager) window.AudioManager.playSE('choice.ogg'); ${item.onClick}"`;
                }
            }
            // 先ほどの文字数を数える魔法は取り消して、シンプルな形に戻します
            const cells = item.cells.map(c => {
                const strC = String(c);
                return strC.trim().startsWith('<') ? strC : `<span>${strC}</span>`;
            }).join('');
            return `<div class="select-item ${config.itemClass || ''} ${extraClass}" ${cursorStr} ${clickStr} ${indexAttr}>${cells}</div>`;
        };

        if (!config.items || config.items.length === 0) {
            let emptyHtml = '';
            if (config.headers && config.headers.length > 0) {
                const headerCols = config.headers.map(h => h.trim().startsWith('<') ? h : `<span>${h}</span>`).join('');
                emptyHtml += `<div class="list-header ${config.headerClass || ''}">${headerCols}</div>`;
            }
            emptyHtml += config.emptyHtml || '<div style="padding: 10px; text-align: center;">データがありません。</div>';
            listContainer.innerHTML = `<div class="list-inner-wrapper" style="${wrapperStyle}">${emptyHtml}</div>`;
            listContainer.style.display = 'block';
            return;
        }

        const totalItems = config.items.length;
        const INITIAL_RENDER_COUNT = 30;
        const CHUNK_SIZE = 50;

        // ★スクロール位置を復元するために、あらかじめ必要な数だけリストを生成しておく魔法
        let assumedItemHeight = 40; 
        let requiredItems = config.scrollPos ? Math.ceil(config.scrollPos / assumedItemHeight) + 20 : INITIAL_RENDER_COUNT;
        const initialLimit = Math.min(totalItems, Math.max(INITIAL_RENDER_COUNT, requiredItems));

        let initialHtmlParts = [];
        
        if (config.headers && config.headers.length > 0) {
            const headerCols = config.headers.map(h => h.trim().startsWith('<') ? h : `<span>${h}</span>`).join('');
            initialHtmlParts.push(`<div class="list-header sortable-header ${config.headerClass || ''}">${headerCols}</div>`);
        }

        for (let i = 0; i < initialLimit; i++) {
            initialHtmlParts.push(buildItemHtml(config.items[i], i));
        }
        
        for (let i = totalItems; i < 8; i++) {
            const emptyCells = config.headers ? config.headers.map(() => `<span></span>`).join('') : '';
            initialHtmlParts.push(`<div class="select-item ${config.itemClass || ''}" style="cursor:default; pointer-events:none;">${emptyCells}</div>`);
        }

        listContainer.innerHTML = `<div class="list-inner-wrapper" style="${wrapperStyle}">${initialHtmlParts.join('')}</div>`;

        // ★新しい魔法：リストが画面に出た直後に、実際の「枠の幅」と「文字の幅」を測って調整します
        const adjustTextFit = (startIndex, endIndex) => {
            const listInner = listContainer.querySelector('.list-inner-wrapper');
            if (!listInner) return;
            const itemEls = listInner.querySelectorAll('.select-item');
            for (let i = startIndex; i < endIndex; i++) {
                if (itemEls[i]) {
                    const cells = itemEls[i].children;
                    for (let j = 0; j < cells.length; j++) {
                        const cell = cells[j];
                        // ゲージやアイコンなどの複雑な要素はスキップします
                        if (cell.querySelector('.bar-bg') || cell.querySelector('.bar-bg-busho') || cell.querySelector('input') || cell.querySelector('img')) continue;
                        
                        // はみ出しているかチェック（scrollWidth が clientWidth より大きければはみ出しています）
                        if (cell.scrollWidth > cell.clientWidth && cell.clientWidth > 0) {
                            // はみ出している割合を計算して、ギリギリ収まるサイズに縮めます（少しだけ余裕を持たせます）
                            const ratio = cell.clientWidth / cell.scrollWidth;
                            const scale = Math.max(0.6, ratio * 0.95); // 限界まで小さくなっても読めるように0.6倍でストップさせます
                            cell.style.fontSize = `calc(100% * ${scale})`;
                        }
                    }
                }
            }
        };

        const attachEvents = (startIndex, endIndex) => {
            if (config.items) {
                const actionElements = listContainer.querySelectorAll('[data-action-index]');
                actionElements.forEach(el => {
                    if (el.dataset.eventAttached) return;
                    const index = parseInt(el.getAttribute('data-action-index'));
                    if (index >= startIndex && index < endIndex && config.items[index] && typeof config.items[index].onClick === 'function') {
                        el.addEventListener('click', config.items[index].onClick);
                        el.dataset.eventAttached = "true";
                    }
                });
            }
            
            // ★イベントを付けた直後（画面に文字が描画された直後）にサイズ調整の魔法を発動します！
            requestAnimationFrame(() => {
                adjustTextFit(startIndex, endIndex);
            });
        };

        attachEvents(0, initialLimit);

        if (config.onSortClick) {
            const headerSpans = listContainer.querySelectorAll('.sortable-header span[data-sort]');
            headerSpans.forEach(span => {
                span.onclick = (e) => {
                    const key = e.currentTarget.getAttribute('data-sort');
                    if (!key) return;
                    if (window.AudioManager) window.AudioManager.playSE('choice.ogg');
                    config.onSortClick(key);
                };
            });
        }

        if (window.CustomScrollbar) {
            if (!this.ui.bushoScrollbar) this.ui.bushoScrollbar = new CustomScrollbar(listContainer);
        }

        listContainer.style.display = 'block';
        listContainer.scrollTop = config.scrollPos || 0;
        if (this.ui.bushoScrollbar) {
            this.ui.bushoScrollbar.update();
        }

        if (totalItems > initialLimit) {
            let currentIndex = initialLimit;
            const renderNextChunk = () => {
                if (this._currentListRenderId !== currentRenderId) return;

                const chunkParts = [];
                const endLimit = Math.min(currentIndex + CHUNK_SIZE, totalItems);
                
                for (let i = currentIndex; i < endLimit; i++) {
                    chunkParts.push(buildItemHtml(config.items[i], i));
                }
                
                const innerWrapper = listContainer.querySelector('.list-inner-wrapper');
                if (innerWrapper) {
                    innerWrapper.insertAdjacentHTML('beforeend', chunkParts.join(''));
                }
                
                attachEvents(currentIndex, endLimit);
                currentIndex = endLimit;

                if (this.ui.bushoScrollbar) this.ui.bushoScrollbar.update();

                if (currentIndex < totalItems) {
                    requestAnimationFrame(renderNextChunk);
                }
            };
            requestAnimationFrame(renderNextChunk);
        }
    }

    // ==========================================
    // ★姫一覧＆姫選択の魔法（共通モーダル対応版）
    // ==========================================

    showPrincessList() {
        this.pushModal('princess_list', [false, null, null]);
    }

    showPrincessSelector(targetCastleId, doerId) {
        this.closeCommonModal(); 
        this.pushModal('princess_list', [true, targetCastleId, doerId]);
    }
    
    _renderPrincessList(isSelectMode, targetCastleId, doerId, scrollPos = 0) {
        const myClanId = this.game.playerClanId;
        const myClan = this.game.clans.find(c => c.id === myClanId);
        
        let myPrincesses = [];
        if (myClan) {
            let pIds = Array.isArray(myClan.princessIds) ? [...myClan.princessIds] : [];
            const myBushos = this.game.bushos.filter(b => b.clan === myClanId && b.status === 'active');
            myBushos.forEach(b => {
                if (Array.isArray(b.wifeIds)) {
                    b.wifeIds.forEach(wId => {
                        if (!pIds.includes(wId)) {
                            pIds.push(wId);
                        }
                    });
                }
            });
            myPrincesses = pIds
                .map(id => this.game.princesses.find(p => p.id === id))
                .filter(p => p !== undefined); 
        }

        let princesses = [];
        let tabsHtml = null;
        
        if (isSelectMode) {
            // ★自家の大名を取得します
            const myDaimyo = this.game.bushos.find(b => b.clan === myClanId && b.isDaimyo);
            
            princesses = myPrincesses.filter(p => {
                // 未婚でなければリストに入れません
                if (p.status !== 'unmarried') return false;
                
                // ★大名が存在し、一門であるかチェックします
                if (myDaimyo) {
                    const pFamily = Array.isArray(p.familyIds) ? p.familyIds : [];
                    const dFamily = Array.isArray(myDaimyo.familyIds) ? myDaimyo.familyIds : [];
                    if (pFamily.includes(myDaimyo.id) || dFamily.includes(p.id)) {
                        return true;
                    }
                }
                return false; // 一門でなければリストから除外します
            });
            this.selectedPrincessId = null; 
        } else if (doerId === 'view_clan_princess') {
            const viewClanId = targetCastleId;
            const viewClan = this.game.clans.find(c => c.id === viewClanId);
            let pIds = viewClan && Array.isArray(viewClan.princessIds) ? [...viewClan.princessIds] : [];
            const clanBushos = this.game.bushos.filter(b => b.clan === viewClanId && b.status === 'active');
            clanBushos.forEach(b => {
                if (Array.isArray(b.wifeIds)) {
                    b.wifeIds.forEach(wId => {
                        if (!pIds.includes(wId)) pIds.push(wId);
                    });
                }
            });
            princesses = pIds.map(id => this.game.princesses.find(p => p.id === id)).filter(p => p !== undefined && p.status !== 'unborn' && p.status !== 'dead');
        } else {
            if (!this.princessCurrentScope) this.princessCurrentScope = 'clan';

            if (this.princessCurrentScope === 'clan' && myPrincesses.length === 0) {
                this.princessCurrentScope = 'all';
            }
            
            if (this.princessCurrentScope === 'clan') {
                princesses = myPrincesses;
            } else {
                princesses = this.game.princesses.filter(p => p.status !== 'unborn' && p.status !== 'dead');
            }

            tabsHtml = `
                <div style="display: flex; gap: 5px; margin-left: 15px;">
                    <button class="busho-scope-btn ${this.princessCurrentScope === 'clan' ? 'active' : ''}" data-scope="clan">自家</button>
                    <button class="busho-scope-btn ${this.princessCurrentScope === 'all' ? 'active' : ''}" data-scope="all">全国</button>
                </div>
            `;
        }

        if (this.princessCurrentSortKey) {
            princesses = this._prepareStableSortBase('princess', princesses, this.princessCurrentSortKey); // ★共通の魔法
            princesses.sort((a, b) => {
                let valA, valB;
                const fatherA = this.game.getBusho(a.fatherId);
                const fatherB = this.game.getBusho(b.fatherId);
                const husbandA = this.game.getBusho(a.husbandId);
                const husbandB = this.game.getBusho(b.husbandId);
                const clanA = this.game.clans.find(c => c.id === ((a.husbandId && a.husbandId !== 0) ? a.currentClanId : a.originalClanId));
                const clanB = this.game.clans.find(c => c.id === ((b.husbandId && b.husbandId !== 0) ? b.currentClanId : b.originalClanId));

                switch(this.princessCurrentSortKey) {
                    case 'name': 
                        valA = a.yomi || a.name; 
                        valB = b.yomi || b.name; 
                        break;
                    case 'clan': 
                        valA = clanA ? (clanA.yomi || clanA.name) : "んんん"; 
                        valB = clanB ? (clanB.yomi || clanB.name) : "んんん"; 
                        break;
                    case 'age': 
                        valA = this.game.year - a.birthYear; 
                        valB = this.game.year - b.birthYear; 
                        break;
                    case 'family': 
                        const getFamilyScore = (p, clan) => {
                            let mark = 0;
                            if (clan) {
                                const daimyo = this.game.getBusho(clan.leaderId);
                                if (daimyo) {
                                    const pFamily = Array.isArray(p.familyIds) ? p.familyIds : [];
                                    const dFamily = Array.isArray(daimyo.familyIds) ? daimyo.familyIds : [];
                                    if (pFamily.includes(daimyo.id) || dFamily.includes(p.id)) mark = 1;
                                }
                            }
                            return mark;
                        };
                        valA = getFamilyScore(a, clanA); 
                        valB = getFamilyScore(b, clanB); 
                        break;
                    case 'father': 
                        valA = fatherA ? (fatherA.yomi || fatherA.name) : "んんん"; 
                        valB = fatherB ? (fatherB.yomi || fatherB.name) : "んんん"; 
                        break;
                    case 'husband': 
                        valA = husbandA ? (husbandA.yomi || husbandA.name) : "んんん"; 
                        valB = husbandB ? (husbandB.yomi || husbandB.name) : "んんん"; 
                        break;
                }

                const nameA = a.yomi || a.name;
                const nameB = b.yomi || b.name;
                const fallbackCmp = this.isPrincessSortAsc ? nameA.localeCompare(nameB, 'ja') : nameB.localeCompare(nameA, 'ja');
                
                return this._compareForSort(valA, valB, this.isPrincessSortAsc, fallbackCmp);
            });
            this._saveStableSortResult('princess', princesses); // ★結果を保存
        } else {
            this._saveStableSortResult('princess', null); // ★リセット
        }

        const items = princesses.map(p => {
            const age = this.game.year - p.birthYear + 1;
            const father = this.game.getBusho(p.fatherId);
            const husband = this.game.getBusho(p.husbandId);
            
            const targetClanId = (p.husbandId && p.husbandId !== 0) ? p.currentClanId : p.originalClanId;
            const targetClan = this.game.clans.find(c => c.id === targetClanId);
            const clanName = targetClan ? targetClan.name : "無所属";

            let familyMark = "";
            if (targetClan) {
                const daimyo = this.game.getBusho(targetClan.leaderId);
                if (daimyo) {
                    const pFamily = Array.isArray(p.familyIds) ? p.familyIds : [];
                    const dFamily = Array.isArray(daimyo.familyIds) ? daimyo.familyIds : [];
                    if (pFamily.includes(daimyo.id) || dFamily.includes(p.id)) familyMark = "◯";
                }
            }

            return {
                onClick: isSelectMode ? `window.GameApp.ui.info.selectPrincess(${p.id}, this)` : null,
                cells: [
                    `<strong class="col-princess-name">${p.name}</strong>`,
                    `<span class="col-clan">${clanName}</span>`,
                    `<span class="col-age">${age}</span>`,
                    `<span class="col-family">${familyMark}</span>`,
                    `<span class="col-father">${father ? father.name : "不明"}</span>`,
                    `<span class="col-husband">${husband ? husband.name : "なし"}</span>`,
                    `<span class="pc-only"></span>` 
                ]
            };
        });

        let contextHtml = null;
        if (isSelectMode) {
            contextHtml = "<div>嫁がせる姫を選択してください</div>";
        }

        const getSortMark = (key) => this._getCommonSortMark(this.princessCurrentSortKey, this.isPrincessSortAsc, key);

        this._renderListModal({
            title: "姫一覧",
            contextHtml: contextHtml,
            tabsHtml: tabsHtml,
            headers: [
                `<span class="col-princess-name" data-sort="name">姫${getSortMark('name')}</span>`,
                `<span class="col-clan" data-sort="clan">勢力${getSortMark('clan')}</span>`,
                `<span class="col-age" data-sort="age">年齢${getSortMark('age')}</span>`,
                `<span class="col-family" data-sort="family">一門${getSortMark('family')}</span>`,
                `<span class="col-father" data-sort="father">父親${getSortMark('father')}</span>`,
                `<span class="col-husband" data-sort="husband">配偶者${getSortMark('husband')}</span>`,
                `<span class="pc-only"></span>`
            ],
            headerClass: "sortable-header princess-list-header",
            itemClass: "princess-list-item",
            listClass: "princess-list-container",
            items: items,
            scrollPos: scrollPos,
            gridTemplateSp: "1.3fr 1.5fr 0.8fr 0.8fr 1.5fr 1.5fr",
            gridTemplatePc: "95px 100px 50px 50px 100px 100px 1fr",
            onBack: isSelectMode ? () => this.openBushoSelector('diplomacy_doer', targetCastleId, { subAction: 'marriage' }) : null,
            onConfirm: isSelectMode ? () => this.confirmPrincessSelection(targetCastleId, doerId) : null,
            onScopeClick: (scopeKey) => {
                this.princessCurrentScope = scopeKey;
                this._renderPrincessList(isSelectMode, targetCastleId, doerId, 0);
            },
            onSortClick: (sortKey) => {
                const defaultAscKeys = ['name', 'clan', 'father', 'husband'];
                const newState = this._toggleSortState(this.princessCurrentSortKey, this.isPrincessSortAsc, sortKey, defaultAscKeys);
                this.princessCurrentSortKey = newState.key;
                this.isPrincessSortAsc = newState.isAsc;
                const listEl = document.getElementById('selector-list');
                const scroll = listEl ? listEl.scrollTop : 0;
                this._renderPrincessList(isSelectMode, targetCastleId, doerId, scroll);
            }
        });
    }

    selectPrincess(princessId, element) {
        const items = document.querySelectorAll('.princess-list-item');
        items.forEach(item => item.classList.remove('selected'));

        element.classList.add('selected');
        this.selectedPrincessId = princessId;

        const confirmBtn = document.getElementById('selector-confirm-btn');
        if (confirmBtn) {
            confirmBtn.disabled = false;
            confirmBtn.style.opacity = '1';
            confirmBtn.style.cursor = 'pointer';
        }
    }

    confirmPrincessSelection(targetCastleId, doerId) {
        if (!this.selectedPrincessId) return;
        
        this.closeCommonModal(); 
        
        window.GameApp.commandSystem.handleBushoSelection('marriage_princess', [this.selectedPrincessId], targetCastleId, { doerId: doerId });
        this.selectedPrincessId = null; 
    }
    
    // ==========================================
    // ★城主委任リストの魔法（共通モーダル対応版）
    // ==========================================
    showDelegateListModal() {
        this.closeCommonModal(); 
        this.pushModal('delegate_list', []);
    }

    _renderDelegateList(scrollPos = 0) {
        const daimyo = this.game.bushos.find(b => b.clan === this.game.playerClanId && b.isDaimyo);
        const daimyoCastleId = daimyo ? daimyo.castleId : -1;
        const myCastles = this.game.castles.filter(c => c.ownerClan === this.game.playerClanId && c.id !== daimyoCastleId);

        const isAllDelegated = myCastles.length > 0 && myCastles.every(c => c.isDelegated);
        let toggleBtnClass = isAllDelegated ? "btn-toggle-delegated" : "btn-toggle-direct";

        const contextHtml = `<button id="btn-toggle-all-delegate" class="btn-secondary btn-small ${toggleBtnClass}">一括</button>`;

        let items = [];
        myCastles.forEach(c => {
            const statusClass = c.isDelegated ? 'text-blue' : 'text-red';
            const statusText = c.isDelegated ? '委任' : '直轄';
            const attackText = c.allowAttack ? '許可' : '不可';
            const attackClass = c.allowAttack ? 'text-blue' : 'text-gray';
            const moveText = c.allowMove ? '許可' : '不可';
            const moveClass = c.allowMove ? 'text-blue' : 'text-gray';
            const attackDisplay = c.isDelegated ? `<span class="${attackClass}">${attackText}</span>` : `<span class="text-gray"></span>`;
            const moveDisplay = c.isDelegated ? `<span class="${moveClass}">${moveText}</span>` : `<span class="text-gray"></span>`;

            items.push({
                onClick: `window.GameApp.ui.info.showDelegateSettingModal(${c.id})`,
                cells: [
                    `<span class="col-castle-name" style="font-weight:bold; justify-content:flex-start; padding-left:5px;">${c.name}</span>`,
                    attackDisplay,
                    moveDisplay,
                    `<span class="${statusClass}" style="font-weight:bold;">${statusText}</span>`
                ]
            });
        });

        this._renderListModal({
            title: "委任設定",
            contextHtml: contextHtml,
            headers: ["拠点名", "城攻", "武将移動", "状態"],
            headerClass: "delegate-list-header",
            itemClass: "delegate-list-item",
            listClass: "delegate-list-container",
            items: items,
            emptyHtml: '<div style="padding: 10px; text-align: center;">委任できる城がありません。</div>',
            scrollPos: scrollPos,
            gridTemplateSp: "1.5fr 1fr 1fr 1fr",
            gridTemplatePc: "200px 100px 100px 100px"
        });

        setTimeout(() => {
            const toggleAllBtn = document.getElementById('btn-toggle-all-delegate');
            if (toggleAllBtn) {
                toggleAllBtn.onclick = () => {
                    if (window.AudioManager) window.AudioManager.playSE('choice.ogg');
                    const newState = !isAllDelegated;
                    myCastles.forEach(c => c.isDelegated = newState);
                    const listContainer = document.getElementById('selector-list');
                    this._renderDelegateList(listContainer ? listContainer.scrollTop : 0);
                };
            }
        }, 10);
    }

    showDelegateSettingModal(castleId) {
        this.pushModal('delegate_setting', [castleId]);
    }

    _renderDelegateSetting(castleId, scrollPos = 0) {
        const castle = this.game.castles.find(c => c.id === castleId);
        if (!castle) return;

        const modal = document.getElementById('selector-modal');
        const titleEl = document.getElementById('selector-title');
        const listContainer = document.getElementById('selector-list');
        const contextEl = document.getElementById('selector-context-info');
        const tabsEl = document.getElementById('selector-tabs');
        const confirmBtn = document.getElementById('selector-confirm-btn');
        const backBtn = document.querySelector('#selector-modal .btn-secondary');

        if (!modal) return;
        modal.classList.remove('hidden');
        if (titleEl) titleEl.textContent = `${castle.name} の委任設定`;
        if (contextEl) contextEl.classList.add('hidden');
        if (confirmBtn) confirmBtn.classList.add('hidden');

        if(backBtn) {
            backBtn.style.display = '';
            backBtn.textContent = this.modalHistory && this.modalHistory.length > 0 ? '戻る' : '閉じる';
            backBtn.onclick = () => {
                if (window.AudioManager) window.AudioManager.playSE('cancel.ogg');
                this.popModal();
            };
            const footer = backBtn.parentElement;
            if (footer) footer.style.justifyContent = 'center';
        }

        if (listContainer) {
            listContainer.className = 'list-container hide-native-scroll';
            listContainer.style.display = 'block';
            listContainer.innerHTML = `
                <div style="padding: 20px; text-align: center;">
                    <div style="margin: 20px 0; display: flex; justify-content: center; gap: 20px;">
                        <button id="btn-direct-control" class="delegate-btn ${!castle.isDelegated ? 'active' : ''}">直轄</button>
                        <button id="btn-delegate-control" class="delegate-btn ${castle.isDelegated ? 'active' : ''}">委任</button>
                    </div>
                    
                    <div id="delegate-options" style="margin-bottom: 20px; padding: 15px; background: #f9f9f9; border-radius: 8px; text-align: left; opacity: ${castle.isDelegated ? '1' : '0.5'}; transition: opacity 0.3s;">
                        <div style="margin-bottom: 15px;">
                            <span style="font-weight: bold; display: inline-block; width: 100px;">城攻め：</span>
                            <button id="btn-attack-deny" class="delegate-sub-btn ${!castle.allowAttack ? 'active' : ''}" ${!castle.isDelegated ? 'disabled' : ''}>不可</button>
                            <button id="btn-attack-allow" class="delegate-sub-btn ${castle.allowAttack ? 'active-allow' : ''}" ${!castle.isDelegated ? 'disabled' : ''}>許可</button>
                        </div>
                        <div>
                            <span style="font-weight: bold; display: inline-block; width: 100px;">武将移動：</span>
                            <button id="btn-move-deny" class="delegate-sub-btn ${!castle.allowMove ? 'active' : ''}" ${!castle.isDelegated ? 'disabled' : ''}>不可</button>
                            <button id="btn-move-allow" class="delegate-sub-btn ${castle.allowMove ? 'active-allow' : ''}" ${!castle.isDelegated ? 'disabled' : ''}>許可</button>
                        </div>
                    </div>
                </div>
            `;

            const updateView = () => this._renderDelegateSetting(castleId, listContainer.scrollTop);

            document.getElementById('btn-direct-control').onclick = () => {
                if (window.AudioManager) window.AudioManager.playSE('choice.ogg');
                castle.isDelegated = false;
                updateView();
            };
            document.getElementById('btn-delegate-control').onclick = () => {
                if (window.AudioManager) window.AudioManager.playSE('choice.ogg');
                castle.isDelegated = true;
                updateView();
            };
            document.getElementById('btn-attack-deny').onclick = () => {
                if (window.AudioManager) window.AudioManager.playSE('choice.ogg');
                castle.allowAttack = false;
                updateView();
            };
            document.getElementById('btn-attack-allow').onclick = () => {
                if (window.AudioManager) window.AudioManager.playSE('choice.ogg');
                castle.allowAttack = true;
                updateView();
            };
            document.getElementById('btn-move-deny').onclick = () => {
                if (window.AudioManager) window.AudioManager.playSE('choice.ogg');
                castle.allowMove = false;
                updateView();
            };
            document.getElementById('btn-move-allow').onclick = () => {
                if (window.AudioManager) window.AudioManager.playSE('choice.ogg');
                castle.allowMove = true;
                updateView();
            };
        }
    }
    
    // ==========================================
    // ★ここから追加：拠点詳細の魔法です！
    // ==========================================
    showCastleDetail(castleId) {
        this.pushModal('castle_detail', [castleId]);
    }

    _renderCastleDetail(castleId, scrollPos = 0) {
        const castle = this.game.castles.find(c => c.id === castleId);
        if (!castle) return;

        const modal = document.getElementById('selector-modal');
        const title = document.getElementById('selector-title');
        const listContainer = document.getElementById('selector-list');
        const contextEl = document.getElementById('selector-context-info');
        const tabsEl = document.getElementById('selector-tabs');
        const confirmBtn = document.getElementById('selector-confirm-btn');
        const backBtn = document.querySelector('#selector-modal .btn-secondary');

        modal.classList.remove('hidden');
        if (title) title.textContent = "拠点情報";
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

        const clanData = this.game.clans.find(cd => cd.id === castle.ownerClan);
        const clanName = clanData ? clanData.name : "無所属";
        const castellan = this.game.getBusho(castle.castellanId);
        const castellanName = castellan ? castellan.name : "なし";

        let provinceName = "不明";
        if (this.game.provinces) {
            const province = this.game.provinces.find(p => p.id === castle.provinceId);
            if (province) provinceName = province.province;
        }

        const kunishus = this.game.kunishuSystem ? this.game.kunishuSystem.getKunishusInCastle(castle.id) : [];
        const kunishuCount = kunishus.length;

        // ★ 武将の人数も数えておきます
        const targetBushos = this.game.bushos.filter(b => {
            // まずは、その城にいるかどうかをチェックします
            if (b.castleId !== castle.id) return false;
            
            // 浪人なら無条件でリストに入れます
            if (b.status === 'ronin') return true;
            
            // 城に持ち主（勢力）がいる場合は、その勢力の武将もリストに入れます
            if (castle.ownerClan > 0 && b.status === 'active' && b.clan === castle.ownerClan) return true;
            
            return false;
        });
        const bushoCount = targetBushos.length;

        let totalGoldIncome = GameSystem.calcBaseGoldIncome(castle);
        let totalRiceIncome = GameSystem.calcBaseRiceIncome(castle);

        let faceHtml = "";
        if (castellan && castellan.faceIcon) {
            faceHtml = `<img src="data/images/faceicons/${castellan.faceIcon}" class="daimyo-detail-face" onerror="this.style.display='none'">`;
        } else {
            faceHtml = `<div class="sp-face-wrapper daimyo-detail-face" style="display: flex; box-sizing: border-box;"></div>`;
        }

        const yomiStr = castle.yomi ? castle.yomi : "";

        if (listContainer) {
            listContainer.className = 'list-container hide-native-scroll';
            listContainer.style.display = 'block';
            listContainer.innerHTML = `
                <div class="daimyo-detail-container" style="padding: 10px;">
                    <div class="daimyo-detail-header pc-only" style="margin-bottom: 10px;">
                        <div style="display:flex; flex-direction:column;">
                            <span style="font-size:0.8rem; color:#ccc; margin-bottom:2px;">${yomiStr}</span>
                            <div style="display:flex; align-items:center; gap:10px;">
                                <div class="daimyo-detail-name" style="font-size: 1.5rem;">${castle.name}</div>
                            </div>
                        </div>
                    </div>
                    <div class="daimyo-detail-body">
                        <div class="daimyo-detail-left">
                            ${faceHtml}
                            <div class="daimyo-detail-header sp-only" style="flex-direction:column; align-items:flex-start; gap:2px; margin-bottom: 0; justify-content: center;">
                                <span style="font-size:0.75rem; color:#ccc;">${yomiStr}</span>
                                <div style="display:flex; align-items:center; gap:5px;">
                                    <div class="daimyo-detail-name" style="font-size:1.3rem;">${castle.name}</div>
                                </div>
                            </div>
                        </div>
                        <div class="daimyo-detail-right">
                            <div class="daimyo-detail-row daimyo-detail-3col">
                                <div class="daimyo-detail-stat-box"><span class="daimyo-detail-label">勢力</span><span class="daimyo-detail-value">${clanName}</span></div>
                                <div class="daimyo-detail-stat-box"><span class="daimyo-detail-label">所属</span><span class="daimyo-detail-value">${provinceName}</span></div>
                                <div class="daimyo-detail-stat-box"><span class="daimyo-detail-label">城主</span><span class="daimyo-detail-value">${castellanName}</span></div>
                            </div>
                            <div class="daimyo-detail-row daimyo-detail-3col">
                                <div class="daimyo-detail-stat-box"><span class="daimyo-detail-label">石高</span><span class="daimyo-detail-value">${castle.kokudaka}</span></div>
                                <div class="daimyo-detail-stat-box"><span class="daimyo-detail-label">鉱山</span><span class="daimyo-detail-value">${castle.commerce}</span></div>
                                <div class="daimyo-detail-stat-box"><span class="daimyo-detail-label">民忠</span><span class="daimyo-detail-value">${castle.peoplesLoyalty}</span></div>
                            </div>
                            <div class="daimyo-detail-row daimyo-detail-2col">
                                <div class="daimyo-detail-stat-box"><span class="daimyo-detail-label">兵士</span><span class="daimyo-detail-value">${castle.soldiers}</span></div>
                                <div class="daimyo-detail-stat-box"><span class="daimyo-detail-label">人口</span><span class="daimyo-detail-value">${castle.population}</span></div>
                            </div>
                            <div class="daimyo-detail-row daimyo-detail-2col">
                                <div class="daimyo-detail-stat-box"><span class="daimyo-detail-label">金</span><span class="daimyo-detail-value">${castle.gold}</span></div>
                                <div class="daimyo-detail-stat-box"><span class="daimyo-detail-label">金収入/月</span><span class="daimyo-detail-value">${totalGoldIncome}</span></div>
                            </div>
                            <div class="daimyo-detail-row daimyo-detail-2col">
                                <div class="daimyo-detail-stat-box"><span class="daimyo-detail-label">兵糧</span><span class="daimyo-detail-value">${castle.rice}</span></div>
                                <div class="daimyo-detail-stat-box"><span class="daimyo-detail-label">兵糧収入/年</span><span class="daimyo-detail-value">${totalRiceIncome}</span></div>
                            </div>
                            <div class="daimyo-detail-row daimyo-detail-3col">
                                <div class="daimyo-detail-stat-box"><span class="daimyo-detail-label">防御</span><span class="daimyo-detail-value">${castle.defense}</span></div>
                                <div class="daimyo-detail-stat-box"><span class="daimyo-detail-label">軍馬</span><span class="daimyo-detail-value">${castle.horses || 0}</span></div>
                                <div class="daimyo-detail-stat-box"><span class="daimyo-detail-label">鉄砲</span><span class="daimyo-detail-value">${castle.guns || 0}</span></div>
                            </div>
                        </div>
                    </div>
                    <div style="display: flex; justify-content: flex-end; gap: 10px; margin-top: 15px;">
                        <button class="daimyo-detail-action-btn" id="castle-busho-btn" ${bushoCount === 0 ? 'disabled' : ''}>武将</button>
                        <button class="daimyo-detail-action-btn" id="castle-kunishu-btn" ${kunishuCount === 0 ? 'disabled' : ''}>諸勢力</button>
                    </div>
                </div>
            `;

            const btnKunishu = document.getElementById('castle-kunishu-btn');
            if (btnKunishu && kunishuCount > 0) {
                btnKunishu.onclick = (e) => {
                    e.stopPropagation();
                    if (window.AudioManager) window.AudioManager.playSE('decision.ogg');
                    this.showKunishuList(kunishus, castle);
                };
            }

            const btnBusho = document.getElementById('castle-busho-btn');
            if (btnBusho && bushoCount > 0) {
                btnBusho.onclick = (e) => {
                    e.stopPropagation();
                    if (window.AudioManager) window.AudioManager.playSE('decision.ogg');
                    this.openBushoSelector('view_only', null, { 
                        customBushos: targetBushos,
                        customInfoHtml: `<div>${castle.name} 滞在武将</div>`
                    });
                };
            }

            listContainer.scrollTop = scrollPos;
        }
    }

    // ==========================================
    // ★ここから追加：拠点一覧の魔法です！
    // ==========================================
    showKyotenList(clanId = null, isDirect = false) {
        if (isDirect) {
            this.closeCommonModal(); 
        }
        this.kyotenSavedCastles = null;
        this.kyotenSavedSortedCastles = null;
        this.kyotenLastSortStateKey = null;
        this.kyotenLastScope = null;
        this.pushModal('kyoten_list', [clanId]);
    }
    
    _renderKyotenList(clanId, scrollPos = 0) {
        this.kyotenTargetClanId = clanId !== null ? clanId : this.game.playerClanId;
        
        if (!this.currentKyotenTab) this.currentKyotenTab = 'status';
        if (!this.currentKyotenScope) this.currentKyotenScope = 'clan';
        
        if (clanId !== null) {
            this.currentKyotenScope = 'clan';
        }
        
        let scopeHtml = '';
        if (clanId === null) {
            scopeHtml = `
                <div style="display: flex; gap: 5px; margin-left: 15px;">
                    <button class="busho-scope-btn ${this.currentKyotenScope === 'clan' ? 'active' : ''}" data-scope="clan">自家</button>
                    <button class="busho-scope-btn ${this.currentKyotenScope === 'all' ? 'active' : ''}" data-scope="all">全国</button>
                </div>
            `;
        }

        let tabsHtml = `
            <div style="display: flex; gap: 5px;">
                <button class="busho-tab-btn ${this.currentKyotenTab === 'status' ? 'active' : ''}" data-tab="status">基本</button>
                <button class="busho-tab-btn ${this.currentKyotenTab === 'military' ? 'active' : ''}" data-tab="military">軍事</button>
                <button class="busho-tab-btn ${this.currentKyotenTab === 'economy' ? 'active' : ''}" data-tab="economy">経済</button>
            </div>
            ${scopeHtml}
        `;

        if (!this.kyotenSavedCastles || this.kyotenLastScope !== this.currentKyotenScope) {
            if (this.currentKyotenScope === 'all') {
                this.kyotenCastles = this.game.castles;
            } else {
                this.kyotenCastles = this.game.castles.filter(c => c.ownerClan === this.kyotenTargetClanId);
            }
            this.kyotenSavedCastles = this.kyotenCastles;
            this.kyotenLastScope = this.currentKyotenScope;
            this.kyotenSavedSortedCastles = null;
        }

        let displayCastles;
        const currentSortStateKey = `${this.currentKyotenSortKey}_${this.isKyotenSortAsc}`;

        if (this.kyotenSavedSortedCastles && this.kyotenLastSortStateKey === currentSortStateKey) {
            displayCastles = this.kyotenSavedSortedCastles;
        } else {
            displayCastles = this._prepareStableSortBase('kyoten', this.kyotenSavedCastles, this.currentKyotenSortKey); // ★共通の魔法

            if (!this.currentKyotenSortKey) {
                // 基本の並び順として、sortNo を使って順番を整えます
                displayCastles.sort((a, b) => (a.sortNo || 0) - (b.sortNo || 0));
                this._saveStableSortResult('kyoten', null); // ★リセット
            } else {
                displayCastles.sort((a, b) => {
                    let valA = 0, valB = 0;

                    const getClanYomi = (c) => { const cd = this.game.clans.find(cd => cd.id === c.ownerClan); return cd ? (cd.yomi || cd.name) : "んんん"; };
                    const getClanName = (c) => { const cd = this.game.clans.find(cd => cd.id === c.ownerClan); return cd ? cd.name : ""; };
                    const getCastellanYomi = (c) => { const cb = this.game.getBusho(c.castellanId); return cb ? (cb.yomi || cb.name) : "んんん"; };
                    const getCastellanName = (c) => { const cb = this.game.getBusho(c.castellanId); return cb ? cb.name : ""; };
                    const getProvinceYomi = (c) => { const p = this.game.provinces && this.game.provinces.find(p => p.id === c.provinceId); return p ? (p.provinceYomi || p.province) : "んんん"; };
                    const getProvinceName = (c) => { const p = this.game.provinces && this.game.provinces.find(p => p.id === c.provinceId); return p ? p.province : ""; };
                    const getBushoCount = (c) => c.ownerClan > 0 ? this.game.bushos.filter(b => b.castleId === c.id && b.status === 'active' && b.clan === c.ownerClan).length : 0;

                    const getGoldIncome = (c) => GameSystem.calcBaseGoldIncome(c);
                    const getGoldConsume = (c) => {
                        let consume = 0;
                        const daimyo = this.game.bushos.find(b => b.clan === c.ownerClan && b.isDaimyo);
                        if (daimyo) {
                            this.game.bushos.filter(b => b.castleId === c.id && b.status === 'active').forEach(b => consume += b.getSalary(daimyo));
                        }
                        return consume;
                    };
                    const getRiceIncome = (c) => GameSystem.calcBaseRiceIncome(c);
                    const getRiceConsume = (c) => Math.floor(c.soldiers * window.MainParams.Economy.ConsumeRicePerSoldier) * 12;

                    switch (this.currentKyotenSortKey) {
                        case 'name': valA = a.yomi || a.name; valB = b.yomi || b.name; break;
                        case 'clan': valA = getClanYomi(a); valB = getClanYomi(b); break;
                        case 'castellan': valA = getCastellanYomi(a); valB = getCastellanYomi(b); break;
                        case 'province': valA = getProvinceYomi(a); valB = getProvinceYomi(b); break;
                        case 'bushoCount': valA = getBushoCount(a); valB = getBushoCount(b); break;
                        case 'gold': valA = a.gold || 0; valB = b.gold || 0; break;
                        case 'rice': valA = a.rice || 0; valB = b.rice || 0; break;
                        case 'soldiers': valA = a.soldiers || 0; valB = b.soldiers || 0; break;
                        case 'defense': valA = a.defense || 0; valB = b.defense || 0; break;
                        case 'morale': valA = a.morale || 0; valB = b.morale || 0; break;
                        case 'training': valA = a.training || 0; valB = b.training || 0; break;
                        case 'horses': valA = a.horses || 0; valB = b.horses || 0; break;
                        case 'guns': valA = a.guns || 0; valB = b.guns || 0; break;
                        case 'population': valA = a.population || 0; valB = b.population || 0; break;
                        case 'loyalty': valA = a.peoplesLoyalty || 0; valB = b.peoplesLoyalty || 0; break;
                        case 'kokudaka': valA = a.kokudaka || 0; valB = b.kokudaka || 0; break;
                        case 'commerce': valA = a.commerce || 0; valB = b.commerce || 0; break;
                        case 'goldIncome': valA = getGoldIncome(a); valB = getGoldIncome(b); break;
                        case 'goldConsume': valA = getGoldConsume(a); valB = getGoldConsume(b); break;
                        case 'riceIncome': valA = getRiceIncome(a); valB = getRiceIncome(b); break;
                        case 'riceConsume': valA = getRiceConsume(a); valB = getRiceConsume(b); break;
                    }

                    const nameA = this.currentKyotenSortKey === 'clan' ? getClanName(a) : (this.currentKyotenSortKey === 'castellan' ? getCastellanName(a) : (this.currentKyotenSortKey === 'province' ? getProvinceName(a) : a.name));
                    const nameB = this.currentKyotenSortKey === 'clan' ? getClanName(b) : (this.currentKyotenSortKey === 'castellan' ? getCastellanName(b) : (this.currentKyotenSortKey === 'province' ? getProvinceName(b) : b.name));
                    const fallbackCmp = this.isKyotenSortAsc ? nameA.localeCompare(nameB, 'ja') : nameB.localeCompare(nameA, 'ja');
                    
                    return this._compareForSort(valA, valB, this.isKyotenSortAsc, fallbackCmp);
                });
                this._saveStableSortResult('kyoten', displayCastles); // ★結果を保存
            }

            this.kyotenSavedSortedCastles = displayCastles;
            this.kyotenLastSortStateKey = currentSortStateKey;
        }

        const getSortMark = (key) => this._getCommonSortMark(this.currentKyotenSortKey, this.isKyotenSortAsc, key);
        
        let headers = [];
        let gridSpStr = "";
        let gridPcStr = "";

        if (this.currentKyotenTab === 'status') {
            gridSpStr = "2fr 1fr 1fr 1fr 0.8fr 1fr 1fr";
            gridPcStr = "140px 100px 100px 100px 60px 80px 80px 1fr";
            headers = [
                `<span class="col-castle-name" data-sort="name">拠点名${getSortMark('name')}</span>`,
                `<span class="col-clan" data-sort="clan">勢力${getSortMark('clan')}</span>`,
                `<span class="col-castellan" data-sort="castellan">城主${getSortMark('castellan')}</span>`,
                `<span class="col-province" data-sort="province">国${getSortMark('province')}</span>`,
                `<span class="col-busho-count" data-sort="bushoCount">武将${getSortMark('bushoCount')}</span>`,
                `<span class="col-gold" data-sort="gold">金${getSortMark('gold')}</span>`,
                `<span class="col-rice" data-sort="rice">兵糧${getSortMark('rice')}</span>`,
                `<span class="pc-only"></span>`
            ];
        } else if (this.currentKyotenTab === 'military') {
            gridSpStr = "2fr 1fr 1fr 1fr 1fr 1fr 1fr";
            gridPcStr = "140px 80px 80px 80px 80px 80px 80px 1fr";
            headers = [
                `<span class="col-castle-name" data-sort="name">拠点名${getSortMark('name')}</span>`,
                `<span class="col-soldiers" data-sort="soldiers">兵数${getSortMark('soldiers')}</span>`,
                `<span class="col-defense" data-sort="defense">防御${getSortMark('defense')}</span>`,
                `<span class="col-morale" data-sort="morale">士気${getSortMark('morale')}</span>`,
                `<span class="col-training" data-sort="training">訓練${getSortMark('training')}</span>`,
                `<span class="col-horses" data-sort="horses">軍馬${getSortMark('horses')}</span>`,
                `<span class="col-guns" data-sort="guns">鉄砲${getSortMark('guns')}</span>`,
                `<span class="pc-only"></span>`
            ];
        } else if (this.currentKyotenTab === 'economy') {
            gridSpStr = "2.5fr 1fr 0.8fr 1.2fr 1.2fr 1.5fr 1.5fr";
            gridPcStr = "140px 60px 50px 60px 60px 80px 80px 100px 100px";
            headers = [
                `<span class="col-castle-name" data-sort="name">拠点名${getSortMark('name')}</span>`,
                `<span class="col-population" data-sort="population">人口${getSortMark('population')}</span>`,
                `<span class="col-loyalty" data-sort="loyalty">民忠${getSortMark('loyalty')}</span>`,
                `<span class="col-kokudaka pc-only" data-sort="kokudaka">石高${getSortMark('kokudaka')}</span>`,
                `<span class="col-commerce pc-only" data-sort="commerce">鉱山${getSortMark('commerce')}</span>`,
                `<span class="col-gold-income" data-sort="goldIncome">金収入/月${getSortMark('goldIncome')}</span>`,
                `<span class="col-gold-consume" data-sort="goldConsume">金支出/月${getSortMark('goldConsume')}</span>`,
                `<span class="col-rice-income" data-sort="riceIncome">兵糧収入/年${getSortMark('riceIncome')}</span>`,
                `<span class="col-rice-consume" data-sort="riceConsume">兵糧支出/年${getSortMark('riceConsume')}</span>`
            ];
        }

        let items = [];
        
        displayCastles.forEach(c => {
            const clanData = this.game.clans.find(cd => cd.id === c.ownerClan);
            const clanName = clanData ? clanData.name : "";
            const castellan = this.game.getBusho(c.castellanId);
            const castellanName = castellan ? castellan.name : "";
            
            let provinceName = "";
            if (this.game.provinces) {
                const province = this.game.provinces.find(p => p.id === c.provinceId);
                if (province) provinceName = province.province;
            }
            
            const castleBushos = c.ownerClan > 0 ? this.game.bushos.filter(b => b.castleId === c.id && b.status === 'active' && b.clan === c.ownerClan) : [];
            const bushosCount = castleBushos.length;
            
            let riceIncome = GameSystem.calcBaseRiceIncome(c);
            let goldIncome = GameSystem.calcBaseGoldIncome(c);

            let consumeRice = Math.floor(c.soldiers * window.MainParams.Economy.ConsumeRicePerSoldier);
            let consumeRiceYear = consumeRice * 12; 
            
            let consumeGold = 0;
            const daimyo = this.game.bushos.find(b => b.clan === c.ownerClan && b.isDaimyo);
            if (daimyo) {
                castleBushos.forEach(b => {
                    consumeGold += b.getSalary(daimyo);
                });
            }
            
            let cells = [];
            if (this.currentKyotenTab === 'status') {
                cells = [
                    `<span class="col-castle-name" style="justify-content:flex-start; padding-left:5px;">${c.name}</span>`,
                    `<span class="col-clan">${clanName}</span>`,
                    `<span class="col-castellan">${castellanName}</span>`,
                    `<span class="col-province">${provinceName}</span>`,
                    `<span class="col-busho-count">${bushosCount}</span>`,
                    `<span class="col-gold">${c.gold}</span>`,
                    `<span class="col-rice">${c.rice}</span>`,
                    `<span class="pc-only"></span>`
                ];
            } else if (this.currentKyotenTab === 'military') {
                cells = [
                    `<span class="col-castle-name" style="justify-content:flex-start; padding-left:5px;">${c.name}</span>`,
                    `<span class="col-soldiers">${c.soldiers}</span>`,
                    `<span class="col-defense">${c.defense}</span>`,
                    `<span class="col-morale">${c.morale}</span>`,
                    `<span class="col-training">${c.training}</span>`,
                    `<span class="col-horses">${c.horses || 0}</span>`,
                    `<span class="col-guns">${c.guns || 0}</span>`,
                    `<span class="pc-only"></span>`
                ];
            } else if (this.currentKyotenTab === 'economy') {
                cells = [
                    `<span class="col-castle-name" style="justify-content:flex-start; padding-left:5px;">${c.name}</span>`,
                    `<span class="col-population">${c.population}</span>`,
                    `<span class="col-loyalty">${c.peoplesLoyalty}</span>`,
                    `<span class="col-kokudaka pc-only">${c.kokudaka}</span>`,
                    `<span class="col-commerce pc-only">${c.commerce}</span>`,
                    `<span class="col-gold-income">${goldIncome}</span>`,
                    `<span class="col-gold-consume">${consumeGold}</span>`,
                    `<span class="col-rice-income">${riceIncome}</span>`,
                    `<span class="col-rice-consume">${consumeRiceYear}</span>`
                ];
            }

            items.push({
                onClick: `window.GameApp.ui.info.showCastleDetail(${c.id})`,
                cells: cells
            });
        });

        this._renderListModal({
            title: "拠点一覧",
            tabsHtml: tabsHtml,
            headers: headers,
            headerClass: "sortable-header kyoten-mode",
            itemClass: "kyoten-mode",
            listClass: "kyoten-list-container",
            items: items,
            scrollPos: scrollPos,
            minWidth: "100%",
            gridTemplateSp: gridSpStr,
            gridTemplatePc: gridPcStr,
            onTabClick: (tabKey) => {
                this.currentKyotenTab = tabKey;
                const listEl = document.getElementById('selector-list');
                const scroll = listEl ? listEl.scrollTop : 0;
                this._renderKyotenList(clanId, scroll);
            },
            onScopeClick: (scopeKey) => {
                this.currentKyotenScope = scopeKey;
                const listEl = document.getElementById('selector-list');
                const scroll = listEl ? listEl.scrollTop : 0;
                this._renderKyotenList(clanId, scroll);
            },
            onSortClick: (sortKey) => {
                const defaultAscKeys = ['name', 'clan', 'castellan', 'province'];
                const newState = this._toggleSortState(this.currentKyotenSortKey, this.isKyotenSortAsc, sortKey, defaultAscKeys);
                this.currentKyotenSortKey = newState.key;
                this.isKyotenSortAsc = newState.isAsc;
                const listEl = document.getElementById('selector-list');
                const scroll = listEl ? listEl.scrollTop : 0;
                this._renderKyotenList(clanId, scroll);
            }
        });
    }

    // ==========================================
    // ★ここから追加：大名選択の確認画面の魔法！
    // ==========================================
    showDaimyoConfirmModal(clanId, clanName, soldiers, leader, onStart) {
        if (!this.ui.daimyoConfirmModal) return;

        // ★選択中の大名を記憶して、光を更新します
        this.ui.selectedDaimyoId = clanId;
        this.ui.updateCastleGlows();

        // ★追加：大名を選んだら、マップをスッキリさせるために名前シールを隠す合図を出します！
        document.body.classList.add('hide-daimyo-labels');
        
        // ★追加：「操作する勢力を選択してください」の案内板も隠します！
        const mapGuide = document.getElementById('map-guide');
        if (mapGuide) mapGuide.classList.add('hidden');

        this.ui.daimyoConfirmModal.classList.remove('hidden');
        
        // ★ここから追加：独立させたボタンを表示する魔法です
        const confirmButtons = document.querySelector('.daimyo-confirm-buttons');
        if (confirmButtons) confirmButtons.classList.remove('hidden');
        
        // ★修正：大名情報が出た時に「シナリオ選択に戻る」ボタンを確実に隠す魔法です！
        const backToScenarioBtn = document.getElementById('btn-back-to-scenario');
        if (backToScenarioBtn) backToScenarioBtn.classList.add('hidden');
        
        let faceHtml = "";
        if (leader && leader.faceIcon) {
            faceHtml = `<img src="data/images/faceicons/${leader.faceIcon}" class="daimyo-confirm-face" onerror="this.style.display='none'">`;
        }

        // 大名の情報を集めて合算します
        const clanCastles = this.game.castles.filter(c => c.ownerClan === clanId);
        const castlesCount = clanCastles.length;
        
        let totalPopulation = 0;
        let totalKokudaka = 0;
        let totalCommerce = 0;
        let totalGold = 0;
        let totalRice = 0;
        let totalHorses = 0;
        let totalGuns = 0;
        
        clanCastles.forEach(c => {
            totalPopulation += (c.population || 0);
            totalKokudaka += (c.kokudaka || 0);
            totalCommerce += (c.commerce || 0);
            totalGold += (c.gold || 0);
            totalRice += (c.rice || 0);
            totalHorses += (c.horses || 0);
            totalGuns += (c.guns || 0);
        });

        // 武将の数と姫の数も数えます
        const bushosCount = this.game.bushos.filter(b => b.clan === clanId && b.status !== 'dead' && b.status !== 'unborn').length;
        const clanData = this.game.clans.find(c => c.id === clanId);
        const princessCount = clanData && clanData.princessIds ? clanData.princessIds.length : 0;

        if (this.ui.daimyoConfirmBody) {
            this.ui.daimyoConfirmBody.innerHTML = `
                <div class="daimyo-confirm-compact">
                    ${faceHtml}
                    <div class="daimyo-confirm-info">
                        <h3 style="margin:0 0 5px 0; font-size:1.2rem; border:none; padding:0;">${clanName}</h3>
                        <div style="font-size:0.95rem; margin-bottom: 3px;">大名　${leader ? leader.name : "不明"}</div>
                    </div>
                </div>
                <div class="daimyo-confirm-stats">
                    <div class="stat-box"><span>城</span><span class="stat-val">${castlesCount}</span></div>
                    <div class="stat-box"><span>人口</span><span class="stat-val">${totalPopulation}</span></div>
                    <div class="stat-box"><span>武将</span><span class="stat-val">${bushosCount}</span></div>
                    <div class="stat-box"><span>姫</span><span class="stat-val">${princessCount}</span></div>
                    <div class="stat-box"><span>石高</span><span class="stat-val">${totalKokudaka}</span></div>
                    <div class="stat-box"><span>鉱山</span><span class="stat-val">${totalCommerce}</span></div>
                    <div class="stat-box"><span>金</span><span class="stat-val">${totalGold}</span></div>
                    <div class="stat-box"><span>兵糧</span><span class="stat-val">${totalRice}</span></div>
                    <div class="stat-box"><span>兵士</span><span class="stat-val">${soldiers}</span></div>
                    <div class="stat-box"><span>軍馬</span><span class="stat-val">${totalHorses}</span></div>
                    <div class="stat-box"><span>鉄砲</span><span class="stat-val">${totalGuns}</span></div>
                </div>
            `;
        }
        
        const startBtn = document.getElementById('daimyo-confirm-start-btn');
        if (startBtn) {
            startBtn.onclick = () => {
                if (window.AudioManager) {
                    window.AudioManager.playBGM('SC_ex_Town2_Fortress.ogg');
                }

                this.ui.daimyoConfirmModal.classList.add('hidden');
                if (confirmButtons) confirmButtons.classList.add('hidden'); // 分離したボタンも隠す
                
                this.ui.selectedDaimyoId = null; 
                document.body.classList.remove('daimyo-select-mode'); 
                document.body.classList.remove('hide-daimyo-labels'); 
                onStart();
            };
        }
        const backBtn = document.getElementById('daimyo-confirm-back-btn');
        if (backBtn) {
            backBtn.onclick = () => {
                this.ui.selectedDaimyoId = null; 
                this.ui.updateCastleGlows();     
                document.body.classList.remove('hide-daimyo-labels'); 
                this.ui.renderMap(); 
            };
        }
    }
    
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
    }
    
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
    
    // ==========================================
    // ★諸勢力情報の魔法
    // ==========================================
    showKunishuDetail(kunishuId) {
        this.pushModal('kunishu_detail', [kunishuId]);
    }

    _renderKunishuDetail(kunishuId, scrollPos = 0) {
        const kunishu = this.game.kunishuSystem.getKunishu(kunishuId);
        if (!kunishu) return;

        const modal = document.getElementById('selector-modal');
        const title = document.getElementById('selector-title');
        const listContainer = document.getElementById('selector-list');
        const contextEl = document.getElementById('selector-context-info');
        const tabsEl = document.getElementById('selector-tabs');
        const confirmBtn = document.getElementById('selector-confirm-btn');
        const backBtn = document.querySelector('#selector-modal .btn-secondary');

        modal.classList.remove('hidden');
        if (title) title.textContent = "諸勢力情報";
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

        const leader = this.game.getBusho(kunishu.leaderId);
        const leaderName = leader ? leader.name.replace('|', '') : "不明";
        let baseCastleName = "不明";
        let provinceName = "不明";
        if (kunishu.castleId) {
            const baseCastle = this.game.castles.find(c => c.id === kunishu.castleId);
            if (baseCastle) {
                baseCastleName = baseCastle.name;
                if (this.game.provinces) {
                    const province = this.game.provinces.find(p => p.id === baseCastle.provinceId);
                    if (province) provinceName = province.province;
                }
            }
        }

        const bushosCount = this.game.kunishuSystem.getKunishuMembers(kunishuId).length;
        const kunishuName = kunishu.getName(this.game);
        const ideology = kunishu.ideology || "地縁";

        // 諸勢力のイデオロギーカラー（大名家のCSSを流用します）
        let ideologyClass = "ideology-chudo";
        if (ideology === '宗教') ideologyClass = "ideology-hoshu"; 
        else if (ideology === '傭兵') ideologyClass = "ideology-kakushin";

        let faceSrc = leader && leader.faceIcon ? `data/images/faceicons/${leader.faceIcon}` : "data/images/faceicons/unknown_face.webp";

        if (listContainer) {
            listContainer.className = 'list-container hide-native-scroll';
            listContainer.style.display = 'block';
            listContainer.innerHTML = `
                <div class="daimyo-detail-container" style="padding: 10px;">
                    <div class="daimyo-detail-header pc-only">
                        <div class="daimyo-detail-name">${kunishuName}</div>
                        <div class="daimyo-detail-ideology ${ideologyClass}">${ideology}</div>
                    </div>
                    <div class="daimyo-detail-body">
                        <div class="daimyo-detail-left">
                            <img src="${faceSrc}" class="daimyo-detail-face" onerror="this.src='data/images/faceicons/unknown_face.webp'">
                            <div class="daimyo-detail-header sp-only">
                                <div class="daimyo-detail-name">${kunishuName}</div>
                                <div class="daimyo-detail-ideology ${ideologyClass}">${ideology}</div>
                            </div>
                        </div>
                        <div class="daimyo-detail-right">
                            <div class="daimyo-detail-row daimyo-detail-2col">
                                <div class="daimyo-detail-stat-box"><span class="daimyo-detail-label">頭領</span><span class="daimyo-detail-value">${leaderName}</span></div>
                                <div class="daimyo-detail-stat-box"><span class="daimyo-detail-label">武将</span><span class="daimyo-detail-value">${bushosCount}</span></div>
                            </div>
                            <div class="daimyo-detail-row daimyo-detail-2col">
                                <div class="daimyo-detail-stat-box"><span class="daimyo-detail-label">所在</span><span class="daimyo-detail-value">${baseCastleName}</span></div>
                                <div class="daimyo-detail-stat-box"><span class="daimyo-detail-label">所属</span><span class="daimyo-detail-value">${provinceName}</span></div>
                            </div>
                            <div class="daimyo-detail-row daimyo-detail-2col">
                                <div class="daimyo-detail-stat-box"><span class="daimyo-detail-label">兵士</span><span class="daimyo-detail-value">${kunishu.soldiers}</span></div>
                                <div class="daimyo-detail-stat-box"><span class="daimyo-detail-label">防御</span><span class="daimyo-detail-value">${kunishu.defense}</span></div>
                            </div>
                            <div class="daimyo-detail-row daimyo-detail-2col">
                                <div class="daimyo-detail-stat-box"><span class="daimyo-detail-label">訓練</span><span class="daimyo-detail-value">${kunishu.training}</span></div>
                                <div class="daimyo-detail-stat-box"><span class="daimyo-detail-label">軍馬</span><span class="daimyo-detail-value">${kunishu.horses || 0}</span></div>
                            </div>
                            <div class="daimyo-detail-row daimyo-detail-2col">
                                <div class="daimyo-detail-stat-box"><span class="daimyo-detail-label">士気</span><span class="daimyo-detail-value">${kunishu.morale}</span></div>
                                <div class="daimyo-detail-stat-box"><span class="daimyo-detail-label">鉄砲</span><span class="daimyo-detail-value">${kunishu.guns || 0}</span></div>
                            </div>
                        </div>
                    </div>
                    <div style="display: flex; justify-content: flex-end; gap: 10px; margin-top: 15px;">
                        <button class="daimyo-detail-action-btn" id="temp-kunishu-busho-btn">武将</button>
                        <button class="daimyo-detail-action-btn" id="temp-kunishu-diplo-btn">外交</button>
                    </div>
                </div>
            `;

            document.getElementById('temp-kunishu-diplo-btn').onclick = (e) => {
                e.stopPropagation(); 
                if (window.AudioManager) window.AudioManager.playSE('decision.ogg');
                this.showDiplomacyList(kunishu.id, kunishuName, 'kunishu');
            };

            document.getElementById('temp-kunishu-busho-btn').onclick = (e) => {
                e.stopPropagation();
                if (window.AudioManager) window.AudioManager.playSE('decision.ogg');
                this.openBushoSelector('view_only', null, { 
                    customBushos: this.game.kunishuSystem.getKunishuMembers(kunishuId),
                    customInfoHtml: `<div>${kunishuName} 所属武将</div>`
                });
            };

            // ★情報画面ではスクロールバーは不要なので、位置を戻すだけにします
            listContainer.scrollTop = scrollPos;
        }
    }

    // ==========================================
    // ★諸勢力一覧＆選択の魔法（共通モーダル対応版）
    // ==========================================
    showKunishuList(kunishus, castle, onBack) {
        this.pushModal('kunishu_list', [kunishus, castle, false, onBack, null]);
    }

    showAllKunishuList() {
        this.closeCommonModal(); 
        const allKunishus = this.game.kunishuSystem.getAliveKunishus();
        this.pushModal('kunishu_list', [allKunishus, null, false, null, null]);
    }

    // ★新規追加：鎮圧などで諸勢力を選択するための窓口
    showKunishuSelector(kunishus, castle, onConfirm, onBack = null) {
        this.closeCommonModal();
        this.pushModal('kunishu_list', [kunishus, castle, true, onBack, onConfirm]);
    }

    // ★引数に isSelectMode と onConfirm を追加して両対応にしました
    _renderKunishuList(kunishus, castle, isSelectMode = false, onBack = null, onConfirm = null, scrollPos = 0) {
        let contextHtml = `<div>${castle ? castle.name + ' に存在する諸勢力です' : '全国の諸勢力一覧です'}</div>`;
        if (isSelectMode) {
            contextHtml = "<div>対象とする諸勢力をお選びください</div>";
        }
        let modeClassStr = isSelectMode ? "" : "view-mode";

        let items = [];
        kunishus.forEach(kunishu => {
            const kunishuName = kunishu.getName(this.game);
            const leader = this.game.getBusho(kunishu.leaderId);
            const leaderName = leader ? leader.name : "不明";
            const castleObj = this.game.getCastle(kunishu.castleId);
            const castleName = castleObj ? castleObj.name : "不明";
            
            let provinceName = "不明";
            if (castleObj && this.game.provinces) {
                const province = this.game.provinces.find(p => p.id === castleObj.provinceId);
                if (province) provinceName = province.province;
            }

            const relVal = kunishu.getRelation(this.game.playerClanId);
            const friendBarHtml = this._createBarHtml(relVal, 'friend');
            
            let relStatus = "普通";
            let relClass = "text-white";
            if (relVal >= 70) { relStatus = "友好"; relClass = "text-green"; }
            else if (relVal < 40) { relStatus = "敵対"; relClass = "text-red"; }

            let onClickStr = "";
            if (isSelectMode) {
                onClickStr = `window.GameApp.ui.info.selectKunishu(${kunishu.id}, this)`;
            } else {
                onClickStr = `window.GameApp.ui.info.showKunishuDetail(${kunishu.id})`;
            }
            
            items.push({
                onClick: onClickStr,
                cells: [
                    `<strong class="col-kunishu-name">${kunishuName}</strong>`,
                    `<span class="col-leader-name">${leaderName}</span>`,
                    `<span class="col-castle-name">${castleName}</span>`,
                    `<span class="col-province">${provinceName}</span>`,
                    `<span class="col-soldiers">${kunishu.soldiers}</span>`,
                    `<span class="col-friend">${friendBarHtml}</span>`,
                    `<span class="col-relation ${relClass}" style="font-weight:bold;">${relStatus}</span>`,
                    `<span class="col-empty pc-only"></span>`
                ]
            });
        });

        this.selectedKunishuId = null;

        this._renderListModal({
            title: "諸勢力一覧",
            contextHtml: contextHtml,
            headers: [
                `<span class="col-kunishu-name">勢力名</span>`,
                `<span class="col-leader-name">頭領</span>`,
                `<span class="col-castle-name">所在</span>`,
                `<span class="col-province">所属</span>`,
                `<span class="col-soldiers">兵士</span>`,
                `<span class="col-friend">友好度</span>`,
                `<span class="col-relation">関係</span>`,
                `<span class="col-empty pc-only"></span>`
            ],
            headerClass: `kunishu-list-header ${modeClassStr}`,
            itemClass: `kunishu-list-item ${modeClassStr}`,
            listClass: "kunishu-list-container",
            items: items,
            scrollPos: scrollPos,
            gridTemplateSp: "1.8fr 2.4fr 2.4fr 1.5fr 1.5fr 2fr 1fr",
            gridTemplatePc: "120px 120px 120px 60px 80px 100px 60px 1fr",
            onBack: onBack,
            onConfirm: isSelectMode ? () => {
                if (!this.selectedKunishuId) return;
                this.closeCommonModal(); 
                if (onConfirm) onConfirm(this.selectedKunishuId); 
            } : null
        });
    }

    // ★新規追加：リストから勢力を選んだ時のハイライト処理
    selectKunishu(kunishuId, element) {
        const items = document.querySelectorAll('.kunishu-list-item');
        items.forEach(item => item.classList.remove('selected'));

        element.classList.add('selected');

        this.selectedKunishuId = kunishuId;

        const confirmBtn = document.getElementById('selector-confirm-btn');
        if (confirmBtn) {
            confirmBtn.disabled = false;
            confirmBtn.style.opacity = '1';
            confirmBtn.style.cursor = 'pointer';
        }
    }
    
    // ==========================================
    // ★行動履歴の魔法（共通モーダル対応版）
    // ==========================================
    showHistoryModal(historyList = []) {
        this.closeCommonModal();
        this.pushModal('history_list', [historyList, 999999]);
    }

    _renderHistoryList(historyList, scrollPos = 0) {
        let items = [];
        
        if (historyList && historyList.length > 0) {
            items = historyList.map(log => {
                const text = typeof log === 'string' ? log : (log.text || "");
                return {
                    onClick: null,
                    cells: [text],
                    itemClass: "history-list-item"
                };
            });
        }

        this._renderListModal({
            title: "行動履歴",
            items: items,
            emptyHtml: '<div class="history-empty-msg" style="padding: 10px; text-align: center; height: 100%; min-height: 200px; display: flex; align-items: center; justify-content: center; color: #aaa;">履歴がありません。</div>',
            gridTemplateSp: "1fr",
            gridTemplatePc: "1fr",
            scrollPos: scrollPos
        });
    }

    // ==========================================
    // ★援軍の勢力選択リストの魔法（共通モーダル対応版）
    // ==========================================
    showForceSelector(forces, onSelect, onCancel, message = "対象の勢力を選択してください") {
        this.closeCommonModal(); 
        this.pushModal('force_selector', [forces, onSelect, onCancel, message]);
    }

    _renderForceSelector(forces, onSelect, onCancel, message = "対象の勢力を選択してください", scrollPos = 0) {
        let contextHtml = `<div>${message}</div>`;
        this.currentForces = forces;
        this.selectedForceIndex = null;

        let items = [];
        forces.forEach((item, index) => {
            // ★修正：データが { castle, force } の形で送られてくるようになったため、中身を取り出します
            const force = item.force || item; 

            let relVal = 50;
            let relStatus = "普通";
            let statusClass = "text-white";

            if (force.isKunishu) {
                const k = this.game.kunishuSystem.getKunishu(force.id);
                if (k) relVal = k.getRelation(this.game.playerClanId);
                
                if (relVal >= 70) { relStatus = "友好"; statusClass = "text-green"; }
                else if (relVal < 40) { relStatus = "敵対"; statusClass = "text-red"; }
            } else {
                const rel = this.game.getRelation(this.game.playerClanId, force.id);
                if (rel) {
                    relVal = rel.sentiment;
                    relStatus = rel.displayStatus || rel.status;
                    if (relStatus === '敵対') statusClass = 'text-red';
                    else if (relStatus === '友好') statusClass = 'text-green';
                    else if (['同盟', '支配', '従属', '婚姻'].includes(relStatus)) statusClass = 'text-green';
                }
            }
            const friendBarHtml = this._createBarHtml(relVal, 'friend');
            
            items.push({
                onClick: `window.GameApp.ui.info.selectForce(${index}, this)`,
                cells: [
                    `<strong class="col-kunishu-name">${force.name}</strong>`,
                    `<span>${force.leaderName}</span>`,
                    `<span>${force.soldiers}</span>`,
                    `<span>${friendBarHtml}</span>`,
                    `<span class="${statusClass}" style="font-weight:bold;">${relStatus}</span>`
                ]
            });
        });

        this._renderListModal({
            title: "勢力一覧",
            contextHtml: contextHtml,
            headers: ["勢力名", "武将", "兵士", "友好度", "関係"],
            headerClass: "force-list-header",
            itemClass: "force-list-item",
            listClass: "",
            items: items,
            scrollPos: scrollPos,
            gridTemplateSp: "1.5fr 1fr 1fr 1.5fr 1fr",
            gridTemplatePc: "150px 120px 100px 1fr 80px",
            onBack: onCancel,
            onConfirm: () => {
                if (this.selectedForceIndex === null) return;
                this.closeCommonModal(); 
                // ★修正：決定ボタンを押した時、そのままデータを返すのではなく、元の形式に戻してあげます！
                const selectedItem = this.currentForces[this.selectedForceIndex];
                const selectedForce = selectedItem.force || selectedItem;
                if (onSelect) onSelect(selectedForce); 
            }
        });
    }

    selectForce(index, element) {
        const items = document.querySelectorAll('.force-list-item');
        items.forEach(item => item.classList.remove('selected'));

        element.classList.add('selected');

        this.selectedForceIndex = index;

        const confirmBtn = document.getElementById('selector-confirm-btn');
        if (confirmBtn) {
            confirmBtn.disabled = false;
            confirmBtn.style.opacity = '1';
            confirmBtn.style.cursor = 'pointer';
        }
    }

    showAppointLegionCastleSelector(bushoId, legionNo) {
        this.closeCommonModal();
        this.pushModal('appoint_legion_castle', [bushoId, legionNo]);
    }

    _renderAppointLegionCastle(bushoId, legionNo, scrollPos = 0) {
        const daimyo = this.game.bushos.find(b => b.clan === this.game.playerClanId && b.isDaimyo);
        const myCastles = this.game.castles.filter(c => {
            if (Number(c.ownerClan) !== Number(this.game.playerClanId)) return false;
            
            if (daimyo && Number(c.id) === Number(daimyo.castleId)) return false;

            const isCommanderCastle = this.game.bushos.some(b => Number(b.castleId) === Number(c.id) && b.isCommander && b.clan === this.game.playerClanId);
            if (isCommanderCastle) return false;

            return true;
        });
        
        let items = [];
        myCastles.forEach(c => {
            items.push({
                onClick: `window.GameApp.ui.info.selectAppointLegionCastle(${bushoId}, ${legionNo}, ${c.id}, this)`,
                cells: [
                    `<span class="col-castle-name" style="justify-content:flex-start; padding-left:5px;">${c.name}</span>`,
                    `<span class="col-soldiers">${c.soldiers}</span>`,
                    `<span class="col-defense">${c.defense}</span>`
                ]
            });
        });

        this._renderListModal({
            title: "任せる拠点を選択してください",
            contextHtml: "<div>任せる拠点を選択してください</div>",
            headers: ["拠点名", "兵数", "防御"],
            headerClass: "delegate-list-header",
            itemClass: "delegate-list-item",
            listClass: "delegate-list-container",
            items: items,
            scrollPos: scrollPos,
            gridTemplateSp: "2fr 1fr 1fr",
            gridTemplatePc: "200px 100px 100px",
            onBack: () => {
                this.closeCommonModal();
                window.GameApp.ui.showAppointLegionLeaderModal(legionNo);
            },
            onConfirm: () => {
                if (!this.selectedCastleIdForLegion) return;
                const castleId = this.selectedCastleIdForLegion;
                
                window.GameApp.ui.showDialog("よろしいですか？", true, () => {
                    this.closeCommonModal();
                    window.GameApp.commandSystem.executeAppointLegionLeader(bushoId, legionNo, castleId);
                }, () => {
                    this._renderAppointLegionCastle(bushoId, legionNo, 0);
                });
            }
        });
    }
    
    selectAppointLegionCastle(bushoId, legionNo, castleId, element) {
        const items = document.querySelectorAll('.delegate-list-item');
        items.forEach(item => item.classList.remove('selected'));

        element.classList.add('selected');
        this.selectedCastleIdForLegion = castleId;

        const confirmBtn = document.getElementById('selector-confirm-btn');
        if (confirmBtn) {
            confirmBtn.disabled = false;
            confirmBtn.style.opacity = '1';
            confirmBtn.style.cursor = 'pointer';
        }
    }

    // ==========================================
    // ★所領分配の魔法
    // ==========================================
    showAllotFiefModal(legionNo) {
        this.closeCommonModal();
        this.allotFiefSelectedIds = null;
        this.allotFiefSavedState = false;
        this.pushModal('allot_fief', [legionNo]);
    }

    _renderAllotFief(legionNo, scrollPos = 0) {
        const daimyo = this.game.bushos.find(b => Number(b.clan) === Number(this.game.playerClanId) && b.isDaimyo);
        const daimyoCastleId = daimyo ? Number(daimyo.castleId) : -1;
        
        const commanderCastleIds = [];
        if (this.game.legions) {
            this.game.legions.forEach(l => {
                if (Number(l.clanId) === Number(this.game.playerClanId)) {
                    const leader = this.game.bushos.find(b => Number(b.id) === Number(l.commanderId));
                    if (leader) {
                        commanderCastleIds.push(Number(leader.castleId));
                    }
                }
            });
        }

        let targetLegionId = legionNo;
        const numberNames = ["直轄", "第一席", "第二席", "第三席", "第四席", "第五席", "第六席", "第七席", "第八席"];
        let legionName = numberNames[legionNo] || `第${legionNo}席`;

        const myCastles = this.game.castles.filter(c => {
            const cId = Number(c.id);
            if (Number(c.ownerClan) !== Number(this.game.playerClanId)) return false;
            if (cId === daimyoCastleId) return false;
            if (commanderCastleIds.includes(cId)) return false;
            return true;
        });

        if (!this.allotFiefSavedState) {
            this.allotFiefSelectedIds = [];
            myCastles.forEach(c => {
                if (Number(c.legionId) === Number(legionNo)) {
                    this.allotFiefSelectedIds.push(Number(c.id));
                }
            });
            this.allotFiefSavedState = true;
        }

        myCastles.sort((a, b) => {
            const aSelected = this.allotFiefSelectedIds.includes(Number(a.id)) ? 1 : 0;
            const bSelected = this.allotFiefSelectedIds.includes(Number(b.id)) ? 1 : 0;
            if (aSelected !== bSelected) return bSelected - aSelected;
            return a.id - b.id;
        });

        let items = [];
        myCastles.forEach(c => {
            const cId = Number(c.id);
            const isChecked = this.allotFiefSelectedIds.includes(cId);
            const inputHtml = `<input type="checkbox" name="sel_allot_fief" value="${cId}" ${isChecked ? 'checked' : ''} style="display:none;">`;

            let originalLegionStr = "直轄";
            if (c.legionId > 0) {
                originalLegionStr = numberNames[c.legionId] || `第${c.legionId}席`;
            }

            let displayLegionStr = "";
            let statusStyle = "";
            if (isChecked) {
                displayLegionStr = legionName;
                statusStyle = "color:#fdea60; font-weight:bold;";
            } else {
                if (Number(c.legionId) === Number(legionNo)) {
                    displayLegionStr = "直轄";
                } else {
                    displayLegionStr = originalLegionStr;
                }
                statusStyle = "color:#ccc; font-weight:normal;";
            }

            const castellan = this.game.getBusho(c.castellanId);
            const castellanName = castellan ? castellan.name : "なし";

            items.push({
                onClick: (e) => this.handleAllotFiefSelect(e, cId, legionNo, legionName, c.legionId),
                cells: [
                    `<span class="col-act">${inputHtml}<span class="status-mark" style="${statusStyle}">${displayLegionStr}</span></span>`,
                    `<span class="col-castle-name">${c.name}</span>`,
                    `<span class="col-castellan">${castellanName}</span>`,
                    `<span class="col-soldiers">${c.soldiers}</span>`,
                    `<span class="col-defense">${c.defense}</span>`
                ],
                itemClass: isChecked ? "selected" : ""
            });
        });

        this._renderListModal({
            title: `${legionName}の所領分配`,
            contextHtml: `<div>${legionName}の所属とする拠点にチェックを入れてください</div>`,
            headers: ["所属", "拠点名", "城主", "兵数", "防御"],
            headerClass: "delegate-list-header",
            itemClass: "delegate-list-item",
            listClass: "delegate-list-container",
            items: items,
            scrollPos: scrollPos,
            gridTemplateSp: "1.2fr 2fr 1.5fr 1fr 1fr",
            gridTemplatePc: "100px 160px 120px 80px 80px",
            onBack: () => {
                this.allotFiefSelectedIds = null;
                this.allotFiefSavedState = false;
                this.closeCommonModal();
            },
            onConfirm: () => {
                const selectedIds = [...this.allotFiefSelectedIds];
                this.closeCommonModal();
                this.allotFiefSelectedIds = null;
                this.allotFiefSavedState = false;
                window.GameApp.commandSystem.executeAllotFief(legionNo, targetLegionId, selectedIds, myCastles);
            }
        });
        
        this._updateAllotFiefUI();
    }

    handleAllotFiefSelect(e, castleId, legionNo, legionName, originalLegionId) {
        let div = e.currentTarget;
        let input = div.querySelector('input[name="sel_allot_fief"]');
        if (!input) return;

        if (!this.allotFiefSelectedIds) {
            this.allotFiefSelectedIds = [];
        }

        const cId = Number(castleId);
        const isCurrentlyChecked = this.allotFiefSelectedIds.includes(cId);

        const statusSpan = div.querySelector('.status-mark');

        if (isCurrentlyChecked) {
            this.allotFiefSelectedIds = this.allotFiefSelectedIds.filter(id => id !== cId);
            input.checked = false;
            div.classList.remove('selected');
            if (statusSpan) {
                statusSpan.style.color = '#ccc';
                statusSpan.style.fontWeight = 'normal';
                if (Number(originalLegionId) === Number(legionNo)) {
                    statusSpan.textContent = "直轄";
                } else {
                    const numberNames = ["直轄", "第一席", "第二席", "第三席", "第四席", "第五席", "第六席", "第七席", "第八席"];
                    statusSpan.textContent = numberNames[originalLegionId] || `第${originalLegionId}席`;
                }
            }
        } else {
            if (!this.allotFiefSelectedIds.includes(cId)) this.allotFiefSelectedIds.push(cId);
            input.checked = true;
            div.classList.add('selected');
            if (statusSpan) {
                statusSpan.style.color = '#fdea60';
                statusSpan.style.fontWeight = 'bold';
                statusSpan.textContent = legionName;
            }
        }
        
        if (window.AudioManager) window.AudioManager.playSE('choice.ogg');
        this._updateAllotFiefUI();
    }

    _updateAllotFiefUI() {
        const confirmBtn = document.getElementById('selector-confirm-btn');
        if (confirmBtn) {
            confirmBtn.disabled = false;
            confirmBtn.style.opacity = 1.0;
        }
    }
}