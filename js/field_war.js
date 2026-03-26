/**
 * field_war.js
 * HEX式 野戦システム
 * 修正: 撤退ボタンの確認アラートをカスタムダイアログ（showDialog）に置き換えました
 * ★追加: 城が攻められた時に、仲の良い諸勢力が「AIの援軍」として参戦する機能を追加しました
 * ★追加: 「足軽」「騎馬」「鉄砲」の兵科概念を導入し、移動力や攻撃範囲、ダメージ倍率を反映しました
 * ★追加: 計算式を攻城戦とは分離し、野戦独自の計算式を導入しました
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
        this.retreatedUnits = []; // ★追加：撤退した部隊をメモする箱
        this.activeAtkTab = 'main'; // 野戦用タブ（攻撃）
        this.activeDefTab = 'main'; // 野戦用タブ（守備）
        window.addEventListener('resize', () => {
            if (this.active) {
                this.adjustMapScale();
            }
        });
    }
    
    /**
     * マップの広さに合わせて、2列分のマスを使って重ならないように配置を計算する魔法です。
     * 最初の1枠は、総大将のための「一番端の列の、一番端っこ」を特別に確保します！
     */
    getDeploymentSlots(x1, x2, isTop) {
        let slots = [];
        
        // 2列分の使えるマス（Y座標）をすべて集めます
        for (let x of [x1, x2]) {
            for (let row = 0; row < this.rows; row++) {
                let y = (x % 2 === 0) ? row * 2 : row * 2 + 1;
                slots.push({ x: x, y: y });
            }
        }
        
        // Y座標の順番にキレイに並べ替えます
        slots.sort((a, b) => a.y - b.y);
        
        // 縦の長さを半分に割って、上エリアか下エリアかを決めます
        let half = Math.floor(slots.length / 2);
        let regionSlots = isTop ? slots.slice(0, half) : slots.slice(half);
        
        if (regionSlots.length === 0) regionSlots = slots; // 万が一の保険

        // ★総大将用の「特等席」を探します
        // 一番端の列（x1）の中で、一番上（または一番下）のマスを見つけます
        let generalSlotIndex = -1;
        if (isTop) {
            for (let i = 0; i < regionSlots.length; i++) {
                if (regionSlots[i].x === x1) { generalSlotIndex = i; break; }
            }
        } else {
            for (let i = regionSlots.length - 1; i >= 0; i--) {
                if (regionSlots[i].x === x1) { generalSlotIndex = i; break; }
            }
        }

        let orderedSlots = [];
        let generalSlot = null;
        
        // 見つけた特等席を、必ず1番目（index 0）のリストに入れます
        if (generalSlotIndex !== -1) {
            generalSlot = regionSlots[generalSlotIndex];
            orderedSlots.push(generalSlot);
            regionSlots.splice(generalSlotIndex, 1);
        } else {
            // 万が一の保険
            generalSlot = regionSlots[0];
            orderedSlots.push(generalSlot);
            regionSlots.splice(0, 1);
        }

        // ★修正：残りの部隊を「一番端っこの列（x1）」かつ「総大将に近い順」に並べる魔法！
        regionSlots.sort((a, b) => {
            // 1. まず「一番端の列（x1）」かどうかをチェックします（x1なら最優先！）
            let aIsEdge = (a.x === x1) ? 0 : 1;
            let bIsEdge = (b.x === x1) ? 0 : 1;
            if (aIsEdge !== bIsEdge) {
                return aIsEdge - bIsEdge; 
            }
            
            // 2. 同じ列なら、総大将からの「縦の距離（yの差）」が近い順に並べます！
            let distA = Math.abs(a.y - generalSlot.y);
            let distB = Math.abs(b.y - generalSlot.y);
            return distA - distB;
        });

        // 綺麗に並べ終わったものを、総大将の後ろにくっつけます
        orderedSlots = orderedSlots.concat(regionSlots);

        return orderedSlots; // 出来上がった配置リストを返します
    }
    
    /**
     * マップを緑の画面に合わせてギリギリまで大きくする魔法（完全版）
     */
    adjustMapScale() {
        const mapArea = document.getElementById('fw-map');
        const scrollArea = document.getElementById('fw-map-scroll');

        if (!mapArea || !scrollArea) return;

        // スマホかPCかによって、画面横幅に表示するマス数を固定します
        const isPC = document.body.classList.contains('is-pc') || window.innerWidth >= 768;
        const targetCols = isPC ? 16 : 10;

        // 目標とするマス数分の「本来の横幅(ピクセル)」を計算します
        const targetWidthPx = (targetCols - 1) * (this.hexW * 0.75) + this.hexW;
        
        // 実際の画面の横幅を測ります
        const availableWidth = scrollArea.clientWidth;

        // 画面の幅にピッタリ合わせるための拡大/縮小率（スケール）を割り出します
        let scale = availableWidth / targetWidthPx;

        // 割り出したスケールをマップに適用します
        mapArea.style.transformOrigin = 'top left';
        mapArea.style.transform = `scale(${scale})`;
        mapArea.style.margin = '0';
        
        scrollArea.style.display = 'block';
    }
    
    startFieldWar(warState, onComplete) {
        this.warState = warState;
        this.onComplete = onComplete;
        this.turnCount = 1;
        this.maxTurns = 30; // 30ターンに固定
        this.active = true;
        this.state = 'IDLE';
        
        // ★追加：野戦が始まるたびに、タブの選択を一番左（メイン）にリセットします
        this.activeAtkTab = 'main';
        this.activeDefTab = 'main';
        
        this.hideUnitInfo();

        // ★追加: 新しく作ったマップ工場でランダムなマップを作る
        const mapFactory = new HexMapGenerator();
        const mapData = mapFactory.generate();
        this.cols = mapData.cols;
        this.rows = mapData.rows;
        this.grid = mapData.grid;

        const pid = Number(this.game.playerClanId);
        const isAtkPlayer = (Number(warState.attacker.ownerClan) === pid);
        const isDefPlayer = (Number(warState.defender.ownerClan) === pid);
        // ★修正：ここではまだプレイヤーが参加しているか決めず、後で部隊リストを見て判定します
        // const isPlayerInvolved = isAtkPlayer || isDefPlayer;

        // ★修正: 部隊の開始位置を、マップの「端から2列分」に拡張します！
        const leftX1 = 0;
        const leftX2 = 1;
        const rightX1 = this.cols - 1;
        const rightX2 = this.cols - 2;

        let atkX1 = leftX1, atkX2 = leftX2;
        let defX1 = rightX1, defX2 = rightX2;
        let atkIsLeft = true;

        if (isDefPlayer && !isAtkPlayer) {
            atkX1 = rightX1; atkX2 = rightX2;
            defX1 = leftX1; defX2 = leftX2;
            atkIsLeft = false;
        }

        // 2列分のマスリストを生成します
        // 左側（プレイヤー等）：メイン＝上、友軍＝下
        // 右側（敵等）　　　：メイン＝下、友軍＝上
        const leftMainSlots = this.getDeploymentSlots(leftX1, leftX2, true);
        const leftAllySlots = this.getDeploymentSlots(leftX1, leftX2, false);
        const rightMainSlots = this.getDeploymentSlots(rightX1, rightX2, false);
        const rightAllySlots = this.getDeploymentSlots(rightX1, rightX2, true);

        const atkMainSlots = atkIsLeft ? leftMainSlots : rightMainSlots;
        const atkAllySlots = atkIsLeft ? leftAllySlots : rightAllySlots;
        const defMainSlots = !atkIsLeft ? leftMainSlots : rightMainSlots;
        const defAllySlots = !atkIsLeft ? leftAllySlots : rightAllySlots;

        this.units = [];
        this.retreatedUnits = []; // ★追加：撤退した部隊をメモする箱を空っぽにしておきます
        
        let atkMainCount = 0;
        let atkAllyCount = 0;
        let defMainCount = 0;
        let defAllyCount = 0;

        // 攻撃側部隊の生成
        if (warState.atkAssignments) {
            warState.atkAssignments.forEach((assign, index) => {
                if (assign.soldiers <= 0) return;
                const type = assign.troopType || 'ashigaru';
                const mobility = (type === 'kiba') ? 6 : 4; // ★ 騎馬は行動力6

                // ★追加: この部隊が援軍かどうか、そして誰が操作するかをチェックします！
                let isReinf = false;
                let unitIsPlayer = isAtkPlayer;
                let isSelfReinf = false; // ★追加：自勢力の援軍かどうかのメモ
                let unitKunishuId = null; // ★追加：諸勢力IDのメモ
                
                // 1. 同盟国からの援軍チェック
                if (warState.reinforcement && warState.reinforcement.bushos.some(b => b.id === assign.busho.id)) {
                    isReinf = true;
                    // ★修正：諸勢力の援軍なら、絶対に「AI操作」で「他勢力の色」にします！
                    if (warState.reinforcement.isKunishuForce) {
                        unitIsPlayer = false;
                        isSelfReinf = false;
                        unitKunishuId = warState.reinforcement.kunishuId;
                    } else {
                        unitIsPlayer = (Number(warState.reinforcement.castle.ownerClan) === pid);
                        isSelfReinf = (Number(warState.reinforcement.castle.ownerClan) === Number(warState.attacker.ownerClan));
                    }
                }
                // 2. 自勢力の別城からの援軍チェック
                else if (warState.selfReinforcement && warState.selfReinforcement.bushos.some(b => b.id === assign.busho.id)) {
                    isReinf = true;
                    unitIsPlayer = (Number(warState.selfReinforcement.castle.ownerClan) === pid);
                    isSelfReinf = true;
                }
                
                let deployPos;
                let deployDir;
                let unitGroupId = 'atk_main';
                if (isReinf) {
                    if (isSelfReinf) {
                        deployPos = atkMainSlots[atkMainCount % atkMainSlots.length]; // 自軍援軍はメインと同じ配置
                        deployDir = (atkX1 === leftX1) ? 2 : 5;
                        atkMainCount++;
                        unitGroupId = 'atk_self';
                    } else {
                        deployPos = atkAllySlots[atkAllyCount % atkAllySlots.length];
                        deployDir = (atkX1 === leftX1) ? 1 : 4;
                        atkAllyCount++;
                        unitGroupId = 'atk_ally';
                    }
                } else {
                    deployPos = atkMainSlots[atkMainCount % atkMainSlots.length];
                    deployDir = (atkX1 === leftX1) ? 2 : 5;
                    atkMainCount++;
                    unitGroupId = 'atk_main';
                }

                this.units.push({
                    id: `atk_${index}`,
                    groupId: unitGroupId,
                    bushoId: assign.busho.id,
                
                    kunishuId: unitKunishuId, // ★追加
                    name: assign.busho.name,
                    isAttacker: true,
                    isPlayer: unitIsPlayer,
                    isReinforcement: isReinf,
                    isSelfReinforcement: isSelfReinf, 
                    isGeneral: index === 0,
                    x: deployPos.x,
                    y: deployPos.y,
                    direction: deployDir,
                    mobility: mobility, 
                    ap: mobility,
                    soldiers: assign.soldiers,
                    troopType: type,
                    stats: {
                        ldr: assign.busho.leadership,
                        str: assign.busho.strength,
                        int: assign.busho.intelligence,
                        charm: assign.busho.charm
                    },
                    hasActionDone: false,
                    hasMoved: false
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
                let isSelfReinf = false; 
                let unitKunishuId = null; // ★追加：諸勢力IDのメモ
                
                // 1. 同盟国からの援軍チェック
                if (warState.defReinforcement && warState.defReinforcement.bushos.some(b => b.id === assign.busho.id)) {
                    isReinf = true;
                    // ★修正：諸勢力の援軍なら、絶対に「AI操作」で「他勢力の色」にします！
                    if (warState.defReinforcement.isKunishuForce) {
                        unitIsPlayer = false;
                        isSelfReinf = false;
                        unitKunishuId = warState.defReinforcement.kunishuId;
                    } else {
                        unitIsPlayer = (Number(warState.defReinforcement.castle.ownerClan) === pid);
                        isSelfReinf = (Number(warState.defReinforcement.castle.ownerClan) === Number(warState.defender.ownerClan));
                    }
                }
                // 2. 自勢力の別城からの援軍チェック
                else if (warState.defSelfReinforcement && warState.defSelfReinforcement.bushos.some(b => b.id === assign.busho.id)) {
                    isReinf = true;
                    unitIsPlayer = (Number(warState.defSelfReinforcement.castle.ownerClan) === pid);
                    isSelfReinf = true;
                }
                
                let deployPos;
                let deployDir;
                let unitGroupId = 'def_main';
                if (isReinf) {
                    if (isSelfReinf) {
                        deployPos = defMainSlots[defMainCount % defMainSlots.length];
                        deployDir = (defX1 === leftX1) ? 2 : 5;
                        defMainCount++;
                        unitGroupId = 'def_self';
                    } else {
                        deployPos = defAllySlots[defAllyCount % defAllySlots.length];
                        deployDir = (defX1 === leftX1) ? 1 : 4;
                        defAllyCount++;
                        unitGroupId = 'def_ally';
                    }
                } else {
                    deployPos = defMainSlots[defMainCount % defMainSlots.length];
                    deployDir = (defX1 === leftX1) ? 2 : 5;
                    defMainCount++;
                    unitGroupId = 'def_main';
                }

                this.units.push({
                    id: `def_${index}`,
                    groupId: unitGroupId,
                    bushoId: assign.busho.id,
                    kunishuId: unitKunishuId, // ★追加
                    name: assign.busho.name,
                    isAttacker: false,
                    isPlayer: unitIsPlayer,
                    isReinforcement: isReinf,
                    isSelfReinforcement: isSelfReinf, 
                    isGeneral: index === 0,
                    x: deployPos.x,
                    y: deployPos.y,
                    direction: deployDir,
                    mobility: mobility, 
                    ap: mobility,
                    soldiers: assign.soldiers,
                    troopType: type,
                    stats: {
                        ldr: assign.busho.leadership,
                        str: assign.busho.strength,
                        int: assign.busho.intelligence,
                        charm: assign.busho.charm
                    },
                    hasActionDone: false,
                    hasMoved: false
                });
            });
        }

        // 防衛側が城を持っている場合、仲良しの諸勢力が「援軍」に来る
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
                                // ★修正: 馬と鉄砲は全部持ち込む
                                const uHorses = k.horses || 0;
                                const uGuns = k.guns || 0;
                                // ※サプライズ援軍はすぐに帰る（消費しない）ので、お留守番の数をゼロにする処理は不要です
                                
                                if (uSoldiers > 0) {
                                    // ★追加: 兵科の決定（AIのautoDivideSoldiersの簡易版）
                                    let type = 'ashigaru';
                                    let mobility = 4;
                                    if (uHorses >= uSoldiers * 0.5) {
                                        type = 'kiba';
                                        mobility = 6;
                                    } else if (uGuns >= uSoldiers * 0.5) {
                                        type = 'teppo';
                                    }
                                    
                                    let deployPos = defAllySlots[defAllyCount % defAllySlots.length];
                                    let unitGroupId = 'def_kunishu_' + k.id;
                                    this.units.push({
                                        id: 'k_' + bestBusho.id,
                                        groupId: unitGroupId,
                                        bushoId: bestBusho.id,
                                        kunishuId: k.id,
                                        name: bestBusho.name,
                                        isAttacker: false,
                                        isPlayer: false, 
                                        isGeneral: false,
                                        x: deployPos.x, 
                                        y: deployPos.y, 
                                        direction: (defX1 === leftX1) ? 1 : 4,
                                        mobility: mobility, // ★修正
                                        ap: mobility,       // ★修正
                                        soldiers: uSoldiers,
                                        troopType: type,    // ★修正
                                        stats: {
                                            ldr: bestBusho.leadership,
                                            str: bestBusho.strength,
                                            int: bestBusho.intelligence,
                                            charm: bestBusho.charm
                                        },
                                        hasActionDone: false,
                                        hasMoved: false
                                    });
                                    defAllyCount++; // ←★ここに「数え棒」を新しく書き足しました！
                                    this.game.ui.log(`【諸勢力援軍】${bestBusho.name}率いる諸勢力が防衛側の援軍として駆けつけました！`);
                                }
                            }
                        }
                    }
                }
            });
        }
        
        // それぞれの部隊ごとに兵糧、士気、訓練度を分けて管理する「専用の箱」を作ります！
        this.groupStats = {
            atk_main: { rice: warState.attacker.rice || 0, morale: warState.attacker.morale || 50, training: warState.attacker.training || 50 },
            atk_ally: warState.reinforcement ? { rice: warState.reinforcement.rice || 0, morale: warState.reinforcement.morale || 50, training: warState.reinforcement.training || 50 } : null,
            atk_self: warState.selfReinforcement ? { rice: warState.selfReinforcement.rice || 0, morale: warState.selfReinforcement.morale || 50, training: warState.selfReinforcement.training || 50 } : null,
            def_main: { rice: warState.defFieldRice || 0, morale: warState.defender.morale || 50, training: warState.defender.training || 50 },
            def_ally: warState.defReinforcement ? { rice: warState.defReinforcement.rice || 0, morale: warState.defReinforcement.morale || 50, training: warState.defReinforcement.training || 50 } : null,
            def_self: warState.defSelfReinforcement ? { rice: warState.defSelfReinforcement.rice || 0, morale: warState.defSelfReinforcement.morale || 50, training: warState.defSelfReinforcement.training || 50 } : null,
        };

        // 諸勢力のサプライズ援軍用の箱も作ります（兵糧は使いません）
        this.units.forEach(u => {
            if (u.groupId && u.groupId.startsWith('def_kunishu_')) {
                if (!this.groupStats[u.groupId]) {
                    this.groupStats[u.groupId] = { rice: 0, morale: 50, training: 50 };
                }
            }
        });

        this.turnQueue = [];
        
        this.isInfoMode = false;
        this.isCmdMode = false;
        
        // ★追加：援軍も含めて、プレイヤーが操作する部隊が1つでもあるか調べます！
        const isPlayerInvolved = this.units.some(u => u.isPlayer);

        if (isPlayerInvolved) {
            this.initUI();
            this.updateMap();
            this.updateStatus();
            this.log("両軍、布陣を完了。野戦を開始します！");
            
            if (window.AudioManager) {
                window.AudioManager.memorizeCurrentBgm(); // 今の曲をメモ
                window.AudioManager.playBGM('08_Legend of bear slaying.ogg'); // 野戦BGM再生
            }
            
            // 野戦の画面が表示されたあとに、大きさをピッタリに合わせる魔法を使います
            setTimeout(() => {
                this.adjustMapScale();
                // サイズ調整が終わった後に、確実に操作部隊へカメラを向ける
                if (this.turnQueue && this.turnQueue.length > 0) {
                    setTimeout(() => this.scrollToUnit(this.turnQueue[0]), 50);
                }
            }, 100); // 画面ができるまで一瞬（0.1秒）だけ待ってから魔法をかけます
        } else {
            // ★プレイヤーがいない場合、画面に野戦マップが出ないように隠します！
            const modal = document.getElementById('field-war-modal');
            if (modal) modal.classList.add('hidden');
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

        // ★追加：マウスのドラッグでマップをぐりぐりスクロールする魔法
        const scrollEl = document.getElementById('fw-map-scroll');
        if (scrollEl) {
            let isDragging = false;
            let isMoved = false; // ★ドラッグで動かしたかどうかのメモ
            let startX, startY, scrollLeft, scrollTop;

            scrollEl.onmousedown = (e) => {
                // 左クリック以外（右クリックなど）は無視します
                if (e.button !== 0) return;
                
                // ★マス目の上でもドラッグできるように、邪魔なストッパーを消しました！
                
                isDragging = true;
                isMoved = false; // クリックするたびにメモを白紙に戻す
                scrollEl.classList.add('grabbing');
                startX = e.pageX - scrollEl.offsetLeft;
                startY = e.pageY - scrollEl.offsetTop;
                scrollLeft = scrollEl.scrollLeft;
                scrollTop = scrollEl.scrollTop;
            };

            scrollEl.onmouseleave = () => {
                isDragging = false;
                scrollEl.classList.remove('grabbing');
            };

            scrollEl.onmouseup = () => {
                isDragging = false;
                scrollEl.classList.remove('grabbing');
                
                // 指を離した直後にクリック判定が暴発しないように、少しだけ待ってからメモを白紙にする魔法です
                setTimeout(() => { isMoved = false; }, 50);
            };

            scrollEl.onmousemove = (e) => {
                if (!isDragging) return;
                e.preventDefault();
                const x = e.pageX - scrollEl.offsetLeft;
                const y = e.pageY - scrollEl.offsetTop;
                
                // ★手が震えただけの「クリック」と見分けるため、少し多めに動いた時だけ「ドラッグした」とメモします
                if (Math.abs(x - startX) > 5 || Math.abs(y - startY) > 5) {
                    isMoved = true;
                }

                if (isMoved) {
                    const walkX = (x - startX) * 1.5; 
                    const walkY = (y - startY) * 1.5;
                    scrollEl.scrollLeft = scrollLeft - walkX;
                    scrollEl.scrollTop = scrollTop - walkY;
                }
            };

            // ★マップ全体の操作を見張って、「ドラッグした直後のクリック」ならマス目への指示をキャンセルするガードマンです
            scrollEl.addEventListener('click', (e) => {
                if (isMoved) {
                    e.stopPropagation(); // ここでストップをかけます！
                    e.preventDefault();
                }
            }, true); // true にすることで、誰よりも早く見張ることができます
        }

        const btnWait = document.getElementById('fw-btn-wait');
        const btnRetreat = document.getElementById('fw-btn-retreat');
        const btnCmd = document.getElementById('fw-btn-cmd');
        const btnInfo = document.getElementById('fw-btn-info');
        const btnCmdBack = document.getElementById('fw-btn-cmd-back');
        const btnInfoBack = document.getElementById('fw-btn-info-back');

        if (btnCmd) btnCmd.onclick = () => { if(!this.isPlayerTurn()) return; this.isCmdMode = true; this.updateMenu(); };
        if (btnCmdBack) btnCmdBack.onclick = () => { if(!this.isPlayerTurn()) return; this.isCmdMode = false; this.updateMenu(); };
        
        if (btnInfo) btnInfo.onclick = () => {
            this.isInfoMode = true; 
            this.updateMenu(); 
            this.updateMap(); 
        };
        if (btnInfoBack) btnInfoBack.onclick = () => {
            this.isInfoMode = false; 
            this.hideUnitInfo(); 
            this.updateMenu(); 
            this.updateMap(); 
            if (this.turnQueue && this.turnQueue.length > 0) {
                setTimeout(() => this.scrollToUnit(this.turnQueue[0]), 100);
            }
        };

        if (btnWait) {
            btnWait.onclick = () => {
                if (!this.isPlayerTurn() || this.isInfoMode) return;
                const unit = this.turnQueue[0];
                this.log(`${unit.name}隊は待機した。`);
                unit.hasActionDone = true;
                this.state = 'IDLE';
                this.nextPhaseTurn();
            };
        }
        
        if (btnRetreat) {
            btnRetreat.onclick = () => {
                if (!this.isPlayerTurn() || this.isInfoMode) return;
                const unit = this.turnQueue[0];
                if (unit.isGeneral) {
                    this.game.ui.showDialog("全軍を撤退させますか？（総大将が撤退すると野戦は終了します）", true, () => {
                        if (unit.isAttacker) this.log(`全軍、撤退を開始します……`);
                        else this.log(`全軍、城内へ撤退を開始します……`);
                        this.endFieldWar(unit.isAttacker ? 'attacker_retreat' : 'defender_retreat');
                    });
                } else {
                    this.game.ui.showDialog(`${unit.name}隊を戦場から離脱（撤退）させますか？`, true, () => {
                        this.log(`${unit.name}隊は戦場から撤退しました。`);
                        this.retreatUnit(unit);
                    });
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
        const mapEl = document.getElementById('fw-map');
        if (!scrollEl || !mapEl) return;
        
        // 現在のマップのスケール（拡大率）を読み取ります
        const transform = mapEl.style.transform;
        let scale = 1;
        if (transform && transform.includes('scale')) {
            const match = transform.match(/scale\(([^)]+)\)/);
            if (match && match[1]) scale = parseFloat(match[1]);
        }
        
        // 拡大率を掛け算して、本当のピクセル位置を計算します
        const px = (unit.x * (this.hexW * 0.75) + this.hexW / 2) * scale;
        const py = (unit.y * (this.hexH / 2) + this.hexH / 2) * scale;

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
        // メイン、応援軍、同盟軍のそれぞれの数値を保管する箱を用意します
        let stats = {
            atk: {
                main: { soldiers: 0, rice: 0, morale: 0, training: 0, exists: false },
                self: { soldiers: 0, rice: 0, morale: 0, training: 0, exists: false },
                ally: { soldiers: 0, rice: 0, morale: 0, training: 0, exists: false }
            },
            def: {
                main: { soldiers: 0, rice: 0, morale: 0, training: 0, exists: false },
                self: { soldiers: 0, rice: 0, morale: 0, training: 0, exists: false },
                ally: { soldiers: 0, rice: 0, morale: 0, training: 0, exists: false }
            }
        };

        // マップ上の部隊から兵士数を数えます
        this.units.forEach(u => {
            let side = u.isAttacker ? 'atk' : 'def';
            let tab = 'main';
            if (u.groupId === `${side}_self`) tab = 'self';
            else if (u.groupId === `${side}_ally` || (u.groupId && u.groupId.startsWith(`${side}_kunishu`))) tab = 'ally';
            
            stats[side][tab].soldiers += u.soldiers;
            stats[side][tab].exists = true;
        });

        let groupCounters = {
            atk: { main: {rice:0, mSum:0, mCount:0, tSum:0, tCount:0}, self: {rice:0, mSum:0, mCount:0, tSum:0, tCount:0}, ally: {rice:0, mSum:0, mCount:0, tSum:0, tCount:0} },
            def: { main: {rice:0, mSum:0, mCount:0, tSum:0, tCount:0}, self: {rice:0, mSum:0, mCount:0, tSum:0, tCount:0}, ally: {rice:0, mSum:0, mCount:0, tSum:0, tCount:0} }
        };

        // 専用の箱から兵糧・士気・訓練を取り出します
        for (let key in this.groupStats) {
            if (!this.groupStats[key]) continue;
            let side = key.startsWith('atk_') ? 'atk' : 'def';
            let tab = 'main';
            if (key.includes('_self')) tab = 'self';
            else if (key.includes('_ally') || key.includes('_kunishu')) tab = 'ally';
            
            groupCounters[side][tab].rice += this.groupStats[key].rice;
            groupCounters[side][tab].mSum += this.groupStats[key].morale;
            groupCounters[side][tab].mCount++;
            groupCounters[side][tab].tSum += this.groupStats[key].training;
            groupCounters[side][tab].tCount++;
            stats[side][tab].exists = true;
        }

        ['atk', 'def'].forEach(side => {
            ['main', 'self', 'ally'].forEach(tab => {
                stats[side][tab].rice = groupCounters[side][tab].rice;
                stats[side][tab].morale = groupCounters[side][tab].mCount > 0 ? Math.floor(groupCounters[side][tab].mSum / groupCounters[side][tab].mCount) : 0;
                stats[side][tab].training = groupCounters[side][tab].tCount > 0 ? Math.floor(groupCounters[side][tab].tSum / groupCounters[side][tab].tCount) : 0;
            });
        });

        // 応援軍などが居ないのにタブが選ばれていたら、強制的にメインに戻します
        if (!stats.atk[this.activeAtkTab].exists) this.activeAtkTab = 'main';
        if (!stats.def[this.activeDefTab].exists) this.activeDefTab = 'main';

        const curAtk = stats.atk[this.activeAtkTab];
        const curDef = stats.def[this.activeDefTab];

        // 攻撃側の勢力名と総大将名を探す
        let atkClanName = "独立勢力";
        const atkClan = this.game.clans.find(c => c.id === Number(this.warState.attacker.ownerClan));
        if (atkClan) atkClanName = atkClan.name;

        let atkGeneralName = "総大将";
        const atkGeneral = this.units.find(u => u.isAttacker && u.isGeneral);
        if (atkGeneral) atkGeneralName = atkGeneral.name;

        // 守備側の勢力名と総大将名を探す
        let defClanName = "独立勢力";
        if (this.warState.isKunishuSubjugation) {
            const k = this.game.kunishuSystem.getKunishu(this.warState.defender.id);
            if (k) defClanName = k.getName(this.game);
        } else {
            const defClan = this.game.clans.find(c => c.id === Number(this.warState.defender.ownerClan));
            if (defClan) defClanName = defClan.name;
            else if (this.warState.defender.ownerClan === 0) defClanName = "中立勢力";
        }

        let defGeneralName = "総大将";
        const defGeneral = this.units.find(u => !u.isAttacker && u.isGeneral);
        if (defGeneral) defGeneralName = defGeneral.name;

        // タブに表示する名前の準備
        let atkDisplayName = `<strong>${atkClanName} ${atkGeneralName} 軍</strong>`;
        if (this.activeAtkTab === 'self') atkDisplayName = `<strong>${atkClanName} 応援軍</strong>`;
        if (this.activeAtkTab === 'ally') atkDisplayName = `<strong>攻撃側 同盟軍</strong>`;

        let defDisplayName = `<strong>${defClanName} ${defGeneralName} 軍</strong>`;
        if (this.activeDefTab === 'self') defDisplayName = `<strong>${defClanName} 応援軍</strong>`;
        if (this.activeDefTab === 'ally') defDisplayName = `<strong>守備側 同盟軍</strong>`;

        // 値を２行に分けて表示します
        const atkHTML = `${atkDisplayName}<br><div style="margin-top:2px;">兵: ${curAtk.soldiers} / 糧: ${curAtk.rice}<br>士気: ${curAtk.morale} / 訓練: ${curAtk.training}</div>`;
        const defHTML = `${defDisplayName}<br><div style="margin-top:2px;">兵: ${curDef.soldiers} / 糧: ${curDef.rice}<br>士気: ${curDef.morale} / 訓練: ${curDef.training}</div>`;

        const atkEl = document.getElementById('fw-atk-status');
        const defEl = document.getElementById('fw-def-status');
        const atkTabsEl = document.getElementById('fw-atk-tabs');
        const defTabsEl = document.getElementById('fw-def-tabs');
        const atkWrapper = document.getElementById('fw-atk-wrapper');
        const defWrapper = document.getElementById('fw-def-wrapper');

        if (atkEl) atkEl.innerHTML = atkHTML;
        if (defEl) defEl.innerHTML = defHTML;

        // 攻撃側のタブの描画（左から並べます）
        if (atkTabsEl) {
            atkTabsEl.innerHTML = '';
            let tabs = [];
            if (stats.atk.main.exists) tabs.push({ id: 'main', label: '攻撃軍' });
            if (stats.atk.self.exists) tabs.push({ id: 'self', label: '応援軍' });
            if (stats.atk.ally.exists) tabs.push({ id: 'ally', label: '同盟軍' });
            
            if (tabs.length > 1) {
                tabs.forEach(t => {
                    const btn = document.createElement('div');
                    btn.className = `fw-tab attacker ${this.activeAtkTab === t.id ? 'active' : ''}`;
                    btn.innerText = t.label;
                    btn.onclick = () => { this.activeAtkTab = t.id; this.updateStatus(); };
                    atkTabsEl.appendChild(btn);
                });
            }
        }

        // 守備側のタブの描画（右から並べます）
        if (defTabsEl) {
            defTabsEl.innerHTML = '';
            let tabs = [];
            if (stats.def.main.exists) tabs.push({ id: 'main', label: '守備軍' });
            if (stats.def.self.exists) tabs.push({ id: 'self', label: '応援軍' });
            if (stats.def.ally.exists) tabs.push({ id: 'ally', label: '同盟軍' });
            
            // 右端から「守備・応援・同盟」となるように順番をひっくり返します
            tabs.reverse();
            
            if (tabs.length > 1) {
                tabs.forEach(t => {
                    const btn = document.createElement('div');
                    btn.className = `fw-tab defender ${this.activeDefTab === t.id ? 'active' : ''}`;
                    btn.innerText = t.label;
                    btn.onclick = () => { this.activeDefTab = t.id; this.updateStatus(); };
                    defTabsEl.appendChild(btn);
                });
            }
        }

        // プレイヤーの枠を手前に表示します
        const isAtkPlayer = (Number(this.warState.attacker.ownerClan) === Number(this.game.playerClanId));
        const isDefPlayer = (Number(this.warState.defender.ownerClan) === Number(this.game.playerClanId));

        if (atkWrapper && defWrapper) {
            if (isAtkPlayer) {
                atkWrapper.style.order = 1;
                defWrapper.style.order = 2;
            } else if (isDefPlayer) {
                atkWrapper.style.order = 2;
                defWrapper.style.order = 1;
            } else {
                atkWrapper.style.order = 1;
                defWrapper.style.order = 2;
            }
        }

        // 黒帯のターン表示と年月を更新します
        const turnEl = document.getElementById('fw-turn-info');
        if (turnEl) turnEl.innerText = `残りターン ◯/△`.replace('◯', this.turnCount).replace('△', this.maxTurns);

        const dateEl = document.getElementById('fw-date-info');
        if (dateEl && this.game) {
            dateEl.innerText = `${this.game.year}年 ${this.game.month}月`;
        }
    }
    
    updateMenu() {
        if (!this.active) return;
        
        const mainGroup = document.getElementById('fw-menu-main');
        const cmdGroup = document.getElementById('fw-menu-cmd');
        const infoGroup = document.getElementById('fw-menu-info');
        const statusBar = document.getElementById('fw-status-bar');

        if (mainGroup) mainGroup.classList.add('hidden');
        if (cmdGroup) cmdGroup.classList.add('hidden');
        if (infoGroup) infoGroup.classList.add('hidden');

        if (this.isInfoMode) {
            if (statusBar) statusBar.classList.remove('hidden');
            if (infoGroup) infoGroup.classList.remove('hidden');
        } else {
            if (statusBar) statusBar.classList.add('hidden');
            
            if (this.isPlayerTurn()) {
                if (this.isCmdMode) {
                    if (cmdGroup) cmdGroup.classList.remove('hidden');
                } else {
                    if (mainGroup) mainGroup.classList.remove('hidden');
                }
            }
        }
    }
    
    showUnitInfo(unit) {
        const infoEl = document.getElementById('fw-unit-info');
        if (!infoEl) return;
        
        let color = unit.isAttacker ? '#d32f2f' : '#1976d2';
        
        // ★修正: 援軍の種類に合わせて、情報パネルの文字色を変えます！
        if (unit.isSelfReinforcement) {
            // 自勢力の援軍なら、ピンクか水色
            color = unit.isAttacker ? '#f48fb1' : '#4fc3f7';
        } else if (unit.isReinforcement) {
            // 他国の援軍なら、オレンジか緑
            color = unit.isAttacker ? '#ff9800' : '#4caf50';
        } else if (typeof unit.id === 'string' && unit.id.startsWith('k_')) {
            // 諸勢力なら、味方側か敵側かで緑かオレンジ
            if (this.units.some(u => u.isPlayer && !u.isAttacker)) {
                color = '#4caf50';
            } else {
                color = '#ff9800';
            }
        }
        
        let typeName = '足軽';
        if (unit.troopType === 'kiba') typeName = '騎馬';
        if (unit.troopType === 'teppo') typeName = '鉄砲';

        // 大名家や諸勢力の名前を調べる処理
        let clanNameText = "";
        
        if (unit.kunishuId) {
            // 諸勢力の場合：諸勢力の名称を引っ張ってきます
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
        
        // ★追加：専用の箱から、この部隊が所属するグループの士気と訓練度を取り出します！
        let unitMorale = 50;
        let unitTraining = 50;
        if (this.groupStats && this.groupStats[unit.groupId]) {
            unitMorale = this.groupStats[unit.groupId].morale;
            unitTraining = this.groupStats[unit.groupId].training;
        }

        infoEl.innerHTML = `
            <div style="font-weight:bold; color: ${color};">
                ${clanNameText}${unit.name} <span style="font-size:0.8rem; color:#555;">(${typeName})</span>
            </div>
            <div style="font-size:0.9rem; font-weight:bold; display:flex; align-items:baseline; gap:10px;">
                <span>兵士: ${unit.soldiers}</span>
                <span style="font-size:0.75rem; color:#333; font-weight:normal;">士気:${unitMorale} 訓練:${unitTraining}</span>
            </div>
            <div style="font-size:0.8rem; color:#333; display:flex; gap:5px; align-items:center; margin-top:2px;">
                統:${GameSystem.toGradeHTML(unit.stats.ldr)} 
                武:${GameSystem.toGradeHTML(unit.stats.str)} 
                智:${GameSystem.toGradeHTML(unit.stats.int)}
            </div>
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
            if (dist > 3) return false; // ★変更：射程は1〜3マスになりました！
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

                // ★追加: 地形に合わせてCSSのクラスを追加（色を塗る指示）
                if (this.grid && this.grid[row] && this.grid[row][x]) {
                    hex.classList.add(`hex-${this.grid[row][x].terrain}`);
                }
                
                hex.style.left = `${x * (this.hexW * 0.75)}px`;
                hex.style.top = `${y * (this.hexH / 2)}px`;
                
                if (isPlayerTurn && unit && !this.isInfoMode) {
                    if (this.state === 'PHASE_MOVE' || this.state === 'MOVE_PREVIEW') {
                        if (x === unit.x && y === unit.y) {
                            hex.classList.add('current-pos');
                        } else if (this.reachable && this.reachable[`${x},${y}`]) {
                            hex.classList.add('movable');
                        } else if (this.units.some(u => u.x === x && u.y === y && u.isAttacker === unit.isAttacker)) {
                            const enemies = this.units.filter(u => u.isAttacker !== unit.isAttacker);
                            let minStartDist = 999;
                            enemies.forEach(e => {
                                let d = this.getDistance(unit.x, unit.y, e.x, e.y);
                                if (d < minStartDist) minStartDist = d;
                            });
                            
                            // 描画時もそのマスの「地形コスト」を正しく見るようにしました
                            let row_t = Math.floor(y / 2);
                            let terrain_t = (this.grid && this.grid[row_t] && this.grid[row_t][x]) ? this.grid[row_t][x].terrain : 'plain';
                            let baseCost = 1;
                            if (terrain_t === 'forest') baseCost = 2;
                            else if (terrain_t === 'river') baseCost = 3;
                            else if (terrain_t === 'mountain') baseCost = 3;

                            let minEnemyDistToTarget = 999;
                            enemies.forEach(e => {
                                let d = this.getDistance(x, y, e.x, e.y);
                                if (d < minEnemyDistToTarget) minEnemyDistToTarget = d;
                            });

                            // ★追加: ZOCと地形の大きい方を採用
                            let zocCost = (minEnemyDistToTarget <= 2) ? 2 : 1;
                            let costToEnter = Math.max(baseCost, zocCost);
                            
                            if (this.getDistance(unit.x, unit.y, x, y) === 1) {
                                // 自分のすぐ隣にいる味方の場合
                                if (minStartDist === 1) costToEnter = Math.max(baseCost, 4); // 離脱ペナルティ
                                // ★変更: "<=" ではなく "<" にすることで、ここで歩数が尽きる一番外側のマスは塗られません！
                                if (costToEnter < unit.ap) hex.classList.add('movable');
                            } else {
                                // 離れた味方の場合
                                let canPass = false;
                                const neighbors = this.getNeighbors(x, y);
                                for (let n of neighbors) {
                                    let key = `${n.x},${n.y}`;
                                    if (this.reachable && this.reachable[key]) {
                                        // ★変更: ここも "<" にして、通り抜けられる余力があるかを見ます
                                        if (this.reachable[key].cost + costToEnter < unit.ap) {
                                            canPass = true;
                                            break;
                                        }
                                    }
                                }
                                if (canPass) hex.classList.add('movable');
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
        
        if (this.state === 'MOVE_PREVIEW' && this.previewTarget && unit && !this.isInfoMode) {
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
            
            pEl.innerHTML = `<div class="fw-unit-icon"></div><div class="fw-unit-soldiers">${unit.soldiers}</div>`;
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
            
            // ★修正: 自勢力の援軍なら「self-ally」、他国や諸勢力の援軍なら「ally」のタグを足します！
            if (u.isSelfReinforcement) {
                colorClass += ' self-ally'; 
            } else if (u.isReinforcement || (typeof u.id === 'string' && u.id.startsWith('k_'))) {
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
            uEl.innerHTML = `<div class="fw-unit-icon"></div><div class="fw-unit-soldiers">${u.soldiers}</div>`;
            
            this.mapEl.appendChild(uEl);
        });

        this.updateMenu();
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

    // ★修正: 誰が動いているか（unit）を受け取って、騎馬のペナルティを計算できるようにします！
    getCost(x, y, enemies, allies, isFirstStep, startDist, unit) {
        if (enemies.some(e => e.x === x && e.y === y)) return 999;
        if (allies.some(a => a.x === x && a.y === y)) return 999;
        
        let minEnemyDist = 999;
        enemies.forEach(e => {
            let d = this.getDistance(x, y, e.x, e.y);
            if (d < minEnemyDist) minEnemyDist = d;
        });

        let row = Math.floor(y / 2);
        let terrain = (this.grid && this.grid[row] && this.grid[row][x]) ? this.grid[row][x].terrain : 'plain';
        
        let baseCost = 1; // 平地
        if (terrain === 'forest') baseCost = 2; // 森
        else if (terrain === 'river') baseCost = 3; // 川
        else if (terrain === 'mountain') baseCost = 3; // 山

        // ★追加: 騎馬の地形ペナルティ
        if (unit && unit.troopType === 'kiba') {
            if (terrain === 'mountain') return 999; // 山は通行不可！
            if (terrain === 'forest') baseCost += 1; // 森はコスト+1
            if (terrain === 'river') baseCost += 1;  // 川もコスト+1
        }

        let zocCost = 1;
        if (isFirstStep && startDist === 1) zocCost = 4;
        else if (minEnemyDist <= 2) zocCost = 2;

        return Math.max(baseCost, zocCost);
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
                let c = this.getCost(n.x, n.y, enemies, allies, isFirstStep, minStartDist, unit);
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

                let c = 1;
                if (n.x !== targetX || n.y !== targetY) {
                    // ★修正: unit を渡します
                    c = this.getCost(n.x, n.y, enemies, allies, false, 999, unit);
                    if (c >= 999) continue; 
                } else {
                    let row = Math.floor(n.y / 2);
                    let terrain = (this.grid && this.grid[row] && this.grid[row][n.x]) ? this.grid[row][n.x].terrain : 'plain';
                    if (terrain === 'forest') c = 2;
                    else if (terrain === 'river') c = 3;
                    else if (terrain === 'mountain') c = 3;
                    
                    // ★追加: ターゲットマスの計算にも騎馬ペナルティを含めます
                    if (unit.troopType === 'kiba') {
                        if (terrain === 'forest') c += 1;
                        if (terrain === 'river') c += 1;
                    }
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

        // ★追加：AI同士の高速戦闘でブラウザがフリーズしないように、ターンの最初に少しだけ息継ぎをします！
        const isPlayerInvolved = this.units.some(u => u.isPlayer);
        if (!isPlayerInvolved) {
            setTimeout(() => this.processQueue(), 0);
        } else {
            this.processQueue();
        }
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

        this.isInfoMode = false;
        this.isCmdMode = false;
        this.hideUnitInfo();
        this.updateMenu();
        
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
                setTimeout(() => this.processAITurn(), 600);
            } else {
                this.processAITurn(); // ★プレイヤーがいなければウェイトなしで即実行！
            }
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

            const isPlayerInvolved = this.units.some(u => u.isPlayer);
            if (isPlayerInvolved) {
                this.updateMap();
                this.updateStatus();
                setTimeout(() => this.nextPhaseTurn(), 300);
            } else {
                this.nextPhaseTurn();
            }
        }
    }

    nextPhaseTurn() {
        if (this.checkEndCondition()) return;
        this.turnQueue.shift();
        this.processQueue();
    }
    
    consumeRice() {
        // グループごとに兵士数を数えて、兵糧を減らします
        let groupSoldiers = {};
        this.units.forEach(u => {
            if (!groupSoldiers[u.groupId]) groupSoldiers[u.groupId] = 0;
            groupSoldiers[u.groupId] += u.soldiers;
        });

        // 野戦独自の兵糧消費量（兵士数 × 0.005）
        const consumeRate = 0.005;
        
        for (let key in groupSoldiers) {
            if (this.groupStats[key]) {
                let cons = Math.floor(groupSoldiers[key] * consumeRate);
                this.groupStats[key].rice = Math.max(0, this.groupStats[key].rice - cons);
            }
        }
    }

    // ★追加: 個別部隊の撤退処理
    retreatUnit(unit) {
        // 撤退済みリストに追加（終了時に兵士数を回収するため）
        if (!this.retreatedUnits) this.retreatedUnits = [];
        this.retreatedUnits.push(unit);
        
        // 戦場から部隊を消す
        this.units = this.units.filter(u => u.id !== unit.id);
        
        // マップとステータスを更新し、行動済み扱いにして次の部隊へ
        unit.hasActionDone = true;
        this.state = 'IDLE';

        const isPlayerInvolved = this.units.some(u => u.isPlayer);
        if (isPlayerInvolved) {
            this.updateMap();
            this.updateStatus();
            setTimeout(() => {
                this.nextPhaseTurn();
            }, 500);
        } else {
            this.nextPhaseTurn();
        }
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
            if (isAtkPlayer) this.log(`総大将が撃破され、我が軍は敗北しました……`);
            else if (isDefPlayer) this.log(`敵の総大将を撃破しました！`);
            else this.log(`攻撃軍の総大将が敗走した！`);
            this.endFieldWar('attacker_lose');
            return true;
        }
        if (!defAlive || !defGeneralAlive) {
            if (isAtkPlayer) this.log(`敵の総大将を撃破しました！`);
            else if (isDefPlayer) this.log(`総大将が撃破され、我が軍は敗北しました……`);
            else this.log(`守備軍の総大将が敗走した！`);
            this.endFieldWar('attacker_win');
            return true;
        }
        
        let atkTotalRice = 0, defTotalRice = 0;
        for (let key in this.groupStats) {
            if (!this.groupStats[key]) continue;
            if (key.startsWith('atk_')) atkTotalRice += this.groupStats[key].rice;
            else if (key.startsWith('def_')) defTotalRice += this.groupStats[key].rice;
        }

        if (atkTotalRice <= 0) {
            if (isAtkPlayer) this.log(`兵糧が尽き、これ以上の行軍は不可能です……`);
            else if (isDefPlayer) this.log(`${enemyName}は兵糧が尽き、撤退していきました！`);
            else this.log(`兵糧が尽き、攻撃軍は撤退を余儀なくされた！`);
            this.endFieldWar('attacker_lose');
            return true;
        }
        if (defTotalRice <= 0) {
            if (isAtkPlayer) this.log(`${enemyName}の兵糧が尽き、城へ敗走していきました！`);
            else if (isDefPlayer) this.log(`兵糧が底を突き、戦線を維持できません……`);
            else this.log(`兵糧が尽き、守備軍は城へ敗走した！`);
            this.endFieldWar('attacker_win');
            return true;
        }
        
        if (this.turnCount > this.maxTurns) {
            if (isAtkPlayer) this.log(`これ以上の野戦は不利と判断し撤退します……`);
            else if (isDefPlayer) this.log(`${enemyName}は攻めきれずに撤退していきました！`);
            else this.log(`野戦では決着がつかず、攻撃軍は撤退を余儀なくされた！`);
            this.endFieldWar('attacker_retreat');
            return true;
        }
        return false;
    }
    
    endFieldWar(resultType) {
        this.active = false;
        
        let atkSoldiers = 0, defSoldiers = 0;
        let atkHorses = 0, atkGuns = 0;
        let defHorses = 0, defGuns = 0;

        // ★追加：援軍の兵士や馬たちを入れる、別々の箱を用意します！
        let atkAllyReinfSoldiers = 0, atkAllyReinfHorses = 0, atkAllyReinfGuns = 0;
        let atkSelfReinfSoldiers = 0, atkSelfReinfHorses = 0, atkSelfReinfGuns = 0;
        let defAllyReinfSoldiers = 0, defAllyReinfHorses = 0, defAllyReinfGuns = 0;
        let defSelfReinfSoldiers = 0, defSelfReinfHorses = 0, defSelfReinfGuns = 0;

        if (this.warState.atkAssignments) {
            this.warState.atkAssignments.forEach(a => a.soldiers = 0);
        }
        if (this.warState.defAssignments) {
            this.warState.defAssignments.forEach(a => a.soldiers = 0);
        }

        // ★追加：戦場に残っている部隊と、すでに撤退した部隊を合わせて計算します！
        let allUnits = [...this.units];
        if (this.retreatedUnits) {
            allUnits = allUnits.concat(this.retreatedUnits);
        }

        allUnits.forEach(u => {
            if (u.isAttacker) {
                // ★修正：メインの部隊か、援軍かを見分けて、別々の箱にしまいます！
                if (u.isReinforcement) {
                    if (u.isSelfReinforcement) {
                        atkSelfReinfSoldiers += u.soldiers;
                        if (u.troopType === 'kiba') atkSelfReinfHorses += u.soldiers;
                        if (u.troopType === 'teppo') atkSelfReinfGuns += u.soldiers;
                    } else {
                        atkAllyReinfSoldiers += u.soldiers;
                        if (u.troopType === 'kiba') atkAllyReinfHorses += u.soldiers;
                        if (u.troopType === 'teppo') atkAllyReinfGuns += u.soldiers;
                    }
                } else {
                    atkSoldiers += u.soldiers;
                    if (u.troopType === 'kiba') atkHorses += u.soldiers;
                    if (u.troopType === 'teppo') atkGuns += u.soldiers;
                }
                
                if (this.warState.atkAssignments) {
                    const assign = this.warState.atkAssignments.find(a => a.busho.id === u.bushoId);
                    if (assign) assign.soldiers = u.soldiers;
                }
            } else {
                if (typeof u.id === 'string' && !u.id.startsWith('k_')) {
                    // ★修正：守備側も同じように、メインと援軍を見分けて別の箱にしまいます！
                    if (u.isReinforcement) {
                        if (u.isSelfReinforcement) {
                            defSelfReinfSoldiers += u.soldiers;
                            if (u.troopType === 'kiba') defSelfReinfHorses += u.soldiers;
                            if (u.troopType === 'teppo') defSelfReinfGuns += u.soldiers;
                        } else {
                            defAllyReinfSoldiers += u.soldiers;
                            if (u.troopType === 'kiba') defAllyReinfHorses += u.soldiers;
                            if (u.troopType === 'teppo') defAllyReinfGuns += u.soldiers;
                        }
                    } else {
                        defSoldiers += u.soldiers;
                        if (u.troopType === 'kiba') defHorses += u.soldiers;
                        if (u.troopType === 'teppo') defGuns += u.soldiers;
                    }
                    
                    if (this.warState.defAssignments) {
                        const assign = this.warState.defAssignments.find(a => a.busho.id === u.bushoId);
                        if (assign) assign.soldiers = u.soldiers;
                    }
                }
            }
        });
        
        // メインの攻撃軍のデータを更新
        this.warState.attacker.soldiers = atkSoldiers;
        this.warState.attacker.horses = atkHorses;
        this.warState.attacker.guns = atkGuns;
        if (this.groupStats['atk_main']) {
            this.warState.attacker.rice = this.groupStats['atk_main'].rice;
            this.warState.attacker.morale = this.groupStats['atk_main'].morale; 
        }

        // ★追加：野戦終了時の死者数をしっかりメモ用紙（fieldDeadSoldiers）に書き留めます！
        if (!this.warState.fieldDeadSoldiers) {
            this.warState.fieldDeadSoldiers = { attacker: 0, defender: 0 };
        }
        this.warState.fieldDeadSoldiers.attacker = this.warState.deadSoldiers.attacker;
        this.warState.fieldDeadSoldiers.defender = this.warState.deadSoldiers.defender;

        // ★追加：攻撃側の「同盟国からの援軍」のデータを更新
        if (this.warState.reinforcement) {
            this.warState.reinforcement.fieldLoss = Math.max(0, this.warState.reinforcement.soldiers - atkAllyReinfSoldiers);
            this.warState.reinforcement.soldiers = atkAllyReinfSoldiers;
            this.warState.reinforcement.horses = atkAllyReinfHorses;
            this.warState.reinforcement.guns = atkAllyReinfGuns;
            if (this.groupStats['atk_ally']) {
                this.warState.reinforcement.rice = this.groupStats['atk_ally'].rice;
                this.warState.reinforcement.morale = this.groupStats['atk_ally'].morale;
            }
        }

        // ★追加：攻撃側の「自分の別の城からの援軍」のデータを更新
        if (this.warState.selfReinforcement) {
            this.warState.selfReinforcement.fieldLoss = Math.max(0, this.warState.selfReinforcement.soldiers - atkSelfReinfSoldiers);
            this.warState.selfReinforcement.soldiers = atkSelfReinfSoldiers;
            this.warState.selfReinforcement.horses = atkSelfReinfHorses;
            this.warState.selfReinforcement.guns = atkSelfReinfGuns;
            if (this.groupStats['atk_self']) {
                this.warState.selfReinforcement.rice = this.groupStats['atk_self'].rice;
                this.warState.selfReinforcement.morale = this.groupStats['atk_self'].morale;
            }
        }

        // メインの守備軍のデータを更新
        this.warState.defender.fieldSoldiers = defSoldiers;
        this.warState.defender.fieldHorses = defHorses;
        this.warState.defender.fieldGuns = defGuns;
        if (this.groupStats['def_main']) {
            this.warState.defFieldRice = this.groupStats['def_main'].rice;
            this.warState.defender.morale = this.groupStats['def_main'].morale; 
        }

        // ★追加：守備側の「同盟国からの援軍」のデータを更新
        if (this.warState.defReinforcement) {
            this.warState.defReinforcement.fieldLoss = Math.max(0, this.warState.defReinforcement.soldiers - defAllyReinfSoldiers);
            this.warState.defReinforcement.soldiers = defAllyReinfSoldiers;
            this.warState.defReinforcement.horses = defAllyReinfHorses;
            this.warState.defReinforcement.guns = defAllyReinfGuns;
            if (this.groupStats['def_ally']) {
                this.warState.defReinforcement.rice = this.groupStats['def_ally'].rice;
                this.warState.defReinforcement.morale = this.groupStats['def_ally'].morale;
            }
        }

        // ★追加：守備側の「自分の別の城からの援軍」のデータを更新
        if (this.warState.defSelfReinforcement) {
            this.warState.defSelfReinforcement.fieldLoss = Math.max(0, this.warState.defSelfReinforcement.soldiers - defSelfReinfSoldiers);
            this.warState.defSelfReinforcement.soldiers = defSelfReinfSoldiers;
            this.warState.defSelfReinforcement.horses = defSelfReinfHorses;
            this.warState.defSelfReinforcement.guns = defSelfReinfGuns;
            if (this.groupStats['def_self']) {
                this.warState.defSelfReinforcement.rice = this.groupStats['def_self'].rice;
                this.warState.defSelfReinforcement.morale = this.groupStats['def_self'].morale;
            }
        }
        
        // ★追加：ここで「兵士が0人」になってしまった援軍部隊を、攻城戦に参加させずに「撤退」扱いにします！
        if (this.game.warManager && typeof this.game.warManager.retreatReinforcementForce === 'function') {
            if (this.warState.reinforcement && this.warState.reinforcement.soldiers <= 0) this.game.warManager.retreatReinforcementForce('reinforcement');
            if (this.warState.selfReinforcement && this.warState.selfReinforcement.soldiers <= 0) this.game.warManager.retreatReinforcementForce('selfReinforcement');
            if (this.warState.defReinforcement && this.warState.defReinforcement.soldiers <= 0) this.game.warManager.retreatReinforcementForce('defReinforcement');
            if (this.warState.defSelfReinforcement && this.warState.defSelfReinforcement.soldiers <= 0) this.game.warManager.retreatReinforcementForce('defSelfReinforcement');
        }

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

        if (this.isInfoMode) {
            if (clickedUnit) {
                this.showUnitInfo(clickedUnit);
            } else {
                this.hideUnitInfo();
            }
            return;
        }

        this.hideUnitInfo();

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

    executeAttack(attacker, defender) {
        // それぞれの部隊の専用の箱から、士気と訓練度を取り出します
        let atkMorale = this.groupStats[attacker.groupId] ? this.groupStats[attacker.groupId].morale : 50;
        let atkTraining = this.groupStats[attacker.groupId] ? this.groupStats[attacker.groupId].training : 50;
        let defMorale = this.groupStats[defender.groupId] ? this.groupStats[defender.groupId].morale : 50;
        let defTraining = this.groupStats[defender.groupId] ? this.groupStats[defender.groupId].training : 50;

        // 【野戦独自のダメージ計算】
        let atkS = Math.max(0, attacker.soldiers);
        let defS = Math.max(0, defender.soldiers);

        // 1. 基礎攻撃力・基礎防御力の計算
        let atkBaseAtk = Math.sqrt(atkS) + (attacker.stats.ldr * 1.5 + attacker.stats.str) * (atkS / (atkS + 150));
        let atkBaseDef = Math.sqrt(atkS) + (attacker.stats.ldr * 1.5 + attacker.stats.int) * (atkS / (atkS + 150));
        
        let defBaseAtk = Math.sqrt(defS) + (defender.stats.ldr * 1.5 + defender.stats.str) * (defS / (defS + 150));
        let defBaseDef = Math.sqrt(defS) + (defender.stats.ldr * 1.5 + defender.stats.int) * (defS / (defS + 150));

        // 2. 最終攻撃力・最終防御力の計算（士気・訓練による補正）
        let atkFinalAtk = atkBaseAtk * (1 + (atkMorale * 1.5 + atkTraining) / 1000);
        let atkFinalDef = atkBaseDef * (1 + (atkMorale + atkTraining * 1.5) / 1000);

        let defFinalAtk = defBaseAtk * (1 + (defMorale * 1.5 + defTraining) / 1000);
        let defFinalDef = defBaseDef * (1 + (defMorale + defTraining * 1.5) / 1000);

        // 3. 向きによる補正の判定
        let atkDirIndex = this.getDirection(attacker.x, attacker.y, defender.x, defender.y);
        let defDirIndex = defender.direction;
        let oppositeAtkDir = (atkDirIndex + 3) % 6;
        let defToAtkDiff = Math.abs(defDirIndex - oppositeAtkDir);
        defToAtkDiff = Math.min(defToAtkDiff, 6 - defToAtkDiff); 

        if (attacker.troopType === 'teppo') {
            defToAtkDiff = 0; // 鉄砲は常に正面扱い
        }

        let dirMult = 1.0;
        if (defToAtkDiff === 3) dirMult = 0.5; // 背後
        else if (defToAtkDiff === 2) dirMult = 0.8; // 側面

        // 防御側のステータスに向き補正を適用
        defFinalDef = defFinalDef * dirMult;
        defFinalAtk = defFinalAtk * (dirMult * 0.5);

        // 4. 兵科による攻撃力のボーナス計算
        let atkToDefDiff = Math.abs(attacker.direction - atkDirIndex);
        atkToDefDiff = Math.min(atkToDefDiff, 6 - atkToDefDiff);

        let atkWeaponMult = 1.0;
        if (attacker.troopType === 'kiba') {
            if (atkToDefDiff === 0) atkWeaponMult = 1.2; // 正面から突撃
            else if (atkToDefDiff === 1) atkWeaponMult = 1.1; // 前斜めから突撃
        } else if (attacker.troopType === 'teppo') {
            let dist = this.getDistance(attacker.x, attacker.y, defender.x, defender.y);
            if (dist === 1) {
                atkWeaponMult = 0.3; // 隣接時は威力が落ちる
            } else {
                atkWeaponMult = 1.2; // 遠距離なら威力が上がる
            }
        }
        atkFinalAtk = atkFinalAtk * atkWeaponMult;

        // 5. 兵科による防御力のペナルティ計算（打たれ弱さ）
        let defWeaponMult = 1.0;
        if (defender.troopType === 'kiba') {
            if (defToAtkDiff === 2 || defToAtkDiff === 3) defWeaponMult = 0.9; // 側面や背後から攻撃されると防御力ダウン
        } else if (defender.troopType === 'teppo') {
            defWeaponMult = 0.8; // 鉄砲は常に防御力ダウン
        }
        defFinalDef = defFinalDef * defWeaponMult;

        // 6. 地形による防御力の補正
        let row = Math.floor(defender.y / 2);
        let terrain = (this.grid && this.grid[row] && this.grid[row][defender.x]) ? this.grid[row][defender.x].terrain : 'plain';
        
        let terrainMult = 1.0;
        if (terrain === 'forest') terrainMult = 1.1;      // 森は防御力アップ
        else if (terrain === 'mountain') terrainMult = 1.2; // 山はさらに防御力アップ
        else if (terrain === 'river') terrainMult = 0.8;    // 川は防御力ダウン
        defFinalDef = defFinalDef * terrainMult;

        // 7. 与ダメージ計算
        let dmgRatio = (atkFinalAtk + defFinalDef) > 0 ? (atkFinalAtk / (atkFinalAtk + defFinalDef)) : 0;
        let dmgToDef = Math.floor(atkFinalAtk * dmgRatio);

        // 8. 反撃ダメージ計算
        let dmgToAtk = 0;
        const dist = this.getDistance(attacker.x, attacker.y, defender.x, defender.y);
        if (dist === 1) { // 反撃は距離1のときのみ
            let counterRatio = (atkFinalAtk + defFinalDef) > 0 ? (defFinalDef / (atkFinalAtk + defFinalDef)) : 0;
            dmgToAtk = Math.floor(defFinalAtk * 0.5 * counterRatio);
        }

        // ダメージ適用（兵数以上のダメージは受けないようにガード）
        dmgToDef = Math.min(defender.soldiers, dmgToDef);
        dmgToAtk = Math.min(attacker.soldiers, dmgToAtk);

        defender.soldiers -= dmgToDef;
        attacker.soldiers -= dmgToAtk;

        // 野戦での被害を負傷兵の箱（deadSoldiers）に記録します
        if (attacker.isAttacker) {
            this.warState.deadSoldiers.defender += dmgToDef;
            this.warState.deadSoldiers.attacker += dmgToAtk;
        } else {
            this.warState.deadSoldiers.attacker += dmgToDef;
            this.warState.deadSoldiers.defender += dmgToAtk;
        }
        
        let dirMsg = "";
        if (defToAtkDiff === 3) dirMsg = "（背後からの強襲！）";
        else if (defToAtkDiff === 2) dirMsg = "（側面からの攻撃！）";
        
        let atkWeapon = "攻撃";
        if (attacker.troopType === 'teppo') atkWeapon = "射撃";
        else if (attacker.troopType === 'kiba') atkWeapon = "突撃";

        let counterMsg = (dmgToAtk > 0) ? ` 反撃で${dmgToAtk}の被害！` : ``;

        this.log(`${attacker.name}隊の${atkWeapon}！${dirMsg} 敵に${dmgToDef}の損害！${counterMsg}`);
        
        if (defender.soldiers <= 0) {
            this.log(`${defender.name}隊が壊滅した！`);
            this.units = this.units.filter(u => u.id !== defender.id);
            
            // 壊滅した陣営の士気ダウン（本人は-3、友軍は-1）
            const losePrefix = defender.isAttacker ? 'atk_' : 'def_';
            for (let key in this.groupStats) {
                if (key.startsWith(losePrefix) && this.groupStats[key]) {
                    let drop = (key === defender.groupId) ? 3 : 1;
                    this.groupStats[key].morale = Math.max(0, this.groupStats[key].morale - drop);
                }
            }
            // 倒した陣営の士気アップ（本人は+3、友軍は+1）
            const winPrefix = attacker.isAttacker ? 'atk_' : 'def_';
            for (let key in this.groupStats) {
                if (key.startsWith(winPrefix) && this.groupStats[key]) {
                    let rise = (key === attacker.groupId) ? 3 : 1;
                    this.groupStats[key].morale = Math.min(120, this.groupStats[key].morale + rise);
                }
            }
            this.log(`部隊の壊滅により、${defender.name}隊が所属する軍の士気が大きく下がり、友軍の士気も下がった！`);
            this.log(`${attacker.name}隊が所属する軍の士気が大きく上がり、友軍の士気も上がった！`);
        }
        if (attacker.soldiers <= 0) {
            this.log(`${attacker.name}隊が壊滅した！`);
            this.units = this.units.filter(u => u.id !== attacker.id);
            
            // 壊滅した陣営の士気ダウン（本人は-3、友軍は-1）
            const losePrefix = attacker.isAttacker ? 'atk_' : 'def_';
            for (let key in this.groupStats) {
                if (key.startsWith(losePrefix) && this.groupStats[key]) {
                    let drop = (key === attacker.groupId) ? 3 : 1;
                    this.groupStats[key].morale = Math.max(0, this.groupStats[key].morale - drop);
                }
            }
            // 倒した陣営の士気アップ（本人は+3、友軍は+1）
            const winPrefix = defender.isAttacker ? 'atk_' : 'def_';
            for (let key in this.groupStats) {
                if (key.startsWith(winPrefix) && this.groupStats[key]) {
                    let rise = (key === defender.groupId) ? 3 : 1;
                    this.groupStats[key].morale = Math.min(120, this.groupStats[key].morale + rise);
                }
            }
            this.log(`部隊の壊滅により、${attacker.name}隊が所属する軍の士気が大きく下がり、友軍の士気も下がった！`);
            this.log(`${defender.name}隊が所属する軍の士気が大きく上がり、友軍の士気も上がった！`);
        }
        
        attacker.hasActionDone = true;
        this.state = 'IDLE';
        
        const isPlayerInvolved = this.units.some(u => u.isPlayer);
        if (isPlayerInvolved) {
            this.updateMap();
            this.updateStatus();
            setTimeout(() => {
                this.nextPhaseTurn();
            }, 800);
        } else {
            this.nextPhaseTurn();
        }
    }

    // ★修正: AIの行動スコアに「智謀」「性格」に加えて「孤立ペナルティ（5マス以上離れない）」を追加！
    async processAITurn() {
        if (!this.active) return;
        const unit = this.turnQueue[0];
        const enemies = this.units.filter(u => u.isAttacker !== unit.isAttacker);
        const allies = this.units.filter(u => u.isAttacker === unit.isAttacker && u.id !== unit.id);
        
        if (enemies.length === 0) {
            this.nextPhaseTurn();
            return;
        }

        const isPlayerInvolved = this.units.some(u => u.isPlayer);
        if (isPlayerInvolved) {
            await new Promise(r => setTimeout(r, 600)); 
        }

        // --- 武将のデータ（智謀・性格）を読み込む ---
        const myBusho = this.game.getBusho(unit.bushoId);
        const myInt = myBusho ? myBusho.intelligence : 50;
        const myPersonality = myBusho ? myBusho.personality : 'balanced';

        // 智謀による「揺らぎ（ブレ）」の倍率
        const randMult = Math.max(0, (90 - myInt) / 40);

        // --- 戦力差撤退判定 ---
        let allySoldiers = unit.soldiers, enemySoldiers = 0;
        allies.forEach(a => allySoldiers += a.soldiers);
        enemies.forEach(e => enemySoldiers += e.soldiers);
        
        // ★修正: 総大将なら全軍撤退、一般部隊なら個別撤退の判断をします
        if (unit.isGeneral && (allySoldiers < enemySoldiers * 0.2)) {
            if (isPlayerInvolved) {
                if (unit.isAttacker) this.log(`${unit.name}軍は攻略を諦め、引き揚げていきました！`);
                else this.log(`${unit.name}軍は不利を悟り、戦場から離脱しました！`);
            }
            this.endFieldWar(unit.isAttacker ? 'attacker_retreat' : 'defender_retreat');
            return;
        } else if (!unit.isGeneral && (unit.soldiers <= 200 || unit.soldiers < enemySoldiers * 0.05)) {
            // 一般部隊は、自分の兵士が少なすぎるか、敵全体に対して少なすぎたら逃げる
            if (isPlayerInvolved) this.log(`${unit.name}隊は被害が大きく、戦場から撤退しました！`);
            this.retreatUnit(unit);
            return;
        }

        const maxEnemySoldiers = Math.max(...enemies.map(e => e.soldiers), 1);
        const maxAllySoldiers = Math.max(...allies.map(a => a.soldiers), unit.soldiers, 1);

        // --- 1. ターゲット敵の選定 (スコア制) ---
        let targetEnemy = null;
        let bestTargetScore = -Infinity;
        
        enemies.forEach(e => {
            let score = 0;
            let d = this.getDistance(unit.x, unit.y, e.x, e.y);
            
            score += (50 - d * 2); 
            score += ((maxEnemySoldiers - e.soldiers) / maxEnemySoldiers) * 20; 
            if (e.isGeneral) score += 30; 
            if (e.troopType === 'teppo') score += 20; 
            
            // ★追加: 味方と隣接して戦っている敵を優先的に狙って前に出るようにします！
            let isEngaged = false;
            for (let a of allies) {
                if (this.getDistance(e.x, e.y, a.x, a.y) === 1) {
                    isEngaged = true;
                    break;
                }
            }
            if (isEngaged) score += 30;
            
            score += Math.random() * 10 * randMult; 
            
            if (score > bestTargetScore) {
                bestTargetScore = score;
                targetEnemy = e;
            }
        });

        let distToTarget = this.getDistance(unit.x, unit.y, targetEnemy.x, targetEnemy.y);

        // --- 2. 逃走・移動判定 ---
        if (unit.troopType === 'teppo') {
            if (allies.length === 0 && distToTarget === 1) {
                // ★修正: 総大将なら全軍撤退、一般部隊なら個別撤退
                if (unit.isGeneral) {
                    if (isPlayerInvolved) this.log(`${unit.name}軍は不利を悟り、戦場から離脱しました！`);
                    this.endFieldWar(unit.isAttacker ? 'attacker_retreat' : 'defender_retreat');
                } else {
                    if (isPlayerInvolved) this.log(`${unit.name}隊は不利を悟り、戦場から撤退しました！`);
                    this.retreatUnit(unit);
                }
                return;
            }
        }
        
        let isFleeing = (unit.troopType === 'teppo' && distToTarget === 1);
        let shouldMove = true;
        
        if (unit.troopType !== 'teppo' && distToTarget === 1) {
            shouldMove = false; 
        }

        // --- 3. 移動先マスの選定 (スコア制) ---
        if (shouldMove) {
            let reachable = this.findPaths(unit, unit.ap - 1); 
            let bestTargetHex = null;
            let bestMoveScore = -Infinity;
            
            const mySoldierRatio = unit.soldiers / maxAllySoldiers; 
            
            let allyMinDistToTarget = 999;
            allies.forEach(a => {
                let d = this.getDistance(a.x, a.y, targetEnemy.x, targetEnemy.y);
                if (d < allyMinDistToTarget) allyMinDistToTarget = d;
            });

            let aStarPath = this.findAStarPath(unit, targetEnemy.x, targetEnemy.y);
            let aStarIdealHexes = {};
            if (aStarPath && !isFleeing) {
                let accumulatedCost = 0;
                for (let i = 0; i < aStarPath.length; i++) {
                    let step = aStarPath[i];
                    accumulatedCost += step.cost;
                    if (accumulatedCost <= unit.ap - 1) {
                        aStarIdealHexes[`${step.x},${step.y}`] = true;
                    } else break;
                }
            }

            const idealDir = this.getDirection(targetEnemy.x, targetEnemy.y, unit.x, unit.y);
            reachable[`${unit.x},${unit.y}`] = { cost: 0, path: [] };

            for (let key in reachable) {
                let parts = key.split(',');
                let nx = parseInt(parts[0]);
                let ny = parseInt(parts[1]);
                let hexInfo = reachable[key];
                
                let score = 0;
                let dToEnemy = this.getDistance(nx, ny, targetEnemy.x, targetEnemy.y);

                // ★追加: 最終的に止まるマスの「地形」を見てスコアを調整します
                let row_t = Math.floor(ny / 2);
                let terrain_t = (this.grid && this.grid[row_t] && this.grid[row_t][nx]) ? this.grid[row_t][nx].terrain : 'plain';
                
                if (terrain_t === 'river') {
                    score -= 20; // 川の上で止まると被ダメージが増えるので極力避ける！
                } else if (terrain_t === 'mountain') {
                    score += 15; // 山は防御力が上がるので、陣取るには良い場所！
                } else if (terrain_t === 'forest') {
                    score += 10; // 森も防御力が少し上がるので好き
                }

                if (isFleeing) {
                    if (dToEnemy >= distToTarget) {
                        score += dToEnemy * 50;
                        let dirToCell = this.getDirection(targetEnemy.x, targetEnemy.y, nx, ny);
                        let dirDiff = Math.abs(idealDir - dirToCell);
                        dirDiff = Math.min(dirDiff, 6 - dirDiff);
                        score -= dirDiff * 20; 
                    } else {
                        score -= 9999;
                    }
                } else {
                    if (aStarIdealHexes[`${nx},${ny}`]) score += 30; 

                    if (unit.troopType === 'teppo') {
                        if (dToEnemy === 2) score += 100;
                        else if (dToEnemy === 3) score += 80;
                        else if (dToEnemy === 1) score -= 100;
                        else score -= dToEnemy * 10;
                    } else {
                        score -= dToEnemy * 20; 
                        const friendlyTeppos = allies.filter(a => a.troopType === 'teppo');
                        friendlyTeppos.forEach(teppo => {
                            let dToTeppo = this.getDistance(nx, ny, teppo.x, teppo.y);
                            let teppoToEnemy = this.getDistance(teppo.x, teppo.y, targetEnemy.x, targetEnemy.y);
                            if (dToTeppo === 1 && dToEnemy < teppoToEnemy) {
                                score += 50; 
                            }
                        });
                    }

                    // 性格による前進意欲の調整
                    if (myPersonality === 'aggressive') {
                        score -= dToEnemy * 3; 
                    } else if (myPersonality === 'conservative') {
                        score += dToEnemy * 3; 
                    }

                    // 総大将の引きこもり評価
                    if (unit.isGeneral && myPersonality !== 'aggressive' && allies.length > 0) {
                        if (dToEnemy <= allyMinDistToTarget) {
                            score -= 200; 
                        } else {
                            score += dToEnemy * 10; 
                        }
                    }

                    // ★追加: 孤立ペナルティ（一番近い味方と5マス以上離れると怖がってスコアを下げる）
                    if (allies.length > 0) {
                        let minDistToAlly = 999;
                        allies.forEach(a => {
                            let dToAlly = this.getDistance(nx, ny, a.x, a.y);
                            if (dToAlly < minDistToAlly) minDistToAlly = dToAlly;
                        });
                        
                        // 一番近い味方でも5マス以上離れているなら減点！
                        if (minDistToAlly >= 5) {
                            // 5マスなら-40点、6マスなら-80点...と、離れるほど強く嫌がるようにします
                            score -= (minDistToAlly - 4) * 40; 
                        }
                    }
                }

                // 智謀の倍率を掛けて、動きのブレを計算
                score += Math.random() * 5 * randMult; 

                if (score > bestMoveScore) {
                    bestMoveScore = score;
                    bestTargetHex = { x: nx, y: ny, cost: hexInfo.cost, path: hexInfo.path };
                }
            }

            if (bestTargetHex && (bestTargetHex.x !== unit.x || bestTargetHex.y !== unit.y)) {
                let path = bestTargetHex.path;
                if (path && path.length > 0) {
                    let fromX = unit.x;
                    let fromY = unit.y;
                    if (path.length > 1) {
                        let prevStep = path[path.length - 2];
                        fromX = prevStep.x;
                        fromY = prevStep.y;
                    }
                    unit.direction = this.getDirection(fromX, fromY, bestTargetHex.x, bestTargetHex.y);
                }

                unit.ap -= bestTargetHex.cost;
                unit.x = bestTargetHex.x;
                unit.y = bestTargetHex.y;
                unit.hasMoved = true;
                if (isPlayerInvolved) {
                    this.log(`${unit.name}隊が${isFleeing ? '後退' : '移動'}。`);
                    this.updateMap();
                    this.updateStatus();
                    await new Promise(r => setTimeout(r, 400));
                }
            }
        }

        // --- 4. 攻撃対象の再選定 ---
        let finalTargetEnemy = null;
        let finalBestScore = -Infinity;
        
        enemies.forEach(e => {
            // ★修正: 「もし敵の方を振り向いたとしたら」という仮の姿を作って、攻撃できるかチェックします！
            let targetDir = this.getDirection(unit.x, unit.y, e.x, e.y);
            let turnCost = this.getTurnCost(unit.direction, targetDir);
            let tempUnit = Object.assign({}, unit);
            tempUnit.direction = targetDir; // 仮に敵の方を向かせる

            // 振り向く体力（turnCost）を引いても攻撃できるかチェック！
            if (unit.ap >= turnCost && this.canAttackTarget(tempUnit, e.x, e.y)) {
                let score = 0;
                let d = this.getDistance(unit.x, unit.y, e.x, e.y);
                score += (50 - d * 2); 
                if (maxEnemySoldiers > 0) score += ((maxEnemySoldiers - e.soldiers) / maxEnemySoldiers) * 20; 
                if (e.isGeneral) score += 30; 
                if (e.troopType === 'teppo') score += 20; 
                
                if (targetEnemy && e.id === targetEnemy.id) score += 50; 
                
                // ★追加: 背面や側面を向いている敵なら大チャンスとしてスコアアップ！（鉄砲は除外）
                if (unit.troopType !== 'teppo') {
                    let atkDirIndex = this.getDirection(unit.x, unit.y, e.x, e.y);
                    let oppositeAtkDir = (atkDirIndex + 3) % 6; // 相手から見たこちらの方向
                    let defToAtkDiff = Math.abs(e.direction - oppositeAtkDir);
                    defToAtkDiff = Math.min(defToAtkDiff, 6 - defToAtkDiff); 
                    
                    if (defToAtkDiff === 3) score += 40; // 背後（大ダメージのチャンス！）
                    else if (defToAtkDiff === 2) score += 20; // 側面
                }

                // ★追加: 味方と隣接して戦っている敵を優先して叩く！
                let isEngaged = false;
                for (let a of allies) {
                    if (this.getDistance(e.x, e.y, a.x, a.y) === 1) {
                        isEngaged = true;
                        break;
                    }
                }
                if (isEngaged) score += 30;
                
                score += Math.random() * 5 * randMult;

                if (score > finalBestScore) {
                    finalBestScore = score;
                    finalTargetEnemy = e;
                }
            }
        });

        if (finalTargetEnemy) {
            let targetDir = this.getDirection(unit.x, unit.y, finalTargetEnemy.x, finalTargetEnemy.y);
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
        } else {
            let targetDir = this.getDirection(unit.x, unit.y, targetEnemy.x, targetEnemy.y);
            let turnCost = this.getTurnCost(unit.direction, targetDir);
            if (unit.ap >= turnCost && turnCost > 0) {
                unit.ap -= turnCost;
                unit.direction = targetDir;
                if (isPlayerInvolved) {
                    this.updateMap();
                    await new Promise(r => setTimeout(r, 100));
                }
            }
        }

        // --- 5. 攻撃処理 ---
        if (finalTargetEnemy && unit.ap >= 1) {
            unit.ap -= 1;
            this.executeAttack(unit, finalTargetEnemy);
            return; 
        }

        if (isPlayerInvolved) this.log(`${unit.name}隊は待機した。`);
        this.nextPhaseTurn();
    }
}

window.FieldWarManager = FieldWarManager;