/**
 * ending_system.js
 * ゲームクリア（天下統一）やゲームオーバー（滅亡）を一元管理するシステムです。
 */

class EndingSystem {
    constructor(game) {
        this.game = game;
    }

    // ★ゲームクリア（天下統一）の処理です
    async processGameClear() {
        if (this.game.ui) {
            // これまでのBGMを止めます
            if (window.AudioManager && typeof window.AudioManager.stopBgm === 'function') {
                window.AudioManager.stopBgm();
            }
            
            // 天下統一のメッセージ
            const clearMessage = "長きにわたる戦乱の世は終わりを告げた。\n\n我が大名家は日ノ本を統一し、\n天下に太平の世をもたらしたのである。\n\n――戦国覇道、ここに完結。";
            await this.playEndingSequence("天下統一", clearMessage, true);
        }
    }

    // ★ゲームオーバー（自勢力滅亡）の処理です
    async processGameOver(reasonMsg = "我が大名家は滅亡しました……") {
        if (this.game.ui) {
            // これまでのBGMを止めます
            if (window.AudioManager && typeof window.AudioManager.stopBgm === 'function') {
                window.AudioManager.stopBgm();
            }
            
            const overMessage = reasonMsg + "\n\n野望は潰え、歴史の波に飲まれていった。\n\n――ここに、一つの物語が幕を閉じる。";
            await this.playEndingSequence("無念", overMessage, false);
        }
    }

    // ★エンディングやゲームオーバーの演出（アニメーションの順番）を管理する魔法です
    async playEndingSequence(titleText, messageText, isClear) {
        const endingScreen = document.getElementById('ending-screen');
        const titleEl = document.getElementById('ending-title');
        const msgEl = document.getElementById('ending-message');
        const staffRollContainer = document.getElementById('staff-roll-container');
        const staffRollContent = document.getElementById('staff-roll-content');
        
        // 万が一HTMLが見つからなかった時のための安全装置です
        if (!endingScreen || !titleEl || !msgEl || !staffRollContainer || !staffRollContent) {
            this.game.ui.returnToTitle();
            return;
        }

        // 1. 画面をゆっくり暗転させます（フェードイン）
        endingScreen.classList.remove('hidden');
        // 一瞬だけ待つことで、CSSの「2秒かけて暗くする魔法」を確実に発動させます
        await new Promise(resolve => setTimeout(resolve, 50));
        endingScreen.classList.add('show');
        
        // 完全に画面が真っ暗になるまで待ちます（2秒）
        await new Promise(resolve => setTimeout(resolve, 2000));

        // 2. タイトルとメッセージをふわっと表示します
        titleEl.innerText = titleText;
        msgEl.innerText = messageText;
        
        titleEl.classList.add('show');
        await new Promise(resolve => setTimeout(resolve, 1500));
        
        msgEl.classList.add('show');
        
        // プレイヤーがメッセージを読めるように長めに待ちます（6秒）
        await new Promise(resolve => setTimeout(resolve, 6000));

        // 3. タイトルとメッセージをフェードアウトさせます
        titleEl.classList.remove('show');
        msgEl.classList.remove('show');
        
        // 文字が完全に消えるのを待ちます
        await new Promise(resolve => setTimeout(resolve, 2000));

        // 4. スタッフロールの準備と開始
        // ここを書き換えることで、スタッフ名や役職を自由に増やしたり減らしたりできます
        const staffData = [
            { role: "企画・ゲームデザイン", name: "あや瀨" },
            { role: "メインプログラマー", name: "あや瀨" },
            { role: "シナリオ・テキスト", name: "あや瀨" },
            { role: "テストプレイ・デバッグ", name: "あや瀨" },
            { role: "Special Thanks", name: "日ノ本を駆け抜けたすべての武将たち" },
            { role: "", name: "Thank you for playing!" }
        ];

        let staffHtml = "";
        staffData.forEach(item => {
            if (item.role) {
                staffHtml += `<div class="staff-role">${item.role}</div>`;
            }
            staffHtml += `<div class="staff-name">${item.name}</div>`;
        });
        
        // スタッフロールの最後に余白を作って、文字が画面外に消え切るようにします
        staffHtml += `<div style="height: 60vh;"></div>`;
        staffRollContent.innerHTML = staffHtml;

        // 下から上へ移動させるアニメーションの設定
        const rollDuration = 18; // スタッフロールが下から上へ流れ切るまでの時間（秒）
        staffRollContainer.style.transition = `transform ${rollDuration}s linear`;
        
        // 画面外（下）にセット
        staffRollContainer.style.transform = `translateY(0)`;
        
        await new Promise(resolve => setTimeout(resolve, 500)); // スクロール開始前の少しの溜め
        
        // 上に向かって移動させます
        const moveDistance = staffRollContent.offsetHeight + staffRollContainer.offsetHeight;
        staffRollContainer.style.transform = `translateY(-${moveDistance}px)`;

        // スクロールが完全に終わるまで待機します
        await new Promise(resolve => setTimeout(resolve, rollDuration * 1000));

        // 5. 少し余韻を残して、画面を暗くしたままタイトルへ戻ります
        await new Promise(resolve => setTimeout(resolve, 2000));

        // アニメーションの状態をリセットして、タイトルに戻る準備をします
        endingScreen.classList.remove('show');
        titleEl.classList.remove('show');
        msgEl.classList.remove('show');
        staffRollContainer.style.transition = 'none';
        staffRollContainer.style.transform = 'translateY(0)';
        
        // 暗転が明けるのを待ってから hidden に戻します
        await new Promise(resolve => setTimeout(resolve, 2000));
        endingScreen.classList.add('hidden');
        
        // 最後にタイトル画面へ戻ります
        this.game.ui.returnToTitle();
    }

    // ★毎月の終わりなどに呼ばれる、クリア・ゲームオーバーの総合チェックです
    async checkEnding() {
        // 生き残っている大名家を集めます
        const aliveClans = this.game.clans.filter(c => c.id !== 0 && !c.isDestroyed);
        // プレイヤーがその中にいるか確認します
        const playerAlive = aliveClans.some(c => c.id === this.game.playerClanId);
        
        // 残っているのが1家だけで、それがプレイヤーなら「天下統一」です！
        if (aliveClans.length === 1 && playerAlive) {
            await this.processGameClear();
            return true; // エンディングを迎えたという合図を返します
        } 
        // 観戦モードではなく、かつプレイヤーが生き残っていなければ「滅亡」です…
        else if (!this.game.isWatchMode && !playerAlive) {
            await this.processGameOver("我が大名家は滅亡しました……");
            return true; // エンディングを迎えたという合図を返します
        }
        
        // どちらでもなければ、まだゲームは続きます
        return false;
    }
}