/**
 * save_load_view.js
 * セーブ／ロードのスロット選択画面を専門管理するView。
 * 保存データの読み書き・復号は SaveManager、画面描画と操作はこのViewが担当します。
 */

class SaveLoadView {
    constructor(ui, game) {
        this.ui = ui;
        this.game = game;
    }

    async open(mode) {
        const modal = document.getElementById('saveload-modal');
        const title = document.getElementById('saveload-title');
        const list = document.getElementById('saveload-list');
        const tabs = document.getElementById('saveload-tabs'); // ★追加：タブを入れる箱を見つけます
        
        title.innerText = mode === 'save' ? 'セーブするスロットを選択' : 'ロードするスロットを選択';
        
        let currentPrefix = 'sengoku_save_slot'; // 最初は必ず「手動」を見に行くようにします

        // ★追加：セーブの時はタブを隠して、ロードの時はタブを出します
        if (tabs) {
            if (mode === 'load') {
                tabs.classList.remove('hidden');
                // 開いた時は必ず「手動」ボタンを光らせて、押せないようにします
                const btnM = document.getElementById('saveload-tab-manual');
                const btnA = document.getElementById('saveload-tab-auto');
                if(btnM && btnA) {
                    btnM.classList.add('active');
                    btnM.disabled = true;
                    btnA.classList.remove('active');
                    btnA.disabled = false;
                }
            } else {
                tabs.classList.add('hidden');
            }
        }

        // リストの中身を作る魔法を、タブで切り替えるために別にしてまとめます
        const renderSlots = async (prefix) => {
            list.innerHTML = '';
            
            // 画面をカクカクさせないために、先に「読み込み中...」の枠を5つ出しておきます
            for (let i = 1; i <= 5; i++) {
                const btn = document.createElement('button');
                btn.className = 'saveload-slot-btn empty-slot';
                btn.disabled = true; 
                btn.innerHTML = `
                    <div class="saveload-slot-number">${i}</div>
                    <div class="saveload-slot-image"><div class="saveload-map-placeholder"></div></div>
                    <div class="saveload-slot-content empty">
                        <div class="saveload-slot-time">----/--/-- --:--</div>
                        <div class="saveload-slot-empty-text">読み込み中...</div>
                    </div>
                `;
                list.appendChild(btn);
            }

            // 1. 保存形式・復号・IndexedDBアクセスはSaveManagerへ任せます。
            const otherPrefix = prefix === 'sengoku_save_slot' ? 'sengoku_autosave_slot' : 'sengoku_save_slot';
            const [currentSlots, otherSlots] = await Promise.all([
                this.game.saveManager.readSaveSlots(prefix),
                this.game.saveManager.readSaveSlots(otherPrefix),
                new Promise(resolve => setTimeout(resolve, 300))
            ]);

            // 2. View側では表示順と「最新」表示に必要な値だけ整えます。
            let otherLatestTime = 0;
            otherSlots.forEach(slot => {
                if (slot.saveTimestamp > otherLatestTime) otherLatestTime = slot.saveTimestamp;
            });

            let currentTabLatestTime = 0;
            const processedSlots = currentSlots.map(slot => {
                let time = slot.saveTimestamp > 0 ? slot.saveTimestamp : Infinity;
                if (slot.saveTimestamp > currentTabLatestTime) currentTabLatestTime = slot.saveTimestamp;
                return {
                    originalSlotNo: slot.originalSlotNo,
                    data: slot.data,
                    time,
                    hasData: slot.hasData
                };
            });
            
            // ★追加：手動とオートの両方を含めた、ゲーム全体で一番新しい時間を決定します
            const globalLatestTime = Math.max(currentTabLatestTime, otherLatestTime);
            
            // 同時刻保存で時間が重なった場合でも、全体で1つだけを最新にするための印
            let foundGlobalLatest = false;

            // 3. オートセーブの時だけ、古い順（時間が小さい順）に並べ替えます
            if (prefix === 'sengoku_autosave_slot') {
                processedSlots.sort((a, b) => a.time - b.time);
            }

            // 一度「読み込み中」のリストを空っぽにして、完成したものを入れ直します
            list.innerHTML = '';

            // 4. 並べ替えた順番で、画面にボタンを作っていきます
            processedSlots.forEach((slotInfo, index) => {
                const i = slotInfo.originalSlotNo; 
                const displayIndex = index + 1;
                const d = slotInfo.data;
                const hasData = slotInfo.hasData;

                const btn = document.createElement('button');
                
                let dateStr = "";
                let clanStr = ""; 
                let scenarioStr = ""; 
                let saveTimeStr = "----/--/-- --:--"; 
                let passedYearsStr = ""; 

                if (hasData) {
                    dateStr = `${d.year}年 ${d.month}月`;
                    // シナリオの番号と年数（1560年など）を消して、名前だけにします
                    scenarioStr = d.scenarioName.replace(/^[0-9]+年\s*/, '');
                    saveTimeStr = d.saveTime;
                    const passedYears = d.year - d.gameStartYear;
                    passedYearsStr = `経過: ${passedYears}年`;

                    const playerClan = d.clans.find(c => c.id === d.playerClanId);
                    if (playerClan) clanStr = playerClan.name;

                    // ★追加：スマホ版で、勢力名が5文字以上の場合はシナリオ名を非表示にします
                    if (!document.body.classList.contains('is-pc') && clanStr.length >= 5) {
                        scenarioStr = "";
                    }
                }
                
                // ★修正：スロットの表示名を数字だけにします
                const slotNumberText = prefix === 'sengoku_autosave_slot' ? displayIndex : i;

                // ★変更：全体で一番新しいデータかどうかだけを判定します
                let isGlobalLatest = (hasData && slotInfo.time === globalLatestTime && globalLatestTime > 0);

                // ★古いデータで時間が被っていた場合のストッパー
                if (isGlobalLatest) {
                    if (foundGlobalLatest) {
                        isGlobalLatest = false;
                    } else {
                        foundGlobalLatest = true;
                    }
                }

                let latestMarkHtml = "";
                if (isGlobalLatest) {
                    // 全体で一番新しいデータには「最新!」の文字をつけます
                    latestMarkHtml = `<span class="saveload-latest-mark">最新!</span>`;
                }

                // ★追加：保存しておいた写真があれば表示します
                let mapImageHtml = `<div class="saveload-map-placeholder">NO DATA</div>`;
                if (hasData && d.mapThumbnail) {
                    mapImageHtml = `<img src="${d.mapThumbnail}" class="saveload-map-thumb">`;
                }

                if (hasData) {
                    // ★変更：最新スロットには専用のクラス（印）を追加してCSSでお化粧します
                    btn.className = 'saveload-slot-btn' + (isGlobalLatest ? ' global-latest-slot' : '');
                    btn.disabled = false; 
                    btn.innerHTML = `
                        <div class="saveload-slot-number">${slotNumberText}</div>
                        <div class="saveload-slot-image">${mapImageHtml}</div>
                        <div class="saveload-slot-content">
                            <div class="saveload-row-top">
                                <span class="saveload-slot-clan">${clanStr}</span>
                                <span class="saveload-slot-scenario">${scenarioStr}</span>
                            </div>
                            <div class="saveload-row-bottom">
                                <span class="saveload-slot-date">${dateStr} <span class="saveload-slot-passed">(${passedYearsStr})</span></span>
                                <div class="saveload-slot-time">${latestMarkHtml}<span class="saveload-time-text">${saveTimeStr}</span></div>
                            </div>
                        </div>
                    `;
                } else {
                    btn.className = 'saveload-slot-btn empty-slot';
                    btn.innerHTML = `
                        <div class="saveload-slot-number">${slotNumberText}</div>
                        <div class="saveload-slot-image"><div class="saveload-map-placeholder">NO DATA</div></div>
                        <div class="saveload-slot-content empty">
                            <div class="saveload-slot-time">----/--/-- --:--</div>
                            <div class="saveload-slot-empty-text">NO DATA</div>
                        </div>
                    `;
                    
                    if (mode === 'load') {
                        btn.disabled = true;
                        btn.classList.add('is-load-disabled');
                    } else {
                        btn.disabled = false;
                    }
                }

                // ★追加：ダイアログに出すための名前を用意します
                const displayTitle = prefix === 'sengoku_autosave_slot' ? `オート ${displayIndex}` : `スロット ${i}`;

                btn.onclick = () => {
                    const modal = document.getElementById('saveload-modal');
                    if (modal) modal.classList.add('hidden');
                    
                    if (mode === 'save') {
                        this.ui.showDialog(`${displayTitle} に現在の状態をセーブ（上書き）しますか？`, true, () => {
                            this.game.saveGameToLocal(i);
                        }, null, { okText: 'セーブする', okClass: 'btn-primary', cancelText: 'やめる' });
                    } else {
                        if (this.game.phase === 'title') {
                            this.game.loadGameFromLocal(i, prefix); 
                        } else {
                            this.ui.showDialog(`${displayTitle} のデータをロードしますか？\n（現在の進行状況は失われます）`, true, () => {
                                this.game.loadGameFromLocal(i, prefix); 
                            }, null, { okText: 'ロードする', okClass: 'btn-danger', cancelText: 'やめる' });
                        }
                    }
                };

                list.appendChild(btn);
            });

            // カスタムスクロールバーを更新して、縦スクロールができるようにします
            setTimeout(() => {
                if (this.ui && typeof this.ui.updateCustomScrollbars === 'function') {
                    this.ui.updateCustomScrollbars(list);
                }
            }, 10);
        };

        // ★追加：タブのボタンを押した時の動きを登録します
        if (tabs) {
            const btnManual = document.getElementById('saveload-tab-manual');
            const btnAuto = document.getElementById('saveload-tab-auto');
            
            btnManual.onclick = () => {
                if (currentPrefix === 'sengoku_save_slot') return;
                currentPrefix = 'sengoku_save_slot';
                // 押された手動ボタンを光らせて押せなくし、オートボタンを押せるように戻します
                btnManual.classList.add('active');
                btnManual.disabled = true;
                btnAuto.classList.remove('active');
                btnAuto.disabled = false;
                renderSlots(currentPrefix);
            };
            
            btnAuto.onclick = () => {
                if (currentPrefix === 'sengoku_autosave_slot') return;
                currentPrefix = 'sengoku_autosave_slot';
                // 押されたオートボタンを光らせて押せなくし、手動ボタンを押せるように戻します
                btnManual.classList.remove('active');
                btnManual.disabled = false;
                btnAuto.classList.add('active');
                btnAuto.disabled = true;
                renderSlots(currentPrefix);
            };
        }

        // ★Round35：先に読み込み中の5枠を作り、カスタムスクロールバーの外枠も
        // モーダルを見せる前に確定させます。従来はデータ読み込み完了後に外枠が
        // 後付けされていたため、表示中にウインドウ寸法が揺れることがありました。
        renderSlots(currentPrefix);
        if (this.ui && typeof this.ui.updateCustomScrollbars === 'function') {
            this.ui.updateCustomScrollbars(list);
        }
        modal.classList.remove('hidden');
        // display:none が解除された次フレームで実寸を取り直します。
        requestAnimationFrame(() => {
            if (this.ui && typeof this.ui.updateCustomScrollbars === 'function') {
                this.ui.updateCustomScrollbars(list);
            }
        });
    }
}

window.SaveLoadView = SaveLoadView;
