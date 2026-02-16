/**
 * command_system.js
 * ゲーム内のコマンド実行ロジックを管理するクラス
 */

class CommandSystem {
    constructor(game) {
        this.game = game; // GameManagerのインスタンスへの参照
    }

    executeCommand(type, bushoIds, targetId) {
        const castle = this.game.getCurrentTurnCastle(); let totalVal = 0, cost = 0, count = 0, actionName = "";
        
        if (type === 'appoint' || type === 'appoint_gunshi') {
            const busho = this.game.getBusho(bushoIds[0]);
            if (type === 'appoint') { 
                const old = this.game.getBusho(castle.castellanId); if(old) old.isCastellan = false; 
                castle.castellanId = busho.id; busho.isCastellan = true; 
                this.game.ui.showResultModal(`${busho.name}を城主に任命しました`); 
            }
            if (type === 'appoint_gunshi') { 
                const oldGunshi = this.game.bushos.find(b => b.clan === this.game.playerClanId && b.isGunshi); if (oldGunshi) oldGunshi.isGunshi = false; 
                busho.isGunshi = true; 
                this.game.ui.showResultModal(`${busho.name}を軍師に任命しました`); 
            }
            this.game.ui.updatePanelHeader(); this.game.ui.renderCommandMenu(); 
            return;
        }

        bushoIds.forEach(bid => {
            const busho = this.game.getBusho(bid); if (!busho) return;
            if (type === 'farm') { 
                if (castle.gold >= 500) { 
                    const val = GameSystem.calcDevelopment(busho); castle.gold -= 500; 
                    castle.kokudaka = Math.min(castle.maxKokudaka, castle.kokudaka + val); 
                    totalVal += val; count++; actionName = "石高開発";
                }
            }
            else if (type === 'commerce') { 
                if (castle.gold >= 500) { 
                    const val = GameSystem.calcDevelopment(busho); castle.gold -= 500; 
                    castle.commerce = Math.min(castle.maxCommerce, castle.commerce + val); 
                    totalVal += val; count++; actionName = "商業開発";
                }
            }
            else if (type === 'repair') { 
                if (castle.gold >= 300) { 
                    const val = GameSystem.calcRepair(busho); castle.gold -= 300; 
                    castle.defense = Math.min(castle.maxDefense, castle.defense + val); 
                    totalVal += val; count++; actionName = "城壁修復";
                }
            }
            else if (type === 'training') { const val = GameSystem.calcTraining(busho); castle.training = Math.min(100, castle.training + val); totalVal += val; count++; actionName = "訓練"; }
            else if (type === 'soldier_charity') { const val = GameSystem.calcSoldierCharity(busho); castle.morale = Math.min(100, castle.morale + val); totalVal += val; count++; actionName = "兵施し"; }
            else if (type === 'banish') { if(!confirm(`本当に ${busho.name} を追放しますか？`)) return; busho.status = 'ronin'; busho.clan = 0; busho.isCastellan = false; this.game.ui.showResultModal(`${busho.name}を追放しました`); this.game.ui.updatePanelHeader(); this.game.ui.renderCommandMenu(); return; }
            else if (type === 'move_deploy') { const targetC = this.game.getCastle(targetId); castle.samuraiIds = castle.samuraiIds.filter(id => id !== busho.id); targetC.samuraiIds.push(busho.id); busho.castleId = targetId; count++; actionName = "移動"; }
            busho.isActionDone = true;
        });

        if (count > 0 && actionName !== "移動") { 
            let detail = "";
            if (actionName === "石高開発") detail = `(現在: ${castle.kokudaka}/${castle.maxKokudaka})`;
            if (actionName === "商業開発") detail = `(現在: ${castle.commerce}/${castle.maxCommerce})`;
            if (actionName === "城壁修復") detail = `(現在: ${castle.defense}/${castle.maxDefense})`;
            if (actionName === "訓練") detail = `(現在: ${castle.training}/100)`;
            if (actionName === "兵施し") detail = `(現在: ${castle.morale}/100)`;
            
            this.game.ui.showResultModal(`${count}名で${actionName}を行いました\n効果: +${totalVal} ${detail}`); 
        }
        else if (actionName === "移動") { const targetName = this.game.getCastle(targetId).name; this.game.ui.showResultModal(`${count}名が${targetName}へ移動しました`); }
        this.game.ui.updatePanelHeader(); this.game.ui.renderCommandMenu();
        this.game.ui.log(`${actionName}を実行 (効果:${totalVal})`);
    }

    executeInvestigate(bushoIds, targetId) {
        const bushos = bushoIds.map(id => this.game.getBusho(id));
        const target = this.game.getCastle(targetId);
        const result = GameSystem.calcInvestigate(bushos, target);
        let msg = "";
        if (result.success) {
            target.investigatedUntil = this.game.getCurrentTurnId() + 4; target.investigatedAccuracy = result.accuracy;
            msg = `潜入に成功しました！\n情報を入手しました。\n(情報の精度: ${result.accuracy}%)`;
        } else { msg = `潜入に失敗しました……\n情報は得られませんでした。`; }
        bushos.forEach(b => b.isActionDone = true);
        this.game.ui.showResultModal(msg); this.game.ui.updatePanelHeader(); this.game.ui.renderCommandMenu(); this.game.ui.renderMap();
        this.game.ui.log(`調査実行: ${target.name} (${result.success ? '成功' : '失敗'})`);
    }

    executeEmploy(doerId, targetId) { const doer = this.game.getBusho(doerId); const target = this.game.getBusho(targetId); const myPower = this.game.getClanTotalSoldiers(this.game.playerClanId); const targetClanId = target.clan; const targetPower = targetClanId === 0 ? 0 : this.game.getClanTotalSoldiers(targetClanId); const success = GameSystem.calcEmploymentSuccess(doer, target, myPower, targetPower); let msg = ""; if (success) { const oldCastle = this.game.getCastle(target.castleId); if(oldCastle && oldCastle.samuraiIds.includes(target.id)) { oldCastle.samuraiIds = oldCastle.samuraiIds.filter(id => id !== target.id); } const currentC = this.game.getCurrentTurnCastle(); currentC.samuraiIds.push(target.id); target.castleId = currentC.id; target.clan = this.game.playerClanId; target.status = 'active'; target.loyalty = 50; msg = `${target.name}の登用に成功しました！`; } else { msg = `${target.name}は登用に応じませんでした……`; } doer.isActionDone = true; this.game.ui.showResultModal(msg); this.game.ui.renderCommandMenu(); }

    executeDiplomacy(doerId, targetClanId, type, gold = 0) {
        const doer = this.game.getBusho(doerId);
        const relation = this.game.getRelation(doer.clan, targetClanId);
        let msg = "";
        const isPlayerInvolved = (doer.clan === this.game.playerClanId || targetClanId === this.game.playerClanId);

        if (type === 'goodwill') {
            const baseBonus = (gold / 100) + (doer.diplomacy + doer.charm) * 0.1;
            const increase = Math.floor(baseBonus * (0.8 + Math.random() * 0.4));
            relation.friendship = Math.min(100, relation.friendship + increase);
            const castle = this.game.getCastle(doer.castleId); 
            if(castle) castle.gold -= gold;
            msg = `${doer.name}が親善を行いました。\n友好度が${increase}上昇しました`;
        } else if (type === 'alliance') {
            const chance = relation.friendship + doer.diplomacy;
            if (chance > 120 && Math.random() > 0.3) {
                relation.alliance = true;
                msg = `同盟の締結に成功しました！`;
            } else {
                relation.friendship = Math.max(0, relation.friendship - 10);
                msg = `同盟の締結に失敗しました……`;
            }
        } else if (type === 'break_alliance') {
            relation.alliance = false;
            relation.friendship = Math.max(0, relation.friendship - 60);
            msg = `同盟を破棄しました。`;
        }
        
        doer.isActionDone = true;
        if (isPlayerInvolved) {
            this.game.ui.showResultModal(msg);
            if (doer.clan === this.game.playerClanId) {
                this.game.ui.updatePanelHeader();
                this.game.ui.renderCommandMenu();
            }
        }
    }

    executeHeadhunt(doerId, targetBushoId, gold) {
        const doer = this.game.getBusho(doerId);
        const target = this.game.getBusho(targetBushoId);
        const castle = this.game.getCurrentTurnCastle();
        if (castle.gold < gold) { alert("資金が足りません"); return; }
        castle.gold -= gold;
        const targetLord = this.game.bushos.find(b => b.clan === target.clan && b.isDaimyo) || { affinity: 50 }; 
        const newLord = this.game.bushos.find(b => b.clan === this.game.playerClanId && b.isDaimyo) || { affinity: 50 }; 
        const isSuccess = GameSystem.calcHeadhunt(doer, target, gold, targetLord, newLord);
        if (isSuccess) {
            const oldCastle = this.game.getCastle(target.castleId);
            if(oldCastle) {
                oldCastle.samuraiIds = oldCastle.samuraiIds.filter(id => id !== target.id);
                if (target.isCastellan) { target.isCastellan = false; oldCastle.castellanId = 0; }
            }
            target.clan = this.game.playerClanId; target.castleId = castle.id; target.loyalty = 50; target.isActionDone = true; castle.samuraiIds.push(target.id);
            this.game.ui.showResultModal(`${doer.name}の引抜工作が成功！\n${target.name}が我が軍に加わりました！`);
        } else {
            this.game.ui.showResultModal(`${doer.name}の引抜工作は失敗しました……\n${target.name}は応じませんでした。`);
        }
        doer.isActionDone = true; this.game.ui.updatePanelHeader(); this.game.ui.renderCommandMenu();
    }

    executeReward(bushoId, gold) {
        const target = this.game.getBusho(bushoId);
        const daimyo = this.game.bushos.find(b => b.id === this.game.clans.find(c => c.id === this.game.playerClanId).leaderId);
        const castle = this.game.getCurrentTurnCastle();
        if(castle.gold < gold) { alert("金が足りません"); return; }
        castle.gold -= gold;
        const effect = GameSystem.calcRewardEffect(gold, daimyo, target);
        target.loyalty = Math.min(100, target.loyalty + effect);
        // ★修正: 褒美では行動済みにしない
        
        let msg = "";
        if (effect > 5) msg = `「ありがたき幸せ！」\n忠誠が${effect}上がりました。`;
        else if (effect > 0) msg = `「はっ、頂戴いたします。」\n忠誠が${effect}上がりました。`;
        else msg = `「……。」(不満があるようだ)\n忠誠は上がりませんでした。`;
        this.game.ui.showResultModal(`${target.name}に金${gold}を与えました。\n${msg}`);
        this.game.ui.updatePanelHeader(); this.game.ui.renderCommandMenu();
    }

    executeInterviewStatus(busho) {
        const inno = busho.innovation;
        let msg = "";
        if (inno > 80) msg += "「最近のやり方は少々古臭い気がしますな。もっと新しいことをせねば。」<br>";
        else if (inno < 20) msg += "「古き良き伝統を守ることこそ肝要です。」<br>";
        else msg += "「特に不満はありません。順調です。」<br>";
        msg += `<br><button class='btn-secondary' onclick='window.GameApp.ui.reopenInterviewModal(window.GameApp.getBusho(${busho.id}))'>戻る</button>`;
        this.game.ui.showResultModal(msg);
    }

    executeInterviewTopic(interviewer, target) {
        const dist = GameSystem.calcValueDistance(interviewer, target);
        let comment = "";
        
        if (interviewer.id === target.id) {
            if (interviewer.ambition > 80) comment = "「俺の力を持ってすれば、天下も夢ではない……はずだ。」";
            else if (interviewer.personality === 'cautious') comment = "「慎重に行かねば、足元をすくわれよう。」";
            else comment = "「今のところは順調か……いや、油断はできん。」";
        }
        else if (target.isDaimyo && target.clan === this.game.playerClanId) {
            const loyalty = interviewer.loyalty;
            const aff = GameSystem.calcAffinityDiff(interviewer.affinity, target.affinity); 
            if (loyalty < 40 || aff > 30) comment = "「……。」(口を閉ざしている。あまり良く思われていないようだ)";
            else if (loyalty > 80 && aff < 15) comment = "「殿には心より感謝しております。この身尽きるまでお仕えする所存！」";
            else comment = "「殿のご采配、頼もしく思っております。」";
        }
        else {
             if (interviewer.isDaimyo && interviewer.clan === this.game.playerClanId) {
                if (dist < 15) comment = "（あやつとは気が合う。頼りになる男よ。）";
                else if (dist < 30) comment = "（まあ、悪くはない。使いどころ次第だろう。）";
                else if (dist < 50) comment = "（少し考えが合わんところがあるな。）";
                else if (dist < 70) comment = "（どうも好かん。腹の底が読めぬわ。）";
                else comment = "（あやつは生理的に受け付けん。顔も見たくないわ。）";
             } else {
                if (dist < 15) comment = "「あの方とは意気投合します。素晴らしいお方です。」";
                else if (dist < 30) comment = "「話のわかる相手だと思います。信頼できます。」";
                else if (dist < 50) comment = "「悪くはありませんが、時折意見が食い違います。」";
                else if (dist < 70) comment = "「考え方がどうも合いません。理解に苦しみます。」";
                else comment = "「あやつとは反りが合いません。顔も見たくない程です。」";
             }
        }
        
        const isMonologue = interviewer.isDaimyo && interviewer.clan === this.game.playerClanId;
        const targetCall = isMonologue ? `${target.name}か……` : `${target.name}殿ですか……`;
        
        const returnScript = `window.GameApp.ui.reopenInterviewModal(window.GameApp.getBusho(${interviewer.id}))`;
        this.game.ui.showResultModal(`<strong>${interviewer.name}</strong><br>「${targetCall}」<br><br>${comment}<br><br><button class='btn-secondary' onclick='${returnScript}'>戻る</button>`);
    }

    executeTransport(bushoIds, targetId, vals) {
        const c = this.game.getCurrentTurnCastle(); const t = this.game.getCastle(targetId);
        if(vals.soldiers > 0) { t.training = GameSystem.calcWeightedAvg(t.training, t.soldiers, c.training, vals.soldiers); t.morale = GameSystem.calcWeightedAvg(t.morale, t.soldiers, c.morale, vals.soldiers); }
        c.gold -= vals.gold; c.rice -= vals.rice; c.soldiers -= vals.soldiers; t.gold += vals.gold; t.rice += vals.rice; t.soldiers += vals.soldiers;
        const busho = this.game.getBusho(bushoIds[0]); busho.isActionDone = true;
        this.game.ui.showResultModal(`${busho.name}が${t.name}へ物資を輸送しました`); this.game.ui.updatePanelHeader(); this.game.ui.renderCommandMenu();
    }

    executeAppointGunshi(bushoId) { const busho = this.game.getBusho(bushoId); const oldGunshi = this.game.bushos.find(b => b.clan === this.game.playerClanId && b.isGunshi); if (oldGunshi) oldGunshi.isGunshi = false; busho.isGunshi = true; this.game.ui.showResultModal(`${busho.name}を軍師に任命しました`); this.game.ui.updatePanelHeader(); this.game.ui.renderCommandMenu(); }

    executeIncite(doerId, targetId) { const doer = this.game.getBusho(doerId); const target = this.game.getCastle(targetId); const result = GameSystem.calcIncite(doer); if(result.success) { target.loyalty = Math.max(0, target.loyalty - result.val); this.game.ui.showResultModal(`${doer.name}の扇動が成功！\n${target.name}の民忠が${result.val}低下しました`); } else { this.game.ui.showResultModal(`${doer.name}の扇動は失敗しました`); } doer.isActionDone = true; this.game.ui.updatePanelHeader(); this.game.ui.renderCommandMenu(); }

    executeRumor(doerId, castleId, targetBushoId) { const doer = this.game.getBusho(doerId); const targetBusho = this.game.getBusho(targetBushoId); const result = GameSystem.calcRumor(doer, targetBusho); if(result.success) { targetBusho.loyalty = Math.max(0, targetBusho.loyalty - result.val); this.game.ui.showResultModal(`${doer.name}の流言が成功！\n${targetBusho.name}の忠誠が${result.val}低下しました`); } else { this.game.ui.showResultModal(`${doer.name}の流言は失敗しました`); } doer.isActionDone = true; this.game.ui.updatePanelHeader(); this.game.ui.renderCommandMenu(); }

    executeTrade(type, amount) {
        const castle = this.game.getCurrentTurnCastle(); const rate = this.game.marketRate;
        if(type === 'buy') { const cost = Math.floor(amount * rate); if(castle.gold < cost) { alert("資金不足"); return; } castle.gold -= cost; castle.rice += amount; this.game.ui.showResultModal(`兵糧${amount}を購入しました\n(金-${cost})`); } else { if(castle.rice < amount) { alert("兵糧不足"); return; } const gain = Math.floor(amount * rate); castle.rice -= amount; castle.gold += gain; this.game.ui.showResultModal(`兵糧${amount}を売却しました\n(金+${gain})`); }
        this.game.ui.updatePanelHeader(); this.game.ui.renderCommandMenu();
    }

    executeDraft(bushoIds, gold) { 
        const castle = this.game.getCurrentTurnCastle(); 
        if(castle.gold < gold) { alert("資金不足"); return; } 
        castle.gold -= gold; 
        const busho = this.game.getBusho(bushoIds[0]); 
        const soldiers = GameSystem.calcDraftFromGold(gold, busho, castle.population); 
        const newMorale = Math.max(0, castle.morale - 10); 
        const newTraining = Math.max(0, castle.training - 10); 
        
        castle.training = GameSystem.calcWeightedAvg(castle.training, castle.soldiers, newTraining, soldiers); 
        castle.morale = GameSystem.calcWeightedAvg(castle.morale, castle.soldiers, newMorale, soldiers); 
        castle.soldiers += soldiers; 
        busho.isActionDone = true; 
        this.game.ui.showResultModal(`${busho.name}が徴兵を行いました\n兵士+${soldiers}`); 
        this.game.ui.updatePanelHeader(); this.game.ui.renderCommandMenu();
    }

    executeCharity(bushoIds, type) { 
        const castle = this.game.getCurrentTurnCastle(); 
        const busho = this.game.getBusho(bushoIds[0]); 
        let costGold = 0, costRice = 0; 
        if (type === 'gold' || type === 'both') costGold = 300; 
        if (type === 'rice' || type === 'both') costRice = 300; 
        
        if (castle.gold < costGold || castle.rice < costRice) { alert("物資不足"); return; } 
        castle.gold -= costGold; castle.rice -= costRice; 
        
        const val = GameSystem.calcCharity(busho, type); 
        castle.loyalty = Math.min(1000, castle.loyalty + val); 
        busho.isActionDone = true; 
        this.game.ui.showResultModal(`${busho.name}が施しを行いました\n民忠+${val}`); 
        this.game.ui.updatePanelHeader(); this.game.ui.renderCommandMenu();
    }
}