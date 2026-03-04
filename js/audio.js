// ==========================================
    // ★ BGMを鳴らす仕組み（今まで通りです）
    // ==========================================
    playBGM(fileName, loopStart = 0) {
        this.stopBGM();

        this.currentPlayerIndex = 0;
        // ★変更：最初は「0秒」からスタートするよ、としっかり教えます
        this.players[0] = this._createPlayer(fileName, loopStart, 0);
        this.players[0].play();
    }

    // ★変更：「今のスタート地点（currentStartPos）」を受け取れるように箱を増やします
    _createPlayer(fileName, loopStart, currentStartPos = 0) {
        const player = new window.Howl({
            src: [`data/music/bgm/${fileName}`],
            volume: this.defaultVolume,
            onplay: () => {
                // ★ ここから修正：ループの準備をする「魔法」を定義します
                const setupLoop = () => {
                    const duration = player.duration();
                    
                    // もし曲の長さがまだ「0」だったら、少し待ってからもう一度長さを測り直します！
                    if (duration === 0) {
                        setTimeout(setupLoop, 100);
                        return;
                    }

                    const leadTime = 0.1;
                    // ★変更：パソコンが慌てて「今どこ？」を見失わないように、
                    // 最初に教えた「スタート地点（currentStartPos）」を使って確実に計算させます！
                    const checkInterval = (duration - currentStartPos - leadTime) * 1000;

                    setTimeout(() => {
                        if (this.players[this.currentPlayerIndex] === player) {
                            this._prepareNextLoop(fileName, loopStart);
                        }
                    }, checkInterval);
                };

                // 曲の読み込みが終わっているかチェックします
                if (player.state() === 'loaded') {
                    // もう読み込めていたら、すぐにループの準備をします
                    setupLoop();
                } else {
                    // まだ読み込み中なら、終わった瞬間に準備をするように予約します
                    player.once('load', setupLoop);
                }
            }
        });
        return player;
    }

    _prepareNextLoop(fileName, loopStart) {
        const nextIndex = 1 - this.currentPlayerIndex;
        
        // ★変更：新しいプレイヤーを作る時に「次は loopStart の位置からだよ！」としっかり教えます
        this.players[nextIndex] = this._createPlayer(fileName, loopStart, loopStart);
        const nextPlayer = this.players[nextIndex];

        // ★変更：再生ボタンを押してから、すぐに指定の場所へジャンプ！という順番に直します
        // これで確実に指定した場所（0.83秒）から音が鳴るようになります
        if (nextPlayer.state() === 'loaded') {
            const soundId = nextPlayer.play();
            nextPlayer.seek(loopStart, soundId);
        } else {
            nextPlayer.once('load', () => {
                const soundId = nextPlayer.play();
                nextPlayer.seek(loopStart, soundId);
            });
        }

        const oldPlayer = this.players[this.currentPlayerIndex];
        oldPlayer.fade(this.defaultVolume, 0, 100);
        
        setTimeout(() => {
            oldPlayer.stop();
            oldPlayer.unload();
        }, 100);

        this.currentPlayerIndex = nextIndex;
    }