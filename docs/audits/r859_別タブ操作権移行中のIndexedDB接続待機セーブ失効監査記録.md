# r859 別タブ操作権移行中のIndexedDB接続待機セーブ失効

## 監査対象と判断

- 正本：ChatGPTライブラリ直下 `sengoku-hadou-main-r858-fonts-folder-empty.zip`。内部版 r858、724エントリ、フォント実体なし。
- 適用規則：`ARCHITECTURE.md` の `RULE:TAB-SESSION` と `RULE:RULE-SAVE`、`docs/manual/MAINTENANCE_POLICY.md`。既存の操作権と保存要求寿命の判定を共用し、別のタブ管理や保存互換処理は作らない。
- 対象：`js/save_manager.js` の手動・自動保存、IndexedDB共通 `saveToDB()`。`TabSessionCoordinator` / `SaveManager._captureSaveRequestCurrent()` は従来どおり変更しない。

## 確認した不具合と再現条件

旧タブの手動セーブは `isRequestCurrent()` を確認してから `saveToDB()` を呼ぶ。しかし、`saveToDB()` は `await initDB()` でIndexedDB接続完了を待つため、ここで別タブが操作権を取得しても旧タブのトランザクションはその後に開始される。自動保存も同様。

製品コードを実行する隔離テストで、次の順序を再現した。

1. 旧タブで保存処理を開始し、要求が有効であることを確認する。
2. IndexedDBの `open` 完了待ちで制御を返す。
3. 新タブに操作権が移り、旧タブの保存要求が失効する。
4. 旧タブのDB接続を完了させる。

**修正前：失効後の旧タブから書込み1件。** 保存完了ダイアログが表示されない場合でも、スロット自体には古いデータが保存される。通常端末の接続待機でも起こり得る競合であり、単なる破損データの人工境界とは異なる。実ブラウザ2タブでの確率・発生頻度は未測定。

## 改修内容

- `saveToDB(key, data, canStartWrite)` に既存の保存要求寿命関数を渡し、`await initDB()` の直後、**新しいreadwriteトランザクションを作る直前**に操作権を再確認する。
- 失効済みならDB接続を閉じ、`false` を返して書込・読戻し・成功通知を行わない。手動・自動保存ともに同じ共通処理を使用。
- 書込後の失効確認も維持し、後続の無意味な読戻しを避ける。
- 直接 `saveToDB(key, data)` を呼ぶ既存テストの契約は変更しない（第3引数は任意）。
- **既に開始したIndexedDBトランザクションを別タブから原子的に中断する保証は追加していない。** マニュアルの限定保証を維持する。

## 検証

- 新しい `r859 IndexedDB接続待ちで操作権を失った手動・自動保存は書き込まない` テスト：手動失効0件、自動失効0件、正常な手動保存1件、未使用DB接続のclose、保存ガード解放を確認。
- ロジック全体：**1,397件成功・1件失敗**。失敗は従来からの配布対象外 `data/fonts/title-abashiri-mincho.woff2` の存在確認。
- `node tests/run_visual_tests.js`：Chromium画面回帰24件成功。
- `python tools/verify_excel_bin_parity.py`：共通・1560年・1570年の管理Excel/BIN一致。
- `node tools/verify_release_sources.js`：主要数式64,644件検査成功。
- `python tools/simulation/test_player_focus_sim.py`：4件成功。長期自然進行の代替ではない。
- `python tools/check_manual.py`：ルールID・リンク・旧原文保全検査成功。

## 適用範囲と残件

ゲームルール、歴史データ、セーブ構造、CSS、UI画面は無変更。通常の保存は従来どおり可能。別タブ間の完全な排他ロックは提供しない。旧タブのトランザクション開始済みケースや実機2タブの競合率は引き続き個別検証対象。別途監査で報告された城所有者IDの文字列ケースは、現行 `Castle` モデルと `CastleManager.setOwnerIdRaw()` が数値化するため、通常到達性が未確定として今回は無変更。
