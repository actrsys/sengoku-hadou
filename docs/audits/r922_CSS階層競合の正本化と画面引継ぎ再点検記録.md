# r922 大名選択CSSの後勝ち競合解消・共通画面引継ぎ再点検

- 基準正本：ライブラリ `/sengoku-hadou-main-r921-field-war-top-edge-overlay-safe-utf8-complete.zip`（完全版・内部版r921）。
- 範囲：`css/style.css` の野戦・モーダル表示ルール、`UIManager` の共通画面引継ぎ、`UIInfoManager` の大名選択確認、PC・スマホの実ブラウザ回帰。
- ゲームロジック・マスター・画像・フォント参照・野戦のカメラ／兵数配置・シナリオ開始条件は変更なし。

## 調査結果と実装の意味

1. r921で変更した `#fw-map` は、既存の1規則の `overflow: hidden` を `visible` に修正したもの。末尾への追加上書きや新しい状態クラスの残置はない。野戦・共通モーダル系の完全に同じセレクタ／同じスコープにおける重複ブロックもなし。
2. ただし大名選択確認にはCSSの矛盾があった。標準重なり順の正本（`#scenario-modal, #war-modal, #field-war-modal, #daimyo-confirm-modal`）は `z-index:5000` であるのに、大名選択確認の個別外観ブロックが再度 `z-index:4000` を指定して上書きしていた。暗幕 `#modal-handoff-backdrop` は4999。CSS計算結果と要素へのヒットテストで、両者を重ねた検査条件ではPC/スマホとも確認ボタンが暗幕の下に入ることを確認した。これは**常時ゲーム中で重なる実害を確認したという意味ではなく**、共通階層契約違反としての潜在的な問題。
3. 古い個別 `z-index:4000` のみを削除し、重なり順の唯一の正本5000を有効にした。汎用 `.modal.hidden` と同義の `#daimyo-confirm-modal.hidden { display:none !important; }` も不要な重複として削除。ルールを末尾に追記して打ち消す方式は採用していない。
4. 通常状態（暗幕が非表示）のPC/スマホの同一HTMLスクリーンショットをr921とr922で画素比較し、差分0を確認。暗幕との階層比較では修正前 4000<4999、修正後 5000>4999 でボタンが上に来る。
5. 元の制作課題へ戻り、会話→結果、通常一覧終了→次画面公開、迎撃、災害イベント地図、数量選択、評定内の親子モーダルを追跡。評定の子画面や大名選択の地図上オーバーレイは責務が異なるため、単なる直接表示を根拠に機械的一括置換はしない。今回の調査範囲で追加の実到達不具合は確認されず、無根拠なJS変更は行わない。

## 検査結果

- `node tests/run_tests.js`：1,484成功／0失敗／1スキップ（配布対象外のフォント実体）。
- `node tests/run_visual_tests.js`：全既存PC/スマホ回帰PASS。新規の大名選択階層テスト（PC/スマホ）もPASS。野戦最上段・外交結果・共通一覧・災害地図の回帰を含む。
- `python tools/check_manual.py`：PASS（原文保全・索引・現行規則）。
- `python tools/verify_excel_bin_parity.py`：共通・1560・1570一致。
- `node tools/verify_release_sources.js`：主要数式64,644件一致。
- `python tools/simulation/test_player_focus_sim.py`：4件PASS。
- 限界：古いスマートフォン実機での長時間連続プレイ、全イベント実操作の網羅は未実施。今回の暗幕重なりスクリーンショットは階層契約の検査用であり、通常プレイにおける実発生頻度を意味しない。

## 変更ファイル（昇順）

**更新**：`css/style.css`、`docs/audits/README.md`、`js/config.js`、`tests/run_visual_tests.js`。

**追加**：`docs/audits/r922_CSS階層競合の正本化と画面引継ぎ再点検記録.md`。

**削除**：なし。配布ZIPへテスト用スクリーンショット・Pythonキャッシュ・入れ子フォルダを追加しない。
