# r956 未使用の外交・経済・会話・履歴・独立APIの撤去と正本維持 — 構造監査記録

## 対象と判断基準

- 正本はChatGPTライブラリの `sengoku-hadou-main-r955-structural-dead-api-cleanup-complete.zip`。
- `ARCHITECTURE.md` の第1節（実到達性、旧処理撤去、不要な版更新禁止）、第2節（状態・専門Systemの正本）、第5～6節（表示不変・回帰）、`docs/manual/MAINTENANCE_POLICY.md`、`docs/manual/TECHNICAL_REFERENCE.md` の「監査の目的」「AI改修時の必須ルール」「分割ルール」「外交・独立・ルール・共通計算」「UI」を参照。
- ゲームの仕様・値・計算順・表示・セーブ形式を変えず、製品から到達しない旧APIだけを撤去する。旧API名の完全一致探索は `js/`、`index.html`、テスト、現行技術文書を含めて行い、製品JSからの参照0件を確認。名前による動的反射の一般論だけでは到達性を断定しない。

## 旧メソッド7件と現行の正本

1. `ConversationStandingRules.usesIndependentDaimyoRegister()`：使われない口調判定ラッパー。現行は `getDaimyoSpeakerPosture()` を直接使用。
2. `EconomyRules.calcBuyHorseEfficiency()`：未使用の装備効率ラッパー。`calcBuyEquipEfficiency()` と、実際に呼ばれる馬の価格・費用・購入量APIを保持。
3. `EconomyRules.calcBuyGunEfficiency()`：同上、鉄砲用の未使用ラッパー。汎用効率計算と鉄砲の実使用APIを保持。
4. `HistorySystem.formatEntry()`：履歴正本の記録・取得・保存では呼ばれない旧表示文字列整形。`record()`、`getEntries()`、`serialize()`、`load()` を維持。
5. `IndependenceSystem.calcCastlePower()`：使われない城単体の旧戦力計算。独立判断に現用する `calcClanPower()` は維持。
6. `DiplomacyManager.clearDominationRelations()`：支配・従属解消の未使用旧一括入口。現在の状態変更は `changeStatus()` 等の正規経路を維持。
7. `DiplomacyManager.executeSubjugation()`：未使用の簡易従属処理。実プレイで使われる `applyDominationData()` と、その正規呼出し経路を維持。

削除対象7件について静的な製品からの呼出しはなく、テスト・現行技術文書も旧APIの存在を要求していなかった。削除対象を除く同5ファイル内の既存190メソッドの実装本体はr955と完全一致。新しい互換ラッパーや新規System、永続状態は追加していない。

## 採用しなかった候補

- `MapGraphService.getAdjacentIds` はstaticとinstanceの異なる用途で、重複定義ではない。
- `models.js` の同名getter/setterは意図された対。上書き重複ではない。
- `UIManager.trackLoadingTask` はマニュアルに記された画面ロード契約の公開入口で、現在の直接呼出しが少ないことだけを理由に撤去しない。
- `GameManager.getLegionById` などテスト対象の公開問い合わせAPIや、`SkillManager.SKILLS` 等の外部照会入口も単純な文字列回数だけで削除しない。残存候補は到達性・役割の追加検査を要する。

## 改修後の監査・回帰

- 第1群5件削除後：`node tests/run_tests.js` = **1,525成功、0失敗、1スキップ**。
- 第2群（外交2件）削除後：同 **1,525成功、0失敗、1スキップ**。
- r956版番号と、旧APIの復活を防ぎ現行入口の残存を検査する新しい構造テスト1件を追加後：**1,526成功、0失敗、1スキップ**。スキップは配布仕様上のフォント実体検査。
- ASTによる変更5クラスのメソッド単位の比較：旧197件→現190件、**削除7件以外の190件が本文完全一致**。追加・本体変更なし。
- 実ブラウザの `node tests/run_visual_tests.js` 終了コード0：PC・スマホ・低メモリ、外交・野戦・攻城・一覧、年初700ms・月末350ms連続通知の既存表示回帰に失敗なし。
- `python tools/check_manual.py` PASS：規則ID、リンク、旧文書原文復元、資料の優先順位。
- `python tools/verify_excel_bin_parity.py` PASS：共通・1560・1570のExcelとBIN一致。
- `node tools/verify_release_sources.js` PASS：主要数式12,126件、26,259件、26,259件一致。
- `python tools/simulation/test_player_focus_sim.py` は4件成功（近似シミュレーションであり自然プレイではない）。
- 未検証：旧型スマホ実機の長時間自然観戦、全史実イベントを含む長期の新旧セーブ完全比較。今回の変更は未使用メソッドの削除であり、現行の実行メソッド・ゲームルールは変更していないが、あらゆる動的呼出しを形式的に証明したものではない。

## 配布・差分

- 内容が変わらないファイルは元版のZIP項目を維持し、フォント実体を追加せず空の `data/fonts/` を保持。
- Pythonキャッシュ・ログ・一時ベンチマークは配布ZIPに含めない。ZIPのCRCと、r955からの全項目差分を検査。
- マニュアル本文・ルールID・Excel/BIN・CSS/HTML・セーブスキーマは無変更。`GameConfig.Meta.Version` のみr956へ更新。

### 変更ファイル（r955→r956、区分内昇順）

**追加**
- `docs/audits/r956_旧外交経済会話履歴独立API撤去と正本維持監査記録.md`

**更新**
- `docs/audits/README.md`
- `js/config.js`
- `js/conversation_standing_rules.js`
- `js/diplomacy.js`
- `js/economy_rules.js`
- `js/history_system.js`
- `js/independence_system.js`
- `tests/run_tests.js`

**削除**
- なし（既存ファイルの削除なし。旧メソッド7件を撤去）。
