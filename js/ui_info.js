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
        this.modalHistory = [];
        this.currentModalInfo = null;
        if (this.ui && this.ui.selectorModal) this.ui.selectorModal.classList.add('hidden');
        
        // 武将一覧などで使う状態のリセット
        this.bushoCurrentTab = 'stats';
        this.bushoCurrentScope = 'clan';
        this.bushoCurrentSortKey = null;
        this.bushoIsSortAsc = false;
        this.bushoSavedBushos = null;
        this.bushoLastScope = null;
        
        // 外交リストのタブ状態リセット
        this.diploCurrentTab = 'daimyo';

        // 拠点一覧で使う状態のリセット
        this.currentKyotenTab = 'status';
        this.currentKyotenScope = 'clan';
        this.currentKyotenSortKey = null;
        this.isKyotenSortAsc = false;
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
        else if (info.pageType === 'prisoner_list') this._renderPrisonerList(...info.args, info.scrollPos);
        else if (info.pageType === 'history_list') this._renderHistoryList(...info.args, info.scrollPos);
        else if (info.pageType === 'kunishu_list') this._renderKunishuList(...info.args, info.scrollPos);
        else if (info.pageType === 'kunishu_detail') this._renderKunishuDetail(...info.args, info.scrollPos);
        else if (info.pageType === 'castle_detail') this._renderCastleDetail(...info.args, info.scrollPos);
        else if (info.pageType === 'force_selector') this._renderForceSelector(...info.args, info.scrollPos);
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
            return {
                id: clan.id, name: clan.name, leaderName: leader ? leader.name : "不明",
                power: clan.daimyoPrestige, castlesCount: castlesCount
            };
        });
        
        const maxPower = clanDataList.length > 0 ? Math.max(...clanDataList.map(c => c.power)) : 1;
        clanDataList.sort((a, b) => {
            if (a.id === this.game.playerClanId) return -1;
            if (b.id === this.game.playerClanId) return 1;
            return b.power - a.power;
        });

        let items = [];

        clanDataList.forEach(d => {
            let friendScore = 50;
            let friendStatus = "";
            let statusClass = "text-white";
            if (d.id !== this.game.playerClanId) {
                const relation = this.game.getRelation(this.game.playerClanId, d.id);
                if (relation) {
                    friendScore = relation.sentiment;
                    friendStatus = relation.displayStatus || relation.status; 
                    if (friendStatus === '敵対') statusClass = 'text-red';
                    else if (friendStatus === '友好') statusClass = 'text-green';
                    else if (['同盟', '支配', '従属', '婚姻'].includes(friendStatus)) statusClass = 'text-green';
                }
            } else {
                friendStatus = "自勢力";
                statusClass = "text-orange";
            }

            const powerBarHtml = this._createBarHtml((d.power / maxPower) * 100, 'power');
            const friendBarHtml = d.id === this.game.playerClanId ? "" : this._createBarHtml(friendScore, 'friend');

            items.push({
                onClick: `if(window.AudioManager) window.AudioManager.playSE('choice.ogg'); window.GameApp.ui.info.showDaimyoDetail(${d.id})`,
                cells: [
                    `<span class="col-daimyo-name" style="font-weight:bold;">${d.name}</span>`,
                    `<span class="col-leader-name">${d.leaderName}</span>`,
                    `${d.castlesCount}`,
                    powerBarHtml,
                    friendBarHtml,
                    `<span class="${statusClass}">${friendStatus}</span>`
                ]
            });
        });

        this._renderListModal({
            title: "勢力一覧",
            headers: ["勢力名", "当主名", "城数", "威信", "友好度", "関係"],
            headerClass: "daimyo-list-header",
            itemClass: "daimyo-list-item",
            listClass: "daimyo-list-container",
            items: items,
            scrollPos: scrollPos
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
        const bushosCount = this.game.bushos.filter(b => b.clan === clanId && b.status === 'active').length;
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
                        <button class="daimyo-detail-action-btn" id="temp-busho-btn">武将</button>
                        <button class="daimyo-detail-action-btn" id="temp-diplo-btn">外交</button>
                    </div>
                </div>
            `;

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
                    `<span class="${statusClass}">${r.status}</span>`,
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
                this._renderDiplomacyList(id, name, type, onClose, 0);
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

        const fIds = Object.keys(factions).map(Number).filter(id => id !== 0);
        let nonFactionCount = factions[0] ? factions[0].count : 0;
        
        const daimyo = bushos.find(b => b.isDaimyo);
        const daimyoFactionId = daimyo ? daimyo.factionId : -1;
        
        fIds.sort((a, b) => {
            if (a === daimyoFactionId) return -1; 
            if (b === daimyoFactionId) return 1;  
            return factions[b].count - factions[a].count; 
        });

        let items = [];
        
        fIds.forEach(fId => {
            const fData = factions[fId];
            const leader = fData.leader;
            let leaderName = leader ? leader.name : "不明";
            let count = fData.count;
            let seikaku = "不明";
            let hoshin = "不明";
            
            if (leader) {
                seikaku = leader.factionSeikaku || "中道";
                hoshin = leader.factionHoshin || "保守的";
            }
            
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

            items.push({
                onClick: `window.GameApp.ui.info.showFactionBushoList(${clan.id}, ${fId}, '${leaderName}派')`,
                cells: [
                    `<strong class="col-faction-name ${nameClass}">${leaderName}</strong>`,
                    `${count}`,
                    `<span class="${seikakuClass}">${seikaku}</span>`,
                    `<span class="${hoshinClass}">${hoshin}</span>`,
                    ""
                ]
            });
        });
        
        if (nonFactionCount > 0) {
            items.push({
                onClick: `window.GameApp.ui.info.showFactionBushoList(${clan.id}, 0, '無派閥')`,
                cells: [
                    `<strong class="col-faction-name">無派閥</strong>`,
                    `${nonFactionCount}`,
                    "", "", ""
                ]
            });
        }

        this._renderListModal({
            title: `${clan.name} 派閥一覧`,
            headers: ["派閥主", "武将数", "方針", "思想", ""],
            headerClass: "faction-list-header",
            itemClass: "faction-list-item",
            listClass: "faction-list-container",
            items: items,
            scrollPos: scrollPos
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

        let faceHtml = busho.faceIcon ? `<img src="data/images/faceicons/${busho.faceIcon}" class="busho-detail-face" onerror="this.src='data/images/faceicons/unknown_face.webp'">` : `<img src="data/images/faceicons/unknown_face.webp" class="busho-detail-face">`;

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

        let familyBadge = isFamily ? `<span style="font-size: 0.8rem; background: #8b0000; color: #ffffff; padding: 2px 6px; border-radius: 4px; margin-left: 10px; box-shadow: 1px 1px 2px rgba(0,0,0,0.3);">一門</span>` : "";
        const castle = this.game.getCastle(busho.castleId);
        const castleName = castle ? castle.name : "不明";
        const age = busho.isAutoLeader ? "-" : (this.game.year - busho.birthYear);
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

        const gunshi = this.game.getClanGunshi(this.game.playerClanId);
        const myDaimyo = this.game.bushos.find(b => b.clan === this.game.playerClanId && b.isDaimyo);
        let acc = null;
        if (busho.clan !== this.game.playerClanId && busho.clan !== 0 && castle) acc = castle.investigatedAccuracy;

        const getStat = (stat) => GameSystem.getDisplayStatHTML(busho, stat, gunshi, acc, this.game.playerClanId, myDaimyo);
        const yomiStr = busho.yomi ? busho.yomi : "";

        if (listContainer) {
            listContainer.className = 'list-container hide-native-scroll';
            listContainer.style.display = 'block';
            listContainer.innerHTML = `
                <div class="busho-detail-container" style="padding: 10px;">
                    <div class="busho-detail-box busho-detail-name-box">
                        <div class="busho-detail-yomi">${yomiStr}</div>
                        <div class="busho-detail-name-row">
                            <span class="busho-detail-name">${busho.name}</span>
                            ${rankName}
                        </div>
                    </div>
                    <div class="busho-detail-main">
                        ${faceHtml}
                        <div class="busho-detail-info-col">
                            <div class="busho-detail-box busho-detail-affiliation-box">
                                <span class="busho-label">勢力</span>
                                <span class="busho-val" style="margin-right: auto;">${affiliationName}${familyBadge}</span>
                                <span class="busho-val">${castleName}</span>
                            </div>
                            <div class="busho-detail-split-row">
                                <div class="busho-detail-box busho-detail-split-box">
                                    <span class="busho-label">身分</span>
                                    <span class="busho-val">${busho.getRankName()}</span>
                                </div>
                                <div class="busho-detail-box busho-detail-split-box">
                                    <span class="busho-label">年齢</span>
                                    <span class="busho-val">${ageStr}</span>
                                </div>
                            </div>
                        </div>
                    </div>
                    <div class="busho-detail-stats">
                        <div class="busho-detail-box busho-detail-stat-box"><span class="busho-label">統率</span><span class="busho-val">${getStat('leadership')}</span></div>
                        <div class="busho-detail-box busho-detail-stat-box"><span class="busho-label">武勇</span><span class="busho-val">${getStat('strength')}</span></div>
                        <div class="busho-detail-box busho-detail-stat-box"><span class="busho-label">内政</span><span class="busho-val">${getStat('politics')}</span></div>
                        <div class="busho-detail-box busho-detail-stat-box"><span class="busho-label">外交</span><span class="busho-val">${getStat('diplomacy')}</span></div>
                        <div class="busho-detail-box busho-detail-stat-box"><span class="busho-label">智謀</span><span class="busho-val">${getStat('intelligence')}</span></div>
                        <div class="busho-detail-box busho-detail-stat-box"><span class="busho-label">魅力</span><span class="busho-val">${getStat('charm')}</span></div>
                    </div>
                </div>
            `;
            // ★情報画面ではスクロールバーは不要なので、位置を戻すだけにします
            listContainer.scrollTop = scrollPos;
        }
    }
    
    showBushoDetailModalById(bushoId) {
        if (window.AudioManager) window.AudioManager.playSE('choice.ogg');
        const busho = this.game.getBusho(bushoId);
        if (busho) this.showBushoDetailModal(busho);
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
        if (window.AudioManager && e.target.tagName !== 'INPUT') window.AudioManager.playSE('choice.ogg');
        
        let div = e.currentTarget;
        let input = null;

        if (e.target.tagName === 'INPUT') {
            input = e.target;
        } else {
            input = div.querySelector('input');
        }

        if (!input) return;

        const c = this._bushoSelectorContext ? this._bushoSelectorContext.c : this.ui.currentCastle;

        if (e.target.tagName === 'INPUT') { 
            if(!isMulti) {
                const siblings = document.querySelectorAll('.select-item');
                siblings.forEach(el => el.classList.remove('selected'));
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
             input.checked = true; 
             const allItems = document.querySelectorAll('.select-item'); 
             allItems.forEach(item => item.classList.remove('selected')); 
        }
        if(input.checked) div.classList.add('selected'); else div.classList.remove('selected');
        
        this._updateBushoSelectorUI();
    }
    
    showPrisonerModal(captives) {
        this.closeCommonModal(); 
        this.pushModal('prisoner_list', [captives]);
    }

    _renderPrisonerList(captives, scrollPos = 0) {
        const modal = document.getElementById('selector-modal');
        const titleEl = document.getElementById('selector-title');
        const listContainer = document.getElementById('selector-list');
        const contextEl = document.getElementById('selector-context-info');
        const tabsEl = document.getElementById('selector-tabs');
        const confirmBtn = document.getElementById('selector-confirm-btn');
        const backBtn = document.querySelector('#selector-modal .btn-secondary');

        if (!modal) return;
        modal.classList.remove('hidden');
        if (titleEl) titleEl.textContent = "捕虜処遇";
        if (contextEl) contextEl.classList.add('hidden');
        if (confirmBtn) confirmBtn.classList.add('hidden');

        // 捕虜処遇は勝手に閉じられないように、戻るボタンを消しておきます
        if(backBtn) {
            backBtn.style.display = 'none'; 
        }

        const gunshi = this.game.getClanGunshi(this.game.playerClanId);
        const myDaimyo = this.game.bushos.find(b => b.clan === this.game.playerClanId && b.isDaimyo);

        let listHtml = '';
        
        captives.forEach((p, index) => {
            let hireBtnHtml = p.hasRefusedHire ? 
                `<button class="btn-primary" disabled style="opacity:0.5; background-color: #666;">拒否</button>` : 
                `<button class="btn-primary" onclick="if(window.AudioManager) window.AudioManager.playSE('decision.ogg'); window.GameApp.warManager.handlePrisonerAction(${index}, 'hire')">登用</button>`;
            
            const getStat = (stat) => GameSystem.getDisplayStatHTML(p, stat, gunshi, null, this.game.playerClanId, myDaimyo);

            listHtml += `
                <div class="select-item" style="display: flex; justify-content: space-between; align-items: center; padding: 10px;">
                    <div style="flex:1;">
                        <strong>${p.name}</strong> (${p.getRankName()})<br>
                        <div style="display:flex; gap:5px; align-items:center; margin-top:2px;">
                            統:${getStat('leadership')} 武:${getStat('strength')} 智:${getStat('intelligence')}
                        </div>
                    </div>
                    <div style="display:flex; gap:5px;">
                        ${hireBtnHtml}
                        <button class="btn-secondary" onclick="if(window.AudioManager) window.AudioManager.playSE('decision.ogg'); window.GameApp.warManager.handlePrisonerAction(${index}, 'release')">解放</button>
                        <button class="btn-danger" onclick="if(window.AudioManager) window.AudioManager.playSE('decision.ogg'); window.GameApp.warManager.handlePrisonerAction(${index}, 'kill')">処断</button>
                    </div>
                </div>
            `;
        });

        if (listContainer) {
            listContainer.className = 'list-container hide-native-scroll';
            listContainer.style.display = 'block';
            listContainer.innerHTML = listHtml;
            if (window.CustomScrollbar) {
                if (!this.ui.bushoScrollbar) this.ui.bushoScrollbar = new CustomScrollbar(listContainer);
                setTimeout(() => {
                    listContainer.scrollTop = scrollPos;
                    this.ui.bushoScrollbar.update();
                }, 10);
            } else {
                listContainer.scrollTop = scrollPos;
            }
        }
    }

    closePrisonerModal() {
        this.popModal(); 
    }
    
    showDaimyoPrisonerModal(prisoner) {
        this.ui.hideAIGuardTemporarily();
        
        let hireBtnHtml = '';
        if (prisoner.hasRefusedHire) {
            hireBtnHtml = `<button class="btn-primary" disabled style="opacity:0.5; background-color: #666;">拒否</button>`;
        } else {
            hireBtnHtml = `<button class="btn-primary" onclick="window.GameApp.warManager.handleDaimyoPrisonerAction('hire')">登用</button>`;
        }

        const content = `
            <div style="text-align:center; padding: 10px;">
                <h3 style="margin-top:0;">敵大名 捕縛！</h3>
                <p style="font-size:1.1rem;">敵大名・<strong>${prisoner.name}</strong>を捕縛しました。<br>処遇を決めてください。</p>
                <div style="margin-top:20px; display:flex; justify-content:center; gap:10px;">
                    ${hireBtnHtml}
                    <button class="btn-secondary" onclick="window.GameApp.warManager.handleDaimyoPrisonerAction('release')">解放</button>
                    <button class="btn-danger" onclick="window.GameApp.warManager.handleDaimyoPrisonerAction('kill')">処断</button>
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

        let gridStyle = "";
        if (config.minWidth) gridStyle += `min-width: ${config.minWidth}; `;

        const buildItemHtml = (item, index) => {
            const cursorStr = item.onClick ? "style='cursor:pointer;'" : "style='cursor:default;'";
            const extraClass = item.itemClass || '';
            let clickStr = "";
            let indexAttr = "";
            if (item.onClick) {
                if (typeof item.onClick === 'function') {
                    indexAttr = `data-action-index="${index}"`; 
                } else {
                    clickStr = `onclick="${item.onClick}"`;
                }
            }
            const cells = item.cells.map(c => {
                const strC = String(c);
                return strC.trim().startsWith('<') ? strC : `<span>${strC}</span>`;
            }).join('');
            return `<div class="select-item ${config.itemClass || ''} ${extraClass}" ${cursorStr} ${clickStr} ${indexAttr} style="${gridStyle}">${cells}</div>`;
        };

        if (!config.items || config.items.length === 0) {
            let emptyHtml = '';
            if (config.headers && config.headers.length > 0) {
                const headerCols = config.headers.map(h => h.trim().startsWith('<') ? h : `<span>${h}</span>`).join('');
                emptyHtml += `<div class="list-header ${config.headerClass || ''}" style="${gridStyle}">${headerCols}</div>`;
            }
            emptyHtml += config.emptyHtml || '<div style="padding: 10px; text-align: center;">データがありません。</div>';
            listContainer.innerHTML = emptyHtml;
            listContainer.style.display = 'block';
            return;
        }

        const totalItems = config.items.length;
        const INITIAL_RENDER_COUNT = 30;
        const CHUNK_SIZE = 50;

        let initialHtmlParts = [];
        
        if (config.headers && config.headers.length > 0) {
            const headerCols = config.headers.map(h => h.trim().startsWith('<') ? h : `<span>${h}</span>`).join('');
            initialHtmlParts.push(`<div class="list-header sortable-header ${config.headerClass || ''}" style="${gridStyle}">${headerCols}</div>`);
        }

        const initialLimit = Math.min(totalItems, INITIAL_RENDER_COUNT);
        for (let i = 0; i < initialLimit; i++) {
            initialHtmlParts.push(buildItemHtml(config.items[i], i));
        }
        
        for (let i = totalItems; i < 8; i++) {
            const emptyCells = config.headers ? config.headers.map(() => `<span></span>`).join('') : '';
            initialHtmlParts.push(`<div class="select-item ${config.itemClass || ''}" style="cursor:default; pointer-events:none; ${gridStyle}">${emptyCells}</div>`);
        }

        listContainer.innerHTML = initialHtmlParts.join('');

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
                
                listContainer.insertAdjacentHTML('beforeend', chunkParts.join(''));
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
        
        let princesses = [];
        if (myClan && myClan.princessIds) {
            princesses = myClan.princessIds
                .map(id => this.game.princesses.find(p => p.id === id))
                .filter(p => p !== undefined); 
        }

        if (isSelectMode) {
            princesses = princesses.filter(p => p.status === 'unmarried');
            this.selectedPrincessId = null; 
        }

        const items = princesses.map(p => {
            const age = this.game.year - p.birthYear;
            const father = this.game.getBusho(p.fatherId);
            const husband = this.game.getBusho(p.husbandId);

            return {
                onClick: isSelectMode ? `window.GameApp.ui.info.selectPrincess(${p.id}, this)` : null,
                cells: [
                    `<strong class="col-princess-name">${p.name}</strong>`,
                    `${age}歳`,
                    father ? father.name : "不明",
                    husband ? husband.name : "なし",
                    "" 
                ]
            };
        });

        this._renderListModal({
            title: isSelectMode ? "嫁がせる姫を選択してください" : "姫一覧",
            headers: ["姫", "年齢", "父親", "配偶者", ""],
            headerClass: "princess-list-header",
            itemClass: "princess-list-item",
            listClass: "princess-list-container",
            items: items,
            scrollPos: scrollPos,
            onBack: isSelectMode ? () => this.openBushoSelector('diplomacy_doer', targetCastleId, { subAction: 'marriage' }) : null,
            onConfirm: isSelectMode ? () => this.confirmPrincessSelection(targetCastleId, doerId) : null
        });
    }

    selectPrincess(princessId, element) {
        if (window.AudioManager) window.AudioManager.playSE('choice.ogg');
        
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

        if (window.AudioManager) window.AudioManager.playSE('choice.ogg');
        
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
            const attackDisplay = c.isDelegated ? `<span class="${attackClass}">${attackText}</span>` : `<span class="text-gray">-</span>`;
            const moveDisplay = c.isDelegated ? `<span class="${moveClass}">${moveText}</span>` : `<span class="text-gray">-</span>`;

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
            scrollPos: scrollPos
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

        let totalGoldIncome = GameSystem.calcBaseGoldIncome(castle);
        let totalRiceIncome = GameSystem.calcBaseRiceIncome(castle);

        if (listContainer) {
            listContainer.className = 'list-container hide-native-scroll';
            listContainer.style.display = 'block';
            listContainer.innerHTML = `
                <div class="daimyo-detail-container" style="padding: 10px;">
                    <div class="daimyo-detail-header" style="margin-bottom: 10px; justify-content: center;">
                        <div class="daimyo-detail-name" style="font-size: 1.5rem;">${castle.name}</div>
                    </div>
                    <div class="daimyo-detail-body">
                        <div class="daimyo-detail-right" style="width: 100%;">
                            <div class="daimyo-detail-row daimyo-detail-3col">
                                <div class="daimyo-detail-stat-box"><span class="daimyo-detail-label">所属</span><span class="daimyo-detail-value">${clanName}</span></div>
                                <div class="daimyo-detail-stat-box"><span class="daimyo-detail-label">地方</span><span class="daimyo-detail-value">${provinceName}</span></div>
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
                        <button class="daimyo-detail-action-btn" id="castle-busho-btn">武将</button>
                        <button class="daimyo-detail-action-btn" id="castle-kunishu-btn" style="display: ${kunishuCount > 0 ? '' : 'none'};">諸勢力</button>
                    </div>
                </div>
            `;

            const btnKunishu = document.getElementById('castle-kunishu-btn');
            if (btnKunishu) {
                btnKunishu.onclick = (e) => {
                    e.stopPropagation();
                    if (window.AudioManager) window.AudioManager.playSE('decision.ogg');
                    this.showKunishuList(kunishus, castle);
                };
            }

            document.getElementById('castle-busho-btn').onclick = (e) => {
                e.stopPropagation();
                if (window.AudioManager) window.AudioManager.playSE('decision.ogg');
                
                // ★ アクティブな武将と浪人のみ（諸勢力の武将は除外して抽出します）
                const targetBushos = this.game.bushos.filter(b => 
                    b.castleId === castle.id && 
                    (b.status === 'active' || b.status === 'ronin') && 
                    (b.belongKunishuId === 0 || !b.belongKunishuId)
                );

                this.openBushoSelector('view_only', null, { 
                    customBushos: targetBushos,
                    customInfoHtml: `<div>${castle.name} 滞在武将</div>`
                });
            };

            // ★情報画面ではスクロールバーは不要なので、位置を戻すだけにします
            listContainer.scrollTop = scrollPos;
        }
    }

    // ==========================================
    // ★ここから追加：拠点一覧の魔法です！
    // ==========================================
    showKyotenList(clanId = null) {
        this.closeCommonModal(); 
        this.pushModal('kyoten_list', [clanId]);
    }
    
    _renderKyotenList(clanId, scrollPos = 0) {
        this.kyotenTargetClanId = clanId !== null ? clanId : this.game.playerClanId;
        
        if (!this.currentKyotenTab) this.currentKyotenTab = 'status';
        if (!this.currentKyotenScope) this.currentKyotenScope = 'clan';
        
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

        if (this.currentKyotenScope === 'all') {
            this.kyotenCastles = this.game.castles;
        } else {
            this.kyotenCastles = this.game.castles.filter(c => c.ownerClan === this.kyotenTargetClanId);
        }

        let displayCastles = [...this.kyotenCastles];

        if (this.currentKyotenSortKey) {
            displayCastles.sort((a, b) => {
                let valA = 0, valB = 0;

                const getClanYomi = (c) => { const cd = this.game.clans.find(cd => cd.id === c.ownerClan); return cd ? (cd.yomi || cd.name) : "んんん"; };
                const getClanName = (c) => { const cd = this.game.clans.find(cd => cd.id === c.ownerClan); return cd ? cd.name : ""; };
                const getCastellanYomi = (c) => { const cb = this.game.getBusho(c.castellanId); return cb ? (cb.yomi || cb.name) : "んんん"; };
                const getCastellanName = (c) => { const cb = this.game.getBusho(c.castellanId); return cb ? cb.name : ""; };
                const getProvinceYomi = (c) => { const p = this.game.provinces && this.game.provinces.find(p => p.id === c.provinceId); return p ? (p.yomi || p.province) : "んんん"; };
                const getProvinceName = (c) => { const p = this.game.provinces && this.game.provinces.find(p => p.id === c.provinceId); return p ? p.province : ""; };
                const getBushoCount = (c) => this.game.bushos.filter(b => b.castleId === c.id && b.status === 'active').length;

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

                if (typeof valA === 'string' && typeof valB === 'string') {
                    let cmp = this.isKyotenSortAsc ? valA.localeCompare(valB, 'ja') : valB.localeCompare(valA, 'ja');
                    if (cmp === 0) {
                        const nameA = this.currentKyotenSortKey === 'clan' ? getClanName(a) : (this.currentKyotenSortKey === 'castellan' ? getCastellanName(a) : (this.currentKyotenSortKey === 'province' ? getProvinceName(a) : a.name));
                        const nameB = this.currentKyotenSortKey === 'clan' ? getClanName(b) : (this.currentKyotenSortKey === 'castellan' ? getCastellanName(b) : (this.currentKyotenSortKey === 'province' ? getProvinceName(b) : b.name));
                        cmp = this.isKyotenSortAsc ? nameA.localeCompare(nameB, 'ja') : nameB.localeCompare(nameA, 'ja');
                    }
                    return cmp;
                }
                
                if (valA === valB) return 0;
                return this.isKyotenSortAsc ? (valA - valB) : (valB - valA);
            });
        }

        const getSortMark = (key) => {
            if (this.currentKyotenSortKey !== key) return '';
            return this.isKyotenSortAsc ? ' ▲' : ' ▼';
        };

        let headers = [];
        let gridStyle = "";

        if (this.currentKyotenTab === 'status') {
            gridStyle = "1.5fr 1.5fr 1.5fr 1fr 1fr 1fr 1fr";
            headers = [
                `<span data-sort="name" style="padding-left:5px; justify-content:flex-start;">拠点名${getSortMark('name')}</span>`,
                `<span data-sort="clan">勢力${getSortMark('clan')}</span>`,
                `<span data-sort="castellan">城主${getSortMark('castellan')}</span>`,
                `<span data-sort="province">所属${getSortMark('province')}</span>`,
                `<span data-sort="bushoCount">武将数${getSortMark('bushoCount')}</span>`,
                `<span data-sort="gold">金${getSortMark('gold')}</span>`,
                `<span data-sort="rice">兵糧${getSortMark('rice')}</span>`
            ];
        } else if (this.currentKyotenTab === 'military') {
            gridStyle = "1.5fr 1.5fr 1fr 1fr 1fr 1fr 1fr";
            headers = [
                `<span data-sort="name" style="padding-left:5px; justify-content:flex-start;">拠点名${getSortMark('name')}</span>`,
                `<span data-sort="soldiers">兵士${getSortMark('soldiers')}</span>`,
                `<span data-sort="defense">防御${getSortMark('defense')}</span>`,
                `<span data-sort="morale">士気${getSortMark('morale')}</span>`,
                `<span data-sort="training">訓練${getSortMark('training')}</span>`,
                `<span data-sort="horses">軍馬${getSortMark('horses')}</span>`,
                `<span data-sort="guns">鉄砲${getSortMark('guns')}</span>`
            ];
        } else if (this.currentKyotenTab === 'economy') {
            gridStyle = "1.5fr 1fr 1fr 1fr 1fr 1.5fr 1.5fr 1.5fr 1.5fr";
            headers = [
                `<span data-sort="name" style="padding-left:5px; justify-content:flex-start;">拠点名${getSortMark('name')}</span>`,
                `<span data-sort="population">人口${getSortMark('population')}</span>`,
                `<span data-sort="loyalty">民忠${getSortMark('loyalty')}</span>`,
                `<span data-sort="kokudaka">石高${getSortMark('kokudaka')}</span>`,
                `<span data-sort="commerce">鉱山${getSortMark('commerce')}</span>`,
                `<span data-sort="goldIncome">金収入/月${getSortMark('goldIncome')}</span>`,
                `<span data-sort="goldConsume">金支出/月${getSortMark('goldConsume')}</span>`,
                `<span data-sort="riceIncome">兵糧収入/年${getSortMark('riceIncome')}</span>`,
                `<span data-sort="riceConsume">兵糧支出/年${getSortMark('riceConsume')}</span>`
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
            
            const castleBushos = this.game.bushos.filter(b => b.castleId === c.id && b.status === 'active');
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
                    `${clanName}`,
                    `${castellanName}`,
                    `${provinceName}`,
                    `${bushosCount}`,
                    `${c.gold}`,
                    `${c.rice}`
                ];
            } else if (this.currentKyotenTab === 'military') {
                cells = [
                    `<span class="col-castle-name" style="justify-content:flex-start; padding-left:5px;">${c.name}</span>`,
                    `${c.soldiers}`,
                    `${c.defense}`,
                    `${c.morale}`,
                    `${c.training}`,
                    `${c.horses || 0}`,
                    `${c.guns || 0}`
                ];
            } else if (this.currentKyotenTab === 'economy') {
                cells = [
                    `<span class="col-castle-name" style="justify-content:flex-start; padding-left:5px;">${c.name}</span>`,
                    `${c.population}`,
                    `${c.peoplesLoyalty}`,
                    `${c.kokudaka}`,
                    `${c.commerce}`,
                    `${goldIncome}`,
                    `${consumeGold}`,
                    `${riceIncome}`,
                    `${consumeRiceYear}`
                ];
            }

            items.push({
                onClick: `if(window.AudioManager) window.AudioManager.playSE('choice.ogg'); window.GameApp.ui.info.showCastleDetail(${c.id})`,
                cells: cells
            });
        });

        this._renderListModal({
            title: "拠点一覧",
            tabsHtml: tabsHtml,
            headers: headers,
            headerClass: "sortable-header",
            itemClass: "",
            listClass: "kyoten-list-container",
            items: items,
            scrollPos: scrollPos,
            gridTemplateSp: gridStyle,
            gridTemplatePc: gridStyle,
            onTabClick: (tabKey) => {
                this.currentKyotenTab = tabKey;
                this.currentKyotenSortKey = null;
                this.isKyotenSortAsc = false;
                this._renderKyotenList(clanId, 0);
            },
            onScopeClick: (scopeKey) => {
                this.currentKyotenScope = scopeKey;
                this.currentKyotenSortKey = null;
                this.isKyotenSortAsc = false;
                this._renderKyotenList(clanId, 0);
            },
            onSortClick: (sortKey) => {
                if (this.currentKyotenSortKey === sortKey) {
                    this.isKyotenSortAsc = !this.isKyotenSortAsc;
                } else {
                    this.currentKyotenSortKey = sortKey;
                    this.isKyotenSortAsc = false;
                    if (['name', 'clan', 'castellan', 'province'].includes(sortKey)) {
                        this.isKyotenSortAsc = true;
                    }
                }
                this._renderKyotenList(clanId, 0);
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
    
    openBushoSelector(actionType, targetId = null, extraData = null, onBack = null) {
        if (actionType === 'appoint' && this.ui.currentCastle) { const isDaimyoHere = this.game.getCastleBushos(this.ui.currentCastle.id).some(b => b.isDaimyo); if (isDaimyoHere) { this.ui.showDialog("大名の居城は城主を変更できません", false); return; } }
        
        // ★修正：新しく武将一覧を開くときは、以前開いたリストの記憶（キャッシュ）を消してリセットします
        this.bushoCurrentSortKey = null;
        this.bushoIsSortAsc = false;
        this.bushoSavedBushos = null;
        this.bushoLastScope = null;

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
        const c = this.ui.currentCastle; 
        const data = this.game.commandSystem.getBushoSelectorData(actionType, targetId, extraData, c);
        let bushos = extraData && extraData.customBushos ? extraData.customBushos : data.bushos;
        let infoHtml = extraData && extraData.customInfoHtml ? extraData.customInfoHtml : data.infoHtml;
        let isMulti = data.isMulti;
        let spec = data.spec || {};

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
        
        if (!isViewMode && !this.bushoCurrentSortKey) {
            if (spec && spec.stat) {
                this.bushoCurrentSortKey = spec.stat;
            } else if (actionType) {
                const leadershipActions = ['draft', 'train', 'war_deploy', 'def_intercept_deploy', 'def_reinf_deploy', 'atk_reinf_deploy', 'def_self_reinf_deploy', 'atk_self_reinf_deploy', 'kunishu_subjugate_deploy', 'war_general', 'kunishu_war_general', 'appoint'];
                const politicsActions = ['develop'];
                const diplomacyActions = ['diplomacy_doer', 'goodwill', 'tribute', 'marriage_princess', 'marriage_kinsman', 'succession'];
                const intelligenceActions = ['rumor', 'headhunt', 'destroy', 'revolt', 'rumor_target_busho', 'headhunt_target', 'appoint_gunshi'];
                const charmActions = ['charity', 'employ', 'employ_target'];
                
                if (leadershipActions.includes(actionType)) this.bushoCurrentSortKey = 'leadership';
                else if (politicsActions.includes(actionType)) this.bushoCurrentSortKey = 'politics';
                else if (diplomacyActions.includes(actionType)) this.bushoCurrentSortKey = 'diplomacy';
                else if (intelligenceActions.includes(actionType)) this.bushoCurrentSortKey = 'intelligence';
                else if (charmActions.includes(actionType)) this.bushoCurrentSortKey = 'charm';
                else this.bushoCurrentSortKey = 'leadership'; 
            }
            if (this.bushoCurrentSortKey) this.bushoIsSortAsc = false;
        }

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
            displayBushos = [...bushos]; 
            if (actionType === 'all_busho_list' && this.bushoCurrentScope === 'all') {
                displayBushos = this.game.bushos.filter(b => {
                    if (b.status === 'unborn' || b.status === 'dead') return false;
                    if (b.clan > 0 || b.belongKunishuId > 0 || b.status === 'ronin') return true;
                    return false;
                });
            }
            this.bushoLastScope = this.bushoCurrentScope;
        } else {
            displayBushos = [...this.bushoSavedBushos];
        }

        const getSortRankAll = (b) => {
            const isGunshi = b.isGunshi || (b.clan > 0 && this.game.clans.find(c => c.id === b.clan)?.gunshiId === b.id);
            if (b.clan === this.game.playerClanId) return b.isDaimyo ? 10000 : (b.isCastellan ? 9000 : (isGunshi ? 8500 : 8000));
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

        if (this.bushoCurrentSortKey) {
            displayBushos.sort((a, b) => {
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
                        if (busho.factionId > 0 && busho.clan > 0) {
                            const clanBushos = this.game.bushos.filter(b => b.clan === busho.clan && b.status === 'active');
                            const factionLeaders = clanBushos.filter(b => b.isFactionLeader);
                            const myLeader = factionLeaders.find(leader => leader.factionId === busho.factionId);
                            if (myLeader) {
                                const sameFamilyLeaders = factionLeaders.filter(leader => leader.familyName && leader.familyName === myLeader.familyName && leader.id !== myLeader.id);
                                let yomiStr = "", nameStr = "";
                                if (!myLeader.givenName) { yomiStr = (myLeader.familyYomi || myLeader.yomi || "") + "は"; nameStr = myLeader.familyName + "派"; } 
                                else if (sameFamilyLeaders.length > 0) { yomiStr = (myLeader.givenYomi || myLeader.yomi || "") + "は"; nameStr = myLeader.givenName + "派"; } 
                                else { yomiStr = (myLeader.familyYomi || myLeader.yomi || "") + "は"; nameStr = myLeader.familyName + "派"; }
                                return { yomi: yomiStr, name: nameStr };
                            }
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
        } else {
            if (extraData && extraData.isFactionView) {
                displayBushos.sort((a, b) => {
                    if (a.isFactionLeader && !b.isFactionLeader) return -1;
                    if (!a.isFactionLeader && b.isFactionLeader) return 1;
                    if (a.isDaimyo && !b.isDaimyo) return -1;
                    if (!a.isDaimyo && b.isDaimyo) return 1;
                    return getSortRankClan(b) - getSortRankClan(a);
                });
            } else if (actionType === 'all_busho_list' && this.bushoCurrentScope === 'all') {
                displayBushos.sort((a, b) => getSortRankAll(b) - getSortRankAll(a));
            } else if (isViewMode) {
                displayBushos.sort((a, b) => getSortRankClan(b) - getSortRankClan(a));
            }
        }

        this.bushoSavedBushos = [...displayBushos];

        const getSortMark = (key) => {
            if (this.bushoCurrentSortKey !== key) return '';
            return this.bushoIsSortAsc ? ' ▲' : ' ▼';
        };

        let headers = [];
        let headerClassStr = "sortable-header";
        let itemClassStr = "";

        if (isViewMode) {
            headerClassStr += " view-mode";
            itemClassStr += " view-mode";
        }

        if (this.bushoCurrentTab === 'stats') {
            headers = [
                !isViewMode ? `<span class="col-act" data-sort="action">行動${getSortMark('action')}</span>` : null,
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
            headers = [
                !isViewMode ? `<span class="col-act" data-sort="action">行動${getSortMark('action')}</span>` : null,
                `<span class="col-name" data-sort="name">名前${getSortMark('name')}</span>`,
                `<span class="col-rank" data-sort="rank">身分${getSortMark('rank')}</span>`,
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
            if (extraData && extraData.allowDone) isSelectable = true; 
            if (['appoint','employ_target','appoint_gunshi','rumor_target_busho','headhunt_target','interview','interview_target','reward','view_only','war_general', 'kunishu_war_general', 'all_busho_list', 'marriage_princess', 'marriage_kinsman', 'succession'].includes(actionType)) isSelectable = true;
            if (['def_intercept_deploy', 'def_reinf_deploy', 'atk_reinf_deploy'].includes(actionType)) isSelectable = true;
            
            let currentAcc = null;
            const bCastle = this.game.getCastle(b.castleId);
            if (bCastle && bCastle.investigatedUntil >= this.game.getCurrentTurnId()) {
                currentAcc = bCastle.investigatedAccuracy;
            } else if (isEnemyTarget && targetCastle) {
                currentAcc = targetCastle.investigatedAccuracy;
            }
            const getStat = (stat) => GameSystem.getDisplayStatHTML(b, stat, gunshi, currentAcc, this.game.playerClanId, myDaimyo);

            const inputType = isMulti ? 'checkbox' : 'radio';
            let inputHtml = !isViewMode ? `<input type="${inputType}" name="sel_busho" value="${b.id}" ${!isSelectable ? 'disabled' : ''} style="display:none;">` : '';

            let cells = [];
            if (this.bushoCurrentTab === 'stats') {
                cells = [
                    !isViewMode ? `<span class="col-act">${inputHtml}${b.isActionDone?'済':'未'}</span>` : null,
                    `<span class="col-name">${b.name}</span>`,
                    `<span class="col-rank">${b.getRankName()}</span>`,
                    `<span class="col-stat">${getStat('leadership')}</span>`,
                    `<span class="col-stat">${getStat('strength')}</span>`,
                    `<span class="col-stat">${getStat('politics')}</span>`,
                    `<span class="col-stat">${getStat('diplomacy')}</span>`,
                    `<span class="col-stat">${getStat('intelligence')}</span>`,
                    `<span class="col-stat">${getStat('charm')}</span>`
                ].filter(Boolean);
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
                    if (daimyo && (b.id === daimyo.id || b.isDaimyo)) { familyMark = "◯"; }
                    else if (daimyo) {
                        const bFamily = Array.isArray(b.familyIds) ? b.familyIds : [];
                        const dFamily = Array.isArray(daimyo.familyIds) ? daimyo.familyIds : [];
                        if (bFamily.includes(daimyo.id) || dFamily.includes(b.id)) familyMark = "◯";
                    }
                }
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
                        if (!myLeader.givenName) factionNameStr = myLeader.familyName + "派";
                        else if (sameFamilyLeaders.length > 0) factionNameStr = myLeader.givenName + "派";
                        else factionNameStr = myLeader.familyName + "派";
                    }
                }

                cells = [
                    !isViewMode ? `<span class="col-act">${inputHtml}${b.isActionDone?'済':'未'}</span>` : null,
                    `<span class="col-name">${b.name}</span>`,
                    `<span class="col-rank">${b.getRankName()}</span>`,
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
            } else if (isViewMode) {
                onClickStr = `window.GameApp.ui.info.showBushoDetailModalById(${b.id})`;
            } else {
                onClickStr = `window.GameApp.ui.info.handleBushoSelect(event, ${isMulti}, ${spec.costGold || 0}, ${spec.costRice || 0}, '${actionType}')`;
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

        let minW = isViewMode ? "900px" : "850px";

        // ここから追加：タブとモードに合わせた列幅の設定
        let gridSp = null;
        let gridPc = null;

        // 状態タブの時だけ、JSから直接「この幅で並べてね」と指示を出します
        if (this.bushoCurrentTab === 'status') {
            if (isViewMode) {
                gridSp = "2.5fr 1.5fr 2fr 2fr 1fr 1fr 1fr 1.5fr";
                gridPc = "100px 60px 140px 140px 50px 50px 60px 1fr";
            } else {
                gridSp = "35px 2.5fr 1.5fr 2fr 2fr 1fr 1fr 1fr 1.5fr";
                gridPc = "45px 100px 60px 140px 140px 50px 50px 60px 1fr";
            }
        }
        // 基本（stats）タブの時は null のままになり、今まで通りCSSの基本設定にお任せします

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
            gridTemplateSp: gridSp,
            gridTemplatePc: gridPc,
            onBack: () => {
                if (onBack) onBack(); 
                else if (extraData && extraData.onCancel) extraData.onCancel();
            },
            onConfirm: onConfirmHandler,
            hideBackBtn: extraData && extraData.hideCancel,
            onTabClick: (tabKey) => {
                this.bushoCurrentTab = tabKey;
                this._renderBushoSelector(actionType, targetId, extraData, onBack, 0);
            },
            onScopeClick: (scopeKey) => {
                this.bushoCurrentScope = scopeKey;
                this._renderBushoSelector(actionType, targetId, extraData, onBack, 0);
            },
            onSortClick: (sortKey) => {
                if (this.bushoCurrentSortKey === sortKey) {
                    this.bushoIsSortAsc = !this.bushoIsSortAsc;
                } else {
                    this.bushoCurrentSortKey = sortKey;
                    this.bushoIsSortAsc = false; 
                    if (['name', 'faction', 'castle', 'faction_leader'].includes(sortKey)) {
                        this.bushoIsSortAsc = true;
                    }
                }
                this._renderBushoSelector(actionType, targetId, extraData, onBack, 0);
            }
        });

        this._updateBushoSelectorUI();
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
            } else if (type === 'headhunt_gold' || type === 'charity' || type === 'reinf_gold') {
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
        } else if (type === 'reinf_gold') {
            document.getElementById('quantity-title').textContent = "使者に持たせる金 (最大1500)"; 
            const baseCastle = (data && data.length > 0) ? data[0] : c;
            const maxGold = Math.min(1500, baseCastle.gold);
            inputs.gold = createSlider("持参金", "gold", maxGold, 0);
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
                onClickStr = `if(window.AudioManager) window.AudioManager.playSE('choice.ogg'); window.GameApp.ui.info.showKunishuDetail(${kunishu.id})`;
            }

            items.push({
                onClick: onClickStr,
                cells: [
                    `<strong class="col-kunishu-name">${kunishuName}</strong>`,
                    `<span>${leaderName}</span>`,
                    `<span>${castleName}</span>`,
                    `<span>${provinceName}</span>`,
                    `<span>${kunishu.soldiers}</span>`,
                    `<span>${friendBarHtml}</span>`,
                    `<span class="${relClass}" style="font-weight:bold;">${relStatus}</span>`
                ]
            });
        });

        this.selectedKunishuId = null;

        this._renderListModal({
            title: isSelectMode ? "対象とする諸勢力をお選びください" : "諸勢力一覧",
            contextHtml: contextHtml,
            headers: ["勢力名", "頭領", "所在", "所属", "兵士", "友好度", "関係"],
            headerClass: `kunishu-list-header ${modeClassStr}`,
            itemClass: `kunishu-list-item ${modeClassStr}`,
            listClass: "kunishu-list-container",
            items: items,
            scrollPos: scrollPos,
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
        if (window.AudioManager) window.AudioManager.playSE('choice.ogg');
        
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
        this.pushModal('history_list', [historyList]);
    }

    _renderHistoryList(historyList, scrollPos = 0) {
        const modal = document.getElementById('selector-modal');
        const titleEl = document.getElementById('selector-title');
        const listContainer = document.getElementById('selector-list');
        const contextEl = document.getElementById('selector-context-info');
        const tabsEl = document.getElementById('selector-tabs');
        const confirmBtn = document.getElementById('selector-confirm-btn');
        const backBtn = document.querySelector('#selector-modal .btn-secondary');

        if (!modal) return;
        modal.classList.remove('hidden');
        if (titleEl) titleEl.textContent = "行動履歴";
        if (contextEl) contextEl.classList.add('hidden');
        if (tabsEl) tabsEl.classList.add('hidden');
        if (confirmBtn) confirmBtn.classList.add('hidden');

        if(backBtn) {
            backBtn.style.display = '';
            backBtn.textContent = '閉じる';
            backBtn.onclick = () => {
                if (window.AudioManager) window.AudioManager.playSE('cancel.ogg');
                this.popModal();
            };
            const footer = backBtn.parentElement;
            if (footer) footer.style.justifyContent = 'center';
        }

        let listHtml = '';
        if (!historyList || historyList.length === 0) {
            listHtml = '<div style="padding: 10px; text-align: center;">履歴がありません。</div>';
        } else {
            historyList.forEach(log => {
                const text = typeof log === 'string' ? log : (log.text || "");
                listHtml += `<div class="history-list-item">${text}</div>`;
            });
        }

        if (listContainer) {
            listContainer.className = 'list-container hide-native-scroll';
            listContainer.style.display = 'block';
            listContainer.innerHTML = listHtml;
            if (window.CustomScrollbar) {
                if (!this.ui.bushoScrollbar) this.ui.bushoScrollbar = new CustomScrollbar(listContainer);
                setTimeout(() => {
                    listContainer.scrollTop = scrollPos;
                    this.ui.bushoScrollbar.update();
                }, 10);
            } else {
                listContainer.scrollTop = scrollPos;
            }
        }
    }

    // ==========================================
    // ★援軍の勢力選択リストの魔法（共通モーダル対応版）
    // ==========================================
    showForceSelector(forces, onSelect, onCancel) {
        this.closeCommonModal(); 
        this.pushModal('force_selector', [forces, onSelect, onCancel]);
    }

    _renderForceSelector(forces, onSelect, onCancel, scrollPos = 0) {
        let contextHtml = "<div>援軍を要請する勢力を選択してください</div>";
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
        if (window.AudioManager) window.AudioManager.playSE('choice.ogg');
        
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
}