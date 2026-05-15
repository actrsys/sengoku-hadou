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
            
            // ★ここから追加：姫の年齢（出生前かどうか）も毎年1月にチェックします！
            const currentYear = this.game.year;
            for (const p of this.game.princesses) {
                if (p.birthYear > currentYear) {
                    p.status = 'not_born';
                } else if (p.status === 'not_born' && p.birthYear <= currentYear) {
                    p.status = 'unborn';
                }
            }

            await this.checkBirth();
            await this.checkNameChange();
            
            // ★追加：毎年1月に、ランダムで新しい姫が登場するかチェックします！
            await this.checkRandomPrincessAppearance();

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
            // ★ここから修正：状態は変えず、フラグで「出生前」を管理します
            if (b.birthYear > currentYear) {
                b.status = 'unborn';
                b.isNotBorn = true; // まだ生まれていないバリエーション
            } else if (b.isNotBorn && b.birthYear <= currentYear) {
                b.isNotBorn = false; // 生まれたのでフラグを下ろします
            }

            // 出生前（フラグあり）や、まだ登場していない（元服前）武将は能力計算をスキップ
            if (b.isNotBorn || b.status === 'unborn') continue;

            // 今の年齢を計算します
            const age = currentYear - b.birthYear;
            
            let penaltyYoung = 0;       // 若い時のマイナス
            let penaltyOldGeneral = 0;  // おじいちゃんになった時のマイナス（智謀以外）
            let penaltyOldInt = 0;      // おじいちゃんになった時のマイナス（智謀だけ）
            
            // 若い時のペナルティ計算
            if (age < 20) {
                // 0歳〜19歳の場合（20歳時点でのペナルティ5に加えて、1歳若くなるごとにマイナス1）
                penaltyYoung = 5 + (20 - age);
            } else if (age < 30) {
                // 20歳〜29歳の場合（2歳若くなるごとにマイナス1）
                penaltyYoung = Math.ceil((30 - age) / 2);
            } 
            
            // 46歳以上の場合のペナルティ計算（智謀以外）
            if (age >= 61) {
                // 61歳以上の場合は、60歳までのペナルティ（5）に加えて、さらに2年ごとにマイナス1
                penaltyOldGeneral = 5 + Math.ceil((age - 60) / 2);
            } else if (age >= 46) {
                // 46歳〜60歳までは、3年ごとにマイナス1
                penaltyOldGeneral = Math.ceil((age - 45) / 3);
            }

            // 56歳以上の場合のペナルティ計算（智謀だけ）
            if (age >= 71) {
                // 71歳以上の場合は、70歳までのペナルティ（5）に加えて、さらに2年ごとにマイナス1
                penaltyOldInt = 5 + Math.ceil((age - 70) / 2);
            } else if (age >= 56) {
                // 56歳〜70歳までは、3年ごとにマイナス1
                penaltyOldInt = Math.ceil((age - 55) / 3);
            }
            
            // 基礎値からペナルティを引いて、0以下にならないように（最低1）セットします
            b.leadership = Math.max(1, b.baseLeadership - penaltyYoung - penaltyOldGeneral);
            b.strength = Math.max(1, b.baseStrength - penaltyYoung - penaltyOldGeneral);
            b.politics = Math.max(1, b.basePolitics - penaltyYoung - penaltyOldGeneral);
            b.diplomacy = Math.max(1, b.baseDiplomacy - penaltyYoung - penaltyOldGeneral);
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
                        const newFamilyName = newNameParts[0] === "0" ? b.familyName : (newNameParts[0] || ""); // 新しい姓（0ならそのまま）
                        const newGivenName = newNameParts[1] === "0" ? b.givenName : (newNameParts[1] || "");  // 新しい名（0ならそのまま）
                        
                        // 新しい読み仮名も「|」で姓と名に分けます
                        const newYomiParts = parts[2].trim().split('|');
                        const newFamilyYomi = newYomiParts[0] === "0" ? b.familyYomi : (newYomiParts[0] || ""); // 新しい姓の読み（0ならそのまま）
                        const newGivenYomi = newYomiParts[1] === "0" ? b.givenYomi : (newYomiParts[1] || "");  // 新しい名の読み（0ならそのまま）
                        
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
                                // 自勢力の武将か、大名の場合のみ画面にメッセージ（ダイアログ）を出します。
                                // それ以外の武将は履歴（ログ）に残すだけにします。
                                if (b.clan === this.game.playerClanId || b.isDaimyo) {
                                    await this.game.ui.showDialogAsync(msg); 
                                }
                                
                                // もし大名だったら、大名家の名前も新しくします
                                if (b.isDaimyo && b.clan !== 0) {
                                    const clan = this.game.clans.find(c => c.id === b.clan);
                                    if (clan) {
                                        const oldClanName = clan.name;
                                        const newBaseName = `${newFamilyName}家`;
                                        const newClanYomi = newFamilyYomi ? `${newFamilyYomi}け` : ""; // ★読み仮名も作ります
                                        
                                        // ★修正：大名家の名前が本当に変わる時だけ、お知らせを出します！
                                        // 今の家名ではなく、本来の家名（baseName）と比べて判定します。
                                        if (clan.baseName !== newBaseName) {
                                            clan.baseName = newBaseName; // ★本来の家名も更新しておきます
                                            clan.name = newBaseName;
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
        const startY = this.game.gameStartYear || window.MainParams.StartYear;
        const startM = this.game.gameStartMonth || window.MainParams.StartMonth || 1;
        const elapsedTurns = ((this.game.year - startY) * 12) + (this.game.month - startM);
        
        if (elapsedTurns < 3) {
            return; 
        }

        const currentYear = this.game.year;
        
        // 【変更点①】没年の「1年前（endYear - 1）」を迎えている武将を探すようにしました！
        // プレイヤーの大名武将のみ、寿命を本来の寿命＋５年として計算します！
        const targetBushos = this.game.bushos.filter(b => {
            if (b.status === 'unborn' || b.status === 'dead') return false;
            const actualEndYear = (b.isDaimyo && b.clan === this.game.playerClanId) ? b.endYear + 5 : b.endYear;
            return currentYear >= (actualEndYear - 1);
        });

        for (const b of targetBushos) {
            // 【変更点②】没年の「1年前」をスタート地点として、そこから何年過ぎたかを計算します
            // ここでもプレイヤーの大名武将なら寿命を＋５年として計算します！
            const actualEndYear = (b.isDaimyo && b.clan === this.game.playerClanId) ? b.endYear + 5 : b.endYear;
            const yearsPassed = currentYear - (actualEndYear - 1);
            
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
                                        const breakMsg = `${p.name}の死により、${targetClanName}との婚姻関係は解消されました。`;
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
        
        // ★ここから追加：夫が死亡したことによる姫の帰還処理と婚姻同盟の解消
        if (busho.wifeIds && busho.wifeIds.length > 0) {
            for (const wifeId of busho.wifeIds) {
                const princess = this.game.princesses.find(p => p.id === wifeId);
                if (princess && princess.status === 'married') {
                    princess.husbandId = 0; // 未亡人になります
                    
                    // 1. 婚姻同盟の解消チェック
                    const clanA = princess.originalClanId;
                    const clanB = busho.clan;
                    
                    if (clanA > 0 && clanB > 0 && clanA !== clanB) {
                        const hasOtherMarriage = this.game.princesses.some(otherP => {
                            if (otherP.status === 'dead' || otherP.status === 'unborn' || otherP.husbandId === 0) return false;
                            const otherHusband = this.game.getBusho(otherP.husbandId);
                            if (!otherHusband) return false;
                            return (otherP.originalClanId === clanA && otherHusband.clan === clanB) || 
                                   (otherP.originalClanId === clanB && otherHusband.clan === clanA);
                        });
                        
                        if (!hasOtherMarriage) {
                            const clanAData = this.game.clans.find(c => c.id === clanA);
                            const clanBData = this.game.clans.find(c => c.id === clanB);
                            
                            if (clanAData && clanAData.diplomacyValue[clanB]) {
                                clanAData.diplomacyValue[clanB].isMarriage = false;
                            }
                            if (clanBData && clanBData.diplomacyValue[clanA]) {
                                clanBData.diplomacyValue[clanA].isMarriage = false;
                            }
                            
                            if (clanA === this.game.playerClanId || clanB === this.game.playerClanId) {
                                const targetClanName = (clanA === this.game.playerClanId) ? clanBData?.name : clanAData?.name;
                                if (targetClanName) {
                                    const breakMsg = `夫である${busho.name.replace('|', '')}の死により、${targetClanName}との婚姻関係は解消されました。`;
                                    this.game.ui.log(breakMsg);
                                    await this.game.ui.showDialogAsync(breakMsg, false, 0);
                                }
                            }
                        }
                    }

                    // 2. 姫の帰還先を探す
                    let nextClanId = 0;
                    
                    // 実家（originalClanId）が残っているか
                    if (princess.originalClanId > 0) {
                        const originalClanCastles = this.game.castles.filter(c => c.ownerClan === princess.originalClanId);
                        if (originalClanCastles.length > 0) {
                            nextClanId = princess.originalClanId;
                        }
                    }

                    // 実家がない場合、お父さんの一門武将を頼る
                    if (nextClanId === 0 && princess.fatherId > 0) {
                        const father = this.game.getBusho(princess.fatherId);
                        if (father) {
                            const relatives = this.game.bushos.filter(b => 
                                b.status !== 'dead' && b.status !== 'unborn' && b.clan > 0 &&
                                father.familyIds.some(fId => b.familyIds.includes(fId))
                            );

                            if (relatives.length > 0) {
                                let maxAchieve = -1;
                                let candidates = [];
                                for (const rel of relatives) {
                                    const achieve = rel.achievementTotal || 0;
                                    if (achieve > maxAchieve) {
                                        maxAchieve = achieve;
                                        candidates = [rel];
                                    } else if (achieve === maxAchieve) {
                                        candidates.push(rel);
                                    }
                                }
                                if (candidates.length > 0) {
                                    const targetBusho = candidates[Math.floor(Math.random() * candidates.length)];
                                    nextClanId = targetBusho.clan;
                                }
                            }
                        }
                    }
                    
                    // 行き先の決定
                    if (nextClanId > 0) {
                        // ★ここから書き足し：大名家の「姫の名簿」も書き換えます！
                        // 1. 今までいた大名家（亡くなった夫の家）の名簿から名前を消します
                        if (busho.clan !== 0) {
                            const oldClan = this.game.clans.find(c => c.id === busho.clan);
                            if (oldClan && oldClan.princessIds) {
                                oldClan.princessIds = oldClan.princessIds.filter(id => id !== princess.id);
                            }
                        }
                        
                        // 2. 新しく帰る大名家の名簿に名前を書き足します
                        const newClan = this.game.clans.find(c => c.id === nextClanId);
                        if (newClan) {
                            if (!newClan.princessIds) newClan.princessIds = [];
                            if (!newClan.princessIds.includes(princess.id)) {
                                newClan.princessIds.push(princess.id);
                            }
                        }
                        
                        princess.currentClanId = nextClanId;
                        princess.status = 'unmarried'; // 再び未婚に戻ります
                    } else {
                        // 戻る場所がどこにもない場合は、もう登場させない
                        princess.status = 'dead';
                        
                        // ★ここから書き足し：いなくなってしまうので、今までいた大名家の名簿から名前を消します
                        if (busho.clan !== 0) {
                            const oldClan = this.game.clans.find(c => c.id === busho.clan);
                            if (oldClan && oldClan.princessIds) {
                                oldClan.princessIds = oldClan.princessIds.filter(id => id !== princess.id);
                            }
                        }
                    }
                    
                    // ★追加：夫が死亡したので、夫の一門から外れるようリストを更新します
                    princess.updateFamilyIds(this.game.bushos);
                }
            }
            busho.wifeIds = []; // リストを空にします
        }
        
        // ★ここを追加：官位を持っていたら朝廷に返す魔法！
        if (busho.courtRankIds && busho.courtRankIds.length > 0) {
            let wasShogun = false;
            // ★追加：もし征夷大将軍（ID1）を持っていたら、後継ぎのためにメモを残しておきます！
            if (busho.courtRankIds.includes(1)) {
                busho._wasShogun = true;
                wasShogun = true;
            }
            busho.courtRankIds.forEach(rankId => {
                this.game.courtRankSystem.returnRank(rankId);
            });
            busho.courtRankIds = []; // 自分の持ち物リストは空っぽにします

            // 武将が死亡した時点で、将軍なら生き残っている一門に「左馬頭（ID80）」を託します！
            if (wasShogun) {
                const relative = this.game.bushos.find(b => 
                    b.status !== 'dead' && 
                    b.status !== 'unborn' && 
                    b.id !== busho.id && 
                    busho.familyIds.some(fId => b.familyIds.includes(fId))
                );
                
                if (relative) {
                    if (this.game.courtRankSystem) {
                        this.game.courtRankSystem.grantRank(relative, 80);
                    } else {
                        if (!relative.courtRankIds) relative.courtRankIds = [];
                        if (!relative.courtRankIds.includes(80)) relative.courtRankIds.push(80);
                    }
                }
            }
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
            // ★追加：大名が死亡した時、勢力の朝廷貢献度を5分の1に減らします
            const clan = this.game.clans.find(c => c.id === busho.clan);
            if (clan) {
                clan.courtContribution = Math.floor((clan.courtContribution || 0) / 5);
            }

            await this.handleDaimyoDeath(busho);
        }

        // ★もし国主だったら、後任を決めます
        if (busho.isCommander) {
            await this.handleCommanderDeath(busho);
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

        // 1. 今活躍している家臣たちを集めます！
        const activeBushos = this.game.bushos.filter(b => b.clan === daimyo.clan && b.id !== daimyo.id && b.status === 'active' && !b.isDaimyo);
        
        // その中で「一門」の武将だけを抽出します！
        const activeFamily = activeBushos.filter(b => daimyo.familyIds.some(fId => b.familyIds.includes(fId)));

        // まだ登場していない一門（※コマンドからの家督相続に合わせ、出生前の武将は除外します！）
        const unbornFamily = this.game.bushos.filter(b => b.status === 'unborn' && !b.isNotBorn && daimyo.familyIds.some(fId => b.familyIds.includes(fId)) && b.birthYear <= currentYear);
        
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

        // まずは一門だけで候補リストを作ります
        let allCandidates = [...activeFamily, ...unbornFamily, ...externalFamily];

        // もし一門の候補が誰もいなければ、特例として「今活躍している家臣全員」を候補にします！
        if (allCandidates.length === 0) {
            allCandidates = [...activeBushos];
        }

        if (allCandidates.length > 0) {
            let successor = null;

            // ★ここから変更：プレイヤーの家なら自分で選ぶ魔法を復活させます！
            // 念のため、文字と数字の違いで誤判定（勝手にAIが決めてしまうバグ）が起きないように Number() で包んで比較します
            if (Number(daimyo.clan) === Number(this.game.playerClanId)) {
                // プレイヤーが選ぶまで「待つ」魔法です
                await new Promise(resolve => {
                    this.game.ui.info.openBushoSelector('succession', null, {
                        customBushos: allCandidates,
                        customTitle: "後継者を選択",
                        hideCancel: true, // 逃げられないように戻るボタンを消します
                        onConfirm: (selectedIds) => {
                            // 選ばれたリストの1番目の人（[0]）を後継ぎにします
                            successor = this.game.getBusho(selectedIds[0]);
                            resolve();
                        }
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

            // ★修正：改名前の「元の名前」をメモしておきます！
            const originalName = successor.name.replace('|', '');

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
                        successor.familyName = newNameParts[0] === "0" ? successor.familyName : (newNameParts[0] || "");
                        successor.givenName = newNameParts[1] === "0" ? successor.givenName : (newNameParts[1] || "");
                        successor.name = successor.familyName + successor.givenName;

                        const newYomiParts = parts[2].trim().split('|');
                        successor.familyYomi = newYomiParts[0] === "0" ? successor.familyYomi : (newYomiParts[0] || "");
                        successor.givenYomi = newYomiParts[1] === "0" ? successor.givenYomi : (newYomiParts[1] || "");
                        successor.yomi = successor.familyYomi + successor.givenYomi;

                        const newNameStr = successor.name.replace('|', '');
                        messages.push(`家督を継ぐにあたり、${oldNameStr}は\n「${newNameStr}」と名を改めました。`);
                    }
                }
            }

            // ★大名になった瞬間に「daimyo:」の顔変更データがあれば顔を変える魔法！
            if (successor.faceChange && successor.faceChange.startsWith('daimyo:')) {
                const newFace = successor.faceChange.split(':')[1].trim();
                if (newFace) {
                    successor.faceIcon = newFace;
                }
            }

            // ★追加：新大名がもし国主だった場合、その軍団を解散させます
            if (successor.isCommander && this.game.castleManager) {
                const oldLegion = this.game.legions ? this.game.legions.find(l => l.commanderId === successor.id) : null;
                if (oldLegion) {
                    this.game.castleManager.disbandLegion(oldLegion.id);
                }
            }

            this.game.changeLeader(daimyo.clan, successor.id);
            
            // ==========================================
            // ★大名交代の共通の魔法を呼び出します！
            const clan = this.game.clans.find(c => c.id === daimyo.clan);
            const originalClanName = clan ? clan.name : ""; // ★元の家名をメモしておきます
            this.applyDaimyoChangeEffects(daimyo, successor, messages);
            // ==========================================
            
            // ★メモしておいた家名を使って「〇〇家の」という言葉を作ります
            const clanPrefix = originalClanName ? `${originalClanName}の` : "";
            
            let mainMsg = "";
            if (isExternalSuccessor) {
                mainMsg = `${clanPrefix}${daimyo.name.replace('|','')}が死亡しました。`;
                this.game.ui.log(`【当主交代】${mainMsg}`);
            } else {
                // ★修正：改名する前の「元の名前」を使います！
                mainMsg = `${clanPrefix}${daimyo.name.replace('|','')}が死亡し、${originalName}が家督を継ぎました。`;
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
    
    // ★国主が亡くなった時の後任選びです
    async handleCommanderDeath(commander) {
        const legion = this.game.legions ? this.game.legions.find(l => l.commanderId === commander.id) : null;
        if (!legion) {
            commander.isCommander = false;
            return; 
        }

        const messages = []; 
        const currentYear = this.game.year;
        
        // 1. 今活躍している家臣たちを集めます！（大名と国主は弾きます）
        const activeBushos = this.game.bushos.filter(b => b.clan === commander.clan && b.id !== commander.id && b.status === 'active' && !b.isDaimyo && !b.isCommander);
        
        // その中で国主の「一門」の武将だけを抽出します！
        const activeFamily = activeBushos.filter(b => commander.familyIds.some(fId => b.familyIds.includes(fId)));

        // まだ登場していない一門
        const unbornFamily = this.game.bushos.filter(b => b.status === 'unborn' && !b.isNotBorn && commander.familyIds.some(fId => b.familyIds.includes(fId)) && b.birthYear <= currentYear);
        
        // 浪人や諸勢力に所属している一門武将も探します！
        const externalFamily = this.game.bushos.filter(b => {
            if (b.id === commander.id || b.isDaimyo || b.isCommander) return false;
            if (!commander.familyIds.some(fId => b.familyIds.includes(fId))) return false;
            if (b.status === 'ronin') return true;
            if ((b.belongKunishuId || 0) > 0 && b.clan === 0) {
                const kunishu = this.game.kunishuSystem ? this.game.kunishuSystem.getKunishu(b.belongKunishuId) : null;
                if (kunishu && kunishu.leaderId === b.id) return false; 
                return true;
            }
            return false;
        });

        // まずは一門だけで候補リストを作ります
        let allCandidates = [...activeFamily, ...unbornFamily, ...externalFamily];

        // もし一門の候補が誰もいなければ、特例として「同じ軍団で活躍している家臣」を候補にします！
        if (allCandidates.length === 0) {
            allCandidates = activeBushos.filter(b => b.legionId === legion.id);
        }

        if (allCandidates.length > 0) {
            let successor = null;

            if (Number(commander.clan) === Number(this.game.playerClanId)) {
                // プレイヤーの勢力なら、自分で選ぶ画面を出します
                await new Promise(resolve => {
                    this.game.ui.info.openBushoSelector('succession_commander', null, {
                        customBushos: allCandidates,
                        customTitle: "後任の国主を選択",
                        hideCancel: true, 
                        onConfirm: (selectedIds) => {
                            successor = this.game.getBusho(selectedIds[0]);
                            resolve();
                        }
                    });
                });
            } else {
                // AIの場合は自動で選びます
                allCandidates.forEach(b => {
                    b._isRelative = commander.familyIds.some(fId => b.familyIds.includes(fId));
                    b._affinityDiff = Math.abs((commander.affinity || 0) - (b.affinity || 0));
                    b._baseScore = b.leadership + b.intelligence;
                });

                allCandidates.sort((a, b) => {
                    if (a._isRelative && !b._isRelative) return -1;
                    if (!a._isRelative && b._isRelative) return 1;
                    if (a._isRelative && b._isRelative) {
                        if (a._affinityDiff !== b._affinityDiff) return a._affinityDiff - b._affinityDiff;
                    }
                    return b._baseScore - a._baseScore;
                });

                successor = allCandidates[0];
            }

            const originalName = successor.name.replace('|', '');
            let isExternalSuccessor = false;

            if (successor.status === 'unborn' || successor.status === 'ronin' || (successor.belongKunishuId || 0) > 0) {
                isExternalSuccessor = true;
                const legionCastles = this.game.castles.filter(c => c.ownerClan === commander.clan && c.legionId === legion.legionNo);
                const baseCastle = legionCastles.length > 0 ? legionCastles[0] : null;

                if (baseCastle) {
                    if ((successor.belongKunishuId || 0) > 0) {
                        const kunishu = this.game.kunishuSystem ? this.game.kunishuSystem.getKunishu(successor.belongKunishuId) : null;
                        const kunishuName = kunishu ? kunishu.getName(this.game) : "諸勢力";
                        successor.belongKunishuId = 0;
                        messages.push(`${kunishuName}より${successor.name.replace('|','')}が\n跡継ぎとして迎え入れられました。`);
                    } else if (successor.status === 'ronin') {
                        messages.push(`${successor.name.replace('|','')}が跡を継ぎました。`);
                    } else {
                        messages.push(`${successor.name.replace('|','')}が急遽元服し、跡を継ぎました。`);
                    }

                    if (successor.status === 'ronin' || successor.status === 'active') {
                        this.game.affiliationSystem.leaveCastle(successor);
                    }

                    successor.status = 'active';
                    successor.clan = commander.clan;
                    successor.castleId = baseCastle.id;
                    successor.loyalty = 100;
                    if (!baseCastle.samuraiIds.includes(successor.id)) baseCastle.samuraiIds.push(successor.id);
                }
            }

            // 国主の役職を引き継ぎます
            commander.isCommander = false;
            successor.isCommander = true;
            legion.commanderId = successor.id;
            
            // 国主になったら城主にします
            successor.isCastellan = true;
            const targetCastle = this.game.getCastle(successor.castleId);
            if (targetCastle) {
                const castleBushos = this.game.getCastleBushos(targetCastle.id);
                castleBushos.forEach(b => {
                    if (b.id !== successor.id && b.isCastellan) {
                        b.isCastellan = false;
                    }
                });
                targetCastle.castellanId = successor.id;
            }

            const clan = this.game.clans.find(c => c.id === commander.clan);
            const clanPrefix = clan ? `${clan.name}の` : "";
            
            let mainMsg = "";
            if (isExternalSuccessor) {
                mainMsg = `${clanPrefix}国主・${commander.name.replace('|','')}が死亡しました。`;
            } else {
                mainMsg = `${clanPrefix}国主・${commander.name.replace('|','')}が死亡し、${originalName}が新たな国主となりました。`;
            }
            this.game.ui.log(`【国主交代】${mainMsg}`);
            messages.unshift(mainMsg);

            for (const msg of messages) {
                await this.game.ui.showDialogAsync(msg, false, 0);
            }

        } else {
            commander.isCommander = false;
            if (this.game.castleManager) {
                this.game.castleManager.disbandLegion(legion.id);
            }
            
            const clan = this.game.clans.find(c => c.id === commander.clan);
            const clanPrefix = clan ? `${clan.name}の` : "";
            
            const msg = `${clanPrefix}国主・${commander.name.replace('|','')}が死亡しました。\n後任となる武将がいないため、軍団は解散されました。`;
            this.game.ui.log(msg);
            await this.game.ui.showDialogAsync(msg, false, 0);
        }
    }

    // ==========================================
    // ★ここから追加：大名が交代した時に起こる変化をまとめた「共通の魔法」です！
    // ==========================================
    // ★変更：4つ目の枠に「isSuccession（生前退位かどうか）」の目印を受け取れるようにしました
    applyDaimyoChangeEffects(oldDaimyo, successor, messages, isSuccession = false) {
        // ★当主交代があったら、今まで進めていた作戦（攻撃準備など）を一旦キャンセルして白紙に戻します！
        if (this.game.aiOperationManager && this.game.aiOperationManager.operations[oldDaimyo.clan]) {
            delete this.game.aiOperationManager.operations[oldDaimyo.clan];
        }
        
        // ★新旧大名の能力比較と、忠誠・民忠への影響！
        const oldTotal = oldDaimyo.leadership + oldDaimyo.strength + (oldDaimyo.politics || 0) + (oldDaimyo.diplomacy || 0) + oldDaimyo.intelligence + oldDaimyo.charm;
        const newTotal = successor.leadership + successor.strength + (successor.politics || 0) + (successor.diplomacy || 0) + successor.intelligence + successor.charm;
        const diff = newTotal - oldTotal;
        let changeVal = 0;
        if (Math.abs(diff) >= 101) {
            const overDiff = diff > 0 ? diff - 100 : diff + 100;
            changeVal = Math.floor(overDiff * 0.2);
        }
        changeVal = Math.max(-30, Math.min(30, changeVal));

        // ★追加：生前退位（家督相続コマンド）の場合は、能力差によるショックの揺れを半分にします！
        if (isSuccession) {
            changeVal = Math.floor(changeVal / 2);
        }

        if (changeVal !== 0) {
            const retainers = this.game.bushos.filter(b => b.clan === oldDaimyo.clan && b.id !== successor.id && b.status === 'active');
            retainers.forEach(b => {
                b.loyalty = Math.max(0, Math.min(100, b.loyalty + changeVal));
            });
            
            const clanCastlesInfo = this.game.castles.filter(c => c.ownerClan === oldDaimyo.clan);
            clanCastlesInfo.forEach(c => {
                c.peoplesLoyalty = Math.max(0, Math.min(100, (c.peoplesLoyalty || 50) + changeVal));
                if (changeVal < 0) {
                    const decreasePercent = Math.abs(changeVal);
                    c.soldiers = Math.floor(c.soldiers * ((100 - decreasePercent) / 100));
                    c.population = Math.floor(c.population * ((100 - (decreasePercent / 2)) / 100));
                }
            });

            if (oldDaimyo.clan === this.game.playerClanId) {
                if (changeVal > 0) {
                    messages.push(`新当主への期待から、家臣団の気勢が高まっています！`);
                } else {
                    messages.push(`当主交代による不安から、家臣団が動揺しています……`);
                }
            }
        }
        
        // ★当主交代による外交関係の変動！
        this.game.clans.forEach(otherClan => {
            if (otherClan.id === 0 || otherClan.id === oldDaimyo.clan) return;
            const rel = this.game.diplomacyManager.getRelation(oldDaimyo.clan, otherClan.id);
            if (!rel) return;

            let changeAmount = 0;
            if (rel.status === '普通' || rel.status === '友好') {
                if (rel.sentiment >= 51 && rel.sentiment <= 54) {
                    changeAmount = 50 - rel.sentiment; 
                    if (isSuccession) changeAmount = Math.floor(changeAmount / 2); // ★生前退位なら半減
                } else if (rel.sentiment >= 55) {
                    changeAmount = isSuccession ? -2 : -5; // ★生前退位なら半減
                }
            } else if (rel.status === '同盟' || rel.status === '従属' || rel.status === '支配') {
                const baseDrop = isSuccession ? -5 : -10; // ★生前退位なら基本の低下分も半減（-10を-5に）
                changeAmount = baseDrop + changeVal;
            }

            if (changeAmount !== 0) {
                this.game.diplomacyManager.updateSentiment(oldDaimyo.clan, otherClan.id, changeAmount);
            }
        });

        // ★当主交代による諸勢力との友好度の変動！
        if (this.game.kunishuSystem) {
            const aliveKunishus = this.game.kunishuSystem.getAliveKunishus();
            aliveKunishus.forEach(kunishu => {
                const currentRel = kunishu.getRelation(oldDaimyo.clan);
                let changeAmount = 0;
                if (currentRel >= 51 && currentRel <= 54) {
                    changeAmount = 50 - currentRel; 
                    if (isSuccession) changeAmount = Math.floor(changeAmount / 2); // ★生前退位なら半減
                } else if (currentRel >= 55) {
                    changeAmount = isSuccession ? -2 : -5; // ★生前退位なら半減
                }
                if (changeAmount !== 0) {
                    kunishu.setRelation(oldDaimyo.clan, currentRel + changeAmount);
                }
            });
        }

        // ★当主交代に合わせて大名家の名前を変更し、マップを更新します！
        const clan = this.game.clans.find(c => c.id === oldDaimyo.clan);
        if (clan) {
            const oldClanName = clan.name;
            const safeFamilyName = successor.familyName || successor.name;
            const newBaseName = `${safeFamilyName}家`;
            const safeFamilyYomi = successor.familyYomi || successor.yomi;
            const newClanYomi = safeFamilyYomi ? `${safeFamilyYomi}け` : "";
            
            // ★修正：今の家名（例：若狭武田家）ではなく、本来の家名（baseName：武田家）と比べるようにします！
            // そうしないと、同じ武田家が跡を継いだ時に「若狭武田家は武田家になります」と出てしまいます。
            if (clan.baseName !== newBaseName) {
                clan.baseName = newBaseName; // ★本来の家名も更新しておきます
                clan.name = newBaseName;
                clan.yomi = newClanYomi; 
                messages.push(`当主の交代により、${oldClanName}は今後「${newBaseName}」となります。`);
            }
        }
        
        if (this.game.ui && typeof this.game.ui.renderMap === 'function') {
            this.game.ui.renderMap();
        }
    }

    // ==========================================
    // ★ここから追加：コマンドから「生前退位（家督相続）」を実行する魔法です！
    // ==========================================
    async executeSuccessionCommand(newDaimyoId) {
        const successor = this.game.getBusho(newDaimyoId);
        const clan = this.game.clans.find(c => c.id === this.game.playerClanId);
        const oldDaimyo = this.game.getBusho(clan.leaderId);

        if (!oldDaimyo || !successor) return;

        // ★追加：改名する前に、いまの「元の名前」をメモしておきます！
        const originalName = successor.name.replace('|', '');

        const messages = []; // 順番に出すメッセージを溜めておくリスト

        // ★今回追加：功績の譲渡処理
        const meritTransfer = Math.floor((oldDaimyo.achievementTotal || 0) / 3);
        successor.achievementTotal = (successor.achievementTotal || 0) + meritTransfer;
        oldDaimyo.achievementTotal = (oldDaimyo.achievementTotal || 0) - meritTransfer;

        // ① 先代大名の役職を外します
        oldDaimyo.isDaimyo = false;

        // ★追加：新大名がもし国主だった場合、その軍団を解散させます
        if (successor.isCommander && this.game.castleManager) {
            const oldLegion = this.game.legions ? this.game.legions.find(l => l.commanderId === successor.id) : null;
            if (oldLegion) {
                this.game.castleManager.disbandLegion(oldLegion.id);
            }
        }

        // ★修正：コマンドの時は「急遽元服し～」の文章は出さないように、messages.push を削除しました！
        if (successor.status === 'unborn') {
            successor.status = 'active'; 
            successor.clan = oldDaimyo.clan; 
            successor.castleId = oldDaimyo.castleId; 
            successor.loyalty = 100; 
            
            const castle = this.game.getCastle(successor.castleId);
            if (castle && !castle.samuraiIds.includes(successor.id)) {
                castle.samuraiIds.push(successor.id);
            }
        }

        // ② 新しい大名を任命します
        successor.isDaimyo = true;
        successor.isCastellan = true;
        if (successor.isGunshi) {
            successor.isGunshi = false;
        }

        // ③ 新大名のお城の城主を新大名にします
        const targetCastle = this.game.getCastle(successor.castleId);
        if (targetCastle) {
            const castleBushos = this.game.getCastleBushos(targetCastle.id);
            castleBushos.forEach(b => {
                if (b.id !== successor.id && b.isCastellan) {
                    b.isCastellan = false;
                }
            });
            targetCastle.castellanId = successor.id;
        }

        // ★大名になった瞬間に「daimyo:」の改名データがあれば改名する魔法！
        if (successor.nameChange && successor.nameChange.includes('daimyo:')) {
            const changes = successor.nameChange.split('/');
            for (const change of changes) {
                const parts = change.split(':');
                if (parts.length === 3 && parts[0].trim() === 'daimyo') {
                    const oldNameStr = successor.name.replace('|', '');
                    const newNameParts = parts[1].trim().split('|');
                    successor.familyName = newNameParts[0] === "0" ? successor.familyName : (newNameParts[0] || "");
                    successor.givenName = newNameParts[1] === "0" ? successor.givenName : (newNameParts[1] || "");
                    successor.name = successor.familyName + successor.givenName;
                    const newYomiParts = parts[2].trim().split('|');
                    successor.familyYomi = newYomiParts[0] === "0" ? successor.familyYomi : (newYomiParts[0] || "");
                    successor.givenYomi = newYomiParts[1] === "0" ? successor.givenYomi : (newYomiParts[1] || "");
                    successor.yomi = successor.familyYomi + successor.givenYomi;
                    const newNameStr = successor.name.replace('|', '');
                    messages.push(`家督を継ぐにあたり、${oldNameStr}は\n「${newNameStr}」と名を改めました。`);
                }
            }
        }

        // 大名になった瞬間に「daimyo:」の顔変更データがあれば顔を変える魔法！
        if (successor.faceChange && successor.faceChange.startsWith('daimyo:')) {
            const newFace = successor.faceChange.split(':')[1].trim();
            if (newFace) {
                successor.faceIcon = newFace;
            }
        }

        // ★先代が征夷大将軍（ID1）を持っていれば、後継ぎに「左馬頭（ID80）」を与える魔法！
        if (oldDaimyo.courtRankIds && oldDaimyo.courtRankIds.includes(1)) {
            const isRelative = oldDaimyo.familyIds.some(fId => successor.familyIds.includes(fId));
            if (isRelative) {
                this.game.courtRankSystem.grantRank(successor, 80);
            }
        }

        this.game.changeLeader(clan.id, successor.id);
        successor.isActionDone = true;

        if (oldDaimyo.castleId) {
            const oldCastle = this.game.getCastle(oldDaimyo.castleId);
            if (oldCastle && this.game.affiliationSystem) {
                this.game.affiliationSystem.updateCastleLord(oldCastle);
            }
        }

        // ==========================================
        // ★大名交代の共通の魔法を呼び出します！
        this.applyDaimyoChangeEffects(oldDaimyo, successor, messages, true);
        // ==========================================

        // ★修正：改名する前の「元の名前」を使ってメッセージを作ります！
        const mainMsg = `${originalName} が家督を継ぎ、新たな大名となりました！`;
        this.game.ui.log(`【家督相続】${mainMsg}`);
        messages.unshift(mainMsg);

        // 順番にダイアログを出します
        for (const msg of messages) {
            await this.game.ui.showDialogAsync(msg, false, 0);
        }

        this.game.ui.updatePanelHeader();
        this.game.ui.renderCommandMenu();
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
            
            // ★追加：滅ぼした勢力を探します
            let killerClanId = 0;
            if (reason === 'no_castle') {
                // 最後に攻撃されて奪われたお城の記録から、滅ぼした勢力を探します
                const lastLostCastle = this.game.castles.find(c => c.lastAttackedOwnerId === clan.id && c.ownerClan !== clan.id);
                if (lastLostCastle) {
                    killerClanId = lastLostCastle.ownerClan; // 今の持ち主（攻め滅ぼした大名家）
                    
                    // 万が一いまの持ち主が諸勢力や空き城（中立）だった場合のための保険
                    if (killerClanId === 0 && lastLostCastle.lastAttackerClanId > 0 && !lastLostCastle.lastAttackerIsKunishu) {
                        killerClanId = lastLostCastle.lastAttackerClanId;
                    }
                }
            }

            const leader = this.game.getBusho(clan.leaderId);
            if (leader && leader.status !== 'dead' && leader.isDaimyo && leader.courtRankIds && leader.courtRankIds.includes(1) && clanCastles.length === 0) {
                // ★追加：将軍の勢力が滅亡したことをイベントシステムに伝えます！
                if (this.game.eventManager) {
                    await this.game.eventManager.processEvents('shogun_death', {
                        deadShogunClanId: clan.id,
                        killerClanId: killerClanId
                    });
                }
            }
            
            // ★ここから追加：未婚の姫を、攻め滅ぼした大名家が総取りする魔法
            if (killerClanId > 0 && killerClanId !== clan.id) {
                const killerClan = this.game.clans.find(c => c.id === killerClanId);
                if (killerClan) {
                    // その家にいる未婚の姫を全員集めます
                    const targetPrincesses = this.game.princesses.filter(p => p.currentClanId === clan.id && p.status === 'unmarried');
                    for (const p of targetPrincesses) {
                        p.originalClanId = killerClanId; // 実家も書き換えます
                        p.currentClanId = killerClanId;  // 現在の所属も書き換えます
                        
                        // 滅亡した家のリストから外します
                        if (clan.princessIds) {
                            clan.princessIds = clan.princessIds.filter(id => id !== p.id);
                        }
                        
                        // 攻め滅ぼした家のリストに加えます
                        if (!killerClan.princessIds) {
                            killerClan.princessIds = [];
                        }
                        if (!killerClan.princessIds.includes(p.id)) {
                            killerClan.princessIds.push(p.id);
                        }
                    }
                }
            }
            // ★追加ここまで

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
    
    // ==========================================
    // ★ここから追加：架空姫システム用の機能です！
    // ==========================================

    // ① ランダムな姫のプロフィール（データ）を作る機能です
    createRandomPrincess(clanId, currentYear, isInitial, specificFatherId = null) {
        let randomName = "姫";
        let candidateNames = [];

        // 1. まずは名前の候補リストを準備します
        if (typeof DataManager !== 'undefined' && DataManager.genericPrincessNames && DataManager.genericPrincessNames.length > 0) {
            candidateNames = DataManager.genericPrincessNames;
        } else {
            // もしCSVが読み込めなかった場合の予備のリストです
            candidateNames = ["雪", "桜", "琴", "菊", "桔梗", "百合", "藤", "萩", "蘭", "梅", "楓", "桂", "椿", "凛", "華", "千代", "鶴", "亀", "松", "竹"];
        }

        // 2. それぞれの名前が「今ゲームの中で何回使われているか」を記録するメモ帳を作ります
        const nameCounts = {};
        candidateNames.forEach(name => nameCounts[name] = 0); // 最初は全部0回にします

        // 3. ゲーム内にいる全ての姫を調べて、同じ名前があったらメモ帳の回数を1ずつ増やします
        this.game.princesses.forEach(p => {
            if (nameCounts[p.name] !== undefined) {
                nameCounts[p.name]++;
            }
        });

        // 4. メモ帳の中から、「一番使われている回数が少ない数」を探し出します
        let minCount = Infinity; // 最初はわざと無限大の大きさにしておきます
        for (const name of candidateNames) {
            if (nameCounts[name] < minCount) {
                minCount = nameCounts[name];
            }
        }

        // 5. その「一番少ない回数」と同じ回数の名前だけを集めて、新しいグループを作ります
        const leastUsedNames = candidateNames.filter(name => nameCounts[name] === minCount);

        // 6. 最後に、その一番少ないグループの中からランダムで1つ選びます！
        randomName = leastUsedNames[Math.floor(Math.random() * leastUsedNames.length)];
        
        // 既存の姫と出席番号が被らないように、90000番台から自動で番号を割り振ります
        let nextId = 90000; 
        if (this.game.princesses.length > 0) {
            const maxId = Math.max(...this.game.princesses.map(p => p.id));
            if (maxId >= 90000) {
                nextId = maxId + 1;
            }
        }

        // ★変更：お父さんを探してメモします（一門武将も選べるようにしました）
        const clan = this.game.clans.find(c => c.id === clanId);
        if (!clan) return null;
        
        let father = null;
        if (specificFatherId) {
            father = this.game.getBusho(specificFatherId);
        } else {
            father = this.game.getBusho(clan.leaderId);
        }
        const fatherId = father ? father.id : 0;

        // ★追加：お父さんの年齢をチェックして、15歳以上離れるようにします！
        let age = 0;
        if (father) {
            const fatherAge = currentYear - father.birthYear;
            
            // お父さんが14歳以下の場合は、15歳以上離れた子供は作れないので誕生をキャンセルします
            if (fatherAge < 15) {
                return null;
            }
            
            if (isInitial) {
                // 初期登場時は0〜15歳の中から選びますが、お父さんとの年齢差が最低15歳になるように年齢の上限を制限します
                const maxAge = Math.min(15, fatherAge - 15);
                age = Math.floor(Math.random() * (maxAge + 1));
            }
        } else {
            // 万が一お父さんのデータが見つからない場合の予備の計算です
            age = isInitial ? Math.floor(Math.random() * 16) : 0;
        }

        // 年齢の設定です
        const birthYear = currentYear - age;
        const startYear = birthYear; // 誕生と同時に登場（ゲームにアクセス可能）になります！
        
        // 寿命の設定です
        // 50歳前後を基準（平均）としつつ、たまに80歳まで長生きし、低確率で早死する魔法です
        let lifespan = 50;
        const lifeRand = Math.random();
        if (lifeRand < 0.10) {
            // 10%の確率で20〜39歳の早死に
            lifespan = 20 + Math.floor(Math.random() * 20);
        } else if (lifeRand < 0.80) {
            // 70%の確率で40〜59歳（ここが一番多い基準の層になります）
            lifespan = 40 + Math.floor(Math.random() * 20);
        } else {
            // 20%の確率で60〜80歳の長生き
            lifespan = 60 + Math.floor(Math.random() * 21);
        }
        const endYear = startYear + lifespan;

        // 上で作った情報をひとつの箱（データ）にまとめます
        const princessData = {
            id: nextId,
            name: randomName,
            yomi: "",
            birthYear: birthYear,
            startYear: startYear,
            endYear: endYear,
            faceIcon: 'unknown_princess_face.webp', // 汎用の姫画像
            originalClanId: clanId,
            currentClanId: clanId,
            fatherId: fatherId,
            husbandId: 0,
            status: 'unmarried' // 最初から「未婚（結婚可能）」として登場させます
        };
        
        // 完成したデータを正式な「姫クラス」にして、ゲーム本体の名簿に登録します
        const princess = new Princess(princessData);
        
        // ★追加：父親の一門を引き継ぐためリストを更新します
        princess.updateFamilyIds(this.game.bushos);
        
        this.game.princesses.push(princess);

        // ★ここを書き足し！：大名家の「所有している姫リスト」にしっかり登録します！
        if (!clan.princessIds) {
            clan.princessIds = [];
        }
        // 出席番号をリストに追加して、システムに「この家の姫ですよ」と教えます
        if (!clan.princessIds.includes(princess.id)) {
            clan.princessIds.push(princess.id);
        }

        return princess;
    }

    // ② ゲーム開始時に、各家に姫を分配する機能です
    distributeInitialPrincesses() {
        const currentYear = this.game.year;
        
        // ★例外リスト：ランダムな姫が絶対に誕生しない武将のID（出席番号）です
        // 1001001=上杉謙信、1053024=立花誾千代
        // （追加する時は、カンマ区切りで数字を足していくだけでOKです！）
        const excludedIds = [1001001, 1053024];
        
        this.game.clans.forEach(clan => {
            if (clan.id === 0) return; // 空き家（中立）は無視します

            // すでにCSVで設定された「史実の姫」がいるか数えます
            const existingPrincesses = this.game.princesses.filter(p => p.currentClanId === clan.id && p.status === 'unmarried');
            
            // 史実の姫が誰もいない大名家にだけ、ランダムな姫を登場させます
            if (existingPrincesses.length === 0) {
                // ★大名の姫の登場判定（50%の確率）
                if (!excludedIds.includes(Number(clan.leaderId))) {
                    if (Math.random() < 0.5) {
                        this.createRandomPrincess(clan.id, currentYear, true, clan.leaderId);
                    }
                }

                // ★追加：一門武将の姫の登場判定（大名とは別枠で、半分の25%の確率）
                const leader = this.game.getBusho(clan.leaderId);
                if (leader) {
                    const familyBushos = this.game.bushos.filter(b => 
                        b.clan === clan.id && 
                        b.status === 'active' && 
                        b.id !== leader.id && 
                        !excludedIds.includes(b.id) &&
                        leader.familyIds.some(fId => b.familyIds.includes(fId))
                    );

                    if (familyBushos.length > 0) {
                        if (Math.random() < 0.25) {
                            const randomFather = familyBushos[Math.floor(Math.random() * familyBushos.length)];
                            this.createRandomPrincess(clan.id, currentYear, true, randomFather.id);
                        }
                    }
                }
            }
        });
    }

    // ③ 毎年1月にランダムで新しい姫を登場させる機能です
    async checkRandomPrincessAppearance() {
        const currentYear = this.game.year;
        
        // ★例外リスト：ランダムな姫が絶対に誕生しない武将のID（出席番号）です
        // （上と同じリストです。後で追加する時はこちらも一緒に足してください）
        const excludedIds = [1001001, 1053024];

        for (const clan of this.game.clans) {
            if (clan.id === 0) continue;

            // 今その家にいる未婚の姫を数えます
            const currentPrincesses = this.game.princesses.filter(p => p.currentClanId === clan.id && p.status === 'unmarried');
            
            // 姫が少ない家ほど、新しい姫が生まれやすくします
            // （姫0人：20%、姫1人：10%、姫2人以上：5% の確率）
            let prob = 0.05;
            if (currentPrincesses.length === 0) prob = 0.20;
            else if (currentPrincesses.length === 1) prob = 0.10;

            // ★変更：大名の姫の誕生判定
            if (!excludedIds.includes(Number(clan.leaderId))) {
                if (Math.random() < prob) {
                    const newPrincess = this.createRandomPrincess(clan.id, currentYear, false, clan.leaderId);
                    
                    // プレイヤーの大名家だった場合は、画面にお知らせのメッセージを出します
                    if (newPrincess && clan.id === this.game.playerClanId) {
                        const father = this.game.getBusho(newPrincess.fatherId);
                        const fatherName = father ? father.name.replace('|', '') : "当家";
                        const msg = `${fatherName}の息女、${newPrincess.name}が誕生しました！`;
                        
                        this.game.ui.log(msg);
                        await this.game.ui.showDialogAsync(msg, false, 0); 
                    }
                }
            }

            // ★追加：一門武将の姫の誕生判定（大名の姫とは別枠で、確率を半分にして判定します）
            const leader = this.game.getBusho(clan.leaderId);
            if (leader) {
                // 生きている同じ家の一門武将（大名本人と例外リストを除く）を探します
                const familyBushos = this.game.bushos.filter(b => 
                    b.clan === clan.id && 
                    b.status === 'active' && 
                    b.id !== leader.id && 
                    !excludedIds.includes(b.id) &&
                    leader.familyIds.some(fId => b.familyIds.includes(fId))
                );

                if (familyBushos.length > 0) {
                    const familyProb = prob / 2; // 確率は半枠
                    if (Math.random() < familyProb) {
                        // 一門武将の中からランダムに一人を父親に選びます
                        const randomFather = familyBushos[Math.floor(Math.random() * familyBushos.length)];
                        const newPrincess = this.createRandomPrincess(clan.id, currentYear, false, randomFather.id);
                        
                        if (newPrincess && clan.id === this.game.playerClanId) {
                            const fatherName = randomFather.name.replace('|', '');
                            const msg = `${fatherName}のご息女、${newPrincess.name}が誕生しました！`;
                            
                            this.game.ui.log(msg);
                            await this.game.ui.showDialogAsync(msg, false, 0);
                        }
                    }
                }
            }
        }
    }
}