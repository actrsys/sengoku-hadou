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
        let provinceYomi = "";
        if (this.game.provinces) {
            const province = this.game.provinces.find(p => p.id === castle.provinceId);
            if (province) {
                provinceName = province.province;
                provinceYomi = province.provinceYomi || "";
            }
        }

        const kunishus = this.game.kunishuSystem ? this.game.kunishuSystem.getKunishusInCastle(castle.id) : [];
        const kunishuCount = kunishus.length;

        // ★ メイン画面と全く同じ仕様での「武将」と「浪人」のカウント
        let activeBushoCount = 0;
        if (castle.ownerClan !== 0 && this.game && this.game.bushos) {
            activeBushoCount = this.game.bushos.filter(b => b.castleId === castle.id && b.clan === castle.ownerClan && b.status === 'active').length;
        }

        let roninCount = 0;
        if (this.game && this.game.bushos) {
            roninCount = this.game.bushos.filter(b => b.castleId === castle.id && b.status === 'ronin').length;
        }

        // ボタン活性化チェック用（武将＋浪人）
        const targetBushos = this.game.bushos.filter(b => {
            if (b.castleId !== castle.id) return false;
            if (b.status === 'ronin') return true;
            if (castle.ownerClan > 0 && b.status === 'active' && b.clan === castle.ownerClan) return true;
            return false;
        });
        const bushoCount = targetBushos.length;

        let totalGoldIncome = GameSystem.calcBaseGoldIncome(castle);
        let totalRiceIncome = GameSystem.calcBaseRiceIncome(castle);

        const isPort = GameSystem.isPortCastle(castle);
        const isHorse = GameSystem.isProdCastle(castle, 'horse');
        const isGun = GameSystem.isProdCastle(castle, 'gun');

        // スマホ版かどうかをチェックして、文字サイズや隙間を切り替える魔法です！
        const isPc = document.body.classList.contains('is-pc');

        // 文字サイズ（スマホ版はPC版の約0.9倍より小さくします）
        const fSizeProvYomi = isPc ? "0.75rem" : "0.65rem";
        const fSizeProvName = isPc ? "1.4rem" : "1.25rem";
        const fSizeCastleYomi = isPc ? "0.75rem" : "0.65rem";
        const fSizeCastleName = isPc ? "1.4rem" : "1.25rem";
        const fSizeLordLabel = isPc ? "1.05rem" : "0.95rem";
        const fSizeLegionInfo = isPc ? "0.9rem" : "0.8rem";
        const fSizeStatLabel = isPc ? "0.85rem" : "0.70rem";
        const fSizeStatValue = isPc ? "0.85rem" : "0.70rem";
        const fSizeMark = isPc ? "0.85rem" : "0.75rem";

        // 3つの列の隙間（スマホ版は横の隙間を半分にします）
        const gridGap = isPc ? "8px 6px" : "8px 3px";

        let marksHtml = "";
        if (isPort) marksHtml += `<span class="status-mark" style="font-size: ${fSizeMark}; padding: 4px 8px; background-color: #0288d1;">港</span>`;
        if (isHorse) marksHtml += `<span class="status-mark" style="font-size: ${fSizeMark}; padding: 4px 8px; background-color: #f57c00;">馬産地</span>`;
        if (isGun) marksHtml += `<span class="status-mark" style="font-size: ${fSizeMark}; padding: 4px 8px; background-color: #5d4037;">鉄砲産地</span>`;

        // 顔画像（ここはそのままの大きさを維持します）
        const faceStyle = "width: 100%; max-width: 90px; aspect-ratio: 1/1; object-fit: cover; border: 2px solid #fff; box-shadow: inset 0 0 0 1px rgba(0,0,0,0.7), 0 0 6px rgba(0,0,0,0.8); border-radius: 6px; background: radial-gradient(circle, #1a2a3a 0%, #050a10 100%); margin: 0;";
        let faceHtml = "";
        if (castellan && castellan.faceIcon) {
            faceHtml = `<img src="data/images/faceicons/${castellan.faceIcon}" style="${faceStyle}" onerror="this.style.display='none'">`;
        } else {
            faceHtml = `<div style="${faceStyle}"></div>`;
        }

        const yomiStr = castle.yomi ? castle.yomi : "";

        // 軍団情報の文字列を生成（括弧を削除）
        let legionInfoStr = "";
        if (castle.ownerClan > 0) {
            if (castle.legionId === 0) {
                legionInfoStr = `${clanName} 直轄領`;
            } else {
                if (this.game.legions) {
                    const legion = this.game.legions.find(l => Number(l.legionNo) === Number(castle.legionId) && Number(l.clanId) === Number(castle.ownerClan));
                    if (legion && legion.commanderId > 0) {
                        const commander = this.game.getBusho(legion.commanderId);
                        if (commander) {
                            legionInfoStr = `${clanName} ${commander.name} 領`;
                        }
                    }
                }
                if (!legionInfoStr) legionInfoStr = `第${castle.legionId}軍団 領`;
            }
        } else {
            legionInfoStr = `無所属`;
        }

        // --- 二重背景・ステータス行の生成魔法（文字サイズを上で決めたものに置き換えます） ---
        const groupWrapStyle = "background: rgba(0, 0, 0, 0.2); border: 1px solid rgba(212, 175, 55, 0.2); border-radius: 6px; padding: 4px; display: flex; flex-direction: column; gap: 4px;";
        const statBoxStyle = "background: rgba(0, 0, 0, 0.4); border: 1px solid rgba(212, 175, 55, 0.3); border-radius: 4px; padding: 2px 6px; display: flex; justify-content: space-between; align-items: center;";
        
        const labelStyle = `color: #ffd54f; font-size: ${fSizeStatLabel}; text-shadow: 1px 1px 0 #000, -1px -1px 0 #000, 1px -1px 0 #000, -1px 1px 0 #000; text-align: left;`;
        const valueStyle = `color: #fff; font-size: ${fSizeStatValue}; font-weight: bold; text-shadow: 1px 1px 0 #000, -1px -1px 0 #000, 1px -1px 0 #000, -1px 1px 0 #000; text-align: right; font-variant-numeric: tabular-nums;`;
        
        const makeRow = (label, value) => {
            let extraLabelStyle = "";
            // スマホ版のみ、3文字以上の項目名（月支出など）は横幅をきゅっと詰めます
            if (!isPc && label.length >= 3) {
                extraLabelStyle = " letter-spacing: -1px; transform: scaleX(0.9); transform-origin: left center; display: inline-block;";
            }
            return `<div style="${statBoxStyle}"><span style="${labelStyle}${extraLabelStyle}">${label}</span><span style="${valueStyle}">${value}</span></div>`;
        };
        const makeEmptyRow = () => `<div style="${statBoxStyle}; visibility: hidden;"><span>&nbsp;</span><span>&nbsp;</span></div>`;

        if (listContainer) {
            listContainer.className = 'list-container hide-native-scroll';
            listContainer.style.display = 'block';
            listContainer.innerHTML = `
                <div class="kyoten-detail-wrapper" style="padding: 8px 10px; min-height: 100%; display: flex; flex-direction: column; box-sizing: border-box;">
                    
                    <!-- 【ヘッダー部】 左上に顔グラ、右にテキスト情報 -->
                    <div style="display: flex; align-items: flex-start; gap: 15px; margin-bottom: 10px; border-bottom: 1px solid rgba(212, 175, 55, 0.3); padding-bottom: 8px;">
                        <div style="flex-shrink: 0; width: 90px;">
                            ${faceHtml}
                        </div>
                        <div style="display: flex; flex-direction: column; gap: 6px; flex: 1;">
                            <!-- 国名＆拠点名 -->
                            <div style="display: flex; align-items: flex-end; gap: 15px;">
                                <div style="display: flex; flex-direction: column; align-items: flex-start;">
                                    <span style="font-size: ${fSizeProvYomi}; color: #ccc; min-height: 1em;">${provinceYomi}</span>
                                    <span style="font-size: ${fSizeProvName}; font-weight: bold; color: #fff; line-height: 1;">${provinceName}</span>
                                </div>
                                <div style="display: flex; flex-direction: column; align-items: flex-start;">
                                    <span style="font-size: ${fSizeCastleYomi}; color: #ccc; min-height: 1em;">${yomiStr}</span>
                                    <span style="font-size: ${fSizeCastleName}; font-weight: bold; color: #fff; line-height: 1;">${castle.name}</span>
                                </div>
                            </div>
                            <!-- 城主＆直轄/国主 -->
                            <div style="display: flex; flex-direction: column; align-items: flex-start; gap: 4px;">
                                <div style="font-size: ${fSizeLordLabel}; color: #ffd54f;">城主 <span style="color: #fff; font-weight: bold;">${castellanName}</span></div>
                                <div style="font-size: ${fSizeLegionInfo}; color: #ccc;">${legionInfoStr}</div>
                            </div>
                        </div>
                    </div>

                    <!-- 【ステータス部：上段】 -->
                    <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: ${gridGap}; margin-bottom: 8px;">
                        <!-- 左列：武将・浪人・空箱 -->
                        <div style="${groupWrapStyle}">
                            ${makeRow('武将', activeBushoCount)}
                            ${makeRow('浪人', roninCount)}
                            ${makeEmptyRow()}
                        </div>
                        
                        <!-- 中央列：石高・鉱山・民忠 -->
                        <div style="${groupWrapStyle}">
                            ${makeRow('石高', castle.kokudaka)}
                            ${makeRow('鉱山', castle.commerce)}
                            ${makeRow('民忠', castle.peoplesLoyalty)}
                        </div>

                        <!-- 右列：訓練・士気・防御 -->
                        <div style="${groupWrapStyle}">
                            ${makeRow('訓練', castle.training)}
                            ${makeRow('士気', castle.morale)}
                            ${makeRow('防御', castle.defense)}
                        </div>
                    </div>

                    <!-- 【ステータス部：下段】 -->
                    <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: ${gridGap}; margin-bottom: 10px;">
                        
                        <!-- 左列：金・兵糧 ＋ 独立した人口 -->
                        <div style="display: flex; flex-direction: column; gap: 6px;">
                            <div style="${groupWrapStyle}">
                                ${makeRow('金', castle.gold)}
                                ${makeRow('兵糧', castle.rice)}
                            </div>
                            <div style="${groupWrapStyle}">
                                ${makeRow('人口', castle.population)}
                            </div>
                        </div>

                        <!-- 中央列：月収入・年収穫 ＋ 見えない箱 -->
                        <div style="display: flex; flex-direction: column; gap: 6px;">
                            <div style="${groupWrapStyle}">
                                ${makeRow('月収入', totalGoldIncome)}
                                ${makeRow('年収穫', totalRiceIncome)}
                            </div>
                            <div style="${groupWrapStyle}; visibility: hidden;">
                                ${makeEmptyRow()}
                            </div>
                        </div>

                        <!-- 右列：軍馬・鉄砲 ＋ 独立した兵士 -->
                        <div style="display: flex; flex-direction: column; gap: 6px;">
                            <div style="${groupWrapStyle}">
                                ${makeRow('軍馬', castle.horses || 0)}
                                ${makeRow('鉄砲', castle.guns || 0)}
                            </div>
                            <div style="${groupWrapStyle}">
                                ${makeRow('兵士', castle.soldiers)}
                            </div>
                        </div>
                    </div>

                    <!-- フッター（武将/諸勢力） -->
                    <div style="display: flex; justify-content: space-between; align-items: flex-end; margin-top: auto; padding-top: 5px;">
                        <div style="display: flex; gap: 5px; flex-wrap: wrap;">
                            ${marksHtml}
                        </div>
                        <div style="display: flex; gap: 10px;">
                            <button class="daimyo-detail-action-btn" id="castle-busho-btn" ${bushoCount === 0 ? 'disabled' : ''}>武将</button>
                            <button class="daimyo-detail-action-btn" id="castle-kunishu-btn" ${kunishuCount === 0 ? 'disabled' : ''}>諸勢力</button>
                        </div>
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
        
        // ==========================================
        // ★高速化：ソートや表示のループに入る前に、早見表を一気に作ります！
        // ==========================================
        const clanMap = new Map();
        if (this.game.clans) this.game.clans.forEach(c => clanMap.set(c.id, c));
        
        const bushoMap = new Map();
        if (this.game.bushos) this.game.bushos.forEach(b => bushoMap.set(b.id, b));
        
        const provinceMap = new Map();
        if (this.game.provinces) this.game.provinces.forEach(p => provinceMap.set(p.id, p));

        // ★超高速化：お城ごとの「武将の数」と「毎月の給料合計」を、事前に1回の計算で済ませて箱に入れておきます！
        // （今まで：表示や並べ替えのたびに、毎回4000人の武将リストからお城の住人を探して計算していたので激重でした）
        const castleBushoStatsMap = new Map();
        if (this.game.bushos) {
            this.game.bushos.forEach(b => {
                if (b.status === 'active' && b.clan > 0) {
                    if (!castleBushoStatsMap.has(b.castleId)) {
                        castleBushoStatsMap.set(b.castleId, { count: 0, salary: 0 });
                    }
                    const stats = castleBushoStatsMap.get(b.castleId);
                    stats.count++;
                    
                    // 給料の計算もここで一緒にやってしまいます
                    const clan = clanMap.get(b.clan);
                    if (clan && clan.leaderId) {
                        const daimyo = bushoMap.get(clan.leaderId);
                        if (daimyo) {
                            stats.salary += b.getSalary(daimyo);
                        }
                    }
                }
            });
        }
        // ==========================================

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

                    // ★高速化：早見表から一瞬で引き出します！
                    const getClanYomi = (c) => { const cd = clanMap.get(c.ownerClan); return cd ? (cd.yomi || cd.name) : "んんん"; };
                    const getClanName = (c) => { const cd = clanMap.get(c.ownerClan); return cd ? cd.name : ""; };
                    const getCastellanYomi = (c) => { const cb = bushoMap.get(c.castellanId); return cb ? (cb.yomi || cb.name) : "んんん"; };
                    const getCastellanName = (c) => { const cb = bushoMap.get(c.castellanId); return cb ? cb.name : ""; };
                    const getProvinceYomi = (c) => { const p = provinceMap.get(c.provinceId); return p ? (p.provinceYomi || p.province) : "んんん"; };
                    const getProvinceName = (c) => { const p = provinceMap.get(c.provinceId); return p ? p.province : ""; };
                    
                    // ★超高速化：事前に作った早見表（castleBushoStatsMap）から数や費用を取り出します！
                    const getBushoCount = (c) => { const stats = castleBushoStatsMap.get(c.id); return (c.ownerClan > 0 && stats) ? stats.count : 0; };
                    const getGoldConsume = (c) => { const stats = castleBushoStatsMap.get(c.id); return (c.ownerClan > 0 && stats) ? stats.salary : 0; };
                    
                    const getGoldIncome = (c) => GameSystem.calcBaseGoldIncome(c);
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
            gridSpStr = "1.4fr 1fr 1.2fr 1fr 0.6fr 1fr 1fr";
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
            gridSpStr = "1.4fr 1.1fr 1.2fr 1.1fr 1.2fr 1.2fr";
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
            gridSpStr = "1.4fr 1.2fr 1.1fr 1.1fr 1.2fr 1.2fr";
            gridPcStr = "140px 60px 80px 80px 100px 100px 1fr";
            headers = [
                `<span data-sort="name">拠点名${getSortMark('name')}</span>`,
                `<span data-sort="population">人口${getSortMark('population')}</span>`,
                `<span data-sort="goldIncome">月収入${getSortMark('goldIncome')}</span>`,
                `<span data-sort="goldConsume">月支出${getSortMark('goldConsume')}</span>`,
                `<span data-sort="riceIncome">年収穫${getSortMark('riceIncome')}</span>`,
                `<span data-sort="riceConsume">米消費${getSortMark('riceConsume')}</span>`,
                `<span class="pc-only"></span>`
            ];
        }

        let items = [];
        
        displayCastles.forEach(c => {
            // ★高速化：ループ内でも早見表を使います
            const clanData = clanMap.get(c.ownerClan);
            const clanName = clanData ? clanData.name : "";
            const castellan = bushoMap.get(c.castellanId);
            const castellanName = castellan ? castellan.name : "";
            
            let provinceName = "";
            const province = provinceMap.get(c.provinceId);
            if (province) provinceName = province.province;
            
            const stats = castleBushoStatsMap.get(c.id);
            const bushosCount = (c.ownerClan > 0 && stats) ? stats.count : 0;
            const consumeGold = (c.ownerClan > 0 && stats) ? stats.salary : 0;
            
            let riceIncome = GameSystem.calcBaseRiceIncome(c);
            let goldIncome = GameSystem.calcBaseGoldIncome(c);

            let consumeRice = Math.floor(c.soldiers * window.MainParams.Economy.ConsumeRicePerSoldier);
            let consumeRiceYear = consumeRice * 12; 
            
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
    },

    // ==========================================
    // ★所領分配の魔法
    // ==========================================
    showAllotFiefModal(legionNo) {
        this.closeCommonModal();
        this.allotFiefSelectedIds = null;
        this.allotFiefSavedState = false;
        this.pushModal('allot_fief', [legionNo]);
    },

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
            this.commonSelectedIds = [];
            myCastles.forEach(c => {
                if (Number(c.legionId) === Number(legionNo)) {
                    this.commonSelectedIds.push(Number(c.id));
                }
            });
            this.allotFiefSavedState = true;
            // ★追加：画面を開いた時の「最初の状態」をメモしておきます！
            this.allotFiefInitialIds = [...this.commonSelectedIds];
        }

        myCastles.sort((a, b) => {
            const aSelected = this.commonSelectedIds.includes(Number(a.id)) ? 1 : 0;
            const bSelected = this.commonSelectedIds.includes(Number(b.id)) ? 1 : 0;
            if (aSelected !== bSelected) return bSelected - aSelected;
            return a.id - b.id;
        });

        let items = [];
        myCastles.forEach(c => {
            const cId = Number(c.id);
            const isChecked = this.commonSelectedIds.includes(cId);
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

            let provinceName = "不明";
            if (this.game.provinces) {
                const province = this.game.provinces.find(p => p.id === c.provinceId);
                if (province) provinceName = province.province;
            }

            items.push({
                onClick: (e) => {
                    this.handleCommonSelect(cId, e.currentTarget, true);
                    // 所領分配特有の表示更新（直轄の文字を変えるなど）
                    const statusSpan = e.currentTarget.querySelector('.status-mark');
                    const isNowChecked = this.commonSelectedIds.includes(cId);
                    if (statusSpan) {
                        if (isNowChecked) {
                            statusSpan.style.color = '#fdea60';
                            statusSpan.style.fontWeight = 'bold';
                            statusSpan.textContent = legionName;
                        } else {
                            statusSpan.style.color = '#ccc';
                            statusSpan.style.fontWeight = 'normal';
                            if (Number(c.legionId) === Number(legionNo)) {
                                statusSpan.textContent = "直轄";
                            } else {
                                statusSpan.textContent = originalLegionStr;
                            }
                        }
                    }
                    
                    // ★追加：最初の状態から「変更」があった時だけ決定ボタンを明るくします！
                    let isChanged = false;
                    if (this.allotFiefInitialIds) {
                        if (this.commonSelectedIds.length !== this.allotFiefInitialIds.length) {
                            isChanged = true;
                        } else {
                            isChanged = this.commonSelectedIds.some(id => !this.allotFiefInitialIds.includes(id));
                        }
                    }
                    
                    const confirmBtn = document.getElementById('selector-confirm-btn');
                    if (confirmBtn) {
                        if (isChanged) {
                            confirmBtn.disabled = false;
                            confirmBtn.style.opacity = '1';
                            confirmBtn.style.cursor = 'pointer';
                        } else {
                            confirmBtn.disabled = true;
                            confirmBtn.style.opacity = '0.5';
                            confirmBtn.style.cursor = 'not-allowed';
                        }
                    }
                },
                cells: [
                    `<span class="col-act">${inputHtml}<span class="status-mark" style="${statusStyle}">${displayLegionStr}</span></span>`,
                    `<span class="col-castle-name">${c.name}</span>`,
                    `<span class="col-castellan">${castellanName}</span>`,
                    `<span class="col-province">${provinceName}</span>`,
                    `<span class="col-soldiers">${c.soldiers}</span>`,
                    `<span class="col-defense">${c.defense}</span>`,
                    `<span class="col-empty pc-only"></span>`
                ],
                itemClass: isChecked ? "selected" : ""
            });
        });

        this._renderListModal({
            title: `${legionName}の所領分配`,
            contextHtml: `<div>${legionName}の所属とする拠点にチェックを入れてください</div>`,
            headers: ["所属", "拠点名", "城主", "国", "兵数", "防御", `<span class="col-empty pc-only"></span>`],
            headerClass: "delegate-list-header",
            itemClass: "delegate-list-item",
            listClass: "delegate-list-container",
            items: items,
            scrollPos: scrollPos,
            gridTemplateSp: "1.2fr 2fr 1.5fr 1.2fr 1fr 1fr",
            gridTemplatePc: "100px 160px 120px 80px 80px 80px 1fr",
            onBack: () => {
                this.commonSelectedIds = [];
                this.allotFiefSavedState = false;
                this.allotFiefInitialIds = null; // ★お掃除
                this.closeCommonModal();
            },
            onConfirm: () => {
                const selectedIds = [...this.commonSelectedIds];
                this.closeCommonModal();
                this.commonSelectedIds = [];
                this.allotFiefSavedState = false;
                this.allotFiefInitialIds = null; // ★お掃除
                window.GameApp.commandSystem.executeAllotFief(legionNo, selectedIds, myCastles);
            }
        });
        
        // ★変更：画面を開いた直後は「変更なし（初期状態）」なので決定ボタンを暗くします
        const confirmBtn = document.getElementById('selector-confirm-btn');
        if (confirmBtn) {
            let isChanged = false;
            if (this.allotFiefInitialIds) {
                if (this.commonSelectedIds.length !== this.allotFiefInitialIds.length) {
                    isChanged = true;
                } else {
                    isChanged = this.commonSelectedIds.some(id => !this.allotFiefInitialIds.includes(id));
                }
            }
            if (isChanged) {
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
});