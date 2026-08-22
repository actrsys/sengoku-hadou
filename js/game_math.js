/**
 * game_math.js
 * ゲーム全体で使う純粋な数値ユーティリティ。
 * UI・ゲーム状態・DOMには依存しない。
 */
class GameMath {
    static seededRandom(seed) { let x = Math.sin(seed++) * 10000; return x - Math.floor(x); }

    static applyVariance(val, fluctuation) {
        if (!fluctuation || fluctuation === 0) return Math.floor(val);
        const min = 1.0 - fluctuation; const max = 1.0 + fluctuation;
        const rate = min + Math.random() * (max - min);
        return Math.floor(val * rate);
    }
}

window.GameMath = GameMath;
