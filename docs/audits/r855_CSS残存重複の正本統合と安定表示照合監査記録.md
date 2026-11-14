# r855 CSS残存重複の正本統合と安定表示照合

## 改修の判断

- 正本：ChatGPTライブラリ `sengoku-hadou-main-r854-fonts-folder-empty.zip`（r854、720エントリ）。
- 設計根拠：`ARCHITECTURE.md` の旧処理撤去／CSS正本一元化、`docs/manual/TECHNICAL_REFERENCE.md` のPC16:9・スマホ9:16と `body.is-pc`、固定画面・標準モーダルの契約。r853・r854の表示を維持する。
- `css/style.css` をCSS構文としてトップレベル／`@media` 別に調べると、**同じ条件・同じセレクタの重複は19種類**。一方、PC専用 `@media` や状態修飾子を含む別条件のルールは同一重複とみなさない。

## 変更内容

- **18種類のトップレベル重複（計20個の余分なルールブロック）**をそれぞれ一か所へ統合。対象は一覧行・タイトル・情報枠・コマンドボタン・スマホ地図・年月・戦闘カード表示・セーブ一覧・数量指定・取引結果など。
- 上書き値が異なる箇所は、現行表示を正本とし、例：スマホ攻城戦の `.turn-number` は最終の `1.08rem !important`、スマホ保存一覧の余白は最終の2pxを維持する。同じセレクタでも `!important` の優先度を損なわない。
- タイトル画面の外形は現行タイトルUI節に置き、ロード時のフォント参照は維持。削除した地図の旧位置からGPU負荷に関する説明を現行セレクタへ移す。
- 宣言ゼロの `.sp-empty {}` と、ルールを移したため空になった古い説明見出しを削除。
- `:root` はベース設定・タイトルパレット・共通UIパレットの**役割別3か所**を維持。同じプロパティの二重正本ではない。PC用 `@media` とスマホ用ルールは現行契約なので維持する。`html` の `height:100%` → `height:100dvh` もフォールバックとして維持する。
- テスト1件を追加して主要18セレクタの通常条件での重複再導入を検出。`GameConfig.Meta.Version` を `r855` へ更新。

## 検証

- Chromiumによる**同じDOM上でのCSS差し替え比較**：既存の視覚フィクスチャ15画面とセーブ一覧・数量指定・共通画面断片3状態のそれぞれPC／スマホ、**計36状態・2,782要素**。計算スタイル・矩形寸法・位置の比較は**差分0**（アニメーション・トランジションは比較時のみ固定）。セーブ・数量指定の追加画面断片は `index.html` と `save_load_view.js` の実DOM構造を参照した検証用フィクスチャで、ゲーム全操作を再現したものではない。
- `node tests/run_visual_tests.js`：既存画面回帰24項目成功。
- `node tests/run_tests.js`：**1,394件成功、1件失敗**。失敗は配布仕様により `data/fonts/title-abashiri-mincho.woff2` がない既知のr540フォント存在検査。r855 CSS重複防止テスト成功。
- `python tools/check_manual.py`：マニュアル整合・参照・原文保全成功。
- `python tools/verify_excel_bin_parity.py`：共通・1560・1570のExcel/BIN一致。
- `node tools/verify_release_sources.js`：主要数式 **12,126 + 26,259 + 26,259 = 64,644件**検査成功。
- `python tools/simulation/test_player_focus_sim.py`：4件成功。

## 対象外と変更範囲

- 変更：`css/style.css`、`js/config.js`、`tests/run_tests.js`、`docs/audits/README.md`。追加：本監査記録。
- HTML・ゲームルール・史実データ・バランス・セーブ形式・フォント本体の内容は変更しない。
- すべての動的な画面状態・実機ブラウザ差・長時間の対戦に対するピクセル完全一致は未検証。静的未参照候補はJSで生成される場合があるため証拠なしの機械的削除を行わない。
