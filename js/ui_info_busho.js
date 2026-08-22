/**
 * ui_info_busho.js
 * 武将一覧や詳細に関する機能を UIInfoManager に合体させるファイルです
 * Object.assignではそれぞれのメソッドの間に必ずカンマが必要です
 */
Object.assign(UIInfoManager.prototype, {

    showBushoDetailModal(busho) {
        this.bushoDetailCurrentTab = 'status';
        this.pushModal('busho_detail', [busho]);
    },
    
    _renderBushoDetail(busho, scrollPos = 0) {
        const shell = this._openInfoShell('武将情報', { showTabs: true });
        if (!shell) return;
        const { listContainer, tabsEl } = shell;
        const isPc = document.body.classList.contains('is-pc');

        if (!this.bushoDetailCurrentTab) this.bushoDetailCurrentTab = 'status';

        // 武将詳細では本来のタブ領域（枠の上）を使います。
        if (tabsEl) {
            tabsEl.classList.remove('hidden');
            tabsEl.classList.add('busho-detail-tabs');
            tabsEl.innerHTML = `
                <div class="busho-detail-tab-buttons">
                    <button class="busho-tab-btn ${this.bushoDetailCurrentTab === 'status' ? 'active' : ''}" id="busho-detail-tab-status">${isPc ? '基本' : '基'}</button>
                    <button class="busho-tab-btn ${this.bushoDetailCurrentTab === 'aptitude' ? 'active' : ''}" id="busho-detail-tab-aptitude">${isPc ? '技能' : '技'}</button>
                </div>
            `;
            
            // タブをクリックした時の処理もここで登録します
            setTimeout(() => {
                const tabStatus = document.getElementById('busho-detail-tab-status');
                const tabAptitude = document.getElementById('busho-detail-tab-aptitude');
                if (tabStatus) {
                    tabStatus.onclick = (e) => {
                        e.stopPropagation();
                        if (window.AudioManager) window.AudioManager.playSE('choice.ogg');
                        this.bushoDetailCurrentTab = 'status';
                        this._renderBushoDetail(busho, listContainer.scrollTop);
                    };
                }
                if (tabAptitude) {
                    tabAptitude.onclick = (e) => {
                        e.stopPropagation();
                        if (window.AudioManager) window.AudioManager.playSE('choice.ogg');
                        this.bushoDetailCurrentTab = 'aptitude';
                        this._renderBushoDetail(busho, listContainer.scrollTop);
                    };
                }
            }, 0);
        }
        
        const faceSrc = busho.faceIcon ? `data/images/faceicons/${busho.faceIcon}` : 'data/images/faceicons/unknown_face.webp';
        let faceHtml = `<img src="${faceSrc}" class="daimyo-detail-face busho-detail-face" alt="">`;

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
                    if (bFamily.some(fId => lFamily.includes(fId))) isFamily = true;
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
                    if (bFamily.some(fId => dFamily.includes(fId))) isFamily = true;
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
        if (factionNameStr !== "" && busho.isFactionLeader) {
            factionNameStr += " 筆頭";
        }

        let lordName = "なし";
        if (busho.isDaimyo) {
            lordName = "なし";
        } else if (busho.status === 'ronin') {
            lordName = "なし";
        } else if (busho.belongKunishuId > 0) {
            let kunishu = null;
            if (this.game.kunishuSystem && typeof this.game.kunishuSystem.getKunishu === 'function') kunishu = this.game.kunishuSystem.getKunishu(busho.belongKunishuId);
            else if (this.game.kunishus) kunishu = this.game.kunishus.find(k => k.id === busho.belongKunishuId);
            
            if (kunishu && kunishu.leaderId !== busho.id) {
                const leader = this.game.getBusho(kunishu.leaderId);
                lordName = leader ? leader.name : "不明";
            }
        } else if (busho.clan > 0) {
            if (castle && castle.legionId > 0) {
                let legion = null;
                if (this.game.legions) {
                    legion = this.game.legions.find(l => Number(l.legionNo) === Number(castle.legionId) && Number(l.clanId) === Number(busho.clan));
                }
                if (legion && legion.commanderId > 0 && legion.commanderId !== busho.id) {
                    const commander = this.game.getBusho(legion.commanderId);
                    lordName = commander ? commander.name : "不明";
                } else {
                    const clan = this.game.clans.find(c => c.id === busho.clan);
                    const daimyo = clan ? this.game.getBusho(clan.leaderId) : null;
                    lordName = daimyo ? daimyo.name : "なし";
                }
            } else {
                const clan = this.game.clans.find(c => c.id === busho.clan);
                const daimyo = clan ? this.game.getBusho(clan.leaderId) : null;
                lordName = daimyo ? daimyo.name : "なし";
            }
        }

        const gunshi = this.game.getClanGunshi(this.game.playerClanId);
        const myDaimyo = this.game.getClanDaimyo(this.game.playerClanId);
        let acc = null;
        if (busho.clan !== this.game.playerClanId && busho.clan !== 0 && castle) acc = castle.investigatedAccuracy;
        
        const getStatRow = (statKey, label) => {
            const gradeHtml = StatPresenter.getDisplayStatHTML(busho, statKey, gunshi, acc, this.game.playerClanId, myDaimyo);
            let perceived = StatPresenter.getPerceivedStatValue(busho, statKey, gunshi, acc, this.game.playerClanId, myDaimyo);
            if (busho.clan === this.game.playerClanId && busho.isDaimyo) perceived = busho[statKey];
            
            let percent = perceived !== null ? Math.max(0, perceived) : 0;
            if(perceived === null) percent = 0; 

            // ★変更：限界突破のゲージを分けず、1つのゲージがそのまま枠を突き破るようにします
            let basePercent = percent;
            let overBarHtml = ""; 
            let fillClass = percent > 100 ? "bar-fill-busho over-connected" : "bar-fill-busho";

            const expInfo = typeof busho.getExpInfo === 'function' ? busho.getExpInfo(statKey) : null;

            let expBarHtml = "";
            let mainBarClass = "bar-bg-busho";
            if (expInfo) {
                // ★追加：外枠全体の幅を120としたとき、基準となる100の幅(約83.3%)を指定します
                expBarHtml = `
                    <div class="exp-bar-bg busho-detail-bar-base">
                        <div class="exp-bar-fill ${expInfo.isMax ? 'is-max' : ''}" style="--bar-value: ${expInfo.percent}%;"></div>
                    </div>
                `;
            } else {
                expBarHtml = `
                    <div class="exp-bar-bg busho-detail-bar-base is-placeholder"></div>
                `;
            }

            return `
                <div class="daimyo-detail-stat-box busho-detail-stat-box">
                    <span class="daimyo-detail-label busho-detail-stat-label">${label}</span>
                    <span class="busho-detail-stat-grade">${gradeHtml}</span>
                    <div class="busho-stat-bar-wrapper busho-detail-stat-bar">
                        <!-- ★追加：ここにも基準幅(100/120)を指定し、右側に限界突破用のはみ出しスペースを確保します -->
                        <div class="${mainBarClass} busho-detail-bar-base">
                            <div class="${fillClass}" style="--bar-value:${basePercent}%;"></div>
                            ${overBarHtml}
                        </div>
                        ${expBarHtml}
                    </div>
                </div>
            `;
        };

        const yomiStr = busho.yomi ? busho.yomi : "";
        
        // ★修正：箱で分けるのではなく、純粋に文字として「少しだけ空く空白文字（&ensp;）」を挟み込みます
        let displayYomi = yomiStr;
        let displayName = busho.name;
        
        if (busho.givenName) {
            if (busho.familyYomi && busho.givenYomi) {
                // 読みが分かれている場合は、間に半角スペース幅の空白文字を入れます
                displayYomi = busho.familyYomi + "&ensp;" + busho.givenYomi;
            }
            // 名前が分かれている場合は、間に半角スペース幅の空白文字を入れます
            displayName = busho.familyName + "&ensp;" + busho.givenName;
        }

        let rightContentHtml = '';
        
        const makeRow = (label, value) => {
            const compactClass = label.length >= 3 ? ' busho-detail-label-compact' : '';
            return `<div class="daimyo-detail-stat-box"><span class="daimyo-detail-label${compactClass}">${label}</span><span class="daimyo-detail-value">${value}</span></div>`;
        };

        if (this.bushoDetailCurrentTab === 'status') {
            const statHtml = `
                <div class="busho-detail-group busho-detail-group-grow">
                    ${getStatRow('leadership', '統率')}
                    ${getStatRow('strength', '武勇')}
                    ${getStatRow('politics', '内政')}
                    ${getStatRow('diplomacy', '外交')}
                    ${getStatRow('intelligence', '智謀')}
                    ${getStatRow('charm', '魅力')}
                </div>
            `;

            const infoHtml = `
                <div class="busho-detail-info-column">
                    <div class="busho-detail-group">
                        ${makeRow('所在', castleName)}
                        ${makeRow('主君', lordName)}
                    </div>
                    <div class="busho-detail-group">
                        ${makeRow('年齢', ageStr !== "" ? ageStr : "&nbsp;")}
                        ${makeRow('俸禄', salary !== "" ? salary : "&nbsp;")}
                        ${makeRow('一門', isFamily ? "◯" : "&nbsp;")}
                        ${makeRow('派閥', factionNameStr !== "" ? factionNameStr : "&nbsp;")}
                    </div>
                </div>
            `;

            rightContentHtml = `
                <div class="busho-detail-status-layout">
                    ${statHtml}
                    ${infoHtml}
                </div>
            `;
        } else if (this.bushoDetailCurrentTab === 'aptitude') {
            // 適性のランク表示を綺麗にする魔法
            const getAptGradeHtml = (val) => {
                const lowVal = val ? val.toLowerCase() : 'e';
                return `<div class="grade-container rank-${lowVal}"><span class="grade-main">${val}</span></div>`;
            };

            const aptitudes = [
                { label: '足軽', val: busho.aptAshigaru },
                { label: '騎馬', val: busho.aptKiba },
                { label: '鉄砲', val: busho.aptTeppo },
                { label: '弓術', val: busho.aptYumi },
                { label: '武芸', val: busho.aptBugei },
                { label: '忍術', val: busho.aptNinjutsu },
                { label: '操船', val: busho.aptMaritime }
            ];
            
            // ★変更：基本タブ（6行）と高さを揃えるため、スマホ版でも2列表示に統一します
            const colCount = 2;
            const rowClass = "daimyo-detail-2col";
            
            let aptHtml = '';
            for(let i = 0; i < aptitudes.length; i += colCount) {
                let rowInnerHtml = '';
                for(let j = 0; j < colCount; j++) {
                    let apt = aptitudes[i + j];
                    if (apt) {
                        rowInnerHtml += `<div class="daimyo-detail-stat-box"><span class="daimyo-detail-label">${apt.label}</span><span class="daimyo-detail-value">${getAptGradeHtml(apt.val)}</span></div>`;
                    } else {
                        rowInnerHtml += `<div class="daimyo-detail-stat-box is-placeholder"></div>`;
                    }
                }
                aptHtml += `<div class="daimyo-detail-row ${rowClass}">${rowInnerHtml}</div>`;
            }

            // 技能データの解釈は SkillManager に一本化します。UIは結果だけ受け取ります。
            const skills = (typeof SkillManager !== 'undefined') ? SkillManager.getSkillList(busho) : [];
            
            // ★変更：技能を適性と同じように横に2つ並べてから改行するようにします
            let skillHtml = '';
            for (let i = 0; i < 3; i += 2) {
                let rowInnerHtml = '';
                for (let j = 0; j < 2; j++) {
                    let index = i + j;
                    if (index < 3) {
                        let skillName = skills[index] || "&nbsp;";

                        // ★ここから追加：技能がある箱だけクリックできるようにクラスや情報を付けます
                        let clickClass = "";
                        let dataAttr = "";
                        if (skills[index]) {
                            clickClass = "skill-box-clickable";
                            dataAttr = `data-skill-name="${skills[index]}"`;
                        }
                        
                        rowInnerHtml += `<div class="daimyo-detail-stat-box ${clickClass}" ${dataAttr}><span class="daimyo-detail-label">技能${index + 1}</span><span class="daimyo-detail-value">${skillName}</span></div>`;
                        // ★ここまで追加

                    } else {
                        // 4つ目の枠（空白）は形を綺麗に整えるために透明にして置いておきます
                        rowInnerHtml += `<div class="daimyo-detail-stat-box is-placeholder"></div>`;
                    }
                }
                skillHtml += `<div class="daimyo-detail-row daimyo-detail-2col">${rowInnerHtml}</div>`;
            }

            rightContentHtml = `
                <div class="busho-detail-aptitude-layout">
                    <div id="busho-aptitude-area" class="busho-detail-group busho-detail-group-grow">
                        ${aptHtml}
                    </div>
                    <div id="busho-skill-desc-area" class="busho-detail-group busho-detail-group-grow busho-skill-desc-area">
                        <!-- ★ここがダミーの箱を置く場所です（透明にして高さだけ確保します） -->
                        <!-- ★修正：手作りのダミーではなく、適性リストのHTML(aptHtml)をそのまま透明にして再利用することで、1ピクセルの狂いもなく高さを一致させます！ -->
                        <div class="busho-skill-desc-placeholder">
                            ${aptHtml}
                        </div>
                        <!-- ★実際のテキストはその上に被せるようにして配置します -->
                        <div id="busho-skill-desc-text" class="busho-skill-desc-text">
                        </div>
                    </div>
                    <div class="busho-detail-group">
                        ${skillHtml}
                    </div>
                </div>
            `;
        }

        if (listContainer) {
            listContainer.className = 'list-container hide-native-scroll';
            listContainer.style.display = 'block';
            listContainer.innerHTML = `
                <div class="daimyo-detail-container busho-detail-container">
                    <div class="daimyo-detail-header pc-only busho-detail-header-pc">
                        <div class="busho-detail-heading-stack">
                            <span class="busho-detail-yomi pc-only-yomi">${displayYomi}</span>
                            <div class="busho-detail-name-row pc-name-row">
                                <div class="daimyo-detail-name busho-detail-name-pc">${displayName}</div>
                                ${rankName}
                            </div>
                            <div class="busho-detail-meta pc-meta">
                                <span>${affiliationName}</span>
                                <span>${busho.getRankName()}</span>
                            </div>
                        </div>
                    </div>
                    <div class="daimyo-detail-body">
                        <div class="daimyo-detail-left">
                            ${faceHtml}
                            <div class="daimyo-detail-header sp-only busho-detail-header-sp">
                                <span class="busho-detail-yomi sp-yomi">${displayYomi}</span>
                                <div class="busho-detail-name-row sp-name-row">
                                    <div class="daimyo-detail-name busho-detail-name-sp">${displayName}</div>
                                    ${rankName}
                                </div>
                                <div class="busho-detail-meta sp-meta">
                                    <span>${affiliationName}</span>
                                    <span>${busho.getRankName()}</span>
                                </div>
                            </div>
                        </div>
                        <div class="daimyo-detail-right busho-detail-right">
                            ${rightContentHtml}
                        </div>
                    </div>
                    <div class="busho-detail-action-footer">
                        <button class="daimyo-detail-action-btn" id="busho-wife-btn" ${(Array.isArray(busho.wifeIds) && busho.wifeIds.length > 0) ? '' : 'disabled'}>配偶者</button>
                    </div>
                </div>
            `;

            const detailFace = listContainer.querySelector('.busho-detail-face');
            if (detailFace) {
                detailFace.addEventListener('error', () => {
                    const fallback = 'data/images/faceicons/unknown_face.webp';
                    if (!detailFace.src.endsWith('/unknown_face.webp')) detailFace.src = fallback;
                }, { once: true });
            }

            const btnWife = document.getElementById('busho-wife-btn');
            if (btnWife && Array.isArray(busho.wifeIds) && busho.wifeIds.length > 0) {
                btnWife.onclick = (e) => {
                    e.stopPropagation();
                    if (window.AudioManager) window.AudioManager.playSE('decision.ogg');
                    this.pushModal('princess_list', [false, busho.id, 'view_busho_wife']);
                };
            }

            listContainer.scrollTop = scrollPos;

            // ★技能の箱をクリックした時に説明を出す魔法
            if (this.bushoDetailCurrentTab === 'aptitude') {
                const aptArea = document.getElementById('busho-aptitude-area');
                const descArea = document.getElementById('busho-skill-desc-area');
                const descText = document.getElementById('busho-skill-desc-text');
                const skillBoxes = document.querySelectorAll('.skill-box-clickable');
                const detailContainer = listContainer.querySelector('.daimyo-detail-container');

                if (detailContainer && aptArea && descArea) {
                    // 技能の箱以外をクリックしたら、適性表示にサッと戻します
                    detailContainer.addEventListener('click', (e) => {
                        if (!e.target.closest('.skill-box-clickable')) {
                            aptArea.style.display = 'flex'; 
                            descArea.style.display = 'none';
                        }
                    });
                }

                if (skillBoxes.length > 0 && aptArea && descArea && descText) {
                    skillBoxes.forEach(box => {
                        box.addEventListener('click', (e) => {
                            e.stopPropagation(); // 画面全体をクリックしたことにならないようにガードします
                            if (window.AudioManager) window.AudioManager.playSE('choice.ogg');
                            const skillName = box.dataset.skillName;
                            if (skillName) {
                                // 専門家（SkillManager）に技能の説明を聞きます
                                // ★修正：classはwindowに紐付かないので直接呼び出します
                                let desc = typeof SkillManager !== 'undefined' ? SkillManager.getSkillDescription(skillName) : "";
                                if (!desc) desc = "詳細不明。";
                                
                                // 説明文をセットして、瞬時に表示を切り替えます
                                descText.innerHTML = `
                                    <div class="busho-skill-desc-title">【${skillName}】</div>
                                    <div class="busho-skill-desc-body">${desc}</div>
                                `;
                                aptArea.style.display = 'none';
                                descArea.style.display = 'flex';
                            }
                        });
                    });
                }
            }
        }
    },
    
    showBushoDetailModalById(bushoId) {
        const busho = this.game.getBusho(bushoId);
        if (busho) this.showBushoDetailModal(busho);
    },
    
    // _saveBushoSelection()は不要になったので削除し、UI更新の中に一元化します

    _updateBushoSelectorUI() {
        const ctx = this._bushoSelectorContext;
        if (!ctx) return;

        // ★回帰対策：仮想スクロールでは画面外のinputがDOMから消えるため、
        // 選択状態の正本は commonSelectedIds にします。DOMは表示中の行だけ同期します。
        const selectedSet = new Set((this.commonSelectedIds || []).map(Number));
        this.commonSelectedIds = Array.from(selectedSet);
        const checkedCount = this.commonSelectedIds.length;

        document.querySelectorAll('input[name="sel_busho"]').forEach(input => {
            const id = Number(input.value);
            const selected = selectedSet.has(id);
            input.checked = selected;
            const row = input.closest('.select-item');
            if (row) row.classList.toggle('selected', selected);
        });

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
            const enabled = checkedCount > 0;
            confirmBtn.disabled = !enabled;
            confirmBtn.style.opacity = enabled ? 1.0 : 0.5;
        }
    },

    handleBushoSelect(e, isMulti, costGold, costRice, actionType) {
        const div = e.currentTarget;
        const input = e.target.tagName === 'INPUT' ? e.target : div.querySelector('input');
        if (!input) return;

        const id = Number(input.value);
        if (!Number.isFinite(id)) return;

        const c = this._bushoSelectorContext ? this._bushoSelectorContext.c : this.ui.currentCastle;
        const selectedSet = new Set((this.commonSelectedIds || []).map(Number));
        const wasSelected = selectedSet.has(id);
        const maxSelect = ['war_deploy', 'def_intercept_deploy', 'def_reinf_deploy', 'atk_reinf_deploy', 'def_self_reinf_deploy', 'atk_self_reinf_deploy', 'kunishu_subjugate_deploy'].includes(actionType) ? 5 : 999;

        if (isMulti) {
            if (wasSelected) {
                selectedSet.delete(id);
            } else {
                const nextCount = selectedSet.size + 1;
                if (nextCount > maxSelect) {
                    input.checked = false;
                    this.ui.showDialog(`出陣できる武将は最大${maxSelect}名までです。`, false);
                    return;
                }
                if (costGold > 0 && nextCount * costGold > c.gold) {
                    input.checked = false;
                    this.ui.showDialog(`金が足りないため、これ以上選べません。`, false);
                    return;
                }
                if (costRice > 0 && nextCount * costRice > c.rice) {
                    input.checked = false;
                    this.ui.showDialog(`兵糧が足りないため、これ以上選べません。`, false);
                    return;
                }
                selectedSet.add(id);
            }
        } else {
            // 従来どおり、同じ武将をもう一度押すと選択解除。別の武将なら1人だけ選択。
            selectedSet.clear();
            if (!wasSelected) selectedSet.add(id);
        }

        this.commonSelectedIds = Array.from(selectedSet);
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
        
        // 新しく武将一覧を開く入口では、前回閉じた時のタブ状態を引き継がず必ず「基本」から始めます。
        // 詳細画面から「戻る」場合は openBushoSelector() を通らず modalHistory から復元されるため、
        // 一覧内での一時的なタブ状態は従来どおり保持されます。
        this.bushoCurrentTab = 'stats';

        // ★修正：新しく武将一覧を開くときは、以前開いたリストの記憶（キャッシュ）を消してリセットします
        this.bushoCurrentSortKey = null;
        this.bushoIsSortAsc = false;
        this.bushoSavedBushos = null;
        this.bushoSavedSortedBushos = null;
        this.bushoLastSortStateKey = null;
        this.bushoLastScope = null;
        this.bushoSavedData = null;
        this._invalidateListItemsCache('busho'); // ★行HTMLのキャッシュも一緒に破棄します

        if (actionType === 'view_only' || actionType === 'all_busho_list') {
            this.pushModal('busho_selector', [actionType, targetId, extraData, onBack]);
        } else {
            this.closeCommonModal(); // アクションの時は新しく開くので履歴ごとリセットします
            this.pushModal('busho_selector', [actionType, targetId, extraData, onBack]);
        }
    },
    
    _renderBushoSelector(actionType, targetId, extraData, onBack, scrollPos = 0) {
        this.ui.hideAIGuardTemporarily(); 
        
        // ==========================================
        // ★高速化：ソートや表示のループに入る前に、早見表を一気に作ります！
        // ==========================================
        const clanMap = new Map();
        if (this.game.clans) this.game.clans.forEach(c => clanMap.set(c.id, c));
        
        const castleMap = new Map();
        if (this.game.castles) this.game.castles.forEach(c => castleMap.set(c.id, c));
        
        const bushoMap = new Map();
        if (this.game.bushos) this.game.bushos.forEach(b => bushoMap.set(b.id, b));

        // ★軽量化：ソート比較のたびに全軍団へ .some() しないよう、国主IDをSet化します。
        const commanderIds = new Set((this.game.legions || []).map(l => Number(l.commanderId)).filter(id => id > 0));
        // ==========================================
        
        const isViewMode = (actionType === 'view_only' || actionType === 'all_busho_list');
        
        // ★追加：行動を消費しないコマンドかどうかを判定します
        let isActionFree = false;
        if (extraData && extraData.allowDone) isActionFree = true; 
        if (['appoint','appoint_legion_leader','employ_target','appoint_gunshi','rumor_target_busho','headhunt_target','interview','interview_target','reward','war_general', 'kunishu_war_general', 'marriage_princess', 'marriage_kinsman', 'succession', 'succession_target', 'adopt_son_target', 'arrange_marriage_busho'].includes(actionType)) isActionFree = true;
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
             targetCastle = castleMap.get(targetId);
        }
        const gunshi = this.game.getClanGunshi(this.game.playerClanId);
        const myDaimyo = this.game.getClanDaimyo(this.game.playerClanId);
        
        // デフォルトではヘッダーのソート状態を指定せず、コマンドごとの最適な計算結果順（初期並び順）で表示します
        // （ユーザーがヘッダーをクリックした時のみ this.bushoCurrentSortKey が設定され、ソートが実行されます）

        const isPc = document.body.classList.contains('is-pc'); // ★PCかスマホか調べる魔法を追加します

        let scopeHtml = '';
        if (actionType === 'all_busho_list') {
            scopeHtml = `
                <div class="busho-scope-tabs">
                        <button class="busho-scope-btn ${this.bushoCurrentScope === 'clan' ? 'active' : ''}" data-scope="clan">${isPc ? '自家' : '自'}</button>
                        <button class="busho-scope-btn ${this.bushoCurrentScope === 'all' ? 'active' : ''}" data-scope="all">${isPc ? '全国' : '全'}</button>
                </div>
            `;
        }
        let tabsHtml = `
            <div class="busho-list-tabs">
                <button class="busho-tab-btn ${this.bushoCurrentTab === 'stats' ? 'active' : ''}" data-tab="stats">${isPc ? '基本' : '基'}</button>
                <button class="busho-tab-btn ${this.bushoCurrentTab === 'aptitude' ? 'active' : ''}" data-tab="aptitude">${isPc ? '適性' : '適'}</button>
                <button class="busho-tab-btn ${this.bushoCurrentTab === 'status' ? 'active' : ''}" data-tab="status">${isPc ? '状態' : '状'}</button>
            </div>
            ${scopeHtml}
        `;

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
            const isGunshi = b.isGunshi || (b.clan > 0 && clanMap.get(b.clan)?.gunshiId === b.id);
            const isCommander = commanderIds.has(Number(b.id));
            if (b.clan === this.game.playerClanId) return b.isDaimyo ? 10000 : (isCommander ? 9500 : (b.isCastellan ? 9000 : (isGunshi ? 8500 : 8000)));
            if (b.clan > 0) return 5000 - b.clan * 10 + (b.isDaimyo ? 4 : (isCommander ? 3.5 : (b.isCastellan ? 3 : (isGunshi ? 2 : 1))));
            if (b.belongKunishuId > 0) return 2000 - b.belongKunishuId * 10 + (b.id === (window.GameApp ? window.GameApp.kunishuSystem.getKunishu(b.belongKunishuId)?.leaderId : 0) ? 2 : 1);
            if (b.status === 'ronin') return 1000;
            return 0;
        };
        const getSortRankClan = (b) => {
            const isGunshi = b.isGunshi || (b.clan > 0 && clanMap.get(b.clan)?.gunshiId === b.id);
            const isCommander = commanderIds.has(Number(b.id));
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

        const selectedIdsStr = [...(this.commonSelectedIds || [])].sort((a, b) => a - b).join('_');
        const currentSortStateKey = `${this.bushoCurrentSortKey}_${this.bushoIsSortAsc}_${selectedIdsStr}`;

        if (this.bushoSavedSortedBushos && this.bushoLastSortStateKey === currentSortStateKey) {
            displayBushos = this.bushoSavedSortedBushos;
        } else {
            displayBushos = this._prepareStableSortBase('busho', this.bushoSavedBushos, this.bushoCurrentSortKey); // ★共通の魔法

            if (this.bushoCurrentSortKey) {
                displayBushos.sort((a, b) => {
                    const selA = (this.commonSelectedIds || []).includes(a.id) ? 1 : 0;
                    const selB = (this.commonSelectedIds || []).includes(b.id) ? 1 : 0;
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
                                const clan = clanMap.get(busho.clan);
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
                            const castle = castleMap.get(busho.castleId);
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
                                const clan = clanMap.get(busho.clan);
                                const daimyo = clan ? bushoMap.get(clan.leaderId) : null;
                                if (daimyo && (busho.id === daimyo.id || busho.isDaimyo)) return 1;
                                if (daimyo) {
                                    const bFam = Array.isArray(busho.familyIds) ? busho.familyIds : [];
                                    const dFam = Array.isArray(daimyo.familyIds) ? daimyo.familyIds : [];
                                    if (bFam.some(fId => dFam.includes(fId))) return 1;
                                }
                            }
                            return 0;
                        };
                        valA = checkFamily(a); valB = checkFamily(b);
                    } else if (this.bushoCurrentSortKey === 'salary') {
                        const daimyoA = a.clan > 0 ? bushoMap.get(clanMap.get(a.clan)?.leaderId) : null;
                        const daimyoB = b.clan > 0 ? bushoMap.get(clanMap.get(b.clan)?.leaderId) : null;
                        valA = a.clan > 0 && !a.isDaimyo && a.status !== 'ronin' ? a.getSalary(daimyoA) : 0;
                        valB = b.clan > 0 && !b.isDaimyo && b.status !== 'ronin' ? b.getSalary(daimyoB) : 0;
                    } else if (['aptAshigaru', 'aptKiba', 'aptTeppo', 'aptYumi', 'aptBugei', 'aptNinjutsu', 'aptMaritime'].includes(this.bushoCurrentSortKey)) {
                        valA = typeof SkillManager !== 'undefined' ? SkillManager.getAptitudeLevel(a[this.bushoCurrentSortKey]) : 0;
                        valB = typeof SkillManager !== 'undefined' ? SkillManager.getAptitudeLevel(b[this.bushoCurrentSortKey]) : 0;
                    } else {
                        const getAccForSort = (busho) => {
                            const c = castleMap.get(busho.castleId);
                            if (c && c.investigatedUntil >= this.game.getCurrentTurnId()) return c.investigatedAccuracy;
                            return acc;
                        };

                        let perceivedA = StatPresenter.getPerceivedStatValue(a, this.bushoCurrentSortKey, gunshi, getAccForSort(a), this.game.playerClanId, myDaimyo);
                        let perceivedB = StatPresenter.getPerceivedStatValue(b, this.bushoCurrentSortKey, gunshi, getAccForSort(b), this.game.playerClanId, myDaimyo);

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
                        const selA = (this.commonSelectedIds || []).includes(a.id) ? 1 : 0;
                        const selB = (this.commonSelectedIds || []).includes(b.id) ? 1 : 0;
                        if (selA !== selB) return selB - selA;

                        if (a.isFactionLeader && !b.isFactionLeader) return -1;
                        if (!a.isFactionLeader && b.isFactionLeader) return 1;
                        if (a.isDaimyo && !b.isDaimyo) return -1;
                        if (!a.isDaimyo && b.isDaimyo) return 1;
                        return getSortRankClan(b) - getSortRankClan(a);
                    });
                } else if (actionType === 'all_busho_list' && this.bushoCurrentScope === 'all') {
                    displayBushos.sort((a, b) => {
                        const selA = (this.commonSelectedIds || []).includes(a.id) ? 1 : 0;
                        const selB = (this.commonSelectedIds || []).includes(b.id) ? 1 : 0;
                        if (selA !== selB) return selB - selA;
                        
                        return getSortRankAll(b) - getSortRankAll(a);
                    });
                } else if (isViewMode) {
                    displayBushos.sort((a, b) => {
                        const selA = (this.commonSelectedIds || []).includes(a.id) ? 1 : 0;
                        const selB = (this.commonSelectedIds || []).includes(b.id) ? 1 : 0;
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
                `<span data-sort="name">名前${getSortMark('name')}</span>`,
                `<span data-sort="rank">身分${getSortMark('rank')}</span>`,
                `<span data-sort="leadership">統率${getSortMark('leadership')}</span>`,
                `<span data-sort="strength">武勇${getSortMark('strength')}</span>`,
                `<span data-sort="politics">内政${getSortMark('politics')}</span>`,
                `<span data-sort="diplomacy">外交${getSortMark('diplomacy')}</span>`,
                `<span data-sort="intelligence">智謀${getSortMark('intelligence')}</span>`,
                `<span data-sort="charm">魅力${getSortMark('charm')}</span>`
            ].filter(Boolean);
        } else if (this.bushoCurrentTab === 'aptitude') {
            if (hideActionCol) {
                gridSpStr = "2.4fr 1.23fr 1.23fr 1.23fr 1.23fr 1.23fr 1.23fr 1.23fr";
                gridPcStr = "100px 1fr 1fr 1fr 1fr 1fr 1fr 1fr";
            } else {
                gridSpStr = "25px 2.4fr 1.23fr 1.23fr 1.23fr 1.23fr 1.23fr 1.23fr 1.23fr";
                gridPcStr = "35px 100px 1fr 1fr 1fr 1fr 1fr 1fr 1fr";
            }
            headers = [
                !hideActionCol ? `<span class="col-act" data-sort="action">行動${getSortMark('action')}</span>` : null,
                `<span data-sort="name">名前${getSortMark('name')}</span>`,
                `<span data-sort="aptAshigaru">足軽${getSortMark('aptAshigaru')}</span>`,
                `<span data-sort="aptKiba">馬術${getSortMark('aptKiba')}</span>`,
                `<span data-sort="aptYumi">弓術${getSortMark('aptYumi')}</span>`,
                `<span data-sort="aptTeppo">砲術${getSortMark('aptTeppo')}</span>`,
                `<span data-sort="aptBugei">武芸${getSortMark('aptBugei')}</span>`,
                `<span data-sort="aptNinjutsu">忍術${getSortMark('aptNinjutsu')}</span>`,
                `<span data-sort="aptMaritime">操船${getSortMark('aptMaritime')}</span>`
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
                !hideActionCol ? `<span data-sort="action">行動${getSortMark('action')}</span>` : null,
                `<span data-sort="name">名前${getSortMark('name')}</span>`,
                // 横スクロールに戻す時のために残しておきます： `<span class="col-rank" data-sort="rank">身分${getSortMark('rank')}</span>`,
                `<span data-sort="faction">勢力${getSortMark('faction')}</span>`,
                `<span data-sort="castle">所在${getSortMark('castle')}</span>`,
                `<span data-sort="age">年齢${getSortMark('age')}</span>`,
                `<span data-sort="family">一門${getSortMark('family')}</span>`,
                `<span data-sort="salary">俸禄${getSortMark('salary')}</span>`,
                `<span data-sort="faction_leader">派閥${getSortMark('faction_leader')}</span>`
            ].filter(Boolean);
        }

        // ★高速化：タブ・範囲・並び順・選択状態が前回と同じなら、重い行生成をサボって使い回します
        const itemsCacheKey = `${actionType}|${targetId}|${this.bushoCurrentTab}|${this.bushoCurrentScope}|${hideActionCol}|${currentSortStateKey}`;

        // ★軽量化：表示対象だけを先に絞り込み、150件超では行HTMLを全件作りません。
        const renderBushos = displayBushos.filter(b => {
            if (actionType === 'banish' && b.isCastellan) return false;
            if (actionType === 'employ_target' && b.isDaimyo) return false;
            if (actionType === 'reward' && b.isDaimyo) return false;
            return true;
        });

        const buildBushoListItem = (b) => {
            
            let isSelectable = !b.isActionDone; 
            if (isActionFree) isSelectable = true; 
            
            const isSelected = (this.commonSelectedIds || []).includes(b.id);
            
            let currentAcc = null;
            const bCastle = castleMap.get(b.castleId);
            if (bCastle && bCastle.investigatedUntil >= this.game.getCurrentTurnId()) {
                currentAcc = bCastle.investigatedAccuracy;
            } else if (isEnemyTarget && targetCastle) {
                currentAcc = targetCastle.investigatedAccuracy;
            }
            const getStat = (stat) => StatPresenter.getDisplayStatHTML(b, stat, gunshi, currentAcc, this.game.playerClanId, myDaimyo);

            const inputType = isMulti ? 'checkbox' : 'radio';
            let inputHtml = !isViewMode ? `<input type="${inputType}" name="sel_busho" value="${b.id}" ${!isSelectable ? 'disabled' : ''} ${isSelected ? 'checked' : ''} class="selector-native-input">` : '';

            // ★変更：文字圧縮機能の最適化。姓名が分かれている場合はそれぞれ縮小します
            const getCompressedTextHtml = (text, threshold) => {
                if (!text) return "";
                if (text.length >= threshold) {
                    // 基準の文字数（3または5）以上の場合、1文字増えるごとに0.1ずつ縮小します
                    let scale = 1.0 - (text.length - (threshold - 1)) * 0.1;
                    if (scale < 0.55) scale = 0.55;
                    // ★修正：letter-spacingによって削られた右側の空間を「padding-right: 1px;」で補って食い込みを防ぎます
                    return `<span class="busho-compressed-text" style="--name-font-size:${scale}em; --name-scale-y:${1/scale};">${text}</span>`;
                }
                return text;
            };

            let compressedNameHtml = "";
            if (b.givenName) {
                // 姓名が分かれている場合はそれぞれ3文字以上で縮小
                compressedNameHtml = getCompressedTextHtml(b.familyName, 3) + getCompressedTextHtml(b.givenName, 3);
            } else {
                // 姓名が分かれていない場合は合計5文字以上で縮小
                compressedNameHtml = getCompressedTextHtml(b.name, 5);
            }

            // ★変更：一元化された数字を引っ張り、忠誠度の低さに応じて赤・オレンジに色分けします
            if (actionType === 'reward' && gunshi && !b.isDaimyo && !(b.belongKunishuId > 0)) {
                const adviceLoyalty = window.MainParams.Gunshi.AdviceLoyalty;
                const dangerLoyalty = window.MainParams.Gunshi.DangerLoyalty; // 万が一設定がない場合の保険
                
                if (b.loyalty <= dangerLoyalty) {
                    compressedNameHtml = `<span class="text-red">${compressedNameHtml}</span>`;
                } else if (b.loyalty <= adviceLoyalty) {
                    compressedNameHtml = `<span class="text-orange">${compressedNameHtml}</span>`;
                }
            }

            let cells = [];
            if (this.bushoCurrentTab === 'stats') {
                cells = [
                    !hideActionCol ? `<span class="col-act">${inputHtml}${b.isActionDone?'済':'未'}</span>` : null,
                    `<span class="col-name">${hideActionCol && !isViewMode ? inputHtml : ''}${compressedNameHtml}</span>`,
                    `<span class="col-rank">${b.getRankName()}</span>`,
                    `<span class="col-stat">${getStat('leadership')}</span>`,
                    `<span class="col-stat">${getStat('strength')}</span>`,
                    `<span class="col-stat">${getStat('politics')}</span>`,
                    `<span class="col-stat">${getStat('diplomacy')}</span>`,
                    `<span class="col-stat">${getStat('intelligence')}</span>`,
                    `<span class="col-stat">${getStat('charm')}</span>`
                ].filter(Boolean);
            } else if (this.bushoCurrentTab === 'aptitude') {
                const getAptGradeHtml = (val) => {
                    const lowVal = val ? val.toLowerCase() : 'e';
                    return `<div class="grade-container rank-${lowVal}"><span class="grade-main">${val}</span></div>`;
                };
                cells = [
                    !hideActionCol ? `<span class="col-act">${inputHtml}${b.isActionDone?'済':'未'}</span>` : null,
                    `<span class="col-name">${hideActionCol && !isViewMode ? inputHtml : ''}${compressedNameHtml}</span>`,
                    `<span class="col-stat">${getAptGradeHtml(b.aptAshigaru)}</span>`,
                    `<span class="col-stat">${getAptGradeHtml(b.aptKiba)}</span>`,
                    `<span class="col-stat">${getAptGradeHtml(b.aptYumi)}</span>`,
                    `<span class="col-stat">${getAptGradeHtml(b.aptTeppo)}</span>`,
                    `<span class="col-stat">${getAptGradeHtml(b.aptBugei)}</span>`,
                    `<span class="col-stat">${getAptGradeHtml(b.aptNinjutsu)}</span>`,
                    `<span class="col-stat">${getAptGradeHtml(b.aptMaritime)}</span>`
                ].filter(Boolean);
            } else {
                let forceName = "";
                let familyMark = "";
                if (b.belongKunishuId > 0) {
                    const kunishu = this.game.kunishuSystem.getKunishu(b.belongKunishuId);
                    forceName = kunishu ? kunishu.getName(this.game) : "諸勢力";
                } else if (b.clan > 0) {
                    const clan = clanMap.get(b.clan);
                    forceName = clan ? clan.name : "大名家";
                    const daimyo = clan ? bushoMap.get(clan.leaderId) : null;
                    if (daimyo && (b.id === daimyo.id || b.isDaimyo)) { familyMark = "◯"; }
                    else if (daimyo) {
                        const bFamily = Array.isArray(b.familyIds) ? b.familyIds : [];
                        const dFamily = Array.isArray(daimyo.familyIds) ? daimyo.familyIds : [];
                        if (bFamily.some(fId => dFamily.includes(fId))) familyMark = "◯";
                    }
                }
                const bCastleName = bCastle ? bCastle.name : "";
                const age = b.isAutoLeader ? "" : (this.game.year - b.birthYear + 1);
                let salary = "";
                if (b.clan > 0 && !b.isDaimyo && b.status !== 'ronin') {
                    const clan = clanMap.get(b.clan);
                    const daimyo = clan ? bushoMap.get(clan.leaderId) : null;
                    salary = b.getSalary(daimyo);
                    if (salary === 0) salary = "";
                }
                let factionNameStr = b.factionName || "";
                
                cells = [
                    !hideActionCol ? `<span class="col-act">${inputHtml}${b.isActionDone?'済':'未'}</span>` : null,
                    `<span class="col-name">${hideActionCol && !isViewMode ? inputHtml : ''}${compressedNameHtml}</span>`,
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

            return {
                onClick: onClickStr,
                cells: cells,
                itemClass: itemClassThis
            };

        };

        let items = null;
        let lazyItemCount = null;
        let lazyGetItem = null;

        if (renderBushos.length > 150) {
            // 見えている周辺だけ最大240行ぶんキャッシュ。全国4000人でも巨大なHTML文字列を抱えません。
            const lazyRowCache = new Map();
            lazyItemCount = renderBushos.length;
            lazyGetItem = (index) => {
                if (index < 0 || index >= renderBushos.length) return null;

                // 選択画面は commonSelectedIds に応じて行の checked/selected が変わるため、
                // 古い行オブジェクトを再利用しません。閲覧専用だけ最大240行キャッシュします。
                if (!isViewMode) return buildBushoListItem(renderBushos[index]);

                if (lazyRowCache.has(index)) return lazyRowCache.get(index);
                const item = buildBushoListItem(renderBushos[index]);
                if (lazyRowCache.size >= 240) lazyRowCache.clear();
                lazyRowCache.set(index, item);
                return item;
            };
        } else {
            items = this._getCachedListItems('busho', itemsCacheKey, () => renderBushos.map(buildBushoListItem));
        }

        let onConfirmHandler = null;
        if (!isViewMode) {
            onConfirmHandler = () => {
                // 仮想スクロールで画面外の行がDOMに無くても、全選択を確実に渡します。
                const selectedIds = [...new Set((this.commonSelectedIds || []).map(Number).filter(Number.isFinite))];
                if (selectedIds.length === 0) return;
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
        let isFitMode = this.bushoCurrentTab === 'stats' || this.bushoCurrentTab === 'status' || this.bushoCurrentTab === 'aptitude';
        let minW = isFitMode ? "100%" : (isViewMode ? "700px" : "750px");

        // CSSで見た目を微調整するための目印を追加します
        if (this.bushoCurrentTab === 'stats' || this.bushoCurrentTab === 'aptitude') {
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
            itemCount: lazyItemCount,
            getItem: lazyGetItem,
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
                this.bushoCurrentTab = tabKey;
                const listEl = document.getElementById('selector-list');
                const scroll = listEl ? listEl.scrollTop : 0;
                this._renderBushoSelector(actionType, targetId, extraData, onBack, scroll);
            },
            onScopeClick: (scopeKey) => {
                this.bushoCurrentScope = scopeKey;
                this._saveStableSortResult('busho', null); // ★追加：スコープ変更時にソートの記憶をリセット
                const listEl = document.getElementById('selector-list');
                const scroll = listEl ? listEl.scrollTop : 0;
                this._renderBushoSelector(actionType, targetId, extraData, onBack, scroll);
            },
            onSortClick: (sortKey) => {
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