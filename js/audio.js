/**
 * audio.js (Web Audio API ネイティブ直結版 ＋ BGM・SEカタログ機能＋ユーザー設定つき)
 */
class AudioManager {
    constructor() {
        this.bgmPlayer = null;
        this.currentBgmName = null; // 今鳴っている曲の名前を入れておく箱
        this.memoBgmName = null;    // 元の曲を覚えておくためのメモ帳
        // min版の読込失敗時だけAudioManager自身が通常版を補います。HTMLへinline onerrorを置かないための正規窓口です。
        this._howlerReadyPromise = this._ensureHowlerReady();
        
        // ★ユーザーが設定した音量（最初は1.0＝100%）を覚えておきます。
        // ブラウザに記憶があればそれを読み込みます！
        this.userBgmVolume = window.UserSettings ? window.UserSettings.bgmVolume : 1.0;
        this.userSeVolume = window.UserSettings ? window.UserSettings.seVolume : 1.0;

        // ==========================================
        // ★ BGMのカタログ（個別の音量調整つき！）
        // ==========================================
        this.bgmList = {
            // タイトル画面
            'SC_ex_Town1_Castle.ogg': { 
                start: 0,
                end: 3428642 / 44100,
                baseVolume: 0.05 
            },
            // メインBGM
            'SC_ex_Town2_Fortress.ogg': { 
                start: 36603 / 44100, 
                end: (36603 + 5733088) / 44100,
                baseVolume: 0.05 
            },
            // イベントBGM1
            '06_Snowy Sacred Approach.ogg': {
                start: 807703 / 44100, 
                end: (807703 + 2538065) / 44100,
                baseVolume: 0.06
            },
            // イベントBGM2
            'SC_ex_Scene1_Duel.ogg': {
                start: 0,
                end: 3841330 / 44100,
                baseVolume: 0.05
            },
            // イベントBGM3
            'SC_ex_Scene6_Fate.ogg': {
                start: 604787 / 44100,
                end: (604787 + 6350355) / 44100,
                baseVolume: 0.05
            },
            // イベントBGM4/外交
            'SC_ex_Scene3_Odyssey.ogg': {
                start: 0,
                end: 3924855 / 44100,
                baseVolume: 0.05
            },
            // イベントBGM5
            'SC_ex_Field1_Cruising1.ogg': {
                start: 0,
                end: 4639937 / 44100,
                baseVolume: 0.05
            },
            // 攻城戦BGM
            '07_Underworld dance.ogg': {
                start: 4943179 / 44100, 
                end: (4943179 + 3587798) / 44100,
                baseVolume: 0.05
            },
            // 野戦BGM
            '08_Legend of bear slaying.ogg': {
                start: 671034 / 44100, 
                end: (671034 + 5327048) / 44100,
                baseVolume: 0.06
            },
        };

        // ==========================================
        // ★ SEのカタログ（個別の音量調整つき！）
        // ==========================================
        this.seList = {
            'decision.ogg': { baseVolume: 0.06 },
            'cancel.ogg': { baseVolume: 0.05 },
            'choice.ogg': { baseVolume: 0.06 },
            'window.ogg': { baseVolume: 0.1 },
            'damage001.ogg': { baseVolume: 0.1 },
            'bow001.mp3': { baseVolume: 0.3 },
            'bow_hit001.mp3': { baseVolume: 0.3 },
            'fire001.mp3': { baseVolume: 0.1 },
            'slash.ogg': { baseVolume: 0.1 },
            'miss.ogg': { baseVolume: 0.07 },
            'myturn.ogg': { baseVolume: 0.05 },
            'event001.ogg': { baseVolume: 0.15 },
            'victory.ogg': { baseVolume: 0.1 },
            'katana001.ogg': { baseVolume: 0.04 },
            'katana002.ogg': { baseVolume: 0.05 },
            'zangeki001.ogg': { baseVolume: 0.06 },
        };
        
        // もしカタログに書いていない音が呼ばれたときの「とりあえずの音量」
        this.fallbackBgmVolume = 0.05;
        this.fallbackSeVolume = 0.1;
    }


    _ensureHowlerReady() {
        if (window.Howl) return Promise.resolve(true);

        return new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = 'js/howler.js';
            script.onload = () => {
                if (window.Howl) resolve(true);
                else reject(new Error('Howler fallback loaded but Howl is unavailable.'));
            };
            script.onerror = () => reject(new Error('Howler fallback could not be loaded.'));
            document.head.appendChild(script);
        });
    }

    _retryWhenHowlerReady(action) {
        if (window.Howl) return false;
        this._howlerReadyPromise
            .then(() => action())
            .catch(error => console.error('【AudioManager】Howlerの読み込みに失敗しました。', error));
        return true;
    }

    _shouldUseMobileBgmStreaming() {
        // タッチ端末では長尺BGMをWeb AudioのAudioBufferへ全展開せず、
        // HTML5 Audioでストリーミング再生する。PCは従来のWeb Audio経路を維持する。
        return !!(typeof document !== 'undefined' && document.body && document.body.classList
            && document.body.classList.contains('is-touch-input'));
    }

    _getMobileBgmSource(fileName) {
        const name = String(fileName || '');
        return `data/music/bgm_mobile/${name.replace(/\.[^.]+$/, '')}.m4a`;
    }

    // BGMを鳴らす魔法
    playBGM(fileName, fallbackStart = 0, fallbackEnd = 0) {
        if (this._retryWhenHowlerReady(() => this.playBGM(fileName, fallbackStart, fallbackEnd))) return;

        // 鳴らした曲の名前を覚えさせます
        this.currentBgmName = fileName;

        this.stopBGM();
        
        const bgmData = this.bgmList[fileName];
        const loopStart = bgmData && bgmData.start !== undefined ? bgmData.start : fallbackStart;
        const loopEnd = bgmData && bgmData.end !== undefined ? bgmData.end : fallbackEnd;
        
        // ★ここで「基本の音量」と「ユーザーが設定した音量」を掛け算します！
        const baseVol = bgmData && bgmData.baseVolume !== undefined ? bgmData.baseVolume : this.fallbackBgmVolume;
        const finalVolume = baseVol * this.userBgmVolume;

        const hasLoopWindow = Number.isFinite(loopStart) && loopStart >= 0
            && Number.isFinite(loopEnd) && loopEnd > loopStart;
        const useMobileStream = this._shouldUseMobileBgmStreaming() && !!bgmData;

        if (useMobileStream) {
            // HowlerのWeb Audio既定経路では長尺BGM全体がPCMのAudioBufferへ展開される。
            // 古いスマホでは通常BGMだけでも数十MB規模になり、一覧→詳細などの瞬間メモリと重なる。
            // HTML5 Audio + AACへ切り替えることで曲をストリーミングし、常駐PCMを避ける。
            // mobile版AACは各曲のloopEndで物理的に終端している。これにより初回は従来どおり0秒から
            // introを再生し、終端到達後だけloopStartへseekして同じ区間を繰り返せる。
            // audio spriteを直接playすると初回からloopStartへ飛んでintroを失うため使用しない。
            let mobilePlayer = null;
            const options = {
                src: [this._getMobileBgmSource(fileName)],
                volume: finalVolume,
                html5: true,
                preload: 'metadata'
            };
            if (hasLoopWindow && loopStart > 0) {
                options.onend = (id) => {
                    if (!mobilePlayer || this.bgmPlayer !== mobilePlayer) return;
                    try {
                        mobilePlayer.seek(loopStart, id);
                        mobilePlayer.play(id);
                    } catch (e) {
                        // HTML5 Audio側のseek/replayが失敗してもゲーム処理は止めない。
                    }
                };
            } else {
                // loopStart=0 の曲はloopEndで切ったmobile音源をnative loopするだけで同じ範囲になる。
                options.loop = true;
            }
            mobilePlayer = new window.Howl(options);
            this.bgmPlayer = mobilePlayer;
            mobilePlayer.play();
            return;
        }

        // PCは従来どおりWeb Audioを使い、サンプル単位のloopStart/loopEndを維持する。
        this.bgmPlayer = new window.Howl({
            src: [`data/music/bgm/${fileName}`],
            volume: finalVolume,
            loop: true,
            onplay: (id) => {
                if (!this.bgmPlayer) return;
                const sound = this.bgmPlayer._soundById(id);
                const source = sound && sound._node ? sound._node.bufferSource : null;
                if (!source) return;
                // LOOPSTART=0 も正規の値。開始点と終了点を独立して反映し、
                // start=0 の曲でもメタデータ由来の LOOPEND をファイル末尾へ流さず適用する。
                if (Number.isFinite(loopStart) && loopStart >= 0) source.loopStart = loopStart;
                if (Number.isFinite(loopEnd) && loopEnd > loopStart) source.loopEnd = loopEnd;
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

    // BGMをゆっくり消す魔法（指定した秒数かけてフェードアウトします）
    fadeOutBgm(durationInSeconds = 1) {
        if (this.bgmPlayer) {
            const currentVol = this.bgmPlayer.volume();
            // 秒数をミリ秒（1000倍）に直して、今の音量から 0（無音）へフェードアウト
            this.bgmPlayer.fade(currentVol, 0, durationInSeconds * 1000);
            
            // フェードアウトが完全に終わったら、BGMをきっちり停止させます
            this.bgmPlayer.once('fade', () => {
                this.stopBGM();
            });
        }
    }
    
    // BGMの音量を変える（設定画面から呼ばれる魔法です）
    setBgmVolume(ratio) {
        this.userBgmVolume = ratio;
        if (window.UserSettings) window.UserSettings.setBgmVolume(ratio);
        
        // 今鳴っているBGMがあれば、リアルタイムに音量を変えます
        if (this.bgmPlayer) {
            // Howler内部の _src は読込後に配列から文字列へ変わり得るため参照しない。
            // AudioManager自身が保持する正規の曲名を使う。
            const bgmData = this.bgmList[this.currentBgmName];
            const baseVol = bgmData && bgmData.baseVolume !== undefined ? bgmData.baseVolume : this.fallbackBgmVolume;
            
            this.bgmPlayer.volume(baseVol * this.userBgmVolume);
        }
    }

    // SEの音量を変える（設定画面から呼ばれる魔法です）
    setSeVolume(ratio) {
        this.userSeVolume = ratio;
        if (window.UserSettings) window.UserSettings.setSeVolume(ratio);
    }
    
    // SEを鳴らす魔法
    playSE(fileName) {
        if (this._retryWhenHowlerReady(() => this.playSE(fileName))) return;

        const seData = this.seList[fileName];
        
        // ★ここでも「基本の音量」と「ユーザー設定」を掛け算します！
        const baseVol = seData && seData.baseVolume !== undefined ? seData.baseVolume : this.fallbackSeVolume;
        const finalVolume = baseVol * this.userSeVolume;
        // 完全ミュートならHowl/AudioBufferを作る意味がありません。長時間AI観戦では
        // 無音SEのdecodeを積み重ねない方が古い端末のメモリ安定性に有利です。
        if (!(finalVolume > 0)) return;

        let se = null;
        let safetyTimer = null;
        const cleanup = () => {
            if (safetyTimer) {
                clearTimeout(safetyTimer);
                safetyTimer = null;
            }
            if (!se) return;
            try { se.unload(); } catch (e) {}
            se = null;
        };
        se = new window.Howl({
            src: [`data/music/se/${fileName}`],
            volume: finalVolume,
            onend: cleanup,
            onloaderror: cleanup,
            onplayerror: cleanup
        });
        se.play();
        // 全SEは約11秒以下。古いWebViewでonend/onplayerrorが欠落しても
        // 一時Howlを永久保持しないよう、十分長い安全弁で必ず解放します。
        if (se) safetyTimer = setTimeout(cleanup, 15000);
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