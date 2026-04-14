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
            this.updateAllBushosAge(); // 毎年1月に、全員の年齢と能力を計算し直します！
            await this.checkBirth();
            await this.checkNameChange();

            // 新しく登場した武将たちのために、派閥を組み直す魔法を呼び出します！
            if (this.game.factionSystem) {
                this.game.factionSystem.updateFactions();
            }
        }
    }

    // 毎月の終わりに「寿命を迎えて亡くなる武将がいないか」をチェックします
    async processEndMonth() {
        await this.checkDeath();
    }

    // ★ 全員の年齢から能力値を計算し直す魔法です！
    updateAllBushosAge() {
        const currentYear = this.game.year;
        
        for (const b of this.game.bushos) {
            // まだ生まれていない武将は計算しません
            if (b.status === 'unborn') continue;

            // 今の年齢を計算します
            const age = currentYear - b.birthYear;
            
            let penaltyYoung = 0;       // 若い時のマイナス
            let penaltyOldGeneral = 0;  // おじいちゃんになった時のマイナス（智謀以外）
            let penaltyOldInt = 0;      // おじいちゃんになった時のマイナス（智謀だけ）
            
            // 30歳未満の場合（2歳若くなるごとにマイナス1）
            if (age < 30) {
                penaltyYoung = Math.ceil((30 - age) / 2);
            } 
            
            // 46歳以上の場合（3年歳をとるごとにマイナス1）
            if (age >= 46) {
                penaltyOldGeneral = Math.ceil((age - 45) / 3);
            }

            // 智謀（intelligence）は56歳以上の場合（3年歳をとるごとにマイナス1）
            if (age >= 56) {
                penaltyOldInt = Math.ceil((age - 55) / 3);
            }
            
            // 基礎値からペナルティを引いて、0以下にならないように（最低1）セットします
            // 統率・武勇・政治・外交は、若い時のマイナスと、46歳からのマイナスを引きます
            b.leadership = Math.max(1, b.baseLeadership - penaltyYoung - penaltyOldGeneral);
            b.strength = Math.max(1, b.baseStrength - penaltyYoung - penaltyOldGeneral);
            b.politics = Math.max(1, b.basePolitics - penaltyYoung - penaltyOldGeneral);
            b.diplomacy = Math.max(1, b.baseDiplomacy - penaltyYoung - penaltyOldGeneral);
            
            // 智謀だけは、若い時のマイナスと、56歳からのマイナスを引きます
            b.intelligence = Math.max(1, b.baseIntelligence - penaltyYoung - penaltyOldInt);
        }
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

            // 「/」で区切られている複数の改名予定を一つずつ確認します
            const changes = b.nameChange.split('/');
            for (const change of changes) {
                const parts = change.split(':');
                // 年、名前（姓|名）、読み仮名（姓|名）の３つが揃っているか確認します
                if (parts.length === 3) {
                    const targetYear = Number(parts[0].trim());
                    
                    // 今の年と「同じ」、または「昔」のデータなら名前を更新します！
                    if (targetYear <= currentYear) {
                        // 新しい名前を「|」で姓と名に分けます
                        const newNameParts = parts[1].trim().split('|');
                        const newFamilyName = newNameParts[0] || ""; // 新しい姓
                        const newGivenName = newNameParts[1] || "";  // 新しい名
                        
                        // 新しい読み仮名も「|」で姓と名に分けます
                        const newYomiParts = parts[2].trim().split('|');
                        const newFamilyYomi = newYomiParts[0] || ""; // 新しい姓の読み
                        const newGivenYomi = newYomiParts[1] || "";  // 新しい名の読み
                        
                        const oldName = b.name; // 今の名前をメモしておきます
                        const newName = newFamilyName + newGivenName; // 新しいフルネーム
                        const newYomi = newFamilyYomi + newGivenYomi; // 新しいフルネームの読み

                        // 名前と読み仮名のデータを書き換えます！
                        b.familyName = newFamilyName;
                        b.givenName = newGivenName;
                        b.name = newName;
                        
                        b.familyYomi = newFamilyYomi;
                        b.givenYomi = newGivenYomi;
                        b.yomi = newYomi;

                        // ★お知らせを出すのは、改名する年が「ピッタリ今の年」の時だけにします！
                        // すでにゲームに登場して生きている武将（activeかronin）なら、お知らせを出します
                        if (targetYear === currentYear && (b.status === 'active' || b.status === 'ronin')) {
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
                                await this.game.ui.showDialogAsync(msg); 
                                // ==========================================
                                
                                // もし大名だったら、大名家の名前も新しくします
                                if (b.isDaimyo && b.clan !== 0) {
                                    const clan = this.game.clans.find(c => c.id === b.clan);
                                    if (clan) {
                                        const oldClanName = clan.name;
                                        const newClanName = `${newFamilyName}家`;
                                        const newClanYomi = newFamilyYomi ? `${newFamilyYomi}け` : ""; // ★読み仮名も作ります
                                        
                                        // ★大名家の名前が本当に変わる時だけ、お知らせを出します！
                                        if (oldClanName !== newClanName) {
                                            clan.name = newClanName;
                                            clan.yomi = newClanYomi; // ★読み仮名も新しく書き換えます
                                            
                                            // ==========================================
                                            // ★大名家の名前が変わった時も、新しくメッセージを作って1回ずつ待ちます！
                                            const clanMsg = `当主の改名により、${oldClanName}は今後「${clan.name}」となります。`;
                                            this.game.ui.log(clanMsg);
                                            await this.game.ui.showDialogAsync(clanMsg);
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
    }
    
    // ==========================================
    // ★↑↑書き足すのはここまで！↑↑★
    // ==========================================

    // ★ 登場のチェック（毎年1月に行います）
    async checkBirth() {
        const currentYear = this.game.year;
        
        // まだ登場していない（statusが'unborn'）武将の中で、登場年を迎えた人を探します
        const unbornBushos = this.game.bushos.filter(b => b.status === 'unborn' && b.startYear <= currentYear);
        
        // ★変更：メッセージをためる箱（配列）は使わず、一つずつ順番に出すために「for...of」という魔法の繰り返しを使います！
        for (const b of unbornBushos) {
            // ★変更：大名家に所属しておらず、諸勢力でもない場合は「浪人」になります
            if (b.clan === 0 && (b.belongKunishuId || 0) === 0) {
                // 登場前:浪人 の場合
                b.status = 'ronin';
                b.loyalty = 50; // ★浪人として登場したので、忠誠度を50にします！
                const targetCastle = this.game.getCastle(b.castleId);
                if (targetCastle) {
                    targetCastle.samuraiIds.push(b.id);
                }
            } else if ((b.belongKunishuId || 0) > 0) {
                // ★追加：登場前:諸勢力 の場合
                b.status = 'active';
                const targetCastle = this.game.getCastle(b.castleId);
                if (targetCastle) {
                    targetCastle.samuraiIds.push(b.id);
                }
            } else {
                // 登場前:仕官 の場合
                b.status = 'active';
                
                // ★追加：「登場前:仕官」の武将に一門武将がいるかチェックします
                // 条件：すでに登場して活動している、自分自身ではない、一門IDが共通している
                const activeRelatives = this.game.bushos.filter(other => 
                    other.status === 'active' &&
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
                            b.loyalty = 50; // ★浪人になったので忠誠度を50にします！
                        } else {
                            b.clan = ownerClanId;
                        }
                    }

                    targetCastle.samuraiIds.push(b.id);
                    
                    // プレイヤーの大名家にやってきた場合は、お知らせのメッセージを作ります
                    if (b.status === 'active' && b.clan === this.game.playerClanId) {
                        const nameStr = b.name.replace('|', '');
                        let msg = "";
                        if (hasRelative) {
                            msg = `${nameStr}が元服し、当家に加わりました！`;
                        } else {
                            msg = `${nameStr}が当家に仕官しました！`;
                        }
                        // ★変更：リストに溜め込まず、ここで直接画面に出して「OK」を押すまで待ちます！
                        this.game.ui.log(msg);
                        await this.game.ui.showDialogAsync(msg, false, 0);
                    }
                } else {
                    // 万が一城が見つからなかった時の安全策
                    b.status = 'ronin';
                    b.clan = 0;
                    b.loyalty = 50; // ★浪人になったので忠誠度を50にします！
                }
            }
        }

        // ★ここから追加：姫の登場チェックを書き足します！
        const unbornPrincesses = this.game.princesses.filter(p => p.status === 'unborn' && p.startYear <= currentYear);

        // ★変更：ここも「for...of」の魔法の繰り返しに変えて、一つずつ待ちます！
        for (const p of unbornPrincesses) {
            let targetClanId = 0;
            let fatherNameStr = ""; // ★お父さんの名前を書いておくメモ帳です

            if (p.fatherId > 0) {
                // お父さんがいる場合は、お父さんのいる大名家を探します
                const father = this.game.getBusho(p.fatherId);
                if (father && father.status !== 'dead' && father.status !== 'unborn' && father.clan !== 0) {
                    targetClanId = father.clan;
                    fatherNameStr = father.name.replace('|', ''); // ★お父さんの名前から「|」を消してメモします
                }
            }
            
            // ★お父さんが設定されていない、またはお父さんが死んだり浪人していて大名家が見つからなかった場合！
            if (targetClanId === 0 && p.originalClanId > 0) {
                const clanCastles = this.game.castles.filter(c => c.ownerClan === p.originalClanId);
                // その大名家が滅亡していなければ（お城を持っていれば）
                if (clanCastles.length > 0) {
                    targetClanId = p.originalClanId;
                }
            }

            if (targetClanId > 0) {
                p.status = 'unmarried'; // 登場して「未婚」になります
                p.currentClanId = targetClanId;
                
                // プレイヤーの大名家に姫がやってきたらお知らせのメッセージを作ります
                if (targetClanId === this.game.playerClanId) {
                    let msg = "";
                    if (fatherNameStr !== "") {
                        // ★ここから変更：お父さんの身分によってメッセージを切り替えます！
                        let isRoyal = false;
                        const playerDaimyo = this.game.bushos.find(b => b.clan === this.game.playerClanId && b.isDaimyo);
                        const fatherData = this.game.getBusho(p.fatherId); // お父さんのデータをもう一度呼び出します
                        
                        if (playerDaimyo && fatherData) {
                            // お父さんが大名本人か、血の繋がった直接の一門（baseFamilyIdsが共通）かをチェックします
                            const isDirectFamily = fatherData.baseFamilyIds.some(fId => playerDaimyo.baseFamilyIds.includes(fId));
                            if (fatherData.id === playerDaimyo.id || isDirectFamily) {
                                isRoyal = true;
                            }
                        }

                        // 大名や直接の一門の場合は特別なお知らせ！
                        if (isRoyal) {
                            msg = `${fatherNameStr}様の姫君、${p.name}様がお生まれになりました！`;
                        } else {
                            // 間接的な一門や、普通の家臣の場合はこちらになります
                            msg = `${fatherNameStr}のご息女、${p.name}が誕生しました！`;
                        }
                    } else {
                        msg = `${p.name}が誕生しました！`;
                    }
                    // ★変更：リストに溜め込まず、ここで直接画面に出して「OK」を押すまで待ちます！
                    this.game.ui.log(msg);
                    await this.game.ui.showDialogAsync(msg, false, 0);
                }
            }
        }
        // ★追加ここまで！
    }

    // ★ 寿命のチェック（毎月行います）
    async checkDeath() {
        const currentYear = this.game.year;
        
        // 【変更点①】没年の「1年前（endYear - 1）」を迎えている武将を探すようにしました！
        const targetBushos = this.game.bushos.filter(b => 
            b.status !== 'unborn' && b.status !== 'dead' && currentYear >= (b.endYear - 1)
        );

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
                // もしプレイヤーの家臣だったら、その場でお知らせを出します
                if (b.clan === this.game.playerClanId) {
                    const name = b.name.replace('|', '');
                    this.game.ui.log(`${name}が病によりこの世を去りました…。`);
                    // ★一人ずつ順番にダイアログを出して、押すまで待ちます！
                    await this.game.ui.showDialogAsync(`${name}が病によりこの世を去りました…。`, false, 0);
                }
            }
        }

        // ★ここから追加：姫の寿命チェックを書き足します！
        const targetPrincesses = this.game.princesses.filter(p => 
            p.status !== 'unborn' && p.status !== 'dead' && currentYear >= (p.endYear - 1)
        );

        for (const p of targetPrincesses) {
            const yearsPassed = currentYear - (p.endYear - 1);
            const deathProb = 0.02 + (yearsPassed * 0.02);

            if (Math.random() < deathProb) {
                p.status = 'dead'; // 「死亡」の印をつけます
                
                // もし結婚していたら、旦那さんの奥さんリストから外します
                if (p.husbandId > 0) {
                    const husband = this.game.getBusho(p.husbandId);
                    if (husband) {
                        husband.wifeIds = husband.wifeIds.filter(id => id !== p.id);
                        
                        // ★ここから追加：婚姻同盟の解消チェック
                        const clanA = p.originalClanId;
                        const clanB = husband.clan;
                        
                        if (clanA > 0 && clanB > 0 && clanA !== clanB) {
                            // 他にこの２つの家を結んでいる、生きているお姫様がいるか名簿を探します
                            const hasOtherMarriage = this.game.princesses.some(otherP => {
                                // 死んでいる、生まれていない、結婚していない姫は除外します
                                if (otherP.status === 'dead' || otherP.status === 'unborn' || otherP.husbandId === 0) return false;
                                
                                const otherHusband = this.game.getBusho(otherP.husbandId);
                                if (!otherHusband) return false;
                                
                                // 実家と嫁ぎ先が、今回と同じ組み合わせかチェックします（A家→B家、またはB家→A家）
                                return (otherP.originalClanId === clanA && otherHusband.clan === clanB) || 
                                       (otherP.originalClanId === clanB && otherHusband.clan === clanA);
                            });
                            
                            // 他に誰もいなければ、婚姻のシール（isMarriage）を剥がします！
                            if (!hasOtherMarriage) {
                                const clanAData = this.game.clans.find(c => c.id === clanA);
                                const clanBData = this.game.clans.find(c => c.id === clanB);
                                
                                if (clanAData && clanAData.diplomacyValue[clanB]) {
                                    clanAData.diplomacyValue[clanB].isMarriage = false;
                                }
                                if (clanBData && clanBData.diplomacyValue[clanA]) {
                                    clanBData.diplomacyValue[clanA].isMarriage = false;
                                }
                                
                                // プレイヤーが関係している家なら、追加でお知らせを出します
                                if (clanA === this.game.playerClanId || clanB === this.game.playerClanId) {
                                    const targetClanName = (clanA === this.game.playerClanId) ? clanBData?.name : clanAData?.name;
                                    if (targetClanName) {
                                        const breakMsg = `${p.name}の死により、${targetClanName}との婚姻関係は解消され、通常の同盟となりました。`;
                                        this.game.ui.log(breakMsg);
                                        await this.game.ui.showDialogAsync(breakMsg, false, 0);
                                    }
                                }
                            }
                        }
                    }
                }

                // プレイヤーの家にいる姫だったら、悲しいお知らせを表示します
                if (p.currentClanId === this.game.playerClanId) {
                    this.game.ui.log(`${p.name}が病によりこの世を去りました…。`);
                    await this.game.ui.showDialogAsync(`${p.name}が病によりこの世を去りました…。`, false, 0);
                }
            }
        }
        // ★追加ここまで！
    }

    // お別れの処理をするところです
    async executeDeath(busho) {
        busho.status = 'dead'; // ステータスを「死亡」にします
        
        // ★ここを追加：官位を持っていたら朝廷に返す魔法！
        if (busho.courtRankIds && busho.courtRankIds.length > 0) {
            // ★追加：もし征夷大将軍（ID1）を持っていたら、後継ぎのためにメモを残しておきます！
            if (busho.courtRankIds.includes(1)) {
                busho._wasShogun = true;
            }
            busho.courtRankIds.forEach(rankId => {
                this.game.courtRankSystem.returnRank(rankId);
            });
            busho.courtRankIds = []; // 自分の持ち物リストは空っぽにします
        }
        
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

        // ★ここから追加：武将が亡くなって人が減ったので、派閥を組み直す魔法を呼び出します！
        if (this.game.factionSystem) {
            this.game.factionSystem.updateFactions();
        }
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

        const messages = []; // ★順番に出すメッセージを溜めておくリストを作ります

        // 今のゲームの年を時計で確認します
        const currentYear = this.game.year;

        // 1. 今活躍している家臣たちと、まだ登場していない一門を全員集めます！
        // （ただし、まだ生まれていない人は絶対に除外します！）
        const activeBushos = this.game.bushos.filter(b => b.clan === daimyo.clan && b.id !== daimyo.id && b.status === 'active' && !b.isDaimyo);
        const unbornFamily = this.game.bushos.filter(b => b.status === 'unborn' && daimyo.familyIds.some(fId => b.familyIds.includes(fId)) && b.birthYear <= currentYear);
        
        // 浪人や諸勢力（※頭領は除く）に所属している一門武将も探します！
        const externalFamily = this.game.bushos.filter(b => {
            // 自分自身は除外します
            if (b.id === daimyo.id) return false;
            // 一門ではない武将も除外します
            if (!daimyo.familyIds.some(fId => b.familyIds.includes(fId))) return false;
            
            // 浪人なら候補に入れます
            if (b.status === 'ronin') return true;
            
            // 諸勢力に所属している武将の場合
            if ((b.belongKunishuId || 0) > 0 && b.clan === 0) {
                // 諸勢力のデータを調べて、その武将が頭領かどうかを確認します
                const kunishu = this.game.kunishuSystem ? this.game.kunishuSystem.getKunishu(b.belongKunishuId) : null;
                // 頭領だった場合は、候補から外します
                if (kunishu && kunishu.leaderId === b.id) {
                    return false; 
                }
                // 頭領ではない普通の武将なら候補に入れます
                return true;
            }
            return false;
        });

        const allCandidates = [...activeBushos, ...unbornFamily, ...externalFamily];

        if (allCandidates.length > 0) {
            let successor = null;

            // ★ここから変更：プレイヤーの家なら自分で選ぶ魔法を復活させます！
            if (daimyo.clan === this.game.playerClanId) {
                // プレイヤーが選ぶまで「待つ」魔法です
                await new Promise(resolve => {
                    this.game.ui.showSuccessionModal(allCandidates, (newLeaderId) => {
                        successor = this.game.getBusho(newLeaderId);
                        resolve();
                    });
                });
            } else {
                // AIの場合は、自動で一番ふさわしい人を計算して選びます
                allCandidates.forEach(b => {
                    b._isRelative = daimyo.familyIds.some(fId => b.familyIds.includes(fId));
                    b._affinityDiff = Math.abs((daimyo.affinity || 0) - (b.affinity || 0));
                    b._baseScore = b.leadership + b.intelligence;
                });

                allCandidates.sort((a, b) => {
                    // 一門（親戚）を優先します
                    if (a._isRelative && !b._isRelative) return -1;
                    if (!a._isRelative && b._isRelative) return 1;
                    
                    // どちらも一門（またはどちらも一門ではない）場合は、相性などを比べます
                    if (a._isRelative && b._isRelative) {
                        if (a._affinityDiff !== b._affinityDiff) return a._affinityDiff - b._affinityDiff;
                        
                        const aIsYounger = a.birthYear > daimyo.birthYear;
                        const bIsYounger = b.birthYear > daimyo.birthYear;
                        if (aIsYounger && !bIsYounger) return -1;
                        if (!aIsYounger && bIsYounger) return 1;
                        
                        if (a.birthYear !== b.birthYear) return a.birthYear - b.birthYear;
                    }
                    // 血の繋がりに関係なく、最後は能力の高さで決めます
                    return b._baseScore - a._baseScore;
                });

                // 一番上に来た人を後継ぎにします！
                successor = allCandidates[0];
            }

            let isExternalSuccessor = false;

            // 選ばれた後継ぎが外部の武将（未登場、浪人、諸勢力）だった場合は、急いで迎え入れます！
            if (successor.status === 'unborn' || successor.status === 'ronin' || (successor.belongKunishuId || 0) > 0) {
                isExternalSuccessor = true;
                const baseCastle = clanCastles.length > 0 ? clanCastles[0] : null;

                if (baseCastle) {
                    if ((successor.belongKunishuId || 0) > 0) {
                        const kunishu = this.game.kunishuSystem ? this.game.kunishuSystem.getKunishu(successor.belongKunishuId) : null;
                        const kunishuName = kunishu ? kunishu.getName(this.game) : "諸勢力";
                        
                        successor.belongKunishuId = 0;
                        messages.push(`${kunishuName}より${successor.name.replace('|','')}が\n当主として迎え入れられました。`);
                    } else if (successor.status === 'ronin') {
                        messages.push(`${successor.name.replace('|','')}が当主として迎え入れられました。`);
                    } else {
                        messages.push(`${successor.name.replace('|','')}が急遽元服し、家督を継ぎました。`);
                    }

                    // 元々どこかの城にいた場合は、お城を出ます
                    if (successor.status === 'ronin' || successor.status === 'active') {
                        this.game.affiliationSystem.leaveCastle(successor);
                    }

                    successor.status = 'active';
                    successor.clan = daimyo.clan;
                    successor.castleId = baseCastle.id;
                    successor.loyalty = 100;
                    if (!baseCastle.samuraiIds.includes(successor.id)) baseCastle.samuraiIds.push(successor.id);
                }
            }

            // ★ここから追加：大名になった瞬間に「daimyo:」の改名データがあれば改名する魔法！
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

            // ★追加：先代が征夷大将軍で、後継ぎが一門武将なら「左馬頭（ID80）」をこっそり与える魔法！
            if (daimyo._wasShogun) {
                // 後継ぎが一門武将かどうかを血の繋がり（familyIds）で確認します
                const isRelative = daimyo.familyIds.some(fId => successor.familyIds.includes(fId));
                if (isRelative) {
                    // 朝廷システムにお願いして、後継ぎにID80の官位を与えます
                    this.game.courtRankSystem.grantRank(successor, 80);
                }
            }
            
            this.game.changeLeader(daimyo.clan, successor.id);
            
            // ★当主交代があったら、今まで進めていた作戦（攻撃準備など）を一旦キャンセルして白紙に戻します！
            if (this.game.aiOperationManager && this.game.aiOperationManager.operations[daimyo.clan]) {
                delete this.game.aiOperationManager.operations[daimyo.clan];
            }
            
            // ★新旧大名の能力比較と、忠誠・民忠への影響！
            
            // 1. 交代前の大名と、新しい大名の「6つの能力の合計」を計算します
            const oldTotal = daimyo.leadership + daimyo.strength + (daimyo.politics || 0) + (daimyo.diplomacy || 0) + daimyo.intelligence + daimyo.charm;
            const newTotal = successor.leadership + successor.strength + (successor.politics || 0) + (successor.diplomacy || 0) + successor.intelligence + successor.charm;
            
            // 2. 差額を計算します（プラスなら優秀、マイナスなら不安）
            const diff = newTotal - oldTotal;
            
            // 3. 差が「101以上」離れているかチェックします
            let changeVal = 0;
            // 差額の絶対値（プラスマイナスをなくした純粋な差）が101以上なら計算を始めます
            if (Math.abs(diff) >= 101) {
                // 差がプラスなら100を引き、マイナスなら100を足して、「100をはみ出した分」だけを取り出します
                const overDiff = diff > 0 ? diff - 100 : diff + 100;
                
                // はみ出した分に0.2を掛け算します
                changeVal = Math.floor(overDiff * 0.2);
            }
            
            // 上限30、下限-30でストッパーをかけます
            changeVal = Math.max(-30, Math.min(30, changeVal));

            // もし能力に差があって、変動する数値が0じゃないなら魔法発動！
            if (changeVal !== 0) {
                // ① 配下武将の忠誠を変動させます（新当主本人は除きます）
                const retainers = this.game.bushos.filter(b => b.clan === daimyo.clan && b.id !== successor.id && b.status === 'active');
                retainers.forEach(b => {
                    // 忠誠度は0～100の間で収まるようにします
                    b.loyalty = Math.max(0, Math.min(100, b.loyalty + changeVal));
                });
                
                // ② 所有しているお城の民忠を変動させます
                const clanCastlesInfo = this.game.castles.filter(c => c.ownerClan === daimyo.clan);
                clanCastlesInfo.forEach(c => {
                    // 民忠も0～100の間で収まるようにします
                    c.peoplesLoyalty = Math.max(0, Math.min(100, (c.peoplesLoyalty || 50) + changeVal));

                    // 能力が下がって、changeValがマイナスになっている時の処理
                    if (changeVal < 0) {
                        // マイナスの記号を取って、純粋な数字（パーセント）にします
                        const decreasePercent = Math.abs(changeVal);
                        
                        // 兵士は decreasePercent ％減らします（残る割合を掛け算します）
                        c.soldiers = Math.floor(c.soldiers * ((100 - decreasePercent) / 100));
                        
                        // 人口はその半分（decreasePercent / 2）％減らします
                        c.population = Math.floor(c.population * ((100 - (decreasePercent / 2)) / 100));
                    }
                });

                // ③ プレイヤーの大名家なら、メッセージに結果を書き足してお知らせします！
                if (daimyo.clan === this.game.playerClanId) {
                    if (changeVal > 0) {
                        messages.push(`新当主への期待から、家臣団の気勢が高まっています！`);
                    } else {
                        const decreasePercent = Math.abs(changeVal);
                        messages.push(`当主交代による不安から、家臣団が動揺しています……`);
                    }
                }
            }
            
            // ★ここから追加：当主交代による外交関係の変動！
            this.game.clans.forEach(otherClan => {
                // 空き家（0）や自分自身は計算しません
                if (otherClan.id === 0 || otherClan.id === daimyo.clan) return;

                // 相手との外交データを取得します
                const rel = this.game.diplomacyManager.getRelation(daimyo.clan, otherClan.id);
                if (!rel) return;

                let changeAmount = 0;

                // 関係が「普通」か「友好」の場合
                if (rel.status === '普通' || rel.status === '友好') {
                    if (rel.sentiment >= 51 && rel.sentiment <= 54) {
                        // 50にするための差分を計算します
                        changeAmount = 50 - rel.sentiment; 
                    } else if (rel.sentiment >= 55) {
                        // 55以上の場合は5下げます
                        changeAmount = -5;
                    }
                } 
                // 関係が「同盟」「従属」「支配」の場合（婚姻はステータスが「同盟」になっています）
                else if (rel.status === '同盟' || rel.status === '従属' || rel.status === '支配') {
                    // 基本は10下げますが、新当主の能力による変動（changeVal）も一緒に計算します
                    changeAmount = -10 + changeVal;
                }

                // 変化がある場合のみ、外交システムに更新をお願いします
                if (changeAmount !== 0) {
                    this.game.diplomacyManager.updateSentiment(daimyo.clan, otherClan.id, changeAmount);
                }
            });
            // ★追加ここまで

            // ★ここから追加：当主交代による諸勢力との友好度の変動！
            if (this.game.kunishuSystem) {
                const aliveKunishus = this.game.kunishuSystem.getAliveKunishus();
                aliveKunishus.forEach(kunishu => {
                    // 現在の諸勢力との仲良し度を調べます
                    const currentRel = kunishu.getRelation(daimyo.clan);
                    
                    let changeAmount = 0;
                    
                    // 仲良し度が51〜54なら、50に戻します
                    if (currentRel >= 51 && currentRel <= 54) {
                        changeAmount = 50 - currentRel; 
                    } 
                    // 仲良し度が55以上なら、5下げます
                    else if (currentRel >= 55) {
                        changeAmount = -5;
                    }
                    
                    // 変化がある場合のみ、新しい仲良し度を箱にしまいます
                    if (changeAmount !== 0) {
                        kunishu.setRelation(daimyo.clan, currentRel + changeAmount);
                    }
                });
            }
            // ★諸勢力の追加ここまで

            // ★ここから追加：当主交代に合わせて大名家の名前を変更し、マップを更新します！
            const clan = this.game.clans.find(c => c.id === daimyo.clan);
            let originalClanName = ""; // ★死亡した大名の元の家名を覚えておくメモ帳です！
            
            if (clan) {
                originalClanName = clan.name; // ★ここでメモします
                const oldClanName = clan.name;
                
                // 万が一「姓」のデータが空っぽだった場合に備えて、フルネームを代用する安全策を入れます
                const safeFamilyName = successor.familyName || successor.name;
                const newClanName = `${safeFamilyName}家`;
                
                // ★読み仮名も新しい当主の「姓の読み」から作ります！
                const safeFamilyYomi = successor.familyYomi || successor.yomi;
                const newClanYomi = safeFamilyYomi ? `${safeFamilyYomi}け` : "";
                
                // 家の名前が本当に変わる場合のみ変更します
                if (oldClanName !== newClanName) {
                    clan.name = newClanName;
                    clan.yomi = newClanYomi; // ★読み仮名も新しく書き換えます
                    messages.push(`当主の交代により、${oldClanName}は今後「${newClanName}」となります。`);
                }
            }
            // ★追加ここまで
            
            // ★変更：大名家の名前が変わったかどうかにかかわらず、大名が交代したら必ずマップを描き直します！
            if (this.game.ui && typeof this.game.ui.renderMap === 'function') {
                this.game.ui.renderMap();
            }
            
            // ★メモしておいた家名を使って「〇〇家の」という言葉を作ります
            const clanPrefix = originalClanName ? `${originalClanName}の` : "";
            
            let mainMsg = "";
            if (isExternalSuccessor) {
                mainMsg = `${clanPrefix}${daimyo.name.replace('|','')}が死亡しました。`;
                this.game.ui.log(`【当主交代】${mainMsg}`);
            } else {
                mainMsg = `${clanPrefix}${daimyo.name.replace('|','')}が死亡し、${successor.name.replace('|','')}が家督を継ぎました。`;
                this.game.ui.log(`【当主交代】${mainMsg}`);
            }
            
            // ★一番最初に出すメインの死亡メッセージをリストの先頭に追加します
            messages.unshift(mainMsg);

            // ★順番に1つずつダイアログを出して、クリックされるまで待ちます！
            for (const msg of messages) {
                await this.game.ui.showDialogAsync(msg, false, 0);
            }
            
            // ★後継ぎにバトンタッチしたので、死んだ大名のマークを外します
            daimyo.isDaimyo = false;

        } else {
            // ★誰もいなかったら、新しく作った滅亡チェックの魔法にバトンタッチします！
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
            
            // ★追加：将軍（ID1）が大名で、お城が0になった（滅亡する）場合の特別な死亡処理！
            const leader = this.game.getBusho(clan.leaderId);
            if (leader && leader.status !== 'dead' && leader.isDaimyo && leader.courtRankIds && leader.courtRankIds.includes(1) && clanCastles.length === 0) {
                // 最後の城の今の持ち主がプレイヤーなら、プレイヤーが滅ぼしたと判定します
                const lastCastle = this.game.getCastle(leader.castleId);
                const isPlayerDidIt = lastCastle && lastCastle.ownerClan === this.game.playerClanId;
                
                const leaderNameStr = leader.name.replace('|', '');
                let deathMsg = "";
                if (isPlayerDidIt) {
                    deathMsg = `${leaderNameStr}は自害しました。`;
                } else {
                    deathMsg = `${leaderNameStr}は討死しました。`;
                }
                
                this.game.ui.log(deathMsg);
                await this.game.ui.showDialogAsync(deathMsg, false, 0);
                
                // ここで将軍様を必ず死亡させます！
                await this.executeDeath(leader);
            }

            clan.extinctionNotified = true; // 二度と呼ばれないように印をつけます

            const displayClanName = clan.name.endsWith('家') ? clan.name : clan.name + '家';
            
            let extMsg = "";
            if (reason === 'no_heir') {
                extMsg = `当主が死亡し、後継ぎがいないため\n${displayClanName}は滅亡しました。`;
            } else {
                extMsg = `拠点を全て失い、\n${displayClanName}は滅亡しました。`;
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
                this.game.castleManager.changeOwner(c, 0);
                c.castellanId = 0;
                this.game.getCastleBushos(c.id).forEach(l => {
                    if (l.status === 'unborn' || l.status === 'dead') return;
                    this.game.affiliationSystem.becomeRonin(l);
                });
                this.game.updateCastleLord(c); // 城主情報をリセット
            });

            // ★追加：大名家が滅亡してお城が空っぽになったので、マップをすぐに描き直します！
            if (this.game.ui && typeof this.game.ui.renderMap === 'function') {
                this.game.ui.renderMap();
            }

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