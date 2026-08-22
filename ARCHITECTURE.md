# 戦国覇道 コード構成ガイド

この文書は「どこに何があるか」を迷わないための索引です。
専門部署化は **ファイルを細かく増やすこと自体が目的ではありません**。同じ概念・計算・状態変更の正本を1か所にし、外部からの入口を少なくすることを優先します。

## 分割ルール

新しいJSファイルは、原則として次のどれかを満たす場合だけ追加します。

1. 複数の既存ファイルから同じ処理が必要になる。
2. 現在のファイルに明確に別の責務が混ざっている。
3. 単体でテストでき、再利用されるまとまりである。
4. まとまった独立領域が大きくなり、元ファイルの全体像を損ねている。
5. 他部署から参照される明確な窓口（Manager / Rules / Service / View）になる。

数十行しかなく、そのファイルからしか使わない補助処理は、原則として元の部署内に置きます。

## 入口・基盤

- `js/app_bootstrap.js` — ブラウザ起動処理。フォント、固定HTMLボタン、viewport、離脱警告。
- `js/config.js` — ゲームバランス値の正本。
- `js/constants.js` — 状態文字列などの共通定数と共通状態判定。
- `js/game.js` — GameManager。ゲーム全体の司令塔。専門部署へ仕事を振る。
- `js/turn_manager.js` — 月初・各拠点ターン・月末の進行順を管理。
- `js/data_manager.js` — シナリオ、CSV/BIN、地図データの読み込み。
- `js/save_manager.js` — セーブ、ロード、IndexedDB、オートセーブ。

## ルール・共通計算

- `js/domestic_rules.js` — 内政、訓練、徴兵。
- `js/economy_rules.js` — 収入、交易、購入価格、経済計算。
- `js/personnel_rules.js` — 相性、調査、登用、褒美。
- `js/game_math.js` — 複数部署から使う小さな汎用数値処理。小さいが共通依存なので独立を維持。
- `js/stat_presenter.js` — 能力ランクなど表示用整形。小さいがRulesへHTML生成を戻さないため独立を維持。
- `js/skill_manager.js` — 技能文字列の解釈と技能効果の唯一の窓口。

## 所属・拠点・地図

- `js/affiliation_system.js` — 武将所属・移動・所属関係。
- `js/castle_manager.js` — 城主・城所有者など拠点状態の管理。
- `js/map_graph.js` — 隣接・到達可能性・海路など地図接続。
- `js/map_generator.js` — 地図描画用データ生成。

## 戦争

- `js/war.js` — WarManagerの主要な入口。
- `js/war_effort.js` — 攻城戦・戦争進行の既存大規模処理。今後の整理候補。
- `js/field_war.js` — 野戦。Rules / View / AI がまだ混在しており今後の整理候補。
- `js/troop_allocation.js` — 兵力自動配分の正本。
- `js/reinforcement_service.js` — 自軍・同盟・諸勢力援軍編成の正本。

`troop_allocation.js` と `reinforcement_service.js` は小さいものの、複数の戦争入口から共通利用され、計算重複防止の役割が明確なため独立を維持します。

## AI・外交・勢力

- `js/ai.js` — AI全体。まだ巨大で、戦争・内政・外交判断の分離候補。
- `js/ai_operation.js` — AI作戦。
- `js/ai_staffing.js` — AI人員配置。
- `js/diplomacy.js` — 外交。会話・ルール・AI判断が混在しており整理候補。
- `js/faction_system.js` — 派閥。
- `js/independence_system.js` — 独立。
- `js/strategy_system.js` — 調略。
- `js/kunishu_system.js` — 諸勢力。

## UI

- `js/ui.js` — UI全体の司令塔。まだ大きく、画面固有処理の整理候補。
- `js/selector_modal_view.js` — 共通SelectorModalのガワ・初期化。
- `js/ui_info.js` — 情報一覧の共通処理と勢力系情報。
- `js/ui_info_busho.js` — 武将一覧・武将詳細。画面固有処理はここに留める。
- `js/ui_info_kyoten.js` — 拠点一覧・拠点詳細。
- `js/ui_slider.js` — 数量・兵数などの入力UI。
- `js/ui_map.js` — 地図UI。
- `js/ui_settings.js` — 設定UI。
- `css/style.css` — 静的な見た目の正本。JS側は状態値のみCSS変数等で渡す。

`selector_modal_view.js` は小さいものの、複数情報画面の初期化漏れを防ぐ共通Viewなので独立を維持します。

## テストとバランス検証

- `tests/run_tests.js` — 本体ロジック・設計境界の回帰テスト。
- `tests/run_visual_tests.js` — Chrome系ブラウザで主要UIを実描画し、寸法・突破領域・隣接領域への侵入を検査するレイアウト回帰テスト。
- `tests/visual/` — ビジュアル回帰用の固定フィクスチャ。ゲーム本体のCSSを読み込んで検査する。
- `tools/simulation/player_focus_sim.py` — 大量試行による簡略バランスシミュレーション。

通常テストは「ロジック・設計境界が正しいか」、ビジュアルテストは「実ブラウザ上のレイアウトが崩れていないか」、シミュレーターは「バランス傾向がどうなるか」を担当し、目的を混ぜません。

## 今後の優先整理対象

1. JS内の静的inline style / inline eventをCSSクラス＋イベント登録へ移す。
2. `models.js` から `window.GameApp` への直接依存を減らす。
3. 所属・城主・城所有者など重要状態の書き換え窓口を完全一元化する。
4. `TurnManager` 内の月次計算を、必要な単位で既存Rules/Systemへ寄せる（小ファイル乱立は避ける）。
5. `command_system.js`、`war_effort.js`、`field_war.js`、`diplomacy.js`、`ai.js` の巨大責務を整理する。

## 小さいファイルを統合しない判断

現時点で `game_math.js`、`stat_presenter.js`、`selector_modal_view.js`、`troop_allocation.js`、`reinforcement_service.js` は比較的小さいですが、いずれも複数部署から参照される明確な境界です。単に行数が少ないことを理由に巨大ファイルへ戻しません。

一方、起動時固定ボタンだけを担当していた旧 `ui_bindings.js` は単独責務が小さかったため、フォント・viewport初期化と合わせて `app_bootstrap.js` に統合しました。
