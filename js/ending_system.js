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
            if (window.AudioManager && typeof window.AudioManager.stopBGM === 'function') {
                window.AudioManager.stopBGM();
            }
            
            // 天下統一のメッセージ
            const clearMessage = "長きにわたる戦乱の世は終わり、\nついに日ノ本は統一された。\n\n太平の世が訪れたのである。\n\nここに、覇道は終わりを告げた――";
            
            // 3つ目の「true」が、スタッフロールを流す（天下統一）という合図です
            await this.playEndingSequence("天下統一", clearMessage, true);
        }
    }

    // ★ゲームオーバー（自勢力滅亡）の処理です
    async processGameOver(reasonMsg = "人間五十年――") {
        // 最後の武将の死と同時に自大名家が滅亡した場合も、時代終了を優先します。
        if (this.hasEraEnded()) {
            await this.processEraEnd();
            return;
        }
        await this._showGameOver(reasonMsg + "\n\n野望は潰え、歴史の波に飲まれた。\n\nここに、ひとつの物語が幕を閉じた……");
    }

    // 天下統一に至らぬまま時代が終わった場合。通常の滅亡とは結末を分け、演出は共有します。
    async processEraEnd() {
        await this._showGameOver("天下を統べる者が現れぬまま、\n長い年月が過ぎ去った。\n\n戦国武将たちの時代は終わりを告げ、\n彼らの名は歴史の波に埋もれていった……\n\nここに、ひとつの物語が幕を閉じた――");
    }

    async _showGameOver(message) {
        if (!this.game.ui) return;
        if (window.AudioManager && typeof window.AudioManager.stopBGM === 'function') {
            window.AudioManager.stopBGM();
        }
        await this.playEndingSequence("終焉", message, false);
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

        // ロード画面より手前で暗転させます。hiddenを外した瞬間から入力遮断します。
        endingScreen.style.zIndex = '99999';
        const app = document.getElementById('app');
        const activeElement = document.activeElement;
        if (activeElement && typeof activeElement.blur === 'function') activeElement.blur();
        if (app) {
            app.inert = true;
            app.style.pointerEvents = 'none';
        }

        // 1. 短い暗転。2秒の待ち時間を廃止し、演出と入力遮断を同時に開始します。
        endingScreen.classList.remove('hidden');
        await this.game.ui.waitForNextPaint();
        endingScreen.classList.add('show');
        await new Promise(resolve => setTimeout(resolve, 700));

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
            staffHtml += `<div class="staff-roll-end-spacer"></div>`;
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
            // ゲームオーバーはスタッフロールを流さず、短い余韻だけ置きます。
            await new Promise(resolve => setTimeout(resolve, 500));
        }

        // 5. 暗転からロード画面へ受け渡してタイトルを準備します。
        // 黒幕の裏でロード画面を出した後、黒幕だけを短く退かせるので処理中であることが見えます。
        this.game.ui.showLoadingScreen('タイトル画面へ戻っています', 5);
        await this.game.ui.waitForNextPaint();

        // アニメーションの状態や文字をリセットしておきます。
        staffRollContainer.style.transition = 'none';
        staffRollContainer.style.transform = 'translateY(0)';
        titleEl.classList.remove('show');
        msgEl.classList.remove('show');

        endingScreen.style.transition = 'opacity 0.3s ease-out';
        endingScreen.classList.remove('show');
        await new Promise(resolve => setTimeout(resolve, 300));
        endingScreen.classList.add('hidden');

        // ロード画面が見えている状態でタイトルへの掃除・セーブ確認を完了させます。
        // 万一タイトル準備で例外が出ても、入力禁止状態だけは残さないようfinallyで解除します。
        try {
            await this.game.ui.returnToTitle({ loadingAlreadyVisible: true });
        } finally {
            endingScreen.style.transition = '';
            if (app) {
                app.inert = false;
                app.style.pointerEvents = '';
            }
        }
    }

    // 月末チェックと滅亡時の即時終了から共通参照する、戦国の時代の終了条件。
    hasEraEnded() {
        if (this.game.year >= GameConfig.Ending.EndYear) return true;
        // 未登場でも今後登場する武将がいる間は終わらせません（9999年は登場しないダミー）。
        return !this.game.bushos.some(b =>
            !b.isAutoLeader && (
                window.LifeStatusRules.isPresent(b) ||
                (window.LifeStatusRules.isUnborn(b) && b.startYear > this.game.year && b.startYear < 9999)
            )
        );
    }

    // ★毎月の終わりなどに呼ばれる、クリア・ゲームオーバーの総合チェックです
    async checkEnding() {
        // 観戦中も同じ条件を使い、時代終了は通常の天下統一より先に判定します。
        if (this.hasEraEnded()) {
            await this.processEraEnd();
            return true;
        }

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