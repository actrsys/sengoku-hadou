/**
 * field_war.js
 * HEX式 野戦システム
 * 責務: 野戦マップの描画、ターンの制御、HEXでの移動と戦闘計算
 */

class FieldWarManager {
    constructor(game) {
        this.game = game;
        this.active = false;
        
        // HEXサイズ設定（Flat-topped）
        this.hexW = 60;
        this.hexH = 52;
        this.cols = 15;
        this.rows = 15;
    }

    startFieldWar(warState, onComplete) {
        this.warState = warState;
        this.onComplete = onComplete;
        this.turnCount = 1;
        this.maxTurns = 20;
        this.active = true;

        const pid = Number(this.game.playerClanId);
        const isAtkPlayer = (Number(warState.attacker.ownerClan) === pid);
        const isDefPlayer = (Number(warState.defender.ownerClan) === pid);
        const isPlayerInvolved = isAtkPlayer || isDefPlayer;

        // 配置座標の決定（プレイヤーは必ず左側）
        let atkX = 2, defX = 12;
        if (isDefPlayer && !isAtkPlayer) {
            atkX = 12;
            defX = 2;
        }

        // ユニット情報生成
        this.units = [
            {
                id: 'attacker',
                name: warState.atkBushos[0].name,
                isAttacker: true,
                isPlayer: isAtkPlayer,
                x: atkX, y: 14,
                soldiers: warState.attacker.soldiers,
                rice: warState.attacker.rice,
                maxRice: warState.attacker.maxRice,
                morale: warState.attacker.morale,
                training: warState.attacker.training,
                stats: WarSystem.calcUnitStats(warState.atkBushos),
                hasMoved: false
            },
            {
                id: 'defender',
                name: warState.defBusho.name,
                isAttacker: false,
                isPlayer: isDefPlayer,
                x: defX, y: 14,
                soldiers: warState.defender.soldiers,
                rice: warState.defender.rice,
                maxRice: warState.defender.rice, // 元のriceを最大とする
                morale: warState.defender.morale,
                training: warState.defender.training,
                stats: WarSystem.calcUnitStats([warState.defBusho]),
                hasMoved: false
            }
        ];

        this.activeUnitIndex = 0; // 攻撃側からスタート
        
        // UIの初期化
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
        
        // マップサイズの計算 (奇数行のズレ考慮)
        const totalW = (this.cols - 1) * (this.hexW * 0.75) + this.hexW;
        const totalH = (this.rows * 2 - 1) * (this.hexH / 2) + this.hexH;
        if (this.mapEl) {
            this.mapEl.style.width = `${totalW}px`;
            this.mapEl.style.height = `${totalH}px`;
        }

        // 待機・撤退ボタンの設定
        const btnWait = document.getElementById('fw-btn-wait');
        const btnRetreat = document.getElementById('fw-btn-retreat');
        
        if (btnWait) {
            btnWait.onclick = () => {
                if (!this.isPlayerTurn()) return;
                this.log(`${this.units[this.activeUnitIndex].name}隊は待機した。`);
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
        if (atkEl) atkEl.innerHTML = `<strong>[攻] ${atk.name}</strong><br>兵: ${atk.soldiers} / 糧: ${atk.rice}`;
        
        const defEl = document.getElementById('fw-def-status');
        if (defEl) defEl.innerHTML = `<strong>[守] ${def.name}</strong><br>兵: ${def.soldiers} / 糧: ${def.rice}`;
        
        const turnEl = document.getElementById('fw-turn-info');
        if (turnEl) turnEl.innerText = `Turn: ${this.turnCount}/${this.maxTurns}`;
    }

    updateMap() {
        if (!this.mapEl) return;
        this.mapEl.innerHTML = '';
        
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
                    if (x === enemy.x && y === enemy.y && this.getDistance(unit.x, unit.y, x, y) === 1) {
                        hex.classList.add('attackable');
                    } else if (!unit.hasMoved && x !== enemy.x && y !== enemy.y && x !== unit.x && y !== unit.y && this.getDistance(unit.x, unit.y, x, y) === 1) {
                        hex.classList.add('movable');
                    }
                }
                
                hex.onclick = () => this.onHexClick(x, y);
                this.mapEl.appendChild(hex);
            }
        }
        
        // ユニット描画
        this.units.forEach((u, i) => {
            const uEl = document.createElement('div');
            uEl.className = `fw-unit ${u.isAttacker ? 'attacker' : 'defender'} ${i === this.activeUnitIndex ? 'active' : ''}`;
            uEl.style.left = `${u.x * (this.hexW * 0.75) + (this.hexW - 40) / 2}px`;
            uEl.style.top = `${u.y * (this.hexH / 2) + (this.hexH - 40) / 2}px`;
            uEl.innerText = u.isAttacker ? '攻' : '守';
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

    // --- 座標計算系 ---
    getDistance(x1, y1, x2, y2) {
        const dx = Math.abs(x1 - x2);
        const dy = Math.abs(y1 - y2);
        return dx + Math.max(0, (dy - dx) / 2);
    }

    getNeighbors(x, y) {
        const list = [];
        const dirs = [
            {dx: 0, dy: -2}, {dx: 0, dy: 2},
            {dx: -1, dy: -1}, {dx: 1, dy: -1},
            {dx: -1, dy: 1}, {dx: 1, dy: 1}
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

    // --- ターン制御 ---
    isPlayerTurn() {
        return this.units[this.activeUnitIndex].isPlayer;
    }

    startTurn() {
        if (!this.active) return;
        const unit = this.units[this.activeUnitIndex];
        unit.hasMoved = false;

        const isPlayerInvolved = this.units.some(u => u.isPlayer);
        if (isPlayerInvolved) {
            this.updateMap();
        }

        if (!unit.isPlayer) {
            setTimeout(() => this.processAITurn(), 800);
        }
    }

    nextTurn() {
        if (this.checkEndCondition()) return;

        this.activeUnitIndex = 1 - this.activeUnitIndex;

        // ラウンド終了時（両者が1回ずつ行動後）に兵糧消費とターン進行
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
        
        // お互いに攻撃側の消費量(RiceConsumptionAtk)の半分を消費
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
        
        // 状態の引き継ぎ
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

        // 敵マス判定
        if (x === enemy.x && y === enemy.y) {
            if (this.getDistance(unit.x, unit.y, enemy.x, enemy.y) === 1) {
                this.executeAttack(unit, enemy);
            }
            return;
        }
        
        // 味方マス判定
        if (x === unit.x && y === unit.y) return;

        // 移動判定
        if (!unit.hasMoved && this.getDistance(unit.x, unit.y, x, y) === 1) {
            unit.x = x;
            unit.y = y;
            unit.hasMoved = true;
            this.log(`${unit.name}隊が前進。`);
            this.updateMap();
        }
    }

    // --- 戦闘処理 ---
    executeAttack(attacker, defender) {
        // war.js の共通計算ロジックを利用
        const result = WarSystem.calcWarDamage(
            attacker.stats, defender.stats,
            attacker.soldiers, defender.soldiers,
            0, // 野戦なので城壁防御は0
            attacker.morale, defender.training,
            'charge'
        );

        let dmgToDef = Math.min(defender.soldiers, result.soldierDmg);
        let dmgToAtk = Math.min(attacker.soldiers, result.counterDmg);

        defender.soldiers -= dmgToDef;
        attacker.soldiers -= dmgToAtk;

        this.log(`${attacker.name}隊の攻撃！ 敵に${dmgToDef}の損害！ 反撃で${dmgToAtk}の被害！`);
        
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
            await new Promise(r => setTimeout(r, 600));
        }

        // 撤退判定: 兵力が敵の20%未満なら撤退
        if (unit.soldiers < enemy.soldiers * 0.2) {
            if (isPlayerInvolved) this.log(`${unit.name}隊は劣勢を悟り、撤退を決断した！`);
            this.endFieldWar(unit.isAttacker ? 'attacker_retreat' : 'defender_retreat');
            return;
        }

        let dist = this.getDistance(unit.x, unit.y, enemy.x, enemy.y);
        
        // 移動処理
        if (dist > 1) {
            let bestHex = null;
            let minDist = 999;
            const neighbors = this.getNeighbors(unit.x, unit.y);
            
            for (const n of neighbors) {
                if (n.x === enemy.x && n.y === enemy.y) continue;
                const d = this.getDistance(n.x, n.y, enemy.x, enemy.y);
                if (d < minDist) {
                    minDist = d;
                    bestHex = n;
                }
            }
            
            if (bestHex) {
                unit.x = bestHex.x;
                unit.y = bestHex.y;
                if (isPlayerInvolved) {
                    this.log(`${unit.name}隊が前進。`);
                    this.updateMap();
                    await new Promise(r => setTimeout(r, 400));
                }
            }
        }

        dist = this.getDistance(unit.x, unit.y, enemy.x, enemy.y);
        if (dist === 1) {
            this.executeAttack(unit, enemy);
        } else {
            if (isPlayerInvolved) this.log(`${unit.name}隊は待機した。`);
            this.nextTurn();
        }
    }
}
window.FieldWarManager = FieldWarManager;