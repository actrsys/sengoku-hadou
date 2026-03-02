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
        }
    }

    // 毎月の終わりに「寿命を迎えて亡くなる武将がいないか」をチェックします
    async processEndMonth() {
        await this.checkDeath();
    }

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
    }

    // ★ここを書き換えました！大名が亡くなった時の後継ぎ選びです
    async handleDaimyoDeath(daimyo) {
        // 1. 生きている一門がいるかチェック
        const activeFamily = this.game.bushos.filter(b => b.clan === daimyo.clan && b.id !== daimyo.id && b.status === 'active' && !b.isDaimyo && daimyo.familyIds.some(fId => b.familyIds.includes(fId)));
        
        let extraMsg = ""; // ★追加：緊急で元服した時の追加メッセージ

        // ★追加: もし生きている一門が0人なら、未登場の一門を探して強制的に登場させる
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
                const clanCastles = this.game.castles.filter(c => c.ownerClan === daimyo.clan);
                const baseCastle = clanCastles.length > 0 ? clanCastles[0] : null;

                if (baseCastle) {
                    heir.status = 'active';
                    heir.clan = daimyo.clan;
                    heir.castleId = baseCastle.id;
                    heir.loyalty = 100;
                    if (!baseCastle.samuraiIds.includes(heir.id)) baseCastle.samuraiIds.push(heir.id);
                    // ★変更：ログを直接出さずに、メッセージ文として後でまとめて出します！
                    extraMsg = `\n ${heir.name.replace('|','')}が急遽元服しました。`;
                }
            }
        }

        // ★修正：緊急登場が終わった「後」で、同じ大名家の中から候補を探し直します！
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
            
            // ★変更：ログが2つ出ないように、1つのメッセージにまとめました！
            const msg = `【当主交代】\n${daimyo.name.replace('|','')}が病により死亡し、${successor.name.replace('|','')}が家督を継ぎました。${extraMsg}`;
            this.game.ui.log(`【当主交代】${daimyo.name.replace('|','')}が死亡し、${successor.name.replace('|','')}が家督を継ぎました。`);
            
            // ★追加：ダイアログを出して0秒（押すまで）待ちます！
            await this.game.ui.showDialogAsync(msg, false, 0);

        } else {
            // もし誰も残っていなかったら、その大名家は滅亡してしまいます
            const clan = this.game.clans.find(c => c.id === daimyo.clan);
            const clanName = clan ? clan.name : '不明';
            const displayClanName = clanName.endsWith('家') ? clanName : clanName + '家';
            const msg = `【大名家滅亡】\n${daimyo.name.replace('|','')}が死亡し、後継ぎがいないため${displayClanName}は滅亡しました。`;
            this.game.ui.log(msg);
            
            // ★ここも0秒にするだけです！
            await this.game.ui.showDialogAsync(msg, false, 0);
            
            // 持っていたお城をすべて「空き城」にします
            this.game.castles.filter(c => c.ownerClan === daimyo.clan).forEach(c => {
                c.ownerClan = 0;
                c.castellanId = 0;
                // ★追加：城の武将たちを浪人にします
                this.game.getCastleBushos(c.id).forEach(l => { 
                    if (l.status === 'unborn' || l.status === 'dead') return;
                    l.clan = 0; 
                    l.status = 'ronin'; 
                }); 
                this.game.updateCastleLord(c); // 城主情報をリセット
            });
        }
        daimyo.isDaimyo = false;
    }
}