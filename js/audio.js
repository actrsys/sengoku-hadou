/**
 * audio.js
 * 音楽（BGM）と効果音を管理するクラス
 */
class AudioManager {
    constructor() {
        this.bgm = null;
        this.defaultVolume = 0.1; // デフォルト音量を10%に設定
    }

    /**
     * BGMを再生する関数
     * @param {string} fileName ファイル名 (例: 'SC_ex_Town1_Castle.ogg')
     * @param {boolean} loop ループするかどうか
     */
    playBGM(fileName, loop = true) {
        // すでに鳴っている曲があれば止める
        if (this.bgm) {
            this.bgm.pause();
            this.bgm = null;
        }

        // 新しい音楽ファイルを読み込む
        this.bgm = new Audio(`data/music/${fileName}`);
        this.bgm.loop = loop;
        this.bgm.volume = this.defaultVolume;

        // OGGのループタグ（LOOPSTART等）は、標準のAudioタグでは自動対応しないため
        // ここでは単純なループ再生を行いますが、再生開始を試みます
        this.bgm.play().catch(e => {
            console.log("ユーザーが画面を操作するまで再生は待機されます:", e);
        });
    }

    /**
     * 音量を変更したい場合
     */
    setVolume(value) {
        this.defaultVolume = value;
        if (this.bgm) {
            this.bgm.volume = value;
        }
    }
}

// ゲーム全体で使えるように登録
window.AudioManager = new AudioManager();