/**
 * audio.js (Web Audio API ネイティブ直結版 ＋ BGM・SEカタログ機能＋ユーザー設定つき)
 */
class AudioManager {
    constructor() {
        this.bgmPlayer = null;
        // ★ここから書き足し！
        this.currentBgmName = null; // 今鳴っている曲の名前を入れておく箱
        this.memoBgmName = null;    // 元の曲を覚えておくためのメモ帳
        // ★書き足しここまで！
        
        // ★ユーザーが設定した音量（最初は1.0＝100%）を覚えておきます。
        // ブラウザに記憶があればそれを読み込みます！
        this.userBgmVolume = parseFloat(localStorage.getItem('userBgmVolume')) || 1.0;
        this.userSeVolume = parseFloat(localStorage.getItem('userSeVolume')) || 1.0;

        // ==========================================
        // ★ BGMのカタログ（個別の音量調整つき！）
        // ==========================================
        this.bgmList = {
            'SC_ex_Town2_Fortress.ogg': { 
                start: 36603 / 44100, 
                end: (36603 + 5733088) / 44100,
                baseVolume: 0.02 
            },
            'SC_ex_Town1_Castle.ogg': { 
                baseVolume: 0.02 
            },
            // ★野戦のBGM
            '08_Legend of bear slaying.ogg': {
                start: 671034 / 44100, 
                end: (671034 + 5327048) / 44100,
                baseVolume: 0.03
            },
            // ★ここを書き足し！：攻城戦のBGM
            '07_Underworld dance.ogg': {
                start: 4943179 / 44100, 
                end: (4943179 + 3587798) / 44100,
                baseVolume: 0.025
            },
            // '新しい曲.ogg': { baseVolume: 0.05 }, // ループがない曲はこれだけでもOK！
        };

        // ==========================================
        // ★ SEのカタログ（個別の音量調整つき！）
        // ==========================================
        this.seList = {
            'decision.ogg': { baseVolume: 0.04 },
            'cancel.ogg': { baseVolume: 0.02 },
            'choice.ogg': { baseVolume: 0.05 },
            // 特定の音が大きすぎる場合は、ここで小さくできます
            // 'loud_explosion.ogg': { baseVolume: 0.005 },
        };
        
        // もしカタログに書いていない音が呼ばれたときの「とりあえずの音量」
        this.fallbackBgmVolume = 0.02;
        this.fallbackSeVolume = 0.02;
    }

    // BGMを鳴らす魔法
    playBGM(fileName, fallbackStart = 0, fallbackEnd = 0) {
        // 鳴らした曲の名前を覚えさせます
        this.currentBgmName = fileName;

        this.stopBGM();
        
        const bgmData = this.bgmList[fileName];
        const loopStart = bgmData && bgmData.start !== undefined ? bgmData.start : fallbackStart;
        const loopEnd = bgmData && bgmData.end !== undefined ? bgmData.end : fallbackEnd;
        
        // ★ここで「基本の音量」と「ユーザーが設定した音量」を掛け算します！
        const baseVol = bgmData && bgmData.baseVolume !== undefined ? bgmData.baseVolume : this.fallbackBgmVolume;
        const finalVolume = baseVol * this.userBgmVolume;

        this.bgmPlayer = new window.Howl({
            src: [`data/music/bgm/${fileName}`],
            volume: finalVolume,
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
    
    // BGMの音量を変える（設定画面から呼ばれる魔法です）
    setBgmVolume(ratio) {
        this.userBgmVolume = ratio;
        localStorage.setItem('userBgmVolume', ratio); // ブラウザに記憶させます
        
        // 今鳴っているBGMがあれば、リアルタイムに音量を変えます
        if (this.bgmPlayer) {
            // 今鳴っている曲の名前を取り出します
            const src = this.bgmPlayer._src[0]; 
            const fileName = src.split('/').pop();
            const bgmData = this.bgmList[fileName];
            const baseVol = bgmData && bgmData.baseVolume !== undefined ? bgmData.baseVolume : this.fallbackBgmVolume;
            
            this.bgmPlayer.volume(baseVol * this.userBgmVolume);
        }
    }

    // SEの音量を変える（設定画面から呼ばれる魔法です）
    setSeVolume(ratio) {
        this.userSeVolume = ratio;
        localStorage.setItem('userSeVolume', ratio); // ブラウザに記憶させます
    }
    
    // SEを鳴らす魔法
    playSE(fileName) {
        const seData = this.seList[fileName];
        
        // ★ここでも「基本の音量」と「ユーザー設定」を掛け算します！
        const baseVol = seData && seData.baseVolume !== undefined ? seData.baseVolume : this.fallbackSeVolume;
        const finalVolume = baseVol * this.userSeVolume;

        const se = new window.Howl({
            src: [`data/music/se/${fileName}`], 
            volume: finalVolume
        });
        se.play();
    }
    
    // 今のBGMをメモ帳に書き写す魔法（上書き禁止バージョン！）
    memorizeCurrentBgm() {
        // ★追加：メモ帳が「白紙」の時だけ書き込みます！
        if (!this.memoBgmName) {
            this.memoBgmName = this.currentBgmName;
        }
    }

    // メモ帳に書いてあるBGMをもう一度鳴らす魔法
    restoreMemorizedBgm() {
        if (this.memoBgmName) {
            this.playBGM(this.memoBgmName);
            this.memoBgmName = null; // 鳴らしたらメモは消しておきます
        } else {
            // 万が一メモが白紙だった時は、とりあえずいつもの曲を鳴らします
            this.playBGM('SC_ex_Town2_Fortress.ogg'); 
        }
    }
    
}

window.AudioManager = new AudioManager();