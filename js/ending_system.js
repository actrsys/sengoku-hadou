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
            const clearMessage = "長きにわたる戦乱の世は終わり、\nついに日ノ本は統一された。\n\n太平の世が訪れたのである。\n\nここに、覇道は終わりを告げた――";
            
            // 3つ目の「true」が、スタッフロールを流す（天下統一）という合図です
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
            
            const overMessage = reasonMsg + "\n\n野望は潰え、歴史の波に飲まれた。\n\nここに、ひとつの物語が幕を閉じた……";
            
            // 3つ目の「false」が、スタッフロールを流さない（滅亡）という合図です
            await this.playEndingSequence("終焉", overMessage, false);
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

        // ★ 4. 天下統一（クリア）の時だけ、スタッフロールを流します！
        if (isClear) {
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
            
            // 文字が流れ終わった後、少し余韻を残します
            await new Promise(resolve => setTimeout(resolve, 2000));
        } else {
            // ★ ゲームオーバーの時はスタッフロールを飛ばして、少しだけ間を空けます
            await new Promise(resolve => setTimeout(resolve, 1000));
        }

        // 5. 画面が「真っ暗な状態のまま」、裏側をタイトル画面に切り替えます！
        this.game.ui.returnToTitle();

        // アニメーションの状態や文字をリセットしておきます
        staffRollContainer.style.transition = 'none';
        staffRollContainer.style.transform = 'translateY(0)';
        
        // 6. 裏側がタイトル画面になった状態で、ゆっくり暗転を解除します（フェードアウト）
        endingScreen.classList.remove('show');
        
        // 完全に明るくなるまで待ってから、エンディングの箱を片付けます
        await new Promise(resolve => setTimeout(resolve, 2000));
        endingScreen.classList.add('hidden');
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
            await this.processGameOver("人間五十年――");
            return true; // エンディングを迎えたという合図を返します
        }
        
        // どちらでもなければ、まだゲームは続きます
        return false;
    }
}