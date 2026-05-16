/**
 * ui_info_kyoten.js
 * 拠点一覧や詳細に関する機能を UIInfoManager に合体させるファイルです
 * Object.assignではそれぞれのメソッドの間に必ずカンマが必要です
 */
Object.assign(UIInfoManager.prototype, {

    // ==========================================
    // ★ここから追加：拠点詳細の魔法です！
    // ==========================================
    showCastleDetail(castleId) {
        this.pushModal('castle_detail', [castleId]);
    },
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
                                <div class="daimyo-detail-stat-box"><span class="daimyo-detail-label">月収入</span><span class="daimyo-detail-value">${totalGoldIncome}</span></div>
                            </div>
                            <div class="daimyo-detail-row daimyo-detail-2col">
                                <div class="daimyo-detail-stat-box"><span class="daimyo-detail-label">兵糧</span><span class="daimyo-detail-value">${castle.rice}</span></div>
                                <div class="daimyo-detail-stat-box"><span class="daimyo-detail-label">年米収穫</span><span class="daimyo-detail-value">${totalRiceIncome}</span></div>
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
    },
    
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
        this.pushModal('kyoten_list', [clanId, false, null]); // ★選択モードではない、という合図を渡します
    },
    
    // ★引数に isSelectMode と selectData を追加して、国主選びの時にも使えるようにしました！
    _renderKyotenList(clanId, isSelectMode = false, selectData = null, scrollPos = 0) {
        this.kyotenTargetClanId = clanId !== null ? clanId : this.game.playerClanId;
        
        if (!this.currentKyotenTab) this.currentKyotenTab = 'status';
        if (!this.currentKyotenScope) this.currentKyotenScope = 'clan';
        
        if (clanId !== null) {
            this.currentKyotenScope = 'clan';
        }
        
        let scopeHtml = '';
        // ★選択モードの時は「全国」タブは隠して、自家のお城だけを選ばせます
        if (clanId === null && !isSelectMode) {
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

            // ★選択モード（国主任命）の時だけ、選んではいけないお城（大名の居城や、すでに国主がいる城）を隠します！
            if (isSelectMode && selectData) {
                const daimyo = this.game.bushos.find(b => b.clan === this.game.playerClanId && b.isDaimyo);
                this.kyotenCastles = this.kyotenCastles.filter(c => {
                    if (daimyo && Number(c.id) === Number(daimyo.castleId)) return false;
                    const isCommanderCastle = this.game.bushos.some(b => Number(b.castleId) === Number(c.id) && b.isCommander && b.clan === this.game.playerClanId);
                    if (isCommanderCastle) return false;
                    return true;
                });
                this.selectedCastleIdForLegion = null; // リセットしておきます
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
                        case 'legion': valA = a.legionId || 0; valB = b.legionId || 0; break;
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
                `<span data-sort="name">拠点名${getSortMark('name')}</span>`,
                `<span data-sort="clan">勢力${getSortMark('clan')}</span>`,
                `<span data-sort="castellan">城主${getSortMark('castellan')}</span>`,
                `<span data-sort="province">国${getSortMark('province')}</span>`,
                `<span data-sort="bushoCount">武将${getSortMark('bushoCount')}</span>`,
                `<span data-sort="gold">金${getSortMark('gold')}</span>`,
                `<span data-sort="rice">兵糧${getSortMark('rice')}</span>`,
                `<span class="pc-only"></span>`
            ];
        } else if (this.currentKyotenTab === 'military') {
            gridSpStr = "2fr 1.2fr 1fr 1fr 1fr 1fr";
            gridPcStr = "140px 100px 80px 80px 80px 80px 1fr";
            headers = [
                `<span data-sort="name">拠点名${getSortMark('name')}</span>`,
                `<span data-sort="legion">所属${getSortMark('legion')}</span>`,
                `<span data-sort="soldiers">兵士${getSortMark('soldiers')}</span>`,
                `<span data-sort="defense">防御${getSortMark('defense')}</span>`,
                `<span data-sort="horses">軍馬${getSortMark('horses')}</span>`,
                `<span data-sort="guns">鉄砲${getSortMark('guns')}</span>`,
                `<span class="pc-only"></span>`
            ];
        } else if (this.currentKyotenTab === 'economy') {
            gridSpStr = "2fr 1fr 1fr 1fr 1.2fr 1.2fr";
            gridPcStr = "140px 60px 80px 80px 100px 100px 1fr";
            headers = [
                `<span data-sort="name">拠点名${getSortMark('name')}</span>`,
                `<span data-sort="population">人口${getSortMark('population')}</span>`,
                `<span data-sort="goldIncome">月収入${getSortMark('goldIncome')}</span>`,
                `<span data-sort="goldConsume">月支出${getSortMark('goldConsume')}</span>`,
                `<span data-sort="riceIncome">年米収穫${getSortMark('riceIncome')}</span>`,
                `<span data-sort="riceConsume">年米消費${getSortMark('riceConsume')}</span>`,
                `<span class="pc-only"></span>`
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
                let legionStr = "直轄";
                if (c.legionId > 0) {
                    const numberNames = ["直轄", "第一席", "第二席", "第三席", "第四席", "第五席", "第六席", "第七席", "第八席"];
                    legionStr = numberNames[c.legionId] || `第${c.legionId}席`;
                }
                cells = [
                    `<span class="col-castle-name" style="justify-content:flex-start; padding-left:5px;">${c.name}</span>`,
                    `<span class="col-legion">${legionStr}</span>`,
                    `<span class="col-soldiers">${c.soldiers}</span>`,
                    `<span class="col-defense">${c.defense}</span>`,
                    `<span class="col-horses">${c.horses || 0}</span>`,
                    `<span class="col-guns">${c.guns || 0}</span>`,
                    `<span class="pc-only"></span>`
                ];
            } else if (this.currentKyotenTab === 'economy') {
                cells = [
                    `<span class="col-castle-name" style="justify-content:flex-start; padding-left:5px;">${c.name}</span>`,
                    `<span class="col-population">${c.population}</span>`,
                    `<span class="col-gold-income">${goldIncome}</span>`,
                    `<span class="col-gold-consume">${consumeGold}</span>`,
                    `<span class="col-rice-income">${riceIncome}</span>`,
                    `<span class="col-rice-consume">${consumeRiceYear}</span>`,
                    `<span class="pc-only"></span>`
                ];
            }

            // ★通常時と選択時でクリックした時の動きを変えます！
            let onClickStr = `window.GameApp.ui.info.showCastleDetail(${c.id})`;
            let extraClass = "kyoten-mode";

            if (isSelectMode && selectData) {
                onClickStr = (e) => this.handleCommonSelect(c.id, e.currentTarget, false);
                // 選択されている城を光らせます
                if (this.commonSelectedIds && this.commonSelectedIds.includes(c.id)) {
                    extraClass += " selected";
                }
            }

            items.push({
                onClick: onClickStr,
                cells: cells,
                itemClass: extraClass
            });
        });

        // ★選択モードの時だけ、タイトルや決定ボタンの魔法を追加します
        let titleStr = "拠点一覧";
        let contextHtmlStr = null;
        let onBackFunc = null;
        let onConfirmFunc = null;

        if (isSelectMode && selectData) {
            titleStr = "任せる拠点を選択してください";
            contextHtmlStr = "<div>任せる拠点を選択してください</div>";
            onBackFunc = () => {
                this.closeCommonModal();
                window.GameApp.ui.showAppointLegionLeaderModal(selectData.legionNo);
            };
            onConfirmFunc = () => {
                if (!this.commonSelectedIds || this.commonSelectedIds.length === 0) return;
                const castleId = this.commonSelectedIds[0];
                
                window.GameApp.ui.showDialog("よろしいですか？", true, () => {
                    this.closeCommonModal();
                    window.GameApp.commandSystem.executeAppointLegionLeader(selectData.bushoId, selectData.legionNo, castleId);
                }, () => {
                    this._renderKyotenList(clanId, isSelectMode, selectData, 0);
                });
            };
        }

        this._renderListModal({
            title: titleStr,
            contextHtml: contextHtmlStr,
            tabsHtml: tabsHtml,
            headers: headers,
            headerClass: "sortable-header kyoten-mode",
            itemClass: "", // itemClass は上で個別にセットしたので空にしておきます
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
                this._renderKyotenList(clanId, isSelectMode, selectData, scroll);
            },
            onScopeClick: (scopeKey) => {
                this.currentKyotenScope = scopeKey;
                this._saveStableSortResult('kyoten', null); // ★追加：スコープ変更時にソートの記憶をリセット
                const listEl = document.getElementById('selector-list');
                const scroll = listEl ? listEl.scrollTop : 0;
                this._renderKyotenList(clanId, isSelectMode, selectData, scroll);
            },
            onSortClick: (sortKey) => {
                const defaultAscKeys = ['name', 'clan', 'castellan', 'province', 'legion'];
                const newState = this._toggleSortState(this.currentKyotenSortKey, this.isKyotenSortAsc, sortKey, defaultAscKeys);
                this.currentKyotenSortKey = newState.key;
                this.isKyotenSortAsc = newState.isAsc;
                const listEl = document.getElementById('selector-list');
                const scroll = listEl ? listEl.scrollTop : 0;
                this._renderKyotenList(clanId, isSelectMode, selectData, scroll);
            },
            onBack: onBackFunc,
            onConfirm: onConfirmFunc
        });

        // ★追加：タブ切り替えなどで再描画された時に、決定ボタンの状態を復元します！
        if (isSelectMode && selectData) {
            this.updateCommonConfirmBtn();
        }
    },

    showAppointLegionCastleSelector(bushoId, legionNo) {
        this.closeCommonModal();
        this.kyotenSavedCastles = null;
        this.kyotenSavedSortedCastles = null;
        this.kyotenLastSortStateKey = null;
        this.kyotenLastScope = null;
        // 拠点一覧（kyoten_list）を選択モードで呼び出します
        this.pushModal('kyoten_list', [this.game.playerClanId, true, { bushoId: bushoId, legionNo: legionNo }]);
    }
});