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
            if (inabaCastle && inabaCastle.ownerClan === nobunaga.clan && nobunagaCastles.length >= 5) {
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

        // 【お供の移動処理】（明智光秀、明智秀満、溝尾茂朝）
        const retainers = [1900001, 1900002, 1900003];
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
        if (shogunExists || (game.flags && game.flags.shogunCoronationDone)) return false;

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
        // ★追加：ゲームの歴史に「すでに擁立イベントが終わったスタンプ」があれば、絶対に起きません！
        if (game.flags && game.flags.shogunCoronationDone) return false;

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
        
        // ★追加：このイベントが起きたという「消えないスタンプ」をゲームのデータに押しておきます！
        game.flags = game.flags || {};
        game.flags.shogunCoronationDone = true;

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
        const newColor = "#e6b422"; // 黄金色にして特別感を出します
        
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