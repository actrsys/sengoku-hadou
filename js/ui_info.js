/**
 * ui_info.js
 * リストなどの情報ウインドウの表示を管理するファイルです
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
        this.daimyoCurrentTab = 'status';
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

        // 諸勢力一覧で使う状態のリセット
        this.kunishuCurrentSortKey = null;
        this.isKunishuSortAsc = false;

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
        
        if (!this.daimyoCurrentTab) this.daimyoCurrentTab = 'status';

        let tabsHtml = `
            <div style="display: flex; gap: 5px;">
                <button class="busho-tab-btn ${this.daimyoCurrentTab === 'status' ? 'active' : ''}" data-tab="status">基本</button>
                <button class="busho-tab-btn ${this.daimyoCurrentTab === 'military' ? 'active' : ''}" data-tab="military">軍事</button>
                <button class="busho-tab-btn ${this.daimyoCurrentTab === 'economy' ? 'active' : ''}" data-tab="economy">経済</button>
            </div>
        `;
        
        const clanDataList = activeClans.map(clan => {
            const leader = this.game.getBusho(clan.leaderId);
            
            let totalSoldiers = 0, totalHorses = 0, totalGuns = 0;
            let totalKokudaka = 0, totalCommerce = 0, totalGold = 0, totalRice = 0;
            let totalGoldIncome = 0, totalRiceIncome = 0;
            
            const clanCastles = this.game.castles.filter(c => c.ownerClan === clan.id);
            const castlesCount = clanCastles.length;
            
            clanCastles.forEach(c => {
                totalSoldiers += c.soldiers || 0;
                totalHorses += c.horses || 0;
                totalGuns += c.guns || 0;
                totalKokudaka += c.kokudaka || 0;
                totalCommerce += c.commerce || 0;
                totalGold += c.gold || 0;
                totalRice += c.rice || 0;
                totalGoldIncome += GameSystem.calcBaseGoldIncome(c);
                totalRiceIncome += GameSystem.calcBaseRiceIncome(c);
            });
            
            const bushosCount = this.game.bushos.filter(b => b.clan === clan.id && b.status === 'active').length;
            const princessCount = clan.princessIds ? clan.princessIds.length : 0;
            
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
                soldiers: totalSoldiers,
                horses: totalHorses,
                guns: totalGuns,
                bushosCount: bushosCount,
                princessCount: princessCount,
                kokudaka: totalKokudaka,
                commerce: totalCommerce,
                gold: totalGold,
                goldIncome: totalGoldIncome,
                rice: totalRice,
                riceIncome: totalRiceIncome,
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
                    case 'soldiers': valA = a.soldiers; valB = b.soldiers; break;
                    case 'horses': valA = a.horses; valB = b.horses; break;
                    case 'guns': valA = a.guns; valB = b.guns; break;
                    case 'bushosCount': valA = a.bushosCount; valB = b.bushosCount; break;
                    case 'princessCount': valA = a.princessCount; valB = b.princessCount; break;
                    case 'kokudaka': valA = a.kokudaka; valB = b.kokudaka; break;
                    case 'commerce': valA = a.commerce; valB = b.commerce; break;
                    case 'gold': valA = a.gold; valB = b.gold; break;
                    case 'goldIncome': valA = a.goldIncome; valB = b.goldIncome; break;
                    case 'rice': valA = a.rice; valB = b.rice; break;
                    case 'riceIncome': valA = a.riceIncome; valB = b.riceIncome; break;
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

        const getSortMark = (key) => this._getCommonSortMark(this.daimyoCurrentSortKey, this.isDaimyoSortAsc, key);
        
        let headers = [];
        let gridSpStr = "";
        let gridPcStr = "";
        
        if (this.daimyoCurrentTab === 'status') {
            gridSpStr = "2.5fr 2fr 1fr 2fr 2fr 1.5fr";
            gridPcStr = "140px 100px 60px 100px 100px 60px 1fr";
            headers = [
                `<span data-sort="name">勢力名${getSortMark('name')}</span>`,
                `<span data-sort="leader">当主${getSortMark('leader')}</span>`,
                `<span data-sort="castlesCount">拠点${getSortMark('castlesCount')}</span>`,
                `<span data-sort="power">威信${getSortMark('power')}</span>`,
                `<span data-sort="friend">友好度${getSortMark('friend')}</span>`,
                `<span data-sort="relation">関係${getSortMark('relation')}</span>`,
                `<span class="pc-only"></span>`
            ];
        } else if (this.daimyoCurrentTab === 'military') {
            gridSpStr = "2fr 1fr 1.2fr 1fr 1fr 1fr 0.8fr";
            gridPcStr = "140px 60px 80px 80px 80px 60px 50px 1fr";
            headers = [
                `<span data-sort="name">勢力名${getSortMark('name')}</span>`,
                `<span data-sort="castlesCount">拠点${getSortMark('castlesCount')}</span>`,
                `<span data-sort="soldiers">兵士${getSortMark('soldiers')}</span>`,
                `<span data-sort="horses">軍馬${getSortMark('horses')}</span>`,
                `<span data-sort="guns">鉄砲${getSortMark('guns')}</span>`,
                `<span data-sort="bushosCount">武将${getSortMark('bushosCount')}</span>`,
                `<span data-sort="princessCount">姫${getSortMark('princessCount')}</span>`,
                `<span class="pc-only"></span>`
            ];
        } else if (this.daimyoCurrentTab === 'economy') {
            gridSpStr = "2fr 1.2fr 1.2fr 1.2fr 1.5fr 1.5fr 1.5fr";
            gridPcStr = "140px 80px 80px 80px 100px 80px 100px 1fr";
            headers = [
                `<span data-sort="name">勢力名${getSortMark('name')}</span>`,
                `<span data-sort="kokudaka">石高${getSortMark('kokudaka')}</span>`,
                `<span data-sort="commerce">鉱山${getSortMark('commerce')}</span>`,
                `<span data-sort="gold">金${getSortMark('gold')}</span>`,
                `<span data-sort="goldIncome">月収入${getSortMark('goldIncome')}</span>`,
                `<span data-sort="rice">兵糧${getSortMark('rice')}</span>`,
                `<span data-sort="riceIncome">年米収穫${getSortMark('riceIncome')}</span>`,
                `<span class="pc-only"></span>`
            ];
        }

        let items = [];

        clanDataList.forEach(d => {
            let cells = [];
            if (this.daimyoCurrentTab === 'status') {
                let statusClass = "text-white";
                if (d.friendStatus === '敵対') statusClass = 'text-red';
                else if (d.friendStatus === '友好') statusClass = 'text-green';
                else if (['同盟', '支配', '従属', '婚姻'].includes(d.friendStatus)) statusClass = 'text-green';
                else if (d.friendStatus === '自家') statusClass = 'text-orange';

                const powerBarHtml = this._createBarHtml((d.power / maxPower) * 100, 'power');
                const friendBarHtml = d.id === this.game.playerClanId ? "" : this._createBarHtml(d.friendScore, 'friend');
                
                cells = [
                    `<span class="col-daimyo-name">${d.name}</span>`,
                    `<span class="col-leader-name">${d.leaderName}</span>`,
                    `<span class="col-castle-count">${d.castlesCount}</span>`,
                    `<span class="col-prestige">${powerBarHtml}</span>`,
                    `<span class="col-friend">${friendBarHtml}</span>`,
                    `<span class="col-relation ${statusClass}">${d.friendStatus}</span>`,
                    `<span class="col-empty pc-only"></span>`
                ];
            } else if (this.daimyoCurrentTab === 'military') {
                cells = [
                    `<span class="col-daimyo-name">${d.name}</span>`,
                    `<span class="col-castle-count">${d.castlesCount}</span>`,
                    `<span class="col-soldiers">${d.soldiers}</span>`,
                    `<span class="col-horses">${d.horses}</span>`,
                    `<span class="col-guns">${d.guns}</span>`,
                    `<span class="col-busho-count">${d.bushosCount}</span>`,
                    `<span class="col-busho-count">${d.princessCount}</span>`,
                    `<span class="col-empty pc-only"></span>`
                ];
            } else if (this.daimyoCurrentTab === 'economy') {
                cells = [
                    `<span class="col-daimyo-name">${d.name}</span>`,
                    `<span class="col-kokudaka">${d.kokudaka}</span>`,
                    `<span class="col-commerce">${d.commerce}</span>`,
                    `<span class="col-gold">${d.gold}</span>`,
                    `<span class="col-gold-income">${d.goldIncome}</span>`,
                    `<span class="col-rice">${d.rice}</span>`,
                    `<span class="col-rice-income">${d.riceIncome}</span>`,
                    `<span class="col-empty pc-only"></span>`
                ];
            }
            
            items.push({
                onClick: `window.GameApp.ui.info.showDaimyoDetail(${d.id})`,
                cells: cells
            });
        });

        this._renderListModal({
            title: "勢力一覧",
            tabsHtml: tabsHtml,
            headers: headers,
            headerClass: "sortable-header daimyo-list-header",
            itemClass: "daimyo-list-item",
            listClass: "daimyo-list-container",
            items: items,
            scrollPos: scrollPos,
            gridTemplateSp: gridSpStr,
            gridTemplatePc: gridPcStr,
            onTabClick: (tabKey) => {
                this.daimyoCurrentTab = tabKey;
                const listEl = document.getElementById('selector-list');
                const scroll = listEl ? listEl.scrollTop : 0;
                this._renderDaimyoList(scroll);
            },
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
                                <div class="daimyo-detail-stat-box"><span class="daimyo-detail-label">月収入</span><span class="daimyo-detail-value">${totalGoldIncome}</span></div>
                                <div class="daimyo-detail-stat-box"><span class="daimyo-detail-label">軍馬</span><span class="daimyo-detail-value">${totalHorses}</span></div>
                            </div>
                            <div class="daimyo-detail-row daimyo-detail-2col">
                                <div class="daimyo-detail-stat-box"><span class="daimyo-detail-label">兵糧</span><span class="daimyo-detail-value">${totalRice}</span></div>
                                <div class="daimyo-detail-stat-box"><span class="daimyo-detail-label">鉄砲</span><span class="daimyo-detail-value">${totalGuns}</span></div>
                            </div>
                            <div class="daimyo-detail-row daimyo-detail-2col">
                                <div class="daimyo-detail-stat-box"><span class="daimyo-detail-label">年米収穫</span><span class="daimyo-detail-value">${totalRiceIncome}</span></div>
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
                `<span data-sort="name">姫${getSortMark('name')}</span>`,
                `<span data-sort="clan">勢力${getSortMark('clan')}</span>`,
                `<span data-sort="age">年齢${getSortMark('age')}</span>`,
                `<span data-sort="family">一門${getSortMark('family')}</span>`,
                `<span data-sort="father">父親${getSortMark('father')}</span>`,
                `<span data-sort="husband">配偶者${getSortMark('husband')}</span>`,
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

        if (this.kunishuCurrentSortKey) {
            kunishus = this._prepareStableSortBase('kunishu', kunishus, this.kunishuCurrentSortKey);
            kunishus.sort((a, b) => {
                let valA, valB;
                const leaderA = this.game.getBusho(a.leaderId);
                const leaderB = this.game.getBusho(b.leaderId);
                const castleA = this.game.getCastle(a.castleId);
                const castleB = this.game.getCastle(b.castleId);
                
                let provinceA = null, provinceB = null;
                if (castleA && this.game.provinces) provinceA = this.game.provinces.find(p => p.id === castleA.provinceId);
                if (castleB && this.game.provinces) provinceB = this.game.provinces.find(p => p.id === castleB.provinceId);

                switch(this.kunishuCurrentSortKey) {
                    case 'name':
                        valA = a.yomi || a.getName(this.game);
                        valB = b.yomi || b.getName(this.game);
                        break;
                    case 'leader':
                        valA = leaderA ? (leaderA.yomi || leaderA.name) : "んんん";
                        valB = leaderB ? (leaderB.yomi || leaderB.name) : "んんん";
                        break;
                    case 'castle':
                        valA = castleA ? (castleA.yomi || castleA.name) : "んんん";
                        valB = castleB ? (castleB.yomi || castleB.name) : "んんん";
                        break;
                    case 'province':
                        valA = provinceA ? (provinceA.provinceYomi || provinceA.province) : "んんん";
                        valB = provinceB ? (provinceB.provinceYomi || provinceB.province) : "んんん";
                        break;
                    case 'soldiers':
                        valA = a.soldiers;
                        valB = b.soldiers;
                        break;
                    case 'friend':
                        valA = a.getRelation(this.game.playerClanId);
                        valB = b.getRelation(this.game.playerClanId);
                        break;
                    case 'relation':
                        const getRelRank = (k) => {
                            const r = k.getRelation(this.game.playerClanId);
                            if (r >= 70) return 0; // 友好
                            if (r < 40) return 2;  // 敵対
                            return 1;              // 普通
                        };
                        valA = getRelRank(a);
                        valB = getRelRank(b);
                        break;
                }

                let fallbackCmp = 0;
                if (this.kunishuCurrentSortKey === 'name') {
                    const nameA = a.getName(this.game);
                    const nameB = b.getName(this.game);
                    fallbackCmp = this.isKunishuSortAsc ? nameA.localeCompare(nameB, 'ja') : nameB.localeCompare(nameA, 'ja');
                }
                
                return this._compareForSort(valA, valB, this.isKunishuSortAsc, fallbackCmp);
            });
            this._saveStableSortResult('kunishu', kunishus);
        } else {
            this._saveStableSortResult('kunishu', null);
        }

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
        
        const getSortMark = (key) => this._getCommonSortMark(this.kunishuCurrentSortKey, this.isKunishuSortAsc, key);

        this._renderListModal({
            title: "諸勢力一覧",
            contextHtml: contextHtml,
            headers: [
                `<span data-sort="name">勢力名${getSortMark('name')}</span>`,
                `<span data-sort="leader">頭領${getSortMark('leader')}</span>`,
                `<span data-sort="castle">所在${getSortMark('castle')}</span>`,
                `<span data-sort="province">所属${getSortMark('province')}</span>`,
                `<span data-sort="soldiers">兵士${getSortMark('soldiers')}</span>`,
                `<span data-sort="friend">友好度${getSortMark('friend')}</span>`,
                `<span data-sort="relation">関係${getSortMark('relation')}</span>`,
                `<span class="col-empty pc-only"></span>`
            ],
            headerClass: `sortable-header kunishu-list-header ${modeClassStr}`,
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
            } : null,
            onSortClick: (sortKey) => {
                const defaultAscKeys = ['name', 'leader', 'castle', 'province', 'relation'];
                const newState = this._toggleSortState(this.kunishuCurrentSortKey, this.isKunishuSortAsc, sortKey, defaultAscKeys);
                this.kunishuCurrentSortKey = newState.key;
                this.isKunishuSortAsc = newState.isAsc;
                const listEl = document.getElementById('selector-list');
                const scroll = listEl ? listEl.scrollTop : 0;
                this._renderKunishuList(kunishus, castle, isSelectMode, onBack, onConfirm, scroll);
            }
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
        this.kyotenSavedCastles = null;
        this.kyotenSavedSortedCastles = null;
        this.kyotenLastSortStateKey = null;
        this.kyotenLastScope = null;
        // 拠点一覧（kyoten_list）を選択モードで呼び出します
        this.pushModal('kyoten_list', [this.game.playerClanId, true, { bushoId: bushoId, legionNo: legionNo }]);
    }

    // 古い _renderAppointLegionCastle はもう使わないので、中身を消しておきます！
    _renderAppointLegionCastle(bushoId, legionNo, scrollPos = 0) {
    }
    
    selectAppointLegionCastle(bushoId, legionNo, castleId, element) {
        const isAlreadySelected = element.classList.contains('selected');

        // 全てのアイテムから光（selected）を消すために、共通のクラス名（select-item）を使います！
        const items = document.querySelectorAll('.select-item');
        items.forEach(item => item.classList.remove('selected'));

        if (isAlreadySelected) {
            this.selectedCastleIdForLegion = null;
        } else {
            element.classList.add('selected');
            this.selectedCastleIdForLegion = castleId;
        }

        const confirmBtn = document.getElementById('selector-confirm-btn');
        if (confirmBtn) {
            if (this.selectedCastleIdForLegion) {
                confirmBtn.disabled = false;
                confirmBtn.style.opacity = '1';
                confirmBtn.style.cursor = 'pointer';
            } else {
                confirmBtn.disabled = true;
                confirmBtn.style.opacity = '0.5';
                confirmBtn.style.cursor = 'not-allowed';
            }
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