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
    // ★ BGMを鳴らす仕組み（究極にシンプルな最終形態！）
    // ==========================================
    playBGM(fileName, loopStart = 0) {
        this.stopBGM(); // 今鳴っている曲を止めます

        this.bgmPlayer = new window.Howl({
            src: [`data/music/bgm/${fileName}`],
            volume: this.defaultVolume,
            // 最初から「これは全体をループする曲だよ」と教えます
            loop: true, 
            onplay: (id) => {
                // ★ここが最大の魔法！ブラウザの心臓部に直接書き込みます
                if (loopStart > 0 && this.bgmPlayer) {
                    // 今鳴らしている音のデータを取り出します
                    const sound = this.bgmPlayer._soundById(id);
                    
                    // 心臓部（bufferSource）がちゃんとあるか確認します
                    if (sound && sound._node && sound._node.bufferSource) {
                        // 「次は 0.83秒(loopStart) の位置からループしてね！」と直接教え込みます
                        sound._node.bufferSource.loopStart = loopStart;
                    }
                }
            }
        });

        // 再生スタート！
        this.bgmPlayer.play();
    }

    stopBGM() {
        // 曲を止める時は、演奏者を解散させます
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