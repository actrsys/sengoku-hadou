/**
 * field_war.js
 * HEX式 野戦システム
 * 責務: 野戦マップの描画、ターンの制御、HEXでの移動と戦闘計算
 */

class FieldWarManager {
    constructor(game) {
        this.game = game;
        this.active = false;
        
        // HEXサイズとマップのグリッド設定
        // hexW(30), hexH(26) は1つの六角形のピクセルサイズ
        this.hexW = 30;
        this.hexH = 26;
        // 横30マス × 縦20マスのフィールド空間
        this.cols = 30;
        this.rows = 20;

        // state: 'IDLE', 'PHASE_MOVE', 'MOVE_PREVIEW', 'PHASE_DIR', 'PHASE_ATTACK'
        this.state = 'IDLE'; 
        this.reachable = null;
        this.previewTarget = null;
        this.turnBackup = null; // 右クリックキャンセル用の状態保存
    }

    startFieldWar(warState, onComplete) {
        this.warState = warState;
        this.onComplete = onComplete;
        this.turnCount = 1;
        this.maxTurns = 20; // ★最大ターン数: 20ターン経過で引き分け（籠城戦へ移行）
        this.active = true;
        this.state = 'IDLE';

        const pid = Number(this.game.playerClanId);
        const isAtkPlayer = (Number(warState.attacker.ownerClan) === pid);
        const isDefPlayer = (Number(warState.defender.ownerClan) === pid);
        const isPlayerInvolved = isAtkPlayer || isDefPlayer;

        // 配置座標の決定
        // 左陣営はX=5、右陣営はX=25に配置。プレイヤーは必ず左側に配置される。
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
                // ★初期の向き設定 (0:上, 1:右上, 2:右下, 3:下, 4:左下, 5:左上)
                // プレイヤー(左配置)は 1(右上) を向き、敵(右配置)は 4(左下) を向く
                direction: isAtkPlayer ? 1 : 4, 
                // ★基本ステータス
                mobility: 4, // 1ターンで回復する最大AP（アクションポイント）
                ap: 4,       // 現在の所持AP
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
                mobility: 4, // 守備側も同様に最大APは4
                ap: 4,
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
            
            // 右クリックで行動をキャンセルするイベントリスナー
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
                    if (unit.isAttacker) this.log(`撤退を開始します……`);
                    else this.log(`城内へ撤退を開始します……`);
                    this.endFieldWar(unit.isAttacker ? 'attacker_retreat' : 'defender_retreat');
                }
            };
        }
    }

    cancelAction() {
        if (!this.active || !this.isPlayerTurn()) return;
        
        const unit = this.units[this.activeUnitIndex];
        // 攻撃実行後など、すでに行動完了済みの場合はキャンセル不可
        if (unit.hasActionDone) return;
        
        // 最初のフェーズかつ、まだ何も動いていない場合はキャンセル処理不要
        if (this.state === 'PHASE_MOVE' && this.turnBackup && 
            unit.x === this.turnBackup.x && unit.y === this.turnBackup.y && unit.direction === this.turnBackup.direction) {
            // プレビュー表示中ならプレビューだけ消す
            if (this.previewTarget) {
                this.previewTarget = null;
                this.updateMap();
            }
            return;
        }

        // バックアップからターン開始時点の状態に復元
        if (this.turnBackup) {
            unit.x = this.turnBackup.x;
            unit.y = this.turnBackup.y;
            unit.direction = this.turnBackup.direction;
            unit.ap = this.turnBackup.ap;
            
            this.log(`${unit.name}隊の行動をキャンセルしました。`);
            
            this.state = 'PHASE_MOVE';
            this.reachable = null;
            this.previewTarget = null;
            
            const enemy = this.units[1 - this.activeUnitIndex];
            this.reachable = this.findPaths(unit, enemy, unit.ap);
            
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
        const atk = this.units.find(u => u.isAttacker);
        const def = this.units.find(u => !u.isAttacker);

        const atkEl = document.getElementById('fw-atk-status');
        const defEl = document.getElementById('fw-def-status');

        // AP表示を削除
        if (atkEl) atkEl.innerHTML = `<strong>[攻] ${atk.name}</strong><br>兵: ${atk.soldiers} / 糧: ${atk.rice}`;
        if (defEl) defEl.innerHTML = `<strong>[守] ${def.name}</strong><br>兵: ${def.soldiers} / 糧: ${def.rice}`;
        
        if (atk.isPlayer) {
            if (atkEl) atkEl.style.order = 1;
            if (defEl) defEl.style.order = 2;
        } else if (def.isPlayer) {
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
                    if (this.state === 'PHASE_MOVE') {
                        if (this.reachable && this.reachable[`${x},${y}`]) {
                            hex.classList.add('movable');
                        }
                    } else if (this.state === 'MOVE_PREVIEW') {
                        if (this.reachable && this.reachable[`${x},${y}`]) {
                            hex.classList.add('movable');
                        }
                    } else if (this.state === 'PHASE_DIR') {
                        // 距離1（隣接マス）のハイライト判定
                        if (this.getDistance(unit.x, unit.y, x, y) === 1) {
                            let targetDir = this.getDirection(unit.x, unit.y, x, y);
                            let turnCost = this.getTurnCost(unit.direction, targetDir);
                            if (unit.ap >= turnCost) {
                                hex.classList.add('fw-dir-highlight');
                            }
                        }
                        if (x === unit.x && y === unit.y) hex.classList.add('movable');
                    } else if (this.state === 'PHASE_ATTACK') {
                        // 攻撃可能なマス（敵がいて、距離が1で、APが1以上ある場合）
                        if (x === enemy.x && y === enemy.y && this.getDistance(unit.x, unit.y, x, y) === 1 && unit.ap >= 1) {
                            hex.classList.add('attackable');
                        }
                        if (x === unit.x && y === unit.y) hex.classList.add('movable');
                    }
                }
                
                hex.onclick = () => this.onHexClick(x, y);
                this.mapEl.appendChild(hex);
            }
        }
        
        if (this.state === 'MOVE_PREVIEW' && this.previewTarget) {
            this.drawPath(this.previewTarget.path, unit.x, unit.y);
            
            const pEl = document.createElement('div');
            pEl.className = `fw-unit ${unit.isAttacker ? 'attacker' : 'defender'} preview`;
            pEl.style.left = `${this.previewTarget.x * (this.hexW * 0.75) + (this.hexW - 24) / 2}px`;
            pEl.style.top = `${this.previewTarget.y * (this.hexH / 2) + (this.hexH - 24) / 2}px`;
            // ★ 60度ずつ回転させてユニットの向きを表現
            pEl.style.transform = `rotate(${unit.direction * 60}deg)`;
            pEl.innerText = '凸';
            this.mapEl.appendChild(pEl);
        }

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
    // ★HEXグリッド特有の距離計算式（ダブル座標系での計算）
    getDistance(x1, y1, x2, y2) {
        const dx = Math.abs(x1 - x2);
        const dy = Math.abs(y1 - y2);
        return dx + Math.max(0, (dy - dx) / 2);
    }

    // ★周囲6方向の座標の差分（ダブル座標系）
    getNeighbors(x, y) {
        const list = [];
        const dirs = [
            {dx: 0, dy: -2},  // 上
            {dx: 1, dy: -1},  // 右上
            {dx: 1, dy: 1},   // 右下
            {dx: 0, dy: 2},   // 下
            {dx: -1, dy: 1},  // 左下
            {dx: -1, dy: -1}  // 左上
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

    // ★座標の差分から方向(0〜5)を割り出す
    getDirection(fromX, fromY, toX, toY) {
        const dirs = [
            {dx: 0, dy: -2, dir: 0},  // 0: 上
            {dx: 1, dy: -1, dir: 1},  // 1: 右上
            {dx: 1, dy: 1, dir: 2},   // 2: 右下
            {dx: 0, dy: 2, dir: 3},   // 3: 下
            {dx: -1, dy: 1, dir: 4},  // 4: 左下
            {dx: -1, dy: -1, dir: 5}  // 5: 左上
        ];
        for(let d of dirs) {
            if (toX - fromX === d.dx && toY - fromY === d.dy) return d.dir;
        }
        return 0;
    }

    // ★向きを変更する際のAPコスト計算
    getTurnCost(curDir, targetDir) {
        if (curDir === targetDir) return 0; // 向きが同じならAP消費なし
        
        let diff = Math.abs(curDir - targetDir);
        diff = Math.min(diff, 6 - diff); // HEXの特性上、右回り・左回りの最短ルートを算出
        
        // 1段階(60度)の振り向きはAPを「1」消費
        if (diff === 1) return 1;
        // 2段階(120度)または3段階(180度反転)の振り向きは、一律でAPを「2」消費
        return 2;
    }

    // --- ★ZOC探索（非常に重要なゲームバランス部分） ---
    getCost(x, y, enemy, isFirstStep, startDist) {
        // 敵ユニットがいる座標自体には進入不可（コスト999で事実上のブロック）
        if (x === enemy.x && y === enemy.y) return 999;
        
        // 【ZOC離脱ペナルティ】
        // 行動開始時点で敵部隊と隣接（距離1）していた場合、移動の最初の一歩でAPを「4」消費。
        // （最大APが4なので、隣接状態から逃げるだけでターンが終わる＝泥沼の乱戦を表現）
        if (isFirstStep && startDist === 1) {
            return 4;
        }

        // 【ZOC進入・内部移動ペナルティ】
        // 敵部隊の周囲1～2マス（ZOCの範囲）に進入する、またはその中を移動する場合のコスト。
        let dist = this.getDistance(x, y, enemy.x, enemy.y);
        if (dist <= 2) return 2; // 通常の倍のAPを消費（動きが鈍る）
        
        // 【通常移動】
        // ZOC外の平地を移動する場合はAPを「1」消費
        return 1;
    }

    findPaths(unit, enemy, maxAP) {
        let queue = [{x: unit.x, y: unit.y, cost: 0, path: [], steps: 0}];
        let visited = {};
        visited[`${unit.x},${unit.y}`] = { cost: 0, path: [] };
        
        let startDist = this.getDistance(unit.x, unit.y, enemy.x, enemy.y);
        
        // ダイクストラ法による到達可能マスの探索
        while(queue.length > 0) {
            queue.sort((a,b) => a.cost - b.cost);
            let cur = queue.shift();
            
            let neighbors = this.getNeighbors(cur.x, cur.y);
            for(let n of neighbors) {
                let isFirstStep = (cur.steps === 0);
                let c = this.getCost(n.x, n.y, enemy, isFirstStep, startDist); // ★ここでZOCコストを加算
                let nextCost = cur.cost + c;
                
                // 所持AP内で到達可能な場合のみ経路として保存
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

    // --- ターン制御 ---
    isPlayerTurn() {
        return this.units[this.activeUnitIndex].isPlayer;
    }

    startTurn() {
        if (!this.active) return;
        const unit = this.units[this.activeUnitIndex];
        const enemy = this.units[1 - this.activeUnitIndex];
        
        unit.hasActionDone = false;
        unit.ap = unit.mobility; // ターン開始時にAPを全回復（最大4）
        
        // --- ターン開始時の状態をバックアップ（キャンセルのため） ---
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
            // ★APを使用して移動可能な範囲を計算
            this.reachable = this.findPaths(unit, enemy, unit.ap);
            if (isPlayerInvolved) {
                this.updateMap();
                this.updateStatus();
                this.log(`【${unit.name}隊のターン】移動先を選択（右クリックで行動キャンセル）`);
            }
        } else {
            if (isPlayerInvolved) {
                this.updateMap();
                this.updateStatus();
            }
            // AIターンの開始（少し遅延を入れてプレイヤーが状況を把握しやすくする）
            setTimeout(() => this.processAITurn(), 800);
        }
    }

    nextPhase() {
        const unit = this.units[this.activeUnitIndex];
        if (this.state === 'PHASE_MOVE' || this.state === 'MOVE_PREVIEW') {
            this.previewTarget = null;
            this.reachable = null;
            this.state = 'PHASE_DIR';
            
            if (unit.ap <= 0) {
                this.nextPhase();
            } else {
                this.updateMap();
                this.updateStatus();
                if (this.isPlayerTurn()) this.log(`向きを選択（自部隊クリックでスキップ）`);
            }
        } else if (this.state === 'PHASE_DIR') {
            this.state = 'PHASE_ATTACK';
            
            if (unit.ap <= 0) {
                this.nextPhase();
            } else {
                this.updateMap();
                this.updateStatus();
                if (this.isPlayerTurn()) this.log(`攻撃対象を選択（自部隊クリックでスキップ）`);
            }
        } else if (this.state === 'PHASE_ATTACK') {
            unit.hasActionDone = true;
            this.state = 'IDLE';
            this.updateMap();
            this.updateStatus();
            setTimeout(() => this.nextTurn(), 500);
        }
    }

    nextTurn() {
        if (this.checkEndCondition()) return;

        this.activeUnitIndex = 1 - this.activeUnitIndex; // 手番の交代

        // 両軍が動いたら（1往復したら）ターン経過とし、兵糧を消費する
        if (this.activeUnitIndex === 0) {
            this.turnCount++;
            this.consumeRice();
        }

        if (this.checkEndCondition()) return;
        
        this.startTurn();
    }

    consumeRice() {
        const atkUnit = this.units.find(u => u.isAttacker);
        const defUnit = this.units.find(u => !u.isAttacker);
        
        // ★兵糧消費計算
        // war.js側の RiceConsumptionAtk を参照し、野戦用として半分の係数（0.05）に設定
        const consumeRate = (window.WarParams.War.RiceConsumptionAtk || 0.1) * 0.5;
        
        // 兵数 × 0.05（デフォ値の場合）の兵糧が毎ターン削られる
        const atkCons = Math.floor(atkUnit.soldiers * consumeRate);
        const defCons = Math.floor(defUnit.soldiers * consumeRate);
        
        atkUnit.rice = Math.max(0, atkUnit.rice - atkCons);
        defUnit.rice = Math.max(0, defUnit.rice - defCons);
    }

    checkEndCondition() {
        const atkUnit = this.units.find(u => u.isAttacker);
        const defUnit = this.units.find(u => !u.isAttacker);

        const isAtkPlayer = atkUnit.isPlayer;
        const isDefPlayer = defUnit.isPlayer;
        const enemyName = isAtkPlayer ? defUnit.name + "軍" : (isDefPlayer ? atkUnit.name + "軍" : "敵軍");

        if (atkUnit.soldiers <= 0) {
            if (isAtkPlayer) this.log(`我が軍は壊滅しました……`);
            else if (isDefPlayer) this.log(`${enemyName}を撃退しました！`);
            else this.log(`攻撃軍(${atkUnit.name})が壊滅した！`);
            
            this.endFieldWar('attacker_lose');
            return true;
        }
        if (defUnit.soldiers <= 0) {
            if (isAtkPlayer) this.log(`${enemyName}を壊滅させました！`);
            else if (isDefPlayer) this.log(`我が軍は壊滅しました……`);
            else this.log(`守備軍(${defUnit.name})が壊滅した！`);
            
            this.endFieldWar('attacker_win');
            return true;
        }
        if (atkUnit.rice <= 0) {
            if (isAtkPlayer) this.log(`兵糧が尽き、これ以上の行軍は不可能です……`);
            else if (isDefPlayer) this.log(`${enemyName}は兵糧が尽き、撤退していきました！`);
            else this.log(`攻撃軍の兵糧が尽き、撤退を余儀なくされた！`);
            
            this.endFieldWar('attacker_lose');
            return true;
        }
        if (defUnit.rice <= 0) {
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
        
        const atkUnit = this.units.find(u => u.isAttacker);
        const defUnit = this.units.find(u => !u.isAttacker);
        
        // 野戦後の兵士・兵糧の残量を war.js 側のデータに反映させる
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

        if (this.state === 'PHASE_MOVE') {
            if (x === unit.x && y === unit.y) {
                // 自身の居るマスをクリックしたら移動スキップ
                this.nextPhase();
                return;
            }

            let key = `${x},${y}`;
            if (this.reachable && this.reachable[key]) {
                // 移動のプレビュー（仮表示）状態へ移行
                this.previewTarget = {x: x, y: y, path: this.reachable[key].path, cost: this.reachable[key].cost};
                this.state = 'MOVE_PREVIEW';
                this.updateMap();
            }

        } else if (this.state === 'MOVE_PREVIEW') {
            if (x === this.previewTarget.x && y === this.previewTarget.y) {
                // プレビューしたマスを再度クリックで移動確定
                unit.ap -= this.previewTarget.cost; // 移動コスト分のAPを消費
                unit.x = x;
                unit.y = y;
                this.log(`${unit.name}隊が移動。`);
                this.nextPhase();
            } else {
                let key = `${x},${y}`;
                if (this.reachable && this.reachable[key]) {
                    // 別の移動可能マスをクリックしたらプレビュー対象を変更
                    this.previewTarget = {x: x, y: y, path: this.reachable[key].path, cost: this.reachable[key].cost};
                    this.updateMap();
                } else {
                    // 移動不可の場所をクリックしたらプレビュー解除
                    this.state = 'PHASE_MOVE';
                    this.previewTarget = null;
                    this.updateMap();
                }
            }
        } else if (this.state === 'PHASE_DIR') {
            if (x === unit.x && y === unit.y) {
                // 自マスをクリックで向き変更スキップ
                this.nextPhase();
                return;
            }

            if (this.getDistance(unit.x, unit.y, x, y) === 1) {
                let targetDir = this.getDirection(unit.x, unit.y, x, y);
                let turnCost = this.getTurnCost(unit.direction, targetDir);
                
                if (unit.ap >= turnCost) {
                    if (turnCost > 0) {
                        unit.ap -= turnCost; // 振り向きコスト分のAPを消費
                        unit.direction = targetDir;
                        this.log(`${unit.name}隊が向きを変更。`);
                    }
                    this.nextPhase();
                }
            }
        } else if (this.state === 'PHASE_ATTACK') {
            if (x === unit.x && y === unit.y) {
                // 自マスをクリックで攻撃スキップ
                this.nextPhase();
                return;
            }

            // 攻撃実行条件：クリック先が敵の居場所であり、距離が1(隣接)、かつAPが1以上残っている
            if (x === enemy.x && y === enemy.y && this.getDistance(unit.x, unit.y, x, y) === 1) {
                if (unit.ap >= 1) {
                    unit.ap -= 1; // 攻撃のAP消費は一律「1」
                    this.executeAttack(unit, enemy);
                }
            }
        }
    }

    // --- ★戦闘処理（ダメージ補正のキモ） ---
    getDirectionalMultiplier(atkUnit, defUnit) {
        // 攻撃側から見た敵の方向と、敵の向いている方向を比較する
        let atkDirIndex = this.getDirection(defUnit.x, defUnit.y, atkUnit.x, atkUnit.y);
        let defDirIndex = defUnit.direction;
        
        let diff = Math.abs(defDirIndex - atkDirIndex);
        diff = Math.min(diff, 6 - diff); // HEXの特性上、差の最大値は3
        
        // ★背後攻撃: 真正面の反対（180度裏）からの攻撃。ダメージに 1.5倍 の強力なボーナス！
        if (diff === 3) return 1.5; 
        
        // ★側面攻撃: 斜め後ろ（120度横）からの攻撃。ダメージに 1.2倍 のボーナス！
        if (diff === 2) return 1.2; 
        
        // 真正面または斜め前（0度、60度）からの攻撃はボーナス無し（1.0倍）
        return 1.0; 
    }

    executeAttack(attacker, defender) {
        // war.js の共通計算ロジック（calcWarDamage）を呼び出して基礎ダメージを算出
        const result = WarSystem.calcWarDamage(
            attacker.stats, defender.stats,
            attacker.soldiers, defender.soldiers,
            0, 
            attacker.morale, defender.training,
            'charge' // 野戦は強制的に突撃（charge）扱い
        );

        // ★ここで向きによるダメージ倍率を適用
        let dmgMultiplier = this.getDirectionalMultiplier(attacker, defender);

        // 防御側の兵数を上限にダメージを決定
        let dmgToDef = Math.floor(Math.min(defender.soldiers, result.soldierDmg * dmgMultiplier));
        // ★反撃ダメージ：向き補正は適用されず、基礎ダメージのみ（背後を取って殴っても反撃は来る仕様）
        let dmgToAtk = Math.floor(Math.min(attacker.soldiers, result.counterDmg));

        defender.soldiers -= dmgToDef;
        attacker.soldiers -= dmgToAtk;

        let dirMsg = "";
        if (dmgMultiplier === 1.5) dirMsg = "（背後からの強襲！）";
        if (dmgMultiplier === 1.3) dirMsg = "（側面からの攻撃！）";

        this.log(`${attacker.name}隊の攻撃！${dirMsg} 敵に${dmgToDef}の損害！ 反撃で${dmgToAtk}の被害！`);
        
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
        
        const isPlayerInvolved = this.units.some(u => u.isPlayer);
        if (isPlayerInvolved) {
            await new Promise(r => setTimeout(r, 600)); // プレイヤーの視認用ウェイト
        }

        // 兵力差による撤退ロジック
        if (unit.soldiers < enemy.soldiers * 0.2) {
            if (isPlayerInvolved) {
                if (unit.isAttacker) {
                    this.log(`${unit.name}軍は攻略を諦め、引き揚げていきました！`);
                } else {
                    this.log(`${unit.name}軍は不利を悟り、戦場から離脱しました！`);
                }
            }
            this.endFieldWar(unit.isAttacker ? 'attacker_retreat' : 'defender_retreat');
            return;
        }

        let dist = this.getDistance(unit.x, unit.y, enemy.x, enemy.y);
        
        // ① 移動フェーズ
        // 敵と隣接していない場合は接近を試みる
        if (dist > 1) {
            // ★【AIの工夫】攻撃するためにAPを必ず「1」残して移動ルートを探す
            let reachable = this.findPaths(unit, enemy, unit.ap - 1);
            let bestTarget = null;
            let minDist = 999;
            
            // 敵に一番近づけるマスを探す
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
                unit.ap -= bestTarget.cost;
                unit.x = bestTarget.x;
                unit.y = bestTarget.y;
                if (isPlayerInvolved) {
                    this.log(`${unit.name}隊が前進。`);
                    this.updateMap();
                    this.updateStatus();
                    await new Promise(r => setTimeout(r, 600));
                }
            }
        }

        // ② 向き変更フェーズ
        // 移動後に敵と隣接できたか再確認
        dist = this.getDistance(unit.x, unit.y, enemy.x, enemy.y);
        if (dist === 1) {
            let targetDir = this.getDirection(unit.x, unit.y, enemy.x, enemy.y);
            let turnCost = this.getTurnCost(unit.direction, targetDir);
            
            // 敵の方向を向く（残APがあれば）
            if (unit.ap >= turnCost && turnCost > 0) {
                unit.ap -= turnCost;
                unit.direction = targetDir;
                if (isPlayerInvolved) {
                    this.log(`${unit.name}隊が敵に向き直った。`);
                    this.updateMap();
                    this.updateStatus();
                    await new Promise(r => setTimeout(r, 400));
                }
            }
        }

        // ③ 攻撃フェーズ
        // 敵に隣接しており、かつAPが1以上残っていれば殴る
        if (dist === 1 && unit.ap >= 1) {
            unit.ap -= 1;
            this.executeAttack(unit, enemy);
            return; // executeAttack内で次ターンへ移行するためここで終了
        }

        // 攻撃しなかった場合（AP不足などで待機）
        if (isPlayerInvolved) this.log(`${unit.name}隊は待機した。`);
        this.nextTurn();
    }
}
window.FieldWarManager = FieldWarManager;