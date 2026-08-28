console.log("【確認】field_war.js の読み込みを開始しました！");

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
        this.weather = 'sunny'; // ★追加：天候を覚える箱（sunny:晴れ, rain:雨）
        // 描画更新ごとのDOM検索・全HEX走査を避けるための軽量キャッシュ。
        this._fwUnitElementCache = new Map();
        this._fwHighlightedHexes = new Set();
        this._fwPreviewRefs = null;
        // 固定の野戦Managerを複数戦闘で再利用するため、遅延callback/await後の継続を
        // 戦闘世代で分離する。旧戦闘のtimerが次のturnQueueや固定DOMへ触れないようにする。
        this._fieldWarGeneration = 0;
        window.addEventListener('resize', () => {
            if (this.active) {
                this.adjustMapScale();
            }
        });
    }

    _beginFieldWarLifecycle() {
        this._fieldWarGeneration = Number(this._fieldWarGeneration || 0) + 1;
        return this._fieldWarGeneration;
    }

    _isFieldWarLifecycleCurrent(generation, requireActive = true) {
        if (Number(generation) !== Number(this._fieldWarGeneration || 0)) return false;
        return !requireActive || this.active === true;
    }

    _scheduleFieldWarCallback(callback, delay = 0, requireActive = true) {
        const generation = Number(this._fieldWarGeneration || 0);
        return setTimeout(() => {
            if (!this._isFieldWarLifecycleCurrent(generation, requireActive)) return;
            callback();
        }, Math.max(0, Number(delay) || 0));
    }

    // タイトル復帰・新規開始・ロードは戦闘より強い寿命境界。
    // 終了演出やAI待機の旧callbackを完走させず、固定野戦DOMの表示資源だけ解放する。
    abortForScenarioTransition() {
        this._fieldWarGeneration = Number(this._fieldWarGeneration || 0) + 1;
        this.active = false;
        this.state = 'IDLE';
        const modal = this.modal || document.getElementById('field-war-modal');
        if (modal) modal.classList.add('hidden');
        if (typeof this.releaseFieldWarVisualResources === 'function') {
            this.releaseFieldWarVisualResources();
        }
        if (this.game && this.game.ui && typeof this.game.ui.resumeMainMapAfterBattle === 'function') {
            this.game.ui.resumeMainMapAfterBattle('field-war');
        }
        this.onComplete = null;
        this.warState = null;
        this.turnQueue = [];
        this.units = [];
        this.retreatedUnits = [];
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
        
        // 実際の画面の横幅・縦幅を測ります
        const availableWidth = scrollArea.clientWidth;
        const availableHeight = scrollArea.clientHeight;

        // マップ全体の実際の幅と高さを計算します
        const totalW = (this.cols - 1) * (this.hexW * 0.75) + this.hexW;
        const totalH = (this.rows * 2 - 1) * (this.hexH / 2) + this.hexH;

        // マップの外側が見えない（画面を覆い尽くす）最小のスケールを計算します
        const minScaleX = availableWidth / totalW;
        const minScaleY = availableHeight / totalH;
        // 縦・横どちらも画面より小さくならないように、大きい方を採用します
        const minCoverScale = Math.max(minScaleX, minScaleY);

        // 画面の幅にピッタリ合わせるための基本の拡大/縮小率（スケール）を割り出します
        const baseScale = availableWidth / targetWidthPx;

        // ズーム段階の設定
        // PC版は今の状態(baseScale)をズーム状態(大)として設定し、半分程度をズームアウト状態(小)にする
        // スマホ版は今の状態(baseScale)をズームアウト状態(小)として設定し、倍程度をズーム状態(大)にする
        let zoomOutScale = isPC ? baseScale * 0.6 : baseScale;
        let zoomInScale = isPC ? baseScale : baseScale * 2.0;
        
        // ズームアウトした時にマスの外側（背景）が見えないように、限界値（minCoverScale）でガードします
        zoomOutScale = Math.max(zoomOutScale, minCoverScale);
        zoomInScale = Math.max(zoomInScale, minCoverScale); // 念のためこちらもガード

        // もし限界値が大きすぎてズームインより大きくなってしまった場合の安全装置です
        if (zoomOutScale >= zoomInScale) {
            zoomInScale = zoomOutScale * 1.5;
        } else if (isPC) {
            // ★PC版に限り、マップが狭くて引きとの差があまりない場合は、ズーム時の倍率を少し上げてメリハリをつけます
            if (zoomInScale / zoomOutScale < 1.4) {
                zoomInScale = zoomOutScale * 1.5;
            }
        }

        this.fwZoomStages = [zoomOutScale, zoomInScale];
        
        if (this.fwZoomLevel === undefined) {
            this.fwZoomLevel = isPC ? 1 : 0;
        }

        this.applyMapScale();
        
        scrollArea.style.display = 'block';
    }

    // マップのスケールを適用する魔法
    applyMapScale(targetScale, cx, cy) {
        const mapArea = document.getElementById('fw-map');
        const scrollArea = document.getElementById('fw-map-scroll');
        if (!mapArea || !scrollArea) return;

        let scale = targetScale !== undefined ? targetScale : this.fwZoomStages[this.fwZoomLevel];

        let oldScale = this.currentMapScale || scale;
        this.currentMapScale = scale;

        if (cx !== undefined && cy !== undefined) {
            const rect = scrollArea.getBoundingClientRect();
            const clientX = cx - rect.left;
            const clientY = cy - rect.top;

            const logicalX = (scrollArea.scrollLeft + clientX) / oldScale;
            const logicalY = (scrollArea.scrollTop + clientY) / oldScale;

            mapArea.style.transformOrigin = 'top left';
            mapArea.style.transform = `scale(${scale})`;
            mapArea.style.margin = '0';

            scrollArea.scrollLeft = logicalX * scale - clientX;
            scrollArea.scrollTop = logicalY * scale - clientY;
        } else {
            mapArea.style.transformOrigin = 'top left';
            mapArea.style.transform = `scale(${scale})`;
            mapArea.style.margin = '0';
        }
    }

    // マップのズームを変更する魔法
    changeFwMapZoom(direction, cx, cy) {
        if (!this.fwZoomStages) return;
        let nextIdx = this.fwZoomLevel + direction;
        if (nextIdx < 0) nextIdx = 0;
        if (nextIdx >= this.fwZoomStages.length) nextIdx = this.fwZoomStages.length - 1;

        if (nextIdx === this.fwZoomLevel) return;

        this.fwZoomLevel = nextIdx;
        this.applyMapScale(this.fwZoomStages[this.fwZoomLevel], cx, cy);
        
        // ズーム後に部隊情報パネルがズレないよう再配置します
        if (this.isInfoMode && this.turnQueue && this.turnQueue.length > 0) {
            const currentUnit = this.turnQueue[0];
            const activeEl = document.getElementById(`fw-unit-el-${currentUnit.id}`);
            if (activeEl && activeEl.classList.contains('active')) {
                this._scheduleFieldWarCallback(() => {
                    this.showUnitInfo(currentUnit);
                }, 50);
            }
        }
    }
    
    async startFieldWar(warState, onComplete) {
        const fieldWarGeneration = this._beginFieldWarLifecycle();
        this.warState = warState;
        this.onComplete = onComplete;
        
        // ★修正：出撃拠点か守備拠点の「ある国（Province）」が「大雪」かどうかを判定する
        let isSourceSnow = false;
        if (warState.sourceCastle && warState.sourceCastle.provinceId) {
            const sourceProv = this.game.getProvince(warState.sourceCastle.provinceId);
            if (sourceProv && sourceProv.statusEffects) {
                isSourceSnow = sourceProv.statusEffects.includes('heavySnow');
            }
        }

        let isDefSnow = false;
        if (warState.defender && warState.defender.provinceId) {
            const defProv = this.game.getProvince(warState.defender.provinceId);
            if (defProv && defProv.statusEffects) {
                isDefSnow = defProv.statusEffects.includes('heavySnow');
            }
        }
        this.isHeavySnowBattle = isSourceSnow || isDefSnow;
        
        // ★追加：野戦の「戦争開始前」の合図を出します
        if (this.game.eventManager) {
            await this.game.eventManager.processEvents('before_field_war', this.warState);
        }
        if (!this._isFieldWarLifecycleCurrent(fieldWarGeneration, false)) return;

        this.turnCount = 1;
        this.maxTurns = 30; // 30ターンに固定
        this.active = true;
        this.state = 'IDLE';
        
        // ★追加：野戦が始まるたびに、タブの選択を一番左（メイン）にリセットします
        this.activeAtkTab = 'main';
        this.activeDefTab = 'main';
        
        // ★追加：最初は「晴れ」にしておきます。1ターン目が始まる時にすぐ判定されます。
        this.weather = 'sunny';
        
        this.hideUnitInfo();

        // ★追加: 新しく作ったマップ工場でランダムなマップを作る
        const mapFactory = new HexMapGenerator();
        const mapData = mapFactory.generate(this.warState.isSeaBattle === true);
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
                // ★修正：自分の大名家でも、委任城ならAI操作（false）にします！
                let unitIsPlayer = isAtkPlayer && !warState.sourceCastle.isDelegated;
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
                        unitIsPlayer = (Number(warState.reinforcement.castle.ownerClan) === pid) && !warState.reinforcement.castle.isDelegated;
                        isSelfReinf = (Number(warState.reinforcement.castle.ownerClan) === Number(warState.attacker.ownerClan));
                    }
                }
                // 2. 自勢力の別城からの援軍チェック
                else if (warState.selfReinforcement && warState.selfReinforcement.bushos.some(b => b.id === assign.busho.id)) {
                    isReinf = true;
                    // ★修正：自勢力の援軍でも、委任城から来たならAI操作にします！
                    unitIsPlayer = (Number(warState.selfReinforcement.castle.ownerClan) === pid) && !warState.selfReinforcement.castle.isDelegated;
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
                    displayAngle: deployDir * 60, // ★追加：アニメーション用の絶対角度
                    mobility: mobility,
                    ap: mobility,
                    soldiers: assign.soldiers,
                    initialSoldiers: assign.soldiers, // ★追加：デフォルトの兵士数を覚えておく
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
                // ★修正：自分の大名家でも、委任城ならAI操作（false）にします！
                let unitIsPlayer = isDefPlayer && !warState.defender.isDelegated;
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
                        unitIsPlayer = (Number(warState.defReinforcement.castle.ownerClan) === pid) && !warState.defReinforcement.castle.isDelegated;
                        isSelfReinf = (Number(warState.defReinforcement.castle.ownerClan) === Number(warState.defender.ownerClan));
                    }
                }
                // 2. 自勢力の別城からの援軍チェック
                else if (warState.defSelfReinforcement && warState.defSelfReinforcement.bushos.some(b => b.id === assign.busho.id)) {
                    isReinf = true;
                    // ★修正：自勢力の援軍でも、委任城から来たならAI操作にします！
                    unitIsPlayer = (Number(warState.defSelfReinforcement.castle.ownerClan) === pid) && !warState.defSelfReinforcement.castle.isDelegated;
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
                    displayAngle: deployDir * 60, // ★追加：アニメーション用の絶対角度
                    mobility: mobility,
                    ap: mobility,
                    soldiers: assign.soldiers,
                    initialSoldiers: assign.soldiers, // ★追加：デフォルトの兵士数を覚えておく
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

        // それぞれの部隊ごとに兵糧、士気、訓練度を分けて管理する「専用の箱」を作ります！
        this.groupStats = {
            atk_main: { rice: warState.attacker.rice || 0, morale: warState.attacker.morale ?? 50, training: warState.attacker.training ?? 50 },
            atk_ally: warState.reinforcement ? { rice: warState.reinforcement.rice || 0, morale: warState.reinforcement.morale ?? 50, training: warState.reinforcement.training ?? 50 } : null,
            atk_self: warState.selfReinforcement ? { rice: warState.selfReinforcement.rice || 0, morale: warState.selfReinforcement.morale ?? 50, training: warState.selfReinforcement.training ?? 50 } : null,
            def_main: { rice: warState.defFieldRice || 0, morale: warState.defender.morale ?? 50, training: warState.defender.training ?? 50 },
            def_ally: warState.defReinforcement ? { rice: warState.defReinforcement.rice || 0, morale: warState.defReinforcement.morale ?? 50, training: warState.defReinforcement.training ?? 50 } : null,
            def_self: warState.defSelfReinforcement ? { rice: warState.defSelfReinforcement.rice || 0, morale: warState.defSelfReinforcement.morale ?? 50, training: warState.defSelfReinforcement.training ?? 50 } : null,
        };

        this.turnQueue = [];
        
        this.isInfoMode = false;
        this.isCmdMode = false;
        
        // ★追加：援軍も含めて、プレイヤーが操作する部隊が1つでもあるか調べます！
        const isPlayerInvolved = this.units.some(u => u.isPlayer);
        // 戦闘終了時の通知判定は「終了瞬間に生き残っているか」ではなく、
        // この野戦に一度でもプレイヤーが参加していたかを基準にします。
        // 総大将撃破・全軍撤退の瞬間にプレイヤー部隊が0件になっても、結果を無言で閉じません。
        this.playerWasInvolved = isPlayerInvolved;
        this.fieldEndNoticeShown = false;

        if (isPlayerInvolved) {
            // 野戦中は背面の巨大通常地図を戦闘用の共通窓口から休止します。
            // スマホでは表示自体を compositor から外し、戦場へGPU/メモリを譲ります。
            if (this.game.ui && typeof this.game.ui.suspendMainMapForBattle === 'function') {
                this.game.ui.suspendMainMapForBattle('field-war');
            } else if (this.game.ui && typeof this.game.ui.pauseBackgroundUpdates === 'function') {
                this.game.ui.pauseBackgroundUpdates();
            }
            // スマホでは巨大通常地図を非表示にした状態を一度描画へ反映してから
            // 240HEXと部隊DOMを組み立て、瞬間的なメモリピークを重ねない。
            if (!document.body.classList.contains('is-pc') && this.game.ui && typeof this.game.ui.waitForNextPaint === 'function') {
                await this.game.ui.waitForNextPaint();
                if (!this._isFieldWarLifecycleCurrent(fieldWarGeneration)) return;
            }

            // ★追加：野戦が始まる時に、平時のコマンドリストを綺麗にお掃除して非表示にします！
            if (this.game.ui && typeof this.game.ui.clearCommandMenu === 'function') {
                this.game.ui.clearCommandMenu();
            }

            this.initUI();
            this.initMapElements(); // ★追加：最初に1回だけマス目を作る魔法
            this.updateMap();
            this.updateStatus();
            this.log("両軍、布陣を完了。野戦を開始します！");
            
            if (window.AudioManager) {
                window.AudioManager.memorizeCurrentBgm(); // 今の曲をメモ
                window.AudioManager.playBGM('08_Legend of bear slaying.ogg'); // 野戦BGM再生
            }
            
            // 野戦の画面が表示されたあとに、大きさをピッタリに合わせる魔法を使います
            this._scheduleFieldWarCallback(() => {
                this.adjustMapScale();
            }, 50); // 画面ができるまで一瞬（0.05秒）だけ待ってからサイズを合わせます
        } else {
            // ★プレイヤーがいない場合、画面に野戦マップが出ないように隠します！
            const modal = document.getElementById('field-war-modal');
            if (modal) modal.classList.add('hidden');
        }
        
        // ★追加：野戦の「戦闘開始後」の合図を出します
        if (this.game.eventManager) {
            await this.game.eventManager.processEvents('start_field_war', this.warState);
        }
        if (!this._isFieldWarLifecycleCurrent(fieldWarGeneration)) return;

        this.startTurn();
    }

    _unbindFieldWarScrollEvents() {
        if (!this._fwScrollEventBindings) return;
        const previous = this._fwScrollEventBindings;
        const el = previous.element;
        const h = previous.handlers || {};
        if (el) {
            if (h.click) el.removeEventListener('click', h.click, true);
            if (h.wheel) el.removeEventListener('wheel', h.wheel, false);
            if (h.touchstart) el.removeEventListener('touchstart', h.touchstart, false);
            if (h.touchmove) el.removeEventListener('touchmove', h.touchmove, false);
            if (h.touchend) el.removeEventListener('touchend', h.touchend, false);
        }
        this._fwScrollEventBindings = null;
    }

    releaseFieldWarVisualResources() {
        this._unbindFieldWarScrollEvents();

        const mapEl = this.mapEl || document.getElementById('fw-map');
        if (mapEl) {
            mapEl.oncontextmenu = null;
            mapEl.replaceChildren();
            mapEl.style.transform = '';
            mapEl.style.transformOrigin = '';
            mapEl.style.width = '';
            mapEl.style.height = '';
            mapEl.style.margin = '';
        }

        const clearIds = ['fw-atk-status', 'fw-def-status', 'fw-atk-tabs', 'fw-def-tabs', 'fw-unit-info', 'fw-log'];
        clearIds.forEach(id => {
            const el = document.getElementById(id);
            if (el) el.replaceChildren();
        });
        const unitInfo = document.getElementById('fw-unit-info');
        const statusBar = document.getElementById('fw-status-bar');
        const logEl = document.getElementById('fw-log');
        if (unitInfo) unitInfo.classList.add('hidden');
        if (statusBar) statusBar.classList.add('hidden');
        if (logEl) logEl.classList.add('hidden');

        this.hexElements = null;
        this._fwUnitElementCache = new Map();
        this._fwHighlightedHexes = new Set();
        this._fwPreviewRefs = null;
        this.mapEl = mapEl || null;
        this.logEl = logEl || null;
    }

    async _waitForFieldWarVisualState(minMs = 0) {
        const delay = new Promise(resolve => setTimeout(resolve, Math.max(0, minMs)));
        const paint = this.game.ui && typeof this.game.ui.waitForNextPaint === 'function'
            ? this.game.ui.waitForNextPaint()
            : new Promise(resolve => {
                if (typeof requestAnimationFrame === 'function') requestAnimationFrame(() => setTimeout(resolve, 0));
                else setTimeout(resolve, 0);
            });
        await Promise.all([delay, paint]);
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
                this.hideUnitInfo(); // ★追加: 右クリック時も部隊情報を閉じる
                this.cancelAction();
            };
        }

        // ★追加：マウスのドラッグでマップをぐりぐりスクロールする魔法
        const scrollEl = document.getElementById('fw-map-scroll');
        if (scrollEl) {
            // 野戦UIは同じ固定DOMを再利用するため、前回のイベントを共通窓口で解除してから再登録する。
            this._unbindFieldWarScrollEvents();

            let isDragging = false;
            let isMoved = false; // ★ドラッグで動かしたかどうかのメモ
            let startX, startY, scrollLeft, scrollTop;

            scrollEl.onmousedown = (e) => {
                // 左クリック以外（右クリックなど）は無視します
                if (e.button !== 0) return;
                
                // ★追加: 操作できる部隊のターン（入力待ち）または情報モード以外はドラッグできないようにガードします！
                const isWaitingInput = this.isPlayerTurn() && ['PHASE_MOVE', 'MOVE_PREVIEW', 'PHASE_DIR', 'PHASE_ATTACK'].includes(this.state);
                if (!isWaitingInput && !this.isInfoMode) return;
                
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
            const clickHandler = (e) => {
                if (isMoved) {
                    e.stopPropagation();
                    e.preventDefault();
                } else {
                    // ドラッグではない通常クリックで、部隊やマス以外なら部隊情報を閉じる
                    if (!e.target.classList.contains('fw-hex') && !e.target.closest('.fw-unit')) {
                        this.hideUnitInfo();
                    }
                }
            };

            // ★野戦マップのズーム操作
            this.isFwZooming = false;
            const wheelHandler = (e) => {
                if (document.body.classList.contains('is-pc')) {
                    e.preventDefault();
                    if (this.isFwZooming) return;

                    this.isFwZooming = true;
                    setTimeout(() => { this.isFwZooming = false; }, 300);

                    if (e.deltaY < 0) this.changeFwMapZoom(1, e.clientX, e.clientY);
                    else if (e.deltaY > 0) this.changeFwMapZoom(-1, e.clientX, e.clientY);
                }
            };

            let initialPinchDist = null;
            const touchStartHandler = (e) => {
                if (e.touches.length >= 2) {
                    e.preventDefault();
                }
                if (e.touches.length === 2) {
                    initialPinchDist = Math.hypot(
                        e.touches[0].pageX - e.touches[1].pageX,
                        e.touches[0].pageY - e.touches[1].pageY
                    );
                }
            };

            const touchMoveHandler = (e) => {
                if (e.touches.length >= 2) {
                    e.preventDefault();
                }
                if (e.touches.length === 2) {
                    if (initialPinchDist === null) return;
                    if (this.isFwZooming) return;

                    const currentDist = Math.hypot(
                        e.touches[0].pageX - e.touches[1].pageX,
                        e.touches[0].pageY - e.touches[1].pageY
                    );
                    const diff = currentDist - initialPinchDist;
                    const rect = scrollEl.getBoundingClientRect();
                    const centerX = rect.left + rect.width / 2;
                    const centerY = rect.top + rect.height / 2;

                    if (diff > 40) {
                        this.isFwZooming = true;
                        setTimeout(() => { this.isFwZooming = false; }, 300);
                        this.changeFwMapZoom(1, centerX, centerY);
                        initialPinchDist = currentDist;
                    } else if (diff < -40) {
                        this.isFwZooming = true;
                        setTimeout(() => { this.isFwZooming = false; }, 300);
                        this.changeFwMapZoom(-1, centerX, centerY);
                        initialPinchDist = currentDist;
                    }
                }
            };

            const touchEndHandler = (e) => {
                if (e.touches.length < 2) {
                    initialPinchDist = null;
                }
            };

            scrollEl.addEventListener('click', clickHandler, true);
            scrollEl.addEventListener('wheel', wheelHandler, { passive: false });
            scrollEl.addEventListener('touchstart', touchStartHandler, { passive: false });
            scrollEl.addEventListener('touchmove', touchMoveHandler, { passive: false });
            scrollEl.addEventListener('touchend', touchEndHandler);
            this._fwScrollEventBindings = {
                element: scrollEl,
                handlers: {
                    click: clickHandler,
                    wheel: wheelHandler,
                    touchstart: touchStartHandler,
                    touchmove: touchMoveHandler,
                    touchend: touchEndHandler
                }
            };
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
            this.updateStatus(); // 詳細情報は実際に開いた時だけ構築する
            this.updateMenu();
            this.updateMap();
        };
        if (btnInfoBack) btnInfoBack.onclick = () => {
            this.isInfoMode = false; 
            this.hideUnitInfo(); 
            this.updateMenu(); 
            this.updateMap(); 
            if (this.turnQueue && this.turnQueue.length > 0) {
                this._scheduleFieldWarCallback(() => this.scrollToUnit(this.turnQueue[0]), 100);
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
                        else this.log(`全軍、拠点へ撤退を開始します……`);
                        this.endFieldWar(unit.isAttacker ? 'attacker_retreat' : 'defender_retreat');
                    }, null, { closeBeforeOk: true, closeBeforeCancel: true });
                } else {
                    this.game.ui.showDialog(`${unit.name}隊を戦場から離脱（撤退）させますか？`, true, () => {
                        this.log(`${unit.name}隊は戦場から撤退しました。`);
                        this.retreatUnit(unit);
                    }, null, { closeBeforeOk: true, closeBeforeCancel: true });
                }
            };
        }
    }

    cancelAction() {
        if (!this.active || !this.isPlayerTurn()) return;
        
        this.hideUnitInfo(); // ★追加: キャンセル時も部隊情報を閉じて軍団情報を戻す
        
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

    // ★追加：2つの座標（または部隊）の中間地点へカメラを移動させる魔法です
    scrollToCenterPos(x1, y1, x2, y2) {
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

        // 2つの座標の中心を計算します
        const midX = (x1 + x2) / 2;
        const midY = (y1 + y2) / 2;

        // 拡大率を掛け算して、本当のピクセル位置を計算します
        const px = (midX * (this.hexW * 0.75) + this.hexW / 2) * scale;
        const py = (midY * (this.hexH / 2) + this.hexH / 2) * scale;

        const containerW = scrollEl.clientWidth;
        const containerH = scrollEl.clientHeight;

        scrollEl.scrollTo({
            left: px - containerW / 2,
            top: py - containerH / 2,
            behavior: (!document.body.classList.contains('is-pc') && document.body.classList.contains('battle-lightweight-mode')) ? 'auto' : 'smooth'
        });
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
            behavior: (!document.body.classList.contains('is-pc') && document.body.classList.contains('battle-lightweight-mode')) ? 'auto' : 'smooth'
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

    _updateFieldWarHeader() {
        const turnEl = document.getElementById('fw-turn-info');
        const turnText = `残りターン ${this.maxTurns - this.turnCount + 1}/${this.maxTurns}`;
        if (turnEl && turnEl.textContent !== turnText) turnEl.textContent = turnText;

        const dateEl = document.getElementById('fw-date-info');
        if (dateEl && this.game) {
            const dateText = `${this.game.year}年 ${this.game.month}月`;
            if (dateEl.textContent !== dateText) dateEl.textContent = dateText;
        }

        const weatherEl = document.getElementById('fw-weather-info');
        let timeStr = '';
        let timeColor = '';
        if (this.isEveningTurn()) {
            timeStr = ' (夕方)';
            timeColor = '#ff8a65';
        } else if (this.isNightTurn()) {
            timeStr = ' (夜)';
            timeColor = '#b39ddb';
        }
        if (weatherEl) {
            let weatherText = '';
            let color = '';
            if (this.weather === 'rain') {
                weatherText = '☔ 雨' + timeStr;
                color = timeColor || '#64b5f6';
            } else if (this.weather === 'snow') {
                weatherText = '⛄ 雪' + timeStr;
                color = timeColor || '#b3e5fc';
            } else {
                weatherText = `${this.isNightTurn() ? '🌙' : '☀'} 晴れ${timeStr}`;
                color = timeColor || '#ffb300';
            }
            if (weatherEl.textContent !== weatherText) weatherEl.textContent = weatherText;
            if (weatherEl.style.color !== color) weatherEl.style.color = color;
        }
    }

    updateStatus() {
        // ターン・年月・天候は常時更新するが、非表示の軍勢詳細DOMは「情報」表示時だけ構築する。
        this._updateFieldWarHeader();
        if (!this.isInfoMode) return;

        // メイン、応援軍、友軍のそれぞれの数値を保管する箱を用意します
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
            else if (u.groupId === `${side}_ally`) tab = 'ally';
            
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
            else if (key.includes('_ally')) tab = 'ally';
            
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

        // 勢力と代表武将を調べて、タブに表示する名前を作る魔法
        const getDisplayName = (isAttacker, tab) => {
            // そのタブにいる部隊だけを集めます
            let unitsInTab = this.units.filter(u => {
                if (u.isAttacker !== isAttacker) return false;
                if (tab === 'main' && u.groupId.includes('_main')) return true;
                if (tab === 'self' && u.groupId.includes('_self')) return true;
                if (tab === 'ally' && u.groupId.includes('_ally')) return true;
                return false;
            });

            if (unitsInTab.length === 0) return "<strong>不明な軍</strong>";

            // リーダーを決めます（総大将がいるなら優先、いなければ統率と武勇の合計が高い人）
            let leader = unitsInTab.find(u => u.isGeneral);
            if (!leader) {
                let sorted = [...unitsInTab].sort((a, b) => {
                    const speedA = a.stats.ldr + a.stats.str;
                    const speedB = b.stats.ldr + b.stats.str;
                    return speedB - speedA;
                });
                leader = sorted[0];
            }

            // 勢力名を調べます
            let clanNameText = "独立勢力";
            if (leader.kunishuId) {
                const kunishu = this.game.kunishuSystem.getKunishu(leader.kunishuId);
                if (kunishu) clanNameText = kunishu.getName(this.game);
            } else if (leader.bushoId) {
                const busho = this.game.getBusho(leader.bushoId);
                if (busho && busho.clan > 0) {
                    const clanData = this.game.getClan(busho.clan);
                    if (clanData) clanNameText = clanData.name;
                } else if (busho && busho.clan === 0) {
                    clanNameText = "中立勢力";
                }
            }

            // 守備側のメイン部隊で、鎮圧戦などの特別な場合は元の拠点の名前を優先します
            if (!isAttacker && tab === 'main' && this.warState.isKunishuSubjugation) {
                 const k = this.game.kunishuSystem.getKunishu(this.warState.defender.id);
                 if (k) clanNameText = k.getName(this.game);
            }

            return `<strong>${clanNameText} ${leader.name} 軍</strong>`;
        };

        let atkDisplayName = getDisplayName(true, this.activeAtkTab);
        let defDisplayName = getDisplayName(false, this.activeDefTab);

        const createStatusHTML = (displayName, stats) => `
            <div class="fw-status-box">
                <div class="fw-status-name">${displayName}</div>
                <div class="fw-status-stats">
                    <div class="fw-status-row"><span class="fw-status-label">兵士</span><span class="fw-status-value">${stats.soldiers}</span></div>
                    <div class="fw-status-row"><span class="fw-status-label">兵糧</span><span class="fw-status-value">${stats.rice}</span></div>
                    <div class="fw-status-row"><span class="fw-status-label">士気</span><span class="fw-status-value">${stats.morale}</span></div>
                    <div class="fw-status-row"><span class="fw-status-label">訓練</span><span class="fw-status-value">${stats.training}</span></div>
                </div>
            </div>
        `;

        const atkHTML = createStatusHTML(atkDisplayName, curAtk);
        const defHTML = createStatusHTML(defDisplayName, curDef);

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
            if (stats.atk.ally.exists) tabs.push({ id: 'ally', label: '友軍' });
            
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
            if (stats.def.ally.exists) tabs.push({ id: 'ally', label: '友軍' });
            
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

        // ★追加: 自分のターンであり、かつアニメーション中などではない「入力待ち状態」かチェックします
        const isWaitingInput = this.isPlayerTurn() && ['PHASE_MOVE', 'MOVE_PREVIEW', 'PHASE_DIR', 'PHASE_ATTACK'].includes(this.state);

        // ★追加: 操作できる部隊のターン以外は、スマホ等のスワイプスクロールも無効化します
        const scrollEl = document.getElementById('fw-map-scroll');
        if (scrollEl) {
            if (isWaitingInput || this.isInfoMode) {
                scrollEl.style.overflow = 'auto';
                scrollEl.style.touchAction = 'auto'; // スクロール操作を許可
            } else {
                scrollEl.style.overflow = 'hidden';
                scrollEl.style.touchAction = 'none'; // スクロール操作を禁止
            }
        }

        if (this.isInfoMode) {
            if (statusBar) statusBar.classList.remove('hidden');
            if (infoGroup) infoGroup.classList.remove('hidden');
        } else {
            if (statusBar) statusBar.classList.add('hidden');
            
            // ★修正: 自分のターンでも、アニメーション中などはメニューを出さないようにします！
            if (isWaitingInput) {
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
        }
        
        let typeName = '足軽';
        if (unit.troopType === 'kiba') typeName = '騎馬';
        if (unit.troopType === 'teppo') typeName = '鉄砲';

        const unitBusho = unit.bushoId ? this.game.getBusho(unit.bushoId) : null;
        const compressText = (text, threshold, isStrong = false) => {
            const value = String(text || '').replace(/\|/g, '');
            if (!value) return '';
            if (this.game.ui && typeof this.game.ui._getCompressedTextHtml === 'function') {
                return this.game.ui._getCompressedTextHtml(value, threshold, isStrong);
            }
            return value;
        };
        const aptitudeItemHtml = (label, rank) => `
            <span class="fw-unit-aptitude-item"><span class="fw-unit-aptitude-label">${label}</span>${rank ? StatPresenter.toAptitudeHTML(rank) : '<span class="fw-unit-aptitude-empty">-</span>'}</span>`;
        const aptitudeItems = [
            ['足軽', unitBusho && unitBusho.aptAshigaru],
            ['馬術', unitBusho && unitBusho.aptKiba],
            ['弓術', unitBusho && unitBusho.aptYumi],
            ['砲術', unitBusho && unitBusho.aptTeppo],
            ['操船', unitBusho && unitBusho.aptMaritime]
        ];
        const aptitudeHtml = aptitudeItems.map(([label, rank]) => aptitudeItemHtml(label, rank)).join('');

        // 大名家・諸勢力名と武将名は兵科から分離し、既存の文字圧縮規則で固定幅内に収めます。
        let affiliationName = '';
        if (unit.kunishuId) {
            const kunishu = this.game.kunishuSystem.getKunishu(unit.kunishuId);
            if (kunishu) affiliationName = kunishu.getName(this.game);
        } else if (unitBusho && unitBusho.clan > 0) {
            const clanData = this.game.getClan(unitBusho.clan);
            if (clanData) affiliationName = clanData.name;
        }
        const affiliationNameHtml = compressText(affiliationName || '所属不明', 5);
        let bushoNameHtml = '';
        if (unitBusho && unitBusho.givenName) {
            bushoNameHtml = compressText(unitBusho.familyName, 3) + compressText(unitBusho.givenName, 3);
        } else {
            bushoNameHtml = compressText((unitBusho && unitBusho.fullName) || unit.name || '部隊', 5);
        }
        
        let unitMorale = 50;
        let unitTraining = 50;
        if (this.groupStats && this.groupStats[unit.groupId]) {
            unitMorale = this.groupStats[unit.groupId].morale;
            unitTraining = this.groupStats[unit.groupId].training;
        }

        infoEl.style.setProperty('--unit-color', color); 
        infoEl.innerHTML = `
            <div class="fw-unit-header">
                <div class="fw-unit-affiliation">${affiliationNameHtml}</div>
                <div class="fw-unit-name">${bushoNameHtml}</div>
            </div>
            <div class="fw-unit-stats">
                <div class="fw-unit-row">
                    <span class="fw-status-label">兵科</span><span class="fw-status-value fw-unit-type-value">${typeName}</span>
                    <span class="fw-status-label fw-status-label-spaced">兵士</span><span class="fw-status-value">${unit.soldiers}</span>
                </div>
                <div class="fw-unit-row">
                    <span class="fw-status-label">士気</span><span class="fw-status-value">${unitMorale}</span>
                    <span class="fw-status-label fw-status-label-spaced">訓練</span><span class="fw-status-value">${unitTraining}</span>
                </div>
            </div>
            <div class="fw-unit-abilities">
                <div class="fw-unit-ability"><span class="fw-status-label">統</span><span>${StatPresenter.toGradeHTML(unit.stats.ldr)}</span></div>
                <div class="fw-unit-ability"><span class="fw-status-label">武</span><span>${StatPresenter.toGradeHTML(unit.stats.str)}</span></div>
                <div class="fw-unit-ability"><span class="fw-status-label">智</span><span>${StatPresenter.toGradeHTML(unit.stats.int)}</span></div>
            </div>
            <div class="fw-unit-aptitudes">${aptitudeHtml}</div>
        `;

        // ★修正：サイズを正確に測るため、一瞬だけ透明（visibility: hidden）にして画面に出します
        infoEl.style.visibility = 'hidden';
        infoEl.style.left = '0px';
        infoEl.style.top = '0px';
        infoEl.classList.remove('hidden');

        // ★追加: 部隊情報を出す時、上部の軍団情報を隠します
        const statusBar = document.getElementById('fw-status-bar');
        if (statusBar) statusBar.classList.add('hidden');

        // ★修正：画面の黒帯や絶対座標に影響されないよう、ゲーム内部のローカル座標系だけで計算する魔法です！
        const uEl = document.getElementById(`fw-unit-el-${unit.id}`);
        const mapEl = document.getElementById('fw-map');
        const scrollEl = document.getElementById('fw-map-scroll');
        const mainArea = document.getElementById('fw-main-area');

        if (uEl && mapEl && scrollEl && mainArea) {
            // マップの現在の拡大率を取得
            let scale = 1;
            const transform = mapEl.style.transform;
            if (transform && transform.includes('scale')) {
                const match = transform.match(/scale\(([^)]+)\)/);
                if (match && match[1]) scale = parseFloat(match[1]);
            }

            // 部隊アイコンの「マップ上の位置」と「サイズ」を取得
            const uLeft = parseFloat(uEl.style.left) || 0;
            const uTop = parseFloat(uEl.style.top) || 0;
            const uWidth = parseFloat(uEl.style.width) || 24;
            const uHeight = parseFloat(uEl.style.height) || 24;

            // スクロール量を差し引いて、表示エリア（fw-main-area）の左上を(0,0)とした場合の座標を計算します
            // これにより、画面の黒帯（外側のオフセット）を完全に無視できます
            const iconRightEdge = (uLeft + uWidth) * scale - scrollEl.scrollLeft;
            const iconBottomEdge = (uTop + uHeight) * scale - scrollEl.scrollTop;
            const iconLeftEdge = uLeft * scale - scrollEl.scrollLeft;
            const iconTopEdge = uTop * scale - scrollEl.scrollTop;

            // ポップアップ自体のサイズと、表示可能エリアのサイズ
            const infoW = infoEl.offsetWidth;
            const infoH = infoEl.offsetHeight;
            const mainW = mainArea.clientWidth;
            const mainH = mainArea.clientHeight;

            // 基本はアイコンの右下に配置
            let posX = iconRightEdge + 5;
            let posY = iconBottomEdge + 5;

            // もし右側が画面外にはみ出るなら、アイコンの左側に配置
            if (posX + infoW > mainW - 5) {
                posX = iconLeftEdge - infoW - 5;
                if (posX < 5) posX = 5; // 左もはみ出るなら画面端に固定
            }

            // もし下側が画面外にはみ出るなら、アイコンの上側に配置
            if (posY + infoH > mainH - 5) {
                posY = iconTopEdge - infoH - 5;
                if (posY < 5) posY = 5; // 上もはみ出るなら画面端に固定
            }

            // 計算したローカル座標をセット
            infoEl.style.left = posX + 'px';
            infoEl.style.top = posY + 'px';
        }
        
        // 透明マントを脱いで正式に表示します
        infoEl.style.visibility = '';
    }

    hideUnitInfo() {
        const infoEl = document.getElementById('fw-unit-info');
        if (infoEl) infoEl.classList.add('hidden');
        
        // ★追加: 部隊情報を閉じた時、隠していた軍団情報を元に戻します
        const statusBar = document.getElementById('fw-status-bar');
        if (statusBar && this.isInfoMode) {
            statusBar.classList.remove('hidden');
        }
    }

    // ★追加: 攻撃可能かどうかの判定関数（兵科による違いを吸収）
    canAttackTarget(attacker, targetX, targetY) {
        const dist = this.getDistance(attacker.x, attacker.y, targetX, targetY);
        let targetDir = this.getDirection(attacker.x, attacker.y, targetX, targetY);

        if (attacker.troopType === 'teppo') {
            if (attacker.hasMoved) return false; // 鉄砲は移動後攻撃不可
            // ★修正: 雨・雪の時は遠距離攻撃ができず、射程が1になります。晴れの通常時は4になります。
            let maxRange = (this.weather === 'rain' || this.weather === 'snow') ? 1 : 4;
            
            // ★修正: 夜の時は射程をマイナス2します（雨・雪の時はすでに1なので影響しません）
            if (this.weather !== 'rain' && this.weather !== 'snow' && this.isNightTurn()) {
                maxRange -= 2;
            }

            if (dist > maxRange) return false; 
            if (!this.isFrontDirection(attacker.direction, targetDir)) return false; // 前方3方向のみ
            return true;
        } else if (attacker.troopType === 'ashigaru') {
            // ★追加: 足軽は射程2。距離2への攻撃は弓射とします。
            let maxRange = 2;
            
            // 鉄砲と同じく、雨・雪の時は弓が使いにくいため遠距離不可（射程1）
            // ★重要 足軽の弓射は鉄砲と違い、移動後でも攻撃可能とします
            if (this.weather === 'rain' || this.weather === 'snow') {
                maxRange = 1;
            }
            
            if (dist > maxRange) return false; 
            if (!this.isFrontDirection(attacker.direction, targetDir)) return false; // 前方3方向のみ
            return true;
        } else {
            if (dist !== 1) return false; // 騎馬は射程1
            if (!this.isFrontDirection(attacker.direction, targetDir)) return false; // 前方3方向のみ
            return true;
        }
    }

    // ==============================================
    // ★追加: 最初に1回だけマップのマス目（土台）と部隊アイコンを作る魔法
    // ==============================================
    initMapElements() {
        if (!this.mapEl) return;
        this.mapEl.innerHTML = ''; // 念のためお掃除
        this._fwUnitElementCache = new Map();
        this._fwHighlightedHexes = new Set();
        this._fwPreviewRefs = null;

        // 1. 移動ルートの線を引くための透明な画用紙（SVG）
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
        
        // 2. マス目（HEX）を作る
        this.hexElements = {}; // マス目をすぐ探し出せるようにする名簿
        for (let x = 0; x < this.cols; x++) {
            for (let row = 0; row < this.rows; row++) {
                const y = (x % 2 === 0) ? row * 2 : row * 2 + 1;
                
                const hex = document.createElement('div');
                hex.className = 'fw-hex';
                hex.id = `fw-hex-${x}-${y}`; // IDをつけておく

                if (this.grid && this.grid[row] && this.grid[row][x]) {
                    const cell = this.grid[row][x];
                    const visualTerrain = cell.isSea ? 'sea' : cell.terrain;
                    hex.dataset.terrain = visualTerrain;
                    hex.classList.add(`hex-${visualTerrain}`);
                    // 同じ模様が碁盤目状に反復して見えないよう、座標から決まる静的なずらしだけを付けます。
                    // 乱数やアニメーションは使わないため、再描画コストやゲームロジックには影響しません。
                    hex.classList.add(`terrain-variant-${Math.abs((x * 17 + row * 31)) % 3}`);
                }
                
                hex.style.left = `${x * (this.hexW * 0.75)}px`;
                hex.style.top = `${y * (this.hexH / 2)}px`;
                
                // クリックされた時の魔法
                hex.onclick = () => this.onHexClick(x, y);
                this.mapEl.appendChild(hex);
                
                // 名簿に登録
                this.hexElements[`${x},${y}`] = hex;
            }
        }

        // 3. 移動プレビュー用の部隊アイコン（普段は隠しておく）
        const pEl = document.createElement('div');
        pEl.id = 'fw-preview-unit';
        pEl.className = 'fw-unit preview hidden'; // 最初は hidden
        pEl.style.pointerEvents = 'none';
        pEl.innerHTML = `
            <div class="fw-unit-icon"></div>
            <div class="fw-unit-status-wrap">
                <div class="fw-troop-icon"></div>
                <div class="fw-unit-soldiers"></div>
            </div>
        `;
        this.mapEl.appendChild(pEl);
        this._fwPreviewRefs = {
            el: pEl,
            soldierEl: pEl.querySelector('.fw-unit-soldiers'),
            troopIconEl: pEl.querySelector('.fw-troop-icon')
        };

        // 4. 全部隊のアイコンを作る
        this.units.forEach((u) => {
            let iconSize = 16 + Math.min(Math.floor(Math.max(0, u.soldiers - 1) / 1000), 5) * 3;

            const uEl = document.createElement('div');
            uEl.id = `fw-unit-el-${u.id}`; 
            
            let colorClass = u.isAttacker ? 'attacker' : 'defender';
            if (u.isSelfReinforcement) {
                colorClass += ' self-ally'; 
            } else if (u.isReinforcement) {
                colorClass += ' ally'; 
            }

            uEl.className = `fw-unit ${colorClass}`;
            if (u.isGeneral) {
                uEl.classList.add('general');
            }
            
            uEl.style.width = `${iconSize}px`; 
            uEl.style.height = `${iconSize}px`; 
            uEl.style.pointerEvents = 'none'; 
            
            uEl.innerHTML = `
                <div class="fw-unit-icon"></div>
                <div class="fw-unit-status-wrap">
                    <div class="fw-troop-icon" data-type="${u.troopType}"></div>
                    <div class="fw-unit-soldiers">${u.soldiers}</div>
                </div>
            `;

            this.mapEl.appendChild(uEl);
            this._fwUnitElementCache.set(u.id, {
                el: uEl,
                soldierEl: uEl.querySelector('.fw-unit-soldiers'),
                troopIconEl: uEl.querySelector('.fw-troop-icon')
            });
        });
    }

    // ==============================================
    // ★変更: 毎回作り直すのをやめて、位置や色（クラス）だけを更新する魔法
    // ==============================================
    updateMap() {
        if (!this.mapEl || !this.hexElements) return;
        
        const unit = this.turnQueue[0];
        const isPlayerTurn = this.isPlayerTurn();

        // 1. 移動ルートの線を消す（線だけは都度引き直します）
        const svg = document.getElementById('fw-svg-layer');
        if (svg) svg.innerHTML = '';
        
        // 2. 全部隊のアイコンの状態を更新する
        
        // ★修正：ワープ現象を防ぐため、全員を隠すのではなく「戦場からいなくなった部隊」だけを名指しで隠します
        const activeUnitIds = new Set(this.units.map(u => u.id));
        this._fwUnitElementCache.forEach((refs, unitId) => {
            const shouldHide = !activeUnitIds.has(unitId);
            if (refs.el.style.display === (shouldHide ? 'none' : '')) return;
            refs.el.style.display = shouldHide ? 'none' : '';
        });

        this.units.forEach((u) => {
            const refs = this._fwUnitElementCache.get(u.id);
            const uEl = refs && refs.el;
            if (!uEl) return;
            
            // サイズと位置の更新（兵士数で変わる）
            let iconSize = 16 + Math.min(Math.floor(Math.max(0, u.soldiers - 1) / 1000), 5) * 3;
            const nextWidth = `${iconSize}px`;
            const nextLeft = `${u.x * (this.hexW * 0.75) + (this.hexW - iconSize) / 2}px`;
            const nextTop = `${u.y * (this.hexH / 2) + (this.hexH - iconSize) / 2}px`;
            if (uEl.style.width !== nextWidth) uEl.style.width = nextWidth;
            if (uEl.style.height !== nextWidth) uEl.style.height = nextWidth;
            if (uEl.style.left !== nextLeft) uEl.style.left = nextLeft;
            if (uEl.style.top !== nextTop) uEl.style.top = nextTop;
            
            // ★修正：近い方向へ回って向きを変える魔法
            if (u.displayAngle === undefined) u.displayAngle = u.direction * 60;
            let targetAngle = u.direction * 60;
            let diff = (targetAngle - u.displayAngle) % 360;
            if (diff > 180) diff -= 360;
            if (diff < -180) diff += 360;
            u.displayAngle += diff;

            const nextDir = `${u.displayAngle}deg`;
            if (uEl.style.getPropertyValue('--fw-dir') !== nextDir) uEl.style.setProperty('--fw-dir', nextDir);

            // アクティブ表示の切り替え
            const isActive = Boolean(unit && u.id === unit.id);
            uEl.classList.toggle('active', isActive);

            // 海戦用（船の見た目）の判定
            let uRow = Math.floor(u.y / 2);
            let uIsSea = (this.grid && this.grid[uRow] && this.grid[uRow][u.x]) ? this.grid[uRow][u.x].isSea : false;
            uEl.classList.toggle('is-sea-unit', Boolean(uIsSea));

            // 兵士数・兵科アイコンはキャッシュ済みDOMだけを更新します。
            const soldierText = String(u.soldiers);
            if (refs.soldierEl && refs.soldierEl.textContent !== soldierText) refs.soldierEl.textContent = soldierText;
            if (refs.troopIconEl && refs.troopIconEl.dataset.type !== u.troopType) refs.troopIconEl.dataset.type = u.troopType;
        });

        // 3. プレビュー用の部隊アイコンの表示更新
        const pEl = document.getElementById('fw-preview-unit');
        if (pEl) {
            if (this.state === 'MOVE_PREVIEW' && this.previewTarget && unit && !this.isInfoMode) {
                this.drawPath(this.previewTarget.path, unit.x, unit.y); // ルートの線を描く
                
                let iconSize = 16 + Math.min(Math.floor(Math.max(0, unit.soldiers - 1) / 1000), 5) * 3;
                pEl.className = `fw-unit ${unit.isAttacker ? 'attacker' : 'defender'} preview`;
                if (unit.isGeneral) pEl.classList.add('general');
                
                pEl.style.width = `${iconSize}px`; 
                pEl.style.height = `${iconSize}px`;
                pEl.style.left = `${this.previewTarget.x * (this.hexW * 0.75) + (this.hexW - iconSize) / 2}px`;
                pEl.style.top = `${this.previewTarget.y * (this.hexH / 2) + (this.hexH - iconSize) / 2}px`;    
                
                // ★追加：プレビューも近い方向へ回るように計算
                let pTargetAngle = this.previewTarget.direction * 60;
                let pDiff = (pTargetAngle - unit.displayAngle) % 360;
                if (pDiff > 180) pDiff -= 360;
                if (pDiff < -180) pDiff += 360;
                let pDisplayAngle = unit.displayAngle + pDiff;

                pEl.style.setProperty('--fw-dir', `${pDisplayAngle}deg`);
                
                let pRow = Math.floor(this.previewTarget.y / 2);
                let pIsSea = (this.grid && this.grid[pRow] && this.grid[pRow][this.previewTarget.x]) ? this.grid[pRow][this.previewTarget.x].isSea : false;
                
                pEl.classList.toggle('is-sea-unit', Boolean(pIsSea));
                const previewRefs = this._fwPreviewRefs;
                if (previewRefs && previewRefs.soldierEl) {
                    const soldierText = String(unit.soldiers);
                    if (previewRefs.soldierEl.textContent !== soldierText) previewRefs.soldierEl.textContent = soldierText;
                }
                if (previewRefs && previewRefs.troopIconEl && previewRefs.troopIconEl.dataset.type !== unit.troopType) {
                    previewRefs.troopIconEl.dataset.type = unit.troopType;
                }
                pEl.classList.remove('hidden');
            } else {
                pEl.classList.add('hidden'); // プレビューが必要ない時は隠す
            }
        }

        // 4. マス目（HEX）のハイライト更新
        // 毎回240マス全部を触らず、前回実際に光らせたマスだけ解除します。
        this._fwHighlightedHexes.forEach(key => {
            const hex = this.hexElements[key];
            if (hex) hex.classList.remove('current-pos', 'movable', 'attackable', 'fw-dir-highlight');
        });
        this._fwHighlightedHexes.clear();
        const addHexHighlight = (key, className) => {
            const hex = this.hexElements[key];
            if (!hex) return;
            hex.classList.add(className);
            this._fwHighlightedHexes.add(key);
        };

        // 必要なマス目だけにクラス（色塗り）を付与する
        if (isPlayerTurn && unit && !this.isInfoMode) {
            // 現在地を光らせる
            if (this.hexElements[`${unit.x},${unit.y}`]) {
                addHexHighlight(`${unit.x},${unit.y}`, 'current-pos');
            }

            if (this.state === 'PHASE_MOVE' || this.state === 'MOVE_PREVIEW') {
                for (let key in this.reachable) {
                    let parts = key.split(',');
                    let x = parseInt(parts[0]);
                    let y = parseInt(parts[1]);
                    
                    const hex = this.hexElements[key];
                    if (!hex) continue;
                    if (x === unit.x && y === unit.y) continue; // current-posがついてるのでスキップ

                    // 敵や味方がいるか等チェック
                    if (this.units.some(u => u.x === x && u.y === y && u.isAttacker === unit.isAttacker)) {
                        // 味方がいるマスの場合、通り抜けられるかチェック
                        const enemies = this.units.filter(u => u.isAttacker !== unit.isAttacker);
                        let minStartDist = 999;
                        enemies.forEach(e => {
                            let d = this.getDistance(unit.x, unit.y, e.x, e.y);
                            if (d < minStartDist) minStartDist = d;
                        });
                        
                        let row_t = Math.floor(y / 2);
                        let terrain_t = (this.grid && this.grid[row_t] && this.grid[row_t][x]) ? this.grid[row_t][x].terrain : 'plain';
                        let isSea_t = (this.grid && this.grid[row_t] && this.grid[row_t][x]) ? this.grid[row_t][x].isSea : false;
                        
                        let baseCost = 1;
                        if (typeof SkillManager !== 'undefined') {
                            const tempAllies = this.units.filter(u => u.isAttacker === unit.isAttacker && u.id !== unit.id);
                            baseCost = SkillManager.calcTerrainMoveCost(unit, terrain_t, isSea_t, tempAllies, this.game);
                        } else {
                            if (terrain_t === 'forest') baseCost = 2;
                            else if (terrain_t === 'river' || terrain_t === 'mountain') baseCost = 3;
                            if (unit.troopType === 'kiba') {
                                if (terrain_t === 'mountain') baseCost = 999;
                                else if (terrain_t === 'forest' || terrain_t === 'river') baseCost += 1;
                            }
                        }

                        let minEnemyDistToTarget = 999;
                        enemies.forEach(e => {
                            let d = this.getDistance(x, y, e.x, e.y);
                            if (d < minEnemyDistToTarget) minEnemyDistToTarget = d;
                        });

                        let zocCost = (minEnemyDistToTarget <= 2) ? 2 : 1;
                        let costToEnter = Math.max(baseCost, zocCost);
                        
                        if (this.getDistance(unit.x, unit.y, x, y) === 1) {
                            if (minStartDist === 1) costToEnter = Math.max(baseCost, 4); 
                            if (costToEnter < unit.ap) addHexHighlight(key, 'movable');
                        } else {
                            let canPass = false;
                            const neighbors = this.getNeighbors(x, y);
                            for (let n of neighbors) {
                                let nKey = `${n.x},${n.y}`;
                                if (this.reachable && this.reachable[nKey]) {
                                    if (this.reachable[nKey].cost + costToEnter < unit.ap) {
                                        canPass = true;
                                        break;
                                    }
                                }
                            }
                            if (canPass) addHexHighlight(key, 'movable');
                        }
                    } else {
                        // 誰もいない移動可能マス
                        addHexHighlight(key, 'movable');
                    }
                }
            } else if (this.state === 'PHASE_DIR' || this.state === 'PHASE_ATTACK') {
                for (let x = 0; x < this.cols; x++) {
                    for (let row = 0; row < this.rows; row++) {
                        const y = (x % 2 === 0) ? row * 2 : row * 2 + 1;
                        const hex = this.hexElements[`${x},${y}`];
                        if (!hex) continue;
                        if (x === unit.x && y === unit.y) continue; // current-posがついてるのでスキップ

                        const targetUnit = this.units.find(u => u.x === x && u.y === y && u.isAttacker !== unit.isAttacker);
                        if (targetUnit && this.canAttackTarget(unit, x, y)) {
                            let targetDir = this.getDirection(unit.x, unit.y, x, y);
                            let turnCost = this.getTurnCost(unit.direction, targetDir);
                            if (unit.ap >= turnCost + 1) {
                                addHexHighlight(`${x},${y}`, 'attackable');
                            }
                        } else if (this.state === 'PHASE_DIR' && this.getDistance(unit.x, unit.y, x, y) === 1) {
                            let targetDir = this.getDirection(unit.x, unit.y, x, y);
                            let turnCost = this.getTurnCost(unit.direction, targetDir);
                            if (unit.ap >= turnCost) {
                                addHexHighlight(`${x},${y}`, 'fw-dir-highlight');
                            }
                        }
                    }
                }
            }
        }
        
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
        
        let isSea = (this.grid && this.grid[row] && this.grid[row][x]) ? this.grid[row][x].isSea : false;

        // ★修正: 地形コストの計算をスキルマネージャーに一任します！
        let baseCost = 1;
        if (typeof SkillManager !== 'undefined') {
            baseCost = SkillManager.calcTerrainMoveCost(unit, terrain, isSea, allies, this.game);
        } else {
            if (terrain === 'forest') baseCost = 2;
            else if (terrain === 'river' || terrain === 'mountain') baseCost = 3;
            if (unit && unit.troopType === 'kiba') {
                if (terrain === 'mountain') return 999;
                if (terrain === 'forest' || terrain === 'river') baseCost += 1;
            }
        }
        
        if (baseCost >= 999) return 999;

        let zocCost = 1;
        if (isFirstStep && startDist === 1) {
            // 退き巧者による離脱コスト軽減は SkillManager が決定します。
            zocCost = SkillManager.getDisengageMoveCost(unit, this.game);
        } else if (minEnemyDist <= 2) {
            zocCost = 2;
        }

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
                    let isSea = (this.grid && this.grid[row] && this.grid[row][n.x]) ? this.grid[row][n.x].isSea : false;

                    // ★修正: ターゲットマスのコスト計算もスキルマネージャーに一任します！
                    if (typeof SkillManager !== 'undefined') {
                        c = SkillManager.calcTerrainMoveCost(unit, terrain, isSea, allies, this.game);
                    } else {
                        if (terrain === 'forest') c = 2;
                        else if (terrain === 'river' || terrain === 'mountain') c = 3;
                        if (unit.troopType === 'kiba') {
                            if (terrain === 'mountain') c = 999;
                            else if (terrain === 'forest' || terrain === 'river') c += 1;
                        }
                    }
                }

                if (c >= 999) continue; // 通行不可のマスは候補から外す

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
            if(Object.keys(closedList).length > 400) return null;
        }
        return null; // 道が見つからなかった
    }

    isPlayerTurn() {
        if (this.turnQueue.length === 0) return false;
        return this.turnQueue[0].isPlayer;
    }

    // ★追加：今のターンが「夕方」かどうかを判定する共通の仕組みです
    isEveningTurn() {
        const mod = this.turnCount % 10;
        return mod === 5; // 下一桁が5なら夕方
    }

    // ★追加：今のターンが「夜」かどうかを判定する共通の仕組みです
    isNightTurn() {
        const mod = this.turnCount % 10;
        return mod >= 6 && mod <= 8; // 下一桁が6〜8なら夜
    }

    // ★追加：天候を判定して切り替える魔法です
    updateWeather() {
        if (!this.game) return;
        
        const month = this.game.month;
        const rand = Math.random() * 100; // 0〜100のランダムな数字を出します
        
        if (this.isHeavySnowBattle) {
            // ★追加: 大雪拠点絡みの戦闘は、雨ではなく雪の判定になります
            if (this.weather === 'sunny') {
                if (rand < 60) {
                    this.weather = 'snow';
                    if (this.turnCount > 1) this.log(`猛吹雪が戦場を包み込みました。`);
                }
            } else if (this.weather === 'snow') {
                if (rand < 15) {
                    this.weather = 'sunny';
                    this.log(`吹雪が弱まり、視界が晴れてきました。`);
                }
            }
        } else {
            // 月ごとの確率（％）
            const toRainProb = { 1:15, 2:15, 3:20, 4:35, 5:50, 6:60, 7:50, 8:35, 9:20, 10:15, 11:15, 12:10 };
            const toSunnyProb = { 1:70, 2:70, 3:60, 4:50, 5:40, 6:30, 7:40, 8:50, 9:60, 10:70, 11:70, 12:70 };
            
            if (this.weather === 'sunny') {
                if (rand < toRainProb[month]) {
                    this.weather = 'rain';
                    if (this.turnCount > 1) this.log(`天候が崩れ、雨が降り始めました。`);
                }
            } else if (this.weather === 'rain') {
                if (rand < toSunnyProb[month]) {
                    this.weather = 'sunny';
                    this.log(`雨が上がり、天候が回復しました。`);
                }
            }
        }
        
        // 画面の見た目を更新します
        const mainArea = document.getElementById('fw-main-area');
        const weatherLayer = document.getElementById('fw-weather-layer');
        if (mainArea && weatherLayer) {
            mainArea.classList.remove('is-raining', 'is-snowing', 'is-heavy-snow');
            weatherLayer.classList.remove('is-rain', 'is-snow');
            
            if (this.weather === 'rain') {
                mainArea.classList.add('is-raining');
                weatherLayer.classList.remove('hidden');
                weatherLayer.classList.add('is-rain');
            } else if (this.weather === 'snow') {
                mainArea.classList.add('is-snowing');
                weatherLayer.classList.remove('hidden');
                weatherLayer.classList.add('is-snow');
            } else {
                weatherLayer.classList.add('hidden');
            }

            // ★追加：大雪の時は、画面に「大雪（is-heavy-snow）」という目印をつけます
            if (this.isHeavySnowBattle) {
                mainArea.classList.add('is-heavy-snow');
            }
        }
        
        // UIの文字を更新します
        this.updateStatus();
    }

    startTurn() {
        if (!this.active) return;

        // ★追加：毎ターン開始時に天候の判定をします
        this.updateWeather();
        
        // ★追加：野戦の毎ターン開始時に、参戦している武将へ経験値を加算します
        const isIntTurn = (this.turnCount % 2 === 1);
        
        this.units.forEach(u => {
            u.hasActionDone = false;
            u.hasMoved = false; // ★ ターン開始時に移動フラグをリセット
            
            // 雨、雪、夜の判定をして行動力を減らします（最低1は確保します）
            let penalty = 0;
            
            if (this.weather === 'rain' || this.weather === 'snow') {
                // ★追加: 悪天巧者スキルの確認
                if (!SkillManager.isWeatherPenaltyIgnored(u, this.game)) {
                    penalty += 1;
                }
            }
            if (this.isNightTurn()) penalty += 1;

            // ★追加: 大雪拠点戦の場合はさらに常時ペナルティ
            if (this.isHeavySnowBattle) {
                penalty += 1; // 常に全ての部隊の行動力マイナス1
                // ※移動した時だけ減らすように変更したため、ここでの毎ターンの兵力減少は削除しました
            }

            // ★追加：士気が80以上なら、足軽と騎馬の行動力を+1するボーナス
            let moraleBonus = 0;
            // 部隊の種類（troopType）が足軽（ashigaru）か騎馬（kiba）かを確認します
            if (u.troopType === 'ashigaru' || u.troopType === 'kiba') {
                let groupMorale = 50; // 士気の基本値
                // 自分が所属している軍（メインや友軍など）の専用の箱から、現在の士気を取り出します
                if (this.groupStats && this.groupStats[u.groupId]) {
                    groupMorale = this.groupStats[u.groupId].morale;
                }
                // 取り出した士気が80以上であれば、ボーナスを「1」にします
                if (groupMorale >= 80) {
                    moraleBonus = 1;
                }
            }
            
            // 元々の移動力からペナルティを引き、先ほど計算したボーナスを足してセットします
            u.ap = Math.max(1, u.mobility - penalty + moraleBonus);
            
            // 経験値の加算処理
            if (u.bushoId && this.game) {
                const busho = this.game.getBusho(u.bushoId);
                if (busho && busho.id && String(busho.id).indexOf('dummy') === -1) {
                    busho.expLeadership = (busho.expLeadership || 0) + 1;
                    busho.expStrength = (busho.expStrength || 0) + 1;
                    if (isIntTurn) {
                        busho.expIntelligence = (busho.expIntelligence || 0) + 1;
                    }
                }
            }
        });
        
        this.turnQueue = [...this.units].sort((a, b) => {
            const speedA = a.stats.ldr + a.stats.str;
            const speedB = b.stats.ldr + b.stats.str;
            return speedB - speedA;
        });

        // ★追加：AI同士の高速戦闘でブラウザがフリーズしないように、ターンの最初に少しだけ息継ぎをします！
        const isPlayerInvolved = this.units.some(u => u.isPlayer);
        if (!isPlayerInvolved) {
            this._scheduleFieldWarCallback(() => this.processQueue(), 0);
        } else {
            this.processQueue();
        }
    }

    processQueue() {
        if (!this.active) return;
        
        if (this.turnQueue.length === 0) {
            this.turnCount++;
            this.consumeRice();
            this.applyWeatherMoralePenalty(); // ★追加: 天候による士気減少
            
            // ★追加: 天候ダメージを受けた直後に士気崩壊をチェックします
            this.checkMoraleCollapse();
            
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
            // マップの大きさが確実に決まってからカメラを動かすために、0.2秒（200）待ちます
            this._scheduleFieldWarCallback(() => this.scrollToUnit(unit), 200);
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
                this._scheduleFieldWarCallback(() => this.processAITurn(), 600);
            } else {
                // ★修正：野戦のAIターンでも、一瞬だけ息継ぎを入れてパンクを防ぎます！
                this._scheduleFieldWarCallback(() => this.processAITurn(), 0);
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
                this._scheduleFieldWarCallback(() => this.nextPhaseTurn(), 300);
            } else {
                this.nextPhaseTurn();
            }
        }
    }

    nextPhaseTurn() {
        if (!this.active) return;
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

        // 野戦独自の兵糧消費量（兵士数 × 0.005、大雪戦なら5倍の0.025）
        const consumeRate = this.isHeavySnowBattle ? 0.025 : 0.005;
        
        for (let key in groupSoldiers) {
            if (this.groupStats[key]) {
                let cons = Math.floor(groupSoldiers[key] * consumeRate);
                this.groupStats[key].rice = Math.max(0, this.groupStats[key].rice - cons);
            }
        }
    }

    // ★追加: 天候による士気減少処理
    applyWeatherMoralePenalty() {
        let isSnowing = (this.weather === 'snow');
        if (!this.isHeavySnowBattle && !isSnowing) return;

        let groupSoldiers = {};
        this.units.forEach(u => {
            if (!groupSoldiers[u.groupId]) groupSoldiers[u.groupId] = 0;
            groupSoldiers[u.groupId] += u.soldiers;
        });

        for (let key in groupSoldiers) {
            if (this.groupStats[key] && this.groupStats[key].morale > 0) {
                // ★追加: 赤備えスキルによる士気低下無効化チェック
                let hasAkazonae = false;
                if (typeof SkillManager !== 'undefined') {
                    const groupUnits = this.units.filter(u => u.groupId === key);
                    hasAkazonae = SkillManager.isMoraleDecayIgnoredForArmy(groupUnits, this.game);
                }
                
                // 赤備えがいる軍は天候による士気低下が無効になります
                if (hasAkazonae) continue; 

                let soldiers = groupSoldiers[key];
                let penalty = 0;
                
                // 大雪と降雪でそれぞれ基本ペナルティ2。重複すれば4。
                if (this.isHeavySnowBattle) penalty += 2;
                if (isSnowing) penalty += 2;
                
                // 兵士1000で倍率1(減少4)、兵士10000で倍率0.25(減少1)になる計算式
                let multiplier = 3000 / (soldiers + 2000);
                
                // 1ターンあたりの最低値を保証しつつ四捨五入
                let actualPenalty = Math.max(1, Math.round(penalty * multiplier));
                
                this.groupStats[key].morale = Math.max(0, this.groupStats[key].morale - actualPenalty);
            }
        }
    }

    // ★追加: 全軍の士気をチェックして、0なら即座に壊滅させる共通の魔法です
    checkMoraleCollapse() {
        let hasCollapsed = false;
        // リストの後ろから順番に確認することで、途中で部隊を消してもズレないようにします
        for (let i = this.units.length - 1; i >= 0; i--) {
            const u = this.units[i];
            let unitMorale = 50;
            if (this.groupStats && this.groupStats[u.groupId]) {
                unitMorale = this.groupStats[u.groupId].morale;
            }
            if (unitMorale <= 0 && u.soldiers > 0) {
                this.log(`士気が完全に崩壊し、${u.name}隊の兵士たちは戦場から逃亡した！`);
                u.soldiers = 0;
                
                // マップ上にアイコンが残っていたら隠します
                const el = document.getElementById(`fw-unit-el-${u.id}`);
                if (el) el.style.display = 'none';

                this.units.splice(i, 1);
                hasCollapsed = true;
            }
        }
        return hasCollapsed;
    }

    // ★追加: 個別部隊の撤退処理
    retreatUnit(unit) {
        // 退き巧者の回復量そのものは SkillManager が決定します。
        const retreatLoss = unit.initialSoldiers - unit.soldiers;
        const bonusRecovery = SkillManager.calcRetreatUnitBonusRecovery(unit, retreatLoss, this.game);
        if (bonusRecovery > 0) {
            unit.soldiers += bonusRecovery;
            this.log(`【退き巧者】${unit.name}隊は被害を最小限に抑えて離脱した！（兵士が${bonusRecovery}回復）`);
            // 大元の deadSoldiers から引いて、攻城戦終了時と二重に回復しないようにします
            if (this.warState && this.warState.deadSoldiers) {
                if (unit.isAttacker) {
                    this.warState.deadSoldiers.attacker = Math.max(0, this.warState.deadSoldiers.attacker - bonusRecovery);
                } else {
                    this.warState.deadSoldiers.defender = Math.max(0, this.warState.deadSoldiers.defender - bonusRecovery);
                }
            }
        }

        // 撤退済みリストに追加（終了時に兵士数を回収するため）
        if (!this.retreatedUnits) this.retreatedUnits = [];
        this.retreatedUnits.push(unit);
        
        // ★追加: 撤退前のプレイヤー参加状況をメモ
        const wasPlayerInvolved = this.units.some(u => u.isPlayer);

        // 戦場から部隊を消す
        this.units = this.units.filter(u => u.id !== unit.id);
        
        // マップとステータスを更新し、行動済み扱いにして次の部隊へ
        unit.hasActionDone = true;
        this.state = 'IDLE';

        const isPlayerInvolved = this.units.some(u => u.isPlayer);
        if (isPlayerInvolved) {
            this.updateMap();
            this.updateStatus();
            this._scheduleFieldWarCallback(() => {
                this.nextPhaseTurn();
            }, 500);
        } else {
            // ★追加: プレイヤーが操作する部隊がいなくなったら、AI野戦へ移行するため画面を隠す
            const modal = document.getElementById('field-war-modal');
            if (modal) modal.classList.add('hidden');
            
            // ★追加: プレイヤーが撤退していなくなった瞬間に、BGMを平時に戻す！
            if (wasPlayerInvolved && window.AudioManager) {
                window.AudioManager.restoreMemorizedBgm();
            }
            
            // ★修正: 大元の戦争データにも「プレイヤーはもういない」とメモを残します！
            if (this.warState) {
                this.warState.isPlayerInvolved = false;
            }
            
            this.nextPhaseTurn();
        }
    }
    
    finishFieldWarWithNotice(resultType, message) {
        if (!this.active) return;

        if (message) this.log(message);
        const shouldShowNotice = !!(this.playerWasInvolved && this.game && this.game.ui && typeof this.game.ui.showDialog === 'function');
        if (shouldShowNotice && !this.fieldEndNoticeShown) {
            this.fieldEndNoticeShown = true;
            this.game.ui.showDialog(message || '野戦は終結しました。', false, () => {
                this.endFieldWar(resultType);
            }, null, { closeBeforeOk: true });
        } else {
            this.endFieldWar(resultType);
        }
    }

    checkEndCondition() {
        const isPlayerInvolved = !!this.playerWasInvolved;

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

        // ★追加：撤退済みリストの中に総大将がいるかチェックします
        let atkGeneralRetreated = false, defGeneralRetreated = false;
        if (this.retreatedUnits) {
            this.retreatedUnits.forEach(u => {
                if (u.isGeneral) {
                    if (u.isAttacker) atkGeneralRetreated = true;
                    else defGeneralRetreated = true;
                }
            });
        }

        const isAtkPlayer = (Number(this.warState.attacker.ownerClan) === Number(this.game.playerClanId));
        const isDefPlayer = (Number(this.warState.defender.ownerClan) === Number(this.game.playerClanId));
        const enemyName = isAtkPlayer ? this.warState.defender.name + "軍" : (isDefPlayer ? this.warState.attacker.name + "軍" : "敵軍");

        // ★修正: 結果とメッセージを一時的に保存する箱を作ります
        let endResult = null;
        let endMessage = "";

        if (!atkAlive || !atkGeneralAlive) {
            if (atkGeneralRetreated) {
                if (isAtkPlayer) endMessage = `総大将が戦線から離脱し、我が軍は敗走しました……`;
                else if (isDefPlayer) endMessage = `敵の総大将が戦線から離脱しました！`;
                else endMessage = `攻撃軍の総大将が戦線から離脱した！`;
            } else {
                if (isAtkPlayer) endMessage = `総大将が撃破され、我が軍は敗北しました……`;
                else if (isDefPlayer) endMessage = `敵の総大将を撃破しました！`;
                else endMessage = `攻撃軍の総大将が敗走した！`;
            }
            endResult = 'attacker_lose';
        }
        else if (!defAlive || !defGeneralAlive) {
            if (defGeneralRetreated) {
                if (isAtkPlayer) endMessage = `敵の総大将が戦線から離脱しました！`;
                else if (isDefPlayer) endMessage = `総大将が戦線から離脱し、我が軍は敗走しました……`;
                else endMessage = `守備軍の総大将が戦線から離脱した！`;
                endResult = 'attacker_win';
            } else {
                if (isAtkPlayer) endMessage = `敵の総大将を撃破しました！ そのまま拠点を制圧します！`;
                else if (isDefPlayer) endMessage = `総大将が撃破され、我が軍は散り散りに敗走しました……`;
                else endMessage = `守備軍の総大将が敗走した！`;
                endResult = 'attacker_win_fatal';
            }
        }
        else {
            let atkTotalRice = 0, defTotalRice = 0;
            for (let key in this.groupStats) {
                if (!this.groupStats[key]) continue;
                if (key.startsWith('atk_')) atkTotalRice += this.groupStats[key].rice;
                else if (key.startsWith('def_')) defTotalRice += this.groupStats[key].rice;
            }

            if (atkTotalRice <= 0) {
                if (isAtkPlayer) endMessage = `兵糧が尽き、これ以上の行軍は不可能です……`;
                else if (isDefPlayer) endMessage = `${enemyName}は兵糧が尽き、撤退していきました！`;
                else endMessage = `兵糧が尽き、攻撃軍は撤退を余儀なくされた！`;
                endResult = 'attacker_lose';
            }
            else if (defTotalRice <= 0) {
                if (isAtkPlayer) endMessage = `${enemyName}は兵糧が尽き、散り散りに敗走していきました！`;
                else if (isDefPlayer) endMessage = `兵糧が底をつきました。拠点を放棄し敗走します……`;
                else endMessage = `兵糧が尽き、守備軍は拠点を放棄して敗走した！`;
                endResult = 'attacker_win_fatal';
            }
            else if (this.turnCount > this.maxTurns) {
                if (isAtkPlayer) endMessage = `これ以上の野戦は不利と判断し撤退します……`;
                else if (isDefPlayer) endMessage = `${enemyName}は攻めきれずに撤退していきました！`;
                else endMessage = `野戦では決着がつかず、攻撃軍は撤退を余儀なくされた！`;
                endResult = 'attacker_retreat';
            }
        }

        // 終了条件を満たしている場合
        if (endResult) {
            this.finishFieldWarWithNotice(endResult, endMessage);
            return true;
        }
        
        return false;
    }
    
    async endFieldWar(resultType) {
        if (!this.active) return;
        const fieldWarGeneration = Number(this._fieldWarGeneration || 0);
        this.active = false;

        // ★追加：野戦の「戦闘終了前」の合図を出します
        if (this.game.eventManager) {
            await this.game.eventManager.processEvents('before_field_war_end', this.warState);
        }
        if (!this._isFieldWarLifecycleCurrent(fieldWarGeneration, false)) return;

        // ★野戦開始時に「待機していた（部隊に配備しなかった）馬・鉄砲」を計算するための箱を用意します
        let atkMainWaitHorses = this.warState.attacker.horses || 0;
        let atkMainWaitGuns = this.warState.attacker.guns || 0;
        let atkAllyWaitHorses = this.warState.reinforcement ? (this.warState.reinforcement.horses || 0) : 0;
        let atkAllyWaitGuns = this.warState.reinforcement ? (this.warState.reinforcement.guns || 0) : 0;
        let atkSelfWaitHorses = this.warState.selfReinforcement ? (this.warState.selfReinforcement.horses || 0) : 0;
        let atkSelfWaitGuns = this.warState.selfReinforcement ? (this.warState.selfReinforcement.guns || 0) : 0;

        let defMainWaitHorses = this.warState.defender.fieldHorses || 0;
        let defMainWaitGuns = this.warState.defender.fieldGuns || 0;
        let defAllyWaitHorses = this.warState.defReinforcement ? (this.warState.defReinforcement.horses || 0) : 0;
        let defAllyWaitGuns = this.warState.defReinforcement ? (this.warState.defReinforcement.guns || 0) : 0;
        let defSelfWaitHorses = this.warState.defSelfReinforcement ? (this.warState.defSelfReinforcement.horses || 0) : 0;
        let defSelfWaitGuns = this.warState.defSelfReinforcement ? (this.warState.defSelfReinforcement.guns || 0) : 0;

        // ★野戦開始時に、各軍が「部隊に配備した（戦場に出た）馬・鉄砲」の数を引いて、待機分を割り出します
        if (this.warState.atkAssignments) {
            this.warState.atkAssignments.forEach(a => {
                let isSelfReinf = this.warState.selfReinforcement && this.warState.selfReinforcement.bushos.some(b => b.id === a.busho.id);
                let isAllyReinf = this.warState.reinforcement && this.warState.reinforcement.bushos.some(b => b.id === a.busho.id);
                
                if (a.troopType === 'kiba') {
                    if (isSelfReinf) atkSelfWaitHorses -= a.soldiers;
                    else if (isAllyReinf) atkAllyWaitHorses -= a.soldiers;
                    else atkMainWaitHorses -= a.soldiers;
                } else if (a.troopType === 'teppo') {
                    if (isSelfReinf) atkSelfWaitGuns -= a.soldiers;
                    else if (isAllyReinf) atkAllyWaitGuns -= a.soldiers;
                    else atkMainWaitGuns -= a.soldiers;
                }
            });
        }
        if (this.warState.defAssignments) {
            this.warState.defAssignments.forEach(a => {
                let isSelfReinf = this.warState.defSelfReinforcement && this.warState.defSelfReinforcement.bushos.some(b => b.id === a.busho.id);
                let isAllyReinf = this.warState.defReinforcement && this.warState.defReinforcement.bushos.some(b => b.id === a.busho.id);
                
                if (a.troopType === 'kiba') {
                    if (isSelfReinf) defSelfWaitHorses -= a.soldiers;
                    else if (isAllyReinf) defAllyWaitHorses -= a.soldiers;
                    else defMainWaitHorses -= a.soldiers;
                } else if (a.troopType === 'teppo') {
                    if (isSelfReinf) defSelfWaitGuns -= a.soldiers;
                    else if (isAllyReinf) defAllyWaitGuns -= a.soldiers;
                    else defMainWaitGuns -= a.soldiers;
                }
            });
        }

        // 計算結果がマイナスにならないようにゼロで止めます（安全装置）
        atkMainWaitHorses = Math.max(0, atkMainWaitHorses); atkMainWaitGuns = Math.max(0, atkMainWaitGuns);
        atkAllyWaitHorses = Math.max(0, atkAllyWaitHorses); atkAllyWaitGuns = Math.max(0, atkAllyWaitGuns);
        atkSelfWaitHorses = Math.max(0, atkSelfWaitHorses); atkSelfWaitGuns = Math.max(0, atkSelfWaitGuns);
        defMainWaitHorses = Math.max(0, defMainWaitHorses); defMainWaitGuns = Math.max(0, defMainWaitGuns);
        defAllyWaitHorses = Math.max(0, defAllyWaitHorses); defAllyWaitGuns = Math.max(0, defAllyWaitGuns);
        defSelfWaitHorses = Math.max(0, defSelfWaitHorses); defSelfWaitGuns = Math.max(0, defSelfWaitGuns);

        let atkSoldiers = 0, defSoldiers = 0;
        
        // ★残った部隊が持っている馬・鉄砲を入れる箱です（あとで待機分と合体させます）
        let atkHorses = 0, atkGuns = 0;
        let defHorses = 0, defGuns = 0;
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

        // 戦場に残っている部隊と、すでに撤退した部隊を合わせて計算します
        let allUnits = [...this.units];
        if (this.retreatedUnits) {
            allUnits = allUnits.concat(this.retreatedUnits);
        }

        allUnits.forEach(u => {
            if (u.isAttacker) {
                // メインの部隊か、援軍かを見分けて、別々の箱にしまいます
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
                // 守備側も同じように、メインと援軍を見分けて別の箱にしまいます
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
        });
        
        // ★ここで「生き残った部隊が持っている分」と「お留守番（待機）していた分」を合体させて保存します！
        this.warState.attacker.soldiers = atkSoldiers;
        this.warState.attacker.horses = atkHorses + atkMainWaitHorses;
        this.warState.attacker.guns = atkGuns + atkMainWaitGuns;
        if (this.groupStats['atk_main']) {
            this.warState.attacker.rice = this.groupStats['atk_main'].rice;
            this.warState.attacker.morale = this.groupStats['atk_main'].morale;
            this.warState.attacker.training = this.groupStats['atk_main'].training; // ★追加：訓練度を大元のデータへ書き戻す
        }

        if (!this.warState.fieldDeadSoldiers) {
            this.warState.fieldDeadSoldiers = { attacker: 0, defender: 0 };
        }
        this.warState.fieldDeadSoldiers.attacker = this.warState.deadSoldiers.attacker;
        this.warState.fieldDeadSoldiers.defender = this.warState.deadSoldiers.defender;

        if (this.warState.reinforcement) {
            this.warState.reinforcement.fieldLoss = Math.max(0, this.warState.reinforcement.soldiers - atkAllyReinfSoldiers);
            this.warState.reinforcement.soldiers = atkAllyReinfSoldiers;
            this.warState.reinforcement.horses = atkAllyReinfHorses + atkAllyWaitHorses;
            this.warState.reinforcement.guns = atkAllyReinfGuns + atkAllyWaitGuns;
            if (this.groupStats['atk_ally']) {
                this.warState.reinforcement.rice = this.groupStats['atk_ally'].rice;
                this.warState.reinforcement.morale = this.groupStats['atk_ally'].morale;
                this.warState.reinforcement.training = this.groupStats['atk_ally'].training; // ★追加：訓練度を大元のデータへ書き戻す
            }
        }

        if (this.warState.selfReinforcement) {
            this.warState.selfReinforcement.fieldLoss = Math.max(0, this.warState.selfReinforcement.soldiers - atkSelfReinfSoldiers);
            this.warState.selfReinforcement.soldiers = atkSelfReinfSoldiers;
            this.warState.selfReinforcement.horses = atkSelfReinfHorses + atkSelfWaitHorses;
            this.warState.selfReinforcement.guns = atkSelfReinfGuns + atkSelfWaitGuns;
            if (this.groupStats['atk_self']) {
                this.warState.selfReinforcement.rice = this.groupStats['atk_self'].rice;
                this.warState.selfReinforcement.morale = this.groupStats['atk_self'].morale;
                this.warState.selfReinforcement.training = this.groupStats['atk_self'].training; // ★追加：訓練度を大元のデータへ書き戻す
            }
        }

        this.warState.defender.fieldSoldiers = defSoldiers;
        this.warState.defender.fieldHorses = defHorses + defMainWaitHorses;
        this.warState.defender.fieldGuns = defGuns + defMainWaitGuns;
        if (this.groupStats['def_main']) {
            this.warState.defFieldRice = this.groupStats['def_main'].rice;
            this.warState.defender.morale = this.groupStats['def_main'].morale;
            this.warState.defender.training = this.groupStats['def_main'].training; // ★追加：訓練度を大元のデータへ書き戻す
        }

        if (this.warState.defReinforcement) {
            this.warState.defReinforcement.fieldLoss = Math.max(0, this.warState.defReinforcement.soldiers - defAllyReinfSoldiers);
            this.warState.defReinforcement.soldiers = defAllyReinfSoldiers;
            this.warState.defReinforcement.horses = defAllyReinfHorses + defAllyWaitHorses;
            this.warState.defReinforcement.guns = defAllyReinfGuns + defAllyWaitGuns;
            if (this.groupStats['def_ally']) {
                this.warState.defReinforcement.rice = this.groupStats['def_ally'].rice;
                this.warState.defReinforcement.morale = this.groupStats['def_ally'].morale;
                this.warState.defReinforcement.training = this.groupStats['def_ally'].training; // ★追加：訓練度を大元のデータへ書き戻す
            }
        }

        if (this.warState.defSelfReinforcement) {
            this.warState.defSelfReinforcement.fieldLoss = Math.max(0, this.warState.defSelfReinforcement.soldiers - defSelfReinfSoldiers);
            this.warState.defSelfReinforcement.soldiers = defSelfReinfSoldiers;
            this.warState.defSelfReinforcement.horses = defSelfReinfHorses + defSelfWaitHorses;
            this.warState.defSelfReinforcement.guns = defSelfReinfGuns + defSelfWaitGuns;
            if (this.groupStats['def_self']) {
                this.warState.defSelfReinforcement.rice = this.groupStats['def_self'].rice;
                this.warState.defSelfReinforcement.morale = this.groupStats['def_self'].morale;
                this.warState.defSelfReinforcement.training = this.groupStats['def_self'].training; // ★追加：訓練度を大元のデータへ書き戻す
            }
        }
        
        // ★追加：ここで「兵士が0人」になってしまった援軍部隊を、攻城戦に参加させずに「撤退」扱いにします！
        if (this.game.warManager && typeof this.game.warManager.retreatReinforcementForce === 'function') {
            if (this.warState.reinforcement && this.warState.reinforcement.soldiers <= 0) this.game.warManager.retreatReinforcementForce('reinforcement');
            if (this.warState.selfReinforcement && this.warState.selfReinforcement.soldiers <= 0) this.game.warManager.retreatReinforcementForce('selfReinforcement');
            if (this.warState.defReinforcement && this.warState.defReinforcement.soldiers <= 0) this.game.warManager.retreatReinforcementForce('defReinforcement');
            if (this.warState.defSelfReinforcement && this.warState.defSelfReinforcement.soldiers <= 0) this.game.warManager.retreatReinforcementForce('defSelfReinforcement');
        }

        // ★追加：イベント側で結果を見れるように保存します
        this.warState.resultType = resultType; 

        const isPlayerInvolved = this.units.some(u => u.isPlayer);
        
        const finishProcess = async () => {
            if (!this._isFieldWarLifecycleCurrent(fieldWarGeneration, false)) return;
            if (this.modal) this.modal.classList.add('hidden');

            // 古いスマホでは、非表示の野戦DOMを保持したまま通常地図を復帰すると
            // 240HEX・部隊DOMと通常地図Canvasが同時常駐して一時メモリの山になる。
            // 戦闘計算の書き戻しが完了したこの地点で、表示資源だけ先に解放する。
            this.releaseFieldWarVisualResources();
            
            // 戦闘用の共通窓口だけが、最後の戦闘所有者が閉じた時に背景を戻します。
            if (this.game.ui && typeof this.game.ui.resumeMainMapAfterBattle === 'function') {
                this.game.ui.resumeMainMapAfterBattle('field-war');
            } else if (this.game.ui && typeof this.game.ui.resumeBackgroundUpdates === 'function') {
                this.game.ui.resumeBackgroundUpdates();
            }
            
            // ★野戦の画面を閉じたあとにイベントを発火させます（裏に隠れて操作不能になるのを防ぐため）
            if (this.game.eventManager) {
                // イベントマネージャー（受付）を経由させることでフラグが保存されます
                await this.game.eventManager.processEvents('after_field_war', this.warState);
                if (!this._isFieldWarLifecycleCurrent(fieldWarGeneration, false)) return;
            }
            
            if (this.onComplete) {
                const onComplete = this.onComplete;
                this.onComplete = null;
                onComplete(resultType);
            }
        };

        if (isPlayerInvolved) {
            this._scheduleFieldWarCallback(() => {
                finishProcess();
            }, 1500, false);
        } else {
            finishProcess();
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
                
                // ★追加：移動した部隊にカメラを追従させます
                this.scrollToUnit(unit);
                
                // ★追加：大雪の時、動かした直後に兵力を減らします（攻撃側3%、守備側1%）
                if (this.isHeavySnowBattle) {
                    let snowPenaltyRate = unit.isAttacker ? 0.03 : 0.01;
                    let lost = Math.floor(unit.soldiers * snowPenaltyRate);
                    if (lost > 0) {
                        unit.soldiers = Math.max(1, unit.soldiers - lost);
                        this.log(`【大雪】猛吹雪の中を行軍したため、${unit.name}隊は${lost}の兵を失った。`);
                    }
                }
                
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
                let targetDir = this.getDirection(unit.x, unit.y, x, y);
                let turnCost = this.getTurnCost(unit.direction, targetDir);
                
                // ★修正：まっすぐ向くための行動力(方向転換コスト + 攻撃コスト1)が確実に余っているか確認します
                if (unit.ap >= turnCost + 1) {
                    if (turnCost > 0) {
                        unit.ap -= turnCost;
                        unit.direction = targetDir;
                        this.log(`${unit.name}隊が攻撃前に対象へ向き直った。`);
                    }
                    unit.ap -= 1;
                    this.executeAttack(unit, targetUnit);
                } else {
                    // 足りない場合はキャンセルして元の状態に戻します
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
            if (targetUnit && this.canAttackTarget(unit, x, y)) {
                let targetDir = this.getDirection(unit.x, unit.y, x, y);
                let turnCost = this.getTurnCost(unit.direction, targetDir);
                
                // ★修正：まっすぐ向くための行動力(方向転換コスト + 攻撃コスト1)が確実に余っているか確認します
                if (unit.ap >= turnCost + 1) {
                    if (turnCost > 0) {
                        unit.ap -= turnCost;
                        unit.direction = targetDir;
                        this.log(`${unit.name}隊が攻撃前に対象へ向き直った。`);
                    }
                    unit.ap -= 1;
                    this.executeAttack(unit, targetUnit);
                } else {
                    this.cancelAction();
                    if(clickedUnit) this.showUnitInfo(clickedUnit);
                }
            } else {
                this.cancelAction();
                if(clickedUnit) this.showUnitInfo(clickedUnit);
            }
        }
    }

    async executeAttack(attacker, defender) {
        if (!this.active) return;
        const fieldWarGeneration = Number(this._fieldWarGeneration || 0);
        // ★追加：クリック連打によるバグを防ぐため、一番最初にシールドを展開して他の操作をブロックします！
        this.state = 'ANIMATING';

        // ★追加：プレイヤーが参加している戦闘かどうかを一番最初に判定します
        const isPlayerInvolved = this.units.some(u => u.isPlayer);
        
        // ★追加：攻撃の直前に最新の向きを画面に反映させて、少しだけ待ちます（クルッと振り向く動きを見せるため）
        if (isPlayerInvolved) {
            this.updateMap();
            // ★追加：攻撃を仕掛ける部隊と対象の部隊の「中間」にカメラを移動させます
            this.scrollToCenterPos(attacker.x, attacker.y, defender.x, defender.y);
            await new Promise(r => setTimeout(r, 200)); // 0.2秒待ってから計算とアニメーション開始
            if (!this._isFieldWarLifecycleCurrent(fieldWarGeneration)) return;
        }

        // それぞれの部隊の専用の箱から、士気と訓練度を取り出します
        let atkMorale = this.groupStats[attacker.groupId] ? this.groupStats[attacker.groupId].morale : 50;
        let atkTraining = this.groupStats[attacker.groupId] ? this.groupStats[attacker.groupId].training : 50;
        let defMorale = this.groupStats[defender.groupId] ? this.groupStats[defender.groupId].morale : 50;
        let defTraining = this.groupStats[defender.groupId] ? this.groupStats[defender.groupId].training : 50;

        // 【野戦独自のダメージ計算】
        let atkS = Math.max(0, attacker.soldiers);
        let defS = Math.max(0, defender.soldiers);

        // 1. 基礎攻撃力・基礎防御力の計算
        // 見やすくするために、武将の強さ（能力の塊）を先に計算しておきます
        const atkBusho = this.game.getBusho(attacker.bushoId);
        const defBusho = this.game.getBusho(defender.bushoId);
        const atkLoyaltyBonus = WarSystem.calcLoyaltyBattleBonus(atkBusho);
        const defLoyaltyBonus = WarSystem.calcLoyaltyBattleBonus(defBusho);
        let atkAbilityAtk = attacker.stats.ldr * 1.5 + attacker.stats.str + atkLoyaltyBonus;
        let atkAbilityDef = attacker.stats.ldr * 1.5 + attacker.stats.int + atkLoyaltyBonus;
        let defAbilityAtk = defender.stats.ldr * 1.5 + defender.stats.str + defLoyaltyBonus;
        let defAbilityDef = defender.stats.ldr * 1.5 + defender.stats.int + defLoyaltyBonus;

        // ★攻撃側の総大将と、守備側の総大将をそれぞれ探して、統率の倍率を計算します
        const atkSideGeneral = this.units.find(u => u.isAttacker === attacker.isAttacker && u.isGeneral);
        const atkSideGenLdr = atkSideGeneral ? atkSideGeneral.stats.ldr : 50; // 万が一見つからない場合は50とします
        const atkSideMultiplier = (atkSideGenLdr / 800) + 1;

        const defSideGeneral = this.units.find(u => u.isAttacker === defender.isAttacker && u.isGeneral);
        const defSideGenLdr = defSideGeneral ? defSideGeneral.stats.ldr : 50;
        const defSideMultiplier = (defSideGenLdr / 800) + 1;

        // 「武将の強さ × 兵力の平方根 ÷ 100」という大軍ボーナスを足し、最後に総大将の倍率を掛けます
        let atkBaseAtk = (Math.sqrt(atkS) + atkAbilityAtk * (atkS / (atkS + 150)) + (atkAbilityAtk * Math.sqrt(atkS) / 100)) * atkSideMultiplier;
        let atkBaseDef = (Math.sqrt(atkS) + atkAbilityDef * (atkS / (atkS + 150)) + (atkAbilityDef * Math.sqrt(atkS) / 100)) * atkSideMultiplier;
        
        let defBaseAtk = (Math.sqrt(defS) + defAbilityAtk * (defS / (defS + 150)) + (defAbilityAtk * Math.sqrt(defS) / 100)) * defSideMultiplier;
        let defBaseDef = (Math.sqrt(defS) + defAbilityDef * (defS / (defS + 150)) + (defAbilityDef * Math.sqrt(defS) / 100)) * defSideMultiplier;

        // ★大雪拠点戦の常時ペナルティと雨雪の防御ペナルティ（悪天巧者で無効化）
        let isRainingOrSnowing = (this.weather === 'rain' || this.weather === 'snow');
        
        let atkWeatherAtkMod = 1.0, atkWeatherDefMod = 1.0;
        let defWeatherAtkMod = 1.0, defWeatherDefMod = 1.0;
        
        if (typeof SkillManager !== 'undefined') {
            atkWeatherAtkMod = SkillManager.calcFieldWeatherAtkModifier(attacker, this.isHeavySnowBattle, this.game);
            atkWeatherDefMod = SkillManager.calcFieldWeatherDefModifier(attacker, this.isHeavySnowBattle, isRainingOrSnowing, this.game);
            defWeatherAtkMod = SkillManager.calcFieldWeatherAtkModifier(defender, this.isHeavySnowBattle, this.game);
            defWeatherDefMod = SkillManager.calcFieldWeatherDefModifier(defender, this.isHeavySnowBattle, isRainingOrSnowing, this.game);
        } else {
            if (this.isHeavySnowBattle) {
                atkWeatherAtkMod *= 0.9; atkWeatherDefMod *= 0.9;
                defWeatherAtkMod *= 0.9; defWeatherDefMod *= 0.9;
            }
            if (isRainingOrSnowing) {
                atkWeatherDefMod *= 0.9; defWeatherDefMod *= 0.9;
            }
        }
        
        atkBaseAtk *= atkWeatherAtkMod;
        atkBaseDef *= atkWeatherDefMod;
        defBaseAtk *= defWeatherAtkMod;
        defBaseDef *= defWeatherDefMod;

        // 2. 最終攻撃力・最終防御力の計算（士気・訓練による補正）
        let atkFinalAtk = atkBaseAtk * (1 + (atkMorale * 1.5 + atkTraining) / 1000);
        let atkFinalDef = atkBaseDef * (1 + (atkMorale + atkTraining * 1.5) / 1000);

        let defFinalAtk = defBaseAtk * (1 + (defMorale * 1.5 + defTraining) / 1000);
        let defFinalDef = defBaseDef * (1 + (defMorale + defTraining * 1.5) / 1000);

        // リーダーの居城によるホーム補正は攻城戦と同じ WarSystem の共通ルールを使います。
        const getHomeBonusMult = (unit) => {
            let activeCastle = null;
            if (unit.groupId === 'atk_main') activeCastle = this.warState.sourceCastle;
            else if (unit.groupId === 'atk_self') activeCastle = this.warState.selfReinforcement ? this.warState.selfReinforcement.castle : null;
            else if (unit.groupId === 'atk_ally') activeCastle = this.warState.reinforcement ? this.warState.reinforcement.castle : null;
            else if (unit.groupId === 'def_main') activeCastle = this.warState.defender;
            else if (unit.groupId === 'def_self') activeCastle = this.warState.defSelfReinforcement ? this.warState.defSelfReinforcement.castle : null;
            else if (unit.groupId === 'def_ally') activeCastle = this.warState.defReinforcement ? this.warState.defReinforcement.castle : null;

            return WarSystem.calcHomeBonusMultiplier(this.game, activeCastle, this.warState.defender);
        };

        // ★ホーム補正を攻撃力に乗せます！
        atkFinalAtk *= getHomeBonusMult(attacker);
        defFinalAtk *= getHomeBonusMult(defender);

        // ★追加: 派閥による連携バフの計算
        const calcFactionBonus = (targetUnit) => {
            let bonusAtk = 0;
            let bonusDef = 0;
            const tBusho = this.game.getBusho(targetUnit.bushoId);
            const factionId = tBusho ? tBusho.factionId : 0;
            const clanId = tBusho ? tBusho.clan : 0; // 武将の所属勢力（家）のデータを取得します
            
            // 派閥に所属している場合のみ計算
            if (factionId !== 0) {
                this.units.forEach(u => {
                    if (u.id === targetUnit.id) return; // 自分自身は除外
                    if (u.isAttacker !== targetUnit.isAttacker) return; // 敵軍は除外
                    
                    const uBusho = this.game.getBusho(u.bushoId);
                    // 違う派閥、または「違う勢力（同盟軍など）」なら除外するようにしました
                    if (!uBusho || uBusho.factionId !== factionId || uBusho.clan !== clanId) return;
                    
                    const dist = this.getDistance(targetUnit.x, targetUnit.y, u.x, u.y);
                    const isLeader = uBusho.isFactionLeader;
                    
                    // リーダーは距離5で10%、それ以外は距離3で5%の恩恵
                    if ((isLeader && dist <= 5) || (!isLeader && dist <= 3)) {
                        const rate = isLeader ? 0.10 : 0.05;
                        let uS = Math.max(0, u.soldiers);
                        
                        // 味方部隊の「元々の基礎値」を計算
                        const uLoyaltyBonus = WarSystem.calcLoyaltyBattleBonus(uBusho);
                        let uBaseAtk = Math.sqrt(uS) + (u.stats.ldr * 1.5 + u.stats.str + uLoyaltyBonus) * (uS / (uS + 150));
                        let uBaseDef = Math.sqrt(uS) + (u.stats.ldr * 1.5 + u.stats.int + uLoyaltyBonus) * (uS / (uS + 150));
                        
                        bonusAtk += uBaseAtk * rate;
                        bonusDef += uBaseDef * rate;
                    }
                });
            }
            return { atk: bonusAtk, def: bonusDef };
        };

        // 攻撃側の派閥バフを最終結果に加算
        let atkFactionBonus = calcFactionBonus(attacker);
        atkFinalAtk += atkFactionBonus.atk;
        atkFinalDef += atkFactionBonus.def;

        // 守備側の派閥バフを最終結果に加算
        let defFactionBonus = calcFactionBonus(defender);
        defFinalAtk += defFactionBonus.atk;
        defFinalDef += defFactionBonus.def;
        
        // 3. 向きによる補正の判定
        const atkDist = this.getDistance(attacker.x, attacker.y, defender.x, defender.y); // ★追加: 攻撃時の距離を計算して覚えておきます
        let atkDirIndex = this.getDirection(attacker.x, attacker.y, defender.x, defender.y);
        let defDirIndex = defender.direction;
        let oppositeAtkDir = (atkDirIndex + 3) % 6;
        let defToAtkDiff = Math.abs(defDirIndex - oppositeAtkDir);
        defToAtkDiff = Math.min(defToAtkDiff, 6 - defToAtkDiff); 

        // ★修正: 鉄砲、または足軽の遠距離(弓射)の場合は常に正面扱いとします
        if (attacker.troopType === 'teppo' || (attacker.troopType === 'ashigaru' && atkDist > 1)) {
            defToAtkDiff = 0; 
        }

        // ターン数から夜かどうかを判定します
        const isNight = this.isNightTurn(); // ★修正：共通の仕組みから答えをもらいます

        let dirMult = 1.0;
        // ★追加: 守備側が「退き巧者」を持っていれば、側面・背後からのダメージ補正を無効化
        if (!SkillManager.ignoresFlankRearPenalty(defender, this.game)) {
            if (defToAtkDiff === 3) {
                dirMult = isNight ? 0.3 : 0.5; // 背後（夜は奇襲への対応が遅れ被害増大）
            } else if (defToAtkDiff === 2) {
                dirMult = isNight ? 0.5 : 0.8; // 側面（夜は視界不良で被害増大）
            }
        }

        // 防御側のステータスに向き補正を適用
        defFinalDef = defFinalDef * dirMult;
        defFinalAtk = defFinalAtk * (dirMult * 0.5);
        
        // 4. 兵科による攻撃力のボーナス計算
        let atkToDefDiff = Math.abs(attacker.direction - atkDirIndex);
        atkToDefDiff = Math.min(atkToDefDiff, 6 - atkToDefDiff);
        
        let atkWeaponMult = 1.0;
        if (attacker.troopType === 'kiba') {
            if (atkToDefDiff === 0) atkWeaponMult = 1.3; // 正面への突撃
            else if (atkToDefDiff === 1) atkWeaponMult = 1.2; // 前斜めへの突撃
        } else if (attacker.troopType === 'teppo') {
            if (atkDist === 1) {
                atkWeaponMult = 0.3; // 隣接時は威力が落ちる
            } else {
                atkWeaponMult = 1.5; // 遠距離なら威力が上がる
                
                // ★追加: 夜の場合は遠距離ダメージが半分になります
                if (isNight) {
                    atkWeaponMult *= 0.5;
                }
            }
        } 
        atkFinalAtk = atkFinalAtk * atkWeaponMult;

        // 5. 兵科による防御力のペナルティ計算（打たれ弱さ）
        let defWeaponMult = 1.0;
        if (defender.troopType === 'kiba') {
            if (defToAtkDiff === 2 || defToAtkDiff === 3) defWeaponMult = 0.9; // 側面や背後から攻撃されると防御力ダウン
        } else if (defender.troopType === 'teppo') {
            defWeaponMult = 0.7; // 鉄砲は常に防御力ダウン
        }
        defFinalDef = defFinalDef * defWeaponMult;

        // 6. 地形による防御力と攻撃力の補正
        // 守備側の地形補正（防御力）
        let defRow = Math.floor(defender.y / 2);
        let defTerrain = (this.grid && this.grid[defRow] && this.grid[defRow][defender.x]) ? this.grid[defRow][defender.x].terrain : 'plain';
        let defIsSea = (this.grid && this.grid[defRow] && this.grid[defRow][defender.x]) ? this.grid[defRow][defender.x].isSea : false;
        
        let defTerrainMult = 1.0;
        if (defTerrain === 'forest') defTerrainMult = 1.15;      // 森は防御力アップ
        else if (defTerrain === 'mountain') defTerrainMult = 1.3; // 山はさらに防御力アップ
        else if (defTerrain === 'river' || defIsSea) {
            // ★川（海）での防御力のマイナス補正（雨や雪の時はさらに厳しく、悪天巧者で軽減）
            let baseMult = 0.7;
            if (typeof SkillManager !== 'undefined') {
                baseMult = SkillManager.calcFieldWaterTerrainModifier(defender, isRainingOrSnowing, this.game);
            } else {
                baseMult = isRainingOrSnowing ? 0.5 : 0.7;
            }
            
            // ★追加: 操船による海の防御ペナルティ軽減
            if (defIsSea && typeof SkillManager !== 'undefined') {
                const defAllies = this.units.filter(u => u.isAttacker === defender.isAttacker);
                baseMult = SkillManager.calcMaritimeDefenseModifier(defender, defAllies, baseMult, this.game);
            }
            
            defTerrainMult = baseMult;
        }
        defFinalDef = defFinalDef * defTerrainMult;

        // ★攻撃側の地形補正（攻撃力）
        let atkRow = Math.floor(attacker.y / 2);
        let atkTerrain = (this.grid && this.grid[atkRow] && this.grid[atkRow][attacker.x]) ? this.grid[atkRow][attacker.x].terrain : 'plain';
        
        let atkTerrainMult = 1.0;
        if (atkTerrain === 'river' || (this.grid && this.grid[atkRow] && this.grid[atkRow][attacker.x].isSea)) {
            // ★足場が悪い川（海）からの攻撃は威力が落ちる（雨や雪の時はさらに厳しく、悪天巧者で軽減）
            if (typeof SkillManager !== 'undefined') {
                atkTerrainMult = SkillManager.calcFieldWaterTerrainModifier(attacker, isRainingOrSnowing, this.game);
            } else {
                atkTerrainMult = isRainingOrSnowing ? 0.5 : 0.7;
            }
        }
        atkFinalAtk = atkFinalAtk * atkTerrainMult;
        
        // ★追加: 遠距離攻撃かどうかの判定
        let isRangedAttack = false;
        if (attacker.troopType === 'teppo' || (attacker.troopType === 'ashigaru' && atkDist > 1)) {
            isRangedAttack = true;
        }

        // ==========================================
        // ★追加・変更: クリティカル機能の一元管理
        // ==========================================
        // スキルマネージャーにまとめて判定してもらいます
        // ★追加: 狙撃用に遠距離鉄砲かどうかのフラグを渡し、朱槍用に隣接かどうかのフラグも渡します
        let isAtkRangedTeppo = (attacker.troopType === 'teppo' && atkDist > 1);
        let isDefRangedTeppo = false; // 反撃は距離1のみなので遠距離にはならない
        let isAdjacent = (atkDist === 1); // ★追加

        // ★修正：相手（ターゲット）の情報も渡して、無効化されるかどうかもマネージャーの中で判断させます！
        let atkCritResult = SkillManager.getCriticalResult(attacker, defender, this.game, isAtkRangedTeppo, isAdjacent);
        let defCritResult = SkillManager.getCriticalResult(defender, attacker, this.game, isDefRangedTeppo, true); // 反撃時は必ず隣接なのでtrueを渡します

        let isAtkCritical = atkCritResult.isCritical;
        let isDefCritical = defCritResult.isCritical;

        let atkFinalAtkCurrent = atkFinalAtk;
        let defFinalDefCurrent = defFinalDef;

        if (isAtkCritical) {
            atkFinalAtkCurrent *= atkCritResult.atkMult;
            defFinalDefCurrent *= atkCritResult.defMult;
        }
        
        // 7. 与ダメージ計算（基礎）
        let dmgRatio = (atkFinalAtkCurrent + defFinalDefCurrent) > 0 ? (atkFinalAtkCurrent / (atkFinalAtkCurrent + defFinalDefCurrent)) : 0;
        let dmgToDef = Math.floor(atkFinalAtkCurrent * dmgRatio);
        
        // ★弓射では算出された最終ダメージを5分の1にカットします
        if (attacker.troopType === 'ashigaru' && atkDist > 1) {
            dmgToDef = Math.floor(dmgToDef * 0.2);
            if (isNight) {
                dmgToDef = Math.floor(dmgToDef * 0.5); // 夜はさらに半分
            }
        }

        // 8. 連携攻撃によるダメージアップ（サポート部隊1つにつき10%アップ）
        let supportCount = 0;
        // ★修正: 鉄砲、および足軽の遠距離(弓射)の場合は連携攻撃が発生しないようにします
        if (attacker.troopType !== 'teppo' && !(attacker.troopType === 'ashigaru' && atkDist > 1)) {
            this.units.forEach(u => {
                // 自分以外、同じ陣営、鉄砲隊ではない味方を探します
                if (u.id !== attacker.id && u.isAttacker === attacker.isAttacker && u.troopType !== 'teppo') {
                    // 敵部隊に隣接しているかを確認します
                    if (this.getDistance(u.x, u.y, defender.x, defender.y) === 1) {
                        let dirToDef = this.getDirection(u.x, u.y, defender.x, defender.y);
                        // 敵部隊に対して正面を向いているかを確認します
                        if (u.direction === dirToDef) {
                            supportCount++;
                        }
                    }
                }
            });
        }
        if (supportCount > 0) {
            // 見つけた味方の数 × 10%（0.1）の分だけダメージを増やします
            dmgToDef = Math.floor(dmgToDef * (1 + (0.1 * supportCount)));
        }

        // 9. 反撃ダメージ計算（基礎）
        let dmgToAtk = 0;

        if (atkDist === 1) { // 反撃は距離1のときのみ
            let defFinalAtkCounter = defFinalAtk;
            let atkFinalDefCounter = atkFinalDef;

            if (isDefCritical) {
                defFinalAtkCounter *= defCritResult.atkMult;
                atkFinalDefCounter *= defCritResult.defMult;
            }

            let counterRatio = (defFinalAtkCounter + atkFinalDefCounter) > 0 ? (atkFinalDefCounter / (defFinalAtkCounter + atkFinalDefCounter)) : 0;
            dmgToAtk = Math.floor(defFinalAtkCounter * 0.5 * counterRatio);
        }

        // ==========================================
        // ★変更: 傾奇者と鎮西一の判定（スキルマネージャーに一元管理させます）
        // ==========================================
        let atkUnderdogResult = typeof SkillManager !== 'undefined' ? SkillManager.getUnderdogSkillModifiers(attacker, this.units, this.game, atkDist === 1) : { atkMult: 1.0, defMult: 1.0, isKabukimono: false, isChinzei: false };
        let defUnderdogResult = typeof SkillManager !== 'undefined' ? SkillManager.getUnderdogSkillModifiers(defender, this.units, this.game, atkDist === 1) : { atkMult: 1.0, defMult: 1.0, isKabukimono: false, isChinzei: false };

        let isAtkKabukimono = atkUnderdogResult.isKabukimono;
        let isDefKabukimono = defUnderdogResult.isKabukimono;
        let isAtkChinzei = atkUnderdogResult.isChinzei;
        let isDefChinzei = defUnderdogResult.isChinzei;

        // ==========================================
        // ★追加: 適性とスキルによる最終ダメージの増加・軽減処理
        // ==========================================
        // 甲斐の虎などの判定用に、戦場にいる全味方武将をリストアップします
        let activeAllBushos_FW = this.units.filter(u => u.isAttacker === attacker.isAttacker).map(u => this.game.getBusho(u.bushoId)).filter(b => b);
        let targetAllBushos_FW = this.units.filter(u => u.isAttacker === defender.isAttacker).map(u => this.game.getBusho(u.bushoId)).filter(b => b);

        let atkBushoObj = this.game.getBusho(attacker.bushoId);
        let defBushoObj = this.game.getBusho(defender.bushoId);

        let atkClanId = atkBushoObj ? atkBushoObj.clan : 0;
        let atkKunishuId = attacker.kunishuId || (atkBushoObj ? atkBushoObj.belongKunishuId : 0);
        let defClanId = defBushoObj ? defBushoObj.clan : 0;
        let defKunishuId = defender.kunishuId || (defBushoObj ? defBushoObj.belongKunishuId : 0);

        let atkSkillAtkMod = 1.0, defSkillAtkMod = 1.0;
        let atkSkillDefMod = 1.0, defSkillDefMod = 1.0;

        if (typeof SkillManager !== 'undefined') {
            // ★修正: 野戦で隣接戦闘（距離1）かどうかを判定して朱槍の効果を計算させます
            let isAdjacent = (atkDist === 1);
            
            atkSkillAtkMod = SkillManager.calcSkillDamageModifier([atkBushoObj], atkClanId, atkKunishuId, activeAllBushos_FW, isAdjacent);
            defSkillAtkMod = SkillManager.calcSkillDamageModifier([defBushoObj], defClanId, defKunishuId, targetAllBushos_FW, isAdjacent);
            
            atkSkillDefMod = SkillManager.calcSkillDefenseModifier([atkBushoObj], atkClanId, atkKunishuId, activeAllBushos_FW);
            defSkillDefMod = SkillManager.calcSkillDefenseModifier([defBushoObj], defClanId, defKunishuId, targetAllBushos_FW);
        }

        // 増加系の計算を先に行います
        let aptitudeAtkMult = SkillManager.calcAptitudeDamageModifier(attacker, isRangedAttack, this.game);
        dmgToDef = Math.floor(dmgToDef * aptitudeAtkMult * atkSkillAtkMod);
        
        if (atkDist === 1) {
            let aptitudeDefCounterMult = SkillManager.calcAptitudeDamageModifier(defender, false, this.game);
            dmgToAtk = Math.floor(dmgToAtk * aptitudeDefCounterMult * defSkillAtkMod);
        }

        // 軽減系の計算（傾奇者や鎮西一の軽減もここで一緒に計算します）
        let aptitudeDefReduceMult = SkillManager.calcAptitudeDefenseModifier(defender, attacker, isRangedAttack, this.game);
        let defUnderdogMod = defUnderdogResult.defMult;
        
        // ★制限：軽減系はすべて重ねても元の10%未満にならないようにガードします！
        let totalDefReduceMod = aptitudeDefReduceMult * defSkillDefMod * defUnderdogMod;
        totalDefReduceMod = Math.max(0.10, totalDefReduceMod);
        dmgToDef = Math.floor(dmgToDef * totalDefReduceMod);
        
        if (atkDist === 1) {
            let aptitudeAtkReduceMult = SkillManager.calcAptitudeDefenseModifier(attacker, defender, false, this.game);
            let atkUnderdogMod = atkUnderdogResult.defMult;
            
            // ★制限：反撃の軽減にもガードをかけます
            let totalAtkReduceMod = aptitudeAtkReduceMult * atkSkillDefMod * atkUnderdogMod;
            totalAtkReduceMod = Math.max(0.10, totalAtkReduceMod);
            dmgToAtk = Math.floor(dmgToAtk * totalAtkReduceMod);
        }

        // ==========================================
        // ★追加: 複合スキルや傾奇者・鎮西一の最終ダメージ計算（増加分）
        // ==========================================
        // （※クリティカルの無効化処理はスキルマネージャーの中で行われるようになったので、ここでは聞いて結果を受け取るだけです！）

        // 鬼（1.5倍）などの特別補正がある場合は適用します
        if (isAtkCritical) {
            dmgToDef = Math.floor(dmgToDef * atkCritResult.finalDmgMult);
        }
        if (atkDist === 1 && isDefCritical) {
            dmgToAtk = Math.floor(dmgToAtk * defCritResult.finalDmgMult);
        }

        dmgToDef = Math.floor(dmgToDef * atkUnderdogResult.atkMult); // 傾奇者・鎮西一による与ダメージ増幅
        dmgToAtk = Math.floor(dmgToAtk * defUnderdogResult.atkMult); // 傾奇者・鎮西一による反撃ダメージ増幅

        // ★プレイヤーがいないAI同士の戦いなら、ダメージを抑制します！
        if (!isPlayerInvolved) {
            const autoRate = window.WarParams.War.AutoWarDamageRate;
            dmgToDef = Math.floor(dmgToDef * autoRate);
            dmgToAtk = Math.floor(dmgToAtk * autoRate);
        }

        // ダメージ適用（兵数以上のダメージは受けないようにガード）
        dmgToDef = Math.min(defender.soldiers, dmgToDef);
        dmgToAtk = Math.min(attacker.soldiers, dmgToAtk);

        // ==========================================
        // ★ここからアニメーションの魔法です！
        // ==========================================
        if (isPlayerInvolved) {
        
            const atkEl = document.getElementById(`fw-unit-el-${attacker.id}`);
            const defEl = document.getElementById(`fw-unit-el-${defender.id}`);

            // 交互に4度ずつ点滅。低FPS端末でも class の付け外しが同じ描画へ潰れないよう、
            // 明状態・通常状態の双方で最低1回は描画機会を通す。
            if (atkEl && defEl) {
                const flashOnce = async (el) => {
                    el.classList.add('anim-battle-flash');
                    await this._waitForFieldWarVisualState(120);
                    el.classList.remove('anim-battle-flash');
                    await this._waitForFieldWarVisualState(35);
                };
                for (let i = 0; i < 4; i++) {
                    await flashOnce(atkEl);
                    await flashOnce(defEl);
                }
            }

            // 点滅が終わったら兵数を減らします
            defender.soldiers -= dmgToDef;
            attacker.soldiers -= dmgToAtk;

            // ダメージの数字をポーンと出す仕組みです
            const showDamagePopup = (damage, el) => {
                if (!el || damage <= 0) return;
                const popup = document.createElement('div');
                popup.className = 'fw-damage-popup';
                popup.innerText = `-${damage}`;
                
                this.mapEl.appendChild(popup);
                
                // ★修正: 画面の拡大縮小（scale）でズレないように、
                // 部隊アイコンが持っている「マップ内の正確な座標」を直接読み取って使います！
                const elLeft = parseFloat(el.style.left);
                const elTop = parseFloat(el.style.top);
                const elWidth = parseFloat(el.style.width);
                
                // ポップアップを部隊アイコンの横幅の真ん中、少し上に配置します
                popup.style.left = `${elLeft + (elWidth / 2)}px`;
                popup.style.top = `${elTop}px`;
                
                // 低FPS端末でも最低1回は完全表示されたフレームを通してから保持時間を数える。
                // CSSアニメーションをappend直後から走らせると、重い実機では最終フレームへ飛んで一瞬に見える。
                const retirePopup = async () => {
                    await this._waitForFieldWarVisualState(0);
                    await new Promise(r => setTimeout(r, 650));
                    if (!popup.parentNode) return;

                    const remove = () => {
                        if (popup.parentNode) popup.parentNode.removeChild(popup);
                    };
                    popup.addEventListener('animationend', remove, { once: true });
                    popup.classList.add('is-leaving');
                    setTimeout(remove, 700);
                };
                retirePopup();
            };

            showDamagePopup(dmgToDef, defEl);
            showDamagePopup(dmgToAtk, atkEl);

            // 画面上の兵士の数字を書き換えます
            if (defEl) {
                const soldierText = defEl.querySelector('.fw-unit-soldiers');
                if (soldierText) soldierText.innerText = defender.soldiers;
            }
            if (atkEl) {
                const soldierText = atkEl.querySelector('.fw-unit-soldiers');
                if (soldierText) soldierText.innerText = attacker.soldiers;
            }

            // ポップアップをしっかり見せるために少しだけ待ちます
            await new Promise(r => setTimeout(r, 800));
            if (!this._isFieldWarLifecycleCurrent(fieldWarGeneration)) return;
        } else {
            // プレイヤーがいない（AI同士）ならアニメーションをスキップしてパパッと減らします
            defender.soldiers -= dmgToDef;
            attacker.soldiers -= dmgToAtk;
        }
        // ==========================================

        // ★追加：武将の死亡フラグ判定（野戦での負傷による死亡フラグ）
        // 攻撃側の兵力も計算に使うため、部隊データ(attackerUnit)を丸ごと受け取るように変更しました
        const checkDeathFlag = (targetUnit, attackerUnit, isDestroyed) => {
            // 武将のIDがない場合や、ゲームデータが見つからない場合はストップします
            if (!targetUnit.bushoId || !this.game) return;
            const targetBusho = this.game.getBusho(targetUnit.bushoId);
            if (!targetBusho) return;

            // ★追加：既に死亡フラグが立っている武将に対しては再度判定しないようにガードします
            if (targetBusho.deathFlag) return;

            // ★追加：討死武将が「本来の寿命」を過ぎて生き延びているかチェックします
            let multiplier = 1; // 基本は1倍（そのまま）です
            if (targetBusho.isKilledInBattle && this.game.year >= targetBusho.originalEndYear) {
                multiplier = 3; // 条件に当てはまれば確率を3倍にします
            }

            let prob = 0;
            if (isDestroyed) {
                // 兵士が0にされた（壊滅した）時は、基本3%
                prob = 0.03;
            } else {
                // 壊滅していない時は、攻撃してきた兵科によって変わります
                if (attackerUnit.troopType === 'teppo') prob = 0.005; // 鉄砲は0.5%
                else if (attackerUnit.troopType === 'kiba') prob = 0.0015; // 騎馬は0.15%
                else if (attackerUnit.troopType === 'ashigaru') prob = 0.001; // 足軽は0.1%
            }

            // 基本の確率がある場合だけ、計算を続けます
            if (prob > 0) {
                // 1. 武力軽減率の計算（1 + 武力 / 200）
                const targetStrength = targetBusho.strength || 0;
                const strengthReduction = 1 + (targetStrength / 200);

                // 2. 兵数軽減率の計算
                // 兵数が一時的にマイナスになってルート計算がエラーにならないよう、最低でも0にする魔法をかけます
                const targetSoldiers = Math.max(0, targetUnit.soldiers);
                const attackerSoldiers = Math.max(0, attackerUnit.soldiers);
                
                // ★修正：壊滅した時は兵数による軽減を行わないようにします
                let troopReduction = 1; // 1なら割り算をしても最終的な確率は変わりません
                if (!isDestroyed) {
                    troopReduction = (100 + Math.sqrt(targetSoldiers)) / (100 + Math.sqrt(attackerSoldiers));
                }

                // 3. 最終的な確率の計算（基本確率 / 武力軽減率 / 兵数軽減率）
                let finalProb = (prob * multiplier) / strengthReduction / troopReduction;

                // ★変更：スキルマネージャーに野戦死亡率の最終倍率（武芸や不死鳥スキルなど）を聞きにいきます
                if (typeof SkillManager !== 'undefined') {
                    finalProb *= SkillManager.calcFieldDeathProbModifier(targetBusho, this.game);
                }

                // 確率のサイコロを振って、当たったらフラグを立てます
                if (Math.random() < finalProb) {
                    targetBusho.deathFlag = true;
                    targetUnit.isWounded = true; // ★追加：撤退させるための目印をつけます
                }
            }
        };

        // 守備側が攻撃を受けた時の判定
        // 部隊データを丸ごと渡すように変更しました
        if (dmgToDef > 0) {
            checkDeathFlag(defender, attacker, defender.soldiers <= 0);
        }
        // 攻撃側が反撃を受けた時の判定
        // 部隊データを丸ごと渡すように変更しました
        if (dmgToAtk > 0) {
            checkDeathFlag(attacker, defender, attacker.soldiers <= 0);
        }

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
        else if (attacker.troopType === 'ashigaru' && atkDist > 1) atkWeapon = "弓射"; // ★追加: 遠距離の場合は弓射になります

        let counterMsg = (dmgToAtk > 0) ? ` 反撃で${dmgToAtk}の被害！` : ``;

        // ★追加: ログの先頭に付けるカッコいい名前（スキル名に動的対応）
        let atkPrefix = "";
        if (isAtkKabukimono) atkPrefix += "【傾奇者】";
        else if (isAtkChinzei) atkPrefix += "【鎮西一】";
        
        if (isAtkCritical) {
            if (atkCritResult.skillName) {
                atkPrefix += `【${atkCritResult.skillName}】`;
            } else {
                atkPrefix += "【会心】";
            }
        }
        
        let defPrefix = "";
        if (isDefKabukimono) defPrefix += "【傾奇者】";
        else if (isDefChinzei) defPrefix += "【鎮西一】";
        
        if (isDefCritical) {
            if (defCritResult.skillName) {
                defPrefix += `【${defCritResult.skillName}(反撃)】`;
            } else {
                defPrefix += "【会心(反撃)】";
            }
        }

        this.log(`${atkPrefix}${attacker.name}隊の${atkWeapon}！${dirMsg} 敵に${dmgToDef}の損害！${counterMsg ? defPrefix + counterMsg : ""}`);
        
        // ★追加：戦闘を行った部隊の所属する軍の訓練度を上昇（戦争由来のみ内部上限120）
        const maxTraining = window.WarParams.Military.MaxTrainingInternal;
        if (this.groupStats[attacker.groupId]) {
            this.groupStats[attacker.groupId].training = Math.min(maxTraining, this.groupStats[attacker.groupId].training + 1);
        }
        if (this.groupStats[defender.groupId]) {
            this.groupStats[defender.groupId].training = Math.min(maxTraining, this.groupStats[defender.groupId].training + 1);
        }

        // ★追加：ダメージ比率による士気の綱引き（最大3）
        let totalDmg = dmgToDef + dmgToAtk;
        if (totalDmg > 0) {
            // お互いのダメージの差を、合計ダメージで割ることで、-1.0 から 1.0 の間の割合を出します
            let ratio = (dmgToDef - dmgToAtk) / totalDmg;
            // 割合に3を掛けて四捨五入し、-3 から 3 の間で変動する数値を決めます
            let atkMoraleChange = Math.round(ratio * 3); 
            
            if (atkMoraleChange !== 0) {
                const maxMorale = window.WarParams.Military.MaxMoraleInternal;
                if (this.groupStats[attacker.groupId]) {
                    this.groupStats[attacker.groupId].morale = Math.max(0, Math.min(maxMorale, this.groupStats[attacker.groupId].morale + atkMoraleChange));
                }
                if (this.groupStats[defender.groupId]) {
                    this.groupStats[defender.groupId].morale = Math.max(0, Math.min(maxMorale, this.groupStats[defender.groupId].morale - atkMoraleChange));
                }
            }
        }

        // ★追加：戦闘を行った部隊の武将に経験値をプレゼント（ダメージを与えた時だけ！）
        if (dmgToDef > 0 && attacker.bushoId && this.game) {
            const aBusho = this.game.getBusho(attacker.bushoId);
            // ダミー武将（モブ）ではない、本物の武将かチェックします
            if (aBusho && aBusho.id && String(aBusho.id).indexOf('dummy') === -1) {
                aBusho.expLeadership = (aBusho.expLeadership || 0) + 1; // 統率+1
                aBusho.expStrength = (aBusho.expStrength || 0) + 2;     // 武力+2
            }
        }
        if (dmgToAtk > 0 && defender.bushoId && this.game) {
            const dBusho = this.game.getBusho(defender.bushoId);
            // ダミー武将（モブ）ではない、本物の武将かチェックします
            if (dBusho && dBusho.id && String(dBusho.id).indexOf('dummy') === -1) {
                dBusho.expLeadership = (dBusho.expLeadership || 0) + 1; // 統率+1
                dBusho.expStrength = (dBusho.expStrength || 0) + 2;     // 武力+2
            }
        }

        if (defender.isWounded) {
            // ★負傷した部隊の撤退処理
            this.log(`${defender.name}が負傷しました！　${defender.name}隊は戦場から離脱します！`);
            this.units = this.units.filter(u => u.id !== defender.id);
            
            // マップ上にアイコンが残っていたら隠します
            const el = document.getElementById(`fw-unit-el-${defender.id}`);
            if (el) el.style.display = 'none';

            // 兵士が残っている場合は撤退済みリストに入れる（戦後に兵士を回収させるため）
            if (defender.soldiers > 0) {
                if (!this.retreatedUnits) this.retreatedUnits = [];
                this.retreatedUnits.push(defender);
            }
        } else if (defender.soldiers <= 0) {
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
                    let rise = (key === defender.groupId) ? 3 : 1;
                    const maxMorale = window.WarParams.Military.MaxMoraleInternal;
                    this.groupStats[key].morale = Math.min(maxMorale, this.groupStats[key].morale + rise);
                }
            }
            this.log(`部隊の壊滅により、${defender.name}隊が所属する軍の士気が大きく下がり、友軍の士気も下がった！`);
            this.log(`${attacker.name}隊が所属する軍の士気が大きく上がり、友軍の士気も上がった！`);
        }

        if (attacker.isWounded) {
            // 負傷した部隊の撤退処理
            this.log(`${attacker.name}が負傷しました！　${attacker.name}隊は戦場から離脱します！`);
            this.units = this.units.filter(u => u.id !== attacker.id);
            
            // マップ上にアイコンが残っていたら隠します
            const el = document.getElementById(`fw-unit-el-${attacker.id}`);
            if (el) el.style.display = 'none';

            // 兵士が残っている場合は撤退済みリストに入れる（戦後に兵士を回収させるため）
            if (attacker.soldiers > 0) {
                if (!this.retreatedUnits) this.retreatedUnits = [];
                this.retreatedUnits.push(attacker);
            }
        } else if (attacker.soldiers <= 0) {
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
                    const maxMorale = window.WarParams.Military.MaxMoraleInternal;
                    this.groupStats[key].morale = Math.min(maxMorale, this.groupStats[key].morale + rise);
                }
            }
            this.log(`部隊の壊滅により、${attacker.name}隊が所属する軍の士気が大きく下がり、友軍の士気も下がった！`);
            this.log(`${defender.name}隊が所属する軍の士気が大きく上がり、友軍の士気も上がった！`);
        }
        
        // ★追加: 戦闘のダメージや部隊壊滅によって士気が0になった部隊がないか、瞬時にチェックします！
        this.checkMoraleCollapse();

        attacker.hasActionDone = true;
        this.state = 'IDLE'; // ★シールドを解除して操作できるように戻します
        
        // ★追加: この戦闘の結果、プレイヤーが操作する部隊が全滅していなくなったかチェック
        const stillPlayerInvolved = this.units.some(u => u.isPlayer);

        if (stillPlayerInvolved) {
            this.updateMap();
            this.updateStatus();
            this._scheduleFieldWarCallback(() => {
                this.nextPhaseTurn();
            }, 800);
        } else {
            // ★プレイヤーがいなくなったら画面を隠してAI野戦に移行
            const modal = document.getElementById('field-war-modal');
            if (modal && isPlayerInvolved) {
                modal.classList.add('hidden');
                // ★追加: プレイヤーの部隊が全滅していなくなった瞬間に、BGMを平時に戻す！
                if (window.AudioManager) {
                    window.AudioManager.restoreMemorizedBgm();
                }
                
                // ★修正: 大元の戦争データにも「プレイヤーはもういない」とメモを残します！
                if (this.warState) {
                    this.warState.isPlayerInvolved = false;
                }
            }
            this.nextPhaseTurn();
        }
    }

    // AIが「誰を助けるべきか」を、ターゲット選択・移動・攻撃で共通して参照する。
    // 総大将が直接交戦中なのに周囲が地形や性格だけを見て傍観する、といった判断の分断を避ける。
    _buildAIEngagementContext(unit, enemies, allies) {
        const ownGeneral = unit.isGeneral ? unit : (allies.find(a => a.isGeneral) || null);
        const engagedEnemyIds = new Set();
        const generalThreatEnemyIds = new Set();
        const engagementCountByEnemy = new Map();

        enemies.forEach(enemy => {
            let count = 0;
            allies.forEach(ally => {
                if (this.getDistance(enemy.x, enemy.y, ally.x, ally.y) === 1) count++;
            });
            if (count > 0) {
                engagedEnemyIds.add(enemy.id);
                engagementCountByEnemy.set(enemy.id, count);
            }
            if (ownGeneral && this.getDistance(enemy.x, enemy.y, ownGeneral.x, ownGeneral.y) === 1) {
                generalThreatEnemyIds.add(enemy.id);
            }
        });

        return {
            ownGeneral,
            engagedEnemyIds,
            generalThreatEnemyIds,
            engagementCountByEnemy,
            anyAllyEngaged: engagedEnemyIds.size > 0,
            ownGeneralEngaged: generalThreatEnemyIds.size > 0
        };
    }

    _getAITargetEngagementBonus(unit, enemy, engagementContext) {
        if (!engagementContext || !enemy) return 0;
        let bonus = 0;

        // 総大将へ直接取り付いている敵は、一般部隊にとって最優先の救援対象。
        // 総大将本人のターンでは過剰な全軍救援補正にせず、目前の敵を選びやすくする程度に留める。
        if (engagementContext.generalThreatEnemyIds.has(enemy.id)) {
            bonus += unit.isGeneral ? WarParams.FieldAI.Support.GeneralSelfThreatTargetBonus : WarParams.FieldAI.Support.GeneralThreatTargetBonus;
        }

        if (engagementContext.engagedEnemyIds.has(enemy.id)) {
            const count = engagementContext.engagementCountByEnemy.get(enemy.id) || 1;
            bonus += WarParams.FieldAI.Support.EngagedTargetBonus + Math.max(0, count - 1) * WarParams.FieldAI.Support.ExtraEngagedAllyBonus;
        }
        return bonus;
    }

    _getAISupportUrgency(targetEnemy, engagementContext) {
        if (!targetEnemy || !engagementContext) return 0;
        if (engagementContext.generalThreatEnemyIds.has(targetEnemy.id)) return WarParams.FieldAI.Support.GeneralThreatUrgency;
        if (engagementContext.engagedEnemyIds.has(targetEnemy.id)) return WarParams.FieldAI.Support.EngagedUrgency;
        return 0;
    }

    _getAIMoveBudget(unit, supportUrgency) {
        if (!unit) return 0;
        return Math.max(0, unit.ap - (supportUrgency > 0 ? 0 : 1));
    }

    // 候補地点から「向き変更＋攻撃」まで今ターンに実行できるかを調べる。
    // 移動先評価と実際の攻撃フェイズが別々の都合で判断し、攻撃可能地点の一歩手前で止まるのを防ぐ。
    _getAIAttackOpportunityAt(unit, x, y, direction, remainingAP, hasMoved, enemies, engagementContext, preferredTargetId = null) {
        if (remainingAP < 1) return null;
        let best = null;

        enemies.forEach(enemy => {
            const targetDir = this.getDirection(x, y, enemy.x, enemy.y);
            const turnCost = this.getTurnCost(direction, targetDir);
            if (remainingAP < turnCost + 1) return;

            const tempUnit = Object.assign({}, unit, {
                x,
                y,
                direction: targetDir,
                hasMoved
            });
            if (!this.canAttackTarget(tempUnit, enemy.x, enemy.y)) return;

            let score = 0;
            if (enemy.id === preferredTargetId) score += WarParams.FieldAI.Support.PreferredAttackTargetBonus;
            score += this._getAITargetEngagementBonus(unit, enemy, engagementContext);
            if (enemy.isGeneral) score += 30;
            if (enemy.troopType === 'teppo') score += 20;

            if (!best || score > best.score) {
                best = { enemy, score, turnCost };
            }
        });

        return best;
    }

    // ★修正: AIの行動スコアに「智謀」「性格」に加えて、交戦支援を全判断段階で共有する。
    async processAITurn() {
        if (!this.active) return;
        const fieldWarGeneration = Number(this._fieldWarGeneration || 0);
        const unit = this.turnQueue[0];
        if (!unit) return;
        const enemies = this.units.filter(u => u.isAttacker !== unit.isAttacker);
        const allies = this.units.filter(u => u.isAttacker === unit.isAttacker && u.id !== unit.id);
        
        if (enemies.length === 0) {
            this.nextPhaseTurn();
            return;
        }

        const isPlayerInvolved = this.units.some(u => u.isPlayer);
        if (isPlayerInvolved) {
            await new Promise(r => setTimeout(r, 600));
            if (!this._isFieldWarLifecycleCurrent(fieldWarGeneration)) return;
        }

        // --- 武将のデータ（智謀・性格）を読み込む ---
        const myBusho = this.game.getBusho(unit.bushoId);
        const myInt = myBusho ? myBusho.intelligence : 50;
        const myPersonality = myBusho ? myBusho.personality : 'balanced';

        // 智謀による「揺らぎ（ブレ）」の倍率
        const randMult = Math.max(0, (90 - myInt) / 40);

        // --- 戦力差撤退判定 ---
        let allySoldiers = unit.soldiers, enemySoldiers = 0;
        let initialAllySoldiers = unit.initialSoldiers, initialEnemySoldiers = 0; // ★追加：初期兵数
        allies.forEach(a => {
            allySoldiers += a.soldiers;
            initialAllySoldiers += a.initialSoldiers; // ★追加
        });
        enemies.forEach(e => {
            enemySoldiers += e.soldiers;
            initialEnemySoldiers += e.initialSoldiers; // ★追加
        });
        
        // ★修正：攻撃側の諸勢力かどうかをチェックします（攻撃側の諸勢力は絶対に撤退しません！）
        let isKunishuAttacker = (unit.isAttacker && this.warState.attacker.isKunishu);
        
        // ★追加：守備側が野戦開始時点で既に撤退ライン（敵の20%未満）だったかどうかの判定
        let isStartUnderdogDef = !unit.isAttacker && (initialAllySoldiers < initialEnemySoldiers * 0.2);
        
        // ★修正: 攻撃側の諸勢力でなければ、総大将なら全軍撤退、一般部隊なら個別撤退の判断をします
        // ただし、守備側で最初から兵力差があった場合は総大将の全軍撤退はしません
        if (!isKunishuAttacker && unit.isGeneral && (allySoldiers < enemySoldiers * 0.2) && !isStartUnderdogDef) {
            const retreatMessage = unit.isAttacker
                ? `${unit.name}軍は不利を悟り、攻略を諦めて撤退しました。野戦は終結します。`
                : `${unit.name}軍は不利を悟り、拠点へ退きました。野戦を終え、攻城戦へ移ります。`;
            this.finishFieldWarWithNotice(unit.isAttacker ? 'attacker_retreat' : 'defender_retreat', retreatMessage);
            return;
        } else if (!isKunishuAttacker && !unit.isGeneral && unit.initialSoldiers > 500 && (unit.soldiers <= 200 || unit.soldiers < enemySoldiers * 0.05)) {
            // ★修正：一般部隊は、元々の兵士数が500より多くて、自分の兵士が少なすぎるか、敵全体に対して少なすぎたら逃げる
            if (isPlayerInvolved) this.log(`${unit.name}隊は被害が大きく、戦場から撤退しました！`);
            this.retreatUnit(unit);
            return;
        }

        const maxEnemySoldiers = Math.max(...enemies.map(e => e.soldiers), 1);
        const engagementContext = this._buildAIEngagementContext(unit, enemies, allies);

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
            
            // 交戦中の味方、とくに総大将へ取り付いている敵を優先する。
            score += this._getAITargetEngagementBonus(unit, e, engagementContext);
            
            score += Math.random() * 10 * randMult; 
            
            if (score > bestTargetScore) {
                bestTargetScore = score;
                targetEnemy = e;
            }
        });

        let distToTarget = this.getDistance(unit.x, unit.y, targetEnemy.x, targetEnemy.y);
        const supportUrgency = this._getAISupportUrgency(targetEnemy, engagementContext);

        // --- 2. 逃走・移動判定 ---
        // ★追加: 現在地の地形を調べます（川からの脱出ロジックなどに使います）
        let currentRow = Math.floor(unit.y / 2);
        let currentTerrain = (this.grid && this.grid[currentRow] && this.grid[currentRow][unit.x]) ? this.grid[currentRow][unit.x].terrain : 'plain';

        if (unit.troopType === 'teppo') {
            if (allies.length === 0 && distToTarget === 1) {
                if (!isKunishuAttacker) {
                    // ★修正: 攻撃側の諸勢力でなければ撤退
                    if (unit.isGeneral) {
                        const retreatMessage = unit.isAttacker
                            ? `${unit.name}軍は不利を悟り、攻略を諦めて撤退しました。野戦は終結します。`
                            : `${unit.name}軍は不利を悟り、拠点へ退きました。野戦を終え、攻城戦へ移ります。`;
                        this.finishFieldWarWithNotice(unit.isAttacker ? 'attacker_retreat' : 'defender_retreat', retreatMessage);
                    } else {
                        if (isPlayerInvolved) this.log(`${unit.name}隊は不利を悟り、戦場から撤退しました！`);
                        this.retreatUnit(unit);
                    }
                    return;
                }
            }
        }
        
        let isFleeing = (unit.troopType === 'teppo' && distToTarget === 1);
        let shouldMove = true;
        
        if (unit.troopType === 'teppo') {
            if (!isFleeing) {
                // 今の場所から（振り向く体力を使って）攻撃できる敵がいるかチェックします
                let canAttackNow = false;
                for (let e of enemies) {
                    let targetDir = this.getDirection(unit.x, unit.y, e.x, e.y);
                    let turnCost = this.getTurnCost(unit.direction, targetDir);
                    let tempUnit = Object.assign({}, unit);
                    tempUnit.direction = targetDir; // 仮に振り向かせてみる
                    
                    if (unit.ap >= turnCost + 1 && this.canAttackTarget(tempUnit, e.x, e.y)) {
                        canAttackNow = true;
                        break;
                    }
                }
                
                // 攻撃できるなら、移動せずにその場で構えます！
                if (canAttackNow) {
                    shouldMove = false;
                    // ★追加：守備側で川の上にいる場合は、撃てるとしても移動（脱出）を検討させます
                    if (!unit.isAttacker && currentTerrain === 'river') {
                        shouldMove = true;
                    }
                }
            }
        } else if (distToTarget === 1) {
            // 鉄砲以外の部隊は、敵が目の前にいたら移動しません
            shouldMove = false; 
            // ★追加：守備側で川の上にいる場合は、敵が目の前にいても移動（脱出）を検討させます
            if (!unit.isAttacker && currentTerrain === 'river') {
                shouldMove = true;
            }
        }

        // --- 3. 移動先マスの選定 (スコア制) ---
        if (shouldMove) {
            // 通常は攻撃APを1残すが、味方がすでに交戦している時は全APを移動にも使えるようにする。
            // 川・悪天候などで「攻撃APを残すと一歩も前進できない」状態を永久待機にしない。
            const moveBudget = this._getAIMoveBudget(unit, supportUrgency);
            let reachable = this.findPaths(unit, moveBudget); 
            let bestTargetHex = null;
            let bestMoveScore = -Infinity;

            // 自軍の総大将を探しておく
            let myGeneral = allies.find(a => a.isGeneral);
            if (unit.isGeneral) myGeneral = unit;

            // ターゲット選択と同じ交戦コンテキストを移動にも使う。
            const isAnyAllyEngaged = engagementContext.anyAllyEngaged;

            // ★お掃除: 逃げている時は無駄に重いルート検索(A*)をしないようにブロック
            let aStarIdealHexes = {};
            if (!isFleeing) {
                let aStarPath = this.findAStarPath(unit, targetEnemy.x, targetEnemy.y);
                if (aStarPath) {
                    let accumulatedCost = 0;
                    for (let i = 0; i < aStarPath.length; i++) {
                        let step = aStarPath[i];
                        accumulatedCost += step.cost;
                        if (accumulatedCost <= moveBudget) {
                            aStarIdealHexes[`${step.x},${step.y}`] = true;
                        } else break;
                    }
                }
            }
            
            reachable[`${unit.x},${unit.y}`] = { cost: 0, path: [] };

            for (let key in reachable) {
                let parts = key.split(',');
                let nx = parseInt(parts[0]);
                let ny = parseInt(parts[1]);
                let hexInfo = reachable[key];
                
                // ★追加：味方がいるマスには重なって止まれないようにガード（すり抜けは可能）
                if ((nx !== unit.x || ny !== unit.y) && allies.some(a => a.x === nx && a.y === ny)) {
                    continue;
                }
                
                let score = 0;
                let dToEnemy = this.getDistance(nx, ny, targetEnemy.x, targetEnemy.y);

                let candidateDirection = unit.direction;
                if ((nx !== unit.x || ny !== unit.y) && hexInfo.path && hexInfo.path.length > 0) {
                    let fromX = unit.x;
                    let fromY = unit.y;
                    if (hexInfo.path.length > 1) {
                        const prevStep = hexInfo.path[hexInfo.path.length - 2];
                        fromX = prevStep.x;
                        fromY = prevStep.y;
                    }
                    candidateDirection = this.getDirection(fromX, fromY, nx, ny);
                }
                const remainingAP = Math.max(0, unit.ap - hexInfo.cost);
                const movedToCandidate = (nx !== unit.x || ny !== unit.y);
                const attackOpportunity = !isFleeing
                    ? this._getAIAttackOpportunityAt(
                        unit, nx, ny, candidateDirection, remainingAP, movedToCandidate || unit.hasMoved,
                        enemies, engagementContext, targetEnemy.id
                    )
                    : null;

                // 今いる場所への軽いボーナスは、救援が必要な時には待機理由にしない。
                if (nx === unit.x && ny === unit.y && supportUrgency <= 0) {
                    score += 5; 
                }

                // 味方が交戦中なら地形の好悪は残しつつ、救援より優先して足を止めない。
                const terrainPreferenceScale = Math.max(
                    WarParams.FieldAI.Support.TerrainPreferenceMinScale,
                    1.0 - supportUrgency * WarParams.FieldAI.Support.TerrainPreferenceReduction
                );
                let row_t = Math.floor(ny / 2);
                let terrain_t = (this.grid && this.grid[row_t] && this.grid[row_t][nx]) ? this.grid[row_t][nx].terrain : 'plain';
                
                if (terrain_t === 'river') {
                    let riverDanger = Math.max(0.1, 1.0 - (dToEnemy / 10)); 
                    score -= 30 * riverDanger * terrainPreferenceScale;
                } else if (terrain_t === 'mountain') {
                    score += 15 * terrainPreferenceScale; 
                    if (!unit.isAttacker) score += 20 * terrainPreferenceScale;
                } else if (terrain_t === 'forest') {
                    score += 10 * terrainPreferenceScale; 
                    if (!unit.isAttacker) score += 10 * terrainPreferenceScale;
                }

                // 兵科ごとの移動評価（無限に逃げる計算をすべて廃止し、適切な距離を目標にさせる）
                if (isFleeing) {
                    // 逃げる時は無限に端を目指すのではなく、敵から距離3〜4の「安全な場所」を目標にする
                    let distDiff = Math.abs(dToEnemy - 3);
                    score -= distDiff * 30; // 距離3から外れるほど減点
                    
                    let edgeCheck = this.getNeighbors(nx, ny);
                    if (edgeCheck.length < 6) {
                        score -= (6 - edgeCheck.length) * 30; // 行き止まりを避ける
                    }
                } else {
                    if (aStarIdealHexes[`${nx},${ny}`]) {
                        score += (!unit.isAttacker) ? 10 : 30;
                    }

                    if (unit.troopType === 'teppo') {
                        // 鉄砲も無限に遠ざからず、常に「適切な距離」をキープしようとする
                        let idealDist = (this.weather === 'rain' || this.weather === 'snow' || this.isNightTurn()) ? 2 : 3;
                        if (dToEnemy === 1) {
                            score -= 100; // 隣接は絶対に避ける
                        } else {
                            let distDiff = Math.abs(dToEnemy - idealDist);
                            score -= distDiff * 20; // 理想の距離から外れるほど減点
                        }
                    } else if (unit.troopType === 'kiba') {
                        // 騎馬隊
                        if (dToEnemy > 4) {
                            score -= dToEnemy * 15;
                        } else {
                            score -= dToEnemy * 5;  
                            
                            let dirFromTargetToHex = this.getDirection(targetEnemy.x, targetEnemy.y, nx, ny);
                            let sectorDiff = Math.abs(targetEnemy.direction - dirFromTargetToHex);
                            sectorDiff = Math.min(sectorDiff, 6 - sectorDiff);

                            if (sectorDiff === 3) score += 80;      // 真後ろ
                            else if (sectorDiff === 2) score += 40; // 側面
                            else if (sectorDiff === 1) score += 10; // 斜め前
                        }

                        if (!unit.isAttacker) {
                            if (dToEnemy <= 8) score += (8 - dToEnemy) * 5; 
                        }

                        if (dToEnemy === 1) {
                            let atkDir = this.getDirection(nx, ny, targetEnemy.x, targetEnemy.y);
                            let oppositeAtkDir = (atkDir + 3) % 6;
                            let hitAngle = Math.abs(targetEnemy.direction - oppositeAtkDir);
                            hitAngle = Math.min(hitAngle, 6 - hitAngle);

                            if (hitAngle === 3) score += 150; 
                            else if (hitAngle === 2) score += 80; 
                            else score -= 50; 
                        }
                    } else {
                        // ★足軽の動き（味方が戦っていれば一斉に殴りかかる）
                        if (!unit.isAttacker && !isAnyAllyEngaged) {
                            if (dToEnemy === 1) score += 100;
                            else if (dToEnemy === 2) score += 40;
                            else {
                                let approachDesire = Math.max(2, 17 - distToTarget);
                                score -= dToEnemy * approachDesire; 
                            }
                        } else {
                            // 攻撃側、または味方がすでに戦っているなら「距離を詰める事」を最優先にして囲む！
                            score -= dToEnemy * 25; 
                        }

                        if (dToEnemy === 1) {
                            let atkDir = this.getDirection(nx, ny, targetEnemy.x, targetEnemy.y);
                            let oppositeAtkDir = (atkDir + 3) % 6;
                            let hitAngle = Math.abs(targetEnemy.direction - oppositeAtkDir);
                            hitAngle = Math.min(hitAngle, 6 - hitAngle);

                            if (hitAngle === 3) score += 80; 
                            else if (hitAngle === 2) score += 40; 
                        }
                    }

                    // 総大将との距離評価（グラデーション）
                    if (!unit.isGeneral && myGeneral) {
                        let dToGen = this.getDistance(nx, ny, myGeneral.x, myGeneral.y);
                        let isKiba = unit.troopType === 'kiba';
                        
                        // 通常は敵が近いほど隊形拘束を弱めるが、総大将自身が交戦中なら救援のため逆に結束を優先する。
                        let dangerFactor = Math.max(0.0, Math.min(1.0, distToTarget / 10));
                        if (engagementContext.ownGeneralEngaged) dangerFactor = Math.max(dangerFactor, 1.0);
                        
                        if (dToGen >= 1 && dToGen <= 3) {
                            score += (isKiba ? 10 : 30) * dangerFactor; 
                        } else if (dToGen > 3) {
                            let basePenalty = isKiba ? 2 : (unit.isReinforcement ? 20 : 10);
                            score -= (dToGen - 3) * (basePenalty * dangerFactor); 
                        }
                    }

                    // 性格は平時の間合いには反映するが、一般部隊が交戦中の味方を見捨てる理由にはしない。
                    const cautionScale = (!unit.isGeneral && supportUrgency > 0)
                        ? Math.max(WarParams.FieldAI.Support.CautionMinScale, 1.0 - supportUrgency * WarParams.FieldAI.Support.CautionReduction)
                        : 1.0;
                    if (unit.isGeneral && myPersonality !== 'aggressive') {
                        // 後方の安全な距離（4〜5）を維持しようとする
                        let safeDist = 5;
                        let distDiff = Math.abs(dToEnemy - safeDist); 
                        score -= distDiff * 15; 
                    } else if (myPersonality === 'conservative') {
                        let safeDist = 3;
                        let distDiff = Math.abs(dToEnemy - safeDist);
                        score -= distDiff * 10 * cautionScale;
                    } else if (myPersonality === 'aggressive') {
                        score -= dToEnemy * 5; 
                    }

                    // 交戦中の目標へ実際に近づいた分を、地形・性格とは独立した「救援行動」として評価する。
                    if (supportUrgency > 0) {
                        const progress = distToTarget - dToEnemy;
                        score += progress * (WarParams.FieldAI.Support.ProgressBaseBonus + supportUrgency * WarParams.FieldAI.Support.ProgressUrgencyBonus);
                        if (dToEnemy <= 2) score += (3 - dToEnemy) * WarParams.FieldAI.Support.NearTargetBonus * supportUrgency;
                    }

                    // 今ターンに「向き変更＋攻撃」まで完遂できる候補を強く優先する。
                    if (attackOpportunity) {
                        score += WarParams.FieldAI.Support.AttackOpportunityBonus + attackOpportunity.score;
                    }

                    // 孤立ペナルティ
                    if (allies.length > 0) {
                        let minDistToAlly = 999;
                        allies.forEach(a => {
                            let dToAlly = this.getDistance(nx, ny, a.x, a.y);
                            if (dToAlly < minDistToAlly) minDistToAlly = dToAlly;
                        });
                        
                        if (minDistToAlly > 2) {
                            let isKiba = unit.troopType === 'kiba';
                            let isolationFactor = minDistToAlly - 2; 
                            let isolationPenalty = isKiba ? 3 : 12; 
                            score -= (isolationFactor * isolationFactor) * isolationPenalty; 
                        }
                    }
                }

                // 智謀のブレ
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
                    // ★追加：移動した部隊にカメラを追従させます
                    this.scrollToUnit(unit);
                }
                
                // ★追加：大雪の時、AIも動かした直後に兵力を減らします（攻撃側3%、守備側1%）
                if (this.isHeavySnowBattle) {
                    let snowPenaltyRate = unit.isAttacker ? 0.03 : 0.01;
                    let lost = Math.floor(unit.soldiers * snowPenaltyRate);
                    if (lost > 0) {
                        unit.soldiers = Math.max(1, unit.soldiers - lost);
                        if (isPlayerInvolved) {
                            this.log(`【大雪】猛吹雪の中を行軍したため、${unit.name}隊は${lost}の兵を失った。`);
                        }
                    }
                }

                if (isPlayerInvolved) {
                    this.updateMap();
                    this.updateStatus();
                    await new Promise(r => setTimeout(r, 400));
                    if (!this._isFieldWarLifecycleCurrent(fieldWarGeneration)) return;
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
            if (unit.ap >= turnCost + 1 && this.canAttackTarget(tempUnit, e.x, e.y)) {
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

                // 移動時と同じ交戦優先度を、最終攻撃対象にもそのまま使う。
                score += this._getAITargetEngagementBonus(unit, e, engagementContext);
                
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
                    if (!this._isFieldWarLifecycleCurrent(fieldWarGeneration)) return;
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
                    if (!this._isFieldWarLifecycleCurrent(fieldWarGeneration)) return;
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
console.log("【確認】field_war.js の読み込みが完了しました！");