/**
 * life_system.js
 * 武将の登場・死亡を管理するシステムです！
 * ★修正: 大名死亡時の後継者選択で、一門・相性・年齢を優先するようにしました
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
    processEndMonth() {
        this.checkDeath();
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
    checkDeath() {
        const currentYear = this.game.year;
        
        // すでに没年（endYear）を迎えている生きている武将を探します
        const targetBushos = this.game.bushos.filter(b => 
            b.status !== 'unborn' && b.status !== 'dead' && currentYear >= b.endYear
        );

        let diedPlayerBushos = [];

        targetBushos.forEach(b => {
            // プレイヤーの大名だけは絶対に死なない魔法をかけます！
            if (b.isDaimyo && b.clan === this.game.playerClanId) return;

            // 没年から何年過ぎたかを計算します
            const yearsPassed = currentYear - b.endYear;
            
            // 確率は、没年ぴったりで2%(0.02)、1年過ぎるごとに2%ずつ増えます
            const deathProb = 0.02 + (yearsPassed * 0.02);

            // サイコロを振って、確率に当たってしまったらお別れです…
            if (Math.random() < deathProb) {
                this.executeDeath(b);
                // もしプレイヤーの家臣だったら、お知らせリストに入れます
                if (b.clan === this.game.playerClanId) {
                    diedPlayerBushos.push(b);
                }
            }
        });

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
    executeDeath(busho) {
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
            this.handleDaimyoDeath(busho);
        }

        // 軍師だったら役職を外します
        if (busho.isGunshi) {
            busho.isGunshi = false;
        }
    }

    // ★ここを書き換えました！大名が亡くなった時の後継ぎ選びです
    handleDaimyoDeath(daimyo) {
        // 同じ大名家の中から、大名以外の生きている武将を探します
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
            this.game.ui.log(`${daimyo.name.replace('|','')}が死亡し、後継ぎがいないため${clan ? clan.name : '大名'}家は滅亡しました。`);
            
            // 持っていたお城をすべて「空き城」にします
            this.game.castles.filter(c => c.ownerClan === daimyo.clan).forEach(c => {
                c.ownerClan = 0;
                c.castellanId = 0;
            });
        }
        daimyo.isDaimyo = false;
    }
}