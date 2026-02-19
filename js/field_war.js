/**
 * field_war.js
 * HEX式 野戦システム
 * 責務: 野戦マップの描画、ターンの制御、HEXでの移動と戦闘計算
 */

class FieldWarManager {
    constructor(game) {
        this.game = game;
        this.active = false;
        
        // HEXサイズ設定（縮小版）
        this.hexW = 30;
        this.hexH = 26;
        this.cols = 30;
        this.rows = 20;

        this.state = 'IDLE'; // 'IDLE', 'MOVE_SELECT', 'MOVE_PREVIEW', 'DIR_SELECT', 'ATTACK_SELECT'
        this.reachable = null;
        this.previewTarget = null;
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

        this.units = [
            {
                id: 'attacker',
                name: warState.atkBushos[0].name,
                isAttacker: true,
                isPlayer: isAtkPlayer,
                x: atkX, y: 19,
                direction: isAtkPlayer ? 1 : 4, // 1:右上, 4:左下
                mobility: 4,
                ap: 4,
                startAdjacency: false,
                soldiers: warState.attacker.soldiers,
                rice: warState.attacker.rice,
                maxRice: warState.attacker.maxRice,
                morale: warState.attacker.morale,
                training: warState.attacker.training,
                stats: WarSystem.calcUnitStats(warState.atkBushos),
                hasActionDone: false
            },
            {
                id: 'defender',
                name: warState.defBusho.name,
                isAttacker: false,
                isPlayer: isDefPlayer,
                x: defX, y: 19,
                direction: isDefPlayer ? 1 : 4,
                mobility: 4,
                ap: 4,
                startAdjacency: false,
                soldiers: warState.defender.soldiers,
                rice: warState.defender.rice,
                maxRice: warState.defender.rice, 
                morale: warState.defender.morale,
                training: warState.defender.training,
                stats: WarSystem.calcUnitStats([warState.defBusho]),
                hasActionDone: false
            }
        ];

        this.activeUnitIndex = 0; 
        
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
        }

        const btnWait = document.getElementById('fw-btn-wait');
        const btnRetreat = document.getElementById('fw-btn-retreat');
        
        if (btnWait) {
            btnWait.onclick = () => {
                if (!this.isPlayerTurn()) return;
                this.log(`${this.units[this.activeUnitIndex].name}隊は待機した。`);
                this.units[this.activeUnitIndex].hasActionDone = true;
                this.state = 'IDLE';
                this.nextTurn();
            };
        }
        if (btnRetreat) {
            btnRetreat.onclick = () => {
                if (!this.isPlayerTurn()) return;
                const unit = this.units[this.activeUnitIndex];
                if (confirm("本当に撤退しますか？")) {
                    this.log(`${unit.name}隊は撤退を決断した。`);
                    this.endFieldWar(unit.isAttacker ? 'attacker_retreat' : 'defender_retreat');
                }
            };
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
        const atk = this.units.find(u => u.isAttacker);
        const def = this.units.find(u => !u.isAttacker);

        const atkEl = document.getElementById('fw-atk-status');
        const defEl = document.getElementById('fw-def-status');

        let atkAP = this.activeUnitIndex === 0 ? ` / AP: ${atk.ap}` : "";
        let defAP = this.activeUnitIndex === 1 ? ` / AP: ${def.ap}` : "";

        if (atkEl) atkEl.innerHTML = `<strong>[攻] ${atk.name}</strong><br>兵: ${atk.soldiers} / 糧: ${atk.rice}${atkAP}`;
        if (defEl) defEl.innerHTML = `<strong>[守] ${def.name}</strong><br>兵: ${def.soldiers} / 糧: ${def.rice}${defAP}`;
        
        // プレイヤー側が必ず左に配置されるように順序を制御
        if (atk.isPlayer) {
            if (atkEl) atkEl.style.order = 1;
            if (defEl) defEl.style.order = 2;
        } else if (def.isPlayer) {
            if (atkEl) atkEl.style.order = 2;
            if (defEl) defEl.style.order = 1;
        } else {
            // プレイヤーが関与しない場合は攻撃を左に
            if (atkEl) atkEl.style.order = 1;
            if (defEl) defEl.style.order = 2;
        }

        const turnEl = document.getElementById('fw-turn-info');
        if (turnEl) turnEl.innerText = `Turn: ${this.turnCount}/${this.maxTurns}`;
    }

    updateMap() {
        if (!this.mapEl) return;
        this.mapEl.innerHTML = '';

        // SVGレイヤー追加
        const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svg.id = 'fw-svg-layer';
        svg.style.position = 'absolute'; svg.style.top = '0'; svg.style.left = '0';
        svg.style.width = '100%'; svg.style.height = '100%';
        svg.style.pointerEvents = 'none'; svg.style.zIndex = '15';
        this.mapEl.appendChild(svg);
        
        const unit = this.units[this.activeUnitIndex];
        const enemy = this.units[1 - this.activeUnitIndex];
        const isPlayerTurn = this.isPlayerTurn();

        for (let x = 0; x < this.cols; x++) {
            for (let row = 0; row < this.rows; row++) {
                const y = (x % 2 === 0) ? row * 2 : row * 2 + 1;
                
                const hex = document.createElement('div');
                hex.className = 'fw-hex';
                hex.style.left = `${x * (this.hexW * 0.75)}px`;
                hex.style.top = `${y * (this.hexH / 2)}px`;
                
                if (isPlayerTurn) {
                    if (this.state === 'MOVE_SELECT') {
                        if (x === enemy.x && y === enemy.y && this.getDistance(unit.x, unit.y, x, y) === 1 && unit.ap >= 1) {
                            hex.classList.add('attackable');
                            hex.style.zIndex = '30';
                        } else if (this.reachable && this.reachable[`${x},${y}`]) {
                            hex.classList.add('movable');
                            hex.style.zIndex = '20';
                        }
                    } else if (this.state === 'MOVE_PREVIEW') {
                        if (this.reachable && this.reachable[`${x},${y}`]) {
                            hex.classList.add('movable');
                            hex.style.zIndex = '20';
                        }
                    } else if (this.state === 'DIR_SELECT') {
                        if (x === enemy.x && y === enemy.y && this.getDistance(unit.x, unit.y, x, y) === 1 && unit.ap >= 1) {
                            hex.classList.add('attackable');
                            hex.style.zIndex = '30';
                        } else if (this.getDistance(unit.x, unit.y, x, y) === 1) {
                            let targetDir = this.getDirection(unit.x, unit.y, x, y);
                            let cost = this.getDirChangeCost(unit.direction, targetDir);
                            if (unit.ap >= cost) {
                                hex.classList.add('fw-dir-highlight');
                                hex.style.zIndex = '25';
                            }
                        }
                    } else if (this.state === 'ATTACK_SELECT') {
                        if (x === enemy.x && y === enemy.y && this.getDistance(unit.x, unit.y, x, y) === 1 && unit.ap >= 1) {
                            hex.classList.add('attackable');
                            hex.style.zIndex = '30';
                        }
                    }

                    // 自マスのクリック可能を強調
                    if (x === unit.x && y === unit.y && this.state !== 'IDLE') {
                        hex.style.cursor = 'pointer';
                        hex.style.zIndex = '25';
                    }
                }
                
                hex.onclick = () => this.onHexClick(x, y);
                this.mapEl.appendChild(hex);
            }
        }
        
        // 軌跡描画
        if (this.state === 'MOVE_PREVIEW' && this.previewTarget) {
            this.drawPath(this.previewTarget.path, unit.x, unit.y);
            
            // プレビューユニット
            const pEl = document.createElement('div');
            pEl.className = `fw-unit ${unit.isAttacker ? 'attacker' : 'defender'} preview`;
            pEl.style.left = `${this.previewTarget.x * (this.hexW * 0.75) + (this.hexW - 24) / 2}px`;
            pEl.style.top = `${this.previewTarget.y * (this.hexH / 2) + (this.hexH - 24) / 2}px`;
            pEl.style.transform = `rotate(${unit.direction * 60}deg)`;
            pEl.innerText = '凸';
            this.mapEl.appendChild(pEl);
        }

        // ユニット描画
        this.units.forEach((u, i) => {
            const uEl = document.createElement('div');
            uEl.className = `fw-unit ${u.isAttacker ? 'attacker' : 'defender'} ${i === this.activeUnitIndex ? 'active' : ''}`;
            uEl.style.left = `${u.x * (this.hexW * 0.75) + (this.hexW - 24) / 2}px`;
            uEl.style.top = `${u.y * (this.hexH / 2) + (this.hexH - 24) / 2}px`;
            uEl.style.transform = `rotate(${u.direction * 60}deg)`;
            uEl.innerText = '凸';
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

    // --- 座標計算系 ---
    getDistance(x1, y1, x2, y2) {
        const dx = Math.abs(x1 - x2);
        const dy = Math.abs(y1 - y2);
        return dx + Math.max(0, (dy - dx) / 2);
    }

    getNeighbors(x, y) {
        const list = [];
        const dirs = [
            {dx: 0, dy: -2}, {dx: 1, dy: -1},
            {dx: 1, dy: 1}, {dx: 0, dy: 2},
            {dx: -1, dy: 1}, {dx: -1, dy: -1}
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
            {dx: 0, dy: -2, dir: 0},
            {dx: 1, dy: -1, dir: 1},
            {dx: 1, dy: 1, dir: 2},
            {dx: 0, dy: 2, dir: 3},
            {dx: -1, dy: 1, dir: 4},
            {dx: -1, dy: -1, dir: 5}
        ];
        for(let d of dirs) {
            if (toX - fromX === d.dx && toY - fromY === d.dy) return d.dir;
        }
        return 0;
    }

    getDirChangeCost(curDir, targetDir) {
        if (curDir === targetDir) return 0;
        let diff = Math.abs(curDir - targetDir);
        diff = Math.min(diff, 6 - diff);
        if (diff === 1) return 1;
        return 2;
    }

    // --- ZOC探索 ---
    getCost(x, y, enemy) {
        if (x === enemy.x && y === enemy.y) return 999;
        let dist = this.getDistance(x, y, enemy.x, enemy.y);
        if (dist === 1) return 2; // 敵に隣接するマスの消費は2
        return 1;
    }

    findPaths(unit, enemy) {
        let maxAP = unit.ap;
        let queue = [{x: unit.x, y: unit.y, cost: 0, path: [], isFirst: true}];
        let visited = {};
        visited[`${unit.x},${unit.y}`] = { cost: 0, path: [] };
        
        while(queue.length > 0) {
            queue.sort((a,b) => a.cost - b.cost);
            let cur = queue.shift();
            
            let neighbors = this.getNeighbors(cur.x, cur.y);
            for(let n of neighbors) {
                let c = 0;
                if (cur.isFirst && unit.startAdjacency) {
                    c = 4; // 行動開始時点で最初から敵部隊と隣接していた場合、必ず移動力を４消費
                } else {
                    c = this.getCost(n.x, n.y, enemy);
                }

                let nextCost = cur.cost + c;
                if (nextCost <= maxAP) {
                    let key = `${n.x},${n.y}`;
                    if (!visited[key] || visited[key].cost > nextCost) {
                        let newPath = [...cur.path, {x: n.x, y: n.y}];
                        visited[key] = { cost: nextCost, path: newPath };
                        queue.push({x: n.x, y: n.y, cost: nextCost, path: newPath, isFirst: false});
                    }
                }
            }
        }
        return visited;
    }

    // --- ターン制御 ---
    isPlayerTurn() {
        return this.units[this.activeUnitIndex].isPlayer;
    }

    startTurn() {
        if (!this.active) return;
        const unit = this.units[this.activeUnitIndex];
        const enemy = this.units[1 - this.activeUnitIndex];
        
        unit.hasActionDone = false;
        unit.ap = 4; // ターン開始時にAPリセット
        unit.startAdjacency = (this.getDistance(unit.x, unit.y, enemy.x, enemy.y) === 1);

        this.state = 'IDLE';
        this.reachable = null;
        this.previewTarget = null;

        const isPlayerInvolved = this.units.some(u => u.isPlayer);
        if (isPlayerInvolved) {
            this.updateMap();
            this.updateStatus();
        }

        if (!unit.isPlayer) {
            setTimeout(() => this.processAITurn(), 800);
        }
    }

    nextTurn() {
        if (this.checkEndCondition()) return;

        this.activeUnitIndex = 1 - this.activeUnitIndex;

        if (this.activeUnitIndex === 0) {
            this.turnCount++;
            this.consumeRice();
        }

        if (this.checkEndCondition()) return;
        
        const isPlayerInvolved = this.units.some(u => u.isPlayer);
        if (isPlayerInvolved) {
            this.updateStatus();
        }
        
        this.startTurn();
    }

    consumeRice() {
        const atkUnit = this.units.find(u => u.isAttacker);
        const defUnit = this.units.find(u => !u.isAttacker);
        
        const consumeRate = (window.WarParams.War.RiceConsumptionAtk || 0.1) * 0.5;
        
        const atkCons = Math.floor(atkUnit.soldiers * consumeRate);
        const defCons = Math.floor(defUnit.soldiers * consumeRate);
        
        atkUnit.rice = Math.max(0, atkUnit.rice - atkCons);
        defUnit.rice = Math.max(0, defUnit.rice - defCons);
    }

    checkEndCondition() {
        const atkUnit = this.units.find(u => u.isAttacker);
        const defUnit = this.units.find(u => !u.isAttacker);

        if (atkUnit.soldiers <= 0) {
            this.log(`【決着】攻撃軍(${atkUnit.name})が壊滅した！`);
            this.endFieldWar('attacker_lose');
            return true;
        }
        if (defUnit.soldiers <= 0) {
            this.log(`【決着】守備軍(${defUnit.name})が壊滅した！`);
            this.endFieldWar('attacker_win');
            return true;
        }
        if (atkUnit.rice <= 0) {
            this.log(`【決着】攻撃軍の兵糧が尽き、撤退を余儀なくされた！`);
            this.endFieldWar('attacker_lose');
            return true;
        }
        if (defUnit.rice <= 0) {
            this.log(`【決着】守備軍の兵糧が尽き、城へ敗走した！`);
            this.endFieldWar('attacker_win');
            return true;
        }
        if (this.turnCount > this.maxTurns) {
            this.log(`【決着】野戦では決着がつかず、舞台は籠城戦へと移る！`);
            this.endFieldWar('draw_to_siege');
            return true;
        }
        return false;
    }

    endFieldWar(resultType) {
        this.active = false;
        
        const atkUnit = this.units.find(u => u.isAttacker);
        const defUnit = this.units.find(u => !u.isAttacker);
        
        this.warState.attacker.soldiers = atkUnit.soldiers;
        this.warState.attacker.rice = atkUnit.rice;
        this.warState.defender.soldiers = defUnit.soldiers;
        this.warState.defender.rice = defUnit.rice;

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

    // --- プレイヤー操作 ---
    onHexClick(x, y) {
        if (!this.active || !this.isPlayerTurn()) return;
        
        const unit = this.units[this.activeUnitIndex];
        const enemy = this.units[1 - this.activeUnitIndex];

        if (this.state === 'IDLE') {
            if (x === unit.x && y === unit.y && !unit.hasActionDone) {
                this.reachable = this.findPaths(unit, enemy);
                this.state = 'MOVE_SELECT';
                this.updateMap();
            }
        } else if (this.state === 'MOVE_SELECT') {
            // ショートカット：攻撃（移動と向き変更をスキップ）
            if (x === enemy.x && y === enemy.y) {
                if (this.getDistance(unit.x, unit.y, enemy.x, enemy.y) === 1 && unit.ap >= 1) {
                    unit.ap -= 1;
                    this.executeAttack(unit, enemy);
                    return;
                }
            }
            
            // スキップ：移動せず向き変更フェーズへ
            if (x === unit.x && y === unit.y) {
                this.state = 'DIR_SELECT';
                this.reachable = null;
                this.updateMap();
                return;
            }

            let key = `${x},${y}`;
            if (this.reachable && this.reachable[key]) {
                this.previewTarget = {x: x, y: y, path: this.reachable[key].path, cost: this.reachable[key].cost};
                this.state = 'MOVE_PREVIEW';
                this.updateMap();
            } else {
                this.state = 'IDLE';
                this.reachable = null;
                this.updateMap();
            }

        } else if (this.state === 'MOVE_PREVIEW') {
            if (x === this.previewTarget.x && y === this.previewTarget.y) {
                unit.x = x;
                unit.y = y;
                unit.ap -= this.previewTarget.cost;
                this.log(`${unit.name}隊が移動。(残AP:${unit.ap})`);
                
                this.state = 'DIR_SELECT';
                this.previewTarget = null;
                this.reachable = null;
                this.updateMap();
                this.updateStatus();
            } else {
                let key = `${x},${y}`;
                if (this.reachable && this.reachable[key]) {
                    this.previewTarget = {x: x, y: y, path: this.reachable[key].path, cost: this.reachable[key].cost};
                    this.updateMap();
                } else {
                    this.state = 'IDLE';
                    this.previewTarget = null;
                    this.reachable = null;
                    this.updateMap();
                }
            }
        } else if (this.state === 'DIR_SELECT') {
            // ショートカット：攻撃（向き変更をスキップ）
            if (x === enemy.x && y === enemy.y && this.getDistance(unit.x, unit.y, x, y) === 1 && unit.ap >= 1) {
                unit.ap -= 1;
                this.executeAttack(unit, enemy);
                return;
            }

            // スキップ：向き変更せず攻撃フェーズへ
            if (x === unit.x && y === unit.y) {
                this.state = 'ATTACK_SELECT';
                this.updateMap();
                return;
            }

            if (this.getDistance(unit.x, unit.y, x, y) === 1) {
                let targetDir = this.getDirection(unit.x, unit.y, x, y);
                let cost = this.getDirChangeCost(unit.direction, targetDir);
                if (unit.ap >= cost) {
                    unit.direction = targetDir;
                    unit.ap -= cost;
                    this.log(`${unit.name}隊が向きを変更。(残AP:${unit.ap})`);
                    this.state = 'ATTACK_SELECT';
                    this.updateMap();
                    this.updateStatus();
                }
            } else {
                this.state = 'ATTACK_SELECT';
                this.updateMap();
            }
        } else if (this.state === 'ATTACK_SELECT') {
            if (x === enemy.x && y === enemy.y && this.getDistance(unit.x, unit.y, x, y) === 1 && unit.ap >= 1) {
                unit.ap -= 1;
                this.executeAttack(unit, enemy);
            } else {
                this.log(`${unit.name}隊は行動を終了した。`);
                unit.hasActionDone = true;
                this.state = 'IDLE';
                this.updateMap();
                setTimeout(() => this.nextTurn(), 500);
            }
        }
    }

    // --- 戦闘処理 ---
    getDirectionalMultiplier(atkUnit, defUnit) {
        let atkDirIndex = this.getDirection(defUnit.x, defUnit.y, atkUnit.x, atkUnit.y);
        let defDirIndex = defUnit.direction;
        
        let diff = Math.abs(defDirIndex - atkDirIndex);
        diff = Math.min(diff, 6 - diff);
        
        if (diff === 3) return 1.5; 
        if (diff === 2) return 1.3; 
        return 1.0; 
    }

    executeAttack(attacker, defender) {
        const result = WarSystem.calcWarDamage(
            attacker.stats, defender.stats,
            attacker.soldiers, defender.soldiers,
            0, 
            attacker.morale, defender.training,
            'charge'
        );

        let dmgMultiplier = this.getDirectionalMultiplier(attacker, defender);

        let dmgToDef = Math.floor(Math.min(defender.soldiers, result.soldierDmg * dmgMultiplier));
        let dmgToAtk = Math.floor(Math.min(attacker.soldiers, result.counterDmg));

        defender.soldiers -= dmgToDef;
        attacker.soldiers -= dmgToAtk;

        let dirMsg = "";
        if (dmgMultiplier === 1.5) dirMsg = "（背後からの強襲！）";
        if (dmgMultiplier === 1.3) dirMsg = "（側面からの攻撃！）";

        this.log(`${attacker.name}隊の攻撃！${dirMsg} 敵に${dmgToDef}の損害！ 反撃で${dmgToAtk}の被害！(残AP:${attacker.ap})`);
        
        attacker.hasActionDone = true;
        this.state = 'IDLE';
        this.updateMap();
        this.updateStatus();
        
        setTimeout(() => {
            this.nextTurn();
        }, 800);
    }

    // --- AI処理 ---
    async processAITurn() {
        if (!this.active) return;
        const unit = this.units[this.activeUnitIndex];
        const enemy = this.units[1 - this.activeUnitIndex];
        
        unit.ap = 4;
        unit.startAdjacency = (this.getDistance(unit.x, unit.y, enemy.x, enemy.y) === 1);

        const isPlayerInvolved = this.units.some(u => u.isPlayer);
        if (isPlayerInvolved) {
            await new Promise(r => setTimeout(r, 600));
        }

        if (unit.soldiers < enemy.soldiers * 0.2) {
            if (isPlayerInvolved) this.log(`${unit.name}隊は劣勢を悟り、撤退を決断した！`);
            this.endFieldWar(unit.isAttacker ? 'attacker_retreat' : 'defender_retreat');
            return;
        }

        let dist = this.getDistance(unit.x, unit.y, enemy.x, enemy.y);
        
        // 1. 移動フェーズ
        if (dist > 1) {
            let reachable = this.findPaths(unit, enemy);
            let bestTarget = null;
            let minDist = 999;
            
            for (let key in reachable) {
                let parts = key.split(',');
                let nx = parseInt(parts[0]);
                let ny = parseInt(parts[1]);
                let d = this.getDistance(nx, ny, enemy.x, enemy.y);
                if (d < minDist) {
                    minDist = d;
                    bestTarget = {x: nx, y: ny, cost: reachable[key].cost};
                }
            }
            
            if (bestTarget && (bestTarget.x !== unit.x || bestTarget.y !== unit.y)) {
                unit.x = bestTarget.x;
                unit.y = bestTarget.y;
                unit.ap -= bestTarget.cost;
                if (isPlayerInvolved) {
                    this.log(`${unit.name}隊が前進。(残AP:${unit.ap})`);
                    this.updateMap();
                    this.updateStatus();
                    await new Promise(r => setTimeout(r, 600));
                }
            }
        }

        dist = this.getDistance(unit.x, unit.y, enemy.x, enemy.y);

        // 2. 向き変更フェーズ
        if (dist === 1) {
            let targetDir = this.getDirection(unit.x, unit.y, enemy.x, enemy.y);
            let cost = this.getDirChangeCost(unit.direction, targetDir);
            if (unit.ap >= cost && cost > 0) {
                unit.direction = targetDir;
                unit.ap -= cost;
                if (isPlayerInvolved) {
                    this.log(`${unit.name}隊が向きを変更。(残AP:${unit.ap})`);
                    this.updateMap();
                    this.updateStatus();
                    await new Promise(r => setTimeout(r, 600));
                }
            }
        }

        // 3. 攻撃フェーズ
        if (dist === 1 && unit.ap >= 1) {
            unit.ap -= 1;
            this.executeAttack(unit, enemy);
        } else {
            if (isPlayerInvolved) this.log(`${unit.name}隊は待機した。`);
            this.nextTurn();
        }
    }
}
window.FieldWarManager = FieldWarManager;