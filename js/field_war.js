/**
 * field_war.js
 * HEX式 野戦システム
 * 修正: 撤退ボタンの確認アラートをカスタムダイアログ（showDialog）に置き換えました
 * ★追加: 城が攻められた時に、仲の良い国人衆が「AIの援軍」として参戦する機能を追加しました
 * ★追加: 「足軽」「騎馬」「鉄砲」の兵科概念を導入し、移動力や攻撃範囲、ダメージ倍率を反映しました
 */

class FieldWarManager {
    constructor(game) {
        this.game = game;
        this.active = false;
        
        // HEXサイズとマップのグリッド設定
        this.hexW = 30;
        this.hexH = 26;
        // 横20マス × 縦12マスのフィールド空間に変更
        this.cols = 20;
        this.rows = 12;

        // state: 'IDLE', 'PHASE_MOVE', 'MOVE_PREVIEW', 'PHASE_DIR', 'PHASE_ATTACK'
        this.state = 'IDLE'; 
        this.reachable = null;
        this.previewTarget = null;
        this.turnBackup = null; 
    }

    startFieldWar(warState, onComplete) {
        this.warState = warState;
        this.onComplete = onComplete;
        this.turnCount = 1;
        this.maxTurns = 20; 
        this.active = true;
        this.state = 'IDLE';
        this.hideUnitInfo();

        const pid = Number(this.game.playerClanId);
        const isAtkPlayer = (Number(warState.attacker.ownerClan) === pid);
        const isDefPlayer = (Number(warState.defender.ownerClan) === pid);
        const isPlayerInvolved = isAtkPlayer || isDefPlayer;

        // 配置座標の決定（X=3, 17 は共に奇数）
        let atkX = 3, defX = 17;
        if (isDefPlayer && !isAtkPlayer) {
            atkX = 17;
            defX = 3;
        }

        this.units = [];
        const yPositions = [11, 7, 15, 3, 19]; 

        // 攻撃側部隊の生成
        if (warState.atkAssignments) {
            warState.atkAssignments.forEach((assign, index) => {
                if (assign.soldiers <= 0) return;
                const type = assign.troopType || 'ashigaru';
                const mobility = (type === 'kiba') ? 6 : 4; // ★ 騎馬は行動力6

                // ★追加: この部隊が援軍かどうか、そして誰が操作するかをチェックします！
                let isReinf = false;
                let unitIsPlayer = isAtkPlayer;
                if (warState.reinforcement && warState.reinforcement.bushos.some(b => b.id === assign.busho.id)) {
                    isReinf = true;
                    // 援軍の城の持ち主がプレイヤーなら、プレイヤーが操作できる！
                    unitIsPlayer = (Number(warState.reinforcement.castle.ownerClan) === pid);
                }

                this.units.push({
                    id: `atk_${index}`,
                    bushoId: assign.busho.id,
                    name: assign.busho.name,
                    isAttacker: true,
                    isPlayer: unitIsPlayer,    // ★修正: 援軍か本隊かで操作権限を変えます
                    isReinforcement: isReinf,  // ★追加: 援軍マークをつけます
                    isGeneral: index === 0,
                    x: atkX,
                    y: yPositions[index % 5],
                    direction: isAtkPlayer ? 1 : 4,
                    mobility: mobility, 
                    ap: mobility,
                    soldiers: assign.soldiers,
                    troopType: type, // ★ 兵科を保存
                    stats: WarSystem.calcUnitStats([assign.busho]),
                    hasActionDone: false,
                    hasMoved: false // ★ 鉄砲の移動後攻撃不可判定用
                });
            });
        }

        // 守備側部隊の生成
        if (warState.defAssignments) {
            warState.defAssignments.forEach((assign, index) => {
                if (assign.soldiers <= 0) return;
                const type = assign.troopType || 'ashigaru';
                const mobility = (type === 'kiba') ? 6 : 4;

                // ★追加: 守備側の援軍チェック！
                let isReinf = false;
                let unitIsPlayer = isDefPlayer;
                if (warState.defReinforcement && warState.defReinforcement.bushos.some(b => b.id === assign.busho.id)) {
                    isReinf = true;
                    // 援軍の城の持ち主がプレイヤーなら、プレイヤーが操作できる！
                    unitIsPlayer = (Number(warState.defReinforcement.castle.ownerClan) === pid);
                }

                this.units.push({
                    id: `def_${index}`,
                    bushoId: assign.busho.id,
                    name: assign.busho.name,
                    isAttacker: false,
                    isPlayer: unitIsPlayer,    // ★修正: 援軍か本隊かで操作権限を変えます
                    isReinforcement: isReinf,  // ★追加: 援軍マークをつけます
                    isGeneral: index === 0,
                    x: defX,
                    y: yPositions[index % 5],
                    direction: isDefPlayer ? 1 : 4,
                    mobility: mobility, 
                    ap: mobility,
                    soldiers: assign.soldiers,
                    troopType: type,
                    stats: WarSystem.calcUnitStats([assign.busho]),
                    hasActionDone: false,
                    hasMoved: false
                });
            });
        }

        // 防衛側が城を持っている場合、仲良しの国人衆が「援軍」に来る
        if (!warState.isKunishuSubjugation && warState.defender.ownerClan !== 0 && warState.defender.ownerClan !== -1) {
            const kunishus = this.game.kunishuSystem.getKunishusInCastle(warState.defender.id);
            kunishus.forEach(k => {
                if (k.isDestroyed) return;
                const rel = k.getRelation(warState.defender.ownerClan);
                if (rel >= 70) {
                    const prob = 0.2 + ((rel - 70) / 30) * 0.8;
                    if (Math.random() <= prob) {
                        const members = this.game.kunishuSystem.getKunishuMembers(k.id);
                        if (members.length > 0) {
                            members.sort((a, b) => b.leadership - a.leadership);
                            const bestBusho = members[0];
                            
                            if (!this.units.some(u => u.name === bestBusho.name)) {
                                const uSoldiers = Math.floor(k.soldiers * 0.5); 
                                
                                if (uSoldiers > 0) {
                                    this.units.push({
                                        id: 'k_' + bestBusho.id,
                                        bushoId: bestBusho.id,
                                        kunishuId: k.id,
                                        name: bestBusho.name,
                                        isAttacker: false,
                                        isPlayer: false, 
                                        isGeneral: false,
                                        x: defX, 
                                        y: yPositions[this.units.length % 5], 
                                        direction: isDefPlayer ? 1 : 4,
                                        mobility: 4, 
                                        ap: 4,
                                        soldiers: uSoldiers,
                                        troopType: 'ashigaru', // 国衆援軍はデフォルトで足軽
                                        stats: WarSystem.calcUnitStats([bestBusho]),
                                        hasActionDone: false,
                                        hasMoved: false
                                    });
                                    this.game.ui.log(`【国衆援軍】${bestBusho.name}率いる国人衆が防衛側の援軍として駆けつけました！`);
                                }
                            }
                        }
                    }
                }
            });
        }

        this.atkRice = warState.attacker.rice;
        this.defRice = warState.defFieldRice || 0;
        this.atkMorale = warState.attacker.morale;
        this.defMorale = warState.defender.morale;
        this.atkTraining = warState.attacker.training;
        this.defTraining = warState.defender.training;

        this.turnQueue = [];
        this.initUI();
        
        if (isPlayerInvolved) {
            this.updateMap();
            this.updateStatus();
            this.log("両軍、布陣を完了。野戦を開始します！");
        }
        
        this.startTurn();
    }

    initUI() {
        this.modal = document.getElementById('field-war-modal');
        this.mapEl = document.getElementById('fw-map');
        this.logEl = document.getElementById('fw-log');
        
        if (this.modal) this.modal.classList.remove('hidden');
        if (this.logEl) this.logEl.innerHTML = '';
        
        const totalW = (this.cols - 1) * (this.hexW * 0.75) + this.hexW;
        const totalH = (this.rows * 2 - 1) * (this.hexH / 2) + this.hexH;
        
        if (this.mapEl) {
            this.mapEl.style.width = `${totalW}px`;
            this.mapEl.style.height = `${totalH}px`;
            this.mapEl.oncontextmenu = (e) => {
                e.preventDefault();
                this.cancelAction();
            };
        }

        const btnWait = document.getElementById('fw-btn-wait');
        const btnRetreat = document.getElementById('fw-btn-retreat');
        
        if (btnWait) {
            btnWait.onclick = () => {
                if (!this.isPlayerTurn()) return;
                const unit = this.turnQueue[0];
                this.log(`${unit.name}隊は待機した。`);
                unit.hasActionDone = true;
                this.state = 'IDLE';
                this.nextPhaseTurn();
            };
        }
        
        if (btnRetreat) {
            btnRetreat.onclick = () => {
                if (!this.isPlayerTurn()) return;
                const unit = this.turnQueue[0];
                this.game.ui.showDialog("全軍を撤退させますか？", true, () => {
                    if (unit.isAttacker) this.log(`撤退を開始します……`);
                    else this.log(`城内へ撤退を開始します……`);
                    this.endFieldWar(unit.isAttacker ? 'attacker_retreat' : 'defender_retreat');
                });
            };
        }
    }

    cancelAction() {
        if (!this.active || !this.isPlayerTurn()) return;
        
        const unit = this.turnQueue[0];
        if (unit.hasActionDone) return;
        
        if (this.state === 'PHASE_MOVE' && this.turnBackup && 
            unit.x === this.turnBackup.x && unit.y === this.turnBackup.y && unit.direction === this.turnBackup.direction) {
            if (this.previewTarget) {
                this.previewTarget = null;
                this.updateMap();
            }
            return;
        }

        if (this.turnBackup) {
            unit.x = this.turnBackup.x;
            unit.y = this.turnBackup.y;
            unit.direction = this.turnBackup.direction;
            unit.ap = this.turnBackup.ap;
            unit.hasMoved = false; // ★ キャンセル時は移動フラグも戻す
            
            this.log(`${unit.name}隊の行動をキャンセルしました。`);
            
            this.state = 'PHASE_MOVE';
            this.reachable = null;
            this.previewTarget = null;
            
            this.reachable = this.findPaths(unit, unit.ap);
            
            this.updateMap();
            this.updateStatus();
        }
    }

    scrollToUnit(unit) {
        const scrollEl = document.getElementById('fw-map-scroll');
        if (!scrollEl) return;
        
        const px = unit.x * (this.hexW * 0.75) + this.hexW / 2;
        const py = unit.y * (this.hexH / 2) + this.hexH / 2;

        const containerW = scrollEl.clientWidth;
        const containerH = scrollEl.clientHeight;

        scrollEl.scrollTo({
            left: px - containerW / 2,
            top: py - containerH / 2,
            behavior: 'smooth'
        });
    }

    log(msg) {
        if (!this.logEl) return;
        const div = document.createElement('div');
        div.innerText = `[T${this.turnCount}] ${msg}`;
        div.style.marginBottom = '2px';
        this.logEl.appendChild(div);
        this.logEl.scrollTop = this.logEl.scrollHeight;
    }

    updateStatus() {
        let atkSoldiers = 0, defSoldiers = 0;
        this.units.forEach(u => {
            if (u.isAttacker) atkSoldiers += u.soldiers;
            else defSoldiers += u.soldiers;
        });

        const atkEl = document.getElementById('fw-atk-status');
        const defEl = document.getElementById('fw-def-status');

        if (atkEl) atkEl.innerHTML = `<strong>[攻] ${this.warState.attacker.name}</strong><br>兵: ${atkSoldiers} / 糧: ${this.atkRice}`;
        if (defEl) defEl.innerHTML = `<strong>[守] ${this.warState.defender.name}</strong><br>兵: ${defSoldiers} / 糧: ${this.defRice}`;
        
        const isAtkPlayer = (Number(this.warState.attacker.ownerClan) === Number(this.game.playerClanId));
        const isDefPlayer = (Number(this.warState.defender.ownerClan) === Number(this.game.playerClanId));

        if (isAtkPlayer) {
            if (atkEl) atkEl.style.order = 1;
            if (defEl) defEl.style.order = 2;
        } else if (isDefPlayer) {
            if (atkEl) atkEl.style.order = 2;
            if (defEl) defEl.style.order = 1;
        } else {
            if (atkEl) atkEl.style.order = 1;
            if (defEl) defEl.style.order = 2;
        }

        const turnEl = document.getElementById('fw-turn-info');
        if (turnEl) turnEl.innerText = `Turn: ${this.turnCount}/${this.maxTurns}`;
    }
    
    showUnitInfo(unit) {
        const infoEl = document.getElementById('fw-unit-info');
        if (!infoEl) return;
        
        let color = unit.isAttacker ? '#d32f2f' : '#1976d2';
        
        // ★修正: 援軍なら情報パネルの文字色をオレンジか緑にします！
        if (unit.isReinforcement) {
            color = unit.isAttacker ? '#ff9800' : '#4caf50';
        } else if (typeof unit.id === 'string' && unit.id.startsWith('k_')) {
            if (this.units.some(u => u.isPlayer && !u.isAttacker)) {
                color = '#4caf50';
            } else {
                color = '#ff9800';
            }
        }
        
        let typeName = '足軽';
        if (unit.troopType === 'kiba') typeName = '騎馬';
        if (unit.troopType === 'teppo') typeName = '鉄砲';

        // 大名家や国衆の名前を調べる処理
        let clanNameText = "";
        
        if (unit.kunishuId) {
            // 国人衆の場合：国衆の名称を引っ張ってきます
            const kunishu = this.game.kunishuSystem.getKunishu(unit.kunishuId);
            if (kunishu) {
                clanNameText = `${kunishu.getName(this.game)} `; // 「〇〇衆 」という文字を作ります
            }
        } else if (unit.bushoId) {
            // 大名家に所属している武将の場合
            const busho = this.game.getBusho(unit.bushoId);
            if (busho && busho.clan > 0) {
                const clanData = this.game.clans.find(c => c.id === busho.clan);
                if (clanData) {
                    clanNameText = `${clanData.name} `;
                }
            }
        }

        infoEl.innerHTML = `
            <div style="font-weight:bold; color: ${color};">
                ${clanNameText}${unit.name} <span style="font-size:0.8rem; color:#555;">(${typeName})</span>
            </div>
            <div style="font-size:0.9rem; font-weight:bold;">兵士: ${unit.soldiers}</div>
            <div style="font-size:0.8rem; color:#333;">統:${unit.stats.ldr} 武:${unit.stats.str} 智:${unit.stats.int}</div>
        `;
        infoEl.classList.remove('hidden');
    }

    hideUnitInfo() {
        const infoEl = document.getElementById('fw-unit-info');
        if (infoEl) infoEl.classList.add('hidden');
    }

    // ★追加: 攻撃可能かどうかの判定関数（兵科による違いを吸収）
    canAttackTarget(attacker, targetX, targetY) {
        const dist = this.getDistance(attacker.x, attacker.y, targetX, targetY);
        let targetDir = this.getDirection(attacker.x, attacker.y, targetX, targetY);

        if (attacker.troopType === 'teppo') {
            if (attacker.hasMoved) return false; // 鉄砲は移動後攻撃不可
            if (dist < 2 || dist > 3) return false; // 射程は2〜3マス
            if (!this.isFrontDirection(attacker.direction, targetDir)) return false; // 前方3方向のみ
            return true;
        } else {
            if (dist !== 1) return false; // 足軽・騎馬は射程1
            if (!this.isFrontDirection(attacker.direction, targetDir)) return false; // 前方3方向のみ
            return true;
        }
    }

    updateMap() {
        if (!this.mapEl) return;
        this.mapEl.innerHTML = '';

        const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svg.id = 'fw-svg-layer';
        svg.style.position = 'absolute'; 
        svg.style.top = '0'; 
        svg.style.left = '0';
        svg.style.width = '100%'; 
        svg.style.height = '100%';
        svg.style.pointerEvents = 'none'; 
        svg.style.zIndex = '15';
        this.mapEl.appendChild(svg);
        
        const unit = this.turnQueue[0];
        const isPlayerTurn = this.isPlayerTurn();

        for (let x = 0; x < this.cols; x++) {
            for (let row = 0; row < this.rows; row++) {
                const y = (x % 2 === 0) ? row * 2 : row * 2 + 1;
                
                const hex = document.createElement('div');
                hex.className = 'fw-hex';
                hex.style.left = `${x * (this.hexW * 0.75)}px`;
                hex.style.top = `${y * (this.hexH / 2)}px`;
                
                if (isPlayerTurn && unit) {
                    if (this.state === 'PHASE_MOVE' || this.state === 'MOVE_PREVIEW') {
                        if (x === unit.x && y === unit.y) {
                            hex.classList.add('current-pos');
                        } else if (this.reachable && this.reachable[`${x},${y}`]) {
                            hex.classList.add('movable');
                        } else if (this.units.some(u => u.x === x && u.y === y && u.isAttacker === unit.isAttacker)) {
                            // ★修正: 味方がいるマスの水色塗りを、ZOC(コスト)を考慮した正確な判定に変更
                            const enemies = this.units.filter(u => u.isAttacker !== unit.isAttacker);
                            let minStartDist = 999;
                            enemies.forEach(e => {
                                let d = this.getDistance(unit.x, unit.y, e.x, e.y);
                                if (d < minStartDist) minStartDist = d;
                            });
                            
                            let minEnemyDistToTarget = 999;
                            enemies.forEach(e => {
                                let d = this.getDistance(x, y, e.x, e.y);
                                if (d < minEnemyDistToTarget) minEnemyDistToTarget = d;
                            });

                            // その味方マスに入るための必要コスト（敵と隣接していれば2、それ以外は1）
                            let costToEnter = (minEnemyDistToTarget <= 2) ? 2 : 1;
                            
                            if (this.getDistance(unit.x, unit.y, x, y) === 1) {
                                // 自分のすぐ隣にいる味方の場合
                                if (minStartDist === 1) costToEnter = 4;
                                if (costToEnter <= unit.ap) hex.classList.add('movable');
                            } else {
                                // 離れた味方の場合、すでに塗られている隣のマスからコスト計算して届くかチェック
                                let canReach = false;
                                const neighbors = this.getNeighbors(x, y);
                                for (let n of neighbors) {
                                    let key = `${n.x},${n.y}`;
                                    if (this.reachable && this.reachable[key]) {
                                        if (this.reachable[key].cost + costToEnter <= unit.ap) {
                                            canReach = true;
                                            break;
                                        }
                                    }
                                }
                                if (canReach) hex.classList.add('movable');
                            }
                        }
                    } else if (this.state === 'PHASE_DIR') {
                        if (x === unit.x && y === unit.y) {
                            hex.classList.add('current-pos');
                        } else {
                            const targetUnit = this.units.find(u => u.x === x && u.y === y && u.isAttacker !== unit.isAttacker);
                            // ★修正: 攻撃可能範囲かどうかの判定を共通関数化
                            if (targetUnit && unit.ap >= 1 && this.canAttackTarget(unit, x, y)) {
                                hex.classList.add('attackable');
                            } else if (this.getDistance(unit.x, unit.y, x, y) === 1) {
                                let targetDir = this.getDirection(unit.x, unit.y, x, y);
                                let turnCost = this.getTurnCost(unit.direction, targetDir);
                                if (unit.ap >= turnCost) {
                                    hex.classList.add('fw-dir-highlight');
                                }
                            }
                        }
                    } else if (this.state === 'PHASE_ATTACK') {
                        if (x === unit.x && y === unit.y) {
                            hex.classList.add('current-pos');
                        } else {
                            const targetUnit = this.units.find(u => u.x === x && u.y === y && u.isAttacker !== unit.isAttacker);
                            // ★修正: 攻撃可能範囲かどうかの判定を共通関数化
                            if (targetUnit && unit.ap >= 1 && this.canAttackTarget(unit, x, y)) {
                                hex.classList.add('attackable');
                            }
                        }
                    }
                }
                
                hex.onclick = () => this.onHexClick(x, y);
                this.mapEl.appendChild(hex);
            }
        }
        
        if (this.state === 'MOVE_PREVIEW' && this.previewTarget && unit) {
            this.drawPath(this.previewTarget.path, unit.x, unit.y);
            
            let iconSize = 16 + Math.min(Math.floor(unit.soldiers / 1000), 5) * 3;

            const pEl = document.createElement('div');
            pEl.className = `fw-unit ${unit.isAttacker ? 'attacker' : 'defender'} preview`;
            pEl.style.width = `${iconSize}px`; 
            pEl.style.height = `${iconSize}px`;
            pEl.style.left = `${this.previewTarget.x * (this.hexW * 0.75) + (this.hexW - iconSize) / 2}px`;
            pEl.style.top = `${this.previewTarget.y * (this.hexH / 2) + (this.hexH - iconSize) / 2}px`;    
            pEl.style.setProperty('--fw-dir', `${this.previewTarget.direction * 60}deg`);
            pEl.style.pointerEvents = 'none'; 
            
            pEl.innerHTML = '';
            if (unit.isGeneral) {
                pEl.classList.add('general');
            }
            this.mapEl.appendChild(pEl);
        }

        const isAtkPlayer = (Number(this.warState.attacker.ownerClan) === Number(this.game.playerClanId));
        const isDefPlayer = (Number(this.warState.defender.ownerClan) === Number(this.game.playerClanId));
        
        this.units.forEach((u) => {
            let iconSize = 16 + Math.min(Math.floor(u.soldiers / 1000), 5) * 3;

            const uEl = document.createElement('div');
            const isActive = (unit && u.id === unit.id);
            
            // ★ここから差し替え
            let colorClass = u.isAttacker ? 'attacker' : 'defender';
            
            // ★修正: 元の attacker/defender の名前は消さずに、ally (友軍) というタグを後ろに足す！
            if (u.isReinforcement || (typeof u.id === 'string' && u.id.startsWith('k_'))) {
                colorClass += ' ally'; 
            }

            uEl.className = `fw-unit ${colorClass} ${isActive ? 'active' : ''}`;
            if (u.isGeneral) {
                uEl.classList.add('general'); // 総大将なら白枠の設計図を追加
            }
            // ★ここまで差し替え
            
            uEl.style.width = `${iconSize}px`; 
            uEl.style.height = `${iconSize}px`; 
            uEl.style.left = `${u.x * (this.hexW * 0.75) + (this.hexW - iconSize) / 2}px`; 
            uEl.style.top = `${u.y * (this.hexH / 2) + (this.hexH - iconSize) / 2}px`;     
            uEl.style.setProperty('--fw-dir', `${u.direction * 60}deg`);
            uEl.style.pointerEvents = 'none'; 
            uEl.innerHTML = '';
            
            this.mapEl.appendChild(uEl);
        });

        const btnWait = document.getElementById('fw-btn-wait');
        const btnRetreat = document.getElementById('fw-btn-retreat');
        if (isPlayerTurn) {
            if(btnWait) btnWait.classList.remove('hidden');
            if(btnRetreat) btnRetreat.classList.remove('hidden');
        } else {
            if(btnWait) btnWait.classList.add('hidden');
            if(btnRetreat) btnRetreat.classList.add('hidden');
        }
    }

    drawPath(pathArr, startX, startY) {
        const svg = document.getElementById('fw-svg-layer');
        if (!svg || pathArr.length === 0) return;

        let pts = [];
        const getCenter = (hx, hy) => {
            const px = hx * (this.hexW * 0.75) + this.hexW / 2;
            const py = hy * (this.hexH / 2) + this.hexH / 2;
            return `${px},${py}`;
        };
        
        pts.push(getCenter(startX, startY));
        for (let p of pathArr) {
            pts.push(getCenter(p.x, p.y));
        }
        
        const polyline = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
        polyline.setAttribute('points', pts.join(' '));
        polyline.setAttribute('fill', 'none');
        polyline.setAttribute('stroke', '#ffff00');
        polyline.setAttribute('stroke-width', '4');
        polyline.setAttribute('stroke-dasharray', '5,5');
        svg.appendChild(polyline);
    }

    getDistance(x1, y1, x2, y2) {
        const dx = Math.abs(x1 - x2);
        const dy = Math.abs(y1 - y2);
        return dx + Math.max(0, (dy - dx) / 2);
    }

    getNeighbors(x, y) {
        const list = [];
        const dirs = [
            {dx: 0, dy: -2}, {dx: 1, dy: -1}, {dx: 1, dy: 1},
            {dx: 0, dy: 2}, {dx: -1, dy: 1}, {dx: -1, dy: -1}
        ];
        for (const d of dirs) {
            const nx = x + d.dx;
            const ny = y + d.dy;
            if (nx >= 0 && nx < this.cols && ny >= 0 && ny < this.rows * 2) {
                list.push({x: nx, y: ny});
            }
        }
        return list;
    }

    getDirection(fromX, fromY, toX, toY) {
        const dirs = [
            {dx: 0, dy: -2, dir: 0}, {dx: 1, dy: -1, dir: 1}, {dx: 1, dy: 1, dir: 2},
            {dx: 0, dy: 2, dir: 3}, {dx: -1, dy: 1, dir: 4}, {dx: -1, dy: -1, dir: 5}
        ];
        for(let d of dirs) {
            if (toX - fromX === d.dx && toY - fromY === d.dy) return d.dir;
        }
        // 距離が離れている場合の方向計算（簡易版）
        let bestDir = 0;
        let maxDot = -Infinity;
        const vecX = toX - fromX;
        const vecY = toY - fromY;
        const mag = Math.sqrt(vecX*vecX + vecY*vecY);
        if (mag === 0) return 0;
        
        for(let d of dirs) {
            const dot = ((d.dx/Math.sqrt(d.dx*d.dx + d.dy*d.dy)) * (vecX/mag)) + ((d.dy/Math.sqrt(d.dx*d.dx + d.dy*d.dy)) * (vecY/mag));
            if (dot > maxDot) {
                maxDot = dot;
                bestDir = d.dir;
            }
        }
        return bestDir;
    }

    getTurnCost(curDir, targetDir) {
        if (curDir === targetDir) return 0; 
        let diff = Math.abs(curDir - targetDir);
        diff = Math.min(diff, 6 - diff); 
        if (diff === 1) return 1;
        return 2;
    }

    isFrontDirection(curDir, targetDir) {
        let diff = Math.abs(curDir - targetDir);
        diff = Math.min(diff, 6 - diff);
        return diff <= 1;
    }

    getCost(x, y, enemies, allies, isFirstStep, startDist) {
        if (enemies.some(e => e.x === x && e.y === y)) return 999;
        if (allies.some(a => a.x === x && a.y === y)) return 999;
        
        let minEnemyDist = 999;
        enemies.forEach(e => {
            let d = this.getDistance(x, y, e.x, e.y);
            if (d < minEnemyDist) minEnemyDist = d;
        });

        if (isFirstStep && startDist === 1) return 4;
        if (minEnemyDist <= 2) return 2; 
        return 1;
    }

    findPaths(unit, maxAP) {
        let queue = [{x: unit.x, y: unit.y, cost: 0, path: [], steps: 0}];
        let visited = {};
        visited[`${unit.x},${unit.y}`] = { cost: 0, path: [] };
        
        const enemies = this.units.filter(u => u.isAttacker !== unit.isAttacker);
        const allies = this.units.filter(u => u.isAttacker === unit.isAttacker && u.id !== unit.id);
        
        let minStartDist = 999;
        enemies.forEach(e => {
            let d = this.getDistance(unit.x, unit.y, e.x, e.y);
            if (d < minStartDist) minStartDist = d;
        });
        
        while(queue.length > 0) {
            queue.sort((a,b) => a.cost - b.cost);
            let cur = queue.shift();
            
            let neighbors = this.getNeighbors(cur.x, cur.y);
            for(let n of neighbors) {
                let isFirstStep = (cur.steps === 0);
                let c = this.getCost(n.x, n.y, enemies, allies, isFirstStep, minStartDist);
                let nextCost = cur.cost + c;
                
                if (nextCost <= maxAP) {
                    let key = `${n.x},${n.y}`;
                    if (!visited[key] || visited[key].cost > nextCost) {
                        let newPath = [...cur.path, {x: n.x, y: n.y}];
                        visited[key] = { cost: nextCost, path: newPath };
                        queue.push({x: n.x, y: n.y, cost: nextCost, path: newPath, steps: cur.steps + 1});
                    }
                }
            }
        }
        return visited;
    }
    
    // ==============================================
    // ★追加：AI専用のカーナビ機能（目的地までの最短ルートを探す）
    // ==============================================
    findAStarPath(unit, targetX, targetY) {
        let startNode = { x: unit.x, y: unit.y, g: 0, h: this.getDistance(unit.x, unit.y, targetX, targetY), parent: null };
        startNode.f = startNode.g + startNode.h;

        let openList = [startNode];
        let closedList = {};
        
        const enemies = this.units.filter(u => u.isAttacker !== unit.isAttacker);
        const allies = this.units.filter(u => u.isAttacker === unit.isAttacker && u.id !== unit.id);

        while (openList.length > 0) {
            openList.sort((a, b) => a.f - b.f);
            let currentNode = openList.shift();
            let currentKey = `${currentNode.x},${currentNode.y}`;
            
            closedList[currentKey] = true;

            // 目的地（敵のいるマス）に着いたら、ルート完成！
            if (currentNode.x === targetX && currentNode.y === targetY) {
                let path = [];
                let curr = currentNode.parent; // 敵のいるマス自体には乗れないので１個手前から
                while (curr && curr.parent) { 
                    path.unshift({x: curr.x, y: curr.y, cost: curr.g - curr.parent.g});
                    curr = curr.parent;
                }
                return path; // 見つけたルート（手順書）を返す
            }

            let neighbors = this.getNeighbors(currentNode.x, currentNode.y);
            for (let n of neighbors) {
                let neighborKey = `${n.x},${n.y}`;
                if (closedList[neighborKey]) continue;

                // 敵のマス自体はゴール判定のために「コスト1」として計算
                let c = 1;
                if (n.x !== targetX || n.y !== targetY) {
                    c = this.getCost(n.x, n.y, enemies, allies, false, 999);
                    if (c >= 999) continue; // 味方がいるマスなどは通れない
                }

                let gCost = currentNode.g + c;
                let hCost = this.getDistance(n.x, n.y, targetX, targetY);
                let fCost = gCost + hCost;

                let existingNode = openList.find(node => node.x === n.x && node.y === n.y);
                if (!existingNode) {
                    openList.push({ x: n.x, y: n.y, g: gCost, h: hCost, f: fCost, parent: currentNode });
                } else if (gCost < existingNode.g) {
                    existingNode.g = gCost;
                    existingNode.f = fCost;
                    existingNode.parent = currentNode;
                }
            }
            // 探索が長引きすぎたら諦める（フリーズ防止）
            if(Object.keys(closedList).length > 200) return null;
        }
        return null; // 道が見つからなかった
    }

    isPlayerTurn() {
        if (this.turnQueue.length === 0) return false;
        return this.turnQueue[0].isPlayer;
    }

    startTurn() {
        if (!this.active) return;
        
        this.units.forEach(u => {
            u.hasActionDone = false;
            u.hasMoved = false; // ★ ターン開始時に移動フラグをリセット
            u.ap = u.mobility;
        });
        
        this.turnQueue = [...this.units].sort((a, b) => {
            const speedA = a.stats.ldr + a.stats.str;
            const speedB = b.stats.ldr + b.stats.str;
            return speedB - speedA;
        });

        this.processQueue();
    }

    processQueue() {
        if (!this.active) return;
        
        if (this.turnQueue.length === 0) {
            this.turnCount++;
            this.consumeRice();
            if (this.checkEndCondition()) return;
            this.startTurn();
            return;
        }

        const unit = this.turnQueue[0];
        
        if (!this.units.find(u => u.id === unit.id)) {
            this.nextPhaseTurn();
            return;
        }

        this.turnBackup = {
            x: unit.x,
            y: unit.y,
            direction: unit.direction,
            ap: unit.ap
        };

        this.state = 'IDLE';
        this.reachable = null;
        this.previewTarget = null;

        const isPlayerInvolved = this.units.some(u => u.isPlayer);

        this.showUnitInfo(unit);
        if (isPlayerInvolved) {
            setTimeout(() => this.scrollToUnit(unit), 100);
        }

        if (unit.isPlayer) {
            this.state = 'PHASE_MOVE';
            this.reachable = this.findPaths(unit, unit.ap);
            if (isPlayerInvolved) {
                this.updateMap();
                this.updateStatus();
                this.log(`【${unit.name}隊のターン】移動先を選択`);
            }
        } else {
            if (isPlayerInvolved) {
                this.updateMap();
                this.updateStatus();
            }
            setTimeout(() => this.processAITurn(), 600);
        }
    }

    nextPhase() {
        const unit = this.turnQueue[0];
        if (this.state === 'PHASE_MOVE' || this.state === 'MOVE_PREVIEW') {
            this.previewTarget = null;
            this.reachable = null;
            this.state = 'PHASE_DIR';
            
            if (unit.ap <= 0) {
                this.nextPhase();
            } else {
                this.updateMap();
                this.updateStatus();
                if (this.isPlayerTurn()) this.log(`向き、または攻撃対象を選択`);
            }
        } else if (this.state === 'PHASE_DIR') {
            this.state = 'PHASE_ATTACK';
            
            if (unit.ap <= 0) {
                this.nextPhase();
            } else {
                // ★追加: 攻撃可能な敵が1人もいない場合は、攻撃フェイズをスキップして即終了！
                let canAttackAny = false;
                const enemies = this.units.filter(u => u.isAttacker !== unit.isAttacker);
                for (let e of enemies) {
                    if (this.canAttackTarget(unit, e.x, e.y)) {
                        canAttackAny = true;
                        break;
                    }
                }

                if (!canAttackAny) {
                    this.nextPhase(); // 誰も攻撃できないので、次の処理（ターン終了）へ進む
                } else {
                    this.updateMap();
                    this.updateStatus();
                    if (this.isPlayerTurn()) this.log(`攻撃対象を選択`);
                }
            }
        } else if (this.state === 'PHASE_ATTACK') {
            unit.hasActionDone = true;
            this.state = 'IDLE';
            this.updateMap();
            this.updateStatus();
            setTimeout(() => this.nextPhaseTurn(), 300);
        }
    }

    nextPhaseTurn() {
        if (this.checkEndCondition()) return;
        this.turnQueue.shift();
        this.processQueue();
    }

    consumeRice() {
        let atkSoldiers = 0, defSoldiers = 0;
        this.units.forEach(u => {
            if (u.isAttacker) atkSoldiers += u.soldiers;
            else defSoldiers += u.soldiers;
        });

        const consumeRate = (window.WarParams.War.RiceConsumptionAtk || 0.1) * 0.5;
        
        const atkCons = Math.floor(atkSoldiers * consumeRate);
        const defCons = Math.floor(defSoldiers * consumeRate);
        
        this.atkRice = Math.max(0, this.atkRice - atkCons);
        this.defRice = Math.max(0, this.defRice - defCons);
    }

    checkEndCondition() {
        let atkAlive = false, defAlive = false;
        let atkGeneralAlive = false, defGeneralAlive = false;

        this.units.forEach(u => {
            if (u.isAttacker) {
                atkAlive = true;
                if (u.isGeneral) atkGeneralAlive = true;
            } else {
                defAlive = true;
                if (u.isGeneral) defGeneralAlive = true;
            }
        });

        const isAtkPlayer = (Number(this.warState.attacker.ownerClan) === Number(this.game.playerClanId));
        const isDefPlayer = (Number(this.warState.defender.ownerClan) === Number(this.game.playerClanId));
        const enemyName = isAtkPlayer ? this.warState.defender.name + "軍" : (isDefPlayer ? this.warState.attacker.name + "軍" : "敵軍");

        if (!atkAlive || !atkGeneralAlive) {
            if (isAtkPlayer) this.log(`総大将が討ち取られ、我が軍は敗北しました……`);
            else if (isDefPlayer) this.log(`敵の総大将を撃破しました！`);
            else this.log(`攻撃軍の総大将が敗走した！`);
            this.endFieldWar('attacker_lose');
            return true;
        }
        if (!defAlive || !defGeneralAlive) {
            if (isAtkPlayer) this.log(`敵の総大将を討ち取りました！`);
            else if (isDefPlayer) this.log(`総大将が討ち取られ、我が軍は敗北しました……`);
            else this.log(`守備軍の総大将が敗走した！`);
            this.endFieldWar('attacker_win');
            return true;
        }
        if (this.atkRice <= 0) {
            if (isAtkPlayer) this.log(`兵糧が尽き、これ以上の行軍は不可能です……`);
            else if (isDefPlayer) this.log(`${enemyName}は兵糧が尽き、撤退していきました！`);
            else this.log(`攻撃軍の兵糧が尽き、撤退を余儀なくされた！`);
            this.endFieldWar('attacker_lose');
            return true;
        }
        if (this.defRice <= 0) {
            if (isAtkPlayer) this.log(`${enemyName}の兵糧が尽き、城へ敗走していきました！`);
            else if (isDefPlayer) this.log(`兵糧が底を突き、戦線を維持できません……`);
            else this.log(`守備軍の兵糧が尽き、城へ敗走した！`);
            this.endFieldWar('attacker_win');
            return true;
        }
        if (this.turnCount > this.maxTurns) {
            this.log(`野戦では決着がつかず、舞台は籠城戦へと移る！`);
            this.endFieldWar('draw_to_siege');
            return true;
        }
        return false;
    }
    
    endFieldWar(resultType) {
        this.active = false;
        
        let atkSoldiers = 0, defSoldiers = 0;
        let atkHorses = 0, atkGuns = 0;
        let defHorses = 0, defGuns = 0;

        if (this.warState.atkAssignments) {
            this.warState.atkAssignments.forEach(a => a.soldiers = 0);
        }
        if (this.warState.defAssignments) {
            this.warState.defAssignments.forEach(a => a.soldiers = 0);
        }

        this.units.forEach(u => {
            if (u.isAttacker) {
                atkSoldiers += u.soldiers;
                if (u.troopType === 'kiba') atkHorses += u.soldiers;
                if (u.troopType === 'teppo') atkGuns += u.soldiers;
                
                if (this.warState.atkAssignments) {
                    const assign = this.warState.atkAssignments.find(a => a.busho.id === u.bushoId);
                    if (assign) assign.soldiers = u.soldiers;
                }
            } else {
                if (typeof u.id === 'string' && !u.id.startsWith('k_')) {
                    defSoldiers += u.soldiers;
                    if (u.troopType === 'kiba') defHorses += u.soldiers;
                    if (u.troopType === 'teppo') defGuns += u.soldiers;
                    
                    if (this.warState.defAssignments) {
                        const assign = this.warState.defAssignments.find(a => a.busho.id === u.bushoId);
                        if (assign) assign.soldiers = u.soldiers;
                    }
                }
            }
        });
        
        this.warState.attacker.soldiers = atkSoldiers;
        this.warState.attacker.rice = this.atkRice;
        this.warState.attacker.horses = atkHorses;
        this.warState.attacker.guns = atkGuns;

        this.warState.defender.fieldSoldiers = defSoldiers;
        this.warState.defFieldRice = this.defRice;
        this.warState.defender.fieldHorses = defHorses;
        this.warState.defender.fieldGuns = defGuns;

        const isPlayerInvolved = this.units.some(u => u.isPlayer);
        
        if (isPlayerInvolved) {
            setTimeout(() => {
                if (this.modal) this.modal.classList.add('hidden');
                if (this.onComplete) this.onComplete(resultType);
            }, 1500);
        } else {
            if (this.modal) this.modal.classList.add('hidden');
            if (this.onComplete) this.onComplete(resultType);
        }
    }

    onHexClick(x, y) {
        if (!this.active) return;
        
        const clickedUnit = this.units.find(u => u.x === x && u.y === y);
        const currentUnit = this.turnQueue[0];

        if (clickedUnit) {
            this.showUnitInfo(clickedUnit);
        } else {
            if (currentUnit) this.showUnitInfo(currentUnit);
            else this.hideUnitInfo();
        }

        if (!this.isPlayerTurn()) return;
        
        const unit = this.turnQueue[0];

        if (this.state === 'PHASE_MOVE') {
            if (x === unit.x && y === unit.y) {
                this.nextPhase();
                return;
            }

            let key = `${x},${y}`;
			if (this.reachable && this.reachable[key]) {
			    let path = this.reachable[key].path;
			    let previewDir = unit.direction; 
			    if (path && path.length > 0) {
			        let fromX = (path.length > 1) ? path[path.length - 2].x : unit.x;
			        let fromY = (path.length > 1) ? path[path.length - 2].y : unit.y;
			        previewDir = this.getDirection(fromX, fromY, x, y);
			    }
			    this.previewTarget = {x: x, y: y, path: path, cost: this.reachable[key].cost, direction: previewDir};
			    this.state = 'MOVE_PREVIEW';
			    this.updateMap();
			} else {
                this.cancelAction();
                if(clickedUnit) this.showUnitInfo(clickedUnit);
            }

        } else if (this.state === 'MOVE_PREVIEW') {
            if (x === unit.x && y === unit.y) {
                this.nextPhase();
                return;
            }

			if (this.previewTarget && x === this.previewTarget.x && y === this.previewTarget.y) {
			    let path = this.previewTarget.path;
			    if (path && path.length > 0) {
			        let fromX = unit.x;
			        let fromY = unit.y;
			        if (path.length > 1) {
			            let prevStep = path[path.length - 2];
			            fromX = prevStep.x;
			            fromY = prevStep.y;
			        }
			        unit.direction = this.getDirection(fromX, fromY, x, y);
			    }

			    unit.ap -= this.previewTarget.cost;
			    unit.x = x;
			    unit.y = y;
                unit.hasMoved = true; // ★ 移動したことを記録
			    this.log(`${unit.name}隊が移動（向きも変更）。`);
			    this.nextPhase();
			} else {
                let key = `${x},${y}`;
				if (this.reachable && this.reachable[key]) {
				    let path = this.reachable[key].path;
				    let previewDir = unit.direction;
				    if (path && path.length > 0) {
				        let fromX = (path.length > 1) ? path[path.length - 2].x : unit.x;
				        let fromY = (path.length > 1) ? path[path.length - 2].y : unit.y;
				        previewDir = this.getDirection(fromX, fromY, x, y);
				    }
				    this.previewTarget = {x: x, y: y, path: path, cost: this.reachable[key].cost, direction: previewDir};
				    this.updateMap();
				} else {
                    this.cancelAction();
                    if(clickedUnit) this.showUnitInfo(clickedUnit);
                }
            }
        } else if (this.state === 'PHASE_DIR') {
            if (x === unit.x && y === unit.y) {
                this.nextPhase();
                return;
            }

            const targetUnit = this.units.find(u => u.x === x && u.y === y && u.isAttacker !== unit.isAttacker);
            
            // ★修正: 攻撃可能範囲なら攻撃
            if (targetUnit && this.canAttackTarget(unit, x, y)) {
                if (unit.ap >= 1) {
                    unit.ap -= 1;
                    this.executeAttack(unit, targetUnit);
                } else {
                    this.cancelAction();
                    if(clickedUnit) this.showUnitInfo(clickedUnit);
                }
                return;
            }

            // それ以外は振り向き処理
            if (this.getDistance(unit.x, unit.y, x, y) === 1) {
                let targetDir = this.getDirection(unit.x, unit.y, x, y);
                let turnCost = this.getTurnCost(unit.direction, targetDir);
                
                if (unit.ap >= turnCost) {
                    if (turnCost > 0) {
                        unit.ap -= turnCost;
                        unit.direction = targetDir;
                        this.log(`${unit.name}隊が向きを変更。`);
                    }
                    this.nextPhase();
                } else {
                    this.cancelAction();
                    if(clickedUnit) this.showUnitInfo(clickedUnit);
                }
            } else {
                this.cancelAction();
                if(clickedUnit) this.showUnitInfo(clickedUnit);
            }
        } else if (this.state === 'PHASE_ATTACK') {
            if (x === unit.x && y === unit.y) {
                this.nextPhase();
                return;
            }

            const targetUnit = this.units.find(u => u.x === x && u.y === y && u.isAttacker !== unit.isAttacker);
            // ★修正: 攻撃可能範囲なら攻撃
            if (targetUnit && unit.ap >= 1 && this.canAttackTarget(unit, x, y)) {
                unit.ap -= 1;
                this.executeAttack(unit, targetUnit);
            } else {
                this.cancelAction();
                if(clickedUnit) this.showUnitInfo(clickedUnit);
            }
        }
    }

    // ★修正: 兵科や攻撃方向によるダメージ倍率を計算
    getDamageMultipliers(attacker, defender) {
        let atkDirIndex = this.getDirection(attacker.x, attacker.y, defender.x, defender.y);
        let defDirIndex = defender.direction;
        
        // 防御側から見た攻撃の飛んできた方向とのズレ（正面を0、背後を3になるように修正）
        let oppositeAtkDir = (atkDirIndex + 3) % 6;
        let defToAtkDiff = Math.abs(defDirIndex - oppositeAtkDir);
        defToAtkDiff = Math.min(defToAtkDiff, 6 - defToAtkDiff); 
        
        // ★追加: 鉄砲隊の攻撃は相手の向きに関係なく常に「正面扱い（0）」にする
        if (attacker.troopType === 'teppo') {
            defToAtkDiff = 0;
        }

        // 攻撃側から見たターゲットの方向と自身の向きとのズレ
        let atkToDefDiff = Math.abs(attacker.direction - atkDirIndex);
        atkToDefDiff = Math.min(atkToDefDiff, 6 - atkToDefDiff);

        let atkMult = 1.0;
        let defMult = 1.0; // 防御側の被ダメ補正

        // 攻撃側の兵科による与ダメ補正
        if (attacker.troopType === 'kiba') {
            if (atkToDefDiff === 0) atkMult = 1.2; // 正面
            else if (atkToDefDiff === 1) atkMult = 1.1; // 前斜め
        } else if (attacker.troopType === 'teppo') {
            atkMult = 1.2; // 鉄砲は常に1.2倍
        } else {
            // 足軽などは向きのみで背後・側面ボーナス
            if (defToAtkDiff === 3) atkMult = 1.5; // 背後（3に変更）
            else if (defToAtkDiff === 2) atkMult = 1.2; // 側面（2に変更）
        }

        // 防御側の兵科による被ダメ補正
        if (defender.troopType === 'kiba') {
            if (defToAtkDiff === 2 || defToAtkDiff === 3) defMult = 1.1; // 側面・背面の被ダメ増
        } else if (defender.troopType === 'teppo') {
            defMult = 1.3; // 鉄砲は全方向から被ダメ増
        }

        return { attack: atkMult, defense: defMult, defToAtkDiff: defToAtkDiff };
    }

    executeAttack(attacker, defender) {
        // 基本ダメージ計算
        const result = WarSystem.calcWarDamage(
            attacker.stats, defender.stats,
            attacker.soldiers, defender.soldiers,
            0, 
            this.atkMorale, this.defTraining,
            'charge'
        );

        // ★ 兵科による倍率を計算
        const mults = this.getDamageMultipliers(attacker, defender);
        
        let dmgToDef = Math.floor(result.soldierDmg * mults.attack * mults.defense);
        // 兵数以上のダメージは受けない
        dmgToDef = Math.min(defender.soldiers, dmgToDef);

        let dmgToAtk = 0;
        // 反撃は距離1のときのみ発生
        const dist = this.getDistance(attacker.x, attacker.y, defender.x, defender.y);
        if (dist === 1) {
            // 反撃側（defender）の与ダメ補正を計算（立場を逆転）
            const counterMults = this.getDamageMultipliers(defender, attacker);
            dmgToAtk = Math.floor(result.counterDmg * counterMults.attack * counterMults.defense);
            dmgToAtk = Math.min(attacker.soldiers, dmgToAtk);
        }

        defender.soldiers -= dmgToDef;
        attacker.soldiers -= dmgToAtk;
        
        let dirMsg = "";
        if (mults.defToAtkDiff === 3) dirMsg = "（背後からの強襲！）";
        else if (mults.defToAtkDiff === 2) dirMsg = "（側面からの攻撃！）";
        
        let atkWeapon = "攻撃";
        if (attacker.troopType === 'teppo') atkWeapon = "射撃";
        else if (attacker.troopType === 'kiba') atkWeapon = "突撃";

        let counterMsg = (dmgToAtk > 0) ? ` 反撃で${dmgToAtk}の被害！` : ``;

        this.log(`${attacker.name}隊の${atkWeapon}！${dirMsg} 敵に${dmgToDef}の損害！${counterMsg}`);

        if (defender.soldiers <= 0) {
            this.log(`${defender.name}隊が壊滅した！`);
            this.units = this.units.filter(u => u.id !== defender.id);
        }
        if (attacker.soldiers <= 0) {
            this.log(`${attacker.name}隊が壊滅した！`);
            this.units = this.units.filter(u => u.id !== attacker.id);
        }
        
        attacker.hasActionDone = true;
        this.state = 'IDLE';
        this.updateMap();
        this.updateStatus();
        
        setTimeout(() => {
            this.nextPhaseTurn();
        }, 800);
    }

    async processAITurn() {
        if (!this.active) return;
        const unit = this.turnQueue[0];
        const enemies = this.units.filter(u => u.isAttacker !== unit.isAttacker);
        
        if (enemies.length === 0) {
            this.nextPhaseTurn();
            return;
        }

        const isPlayerInvolved = this.units.some(u => u.isPlayer);
        if (isPlayerInvolved) {
            await new Promise(r => setTimeout(r, 600)); 
        }

        // 最も近い敵を探す
        let targetEnemy = null;
        let minDist = 999;
        enemies.forEach(e => {
            let d = this.getDistance(unit.x, unit.y, e.x, e.y);
            if (d < minDist) { minDist = d; targetEnemy = e; }
        });

        // 戦力差撤退判定
        let allySoldiers = 0, enemySoldiers = 0;
        this.units.forEach(u => {
            if (u.isAttacker === unit.isAttacker) allySoldiers += u.soldiers;
            else enemySoldiers += u.soldiers;
        });
        
        if (allySoldiers < enemySoldiers * 0.2) {
            if (isPlayerInvolved) {
                if (unit.isAttacker) this.log(`${unit.name}軍は攻略を諦め、引き揚げていきました！`);
                else this.log(`${unit.name}軍は不利を悟り、戦場から離脱しました！`);
            }
            this.endFieldWar(unit.isAttacker ? 'attacker_retreat' : 'defender_retreat');
            return;
        }

        let dist = this.getDistance(unit.x, unit.y, targetEnemy.x, targetEnemy.y);

        // ★追加：鉄砲隊だけになり、敵にピッタリくっつかれたら撤退する！
        if (unit.troopType === 'teppo') {
            const allies = this.units.filter(u => u.isAttacker === unit.isAttacker && u.id !== unit.id);
            if (allies.length === 0 && dist === 1) {
                if (isPlayerInvolved) {
                    this.log(`${unit.name}は不利を悟り、戦場から離脱しました！`);
                }
                this.endFieldWar(unit.isAttacker ? 'attacker_retreat' : 'defender_retreat');
                return;
            }
        }
        
        let shouldMove = true;
        let isFleeing = false; // ★追加：逃げるモードのフラグ
        
        if (unit.troopType === 'teppo') {
            if (dist === 1) {
                // 距離1（敵が直接隣り合っている！）
                // 間に盾はいない大ピンチなので、無条件で真っ直ぐ逃げる！
                shouldMove = true;
                isFleeing = true;
            } else if (dist >= 2 && dist <= 3) {
                // 距離2〜3（射程内）
                // 盾がいてもいなくても、安全な距離なので移動せずにその場から撃つ！
                shouldMove = false;
            } else {
                // 遠すぎる場合は近づく
                shouldMove = true;
                isFleeing = false;
            }
        } else {
            if (dist === 1) {
                shouldMove = false;
            }
        }
        
        if (shouldMove) {
            let bestTarget = null;
            
            if (isFleeing) {
                // ★ 逃走モード：敵から見て自分と真逆の方向へ「真っ直ぐ下がる」マスを探す
                let reachable = this.findPaths(unit, unit.ap); 
                let bestScore = -9999;
                
                // 敵から見た自分の方向（この方向に真っ直ぐ逃げたい！）
                let idealDir = this.getDirection(targetEnemy.x, targetEnemy.y, unit.x, unit.y);

                for (let key in reachable) {
                    let parts = key.split(',');
                    let nx = parseInt(parts[0]);
                    let ny = parseInt(parts[1]);
                    
                    if (nx === unit.x && ny === unit.y) continue; 

                    let dToEnemy = this.getDistance(nx, ny, targetEnemy.x, targetEnemy.y);
                    
                    // 今より距離が縮まらない場所を探す
                    if (dToEnemy >= dist) {
                        // 距離が離れるほど高得点
                        let score = dToEnemy * 100;
                        
                        // 敵からそのマスを見た方向が、真っ直ぐ後ろ（idealDir）とどれくらいズレているか計算
                        let dirToCell = this.getDirection(targetEnemy.x, targetEnemy.y, nx, ny);
                        let dirDiff = Math.abs(idealDir - dirToCell);
                        dirDiff = Math.min(dirDiff, 6 - dirDiff);
                        
                        // ズレるほど減点（真っ直ぐ下がるのを優先させる）
                        score -= dirDiff * 30;

                        // 他の敵からも遠い方が良い
                        enemies.forEach(e => {
                            if (e.id !== targetEnemy.id) {
                                score += this.getDistance(nx, ny, e.x, e.y) * 5;
                            }
                        });
                        
                        if (score > bestScore) {
                            bestScore = score;
                            bestTarget = { x: nx, y: ny, cost: reachable[key].cost, path: reachable[key].path };
                        }
                    }
                }
            } else {
                // ★ 通常モード：カーナビを使って敵に近づく
                let path = this.findAStarPath(unit, targetEnemy.x, targetEnemy.y);
                
                if (path && path.length > 0) {
                    let accumulatedCost = 0;
                    let availableAP = unit.ap - 1; // 攻撃用に1AP残す
                    let stopAtDist = (unit.troopType === 'teppo') ? 2 : 1; // 鉄砲は距離2で止まる

                    // カーナビのルートに沿って、APの限界まで進むマスを探す
                    for (let i = 0; i < path.length; i++) {
                        let step = path[i];
                        accumulatedCost += step.cost;
                        
                        if (accumulatedCost <= availableAP) {
                            let dToEnemy = this.getDistance(step.x, step.y, targetEnemy.x, targetEnemy.y);
                            bestTarget = { x: step.x, y: step.y, cost: accumulatedCost, path: path.slice(0, i + 1) };
                            
                            if (dToEnemy === stopAtDist) break; // 理想の距離に着いたらストップ

                            // 盾役の陣形（味方に鉄砲隊がいるなら、鉄砲隊の目の前でストップして壁になる！）
                            if (unit.troopType !== 'teppo') {
                                const friendlyTeppos = this.units.filter(u => u.isAttacker === unit.isAttacker && u.troopType === 'teppo');
                                if (friendlyTeppos.length > 0) {
                                    let myTeppo = friendlyTeppos[0]; // 最初の鉄砲隊を守る
                                    let dToTeppo = this.getDistance(step.x, step.y, myTeppo.x, myTeppo.y);
                                    let teppoToEnemy = this.getDistance(myTeppo.x, myTeppo.y, targetEnemy.x, targetEnemy.y);
                                    
                                    // 鉄砲隊のすぐ隣(距離1)で、かつ鉄砲隊よりも敵に近い位置なら、そこをベストポジションとして止まる
                                    if (dToTeppo === 1 && dToEnemy < teppoToEnemy) {
                                        break;
                                    }
                                }
                            }
                        } else {
                            break; // AP切れ
                        }
                    }
                }
                
                // もし完全に囲まれるなどしてカーナビで道が見つからなかったら、今までの「とりあえず近くに」を使う
                if (!bestTarget) {
                    let reachable = this.findPaths(unit, unit.ap - 1); 
                    let minMoveDist = 999;
                    
                    for (let key in reachable) {
                        let parts = key.split(',');
                        let nx = parseInt(parts[0]);
                        let ny = parseInt(parts[1]);
                        let d = this.getDistance(nx, ny, targetEnemy.x, targetEnemy.y);
                        
                        if (unit.troopType === 'teppo') {
                            let score = Math.abs(d - 2); 
                            if (score < minMoveDist) {
                                minMoveDist = score;
                                bestTarget = {x: nx, y: ny, cost: reachable[key].cost, path: reachable[key].path};
                            }
                        } else {
                            if (d < minMoveDist) {
                                minMoveDist = d;
                                bestTarget = {x: nx, y: ny, cost: reachable[key].cost, path: reachable[key].path};
                            }
                        }
                    }
                }
            }

            if (bestTarget && (bestTarget.x !== unit.x || bestTarget.y !== unit.y)) {
			    let path = bestTarget.path;
			    if (path && path.length > 0) {
			        let fromX = unit.x;
			        let fromY = unit.y;
			        if (path.length > 1) {
			            let prevStep = path[path.length - 2];
			            fromX = prevStep.x;
			            fromY = prevStep.y;
			        }
			        unit.direction = this.getDirection(fromX, fromY, bestTarget.x, bestTarget.y);
			    }

			    unit.ap -= bestTarget.cost;
			    unit.x = bestTarget.x;
			    unit.y = bestTarget.y;
                unit.hasMoved = true;
			    if (isPlayerInvolved) {
			        this.log(`${unit.name}隊が${isFleeing ? '後退' : '前進'}。`);
			        this.updateMap();
			        this.updateStatus();
			        await new Promise(r => setTimeout(r, 400));
			    }
			}
        }

        dist = this.getDistance(unit.x, unit.y, targetEnemy.x, targetEnemy.y);
        
        // 向き直り処理（攻撃可能な相手がいるならそちらを向く）
        if (this.canAttackTarget({...unit, direction: this.getDirection(unit.x, unit.y, targetEnemy.x, targetEnemy.y)}, targetEnemy.x, targetEnemy.y)) {
            let targetDir = this.getDirection(unit.x, unit.y, targetEnemy.x, targetEnemy.y);
            let turnCost = this.getTurnCost(unit.direction, targetDir);
            
            if (unit.ap >= turnCost && turnCost > 0) {
                unit.ap -= turnCost;
                unit.direction = targetDir;
                if (isPlayerInvolved) {
                    this.log(`${unit.name}隊が敵に向き直った。`);
                    this.updateMap();
                    this.updateStatus();
                    await new Promise(r => setTimeout(r, 300));
                }
            }
        }

        // 攻撃処理
        if (this.canAttackTarget(unit, targetEnemy.x, targetEnemy.y) && unit.ap >= 1) {
            unit.ap -= 1;
            this.executeAttack(unit, targetEnemy);
            return; 
        }

        if (isPlayerInvolved) this.log(`${unit.name}隊は待機した。`);
        this.nextPhaseTurn();
    }
}

window.FieldWarManager = FieldWarManager;