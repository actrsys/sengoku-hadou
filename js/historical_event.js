/**
 * historical_event.js
 * 歴史イベントを管理する専用のファイルです。
 * ここに史実に沿ったイベント（桶狭間の戦いなど）を追加していきます。
 */

window.GameEvents = window.GameEvents || [];

// ==========================================
// ★ 桶狭間の戦い（予備）：松平元康 岡崎城主就任（裏イベント）
// ==========================================
window.GameEvents.push({
    id: "historical_motoyasu_okazaki",
    timing: "startMonth_before",     // 月初の処理前にこっそりチェックします
    isOneTime: true,                 // 一度発生したら二度と起きません
    
    checkCondition: function(game) {
        // ① まず、主要な登場人物の確認をします
        // 今川義元（ID: 1004001）が大名として存在するか
        const yoshimoto = game.getBusho(1004001);
        if (!yoshimoto || !yoshimoto.isDaimyo) return false;

        // 織田信長（ID: 1006001）が大名として存在するか
        const nobunaga = game.getBusho(1006001);
        if (!nobunaga || !nobunaga.isDaimyo || nobunaga.clan === 0) return false;

        // ② プレイヤーが今川家を担当している場合は、勝手な移動を防ぐためここで止めます
        const imagawaClanId = yoshimoto.clan;
        if (game.playerClanId === imagawaClanId) return false;

        // ③ 松平元康（ID: 1004004）の存在と、今の立場を確認します
        const motoyasu = game.getBusho(1004004);
        if (!motoyasu) return false; // 存在しない場合はストップ

        // 元康が「義元の今川家」に所属しているか
        if (motoyasu.clan !== imagawaClanId) return false;

        // 元康がすでに「大名（独立した殿様）」や「国主」になっていないか
        if (motoyasu.isDaimyo || motoyasu.isCommander) return false;

        // ④ 目的のお城（岡崎城：ID48）の状態を確認します
        // すでに元康が城主ではないこと、かつ「直轄領（軍団IDが0）」であることを確認します
        const okazakiCastle = game.getCastle(48);
        if (!okazakiCastle || okazakiCastle.castellanId === motoyasu.id || okazakiCastle.legionId !== 0) return false;

        // ⑤ 勢力同士の外交関係を確認します
        // 織田家と今川家が、同盟・従属・支配・友好関係ではないこと
        if (game.diplomacyManager) {
            const rel = game.diplomacyManager.getRelation(imagawaClanId, nobunaga.clan);
            if (rel && ['同盟', '従属', '支配', '友好'].includes(rel.status)) {
                return false;
            }
        }

        // ⑥ 最後に、少し手間のかかる今川家の領地確認をします
        // 指定のお城（曳馬城、駿府城、長篠城、岡崎城、犬居城、高天神城、吉田城、興国寺城）をすべて持っているか
        const requiredCastles = [12, 13, 45, 48, 54, 71, 100, 101];
        const hasAllCastles = requiredCastles.every(id => {
            const c = game.getCastle(id);
            return c && c.ownerClan === imagawaClanId;
        });
        if (!hasAllCastles) return false;

        // すべての条件をクリアしたら、イベント発生の合図を出します
        return true;
    },
    
    execute: async function(game) {
        const motoyasu = game.getBusho(1004004);
        const okazakiCastle = game.getCastle(48);

        // 万が一データが見つからなかった時のための安全装置です
        if (!motoyasu || !okazakiCastle) return;

        // 1. 松平元康の功績が699以下なら、強制的に700に引き上げます
        if ((motoyasu.achievementTotal || 0) <= 699) {
            motoyasu.achievementTotal = 700;
        }

        // 2. 元康が別のお城にいる場合、安全に岡崎城へお引越しさせます
        if (motoyasu.castleId !== 48) {
            if (game.affiliationSystem) {
                game.affiliationSystem.moveCastle(motoyasu, 48);
            } else {
                // システムがない場合の予備の手動お引越し
                const oldCastle = game.getCastle(motoyasu.castleId);
                if (oldCastle) {
                    oldCastle.samuraiIds = oldCastle.samuraiIds.filter(id => id !== motoyasu.id);
                    if (oldCastle.castellanId === motoyasu.id) {
                        oldCastle.castellanId = 0;
                        motoyasu.isCastellan = false;
                    }
                }
                motoyasu.castleId = 48;
                if (!okazakiCastle.samuraiIds.includes(motoyasu.id)) {
                    okazakiCastle.samuraiIds.push(motoyasu.id);
                }
            }
        }

        // 3. 岡崎城にいる他の武将の城主バッジを外し、元康を新しい城主にします
        // ※ すでに元康が城主だったとしても、ここで改めて正しくバッジを付け直すので安全です
        const residents = game.bushos.filter(b => b.castleId === 48);
        residents.forEach(b => {
            b.isCastellan = false;
        });

        motoyasu.isCastellan = true;
        okazakiCastle.castellanId = motoyasu.id;

        // 4. システムに城主の変更を確定させ、画面を更新します
        if (game.affiliationSystem) {
            game.affiliationSystem.updateCastleLord(okazakiCastle);
        }

        if (game.ui) {
            game.ui.renderMap();
            game.ui.updatePanelHeader();
        }
    }
});

// ==========================================
// ★ 桶狭間の戦い（統合版）
// ==========================================
window.GameEvents.push({
    id: "historical_okehazama",
    timing: "startMonth_before",     // 月初の処理前に発生するかチェックします
    isOneTime: true,                 // 一度発生したら二度と起きません
    
    checkCondition: function(game) {
        // ① まず、発生する月かどうかをチェックします（もっとも簡単な確認です）
        // 5月、6月、7月のいずれかであるか確認します
        if (game.month !== 5 && game.month !== 6 && game.month !== 7) return false;

        // ② 登場人物たちの存在や状況を確認します
        // 太原崇孚（雪斎）（ID: 1004057）が死亡しているか確認します（生きていたらストップ）
        const sessai = game.getBusho(1004057);
        if (sessai && sessai.status !== 'dead') return false;

        // 今川義元（ID: 1004001）が大名として存在するか確認します
        const yoshimoto = game.getBusho(1004001);
        if (!yoshimoto || !yoshimoto.isDaimyo) return false;
        
        // 今川義元が駿府城（ID: 13）にいるか確認します
        if (yoshimoto.castleId !== 13) return false;
        
        // 織田信長（ID: 1006001）が大名として存在するか確認します
        const nobunaga = game.getBusho(1006001);
        if (!nobunaga || !nobunaga.isDaimyo) return false;
        
        // 織田信長が清洲城（ID: 7）にいるか確認します
        if (nobunaga.castleId !== 7) return false;

        // 松平元康（ID: 1004004）が城主として存在するか確認します
        const motoyasu = game.getBusho(1004004);
        if (!motoyasu || !motoyasu.isCastellan) return false;

        // ③ 勢力同士の外交関係を確認します
        const imagawaClanId = yoshimoto.clan;
        const odaClanId = nobunaga.clan;
        
        // 織田家と今川家の関係が、同盟・従属・支配・友好ではないことを確認します
        if (game.diplomacyManager) {
            const rel = game.diplomacyManager.getRelation(odaClanId, imagawaClanId);
            if (rel && ['同盟', '従属', '支配', '友好'].includes(rel.status)) {
                return false; // もし対象の関係だったら、ここでイベントをストップします
            }
        }

        // ④ 指定のお城をすべて持っているか確認します（少し手間のかかる確認です）
        // 織田家が指定のお城（清洲城、名古屋城）をすべて持っているか確認します
        const requiredOdaCastles = [7, 11];
        const hasAllOdaCastles = requiredOdaCastles.every(id => {
            const c = game.getCastle(id);
            return c && c.ownerClan === odaClanId;
        });
        if (!hasAllOdaCastles) return false;

        // 今川家が指定のお城をすべて持っているか確認します
        // （曳馬城、駿府城、長篠城、岡崎城、犬居城、高天神城、吉田城、興国寺城）
        const requiredImagawaCastles = [12, 13, 45, 48, 54, 71, 100, 101];
        const hasAllImagawaCastles = requiredImagawaCastles.every(id => {
            const c = game.getCastle(id);
            return c && c.ownerClan === imagawaClanId;
        });
        if (!hasAllImagawaCastles) return false;

        // ⑤ 最後に、一番計算に手間のかかる「領地の隣接確認」をします
        // 織田家と今川家の領地（お城同士の道）が隣接しているか確認します
        const odaCastles = game.castles.filter(c => c.ownerClan === odaClanId);
        const imagawaCastles = game.castles.filter(c => c.ownerClan === imagawaClanId);
        let isAdjacent = false;
        
        for (let oc of odaCastles) {
            for (let ic of imagawaCastles) {
                // GameSystemを使って、道が繋がっているか調べます
                if (GameSystem.isAdjacent(oc, ic)) {
                    isAdjacent = true;
                    break;
                }
            }
            if (isAdjacent) break;
        }
        // 隣接していなければストップします
        if (!isAdjacent) return false;
        
        // すべての条件をクリアしたら、イベントを発生させます！
        return true;
    },
    
    execute: async function(game) {
        const yoshimoto = game.getBusho(1004001);
        const imagawaClanId = yoshimoto.clan;
        const nobunaga = game.getBusho(1006001);

        const imagawaClan = game.clans.find(c => c.id === imagawaClanId);
        const odaClan = game.clans.find(c => c.id === nobunaga.clan);

        // --- 1. 武将の配役決定（オーディション） ---
        // 織田家にいる武将（信長以外）を全員集めます
        let odaBushos = game.bushos.filter(b => b.clan === nobunaga.clan && b.status === 'active' && b.id !== nobunaga.id);

        // 重臣A（林秀貞）: 貢献度600以上で外交最高。いなければ貢献度最高の中で外交最高。
        let juushinA = odaBushos.filter(b => b.achievementTotal >= 600).sort((a, b) => (b.diplomacy || 0) - (a.diplomacy || 0))[0];
        if (!juushinA) juushinA = [...odaBushos].sort((a, b) => ((b.achievementTotal || 0) !== (a.achievementTotal || 0) ? (b.achievementTotal || 0) - (a.achievementTotal || 0) : (b.diplomacy || 0) - (a.diplomacy || 0)))[0];
        // 選ばれた人は次のオーディションから外します
        odaBushos = odaBushos.filter(b => b.id !== (juushinA ? juushinA.id : 0));

        // 重臣B（佐久間信盛）: 貢献度600以上で武勇最高。いなければ貢献度最高の中で武勇最高。
        let juushinB = odaBushos.filter(b => b.achievementTotal >= 600).sort((a, b) => (b.strength || 0) - (a.strength || 0))[0];
        if (!juushinB) juushinB = [...odaBushos].sort((a, b) => ((b.achievementTotal || 0) !== (a.achievementTotal || 0) ? (b.achievementTotal || 0) - (a.achievementTotal || 0) : (b.strength || 0) - (a.strength || 0)))[0];
        odaBushos = odaBushos.filter(b => b.id !== (juushinB ? juushinB.id : 0));

        // 新参C（柴田勝家）: 貢献度599以下で武勇最高。いなければ武勇最高。
        let shinzanC = odaBushos.filter(b => b.achievementTotal <= 599).sort((a, b) => (b.strength || 0) - (a.strength || 0))[0];
        if (!shinzanC) shinzanC = [...odaBushos].sort((a, b) => (b.strength || 0) - (a.strength || 0))[0];
        odaBushos = odaBushos.filter(b => b.id !== (shinzanC ? shinzanC.id : 0));

        // 新参D（木下秀吉）: 貢献度300以下で智謀最高。いなければ智謀最高。
        let shinzanD = odaBushos.filter(b => b.achievementTotal <= 300).sort((a, b) => (b.intelligence || 0) - (a.intelligence || 0))[0];
        if (!shinzanD) shinzanD = [...odaBushos].sort((a, b) => (b.intelligence || 0) - (a.intelligence || 0))[0];
        odaBushos = odaBushos.filter(b => b.id !== (shinzanD ? shinzanD.id : 0));

        // 新参E（毛利良勝）: ID1006020、いなければ貢献度100以下で武勇最高、いなければ武勇最高
        let mouri = odaBushos.find(b => b.id === 1006020);
        if (!mouri) {
            mouri = odaBushos.filter(b => b.achievementTotal <= 100).sort((a, b) => (b.strength || 0) - (a.strength || 0))[0];
            if (!mouri) mouri = [...odaBushos].sort((a, b) => (b.strength || 0) - (a.strength || 0))[0];
        }

        // 今川家重臣Fの選出
        let juushinF = null;
        let imagawaBushosForF = game.bushos.filter(b => b.clan === imagawaClanId && b.status === 'active' && b.id !== yoshimoto.id && b.id !== 1004004);

        // 1. 今川家所属の軍師
        juushinF = imagawaBushosForF.find(b => b.isGunshi);

        // 2. 功績500以上で智謀最高
        if (!juushinF) {
            let candidates = imagawaBushosForF.filter(b => b.achievementTotal >= 500);
            if (candidates.length > 0) {
                juushinF = candidates.sort((a, b) => (b.intelligence || 0) - (a.intelligence || 0))[0];
            }
        }

        // 3. 相性が近くて功績最高
        if (!juushinF && imagawaBushosForF.length > 0) {
            juushinF = [...imagawaBushosForF].sort((a, b) => {
                const diffA = Math.abs((yoshimoto.affinity || 0) - (a.affinity || 0));
                const trueDiffA = Math.min(diffA, 100 - diffA);
                const diffB = Math.abs((yoshimoto.affinity || 0) - (b.affinity || 0));
                const trueDiffB = Math.min(diffB, 100 - diffB);
                
                if (trueDiffA !== trueDiffB) {
                    return trueDiffA - trueDiffB; // 相性が近い順
                }
                return (b.achievementTotal || 0) - (a.achievementTotal || 0); // 功績が高い順
            })[0];
        }

        // 台本に渡す情報をひとまとめにします
        const args = {
            yoshimotoName: yoshimoto.name.replace('|', ''),
            yoshimotoFamilyName: yoshimoto.familyName || "今川",
            yoshimotoGivenName: yoshimoto.givenName || "義元",
            yoshimotoFace: yoshimoto.faceIcon || "unknown_face.webp",
            nobunagaName: nobunaga.name.replace('|', ''),
            nobunagaFamilyName: nobunaga.familyName || "織田",
            nobunagaGivenName: nobunaga.givenName || "信長",
            nobunagaFace: nobunaga.faceIcon || "unknown_face.webp",
            sunpuCastleName: game.getCastle(13)?.name || "駿府城",
            owariProvinceName: "尾張国",
            owariProvinceShort: "尾張",
            odaClanName: odaClan ? odaClan.name : "織田家",
            imagawaClanName: imagawaClan ? imagawaClan.name : "今川家",
            
            juushinAName: juushinA ? juushinA.name.replace('|', '') : "小姓",
            juushinAFace: juushinA ? juushinA.faceIcon : "koshou.webp",
            juushinBName: juushinB ? juushinB.name.replace('|', '') : "小姓",
            juushinBFace: juushinB ? juushinB.faceIcon : "koshou.webp",
            shinzanCName: shinzanC ? shinzanC.name.replace('|', '') : "小姓",
            shinzanCFace: shinzanC ? shinzanC.faceIcon : "koshou.webp",
            shinzanDName: shinzanD ? shinzanD.name.replace('|', '') : "小姓",
            shinzanDFace: shinzanD ? shinzanD.faceIcon : "koshou.webp",
            mouriName: mouri ? mouri.name.replace('|', '') : "小姓",
            mouriFace: mouri ? mouri.faceIcon : "koshou.webp",
            juushinFName: juushinF ? juushinF.name.replace('|', '') : "小姓",
            juushinFFace: juushinF ? juushinF.faceIcon : "koshou.webp",
            juushinFGivenName: juushinF ? (juushinF.givenName || juushinF.name.replace('|', '')) : "小姓"
        };

        // --- 2. イベント開始 ---
        // BGMをメモして専用の曲に変更します
        if (window.AudioManager) {
            window.AudioManager.memorizeCurrentBgm();
            window.AudioManager.playBGM("SC_ex_Scene1_Duel.ogg");
        }

        // プレイヤーが今川家の場合は、専用の会話と選択肢になります
        let imagawaAttack = true;
        
        if (game.playerClanId === imagawaClanId) {
            // 今川プレイヤー専用のパート1を再生します
            if (window.EventTextManager && window.EventTextManager.okehazama_imagawa_part1) {
                await window.EventTextManager.playSequence(game, window.EventTextManager.okehazama_imagawa_part1(args));
            }
            
            // 出陣するかどうかの選択肢を出します
            await new Promise(resolve => {
                game.ui.showDialog("尾張国に出陣しますか？", true, 
                    () => { imagawaAttack = true; resolve(); },
                    () => { imagawaAttack = false; resolve(); },
                    {
                        leftName: args.juushinFName,
                        leftFace: args.juushinFFace,
                        okText: "出陣する",
                        okClass: "btn-danger",
                        cancelText: "やめる",
                        cancelClass: "btn-primary"
                    }
                );
            });
            
            if (imagawaAttack) {
                // 出陣する場合のテキストを再生し、織田家の軍議へと繋ぎます
                if (window.EventTextManager && window.EventTextManager.okehazama_imagawa_attack) {
                    await window.EventTextManager.playSequence(game, window.EventTextManager.okehazama_imagawa_attack(args));
                }
                if (window.EventTextManager && window.EventTextManager.okehazama_oda_gungi) {
                    await window.EventTextManager.playSequence(game, window.EventTextManager.okehazama_oda_gungi(args));
                }
            } else {
                // 出陣しない場合のテキストを再生します
                if (window.EventTextManager && window.EventTextManager.okehazama_imagawa_defend) {
                    await window.EventTextManager.playSequence(game, window.EventTextManager.okehazama_imagawa_defend(args));
                }
                // 義元の寿命を10年延ばします
                yoshimoto.endYear += 10;
                
                // ここでイベントを終了して、元の画面に戻ります
                if (window.AudioManager) window.AudioManager.restoreMemorizedBgm();
                if (game.factionSystem) game.factionSystem.updateFactions();
                if (game.ui) {
                    game.ui.renderMap();
                    game.ui.updatePanelHeader();
                }
                return;
            }
        } else {
            // プレイヤーが今川家以外の場合は、これまで通りのパート1を読み込みます
            if (window.EventTextManager && window.EventTextManager.okehazama_part1) {
                await window.EventTextManager.playSequence(game, window.EventTextManager.okehazama_part1(args));
            }
        }

        // --- 3. プレイヤーの分岐選択 ---
        let isAttack = true; // プレイヤー以外は史実通り自動で出陣します

        // プレイヤーが織田家の場合は、選択肢の窓を出して待ちます
        if (game.playerClanId === nobunaga.clan) {
            await new Promise(resolve => {
                game.ui.showDialog("「殿、どうなさりまするか？」", true, 
                    () => { isAttack = true; resolve(); },
                    () => { isAttack = false; resolve(); },
                    {
                        leftName: args.juushinBName,
                        leftFace: args.juushinBFace,
                        okText: "出陣する",
                        okClass: "btn-danger",
                        cancelText: "籠城する",
                        cancelClass: "btn-primary"
                    }
                );
            });
        }

        // --- 4. 選んだ選択肢ごとの結果 ---
        if (isAttack) {
            // 【出陣ルート】
            if (window.EventTextManager && window.EventTextManager.okehazama_attack) {
                await window.EventTextManager.playSequence(game, window.EventTextManager.okehazama_attack(args));
            }

            // 義元の討死処理を行います
            // 死亡システムに全てお任せして、後継ぎの決定なども自動で行ってもらいます
            if (game.lifeSystem) {
                await game.lifeSystem.executeDeath(yoshimoto);
            }

            // 織田家に勝利のボーナス（忠誠と民忠アップ）を与えます
            if (nobunaga && nobunaga.clan > 0) {
                const odaBushos = game.bushos.filter(b => b.clan === nobunaga.clan && b.status === 'active');
                odaBushos.forEach(b => {
                    b.loyalty = Math.min(100, (b.loyalty || 0) + 5);
                });
                const odaCastles = game.castles.filter(c => c.ownerClan === nobunaga.clan);
                odaCastles.forEach(c => {
                    c.peoplesLoyalty = 100;
                });
            }

        } else {
            // 【籠城ルート】
            if (window.EventTextManager && window.EventTextManager.okehazama_defend) {
                await window.EventTextManager.playSequence(game, window.EventTextManager.okehazama_defend(args));
            }
            // 籠城ルートはここでイベントが終わり、義元も生き残ります
        }

        // --- 5. 終了のお片付け ---
        // メモしておいた元のBGMに戻します
        if (window.AudioManager) {
            window.AudioManager.restoreMemorizedBgm();
        }
        
        // 画面の情報を最新のものに更新します
        if (game.factionSystem) {
            game.factionSystem.updateFactions();
        }
        if (game.ui) {
            game.ui.renderMap();
            game.ui.updatePanelHeader();
        }
    }
});

// ==========================================
// ★ 松平元康（徳川家康）独立イベント
// ==========================================
window.GameEvents.push({
    id: "historical_ieyasu_independence",
    timing: "endMonth_before", // 月末の独立チェックなどが始まる前に起こします
    isOneTime: true,
    
    checkCondition: function(game) {
        // 1. 今川義元（ID: 1004001）が死亡しているか確認します
        const yoshimoto = game.getBusho(1004001);
        if (!yoshimoto || yoshimoto.status !== 'dead') return false;

        // 2. 今川氏真（ID: 1004011）が大名であるか確認します
        const ujizane = game.getBusho(1004011);
        if (!ujizane || !ujizane.isDaimyo || ujizane.clan === 0) return false;

        // 3. 松平元康（ID: 1004004）が存在し、大名ではないことを確認します
        const motoyasu = game.getBusho(1004004);
        if (!motoyasu || motoyasu.isDaimyo) return false;

        // 4. 松平元康が氏真と同じ今川家に所属し、城主であるか確認します
        if (motoyasu.clan !== ujizane.clan || !motoyasu.isCastellan) return false;

        // 5. 松平元康が派閥主であるか確認します
        if (!motoyasu.isFactionLeader) return false;

        // 全ての条件を満たしたらイベント発生！
        return true;
    },
    
    execute: async function(game) {
        const ujizane = game.getBusho(1004011);
        const motoyasu = game.getBusho(1004004);
        const castle = game.getCastle(motoyasu.castleId);

        if (!castle) return;

        // 独立システムを呼び出して、強制的に独立を実行します
        if (game.independenceSystem) {
            // 第4引数に 'indep' を渡すことで、乗っ取りや寝返りではなく、純粋な「独立」として処理させます
            await game.independenceSystem.executeRebellion(castle, motoyasu, ujizane, 'indep');
            
            // 独立が起こったあと、元々の大名家（今川家）に残った武将の下がりすぎた忠誠度を調整の為25回復させます
            const oldClanId = ujizane.clan;
            // 氏真がちゃんと大名家に所属しているか確認します
            if (oldClanId > 0) {
                // 同じ大名家に所属していて、まだ活動中（生きている）武将を全員集めます
                const remainingBushos = game.bushos.filter(b => b.clan === oldClanId && b.status === 'active');
                
                // 集めた武将たち全員に、順番に忠誠度を回復する魔法をかけます
                remainingBushos.forEach(b => {
                    // 現在の忠誠度に25を足します（ただし、最大100までに制限します）
                    b.loyalty = Math.min(100, (b.loyalty || 0) + 25);
                });
                
            }

            // ★追加：独立した松平元康の大名家に所属する武将と城のボーナス処理
            if (motoyasu.clan > 0) {
                // 武将の忠誠度を+10（最大100まで）
                const matsudairaBushos = game.bushos.filter(b => b.clan === motoyasu.clan && b.status === 'active');
                matsudairaBushos.forEach(b => {
                    b.loyalty = Math.min(100, (b.loyalty || 0) + 10);
                });

                // 城の人口を+20%（上限99万9999）し、民忠を100にする
                const matsudairaCastles = game.castles.filter(c => c.ownerClan === motoyasu.clan);
                matsudairaCastles.forEach(c => {
                    c.population = Math.min(999999, Math.floor(c.population * 1.2));
                    c.peoplesLoyalty = 100;
                });
            }
        }
    }
});

// ==========================================
// ★ 清洲同盟イベント
// ==========================================
window.GameEvents.push({
    id: "historical_kiyosu_alliance",
    timing: "startMonth_before", // 月初の処理前に発生します
    isOneTime: true,             // 一度きりの歴史イベントです
    
    checkCondition: function(game) {
        // 今川義元（ID: 1004001）が死亡しているかを確認します
        const yoshimoto = game.getBusho(1004001);
        if (yoshimoto && yoshimoto.status !== 'dead') return false;

        // 織田信長（ID: 1006001）が大名であるか確認します
        const nobunaga = game.getBusho(1006001);
        if (!nobunaga || !nobunaga.isDaimyo || nobunaga.clan === 0) return false;

        // 松平元康（ID: 1004004）が大名であるか確認します
        const motoyasu = game.getBusho(1004004);
        if (!motoyasu || !motoyasu.isDaimyo || motoyasu.clan === 0) return false;

        // 今川氏真（ID: 1004011）が大名であるか確認します
        const ujizane = game.getBusho(1004011);
        if (!ujizane || !ujizane.isDaimyo || ujizane.clan === 0) return false;

        // 一色義龍（ID: 1005001）または一色龍興（ID: 1005011）が大名であるか確認します
        const yoshitatsu = game.getBusho(1005001);
        const tatsuoki = game.getBusho(1005011);
        let isshikiDaimyo = null;
        if (yoshitatsu && yoshitatsu.isDaimyo && yoshitatsu.clan !== 0) {
            isshikiDaimyo = yoshitatsu;
        } else if (tatsuoki && tatsuoki.isDaimyo && tatsuoki.clan !== 0) {
            isshikiDaimyo = tatsuoki;
        }
        if (!isshikiDaimyo) return false;

        // 織田家と斎藤家（一色家）の関係が敵対であるか確認します
        const relOdaIsshiki = game.diplomacyManager.getRelation(nobunaga.clan, isshikiDaimyo.clan);
        if (!relOdaIsshiki || relOdaIsshiki.status !== '敵対') return false;

        // 松平家と今川家の関係が敵対であるか確認します
        const relMatsudairaImagawa = game.diplomacyManager.getRelation(motoyasu.clan, ujizane.clan);
        if (!relMatsudairaImagawa || relMatsudairaImagawa.status !== '敵対') return false;

        // 織田家と松平家の関係が「敵対」「普通」「友好」のいずれかであるか確認します
        const rel = game.diplomacyManager.getRelation(nobunaga.clan, motoyasu.clan);
        if (!rel || (rel.status !== '敵対' && rel.status !== '普通' && rel.status !== '友好')) return false;

        // 織田家と松平家の領地（お城同士の道）が隣接しているか確認します
        const odaCastles = game.castles.filter(c => c.ownerClan === nobunaga.clan);
        const matsudairaCastles = game.castles.filter(c => c.ownerClan === motoyasu.clan);
        let isAdjacent = false;
        
        for (let oc of odaCastles) {
            for (let mc of matsudairaCastles) {
                // GameSystem.isAdjacent を使って、道が繋がっているか調べます
                if (GameSystem.isAdjacent(oc, mc)) {
                    isAdjacent = true;
                    break;
                }
            }
            if (isAdjacent) break;
        }
        if (!isAdjacent) return false;

        // すべての条件を満たしたらイベント発生です！
        return true;
    },
    
    execute: async function(game) {
        // ★ 1. 今流れているBGMを「後で戻す用」にメモしておきます
        if (window.AudioManager) {
            window.AudioManager.memorizeCurrentBgm();
        }

        // ★ 2. イベント用のBGM「06_Snowy Sacred Approach.ogg」を流します
        if (window.AudioManager) {
            window.AudioManager.playBGM("06_Snowy Sacred Approach.ogg");
        }

        const nobunaga = game.getBusho(1006001);
        const motoyasu = game.getBusho(1004004);
        
        const odaClan = game.clans.find(c => c.id === nobunaga.clan);
        const matsudairaClan = game.clans.find(c => c.id === motoyasu.clan);
        
        // 今川氏真(1004011)の大名家名を取得します
        const ujizane = game.getBusho(1004011);
        let imagawaClanName = "今川家";
        let imagawaFamilyName = "今川";
        if (ujizane && ujizane.clan > 0) {
            const imagawaClan = game.clans.find(c => c.id === ujizane.clan);
            if (imagawaClan) imagawaClanName = imagawaClan.name;
            if (ujizane.familyName) imagawaFamilyName = ujizane.familyName;
        }

        // --- ここから松平家の配役を選出します ---
        // まず、松平家に所属していて、元康以外の活動中の武将を全員集めます
        let matsuBushos = game.bushos.filter(b => b.clan === motoyasu.clan && b.id !== motoyasu.id && b.status === 'active');
        
        // 松平家臣A：統率がもっとも高い武将
        let kashinA = matsuBushos.sort((a, b) => (b.leadership || 0) - (a.leadership || 0))[0];
        // 選ばれた家臣Aを次のオーディション候補から外します
        matsuBushos = matsuBushos.filter(b => b.id !== (kashinA ? kashinA.id : 0));
        
        // 松平家臣B：残りの武将の中で、智謀がもっとも高い武将
        let kashinB = matsuBushos.sort((a, b) => (b.intelligence || 0) - (a.intelligence || 0))[0];

        // --- ここから織田家の配役を選出します ---
        // 織田家に所属していて、信長以外の活動中の武将を全員集めます
        let odaBushos = game.bushos.filter(b => b.clan === nobunaga.clan && b.id !== nobunaga.id && b.status === 'active');
        
        // 織田家新参C：功績が300以下で、智謀がもっとも高い武将
        let shinzanC = odaBushos.filter(b => (b.achievementTotal || 0) <= 300).sort((a, b) => (b.intelligence || 0) - (a.intelligence || 0))[0];

        // 信長の官位名を取得します
        let nobunagaTitle = "上総介";
        if (nobunaga.courtRankIds && nobunaga.courtRankIds.length > 0 && game.courtRankSystem) {
            const topRankId = Math.min(...nobunaga.courtRankIds);
            const rank = game.courtRankSystem.getRank(topRankId);
            if (rank) nobunagaTitle = rank.rankName2 || rank.rankName;
        }

        // 信長の居城名を取得します
        let nobunagaCastleName = "城";
        if (nobunaga.castleId > 0) {
            const castle = game.getCastle(nobunaga.castleId);
            if (castle) nobunagaCastleName = castle.name;
        }

        // イベントテキストの台本に渡す変数をひとまとめにします
        const args = {
            motoyasuName: motoyasu.name.replace('|', ''),
            motoyasuGivenName: motoyasu.givenName || "元康",
            matsudairaFamilyName: motoyasu.familyName || "松平",
            motoyasuFace: motoyasu.faceIcon || "unknown_face.webp",
            
            imagawaClanName: imagawaClanName,
            imagawaFamilyName: imagawaFamilyName,
            
            nobunagaName: nobunaga.name.replace('|', ''),
            nobunagaGivenName: nobunaga.givenName || "信長", 
            odaFamilyName: nobunaga.familyName || "織田",
            nobunagaFace: nobunaga.faceIcon || "unknown_face.webp",
            
            odaClanName: odaClan ? odaClan.name : "織田家",
            matsudairaClanName: matsudairaClan ? matsudairaClan.name : "松平家",
            
            kashinAName: kashinA ? kashinA.name.replace('|', '') : "小姓",
            kashinAGivenName: kashinA ? (kashinA.givenName || kashinA.name.replace('|', '')) : "小姓",
            kashinAFace: kashinA ? kashinA.faceIcon : "koshou.webp",
            
            kashinBName: kashinB ? kashinB.name.replace('|', '') : "小姓",
            kashinBGivenName: kashinB ? (kashinB.givenName || kashinB.name.replace('|', '')) : "小姓",
            kashinBFace: kashinB ? kashinB.faceIcon : "koshou.webp",
            
            shinzanCName: shinzanC ? shinzanC.name.replace('|', '') : "小姓",
            shinzanCGivenName: shinzanC ? (shinzanC.givenName || shinzanC.name.replace('|', '')) : "小姓",
            shinzanCFace: shinzanC ? shinzanC.faceIcon : "koshou.webp",

            nobunagaCastleName: nobunagaCastleName,
            nobunagaCastleShort: nobunagaCastleName.replace(/城$/, ''), // 「清洲城」から「城」を消した名前を作ります
            nobunagaTitle: nobunagaTitle,
            year: game.year,
            month: game.month
        };
        
        // 新しく作ったファイルから台本を受け取り、再生プレイヤーで順番に表示させます
        // まずは共通のパート１（城に到着するまで）を再生します
        if (window.EventTextManager && window.EventTextManager.kiyosu_alliance_part1) {
            await window.EventTextManager.playSequence(game, window.EventTextManager.kiyosu_alliance_part1(args));
        }

        // 同盟を結ぶかどうかの判定用スイッチです（初期値は「結ぶ」にしておきます）
        let isAccept = true;

        // プレイヤーが織田家を担当している場合だけ、使者の取り次ぎと選択肢の窓を出します
        if (game.playerClanId === nobunaga.clan) {
            if (window.EventTextManager && window.EventTextManager.kiyosu_alliance_oda_arrival) {
                await window.EventTextManager.playSequence(game, window.EventTextManager.kiyosu_alliance_oda_arrival(args));
            }

            await new Promise(resolve => {
                game.ui.showDialog(`「${args.matsudairaFamilyName}家の使者とお会いになられまするか？」`, true, 
                    () => { isAccept = true; resolve(); },
                    () => { isAccept = false; resolve(); },
                    {
                        leftName: args.shinzanCName,
                        leftFace: args.shinzanCFace,
                        okText: "面会する",
                        okClass: "btn-primary",
                        cancelText: "追い返す",
                        cancelClass: "btn-secondary"
                    }
                );
            });
        }

        // 面会する（同盟を結ぶ）ルート
        if (isAccept) {
            // 織田家プレイヤーの時だけ、通す命令と対面ナレーションを再生します
            if (game.playerClanId === nobunaga.clan) {
                if (window.EventTextManager && window.EventTextManager.kiyosu_alliance_oda_accept) {
                    await window.EventTextManager.playSequence(game, window.EventTextManager.kiyosu_alliance_oda_accept(args));
                }
            }
            
            // 共通のパート２（対面して同盟成立）を再生します
            if (window.EventTextManager && window.EventTextManager.kiyosu_alliance_accept) {
                await window.EventTextManager.playSequence(game, window.EventTextManager.kiyosu_alliance_accept(args));
            }

            // ログ出力
            game.ui.log(`【イベント】清洲同盟：${args.matsudairaClanName}と${args.odaClanName}の同盟が成立しました。`);

            // 外交システムを使って、強制的に「同盟」状態にします
            if (game.diplomacyManager) {
                game.diplomacyManager.changeStatus(motoyasu.clan, nobunaga.clan, '同盟', 0);
                
                // お互いの関係値を最高の100にします！
                const relA = game.diplomacyManager.getRelation(motoyasu.clan, nobunaga.clan);
                if (relA) {
                    relA.sentiment = 100;
                    relA.isEvent = true; // ★追加：イベント同盟のシールを貼ります
                }
                
                const relB = game.diplomacyManager.getRelation(nobunaga.clan, motoyasu.clan);
                if (relB) {
                    relB.sentiment = 100;
                    relB.isEvent = true; // ★追加：イベント同盟のシールを貼ります
                }
            }

            // 汎用メッセージの表示
            await game.ui.showDialogAsync(`${args.odaClanName} が ${args.matsudairaClanName} と同盟を締結しました！`, false, 0);

            // 画面や情報を最新の状態に更新します
            if (game.ui) {
                game.ui.renderMap();
                game.ui.updatePanelHeader();
            }
        } 
        // 追い返す（同盟を結ばない）ルート
        else {
            // パート３（拒否）を再生します
            if (window.EventTextManager && window.EventTextManager.kiyosu_alliance_reject) {
                await window.EventTextManager.playSequence(game, window.EventTextManager.kiyosu_alliance_reject(args));
            }
            // ログ出力
            game.ui.log(`【イベント】清洲同盟：${args.odaFamilyName}家は${args.matsudairaFamilyName}家との同盟を拒否しました。`);
        }

        // ★ 3. イベントが全て終わったので、メモしておいた元のBGMに戻します
        if (window.AudioManager) {
            window.AudioManager.restoreMemorizedBgm();
        }
    }
});

// ==========================================
// ★ 浅井長政 家督相続イベント
// ==========================================
window.GameEvents.push({
    id: "historical_nagamasa_succession",
    timing: "startMonth_before", 
    isOneTime: true,             
    
    checkCondition: function(game) {
        // 1. 浅井久政（ID: 1015001）が存在し、大名であるか確認します
        const hisamasa = game.getBusho(1015001);
        if (!hisamasa || !hisamasa.isDaimyo || hisamasa.clan === 0) return false;

        // 2. プレイヤーが浅井家の担当ではないか確認します
        if (game.playerClanId === hisamasa.clan) return false;

        // 3. 浅井長政（ID: 1015002）が存在し、久政と同じ勢力に所属しているか確認します
        const nagamasa = game.getBusho(1015002);
        if (!nagamasa || nagamasa.status !== 'active' || nagamasa.clan !== hisamasa.clan) return false;

        // 4. 浅井長政が16歳以上か確認します
        const currentYear = game.year;
        if (currentYear - nagamasa.birthYear < 16) return false;

        // 5. 六角義賢（ID: 1018001）または六角義治（ID: 1018002）が大名であるか確認します
        const yoshikata = game.getBusho(1018001);
        const yoshiharu = game.getBusho(1018002);
        let rokkakuDaimyo = null;
        
        if (yoshikata && yoshikata.isDaimyo && yoshikata.clan !== 0) {
            rokkakuDaimyo = yoshikata;
        } else if (yoshiharu && yoshiharu.isDaimyo && yoshiharu.clan !== 0) {
            rokkakuDaimyo = yoshiharu;
        }
        
        if (!rokkakuDaimyo) return false;

        // 6. 浅井家と六角家が敵対関係にあるか確認します
        if (game.diplomacyManager) {
            const rel = game.diplomacyManager.getRelation(hisamasa.clan, rokkakuDaimyo.clan);
            if (!rel || rel.status !== '敵対') return false;
        } else {
            return false;
        }

        // すべての条件をクリアしたらイベント発生です！
        return true;
    },
    
    execute: async function(game) {
        const oldDaimyo = game.getBusho(1015001);
        const successor = game.getBusho(1015002);
        const clanId = oldDaimyo.clan;
        const messages = [];

        // ① 功績の譲渡（生前退位コマンドと同じように、旧大名の功績の3分の1を譲り受けます）
        const meritTransfer = Math.floor((oldDaimyo.achievementTotal || 0) / 3);
        successor.achievementTotal = (successor.achievementTotal || 0) + meritTransfer;
        oldDaimyo.achievementTotal = (oldDaimyo.achievementTotal || 0) - meritTransfer;

        // ② 久政から大名のバッジを外します
        oldDaimyo.isDaimyo = false;

        // ③ もし長政が久政と違うお城にいたら、久政のいるお城へ呼び寄せます
        if (successor.castleId !== oldDaimyo.castleId) {
            if (game.affiliationSystem) {
                game.affiliationSystem.moveCastle(successor, oldDaimyo.castleId);
            } else {
                successor.castleId = oldDaimyo.castleId;
            }
        }

        // ④ 長政を新しい大名、そして城主に任命します
        successor.isDaimyo = true;
        successor.isCastellan = true;
        if (successor.isGunshi) {
            successor.isGunshi = false; // もし軍師だったらバッジを外します
        }

        // ⑤ お城の城主データを長政に書き換えます
        const targetCastle = game.getCastle(successor.castleId);
        if (targetCastle) {
            const castleBushos = game.bushos.filter(b => b.castleId === targetCastle.id && b.status === 'active');
            castleBushos.forEach(b => {
                if (b.id !== successor.id && b.isCastellan) {
                    b.isCastellan = false; // 他の人の城主バッジを外します
                }
            });
            targetCastle.castellanId = successor.id;
            if (game.affiliationSystem) {
                game.affiliationSystem.updateCastleLord(targetCastle);
            }
        }

        // ⑥ 改名の魔法（大名になった時に名前が変わる設定があれば適用します）
        if (successor.nameChange && successor.nameChange.includes('daimyo:')) {
            const changes = successor.nameChange.split('/');
            for (const change of changes) {
                const parts = change.split(':');
                if (parts.length === 3 && parts[0].trim() === 'daimyo') {
                    const oldNameStr = successor.name.replace('|', '');
                    const newNameParts = parts[1].trim().split('|');
                    successor.familyName = newNameParts[0] || "";
                    successor.givenName = newNameParts[1] || "";
                    successor.name = successor.familyName + successor.givenName;
                    const newYomiParts = parts[2].trim().split('|');
                    successor.familyYomi = newYomiParts[0] || "";
                    successor.givenYomi = newYomiParts[1] || "";
                    successor.yomi = successor.familyYomi + successor.givenYomi;
                    const newNameStr = successor.name.replace('|', '');
                    messages.push(`家督を継ぐにあたり、${oldNameStr}は\n「${newNameStr}」と名を改めました。`);
                }
            }
        }

        // ⑦ 顔変更の魔法（大名になった時の顔画像があれば適用します）
        if (successor.faceChange && successor.faceChange.startsWith('daimyo:')) {
            const newFace = successor.faceChange.split(':')[1].trim();
            if (newFace) {
                successor.faceIcon = newFace;
            }
        }

        // ⑧ 大名家のリーダーを長政に設定します
        game.changeLeader(clanId, successor.id);
        successor.isActionDone = true;

        // ⑨ 旧大名の城の城主情報を更新します
        if (oldDaimyo.castleId) {
            const oldCastle = game.getCastle(oldDaimyo.castleId);
            if (oldCastle && game.affiliationSystem) {
                game.affiliationSystem.updateCastleLord(oldCastle);
            }
        }

        // ⑩ 当主交代の共通の魔法を呼び出します（能力差による忠誠度の変化など）
        // 第4引数に true を入れて、生前退位（家督相続）と同じようにショックを和らげる設定にしています！
        if (game.lifeSystem) {
            game.lifeSystem.applyDaimyoChangeEffects(oldDaimyo, successor, messages, true);
        }

        // ⑪ メッセージを画面に出してお知らせします
        const hisamasaName = oldDaimyo.name.replace('|', '');
        const nagamasaName = successor.name.replace('|', '');
        const mainMsg = `浅井家の${hisamasaName}が隠居し。\n${nagamasaName}が新たな当主として家督を継ぎました！`;
        
        game.ui.log(`【イベント】浅井家家督相続：${mainMsg}`);
        messages.unshift(mainMsg); // 一番最初にメインのメッセージを入れます

        // 溜めておいたメッセージを順番に出します
        for (const msg of messages) {
            await game.ui.showDialogAsync(msg, false, 0);
        }

        // ⑫ 画面を最新の状態に更新します
        if (game.ui) {
            game.ui.updatePanelHeader();
            game.ui.renderMap();
        }
    }
});

// ==========================================
// ★ 織田・浅井 婚姻同盟イベント
// ==========================================
window.GameEvents.push({
    id: "historical_oda_azai_marriage",
    timing: "startMonth_before", // 月初の処理前にチェックします
    isOneTime: true,             // 一度発生したら二度と起きません
    
    checkCondition: function(game) {
        // 1. 織田信長（ID: 1006001）が存在し、大名であるか確認します
        const nobunaga = game.getBusho(1006001);
        if (!nobunaga || !nobunaga.isDaimyo || nobunaga.clan === 0) return false;

        // 2. プレイヤーが織田家の担当ではないか確認します
        if (game.playerClanId === nobunaga.clan) return false;

        // 3. 浅井長政（ID: 1015002）が存在し、大名であるか確認します
        const nagamasa = game.getBusho(1015002);
        if (!nagamasa || !nagamasa.isDaimyo || nagamasa.clan === 0) return false;

        // 4. 浅井長政にまだ配偶者（奥さん）がいないことを確認します
        if (nagamasa.wifeIds && nagamasa.wifeIds.length > 0) return false;

        // 5. 今川義元（ID: 1004001）が死亡しているか確認します
        const yoshimoto = game.getBusho(1004001);
        if (yoshimoto && yoshimoto.status !== 'dead') return false;

        // 6. お市（姫ID: 2）を織田家が所有しており、未婚であるか確認します
        if (!game.princesses) return false;
        
        const oichi = game.princesses.find(p => p.id === 2);
        if (!oichi) return false; // お市のデータが見つからなければストップします

        // 7. お市が未婚であることと、「今の状況（現在の所属）」が織田家であることを確認します
        // ※万が一「今の所属」のデータがうまく作られていなかった時の保険として、「元々の実家」も確認します
        const isOdaPrincess = (oichi.currentClanId === nobunaga.clan || oichi.originalClanId === nobunaga.clan);
        if (oichi.status !== 'unmarried' || !isOdaPrincess) return false;

        // 8. 六角義賢（ID: 1018001）または六角義治（ID: 1018002）が大名であるか確認します
        const yoshikata = game.getBusho(1018001);
        const yoshiharu = game.getBusho(1018002);
        let rokkakuDaimyo = null;
        
        if (yoshikata && yoshikata.isDaimyo && yoshikata.clan !== 0) {
            rokkakuDaimyo = yoshikata;
        } else if (yoshiharu && yoshiharu.isDaimyo && yoshiharu.clan !== 0) {
            rokkakuDaimyo = yoshiharu;
        }
        
        if (!rokkakuDaimyo) return false;

        // 9. 浅井家と六角家が敵対関係にあるか確認します
        if (game.diplomacyManager) {
            const rel = game.diplomacyManager.getRelation(nagamasa.clan, rokkakuDaimyo.clan);
            if (!rel || rel.status !== '敵対') return false;

            // ★追加：8. 織田家と浅井家がすでに婚姻同盟ではないことを確認します
            const odaAzaiRel = game.diplomacyManager.getRelation(nobunaga.clan, nagamasa.clan);
            // すでに「同盟」状態で、かつ「結婚シール」が貼られている場合はイベントをストップします
            if (odaAzaiRel && odaAzaiRel.status === '同盟' && odaAzaiRel.isMarriage) {
                return false;
            }

        } else {
            return false;
        }

        // すべての条件をクリアしたらイベント発生です！
        return true;
    },
    
    execute: async function(game) {
        const nobunaga = game.getBusho(1006001);
        const nagamasa = game.getBusho(1015002);
        const oichiId = 2;

        // 万が一姫のデータ集（game.princesses）が未定義だった時のエラーを防ぎます
        const oichi = game.princesses ? game.princesses.find(p => p.id === oichiId) : null;
        const nobunagaClan = game.clans.find(c => c.id === nobunaga.clan);
        const nagamasaClan = game.clans.find(c => c.id === nagamasa.clan);

        if (!oichi || !nobunagaClan || !nagamasaClan) return; // 万が一データがない場合の安全装置です

        // ① お市の所属を浅井家に変更し、旦那さんを長政に設定します
        oichi.currentClanId = nagamasa.clan;
        oichi.husbandId = nagamasa.id;
        oichi.status = 'married'; // 状態を「既婚」にします

        // ② 織田家の姫リストからお市を外します
        nobunagaClan.princessIds = nobunagaClan.princessIds.filter(id => id !== oichiId);

        // ③ 長政の奥さんリストにお市を追加して、一門（家族）のデータを更新します
        if (!nagamasa.wifeIds.includes(oichiId)) {
            nagamasa.wifeIds.push(oichiId);
        }
        nagamasa.updateFamilyIds(game.princesses);

        // ④ 外交システムで同盟を結びます
        if (game.diplomacyManager) {
            // まずは状態を「同盟」にします
            game.diplomacyManager.changeStatus(nobunaga.clan, nagamasa.clan, '同盟', 0);
            
            // 織田家から見た関係に「結婚シール」を貼り、仲良し度を100にします
            const relA = game.diplomacyManager.getDiplomacyData(nobunaga.clan, nagamasa.clan);
            if (relA) {
                relA.isMarriage = true;
                relA.sentiment = 100;
            }
            
            // 浅井家から見た関係にも「結婚シール」を貼り、仲良し度を100にします
            const relB = game.diplomacyManager.getDiplomacyData(nagamasa.clan, nobunaga.clan);
            if (relB) {
                relB.isMarriage = true;
                relB.sentiment = 100;
            }
        }

        // ⑤ 画面にメッセージを出してお知らせします
        const odaClanName = nobunagaClan.name;
        const azaiClanName = nagamasaClan.name;
        const msg = `${odaClanName}の姫・お市が、${azaiClanName}の浅井長政に嫁ぎました！\n両家は固い婚姻同盟で結ばれました。`;
        
        game.ui.log(`【イベント】織田・浅井婚姻同盟：${msg}`);
        await game.ui.showDialogAsync(msg, false, 0);

        // ⑥ 画面や情報を最新の状態に更新します
        if (game.ui) {
            game.ui.updatePanelHeader();
            game.ui.renderMap();
        }
    }
});

// ==========================================
// ★ 三好実休の死による長慶の寿命減少（裏イベント）
// ==========================================
window.GameEvents.push({
    id: "historical_jikkyuu_death",
    timing: "startMonth_before", // 毎月の初めにこっそりチェックします
    isOneTime: true,             // 一度発生したら二度と起きません
    
    checkCondition: function(game) {
        // 1. 三好長慶（ID: 1020001）が生きているか確認します
        const nagayoshi = game.getBusho(1020001);
        if (!nagayoshi || nagayoshi.status === 'dead' || nagayoshi.status === 'unborn') return false;

        // 2. 三好実休（ID: 1020002）が亡くなっているか確認します
        const jikkyuu = game.getBusho(1020002);
        if (!jikkyuu || jikkyuu.status !== 'dead') return false;

        // 条件をクリアしたらイベント発生の合図を出します
        return true;
    },
    
    execute: async function(game) {
        const nagayoshi = game.getBusho(1020001);
        if (nagayoshi) {
            // 長慶の寿命（没年）を3年減らします
            nagayoshi.endYear -= 3;
        }
    }
});

// ==========================================
// ★ 十河一存の死による長慶の寿命減少（裏イベント）
// ==========================================
window.GameEvents.push({
    id: "historical_kazumasa_death",
    timing: "startMonth_before", // 毎月の初めにこっそりチェックします
    isOneTime: true,             // 一度発生したら二度と起きません
    
    checkCondition: function(game) {
        // 1. 三好長慶（ID: 1020001）が生きているか確認します
        const nagayoshi = game.getBusho(1020001);
        if (!nagayoshi || nagayoshi.status === 'dead' || nagayoshi.status === 'unborn') return false;

        // 2. 十河一存（ID: 1020004）が亡くなっているか確認します
        const kazumasa = game.getBusho(1020004);
        if (!kazumasa || kazumasa.status !== 'dead') return false;

        // 条件をクリアしたらイベント発生の合図を出します
        return true;
    },
    
    execute: async function(game) {
        const nagayoshi = game.getBusho(1020001);
        if (nagayoshi) {
            // 長慶の寿命（没年）を3年減らします
            nagayoshi.endYear -= 3;
        }
    }
});

// ==========================================
// ★ 安宅冬康の死による長慶の寿命減少（裏イベント）
// ==========================================
window.GameEvents.push({
    id: "historical_fuyuyasu_death",
    timing: "startMonth_before", // 毎月の初めにこっそりチェックします
    isOneTime: true,             // 一度発生したら二度と起きません
    
    checkCondition: function(game) {
        // 1. 三好長慶（ID: 1020001）が生きているか確認します
        const nagayoshi = game.getBusho(1020001);
        if (!nagayoshi || nagayoshi.status === 'dead' || nagayoshi.status === 'unborn') return false;

        // 2. 安宅冬康（ID: 1020021）が亡くなっているか確認します
        const fuyuyasu = game.getBusho(1020021);
        if (!fuyuyasu || fuyuyasu.status !== 'dead') return false;

        // 条件をクリアしたらイベント発生の合図を出します
        return true;
    },
    
    execute: async function(game) {
        const nagayoshi = game.getBusho(1020001);
        if (nagayoshi) {
            // 長慶の寿命（没年）を3年減らします
            nagayoshi.endYear -= 3;
        }
    }
});

// ==========================================
// ★ 三好義興の死による長慶の寿命減少（裏イベント）
// ==========================================
window.GameEvents.push({
    id: "historical_yoshioki_death",
    timing: "startMonth_before", // 毎月の初めにこっそりチェックします
    isOneTime: true,             // 一度発生したら二度と起きません
    
    checkCondition: function(game) {
        // 1. 三好長慶（ID: 1020001）が生きているか確認します
        const nagayoshi = game.getBusho(1020001);
        if (!nagayoshi || nagayoshi.status === 'dead' || nagayoshi.status === 'unborn') return false;

        // 2. 三好義興（ID: 1020009）が亡くなっているか確認します
        const yoshioki = game.getBusho(1020009);
        if (!yoshioki || yoshioki.status !== 'dead') return false;

        // 条件をクリアしたらイベント発生の合図を出します
        return true;
    },
    
    execute: async function(game) {
        const nagayoshi = game.getBusho(1020001);
        if (nagayoshi) {
            // 長慶の寿命（没年）を3年減らします
            nagayoshi.endYear -= 3;
        }
    }
});

// ==========================================
// ★ 永禄の変（将軍襲撃イベント）
// ==========================================
window.GameEvents.push({
    id: "historical_eiroku_no_hen",
    timing: "startMonth_before", // 月初の処理前に発生します
    isOneTime: true,             // 一度きりの歴史イベントです
    
    checkCondition: function(game) {
        // 1. 三好長慶（ID: 1020001）が死亡しているか確認します
        const nagayoshi = game.getBusho(1020001);
        if (nagayoshi && nagayoshi.status !== 'dead') return false;

        // 2. 三好義継（ID: 1020033）が大名として存在するか確認します
        const yoshitsugu = game.getBusho(1020033);
        if (!yoshitsugu || !yoshitsugu.isDaimyo || yoshitsugu.clan === 0) return false;
        
        const miyoshiClanId = yoshitsugu.clan;

        // 3. 三好家に特定の３名（三好長逸、三好政生、岩成友通）が所属しているか確認します
        const requiredMembers = [1020006, 1020007, 1020008];
        for (let id of requiredMembers) {
            const member = game.getBusho(id);
            // 死んでいる、生まれていない、浪人、または三好家以外にいる場合はイベントが起きません
            if (!member || member.status === 'dead' || member.status === 'unborn' || member.status === 'ronin' || member.clan !== miyoshiClanId) {
                return false;
            }
        }

        // 4. 足利義輝（ID: 1017001）が生存しており、大名であるか確認します
        const yoshiteru = game.getBusho(1017001);
        if (!yoshiteru || yoshiteru.status === 'dead' || yoshiteru.status === 'unborn' || !yoshiteru.isDaimyo || yoshiteru.clan === 0) return false;
        
        const ashikagaClanId = yoshiteru.clan;

        // 5. プレイヤーが足利家を担当している場合はイベントを起こしません
        if (game.playerClanId === ashikagaClanId) return false;

        // 6. 足利家と三好家の領地（お城同士の道）が隣接しているか確認します
        const ashikagaCastles = game.castles.filter(c => c.ownerClan === ashikagaClanId);
        const miyoshiCastles = game.castles.filter(c => c.ownerClan === miyoshiClanId);
        
        // どちらかがお城を一つも持っていなければ条件を満たしません
        if (ashikagaCastles.length === 0 || miyoshiCastles.length === 0) return false;

        let isAdjacent = false;
        for (let ac of ashikagaCastles) {
            for (let mc of miyoshiCastles) {
                // GameSystemを使って、道が繋がっているか調べます
                if (GameSystem.isAdjacent(ac, mc)) {
                    isAdjacent = true;
                    break;
                }
            }
            if (isAdjacent) break;
        }
        if (!isAdjacent) return false;

        // すべての条件を満たしたらイベント発生の合図を出します
        return true;
    },
    
    execute: async function(game) {
        const yoshiteru = game.getBusho(1017001);
        const yoshitsugu = game.getBusho(1020033);
        const ashikagaClanId = yoshiteru.clan;
        const miyoshiClanId = yoshitsugu.clan;

        // 大名家のデータを取得し、現在の家名（動的）を特定します
        const miyoshiClan = game.clans.find(c => c.id === miyoshiClanId);
        const miyoshiClanName = miyoshiClan ? miyoshiClan.name : "三好家";
        const ashikagaClan = game.clans.find(c => c.id === ashikagaClanId);
        const ashikagaClanName = ashikagaClan ? ashikagaClan.name : "足利家";
        const yoshiteruName = yoshiteru.name.replace('|', '');

        // ① まず、足利家の城をすべて三好家のものにします
        const ashikagaCastles = game.castles.filter(c => c.ownerClan === ashikagaClanId);
        ashikagaCastles.forEach(castle => {
            if (game.castleManager) {
                game.castleManager.changeOwner(castle, miyoshiClanId, true);
            } else {
                castle.ownerClan = miyoshiClanId;
            }
            castle.castellanId = 0;
        });

        // ② 足利義輝の死亡処理と左馬頭の引継ぎ
        // life_system に任せれば、将軍だった場合の処理も全部やってくれます！
        if (game.lifeSystem) {
            await game.lifeSystem.executeDeath(yoshiteru);
        } else {
            // 万が一システムがない時の安全策
            yoshiteru.status = 'dead';
            yoshiteru.isDaimyo = false;
            yoshiteru.isCastellan = false;
            yoshiteru.courtRankIds = [];
        }

        // ③ 武将を浪人にする
        const ashikagaBushos = game.bushos.filter(b => b.clan === ashikagaClanId && b.status === 'active');
        ashikagaBushos.forEach(b => {
            if (game.affiliationSystem) {
                game.affiliationSystem.becomeRonin(b);
            } else {
                b.status = 'ronin';
                b.clan = 0;
                b.isCastellan = false;
                b.isGunshi = false;
                b.loyalty = 50;
            }
        });

        // ④ 滅亡処理のフラグ
        if (ashikagaClan) {
            ashikagaClan.extinctionNotified = true;
        }

        // ⑤ 城主更新
        ashikagaCastles.forEach(castle => {
            if (game.affiliationSystem) {
                game.affiliationSystem.updateCastleLord(castle);
            }
        });

        const yoshitsuguName = yoshitsugu.name.replace('|', '');

        // ⑥ メッセージ表示（動的な名前を使用）
        const msg = `${yoshitsuguName}と三好三人衆らが御所を襲撃！　奮戦の末に${yoshiteruName}は討死し、${ashikagaClanName}は滅亡しました。　旧領はすべて${miyoshiClanName}の手に落ちました。`;
        game.ui.log(`【イベント】永禄の変：${msg}`);
        await game.ui.showDialogAsync(msg, false, 0);

        // ⑦ 死亡イベントの通知
        if (game.eventManager) {
            await game.eventManager.processEvents('shogun_death', {
                deadShogunClanId: ashikagaClanId,
                killerClanId: miyoshiClanId
            });
        }

        // ⑧ 画面更新
        if (game.factionSystem) game.factionSystem.updateFactions();
        if (typeof game.updateAllClanPrestige === 'function') game.updateAllClanPrestige();
        if (game.ui) {
            game.ui.renderMap();
            game.ui.updatePanelHeader();
        }

        if (game.playerClanId === ashikagaClanId) {
            setTimeout(() => {
                game.ui.showDialog(`${ashikagaClanName}は滅亡しました……`, false, () => {
                    game.ui.returnToTitle();
                });
            }, 1000);
        }
    }
});

// ==========================================
// ★ 将軍候補庇護（予備イベント）
// ==========================================
window.GameEvents.push({
    id: "historical_shogun_protection", 
    timing: "shogun_death",        // ★ 新しく作った将軍死亡のタイミングです
    isOneTime: true,               // 一度発生したら二度と起きません
    
    // お供の武将IDリストを「このイベントの持ち物」としてここに1箇所だけ書きます！
    // 和田惟政、細川藤孝、明智光秀、明智秀満、溝尾茂朝
    retainerIds: [1017002, 1017003, 1900001, 1900002, 1900003],
    
    checkCondition: function(game, context) {
        // 将軍死亡の情報が届いていなければ無視します
        if (!context || !context.deadShogunClanId) return false;

        // 世界に将軍候補（ID80:左馬頭）が存在するか確認します
        const candidate = game.bushos.find(b => b.courtRankIds && b.courtRankIds.includes(80) && b.status !== 'unborn' && b.status !== 'dead');
        if (!candidate) return false;

        // 候補が浪人か、諸勢力所属で頭領ではない場合のみイベントを起こします
        if (candidate.status === 'ronin') {
            // 浪人なのでOKです
        } else if ((candidate.belongKunishuId || 0) > 0) {
            const kunishu = game.kunishuSystem ? game.kunishuSystem.getKunishu(candidate.belongKunishuId) : null;
            if (kunishu && kunishu.leaderId === candidate.id) {
                return false; // 頭領なのでダメです
            }
        } else {
            return false; // 浪人でも諸勢力でもない場合はダメです
        }

        // お供の武将が1人以上存在するかチェックします
        // 「some」という魔法を使って、リストの中に1人でも条件に合う人がいるか探します
        const hasRetainer = this.retainerIds.some(id => {
            const rBusho = game.getBusho(id);
            // 存在し、生まれていて、死んでおらず、大名ではない人がいればOK（true）になります
            return rBusho && rBusho.status !== 'unborn' && rBusho.status !== 'dead' && !rBusho.isDaimyo;
        });
        
        // もし条件に合うお供が誰もいなければ、イベントは起きません
        if (!hasRetainer) return false;

        return true;
    },
    
    execute: async function(game, context) {
        const candidate = game.bushos.find(b => b.courtRankIds && b.courtRankIds.includes(80));
        if (!candidate) return;

        const killerClanId = context.killerClanId;
        const deadShogunClanId = context.deadShogunClanId; // 滅亡した将軍家

        let targetClan = null;

        // ② 織田信長（1006001）の勢力判定
        const nobunaga = game.getBusho(1006001);
        if (nobunaga && nobunaga.isDaimyo && nobunaga.clan !== 0 && nobunaga.clan !== killerClanId) {
            // 条件１：今川義元（1004001）が死亡しているかチェックします
            const yoshimoto = game.getBusho(1004001);
            const isYoshimotoDead = yoshimoto && yoshimoto.status === 'dead';

            // 条件２：尾張国（地方ID: 23）のすべての城を所有しているかチェックします
            // まず尾張国の城をすべて集めて、そのすべてが織田家の持ち物か確認します
            const owariCastles = game.castles.filter(c => c.provinceId === 23);
            const ownsAllOwari = owariCastles.length > 0 && owariCastles.every(c => c.ownerClan === nobunaga.clan);

            // 条件３：美濃国（地方ID: 27）の城を1つ以上所有しているかチェックします
            // 日本中の城の中から、美濃国にあって、かつ織田家の持ち物である城が1つでもあるか確認します
            const hasMinoCastle = game.castles.some(c => c.provinceId === 27 && c.ownerClan === nobunaga.clan);

            // 上記の３つの条件をすべてクリアしていたら、将軍の逃げ込み先を織田家に決定します
            if (isYoshimotoDead && ownsAllOwari && hasMinoCastle) {
                targetClan = game.clans.find(c => c.id === nobunaga.clan);
            }
        }

        // ③ 元々の足利家との友好度・威信による判定
        if (!targetClan) {
            let bestClans = [];
            let maxSentiment = -1;

            game.clans.forEach(c => {
                if (c.id === 0 || c.id === killerClanId) return;
                // まだ生き残っているか（城を持っているか）確認します
                const hasCastle = game.castles.some(castle => castle.ownerClan === c.id);
                if (!hasCastle) return;

                const rel = game.diplomacyManager.getRelation(deadShogunClanId, c.id);
                const sentiment = rel ? rel.sentiment : 50;

                if (sentiment > maxSentiment) {
                    maxSentiment = sentiment;
                    bestClans = [c];
                } else if (sentiment === maxSentiment) {
                    bestClans.push(c);
                }
            });

            if (bestClans.length > 0) {
                // 威信が高い順、同じならIDが若い順に並べ替えます
                bestClans.sort((a, b) => {
                    if (b.daimyoPrestige !== a.daimyoPrestige) {
                        return b.daimyoPrestige - a.daimyoPrestige;
                    }
                    return a.id - b.id;
                });
                targetClan = bestClans[0];
            }
        }

        // ④ 候補となる大名家が存在しなければ、ここでイベントを終了します
        if (!targetClan) return;

        // 移動先の大名居城を取得します
        const targetDaimyo = game.bushos.find(b => b.clan === targetClan.id && b.isDaimyo);
        if (!targetDaimyo) return;
        const targetCastleId = targetDaimyo.castleId;

        // 【将軍候補の改名処理】
        // 「daimyo:」の改名予定を持っていれば、その名前に改名します
        if (candidate.nameChange && candidate.nameChange.includes('daimyo:')) {
            const changes = candidate.nameChange.split('/');
            for (const change of changes) {
                const parts = change.split(':');
                if (parts.length === 3 && parts[0].trim() === 'daimyo') {
                    const newNameParts = parts[1].trim().split('|');
                    candidate.familyName = newNameParts[0] || ""; 
                    candidate.givenName = newNameParts[1] || "";  
                    candidate.name = candidate.familyName + candidate.givenName;
                    
                    const newYomiParts = parts[2].trim().split('|');
                    candidate.familyYomi = newYomiParts[0] || ""; 
                    candidate.givenYomi = newYomiParts[1] || "";  
                    candidate.yomi = candidate.familyYomi + candidate.givenYomi;
                }
            }
        }

        // 庇護された時に大名用の顔画像があれば差し替えます！
        if (candidate.faceChange && candidate.faceChange.startsWith('daimyo:')) {
            const newFace = candidate.faceChange.split(':')[1].trim();
            if (newFace) {
                candidate.faceIcon = newFace;
            }
        }

        // 将軍候補を新しい大名家に移動させます
        candidate.belongKunishuId = 0;
        if (game.affiliationSystem) {
            // ★第4引数に「100」を渡して忠誠度を固定します
            game.affiliationSystem.joinClan(candidate, targetClan.id, targetCastleId, 100);
        } else {
            // 万が一システムがない時の安全策
            if (candidate.castleId > 0) {
                const oldCastle = game.getCastle(candidate.castleId);
                if (oldCastle) oldCastle.samuraiIds = oldCastle.samuraiIds.filter(sid => sid !== candidate.id);
            }
            candidate.clan = targetClan.id;
            candidate.castleId = targetCastleId;
            candidate.status = 'active';
            candidate.loyalty = 100;
            const newCandidateCastle = game.getCastle(targetCastleId);
            if (newCandidateCastle && !newCandidateCastle.samuraiIds.includes(candidate.id)) {
                newCandidateCastle.samuraiIds.push(candidate.id);
            }
        }

        // 【お供の移動処理】ここで直接リストを書かず、上で登録した「this.retainerIds」を使います！
        this.retainerIds.forEach(id => {
            const rBusho = game.getBusho(id);
            // 存在し、生きていて、大名ではない場合のみお供として移動します
            if (rBusho && rBusho.status !== 'unborn' && rBusho.status !== 'dead' && !rBusho.isDaimyo) {
                let wasCastellan = rBusho.isCastellan;
                let oldCastleId = rBusho.castleId;
                
                // バッジを剥奪します
                rBusho.isCastellan = false;
                rBusho.isGunshi = false;
                rBusho.belongKunishuId = 0;

                if (game.affiliationSystem) {
                    // ★第4引数に「100」を渡して忠誠度を固定します
                    game.affiliationSystem.joinClan(rBusho, targetClan.id, targetCastleId, 100);
                    // もし城主だったなら、古いお城の城主を更新します
                    if (wasCastellan && oldCastleId > 0) {
                        const oldCastle = game.getCastle(oldCastleId);
                        if (oldCastle) game.affiliationSystem.updateCastleLord(oldCastle);
                    }
                } else {
                    // 今いる城から抜きます
                    if (oldCastleId > 0) {
                        const oldCastle = game.getCastle(oldCastleId);
                        if (oldCastle) oldCastle.samuraiIds = oldCastle.samuraiIds.filter(sid => sid !== rBusho.id);
                    }
                    // 新しい城へ所属させます
                    rBusho.clan = targetClan.id;
                    rBusho.castleId = targetCastleId;
                    rBusho.status = 'active';
                    rBusho.loyalty = 100;
                    
                    const newCastle = game.getCastle(targetCastleId);
                    if (newCastle && !newCastle.samuraiIds.includes(rBusho.id)) {
                        newCastle.samuraiIds.push(rBusho.id);
                    }
                }
            }
        });

        // ログにお知らせを出力します
        const candidateName = candidate.name.replace('|', '');
        const msg = `${candidateName}は幕府再興のため、${targetClan.name}の庇護下に入りました。`;
        game.ui.log(`【イベント】${msg}`);
        await game.ui.showDialogAsync(msg, false, 0);

        // 将軍を庇護した大名家にボーナスを与えます
        const targetClanId = targetClan.id;
        
        // ①所属する武将の忠誠度を+5します（最大100まで）
        const clanBushos = game.bushos.filter(b => b.clan === targetClanId && b.status === 'active');
        clanBushos.forEach(b => {
            b.loyalty = Math.min(100, (b.loyalty || 0) + 5);
        });

        // ②所有する城の人口、兵士、金、兵糧、民忠をアップさせます（それぞれの上限を超えないように制限します）
        const clanCastles = game.castles.filter(c => c.ownerClan === targetClanId);
        clanCastles.forEach(c => {
            c.population = Math.min(999999, c.population + 2000);
            c.soldiers = Math.min(99999, c.soldiers + 1000);
            c.gold = Math.min(99999, c.gold + 1000);
            c.rice = Math.min(99999, c.rice + 2000);
            c.peoplesLoyalty = Math.min(c.maxPeoplesLoyalty || 100, c.peoplesLoyalty + 30);
        });

        // ③近江国、山城国に城を持つ勢力（友好勢力などを除く）との関係を敵対にします
        // まず「近江国」と「山城国」の地方IDを調べます
        const targetProvinces = game.provinces.filter(p => p.province === '近江国' || p.province === '山城国');
        const targetProvinceIds = targetProvinces.map(p => p.id);

        // 対象となる国にある城の持ち主（大名家ID）を、重複しないように集めます
        const enemyClanIds = new Set();
        game.castles.forEach(c => {
            // 城が対象の国にあり、空き城（0）ではなく、将軍を庇護した勢力自身でもない場合
            if (targetProvinceIds.includes(c.provinceId) && c.ownerClan !== 0 && c.ownerClan !== targetClanId) {
                enemyClanIds.add(c.ownerClan);
            }
        });

        // 見つかった勢力との関係をひとつずつチェックし、変更します
        if (game.diplomacyManager) {
            enemyClanIds.forEach(clanId => {
                const relation = game.diplomacyManager.getRelation(targetClanId, clanId);
                if (relation) {
                    // 元々「友好」「同盟」「支配」「従属」ではない場合のみ、敵対にします
                    if (!['友好', '同盟', '支配', '従属'].includes(relation.status)) {
                        // 状態を「敵対」にします
                        game.diplomacyManager.changeStatus(targetClanId, clanId, '敵対', 0);
                        // お互いの関係値を「0」まで下げます
                        const relA = game.diplomacyManager.getRelation(targetClanId, clanId);
                        const relB = game.diplomacyManager.getRelation(clanId, targetClanId);
                        if (relA) relA.sentiment = 0;
                        if (relB) relB.sentiment = 0;
                    }
                }
            });
        }

        // 派閥や画面を最新の状態に更新します
        if (game.factionSystem) {
            game.factionSystem.updateFactions();
        }
        if (game.ui) {
            game.ui.renderMap();
        }
    }
});

// ==========================================
// ★ 将軍入城イベント（予備イベント）
// ==========================================
window.GameEvents.push({
    id: "historical_shogun_setup", 
    timing: "startMonth_before",     
    isOneTime: false, // 条件を満たしている間は、何度でも（毎月）チェックします
    
    checkCondition: function(game) {
        // ★修正：すでに世界に「征夷大将軍（ID1）」がいるか、「すでに擁立イベントが終わったスタンプ」があるなら、入城イベントはもう起きません！
        const shogunExists = game.bushos.some(b => b.courtRankIds && b.courtRankIds.includes(1));
        if (shogunExists || (game.flags && game.flags['historical_shogun_coronation'])) return false;

        // 1. 将軍候補（ID80:左馬頭の官位を持つ武将）を世界中から探します
        const candidate = game.bushos.find(b => b.courtRankIds && b.courtRankIds.includes(80));
        
        // 将軍候補がいない、あるいはすでに大名（独立済み）なら、このイベントは必要ありません
        if (!candidate || candidate.isDaimyo || candidate.clan === 0) return false;

        // 2. その武将が所属している勢力が、二条城（ID26）の持ち主か確認します
        const nijo = game.getCastle(26);
        if (!nijo || nijo.ownerClan !== candidate.clan) return false;

        // 3. その勢力が「合計9城以上」支配している、力のある勢力か確認します
        const clanCastles = game.castles.filter(c => c.ownerClan === candidate.clan);
        if (clanCastles.length < 9) return false;

        // 4. ただし、その勢力が「プレイヤー」だった場合は、勝手に移動させないようにここで止めます
        if (candidate.clan === game.playerClanId) return false;

        // 5. まだ二条城にいない、または二条城の城主になっていない場合のみ、イベントを実行します
        if (candidate.castleId !== 26 || !candidate.isCastellan) {
            return true;
        }
        
        return false;
    },
    
    execute: async function(game) {
        // 1. 将軍候補を特定します
        const candidate = game.bushos.find(b => b.courtRankIds && b.courtRankIds.includes(80));
        if (!candidate) return;

        // 2. 二条城(26)に「元々の城主」がいれば、そのバッジを剥がします
        const oldLord = game.bushos.find(b => b.castleId === 26 && b.isCastellan && b.id !== candidate.id);
        if (oldLord) {
            oldLord.isCastellan = false;
        }

        // 3. 将軍候補を二条城（26）へお引越しさせます
        if (game.affiliationSystem) {
            game.affiliationSystem.moveCastle(candidate, 26);
        } else {
            candidate.castleId = 26;
        }

        // 4. 将軍候補を新しい城主に任命し、お城のデータも書き換えます
        candidate.isCastellan = true;
        const nijo = game.getCastle(26);
        if (nijo) {
            nijo.castellanId = candidate.id;
        }

        // ★追加：将軍を擁立した勢力を記録します（game.flagsに入れるだけで自動でセーブデータに保存されます）
        game.flags = game.flags || {};
        game.flags['shogun_sponsor_clan_id'] = candidate.clan;

        // 何が起きたか後でわかるように、履歴（ログ）にこっそり記録しておきます
        const name = candidate.name.replace('|', '');
        game.ui.log(`(将軍候補の${name}が、幕府再興のため二条城へ入城しました)`);
        
        // 画面の見た目をお引越し後の最新の状態に更新します
        if (game.ui) {
            game.ui.renderMap();
        }
    }
});

// ==========================================
// ★ 将軍就任イベント
// ==========================================
window.GameEvents.push({
    id: "historical_shogun_coronation", // イベントの固有の名前
    timing: "startMonth_before",        // 月初の処理前に発生します
    isOneTime: true,                    // 一度発生したら二度と起きません
    
    checkCondition: function(game) {
        // ① ID80（左馬頭）の官位を持つ武将（将軍候補）を探します
        const candidate = game.bushos.find(b => b.courtRankIds && b.courtRankIds.includes(80));
        if (!candidate) return false; // 見つからなければイベントは起きません

        // ② 将軍候補が大名であってはなりません
        if (candidate.isDaimyo) return false;

        // ③ 将軍候補がID26（二条城）の「城主」であるか確認します
        if (candidate.castleId !== 26 || !candidate.isCastellan) return false;
        const nijoCastle = game.getCastle(26);
        if (!nijoCastle || nijoCastle.castellanId !== candidate.id) return false;

        // ④ 擁立勢力（将軍候補が現在所属している大名家）の情報を集めます
        const sponsorClanId = candidate.clan;
        if (!sponsorClanId) return false;

        // ⑤ 擁立勢力がID90（槇島城）を所有しているか確認します
        const makishimaCastle = game.getCastle(90);
        if (!makishimaCastle || makishimaCastle.ownerClan !== sponsorClanId) return false;

        // ⑥ 擁立勢力の大名（殿様）が誰かを探します
        const sponsorDaimyo = game.bushos.find(b => b.clan === sponsorClanId && b.isDaimyo);
        if (!sponsorDaimyo) return false;

        // ⑦ 擁立勢力の大名の居城が、二条城（26）でも槇島城（90）でもないことを確認します
        if (sponsorDaimyo.castleId === 26 || sponsorDaimyo.castleId === 90) return false;

        // ⑧ 擁立勢力が「合計9城以上」所有しているか数えます（他に7城＋二条城＋槇島城＝9城）
        const sponsorCastles = game.castles.filter(c => c.ownerClan === sponsorClanId);
        if (sponsorCastles.length < 9) return false;

        // ⑨ 朝廷に「征夷大将軍（ID1）」の官位の空きがあるか確認します
        if (!game.courtRankSystem || !game.courtRankSystem.availableRanks.includes(1)) return false;

        // すべての条件をクリアしたら、イベント発生（true）の合図を出します！
        return true;
    },
    
    execute: async function(game) {
        // イベントが起きた時に実際に実行される魔法です
        
        const candidate = game.bushos.find(b => b.courtRankIds && b.courtRankIds.includes(80));
        if (!candidate) return;

        const sponsorClanId = candidate.clan;
        const sponsorClan = game.clans.find(c => c.id === sponsorClanId);
        const nijoCastle = game.getCastle(26);
        const makishimaCastle = game.getCastle(90);

        // --- 1. 新しい大名家（将軍家）を設立します ---
        const newClanId = Math.max(...game.clans.map(c => c.id)) + 1; // 一番大きいIDの次を使います
        const surname = candidate.name.includes('|') ? candidate.name.split('|')[0] : candidate.familyName || "足利";
        const newClanName = surname + "家";
        const newColor = "#f8b500"; // 黄金色にして特別感を出します
        
        const newClan = new Clan({
            id: newClanId,
            name: newClanName,
            leaderId: candidate.id,
            color: newColor,
            yomi: candidate.familyYomi || "",
            courtContribution: 0,
            courtTrust: 0
        });
        game.clans.push(newClan); // 世界に新しい大名家を誕生させます！

        // --- 2. 将軍候補を「大名」に出世させます ---
        candidate.clan = newClanId;
        candidate.isDaimyo = true;
        candidate.isCastellan = false; // 大名になるので城主のバッジは外します
        if (game.affiliationSystem) {
            game.affiliationSystem.resetFactionData(candidate); // 派閥を一度リセットします
        }

        // --- 3. 二条城と槇島城の整理と、持ち主の変更 ---
        
        // 擁立勢力の大名が今いるお城（引越し先）を特定します
        const sponsorDaimyo = game.bushos.find(b => b.clan === sponsorClanId && b.isDaimyo);
        const destinationCastleId = sponsorDaimyo.castleId;

        // 二条城(26)と槇島城(90)にいる「擁立勢力の武将（将軍候補以外）」を全員、大名の元へ送ります
        [26, 90].forEach(castleId => {
            const residents = game.bushos.filter(b => b.castleId === castleId && b.clan === sponsorClanId && b.id !== candidate.id);
            residents.forEach(b => {
                b.isCastellan = false; // 城主バッジを剥がします
                if (game.affiliationSystem) {
                    game.affiliationSystem.moveCastle(b, destinationCastleId);
                } else {
                    b.castleId = destinationCastleId;
                }
            });
        });

        // お城の持ち主を新しい将軍家に変えます
        if (game.castleManager) {
            // ★修正：第3引数に「true」を渡して、イベントによる変更であることを教えます
            game.castleManager.changeOwner(nijoCastle, newClanId, true);
            game.castleManager.changeOwner(makishimaCastle, newClanId, true);
        } else {
            nijoCastle.ownerClan = newClanId;
            makishimaCastle.ownerClan = newClanId;
        }

        // 将軍が二条城の城主として座るように設定します
        candidate.isCastellan = true;
        nijoCastle.castellanId = candidate.id;

        // --- 4. 官位の変更（左馬頭を返して、征夷大将軍をもらいます） ---
        candidate.courtRankIds = candidate.courtRankIds.filter(id => id !== 80); // 左馬頭を削除
        if (game.courtRankSystem) {
            game.courtRankSystem.returnRank(80); // 朝廷に返す
            game.courtRankSystem.grantRank(candidate, 1); // 征夷大将軍をもらう
        } else {
            candidate.courtRankIds.push(1); // 万が一システムがない時の安全策
        }

        // --- 5. 擁立勢力と将軍家を「同盟」にして、関係値を100にします ---
        if (game.diplomacyManager) {
            game.diplomacyManager.changeStatus(sponsorClanId, newClanId, '同盟', 0);
            
            const relA = game.diplomacyManager.getRelation(sponsorClanId, newClanId);
            if (relA) relA.sentiment = 100;
            
            const relB = game.diplomacyManager.getRelation(newClanId, sponsorClanId);
            if (relB) relB.sentiment = 100;
        } else {
            if (!sponsorClan.diplomacyValue) sponsorClan.diplomacyValue = {};
            sponsorClan.diplomacyValue[newClanId] = { status: '同盟', sentiment: 100, trucePeriod: 0, isMarriage: false };
            newClan.diplomacyValue[sponsorClanId] = { status: '同盟', sentiment: 100, trucePeriod: 0, isMarriage: false };
        }

        // --- 6. 指定された武将たちを、配下として将軍家に移動させます ---
        const followers = [];
        game.bushos.forEach(b => {
            // IDが 1017000 ～ 1017999 の範囲であること
            if (b.id >= 1017000 && b.id <= 1017999) {
                // 将軍とは一門関係ではないこと（お互いの家族リストに入っていないか確認）
                if (!b.familyIds.includes(candidate.id) && !candidate.familyIds.includes(b.id)) {
                    // 大名でも城主でもないこと
                    if (!b.isDaimyo && !b.isCastellan) {
                        // 活動中、または浪人であること
                        if (b.status === 'active' || b.status === 'ronin') {
                            followers.push(b); // 条件をすべて満たしたらリストに入れます
                        }
                    }
                }
            }
        });

        // リストに入った武将を将軍家のお引越しセンターで移動させます
        followers.forEach(b => {
            if (game.affiliationSystem) {
                // ★追加：第4引数に「100」を渡して、イベント専用の固定忠誠度にします
                game.affiliationSystem.joinClan(b, newClanId, 26, 100); 
            } else {
                b.clan = newClanId;
                b.castleId = 26;
                b.status = 'active';
                b.loyalty = 100; // ★システムがない場合の安全策
            }
        });

        // --- 7. 槇島城の城主を、相性が一番近い配下から選びます ---
        if (followers.length > 0) {
            let bestFollower = null;
            let minDiff = 100;
            
            // 全員と将軍の相性の差を計算して、一番差が小さい人を見つけます
            followers.forEach(b => {
                const absDiff = Math.abs(candidate.affinity - b.affinity);
                const diff = Math.min(absDiff, 100 - absDiff); // 円環（0と100が繋がっている）の計算です
                if (diff < minDiff) {
                    minDiff = diff;
                    bestFollower = b;
                }
            });

            // 一番相性が近い人を槇島城に送って、城主に任命します
            if (bestFollower) {
                if (game.affiliationSystem) {
                    game.affiliationSystem.moveCastle(bestFollower, 90);
                } else {
                    bestFollower.castleId = 90;
                }
                // 城主のバッジを直接渡します
                bestFollower.isCastellan = true;
                makishimaCastle.castellanId = bestFollower.id;
            }
        } else {
            // 誰も配下がいなければ、槇島城は城主なし（空っぽ）になります
            makishimaCastle.castellanId = 0;
            if (game.affiliationSystem) {
                game.affiliationSystem.updateCastleLord(makishimaCastle);
            }
        }

        // --- 8. 二条城・槇島城、および将軍擁立勢力へのボーナス処理 ---
        if (nijoCastle) {
            if (nijoCastle.soldiers < 5000) nijoCastle.soldiers = 5000;
            if (nijoCastle.gold < 5000) nijoCastle.gold = 5000;
            if (nijoCastle.rice < 10000) nijoCastle.rice = 10000;
            if (nijoCastle.population < 100000) nijoCastle.population = 100000;
            nijoCastle.training = 100;
            nijoCastle.morale = 100;
            nijoCastle.peoplesLoyalty = nijoCastle.maxPeoplesLoyalty || 100;
            nijoCastle.defense = nijoCastle.maxDefense || 1000;
        }

        if (makishimaCastle) {
            if (makishimaCastle.soldiers < 3000) makishimaCastle.soldiers = 3000;
            if (makishimaCastle.gold < 3000) makishimaCastle.gold = 3000;
            if (makishimaCastle.rice < 8000) makishimaCastle.rice = 8000;
            if (makishimaCastle.population < 100000) makishimaCastle.population = 100000;
            makishimaCastle.training = 100;
            makishimaCastle.morale = 100;
            makishimaCastle.peoplesLoyalty = makishimaCastle.maxPeoplesLoyalty || 100;
            makishimaCastle.defense = makishimaCastle.maxDefense || 1000;
        }

        // 将軍擁立勢力のすべての拠点にボーナスを与えます
        const sponsorCastles = game.castles.filter(c => c.ownerClan === sponsorClanId);
        sponsorCastles.forEach(c => {
            c.soldiers = Math.min(99999, c.soldiers + 1000);
            c.gold = Math.min(99999, c.gold + 1000);
            c.population = Math.min(999999, c.population + 3000);
            c.rice = Math.min(99999, c.rice + 3000);
        });

        // 将軍擁立勢力に所属するすべての武将の忠誠度を上げます
        const sponsorBushos = game.bushos.filter(b => b.clan === sponsorClanId && b.status === 'active');
        sponsorBushos.forEach(b => {
            b.loyalty = Math.min(100, (b.loyalty || 0) + 5);
        });

        // ★追加：将軍家と他勢力との友好度アップ処理
        // 三好長逸（ID: 1020006）の大名家を探します
        const nagayasu = game.getBusho(1020006);
        let nagayasuClanId = 0;
        if (nagayasu && nagayasu.isDaimyo && nagayasu.clan !== 0) {
            nagayasuClanId = nagayasu.clan;
        }

        if (game.diplomacyManager) {
            game.clans.forEach(otherClan => {
                // 誰もいない勢力、将軍家自身、将軍擁立家、三好長逸家は除外します
                if (otherClan.id === 0 || otherClan.id === newClanId || otherClan.id === sponsorClanId || otherClan.id === nagayasuClanId) {
                    return;
                }

                let sentimentIncrease = 10; // 基本のアップ量

                // 条件1: 将軍擁立家との友好度が70以上、または同盟・支配・従属関係か確認します
                const relWithSponsor = game.diplomacyManager.getRelation(sponsorClanId, otherClan.id);
                let condition1 = false;
                if (relWithSponsor) {
                    if (relWithSponsor.sentiment >= 70 || ['同盟', '支配', '従属'].includes(relWithSponsor.status)) {
                        condition1 = true;
                    }
                }

                // 条件2: 三好長逸家と敵対関係か確認します
                let condition2 = false;
                if (nagayasuClanId !== 0) {
                    const relWithNagayasu = game.diplomacyManager.getRelation(nagayasuClanId, otherClan.id);
                    if (relWithNagayasu && relWithNagayasu.status === '敵対') {
                        condition2 = true;
                    }
                }

                // どちらかの条件を満たしていれば20アップにします
                if (condition1 || condition2) {
                    sentimentIncrease = 20;
                }

                // 外交システムを使って、将軍家と他勢力の友好度をアップさせます
                game.diplomacyManager.updateSentiment(newClanId, otherClan.id, sentimentIncrease);
            });

            // ★追加：将軍家と三好長逸家との友好度ダウン処理
            if (nagayasuClanId !== 0) {
                game.diplomacyManager.updateSentiment(newClanId, nagayasuClanId, -20);
            }
        }

        // --- 9. 最後に画面を新しく描き直して、メッセージを表示します ---
        if (game.factionSystem) {
            game.factionSystem.updateFactions();
        }

        // ★追加：城の持ち主が変わったので、システムに大名家の「威信」を再計算してもらいます
        if (typeof game.updateAllClanPrestige === 'function') {
            game.updateAllClanPrestige();
        }

        if (game.ui) {
            game.ui.renderMap();
            game.ui.updatePanelHeader();
        }

        const candidateName = candidate.name.replace('|', '');
        const sponsorName = sponsorClan.name;
        
        await game.ui.showDialogAsync(`${candidateName}が征夷大将軍に就任しました！\n${sponsorName}と${newClanName}は固い同盟で結ばれました。`, false, 0);
    }
});

// ==========================================
// ★ 松永久秀独立イベント
// ==========================================
window.GameEvents.push({
    id: "historical_hisahide_independence",
    timing: "endMonth_before", // 月末の独立チェックなどが始まる前に起こします
    isOneTime: true,
    
    checkCondition: function(game) {
        // 1. 三好長慶（ID: 1020001）が死亡しているか確認します
        const nagayoshi = game.getBusho(1020001);
        if (!nagayoshi || nagayoshi.status !== 'dead') return false;

        // 2. 三好義継（ID: 1020033）が大名であるか確認します
        const yoshitsugu = game.getBusho(1020033);
        if (!yoshitsugu || !yoshitsugu.isDaimyo || yoshitsugu.clan === 0) return false;

        // 3. 松永長頼（ID: 1901002）が死亡しているか確認します
        const nagayori = game.getBusho(1901002);
        if (!nagayori || nagayori.status !== 'dead') return false;

        // 4. 松永久秀（ID: 1901001）が存在し、大名ではないことを確認します
        const hisahide = game.getBusho(1901001);
        if (!hisahide || hisahide.isDaimyo) return false;

        // 5. 松永久秀が義継と同じ三好家に所属し、城主であるか確認します
        if (hisahide.clan !== yoshitsugu.clan || !hisahide.isCastellan) return false;

        // 全ての条件を満たしたらイベント発生です！
        return true;
    },
    
    execute: async function(game) {
        const yoshitsugu = game.getBusho(1020033);
        const hisahide = game.getBusho(1901001);
        const castle = game.getCastle(hisahide.castleId);

        if (!castle) return;

        // 独立システムを呼び出して、強制的に独立を実行します
        if (game.independenceSystem) {
            // 第4引数に 'indep' を渡すことで、純粋な「独立」として処理させます
            await game.independenceSystem.executeRebellion(castle, hisahide, yoshitsugu, 'indep');
        }
    }
});

// ==========================================
// ★ 三好三人衆による三好義継追放イベント
// ==========================================
window.GameEvents.push({
    id: "historical_yoshitsugu_exile",
    timing: "startMonth_before", // 月初の処理前に発生します
    isOneTime: true,             // 一度きりの歴史イベントです
    
    checkCondition: function(game) {
        // 1. 三好長慶（ID: 1020001）が死亡しているか確認します
        const nagayoshi = game.getBusho(1020001);
        if (!nagayoshi || nagayoshi.status !== 'dead') return false;

        // 2. 三好義継（ID: 1020033）が大名であるか確認します
        const yoshitsugu = game.getBusho(1020033);
        if (!yoshitsugu || !yoshitsugu.isDaimyo || yoshitsugu.clan === 0) return false;

        // 3. 松永久秀（ID: 1901001）が大名であるか確認します
        const hisahide = game.getBusho(1901001);
        if (!hisahide || !hisahide.isDaimyo || hisahide.clan === 0) return false;

        // 4. 三好家に三好三人衆（長逸、政生、岩成友通）が所属しているか確認します
        const trioIds = [1020006, 1020007, 1020008];
        const miyoshiClanId = yoshitsugu.clan;
        for (let id of trioIds) {
            const member = game.getBusho(id);
            if (!member || member.status !== 'active' || member.clan !== miyoshiClanId) {
                return false;
            }
        }

        // 5. 三好家と松永家が「敵対」状態であるか確認します
        const rel = game.diplomacyManager ? game.diplomacyManager.getRelation(miyoshiClanId, hisahide.clan) : null;
        if (!rel || rel.status !== '敵対') return false;

        // すべての条件を満たしたらイベント発生です！
        return true;
    },
    
    execute: async function(game) {
        const yoshitsugu = game.getBusho(1020033);
        const hisahide = game.getBusho(1901001);
        const nagayasu = game.getBusho(1020006);
        const miyoshiClanId = yoshitsugu.clan;

        // ① 三好長逸を新しい大名（殿様）にします
        const miyoshiClan = game.clans.find(c => c.id === miyoshiClanId);
        if (miyoshiClan) {
            miyoshiClan.leaderId = nagayasu.id;
        }
        
        // 義継から大名バッジを外します
        yoshitsugu.isDaimyo = false;
        
        // 長逸に大名バッジをつけます（もし軍師だった場合はバッジを外します）
        nagayasu.isDaimyo = true;
        nagayasu.isGunshi = false;

        // ② 三好長逸を、今いるお城の城主にします
        const nagayasuCastle = game.getCastle(nagayasu.castleId);
        if (nagayasuCastle) {
            // 元々いた城主のバッジを外します
            const oldCastellan = game.getBusho(nagayasuCastle.castellanId);
            if (oldCastellan && oldCastellan.id !== nagayasu.id) {
                oldCastellan.isCastellan = false;
            }
            nagayasu.isCastellan = true;
            nagayasuCastle.castellanId = nagayasu.id;
            
            // システムにお城の持ち主が変わったことを伝えます
            game.affiliationSystem.updateCastleLord(nagayasuCastle);
        }

        // ③ 三好義継の貢献度（功績）を0にします
        yoshitsugu.achievementTotal = 0;

        // ④ 三好義継を松永家に保護させ、忠誠度を100にする
        // お引越しセンターの魔法（joinClan）を使って、古いお城から出して新しいお城に入れます
        game.affiliationSystem.joinClan(yoshitsugu, hisahide.clan, hisahide.castleId, 100);

        // ★追加：三好長逸家所属の拠点と武将へのペナルティ処理
        // お城の人口・兵士・民忠を減らします
        const miyoshiCastles = game.castles.filter(c => c.ownerClan === miyoshiClanId);
        miyoshiCastles.forEach(c => {
            c.population = Math.floor(c.population * 0.8); // 人口20%減少（残りが80%）
            c.soldiers = Math.floor(c.soldiers * 0.7);     // 兵士30%減少（残りが70%）
            c.peoplesLoyalty = Math.floor((c.peoplesLoyalty || 0) * 0.7); // 民忠30%減少（残りが70%）
        });

        // 対象以外の武将の忠誠度を減らします
        const trioList = [1020006, 1020007, 1020008]; // 三好三人衆の出席番号リスト
        const miyoshiBushos = game.bushos.filter(b => b.clan === miyoshiClanId && b.status === 'active');
        miyoshiBushos.forEach(b => {
            // 三好三人衆ではなく、かつ、池田・荒木関連（1902001～1902999）でもない場合
            if (!trioList.includes(b.id) && !(b.id >= 1902001 && b.id <= 1902999)) {
                b.loyalty = Math.max(0, (b.loyalty || 0) - 10); // 忠誠度を10下げます（0より下にはならないようにします）
            }
        });

        // ⑤ 画面にメッセージを出してお知らせします
        game.ui.log(`【イベント】三好当主・三好義継が出奔し、松永久秀の元へ逃れました。`);
        await game.ui.showDialogAsync(`三好義継が悪逆無道の三好三人衆に愛想をつかし、三好家の忠臣・松永久秀の元へ逃れました。三好家は三好長逸が新たな当主となります。`, false, 0);

        // ⑥ 派閥や画面を最新の状態に更新します
        if (game.factionSystem) {
            game.factionSystem.updateFactions();
        }
        if (typeof game.updateAllClanPrestige === 'function') {
            game.updateAllClanPrestige();
        }
        if (game.ui) {
            game.ui.renderMap();
            game.ui.updatePanelHeader();
        }
    }
});

// ==========================================
// ★ 松永久秀臣従イベント
// ==========================================
window.GameEvents.push({
    id: "historical_hisahide_submission",
    timing: "startMonth_before", 
    isOneTime: true,             
    
    checkCondition: function(game) {
        // 1. 将軍候補（ID80:左馬頭）または将軍家（ID1:征夷大将軍）と、その擁立勢力を特定します
        let sponsorClanId = 0;
        let shogunClanId = 0;

        const candidate = game.bushos.find(b => b.courtRankIds && b.courtRankIds.includes(80));
        const shogun = game.bushos.find(b => b.courtRankIds && b.courtRankIds.includes(1));

        if (candidate && candidate.clan !== 0) {
            sponsorClanId = candidate.clan;
        } else if (shogun && shogun.isDaimyo && shogun.clan !== 0) {
            shogunClanId = shogun.clan;
            // 入城イベントで記録した擁立勢力を取得します
            if (game.flags && game.flags['shogun_sponsor_clan_id']) {
                sponsorClanId = game.flags['shogun_sponsor_clan_id'];
                // 将軍家と擁立勢力が同盟しているか確認します
                const rel = game.diplomacyManager ? game.diplomacyManager.getRelation(sponsorClanId, shogunClanId) : null;
                if (!rel || rel.status !== '同盟') {
                    return false;
                }
            } else {
                return false;
            }
        } else {
            return false; // どちらもいなければイベントは起きません
        }

        // 2. 三好長逸（ID: 1020006）が大名であるか確認します
        const nagayasu = game.getBusho(1020006);
        if (!nagayasu || !nagayasu.isDaimyo) return false;

        // 3. 松永久秀（ID: 1901001）が大名であるか確認します
        const hisahide = game.getBusho(1901001);
        if (!hisahide || !hisahide.isDaimyo) return false;
        const matsunagaClanId = hisahide.clan;

        // ストッパー：松永家がすでに将軍を擁立している家だった場合は中止します
        if (matsunagaClanId === sponsorClanId || (shogunClanId !== 0 && matsunagaClanId === shogunClanId)) return false;

        // 4. 三好義継（ID: 1020033）が松永家に所属しているか確認します
        const yoshitsugu = game.getBusho(1020033);
        if (!yoshitsugu || yoshitsugu.clan !== matsunagaClanId) return false;

        // 5. 将軍擁立勢力または将軍家の領地と、松永家の領地が隣接しているか確認します
        const matsunagaCastles = game.castles.filter(c => c.ownerClan === matsunagaClanId);
        let isAdjacent = false;

        // まず擁立勢力の城と繋がっているか調べます
        const sponsorCastles = game.castles.filter(c => c.ownerClan === sponsorClanId);
        for (let sc of sponsorCastles) {
            for (let mc of matsunagaCastles) {
                if (GameSystem.isAdjacent(sc, mc)) {
                    isAdjacent = true;
                    break;
                }
            }
            if (isAdjacent) break;
        }

        // 擁立勢力と繋がっておらず、将軍家が存在する場合は、将軍家の城とも隣接判定します
        if (!isAdjacent && shogunClanId !== 0) {
            const shogunCastles = game.castles.filter(c => c.ownerClan === shogunClanId);
            for (let sc of shogunCastles) {
                for (let mc of matsunagaCastles) {
                    if (GameSystem.isAdjacent(sc, mc)) {
                        isAdjacent = true;
                        break;
                    }
                }
                if (isAdjacent) break;
            }
        }

        if (!isAdjacent) return false;

        return true;
    },
    
    execute: async function(game) {
        const hisahide = game.getBusho(1901001);
        const matsunagaClanId = hisahide.clan;
        const matsunagaClan = game.clans.find(c => c.id === matsunagaClanId);
        
        let sponsorClanId = 0;
        let candidateName = "将軍";

        const candidate = game.bushos.find(b => b.courtRankIds && b.courtRankIds.includes(80));
        const shogun = game.bushos.find(b => b.courtRankIds && b.courtRankIds.includes(1));

        if (candidate && candidate.clan !== 0) {
            sponsorClanId = candidate.clan;
            candidateName = candidate.name.replace('|', '');
        } else if (shogun && game.flags && game.flags['shogun_sponsor_clan_id']) {
            sponsorClanId = game.flags['shogun_sponsor_clan_id'];
            candidateName = shogun.name.replace('|', '');
        }
        
        const sponsorClan = game.clans.find(c => c.id === sponsorClanId);
        
        // 全て変数から名前を取るように徹底しました
        const hisahideName = hisahide.name.replace('|', '');
        const sponsorName = sponsorClan ? sponsorClan.name : "擁立勢力";
        const matsunagaClanName = matsunagaClan ? matsunagaClan.name : "松永家";
        const hisahideCastle = game.getCastle(hisahide.castleId);
        const hisahideCastleName = hisahideCastle ? hisahideCastle.name : "居城";

        // ① 城の所有権を移す処理（内部処理）
        const matsunagaCastles = game.castles.filter(c => c.ownerClan === matsunagaClanId);
        matsunagaCastles.forEach(castle => {
            game.castleManager.changeOwner(castle, sponsorClanId, true);
        });

        // ② 武将を全員合流させる処理（内部処理）
        const matsunagaBushos = game.bushos.filter(b => b.clan === matsunagaClanId && b.status === 'active');
        matsunagaBushos.forEach(busho => {
            game.affiliationSystem.joinClan(busho, sponsorClanId, busho.castleId, 100);
        });

        // ③ 松永久秀を改めて城主に任命する処理
        // 信貴山城（ID: 39）が元々松永家のものだった場合、松永久秀を信貴山城へお引越しさせます
        const shigisanCastle = matsunagaCastles.find(c => c.id === 39);
        let targetCastle = hisahideCastle;
        
        if (shigisanCastle) {
            targetCastle = shigisanCastle;
            if (hisahide.castleId !== 39) {
                if (game.affiliationSystem) {
                    game.affiliationSystem.moveCastle(hisahide, 39);
                } else {
                    hisahide.castleId = 39;
                }
            }
        }
        
        // 城主のバッジを渡します
        hisahide.isCastellan = true;
        if (targetCastle) {
            targetCastle.castellanId = hisahide.id;
            if (game.affiliationSystem) {
                game.affiliationSystem.updateCastleLord(targetCastle);
            }
        }

        // 臣従先の勢力に軍団の空き（1〜8）があるか確認し、空きがあれば国主に任命します
        if (game.legions && targetCastle) {
            const sponsorLegions = game.legions.filter(l => l.clanId === sponsorClanId);
            const activeNos = sponsorLegions.filter(l => l.commanderId > 0).map(l => l.legionNo);
            
            let newLegionNo = -1;
            let emptyLegion = sponsorLegions.find(l => l.commanderId === 0);
            
            // 解散済みの軍団があればそれを再利用します
            if (emptyLegion) {
                newLegionNo = emptyLegion.legionNo;
                emptyLegion.commanderId = hisahide.id;
            } else {
                // 無ければ1から8の間で空いている番号を探します
                for (let i = 1; i <= 8; i++) {
                    if (!activeNos.includes(i)) {
                        newLegionNo = i;
                        break;
                    }
                }
                // 空き番号が見つかったら、新しく軍団のデータを作ります
                if (newLegionNo !== -1) {
                    let maxLegionId = 0;
                    game.legions.forEach(l => { if (l.id > maxLegionId) maxLegionId = l.id; });
                    const newLegion = typeof Legion !== 'undefined' ? new Legion({
                        id: maxLegionId + 1,
                        clanId: sponsorClanId,
                        legionNo: newLegionNo,
                        commanderId: hisahide.id
                    }) : {
                        id: maxLegionId + 1,
                        clanId: sponsorClanId,
                        legionNo: newLegionNo,
                        commanderId: hisahide.id
                    };
                    game.legions.push(newLegion);
                }
            }
            
            // 松永久秀が国主になれた場合、居城をその軍団の所属にします
            if (newLegionNo !== -1) {
                hisahide.isCommander = true;
                if (hisahide.isGunshi) hisahide.isGunshi = false; // 軍師バッジは念のため外します
                targetCastle.legionId = newLegionNo;
                targetCastle.isDelegated = true; // AIに委任する状態にします
                
                // ★追加：国主になれた場合、元々の配下たちを久秀の城に集合させます
                matsunagaBushos.forEach(busho => {
                    if (busho.id !== hisahide.id && busho.castleId !== targetCastle.id) {
                        busho.isCastellan = false; // お引越しするので城主のバッジは外します
                        if (game.affiliationSystem) {
                            game.affiliationSystem.moveCastle(busho, targetCastle.id);
                        } else {
                            busho.castleId = targetCastle.id;
                        }
                    }
                });
            }
        }

        // ④ 勢力としては終了させる処理（内部処理）
        if (matsunagaClan) {
            matsunagaClan.extinctionNotified = true;
        }

        // ⑤ メッセージ表示
        const msg = `${hisahideName}が${sponsorName}の上洛に同調し臣従しました！`;
        
        game.ui.log(`【イベント】${msg}`);
        await game.ui.showDialogAsync(msg, false, 0);

        // ⑥ 各種更新処理
        game.factionSystem.updateFactions();
        if (typeof game.updateAllClanPrestige === 'function') game.updateAllClanPrestige();
        if (game.ui) {
            game.ui.renderMap();
            game.ui.updatePanelHeader();
        }
    }
});

// ==========================================
// ★ 荒木村重 池田家乗っ取りイベント
// ==========================================
window.GameEvents.push({
    id: "historical_araki_takeover",
    timing: "startMonth_before", 
    isOneTime: true,             
    
    checkCondition: function(game) {
        // 1. 池田長正（ID: 1902001）が死亡しているか確認します
        const nagamasa = game.getBusho(1902001);
        if (nagamasa && nagamasa.status !== 'dead') return false;

        // 2. 三好長逸（ID: 1020006）が大名であるか確認します
        const nagayasu = game.getBusho(1020006);
        if (!nagayasu || !nagayasu.isDaimyo) return false;
        
        // 3. 池田知正（ID: 1902003）が存在し、三好長逸の家に所属する城主または国主であるか確認します
        const tomomasa = game.getBusho(1902003);
        if (!tomomasa || tomomasa.clan !== nagayasu.clan) return false;
        if (!tomomasa.isCastellan && !tomomasa.isCommander) return false;

        // 4. 池田知正の居城が伊丹城（ID: 51）であるか、または伊丹城が池田知正の軍団に所属しているか確認します
        const itamiCastle = game.getCastle(51);
        if (!itamiCastle || itamiCastle.ownerClan !== nagayasu.clan) return false;

        let isItamiInvolved = false;
        if (tomomasa.isCommander) {
            // 池田知正が国主の場合、伊丹城が知正の軍団に所属しているか
            if (itamiCastle.legionId === tomomasa.legionId) isItamiInvolved = true;
        } else {
            // 池田知正が城主の場合、知正の居城が伊丹城か
            if (tomomasa.castleId === 51) isItamiInvolved = true;
        }
        if (!isItamiInvolved) return false;

        // 5. 荒木村重（ID: 1902004）が存在し、三好家に所属しているか確認します
        const murashige = game.getBusho(1902004);
        if (!murashige || murashige.clan !== nagayasu.clan) return false;

        // 6. 荒木村重が池田知正と同じ場所にいるか確認します
        if (tomomasa.isCommander) {
            // 池田知正が国主の場合、同じ軍団に所属しているか
            if (murashige.legionId !== tomomasa.legionId) return false;
        } else {
            // 池田知正が城主の場合、同じ城にいるか
            if (murashige.castleId !== tomomasa.castleId) return false;
        }

        return true; 
    },
    
    execute: async function(game) {
        const tomomasa = game.getBusho(1902003);
        const murashige = game.getBusho(1902004);
        const itamiCastle = game.getCastle(51);

        if (!tomomasa || !murashige || !itamiCastle) return;

        // 強襲前の城の名前を覚えておきます
        const castleNameBefore = itamiCastle.name;
        const isCommander = tomomasa.isCommander;
        let legionToTakeover = null;

        if (isCommander && game.legions) {
            legionToTakeover = game.legions.find(l => l.clanId === tomomasa.clan && l.commanderId === tomomasa.id);
        }

        // 1. 荒木村重を伊丹城（ID: 51）へ移動させます
        if (murashige.castleId !== 51) {
            if (game.affiliationSystem) {
                game.affiliationSystem.moveCastle(murashige, 51);
            } else {
                murashige.castleId = 51;
            }
        }

        // 2. 池田知正の役職を外し、荒木村重を新城主に据えます
        // 知正が以前いたお城の城主データを解除します
        const oldCastle = game.getCastle(tomomasa.castleId);
        if (oldCastle && oldCastle.castellanId === tomomasa.id) {
            oldCastle.castellanId = 0;
        }

        tomomasa.isCastellan = false;
        tomomasa.isCommander = false;

        murashige.isCastellan = true;
        itamiCastle.castellanId = murashige.id;
        if (game.affiliationSystem) {
            game.affiliationSystem.updateCastleLord(itamiCastle);
        }

        // 国主だった場合は軍団を引き継ぎます
        if (isCommander && legionToTakeover) {
            murashige.isCommander = true;
            legionToTakeover.commanderId = murashige.id;
        }

        // 功績の調整
        tomomasa.achievementTotal = 0;
        if ((murashige.achievementTotal || 0) < 700) {
            murashige.achievementTotal = 700;
        }

        // 3. 伊丹城の防御力強化と改名
        if ((itamiCastle.maxDefense || 0) < 1000) itamiCastle.maxDefense = 1000;
        if ((itamiCastle.defense || 0) < 1000) itamiCastle.defense = 1000;

        let isRenamed = false;
        if (itamiCastle.name === "伊丹城") {
            itamiCastle.name = "有岡城";
            itamiCastle.yomi = "ありおかじょう";
            isRenamed = true;
        }

        // 4. メッセージの表示（個別に表示）
        const murashigeName = murashige.name.replace('|', '');
        const tomomasaFamilyName = tomomasa.familyName || tomomasa.name.split('|')[0] || "池田";
        
        // メッセージ1：強襲と実権奪取
        const msg1 = `${murashigeName}が${castleNameBefore}を強襲し、${tomomasaFamilyName}家の実権を握りました！`;
        game.ui.log(`【イベント】荒木村重の池田家乗っ取り：${murashigeName}が${tomomasaFamilyName}家の実権を握りました。`);
        await game.ui.showDialogAsync(msg1, false, 0);

        // メッセージ2：大改修と改名
        if (isRenamed) {
            const msg2 = `${murashigeName}は伊丹城を自らの居城と定めて大改修を施し、有岡城と改称しました！`;
            await game.ui.showDialogAsync(msg2, false, 0);
        }

        if (game.factionSystem) {
            game.factionSystem.updateFactions();
        }
        if (game.ui) {
            game.ui.renderMap();
            game.ui.updatePanelHeader();
        }
    }
});

// ==========================================
// ★ 荒木村重臣従イベント
// ==========================================
window.GameEvents.push({
    id: "historical_murashige_submission",
    timing: "startMonth_before", 
    isOneTime: true,             
    
    checkCondition: function(game) {
        // 1. 将軍候補（ID80:左馬頭）または将軍家（ID1:征夷大将軍）と、その擁立勢力を特定します
        let sponsorClanId = 0;
        let shogunClanId = 0;

        const candidate = game.bushos.find(b => b.courtRankIds && b.courtRankIds.includes(80));
        const shogun = game.bushos.find(b => b.courtRankIds && b.courtRankIds.includes(1));

        if (candidate && candidate.clan !== 0) {
            sponsorClanId = candidate.clan;
        } else if (shogun && shogun.isDaimyo && shogun.clan !== 0) {
            shogunClanId = shogun.clan;
            // 入城イベントで記録した擁立勢力を取得します
            if (game.flags && game.flags['shogun_sponsor_clan_id']) {
                sponsorClanId = game.flags['shogun_sponsor_clan_id'];
                // 将軍家と擁立勢力が同盟しているか確認します
                const rel = game.diplomacyManager ? game.diplomacyManager.getRelation(sponsorClanId, shogunClanId) : null;
                if (!rel || rel.status !== '同盟') {
                    return false;
                }
            } else {
                return false;
            }
        } else {
            return false; // どちらもいなければイベントは起きません
        }

        // 2. 三好長逸（ID: 1020006）が大名であるか確認します
        const nagayasu = game.getBusho(1020006);
        if (!nagayasu || !nagayasu.isDaimyo) return false;
        const miyoshiClanId = nagayasu.clan;

        // ストッパー：三好家自身が将軍を擁立している家だった場合は中止します
        if (miyoshiClanId === sponsorClanId || (shogunClanId !== 0 && miyoshiClanId === shogunClanId)) return false;

        // 3. 荒木村重（ID: 1902004）が、三好家の城主または国主であるか確認します
        const murashige = game.getBusho(1902004);
        let targetLord = null;
        let mainCastle = null;

        if (murashige && murashige.clan === miyoshiClanId && (murashige.isCastellan || murashige.isCommander)) {
            const c = game.getCastle(murashige.castleId);
            if (c && c.ownerClan === miyoshiClanId) {
                targetLord = murashige;
                mainCastle = c;
            }
        }
        if (!targetLord || !mainCastle) return false;

        // 対象となる城のリストを作ります（国主なら軍団の全城、城主ならその城のみ）
        let targetCastles = [];
        if (targetLord.isCommander && game.legions) {
            const legion = game.legions.find(l => l.clanId === miyoshiClanId && l.commanderId === targetLord.id);
            if (legion) {
                targetCastles = game.castles.filter(c => c.ownerClan === miyoshiClanId && c.legionId === legion.legionNo);
            }
        }
        if (targetCastles.length === 0) {
            targetCastles = [mainCastle];
        }

        // 4. 将軍擁立勢力と三好家が敵対しているか確認します
        const rel = game.diplomacyManager ? game.diplomacyManager.getRelation(sponsorClanId, miyoshiClanId) : null;
        if (!rel || rel.status !== '敵対') return false;

        // 5. 松永久秀（ID: 1901001）が将軍擁立勢力に所属しているか確認します
        const hisahide = game.getBusho(1901001);
        if (!hisahide || hisahide.clan !== sponsorClanId) return false;

        // 6. 対象の城のいずれかが、将軍擁立勢力または将軍家の城が隣接しているか確認します
        let isAdjacent = false;
        
        const sponsorCastles = game.castles.filter(c => c.ownerClan === sponsorClanId);
        const shogunCastles = shogunClanId !== 0 ? game.castles.filter(c => c.ownerClan === shogunClanId) : [];

        for (let targetC of targetCastles) {
            // まず擁立勢力の城と繋がっているか調べます
            for (let sc of sponsorCastles) {
                if (GameSystem.isAdjacent(sc, targetC)) {
                    isAdjacent = true;
                    break;
                }
            }
            if (isAdjacent) break;

            // 擁立勢力と繋がっておらず、将軍家が存在する場合は、将軍家の城とも隣接判定します
            if (shogunClanId !== 0) {
                for (let sc of shogunCastles) {
                    if (GameSystem.isAdjacent(sc, targetC)) {
                        isAdjacent = true;
                        break;
                    }
                }
            }
            if (isAdjacent) break;
        }

        if (!isAdjacent) return false;

        // すべての条件をクリアしたら、イベント発生です！
        return true;
    },
    
    execute: async function(game) {
        // メッセージや処理に必要な情報を集めます
        let sponsorClanId = 0;
        const candidate = game.bushos.find(b => b.courtRankIds && b.courtRankIds.includes(80));
        
        if (candidate && candidate.clan !== 0) {
            sponsorClanId = candidate.clan;
        } else if (game.flags && game.flags['shogun_sponsor_clan_id']) {
            sponsorClanId = game.flags['shogun_sponsor_clan_id'];
        }
        
        const sponsorClan = game.clans.find(c => c.id === sponsorClanId);
        const nagayasu = game.getBusho(1020006);
        const miyoshiClanId = nagayasu.clan;

        const murashige = game.getBusho(1902004);
        let targetLord = null;
        let mainCastle = null;

        if (murashige && murashige.clan === miyoshiClanId && (murashige.isCastellan || murashige.isCommander)) {
            const c = game.getCastle(murashige.castleId);
            if (c && c.ownerClan === miyoshiClanId) {
                targetLord = murashige;
                mainCastle = c;
            }
        }
        if (!targetLord || !mainCastle) return;

        let targetCastles = [];
        let legionToDismiss = null;
        if (targetLord.isCommander && game.legions) {
            legionToDismiss = game.legions.find(l => l.clanId === miyoshiClanId && l.commanderId === targetLord.id);
            if (legionToDismiss) {
                targetCastles = game.castles.filter(c => c.ownerClan === miyoshiClanId && c.legionId === legionToDismiss.legionNo);
            }
        }
        if (targetCastles.length === 0) {
            targetCastles = [mainCastle];
        }
        const targetCastleIds = targetCastles.map(c => c.id);

        const sponsorName = sponsorClan ? sponsorClan.name : "擁立勢力";
        const itamiLordName = targetLord.name.replace('|', '');
        const miyoshiClan = game.clans.find(c => c.id === miyoshiClanId);
        const miyoshiClanName = miyoshiClan ? miyoshiClan.name : "三好家";
        
        // 対象となる城の、元の城主（出席番号）をそれぞれ記録しておきます
        const originalCastellans = {};
        targetCastles.forEach(c => {
            originalCastellans[c.id] = c.castellanId;
        });

        // ① 三好家所属でIDが1902001～1902999の武将を全員集めます
        const targetBushos = game.bushos.filter(b => b.clan === miyoshiClanId && b.status === 'active' && b.id >= 1902001 && b.id <= 1902999);
        
        // その人たちのうち、対象の城以外にいる人を本城（mainCastle）に集めます
        targetBushos.forEach(busho => {
            if (!targetCastleIds.includes(busho.castleId)) {
                busho.isCastellan = false;
                busho.isGunshi = false;
                if (game.affiliationSystem) {
                    game.affiliationSystem.moveCastle(busho, mainCastle.id);
                } else {
                    busho.castleId = mainCastle.id;
                }
            }
        });

        // ② 対象の城にいる人で、今回は降伏しない人（対象ID以外）を長逸の居城へ逃がします
        targetCastles.forEach(castle => {
            const residents = game.bushos.filter(b => b.castleId === castle.id && b.status === 'active');
            residents.forEach(busho => {
                // IDの範囲外の人がいれば、お引越しさせます
                if (busho.id < 1902001 || busho.id > 1902999) {
                    busho.isCastellan = false; // 城を追い出されるので城主バッジは外れます
                    busho.isCommander = false;
                    if (game.affiliationSystem) {
                        game.affiliationSystem.moveCastle(busho, nagayasu.castleId);
                    } else {
                        busho.castleId = nagayasu.castleId;
                    }
                }
            });
        });

        // ③ 対象の城の持ち主の看板を「将軍擁立勢力」に掛け替えます
        targetCastles.forEach(castle => {
            castle.legionId = 0; // 軍団の所属を外して直轄に戻します
            if (game.castleManager) {
                game.castleManager.changeOwner(castle, sponsorClanId, true);
            } else {
                castle.ownerClan = sponsorClanId;
            }
        });

        // ④ 対象の城に集めた降伏組（対象IDの武将）を、将軍擁立勢力に所属変更させます
        targetBushos.forEach(busho => {
            if (game.affiliationSystem) {
                // 第4引数に「100」を渡すことで、忠誠度をピッタリ100にセットできます
                game.affiliationSystem.joinClan(busho, sponsorClanId, busho.castleId, 100);
            } else {
                busho.clan = sponsorClanId;
                busho.loyalty = 100;
            }
        });

        // ⑤ 国主だった場合の解任処理と軍団の解散処理をします
        if (targetLord.isCommander) {
            targetLord.isCommander = false;
            if (legionToDismiss) {
                legionToDismiss.commanderId = 0;
                legionToDismiss.objective = null;
                legionToDismiss.status = 'wait';
                legionToDismiss.targetId = 0;
                legionToDismiss.route = [];
            }
        }

        // ⑥ 降伏を主導した元の城主たちに、もう一度城主のバッジを付けてあげます
        const itamiCastle = targetCastles.find(c => c.id === 51);
        let murashigeNewCastle = null;

        targetCastles.forEach(castle => {
            const oldCastellanId = originalCastellans[castle.id];
            let newCastellan = game.getBusho(oldCastellanId);
            
            // 対象の城の中に伊丹城（ID: 51）がある場合、村重を強制的に伊丹城の城主にします
            if (itamiCastle) {
                if (castle.id === 51) {
                    // もし村重が別のお城にいたら、伊丹城へお引越しさせます
                    if (murashige.castleId !== 51) {
                        if (game.affiliationSystem) {
                            game.affiliationSystem.moveCastle(murashige, 51);
                        } else {
                            murashige.castleId = 51;
                        }
                    }
                    murashige.isCastellan = true;
                    castle.castellanId = murashige.id;
                    murashigeNewCastle = castle;
                    
                    if (game.affiliationSystem) {
                        game.affiliationSystem.updateCastleLord(castle);
                    }
                    return; // 伊丹城の処理はこれで終わりなので、次のお城へ進みます
                } else {
                    // 伊丹城がある場合、村重は他のお城の城主にはなれません
                    if (newCastellan && newCastellan.id === murashige.id) {
                        newCastellan = null;
                    }
                }
            }

            // 元の城主が降伏組なら、そのまま城主に復帰させます
            if (newCastellan && newCastellan.id >= 1902001 && newCastellan.id <= 1902999 && newCastellan.castleId === castle.id) {
                newCastellan.isCastellan = true;
                castle.castellanId = newCastellan.id;
                // もし村重が伊丹城以外の城主になった場合は、そのお城を記録しておきます
                if (newCastellan.id === murashige.id) {
                    murashigeNewCastle = castle;
                }
            } else {
                castle.castellanId = 0; // 誰もいなければ空っぽにしておきます
            }
            if (game.affiliationSystem) {
                game.affiliationSystem.updateCastleLord(castle);
            }
        });

        // 臣従先の勢力に軍団の空き（1〜8）があるか確認し、空きがあれば国主に任命します
        if (game.legions && murashigeNewCastle) {
            const sponsorLegions = game.legions.filter(l => l.clanId === sponsorClanId);
            const activeNos = sponsorLegions.filter(l => l.commanderId > 0).map(l => l.legionNo);
            
            let newLegionNo = -1;
            let emptyLegion = sponsorLegions.find(l => l.commanderId === 0);
            
            // 解散済みの軍団があればそれを再利用します
            if (emptyLegion) {
                newLegionNo = emptyLegion.legionNo;
                emptyLegion.commanderId = murashige.id;
            } else {
                // 無ければ1から8の間で空いている番号を探します
                for (let i = 1; i <= 8; i++) {
                    if (!activeNos.includes(i)) {
                        newLegionNo = i;
                        break;
                    }
                }
                // 空き番号が見つかったら、新しく軍団のデータを作ります
                if (newLegionNo !== -1) {
                    let maxLegionId = 0;
                    game.legions.forEach(l => { if (l.id > maxLegionId) maxLegionId = l.id; });
                    const newLegion = typeof Legion !== 'undefined' ? new Legion({
                        id: maxLegionId + 1,
                        clanId: sponsorClanId,
                        legionNo: newLegionNo,
                        commanderId: murashige.id
                    }) : {
                        id: maxLegionId + 1,
                        clanId: sponsorClanId,
                        legionNo: newLegionNo,
                        commanderId: murashige.id
                    };
                    game.legions.push(newLegion);
                }
            }
            
            // 荒木村重が国主になれた場合、居城をその軍団の所属にします
            if (newLegionNo !== -1) {
                murashige.isCommander = true;
                if (murashige.isGunshi) murashige.isGunshi = false; // 軍師バッジは念のため外します
                murashigeNewCastle.legionId = newLegionNo;
                murashigeNewCastle.isDelegated = true; // AIに委任する状態にします
                
                // ★追加：国主になれた場合、降伏した武将たちを村重の城に集合させます
                targetBushos.forEach(busho => {
                    if (busho.id !== murashige.id && busho.castleId !== murashigeNewCastle.id) {
                        busho.isCastellan = false; // お引越しするので城主のバッジは外します
                        if (game.affiliationSystem) {
                            game.affiliationSystem.moveCastle(busho, murashigeNewCastle.id);
                        } else {
                            busho.castleId = murashigeNewCastle.id;
                        }
                    }
                });
            }
        }

        // ⑦ 画面に何が起きたかメッセージを出してお知らせします
        const msg = `\n${miyoshiClanName}の${itamiLordName}が${sponsorName}の上洛に同調し臣従しました！`;
        
        game.ui.log(`【イベント】${msg}`);
        await game.ui.showDialogAsync(msg, false, 0);

        // ⑧ 最後に、画面の表示や派閥のデータを最新のものに更新します
        if (game.factionSystem) {
            game.factionSystem.updateFactions();
        }
        if (typeof game.updateAllClanPrestige === 'function') {
            game.updateAllClanPrestige();
        }
        if (game.ui) {
            game.ui.renderMap();
            game.ui.updatePanelHeader();
        }
    }
});

// ==========================================
// ★ 畠山家臣従イベント
// ==========================================
window.GameEvents.push({
    id: "historical_hatakeyama_submission",
    timing: "startMonth_before", 
    isOneTime: true,             
    
    checkCondition: function(game) {
        // 1. 畠山家の対象大名（高政、政頼、政尚）のいずれかが存在し、大名であるか確認します
        const targetDaimyoIds = [1041001, 1041002, 1041003];
        let hatakeyamaDaimyo = null;
        for (let id of targetDaimyoIds) {
            const busho = game.getBusho(id);
            if (busho && busho.isDaimyo && busho.clan !== 0) {
                hatakeyamaDaimyo = busho;
                break; // 見つかったら探すのをやめます
            }
        }
        // もし誰も大名じゃなかったらイベントは起きません
        if (!hatakeyamaDaimyo) return false;
        
        const hatakeyamaClanId = hatakeyamaDaimyo.clan;

        // 2. プレイヤーが畠山家を担当している場合はイベントを起こしません
        if (game.playerClanId === hatakeyamaClanId) return false;

        // 3. 将軍候補（ID80:左馬頭）または将軍家（ID1:征夷大将軍）と、その擁立勢力を特定します
        let sponsorClanId = 0;
        let shogunClanId = 0;

        const candidate = game.bushos.find(b => b.courtRankIds && b.courtRankIds.includes(80));
        const shogun = game.bushos.find(b => b.courtRankIds && b.courtRankIds.includes(1));

        if (candidate && candidate.clan !== 0) {
            sponsorClanId = candidate.clan;
        } else if (shogun && shogun.isDaimyo && shogun.clan !== 0) {
            shogunClanId = shogun.clan;
            // 入城イベントで記録した擁立勢力を取得します
            if (game.flags && game.flags['shogun_sponsor_clan_id']) {
                sponsorClanId = game.flags['shogun_sponsor_clan_id'];
                // 将軍家と擁立勢力が同盟しているか確認します
                const rel = game.diplomacyManager ? game.diplomacyManager.getRelation(sponsorClanId, shogunClanId) : null;
                if (!rel || rel.status !== '同盟') {
                    return false;
                }
            } else {
                return false;
            }
        } else {
            return false; // どちらもいなければイベントは起きません
        }

        // 万が一、畠山家自身が将軍を擁立していたら、自分自身に降伏することになってしまうので止めます
        if (hatakeyamaClanId === sponsorClanId || hatakeyamaClanId === shogunClanId) return false;

        // 4. 将軍擁立勢力または将軍家の領地と、畠山家の領地が隣接しているか確認します
        const hatakeyamaCastles = game.castles.filter(c => c.ownerClan === hatakeyamaClanId);
        let isAdjacent = false;

        // まず擁立勢力の城と繋がっているか調べます
        const sponsorCastles = game.castles.filter(c => c.ownerClan === sponsorClanId);
        for (let sc of sponsorCastles) {
            for (let hc of hatakeyamaCastles) {
                if (GameSystem.isAdjacent(sc, hc)) {
                    isAdjacent = true;
                    break;
                }
            }
            if (isAdjacent) break;
        }

        // 擁立勢力と繋がっておらず、将軍家が存在する場合は、将軍家の城とも隣接判定します
        if (!isAdjacent && shogunClanId !== 0) {
            const shogunCastles = game.castles.filter(c => c.ownerClan === shogunClanId);
            for (let sc of shogunCastles) {
                for (let hc of hatakeyamaCastles) {
                    if (GameSystem.isAdjacent(sc, hc)) {
                        isAdjacent = true;
                        break;
                    }
                }
                if (isAdjacent) break;
            }
        }

        if (!isAdjacent) return false;

        return true;
    },
    
    execute: async function(game) {
        // 対象の畠山大名をもう一度特定します
        const targetDaimyoIds = [1041001, 1041002, 1041003];
        let hatakeyamaDaimyo = null;
        for (let id of targetDaimyoIds) {
            const busho = game.getBusho(id);
            if (busho && busho.isDaimyo && busho.clan !== 0) {
                hatakeyamaDaimyo = busho;
                break;
            }
        }
        if (!hatakeyamaDaimyo) return;

        const hatakeyamaClanId = hatakeyamaDaimyo.clan;
        const hatakeyamaClan = game.clans.find(c => c.id === hatakeyamaClanId);
        
        let sponsorClanId = 0;
        let candidateName = "将軍";

        const candidate = game.bushos.find(b => b.courtRankIds && b.courtRankIds.includes(80));
        const shogun = game.bushos.find(b => b.courtRankIds && b.courtRankIds.includes(1));

        if (candidate && candidate.clan !== 0) {
            sponsorClanId = candidate.clan;
            candidateName = candidate.name.replace('|', '');
        } else if (shogun && game.flags && game.flags['shogun_sponsor_clan_id']) {
            sponsorClanId = game.flags['shogun_sponsor_clan_id'];
            candidateName = shogun.name.replace('|', '');
        }
        
        const sponsorClan = game.clans.find(c => c.id === sponsorClanId);
        
        // メッセージ用に名前を用意します
        const hatakeyamaName = hatakeyamaDaimyo.name.replace('|', '');
        const sponsorName = sponsorClan ? sponsorClan.name : "擁立勢力";
        const hatakeyamaClanName = hatakeyamaClan ? hatakeyamaClan.name : "畠山家";
        const hatakeyamaCastle = game.getCastle(hatakeyamaDaimyo.castleId);
        const hatakeyamaCastleName = hatakeyamaCastle ? hatakeyamaCastle.name : "居城";

        // ① 畠山家の城の所有権を、将軍擁立勢力に移します
        // 第3引数の「true」によって、平和的な引き渡しとなりバグを防ぎます
        const hatakeyamaCastles = game.castles.filter(c => c.ownerClan === hatakeyamaClanId);
        hatakeyamaCastles.forEach(castle => {
            game.castleManager.changeOwner(castle, sponsorClanId, true);
        });

        // ② 畠山家の武将を全員、将軍擁立勢力に合流させます
        // 第4引数の「100」によって、忠誠度がピッタリ100になります
        const hatakeyamaBushos = game.bushos.filter(b => b.clan === hatakeyamaClanId && b.status === 'active');
        hatakeyamaBushos.forEach(busho => {
            game.affiliationSystem.joinClan(busho, sponsorClanId, busho.castleId, 100);
        });

        // ③ 畠山大名を改めて城主に任命します（joinClanの中で大名や城主のバッジは一度外れているため）
        hatakeyamaDaimyo.isCastellan = true;
        if (hatakeyamaCastle) {
            hatakeyamaCastle.castellanId = hatakeyamaDaimyo.id;
            game.affiliationSystem.updateCastleLord(hatakeyamaCastle);
        }

        // ④ 畠山家という勢力自体を終了させます（滅亡フラグを立てます）
        if (hatakeyamaClan) {
            hatakeyamaClan.extinctionNotified = true;
        }

        // ⑤ 画面に何が起きたかメッセージを出してお知らせします
        const msg = `${hatakeyamaName}が${sponsorName}の上洛に同調し臣従しました！`;
        
        game.ui.log(`【イベント】${msg}`);
        await game.ui.showDialogAsync(msg, false, 0);

        // ⑥ 各種システムや画面の表示を最新のものに更新します
        if (game.factionSystem) {
            game.factionSystem.updateFactions();
        }
        if (typeof game.updateAllClanPrestige === 'function') {
            game.updateAllClanPrestige();
        }
        if (game.ui) {
            game.ui.renderMap();
            game.ui.updatePanelHeader();
        }
    }
});