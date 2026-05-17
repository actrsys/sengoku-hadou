/**
 * gunshi_system.js
 * 軍師によるアドバイスや報告を管理するシステム
 */
class GunshiSystem {
    constructor(game) {
        this.game = game;
        // 今月すでにアドバイスしたかどうかの印
        this.hasShownAdviceThisMonth = false;
    }

    // 月が替わったときに呼ばれる処理
    onStartMonth() {
        // 月初めに印をリセットします
        this.hasShownAdviceThisMonth = false;
    }

    // ターン開始時に不満をチェックして報告する処理
    checkAndShowAdvice(castle, onComplete) {
        // すでに今月報告済みなら、何もしないで次に進む
        if (this.hasShownAdviceThisMonth) {
            if (onComplete) onComplete();
            return;
        }

        // 自分の軍師を探す
        const gunshi = this.game.getClanGunshi(this.game.playerClanId);
        if (!gunshi) {
            if (onComplete) onComplete(); // 軍師がいなければ次に進む
            return;
        }

        // ここを通ったら「今月は報告した」という印をつける
        this.hasShownAdviceThisMonth = true;

        // 不満を持つ武将をリストアップ（大名や諸勢力は除く）
        const unhappyBushos = this.game.bushos.filter(b => 
            b.clan === this.game.playerClanId && 
            b.status === 'active' && 
            !b.isDaimyo &&
            b.belongKunishuId === 0 &&
            (b.loyalty <= 74 || (b.recognitionNeed || 0) >= 30)
        );

        // 不満を持っている人がいた場合
        if (unhappyBushos.length > 0) {
            const gunshiIsUnhappy = unhappyBushos.some(b => b.id === gunshi.id);
            const othersUnhappy = unhappyBushos.filter(b => b.id !== gunshi.id);

            let msg = "";
            // 軍師自身が不満を持っている場合
            if (gunshiIsUnhappy) {
                msg += `「殿、恐れながら申し上げます。一族郎党を養う為にも、温情あるご配慮を賜りたく存じます」<br>`;
            }
            // 他の武将が不満を持っている場合
            if (othersUnhappy.length > 0) {
                const names = othersUnhappy.slice(0, 2).map(b => b.name).join("殿や");
                const etc = othersUnhappy.length > 2 ? "殿ら、数名" : "殿";
                
                if (gunshiIsUnhappy) {
                    msg += `<br>「また、${names}${etc}の不満が溜まる前に、厚き処遇を願います」`;
                } else {
                    msg += `「殿、${names}${etc}の不満が溜まる前に、厚き処遇を願います」`;
                }
            }

            // ダイアログを表示して、閉じたら(onComplete)次に進む
            this.game.ui.showDialog(msg, false, onComplete, null, {
                leftFace: gunshi.faceIcon,
                leftName: gunshi.name
            });
        } else {
            // 不満な人がいなければ、そのまま次に進む
            if (onComplete) onComplete();
        }
    }
    // ==========================================
    // ★コマンド実行前のアドバイスを表示する魔法です
    showCommandAdvice(action, onConfirm) {
        // 戦争のアドバイスがあれば、それを優先して表示します
        if (action.type === 'war' || this.game.warManager.state.active) {
            const warAdvice = this.game.warManager.getGunshiAdvice(action);
            if (warAdvice) {
                const gunshi = this.game.getClanGunshi(this.game.playerClanId);
                // ui.js の小窓を開く魔法を呼び出します
                this.game.ui.openGunshiModal(gunshi, warAdvice, onConfirm);
                return;
            }
        }

        // アドバイスが要らないコマンドの場合は、すぐに実行(onConfirm)します
        const spec = this.game.commandSystem.getSpecs()[action.type];
        if (spec && spec.hasAdvice === false) {
             onConfirm();
             return;
        }

        // 自分の軍師を探します（いなければすぐに実行します）
        const gunshi = this.game.getClanGunshi(this.game.playerClanId); 
        if (!gunshi) { onConfirm(); return; }
        
        // 秘密の番号（シード）を作って、アドバイスのメッセージを作ります
        const seed = this.game.year * 100 + this.game.month + (action.type.length) + (action.targetId || 0) + (action.val || 0);
        const msg = this.getAdviceMessage(gunshi, action, seed);
        
        // ui.js の小窓を開く魔法を呼び出します
        this.game.ui.openGunshiModal(gunshi, msg, onConfirm);
    }

    // ★軍師の賢さによって、言うこと（予測）が変わる魔法です
    getAdviceMessage(gunshi, action, seed) { 
        // 従属願の場合は専用のメッセージを返します
        if (action.type === 'subordinate') {
            return "何かしらの見返りを要求されるでしょう。";
        }

        // 実際の成功確率を受け取ります（無い場合は絶対に成功するコマンドとして扱います）
        let trueProb = action.trueProb !== undefined ? action.trueProb : 1.0;
        
        // ★追加：もし確率が「0〜100（パーセント）」の数字で届いた場合は、「0.0〜1.0」の形に直してあげます！
        if (trueProb > 1.0) {
            trueProb = trueProb / 100;
        }
        
        // 正確さを計算します（智謀95以上で最大0.99になります）
        let accuracy = 0.5 + (gunshi.intelligence / 95) * 0.49;
        if (accuracy > 0.99 || gunshi.intelligence >= 95) accuracy = 0.99;

        // 推測がどれくらいブレるかの幅を決めます
        const maxError = 1.0 - accuracy;
        
        // ランダムなノイズ（-1.0 〜 +1.0）を作ってブレさせます
        // ※ GameSystem.seededRandom を使うようにしました
        const noise = (GameSystem.seededRandom(seed) - 0.5) * 2;
        let perceivedProb = trueProb + noise * maxError;
        perceivedProb = Math.max(0.0, Math.min(1.0, perceivedProb));

        if (perceivedProb > 0.95) return "必ずや成功するでしょう。好機です！"; 
        if (perceivedProb > 0.7) return "おそらく上手くいくでしょう。"; 
        if (perceivedProb > 0.4) return "五分五分といったところです。油断めさるな。"; 
        if (perceivedProb > 0.15) return "厳しい結果になるかもしれません。"; 
        return "おやめください。失敗する未来が見えます。"; 
    }
}