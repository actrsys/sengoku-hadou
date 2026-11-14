# r856 CSS未参照ルール・列セレクタ・変数の精査

## 監査対象と方針

- 正本：ChatGPTライブラリの `sengoku-hadou-main-r855-fonts-folder-empty.zip`（内部バージョン r855、721項目）。
- 設計根拠：`ARCHITECTURE.md` §1 / §5 および `docs/manual/TECHNICAL_REFERENCE.md` の静的CSS一元管理、後勝ち旧定義撤去、PC16:9・スマホ9:16と `body.is-pc` の現行契約。
- `css/style.css`、`css/animation.css`、`css/game_fonts.css` のCSS構文と、`index.html`、`js/*.js` を照合。CSS上のIDセレクタ102種、クラスセレクタ621種を抽出し、HTML・JSに直接出現しない候補を再調査した。文字列検索で一致しないだけで削除せず、JSのテンプレート生成（例：`hex-${visualTerrain}`、`legion-color-${legionId}`）を個別追跡。

## 改修内容と根拠

1. `css/style.css` の **`.toggle-btn` 1ルール**を削除。現行UIは `.ui-toggle-btn` を使うと設計資料で明記され、`index.html` および全本編JSに旧 `.toggle-btn` 単独クラスを生成・参照する経路がない。既存の `.ui-toggle-btn` の外観と音声責務は変更しない。
2. `.select-item` の数値列グループから、実DOMに生成・参照されない **`.col-morale` / `.col-training` / `.col-loyalty` 3セレクタ**を削除。親ルールと他の数値列の右寄せ指定は変更しない。
3. 使用元のない **CSSカスタムプロパティ6個**を削除：`--panel-bg`、`--border-color`、`--header-height`、`--title-ink-2`、`--title-gold-dim`、`--title-red`。CSS内の `var()` 参照、HTML・JS側の文字列参照がないことを検査。使用中のCSS変数や役割別 `:root` ブロックはそのまま保持。
4. 上記旧定義の再導入を防ぐ回帰テスト1件を追加し、動的生成する地形・軍団色と現行の切替ボタンのCSSが存続することも同時に確認する。
5. `js/config.js` の内部バージョンを `r856` に更新。ゲームルール、データ、セーブ形式、JavaScriptの振る舞いは変更しない。

**削除を見送った候補：** `.hex-plain` / `.hex-forest` / `.hex-river` / `.hex-mountain` / `.hex-sea` と `.legion-color-1`～`.legion-color-8` は、JS内に同じ文字列が直書きされないが、`field_war.js`・`ui_map.js` が動的クラスとして生成する。未使用と見なさない。CSSの完全な到達性解析や全ゲーム状態のピクセル完全一致は実施していない。

## 検査・検証

- 元のr855と改修作業ツリーのSHA-256内容比較：更新ファイルは `css/style.css`、`docs/audits/README.md`、`js/config.js`、`tests/run_tests.js`、追加ファイルは本記録のみ。
- CSS候補抽出後の未参照クラスは上記の動的生成13種のみ。IDセレクタの未参照候補は0種。単純な文字列抽出による候補集計であり、全セレクタの実ブラウザ到達性の証明ではない。
- `node tests/run_tests.js`：**1,395件成功・1件失敗**。失敗は既知の `data/fonts/title-abashiri-mincho.woff2` 不在（配布ZIPのフォントは空フォルダ運用）。今回追加したCSS再発防止テストは成功。
- `node tests/run_visual_tests.js`：PC・スマホを含む既存の描画回帰試験成功。
- `python tools/verify_excel_bin_parity.py`：共通・1560・1570の管理Excelと実行用BINの一致。
- `node tools/verify_release_sources.js`：主要数式12,126＋26,259＋26,259＝64,644件の検査成功。
- `python tools/simulation/test_player_focus_sim.py`：4件成功。これは本編長期自然進行の試験ではない。
- `python tools/check_manual.py`：本記録を追加したうえで再検査。

## ファイル区分

- 更新：`css/style.css`、`docs/audits/README.md`、`js/config.js`、`tests/run_tests.js`。
- 追加：`docs/audits/r856_CSS未参照ルールと変数の精査記録.md`。
- ファイル削除なし。CSS内の未参照定義のみ撤去。フォントファイル実体を配布に含めず、`data/fonts/` の空フォルダを保持。
