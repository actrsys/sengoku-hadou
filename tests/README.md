# 自動テスト

外部ライブラリは不要です。Node.js がある環境でプロジェクト直下から次を実行します。

```bash
node tests/run_tests.js
```

Windows ではプロジェクト直下の `run_tests.bat` をダブルクリックしても実行できます。

現在は、設定値の中央管理、外交通行判定、兵力自動配分、援軍編成、SkillManager の境界、SelectorModal の共通初期化、HTML の script 参照などを検査します。

リファクタ時は「現在の挙動を固定するテスト」を先に追加してからコードを移動する方針です。
