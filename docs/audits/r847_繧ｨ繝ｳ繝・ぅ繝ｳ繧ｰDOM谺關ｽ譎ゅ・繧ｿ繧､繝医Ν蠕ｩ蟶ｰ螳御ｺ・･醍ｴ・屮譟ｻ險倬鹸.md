# r847 エンディングDOM欠落時のタイトル復帰完了契約

## 対象と根拠

- ChatGPTライブラリから取得した `sengoku-hadou-main-r846-fonts-folder-empty.zip`（内部版 `js/config.js` は r846）を原本とした。
- 定期監査で `EndingSystem.playEndingSequence()` の必要DOM欠落時に `UIManager.returnToTitle()` を待機していないことが指摘された。
- 実コードをNode隔離VMで実行し、タイトル復帰Promiseが未完了でもエンディングのPromiseが解決する問題と、復帰Promiseの非同期失敗が呼出元へ伝わらない問題を修正前の専用回帰2件で確認した。
- エンディングのHTMLは固定構成であり、通常UIからDOM欠落を発生させる操作経路は未確認。障害時の後始末に限定した修正である。

## 修正内容と責務

- `js/ending_system.js` のDOM欠落時の例外分岐で、既存の `UIManager.returnToTitle()` を `await` する。
- タイトル復帰の実装や世代判定は `UIManager` / `TurnManager` の既存正本に委ね、エンディング側には追加の状態管理や互換層を設けない。
- 正常エンディングのスタッフロール、暗転、入力遮断の所有権、タイトル復帰演出の時刻、ゲーム終了条件、データは無変更。
- 修正前の失敗2件は修正後成功。既存の例外復旧・シナリオ遷移に対するテストを再実行する。

## 検証と限界

- `node tests/run_tests.js`: 1,385件成功・1件失敗。失敗1件は配布対象外フォントの存在確認。新規2件は修正前にいずれも失敗し、修正後に成功。
- `python tools/check_manual.py`, `python tools/verify_excel_bin_parity.py`, `node tools/verify_release_sources.js`, `python -m unittest -q tools/simulation/test_player_focus_sim.py`: すべて合格。保護原文2,283行、管理ExcelとBIN一致、主要数式64,644件、補助シミュレーション4件成功。
- `node tests/run_visual_tests.js`: 成功。PC/スマホ/低メモリ端末、ロード、会話、戦闘UI等の実ブラウザ画面回帰を実施。
- 実ブラウザでのDOM消失障害の再現、自然プレイでの発生頻度、長期自然観戦は未検証。

## 変更ファイル

- 更新：`docs/audits/README.md`、`js/config.js`、`js/ending_system.js`、`tests/run_tests.js`
- 追加：`docs/audits/r847_エンディングDOM欠落時のタイトル復帰完了契約監査記録.md`
- 削除：なし
