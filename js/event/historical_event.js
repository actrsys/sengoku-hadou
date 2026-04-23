/**
 * historical_event.js
 * 歴史イベントを管理する専用のファイルです。
 * ここに史実に沿ったイベント（桶狭間の戦いなど）を追加していきます。
 */

window.GameEvents = window.GameEvents || [];

// ==========================================
// ★ 歴史イベントのひな形（器）
// ==========================================
window.GameEvents.push({
    id: "historical_event_template", // イベントの固有の名前です（他と被らないようにします）
    timing: "startMonth_before",     // イベントが起きるタイミングです（月初の処理前など）
    isOneTime: true,                 // 歴史イベントなので、一度発生したら二度と起きないように true にします
    
    checkCondition: function(game) {
        // ここにイベントが起きる条件（特定の年や月、大名が生きているかなど）を書きます
        // 例: 1560年の5月になったら起きる場合
        // if (game.year === 1560 && game.month === 5) return true;
        
        return false; // ひな形なので、今は勝手に発生しないように false にして蓋をしておきます
    },
    
    execute: async function(game) {
        // 条件を満たした時に、実際に起こる出来事（セリフや同盟の成立など）をここに書きます
        
        // （例）メッセージを出す場合
        // await game.ui.showDialogAsync("歴史が動きました。", false, 0);
    }
});

// ==========================================
// ★ 将軍候補庇護（予備イベント）
// ==========================================
window.GameEvents.push({
    id: "historical_shogun_protection", 
    timing: "shogun_death",        // ★ 新しく作った将軍死亡のタイミングです
    isOneTime: true,               // 一度発生したら二度と起きません
    
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
            const inabaCastle = game.getCastle(3);
            const nobunagaCastles = game.castles.filter(c => c.ownerClan === nobunaga.clan);
            
            // 稲葉山城を持っているか、桶狭間（義元討死）が終わっているかをチェックします
            const hasInaba = inabaCastle && inabaCastle.ownerClan === nobunaga.clan;
            const isOkehazamaDone = game.flags && game.flags['historical_okehazama_3'];

            if ((hasInaba || isOkehazamaDone) && nobunagaCastles.length >= 5) {
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

        // 【お供の移動処理】（和田惟政、細川藤孝、明智光秀、明智秀満、溝尾茂朝）
        const retainers = [1017002, 1017003, 1900001, 1900002, 1900003];
        retainers.forEach(id => {
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
// ★ 将軍擁立イベント
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
            game.diplomacyManager.setSentiment(sponsorClanId, newClanId, 100);
            game.diplomacyManager.setSentiment(newClanId, sponsorClanId, 100);
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

        // --- 8. 最後に画面を新しく描き直して、メッセージを表示します ---
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
// ★ 桶壊間の戦い（予備）：松平元康 岡崎城主就任（裏イベント）
// ==========================================
window.GameEvents.push({
    id: "historical_motoyasu_okazaki",
    timing: "startMonth_before",     // 月初の処理前にこっそりチェックします
    isOneTime: true,                 // 一度発生したら二度と起きません
    
    checkCondition: function(game) {
        // ① 今川義元（ID: 1004001）が大名として存在するか確認します
        const yoshimoto = game.getBusho(1004001);
        if (!yoshimoto || !yoshimoto.isDaimyo) return false;

        // 補足：プレイヤーが今川家の場合は、勝手に移動させないようにここで止めます
        if (game.playerClanId === yoshimoto.clan) return false;

        // ② 松平元康（ID: 1004004）が存在するか確認します
        const motoyasu = game.getBusho(1004004);
        if (!motoyasu) return false;

        // 【ここが重要！】元康が「義元が殿様を務める大名家」にちゃんと所属しているかチェックします
        // ※ 義元の clan（勢力番号）と 元康の clan が一致していれば、同じ勢力にいることになります
        if (motoyasu.clan !== yoshimoto.clan) return false;

        // ③ 元康が自分自身が大名（独立した殿様）になっていないか確認します
        if (motoyasu.isDaimyo) return false;

        // ④ すでに元康が岡崎城（ID: 48）の城主なら、このイベントを起こす必要はありません
        const okazakiCastle = game.getCastle(48);
        if (!okazakiCastle || okazakiCastle.castellanId === motoyasu.id) return false;

        // ⑤ 今川家（義元の勢力）が指定の5つのお城をすべて持っているか確認します
        const imagawaClanId = yoshimoto.clan;
        const requiredCastles = [12, 13, 48, 71, 100];
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

        // 1. 松平元康の功績が1499以下なら、強制的に1500に引き上げます
        if ((motoyasu.achievementTotal || 0) <= 1499) {
            motoyasu.achievementTotal = 1500;
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
// ★ 桶狭間の戦い ①義元出陣
// ==========================================
window.GameEvents.push({
    id: "historical_okehazama_1",
    timing: "startMonth_before",     // 月初の処理前に発生するかチェックします
    isOneTime: true,                 // 一度発生したら二度と起きません
    
    checkCondition: function(game) {
        // A. 今川義元（ID: 1004001）が大名として存在するか確認します
        const yoshimoto = game.getBusho(1004001);
        if (!yoshimoto || !yoshimoto.isDaimyo) return false;

        // 補足：プレイヤーが今川家の場合は、勝手に出陣させないようにここで止めます
        if (game.playerClanId === yoshimoto.clan) return false;

        // C. 今川義元が駿府城（ID: 13）にいるか確認します
        if (yoshimoto.castleId !== 13) return false;

        // B. 今川家が指定のお城をすべて持っているか確認します
        const imagawaClanId = yoshimoto.clan;
        const requiredImagawaCastles = [12, 13, 45, 48, 57, 71, 100];
        const hasAllImagawaCastles = requiredImagawaCastles.every(id => {
            const c = game.getCastle(id);
            return c && c.ownerClan === imagawaClanId;
        });
        if (!hasAllImagawaCastles) return false;

        // D. 織田信長（ID: 1006001）が大名として存在するか確認します
        const nobunaga = game.getBusho(1006001);
        if (!nobunaga || !nobunaga.isDaimyo) return false;

        // F. 織田信長が清州城（ID: 7）にいるか確認します
        if (nobunaga.castleId !== 7) return false;

        // E. 織田家が指定のお城をすべて持っているか確認します
        const odaClanId = nobunaga.clan;
        const requiredOdaCastles = [7, 11];
        const hasAllOdaCastles = requiredOdaCastles.every(id => {
            const c = game.getCastle(id);
            return c && c.ownerClan === odaClanId;
        });
        if (!hasAllOdaCastles) return false;

        // G. 松平元康（ID: 1004004）が城主として存在するか確認します
        const motoyasu = game.getBusho(1004004);
        if (!motoyasu || !motoyasu.isCastellan) return false;

        // すべての条件をクリアしたら、イベントを発生させます！
        return true;
    },
    
    execute: async function(game) {
        const yoshimoto = game.getBusho(1004001);
        const imagawaClanId = yoshimoto.clan;

        // 駿府城の兵力を調べて、出撃させる兵士と兵糧の数を決めます
        const sunpuCastle = game.getCastle(13);
        // ★義元は油断していて、総兵力の4分の1しか連れて行きません
        const force = sunpuCastle ? Math.floor(sunpuCastle.soldiers * 0.25) : 5000;
        const rice = force * 2;

        // AIの作戦を管理しているシステムに、新しい作戦をセットします
        if (game.aiOperationManager) {
            game.aiOperationManager.operations[imagawaClanId] = {
                type: '攻撃',
                targetId: 11,               // 攻撃目標は名古屋城です
                isEventOperation: true,     // ★イベントによる特別な作戦です
                designatedCommanderId: 1004001, // ★今回追加：絶対にこの人（義元）を大将にするという指定です！
                isKunishuTarget: false,     
                stagingBase: 13,            // 出撃するのは駿府城からです
                supportBase: null,          
                requiredForce: force,       // ★ここで指定した「4分の1の兵力」が、そのまま出撃時に使われます！
                requiredRice: rice,         
                assignedUnits: [],          
                turnsRemaining: 1,          // 準備期間は1ヶ月です（予兆が出ます）
                maxTurns: 4,                
                status: '準備中'
            };
                
            // 画面にメッセージを出して、プレイヤーにお知らせします
            const imagawaClan = game.clans.find(c => c.id === imagawaClanId);
            const clanName = imagawaClan ? imagawaClan.name : '今川家';
            game.ui.log(`【イベント】桶狭間の戦い：${clanName}が尾張侵攻の軍を興しました。`);
            await game.ui.showDialogAsync(`今川義元が上洛へ向けて、\n尾張への侵攻作戦を進めているようです。`, false, 0);
        }
    }
});

// ==========================================
// ★ 桶狭間の戦い ②織田信長出陣
// ==========================================
window.GameEvents.push({
    id: "historical_okehazama_2",
    // ★特殊な発火タイミング：部隊が城に到着して、野戦や攻城戦が始まる直前を想定します
    timing: "before_battle", 
    isOneTime: true,
    
    checkCondition: function(game, context) {
        // 戦闘システムからコンテキスト（状況データ）が届いていなければストップします
        if (!context) return false;

        // H. 攻撃目標が名古屋城（ID: 11）か確認します
        if (!context.defender || context.defender.id !== 11) return false;

        // H. 攻撃側に今川義元（ID: 1004001）がいるか確認します
        const atkBushos = context.atkBushos || [];
        const hasYoshimoto = atkBushos.some(b => b.id === 1004001);
        if (!hasYoshimoto) return false;

        // A. 義元が大名であるか確認します
        const yoshimoto = game.getBusho(1004001);
        if (!yoshimoto || !yoshimoto.isDaimyo) return false;

        // D, F. 信長が大名で、清州城（ID: 7）にいるか確認します
        const nobunaga = game.getBusho(1006001);
        if (!nobunaga || !nobunaga.isDaimyo || nobunaga.castleId !== 7) return false;

        // E. 織田家が清州城（7）と名古屋城（11）をまだ持っているか確認します
        const odaClanId = nobunaga.clan;
        const kiyosu = game.getCastle(7);
        const nagoya = game.getCastle(11);
        if (!kiyosu || kiyosu.ownerClan !== odaClanId) return false;
        if (!nagoya || nagoya.ownerClan !== odaClanId) return false;

        // G. 松平元康が城主として存在するか確認します
        const motoyasu = game.getBusho(1004004);
        if (!motoyasu || !motoyasu.isCastellan) return false;

        // ★補足条件：プレイヤーが織田家の場合は、勝手に出陣させないようにここでスキップします
        if (game.playerClanId === odaClanId) return false;

        return true;
    },
    
    execute: async function(game, context) {
        const nobunaga = game.getBusho(1006001);
        const kiyosu = game.getCastle(7);

        // 【安全装置】もし清州城のデータが読み取れなかったら、エラーを防ぐためにここで処理を中断します
        if (!kiyosu || !nobunaga) return;

        // 桶狭間は全力出撃！清州城にある資源を全て（100%）持ち出します
        const force = kiyosu.soldiers;
        const rice = kiyosu.rice;
        const horses = kiyosu.horses || 0;
        const guns = kiyosu.guns || 0;

        // 出陣後、清州城の資源は文字通り「ゼロ」になります
        kiyosu.soldiers = 0;
        kiyosu.rice = 0;
        kiyosu.horses = 0;
        kiyosu.guns = 0;
        
        // ★改修：信長を「守備の自勢力援軍」として登録します！
        context.defSelfReinforcement = {
            castle: kiyosu, 
            bushos: [nobunaga], 
            soldiers: force,
            rice: rice, 
            horses: horses, 
            guns: guns, 
            isSelf: true,
            morale: kiyosu.morale || 50, 
            training: kiyosu.training || 50
        };

        // ★修正：AIに絶対に野戦を選ばせる「強制命令」の旗を立てます
        context.forceIntercept = true;

        // ★追加：この戦闘が「イベント戦闘」であることと、その「イベントID」を野戦システムに伝えます！
        context.isEventBattle = true;
        context.eventId = "okehazama";

        game.ui.log(`【イベント】織田信長が清州城から名古屋城へ出陣しました！`);
        await game.ui.showDialogAsync(`「人間五十年、下天の内をくらぶれば、夢幻の如くなり…」\n織田信長が今川軍を迎撃するため、清州城より出陣しました！`, false, 0);
    }
});

// ==========================================
// ★ 桶狭間の戦い ③今川義元討死
// ==========================================
window.GameEvents.push({
    id: "historical_okehazama_3",
    timing: "after_field_war", // ★変更：野戦終了直後のタイミング
    isOneTime: true,
    
    checkCondition: function(game, context) {
        if (!context) return false;

        // 桶狭間のイベント戦闘であるか確認します
        if (!context.isEventBattle || context.eventId !== 'okehazama') return false;

        // 今川軍（攻撃側）が負けた、または撤退したかを確認します
        if (context.resultType !== 'attacker_lose' && context.resultType !== 'attacker_retreat') return false;

        // A, D, Gの条件（大名や城主の確認）が今も満たされているか確認します
        const yoshimoto = game.getBusho(1004001);
        if (!yoshimoto || !yoshimoto.isDaimyo) return false;
        
        const nobunaga = game.getBusho(1006001);
        if (!nobunaga || !nobunaga.isDaimyo) return false;
        
        const motoyasu = game.getBusho(1004004);
        if (!motoyasu || !motoyasu.isCastellan) return false;

        return true;
    },
    
    execute: async function(game, context) {
        const yoshimoto = game.getBusho(1004001);

        // まずイベントのメッセージを出して、プレイヤーにお知らせします
        game.ui.log(`【イベント】桶狭間の戦い：織田軍の奇襲により、今川義元が討死しました！`);
        await game.ui.showDialogAsync(`織田軍の決死の奇襲が今川本陣を強襲！\n激戦の末、海道一の弓取り・今川義元は討ち取られました！`, false, 0);

        // ★life_system.js の力を使って、義元を正式に死亡（討死）させます！
        // これによって後継ぎ選びなどが自動で正しく行われます
        if (game.lifeSystem) {
            await game.lifeSystem.executeDeath(yoshimoto);
        } else {
            // 万が一システムが見つからなかった場合の安全策です
            yoshimoto.status = 'dead';
            yoshimoto.isDaimyo = false;
            yoshimoto.isCastellan = false;
            yoshimoto.isGunshi = false;
            
            if (yoshimoto.castleId > 0) {
                const oldCastle = game.getCastle(yoshimoto.castleId);
                if (oldCastle && oldCastle.samuraiIds) {
                    oldCastle.samuraiIds = oldCastle.samuraiIds.filter(sid => sid !== yoshimoto.id);
                }
            }
            
            yoshimoto.castleId = 0;
            yoshimoto.belongKunishuId = 0;
        }

        // 派閥や画面を最新の状態に更新します
        if (game.factionSystem) {
            game.factionSystem.updateFactions();
        }

        // ★追加：織田信長の大名家に所属する武将の忠誠度を+5し、城の民忠を100にします
        const nobunaga = game.getBusho(1006001);
        if (nobunaga && nobunaga.clan > 0) {
            // 武将の忠誠度アップ（最大100まで）
            const odaBushos = game.bushos.filter(b => b.clan === nobunaga.clan && b.status === 'active');
            odaBushos.forEach(b => {
                b.loyalty = Math.min(100, (b.loyalty || 0) + 5);
            });

            // 城の民忠を100にする
            const odaCastles = game.castles.filter(c => c.ownerClan === nobunaga.clan);
            odaCastles.forEach(c => {
                c.peoplesLoyalty = 100;
            });
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
// ★ 清州同盟イベント
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
        const nobunaga = game.getBusho(1006001);
        const motoyasu = game.getBusho(1004004);
        
        const nobunagaClan = game.clans.find(c => c.id === nobunaga.clan);
        const motoyasuClan = game.clans.find(c => c.id === motoyasu.clan);

        // 外交システムを使って、強制的に「同盟」状態にします
        if (game.diplomacyManager) {
            game.diplomacyManager.changeStatus(motoyasu.clan, nobunaga.clan, '同盟', 0);
            
            // お互いの関係値を最高の100にします！
            const rel1 = game.diplomacyManager.getRelation(motoyasu.clan, nobunaga.clan);
            if (rel1) rel1.sentiment = 100;
            
            const rel2 = game.diplomacyManager.getRelation(nobunaga.clan, motoyasu.clan);
            if (rel2) rel2.sentiment = 100;
        }

        // メッセージを作って画面にお知らせします
        const msg = `${motoyasuClan.name} が ${nobunagaClan.name} と同盟を締結しました！`;
        game.ui.log(`【イベント】清州同盟：${msg}`);
        await game.ui.showDialogAsync(msg, false, 0);

        // 画面や情報を最新の状態に更新します
        if (game.ui) {
            game.ui.renderMap();
            game.ui.updatePanelHeader();
        }
    }
});