/**
 * life_system.js
 * 武将の登場・死亡を管理するシステムです！
 */

class LifeSystem {
    constructor(game) {
        this.game = game;
    }

    // 毎月の初め（1月）に「新しく登場する武将がいないか」をチェックします
    processStartMonth() {
        if (this.game.month === 1) {
            this.checkBirth();
        }
    }

    // 毎月の終わりに「寿命を迎えて亡くなる武将がいないか」をチェックします
    async processEndMonth() {
        await this.checkDeath();
    }

    // ★ 登場のチェック（毎年1月に行います）
    checkBirth() {
        const currentYear = this.game.year;
        
        // まだ登場していない（statusが'unborn'）武将の中で、登場年を迎えた人を探します
        const unbornBushos = this.game.bushos.filter(b => b.status === 'unborn' && b.startYear <= currentYear);
        
        let messages = [];

        unbornBushos.forEach(b => {
            // 登場する予定のお城を探します
            const targetCastle = this.game.getCastle(b.castleId);
            if (!targetCastle) return;

            // 元から「浪人（clanが0）」の設定なら、そのまま浪人として登場します
            if (b.clan === 0) {
                b.status = 'ronin';
            } else {
                // お城を今支配している大名家を調べます
                const ownerClanId = targetCastle.ownerClan;
                
                // お城が「空き城」になっていたら、行く当てがないので浪人になります
                if (ownerClanId === 0) {
                    b.status = 'ronin';
                    b.clan = 0;
                } else {
                    // お城の持ち主の家来として登場します！
                    b.clan = ownerClanId;
                    b.status = 'active';
                    
                    // プレイヤーの大名家にやってきた場合は、お知らせのメッセージを作ります
                    if (ownerClanId === this.game.playerClanId) {
                        // 一門（親戚）がいるかチェックします
                        const hasRelative = this.game.bushos.some(other => 
                            other.clan === this.game.playerClanId &&
                            other.status !== 'unborn' && other.status !== 'dead' && other.id !== b.id &&
                            b.familyIds.some(fId => other.familyIds.includes(fId))
                        );

                        // 名前の「|」を消して綺麗にします（例：織田|信長 → 織田信長）
                        const nameStr = b.name.replace('|', '');
                        if (hasRelative) {
                            messages.push(`${nameStr}が元服し、当家に加わりました！`);
                        } else {
                            messages.push(`${nameStr}が当家に仕官しました！`);
                        }
                    }
                }
            }
            
            // お城の中に武将を入れてあげます
            targetCastle.samuraiIds.push(b.id);
        });

        // お知らせがあれば、画面に表示します
        if (messages.length > 0) {
            const msgText = messages.join('\n');
            this.game.ui.log(msgText);
            // 少しだけ待ってからダイアログを出します
            setTimeout(() => {
                this.game.ui.showDialog(msgText, false);
            }, 500);
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
            setTimeout(() => {
                this.game.ui.showDialog(`${names}が病によりこの世を去りました…。`, false);
            }, 1000);
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
                    this.game.ui.log(`【緊急継承】${daimyo.name.replace('|','')}の血縁、まだ幼い${heir.name.replace('|','')}が元服し、家督を継ぐため立ち上がりました！`);
                }
            }
        }

        // ★修正：緊急登場が終わった「後」で、同じ大名家の中から候補を探し直します！
        const clanBushos = this.game.bushos.filter(b => b.clan === daimyo.clan && b.status === 'active' && !b.isDaimyo);
        
        if (clanBushos.length > 0) {
            // 誰を後継ぎにするか、計算して決めます
            clanBushos.forEach(b => {
                // 1. 一門（家族・親戚）かどうかをチェック！
                b._isRelative = daimyo.familyIds.some(fId => b.familyIds.includes(fId));
                // 2. 仲良し度（相性）の差を計算！差が小さいほど仲良し！
                b._affinityDiff = Math.abs((daimyo.affinity || 0) - (b.affinity || 0));
                // 3. 今までの計算式（統率と智謀）！
                b._baseScore = b.leadership + b.intelligence;
            });
            
            // 一番ふさわしい人を順番に並べ替えます
            clanBushos.sort((a, b) => {
                // まずは一門かどうかを最優先！
                if (a._isRelative && !b._isRelative) return -1;
                if (!a._isRelative && b._isRelative) return 1;
                
                // 一門同士、または一門じゃない者同士なら次へ
                if (a._isRelative && b._isRelative) {
                    // 相性の差が小さい人を優先！
                    if (a._affinityDiff !== b._affinityDiff) return a._affinityDiff - b._affinityDiff;
                    // 相性も同じなら、年齢が上の人（生まれた年が昔の人）を優先！
                    if (a.birthYear !== b.birthYear) return a.birthYear - b.birthYear;
                }
                
                // それでも同じ、または一門じゃない場合は、今までの計算式で勝負！
                return b._baseScore - a._baseScore;
            });
            
            // 一番上に来た人を後継ぎにします！
            const successor = clanBushos[0];
            
            this.game.changeLeader(daimyo.clan, successor.id);
            this.game.ui.log(`${daimyo.name.replace('|','')}が死亡し、${successor.name.replace('|','')}が家督を継ぎました。`);
        } else {
            // もし誰も残っていなかったら、その大名家は滅亡してしまいます
            const clan = this.game.clans.find(c => c.id === daimyo.clan);
            const msg = `${daimyo.name.replace('|','')}が死亡し、後継ぎがいないため${clan ? clan.name : '大名'}家は滅亡しました。`;
            this.game.ui.log(msg);
            
            await new Promise(resolve => {
                const autoClose = setTimeout(() => {
                    const modal = document.getElementById('dialog-modal');
                    const okBtn = document.getElementById('dialog-ok-btn');
                    if (modal && !modal.classList.contains('hidden') && okBtn) {
                        okBtn.click();
                    }
                }, 5000);

                this.game.ui.showDialog(msg, false, () => {
                    clearTimeout(autoClose);
                    resolve();
                });
            });
            
            // 持っていたお城をすべて「空き城」にします
            this.game.castles.filter(c => c.ownerClan === daimyo.clan).forEach(c => {
                c.ownerClan = 0;
                c.castellanId = 0;
            });
        }
        daimyo.isDaimyo = false;
    }
}