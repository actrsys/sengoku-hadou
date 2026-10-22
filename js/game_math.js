/**
 * game_math.js
 * ゲーム全体で使う純粋な数値ユーティリティ。
 * UI・ゲーム状態・DOMには依存しない。
 */
class GameMath {
    static seededRandom(seed) { let x = Math.sin(seed++) * 10000; return x - Math.floor(x); }

    // 兵士が合流する場面で使う共通の加重平均（整数切捨て）。
    // 受入人数の上限、士気・訓練度の下限、未設定値の扱いは各専門Systemが決める。
    static weightedAverageFloor(existingValue, existingCount, incomingValue, incomingCount) {
        return Math.floor((existingValue * existingCount + incomingValue * incomingCount) / (existingCount + incomingCount));
    }

    static applyVariance(val, fluctuation) {
        if (!fluctuation || fluctuation === 0) return Math.floor(val);
        const min = 1.0 - fluctuation; const max = 1.0 + fluctuation;
        const rate = min + Math.random() * (max - min);
        return Math.floor(val * rate);
    }
}

window.GameMath = GameMath;
