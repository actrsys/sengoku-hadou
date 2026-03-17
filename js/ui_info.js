class UIInfoManager {
    constructor(ui, game) {
        // 元のui.jsとgameの情報を覚えておきます
        this.ui = ui;
        this.game = game;
    }

    showDaimyoList() {
        let listHtml = '<div class="daimyo-list-container"><div class="daimyo-list-header"><span>大名家名</span><span>当主名</span><span>城数</span><span>威信</span><span>友好度</span><span>関係</span></div>';
        
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
        
        clanDataList.sort((a,b) => b.power - a.power);
        const maxPower = clanDataList.length > 0 ? clanDataList[0].power : 1;

        clanDataList.forEach(d => {
            let friendScore = 50;
            let friendStatus = "-";
            let statusColor = "";
            let hasRelation = false;
            
            if (d.id !== this.game.playerClanId) {
                const relation = this.game.getRelation(this.game.playerClanId, d.id);
                if (relation) {
                    friendScore = relation.sentiment;
                    friendStatus = relation.status;
                    hasRelation = true;
                    if (friendStatus === '敵対') statusColor = 'color:#d32f2f;';
                    else if (friendStatus === '友好') statusColor = 'color:#388e3c;';
                    else if (['同盟', '支配', '従属'].includes(friendStatus)) statusColor = 'color:#1976d2;';
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
        
        this.ui.showResultModal(`<h3 style="margin-top:0; border-bottom: 2px solid #ddd; padding-bottom: 10px; flex-shrink:0;">大名一覧</h3>${listHtml}`, () => {
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
            if (this.ui.resultBody) {
                this.ui.savedDaimyoScroll = this.ui.resultBody.scrollTop;
            }
            modal.classList.add('hidden');
            this.ui.showDiplomacyList(clan.id, clan.name);
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
        let listHtml = '<div class="daimyo-list-container"><div class="daimyo-list-header" style="grid-template-columns: 2fr 1.5fr 1fr;"><span>大名家名</span><span>友好度</span><span>関係</span></div>';
        
        const activeClans = this.game.clans.filter(c => c.id !== 0 && c.id !== clanId && this.game.castles.some(cs => cs.ownerClan === c.id));
        
        const relations = activeClans.map(c => {
            const rel = this.game.getRelation(clanId, c.id);
            return {
                id: c.id,
                name: c.name,
                sentiment: rel ? rel.sentiment : 50,
                status: rel ? rel.status : "普通"
            };
        });

        relations.sort((a,b) => b.sentiment - a.sentiment);

        relations.forEach(r => {
            let statusColor = "";
            if (r.status === '敵対') statusColor = 'color:#d32f2f;';
            else if (r.status === '友好') statusColor = 'color:#388e3c;';
            else if (['同盟', '支配', '従属'].includes(r.status)) statusColor = 'color:#1976d2;';

            const friendPercent = Math.min(100, Math.max(0, r.sentiment));
            const friendBarHtml = `<div class="bar-bg bar-bg-friend"><div class="bar-fill bar-fill-friend" style="width:${friendPercent}%;"></div></div>`;

            listHtml += `<div class="daimyo-list-item" style="grid-template-columns: 2fr 1.5fr 1fr;"><span class="col-daimyo-name" style="font-weight:bold;">${r.name}</span><span>${friendBarHtml}</span><span style="${statusColor}">${r.status}</span></div>`;
        });
        listHtml += '</div>';
        
        const customFooter = `<button class="btn-secondary" onclick="window.GameApp.ui.showDaimyoList(); setTimeout(() => { if(window.GameApp.ui.resultBody) window.GameApp.ui.resultBody.scrollTop = window.GameApp.ui.savedDaimyoScroll || 0; window.GameApp.ui.showDaimyoDetail(${clanId}); }, 10);">戻る</button>`;
        
        this.ui.showResultModal(`<h3 style="margin-top:0; border-bottom: 2px solid #ddd; padding-bottom: 10px; flex-shrink:0;">${clanName} 外交関係</h3>${listHtml}`, () => {
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
        
        let listHtml = `<div class="faction-list-container"><div class="faction-list-header"><span>派閥主</span><span>武将数</span><span>方針</span><span>思想</span></div>`;
        
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

                listHtml += `<div class="faction-list-item"><strong class="col-faction-name" style="${nameStyle}">${leaderName}</strong><span>${count}</span><span style="${seikakuColor}">${seikaku}</span><span style="${hoshinColor}">${hoshin}</span></div>`;
            });
        }
        
        if (nonFactionCount > 0) {
            listHtml += `<div class="faction-list-item"><strong class="col-faction-name">無派閥</strong><span>${nonFactionCount}</span><span>-</span><span>-</span></div>`;
        }
        
        listHtml += `</div>`;

        let customFooter = "";
        if (isDirect) {
            customFooter = `<button class="btn-primary" onclick="window.GameApp.ui.closeResultModal()">閉じる</button>`;
        } else {
            customFooter = `<button class="btn-secondary" onclick="window.GameApp.ui.showDaimyoList()">戻る</button>`;
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
}