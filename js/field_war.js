/**
 * field_war.js
 * HEX式 野戦システム
 * 責務: 野戦マップの描画、ターンの制御、HEXでの移動と戦闘計算
 * 修正: 操作不能バグ修正(pointer-events対応)、大将アイコン修正(凸+★)、コード圧縮解除版
 */

class FieldWarManager {
    constructor(game) {
        this.game = game;
        this.active = false;
        
        // HEXサイズとマップのグリッド設定
        this.hexW = 30;
        this.hexH = 26;
        // 横30マス × 縦20マスのフィールド空間
        this.cols = 30;
        this.rows = 20;

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

        const pid = Number(this.game.playerClanId);
        const isAtkPlayer = (Number(warState.attacker.ownerClan) === pid);
        const isDefPlayer = (Number(warState.defender.ownerClan) === pid);
        const isPlayerInvolved = isAtkPlayer || isDefPlayer;

        // 配置座標の決定
        let atkX = 5, defX = 25;
        if (isDefPlayer && !isAtkPlayer) {
            atkX = 25;
            defX = 5;
        }

        this.units = [];
        const yPositions = [9, 7, 11, 5, 13]; // 大将を中央(10)に配置し、他を上下に散らす

        // 攻撃側部隊の生成
        if (warState.atkAssignments) {
            warState.atkAssignments.forEach((assign, index) => {
                if (assign.soldiers <= 0) return;
                this.units.push({
                    id: `atk_${index}`,
                    name: assign.busho.name,
                    isAttacker: true,
                    isPlayer: isAtkPlayer,
                    isGeneral: index === 0, // 0番目が総大将
                    x: atkX, 
                    y: yPositions[index % 5],
                    direction: isAtkPlayer ? 1 : 4,
                    mobility: 4, 
                    ap: 4,
                    soldiers: assign.soldiers,
                    stats: WarSystem.calcUnitStats([assign.busho]),
                    hasActionDone: false
                });
            });
        }

        // 守備側部隊の生成
        if (warState.defAssignments) {
            warState.defAssignments.forEach((assign, index) => {
                if (assign.soldiers <= 0) return;
                this.units.push({
                    id: `def_${index}`,
                    name: assign.busho.name,
                    isAttacker: false,
                    isPlayer: isDefPlayer,
                    isGeneral: index === 0,
                    x: defX, 
                    y: yPositions[index % 5],
                    direction: isDefPlayer ? 1 : 4,
                    mobility: 4, 
                    ap: 4,
                    soldiers: assign.soldiers,
                    stats: WarSystem.calcUnitStats([assign.busho]),
                    hasActionDone: false
                });
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
                if (confirm("全軍を撤退させますか？")) {
                    if (unit.isAttacker) this.log(`撤退を開始します……`);
                    else this.log(`城内へ撤退を開始します……`);
                    this.endFieldWar(unit.isAttacker ? 'attacker_retreat' : 'defender_retreat');
                }
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
            
            this.log(`${unit.name}隊の行動をキャンセルしました。`);
            
            this.state = 'PHASE_MOVE';
            this.reachable = null;
            this.previewTarget = null;
            
            this.reachable = this.findPaths(unit, unit.ap);
            
            this.updateMap();
            this.updateStatus();
        }
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
                        if (this.reachable && this.reachable[`${x},${y}`]) {
                            hex.classList.add('movable');
                        }
                    } else if (this.state === 'PHASE_DIR') {
                        if (this.getDistance(unit.x, unit.y, x, y) === 1) {
                            const targetUnit = this.units.find(u => u.x === x && u.y === y && u.isAttacker !== unit.isAttacker);
                            if (targetUnit && unit.ap >= 1) {
                                hex.classList.add('attackable');
                            } else {
                                let targetDir = this.getDirection(unit.x, unit.y, x, y);
                                let turnCost = this.getTurnCost(unit.direction, targetDir);
                                if (unit.ap >= turnCost) {
                                    hex.classList.add('fw-dir-highlight');
                                }
                            }
                        }
                        if (x === unit.x && y === unit.y) {
                            hex.classList.add('movable');
                        }
                    } else if (this.state === 'PHASE_ATTACK') {
                        const targetUnit = this.units.find(u => u.x === x && u.y === y && u.isAttacker !== unit.isAttacker);
                        if (targetUnit && this.getDistance(unit.x, unit.y, x, y) === 1 && unit.ap >= 1) {
                            hex.classList.add('attackable');
                        }
                        if (x === unit.x && y === unit.y) {
                            hex.classList.add('movable');
                        }
                    }
                }
                
                hex.onclick = () => this.onHexClick(x, y);
                this.mapEl.appendChild(hex);
            }
        }
        
        if (this.state === 'MOVE_PREVIEW' && this.previewTarget && unit) {
            this.drawPath(this.previewTarget.path, unit.x, unit.y);
            
            const pEl = document.createElement('div');
            pEl.className = `fw-unit ${unit.isAttacker ? 'attacker' : 'defender'} preview`;
            pEl.style.left = `${this.previewTarget.x * (this.hexW * 0.75) + (this.hexW - 24) / 2}px`;
            pEl.style.top = `${this.previewTarget.y * (this.hexH / 2) + (this.hexH - 24) / 2}px`;
            pEl.style.transform = `rotate(${unit.direction * 60}deg)`;
            pEl.style.pointerEvents = 'none'; // ★クリック貫通
            
            pEl.innerHTML = '凸';
            if (unit.isGeneral) {
                pEl.classList.add('general');
            }
            this.mapEl.appendChild(pEl);
        }

        this.units.forEach((u) => {
            const uEl = document.createElement('div');
            const isActive = (unit && u.id === unit.id);
            uEl.className = `fw-unit ${u.isAttacker ? 'attacker' : 'defender'} ${isActive ? 'active' : ''}`;
            uEl.style.left = `${u.x * (this.hexW * 0.75) + (this.hexW - 24) / 2}px`;
            uEl.style.top = `${u.y * (this.hexH / 2) + (this.hexH - 24) / 2}px`;
            uEl.style.transform = `rotate(${u.direction * 60}deg)`;
            uEl.style.pointerEvents = 'none'; // ★クリック貫通
            
            // ★大将アイコンの対応
            uEl.innerHTML = '凸';
            if (u.isGeneral) {
                uEl.classList.add('general');
            }
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
        return 0;
    }

    getTurnCost(curDir, targetDir) {
        if (curDir === targetDir) return 0; 
        let diff = Math.abs(curDir - targetDir);
        diff = Math.min(diff, 6 - diff); 
        if (diff === 1) return 1;
        return 2;
    }

    getCost(x, y, enemies, allies, isFirstStep, startDist) {
        // 他のユニットがいるマスには進入できない
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

    isPlayerTurn() {
        if (this.turnQueue.length === 0) return false;
        return this.turnQueue[0].isPlayer;
    }

    startTurn() {
        if (!this.active) return;
        
        // 全ユニットのAP回復＆キュー追加 (素早さ:統率+武力 の降順)
        this.units.forEach(u => {
            u.hasActionDone = false;
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
        
        // 死亡判定等で既に除外されている場合はスキップ
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
                this.updateMap();
                this.updateStatus();
                if (this.isPlayerTurn()) this.log(`攻撃対象を選択`);
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
            else if (isDefPlayer) this.log(`敵の総大将を討ち取りました！`);
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
        this.units.forEach(u => {
            if (u.isAttacker) atkSoldiers += u.soldiers;
            else defSoldiers += u.soldiers;
        });
        
        this.warState.attacker.soldiers = atkSoldiers;
        this.warState.attacker.rice = this.atkRice;
        this.warState.defender.fieldSoldiers = defSoldiers;
        this.warState.defFieldRice = this.defRice;

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
        if (!this.active || !this.isPlayerTurn()) return;
        
        const unit = this.turnQueue[0];

        if (this.state === 'PHASE_MOVE') {
            if (x === unit.x && y === unit.y) {
                this.nextPhase();
                return;
            }

            let key = `${x},${y}`;
            if (this.reachable && this.reachable[key]) {
                this.previewTarget = {x: x, y: y, path: this.reachable[key].path, cost: this.reachable[key].cost};
                this.state = 'MOVE_PREVIEW';
                this.updateMap();
            }

        } else if (this.state === 'MOVE_PREVIEW') {
            if (x === this.previewTarget.x && y === this.previewTarget.y) {
                unit.ap -= this.previewTarget.cost;
                unit.x = x;
                unit.y = y;
                this.log(`${unit.name}隊が移動。`);
                this.nextPhase();
            } else {
                let key = `${x},${y}`;
                if (this.reachable && this.reachable[key]) {
                    this.previewTarget = {x: x, y: y, path: this.reachable[key].path, cost: this.reachable[key].cost};
                    this.updateMap();
                } else {
                    this.state = 'PHASE_MOVE';
                    this.previewTarget = null;
                    this.updateMap();
                }
            }
        } else if (this.state === 'PHASE_DIR') {
            if (x === unit.x && y === unit.y) {
                this.nextPhase();
                return;
            }

            if (this.getDistance(unit.x, unit.y, x, y) === 1) {
                const targetUnit = this.units.find(u => u.x === x && u.y === y && u.isAttacker !== unit.isAttacker);
                if (targetUnit) {
                    if (unit.ap >= 1) {
                        unit.ap -= 1;
                        this.executeAttack(unit, targetUnit);
                    }
                    return;
                }

                let targetDir = this.getDirection(unit.x, unit.y, x, y);
                let turnCost = this.getTurnCost(unit.direction, targetDir);
                
                if (unit.ap >= turnCost) {
                    if (turnCost > 0) {
                        unit.ap -= turnCost;
                        unit.direction = targetDir;
                        this.log(`${unit.name}隊が向きを変更。`);
                    }
                    this.nextPhase();
                }
            }
        } else if (this.state === 'PHASE_ATTACK') {
            if (x === unit.x && y === unit.y) {
                this.nextPhase();
                return;
            }

            const targetUnit = this.units.find(u => u.x === x && u.y === y && u.isAttacker !== unit.isAttacker);
            if (targetUnit && this.getDistance(unit.x, unit.y, x, y) === 1 && unit.ap >= 1) {
                unit.ap -= 1;
                this.executeAttack(unit, targetUnit);
            }
        }
    }

    getDirectionalMultiplier(atkUnit, defUnit) {
        let atkDirIndex = this.getDirection(defUnit.x, defUnit.y, atkUnit.x, atkUnit.y);
        let defDirIndex = defUnit.direction;
        let diff = Math.abs(defDirIndex - atkDirIndex);
        diff = Math.min(diff, 6 - diff); 
        if (diff === 3) return 1.5; 
        if (diff === 2) return 1.2; 
        return 1.0; 
    }

    executeAttack(attacker, defender) {
        const result = WarSystem.calcWarDamage(
            attacker.stats, defender.stats,
            attacker.soldiers, defender.soldiers,
            0, 
            this.atkMorale, this.defTraining,
            'charge'
        );

        let dmgMultiplier = this.getDirectionalMultiplier(attacker, defender);

        let dmgToDef = Math.floor(Math.min(defender.soldiers, result.soldierDmg * dmgMultiplier));
        let dmgToAtk = Math.floor(Math.min(attacker.soldiers, result.counterDmg));

        defender.soldiers -= dmgToDef;
        attacker.soldiers -= dmgToAtk;

        let dirMsg = "";
        if (dmgMultiplier === 1.5) dirMsg = "（背後からの強襲！）";
        if (dmgMultiplier === 1.2) dirMsg = "（側面からの攻撃！）";

        this.log(`${attacker.name}隊の攻撃！${dirMsg} 敵に${dmgToDef}の損害！ 反撃で${dmgToAtk}の被害！`);

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
        
        if (dist > 1) {
            let reachable = this.findPaths(unit, unit.ap - 1); // 攻撃用のAP1を残す
            let bestTarget = null;
            let minMoveDist = 999;
            
            for (let key in reachable) {
                let parts = key.split(',');
                let nx = parseInt(parts[0]);
                let ny = parseInt(parts[1]);
                let d = this.getDistance(nx, ny, targetEnemy.x, targetEnemy.y);
                if (d < minMoveDist) {
                    minMoveDist = d;
                    bestTarget = {x: nx, y: ny, cost: reachable[key].cost};
                }
            }
            
            if (bestTarget && (bestTarget.x !== unit.x || bestTarget.y !== unit.y)) {
                unit.ap -= bestTarget.cost;
                unit.x = bestTarget.x;
                unit.y = bestTarget.y;
                if (isPlayerInvolved) {
                    this.log(`${unit.name}隊が前進。`);
                    this.updateMap();
                    this.updateStatus();
                    await new Promise(r => setTimeout(r, 400));
                }
            }
        }

        dist = this.getDistance(unit.x, unit.y, targetEnemy.x, targetEnemy.y);
        if (dist === 1) {
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

        if (dist === 1 && unit.ap >= 1) {
            unit.ap -= 1;
            this.executeAttack(unit, targetEnemy);
            return; 
        }

        if (isPlayerInvolved) this.log(`${unit.name}隊は待機した。`);
        this.nextPhaseTurn();
    }
}

window.FieldWarManager = FieldWarManager;

