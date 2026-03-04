/**
 * audio.js (Howler.js オーディオスプライト版 - 完全シームレスループ ＋ 効果音対応)
 */
class AudioManager {
    constructor() {
        // 今回から、BGMの演奏者は「1人」だけで良くなります！とてもシンプル！
        this.bgmPlayer = null;
        this.defaultVolume = 0.02; // BGMの音量
        this.seVolume = 0.01;      // SE専用の音量
    }

    // ==========================================
    // ★ BGMを鳴らす仕組み（サイトの情報を元に大改造！）
    // ==========================================
    playBGM(fileName, loopStart = 0) {
        this.stopBGM(); // 今鳴っている曲を止めます

        // 指定された秒数（0.83など）をミリ秒（1000倍）に直します
        const startMs = loopStart * 1000;

        this.bgmPlayer = new window.Howl({
            src: [`data/music/bgm/${fileName}`],
            volume: this.defaultVolume,
            onload: () => {
                // 曲の読み込みが終わったら、曲の全体の長さをミリ秒で測ります
                const durationMs = this.bgmPlayer.duration() * 1000;

                // ★サイトで紹介されていた「スプライト」という魔法の切り取り線を作ります！
                // 'start'：曲の頭(0)から最後まで。ループはしない(false)
                // 'loop' ：指定の位置(startMs)から最後まで。ループする(true)
                this.bgmPlayer._sprite.start = [0, durationMs, false];
                this.bgmPlayer._sprite.loop = [startMs, durationMs - startMs, true];

                if (loopStart === 0) {
                    // 最初からループする曲なら、いきなり「loop」を鳴らします
                    this.bgmPlayer.play('loop');
                } else {
                    // 途中からループする曲なら、まずは「start」を鳴らします
                    this.bgmPlayer.play('start');

                    // 「start」が1回終わった瞬間に、次から「loop」を鳴らすように予約します
                    this.bgmPlayer.once('end', () => {
                        this.bgmPlayer.play('loop');
                    });
                }
            }
        });
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