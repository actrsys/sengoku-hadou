# r854 面談・国主評定のCSS正本統合と表示不変監査

## 対象と改修判断

- 正本：ChatGPTライブラリの `sengoku-hadou-main-r853-fonts-folder-empty.zip`（r853、719エントリ）。旧r852・r853で確定したUIを仕様とする。
- 現行根拠：`ARCHITECTURE.md` の AUDIT-SCOPE／「古い処理を後勝ちで打ち消さない」、`docs/manual/TECHNICAL_REFERENCE.md` のCSS正本・固定論理画面・国主評定規則。
- 対象：`css/style.css` の面談 `interview-session-*` と国主評定 `legion-council-*`。PC/スマホ・会話中/一覧・評定の一覧/命令画面を含む。
- 確認した問題：前半のUI定義に以前のフォント寸法・操作枠寸法が残り、後方の「面談・評定 UI密度」追記で上書きしていた。維持管理時の誤修正と回帰原因となる二重の値管理。

## 修正内容

1. CSS構文解析と重複セレクタ照合により、面談・国主評定の**重複定義50組**を前方の本来の定義へ統合。文字サイズ、会話選択肢の二段グリッド、モーダルの行構成、評定命令枠のモバイル余白・サイズを後勝ち定義から移動。
2. 面談の検索・並べ替えのPC 14px・スマホ11pxの現行値を各本来の入力定義へ反映し、末尾の二重指定を削除。
3. `interview-choice-btn` の固有外観と状態、PC/スマホの目的付き差分、選択肢の1件・3件配置は必要な現行UIなので存置。動的状態クラス・`!important` の既存契約も維持。
4. `#legion-council-order-modal` のモバイル内容枠の3分割定義を一つに統合。重複していた同値の終了ボタン指定を削除。
5. 使われなくなった調整追記コメントと空行だけを整理し、同一セレクタ数が2件以上の種類を69→19種類へ削減。残りは他の画面やルート変数であり、実使用・優先度確認なしの一律変更はしない。
6. 再発防止として、面談・評定の代表的な正本セレクタが重複しないテスト1件を追加。版番号を `GameConfig.Meta.Version = 'r854'` へ更新。

## 表示が変わらないことの検証

- 実Chromiumを用い、既存の `command_interview_states.html`・`legion_council.html` フィクスチャをPC/スマホそれぞれで比較。**計4状態、374 DOM要素**の計算スタイル（対象の外観・寸法・グリッド・余白ほか）と位置・矩形に差異0。
- モード切替直後のCSS transitionを計測するとサブピクセル差が出るため、計算スタイル比較ではアニメーション・トランジションを無効化した**安定状態**を比較。アニメーション仕様自体は無変更。動的なマウス操作、すべての会話文言、長時間のゲーム進行に対する完全な画像一致は未検証。
- `node tests/run_visual_tests.js`：PC・スマホ・低メモリ端末を含む画面回帰24項目成功。
- `node tests/run_tests.js`：**1,393件成功、1件失敗**。失敗は配布ZIPでフォント実体が除外された既知の `r540` 先読み検査。今回追加したCSS正本化検査は成功。
- `python tools/check_manual.py`：原文とリンクを含む整合検査成功。
- `python tools/verify_excel_bin_parity.py`：共通・1560・1570の管理ExcelとBINが一致。
- `node tools/verify_release_sources.js`：主要数式12,126 + 26,259 + 26,259 = **64,644件**に不足・破損なし。
- `python tools/simulation/test_player_focus_sim.py`：4件成功。

## 変更と対象外

- 変更：`css/style.css`、`tests/run_tests.js`、`js/config.js`、`docs/audits/README.md`。
- 追加：本監査記録。
- HTML構造・ゲームロジック・史実データ・数値バランス・セーブスキーマ・フォント参照は変更なし。
- CSS以外の未解決監査指摘（外交、月次、IndexedDB）は今回のCSS整理とは独立し、根拠のない予防改修を行わない。
