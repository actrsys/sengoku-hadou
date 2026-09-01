/**
 * audio.js (Web Audio API ネイティブ直結版 ＋ BGM・SEカタログ機能＋ユーザー設定つき)
 */
class AudioManager {
    constructor() {
        this.bgmPlayer = null;
        this.currentBgmName = null; // 今鳴っている曲の名前を入れておく箱
        this.memoBgmName = null;    // 元の曲を覚えておくためのメモ帳
        this._bgmUsesBakedBaseVolume = false; // mobile AACは基本音量を音源へ焼き込んでいる
        // min版の読込失敗時だけAudioManager自身が通常版を補います。HTMLへinline onerrorを置かないための正規窓口です。
        this._howlerReadyPromise = this._ensureHowlerReady();
        // Howler 2.2.4 の標準モバイルunlockは touchstart/touchend/click の複数イベントで
        // scratch buffer をdestinationへ直結する。古い実機では最初の数タップだけ擦過ノイズに
        // 聞こえる場合があるため、タッチ端末だけ1回限り・ゼロGain経由の安定版へ差し替える。
        this._installStableTouchAudioUnlock();
        
        // ★ユーザーが設定した音量（最初は1.0＝100%）を覚えておきます。
        // ブラウザに記憶があればそれを読み込みます！
        this.userBgmVolume = window.UserSettings ? window.UserSettings.bgmVolume : 1.0;
        this.userSeVolume = window.UserSettings ? window.UserSettings.seVolume : 1.0;
        // 旧端末の安全モードでは短いUIクリック音を鳴らさない。
        // 音声経路を複雑化してノイズやmedia/WebAudio初期化を増やすより、
        // BGM・戦闘/イベントSEを残して操作音だけ省く方を安定性優先の仕様とする。
        this._lowMemoryMutedUiSeNames = new Set(['decision.ogg', 'cancel.ogg', 'choice.ogg', 'window.ogg']);

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

    _isTouchAudioDevice() {
        if (typeof window === 'undefined') return false;
        const nav = window.navigator || {};
        const ua = String(nav.userAgent || '');
        const maxTouchPoints = Number(nav.maxTouchPoints || 0);
        return maxTouchPoints > 0 || /iPhone|iPad|iPod|Android|Mobile/i.test(ua);
    }

    _isMobileLowMemoryAudioMode() {
        if (typeof window === 'undefined') return false;
        if (window.__mobileLowMemoryMode === true) return true;
        const root = typeof document !== 'undefined' ? document.documentElement : null;
        return !!(root && root.classList && root.classList.contains('mobile-low-memory'));
    }

    _installStableTouchAudioUnlock() {
        const install = () => {
            const howler = window.Howler;
            if (!howler || !this._isTouchAudioDevice() || howler.__sengokuStableUnlockInstalled) return;
            const lowMemoryMode = this._isMobileLowMemoryAudioMode();
            howler.__sengokuStableUnlockInstalled = true;

            // Howler本体は変更せず、このアプリ内だけunlock手順を置き換える。
            // 重要なのは「同じタップのtouchstart/touchend/clickで複数回走らせない」ことと、
            // unlock用の極短bufferを直接destinationへ流さないこと。
            howler._unlockAudio = function stableSengokuUnlock() {
                const self = this || howler;
                if (self._audioUnlocked || !self.ctx || self.__sengokuUnlockListenerInstalled) return self;

                self._audioUnlocked = false;
                self.autoUnlock = false;
                self.__sengokuUnlockListenerInstalled = true;

                let handled = false;
                let finished = false;
                const removeListeners = () => {
                    document.removeEventListener('touchstart', unlock, true);
                    document.removeEventListener('pointerdown', unlock, true);
                    document.removeEventListener('click', unlock, true);
                    document.removeEventListener('keydown', unlock, true);
                    self.__sengokuUnlockListenerInstalled = false;
                };
                const finishUnlock = () => {
                    if (finished) return;
                    finished = true;
                    self._audioUnlocked = true;
                    removeListeners();
                    for (let i = 0; i < self._howls.length; i++) self._howls[i]._emit('unlock');
                };

                const unlock = () => {
                    if (handled) return;
                    handled = true;
                    // touchend/clickが同じ物理タップから続いても再入しないよう、最初に外す。
                    removeListeners();

                    // HTML5 Audio(BGM)側はHowler標準unlockと同じく、既存nodeを使用可能状態へ寄せる。
                    for (let i = 0; i < self._howls.length; i++) {
                        if (self._howls[i]._webAudio) continue;
                        const ids = self._howls[i]._getSoundIds();
                        for (let j = 0; j < ids.length; j++) {
                            const sound = self._howls[i]._soundById(ids[j]);
                            if (sound && sound._node && !sound._node._unlocked) {
                                sound._node._unlocked = true;
                                try { sound._node.load(); } catch (_) {}
                            }
                        }
                    }

                    let fallbackStarted = false;
                    const startSilentFallback = () => {
                        if (finished || fallbackStarted) return;
                        fallbackStarted = true;
                        if (lowMemoryMode) {
                            // 問題端末ではscratch buffer自体を一切鳴らさない。resumeに失敗した場合は
                            // 次の実タッチで再試行し、擦過ノイズよりSEの一時欠落を優先する。
                            handled = false;
                            fallbackStarted = false;
                            self.__sengokuUnlockListenerInstalled = true;
                            document.addEventListener('touchstart', unlock, true);
                            document.addEventListener('pointerdown', unlock, true);
                            document.addEventListener('keydown', unlock, true);
                            return;
                        }
                        try {
                            const source = self.ctx.createBufferSource();
                            const silentGain = typeof self.ctx.createGain === 'function' ? self.ctx.createGain() : null;
                            source.buffer = self.ctx.createBuffer(1, 1, Math.max(22050, Number(self.ctx.sampleRate) || 44100));
                            if (silentGain) {
                                // resume()だけでは解除できない古いWebView向けの最終fallback。必ずゼロGainを通す。
                                silentGain.gain.setValueAtTime(0, self.ctx.currentTime);
                                source.connect(silentGain);
                                silentGain.connect(self.ctx.destination);
                            } else {
                                source.connect(self.ctx.destination);
                            }
                            source.onended = () => {
                                try { source.disconnect(0); } catch (_) {}
                                if (silentGain) {
                                    try { silentGain.disconnect(0); } catch (_) {}
                                }
                                finishUnlock();
                            };
                            if (typeof source.start === 'undefined') source.noteOn(0);
                            else source.start(0);
                            setTimeout(finishUnlock, 80);
                        } catch (_) {
                            finishUnlock();
                        }
                    };

                    try {
                        // 現行iOS/WebKitではユーザー操作中のresume()だけで解除できるため、まず無音bufferを一切再生しない。
                        // r323でも最初の数回だけ擦過ノイズが残った実機があるため、buffer再生は本当に必要な旧WebViewだけへ限定する。
                        const resumeResult = typeof self.ctx.resume === 'function' ? self.ctx.resume() : null;
                        if (resumeResult && typeof resumeResult.then === 'function') {
                            resumeResult.then(() => {
                                if (self.ctx.state === 'running') finishUnlock();
                                else startSilentFallback();
                            }).catch(startSilentFallback);
                            setTimeout(() => {
                                if (finished) return;
                                if (self.ctx.state === 'running') finishUnlock();
                                else startSilentFallback();
                            }, 80);
                        } else if (self.ctx.state === 'running') {
                            finishUnlock();
                        } else {
                            startSilentFallback();
                        }
                    } catch (_) {
                        startSilentFallback();
                    }
                };

                // タッチ端末ではtouchstartを主経路にし、pointer/click/keyboardは代替入力用。
                document.addEventListener('touchstart', unlock, true);
                document.addEventListener('pointerdown', unlock, true);
                if (!lowMemoryMode) document.addEventListener('click', unlock, true);
                document.addEventListener('keydown', unlock, true);
                return self;
            };
        };

        if (window.Howler) install();
        else this._howlerReadyPromise.then(install).catch(() => {});
    }

    _shouldUseMobileBgmStreaming() {
        // 通常スマホは元のOGG/Web Audio品質・ループ精度へ戻す。
        // 長尺BGMのPCM常駐が問題になる旧端末の安全モードだけHTML5 Audioへ切り替える。
        return this._isMobileLowMemoryAudioMode();
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
                // iOS系ではHTMLMediaElement.volumeが固定される端末があるため、
                // mobile AAC側へbaseVolumeを焼き込み、ここではユーザー音量だけを渡す。
                volume: this.userBgmVolume,
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
            this._bgmUsesBakedBaseVolume = true;
            if (!(this.userBgmVolume > 0) && typeof mobilePlayer.mute === 'function') mobilePlayer.mute(true);
            mobilePlayer.play();
            return;
        }

        // PCは従来どおりWeb Audioを使い、サンプル単位のloopStart/loopEndを維持する。
        this._bgmUsesBakedBaseVolume = false;
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
        this._bgmUsesBakedBaseVolume = false;
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
            const runtimeBaseVol = this._bgmUsesBakedBaseVolume ? 1 : baseVol;
            if (this._bgmUsesBakedBaseVolume && typeof this.bgmPlayer.mute === 'function') {
                this.bgmPlayer.mute(!(this.userBgmVolume > 0));
            }
            this.bgmPlayer.volume(runtimeBaseVol * this.userBgmVolume);
        }
    }

    // SEの音量を変える（設定画面から呼ばれる魔法です）
    setSeVolume(ratio) {
        this.userSeVolume = ratio;
        if (window.UserSettings) window.UserSettings.setSeVolume(ratio);
    }
    
    // SEを鳴らす魔法
    playSE(fileName) {
        if (this._isMobileLowMemoryAudioMode() && this._lowMemoryMutedUiSeNames.has(fileName)) return;
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