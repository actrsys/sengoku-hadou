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

        const age = busho.isAutoLeader ? "-" : (this.game.year - busho.birthYear);
        const ageStr = busho.isAutoLeader ? age : `${age}歳`;

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
                        <div style="font-weight: bold; display: flex; align-items: center;">${ageStr}</div>
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

    openBushoSelector(actionType, targetId = null, extraData = null, onBack = null) {
        if (actionType === 'appoint' && this.ui.currentCastle) { const isDaimyoHere = this.game.getCastleBushos(this.ui.currentCastle.id).some(b => b.isDaimyo); if (isDaimyoHere) { this.ui.showDialog("大名の居城は城主を変更できません", false); return; } }
        
        this.ui.hideAIGuardTemporarily(); 
        if (this.ui.selectorModal) this.ui.selectorModal.classList.remove('hidden'); 
        if (document.getElementById('selector-title')) document.getElementById('selector-title').textContent = "武将を選択"; 
        
        const isViewMode = (actionType === 'view_only' || actionType === 'all_busho_list');

        const backBtn = document.querySelector('#selector-modal .btn-secondary');
        if(backBtn) {
            const footer = backBtn.parentElement; // ★追加：ボタンが入っているフッターの箱を取得します
            if (extraData && extraData.hideCancel) {
                backBtn.style.display = 'none';
            } else {
                backBtn.style.display = ''; 
                
                if (isViewMode) {
                    backBtn.textContent = '閉じる';
                } else {
                    backBtn.textContent = '戻る';
                }
                if (footer) footer.style.justifyContent = 'center';

                backBtn.onclick = () => {
                    this.ui.closeSelector();
                    if (onBack) {
                        onBack(); 
                    } else if (extraData && extraData.onCancel) {
                        extraData.onCancel(); 
                    }
                };
            }
        }

        const c = this.ui.currentCastle; 
        
        // ★さっき作った新しい魔法で、武将のリストとメッセージをまとめて受け取ります！
        const data = this.game.commandSystem.getBushoSelectorData(actionType, targetId, extraData, c);
        let bushos = data.bushos;
        let infoHtml = data.infoHtml;
        let isMulti = data.isMulti;
        let spec = data.spec;

        const contextEl = document.getElementById('selector-context-info');
        if(contextEl) {
            contextEl.classList.remove('hidden');
            contextEl.innerHTML = infoHtml;
        }

        // 画面のタイトルを変えます
        if (document.getElementById('selector-title')) {
            if (actionType === 'view_only' || actionType === 'all_busho_list') {
                document.getElementById('selector-title').textContent = "武将一覧";
            } else {
                document.getElementById('selector-title').textContent = isMulti ? "武将を選択（複数可）" : "武将を選択"; 
            }
        }

        // 相手の城を調べるかどうかの準備（表示の時に使います）
        let isEnemyTarget = false;
        let targetCastle = null;
        if (['rumor_target_busho','headhunt_target','view_only'].includes(actionType)) {
             isEnemyTarget = true;
             targetCastle = this.game.getCastle(targetId);
        }
        const gunshi = this.game.getClanGunshi(this.game.playerClanId);
        const myDaimyo = this.game.bushos.find(b => b.clan === this.game.playerClanId && b.isDaimyo);
        const updateContextCost = () => { 
            if (!isMulti || !contextEl) return; 
            const checkedCount = document.querySelectorAll('input[name="sel_busho"]:checked').length; 
            let cost = 0, item = ""; 
            if (spec.costGold > 0) { cost = checkedCount * spec.costGold; item = "金"; }
            if (spec.costRice > 0) { cost = checkedCount * spec.costRice; item = "米"; }
            
            if (cost > 0) {
                 contextEl.innerHTML = `<div>消費予定 ${item}: ${cost} (所持: ${item==='金'?c.gold:c.rice})</div>`; 
            } else if (actionType === 'war_deploy' || actionType === 'def_intercept_deploy' || actionType === 'def_reinf_deploy' || actionType === 'atk_reinf_deploy' || actionType === 'def_self_reinf_deploy' || actionType === 'atk_self_reinf_deploy' || actionType === 'kunishu_subjugate_deploy') {
                 contextEl.innerHTML = `<div>出陣武将: ${checkedCount}名 / 最大5名</div>`;
            }
        };

        const updateBushoConfirmBtn = () => {
            if (!this.ui.selectorConfirmBtn) return;
            if (actionType === 'view_only' || actionType === 'all_busho_list') return; 

            const checkedCount = this.ui.selectorList.querySelectorAll('input[name="sel_busho"]:checked').length;
            if (checkedCount > 0) {
                this.ui.selectorConfirmBtn.disabled = false;
                this.ui.selectorConfirmBtn.style.opacity = 1.0;
            } else {
                this.ui.selectorConfirmBtn.disabled = true;
                this.ui.selectorConfirmBtn.style.opacity = 0.5;
            }
        };

        // ★追加：タブ要素の準備と切り替えの魔法
        const tabsEl = document.getElementById('selector-tabs');
        let currentTab = 'stats'; // 最初は能力(stats)タブにしておきます
        let currentScope = 'clan'; // 最初は自家タブにしておきます
        let currentSortKey = null; // ★追加：今並べ替えの基準にしている項目
        let isSortAsc = false;     // ★追加：小さい順（昇順）なら true、大きい順（降順）なら false
        
        if (isViewMode && tabsEl) {
            tabsEl.classList.remove('hidden');
            // 全部左側に寄せる設定にします
            tabsEl.style.justifyContent = 'flex-start';
            
            let scopeHtml = '';
            if (actionType === 'all_busho_list') {
                // margin-left: 15px; で少し隙間を空けます
                scopeHtml = `
                    <div style="display: flex; gap: 5px; margin-left: 15px;">
                        <button class="busho-scope-btn active" data-scope="clan">自家</button>
                        <button class="busho-scope-btn" data-scope="all">全国</button>
                    </div>
                `;
            }

            // 能力・状態を先に、自家・全国を後に並べます
            tabsEl.innerHTML = `
                <div style="display: flex; gap: 5px;">
                    <button class="busho-tab-btn active" data-tab="stats">能力</button>
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
                    renderList(); // タブが切り替わったらリストを描き直します！
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
            // 見るだけじゃない時はタブを隠します
            tabsEl.classList.add('hidden');
        }

        let savedBushos = null; // ★追加：前の並び順を記憶しておく箱
        let lastScope = null;   // ★追加：前回のスコープ（自家/全国）の記憶

        // ★リストを描画する部分を「関数」としてまとめました！
        const renderList = () => {
            if (!this.ui.selectorList) return;
            this.ui.selectorList.innerHTML = '';
            
            let displayBushos;
            // ★変更：自家/全国が切り替わった時か、最初の１回目だけリストを作り直します
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
                // ★変更：それ以外は、前回の「並べ替え済みのリスト」をそのまま使います！
                displayBushos = [...savedBushos];
            }

            // ★追加：身分で並べ替えるための標準ルールをここで準備します
            const getSortRankAll = (b) => {
                // 軍師かどうかをチェックします
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
                // 軍師かどうかをチェックします
                const isGunshi = b.isGunshi || (b.clan > 0 && this.game.clans.find(c => c.id === b.clan)?.gunshiId === b.id);

                if (b.isDaimyo) return 7;
                if (b.isCastellan) return 6;
                if (isGunshi) return 5; 
                if (b.status === 'ronin') return 1;
                if (b.belongKunishuId > 0) {
                    const isLeader = b.id === (window.GameApp ? window.GameApp.kunishuSystem.getKunishu(b.belongKunishuId)?.leaderId : 0);
                    return isLeader ? 3 : 2;
                }
                return 4; // 一般武将
            };

            // ★追加：能力が「？」になっているか判定するための準備
            let acc = null;
            if (isEnemyTarget && targetCastle) acc = targetCastle.investigatedAccuracy;

            // ★並べ替えの魔法
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
                        return isSortAsc ? yomiA.localeCompare(yomiB, 'ja') : yomiB.localeCompare(yomiA, 'ja');
                    } else if (currentSortKey === 'rank') {
                        // ★変更：手動でソートした時は、全国表示でも自家を特別扱いせず、純粋な身分だけで比べます
                        valA = getSortRankClan(a);
                        valB = getSortRankClan(b);
                    } else if (currentSortKey === 'faction') {
                        const getFactionYomi = (busho) => {
                            if (busho.belongKunishuId > 0) {
                                const kunishu = this.game.kunishuSystem.getKunishu(busho.belongKunishuId);
                                return kunishu ? (kunishu.yomi || kunishu.name || "") : "んんん";
                            } else if (busho.clan > 0) {
                                const clan = this.game.clans.find(c => c.id === busho.clan);
                                return clan ? (clan.yomi || clan.name || "") : "んんん";
                            }
                            return "んんん";
                        };
                        const yomiA = getFactionYomi(a);
                        const yomiB = getFactionYomi(b);
                        return isSortAsc ? yomiA.localeCompare(yomiB, 'ja') : yomiB.localeCompare(yomiA, 'ja');
                    } else if (currentSortKey === 'castle') {
                        const getCastleYomi = (busho) => {
                            const castle = this.game.getCastle(busho.castleId);
                            return castle ? (castle.yomi || castle.name || "") : "んんん";
                        };
                        const yomiA = getCastleYomi(a);
                        const yomiB = getCastleYomi(b);
                        return isSortAsc ? yomiA.localeCompare(yomiB, 'ja') : yomiB.localeCompare(yomiA, 'ja');
                    } else if (currentSortKey === 'age') {
                        const isNullA = a.isAutoLeader;
                        const isNullB = b.isAutoLeader;
                        if (isNullA && !isNullB) return 1;
                        if (!isNullA && isNullB) return -1;

                        valA = isNullA ? 0 : this.game.year - a.birthYear;
                        valB = isNullB ? 0 : this.game.year - b.birthYear;
                    } else if (currentSortKey === 'family') {
                        // ★書き換え：画面に「◯」を表示する時とまったく同じルールで一門かどうかを確認します！
                        const checkFamily = (busho) => {
                            if (busho.clan > 0) {
                                const clan = this.game.clans.find(c => c.id === busho.clan);
                                const daimyo = clan ? this.game.getBusho(clan.leaderId) : null;
                                // 自分が大名なら一門です
                                if (daimyo && (busho.id === daimyo.id || busho.isDaimyo)) return 1;
                                // 大名と家族の繋がりがあれば一門です
                                if (daimyo) {
                                    const bFam = Array.isArray(busho.familyIds) ? busho.familyIds : [];
                                    const dFam = Array.isArray(daimyo.familyIds) ? daimyo.familyIds : [];
                                    if (bFam.includes(daimyo.id) || dFam.includes(busho.id)) return 1;
                                }
                            }
                            return 0; // 一門じゃなければ0にします
                        };
                        valA = checkFamily(a);
                        valB = checkFamily(b);
                    } else if (currentSortKey === 'salary') {
                        const daimyoA = a.clan > 0 ? this.game.getBusho(this.game.clans.find(c=>c.id===a.clan)?.leaderId) : null;
                        const daimyoB = b.clan > 0 ? this.game.getBusho(this.game.clans.find(c=>c.id===b.clan)?.leaderId) : null;
                        valA = a.clan > 0 && !a.isDaimyo && a.status !== 'ronin' ? a.getSalary(daimyoA) : 0;
                        valB = b.clan > 0 && !b.isDaimyo && b.status !== 'ronin' ? b.getSalary(daimyoB) : 0;
                    } else {
                        // ★書き換え：各武将が今いるお城の調査が済んでいるか、個別に調べます
                        const getAccForSort = (busho) => {
                            const c = this.game.getCastle(busho.castleId);
                            if (c && c.investigatedUntil >= this.game.getCurrentTurnId()) {
                                return c.investigatedAccuracy;
                            }
                            return acc;
                        };

                        let perceivedA = GameSystem.getPerceivedStatValue(a, currentSortKey, gunshi, getAccForSort(a), this.game.playerClanId, myDaimyo);
                        let perceivedB = GameSystem.getPerceivedStatValue(b, currentSortKey, gunshi, getAccForSort(b), this.game.playerClanId, myDaimyo);

                        // 自分の大名の場合は正確な能力がわかります
                        if (a.clan === this.game.playerClanId && a.isDaimyo) perceivedA = a[currentSortKey];
                        if (b.clan === this.game.playerClanId && b.isDaimyo) perceivedB = b[currentSortKey];

                        const isMaskedA = perceivedA === null;
                        const isMaskedB = perceivedB === null;
                        
                        // ★「？」になっている能力は、昇順降順に関係なく常に一番下へ回します
                        if (isMaskedA && !isMaskedB) return 1;  
                        if (!isMaskedA && isMaskedB) return -1; 
                        
                        // ★ランク（S+, Aなど）を、比べやすいように数字に変換する魔法です
                        const getGradeValue = (val) => {
                            if (val >= 96) return 12; // S+
                            if (val >= 91) return 11; // S
                            if (val >= 81) return 10; // A+
                            if (val >= 76) return 9;  // A
                            if (val >= 66) return 8;  // B+
                            if (val >= 61) return 7;  // B
                            if (val >= 51) return 6;  // C+
                            if (val >= 46) return 5;  // C
                            if (val >= 36) return 4;  // D+
                            if (val >= 31) return 3;  // D
                            if (val >= 21) return 2;  // E+
                            return 1;                 // E
                        };

                        if (isMaskedA && isMaskedB) {
                            valA = 0;
                            valB = 0;
                        } else {
                            const gradeA = getGradeValue(perceivedA);
                            const gradeB = getGradeValue(perceivedB);

                            if (gradeA === gradeB) {
                                // 見た目のランク（Sなど）が同じなら、優しさで内部的な実際の能力値を使います！
                                valA = a[currentSortKey] || 0;
                                valB = b[currentSortKey] || 0;
                            } else {
                                valA = gradeA;
                                valB = gradeB;
                            }
                        }
                    }
                    
                    // ★書き換え：中身が空っぽなら「0」、何かが入っていれば「1」にします！能力などの数字はそのまま残します。
                    const checkContent = (val) => {
                        if (val === false || val === '-' || val === '' || val === null || val === undefined) return 0;
                        if (typeof val === 'number') return val;
                        return 1;
                    };
                    
                    valA = checkContent(valA);
                    valB = checkContent(valB);
                    
                    // ★変更：同じ値だった時は、出席番号（ID）順に並び直すのをやめて、前の並び順をそのまま残す「0」にします！
                    if (valA === valB) return 0; 
                    return isSortAsc ? (valA - valB) : (valB - valA);
                });
            } else {
                // 並べ替えの基準がない時は、今までの標準の並び順にします
                if (actionType === 'all_busho_list' && currentScope === 'all') {
                    displayBushos.sort((a, b) => getSortRankAll(b) - getSortRankAll(a));
                } else if (actionType === 'view_only' || actionType === 'all_busho_list') {
                    displayBushos.sort((a, b) => getSortRankClan(b) - getSortRankClan(a));
                }
            }

            // ★追加：並べ替えが終わった後のリストを記憶しておきます！
            savedBushos = [...displayBushos];

            // ★追加：並べ替えのマーク（▲や▼）をつける魔法
            const getSortMark = (key) => {
                if (currentSortKey !== key) return '';
                return isSortAsc ? ' ▲' : ' ▼';
            };
            
            // 選ばれているタブに合わせて、リストの一番上の見出しを変えます
            // 見出しに「data-sort」という目印をつけて、タップできるようにします
            if (currentTab === 'stats') {
                if (isViewMode) {
                    this.ui.selectorList.innerHTML = `
                        <div class="list-header sortable-header view-mode">
                            <span class="col-name" data-sort="name">名前${getSortMark('name')}</span><span class="col-rank" data-sort="rank">身分${getSortMark('rank')}</span><span class="col-stat" data-sort="leadership">統率${getSortMark('leadership')}</span><span class="col-stat" data-sort="strength">武勇${getSortMark('strength')}</span><span class="col-stat" data-sort="politics">政務${getSortMark('politics')}</span><span class="col-stat" data-sort="diplomacy">外交${getSortMark('diplomacy')}</span><span class="col-stat" data-sort="intelligence">智謀${getSortMark('intelligence')}</span><span class="col-stat" data-sort="charm">魅力${getSortMark('charm')}</span>
                        </div>
                    `;
                } else {
                    this.ui.selectorList.innerHTML = `
                        <div class="list-header sortable-header">
                            <span class="col-act" data-sort="action">行動${getSortMark('action')}</span><span class="col-name" data-sort="name">名前${getSortMark('name')}</span><span class="col-rank" data-sort="rank">身分${getSortMark('rank')}</span><span class="col-stat" data-sort="leadership">統率${getSortMark('leadership')}</span><span class="col-stat" data-sort="strength">武勇${getSortMark('strength')}</span><span class="col-stat" data-sort="politics">政務${getSortMark('politics')}</span><span class="col-stat" data-sort="diplomacy">外交${getSortMark('diplomacy')}</span><span class="col-stat" data-sort="intelligence">智謀${getSortMark('intelligence')}</span><span class="col-stat" data-sort="charm">魅力${getSortMark('charm')}</span>
                        </div>
                    `;
                }
            } else {
                if (isViewMode) {
                    this.ui.selectorList.innerHTML = `
                        <div class="list-header status-mode sortable-header view-mode">
                            <span class="col-name" data-sort="name">名前${getSortMark('name')}</span><span class="col-rank" data-sort="rank">身分${getSortMark('rank')}</span><span class="col-faction" data-sort="faction">勢力${getSortMark('faction')}</span><span class="col-castle" data-sort="castle">所在${getSortMark('castle')}</span><span class="col-act" data-sort="action">行動${getSortMark('action')}</span><span class="col-age" data-sort="age">年齢${getSortMark('age')}</span><span class="col-family" data-sort="family">一門${getSortMark('family')}</span><span class="col-salary" data-sort="salary">俸禄${getSortMark('salary')}</span><span></span>
                        </div>
                    `;
                } else {
                    this.ui.selectorList.innerHTML = `
                        <div class="list-header status-mode sortable-header">
                            <span class="col-name" data-sort="name">名前${getSortMark('name')}</span><span class="col-rank" data-sort="rank">身分${getSortMark('rank')}</span><span class="col-faction" data-sort="faction">勢力${getSortMark('faction')}</span><span class="col-castle" data-sort="castle">所在${getSortMark('castle')}</span><span class="col-age" data-sort="age">年齢${getSortMark('age')}</span><span class="col-family" data-sort="family">一門${getSortMark('family')}</span><span class="col-salary" data-sort="salary">俸禄${getSortMark('salary')}</span><span></span>
                        </div>
                    `;
                }
            }

            // ★追加：見出しをクリックした時に並べ替えを実行する魔法
            const headerSpans = this.ui.selectorList.querySelectorAll('.sortable-header span[data-sort]');
            headerSpans.forEach(span => {
                span.onclick = (e) => {
                    const key = e.currentTarget.getAttribute('data-sort');
                    if (!key) return;
                    if (window.AudioManager) window.AudioManager.playSE('choice.ogg');
                    
                    if (currentSortKey === key) {
                        // 同じ項目を押したなら、大きい順・小さい順を切り替えます
                        isSortAsc = !isSortAsc;
                    } else {
                        // 違う項目を押したなら、その項目を基準にします
                        currentSortKey = key;
                        isSortAsc = false; // 基本は大きい順（降順）から始めます
                        
                        // 名前や所在の時は、小さい順（昇順）から始まる方が自然です
                        if (['name', 'faction', 'castle'].includes(key)) {
                            isSortAsc = true;
                        }
                    }
                    renderList(); // リストを描き直します！
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
                
                // ★書き換え：表示する時も、対象の武将がいるお城の調査状況を個別に確認するようにします
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
                
                // 状態タブの時は、CSSで幅を変えるための目印（status-mode）を貼ります
                if (currentTab === 'status') div.classList.add('status-mode');
                // 見るだけの時は幅を変えるための目印（view-mode）を貼ります
                if (isViewMode) div.classList.add('view-mode');

                const inputType = isMulti ? 'checkbox' : 'radio';
                
                let inputHtml = '';
                if (!isViewMode) {
                    inputHtml = `<input type="${inputType}" name="sel_busho" value="${b.id}" ${!isSelectable ? 'disabled' : ''} style="display:none;">`;
                }
                
                // ここでタブによって中身のデータを切り替えます！
                if (currentTab === 'stats') {
                    // 能力タブ
                    if (isViewMode) {
                        div.innerHTML = `<span class="col-name">${b.name}</span><span class="col-rank">${b.getRankName()}</span><span class="col-stat">${getStat('leadership')}</span><span class="col-stat">${getStat('strength')}</span><span class="col-stat">${getStat('politics')}</span><span class="col-stat">${getStat('diplomacy')}</span><span class="col-stat">${getStat('intelligence')}</span><span class="col-stat">${getStat('charm')}</span>`;
                    } else {
                        div.innerHTML = `<span class="col-act">${inputHtml}${b.isActionDone?'済':'未'}</span><span class="col-name">${b.name}</span><span class="col-rank">${b.getRankName()}</span><span class="col-stat">${getStat('leadership')}</span><span class="col-stat">${getStat('strength')}</span><span class="col-stat">${getStat('politics')}</span><span class="col-stat">${getStat('diplomacy')}</span><span class="col-stat">${getStat('intelligence')}</span><span class="col-stat">${getStat('charm')}</span>`;
                    }
                } else {
                    // 状態タブ
                    let forceName = "浪人";
                    let familyMark = "";
                    
                    // 勢力名と一門判定
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

                    if (isViewMode) {
                        div.innerHTML = `<span class="col-name">${b.name}</span><span class="col-rank">${b.getRankName()}</span><span class="col-faction">${forceName}</span><span class="col-castle">${bCastleName}</span><span class="col-act">${b.isActionDone?'済':'未'}</span><span class="col-age">${age}</span><span class="col-family">${familyMark}</span><span class="col-salary">${salary}</span><span></span>`;
                    } else {
                        // 状態タブにも inputHtml を隠しておく（選択できるように）
                        div.innerHTML = `<span class="col-name">${inputHtml}${b.name}</span><span class="col-rank">${b.getRankName()}</span><span class="col-faction">${forceName}</span><span class="col-castle">${bCastleName}</span><span class="col-age">${age}</span><span class="col-family">${familyMark}</span><span class="col-salary">${salary}</span><span></span>`;
                    }
                }
                
                if (actionType === 'view_only' || actionType === 'all_busho_list') {
                    div.onclick = () => {
                        if (window.AudioManager) window.AudioManager.playSE('choice.ogg');
                        this.ui.showBushoDetailModal(b);
                    };
                    div.style.cursor = 'pointer'; // カーソルを指の形にする魔法
                } else if (isSelectable) { 
                    div.onclick = (e) => {
                        if (window.AudioManager) window.AudioManager.playSE('choice.ogg');

                        // 【パターン1】チェックボックスの四角い部分を直接ポチッと押した時の動き
                        if(e.target.tagName === 'INPUT') { 
                            if(!isMulti) {
                                const siblings = this.ui.selectorList.querySelectorAll('.select-item');
                                siblings.forEach(el => el.classList.remove('selected'));
                            } else {
                                 const maxSelect = (actionType === 'war_deploy' || actionType === 'def_intercept_deploy' || actionType === 'def_reinf_deploy' || actionType === 'atk_reinf_deploy' || actionType === 'def_self_reinf_deploy' || actionType === 'atk_self_reinf_deploy' || actionType === 'kunishu_subjugate_deploy') ? 5 : 999;
                                 const currentChecked = this.ui.selectorList.querySelectorAll('input[name="sel_busho"]:checked').length;
                                 if(e.target.checked && currentChecked > maxSelect) {
                                     e.target.checked = false;
                                     this.ui.showDialog(`出陣できる武将は最大${maxSelect}名までです。`, false);
                                     return;
                                 }

                                 // ★ ここから追加：金や兵糧のオーバーチェック（チェックボックスを直接押した時）
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
                        
                        // 【パターン2】武将の名前など、行のどこかを押した時の動き
                        const input = div.querySelector('input');
                        if(input) {
                            if (isMulti) { 
                                 const maxSelect = (actionType === 'war_deploy' || actionType === 'def_intercept_deploy' || actionType === 'def_reinf_deploy' || actionType === 'atk_reinf_deploy' || actionType === 'def_self_reinf_deploy' || actionType === 'atk_self_reinf_deploy' || actionType === 'kunishu_subjugate_deploy') ? 5 : 999;
                                 const currentChecked = this.ui.selectorList.querySelectorAll('input[name="sel_busho"]:checked').length;
                                 if(!input.checked && currentChecked >= maxSelect) {
                                     this.ui.showDialog(`出陣できる武将は最大${maxSelect}名までです。`, false);
                                     return;
                                 }

                                 // ★ ここから追加：金や兵糧のオーバーチェック（武将の行を押した時）
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
                                 input.checked = true; const allItems = this.ui.selectorList.querySelectorAll('.select-item'); allItems.forEach(item => item.classList.remove('selected')); 
                            }
                            if(input.checked) div.classList.add('selected'); else div.classList.remove('selected');
                            updateContextCost(); 
                            updateBushoConfirmBtn(); 
                        }
                    };
                }
                this.ui.selectorList.appendChild(div);
            });
            if (bushos.length === 0 && this.ui.selectorList) this.ui.selectorList.innerHTML = "<div style='padding:10px;'>対象となる武将がいません</div>";
        };

        // 準備が整ったので、最初の1回目を描画します！
        renderList();
        
        if (this.ui.selectorList) {
            this.ui.selectorList.scrollTop = 0;
        }
        
        if (this.ui.selectorConfirmBtn) {
            if (actionType === 'view_only' || actionType === 'all_busho_list') {
                this.ui.selectorConfirmBtn.classList.add('hidden'); 
            } else {
                this.ui.selectorConfirmBtn.classList.remove('hidden');
                
                updateBushoConfirmBtn();

                this.ui.selectorConfirmBtn.onclick = () => {
                    const inputs = document.querySelectorAll('input[name="sel_busho"]:checked'); if (inputs.length === 0) return;
                    const selectedIds = Array.from(inputs).map(i => parseInt(i.value)); 
                    this.ui.closeSelector();
                    if (extraData && extraData.onConfirm) {
                        extraData.onConfirm(selectedIds);
                    } else {
                        this.game.commandSystem.handleBushoSelection(actionType, selectedIds, targetId, extraData);
                    }
                };
            }
        }
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
                    displayEl.innerHTML = makeGrid("騎馬", (c.horses || 0) + amount, c.gold - cost);
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
            
            const labelStyle = "width: 4em; min-width: 4em; text-align:center; font-weight:bold; background-color: #546e7a; color: #fff; border-radius: 3px; padding: 4px 0; margin-right: 5px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;";
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
                    if (bMin) { bMin.style.display = 'block'; bMin.disabled = true; bMin.style.order = 1; }
                    if (bHalf) { bHalf.style.display = 'block'; bHalf.disabled = true; bHalf.style.order = 3; }
                    if (bMax) { bMax.style.display = 'none'; }
                    return;
                }

                if (v <= currentMin) {
                    // 最小の時：「最小(無効)」ゲージ「半分(有効)」を表示
                    if (bMin) { bMin.style.display = 'block'; bMin.disabled = true; bMin.style.order = 1; }
                    if (bHalf) { bHalf.style.display = 'block'; bHalf.disabled = false; bHalf.style.order = 3; }
                    if (bMax) { bMax.style.display = 'none'; }
                } else if (v >= currentMax) {
                    // 最大の時：「半分(有効)」ゲージ「最大(無効)」を表示
                    if (bMin) { bMin.style.display = 'none'; }
                    if (bHalf) { bHalf.style.display = 'block'; bHalf.disabled = false; bHalf.style.order = 1; }
                    if (bMax) { bMax.style.display = 'block'; bMax.disabled = true; bMax.style.order = 3; }
                } else {
                    // 中間の時：「最小(有効)」ゲージ「最大(有効)」を表示
                    if (bMin) { bMin.style.display = 'block'; bMin.disabled = false; bMin.style.order = 1; }
                    if (bHalf) { bHalf.style.display = 'none'; }
                    if (bMax) { bMax.style.display = 'block'; bMax.disabled = false; bMax.style.order = 3; }
                }
            };

            if (isTransport) {
                const actualMaxTransport = Math.min(max, targetMaxLimit - targetCurrent);
                wrap.innerHTML = `
                    <div class="qty-control" style="display:flex; align-items:center; gap:5px;">
                        <span style="${labelStyle} order:0;">${label}</span>
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
                if (isSingle) {
                    wrap.innerHTML = `
                        <div style="font-weight:bold; margin-bottom:8px; text-align:left; color:#333; font-size:1.05rem;">${label}</div>
                        <div class="qty-control" style="display:flex; align-items:center; gap:5px;">
                            <button class="qty-shortcut-btn" id="btn-min-${id}" style="order:1;">最小</button>
                            <button class="qty-shortcut-btn" id="btn-half-${id}" style="order:3;">半分</button>
                            <input type="range" id="range-${id}" min="${minVal}" max="${max}" value="${currentVal}" style="flex:1; order:2;">
                            <button class="qty-shortcut-btn" id="btn-max-${id}" style="order:3;">最大</button>
                            <input type="number" id="num-${id}" min="${minVal}" max="${max}" value="${currentVal}" style="order:4;">
                        </div>
                    `;
                } else {
                    wrap.innerHTML = `
                        <div class="qty-control" style="display:flex; align-items:center; gap:5px;">
                            <span style="${labelStyle} order:0;">${label}</span>
                            <button class="qty-shortcut-btn" id="btn-min-${id}" style="order:1;">最小</button>
                            <button class="qty-shortcut-btn" id="btn-half-${id}" style="order:3;">半分</button>
                            <input type="range" id="range-${id}" min="${minVal}" max="${max}" value="${currentVal}" style="flex:1; order:2;">
                            <button class="qty-shortcut-btn" id="btn-max-${id}" style="order:3;">最大</button>
                            <input type="number" id="num-${id}" min="${minVal}" max="${max}" value="${currentVal}" style="order:4;">
                        </div>
                    `;
                }
                
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
            stockDiv.style.cssText = "background: #f0f4f8; padding: 10px; border-radius: 6px; border: 1px solid #ccc; margin-bottom: 15px; font-size: 0.95rem; font-weight: bold;";
            stockDiv.innerHTML = `
                <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px;">
                    <div style="background: #ffffff; padding: 6px 8px; border-radius: 4px; border: 1px solid #ddd; display: flex; justify-content: space-between; align-items: center;">
                        <span style="color:#555;">金</span><span id="multi-stock-gold">${sourceCastleForMulti.gold}</span>
                    </div>
                    <div style="background: #ffffff; padding: 6px 8px; border-radius: 4px; border: 1px solid #ddd; display: flex; justify-content: space-between; align-items: center;">
                        <span style="color:#555;">兵糧</span><span id="multi-stock-rice">${sourceCastleForMulti.rice}</span>
                    </div>
                    <div style="background: #ffffff; padding: 6px 8px; border-radius: 4px; border: 1px solid #ddd; display: flex; justify-content: space-between; align-items: center;">
                        <span style="color:#555;">兵士</span><span id="multi-stock-soldiers">${sourceCastleForMulti.soldiers}</span>
                    </div>
                    <div style="background: #ffffff; padding: 6px 8px; border-radius: 4px; border: 1px solid #ddd; display: flex; justify-content: space-between; align-items: center;">
                        <span style="color:#555;">騎馬</span><span id="multi-stock-horses">${sourceCastleForMulti.horses || 0}</span>
                    </div>
                    <div style="background: #ffffff; padding: 6px 8px; border-radius: 4px; border: 1px solid #ddd; display: flex; justify-content: space-between; align-items: center;">
                        <span style="color:#555;">鉄砲</span><span id="multi-stock-guns">${sourceCastleForMulti.guns || 0}</span>
                    </div>
                </div>
            `;
            this.ui.quantityContainer.appendChild(stockDiv);
        }
        
        if (type === 'draft') {
            document.getElementById('quantity-title').textContent = "徴兵"; 
            
            const busho = this.game.getBusho(data[0]);
            const maxAffordable = GameSystem.calcDraftFromGold(c.gold, busho, c.peoplesLoyalty);
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
            document.getElementById('quantity-title').textContent = "贈与金指定"; inputs.gold = createSlider("金", "gold", c.gold, 100);
        } else if (type === 'headhunt_gold') {
            document.getElementById('quantity-title').textContent = "持参金 (任意)"; inputs.gold = createSlider("金", "gold", c.gold, 0);
        } else if (type === 'tribute_gold') {
            document.getElementById('quantity-title').textContent = "献上金 (最大1500)"; 
            const maxTributeGold = Math.min(1500, c.gold);
            inputs.gold = createSlider("金", "gold", maxTributeGold, 0);
        } else if (type === 'war_supplies') {
            document.getElementById('quantity-title').textContent = "出陣用意"; 
            inputs.soldiers = createSlider("兵士", "soldiers", c.soldiers, c.soldiers);
            inputs.rice = createSlider("兵糧", "rice", c.rice, c.rice);
            inputs.horses = createSlider("騎馬", "horses", c.horses, 0);
            inputs.guns = createSlider("鉄砲", "guns", c.guns, 0);
        } else if (type === 'def_intercept') { 
            const interceptCastle = (data && data.length > 0) ? data[0] : c;
            document.getElementById('quantity-title').textContent = "迎撃部隊編成"; 
            inputs.soldiers = createSlider("出陣兵士数", "soldiers", interceptCastle.soldiers, interceptCastle.soldiers);
            inputs.rice = createSlider("兵糧", "rice", interceptCastle.rice, interceptCastle.rice);
            inputs.horses = createSlider("騎馬", "horses", interceptCastle.horses || 0, 0);
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
            inputs.horses = createSlider("騎馬", "horses", helperCastle.horses || 0, 0, 0);
            inputs.guns = createSlider("鉄砲", "guns", helperCastle.guns || 0, 0, 0);
        } else if (type === 'transport') {
            document.getElementById('quantity-title').textContent = "輸送";
            
            const header = document.createElement('div');
            header.className = 'qty-row'; // 行のスタイルを合わせます
            header.style.marginBottom = '5px';
            header.style.fontSize = '0.85rem';
            header.style.color = '#333';
            // スライダー行と全く同じ要素構成にして、ボタンなどは透明化して配置します
            header.innerHTML = `
                <div class="qty-control" style="display:flex; align-items:center; gap:5px;">
                    <div style="width: 4em; min-width: 4em; margin-right: 5px; order:0;"></div>
                    <button class="qty-shortcut-btn" style="visibility:hidden; pointer-events:none; order:1;">空</button>
                    <div style="flex:1; order:2;"></div>
                    <button class="qty-shortcut-btn" style="visibility:hidden; pointer-events:none; order:3;">空</button>
                    <div style="width: 50px; text-align: center; font-weight: bold; order:4;">輸送先</div>
                </div>
            `;
            this.ui.quantityContainer.appendChild(header);

            const tCastle = this.game.getCastle(targetId); // 輸送先の城のデータを取得します
            
            // 引数は (ラベル, ID, 自分の城の数, 最初は0, 最低は0, 輸送モードフラグ, 相手の城の数, 相手の城の上限) です
            inputs.gold = createSlider("金", "gold", c.gold, 0, 0, true, tCastle.gold, 99999);
            inputs.rice = createSlider("兵糧", "rice", c.rice, 0, 0, true, tCastle.rice, 99999);
            inputs.soldiers = createSlider("兵士", "soldiers", c.soldiers, 0, 0, true, tCastle.soldiers, 99999);
            inputs.horses = createSlider("騎馬", "horses", c.horses || 0, 0, 0, true, tCastle.horses || 0, 99999);
            inputs.guns = createSlider("鉄砲", "guns", c.guns || 0, 0, 0, true, tCastle.guns || 0, 99999);
        } else if (type === 'buy_rice') {
            document.getElementById('quantity-title').textContent = "兵糧購入"; 
            let rate = 1.0;
            if (c && this.game.provinces) {
                const province = this.game.provinces.find(p => p.id === c.provinceId);
                if (province && province.marketRate !== undefined) rate = province.marketRate;
            }
            const maxBuy = Math.floor(c.gold / rate);
            this.ui.tradeTypeInfo.classList.remove('hidden'); 
            // ★変更：相場の金額を小数点以下1桁で表示します！
            this.ui.tradeTypeInfo.textContent = `兵糧 10 ＝ 金 ${(10 * rate).toFixed(1)}`;

            // ★変更：スライダーより前に数字の箱を作って、スライダーの上に表示させます！
            const costDiv = document.createElement('div');
            costDiv.id = 'dynamic-cost-display';
            costDiv.style.cssText = "display: flex; justify-content: center; font-weight:bold; color:#1976d2; margin-bottom:15px; font-size:1.1rem;";
            this.ui.quantityContainer.appendChild(costDiv);

            inputs.amount = createSlider("購入量", "amount", maxBuy, 0);
            
        } else if (type === 'sell_rice') {
            document.getElementById('quantity-title').textContent = "兵糧売却"; 
            let rate = 1.0;
            if (c && this.game.provinces) {
                const province = this.game.provinces.find(p => p.id === c.provinceId);
                if (province && province.marketRate !== undefined) rate = province.marketRate;
            }
            this.ui.tradeTypeInfo.classList.remove('hidden'); 
            // ★変更：相場の金額を小数点以下1桁で表示します！
            this.ui.tradeTypeInfo.textContent = `兵糧 10 ＝ 金 ${(10 * rate).toFixed(1)}`;

            // ★変更：スライダーより前に数字の箱を作って、スライダーの上に表示させます！
            const costDiv = document.createElement('div');
            costDiv.id = 'dynamic-cost-display';
            costDiv.style.cssText = "display: flex; justify-content: center; font-weight:bold; color:#1976d2; margin-bottom:15px; font-size:1.1rem;";
            this.ui.quantityContainer.appendChild(costDiv);

            inputs.amount = createSlider("売却量", "amount", c.rice, 0);

        } else if (type === 'buy_ammo') {
            document.getElementById('quantity-title').textContent = "矢弾購入"; 
            const price = parseInt(window.MainParams.Economy.PriceAmmo, 10) || 1;
            const maxBuy = price > 0 ? Math.floor(c.gold / price) : 0;
            this.ui.tradeTypeInfo.classList.remove('hidden'); 
            this.ui.tradeTypeInfo.textContent = `固定価格: 金${price.toFixed(1)} / 1個`; // 念のためこちらも揃えます
            inputs.amount = createSlider("購入量", "amount", maxBuy, 0);
        } else if (type === 'buy_horses') {
            document.getElementById('quantity-title').textContent = "騎馬購入"; 
            const maxBuy = GameSystem.calcBuyHorseAmount(c.gold, daimyo, castellan);
            const realMaxBuy = Math.min(maxBuy, 99999 - (c.horses || 0));

            // ★変更：さっき作った「正確な単価の魔法」を使って表示します
            const unitPrice = GameSystem.calcBuyHorseUnitPrice(daimyo, castellan);
            this.ui.tradeTypeInfo.classList.remove('hidden'); 
            this.ui.tradeTypeInfo.textContent = `騎馬 1頭 ＝ 金 ${unitPrice.toFixed(1)}`;

            // ★変更：スライダーより前に数字の箱を作って、スライダーの上に表示させます！
            const costDiv = document.createElement('div');
            costDiv.id = 'dynamic-cost-display';
            costDiv.style.cssText = "display: flex; justify-content: center; font-weight:bold; color:#1976d2; margin-bottom:15px; font-size:1.1rem;";
            this.ui.quantityContainer.appendChild(costDiv);

            inputs.amount = createSlider("購入量", "amount", realMaxBuy, 0);

        } else if (type === 'buy_guns') {
            document.getElementById('quantity-title').textContent = "鉄砲購入"; 
            const maxBuy = GameSystem.calcBuyGunAmount(c.gold, daimyo, castellan);
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
}