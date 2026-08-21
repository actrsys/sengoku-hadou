/**
 * typhoon_event.js
 * 台風イベント専用のファイルです。
 * Round16: 進路・被害ロジックは維持し、イベント地図基盤は common_events.js の
 * EventMapEffects と共有します。
 */

window.GameEvents = window.GameEvents || [];

window.GameEvents.push({
    id: "typhoon_event_01",
    timing: "endMonth_after",
    isOneTime: false,
    
    checkCondition: function(game) {
        const dice = Math.random();
        if (game.month === 7 && dice < 0.05) return true;
        if (game.month === 8 && dice < 0.15) return true;
        if (game.month === 9 && dice < 0.6) return true;
        if (game.month === 10 && dice < 0.15) return true;
        if (game.month === 11 && dice < 0.05) return true;
        return false;
    },
    
    execute: async function(game) {
        console.log("=== 台風イベント開始 ===");

        const SHOW_TYPHOON_PATH = true;
        const fx = window.EventMapEffects;
        const diagPrefix = 'event_effect:typhoon';
        const writeDiag = (stage) => {
            if (fx && typeof fx.writeDiag === 'function') fx.writeDiag(game, `${diagPrefix}:${stage}`);
            else if (game && typeof game.writeSystemDiagnostic === 'function') game.writeSystemDiagnostic(`${diagPrefix}:${stage}`);
        };

        if (window.playEventSoundAndBlock) window.playEventSoundAndBlock();
        writeDiag('dialog');
        await game.ui.showDialogAsync("台風が接近しています……", false, 0);

        // ★Round16：イベント用地図は通常マップと独立しているため、裏側のズームは触りません。
        // 旧版の map-reset-zoom.click() は、巨大マップ再ラスタライズとイベントCanvas確保を
        // 同時に発生させるため削除しました。

        const damagedProvinceMap = new Map();
        const damagedPlayerCastles = [];

        // 1. 見た目の大きさ（visualScale）
        let visualScale = 1;
        const scaleDice = Math.random() * 100;
        if (scaleDice < 10) visualScale = 1;
        else if (scaleDice < 35) visualScale = 2;
        else if (scaleDice < 65) visualScale = 3;
        else if (scaleDice < 85) visualScale = 4;
        else if (scaleDice < 93) visualScale = 5;
        else if (scaleDice < 97) visualScale = 6;
        else if (scaleDice < 99) visualScale = 7;
        else visualScale = Math.floor(Math.random() * 3) + 8;

        // 2. 被害の規模（damageScale）
        let damageScale = 1;
        const damageDice = Math.random() * 100;
        if (damageDice < 40) damageScale = 1;
        else if (damageDice < 65) damageScale = 2;
        else if (damageDice < 80) damageScale = 3;
        else if (damageDice < 90) damageScale = 4;
        else if (damageDice < 95) damageScale = 5;
        else if (damageDice < 98) damageScale = 6;
        else if (damageDice < 99.5) damageScale = 7;
        else damageScale = 8;

        writeDiag('overlay_shell');
        const overlayParts = fx && typeof fx.createOverlay === 'function'
            ? await fx.createOverlay(game, { diagPrefix })
            : null;
        if (!overlayParts) {
            // common_events.js より先に呼ばれる構成は通常ありませんが、安全側で中止します。
            console.error('EventMapEffects が初期化されていません');
            return;
        }
        const { mapOverlay, mapContainer } = overlayParts;

        // ★Round16：旧 CastleColorImageDataCache を廃止。
        // 色コード画像は初回だけ読み、一度「pixel -> 色グループID」のTypedArrayへ変換します。
        // 同じ色コードを共有する拠点は同じgroupIdなので、旧版の色一致ロジックと同じ扱いです。
        writeDiag('castle_index');
        const castleIndex = await fx.ensureCastleColorIndex(game, diagPrefix);

        const pathData = [];
        const damagedCastleMap = new Map();

        if (castleIndex) {
            const width = castleIndex.width;
            const height = castleIndex.height;
            const pixelGroupMap = castleIndex.pixelGroupMap;
            const castleGroupById = castleIndex.castleGroupById;

            let r = Math.pow(Math.random(), 3);
            let typhoonX = -500 + (r * (width * 0.7 + 500));
            let typhoonY = height + 500;

            const initialScale = Math.min(10, Math.max(1, visualScale));
            let typhoonRadius = 100 + (initialScale * 15);
            const damagedGroupIds = new Set();
            const windStrength = 40 - (initialScale * 3) + (Math.random() * 5);
            let wasOnCastle = false;
            let castleHitCount = 0;

            writeDiag('path_calc');
            while (typhoonX < width + typhoonRadius && typhoonY > -typhoonRadius && typhoonY < height + 1000 && typhoonRadius > 30) {
                pathData.push({ x: typhoonX, y: typhoonY, radius: typhoonRadius });

                let moveX = Math.random() * 25 + 10;
                let moveY = Math.random() * 30 + 15 + (initialScale * 2.0);
                const progress = Math.max(0, (height + 500 - typhoonY) / height);
                moveX += windStrength * progress * 1.5;

                const fallPower = 50 - (initialScale * 3);
                moveY -= fallPower * Math.pow(progress, 1.5);
                if (wasOnCastle) moveY -= 15;

                typhoonX += moveX;
                typhoonY -= moveY;

                let onCastle = false;
                if (typhoonX > -typhoonRadius && typhoonX < width + typhoonRadius &&
                    typhoonY > -typhoonRadius && typhoonY < height + typhoonRadius) {
                    const rSq = typhoonRadius * typhoonRadius;
                    const startX = Math.max(0, Math.floor(typhoonX - typhoonRadius));
                    const endX = Math.min(width - 1, Math.ceil(typhoonX + typhoonRadius));
                    const startY = Math.max(0, Math.floor(typhoonY - typhoonRadius));
                    const endY = Math.min(height - 1, Math.ceil(typhoonY + typhoonRadius));

                    // 判定密度は旧版と同じ1ピクセル単位です。
                    for (let y = startY; y <= endY; y++) {
                        const row = y * width;
                        for (let x = startX; x <= endX; x++) {
                            const dx = x - typhoonX;
                            const dy = y - typhoonY;
                            if (dx * dx + dy * dy > rSq) continue;
                            const groupId = pixelGroupMap[row + x];
                            if (groupId !== 0) {
                                damagedGroupIds.add(groupId);
                                onCastle = true;
                            }
                        }
                    }
                }

                let baseDecay;
                if (onCastle) baseDecay = (Math.random() * 1.0) - 0.2;
                else baseDecay = (Math.random() * 1.5) - 1.4;

                const northDecay = 0.1 * progress;
                if (onCastle) {
                    castleHitCount++;
                    const castleDecay = 0.3 + (castleHitCount * 0.1);
                    typhoonRadius -= (baseDecay + northDecay + castleDecay);
                } else {
                    castleHitCount = 0;
                    typhoonRadius -= (baseDecay + northDecay);
                }

                if (typhoonRadius > 250) typhoonRadius = 250;
                wasOnCastle = onCastle;
            }
            pathData.push({ x: typhoonX, y: typhoonY, radius: typhoonRadius });
            writeDiag('path_done');

            // 被害決定は旧版と同じく game.castles の順番で行い、乱数呼び出し順も維持します。
            if (game.castles && game.castles.length > 0) {
                for (const castle of game.castles) {
                    const groupId = castleGroupById.get(castle.id) || 0;
                    if (groupId !== 0 && damagedGroupIds.has(groupId)) {
                        const shift = Math.floor(Math.random() * 3) - 1;
                        const finalScale = Math.max(1, Math.min(10, damageScale + shift));
                        damagedCastleMap.set(castle.id, finalScale);
                        if (!damagedProvinceMap.has(castle.provinceId)) {
                            damagedProvinceMap.set(castle.provinceId, finalScale);
                        }
                    }
                }
            }
        }

        // 7月・8月の台風は被害国に凶作を付与
        if (game.month === 7 || game.month === 8) {
            damagedProvinceMap.forEach((scale, pId) => {
                const p = game.provinces.find(prov => prov.id === pId);
                if (p) {
                    if (!p.statusEffects) p.statusEffects = [];
                    if (!p.statusEffects.includes('badHarvest')) p.statusEffects.push('badHarvest');
                }
            });
        }

        // 市場相場への影響
        if (damagedProvinceMap.size > 0) {
            const baseRate = window.MainParams.Economy.TradeRateBase || 5.0;
            game.provinces.forEach(prov => {
                if (prov && prov.marketRate !== undefined) {
                    if (damagedProvinceMap.has(prov.id)) {
                        prov.marketRate = Math.min(window.MainParams.Economy.TradeRateMax, prov.marketRate + (baseRate * 0.6));
                    } else {
                        prov.marketRate = Math.min(window.MainParams.Economy.TradeRateMax, prov.marketRate + (baseRate * 0.2));
                    }
                }
            });
        }

        // 拠点への被害
        game.castles.forEach(castle => {
            if (!damagedCastleMap.has(castle.id)) return;
            const finalScale = damagedCastleMap.get(castle.id);
            const dropPercent = finalScale * 0.03;
            const defenseCutRate = Math.min(1.0, Math.floor(castle.defense / 15) * 0.01);
            const actualDropPercent = dropPercent * (1.0 - defenseCutRate);

            castle.kokudaka = Math.floor(castle.kokudaka * (1.0 - actualDropPercent));
            castle.defense = Math.floor(castle.defense * (1.0 - dropPercent));

            if (finalScale >= 6) {
                const solDropRate = ((finalScale - 5) * 0.04) * (1.0 - defenseCutRate);
                castle.soldiers = Math.floor(castle.soldiers * (1.0 - solDropRate));

                let popDropRate = ((finalScale - 5) * 0.02) * (1.0 - defenseCutRate);
                if (typeof SkillManager !== 'undefined') {
                    popDropRate *= SkillManager.calcDisasterDamageModifier(castle, game);
                }
                castle.population = Math.floor(castle.population * (1.0 - popDropRate));
            }

            if (castle.ownerClan === game.playerClanId) {
                damagedPlayerCastles.push({ castle, scale: finalScale });
            }
        });

        // ★Round16：国ハイライトCanvasは凶作・大雪等と同じ共通関数を使用します。
        // スマホでは内部解像度1/2、PCは等倍。台風進路だけこのCanvasへ追加描画します。
        if (damagedProvinceMap.size > 0 || SHOW_TYPHOON_PATH) {
            writeDiag('visual_build');
            const affectedProvIds = new Set(damagedProvinceMap.keys());
            const { canvas, srcW, srcH } = await fx.createProvinceCanvas(
                game,
                affectedProvIds,
                { r: 0, g: 0, b: 255, a: 180 },
                { animation: damagedProvinceMap.size > 0 ? 'blink 1s 2' : '', diagPrefix }
            );
            const ctx = canvas.getContext('2d');

            if (SHOW_TYPHOON_PATH && pathData.length > 0) {
                const sx = canvas.width / srcW;
                const sy = canvas.height / srcH;
                ctx.save();
                ctx.scale(sx, sy);

                ctx.lineWidth = 6;
                ctx.strokeStyle = 'rgba(255, 255, 0, 0.8)';
                ctx.setLineDash([8, 8]);
                for (let i = 0; i < pathData.length; i++) {
                    if (i % 2 === 0 || i === pathData.length - 1) {
                        ctx.beginPath();
                        ctx.arc(pathData[i].x, pathData[i].y, Math.max(0, pathData[i].radius), 0, Math.PI * 2);
                        ctx.stroke();
                    }
                }

                ctx.beginPath();
                ctx.setLineDash([20, 20]);
                ctx.strokeStyle = 'rgba(255, 255, 0, 0.8)';
                ctx.lineWidth = 4;
                ctx.lineCap = 'round';
                ctx.lineJoin = 'round';
                ctx.moveTo(pathData[0].x, pathData[0].y);
                for (let i = 1; i < pathData.length; i++) ctx.lineTo(pathData[i].x, pathData[i].y);
                ctx.stroke();
                ctx.setLineDash([]);
                ctx.restore();
            }

            mapContainer.appendChild(canvas);
            writeDiag('visual_done');
            await new Promise(resolve => setTimeout(resolve, 0));
            await new Promise(resolve => setTimeout(resolve, 2000));
            canvas.style.animation = 'none';
            canvas.style.opacity = '1.0';

            writeDiag('wait_input');
            await fx.waitForDismiss(game, mapOverlay);
            writeDiag('cleanup');
            await fx.cleanupOverlay(mapOverlay);
            writeDiag('cleanup_done');

            if (damagedProvinceMap.size > 0) {
                let maxDamageScale = 0;
                damagedCastleMap.forEach(scale => {
                    if (scale > maxDamageScale) maxDamageScale = scale;
                });

                if (maxDamageScale <= 3) {
                    await game.ui.showDialogAsync("小規模な台風により、各地で軽微な被害が発生しているようです……", false, 0);
                } else if (maxDamageScale <= 7) {
                    await game.ui.showDialogAsync("強い台風が上陸し、各地で被害が発生しているようです……", false, 0);
                } else {
                    await game.ui.showDialogAsync("猛烈な台風が直撃し、各地で甚大な被害が発生しているようです……", false, 0);
                }
            } else {
                await game.ui.showDialogAsync("今回は大きな被害はなかったようです。", false, 0);
            }
        } else {
            await fx.cleanupOverlay(mapOverlay);
            await game.ui.showDialogAsync("今回は大きな被害はなかったようです。", false, 0);
        }

        await new Promise(resolve => setTimeout(resolve, 1000));
        for (const data of damagedPlayerCastles) {
            await game.ui.showDialogAsync(` ${data.castle.name} が台風の被害を受けました……`, false, 0);
        }
    }
});
