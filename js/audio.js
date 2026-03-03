/**
 * audio.js (Howler.js 豪華版 - 完全シームレスループ ＋ 効果音対応)
 */
class AudioManager {
    constructor() {
        // BGM用の演奏者を2人（bgm1, bgm2）用意します
        this.players = [null, null];
        this.currentPlayerIndex = 0;
        this.defaultVolume = 0.05; // BGMの音量
        this.seVolume = 0.025;      // ★追加：SE専用の音量
    }

    // ==========================================
    // ★ BGMを鳴らす仕組み（今まで通りです）
    // ==========================================
    playBGM(fileName, loopStart = 0) {
        this.stopBGM();

        this.currentPlayerIndex = 0;
        this.players[0] = this._createPlayer(fileName, loopStart);
        this.players[0].play();
    }

    _createPlayer(fileName, loopStart) {
        const player = new window.Howl({
            src: [`data/music/bgm/${fileName}`],
            volume: this.defaultVolume,
            onplay: () => {
                // ★ ここから修正：ループの準備をする「魔法」を定義します
                const setupLoop = () => {
                    const duration = player.duration();
                    
                    // もし曲の長さがまだ「0」だったら、うまく測れていないので何もしません
                    if (duration === 0) return;

                    const leadTime = 0.1;
                    const checkInterval = (duration - player.seek() - leadTime) * 1000;

                    setTimeout(() => {
                        if (this.players[this.currentPlayerIndex] === player) {
                            this._prepareNextLoop(fileName, loopStart);
                        }
                    }, checkInterval);
                };

                // 曲の読み込みが終わっているかチェックします
                if (player.state() === 'loaded') {
                    // もう読み込めていたら、すぐにループの準備をします
                    setupLoop();
                } else {
                    // まだ読み込み中なら、終わった瞬間に準備をするように予約します
                    player.once('load', setupLoop);
                }
            }
        });
        return player;
    }

    _prepareNextLoop(fileName, loopStart) {
        const nextIndex = 1 - this.currentPlayerIndex;
        
        // 新しいプレイヤーを作ります
        this.players[nextIndex] = this._createPlayer(fileName, loopStart);
        const nextPlayer = this.players[nextIndex];

        // ★ここがポイント：読み込みが終わった瞬間に「loopStartの秒数」へジャンプさせます
        nextPlayer.once('load', () => {
            nextPlayer.seek(loopStart);
        });
        
        // 再生を開始！
        nextPlayer.play();

        const oldPlayer = this.players[this.currentPlayerIndex];
        oldPlayer.fade(this.defaultVolume, 0, 100);
        
        setTimeout(() => {
            oldPlayer.stop();
            oldPlayer.unload();
        }, 100);

        this.currentPlayerIndex = nextIndex;
    }

    stopBGM() {
        this.players.forEach(p => { if (p) p.stop(); });
        this.players = [null, null];
    }
    
    // BGMの音量を変える命令
    setVolume(value) {
        this.defaultVolume = value;
        this.players.forEach(p => { if (p) p.volume(value); });
    } // ← ここで一度ドアを閉めます！

    // SEの音量を変える命令（別の新しいお部屋として作ります）
    setSEVolume(value) {
        this.seVolume = value;
    }
    
    // ==========================================
    // ★ ここから新しく追加！効果音（SE）を鳴らす仕組み
    // ==========================================
    playSE(fileName) {
        // SE用の新しい演奏者をその都度作って、鳴らします
        const se = new window.Howl({
            src: [`data/music/se/${fileName}`], 
            volume: this.seVolume // ★ここを変更：SE専用の音量を使います！
        });
        se.play();
    }
}

window.AudioManager = new AudioManager();