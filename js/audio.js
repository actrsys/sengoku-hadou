/**
 * audio.js (Howler.js 豪華版 - 完全シームレスループ ＋ 効果音対応)
 */
class AudioManager {
    constructor() {
        // BGM用の演奏者を2人（bgm1, bgm2）用意します
        this.players = [null, null];
        this.currentPlayerIndex = 0;
        this.defaultVolume = 0.05;
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
                const duration = player.duration();
                const leadTime = 0.1;
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
        
        this.players[nextIndex] = this._createPlayer(fileName, loopStart);
        this.players[nextIndex].seek(loopStart);
        this.players[nextIndex].play();

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

    setVolume(value) {
        this.defaultVolume = value;
        this.players.forEach(p => { if (p) p.volume(value); });
    }

    // ==========================================
    // ★ ここから新しく追加！効果音（SE）を鳴らす仕組み
    // ==========================================
    playSE(fileName) {
        // SE用の新しい演奏者をその都度作って、鳴らします
        const se = new window.Howl({
            // あや瀨さんのご要望通り、se フォルダを見に行くように設定しています！
            src: [`data/music/se/${fileName}`], 
            volume: this.defaultVolume // BGMと同じ音量にしています
        });
        se.play();
    }
}

window.AudioManager = new AudioManager();