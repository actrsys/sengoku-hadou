/**
 * audio.js (Web Audio API ネイティブ直結版 ＋ BGMカタログ機能つき)
 */
class AudioManager {
    constructor() {
        this.bgmPlayer = null;
        this.defaultVolume = 0.02; // BGMの音量
        this.seVolume = 0.01;      // SE専用の音量

        // ==========================================
        // ★ ここに「BGMのカタログ」を作ります！
        // ==========================================
        this.bgmList = {
            // 曲の名前と、スタート地点・ゴール地点をメモしておきます
            'SC_ex_Town2_Fortress.ogg': { 
                start: 36603 / 44100, 
                end: (36603 + 5733088) / 44100 
            },
            
            // ★新しい曲が増えたら、ここに同じように書き足していけばOKです！
            // '新しい曲の名前.ogg': {
            //     start: スタートの数字 / Hz,
            //     end: (スタートの数字 ＋ 長さの数字) / Hz
            // }
        };
    }

    // ==========================================
    // ★ BGMを鳴らす仕組み（ハイブリッド版！）
    // ==========================================
    // 命令を受け取る時、念のため「今まで通りの数字（fallbackStart, fallbackEnd）」も受け取れるようにしておきます
    playBGM(fileName, fallbackStart = 0, fallbackEnd = 0) {
        this.stopBGM();

        // １．カタログ（bgmList）の中に、呼ばれた曲のメモがあるか探します
        const bgmData = this.bgmList[fileName];
        
        // ２．★ここがハイブリッドの魔法です！
        // もしカタログにメモがあればそれを使います。
        // もしカタログにまだ書いていなければ、今まで通り渡された数字（fallbackStartなど）を使います！
        const loopStart = bgmData ? bgmData.start : fallbackStart;
        const loopEnd = bgmData ? bgmData.end : fallbackEnd;

        this.bgmPlayer = new window.Howl({
            src: [`data/music/bgm/${fileName}`],
            volume: this.defaultVolume,
            loop: true, 
            onplay: (id) => {
                if (loopStart > 0 && this.bgmPlayer) {
                    const sound = this.bgmPlayer._soundById(id);
                    if (sound && sound._node && sound._node.bufferSource) {
                        sound._node.bufferSource.loopStart = loopStart;
                        if (loopEnd > 0) {
                            sound._node.bufferSource.loopEnd = loopEnd;
                        }
                    }
                }
            }
        });

        this.bgmPlayer.play();
    }

    stopBGM() {
        if (this.bgmPlayer) {
            this.bgmPlayer.stop();
            this.bgmPlayer.unload();
            this.bgmPlayer = null;
        }
    }
    
    setVolume(value) {
        this.defaultVolume = value;
        if (this.bgmPlayer) {
            this.bgmPlayer.volume(value);
        }
    }

    setSEVolume(value) {
        this.seVolume = value;
    }
    
    playSE(fileName) {
        const se = new window.Howl({
            src: [`data/music/se/${fileName}`], 
            volume: this.seVolume
        });
        se.play();
    }
}

window.AudioManager = new AudioManager();