class UIInfoManager {
    constructor(ui, game) {
        // 元のui.jsとgameの情報を覚えておきます
        this.ui = ui;
        this.game = game;
    }

    showDaimyoList() {
        let listHtml = '<div class="daimyo-list-container"><div class="daimyo-list-header"><span>勢力名</span><span>当主名</span><span>城数</span><span>威信</span><span>友好度</span><span>関係</span></div>';
        
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
        
        // 先に、全員の中で一番高い威信の数値を調べて覚えておきます
        const maxPower = clanDataList.length > 0 ? Math.max(...clanDataList.map(c => c.power)) : 1;

        // プレイヤーの勢力なら一番上に、それ以外は威信が高い順番になるように並べ替えます
        clanDataList.sort((a, b) => {
            if (a.id === this.game.playerClanId) return -1;
            if (b.id === this.game.playerClanId) return 1;
            return b.power - a.power;
        });

        clanDataList.forEach(d => {
            let friendScore = 50;
            let friendStatus = "-";
            let statusColor = "";
            let hasRelation = false;
            
            if (d.id !== this.game.playerClanId) {
                const relation = this.game.getRelation(this.game.playerClanId, d.id);
                if (relation) {
                    friendScore = relation.sentiment;
                    // ★変更：内部の status ではなく、見た目用の displayStatus を使います！
                    friendStatus = relation.displayStatus || relation.status; 
                    hasRelation = true;
                    if (friendStatus === '敵対') statusColor = 'color:#d32f2f;';
                    else if (friendStatus === '友好') statusColor = 'color:#388e3c;';
                    // ★変更：青色にする条件のリストに '婚姻' も仲間入りさせます！
                    else if (['同盟', '支配', '従属', '婚姻'].includes(friendStatus)) statusColor = 'color:#1976d2;';
                }
            }

            const powerPercent = Math.min(100, (d.power / maxPower) * 100);
            const powerBarHtml = `<div class="bar-bg bar-bg-power"><div class="bar-fill bar-fill-power" style="width:${powerPercent}%;"></div></div>`;

            let friendBarHtml = "-";
            if (d.id === this.game.playerClanId) {
                friendBarHtml = "-"; 
            } else {
                const friendPercent = Math.min(100, Math.max(0, friendScore));
                friendBarHtml = `<div class="bar-bg bar-bg-friend"><div class="bar-fill bar-fill-friend" style="width:${friendPercent}%;"></div></div>`;
            }

            listHtml += `<div class="daimyo-list-item" style="cursor:pointer;" onclick="if(window.AudioManager) window.AudioManager.playSE('choice.ogg'); window.GameApp.ui.showDaimyoDetail(${d.id})"><span class="col-daimyo-name" style="font-weight:bold;">${d.name}</span><span class="col-leader-name">${d.leaderName}</span><span>${d.castlesCount}</span><span>${powerBarHtml}</span><span>${friendBarHtml}</span><span style="${statusColor}">${friendStatus}</span></div>`;
        });
        listHtml += '</div>';
        
        this.ui.showResultModal(`<h3 style="margin-top:0; border-bottom: 2px solid #ddd; padding-bottom: 10px; flex-shrink:0;">勢力一覧</h3>${listHtml}`, () => {
            if (this.ui.resultBody) {
                this.ui.resultBody.style.overflowY = '';
                this.ui.resultBody.style.display = '';
                this.ui.resultBody.style.flexDirection = '';
            }
        });

        if (this.ui.resultBody) {
            this.ui.resultBody.style.overflowY = 'hidden';
            this.ui.resultBody.style.display = 'flex';
            this.ui.resultBody.style.flexDirection = 'column';
        }
    }

    showDaimyoDetail(clanId) {
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

        let highestRankName = "なし";
        if (leader && this.game.courtRankSystem) {
            highestRankName = this.game.courtRankSystem.getHighestRankName(leader);
        }
        
        if (!highestRankName || highestRankName === "なし") {
            highestRankName = "&nbsp;";
        }

        const castlesCount = this.game.castles.filter(c => c.ownerClan === clanId).length;
        const bushosCount = this.game.bushos.filter(b => b.clan === clanId && b.status === 'active').length;
        const princessCount = clan.princessIds ? clan.princessIds.length : 0;
        
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

        const modal = document.getElementById('daimyo-detail-modal');
        const body = document.getElementById('daimyo-detail-body');
        const backBtn = document.getElementById('daimyo-detail-back-btn');
        const diploBtn = document.getElementById('daimyo-detail-diplo-btn');

        if (!modal || !body) return;

        body.innerHTML = `
            <div class="daimyo-detail-container">
                <div class="daimyo-detail-header">
                    <div class="daimyo-detail-name">${clan.name}</div>
                    <div class="daimyo-detail-ideology ${ideologyClass}">${ideology}</div>
                </div>
                <div class="daimyo-detail-body">
                    <div class="daimyo-detail-left">
                        <img src="${faceSrc}" class="daimyo-detail-face" onerror="this.src='data/images/faceicons/unknown_face.webp'">
                        <div class="daimyo-detail-leader-name">${leaderName}</div>
                        <div class="daimyo-detail-leader-rank">${highestRankName}</div>
                    </div>
                    <div class="daimyo-detail-info">
                        <div class="daimyo-detail-stat-box">
                            <span class="daimyo-detail-label">本拠地</span><span class="daimyo-detail-value">${baseCastleName}</span>
                        </div>
                        <div class="daimyo-detail-stat-box">
                            <span class="daimyo-detail-label">城数</span><span class="daimyo-detail-value">${castlesCount}</span>
                        </div>
                        <div class="daimyo-detail-stat-box">
                            <span class="daimyo-detail-label">武将数</span><span class="daimyo-detail-value">${bushosCount}</span>
                        </div>
                        <div class="daimyo-detail-stat-box">
                            <span class="daimyo-detail-label">姫数</span><span class="daimyo-detail-value">${princessCount}</span>
                        </div>
                    </div>
                </div>
            </div>
        `;

        backBtn.onclick = (e) => {
            e.stopPropagation();
            modal.classList.add('hidden');
        };

        diploBtn.onclick = (e) => {
            e.stopPropagation(); 
            if (window.AudioManager) window.AudioManager.playSE('decision.ogg');
            this.showDiplomacyList(clan.id, clan.name);
        };

        modal.onclick = (e) => {
            e.stopPropagation(); 
            if (e.target === modal) {
                if (window.AudioManager) window.AudioManager.playSE('cancel.ogg');
                modal.classList.add('hidden');
            }
        };

        modal.classList.remove('hidden');
    }

    showDiplomacyList(clanId, clanName) {
        let listHtml = '<div class="daimyo-list-container"><div class="daimyo-list-header" style="grid-template-columns: 2fr 1.5fr 1fr 3fr;"><span>勢力名</span><span>友好度</span><span>関係</span><span></span></div>';
        
        const activeClans = this.game.clans.filter(c => c.id !== 0 && c.id !== clanId && this.game.castles.some(cs => cs.ownerClan === c.id));
        
        const relations = activeClans.map(c => {
            const rel = this.game.getRelation(clanId, c.id);
            return {
                id: c.id,
                name: c.name,
                sentiment: rel ? rel.sentiment : 50,
                // ★変更：ここでも見た目用の displayStatus を使います！
                status: rel ? (rel.displayStatus || rel.status) : "普通"
            };
        });

        relations.sort((a,b) => b.sentiment - a.sentiment);

        relations.forEach(r => {
            let statusColor = "";
            if (r.status === '敵対') statusColor = 'color:#d32f2f;';
            else if (r.status === '友好') statusColor = 'color:#388e3c;';
            // ★変更：こちらでも青色にする条件に '婚姻' を仲間入りさせます！
            else if (['同盟', '支配', '従属', '婚姻'].includes(r.status)) statusColor = 'color:#1976d2;';

            const friendPercent = Math.min(100, Math.max(0, r.sentiment));
            const friendBarHtml = `<div class="bar-bg bar-bg-friend"><div class="bar-fill bar-fill-friend" style="width:${friendPercent}%;"></div></div>`;

            listHtml += `<div class="daimyo-list-item" style="grid-template-columns: 2fr 1.5fr 1fr 3fr;"><span class="col-daimyo-name" style="font-weight:bold;">${r.name}</span><span>${friendBarHtml}</span><span style="${statusColor}">${r.status}</span><span></span></div>`;
        });
        listHtml += '</div>';
        
        const diploModal = document.getElementById('diplo-list-modal');
        const diploTitle = document.getElementById('diplo-list-title');
        const diploBody = document.getElementById('diplo-list-body');
        
        if (!diploModal || !diploTitle || !diploBody) return;
        
        diploTitle.textContent = `${clanName} 外交関係`;
        diploBody.innerHTML = listHtml;
        
        diploModal.classList.remove('hidden');
    }

    showFactionList(clanId, isDirect = false) {
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
        
        let listHtml = `<div class="faction-list-container"><div class="faction-list-header"><span>派閥主</span><span>武将数</span><span>方針</span><span>思想</span><span></span></div>`;
        
        if (fIds.length === 0) {
            listHtml += `<div style="padding:10px;">派閥はありません。</div>`;
        } else {
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
                
                let seikakuColor = "";
                if (seikaku === '武闘派') seikakuColor = 'color:#d32f2f;';
                else if (seikaku === '穏健派') seikakuColor = 'color:#1976d2;';

                let hoshinColor = "";
                if (hoshin === '革新的') hoshinColor = 'color:#e91e63;';
                else if (hoshin === '保守的') hoshinColor = 'color:#1976d2;';

                let nameStyle = "";
                if (fId === daimyoFactionId) {
                    nameStyle = "color: darkorange;";
                }

                listHtml += `<div class="faction-list-item"><strong class="col-faction-name" style="${nameStyle}">${leaderName}</strong><span>${count}</span><span style="${seikakuColor}">${seikaku}</span><span style="${hoshinColor}">${hoshin}</span><span></span></div>`;
            });
        }
        
        if (nonFactionCount > 0) {
            listHtml += `<div class="faction-list-item"><strong class="col-faction-name">無派閥</strong><span>${nonFactionCount}</span><span>-</span><span>-</span><span></span></div>`;
        }
        
        listHtml += `</div>`;

        let customFooter = "";
        if (isDirect) {
            customFooter = `<button class="btn-secondary" onclick="window.GameApp.ui.closeResultModal()">閉じる</button>`;
        } else {
            customFooter = `<button class="btn-secondary" onclick="window.GameApp.ui.showDaimyoList()">閉じる</button>`;
        }
        
        this.ui.showResultModal(`<h3 style="margin-top:0; border-bottom: 2px solid #ddd; padding-bottom: 10px; flex-shrink:0;">${clan.name} 派閥一覧</h3>${listHtml}`, () => {
            if (this.ui.resultBody) {
                this.ui.resultBody.style.overflowY = '';
                this.ui.resultBody.style.display = '';
                this.ui.resultBody.style.flexDirection = '';
            }
        }, customFooter);

        if (this.ui.resultBody) {
            this.ui.resultBody.style.overflowY = 'hidden';
            this.ui.resultBody.style.display = 'flex';
            this.ui.resultBody.style.flexDirection = 'column';
        }
    }

    showBushoDetailModal(busho) {
        if (!this.ui.bushoDetailModal || !this.ui.bushoDetailBody) return;

        let faceHtml = "";
        if (busho.faceIcon) {
            faceHtml = `<img src="data/images/faceicons/${busho.faceIcon}" style="width: 100px; height: 100px; object-fit: cover; border: 2px solid #333; border-radius: 4px; background: #eee;" onerror="this.src='data/images/faceicons/unknown_face.webp'">`;
        }

        let affiliationName = "なし";
        let isFamily = false; 
        
        if (busho.belongKunishuId > 0) {
            let kunishu = null;
            if (this.game.kunishuSystem && typeof this.game.kunishuSystem.getKunishu === 'function') {
                kunishu = this.game.kunishuSystem.getKunishu(busho.belongKunishuId);
            } else if (this.game.kunishus) {
                kunishu = this.game.kunishus.find(k => k.id === busho.belongKunishuId);
            }
            
            if (kunishu) {
                affiliationName = kunishu.getName(this.game);
                
                const leader = this.game.getBusho(kunishu.leaderId);
                if (leader && busho.id !== leader.id) {
                    const bFamily = Array.isArray(busho.familyIds) ? busho.familyIds : [];
                    const lFamily = Array.isArray(leader.familyIds) ? leader.familyIds : [];
                    const hasDirect = bFamily.includes(leader.id) || lFamily.includes(busho.id);
                    if (hasDirect) {
                        isFamily = true;
                    }
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
                    const hasDirect = bFamily.includes(daimyo.id) || dFamily.includes(busho.id);
                    if (hasDirect) {
                        isFamily = true;
                    }
                }
            }
        }

        let familyBadge = "";
        if (isFamily) {
            familyBadge = `<span style="font-size: 0.8rem; background: #8b0000; color: #ffffff; padding: 2px 6px; border-radius: 4px; margin-left: 10px; box-shadow: 1px 1px 2px rgba(0,0,0,0.3);">一門</span>`;
        }

        const castle = this.game.getCastle(busho.castleId);
        const castleName = castle ? castle.name : "不明";

        const age = this.game.year - busho.birthYear;

        let rankName = "";
        try {
            if (busho.courtRankIds && this.game.courtRankSystem) {
                let ids = busho.courtRankIds;
                
                if (typeof ids === 'string') {
                    ids = ids.split(',').map(id => Number(id));
                }

                if (Array.isArray(ids)) {
                    let highestRank = null;
                    ids.forEach(id => {
                        let rank = null;
                        if (typeof this.game.courtRankSystem.getRank === 'function') {
                            rank = this.game.courtRankSystem.getRank(id);
                        } else if (this.game.courtRankSystem.ranks) {
                            if (Array.isArray(this.game.courtRankSystem.ranks)) {
                                rank = this.game.courtRankSystem.ranks.find(r => r.id === id);
                            } else {
                                rank = this.game.courtRankSystem.ranks[id];
                            }
                        }

                        if (rank) {
                            if (!highestRank || rank.rankNo < highestRank.rankNo) {
                                highestRank = rank;
                            }
                        }
                    });
                    
                    if (highestRank) {
                        let displayName = highestRank.rankName2 || highestRank.rankName1 || "";
                        if (displayName) {
                            rankName = `<span style="font-size: 0.9rem; background: #d4af37; color: #fff; padding: 2px 6px; border-radius: 4px; margin-left: 10px;">${displayName}</span>`;
                        }
                    }
                }
            }
        } catch (error) {
            rankName = "";
        }

        const gunshi = this.game.getClanGunshi(this.game.playerClanId);
        const myDaimyo = this.game.bushos.find(b => b.clan === this.game.playerClanId && b.isDaimyo);
        
        let acc = null;
        if (busho.clan !== this.game.playerClanId && busho.clan !== 0) {
            if (castle) acc = castle.investigatedAccuracy;
        }

        const getStat = (stat) => GameSystem.getDisplayStatHTML(busho, stat, gunshi, acc, this.game.playerClanId, myDaimyo);

        this.ui.bushoDetailBody.innerHTML = `
            <div style="display: flex; gap: 20px; align-items: flex-start; margin-bottom: 20px;">
                <div style="flex-shrink: 0;">${faceHtml}</div>
                <div style="flex: 1;">
                    <div style="display: flex; align-items: center; font-size: 1.3rem; font-weight: bold; margin-bottom: 10px; border-bottom: 2px solid #ccc; padding-bottom: 5px;">
                        <span>${busho.name}</span>${rankName}
                    </div>
                    
                    <div style="display: grid; grid-template-columns: 80px 1fr; gap: 5px; font-size: 0.95rem;">
                        <div style="color: #666; display: flex; align-items: center;">所属</div>
                        <div style="font-weight: bold; display: flex; align-items: center;">${affiliationName}${familyBadge}</div>
                        
                        <div style="color: #666; display: flex; align-items: center;">所在城</div>
                        <div style="font-weight: bold; display: flex; align-items: center;">${castleName}</div>
                        
                        <div style="color: #666; display: flex; align-items: center;">身分</div>
                        <div style="font-weight: bold; display: flex; align-items: center;">${busho.getRankName()}</div>
                        
                        <div style="color: #666; display: flex; align-items: center;">年齢</div>
                        <div style="font-weight: bold; display: flex; align-items: center;">${age}歳</div>
                    </div>
                </div>
            </div>
            <div style="background: #f9f9f9; padding: 15px; border-radius: 8px; border: 1px solid #ddd;">
                <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; text-align: center;">
                    <div><div style="font-size: 0.8rem; color: #666;">統率</div><div style="font-size: 1.2rem; font-weight: bold;">${getStat('leadership')}</div></div>
                    <div><div style="font-size: 0.8rem; color: #666;">武勇</div><div style="font-size: 1.2rem; font-weight: bold;">${getStat('strength')}</div></div>
                    <div><div style="font-size: 0.8rem; color: #666;">政務</div><div style="font-size: 1.2rem; font-weight: bold;">${getStat('politics')}</div></div>
                    <div><div style="font-size: 0.8rem; color: #666;">外交</div><div style="font-size: 1.2rem; font-weight: bold;">${getStat('diplomacy')}</div></div>
                    <div><div style="font-size: 0.8rem; color: #666;">智謀</div><div style="font-size: 1.2rem; font-weight: bold;">${getStat('intelligence')}</div></div>
                    <div><div style="font-size: 0.8rem; color: #666;">魅力</div><div style="font-size: 1.2rem; font-weight: bold;">${getStat('charm')}</div></div>
                </div>
            </div>
        `;

        this.ui.bushoDetailModal.classList.remove('hidden');
    }
    
    showPrisonerModal(captives) {
        if (!this.ui.prisonerModal) return;
        this.ui.prisonerModal.classList.remove('hidden');
        if (this.ui.prisonerList) {
            this.ui.prisonerList.innerHTML = '';
            
            const gunshi = this.game.getClanGunshi(this.game.playerClanId);
            const myDaimyo = this.game.bushos.find(b => b.clan === this.game.playerClanId && b.isDaimyo);

            captives.forEach((p, index) => {
                const div = document.createElement('div');
                div.className = 'select-item';
                div.style.display = 'flex';
                div.style.justifyContent = 'space-between';
                div.style.alignItems = 'center';
                
                let hireBtnHtml = '';
                if (p.hasRefusedHire) {
                    hireBtnHtml = `<button class="btn-primary" disabled style="opacity:0.5; background-color: #666;">拒否</button>`;
                } else {
                    hireBtnHtml = `<button class="btn-primary" onclick="window.GameApp.warManager.handlePrisonerAction(${index}, 'hire')">登用</button>`;
                }
                
                const getStat = (stat) => GameSystem.getDisplayStatHTML(p, stat, gunshi, null, this.game.playerClanId, myDaimyo);

                div.innerHTML = `
                    <div style="flex:1;">
                        <strong>${p.name}</strong> (${p.getRankName()})<br>
                        <div style="display:flex; gap:5px; align-items:center; margin-top:2px;">
                            統:${getStat('leadership')} 武:${getStat('strength')} 智:${getStat('intelligence')}
                        </div>
                    </div>
                    <div style="display:flex; gap:5px;">
                        ${hireBtnHtml}
                        <button class="btn-secondary" onclick="window.GameApp.warManager.handlePrisonerAction(${index}, 'release')">解放</button>
                        <button class="btn-danger" onclick="window.GameApp.warManager.handlePrisonerAction(${index}, 'kill')">処断</button>
                    </div>
                `;
                this.ui.prisonerList.appendChild(div);
            });
        }
    }

    closePrisonerModal() {
        if(this.ui.prisonerModal) this.ui.prisonerModal.classList.add('hidden');
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
    // ★ここから追加：姫一覧＆姫選択の魔法です！
    // ==========================================

    // 「情報」から見る時用
    showPrincessList() {
        this.renderPrincessModal(false, null, null);
    }

    // 「婚姻」で選ぶ時用
    showPrincessSelector(targetCastleId, doerId) {
        this.renderPrincessModal(true, targetCastleId, doerId);
    }

    // 姫の画面を描くお仕事をする場所です
    renderPrincessModal(isSelectMode, targetCastleId, doerId) {
        const myClanId = this.game.playerClanId;
        const myClan = this.game.clans.find(c => c.id === myClanId);
        
        let princesses = [];
        if (myClan && myClan.princessIds) {
            princesses = myClan.princessIds
                .map(id => this.game.princesses.find(p => p.id === id))
                .filter(p => p !== undefined); // データがない姫は弾きます
        }

        // 選ぶ時は「未婚」の姫だけに絞ります
        if (isSelectMode) {
            princesses = princesses.filter(p => p.status === 'unmarried');
        }

        // 見出しを作ります（新しく作った princess-list 用の枠組みを使います！）
        let listHtml = '<div class="princess-list-container"><div class="princess-list-header"><span>名前</span><span>年齢</span><span>父親</span><span>配偶者</span><span></span></div>';

        // 姫を一人ずつリストに並べていきます
        princesses.forEach(p => {
            const age = this.game.year - p.birthYear;
            const father = this.game.getBusho(p.fatherId);
            const fatherName = father ? father.name : "不明";
            const husband = this.game.getBusho(p.husbandId);
            const husbandName = husband ? husband.name : "なし";

            let onClickStr = "";
            let cursorStr = "";

            // 選ぶ時だけ、押した時の魔法（onClick）と指マーク（cursor）をつけます
            if (isSelectMode) {
                cursorStr = "style='cursor:pointer;'";
                // ★変更：クリックしたら「選択状態（オレンジ色）」にするだけの魔法に変えます！
                onClickStr = `onclick="window.GameApp.ui.info.selectPrincess(${p.id}, this)"`;
            }

            // 1人分の行を作ります（他のリストと同じように、空白や改行をなくして1行にまとめます！）
            listHtml += `<div class="princess-list-item" ${cursorStr} ${onClickStr}><strong class="col-princess-name">${p.name}</strong><span>${age}歳</span><span>${fatherName}</span><span>${husbandName}</span><span></span></div>`;
        });
        
        // もし一人もいなかったら
        if (princesses.length === 0) {
            listHtml += `<div style="padding: 15px; text-align: center;">姫はいません。</div>`;
        }

        listHtml += '</div>';

        const title = isSelectMode ? "嫁がせる姫を選択してください" : "姫一覧";
        let customFooter = "";
        
       // 戻るボタンや決定ボタンの動きを作ります
        if (!isSelectMode) {
            // 見るだけの時は普通に閉じるだけ
            customFooter = `<button class="btn-secondary" onclick="window.GameApp.ui.closeResultModal()">閉じる</button>`;
        } else {
            // ★変更：「決定」→「戻る」の順番に戻して、右下にピシッと寄せます！
            this.selectedPrincessId = null;
            customFooter = `
                <div style="display: flex; gap: 10px; justify-content: flex-end; width: 100%;">
                    <button id="princess-confirm-btn" class="btn-primary" disabled style="opacity: 0.5; cursor: not-allowed;" onclick="window.GameApp.ui.info.confirmPrincessSelection(${targetCastleId}, ${doerId})">決定</button>
                    <button class="btn-secondary" onclick="window.GameApp.ui.openBushoSelector('diplomacy_doer', ${targetCastleId}, { subAction: 'marriage' }); window.GameApp.ui.closeResultModal();">戻る</button>
                </div>
            `;
        }

        // 出来上がった画面を、いつもの小窓（モーダル）に表示してもらいます
        this.ui.showResultModal(`<h3 style="margin-top:0; border-bottom: 2px solid #ddd; padding-bottom: 10px; flex-shrink:0;">${title}</h3>${listHtml}`, () => {
            if (this.ui.resultBody) {
                this.ui.resultBody.style.overflowY = '';
                this.ui.resultBody.style.display = '';
                this.ui.resultBody.style.flexDirection = '';
            }
        }, customFooter);

        // スクロールできるように整えます
        if (this.ui.resultBody) {
            this.ui.resultBody.style.overflowY = 'hidden';
            this.ui.resultBody.style.display = 'flex';
            this.ui.resultBody.style.flexDirection = 'column';
        }
    }

    // ==========================================
    // ★ここから追加：選んで決定する魔法！
    // ==========================================
    
    // 姫をクリックした時の処理（オレンジ色にして、誰を選んだか覚えておく）
    selectPrincess(princessId, element) {
        // 武将選択と同じ音を鳴らします
        if (window.AudioManager) window.AudioManager.playSE('choice.ogg');
        
        // まず、全ての姫の行の色を元に戻します（お掃除）
        const items = document.querySelectorAll('.princess-list-item');
        items.forEach(item => {
            item.style.backgroundColor = '';
            item.style.borderLeft = '';
        });

        // クリックされた行だけ、武将選択と同じオレンジ色にして目立たせます！
        element.style.backgroundColor = '#ffe0b2';
        element.style.borderLeft = '5px solid #ff9800';

        // 誰を選んだか覚えておきます
        this.selectedPrincessId = princessId;

        // ★追加：決定ボタンの封印を解いて、明るく（押せるように）します！
        const confirmBtn = document.getElementById('princess-confirm-btn');
        if (confirmBtn) {
            confirmBtn.disabled = false;
            confirmBtn.style.opacity = '1';
            confirmBtn.style.cursor = 'pointer';
        }
    }

    // 「決定」ボタンを押した時の処理
    confirmPrincessSelection(targetCastleId, doerId) {
        // 誰も選んでいない時は何もしません
        if (!this.selectedPrincessId) {
            return;
        }

        // 決定の音を鳴らして、ゲーム本体に「この姫を選んだよ！」と伝えて画面を閉じます
        if (window.AudioManager) window.AudioManager.playSE('choice.ogg');
        window.GameApp.commandSystem.handleBushoSelection('marriage_princess', [this.selectedPrincessId], targetCastleId, { doerId: doerId });
        
        // 記憶をリセットしておきます
        this.selectedPrincessId = null; 
        window.GameApp.ui.closeResultModal();
    }

    // ==========================================
    // ★姫一覧＆姫選択の魔法ここまで！
    // ==========================================

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
        let totalGold = 0;
        let totalRice = 0;
        
        clanCastles.forEach(c => {
            totalPopulation += (c.population || 0);
            totalKokudaka += (c.kokudaka || 0);
            totalGold += (c.gold || 0);
            totalRice += (c.rice || 0);
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
                    <div class="stat-box"><span>兵士</span><span class="stat-val">${soldiers}</span></div>
                    <div class="stat-box"><span>石高</span><span class="stat-val">${totalKokudaka}</span></div>
                    <div class="stat-box"><span>金</span><span class="stat-val">${totalGold}</span></div>
                    <div class="stat-box"><span>兵糧</span><span class="stat-val">${totalRice}</span></div>
                    <div class="stat-box"><span>武将</span><span class="stat-val">${bushosCount}</span></div>
                    <div class="stat-box"><span>姫</span><span class="stat-val">${princessCount}</span></div>
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
}