# r901 AI自動戦争リザルトの結果SE欠落監査記録

## 1. 監査対象
- 正本：ChatGPTライブラリの `sengoku-hadou-main-r900-modal-handoff-lifecycle-utf8-complete.zip`（内部版 r900）。元ZIPと作業ソースの主要ファイルをバイト単位で照合した。
- 現行の判断基準：`ARCHITECTURE.md` の「必要な改修だけ行う」「UIと音声の責務を分離する」「ボタンSEを個別再生しない」「表示・戦闘計算を守る」。`docs/manual/MAINTENANCE_POLICY.md` および `docs/manual/TECHNICAL_REFERENCE.md` の `js/audio.js`・`js/war_effort.js` 担当節を照合。

## 2. 監査範囲
- r899～r900共通暗幕の監視・強制初期化と、通常会話／専用リザルトの遷移寿命。
- 戦争結果画面のBGM停止・SE鳴動・確定後のBGM復帰、およびプレイヤー参戦とAI自動攻城戦の分岐。
- 戦闘計算・管理Excel/BIN・正式マニュアル・通常画面の回帰。

## 3. 新規発見と改修
**AI自動攻城戦等の結果SE欠落（重要度：中）**： `js/war.js` の `startSiegeWarPhase()` はプレイヤー関与時のみ戦闘BGMを始め、AI自動処理では既存BGMを維持する。一方で `js/war_effort.js` の `prepareWarResultAudio()` は「BGMが戦闘曲ではない、またはbgmPlayerがない」時点でreturnしていた。結果、`showWarOutcome()` / `showWarOutcomeAsync()` がリザルトを公開しても結果SEを呼ばないケースがある。

**採用した改修**：結果SEは結果表示の共通入口で必ず鳴らし、現在再生している曲が戦闘BGMの場合にだけ停止する。平時／イベントBGMは止めず、従来の `restoreWarBgmAfterResult()` の復帰・世代管理も変更しない。音声資産・音量の正本は引き続き `AudioManager` に置き、別の音楽管理や画面別SEを増やさない。

**比較検証**：AI戦争で平時BGMが鳴っている場合は、改修前の結果SE呼出し0回から改修後1回に変化し、BGM停止は0回。戦闘曲が既に停止している場合もSE1回。通常のプレイヤー攻城戦は従来どおり「戦闘BGM停止→勝利SE」の順番。

## 4. 継続事項
- スマホ実機での長時間連戦時の音声聴感・OSによる音声休止／再開は未検証。
- 共通暗幕の監視重複・5秒解除についてはr900の是正を維持。今回の正常回帰では追加の確定不具合なし。
- 専用リザルトと戦後の連続イベント（捕虜・外交等）の全組合せを実戦で網羅したわけではない。

## 5. 検証結果
- `node tests/run_tests.js`：**1,459 passed, 0 failed, 1 skipped**。新規1件の回帰でAI自動戦争・停止済み戦闘BGM・通常の戦闘BGMの三分岐を確認。
- `node tests/run_visual_tests.js`：PC／スマホ／低メモリ相当・会話handoff等の既存ブラウザ回帰成功。
- `python tools/check_manual.py`：現行規則・旧原文保護・規則ID・リンクの検査成功。
- `python tools/verify_excel_bin_parity.py`：共通・1560・1570の管理ExcelとBINの一致。
- `node tools/verify_release_sources.js`：上記三系列の数式12,126＋26,259＋26,259件（計64,644件）一致。
- 実端末での聴感検証は**未実施**。Node.jsによる音声呼出し順のテストを実音声測定と混同しない。

## 6. 改善提案・採否・変更範囲
- 今回の1件は通常の観戦／AI自動戦争で到達するため採用。共通暗幕に根拠のない追加ガード、未使用画像・CSSの無関係な整理、演出待機時間変更は見送り。
- **更新**：`js/war_effort.js`、`js/config.js`、`tests/run_tests.js`、`docs/audits/README.md`。
- **追加**：`docs/audits/r901_AI自動戦争リザルトの結果SE欠落監査記録.md`。
- **削除**：なし。ルール本文・管理Excel・BIN・音楽素材・リザルトViewは変更なし。
