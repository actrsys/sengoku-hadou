# r858 旧PCサイドバーDOMと未到達初期化の撤去監査記録

## 対象と判断

- 正本：ChatGPTライブラリの `sengoku-hadou-main-r857-fonts-folder-empty.zip`（723エントリ、フォント実体は配布対象外）。
- 設計：`ARCHITECTURE.md` §1・§5・§6、`docs/manual/MAINTENANCE_POLICY.md`。表示しない旧処理の残置を避け、現行UIに複数の責務を作らない。
- 実コードを全件検索し、`#pc-sidebar` は `css/style.css` で端末を問わず `display: none !important`。`#pc-status-panel` と `#pc-command-area` はその内部にしか存在せず、現行の画面情報は `#pc-new-status-panel` / `#mobile-top-left`、コマンドは `#pc-new-command-area` / `#command-area` に描画している。
- `#sidebar-resizer` は元の `index.html` に存在しない。`UIManager.initSidebarResize()` は要素の不在で常に早期終了し、リサイズ用イベントリスナーは設定されない。旧DOMの存在と無関係にゲーム側の通常処理が成立することを確認した。
- `UIManager.panelEl` と `statusContainer` は旧DOMの非表示切替・空文字代入だけに用いられていた。現行のPC・スマホ状態変更は `pcNewUiContainer`、情報表示・コマンド表示は現行専用領域で行う。`tests/run_tests.js` のr529テストだけが旧DOMモックを利用していたため、現行UIへの検査に修正した。

## 改修内容

- `index.html`：旧PCサイドバー本体と不可視子要素3件を削除。
- `css/style.css`：旧サイドバーの非表示宣言と不要コメントを削除。現行パネル、地図、モーダル、スマホ下部操作バーのスタイルは変更しない。
- `js/ui.js`：旧DOM参照、旧サイドバー表示切替、空の状態パネル書込、呼び出されても即時終了するリサイズ初期化の全経路を削除。現行PC・スマホの画面更新とロード処理は変更しない。
- `tests/run_tests.js`：r529の切替テストを現行PCパネルへ移し、r857の旧CSS保護テストをr858の構造一式廃止検査へ更新（テスト総件数は増減なし）。
- `js/config.js`：内部版をr858へ更新。
- `docs/audits/README.md`：本記録へのリンク追加。
- ゲームルール、史実データ、バランス、保存・ロードの形式は無変更。

## 検証

- **修正前（r857）**：`node tests/run_tests.js` 1,396成功・1失敗（配布対象外の `data/fonts/title-abashiri-mincho.woff2` 確認）。
- **修正後（r858）**：同テスト1,396成功・1失敗。既知のフォント確認だけが失敗し、旧UI撤去のテストは成功。
- `node tests/run_visual_tests.js`：Chromium実描画の24ケース成功。PC/スマホ、低メモリ端末、画面遷移・モーダルを含む。
- `python tools/verify_excel_bin_parity.py`：共通・1560・1570の管理Excel/BIN一致。
- `node tools/verify_release_sources.js`：数式12,126+26,259+26,259=64,644件成功。
- `python tools/simulation/test_player_focus_sim.py`：4件成功（本編長期進行の代用ではない）。
- `python tools/check_manual.py`：現行ルールID・リンク・原文保全検査成功。
- ZIP全エントリCRC、変更ファイル一覧、内部版、フォント空フォルダを最終照合。

## 限界・残件

- 旧サイドバーは画面からの到達性・参照箇所を静的解析して撤去。実際の長期間のゲーム進行・すべてのイベント画面を通した手動検証は未実施。
- 別途定期監査の婚姻・外交条件履行結果の不一致リスクは今回対象外。ゲーム内で発生する経路を確認できていないため、未検証の防御コードを追加しない。
