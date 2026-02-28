/**
 * independence_system.js
 * 城主の独立（謀反）システム
 * 責務: 毎月の独立判定、新クラン作成、家臣の処遇処理
 * 修正: 独立・脱出・帰還時に城主自動更新ロジック (updateCastleLord) を適用
 */

class IndependenceSystem {
    constructor(game) {
        this.game = game;
    }

    /**
     * 月末に呼び出されるメイン処理
     */
    async checkIndependence() {
        // プレイヤー以外の全城主（プレイヤー大名は対象外だが、プレイヤー配下の城主は対象）
        // 判定対象: 城主IDが存在し、かつ大名本人ではない（＝拠点の城主）
        const potentialRebels = this.game.castles.filter(c => {
            if (c.ownerClan === 0) return false; // 中立は対象外
            if (!c.castellanId) return false; // 城主不在

            const castellan = this.game.getBusho(c.castellanId);
            if (!castellan || castellan.isDaimyo) return false; // 大名本人の城は対象外

            // 所属クランの拠点が1つしかない場合は独立しない（最低2城必要）
            const clanCastles = this.game.castles.filter(cl => cl.ownerClan === c.ownerClan);
            if (clanCastles.length <= 1) return false;

            return true;
        });

        const I = window.WarParams.Independence || {};
        const thresholdBase = I.ThresholdBase || 29;
        const dutyDiv = I.ThresholdDutyDiv || 2;
        const ambDiv = I.ThresholdAmbitionDiv || 5;

        // 判定実行
        for (const castle of potentialRebels) {
            const castellan = this.game.getBusho(castle.castellanId);
            const clan = this.game.clans.find(c => c.id === castle.ownerClan);
            const daimyo = this.game.bushos.find(b => b.clan === castle.ownerClan && b.isDaimyo);
            
            if (!castellan || !clan || !daimyo) continue;

            // A. 有効忠誠閾値 (T) の算出
            // 基本値29 + 義理が低いほど上昇 + 野心が高いほど上昇
            // 例: 義理10, 野心90 => 29 + 20 + 8 = 57 (忠誠57以下なら危険)
            // 例: 義理90, 野心10 => 29 - 20 - 8 = 1 (ほぼ裏切らない)
            const threshold = thresholdBase + ((50 - castellan.duty) / dutyDiv) + ((castellan.ambition - 50) / ambDiv);

            // 現在の忠誠が閾値以下なら判定へ
            if (castellan.loyalty <= threshold) {
                await this.calculateAndExecute(castle, castellan, daimyo, threshold);
            }
        }
    }

    /**
     * 確率計算と実行
     */
    async calculateAndExecute(castle, castellan, daimyo, threshold) {
        const I = window.WarParams.Independence || {};
        const bonusMismatch = I.FactionBonusMismatch || 20;
        const bonusMatch = I.FactionBonusMatch || -10;
        const probLoyalty = I.ProbLoyaltyFactor || 2;
        const probAffinity = I.ProbAffinityFactor || 0.5;

        // 相性差 (0~100)
        const affinityDiff = GameSystem.calcAffinityDiff(castellan.affinity, daimyo.affinity);
        
        // 派閥ボーナス
        let factionBonus = 0;
        const myFaction = castellan.getFactionName ? castellan.getFactionName() : "";
        const lordFaction = daimyo.getFactionName ? daimyo.getFactionName() : "";
        
        if (myFaction && lordFaction) {
            if (myFaction !== lordFaction) factionBonus = bonusMismatch; // 派閥不一致は独立しやすい
            else factionBonus = bonusMatch; // 一致していると抑制
        }

        // B. 独立確率 P (千分率)
        // (閾値 - 現在忠誠) * 2 + (相性差 * 0.5) +/- 派閥
        let prob = ((threshold - castellan.loyalty) * probLoyalty) + (affinityDiff * probAffinity) + factionBonus;
        
        // 確率が0以下なら発生しない
        if (prob <= 0) return;

        // 乱数判定 (0.0 ~ 1000.0)
        const roll = Math.random() * 1000;

        if (roll < prob) {
            await this.executeRebellion(castle, castellan, daimyo);
        }
    }

    /**
     * 独立実行処理
     */
    async executeRebellion(castle, castellan, oldDaimyo) {
        const oldClanId = castle.ownerClan;
        const I = window.WarParams.Independence || {};
        const initGold = I.InitialGold || 1000;
        const initRice = I.InitialRice || 1000;
        
        // 1. 新クラン生成
        const newClanId = Math.max(...this.game.clans.map(c => c.id)) + 1;
        // 色はランダム
        const newColor = '#' + Math.floor(Math.random()*16777215).toString(16).padStart(6, '0');
        // 名前は「姓 + 家」
        // 「familyName」が空っぽなら、「name（フルネーム）」をそのまま使います
        const familyName = castellan.familyName || castellan.name; 
        const newClanName = `${familyName}家`;

        const newClan = new Clan({
            id: newClanId,
            name: newClanName,
            color: newColor,
            leaderId: castellan.id,
            rice: initRice, // 独立資金
            gold: initGold
        });
        this.game.clans.push(newClan);

        // 2. 身分更新
        castellan.isDaimyo = true;
        castellan.isCastellan = true; // 自身が城主兼大名
        castellan.clan = newClanId;
        castellan.loyalty = 100; // 自身への忠誠

        // 3. 拠点移譲
        castle.ownerClan = newClanId;

        // 4. 外交関係の更新（敵対設定）
        const relKey = this.game.getRelationKey(oldClanId, newClanId);
        this.game.relations[relKey] = { friendship: 0, alliance: false };

        // 5. 部下の去就判定
        this.resolveSubordinates(castle, castellan, oldDaimyo, newClanId, oldClanId);

        // ★ 新大名となった城の城主更新（大名優先ロジックの適用）
        this.game.updateCastleLord(castle);

        // 6. UIログ
        const oldClanName = this.game.clans.find(c => c.id === oldClanId).name;
        const msg = `【謀反】${oldClanName}の${castle.name}にて、${castellan.name}が独立！「${newClanName}」を旗揚げしました。`;
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
    }

    /**
     * 部下の去就判定 (合流 / 脱出 / 捕縛)
     */
     resolveSubordinates(castle, newDaimyo, oldDaimyo, newClanId, oldClanId) {
        // 🌟 ここが変わりました！「浪人（status === 'ronin'）」は巻き込まれないように除外します
        const subordinates = this.game.getCastleBushos(castle.id).filter(b => b.id !== newDaimyo.id && b.status !== 'ronin');
        const captives = [];
        const escapees = [];
        const joiners = [];
        
        const I = window.WarParams.Independence || {};
        const bonusFaction = I.JoinBonusFaction || 30;
        const escapeDuty = I.EscapeDutyThreshold || 30;

        // 脱出先候補（元の主君の他の城）
        const escapeCastles = this.game.castles.filter(c => c.ownerClan === oldClanId && c.id !== castle.id);
        const hasEscapeRoute = escapeCastles.length > 0;

        subordinates.forEach(busho => {
            // 判定値計算
            // 新大名への親和性 vs 旧大名への義理・忠誠
            const affNew = GameSystem.calcAffinityDiff(busho.affinity, newDaimyo.affinity);
            const affOld = GameSystem.calcAffinityDiff(busho.affinity, oldDaimyo.affinity);
            
            // 合流スコア: 相性が良い(差が小さい)ほど高い。野心が高いと勝ち馬に乗る。
            let joinScore = (100 - affNew) + (busho.ambition * 0.5);
            // 残留(脱出)スコア: 義理堅い、旧主との相性が良い、現在の忠誠が高い
            let stayScore = (100 - affOld) + busho.duty + (busho.loyalty * 0.5);

            // 派閥補正
            const myFaction = busho.getFactionName ? busho.getFactionName() : "";
            if (myFaction && myFaction === (newDaimyo.getFactionName ? newDaimyo.getFactionName() : "")) joinScore += bonusFaction;
            if (myFaction && myFaction === (oldDaimyo.getFactionName ? oldDaimyo.getFactionName() : "")) stayScore += bonusFaction;

            // 判定
            if (joinScore > stayScore) {
                // 合流
                busho.clan = newClanId;
                busho.loyalty = 80; // 新体制への期待
                joiners.push(busho);
            } else {
                // 脱出試行
                if (hasEscapeRoute && busho.duty >= escapeDuty) { // ある程度義理があれば脱出を試みる
                    // 脱出成功判定 (武力と知略で判定)
                    const escapePower = busho.strength + busho.intelligence;
                    // 捕縛側（新大名）の阻止力
                    const blockPower = newDaimyo.leadership + newDaimyo.intelligence;
                    
                    // ランダム要素
                    if ((escapePower * (Math.random() + 0.5)) > (blockPower * 0.8)) {
                        // 脱出成功
                        const targetCastle = escapeCastles[Math.floor(Math.random() * escapeCastles.length)];
                        castle.samuraiIds = castle.samuraiIds.filter(id => id !== busho.id);
                        targetCastle.samuraiIds.push(busho.id);
                        busho.castleId = targetCastle.id;
                        busho.isCastellan = false; // 城主ではなくなる
                        escapees.push(busho);

                        // ★ 脱出先の城の城主情報を更新（空き城だった場合などのため）
                        this.game.updateCastleLord(targetCastle);
                    } else {
                        // 捕縛
                        castle.samuraiIds = castle.samuraiIds.filter(id => id !== busho.id);
                        busho.castleId = 0; // 牢獄状態（便宜上）
                        captives.push(busho);
                    }
                } else {
                    // 脱出先がない、または義理が低すぎて逃げる気もない -> 消極的合流
                    busho.clan = newClanId;
                    busho.loyalty = 30; // 仕方なく従う
                    joiners.push(busho);
                }
            }
        });

        // ログ出力
        if (joiners.length > 0) this.game.ui.log(`  -> ${joiners.length}名が${newDaimyo.name}に追随しました。`);
        if (escapees.length > 0) this.game.ui.log(`  -> ${escapees.length}名が脱出し、帰還しました。`);
        if (captives.length > 0) {
            this.game.ui.log(`  -> ${captives.length}名が脱出に失敗し、捕らえられました。`);
            this.handleCaptives(captives, oldClanId, newClanId, newDaimyo);
        }
    }

    /**
     * 捕縛者の処理
     * 元の主君がプレイヤーの場合、UIで選択させる
     * 元の主君がAIの場合、AI同士で自動解決
     */
    handleCaptives(captives, oldClanId, newClanId, newDaimyo) {
        const I = window.WarParams.Independence || {};
        const hateThreshold = I.ExecHateThreshold || 60;
        const ambitionThreshold = I.ExecAmbitionThreshold || 80;

        // 帰還先の確保（元の主君の城）
        const returnCastles = this.game.castles.filter(c => c.ownerClan === oldClanId);
        
        // 帰還処理関数
        const returnToMaster = (busho) => {
            if (returnCastles.length > 0) {
                const target = returnCastles[Math.floor(Math.random() * returnCastles.length)];
                busho.clan = oldClanId;
                busho.castleId = target.id;
                busho.status = 'active'; // 復帰
                target.samuraiIds.push(busho.id);

                // ★ 帰還先の城の城主情報を更新
                this.game.updateCastleLord(target);

                return target.name;
            } else {
                // 帰る城がない場合は在野
                busho.status = 'ronin';
                busho.clan = 0;
                return null;
            }
        };

        // プレイヤーが「元の主君」の場合（部下を奪われた側）
        // プレイヤーの武将が捕まった -> 処遇を決めるのは「新大名(AI)」
        if (oldClanId === this.game.playerClanId) {
            // AIによる処断/解放判定
            captives.forEach(p => {
                // 新大名と相性が悪い、または新大名が残忍(野心高)なら処断
                const hate = GameSystem.calcAffinityDiff(p.affinity, newDaimyo.affinity);
                if (hate > hateThreshold || newDaimyo.ambition > ambitionThreshold) {
                    p.status = 'dead';
                    p.clan = 0;
                    // ★ alert を showDialog に変更
                    setTimeout(() => this.game.ui.showDialog(`悲報：捕らえられた ${p.name} は、${newDaimyo.name}によって処断されました……`, false), 1000);
                } else {
                    // 解放 -> 帰還
                    const returnedCastleName = returnToMaster(p);
                    if (returnedCastleName) {
                        // ★ alert を showDialog に変更
                        setTimeout(() => this.game.ui.showDialog(`報告：${p.name} は解放され、${returnedCastleName}へ無事帰還しました！`, false), 1000);
                    } else {
                        // ★ alert を showDialog に変更
                        setTimeout(() => this.game.ui.showDialog(`報告：${p.name} は解放されましたが、帰る場所がなく在野に下りました。`, false), 1000);
                    }
                }
            });
        }
        // プレイヤーが「新大名」の場合（ここには来ない想定だが念のため）
        else if (newClanId === this.game.playerClanId) {
            // プレイヤーが独立した側なら、捕虜の処遇を選べる（既存UI利用）
            // 注意: UI側の実装によっては在野になる可能性がありますが、ここでは手を加えません
            this.game.ui.showPrisonerModal(captives);
        }
        // AI vs AI
        else {
            captives.forEach(p => {
                // 3割処断、7割解放(帰還)
                if (Math.random() < 0.3) {
                    p.status = 'dead';
                    p.clan = 0;
                } else {
                    // 帰還
                    returnToMaster(p);
                }
            });
        }
    }
}