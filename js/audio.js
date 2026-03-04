/**
 * audio.js (Web Audio API ネイティブ直結版 - 究極のシームレスループ)
 */
class AudioManager {
    constructor() {
        this.bgmPlayer = null;
        this.defaultVolume = 0.02; // BGMの音量
        this.seVolume = 0.01;      // SE専用の音量
    }

    // ==========================================
    // ★ BGMを鳴らす仕組み（終わりの場所も教えられるように進化！）
    // ==========================================
    playBGM(fileName, loopStart = 0, loopEnd = 0) { // ★追加：loopEnd（終わりの場所）
        this.stopBGM(); // 今鳴っている曲を止めます

        this.bgmPlayer = new window.Howl({
            src: [`data/music/bgm/${fileName}`],
            volume: this.defaultVolume,
            loop: true, 
            onplay: (id) => {
                // ★ブラウザの心臓部に直接書き込みます
                if (loopStart > 0 && this.bgmPlayer) {
                    const sound = this.bgmPlayer._soundById(id);
                    
                    if (sound && sound._node && sound._node.bufferSource) {
                        // 「ここからループしてね！」（スタート地点）
                        sound._node.bufferSource.loopStart = loopStart;
                        
                        // ★追加：「ここまで来たら戻ってね！」（ゴール地点）
                        if (loopEnd > 0) {
                            sound._node.bufferSource.loopEnd = loopEnd;
                        }
                    }
                }
            }
        });

        // 再生スタート！
        this.bgmPlayer.play();
    }

    stopBGM() {
        if (this.bgmPlayer) {
            this.bgmPlayer.stop();
            this.bgmPlayer.unload();
            this.bgmPlayer = null;
        }
    }
    
    // ==========================================
    // ★ 音量を調整する命令
    // ==========================================
    setVolume(value) {
        this.defaultVolume = value;
        if (this.bgmPlayer) {
            this.bgmPlayer.volume(value);
        }
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