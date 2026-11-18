# r936 地図光彩・軍団マーカーの無変更DOM書換抑制

## 監査対象・設計方針

- 親版：`sengoku-hadou-main-r935-zero-soldier-manual-division-complete.zip`（完全版）。
- 現行規則：`ARCHITECTURE.md` の責務分離・旧処理撤去・低メモリ端末向けの無用な再描画禁止・PC16:9／スマホ9:16を優先。`docs/manual/MAINTENANCE_POLICY.md` は変更要否を実到達性と測定結果で判断する。
- 範囲：`UIManager.updateCastleGlows()`（`js/ui_map.js`）。外交の状態、拠点の所有者、選択勢力、軍団IDは既存ゲーム状態が唯一の正本。表示専用の永続キャッシュ・監視器・タイマーを増設しない。

## 旧処理の重複・性能上の問題

通常描画・大名選択描画に分かれた両経路で、すべての拠点カードから `glow-blue/red/green` を削除し、直後に同じクラスを再付与していた。軍団マーカーも `.hidden` を毎回追加・削除していた。この経路は `renderMap()` と拠点所有変化・情報画面の同期で通常到達する。

## 変更内容

- 地図Viewに `_syncCastleGlowCard(card, glowClass, hideLegionMarker)` を置き、通常表示と大名選択のDOMクラス同期を共通化。元の二重クラス書換処理は撤去。
- `classList.toggle(token, force)` のネイティブな同一状態無変更特性を用い、実際に表示が変わるクラスだけ更新。DOMから状態を読むため、古いシナリオや月のキャッシュを残さない。
- 外交関係のキャッシュは従来どおり**1回の同期描画だけ**の局所 `Map`。大名選択中は生成しない。外交取得順、青・赤・緑の判定順、基準勢力0の扱い、軍団表示条件は保持。
- `js/game.js`・戦闘・AI・乱数・セーブ・管理Excel/BIN・CSS・HTML・画像は無変更。

## 新旧の実ブラウザ比較

Chromium（合成fixture、300拠点・一部マーカー有り）で、r935の実際の `updateCastleGlows()` とr936版を同じDOM・ゲーム条件で個別実行し、通常状態、選択拠点変更、大名選択（選択あり／なし）、プレイヤー勢力変更の**5条件**について各拠点の光彩クラス集合・CSS `filter`・マーカー表示を比較し**全件一致**。

300拠点を初期同期後に200回繰り返す合成ベンチマーク（7回測定、中央値、実ゲームFPSではない）：

| 測定 | r935 | r936 |
|---|---:|---:|
| `updateCastleGlows()` 200回 | 126.9ms | 39.9ms |
| クラス属性変更通知（200回） | 130,800件 | 0件 |

無変更連続描画の処理時間はこの条件で約68.6%減。環境・拠点数・他処理の負荷で変化し、地図全体のフレームレートを意味しない。クラス変化が必要な場合は従来どおり更新される。

## 回帰・設計照合

- `node tests/run_tests.js`：**1,497成功、0失敗、1スキップ**（配布ZIPに実フォント非収録）。旧描画の再使用、外交関係の一回限り共有、正常遷移・変更時更新・無変更DOMを確認。
- `node tests/run_visual_tests.js`：PC・スマホの既存実描画回帰全件成功。追加テストで実CSSの外交別filter、軍団マーカー、通常／大名選択、同じ状態20回更新時のクラス属性変更0件を確認。
- `python tools/check_manual.py`：PASS。`python tools/verify_excel_bin_parity.py`：共通・1560・1570 PASS。`node tools/verify_release_sources.js`：主要数式合計64,644件の保持検査PASS。`python tools/simulation/test_player_focus_sim.py`：4件成功。
- 未検証：古いスマートフォン実機の長時間操作・実測FPS・GPUメモリピーク。画面の見た目が変わらないことを合成fixtureと既存回帰で確認したが、実機を網羅した保証ではない。

## ファイル変更（昇順）

- **更新**：`docs/audits/README.md`、`js/config.js`、`js/ui_map.js`、`tests/run_tests.js`、`tests/run_visual_tests.js`。
- **追加**：`docs/audits/r936_地図光彩と軍団マーカーの無変更DOM書換抑制監査記録.md`。
- **削除**：なし。
