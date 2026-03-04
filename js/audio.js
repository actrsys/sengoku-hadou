/**
 * audio.js (Howler.js 豪華版 - 完全シームレスループ ＋ 効果音対応)
 */
class AudioManager {
    constructor() {
        // BGM用の演奏者を2人（bgm1, bgm2）用意します
        this.players = [null, null];
        this.currentPlayerIndex = 0;
        this.defaultVolume = 0.02; // BGMの音量
        this.seVolume = 0.01;      // SE専用の音量
    }

    // ==========================================
    // ★ BGMを鳴らす仕組み
    // ==========================================
    playBGM(fileName, loopStart = 0) {
        this.stopBGM(); // 今鳴っている曲を止めます

        this.currentPlayerIndex = 0;
        // 最初の曲は「0秒」からスタートするよ、と教えます
        this.players[0] = this._createPlayer(fileName, loopStart, 0);
        this.players[0].play();
    }

    // ★ 曲の読み込みと、次に繋ぐ準備をする魔法
    _createPlayer(fileName, loopStart, currentStartPos = 0) {
        const player = new window.Howl({
            src: [`data/music/bgm/${fileName}`],
            volume: this.defaultVolume,
            onplay: () => {
                const setupLoop = () => {
                    const duration = player.duration();
                    
                    // もし曲の長さがまだ「0」だったら、少し待ってからもう一度長さを測り直します
                    if (duration === 0) {
                        setTimeout(setupLoop, 100);
                        return;
                    }

                    const leadTime = 0.1;
                    // スタート地点（currentStartPos）を使って、いつ次の曲を準備するか計算します
                    const checkInterval = (duration - currentStartPos - leadTime) * 1000;

                    // 念のため、前のタイマーが残っていたら消します
                    if(player._loopTimer) clearTimeout(player._loopTimer);

                    // 時間が来たら、次のループの準備を始めます
                    player._loopTimer = setTimeout(() => {
                        if (this.players[this.currentPlayerIndex] === player) {
                            this._prepareNextLoop(fileName, loopStart);
                        }
                    }, checkInterval);
                };

                if (player.state() === 'loaded') {
                    setupLoop();
                } else {
                    player.once('load', setupLoop);
                }
            },
            onstop: () => {
                // 途中で止められた時は、タイマーも一緒に止めます
                if (player._loopTimer) clearTimeout(player._loopTimer);
            }
        });
        return player;
    }

    // ★ 次のループへジャンプする魔法
    _prepareNextLoop(fileName, loopStart) {
        const nextIndex = 1 - this.currentPlayerIndex;
        
        // 新しいプレイヤーに「次は loopStart の位置からだよ！」と教えます
        this.players[nextIndex] = this._createPlayer(fileName, loopStart, loopStart);
        const nextPlayer = this.players[nextIndex];

        // 再生ボタンを押してから、すぐに指定の場所へジャンプ！
        const playNext = () => {
            const soundId = nextPlayer.play();
            nextPlayer.seek(loopStart, soundId);
        };

        if (nextPlayer.state() === 'loaded') {
            playNext();
        } else {
            nextPlayer.once('load', playNext);
        }

        const oldPlayer = this.players[this.currentPlayerIndex];
        if (oldPlayer) {
            oldPlayer.fade(this.defaultVolume, 0, 100);
            setTimeout(() => {
                oldPlayer.stop();
                oldPlayer.unload();
            }, 100);
        }

        this.currentPlayerIndex = nextIndex;
    }

    stopBGM() {
        this.players.forEach(p => { 
            if (p) {
                if (p._loopTimer) clearTimeout(p._loopTimer);
                p.stop();
                p.unload();
            }
        });
        this.players = [null, null];
    }
    
    // ==========================================
    // ★ 音量を調整する命令（消えちゃってたのはコレです！）
    // ==========================================
    setVolume(value) {
        this.defaultVolume = value;
        this.players.forEach(p => { if (p) p.volume(value); });
    }

    setSEVolume(value) {
        this.seVolume = value;
    }
    
    // ==========================================
    // ★ 効果音（SE）を鳴らす仕組み
    // ==========================================
    playSE(fileName) {
        const se = new window.Howl({
            src: [`data/music/se/${fileName}`], 
            volume: this.seVolume
        });
        se.play();
    }
}

window.AudioManager = new AudioManager();