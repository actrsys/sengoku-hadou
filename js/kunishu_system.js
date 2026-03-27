/**
 * kunishu_system.js
 * 諸勢力（独立地域勢力）システムを管理するクラス
 * 修正: 諸勢力同士の抗争時、諸勢力用の友好度を参照するように修正しました
 */

class KunishuSystem {
    constructor(game) {
        this.game = game;
        this.kunishus = [];
    }

    // ゲーム開始時などにデータをセットする
    setKunishuData(kunishus) {
        this.kunishus = kunishus;
    }

    // ★ここから追加：頭領がいない諸勢力に、自動で頭領を配置する魔法です！
    generateMissingLeaders() {
        // 今いる武将の中で、一番大きいID（出席番号）を探します
        let maxId = 0;
        this.game.bushos.forEach(b => {
            if (b.id > maxId) maxId = b.id;
        });

        const currentYear = this.game.year; // 今の年（開始年）

        this.kunishus.forEach(kunishu => {
            // この諸勢力に所属している武将を探します
            const members = this.getKunishuMembers(kunishu.id);
            // リーダーがちゃんと生きているか確認します
            const leaderAlive = members.some(b => b.id === kunishu.leaderId);

            // もしリーダーがいないなら、新しい頭領を作ります！
            if (!leaderAlive) {
                maxId++; // 新しい出席番号を１つ進めます
                const newId = maxId;

                // 新しい武将（頭領）のデータを作ります
                // 「|」の左側（名字）を空っぽにして、名前を「頭領」だけにします！
                const newLeader = new Busho({
                    id: newId,
                    name: `|頭領`,
                    leadership: 30,
                    strength: 30,
                    politics: 30,
                    diplomacy: 30,
                    intelligence: 30,
                    charm: 30,
                    innovation: 0,
                    cooperation: 50,
                    ambition: 50,
                    duty: 50,
                    affinity: 50,
                    clan: 0, // 大名には所属していません
                    belongKunishuId: kunishu.id,
                    castleId: kunishu.castleId,
                    birthYear: currentYear - 30, // 今30歳になるように計算します
                    endYear: currentYear + 60,   // 今から60年後（90歳）まで生きるように計算します
                    startYear: currentYear - 30, // すでに大人になっている年にします
                    status: 'active', // バリバリ活動中！（★最後に「,」を付けます）
                    isAutoLeader: true // ★追加：自動で作られた頭領だという「秘密のシール」を貼っておきます！
                });

                // 新しく作った頭領を、ゲーム全体の武将リストに登録します！
                this.game.bushos.push(newLeader);
                
                // 諸勢力のリーダーを、この新しい頭領に設定します
                kunishu.leaderId = newId;

                // 頭領が住むお城のデータにも、「この人がお城に入ったよ」とメモしておきます
                const castle = this.game.getCastle(kunishu.castleId);
                if (castle) {
                    castle.samuraiIds.push(newId);
                }
            }
        });
    }
    // ★追加ここまで！

    getKunishu(id) {
        return this.kunishus.find(k => k.id === id);
    }

    getAliveKunishus() {
        return this.kunishus.filter(k => !k.isDestroyed);
    }

    // 指定した城にいる諸勢力を取得
    getKunishusInCastle(castleId) {
        return this.getAliveKunishus().filter(k => k.castleId === castleId);
    }

    // 特定の諸勢力に所属している武将一覧を取得
    getKunishuMembers(kunishuId) {
        return this.game.bushos.filter(b => b.belongKunishuId === kunishuId && b.status !== 'dead' && b.status !== 'unborn');
    }

    // イデオロギーによる相性計算の補正
    calcIdeologyAffinity(kunishu, targetBusho) {
        if (!targetBusho) return 25;
        let baseAffinity = GameSystem.calcAffinityDiff(this.game.getBusho(kunishu.leaderId).affinity, targetBusho.affinity);
        
        if (kunishu.ideology === '宗教') {
            // 宗教：相手の革新が30以上で反発開始。50差（革新80）の時に最大の+25になります
            if (targetBusho.innovation >= 30) {
                let diff = targetBusho.innovation - 30;
                let mod = (diff / 50) * 25;
                baseAffinity += Math.min(25, mod); // 最大で+25まで
            }
        } else if (kunishu.ideology === '地縁') {
            // 地縁：頭領と相手の革新の差を見ます
            const leader = this.game.getBusho(kunishu.leaderId);
            const L = leader ? leader.innovation : 50; // 頭領の革新
            const T = targetBusho.innovation;          // 相手の革新
            
            if (L === 50 && T === 50) {
                // お互い50ちょうどの時は -10
                baseAffinity -= 10;
            } else if ((L >= 50 && T >= 50) || (L <= 50 && T <= 50)) {
                // お互い50を基準に同じ側（同サイド）にいる場合
                let diff = Math.abs(L - T);
                let mod = (diff * 0.5) - 25; // 0差で-25、50差で0になります
                baseAffinity += mod;
            } else {
                // 50を基準に上下反対側にいる場合
                let diff = Math.abs(L - T);
                let mod = ((diff - 2) / 98) * 25; // 2差で0、100差で+25になります
                baseAffinity += mod;
            }
        }
        // 傭兵は革新による補正を行わず、基本の相性をそのまま使います
        
        return Math.max(0, Math.min(50, baseAffinity)); // 結果を0〜50の間に閉じ込めます
    }

    // 月末処理
    async processEndMonth() { // ★追加：async を付けます
        const activeKunishus = this.getAliveKunishus();

        activeKunishus.forEach(kunishu => {
            // 1. 兵力と防御力の自動回復 (最大値の５％)
            if (kunishu.soldiers < kunishu.maxSoldiers) {
                kunishu.soldiers = Math.min(kunishu.maxSoldiers, kunishu.soldiers + Math.floor(kunishu.maxSoldiers * 0.05));
            }
            if (kunishu.defense < kunishu.maxDefense) {
                kunishu.defense = Math.min(kunishu.maxDefense, kunishu.defense + Math.floor(kunishu.maxDefense * 0.05));
            }
            // ★追加: 馬と鉄砲の自動回復（兵士と同じく最大値の５％）
            if (kunishu.horses < kunishu.maxHorses) {
                kunishu.horses = Math.min(kunishu.maxHorses, kunishu.horses + Math.floor(kunishu.maxHorses * 0.05));
            }
            if (kunishu.guns < kunishu.maxGuns) {
                kunishu.guns = Math.min(kunishu.maxGuns, kunishu.guns + Math.floor(kunishu.maxGuns * 0.05));
            }

            // ★今回追加: 訓練度と士気の自然変動（毎月1ずつデフォルト値に近づく）
            if (kunishu.training < kunishu.defaultTraining) {
                kunishu.training += 1;
            } else if (kunishu.training > kunishu.defaultTraining) {
                kunishu.training -= 1;
            }

            if (kunishu.morale < kunishu.defaultMorale) {
                kunishu.morale += 1;
            } else if (kunishu.morale > kunishu.defaultMorale) {
                kunishu.morale -= 1;
            }
            
            // 安全のため、0未満や100を超えないようにガードします
            kunishu.training = Math.max(0, Math.min(100, kunishu.training));
            kunishu.morale = Math.max(0, Math.min(100, kunishu.morale));

            // 組織の壊滅チェック
            this.checkDestroyed(kunishu);
        });

        // 壊滅していないものを再度取得
        const survivingKunishus = this.getAliveKunishus();

        // 2. 城の所有者（大名）に対するアクション
        // ★変更：forEach をやめて、順番待ちができる for...of に変えます
        for (const kunishu of survivingKunishus) {
            const castle = this.game.getCastle(kunishu.castleId);
            if (!castle || castle.ownerClan === 0) continue; // ★変更：return を continue にします

            // 毎月末、最大10%の確率で発動
            if (Math.random() < 0.10) {
                await this.executeActionToLord(kunishu, castle); // ★追加：await を付けます
            }
            
            // 毎ターン、相性による友好度の自然変動
            const castellan = this.game.getBusho(castle.castellanId);
            if (castellan) {
                const affinityDiff = this.calcIdeologyAffinity(kunishu, castellan);
                
                // 25を基準にして、どれくらい離れているか（差分）を計算します
                let diff = 25 - affinityDiff;
                
                // どんなに差が大きくても、上も下も「最大25（最小-25）」でストップをかけます！
                diff = Math.max(-25, Math.min(25, diff));
                
                // 最大で ±3 になるように計算する魔法です
                let change = diff * (3 / 25);
                
                // 小数点以下1桁まで残すためのおまじないです（例：1.2）
                change = Math.round(change * 10) / 10;
                
                const currentRel = kunishu.getRelation(castle.ownerClan);
                
                // ★追加：友好度が70以上で、かつ減少しようとしている時は、減少をストップする魔法！
                if (currentRel >= 70 && change < 0) {
                    change = 0;
                }
                
                kunishu.setRelation(castle.ownerClan, currentRel + change);
            }
        }
    }

    // 城主（大名）へのアクション
    async executeActionToLord(kunishu, castle) {
        const clanId = castle.ownerClan;
        const currentRel = kunishu.getRelation(clanId);
        const castellan = this.game.getBusho(castle.castellanId);
        if (!castellan) return;

        const leader = this.game.getBusho(kunishu.leaderId);
        const clanData = this.game.clans.find(c => c.id === clanId);
        if (!leader || !clanData) return;

        // 諸勢力の名前と、大名家の名前を準備します！
        const kunishuName = kunishu.getName(this.game);
        const clanName = clanData.name;
        
        // この城が「プレイヤー（自分）の城」かどうかを調べる魔法です
        const isPlayerCastle = (clanId === this.game.playerClanId);

        // 頭領と城主の相性差を計算します
        const affinityDiff = this.calcIdeologyAffinity(kunishu, castellan);
        
        // プレイヤーに有利な倍率（贈り物用）の魔法
        // 相性差0で2倍、25で1倍、50で0.5倍になるように滑らかに変化させます
        let goodMult = 1.0;
        if (affinityDiff <= 25) {
            goodMult = 2.0 - (affinityDiff / 25);
        } else {
            goodMult = 1.0 - ((affinityDiff - 25) / 50);
        }
        
        // プレイヤーに不利な倍率（略奪・蜂起用）の魔法
        // 相性差0で0.5倍、25で1倍、50で2倍になるように滑らかに変化させます
        let badMult = 1.0;
        if (affinityDiff <= 25) {
            badMult = 0.5 + (affinityDiff / 25) * 0.5;
        } else {
            badMult = 1.0 + ((affinityDiff - 25) / 25);
        }

        // 友好 (70以上)
        if (currentRel >= 70) {
            // 贈り物の基本確率は20%（0.20）。友好度100で+15%（0.15）アップします
            let giftChance = (0.20 + ((currentRel - 70) / 30) * 0.15) * goodMult;
            
            if (Math.random() < giftChance) {
                // 献上 (無から湧く、最大現在兵力÷3、魅力で増加)
                let baseAmount = Math.floor(kunishu.soldiers / 3);
                let bonus = 1.0 + (castellan.charm / 100); // 魅力ボーナス
                let amount = Math.floor(baseAmount * bonus * Math.random());
                if (amount < 10) return;

                if (Math.random() > 0.5) {
                    let maxAdd = 99999 - castle.gold;
                    let actualAmount = Math.min(amount, maxAdd);
                    if (actualAmount > 0) {
                        castle.gold += actualAmount;
                        const msg = `${kunishuName}が、${clanName}の${castle.name}に金${actualAmount}を献上しました。`;
                        this.game.ui.log(msg.replace('\n', ''));
                        if (isPlayerCastle) await this.game.ui.showDialogAsync(msg);
                    }
                } else {
                    let maxAdd = 99999 - castle.rice;
                    let actualAmount = Math.min(amount, maxAdd);
                    if (actualAmount > 0) {
                        castle.rice += actualAmount;
                        const msg = `${kunishuName}が、${clanName}の${castle.name}に兵糧${actualAmount}を献上しました。`;
                        this.game.ui.log(msg.replace('\n', ''));
                        if (isPlayerCastle) await this.game.ui.showDialogAsync(msg);
                    }
                }
            }
        } 
        // 敵対 (30以下)
        else if (currentRel <= 30) {
            let actionDone = false;
            
            // まずは「略奪」の判定から行います！
            // 略奪の基本確率は20%（0.20）。友好度0で+15%（0.15）アップします
            let robChance = (0.20 + ((30 - currentRel) / 30) * 0.15) * badMult;
            
            if (Math.random() < robChance) {
                // 妨害（略奪）: 城から奪う、武力で軽減
                let baseAmount = Math.floor(kunishu.soldiers / 3);
                let reduction = 1.0 - (castellan.strength / 200); // 武力で最大50%軽減
                let amount = Math.floor(baseAmount * reduction * (0.5 + Math.random() * 0.5));
                
                // 奪う量が10以上なら略奪を実行します
                if (amount >= 10) {
                    if (Math.random() > 0.5 && castle.gold > amount) {
                        castle.gold -= amount;
                        const msg = `${kunishuName}が、${clanName}の${castle.name}で略奪を働き、金${amount}を奪いました！`;
                        this.game.ui.log(msg.replace('\n', ''));
                        if (isPlayerCastle) await this.game.ui.showDialogAsync(msg);
                        actionDone = true; // 略奪をしたので、目印をつけます
                    } else if (castle.rice > amount) {
                        castle.rice -= amount;
                        const msg = `${kunishuName}が、${clanName}の${castle.name}で略奪を働き、兵糧${amount}を奪いました！`;
                        this.game.ui.log(msg.replace('\n', ''));
                        if (isPlayerCastle) await this.game.ui.showDialogAsync(msg);
                        actionDone = true; // 略奪をしたので、目印をつけます
                    }
                }
            }
            
            // 略奪が起きなかった場合で、さらに友好度0の時だけ「蜂起」の判定を行います
            if (!actionDone && currentRel === 0) {
                let uprisingBase = 0;
                if (kunishu.ideology === '傭兵') uprisingBase = 0.30;
                else if (kunishu.ideology === '地縁') uprisingBase = 0.60;
                else if (kunishu.ideology === '宗教') uprisingBase = 1.00;
                
                let uprisingChance = uprisingBase * badMult;
                
                if (Math.random() < uprisingChance && kunishu.soldiers > 500) {
                    await this.executeUprising(kunishu, castle);
                }
            }
        }
    }

    // 蜂起処理 (諸勢力からの城攻め)
    // ★変更：async を付けます
    async executeUprising(kunishu, castle) {
        const atkSoldiers = Math.floor(kunishu.soldiers * 0.5);
        if (atkSoldiers <= 0) return;
        kunishu.soldiers -= atkSoldiers;

        // ★修正: 馬と鉄砲は全部持っていく
        const atkHorses = kunishu.horses || 0;
        kunishu.horses = 0;
        const atkGuns = kunishu.guns || 0;
        kunishu.guns = 0;

        // 兵糧は無から兵数の1.5倍湧く
        const atkRice = Math.floor(atkSoldiers * 1.5);

        // 連れてくる武将は最大5人
        const members = this.getKunishuMembers(kunishu.id).sort((a,b) => b.leadership - a.leadership);
        // リーダーを必ず含める
        let atkBushos = [];
        const leaderIdx = members.findIndex(b => b.id === kunishu.leaderId);
        if (leaderIdx !== -1) {
            atkBushos.push(members.splice(leaderIdx, 1)[0]);
        }
        atkBushos = atkBushos.concat(members.slice(0, 4));

        const kunishuName = kunishu.getName(this.game);
        this.game.ui.log(`【諸勢力蜂起】${castle.name}にて、${kunishuName}が反乱を起こしました！`);

        // 諸勢力を専用の一時的な大名(Clan)として扱うためのダミーデータ
        const dummyAttacker = {
            name: kunishuName, 
            ownerClan: -1, // 特殊ID
            soldiers: atkSoldiers,
            horses: atkHorses, // ★追加
            guns: atkGuns,     // ★追加
            training: kunishu.training, // ★修正：諸勢力の訓練度を使う
            morale: kunishu.morale,     // ★修正：諸勢力の士気を使う
            rice: atkRice,
            maxRice: atkRice,
            isKunishu: true,
            kunishuId: kunishu.id
        };

        // ==========================================
        // ★ここから修正！：戦争が「完全に」終わるまで見届ける監視カメラの魔法！
        // ==========================================
        let isWarReallyFinished = false;
        const originalCloseWar = this.game.warManager.closeWar;
        
        // closeWar（合戦画面を閉じる最後の処理）が呼ばれたら、監視カメラに「終わったよ！」と報告させます
        this.game.warManager.closeWar = function() {
            if (originalCloseWar) originalCloseWar.call(this); // 元の終了処理をちゃんと実行します
            isWarReallyFinished = true;  // 報告！
        };

        // WarManagerの開始フローに合流（いざ、戦争スタート！）
        this.game.warManager.startWar(dummyAttacker, castle, atkBushos, atkSoldiers, atkRice, atkHorses, atkGuns); 
        
        // 戦争とメッセージ表示が完全に終わるまでじっと待ちます
        let failSafeCounter = 0; 
        
        while (!isWarReallyFinished) {
            await new Promise(resolve => setTimeout(resolve, 500));
            
            // 安全装置：裏でエラーが起きて closeWar が一生呼ばれない場合のためのタイマー
            if (this.game.warManager.state && !this.game.warManager.state.active) {
                let anyModalOpen = false;
                if (this.game.ui) {
                    const isVisible = (id) => { const el = document.getElementById(id); return el && !el.classList.contains('hidden'); };
                    if (isVisible('result-modal') || isVisible('dialog-modal') || isVisible('war-modal')) {
                        anyModalOpen = true;
                    }
                    // タップメッセージ等、名前がわからない画面が出ている場合も検知します
                    const overlay = document.querySelector('[class*="tap"], [id*="tap"]');
                    if (overlay && !overlay.classList.contains('hidden') && overlay.style.display !== 'none') {
                        anyModalOpen = true;
                    }
                }
                
                if (!anyModalOpen) {
                    failSafeCounter++;
                    // 何の画面も出ていないのに3秒（6回）止まっていたら、エラーとみなして強制的に次へ進めます
                    if (failSafeCounter > 6) {
                        break;
                    }
                } else {
                    failSafeCounter = 0; // 画面が出ている間は大人しく待ちます
                }
            }
        }
        
        // 監視カメラを片付けて、元の状態に綺麗に戻します！
        delete this.game.warManager.closeWar;
        // ==========================================
        // ★修正ここまで
    }

    // 壊滅と継承のチェック
    checkDestroyed(kunishu) {
        if (kunishu.isDestroyed) return;

        const members = this.getKunishuMembers(kunishu.id);
        const leaderAlive = members.some(b => b.id === kunishu.leaderId);

        // 兵力が0、または所属武将が全滅したら壊滅
        if (kunishu.soldiers <= 0 || members.length === 0) {
            kunishu.isDestroyed = true;
            kunishu.soldiers = 0;
            
            // 残った武将の行き先を決めます
            members.forEach(b => {
                b.belongKunishuId = 0; // 諸勢力から外れます

                // ★ここを書き換え！：名前ではなく「秘密のシール」が貼ってあるか調べます
                if (b.isAutoLeader) {
                    // 自動で作られた頭領なら「死亡（消滅）」の印をつけます
                    b.status = 'dead';
                    
                    // お城の名簿からも、この頭領の名前を消しゴムで消しておきます
                    const castle = this.game.getCastle(b.castleId);
                    if (castle) {
                        castle.samuraiIds = castle.samuraiIds.filter(id => id !== b.id);
                    }
                } else {
                    // 頭領以外の普通の武将は、今まで通り浪人になります
                    // ★新しいお引越しセンターの魔法を使います！
                    this.game.affiliationSystem.becomeRonin(b);
                }
            });
            this.game.ui.log(`【諸勢力壊滅】${this.game.getCastle(kunishu.castleId).name}の諸勢力は壊滅しました。`);
            return;
        }

        // リーダーが死亡等で不在の場合、継承
        if (!leaderAlive && members.length > 0) {
            // 能力（統率＋知略）が一番高い者が継ぐ
            members.sort((a, b) => (b.leadership + b.intelligence) - (a.leadership + a.intelligence));
            kunishu.leaderId = members[0].id;
            this.game.ui.log(`【諸勢力継承】${members[0].name}が新たな諸勢力の頭領となりました。`);
        }
    }

    // ==========================================
    // ★ここから追加：諸勢力コマンドの実行処理（command_system.jsからのお引っ越し）
    // ==========================================
    
    // 諸勢力との親善処理
    executeKunishuGoodwill(doerId, kunishuId, gold) {
        const doer = this.game.getBusho(doerId);
        const kunishu = this.getKunishu(kunishuId);
        if (!kunishu) return;
        
        const castle = this.game.getCurrentTurnCastle();
        if (castle.gold < gold) { this.game.ui.showDialog("資金が足りません", false); return; }
        castle.gold -= gold;

        // ★修正：元のファイルにあったcalcGoodwillIncrease魔法を直接呼び出します
        const increase = this.game.diplomacyManager.calcGoodwillIncrease(gold, doer.diplomacy);
        
        const currentRel = kunishu.getRelation(this.game.playerClanId);
        kunishu.setRelation(this.game.playerClanId, currentRel + increase);
        
        const kunishuName = kunishu.getName(this.game);
        
        doer.isActionDone = true;
        doer.achievementTotal += Math.floor(doer.diplomacy * 0.2) + 10;
        this.game.factionSystem.updateRecognition(doer, 15);

        this.game.ui.showResultModal(`${doer.name}が ${kunishuName} と親善を行いました\n友好度が上昇しました`);
        this.game.ui.updatePanelHeader();
        this.game.ui.renderCommandMenu();
    }
    
    // 諸勢力を自軍に取り込む処理
    executeKunishuIncorporate(doerId, castleId, kunishuId) {
        const doer = this.game.getBusho(doerId);
        const kunishu = this.getKunishu(kunishuId);
        const castle = this.game.getCastle(castleId);
        
        if (!kunishu) return;

        const myClan = this.game.clans.find(c => c.id === this.game.playerClanId);
        const myPrestige = myClan ? myClan.daimyoPrestige : 0;
        const myDaimyo = this.game.bushos.find(b => b.clan === this.game.playerClanId && b.isDaimyo);
        const leader = this.game.getBusho(kunishu.leaderId);

        let baseProb = 0;
        const targetSoldiers = kunishu.soldiers || 1;
        const ratio = myPrestige / (targetSoldiers * 12);
        baseProb = 70 * ratio;
        
        const affinityDiff = (myDaimyo && leader) ? GameSystem.calcAffinityDiff(myDaimyo.affinity, leader.affinity) : 25;
        const affinityMod = (25 - affinityDiff) / 25 * 10;
        
        const diplomacyMod = (doer.diplomacy - 50) / 50 * 10;
        
        let totalProb = baseProb + affinityMod + diplomacyMod;
        
        const isSuccess = (Math.random() * 100) < totalProb;
        
        if (isSuccess) {
            castle.soldiers = Math.min(99999, castle.soldiers + kunishu.soldiers);
            castle.horses = Math.min(99999, (castle.horses || 0) + (kunishu.horses || 0));
            castle.guns = Math.min(99999, (castle.guns || 0) + (kunishu.guns || 0));
            
            const members = this.getKunishuMembers(kunishuId);
            members.forEach(b => {
                b.belongKunishuId = 0;
                this.game.affiliationSystem.joinClan(b, this.game.playerClanId, castle.id);
            });
            
            kunishu.isDestroyed = true;
            kunishu.soldiers = 0;

            const kunishuName = kunishu.getName(this.game);
            this.game.ui.showResultModal(`${doer.name}の説得により、${kunishuName} が我が傘下に加わりました！`);
            
            doer.achievementTotal += Math.floor(doer.diplomacy * 0.3) + 30;
            this.game.factionSystem.updateRecognition(doer, 30);
        } else {
            const kunishuName = kunishu.getName(this.game);
            this.game.ui.showResultModal(`${doer.name}は ${kunishuName} に合流を提案しましたが、\n丁重に断られてしまいました……`);
            doer.achievementTotal += 5;
            this.game.factionSystem.updateRecognition(doer, 10);
        }

        doer.isActionDone = true;
        this.game.ui.updatePanelHeader();
        this.game.ui.renderCommandMenu();
        this.game.ui.renderMap();
    }

    // 諸勢力を攻めて壊滅させるための処理
    async executeKunishuSubjugate(atkCastle, targetCastleId, atkBushosIds, sendSoldiers, sendRice, sendHorses, sendGuns, kunishu) {
        const atkBushos = atkBushosIds.map(id => this.game.getBusho(id));
        const targetCastle = this.game.getCastle(targetCastleId);
        
        // 攻撃する側（プレイヤー）の城から、出陣する数だけ兵士や兵糧、騎馬、鉄砲を減らします
        atkCastle.soldiers = Math.max(0, atkCastle.soldiers - sendSoldiers);
        atkCastle.rice = Math.max(0, atkCastle.rice - sendRice);
        atkCastle.horses = Math.max(0, (atkCastle.horses || 0) - sendHorses);
        atkCastle.guns = Math.max(0, (atkCastle.guns || 0) - sendGuns);
        atkBushos.forEach(b => b.isActionDone = true);

        // 諸勢力側の準備（一時的なダミーの城と軍団を作ります）
        const kunishuName = kunishu.getName(this.game);
        const leader = this.game.getBusho(kunishu.leaderId);
        // この戦い限定の「守備側データ」を作成
        const dummyDefender = {
            id: targetCastleId,
            name: kunishuName, 
            ownerClan: -1,
            soldiers: kunishu.soldiers,
            defense: kunishu.defense,
            maxDefense: kunishu.maxDefense,
            training: kunishu.training, // ★修正：諸勢力の訓練度を使う
            morale: kunishu.morale,     // ★修正：諸勢力の士気を使う
            rice: Math.floor(kunishu.soldiers * 1.5), 
            isKunishu: true,
            kunishuId: kunishu.id,
            peoplesLoyalty: 100, 
            population: 1000,
            samuraiIds: [] 
        };

        const attackerForce = { 
            name: atkCastle.name + "遠征軍", ownerClan: atkCastle.ownerClan, soldiers: sendSoldiers, 
            bushos: atkBushos, training: atkCastle.training, morale: atkCastle.morale, rice: sendRice, maxRice: sendRice,
            horses: sendHorses, guns: sendGuns
        };

        let currentRel = kunishu.getRelation(atkCastle.ownerClan);
        let nextRel = currentRel;
        if (currentRel >= 60) nextRel = 30;
        else if (currentRel >= 31) nextRel -= 30;
        else nextRel = 0;
        kunishu.setRelation(atkCastle.ownerClan, nextRel);

        const isPlayer = (Number(atkCastle.ownerClan) === Number(this.game.playerClanId) && !atkCastle.isDelegated);

        this.game.warManager.state = { 
            active: true, round: 1, attacker: attackerForce, sourceCastle: atkCastle, 
            defender: dummyDefender, atkBushos: atkBushos, defBusho: leader || {name:"諸勢力", strength:50, intelligence:50, leadership:50}, 
            turn: 'attacker', isPlayerInvolved: isPlayer, deadSoldiers: { attacker: 0, defender: 0 }, defenderGuarding: false,
            isKunishuSubjugation: true 
        };

        const atkClanData = this.game.clans.find(c => c.id === Number(atkCastle.ownerClan));
        const atkDaimyoName = atkClanData ? atkClanData.name : "大名家";
        const leaderName = atkBushos[0].name;

        if (!isPlayer) {
            const startMsg = `${atkDaimyoName}の${leaderName}が、\n${kunishuName}の鎮圧に乗り出しました！`;
            this.game.ui.log(startMsg.replace('\n', ''));
            await this.game.ui.showDialogAsync(startMsg);
        }

        this.game.warManager.startSiegeWarPhase();
        
        if (isPlayer) {
            this.game.ui.updatePanelHeader();
            this.game.ui.renderCommandMenu();
        }
    }
}