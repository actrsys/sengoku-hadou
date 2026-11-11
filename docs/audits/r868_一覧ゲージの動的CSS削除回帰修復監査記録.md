# r868 一覧ゲージの動的CSS削除回帰修復監査記録

## 対象・発生版と到達性

- 正本：ChatGPTライブラリ直下 `sengoku-hadou-main-r867-fonts-folder-empty.zip`、内部 `GameConfig.Meta.Version` r867。完全版・フォント実体なし。
- 過去版比較：r852（2026年11月9日21:59 JST作成）では `.bar-bg-power`・`.bar-fill-power`・`.bar-bg-friend`・`.bar-fill-friend` が存在。r853（2026年11月10日02:54 JST作成）のCSS整理時に4セレクタが削除され、r867まで復活していなかった。
- `js/ui_info.js` の `UIInfoManager._createBarHtml(percent, type)` は `bar-bg-${type}` と `bar-fill-${type}` を生成する。`type='power'` が大名勢力の威信、`type='friend'` が外交・諸勢力を含む一覧の友好度に実際に使用される。
- CSSで下地と塗りの背景色宣言がなくなり、表示幅の指定が残っていてもゲージの中身が透明になる。架空データや不正なセーブに依存しない通常到達の表示不具合。
- r853の監査記録は「動的クラスを削除しない」としていたが、具体的な `bar-bg-*`・`bar-fill-*` の参照を見逃した。旧記録は当時の資料として残し、本記録で誤認を訂正する。

## 変更内容

- `css/style.css`：r852で正常表示していた威信・友好度の下地色とグラデーション塗りの4セレクタのみ復元。共通 `.bar-fill` の幅のCSS変数は変更せず、JavaScript・ゲームルール・保存データにも変更なし。
- `tests/run_tests.js`：実際の `UIInfoManager._createBarHtml` が生成する動的クラス名・割合と、CSSの対応色指定・表示幅指定の整合を検査。r867の修正前テストは1,408成功・1失敗・1スキップ（この新テストが意図どおり失敗）。
- `tests/run_visual_tests.js`・`tests/visual/list_gauges.html`：Chromium実描画でPC/スマホの威信/友好度ゲージの下地・グラデーション・40/65/85/100%の幅を照合。寸法だけで色の喪失を見逃さない。
- `tests/README.md`：表示回帰の対象を明記。
- `js/config.js`：内部版番号をr868へ更新。
- `docs/audits/README.md`：本記録の索引を追加。

## 検証結果

- 修正前のr867相当のCSSへ新規テストを適用：**1,408成功・1失敗・1スキップ**。威信ゲージのCSS下地色欠落で再現失敗。
- 修正後の `node tests/run_tests.js`：**1,409成功・0失敗・1スキップ**。スキップは配布規則により存在しないフォント実体のサイズ検査。
- 修正後の `node tests/run_visual_tests.js`：**25検証グループ成功・0失敗**。新規のゲージ色・割合検査はPC1280×720/スマホ360×640における両ゲージをChromiumのcomputed styleで確認。
- `python tools/check_manual.py`：PASS。`python tools/simulation/test_player_focus_sim.py`：4件成功。
- IndexedDB競合等、今回のCSS修正に無関係な継続事項は未解決のまま。ゲーム起動の全プレイ分岐までは検証していない。

## 安全性・検証範囲

- 修正は4セレクタの復元に限定する。r853当時に撤去した別の旧CSS群を一括復活させず、後勝ちの重複テーマも導入しない。
- 新規のロジック・実描画回帰テストと既存テストを実行し、結果は実測に基づいて報告する。
- 管理Excel/BIN・シナリオ・セーブ形式・外部フォント実体は不変更。
