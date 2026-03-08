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

        // 不満を持つ武将をリストアップ（大名や国人衆は除く）
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
                msg += `「殿、恐れながら申し上げます。某（それがし）の待遇について、少々不満が溜まっておりますぞ。早急な改善をお願いしたく存じます。」<br>`;
            }
            // 他の武将が不満を持っている場合
            if (othersUnhappy.length > 0) {
                const names = othersUnhappy.slice(0, 2).map(b => b.name).join("殿や");
                const etc = othersUnhappy.length > 2 ? "殿ら、数名" : "殿";
                
                if (gunshiIsUnhappy) {
                    msg += `<br>「また、${names}${etc}にも不満が溜まっているようです。寝返りや出奔を招く前に、褒美を出して報いてやるべきかと。」`;
                } else {
                    msg += `「殿、${names}${etc}に不満が溜まっているようです。寝返りや出奔を招く前に、褒美を出して報いてやるべきかと。」`;
                }
            }

            // ダイアログを表示して、閉じたら(onComplete)次に進む
            this.game.ui.showDialog(`<strong>${gunshi.name}</strong><br><br>${msg}`, false, onComplete);
        } else {
            // 不満な人がいなければ、そのまま次に進む
            if (onComplete) onComplete();
        }
    }
}