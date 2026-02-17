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
        
        // 仕様変更: 数値は隠蔽し、ニュアンスで伝える
        // 忠誠が既にMAXの場合は上げないが金は消費し、特別なメッセージを出す
        let msg = "";
        
        if (target.loyalty >= 100) {
            // 既に上限の場合
            msg = "「もったいなきお言葉。この身、命尽きるまで殿のために！」\n(これ以上の忠誠は望めないほど、心服しているようだ)";
        } else {
            // 通常の上昇処理
            target.loyalty = Math.min(100, target.loyalty + effect);
            
            if (effect > 8) {
                msg = "「ありがたき幸せ！」\n(顔をほころばせ、深く感謝しているようだ)";
            } else if (effect > 0) {
                msg = "「はっ、頂戴いたします。」\n(恭しく受け取った)";
            } else {
                msg = "「……。」\n(不満があるようだ)";
            }
        }

        // 仕様変更: 褒美を与えても行動済みにはしない
        // target.isActionDone = true;
        
        this.game.ui.showResultModal(`${target.name}に金${gold}を与えました。\n${msg}`);
        this.game.ui.updatePanelHeader(); this.game.ui.renderCommandMenu();
    }

    executeInterviewStatus(busho) {
        // 仕様変更: 忠誠度を5段階で表示。ただし知略が高い武将は偽る。
        // 乱数なしの決定論的ロジック
        
        let perceivedLoyalty = busho.loyalty;
        
        // 知略による偽装判定
        // 知略が高く、かつ忠誠が低い場合、忠誠が高いように振る舞う
        if (busho.intelligence >= 85 && busho.loyalty < 80) {
            // 非常に賢い場合、かなり高く見せる
            perceivedLoyalty = Math.max(perceivedLoyalty, 90);
        } else if (busho.intelligence >= 70 && busho.loyalty < 60) {
            // まあまあ賢い場合、そこそこ高く見せる
            perceivedLoyalty = Math.max(perceivedLoyalty, 70);
        }

        let msg = "";
        // 忠誠度に応じた5段階の反応
        if (perceivedLoyalty >= 85) {
            msg += "「殿の御恩、片時も忘れたことはありませぬ。この身は殿のために。」<br>(強い忠誠心を感じる)";
        } else if (perceivedLoyalty >= 65) {
            msg += "「家中はよく治まっております。何も心配なさりませぬよう。」<br>(順調に務めを果たしているようだ)";
        } else if (perceivedLoyalty >= 45) {
            msg += "「特に不満はありません。与えられた役目は果たします。」<br>(態度は普通だ)";
        } else if (perceivedLoyalty >= 25) {
            msg += "「……少し、待遇を見直してはいただけませぬか。」<br>(不満があるようだ)";
        } else {
            msg += "「……。」(目を合わせようとしない)<br>(危険な気配を感じる)";
        }

        msg += `<br><br><button class='btn-secondary' onclick='window.GameApp.ui.reopenInterviewModal(window.GameApp.getBusho(${busho.id}))'>戻る</button>`;
        this.game.ui.showResultModal(msg);
    }

    executeInterviewTopic(interviewer, target) {
        // 仕様変更: 相性に加えて、対象の忠誠度についても聞くことができる。
        // 乱数なし。能力値と関係性による決定論的ロジック。
        
        // 自分自身（大名）について聞くことはUI側で制限されている前提だが、
        // 念のためロジック内では「面談者自身の独り言」処理を維持しつつ、他者評価ロジックを追加。

        if (interviewer.id === target.id) {
            let comment = "";
            if (interviewer.ambition > 80) comment = "「俺の力を持ってすれば、天下も夢ではない……はずだ。」";
            else if (interviewer.personality === 'cautious') comment = "「慎重に行かねば、足元をすくわれよう。」";
            else comment = "「今のところは順調か……いや、油断はできん。」";
            
            const returnScript = `window.GameApp.ui.reopenInterviewModal(window.GameApp.getBusho(${interviewer.id}))`;
            this.game.ui.showResultModal(`<strong>${interviewer.name}</strong><br>「${target.name}か……」<br><br>${comment}<br><br><button class='btn-secondary' onclick='${returnScript}'>戻る</button>`);
            return;
        }

        // --- 他者についての評価ロジック ---
        
        const dist = GameSystem.calcValueDistance(interviewer, target); // 相性の良さ（低いほど良い）
        const affinityDiff = GameSystem.calcAffinityDiff(interviewer.affinity, target.affinity); // 純粋な相性差（0-50）
        
        // 基本コメント（相性について）
        let affinityComment = "";
        if (dist < 15) affinityComment = "「あの方とは意気投合します。素晴らしいお方です。」";
        else if (dist < 30) affinityComment = "「話のわかる相手だと思います。信頼できます。」";
        else if (dist < 50) affinityComment = "「悪くはありませんが、時折意見が食い違います。」";
        else if (dist < 70) affinityComment = "「考え方がどうも合いません。理解に苦しみます。」";
        else affinityComment = "「あやつとは反りが合いません。顔も見たくない程です。」";

        // 忠誠度評価コメント
        let loyaltyComment = "";
        
        // 条件1: 面談者の忠誠度が低い場合 -> とぼける
        if (interviewer.loyalty < 40) {
            loyaltyComment = "「さあ……他人の腹の内など、某には分かりかねます。」(関わり合いを避けているようだ)";
        }
        // 条件2: 対象との仲が非常に悪い場合 -> 交流がない、または嘘をつく
        else if (affinityDiff > 35) { // 相性差が大きい
            // 条件3: 仲が悪く、かつ面談者の知略が高い -> 嘘をついて貶める
            if (interviewer.intelligence >= 80) {
                loyaltyComment = "「あやつは危険です。裏で妙な動きをしているとの噂も……。」(低い声で告げ口をした)";
            } else {
                loyaltyComment = "「あやつとは口もききませぬゆえ、何も存じませぬ。」(吐き捨てるように言った)";
            }
        }
        // 条件4: 対象の知略が高く、面談者の知略が及ばない場合 -> 防御される
        else if (target.intelligence > interviewer.intelligence + 20) {
            loyaltyComment = "「あの方は隙を見せませぬ。本心は深い霧の中です。」(読み取れないようだ)";
        }
        // 条件5: 通常評価 (面談者の忠誠と義理が高いほど正確…という要件だが、乱数無しなのでストレートに評価させる)
        else {
            const tLoyalty = target.loyalty;
            if (tLoyalty >= 85) loyaltyComment = "「殿への忠義は本物でしょう。疑う余地もありません。」";
            else if (tLoyalty >= 65) loyaltyComment = "「不審な点はありませぬ。真面目に務めております。」";
            else if (tLoyalty >= 45) loyaltyComment = "「今のところは大人しくしておりますが……。」";
            else if (tLoyalty >= 25) loyaltyComment = "「近頃、何やら不満を漏らしているようです。」";
            else loyaltyComment = "「油断なりませぬ。野心を抱いている気配があります。」";
        }

        const targetCall = `${target.name}殿ですか……`;
        const returnScript = `window.GameApp.ui.reopenInterviewModal(window.GameApp.getBusho(${interviewer.id}))`;
        
        this.game.ui.showResultModal(`<strong>${interviewer.name}</strong><br>「${targetCall}」<br><br><strong>【相性】</strong><br>${affinityComment}<br><br><strong>【忠誠の噂】</strong><br>${loyaltyComment}<br><br><button class='btn-secondary' onclick='${returnScript}'>戻る</button>`);
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