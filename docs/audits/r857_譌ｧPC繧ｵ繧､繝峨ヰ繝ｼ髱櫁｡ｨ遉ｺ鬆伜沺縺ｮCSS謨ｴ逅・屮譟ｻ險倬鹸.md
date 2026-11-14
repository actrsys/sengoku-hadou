# r857 旧PCサイドバー非表示領域のCSS整理監査記録

## 正本・対象

- 正本：ChatGPTライブラリ `sengoku-hadou-main-r856-fonts-folder-empty.zip`（r856、722エントリ）。
- 指針：`ARCHITECTURE.md` §1/§5、`docs/manual/TECHNICAL_REFERENCE.md` のCSS責務、現行UIを優先し、古いルールの後勝ち上書きを残さない規則。
- 調査範囲：`css/style.css` の複合セレクタ、PC用入れ子規則、静的DOMの `#pc-sidebar` とJavaScript参照、PC/スマホ表示区分。静的クラス未参照の文字列検索だけを削除根拠としない。

## 再現・安全性の根拠

- `index.html` の `#pc-sidebar` 内に `#pc-status-panel` と `#pc-command-area` があるが、`#pc-sidebar { display: none !important; }` が端末・状態に関係なく常に適用される。
- `#sidebar-resizer` はHTML上に存在せず、JavaScriptの `initSidebarResize()` は両要素が揃わない場合に戻る。旧ハンドルのCSSは適用先がないため撤去する。JavaScript側の未到達初期化経路は今回変更しない。
- 上記非表示領域の内側にだけ適用されるPC専用余白・フォント・背景指定は表示結果に寄与しない。大名選択時の `#pc-sidebar` 非表示指定も共通ルールの重複。
- 実使用中の `#pc-new-ui-container`、`.command-grid`、`.sp-info-header` 共通ルール、状態・入力・動的生成クラスは変更しない。HTML・JavaScriptの旧DOMと参照は別途利用者を追う必要があり、今回削除しない。

## 改修

- `body.is-pc` 内の `#pc-sidebar` / `#sidebar-resizer` 重複非表示、参照先のない `#sidebar-resizer` ルール、および表示されない旧PC情報パネル・コマンド領域の内部レイアウト宣言を撤去。
- 大名選択時の旧PCサイドバーに対する冗長な非表示セレクタ2件を整理。ほかの大名選択時UI非表示指定は維持。
- `js/config.js` r857、`tests/run_tests.js` に再発防止検査を1件追加。
- ゲームルール・シナリオ/マスター・セーブ形式・通常の画面構造は変更なし。

## 検証

- `node tests/run_tests.js`：**1,396成功・1失敗**。唯一の失敗はr540フォント先読みテストで、フォント空フォルダ配布により `data/fonts/title-abashiri-mincho.woff2` が存在しないことによる既知の `ENOENT`。r857の新しいCSS回帰は成功。
- `node tests/run_visual_tests.js`：実ChromiumのPC/スマホ/低メモリを含む **24項目成功**。旧非表示領域のレイアウト改変は画面回帰に影響なし。
- `python tools/verify_excel_bin_parity.py`：共通・1560・1570の管理ExcelとBINが一致。
- `node tools/verify_release_sources.js`：主要数式12,126＋26,259＋26,259＝**64,644件正常**。
- `python tools/simulation/test_player_focus_sim.py`：**4件成功**。本編長期進行テストの代用ではない。
- `python tools/check_manual.py`：ルール・内部リンク・旧原文の保全検査成功。
- 元のr856と変更後の内容差は、`css/style.css`・`js/config.js`・`tests/run_tests.js`・`docs/audits/README.md` の4ファイル変更と本記録1ファイル追加だけ。CSS本体は693バイト減。
- 旧非表示領域の安全性は共通の `display:none !important` と現行HTML構造の照合に基づく。実ゲームの全状態・全複合セレクタの到達性を証明したものではない。
