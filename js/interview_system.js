/**
 * interview_system.js
 * 面談（interview）コマンドに関するロジックおよびUIフローを管理するクラス
 */

class InterviewSystem {
    constructor(game) {
        this.game = game;
    }

    // ----------------------------------------------------------------------
    // UI表示: 面談のメイン画面
    // ----------------------------------------------------------------------
    showInterviewModal(busho) {
        const currentYear = this.game.year;
        const castle = this.game.getCurrentTurnCastle();

        // 寿命間近の時の特別な処理
        if (currentYear >= (busho.endYear - 1)) {
            this.game.ui.showDialog(`${busho.name}は調子が悪そうだ。\n医師に診せますか？\n（消費：金２００）`, true, 
                () => {
                    if (castle.gold < 200) {
                        this.game.ui.showDialog("金が足りないため、医師を呼べませんでした……", false, () => {
                            this.renderNormalInterview(busho);
                        });
                        return; 
                    }

                    castle.gold -= 200;
                    busho.endYear = Number(busho.endYear) + 1;
                    this.game.ui.showResultModal(`${busho.name}は少し顔色が良くなったようです`);
                    
                    this.game.ui.updatePanelHeader();
                    this.game.ui.renderCommandMenu();
                },
                () => {
                    this.renderNormalInterview(busho);
                }
            );
            return; 
        }

        this.renderNormalInterview(busho);
    }

    renderNormalInterview(busho) {
        let msg = `「殿、どのようなご用件でしょうか？」`;
        let choices = [
            { label: "調子はどうだ", onClick: () => { this.executeInterviewStatus(busho); } },
            { label: "他者について聞く", onClick: () => { this.game.ui.openBushoSelector('interview_target', null, { interviewer: busho }); } },
            { label: "戻る", onClick: () => { this.reopenInterviewSelector(); } }
        ];
        
        this.game.ui.showDialog(msg, false, null, null, {
            leftFace: busho.faceIcon,
            leftName: busho.name,
            choices: choices,
            isInterview: true
        });
    }
    
    reopenInterviewSelector() { 
        this.game.ui.openBushoSelector('interview', null, {allowDone: true}); 
    }
    
    reopenInterviewModal(busho) {
        setTimeout(() => this.showInterviewModal(busho), 100);
    }

    // ----------------------------------------------------------------------
    // ロジック＆UI表示: 「調子はどうだ」の結果
    // ----------------------------------------------------------------------
    executeInterviewStatus(busho) {
        const inno = busho.innovation;
        let policyText = "";
        if (inno > 80) policyText = "最近のやり方は少々古臭い気がしますな。もっと新しいことをせねば。";
        else if (inno < 20) policyText = "古き良き伝統を守ることこそ肝要です。";
        else policyText = "当家のやり方に特に不満はありません。順調です。";
        
        let perceivedLoyalty = busho.loyalty;
        if (busho.intelligence >= 85 && busho.loyalty < 80) {
            perceivedLoyalty = Math.max(perceivedLoyalty, 90);
        } else if (busho.intelligence >= 70 && busho.loyalty < 60) {
            perceivedLoyalty = Math.max(perceivedLoyalty, 70);
        }

        let loyaltyText = "";
        let attitudeText = ""; 

        if (perceivedLoyalty >= 85) {
            loyaltyText = "身に余る御恩、片時も忘れたことはありませぬ。この身は殿のために。";
            attitudeText = "";
        } else if (perceivedLoyalty >= 65) {
            loyaltyText = "家中はよく治まっております。何も心配なさりませぬよう。";
            attitudeText = "";
        } else if (perceivedLoyalty >= 45) {
            loyaltyText = "特に不満はありません。与えられた役目は果たします。";
            attitudeText = "";
        } else if (perceivedLoyalty >= 25) {
            loyaltyText = "……少し、待遇を見直してはいただけませぬか。";
            attitudeText = "";
        } else {
            loyaltyText = "……";
            attitudeText = "(目を合わせようとしない。危険な気配を感じる。)";
        }

        const displayParts = [];
        displayParts.push(`「${policyText}<br>${loyaltyText}」`); 
        if (attitudeText) displayParts.push(attitudeText); 

        let msg = displayParts.filter(Boolean).join('<br>');
        
        this.game.ui.showDialog(msg, false, null, null, {
            leftFace: busho.faceIcon,
            leftName: busho.name,
            choices: [
                { label: "戻る", onClick: () => { this.reopenInterviewModal(busho); } }
            ]
        });
    }

    // ----------------------------------------------------------------------
    // ロジック＆UI表示: 「他者について聞く」の結果
    // ----------------------------------------------------------------------
    executeInterviewTopic(interviewer, target) {
        const dist = GameSystem.calcValueDistance(interviewer, target); 
        const affinityDiff = GameSystem.calcAffinityDiff(interviewer.affinity, target.affinity);
        
        let affinityText = "";
        if (dist < 15) affinityText = "あの方とは意気投合します。素晴らしいお方です。";
        else if (dist < 30) affinityText = "話のわかる相手だと思います。信頼できます。";
        else if (dist < 50) affinityText = "悪くはありませんが、時折意見が食い違います。";
        else if (dist < 70) affinityText = "考え方がどうも合いません。理解に苦しみます。";
        else affinityText = "あやつとは反りが合いません。顔も見たくない程です。";

        let loyaltyText = "";
        let togaki = ""; 

        if (interviewer.loyalty < 40) {
            loyaltyText = "さあ……？　他人の腹の内など某には量りかねます。";
            togaki = "";
        }
        else if (affinityDiff > 35) { 
            if (interviewer.intelligence >= 80) {
                loyaltyText = "あやつは危険です。裏で妙な動きをしているとの噂も……";
                togaki = "";
            } else {
                loyaltyText = "あやつとは口もききませぬゆえ、何も存じませぬ。";
                togaki = "";
            }
        }
        else if (target.intelligence > interviewer.intelligence + 20) {
            loyaltyText = "なかなか内心を見せぬお方です。";
            togaki = "";
        }
        else {
            const tLoyalty = target.loyalty;
            if (tLoyalty >= 85) loyaltyText = "殿への忠義は本物でしょう。疑う余地もありません。";
            else if (tLoyalty >= 65) loyaltyText = "不審な点はありませぬ。真面目に務めております。";
            else if (tLoyalty >= 45) loyaltyText = "今のところは大人しくしておりますが……";
            else if (tLoyalty >= 25) loyaltyText = "近頃、何やら不満を漏らしているようです。";
            else loyaltyText = "油断なりませぬ。野心を抱いている気配があります。";
        }

        const targetCall = `${target.name}殿ですか……`;
        const displayParts = [];
        displayParts.push(`「${targetCall}<br>${affinityText}<br>${loyaltyText}」`); 
        
        if (togaki) {
            displayParts.push(togaki); 
        }

        let msg = displayParts.filter(Boolean).join('<br>');
        
        this.game.ui.showDialog(msg, false, null, null, {
            leftFace: interviewer.faceIcon,
            leftName: interviewer.name,
            choices: [
                { label: "戻る", onClick: () => { this.reopenInterviewModal(interviewer); } }
            ]
        });
    }
}