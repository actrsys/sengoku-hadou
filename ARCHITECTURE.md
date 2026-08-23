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
- `js/config.js` — ゲームルール・バランス値の正本。ユーザー個人の設定は置かない。
- `js/constants.js` — 状態文字列と、複数状態をまとめた意味判定（LifeStatusRules / BushoStatusRules / DiplomacyRules）の正本。
- `js/user_settings.js` — 通知・歴史イベント・オートセーブ・音量などユーザー個人設定とlocalStorageの正本。
- `js/game.js` — GameManager。ゲーム全体の司令塔。専門部署へ仕事を振る。
- `js/turn_manager.js` — 月初・各拠点ターン・月末の進行順を管理。月次の具体的な計算式は持たず、FactionSystem / EconomyRules / DomesticRules / PersonnelRules / AIStaffing 等へ委譲する。
- `js/data_manager.js` — シナリオ、CSV/BIN、地図データの読み込み。城色画像は各城の種点座標だけを帯状解析し、国境画像は国IDマップへ変換する。その後、各国のピクセルを国内の最寄り城へ割り当てて領土用の城IDマップを構築する。巨大RGBAや全画面BFSキューは常駐保持せず、地図UI・イベントは同一TypedArrayを共有する。
- `js/save_manager.js` — セーブ、ロード、IndexedDB、オートセーブ。
- `js/event_manager.js` — 通常イベントの発火管理に加え、常駐イベントの状態遷移（false→true / true→false）とセーブ継続状態を管理する。歴史イベントOFF時は適用中の `historical_` 常駐効果を解除し、再ON後は各イベント本来の登録タイミングで条件を再評価する。歴史上の条件・効果量・対象は `js/event/historical_event.js` 等のイベント定義側、実際の数値書換は各専門Systemへ委譲する。 `UserSettings` は設定変更を汎用通知し、`GameManager` が歴史イベント設定だけを `EventManager` へルーティングするため、設定UIは常駐効果の実処理を直接呼ばない。

## ルール・共通計算

- `js/domestic_rules.js` — 内政、訓練、徴兵。
- `js/economy_rules.js` — 収入、交易、購入価格、経済計算。
- `js/personnel_rules.js` — 相性、調査、登用、褒美。人物関係は専用の「協調性」を持たず、相性差を主軸に義理・野望を補正として扱う。
- `js/game_math.js` — 複数部署から使う小さな汎用数値処理。小さいが共通依存なので独立を維持。
- `js/stat_presenter.js` — 能力ランク・武将肩書きなど表示用整形。小さいがRules/ModelへHTML・表示責務を戻さないため独立を維持。
- `js/skill_manager.js` — 技能文字列の解釈と技能効果の唯一の窓口。

## 所属・拠点・地図

- `js/affiliation_system.js` — 武将所属・移動・活動状態（active / ronin）。
- `js/castle_manager.js` — 城主・城所有者など拠点状態の管理。
- `js/map_graph.js` — 隣接・到達可能性・海路など地図接続。
- `js/map_generator.js` — 地図描画用データ生成。

### 重要状態の書き換えルール

- 実行中の `busho.clan` / `busho.castleId` は `AffiliationSystem` だけが直接書き換える。通常は `joinClan` / `becomeRonin` / `moveCastle` を使う。
- 独立・歴史イベントなど、周辺の名簿や役職処理を呼び出し側が既に管理している特殊処理だけ `setClanIdRaw` / `setCastleIdRaw` を使う。
- 実行中の `castle.ownerClan` は `CastleManager` だけが直接書き換える。通常は `changeOwner`、副作用を起こしたくない特殊ロールバックだけ `setOwnerIdRaw` を使う。
- `models.js` と `data_manager.js` のデータ生成・初期読込は上記ルールの例外。
- 武将の `active / ronin` は活動・所属状態として `AffiliationSystem.setActivityStatusRaw` が低レベル書換窓口を持つ。通常処理は joinClan / becomeRonin 等の高レベルAPIを使う。
- 武将・姫の `dead / unborn` は生死・登場状態として `LifeSystem.setLifeStatusRaw` が低レベル書換窓口を持つ。死亡処理そのものは executeDeath / processDeath 等の高レベルAPIを優先する。
- 武将の実行中 `endYear` は `LifeSystem.setLifespanModifier()` / `removeLifespanModifier()` だけが変更する。面談・イベント側は「対象・条件・何年変えるか」を所有して LifeSystem へ依頼し、`models.js` は本来の没年・討死フラグ・補正一覧というデータだけを保持する。シナリオ共通ルールである討死武将の初期延命だけは `LifeSystem.initializeBattleDeathLifespans()` が所有する。補正は `sourceId` ごとに識別して積み重ねられる。既存ゲーム仕様上の組合せ制約（例：討死初期延命済み武将へ医師延命を重ねない）はLifeSystemの意味問い合わせAPIを介して判定し、呼び出し側へ内部sourceIdを漏らさない。`endYear` が変わった瞬間に `LifeSystem.recalculateBushoAgeStats()` で寿命前能力低下も同期する。
- 姫の `unmarried / married`、軍団やAI作戦の `status` は別概念なので、上記と同じSetterには混ぜない。

## モデル境界

- `js/models.js` — 保存・ゲーム内データ構造そのもの。ゲーム全体の司令塔 `window.GameApp` を直接参照しない。武将モデルは `originalEndYear` / `endYear` / `isKilledInBattle` / `lifespanModifiers` を保持するが、「討死なら延命する」等のゲームルールは実行しない。
- 武将能力値の一門+5は既存getter互換のため、`GameManager` が `Busho.configureRuntime()` へ「大名を取得する関数」だけを注入する。モデルからはGameManager全体へアクセスしない。
- 武将肩書きのような表示判断は `StatPresenter`、城・軍団など周囲のゲーム状態を使う判定は利用側/Systemへ置く。
- 一門関係の再構築は `FamilyLinker.rebuildAllFamilyIds()` を正規窓口とし、各人物がゲーム全体の名簿を取りに行かない。

## コマンド

- `js/command_catalog.js` — コマンドメニュー構造・実行条件・コマンド仕様表の正本。UI表示とCommandSystemが同じ定義を参照する。
- `js/command_system.js` — コマンド開始、汎用の対象選択・数量入力・実行フローの司令塔。仕様表、セーブ/ロード画面、開戦準備そのものは持たない。
- `js/save_load_view.js` — セーブ/ロードのスロット選択画面。保存形式や復号は知らず、`SaveManager.readSaveSlots()` から復号済みデータを受け取る。
- `js/save_manager.js` — IndexedDB・暗号化/復号・保存データ形式の正本。UIが `loadFromDB` や `_decryptData` を直接触らない。

`command_catalog.js` と `save_load_view.js` はそれぞれ約700行/300行の独立した責務で、`command_system.js` の全体像を大きく損ねていたため分離する。小さなコマンド種別ごとには分割しない。

## 戦争

- `js/war.js` — WarManagerの主要な入口。攻城戦・野戦で共通のホーム補正は `WarSystem.calcHomeBonusMultiplier()` を正本とする。
- `js/war_preparation_controller.js` — 出陣準備・自軍援軍・他勢力援軍・開戦直前UIの司令塔。CommandSystemやAI等はここから開戦準備を開始する。
- `js/war_effort.js` — 攻城戦・戦争進行の既存大規模処理。今後の整理候補。
- `js/field_war.js` — 野戦。Rules / View / AI がまだ混在しており今後の整理候補。
- `js/troop_allocation.js` — 兵力自動配分の正本。
- `js/reinforcement_service.js` — 承諾後の自軍・同盟・諸勢力援軍編成／資源消費の正本。自動・手動とも城在庫の増減をここへ集約する。
- AIが援軍要請を承諾するかどうか（実効確率・大雪・支配関係・拒否可能スキル・最終サイコロ）は `DiplomacyManager.getAIReinforcementAcceptanceInfo()` / `checkAIReinforcementAcceptance()` を正本とし、攻撃側・守備側とも同じ窓口を使う。

`troop_allocation.js` と `reinforcement_service.js` は小さいものの、複数の戦争入口から共通利用され、計算重複防止の役割が明確なため独立を維持します。

## AI・外交・勢力

- `js/ai.js` — AI全体。まだ巨大で、戦争・内政・外交判断の分離候補。
- `js/ai_operation.js` — AI作戦。
- `js/ai_staffing.js` — AI人員配置。
- `js/diplomacy.js` — 外交。会話・ルール・AI判断が混在しており整理候補。
- `js/faction_system.js` — 派閥。
- `js/independence_system.js` — 独立。
- `js/strategy_system.js` — 調略。
- `js/kunishu_system.js` — 諸勢力。取込成功率は `calcIncorporateProbability()` を正本とし、軍師助言と実判定の両方が同じ値を使う。諸勢力の内部ネットワーク分類（例：一向宗）、本願寺家判定、諸勢力関係値の正規書換、ネットワーク関係連動、占領・討伐による本願寺への反作用、動的諸勢力IDの採番もここを唯一の窓口とする。CastleManager等は諸勢力関係値や諸勢力IDを直接計算・書換しない。
- `js/legion_policy_system.js` — 国主（軍団）の評定方針の正本。既定方針・正規化・保存、月1回の評定開催権、攻勢/新規交戦の許可判定を管理する。評定方針はプレイヤーがその勢力を操作している間だけAI拘束として有効にし、観戦・AI操作中は保存値を残したまま拘束を停止する。AIは独自に方針値を解釈せず、このSystemへ攻撃可否を問い合わせる。作戦データの生成・破棄自体は `AIOperationManager` が担当する。

## UI

- `js/ui.js` — UI全体の司令塔。まだ大きく、画面固有処理の整理候補。
- `js/selector_modal_view.js` — 共通SelectorModalのガワ・初期化。
- `js/ui_info.js` — 情報一覧の共通処理と勢力系情報。
- `js/ui_info_busho.js` — 武将一覧・武将詳細。画面固有処理はここに留める。
- `js/ui_info_kyoten.js` — 拠点一覧・拠点詳細。
- `js/ui_slider.js` — 数量・兵数などの入力UI。
- `js/ui_map.js` — 地図UI。
- `js/ui_settings.js` — 設定UI。
- `js/interview_view.js` — 面談専用View。面談開始から終了まで同一モーダルで、面談相手選択・他者選択・会話の順送りを切り替える。一覧超過はスクロールさせずPC12人／スマホ8人単位のページ切替で処理する。PCは16:9、スマホは9:16の固定ゲーム領域へ収める。［戻る］［次へ］［面談を終える］や確認操作は共通UI規約どおり `modal-footer` で内容枠の外側・下へ15px間隔で置き、面談内容そのものの選択肢・ページ送りだけは詳細画面系の内側用ボタンを使う。判定・台詞生成は `InterviewSystem` / `PersonnelRules` に委譲する。
- `js/legion_council_view.js` — 国主評定の専用View。国主一覧、軍団カード全体の選択、別命令モーダルでの一時編集、確定操作だけを担当し、月1回判定・方針保存・AIルールは `LegionPolicySystem` へ委譲する。軍団別命令モーダル内の変更はさらに局所下書きとして保持し、［確定］で評定全体の下書きへ反映、［戻る］（PC右クリックを含む）で破棄する。評定一覧下部の［一括］は同じ命令モーダルを一括編集モードで再利用し、選択した項目だけを全軍団の評定下書きへ反映する。［確定］［戻る］だけでなく［評定を終える］も標準モーダルと同じく内容枠の外側・下へ配置する。PC/スマホの配置差はScript分岐ではなくCSSで処理する。
- `css/style.css` — 静的な見た目の正本。JS側は状態値のみCSS変数等で渡す。
- `index.html` — DOM構造の正本。静的な見た目をinline styleで持たず、固定イベントもinline属性に書かない。
- 自作JSがHTMLを生成する場合、`style` 属性はゲージ幅・文字縮尺など実行時のCSS変数（`--xxx`）だけを許可する。静的レイアウトはCSSクラスへ置く。
- 画像エラーやクリック等のイベントは `onclick` / `onerror` 属性ではなく、生成後のイベント登録または既存のイベントデリゲーションを使う。
- 国主評定は `index.html` が一覧・命令モーダルの固定DOM構造、`style.css` がPCは16:9（1280×720）の左右対面配置、スマホは9:16の2列×4段配置を担当し、物理ウインドウ差は既存の等比縮小・黒帯処理へ委譲する。`legion_council_view.js` は表示と一時編集、`legion_policy_system.js` はゲームルールを担当する。評定一覧には命令UIを直接置かず、軍団カード全体から別命令モーダルを開く。一覧下側には詳細情報画面と同系統の補助操作帯を置き、右下の［一括］から全軍団用の一括命令を開く。評定一覧・命令画面はいずれも固定ゲーム画面内に収めてスクロールさせず、スマホの2列×4段はカード行を固定高にし、端末幅によって9:16論理画面が高くなってもカード自体やカード内の文字配置を縦に引き伸ばさない。将来命令項目が増えて一画面に収まらない場合はタブまたはページ分割で拡張する。観戦へ移行した勢力は保存済み評定方針を保持するがAIは拘束されず、観戦からプレイヤー操作へ戻した時にその勢力の保存方針を再適用する。直轄軍団0のAI作戦だけは操作主体切替時に `AIOperationManager` が生成/破棄を整理する。

`selector_modal_view.js` は小さいものの、複数情報画面の初期化漏れを防ぐ共通Viewなので独立を維持します。


## ローディング・低メモリ端末

- ローディング表示は飾りの無限アニメーションではなく、`DataManager -> GameManager -> UIManager` の進捗通知で現在段階と割合を表示する。`prefers-reduced-motion` でも進捗文字とバー幅は更新される。
- 3140×2440級の色コード画像は全画面Canvasへ複製して長時間保持しない。`DataManager.scanImageByStrips()` がPCは128行、スマホは32行単位で読み取り、帯ごとにブラウザへ制御を返す。城色画像は種点座標だけを取得し、国IDマップ上で城領域を構築する。これにより古いスマホでもローディング画面の描画・OS監視・GCの機会を確保する。
- 城ID・国IDは現シナリオの最大IDに応じて最小のTypedArrayを選ぶ。現行1560シナリオでは双方 `Uint8Array` で、1pixel=1byte。`UIManager`、`EventMapEffects`、台風判定は同じ配列を共有する。城領域構築時には各城の外接矩形も同時に小さな配列へ記録し、戦闘点滅のたびに地図全766万pixelを走査し直さない。
- スマホの勢力色・地方/勢力ハイライトなど全画面Canvasは内部解像度を縦横1/2（面積1/4）にし、CSSで地図サイズへ拡大する。雪Canvasはさらに低解像度で保持し、AI開始時の一時資源解放対象にはせず、表示状態を維持したままメモリ量を抑える。描画時も巨大ImageDataを一枚作らず32行程度の帯へ分割する。城・国の判定用IDマップ自体は正確な当たり判定のため原寸を維持する。
- 表示専用の日本地図はスマホだけ75%解像度の `japan_map_mobile.png` を使う。論理座標と判定用IDマップは原寸のままなのでゲームルールには影響しない。CSS背景から原寸地図を二重ロードせず、常駐する1枚のImage要素を正本とする。
- 武将一覧・詳細などで背景更新を止める時、スマホでは地方・キープ光など一時Canvasを解放し、城カードのdrop-shadow/animationも停止する。雪は気象状態を表す継続レイヤーなので解放対象に含めない。復帰時は勢力色Canvasの所有城1pixelだけを検査し、低メモリでbacking storeが失われていればhashを無効化して再描画する。Canvasの `contextlost/contextrestored` も同じ復旧経路へ接続する。
- AI連続進行中もスマホの城カードのfilter/animationを抑え、非必須地図Canvasを解放してGPUメモリの余裕を作る。戦闘点滅・制圧演出は対象城周辺だけの切り抜きCanvasを必要時に作る。
- 1月の全武将能力再計算はスマホ128人単位、AI月次作戦は複数軍団ごとにブラウザへ制御を返し、長時間の同期CPU占有を避ける。実機診断は対象城を伴う処理だけキュー位置を記録し、月次・イベント・画面操作へ古いAIキュー番号を持ち越さない。武将一覧などの共通情報画面では `ui:modal:<pageType>` を残し、寿命処理段階・作戦処理中勢力と同様に次回の実機切り分けへ使う。
- 一門関係の正本は `realFatherId` / `realMotherId` / `adoptiveFatherId` / 配偶者IDなどの関係データとし、CSVの旧 `familyId` 列は廃止する。
- `baseFamilyIds` / `familyIds` は入力値・保存値ではなく `js/family_system.js` の `FamilyLinker` が毎回ゼロから再構築する派生キャッシュとする。養子・婚姻イベント側から配列を直接pushしない。
- `baseFamilyIds` の実父・養父連結はUnion-Findで一度に構築し、関係変更後の再構築で古い一門IDが残らないようにする。
- 派生キャッシュはセーブデータへ保存せず、ロード後に関係データから再構築する。4,000人超の重複配列を保存しないことでセーブ容量と一時メモリを抑える。
- 現行データでは `Busho` / `Princess` の生成時と `FamilyLinker` が `baseFamilyIds` / `familyIds` を必ず構築するため、全人物の親族配列再正規化を月初・月末・死亡処理では行わない。
- セーブ一覧用の勢力図は最初から1/4サイズの専用白地図へ直接描画し、サムネイルのために3140×2440の中間Canvasを作らない。
- 起動時に大画像・大量顔画像・音声を同時プリロードしない。必要データを順番に処理し、重い段階の間で描画機会を返す。

## テストとバランス検証

- `tests/run_tests.js` — 本体ロジック・設計境界の回帰テスト。
- `tests/run_visual_tests.js` — Chrome系ブラウザで主要UIを実描画し、寸法・突破領域・隣接領域への侵入を検査するレイアウト回帰テスト。
- `tests/visual/` — ビジュアル回帰用の固定フィクスチャ。ゲーム本体のCSSを読み込んで検査する。
- `tools/simulation/player_focus_sim.py` — 大量試行による簡略バランスシミュレーション。

通常テストは「ロジック・設計境界が正しいか」、ビジュアルテストは「実ブラウザ上のレイアウトが崩れていないか」、シミュレーターは「バランス傾向がどうなるか」を担当し、目的を混ぜません。

## 継続開発の整理方針

特定の旧Roundを固定の基準版にはせず、現行仕様を正本として「整理するための整理」は行いません。

- `TurnManager`、`CommandSystem` は現在の責務境界を維持し、行数だけを理由に追加分割しない。
- `war_effort.js` / `field_war.js` / `diplomacy.js` / `ai.js` は大きいが、全面分割は新機能や大規模改修で具体的な必要が生じたときだけ行う。
- 同じゲームルール・計算・重要状態変更が複数箇所に現れた場合は、その重複だけを既存のRules/System/Serviceへ戻す。
- CSSは実際の競合・表示崩れを発見した周辺だけ整理し、機械的な大掃除はしない。
- 既に整備した設定、技能、所属、城所有権、武将状態、モデル境界、UI分離は自動テストで維持する。
- 大規模な構造変更より、機能追加・バグ修正・バランス調整を優先する。

## 小さいファイルを統合しない判断

現時点で `game_math.js`、`stat_presenter.js`、`selector_modal_view.js`、`troop_allocation.js`、`reinforcement_service.js` は比較的小さいですが、いずれも複数部署から参照される明確な境界です。単に行数が少ないことを理由に巨大ファイルへ戻しません。

一方、起動時固定ボタンだけを担当していた旧 `ui_bindings.js` は単独責務が小さかったため、フォント・viewport初期化と合わせて `app_bootstrap.js` に統合しました。

- 国主評定の二択命令はユーザー設定と同系統の汎用 `.ui-toggle-btn` 表現を使い、未選択は茶系、選択中だけ金色で強調する。確定/戻る等の標準モーダル操作は共通フッター間隔と共通SEに委譲し、個別に重ねてSEを鳴らさない。

- 評定内の「一括」は勢力詳細・拠点詳細の右下操作と同じ `.daimyo-detail-action-btn` を再利用し、評定専用CSSは配置だけを担当する。

## Map focus consistency / low-FPS camera (r89)

- Normal active-castle focus uses the castle icon seed (`pixelX` / `pixelY`).
- Territory effects such as battle blink and capture effects use `DataManager.castlePixelCenters`, derived while the territory ID map is built, so the camera and the visual territory effect share one anchor.
- Smooth map focus is driven by accumulated frame deltas with a per-frame advance cap. A delayed first `requestAnimationFrame` must not consume the whole animation and turn a smooth move into an instant jump on slow mobile WebViews.
- AI progression is identical in normal play and watch mode. Diagnostics may differ only in visibility/checkpoint detail; they must not alter AI decisions, timing rules, or battle flow.
- Common-modal close diagnostics are staged around selector close and background/map restoration so an OS/browser forced reload can be localized without guessing a cause.


## 戦闘カメラと諸勢力鎮圧（r90）
- 戦争中の地図カメラは `WarManager.state.battleFocusCastleId` を正本とし、開戦時に対象拠点の領域中心へ一度だけフォーカスする。
- 開始点滅・終了点滅・制圧演出は同じ戦場カメラを再利用し、演出ごとの再フォーカスでスマホ表示が数pxずれないようにする。
- プレイヤーの野戦/攻城戦モーダルを閉じる時は、モーダル非表示後のviewportで同じ戦場中心へ即時補正する。
- 諸勢力鎮圧の対象拠点は `kunishu.castleId` を正本とし、出撃元拠点IDを戦場に流用しない。
- 自家武将の出奔通知は専用カットインを持たず、通常通知と同じ `showDialogAsync` を使用する。


## 戦後の総取り判定
- 拠点陥落時の守備側結果は `defenderCastleOutcome` を正本とする。
  - `retreat`: 守備側が別拠点への撤退に成功した。
  - `collapse`: 守備側が撤退できず敗北した（野戦の総大将撃破・兵糧崩壊、攻城戦敗北、撤退先なしを含む）。
  - `held`: 攻撃側敗北で拠点を保持した。
- 拠点総取りは「大名居城陥落」かつ `collapse` の場合だけ許可する。撤退成功時は発生させない。
- 個別の敗北理由を総取り側へ列挙せず、WarSystem が確定した拠点離脱結果だけを参照する。

## エンディングからタイトルへの遷移
- `ending-screen` は hidden を解除した時点から入力を遮断し、暗転アニメーション中の背面操作を許可しない。
- ゲームオーバーの暗転は短時間（0.7秒）とし、暗転後は `global-loading-screen` へ表示を受け渡してからタイトル画面を準備する。
- タイトル復帰中のロード表示は UIManager が管理し、EndingSystem はロード画面を表示済みの状態で `returnToTitle` を呼べる。

## 固定論理画面内の一時通知
- 縦横比調整用の黒帯へUIを出さないため、ゲーム内の一時通知は物理 `body` / viewport ではなく `#game-screen` を配置基準にする。
