# r957 面談の年長親族判定を会話Rulesへ統一 — コード構造監査

## 対象・範囲

- 正本：ChatGPTライブラリの `sengoku-hadou-main-r956-structural-dead-legacy-api-cleanup-complete.zip`。
- `ARCHITECTURE.md` 第1節・第2節（不要な重複・正本・人物会話）、第5・6節（表示不変・回帰）、`docs/manual/MAINTENANCE_POLICY.md`、`docs/manual/TECHNICAL_REFERENCE.md` の監査方針・責務分離・会話関係を照合。
- 対象：`InterviewSystem` の親族の噂の所属文・能力文に用いる年長親族判定。人物の血縁関係自体の求め方、忠誠や能力の評価、表示文、ゲームデータは対象外。

## 新規発見と実到達性

- `InterviewSystem._isRumorSeniorFamilyRelation()` が7つの関係コードをローカル配列で判定していた。
- `ConversationStandingRules.isSeniorFamilyRelation()` も全く同じ7関係コードを既に定義し、他の口調・外交表現で使っていた。
- 面談の親族噂は既に `_getRumorFamilyRelation()` を通じて `ConversationStandingRules.getSpeakerFamilyDialogueRelation()` を使用しており、共通Rulesのロード・責務への依存は従来からある。画面の通常表示経路で到達するため、重複定義をなくす価値がある。

## 改修

- `_isRumorSeniorFamilyRelation()` を撤去。
- 面談の親族所属文・能力文の2か所を `window.ConversationStandingRules.isSeniorFamilyRelation(relation)` へ直結。
- ほかの計算式・条件分岐・メソッド・会話文は無変更。新System・互換ラッパー・永続状態なし。
- マニュアル記述の仕様変更はなく、現行マニュアル本文は更新しない。

## 不採用と継続調査

- 顔画像パス検査は `UIInfoManager` と `StatPresenter` に同じ実装があり、統合試作を検討。ただし独立表示テスト10件に追加依存を生じたため、この回では試作を撤回した。配布変更には含めない。単純な重複数だけで統合しない。
- 情報一覧のテキスト縮小は複数画面で似た局所関数を持つが、描画責務・テスト依存の確認を要するため無変更。
- 役職派生フラグや外交移管の直接代入候補は、低レベル確定処理とイベント固有の順序が絡む。静的検索だけで不具合と判定せず無変更。

## 改修・監査後の検証

- 修正前 `node tests/run_tests.js`：1,526成功・0失敗・1スキップ。
- 改修後 `node tests/run_tests.js`：**1,527成功・0失敗・1スキップ**。年長7分類、年少5分類、無関係・nullで所属文・能力文の敬語を確認。スキップ1件は未同梱のフォント実体検査。
- `node tests/run_visual_tests.js`：終了コード0。PC・スマホ、低メモリ、面談・一覧・外交・戦争・年初月末連続通知の既存実ブラウザ表示回帰が成功。
- `python tools/check_manual.py`：PASS（規則ID、参照、原文保全）。
- `python tools/verify_excel_bin_parity.py`：共通／1560／1570の管理ExcelとBINが一致。
- `node tools/verify_release_sources.js`：主要数式12,126件／26,259件／26,259件が一致。
- `python tools/simulation/test_player_focus_sim.py`：4件成功。近似シミュレーションであり長期実ゲームとの同一性は示さない。
- 未検証：低性能スマホ実機での長時間自然観戦、すべての史実イベントを含む長期セーブ比較。

## 配布・変更内容（r956 → r957）

**追加**
- `docs/audits/r957_面談年長親族判定の会話Rules正本統合監査記録.md`

**更新**
- `docs/audits/README.md`
- `js/config.js`
- `js/interview_system.js`
- `tests/run_tests.js`

**削除**
- なし（`js/interview_system.js` 内の旧補助メソッド1件を撤去）。

`js/config.js` の版番号は唯一の正本 `GameConfig.Meta.Version` を r957 とした。配布フォントは新規収録せず `data/fonts/` 空ディレクトリを維持。未変更のシナリオ・画像・CSS・HTML・セーブ方式をそのまま引き継ぐ。
