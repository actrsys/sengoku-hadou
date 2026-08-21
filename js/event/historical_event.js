/**
 * historical_event.js
 * 歴史イベントを管理する専用のファイルです。
 * ここに史実に沿ったイベント（桶狭間の戦いなど）を追加していきます。
 * 各種更新処理はevent_manager.jsでイベント終了後に行っています
 */

window.GameEvents = window.GameEvents || [];

// ==========================================
// ★ イベント用の便利なチェック係（共通の魔法）
// ==========================================
window.EventCheck = {
    // 1. 将軍候補（左馬頭を持つ武将）を探して渡す魔法
    getCandidateBusho: function(game) {
        return game.bushos.find(b => b.courtRankIds && game.courtRankSystem.RANK_IDS_CANDIDATE.some(id => b.courtRankIds.includes(id)));
    },

    // 2. 将軍を探して渡す魔法
    getShogunBusho: function(game) {
        return game.bushos.find(b => b.courtRankIds && b.courtRankIds.includes(game.courtRankSystem.RANK_ID_SHOGUN));
    },

    // 3. 指定したIDの武将が存在して、「生きている（活動中か浪人）」か確認します
    isAlive: function(game, bushoId) {
        const busho = game.getBusho(bushoId);
        return busho ? (busho.status !== 'dead' && busho.status !== 'unborn') : false;
    },
    
    // 4. 指定したIDの武将が存在して、「死んでいる」か確認します
    isDead: function(game, bushoId) {
        const busho = game.getBusho(bushoId);
        return busho ? (busho.status === 'dead') : false;
    },
    
    // 5. 指定したIDの武将が存在して、「大名として活動しているか」確認します（はい/いいえ のみ）
    isDaimyo: function(game, bushoId) {
        const busho = game.getBusho(bushoId);
        return busho ? (this.isAlive(game, bushoId) && busho.isDaimyo && busho.clan !== 0) : false;
    },

    // 6. 「OR（または）」の動き：リストの中の「誰か一人」が大名なら、そのデータを渡します
    getDaimyo: function(game, bushoIds) {
        // もし1つの数字だけが渡されたら、探しやすいようにリストの形 [ ] に直します
        const ids = Array.isArray(bushoIds) ? bushoIds : [bushoIds];
        
        // リストの中身を順番に確認して、一番最初に見つかった大名を渡します
        for (let id of ids) {
            const busho = game.getBusho(id);
            if (busho && this.isAlive(game, id) && busho.isDaimyo && busho.clan !== 0) {
                return busho; // 見つかったら即座にそのデータを渡して終了！
            }
        }
        return null; // 誰も条件を満たさなければ空っぽ（null）を返します
    },

    // 7. 「AND（かつ）」の動き：リストの「全員」が大名として存在しているか確認します
    hasAllDaimyos: function(game, bushoIds) {
        const ids = Array.isArray(bushoIds) ? bushoIds : [bushoIds];
        // リストの「全員(every)」が、getDaimyoの条件をクリアできるかチェックします
        return ids.every(id => this.getDaimyo(game, id) !== null);
    },
    
    // 8. 「勢力同士の領地が隣接しているか」確認します
    areClansAdjacent: function(game, clanIdA, clanIdB) {
        const castlesA = game.getClanCastles(clanIdA);
        const castlesB = game.getClanCastles(clanIdB);
        
        // どちらかが城を持っていなければ隣接していません
        if (castlesA.length === 0 || castlesB.length === 0) return false;

        for (let ca of castlesA) {
            for (let cb of castlesB) {
                if (typeof GameSystem !== 'undefined' && GameSystem.isAdjacent(ca, cb)) {
                    return true;
                }
            }
        }
        return false;
    },

    // 9. 「指定した地方（国）の城を全て持っているか」確認します
    ownsAllCastlesInProvince: function(game, clanId, provinceId) {
        const provinceCastles = game.castles.filter(c => c.provinceId === provinceId);
        // その地方に城が無い場合は false を返します
        if (provinceCastles.length === 0) return false;
        // その地方の城の「全員(every)」が、指定の勢力のものかチェックします
        return provinceCastles.every(c => c.ownerClan === clanId);
    },
    
    // 10, 将軍（または将軍候補）と、それを擁立している勢力の情報をまとめて調べます
    getShogunInfo: function(game) {
        let sponsorClanId = 0;
        let shogunClanId = 0;
        let candidateName = "将軍";

        // 一元管理の魔法を呼び出すように変更します！
        const candidate = this.getCandidateBusho(game);
        const shogun = this.getShogunBusho(game);

        if (candidate && candidate.clan !== 0) {
            sponsorClanId = candidate.clan;
            candidateName = candidate.fullName;
        } else if (shogun && shogun.isDaimyo && shogun.clan !== 0) {
            shogunClanId = shogun.clan;
            // 擁立勢力を取得し、同盟が続いているか確認します
            if (game.flags && game.flags['shogun_sponsor_clan_id']) {
                sponsorClanId = game.flags['shogun_sponsor_clan_id'];
                const rel = game.diplomacyManager ? game.diplomacyManager.getRelation(sponsorClanId, shogunClanId) : null;
                if (!rel || rel.status !== '同盟') {
                    return null; // 同盟が切れていたら無効です
                }
            } else {
                return null; // 記録がなければ無効です
            }
            candidateName = shogun.fullName;
        } else {
            return null; // どちらもいなければ無効です
        }

        // 調べた情報をひとまとめにして箱に入れて返します
        return {
            sponsorClanId: sponsorClanId,
            shogunClanId: shogunClanId,
            candidateName: candidateName
        };
    }
};

// ==========================================
// ★ イベント実行用の便利な魔法（新しく追加します）
// ==========================================
window.EventAction = {
    // ① 画面の見た目や情報を最新の状態に描き直します（お片付け）
    refreshScreen: async function(game) {
        // ★Round10：イベント直後の全国更新を一気に重ねず、処理ごとにブラウザへ制御を返します。
        // 更新内容と順序は従来どおり「派閥 → 威信 → 画面」です。
        // まずイベント本体が作った一時データを解放できる隙を1回作ります。
        if (game && typeof game.writeSystemDiagnostic === 'function') game.writeSystemDiagnostic('event_refresh:pre_yield');
        await new Promise(resolve => setTimeout(resolve, 0));

        if (game && typeof game.writeSystemDiagnostic === 'function') game.writeSystemDiagnostic('event_refresh:faction:start');
        if (game.factionSystem) game.factionSystem.updateFactions();
        if (game && typeof game.writeSystemDiagnostic === 'function') game.writeSystemDiagnostic('event_refresh:faction:done');

        await new Promise(resolve => setTimeout(resolve, 0));

        if (game && typeof game.writeSystemDiagnostic === 'function') game.writeSystemDiagnostic('event_refresh:prestige:start');
        if (typeof game.updateAllClanPrestige === 'function') game.updateAllClanPrestige();
        if (game && typeof game.writeSystemDiagnostic === 'function') game.writeSystemDiagnostic('event_refresh:prestige:done');

        await new Promise(resolve => setTimeout(resolve, 0));

        if (game.ui) {
            if (game.isProcessingAI && !game.isWatchMode) {
                game._aiDeferredMapRefresh = true;
                if (typeof game.writeSystemDiagnostic === 'function') game.writeSystemDiagnostic('event_refresh:map:deferred');
            } else {
                if (typeof game.writeSystemDiagnostic === 'function') game.writeSystemDiagnostic('event_refresh:map:start');
                game.ui.renderMap();
                game.ui.updatePanelHeader();
                if (typeof game.writeSystemDiagnostic === 'function') game.writeSystemDiagnostic('event_refresh:map:done');
            }
        }
    },

    // ② 武将を安全に別のお城へお引越しさせます（新魔法）
    moveBusho: function(game, busho, targetCastleId) {
        if (!busho || busho.castleId === targetCastleId) return;
        
        if (game.affiliationSystem) {
            game.affiliationSystem.moveCastle(busho, targetCastleId);
        } else {
            // システムがない場合の予備の手動お引越し
            const oldCastle = game.getCastle(busho.castleId);
            if (oldCastle) {
                oldCastle.samuraiIds = oldCastle.samuraiIds.filter(id => id !== busho.id);
                if (oldCastle.castellanId === busho.id) {
                    oldCastle.castellanId = 0;
                    busho.isCastellan = false;
                }
            }
            busho.castleId = targetCastleId;
            const targetCastle = game.getCastle(targetCastleId);
            if (targetCastle && !targetCastle.samuraiIds.includes(busho.id)) {
                targetCastle.samuraiIds.push(busho.id);
            }
        }
    },

    // ③ 武将を新しい城主に任命して、お城の看板も書き換えます（新魔法）
    appointCastellan: function(game, busho, castle) {
        if (!busho || !castle) return;
        
        // 今いる城主のバッジを外します
        const oldCastellan = game.getBusho(castle.castellanId);
        if (oldCastellan && oldCastellan.id !== busho.id) {
            oldCastellan.isCastellan = false;
        }
        
        // 新しい城主にバッジをつけます
        busho.isCastellan = true;
        castle.castellanId = busho.id;
        
        // システムに報告します
        if (game.affiliationSystem) {
            game.affiliationSystem.updateCastleLord(castle);
        }
    },

    // ④ ★家督相続（生前退位）の一連の処理をまとめてやってくれる魔法
    executeSuccession: function(game, oldDaimyo, successor, messages) {
        if (game.lifeSystem && typeof game.lifeSystem.setupNewDaimyo === 'function') {
            // ★life_system に新しく作った、一番優秀なお道具箱（魔法）に全てお任せします！
            game.lifeSystem.setupNewDaimyo(oldDaimyo, successor, messages, true);
        }
    },

    // ⑤ ★勢力を丸ごと吸収する（城と武将の引き継ぎ）魔法
    absorbClan: function(game, subordinateClanId, dominantClanId, excludeBushoId = 0, fixedLoyalty = null) {
        // ① 吸収される側の軍団をすべて解散させます（お片付け）
        if (game.legions) {
            const myLegions = game.legions.filter(l => Number(l.clanId) === Number(subordinateClanId));
            myLegions.forEach(l => {
                if (game.castleManager && game.castleManager.disbandLegion) {
                    game.castleManager.disbandLegion(l.id);
                }
            });
        }

        // ② 吸収される側のお城をすべて吸収する大名家にプレゼントして、直轄（0）にします
        const myCastles = game.getClanCastles(subordinateClanId);
        myCastles.forEach(c => {
            if (game.castleManager && game.castleManager.changeOwner) {
                game.castleManager.changeOwner(c, dominantClanId, true, 0); // trueで平和的に引き渡し
            } else {
                c.ownerClan = dominantClanId;
            }
            c.legionId = 0; // 直轄に戻す
        });

        // ③ 吸収される側の武将（除外ID以外）を吸収する大名家に入れます
        const myBushos = game.bushos.filter(b => Number(b.clan) === Number(subordinateClanId) && b.status !== 'dead' && b.id !== excludeBushoId);
        myBushos.forEach(b => {
            if (fixedLoyalty !== null && game.affiliationSystem && game.affiliationSystem.joinClan) {
                // 忠誠度が指定されている場合（臣従イベントなど）はお引越しセンターの魔法を使います
                game.affiliationSystem.joinClan(b, dominantClanId, b.castleId, fixedLoyalty);
            } else {
                // それ以外（乗っ取りなど）は個別に処理して相性で忠誠を再計算します
                b.isDaimyo = false;
                b.isCommander = false;
                b.isGunshi = false;
                b.clan = dominantClanId;
                if (game.affiliationSystem && game.affiliationSystem.updateLoyaltyForNewLord) {
                    game.affiliationSystem.updateLoyaltyForNewLord(b, dominantClanId);
                }
            }
        });

        // ④ 吸収される側（旧勢力）の滅亡フラグを立てます
        const subordinateClan = game.getClan(subordinateClanId);
        if (subordinateClan) {
            subordinateClan.extinctionNotified = true;
        }
    }
};

// ==========================================
// ★ 桶狭間の戦い（予備）：徳川家康 岡崎城主就任（裏イベント）
// ==========================================
window.GameEvents.push({
    id: "historical_motoyasu_okazaki",
    timing: "startMonth_before",     // 月初の処理前にこっそりチェックします
    isOneTime: true,                 // 一度発生したら二度と起きません
    
    checkCondition: function(game) {
        // ① まず、主要な登場人物の確認をします
        // 今川義元（ID: 1004009）が大名として存在するか
        const yoshimoto = window.EventCheck.getDaimyo(game, 1004009);
        if (!yoshimoto) return false;

        // 織田信長（ID: 1006006）が大名として存在するか
        const nobunaga = window.EventCheck.getDaimyo(game, 1006006);
        if (!nobunaga) return false;

        // ② プレイヤーが今川家を担当している場合は、勝手な移動を防ぐためここで止めます
        const imagawaClanId = yoshimoto.clan;
        if (game.playerClanId === imagawaClanId) return false;

        // ③ 徳川家康（ID: 1301006）の存在と、今の立場を確認します
        const motoyasu = game.getBusho(1301006);
        if (!motoyasu) return false; // 存在しない場合はストップ

        // 家康が「義元の今川家」に所属しているか
        if (motoyasu.clan !== imagawaClanId) return false;

        // 家康がすでに「大名（独立した殿様）」や「国主」になっていないか
        if (motoyasu.isDaimyo || motoyasu.isCommander) return false;

        // ④ 目的のお城（岡崎城：ID48）の状態を確認します
        // ※家康がすでに城主であっても、国主への昇格を行うためストップせずに進めます
        const okazakiCastle = game.getCastle(48);
        if (!okazakiCastle) return false;

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
        const motoyasu = game.getBusho(1301006);
        const okazakiCastle = game.getCastle(48);

        // 万が一データが見つからなかった時のための安全装置です
        if (!motoyasu || !okazakiCastle) return;

        // ★追加：岡崎城がすでにどこかの軍団に所属していた場合の処理
        if (okazakiCastle.legionId !== 0) {
            const oldLegionId = okazakiCastle.legionId;
            
            // 岡崎城を直轄（0）に戻して、委任状態も解除します
            okazakiCastle.legionId = 0;
            okazakiCastle.isDelegated = false;

            // 軍団のシステムが存在するか確認します
            if (game.legions) {
                // 今川家の該当する軍団のデータを探します
                const legion = game.legions.find(l => l.clanId === motoyasu.clan && l.legionNo === oldLegionId);
                
                if (legion) {
                    const commander = game.getBusho(legion.commanderId);
                    
                    // もし、その軍団の国主本人が岡崎城にいた場合のチェックです
                    if (commander && commander.castleId === 48) {
                        // この軍団が持っている「岡崎城以外」のお城を探します
                        const otherCastles = game.castles.filter(c => c.ownerClan === motoyasu.clan && c.legionId === oldLegionId && c.id !== 48);
                        
                        if (otherCastles.length > 0) {
                            // 別のお城があるなら、その中の一つへ国主をお引越しさせます
                            const newCastle = otherCastles[0];
                            if (game.affiliationSystem) {
                                game.affiliationSystem.moveCastle(commander, newCastle.id);
                            } else {
                                commander.castleId = newCastle.id;
                            }
                            
                            // 前の城主バッジを外して、新しいお城の城主に任命し直します
                            commander.isCastellan = true;
                            newCastle.castellanId = commander.id;
                            if (game.affiliationSystem) {
                                game.affiliationSystem.updateCastleLord(newCastle);
                            }
                        } else {
                            // もし別のお城がなかった場合は、国主を解任して軍団を空っぽ（解散）にします
                            commander.isCommander = false;
                            legion.commanderId = 0;
                            legion.objective = null;
                            legion.status = 'wait';
                            legion.targetId = 0;
                            legion.route = [];

                            // ★Round6：軍団だけ解散してAI作戦が翌月まで残らないよう、その場で計画も片付けます
                            if (game.aiOperationManager && typeof game.aiOperationManager.clearLegionPlanning === 'function') {
                                game.aiOperationManager.clearLegionPlanning(motoyasu.clan, oldLegionId);
                            }
                        }
                    }
                }
            }
        }

        // 1. 徳川家康の功績が699以下なら、強制的に700に引き上げます
        if ((motoyasu.achievementTotal || 0) <= 699) {
            motoyasu.achievementTotal = 700;
        }
        
        // 2. 家康が別のお城にいる場合、安全に岡崎城へお引越しさせます
        window.EventAction.moveBusho(game, motoyasu, 48);

        // 3. 岡崎城にいる他の武将の城主バッジを外し、家康を新しい城主にします
        window.EventAction.appointCastellan(game, motoyasu, okazakiCastle);

        // ★追加：今川家の国主（軍団1～8）に空きがあるなら、家康を国主にする処理
        if (game.aiStaffing) {
            const newLegionNo = game.aiStaffing.assignNewLegion(motoyasu.clan, motoyasu.id);
            if (newLegionNo !== -1) {
                motoyasu.isCommander = true;
                if (motoyasu.isGunshi) motoyasu.isGunshi = false; // 念のため軍師バッジを外します
                okazakiCastle.legionId = newLegionNo;
                okazakiCastle.isDelegated = true; // AIに委任する状態にします
            }
        }

        // 4. システムに城主（と国主）の変更を確定させ、画面を更新します
        if (game.affiliationSystem) {
            game.affiliationSystem.updateCastleLord(okazakiCastle);
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
        // 太原崇孚（雪斎）（ID: 1004056）が死亡しているか確認します（生きていたらストップ）
        if (!window.EventCheck.isDead(game, 1004056)) return false;
        
        // 今川義元（ID: 1004009）が大名として存在するか確認します
        const yoshimoto = window.EventCheck.getDaimyo(game, 1004009);
        if (!yoshimoto) return false;
        
        // 今川義元が駿府城（ID: 13）にいるか確認します
        if (yoshimoto.castleId !== 13) return false;
        
        // 織田信長（ID: 1006006）が大名として存在するか確認します
        const nobunaga = window.EventCheck.getDaimyo(game, 1006006);
        if (!nobunaga) return false;
        
        // 織田信長が清洲城（ID: 7）にいるか確認します
        if (nobunaga.castleId !== 7) return false;

        // 徳川家康（ID: 1301006）が城主として存在するか確認します
        const motoyasu = game.getBusho(1301006);
        if (!motoyasu || !motoyasu.isCastellan) return false;

        // ③ 勢力同士の外交関係を確認します
        const imagawaClanId = yoshimoto.clan;
        const odaClanId = nobunaga.clan;
        
        // 武田信玄（ID: 1002002）と北条氏康（ID: 1003003）が大名として存在するか確認します
        const shingen = window.EventCheck.getDaimyo(game, 1002002);
        const ujiyasu = window.EventCheck.getDaimyo(game, 1003003);
        if (!shingen || !ujiyasu) return false;

        // 各勢力間の外交関係を確認します
        if (game.diplomacyManager) {
            // 織田家と今川家の関係が、同盟・従属・支配・友好・和睦ではないことを確認します
            const rel = game.diplomacyManager.getRelation(odaClanId, imagawaClanId);
            if (rel && ['同盟', '従属', '支配', '友好', '和睦'].includes(rel.status)) {
                return false; // もし対象の関係だったら、ここでイベントをストップします
            }

            const shingenClanId = shingen.clan;
            const ujiyasuClanId = ujiyasu.clan;
            
            // 今川家と武田家の関係が同盟か確認します
            const relImagawaShingen = game.diplomacyManager.getRelation(imagawaClanId, shingenClanId);
            if (!relImagawaShingen || relImagawaShingen.status !== '同盟') return false;

            // 今川家と北条家の関係が同盟か確認します
            const relImagawaUjiyasu = game.diplomacyManager.getRelation(imagawaClanId, ujiyasuClanId);
            if (!relImagawaUjiyasu || relImagawaUjiyasu.status !== '同盟') return false;

            // 武田家と北条家の関係が同盟か確認します
            const relShingenUjiyasu = game.diplomacyManager.getRelation(shingenClanId, ujiyasuClanId);
            if (!relShingenUjiyasu || relShingenUjiyasu.status !== '同盟') return false;
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
        if (!window.EventCheck.areClansAdjacent(game, odaClanId, imagawaClanId)) return false;

        // ⑥ ★追加：イベントの配役に必要な人数の武将が揃っているか確認します
        // 織田家には信長以外に「5人」の武将が必要です
        const odaBushosCount = game.bushos.filter(b => b.clan === odaClanId && b.status === 'active' && b.id !== nobunaga.id).length;
        if (odaBushosCount < 5) return false;

        // 今川家には義元と家康以外に「1人」の武将が必要です
        const imagawaBushosCount = game.bushos.filter(b => b.clan === imagawaClanId && b.status === 'active' && b.id !== yoshimoto.id && b.id !== 1301006).length;
        if (imagawaBushosCount < 1) return false;
        
        // すべての条件をクリアしたら、イベントを発生させます！
        return true;
    },
    
    execute: async function(game) {
        const yoshimoto = game.getBusho(1004009);
        const imagawaClanId = yoshimoto.clan;
        const nobunaga = game.getBusho(1006006);
        
        const imagawaClan = game.getClan(imagawaClanId);
        const odaClan = game.getClan(nobunaga.clan);

        // --- 1. 武将の配役決定（オーディション） ---
        // 織田家にいる武将（信長以外）を全員集めます
        let odaBushos = game.bushos.filter(b => b.clan === nobunaga.clan && b.status === 'active' && b.id !== nobunaga.id);

        // 重臣A（林秀貞）: 貢献度600以上で外交最高。いなければ貢献度最高の中で外交最高。
        let juushinA = odaBushos.filter(b => b.achievementTotal >= 600).sort((a, b) => (b.diplomacy || 0) - (a.diplomacy || 0))[0];
        if (!juushinA) juushinA = [...odaBushos].sort((a, b) => ((b.achievementTotal || 0) !== (a.achievementTotal || 0) ? (b.achievementTotal || 0) - (a.achievementTotal || 0) : (b.diplomacy || 0) - (a.diplomacy || 0)))[0];
        // 選ばれた人は次のオーディションから外します
        odaBushos = odaBushos.filter(b => b.id !== (juushinA ? juushinA.id : 0));

        // 重臣B（佐久間信盛）: 貢献度600以上で統率最高。いなければ貢献度最高の中で統率最高。
        let juushinB = odaBushos.filter(b => b.achievementTotal >= 600).sort((a, b) => (b.leadership || 0) - (a.leadership || 0))[0];
        if (!juushinB) juushinB = [...odaBushos].sort((a, b) => ((b.achievementTotal || 0) !== (a.achievementTotal || 0) ? (b.achievementTotal || 0) - (a.achievementTotal || 0) : (b.leadership || 0) - (a.leadership || 0)))[0];
        odaBushos = odaBushos.filter(b => b.id !== (juushinB ? juushinB.id : 0));

        // 新参C（森可成）: 貢献度599以下で武勇最高。いなければ武勇最高。
        let shinzanC = odaBushos.filter(b => b.achievementTotal <= 599).sort((a, b) => (b.strength || 0) - (a.strength || 0))[0];
        if (!shinzanC) shinzanC = [...odaBushos].sort((a, b) => (b.strength || 0) - (a.strength || 0))[0];
        odaBushos = odaBushos.filter(b => b.id !== (shinzanC ? shinzanC.id : 0));

        // 新参D（木下秀吉）: 貢献度300以下で智謀最高。いなければ智謀最高。
        let shinzanD = odaBushos.filter(b => b.achievementTotal <= 300).sort((a, b) => (b.intelligence || 0) - (a.intelligence || 0))[0];
        if (!shinzanD) shinzanD = [...odaBushos].sort((a, b) => (b.intelligence || 0) - (a.intelligence || 0))[0];
        odaBushos = odaBushos.filter(b => b.id !== (shinzanD ? shinzanD.id : 0));

        // 新参E（毛利良勝）: ID1006169、いなければ貢献度100以下で武勇最高、いなければ武勇最高
        let mouri = odaBushos.find(b => b.id === 1006169);
        if (!mouri) {
            mouri = odaBushos.filter(b => b.achievementTotal <= 100).sort((a, b) => (b.strength || 0) - (a.strength || 0))[0];
            if (!mouri) mouri = [...odaBushos].sort((a, b) => (b.strength || 0) - (a.strength || 0))[0];
        }

        // 今川家重臣Fの選出
        let juushinF = null;
        let imagawaBushosForF = game.bushos.filter(b => b.clan === imagawaClanId && b.status === 'active' && b.id !== yoshimoto.id && b.id !== 1301006);

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

        // ★追加：織田信秀（ID: 1006004）のデータを取得します
        const nobuhide = game.getBusho(1006004);

        // ★追加：駿河・遠江・三河・尾張の国名を取得します
        let surugaProvinceShort = "駿河";
        let toutoumiProvinceShort = "遠江";
        let mikawaProvinceShort = "三河";
        let owariProvinceName = "尾張国";
        let owariProvinceShort = "尾張";
        
        if (game.provinces) {
            const pSuruga = game.provinces.find(prov => prov.id === 20);
            if (pSuruga) surugaProvinceShort = pSuruga.shortName;
            const pToutoumi = game.provinces.find(prov => prov.id === 21);
            if (pToutoumi) toutoumiProvinceShort = pToutoumi.shortName;
            const pMikawa = game.provinces.find(prov => prov.id === 22);
            if (pMikawa) mikawaProvinceShort = pMikawa.shortName;
            const pOwari = game.provinces.find(prov => prov.id === 23);
            if (pOwari) {
                owariProvinceName = pOwari.province;
                owariProvinceShort = pOwari.shortName;
            }
        }

        // 台本に渡す情報をひとまとめにします
        const args = {
            yoshimotoName: yoshimoto.fullName,
            yoshimotoFamilyName: yoshimoto.familyName || "今川",
            yoshimotoGivenName: yoshimoto.givenName || "義元",
            yoshimotoFace: yoshimoto.faceIcon || "unknown_face.webp",
            nobunagaName: nobunaga.fullName,
            nobunagaFamilyName: nobunaga.familyName || "織田",
            nobunagaGivenName: nobunaga.givenName || "信長",
            nobunagaFace: nobunaga.faceIcon || "unknown_face.webp",
            sunpuCastleName: game.getCastle(13)?.name || "駿府城",
            owariProvinceName: owariProvinceName,     // ★変更
            owariProvinceShort: owariProvinceShort,   // ★変更
            mikawaProvinceShort: mikawaProvinceShort, // ★追加
            surugaProvinceShort: surugaProvinceShort, // ★追加
            toutoumiProvinceShort: toutoumiProvinceShort, // ★追加
            odaClanName: odaClan ? odaClan.name : "織田家",
            imagawaClanName: imagawaClan ? imagawaClan.name : "今川家",
            
            juushinAName: juushinA ? juushinA.fullName : "小姓",
            juushinAFace: juushinA ? juushinA.faceIcon : "koshou.webp",
            juushinBName: juushinB ? juushinB.fullName : "小姓",
            juushinBFace: juushinB ? juushinB.faceIcon : "koshou.webp",
            shinzanCName: shinzanC ? shinzanC.fullName : "小姓",
            shinzanCFace: shinzanC ? shinzanC.faceIcon : "koshou.webp",
            shinzanDName: shinzanD ? shinzanD.fullName : "小姓",
            shinzanDFace: shinzanD ? shinzanD.faceIcon : "koshou.webp",
            mouriName: mouri ? mouri.fullName : "小姓",
            mouriFace: mouri ? mouri.faceIcon : "koshou.webp",
            juushinFName: juushinF ? juushinF.fullName : "小姓",
            juushinFFace: juushinF ? juushinF.faceIcon : "koshou.webp",
            juushinFGivenName: juushinF ? (juushinF.givenName || juushinF.fullName) : "小姓",
            
            // ★追加：織田信秀の名前を台本に渡します（もしデータが無ければ"織田信秀"とします）
            nobuhideName: nobuhide ? nobuhide.fullName : "織田信秀"
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
                
                // ここでイベントを終了して、元の画面に戻ります
                if (window.AudioManager) window.AudioManager.restoreMemorizedBgm();
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

            // ★追加：プレイヤーが織田家か今川家を担当しているか確認します
            const isPlayerInvolved = (game.playerClanId === nobunaga.clan || game.playerClanId === imagawaClanId);

            // ★追加：武将のデータから「姓＋家」の形を作ります
            const odaName = nobunaga.clanNameStr || "織田家";
            const imagawaName = yoshimoto.clanNameStr || "今川家";

            // ① 両家の武将の討死処理（使いまわし版）
            // 織田家と今川家で「違う部分」だけをリストにまとめます
            const targetClans = [
                { clanId: nobunaga.clan, clanName: odaName, excludeId: 0 },               // 織田家（除外する人はいないので0）
                { clanId: imagawaClanId, clanName: imagawaName, excludeId: yoshimoto.id } // 今川家（義元本人は除外）
            ];

            // リストの中身（織田家→今川家）の順番で、同じ処理を繰り返します
            for (const target of targetClans) {
                // 本来の寿命（originalEndYear）が1560年以前で、討死フラグがあり、除外IDではない活動中の武将を探します
                const deadBushos = game.bushos.filter(b => 
                    b.clan === target.clanId && 
                    b.status === 'active' && 
                    b.originalEndYear <= 1560 && 
                    b.isKilledInBattle && 
                    b.id !== target.excludeId
                );

                for (const busho of deadBushos) {
                    if (game.lifeSystem) {
                        // 通常の死亡メッセージを止めて、イベント専用のメッセージを出します
                        await game.lifeSystem.executeDeath(busho, { skipNormalMessage: true });
                    }
                    // プレイヤーが関係している場合のみ、一人ずつメッセージを出します
                    if (isPlayerInvolved) {
                        const bushoName = busho.fullName;
                        // 自分がその勢力なら「当家」、違うならリストに登録した「〇〇家」を表示させます
                        const prefix = (game.playerClanId === target.clanId) ? "当家" : target.clanName;
                        const msg = `${prefix}の${bushoName}が討死しました。`;
                        
                        game.ui.log(msg); // ログにも残します
                        await game.ui.showDialogAsync(msg, false, 0); // 画面に出して「OK」を押すまで待ちます
                    }
                }
            }

            // ③ 義元の討死処理を行います
            // 死亡システムに全てお任せして、後継ぎの決定なども自動で行ってもらいます
            if (game.lifeSystem) {
                await game.lifeSystem.executeDeath(yoshimoto);
            }

            // ★追加：義元死亡後、今川勢力の拠点の兵力と人口を減らし、その「減った数」をメモしておきます
            let totalLostSoldiers = 0; // 減った兵士の合計を入れる箱です
            let totalLostPopulation = 0; // 減った人口の合計を入れる箱です

            const imagawaCastles = game.getClanCastles(imagawaClanId);
            imagawaCastles.forEach(c => {
                // 減らす前の「元の数」を覚えておきます
                const oldSoldiers = c.soldiers || 0;
                const oldPopulation = c.population || 0;
                
                // 兵力を0.4倍、人口を0.6倍にします（小数点は切り捨てます）
                c.soldiers = Math.floor(oldSoldiers * 0.4);
                c.population = Math.floor(oldPopulation * 0.6);
                
                // 元の数から今の数を引いて「減った数」を計算し、合計の箱に足していきます
                totalLostSoldiers += (oldSoldiers - c.soldiers);
                totalLostPopulation += (oldPopulation - c.population);
            });

            // 減った数の「半分」のボーナスを計算しておきます
            const bonusSoldiers = Math.floor(totalLostSoldiers / 2);
            const bonusPopulation = Math.floor(totalLostPopulation / 2);

            // ★義元死亡後、今川勢力に所属する松平系（1301000～1301999）以外の武将の忠誠度を15回復します※難易度調整とイベントの進行ための調整用。今は一旦無効
            // const imagawaRemainingBushos = game.bushos.filter(b => b.clan === imagawaClanId && b.status === 'active' && !(b.id >= 1301000 && b.id <= 1301999));
            // imagawaRemainingBushos.forEach(b => {
            //     b.loyalty = Math.min(100, (b.loyalty || 0) + 15);
            // });

            // 織田家に勝利のボーナス（忠誠と民忠アップ、そして今川から減った分の半分の兵士・人口）を与えます
            if (nobunaga && nobunaga.clan > 0) {
                const odaBushos = game.bushos.filter(b => b.clan === nobunaga.clan && b.status === 'active');
                odaBushos.forEach(b => {
                    b.loyalty = Math.min(100, (b.loyalty || 0) + 5);
                });

                const odaCastles = game.getClanCastles(nobunaga.clan);
                
                // 織田家のお城の数で割り算をして、「１つのお城に均等に配る数」を計算します
                let soldiersPerCastle = 0;
                let populationPerCastle = 0;
                if (odaCastles.length > 0) {
                    soldiersPerCastle = Math.floor(bonusSoldiers / odaCastles.length);
                    populationPerCastle = Math.floor(bonusPopulation / odaCastles.length);
                }

                odaCastles.forEach(c => {
                    c.peoplesLoyalty = 100;
                    
                    // それぞれのお城に、均等に分けた兵士と人口を足してあげます！
                    // 上限（兵士は99,999、人口は999,999）を超えないようにストッパーもかけておきます
                    c.soldiers = Math.min(99999, (c.soldiers || 0) + soldiersPerCastle);
                    c.population = Math.min(999999, (c.population || 0) + populationPerCastle);
                });
            }

            // 徳川家康今川勢力と武田信玄勢力の友好度が21以上なら20にする処理
            const shingen = game.getBusho(1002002); // 武田信玄のデータを取得します
            if (shingen && shingen.clan > 0 && game.diplomacyManager) {
                const shingenClanId = shingen.clan;
                const rel = game.diplomacyManager.getRelation(imagawaClanId, shingenClanId);
                if (rel && rel.sentiment >= 21) {
                    // 現在の友好度との差分を計算して、ちょうど20になるようにマイナスします
                    const delta = 20 - rel.sentiment;
                    game.diplomacyManager.updateSentiment(imagawaClanId, shingenClanId, delta);
                }
            }

        } else {
            // 【籠城ルート】
            if (window.EventTextManager && window.EventTextManager.okehazama_defend) {
                await window.EventTextManager.playSequence(game, window.EventTextManager.okehazama_defend(args));
            }
            
            // ★追加：今川家のすべての軍団の攻略目標を織田家に設定します
            if (game.aiOperationManager && typeof game.aiOperationManager.setGrandObjectiveToAllLegions === 'function') {
                const odaClanId = nobunaga.clan;
                // 今川家のすべての軍団に「大名攻略（織田家）」の方針を24ターン（2年間）設定します
                game.aiOperationManager.setGrandObjectiveToAllLegions(imagawaClanId, '大名攻略', odaClanId, 24);
            }

            // 籠城ルートはここでイベントが終わり、義元も生き残ります
        }

        // --- 5. 終了のお片付け ---
        // メモしておいた元のBGMに戻します
        if (window.AudioManager) {
            window.AudioManager.restoreMemorizedBgm();
        }
    }
});

// ==========================================
// ★ 徳川家康 独立イベント
// ==========================================
window.GameEvents.push({
    id: "historical_ieyasu_independence",
    timing: "endMonth_before", // 月末の独立チェックなどが始まる前に起こします
    isOneTime: true,
    
    checkCondition: function(game) {
        // 1. 今川義元（ID: 1004009）が死亡しているか確認します
        if (!window.EventCheck.isDead(game, 1004009)) return false;
        
        // 2. 今川氏真（ID: 1004010）が大名であるか確認します
        const ujizane = window.EventCheck.getDaimyo(game, 1004010);
        if (!ujizane) return false;

        // 3. 徳川家康（ID: 1301006）が存在し、大名ではないことを確認します
        const motoyasu = game.getBusho(1301006);
        if (!motoyasu || motoyasu.isDaimyo) return false;

        // 4. 徳川家康が氏真と同じ今川家に所属し、城主であるか確認します
        if (motoyasu.clan !== ujizane.clan || !motoyasu.isCastellan) return false;

        // 5. 徳川家康が派閥主であるか確認します
        if (!motoyasu.isFactionLeader) return false;

        // 全ての条件を満たしたらイベント発生！
        return true;
    },
    
    execute: async function(game) {
        const ujizane = game.getBusho(1004010);
        const motoyasu = game.getBusho(1301006);
        const castle = game.getCastle(motoyasu.castleId);

        if (!castle) return;

        // ★独立させる直前に、松平系（ID: 1301000～1301999）の武将の忠誠度を20下げます
        const matsudairaBushosBefore = game.bushos.filter(b => b.clan === ujizane.clan && b.status === 'active' && b.id >= 1301000 && b.id <= 1301999);
        matsudairaBushosBefore.forEach(b => {
            b.loyalty = Math.max(0, (b.loyalty || 0) - 20);
        });

        // 独立システムを呼び出して、強制的に独立を実行します
        if (game.independenceSystem) {
            // 第4引数に 'indep' を渡すことで、乗っ取りや寝返りではなく、純粋な「独立」として処理させます
            await game.independenceSystem.executeRebellion(castle, motoyasu, ujizane, 'indep');

            // ★追加：独立した徳川家康の大名家に所属する武将と城のボーナス処理
            if (motoyasu.clan > 0) {
                // 武将の忠誠度を+10（最大100まで）
                const matsudairaBushos = game.bushos.filter(b => b.clan === motoyasu.clan && b.status === 'active');
                matsudairaBushos.forEach(b => {
                    b.loyalty = Math.min(100, (b.loyalty || 0) + 10);
                });
                
                // 城の兵士、人口、民忠のボーナス
                const matsudairaCastles = game.getClanCastles(motoyasu.clan);
                matsudairaCastles.forEach(c => {
                    // 民忠を上限にする処理はそのまま残します
                    c.peoplesLoyalty = c.maxPeoplesLoyalty || 100;

                    // 家康の居城かどうかで処理を分けます
                    if (c.id === motoyasu.castleId) {
                        // 【家康の居城の場合】
                        // 兵士数が5000未満なら5000に、5000以上なら+1000します（上限は99999）
                        if ((c.soldiers || 0) < 5000) {
                            c.soldiers = 5000;
                        } else {
                            c.soldiers = Math.min(99999, (c.soldiers || 0) + 1000);
                        }
                        // 人口を8000増やします（上限は99万9999）
                        c.population = Math.min(999999, (c.population || 0) + 8000);
                    } else {
                        // 【家康の居城以外の拠点の場合】
                        // 兵士数が4000未満なら3000に、3000以上なら+500します（上限は99999）
                        if ((c.soldiers || 0) < 3000) {
                            c.soldiers = 3000;
                        } else {
                            c.soldiers = Math.min(99999, (c.soldiers || 0) + 500);
                        }
                        // 人口を5000増やします（上限は99万9999）
                        c.population = Math.min(999999, (c.population || 0) + 5000);
                    }
                });
                
                // 家康勢力と武田信玄勢力の友好度が49以下なら50にする処理
                const shingen = game.getBusho(1002002); // 武田信玄のデータを取得します
                if (shingen && shingen.clan > 0 && game.diplomacyManager) {
                    const shingenClanId = shingen.clan;
                    const rel = game.diplomacyManager.getRelation(motoyasu.clan, shingenClanId);
                    if (rel && rel.sentiment <= 49) {
                        // 現在の友好度との差分を計算して、ちょうど50になるようにプラスします
                        const delta = 50 - rel.sentiment;
                        game.diplomacyManager.updateSentiment(motoyasu.clan, shingenClanId, delta);
                    }
                }
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
        // 今川義元（ID: 1004009）が死亡しているかを確認します
        if (!window.EventCheck.isDead(game, 1004009)) return false;

        // 織田信長、徳川家康、今川氏真 がそれぞれ大名であるか確認します
        const nobunaga = window.EventCheck.getDaimyo(game, 1006006);
        const motoyasu = window.EventCheck.getDaimyo(game, 1301006);
        const ujizane = window.EventCheck.getDaimyo(game, 1004010);
        if (!nobunaga || !motoyasu || !ujizane) return false;

        // 斎藤義龍 または 龍興 が大名であるか確認します
        const isshikiDaimyo = window.EventCheck.getDaimyo(game, [1005003, 1005004]);
        if (!isshikiDaimyo) return false;

        // 織田家と斎藤家（斎藤家）の関係が敵対であるか確認します
        const relOdaIsshiki = game.diplomacyManager.getRelation(nobunaga.clan, isshikiDaimyo.clan);
        if (!relOdaIsshiki || relOdaIsshiki.status !== '敵対') return false;

        // 徳川家と今川家の関係が敵対であるか確認します
        const relMatsudairaImagawa = game.diplomacyManager.getRelation(motoyasu.clan, ujizane.clan);
        if (!relMatsudairaImagawa || relMatsudairaImagawa.status !== '敵対') return false;

        // 織田家と徳川家の関係が「敵対」「普通」「友好」のいずれかであるか確認します
        const rel = game.diplomacyManager.getRelation(nobunaga.clan, motoyasu.clan);
        if (!rel || (rel.status !== '敵対' && rel.status !== '普通' && rel.status !== '友好')) return false;

        // 織田家と徳川家の領地（お城同士の道）が隣接しているか確認します
        if (!window.EventCheck.areClansAdjacent(game, nobunaga.clan, motoyasu.clan)) return false;

        // ★尾張国（地方ID: 23）のすべての城を織田家が所有しているか確認します
        if (!window.EventCheck.ownsAllCastlesInProvince(game, nobunaga.clan, 23)) return false;

        // ★追加：イベントの配役に必要な人数の武将が揃っているか確認します
        // 徳川家には家康以外に「2人」の武将が必要です
        const matsuBushosCount = game.bushos.filter(b => b.clan === motoyasu.clan && b.id !== motoyasu.id && b.status === 'active').length;
        if (matsuBushosCount < 2) return false;

        // 織田家には信長以外に「1人」の武将が必要です
        const odaBushosCount = game.bushos.filter(b => b.clan === nobunaga.clan && b.id !== nobunaga.id && b.status === 'active').length;
        if (odaBushosCount < 1) return false;

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

        const nobunaga = game.getBusho(1006006);
        const motoyasu = game.getBusho(1301006);
        
        const odaClan = game.getClan(nobunaga.clan);
        const matsudairaClan = game.getClan(motoyasu.clan);
        
        // 今川氏真(1004010)の大名家名を取得します
        const ujizane = game.getBusho(1004010);
        let imagawaClanName = "今川家";
        let imagawaFamilyName = "今川";
        if (ujizane && ujizane.clan > 0) {
            const imagawaClan = game.getClan(ujizane.clan);
            if (imagawaClan) imagawaClanName = imagawaClan.name;
            if (ujizane.familyName) imagawaFamilyName = ujizane.familyName;
        }

        // --- ここから徳川家の配役を選出します ---
        // まず、徳川家に所属していて、家康以外の活動中の武将を全員集めます
        let matsuBushos = game.bushos.filter(b => b.clan === motoyasu.clan && b.id !== motoyasu.id && b.status === 'active');
        
        // 徳川家臣A：統率がもっとも高い武将
        let kashinA = matsuBushos.sort((a, b) => (b.leadership || 0) - (a.leadership || 0))[0];
        // 選ばれた家臣Aを次のオーディション候補から外します
        matsuBushos = matsuBushos.filter(b => b.id !== (kashinA ? kashinA.id : 0));
        
        // 徳川家臣B：残りの武将の中で、智謀がもっとも高い武将
        let kashinB = matsuBushos.sort((a, b) => (b.intelligence || 0) - (a.intelligence || 0))[0];

        // --- ここから織田家の配役を選出します ---
        // 織田家に所属していて、信長以外の活動中の武将を全員集めます
        let odaBushos = game.bushos.filter(b => b.clan === nobunaga.clan && b.id !== nobunaga.id && b.status === 'active');
        
        // 織田家新参C：功績が300以下で、智謀がもっとも高い武将
        let shinzanC = odaBushos.filter(b => (b.achievementTotal || 0) <= 300).sort((a, b) => (b.intelligence || 0) - (a.intelligence || 0))[0];

        // 信長の官位名を取得します
        let nobunagaTitle = "上総介";
        if (game.courtRankSystem && typeof game.courtRankSystem.getHighestRankName === 'function') {
            const rankName = game.courtRankSystem.getHighestRankName(nobunaga);
            if (rankName !== "なし") {
                nobunagaTitle = rankName;
            }
        }

        // 信長の居城名を取得します
        let nobunagaCastleName = "城";
        let nobunagaCastleShort = "城"; // ★追加
        if (nobunaga.castleId > 0) {
            const castle = game.getCastle(nobunaga.castleId);
            if (castle) {
                nobunagaCastleName = castle.name;
                nobunagaCastleShort = castle.shortName;
            }
        }

        // ★追加：三河国の名前を取得します
        let mikawaProvinceShort = "三河";
        if (game.provinces) {
            const pMikawa = game.provinces.find(prov => prov.id === 22);
            if (pMikawa) mikawaProvinceShort = pMikawa.shortName;
        }

        // イベントテキストの台本に渡す変数をひとまとめにします
        const args = {
            mikawaProvinceShort: mikawaProvinceShort, // ★追加
            motoyasuCastleId: motoyasu.castleId, // Round21: 松平側会話のカメラ位置
            motoyasuName: motoyasu.fullName,
            motoyasuGivenName: motoyasu.givenName || "家康",
            matsudairaFamilyName: motoyasu.familyNameStr || "徳川",
            motoyasuFace: motoyasu.faceIcon || "unknown_face.webp",
            
            imagawaClanName: imagawaClanName,
            imagawaFamilyName: imagawaFamilyName,
            
            nobunagaName: nobunaga.fullName,
            nobunagaGivenName: nobunaga.givenName || "信長", 
            odaFamilyName: nobunaga.familyNameStr || "織田",
            nobunagaFace: nobunaga.faceIcon || "unknown_face.webp",
            
            odaClanName: odaClan ? odaClan.name : "織田家",
            matsudairaClanName: matsudairaClan ? matsudairaClan.name : "徳川家",
            
            kashinAName: kashinA ? kashinA.fullName : "小姓",
            kashinAGivenName: kashinA ? (kashinA.givenName || kashinA.fullName) : "小姓",
            kashinAFace: kashinA ? kashinA.faceIcon : "koshou.webp",
            
            kashinBName: kashinB ? kashinB.fullName : "小姓",
            kashinBGivenName: kashinB ? (kashinB.givenName || kashinB.fullName) : "小姓",
            kashinBFace: kashinB ? kashinB.faceIcon : "koshou.webp",
            
            shinzanCName: shinzanC ? shinzanC.fullName : "小姓",
            shinzanCGivenName: shinzanC ? (shinzanC.givenName || shinzanC.fullName) : "小姓",
            shinzanCFace: shinzanC ? shinzanC.faceIcon : "koshou.webp",

            nobunagaCastleName: nobunagaCastleName,
            nobunagaCastleShort: nobunagaCastleShort, // ★変更（魔法の変数を使用）
            nobunagaTitle: nobunagaTitle,
            year: game.year,
            month: game.month
        };
        
        // 新しく作ったファイルから台本を受け取り、再生プレイヤーで順番に表示させます
        // まずは共通のパート１（城に到着するまで）を再生します
        if (window.EventTextManager && window.EventTextManager.kiyosu_alliance_part1) {
            await window.EventTextManager.playSequence(game, window.EventTextManager.kiyosu_alliance_part1(args));
        }

        // ★今回追加：徳川プレイヤー専用の使者派遣選択肢
        let isSendEnvoy = true;
        if (game.playerClanId === motoyasu.clan) {
            await new Promise(resolve => {
                game.ui.showDialog(`「${args.odaFamilyName}家に同盟の使者を送りますか？」`, true, 
                    () => { isSendEnvoy = true; resolve(); },
                    () => { isSendEnvoy = false; resolve(); },
                    {
                        leftName: args.kashinAName,
                        leftFace: args.kashinAFace,
                        okText: "使者を送る",
                        okClass: "btn-primary",
                        cancelText: "送らない",
                        cancelClass: "btn-secondary"
                    }
                );
            });
        }

        // 使者を送らないルート
        if (!isSendEnvoy) {
            if (window.EventTextManager && window.EventTextManager.kiyosu_alliance_matsudaira_reject) {
                await window.EventTextManager.playSequence(game, window.EventTextManager.kiyosu_alliance_matsudaira_reject(args));
            }
            game.ui.log(`【イベント】清洲同盟：${args.matsudairaClanName}は${args.odaClanName}への使者派遣を見送りました。`);
            
            // BGMを戻してイベントを終了します
            if (window.AudioManager) {
                window.AudioManager.restoreMemorizedBgm();
            }
            return;
        }

        // 使者を送るルートの続きを再生します
        if (window.EventTextManager && window.EventTextManager.kiyosu_alliance_matsudaira_accept) {
            await window.EventTextManager.playSequence(game, window.EventTextManager.kiyosu_alliance_matsudaira_accept(args));
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
// ★ 織田信清 独立イベント
// ==========================================
window.GameEvents.push({
    id: "historical_nobukiyo_rebellion",
    timing: "endMonth_before", // 月末の独立チェックなどが始まる前に起こします
    isOneTime: true,
    
    checkCondition: function(game) {
        // 1. 織田信長（ID: 1006006）が大名であるか確認します
        const nobunaga = window.EventCheck.getDaimyo(game, 1006006);
        if (!nobunaga) return false;

        // 2. 斎藤龍興（ID: 1005004）が大名であるか確認します
        const tatsuoki = window.EventCheck.getDaimyo(game, 1005004);
        if (!tatsuoki) return false;

        // 3. 織田家と斎藤家が敵対しているか確認します
        if (game.diplomacyManager) {
            const rel = game.diplomacyManager.getRelation(nobunaga.clan, tatsuoki.clan);
            if (!rel || rel.status !== '敵対') return false;
        } else {
            return false;
        }

        // 4. 尾張国（地方ID: 23）のすべての城を織田家が所有しているか確認します
        if (!window.EventCheck.ownsAllCastlesInProvince(game, nobunaga.clan, 23)) return false;

        // 5. 織田信清（ID: 1006023）が存在し、大名ではなく、織田家に所属しているか確認します
        const nobukiyo = game.getBusho(1006023);
        if (!nobukiyo || nobukiyo.isDaimyo || nobukiyo.clan !== nobunaga.clan) return false;

        // 6. 織田信清が国主であり、かつ犬山城（ID: 73）の城主であるか確認します
        if (!nobukiyo.isCommander || !nobukiyo.isCastellan || nobukiyo.castleId !== 73) return false;

        // 全ての条件をクリアしたら、イベント発生の合図を出します！
        return true;
    },
    
    execute: async function(game) {
        const nobunaga = game.getBusho(1006006);
        const nobukiyo = game.getBusho(1006023);
        const inuyamaCastle = game.getCastle(73);

        // 万が一データが見つからなかった時のための安全装置です
        if (!inuyamaCastle) return;

        // 独立システムにお願いして、強制的に独立を実行してもらいます
        if (game.independenceSystem && typeof game.independenceSystem.forceAction === 'function') {
            // 第4引数に 'indep' を渡すことで、純粋な「独立」として処理させます
            await game.independenceSystem.forceAction(inuyamaCastle, nobukiyo, nobunaga, 'indep');
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
        // 1. 浅井久政（ID: 1015004）が存在し、大名であるか確認します
        const hisamasa = window.EventCheck.getDaimyo(game, 1015004);
        if (!hisamasa) return false;

        // 2. プレイヤーが浅井家の担当ではないか確認します
        if (game.playerClanId === hisamasa.clan) return false;

        // 3. 浅井長政（ID: 1015005）が存在し、久政と同じ勢力に所属しているか確認します
        const nagamasa = game.getBusho(1015005);
        if (!nagamasa || nagamasa.status !== 'active' || nagamasa.clan !== hisamasa.clan) return false;

        // 4. 1561年以降であるか確認します
        if (game.year < 1561) return false;

        // 5. 六角義賢（ID: 1018003）または六角義治（ID: 1018004）が大名であるか確認します
        const rokkakuDaimyo = window.EventCheck.getDaimyo(game, [1018003, 1018004]);
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
        const oldDaimyo = game.getBusho(1015004);
        const successor = game.getBusho(1015005);
        const clanId = oldDaimyo.clan;
        const messages = [];

        // 新しく作った家督相続の魔法を呼び出します
        window.EventAction.executeSuccession(game, oldDaimyo, successor, messages);

        // ⑪ メッセージを画面に出してお知らせします
        const hisamasaName = oldDaimyo.fullName;
        const nagamasaName = successor.fullName;
        const mainMsg = `浅井家の${hisamasaName}が隠居し、\n${nagamasaName}が新たな当主として家督を継ぎました！`;
        
        game.ui.log(`【イベント】浅井家家督相続：${mainMsg}`);
        messages.unshift(mainMsg); // 一番最初にメインのメッセージを入れます

        // 溜めておいたメッセージを順番に出します
        for (const msg of messages) {
            await game.ui.showDialogAsync(msg, false, 0);
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
        // 1. 織田信長（ID: 1006006）が大名であるか確認します
        const nobunaga = window.EventCheck.getDaimyo(game, 1006006);
        if (!nobunaga) return false;
        
        // 3. 浅井長政（ID: 1015005）が大名であるか確認します
        const nagamasa = window.EventCheck.getDaimyo(game, 1015005);
        if (!nagamasa) return false;

        // 4. 浅井長政にまだ配偶者（奥さん）がいないことを確認します
        if (nagamasa.wifeIds && nagamasa.wifeIds.length > 0) return false;
        
        // 6. お市（姫ID: 2）を織田家が所有しており、未婚であるか確認します
        if (!game.princesses) return false;
        
        const oichi = game.princesses.find(p => p.id === 2);
        if (!oichi) return false; // お市のデータが見つからなければストップします

        // 7. お市が未婚であることと、「今の状況（現在の所属）」が織田家であることを確認します
        // ※万が一「今の所属」のデータがうまく作られていなかった時の保険として、「元々の実家」も確認します
        const isOdaPrincess = (oichi.currentClanId === nobunaga.clan || oichi.originalClanId === nobunaga.clan);
        if (oichi.status !== 'unmarried' || !isOdaPrincess) return false;

        // 8. ここを追加します：織田信長勢力が将軍候補（または将軍）を抱えているか確認します
        const candidate = game.bushos.find(b => b.clan === nobunaga.clan && b.courtRankIds && (game.courtRankSystem.RANK_IDS_CANDIDATE.some(id => b.courtRankIds.includes(id)) || b.courtRankIds.includes(game.courtRankSystem.RANK_ID_SHOGUN)));
        if (!candidate) return false;

        // 9. 六角義賢（ID: 1018003）または六角義治（ID: 1018004）が大名であるか確認します
        const rokkakuDaimyo = window.EventCheck.getDaimyo(game, [1018003, 1018004]);
        if (!rokkakuDaimyo) return false;

        // 10. 浅井家と六角家が敵対関係にあるか確認します
        if (game.diplomacyManager) {
            const rel = game.diplomacyManager.getRelation(nagamasa.clan, rokkakuDaimyo.clan);
            if (!rel || rel.status !== '敵対') return false;

            // ★織田家と浅井家がすでに婚姻関係ではないことを確認します
            const odaAzaiRel = game.diplomacyManager.getRelation(nobunaga.clan, nagamasa.clan);
            // すでに結婚シールが貼られている場合はイベントをストップします
            if (odaAzaiRel && odaAzaiRel.isMarriage) {
                return false;
            }

        } else {
            return false;
        }

        // すべての条件をクリアしたらイベント発生です！
        return true;
    },
    
    execute: async function(game) {
        const nobunaga = game.getBusho(1006006);
        const nagamasa = game.getBusho(1015005);
        const oichiId = 2;

        // 万が一姫のデータ集（game.princesses）が未定義だった時のエラーを防ぎます
        const oichi = game.princesses ? game.princesses.find(p => p.id === oichiId) : null;
        const nobunagaClan = game.getClan(nobunaga.clan);
        const nagamasaClan = game.getClan(nagamasa.clan);

        if (!oichi || !nobunagaClan || !nagamasaClan) return; // 万が一データがない場合の安全装置です

        // 将軍候補の情報を取得しておきます
        const candidate = game.bushos.find(b => b.clan === nobunaga.clan && b.courtRankIds && (game.courtRankSystem.RANK_IDS_CANDIDATE.some(id => b.courtRankIds.includes(id)) || b.courtRankIds.includes(game.courtRankSystem.RANK_ID_SHOGUN)));
        const candidateName = candidate ? candidate.fullName : "将軍";

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

        // ④ 外交システムで支配・従属の婚姻関係を結びます
        if (game.diplomacyManager) {
            // ★変更：状態を「支配」（織田が支配、浅井が従属）にします
            game.diplomacyManager.changeStatus(nobunaga.clan, nagamasa.clan, '支配', 0);
            
            // 織田家から見た関係に「結婚シール」と「イベントシール」を貼り、仲良し度を100にします
            const relA = game.diplomacyManager.getDiplomacyData(nobunaga.clan, nagamasa.clan);
            if (relA) {
                relA.isMarriage = true;
                relA.isEvent = true; // ★追加：イベントによる関係であることを覚えさせます
                relA.sentiment = 100;
            }
            
            // 浅井家から見た関係にもシールを貼り、仲良し度を100にします
            const relB = game.diplomacyManager.getDiplomacyData(nagamasa.clan, nobunaga.clan);
            if (relB) {
                relB.isMarriage = true;
                relB.isEvent = true; // ★追加：イベントによる関係であることを覚えさせます
                relB.sentiment = 100;
            }
        }

        // ⑤ 画面にメッセージを出してお知らせします
        // ★変更：家名や武将名を指定の形に整えます
        const odaName = nobunaga.clanNameStr || "織田家";
        const azaiName = nagamasa.clanNameStr || "浅井家";
        const oichiName = oichi.name;
        const nagamasaName = nagamasa.fullName;

        // ★変更：ご希望の文章に変更します
        const msg = `亡き将軍の後継者である${candidateName}公の要請に応じ、${azaiName}が${odaName}に従属しました。\n${odaName}の${oichiName}が${nagamasaName}に輿入れしました。`;
        
        game.ui.log(`【イベント】織田・浅井婚姻：${msg}`);
        await game.ui.showDialogAsync(msg, false, 0);
    }
});

// ==========================================
// ★ 遠山家乗っ取りイベント
// ==========================================
window.GameEvents.push({
    id: "historical_toyama_takeover",
    timing: "busho_death", // ★ 武将が死亡した瞬間にチェックします
    isOneTime: true,       // 一度だけ発生します
    
    checkCondition: function(game, context) {
        // 1. 死亡した武将のデータを受け取っているか確認します
        if (!context || !context.deadBusho) return false;
        const deadBusho = context.deadBusho;

        // 2. 死亡したのが遠山景任（ID: 1012007）であるか確認します
        if (deadBusho.id !== 1012007) return false;

        // 3. プレイヤーが遠山家を担当している場合はイベントを起こしません
        if (game.playerClanId === deadBusho.clan) return false;

        // 4. 遠山景任が大名であるか確認します
        if (!deadBusho.isDaimyo || deadBusho.clan === 0) return false;

        // 5. 織田信長（ID: 1006006）が大名であるか確認します
        const nobunaga = window.EventCheck.getDaimyo(game, 1006006);
        if (!nobunaga) return false;

        // 6. 遠山家が織田家に「従属」しているか確認します
        if (!game.diplomacyManager) return false;
        const rel = game.diplomacyManager.getRelation(deadBusho.clan, nobunaga.clan);
        if (!rel || rel.status !== '従属') return false;

        // 7. 織田勝長（ID: 1006013）が存在し、織田信長勢力に所属しているか（生まれていて未登場の場合も含む）確認します
        const katsunaga = game.getBusho(1006013);
        if (!katsunaga || katsunaga.status === 'dead' || katsunaga.status === 'not_born') return false;
        
        // 勝長が「生まれているが未登場（unborn）」で、出生前フラグが立っている場合はダメ
        if (katsunaga.status === 'unborn' && katsunaga.isNotBorn) return false;
        
        // 勝長の所属が織田家か、未登場なら父親の所属が織田家か確認します
        let belongsToOda = false;
        if (katsunaga.clan === nobunaga.clan) {
            belongsToOda = true;
        } else if (katsunaga.status === 'unborn' && katsunaga.realFatherId > 0) {
            const father = game.getBusho(katsunaga.realFatherId);
            if (father && father.clan === nobunaga.clan) {
                belongsToOda = true;
            }
        }
        
        if (!belongsToOda) return false;

        // 全ての条件を満たしたらイベント発生です！
        return true;
    },
    
    execute: async function(game, context) {
        const deadBusho = context.deadBusho;
        const nobunaga = game.getBusho(1006006);
        const katsunaga = game.getBusho(1006013);
        
        const toyamaClanId = deadBusho.clan;
        const odaClanId = nobunaga.clan;
        const toyamaClan = game.getClan(toyamaClanId);
        const odaClan = game.getClan(odaClanId);
        
        // ★ ここが重要です！通常の死亡メッセージや家督相続を「スキップする」ようにフラグを立てます
        context.skipNormalMessage = true;
        context.skipDaimyoSuccession = true;

        // 遠山景任の居城（死ぬ前にいた城）をメモしておきます
        const targetCastleId = deadBusho.castleId;
        const targetCastle = game.getCastle(targetCastleId);
        const castleName = targetCastle ? targetCastle.name : "居城";

        const deadName = deadBusho.fullName;
        const odaName = odaClan ? odaClan.name : "織田家";
        const katsunagaName = katsunaga.fullName;

        // ----------------------------------------------------
        // 1. 遠山景任勢力が織田信長勢力に吸収される
        // ----------------------------------------------------
        // 共通の魔法を呼び出します（景任本人は除外します）
        window.EventAction.absorbClan(game, toyamaClanId, odaClanId, deadBusho.id);

        // ----------------------------------------------------
        // 2. 織田勝長が、遠山景任の養子になる
        // ----------------------------------------------------
        katsunaga.adoptiveFatherId = deadBusho.id;
        
        // お互いの一門（家族）リストに番号を書き足します
        if (!katsunaga.baseFamilyIds.includes(deadBusho.id)) {
            katsunaga.baseFamilyIds.push(deadBusho.id);
        }
        if (!deadBusho.baseFamilyIds.includes(katsunaga.id)) {
            deadBusho.baseFamilyIds.push(katsunaga.id);
        }
        // 親戚の繋がりを整理する魔法を呼び出します
        if (typeof FamilyLinker !== 'undefined' && FamilyLinker.linkAdoptiveRelations) {
            FamilyLinker.linkAdoptiveRelations(game.bushos);
        }
        katsunaga.updateFamilyIds(game.princesses || []);

        // ----------------------------------------------------
        // 3. 織田勝長が遠山景任の居城の城主になる
        // ----------------------------------------------------
        // 勝長がまだ未登場（unborn）の場合は、ゲームに登場（active）させます
        if (katsunaga.status === 'unborn') {
            katsunaga.status = 'active';
            katsunaga.loyalty = 100; // 初登場時は忠誠度100にします
        }
        
        if (targetCastle) {
            // 勝長をそのお城へ移動させます
            window.EventAction.moveBusho(game, katsunaga, targetCastleId);

            // 勝長を新しい城主に任命します
            window.EventAction.appointCastellan(game, katsunaga, targetCastle);
        }

        // ----------------------------------------------------
        // 4. 織田勝長の貢献度が500以下なら、500になる
        // ----------------------------------------------------
        if ((katsunaga.achievementTotal || 0) < 300) {
            katsunaga.achievementTotal = 300;
        }

        // ----------------------------------------------------
        // 5. メッセージの表示
        // ----------------------------------------------------
        const toyamaClanName = toyamaClan ? toyamaClan.name : "遠山家";
        const msg = `${toyamaClanName}の${deadName}が死亡し、${odaName}の${katsunagaName}が養子入りして家督を継ぎました。`;
        
        game.ui.log(`【当主交代】${msg}`);
        await game.ui.showDialogAsync(msg, false, 0);
    }
});

// ==========================================
// ★ 岐阜城改称イベント
// ==========================================
window.GameEvents.push({
    id: "historical_rename_gifu_castle",
    timing: "startMonth_before", // 毎月の初めに条件を満たしているかチェックします
    isOneTime: true,             // このイベントは一度発生したら二度と起きません
    
    checkCondition: function(game) {
        // 1. 織田信長（ID: 1006006）が存在し、大名であるか確認します
        const nobunaga = window.EventCheck.getDaimyo(game, 1006006);
        if (!nobunaga) return false;

        // 2. 織田信長の勢力が、稲葉山城（ID: 3）を所有しているか確認します
        const inabayama = game.getCastle(3);
        if (!inabayama || inabayama.ownerClan !== nobunaga.clan) return false;

        // 3. すでに城の名前が「岐阜城」になっていないか確認します
        if (inabayama.name === "岐阜城") return false;

        // 4. 美濃国（地方ID: 27）に、織田家と敵対している勢力の城がないか確認します
        const odaClanId = nobunaga.clan;
        const minoCastles = game.castles.filter(c => c.provinceId === 27);
        
        let hasEnemyInMino = false;
        if (game.diplomacyManager) {
            for (let c of minoCastles) {
                // 空き城（0）ではなく、織田家自身の城でもない場合を調べます
                if (c.ownerClan !== 0 && c.ownerClan !== odaClanId) {
                    // その城の持ち主と織田家の関係をチェックします
                    const rel = game.diplomacyManager.getRelation(odaClanId, c.ownerClan);
                    // 敵対状態の勢力が見つかったら、「敵がいる」という目印（フラグ）を立てます
                    if (rel && rel.status === '敵対') {
                        hasEnemyInMino = true;
                        break; // ひとつでも見つかれば十分なので、探すのをやめます
                    }
                }
            }
        }
        
        // 敵対勢力の城が美濃国にひとつでもあったら、イベントは起きません（ストップします）
        if (hasEnemyInMino) return false;

        // 5. ★追加：織田家が清洲城（ID: 7）を所有しているか確認します
        const kiyosu = game.getCastle(7);
        if (!kiyosu || kiyosu.ownerClan !== nobunaga.clan) return false;

        // すべての条件を無事にクリアしたら、イベント発生の合図（true）を出します
        return true;
    },
    
    execute: async function(game) {
        // ここからが、イベントが起きた時に実際に実行される処理（結果）です
        const nobunaga = game.getBusho(1006006);
        const inabayama = game.getCastle(3);
        const kiyosu = game.getCastle(7); // ★追加：清洲城のデータも準備します
        const odaClanId = nobunaga.clan;

        // 万が一データがない場合のエラーを防ぎます
        if (!nobunaga || !inabayama || !kiyosu) return; 

        // 名前が変わってしまう前に、「現在の武将の名前」と「現在のお城の名前」をメモしておきます！
        const nobunagaName = nobunaga.fullName;
        const nobunagaGivenName = nobunaga.givenName || "信長";
        const nobunagaFace = nobunaga.faceIcon || "unknown_face.webp";
        const oldCastleName = inabayama.name;

        // 信長様の官位を調べてメモしておきます
        let nobunagaTitle = "上総介";
        if (game.courtRankSystem && typeof game.courtRankSystem.getHighestRankName === 'function') {
            const rankName = game.courtRankSystem.getHighestRankName(nobunaga);
            if (rankName !== "なし") {
                nobunagaTitle = rankName;
            }
        }

        // セリフの台本に渡すデータ（配役表）を準備します
        const args = {
            nobunagaName: nobunagaName,
            nobunagaGivenName: nobunagaGivenName,
            nobunagaFace: nobunagaFace,
            nobunagaTitle: nobunagaTitle
        };

        // 音楽を清洲同盟と同じものに変更します
        if (window.AudioManager) {
            window.AudioManager.memorizeCurrentBgm();
            window.AudioManager.playBGM("06_Snowy Sacred Approach.ogg");
        }

        // 新しく書き足したイベントテキスト（台本）を呼び出して再生します
        if (window.EventTextManager && window.EventTextManager.rename_gifu_castle) {
            await window.EventTextManager.playSequence(game, window.EventTextManager.rename_gifu_castle(args));
        }

        // イベントが終わったので、音楽を元の曲に戻します
        if (window.AudioManager) {
            window.AudioManager.restoreMemorizedBgm();
        }

        // ① 稲葉山城の名前を「岐阜城」に変更します
        inabayama.name = "岐阜城";
        inabayama.yomi = "ぎふじょう";

        // ② 防御力と石高の最大値（器の大きさ）をそれぞれ500大きくします
        inabayama.maxDefense = inabayama.maxDefense + 500;
        inabayama.maxKokudaka = Math.min(99999, inabayama.maxKokudaka + 500);

        // ③ 岐阜城の防御力と民忠を、上限（最大値）まで回復させます
        inabayama.defense = inabayama.maxDefense;
        inabayama.peoplesLoyalty = inabayama.maxPeoplesLoyalty;

        // ④ 兵士を1000人増やし、人口は「5000人足した仮の数」を作って覚えておきます
        inabayama.soldiers = Math.min(99999, (inabayama.soldiers || 0) + 1000);
        let tempPopulation = (inabayama.population || 0) + 5000;

        // ⑤ ★追加：石高の入れ替え処理
        const inabayamaKokudaka = inabayama.kokudaka || 0;
        const kiyosuKokudaka = kiyosu.kokudaka || 0;
        if (kiyosuKokudaka > inabayamaKokudaka) {
            // 清洲城の方が石高が高い場合、数字を入れ替えます
            // その際、そのお城が持てる限界（maxKokudakaや99999）を超えないようにストッパーをかけます
            inabayama.kokudaka = Math.min(inabayama.maxKokudaka || 99999, kiyosuKokudaka);
            kiyosu.kokudaka = Math.min(kiyosu.maxKokudaka || 99999, inabayamaKokudaka);
        }

        // ⑥ ★追加：人口の入れ替え処理
        const kiyosuPopulation = kiyosu.population || 0;
        if (tempPopulation <= kiyosuPopulation) {
            // 5000人を足しても清洲城を上回っていない（少ないか同じ）なら、数字を入れ替えます
            // 人口の上限は99万9999なので、それを超えないようにストッパーをかけます
            inabayama.population = Math.min(999999, kiyosuPopulation);
            kiyosu.population = Math.min(999999, tempPopulation);
        } else {
            // 5000人を足して清洲城を上回ったなら、入れ替えずにそのまま足した数を確定させます
            inabayama.population = Math.min(999999, tempPopulation);
        }

        // ⑦ プレイヤーが織田家を担当していない（AIが操作している）場合のみ、特別な整理を行います
        if (game.playerClanId !== odaClanId) {
            
            // もし岐阜城が直轄（軍団ID: 0）以外だった場合、織田家のすべての軍団を解散させます
            if (inabayama.legionId !== 0) {
                if (game.legions && game.castleManager) {
                    const odaLegions = game.legions.filter(l => l.clanId === odaClanId && l.commanderId > 0);
                    odaLegions.forEach(legion => {
                        game.castleManager.disbandLegion(legion.id); // 城管理システムにお願いして解散させます
                    });
                }
            }
            
            // もし織田信長本人が岐阜城にいない場合、岐阜城に強制的にお引越しさせて城主にします
            if (nobunaga.castleId !== 3) {
                window.EventAction.moveBusho(game, nobunaga, 3);
                window.EventAction.appointCastellan(game, nobunaga, inabayama);
            }
        }

        // ⑧ 画面にイベントが起きたことのメッセージを出してお知らせします
        game.ui.log(`【イベント】${nobunagaName}が${oldCastleName}を「岐阜城」と改称しました。`);
    }
});

// ==========================================
// ★ 浜松城改称イベント
// ==========================================
window.GameEvents.push({
    id: "historical_rename_hamamatsu_castle",
    timing: "startMonth_before", // 毎月の初めに条件を満たしているかチェックします
    isOneTime: true,             // このイベントは一度発生したら二度と起きません
    
    checkCondition: function(game) {
        // 1. 徳川家康（ID: 1301006）が存在し、大名であるか確認します
        const motoyasu = window.EventCheck.getDaimyo(game, 1301006);
        if (!motoyasu) return false;

        const matsudairaClanId = motoyasu.clan;

        // 2. 徳川家康勢力が岡崎城（ID: 48）を所有しているか確認します
        const okazaki = game.getCastle(48);
        if (!okazaki || okazaki.ownerClan !== matsudairaClanId) return false;

        // 3. 遠江国（地方ID: 21）のすべての城を、徳川家康勢力が所有しているか確認します
        if (!window.EventCheck.ownsAllCastlesInProvince(game, matsudairaClanId, 21)) return false;

        // 4. 曳馬城（ID: 12）を取得し、すでに名前が「浜松城」になっていないか確認します
        const hikuma = game.getCastle(12);
        if (!hikuma || hikuma.name === "浜松城") return false;

        // すべての条件を無事にクリアしたら、イベント発生の合図を出します
        return true;
    },
    
    execute: async function(game) {
        // ここからが、イベントが起きた時に実際に実行される処理です
        const motoyasu = game.getBusho(1301006);
        const hikuma = game.getCastle(12);
        const okazaki = game.getCastle(48);
        const matsudairaClanId = motoyasu.clan;

        // 万が一データがない場合のエラーを防ぎます
        if (!motoyasu || !hikuma || !okazaki) return; 

        // Round21: 改称イベントの舞台である曳馬城（ID12）へ、イベント表示前にカメラを寄せます。
        if (game.ui && typeof game.ui.focusMapOnCastle === 'function') {
            await game.ui.focusMapOnCastle(12, { immediate: true, reason: 'historical_event' });
        }

        // 名前が変わってしまう前に、「現在の武将の名前」と「現在のお城の名前」をメモしておきます
        const motoyasuName = motoyasu.fullName;
        const oldCastleName = hikuma.name;

        // ① 曳馬城の名前を「浜松城」に変更します
        hikuma.name = "浜松城";
        hikuma.yomi = "はままつじょう";

        // ②防御力と石高の最大値（器の大きさ）をそれぞれ1000・1000大きくします
        hikuma.maxDefense = hikuma.maxDefense + 1000;
        hikuma.maxKokudaka = Math.min(99999, hikuma.maxKokudaka + 1000);

        // ③ 浜松城の防御力と民忠を、上限（最大値）まで回復させます
        hikuma.defense = hikuma.maxDefense;
        hikuma.peoplesLoyalty = hikuma.maxPeoplesLoyalty;

        // ④ 兵士を1000人増やし、人口は「5000人足した仮の数」を作って覚えておきます
        hikuma.soldiers = Math.min(99999, (hikuma.soldiers || 0) + 1000);
        let tempPopulation = (hikuma.population || 0) + 5000;

        // ⑤ 石高の入れ替え処理
        const hikumaKokudaka = hikuma.kokudaka || 0;
        const okazakiKokudaka = okazaki.kokudaka || 0;
        if (okazakiKokudaka > hikumaKokudaka) {
            // 岡崎城の方が石高が高い場合、数字を入れ替えます
            // その際、そのお城が持てる限界を超えないようにストッパーをかけます
            hikuma.kokudaka = Math.min(hikuma.maxKokudaka || 99999, okazakiKokudaka);
            okazaki.kokudaka = Math.min(okazaki.maxKokudaka || 99999, hikumaKokudaka);
        }

        // ⑥ 人口の入れ替え処理
        const okazakiPopulation = okazaki.population || 0;
        if (okazakiPopulation > tempPopulation) {
            // 5000人を足した後の浜松城の人口より、岡崎城の人口の方が大きい（上回っている）なら入れ替えます
            hikuma.population = Math.min(999999, okazakiPopulation);
            okazaki.population = Math.min(999999, tempPopulation);
        } else {
            // 上回っていないなら、入れ替えずにそのまま足した数を確定させます
            hikuma.population = Math.min(999999, tempPopulation);
        }

        // ⑦ プレイヤーが担当していない（AIが操作している）場合のみ、特別な整理を行います
        if (game.playerClanId !== matsudairaClanId) {
            
            // もし浜松城が直轄（軍団ID: 0）以外だった場合、徳川家のすべての軍団を解散させます
            if (hikuma.legionId !== 0) {
                if (game.legions && game.castleManager) {
                    const matsudairaLegions = game.legions.filter(l => l.clanId === matsudairaClanId && l.commanderId > 0);
                    matsudairaLegions.forEach(legion => {
                        game.castleManager.disbandLegion(legion.id); // 城管理システムにお願いして解散させます
                    });
                }
            }
            
            // もし徳川家康本人が浜松城にいない場合、浜松城に強制的にお引越しさせて城主にします
            if (motoyasu.castleId !== 12) {
                window.EventAction.moveBusho(game, motoyasu, 12);
                window.EventAction.appointCastellan(game, motoyasu, hikuma);
            }
        }

        // ⑧ 画面にイベントが起きたことのメッセージを出してお知らせします
        const msg = `${motoyasuName}が居城を${oldCastleName}に移し、「浜松城」と改称しました！`;
        game.ui.log(`【イベント】${motoyasuName}が${oldCastleName}を「浜松城」と改称しました。`);
        await game.ui.showDialogAsync(msg, false, 0);
    }
});

// ==========================================
// ★ 永禄の変（将軍襲撃イベント）
// 備考：三好家プレイヤーはイベントを進行する場合自力での将軍撃破が必要
// ==========================================
window.GameEvents.push({
    id: "historical_eiroku_no_hen",
    timing: "startMonth_before", // 月初の処理前に発生します
    isOneTime: true,             // 一度きりの歴史イベントです
    
    checkCondition: function(game) {
        // 1. 三好長慶（ID: 1020005）が死亡しているか確認します
        const nagayoshi = game.getBusho(1020005);
        if (nagayoshi && nagayoshi.status !== 'dead') return false;

        // 2. 三好義継（ID: 1020014）が大名として存在するか確認します
        const yoshitsugu = window.EventCheck.getDaimyo(game, 1020014);
        if (!yoshitsugu) return false;
        
        const miyoshiClanId = yoshitsugu.clan;

        // 3. 三好家に特定の３名（三好長逸、三好政勝、石成友通）が所属しているか確認します
        const requiredMembers = [1020021, 1020024, 1020029];
        for (let id of requiredMembers) {
            const member = game.getBusho(id);
            // 死んでいる、生まれていない、浪人、または三好家以外にいる場合はイベントが起きません
            if (!member || member.status === 'dead' || member.status === 'unborn' || member.status === 'ronin' || member.clan !== miyoshiClanId) {
                return false;
            }
        }

        // 4. 足利義輝（ID: 1017003）が生存しており、大名であるか確認します
        const yoshiteru = window.EventCheck.getDaimyo(game, 1017003);
        if (!yoshiteru) return false;
        
        const ashikagaClanId = yoshiteru.clan;

        // 5. 細川藤孝（ID: 1017029）が生存し、将軍勢力に所属しているか確認します
        const fujitaka = game.getBusho(1017029);
        if (!fujitaka || !window.EventCheck.isAlive(game, 1017029) || fujitaka.clan !== ashikagaClanId) return false;

        // 6. 一乗院覚慶（足利義昭・ID: 1017004）が生存しているか確認します
        if (!window.EventCheck.isAlive(game, 1017004)) return false;

        // 7. プレイヤーが足利家・三好家を担当している場合はイベントを起こしません
        if (game.playerClanId === ashikagaClanId) return false;
        if (game.playerClanId === miyoshiClanId) return false;

        // 8. 足利家と三好家の領地（お城同士の道）が隣接しているか確認します
        if (!window.EventCheck.areClansAdjacent(game, ashikagaClanId, miyoshiClanId)) return false;

        // すべての条件を満たしたらイベント発生の合図を出します
        return true;
    },
    
    execute: async function(game) {
        const yoshiteru = game.getBusho(1017003);
        const yoshitsugu = game.getBusho(1020014);
        const nagayasu = game.getBusho(1020021);
        const masakatsu = game.getBusho(1020024);
        const tomomichi = game.getBusho(1020029);
        const nagayoshi = game.getBusho(1020005);
        const fujitaka = game.getBusho(1017029);
        const yoshiaki = game.getBusho(1017004);
        
        const ashikagaClanId = yoshiteru.clan;
        const miyoshiClanId = yoshitsugu.clan;
        
        // 大名家のデータを取得し、現在の家名（動的）を特定します
        const miyoshiClan = game.getClan(miyoshiClanId);
        const miyoshiClanName = miyoshiClan ? miyoshiClan.name : "三好家";
        const ashikagaClan = game.getClan(ashikagaClanId);
        const ashikagaClanName = ashikagaClan ? ashikagaClan.name : "足利家";
        const yoshiteruName = yoshiteru.fullName;
        
        const nagayasuCastle = nagayasu ? game.getCastle(nagayasu.castleId) : null;
        
        // 政勝の官位を調べる処理
        let masakatsuTitle = "下野守";
        if (masakatsu && game.courtRankSystem && typeof game.courtRankSystem.getHighestRankName === 'function') {
            const rankName = game.courtRankSystem.getHighestRankName(masakatsu);
            if (rankName !== "なし") {
                masakatsuTitle = rankName;
            }
        }
        
        const args = {
            nagayasuCastleName: nagayasuCastle ? nagayasuCastle.name : "居城",
            nagayasuCastleId: nagayasuCastle ? nagayasuCastle.id : null, // Round21: 三人衆会談のカメラ位置
            nagayasuName: nagayasu ? nagayasu.fullName : "三好長逸",
            nagayasuFace: nagayasu ? nagayasu.faceIcon : "unknown_face.webp",
            masakatsuName: masakatsu ? masakatsu.fullName : "三好政勝",
            masakatsuTitle: masakatsuTitle, // 三好政勝の官位
            masakatsuFace: masakatsu ? masakatsu.faceIcon : "unknown_face.webp",
            tomomichiName: tomomichi ? tomomichi.fullName : "石成友通",
            tomomichiFace: tomomichi ? tomomichi.faceIcon : "unknown_face.webp",
            yoshiteruName: yoshiteruName,
            yoshiteruGivenName: yoshiteru ? (yoshiteru.givenName || "義輝") : "義輝",
            yoshiteruFace: yoshiteru ? yoshiteru.faceIcon : "unknown_face.webp",
            miyoshiFamilyName: yoshitsugu ? (yoshitsugu.familyNameStr || "三好") : "三好",
            nagayoshiName: nagayoshi ? nagayoshi.fullName : "三好長慶",
            yoshitsuguName: yoshitsugu ? yoshitsugu.fullName : "三好義継",
            yoshitsuguGivenName: yoshitsugu ? (yoshitsugu.givenName || "義継") : "義継",
            fujitakaName: fujitaka ? fujitaka.fullName : "細川藤孝",
            fujitakaGivenName: fujitaka ? (fujitaka.givenName || "藤孝") : "藤孝",
            fujitakaFace: fujitaka ? fujitaka.faceIcon : "unknown_face.webp",
            yoshiakiGivenName: yoshiaki ? (yoshiaki.givenName || "義昭") : "義昭",
            year: game.year,
            month: game.month
        };

        if (window.AudioManager) {
            window.AudioManager.memorizeCurrentBgm();
            window.AudioManager.playBGM("SC_ex_Scene1_Duel.ogg");
        }
        
        if (window.EventTextManager && window.EventTextManager.eiroku_no_hen_part1) {
            await window.EventTextManager.playSequence(game, window.EventTextManager.eiroku_no_hen_part1(args));
        }
        
        if (window.AudioManager) {
            window.AudioManager.playBGM("SC_ex_Scene6_Fate.ogg");
        }
        
        if (window.EventTextManager && window.EventTextManager.eiroku_no_hen_part2) {
            await window.EventTextManager.playSequence(game, window.EventTextManager.eiroku_no_hen_part2(args));
        }

        if (window.AudioManager) {
            window.AudioManager.playBGM("SC_ex_Scene3_Odyssey.ogg");
        }

        if (window.EventTextManager && window.EventTextManager.eiroku_no_hen_part3) {
            await window.EventTextManager.playSequence(game, window.EventTextManager.eiroku_no_hen_part3(args));
        }
        
        if (window.AudioManager) {
            window.AudioManager.restoreMemorizedBgm();
        }

        // ① まず、足利家の城をすべて三好家のものにします
        const ashikagaCastles = game.getClanCastles(ashikagaClanId);
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

        const yoshitsuguName = yoshitsugu.fullName;

        // ⑥ 三好三人衆の忠誠度を100にします
        const trioIds = [1020021, 1020024, 1020029];
        trioIds.forEach(id => {
            const member = game.getBusho(id);
            if (member) {
                member.loyalty = 100;
            }
        });

        // ⑦ メッセージ表示（動的な名前を使用）
        const msg = `${yoshitsuguName}が二条御所を襲撃、${yoshiteruName}は討死し、${ashikagaClanName}の旧領はすべて${miyoshiClanName}の手に落ちました。`;
        game.ui.log(`【イベント】永禄の変：${msg}`);
        await game.ui.showDialogAsync(msg, false, 0);
        
    }
});

// ==========================================
// ★ 将軍庇護第１段階 足利義昭が朝倉家を頼る
// ==========================================
window.GameEvents.push({
    id: "historical_shogun_protection_1", 
    timing: "startMonth_before",
    isOneTime: true,
    
    checkCondition: function(game) {
        // 1. 足利義輝（ID: 1017003）が死亡しているか
        if (!window.EventCheck.isDead(game, 1017003)) return false;

        // 2. 一乗院覚慶（足利義昭・ID: 1017004）が生存し、左馬頭の官位を有し、大名ではないか確認します
        const yoshiaki = game.getBusho(1017004);
        if (!yoshiaki || !window.EventCheck.isAlive(game, 1017004) || yoshiaki.isDaimyo) return false;
        if (!yoshiaki.courtRankIds || !game.courtRankSystem.RANK_IDS_CANDIDATE.some(id => yoshiaki.courtRankIds.includes(id))) return false;

        // 3. 細川藤孝（ID: 1017029）が生存し、大名ではないか確認します
        const fujitaka = game.getBusho(1017029);
        if (!fujitaka || !window.EventCheck.isAlive(game, 1017029) || fujitaka.isDaimyo) return false;

        // 4. 朝倉義景（ID: 1007008）が大名であるか
        const asakuraDaimyo = window.EventCheck.getDaimyo(game, 1007008);
        if (!asakuraDaimyo) return false;
        
        // 5. 山城国（ID: 30）の拠点を１つ以上、三好義継または三好長逸が当主である勢力が所有しているか
        // 6. 松永久秀（ID: 1202002）が生存し、三好勢力に所属しているか、または自身が大名であるか
        const targetDaimyoIds = [1020014, 1020021];
        let isConditionMet = false;
        
        // まず、松永久秀が生きているか確認します
        if (!window.EventCheck.isAlive(game, 1202002)) return false;
        const hisahide = game.getBusho(1202002);
        
        // 松永久秀が独立して「大名」になっているかを調べます
        const isHisahideDaimyo = hisahide.isDaimyo && hisahide.clan !== 0;

        // 義継と長逸の勢力を順番にチェックし、どちらかが条件を満たせばOKとします
        for (let id of targetDaimyoIds) {
            const daimyo = window.EventCheck.getDaimyo(game, id);
            if (daimyo) {
                // その大名の勢力が山城国（ID: 30）に拠点を持っているかチェックします
                const yamashiroCastles = game.castles.filter(c => c.provinceId === 30);
                const hasYamashiroCastle = yamashiroCastles.some(c => c.ownerClan === daimyo.clan);
                
                // 松永久秀がその大名の勢力に所属しているかチェックします
                const belongsToDaimyo = hisahide.clan === daimyo.clan;
                
                // 山城国の拠点条件を満たし、かつ、松永久秀がその勢力に所属しているか、自身が大名になっていればクリアです
                if (hasYamashiroCastle && (belongsToDaimyo || isHisahideDaimyo)) {
                    isConditionMet = true;
                    break; // １つでも条件を満たす勢力が見つかれば、探すのをやめます
                }
            }
        }
        
        // どちらの勢力も条件を満たしていなければ、イベントをストップします
        if (!isConditionMet) return false;

        // 7. 一乗谷城（ID: 16）を朝倉勢力が所有しているか
        const ichijodani = game.getCastle(16);
        if (!ichijodani || ichijodani.ownerClan !== asakuraDaimyo.clan) return false;

        // 8. 朝倉勢力の威信が、滅亡していない勢力の中で上位１５位以内に入っているか
        const activeClans = game.clans.filter(c => c.id !== 0 && !c.isDestroyed);
        activeClans.sort((a, b) => (b.daimyoPrestige || 0) - (a.daimyoPrestige || 0));
        
        const top15 = activeClans.slice(0, 15);
        const isTop15 = top15.some(c => c.id === asakuraDaimyo.clan);
        if (!isTop15) return false;
        
        return true;
    },
    
    execute: async function(game) {
        const yoshiaki = game.getBusho(1017004);
        const fujitaka = game.getBusho(1017029);
        const wada = game.getBusho(1017035);
        const asakuraDaimyo = game.getBusho(1007008);
        
        const asakuraClanId = asakuraDaimyo.clan;
        const targetCastleId = asakuraDaimyo.castleId; 

        // 覚慶の還俗・改名・顔変更処理
        if (game.lifeSystem) {
            game.lifeSystem.applyDaimyoNameAndFaceChange(yoshiaki);
        }

        // 覚慶、細川藤孝とその一門、(生きていれば)和田惟政とその一門が、朝倉勢力の所属になる。（功績を半減させないルート）
        const targetBushos = [yoshiaki, fujitaka];

        // 細川藤孝の一門（1017030～1017033）を追加します
        const fujitakaFamilyIds = [1017030, 1017031, 1017032, 1017033];
        fujitakaFamilyIds.forEach(id => {
            const member = game.getBusho(id);
            // 存在していて、なおかつ生きているか、さらに大名ではないか確認してからリストに入れます
            if (member && window.EventCheck.isAlive(game, id) && !member.isDaimyo) {
                targetBushos.push(member);
            }
        });

        if (wada && window.EventCheck.isAlive(game, 1017035) && !wada.isDaimyo) {
            targetBushos.push(wada);

            // 和田惟政の一門（1017036）を追加します
            const wadaFamily = game.getBusho(1017036);
            if (wadaFamily && window.EventCheck.isAlive(game, 1017036) && !wadaFamily.isDaimyo) {
                targetBushos.push(wadaFamily);
            }
        }

        targetBushos.forEach(b => {
            if (game.affiliationSystem) {
                // 第4引数: 100(忠誠固定), 第5引数: true(功績維持)
                game.affiliationSystem.joinClan(b, asakuraClanId, targetCastleId, 100, true);
            } else {
                b.clan = asakuraClanId;
                b.castleId = targetCastleId;
                b.status = 'active';
                b.loyalty = 100;
            }
        });

        // 覚慶と細川藤孝、和田惟政の忠誠度が１００になる。
        targetBushos.forEach(b => b.loyalty = 100);

        // 朝倉勢力の武将すべての忠誠度が５アップする。（上限１００）
        const asakuraBushos = game.bushos.filter(b => b.clan === asakuraClanId && b.status === 'active');
        asakuraBushos.forEach(b => {
            b.loyalty = Math.min(100, (b.loyalty || 0) + 5);
        });
        
        // 朝倉勢力の全ての拠点の民忠が１００になり、それぞれ人口・米が２０００、兵士・金が１０００アップする。
        const asakuraCastles = game.getClanCastles(asakuraClanId);
        asakuraCastles.forEach(c => {
            c.peoplesLoyalty = 100; 
            c.population = Math.min(999999, (c.population || 0) + 2000);
            c.rice = Math.min(99999, (c.rice || 0) + 2000);
            c.soldiers = Math.min(99999, (c.soldiers || 0) + 1000);
            c.gold = Math.min(99999, (c.gold || 0) + 1000);
        });

        // --- 会話イベントのための準備 ---
        // 細川藤孝の官位を取得（なければ下の名前）
        let fujitakaTitle = fujitaka.givenName || fujitaka.fullName;
        if (game.courtRankSystem && typeof game.courtRankSystem.getHighestRankName === 'function') {
            const rankName = game.courtRankSystem.getHighestRankName(fujitaka);
            if (rankName !== "なし") {
                fujitakaTitle = rankName;
            }
        }

        // 朝倉義景の官位を取得（なければ下の名前）
        let asakuraTitle = asakuraDaimyo.givenName || asakuraDaimyo.fullName;
        if (game.courtRankSystem && typeof game.courtRankSystem.getHighestRankName === 'function') {
            const rankName = game.courtRankSystem.getHighestRankName(asakuraDaimyo);
            if (rankName !== "なし") {
                asakuraTitle = rankName;
            }
        }

        // 会話に出てくる他の武将の名前を用意します
        const yoshiteru = game.getBusho(1017003);
        const yoshiteruName = yoshiteru ? yoshiteru.fullName : "足利義輝";
        
        const hisahide = game.getBusho(1202002);
        const hisahideFamilyName = hisahide ? (hisahide.familyName || hisahide.name.split('|')[0] || "松永") : "松永";
        
        const yoshitsugu = game.getBusho(1020014); 
        const miyoshiFamilyName = yoshitsugu ? (yoshitsugu.familyName || yoshitsugu.name.split('|')[0] || "三好") : "三好";

        // ★追加：上杉、毛利、織田の条件チェック
        let showExtraNarration = false;
        
        // 3人が「大名」として存在するかチェックします
        const kenshin = window.EventCheck.getDaimyo(game, 1001015);
        const motonari = window.EventCheck.getDaimyo(game, 1025002);
        const nobunaga = window.EventCheck.getDaimyo(game, 1006006);

        // それぞれのお城（春日山城:2、吉田郡山城:120、清洲城:7）のデータを取得します
        const kasugayama = game.getCastle(2);
        const yoshidakoriyama = game.getCastle(120);
        const kiyosu = game.getCastle(7);

        // 名前を入れるための空箱だけを用意します（未定義のままにします）
        let kenshinName;
        let motonariName;
        let nobunagaName;

        // 全員が大名として存在していて、かつお城のデータも存在するか確認します
        if (kenshin && motonari && nobunaga && kasugayama && yoshidakoriyama && kiyosu) {
            // それぞれの勢力（clan）が、指定されたお城を所有しているか確認します
            if (kasugayama.ownerClan === kenshin.clan && 
                yoshidakoriyama.ownerClan === motonari.clan && 
                kiyosu.ownerClan === nobunaga.clan) {
                
                showExtraNarration = true; // 条件クリアのシールを貼ります
                
                // 台本に渡す名前を、ゲーム内の最新のフルネームに更新します
                kenshinName = kenshin.fullName;
                motonariName = motonari.fullName;
                nobunagaName = nobunaga.fullName;
            }
        }

        // 台本に渡す情報をひとまとめにします
        const args = {
            year: game.year,
            month: game.month,
            fujitakaName: fujitaka.fullName,
            fujitakaFamilyName: fujitaka.familyName || fujitaka.name.split('|')[0] || "細川",
            fujitakaFace: fujitaka.faceIcon || "unknown_face.webp",
            fujitakaTitle: fujitakaTitle,
            asakuraName: asakuraDaimyo.fullName,
            asakuraFace: asakuraDaimyo.faceIcon || "unknown_face.webp",
            asakuraTitle: asakuraTitle,
            yoshiteruName: yoshiteruName,
            hisahideFamilyName: hisahideFamilyName,
            miyoshiFamilyName: miyoshiFamilyName,
            // ★追加：台本に追加の情報を渡します
            showExtraNarration: showExtraNarration,
            kenshinName: kenshinName,
            motonariName: motonariName,
            nobunagaName: nobunagaName
        };

        // ★追加：BGMをメモして専用の曲に変更します
        if (window.AudioManager) {
            window.AudioManager.memorizeCurrentBgm();
            window.AudioManager.playBGM("SC_ex_Field1_Cruising1.ogg");
        }

        // event_text.js に書いた台本を再生します！
        if (window.EventTextManager && window.EventTextManager.shogun_protection_1) {
            await window.EventTextManager.playSequence(game, window.EventTextManager.shogun_protection_1(args));
        }

        // ★追加：イベントが終わったのでBGMを元に戻します
        if (window.AudioManager) {
            window.AudioManager.restoreMemorizedBgm();
        }
        // ------------------------------------

        const yoshiakiName = yoshiaki.fullName;
        const asakuraNameDisplay = asakuraDaimyo.fullName;
        const asakuraClanName = game.getClan(asakuraClanId)?.name || "朝倉家";
        const msg = `${yoshiakiName}は幕府再興のため、${asakuraNameDisplay}を頼り${asakuraClanName}の庇護下に入りました。`;
        
        game.ui.log(`【イベント】${msg}`);
    }
});

// ==========================================
// ★ 将軍庇護第２段階 足利義昭が織田家を頼る
// 備考：朝倉家プレイヤーは勢力拡大や関連武将の追放で回避可能
// ==========================================
window.GameEvents.push({
    id: "historical_shogun_protection_2",
    timing: "startMonth_before",
    isOneTime: true,
    
    checkCondition: function(game) {
        // 1. 足利義昭、明智光秀、細川藤孝が朝倉義景勢力に所属しているか
        const yoshiaki = game.getBusho(1017004);
        const mitsuhide = game.getBusho(1201003);
        const fujitaka = game.getBusho(1017029);
        const asakuraDaimyo = window.EventCheck.getDaimyo(game, 1007008);

        if (!yoshiaki || !mitsuhide || !fujitaka || !asakuraDaimyo) return false;
        
        const asakuraClanId = asakuraDaimyo.clan;
        if (yoshiaki.clan !== asakuraClanId || mitsuhide.clan !== asakuraClanId || fujitaka.clan !== asakuraClanId) return false;

        // 2. 織田信長勢力の威信が、朝倉勢力の威信の１．５倍以上あるか
        const nobunagaDaimyo = window.EventCheck.getDaimyo(game, 1006006);
        if (!nobunagaDaimyo) return false;

        const nobunagaClanId = nobunagaDaimyo.clan;
        const odaClan = game.getClan(nobunagaClanId);
        const asakuraClan = game.getClan(asakuraClanId);

        if (!odaClan || !asakuraClan) return false;
        if ((odaClan.daimyoPrestige || 0) < (asakuraClan.daimyoPrestige || 0) * 1.5) return false;

        // 3. 松永久秀（ID: 1202002）が大名であるか確認します
        const hisahideDaimyo = window.EventCheck.getDaimyo(game, 1202002);
        if (!hisahideDaimyo) return false;

        // 4. 今川義元（ID: 1004009）が死亡しているか確認します
        if (!window.EventCheck.isDead(game, 1004009)) return false;

        // 5. 織田勢力が稲葉山城（ID: 3）を所有しているか確認します
        const inabayama = game.getCastle(3);
        if (!inabayama || inabayama.ownerClan !== nobunagaClanId) return false;

        // 6. 朝倉勢力が山城国（ID30）・近江国（ID29）にある拠点を所有していたらイベントは起きません
        const checkProvinceIds = [29, 30];
        const checkCastles = game.castles.filter(c => checkProvinceIds.includes(c.provinceId));
        const asakuraHasCastleInTarget = checkCastles.some(c => c.ownerClan === asakuraClanId);
        if (asakuraHasCastleInTarget) return false;

        // 7. 織田勢力が尾張国（地方ID: 23）のすべての城を所有しているか確認します
        if (!window.EventCheck.ownsAllCastlesInProvince(game, nobunagaClanId, 23)) return false;

        // 8. 美濃国（地方ID: 27）に、織田家と敵対している勢力の城がないか確認します
        const minoCastles = game.castles.filter(c => c.provinceId === 27);
        let hasEnemyInMino = false;
        if (game.diplomacyManager) {
            for (let c of minoCastles) {
                // 空き城（0）ではなく、織田家自身の城でもない場合を調べます
                if (c.ownerClan !== 0 && c.ownerClan !== nobunagaClanId) {
                    // その城の持ち主と織田家の関係をチェックします
                    const rel = game.diplomacyManager.getRelation(nobunagaClanId, c.ownerClan);
                    // 敵対状態の勢力が見つかったら、「敵がいる」という目印（フラグ）を立てます
                    if (rel && rel.status === '敵対') {
                        hasEnemyInMino = true;
                        break; // ひとつでも見つかれば十分なので、探すのをやめます
                    }
                }
            }
        }
        
        // 敵対勢力の城が美濃国にひとつでもあったら、イベントは起きません
        if (hasEnemyInMino) return false;

        return true;
    },
    
    execute: async function(game) {
        const yoshiaki = game.getBusho(1017004);
        const mitsuhide = game.getBusho(1201003);
        const fujitaka = game.getBusho(1017029);
        const wada = game.getBusho(1017035);
        const asakuraDaimyo = game.getBusho(1007008);
        const nobunagaDaimyo = game.getBusho(1006006);
        const hisahideDaimyo = game.getBusho(1202002);
        
        const asakuraClanId = asakuraDaimyo.clan;
        const nobunagaClanId = nobunagaDaimyo.clan;
        const targetCastleId = nobunagaDaimyo.castleId;
        const hisahideClanId = hisahideDaimyo.clan;

        // --- 会話イベントのための準備 ---
        const yoshiteru = game.getBusho(1017003);
        const yoshiteruName = yoshiteru ? yoshiteru.fullName : "足利義輝";
        const yoshiakiName = yoshiaki.fullName;
        const yoshiakiGivenName = yoshiaki.givenName || "義昭";

        // 信長関連
        const nobunagaName = nobunagaDaimyo.fullName;
        const odaFamilyName = nobunagaDaimyo.familyNameStr || "織田";
        const nobunagaFace = nobunagaDaimyo.faceIcon || "unknown_face.webp";
        let nobunagaTitle = nobunagaDaimyo.givenName || nobunagaDaimyo.fullName;
        if (game.courtRankSystem && typeof game.courtRankSystem.getHighestRankName === 'function') {
            const rankName = game.courtRankSystem.getHighestRankName(nobunagaDaimyo);
            if (rankName !== "なし") {
                nobunagaTitle = rankName;
            } else {
                nobunagaTitle = "上総介";
            }
        } else {
             nobunagaTitle = "上総介";
        }
        
        let nobunagaProvinceName = "美濃";
        if (nobunagaDaimyo.castleId) {
            const c = game.getCastle(nobunagaDaimyo.castleId);
            if (c) {
                const p = game.provinces.find(prov => prov.id === c.provinceId);
                if (p) nobunagaProvinceName = p.shortName;
            }
        }

        // 朝倉義景関連
        const asakuraName = asakuraDaimyo.fullName;
        const asakuraFamilyName = asakuraDaimyo.familyNameStr || "朝倉";
        
        let asakuraProvinceName = "越前";
        let asakuraCastleName = "城";
        if (asakuraDaimyo.castleId) {
            const c = game.getCastle(asakuraDaimyo.castleId);
            if (c) {
                asakuraCastleName = c.name;
                const p = game.provinces.find(prov => prov.id === c.provinceId);
                if (p) asakuraProvinceName = p.shortName;
            }
        }

        // 明智光秀関連
        const mitsuhideName = mitsuhide.fullName;
        const mitsuhideFace = mitsuhide.faceIcon || "unknown_face.webp";
        let mitsuhideTitle = mitsuhide.givenName || mitsuhide.fullName;
        if (game.courtRankSystem && typeof game.courtRankSystem.getHighestRankName === 'function') {
            const rankName = game.courtRankSystem.getHighestRankName(mitsuhide);
            if (rankName !== "なし") {
                mitsuhideTitle = rankName;
            } else {
                mitsuhideTitle = "十兵衛";
            }
        } else {
            mitsuhideTitle = "十兵衛";
        }

        // 松永久秀関連
        const hisahideName = hisahideDaimyo.fullName;

        const args = {
            year: game.year,
            month: game.month,
            nobunagaCastleId: targetCastleId, // Round21: 信長との会談場所
            yoshiteruName: yoshiteruName,
            yoshiakiName: yoshiakiName,
            yoshiakiGivenName: yoshiakiGivenName,
            asakuraName: asakuraName,
            asakuraFamilyName: asakuraFamilyName,
            asakuraProvinceName: asakuraProvinceName,
            asakuraCastleName: asakuraCastleName,
            nobunagaProvinceName: nobunagaProvinceName,
            nobunagaName: nobunagaName,
            hisahideName: hisahideName,
            mitsuhideName: mitsuhideName,
            mitsuhideFace: mitsuhideFace,
            odaFamilyName: odaFamilyName,
            nobunagaFace: nobunagaFace,
            nobunagaTitle: nobunagaTitle,
            mitsuhideTitle: mitsuhideTitle
        };

        if (window.AudioManager) {
            window.AudioManager.memorizeCurrentBgm();
            window.AudioManager.playBGM("SC_ex_Scene3_Odyssey.ogg");
        }

        if (window.EventTextManager && window.EventTextManager.shogun_protection_2) {
            await window.EventTextManager.playSequence(game, window.EventTextManager.shogun_protection_2(args));
        }

        if (window.AudioManager) {
            window.AudioManager.restoreMemorizedBgm();
        }

        // 移籍対象の武将リストを作成
        let targetBushos = [yoshiaki, mitsuhide, fujitaka];

        // 細川藤孝の一門（1017030～1017033）が朝倉に居れば一緒に移籍させます
        const fujitakaFamilyIds = [1017030, 1017031, 1017032, 1017033];
        fujitakaFamilyIds.forEach(id => {
            const member = game.getBusho(id);
            // 存在していて、朝倉家に所属しており、生きているか確認します
            if (member && member.clan === asakuraClanId && window.EventCheck.isAlive(game, id)) {
                targetBushos.push(member);
            }
        });

        if (wada && wada.clan === asakuraClanId && window.EventCheck.isAlive(game, 1017035)) {
            targetBushos.push(wada);

            // 和田惟政の一門（1017036）が朝倉に居れば一緒に移籍させます
            const wadaFamily = game.getBusho(1017036);
            if (wadaFamily && wadaFamily.clan === asakuraClanId && window.EventCheck.isAlive(game, 1017036)) {
                targetBushos.push(wadaFamily);
            }
        }

        // 明智光秀の家臣（ID1201000～ID1201999）が朝倉に居れば一緒に移籍
        game.bushos.forEach(b => {
            // 死亡している武将以外（現役、または未登場）ならそのまま移籍リストに入れます
            if (b.id >= 1201000 && b.id <= 1201999 && b.clan === asakuraClanId && b.id !== 1201003 && b.status !== 'dead') {
                targetBushos.push(b);
            }
        });

        // 移籍実行（功績を半減させないルートを通る）
        targetBushos.forEach(b => {
            if (game.affiliationSystem) {
                game.affiliationSystem.joinClan(b, nobunagaClanId, targetCastleId, 100, true);
            } else {
                b.clan = nobunagaClanId;
                b.castleId = targetCastleId;
                b.status = 'active';
                b.loyalty = 100;
            }
        });

        // 足利義昭、細川藤孝、和田惟政、明智光秀とその家臣の忠誠度が１００になる。
        targetBushos.forEach(b => {
            b.loyalty = 100;
        });

        // 織田勢力の武将すべての忠誠度が５アップする。（上限１００）
        const odaBushos = game.bushos.filter(b => b.clan === nobunagaClanId && b.status === 'active' && !targetBushos.includes(b));
        odaBushos.forEach(b => {
            b.loyalty = Math.min(100, (b.loyalty || 0) + 5);
        });

        // 明智光秀の功績が１０００上昇する。
        if (mitsuhide && targetBushos.includes(mitsuhide)) {
            mitsuhide.achievementTotal = (mitsuhide.achievementTotal || 0) + 1000;
        }

        // 織田勢力の全ての拠点の民忠が１００になり、それぞれ人口・米が５０００、兵士・金が２０００アップする。
        const odaCastles = game.getClanCastles(nobunagaClanId);
        odaCastles.forEach(c => {
            c.peoplesLoyalty = 100;
            c.population = Math.min(999999, (c.population || 0) + 5000);
            c.rice = Math.min(99999, (c.rice || 0) + 5000);
            c.soldiers = Math.min(99999, (c.soldiers || 0) + 2000);
            c.gold = Math.min(99999, (c.gold || 0) + 2000);
        });

        // 朝倉勢力の全ての拠点の民忠が１０低下し、それぞれ人口・兵士が０．７倍になる（小数点以下切り捨て）。
        const asakuraCastles = game.getClanCastles(asakuraClanId);
        asakuraCastles.forEach(c => {
            c.peoplesLoyalty = Math.max(0, (c.peoplesLoyalty || 0) - 10);
            c.population = Math.floor((c.population || 0) * 0.7);
            c.soldiers = Math.floor((c.soldiers || 0) * 0.7);
        });

        // 織田勢力と朝倉勢力が敵対し、友好度が０になる
        if (game.diplomacyManager) {
            game.diplomacyManager.changeStatus(nobunagaClanId, asakuraClanId, '敵対', 0);
            const relA = game.diplomacyManager.getRelation(nobunagaClanId, asakuraClanId);
            const relB = game.diplomacyManager.getRelation(asakuraClanId, nobunagaClanId);
            if (relA) relA.sentiment = 0;
            if (relB) relB.sentiment = 0;
        }

        // 織田勢力と、近江国（ID29）・山城国（ID30）・大和国（ID31）・伊賀国（ID26）・伊勢国（ID24）・志摩国（ID25）に拠点を持っている勢力とが敵対し、友好度が０になる。
        // （※織田勢力と関係が友好・同盟・支配・従属・和睦状態の勢力は除く。ID0の勢力（中立）は除く）
        const targetProvinceIds = [29, 30, 31, 26, 24, 25];
        const enemyClanIds = new Set();
        game.castles.forEach(c => {
            if (targetProvinceIds.includes(c.provinceId) && c.ownerClan !== 0 && c.ownerClan !== nobunagaClanId) {
                enemyClanIds.add(c.ownerClan);
            }
        });

        if (game.diplomacyManager) {
            enemyClanIds.forEach(clanId => {
                const relation = game.diplomacyManager.getRelation(nobunagaClanId, clanId);
                if (relation) {
                    // 友好・同盟・支配・従属・和睦 は除く
                    if (!['友好', '同盟', '支配', '従属', '和睦'].includes(relation.status)) {
                        game.diplomacyManager.changeStatus(nobunagaClanId, clanId, '敵対', 0);
                        const relA = game.diplomacyManager.getRelation(nobunagaClanId, clanId);
                        const relB = game.diplomacyManager.getRelation(clanId, nobunagaClanId);
                        if (relA) relA.sentiment = 0;
                        if (relB) relB.sentiment = 0;
                    }
                }
            });

            // ★ここから追加：織田勢力と松永勢力の友好度を100にします
            // 松永勢力がもし織田勢力と同盟・支配・従属関係ではない場合は同盟します
            let hisahideRel = game.diplomacyManager.getRelation(nobunagaClanId, hisahideClanId);
            if (hisahideRel && !['同盟', '支配', '従属'].includes(hisahideRel.status)) {
                game.diplomacyManager.changeStatus(nobunagaClanId, hisahideClanId, '同盟', 0);
            }
            const relA_hisahide = game.diplomacyManager.getRelation(nobunagaClanId, hisahideClanId);
            const relB_hisahide = game.diplomacyManager.getRelation(hisahideClanId, nobunagaClanId);
            if (relA_hisahide) {
                relA_hisahide.sentiment = 100;
                relA_hisahide.isEvent = true; // イベント同盟の印
            }
            if (relB_hisahide) {
                relB_hisahide.sentiment = 100;
                relB_hisahide.isEvent = true; // イベント同盟の印
            }
        }

        // ★追加：織田勢力のすべての軍団に「地方統一（近畿）」の方針を10年間（120ターン）持たせます！
        if (game.aiOperationManager && typeof game.aiOperationManager.setGrandObjectiveToAllLegions === 'function') {
            // 山城国（ID: 30）などの近畿地方の地方IDを取得します
            let kinkiRegionId = 5; // 見つからなかった時のための基本の数字です
            const yamashiro = game.provinces.find(p => p.id === 30);
            if (yamashiro && yamashiro.regionId) {
                kinkiRegionId = yamashiro.regionId;
            } else {
                const kinkiProv = game.provinces.find(p => p.region === '近畿' || p.region === '畿内');
                if (kinkiProv) kinkiRegionId = kinkiProv.regionId;
            }
            
            // 織田家に「地方統一（近畿地方）」を120ターン（10年間）で設定します
            game.aiOperationManager.setGrandObjectiveToAllLegions(nobunagaClanId, '地方統一', kinkiRegionId, 120);
        }

        const msg = `${yoshiakiName}は上洛のため、${nobunagaName}を頼りその庇護下に入りました。`;
        
        game.ui.log(`【イベント】${msg}`);
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
        // ★修正：すでに世界に「征夷大将軍」がいるか、「すでに擁立イベントが終わったスタンプ」があるなら、入城イベントはもう起きません！
        const shogunExists = window.EventCheck.getShogunBusho(game) !== undefined;
        if (shogunExists || (game.flags && game.flags['historical_shogun_coronation'])) return false;

        // 1. 将軍候補（左馬頭の官位を持つ武将）を世界中から探します
        const candidate = window.EventCheck.getCandidateBusho(game);
        
        // 将軍候補がいない、あるいはすでに大名（独立済み）なら、このイベントは必要ありません
        if (!candidate || candidate.isDaimyo || candidate.clan === 0) return false;

        // 2. その武将が所属している勢力が、二条城（ID26）の持ち主か確認します
        const nijo = game.getCastle(26);
        if (!nijo || nijo.ownerClan !== candidate.clan) return false;
        
        // 3. その勢力が「合計9城以上」支配している、力のある勢力か確認します
        const clanCastles = game.getClanCastles(candidate.clan);
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
        const candidate = window.EventCheck.getCandidateBusho(game);
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

        // ★ここから追加：所属勢力に軍団の空き（1〜8）があるか確認し、空きがあれば国主に任命します
        if (game.aiStaffing && nijo) {
            const newLegionNo = game.aiStaffing.assignNewLegion(candidate.clan, candidate.id);
            if (newLegionNo !== -1) {
                candidate.isCommander = true;
                if (candidate.isGunshi) candidate.isGunshi = false; // 念のため軍師バッジを外します
                nijo.legionId = newLegionNo;
                nijo.isDelegated = true; // AIに委任する状態にします
            }
        }

        // ★追加：将軍を擁立した勢力を記録します（game.flagsに入れるだけで自動でセーブデータに保存されます）
        game.flags = game.flags || {};
        game.flags['shogun_sponsor_clan_id'] = candidate.clan;

        // 何が起きたか後でわかるように、履歴（ログ）にこっそり記録しておきます
        const name = candidate.fullName;
        game.ui.log(`(将軍候補の${name}が、幕府再興のため二条城へ入城しました)`);
        
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
        // ① 将軍候補を探します
        const candidate = window.EventCheck.getCandidateBusho(game);
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
        const sponsorDaimyo = game.getClanDaimyo(sponsorClanId);
        if (!sponsorDaimyo) return false;

        // ⑦ 擁立勢力の大名の居城が、二条城（26）でも槇島城（90）でもないことを確認します
        if (sponsorDaimyo.castleId === 26 || sponsorDaimyo.castleId === 90) return false;
        
        // ⑧ 擁立勢力が「合計9城以上」所有しているか数えます（他に7城＋二条城＋槇島城＝9城）
        const sponsorCastles = game.getClanCastles(sponsorClanId);
        if (sponsorCastles.length < 9) return false;

        // ⑨ 朝廷に「征夷大将軍（ID1）」の官位の空きがあるか確認します
        if (!game.courtRankSystem || !game.courtRankSystem.availableRanks.includes(game.courtRankSystem.RANK_ID_SHOGUN)) return false;

        // すべての条件をクリアしたら、イベント発生（true）の合図を出します！
        return true;
    },
    
    execute: async function(game) {
        // イベントが起きた時に実際に実行される魔法です
        
        const candidate = window.EventCheck.getCandidateBusho(game);
        if (!candidate) return;
        
        const sponsorClanId = candidate.clan;
        const sponsorClan = game.getClan(sponsorClanId);
        const nijoCastle = game.getCastle(26);
        const makishimaCastle = game.getCastle(90);

        // ★追加：大名家を作る「前」に、名前と顔グラフィックを大名用に更新します！
        if (game.lifeSystem) {
            game.lifeSystem.applyDaimyoNameAndFaceChange(candidate);
        }

        // --- 1. 新しい大名家（将軍家）を設立します ---
        const newClanId = Math.max(...game.clans.map(c => c.id)) + 1; // 一番大きいIDの次を使います
        const newClanName = candidate.clanNameStr || "足利家";
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
        const sponsorDaimyo = game.getClanDaimyo(sponsorClanId);
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
        const samanoKamiId = candidate.courtRankIds.find(id => game.courtRankSystem.RANK_IDS_CANDIDATE.includes(id));
        if (samanoKamiId) {
            candidate.courtRankIds = candidate.courtRankIds.filter(id => id !== samanoKamiId); // 左馬頭を削除
            if (game.courtRankSystem) {
                game.courtRankSystem.returnRank(samanoKamiId); // 朝廷に返す
            }
        }
        if (game.courtRankSystem) {
            game.courtRankSystem.grantRank(candidate, game.courtRankSystem.RANK_ID_SHOGUN); // 征夷大将軍をもらう
        } else {
            candidate.courtRankIds.push(game.courtRankSystem.RANK_ID_SHOGUN); // 万が一システムがない時の安全策
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
        // 三好長逸（ID: 1020021）の大名家を探します
        const nagayasu = game.getBusho(1020021);
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
        
        const candidateName = candidate.fullName;
        const sponsorName = sponsorClan.name;
        
        // Round21: 将軍就任の舞台である二条城（ID26）へ寄せてから結果を表示します。
        if (game.ui && typeof game.ui.focusMapOnCastle === 'function') {
            await game.ui.focusMapOnCastle(26, { immediate: true, reason: 'historical_event' });
        }

        await game.ui.showDialogAsync(`${candidateName}が征夷大将軍に就任しました！\n${sponsorName}と${newClanName}は固い同盟で結ばれました。`, false, 0);
    }
});

// ==========================================
// ★ 松永久秀 独立イベント
// ==========================================
window.GameEvents.push({
    id: "historical_hisahide_independence",
    timing: "endMonth_before", // 月末の独立チェックなどが始まる前に起こします
    isOneTime: true,
    
    checkCondition: function(game) {
        // 1. 三好長慶（ID: 1020005）が死亡しているか確認します
        if (!window.EventCheck.isDead(game, 1020005)) return false;
        
        // 2. 三好義継（ID: 1020014）が大名であるか確認します
        const yoshitsugu = window.EventCheck.getDaimyo(game, 1020014);
        if (!yoshitsugu) return false;

        // 3. 松永長頼（ID: 1202004）が死亡しているか確認します
        // if (!window.EventCheck.isDead(game, 1202004)) return false;

        // 4. 松永久秀（ID: 1202002）が存在し、大名ではないことを確認します
        const hisahide = game.getBusho(1202002);
        if (!hisahide || hisahide.isDaimyo) return false;

        // 5. 松永久秀が義継と同じ三好家に所属し、城主であるか確認します
        if (hisahide.clan !== yoshitsugu.clan || !hisahide.isCastellan) return false;

        // 全ての条件を満たしたらイベント発生です！
        return true;
    },
    
    // 松永久秀の独立を発火します。引数を渡して処理自体はindependence_systemで行います。
    execute: async function(game) {
        const yoshitsugu = game.getBusho(1020014);
        const hisahide = game.getBusho(1202002);
        const castle = game.getCastle(hisahide.castleId);

        if (!castle) return;

        // ★独立させる直前に、三好家に所属する松永系（1202000～1202999）の武将の忠誠度を15下げます
        const matsunagaBushosBefore = game.bushos.filter(b => b.clan === yoshitsugu.clan && b.status === 'active' && b.id >= 1202000 && b.id <= 1202999);
        matsunagaBushosBefore.forEach(b => {
            b.loyalty = Math.max(0, (b.loyalty || 0) - 15);
        });

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
        // 1. 三好長慶（ID: 1020005）が死亡しているか確認します
        if (!window.EventCheck.isDead(game, 1020005)) return false;
        
        // 2. 三好義継（ID: 1020014）が大名であるか確認します
        const yoshitsugu = window.EventCheck.getDaimyo(game, 1020014);
        if (!yoshitsugu) return false;

        // 3. 松永久秀（ID: 1202002）が大名であるか確認します
        const hisahide = window.EventCheck.getDaimyo(game, 1202002);
        if (!hisahide) return false;

        // 4. 三好家に三好三人衆（長逸、政勝、石成友通）が所属しているか確認します
        const trioIds = [1020021, 1020024, 1020029];
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
        const yoshitsugu = game.getBusho(1020014);
        const hisahide = game.getBusho(1202002);
        const nagayasu = game.getBusho(1020021);
        const miyoshiClanId = yoshitsugu.clan;
        
        // ① 三好長逸を新しい大名（殿様）にします
        const miyoshiClan = game.getClan(miyoshiClanId);
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
            window.EventAction.appointCastellan(game, nagayasu, nagayasuCastle);
        }

        // ③ 三好義継の貢献度（功績）を0にします
        yoshitsugu.achievementTotal = 0;

        // ④ 三好義継を松永家に保護させ、忠誠度を100にする
        // お引越しセンターの魔法（joinClan）を使って、古いお城から出して新しいお城に入れます
        game.affiliationSystem.joinClan(yoshitsugu, hisahide.clan, hisahide.castleId, 100);
        
        // ★追加：三好長逸家所属の拠点と武将へのペナルティ処理
        // お城の人口・兵士・民忠を減らします
        const miyoshiCastles = game.getClanCastles(miyoshiClanId);
        miyoshiCastles.forEach(c => {
            c.population = Math.floor(c.population * 0.8); // 人口20%減少（残りが80%）
            c.soldiers = Math.floor(c.soldiers * 0.7);     // 兵士30%減少（残りが70%）
            c.peoplesLoyalty = Math.floor((c.peoplesLoyalty || 0) * 0.7); // 民忠30%減少（残りが70%）
        });

        // 対象以外の武将の忠誠度を減らします
        const trioList = [1020021, 1020024, 1020029]; // 三好三人衆の出席番号リスト
        const miyoshiBushos = game.bushos.filter(b => b.clan === miyoshiClanId && b.status === 'active');
        miyoshiBushos.forEach(b => {
            // 三好三人衆ではなく、かつ、池田・荒木関連（1203000～1203999）でもない場合
            if (!trioList.includes(b.id) && !(b.id >= 1203000 && b.id <= 1203999)) {
                b.loyalty = Math.max(0, (b.loyalty || 0) - 10); // 忠誠度を10下げます（0より下にはならないようにします）
            }
        });

        // ⑤ 画面にメッセージを出してお知らせします
        game.ui.log(`【イベント】三好当主・三好義継が出奔し、松永久秀の元へ逃れました。`);
        await game.ui.showDialogAsync(`三好義継が悪逆無道の三好三人衆に愛想をつかし、三好家の忠臣・松永久秀の元へ逃れました。三好家は三好長逸が新たな当主となります。`, false, 0);
        
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
        const shogunInfo = window.EventCheck.getShogunInfo(game);
        if (!shogunInfo) return false;
        
        const sponsorClanId = shogunInfo.sponsorClanId;
        const shogunClanId = shogunInfo.shogunClanId;
        
        // 2. 三好長逸（ID: 1020021）が大名であるか確認します
        const nagayasu = window.EventCheck.getDaimyo(game, 1020021);
        if (!nagayasu) return false;

        // 3. 松永久秀（ID: 1202002）が大名であるか確認します
        const hisahide = window.EventCheck.getDaimyo(game, 1202002);
        if (!hisahide) return false;
        const matsunagaClanId = hisahide.clan;

        // ストッパー：松永家がすでに将軍を擁立している家だった場合は中止します
        if (matsunagaClanId === sponsorClanId || (shogunClanId !== 0 && matsunagaClanId === shogunClanId)) return false;

        // 4. 三好義継（ID: 1020014）が松永家に所属しているか確認します
        const yoshitsugu = game.getBusho(1020014);
        if (!yoshitsugu || yoshitsugu.clan !== matsunagaClanId) return false;
        
        // 5. 将軍擁立勢力または将軍家の領地と、松永家の領地が隣接しているか確認します
        const matsunagaCastles = game.getClanCastles(matsunagaClanId);
        let isAdjacent = false;

        // まず擁立勢力の城と繋がっているか調べます
        const sponsorCastles = game.getClanCastles(sponsorClanId);
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
            const shogunCastles = game.getClanCastles(shogunClanId);
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
        const hisahide = game.getBusho(1202002);
        const matsunagaClanId = hisahide.clan;
        const matsunagaClan = game.getClan(matsunagaClanId);
        
        const shogunInfo = window.EventCheck.getShogunInfo(game);
        if (!shogunInfo) return; // 万が一取得できなければ安全のために中止します
        
        const sponsorClanId = shogunInfo.sponsorClanId;
        const candidateName = shogunInfo.candidateName;
        
        const sponsorClan = game.getClan(sponsorClanId);
        
        // 全て変数から名前を取るように徹底しました
        const hisahideName = hisahide.fullName;
        const sponsorName = sponsorClan ? sponsorClan.name : "擁立勢力";
        const matsunagaClanName = matsunagaClan ? matsunagaClan.name : "松永家";
        const hisahideCastle = game.getCastle(hisahide.castleId);
        const hisahideCastleName = hisahideCastle ? hisahideCastle.name : "居城";
        
        // 元々松永家が持っていたお城のリストを覚えておきます（後の信貴山城の判定用）
        const matsunagaCastles = game.getClanCastles(matsunagaClanId);
        const matsunagaBushos = game.bushos.filter(b => b.clan === matsunagaClanId && b.status === 'active');

        // ①・②・④ 勢力の吸収と武将の合流処理（内部処理）
        // （第5引数に100を渡すことで、全員の忠誠度が100で合流します）
        window.EventAction.absorbClan(game, matsunagaClanId, sponsorClanId, 0, 100);
        
        // ③ 松永久秀を改めて城主に任命する処理
        // 信貴山城（ID: 39）が元々松永家のものだった場合、松永久秀を信貴山城へお引越しさせます
        const shigisanCastle = matsunagaCastles.find(c => c.id === 39);
        let targetCastle = hisahideCastle;
        
        if (shigisanCastle) {
            targetCastle = shigisanCastle;
            window.EventAction.moveBusho(game, hisahide, 39);
        }
        
        // 城主のバッジを渡します
        if (targetCastle) {
            window.EventAction.appointCastellan(game, hisahide, targetCastle);
        }

        // 臣従先の勢力に軍団の空き（1〜8）があるか確認し、空きがあれば国主に任命します
        if (game.aiStaffing && targetCastle) {
            const newLegionNo = game.aiStaffing.assignNewLegion(sponsorClanId, hisahide.id);
            if (newLegionNo !== -1) {
                hisahide.isCommander = true;
                if (hisahide.isGunshi) hisahide.isGunshi = false; // 軍師バッジは念のため外します
                targetCastle.legionId = newLegionNo;
                targetCastle.isDelegated = true; // AIに委任する状態にします
                
                // ★追加：国主になれた場合、元々の配下たちを久秀の城に集合させます
                matsunagaBushos.forEach(busho => {
                    if (busho.id !== hisahide.id && busho.castleId !== targetCastle.id) {
                        busho.isCastellan = false; // お引越しするので城主のバッジは外します
                        window.EventAction.moveBusho(game, busho, targetCastle.id);
                    }
                });
            }
        }
        
        // ④ メッセージ表示
        const msg = `${hisahideName}が${sponsorName}の上洛に同調し臣従しました！`;
        
        game.ui.log(`【イベント】${msg}`);
        await game.ui.showDialogAsync(msg, false, 0);
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
        // 1. 池田長正（ID: 1203002）が死亡しているか確認します
        const nagamasa = game.getBusho(1203002);
        if (nagamasa && nagamasa.status !== 'dead') return false;
        
        // 2. 三好義継（ID: 1020014）または三好長逸（ID: 1020021）が大名であるか確認します
        const miyoshiDaimyo = window.EventCheck.getDaimyo(game, [1020014, 1020021]);
        if (!miyoshiDaimyo) return false;
        
        // 3. 池田知正（ID: 1203004）が存在し、三好義継または三好長逸の家に所属する城主または国主であるか確認します
        const tomomasa = game.getBusho(1203004);
        if (!tomomasa || tomomasa.clan !== miyoshiDaimyo.clan) return false;
        if (!tomomasa.isCastellan && !tomomasa.isCommander) return false;

        // 4. 池田知正の居城が伊丹城（ID: 51）であるか、または伊丹城が池田知正の軍団に所属しているか確認します
        const itamiCastle = game.getCastle(51);
        if (!itamiCastle || itamiCastle.ownerClan !== miyoshiDaimyo.clan) return false;

        let isItamiInvolved = false;
        if (tomomasa.isCommander) {
            // 池田知正が国主の場合、伊丹城が知正の軍団に所属しているか
            if (itamiCastle.legionId === tomomasa.legionId) isItamiInvolved = true;
        } else {
            // 池田知正が城主の場合、知正の居城が伊丹城か
            if (tomomasa.castleId === 51) isItamiInvolved = true;
        }
        if (!isItamiInvolved) return false;

        // 5. 荒木村重（ID: 1203006）が存在し、対象の家に所属しているか確認します
        const murashige = game.getBusho(1203006);
        if (!murashige || murashige.clan !== miyoshiDaimyo.clan) return false;

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
        const tomomasa = game.getBusho(1203004);
        const murashige = game.getBusho(1203006);
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
        window.EventAction.moveBusho(game, murashige, 51);

        // 2. 池田知正の役職を外し、荒木村重を新城主に据えます
        // 知正が以前いたお城の城主データを解除します
        const oldCastle = game.getCastle(tomomasa.castleId);
        if (oldCastle && oldCastle.castellanId === tomomasa.id) {
            oldCastle.castellanId = 0;
        }

        tomomasa.isCastellan = false;
        tomomasa.isCommander = false;

        window.EventAction.appointCastellan(game, murashige, itamiCastle);

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
        const murashigeName = murashige.fullName;
        const tomomasaFamilyName = tomomasa.familyNameStr || "池田";
        
        // メッセージ1：強襲と実権奪取
        const msg1 = `${murashigeName}が${castleNameBefore}を強襲し、${tomomasaFamilyName}家の実権を握りました！`;
        game.ui.log(`【イベント】荒木村重の池田家乗っ取り：${murashigeName}が${tomomasaFamilyName}家の実権を握りました。`);
        // Round21: 強襲の舞台である伊丹城（ID51）へ寄せてから通知します。
        if (game.ui && typeof game.ui.focusMapOnCastle === 'function') {
            await game.ui.focusMapOnCastle(51, { immediate: true, reason: 'historical_event' });
        }
        await game.ui.showDialogAsync(msg1, false, 0);

        // メッセージ2：大改修と改名
        if (isRenamed) {
            const msg2 = `${murashigeName}は伊丹城を自らの居城と定めて大改修を施し、有岡城と改称しました！`;
            await game.ui.showDialogAsync(msg2, false, 0);
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
        const shogunInfo = window.EventCheck.getShogunInfo(game);
        if (!shogunInfo) return false;
        
        const sponsorClanId = shogunInfo.sponsorClanId;
        const shogunClanId = shogunInfo.shogunClanId;

        // 2. 三好長逸（ID: 1020021）が大名であるか確認します
        const nagayasu = game.getBusho(1020021);
        if (!nagayasu || !nagayasu.isDaimyo) return false;
        const miyoshiClanId = nagayasu.clan;

        // ストッパー：三好家自身が将軍を擁立している家だった場合は中止します
        if (miyoshiClanId === sponsorClanId || (shogunClanId !== 0 && miyoshiClanId === shogunClanId)) return false;

        // 3. 荒木村重（ID: 1203006）が、三好家の城主または国主であるか確認します
        const murashige = game.getBusho(1203006);
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
                targetCastles = game.getClanCastles(miyoshiClanId).filter(c => c.legionId === legion.legionNo);
            }
        }
        if (targetCastles.length === 0) {
            targetCastles = [mainCastle];
        }

        // 4. 将軍擁立勢力と三好家が敵対しているか確認します
        const rel = game.diplomacyManager ? game.diplomacyManager.getRelation(sponsorClanId, miyoshiClanId) : null;
        if (!rel || rel.status !== '敵対') return false;

        // 5. 松永久秀（ID: 1202002）が将軍擁立勢力に所属しているか確認します
        const hisahide = game.getBusho(1202002);
        if (!hisahide || hisahide.clan !== sponsorClanId) return false;
        // 差し替え後
        // 6. 対象の城のいずれかが、将軍擁立勢力または将軍家の城が隣接しているか確認します
        let isAdjacent = false;
        
        const sponsorCastles = game.getClanCastles(sponsorClanId);
        const shogunCastles = shogunClanId !== 0 ? game.getClanCastles(shogunClanId) : [];

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
        const shogunInfo = window.EventCheck.getShogunInfo(game);
        if (!shogunInfo) return;
        
        const sponsorClanId = shogunInfo.sponsorClanId;
        
        const sponsorClan = game.getClan(sponsorClanId);
        const nagayasu = game.getBusho(1020021);
        const miyoshiClanId = nagayasu.clan;

        const murashige = game.getBusho(1203006);
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
                targetCastles = game.getClanCastles(miyoshiClanId).filter(c => c.legionId === legionToDismiss.legionNo);
            }
        }
        if (targetCastles.length === 0) {
            targetCastles = [mainCastle];
        }
        const targetCastleIds = targetCastles.map(c => c.id);

        const sponsorName = sponsorClan ? sponsorClan.name : "擁立勢力";
        const itamiLordName = targetLord.fullName;
        const miyoshiClan = game.getClan(miyoshiClanId);
        const miyoshiClanName = miyoshiClan ? miyoshiClan.name : "三好家";
        
        // 対象となる城の、元の城主（出席番号）をそれぞれ記録しておきます
        const originalCastellans = {};
        targetCastles.forEach(c => {
            originalCastellans[c.id] = c.castellanId;
        });

        // ① 三好家所属でIDが1203000～1203999の武将を全員集めます
        const targetBushos = game.bushos.filter(b => b.clan === miyoshiClanId && b.status === 'active' && b.id >= 1203000 && b.id <= 1203999);
        
        // その人たちのうち、対象の城以外にいる人を本城（mainCastle）に集めます
        targetBushos.forEach(busho => {
            if (!targetCastleIds.includes(busho.castleId)) {
                busho.isCastellan = false;
                busho.isGunshi = false;
                window.EventAction.moveBusho(game, busho, mainCastle.id);
            }
        });

        // ② 対象の城にいる人で、今回は降伏しない人（対象ID以外）を長逸の居城へ逃がします
        targetCastles.forEach(castle => {
            const residents = game.bushos.filter(b => b.castleId === castle.id && b.status === 'active');
            residents.forEach(busho => {
                // IDの範囲外の人がいれば、お引越しさせます
                if (busho.id < 1203000 || busho.id > 1203999) {
                    busho.isCastellan = false; // 城を追い出されるので城主バッジは外れます
                    busho.isCommander = false;
                    window.EventAction.moveBusho(game, busho, nagayasu.castleId);
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
                const dismissedLegionNo = Number(legionToDismiss.legionNo || 0);
                legionToDismiss.commanderId = 0;
                legionToDismiss.objective = null;
                legionToDismiss.status = 'wait';
                legionToDismiss.targetId = 0;
                legionToDismiss.route = [];

                // ★Round6：イベントによる軍団解散と同時に、その軍団専用のAI計画も削除します
                if (game.aiOperationManager && typeof game.aiOperationManager.clearLegionPlanning === 'function') {
                    game.aiOperationManager.clearLegionPlanning(miyoshiClanId, dismissedLegionNo);
                }
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
                    window.EventAction.moveBusho(game, murashige, 51);
                    murashigeNewCastle = castle;
                    window.EventAction.appointCastellan(game, murashige, castle);
                    return; // 伊丹城の処理はこれで終わりなので、次のお城へ進みます
                } else {
                    // 伊丹城がある場合、村重は他のお城の城主にはなれません
                    if (newCastellan && newCastellan.id === murashige.id) {
                        newCastellan = null;
                    }
                }
            }

            // 元の城主が降伏組なら、そのまま城主に復帰させます
            if (newCastellan && newCastellan.id >= 1203000 && newCastellan.id <= 1203999 && newCastellan.castleId === castle.id) {
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
        if (game.aiStaffing && murashigeNewCastle) {
            const newLegionNo = game.aiStaffing.assignNewLegion(sponsorClanId, murashige.id);
            if (newLegionNo !== -1) {
                murashige.isCommander = true;
                if (murashige.isGunshi) murashige.isGunshi = false; // 軍師バッジは念のため外します
                murashigeNewCastle.legionId = newLegionNo;
                murashigeNewCastle.isDelegated = true; // AIに委任する状態にします
                
                // ★追加：国主になれた場合、降伏した武将たちを村重の城に集合させます
                targetBushos.forEach(busho => {
                    if (busho.id !== murashige.id && busho.castleId !== murashigeNewCastle.id) {
                        busho.isCastellan = false; // お引越しするので城主のバッジは外します
                        window.EventAction.moveBusho(game, busho, murashigeNewCastle.id);
                    }
                });
            }
        }

        // ⑦ 画面に何が起きたかメッセージを出してお知らせします
        const msg = `\n${miyoshiClanName}の${itamiLordName}が${sponsorName}の上洛に同調し臣従しました！`;
        
        game.ui.log(`【イベント】${msg}`);
        await game.ui.showDialogAsync(msg, false, 0);
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
        // 1. 畠山家の対象大名（高政、政尚、秋高）のいずれかが大名であるか確認します
        const hatakeyamaDaimyo = window.EventCheck.getDaimyo(game, [1041012, 1041013, 1041016]);
        if (!hatakeyamaDaimyo) return false;
        
        const hatakeyamaClanId = hatakeyamaDaimyo.clan;

        // 2. プレイヤーが畠山家を担当している場合はイベントを起こしません
        if (game.playerClanId === hatakeyamaClanId) return false;

        // 3. 将軍候補（ID80:左馬頭）または将軍家（ID1:征夷大将軍）と、その擁立勢力を特定します
        const shogunInfo = window.EventCheck.getShogunInfo(game);
        if (!shogunInfo) return false;
        
        const sponsorClanId = shogunInfo.sponsorClanId;
        const shogunClanId = shogunInfo.shogunClanId;

        // 万が一、畠山家自身が将軍を擁立していたら、自分自身に降伏することになってしまうので止めます
        if (hatakeyamaClanId === sponsorClanId || hatakeyamaClanId === shogunClanId) return false;
        
        // 4. 将軍擁立勢力または将軍家の領地と、畠山家の領地が隣接しているか確認します
        const hatakeyamaCastles = game.getClanCastles(hatakeyamaClanId);
        let isAdjacent = false;

        // まず擁立勢力の城と繋がっているか調べます
        const sponsorCastles = game.getClanCastles(sponsorClanId);
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
            const shogunCastles = game.getClanCastles(shogunClanId);
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
        const hatakeyamaDaimyo = window.EventCheck.getDaimyo(game, [1041012, 1041013, 1041016]);
        if (!hatakeyamaDaimyo) return;
        
        const hatakeyamaClanId = hatakeyamaDaimyo.clan;
        const hatakeyamaClan = game.getClan(hatakeyamaClanId);
        
        const shogunInfo = window.EventCheck.getShogunInfo(game);
        if (!shogunInfo) return;
        
        const sponsorClanId = shogunInfo.sponsorClanId;
        const candidateName = shogunInfo.candidateName;
        
        const sponsorClan = game.getClan(sponsorClanId);
        
        // メッセージ用に名前を用意します
        const hatakeyamaName = hatakeyamaDaimyo.fullName;
        const sponsorName = sponsorClan ? sponsorClan.name : "擁立勢力";
        const hatakeyamaClanName = hatakeyamaClan ? hatakeyamaClan.name : "畠山家";
        const hatakeyamaCastle = game.getCastle(hatakeyamaDaimyo.castleId);
        const hatakeyamaCastleName = hatakeyamaCastle ? hatakeyamaCastle.name : "居城";
        
        // ①・②・④ 勢力の吸収と武将の合流処理（内部処理）
        window.EventAction.absorbClan(game, hatakeyamaClanId, sponsorClanId, 0, 100);
        
        // ③ 畠山大名を改めて城主に任命します（joinClanの中で大名や城主のバッジは一度外れているため）
        if (hatakeyamaCastle) {
            window.EventAction.appointCastellan(game, hatakeyamaDaimyo, hatakeyamaCastle);
        }

        // ⑤ 画面に何が起きたかメッセージを出してお知らせします
        const msg = `${hatakeyamaName}が${sponsorName}の上洛に同調し臣従しました！`;
        
        game.ui.log(`【イベント】${msg}`);
        await game.ui.showDialogAsync(msg, false, 0);
    }
});

// ==========================================
// ★ 最上義光 家督相続イベント
// ==========================================
window.GameEvents.push({
    id: "historical_mogami_succession",
    timing: "startMonth_before", // 毎月の初めに条件を満たしているかチェックします
    isOneTime: true,             // 一度発生したら二度と起きません
    
    checkCondition: function(game) {
        // １．1561年以降であるか確認します
        if (game.year < 1561) return false;
        
        // ２．最上義守（ID: 1089011）が存在し、大名であるか確認します
        const yoshimori = window.EventCheck.getDaimyo(game, 1089011);
        if (!yoshimori) return false;

        // ３．プレイヤーが最上家（義守の勢力）の担当ではないか確認します
        if (game.playerClanId === yoshimori.clan) return false;

        // ４．最上義光（ID: 1089012）が存在し、義守と同じ勢力に所属しているか確認します
        const yoshiaki = game.getBusho(1089012);
        if (!yoshiaki || yoshiaki.status !== 'active' || yoshiaki.clan !== yoshimori.clan) return false;

        // すべての条件をクリアしたらイベント発生の合図を出します！
        return true;
    },
    
    execute: async function(game) {
        const oldDaimyo = game.getBusho(1089011);
        const successor = game.getBusho(1089012);
        const clanId = oldDaimyo.clan;
        const messages = [];

       // 義守の出家と改名処理（栄林と号する）
        const oldNameStr = oldDaimyo.fullName; // 改名前のフルネームをメモしておきます
        
        // 下の名前を「栄林」に変え、読み仮名も設定します
        oldDaimyo.givenName = "栄林";
        oldDaimyo.name = oldDaimyo.familyName + oldDaimyo.givenName;
        oldDaimyo.givenYomi = "えいりん";
        oldDaimyo.yomi = oldDaimyo.familyYomi + oldDaimyo.givenYomi;

        const newNameStr = oldDaimyo.fullName; // 改名後のフルネーム
        messages.push(`${oldNameStr}は出家して「${newNameStr}」と号しました。`);
        
        // 新しく作った家督相続の魔法を呼び出します
        window.EventAction.executeSuccession(game, oldDaimyo, successor, messages);

        // メッセージを画面に出してお知らせします
        const clan = game.getClan(clanId);
        const clanName = clan ? clan.name : "最上家";
        const yoshiakiName = successor.fullName;

        const mainMsg = `${clanName}の${oldNameStr}が隠居し、\n${yoshiakiName}が新たな当主として家督を継ぎました！`;
        
        game.ui.log(`【イベント】最上家家督相続：${mainMsg}`);
        messages.unshift(mainMsg); // 一番最初にメインのメッセージを入れます

        // 溜めておいたメッセージを順番に出します
        for (const msg of messages) {
            await game.ui.showDialogAsync(msg, false, 0);
        }
    }
});

// ==========================================
// ★ 宇喜多直家 謀反イベント
// ==========================================
window.GameEvents.push({
    id: "historical_ukita_coup",
    timing: "endMonth_before", 
    isOneTime: true,
    
    checkCondition: function(game) {
        // 1. 1569年以降であるか確認します
        if (game.year < 1569) return false;
        
        // 2. 浦上宗景（ID: 1044005）が存在し、大名であるか確認します
        const munekage = window.EventCheck.getDaimyo(game, 1044005);
        if (!munekage) return false;

        // 3. 宇喜多直家（ID: 1210003）が存在し、大名ではないことを確認します
        const naoie = game.getBusho(1210003);
        if (!naoie || naoie.isDaimyo) return false;

        // 4. 宇喜多直家が浦上宗景と同じ勢力に所属し、国主であるか確認します
        if (naoie.clan !== munekage.clan || !naoie.isCommander) return false;

        // 全ての条件を満たしたらイベント発生です！
        return true;
    },
    
    // 宇喜多直家の謀反を発火します。引数を渡して処理自体はindependence_systemで行います。
    execute: async function(game) {
        const munekage = game.getBusho(1044005);
        const naoie = game.getBusho(1210003);
        const castle = game.getCastle(naoie.castleId);

        if (!castle) return;

        // ★謀反を起こす直前に、浦上家に所属する宇喜多系（1210000～1210999）の武将の忠誠度を15下げます
        const ukitaBushos = game.bushos.filter(b => b.clan === munekage.clan && b.status === 'active' && b.id >= 1210000 && b.id <= 1210999);
        ukitaBushos.forEach(b => {
            b.loyalty = Math.max(0, (b.loyalty || 0) - 15);
        });

        // 第4引数に 'coup' を渡すことで、「謀反」として処理させます
        // ※ 'indep' にすれば独立、'defect' にすれば寝返りとして使えます
        if (game.independenceSystem && typeof game.independenceSystem.forceAction === 'function') {
            await game.independenceSystem.forceAction(castle, naoie, munekage, 'coup');
        }
    }
});

// ==========================================
// ★ 北畠具房 家督相続イベント
// ==========================================
window.GameEvents.push({
    id: "historical_kitabatake_succession",
    timing: "startMonth_before", 
    isOneTime: true,             
    
    checkCondition: function(game) {
        // 1. 1563年以降であるか確認します
        if (game.year < 1563) return false;

        // 2. 北畠具教（ID: 1024004）が存在し、大名であるか確認します
        const tomonori = window.EventCheck.getDaimyo(game, 1024004);
        if (!tomonori) return false;

        // 3. プレイヤーが北畠家（具教の勢力）の担当ではないか確認します
        if (game.playerClanId === tomonori.clan) return false;

        // 4. 北畠具房（ID: 1024005）が存在し、具教と同じ勢力に所属しているか確認します
        const tomofusa = game.getBusho(1024005);
        if (!tomofusa || tomofusa.status !== 'active' || tomofusa.clan !== tomonori.clan) return false;

        // すべての条件をクリアしたらイベント発生です！
        return true;
    },
    
    execute: async function(game) {
        const oldDaimyo = game.getBusho(1024004);
        const successor = game.getBusho(1024005);
        const clanId = oldDaimyo.clan;
        const messages = [];

        // 新しく作った家督相続の魔法を呼び出します
        window.EventAction.executeSuccession(game, oldDaimyo, successor, messages);

        // ⑩ メッセージを画面に出してお知らせします
        const clan = game.getClan(clanId);
        const clanName = clan ? clan.name : "北畠家";
        const tomonoriName = oldDaimyo.fullName;
        const tomofusaName = successor.fullName;

        const mainMsg = `${clanName}の${tomonoriName}が隠居し、\n${tomofusaName}が新たな当主として家督を継ぎました！`;
        
        game.ui.log(`【イベント】北畠家家督相続：${mainMsg}`);
        messages.unshift(mainMsg);

        for (const msg of messages) {
            await game.ui.showDialogAsync(msg, false, 0);
        }
    }
});

// ==========================================
// ★ 伊達輝宗 家督相続イベント
// ==========================================
window.GameEvents.push({
    id: "historical_idate_succession",
    timing: "startMonth_before", 
    isOneTime: true,             
    
    checkCondition: function(game) {
        // 1. 1565年以降であるか確認します
        if (game.year < 1565) return false;

        // 2. 伊達晴宗（ID: 1074004）が存在し、大名であるか確認します
        const harumune = window.EventCheck.getDaimyo(game, 1074004);
        if (!harumune) return false;

        // 3. プレイヤーが伊達家（晴宗の勢力）の担当ではないか確認します
        if (game.playerClanId === harumune.clan) return false;

        // 4. 伊達輝宗（ID: 1074008）が存在し、晴宗と同じ勢力に所属しているか確認します
        const terumune = game.getBusho(1074008);
        if (!terumune || terumune.status !== 'active' || terumune.clan !== harumune.clan) return false;

        // すべての条件をクリアしたらイベント発生です！
        return true;
    },
    
    execute: async function(game) {
        const oldDaimyo = game.getBusho(1074004);
        const successor = game.getBusho(1074008);
        const clanId = oldDaimyo.clan;
        const messages = [];

        // 新しく作った家督相続の魔法を呼び出します
        window.EventAction.executeSuccession(game, oldDaimyo, successor, messages);

        // ⑩ メッセージを画面に出してお知らせします
        const clan = game.getClan(clanId);
        const clanName = clan ? clan.name : "伊達家";
        const harumuneName = oldDaimyo.fullName;
        const terumuneName = successor.fullName;

        const mainMsg = `${clanName}の${harumuneName}が隠居し、\n${terumuneName}が新たな当主として家督を継ぎました！`;
        
        game.ui.log(`【イベント】伊達家家督相続：${mainMsg}`);
        messages.unshift(mainMsg);

        for (const msg of messages) {
            await game.ui.showDialogAsync(msg, false, 0);
        }
    }
});

// ==========================================
// ★ 川中島の戦い
// ==========================================
window.GameEvents.push({
    id: "historical_kawanakajima",
    timing: "startMonth_before", // 月初の処理前に発生するかチェックします
    isOneTime: true,             // 一度発生したら二度と起きません
    
    checkCondition: function(game) {
        // 1. 1561年以降で、9月〜11月であること
        if (game.year < 1561) return false;
        if (game.month < 9 || game.month > 11) return false;

        // 2. 上杉謙信（1001015）、武田信玄（1002002）、北条氏康（1003003）が大名であること
        const kenshin = window.EventCheck.getDaimyo(game, 1001015);
        if (!kenshin) return false;
        const shingen = window.EventCheck.getDaimyo(game, 1002002);
        if (!shingen) return false;
        const ujiyasu = window.EventCheck.getDaimyo(game, 1003003);
        if (!ujiyasu) return false;

        const uesugiClanId = kenshin.clan;
        const takedaClanId = shingen.clan;
        const hojoClanId = ujiyasu.clan;

        // 3. プレイヤーが上杉または武田を担当していないこと
        if (game.playerClanId === uesugiClanId || game.playerClanId === takedaClanId) return false;

        // 4. 上杉と武田が敵対、かつ上杉と北条が敵対していること
        if (game.diplomacyManager) {
            const relTakeda = game.diplomacyManager.getRelation(uesugiClanId, takedaClanId);
            if (!relTakeda || relTakeda.status !== '敵対') return false;

            const relHojo = game.diplomacyManager.getRelation(uesugiClanId, hojoClanId);
            if (!relHojo || relHojo.status !== '敵対') return false;
        } else {
            return false;
        }

        // 5. 海津城（ID5）が武田の拠点であること
        const kaizuCastle = game.getCastle(5);
        if (!kaizuCastle || kaizuCastle.ownerClan !== takedaClanId) return false;

        // 6. 海津城と上杉家（上杉謙信勢力）の拠点が隣接していること
        let isAdjacentToUesugi = false;
        if (kaizuCastle.adjacentCastleIds) {
            for (let adjId of kaizuCastle.adjacentCastleIds) {
                const adjCastle = game.getCastle(adjId);
                // 海津城と繋がっているお城の中に、上杉家の持ち城があるか調べます
                if (adjCastle && adjCastle.ownerClan === uesugiClanId) {
                    isAdjacentToUesugi = true;
                    break; // １つでも見つかれば条件クリアなので探すのをやめます
                }
            }
        }
        if (!isAdjacentToUesugi) return false; // 見つからなかったらイベントをストップします

        // 7. 山本勘助、武田信繁、春日虎綱、馬場信房 が武田に所属し生存していること
        const takedaReqIds = [1002077, 1002013, 1002041, 1002059];
        for (let id of takedaReqIds) {
            const b = game.getBusho(id);
            if (!b || b.status !== 'active' || b.clan !== takedaClanId) return false;
        }

        // 8. 柿崎景家、甘粕景持 が上杉に所属し生存していること
        const uesugiReqIds = [1001026, 1001016];
        for (let id of uesugiReqIds) {
            const b = game.getBusho(id);
            if (!b || b.status !== 'active' || b.clan !== uesugiClanId) return false;
        }

        // すべての条件を満たしたらイベント発生の合図を出します
        return true;
    },
    
    execute: async function(game) {
        // BGMを変更します
        if (window.AudioManager) {
            window.AudioManager.memorizeCurrentBgm();
            window.AudioManager.playBGM("SC_ex_Scene1_Duel.ogg");
        }
        
        // 登場人物たちのデータを取得します
        const kenshin = game.getBusho(1001015);
        const shingen = game.getBusho(1002002);
        const kansuke = game.getBusho(1002077);
        const nobushige = game.getBusho(1002013);
        const toratsuna = game.getBusho(1002041);
        const nobufusa = game.getBusho(1002059);
        const kageie = game.getBusho(1001026);
        const kagemochi = game.getBusho(1001016);

        // 甘粕景持の官位を取得する処理を追加します
        let kagemochiTitle = "近江守";
        if (game.courtRankSystem && typeof game.courtRankSystem.getHighestRankName === 'function') {
            const rankName = game.courtRankSystem.getHighestRankName(kagemochi);
            if (rankName !== "なし") {
                kagemochiTitle = rankName;
            }
        }

        // 台本に渡す情報をひとまとめにします
        const args = {
            year: game.year,
            month: game.month,
            kenshinName: kenshin.fullName,
            uesugiFamilyName: kenshin.familyNameStr || "上杉",
            kenshinGivenName: kenshin.givenName || "謙信",
            kenshinFace: kenshin.faceIcon || "unknown_face.webp",

            shingenName: shingen.fullName,
            takedaFamilyName: shingen.familyNameStr || "武田",
            shingenGivenName: shingen.givenName || "信玄",
            shingenFace: shingen.faceIcon || "unknown_face.webp",

            kansukeName: kansuke.fullName,
            kansukeFace: kansuke.faceIcon || "unknown_face.webp",

            nobushigeName: nobushige.fullName,
            nobushigeGivenName: nobushige.givenName || "信繁",
            nobushigeFace: nobushige.faceIcon || "unknown_face.webp",

            toratsunaFamilyName: toratsuna.familyNameStr || "春日",
            nobufusaFamilyName: nobufusa.familyNameStr || "馬場",

            kageieName: kageie.fullName,
            kageieFace: kageie.faceIcon || "unknown_face.webp",

            kagemochiName: kagemochi.fullName,
            kagemochiFamilyName: kagemochi.familyNameStr || "甘粕",
            kagemochiFace: kagemochi.faceIcon || "unknown_face.webp",
            kagemochiTitle: kagemochiTitle
        };

        // イベントテキストを再生します
        if (window.EventTextManager && window.EventTextManager.kawanakajima_event) {
            await window.EventTextManager.playSequence(game, window.EventTextManager.kawanakajima_event(args));
        }

        // 戦死処理（山本勘助、武田信繁）
        // 死亡システムに、通常の死亡メッセージを出さないようにお願いして処理させます
        const deadBushos = [kansuke, nobushige];
        for (const busho of deadBushos) {
            if (game.lifeSystem) {
                await game.lifeSystem.executeDeath(busho, { skipNormalMessage: true });
            }
        }
        
        // BGMを元に戻します
        if (window.AudioManager) {
            window.AudioManager.restoreMemorizedBgm();
        }
    }
});