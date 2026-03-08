/**
 * life_system.js
 * 武将の登場・死亡を管理するシステムです！
 */

class LifeSystem {
    constructor(game) {
        this.game = game;
    }

    // 毎月の初め（1月）に「新しく登場する武将がいないか」をチェックします
    async processStartMonth() {
        if (this.game.month === 1) {
            await this.checkBirth();
            await this.checkNameChange(); // ★この行を書き足しました！
        }
    }

    // 毎月の終わりに「寿命を迎えて亡くなる武将がいないか」をチェックします
    async processEndMonth() {
        await this.checkDeath();
    }

    // ==========================================
    // ★↓↓ここから下を、まるごと書き足します！↓↓★
    // ==========================================
    
    // ★ 改名のチェック（毎年1月に行います）
    async checkNameChange() {
        const currentYear = this.game.year;

        // 武将全員をチェックします（まだ登場していない人や亡くなった人も、内部的に名前は変えておきます）
        for (const b of this.game.bushos) {
            if (!b.nameChange) continue;

            // 「|」で区切られている複数の改名予定を一つずつ確認します
            const changes = b.nameChange.split('|');
            for (const change of changes) {
                const parts = change.split(':');
                if (parts.length === 3) {
                    const targetYear = Number(parts[0].trim());
                    
                    // 今の年が、改名する年と一致したら…
                    if (targetYear === currentYear) {
                        const newFamilyName = parts[1].trim(); // 新しい姓
                        const newGivenName = parts[2].trim();  // 新しい名
                        
                        const oldName = b.name; // 今の名前をメモしておきます
                        const newName = newFamilyName + newGivenName; // 新しいフルネーム

                        // 名前データを書き換えます！
                        b.familyName = newFamilyName;
                        b.givenName = newGivenName;
                        b.name = newName;

                        // すでにゲームに登場して生きている武将（activeかronin）なら、お知らせを出します
                        if (b.status === 'active' || b.status === 'ronin') {
                            // 前の名前と違う時だけメッセージを出します
                            if (oldName !== newName) {
                                // 大名家に所属していたら「〇〇家の」と付けます
                                let prefix = "";
                                if (b.clan !== 0) {
                                    const currentClan = this.game.clans.find(c => c.id === b.clan);
                                    if (currentClan) {
                                        prefix = `${currentClan.name}の`;
                                    }
                                }
                                
                                // ==========================================
                                // ★ここが新しい魔法！：リストに溜め込まず、ここで直接画面に出します！
                                const msg = `${prefix}${oldName}は「${newName}」に改名しました。`;
                                this.game.ui.log(msg); // 履歴に残します
                                
                                // ★ここで「await（待て）」の魔法を使います！
                                // プレイヤーが画面をクリックしてメッセージを閉じるまで、次の処理には絶対に進みません。
                                await this.game.ui.showTapMessage(msg); 
                                // ==========================================
                                
                                // もし大名だったら、大名家の名前も新しくします
                                if (b.isDaimyo && b.clan !== 0) {
                                    const clan = this.game.clans.find(c => c.id === b.clan);
                                    if (clan) {
                                        const oldClanName = clan.name;
                                        clan.name = `${newFamilyName}家`;
                                        
                                        // ==========================================
                                        // ★大名家の名前が変わった時も、新しくメッセージを作って1回ずつ待ちます！
                                        const clanMsg = `当主の改名により、${oldClanName}は今後「${clan.name}」となります。`;
                                        this.game.ui.log(clanMsg);
                                        await this.game.ui.showTapMessage(clanMsg);
                                        // ==========================================
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }
    
    // ==========================================
    // ★↑↑書き足すのはここまで！↑↑★
    // ==========================================

    // ★ 登場のチェック（毎年1月に行います）
    async checkBirth() {
        const currentYear = this.game.year;
        
        // まだ登場していない（statusが'unborn'）武将の中で、登場年を迎えた人を探します
        const unbornBushos = this.game.bushos.filter(b => b.status === 'unborn' && b.startYear <= currentYear);
        
        let messages = [];

        unbornBushos.forEach(b => {
            // ★変更：ゲーム開始時にclanが0なら浪人、0以外なら仕官として処理します
            if (b.clan === 0) {
                // 登場前:浪人 の場合
                b.status = 'ronin';
                const targetCastle = this.game.getCastle(b.castleId);
                if (targetCastle) {
                    targetCastle.samuraiIds.push(b.id);
                }
            } else {
                // 登場前:仕官 の場合
                b.status = 'active';
                
                // ★追加：「登場前:仕官」の武将に一門武将がいるかチェックします
                // 条件：すでに登場して生きている（浪人ではない）、自分自身ではない、一門IDが共通している
                const activeRelatives = this.game.bushos.filter(other => 
                    other.status !== 'unborn' && other.status !== 'dead' && other.status !== 'ronin' &&
                    other.id !== b.id &&
                    b.familyIds.some(fId => other.familyIds.includes(fId))
                );

                let hasRelative = false;
                if (activeRelatives.length > 0) {
                    hasRelative = true;
                    // 一門武将がいる場合、その武将のお城に移動して、所属する大名家も合わせます
                    b.castleId = activeRelatives[0].castleId;
                    b.clan = activeRelatives[0].clan;
                }

                const targetCastle = this.game.getCastle(b.castleId);
                
                if (targetCastle) {
                    // もし一門がいなくて、予定されていた城の持ち主が変わっていたら、その城の今の大名家に仕えます
                    if (!hasRelative) {
                        const ownerClanId = targetCastle.ownerClan;
                        if (ownerClanId === 0) {
                            // 城が空き城なら、仕方なく浪人になります
                            b.status = 'ronin';
                            b.clan = 0;
                        } else {
                            b.clan = ownerClanId;
                        }
                    }

                    targetCastle.samuraiIds.push(b.id);
                    
                    // プレイヤーの大名家にやってきた場合は、お知らせのメッセージを作ります
                    if (b.status === 'active' && b.clan === this.game.playerClanId) {
                        const nameStr = b.name.replace('|', '');
                        if (hasRelative) {
                            messages.push(`${nameStr}が元服し、当家に加わりました！`);
                        } else {
                            messages.push(`${nameStr}が当家に仕官しました！`);
                        }
                    }
                } else {
                    // 万が一城が見つからなかった時の安全策
                    b.status = 'ronin';
                    b.clan = 0;
                }
            }
        });

        // お知らせがあれば、画面に表示します
        if (messages.length > 0) {
            const msgText = messages.join('\n');
            this.game.ui.log(msgText);
            // ★awaitを追加して、プレイヤーが「OK」を押すまで時間を完全に止めます！
            await this.game.ui.showDialogAsync(msgText, false, 0); 
        }
    }

    // ★ 寿命のチェック（毎月行います）
    async checkDeath() {
        const currentYear = this.game.year;
        
        // 【変更点①】没年の「1年前（endYear - 1）」を迎えている武将を探すようにしました！
        const targetBushos = this.game.bushos.filter(b => 
            b.status !== 'unborn' && b.status !== 'dead' && currentYear >= (b.endYear - 1)
        );

        let diedPlayerBushos = [];

        for (const b of targetBushos) {
            // プレイヤーの大名だけは絶対に死なない魔法をかけます！
            if (b.isDaimyo && b.clan === this.game.playerClanId) continue;

            // 【変更点②】没年の「1年前」をスタート地点として、そこから何年過ぎたかを計算します
            const yearsPassed = currentYear - (b.endYear - 1);
            
            // 【変更点③】確率は、スタート（没年1年前）が2%(0.02)、次の年（没年）が4%(0.04)...と増えます
            const deathProb = 0.02 + (yearsPassed * 0.02);

            // サイコロを振って、確率に当たってしまったらお別れです…
            if (Math.random() < deathProb) {
                await this.executeDeath(b);
                // もしプレイヤーの家臣だったら、お知らせリストに入れます
                if (b.clan === this.game.playerClanId) {
                    diedPlayerBushos.push(b);
                }
            }
        }

        // お別れした家臣がいたら、悲しいお知らせを表示します
        if (diedPlayerBushos.length > 0) {
            const names = diedPlayerBushos.map(b => b.name.replace('|', '')).join('、');
            this.game.ui.log(`${names}が病によりこの世を去りました…。`);
            // ★大名の時と同じように、ダイアログを出して0秒（押すまで）待ちます！
            await this.game.ui.showDialogAsync(`${names}が病によりこの世を去りました…。`, false, 0);
        }
    }

    // お別れの処理をするところです
    async executeDeath(busho) {
        busho.status = 'dead'; // ステータスを「死亡」にします
        
        const castle = this.game.getCastle(busho.castleId);
        if (castle) {
            // お城の武将リストから外します
            castle.samuraiIds = castle.samuraiIds.filter(id => id !== busho.id);
        }
        
        // もし城主だったら、役職を外して新しい城主を決めます
        if (busho.isCastellan) {
            busho.isCastellan = false;
            if (castle) {
                this.game.updateCastleLord(castle);
            }
        }

        // もし大名だったら、後継ぎを決めます
        if (busho.isDaimyo) {
            await this.handleDaimyoDeath(busho);
        }

        // 軍師だったら役職を外します
        if (busho.isGunshi) {
            busho.isGunshi = false;
        }
        
        busho.clan = 0;
        busho.castleId = 0;
        busho.belongKunishuId = 0;
    }

    // 大名が亡くなった時の後継ぎ選びです
    async handleDaimyoDeath(daimyo) {
        // ==========================================
        // ★すでにすべてのお城を失って「滅亡」している場合は、後継ぎは選びません！
        const clanCastles = this.game.castles.filter(c => c.ownerClan === daimyo.clan);
        if (clanCastles.length === 0) {
            daimyo.isDaimyo = false;
            return; 
        }
        // ==========================================

        // 1. 生きている一門がいるかチェック
        const activeFamily = this.game.bushos.filter(b => b.clan === daimyo.clan && b.id !== daimyo.id && b.status === 'active' && !b.isDaimyo && daimyo.familyIds.some(fId => b.familyIds.includes(fId)));
        
        let extraMsg = ""; // 緊急で元服した時の追加メッセージ

        // もし生きている一門が0人なら、未登場の一門を探して強制的に登場させる
        if (activeFamily.length === 0) {
            const unbornFamily = this.game.bushos.filter(b => b.status === 'unborn' && daimyo.familyIds.some(fId => b.familyIds.includes(fId)));
            
            if (unbornFamily.length > 0) {
                // 相性 -> 年齢順に並べ替え
                unbornFamily.sort((a,b) => {
                    const diffA = Math.abs((daimyo.affinity || 0) - (a.affinity || 0));
                    const diffB = Math.abs((daimyo.affinity || 0) - (b.affinity || 0));
                    if (diffA !== diffB) return diffA - diffB;
                    return a.birthYear - b.birthYear;
                });

                // 一番有力な候補を強制登場させる
                const heir = unbornFamily[0];
                const baseCastle = clanCastles.length > 0 ? clanCastles[0] : null;

                if (baseCastle) {
                    heir.status = 'active';
                    heir.clan = daimyo.clan;
                    heir.castleId = baseCastle.id;
                    heir.loyalty = 100;
                    if (!baseCastle.samuraiIds.includes(heir.id)) baseCastle.samuraiIds.push(heir.id);
                    extraMsg = `\n ${heir.name.replace('|','')}が急遽元服しました。`;
                }
            }
        }

        // 緊急登場が終わった「後」で、同じ大名家の中から候補を探し直します！
        const clanBushos = this.game.bushos.filter(b => b.clan === daimyo.clan && b.status === 'active' && !b.isDaimyo);
        
        if (clanBushos.length > 0) {
            // 誰を後継ぎにするか、計算して決めます
            clanBushos.forEach(b => {
                b._isRelative = daimyo.familyIds.some(fId => b.familyIds.includes(fId));
                b._affinityDiff = Math.abs((daimyo.affinity || 0) - (b.affinity || 0));
                b._baseScore = b.leadership + b.intelligence;
            });
            
            clanBushos.sort((a, b) => {
                if (a._isRelative && !b._isRelative) return -1;
                if (!a._isRelative && b._isRelative) return 1;
                if (a._isRelative && b._isRelative) {
                    if (a._affinityDiff !== b._affinityDiff) return a._affinityDiff - b._affinityDiff;
                    if (a.birthYear !== b.birthYear) return a.birthYear - b.birthYear;
                }
                return b._baseScore - a._baseScore;
            });
            
            // 一番上に来た人を後継ぎにします！
            const successor = clanBushos[0];
            
            this.game.changeLeader(daimyo.clan, successor.id);
            
            const msg = `【当主交代】\n${daimyo.name.replace('|','')}が死亡し、${successor.name.replace('|','')}が家督を継ぎました。${extraMsg}`;
            this.game.ui.log(`【当主交代】${daimyo.name.replace('|','')}が死亡し、${successor.name.replace('|','')}が家督を継ぎました。`);
            
            await this.game.ui.showDialogAsync(msg, false, 0);

        } else {
            // ★変更：誰もいなかったら、新しく作った滅亡チェックの魔法にバトンタッチします！
            daimyo.isDaimyo = false;
            await this.checkClanExtinction(daimyo.clan, 'no_heir');
        }
    }
    
    // ★大名家の滅亡を処理する魔法です！
    async checkClanExtinction(clanId, reason = 'no_castle') {
        if (!clanId || clanId === 0) return;
        
        // 大名家のデータを探します
        const clan = this.game.clans.find(c => c.id === clanId);
        if (!clan || clan.extinctionNotified) return; // すでに通知済みなら二重に出さないようにします

        // その大名家が持っているお城を数えます
        const clanCastles = this.game.castles.filter(c => c.ownerClan === clanId);
        
        // 滅亡の条件：お城が0個になった、または後継ぎがいない場合です
        if (clanCastles.length === 0 || reason === 'no_heir') {
            clan.extinctionNotified = true; // 二度と呼ばれないように印をつけます

            const displayClanName = clan.name.endsWith('家') ? clan.name : clan.name + '家';
            
            let extMsg = "";
            if (reason === 'no_heir') {
                extMsg = `【大名家滅亡】\n当主が死亡し、後継ぎがいないため\n${displayClanName}は滅亡しました。`;
            } else {
                extMsg = `【大名家滅亡】\n拠点を全て失い、\n${displayClanName}は滅亡しました。`;
            }
            
            // 履歴にメッセージを残します
            this.game.ui.log(extMsg);
            
            // 画面にメッセージを出して、プレイヤーが押すまで待ちます
            await this.game.ui.showDialogAsync(extMsg, false, 0);

            // もし残っている武将がいたら、全員「浪人」にします
            this.game.bushos.filter(b => b.clan === clanId && b.status === 'active').forEach(b => {
                // 大名家の武将が浪人になるので功績を半分にします
                if ((b.belongKunishuId || 0) === 0) {
                    b.achievementTotal = Math.floor((b.achievementTotal || 0) / 2);
                }
                this.game.affiliationSystem.becomeRonin(b);
            });

            // 城主や大名がまだ城に残っている判定になっていれば、お城を空っぽにします
            clanCastles.forEach(c => {
                c.ownerClan = 0;
                c.castellanId = 0;
                this.game.getCastleBushos(c.id).forEach(l => {
                    if (l.status === 'unborn' || l.status === 'dead') return;
                    this.game.affiliationSystem.becomeRonin(l);
                });
                this.game.updateCastleLord(c); // 城主情報をリセット
            });

            // もしプレイヤーの大名家が滅亡してしまったら…ゲームオーバーです！
            if (clanId === this.game.playerClanId) {
                return new Promise(resolve => {
                    setTimeout(() => {
                        this.game.ui.showDialog("全拠点を失いました。我が大名家は滅亡しました……", false, () => {
                            this.game.ui.returnToTitle(); // タイトル画面に戻ります
                        });
                    }, 1000);
                });
            } else {
                // プレイヤー以外の滅亡時、大名が生きていれば浪人にします
                const leader = this.game.getBusho(clan.leaderId);
                if (leader && leader.status !== 'dead') {
                    leader.isDaimyo = false;
                    this.game.affiliationSystem.becomeRonin(leader);
                }
            }
        }
    }    
}