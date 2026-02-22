/**
 * kunishu_system.js
 * 新規作成: 国人衆（独立地域勢力）システムを管理するクラス
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

    getKunishu(id) {
        return this.kunishus.find(k => k.id === id);
    }

    getAliveKunishus() {
        return this.kunishus.filter(k => !k.isDestroyed);
    }

    // 指定した城にいる国人衆を取得
    getKunishusInCastle(castleId) {
        return this.getAliveKunishus().filter(k => k.castleId === castleId);
    }

    // 特定の国人衆に所属している武将一覧を取得
    getKunishuMembers(kunishuId) {
        return this.game.bushos.filter(b => b.belongKunishuId === kunishuId && b.status !== 'dead');
    }

    // イデオロギーによる相性計算の補正
    calcIdeologyAffinity(kunishu, targetBusho) {
        if (!targetBusho) return 50;
        let baseAffinity = GameSystem.calcAffinityDiff(this.game.getBusho(kunishu.leaderId).affinity, targetBusho.affinity);
        
        if (kunishu.ideology === '傭兵') {
            return 50; // 傭兵は誰に対しても一定
        } else if (kunishu.ideology === '地縁') {
            if (targetBusho.innovation > 70) baseAffinity -= 15; // 革新が高いと反発
        } else if (kunishu.ideology === '宗教') {
            if (targetBusho.innovation > 60) baseAffinity -= 30; // 革新が高いと猛烈に反発
        }
        return Math.max(0, Math.min(100, baseAffinity));
    }

    // 月末処理
    processEndMonth() {
        const activeKunishus = this.getAliveKunishus();

        activeKunishus.forEach(kunishu => {
            // 1. 兵力と防御力の自動回復 (最大値の1割)
            if (kunishu.soldiers < kunishu.maxSoldiers) {
                kunishu.soldiers = Math.min(kunishu.maxSoldiers, kunishu.soldiers + Math.floor(kunishu.maxSoldiers * 0.1));
            }
            if (kunishu.defense < kunishu.maxDefense) {
                kunishu.defense = Math.min(kunishu.maxDefense, kunishu.defense + Math.floor(kunishu.maxDefense * 0.1));
            }

            // 組織の壊滅チェック
            this.checkDestroyed(kunishu);
        });

        // 壊滅していないものを再度取得
        const survivingKunishus = this.getAliveKunishus();

        // 2. 国人衆同士の抗争 (同一城内のチェック)
        const checkedPairs = new Set();
        survivingKunishus.forEach(k1 => {
            survivingKunishus.forEach(k2 => {
                if (k1.id === k2.id || k1.castleId !== k2.castleId) return;
                const pairId = k1.id < k2.id ? `${k1.id}-${k2.id}` : `${k2.id}-${k1.id}`;
                if (checkedPairs.has(pairId)) return;
                checkedPairs.add(pairId);

                // 互いの友好度が低い(30以下)場合は抗争発生
                const rel1 = k1.getRelation(k2.id);
                const rel2 = k2.getRelation(k1.id);
                if (rel1 <= 30 || rel2 <= 30) {
                    this.executeConflict(k1, k2);
                }
            });
        });

        // 3. 城の所有者（大名）に対するアクション
        survivingKunishus.forEach(kunishu => {
            const castle = this.game.getCastle(kunishu.castleId);
            if (!castle || castle.ownerClan === 0) return; // 中立の城は何もしない

            // 毎月末、最大20%の確率で発動
            if (Math.random() < 0.20) {
                this.executeActionToLord(kunishu, castle);
            }
            
            // 毎ターン、相性による友好度の自然変動 (最大±3)
            const castellan = this.game.getBusho(castle.castellanId);
            if (castellan) {
                const affinity = this.calcIdeologyAffinity(kunishu, castellan);
                let change = 0;
                if (affinity > 60) change = Math.floor(Math.random() * 3) + 1;
                else if (affinity < 40) change = -(Math.floor(Math.random() * 3) + 1);
                
                const currentRel = kunishu.getRelation(castle.ownerClan);
                kunishu.setRelation(castle.ownerClan, currentRel + change);
            }
        });
    }

    // 国人衆同士の抗争処理
    executeConflict(k1, k2) {
        // k1が攻撃側、k2が防御側とする（ランダムで決定）
        let attacker = k1;
        let defender = k2;
        if (Math.random() > 0.5) {
            attacker = k2;
            defender = k1;
        }

        const atkSoldiers = Math.floor(attacker.soldiers * 0.5); // 攻撃側は5割の兵力
        const defSoldiers = defender.soldiers; // 防御側は全兵力

        if (atkSoldiers <= 0 || defSoldiers <= 0) return;

        // 簡易的なダメージ計算（武将能力はリーダーを参照）
        const atkLeader = this.game.getBusho(attacker.leaderId);
        const defLeader = this.game.getBusho(defender.leaderId);
        
        const atkPower = (atkLeader ? atkLeader.leadership : 30) * 1.0 + atkSoldiers * 0.05;
        // 防御側有利
        const defPower = (defLeader ? defLeader.leadership : 30) * 1.2 + defSoldiers * 0.05;

        const ratio = atkPower / (atkPower + defPower);
        const baseDmg = Math.max(10, atkPower * ratio * 1.0);

        const soldierDmg = Math.floor(baseDmg);
        const counterDmg = Math.floor(defPower * 0.1);

        defender.soldiers = Math.max(0, defender.soldiers - soldierDmg);
        attacker.soldiers = Math.max(0, attacker.soldiers - counterDmg);

        const msg = `【国衆抗争】${this.game.getCastle(attacker.castleId).name}にて、${atkLeader?atkLeader.name:"国衆"}と${defLeader?defLeader.name:"国衆"}が抗争を起こしました！`;
        this.game.ui.log(msg);

        this.checkDestroyed(attacker);
        this.checkDestroyed(defender);
    }

    // 城主（大名）へのアクション
    executeActionToLord(kunishu, castle) {
        const clanId = castle.ownerClan;
        const currentRel = kunishu.getRelation(clanId);
        const castellan = this.game.getBusho(castle.castellanId);
        if (!castellan) return;

        const leader = this.game.getBusho(kunishu.leaderId);
        const clanData = this.game.clans.find(c => c.id === clanId);
        if (!leader || !clanData) return;

        // 友好 (70以上)
        if (currentRel >= 70) {
            // 献上 (無から湧く、最大現在兵力÷3、魅力で増加)
            let baseAmount = Math.floor(kunishu.soldiers / 3);
            let bonus = 1.0 + (castellan.charm / 100); // 魅力ボーナス
            let amount = Math.floor(baseAmount * bonus * Math.random());
            if (amount < 10) return;

            if (Math.random() > 0.5) {
                castle.gold += amount;
                this.game.ui.log(`【国衆支援】${castle.name}の国人衆が、金${amount}を献上してきました。`);
            } else {
                castle.rice += amount;
                this.game.ui.log(`【国衆支援】${castle.name}の国人衆が、兵糧${amount}を献上してきました。`);
            }
        } 
        // 敵対 (30以下)
        else if (currentRel <= 30) {
            // 妨害か蜂起
            if (Math.random() > 0.3) {
                // 妨害（略奪）: 城から奪う、武力で軽減
                let baseAmount = Math.floor(kunishu.soldiers / 3);
                let reduction = 1.0 - (castellan.strength / 200); // 武力で最大50%軽減
                let amount = Math.floor(baseAmount * reduction * (0.5 + Math.random() * 0.5));
                if (amount < 10) return;

                if (Math.random() > 0.5 && castle.gold > amount) {
                    castle.gold -= amount;
                    this.game.ui.log(`【国衆妨害】${castle.name}の国人衆に、金${amount}を奪われました！`);
                } else if (castle.rice > amount) {
                    castle.rice -= amount;
                    this.game.ui.log(`【国衆妨害】${castle.name}の国人衆に、兵糧${amount}を奪われました！`);
                }
            } else {
                // 蜂起（戦争）
                // 強気・弱気の性格補正
                let uprisingChance = 0.5;
                if (leader.personality === 'aggressive') uprisingChance += 0.2;
                if (leader.personality === 'cautious') uprisingChance -= 0.2;

                if (Math.random() < uprisingChance && kunishu.soldiers > 500) {
                    this.executeUprising(kunishu, castle);
                }
            }
        }
    }

    // 蜂起処理 (国人衆からの城攻め)
    executeUprising(kunishu, castle) {
        const atkSoldiers = Math.floor(kunishu.soldiers * 0.5);
        if (atkSoldiers <= 0) return;
        kunishu.soldiers -= atkSoldiers;

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

        this.game.ui.log(`【国衆蜂起】${castle.name}にて、国人衆が反乱を起こしました！`);

        // 国人衆を専用の一時的な大名(Clan)として扱うためのダミーデータ
        const dummyAttacker = {
            name: `${this.game.getBusho(kunishu.leaderId).name}衆`,
            ownerClan: -1, // 特殊ID
            soldiers: atkSoldiers,
            training: 50,
            morale: 80,
            rice: atkRice,
            maxRice: atkRice,
            isKunishu: true,
            kunishuId: kunishu.id
        };

        // WarManagerの開始フローに合流
        this.game.warManager.startWar(dummyAttacker, castle, atkBushos, atkSoldiers, atkRice);
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
            
            // 残った武将は在野へ
            members.forEach(b => {
                b.belongKunishuId = 0;
                b.clan = 0;
                b.status = 'ronin';
                b.isCastellan = false;
            });
            this.game.ui.log(`【国衆壊滅】${this.game.getCastle(kunishu.castleId).name}の国人衆は壊滅しました。`);
            return;
        }

        // リーダーが死亡等で不在の場合、継承
        if (!leaderAlive && members.length > 0) {
            // 能力（統率＋知略）が一番高い者が継ぐ
            members.sort((a, b) => (b.leadership + b.intelligence) - (a.leadership + a.intelligence));
            kunishu.leaderId = members[0].id;
            this.game.ui.log(`【国衆継承】${members[0].name}が新たな国衆の頭領となりました。`);
        }
    }
}