# r853 CSS旧宣言・到達不能セレクタ整理監査記録

## 対象と根拠

- 正本：ChatGPTライブラリ `/2026-11-09/sengoku-hadou-main-r852-fonts-folder-empty.zip`（内部 `GameConfig.Meta.Version` r852、718項目）。
- 対象：`css/style.css`、`css/animation.css`、`css/game_fonts.css`、`index.html`、全本編 `js/*.js`、関連回帰テスト、現行 `ARCHITECTURE.md` と `docs/manual/TECHNICAL_REFERENCE.md`。
- 原則：「旧処理を残して後勝ちで打ち消さない」「静的外観はCSS正本」「動的DOM・状態クラスを削除しない」「PC16:9・スマホ9:16の画面外観を保つ」。

## 発見した問題と改修

1. `style.css` 冒頭のタイトル旧テーマ（旧背景・中央整列の旧文字サイズ・ボタン旧意匠など）が、同じCSS末尾の現行テーマにより上書きされていた。旧テーマの各ルールを撤去し、現行ブロックへ**実際に有効だった位置・サイズ・表示・間隔・カーソル等だけ**を移動した。
2. 旧ロード幕 `#global-loading-screen` と `.loading-text` も後勝ちの現行テーマと二重定義されていた。旧テーマ部分を撤去し、現行ブロックへ位置・幅・高さを統合した。ロード幕の`blink-loading`は実際のセーブガード等で継続使用するため残した。
3. `index.html` と全本編JSに使用・生成箇所がない旧専用要素や表示クラス（`#pc-map-overlay`、`#kyoten-tabs`、`#kyoten-scope-tabs`、旧継承候補、旧捕虜結果、旧武将能力ゲージ装飾、未参照ログ色等）を確認して整理した。共通セレクタのうち生存する要素は残した。
4. `animation.css` の旧 `anim-attack` / `attack-push` と、現行の野戦側がクラスを付与しない `is-evening` / `is-night` の時間帯装飾を撤去した。夜間の戦闘計算・天候処理には触れていない。
5. 未使用の `.castle-card.active-turn`（低メモリ例外含む）および呼出しのない `@keyframes pulse` を削除した。

**削除見送り：** `.castle-card.icon-tier-*`、`.legion-color-*`、`.hex-*`、`.terrain-variant-*` はJS側で動的にクラス名を構築するため、単純な全文検索で未使用とは判断しない。`.castle-card.current-turn` は本体の直接参照が確認できないが、既存の回帰テストが当該表示を仕様として保護しているため、仕様確定なしに削除しない。面談・国主評定の可読性パッチなど、同じセレクタの後段修正は存在するが、今回の個別除去とは別に画面での最終レイアウト検証が必要なため機械的には統合しない。

## 検証

- 改修前に `node tests/run_visual_tests.js`：24項目成功。改修後もPC・スマホ・低メモリを含む24項目成功。
- `node tests/run_tests.js`：CSS再発防止テスト追加後、1,392件成功・1件失敗。失敗はフォント本体未同梱で発生する既知のr540先読みテスト。
- `style.css`、`animation.css`、`game_fonts.css`：トップレベル構文エラー0件。単純な宣言パーサーは既存の `body.is-pc` 内CSSネストを通常の宣言としては解析できないが、Chromiumによる実描画回帰は成功。
- `index.html`：初回ロード用の1個の`<style>`以外、static `style` 属性0件・inlineイベント属性0件。
- `python tools/check_manual.py`：成功。近似シミュレーション4件成功。
- 管理Excel、BIN、シナリオ史実データ、ゲームバランス、セーブ形式は変更しない。
- すべてのゲーム状態でのピクセル完全一致、長時間プレイ・戦闘全分岐は未検証。今回の変更対象は未参照ルールおよび現行の有効値を保つ統合に限定。

## ファイル差分

- 更新：`css/animation.css`、`css/style.css`、`docs/audits/README.md`、`js/config.js`、`tests/run_tests.js`
- 追加：`docs/audits/r853_CSS旧宣言と未使用ルール整理監査記録.md`
- 削除：なし（CSS内部の不要なルールのみ削除）
