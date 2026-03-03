/**
 * audio.js (Howler.js 豪華版 - 完全シームレスループ)
 */
class AudioManager {
    constructor() {
        // 演奏者を2人（bgm1, bgm2）用意します
        this.players = [null, null];
        this.currentPlayerIndex = 0;
        this.defaultVolume = 0.05;
    }

    playBGM(fileName, loopStart = 0) {
        // 全員一度止めます
        this.stopBGM();

        // 1人目の演奏者でスタート
        this.currentPlayerIndex = 0;
        this.players[0] = this._createPlayer(fileName, loopStart);
        this.players[0].play();
    }

    // 内部で使う「演奏者を作る」仕組み
    _createPlayer(fileName, loopStart) {
        const player = new window.Howl({
            src: [`data/music/bgm/${fileName}`],
            volume: this.defaultVolume,
            onplay: () => {
                // 曲の長さ（秒）を取得
                const duration = player.duration();
                // ループ地点の数秒前に「次の人、準備して！」というタイマーをセット
                const leadTime = 0.1; // 0.1秒だけ重ねる
                const checkInterval = (duration - leadTime) * 1000;

                setTimeout(() => {
                    if (this.players[this.currentPlayerIndex] === player) {
                        this._prepareNextLoop(fileName, loopStart);
                    }
                }, checkInterval);
            }
        });
        return player;
    }

    _prepareNextLoop(fileName, loopStart) {
        const nextIndex = 1 - this.currentPlayerIndex;
        
        // 2人目の演奏者を作成して再生
        this.players[nextIndex] = this._createPlayer(fileName, loopStart);
        this.players[nextIndex].seek(loopStart); // ループ地点から開始
        this.players[nextIndex].play();

        // 前の演奏者を0.1秒かけて静かに消して、その後さようならする
        const oldPlayer = this.players[this.currentPlayerIndex];
        oldPlayer.fade(this.defaultVolume, 0, 100);
        
        // ★ここから差し替え
        setTimeout(() => {
            oldPlayer.stop();   // 止まって！
            oldPlayer.unload(); // 楽器を片付けてお家に帰って！（メモリの掃除）
        }, 100);
        // ★ここまで差し替え

        this.currentPlayerIndex = nextIndex;
    }

    stopBGM() {
        this.players.forEach(p => { if (p) p.stop(); });
        this.players = [null, null];
    }

    setVolume(value) {
        this.defaultVolume = value;
        this.players.forEach(p => { if (p) p.volume(value); });
    }
}

window.AudioManager = new AudioManager();