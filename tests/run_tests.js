#!/usr/bin/env node
'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const zlib = require('zlib');

const ROOT = path.resolve(__dirname, '..');

let passed = 0;
let failed = 0;
const pendingTests = [];

function _recordTestFailure(name, error) {
    failed++;
    console.error(`✗ ${name}`);
    console.error(error && error.stack ? error.stack : error);
}

function test(name, fn) {
    try {
        const result = fn();
        if (result && typeof result.then === 'function') {
            pendingTests.push(Promise.resolve(result).then(() => {
                passed++;
                console.log(`✓ ${name}`);
            }).catch(error => {
                _recordTestFailure(name, error);
            }));
            return;
        }
        passed++;
        console.log(`✓ ${name}`);
    } catch (error) {
        _recordTestFailure(name, error);
    }
}

function createContext(extra = {}) {
    const context = {
        console,
        Math,
        Set,
        Map,
        Array,
        Object,
        Number,
        String,
        Boolean,
        JSON,
        Date,
        RegExp,
        ...extra
    };
    context.window = context;
    vm.createContext(context);
    return context;
}

function loadScript(context, relativePath) {
    const filename = path.join(ROOT, relativePath);
    const code = fs.readFileSync(filename, 'utf8');
    vm.runInContext(code, context, { filename });
}

function read(relativePath) {
    return fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
}

function readBinJson(relativePath) {
    return JSON.parse(zlib.inflateSync(fs.readFileSync(path.join(ROOT, relativePath))).toString('utf8'));
}

function getRuntimeData(folder = '1560_okehazama') {
    return {
        common: readBinJson('data/common.bin'),
        index: readBinJson('data/scenarios/index.bin'),
        scenario: readBinJson(`data/scenarios/${folder}/scenario.bin`)
    };
}

function mergeRuntimeRows(masterRows, stateRows) {
    const stateById = new Map(stateRows.map(row => [Number(row.id), row]));
    return masterRows.map(master => ({ ...master, ...(stateById.get(Number(master.id)) || {}) }));
}

class FakeClassList {
    constructor(initial = []) { this.values = new Set(initial); }
    add(...names) { names.forEach(name => this.values.add(name)); }
    remove(...names) { names.forEach(name => this.values.delete(name)); }
    contains(name) { return this.values.has(name); }
}

function fakeElement(id) {
    return {
        id,
        classList: new FakeClassList(),
        style: {},
        dataset: {},
        textContent: '',
        innerHTML: '',
        disabled: false,
        onclick: null,
        parentElement: null,
        querySelector() { return null; },
        querySelectorAll() { return []; },
        getAttribute() { return null; }
    };
}

// ---------------------------------------------------------------------------
// 設定・定数
// ---------------------------------------------------------------------------
test('GameConfig / GameConstants が中央定義として読み込める', () => {
    const ctx = createContext();
    loadScript(ctx, 'js/config.js');
    loadScript(ctx, 'js/constants.js');
    assert.strictEqual(ctx.WarParams, ctx.GameConfig.War);
    assert.strictEqual(ctx.MainParams, ctx.GameConfig.Main);
    assert.strictEqual(ctx.GameConfig.Meta.Version, 'r308');
    assert.strictEqual(ctx.GameConstants.BushoStatus.ACTIVE, 'active');
    assert.strictEqual(ctx.GameConstants.DiplomacyStatus.ALLIANCE, '同盟');
    assert.strictEqual(ctx.DiplomacyRules.canPassTerritory('同盟'), true);
    assert.strictEqual(ctx.DiplomacyRules.canPassTerritory('友好'), false);
});

test('士気上限は内部120・通常100・ゲージ100を設定の正本から使う', () => {
    const ctx = createContext();
    loadScript(ctx, 'js/config.js');
    assert.strictEqual(ctx.WarParams.Military.MaxMoraleInternal, 120);
    assert.strictEqual(ctx.WarParams.Military.MaxMoraleNormal, 100);
    assert.strictEqual(ctx.WarParams.Military.MaxMoraleGauge, 100);

    const sources = [
        read('js/models.js'), read('js/war.js'), read('js/field_war.js'), read('js/war_effort.js')
    ].join('\n');
    assert.ok(!sources.includes('MaxMoraleBase'));
    assert.ok(!/MaxMorale(?:Base|Internal)[^\n]*(?:\?|:)\s*120/.test(sources));
    assert.ok(!sources.includes('? window.WarParams.Military.MaxMoraleInternal'));
    assert.ok(read('js/command_system.js').includes('MaxMoraleNormal'));
    assert.ok(read('js/ui.js').includes('MaxMoraleGauge'));
});

test('設定の二択ボタンは兵科classを流用せず共通button SEへ委譲する', () => {
    const html = read('index.html');
    const settingsJs = read('js/ui_settings.js');
    const ids = ['autosave-true', 'autosave-false', 'notify-true', 'notify-false', 'historical-true', 'historical-false'];
    ids.forEach(id => {
        const re = new RegExp(`<button[^>]*class="ui-toggle-btn"[^>]*data-se="choice\\.ogg"[^>]*id="btn-${id}"|<button[^>]*id="btn-${id}"[^>]*class="ui-toggle-btn"[^>]*data-se="choice\\.ogg"`);
        assert.ok(re.test(html), `${id} は ui-toggle-btn + choice SE を使う`);
    });
    const settingsBlock = html.slice(html.indexOf('id="settings-modal"'), html.indexOf('id="saveload-modal"'));
    assert.ok(!settingsBlock.includes('troop-type-btn'), '設定画面に兵科ボタンclassを流用しない');
    const saveloadBlock = html.slice(html.indexOf('id="saveload-modal"'), html.indexOf('id="custom-context-menu"'));
    assert.ok(!saveloadBlock.includes('troop-type-btn'), 'セーブ／ロード切替に兵科ボタンclassを流用しない');
    ['saveload-tab-manual', 'saveload-tab-auto'].forEach(id => {
        const re = new RegExp(`<button[^>]*id="${id}"[^>]*class="ui-toggle-btn(?: active)?"[^>]*data-se="choice\\.ogg"|<button[^>]*class="ui-toggle-btn(?: active)?"[^>]*data-se="choice\\.ogg"[^>]*id="${id}"`);
        assert.ok(re.test(html), `${id} は汎用切替classとchoice SEを使う`);
    });
    assert.ok(!read('css/style.css').includes('.setting-toggle-group .troop-type-btn'), '設定系レイアウトCSSへ兵科class依存を残さない');
    assert.ok(!settingsJs.includes("playSE('choice.ogg')"), '設定Viewからbutton SEを重ねて鳴らさない');
    assert.ok(read('ARCHITECTURE.md').includes('汎用の二択・切替操作は `.ui-toggle-btn`、兵科選択だけは `.troop-type-btn`'), '切替ボタンと兵科ボタンの意味上の責務を設計文書へ残す');
});

test('会話選択肢の静的配置はCSSクラスを正本にしJS inline layoutへ戻さない', () => {
    const ui = read('js/ui.js');
    const css = read('css/style.css');
    const layoutWrites = [
        'footer.style.position', 'footer.style.order', 'footer.style.zIndex',
        'footer.style.width', 'footer.style.maxWidth', 'footer.style.flexDirection',
        'footer.style.gap', 'footer.style.justifyContent',
        "footer.style.setProperty('margin-top'", "footer.style.setProperty('margin-bottom'",
        "modalContent.style.setProperty('margin-top'",
        'modal.style.flexDirection', 'modal.style.justifyContent'
    ];
    layoutWrites.forEach(token => assert.ok(!ui.includes(token), `静的ダイアログ配置をJSへ戻さない: ${token}`));
    assert.ok(css.includes('.event-dialog-modal.event-choices-active .modal-footer'), '選択肢footer配置はCSSに置く');
    assert.ok(css.includes('--dialog-choice-footer-gap: 18px;'), '名前札の張り出しを避ける下部会話専用18px間隔を意味付き変数で正本化する');
    assert.ok(css.includes('margin-bottom: var(--dialog-choice-footer-gap) !important;'), '会話選択肢は専用の名前札クリアランス変数を参照する');
    assert.ok(css.includes('body:not(.is-pc) .event-dialog-modal.event-choices-active .modal-footer'), 'スマホ差もCSSに置く');
});


test('下部会話の選択肢は標準footer高を保ち、名前札クリアランスだけ18pxにする', () => {
    const css = read('css/style.css');
    const footerStart = css.indexOf('.event-dialog-modal.event-choices-active .modal-footer');
    const footerBlock = css.slice(footerStart, css.indexOf('}', footerStart) + 1);
    assert.ok(footerStart >= 0, '会話選択肢footerの配置CSSが必要');
    assert.ok(footerBlock.includes('margin-top: 0 !important'), '選択肢footer自身で縦余白を吸収しない');
    const start = css.indexOf('body:not(.is-pc) .event-dialog-modal.event-choices-active .modal-footer');
    const block = css.slice(start, css.indexOf('}', start) + 1);
    assert.ok(start >= 0, 'スマホ会話選択肢の専用CSSが必要');
    assert.ok(!block.includes('min-height: 0'), 'スマホだけ標準modal-footerの60px最小高さを解除しない');
    assert.ok(!block.includes('margin-bottom:'), 'スマホだけ会話選択肢の間隔を個別上書きせず、PC共通の18px例外を使う');
    assert.ok(css.includes('.event-dialog-modal .modal-content.modal-small'), '下部会話枠の配置規則が必要');
    const contentStart = css.indexOf('.event-dialog-modal .modal-content.modal-small');
    const contentBlock = css.slice(contentStart, css.indexOf('}', contentStart) + 1);
    assert.ok(contentBlock.includes('margin: 0 auto !important'), '会話枠側にも縦auto marginを残さない');
    const mobileContentStart = css.indexOf('body:not(.is-pc) .event-dialog-modal .modal-content.modal-small');
    const mobileContentBlock = css.slice(mobileContentStart, css.indexOf('}', mobileContentStart) + 1);
    assert.ok(mobileContentBlock.includes('margin: 0 auto !important'), 'スマホ専用上書きでも縦auto marginを再導入しない');
});

test('会話確認visual fixtureは実ゲーム同様footerをmodal-content外へ置く', () => {
    const html = read('tests/visual/dialog_confirm.html');
    const contentClose = html.indexOf('</div>\n        <!-- 実ゲームでは UIManager 初期化時');
    const footerAt = html.indexOf('<div class="modal-footer right">');
    assert.ok(contentClose >= 0 && footerAt > contentClose, 'fixtureでfooterをmodal-contentの兄弟要素にする');
});

test('長文本文は装飾書体と分離し、可読性と歴史物の柔らかさを両立する本文書体を共用する', () => {
    const css = read('css/style.css');
    assert.ok(css.includes('--font-readable-ja:'), '長文用フォントスタックを共通変数として正本化する');
    assert.ok(css.includes('\"UD Digi Kyokasho N-R\"'), '日本語WindowsではUDデジタル教科書体を最優先する');
    assert.ok(css.includes('\"Yu Mincho\"'), '教科書体が無い環境では明朝系へ自然にフォールバックする');
    for (const selector of ['.message-area {', '.busho-detail-biography-text {', '#scenario-modal .scenario-desc-text {', '.guide-section p,']) {
        const at = css.indexOf(selector);
        const block = css.slice(at, css.indexOf('}', at) + 1);
        assert.ok(at >= 0 && block.includes('font-family: var(--font-readable-ja);'), `${selector} は長文用フォントを使う`);
    }
});

test('AI思考中の進捗数字は等幅数字と総桁幅固定で桁上がり時に左右へ揺れない', () => {
    const css = read('css/style.css');
    const ui = read('js/ui.js');
    assert.ok(css.includes('font-variant-numeric: tabular-nums;'), '数字はtabular numsを使う');
    assert.ok(css.includes('width: var(--ai-progress-digit-width, 2ch);'), '数字欄の幅をCSS変数で固定する');
    assert.ok(ui.includes('const progressDigits = Math.max(2, totalText.length, currentText.length);'), '進捗の最大桁数を現在値と総数から求める');
    assert.ok(ui.includes("this.aiGuard.style.setProperty('--ai-progress-digit-width', `${progressDigits}ch`);"), '進行中は同じ桁幅を両数字欄へ適用する');
    assert.ok(ui.includes('class=\"ai-progress-line\"'), '進捗行をnowrapの専用要素にする');
});

test('月末・月初の長い処理は既存AIガードへ進行中表示を出す', () => {
    const ui = read('js/ui.js');
    const turn = read('js/turn_manager.js');
    assert.ok(ui.includes('showProcessingStatus(text)'), '既存ai-guardを汎用処理表示へ再利用する');
    assert.ok(ui.includes("[data-processing-status]"), '処理表示は専用テキスト要素を再利用する');
    assert.ok(turn.includes("showProcessingStatus('月初準備中...')"));
    assert.ok(turn.includes("showProcessingStatus('月末処理中...')"));
    assert.ok(!read('index.html').includes('month-processing-guard'), '月処理専用オーバーレイを重複追加しない');
});


test('スマホ月初処理は災害会話前からAI軽量モードへ入り一時地図資源を解放する', () => {
    const turn = read('js/turn_manager.js');
    const start = turn.indexOf('async startMonth()');
    const cutin = turn.indexOf('await game.ui.showCutin', start);
    const block = turn.slice(start, cutin);
    assert.ok(block.includes("document.body.classList.add('mobile-ai-light-mode')"), '月初イベントより前から城カードのGPU装飾を軽量化する');
    assert.ok(block.includes('game.ui.releaseMobileTransientMapResources()'), '月初イベント前に非必須Canvas/慣性を解放する');
    assert.ok(block.indexOf("mobile-ai-light-mode") < block.indexOf('await game.ui.showCutin') || !block.includes('await game.ui.showCutin'), '軽量化は月初カットインより前に入る');
});

test('透明化したAIガードは見えない子アニメーションも停止して復帰時は既存状態へ戻す', () => {
    const ui = read('js/ui.js');
    const css = read('css/style.css');
    const at = ui.indexOf('hideAIGuardTemporarily()');
    const end = ui.indexOf('_hasAIProgressBlockingUI()', at);
    const block = ui.slice(at, end);
    assert.ok(block.includes("aiGuard.classList.add('hide-text')"), 'opacityだけでなく既存hide-textを併用する');
    assert.ok(css.includes('#ai-guard.hide-text *'));
    assert.ok(css.includes('animation: none !important;'), '非表示spinnerのCSS animationを止める');
    assert.ok(css.includes('transition: none !important;'), '非表示子要素のtransitionも止める');
    const restoreAt = ui.indexOf('restoreAIGuard()');
    const restoreBlock = ui.slice(restoreAt, restoreAt + 1300);
    assert.ok(restoreBlock.includes('this.applyAIGuardTextState()'), '復帰時はguardTextHiddenCountの正本へ戻す');
});

test('SEは一時Howlを終了・失敗・安全弁で解放し完全ミュート時は生成しない', () => {
    const source = read('js/audio.js');
    assert.ok(source.includes('onend: cleanup'));
    assert.ok(source.includes('onloaderror: cleanup'));
    assert.ok(source.includes('onplayerror: cleanup'), '古いWebViewで再生開始に失敗してもHowlを残さない');
    assert.ok(source.includes('if (!(finalVolume > 0)) return;'), '完全ミュート時は無音SEのdecode自体を行わない');
    assert.ok(source.includes('safetyTimer = setTimeout(cleanup, 15000)'), '終了通知欠落時も一時Howlを永久保持しない');
    assert.ok(source.includes('se.unload()'));
});

test('通常buttonのSEは共通監視を正本とし二重再生経路を持たない', () => {
    const source = read('js/ui.js');
    const scenarioStart = source.indexOf('// 決定ボタンを押した時の動きを登録します');
    const scenarioEnd = source.indexOf('async returnToTitle', scenarioStart);
    const scenarioBlock = source.slice(scenarioStart, scenarioEnd);
    assert.ok(!scenarioBlock.includes("playSE('decision.ogg')"));

    const choiceStart = source.indexOf('// --- ボタンの生成 ---');
    const choiceEnd = source.indexOf('} else if (!isBottomMessage || hasChoices)', choiceStart);
    const choiceBlock = source.slice(choiceStart, choiceEnd);
    assert.ok(choiceBlock.includes("modal.classList.contains('event-dialog-modal')"));
    assert.ok(!choiceBlock.includes('btn.dataset.se = choiceSe'));
});

test('index.htmlはinline event属性を持たずHowler fallbackをAudioManagerへ委譲する', () => {
    const html = read('index.html');
    assert.ok(!/\son[a-z]+\s*=/i.test(html));
    assert.ok(html.includes('<script src="js/howler.min.js"></script>'));
    const audio = read('js/audio.js');
    assert.ok(audio.includes('_ensureHowlerReady()'));
    assert.ok(audio.includes("script.src = 'js/howler.js'"));
    assert.ok(audio.includes('_retryWhenHowlerReady'));
});

test('城データは旧loyalty列をpeoplesLoyaltyとして推測補完しない', () => {
    const source = read('js/models.js');
    assert.ok(source.includes('data.peoplesLoyalty !== undefined ? data.peoplesLoyalty : 0'));
    assert.ok(!source.includes('data.loyalty || 0'));
});

test('外交関係の遅延生成は支配と従属の向きを正しく反転する', () => {
    const ctx = createContext();
    loadScript(ctx, 'js/config.js');
    loadScript(ctx, 'js/constants.js');
    ctx.game = {
        clans: [
            { id: 1, diplomacyValue: {} },
            { id: 2, diplomacyValue: { 1: { status: '支配', sentiment: 82, trucePeriod: 0, isMarriage: true, hostageIds: [99], subordinateMonths: 12 } } }
        ],
        getClan(id) { return this.clans.find(c => Number(c.id) === Number(id)); }
    };
    loadScript(ctx, 'js/diplomacy.js');
    const manager = vm.runInContext('new DiplomacyManager(game)', ctx);
    const relation = manager.getDiplomacyData(1, 2);
    assert.strictEqual(relation.status, '従属');
    assert.strictEqual(relation.sentiment, 82);
    assert.strictEqual(relation.isMarriage, true);
    assert.deepStrictEqual(Array.from(relation.hostageIds), [99]);
    assert.strictEqual(relation.subordinateMonths, 12);

    ctx.game.clans[0].diplomacyValue = {};
    ctx.game.clans[1].diplomacyValue[1].status = '従属';
    assert.strictEqual(manager.getDiplomacyData(1, 2).status, '支配');
});

test('外交status変更は和睦期間を残さず、主従の向きが変われば継続月数をリセットする', () => {
    const ctx = createContext();
    loadScript(ctx, 'js/config.js');
    loadScript(ctx, 'js/constants.js');
    ctx.game = {
        clans: [
            { id: 1, diplomacyValue: { 2: { status: '和睦', sentiment: 50, trucePeriod: 5, isMarriage: true, hostageIds: [77], subordinateMonths: 0 } } },
            { id: 2, diplomacyValue: { 1: { status: '和睦', sentiment: 50, trucePeriod: 5, isMarriage: true, hostageIds: [77], subordinateMonths: 0 } } }
        ],
        getClan(id) { return this.clans.find(c => Number(c.id) === Number(id)); }
    };
    loadScript(ctx, 'js/diplomacy.js');
    const manager = vm.runInContext('new DiplomacyManager(game)', ctx);
    manager.changeStatus(1, 2, '同盟');
    assert.strictEqual(ctx.game.clans[0].diplomacyValue[2].trucePeriod, 0);
    assert.strictEqual(ctx.game.clans[1].diplomacyValue[1].trucePeriod, 0);
    assert.strictEqual(ctx.game.clans[0].diplomacyValue[2].isMarriage, true, 'status変更だけで婚姻を消さない');
    assert.deepStrictEqual(Array.from(ctx.game.clans[0].diplomacyValue[2].hostageIds), [77], 'status変更だけで人質を消さない');

    manager.changeStatus(1, 2, '支配');
    ctx.game.clans[0].diplomacyValue[2].subordinateMonths = 20;
    ctx.game.clans[1].diplomacyValue[1].subordinateMonths = 20;
    manager.changeStatus(1, 2, '支配');
    assert.strictEqual(ctx.game.clans[0].diplomacyValue[2].subordinateMonths, 20, '同じ主従関係の継続では月数を保つ');
    manager.changeStatus(1, 2, '従属');
    assert.strictEqual(ctx.game.clans[0].diplomacyValue[2].subordinateMonths, 0, '主従の向きが反転したら月数をリセットする');
    assert.strictEqual(ctx.game.clans[1].diplomacyValue[1].subordinateMonths, 0);
});

test('外交statusを別関係へ変更したら古いイベント保護を持ち越さない', () => {
    const ctx = createContext();
    loadScript(ctx, 'js/config.js');
    loadScript(ctx, 'js/constants.js');
    ctx.game = {
        clans: [
            { id: 1, diplomacyValue: { 2: { status: '同盟', sentiment: 100, trucePeriod: 0, isMarriage: false, isEvent: true, hostageIds: [], subordinateMonths: 0 } } },
            { id: 2, diplomacyValue: { 1: { status: '同盟', sentiment: 100, trucePeriod: 0, isMarriage: false, isEvent: true, hostageIds: [], subordinateMonths: 0 } } }
        ],
        getClan(id) { return this.clans.find(c => Number(c.id) === Number(id)); }
    };
    loadScript(ctx, 'js/diplomacy.js');
    const manager = vm.runInContext('new DiplomacyManager(game)', ctx);
    manager.changeStatus(1, 2, '同盟');
    assert.strictEqual(ctx.game.clans[0].diplomacyValue[2].isEvent, true, '同じイベント関係の再設定では保護を維持する');
    manager.changeStatus(1, 2, '敵対');
    assert.strictEqual(ctx.game.clans[0].diplomacyValue[2].isEvent, false);
    assert.strictEqual(ctx.game.clans[1].diplomacyValue[1].isEvent, false);
});

test('人質の脱走は実家所属まで復元し、拘束継続時は通常捕虜へ正しく引き渡せる', () => {
    const makeGame = () => {
        const hostage = { id: 10, name: '人質武将', clan: 2, originalClanId: 1, castleId: 22, isHostage: true, strength: 30 };
        const clans = [
            { id: 1, diplomacyValue: { 2: { status: '同盟', sentiment: 40, trucePeriod: 0, isMarriage: false, isEvent: false, hostageIds: [10], subordinateMonths: 0 } } },
            { id: 2, diplomacyValue: { 1: { status: '同盟', sentiment: 40, trucePeriod: 0, isMarriage: false, isEvent: false, hostageIds: [10], subordinateMonths: 0 } } }
        ];
        const castles = [
            { id: 11, ownerClan: 1 },
            { id: 22, ownerClan: 2 }
        ];
        const game = {
            clans, castles, bushos: [hostage], princesses: [],
            getClan(id) { return clans.find(c => Number(c.id) === Number(id)); },
            getBusho(id) { return this.bushos.find(b => Number(b.id) === Number(id)); },
            getClanCastles(id) { return this.castles.filter(c => Number(c.ownerClan) === Number(id)); },
            affiliationSystem: {
                setClanIdRaw(b, id) { b.clan = Number(id) || 0; },
                moveCastle(b, id) { b.castleId = Number(id) || 0; },
                becomeRonin(b) { b.clan = 0; b.castleId = 0; b.status = 'ronin'; }
            }
        };
        return { game, hostage };
    };

    const escapeMath = Object.create(Math);
    escapeMath.random = () => 0;
    const ctxEscape = createContext({ Math: escapeMath });
    loadScript(ctxEscape, 'js/config.js');
    loadScript(ctxEscape, 'js/constants.js');
    const escape = makeGame();
    ctxEscape.game = escape.game;
    loadScript(ctxEscape, 'js/diplomacy.js');
    const escapeManager = vm.runInContext('new DiplomacyManager(game)', ctxEscape);
    const escapeResult = escapeManager.applyBreakAlliancePenalty(1, 2);
    assert.strictEqual(escapeResult.escapedHostages.length, 1);
    assert.strictEqual(escape.hostage.clan, 1, '脱走成功時は城だけでなく実家所属へ戻す');
    assert.strictEqual(escape.hostage.castleId, 11);
    assert.strictEqual(escape.hostage.isHostage, false);
    assert.strictEqual(escape.hostage.originalClanId, undefined);

    const captureMath = Object.create(Math);
    captureMath.random = () => 0.99;
    const ctxCapture = createContext({ Math: captureMath });
    loadScript(ctxCapture, 'js/config.js');
    loadScript(ctxCapture, 'js/constants.js');
    const capture = makeGame();
    ctxCapture.game = capture.game;
    loadScript(ctxCapture, 'js/diplomacy.js');
    const captureManager = vm.runInContext('new DiplomacyManager(game)', ctxCapture);
    const captureResult = captureManager.applyBreakAlliancePenalty(1, 2);
    assert.strictEqual(captureResult.capturedHostageRecords.length, 1);
    const record = captureResult.capturedHostageRecords[0];
    assert.strictEqual(record.originClanId, 1);
    assert.strictEqual(record.captorClanId, 2);
    assert.strictEqual(capture.hostage.clan, 2, '捕虜処遇へ渡すまでは拘束側情報を維持する');
    captureManager._convertCapturedHostageToPrisoner(record);
    assert.strictEqual(capture.hostage.clan, 1, '通常捕虜へ渡す直前に元所属を復元する');
    assert.strictEqual(capture.hostage.castleId, 22, '拘束先の城は捕虜処遇まで維持する');
    assert.strictEqual(capture.hostage.isHostage, false);
    assert.strictEqual(capture.hostage.originalClanId, undefined);
});

test('姫の血縁IDは現行real系だけを使い未解決文字列をNaNで保持しない', () => {
    const ctx = createContext();
    loadScript(ctx, 'js/models.js');
    ctx.badPrincess = {
        id: 90001, name: '試験姫', birthYear: 1540, startYear: 1540, endYear: 1600,
        originalClanId: '見つかりません', realFatherId: '見つかりません', realMotherId: '',
        fatherId: 12345, husbandId: '不明', status: 'unmarried'
    };
    const p = vm.runInContext('new Princess(badPrincess)', ctx);
    assert.strictEqual(p.originalClanId, 0);
    assert.strictEqual(p.realFatherId, 0, '旧fatherIdへフォールバックしない');
    assert.strictEqual(p.realMotherId, 0);
    assert.strictEqual(p.husbandId, 0);
    assert.ok(Number.isFinite(p.originalClanId) && Number.isFinite(p.realFatherId) && Number.isFinite(p.husbandId));
});

test('謀反後の外交再編はDiplomacyManagerを通し、実家側の肉親一門が残る婚姻だけ維持する', () => {
    const ctx = createContext();
    loadScript(ctx, 'js/config.js');
    loadScript(ctx, 'js/constants.js');
    loadScript(ctx, 'js/family_system.js');

    const makeRel = (sentiment, isMarriage) => ({
        status: '同盟', sentiment, trucePeriod: 4, isMarriage, isEvent: false, hostageIds: [], subordinateMonths: 0
    });
    const rel12 = makeRel(80, true);
    const rel21 = makeRel(80, true);
    const rel13 = makeRel(60, true);
    const rel31 = makeRel(60, true);

    const bushos = [
        { id: 10, clan: 0, status: 'dead', realFatherId: 0, realMotherId: 0, adoptiveFatherId: 0, wifeIds: [] },
        // 姫Aの実父は死亡済みだが、実兄弟が新政権に残っている。
        { id: 11, clan: 1, status: 'active', realFatherId: 10, realMotherId: 0, adoptiveFatherId: 0, wifeIds: [] },
        { id: 20, clan: 2, status: 'active', realFatherId: 0, realMotherId: 0, adoptiveFatherId: 0, wifeIds: [90001] },
        // 姫Bの夫とその子は新政権に残るが、姫B自身の実家側肉親は残らない。
        { id: 30, clan: 1, status: 'active', realFatherId: 0, realMotherId: 0, adoptiveFatherId: 0, wifeIds: [90002] },
        { id: 31, clan: 1, status: 'active', realFatherId: 30, realMotherId: 90002, adoptiveFatherId: 0, wifeIds: [] },
        { id: 40, clan: 3, status: 'active', realFatherId: 0, realMotherId: 0, adoptiveFatherId: 0, wifeIds: [] }
    ];
    const princesses = [
        { id: 90001, originalClanId: 1, currentClanId: 2, husbandId: 20, status: 'married', realFatherId: 10, realMotherId: 0, adoptiveFatherId: 0 },
        { id: 90002, originalClanId: 3, currentClanId: 1, husbandId: 30, status: 'married', realFatherId: 40, realMotherId: 0, adoptiveFatherId: 0 }
    ];
    ctx.game = {
        clans: [
            { id: 1, diplomacyValue: { 2: rel12, 3: rel13 }, currentDiplomacyTarget: null },
            { id: 2, diplomacyValue: { 1: rel21 }, currentDiplomacyTarget: null },
            { id: 3, diplomacyValue: { 1: rel31 }, currentDiplomacyTarget: null }
        ],
        bushos,
        princesses,
        getClan(id) { return this.clans.find(c => Number(c.id) === Number(id)); },
        getBusho(id) { return this.bushos.find(b => Number(b.id) === Number(id)); }
    };
    loadScript(ctx, 'js/diplomacy.js');
    const manager = vm.runInContext('new DiplomacyManager(game)', ctx);

    const beforeA = { ...princesses[0] };
    const beforeB = { ...princesses[1] };
    assert.strictEqual(manager.reorganizeRelationsAfterRebellion(1, 1, { preserveMarriageByFamily: true }), true);

    assert.strictEqual(rel12.status, '敵対', '80の友好度は反転後30となり敵対へ戻す');
    assert.strictEqual(rel12.sentiment, 30);
    assert.strictEqual(rel12.trucePeriod, 0);
    assert.strictEqual(rel12.isMarriage, true, '父が不在でも実兄弟が新政権に残れば婚姻を維持する');
    assert.strictEqual(rel21.isMarriage, true);
    assert.strictEqual(princesses[0].isDiplomaticMarriageActive, true, '維持対象の夫婦は外交婚姻も有効のままにする');

    assert.strictEqual(rel13.sentiment, 40);
    assert.strictEqual(rel13.status, '普通');
    assert.strictEqual(rel13.isMarriage, false, '夫と夫側の子だけでは婚姻継承の根拠にしない');
    assert.strictEqual(rel31.isMarriage, false);
    assert.strictEqual(princesses[1].isDiplomaticMarriageActive, false, '旧政権由来で継承しない夫婦は外交婚姻だけ無効化する');
    manager.refreshMarriageRelation(1, 3);
    assert.strictEqual(rel13.isMarriage, false, '後日の婚姻再評価でも旧政権の婚姻関係を復活させない');
    assert.strictEqual(rel31.isMarriage, false);

    ['originalClanId', 'currentClanId', 'husbandId', 'status'].forEach(key => {
        assert.strictEqual(princesses[0][key], beforeA[key], `姫Aの${key}を外交再編で変更しない`);
        assert.strictEqual(princesses[1][key], beforeB[key], `姫Bの${key}を外交再編で変更しない`);
    });
});

test('独立新勢力の外交再編も同じ窓口を使うが、通常独立では旧家の婚姻を引き継がない', () => {
    const ctx = createContext();
    loadScript(ctx, 'js/config.js');
    loadScript(ctx, 'js/constants.js');
    loadScript(ctx, 'js/family_system.js');
    const makeRel = (sentiment, isMarriage = false) => ({
        status: '同盟', sentiment, trucePeriod: 0, isMarriage, isEvent: false, hostageIds: [], subordinateMonths: 0
    });
    const bushos = [
        { id: 10, clan: 0, status: 'dead', realFatherId: 0, realMotherId: 0, adoptiveFatherId: 0, wifeIds: [] },
        { id: 11, clan: 4, status: 'active', realFatherId: 10, realMotherId: 0, adoptiveFatherId: 0, wifeIds: [] },
        { id: 20, clan: 2, status: 'active', realFatherId: 0, realMotherId: 0, adoptiveFatherId: 0, wifeIds: [90001] }
    ];
    const princesses = [
        { id: 90001, originalClanId: 1, currentClanId: 2, husbandId: 20, status: 'married', realFatherId: 10, realMotherId: 0, adoptiveFatherId: 0 }
    ];
    ctx.game = {
        clans: [
            { id: 1, diplomacyValue: { 2: makeRel(75, true) }, currentDiplomacyTarget: null },
            { id: 2, diplomacyValue: { 1: makeRel(75, true) }, currentDiplomacyTarget: null },
            { id: 4, diplomacyValue: {}, currentDiplomacyTarget: null }
        ],
        bushos,
        princesses,
        getClan(id) { return this.clans.find(c => Number(c.id) === Number(id)); },
        getBusho(id) { return this.bushos.find(b => Number(b.id) === Number(id)); }
    };
    loadScript(ctx, 'js/diplomacy.js');
    const manager = vm.runInContext('new DiplomacyManager(game)', ctx);
    manager.reorganizeRelationsAfterRebellion(1, 4);

    const rel42 = manager.getDiplomacyData(4, 2);
    const rel24 = manager.getDiplomacyData(2, 4);
    assert.strictEqual(rel42.sentiment, 30);
    assert.strictEqual(rel42.status, '敵対');
    assert.strictEqual(rel42.isMarriage, false, '通常独立は従来どおり旧大名家の婚姻を新勢力へ継承しない');
    assert.strictEqual(rel24.isMarriage, false);
    assert.strictEqual(manager.getDiplomacyData(1, 4).status, '敵対');
    assert.strictEqual(manager.getDiplomacyData(1, 4).sentiment, 0);
    assert.strictEqual(princesses[0].originalClanId, 1, '姫の実家IDは政治的な独立で書き換えない');
    assert.strictEqual(princesses[0].currentClanId, 2, '嫁ぎ先所属も維持する');
    assert.notStrictEqual(princesses[0].isDiplomaticMarriageActive, false, '通常独立では旧家側の夫婦関係を政治的に無効化しない');
});

test('独立・謀反の外交再編はindependence_systemからDiplomacyManagerへ委譲する', () => {
    const source = read('js/independence_system.js');
    assert.ok(source.includes('this.game.diplomacyManager.reorganizeRelationsAfterRebellion(oldClanId, newClanId)'));
    assert.ok(!source.includes('reorganizeRelationsAfterRebellion(oldClanId, newClanId, { preserveMarriageByFamily: true })'), '通常独立へ婚姻継承例外を適用しない');
    assert.ok(source.includes('oldClanId, oldClanId, { preserveMarriageByFamily: true }'));
    assert.ok(!source.includes('newClan.diplomacyValue[otherClan.id]'), '独立側で新勢力の外交データを直接構築しない');
    assert.ok(!source.includes('currentRel.isMarriage = false'), '謀反側で婚姻フラグを直接破棄しない');
});

test('士気・訓練の0は未設定扱いにせず戦闘・援軍データへ保持する', () => {
    const files = ['js/field_war.js', 'js/reinforcement_service.js', 'js/war_effort.js', 'js/war.js', 'js/life_system.js'];
    files.forEach(file => {
        const source = read(file);
        assert.ok(!/\b(?:morale|training)\s*\|\|\s*50\b/.test(source), `${file} に0を50へ置き換えるfallbackを残さない`);
    });
    assert.ok(!read('js/life_system.js').includes('(c.peoplesLoyalty || 50)'), '民忠0を家督交代時に50へ戻さない');
    assert.ok(!read('js/war_effort.js').includes('recruiter.charm || 50'), '魅力0を捕虜登用時に50へ戻さない');
    assert.ok(!read('js/war_effort.js').includes('prisoner.loyalty || 50'), '忠誠0を捕虜登用時に50へ戻さない');

    const ctx = createContext();
    loadScript(ctx, 'js/config.js');
    loadScript(ctx, 'js/constants.js');
    ctx.game = { getCastleBushos() { return [{ id: 1, clan: 1, strength: 50, status: 'active' }]; } };
    loadScript(ctx, 'js/reinforcement_service.js');
    const service = vm.runInContext('new ReinforcementService(game)', ctx);
    const castle = { id: 10, ownerClan: 1, soldiers: 1000, rice: 2000, horses: 0, guns: 0, morale: 0, training: 0 };
    const data = service.createAutoSelfReinforcement(castle);
    assert.strictEqual(data.morale, 0);
    assert.strictEqual(data.training, 0);
});

test('武将の革新性は明示的な0を保持し、未設定時だけ50を使う', () => {
    const ctx = createContext();
    loadScript(ctx, 'js/models.js');
    ctx.dataZero = { id: 1, clan: 1, castleId: 1, name: '試験武将', birthYear: 1500, endYear: 1580, startYear: 1520, innovation: 0 };
    ctx.dataBlank = { id: 2, clan: 1, castleId: 1, name: '試験武将二', birthYear: 1500, endYear: 1580, startYear: 1520, innovation: '' };
    assert.strictEqual(vm.runInContext('new Busho(dataZero).innovation', ctx), 0);
    assert.strictEqual(vm.runInContext('new Busho(dataBlank).innovation', ctx), 50);
});

test('設定値はGameConfigを正本とし、戦闘・経済・外交にローカルfallbackを再導入しない', () => {
    const war = read('js/war.js');
    const economy = read('js/economy_rules.js');
    const diplomacy = read('js/diplomacy.js');
    const config = read('js/config.js');
    assert.ok(!war.includes('BaseStat || 30'));
    ['SubGeneralFactor', 'DamageFluctuation', 'MoraleBase', 'StatsLdrWeight', 'StatsStrWeight', 'StatsIntWeight', 'MinDamage', 'CounterAtkPowerFactor'].forEach(key => {
        assert.ok(!new RegExp(`\\b(?:W|M)\\.${key}\\s*\\|\\|`).test(war), `WarSystemは${key}のローカルfallbackを持たない`);
    });
    assert.ok(!/PriceAmmo[^\n]*\|\|\s*1/.test(economy));
    assert.ok(!diplomacy.includes('DiplomacyManager.PENALTIES'));
    assert.ok(config.includes('FailureSentiment:'));
    assert.ok(diplomacy.includes('MainParams.Diplomacy.FailureSentiment.Alliance'));
    assert.ok(diplomacy.includes('MainParams.Diplomacy.FailureSentiment.Dominate'));
});

test('本筋1560シナリオの主従外交データはBIN内で相互に整合する', () => {
    const { scenario } = getRuntimeData();
    const relations = new Map();
    for (const row of scenario.diplomacy) {
        const from = Number(row.sourceClanId);
        const to = Number(row.targetClanId);
        const status = String(row.relationType || '');
        assert.ok(Number.isFinite(from) && Number.isFinite(to) && status, '外交初期値はsource/target/relationTypeを持つ');
        relations.set(`${from}:${to}`, status);
    }
    for (const [key, status] of relations) {
        if (status !== '支配' && status !== '従属') continue;
        const [from, to] = key.split(':').map(Number);
        const opposite = relations.get(`${to}:${from}`);
        assert.strictEqual(opposite, status === '支配' ? '従属' : '支配', `主従関係は相手側で反転: ${from}<->${to}`);
    }
});

test('上州の黄斑は攻城戦の守備部隊補正だけを持ち、月次拠点防御力を上昇させない', () => {
    const skill = read('js/skill_manager.js');
    const turn = read('js/turn_manager.js');
    assert.ok(skill.includes('全ての味方部隊は与えるダメージが１０％上昇し、受けるダメージが２０％減少する'));
    assert.ok(!skill.includes('calcMonthlyDefenseBonus'));
    assert.ok(!skill.includes('自身の所属拠点の防御力が５上昇する'));
    assert.ok(!turn.includes('calcMonthlyDefenseBonus'));
});

test('PortraitRules は年代別顔だけを共通解決し非年代条件を分離する', () => {
    const ctx = createContext();
    loadScript(ctx, 'js/portrait_rules.js');

    const rules = ctx.PortraitRules;
    const faceChange = '1553:middle.webp/1570:late.webp/daimyo:lord.webp';
    assert.strictEqual(rules.getLatestYearFace(faceChange, 1550), '');
    assert.strictEqual(rules.getLatestYearFace(faceChange, 1560), 'middle.webp');
    assert.strictEqual(rules.getLatestYearFace(faceChange, 1580), 'late.webp');
    assert.strictEqual(rules.getExactYearFace(faceChange, 1570), 'late.webp');
    assert.strictEqual(rules.getNamedFace(faceChange, 'daimyo'), 'lord.webp');
    assert.strictEqual(rules.hasUnsupportedNonYearCondition(faceChange, ['daimyo']), false);
    assert.strictEqual(rules.hasUnsupportedNonYearCondition('event:special.webp', ['daimyo']), true);
    assert.strictEqual(rules.replaceYearRules('1540:old.webp/daimyo:old_lord.webp', faceChange), '1553:middle.webp/1570:late.webp/daimyo:old_lord.webp');
});

test('年代別顔の新規開始・年次更新は PortraitRules を同じ正本として使う', () => {
    const data = read('js/data_manager.js');
    const life = read('js/life_system.js');
    const html = read('index.html');
    assert.ok(data.includes('window.PortraitRules.getLatestYearFace(b.faceChange, startYear)'));
    assert.ok(life.includes('window.PortraitRules.getExactYearFace(b.faceChange, currentYear)'));
    assert.ok(html.indexOf('js/portrait_rules.js') < html.indexOf('js/data_manager.js'));
});

test('会話上の格は官位を優先し同格官位・双方無官の時だけ威信を使う', () => {
    const ctx = createContext();
    loadScript(ctx, 'js/config.js');
    loadScript(ctx, 'js/busho_list_sort_rules.js');
    loadScript(ctx, 'js/conversation_standing_rules.js');

    const ranks = new Map([
        [10, { id: 10, rankNo: 8, rankName2: '参議' }],
        [11, { id: 11, rankNo: 10, rankName2: '左衛門督' }]
    ]);
    const clans = [
        { id: 1, leaderId: 101, daimyoPrestige: 20000 },
        { id: 2, leaderId: 201, daimyoPrestige: 1000 }
    ];
    const a = { id: 101, clan: 1, isDaimyo: true, courtRankIds: [11] };
    const b = { id: 201, clan: 2, isDaimyo: true, courtRankIds: [10] };
    const bushos = [a, b];
    const game = {
        clans, bushos, legions: [],
        getClan: id => clans.find(c => Number(c.id) === Number(id)),
        getClanDaimyo: id => bushos.find(x => Number(x.clan) === Number(id) && x.isDaimyo),
        courtRankSystem: {
            RANK_ID_SHOGUN: 1, RANK_IDS_CANDIDATE: [98, 99],
            getRankData: id => ranks.get(Number(id)) || null,
            getHighestRankData(busho) {
                const list = (busho.courtRankIds || []).map(id => this.getRankData(id)).filter(Boolean).sort((x, y) => x.rankNo - y.rankNo);
                return list[0] || null;
            }
        }
    };

    let cmp = ctx.ConversationStandingRules.compareDaimyoClans(game, 1, 2);
    assert.strictEqual(cmp.overallRelation, -1, '威信差が大きくても官位下位側を上にはしない');

    a.courtRankIds = [10];
    cmp = ctx.ConversationStandingRules.compareDaimyoClans(game, 1, 2);
    assert.strictEqual(cmp.overallRelation, 2, '同格官位なら威信差を会話上の格へ使う');

    a.courtRankIds = [];
    b.courtRankIds = [];
    cmp = ctx.ConversationStandingRules.compareDaimyoClans(game, 1, 2);
    assert.strictEqual(cmp.overallRelation, 2, '双方無官でも威信差を使う');
});

test('左馬頭・将軍本人は他家所属の使者でも本人の権威を保つ', () => {
    const ctx = createContext();
    loadScript(ctx, 'js/config.js');
    loadScript(ctx, 'js/busho_list_sort_rules.js');
    loadScript(ctx, 'js/conversation_standing_rules.js');
    loadScript(ctx, 'js/diplomacy.js');
    loadScript(ctx, 'js/interview_system.js');
    vm.runInContext('this.DiplomacyManager = DiplomacyManager; this.InterviewSystem = InterviewSystem;', ctx);

    const ranks = new Map([
        [1, { id: 1, rankNo: 1, rankName2: '征夷大将軍' }],
        [98, { id: 98, rankNo: 10, rankName2: '左馬頭' }],
        [20, { id: 20, rankNo: 8, rankName2: '参議' }],
        [30, { id: 30, rankNo: 10, rankName2: '左衛門督' }]
    ]);
    const clans = [
        { id: 1, name: '朝倉家', leaderId: 101, daimyoPrestige: 5000 },
        { id: 2, name: '織田家', leaderId: 201, daimyoPrestige: 10000 }
    ];
    const asakura = { id: 101, clan: 1, isDaimyo: true, fullName: '朝倉義景', familyNameStr: '朝倉', givenName: '義景', courtRankIds: [30], achievementTotal: 500 };
    const oda = { id: 201, clan: 2, isDaimyo: true, fullName: '織田信長', familyNameStr: '織田', givenName: '信長', courtRankIds: [20], achievementTotal: 1200 };
    const yoshiaki = { id: 102, clan: 1, isDaimyo: false, fullName: '足利義昭', familyNameStr: '足利', givenName: '義昭', name: '足利義昭', courtRankIds: [98], achievementTotal: 50 };
    const asakuraRetainer = { id: 103, clan: 1, isDaimyo: false, fullName: '朝倉景鏡', familyNameStr: '朝倉', givenName: '景鏡', name: '朝倉景鏡', courtRankIds: [], achievementTotal: 200, familyIds: [103] };
    const bushos = [asakura, oda, yoshiaki, asakuraRetainer];
    const game = {
        playerClanId: 1,
        clans, bushos, legions: [],
        getClan: id => clans.find(c => Number(c.id) === Number(id)),
        getClanDaimyo: id => bushos.find(x => Number(x.clan) === Number(id) && x.isDaimyo),
        courtRankSystem: {
            RANK_ID_SHOGUN: 1, RANK_IDS_CANDIDATE: [98, 99],
            getRankData: id => ranks.get(Number(id)) || null,
            getHighestRankData(busho) {
                const list = (busho.courtRankIds || []).map(id => this.getRankData(id)).filter(Boolean).sort((x, y) => x.rankNo - y.rankNo);
                return list[0] || null;
            }
        }
    };
    const dm = new ctx.DiplomacyManager(game);
    game.diplomacyManager = dm;

    let greeting = dm.buildDiplomacyGreeting(yoshiaki, oda);
    assert.strictEqual(dm.getCallName(yoshiaki), '左馬頭様');
    yoshiaki.courtRankIds = [98, 20];
    assert.strictEqual(dm.getCallName(yoshiaki), '左馬頭様', '左馬頭とより高い通常官位を併有しても特殊呼称は左馬頭様を維持する');
    yoshiaki.courtRankIds = [98];
    assert.ok(greeting.greetMsg1.includes('両家のため') && greeting.greetMsg1.includes('自ら参った'), '左馬頭本人が使者なら主君の名代ではなく本人が外交を取り持つ口調にする');
    assert.ok(!greeting.greetMsg1.includes('朝倉左衛門督殿の意を受け'));
    assert.ok(greeting.greetMsg2.includes('左馬頭様'));
    assert.ok(greeting.greetMsg2.includes('御自ら'), '受け手も特殊権威本人の来訪として扱う');
    let msgs = dm.getDiplomacyMessages('alliance', false, '朝倉家', '織田家', '左馬頭様', '参議殿', '姫', '貴家', greeting.context);
    assert.ok(msgs.demandMsg.includes('両家で盟約を結びたい'), '提案本体も本人が取り持つ簡潔な口調にする');
    assert.ok(!msgs.replyAcceptMsg.includes('主君にも'));
    assert.ok(!/存じます|参りました|ござります/.test(msgs.demandMsg + msgs.replyAcceptMsg), '左馬頭本人の外交本題も一般家臣敬語へ戻らない');

    // 左馬頭は通常官位ランクだけでは下位になり得るが、面談では将軍候補の特殊権威を優先する。
    asakura.courtRankIds = [20]; // 参議(rankNo 8)で左馬頭(rankNo 10)より通常官位は上
    assert.strictEqual(ctx.ConversationStandingRules.getInterviewSpeakerPosture(game, yoshiaki, asakura).key, 'higher_court');
    assert.strictEqual(ctx.ConversationStandingRules.getInterviewDaimyoCallName(game, yoshiaki, asakura), '参議殿', '左馬頭本人が面談時に単なる「殿」呼びへ落ちない');
    const interview = new ctx.InterviewSystem(game);
    const samanoStatus = interview._getStandingAwareSelfLoyaltyText(yoshiaki, 'stable', 'friendly');
    assert.ok(!samanoStatus.includes('当家に身を置く'), '左馬頭本人の面談返答で一般家臣の所属意識を強く出さない');
    assert.ok(!samanoStatus.includes('申し上げ'), '左馬頭本人の面談返答は当主へ過度にへりくだらない');

    // 左馬頭本人に「他者について」を聞いた時も、途中だけ一般家臣敬語へ戻らない。
    ctx.PersonnelRules = {
        calcRelationshipProfile: () => ({ compatibilityScore: 75, contactScore: 60, affinityDiff: 0 }),
        calcOtherAssessmentBias: () => ({ protectionShift: 0, loyaltyPenalty: 0 })
    };
    interview._getConcealmentProfile = () => ({ perceivedLoyalty: 90 });
    interview._getOtherAssessmentBias = () => ({ protectionShift: 0, loyaltyPenalty: 0 });
    interview._getTargetLoyaltyAssessment = () => ({ text: '参議殿への忠義は本物でしょう。疑う余地もありません。', direction: 'positive' });
    interview.activeInterviewAttitude = 'friendly';
    let samanoTopicMessages = [];
    game.ui = {
        interviewView: {
            showMessages: (_speaker, messages) => { samanoTopicMessages = messages.slice(); }
        }
    };
    interview.executeInterviewTopic(yoshiaki, asakuraRetainer);
    const samanoTopicJoined = samanoTopicMessages.join('');
    assert.ok(!/です。|おります|ございます|申し上げ|でしょう/.test(samanoTopicJoined), '左馬頭が他者を語る3段会話も高格式者の口調を最後まで維持する');

    yoshiaki.courtRankIds = [1];
    greeting = dm.buildDiplomacyGreeting(yoshiaki, oda);
    assert.strictEqual(dm.getCallName(yoshiaki), '公方様');
    assert.ok(greeting.greetMsg1.includes('わし自ら参った'));
    assert.ok(greeting.greetMsg2.includes('公方様'));
    assert.ok(greeting.context.receiverDeferenceLevel >= 3);
});

test('外交会話は格と関係温度を分離し敵対時だけ少し硬く友好時は断り方も柔らかい', () => {
    const ctx = createContext();
    loadScript(ctx, 'js/config.js');
    loadScript(ctx, 'js/constants.js');
    loadScript(ctx, 'js/busho_list_sort_rules.js');
    loadScript(ctx, 'js/conversation_standing_rules.js');
    loadScript(ctx, 'js/diplomacy.js');
    vm.runInContext('this.DiplomacyManager = DiplomacyManager;', ctx);

    const clans = [
        { id: 1, name: '甲家', leaderId: 101, daimyoPrestige: 5000, diplomacyValue: { 2: { status: '敵対', sentiment: 10 } } },
        { id: 2, name: '乙家', leaderId: 201, daimyoPrestige: 5000, diplomacyValue: { 1: { status: '敵対', sentiment: 10 } } }
    ];
    const a = { id: 101, clan: 1, isDaimyo: true, fullName: '甲太郎', givenName: '太郎', courtRankIds: [], achievementTotal: 0 };
    const b = { id: 201, clan: 2, isDaimyo: true, fullName: '乙次郎', givenName: '次郎', courtRankIds: [], achievementTotal: 0 };
    const envoy = { id: 102, clan: 1, isDaimyo: false, fullName: '甲三郎', givenName: '三郎', courtRankIds: [], achievementTotal: 0 };
    const bushos = [a, b, envoy];
    const game = {
        clans, bushos, legions: [],
        getClan: id => clans.find(c => Number(c.id) === Number(id)),
        getClanDaimyo: id => bushos.find(x => Number(x.clan) === Number(id) && x.isDaimyo),
        courtRankSystem: { RANK_ID_SHOGUN: 1, RANK_IDS_CANDIDATE: [], getRankData: () => null, getHighestRankData: () => null }
    };
    const dm = new ctx.DiplomacyManager(game);
    const hostileGreeting = dm.buildDiplomacyGreeting(envoy, b);
    assert.strictEqual(hostileGreeting.context.relationshipTone.key, 'hostile');
    assert.ok(hostileGreeting.greetMsg2.includes('……'));
    const hostile = dm.getDiplomacyMessages('goodwill', false, '甲家', '乙家', '三郎殿', '次郎殿', '姫', '貴家', hostileGreeting.context);
    assert.ok(hostile.rejectMsg.includes('今さら親善の品'));

    clans[0].diplomacyValue[2] = { status: '友好', sentiment: 90 };
    clans[1].diplomacyValue[1] = { status: '友好', sentiment: 90 };
    const friendlyGreeting = dm.buildDiplomacyGreeting(envoy, b);
    assert.strictEqual(friendlyGreeting.context.relationshipTone.key, 'friendly');
    assert.ok(friendlyGreeting.greetMsg2.includes('おお、使者か') || friendlyGreeting.greetMsg2.includes('よう参られた') || friendlyGreeting.greetMsg2.includes('よくお越しくだされた'));
    const friendly = dm.getDiplomacyMessages('goodwill', false, '甲家', '乙家', '三郎殿', '次郎殿', '姫', '貴家', friendlyGreeting.context);
    assert.ok(friendly.rejectMsg.includes('お心遣い'));
    assert.ok(friendly.rejectMsg.includes('お受けいたしかねます'));
});

test('外交使者は軍師・国主・功績でも礼遇が少し変わるが効果判定とは分離する', () => {
    const ctx = createContext();
    loadScript(ctx, 'js/config.js');
    loadScript(ctx, 'js/busho_list_sort_rules.js');
    loadScript(ctx, 'js/conversation_standing_rules.js');
    const clans = [
        { id: 1, leaderId: 101, gunshiId: 102, daimyoPrestige: 5000 },
        { id: 2, leaderId: 201, daimyoPrestige: 5000 }
    ];
    const a = { id: 101, clan: 1, isDaimyo: true, courtRankIds: [], achievementTotal: 500 };
    const b = { id: 201, clan: 2, isDaimyo: true, courtRankIds: [], achievementTotal: 500 };
    const gunshi = { id: 102, clan: 1, isDaimyo: false, isGunshi: true, courtRankIds: [], achievementTotal: 800 };
    const ordinary = { id: 103, clan: 1, isDaimyo: false, courtRankIds: [], achievementTotal: 0 };
    const bushos = [a, b, gunshi, ordinary];
    const game = {
        clans, bushos, legions: [],
        getClan: id => clans.find(c => Number(c.id) === Number(id)),
        getClanDaimyo: id => bushos.find(x => Number(x.clan) === Number(id) && x.isDaimyo),
        courtRankSystem: { RANK_ID_SHOGUN: 1, RANK_IDS_CANDIDATE: [], getRankData: () => null, getHighestRankData: () => null }
    };
    const high = ctx.ConversationStandingRules.getDiplomacyContext(game, gunshi, b);
    const low = ctx.ConversationStandingRules.getDiplomacyContext(game, ordinary, b);
    assert.ok(high.receiverDeferenceLevel > low.receiverDeferenceLevel);
});


test('面談の他者言及は官位・身分・功績を呼称と敬意へ匂わせる', () => {
    const ctx = createContext();
    loadScript(ctx, 'js/config.js');
    loadScript(ctx, 'js/busho_list_sort_rules.js');
    loadScript(ctx, 'js/conversation_standing_rules.js');
    const ranks = new Map([[98, { id: 98, rankNo: 10, rankName2: '左馬頭' }]]);
    const clans = [{ id: 1, leaderId: 100, gunshiId: 101, daimyoPrestige: 5000 }];
    const speaker = { id: 103, clan: 1, courtRankIds: [], achievementTotal: 0 };
    const target = { id: 102, clan: 1, name: '足利義昭', fullName: '足利義昭', familyNameStr: '足利', givenName: '義昭', courtRankIds: [98], achievementTotal: 1000 };
    const game = {
        clans, bushos: [speaker, target], legions: [],
        getClan: id => clans.find(c => Number(c.id) === Number(id)),
        getClanDaimyo: () => null,
        courtRankSystem: {
            RANK_ID_SHOGUN: 1, RANK_IDS_CANDIDATE: [98, 99],
            getRankData: id => ranks.get(Number(id)) || null,
            getHighestRankData(busho) { return (busho.courtRankIds || []).map(id => this.getRankData(id)).filter(Boolean)[0] || null; }
        }
    };
    const standing = ctx.ConversationStandingRules.getPersonalStanding(game, speaker, target);
    assert.strictEqual(ctx.ConversationStandingRules.getInterviewTargetCallName(game, speaker, target), '左馬頭様');
    target.courtRankIds = [98, 20];
    ranks.set(20, { id: 20, rankNo: 2, rankName2: '大納言' });
    assert.strictEqual(ctx.ConversationStandingRules.getInterviewTargetCallName(game, speaker, target), '左馬頭様', '通常官位を併有しても第三者言及では左馬頭様を優先する');
    target.courtRankIds = [98];
    assert.strictEqual(standing.thirdPerson, 'あのお方');
    assert.strictEqual(
        ctx.ConversationStandingRules.getAchievementHint(standing),
        '家中でも一目置かれております。',
        '左馬頭の功績差は通常家臣の「働き」ではなく特殊権威への周囲の敬意として匂わせる'
    );
    target.courtRankIds = [1];
    const shogunStanding = ctx.ConversationStandingRules.getPersonalStanding(game, speaker, target);
    assert.strictEqual(
        ctx.ConversationStandingRules.getAchievementHint(shogunStanding),
        '家中でも一目置かれております。',
        '将軍も左馬頭と同じ特殊権威向けの功績匂わせを使う'
    );
    target.courtRankIds = [98];

    const ordinaryTarget = { id: 104, clan: 1, name: '丹羽長秀', fullName: '丹羽長秀', familyNameStr: '丹羽', givenName: '長秀', courtRankIds: [], achievementTotal: 1000 };
    const ordinaryStanding = ctx.ConversationStandingRules.getPersonalStanding(game, speaker, ordinaryTarget);
    assert.ok(
        ctx.ConversationStandingRules.getAchievementHint(ordinaryStanding).includes('働き'),
        '通常の高功績武将は従来どおり働きを匂わせる'
    );

    const youngDaimyo = { id: 110, clan: 1, isDaimyo: true, realFatherId: 111, birthYear: 1540, courtRankIds: [], achievementTotal: 0 };
    const father = { id: 111, clan: 1, realFatherId: 112, birthYear: 1510, courtRankIds: [], achievementTotal: 1200 };
    const grandfather = { id: 112, clan: 1, birthYear: 1480, courtRankIds: [], achievementTotal: 1300 };
    const uncle = { id: 113, clan: 1, realFatherId: 112, birthYear: 1500, courtRankIds: [], achievementTotal: 1100 };
    const familyGame = {
        clans, bushos: [speaker, youngDaimyo, father, grandfather, uncle], legions: [],
        getClan: id => clans.find(c => Number(c.id) === Number(id)),
        getClanDaimyo: () => youngDaimyo,
        getBusho: id => [speaker, youngDaimyo, father, grandfather, uncle].find(x => Number(x.id) === Number(id)) || null,
        courtRankSystem: { RANK_ID_SHOGUN: 1, RANK_IDS_CANDIDATE: [], getRankData: () => null, getHighestRankData: () => null }
    };
    const fatherStanding = ctx.ConversationStandingRules.getPersonalStanding(familyGame, speaker, father);
    assert.strictEqual(
        ctx.ConversationStandingRules.getAchievementHint(fatherStanding, { game: familyGame, questioner: youngDaimyo, target: father }),
        '家中でも、お言葉に重みのあるお方です。',
        '当主の父・祖父・兄など年長近親者は通常家臣の「働き」で査定せず家中での重みとして功績を匂わせる'
    );
    const grandfatherStanding = ctx.ConversationStandingRules.getPersonalStanding(familyGame, speaker, grandfather);
    assert.ok(
        !ctx.ConversationStandingRules.getAchievementHint(grandfatherStanding, { game: familyGame, questioner: youngDaimyo, target: grandfather }).includes('働き'),
        '当主の祖父にも通常家臣向けの働き表現を使わない'
    );
    const uncleStanding = ctx.ConversationStandingRules.getPersonalStanding(familyGame, speaker, uncle);
    assert.strictEqual(
        ctx.ConversationStandingRules.getAchievementHint(uncleStanding, { game: familyGame, questioner: youngDaimyo, target: uncle }),
        '家中でも一目置かれております。',
        '当主の伯父・叔父は父祖兄より一段控えめな年長親族向け表現にする'
    );

    loadScript(ctx, 'js/interview_system.js');
    vm.runInContext('this.InterviewSystem = InterviewSystem;', ctx);
    const interview = new ctx.InterviewSystem(game);
    assert.strictEqual(interview._isHighAuthorityInterviewTarget(target), true);
    assert.ok(interview._getHighAuthorityOpinionText(75).includes('信頼しております'), '左馬頭・将軍への人物評価は通常の「話のわかる相手」より強く敬う');
    assert.ok(interview._getHighAuthorityOpinionText(30).includes('軽んじるつもりはございませぬ'), '相性が悪くても特殊権威そのものへの敬意は崩さない');
});

test('忠誠所見は通常家臣・一門・特殊権威で表現を分ける', () => {
    const ctx = createContext();
    loadScript(ctx, 'js/config.js');
    loadScript(ctx, 'js/busho_list_sort_rules.js');
    loadScript(ctx, 'js/conversation_standing_rules.js');
    loadScript(ctx, 'js/interview_system.js');
    vm.runInContext('this.InterviewSystem = InterviewSystem;', ctx);

    const ranks = new Map([[98, { id: 98, rankNo: 10, rankName2: '左馬頭' }]]);
    const daimyo = { id: 1, clan: 1, isDaimyo: true, fullName: '織田信忠', familyNameStr: '織田', givenName: '信忠', realFatherId: 2, familyIds: [1, 2], courtRankIds: [] };
    const father = { id: 2, clan: 1, fullName: '織田信長', familyNameStr: '織田', givenName: '信長', familyIds: [1, 2], courtRankIds: [] };
    const yoshiaki = { id: 3, clan: 1, fullName: '足利義昭', familyNameStr: '足利', givenName: '義昭', familyIds: [3], courtRankIds: [98] };
    const retainer = { id: 4, clan: 1, fullName: '丹羽長秀', familyNameStr: '丹羽', givenName: '長秀', familyIds: [4], courtRankIds: [] };
    const bushos = [daimyo, father, yoshiaki, retainer];
    const game = {
        playerClanId: 1, bushos, clans: [{ id: 1, leaderId: 1 }],
        getBusho: id => bushos.find(b => Number(b.id) === Number(id)) || null,
        getClanDaimyo: () => daimyo,
        courtRankSystem: {
            RANK_ID_SHOGUN: 1, RANK_IDS_CANDIDATE: [98],
            getRankData: id => ranks.get(Number(id)) || null,
            getHighestRankData(busho) { return (busho.courtRankIds || []).map(id => this.getRankData(id)).filter(Boolean)[0] || null; }
        }
    };
    const interview = new ctx.InterviewSystem(game);

    assert.strictEqual(ctx.ConversationStandingRules.getLoyaltyExpressionStyle(game, daimyo, retainer), 'fealty');
    assert.strictEqual(ctx.ConversationStandingRules.getLoyaltyExpressionStyle(game, daimyo, father), 'family');
    assert.strictEqual(ctx.ConversationStandingRules.getLoyaltyExpressionStyle(game, daimyo, yoshiaki), 'authority');

    const normal = interview._getTargetLoyaltyBandText('stable', false, 'fealty');
    const family = interview._getTargetLoyaltyBandText('danger', false, 'family');
    const authority = interview._getTargetLoyaltyBandText('stable', false, 'authority');
    assert.ok(normal.includes('忠義'), '通常家臣は従来の忠義表現を維持する');
    assert.ok(!family.includes('忠義') && family.includes('殿のお考え'), '一門は忠義ではなく当主の考えとの一致・食い違いで匂わせる');
    assert.ok(!authority.includes('忠義') && authority.includes('理解を示して'), '将軍・左馬頭は忠義ではなく理解・協調として表現する');
    assert.ok(!family.includes('距離が') && !authority.includes('距離が'), '人間関係を俯瞰した「距離ができた」説明は使わない');
});

test('軍師の当主への口調と報告対象への敬意は面談の会話規則を共用する', () => {
    const ctx = createContext();
    loadScript(ctx, 'js/config.js');
    loadScript(ctx, 'js/busho_list_sort_rules.js');
    loadScript(ctx, 'js/conversation_standing_rules.js');
    loadScript(ctx, 'js/gunshi_system.js');
    vm.runInContext('this.GunshiSystem = GunshiSystem;', ctx);

    const ranks = new Map([[98, { id: 98, rankNo: 10, rankName2: '左馬頭' }]]);
    const daimyo = { id: 1, clan: 1, isDaimyo: true, fullName: '織田信忠', familyNameStr: '織田', givenName: '信忠', realFatherId: 2, familyIds: [1, 2], courtRankIds: [] };
    const fatherGunshi = { id: 2, clan: 1, isGunshi: true, fullName: '織田信長', familyNameStr: '織田', givenName: '信長', familyIds: [1, 2], courtRankIds: [] };
    const yoshiakiGunshi = { id: 3, clan: 1, isGunshi: true, fullName: '足利義昭', familyNameStr: '足利', givenName: '義昭', familyIds: [3], courtRankIds: [98] };
    const bushos = [daimyo, fatherGunshi, yoshiakiGunshi];
    const game = {
        playerClanId: 1, bushos, clans: [{ id: 1, leaderId: 1 }],
        getBusho: id => bushos.find(b => Number(b.id) === Number(id)) || null,
        getClanDaimyo: () => daimyo,
        courtRankSystem: {
            RANK_ID_SHOGUN: 1, RANK_IDS_CANDIDATE: [98],
            getRankData: id => ranks.get(Number(id)) || null,
            getHighestRankData(busho) { return (busho.courtRankIds || []).map(id => this.getRankData(id)).filter(Boolean)[0] || null; }
        }
    };
    const system = new ctx.GunshiSystem(game);

    assert.strictEqual(ctx.ConversationStandingRules.getDaimyoSpeakerPosture(game, yoshiakiGunshi, daimyo).key, 'higher_court');
    assert.strictEqual(system._styleForSpeaker(yoshiakiGunshi, 'おそらく上手くいくでしょう。'), 'おそらく上手くいくだろう。', '左馬頭が軍師でも面談同様に当主へ敬語へ戻らない');
    assert.strictEqual(system._styleForSpeaker(yoshiakiGunshi, '合戦におもむきますか？ 兵力と兵糧の確認をお忘れなく。'), '合戦におもむくか。兵と兵糧の備えは見ておいた方がよかろう。', '戦争助言も左馬頭の軍師だけ敬語へ戻さず高格式者らしい助言へする');
    assert.ok(!/ください|ません|ましょう/.test(system._styleForSpeaker(yoshiakiGunshi, 'おやめください。厳しい結果になるかもしれません。運が良ければ仕留められましょう。')), '軍師助言の代表的な敬語活用も高格式者では常体へ整える');
    assert.strictEqual(system._styleForSpeaker(fatherGunshi, '厳しい結果になるでしょう。'), '厳しい結果になるだろう。', '年長親族が軍師でも当主への常体を使う');
    assert.strictEqual(system._styleForSpeaker(fatherGunshi, '合戦におもむきますか？ 兵力と兵糧の確認をお忘れなく。'), '合戦におもむくか。兵と兵糧の備えは怠るな。', '父などの軍師は合戦前助言も指導的な家族口調にする');
    assert.strictEqual(system._styleForSpeaker(yoshiakiGunshi, 'おやめください。失敗する未来が見えます。'), 'やめておくのがよかろう。失敗する未来が見える。', '高格式軍師は単なる敬語除去ではなく落ち着いた上位者口調へ寄せる');
    assert.ok(!system._getSelfConcernMessage(fatherGunshi, 'red').includes('恐れながら'), '父などの軍師自身の不満表明も一般家臣の恐れ入る口調へ戻さない');
    assert.ok(!system._getSelfConcernMessage(fatherGunshi, 'red').includes('今の扱い'), '一門軍師本人の不満も待遇ではなく当主との考えの食い違いとして話す');
    assert.ok(!/ませぬ|ください/.test(system._styleForSpeaker(yoshiakiGunshi, 'おやめください。成功はまず望めませぬ。')), '軍師助言の低成功率文も特殊権威では途中だけ敬語へ戻らない');
    assert.ok(system._getDaimyoAddress(yoshiakiGunshi).endsWith('殿'), '高格式軍師は当主の公的呼称を使いつつ文末は常体にできる');
    assert.strictEqual(system._getTargetCallName(yoshiakiGunshi, fatherGunshi), '御父君', '軍師報告の対象呼称には当主との血縁敬称を反映する');

    ctx.BushoStatusRules = { isActive: () => true };
    game.getClanGunshi = () => yoshiakiGunshi;
    const captured = [];
    game.ui = {
        showDialog: (msg, _modal, callback) => { captured.push(msg); if (callback) callback(); }
    };
    system.getLoyaltyAssessment = target => Number(target.id) === Number(fatherGunshi.id)
        ? { priority: 2, alert: 'red', severity: 5 }
        : { priority: 0, alert: 'none', severity: 0 };
    system.compareLoyaltyAssessments = () => 0;
    system.checkAndShowAdvice(null, () => {});
    const report = captured.join('');
    assert.ok(report.includes('織田殿、御父君は'), '左馬頭の軍師報告でも当主への公的呼称と報告対象への血縁敬称を分離する');
    assert.ok(!/見受けられます|ご配慮|ございます|でしょう/.test(report), '左馬頭が軍師として報告する時も面談と同じ常体レジスターを最後まで使う');

    const familyConcern = system._buildLoyaltyConcernMessage(yoshiakiGunshi, { busho: fatherGunshi, assessment: { alert: 'red' } });
    assert.ok(familyConcern.includes('御父君') && familyConcern.includes('織田殿の考え'), '高格式軍師は一門の忠誠低下を待遇ではなく当主との考えの食い違いとして報告する');
    assert.ok(!familyConcern.includes('待遇への不満') && !familyConcern.includes('忠義'), '一門の月初所見でも通常家臣の待遇・忠義表現へ戻さない');

    const authorityConcern = system._styleForSpeaker(fatherGunshi, system._buildLoyaltyConcernMessage(fatherGunshi, { busho: yoshiakiGunshi, assessment: { alert: 'orange' } }));
    assert.ok(authorityConcern.includes('左馬頭様') && authorityConcern.includes('信忠の考え'), '父の軍師が左馬頭を報告する場合も対象への特殊敬称と子への常体を両立する');
    assert.ok(!/待遇への不満|忠義|です。|ございます|でしょう/.test(authorityConcern), '特殊権威の忠誠警告を通常家臣表現や聞き手への敬語へ戻さない');

    const warEffortSource = read('js/war_effort.js');
    assert.ok(warEffortSource.includes('gunshiDialogue._styleForSpeaker(gunshi, text)'), '戦況報告もGunshiSystemの話者レジスターを通す');
    assert.ok(warEffortSource.includes('gunshiDialogue.getSituationDaimyoSortieText(gunshi)'), '戦況報告の当主出陣文も軍師と当主の関係別に生成する');
    assert.ok(warEffortSource.includes('atkLeader ? getAdvisorTargetCallName(atkLeader)'), '戦況報告の総大将名も将軍・左馬頭・親族を含む共通呼称へ通す');
});

test('無官の会話呼称は異姓なら姓、同姓一門なら諱、同姓非一門ならフルネームを使う', () => {
    const ctx = createContext();
    loadScript(ctx, 'js/config.js');
    loadScript(ctx, 'js/busho_list_sort_rules.js');
    loadScript(ctx, 'js/conversation_standing_rules.js');
    const game = {
        courtRankSystem: { RANK_ID_SHOGUN: 1, RANK_IDS_CANDIDATE: [], getRankData: () => null, getHighestRankData: () => null },
        clans: [], bushos: [], legions: []
    };
    const speaker = { id: 1, familyNameStr: '北条', givenName: '氏政', fullName: '北条氏政', courtRankIds: [], familyIds: [1, 2] };
    const kin = { id: 2, familyNameStr: '北条', givenName: '氏照', fullName: '北条氏照', courtRankIds: [], familyIds: [2, 1] };
    const unrelated = { id: 3, familyNameStr: '北条', givenName: '幻庵', fullName: '北条幻庵', courtRankIds: [], familyIds: [3] };
    const otherSurname = { id: 4, familyNameStr: '松田', givenName: '憲秀', fullName: '松田憲秀', courtRankIds: [], familyIds: [4] };

    assert.strictEqual(ctx.ConversationStandingRules.getInterviewTargetCallName(game, speaker, otherSurname), '松田殿');
    assert.strictEqual(ctx.ConversationStandingRules.getInterviewTargetCallName(game, speaker, kin), '氏照殿');
    assert.strictEqual(ctx.ConversationStandingRules.getInterviewTargetCallName(game, speaker, unrelated), '北条幻庵殿');
    assert.strictEqual(ctx.ConversationStandingRules.getDiplomaticCallName(game, otherSurname, speaker), '松田殿');
    assert.strictEqual(ctx.ConversationStandingRules.getDiplomaticCallName(game, kin, speaker), '氏照殿');
    assert.strictEqual(ctx.ConversationStandingRules.getDiplomaticCallName(game, unrelated, speaker), '北条幻庵殿');
});



test('面談の実父系呼称は話者本人・質問者との関係を分け、軍師呼称も優先順位に従う', () => {
    const ctx = createContext();
    loadScript(ctx, 'js/config.js');
    loadScript(ctx, 'js/busho_list_sort_rules.js');
    loadScript(ctx, 'js/conversation_standing_rules.js');
    loadScript(ctx, 'js/interview_system.js');
    vm.runInContext('this.InterviewSystem = InterviewSystem;', ctx);

    const rank = { id: 20, rankNo: 8, rankName2: '秋田城介' };
    const highRank = { id: 21, rankNo: 2, rankName2: '大納言' };
    const nobuhide = { id: 100, clan: 1, familyNameStr: '織田', givenName: '信秀', fullName: '織田信秀', birthYear: 1511, realFatherId: 99, courtRankIds: [], familyIds: [100, 1, 4, 12, 13] };
    const olderUncle = { id: 12, clan: 1, familyNameStr: '織田', givenName: '信定', fullName: '織田信定', birthYear: 1508, realFatherId: 99, courtRankIds: [], familyIds: [12, 100, 1] };
    const youngerUncle = { id: 13, clan: 1, familyNameStr: '織田', givenName: '信康', fullName: '織田信康', birthYear: 1514, realFatherId: 99, courtRankIds: [], familyIds: [13, 100, 1] };
    const sameYearUncle = { id: 14, clan: 1, familyNameStr: '織田', givenName: '信光', fullName: '織田信光', birthYear: 1511, realFatherId: 99, courtRankIds: [], familyIds: [14, 100, 1] };
    const nobunaga = { id: 1, clan: 1, isDaimyo: true, familyNameStr: '織田', givenName: '信長', fullName: '織田信長', birthYear: 1534, realFatherId: 100, courtRankIds: [], familyIds: [1, 100, 2, 3, 4, 5] };
    const nobutada = { id: 2, clan: 1, familyNameStr: '織田', givenName: '信忠', fullName: '織田信忠', birthYear: 1557, realFatherId: 1, courtRankIds: [], familyIds: [2, 1, 5] };
    const nobukatsu = { id: 3, clan: 1, familyNameStr: '織田', givenName: '信雄', fullName: '織田信雄', birthYear: 1558, realFatherId: 1, courtRankIds: [], familyIds: [3, 1] };
    const youngerBrother = { id: 4, clan: 1, familyNameStr: '織田', givenName: '信勝', fullName: '織田信勝', birthYear: 1536, realFatherId: 100, courtRankIds: [], familyIds: [4, 100, 1] };
    const grandson = { id: 5, clan: 1, familyNameStr: '織田', givenName: '三法師', fullName: '織田三法師', birthYear: 1578, realFatherId: 2, courtRankIds: [], familyIds: [5, 2, 1] };
    const retainer = { id: 6, clan: 1, familyNameStr: '柴田', givenName: '勝家', fullName: '柴田勝家', birthYear: 1522, realFatherId: 0, courtRankIds: [], familyIds: [6] };
    const gunshi = { id: 7, clan: 1, isGunshi: true, familyNameStr: '沢彦', givenName: '宗恩', fullName: '沢彦宗恩', birthYear: 1500, realFatherId: 0, courtRankIds: [], familyIds: [7] };
    const commander = { id: 17, clan: 1, isCommander: true, familyNameStr: '丹羽', givenName: '長秀', fullName: '丹羽長秀', birthYear: 1535, realFatherId: 0, courtRankIds: [], familyIds: [17] };
    const odaHiroyoshi = { id: 15, clan: 1, familyNameStr: '織田', givenName: '広良', fullName: '織田広良', birthYear: 1510, realFatherId: 0, courtRankIds: [], familyIds: [15] };
    const adoptiveFather = { id: 8, clan: 1, familyNameStr: '細川', givenName: '幽斎', fullName: '細川幽斎', birthYear: 1534, realFatherId: 0, courtRankIds: [], familyIds: [8, 10], female: false };
    const adoptedChild = { id: 10, clan: 1, familyNameStr: '細川', givenName: '忠興', fullName: '細川忠興', birthYear: 1563, realFatherId: 0, adoptiveFatherId: 8, courtRankIds: [], familyIds: [10, 8] };
    const warriorMother = { id: 9, clan: 1, familyNameStr: '足利', givenName: '徳', fullName: '足利徳', birthYear: 1574, realFatherId: 0, courtRankIds: [], familyIds: [9, 11], female: true };
    const mothersChild = { id: 11, clan: 1, familyNameStr: '喜連川', givenName: '義親', fullName: '喜連川義親', birthYear: 1592, realFatherId: 0, adoptiveFatherId: 9, courtRankIds: [], familyIds: [11, 9] };
    const highOfficer = { id: 16, clan: 1, familyNameStr: '近衛', givenName: '前久', fullName: '近衛前久', birthYear: 1536, realFatherId: 0, courtRankIds: [21], familyIds: [16], loyalty: 90, duty: 70, ambition: 40, intelligence: 80 };
    const bushos = [nobuhide, nobunaga, nobutada, nobukatsu, youngerBrother, grandson, retainer, gunshi, commander, odaHiroyoshi, adoptiveFather, adoptedChild, warriorMother, mothersChild, olderUncle, youngerUncle, sameYearUncle, highOfficer];
    const game = {
        playerClanId: 1,
        clans: [], bushos, legions: [],
        getBusho: id => bushos.find(b => Number(b.id) === Number(id)) || null,
        getClanDaimyo: clanId => Number(clanId) === 1 ? nobunaga : null,
        courtRankSystem: {
            RANK_ID_SHOGUN: 1, RANK_IDS_CANDIDATE: [],
            getRankData: id => Number(id) === 20 ? rank : (Number(id) === 21 ? highRank : null),
            getHighestRankData(busho) {
                if ((busho.courtRankIds || []).includes(21)) return highRank;
                return (busho.courtRankIds || []).includes(20) ? rank : null;
            }
        }
    };

    assert.strictEqual(ctx.ConversationStandingRules.getDirectFamilyCallName(game, nobutada, nobunaga), '父上');
    assert.strictEqual(ctx.ConversationStandingRules.getDirectFamilyCallName(game, youngerBrother, nobunaga), '兄上');
    assert.strictEqual(ctx.ConversationStandingRules.getDirectFamilyCallName(game, grandson, nobunaga), '祖父上');
    assert.strictEqual(ctx.ConversationStandingRules.getDirectFamilyCallName(game, nobunaga, olderUncle), '伯父上');
    assert.strictEqual(ctx.ConversationStandingRules.getDirectFamilyCallName(game, nobunaga, youngerUncle), '叔父上');
    assert.strictEqual(ctx.ConversationStandingRules.getPaternalRelation(game, olderUncle, nobunaga), 'sibling_child', '伯父側から甥を見る逆方向も同じ血縁正本で判定する');
    assert.strictEqual(ctx.ConversationStandingRules.getDirectFamilyCallName(game, olderUncle, nobunaga), '信長', '伯父から甥は年少親族として無官なら諱を呼び捨てにする');
    assert.strictEqual(ctx.ConversationStandingRules.getPaternalRelation(game, nobunaga, sameYearUncle), 'none', '父と同年で伯叔を確定できない場合は誤推論しない');
    assert.strictEqual(ctx.ConversationStandingRules.getDirectFamilyCallName(game, adoptedChild, adoptiveFather), '義父上');
    assert.strictEqual(ctx.ConversationStandingRules.getDirectFamilyCallName(game, mothersChild, warriorMother), '母上');
    assert.strictEqual(ctx.ConversationStandingRules.getDirectFamilyCallName(game, nobunaga, nobutada), '信忠', '父から子は無官なら諱を呼び捨てにする');
    assert.strictEqual(ctx.ConversationStandingRules.getDirectFamilyCallName(game, adoptiveFather, adoptedChild), '忠興', '義父から養子も年少親族として呼び捨てにする');
    assert.strictEqual(ctx.ConversationStandingRules.getDirectFamilyCallName(game, warriorMother, mothersChild), '義親', '武将母から子も年少親族として呼び捨てにする');

    // 話者本人から見た年長親族は、官位より家族呼称を優先する。
    assert.strictEqual(ctx.ConversationStandingRules.getInterviewTargetCallName(game, nobutada, nobunaga, nobunaga), '父上');
    assert.strictEqual(ctx.ConversationStandingRules.getInterviewTargetCallName(game, youngerBrother, nobunaga, nobunaga), '兄上');
    assert.strictEqual(ctx.ConversationStandingRules.getInterviewTargetCallName(game, grandson, nobunaga, nobunaga), '祖父上');
    assert.strictEqual(ctx.ConversationStandingRules.getInterviewTargetCallName(game, nobunaga, olderUncle, nobunaga), '伯父上');
    assert.strictEqual(ctx.ConversationStandingRules.getInterviewTargetCallName(game, nobunaga, youngerUncle, nobunaga), '叔父上');
    assert.strictEqual(ctx.ConversationStandingRules.getInterviewTargetCallName(game, adoptedChild, adoptiveFather, nobunaga), '義父上');
    assert.strictEqual(ctx.ConversationStandingRules.getInterviewTargetCallName(game, mothersChild, warriorMother, nobunaga), '母上');

    // 話者本人から見た年少親族は、無官なら諱を敬称なしで呼ぶ。
    assert.strictEqual(ctx.ConversationStandingRules.getInterviewTargetCallName(game, nobunaga, youngerBrother, nobunaga), '信勝');
    assert.strictEqual(ctx.ConversationStandingRules.getInterviewTargetCallName(game, nobunaga, nobutada, nobunaga), '信忠');
    assert.strictEqual(ctx.ConversationStandingRules.getInterviewTargetCallName(game, nobunaga, grandson, nobunaga), '三法師');

    // 話者と対象が血縁でなければ、質問者である当主から見た続柄を使う。
    assert.strictEqual(ctx.ConversationStandingRules.getInterviewTargetCallName(game, retainer, nobutada, nobunaga), '御子息様');
    assert.strictEqual(ctx.ConversationStandingRules.getInterviewTargetCallName(game, retainer, nobunaga, nobutada), '御父君');
    assert.strictEqual(ctx.ConversationStandingRules.getInterviewTargetCallName(game, retainer, nobunaga, youngerBrother), '御兄君');
    assert.strictEqual(ctx.ConversationStandingRules.getInterviewTargetCallName(game, retainer, youngerBrother, nobunaga), '御舎弟');
    assert.strictEqual(ctx.ConversationStandingRules.getInterviewTargetCallName(game, retainer, nobunaga, grandson), '御祖父君');
    assert.strictEqual(ctx.ConversationStandingRules.getInterviewTargetCallName(game, retainer, grandson, nobunaga), 'お孫様');
    assert.strictEqual(ctx.ConversationStandingRules.getInterviewTargetCallName(game, retainer, olderUncle, nobunaga), '御伯父上');
    assert.strictEqual(ctx.ConversationStandingRules.getInterviewTargetCallName(game, retainer, youngerUncle, nobunaga), '御叔父上');

    // 質問者である大名と同姓の無官武将は、話者が異姓でも姓だけにせずフルネームで識別する。
    assert.strictEqual(ctx.ConversationStandingRules.getInterviewTargetCallName(game, retainer, odaHiroyoshi, nobunaga), '織田広良殿');

    // 血縁のない無官軍師は役職名で呼ぶ。
    assert.strictEqual(ctx.ConversationStandingRules.getInterviewTargetCallName(game, retainer, gunshi, nobunaga), '軍師殿');
    nobutada.isGunshi = true;
    assert.strictEqual(ctx.ConversationStandingRules.getInterviewTargetCallName(game, retainer, nobutada, nobunaga), '御子息様', '当主の血縁なら軍師殿より続柄を優先する');
    nobutada.isGunshi = false;

    nobutada.courtRankIds = [20];
    assert.strictEqual(ctx.ConversationStandingRules.getInterviewTargetCallName(game, retainer, nobutada, nobunaga), '秋田城介殿', '第三者言及では官位を当主との血縁呼称より優先する');
    assert.strictEqual(ctx.ConversationStandingRules.getInterviewTargetCallName(game, nobunaga, nobutada, nobunaga), '秋田城介', '年少の実子は官位持ちなら敬称なしの官位名で呼ぶ');

    const interview = new ctx.InterviewSystem(game);
    assert.ok(interview._getGreetingText(nobutada, 'friendly').includes('父上'), '子本人は官位に関係なく父上と呼ぶ');
    assert.ok(interview._getGreetingText(youngerBrother, 'polite').includes('兄上'), '弟本人は兄上と呼ぶ');
    assert.ok(interview._getGreetingText(grandson, 'reserved').includes('祖父上'), '孫本人は祖父上と呼ぶ');
    game.getClanDaimyo = clanId => Number(clanId) === 1 ? olderUncle : null;
    assert.ok(interview._getGreetingText(nobunaga, 'friendly').includes('伯父上'), '甥本人は父より年長の伯父を伯父上と呼ぶ');
    game.getClanDaimyo = clanId => Number(clanId) === 1 ? youngerUncle : null;
    assert.ok(interview._getGreetingText(nobunaga, 'friendly').includes('叔父上'), '甥本人は父より年下の叔父を叔父上と呼ぶ');
    game.getClanDaimyo = clanId => Number(clanId) === 1 ? adoptiveFather : null;
    assert.ok(interview._getGreetingText(adoptedChild, 'friendly').includes('義父上'), '養子本人は義父上と呼ぶ');
    game.getClanDaimyo = clanId => Number(clanId) === 1 ? warriorMother : null;
    assert.ok(interview._getGreetingText(mothersChild, 'friendly').includes('母上'), 'adoptiveFatherId が女性武将を指す場合は母上と呼ぶ');
    game.getClanDaimyo = clanId => Number(clanId) === 1 ? adoptedChild : null;
    assert.ok(interview._getGreetingText(adoptiveFather, 'friendly').includes('忠興'), '義父から養子へは殿を付けず諱で呼ぶ');
    assert.ok(!interview._getGreetingText(adoptiveFather, 'friendly').includes('殿'), '義父から養子への直接呼称に殿を付けない');
    game.getClanDaimyo = clanId => Number(clanId) === 1 ? nobutada : null;
    assert.ok(interview._getGreetingText(nobunaga, 'friendly').includes('秋田城介'), '実父から官位持ちの子へは敬称なしの官位名で呼ぶ');
    assert.ok(!interview._getGreetingText(nobunaga, 'friendly').includes('秋田城介殿'), '年少親族の官位呼称には殿を付けない');
    game.getClanDaimyo = clanId => Number(clanId) === 1 ? nobunaga : null;
    assert.strictEqual(interview._applyDirectAddress('殿への忠義は本物でしょう。', nobutada), '父上への忠義は本物でしょう。');
    assert.strictEqual(interview._getDirectAddressName(retainer), '殿');

    assert.strictEqual(ctx.ConversationStandingRules.getInterviewSpeakerPosture(game, nobuhide, nobunaga).key, 'senior_close', '父・祖父・兄など年長近親者は面談で近い家族口調を使う');
    assert.strictEqual(ctx.ConversationStandingRules.getInterviewSpeakerPosture(game, olderUncle, nobunaga).key, 'senior_extended', '伯父・叔父は一段距離のある年長親族口調を使う');
    assert.strictEqual(ctx.ConversationStandingRules.getInterviewSpeakerPosture(game, highOfficer, nobunaga).key, 'higher_court', '当主より官位が上の家臣は高格式者向け口調を使う');
    assert.ok(interview._getGreetingText(nobuhide, 'friendly').includes('よう来た'), '父から子への温かい挨拶は家臣用の他人行儀な文を使わない');
    assert.ok(!interview._getGreetingText(nobuhide, 'friendly').includes('お越しくださいました'), '年長近親者から当主へ過度な家臣敬語を使わない');
    assert.ok(interview._getGreetingText(olderUncle, 'friendly').includes('よう参ったな'), '伯父・叔父から甥への挨拶は少し親しい距離感にする');
    assert.ok(interview._getGreetingText(olderUncle, 'polite').includes('本日は何用かな'), '伯父・叔父の中間態度は自然な一つの台詞へまとめる');
    assert.ok(interview._getGreetingText(highOfficer, 'friendly').includes('織田殿') && interview._getGreetingText(highOfficer, 'friendly').includes('よう参られた'), '当主より高官の家臣は当主を少し下に見る高格式者向け挨拶を使う');
    assert.ok(!interview._getMenuPrompt('friendly', nobuhide).includes('申し付け'), '年長近親者の面談メニュー導入も家臣用敬語へ戻さない');
    assert.ok(!interview._getStandingAwareSelfLoyaltyText(nobuhide, 'stable', 'friendly').includes('御恩'), '父など年長近親者の忠誠返答で「身に余る御恩」と過度にへりくだらない');

    const elderStanding = ctx.ConversationStandingRules.getPersonalStanding(game, nobuhide, retainer);
    const elderProfile = interview._getHouseholdElderAssessmentProfile(nobuhide, retainer, elderStanding);
    assert.ok(elderProfile && elderProfile.key === 'senior_close', '当主の父などは格下家臣を評する時に家中年長者口調を使える');
    assert.strictEqual(interview._getHouseholdElderTopicOpening(nobuhide, retainer, elderProfile, 'friendly'), '柴田か。');
    assert.ok(interview._getHouseholdElderOpinionText(75).includes('信頼しておる'), '家中年長者の他者評価は通常家臣より一段くだけた語り口にする');

    const gunshiStanding = ctx.ConversationStandingRules.getPersonalStanding(game, nobuhide, gunshi);
    assert.strictEqual(interview._getHouseholdElderAssessmentProfile(nobuhide, gunshi, gunshiStanding), null, '軍師など敬意が必要な対象を格下用の長老評価文では扱わない');
    assert.ok(interview._getIndependentTopicOpening(nobuhide, gunshi, gunshiStanding, null, 'friendly').startsWith('軍師殿か。'), '父が子へ軍師について話す時も対象への敬意だけは呼称に残す');
    const gunshiOpinion = interview._applyIndependentInterviewRegister(
        interview._applyStandingReferenceText(interview._getOpinionText(75, 'friendly'), gunshiStanding),
        nobuhide
    );
    assert.ok(!/です。|おります|ございます|申し上げ/.test(gunshiOpinion), '父が子へ軍師について話す時、対象を敬っても聞き手への一般家臣敬語へ戻らない');

    const commanderStanding = ctx.ConversationStandingRules.getPersonalStanding(game, nobuhide, commander);
    assert.ok(interview._getIndependentTopicOpening(nobuhide, commander, commanderStanding, null, 'friendly').startsWith('丹羽殿か。'), '父が子へ国主について話す時も対象を殿付けで敬いつつ常体で導入する');
    const commanderOpinion = interview._applyIndependentInterviewRegister(
        interview._applyStandingReferenceText(interview._getOpinionText(35, 'friendly'), commanderStanding),
        nobuhide
    );
    assert.ok(!/です。|おります|ございます|合いませぬ|申し上げ/.test(commanderOpinion), '国主の評価内容でも父から子への口調を崩さない');

    const highAuthorityPlain = interview._applyIndependentInterviewRegister(interview._getHighAuthorityOpinionText(82), nobuhide);
    assert.ok(highAuthorityPlain.includes('お考え') && highAuthorityPlain.includes('お方だ'), '父が子へ高格式者を語る時は対象への敬意を残す');
    assert.ok(!/です。|おります|ございます|申し上げ/.test(highAuthorityPlain), '高格式者への敬意と子への常体を分離する');

    // 実際の「他者について聞く」経路でも、話題の相手の格と聞き手への口調を混同しない。
    ctx.PersonnelRules = {
        calcRelationshipProfile: () => ({ compatibilityScore: 75, contactScore: 60, affinityDiff: 0 }),
        calcOtherAssessmentBias: () => ({ protectionShift: 0, loyaltyPenalty: 0 })
    };
    interview._getConcealmentProfile = () => ({ perceivedLoyalty: 90 });
    interview._getOtherAssessmentBias = () => ({ protectionShift: 0, loyaltyPenalty: 0 });
    interview._getTargetLoyaltyAssessment = () => ({ text: '殿への忠義は本物でしょう。疑う余地もありません。', direction: 'positive' });
    interview.activeInterviewAttitude = 'friendly';
    let capturedTopicMessages = [];
    game.ui = {
        interviewView: {
            showMessages: (_speaker, messages) => { capturedTopicMessages = messages.slice(); }
        }
    };
    interview.executeInterviewTopic(nobuhide, gunshi);
    const gunshiTopicJoined = capturedTopicMessages.join('');
    assert.ok(gunshiTopicJoined.includes('軍師殿か。'), '実際の他者評価でも軍師への敬称を残す');
    assert.ok(!/です。|おります|ございます|申し上げ|でしょう/.test(gunshiTopicJoined), '父が子へ軍師を評する3段会話は最後まで一般家臣敬語へ戻らない');

    capturedTopicMessages = [];
    interview.executeInterviewTopic(nobuhide, commander);
    const commanderTopicJoined = capturedTopicMessages.join('');
    assert.ok(commanderTopicJoined.includes('丹羽殿か。'), '実際の他者評価でも国主への敬意は呼称に残す');
    assert.ok(!/です。|おります|ございます|申し上げ|でしょう/.test(commanderTopicJoined), '父が子へ国主を評する3段会話も最後まで常体を保つ');

    const policyStyled = interview._applyIndependentInterviewRegister('攻めるなら東を第一に見るのがよろしいでしょう。今の軍勢の動きとも合っております。', nobuhide);
    assert.ok(policyStyled.includes('よいだろう') && policyStyled.includes('合っておる'), '父・祖父・兄などの方針助言は途中だけ一般家臣敬語へ戻らない');
    assert.ok(!/よろしいでしょう|おります|申し上げ/.test(policyStyled));
    const loyaltyStyled = interview._applyIndependentInterviewRegister('信忠への忠義は本物でしょう。疑う余地もありません。', nobuhide);
    assert.strictEqual(loyaltyStyled, '信忠への忠義は本物だろう。疑う余地もない。', '家中年長者が他者忠誠を評する最後の一言も同じ口調を保つ');
    interview.activeInterviewAttitude = 'friendly';
    const rumorStyled = interview._getRumorMessages(nobuhide, { target: { id: 999, name: '他家武将', clan: 0, isDaimyo: true }, mode: 'general' }).join('');
    assert.ok(!/存じませぬ|おります|ました|そうです|評判です/.test(rumorStyled), '父・祖父・兄などの武将の噂も一般家臣敬語へ戻らない');
    assert.ok(/知らぬ|なっておる|聞いておる/.test(rumorStyled), '噂本文は年長者らしい常体へ揃える');

    const opening = interview._getTopicOpening(nobutada, nobunaga, { deferenceLevel: 3, achievementRelation: 0 }, 'friendly');
    assert.ok(opening.startsWith('父上ですか。'));
    assert.strictEqual(interview._getTopicOpening(nobutada, nobunaga, { deferenceLevel: 3, achievementRelation: 0 }, 'reserved'), '……父上ですか。', '近親者を低い表面態度で尋ねても「父上について、ですか」と第三者的に言わない');
    assert.ok(!/存じております|存じ上げております/.test(opening), '家中の対象について知っている旨の定型句は挟まない');
    assert.ok(!/あの方|あのお方|あやつ/.test(interview._getFamilyOpinionText(90, 'friendly')), '近親者の人物評価では第三者的な三人称を使わない');
    assert.ok(!/あの方|あのお方|あやつ/.test(interview._getFamilyContactText({ contactScore: 80, compatibilityScore: 90, affinityDiff: 0 }, nobutada, 'friendly')), '近親者の接触説明では第三者的な三人称を使わない');
    assert.strictEqual(interview._applyFamilyReferenceText('あのお方は肝心な胸中をほとんど見せませぬ。', true), '肝心な胸中をほとんど見せませぬ。');
});


test('外交の直接親族呼称は面談と共通化し、敵対中でも血縁呼称を保つ', () => {
    const ctx = createContext();
    loadScript(ctx, 'js/config.js');
    loadScript(ctx, 'js/constants.js');
    loadScript(ctx, 'js/busho_list_sort_rules.js');
    loadScript(ctx, 'js/conversation_standing_rules.js');
    loadScript(ctx, 'js/diplomacy.js');
    vm.runInContext('this.DiplomacyManager = DiplomacyManager;', ctx);

    const clans = [
        { id: 1, name: '甲家', leaderId: 101, daimyoPrestige: 5000, diplomacyValue: { 2: { status: '敵対', sentiment: 10 } } },
        { id: 2, name: '乙家', leaderId: 201, daimyoPrestige: 5000, diplomacyValue: { 1: { status: '敵対', sentiment: 10 } } }
    ];
    const senderDaimyo = { id: 101, clan: 1, isDaimyo: true, fullName: '甲景', familyNameStr: '甲', givenName: '景', courtRankIds: [], achievementTotal: 0 };
    const father = { id: 201, clan: 2, isDaimyo: true, fullName: '織田信長', familyNameStr: '織田', givenName: '信長', courtRankIds: [], achievementTotal: 0 };
    const sonEnvoy = { id: 102, clan: 1, isDaimyo: false, fullName: '織田信忠', familyNameStr: '織田', givenName: '信忠', realFatherId: 201, courtRankIds: [], achievementTotal: 0 };
    const adoptiveFather = { id: 202, clan: 2, isDaimyo: false, fullName: '細川幽斎', familyNameStr: '細川', givenName: '幽斎', courtRankIds: [], achievementTotal: 0, female: false };
    const adoptedChild = { id: 103, clan: 1, isDaimyo: false, fullName: '細川忠興', familyNameStr: '細川', givenName: '忠興', adoptiveFatherId: 202, courtRankIds: [], achievementTotal: 0 };
    const bushos = [senderDaimyo, father, sonEnvoy, adoptiveFather, adoptedChild];
    const game = {
        clans, bushos, legions: [],
        getClan: id => clans.find(c => Number(c.id) === Number(id)),
        getBusho: id => bushos.find(b => Number(b.id) === Number(id)) || null,
        getClanDaimyo: id => bushos.find(x => Number(x.clan) === Number(id) && x.isDaimyo) || null,
        courtRankSystem: { RANK_ID_SHOGUN: 1, RANK_IDS_CANDIDATE: [], getRankData: () => null, getHighestRankData: () => null }
    };
    const dm = new ctx.DiplomacyManager(game);

    assert.strictEqual(dm.getCallName(father, sonEnvoy), '父上', '子が外交相手の実父を呼ぶ時は父上');
    assert.strictEqual(dm.getCallName(sonEnvoy, father), '信忠', '父が子を呼ぶ時は殿を付けず諱');
    const greeting = dm.buildDiplomacyGreeting(sonEnvoy, father);
    assert.ok(greeting.greetMsg1.includes('父上。'), '使者側の導入でも親族呼称を実際に使う');
    assert.ok(!greeting.greetMsg1.includes('お目通りを賜り'), '親族相手に他人行儀な「お目通りを賜り」を重ねない');
    assert.ok(greeting.greetMsg2.includes('信忠か'), '受け手側も年少親族を諱で呼ぶ');
    assert.ok(greeting.greetMsg2.includes('……'), '敵対中でも血縁呼称は残しつつ口調だけ硬くする');

    assert.strictEqual(dm.getCallName(adoptiveFather, adoptedChild), '義父上', '養子が義父を呼ぶ時は義父上');
    assert.strictEqual(dm.getCallName(adoptedChild, adoptiveFather), '忠興', '義父が養子を呼ぶ時は殿を付けない');
});

test('外交の本題も親族・特殊権威の話者距離を最後まで維持する', () => {
    const ctx = createContext();
    loadScript(ctx, 'js/config.js');
    loadScript(ctx, 'js/constants.js');
    loadScript(ctx, 'js/busho_list_sort_rules.js');
    loadScript(ctx, 'js/conversation_standing_rules.js');
    loadScript(ctx, 'js/diplomacy.js');
    vm.runInContext('this.DiplomacyManager = DiplomacyManager;', ctx);

    const ranks = new Map([
        [98, { id: 98, rankNo: 10, rankName2: '左馬頭' }],
        [20, { id: 20, rankNo: 8, rankName2: '参議' }]
    ]);
    const clans = [
        { id: 1, name: '織田家', leaderId: 101, daimyoPrestige: 5000, diplomacyValue: { 2: { status: '敵対', sentiment: 10 } } },
        { id: 2, name: '織田別家', leaderId: 201, daimyoPrestige: 5000, diplomacyValue: { 1: { status: '敵対', sentiment: 10 } } }
    ];
    const father = { id: 101, clan: 1, isDaimyo: true, fullName: '織田信長', familyNameStr: '織田', givenName: '信長', courtRankIds: [], familyIds: [101, 201] };
    const son = { id: 201, clan: 2, isDaimyo: true, fullName: '織田信忠', familyNameStr: '織田', givenName: '信忠', realFatherId: 101, courtRankIds: [], familyIds: [101, 201] };
    const bushos = [father, son];
    const game = {
        clans, bushos, legions: [],
        getClan: id => clans.find(c => Number(c.id) === Number(id)),
        getBusho: id => bushos.find(b => Number(b.id) === Number(id)) || null,
        getClanDaimyo: id => bushos.find(b => Number(b.clan) === Number(id) && b.isDaimyo) || null,
        courtRankSystem: {
            RANK_ID_SHOGUN: 1, RANK_IDS_CANDIDATE: [98],
            getRankData: id => ranks.get(Number(id)) || null,
            getHighestRankData(busho) { return (busho.courtRankIds || []).map(id => this.getRankData(id)).filter(Boolean).sort((a, b) => a.rankNo - b.rankNo)[0] || null; }
        }
    };
    const dm = new ctx.DiplomacyManager(game);
    let greeting = dm.buildDiplomacyGreeting(father, son);
    let msgs = dm.getDiplomacyMessages('alliance', true, '織田家', '織田別家', dm.getCallName(father, son), dm.getCallName(son, father), '姫', '貴家', greeting.context);
    assert.ok(greeting.greetMsg1.includes('信忠。') && greeting.greetMsg1.includes('わし自ら来た'), '父大名から子大名への導入は親子口調');
    assert.ok(msgs.demandMsg.includes('盟約を結んでくれ') && !msgs.demandMsg.includes('くだされ'), '本題でも父が子へ一般外交敬語へ戻らない');
    assert.ok(msgs.replyAcceptMsg.includes('盟友として力を合わせて参ろう') && !msgs.replyAcceptMsg.includes('申し伝えます'), '成立後の返答まで年長親族本人の口調を保つ');

    const samano = { id: 301, clan: 1, isDaimyo: true, fullName: '足利義昭', familyNameStr: '足利', givenName: '義昭', courtRankIds: [98], familyIds: [301] };
    const highReceiver = { id: 302, clan: 2, isDaimyo: true, fullName: '織田信長', familyNameStr: '織田', givenName: '信長', courtRankIds: [20], familyIds: [302] };
    game.bushos = [samano, highReceiver];
    clans[0].leaderId = 301; clans[1].leaderId = 302;
    greeting = dm.buildDiplomacyGreeting(samano, highReceiver);
    assert.strictEqual(greeting.context.senderSpeakerPosture.key, 'higher_court', '左馬頭本人は通常官位ランクにかかわらず上位者寄りの話者姿勢');
    assert.strictEqual(greeting.context.receiverSpeakerPosture.key, 'normal', '左馬頭より通常官位が高くても相手が左馬頭へ上位者口調には反転しない');
    msgs = dm.getDiplomacyMessages('truce', true, '足利家', '織田家', dm.getCallName(samano, highReceiver), dm.getCallName(highReceiver, samano), '姫', '貴家', greeting.context);
    assert.ok(!msgs.demandMsg.includes('存じ') && !msgs.demandMsg.includes('ください'), '左馬頭大名本人も本題では一般大名敬語へ戻らない');
    assert.ok(!msgs.rejectMsg.includes('何をほざくか') && !msgs.rejectMsg.includes('素首'), '特殊権威への拒否は敵対していても格式を失わない');
    assert.ok(/いただ|願いたい|いたしました|ましょう/.test(msgs.acceptMsg + msgs.rejectMsg), '相手側は左馬頭への最低限の敬意を維持する');

    const marriageTarget = { id: 303, clan: 2, isDaimyo: false, fullName: '足利某', familyNameStr: '足利', givenName: '某', courtRankIds: [98], familyIds: [303] };
    const marriage = dm.getDiplomacyMessages('marriage', true, '足利家', '織田家', '左馬頭様', '参議殿', '姫', dm.getCallName(marriageTarget, samano), greeting.context);
    assert.ok(marriage.demandMsg.includes('左馬頭様に') && !marriage.demandMsg.includes('左馬頭様殿'), '縁談対象も独自の殿付けをせず共通呼称を使う');
});


test('和睦交渉は会話内で具体条件を提示し、条件選択を一元化する', () => {
    const src = read('js/diplomacy.js');
    assert.ok(src.includes("{ label: '条件を示させる'"), 'AIからの和睦では事務的な「対価を要求」ではなく条件提示を求める');
    assert.ok(!src.includes("{ label: '対価を要求'"), '旧い対価要求ラベルを残さない');
    assert.ok(src.includes('_buildTruceConditionOptions(requestClanId, targetClanId'), '和睦条件候補は共通窓口で生成する');
    assert.ok(src.includes('_selectTruceConditionOption(options, requestClanId, targetClanId'), '和睦条件の重さは共通選択ロジックを通す');
    assert.ok(src.includes('和睦の証として'), '条件付き和睦は具体的な条件を会話として提示する');
    assert.ok(src.includes("{ label: '条件を受ける'"), 'プレイヤー発の条件付き和睦も会話の中で受諾可否を選ぶ');
    assert.ok(!src.includes('そのような法外な条件、到底飲めませぬ'), '具体条件を示していないのに法外と怒る旧会話を残さない');
});

test('和睦条件は戦況に応じて城・人質・縁組の重さを選ぶ', () => {
    const ctx = createContext();
    loadScript(ctx, 'js/diplomacy.js');
    vm.runInContext('this.DiplomacyManager = DiplomacyManager;', ctx);
    const powers = { 1: 3000, 2: 10000 };
    const dm = new ctx.DiplomacyManager({ getClanTotalSoldiers: id => powers[id] || 1 });
    const options = [
        { type: 'marriage' },
        { type: 'hostage' },
        { type: 'castle' }
    ];
    assert.strictEqual(dm._selectTruceConditionOption(options, 1, 2).type, 'castle', '大きく劣勢なら城割譲を優先する');
    powers[1] = 8000;
    assert.strictEqual(dm._selectTruceConditionOption(options, 1, 2).type, 'hostage', 'やや劣勢なら人質を優先する');
    powers[1] = 10000;
    assert.strictEqual(dm._selectTruceConditionOption(options, 1, 2).type, 'marriage', '拮抗時は縁組を優先する');
});

test('和睦条件の姫はAI同士で架空姫だけ、プレイヤーへの要求では架空姫を優先する', () => {
    const ctx = createContext({ BushoStatusRules: { isActive: () => true } });
    loadScript(ctx, 'js/diplomacy.js');
    vm.runInContext('this.DiplomacyManager = DiplomacyManager;', ctx);

    const historical = { id: 101, name: '史実姫', status: 'unmarried', birthYear: 1545 };
    const generated = { id: 90001, name: '架空姫', status: 'unmarried', birthYear: 1545 };
    const targetBusho = { id: 201, clan: 2, name: '相手一門', birthYear: 1540, female: false, wifeIds: [], familyIds: [] };
    const clans = [
        { id: 1, leaderId: 0, princessIds: [historical.id, generated.id] },
        { id: 2, leaderId: 0, princessIds: [] }
    ];
    const game = {
        playerClanId: 1, clans, princesses: [historical, generated], bushos: [targetBusho], castles: [],
        getClan: id => clans.find(c => Number(c.id) === Number(id)) || null,
        getClanDaimyo: () => null,
        getBusho: id => Number(id) === targetBusho.id ? targetBusho : null,
        getPrincess: id => [historical, generated].find(p => Number(p.id) === Number(id)) || null,
        getClanCastles: id => game.castles.filter(c => Number(c.ownerClan) === Number(id)),
        getClanBushos: id => game.bushos.filter(b => Number(b.clan) === Number(id))
    };
    const dm = new ctx.DiplomacyManager(game);

    let marriage = dm._buildTruceConditionOptions(1, 2, { aiVsAi: false }).find(o => o.type === 'marriage');
    assert.strictEqual(marriage.princess.id, generated.id, 'プレイヤーが和睦条件として姫を求められる時は架空姫を先に選ぶ');

    clans[0].princessIds = [historical.id];
    marriage = dm._buildTruceConditionOptions(1, 2, { aiVsAi: false }).find(o => o.type === 'marriage');
    assert.strictEqual(marriage.princess.id, historical.id, '架空姫がいなければプレイヤーの史実姫も候補にできる');

    game.playerClanId = 99;
    clans[0].princessIds = [historical.id, generated.id];
    marriage = dm._buildTruceConditionOptions(1, 2, { aiVsAi: true }).find(o => o.type === 'marriage');
    assert.strictEqual(marriage.princess.id, generated.id, 'AI同士は史実姫を避けて架空姫だけを使う');

    clans[0].princessIds = [historical.id];
    marriage = dm._buildTruceConditionOptions(1, 2, { aiVsAi: true }).find(o => o.type === 'marriage');
    assert.strictEqual(marriage, undefined, 'AI同士で架空姫がいなければ史実姫を自動消費しない');
});

test('架空姫は共通BINの汎用姫名と読みを保持して姫情報画面へ渡す', () => {
    const ctx = createContext({
        FamilyLinker: { rebuildAllFamilyIds() {} },
        Princess: class { constructor(data) { Object.assign(this, data); } }
    });
    loadScript(ctx, 'js/data_manager.js');
    vm.runInContext('this.DataManager = DataManager;', ctx);
    const profiles = getRuntimeData().common.genericPrincessProfiles;
    assert.ok(profiles.length > 0 && profiles.every(p => p.name && p.yomi), 'common.binは汎用姫の名前と読みを対で保持する');
    ctx.DataManager.genericPrincessProfiles = [{ name: '愛', yomi: 'あい' }, { name: '菊', yomi: 'きく' }];

    // 生成処理がプロフィールの読みを Princess データへ渡すことを実動作で確認する。
    const fixedMath = Object.create(Math);
    fixedMath.random = () => 0;
    ctx.Math = fixedMath;
    loadScript(ctx, 'js/life_system.js');
    vm.runInContext('this.LifeSystem = LifeSystem;', ctx);
    const father = { id: 10, birthYear: 1520, wifeIds: [] };
    const clan = { id: 1, leaderId: father.id, princessIds: [] };
    const game = {
        princesses: [],
        getClan: id => Number(id) === 1 ? clan : null,
        getBusho: id => Number(id) === father.id ? father : null
    };
    const princess = new ctx.LifeSystem(game).createRandomPrincess(1, 1560, true, father.id);
    assert.strictEqual(princess.name, '愛');
    assert.strictEqual(princess.yomi, 'あい', '生成された架空姫へ読みを設定する');

    const uiSrc = read('js/ui_info.js');
    assert.ok(uiSrc.includes('const displayYomi = princess.yomi || "";'), '姫情報画面はPrincess.yomiをPC/スマホ表示へ使用する');
});


test('AI和睦は現在直接隣接している敵対勢力だけを対象にする', () => {
    const ctx = createContext();
    loadScript(ctx, 'js/constants.js');
    loadScript(ctx, 'js/diplomacy.js');
    vm.runInContext('this.DiplomacyManager = DiplomacyManager;', ctx);
    const clans = [
        { id: 1, diplomacyValue: { 2: { status: '敵対', sentiment: 20 }, 3: { status: '敵対', sentiment: 20 } } },
        { id: 2, diplomacyValue: { 1: { status: '敵対', sentiment: 20 } } },
        { id: 3, diplomacyValue: { 1: { status: '敵対', sentiment: 20 } } }
    ];
    const castles = [
        { id: 10, ownerClan: 1, adjacentCastleIds: [20] },
        { id: 20, ownerClan: 2, adjacentCastleIds: [10, 30] },
        { id: 30, ownerClan: 3, adjacentCastleIds: [20] }
    ];
    const game = {
        clans, castles,
        getClan: id => clans.find(c => Number(c.id) === Number(id)) || null,
        getClanCastles: id => castles.filter(c => Number(c.ownerClan) === Number(id)),
        getCastle: id => castles.find(c => Number(c.id) === Number(id)) || null
    };
    const dm = new ctx.DiplomacyManager(game);
    assert.strictEqual(dm.canAttemptAITruce(1, 2), true, '直接国境を接する敵とは和睦候補にできる');
    assert.strictEqual(dm.canAttemptAITruce(1, 3), false, '二段先で敵対していても現在隣接していなければAI和睦候補にしない');
});

test('AI和睦は計画時と実行直前の両方で直接隣接を再確認する', () => {
    const diplomacy = read('js/diplomacy.js');
    const ai = read('js/ai.js');
    assert.ok(diplomacy.includes('if (canAttemptTruce && enemyCount >= 2)'), '月次外交計画で非隣接相手を和睦対象にしない');
    assert.ok(ai.includes("targetData.action === 'truce' || targetData.action === 'court_truce'"), '実行対象として通常和睦・朝廷和睦を再確認する');
    assert.ok(ai.includes('!this.game.diplomacyManager.canAttemptAITruce(castle.ownerClan, targetClanId)'), '落城などで前線が離れた場合は実行直前に中止する');
});

test('AI同士の条件付き和睦は提示条件を申し込んだ側が再判定する', () => {
    const ctx = createContext();
    loadScript(ctx, 'js/diplomacy.js');
    vm.runInContext('this.DiplomacyManager = DiplomacyManager;', ctx);
    const game = {
        clans: [{ id: 1 }, { id: 2 }],
        playerClanId: 99,
        getClan(id) { return this.clans.find(c => Number(c.id) === Number(id)) || null; }
    };
    const dm = new ctx.DiplomacyManager(game);
    dm._buildTruceConditionOptions = () => [{ type: 'castle', castle: { id: 10 } }];
    dm._selectTruceConditionOption = options => options[0];
    dm._getAITrucePressureScore = () => 100;

    let success = 0;
    let failure = 0;
    dm._checkAITruceConditionAcceptance = () => false;
    dm.negotiateTruceConditions(1, 2, () => { success++; }, () => { failure++; });
    assert.strictEqual(success, 0, '条件が作れただけでは自動成立しない');
    assert.strictEqual(failure, 1, '申し込んだ側が条件を拒否すれば和睦は決裂する');

    dm._checkAITruceConditionAcceptance = () => true;
    dm.negotiateTruceConditions(1, 2, () => { success++; }, () => { failure++; });
    assert.strictEqual(success, 1, '申し込んだ側が条件を受諾した時だけ成立する');
});

test('AI和睦の条件受諾率は条件の重さと戦況を反映する', () => {
    const ctx = createContext();
    loadScript(ctx, 'js/constants.js');
    loadScript(ctx, 'js/diplomacy.js');
    vm.runInContext('this.DiplomacyManager = DiplomacyManager;', ctx);
    const clans = [
        { id: 1, diplomacyValue: { 2: { status: '敵対', sentiment: 20 }, 3: { status: '敵対', sentiment: 20 } } },
        { id: 2, diplomacyValue: { 1: { status: '敵対', sentiment: 20 } } },
        { id: 3, diplomacyValue: { 1: { status: '敵対', sentiment: 20 } } }
    ];
    const castles = [
        { id: 10, ownerClan: 1, adjacentCastleIds: [20, 30] },
        { id: 11, ownerClan: 1, adjacentCastleIds: [] },
        { id: 12, ownerClan: 1, adjacentCastleIds: [] },
        { id: 13, ownerClan: 1, adjacentCastleIds: [] },
        { id: 20, ownerClan: 2, adjacentCastleIds: [10] },
        { id: 30, ownerClan: 3, adjacentCastleIds: [10] }
    ];
    const powers = { 1: 5000, 2: 10000, 3: 6000 };
    const game = {
        clans, castles,
        getClan: id => clans.find(c => Number(c.id) === Number(id)) || null,
        getClanCastles: id => castles.filter(c => Number(c.ownerClan) === Number(id)),
        getCastle: id => castles.find(c => Number(c.id) === Number(id)) || null,
        getClanTotalSoldiers: id => powers[id] || 1
    };
    const dm = new ctx.DiplomacyManager(game);
    const marriage = dm._getAITruceConditionAcceptanceProb(1, 2, { type: 'marriage' });
    const hostage = dm._getAITruceConditionAcceptanceProb(1, 2, { type: 'hostage' });
    const castle = dm._getAITruceConditionAcceptanceProb(1, 2, { type: 'castle' });
    assert.ok(marriage > hostage && hostage > castle, '軽い条件ほど受諾しやすく城割譲は最も重く扱う');
    assert.ok(castle > 5 && castle < 90, '重い条件でも戦況に応じて成否判定が発生し自動成立・自動拒否に固定しない');
});


test('通常和睦の受諾率は受ける側の敵対数で変わり、申し込む側だけの敵対増加では変わらない', () => {
    const ctx = createContext();
    loadScript(ctx, 'js/config.js');
    loadScript(ctx, 'js/constants.js');
    loadScript(ctx, 'js/diplomacy.js');
    vm.runInContext('this.DiplomacyManager = DiplomacyManager;', ctx);

    const makeData = (status = '普通', sentiment = 50) => ({ status, sentiment, trucePeriod: 0, isMarriage: false, isEvent: false, hostageIds: [], subordinateMonths: 0 });
    const clans = [1, 2, 3, 4].map(id => ({ id, diplomacyValue: {} }));
    const setPair = (a, b, status, sentiment = 50) => {
        clans[a - 1].diplomacyValue[b] = makeData(status, sentiment);
        clans[b - 1].diplomacyValue[a] = makeData(status, sentiment);
    };
    setPair(1, 2, '敵対', 40);
    setPair(1, 3, '普通', 50);
    setPair(1, 4, '普通', 50);
    setPair(2, 3, '普通', 50);
    setPair(2, 4, '普通', 50);
    setPair(3, 4, '普通', 50);

    const doer = { id: 101, clan: 1, diplomacy: 70 };
    const targetCastle = { id: 20, ownerClan: 2 };
    const game = {
        clans,
        bushos: [doer],
        castles: [targetCastle],
        getClan: id => clans.find(c => Number(c.id) === Number(id)) || null,
        getBusho: id => Number(id) === 101 ? doer : null,
        getCastle: id => Number(id) === 20 ? targetCastle : null,
        getClanTotalSoldiers: () => 10000,
        getClanDaimyo: () => null
    };
    const dm = new ctx.DiplomacyManager(game);
    const base = dm.getDiplomacyProb(101, 20, 'truce');

    setPair(1, 3, '敵対', 40); // 申込側だけ敵が増える。受諾側2とは共通敵にしない。
    const requesterMoreEnemies = dm.getDiplomacyProb(101, 20, 'truce');
    assert.strictEqual(requesterMoreEnemies, base, '申込側だけの敵対数は相手AIの受諾確率へ混ぜない');

    setPair(2, 4, '敵対', 40); // 受諾側に別の敵が増える。
    const receiverMoreEnemies = dm.getDiplomacyProb(101, 20, 'truce');
    assert.ok(receiverMoreEnemies > requesterMoreEnemies, '受諾側が多正面を抱えるほど和睦を受けやすくする');
});

test('通常和睦の受諾率は他の敵との和睦で共通敵が消えても変動しない', () => {
    const ctx = createContext();
    loadScript(ctx, 'js/config.js');
    loadScript(ctx, 'js/constants.js');
    loadScript(ctx, 'js/diplomacy.js');
    vm.runInContext('this.DiplomacyManager = DiplomacyManager;', ctx);

    const makeData = (status = '普通', sentiment = 50) => ({ status, sentiment, trucePeriod: 0, isMarriage: false, isEvent: false, hostageIds: [], subordinateMonths: 0 });
    const clans = [1, 2, 3].map(id => ({ id, diplomacyValue: {} }));
    const setPair = (a, b, status, sentiment = 50) => {
        clans[a - 1].diplomacyValue[b] = makeData(status, sentiment);
        clans[b - 1].diplomacyValue[a] = makeData(status, sentiment);
    };
    // 1がA(2)・B(3)双方と敵対し、AとBも敵対中。
    // この状態だと1と2は3を、1と3は2を共通敵として持つ。
    setPair(1, 2, '敵対', 35);
    setPair(1, 3, '敵対', 35);
    setPair(2, 3, '敵対', 35);

    const doer = { id: 101, clan: 1, diplomacy: 60 };
    const castleA = { id: 20, ownerClan: 2 };
    const castleB = { id: 30, ownerClan: 3 };
    const game = {
        clans,
        bushos: [doer],
        castles: [castleA, castleB],
        getClan: id => clans.find(c => Number(c.id) === Number(id)) || null,
        getBusho: id => Number(id) === 101 ? doer : null,
        getCastle: id => [castleA, castleB].find(c => Number(c.id) === Number(id)) || null,
        getClanTotalSoldiers: () => 10000,
        getClanDaimyo: () => null
    };
    const dm = new ctx.DiplomacyManager(game);

    const beforeB = dm.getDiplomacyProb(101, 30, 'truce');
    dm.changeStatus(1, 2, '和睦', 6);
    const afterAWithB = dm.getDiplomacyProb(101, 30, 'truce');
    assert.strictEqual(afterAWithB, beforeB, 'Aとの和睦で共通敵が消えてもBの受諾率は変えない');

    dm.changeStatus(1, 2, '敵対');
    const beforeA = dm.getDiplomacyProb(101, 20, 'truce');
    dm.changeStatus(1, 3, '和睦', 6);
    const afterBWithA = dm.getDiplomacyProb(101, 20, 'truce');
    assert.strictEqual(afterBWithA, beforeA, 'Bとの和睦で共通敵が消えてもAの受諾率は変えない');
});

test('婚姻は基本外交statusを上書きせず友好度と外交補正だけを重ねる', () => {
    const ctx = createContext({
        FamilyLinker: { rebuildAllFamilyIds() {} },
        LifeStatusRules: { isUnavailable: () => false }
    });
    loadScript(ctx, 'js/config.js');
    loadScript(ctx, 'js/constants.js');
    loadScript(ctx, 'js/diplomacy.js');
    vm.runInContext('this.DiplomacyManager = DiplomacyManager;', ctx);

    const rel12 = { status: '従属', sentiment: 45, trucePeriod: 0, isMarriage: false, isEvent: false, hostageIds: [99], subordinateMonths: 18 };
    const rel21 = { status: '支配', sentiment: 45, trucePeriod: 0, isMarriage: false, isEvent: false, hostageIds: [99], subordinateMonths: 18 };
    const clans = [
        { id: 1, princessIds: [1], diplomacyValue: { 2: rel12 } },
        { id: 2, princessIds: [], diplomacyValue: { 1: rel21 } }
    ];
    const princess = { id: 1, name: '姫', status: 'unmarried', currentClanId: 1, originalClanId: 1, husbandId: 0 };
    const husband = { id: 20, clan: 2, wifeIds: [] };
    const game = {
        playerClanId: 1,
        clans,
        princesses: [princess],
        bushos: [husband],
        getClan: id => clans.find(c => Number(c.id) === Number(id)) || null,
        getBusho: id => Number(id) === 20 ? husband : null,
        getPrincess: id => Number(id) === 1 ? princess : null
    };
    const dm = new ctx.DiplomacyManager(game);
    assert.strictEqual(dm.applyMarriageData(1, 20, 2, false), true);
    assert.strictEqual(rel12.status, '従属', '婚姻成立だけで従属から同盟へ上書きしない');
    assert.strictEqual(rel21.status, '支配', '相手側の支配statusも維持する');
    assert.strictEqual(rel12.isMarriage, true);
    assert.strictEqual(rel21.isMarriage, true);
    assert.ok(rel12.sentiment >= ctx.MainParams.Diplomacy.Marriage.SentimentFloor, '婚姻時は友好度を大きく引き上げる');
    assert.ok(dm.getMarriageDiplomacyBonus('alliance', rel12) > 0);
    assert.ok(dm.getMarriageDiplomacyBonus('dominate', rel12) > 0);
    assert.ok(dm.getMarriageDiplomacyBonus('subordinate', rel12) > 0);

    dm.changeStatus(1, 2, '同盟');
    assert.strictEqual(rel12.status, '同盟', '支配・従属から同盟への上書きは従来どおり可能');
    assert.strictEqual(rel12.isMarriage, true, 'status上書きでも婚姻フラグを維持する');
    assert.deepStrictEqual(Array.from(rel12.hostageIds), [99], 'status上書きだけでは人質関係を消さない');
});

test('和睦条件の婚姻は婚姻関係だけ成立させ、通常婚姻の友好度大幅上昇を適用しない', () => {
    const ctx = createContext({
        FamilyLinker: { rebuildAllFamilyIds() {} },
        LifeStatusRules: { isUnavailable: () => false }
    });
    loadScript(ctx, 'js/config.js');
    loadScript(ctx, 'js/constants.js');
    loadScript(ctx, 'js/diplomacy.js');
    vm.runInContext('this.DiplomacyManager = DiplomacyManager;', ctx);

    const rel12 = { status: '和睦', sentiment: 50, trucePeriod: 6, isMarriage: false, isEvent: false, hostageIds: [] };
    const rel21 = { status: '和睦', sentiment: 50, trucePeriod: 6, isMarriage: false, isEvent: false, hostageIds: [] };
    const clans = [
        { id: 1, princessIds: [1], diplomacyValue: { 2: rel12 } },
        { id: 2, princessIds: [], diplomacyValue: { 1: rel21 } }
    ];
    const princess = { id: 1, name: '姫', status: 'unmarried', currentClanId: 1, originalClanId: 1, husbandId: 0 };
    const husband = { id: 20, clan: 2, wifeIds: [] };
    const game = {
        playerClanId: 1,
        clans,
        princesses: [princess],
        bushos: [husband],
        getClan: id => clans.find(c => Number(c.id) === Number(id)) || null,
        getBusho: id => Number(id) === 20 ? husband : null,
        getPrincess: id => Number(id) === 1 ? princess : null
    };
    const dm = new ctx.DiplomacyManager(game);
    dm._applyTruceConditionData('marriage', { princess, busho: husband }, 1, 2);

    assert.strictEqual(rel12.isMarriage, true, '和睦条件でも婚姻関係自体は成立する');
    assert.strictEqual(rel21.isMarriage, true, '相手側にも婚姻関係を同期する');
    assert.strictEqual(rel12.sentiment, 50, '和睦条件の婚姻では和睦成立時の友好度50から上乗せしない');
    assert.strictEqual(rel21.sentiment, 50, '相手側も通常婚姻の大幅な友好度上昇を受けない');
    assert.strictEqual(rel12.status, '和睦', '婚姻条件で和睦statusを上書きしない');
});

test('AI従属家の独立意欲は野望で上がり、義理が高いほど平和的な同盟格上げを優先する', () => {
    const ctx = createContext();
    loadScript(ctx, 'js/config.js');
    loadScript(ctx, 'js/constants.js');
    loadScript(ctx, 'js/diplomacy.js');
    vm.runInContext('this.DiplomacyManager = DiplomacyManager;', ctx);

    const rel12 = { status: '従属', sentiment: 70, trucePeriod: 0, isMarriage: false, isEvent: false, hostageIds: [], subordinateMonths: 24 };
    const rel21 = { status: '支配', sentiment: 70, trucePeriod: 0, isMarriage: false, isEvent: false, hostageIds: [], subordinateMonths: 24 };
    const clans = [
        { id: 1, diplomacyValue: { 2: rel12 }, currentDiplomacyTarget: null },
        { id: 2, diplomacyValue: { 1: rel21 }, currentDiplomacyTarget: null }
    ];
    const daimyo = { id: 11, clan: 1, ambition: 20, duty: 50 };
    const targetDaimyo = { id: 21, clan: 2, ambition: 50, duty: 50, nemesisIds: [] };
    const game = {
        clans,
        bushos: [daimyo, targetDaimyo],
        getClan: id => clans.find(c => Number(c.id) === Number(id)) || null,
        getClanDaimyo: id => Number(id) === 1 ? daimyo : targetDaimyo,
        getClanTotalSoldiers: () => 10000
    };
    const dm = new ctx.DiplomacyManager(game);

    const lowAmbition = dm.getVassalIndependenceDisposition(1, 2, 10000, 10000);
    daimyo.ambition = 90;
    const highAmbition = dm.getVassalIndependenceDisposition(1, 2, 10000, 10000);
    assert.ok(highAmbition.desire > lowAmbition.desire, '野望が高いほど独立意欲が連続的に上がる');

    daimyo.duty = 10;
    const lowDuty = dm.getVassalIndependenceDisposition(1, 2, 10000, 10000);
    const lowDutyBreak = dm.calcBreakAllianceScore(1, 2, 10000, 10000, 10, []);
    daimyo.duty = 90;
    const highDuty = dm.getVassalIndependenceDisposition(1, 2, 10000, 10000);
    const highDutyBreak = dm.calcBreakAllianceScore(1, 2, 10000, 10000, 90, []);
    assert.ok(highDuty.peacefulPreference > lowDuty.peacefulPreference, '義理が高いほど関係改善・同盟格上げを選びやすい');
    assert.ok(highDutyBreak < lowDutyBreak, '義理が高いほど主家への直接攻撃を抑える');
});

test('高義理のAI従属家は独立時にまず親善または同盟格上げを計画できる', () => {
    const customMath = Object.create(Math);
    customMath.random = () => 0;
    const ctx = createContext({ Math: customMath });
    loadScript(ctx, 'js/config.js');
    loadScript(ctx, 'js/constants.js');
    loadScript(ctx, 'js/diplomacy.js');
    vm.runInContext('this.DiplomacyManager = DiplomacyManager;', ctx);

    const rel12 = { status: '従属', sentiment: 75, trucePeriod: 0, isMarriage: false, isEvent: false, hostageIds: [], subordinateMonths: 24 };
    const rel21 = { status: '支配', sentiment: 75, trucePeriod: 0, isMarriage: false, isEvent: false, hostageIds: [], subordinateMonths: 24 };
    const clans = [
        { id: 1, courtTrust: 0, diplomacyValue: { 2: rel12 } },
        { id: 2, courtTrust: 0, diplomacyValue: { 1: rel21 } }
    ];
    const daimyo = { id: 11, clan: 1, ambition: 90, duty: 90, nemesisIds: [] };
    const targetDaimyo = { id: 21, clan: 2, ambition: 50, duty: 50, nemesisIds: [] };
    const game = {
        clans,
        bushos: [daimyo, targetDaimyo],
        getClan: id => clans.find(c => Number(c.id) === Number(id)) || null,
        getClanDaimyo: id => Number(id) === 1 ? daimyo : targetDaimyo,
        getClanTotalSoldiers: () => 10000
    };
    const dm = new ctx.DiplomacyManager(game);
    const action = dm.determineAIDiplomacyAction(1, 2, 10000, 10000, 10000, 90, 1, false, 0);
    assert.strictEqual(action.action, 'alliance');
    assert.strictEqual(action.reason, 'vassal_peaceful_upgrade');
});

test('従属家から同盟への移行はプレイヤー発・AI発で同じ穏当な専用会話を使う', () => {
    const src = read('js/diplomacy.js');
    assert.ok(src.includes('_getVassalAllianceUpgradeMessages(conversationContext = null)'), '主従解消・同盟移行の文面を共通化する');
    assert.ok(src.includes('当家が家を保てたこと、深く感謝しております'), '主家への謝意を明示して独立要求だけが前面に出ない');
    assert.ok(src.includes('主従の約を解き、これよりは盟友として力を合わせる'), 'ぼかしすぎず主従解消と同盟移行を明示する');
    assert.ok(src.includes('demandMsg2: this._styleDiplomacyTextForSpeaker('), '従属家の対等化要求はメッセージ枠を圧迫しないよう二段階会話に分ける');
    assert.ok(src.includes('if (msgs.demandMsg2) {\n            await this.game.ui.showDialogAsync(msgs.demandMsg2'), 'プレイヤー発の対等化要求も二つ目の台詞を順番に表示する');
    assert.ok(src.includes('const showRemainingDemand = () => {'), 'AI発の対等化要求も二つ目の台詞を決断画面の前に表示する');
    assert.ok(src.includes('Object.assign(msgs, this._getVassalAllianceUpgradeMessages(conversationContext))'), 'AI発も共通専用会話へ通す');
    assert.ok(src.includes("currentRelation.status === window.GameConstants.DiplomacyStatus.SUBORDINATE"), 'プレイヤー発の従属→同盟でも専用会話を判定する');
    assert.ok(src.includes('主従の約を解き、同盟へ改めたいとの申し出です'), 'プレイヤー側の決断画面でも申し出の意味を明確にする');
    assert.ok(src.includes("okText = '盟友として認める'"));
    assert.ok(src.includes("cancelText = '今は認めない'"));
});

test('外交結果は即時拒否と条件交渉の決裂を混同しない', () => {
    const src = read('js/diplomacy.js');
    assert.ok(src.includes('const handleFailure = (wasNegotiation = false) =>'), '従属・和睦の結果文が交渉段階を受け取る');
    assert.ok(src.includes('に従属の願いを受け入れてもらえませんでした'), '従属願の即時拒否を条件決裂とは表示しない');
    assert.ok(src.includes('に和睦を拒まれました'), '和睦の即時拒否を条件決裂とは表示しない');
    assert.ok(src.includes('() => handleFailure(true), subordinationConversation'), '従属の条件交渉だけ条件決裂扱いへ渡す');
    assert.ok(src.includes('() => handleFailure(true), truceConversation'), '和睦の条件交渉だけ条件決裂扱いへ渡す');
});

test('従属願の条件提示は事務確認へ切らず外交会話のまま続ける', () => {
    const src = read('js/diplomacy.js');
    assert.ok(src.includes('negotiateSubordinationConditions(subordinateClanId, dominantClanId, onSuccess, onFailure, conversation = null)'), '従属条件交渉にも会話contextを渡す');
    assert.ok(src.includes('従属の証として'), '従属条件を相手当主の具体的な台詞として示す');
    assert.ok(src.includes("{ label: '条件を受ける', className: 'btn-primary', onClick: acceptCondition }"), '条件提示の直後に会話内で判断する');
    assert.ok(!src.includes('従属の条件として${selectedOption.busho.name}を人質として差し出すことを要求してきました'), '旧い事務的な条件確認文を残さない');
});


test('外交条件の人物呼称は共通規則を使い当主本人を自己敬称しない', () => {
    const ctx = createContext();
    loadScript(ctx, 'js/config.js');
    loadScript(ctx, 'js/constants.js');
    loadScript(ctx, 'js/busho_list_sort_rules.js');
    loadScript(ctx, 'js/conversation_standing_rules.js');
    loadScript(ctx, 'js/diplomacy.js');
    vm.runInContext('this.DiplomacyManager = DiplomacyManager;', ctx);

    const ranks = new Map([[20, { id: 20, rankNo: 8, rankName2: '参議' }]]);
    const speaker = { id: 201, clan: 2, isDaimyo: true, fullName: '織田信長', familyNameStr: '織田', givenName: '信長', courtRankIds: [] };
    const ranked = { id: 202, clan: 2, isDaimyo: false, fullName: '細川藤孝', familyNameStr: '細川', givenName: '藤孝', courtRankIds: [20] };
    const envoy = { id: 101, clan: 1, isDaimyo: false, fullName: '明智光秀', familyNameStr: '明智', givenName: '光秀', courtRankIds: [] };
    const game = {
        clans: [{ id: 1, leaderId: 0 }, { id: 2, leaderId: 201 }],
        bushos: [speaker, ranked, envoy], legions: [],
        getClan: id => ({ id: Number(id), daimyoPrestige: 1000, diplomacyValue: {} }),
        getBusho: id => [speaker, ranked, envoy].find(b => Number(b.id) === Number(id)) || null,
        getClanDaimyo: id => Number(id) === 2 ? speaker : null,
        courtRankSystem: {
            RANK_ID_SHOGUN: 1, RANK_IDS_CANDIDATE: [],
            getRankData: id => ranks.get(Number(id)) || null,
            getHighestRankData(busho) { return (busho.courtRankIds || []).map(id => this.getRankData(id)).filter(Boolean).sort((a, b) => a.rankNo - b.rankNo)[0] || null; }
        }
    };
    const dm = new ctx.DiplomacyManager(game);
    const selfMarriage = { type: 'marriage', princess: { name: '市' }, busho: speaker };
    const selfText = dm._getTruceConditionDemandText(selfMarriage, null, speaker);
    assert.ok(selfText.includes('市姫を我がもとへ迎えたい'), '当主本人が婚姻相手なら一人称で示す');
    assert.ok(!selfText.includes('織田信長殿') && !selfText.includes('織田殿'), '本人が自分へ殿を付けない');

    const rankedMarriage = { type: 'marriage', princess: { name: '市' }, busho: ranked };
    const rankedDemand = dm._getTruceConditionDemandText(rankedMarriage, null, speaker);
    assert.ok(rankedDemand.includes('参議殿との縁組'), '第三者の婚姻相手は共通官位呼称へ通す');
    const rankedOffer = dm._getTruceConditionOfferText(rankedMarriage, null, envoy);
    assert.ok(rankedOffer.includes('参議殿へ嫁がせ'), '条件を差し出す側も第三者呼称を共通化する');

    const src = read('js/diplomacy.js');
    assert.ok(!src.includes('${selectedOption.busho.name}殿'), '従属条件にも氏名+殿の直書きを残さない');
    assert.ok(!src.includes('${option.busho.name}殿'), '和睦条件にも氏名+殿の直書きを残さない');
});

test('外交の取り次ぎは他家当主を特殊権威・官位・近親の順で自然に呼ぶ', () => {
    const ctx = createContext();
    loadScript(ctx, 'js/config.js');
    loadScript(ctx, 'js/constants.js');
    loadScript(ctx, 'js/busho_list_sort_rules.js');
    loadScript(ctx, 'js/conversation_standing_rules.js');
    loadScript(ctx, 'js/diplomacy.js');
    vm.runInContext('this.DiplomacyManager = DiplomacyManager;', ctx);

    const ranks = new Map([
        [1, { id: 1, rankNo: 1, rankName2: '征夷大将軍' }],
        [20, { id: 20, rankNo: 8, rankName2: '参議' }]
    ]);
    const father = { id: 201, clan: 2, isDaimyo: true, fullName: '織田信秀', familyNameStr: '織田', givenName: '信秀', courtRankIds: [] };
    const questioner = { id: 301, clan: 1, isDaimyo: true, fullName: '織田信長', familyNameStr: '織田', givenName: '信長', realFatherId: 201, courtRankIds: [] };
    const ranked = { id: 202, clan: 3, isDaimyo: true, fullName: '近衛前久', familyNameStr: '近衛', givenName: '前久', courtRankIds: [20] };
    const shogun = { id: 203, clan: 4, isDaimyo: true, fullName: '足利義昭', familyNameStr: '足利', givenName: '義昭', courtRankIds: [1] };
    const normal = { id: 204, clan: 5, isDaimyo: true, fullName: '毛利元就', familyNameStr: '毛利', givenName: '元就', courtRankIds: [] };
    const bushos = [father, questioner, ranked, shogun, normal];
    const game = {
        bushos, clans: [], legions: [],
        getBusho: id => bushos.find(b => Number(b.id) === Number(id)) || null,
        getClanDaimyo: id => bushos.find(b => Number(b.clan) === Number(id) && b.isDaimyo) || null,
        courtRankSystem: {
            RANK_ID_SHOGUN: 1, RANK_IDS_CANDIDATE: [],
            getRankData: id => ranks.get(Number(id)) || null,
            getHighestRankData(busho) { return (busho.courtRankIds || []).map(id => this.getRankData(id)).filter(Boolean).sort((a, b) => a.rankNo - b.rankNo)[0] || null; }
        }
    };
    const dm = new ctx.DiplomacyManager(game);
    assert.strictEqual(dm._getThirdPartyDaimyoReference(father, '織田家', questioner, { hostile: true }), '御父君', '無官の近親当主は御父君等で取り次ぐ');
    assert.strictEqual(dm._getThirdPartyDaimyoReference(ranked, '近衛家', questioner, { hostile: true }), '参議殿', '高官当主は氏名でなく官位名で取り次ぐ');
    assert.strictEqual(dm._getThirdPartyDaimyoReference(shogun, '足利家', questioner, { hostile: true }), '公方様', '敵対中でも将軍を通常の氏名+殿へ落とさない');
    assert.strictEqual(dm._getThirdPartyDaimyoReference(normal, '毛利家', questioner), '毛利家当主・毛利元就様', '通常の他家当主は家名と氏名で識別する');
    const diplomacySource = fs.readFileSync(path.join(ROOT, 'js/diplomacy.js'), 'utf8');
    assert.ok(diplomacySource.includes('const enemyDaimyoRef = this._getThirdPartyDaimyoReference('), '実際の取り次ぎ経路が第三者呼称ヘルパーを使う');
    assert.ok(diplomacySource.includes('${enemyDaimyoRef}が面会を求めております'), '来訪案内本文が第三者呼称を使用する');
    assert.ok(!diplomacySource.includes('${doerClan.name}当主・${enemyDaimyoName}'), '旧来の当主名直書き経路を残さない');

});

test('軽微な結果通知は日本語本文へ不要な半角空白を混ぜない', () => {
    const diplomacy = read('js/diplomacy.js');
    const kunishu = read('js/kunishu_system.js');
    const typhoon = read('js/event/typhoon_event.js');
    const common = read('js/event/common_events.js');
    const historical = read('js/event/historical_event.js');
    assert.ok(!diplomacy.includes('${doerClanName} と ${targetClanName} が和睦しました。'), '外交結果の固有名と助詞の間へ空白を入れない');
    assert.ok(!kunishu.includes('${kunishuName} が我が傘下に加わりました！'), '諸勢力結果の固有名と助詞の間へ空白を入れない');
    assert.ok(!typhoon.includes('` ${data.castle.name} が台風の被害'), '台風通知の先頭空白を残さない');
    assert.ok(!common.includes('${aiClanName} が ${playerClan.name} に臣従しました'), '臣従イベント通知の固有名周辺へ空白を入れない');
    assert.ok(!historical.includes('${args.odaClanName} が ${args.matsudairaClanName} と同盟'), '歴史イベント結果の固有名周辺へ空白を入れない');
    assert.ok(!diplomacy.includes('人質として送っていた ${busho.name} は${clanName} に'), '人質結果通知の固有名周辺へ空白を戻さない');
    assert.ok(!diplomacy.includes('${this.game.getClan(targetClanId).name} との和睦'), '和睦結果・失敗文の固有名直後へ空白を戻さない');
    assert.ok(!common.includes('金${targetIncome} の収入'), '交易結果の数値と助詞の間へ空白を入れない');
});


test('婚姻の多段選択は履歴と選択状態を一段ずつ保存・復元する', () => {
    const ctx = createContext({
        document: { getElementById: () => null },
        requestAnimationFrame: () => 0,
        SelectorModalView: class {
            constructor() {}
            close() {}
        }
    });
    loadScript(ctx, 'js/ui_info.js');
    vm.runInContext('this.UIInfoManager = UIInfoManager;', ctx);
    const manager = new ctx.UIInfoManager({
        pauseBackgroundUpdates() {},
        resumeBackgroundUpdates() {}
    }, { phase: 'title' });
    manager._renderCurrentModal = () => {};
    manager.currentModalInfo = { pageType: 'busho_selector', args: ['arrange_marriage_busho'], scrollPos: 12 };
    manager.commonSelectedIds = [101];
    manager.pushSelectionModal('princess_list', [true, null, null]);
    assert.deepStrictEqual(Array.from(manager.modalHistory[0].selectedIds), [101], '親の武将選択を履歴へ保存する');
    assert.deepStrictEqual(Array.from(manager.commonSelectedIds), [], '子の姫選択は空の選択状態から始める');
    manager.commonSelectedIds = [501];
    manager.popModal();
    assert.strictEqual(manager.currentModalInfo.pageType, 'busho_selector');
    assert.deepStrictEqual(Array.from(manager.commonSelectedIds), [101], '戻ると親の選択状態を復元する');

    const uiInfo = read('js/ui_info.js');
    const uiBusho = read('js/ui_info_busho.js');
    const command = read('js/command_system.js');
    assert.ok(uiInfo.includes("this.pushSelectionModal('princess_list', [true, targetCastleId, doerId])"), '姫選択は親モーダルを閉じず履歴へ積む');
    assert.ok(!uiInfo.includes("onBack: isSelectMode ? () => this.openBushoSelector('diplomacy_doer'"), '姫選択の戻り先を外交専用に直書きしない');
    assert.ok(uiBusho.includes('const preserveModalHistory = !!(extraData && extraData.preserveModalHistory);'), '子の武将選択も履歴維持を明示できる');
    assert.ok(uiBusho.includes("actionType === 'marriage_kinsman'"), '婚姻相手の最終確認中は背後の選択画面を保持する');
    assert.ok(command.includes('preserveModalHistory: true'), '姫から婚姻相手へ進む時に履歴維持を指定する');
    assert.ok(!command.includes("// いいえ：もう一度相手武将選びに戻る"), '確認キャンセルで選択画面を開き直す旧経路を残さない');
});

test('自発臣従の大名本人来訪も通常外交と同じ第三者呼称を使う', () => {
    const diplomacy = read('js/diplomacy.js');
    const common = read('js/event/common_events.js');
    assert.ok(diplomacy.includes('getThirdPartyDaimyoReference(daimyo, clanName, questioner = null, options = {})'), '第三者大名呼称を共通イベントから使える公開窓口を持つ');
    assert.ok(common.includes('diplomacyManager.getThirdPartyDaimyoReference(aiDaimyo, aiClanName, playerDaimyo)'), '自発臣従の取り次ぎも共通呼称窓口を使う');
    assert.ok(common.includes('`「殿、${aiDaimyoRef}がお見えになっております」`'), '小姓の案内本文へ共通呼称を差し込む');
    assert.ok(!common.includes('introMsg = `「殿、${aiClanName}当主・${aiDaimyoName}様がお見えになっております」`'), '大名本人の氏名+様直書きを残さない');
});

test('人事・婚姻・官位の主要確認文も日本語本文へ不要な半角空白を入れない', () => {
    const command = read('js/command_system.js');
    const court = read('js/courtRank_system.js');
    const ui = read('js/ui.js');
    const info = read('js/ui_info.js');
    assert.ok(!command.includes('${busho.name} に ${princess.name} を嫁がせます'), '自家婚姻確認の空白を残さない');
    assert.ok(!command.includes('${targetClan.name} の ${targetBusho.name} に、当家の ${princess.name} を嫁がせます'), '外交婚姻確認の空白を残さない');
    assert.ok(!command.includes('${busho.name} と ${princess.name} の祝言'), '祝言結果の空白を残さない');
    assert.ok(!command.includes('${commanderName} を ${legionName} の国主から解任'), '国主解任結果の空白を残さない');
    assert.ok(!court.includes('${bushoName} が ${rankFullName} に叙されました'), '官位叙任通知の空白を残さない');
    assert.ok(!ui.includes('${commander.name} を国主の座から解任しますか'), '国主解任確認の空白を残さない');
    assert.ok(!info.includes('${castle.name} の委任設定'), '委任設定タイトルの空白を残さない');
    const life = read('js/life_system.js');
    const save = read('js/save_manager.js');
    const saveView = read('js/save_load_view.js');
    const warPrep = read('js/war_preparation_controller.js');
    const warEffort = read('js/war_effort.js');
    assert.ok(!life.includes('${originalName} が家督を継ぎ'), '家督継承結果の空白を残さない');
    assert.ok(!save.includes('スロット ${slotNo} にセーブ'), 'セーブ結果文の空白を残さない');
    assert.ok(!saveView.includes('${displayTitle} のデータをロード'), 'ロード確認文の空白を残さない');
    assert.ok(!warPrep.includes('${targetCastle.name} を鎮圧しますか'), '諸勢力鎮圧確認の空白を残さない');
    assert.ok(!warEffort.includes('${displayName} を本当に処断'), '捕虜処断確認の空白を残さない');
});



test('選択画面の標準ボタンは実際の戻り先に合わせて［戻る］と［閉じる］を使い分ける', () => {
    const ctx = createContext({
        document: { getElementById: () => null },
        requestAnimationFrame: () => 0,
        SelectorModalView: class { constructor() {} close() {} releaseListContent() {} }
    });
    loadScript(ctx, 'js/ui_info.js');
    vm.runInContext('this.UIInfoManager = UIInfoManager;', ctx);
    const manager = new ctx.UIInfoManager({ pauseBackgroundUpdates() {}, resumeBackgroundUpdates() {} }, { phase: 'title' });
    let opened = null;
    manager.selectorView = {
        open(options) { opened = options; return null; },
        releaseListContent() {}
    };
    manager.modalHistory = [];
    manager._renderListModal({ title: '通常一覧', items: [] });
    assert.strictEqual(opened.backLabel, '閉じる', '戻り先も履歴もない通常一覧は閉じる');
    manager._renderListModal({ title: '地図からの選択', items: [], onBack() {}, backLabel: '戻る' });
    assert.strictEqual(opened.backLabel, '戻る', '明示的な戻り先がある選択一覧は戻る');
    manager.modalHistory = [{ pageType: 'dummy', args: [] }];
    manager._renderListModal({ title: '子一覧', items: [] });
    assert.strictEqual(opened.backLabel, '戻る', '履歴上の親画面がある子一覧は戻る');

    const uiInfo = read('js/ui_info.js');
    const uiBusho = read('js/ui_info_busho.js');
    assert.ok(uiInfo.includes("backLabel: config.backLabel || ((this.modalHistory && this.modalHistory.length > 0) ? '戻る' : '閉じる')"), '共通一覧は明示ラベルを優先する');
    assert.ok(uiInfo.includes("backLabel: isSelectMode && onBack ? '戻る' : null"), '勢力・諸勢力の選択画面は戻り先があれば戻ると表示する');
    assert.ok(uiInfo.includes("backLabel: onCancel ? '戻る' : null"), '援軍等の勢力選択も地図へ戻る時は戻ると表示する');
    assert.ok(uiBusho.includes("backLabel: (onBack || (extraData && extraData.onCancel)) ? '戻る' : null"), '武将選択も明示的な戻り先に合わせる');

    const html = read('index.html');
    assert.ok(html.includes('id="selector-back-btn" class="btn-secondary">閉じる</button>'), '共通SelectorのHTML初期値もView既定の閉じるへ揃える');
    assert.ok(html.includes('id="scenario-close-btn" class="btn-secondary" data-se="cancel.ogg">タイトルへ戻る</button>'), 'シナリオ選択は実際の遷移先であるタイトルを明示する');
    assert.ok(read('js/app_bootstrap.js').includes("bind('scenario-close-btn', () => getGame()?.ui?.returnToTitle())"), 'シナリオ選択の戻る先はタイトル画面である');
});

test('登用・引抜・暗殺・離間の対象→実行武将は一段戻れる履歴を維持する', () => {
    const uiBusho = read('js/ui_info_busho.js');
    const command = read('js/command_system.js');
    assert.ok(uiBusho.includes("['employ_target', 'headhunt_target', 'assassinate_target', 'rumor_target_busho'].includes(actionType)"), '固定二段選択の親一覧を子画面へ進む前に閉じない');
    assert.ok(command.includes("openBushoSelector('employ_doer', null, { targetId: firstId, preserveModalHistory: true })"), '登用は対象一覧を履歴へ残す');
    assert.ok(command.includes("openBushoSelector('headhunt_doer', null, { targetId: firstId, preserveModalHistory: true })"), '引抜は対象一覧を履歴へ残す');
    assert.ok(command.includes("openBushoSelector('assassinate_doer', null, { targetId: firstId, preserveModalHistory: true })"), '暗殺は対象一覧を履歴へ残す');
    assert.ok(command.includes("openBushoSelector('rumor_doer', targetId, { targetBushoId: firstId, preserveModalHistory: true })"), '離間は対象一覧を履歴へ残す');
});

test('出陣・諸勢力鎮圧の総大将選択は出陣武将一覧へ一段戻れる', () => {
    const uiBusho = read('js/ui_info_busho.js');
    const command = read('js/command_system.js');
    assert.ok(uiBusho.includes("const needsGeneralSelection = selectedBushosForLeader.length > 1"), '総大将の追加選択が必要な時だけ親一覧を保持する');
    assert.ok(uiBusho.includes("['war_deploy', 'kunishu_subjugate_deploy'].includes(actionType) && needsGeneralSelection"), '通常出陣と諸勢力鎮圧の固定一覧遷移を履歴対象にする');
    assert.ok(command.includes("openBushoSelector('war_general', targetId, { candidates: selectedIds, preserveModalHistory: true })"), '通常出陣の総大将選択を子履歴として開く');
    assert.ok(command.includes("openBushoSelector('kunishu_war_general', targetId, { candidates: selectedIds, kunishuId: extraData.kunishuId, preserveModalHistory: true })"), '諸勢力鎮圧の総大将選択を子履歴として開く');
});

test('武将→武将の多段選択は親のタブ・範囲・ソート状態も復元する', () => {
    const ctx = createContext({
        document: { getElementById: () => null },
        requestAnimationFrame: () => 0,
        SelectorModalView: class { constructor() {} close() {} }
    });
    loadScript(ctx, 'js/ui_info.js');
    vm.runInContext('this.UIInfoManager = UIInfoManager;', ctx);
    const manager = new ctx.UIInfoManager({ pauseBackgroundUpdates() {}, resumeBackgroundUpdates() {} }, { phase: 'title' });
    manager._renderCurrentModal = () => {};
    manager.currentModalInfo = { pageType: 'busho_selector', args: ['headhunt_doer'] };
    manager.modalHistory = [{
        pageType: 'busho_selector',
        args: ['headhunt_target'],
        selectedIds: [101],
        bushoViewState: { tab: 'status', scope: 'all', sortKey: 'intelligence', isSortAsc: false }
    }];
    manager.bushoCurrentTab = 'stats';
    manager.bushoCurrentScope = 'clan';
    manager.bushoCurrentSortKey = null;
    manager.bushoIsSortAsc = true;
    manager.popModal();
    assert.strictEqual(manager.bushoCurrentTab, 'status');
    assert.strictEqual(manager.bushoCurrentScope, 'all');
    assert.strictEqual(manager.bushoCurrentSortKey, 'intelligence');
    assert.strictEqual(manager.bushoIsSortAsc, false);
    assert.deepStrictEqual(Array.from(manager.commonSelectedIds), [101]);

    const uiBusho = read('js/ui_info_busho.js');
    assert.ok(uiBusho.includes('this.currentModalInfo.bushoViewState = {'), '子武将一覧を開く前に親表示状態を保存する');
    assert.ok(uiBusho.includes("this.bushoCurrentScope = 'clan';"), '子武将一覧は親の範囲を無意識に引き継がず新規状態から始める');
});

test('国主任命の武将→拠点選択は共通履歴だけで一段戻る', () => {
    const uiBusho = read('js/ui_info_busho.js');
    const kyoten = read('js/ui_info_kyoten.js');
    assert.ok(uiBusho.includes("actionType === 'appoint_legion_leader'"), '国主候補の親武将一覧を子画面へ進む前に保持する');
    assert.ok(kyoten.includes("this.pushSelectionModal('kyoten_list', [this.game.playerClanId, true, { bushoId: bushoId, legionNo: legionNo }])"), '任せる拠点は選択履歴へ積む');
    assert.ok(!kyoten.includes('this.ui.showAppointLegionLeaderModal(selectData.legionNo);'), '子画面のBackから親武将一覧を開き直す旧経路を残さない');
    assert.ok(!kyoten.includes("this.closeCommonModal();\n        this.kyotenSavedCastles = null;"), '拠点子画面を開く前に親選択を閉じない');
});

test('数量画面は閉じる時に保留UI更新を破棄しBack処理を専門Viewへ一元化する', () => {
    const slider = read('js/ui_slider.js');
    const bootstrap = read('js/app_bootstrap.js');
    assert.ok(slider.includes('const cancelQuantityUIUpdate = () => {'), '数量UIの保留更新を取消す窓口を持つ');
    assert.ok(slider.includes('if (window.cancelAnimationFrame) window.cancelAnimationFrame(quantityUiRaf);'), 'requestAnimationFrameを閉じる時に取消す');
    assert.ok(slider.includes('cancelQuantityUIUpdate();\n            this.ui.quantityModal.classList.add'), 'モーダルを隠す前に旧画面の更新を止める');
    assert.ok(!bootstrap.includes("bind('quantity-back-btn'"), '起動時の単純hideでUISliderのonCancel/guard復帰を横取りしない');
    assert.ok(slider.includes('（取引上限：<span class="slider-emphasis">'), '取引上限の補足も既存の日本語表記へ揃える');
});

test('武将選択の子数量画面は戻る時に親一覧状態をそのまま復元する', () => {
    const ctx = createContext({
        document: { getElementById: () => null },
        requestAnimationFrame: () => 0,
        SelectorModalView: class { constructor() {} close() {} }
    });
    loadScript(ctx, 'js/ui_info.js');
    vm.runInContext('this.UIInfoManager = UIInfoManager;', ctx);
    const manager = new ctx.UIInfoManager({ pauseBackgroundUpdates() {}, resumeBackgroundUpdates() {} }, { phase: 'title' });
    const classes = new Set();
    const modal = { classList: {
        contains: (name) => classes.has(name),
        add: (name) => classes.add(name),
        remove: (name) => classes.delete(name)
    }};
    manager.selectorView = { getElements: () => ({ modal }), close() {} };
    manager.currentModalInfo = { pageType: 'busho_selector', args: ['headhunt_doer'], selectedIds: [202] };
    manager.modalHistory = [{ pageType: 'busho_selector', args: ['headhunt_target'], selectedIds: [101] }];
    manager.commonSelectedIds = [202];
    assert.strictEqual(manager.suspendCommonModalForChild(), true);
    assert.strictEqual(classes.has('hidden'), true, '子数量画面の間は親一覧だけを一時非表示にする');
    assert.strictEqual(manager.currentModalInfo.args[0], 'headhunt_doer');
    assert.deepStrictEqual(Array.from(manager.commonSelectedIds), [202]);
    assert.strictEqual(manager.modalHistory.length, 1, '親のさらに前段の履歴も保持する');
    assert.strictEqual(manager.resumeCommonModalFromChild(), true);
    assert.strictEqual(classes.has('hidden'), false, '数量画面の戻るで親一覧を再表示する');

    const slider = read('js/ui_slider.js');
    const uiBusho = read('js/ui_info_busho.js');
    const command = read('js/command_system.js');
    assert.ok(slider.includes('suspendCommonModalForChild'), '数量画面は親一覧の一時退避窓口を使う');
    assert.ok(slider.includes('resumeCommonModalFromChild'), '数量画面のキャンセルは親一覧を作り直さず復帰する');
    assert.ok(slider.includes("delete selectionExtraData.returnToParentSelector;"), 'UI遷移専用フラグをゲームロジックへ漏らさない');
    assert.ok(uiBusho.includes("const keepSelectorForQuantityStep = ['headhunt_doer', 'tribute_doer', 'kunishu_goodwill_doer'"), '数量指定へ進む武将一覧を先に閉じない');
    assert.ok(uiBusho.includes("'transport_deploy', 'draft',"), '徴兵・輸送も数量画面から直前の武将選択へ戻れる');
    assert.ok(command.includes("openQuantitySelector('headhunt_gold', selectedIds, extraData.targetId, { returnToParentSelector: true })"), '引抜持参金は実行武将一覧を親として保持する');
    assert.ok(command.includes("openQuantitySelector('transport', selectedIds, targetId, { returnToParentSelector: true })"), '輸送量は出発武将一覧を親として保持する');
    assert.ok(command.includes("openQuantitySelector(actionType, selectedIds, targetId, { returnToParentSelector: true })"), '徴兵量は担当武将一覧を親として保持する');
});

test('迎撃・自軍援軍・同盟援軍の数量画面は武将一覧へ一段戻る', () => {
    const uiBusho = read('js/ui_info_busho.js');
    const prep = read('js/war_preparation_controller.js');
    const effort = read('js/war_effort.js');
    ['def_intercept_deploy', 'atk_self_reinf_deploy', 'def_self_reinf_deploy', 'atk_reinf_deploy', 'def_reinf_deploy'].forEach(type => {
        assert.ok(uiBusho.includes(`'${type}'`), `${type} は数量画面へ進む時に親武将一覧を保持する`);
    });
    assert.ok(prep.includes("openQuantitySelector('atk_self_reinf_supplies', [helperCastle], null, {"));
    assert.ok(prep.includes("openQuantitySelector('def_self_reinf_supplies', [helperCastle], null, {"));
    assert.ok(prep.includes("openQuantitySelector('atk_reinf_supplies', [helperCastle], null, {"));
    assert.ok(effort.includes("openQuantitySelector('def_intercept', [defCastle], null, {"));
    assert.ok(effort.includes("openQuantitySelector('def_reinf_supplies', [helperCastle], null, {"));
    const returnCount = (prep.match(/returnToParentSelector: true/g) || []).length + (effort.match(/returnToParentSelector: true/g) || []).length;
    assert.ok(returnCount >= 5, '特殊援軍の数量画面も共通の親Selector復帰を使う');
    assert.ok(!prep.includes('onCancel: promptBusho'), '援軍数量画面から親一覧を新規openし直す旧キャンセル経路を残さない');
});

test('守備側自軍援軍の大雪警告は数量指定前に戻れる', () => {
    const prep = read('js/war_preparation_controller.js');
    const start = prep.indexOf('handleBushoSelectionForDefSelfReinf(');
    const end = prep.indexOf('executeReinforcementRequest(', start);
    const block = prep.slice(start, end);
    assert.ok(block.includes('const openSupplies = () => {'), '数量画面を警告後に開く専用関数を持つ');
    assert.ok(block.indexOf('if (isHeavySnow)') < block.lastIndexOf('openSupplies();'), '大雪警告を数量確定後ではなく数量画面の前へ置く');
    assert.ok(block.includes("okText: '出陣する'"));
    assert.ok(block.includes("cancelText: '戻る'"));
    assert.ok(block.includes('closeBeforeOk: true'));
    assert.ok(!block.includes('onCancel: promptBusho'), '大雪取消で旧selector再生成へ戻さない');
});

test('守備側自軍援軍の大雪確認は戻れる親一覧を残してから数量画面へ進む', () => {
    let dialogArgs = null;
    let quantityArgs = null;
    let completed = null;
    const helperCastle = { id: 10, provinceId: 1 };
    const defCastle = { id: 20, provinceId: 2 };
    const bushos = { 101: { id: 101, name: '援軍武将' } };
    const game = {
        getCastle: id => id === 10 ? helperCastle : defCastle,
        getProvince: id => ({ id, statusEffects: id === 1 ? ['heavySnow'] : [] }),
        getBusho: id => bushos[id],
        reinforcementService: {
            createManualCastleReinforcement: (_castle, selected, resources, flags) => ({ selected, resources, flags })
        },
        ui: {
            showDialog: (...args) => { dialogArgs = args; },
            openQuantitySelector: (...args) => { quantityArgs = args; }
        }
    };
    const ctx = createContext();
    loadScript(ctx, 'js/war_preparation_controller.js');
    vm.runInContext('this.WarPreparationController = WarPreparationController;', ctx);
    const controller = new ctx.WarPreparationController(game);
    controller.handleBushoSelectionForDefSelfReinf(10, [101], defCastle, data => { completed = data; });

    assert.ok(dialogArgs, '大雪時はまず警告を出す');
    assert.strictEqual(quantityArgs, null, '警告を了承するまでは数量画面へ進まない');
    assert.strictEqual(dialogArgs[3], null, '戻る側で別selectorを新規openするコールバックを持たない');
    assert.strictEqual(dialogArgs[4].cancelText, '戻る');
    dialogArgs[2]();
    assert.ok(quantityArgs, '出陣するを選んだ後だけ数量画面へ進む');
    const extra = quantityArgs[3];
    assert.strictEqual(extra.returnToParentSelector, true, '数量画面は保持した援軍武将一覧の子として開く');
    extra.onConfirm({ 10: {
        soldiers: { num: { value: '600' } }, rice: { num: { value: '700' } },
        horses: { num: { value: '20' } }, guns: { num: { value: '10' } }
    }});
    assert.ok(completed, '数量確定後は援軍データを返す');
    assert.strictEqual(completed.resources.soldiers, 600);
    assert.strictEqual(completed.flags.isAttacker, false);
    assert.strictEqual(completed.flags.isSelf, true);
});

test('派閥再編後の一覧更新は共通Selectorの現在画面を正本にする', () => {
    const faction = read('js/faction_system.js');
    const info = read('js/ui_info.js');
    assert.ok(!faction.includes("getElementById('faction-list-modal')"), '削除済みの派閥専用modalを探さない');
    assert.ok(!faction.includes('currentFactionClanId'), '旧専用画面の保持変数を使わない');
    assert.ok(!faction.includes('isFactionListDirect'), '旧専用画面の保持変数を使わない');
    assert.ok(faction.includes('this.game.ui.info.refreshOpenFactionList(targetId);'), '派閥SystemはUI側の公開更新窓口へ委譲する');
    assert.ok(info.includes("info.pageType !== 'faction_list'"), '現在画面が派閥一覧の時だけ更新する');
    assert.ok(info.includes('info.scrollPos = listEl ? listEl.scrollTop'), '再描画前にスクロール位置を保持する');
    assert.ok(info.includes('this._renderCurrentModal();'), '共通Selectorの現在画面をその場で再描画する');
});

test('家督相続・養子縁組・追放の最終確認取消は候補一覧へ戻る', () => {
    const uiBusho = read('js/ui_info_busho.js');
    const command = read('js/command_system.js');
    assert.ok(uiBusho.includes("const keepSelectorForConfirmationStep = ['succession_target', 'adopt_son_target', 'banish'].includes(actionType)"), '最終確認を重ねる候補一覧を先に閉じない');
    assert.ok(uiBusho.includes('!keepSelectorForConfirmationStep'), '共通close条件は最終確認保持を尊重する');
    const handlerStart = command.indexOf('handleBushoSelection(actionType');
    const successionStart = command.indexOf("if (actionType === 'succession_target')", handlerStart);
    const adoptStart = command.indexOf("if (actionType === 'adopt_son_target')", successionStart);
    const rewardStart = command.indexOf("if (actionType === 'reward')", adoptStart);
    const successionBlock = command.slice(successionStart, adoptStart);
    const adoptBlock = command.slice(adoptStart, rewardStart);
    assert.ok(successionBlock.includes('closeCommonModal'), '家督確定時だけ候補一覧を正式終了する');
    assert.ok(adoptBlock.includes('closeCommonModal'), '養子確定時だけ候補一覧を正式終了する');
    assert.ok(successionBlock.includes("cancelText: '戻る'"));
    assert.ok(adoptBlock.includes("cancelText: '戻る'"));
    const banishHandlerStart = command.indexOf("if (actionType === 'banish')", handlerStart);
    const genericSpecStart = command.indexOf("if (spec &&", banishHandlerStart);
    const banishHandlerBlock = command.slice(banishHandlerStart, genericSpecStart);
    assert.ok(banishHandlerBlock.includes("showDialog(`本当に${busho.name}を追放しますか？`"), '追放確認はexecuteWithEventの外側で行う');
    assert.ok(banishHandlerBlock.indexOf('showDialog') < banishHandlerBlock.indexOf("executeWithEvent('banish'"), '確定してから実行イベントへ入る');
    const executeCommandStart = command.indexOf('executeCommand(type');
    const banishExecStart = command.indexOf("if (type === 'banish')", executeCommandStart);
    const bushoLoopStart = command.indexOf('bushoIds.forEach', banishExecStart);
    const banishExecBlock = command.slice(banishExecStart, bushoLoopStart);
    assert.ok(!banishExecBlock.includes('showDialog'), '追放の実処理側へ確認ダイアログを残さない');
});

test('外交の軍師助言・臣従確認取消は外交担当一覧へ戻れる', () => {
    const uiBusho = read('js/ui_info_busho.js');
    const command = read('js/command_system.js');
    assert.ok(uiBusho.includes("const diplomacyKeepsSelectorForConfirmation = ['alliance', 'subordinate', 'vassalage', 'dominate', 'truce', 'court_truce'].includes(diplomacySubAction);"), '取消可能な外交は担当武将一覧を確認中も保持する');
    assert.ok(uiBusho.includes("diplomacySubAction === 'break_alliance'"), '会話へ直行する断交だけを担当選択から直接handoffする');
    assert.ok(!uiBusho.includes("!['goodwill', 'marriage'].includes(extraData.subAction)"), '確認を挟む外交まで一律に担当一覧を閉じる旧条件を残さない');
    const handlerStart = command.indexOf('handleBushoSelection(actionType');
    const diploStart = command.indexOf("if (actionType === 'diplomacy_doer')", handlerStart);
    const tributeStart = command.indexOf("if (actionType === 'tribute_doer')", diploStart);
    const diploBlock = command.slice(diploStart, tributeStart);
    assert.ok(diploBlock.includes('const beginDiplomacySelectorHandoff = () => {'), '外交確定後だけ担当一覧を次画面へhandoffする窓口を持つ');
    assert.ok(diploBlock.includes("ui.beginVisualHandoff(() => ui.info.closeCommonModal())"), '次の会話が見えるまで担当一覧を保持する');
    ['alliance', 'subordinate', 'dominate', 'truce', 'court_truce'].forEach(type => {
        assert.ok(diploBlock.includes(`this.showAdviceAndExecute('${type}'`), `${type} は軍師助言経路を維持する`);
    });
    assert.ok(diploBlock.includes('{ beforeConfirm: beginDiplomacySelectorHandoff }'), '軍師助言を了承した時だけhandoffを開始する');
    const vassalageStart = diploBlock.indexOf("extraData.subAction === 'vassalage'");
    const dominateStart = diploBlock.indexOf("extraData.subAction === 'dominate'", vassalageStart);
    const vassalageBlock = diploBlock.slice(vassalageStart, dominateStart);
    assert.ok(vassalageBlock.indexOf('beginDiplomacySelectorHandoff();') < vassalageBlock.indexOf("executeWithEvent('vassalage'"), '臣従確定時だけ担当一覧handoffを開始してから実行する');
    assert.ok(vassalageBlock.includes("cancelText: '戻る'"), '臣従取消は担当一覧へ戻る');

    const adviceStart = command.indexOf('\n    showAdviceAndExecute(actionType');
    const adviceBlock = command.slice(adviceStart, adviceStart + 900);
    assert.ok(adviceBlock.includes("if (uiFlow && typeof uiFlow.beforeConfirm === 'function') uiFlow.beforeConfirm();"), '軍師助言のOK時だけUI遷移処理を差し込める');
    assert.ok(adviceBlock.indexOf('uiFlow.beforeConfirm()') < adviceBlock.indexOf('this.executeWithEvent(actionType'), 'handoff開始後に実行へ進む');
});

test('国主任命の最終確認取消は拠点一覧の位置を保持する', () => {
    const kyoten = read('js/ui_info_kyoten.js');
    const selectStart = kyoten.indexOf('if (isSelectMode && selectData)');
    const selectEnd = kyoten.indexOf('this._renderListModal({', selectStart);
    const block = kyoten.slice(selectStart, selectEnd);
    assert.ok(block.includes('`${busho.name}を国主に任命し、${castle.name}を本拠としますか？`'), '確認文だけで任命人物と本拠が分かる');
    assert.ok(block.includes("{ okText: '任命する', cancelText: '戻る', closeBeforeCancel: true }"), '確定・取消の意味を明示し取消時は背後の一覧へ即復帰する');
    assert.ok(!block.includes('this._renderKyotenList(clanId, isSelectMode, selectData, 0);'), '取消時に拠点一覧を先頭から再描画しない');
    assert.ok(block.includes('this.closeCommonModal();'), '確定時だけ選択一覧を閉じる');
});

test('軍師不在の戦況報告も人物の共通呼称と当主本人の自己呼称を使う', () => {
    const warEffort = read('js/war_effort.js');
    assert.ok(warEffort.includes("Number(target.id) === Number(playerDaimyo.id)) return '殿';"), '小姓代行時にプレイヤー当主本人を氏名+殿で報告しない');
    assert.ok(warEffort.includes('ConversationStandingRules.getInterviewTargetCallName(this.game, null, target, playerDaimyo)'), '軍師不在でも第三者人物を共通呼称規則へ通す');
    assert.ok(!warEffort.includes(': `${target.fullName || target.name}殿`;'), '小姓専用の氏名+殿フォールバックを通常経路として残さない');
});

test('援軍・独立結果と持参金表示も通常の日本語表記へ揃える', () => {
    const warEffort = read('js/war_effort.js');
    const independence = read('js/independence_system.js');
    const slider = read('js/ui_slider.js');
    assert.ok(!warEffort.includes('主家である ${myClanName} から'), '援軍文で固有名と助詞の間へ空白を入れない');
    assert.ok(!warEffort.includes('${myClanName} から\\n'), '援軍依頼文の固有名直後へ空白を残さない');
    assert.ok(!warEffort.includes('(持参金:'), '補足の括弧と区切りを半角英語表記へ戻さない');
    assert.ok(!independence.includes('${p.name} は処断されました'), '独立後処遇の固有名と助詞の間へ空白を入れない');
    assert.ok(!independence.includes('${p.name} は解放されました'), '独立後処遇の解放文にも空白を入れない');
    assert.ok(slider.includes('持参金（任意）'), '持参金UIは日本語の全角括弧を使う');
    assert.ok(!slider.includes('持参金 (任意)'), '旧半角括弧表記を残さない');
    assert.ok(slider.includes('使者に持たせる金（最大1500）') && slider.includes('献上金（最大1500）'), '援軍・献上金タイトルも同じ全角括弧へ揃える');
});

test('外交導入と臣従会話は話しかけ方と実際の操作を食い違わせない', () => {
    const diplomacy = read('js/diplomacy.js');
    const common = read('js/event/common_events.js');
    assert.ok(diplomacy.includes('和睦の件で面会を求めております'), '敵大名本人の来訪を未知人物の「名乗る者」扱いにしない');
    assert.ok(!common.includes('お会いになられますか？'), '選択肢を出さない臣従導入で可否を質問しない');
    assert.ok(!common.includes('いただききたく'), '臣従拒否台詞の旧誤字を残さない');
});

test('武将の噂は将軍・左馬頭を候補外にし調略方針では従来の特殊呼称を維持する', () => {
    const ctx = createContext();
    loadScript(ctx, 'js/config.js');
    loadScript(ctx, 'js/busho_list_sort_rules.js');
    loadScript(ctx, 'js/conversation_standing_rules.js');
    loadScript(ctx, 'js/interview_system.js');
    vm.runInContext('this.InterviewSystem = InterviewSystem;', ctx);

    const ranks = new Map([[98, { id: 98, rankNo: 10, rankName2: '左馬頭' }]]);
    const lord = { id: 10, clan: 2, isDaimyo: true, fullName: '朝倉義景', familyNameStr: '朝倉', givenName: '義景', courtRankIds: [], familyIds: [10] };
    const samano = { id: 11, clan: 2, isDaimyo: false, name: '足利義昭', fullName: '足利義昭', familyNameStr: '足利', givenName: '義昭', courtRankIds: [98], familyIds: [11] };
    const interviewer = { id: 20, clan: 1, fullName: '明智光秀', familyNameStr: '明智', givenName: '光秀', courtRankIds: [], familyIds: [20] };
    const clans = [{ id: 1, name: '織田家', leaderId: 21 }, { id: 2, name: '朝倉家', leaderId: 10 }];
    const game = {
        playerClanId: 1, clans, bushos: [lord, samano, interviewer],
        getClan: id => clans.find(c => Number(c.id) === Number(id)),
        getClanDaimyo: id => Number(id) === 2 ? lord : null,
        courtRankSystem: {
            RANK_ID_SHOGUN: 1, RANK_IDS_CANDIDATE: [98],
            getRankData: id => ranks.get(Number(id)) || null,
            getHighestRankData(busho) { return (busho.courtRankIds || []).map(id => this.getRankData(id)).filter(Boolean)[0] || null; }
        }
    };
    const interview = new ctx.InterviewSystem(game);
    assert.strictEqual(interview._isRumorEligibleTarget(interviewer, samano), false, '左馬頭は噂候補にしない');
    interview._getBestIntrigueTarget = () => ({ target: samano, prob: 0.8, score: 0.8 });
    const intrigue = interview._getIntelligencePolicyText(interviewer, { level: 'full' });
    assert.ok(intrigue.includes('左馬頭様') && !intrigue.includes('足利義昭殿'), '噂以外の調略方針では特殊権威の既存呼称を維持する');
});

test('官位呼びは姓を付けず官位名だけで呼ぶ', () => {
    const ctx = createContext();
    loadScript(ctx, 'js/config.js');
    loadScript(ctx, 'js/busho_list_sort_rules.js');
    loadScript(ctx, 'js/conversation_standing_rules.js');
    loadScript(ctx, 'js/diplomacy.js');
    vm.runInContext('this.DiplomacyManager = DiplomacyManager;', ctx);

    const rank = { id: 20, rankNo: 8, rankName2: '修理亮' };
    const speaker = { id: 1, clan: 1, familyNameStr: '明智', givenName: '光秀', fullName: '明智光秀', courtRankIds: [], familyIds: [1] };
    const target = { id: 2, clan: 1, familyNameStr: '柴田', givenName: '勝家', fullName: '柴田勝家', courtRankIds: [20], familyIds: [2] };
    const game = {
        clans: [], bushos: [speaker, target], legions: [],
        courtRankSystem: {
            RANK_ID_SHOGUN: 1, RANK_IDS_CANDIDATE: [],
            getRankData: id => Number(id) === 20 ? rank : null,
            getHighestRankData(busho) { return (busho.courtRankIds || []).includes(20) ? rank : null; }
        }
    };
    assert.strictEqual(ctx.ConversationStandingRules.getDiplomaticCallName(game, target, speaker), '修理亮殿');
    assert.strictEqual(ctx.ConversationStandingRules.getInterviewTargetCallName(game, speaker, target), '修理亮殿');

    const dm = new ctx.DiplomacyManager(game);
    assert.strictEqual(dm._getDaimyoReference(target, '柴田家', '様'), '修理亮様');
});

test('外交と臣従コモンイベントは会話上の格を共通ルールから取得する', () => {
    const diplomacy = read('js/diplomacy.js');
    const common = read('js/event/common_events.js');
    const index = read('index.html');
    assert.ok(index.includes('js/conversation_standing_rules.js'));
    assert.ok(diplomacy.includes('ConversationStandingRules.getDiplomacyContext'));
    assert.ok(diplomacy.includes('buildDiplomacyGreeting(senderBusho, receiverDaimyo)'));
    assert.ok(common.includes('diplomacyManager.buildDiplomacyGreeting(envoy, playerDaimyo)'));
    assert.ok(!common.includes('const getCallName = (busho) =>'), 'コモンイベント側へ官位呼称判定を複製しない');
});

test('面談・外交の台詞は身分差を保ちつつ重複した礼辞を一発言へ重ねない', () => {
    const interviewSrc = read('js/interview_system.js');
    const diplomacySrc = read('js/diplomacy.js');
    const architecture = read('ARCHITECTURE.md');
    assert.ok(architecture.includes('一発言一要点'), '台詞密度の編集基準を設計文書へ残す');
    assert.ok(architecture.includes('自動切詰め'), '機械的な文字数切断を禁止して文脈を守る');
    assert.ok(!interviewSrc.includes('表向きは何事もないように振る舞っておりますが、あれは本心ではありますまい'), '看破台詞で表向き説明と本心説明を二重に繰り返さない');
    assert.ok(!diplomacySrc.includes('これまでの働きもよく分かっている。されど、今はまだ主従の約を解く時ではない。今しばらくはこれまでどおり'), '主従解消拒否で既出の謝意を重ねない');
    assert.ok(diplomacySrc.includes('_styleDiplomacyTextForSpeaker'), '短縮後も身分別の話者姿勢を通す');
});

test('会話組版は鉤括弧で閉じる時だけ終端句点を省き裸の文章は変えない', () => {
    const ctx = createContext();
    loadScript(ctx, 'js/dialogue_text_rules.js');
    const rules = ctx.DialogueTextRules;
    assert.strictEqual(rules.normalizeConversationText('「承知しました。」'), '「承知しました」');
    assert.strictEqual(rules.normalizeConversationText('「第一です。第二です。。」'), '「第一です。第二です」');
    assert.strictEqual(rules.normalizeConversationText('承知しました。'), '承知しました。');
    assert.strictEqual(rules.normalizeConversationText('彼は「承知しました。」と答えた。'), '彼は「承知しました」と答えた。');
});

test('通常会話と面談会話は同じDialogueTextRulesを使い軍師だけの特例にしない', () => {
    const html = read('index.html');
    const ui = read('js/ui.js');
    const view = read('js/interview_view.js');
    const gunshi = read('js/gunshi_system.js');
    const dialoguePos = html.indexOf('js/dialogue_text_rules.js');
    assert.ok(dialoguePos >= 0 && dialoguePos < html.indexOf('js/interview_view.js') && dialoguePos < html.indexOf('js/ui.js'));
    assert.ok(ui.includes('DialogueTextRules.normalizeConversationText(msg)'), '通常showDialog系は共通会話組版を通す');
    assert.ok(view.includes('DialogueTextRules.normalizeConversationText(compact)'), '面談専用会話も同じ共通規則を通す');
    assert.ok(!gunshi.includes('厳しい交渉になるでしょう。。'), '軍師助言に残っていた二重句点も除去する');
    const dialogueFiles = ['js/diplomacy.js', 'js/event/event_text.js', 'js/interview_system.js'];
    for (const file of dialogueFiles) assert.ok(!read(file).includes('。」'), `${file} の固定会話文に 。」 を残さない`);
});

test('面談コモンイベントは挨拶直後に最大1件だけ処理し通常画面refreshを使わない', () => {
    const manager = read('js/event_manager.js');
    assert.ok(manager.includes('interview_after_greeting: []'));
    assert.ok(manager.includes('async processInterviewEvent(context = null)'));
    assert.ok(manager.includes("const timing = 'interview_after_greeting'"));
    assert.ok(manager.includes('return true;'), '成立したイベントを1件実行したらhandledを返す');
    const start = manager.indexOf('async processInterviewEvent(context = null)');
    const end = manager.indexOf('// 指定したタイミング', start);
    const block = manager.slice(start, end);
    assert.ok(!block.includes('EventAction.refreshScreen'), '面談専用オーバーレイ中に通常画面refreshを走らせない');
});

test('承認欲求の忠誠変動は15刻みで正負対称・閾値未満0', () => {
    const ctx = createContext();
    loadScript(ctx, 'js/faction_system.js');
    const calc = value => vm.runInContext(`FactionSystem.calcRecognitionLoyaltyChange(${value}, 15)`, ctx);
    assert.strictEqual(calc(1), 0);
    assert.strictEqual(calc(14), 0);
    assert.strictEqual(calc(15), -1);
    assert.strictEqual(calc(29), -1);
    assert.strictEqual(calc(30), -2);
    assert.strictEqual(calc(-1), 0);
    assert.strictEqual(calc(-14), 0);
    assert.strictEqual(calc(-15), 1);
    assert.strictEqual(calc(-29), 1);
    assert.strictEqual(calc(-30), 2);
});

test('米相場は「金1で得られる兵糧量」として表示・売買・AIを一元化する', () => {
    const ctx = createContext();
    loadScript(ctx, 'js/config.js');
    loadScript(ctx, 'js/economy_rules.js');
    const province = { id: 1, marketRate: 2.0 };
    const castle = { provinceId: 1, ownerClan: 1, gold: 500, rice: 1000, tradeLimit: 500 };
    const game = { kunishuSystem: { getAliveKunishus() { return []; } } };

    const buyInfo = ctx.EconomyRules.getRiceActualRate('buy_rice', castle, [province], game);
    const sellInfo = ctx.EconomyRules.getRiceActualRate('sell_rice', castle, [province], game);
    assert.strictEqual(ctx.MainParams.Economy.TradeRateBase, 2.0);
    assert.strictEqual(ctx.MainParams.Economy.TradeRateMin, 1.5);
    assert.strictEqual(ctx.MainParams.Economy.TradeRateMax, 2.5);
    assert.ok(!Object.prototype.hasOwnProperty.call(ctx.MainParams.Economy, 'RiceMarketUnit'));
    assert.strictEqual(buyInfo.ricePerGold, 2.0);
    assert.strictEqual(sellInfo.ricePerGold, 2.0);
    assert.strictEqual(ctx.EconomyRules.formatRiceMarketRate(2), '金1＝兵糧2.0');

    // 相場2なら金500で兵糧1000、兵糧1000を売れば金500。
    assert.strictEqual(ctx.EconomyRules.calcTradeCostAndRate('buy_rice', 1000, castle, null, null, [province], game).cost, 500);
    assert.strictEqual(ctx.EconomyRules.calcTradeCostAndRate('sell_rice', 1000, castle, null, null, [province], game).cost, 500);
    assert.strictEqual(ctx.EconomyRules.calcMaxTradeAmount('buy_rice', castle, null, null, [province], game), 1000);

    // 相場5なら金500で兵糧2500。範囲外の値でも式の意味自体が変わらないことを固定する。
    province.marketRate = 5.0;
    assert.strictEqual(ctx.EconomyRules.calcTradeCostAndRate('buy_rice', 2500, castle, null, null, [province], game).cost, 500);

    // 商人割引は、新相場定義でも購入・売却の双方でプレイヤー有利に働く。
    const merchantGame = {
        kunishuSystem: {
            getAliveKunishus() {
                return [{ ideology: '商人', getRelation() { return 100; } }];
            }
        }
    };
    province.marketRate = 2.0;
    const merchantBuy = ctx.EconomyRules.getRiceActualRate('buy_rice', castle, [province], merchantGame);
    const merchantSell = ctx.EconomyRules.getRiceActualRate('sell_rice', castle, [province], merchantGame);
    assert.ok(merchantBuy.ricePerGold > 2.0, '購入時は金1で得られる兵糧が増える');
    assert.ok(merchantSell.ricePerGold < 2.0, '売却時は同じ金を得るのに必要な兵糧が減る');
    assert.strictEqual(ctx.EconomyRules.calcTradeCostAndRate('buy_rice', 1000, castle, null, null, [province], merchantGame).cost, 450);
    assert.strictEqual(ctx.EconomyRules.calcTradeCostAndRate('sell_rice', 1000, castle, null, null, [province], merchantGame).cost, 550);

    const uiSource = read('js/ui.js');
    const sliderSource = read('js/ui_slider.js');
    const aiSource = read('js/ai.js');
    assert.ok(uiSource.includes('米相場＝${EconomyRules.formatRiceMarketValue(currentRate)}'), '常時表示は短い米相場表記を共通数値フォーマッタから作る');
    assert.ok(sliderSource.includes('EconomyRules.formatRiceMarketRate(rateInfo.ricePerGold)'), '取引画面も金1＝兵糧X.Xを使う');
    assert.ok(!sliderSource.includes('getRiceMarketUnit'), '旧10兵糧単位の換算を残さない');
    assert.ok(aiSource.includes('castle.gold * buyActualRate'), 'AI購入可能量も金×兵糧/金で計算する');
    assert.ok(aiSource.includes('Math.floor(sellAmount / rate)'), 'AI売却益も兵糧÷兵糧/金で計算する');
    assert.ok(read('js/command_system.js').includes('EconomyRules.calcTradeCostAndRate(type, amount'), 'プレイヤー取引実行もEconomyRulesを正本にする');
});

test('PC上部の年月・浪人・米相場は同一Flexグループのgapで等間隔に並ぶ', () => {
    const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
    const css = fs.readFileSync(path.join(ROOT, 'css/style.css'), 'utf8');
    assert.ok(html.includes('<div id="map-floating-status">'), '3項目の共通レイアウト親を持つ');
    assert.ok(css.includes('#map-floating-status {') && css.includes('gap: 15px;'), 'PC側の項目間隔は共通親のgapで管理する');
    assert.ok(!css.includes('right: 280px;'), '年月だけを固定座標で押し込む旧配置を残さない');
});

test('米相場の供給不足・供給増イベントは「金1で得られる兵糧量」の向きに一致する', () => {
    const common = read('js/event/common_events.js');
    const typhoon = read('js/event/typhoon_event.js');
    const war = read('js/war_effort.js');
    const economy = read('js/economy_rules.js');

    assert.ok(common.includes('badAffected.has(prov.id)') && common.includes('prov.marketRate - (baseRate * 0.5)'), '凶作では相場値を下げる');
    assert.ok(common.includes('goodAffected.has(prov.id)') && common.includes('prov.marketRate + (baseRate * 0.5)'), '豊作では相場値を上げる');
    assert.ok(common.includes('prov.marketRate - (baseRate * 0.1)'), '大雪では相場値を下げる');
    assert.ok(typhoon.includes('prov.marketRate - (baseRate * 0.6)'), '台風では相場値を下げる');
    assert.ok(war.includes('atkProv.marketRate - 0.3') && war.includes('defProv.marketRate - 0.3'), '出陣による需要増では相場値を下げる');
    assert.ok(economy.includes('seasonForce = harvestBoost') && economy.includes('seasonForce = -(baseRate * 0.05)'), '9月の供給増は相場を上げ、通常月は緩やかに下げる');
});


test('月次交易履歴は当事者勢力を明示して自家関与分を全国へ誤分類しない', () => {
    const common = read('js/event/common_events.js');
    assert.ok(common.includes('clanIds: [clan.id, targetClan.id]'), '交易履歴に双方の勢力IDを保存する');
    assert.ok(common.includes("category: 'trade'"), '交易履歴を専用カテゴリで記録する');
    assert.ok(common.includes('game.ui.log(log.text, {'), '交易履歴は構造化した関連勢力情報とともに記録する');
    assert.ok(!common.includes('logMessages.forEach(msg => game.ui.log(msg))'), '関係勢力不明の旧記録経路を残さない');
});

test('HistorySystem は自国/全国を排他的に振り分け保持上限を守る', () => {
    const ctx = createContext({ GameConfig: { History: { MaxEntries: 3 } } });
    loadScript(ctx, 'js/history_system.js');
    const game = { year: 1560, month: 4, playerClanId: 1, getCurrentTurnCastle: () => null, warManager: { state: { active: false } } };
    const history = new ctx.HistorySystem(game);
    history.record('自国', { clanIds: [1], category: 'test', inferCurrentTurn: false });
    history.record('他国', { clanIds: [2], category: 'test', inferCurrentTurn: false });
    history.record('両国', { clanIds: [1, 2], category: 'test', inferCurrentTurn: false });
    assert.deepStrictEqual(Array.from(history.getEntries('clan', 1), e => e.text), ['自国', '両国']);
    assert.deepStrictEqual(Array.from(history.getEntries('national', 1), e => e.text), ['他国'], '自国関連の履歴を全国へ重複表示しない');
    history.record('追加', { clanIds: [3], inferCurrentTurn: false });
    assert.deepStrictEqual(Array.from(history.getEntries('national', 1), e => e.text), ['他国', '追加']);

    const currentTurnGame = { year: 1560, month: 5, playerClanId: 1, getCurrentTurnCastle: () => ({ ownerClan: 1 }), warManager: { state: { active: false } } };
    const scoped = new ctx.HistorySystem(currentTurnGame);
    scoped.record('関係不明');
    assert.strictEqual(scoped.getEntries('clan', 1).length, 0, '関係勢力不明の全国出来事を現在手番だけで自国扱いしない');
    assert.strictEqual(scoped.getEntries('national', 1).length, 1, '関係勢力不明の全国出来事は全国側へ置く');
    scoped.record('自国コマンド', { inferCurrentTurn: true });
    assert.strictEqual(scoped.getEntries('clan', 1).length, 1, '明示した場合だけ現在手番勢力へ関連付ける');
    assert.strictEqual(scoped.getEntries('national', 1).length, 1, '自国コマンドを全国へ重複表示しない');
});

test('大名家向け通常調略は諸勢力頭領を候補にも実行対象にも含めない', () => {
    const ctx = createContext({
        BushoStatusRules: { isActive: b => !!b && b.status === 'active' }
    });
    loadScript(ctx, 'js/strategy_system.js');
    const StrategySystemClass = vm.runInContext('StrategySystem', ctx);
    const dialogs = [];
    const game = { ui: { showDialog: msg => dialogs.push(msg) } };
    const strategy = new StrategySystemClass(game);

    const regular = { id: 10, clan: 2, belongKunishuId: 0, status: 'active' };
    const kunishuLeader = { id: 20, clan: 0, belongKunishuId: 7, status: 'active' };
    const foreign = { id: 30, clan: 3, belongKunishuId: 0, status: 'active' };
    assert.strictEqual(strategy.isRegularClanStrategyTarget(regular, 2), true);
    assert.strictEqual(strategy.isRegularClanStrategyTarget(kunishuLeader, 2), false, '同じ城にいる諸勢力頭領を敵家臣扱いしない');
    assert.strictEqual(strategy.isRegularClanStrategyTarget(foreign, 2), false, '別勢力武将も対象勢力の候補に混ぜない');
    assert.strictEqual(strategy._rejectInvalidRegularStrategyTarget(kunishuLeader), true);
    assert.strictEqual(dialogs.length, 1, '実行入口でも諸勢力所属者を拒否する');

    const ai = read('js/ai.js');
    assert.ok(ai.includes('this.game.strategySystem.isRegularClanStrategyTarget(b, memoryClanId)'), 'AI候補抽出は所属勢力まで確認する');
    assert.ok(ai.includes('isRegularClanStrategyTarget(targetBusho, action.targetClanId)'), 'AIは実行直前にも対象所属を再検証する');
    const command = read('js/command_system.js');
    assert.ok(command.includes('Number(b.belongKunishuId || 0) === 0'), 'プレイヤー側の通常調略候補も諸勢力所属者を明示除外する');
    const architecture = read('ARCHITECTURE.md');
    assert.ok(architecture.includes('`belongKunishuId > 0` の諸勢力所属者'), '設計文書にも通常調略と諸勢力の責務境界を残す');
});

test('調略履歴は自家関与だけを通常記録し他家同士は見える所属変更だけ残す', () => {
    const records = [];
    const ctx = createContext();
    loadScript(ctx, 'js/strategy_system.js');
    const game = {
        playerClanId: 1,
        historySystem: { record: (text, options) => records.push({ text, options }) },
        getClan: id => ({ id, name: id === 1 ? '自家' : id === 2 ? '他家A' : '他家B' })
    };
    const StrategySystemClass = vm.runInContext('StrategySystem', ctx);
    const strategy = new StrategySystemClass(game);
    const myDoer = { clan: 1, name: '自家武将', fullName: '自家武将' };
    const aiDoer = { clan: 2, name: '他家武将', fullName: '他家武将' };

    strategy.recordStrategyHistory('離間計', aiDoer, '対象武将', false, [3], { isDiscovered: false });
    strategy.recordStrategyHistory('離間計', aiDoer, '対象武将', false, [3], { isDiscovered: true });
    assert.strictEqual(records.length, 0, '他家同士の秘密工作は発覚していても全国履歴へ出さない');

    strategy.recordStrategyHistory('引抜', aiDoer, '対象武将', true, [3], { isDiscovered: false });
    assert.strictEqual(records.length, 1, '他家同士でも引抜成功による所属変更は全国履歴へ残す');
    assert.ok(records[0].text.includes('【武将移籍】'));
    assert.ok(records[0].text.includes('他家Bを離れ、他家Aに仕えました'));
    assert.strictEqual(records[0].options.category, 'personnel');

    strategy.recordStrategyHistory('離間計', aiDoer, '自家武将', false, [1], { isDiscovered: false });
    assert.strictEqual(records.length, 1, '自家が標的でも未発覚の秘密工作は漏らさない');
    strategy.recordStrategyHistory('離間計', aiDoer, '自家武将', false, [1], { isDiscovered: true });
    assert.strictEqual(records.length, 2, '自家が標的で発覚した工作は自国履歴へ残す');

    strategy.recordStrategyHistory('破壊工作', myDoer, '対象城', false, [3], { isDiscovered: false });
    assert.strictEqual(records.length, 3, '自家が実行した調略は未発覚でも自家自身が把握しているため残す');
});

test('自家の拠点行動履歴は実行拠点名を含める', () => {
    const command = read('js/command_system.js');
    assert.ok(command.includes('`【${actionName}】${castle.name}で${actionName}を実行しました。`'));
    assert.ok(command.includes('`【徴兵】${castle.name}で徴兵を行いました。`'));
    assert.ok(command.includes('`【民施し】${castle.name}で民施しを行いました。`'));
    assert.ok(!command.includes('`${actionName}を実行 (効果:${totalVal})`'), '拠点名のない旧内政履歴を残さない');
});

test('勢力一覧と外交関係一覧は基本関係と婚姻を独立列で表示する', () => {
    const info = read('js/ui_info.js');
    const css = read('css/style.css');
    assert.ok(info.includes('friendStatus = relation.status || "普通"'), '勢力一覧の関係列は婚姻表示で基本statusを上書きしない');
    assert.ok(info.includes('isMarriage = relation.isMarriage === true'), '勢力一覧は婚姻フラグを独立して読む');
    assert.ok(info.includes("data-sort=\"marriage\">婚姻${getSortMark('marriage')}"), '婚姻列をソート可能な独立列として持つ');
    assert.ok(info.includes('`<span class="col-marriage">${d.isMarriage ? "◯" : ""}</span>`'), '勢力一覧は婚姻時だけ丸を表示する');
    assert.ok(info.includes('`<span class="col-marriage">${r.isMarriage ? "◯" : ""}</span>`'), '外交関係一覧も婚姻時だけ丸を表示する');
    const diploHeaders = info.slice(info.indexOf('const customHeaderCols = ['), info.indexOf('this._renderListModal({', info.indexOf('const customHeaderCols = [')));
    assert.ok(diploHeaders.indexOf('関係') < diploHeaders.indexOf('期間') && diploHeaders.indexOf('期間') < diploHeaders.indexOf('婚姻'), '外交関係一覧は関係→和睦残期間→婚姻の順に並べる');
    assert.ok(css.includes('.select-item .col-marriage'), '婚姻の丸は一門と同系統の強調表示を持つ');
});

test('スマホ勢力一覧は全タブで勢力名列の幅を揃える', () => {
    const info = read('js/ui_info.js');
    const grids = [...info.matchAll(/gridSpStr = "([^"]+)";/g)].slice(0, 4).map(m => m[1]);
    assert.strictEqual(grids.length, 4, '勢力一覧4タブのスマホ列定義を取得できる');
    grids.forEach((grid, index) => {
        const tracks = grid.split(/\s+/).map(v => Number(v.replace('fr', '')));
        assert.strictEqual(tracks[0], 1.5, `タブ${index + 1}の勢力名列を1.5frで統一する`);
        const total = tracks.reduce((sum, value) => sum + value, 0);
        assert.ok(Math.abs(total - 8) < 1e-9, `タブ${index + 1}の総frを8に揃えて勢力名の実幅を一致させる`);
    });
});

test('履歴表示は月ごとの区切りを画面側で生成し履歴件数を消費しない', () => {
    const info = read('js/ui_info.js');
    const history = read('js/history_system.js');
    assert.ok(info.includes('history-month-divider'));
    assert.ok(info.includes('history-month-label'));
    assert.ok(info.includes('`${year}年 ${month}月`'));
    assert.ok(info.includes('disableVirtualization: true'), '可変高の履歴行は固定行高前提の仮想スクロールを使わない');
    assert.ok(!history.includes('history-month-divider'), '月区切りをHistorySystemの保存エントリとして持たない');
});

test('コマンドのキャンセル段階では履歴を書かず実行確定後だけ履歴化する', () => {
    const command = read('js/command_system.js');
    const start = command.indexOf('showAdviceAndExecute(actionType');
    const end = command.indexOf('executeCommand(type', start);
    const adviceFlow = command.slice(start, end);
    assert.ok(adviceFlow.includes('showCommandAdvice'));
    assert.ok(!adviceFlow.includes('historySystem.record'));
    assert.ok(!adviceFlow.includes('ui.log('), '軍師助言でやめた段階を履歴へ残さない');
});

test('行動履歴はHistorySystemを正本にして自国/全国タブを持ちセーブにも保存する', () => {
    const game = read('js/game.js');
    const ui = read('js/ui.js');
    const info = read('js/ui_info.js');
    const save = read('js/save_manager.js');
    const html = read('index.html');
    assert.ok(game.includes('this.historySystem = new HistorySystem(this)'));
    assert.ok(ui.includes('this.game.historySystem.record(msg'));
    assert.ok(info.includes('data-tab="clan">自国</button>'));
    assert.ok(info.includes('data-tab="national">全国</button>'));
    assert.ok(info.includes("this.historyCurrentScope = nextScope === 'national' ? 'national' : 'clan'"), '全国タブは自国を含むallではなくnationalを使う');
    assert.ok(save.includes('historyEntries: this.game.historySystem ? this.game.historySystem.serialize() : []'));
    assert.ok(save.includes('this.game.historySystem.load(d.historyEntries)'));
    assert.ok(html.indexOf('js/history_system.js') < html.indexOf('js/game.js'));
    assert.ok(!ui.includes('this.logHistory = []'));
});

test('面談・情報取得は行動履歴へ混ぜず調略と主要人事を履歴化する', () => {
    const command = read('js/command_system.js');
    const strategy = read('js/strategy_system.js');
    const affiliation = read('js/affiliation_system.js');
    const life = read('js/life_system.js');
    assert.ok(!command.includes('調査実行: ${target.name}'));
    assert.ok(strategy.includes("category: 'strategy'"));
    assert.ok(strategy.includes("this.recordStrategyHistory('暗殺'"));
    assert.ok(strategy.includes("this.recordStrategyHistory('引抜'"));
    assert.ok(affiliation.includes('【軍師任命】'));
    assert.ok(affiliation.includes('【城主任命】'));
    assert.ok(life.includes('【武将登場】'));
    assert.ok(life.includes('【武将死亡】'));
    assert.ok(command.includes("category: 'command'"), 'プレイヤーコマンド履歴は自家へ明示的に紐づける');
    const history = read('js/history_system.js');
    assert.ok(history.includes('options.inferCurrentTurn === true'), '関係不明ログを現在手番だけで自国扱いしない');
    const diplomacy = read('js/diplomacy.js');
    assert.ok(diplomacy.includes('const historyText = logMsg || aiMsg;'));
    assert.ok(diplomacy.includes('if (historyText) this._recordDiplomacyHistory(historyText, historyClanIds);'), 'AI同士を含む外交結果も全国履歴へ残す');
    const ai = read('js/ai.js');
    assert.ok(ai.includes("recordStrategyHistory('破壊工作'"));
    assert.ok(ai.includes("recordStrategyHistory('民心撹乱'"));
    assert.ok(ai.includes("recordStrategyHistory('離間計'"));
    assert.ok(ai.includes("recordStrategyHistory('引抜'"));
    assert.ok(ai.includes("recordStrategyHistory('暗殺'"));
});

test('戦争履歴は開戦元・援軍・勝敗を実名と全参加勢力で記録する', () => {
    const war = read('js/war_effort.js');
    assert.ok(war.includes('【開戦】${atkHistoryName}の${atkBushos[0].name}が${atkCastle.name}から'), '開戦履歴に出撃元を含める');
    assert.ok(war.includes('【援軍】${helperBase}から${leaderName}が攻撃側の援軍として参戦しました。'));
    assert.ok(war.includes('【援軍】${helperBase}から${leaderName}が守備側の援軍として参戦しました。'));
    assert.ok(war.includes("['reinforcement', 'selfReinforcement', 'defReinforcement', 'defSelfReinforcement']"), '攻守の援軍勢力を履歴関連勢力へ含める');
    assert.ok(war.includes('retreatedReinforcements'), '途中撤退した援軍も戦争参加勢力として維持する');
    assert.ok(war.includes('recordNormalWarOutcomeHistory(attackerWon, isRetreat, s)'), '野戦だけで終わる場合も共通経路で最終結果を履歴化する');
    assert.ok(war.includes('【合戦結果】${atkHistoryClan}が${defHistoryClan}の${s.defender.name}を制圧しました。'));
    assert.ok(war.includes('【合戦結果】${defHistoryClan}が${s.defender.name}の防衛に成功し、${atkHistoryClan}を退けました。'), '攻撃側敗北も必ず最終結果として残す');
    assert.ok(war.includes('【合戦結果】${atkHistoryClan}は${defHistoryClan}の${s.defender.name}攻略を断念し、撤退しました。'), '攻撃側撤退も最終結果として残す');
    assert.ok(war.includes('s._historyOutcomeRecorded = true'), '最終結果を二重記録しない');
    assert.ok(war.includes('getHistoryClanName(clanId'), '履歴では当家表記ではなく実際の家名を使う');
});

test('行動を消費する武将一覧はどのソートでも行動済みを未行動の下へ固定する', () => {
    const busho = read('js/ui_info_busho.js');
    assert.ok(busho.includes("const actionStateKey = hideActionCol ? ''"), '行動状態の変化でソートキャッシュを更新する');
    assert.ok(busho.includes('const groupActionDoneLast = (list) => {'));
    assert.ok(busho.includes('(b.isActionDone === true ? done : pending).push(b)'));
    assert.ok(busho.includes('displayBushos = groupActionDoneLast(displayBushos);'), '能力・名前・行動列など個別ソート後に必ず未行動→行動済へ再編する');
    assert.ok(busho.includes('if (hideActionCol || !Array.isArray(list)) return list;'), '行動消費のない閲覧・任命用一覧には強制グループを適用しない');
});


test('落城後の攻略軍移動は城主再選を保留し最終城主だけ確定する', () => {
    const affiliation = read('js/affiliation_system.js');
    const war = read('js/war_effort.js');
    assert.ok(affiliation.includes('moveCastle(busho, newCastleId, options = {})'));
    assert.ok(affiliation.includes('options.deferCastleLordUpdate !== true'));
    assert.ok(war.includes('finalizeCapturedCastleStaffing(state)'));
    assert.ok(war.includes("moveCastle(b, s.defender.id, { deferCastleLordUpdate: true, deferUI: true })"));
    assert.strictEqual((war.match(/this\.finalizeCapturedCastleStaffing\(s\);/g) || []).length, 2, '撤退占領・通常制圧の両経路で一括確定する');
});

test('全国履歴でも自家コマンドと受諾外交の主語を省略しない', () => {
    const command = read('js/command_system.js');
    const diplomacy = read('js/diplomacy.js');
    assert.ok(command.includes('`${tagged[1]}${clanName}は${tagged[2]}`'));
    assert.ok(command.includes('`${clanName}は${logMsg}`'));
    assert.ok(diplomacy.includes('【外交】${targetClan.name}は${doerClan.name}からの親善を受け入れました。'));
    assert.ok(diplomacy.includes('【外交】${targetClan.name}は${doerClan.name}と同盟を結びました。'));
    assert.ok(diplomacy.includes('【外交】${targetClan.name}は${doerClan.name}に従属しました。'));
    assert.ok(diplomacy.includes('【外交】${targetClan.name}は${doerClan.name}と和睦しました。'));
});

test('諸勢力の壊滅・取込は固有名を持つ履歴として残す', () => {
    const kunishu = read('js/kunishu_system.js');
    const war = read('js/war_effort.js');
    assert.ok(kunishu.includes('【諸勢力壊滅】${destroyedName}'));
    assert.ok(kunishu.includes("【諸勢力取込】${playerClan ? playerClan.name : '自家'}は${kunishuName}を傘下に加えました。"));
    assert.ok(war.includes('【諸勢力壊滅】${kunishuName}は${atkHistoryClan}に制圧され、壊滅しました。'));
});

test('戦場内の一時ログと諸勢力蜂起の予告は行動履歴へ重複混入させない', () => {
    const war = read('js/war.js');
    const effort = read('js/war_effort.js');
    const kunishu = read('js/kunishu_system.js');
    assert.ok(war.includes('攻撃軍の兵糧が尽きました！", { history: false }'));
    assert.ok(war.includes('守備軍の兵糧が尽きました！", { history: false }'));
    assert.ok(effort.includes('(物資搬出率: ${(100*(1-lossRate)).toFixed(0)}%, 捕縛者: ${capturedBushos.length}名)`, { history: false }'));
    assert.ok(effort.includes('(撤退先にて負傷兵 ${recovered}名 が復帰)`, { history: false }'));
    assert.ok(kunishu.includes('【諸勢力蜂起】${castle.name}にて、${kunishuName}が反乱を起こしました！`, { history: false }'));
});

test('スマホの諸勢力攻城戦タイトルは国名・勢力名・鎮圧戦の3行を明示する', () => {
    const uiSrc = fs.readFileSync(path.join(ROOT, 'js/ui.js'), 'utf8');
    const cssSrc = fs.readFileSync(path.join(ROOT, 'css/style.css'), 'utf8');
    assert.match(uiSrc, /war-title-three-lines/);
    assert.match(uiSrc, /war-title-fixed-line/);
    assert.match(uiSrc, /provinceName[\s\S]*factionName[\s\S]*鎮圧戦/);
    assert.match(cssSrc, /body:not\(\.is-pc\) #war-title-name\.war-title-three-lines/);
    assert.match(cssSrc, /war-title-fixed-line:nth-child\(2\)/);
    assert.match(cssSrc, /war-title-fixed-line:nth-child\(3\)/);
});

test('攻城戦メッセージは最新約3表示行へローリングし決着文を単独表示する', () => {
    const ui = read('js/ui.js');
    assert.ok(ui.includes('lineHeight * 3.15'));
    assert.ok(ui.includes('textContainer.removeChild(textContainer.firstElementChild)'));
    assert.ok(ui.includes('/war-critical-message/i.test'));
    assert.ok(ui.includes("entry.className = `war-action-message-entry${isCritical ? ' is-critical' : ''}`"));
    assert.ok(ui.includes("if (isCritical) textContainer.innerHTML = '';"));
});

test('野戦終了通知は終了瞬間の生存部隊ではなく参加実績を基準にする', () => {
    const field = read('js/field_war.js');
    assert.ok(field.includes('this.playerWasInvolved = isPlayerInvolved'));
    assert.ok(field.includes('const isPlayerInvolved = !!this.playerWasInvolved;'));
    assert.ok(field.includes('finishFieldWarWithNotice(resultType, message)'));
    assert.ok(field.includes('攻略を諦めて撤退しました。野戦は終結します。'));
    assert.ok(field.includes('拠点へ退きました。野戦を終え、攻城戦へ移ります。'));
});

test('攻城戦はラウンド開始時点で決着済みでも終了理由を表示してから戦後処理へ進む', () => {
    const war = read('js/war.js');
    assert.ok(war.includes('finishSiegeWithNotice(attackerWon, message)'));
    assert.ok(war.includes("this.finishSiegeWithNotice(true, '拠点の防御が尽き、拠点は陥落しました。')"));
    assert.ok(war.includes("this.finishSiegeWithNotice(true, '守備本隊の士気が崩壊し、拠点は陥落しました。')"));
    assert.ok(war.includes("this.finishSiegeWithNotice(false, '攻撃本隊の士気が崩壊し、攻撃軍は退却しました。')"));
    assert.ok(war.includes("`${activeArmyName}は軍を鼓舞しました。`"));
    assert.ok(war.includes("`${activeArmyName}は火計を仕掛けました。`"));
    assert.ok(war.includes("`${activeArmyName}は突撃を仕掛けました。`"));
    assert.ok(war.includes("`${targetSideLabel}に${actualSoldierDmg}人の損害を与えました。`"));
    assert.ok(war.includes("城壁にも${calculatedWallDmg}の損害を与えました。"));
    assert.ok(war.includes("return `${factionName}・${bushoName}軍`;"));
    assert.ok(war.includes("攻撃軍の兵糧が尽きました。\\n攻撃軍は撤退します。"));
    assert.ok(!war.includes("`${activeArmyName} の${actionName}！`"));

});

test('大名家滅亡履歴は滅亡家と攻略家を関連勢力として一度だけ記録する', () => {
    const life = read('js/life_system.js');
    assert.ok(life.includes('if (!clan || clan.extinctionNotified) return'));
    assert.ok(life.includes('clan.extinctionNotified = true'));
    assert.ok(life.includes("category: 'extinction'"));
    assert.ok(life.includes('clanIds: [clanId, killerClanId]'));
});

test('PC攻城戦は部隊戦力を主役にしつつ部隊長3能力を既存ランク表示で補助表示する', () => {
    const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
    const css = fs.readFileSync(path.join(ROOT, 'css/style.css'), 'utf8');
    const ui = fs.readFileSync(path.join(ROOT, 'js/ui.js'), 'utf8');

    [
        'war-atk-leader-abilities',
        'war-def-leader-abilities',
        'war-atk-self-reinf-leader-abilities',
        'war-atk-ally-reinf-leader-abilities',
        'war-def-self-reinf-leader-abilities',
        'war-def-ally-reinf-leader-abilities'
    ].forEach(id => assert.ok(html.includes(`id="${id}"`), `${id} が必要`));

    assert.ok(ui.includes("['統率', busho.leadership]"));
    assert.ok(ui.includes("['武勇', busho.strength]"));
    assert.ok(ui.includes("['智謀', busho.intelligence]"));
    assert.ok(ui.includes('StatPresenter.toGradeHTML(value)'), '能力ランクは StatPresenter を共用する');
    assert.ok(css.includes('grid-template-columns: 62px 76px minmax(0, 1fr)'));
    assert.ok(css.includes('#war-modal .war-leader-abilities {\n    display: none;'), 'スマホ既定では能力欄を表示しない');
});

test('地図上の所有変更・戦闘演出中はAI/月末処理テキストを共通部品で退避する', () => {
    const map = read('js/ui_map.js');
    const independence = read('js/independence_system.js');

    assert.ok(map.includes('async withAIGuardTextHiddenForMapEffect(task)'));
    assert.ok(map.includes('this.hideAIGuardText();'));
    assert.ok(map.includes('this.restoreAIGuardText();'));
    assert.ok(map.includes('async playBattleBlink(castleIdOrIds, colorA, colorB, durationMs, options = {}) {\n        return this.withAIGuardTextHiddenForMapEffect(async () => {'));
    assert.ok(map.includes('async playCaptureEffect(castleIdOrIds, onHalfway, options = {}) {\n        return this.withAIGuardTextHiddenForMapEffect(async () => {'));
    assert.ok(independence.includes('await this.game.ui.playBattleBlink(changedCastleIds, oldColor, newColorRgb, 1000);'));
    assert.ok(independence.includes('await this.game.ui.playCaptureEffect(changedCastleIds, applyNewClanColor);'));
});

test('タイトル版表示は GameConfig.Meta.Version を正本にする', () => {
    const html = read('index.html');
    const bootstrap = read('js/app_bootstrap.js');
    assert.ok(html.includes('id="title-version"'));
    assert.ok(!html.includes('ver. r102'));
    assert.ok(bootstrap.includes('window.GameConfig?.Meta?.Version'));
});

test('設定値参照側に独自フォールバック値を残さない', () => {
    const jsFiles = [];
    const walk = dir => {
        for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
            const full = path.join(dir, entry.name);
            if (entry.isDirectory()) walk(full);
            else if (entry.name.endsWith('.js') && !entry.name.endsWith('.min.js')) jsFiles.push(full);
        }
    };
    walk(path.join(ROOT, 'js'));
    const pattern = /(?:MainParams|WarParams|AIParams)\.[A-Za-z0-9_.]+\s*(?:\|\||\?\?)/g;
    const offenders = [];
    for (const file of jsFiles) {
        const matches = fs.readFileSync(file, 'utf8').match(pattern);
        if (matches) offenders.push(`${path.relative(ROOT, file)}: ${matches.join(', ')}`);
    }
    assert.deepStrictEqual(offenders, []);
});



test('状態の意味判定は共通Rulesを正本として使える', () => {
    const ctx = createContext();
    loadScript(ctx, 'js/constants.js');
    const B = ctx.GameConstants.BushoStatus;
    const D = ctx.GameConstants.DiplomacyStatus;

    assert.strictEqual(ctx.BushoStatusRules.isActive({ status: B.ACTIVE }), true);
    assert.strictEqual(ctx.BushoStatusRules.isRonin(B.RONIN), true);
    assert.strictEqual(ctx.LifeStatusRules.isPresent({ status: B.ACTIVE }), true);
    assert.strictEqual(ctx.LifeStatusRules.isPresent({ status: B.DEAD }), false);
    assert.strictEqual(ctx.LifeStatusRules.isUnavailable({ status: B.UNBORN }), true);

    assert.strictEqual(ctx.DiplomacyRules.isAllianceOrVassal(D.ALLIANCE), true);
    assert.strictEqual(ctx.DiplomacyRules.isAllianceOrVassal(D.FRIENDLY), false);
    assert.strictEqual(ctx.DiplomacyRules.isFriendly(D.FRIENDLY), true);
    assert.strictEqual(ctx.DiplomacyRules.isPeaceful(D.TRUCE), true);
    assert.strictEqual(ctx.DiplomacyRules.isProtectedFromImmediateAttack(D.TRUCE), true);
    assert.strictEqual(ctx.DiplomacyRules.isBasicSentimentStatus(D.NORMAL), true);
    assert.strictEqual(ctx.DiplomacyRules.isBasicSentimentStatus(D.ALLIANCE), false);
});

test('実行時コードは武将active/ronin/dead/unbornを文字列で直接比較しない', () => {
    const allowed = new Set(['js/constants.js', 'js/models.js', 'js/data_manager.js']);
    const offenders = [];
    const walk = dir => {
        for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
            const full = path.join(dir, entry.name);
            if (entry.isDirectory()) walk(full);
            else if (entry.name.endsWith('.js') && !entry.name.endsWith('.min.js')) {
                const rel = path.relative(ROOT, full).replace(/\\/g, '/');
                if (allowed.has(rel)) continue;
                const lines = fs.readFileSync(full, 'utf8').split(/\r?\n/);
                lines.forEach((line, index) => {
                    if (/\.status\s*(?:===|!==)\s*['"](?:active|ronin|dead|unborn)['"]/.test(line)) {
                        offenders.push(`${rel}:${index + 1}`);
                    }
                });
            }
        }
    };
    walk(path.join(ROOT, 'js'));
    assert.deepStrictEqual(offenders, [], `状態文字列の直接比較: ${offenders.join(', ')}`);
});

test('同盟・支配・従属の集合判定を各Scriptへ複製しない', () => {
    const offenders = [];
    const patterns = [
        /\[['"]同盟['"],\s*['"]支配['"],\s*['"]従属['"]\]\.includes/,
        /\[['"]支配['"],\s*['"]従属['"],\s*['"]同盟['"]\]\.includes/,
        /\[['"]同盟['"],\s*['"]従属['"],\s*['"]支配['"]\]\.includes/
    ];
    for (const file of fs.readdirSync(path.join(ROOT, 'js'), { withFileTypes: true })) {
        if (!file.isFile() || !file.name.endsWith('.js') || file.name.endsWith('.min.js')) continue;
        const rel = `js/${file.name}`;
        if (rel === 'js/constants.js') continue;
        const source = read(rel);
        if (patterns.some(pattern => pattern.test(source))) offenders.push(rel);
    }
    const eventDir = path.join(ROOT, 'js', 'event');
    for (const name of fs.readdirSync(eventDir)) {
        if (!name.endsWith('.js')) continue;
        const rel = `js/event/${name}`;
        const source = read(rel);
        if (patterns.some(pattern => pattern.test(source))) offenders.push(rel);
    }
    assert.deepStrictEqual(offenders, []);
});

// ---------------------------------------------------------------------------
// ユーザー設定
// ---------------------------------------------------------------------------
test('UserSettings は GameConfig と分離され、localStorage の正本になる', () => {
    const values = new Map([
        ['aiWarNotify', 'false'],
        ['historicalEvent', 'true'],
        ['autoSave', 'false'],
        ['userBgmVolume', '0'],
        ['userSeVolume', '0.35']
    ]);
    const storage = {
        getItem: key => values.has(key) ? values.get(key) : null,
        setItem: (key, value) => values.set(key, String(value))
    };
    const ctx = createContext({ localStorage: storage });
    loadScript(ctx, 'js/user_settings.js');

    assert.strictEqual(ctx.UserSettings.aiWarNotify, false);
    assert.strictEqual(ctx.UserSettings.historicalEvent, true);
    assert.strictEqual(ctx.UserSettings.autoSave, false);
    assert.strictEqual(ctx.UserSettings.bgmVolume, 0, 'ミュート(0)を再読込時に100%へ戻さない');
    assert.strictEqual(ctx.UserSettings.seVolume, 0.35);

    ctx.UserSettings.setAutoSave(true);
    ctx.UserSettings.setBgmVolume(0.6);
    assert.strictEqual(values.get('autoSave'), 'true');
    assert.strictEqual(values.get('userBgmVolume'), '0.6');

    assert.ok(!read('js/ui_settings.js').includes('window.GameConfig.'));
    assert.ok(!read('js/ui_settings.js').includes('eventManager'), '設定UIは歴史常駐効果の実処理を直接呼ばない');
    assert.ok(read('js/user_settings.js').includes("'user-setting-changed'"), 'UserSettings が設定変更を通知する');
    assert.ok(read('js/game.js').includes("detail.key !== 'historicalEvent'"), 'GameManager が歴史イベント設定変更だけを EventManager へルーティングする');
    assert.ok(!read('js/audio.js').includes('localStorage.'));
});

test('ユーザー設定キーは user_settings.js 以外で直接localStorage操作しない', () => {
    const keys = ['aiWarNotify', 'historicalEvent', 'autoSave', 'userBgmVolume', 'userSeVolume'];
    const offenders = [];
    const walk = dir => {
        for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
            const full = path.join(dir, entry.name);
            if (entry.isDirectory()) walk(full);
            else if (entry.name.endsWith('.js') && !entry.name.endsWith('.min.js')) {
                const rel = path.relative(ROOT, full).replace(/\\/g, '/');
                if (rel === 'js/user_settings.js') continue;
                const source = fs.readFileSync(full, 'utf8');
                if (keys.some(key => new RegExp(`localStorage\\.(?:getItem|setItem)\\(['"]${key}['"]`).test(source))) {
                    offenders.push(rel);
                }
            }
        }
    };
    walk(path.join(ROOT, 'js'));
    assert.deepStrictEqual(offenders, []);
});

// ---------------------------------------------------------------------------
// 地図・兵力・援軍
// ---------------------------------------------------------------------------
test('MapGraphService は同盟/支配/従属領だけを中継通過できる', () => {
    const ctx = createContext();
    loadScript(ctx, 'js/constants.js');
    loadScript(ctx, 'js/map_graph.js');
    const castles = [
        { id: 1, ownerClan: 1, adjacentCastleIds: [2] },
        { id: 2, ownerClan: 2, adjacentCastleIds: [1, 3] },
        { id: 3, ownerClan: 3, adjacentCastleIds: [2] }
    ];
    const relations = new Map();
    const game = {
        getCastle: id => castles.find(c => c.id === Number(id)),
        getRelation: (a, b) => relations.get(`${a}:${b}`) || null
    };
    relations.set('1:2', { status: '同盟' });
    assert.strictEqual(ctx.MapGraphService.isReachable(game, castles[0], castles[2], 1), true);
    relations.set('1:2', { status: '友好' });
    assert.strictEqual(ctx.MapGraphService.isReachable(game, castles[0], castles[2], 1), false);
});


test('MapGraphService のstatic探索も片側記載の隣接を双方向として扱う', () => {
    const ctx = createContext();
    loadScript(ctx, 'js/constants.js');
    loadScript(ctx, 'js/map_graph.js');
    const castles = [
        { id: 1, ownerClan: 1, adjacentCastleIds: [], seaRouteIds: [] },
        { id: 2, ownerClan: 2, adjacentCastleIds: [1, 3], seaRouteIds: [1] },
        { id: 3, ownerClan: 1, adjacentCastleIds: [], seaRouteIds: [] }
    ];
    const relations = new Map([['1:2', { status: '同盟' }]]);
    const game = {
        castles,
        getCastle: id => castles.find(c => c.id === Number(id)),
        getRelation: (a, b) => relations.get(`${a}:${b}`) || null
    };
    game.mapGraph = new ctx.MapGraphService(game);

    assert.deepStrictEqual(Array.from(game.mapGraph.getAdjacentIds(castles[0])), [2]);
    assert.strictEqual(ctx.MapGraphService.isReachable(game, castles[0], castles[2], 1), true);
    assert.strictEqual(ctx.MapGraphService.isSeaRoute(game, castles[0], castles[1], 1), true, '海路情報も逆側だけの記載を認識する');
});


test('MapGraphService の経路探索は同一勢力の通行可否を1探索内だけ再利用する', () => {
    const ctx = createContext();
    loadScript(ctx, 'js/constants.js');
    loadScript(ctx, 'js/map_graph.js');
    const castles = [
        { id: 1, ownerClan: 1, adjacentCastleIds: [2], seaRouteIds: [] },
        { id: 2, ownerClan: 2, adjacentCastleIds: [1, 3], seaRouteIds: [] },
        { id: 3, ownerClan: 2, adjacentCastleIds: [2, 4], seaRouteIds: [] },
        { id: 4, ownerClan: 3, adjacentCastleIds: [3], seaRouteIds: [3] }
    ];
    const relationCalls = new Map();
    const game = {
        castles,
        getCastle: id => castles.find(c => c.id === Number(id)),
        getRelation: (a, b) => {
            const key = `${a}:${b}`;
            relationCalls.set(key, (relationCalls.get(key) || 0) + 1);
            return Number(b) === 2 ? { status: '同盟' } : null;
        }
    };
    game.mapGraph = new ctx.MapGraphService(game);

    assert.strictEqual(ctx.MapGraphService.isReachable(game, castles[0], castles[3], 1), true);
    assert.strictEqual(relationCalls.get('1:2'), 1, '同じ中継勢力の外交判定を城ごとに繰り返さない');

    relationCalls.clear();
    assert.strictEqual(ctx.MapGraphService.isSeaRoute(game, castles[0], castles[3], 1), true);
    assert.strictEqual(relationCalls.get('1:2'), 1, '海路判定でも同じ探索内の通行可否だけを再利用する');
});

test('TroopAllocationService の配分合計は総兵数と一致する', () => {
    const ctx = createContext();
    loadScript(ctx, 'js/config.js');
    loadScript(ctx, 'js/skill_manager.js');
    loadScript(ctx, 'js/troop_allocation.js');
    const bushos = [
        { id: 1, leadership: 90, strength: 85, aptKiba: 'C', aptTeppo: 'C' },
        { id: 2, leadership: 70, strength: 80, aptKiba: 'B', aptTeppo: 'C' },
        { id: 3, leadership: 60, strength: 60, aptKiba: 'C', aptTeppo: 'B' }
    ];
    const result = ctx.TroopAllocationService.autoDivideSoldiers({
        bushos, totalSoldiers: 5000, totalHorses: 1800, totalGuns: 1200, isPlayerUI: false
    });
    assert.strictEqual(result.length, 3);
    assert.strictEqual(result.reduce((sum, row) => sum + row.soldiers, 0), 5000);
    assert.ok(result.every(row => ['ashigaru', 'kiba', 'teppo'].includes(row.troopType)));
});


test('野戦前の自動編成は能力を主軸にしつつ馬術・砲術適性を兵科割当に反映する', () => {
    const ctx = createContext();
    loadScript(ctx, 'js/config.js');
    loadScript(ctx, 'js/skill_manager.js');
    loadScript(ctx, 'js/troop_allocation.js');
    const bushos = [
        { id: 1, leadership: 90, strength: 90, aptKiba: 'E', aptTeppo: 'E' },
        { id: 2, leadership: 80, strength: 80, aptKiba: 'S', aptTeppo: 'E' },
        { id: 3, leadership: 80, strength: 80, aptKiba: 'E', aptTeppo: 'S' }
    ];
    const result = ctx.TroopAllocationService.autoDivideSoldiers({
        bushos, totalSoldiers: 3000, totalHorses: 1000, totalGuns: 1000, isPlayerUI: true
    });
    const byId = new Map(result.map(row => [row.busho.id, row]));
    assert.strictEqual(byId.get(2).troopType, 'kiba', '馬術Sの武将へ騎馬を優先する');
    assert.strictEqual(byId.get(3).troopType, 'teppo', '砲術Sの武将へ鉄砲を優先する');
    assert.strictEqual(result.reduce((sum, row) => sum + row.soldiers, 0), 3000);
});

test('ReinforcementService は中央設定の比率で資源を消費する', () => {
    const ctx = createContext();
    loadScript(ctx, 'js/config.js');
    loadScript(ctx, 'js/constants.js');
    loadScript(ctx, 'js/reinforcement_service.js');
    const bushos = [
        { id: 1, clan: 1, status: 'active', strength: 90 },
        { id: 2, clan: 1, status: 'active', strength: 70 },
        { id: 3, clan: 1, status: 'active', strength: 50 }
    ];
    const castle = { id: 10, ownerClan: 1, soldiers: 6000, rice: 8000, horses: 3000, guns: 1000, morale: 80, training: 90 };
    const game = { getCastleBushos: () => bushos };
    const service = new ctx.ReinforcementService(game);
    const data = service.createAutoSelfReinforcement(castle);
    assert.strictEqual(data.soldiers, 3000);
    assert.strictEqual(data.bushos.length, 3);
    assert.strictEqual(castle.soldiers, 3000);
    assert.strictEqual(castle.rice, 5000);
    assert.ok(data.horses <= 1500 && data.guns <= 1500);
});


test('AI援軍受諾は攻守共通の外交判定を使い、大雪・支配・表裏比興を同じ規則で処理する', () => {
    let canDeclineBoss = false;
    const ctx = createContext({
        SkillManager: {
            canDeclineBossReinforcement: () => canDeclineBoss
        }
    });
    loadScript(ctx, 'js/diplomacy.js');
    const DiplomacyManager = vm.runInContext('DiplomacyManager', ctx);
    const manager = new DiplomacyManager({});

    manager.getRelation = () => ({ status: '同盟' });
    manager.getReinforcementAcceptProb = () => 40;

    let result = manager.checkAIReinforcementAcceptance({
        requesterClanId: 1, helperForceId: 2, enemyClanId: 3,
        requesterTotalSoldiers: 5000, enemyTotalSoldiers: 5000
    }, () => 0.39);
    assert.strictEqual(result.probability, 40);
    assert.strictEqual(result.accepted, true);

    result = manager.checkAIReinforcementAcceptance({
        requesterClanId: 1, helperForceId: 2, enemyClanId: 3,
        requesterTotalSoldiers: 5000, enemyTotalSoldiers: 5000
    }, () => 0.40);
    assert.strictEqual(result.accepted, false);

    result = manager.checkAIReinforcementAcceptance({
        requesterClanId: 1, helperForceId: 2, enemyClanId: 3,
        requesterTotalSoldiers: 5000, enemyTotalSoldiers: 5000, isHeavySnow: true
    }, () => 0);
    assert.strictEqual(result.probability, 0);
    assert.strictEqual(result.blockedByHeavySnow, true);
    assert.strictEqual(result.accepted, false);

    manager.getRelation = () => ({ status: '支配' });
    canDeclineBoss = false;
    result = manager.checkAIReinforcementAcceptance({
        requesterClanId: 1, helperForceId: 2, enemyClanId: 3,
        requesterTotalSoldiers: 5000, enemyTotalSoldiers: 5000, isHeavySnow: true
    }, () => 0.99);
    assert.strictEqual(result.forcedByDominance, true);
    assert.strictEqual(result.probability, 100);
    assert.strictEqual(result.accepted, true);

    canDeclineBoss = true;
    result = manager.checkAIReinforcementAcceptance({
        requesterClanId: 1, helperForceId: 2, enemyClanId: 3,
        requesterTotalSoldiers: 5000, enemyTotalSoldiers: 5000, isHeavySnow: true
    }, () => 0);
    assert.strictEqual(result.forcedByDominance, false);
    assert.strictEqual(result.blockedByHeavySnow, true);
    assert.strictEqual(result.accepted, false);
});

test('援軍受諾確率の生計算は DiplomacyManager 外から直接呼ばない', () => {
    const offenders = [];
    const walk = dir => {
        for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
            const full = path.join(dir, entry.name);
            if (entry.isDirectory()) walk(full);
            else if (entry.name.endsWith('.js') && !entry.name.endsWith('.min.js')) {
                const rel = path.relative(ROOT, full).replace(/\\/g, '/');
                if (rel === 'js/diplomacy.js') continue;
                if (/getReinforcementAcceptProb\s*\(/.test(fs.readFileSync(full, 'utf8'))) offenders.push(rel);
            }
        }
    };
    walk(path.join(ROOT, 'js'));
    assert.deepStrictEqual(offenders, []);

    const prepSource = read('js/war_preparation_controller.js');
    const warEffortSource = read('js/war_effort.js');
    assert.ok(prepSource.includes('checkAIReinforcementAcceptance'));
    assert.ok(warEffortSource.includes('checkAIReinforcementAcceptance'));
    assert.ok(warEffortSource.includes('getAIReinforcementAcceptanceInfo'));
});

// ---------------------------------------------------------------------------
// SkillManager 境界
// ---------------------------------------------------------------------------
test('SkillManager だけが技能文字列を分解し、天下布武は退き巧者として扱われる', () => {
    const ctx = createContext();
    loadScript(ctx, 'js/skill_manager.js');
    const SkillManager = vm.runInContext('SkillManager', ctx);
    const busho = { id: 1, skill: '天下布武|猛将' };
    assert.deepStrictEqual(Array.from(SkillManager.getSkillList(busho)), ['天下布武', '猛将']);
    assert.strictEqual(SkillManager.isRetreatMaster(busho, null), true);
    assert.strictEqual(SkillManager.calcRetreatRecoveryRate([busho], true, 0.2, 0.3, null), 0.6);

    const offenders = [];
    for (const name of fs.readdirSync(path.join(ROOT, 'js'))) {
        if (!name.endsWith('.js') || name === 'skill_manager.js' || name.endsWith('.min.js')) continue;
        const source = read(`js/${name}`);
        if (/\.skill\s*\.\s*(?:split|includes)\s*\(/.test(source)) offenders.push(name);
    }
    for (const name of fs.readdirSync(path.join(ROOT, 'js/event'))) {
        if (!name.endsWith('.js')) continue;
        const source = read(`js/event/${name}`);
        if (/\.skill\s*\.\s*(?:split|includes)\s*\(/.test(source)) offenders.push(`event/${name}`);
    }
    assert.deepStrictEqual(offenders, []);
});


test('AIの野戦・籠城判断は野戦寄り固有技能を漏らさず、両戦場共通の赤備えでは籠城へ偏らない', () => {
    const ctx = createContext();
    loadScript(ctx, 'js/skill_manager.js');
    const SkillManager = vm.runInContext('SkillManager', ctx);
    for (const skill of ['甲斐の虎', '越後の龍', '三河の鹿', '鎮西一', '雷神', '奥羽の驍将']) {
        assert.strictEqual(SkillManager.hasFieldWarAdvantageSkill([{ id: 1, skill }], null), true, `${skill} は野戦寄りとして評価する`);
    }
    assert.strictEqual(SkillManager.hasSiegeDefenseAdvantageSkill([{ id: 1, skill: '上州の黄斑' }], null), true);
    assert.strictEqual(SkillManager.hasSiegeDefenseAdvantageSkill([{ id: 1, skill: '謀神' }], null), true);
    assert.strictEqual(SkillManager.hasSiegeDefenseAdvantageSkill([{ id: 1, skill: '赤備え' }], null), false, '野戦・攻城戦共通効果だけでは籠城寄りにしない');
});

// ---------------------------------------------------------------------------
// SelectorModal 共通View
// ---------------------------------------------------------------------------
test('SelectorModalView がガワ・戻る・決定状態を一元初期化する', () => {
    const modal = fakeElement('selector-modal');
    modal.classList.add('hidden');
    const title = fakeElement('selector-title');
    const list = fakeElement('selector-list');
    const wrapper = fakeElement('selector-list-wrapper');
    const contextEl = fakeElement('selector-context-info');
    const tabs = fakeElement('selector-tabs');
    tabs.classList.add('busho-detail-tabs');
    const confirm = fakeElement('selector-confirm-btn');
    const back = fakeElement('selector-back-btn');
    const content = fakeElement('modal-content');
    modal.querySelector = selector => selector === '.modal-content' ? content : (selector === '.btn-secondary' ? back : null);
    const byId = new Map([
        ['selector-modal', modal], ['selector-title', title], ['selector-list', list], ['selector-list-wrapper', wrapper],
        ['selector-context-info', contextEl], ['selector-tabs', tabs], ['selector-confirm-btn', confirm], ['selector-back-btn', back]
    ]);
    const document = { getElementById: id => byId.get(id) || null };
    const ctx = createContext({ document });
    loadScript(ctx, 'js/selector_modal_view.js');
    let backed = 0;
    let confirmed = 0;
    const view = new ctx.SelectorModalView({ selectorModal: modal, selectorList: list, selectorContextInfo: contextEl, selectorConfirmBtn: confirm });
    view.open({
        title: '武将情報', tabsHtml: '<button>基本</button>', backLabel: '戻る', onBack: () => backed++,
        onConfirm: () => confirmed++, confirmDisabled: true
    });
    assert.strictEqual(modal.classList.contains('hidden'), false);
    assert.strictEqual(title.textContent, '武将情報');
    assert.strictEqual(tabs.classList.contains('hidden'), false);
    assert.strictEqual(tabs.classList.contains('busho-detail-tabs'), false);
    assert.strictEqual(confirm.disabled, true);
    confirm.style.opacity = '0.5';
    confirm.style.cursor = 'not-allowed';
    view.setConfirmEnabled(true);
    assert.strictEqual(confirm.disabled, false);
    assert.strictEqual(confirm.style.opacity, '', '再有効化時に古い透明度を残さない');
    assert.strictEqual(confirm.style.cursor, '', '再有効化時に古いcursorを残さない');
    assert.strictEqual(back.textContent, '戻る');
    back.onclick();
    confirm.onclick();
    assert.strictEqual(backed, 1);
    assert.strictEqual(confirmed, 1);

    view.open({ title: '拠点情報', backLabel: '閉じる', onBack: () => backed++ });
    assert.strictEqual(tabs.classList.contains('hidden'), true);
    assert.strictEqual(confirm.classList.contains('hidden'), true);
    assert.strictEqual(confirm.onclick, null);
});

test('UI情報画面は selector-modal の共通DOMを個別取得しない', () => {
    const files = ['js/ui_info.js', 'js/ui_info_busho.js', 'js/ui_info_kyoten.js'];
    const forbidden = [
        /const\s+modal\s*=\s*document\.getElementById\(['"]selector-modal['"]\)/,
        /document\.querySelector\(['"]#selector-modal \.btn-secondary['"]\)/,
        /document\.getElementById\(['"]selector-title['"]\)/
    ];
    const offenders = [];
    for (const file of files) {
        const source = read(file);
        for (const pattern of forbidden) if (pattern.test(source)) offenders.push(`${file}: ${pattern}`);
    }
    assert.deepStrictEqual(offenders, []);
});

test('selector 戻るボタンは HTML inline onclick を持たない', () => {
    const html = read('index.html');
    const match = html.match(/<button[^>]*id=["']selector-back-btn["'][^>]*>/);
    assert.ok(match, 'selector-back-btn が見つかりません');
    assert.ok(!/onclick\s*=/.test(match[0]));
});

test('index.html に inline onclick を残さない', () => {
    const html = read('index.html');
    assert.strictEqual((html.match(/onclick\s*=/g) || []).length, 0);
});



test('ui_slider.js は静的 inline style 属性を生成しない', () => {
    const source = read('js/ui_slider.js');
    assert.strictEqual((source.match(/style=\"/g) || []).length, 0);
});


test('部隊編成はPCカードとスマホ循環ボタンで能力・適性を見やすく表示する', () => {
    const source = read('js/ui_slider.js');
    assert.ok(source.includes("const isPcDivide = document.body.classList.contains('is-pc')"), 'PC/スマホで編成UIを分ける');
    assert.ok(source.includes("StatPresenter.toAptitudeHTML(rank || 'E')"), '適性ランクは共通のランク表示を使う');
    assert.ok(source.includes('class="divide-card-abilities"'), 'PCカードに能力情報欄を設ける');
    assert.ok(source.includes('class="divide-info-label">統率</span>'), 'PCカードに統率を表示する');
    assert.ok(source.includes('class="divide-info-label">武勇</span>'), 'PCカードに武勇を表示する');
    assert.ok(source.includes('class="divide-info-label">智謀</span>'), 'PCカードに智謀を表示する');
    assert.ok(source.includes("['足軽', busho.aptAshigaru]"), '適性名は足などへ省略せず足軽と表示する');
    assert.ok(source.includes("['馬術', busho.aptKiba]"), '馬術を正式名称で表示する');
    assert.ok(source.includes("['弓術', busho.aptYumi]"), '弓術を正式名称で表示する');
    assert.ok(source.includes("['砲術', busho.aptTeppo]"), '砲術を正式名称で表示する');
    assert.ok(source.includes("items.push(['操船', busho.aptMaritime])"), '海戦では操船適性を情報欄へ追加する');
    assert.ok(source.includes('class="troop-type-btn troop-type-cycle-btn active"'), 'スマホは兵科切替ボタンを1個だけにする');
    assert.ok(source.includes("isSeaBattleForDivide ? ['ashigaru', 'teppo'] : ['ashigaru', 'kiba', 'teppo']"), 'スマホ海戦では騎馬を循環対象から外す');
    assert.ok(source.includes("if (aptitudeSummary) aptitudeSummary.innerHTML = aptitudeSummaryHtml(b, nextType, isSeaBattleForDivide)"), 'スマホは兵科切替と同時に適性表示を更新する');
    assert.ok(source.includes("listEl.classList.toggle('divide-list-two-column', isPcDivide && bushos.length > 3)"), 'PCで4人以上なら左3・右2の2列配置を使う');
});

test('野戦の個別部隊情報は固定寸法で全適性と既存の名前圧縮規則を使う', () => {
    const source = read('js/field_war.js');
    const css = read('css/style.css');
    assert.ok(source.includes("['足軽', unitBusho && unitBusho.aptAshigaru]"));
    assert.ok(source.includes("['馬術', unitBusho && unitBusho.aptKiba]"));
    assert.ok(source.includes("['弓術', unitBusho && unitBusho.aptYumi]"));
    assert.ok(source.includes("['砲術', unitBusho && unitBusho.aptTeppo]"));
    assert.ok(source.includes("['操船', unitBusho && unitBusho.aptMaritime]"));
    assert.ok(source.includes('this.game.ui._getCompressedTextHtml(value, threshold, isStrong)'), '一覧と同じ文字圧縮規則を再利用する');
    assert.ok(source.includes('class="fw-unit-affiliation"'), '勢力名を武将名・兵科から分離する');
    assert.ok(source.includes('fw-unit-type-value'), '兵科は名前の右ではなく固定情報行へ置く');
    assert.ok(source.includes('class="fw-unit-aptitudes"'), '能力の下に全適性の固定欄を設ける');
    assert.ok(css.includes('.fw-floating-unit { position: absolute; width: 280px; min-width: 280px; max-width: 280px; height: 190px; min-height: 190px; max-height: 190px;'), '部隊情報の縦横寸法を固定する');
    assert.ok(css.includes('grid-template-columns: repeat(5, minmax(0, 1fr))'), '5適性を固定グリッドで表示する');
});

test('index.html は inline script を持たず、起動処理を app_bootstrap.js に集約する', () => {
    const html = read('index.html');
    assert.strictEqual((html.match(/<script(?![^>]*\bsrc=)[^>]*>/g) || []).length, 0);
    assert.ok(html.includes('src="js/app_bootstrap.js"'));
    assert.ok(!html.includes('src="js/ui_bindings.js"'));
    assert.ok(fs.existsSync(path.join(ROOT, 'js/app_bootstrap.js')));
    assert.ok(!fs.existsSync(path.join(ROOT, 'js/ui_bindings.js')));
});

test('武将情報JSは静的inline style / inline eventを持たない', () => {
    const source = read('js/ui_info_busho.js');
    const styles = [...source.matchAll(/style="([^"]*)"/g)].map(m => m[1].trim());
    assert.ok(styles.length > 0, '能力ゲージ等の動的CSS変数まで消えていないか確認してください');
    assert.ok(styles.every(value => value.startsWith('--')), `静的styleが残っています: ${styles.filter(value => !value.startsWith('--')).join(' | ')}`);
    assert.strictEqual((source.match(/<[^>]*\bonclick\s*=/g) || []).length, 0);
    assert.strictEqual((source.match(/<[^>]*\bonerror\s*=/g) || []).length, 0);
});

test('拠点情報JSは静的inline style / inline eventを持たない', () => {
    const source = read('js/ui_info_kyoten.js');
    const styles = [...source.matchAll(/style="([^"]*)"/g)].map(m => m[1].trim());
    assert.ok(styles.every(value => value.startsWith('--')), `静的styleが残っています: ${styles.filter(value => !value.startsWith('--')).join(' | ')}`);
    assert.strictEqual((source.match(/<[^>]*\bonclick\s*=/g) || []).length, 0);
    assert.strictEqual((source.match(/<[^>]*\bonerror\s*=/g) || []).length, 0);
});

test('ui_info.js は静的inline styleと文字列onclickを生成しない', () => {
    const source = read('js/ui_info.js');
    const styles = [...source.matchAll(/style="([^"]*)"/g)].map(m => m[1].trim());
    assert.ok(styles.length > 0, '動的CSS変数まで消えていないか確認してください');
    assert.ok(styles.every(value => value.startsWith('--')), `静的styleが残っています: ${styles.filter(value => !value.startsWith('--')).join(' | ')}`);
    assert.strictEqual((source.match(/<[^>]*\bonclick\s*=/g) || []).length, 0);
    assert.strictEqual((source.match(/<[^>]*\bonerror\s*=/g) || []).length, 0);
});

test('一覧行のクリック処理は関数イベントに統一する', () => {
    for (const file of ['js/ui_info.js', 'js/ui_info_busho.js', 'js/ui_info_kyoten.js']) {
        const source = read(file);
        assert.ok(!/onClick\s*:\s*`/.test(source), `${file} に文字列onClickがあります`);
        assert.ok(!/onClickStr\s*=\s*`/.test(source), `${file} に文字列onClickStrがあります`);
    }
});

test('主要情報詳細は共通CSSクラスを使い、HTML inline eventを持たない', () => {
    const source = read('js/ui_info.js');
    const section = (start, end) => source.slice(source.indexOf('\n    ' + start), source.indexOf('\n    ' + end, source.indexOf('\n    ' + start)));
    const daimyo = section('_renderDaimyoDetail(', 'showDiplomacyList(');
    const kunishu = section('_renderKunishuDetail(', 'showKunishuList(');
    const princess = source.slice(source.indexOf('\n    _renderPrincessDetail('));
    for (const [name, text] of [['daimyo', daimyo], ['kunishu', kunishu], ['princess', princess]]) {
        assert.strictEqual((text.match(/style="/g) || []).length, 0, `${name} detail に静的inline styleがあります`);
        assert.strictEqual((text.match(/onerror\s*=/g) || []).length, 0, `${name} detail にinline onerrorがあります`);
    }
    assert.ok(daimyo.includes('info-detail-wrapper'));
    assert.ok(kunishu.includes('info-detail-wrapper'));
    assert.ok(princess.includes('busho-detail-container'));
});

test('捕虜・結果画面の固定ボタンは inline onclick を生成しない', () => {
    const info = read('js/ui_info.js');
    const ui = read('js/ui.js');
    assert.ok(!info.includes('handleDaimyoPrisonerAction(\'hire\')">'));
    assert.ok(!info.includes('handleDaimyoPrisonerAction(\'release\')">'));
    assert.ok(!ui.includes('onclick="window.GameApp.ui.closeResultModal()"'));
});

test('コード構成ガイドが存在し、主要な専門部署を索引化している', () => {
    const doc = read('ARCHITECTURE.md');
    for (const name of ['app_bootstrap.js', 'skill_manager.js', 'turn_manager.js', 'selector_modal_view.js', 'troop_allocation.js']) {
        assert.ok(doc.includes(name), `${name} がARCHITECTURE.mdにありません`);
    }
});

test('バランスシミュレーターが正式ツールとして配置されている', () => {
    const required = [
        'tools/simulation/player_focus_sim.py',
        'tools/simulation/test_player_focus_sim.py',
        'tools/simulation/README.md'
    ];
    const missing = required.filter(file => !fs.existsSync(path.join(ROOT, file)));
    assert.deepStrictEqual(missing, []);
    const source = read('tools/simulation/player_focus_sim.py');
    assert.ok(!source.includes('/mnt/data/sengoku_sim/'), '固定された作業環境パスが残っています');
    assert.ok(source.includes("SCENARIO_KEY != '1560_okehazama'"), '桶狭間固有イベントのシナリオ境界がありません');
});

// 武将能力ゲージ: 100の枠は120予約領域の100/120に留め、bar-bg側で100%上書きしない
test('busho stat gauge reserves 101-120 breakthrough space', () => {
    const css = fs.readFileSync(path.join(ROOT, 'css/style.css'), 'utf8');
    assert(/\.busho-detail-bar-base\s*\{[^}]*width:\s*calc\(100%\s*\*\s*100\s*\/\s*120\)/s.test(css), '100/120 base width missing');
    const barBg = css.match(/\.bar-bg-busho\s*\{([^}]*)\}/s);
    assert(barBg, '.bar-bg-busho rule missing');
    assert(!/width:\s*100%/.test(barBg[1]), '.bar-bg-busho must not override the 100/120 base width');
});

test('武将詳細の能力ゲージを固定80pxへ戻さない', () => {
    const css = read('css/style.css');
    const wrapperMatch = css.match(/\.busho-stat-bar-wrapper\s*\{([^}]*)\}/);
    assert.ok(wrapperMatch, '.busho-stat-bar-wrapper が見つかりません');
    const body = wrapperMatch[1];
    assert.ok(/max-width\s*:\s*none\s*;/.test(body), '能力ゲージの max-width:none がありません');
    assert.ok(!/max-width\s*:\s*80px\s*;/.test(body), '旧80px上限が復活しています');
    assert.ok(/flex\s*:\s*1\s*;/.test(body), '能力ゲージが残り幅を使う flex:1 ではありません');
    assert.ok(/overflow\s*:\s*visible\s*;/.test(body), '101以上のゲージが100の枠を突き破れる overflow:visible がありません');
    assert.ok(!/clip-path\s*:/.test(body), '能力ゲージの内側ラッパーにクリップがあり、限界突破演出を消す可能性があります');
    assert.ok(/\.busho-detail-stat-box\s*\{[^}]*overflow\s*:\s*hidden\s*;/s.test(css), '120の予約領域の外だけを止める能力値行の境界がありません');
    assert.ok(/\.busho-detail-bar-base\s*\{[^}]*width\s*:\s*calc\(100%\s*\*\s*100\s*\/\s*120\)\s*;/s.test(css), '能力100を基準に120までの飛び出し領域を予約する幅計算がありません');
    assert.ok(/\.bar-bg-busho\s*\{[^}]*overflow\s*:\s*visible\s*;/s.test(css), '100の通常枠から限界突破バーを外へ描画できません');
});

test('ビジュアル回帰テストの土台が配置されている', () => {
    for (const file of ['tests/run_visual_tests.js', 'tests/visual/busho_gauge.html', 'run_visual_tests.bat']) {
        assert.ok(fs.existsSync(path.join(ROOT, file)), `${file} がありません`);
    }
    const runner = read('tests/run_visual_tests.js');
    const fixture = read('tests/visual/busho_gauge.html');
    assert.ok(runner.includes('Emulation.setDeviceMetricsOverride'));
    assert.ok(runner.includes("[80, 100, 110, 120]"));
    assert.ok(fixture.includes('busho-stat-bar-wrapper'));
    assert.ok(fixture.includes('over-connected'));
});


// ---------------------------------------------------------------------------
// 重要データの書き換え境界
// ---------------------------------------------------------------------------
test('武将所属・配置と城所有者の直接代入は専門部署に限定する', () => {
    const jsFiles = [];
    const walk = dir => {
        for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
            const full = path.join(dir, entry.name);
            if (entry.isDirectory()) walk(full);
            else if (entry.name.endsWith('.js') && !entry.name.endsWith('.min.js')) jsFiles.push(full);
        }
    };
    walk(path.join(ROOT, 'js'));

    const allowedClan = new Set(['js/affiliation_system.js', 'js/models.js', 'js/data_manager.js']);
    const allowedOwner = new Set(['js/castle_manager.js', 'js/models.js']);
    const clanOffenders = [];
    const castleOffenders = [];
    const ownerOffenders = [];

    for (const file of jsFiles) {
        const rel = path.relative(ROOT, file).replace(/\\/g, '/');
        const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/);
        lines.forEach((line, index) => {
            if (!allowedClan.has(rel) && /\.clan\s*(?<![=!<>])=(?!=)/.test(line) && !/\.dataset\.clan\s*=/.test(line)) {
                clanOffenders.push(`${rel}:${index + 1}`);
            }
            if (!allowedClan.has(rel) && /\.castleId\s*(?<![=!<>])=(?!=)/.test(line)) {
                castleOffenders.push(`${rel}:${index + 1}`);
            }
            if (!allowedOwner.has(rel) && /\.ownerClan\s*(?<![=!<>])=(?!=)/.test(line)) {
                ownerOffenders.push(`${rel}:${index + 1}`);
            }
        });
    }
    assert.deepStrictEqual(clanOffenders, [], `clan直接代入: ${clanOffenders.join(', ')}`);
    assert.deepStrictEqual(castleOffenders, [], `castleId直接代入: ${castleOffenders.join(', ')}`);
    assert.deepStrictEqual(ownerOffenders, [], `ownerClan直接代入: ${ownerOffenders.join(', ')}`);
});

test('低レベル所属Setterは正規化し、城所有者Setterは索引バージョンを更新する', () => {
    const ctx = createContext({ PersonnelRules: { calcAffinityDiff: () => 0 } });
    loadScript(ctx, 'js/affiliation_system.js');
    loadScript(ctx, 'js/castle_manager.js');
    const AffiliationSystem = vm.runInContext('AffiliationSystem', ctx);
    const CastleManager = vm.runInContext('CastleManager', ctx);
    const game = { castleOwnershipVersion: 7 };
    const affiliation = new AffiliationSystem(game);
    const busho = { clan: 1, castleId: 10 };
    affiliation.setClanIdRaw(busho, '12');
    affiliation.setCastleIdRaw(busho, '34');
    assert.strictEqual(busho.clan, 12);
    assert.strictEqual(busho.castleId, 34);

    const castleManager = new CastleManager(game);
    const castle = { ownerClan: 2 };
    castleManager.setOwnerIdRaw(castle, '9');
    assert.strictEqual(castle.ownerClan, 9);
    assert.strictEqual(game.castleOwnershipVersion, 8);
});


test('軍師役職は所属変更で持ち越さず任命窓口が一勢力一人を保証する', () => {
    const ctx = createContext({
        PersonnelRules: { calcAffinityDiff: () => 0 },
        BushoStatusRules: { isActive: b => b.status === 'active' }
    });
    loadScript(ctx, 'js/affiliation_system.js');
    const AffiliationSystem = vm.runInContext('AffiliationSystem', ctx);
    const oldGunshi = { id: 1, clan: 1, status: 'active', isGunshi: true };
    const destinationGunshi = { id: 2, clan: 2, status: 'active', isGunshi: true };
    const candidate = { id: 3, clan: 2, status: 'active', isGunshi: false };
    const game = { bushos: [oldGunshi, destinationGunshi, candidate] };
    const affiliation = new AffiliationSystem(game);

    affiliation.setClanIdRaw(oldGunshi, 2);
    assert.strictEqual(oldGunshi.isGunshi, false, '別家へ移る時点で旧家の軍師役職を持ち越さない');
    assert.strictEqual(destinationGunshi.isGunshi, true, '移籍先にもともといた軍師は維持する');

    assert.strictEqual(affiliation.appointClanGunshi(2, candidate), true);
    assert.strictEqual(candidate.isGunshi, true, '指定した武将だけを軍師にする');
    assert.strictEqual(destinationGunshi.isGunshi, false, '既存軍師は任命時に必ず解除する');
    assert.strictEqual(game.bushos.filter(b => b.clan === 2 && b.isGunshi).length, 1, '一勢力に軍師は一人だけ');
});

test('浪人化は妻を無所属へ移し旧家姫名簿と外交婚姻を同期する', () => {
    const ctx = createContext({
        PersonnelRules: { calcAffinityDiff: () => 0 },
        BushoStatusRules: {
            isActive: b => b.status === 'active',
            isPresent: b => b.status !== 'dead' && b.status !== 'unborn',
            isRonin: b => b.status === 'ronin'
        }
    });
    loadScript(ctx, 'js/constants.js');
    loadScript(ctx, 'js/affiliation_system.js');
    const AffiliationSystem = vm.runInContext('AffiliationSystem', ctx);
    const oldClan = { id: 1, princessIds: [11] };
    const wife = { id: 11, originalClanId: 2, currentClanId: 1 };
    const refreshed = [];
    const game = {
        playerClanId: 99,
        clans: [oldClan],
        princesses: [wife],
        bushos: [],
        getClan: id => Number(id) === 1 ? oldClan : null,
        getPrincess: id => Number(id) === 11 ? wife : null,
        getClanCastles: () => [{ id: 10 }],
        getClanDaimyo: () => null,
        diplomacyManager: { refreshMarriageRelation: (a, b) => refreshed.push([Number(a), Number(b)]) },
        factionSystem: { updateFactions() {} }
    };
    const affiliation = new AffiliationSystem(game);
    affiliation.leaveCastle = () => {};
    affiliation.updateUI = () => {};
    const busho = {
        id: 100, clan: 1, castleId: 0, status: 'active', achievementTotal: 80,
        wifeIds: [11], isHostage: false, isGunshi: false,
        isCastellan: false, isDaimyo: false, isCommander: false,
        belongKunishuId: 0, nemesisIds: [], nemesisList: []
    };

    affiliation.becomeRonin(busho);

    assert.strictEqual(busho.clan, 0);
    assert.strictEqual(busho.status, 'ronin');
    assert.strictEqual(wife.currentClanId, 0);
    assert.deepStrictEqual(oldClan.princessIds, []);
    assert.ok(refreshed.some(([a, b]) => (a === 2 && b === 1) || (a === 1 && b === 2)), '妻の実家と旧所属家の婚姻を再評価する');
});

test('残党諸勢力化も妻婚姻同期の共通窓口を通す', () => {
    const src = read('js/affiliation_system.js');
    const roninAt = src.indexOf('becomeRonin(busho, reason');
    const ronin = src.slice(roninAt, src.indexOf('\n    // ★追加：スキルマネージャー', roninAt));
    assert.ok(ronin.includes('this.syncSpousesForClanChange(busho, oldClanId, 0'));
    assert.ok(ronin.includes('refreshDiplomacy: busho.isHostage !== true'));

    const createAt = src.indexOf('_createSurvivalKunishu(busho, oldClanId, survivalInfo)');
    const create = src.slice(createAt, src.indexOf('\n    // ★追加：旧家臣が生存スキル', createAt));
    assert.ok(create.includes('this.syncSpousesForClanChange(busho, oldClanId, 0'));
    assert.ok(create.includes('refreshDiplomacy: busho.isHostage !== true'));

    const joinAt = src.indexOf('_joinSurvivalKunishu(busho, kunishu)');
    const join = src.slice(joinAt, src.indexOf('\n    /**\n     * ③ 同じ大名家', joinAt));
    assert.ok(join.includes('const oldClanId = Number(busho.clan) || 0;'));
    assert.ok(join.includes('this.syncSpousesForClanChange(busho, oldClanId, 0'));
    assert.ok(join.includes('refreshDiplomacy: busho.isHostage !== true'));
});

test('AI軍師候補は国主を除外し旧大名移動fallbackを残さない', () => {
    const ctx = createContext({
        PersonnelRules: { calcAffinityDiff: () => 0 },
        BushoStatusRules: { isActive: b => b.status === 'active' }
    });
    loadScript(ctx, 'js/affiliation_system.js');
    const AffiliationSystem = vm.runInContext('AffiliationSystem', ctx);
    const commander = {
        id: 2, clan: 1, status: 'active', factionId: 7, intelligence: 99, affinity: 10,
        achievementTotal: 100, isDaimyo: false, isCommander: true, isCastellan: false, isGunshi: false
    };
    const candidate = {
        id: 3, clan: 1, status: 'active', factionId: 7, intelligence: 70, affinity: 10,
        achievementTotal: 10, isDaimyo: false, isCommander: false, isCastellan: false, isGunshi: false
    };
    const castellan = { id: 1, clan: 1, isDaimyo: true, factionId: 7, affinity: 10 };
    const game = {
        playerClanId: 99,
        bushos: [commander, candidate],
        getClanGunshi: () => null,
        getClanCastles: () => [{ id: 10 }],
        getCastleBushos: () => [commander, candidate]
    };
    const affiliation = new AffiliationSystem(game);
    affiliation.appointAIGunshi({ id: 10, ownerClan: 1 }, castellan);
    assert.strictEqual(commander.isGunshi, false, '国主は軍師候補にしない');
    assert.strictEqual(candidate.isGunshi, true, '次順位の適格者を軍師にする');

    const ai = read('js/ai.js');
    const affiliationSource = read('js/affiliation_system.js');
    assert.ok(ai.includes('const isRelocated = this.game.aiStaffing.relocateDaimyo(castle, castellan);'));
    assert.ok(!ai.includes('relocateDaimyoAI'));
    assert.ok(!affiliationSource.includes('relocateDaimyoAI('));
});

test('軍師役職の実行中書換はAffiliationSystemへ集約し旧gunshiId二重管理を残さない', () => {
    const jsFiles = [];
    const walk = dir => {
        for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
            const full = path.join(dir, entry.name);
            if (entry.isDirectory()) walk(full);
            else if (entry.name.endsWith('.js') && !entry.name.endsWith('.min.js')) jsFiles.push(full);
        }
    };
    walk(path.join(ROOT, 'js'));
    const allowed = new Set(['js/affiliation_system.js', 'js/models.js', 'js/data_manager.js']);
    const offenders = [];
    for (const file of jsFiles) {
        const rel = path.relative(ROOT, file).replace(/\\/g, '/');
        if (allowed.has(rel)) continue;
        const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/);
        lines.forEach((line, index) => {
            if (/\.isGunshi\s*=/.test(line)) offenders.push(`${rel}:${index + 1}`);
        });
    }
    assert.deepStrictEqual(offenders, [], `軍師役職の直接代入: ${offenders.join(', ')}`);
    assert.ok(!read('js/game.js').includes('gunshiId'), '軍師取得で旧clan.gunshiIdを併用しない');
    assert.ok(!read('js/data_manager.js').includes('gunshiId'), '初期読込で旧clan.gunshiIdを復活させない');
});
// ---------------------------------------------------------------------------
// モデル境界・武将状態の所有権
// ---------------------------------------------------------------------------
test('models.js は GameApp 全体を直接参照しない', () => {
    const source = read('js/models.js');
    assert.ok(!/\bwindow\.GameApp\b/.test(source), 'models.js に window.GameApp 直接参照が残っています');
});

test('Busho能力値は注入resolver経由でも一門+5を維持する', () => {
    const ctx = createContext({ MainParams: { StartYear: 1560 } });
    loadScript(ctx, 'js/models.js');
    const Busho = vm.runInContext('Busho', ctx);
    const daimyo = { id: 2, familyIds: [1] };
    Busho.configureRuntime({ getClanDaimyo: () => daimyo });
    const busho = Object.create(Busho.prototype);
    Object.assign(busho, { id: 1, clan: 1, isDaimyo: false, familyIds: [], _leadership: 90, expLeadership: 0 });
    assert.strictEqual(busho.leadership, 95);
    daimyo.familyIds = [];
    assert.strictEqual(busho.leadership, 90);
    busho.isDaimyo = true;
    assert.strictEqual(busho.leadership, 95);
});

test('武将肩書き表示は StatPresenter が担当する', () => {
    const ctx = createContext();
    loadScript(ctx, 'js/constants.js');
    loadScript(ctx, 'js/stat_presenter.js');
    const p = ctx.StatPresenter;
    const game = {
        legions: [{ commanderId: 10 }],
        kunishuSystem: { getKunishu: id => id === 7 ? { leaderId: 20 } : null }
    };
    assert.strictEqual(p.getBushoRankName({ id: 10, status: 'active', isDaimyo: false, isGunshi: false, isCastellan: false, isCommander: false, belongKunishuId: 0 }, game), '国主');
    assert.strictEqual(p.getBushoRankName({ id: 20, status: 'active', isDaimyo: false, isGunshi: false, isCastellan: false, isCommander: false, belongKunishuId: 7 }, game), '頭領');
    assert.strictEqual(p.getBushoRankName({ id: 30, status: 'ronin', isDaimyo: false, isGunshi: false, isCastellan: false, isCommander: false, belongKunishuId: 0 }, game), '浪人');
    assert.ok(!read('js/models.js').includes('getRankName()'), '表示用getRankNameがモデルへ戻っています');
});

test('武将active/roninとdead/unbornの直接書換は所有部署と初期化処理に限定する', () => {
    const jsFiles = [];
    const walk = dir => {
        for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
            const full = path.join(dir, entry.name);
            if (entry.isDirectory()) walk(full);
            else if (entry.name.endsWith('.js') && !entry.name.endsWith('.min.js')) jsFiles.push(full);
        }
    };
    walk(path.join(ROOT, 'js'));
    const allowed = new Set(['js/affiliation_system.js', 'js/life_system.js', 'js/models.js', 'js/data_manager.js']);
    const offenders = [];
    for (const file of jsFiles) {
        const rel = path.relative(ROOT, file).replace(/\\/g, '/');
        if (allowed.has(rel)) continue;
        const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/);
        lines.forEach((line, index) => {
            if (/\.status\s*=\s*['"](?:active|ronin|dead|unborn)['"]/.test(line)) offenders.push(`${rel}:${index + 1}`);
        });
    }
    assert.deepStrictEqual(offenders, [], `武将状態の直接代入: ${offenders.join(', ')}`);
});

test('国主は別家の同番号軍団城へ移動しても国主職を誤保持しない', () => {
    const ctx = createContext({ PersonnelRules: { calcAffinityDiff: () => 0 } });
    loadScript(ctx, 'js/affiliation_system.js');
    const AffiliationSystem = vm.runInContext('AffiliationSystem', ctx);
    const busho = { id: 10, clan: 1, castleId: 1, isCommander: true, isCastellan: false };
    const destination = { id: 2, ownerClan: 2, legionId: 1 };
    let disbanded = 0;
    const game = {
        legions: [{ id: 101, clanId: 1, legionNo: 1, commanderId: 10 }],
        getCastle: id => Number(id) === 2 ? destination : null,
        castleManager: { disbandLegion: id => { disbanded = Number(id); busho.isCommander = false; } }
    };
    const affiliation = new AffiliationSystem(game);
    affiliation.leaveCastle = () => {};
    affiliation.enterCastle = (b, id) => { b.castleId = Number(id); };
    affiliation.updateUI = () => {};
    affiliation.moveCastle(busho, 2, { deferUI: true });
    assert.strictEqual(disbanded, 101);
    assert.strictEqual(busho.isCommander, false);
});

test('城主更新は旧所有家の城主バッジを城側の正本に合わせて掃除する', () => {
    const ctx = createContext({
        PersonnelRules: { calcAffinityDiff: () => 0 },
        BushoStatusRules: { isActive: b => b.status === 'active' }
    });
    loadScript(ctx, 'js/affiliation_system.js');
    const AffiliationSystem = vm.runInContext('AffiliationSystem', ctx);
    const oldLord = { id: 10, clan: 1, castleId: 1, status: 'active', isCastellan: true };
    const castle = { id: 1, ownerClan: 2, castellanId: 10 };
    const game = {
        getBusho: id => Number(id) === 10 ? oldLord : null,
        getCastleBushos: () => [oldLord]
    };
    const affiliation = new AffiliationSystem(game);
    affiliation.updateCastleLord(castle);
    assert.strictEqual(castle.castellanId, 0);
    assert.strictEqual(oldLord.isCastellan, false);
});

test('活動状態と生死状態の低レベルAPIは担当外状態を拒否する', () => {
    const silentConsole = { ...console, warn: () => {} };
    const ctx = createContext({ console: silentConsole, PersonnelRules: { calcAffinityDiff: () => 0 } });
    loadScript(ctx, 'js/constants.js');
    loadScript(ctx, 'js/affiliation_system.js');
    loadScript(ctx, 'js/life_system.js');
    const AffiliationSystem = vm.runInContext('AffiliationSystem', ctx);
    const LifeSystem = vm.runInContext('LifeSystem', ctx);
    const game = {};
    const a = new AffiliationSystem(game);
    const l = new LifeSystem(game);
    const b = { id: 1, status: 'active' };
    a.setActivityStatusRaw(b, 'ronin');
    assert.strictEqual(b.status, 'ronin');
    a.setActivityStatusRaw(b, 'dead');
    assert.strictEqual(b.status, 'ronin');
    l.setLifeStatusRaw(b, 'dead');
    assert.strictEqual(b.status, 'dead');
    l.setLifeStatusRaw(b, 'active');
    assert.strictEqual(b.status, 'dead');
});

test('Legionモデルは現在ターンをGameAppから取得せず、現行セーブ値をそのまま復元する', () => {
    const models = read('js/models.js');
    const saves = read('js/save_manager.js');
    assert.ok(models.includes('this.establishedTurnId = Number(data.establishedTurnId || 0);'));
    assert.ok(saves.includes('this.game.legions = d.legions.map(l => new Legion(l));'));
    assert.ok(!saves.includes('establishedTurnId: l.establishedTurnId || this.game.getCurrentTurnId()'));
});

// ---------------------------------------------------------------------------
// 最低限の構造チェック
// ---------------------------------------------------------------------------
test('index.html のローカル script src はすべて存在する', () => {
    const html = read('index.html');
    const refs = [...html.matchAll(/<script\s+[^>]*src=["']([^"']+)["']/g)]
        .map(m => m[1].split('?')[0])
        .filter(src => !/^https?:/i.test(src));
    const missing = refs.filter(src => !fs.existsSync(path.join(ROOT, src)));
    assert.deepStrictEqual(missing, []);
});

// Regression: the 100/120 width reservation must not use flex-basis.
// busho-stat-bar-wrapper is a column flex container, so flex-basis would collapse/alter gauge height.
test('Busho stat gauge keeps height while reserving 120-space', () => {
    const css = fs.readFileSync(path.join(ROOT, 'css', 'style.css'), 'utf8');
    const block = css.match(/\.busho-detail-bar-base\s*\{([\s\S]*?)\}/);
    assert(block, 'Missing .busho-detail-bar-base');
    assert(/width\s*:\s*calc\(100%\s*\*\s*100\s*\/\s*120\)/.test(block[1]), '100/120 width reservation missing');
    assert(!/flex(?:-basis)?\s*:/.test(block[1]), 'Do not use flex/flex-basis on .busho-detail-bar-base; parent axis is vertical');
    const bg = css.match(/\.bar-bg-busho\s*\{([\s\S]*?)\}/);
    assert(bg && /height\s*:\s*10px/.test(bg[1]), 'Busho stat gauge height must remain 10px');
});


// Regression: SaveManager is not the game facade. After loading a save,
// EventManager must receive the GameManager instance so event conditions can
// call getBusho/getCastle/getClan and other game APIs.
test('SaveManager restores EventManager with GameManager context', () => {
    const source = read('js/save_manager.js');
    assert(source.includes('this.game.eventManager = new EventManager(this.game);'),
        'SaveManager must pass this.game to EventManager during restore');
    assert(!source.includes('this.game.eventManager = new EventManager(this);'),
        'SaveManager must not pass itself as EventManager game context');
});


// ---------------------------------------------------------------------------
// HTML / CSS / JS separation
// ---------------------------------------------------------------------------
test('index.html は inline style を持たない', () => {
    const html = read('index.html');
    assert.strictEqual((html.match(/\bstyle\s*=/g) || []).length, 0);
});

test('自作JSが生成する inline style は動的CSS変数だけに限定する', () => {
    const offenders = [];
    const walk = dir => {
        for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
            const full = path.join(dir, entry.name);
            if (entry.isDirectory()) walk(full);
            else if (entry.name.endsWith('.js') && !entry.name.endsWith('.min.js') && entry.name !== 'howler.js') {
                const rel = path.relative(ROOT, full).replace(/\\/g, '/');
                const source = fs.readFileSync(full, 'utf8');
                for (const match of source.matchAll(/style=["']([^"']*)["']/g)) {
                    const declarations = match[1].split(';').map(x => x.trim()).filter(Boolean);
                    if (declarations.length === 0 || declarations.some(d => !d.startsWith('--'))) {
                        offenders.push(`${rel}: ${match[1]}`);
                    }
                }
            }
        }
    };
    walk(path.join(ROOT, 'js'));
    assert.deepStrictEqual(offenders, []);
});

test('自作JSが生成するHTMLに inline event 属性を持たない', () => {
    const attrs = ['onclick=', 'onerror=', 'onchange=', 'oninput=', 'onmouseover=', 'onmouseout='];
    const offenders = [];
    const walk = dir => {
        for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
            const full = path.join(dir, entry.name);
            if (entry.isDirectory()) walk(full);
            else if (entry.name.endsWith('.js') && !entry.name.endsWith('.min.js') && entry.name !== 'howler.js') {
                const rel = path.relative(ROOT, full).replace(/\\/g, '/');
                const source = fs.readFileSync(full, 'utf8').toLowerCase();
                for (const attr of attrs) {
                    if (source.includes(attr)) offenders.push(`${rel}: ${attr}`);
                }
            }
        }
    };
    walk(path.join(ROOT, 'js'));
    assert.deepStrictEqual(offenders, []);
});


// ---------------------------------------------------------------------------
// 月進行の責務境界
// ---------------------------------------------------------------------------
test('TurnManager は月次計算を既存の専門部署へ委譲する', () => {
    const source = read('js/turn_manager.js');
    assert.ok(source.includes('factionSystem.applyStartMonthSameFactionEffects'));
    assert.ok(source.includes('EconomyRules.updateMonthlyProvinceMarketRates'));
    assert.ok(source.includes('EconomyRules.calcMonthlyGoldIncome'));
    assert.ok(source.includes('DomesticRules.calcMonthlyPopulationGrowth'));
    assert.ok(source.includes('DomesticRules.calcMonthlySoldierGrowth'));
    assert.ok(source.includes('PersonnelRules.processMonthlyBushoMaintenance'));
    assert.ok(source.includes('PersonnelRules.applyMonthlyRoleProgress'));
    assert.ok(source.includes('aiStaffing.processQuarterlyStaffing'));

    assert.ok(!source.includes('const popKokuRatio = c.population / Math.max(1, c.kokudaka)'));
    assert.ok(!source.includes('const specialtyBonus = 0.5 + (highestStat * 0.005)'));
    assert.ok(!source.includes('const rubberForce = (baseRate - p.marketRate) * 0.1'));
});

test('月次人口・兵士増加の専門RulesがRound62の基準式を再現する', () => {
    const ctx = createContext();
    loadScript(ctx, 'js/constants.js');
    loadScript(ctx, 'js/domestic_rules.js');

    const castle = {
        population: 10000,
        peoplesLoyalty: 80,
        kokudaka: 4000,
        defense: 500,
        soldiers: 2000,
        ownerClan: 1,
        adjacentCastleIds: []
    };
    const daimyo = { leadership: 80, strength: 70, politics: 75, diplomacy: 65, intelligence: 85, charm: 70 };
    const neighbor = 1.2;

    let oldPop = Math.floor(((Math.sqrt(10000) * 2) * ((80 - 50) / 100)) + (80 / 4));
    oldPop = Math.floor(oldPop * neighbor);
    const ratio = 10000 / 4000;
    const lowBonus = 3.0 - ((ratio - 1) / 4) * 1.5;
    oldPop = Math.floor(oldPop * lowBonus);
    const baseScore = (Math.sqrt(4000) * 500 + Math.sqrt(500) * 200) * ((80 / 100) + 0.5);
    if (oldPop > 0 && 10000 >= baseScore) oldPop = Math.floor(oldPop / 20);
    assert.strictEqual(ctx.DomesticRules.calcMonthlyPopulationGrowth(castle, neighbor), oldPop);

    const statBonus = (80 + 70 + 75 + 65 + 85 + 70) / 600;
    const daimyoBonus = statBonus * (0.5 + 85 * 0.005);
    const baseGrowth = Math.sqrt(10000) * ((daimyoBonus + 80 * 0.01) / 2) * 1.25;
    const suppressed = baseGrowth / (1 + 5 / 25);
    const penalty = Math.max(0, 1 - (2000 / 10000) * 1.25);
    let oldSoldier = Math.floor(suppressed * penalty);
    if (oldSoldier > 0) oldSoldier = Math.floor(oldSoldier * neighbor);
    assert.strictEqual(ctx.DomesticRules.calcMonthlySoldierGrowth(castle, daimyo, 5, neighbor), oldSoldier);
});

test('オートセーブ条件は「未保存 かつ 設定ON」を括弧付きで判定する', () => {
    const source = read('js/turn_manager.js');
    assert.ok(source.includes('!game.hasAutoSavedThisMonth && (window.UserSettings ? window.UserSettings.autoSave : true)'));
    assert.ok(!source.includes('!game.hasAutoSavedThisMonth && window.UserSettings ?'));
});



test('攻城戦ポップアップは戦場レイヤーを座標基準にし城防御のclip-path外へ表示する', () => {
    const ui = read('js/ui.js');
    const animation = read('css/animation.css');
    assert.ok(animation.includes('#war-visual-area') && animation.includes('position: relative'), 'スマホ用ポップアップのabsolute座標基準を戦場レイヤーに固定する');
    assert.ok(ui.includes('visualArea.scrollTop') && ui.includes('visualArea.scrollLeft'), 'スクロール済みでも対象カード中央へ合わせる');
    assert.ok(ui.includes("const wallContainer = hexWrap.closest('.war-wall-container')"), '城防御ポップアップは八角形の外側を表示親にする');
    assert.ok(ui.includes('wallContainer.appendChild(pop)'), 'clip-pathを持つ八角形内へポップアップを残さない');
});

test('PC攻城戦の部隊カードは縦積みを避け軍馬・鉄砲まで収める専用レイアウトを持つ', () => {
    const css = read('css/style.css');
    assert.ok(css.includes('★ r190 攻城戦PCカード収まり調整'));
    assert.ok(css.includes('body.is-pc #war-modal .main-army-box .responsive-army-content'));
    assert.ok(css.includes('grid-template-columns: 84px minmax(0, 1fr) !important'));
    assert.ok(css.includes('body.is-pc #war-modal .war-reinf-card .responsive-army-stats'));
});

test('出陣武将が一人だけなら総大将選択リストを省略する', () => {
    const command = read('js/command_system.js');
    const normalStart = command.indexOf("if (actionType === 'war_deploy')");
    const normalEnd = command.indexOf("if (actionType === 'war_general')", normalStart);
    const normalBlock = command.slice(normalStart, normalEnd);
    assert.ok(normalBlock.includes('leader || selectedIds.length === 1'));
    assert.ok(normalBlock.includes("this.openWarSuppliesSelectorWithWeatherWarning(sortedIds, targetId)"));

    const kunishuStart = command.indexOf("if (actionType === 'kunishu_subjugate_deploy')");
    const kunishuEnd = command.indexOf("if (actionType === 'kunishu_war_general')", kunishuStart);
    const kunishuBlock = command.slice(kunishuStart, kunishuEnd);
    assert.ok(kunishuBlock.includes('leader || selectedIds.length === 1'));
    assert.ok(kunishuBlock.includes("this.openWarSuppliesSelectorWithWeatherWarning(sortedIds, targetId, { isKunishu: true, kunishuId: extraData.kunishuId })"));
});

// ---------------------------------------------------------------------------
// CommandSystem の責務境界
// ---------------------------------------------------------------------------
test('指南書はタイトルとシステムコマンドから同じGuideViewを開く', () => {
    const html = read('index.html');
    const bootstrap = read('js/app_bootstrap.js');
    const catalog = read('js/command_catalog.js');
    const command = read('js/command_system.js');
    const ui = read('js/ui.js');
    const guideView = read('js/guide_view.js');
    const guideData = read('js/guide_data.js');

    assert.ok(html.includes('id="guide-title-btn"'));
    assert.ok(html.includes('id="guide-modal"'));
    assert.ok(html.includes('js/guide_data.js') && html.includes('js/guide_view.js'));
    assert.ok(bootstrap.includes("executeSystemCommand('guide')"));
    assert.ok(catalog.includes("'guide': { label: \"指南書\""));
    assert.ok(catalog.includes("items: ['save', 'load', 'settings', 'history', 'guide', 'watch', 'title']"));
    assert.ok(command.includes("case 'guide':"));
    assert.ok(command.includes('this.game.ui.guideView.open()'));
    assert.ok(ui.includes('this.guideView = new GuideView(this, this.game)'));
    assert.ok(guideView.includes('COMMAND_MENU_STRUCTURE'));
    assert.ok(guideView.includes('COMMAND_SPECS'));
    assert.ok(guideData.includes("id: 'basics'"));
    assert.ok(guideData.includes("id: 'faq'"));
});

test('指南書は固定論理画面内で記事切替し通常長文スクロールに依存しない', () => {
    const css = read('css/style.css');
    const view = read('js/guide_view.js');
    assert.ok(css.includes('#guide-modal .guide-content'));
    assert.ok(css.includes('overflow: hidden !important;'));
    assert.ok(css.includes('.guide-layout'));
    assert.ok(css.includes('body:not(.is-pc) .guide-layout'));
    assert.ok(view.includes("button.className = 'guide-nav-btn'"));
    assert.ok(view.includes("button.className = 'guide-command-btn'"));
    assert.ok(view.includes('guide-command-children'));
    assert.ok(view.includes("this._renderArticle(article)"));
    assert.ok(css.includes('.guide-article-header'));
    assert.ok(!css.includes('.guide-article-lead'), '見出し下の説明専用エリアを残さない');
    assert.ok(!view.includes('guide-article-lead'), 'GuideViewから見出し下の説明欄参照を除去する');
    assert.ok(view.includes("heading: '概要'"), '導入文は本文の概要へ移す');
});

test('指南書は公開情報の範囲で国主・弱い武将・褒美・派閥を説明する', () => {
    const guide = read('js/guide_data.js');
    assert.ok(guide.includes("heading: '基本の流れ'"));
    assert.ok(guide.includes("commandMenuLabel: '国主'"));
    assert.ok(guide.includes("'国主任命': 'legion_appoint'"));
    assert.ok(guide.includes("'国主解任': 'legion_dismiss'"));
    assert.ok(guide.includes("'所領分配': 'legion_allot'"));
    assert.ok(!guide.includes('第一席') && !guide.includes('第二席'), '指南書データに国主の席番号を持ち込まない');
    assert.ok(guide.includes('「侍大将」が最低限の守将として立ちます'));
    assert.ok(guide.includes('忠誠を高めます'));
    assert.ok(guide.includes('派閥主・人数・方針・思想'));
    assert.ok(guide.includes('同じ派閥の武将を一緒に働かせたとき'));
    ['義理', '野心', '野望', '承認欲求', 'achievementTotal'].forEach(hiddenWord => {
        assert.ok(!guide.includes(hiddenWord), `指南書に非公開情報 ${hiddenWord} を露出しない`);
    });
});

test('指南書は公開・体感・非公開の境界を守り、命令口調を避ける', () => {
    const guide = read('js/guide_data.js');
    assert.ok(guide.includes('人口：金収入や徴兵できる兵のもとになる'));
    assert.ok(guide.includes('低い拠点では一揆が起こることもある'));
    assert.ok(guide.includes('人数の多い派閥は家中で存在感を持ちやすく'));
    assert.ok(guide.includes('領国の規模や兵力、蓄え、当主の官位などを反映した勢力の存在感の目安'));
    assert.ok(guide.includes('すべてを率直に話すとは限りません'));
    ['野望', '義理', '承認欲求', 'achievementTotal', 'LoyaltyChangeThreshold', 'Recognition'].forEach(hiddenWord => {
        assert.ok(!guide.includes(hiddenWord), `指南書に非公開情報 ${hiddenWord} を露出しない`);
    });
    ['見てください', '確認してください', 'してください', 'して下さい'].forEach(imperative => {
        assert.ok(!guide.includes(imperative), `指南書を命令口調にしない: ${imperative}`);
    });
    assert.ok(!guide.includes('AIの判断ルール'), '観戦の内部実装説明を指南書へ載せない');
});

test('評定の案内は一ヶ月表記で統一する', () => {
    const guide = read('js/guide_data.js');
    const council = read('js/legion_council_view.js');
    assert.ok(guide.includes('評定は一ヶ月に一度開けます。'));
    assert.ok(council.includes('評定は一ヶ月に一度だけ開催できます。'));
    assert.ok(council.includes('評定は一ヶ月に一度のみ開催できます。'));
    assert.ok(!guide.includes('一月に') && !council.includes('一月に'));
});

test('標準modal-footerは12pxに統一し、シナリオfooterを内部Gridのrow-gapから分離する', () => {
    const css = read('css/style.css');
    const html = read('index.html');
    assert.ok(css.includes('--modal-footer-gap: 12px;'), '標準footer間隔12pxをCSS変数で一元化する');
    assert.ok(css.includes('--dialog-choice-footer-gap: 18px;'), '下部会話は名前札張り出し理由を持つ18px専用変数にする');
    assert.ok(css.includes('.modal-footer { margin-top: var(--modal-footer-gap);'), '標準footerは共通変数を参照する');
    assert.ok(!css.includes('#guide-modal .modal-footer {'), '指南書だけのfooter余白上書きを残さない');
    assert.ok(html.includes('<div class="scenario-main">'), 'シナリオ一覧と説明をfooterから分離した内側Gridへ置く');
    assert.ok(css.includes('#scenario-modal .scenario-main {'), 'シナリオ内部Gridを専用領域として持つ');
    assert.ok(css.includes('#scenario-modal .modal-footer {'));
    assert.ok(!css.includes('calc(var(--modal-footer-gap) - var(--scenario-'), 'シナリオfooterだけの相殺計算を残さない');
    assert.ok(!css.includes('--scenario-row-gap:'), 'footerまで巻き込む旧scenario row-gap変数を残さない');
});

test('指南書は合戦を野戦・攻城戦・兵科へ分け、内部倍率を出さず特徴を説明する', () => {
    const guide = read('js/guide_data.js');
    assert.ok(guide.includes("id: 'battle'"));
    assert.ok(guide.includes("{ id: 'battle_field', label: '野戦' }"));
    assert.ok(guide.includes("{ id: 'battle_siege', label: '攻城戦' }"));
    assert.ok(guide.includes("id: 'battle_troops', label: '兵科'"));
    assert.ok(guide.includes("{ id: 'battle_ashigaru', label: '足軽' }"));
    assert.ok(guide.includes("{ id: 'battle_kiba', label: '騎馬' }"));
    assert.ok(guide.includes("{ id: 'battle_teppo', label: '鉄砲' }"));
    assert.ok(guide.includes('移動した直後は攻撃できず'));
    assert.ok(guide.includes('雨や雪では遠距離射撃ができず'));
    assert.ok(!guide.includes('1.5倍') && !guide.includes('0.7倍'), '指南書へ内部戦闘倍率を露出しない');
});

test('馬・鉄砲の購入可否は受け取ったゲーム状態を価格計算へ渡す', () => {
    let horseGame = null;
    let gunGame = null;
    const ctx = createContext({
        MainParams: { CommandCost: { Farm:1, Commerce:1, Repair:1, Charity:1, SoldierCharity:1, Reward:1, RewardAll:1 } },
        EconomyRules: {
            calcBuyHorseCost: (_amount, _daimyo, _castellan, game) => { horseGame = game; return 1; },
            calcBuyGunCost: (_amount, _daimyo, _castellan, game) => { gunGame = game; return 1; }
        }
    });
    ctx.window.MainParams = ctx.MainParams;
    loadScript(ctx, 'js/command_catalog.js');
    const rules = vm.runInContext('CAN_EXECUTE_RULES', ctx);
    const daimyo = { id: 1, clan: 1, isDaimyo: true };
    const castellan = { id: 2, clan: 1, isCastellan: true };
    const game = {
        year: 1560, bushos: [daimyo, castellan],
        getBusho: id => Number(id) === 2 ? castellan : null,
        getClanDaimyo: id => Number(id) === 1 ? daimyo : null
    };
    const castle = { ownerClan: 1, castellanId: 2, gold: 10 };
    assert.strictEqual(rules.canBuyHorses(game, castle), true);
    assert.strictEqual(rules.canBuyGuns(game, castle), true);
    assert.strictEqual(horseGame, game);
    assert.strictEqual(gunGame, game);
});

test('指南書のコマンド解説は command_catalog の階層を使い、全表示コマンドを個別説明できる', () => {
    const ctx = createContext({
        MainParams: { CommandCost: { Farm:1, Commerce:1, Repair:1, Charity:1, SoldierCharity:1, Reward:1, RewardAll:1 } }
    });
    ctx.window.MainParams = ctx.MainParams;
    loadScript(ctx, 'js/command_catalog.js');
    loadScript(ctx, 'js/guide_data.js');
    const menus = vm.runInContext('COMMAND_MENU_STRUCTURE', ctx);
    const docs = vm.runInContext('GUIDE_COMMAND_DOCS', ctx);
    const collapsed = vm.runInContext('GUIDE_COLLAPSED_COMMAND_GROUPS', ctx);

    const missing = [];
    const walk = items => {
        (items || []).forEach(item => {
            if (typeof item === 'string') {
                if (/^(appoint_legion_leader_|dismiss_legion_leader_|allot_fief_)/.test(item)) return;
                if (!docs[item]) missing.push(item);
                return;
            }
            if (!item || !Array.isArray(item.items)) return;
            if (collapsed[item.label]) {
                if (!docs[collapsed[item.label]]) missing.push(collapsed[item.label]);
                return;
            }
            walk(item.items);
        });
    };
    menus.forEach(menu => walk(menu.items));
    assert.deepStrictEqual(Array.from(missing), []);
});

test('GuideView は国主席番号を展開せず、入れ子から個別コマンド説明へ遷移する', () => {
    class GuideClassList {
        constructor() { this.values = new Set(); }
        add(...names) { names.forEach(name => this.values.add(name)); }
        remove(...names) { names.forEach(name => this.values.delete(name)); }
        contains(name) { return this.values.has(name); }
        toggle(name, force) {
            if (force === true) { this.values.add(name); return true; }
            if (force === false) { this.values.delete(name); return false; }
            if (this.values.has(name)) { this.values.delete(name); return false; }
            this.values.add(name); return true;
        }
    }
    const makeNode = id => {
        const node = {
            id, children: [], classList: new GuideClassList(), dataset: {}, type: '', className: '',
            _text: '', _listeners: {},
            appendChild(child) { this.children.push(child); child.parentElement = this; return child; },
            addEventListener(type, fn) { this._listeners[type] = fn; },
            click() { if (this._listeners.click) this._listeners.click(); },
            focus() {},
            get childElementCount() { return this.children.length; }
        };
        Object.defineProperty(node, 'textContent', {
            get() { return this._text; },
            set(value) { this._text = String(value); if (value === '') this.children = []; }
        });
        return node;
    };
    const ids = ['guide-modal','guide-nav','guide-article-title','guide-command-list','guide-article-body','guide-close-btn','title-screen'];
    const elements = Object.fromEntries(ids.map(id => [id, makeNode(id)]));
    elements['title-screen'].classList.add('hidden');
    const document = {
        getElementById(id) { return elements[id] || null; },
        createElement(tag) { return makeNode(tag); }
    };
    const ctx = createContext({
        document,
        MainParams: { CommandCost: { Farm:1, Commerce:1, Repair:1, Charity:1, SoldierCharity:1, Reward:1, RewardAll:1 } }
    });
    ctx.window.MainParams = ctx.MainParams;
    loadScript(ctx, 'js/command_catalog.js');
    loadScript(ctx, 'js/guide_data.js');
    loadScript(ctx, 'js/guide_view.js');
    const GuideViewClass = vm.runInContext('GuideView', ctx);
    const view = new GuideViewClass({}, {});

    const flattenTexts = root => {
        const values = [];
        const walk = node => { if (node.textContent) values.push(node.textContent); (node.children || []).forEach(walk); };
        walk(root);
        return values;
    };

    view.open('legion');
    let texts = flattenTexts(elements['guide-command-list']);
    ['概要','評定','国主任命','国主解任','所領分配'].forEach(label => assert.ok(texts.includes(label), `${label} が指南書に必要`));
    assert.ok(!texts.some(text => /^第[一二三四五六七八]席$/.test(text)), '席番号を指南書へ展開しない');

    view.open('foreign');
    const findButton = (root, label) => {
        let found = null;
        const walk = node => {
            if (found) return;
            if (node.textContent === label && node._listeners && node._listeners.click) { found = node; return; }
            (node.children || []).forEach(walk);
        };
        walk(root);
        return found;
    };
    const diplomacyGroup = findButton(elements['guide-command-list'], '外交');
    assert.ok(diplomacyGroup);
    diplomacyGroup.click();
    texts = flattenTexts(elements['guide-command-list']);
    assert.ok(texts.includes('同盟') && texts.includes('婚姻') && texts.includes('臣従願'));
    const alliance = findButton(elements['guide-command-list'], '同盟');
    assert.ok(alliance);
    assert.strictEqual(elements['guide-article-title'].textContent, '外交', '入れ子の親項目を押した時も見出しを押した項目名へ合わせる');
    alliance.click();
    assert.strictEqual(elements['guide-article-title'].textContent, '同盟');
    let bodyTexts = flattenTexts(elements['guide-article-body']);
    assert.ok(bodyTexts.includes('概要'));
    assert.ok(bodyTexts.some(text => text.includes('同盟を申し入れます')));

    view.open('organization');
    assert.strictEqual(elements['guide-article-title'].textContent, '組織・人事', '左ナビの名称と上部見出しを一致させる');

    view.open('battle');
    assert.strictEqual(elements['guide-article-title'].textContent, '合戦');
    const fieldBattle = findButton(elements['guide-command-list'], '野戦');
    assert.ok(fieldBattle);
    fieldBattle.click();
    assert.strictEqual(elements['guide-article-title'].textContent, '野戦');
    bodyTexts = flattenTexts(elements['guide-article-body']);
    assert.ok(bodyTexts.some(text => text.includes('野外で部隊を動かして戦う')));
    const troopGroup = findButton(elements['guide-command-list'], '兵科');
    assert.ok(troopGroup);
    troopGroup.click();
    assert.strictEqual(elements['guide-article-title'].textContent, '兵科');
    texts = flattenTexts(elements['guide-command-list']);
    assert.ok(texts.includes('足軽') && texts.includes('騎馬') && texts.includes('鉄砲'));
});

test('コマンド仕様表は command_catalog.js を正本とする', () => {
    const ctx = createContext();
    loadScript(ctx, 'js/config.js');
    loadScript(ctx, 'js/constants.js');
    loadScript(ctx, 'js/command_catalog.js');
    const specs = vm.runInContext('COMMAND_SPECS', ctx);
    const menu = vm.runInContext('COMMAND_MENU_STRUCTURE', ctx);
    assert.ok(specs.war);
    assert.strictEqual(specs.save.action, 'save');
    assert.ok(menu.some(item => item.label === 'システム'));

    const commandSource = read('js/command_system.js');
    assert.ok(!commandSource.includes('const COMMAND_SPECS ='));
    assert.ok(!commandSource.includes('const COMMAND_MENU_STRUCTURE ='));
    assert.ok(!commandSource.includes('const CAN_EXECUTE_RULES ='));
});

test('SaveLoadView は保存形式・IndexedDB・復号を直接扱わない', () => {
    const viewSource = read('js/save_load_view.js');
    const commandSource = read('js/command_system.js');
    const uiSource = read('js/ui.js');

    assert.ok(viewSource.includes('this.game.saveManager.readSaveSlots'));
    assert.ok(!viewSource.includes('loadFromDB('));
    assert.ok(!viewSource.includes('_decryptData'));
    assert.ok(!commandSource.includes('showSaveLoadModal'));
    assert.ok(!commandSource.includes("getElementById('saveload-"));
    assert.ok(uiSource.includes('this.saveLoadView = new SaveLoadView'));
});

test('SaveManager がスロット読込・保存時刻抽出の公開窓口を持つ', () => {
    const source = read('js/save_manager.js');
    assert.ok(source.includes('async readSaveSlots(prefix, count = 5)'));
    assert.ok(source.includes('decodeStoredData(rawData)'));
    assert.ok(source.includes('getSaveTimestamp(data)'));
    assert.ok(source.includes('loadFromDB(prefix + slotNo)'));
    assert.ok(source.includes('isLoadableSaveData(data)'));
    assert.ok(source.includes('const hasData = this.isLoadableSaveData(data);'));
    assert.ok(source.includes("async hasAnyLoadableSaveData(prefixes = ['sengoku_save_slot', 'sengoku_autosave_slot'])"));
    assert.ok(source.includes('async refreshLoadAvailability()'));
});

test('タイトルとシステムのロード可否はSaveManagerの実ロード可否判定を共用する', () => {
    const ui = read('js/ui.js');
    const catalog = read('js/command_catalog.js');
    const save = read('js/save_manager.js');
    const game = read('js/game.js');
    const at = ui.indexOf('async checkSaveDataForTitle()');
    const block = ui.slice(at, at + 1200);
    assert.ok(at >= 0);
    assert.ok(block.includes('this.game.saveManager.refreshLoadAvailability()'));
    assert.ok(!block.includes('loadFromDB('), 'タイトルUIがDBキーの存在を直接見ない');
    assert.ok(block.includes('btn.disabled = !hasData'));
    assert.ok(catalog.includes("canExecute: (game) => game.hasSaveData === true"));
    assert.ok(save.includes('this.game.hasSaveData = hasData;'));
    assert.ok(save.includes('this.game.hasSaveData = true;'), '保存成功時はシステムメニューへ即時反映する');
    assert.ok(game.includes('this.hasSaveData = false;'), '未検査時はロード不可から開始する');
});

test('コマンド定義はWarParamsの独自フォールバックを持たない', () => {
    const sources = read('js/command_catalog.js') + '\n' + read('js/command_system.js');
    assert.ok(!sources.includes('MaxTraining) ?'));
    assert.ok(!sources.includes('MaxMoraleNormal) ?'));
});



test('WarPreparationController が開戦準備フローの正本になる', () => {
    const commandSource = read('js/command_system.js');
    const prepSource = read('js/war_preparation_controller.js');
    const gameSource = read('js/game.js');

    assert.ok(prepSource.includes('class WarPreparationController'));
    assert.ok(prepSource.includes('checkReinforcementAndStartWar('));
    assert.ok(prepSource.includes('executeReinforcementRequest('));
    assert.ok(gameSource.includes('this.warPreparationController = new WarPreparationController(this)'));
    assert.ok(!commandSource.includes('checkReinforcementAndStartWar(atkCastle'));
    assert.ok(!commandSource.includes('executeReinforcementRequest(gold'));
    assert.ok(commandSource.includes('this.game.warPreparationController.checkReinforcementAndStartWar'));
});

test('手動援軍の資源消費・復元は ReinforcementService を正本とする', () => {
    const ctx = createContext();
    ctx.window.WarParams = { Reinforcement: {
        TwoBushoThreshold: 1500, ThreeBushoThreshold: 2500,
        SelfEquipmentMinimumStockRatio: 0.2, EquipmentCapRatio: 0.5,
        SelfSoldierRatio: 0.5, MinimumSoldiers: 500, RicePerSoldier: 1,
        AllyRateDivisor: 400, KunishuRateDivisor: 200
    }};
    loadScript(ctx, 'js/reinforcement_service.js');
    const ReinforcementService = vm.runInContext('ReinforcementService', ctx);
    const service = new ReinforcementService({});
    const castle = { soldiers: 5000, rice: 6000, horses: 1000, guns: 800, morale: 70, training: 80 };
    const bushos = [{ id: 1 }];
    const data = service.createManualCastleReinforcement(castle, bushos,
        { soldiers: 1200, rice: 1400, horses: 300, guns: 200 },
        { isAttacker: true, isSelf: false });
    assert.deepStrictEqual([castle.soldiers, castle.rice, castle.horses, castle.guns], [3800, 4600, 700, 600]);
    assert.strictEqual(data.morale, 70);
    assert.strictEqual(data.training, 80);
    service.restoreCastleReinforcement(data);
    assert.deepStrictEqual([castle.soldiers, castle.rice, castle.horses, castle.guns], [5000, 6000, 1000, 800]);

    const prepSource = read('js/war_preparation_controller.js');
    const warEffortSource = read('js/war_effort.js');
    assert.ok(prepSource.includes('createManualCastleReinforcement'));
    assert.ok(prepSource.includes('restoreCastleReinforcement'));
    assert.ok(warEffortSource.includes('createManualCastleReinforcement'));
    assert.ok(!/helperCastle\.soldiers\s*=\s*Math\.max\(0, helperCastle\.soldiers - reinf/.test(prepSource));
    assert.ok(!/helperCastle\.soldiers\s*=\s*Math\.max\(0, helperCastle\.soldiers - reinf/.test(warEffortSource));

    const offenders = [];
    for (const file of fs.readdirSync(path.join(ROOT, 'js')).filter(x => x.endsWith('.js'))) {
        if (file === 'reinforcement_service.js') continue;
        const source = read(`js/${file}`);
        if (/helperCastle\.(soldiers|rice|horses|guns)\s*=\s*Math\.max/.test(source)) offenders.push(file);
    }
    assert.deepStrictEqual(offenders, []);
});

test('援軍持参金は攻守共通で DiplomacyManager が計算する', () => {
    const ctx = createContext();
    ctx.window.GameConstants = { DiplomacyStatus: { DOMINANT: '支配' } };
    ctx.window.DiplomacyRules = {};
    ctx.window.SkillManager = { canDeclineBossReinforcement: () => false };
    loadScript(ctx, 'js/diplomacy.js');
    const DiplomacyManager = vm.runInContext('DiplomacyManager', ctx);
    const powers = { 1: 10000, 2: 20000, 3: 40000 };
    const game = {
        getClanTotalSoldiers: id => powers[id] || 1,
        getRelation: (a,b) => ({ status: (a === 1 && b === 3) ? '支配' : '同盟' })
    };
    const dm = new DiplomacyManager(game);
    assert.strictEqual(dm.calcReinforcementOfferGold(1, 2, 99999), 500);
    assert.strictEqual(dm.calcReinforcementOfferGold(1, 2, 350), 350);
    assert.strictEqual(dm.calcReinforcementOfferGold(1, 3, 99999), 0);

    const prepSource = read('js/war_preparation_controller.js');
    const warEffortSource = read('js/war_effort.js');
    assert.ok(prepSource.includes('calcReinforcementOfferGold'));
    assert.ok(warEffortSource.includes('calcReinforcementOfferGold'));
    const combined = prepSource + '\n' + warEffortSource;
    assert.ok(!combined.includes('((ratio - 1.5) / 1.5) * 700'));
});


// ---------------------------------------------------------------------------
// 最終一元化境界（Round66）
// ---------------------------------------------------------------------------
test('諸勢力取込成功率は KunishuSystem を正本とし、軍師助言と実判定で共有する', () => {
    const ctx = createContext();
    ctx.PersonnelRules = {
        calcAffinityDiff: (a, b) => Math.abs(Number(a) - Number(b))
    };
    ctx.LifeStatusRules = { isPresent: () => true };
    loadScript(ctx, 'js/kunishu_system.js');
    const KunishuSystem = vm.runInContext('KunishuSystem', ctx);

    const doer = { diplomacy: 70 };
    const kunishu = { soldiers: 1000, leaderId: 9 };
    const game = {
        playerClanId: 1,
        getClan: id => id === 1 ? { daimyoPrestige: 18000 } : null,
        getClanDaimyo: id => id === 1 ? { affinity: 20 } : null,
        getBusho: id => id === 9 ? { affinity: 30 } : null
    };
    const system = new KunishuSystem(game);

    // 70*(18000/(1000*12)) + ((25-10)/25*10) + ((70-50)/50*10) = 115 -> clamp 100
    assert.strictEqual(system.calcIncorporateProbability(doer, kunishu, 1), 100);
    game.getClan = () => ({ daimyoPrestige: 6000 });
    // 35 + 6 + 4 = 45
    assert.strictEqual(system.calcIncorporateProbability(doer, kunishu, 1), 45);

    const commandSource = read('js/command_system.js');
    const kunishuSource = read('js/kunishu_system.js');
    assert.ok(commandSource.includes('kunishuSystem.calcIncorporateProbability'));
    assert.ok(kunishuSource.includes('const totalProb = this.calcIncorporateProbability'));
    assert.ok(!commandSource.includes('targetSoldiers * 12'));
    assert.ok(!commandSource.includes('const affinityMod = (25 - affinityDiff) / 25 * 10'));
});


test('一向宗ネットワークは ideology と分離し、本願寺家は本願寺系大名の威信最大で決まる', () => {
    const ctx = createContext();
    loadScript(ctx, 'js/config.js');
    loadScript(ctx, 'js/models.js');
    loadScript(ctx, 'js/kunishu_system.js');
    const Kunishu = vm.runInContext('Kunishu', ctx);
    const KunishuSystem = vm.runInContext('KunishuSystem', ctx);

    const daimyoByClan = new Map([
        [19, { id: 1019005, clan: 19, isDaimyo: true }],
        [30, { id: 1019006, clan: 30, isDaimyo: true }],
        [1, { id: 1000001, clan: 1, isDaimyo: true }]
    ]);
    const game = {
        clans: [
            { id: 1, daimyoPrestige: 5000, isDestroyed: false },
            { id: 19, daimyoPrestige: 10000, isDestroyed: false },
            { id: 30, daimyoPrestige: 12000, isDestroyed: false }
        ],
        getClanDaimyo: id => daimyoByClan.get(Number(id)) || null
    };
    const system = new KunishuSystem(game);
    const ganshoji = new Kunishu({ id: 4, ideology: '宗教', networkTag: 'ikko' });
    const otherTemple = new Kunishu({ id: 47, ideology: '宗教' });

    assert.strictEqual(ganshoji.ideology, '宗教');
    assert.strictEqual(ganshoji.networkTag, 'ikko');
    assert.strictEqual(system.isIkkoNetwork(ganshoji), true);
    assert.strictEqual(system.isIkkoNetwork(otherTemple), false);
    const untaggedIkko = new Kunishu({ id: 10001, name: '一向一揆', ideology: '宗教' });
    const untaggedGanshoji = new Kunishu({ id: 4, name: '願証寺', ideology: '宗教' });
    system.setKunishuData([untaggedIkko, untaggedGanshoji]);
    assert.strictEqual(untaggedIkko.networkTag, '', 'IDからnetworkTagを推測補完しない');
    assert.strictEqual(untaggedGanshoji.networkTag, '', '名称からnetworkTagを推測補完しない');
    assert.strictEqual(system.getHonganjiClan().id, 30, '本願寺系大名のうち威信最大を採用する');

    game.clans[2].isDestroyed = true;
    assert.strictEqual(system.getHonganjiClan().id, 19, '滅亡した本願寺系勢力は候補から外す');
});

test('本願寺関係は一向宗友好度の上限として下方向だけ月次連動する', () => {
    const ctx = createContext();
    loadScript(ctx, 'js/config.js');
    loadScript(ctx, 'js/models.js');
    loadScript(ctx, 'js/kunishu_system.js');
    const Kunishu = vm.runInContext('Kunishu', ctx);
    const KunishuSystem = vm.runInContext('KunishuSystem', ctx);

    const relations = new Map([['1:19', 20], ['19:1', 20]]);
    const diplomacyManager = {
        getRelation(a, b) { return { sentiment: relations.get(`${a}:${b}`) ?? 50 }; },
        updateSentiment(a, b, delta) {
            for (const key of [`${a}:${b}`, `${b}:${a}`]) {
                relations.set(key, Math.max(0, Math.min(100, (relations.get(key) ?? 50) + delta)));
            }
        }
    };
    const game = {
        clans: [
            { id: 1, daimyoPrestige: 5000, isDestroyed: false },
            { id: 19, daimyoPrestige: 10000, isDestroyed: false }
        ],
        getClanDaimyo: id => Number(id) === 19
            ? { id: 1019005, clan: 19, isDaimyo: true }
            : { id: 1000001, clan: 1, isDaimyo: true },
        diplomacyManager
    };
    const system = new KunishuSystem(game);
    const ikko = new Kunishu({
        id: 10001,
        ideology: '宗教',
        networkTag: 'ikko',
        daimyoRelations: {
            1: { status: '普通', sentiment: 50 },
            19: { status: '普通', sentiment: 40 }
        }
    });
    system.setKunishuData([ikko]);

    system.applyIkkoNetworkRelationLink();
    assert.strictEqual(ikko.getRelation(1), 49, '本願寺20より高い50は1だけ悪化する');
    assert.strictEqual(ikko.getRelation(19), 100, '本願寺家との関係は100に固定する');

    ikko.setRelation(1, 10);
    system.applyIkkoNetworkRelationLink();
    assert.strictEqual(ikko.getRelation(1), 10, '本願寺20より低い関係を20へ自動回復させない');
});

test('一向宗のいる城の占領は現地関係を下げ、本願寺への波及は城ごとに1回だけ', () => {
    const ctx = createContext();
    loadScript(ctx, 'js/config.js');
    loadScript(ctx, 'js/models.js');
    loadScript(ctx, 'js/kunishu_system.js');
    const Kunishu = vm.runInContext('Kunishu', ctx);
    const KunishuSystem = vm.runInContext('KunishuSystem', ctx);

    let honganjiSentiment = 50;
    const diplomacyManager = {
        getRelation() { return { sentiment: honganjiSentiment }; },
        updateSentiment(a, b, delta) { honganjiSentiment = Math.max(0, Math.min(100, honganjiSentiment + delta)); }
    };
    const game = {
        playerClanId: 1,
        clans: [
            { id: 1, daimyoPrestige: 5000, isDestroyed: false },
            { id: 19, daimyoPrestige: 10000, isDestroyed: false }
        ],
        getClanDaimyo: id => Number(id) === 19
            ? { id: 1019005, clan: 19, isDaimyo: true }
            : { id: 1000001, clan: 1, isDaimyo: true },
        diplomacyManager,
        ui: { log() {} }
    };
    const system = new KunishuSystem(game);
    const makeIkko = id => new Kunishu({
        id,
        name: id === 4 ? '願証寺' : '一向一揆',
        castleId: 44,
        ideology: '宗教',
        networkTag: 'ikko',
        daimyoRelations: { 1: { status: '普通', sentiment: 50 } }
    });
    const ganshoji = makeIkko(4);
    const ikko = makeIkko(10001);
    system.setKunishuData([ganshoji, ikko]);

    system.applyRelationDropOnCastleCapture({ id: 44 }, 1);
    assert.strictEqual(ganshoji.getRelation(1), 30);
    assert.strictEqual(ikko.getRelation(1), 30);
    assert.strictEqual(honganjiSentiment, 45, '同一城に複数一向宗勢力がいても本願寺-5は1回だけ');
});

test('一向宗討伐の開始は対象との関係と本願寺関係を同時に悪化させる', () => {
    const ctx = createContext();
    loadScript(ctx, 'js/config.js');
    loadScript(ctx, 'js/models.js');
    loadScript(ctx, 'js/kunishu_system.js');
    const Kunishu = vm.runInContext('Kunishu', ctx);
    const KunishuSystem = vm.runInContext('KunishuSystem', ctx);

    let honganjiSentiment = 50;
    const diplomacyManager = {
        getRelation() { return { sentiment: honganjiSentiment }; },
        updateSentiment(a, b, delta) { honganjiSentiment = Math.max(0, Math.min(100, honganjiSentiment + delta)); }
    };
    const game = {
        clans: [
            { id: 1, daimyoPrestige: 5000, isDestroyed: false },
            { id: 19, daimyoPrestige: 10000, isDestroyed: false }
        ],
        getClanDaimyo: id => Number(id) === 19
            ? { id: 1019005, clan: 19, isDaimyo: true }
            : { id: 1000001, clan: 1, isDaimyo: true },
        diplomacyManager
    };
    const system = new KunishuSystem(game);
    const ikko = new Kunishu({
        id: 10001,
        ideology: '宗教',
        networkTag: 'ikko',
        daimyoRelations: { 1: { status: '普通', sentiment: 50 } }
    });

    system.applySubjugationHostility(ikko, 1);
    assert.strictEqual(ikko.getRelation(1), 20, '従来の討伐開始時-30を維持する');
    assert.strictEqual(honganjiSentiment, 40, '一向宗への攻撃で本願寺も-10');
});

test('諸勢力関係の占領計算と本願寺家定義は KunishuSystem に一元化する', () => {
    const castleSource = read('js/castle_manager.js');
    const kunishuSource = read('js/kunishu_system.js');
    assert.ok(castleSource.includes('kunishuSystem.applyRelationDropOnCastleCapture'));
    assert.ok(castleSource.includes('kunishuSystem.isHonganjiClan'));
    assert.ok(!castleSource.includes('applyKunishuRelationDropOnCapture'));
    assert.ok(!castleSource.includes('1019001'));
    assert.ok(!castleSource.includes('1019999'));
    assert.ok(kunishuSource.includes('getHonganjiClan()'));
});



test('諸勢力関係値のゲーム中書換は KunishuSystem を正規窓口とし、本願寺と一向宗は100を維持する', () => {
    const ctx = createContext();
    loadScript(ctx, 'js/config.js');
    loadScript(ctx, 'js/models.js');
    loadScript(ctx, 'js/kunishu_system.js');
    const Kunishu = vm.runInContext('Kunishu', ctx);
    const KunishuSystem = vm.runInContext('KunishuSystem', ctx);
    const game = {
        clans: [{ id: 19, daimyoPrestige: 10000, isDestroyed: false }],
        getClanDaimyo: () => ({ id: 1019005, clan: 19, isDaimyo: true })
    };
    const system = new KunishuSystem(game);
    const ikko = new Kunishu({ id: 10001, ideology: '宗教', networkTag: 'ikko', daimyoRelations: { 19: { status: '友好', sentiment: 100 } } });
    system.setRelation(ikko, 19, 90);
    assert.strictEqual(ikko.getRelation(19), 100, '援軍要請や当主交代など別経路の低下も100へ固定する');

    const offenders = [];
    for (const entry of fs.readdirSync(path.join(ROOT, 'js'), { withFileTypes: true })) {
        if (!entry.isFile() || !entry.name.endsWith('.js') || entry.name.endsWith('.min.js')) continue;
        const rel = `js/${entry.name}`;
        if (rel === 'js/models.js' || rel === 'js/kunishu_system.js') continue;
        const source = read(rel);
        if (/\bkunishu\.setRelation\s*\(|\bnewKunishu\.setRelation\s*\(/.test(source)) offenders.push(rel);
    }
    assert.deepStrictEqual(offenders, []);
});

test('一向宗予約IDと通常の動的諸勢力IDは KunishuSystem で分離して採番する', () => {
    const ctx = createContext();
    loadScript(ctx, 'js/config.js');
    loadScript(ctx, 'js/kunishu_system.js');
    const KunishuSystem = vm.runInContext('KunishuSystem', ctx);
    const system = new KunishuSystem({ clans: [] });
    system.setKunishuData([
        { id: 10001 }, { id: 10002 }, { id: 10004 },
        { id: 20000 }, { id: 20003 }
    ]);
    assert.strictEqual(system.findAvailableIkkoGenerationId(), 10003);
    assert.strictEqual(system.allocateRegularDynamicKunishuId(), 20004);

    ctx.MainParams.Kunishu.IkkoNetwork.ReservedIdMin = 10001;
    ctx.MainParams.Kunishu.IkkoNetwork.ReservedIdMax = 10002;
    assert.strictEqual(system.findAvailableIkkoGenerationId(), 0, '予約帯に空きがなければ生成用IDを返さない');

    const affiliationSource = read('js/affiliation_system.js');
    assert.ok(affiliationSource.includes('kunishuSystem.allocateRegularDynamicKunishuId()'));
    assert.ok(!affiliationSource.includes('const newKunishuId = maxId + 1'));
});

test('1560桶狭間データは願証寺と既存一向一揆だけに ikko シールを持たせる', () => {
    const rows = getRuntimeData().scenario.kunishus;
    const tagged = rows.filter(row => row.networkTag === 'ikko').map(row => ({ id: Number(row.id), name: row.name, ideology: row.ideology }));
    assert.strictEqual(tagged.length, 19);
    assert.ok(tagged.some(row => row.id === 4 && row.name === '願証寺'));
    assert.strictEqual(tagged.filter(row => row.id >= 10001 && row.id <= 10018).length, 18);
    assert.ok(tagged.every(row => row.ideology === '宗教'), '一向宗シールを付けても思想は宗教のまま');
});

test('国主評定は月1回だけ開催でき、旧軍団は従来どおり自由裁量になる', () => {
    const ctx = createContext();
    loadScript(ctx, 'js/constants.js');
    loadScript(ctx, 'js/legion_policy_system.js');
    const LegionPolicySystem = vm.runInContext('LegionPolicySystem', ctx);
    const commander = { id: 10, clan: 1, status: 'active' };
    const game = {
        playerClanId: 1,
        year: 1560,
        month: 5,
        flags: {},
        legions: [{ clanId: 1, legionNo: 1, commanderId: 10 }],
        getBusho: id => Number(id) === 10 ? commander : null,
        getCurrentTurnId() { return this.year * 12 + this.month; },
        getRelation: () => ({ status: '普通' })
    };
    const system = new LegionPolicySystem(game);

    assert.deepStrictEqual(JSON.parse(JSON.stringify(system.getPolicy(1, 1))), {
        allowOffense: true,
        allowNewHostility: true
    });
    assert.strictEqual(system.canHoldCouncil(1), true);
    assert.strictEqual(system.beginCouncil(1), true);
    assert.strictEqual(system.canHoldCouncil(1), false);
    game.month = 6;
    assert.strictEqual(system.canHoldCouncil(1), true);
});

test('評定の新規交戦禁止は敵対中の相手だけ攻撃可能にし、攻勢禁止は自主攻撃を止める', () => {
    const ctx = createContext();
    loadScript(ctx, 'js/constants.js');
    loadScript(ctx, 'js/legion_policy_system.js');
    const LegionPolicySystem = vm.runInContext('LegionPolicySystem', ctx);
    const game = {
        playerClanId: 1,
        flags: {},
        legions: [{ clanId: 1, legionNo: 1, commanderId: 10 }],
        getBusho: id => Number(id) === 10 ? { id: 10, clan: 1, status: 'active' } : null,
        getCurrentTurnId: () => 100,
        getRelation: (a, b) => ({ status: Number(b) === 2 ? '敵対' : '普通' }),
        getCastle: () => null
    };
    const system = new LegionPolicySystem(game);

    system.setPolicy(1, 1, { allowOffense: true, allowNewHostility: false });
    assert.strictEqual(system.canAttackClan(1, 1, 2), true, '敵対勢力へは攻撃できる');
    assert.strictEqual(system.canAttackClan(1, 1, 3), false, '非敵対勢力へは攻撃しない');
    assert.strictEqual(system.canAttackClan(1, 1, 0), true, '空き城は新規交戦ではない');
    assert.strictEqual(system.canAttackTarget(1, 1, { isKunishuTarget: true }), true, '諸勢力は攻勢許可だけを見る');

    system.setPolicy(1, 1, { allowOffense: false, allowNewHostility: true });
    assert.strictEqual(system.canAttackClan(1, 1, 2), false);
    assert.strictEqual(system.canAttackTarget(1, 1, { isKunishuTarget: true }), false);
});


test('評定の一括命令は選択した項目だけを全軍団の下書きへ反映する', () => {
    const ctx = createContext();
    loadScript(ctx, 'js/legion_council_view.js');
    const LegionCouncilView = vm.runInContext('LegionCouncilView', ctx);
    const view = Object.create(LegionCouncilView.prototype);
    view.game = {
        legionPolicySystem: {
            getDefaultPolicy: () => ({ allowOffense: true, allowNewHostility: true }),
            normalizePolicy: raw => ({
                allowOffense: raw && raw.allowOffense !== false,
                allowNewHostility: raw && raw.allowNewHostility !== false
            })
        }
    };
    view.members = [
        { legionNo: 1, policy: { allowOffense: true, allowNewHostility: true } },
        { legionNo: 2, policy: { allowOffense: false, allowNewHostility: false } }
    ];
    view.draft = {
        1: { allowOffense: true, allowNewHostility: true },
        2: { allowOffense: false, allowNewHostility: false }
    };
    view.editingMode = 'bulk';
    view.editingPolicy = { allowOffense: false, allowNewHostility: null };
    view.editingTouched = new Set(['allowOffense']);
    view.renderSeats = () => {};
    view.closeOrderEditor = () => {};

    const common = view._getBulkCommonPolicy();
    assert.strictEqual(common.allowOffense, null, '軍団ごとに値が混在する項目は一括画面で未選択にする');
    assert.strictEqual(common.allowNewHostility, null, '新規交戦も混在時は未選択にする');

    view.confirmOrderEditor();
    assert.deepStrictEqual(JSON.parse(JSON.stringify(view.draft)), {
        1: { allowOffense: false, allowNewHostility: true },
        2: { allowOffense: false, allowNewHostility: false }
    }, '一括操作で触っていない項目は各軍団の既存下書きを維持する');
});

test('評定方針は観戦・AI操作中は拘束を停止し、プレイヤー復帰時に保存値を再適用する', () => {
    const ctx = createContext();
    loadScript(ctx, 'js/constants.js');
    loadScript(ctx, 'js/legion_policy_system.js');
    const LegionPolicySystem = vm.runInContext('LegionPolicySystem', ctx);
    const game = {
        playerClanId: 1,
        isWatchMode: false,
        flags: {},
        legions: [{ clanId: 1, legionNo: 1, commanderId: 10 }],
        getBusho: id => Number(id) === 10 ? { id: 10, clan: 1, status: 'active' } : null,
        getCurrentTurnId: () => 100,
        getRelation: () => ({ status: '普通' }),
        getCastle: () => null
    };
    const system = new LegionPolicySystem(game);
    system.setPolicy(1, 1, { allowOffense: false, allowNewHostility: false });
    assert.strictEqual(system.canAttackClan(1, 1, 2), false, 'プレイヤー操作中は評定の攻勢禁止を守る');

    game.isWatchMode = true;
    game.playerClanId = -100;
    assert.strictEqual(system.canAttackClan(1, 1, 2), true, '観戦中は保存済み評定でAI勢力を拘束しない');
    assert.strictEqual(system.getPolicy(1, 1).allowOffense, false, '観戦中も評定内容そのものは保存しておく');

    game.isWatchMode = false;
    game.playerClanId = 1;
    assert.strictEqual(system.canAttackClan(1, 1, 2), false, '同じ勢力へ復帰すると以前の評定命令が再び有効になる');
});

test('観戦への切替では直轄AI作戦を準備し、プレイヤー復帰時は直轄作戦を片付ける', () => {
    const gameSource = read('js/game.js');
    const operationSource = read('js/ai_operation.js');
    assert.ok(gameSource.includes('onClanBecameAIControlled(previousPlayerClanId)'), '観戦開始時は作戦専門部署へAI移行を通知する');
    assert.ok(gameSource.includes('onClanBecamePlayerControlled(selectedClan.id)'), '観戦終了時は作戦専門部署へプレイヤー移行を通知する');
    assert.ok(operationSource.includes('await this.generateOperation(clanId, 0)'), 'AI化した直轄軍団0にはその場で作戦を補う');
    assert.ok(operationSource.includes('this.clearLegionPlanning(clanId, 0)'), 'プレイヤー化した直轄軍団0のAI作戦は残さない');
    assert.ok(operationSource.includes('this.reconcileLegionPolicy(clanId, legionNo)'), 'プレイヤー復帰時は非直轄軍団へ保存済み評定を再適用する');
});
test('評定方針の確定は LegionPolicySystem が保存し、作戦専門部署へ再確認だけ依頼する', () => {
    const ctx = createContext();
    loadScript(ctx, 'js/constants.js');
    loadScript(ctx, 'js/legion_policy_system.js');
    const LegionPolicySystem = vm.runInContext('LegionPolicySystem', ctx);
    let reconcileCount = 0;
    const game = {
        playerClanId: 1,
        flags: {},
        legions: [{ clanId: 1, legionNo: 1, commanderId: 10 }],
        getBusho: id => Number(id) === 10 ? { id: 10, clan: 1, status: 'active' } : null,
        getCurrentTurnId: () => 100,
        getRelation: () => ({ status: '敵対' }),
        aiOperationManager: { reconcileLegionPolicy() { reconcileCount++; } }
    };
    const system = new LegionPolicySystem(game);
    const changed = system.commitPolicies(1, { 1: { allowOffense: false, allowNewHostility: false } });
    assert.strictEqual(changed, 1);
    assert.strictEqual(game.legions[0].policy.allowOffense, false);
    assert.strictEqual(game.legions[0].policy.allowNewHostility, false);
    assert.strictEqual(reconcileCount, 1);
});

test('評定UIとAIは方針専門部署を正本として参照する', () => {
    const catalog = read('js/command_catalog.js');
    const command = read('js/command_system.js');
    const operation = read('js/ai_operation.js');
    const ai = read('js/ai.js');
    const html = read('index.html');
    const css = read('css/style.css');
    const ui = read('js/ui.js');

    assert.ok(catalog.includes("'legion_council'"));
    assert.ok(catalog.includes('game.legionPolicySystem.canHoldCouncil'));
    assert.ok(command.includes('this.game.ui.legionCouncilView.requestOpen()'));
    assert.ok(operation.includes('this.game.legionPolicySystem.canAttackClan'));
    assert.ok(operation.includes('this.game.legionPolicySystem.isOffenseAllowed'));
    assert.ok(ai.includes('this.game.legionPolicySystem.isOperationAllowed'));
    assert.ok(html.includes('id="legion-council-modal"'));
    assert.ok(html.includes('id="legion-council-order-modal"'));
    assert.ok(html.includes('js/legion_policy_system.js'));
    assert.ok(html.includes('js/legion_council_view.js'));
    assert.ok(ui.includes("!footer.classList.contains('modal-footer-inside')"));
    assert.ok(css.includes('body:not(.is-pc) .legion-council-stage'));

    const councilView = read('js/legion_council_view.js');
    assert.ok(councilView.includes("this.modal.querySelectorAll('.legion-council-seat')"), '評定は軍団カード全体を選択対象にする');
    assert.ok(councilView.includes('openOrderEditor'), '軍団別命令は評定一覧と別画面で開く');
    assert.ok(councilView.includes('this.editingPolicy'), '軍団別命令は評定全体とは別の局所下書きを持つ');
    assert.ok(councilView.includes('confirmOrderEditor'), '軍団別命令は確定時だけ評定全体の下書きへ反映する');
    assert.ok(html.includes('id="legion-council-bulk-btn"'), '評定一覧下部に一括ボタンを置く');
    assert.ok(html.includes('class="daimyo-detail-action-btn legion-council-bulk-btn"'), '評定の一括は勢力詳細・拠点詳細と同じ小型操作ボタンを使う');
    assert.ok(councilView.includes('openBulkEditor'), '一括ボタンは専用の一括編集モードを開く');
    assert.ok(councilView.includes('this.editingTouched'), '一括編集は変更した項目だけを全軍団へ反映できるよう変更項目を追跡する');
    assert.ok(councilView.includes("this.orderConfirmBtn.textContent = isBulk ? '一括適用' : '確定'"), '一括編集では確定ボタンを一括適用と表示する');
    const openOrderStart = councilView.indexOf('openOrderEditor(legionNo)');
    const openOrderEnd = councilView.indexOf('closeOrderEditor()', openOrderStart);
    const openOrderBlock = councilView.slice(openOrderStart, openOrderEnd);
    assert.ok(openOrderBlock.includes("playSE('choice.ogg')"), '軍団カードから命令画面を開く時は選択SEを鳴らす');
    assert.ok(html.includes('id="legion-council-order-confirm-btn"'), '命令画面に確定ボタンを置く');
    assert.ok(html.includes('class="modal-footer legion-council-order-footer"'), '命令画面の確定/戻るは標準モーダルと同じく内容枠の外へ出す');
    assert.ok(html.includes('class="modal-footer legion-council-footer"'), '評定を終えるボタンも標準モーダルと同じく内容枠の外へ出す');
    assert.ok(!html.includes('modal-footer modal-footer-inside legion-council-footer'), '評定本体だけ内部フッターにする例外を残さない');
    assert.strictEqual((councilView.match(/data-se="choice\.ogg"/g) || []).length, 4, '許可/禁止の4選択肢はすべて choice SE を明示する');
    assert.ok(ui.includes("const explicitSe = btn.dataset ? btn.dataset.se : '';"), '共通UIは data-se による明示SEを優先する');
    const councilCss = read('css/style.css');
    const hoverStart = councilCss.indexOf('.legion-council-seat:hover');
    const hoverEnd = councilCss.indexOf('.legion-council-seat-heading', hoverStart);
    assert.ok(hoverStart >= 0 && !councilCss.slice(hoverStart, hoverEnd).includes('translateY(-1px)'), '軍団カードはhover/focusで上へ動かして見切れさせない');
    assert.ok(!html.includes('modal-footer modal-footer-inside legion-council-order-footer'), '命令画面だけフッターを内部保持する例外を残さない');
    assert.ok(html.includes('id="legion-council-order-back-btn"') && html.includes('>戻る</button>'), '命令画面に右クリック互換の戻るボタンを置く');
    assert.ok(ui.includes("const targetTexts = ['閉じる', '戻る', 'いいえ', 'やめる']"), 'PC右クリックは標準の戻る・中止系文言を共通キャンセル操作として扱う');
    assert.ok(ui.includes("btn.dataset && btn.dataset.se === 'cancel.ogg'"), '具体的な○○へ戻る表記もdata-seの意味宣言で右クリック取消対象にできる');
    assert.ok(!councilView.includes('legion-council-order-btn'), '軍団カード内に個別命令ボタンを残さない');
});

test('評定の二択UIは設定画面と同系統の切替表示を使い、確定SEを二重再生しない', () => {
    const councilView = read('js/legion_council_view.js');
    const css = read('css/style.css');
    assert.strictEqual((councilView.match(/class=\"ui-toggle-btn/g) || []).length, 4, '許可/禁止は4つとも汎用切替ボタンを使う');
    assert.ok(css.includes('.troop-type-btn,\n.ui-toggle-btn'), '評定切替はユーザー設定と同じ基本ボタン配色を共有する');
    const confirmOrderStart = councilView.indexOf('\n    confirmOrderEditor() {');
    const renderOrderStart = councilView.indexOf('\n    renderOrderEditor() {', confirmOrderStart);
    assert.ok(!councilView.slice(confirmOrderStart, renderOrderStart).includes("playSE('choice.ogg')"), '軍団命令の確定は共通decision SEに重ねてchoiceを鳴らさない');
    const confirmFinishStart = councilView.indexOf('\n    confirmFinish() {');
    assert.ok(!councilView.slice(confirmFinishStart).includes("playSE('choice.ogg')"), '命令を確定する確認後にchoiceを重ねて二重SEにしない');
    assert.ok(councilView.includes("cancelText: '戻る'"), '評定終了確認のキャンセルは共通の戻る表記にしてcancel SEへ揃える');
    assert.ok(!councilView.includes("cancelText: '評定に戻る'"), '評定に戻るという個別文言を残さない');
});

test('評定終了ボタンは銀のキャンセル系として扱う', () => {
    const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
    assert.ok(/id="legion-council-finish-btn"[^>]*data-se="cancel\.ogg"[^>]*class="btn-secondary"/.test(html));
});

test('寿命補正は LifeSystem が sourceId ごとに安全に適用・解除する', () => {
    const ctx = createContext();
    loadScript(ctx, 'js/life_system.js');
    const LifeSystem = vm.runInContext('LifeSystem', ctx);
    const busho = { id: 1020005, endYear: 1564, lifespanModifiers: {} };
    const game = { getBusho: id => Number(id) === 1020005 ? busho : null };
    const system = new LifeSystem(game);

    assert.strictEqual(system.setLifespanModifier(1020005, 'historical_test', 5), 5);
    assert.strictEqual(busho.endYear, 1569);
    assert.strictEqual(busho.lifespanModifiers.historical_test, 5);

    // 同じ補正を再同期しても二重加算しない。
    assert.strictEqual(system.setLifespanModifier(busho, 'historical_test', 5), 0);
    assert.strictEqual(busho.endYear, 1569);

    // 他の仕組みによる寿命変更が後から入っても、このsource分だけ解除する。
    busho.endYear += 10;
    assert.strictEqual(system.removeLifespanModifier(busho, 'historical_test'), -5);
    assert.strictEqual(busho.endYear, 1574);
    assert.strictEqual(busho.lifespanModifiers.historical_test, undefined);
});

test('寿命補正の付け外しは寿命前低下を使う能力値へ即時反映する', () => {
    const ctx = createContext();
    loadScript(ctx, 'js/life_system.js');
    const LifeSystem = vm.runInContext('LifeSystem', ctx);
    const busho = {
        id: 1020005, birthYear: 1522, endYear: 1564, isNotBorn: false, status: 'active',
        baseLeadership: 100, baseStrength: 100, basePolitics: 100, baseDiplomacy: 100, baseIntelligence: 100,
        leadership: 0, strength: 0, politics: 0, diplomacy: 0, intelligence: 0,
        lifespanModifiers: {}
    };
    ctx.window.LifeStatusRules = { isUnborn: () => false };
    const game = { year: 1560, getBusho: id => Number(id) === 1020005 ? busho : null };
    const system = new LifeSystem(game);

    system.recalculateBushoAgeStats(busho);
    assert.strictEqual(busho.leadership, 96, '1564没なら1560年時点で寿命前補正-4が入る');
    system.setLifespanModifier(busho, 'historical_test', 5);
    assert.strictEqual(busho.endYear, 1569);
    assert.strictEqual(busho.leadership, 100, '寿命+5を適用した瞬間に寿命前補正を外す');
    system.removeLifespanModifier(busho, 'historical_test');
    assert.strictEqual(busho.endYear, 1564);
    assert.strictEqual(busho.leadership, 96, '寿命補正を解除した瞬間に寿命前補正を戻す');
});

test('常駐歴史イベントは EventManager が状態遷移だけを管理し通常イベント枠を消費しない', () => {
    const source = read('js/event_manager.js');
    assert.ok(source.includes("eventData.type === 'resident'"));
    assert.ok(source.includes('this.game.flags.__residentEventStates'));
    assert.ok(source.includes("await this.processResidentEvents(timing, context, isHistoricalOff, flowGeneration)"));
    assert.ok(source.includes("stateBook[ev.id] = { active: isActive };"));

    // resident は通常 events 配列へ入れず、通常歴史イベントの historicalEventOccurred を立てない。
    const registerBlock = source.slice(source.indexOf('registerEvent(eventData)'), source.indexOf('/**\n     * 常駐イベント'));
    assert.ok(registerBlock.includes('this.residentEvents[timing].push(eventData)'));
    assert.ok(registerBlock.includes('return;'));
});

test('歴史イベントOFF時は適用中の歴史常駐効果を解除し、ON時は次の登録タイミングで再評価する', async () => {
    const ctx = createContext();
    let enters = 0;
    let exits = 0;
    ctx.window.GameEvents = [{
        id: 'historical_resident_test',
        type: 'resident',
        timings: ['startMonth_before', 'endMonth_before'],
        checkCondition: () => true,
        onEnter: async () => { enters += 1; },
        onExit: async () => { exits += 1; }
    }];
    ctx.window.UserSettings = { historicalEvent: true };
    loadScript(ctx, 'js/event_manager.js');
    const EventManager = vm.runInContext('EventManager', ctx);
    const game = { flags: {}, writeSystemDiagnostic() {} };
    const manager = new EventManager(game);

    await manager.processEvents('startMonth_before');
    assert.strictEqual(enters, 1, 'ON中は条件成立で常駐効果を適用する');
    assert.strictEqual(game.flags.__residentEventStates.historical_resident_test.active, true);

    ctx.window.UserSettings.historicalEvent = false;
    await manager.onHistoricalEventSettingChanged(false);
    assert.strictEqual(exits, 1, '設定OFFの瞬間に適用中の常駐効果を解除する');
    assert.strictEqual(game.flags.__residentEventStates.historical_resident_test.active, false);

    await manager.processEvents('endMonth_before');
    assert.strictEqual(enters, 1, 'OFF中は条件成立でも再適用しない');
    assert.strictEqual(exits, 1, '解除済み効果を月末で二重解除しない');

    ctx.window.UserSettings.historicalEvent = true;
    await manager.onHistoricalEventSettingChanged(true);
    assert.strictEqual(enters, 1, '再ONした瞬間には常駐効果を勝手に再適用しない');
    await manager.processEvents('startMonth_before');
    assert.strictEqual(enters, 2, '再ON後は次の登録タイミングで条件を再評価して適用する');
});

test('三好長慶の寿命補正は historical_event 側が条件・対象・年数を所有する', () => {
    const historical = read('js/event/historical_event.js');
    const life = read('js/life_system.js');
    const eventId = 'historical_miyoshi_nagayoshi_yoshioki_lifespan';
    const start = historical.indexOf(`id: "${eventId}"`);
    assert.ok(start >= 0, '三好寿命常駐イベントが存在する');
    const end = historical.indexOf('// ==========================================', start + 1);
    const block = historical.slice(start, end);

    assert.ok(block.includes('type: "resident"'));
    assert.ok(block.includes('timings: ["startMonth_before", "endMonth_before"]'));
    assert.ok(block.includes('lifespanYears: 5'));
    assert.ok(block.includes('1020005'));
    assert.ok(block.includes('1020006'));
    assert.ok(block.includes('setLifespanModifier(nagayoshi, this.id, this.lifespanYears)'));
    assert.ok(block.includes('removeLifespanModifier(nagayoshi, this.id)'));

    assert.ok(!life.includes('1020005'), 'LifeSystem に三好長慶IDを持たせない');
    assert.ok(!life.includes('1020006'), 'LifeSystem に三好義興IDを持たせない');
    assert.ok(!life.includes('三好長慶'), 'LifeSystem に三好固有知識を持たせない');
});

test('歴史イベントOFFでロードした場合も保存済みの歴史常駐効果を復元後に解除する', () => {
    const save = read('js/save_manager.js');
    assert.ok(save.includes("window.UserSettings.historicalEvent === false"));
    assert.ok(save.includes('await this.game.eventManager.onHistoricalEventSettingChanged(false)'));
    const restorePos = save.indexOf('this.game.lifeSystem.updateAllBushosAge();');
    const cleanupPos = save.indexOf('await this.game.eventManager.onHistoricalEventSettingChanged(false)', restorePos);
    assert.ok(cleanupPos > restorePos, 'Bushoとflagsを復元してから歴史常駐効果を解除する');
});

test('Busho は寿命補正付きセーブでも本来の没年と補正元を保持する', () => {
    const models = read('js/models.js');
    assert.ok(models.includes('data.originalEndYear !== undefined ? data.originalEndYear : data.endYear'));
    assert.ok(models.includes('this.lifespanModifiers = {};'));
    assert.ok(models.includes("Object.entries(data.lifespanModifiers)"));
});


test('武将寿命のゲーム中変更は LifeSystem を唯一の正規窓口とする', () => {
    const models = read('js/models.js');
    const interview = read('js/interview_system.js');
    const common = read('js/event/common_events.js');
    const life = read('js/life_system.js');

    assert.ok(!models.includes('this.isLifeExtended'), '旧isLifeExtendedフラグをモデルへ残さない');
    assert.ok(!models.includes('originalDeathAge'), 'modelsで討死延命量を計算しない');
    assert.ok(!interview.includes('busho.endYear ='), '面談はendYearを直接変更しない');
    assert.ok(!interview.includes('_shouldOfferDoctor') && !interview.includes('_showDoctorPrompt'), 'InterviewSystem に医師固有処理を残さない');
    assert.ok(interview.includes('processInterviewEvent({'), '面談挨拶後の特殊処理はEventManagerへ委譲する');
    assert.ok(interview.includes('returnToInterviewTop: () => this.showInterviewerList()'), '面談内イベント終了後は面談セッションを閉じずトップへ戻せる');
    assert.ok(!interview.includes('endInterview: () => this.close()'), '面談内イベントから面談セッションを直接閉じる旧経路を残さない');
    assert.ok(common.includes("id: 'common_interview_doctor'") && common.includes("timing: 'interview_after_greeting'"), '医師延命を面談コモンイベントとして登録する');
    assert.ok(common.includes("const returnToInterviewTop = typeof context.returnToInterviewTop === 'function'"), '医師イベントは面談トップ復帰コールバックを使う');
    assert.ok(!common.includes('const endInterview ='), '医師イベントに面談全体を閉じる専用コールバックを残さない');
    assert.ok(common.includes("['金が足りないため、医師を呼べませんでした……'],\n                                resumeInterview,"), '資金不足なら同じ武将の通常会話へ復帰する');
    assert.ok(common.includes("label: '診せない'") && common.includes('onClick: resumeInterview'), '医師を辞退したら同じ武将の通常会話へ進める');
    assert.ok(common.includes("[`${busho.name}は少し顔色が良くなったようです。`],\n                            returnToInterviewTop,"), '治療成功後だけ面談トップへ戻す');
    assert.ok(common.includes('hasBattleDeathLifespanExtension(busho)'), '従来どおり討死初期延命済み武将には医師延命を重ねない');
    assert.ok(common.includes('game.lifeSystem.setLifespanModifier(busho, this.id, extensionYears)'), '医師コモンイベントは寿命変更をLifeSystemへ委譲する');
    assert.ok(!interview.includes("'system:battle_death_initial'"), '面談側は討死補正sourceIdを直接知らない');
    assert.ok(common.includes("game.lifeSystem.setLifespanModifier(busho, this.id, 10)"), '今川義元+10はcommon eventからLifeSystemへ委譲する');
    assert.ok(life.includes("const sourceId = 'system:battle_death_initial'"), '討死初期延命のsourceIdをLifeSystemが所有する');

    const runtimeFiles = ['js/interview_system.js', 'js/event/common_events.js', 'js/event/historical_event.js'];
    for (const file of runtimeFiles) {
        const src = read(file);
        assert.ok(!/\.endYear\s*(?:\+?=|-=)/.test(src), `${file} に寿命の直接書換を残さない`);
    }
});

test('医師面談は辞退・資金不足でも通常会話を塞がない', () => {
    const common = read('js/event/common_events.js');
    const doctorStart = common.indexOf("id: 'common_interview_doctor'");
    const doctorEnd = common.indexOf('// ==========================================\n// ★ ゲーム開始時：特定武将の寿命延長', doctorStart);
    assert.ok(doctorStart >= 0 && doctorEnd > doctorStart, '医師イベント範囲を取得できる');
    const doctor = common.slice(doctorStart, doctorEnd);

    const noDoctorPos = doctor.indexOf("label: '診せない'");
    assert.ok(noDoctorPos >= 0, '診せない選択肢が存在する');
    assert.ok(doctor.slice(noDoctorPos, noDoctorPos + 320).includes('onClick: resumeInterview'), '診せないは同じ武将の会話メニューへ進む');

    const noGoldPos = doctor.indexOf('金が足りないため、医師を呼べませんでした');
    assert.ok(noGoldPos >= 0, '資金不足メッセージが存在する');
    assert.ok(doctor.slice(noGoldPos, noGoldPos + 260).includes('resumeInterview'), '資金不足後も同じ武将の会話メニューへ進む');

    const successPos = doctor.indexOf('少し顔色が良くなったようです');
    assert.ok(successPos >= 0, '治療成功メッセージが存在する');
    assert.ok(doctor.slice(successPos, successPos + 260).includes('returnToInterviewTop'), '治療成功後は面談トップへ戻る');
});

test('医師面談の選択後遷移は辞退・資金不足・治療成功で正しく分かれる', async () => {
    const ctx = createContext({ GameEvents: [], Promise, setTimeout, clearTimeout });
    loadScript(ctx, 'js/event/common_events.js');
    const doctor = ctx.GameEvents.find(event => event && event.id === 'common_interview_doctor');
    assert.ok(doctor, '医師イベントを登録できる');

    async function runScenario(gold, label) {
        let choices = null;
        let messageCallback = null;
        let resumed = 0;
        let returnedTop = 0;
        const castle = { gold };
        const busho = { id: 1, name: '試験武将', birthYear: 1500, endYear: 1560 };
        const view = {
            showPrompt(_busho, _message, promptChoices) { choices = promptChoices; },
            showMessages(_busho, _messages, callback) { messageCallback = callback; }
        };
        const game = {
            ui: { interviewView: view },
            getCurrentTurnCastle: () => castle,
            lifeSystem: {
                setLifespanModifier() {},
                hasLifespanModifier: () => false,
                hasBattleDeathLifespanExtension: () => false
            }
        };

        await doctor.execute(game, {
            busho,
            resumeInterview: () => { resumed++; },
            returnToInterviewTop: () => { returnedTop++; }
        });
        const choice = choices && choices.find(item => item.label === label);
        assert.ok(choice, `${label} の選択肢を取得できる`);
        choice.onClick();
        if (messageCallback) messageCallback();
        return { resumed, returnedTop, gold: castle.gold };
    }

    assert.deepStrictEqual(await runScenario(500, '診せない'), { resumed: 1, returnedTop: 0, gold: 500 });
    assert.deepStrictEqual(await runScenario(100, '医師に診せる'), { resumed: 1, returnedTop: 0, gold: 100 });
    assert.deepStrictEqual(await runScenario(500, '医師に診せる'), { resumed: 0, returnedTop: 1, gold: 300 });
});

test('討死武将の初期延命は LifeSystem が従来ルールを再現する', () => {
    const ctx = createContext();
    ctx.window.LifeStatusRules = { isUnborn: () => false };
    loadScript(ctx, 'js/life_system.js');
    const LifeSystem = vm.runInContext('LifeSystem', ctx);
    const young = {
        id: 1, birthYear: 1530, originalEndYear: 1560, endYear: 1560, isKilledInBattle: true,
        status: 'active', isNotBorn: false, lifespanModifiers: {},
        baseLeadership: 50, baseStrength: 50, basePolitics: 50, baseDiplomacy: 50, baseIntelligence: 50
    };
    const older = {
        id: 2, birthYear: 1500, originalEndYear: 1560, endYear: 1560, isKilledInBattle: true,
        status: 'active', isNotBorn: false, lifespanModifiers: {},
        baseLeadership: 50, baseStrength: 50, basePolitics: 50, baseDiplomacy: 50, baseIntelligence: 50
    };
    const alreadyDead = {
        id: 3, birthYear: 1500, originalEndYear: 1559, endYear: 1559, isKilledInBattle: true,
        status: 'dead', isNotBorn: false, lifespanModifiers: {},
        baseLeadership: 50, baseStrength: 50, basePolitics: 50, baseDiplomacy: 50, baseIntelligence: 50
    };
    const game = { year: 1560, bushos: [young, older, alreadyDead], getBusho: id => [young, older, alreadyDead].find(b => b.id === Number(id)) };
    const system = new LifeSystem(game);
    system.initializeBattleDeathLifespans(1560);
    assert.strictEqual(young.endYear, 1585, '45歳未満の討死予定は55歳まで延命する');
    assert.strictEqual(older.endYear, 1570, '45歳以上の討死予定は+10年する');
    assert.strictEqual(alreadyDead.endYear, 1559, '開始前年以前に死亡済みなら延命しない');
    assert.strictEqual(young.lifespanModifiers['system:battle_death_initial'], 25);
    assert.strictEqual(older.lifespanModifiers['system:battle_death_initial'], 10);
});

test('実データのシナリオ登録はindex.binを正本にし、シナリオ選択UIはレイアウト確認用に残す', () => {
    const runtimeIndex = getRuntimeData().index;
    const index = read('index.html');
    const visualGuide = read('tests/visual/guide.html');
    assert.strictEqual(runtimeIndex.format, 'sengoku-scenario-index-v1');
    assert.deepStrictEqual(runtimeIndex.scenarios.map(s => s.folder), ['1560_okehazama']);
    assert.ok(index.includes('id="scenario-modal"'), '実ゲームのシナリオ選択画面は残す');
    assert.ok(visualGuide.includes('id="scenario-modal"'), 'レイアウト回帰用のシナリオ選択画面も残す');
    assert.ok(visualGuide.match(/scenario-placeholder/g)?.length >= 8, 'レイアウト確認用ダミースロットを8枠表示する');
});

test('シナリオ選択のダミー8枠は実シナリオへ混ぜず、件数増加時だけ多列化する', () => {
    const config = read('js/config.js');
    const runtimeIndex = getRuntimeData().index;
    const ui = read('js/ui.js');
    const css = read('css/style.css');
    assert.ok(config.includes('PlaceholderSlots: 8'));
    assert.strictEqual(runtimeIndex.scenarios.length, 1, '実データ登録は桶狭間1件だけにする');
    assert.ok(ui.includes("div.className = 'clan-btn scenario-placeholder'"));
    assert.ok(ui.includes("div.setAttribute('aria-disabled', 'true')"));
    assert.ok(ui.includes("const useMultiColumnLayout = totalScenarioSlots > 4"));
    assert.ok(ui.includes("scenarioContent.classList.toggle('scenario-layout-many', useMultiColumnLayout)"));
    assert.ok(ui.includes("this.scenarioList.classList.toggle('scenario-list-many', useMultiColumnLayout)"));
    assert.ok(css.includes('#scenario-modal .clan-btn.scenario-placeholder'));
    assert.ok(css.includes('#scenario-modal #scenario-list.scenario-list-many'));
    assert.ok(css.includes('grid-template-columns: repeat(2, minmax(0, 1fr));'));
});

test('1560シナリオ説明はindex.binでユーザー調整版を維持する', () => {
    const data = getRuntimeData().index.scenarios.find(s => s.folder === '1560_okehazama');
    assert.ok(data.desc.includes('永禄三年、畿内では三好氏が権勢を誇っていた。'));
    assert.ok(data.desc.includes('彼はいまだ、尾張一国すら纏め上げられていない。'));
});

test('selector決定ボタンは再有効化時に旧inline透明度を持ち越さない', () => {
    const view = read('js/selector_modal_view.js');
    const uiInfo = read('js/ui_info.js');
    const kyoten = read('js/ui_info_kyoten.js');
    assert.ok(view.includes('setConfirmEnabled(enabled)'));
    assert.ok(view.includes("removeProperty('opacity')"));
    assert.ok(uiInfo.includes('this.selectorView.setConfirmEnabled(enabled)'));
    assert.ok(kyoten.includes('this.selectorView.setConfirmEnabled(isChanged)'));
});

test('地図ロードは帯状1走査とコンパクトIDマップで古いスマホの負荷を抑える', () => {
    const data = read('js/data_manager.js');
    const uiMap = read('js/ui_map.js');
    const ui = read('js/ui.js');
    const html = read('index.html');

    assert.ok(data.includes('static async scanImageByStrips'), '巨大画像の読取は帯状共通ローダーを使う');
    assert.ok(data.includes('const stripHeightBase = isPC ? 128 : 32;'), '巨大画像はPC128行・スマホ32行の帯で処理する');
    assert.ok(data.includes('static async loadCastleSeedPoints'), '城色画像は領域ではなく種点座標として解釈する');
    assert.ok(data.includes('static async buildCastleTerritoryMap'), '国IDと城種点から全領域の城IDマップを構築する');
    assert.ok(data.includes('const yieldEvery = isPC ? 262144 : 65536;'), 'BFSもスマホでは短い間隔でyieldする');
    assert.ok(data.includes('new Uint32Array(territoryPixelCount)'), 'BFSキューは全地図ではなく実領域pixel数だけ確保する');
    assert.ok(data.includes('this.createCompactIdArray(maxCastleId, width * height)'), 'RGBAではなく城ID配列を保持する');
    assert.ok(data.includes('if (maxId <= 255) return new Uint8Array(length);'), '現行城/国IDでは1pixel=1byteを選べる');
    assert.ok(!data.includes('this.provinceImageData = ctx.getImageData'), '巨大province RGBAを常駐保持しない');
    assert.ok(!uiMap.includes('const queue = new Int32Array(pixelSize)'), '初回描画で全画面BFSキューを確保しない');
    assert.ok(uiMap.includes('const scale = isPC ? 1 : 0.5;'), 'スマホ勢力色Canvasは内部解像度を半分にする');
    assert.ok(html.includes('id="loading-progress-text"'));
    assert.ok(ui.includes('updateLoadingProgress(progress, label = null)'), 'ロード画面は実進捗を表示する');
    assert.ok(!ui.includes('audio.oncanplaythrough = audio.onerror'), 'タイトルロードでSEのcanplaythrough待ちをしない');
    assert.ok(ui.includes("img.src = './data/images/map/shiro_icon001.png'"), 'タイトル段階の先読みは必要最小限にする');
});

test('イベント地図も共有IDマップを再利用し巨大RGBAを作り直さない', () => {
    const common = read('js/event/common_events.js');
    const typhoon = read('js/event/typhoon_event.js');

    assert.ok(common.includes('DataManager.provincePixelMap'), '地方イベントはDataManagerの国IDマップを再利用する');
    assert.ok(common.includes('DataManager.castlePixelMap'), '台風用城判定はDataManagerの城IDマップを再利用する');
    assert.ok(!common.includes('DataManager.provinceImageData'), '地方イベントで巨大province RGBAキャッシュへ戻らない');
    assert.ok(!common.includes('ProvinceImageDataCache') && !common.includes('CastleColorImageDataCache'), '廃止した巨大イベントキャッシュ名を残さない');
    assert.ok(!common.includes("ctx.getImageData(0, 0, canvas.width, canvas.height)"), 'イベント側で城色画像を全画面RGBA化しない');
    assert.ok(common.includes('groupByCastleId'), '同色城グループは小さな城ID->group表で維持する');
    assert.ok(typhoon.includes('const pixelCastleMap = castleIndex.pixelCastleMap;'));
    assert.ok(typhoon.includes('groupByCastleId[castleId]'), '台風判定は共有城IDマップから小表を引く');
});

test('今川義元のcommon延命は討死初期延命と別sourceで積み重なる', () => {
    const ctx = createContext();
    ctx.window.LifeStatusRules = { isUnborn: () => false };
    loadScript(ctx, 'js/life_system.js');
    const LifeSystem = vm.runInContext('LifeSystem', ctx);
    const yoshimoto = {
        id: 1004009, birthYear: 1519, originalEndYear: 1560, endYear: 1560, isKilledInBattle: true,
        status: 'active', isNotBorn: false, lifespanModifiers: {},
        baseLeadership: 90, baseStrength: 85, basePolitics: 80, baseDiplomacy: 80, baseIntelligence: 80
    };
    const game = { year: 1560, bushos: [yoshimoto], getBusho: id => Number(id) === yoshimoto.id ? yoshimoto : null };
    const system = new LifeSystem(game);
    system.initializeBattleDeathLifespans(1560);
    system.setLifespanModifier(yoshimoto, 'common_life_extension', 10);
    assert.strictEqual(yoshimoto.endYear, 1584, '従来どおり討死延命1560→1574の後にcommon +10を積む');
    assert.strictEqual(yoshimoto.lifespanModifiers['system:battle_death_initial'], 14);
    assert.strictEqual(yoshimoto.lifespanModifiers.common_life_extension, 10);
});

test('戦争時の忠誠補正は大名家所属者だけに共通加算される', () => {
    const ctx = createContext();
    loadScript(ctx, 'js/config.js');
    loadScript(ctx, 'js/war.js');
    const WarSystem = vm.runInContext('WarSystem', ctx);

    const daimyo = { clan: 1, loyalty: 100, leadership: 80, strength: 70, intelligence: 60, charm: 50 };
    const retainer = { clan: 1, loyalty: 25, leadership: 60, strength: 50, intelligence: 40, charm: 50 };
    const kunishu = { clan: 0, loyalty: 100, leadership: 80, strength: 70, intelligence: 60, charm: 50 };

    assert.strictEqual(WarSystem.calcLoyaltyBattleBonus(daimyo), 20, '忠誠100は最大+20');
    assert.strictEqual(WarSystem.calcLoyaltyBattleBonus(retainer), 10, '忠誠25は+10');
    assert.strictEqual(WarSystem.calcLoyaltyBattleBonus({ ...retainer, loyalty: 0 }), 0, '忠誠0でも減点はしない');
    assert.strictEqual(WarSystem.calcLoyaltyBattleBonus(kunishu), 0, '諸勢力には主君忠誠補正を与えない');

    const stats = WarSystem.calcUnitStats([daimyo, retainer]);
    assert.ok(Math.abs(stats.loyaltyBonus - 22) < 1e-9, '副将補正は既存の副将寄与率0.2で薄く加える');

    const warSource = read('js/war.js');
    const fieldSource = read('js/field_war.js');
    assert.ok(warSource.includes('WarSystem.calcGroupLoyaltyBattleBonus(leader, subs, 0.05)'), '攻城戦も共通忠誠補正を使う');
    assert.ok(fieldSource.includes('WarSystem.calcLoyaltyBattleBonus(atkBusho)'), '野戦も共通忠誠補正を使う');
    assert.ok(!fieldSource.includes('Math.sqrt(atkBusho.loyalty)'), '野戦側へ忠誠式を複製しない');
});

test('攻城戦と野戦のホーム補正は WarSystem の共通計算を使う', () => {
    const ctx = createContext();
    ctx.window.WarParams = { War: {}, Military: {} };
    loadScript(ctx, 'js/war.js');
    const WarSystem = vm.runInContext('WarSystem', ctx);

    const castles = new Map([
        [10, { id: 10, provinceId: 1 }],
        [11, { id: 11, provinceId: 2 }],
        [12, { id: 12, provinceId: 3 }]
    ]);
    const game = {
        legions: [
            // id=2 は別家の軍団。castle.legionId=2 を Legion.id と誤認するとこちらを拾ってしまう。
            { id: 2, clanId: 9, legionNo: 7, commanderId: 77 },
            { id: 500, clanId: 1, legionNo: 2, commanderId: 50 }
        ],
        bushos: [
            { id: 50, clan: 1, castleId: 10 },
            { id: 77, clan: 9, castleId: 12 },
            { id: 99, clan: 1, isDaimyo: true, castleId: 12 }
        ],
        provinces: [
            { id: 1, regionId: 7 },
            { id: 2, regionId: 7 },
            { id: 3, regionId: 8 }
        ],
        getBusho: id => id === 50 ? { id: 50, castleId: 10 } : (id === 77 ? { id: 77, castleId: 12 } : null),
        getCastle: id => castles.get(id) || null,
        getProvince(id) { return this.provinces.find(p => Number(p.id) === Number(id)); },
        getClanDaimyo: id => Number(id) === 1 ? { id: 99, clan: 1, isDaimyo: true, castleId: 12 } : null
    };
    const defender = { id: 20, provinceId: 1 };

    // 軍団長居城と同じ国・地方 = 1.2
    assert.ok(Math.abs(WarSystem.calcHomeBonusMultiplier(game,
        { provinceId: 3, ownerClan: 1, legionId: 2, isKunishu: false }, defender) - 1.2) < 1e-9);
    // 大名居城は別地方 = 1.0
    assert.strictEqual(WarSystem.calcHomeBonusMultiplier(game,
        { provinceId: 2, ownerClan: 1, legionId: 0, isKunishu: false }, defender), 1.0);
    // 諸勢力は自身の城を基準。同地方のみ = 1.1
    assert.ok(Math.abs(WarSystem.calcHomeBonusMultiplier(game,
        { provinceId: 2, ownerClan: 0, legionId: 0, isKunishu: true }, defender) - 1.1) < 1e-9);

    const warSource = read('js/war.js');
    const fieldSource = read('js/field_war.js');
    assert.ok(warSource.includes('WarSystem.calcHomeBonusMultiplier(this.game, activeCastle, s.defender)'));
    assert.ok(fieldSource.includes('WarSystem.calcHomeBonusMultiplier(this.game, activeCastle, this.warState.defender)'));
    assert.ok(!fieldSource.includes('const leaderProv = this.game.provinces.find'));
});

test('gameを保持する主要Systemは window.GameApp へ戻らない', () => {
    const files = [
        'js/event_manager.js',
        'js/independence_system.js',
        'js/kunishu_system.js',
        'js/legion_policy_system.js',
        'js/war_effort.js',
        'js/map_generator.js'
    ];
    const offenders = files.filter(file => read(file).includes('window.GameApp'));
    assert.deepStrictEqual(offenders, []);

    const eventSource = read('js/event_manager.js');
    assert.ok(eventSource.includes('const gameFlags = this.game.flags || {}'));
    assert.ok(!eventSource.includes('appFlags'));

    const mapSource = read('js/map_generator.js');
    const fieldSource = read('js/field_war.js');
    assert.ok(mapSource.includes('generate(isSeaBattle = false)'));
    assert.ok(fieldSource.includes('mapFactory.generate(this.warState.isSeaBattle === true)'));
});


test('古いスマホ向け地図演出は城領域boundsと低解像度帯描画を使う', () => {
    const data = read('js/data_manager.js');
    const map = read('js/ui_map.js');
    assert.ok(data.includes('this.castlePixelBounds = boundsByCastleId'), '起動時に城ごとの外接矩形を保持する');
    assert.ok(map.includes('const boundsByCastleId = DataManager.castlePixelBounds || null'), '戦闘点滅は事前計算boundsを使う');
    assert.ok(!map.includes('for (let i = 0; i < mapWidth * mapHeight; i++)'), '戦闘点滅に全地図走査fallbackを残さない');
    assert.ok(map.includes('_getMapOverlayRasterSize(mapW, mapH)'), '全画面エフェクトは端末別内部解像度を使う');
    assert.ok(map.includes('_paintCanvasByStrips(canvas, paintPixel'), '巨大ImageDataを一枚作らず帯状描画する');
    assert.ok(map.includes("img.src = isPC ? './data/images/map/japan_map.png' : './data/images/map/japan_map_mobile.png'"), 'スマホ表示地図は軽量専用画像を使う');
    assert.ok(fs.existsSync(path.join(ROOT, 'data/images/map/japan_map_mobile.png')));
});



test('新規開始とロードは実表示用地図Imageの読込・decode完了後にロード画面を閉じる', () => {
    const map = read('js/ui_map.js');
    const game = read('js/game.js');
    const save = read('js/save_manager.js');

    assert.ok(map.includes('async prepareMapBaseImage(mapW, mapH)'));
    assert.ok(map.includes("await img.decode();"), '表示用Imageは対応ブラウザでdecode完了まで待つ');
    assert.ok(map.includes("img.src = isPC ? './data/images/map/japan_map.png' : './data/images/map/japan_map_mobile.png'"), '実際の端末で表示するImageを待つ');

    const scenarioStart = game.indexOf("this.ui.updateLoadingProgress(90, '地図を読み込んでいます')");
    const scenarioEnd = game.indexOf('// 観戦開始はロード画面を閉じてから。', scenarioStart);
    const scenarioBlock = game.slice(scenarioStart, scenarioEnd);
    assert.ok(scenarioBlock.includes('await this.ui.prepareMapBaseImage(this.mapWidth, this.mapHeight);'));
    assert.ok(scenarioBlock.indexOf('await this.ui.prepareMapBaseImage') < scenarioBlock.indexOf('this.ui.renderMap();'));
    assert.ok(scenarioBlock.indexOf('this.ui.renderMap();') < scenarioBlock.indexOf('this.ui.hideLoadingScreen();'));

    const restoreStart = save.indexOf("this.game.ui.updateLoadingProgress(90, '地図を読み込んでいます')");
    const restoreEnd = save.indexOf("window.AudioManager.playBGM", restoreStart);
    const restoreBlock = save.slice(restoreStart, restoreEnd);
    assert.ok(restoreBlock.includes('await this.game.ui.prepareMapBaseImage(this.game.mapWidth, this.game.mapHeight);'));
    assert.ok(restoreBlock.indexOf('await this.game.ui.prepareMapBaseImage') < restoreBlock.indexOf('this.game.ui.renderMap();'));
    assert.ok(restoreBlock.indexOf('this.game.ui.renderMap();') < restoreBlock.indexOf('await this.game.ui.waitForNextPaint();'));
});
test('スマホの一時資源解放では継続表示レイヤーの勢力色と雪を保持する', () => {
    const ui = read('js/ui.js');
    const map = read('js/ui_map.js');
    const css = read('css/style.css');
    assert.ok(ui.includes('this.releaseMobileTransientMapResources()'));
    assert.ok(ui.includes('this.recoverMobileMapResources()'));
    assert.ok(map.includes("['province-overlay', 'hover-blink-overlay', 'keep-blink-overlay']"));
    const releaseStart = map.indexOf('releaseMobileTransientMapResources()');
    const releaseEnd = map.indexOf('_isClanColorOverlayHealthy()', releaseStart);
    const releaseBlock = map.slice(releaseStart, releaseEnd);
    assert.ok(!releaseBlock.includes("'snow-overlay'"), '雪はAI進行やモーダル表示をまたいで保持する');
    assert.ok(map.includes('_isClanColorOverlayHealthy()'));
    assert.ok(map.includes("ctx.getImageData(x, y, 1, 1).data[3] > 0"), '勢力色だけは復帰時に1pixel確認する');
    assert.ok(map.includes("canvas.addEventListener('contextlost'"));
    assert.ok(css.includes('body:not(.is-pc).mobile-memory-guard .castle-card'));
});

test('雪CanvasはAI思考中も保持しつつ古いスマホでは低メモリ・必要時描画に限定する', () => {
    const map = read('js/ui_map.js');
    const snowStart = map.indexOf('    updateSnowOverlay() {');
    const snowEnd = map.indexOf('// ==========================================\n    // ★新魔法：国を勢力の色で塗りつぶす魔法です！', snowStart);
    const snowBlock = map.slice(snowStart, snowEnd);
    const recoverStart = map.indexOf('    recoverMobileMapResources() {');
    const recoverEnd = map.indexOf('    // ★Round14：ズーム中', recoverStart);
    const recoverBlock = map.slice(recoverStart, recoverEnd);
    assert.ok(!map.includes('_isSnowOverlayHealthy('));
    assert.ok(!map.includes('getImageData(probe.x, probe.y'), '雪Canvasのreadbackを行わない');
    assert.ok(map.includes('_getSnowOverlayRasterSize(mapW, mapH)'));
    assert.ok(map.includes('const scale = isPC ? 1 : 0.25'), 'スマホ雪Canvasは1/4解像度にする');
    assert.ok(map.includes("canvasId === 'snow-overlay'"), '雪Canvasだけ専用内部解像度を使う');
    assert.ok(map.includes('const snowPatternStep = isPC ? 8 : 4'), '低解像度化後も水玉の見た目サイズを維持する');
    assert.ok(recoverBlock.includes("const snowOverlay = document.getElementById('snow-overlay')"));
    assert.ok(recoverBlock.includes('if (!snowOverlay || snowOverlay.width <= 1 || snowOverlay.height <= 1)'), '復帰のたびに雪全体をdirty化しない');
    assert.ok(snowBlock.includes('const painted = this._paintCanvasByStrips(overlay'));
    assert.ok(snowBlock.includes('if (!painted)'));
    assert.ok(!snowBlock.includes('this.game.isProcessingAI'), 'AI思考中を理由に雪更新を止めない');
    assert.ok(map.includes("sc.addEventListener('touchend', resetPinch"), 'タッチ終了時に雪のreadbackを挟まない');
});

test('月初寿命再計算とAI作戦は古いスマホで協調分割する', () => {
    const life = read('js/life_system.js');
    const ops = read('js/ai_operation.js');
    assert.ok(life.includes('await this.updateAllBushosAgeCooperatively()'));
    assert.ok(life.includes('const chunkSize = isPC ? 768 : 128'));
    assert.ok(life.includes("month_start:life:age_done"));
    assert.ok(!life.includes('_normalizeFamilyArrays'), '旧セーブ用の全人物親族配列正規化を月次処理へ残さない');
    assert.ok(ops.includes('processedLegions % 2 === 0'));
    assert.ok(ops.includes('month_start:operations:clan_'));
});

test('実機診断は古いキュー位置の持越しと通常active_castle上書きを避ける', () => {
    const game = read('js/game.js');
    const map = read('js/ui_map.js');
    const info = read('js/ui_info.js');
    assert.ok(game.includes('const isQueuePhase = !!castle'), '対象城のない月次/UI処理へ旧AIキュー番号を持ち越さない');
    assert.ok(game.includes("startsWith('ui:')"), '画面操作の診断はキュー番号ではなく画面操作として表示する');
    assert.ok(info.includes('`ui:modal:${pageType}`'), '武将一覧など実際に開いている画面を診断へ残す');
    assert.ok(map.includes("diagnostic: false"));
    assert.ok(map.includes("options.diagnostic !== false"));
});

test('セーブ用勢力図はフルサイズCanvasを作らず1/4専用画像へ直接描画する', () => {
    const save = read('js/save_manager.js');
    assert.ok(save.includes("japan_white_map_thumb.png"));
    assert.ok(save.includes('const thumbW = Math.max(1, Math.round(w * scale))'));
    assert.ok(!save.includes("const canvas = document.createElement('canvas');\n            canvas.width = w;\n            canvas.height = h;"), '3140x2440の中間Canvasを作らない');
    assert.ok(fs.existsSync(path.join(ROOT, 'data/images/map/japan_white_map_thumb.png')));
});


test('実行データはBINだけを正本とし武将masterから旧familyId列を廃止する', () => {
    const { common, index, scenario } = getRuntimeData();
    assert.strictEqual(common.format, 'sengoku-common-v1');
    assert.strictEqual(index.format, 'sengoku-scenario-index-v1');
    assert.strictEqual(scenario.format, 'sengoku-scenario-v1');
    assert.ok(common.warriorsMaster.length > 4000);
    assert.strictEqual(common.warriorsMaster.length, scenario.warriorsState.length, '武将master/stateは同じID集合を持つ');
    assert.ok(common.warriorsMaster.every(row => !Object.prototype.hasOwnProperty.call(row, 'familyId')));
    assert.ok(!fs.existsSync(path.join(ROOT, 'data/scenarios/1560_okehazama/warriors.csv')), '旧CSVを実行データとして残さない');
});

test('藤田信吉の系譜・北条家ID再配置と城主・軍団長参照をBINで同期する', () => {
    const { common, scenario } = getRuntimeData();
    const warriors = mergeRuntimeRows(common.warriorsMaster, scenario.warriorsState);
    const byId = new Map(warriors.map(row => [Number(row.id), row]));
    const displayName = row => String(row.name || '').replace(/\|/g, '');
    const byName = new Map(warriors.map(row => [displayName(row), row]));
    const yasukuni = byName.get('藤田康邦');
    const nobuyoshi = byName.get('藤田信吉');
    assert.ok(yasukuni && nobuyoshi, '藤田康邦・藤田信吉が存在すること');
    assert.strictEqual(Number(yasukuni.id), 1003065);
    assert.strictEqual(Number(nobuyoshi.id), 1003066);
    assert.strictEqual(Number(nobuyoshi.realFatherId), Number(yasukuni.id), '藤田信吉の実父は藤田康邦');
    assert.strictEqual(Number(nobuyoshi.sortNo), Number(yasukuni.sortNo) + 1, '藤田信吉は藤田康邦の直下に並ぶ');
    scenario.castlesState.forEach(castle => {
        const castellanId = Number(castle.castellanId || 0);
        if (!castellanId) return;
        assert.ok(byId.has(castellanId), `${castle.name} の城主ID ${castellanId} が存在すること`);
        assert.ok(!Object.prototype.hasOwnProperty.call(castle, '城主名確認用'), '確認用列はBINへ出力しない');
    });
    scenario.legions.forEach(legion => {
        const commanderId = Number(legion.commanderId || 0);
        assert.ok(byId.has(commanderId), `軍団長ID ${commanderId} が存在すること`);
        assert.ok(!Object.prototype.hasOwnProperty.call(legion, '軍団長名'), '確認用列はBINへ出力しない');
    });
});

test('FamilyLinkerは関係データだけから一門キャッシュを毎回ゼロから再構築する', () => {
    const ctx = createContext();
    loadScript(ctx, 'js/family_system.js');
    const father = { id: 1, realFatherId: 0, realMotherId: 0, adoptiveFatherId: 0, wifeIds: [], baseFamilyIds: [999], familyIds: [999] };
    const adopted = { id: 2, realFatherId: 0, realMotherId: 0, adoptiveFatherId: 1, wifeIds: [], baseFamilyIds: [999], familyIds: [999] };
    const unrelated = { id: 3, realFatherId: 0, realMotherId: 0, adoptiveFatherId: 0, wifeIds: [], baseFamilyIds: [1, 2, 3], familyIds: [1, 2, 3] };

    ctx.FamilyLinker.rebuildAllFamilyIds([father, adopted, unrelated], []);
    assert.deepStrictEqual(Array.from(father.baseFamilyIds), [1, 2]);
    assert.deepStrictEqual(Array.from(adopted.baseFamilyIds), [2, 1]);
    assert.deepStrictEqual(Array.from(unrelated.baseFamilyIds), [3]);
    assert.ok(!father.familyIds.includes(999));

    adopted.adoptiveFatherId = 0;
    ctx.FamilyLinker.rebuildAllFamilyIds([father, adopted, unrelated], []);
    assert.deepStrictEqual(Array.from(father.baseFamilyIds), [1]);
    assert.deepStrictEqual(Array.from(adopted.baseFamilyIds), [2]);
    assert.ok(!father.familyIds.includes(2), '養子関係解除後に古い一門IDを残さない');
});

test('一門派生値の構築責務はfamily_systemへ集約しイベント側から直接変更しない', () => {
    const models = read('js/models.js');
    const family = read('js/family_system.js');
    const command = read('js/command_system.js');
    const historical = read('js/event/historical_event.js');
    const html = read('index.html');

    assert.ok(!models.includes('data.familyId'));
    assert.ok(!models.includes('data.baseFamilyIds'));
    assert.ok(!models.includes('data.familyIds'));
    assert.ok(!models.includes('class FamilyLinker'));
    assert.ok(family.includes('class FamilyLinker'));
    assert.ok(family.includes('Union-Find'));
    assert.ok(!family.includes('while (changed)'), '連結成分の反復伝播を残さない');
    assert.ok(!command.includes('baseFamilyIds.push'));
    assert.ok(!historical.includes('baseFamilyIds.push'));
    assert.ok(html.indexOf('js/models.js') < html.indexOf('js/family_system.js'));
    assert.ok(html.indexOf('js/family_system.js') < html.indexOf('js/data_manager.js'));
});

test('セーブデータから一門派生キャッシュを除外する', () => {
    const ctx = createContext();
    loadScript(ctx, 'js/save_manager.js');
    const manager = new ctx.SaveManager({});
    const source = {
        id: 10,
        realFatherId: 1,
        adoptiveFatherId: 2,
        wifeIds: [3],
        baseFamilyIds: [10, 1, 2],
        familyIds: [10, 1, 2, 3],
        isCommander: true,
        loyalty: 80
    };
    const saved = manager._serializePersonForSave(source);
    assert.strictEqual(saved.id, 10);
    assert.strictEqual(saved.realFatherId, 1);
    assert.deepStrictEqual(Array.from(saved.wifeIds), [3]);
    assert.strictEqual(saved.loyalty, 80);
    assert.ok(!Object.prototype.hasOwnProperty.call(saved, 'baseFamilyIds'));
    assert.ok(!Object.prototype.hasOwnProperty.call(saved, 'familyIds'));
    assert.ok(!Object.prototype.hasOwnProperty.call(saved, 'isCommander'));
});


test('セーブ復元は城主フラグをCastle.castellanIdから再構築する', () => {
    const save = read('js/save_manager.js');
    assert.ok(save.includes('this.game.bushos.forEach(busho => { busho.isCastellan = false; });'));
    assert.ok(save.includes('const castellan = this.game.getBusho(castle.castellanId);'));
    assert.ok(save.includes('Number(castellan.castleId) === Number(castle.id)'));
    assert.ok(save.includes('Number(castellan.clan) === Number(castle.ownerClan)'));
});

test('SaveManager は現行スキーマだけを復元前に受理し、旧形式を移行しない', () => {
    const ctx = createContext({
        SCENARIOS: [{ folder: '1560_okehazama' }]
    });
    loadScript(ctx, 'js/save_manager.js');
    const manager = new ctx.SaveManager({});
    const valid = {
        saveSchemaVersion: 2,
        saveTimestamp: 1770000000000,
        saveTime: '2026/08/25 23:30',
        year: 1560, month: 4, gameStartYear: 1560, gameStartMonth: 4,
        scenarioFolder: '1560_okehazama', scenarioName: '1560年 桶狭間の戦い', scenarioNo: 'シナリオ1',
        castles: [{ id: 1, ownerClan: 1, castellanId: 10, samuraiIds: [10] }],
        bushos: [{ id: 10, clan: 1, castleId: 1, nemesisList: [] }],
        clans: [{ id: 1, leaderId: 10 }],
        princesses: [{ id: 90001, isDiplomaticMarriageActive: true }], provinces: [{ id: 1 }], legions: [], kunishus: [],
        turnQueueIds: [1], currentIndex: 0, playerClanId: 1, mapWidth: 1200, mapHeight: 800,
        flags: {}, historyEntries: [],
        aiOperations: { operations: {}, draftBases: {}, grandObjectives: {}, historyOwnedCastles: {} }
    };
    assert.strictEqual(manager._validateSaveDataStructure(valid), true);
    assert.strictEqual(manager.isLoadableSaveData(valid), true, '現行schemaかつ厳密構造検査を通る保存だけをロード可能とする');
    assert.strictEqual(manager.isLoadableSaveData({ ...valid, saveSchemaVersion: 1 }), false, '旧schemaはキーが存在してもロード不可');
    assert.strictEqual(manager.isLoadableSaveData({ ...valid, month: 13 }), false, '現行schemaでも構造不正ならロード不可');
    assert.throws(() => manager._validateSaveDataStructure({ ...valid, saveSchemaVersion: undefined }), /非対応のセーブ形式/);
    assert.throws(() => manager._validateSaveDataStructure({ ...valid, saveSchemaVersion: 0 }), /非対応のセーブ形式/);
    assert.throws(() => manager._validateSaveDataStructure({ ...valid, saveSchemaVersion: 1 }), /非対応のセーブ形式/, '政治婚姻フラグ導入前のschema 1は読み込まない');
    assert.throws(() => manager._validateSaveDataStructure({ ...valid, princesses: [{ id: 90001 }] }), /isDiplomaticMarriageActive/, 'schema 2では政治婚姻フラグを明示する');
    assert.throws(() => manager._validateSaveDataStructure({ ...valid, month: 13 }), /month/);
    assert.throws(() => manager._validateSaveDataStructure({ ...valid, bushos: [{ id: 10, clan: 1, castleId: 999, nemesisList: [] }] }), /castleId/);
    assert.throws(() => manager._validateSaveDataStructure({ ...valid, bushos: [{ id: 10, clan: 1, castleId: 1, nemesisIds: [] }] }), /nemesisList/);
    assert.throws(() => manager._validateSaveDataStructure({ ...valid, historyEntries: ['旧文字列履歴'] }), /historyEntries/);
    assert.throws(() => manager._validateSaveDataStructure({ ...valid, aiOperations: { operations: {} } }), /aiOperations/);
    assert.throws(() => manager._validateSaveDataStructure({ ...valid, scenarioFolder: 'missing' }), /未登録のシナリオ/);
    assert.throws(() => manager._validateSaveDataStructure({ ...valid, princesses: [{ id: 90001, originalClanId: 999, isDiplomaticMarriageActive: true }] }), /originalClanId/);
    assert.throws(() => manager._validateSaveDataStructure({ ...valid, princesses: [{ id: 90001, currentClanId: 999, isDiplomaticMarriageActive: true }] }), /currentClanId/);
    assert.throws(() => manager._validateSaveDataStructure({ ...valid, princesses: [{ id: 90001, husbandId: 999, isDiplomaticMarriageActive: true }] }), /husbandId/);
    assert.throws(() => manager._validateSaveDataStructure({ ...valid, legions: [{ id: 1, clanId: 999, legionNo: 1, commanderId: 0, establishedTurnId: 0 }] }), /legions\[0\]\.clanId/);
    assert.throws(() => manager._validateSaveDataStructure({ ...valid, legions: [{ id: 1, clanId: 1, legionNo: 1, commanderId: 999, establishedTurnId: 0 }] }), /commanderId/);
    assert.throws(() => manager._validateSaveDataStructure({ ...valid, legions: [{ id: 1, clanId: 1, legionNo: 0, commanderId: 0, establishedTurnId: 0 }] }), /legionNo/);
    assert.throws(() => manager._validateSaveDataStructure({ ...valid, legions: [
        { id: 1, clanId: 1, legionNo: 1, commanderId: 10, establishedTurnId: 0 },
        { id: 2, clanId: 1, legionNo: 1, commanderId: 0, establishedTurnId: 0 }
    ] }), /軍団席/);
    assert.throws(() => manager._validateSaveDataStructure({ ...valid, bushos: [
        { id: 10, clan: 1, castleId: 1, nemesisList: [] },
        { id: 11, clan: 1, castleId: 1, nemesisList: [] }
    ], legions: [
        { id: 1, clanId: 1, legionNo: 1, commanderId: 10, establishedTurnId: 0 },
        { id: 2, clanId: 1, legionNo: 2, commanderId: 10, establishedTurnId: 0 }
    ] }), /国主 10 が重複/);
    assert.throws(() => manager._validateSaveDataStructure({ ...valid, clans: [{ id: 1, leaderId: 10 }, { id: 2, leaderId: 11 }], bushos: [
        { id: 10, clan: 1, castleId: 1, nemesisList: [] },
        { id: 11, clan: 2, castleId: 1, nemesisList: [] }
    ], legions: [{ id: 1, clanId: 1, legionNo: 1, commanderId: 11, establishedTurnId: 0 }] }), /所属勢力が一致/);
    assert.throws(() => manager._validateSaveDataStructure({ ...valid, castles: [{ id: 1, ownerClan: 1, castellanId: 10 }] }), /samuraiIds/, '現行セーブでは在城名簿を明示する');
    assert.throws(() => manager._validateSaveDataStructure({ ...valid, castles: [{ id: 1, ownerClan: 1, castellanId: 10, samuraiIds: [10, 10] }] }), /重複/, '同じ城の在城名簿へ同一武将を重複させない');
    assert.throws(() => manager._validateSaveDataStructure({ ...valid, castles: [{ id: 1, ownerClan: 1, castellanId: 10, samuraiIds: [999] }] }), /参照先/, '在城名簿の不存在武将を拒否する');
    assert.throws(() => manager._validateSaveDataStructure({ ...valid, bushos: [{ id: 10, clan: 1, castleId: 0, nemesisList: [] }] }), /武将castleId/, '在城名簿と武将castleIdの食い違いを拒否する');
    assert.throws(() => manager._validateSaveDataStructure({ ...valid, kunishus: [{ id: 1, castleId: 999, leaderId: 0, networkTag: '' }] }), /kunishus\[0\]\.castleId/);
    assert.throws(() => manager._validateSaveDataStructure({ ...valid, kunishus: [{ id: 1, castleId: 1, leaderId: 999, networkTag: '' }] }), /leaderId/);
});

test('旧セーブ互換の移行処理をSaveManager・AI作戦・宿敵・諸勢力へ残さない', () => {
    const save = read('js/save_manager.js');
    const operation = read('js/ai_operation.js');
    const models = read('js/models.js');
    const kunishu = read('js/kunishu_system.js');
    const history = read('js/history_system.js');
    const mainKunishus = getRuntimeData().scenario.kunishus;

    assert.ok(save.includes('saveSchemaVersion: SAVE_SCHEMA_VERSION'));
    assert.ok(save.includes('Number(data.saveSchemaVersion) !== SAVE_SCHEMA_VERSION'));
    assert.ok(!save.includes('_syncBushoMasterFields'));
    assert.ok(!save.includes('_syncSimplePortraitAddition'));
    assert.ok(!save.includes('_syncYearBasedPortraitRules'));
    assert.ok(!save.includes('latestBushoMap'));
    assert.ok(operation.includes('this.operations = data.operations;'));
    assert.ok(!operation.includes('data.operations[clanId].type'));
    assert.ok(!operation.includes('for (const clanId in data)'));
    assert.ok(!models.includes('else if (data.nemesisIds && Array.isArray(data.nemesisIds))'));
    assert.ok(!kunishu.includes("kunishu.name === '願証寺'"));
    assert.ok(!kunishu.includes('id >= 10001 && id <= 10018'));
    assert.ok(!history.includes("category: 'legacy'"));
    assert.ok(mainKunishus.every(row => Object.prototype.hasOwnProperty.call(row, 'networkTag')), '本筋シナリオは現行networkTag列を明示する');
    assert.strictEqual(mainKunishus.filter(row => row.networkTag === 'ikko').length, 19, '本筋シナリオは一向宗タグをデータ側で保持する');
});

test('ロード失敗時は事前検証と復元後安全復帰を分離し、復帰前に案内する', () => {
    const source = read('js/save_manager.js');
    assert.ok(source.includes('this._validateSaveDataStructure(d); // ゲーム状態へ触る前に構造・主要参照を検査します'));
    assert.ok(source.includes('await this._recoverFromFailedRestore();'));
    assert.ok(source.includes('セーブデータの復元中に問題が発生したため、タイトルへ戻ります。'));
    assert.ok(source.includes('await this.game.ui.showDialogAsync(message, false);'));
    assert.ok(source.includes('await this.game.ui.returnToTitle();'));
    assert.ok(!source.includes('タイトルへ戻しました。'));
});

test('地図初期化は前回座標を破棄しシナリオ既定地点を使い、タイトル観戦だけ最小ズームにする', () => {
    const map = read('js/ui_map.js');
    const game = read('js/game.js');
    const ui = read('js/ui.js');
    assert.ok(map.includes('resetMapViewState(options = {})'));
    assert.ok(map.includes('sc.scrollLeft = 0') && map.includes('sc.scrollTop = 0'), '前回スクロール座標を破棄する');
    assert.ok(map.includes('const centerCastle = this.game.getCastle(centerCastleId);'), '初回中心はシナリオ既定城だけから決める');
    assert.ok(!map.includes('const currentTarget = this.currentCastle || this.game.getCurrentTurnCastle();'), '初回中心へ前回選択城/現在ターン城を混ぜない');
    assert.ok(game.includes('initialZoomLevel: startInWatchMode ? 0 : 1'), 'タイトル観戦だけ最小ズームを予約する');
    assert.ok(ui.includes("if (typeof this.resetMapViewState === 'function') this.resetMapViewState();"), 'タイトル復帰時もカメラ状態を破棄する');
});

test('PC入れ子コマンドの選択中表示はhoverと明確に区別する', () => {
    const css = read('css/style.css');
    assert.ok(css.includes('body.is-pc .pc-cmd-col .cmd-btn.category.active'));
    assert.ok(css.includes('inset 4px 0 0 #d4af37'), '選択中の親コマンドは左端の金帯で識別する');
    assert.ok(css.includes('body.is-pc .pc-cmd-col .cmd-btn.category.active::after'), '選択中の階層矢印も強調する');
});

test('面談は専用View内で完結し固定論理画面内・非スクロールでページ切替する', () => {
    const html = read('index.html');
    const css = read('css/style.css');
    const view = read('js/interview_view.js');
    const interview = read('js/interview_system.js');
    const command = read('js/command_system.js');

    assert.ok(html.includes('id="interview-modal"'), '面談専用モーダルをHTMLに持つ');
    assert.ok(html.includes('js/interview_view.js'), '面談表示を専用Viewとして読み込む');
    assert.ok(css.includes('aspect-ratio: 16 / 9'), 'PC面談枠は16:9前提');
    assert.ok(css.includes('body:not(.is-pc) #interview-modal .interview-session-content') && css.includes('width: calc(100% - 12px) !important;'), 'スマホ面談枠は9:16論理画面の左右を広く使う');
    assert.ok(css.includes('#interview-modal .interview-session-content'));
    assert.ok(css.includes('overflow: hidden !important'), '面談本体はスクロールへ逃がさない');
    assert.ok(view.includes("if (this._isPc()) return mode === 'target' ? 15 : 20;") && view.includes("return mode === 'target' ? 10 : 14;"), '人数超過はPC通常20人/他者15人・スマホ通常14人/他者10人のページ切替で処理する');
    assert.ok(view.includes('showMessages(busho, messages'), '長文を意味単位の順送り表示にできる');
    assert.ok(command.includes("case 'interview':"), '面談開始は汎用武将セレクタではなく専用フローへ渡す');
    assert.ok(!interview.includes('openBushoSelector'), '面談中に汎用武将リストを開かない');
    assert.ok(html.includes('id="interview-session-footer" class="modal-footer interview-session-footer"'), '面談の決定/戻る系操作は標準modal-footerを使う');
    assert.ok(html.includes('id="interview-session-inline-actions"'), '面談内容内の専用操作帯を分離する');
    assert.ok(html.includes('id="interview-session-prev-btn" type="button" data-se="choice.ogg" class="daimyo-detail-action-btn"'), '面談内ページ送りは内側用ボタン＋共通button-SEを使う');
    assert.ok(view.includes("button.className = 'daimyo-detail-action-btn interview-session-inline-btn'"), '面談内容内操作は詳細画面系ボタンを使う');
    assert.ok(view.includes("button.dataset.se = sound"), '面談buttonの特殊SEはdata-seで共通button監視へ委譲する');
    assert.ok(!view.includes("window.AudioManager.playSE(se)"), '面談button handler内でSEを二重再生しない');
    assert.ok(view.includes('_renderFooterActions'), '面談の外側フッター操作をViewで分離する');
    assert.ok(!css.includes('body.interview-mode'), '旧ふすま背景の状態管理を残さない');
    assert.ok(html.includes('js/busho_list_sort_rules.js'), '面談と武将一覧で共通ソート規則を読み込む');
    assert.ok(html.includes('id="interview-session-dialog-message" class="message-area"'), '面談下段は通常会話と同じmessage-areaを直接使う');
    assert.ok(html.includes('class="dialog-body-container"') && html.includes('id="interview-session-dialog-name" class="dialog-name-label'), '面談下段は通常会話の顔＋名前＋メッセージ文法を直接使う');
    assert.ok(!view.includes('interview-session-conversation-frame'), '旧面談専用会話外枠を残さない');
    assert.ok(css.includes('#interview-modal .interview-session-dialog') && css.includes('.interview-session-inline-actions'), '上段情報・選択肢・下段通常会話を分離する');
    assert.ok(css.includes('background: linear-gradient(to bottom, #586979') && css.includes('grid-column: 1;'), '面談選択肢は緑と分離した藍鉄系・7/8/4配置を使う');
    assert.ok(css.includes('box-sizing: border-box') && css.includes('grid-template-rows: repeat(2, 42px)'), '面談選択肢の枠線を行高内へ収めて上下を欠かさない');
    assert.ok(css.includes('#interview-session-dialog-name { left: 20px; }'), 'PC面談の人物名は通常会話と同じ枠上辺配置を使う');
    assert.ok(html.includes('id="interview-session-summary-panel"') && !html.includes('id="interview-session-face-panel"'), '上部サマリーへ顔を重複表示しない');
    assert.ok(view.includes('StatPresenter.getDisplayStatHTML(busho, key'), '面談能力は武将一覧・詳細と同じランク表示を使う');
    assert.ok(!view.includes('valueEl.textContent = Number(busho[key]'), '面談で能力の内部数値を表示しない');
    assert.ok(view.includes('_setMessageAdvance') && view.includes("this._renderFooterActions([])"), '選択肢のない面談会話はボタンを出さず画面クリックで進める');
    assert.ok(css.includes('#interview-modal.interview-message-advance #interview-session-dialog-message::after'), '面談会話のクリック進行時は▼を表示する');
    assert.ok(view.includes("['統率', 'leadership']") && view.includes("['魅力', 'charm']"), '面談相手の既知能力を人物サマリーに出す');
    assert.ok(!view.includes('loyalty'), '面談Viewで忠誠数値を表示・ソートしない');
    assert.ok(view.includes("search.addEventListener('compositionstart'"), '面談検索は日本語IME変換開始を認識する');
    assert.ok(view.includes("search.addEventListener('compositionend'"), '面談検索はIME確定後に絞り込みを反映する');
    assert.ok(!view.includes('nextSearch.focus'), '検索入力のたびにinput DOMを再生成してフォーカスを戻す旧方式を残さない');
    assert.ok(view.includes("this._listGrid.replaceChildren()"), '検索・ソート時は入力欄を残して武将グリッドだけ更新する');
    assert.ok(view.includes("interview-conversation-active"), '会話中は選択肢スロットを固定して本文位置を維持する');
    assert.ok(view.includes("interview-conversation-mode"), '面談会話中は親モーダルが上部情報と画面下端メッセージの配置を担当する');
    assert.ok(css.includes('#interview-modal.interview-conversation-mode'), '面談会話の下端固定は親モーダルのレイアウト規則として定義する');
    assert.ok(css.includes('.interview-session-sort-wrap::after'), '面談プルダウンはネイティブselectを保ったまま専用外観を持つ');
    assert.ok(css.includes('#interview-modal .interview-session-footer.hidden'), '外側ボタン非表示時も予約領域を維持して面談枠を動かさない');
    const commonEvents = read('js/event/common_events.js');
    assert.ok(commonEvents.includes('{ narration: true }'), '医師の説明・結果は本人の台詞ではなくナレーション表示へ渡す');
    assert.ok(view.includes('_formatConversationMessage'), '面談会話の表示整形をViewで一元化する');
    assert.ok(view.includes(".replace(/<br\\s*\\/?\\s*>/gi, '')") && view.includes(".replace(/[\\r\\n]+/g, '')"), '面談会話は表示時だけ改行を除去する');
    assert.ok(view.includes('DialogueTextRules.normalizeConversationText(compact)'), '閉じ鉤括弧直前の句点処理は面談専用実装にせず共通会話規則へ委譲する');
    const ui = read('js/ui.js');
    assert.ok(ui.includes("target.closest('input, select, textarea, option, [contenteditable=\"true\"]')"), 'スマホ共通touchendは入力・selectからフォーカスを奪わない');
    const sortRules = read('js/busho_list_sort_rules.js');
    assert.ok(sortRules.includes('getInterviewSortOptions()'));
    assert.ok(sortRules.includes("{ key: 'rank', label: '身分'"), '面談名簿は身分を先頭のソート項目として持つ');
    assert.ok(sortRules.indexOf("{ key: 'rank', label: '身分'") < sortRules.indexOf("{ key: 'name', label: '名前'") && sortRules.indexOf("{ key: 'name', label: '名前'") < sortRules.indexOf("{ key: 'castle', label: '所在'"), '面談ソートは身分→名前→所在の順に並べる');
    assert.ok(view.includes("this.listSortKey = 'rank'"), '面談を閉じるとソートを身分順へ戻し別セーブへ持ち越さない');
    assert.ok(view.includes('_getListSecondaryText(busho)'), '武将選択カードは現在のソート値を名前下へ表示する');
    assert.ok(view.includes('StatPresenter.getBushoRankName(busho, this.game)') && view.includes('StatPresenter.toGradeText(busho[this.listSortKey])'), '身分/名前は身分、能力ソートは既存ランク文字を名前下へ表示する');
    assert.ok(css.includes('.interview-session-person-rank') && css.includes('color: #aaa'), '武将名の下に身分を武将詳細系の控えめな灰色で表示する');
    assert.ok(css.includes('.interview-session-stat-label') && css.includes('color: #ffd54f'), '個別面談の能力項目名は武将詳細と同じ黄橙系ラベル色を使う');
    assert.ok(view.includes('castle ? castle.name') && !view.includes('所在：${castle.name}') && !view.includes('身分：${rank}'), '個別面談の名前下補助情報はコロン付きラベルを使わず武将詳細系の簡潔なメタ表示にする');
    assert.ok(!sortRules.includes("{ key: 'loyalty'"), '面談の並び替え候補に忠誠を入れない');
    assert.ok(sortRules.includes('achievementTotal'), '身分ソート時だけ非公開功績を同身分内の第二キーとして使う');
    const bushoUi = read('js/ui_info_busho.js');
    assert.ok(bushoUi.includes("BushoListSortRules.compareKnown(this.game, a, b, 'name'"), '元の武将一覧も名前ソートの共通規則を使う');
    assert.ok(bushoUi.includes("BushoListSortRules.compareKnown(this.game, a, b, 'castle'"), '元の武将一覧も所在ソートの共通規則を使う');
    assert.ok(bushoUi.includes("BushoListSortRules.compareKnown(this.game, a, b, 'rank'"), '元の武将一覧も身分内功績順を含む共通規則を使う');
});

test('面談の忠誠評価は軍師警告ラインと連動し低忠誠を段階評価する', () => {
    const ctx = createContext();
    loadScript(ctx, 'js/config.js');
    loadScript(ctx, 'js/loyalty_insight_rules.js');
    loadScript(ctx, 'js/interview_system.js');
    const system = new ctx.InterviewSystem({});

    assert.strictEqual(system._getLoyaltyBand(85), 'stable');
    assert.strictEqual(system._getLoyaltyBand(84), 'warning');
    assert.strictEqual(system._getLoyaltyBand(75), 'warning');
    assert.strictEqual(system._getLoyaltyBand(74), 'danger');
    assert.strictEqual(system._getLoyaltyBand(60), 'danger');
    assert.strictEqual(system._getLoyaltyBand(59), 'dissatisfied');
    assert.strictEqual(system._getLoyaltyBand(40), 'dissatisfied');
    assert.strictEqual(system._getLoyaltyBand(39), 'serious');
    assert.strictEqual(system._getLoyaltyBand(25), 'serious');
    assert.strictEqual(system._getLoyaltyBand(24), 'critical');
});

test('面談の他者評価は高智謀の偽装・看破・全く読めない状態を区別する', () => {
    const ctx = createContext();
    loadScript(ctx, 'js/config.js');
    loadScript(ctx, 'js/personnel_rules.js');
    loadScript(ctx, 'js/loyalty_insight_rules.js');
    loadScript(ctx, 'js/interview_system.js');
    const system = new ctx.InterviewSystem({});

    const relationClose = { contactScore: 80, compatibilityScore: 82, affinityDiff: 8 };
    const concealed = { loyalty: 65, intelligence: 90, ambition: 50 };

    const sharpInterviewer = { loyalty: 90, intelligence: 95, duty: 80 };
    const detected = system._getTargetLoyaltyText(sharpInterviewer, concealed, relationClose);
    assert.ok(detected.includes('表向き') || detected.includes('表には出して'), '高智謀の聞き手は表面上の偽装を見抜く');
    assert.ok(detected.includes('不満') || detected.includes('思うところ'), '看破後は実際の危険度を伝える');

    const middlingInterviewer = { loyalty: 90, intelligence: 65, duty: 80 };
    const fooled = system._getTargetLoyaltyText(middlingInterviewer, concealed, relationClose);
    assert.ok(fooled.includes('忠義は確か'), '偽装を見抜けない場合は表向きの忠誠を信じることがある');
    assert.ok(!fooled.includes('表向き') && !fooled.includes('表には出して'));

    const blindInterviewer = { loyalty: 90, intelligence: 30, duty: 30 };
    const blindAssessment = system._getTargetLoyaltyAssessment(blindInterviewer, { loyalty: 50, intelligence: 90, ambition: 50 }, relationClose);
    assert.strictEqual(blindAssessment.direction, 'unknown', '全く読めない状態を中立評価とは分ける');
    assert.ok(!blindAssessment.text.startsWith('ただ、') && !blindAssessment.text.startsWith('もっとも、'), '単体の忠誠所見へ前文依存の接続詞を埋め込まない');
    assert.ok(blindAssessment.text.includes('胸中をほとんど見せませぬ'));
    assert.ok(blindAssessment.text.includes('読み切れませぬ'));
});


test('面談の3段階他者評価は軽い逆接・unknownを区別し系列全体で逆接を重ねない', () => {
    const ctx = createContext();
    loadScript(ctx, 'js/config.js');
    loadScript(ctx, 'js/loyalty_insight_rules.js');
    loadScript(ctx, 'js/interview_system.js');
    const system = new ctx.InterviewSystem({});

    const state = { used: false, last: null };
    const second = system._bridgeAssessmentText('ただ、普段はさほど話す機会がございませぬ。', 'positive', 'neutral', state);
    const third = system._bridgeAssessmentText('ただ、待遇に不満を抱えているようです。', 'neutral', 'negative', state);
    assert.ok(second.startsWith('ただ、'), '好意的評価から接触が薄くなる2段目には軽い逆接を置く');
    assert.ok(!third.startsWith('ただ、') && !third.startsWith('もっとも、'), '2段目で逆接を使った後は3段目へ逆接を重ねない');

    const knownPersonState = { used: false, last: null, contactScore: 70 };
    const knownPersonUnknown = system._bridgeAssessmentText('殿への胸中までは、某にも読み切れませぬ。', 'positive', 'unknown', knownPersonState);
    assert.ok(knownPersonUnknown.startsWith('ただ、'), '交流が多い相手の本心だけ不明なら「ただ」で一段深い未知へつなぐ');

    const sparseState = { used: false, last: null, contactScore: 40 };
    const sparseUnknown = system._bridgeAssessmentText('殿への本心は、某にも分かりかねます。', 'neutral', 'unknown', sparseState);
    assert.ok(sparseUnknown.startsWith('正直なところ、'), '交流が十分でない相手は逆接ではなく情報不足を「正直なところ」で表す');
    assert.ok(!sparseUnknown.includes('本心までは'), '交流が薄い相手に「までは」を使って一部を知っている含みを出さない');

    const recoveredState = { used: false, last: null };
    const recovered = system._bridgeAssessmentText('もっとも、殿への忠義は本物でしょう。', 'negative', 'positive', recoveredState);
    assert.ok(recovered.startsWith('もっとも、'), '否定的評価から好転する場合は「もっとも」で自然につなぐ');
});



test('面談開始時の表面態度は忠誠・智謀・義理・野望を踏まえて一貫した口調を使う', () => {
    const ctx = createContext();
    loadScript(ctx, 'js/config.js');
    loadScript(ctx, 'js/loyalty_insight_rules.js');
    loadScript(ctx, 'js/interview_system.js');
    const system = new ctx.InterviewSystem({});

    const loyal = { loyalty: 96, intelligence: 50, duty: 80, ambition: 30 };
    assert.strictEqual(system._getSurfaceAttitude(loyal), 'welcoming');
    assert.ok(system._getGreetingText(loyal, 'welcoming').includes('よくぞお越しくださいました'));
    assert.ok(system._getMenuPrompt('welcoming').includes('何なりと'));

    const bluntDisloyal = { loyalty: 20, intelligence: 35, duty: 25, ambition: 75 };
    assert.strictEqual(system._getSurfaceAttitude(bluntDisloyal), 'startled');
    assert.ok(system._getGreetingText(bluntDisloyal, 'startled').includes('げっ、殿'));
    assert.ok(system._getMenuPrompt('startled').includes('何のご用'));

    const cleverDisloyal = { loyalty: 20, intelligence: 90, duty: 40, ambition: 80 };
    assert.strictEqual(system._getSurfaceAttitude(cleverDisloyal), 'cold', '智謀90でも忠誠20は2段階だけ上に見せ、最高態度へ飛ばさない');
    assert.ok(!system._getGreetingText(cleverDisloyal, system._getSurfaceAttitude(cleverDisloyal)).includes('げっ'), '高智謀なら露骨な動揺は隠せる');
});

test('面談の忠誠偽装は智謀70以上で1段階・90以上で2段階だけ上に見せる', () => {
    const ctx = createContext();
    loadScript(ctx, 'js/config.js');
    loadScript(ctx, 'js/loyalty_insight_rules.js');
    loadScript(ctx, 'js/interview_system.js');
    const system = new ctx.InterviewSystem({});

    const base = { loyalty: 65, duty: 50, ambition: 50 }; // danger
    assert.strictEqual(system._getConcealmentProfile({ ...base, intelligence: 69 }).perceivedBand, 'danger');
    assert.strictEqual(system._getConcealmentProfile({ ...base, intelligence: 70 }).perceivedBand, 'warning');
    assert.strictEqual(system._getConcealmentProfile({ ...base, intelligence: 85 }).perceivedBand, 'warning', '旧85閾値では2段階偽装しない');
    assert.strictEqual(system._getConcealmentProfile({ ...base, intelligence: 89 }).perceivedBand, 'warning');
    assert.strictEqual(system._getConcealmentProfile({ ...base, intelligence: 90 }).perceivedBand, 'stable');

    const veryLow = { loyalty: 20, duty: 40, ambition: 60 }; // critical
    assert.strictEqual(system._getConcealmentProfile({ ...veryLow, intelligence: 70 }).perceivedBand, 'serious');
    assert.strictEqual(system._getConcealmentProfile({ ...veryLow, intelligence: 90 }).perceivedBand, 'dissatisfied', '低忠誠でも2段階を超えて最高評価へ飛ばさない');
});

test('面談本人の低忠誠表現は観察ナレーションを混ぜず本人の台詞だけで示す', () => {
    const interview = read('js/interview_system.js');
    assert.ok(!interview.includes('目を合わせようとしない'));
    assert.ok(!interview.includes('危険な気配を感じる'));
    assert.ok(interview.includes('特に申し上げることはございませぬ'));
});

test('面談武将カードは押下時に位置を動かさず最下段の見切れを防ぐ', () => {
    const css = read('css/style.css');
    const match = css.match(/\.interview-session-person:active\s*\{([\s\S]*?)\}/);
    assert.ok(match, '面談武将カードのactive指定を持つ');
    assert.ok(match[1].includes('transform: none'), '押下時にカードを下へ移動しない');
    assert.ok(!match[1].includes('translateY'), '押下感を位置移動で表現しない');
});

test('面談の忠誠上昇は最初の表面態度を確定する前に反映する', () => {
    const ctx = createContext();
    loadScript(ctx, 'js/config.js');
    loadScript(ctx, 'js/loyalty_insight_rules.js');
    loadScript(ctx, 'js/interview_system.js');
    let firstMessage = '';
    const game = {
        ui: {
            interviewView: {
                showMessages(busho, messages) { firstMessage = messages[0]; }
            }
        }
    };
    const system = new ctx.InterviewSystem(game);
    const busho = { loyalty: 74, intelligence: 30, duty: 60, ambition: 30, isInterviewed: false };
    system.startInterview(busho);
    assert.strictEqual(busho.loyalty, 75, '初回面談の忠誠+1を先に確定する');
    assert.strictEqual(system.activeInterviewAttitude, 'polite', '74→75で注意段階へ上がった後の態度を使う');
    assert.ok(firstMessage.includes('恐縮です'));
});

test('低忠誠の聞き手も他者評価で固定の自己露呈台詞を使わない', () => {
    const ctx = createContext();
    loadScript(ctx, 'js/config.js');
    loadScript(ctx, 'js/personnel_rules.js');
    loadScript(ctx, 'js/loyalty_insight_rules.js');
    loadScript(ctx, 'js/interview_system.js');
    const system = new ctx.InterviewSystem({});
    const relation = { contactScore: 80, compatibilityScore: 82, affinityDiff: 8 };
    const target = { loyalty: 65, intelligence: 40, ambition: 40 };

    const cleverDisloyal = { loyalty: 20, intelligence: 90, duty: 40 };
    const cleverText = system._getTargetLoyaltyText(cleverDisloyal, target, relation);
    assert.ok(!cleverText.includes('申せる立場では'), '高智謀の低忠誠武将が自分の不満を固定台詞で露呈しない');
    assert.ok(cleverText.includes('不満') || cleverText.includes('思うところ'));

    const bluntDisloyal = { loyalty: 20, intelligence: 25, duty: 25 };
    const bluntText = system._getTargetLoyaltyText(bluntDisloyal, { loyalty: 65, intelligence: 90, ambition: 50 }, relation);
    assert.ok(!bluntText.includes('申せる立場では'));
    assert.ok(bluntText.includes('読み切れませぬ') || bluntText.includes('読み取れませぬ'));
});

test('軍師の忠誠所見は赤・橙・無色だけを返し対象の智謀と軍師の資質を反映する', () => {
    const ctx = createContext();
    loadScript(ctx, 'js/config.js');
    loadScript(ctx, 'js/loyalty_insight_rules.js');
    loadScript(ctx, 'js/gunshi_system.js');
    const game = { playerClanId: 1, getClanGunshi() { return null; } };
    const system = new ctx.GunshiSystem(game);

    const greatGunshi = { id: 1, intelligence: 95, loyalty: 95, duty: 90 };
    const weakGunshi = { id: 2, intelligence: 55, loyalty: 95, duty: 90 };
    const honestDanger = { id: 10, name: '危険武将', loyalty: 65, intelligence: 50, ambition: 40 };
    const cleverDanger = { id: 11, name: '曲者', loyalty: 65, intelligence: 90, ambition: 70 };
    const warning = { id: 12, name: '注意武将', loyalty: 80, intelligence: 50, ambition: 40 };
    const safe = { id: 13, name: '安定武将', loyalty: 90, intelligence: 50, ambition: 40 };

    assert.strictEqual(system.getLoyaltyAssessment(honestDanger, greatGunshi).alert, 'red');
    assert.strictEqual(system.getLoyaltyAssessment(warning, greatGunshi).alert, 'orange');
    assert.strictEqual(system.getLoyaltyAssessment(safe, greatGunshi).alert, 'none');
    assert.strictEqual(system.getLoyaltyAssessment(cleverDanger, greatGunshi).alert, 'red', '高智謀軍師は高智謀対象の偽装を看破する');
    assert.notStrictEqual(system.getLoyaltyAssessment(cleverDanger, weakGunshi).alert, 'red', '凡庸な軍師は高智謀対象を危険と見抜けない場合がある');
});

test('褒美一覧は軍師所見の赤→橙→無色を優先し真の忠誠を直接ソート・着色しない', () => {
    const command = read('js/command_system.js');
    const bushoUi = read('js/ui_info_busho.js');
    const gunshi = read('js/gunshi_system.js');
    assert.ok(command.includes("if (actionType === 'reward')") && command.includes('compareLoyaltyAssessments(a, b, gunshi)'));
    assert.ok(!command.includes('return (100 - target.loyalty)'), '褒美一覧で実忠誠を直接ソートしない');
    assert.ok(bushoUi.includes('getLoyaltyAssessment(b, gunshi)'));
    assert.ok(!bushoUi.includes('b.loyalty <= dangerLoyalty'), '名前色を実忠誠から直接決めない');
    assert.ok(gunshi.includes("alert === 'red' ? 2 : (alert === 'orange' ? 1 : 0)"));
});

test('軍師の一般助言精度は智謀を主軸に忠誠・義理も加味する', () => {
    const ctx = createContext({ GameMath: { seededRandom() { return 0.8; } } });
    loadScript(ctx, 'js/config.js');
    loadScript(ctx, 'js/loyalty_insight_rules.js');
    loadScript(ctx, 'js/gunshi_system.js');
    const system = new ctx.GunshiSystem({});
    const loyal = system.getAdviceQuality({ intelligence: 80, loyalty: 100, duty: 100 });
    const disloyal = system.getAdviceQuality({ intelligence: 80, loyalty: 10, duty: 10 });
    assert.ok(loyal.score > disloyal.score, '同じ智謀でも忠誠・義理が高い軍師ほど助言品質が高い');
    assert.strictEqual(loyal.intelligence, disloyal.intelligence);
});

test('革新性の中立回答は待遇の満足不満ではなく方針への距離を答える', () => {
    const interview = read('js/interview_system.js');
    assert.ok(interview.includes('古きに固執するも、新しきに飛びつくも考えもの。肝要なのは、時勢を見極めることかと。'));
    assert.ok(!interview.includes('当家の方針については、今のところ特に異存はございませぬ。'));
    assert.ok(!interview.includes('当家のやり方に特に不満はありません。順調です。'));
});

test('他者評価の悲観バイアスは相性差・革新差・野望で増え忠誠・義理・主君相性で抑制される', () => {
    const ctx = createContext();
    loadScript(ctx, 'js/config.js');
    loadScript(ctx, 'js/personnel_rules.js');

    const target = { affinity: 30, innovation: 80 };
    const schemer = { affinity: 0, innovation: 0, ambition: 80, loyalty: 20, duty: 20 };
    const restrained = { affinity: 0, innovation: 0, ambition: 80, loyalty: 95, duty: 95 };
    const badLordFit = { affinity: 50 };
    const goodLordFit = { affinity: 0 };
    const raw = ctx.PersonnelRules.calcOtherAssessmentBias(schemer, target, badLordFit);
    const suppressed = ctx.PersonnelRules.calcOtherAssessmentBias(restrained, target, goodLordFit);

    assert.strictEqual(raw.affinityDiff, 30, '相性差は1につき1の基礎悪評になる');
    assert.ok(raw.innovationDiff > 0 && raw.rawBias > raw.affinityDiff, '革新差と野望が悪評を上積みする');
    assert.ok(raw.loyaltyPenalty > suppressed.loyaltyPenalty, '忠誠・義理・主君相性が良ければ私情を抑える');
});

test('面談の他者忠誠評価は偏見を悲観方向にだけ加え高い表面態度でも口調を保つ', () => {
    const ctx = createContext();
    loadScript(ctx, 'js/config.js');
    loadScript(ctx, 'js/personnel_rules.js');
    loadScript(ctx, 'js/loyalty_insight_rules.js');
    loadScript(ctx, 'js/interview_system.js');
    const game = { playerClanId: 1, getClanDaimyo() { return { affinity: 50 }; } };
    const system = new ctx.InterviewSystem(game);
    system.activeInterviewAttitude = 'reserved';
    const interviewer = { clan: 1, affinity: 0, innovation: 0, ambition: 90, loyalty: 20, duty: 20, intelligence: 95 };
    const target = { affinity: 30, innovation: 90, ambition: 40, loyalty: 90, intelligence: 40 };
    const relation = ctx.PersonnelRules.calcRelationshipProfile(interviewer, target);
    const text = system._getTargetLoyaltyText(interviewer, target, relation);
    assert.ok(!text.includes('忠義は本物'), '強い悪評バイアスで実忠誠より悲観的に評する');
    assert.strictEqual(system._toneTopicFollowup(text), text, '後続台詞へ機械的な相槌や三点リーダを重ねない');
});



test('低忠誠・低義理で主君と不一致な武将は近い低忠誠武将を最大2段階まで庇える', () => {
    const ctx = createContext();
    loadScript(ctx, 'js/config.js');
    loadScript(ctx, 'js/loyalty_insight_rules.js');
    loadScript(ctx, 'js/personnel_rules.js');

    const daimyo = { affinity: 50, innovation: 90 };
    const interviewer = { affinity: 0, innovation: 10, ambition: 80, loyalty: 55, duty: 25 };
    const closeTarget = { affinity: 4, innovation: 14 };
    const distantTarget = { affinity: 35, innovation: 80 };
    const protectedOne = ctx.PersonnelRules.calcOtherAssessmentBias(interviewer, closeTarget, daimyo, 65);
    const protectedStrong = ctx.PersonnelRules.calcOtherAssessmentBias({ ...interviewer, loyalty: 30, duty: 20 }, closeTarget, daimyo, 45);
    const notProtected = ctx.PersonnelRules.calcOtherAssessmentBias(interviewer, distantTarget, daimyo, 65);

    assert.ok(protectedOne.protectionShift >= 1, '不満・低義理・主君不一致・対象との近さが重なれば庇護が発生する');
    assert.strictEqual(protectedStrong.protectionShift, 2, '条件が強く重なる場合でも庇護は最大2段階に止める');
    assert.strictEqual(notProtected.protectionShift, 0, '対象との相性・革新性が遠ければ庇護しない');
});

test('低い表面態度の他者評価は長広舌にならず私情が強い相手だけ短く評価する', () => {
    const interview = read('js/interview_system.js');
    assert.ok(interview.includes("attitude === 'cold' || attitude === 'startled'"));
    assert.ok(interview.includes('某から詳しく申し上げることはございませぬ'));
    assert.ok(interview.includes('あまり信用なさらぬ方がよろしいか'));
    assert.ok(interview.includes('さほど案じることはないかと存じます'));
});
test('方針については能力上位2分野だけを既存ゲーム状態から助言する', () => {
    const ctx = createContext({
        AIDomesticPriorityRules: {
            getBestDomesticPlan(_game, castles) { return { type: 'repair', castle: castles[0], label: '城壁修復', score: 80 }; }
        }
    });
    loadScript(ctx, 'js/config.js');
    loadScript(ctx, 'js/interview_system.js');
    const castles = {
        1: { id: 1, name: '清洲城', legionId: 2, soldiers: 5000, training: 90, maxTraining: 100, morale: 100, maxMorale: 120 },
        99: { id: 99, name: '吉田城' }
    };
    const game = {
        legions: [{ clanId: 1, legionNo: 2, commanderId: 10 }],
        aiOperationManager: { operations: { 1: { 2: { type: '攻撃', targetId: 99, isKunishuTarget: false } } } },
        getCastle(id) { return castles[id] || null; },
        getClanCastles() { return [castles[1]]; }
    };
    const system = new ctx.InterviewSystem(game);
    system.activeInterviewAttitude = 'friendly';
    const commander = { id: 10, clan: 1, castleId: 1, loyalty: 90, duty: 90, leadership: 95, politics: 90, strength: 50, diplomacy: 40, intelligence: 30 };
    const messages = system._getPolicyMessages(commander);
    assert.strictEqual(messages.length, 2, '上位2能力だけに言及する');
    assert.ok(messages.join(' ').includes('吉田城'), '統率が高ければ実際の攻撃目標へ言及する');
    assert.ok(messages.join(' ').includes('清洲城') && messages.join(' ').includes('城壁'), '内政が高ければ共通内政評価へ言及する');
});

test('軍師の調略助言は智謀が他主要能力より1.2倍以上突出した時だけ候補にする', () => {
    const ctx = createContext();
    loadScript(ctx, 'js/config.js');
    loadScript(ctx, 'js/interview_system.js');
    const system = new ctx.InterviewSystem({});

    const ordinaryGunshi = { isGunshi: true, leadership: 80, strength: 50, politics: 75, diplomacy: 70, intelligence: 90 };
    const ordinaryDomains = Array.from(system._getPolicyAbilityDomains(ordinaryGunshi)).map(row => row.key);
    assert.ok(!ordinaryDomains.includes('intelligence'), '智謀90でも他能力80に対して1.2倍未満なら調略へ偏らせない');

    const exceptionalGunshi = { isGunshi: true, leadership: 70, strength: 50, politics: 65, diplomacy: 60, intelligence: 90 };
    const exceptionalDomains = Array.from(system._getPolicyAbilityDomains(exceptionalGunshi)).map(row => row.key);
    assert.strictEqual(exceptionalDomains[0], 'intelligence', '智謀が最高の他能力70に対して1.2倍以上なら調略候補にする');
});

test('一般武将も能力に応じて所属城の軍備・内政などを具体的に助言できる', () => {
    const ctx = createContext({
        AIDomesticPriorityRules: {
            getBestDomesticPlan(_game, castles) { return { type: 'repair', label: '城壁修復', castle: castles[0], score: 80 }; }
        }
    });
    loadScript(ctx, 'js/config.js');
    loadScript(ctx, 'js/interview_system.js');
    const castle = { id: 1, name: '那古野城', legionId: 0, soldiers: 5000, training: 45, maxTraining: 100, morale: 100, maxMorale: 120 };
    const game = {
        legions: [],
        aiOperationManager: { operations: { 1: { 0: { type: '内政', targetId: null } } } },
        getCastle() { return castle; },
        getClanCastles() { return [castle]; }
    };
    const system = new ctx.InterviewSystem(game);
    system.activeInterviewAttitude = 'friendly';
    const ordinary = { id: 20, clan: 1, castleId: 1, loyalty: 90, duty: 90, leadership: 40, strength: 95, politics: 90, diplomacy: 30, intelligence: 20 };
    const text = system._getPolicyMessages(ordinary).join(' ');
    assert.ok(text.includes('那古野城') && text.includes('訓練'), '武勇が高ければ所属城の訓練・士気を見る');
    assert.ok(text.includes('城壁'), '内政が高ければ所属城の開発・城防御を見る');
});

test('面談の連続台詞は相槌・呼びかけ・立場前置きを後続文へ重ねない', () => {
    const ctx = createContext();
    loadScript(ctx, 'js/config.js');
    loadScript(ctx, 'js/interview_system.js');
    const system = new ctx.InterviewSystem({});

    system.activeInterviewAttitude = 'welcoming';
    assert.deepStrictEqual(Array.from(system._toneSequence(['第一です。', '第二です。'], 'policy')), ['はい。第一です。', '第二です。']);
    system.activeInterviewAttitude = 'reserved';
    assert.deepStrictEqual(Array.from(system._toneSequence(['第一です。', '第二です。'], 'policy')), ['……第一です。', '第二です。']);
    assert.ok(!system._getMenuPrompt('reserved').includes('殿'), '最初の挨拶直後の用件確認で「殿」を連呼しない');
    assert.ok(!system._getTopicOpening({ name: '家臣' }, 'friendly').includes('ええ、'), '他者評価の導入で相槌を固定しない');
    const contact = system._getContactText({ contactScore: 40, compatibilityScore: 75, affinityDiff: 5 }, { duty: 50, ambition: 50 }, 'friendly');
    assert.ok(!contact.startsWith('ただ、') && !contact.startsWith('信頼は'), '接触台詞の素材には前文依存の逆接を埋め込まず「信頼」も文頭で繰り返さない');
    const blind = system._getBlindTargetText({ intelligence: 40 }, { intelligence: 90 }, { contactScore: 60, compatibilityScore: 70 }, { isConcealing: true });
    assert.ok(!blind.startsWith('ただ、') && !blind.startsWith('もっとも、') && !blind.includes('普段から話は'), '忠誠不明の素材は接続詞を内包せず接触頻度も繰り返さない');
    assert.ok(blind.includes('本心までは'), '交流が多い相手なら人物像は知っているため「本心までは」が成立する');
    const sparseRaw = system._getBlindTargetText({ intelligence: 40 }, { intelligence: 90 }, { contactScore: 40, compatibilityScore: 60 }, { isConcealing: true });
    assert.ok(sparseRaw.includes('本心は') && !sparseRaw.includes('本心までは'), '交流が十分でない相手は本心そのものが不明と表現する');
    const sequenceState = { used: false, last: null, contactScore: 40 };
    const sparseContact = system._bridgeAssessmentText(
        system._getContactText({ contactScore: 40, compatibilityScore: 75, affinityDiff: 5 }, { duty: 50, ambition: 50 }, 'friendly'),
        'positive', 'neutral', sequenceState
    );
    const sparseBlind = system._bridgeAssessmentText(
        system._getBlindTargetText({ intelligence: 40 }, { intelligence: 90 }, { contactScore: 40, compatibilityScore: 75 }, { isConcealing: true }),
        'neutral', 'unknown', sequenceState
    );
    assert.ok(sparseContact.startsWith('ただ、') && !sparseBlind.startsWith('ただ、') && !sparseBlind.startsWith('もっとも、'), '3段階系列では2段目で逆接を使ったら3段目へ重ねない');
    assert.ok(!read('js/interview_system.js').includes('軍団長として申し上げるなら'), '軍団長の立場前置きを文ごとに重ねる旧処理を残さない');
});

test('調子はどうだの忠誠返答は同じ忠誠段階でも表面態度で口調が変わる', () => {
    const ctx = createContext();
    loadScript(ctx, 'js/config.js');
    loadScript(ctx, 'js/interview_system.js');
    const system = new ctx.InterviewSystem({});
    const friendly = system._getSelfLoyaltyText('stable', 'friendly');
    const reserved = system._getSelfLoyaltyText('stable', 'reserved');
    const startled = system._getSelfLoyaltyText('stable', 'startled');
    assert.notStrictEqual(friendly, reserved);
    assert.notStrictEqual(reserved, startled);
    assert.ok(startled.includes('は、はい'), '取り繕い切れない態度では返答にも言い淀みが出る');
});


test('調子はどうだは忠誠を先に答え深刻以下は会話を閉じ、それ以外は接続詞なしで価値観を独立表示する', () => {
    const ctx = createContext();
    loadScript(ctx, 'js/config.js');
    loadScript(ctx, 'js/loyalty_insight_rules.js');
    loadScript(ctx, 'js/interview_system.js');
    let shown = [];
    const game = { ui: { interviewView: { showMessages(_b, messages) { shown = messages; } } } };
    const system = new ctx.InterviewSystem(game);
    system.activeInterviewAttitude = 'friendly';

    system.executeInterviewStatus({ loyalty: 65, intelligence: 40, innovation: 50 });
    assert.strictEqual(shown.length, 2);
    assert.ok(shown[0].includes('待遇'), '最初に現在の心境・忠誠について答える');
    assert.ok(shown[1].includes('古きに固執するも、新しきに飛びつくも考えもの'), '次に本人の価値観を独立した発言として表示する');
    assert.ok(!shown[1].includes('それと') && !shown[1].includes('加えて申し上げるなら') && !shown[1].includes('それから'), '革新性の発言に機械的な接続詞を付けない');
    assert.ok(!shown.join('').includes('そのことでしたら'), '調子への返答で不自然な「そのことでしたら」を使わない');

    const serious = { loyalty: 30, intelligence: 30, duty: 30, ambition: 70, innovation: 50 };
    system.activeInterviewAttitude = system._getSurfaceAttitude(serious);
    system.executeInterviewStatus(serious);
    assert.strictEqual(shown.length, 1, '深刻段階も拒絶系へ統合し、革新性の話を続けない');
    assert.ok(shown[0].includes('申し上げることはございませぬ') || shown[0].includes('何も申し上げる気にはなれませぬ') || shown[0].includes('よい言葉にはなりますまい'));

    const refusing = { loyalty: 20, intelligence: 30, duty: 30, ambition: 70, innovation: 90 };
    system.activeInterviewAttitude = system._getSurfaceAttitude(refusing);
    system.executeInterviewStatus(refusing);
    assert.strictEqual(shown.length, 1, '最低忠誠で会話を拒絶した後に革新性の話を続けない');
    assert.ok(shown[0].includes('申し上げることはございませぬ') || shown[0].includes('何も申し上げる気にはなれませぬ') || shown[0].includes('よい言葉にはなりますまい'));

    assert.ok(system._getInnovationStatusText({ innovation: 33 }).includes('古くからの仕来り'), '33以下は派閥表示と同じ保守');
    assert.ok(system._getInnovationStatusText({ innovation: 34 }).includes('古きに固執するも'), '34～66は派閥表示と同じ中道');
    assert.ok(system._getInnovationStatusText({ innovation: 66 }).includes('古きに固執するも'));
    assert.ok(system._getInnovationStatusText({ innovation: 67 }).includes('新しくとも取り入れて'), '67以上は派閥表示と同じ革新');
});

test('軍師本人の忠誠報告は自分の偽装を自己看破せず残った警告だけ一人称で申告する', () => {
    const ctx = createContext({ BushoStatusRules: { isActive() { return true; } } });
    loadScript(ctx, 'js/config.js');
    loadScript(ctx, 'js/loyalty_insight_rules.js');
    loadScript(ctx, 'js/gunshi_system.js');

    const gunshi = { id: 1, clan: 1, name: '軍師', intelligence: 70, loyalty: 60, duty: 90, ambition: 30, faceIcon: '' };
    const dialogs = [];
    const game = {
        playerClanId: 1,
        bushos: [gunshi],
        getClanGunshi() { return gunshi; },
        ui: { showDialog(msg, _a, cb) { dialogs.push(msg); if (cb) cb(); } }
    };
    const system = new ctx.GunshiSystem(game);
    const assessment = system.getLoyaltyAssessment(gunshi, gunshi);
    assert.strictEqual(assessment.isSelfAssessment, true);
    assert.strictEqual(assessment.detectedConcealment, false, '軍師が自分自身の偽装を自分で看破しない');
    assert.strictEqual(assessment.alert, 'orange', '智謀70の1段階偽装をそのまま自己報告へ使う');
    system.checkAndShowAdvice({}, () => {});
    assert.ok(dialogs[0].includes('某の待遇につきまして'), '軍師本人は単独でも話題が明確な一人称の専用台詞で申告する');
    assert.ok(!dialogs[0].includes('某自身'), '前文を前提とする「自身」を自己申告の冒頭で使わない');
    assert.ok(!dialogs[0].includes('軍師殿は'), '自分を「軍師殿」と呼ばない');

    const clever = { id: 2, clan: 1, name: '曲者軍師', intelligence: 90, loyalty: 65, duty: 90, ambition: 80, faceIcon: '' };
    const hiddenGame = { playerClanId: 1, bushos: [clever], getClanGunshi() { return clever; }, ui: { showDialog() { throw new Error('偽装で無色なら報告しない'); } } };
    const hiddenSystem = new ctx.GunshiSystem(hiddenGame);
    assert.strictEqual(hiddenSystem.getLoyaltyAssessment(clever, clever).alert, 'none', '大名側の補正がなければ、智謀90軍師は危険域から2段階上へ偽装して自己報告を隠せる');
    hiddenSystem.checkAndShowAdvice({}, () => {});

    const daimyoLow = { id: 10, clan: 1, isDaimyo: true, intelligence: 69 };
    const lowLordGame = {
        playerClanId: 1,
        bushos: [clever, daimyoLow],
        getClanGunshi() { return clever; },
        getClanDaimyo() { return daimyoLow; },
        ui: { showDialog() {} }
    };
    const lowLordAssessment = new ctx.GunshiSystem(lowLordGame).getLoyaltyAssessment(clever, clever);
    assert.strictEqual(lowLordAssessment.selfConcealmentCounterShift, 0, '大名智謀69以下では軍師本人の偽装を控えない');
    assert.strictEqual(lowLordAssessment.alert, 'none');

    const daimyoMid = { id: 11, clan: 1, isDaimyo: true, intelligence: 70 };
    const midLordGame = {
        playerClanId: 1,
        bushos: [clever, daimyoMid],
        getClanGunshi() { return clever; },
        getClanDaimyo() { return daimyoMid; },
        ui: { showDialog() {} }
    };
    const midLordAssessment = new ctx.GunshiSystem(midLordGame).getLoyaltyAssessment(clever, clever);
    assert.strictEqual(midLordAssessment.selfConcealmentCounterShift, 1, '大名智謀70以上なら軍師本人の偽装を1段階だけ控える');
    assert.strictEqual(midLordAssessment.assessedBand, 'warning');
    assert.strictEqual(midLordAssessment.alert, 'orange');

    const daimyoHigh = { id: 12, clan: 1, isDaimyo: true, intelligence: 90 };
    const highLordGame = {
        playerClanId: 1,
        bushos: [clever, daimyoHigh],
        getClanGunshi() { return clever; },
        getClanDaimyo() { return daimyoHigh; },
        ui: { showDialog() {} }
    };
    const highLordAssessment = new ctx.GunshiSystem(highLordGame).getLoyaltyAssessment(clever, clever);
    assert.strictEqual(highLordAssessment.selfConcealmentCounterShift, 2, '大名智謀90以上なら軍師本人の偽装を最大2段階控える');
    assert.strictEqual(highLordAssessment.assessedBand, 'danger');
    assert.strictEqual(highLordAssessment.alert, 'red');

    const oneStepGunshi = { id: 3, clan: 1, name: '慎重軍師', intelligence: 70, loyalty: 60, duty: 90, ambition: 30, faceIcon: '' };
    const cappedGame = {
        playerClanId: 1,
        bushos: [oneStepGunshi, daimyoHigh],
        getClanGunshi() { return oneStepGunshi; },
        getClanDaimyo() { return daimyoHigh; },
        ui: { showDialog() {} }
    };
    const cappedAssessment = new ctx.GunshiSystem(cappedGame).getLoyaltyAssessment(oneStepGunshi, oneStepGunshi);
    assert.strictEqual(cappedAssessment.selfConcealmentCounterShift, 1, '大名智謀90でも軍師本人が実際に隠した段階数を越えて補正しない');
    assert.strictEqual(cappedAssessment.assessedBand, cappedAssessment.actualBand);

    const other = { id: 20, clan: 1, name: '他武将', intelligence: 90, loyalty: 65, duty: 60, ambition: 60, faceIcon: '' };
    const otherLowLord = new ctx.GunshiSystem({
        playerClanId: 1, bushos: [clever, other, daimyoLow],
        getClanGunshi() { return clever; }, getClanDaimyo() { return daimyoLow; }
    }).getLoyaltyAssessment(other, clever);
    const otherHighLord = new ctx.GunshiSystem({
        playerClanId: 1, bushos: [clever, other, daimyoHigh],
        getClanGunshi() { return clever; }, getClanDaimyo() { return daimyoHigh; }
    }).getLoyaltyAssessment(other, clever);
    assert.strictEqual(otherLowLord.assessedBand, otherHighLord.assessedBand, '大名智謀は軍師本人以外の忠誠報告精度を変えない');
    assert.strictEqual(otherHighLord.selfConcealmentCounterShift, 0);
});

test('城壁修復の共通スコアは従来AI式と同値で面談参照によって行動基準を変えない', () => {
    const ctx = createContext();
    loadScript(ctx, 'js/ai_domestic_priority_rules.js');
    const cases = [
        { defense: 100, maxDefense: 1000 },
        { defense: 250, maxDefense: 1000 },
        { defense: 251, maxDefense: 1000 },
        { defense: 500, maxDefense: 800 },
        { defense: 799, maxDefense: 800 }
    ];
    cases.forEach(castle => {
        const oldScore = castle.defense >= castle.maxDefense
            ? null
            : Math.floor((castle.defense <= castle.maxDefense / 4 ? 80 : 20) * (1000 / Math.max(1, castle.maxDefense)));
        assert.strictEqual(ctx.AIDomesticPriorityRules.calcRepairBaseScore(castle, castle.defense), oldScore);
    });
});

test('AIの石高・鉱山優先度は面談と同じAIDomesticPriorityRulesを正本にする', () => {
    const ai = read('js/ai.js');
    const html = read('index.html');
    assert.ok(html.includes('js/ai_domestic_priority_rules.js'));
    assert.ok(ai.includes('AIDomesticPriorityRules.calcRepairBaseScore(castle, perceivedDefense)'), '城壁修復も面談と同じ専門Rulesを正本にする');
    assert.ok(ai.includes('AIDomesticPriorityRules.calcFarmBaseScore(this.game, castle)'));
    assert.ok(ai.includes('AIDomesticPriorityRules.calcCommerceBaseScore(this.game, castle, daimyo)'));
    assert.ok(ai.includes('AIDomesticPriorityRules.applyContext(a.score, a.type, castle, castellan, isPreparingAttack)'));
    const operation = read('js/ai_operation.js');
    assert.ok(operation.includes('planningScore: firstTarget.score') && operation.includes('score: cand.score'), '作戦結果へ評価スコアを保存し軍師面談が実AI計画を比較できる');
});

test('軍師の橙忠誠報告は単独先頭なら「にも」を使わない', () => {
    const ctx = createContext({ BushoStatusRules: { isActive() { return true; } } });
    loadScript(ctx, 'js/config.js');
    loadScript(ctx, 'js/loyalty_insight_rules.js');
    loadScript(ctx, 'js/gunshi_system.js');
    const dialogs = [];
    const gunshi = { id: 1, intelligence: 90, loyalty: 90, duty: 90, faceIcon: '', name: '軍師' };
    const target = { id: 2, clan: 1, name: '家臣', loyalty: 80, intelligence: 30, ambition: 30 };
    const game = {
        playerClanId: 1,
        bushos: [target],
        getClanGunshi() { return gunshi; },
        ui: { showDialog(msg, _a, cb) { dialogs.push(msg); if (cb) cb(); } }
    };
    const system = new ctx.GunshiSystem(game);
    system.checkAndShowAdvice({}, () => {});
    assert.ok(dialogs[0].includes('家臣殿には少々思うところ'), '先頭の単独報告は「には」で自然に開始する');
    assert.ok(!dialogs[0].includes('家臣殿にも'), '前文がないのに「にも」で始めない');
});

test('面談の検索・ソート状態は面談を閉じた時点で身分順へ破棄する', () => {
    const ctx = createContext();
    loadScript(ctx, 'js/interview_view.js');
    const view = Object.create(ctx.InterviewView.prototype);
    Object.assign(view, {
        modal: null, body: null, inlineActions: null, footer: null, pager: null, content: null,
        dialogShell: null, dialogName: null, dialogFace: null, dialogMessage: null,
        listSortKey: 'politics', listSortAsc: true, listQuery: '柴田', pageItems: [1], page: 2, pageSize: 15,
        onPageItemSelect: () => {}, currentSpeaker: {}, _listGrid: {}, _listCount: {}, _listDirection: {},
        _searchComposing: true, _messageAdvanceHandler: null
    });
    view._clearView();
    assert.strictEqual(view.listSortKey, 'rank');
    assert.strictEqual(view.listSortAsc, false);
    assert.strictEqual(view.listQuery, '');
    assert.strictEqual(view.page, 0);
});

test('面談会話の表示整形は元データを変えず句点と改行だけを除く', () => {
    const ctx = createContext();
    loadScript(ctx, 'js/dialogue_text_rules.js');
    loadScript(ctx, 'js/interview_view.js');
    const format = ctx.InterviewView.prototype._formatConversationMessage;
    assert.strictEqual(format.call({}, '「承知しました。」'), '「承知しました」');
    assert.strictEqual(format.call({}, '「某ですか……<br>信頼しております。」'), '「某ですか……信頼しております」');
    assert.strictEqual(format.call({}, '一行目\n二行目'), '一行目二行目');
});

test('通常buttonのSEは共通監視を正本とし特殊音はdata-seへ寄せる', () => {
    const ui = read('js/ui.js');
    const selector = read('js/selector_modal_view.js');
    const info = read('js/ui_info.js');
    const busho = read('js/ui_info_busho.js');
    const kyoten = read('js/ui_info_kyoten.js');
    const architecture = read('ARCHITECTURE.md');

    assert.ok(ui.includes("const explicitSe = btn.dataset ? btn.dataset.se : ''"), '共通button監視がdata-seを正本として扱う');
    assert.ok(!ui.includes('["一括", "直轄", "委任", "不可", "許可"].includes(text)'), '文言による場当たり的なSE除外を残さない');
    assert.ok(selector.includes("backBtn.dataset.se = 'cancel.ogg'"), '共通Selectorの戻る音はView側の宣言だけにする');
    assert.ok(info.includes('data-se="choice.ogg" class="delegate-btn'), '委任切替はdata-seで選択音を宣言する');
    assert.ok(!info.includes("if (window.AudioManager) window.AudioManager.playSE('decision.ogg');"), '情報画面の標準buttonでdecisionを重ねて鳴らさない');
    assert.ok(!busho.includes("if (window.AudioManager) window.AudioManager.playSE('decision.ogg');"), '武将詳細の標準buttonでdecisionを重ねて鳴らさない');
    assert.ok(!kyoten.includes("if (window.AudioManager) window.AudioManager.playSE('decision.ogg');"), '拠点詳細の標準buttonでdecisionを重ねて鳴らさない');
    assert.ok(architecture.includes('button系SEは共通button監視を正本にする'), 'SE責務ルールを設計文書へ残す');
});

test('能力ランクの文字表示はHTML表示と同じ境界を共用する', () => {
    const ctx = createContext();
    loadScript(ctx, 'js/stat_presenter.js');
    assert.strictEqual(ctx.StatPresenter.toGradeText(59), 'C+');
    assert.strictEqual(ctx.StatPresenter.toGradeText(60), 'B');
    assert.strictEqual(ctx.StatPresenter.toGradeText(70), 'B+');
    assert.strictEqual(ctx.StatPresenter.toGradeText(80), 'A');
    assert.ok(ctx.StatPresenter.toGradeHTML(90).includes('rank-a') && ctx.StatPresenter.toGradeHTML(90).includes('A'));
});

test('武将一覧共通ソートは面談用検索と既知能力順を安定して処理する', () => {
    const ctx = createContext({ BushoStatusRules: { isRonin: () => false } });
    loadScript(ctx, 'js/busho_list_sort_rules.js');
    const game = {
        castles: [{ id: 1, name: '清洲城', yomi: 'きよす' }, { id: 2, name: '岡崎城', yomi: 'おかざき' }],
        clans: [],
        legions: [],
        getCastle(id) { return this.castles.find(c => c.id === id); }
    };
    const list = [
        { id: 2, name: '佐久間信盛', yomi: 'さくまのぶもり', castleId: 2, leadership: 70, achievementTotal: 900 },
        { id: 1, name: '柴田勝家', yomi: 'しばたかついえ', castleId: 1, leadership: 85, achievementTotal: 1500, isCastellan: true },
        { id: 3, name: '佐々成政', yomi: 'さっさなりまさ', castleId: 1, leadership: 75, achievementTotal: 1200 },
        { id: 4, name: '林秀貞', yomi: 'はやしひでさだ', castleId: 1, leadership: 60, achievementTotal: 1600 }
    ];
    assert.strictEqual(ctx.BushoListSortRules.getInterviewSortOptions()[0].key, 'rank', '面談の初期選択肢は身分順');
    const rankGame = { clans: [], legions: [{ commanderId: 102 }] };
    const rankList = [
        { id: 101, name: '軍師役', isGunshi: true, clan: 1 },
        { id: 102, name: '国主役', isCommander: false, clan: 1 },
        { id: 103, name: '城主役', isCastellan: true, clan: 1 },
    ];
    assert.deepStrictEqual(
        Array.from(ctx.BushoListSortRules.sortKnown(rankGame, rankList, 'rank', false)).map(b => b.id),
        [101, 102, 103],
        '身分降順ではLegion正本fallbackの国主も軍師より下・城主より上に並べる'
    );
    assert.deepStrictEqual(Array.from(ctx.BushoListSortRules.sortKnown(game, list, 'rank', false)).map(b => b.id), [1, 4, 3, 2], '身分降順は上位身分優先、同身分は功績降順にする');
    assert.deepStrictEqual(Array.from(ctx.BushoListSortRules.sortKnown(game, list, 'rank', true)).map(b => b.id), [2, 3, 4, 1], '身分昇順は下位身分優先、同身分は功績昇順にする');
    assert.deepStrictEqual(Array.from(ctx.BushoListSortRules.sortKnown(game, list, 'leadership', false)).map(b => b.id), [1, 3, 2, 4]);
    assert.deepStrictEqual(Array.from(ctx.BushoListSortRules.filterByName(list, 'さくま')).map(b => b.id), [2]);
    assert.deepStrictEqual(Array.from(ctx.BushoListSortRules.sortKnown(game, list, 'castle', true)).map(b => b.id), [2, 1, 3, 4]);
});

test('面談の選択肢は簡潔な4項目表記に統一する', () => {
    const ctx = createContext();
    loadScript(ctx, 'js/interview_system.js');
    vm.runInContext('this.InterviewSystem = InterviewSystem;', ctx);
    let shown = null;
    const game = { ui: { interviewView: { showMenu(_b, _p, items) { shown = items.map(item => item.label); } } } };
    const system = new ctx.InterviewSystem(game);
    system.activeInterviewAttitude = 'friendly';
    system._getMenuPrompt = () => '何を聞く';
    system.showMainMenu({ id: 1 });
    assert.deepStrictEqual(Array.from(shown), ['調子について', '方針について', '他者について', '武将の噂']);
});

test('武将の噂は他家をフルネーム＋殿、浪人・諸勢力を無官ならフルネーム呼び捨てで識別する', () => {
    const ctx = createContext({
        BushoStatusRules: { isRonin(b) { return b.status === 'ronin'; } },
        ConversationStandingRules: {
            getInterviewTargetCallName() { return '参議殿'; }
        }
    });
    loadScript(ctx, 'js/interview_system.js');
    vm.runInContext('this.InterviewSystem = InterviewSystem;', ctx);
    const clans = [{ id: 1, name: '織田家' }, { id: 2, name: '他家' }];
    const game = {
        playerClanId: 1,
        getClanDaimyo() { return null; },
        getClan(id) { return clans.find(c => c.id === Number(id)) || null; },
        kunishuSystem: {
            getKunishu(id) {
                if (Number(id) === 5) return { id: 5, leaderId: 4, getName() { return '川並衆'; } };
                if (Number(id) === 6) return { id: 6, leaderId: 0, getName() { return '雑賀衆'; } };
                return null;
            }
        }
    };
    const system = new ctx.InterviewSystem(game);
    const interviewer = { id: 1, clan: 1, fullName: '柴田勝家' };
    const otherNoRank = { id: 2, clan: 2, name: '佐久間信盛', fullName: '佐久間信盛', familyNameStr: '佐久間', courtRankIds: [] };
    const roninNoRank = { id: 3, clan: 0, status: 'ronin', name: '山本勘助', fullName: '山本勘助', familyNameStr: '山本', courtRankIds: [] };
    const kunishuLeaderNoRank = { id: 4, clan: 0, status: 'active', belongKunishuId: 5, name: '蜂須賀政勝', fullName: '蜂須賀政勝', familyNameStr: '蜂須賀', courtRankIds: [] };
    const roninRanked = { id: 5, clan: 0, status: 'ronin', name: '山名豊国', fullName: '山名豊国', familyNameStr: '山名', courtRankIds: [10] };
    const kunishuRanked = { id: 6, clan: 0, status: 'active', belongKunishuId: 6, name: '鈴木重意', fullName: '鈴木重意', familyNameStr: '鈴木', courtRankIds: [11] };
    assert.strictEqual(system._getRumorSubjectText(otherNoRank, interviewer), '他家の佐久間信盛殿', '他家武将は無官でも殿を付ける');
    assert.strictEqual(system._getRumorSubjectText(roninNoRank, interviewer), '山本勘助という浪人', '無官浪人は殿を付けない');
    assert.strictEqual(system._getRumorSubjectText(kunishuLeaderNoRank, interviewer), '川並衆の頭領、蜂須賀政勝', '無官の諸勢力武将は殿を付けない');
    assert.strictEqual(system._getRumorSubjectText(roninRanked, interviewer), '山名豊国殿という浪人', '官位持ち浪人は殿を付ける');
    assert.strictEqual(system._getRumorSubjectText(kunishuRanked, interviewer), '雑賀衆の鈴木重意殿', '官位持ち諸勢力武将は殿を付ける');
});

test('武将の噂は主君の近親者を外し話者自身の近親者だけ例外として残す', () => {
    const ctx = createContext({
        BushoStatusRules: { isActive: b => b.status === 'active', isRonin: b => b.status === 'ronin' }
    });
    loadScript(ctx, 'js/config.js');
    loadScript(ctx, 'js/busho_list_sort_rules.js');
    loadScript(ctx, 'js/conversation_standing_rules.js');
    loadScript(ctx, 'js/interview_system.js');
    vm.runInContext('this.InterviewSystem = InterviewSystem;', ctx);

    const daimyo = { id: 1, clan: 1, isDaimyo: true, realFatherId: 9, birthYear: 1534, courtRankIds: [] };
    const interviewer = { id: 2, clan: 1, realFatherId: 20, birthYear: 1530, courtRankIds: [] };
    const daimyoFather = { id: 9, clan: 2, status: 'active', birthYear: 1510, realFatherId: 0, courtRankIds: [] };
    const speakerFather = { id: 20, clan: 2, status: 'active', birthYear: 1500, realFatherId: 0, courtRankIds: [] };
    const game = {
        playerClanId: 1, bushos: [daimyo, interviewer, daimyoFather, speakerFather],
        getBusho(id) { return this.bushos.find(b => Number(b.id) === Number(id)) || null; },
        getClanDaimyo(id) { return Number(id) === 1 ? daimyo : null; },
        courtRankSystem: { RANK_ID_SHOGUN: 1, RANK_IDS_CANDIDATE: [], getRankData() { return null; }, getHighestRankData() { return null; } }
    };
    const system = new ctx.InterviewSystem(game);
    assert.strictEqual(system._isRumorEligibleTarget(interviewer, daimyoFather), false, '主君の父は通常の噂候補から外す');
    assert.strictEqual(system._isRumorEligibleTarget(interviewer, speakerFather), true, '話者自身の父は噂候補に残す');

    // 主君と話者が同じ父を持つ場合など、対象が双方の親族でも話者自身の関係を優先する。
    const sharedFather = { ...speakerFather, id: 30 };
    interviewer.realFatherId = 30;
    daimyo.realFatherId = 30;
    game.bushos.push(sharedFather);
    assert.strictEqual(system._isRumorEligibleTarget(interviewer, sharedFather), true, '話者自身の近親者でもある場合は主君親族除外より優先する');
});

test('武将の噂で話者の親族は伝聞にせず所属から自然に語り浪人も別文にする', () => {
    const ctx = createContext({
        BushoStatusRules: { isActive: b => b.status === 'active', isRonin: b => b.status === 'ronin' },
        LoyaltyInsightRules: { getConcealmentProfile() { return { perceivedBand: 'stable' }; } }
    });
    loadScript(ctx, 'js/config.js');
    loadScript(ctx, 'js/busho_list_sort_rules.js');
    loadScript(ctx, 'js/conversation_standing_rules.js');
    loadScript(ctx, 'js/interview_system.js');
    vm.runInContext('this.InterviewSystem = InterviewSystem;', ctx);

    const daimyo = { id: 1, clan: 1, isDaimyo: true, realFatherId: 0, birthYear: 1534, courtRankIds: [] };
    const interviewer = { id: 2, clan: 1, realFatherId: 20, birthYear: 1530, courtRankIds: [], intelligence: 70, duty: 80, ambition: 20 };
    const father = { id: 20, clan: 2, status: 'active', realFatherId: 0, birthYear: 1500, courtRankIds: [], loyalty: 90, fullName: '明智光綱', givenName: '光綱' };
    const clans = [{ id: 1, name: '織田家' }, { id: 2, name: '朝倉家' }];
    const game = {
        playerClanId: 1, bushos: [daimyo, interviewer, father],
        getBusho(id) { return this.bushos.find(b => Number(b.id) === Number(id)) || null; },
        getClan(id) { return clans.find(c => Number(c.id) === Number(id)) || null; },
        getClanDaimyo(id) { return Number(id) === 1 ? daimyo : null; },
        kunishuSystem: { getKunishu() { return null; } },
        courtRankSystem: { RANK_ID_SHOGUN: 1, RANK_IDS_CANDIDATE: [], getRankData() { return null; }, getHighestRankData() { return null; } }
    };
    const system = new ctx.InterviewSystem(game);
    system.activeInterviewAttitude = 'friendly';
    system._getConcealmentProfile = () => ({ perceivedBand: 'stable' });
    const row = { target: father, mode: 'expert', domain: { key: 'intelligence', label: '智謀' } };
    let messages = system._getRumorMessages(interviewer, row).join('');
    assert.ok(messages.includes('父上は今、朝倉家に仕えておられます'), '他家にいる父は所属から話し始める');
    assert.ok(messages.includes('智謀にはことのほか長けておられます'), '親族の能力は伝聞ではなく本人の言葉として続ける');
    assert.ok(!/噂|耳に|聞けば|評判/.test(messages), '親族を通常の噂テンプレートへ通さない');

    father.clan = 0;
    father.status = 'ronin';
    messages = system._getRumorMessages(interviewer, row).join('');
    assert.ok(messages.includes('父上は今、仕官せずにおられます'), '浪人の親族は所属家を捏造せず仕官していないことを自然に述べる');
    assert.ok(!messages.includes('今の主君'), '浪人の親族に主君評を続けない');
});

test('武将の噂は周辺拠点を一度だけ辿り専門家/総合候補を軽量抽出する', () => {
    const ctx = createContext({
        BushoStatusRules: {
            isActive(b) { return b.status === 'active'; },
            isRonin(b) { return b.status === 'ronin'; }
        },
        MapGraphService: { isAdjacent() { return false; } },
        LoyaltyInsightRules: {
            getConcealmentProfile(b) { return { perceivedBand: Number(b.loyalty || 0) >= 85 ? 'stable' : 'danger' }; }
        },
        SkillManager: {
            getAptitudeLevel(rank) { return ({ S: 5, A: 4, B: 3, C: 2, D: 1, E: 0 })[rank] || 0; }
        }
    });
    loadScript(ctx, 'js/config.js');
    loadScript(ctx, 'js/interview_system.js');
    const castles = [
        { id: 1, ownerClan: 1 }, { id: 2, ownerClan: 2 }, { id: 3, ownerClan: 3 }, { id: 4, ownerClan: 4 }
    ];
    const adjacency = new Map([[1, [2]], [2, [1, 3]], [3, [2, 4]], [4, [3]]]);
    const low = { id: 10, name: '低能力', clan: 2, castleId: 2, status: 'active', leadership: 40, strength: 30, politics: 30, diplomacy: 30, intelligence: 30, charm: 30, loyalty: 90 };
    const expertTarget = { id: 11, name: '統率者', clan: 3, castleId: 3, status: 'active', leadership: 75, strength: 72, politics: 50, diplomacy: 40, intelligence: 60, charm: 55, loyalty: 90 };
    const generalTarget = { id: 12, name: '万能型', clan: 2, castleId: 2, status: 'active', leadership: 65, strength: 60, politics: 60, diplomacy: 60, intelligence: 55, charm: 10, loyalty: 70 };
    const tooFar = { id: 13, name: '遠方', clan: 4, castleId: 4, status: 'active', leadership: 99, strength: 99, politics: 99, diplomacy: 99, intelligence: 99, charm: 99, loyalty: 90 };
    const kunishu = { id: 14, name: '蜂須賀政勝', clan: 0, belongKunishuId: 5, castleId: 2, status: 'active', leadership: 62, strength: 65, politics: 55, diplomacy: 50, intelligence: 60, charm: 55, loyalty: 60 };
    const aptitudeTarget = { id: 15, name: '騎馬巧者', clan: 2, castleId: 2, status: 'active', leadership: 55, strength: 55, politics: 45, diplomacy: 40, intelligence: 45, charm: 45, aptKiba: 'A', loyalty: 80 };
    const game = {
        playerClanId: 1, castles, bushos: [low, expertTarget, generalTarget, tooFar, kunishu, aptitudeTarget],
        mapGraph: { getAdjacentIds(c) { return adjacency.get(c.id) || []; } },
        getCastle(id) { return castles.find(c => c.id === Number(id)); },
        getClan(id) { return { id, name: `勢力${id}` }; },
        kunishuSystem: { getKunishu(id) { return id === 5 ? { id: 5, leaderId: 99, getName() { return '川並衆'; } } : null; } }
    };
    const system = new ctx.InterviewSystem(game);
    const region2 = system._getRumorRegionCastleIds(2);
    assert.deepStrictEqual(Array.from(region2).sort((a,b)=>a-b), [1,2,3], '2リンク探索は周辺拠点だけを一度Set化する');
    assert.strictEqual(system._getRumorExpertDomain({ leadership: 69, strength: 30, politics: 30, diplomacy: 30, intelligence: 30, charm: 30 }), null, '70未満だけ高い武将を専門家扱いしない');
    assert.strictEqual(system._getRumorExpertDomain({ leadership: 70, strength: 50, politics: 40, diplomacy: 30, intelligence: 60, charm: 55 }).key, 'leadership');
    assert.strictEqual(system._isRumorExpertCandidate(low, { key: 'leadership' }), false, '噂対象も70未満なら専門分野候補にしない');
    assert.strictEqual(system._isRumorExpertCandidate(expertTarget, { key: 'leadership' }), true, '70以上かつ本人上位能力なら専門分野候補にする');
    assert.strictEqual(system._getRumorGeneralTotal(generalTarget), 300, '総合は魅力を除く5能力合計を使う');
    assert.strictEqual(system._isRumorGeneralCandidate(generalTarget), true, '専門性のない聞き手向けに5能力合計300以上を候補にする');
    assert.strictEqual(system._isRumorGeneralCandidate({ ...generalTarget, diplomacy: 59, charm: 99 }), false, '魅力が高くても5能力合計300未満なら総合候補にしない');
    assert.strictEqual(system._isRumorGeneralCandidate(low), false, '弱い武将を総合的に強い噂対象にしない');
    const apt = system._getRumorBestAptitude(aptitudeTarget);
    assert.ok(apt && apt.key === 'aptKiba' && apt.rank === 'A', '能力が低めでもA適性なら噂理由を持てる');
    assert.strictEqual(system._buildRumorCandidateRow(aptitudeTarget, null, 2).mode, 'aptitude', 'A/S適性を独立した噂候補として扱う');
    assert.ok(!system._getRumorRegionalCandidates(region2).includes(tooFar), '探索範囲外の武将は候補にしない');
    assert.ok(!system._getRumorSubjectText(kunishu).includes('城'), '諸勢力の地域アンカーを実所在地の城名として噂に出さない');
});

test('武将の噂は表面態度で情報量を変え同一面談中は再抽選しない', () => {
    const ctx = createContext({
        BushoStatusRules: { isActive: b => b.status === 'active', isRonin: b => b.status === 'ronin' },
        LoyaltyInsightRules: { getConcealmentProfile() { return { perceivedBand: 'danger' }; } }
    });
    loadScript(ctx, 'js/config.js');
    loadScript(ctx, 'js/interview_system.js');
    const target = { id: 20, name: '噂武将', clan: 2, castleId: 2, status: 'active', loyalty: 60 };
    const messages = [];
    const game = {
        playerClanId: 1,
        bushos: [],
        castles: [],
        getClan() { return { name: '他家' }; },
        kunishuSystem: {
            getKunishu(id) { return Number(id) === 5 ? { id: 5, leaderId: 22, getName() { return '川並衆'; } } : null; }
        },
        ui: { interviewView: { showMessages(_b, rows) { messages.push(rows); } } }
    };
    const system = new ctx.InterviewSystem(game);
    const row = { target, mode: 'expert', domain: { key: 'leadership', label: '統率' } };
    system.activeInterviewAttitude = 'friendly';
    assert.strictEqual(system._getRumorMessages({}, row).length, 3, '良好な態度なら存在・能力・立場/主君評判の3項目を話す');
    const daimyoRow = { ...row, target: { ...target, id: 21, isDaimyo: true } };
    assert.strictEqual(system._getRumorMessages({}, daimyoRow).length, 2, '噂対象が大名本人なら自明な立場説明を重ねず2項目で終える');
    const leaderRow = { ...row, target: { ...target, id: 22, clan: 0, belongKunishuId: 5 } };
    assert.strictEqual(system._getRumorMessages({}, leaderRow).length, 2, '噂対象が諸勢力頭領本人なら自明な立場説明を重ねず2項目で終える');
    system.activeInterviewAttitude = 'reserved';
    assert.strictEqual(system._getRumorMessages({}, row).length, 2, '控えめな態度なら2項目に口数を減らす');
    let picks = 0;
    system.activeInterviewAttitude = 'friendly';
    system._selectRumorTarget = () => { picks++; return row; };
    system.showMainMenu = () => {};
    system.executeInterviewRumor({ id: 1 });
    system.executeInterviewRumor({ id: 1 });
    assert.strictEqual(picks, 1, '同じ面談中に噂を押し直しても候補を再抽選しない');
    system.activeInterviewAttitude = 'cold';
    system.executeInterviewRumor({ id: 1 });
    assert.ok(messages[messages.length - 1][0].includes('申し上げることはございませぬ'), '冷淡な態度では噂を教えない');
});

test('協調性を廃止し人物関係は義理・野望・相性差を正本にする', () => {
    const personnel = read('js/personnel_rules.js');
    const models = read('js/models.js');
    const save = read('js/save_manager.js');
    const kunishu = read('js/kunishu_system.js');
    const warriorsMaster = getRuntimeData().common.warriorsMaster;

    assert.ok(personnel.includes('calcRelationshipProfile(a, b)'), '人物関係の共通計算を持つ');
    assert.ok(personnel.includes('affinityDiff'));
    assert.ok(personnel.includes('dutyMean'));
    assert.ok(personnel.includes('ambitionMean'));
    assert.ok(!models.includes('cooperation'), 'Bushoモデルから協調性を完全に除去する');
    assert.ok(!save.includes('savedBusho.cooperation'), '保存復元処理に協調性を残さない');
    assert.ok(!kunishu.includes('cooperation:'), '自動生成武将にも協調性を持たせない');
    assert.ok(warriorsMaster.every(row => !Object.prototype.hasOwnProperty.call(row, 'cooperation')), '武将master BINから協調性列を削除する');
});


test('戦闘カメラは城種点ではなく領域重心を使い点滅位置と一致させる', () => {
    const data = read('js/data_manager.js');
    const map = read('js/ui_map.js');
    assert.ok(data.includes('this.castlePixelCenters = centersByCastleId'), '起動時に城領域重心を保持する');
    assert.ok(data.includes('sumX: 0, sumY: 0, count: 0'), '領域割当と同時に重心を集計する');
    assert.ok(map.includes("options.anchor === 'territory'"), 'カメラ側に領域中心アンカーを持つ');
    assert.ok(map.includes('usesLockedBattleCamera'), '戦争中の点滅・制圧は開戦時カメラを再利用する');
    assert.ok(map.includes("anchor: 'territory'"), '戦闘系カメラは領域中心アンカーを使う');
});

test('低FPS端末のsmoothカメラは最初の遅延で目的地へワープしない', () => {
    const map = read('js/ui_map.js');
    assert.ok(map.includes('let elapsed = 0'));
    assert.ok(map.includes('let lastFrameTime = null'));
    assert.ok(map.includes('const maxFrameAdvance = 50'));
    assert.ok(map.includes('elapsed += Math.min(maxFrameAdvance, rawDelta)'), '1フレームの進行量を制限する');
    const focusBlock = map.slice(map.indexOf('focusMapOnCastle(castleOrId'), map.indexOf('// 既存コードとの互換窓口'));
    assert.ok(!focusBlock.includes('(currentTime - startTime) / duration'), 'focusMapOnCastleではrAF開始待ち時間をそのまま進捗へ加算しない');
});

test('モーダル閉鎖時の実機診断は復帰処理を段階別に記録する', () => {
    const ui = read('js/ui.js');
    const info = read('js/ui_info.js');
    const turn = read('js/turn_manager.js');
    assert.ok(info.includes("ui:modal_close:start"));
    assert.ok(info.includes("ui:modal_close:selector_done"));
    assert.ok(info.includes("resumeBackgroundUpdates('ui:modal_close')"));
    assert.ok(info.includes("ui:modal_close:state_reset_done"));
    assert.ok(ui.includes("mark('recover_map_start')"));
    assert.ok(ui.includes("mark('castle_glows_start')"));
    assert.ok(ui.includes("mark('clan_colors_start')"));
    assert.ok(ui.includes("mark('snow_start')"));
    assert.ok(ui.includes("mark('keep_highlight_start')"));
    assert.ok(turn.includes("writeAIDiagnostic(castle, 'ai_turn:scheduled')"), 'プレイ時/観戦時共通AIターンで次の診断へ進める');
});


test('諸勢力鎮圧は出撃元ではなくkunishu.castleIdを戦場の正本にする', () => {
    const kunishu = read('js/kunishu_system.js');
    const ai = read('js/ai.js');
    assert.ok(kunishu.includes('const actualTargetCastleId = Number(kunishu && kunishu.castleId) || Number(targetCastleId)'));
    assert.ok(kunishu.includes('checkReinforcementAndStartWar(atkCastle, actualTargetCastleId'));
    assert.ok(!kunishu.includes('checkReinforcementAndStartWar(atkCastle, targetCastleId'), '呼出元の古い対象IDへ戻さない');
    assert.ok(ai.includes('executeKunishuSubjugate(sourceCastle, Number(kunishu.castleId)'));
    assert.ok(!ai.includes('executeKunishuSubjugate(sourceCastle, sourceCastle.id'), 'AI鎮圧で出撃元IDを戦場として渡さない');
});

test('戦争中は戦場カメラを一度確定し点滅と制圧で再フォーカスしない', () => {
    const war = read('js/war_effort.js');
    const map = read('js/ui_map.js');
    const ui = read('js/ui.js');
    assert.ok(war.includes('battleFocusCastleId: Number(defCastle.id) || 0'));
    assert.ok(war.includes("reason: 'battle_start'"));
    assert.ok(war.includes('this.state.battleCameraLocked = true'));
    assert.ok(map.includes('warState.battleCameraLocked'));
    assert.ok(map.includes('Number(warState.battleFocusCastleId) === firstId'));
    assert.ok(ui.includes("reason: 'battle_modal_close'"), 'プレイヤー戦闘モーダルを閉じたDOM状態で同じ戦場へ補正する');
    assert.ok(ui.includes("transition: 'instant'"));
    assert.ok(war.includes('this.state.battleCameraLocked = false'), '戦争終了後は通常カメラへ戻す');
});

test('勢力色Canvasの1pixel健全性確認はwillReadFrequently付きcontextを使う', () => {
    const map = read('js/ui_map.js');
    assert.ok(map.includes("overlay.getContext('2d', { willReadFrequently: true })"));
    assert.ok(map.includes("canvas.id === 'clan-color-overlay' ? { willReadFrequently: true } : undefined"), '最初のcontext生成時からreadback用途を宣言する');
});

test('自家武将の出奔通知は通常メッセージ共通処理showDialogAsyncを使う', () => {
    const faction = read('js/faction_system.js');
    const start = faction.indexOf('async executeRonin(busho)');
    const end = faction.indexOf('/**', start + 10);
    const block = faction.slice(start, end > start ? end : start + 1800);
    assert.ok(block.includes('await this.game.ui.showDialogAsync(message)'));
    assert.ok(!block.includes('showCutin('), '出奔専用カットインを残さない');
});

test('総取りは守備側が撤退成功した場合は発生せず、撤退できない崩壊時だけ発生する', () => {
    const ctx = createContext({ WarManager: class WarManager {} });
    loadScript(ctx, 'js/war_effort.js');
    const wm = new ctx.WarManager();
    wm.game = {
        castles: [{ id: 10, ownerClan: 2 }],
        clans: [
            { id: 1, daimyoPrestige: 300 },
            { id: 2, daimyoPrestige: 100 }
        ],
        getClan(id) { return this.clans.find(c => Number(c.id) === Number(id)); }
    };
    wm.state = {
        isDaimyoCastleFallen: true,
        defenderCastleOutcome: 'retreat',
        attacker: { ownerClan: 1 },
        oldDefClanId: 2
    };
    assert.strictEqual(wm.isTotalTakeoverPending(), false, '撤退成功時は総取りしない');
    wm.state.defenderCastleOutcome = 'collapse';
    assert.strictEqual(wm.isTotalTakeoverPending(), true, '撤退できず崩壊した場合は総取り候補になる');
    wm.state.defenderCastleOutcome = 'held';
    assert.strictEqual(wm.isTotalTakeoverPending(), false, '防衛成功時は総取りしない');
});

test('野戦の守備兵糧切れは攻城戦へ移らずcollapse側の即敗北として扱う', () => {
    const field = read('js/field_war.js');
    const effort = read('js/war_effort.js');
    const foodBlock = field.match(/else if \(defTotalRice <= 0\) \{([\s\S]*?)\n\s*\}/);
    assert.ok(foodBlock, '守備側兵糧切れの判定が必要');
    assert.ok(foodBlock[1].includes("endResult = 'attacker_win_fatal'"), '守備兵糧切れは野戦で即敗北にする');
    const fatalBlock = effort.match(/if \(resultType === 'attacker_win_fatal'\) \{([\s\S]*?)\n\s*\} else if/);
    assert.ok(fatalBlock && fatalBlock[1].includes('this.endWar(true)'), 'fatal敗北は攻城戦へ移らず戦争終了へ進む');
    assert.ok(!fatalBlock[1].includes('startSiegeWarPhase'), 'fatal敗北から攻城戦へ遷移させない');
});

test('ゲームオーバーは短い暗転開始直後から入力を遮断しロード画面経由でタイトルへ戻る', () => {
    const ending = read('js/ending_system.js');
    const ui = read('js/ui.js');
    const css = read('css/style.css');
    assert.ok(css.includes('transition: opacity 0.7s ease-in-out'));
    assert.ok(css.includes('pointer-events: auto;'), 'ending-screenはhidden解除直後から入力を受け止める');
    assert.ok(ending.includes('app.inert = true'));
    assert.ok(ending.includes("this.game.ui.showLoadingScreen('タイトル画面へ戻っています', 5)"));
    assert.ok(ending.includes("returnToTitle({ loadingAlreadyVisible: true })"));
    assert.ok(!ending.includes('setTimeout(resolve, 2500)'), '真っ黒のまま2.5秒待つ旧遷移を残さない');
    assert.ok(ui.includes('const loadingAlreadyVisible = options.loadingAlreadyVisible === true'));
});

test('観戦終了予約メッセージはbodyではなく固定論理画面内へ配置する', () => {
    const ui = read('js/ui.js');
    const css = read('css/style.css');
    const method = ui.match(/showWatchReturnReserved\([\s\S]*?\n\s*\}/);
    assert.ok(method);
    assert.ok(method[0].includes("document.getElementById('game-screen')"));
    assert.ok(method[0].includes('(gameScreen || document.body).appendChild(notice)'));
    const rule = css.match(/#watch-return-reserved-notice \{([\s\S]*?)\n\}/);
    assert.ok(rule && rule[1].includes('position: absolute'), '物理viewport fixedではなくgame-screen内absoluteにする');
});


test('戦争準備の選択は非会話画面へ進む前に確認ダイアログを閉じる', () => {
    const ui = read('js/ui.js');
    const prep = read('js/war_preparation_controller.js');
    const effort = read('js/war_effort.js');
    const field = read('js/field_war.js');
    const war = read('js/war.js');

    const cleanupStart = ui.indexOf('const cleanupAndNext = (callback, closeBeforeAction = false)');
    const cleanupEnd = ui.indexOf('// ★修正：okBtnが見つからなくても', cleanupStart);
    const cleanupBlock = ui.slice(cleanupStart, cleanupEnd);
    assert.ok(cleanupStart >= 0, '非会話遷移用の明示的な即時close指定を持つ');
    assert.ok(cleanupBlock.indexOf('closeCompletely();') < cleanupBlock.indexOf('const result = callback();'), '指定時はcallbackより先にダイアログを閉じる');
    assert.ok(ui.includes('choice.closeBeforeAction === true'), 'カスタム選択肢でも先閉じを指定できる');
    assert.ok(ui.includes('dialog.customOpts?.closeBeforeOk === true'));
    assert.ok(ui.includes('dialog.customOpts?.closeBeforeCancel === true'));

    const atkPrompt = prep.slice(prep.indexOf('"他勢力に援軍を要請しますか？"'), prep.indexOf('} else {', prep.indexOf('"他勢力に援軍を要請しますか？"')));
    assert.ok(atkPrompt.includes('closeBeforeOk: true') && atkPrompt.includes('closeBeforeCancel: true'), '攻撃側の援軍要請確認は要請する/しないの双方で先に閉じる');
    assert.ok(prep.includes("okText: '出陣する', okClass: 'btn-danger', cancelText: 'やめる', closeBeforeOk: true, closeBeforeCancel: true"), '開戦最終確認も演出開始前に閉じる');
    assert.ok(effort.includes("okText: '要請する', cancelText: '要請しない', closeBeforeOk: true, closeBeforeCancel: true"), '守備側の援軍要請確認も同じ規則にする');
    assert.ok(field.includes("{ closeBeforeOk: true }"), '野戦撤退・終了通知から戦場状態を動かす前にも閉じる');
    assert.ok(war.includes('攻撃軍の兵糧が尽きました。') && war.includes('攻撃軍は撤退します。') && war.includes('{ closeBeforeOk: true }'), '攻城戦の兵糧切れ通知も戦争終了前に閉じる');
});

test('外交の非同期会話遷移は固定時間で旧ダイアログを閉じず明示的handoffを使う', () => {
    const ui = read('js/ui.js');
    const command = read('js/command_system.js');
    const scheduleStart = ui.indexOf('_scheduleDialogHandoffClose(closeFn');
    const scheduleEnd = ui.indexOf('showDialogAsync(', scheduleStart);
    const scheduleBlock = ui.slice(scheduleStart, scheduleEnd);
    assert.ok(ui.includes('beginDialogHandoffHold()'));
    assert.ok(ui.includes('endDialogHandoffHold()'));
    assert.ok(ui.includes('_closePendingDialogHandoffNow()'));
    assert.ok(scheduleBlock.includes("if ((this._dialogHandoffHoldCount || 0) > 0) return;"), 'hold中はgraceMsのtimerを開始しない');

    const execStart = command.indexOf('async executeWithEvent(type');
    const execEnd = command.indexOf('showAdviceAndExecute(', execStart);
    const execBlock = command.slice(execStart, execEnd);
    assert.ok(execBlock.includes("'goodwill', 'alliance', 'marriage', 'break_alliance'"));
    assert.ok(execBlock.includes('ui.beginDialogHandoffHold()'));
    assert.ok(execBlock.includes('finally'));
    assert.ok(execBlock.includes('ui.completeVisualHandoff()'), '例外や無表示終了でも使者選択画面を残さない');
    assert.ok(execBlock.includes('ui.endDialogHandoffHold()'));
});

test('外交の使者選択画面は次の会話が可視化されるまで保持する', () => {
    const ui = read('js/ui.js');
    const busho = read('js/ui_info_busho.js');
    assert.ok(ui.includes('beginVisualHandoff(closeFn)'));
    assert.ok(ui.includes('completeVisualHandoff()'));
    const dialogVisible = ui.indexOf("modal.classList.remove('hidden');", ui.indexOf('async processDialogQueue')) >= 0
        ? ui.indexOf("modal.classList.remove('hidden');", ui.indexOf('async processDialogQueue'))
        : ui.indexOf("modal.classList.remove('hidden');");
    const handoffAfterDialog = ui.indexOf('this.completeVisualHandoff();', dialogVisible);
    assert.ok(dialogVisible >= 0 && handoffAfterDialog > dialogVisible, '次の会話を表示した後で元画面を閉じる');
    assert.ok(busho.includes("actionType === 'diplomacy_doer'"));
    assert.ok(busho.includes("diplomacySubAction === 'break_alliance'"), '会話へ直行する断交は担当選択から直接handoffする');
    assert.ok(busho.includes('diplomacyKeepsSelectorForConfirmation'), '最終確認・軍師助言を挟む外交は取消用に担当一覧を保持する');
    assert.ok(busho.includes('this.ui.beginVisualHandoff(() => this.closeCommonModal())'));
});

test('結果画面との引き渡しは結果を先に表示し背景復帰も結果画面で覆ったまま行う', () => {
    const ui = read('js/ui.js');
    const showStart = ui.indexOf('showResultModal(msg');
    const closeStart = ui.indexOf('\n    closeResultModal() {', showStart);
    const showBlock = ui.slice(showStart, closeStart);
    assert.ok(showBlock.indexOf("this.resultModal.classList.remove('hidden')") < showBlock.indexOf('this._closePendingDialogHandoffNow()'), '結果画面を可視化してから旧会話を閉じる');
    assert.ok(showBlock.indexOf('this._closePendingDialogHandoffNow()') < showBlock.indexOf('this.pauseBackgroundUpdates()'), '背景リソース整理より先に引き渡し先を表示する');

    const closeEnd = ui.indexOf('showQuantityModal(', closeStart);
    const closeBlock = ui.slice(closeStart, closeEnd > closeStart ? closeEnd : closeStart + 2400);
    assert.ok(closeBlock.indexOf('this.resumeBackgroundUpdates()') < closeBlock.indexOf("this.resultModal.classList.add('hidden')"), '背景を復帰してから結果画面を隠す');
});


test('野戦地形チップは静的な共通描画を使い、川をマス単位で常時アニメーションしない', () => {
    const css = read('css/style.css');
    const field = read('js/field_war.js');
    assert.ok(css.includes('.hex-plain {') && css.includes('.hex-forest {') && css.includes('.hex-mountain {') && css.includes('.hex-river {') && css.includes('.hex-sea {'));
    assert.ok(css.includes("data:image/svg+xml"), '地形質感は共通の静的SVGを使い回す');
    const riverStart = css.indexOf('.hex-river {');
    const riverEnd = css.indexOf('.hex-mountain {', riverStart);
    const riverBlock = css.slice(riverStart, riverEnd);
    assert.ok(riverBlock.includes('animation: none !important'), '川HEXは常時アニメーションしない');
    assert.ok(!css.includes('@keyframes river-ripple'), '旧river-rippleを残さない');
    const hexStart = css.indexOf('.fw-hex {');
    const hexEnd = css.indexOf('.fw-hex::before', hexStart);
    const hexBlock = css.slice(hexStart, hexEnd);
    assert.ok(!hexBlock.includes('will-change: filter'), '数百HEXをwill-changeで個別レイヤー化しない');
    assert.ok(!hexBlock.includes('translateZ(0)'), '数百HEXをtranslateZで個別レイヤー化しない');
    assert.ok(field.includes('hex.dataset.terrain = visualTerrain'));
    assert.ok(field.includes('terrain-variant-${Math.abs((x * 17 + row * 31)) % 3}'), '静的な座標差分で反復感だけ弱める');
    const forestStart = css.indexOf('.hex-forest {');
    const forestEnd = css.indexOf('.hex-river {', forestStart);
    const forestBlock = css.slice(forestStart, forestEnd);
    const mountainStart = css.indexOf('.hex-mountain {');
    const mountainEnd = css.indexOf('/* 座標ごとにパターン位置', mountainStart);
    const mountainBlock = css.slice(mountainStart, mountainEnd);
    assert.ok(forestBlock.includes('background-size: 60px 52px'), '森は単独アイコンではなく複数HEXで馴染む広い樹冠パターンを使う');
    assert.ok(mountainBlock.includes('background-size: 60px 52px'), '山は単独の尖峰ではなく複数HEXで馴染む広い低山・尾根パターンを使う');
    assert.ok(forestBlock.includes('%3Ccircle'), '森は川の流線と区別できる樹冠の塊を使う');
    assert.ok(mountainBlock.includes('#8a6847') || mountainBlock.includes('%238a6847'), '山は森・川と区別しやすい茶色系の地肌を使う');
    assert.ok(mountainBlock.includes('L6 20') && !mountainBlock.includes('%3Ccircle'), '山は樹冠や水面の波ではなく斜面・尾根線で描く');
});

test('雨雪は背景座標の全画面再描画ではなく少数の合成レイヤーを移動する', () => {
    const css = read('css/animation.css');
    assert.ok(css.includes('#fw-weather-layer::before, #war-weather-layer::before'));
    assert.ok(css.includes('contain: paint'));
    assert.ok(css.includes('@keyframes rain-layer-drift'));
    assert.ok(css.includes('@keyframes snow-layer-drift'));
    assert.ok(css.includes('transform: translate3d(-20px, -40px, 0)'));
    assert.ok(css.includes('transform: translate3d(0, -50px, 0)'));
    assert.ok(!css.includes('@keyframes rain-fall'), '旧background-position雨アニメーションを残さない');
    assert.ok(!css.includes('@keyframes snow-fall'), '旧background-position雪アニメーションを残さない');
});

test('攻城戦PCの援軍能力列・本隊戦力行・命令説明欄を横幅優先で整える', () => {
    const css = fs.readFileSync(path.join(ROOT, 'css/style.css'), 'utf8');
    assert.ok(css.includes('grid-template-columns: 62px 60px minmax(0, 1fr) !important;'), '援軍能力列を約0.8倍へ縮める');
    assert.ok(css.includes('body.is-pc #war-modal .war-reinf-card .war-leader-abilities-reinf {\n    width: 60px;\n    min-width: 60px;'), '援軍能力欄自体も60pxへ揃える');
    assert.ok(css.includes('body.is-pc #war-modal .main-army-box .stat-row {\n    padding: 4px 8px !important;'), '本隊戦力行の縦幅を少し広げる');
    assert.ok(css.includes('body.is-pc #war-modal .war-command-board-label {\n    position: absolute;\n    top: 11px;\n    right: 14px;'), '入力対象部隊ラベルを説明欄右上へ置く');
    assert.ok(css.includes('body.is-pc #war-modal .war-controls-desc {\n    overflow-y: hidden;'), 'PC説明欄は不要なスクロールを出さない');
});

test('外交関係の表示補助値はGameManagerから正本データへ書き込まない', () => {
    const game = read('js/game.js');
    const info = read('js/ui_info.js');
    const block = game.slice(game.indexOf('getRelation(id1, id2)'), game.indexOf('startNewGame(', game.indexOf('getRelation(id1, id2)')));
    assert.ok(block.includes('return this.diplomacyManager.getRelation(id1, id2)'));
    assert.ok(!block.includes('displayStatus'));
    assert.ok(!block.includes('.alliance'));
    assert.ok(!block.includes('.friendship'));
    assert.ok(info.includes('relStatus = rel.status;'), '婚姻は独立列のまま基本statusを表示する');
});

test('歴史イベントの外交値はDiplomacyManagerを通し、存在しない専門部署用fallbackを持たない', () => {
    const event = read('js/event/historical_event.js');
    assert.ok(!/diplomacyValue\[[^\]]+\]\s*=/.test(event), 'イベント側で外交関係オブジェクトを直接構築しない');
    assert.ok(!/\brel\w*\.sentiment\s*=/.test(event), 'イベント側で友好度を直接書き換えない');
    assert.ok(!/\brel\w*\.isEvent\s*=/.test(event), 'イベント側でイベント保護を直接書き換えない');
    assert.ok(event.includes('setSentimentAbsolute('));
    assert.ok(event.includes('setEventRelationFlag('));
    assert.ok(event.includes('applyMarriageLinkData('), '歴史婚姻も外交専門部署の婚姻APIを通す');
    assert.ok(!event.includes('oichi.currentClanId = nagamasa.clan'), 'イベント側から姫の所属を直接変更しない');
    assert.ok(!event.includes('oichi.husbandId = nagamasa.id'), 'イベント側から夫婦関係を直接変更しない');
    assert.ok(!event.includes('candidate.courtRankIds.push(game.courtRankSystem.RANK_ID_SHOGUN)'), 'courtRankSystemが無いのに参照する壊れたfallbackを残さない');
});

test('諸勢力の大名旗揚げも外交関係を直接構築せずDiplomacyManagerを通す', () => {
    const kunishu = read('js/kunishu_system.js');
    const start = kunishu.indexOf('async executeIndependentRise(');
    const end = kunishu.indexOf('async ', start + 10);
    const block = kunishu.slice(start, end > start ? end : kunishu.length);
    assert.ok(block.includes('this.game.diplomacyManager.changeStatus('));
    assert.ok(block.includes('this.game.diplomacyManager.setSentimentAbsolute('));
    assert.ok(!/newClan\.diplomacyValue\[[^\]]+\]\s*=/.test(block));
    assert.ok(!/otherClan\.diplomacyValue\[[^\]]+\]\s*=/.test(block));
});

test('前回AI停止位置の診断表示は静的inline styleとonclick代入を使わない', () => {
    const game = read('js/game.js');
    const css = read('css/style.css');
    const start = game.indexOf('_showPreviousAIDiagnostic()');
    const end = game.indexOf('getRelation(id1, id2)', start);
    const block = game.slice(start, end);
    assert.ok(!block.includes('style.cssText'));
    assert.ok(!block.includes('.onclick ='));
    assert.ok(block.includes("addEventListener('click'"));
    assert.ok(css.includes('#ai-last-checkpoint-badge {'));
});

test('断交時のAI捕虜処遇はasync完了を待ってから結果を表示する', () => {
    const diplomacy = read('js/diplomacy.js');
    assert.ok(diplomacy.includes('await this.game.warManager.autoResolvePrisoners(hostages, captorClanId);'));
    assert.ok(diplomacy.includes('capturedHostageRecords'));
    assert.ok(diplomacy.includes('_convertCapturedHostageToPrisoner(record)'));
});

test('断交後にAIがプレイヤー人質を処遇しても元recordを保持して履歴化できる', async () => {
    const ctx = createContext();
    loadScript(ctx, 'js/config.js');
    loadScript(ctx, 'js/constants.js');
    ctx.LifeStatusRules = { isDead: busho => busho && busho.status === 'dead' };

    const logs = [];
    const dialogs = [];
    const prisoners = [
        { id: 11, name: '処断人質', clan: 1, status: 'active' },
        { id: 12, name: '登用人質', clan: 1, status: 'active' },
        { id: 13, name: '解放人質', clan: 1, status: 'active' }
    ];
    ctx.game = {
        playerClanId: 1,
        getClan(id) { return Number(id) === 2 ? { id: 2, name: '相手家' } : { id: 1, name: '自家' }; },
        warManager: {
            async autoResolvePrisoners(hostages, captorClanId) {
                assert.strictEqual(Number(captorClanId), 2);
                hostages[0].status = 'dead';
                hostages[1].clan = 2;
                hostages[2].clan = 1;
            }
        },
        ui: {
            log(msg, opts) { logs.push({ msg, opts }); },
            async showDialogAsync(msg) { dialogs.push(msg); }
        }
    };
    loadScript(ctx, 'js/diplomacy.js');
    const manager = vm.runInContext('new DiplomacyManager(game)', ctx);
    manager._convertCapturedHostageToPrisoner = () => {};
    const records = prisoners.map(busho => ({ busho, originClanId: 1, captorClanId: 2 }));

    await manager._resolveCapturedHostagesAfterBreak(records);

    assert.strictEqual(logs.length, 3);
    logs.forEach(entry => assert.deepStrictEqual(Array.from(entry.opts.clanIds), [1, 2]));
    assert.ok(dialogs[0].includes('処断人質'));
    assert.ok(dialogs[0].includes('登用人質'));
    assert.ok(dialogs[0].includes('解放人質'));
});

test('不可逆な特殊処遇の処断は最終確認を挟む', () => {
    const war = read('js/war_effort.js');
    assert.ok(war.includes("onClick: () => this.confirmDaimyoPrisonerKill(prisoner)"));
    assert.ok(war.includes('confirmDaimyoPrisonerKill(prisoner)'));
    assert.ok(war.includes('`${prisoner.name}を本当に処断しますか？`'));
    assert.ok(war.includes("okText: '処断する'"));
    assert.ok(war.includes("cancelText: '戻る'"));

    const diplomacy = read('js/diplomacy.js');
    assert.ok(diplomacy.includes('`${princess.name}を本当に処断しますか？`'));
    assert.ok(diplomacy.includes("{ label: '処断する', value: 'yes', className: 'btn-danger' }"));
    assert.ok(diplomacy.includes("{ label: '戻る', value: 'no', className: 'btn-secondary' }"));
});

test('AIが断交して攻撃する場合も人質・姫の処遇完了を待ってから進む', () => {
    const ai = read('js/ai.js');
    const start = ai.indexOf('const breakResult = this.game.diplomacyManager.applyBreakAlliancePenalty');
    assert.ok(start >= 0, 'AI断交は結果オブジェクトを受け取る');
    const block = ai.slice(start, start + 900);
    assert.ok(block.includes('await this.game.diplomacyManager.resolveBreakAllianceConsequences(breakResult);'));
    assert.ok(block.includes('isStillEnemy = breakResult.becameHostile === true;'));
});

test('外交断交から捕虜UIを使う時は戦後処理を走らせず拘束城を登用先に使う', () => {
    const war = read('js/war_effort.js');
    assert.ok(war.includes('startPrisonerPhase(context = null)'));
    assert.ok(war.includes('prisonerPhaseContext?.skipWarCleanup === true'));
    assert.ok(war.includes("if (typeof prisonerPhaseContext.onComplete === 'function') prisonerPhaseContext.onComplete();"));
    assert.ok(war.includes('Number(heldCastle.ownerClan) === Number(this.game.playerClanId)'));
    const diplomacy = read('js/diplomacy.js');
    assert.ok(diplomacy.includes('startPrisonerPhase({'));
    assert.ok(diplomacy.includes('skipWarCleanup: true'));
});


test('諸勢力の兵科上限0を未指定扱いせず月次補充可能数0として保持する', () => {
    const ctx = createContext();
    loadScript(ctx, 'js/models.js');
    const Kunishu = vm.runInContext('Kunishu', ctx);
    const k = new Kunishu({
        id: 1, castleId: 1, leaderId: 0,
        maxSoldiers: 1200, soldiers: 1200,
        maxDefense: 500, defense: 500,
        maxHorses: 0, horses: 0,
        maxGuns: 0, guns: 0
    });
    assert.strictEqual(k.maxHorses, 0);
    assert.strictEqual(k.maxGuns, 0);
    assert.strictEqual(k.horses, 0);
    assert.strictEqual(k.guns, 0);
});

test('軍団解散はCastleManager一箇所で軍団状態・所属城・AI計画まで初期化する', () => {
    const ctx = createContext();
    loadScript(ctx, 'js/castle_manager.js');
    const CastleManager = vm.runInContext('CastleManager', ctx);
    const commander = { id: 10, isCommander: true };
    const legion = { id: 100, clanId: 1, legionNo: 2, commanderId: 10, objective: '攻撃', status: 'move', targetId: 99, route: [1, 2] };
    const castles = [
        { id: 1, ownerClan: 1, legionId: 2, isDelegated: true },
        { id: 2, ownerClan: 1, legionId: 2, isDelegated: true },
        { id: 3, ownerClan: 2, legionId: 2, isDelegated: true }
    ];
    const cleared = [];
    const game = {
        legions: [legion], castles,
        getBusho(id) { return id === 10 ? commander : null; },
        aiOperationManager: { clearLegionPlanning(clanId, legionNo) { cleared.push([clanId, legionNo]); } }
    };
    const manager = new CastleManager(game);
    assert.strictEqual(manager.disbandLegion(100), 2);
    assert.strictEqual(commander.isCommander, false);
    assert.strictEqual(legion.commanderId, 0);
    assert.strictEqual(legion.objective, null);
    assert.strictEqual(legion.status, 'wait');
    assert.strictEqual(legion.targetId, 0);
    assert.deepStrictEqual(Array.from(legion.route), []);
    assert.deepStrictEqual(cleared, [[1, 2]]);
    assert.strictEqual(castles[0].legionId, 0);
    assert.strictEqual(castles[0].isDelegated, false);
    assert.strictEqual(castles[1].legionId, 0);
    assert.strictEqual(castles[2].legionId, 2, '別勢力の同じ軍団Noは触らない');

    const diplomacy = read('js/diplomacy.js');
    const command = read('js/command_system.js');
    const historical = read('js/event/historical_event.js');
    assert.ok(!/legion\.objective = null/.test(diplomacy), '外交側で軍団モデルを直接初期化しない');
    assert.ok(!/legion\.objective = null/.test(command), 'コマンド側で軍団モデルを直接初期化しない');
    assert.ok(!/legion(ToDismiss)?\.objective = null/.test(historical), 'イベント側で軍団モデルを直接初期化しない');
});

test('継承・城主任命の比較用一時値を武将モデルへ書き込まずセーブ汚染を防ぐ', () => {
    const affiliation = read('js/affiliation_system.js');
    const life = read('js/life_system.js');
    const kunishu = read('js/kunishu_system.js');
    const independence = read('js/independence_system.js');
    for (const source of [affiliation, life, kunishu, independence]) {
        assert.ok(!source.includes('._lordScore'));
        assert.ok(!source.includes('._isRelative'));
        assert.ok(!source.includes('._affinityDiff'));
        assert.ok(!source.includes('._baseScore'));
        assert.ok(!source.includes('._isDirectSon'));
        assert.ok(!source.includes('._nameChangeInfo'));
    }
});


test('訓練上限も士気と同じ内部120・通常100・ゲージ100を設定の正本から使う', () => {
    const ctx = createContext();
    loadScript(ctx, 'js/config.js');
    assert.strictEqual(ctx.WarParams.Military.MaxTrainingInternal, 120);
    assert.strictEqual(ctx.WarParams.Military.MaxTrainingNormal, 100);
    assert.strictEqual(ctx.WarParams.Military.MaxTrainingGauge, 100);

    const commandCatalog = read('js/command_catalog.js');
    const commandSystem = read('js/command_system.js');
    const fieldWar = read('js/field_war.js');
    const warEffort = read('js/war_effort.js');
    const ui = read('js/ui.js');
    const interview = read('js/interview_system.js');
    assert.ok(commandCatalog.includes('MaxTrainingNormal'));
    assert.ok(commandSystem.includes('MaxTrainingNormal'));
    assert.ok(fieldWar.includes('MaxTrainingInternal'));
    assert.ok(warEffort.includes('MaxTrainingInternal'));
    assert.ok(ui.includes('MaxTrainingGauge'));
    assert.ok(interview.includes('MaxTrainingGauge'));
    assert.ok(![commandCatalog, commandSystem, fieldWar, warEffort, ui, interview].join('\n').includes('Military.MaxTraining;'));
});

test('通常の訓練・兵施しは戦争由来の100超を100へ巻き戻さない', () => {
    const ai = read('js/ai.js');
    const command = read('js/command_system.js');
    assert.ok(ai.includes('oldVal >= maxTraining ? oldVal : Math.min(maxTraining, oldVal + val)'));
    assert.ok(ai.includes('oldVal >= maxMorale ? oldVal : Math.min(maxMorale, oldVal + val)'));
    assert.ok(command.includes('oldVal >= maxTraining ? oldVal : Math.min(maxTraining, oldVal + val)'));
    assert.ok(command.includes('oldVal >= maxMorale ? oldVal : Math.min(maxMorale, oldVal + val)'));
    assert.ok(ai.includes('const targetMaxMorale = Math.min(normalMoraleCap'));
});

test('諸勢力親善は外交共通計算へ武将オブジェクトを渡しNaN化を防ぐ', () => {
    const source = read('js/kunishu_system.js');
    assert.ok(source.includes('calcGoodwillIncrease(gold, doer);'));
    assert.ok(!source.includes('calcGoodwillIncrease(gold, doer.diplomacy)'));
});

test('BGMはstart=0でもloopEndを適用し音量変更はcurrentBgmNameを正本にする', () => {
    class MockHowl {
        constructor(options) {
            this.options = options;
            this.bufferSource = {};
            this.lastVolume = options.volume;
            MockHowl.instances.push(this);
        }
        _soundById() { return { _node: { bufferSource: this.bufferSource } }; }
        play() { if (this.options.onplay) this.options.onplay(1); return 1; }
        stop() {}
        unload() {}
        volume(value) {
            if (value !== undefined) this.lastVolume = value;
            return this.lastVolume;
        }
    }
    MockHowl.instances = [];
    const ctx = createContext({ Howl: MockHowl });
    loadScript(ctx, 'js/audio.js');

    ctx.AudioManager.playBGM('SC_ex_Scene1_Duel.ogg');
    const duel = MockHowl.instances.at(-1);
    assert.strictEqual(duel.bufferSource.loopStart, 0);
    assert.ok(Math.abs(duel.bufferSource.loopEnd - (3841330 / 44100)) < 1e-9);

    ctx.AudioManager.playBGM('06_Snowy Sacred Approach.ogg');
    const snowy = MockHowl.instances.at(-1);
    ctx.AudioManager.setBgmVolume(0.5);
    assert.ok(Math.abs(snowy.lastVolume - 0.03) < 1e-9, 'baseVolume 0.06 を維持して音量変更する');

    const source = read('js/audio.js');
    assert.ok(!source.includes('this.bgmPlayer._src[0]'));
    assert.ok(!source.includes('if (loopStart > 0 && this.bgmPlayer)'));
});

test('スマホ状態マークのタイマーは城情報更新のたび先に停止する', () => {
    const source = read('js/ui.js');
    const clearAt = source.indexOf('// 城を切り替えた時は、前の城の状態マーク用タイマーを必ず先に破棄する。');
    const renderAt = source.indexOf('this.mobileTopLeft.innerHTML = content;', clearAt);
    assert.ok(clearAt >= 0 && renderAt > clearAt);
    const block = source.slice(clearAt, renderAt);
    assert.ok(block.includes('clearInterval(this._statusCarouselTimer);'));
    assert.ok(block.includes('this._statusCarouselTimer = null;'));
});

test('大名選択からシナリオへ戻る時はタイトル復帰完了を待ってから新規開始する', () => {
    const source = read('js/ui_map.js');
    const start = source.indexOf('backToScenarioBtn.onclick = async () =>');
    assert.ok(start >= 0);
    const block = source.slice(start, start + 900);
    assert.ok(block.includes('await this.returnToTitle();'));
    assert.ok(block.includes('if (this.game) this.game.startNewGame();'));
    assert.ok(!block.includes('window.GameApp.startNewGame()'));
});

test('シナリオ切替時は巨大地図IDマップとイベント側共有キャッシュを解放する', () => {
    const ctx = createContext();
    loadScript(ctx, 'js/data_manager.js');
    ctx.DataManager.provincePixelMap = [1, 2, 3];
    ctx.DataManager.castlePixelMap = [4, 5, 6];
    ctx.DataManager.castlePixelBounds = [{}];
    ctx.DataManager.castlePixelCenters = [{}];
    ctx.DataManager.provincePixelCount = 3;
    ctx.DataManager.mapImageWidth = 3;
    ctx.DataManager.mapImageHeight = 1;
    ctx.DataManager.releaseMapResources();
    assert.strictEqual(ctx.DataManager.provincePixelMap, null);
    assert.strictEqual(ctx.DataManager.castlePixelMap, null);
    assert.strictEqual(ctx.DataManager.castlePixelBounds, null);
    assert.strictEqual(ctx.DataManager.castlePixelCenters, null);
    assert.strictEqual(ctx.DataManager.provincePixelCount, 0);
    assert.strictEqual(ctx.DataManager.mapImageWidth, 0);
    assert.strictEqual(ctx.DataManager.mapImageHeight, 0);

    const game = read('js/game.js');
    const events = read('js/event/common_events.js');
    const ui = read('js/ui.js');
    assert.ok(game.includes('releaseScenarioMapResources()'));
    assert.ok(game.includes('DataManager.releaseMapResources();'));
    assert.ok(game.includes('window.EventMapEffects.invalidateCaches();'));
    assert.ok(game.includes('this.mapGraph.invalidate();'), '旧castles配列を保持する地図グラフ索引も切替時に解放する');
    assert.ok(game.includes('this.ui.releaseScenarioTransientCaches();'), 'UIの再生成可能な短命キャッシュも切替時に解放する');
    assert.ok(events.includes('const invalidateCaches = () =>'));
    assert.ok(ui.includes('releaseScenarioTransientCaches()'));
    assert.ok(ui.includes('this._dialogFacePreloadCache.clear();'));
    assert.ok(ui.includes('this.game.releaseScenarioMapResources();'));
});

test('登録先のない旧イベントタイミング呼出しを実行経路へ残さない', () => {
    const turn = read('js/turn_manager.js');
    const aiOp = read('js/ai_operation.js');
    assert.ok(!turn.includes("processEvents('turn_start'"));
    assert.ok(!turn.includes("processEvents('turn_end'"));
    assert.ok(!aiOp.includes("processEvents('before_ai_operation'"));
});

test('現行AudioManagerに存在しない旧互換プロパティやfadeOutSe分岐を残さない', () => {
    const source = [read('js/diplomacy.js'), read('js/ui.js')].join('\n');
    assert.ok(!source.includes('_memorizedBgm'));
    assert.ok(!source.includes('fadeOutSe'));
    assert.ok(source.includes('memorizeCurrentBgm()'));
    assert.ok(source.includes('restoreMemorizedBgm()'));
});


test('大名選択の顔グラはPC・スマホとも正方形を維持する', () => {
    const css = read('css/style.css');
    const selectorAt = css.indexOf('.daimyo-confirm-face {', css.indexOf('/* シナリオ開始前の大名確認情報'));
    assert.ok(selectorAt >= 0);
    const block = css.slice(selectorAt, css.indexOf('}', selectorAt) + 1);
    assert.ok(block.includes('height: auto;'));
    assert.ok(block.includes('aspect-ratio: 1 / 1;'));
    assert.ok(block.includes('box-sizing: border-box;'));
    assert.ok(block.includes('display: block;'));
    const legacy = css.slice(0, css.indexOf('/* シナリオ開始前の大名確認情報'));
    assert.ok(!/\.daimyo-confirm-face\s*\{[^}]*height:\s*80px/s.test(legacy), '旧80px高さ指定を残さない');
    assert.ok(css.includes('body.is-pc .daimyo-confirm-face-column { width: 90px; }'));
    assert.ok(css.includes('body.is-pc .daimyo-confirm-face { max-width: 90px; }'));
});


test('月次給金と役職成長は城主家所属の通常武将だけを対象にする', () => {
    const turn = read('js/turn_manager.js');
    const at = turn.indexOf('給金・役職成長は城主家に所属する通常の活動中武将だけへ限定する');
    assert.ok(at >= 0);
    const block = turn.slice(at, at + 850);
    assert.ok(block.includes('Number(b.clan) === Number(castle.ownerClan)'));
    assert.ok(block.includes('Number(b.belongKunishuId || 0) === 0'));
    assert.ok(block.includes('window.BushoStatusRules.isActive(b)'));
    assert.ok(block.includes('EconomyRules.applyMonthlyCastleUpkeep(castle, bushos, daimyo)'));
    assert.ok(block.includes('bushos.forEach(busho => PersonnelRules.applyMonthlyRoleProgress'));

    const economy = read('js/economy_rules.js');
    const salaryAt = economy.indexOf('static calcCastleSalary');
    const salaryBlock = economy.slice(salaryAt, salaryAt + 650);
    assert.ok(salaryBlock.includes('Number(b.clan) === Number(castle.ownerClan)'));
    assert.ok(salaryBlock.includes('Number(b.belongKunishuId || 0) === 0'));
});

test('通常大名家の防諜は城主家所属の通常武将だけを参照する', () => {
    const strategy = read('js/strategy_system.js');
    const at = strategy.indexOf('getCastleBestStats(castleId)');
    const block = strategy.slice(at, at + 900);
    assert.ok(block.includes('const castle = this.game.getCastle(castleId);'));
    assert.ok(block.includes('Number(b.clan) === Number(castle.ownerClan)'));
    assert.ok(block.includes('Number(b.belongKunishuId || 0) === 0'));

    const skill = read('js/skill_manager.js');
    ['calcBugeiAssassinateDefense', 'calcBugeiCounterIntelligenceBonus'].forEach(name => {
        const pos = skill.indexOf(`static ${name}`);
        assert.ok(pos >= 0);
        const part = skill.slice(pos, pos + 850);
        assert.ok(part.includes('const castle = game.getCastle(castleId);'));
        assert.ok(part.includes('Number(b.clan) === Number(castle.ownerClan)'));
        assert.ok(part.includes('Number(b.belongKunishuId || 0) === 0'));
    });
});

test('新規開始ではAI作戦4種と人事評価キャッシュをすべて破棄する', () => {
    const op = read('js/ai_operation.js');
    const resetAt = op.indexOf('resetAllState()');
    const resetBlock = op.slice(resetAt, resetAt + 450);
    ['this.operations = {};', 'this.draftBases = {};', 'this.grandObjectives = {};', 'this.historyOwnedCastles = {};'].forEach(text => {
        assert.ok(resetBlock.includes(text), `${text} を新規ゲームで破棄する`);
    });

    const game = read('js/game.js');
    const startAt = game.indexOf('startNewGame(options = {})');
    const startBlock = game.slice(startAt, startAt + 2600);
    assert.ok(startBlock.includes('this.aiOperationManager.resetAllState();'));
    assert.ok(startBlock.includes('this.aiStaffing.resetCaches();'));

    const staffing = read('js/ai_staffing.js');
    const cacheAt = staffing.indexOf('resetCaches()');
    const cacheBlock = staffing.slice(cacheAt, cacheAt + 250);
    assert.ok(cacheBlock.includes('this.evaluationCache = {};'));
    assert.ok(cacheBlock.includes('this.lastMonth = -1;'));
});

test('ロード時も前ゲームのAI人事評価キャッシュを破棄する', () => {
    const save = read('js/save_manager.js');
    const restoreAt = save.indexOf('async _restoreSaveDataObj(d)');
    const block = save.slice(restoreAt, restoreAt + 2600);
    assert.ok(block.includes('this.game.aiStaffing.resetCaches();'));
});

test('BGM停止APIはstopBGMへ統一し旧stopBgmを残さない', () => {
    const sources = [read('js/ending_system.js'), read('js/war_effort.js')].join('\n');
    assert.ok(!sources.includes('stopBgm'));
    assert.ok(sources.includes('stopBGM'));
});

test('強制モーダルリセットは状態マークタイマーを破棄しタイトル復帰では背景Canvasを再生成しない', () => {
    const ui = read('js/ui.js');
    const resetAt = ui.indexOf('forceResetModals(options = {})');
    const resetEnd = ui.indexOf('\n    log(msg', resetAt);
    const resetBlock = ui.slice(resetAt, resetEnd > resetAt ? resetEnd : resetAt + 3600);
    assert.ok(resetBlock.includes('clearInterval(this._statusCarouselTimer);'));
    assert.ok(resetBlock.includes('this._statusCarouselTimer = null;'));
    assert.ok(resetBlock.includes('options.skipBackgroundRecovery === true'));
    const titleAt = ui.indexOf('async returnToTitle(options = {})');
    const titleBlock = ui.slice(titleAt, titleAt + 1500);
    assert.ok(titleBlock.includes('this.forceResetModals({ skipBackgroundRecovery: true });'));
});

test('古い実機診断はモーダル閉鎖後の次フレーム到達も記録する', () => {
    const info = read('js/ui_info.js');
    assert.ok(info.includes("ui:modal_close:state_reset_done"));
    assert.ok(info.includes("ui:modal_close:next_frame_done"));
    assert.ok(info.includes('requestAnimationFrame(() =>'));
});

test('システムメニューはセーブ・ロード・設定・履歴・指南書・観戦の順に並ぶ', () => {
    const catalog = read('js/command_catalog.js');
    assert.ok(catalog.includes("items: ['save', 'load', 'settings', 'history', 'guide', 'watch', 'title']"));
});

test('指南書は低能力武将の説明を武将と能力へ統合し、一般地点を拠点と表記する', () => {
    const guide = read('js/guide_data.js');
    assert.strictEqual((guide.match(/能力が低めの武将も役に立つ/g) || []).length, 1, '低能力武将の主説明は1箇所だけに置く');
    assert.ok(!guide.includes('能力が低い武将にも役目はある？'), 'FAQへ同じ説明を重複させない');
    assert.ok(guide.includes('拠点では民忠が月ごとに少しずつ下がる'));
    assert.ok(guide.includes('各拠点に最低限の武将を配置しておく意味があります'));
    assert.ok(!guide.includes('通常の城'));
    assert.ok(!guide.includes('自領の城'));
    assert.ok(!guide.includes('敵城'));
});

test('指南書の攻城戦は攻守双方の兵糧を継戦上の重要要素として案内する', () => {
    const guide = read('js/guide_data.js');
    assert.ok(guide.includes('攻撃側・守備側のどちらも兵糧を消費します'));
    assert.ok(guide.includes('長期戦では双方の兵糧の残りが重要'));
    assert.ok(guide.includes('尽きた側は戦いを続けられません'));
});

test('一般地点の表示語は拠点を正本とし、城主・城壁・攻城戦等の複合語は維持する', () => {
    const architecture = read('ARCHITECTURE.md');
    assert.ok(architecture.includes('一般名称として場所を指す時は「拠点」を使う'));
    assert.ok(architecture.includes('城だけでなく館・御所なども含まれる'));
    assert.ok(architecture.includes('「城主」「城壁」「攻城戦」「籠城」「居城」「落城」「入城」'));
    assert.ok(architecture.includes('内部の `Castle` 型・`castleId` 等のコード識別子まで機械的に改名しない'));
});


test('AI人事の配置人数は同居人物数ではなく自家の通常活動中武将だけを数える', () => {
    const staffing = read('js/ai_staffing.js');
    assert.ok(staffing.includes('_getActiveClanBushosInCastle(castle'));
    const countAt = staffing.indexOf('_getActiveClanBushoCount(castle');
    const countBlock = staffing.slice(countAt, countAt + 1200);
    assert.ok(countBlock.includes('for (const id of castle.samuraiIds)'), '人数取得は在城IDを直接走査して一時配列を作らない');
    assert.ok(countBlock.includes('Number(b.clan) !== numericClanId'));
    assert.ok(countBlock.includes('Number(b.belongKunishuId || 0) !== 0'));
    assert.ok(countBlock.includes('window.LifeStatusRules.isPresent(b)'));
    assert.ok(countBlock.includes('window.BushoStatusRules.isActive(b)'));
    assert.ok(!countBlock.includes('return castle.samuraiIds.length'), '物理在城人数をそのままAI配置人数として使わない');
    assert.ok(staffing.includes('activeClanBushoCountByCastleId.set(Number(c.id), this._getActiveClanBushoCount(c, clanId));'), '移動計画開始時に従来条件で各拠点を一度だけ集計する');
    ['totalBushosInNetwork += getActiveClanBushoCount(c);',
     'let remainingCount = getActiveClanBushoCount(castle);',
     'let targetCount = getActiveClanBushoCount(group.target);'].forEach(text => assert.ok(staffing.includes(text)));
});

test('諸勢力蜂起の勝利時は旧城主家臣だけを退避させ同居諸勢力を巻き込まない', () => {
    const effort = read('js/war_effort.js');
    const at = effort.indexOf('// 蜂起で退避・浪人化するのは、陥落前の城主家に所属する通常武将だけ。');
    assert.ok(at >= 0);
    const block = effort.slice(at, at + 2300);
    assert.ok(block.includes('Number(b.clan) !== Number(oldOwner)'));
    assert.ok(block.includes('Number(b.belongKunishuId || 0) > 0'));
    assert.ok(block.includes('Number(busho.clan) !== Number(oldOwner)'));
    assert.ok(block.includes('Number(busho.belongKunishuId || 0) > 0'));
});

test('後継者不在滅亡は滅亡家所属者だけを浪人化し同居人物を処分しない', () => {
    const life = read('js/life_system.js');
    const at = life.indexOf('// 後継者不在で処分するのは滅亡した大名家の通常武将だけ。');
    assert.ok(at >= 0);
    const block = life.slice(at, at + 550);
    assert.ok(block.includes('Number(l.clan) !== Number(clanId)'));
    assert.ok(block.includes('Number(l.belongKunishuId || 0) > 0'));
    assert.ok(block.includes('this.game.affiliationSystem.becomeRonin(l);'));
});

test('落城捕虜と守備撤退は敗戦大名家の通常武将だけを処理する', () => {
    const effort = read('js/war_effort.js');
    const retreatAt = effort.indexOf('const retreatingClanId = Number(defCastle.ownerClan);');
    assert.ok(retreatAt >= 0);
    const retreatBlock = effort.slice(retreatAt, retreatAt + 2100);
    assert.ok(retreatBlock.includes('Number(b.clan) !== retreatingClanId'));
    assert.ok(retreatBlock.includes('Number(b.belongKunishuId || 0) > 0'));
    assert.ok(retreatBlock.includes('Number(busho.clan) !== retreatingClanId'));

    const captureAt = effort.indexOf('processCaptures(defeatedCastle, winnerClanId)');
    const captureBlock = effort.slice(captureAt, captureAt + 1200);
    assert.ok(captureBlock.includes('Number(b.clan) !== Number(defeatedCastle.ownerClan)'));
    assert.ok(captureBlock.includes('Number(b.belongKunishuId || 0) > 0'));
});

test('撤退先評価の武将数は城主家所属の通常活動中武将だけを使う', () => {
    const war = read('js/war.js');
    const at = war.indexOf('static calcRetreatScore(game, castle)');
    assert.ok(at >= 0);
    const block = war.slice(at, at + 850);
    assert.ok(block.includes('Number(b.clan) === Number(castle.ownerClan)'));
    assert.ok(block.includes('Number(b.belongKunishuId || 0) === 0'));
    assert.ok(block.includes('window.BushoStatusRules.isActive(b)'));
    assert.ok(!block.includes('castle.samuraiIds.length'));
    const effort = read('js/war_effort.js');
    assert.ok(effort.includes('WarSystem.calcRetreatScore(this.game, b) - WarSystem.calcRetreatScore(this.game, a)'));
});

test('実機診断はUI初期化前からtitle扱いにして前回checkpointを上書きしない', () => {
    const game = read('js/game.js');
    const phaseAt = game.indexOf("this.phase = 'title';");
    const uiAt = game.indexOf('this.ui = new UIManager(this);');
    assert.ok(phaseAt >= 0 && uiAt > phaseAt, 'UIManager生成より前にtitleを設定する');
    const writeAt = game.indexOf('writeSystemDiagnostic(phase, castle = null)');
    const writeBlock = game.slice(writeAt, writeAt + 700);
    assert.ok(writeBlock.includes("if (!this.phase || this.phase === 'title') return;"));
});

test('所在地修正版の下河原恒忠・恒長は葛西家の寺池城に配置する', () => {
    const state = getRuntimeData().scenario.warriorsState;
    const byId = new Map(state.map(row => [Number(row.id), row]));
    for (const id of [1070038, 1070039]) {
        const row = byId.get(id);
        assert.ok(row, `${id} が存在する`);
        assert.strictEqual(Number(row.clan), 70);
        assert.strictEqual(Number(row.castleId), 200);
    }
});

test('AI上洛判断は自家所属の通常活動中武将だけを将軍候補に数える', () => {
    const ai = read('js/ai.js');
    const at = ai.indexOf('// 自勢力に正式所属する通常の活動中武将だけから「左馬頭（ID: 80）」を探す。');
    assert.ok(at >= 0);
    const block = ai.slice(at, at + 900);
    assert.ok(block.includes('this.game.getClanBushos(myClanId)'));
    assert.ok(block.includes('Number(b.belongKunishuId || 0) === 0'));
    assert.ok(block.includes('window.BushoStatusRules.isActive(b)'));
    assert.ok(!block.includes('getCastleBushos'));
});

test('野戦スクロール操作は共通解除処理を通してから再登録する', () => {
    const field = read('js/field_war.js');
    const unbindAt = field.indexOf('_unbindFieldWarScrollEvents()');
    assert.ok(unbindAt >= 0);
    const unbindBlock = field.slice(unbindAt, unbindAt + 1800);
    for (const type of ['click', 'wheel', 'touchstart', 'touchmove', 'touchend']) {
        assert.ok(unbindBlock.includes(`removeEventListener('${type}'`), `${type} を解除する`);
    }

    const initAt = field.indexOf("const scrollEl = document.getElementById('fw-map-scroll');");
    assert.ok(initAt >= 0);
    const initBlock = field.slice(initAt, initAt + 9000);
    assert.ok(initBlock.includes('this._unbindFieldWarScrollEvents();'));
    for (const type of ['click', 'wheel', 'touchstart', 'touchmove', 'touchend']) {
        assert.ok(initBlock.includes(`addEventListener('${type}'`), `${type} を再登録する`);
    }
    assert.ok(initBlock.includes('this._fwScrollEventBindings = {'));
});

test('捕虜処遇は専用武将一覧を持たず既存の行動列なし共通武将選択を使う', () => {
    const info = read('js/ui_info.js');
    const busho = read('js/ui_info_busho.js');
    const at = info.indexOf('showPrisonerSelector(phaseType, captives, onConfirm, onBack)');
    assert.ok(at >= 0);
    const block = info.slice(at, at + 1600);
    assert.ok(block.includes("this.openBushoSelector('prisoner_treatment'"));
    assert.ok(block.includes('customBushos: captives'));
    assert.ok(block.includes('customIsMulti: true'));
    assert.ok(block.includes('customDisabledIds: disabledIds'));
    assert.ok(block.includes('allowDone: true'));
    assert.ok(!info.includes('_renderPrisonerSelector('));
    assert.ok(!info.includes('handlePrisonerSelect('));
    assert.ok(busho.includes('const hideActionCol = isViewMode || isActionFree;'));
    assert.ok(busho.includes('isMulti = extraData.customIsMulti === true;'));
});

test('共通武将選択は個別の選択不可IDを共通経路で扱える', () => {
    const busho = read('js/ui_info_busho.js');
    const setAt = busho.indexOf('const customDisabledIdSet =');
    const itemAt = busho.indexOf('const buildBushoListItem = (b) => {');
    assert.ok(setAt >= 0 && itemAt >= 0);
    const setBlock = busho.slice(setAt, setAt + 400);
    const itemBlock = busho.slice(itemAt, itemAt + 500);
    assert.ok(setBlock.includes('Array.isArray(extraData.customDisabledIds)'));
    assert.ok(setBlock.includes('new Set(extraData.customDisabledIds.map(Number))'));
    assert.ok(itemBlock.includes('customDisabledIdSet.has(Number(b.id))'));
    assert.ok(itemBlock.includes('isSelectable = false'));
});

test('野戦終了時は通常地図復帰より先に重い戦場DOMを解放する', () => {
    const field = read('js/field_war.js');
    const finishAt = field.indexOf('const finishProcess = async () => {');
    assert.ok(finishAt >= 0);
    const block = field.slice(finishAt, finishAt + 1600);
    const releaseAt = block.indexOf('this.releaseFieldWarVisualResources();');
    const resumeAt = block.indexOf("this.game.ui.resumeMainMapAfterBattle('field-war')");
    assert.ok(releaseAt >= 0);
    assert.ok(resumeAt >= 0);
    assert.ok(releaseAt < resumeAt, '戦場DOM解放を通常地図復帰より先に行う');

    const releaseDefAt = field.indexOf('\n    releaseFieldWarVisualResources() {');
    const releaseBlock = field.slice(releaseDefAt, releaseDefAt + 1800);
    assert.ok(releaseBlock.includes('this._unbindFieldWarScrollEvents();'));
    assert.ok(releaseBlock.includes('mapEl.replaceChildren();'));
    assert.ok(releaseBlock.includes('this.hexElements = null;'));
    assert.ok(releaseBlock.includes('this._fwUnitElementCache = new Map();'));
});

test('野戦AIは交戦支援をターゲット・移動・攻撃で共通評価する', () => {
    const ctx = createContext({ addEventListener() {} });
    loadScript(ctx, 'js/config.js');
    loadScript(ctx, 'js/field_war.js');

    const manager = new ctx.FieldWarManager({});
    const unit = { id: 'support', isGeneral: false, ap: 3, direction: 0, troopType: 'ashigaru', hasMoved: false };
    const general = { id: 'general', isGeneral: true, x: 5, y: 4 };
    const ally = { id: 'ally', isGeneral: false, x: 4, y: 6 };
    const threat = { id: 'threat', x: 6, y: 5, isGeneral: false, troopType: 'ashigaru' };
    const other = { id: 'other', x: 9, y: 8, isGeneral: true, troopType: 'teppo' };

    const context = manager._buildAIEngagementContext(unit, [threat, other], [general, ally]);
    assert.strictEqual(context.ownGeneralEngaged, true, '総大将に隣接する敵を救援対象として認識する');
    assert.ok(context.generalThreatEnemyIds.has('threat'));
    assert.ok(manager._getAITargetEngagementBonus(unit, threat, context) > manager._getAITargetEngagementBonus(unit, other, context), '総大将へ取り付く敵へ追加優先度を与える');
    assert.strictEqual(manager._getAISupportUrgency(threat, context), ctx.WarParams.FieldAI.Support.GeneralThreatUrgency);

    assert.strictEqual(manager._getAIMoveBudget(unit, 0), 2, '通常時は攻撃1APを残す');
    assert.strictEqual(manager._getAIMoveBudget(unit, 1), 3, '交戦救援時は川越え等のため全APを前進へ使える');
});

test('野戦AIの攻撃可否は向き変更APに加えて攻撃1APまで確保する', () => {
    const ctx = createContext({ addEventListener() {} });
    loadScript(ctx, 'js/config.js');
    loadScript(ctx, 'js/field_war.js');

    const manager = new ctx.FieldWarManager({});
    manager.canAttackTarget = () => true;
    manager.getDirection = () => 1;
    manager.getTurnCost = () => 1;
    const unit = { id: 'u', isGeneral: false, direction: 0, troopType: 'ashigaru', hasMoved: false };
    const enemy = { id: 'e', x: 1, y: 1, isGeneral: false, troopType: 'ashigaru' };
    const context = {
        generalThreatEnemyIds: new Set(),
        engagedEnemyIds: new Set(),
        engagementCountByEnemy: new Map()
    };

    assert.strictEqual(manager._getAIAttackOpportunityAt(unit, 0, 0, 0, 1, false, [enemy], context), null, '向き変更だけでAPを使い切る場合は攻撃可能扱いにしない');
    assert.ok(manager._getAIAttackOpportunityAt(unit, 0, 0, 0, 2, false, [enemy], context), '向き変更1＋攻撃1を確保できる場合だけ攻撃候補にする');

    const field = read('js/field_war.js');
    assert.ok(field.includes('unit.ap >= turnCost + 1 && this.canAttackTarget(tempUnit, e.x, e.y)'), '実行直前の攻撃対象選択も同じAP基準を使う');
});

test('野戦ダメージ演出は低FPS端末でも描画機会を通してから進行する', () => {
    const field = read('js/field_war.js');
    const css = read('css/animation.css');
    assert.ok(field.includes('async _waitForFieldWarVisualState(minMs = 0)'));
    assert.ok(field.includes('this.game.ui.waitForNextPaint()'));
    assert.ok(field.includes('await this._waitForFieldWarVisualState(120);'));
    assert.ok(field.includes('await this._waitForFieldWarVisualState(35);'));
    assert.ok(field.includes('await this._waitForFieldWarVisualState(0);'));
    assert.ok(field.includes("popup.classList.add('is-leaving');"));
    assert.ok(css.includes('.fw-damage-popup.is-leaving'));
    const popupRuleAt = css.indexOf('.fw-damage-popup {');
    const popupRuleEnd = css.indexOf('}', popupRuleAt);
    const popupRule = css.slice(popupRuleAt, popupRuleEnd + 1);
    assert.ok(!popupRule.includes('animation:'), 'append直後からwall-clock animationを走らせない');
});

test('背景復帰はすでにactiveなら重い地図復旧を二重実行しない', () => {
    const ui = read('js/ui.js');
    const at = ui.indexOf("if (!this.isBackgroundPaused) {");
    assert.ok(at >= 0);
    const block = ui.slice(at, at + 850);
    assert.ok(block.includes("mark('already_active');"));
    assert.ok(block.includes('return;'));
    const recoverAt = block.indexOf('recoverMobileMapResources');
    const returnAt = block.indexOf('return;');
    assert.ok(recoverAt < 0 || returnAt < recoverAt);
});

test('独立・寝返り・謀反履歴は当事者勢力IDを明示する', () => {
    const src = read('js/independence_system.js');
    assert.ok(src.includes("category: 'independence'"));
    assert.ok(src.includes('this._logIndependence(msg, [oldClanId, newClanId]);'));
    assert.ok(src.includes('this._logIndependence(`${rebellionLeader.name}が主君である${oldDaimyo.name}に対し、謀反を起こしました。`, [oldClanId]);'));
    assert.ok(!src.includes('this.game.ui.log(msg);'));
});

test('臣従成立履歴は臣従元と臣従先を明示する', () => {
    const src = read('js/event/common_events.js');
    assert.ok(src.includes("clanIds: [clan.id, playerClanId], category: 'diplomacy'"));
    assert.ok(src.includes("clanIds: [clan.id, selectedTarget.id], category: 'diplomacy'"));
});

test('断交時の姫・人質処遇履歴は双方の勢力IDを明示する', () => {
    const src = read('js/diplomacy.js');
    assert.ok(src.includes('const historyClanIds = [originClanId, holderClanId];'));
    assert.ok(src.includes("clanIds: historyClanIds, category: 'family', inferCurrentTurn: false"));
    assert.ok(src.includes("clanIds: [record.originClanId, record.captorClanId], category: 'diplomacy', inferCurrentTurn: false"));
});


test('通常の別家移籍は旧派閥を破棄し妻所属と外交婚姻を同期する', () => {
    const src = read('js/affiliation_system.js');
    const transferAt = src.indexOf('transferClanRaw(busho, newClanId');
    assert.ok(transferAt >= 0);
    const transfer = src.slice(transferAt, transferAt + 900);
    assert.ok(transfer.includes('this.resetFactionData(busho);'));
    assert.ok(transfer.includes('this.setClanIdRaw(busho, nextClanId);'));
    assert.ok(transfer.includes('this.syncSpousesForClanChange(busho, oldClanId, nextClanId'));

    const spouseAt = src.indexOf('\n    syncSpousesForClanChange(busho, oldClanId, newClanId');
    const spouse = src.slice(spouseAt, spouseAt + 2600);
    assert.ok(spouse.includes('wife.currentClanId = newId;'));
    assert.ok(spouse.includes('touchedPairs.forEach(([a, b]) => this.game.diplomacyManager.refreshMarriageRelation(a, b));'));
    assert.ok(spouse.includes('oldClan.princessIds = oldClan.princessIds.filter'));
    assert.ok(spouse.includes('newClan.princessIds.push'));

    const joinAt = src.indexOf('joinClan(busho, newClanId');
    const join = src.slice(joinAt, joinAt + 3200);
    assert.ok(join.includes('this.syncSpousesForClanChange(busho, oldClanId, newClanId'));
    assert.ok(join.includes('refreshDiplomacy: busho.isHostage !== true'));
});

test('臣従・吸収は武将の派閥婚姻同期と未婚姫移籍を共通窓口へ委譲する', () => {
    const common = read('js/event/common_events.js');
    assert.ok(common.includes('game.affiliationSystem.transferClanRaw(b, dominantClanId, { syncSpouses: true });'));
    assert.ok(common.includes('game.affiliationSystem.transferUnmarriedPrincesses(subordinateClanId, dominantClanId);'));

    const diplomacy = read('js/diplomacy.js');
    const vassalAt = diplomacy.indexOf('async executeVassalage');
    const vassal = diplomacy.slice(vassalAt, vassalAt + 3000);
    assert.ok(vassal.includes('this.game.affiliationSystem.transferClanRaw(b, targetClanId, { syncSpouses: true });'));
    assert.ok(vassal.includes('this.game.affiliationSystem.transferUnmarriedPrincesses(myClanId, targetClanId);'));

    const historical = read('js/event/historical_event.js');
    const absorbAt = historical.indexOf('absorbClan: function');
    const absorb = historical.slice(absorbAt, absorbAt + 2600);
    assert.ok(absorb.includes('game.affiliationSystem.transferClanRaw(b, dominantClanId, { syncSpouses: true });'));
    assert.ok(absorb.includes('game.affiliationSystem.transferUnmarriedPrincesses(subordinateClanId, dominantClanId);'));
});

test('独立・寝返りは旧派閥を破棄するが婚姻は専用外交再編へ残す', () => {
    const src = read('js/independence_system.js');
    assert.ok(src.includes('this.game.affiliationSystem.transferClanRaw(castellan, newClanId);'));
    assert.ok(src.includes('this.game.affiliationSystem.transferClanRaw(rebellionLeader, newClanId);'));
    assert.ok(src.includes('this.game.affiliationSystem.transferClanRaw(busho, newClanId);'));
    assert.ok(!src.includes('transferClanRaw(castellan, newClanId, { syncSpouses: true })'));
    assert.ok(src.includes('reorganizeRelationsAfterRebellion(oldClanId, newClanId)'));
});

test('life系の改名・姫死亡・婚姻解消履歴は関係勢力IDを明示する', () => {
    const src = read('js/life_system.js');
    assert.ok(src.includes("this.game.ui.log(msg, { clanIds: Number(b.clan) > 0 ? [Number(b.clan)] : [], category: 'family', inferCurrentTurn: false });"));
    assert.ok(src.includes("this.game.ui.log(clanMsg, { clanIds: Number(b.clan) > 0 ? [Number(b.clan)] : [], category: 'family', inferCurrentTurn: false });"));
    assert.ok(src.includes("this.game.ui.log(breakMsg, { clanIds: [clanA, clanB], category: 'family', inferCurrentTurn: false });"));
    assert.ok(src.includes("category: 'death', inferCurrentTurn: false"));
});


test('城主引抜は旧派閥IDで追随判定しつつ本人の派閥婚姻を新家へ同期する', () => {
    const src = read('js/strategy_system.js');
    const at = src.indexOf('const targetOriginalFactionId = Number(target.factionId) || 0;');
    assert.ok(at >= 0);
    const block = src.slice(at, at + 1100);
    assert.ok(block.includes('this.game.affiliationSystem.transferClanRaw(target, newClanId, { syncSpouses: true });'));
    assert.ok(block.includes('oldCastle, target, targetLord, newClanId, oldClanId, targetOriginalFactionId'));
    assert.ok(!block.includes('setClanIdRaw(target, newClanId)'));
});


test('派閥の固定バランス値は GameConfig.Faction を正本にする', () => {
    const ctx = createContext();
    loadScript(ctx, 'js/config.js');
    assert.strictEqual(ctx.WarParams.Faction.RoninChanceMultiplier, 0.5);
    assert.strictEqual(ctx.WarParams.Faction.BattleHistoryOverlapBonus, 2);
    assert.strictEqual(ctx.WarParams.Faction.JoinThreshold, 35);

    const faction = read('js/faction_system.js');
    assert.ok(faction.includes('F.RoninChanceMultiplier'));
    assert.ok(faction.includes('F.BattleHistoryOverlapBonus'));
    assert.ok(faction.includes('F.JoinThreshold'));
    assert.ok(!faction.includes('const roninMultiplier = 0.5'));
    assert.ok(!faction.includes('const battleBonus = 2'));
    assert.ok(!faction.includes('const joinThreshold = 35'));
});

test('武将詳細タブは遅延bindせず現在のタブDOMへ直接結び付ける', () => {
    const source = read('js/ui_info_busho.js');
    assert.ok(source.includes("tabsEl.querySelector('#busho-detail-tab-status')"));
    assert.ok(source.includes("tabsEl.querySelector('#busho-detail-tab-aptitude')"));
    assert.ok(source.includes("tabsEl.querySelector('#busho-detail-tab-biography')"));
    assert.ok(!/busho-detail-tab-status[\s\S]{0,1200}setTimeout\s*\(/.test(source));
});

test('武将詳細の列伝タブは空欄・全角換算10文字以下を表示対象外にする', () => {
    function UIInfoManager() {}
    const ctx = createContext({ UIInfoManager });
    loadScript(ctx, 'js/ui_info_busho.js');
    const info = new UIInfoManager();
    assert.strictEqual(info._hasDisplayableBushoBiography({ biography: '' }), false);
    assert.strictEqual(info._hasDisplayableBushoBiography({ biography: '田村家臣。' }), false);
    assert.strictEqual(info._hasDisplayableBushoBiography({ biography: '阿波国衆。白地城主。' }), false);
    assert.strictEqual(info._hasDisplayableBushoBiography({ biography: 'あ'.repeat(10) }), false);
    assert.strictEqual(info._hasDisplayableBushoBiography({ biography: 'あ'.repeat(11) }), true);
    assert.strictEqual(info._hasDisplayableBushoBiography({ biography: '12345678901234567890' }), false);
    assert.strictEqual(info._hasDisplayableBushoBiography({ biography: '123456789012345678901' }), true);
    assert.strictEqual(info._hasDisplayableBushoBiography({ biography: 'あああああ　あああああ\n' }), false);
});

test('武将詳細の列伝は条件付きタブ・スマホ短縮名・基本タブ同高の表示枠を使う', () => {
    const source = read('js/ui_info_busho.js');
    const css = read('css/style.css');
    assert.ok(source.includes("isPc ? '列伝' : '伝'"));
    assert.ok(source.includes("this.bushoDetailCurrentTab === 'biography' && hasBiography"));
    assert.ok(source.includes('busho-detail-biography-placeholder'));
    assert.ok(source.includes('biographyEl.textContent = biographyText'));
    assert.ok(css.includes('.busho-detail-biography-placeholder'));
    assert.ok(css.includes('visibility: hidden;'));
    assert.ok(css.includes('.busho-detail-biography-panel'));
    assert.ok(css.includes('overflow-y: auto;'));
});


test('UIInfoManager は保持済み game/ui を使い window.GameApp へ戻らない', () => {
    for (const file of ['js/ui_info.js', 'js/ui_info_busho.js', 'js/ui_info_kyoten.js']) {
        assert.ok(!read(file).includes('window.GameApp'), `${file} に window.GameApp 参照を残さない`);
    }
});

test('同派閥の月初恩恵は城への同居者ではなく対象大名家所属者だけへ適用する', () => {
    const source = read('js/faction_system.js');
    const at = source.indexOf('applyStartMonthSameFactionEffects()');
    const block = source.slice(at, at + 1700);
    assert.ok(block.includes('Number(busho.clan) !== Number(clan.id)'));
});


test('外交技能補正は calcDiplomacyProbBonus を唯一の現行APIとして使う', () => {
    const diplomacy = read('js/diplomacy.js');
    const skill = read('js/skill_manager.js');
    assert.ok(diplomacy.includes("SkillManager.calcDiplomacyProbBonus('goodwill', doer, this.game)"));
    assert.ok(!diplomacy.includes('calcGoodwillProbBonus'));
    assert.ok(!skill.includes('static calcGoodwillProbBonus'));
});


test('諸勢力鎮圧は WarPreparationController を唯一の戦争開始窓口にする', () => {
    const source = read('js/kunishu_system.js');
    const at = source.indexOf('async executeKunishuSubjugate');
    const block = source.slice(at, at + 4200);
    assert.ok(block.includes('this.game.warPreparationController.checkReinforcementAndStartWar('));
    assert.ok(!block.includes('this.game.warManager.startWar(atkCastle, dummyDefender'));
    assert.ok(!block.includes('const dummyDefender ='));
});


test('城の軍団番号は Legion.id ではなく clanId + legionNo で解決する', () => {
    const war = read('js/war.js');
    assert.ok(war.includes('Number(l.clanId) === Number(activeCastle.ownerClan)'));
    assert.ok(war.includes('Number(l.legionNo) === Number(activeCastle.legionId)'));

    const effort = read('js/war_effort.js');
    assert.ok(effort.includes('Number(l.clanId) === Number(targetCastle.ownerClan)'));
    assert.ok(effort.includes('Number(l.legionNo) === Number(targetCastle.legionId)'));
    assert.ok(!effort.includes('disbandLegion(targetCastle.legionId)'));
    assert.ok(effort.includes('Number(l.clanId) === oldOwner')); 
    assert.ok(effort.includes('Number(l.legionNo) === Number(c.legionId)'));

    const life = read('js/life_system.js');
    assert.ok(life.includes('Number(this.game.getCastle(b.castleId)?.legionId || 0) === Number(legion.legionNo)'));
});

test('大名退避先の軍団解散は別家の同番号 Legion.id を誤って解散しない', () => {
    const effort = read('js/war_effort.js');
    const at = effort.indexOf('handleDaimyoEscape(');
    const block = effort.slice(at, at + 2200);
    assert.ok(/const targetLegion = this\.game\.legions[\s\S]{0,120}\.find\(l =>/.test(block));
    assert.ok(block.includes('this.game.castleManager.disbandLegion(targetLegion.id)'));
    assert.ok(!block.includes('disbandLegion(targetCastle.legionId)'));
});

test('国主就任は軍師兼任を残さず、軍師選択UIも国主を候補に出さない', () => {
    const command = read('js/command_system.js');
    const gunshiAt = command.indexOf("actionType === 'appoint_gunshi'");
    const gunshiBlock = command.slice(gunshiAt, gunshiAt + 1800);
    assert.ok(gunshiBlock.includes('!b.isCommander'));

    const leaderAt = command.indexOf('executeAppointLegionLeader(bushoId');
    const leaderBlock = command.slice(leaderAt, leaderAt + 3600);
    assert.ok(leaderBlock.includes('if (busho.isGunshi) this.game.affiliationSystem.clearGunshiRole(busho);'));

    const life = read('js/life_system.js');
    const deathAt = life.indexOf('async handleCommanderDeath');
    const deathBlock = life.slice(deathAt, deathAt + 7200);
    assert.ok(deathBlock.includes('if (successor.isGunshi) this.game.affiliationSystem.clearGunshiRole(successor);'));
});


test('プレイヤー軍団新設は Legion 正規モデルを使い発足月を必ず保持する', () => {
    const command = read('js/command_system.js');
    const at = command.indexOf('executeAppointLegionLeader(bushoId');
    const block = command.slice(at, at + 3300);
    assert.ok(block.includes('legion = new Legion(legionData);'));
    assert.ok(block.includes('establishedTurnId: this.game.getCurrentTurnId()'));
    assert.ok(block.includes('legion.establishedTurnId = this.game.getCurrentTurnId();'));
    assert.ok(!block.includes('window.Legion'));

    const staffing = read('js/ai_staffing.js');
    assert.ok(staffing.includes('const newLegion = new Legion({'));
    assert.ok(!staffing.includes("typeof Legion !== 'undefined' ? new Legion"));
});

test('コマンド候補ソートは DomesticRules と StrategySystem の現行APIへ直接委譲する', () => {
    const command = read('js/command_system.js');
    for (const api of [
        'DomesticRules.calcDevelopment(target, 1.0)',
        'DomesticRules.calcRepair(target, 1.0)',
        'DomesticRules.calcCharity(target, 1.0)',
        'DomesticRules.calcTraining(target, cCastle.soldiers || 1, 1.0)',
        'DomesticRules.calcSoldierCharity(target, cCastle.soldiers || 1, 1.0)',
        'DomesticRules.calcDraftEfficiency(target, cCastle.peoplesLoyalty, cCastle.population)',
        'StrategySystem.calcSabotageScore(target)',
        'StrategySystem.calcInciteScore(target)',
        'StrategySystem.calcRumorScore(target)',
        'StrategySystem.calcHeadhuntScore(target)',
        'StrategySystem.calcAssassinateScore(target)',
        'StrategySystem.calcKukoScore(target)'
    ]) assert.ok(command.includes(api));
    assert.ok(!command.includes('typeof DomesticRules.calc'));
    assert.ok(!command.includes('typeof StrategySystem.calc'));
});

test('外部一門の当主・国主継承は通常所属移籍窓口で妻婚姻まで復帰する', () => {
    const life = read('js/life_system.js');
    assert.ok(life.includes('this.game.affiliationSystem.transferClanRaw(successor, commander.clan, { syncSpouses: true });'));
    assert.ok(life.includes('this.game.affiliationSystem.transferClanRaw(successor, oldDaimyo.clan, { syncSpouses: true });'));
    assert.ok(!life.includes('this.game.affiliationSystem.setClanIdRaw(successor, commander.clan);'));
    assert.ok(!life.includes('this.game.affiliationSystem.setClanIdRaw(successor, oldDaimyo.clan);'));
});


test('荒木村重の池田家乗っ取りは国主時も Legion の席次で発生条件を判定する', () => {
    const historical = read('js/event/historical_event.js');
    const at = historical.indexOf('id: "historical_araki_takeover"');
    const block = historical.slice(at, at + 5600);
    assert.ok(block.includes('Number(l.commanderId) === Number(tomomasa.id)'));
    assert.ok(block.includes('tomomasaLegionNo = Number(tomomasaLegion.legionNo) || 0'));
    assert.ok(block.includes('Number(itamiCastle.legionId) === tomomasaLegionNo'));
    assert.ok(block.includes('Number(murashigeCastle.legionId) !== tomomasaLegionNo'));
    assert.ok(!block.includes('tomomasa.legionId'));
    assert.ok(!block.includes('murashige.legionId'));
});


test('現行の隣接・海路判定は MapGraphService を正本にし片方向fallbackへ戻らない', () => {
    const files = [
        'js/event/historical_event.js', 'js/strategy_system.js', 'js/diplomacy.js',
        'js/interview_system.js', 'js/ai.js', 'js/war_effort.js'
    ];
    for (const file of files) {
        const source = read(file);
        assert.ok(!source.includes('typeof MapGraphService'), `${file} に MapGraphService 存在確認fallbackを残さない`);
    }
    const strategy = read('js/strategy_system.js');
    assert.ok(strategy.includes('MapGraphService.isAdjacent(ca, cb)'));
    const diplomacy = read('js/diplomacy.js');
    assert.ok(diplomacy.includes('MapGraphService.isAdjacent(sc, dc)'));
    assert.ok(diplomacy.includes('MapGraphService.isAdjacent(c, dc)'));
    const interview = read('js/interview_system.js');
    assert.ok(interview.includes('this.game.mapGraph.getAdjacentIds(row.castle)'));
});

test('出陣・降伏勧告・従属・臣従のコマンド可否もMapGraphServiceを隣接正本にする', () => {
    const command = read('js/command_system.js');
    const catalog = read('js/command_catalog.js');
    const enemyStart = command.indexOf("case 'enemy_valid':");
    const enemyEnd = command.indexOf("case 'enemy_all':", enemyStart);
    const diplomacyStart = command.indexOf("if (type === 'dominate' || type === 'subordinate' || type === 'vassalage')");
    const diplomacyEnd = command.indexOf("if (type === 'vassalage')", diplomacyStart + 10);
    const vassalageStart = catalog.indexOf('canVassalage: (game) =>');
    const vassalageEnd = catalog.indexOf('// --- 情報用 ---', vassalageStart);
    assert.ok(command.slice(enemyStart, enemyEnd).includes('MapGraphService.isAdjacent'));
    assert.ok(command.slice(diplomacyStart, diplomacyEnd).includes('MapGraphService.isAdjacent'));
    assert.ok(catalog.slice(vassalageStart, vassalageEnd).includes('MapGraphService.isAdjacent'));
});

test('軍師・国主任命コマンドは実際に選べる候補がいる時だけ有効になる', () => {
    const catalog = read('js/command_catalog.js');
    const gunshiAt = catalog.indexOf('hasActiveBushoExceptDaimyoAndCastellan');
    const gunshiRule = catalog.slice(gunshiAt, gunshiAt + 450);
    assert.ok(gunshiRule.includes('!b.isCommander'));
    assert.ok(gunshiRule.includes('!b.isCastellan'));

    const legionAt = catalog.indexOf('canManageLegion:');
    const legionRule = catalog.slice(legionAt, legionAt + 1100);
    assert.ok(legionRule.includes('const hasCandidate = game.getClanBushos(game.playerClanId).some'));
    assert.ok(legionRule.includes('!b.isDaimyo'));
    assert.ok(legionRule.includes('!b.isCommander'));
    assert.ok(legionRule.includes('return hasCandidate && legionNumber <= myCastles.length;'));
});


test('軍団割当は同じ武将を同一家の複数軍団長へ重複登録しない', () => {
    const staffing = read('js/ai_staffing.js');
    const at = staffing.indexOf('assignNewLegion(clanId, commanderId)');
    const block = staffing.slice(at, at + 2100);
    assert.ok(block.includes('const currentLegion = clanLegions.find'));
    assert.ok(block.includes('if (currentLegion) return Number(currentLegion.legionNo) || -1;'));
    assert.ok(block.includes('emptyLegion.commanderId = numericCommanderId;'));
    assert.ok(block.includes('commanderId: numericCommanderId'));
});


test('将軍家新設は候補の旧軍団・派閥と妻婚姻を通常所属移籍窓口で同期する', () => {
    const historical = read('js/event/historical_event.js');
    const at = historical.indexOf('id: "historical_shogun_coronation"');
    const block = historical.slice(at, at + 6800);
    assert.ok(block.includes('game.affiliationSystem.transferClanRaw(candidate, newClanId, { syncSpouses: true });'));
    assert.ok(!block.includes('game.affiliationSystem.setClanIdRaw(candidate, newClanId);'));
    assert.ok(!block.includes('game.affiliationSystem.resetFactionData(candidate);'));
});


test('歴史イベントの国主・大名任命も軍師との役職排他を守る', () => {
    const historical = read('js/event/historical_event.js');

    const arakiAt = historical.indexOf('id: "historical_araki_takeover"');
    const arakiBlock = historical.slice(arakiAt, arakiAt + 6200);
    assert.ok(arakiBlock.includes('if (murashige.isGunshi) game.affiliationSystem.clearGunshiRole(murashige);'));
    assert.ok(arakiBlock.includes('murashige.isCommander = true;'));

    const exileAt = historical.indexOf('id: "historical_yoshitsugu_exile"');
    const exileBlock = historical.slice(exileAt, exileAt + 5000);
    assert.ok(exileBlock.includes('if (nagayasu.isCommander && game.castleManager && game.legions)'));
    assert.ok(exileBlock.includes('game.castleManager.disbandLegion(oldLegion.id);'));
    assert.ok(exileBlock.includes('nagayasu.isCommander = false;'));
    assert.ok(exileBlock.includes('game.affiliationSystem.clearGunshiRole(nagayasu);'));
});


test('国主フラグは Legion を正本としてセーブ復元時に再構築する', () => {
    const save = read('js/save_manager.js');
    assert.ok(save.includes("key === 'isCommander'"));
    assert.ok(save.includes('this.game.bushos.forEach(busho => { busho.isCommander = false; });'));
    assert.ok(save.includes('if (commander) commander.isCommander = true;'));
    assert.ok(save.includes('const legionSeatKeys = new Set();'));
    assert.ok(save.includes('const legionCommanderIds = new Set();'));
});

test('荒木村重の軍団引継ぎは既存国主職を二重に残さない', () => {
    const historical = read('js/event/historical_event.js');
    const at = historical.indexOf('id: "historical_araki_takeover"');
    const block = historical.slice(at, at + 6800);
    assert.ok(block.includes('const oldMurashigeLegion = game.legions.find'));
    assert.ok(block.includes('game.castleManager.disbandLegion(oldMurashigeLegion.id);'));
    assert.ok(block.includes('Number(oldMurashigeLegion.id) !== Number(legionToTakeover.id)'));
});


test('荒木村重降伏イベントの退避は国主フラグを先消しせず移動窓口へ軍団解散を任せる', () => {
    const historical = read('js/event/historical_event.js');
    const at = historical.indexOf('id: "historical_murashige_submission"');
    const block = historical.slice(at, at + 9000);
    const retreatAt = block.indexOf('IDの範囲外の人がいれば、お引越しさせます');
    const retreat = block.slice(retreatAt, retreatAt + 700);
    assert.ok(retreat.includes('window.EventAction.moveBusho(game, busho, nagayasu.castleId);'));
    assert.ok(!retreat.includes('busho.isCommander = false;'));
});


test('城内の大名・退避対象判定は同居者ではなく城主家所属者だけを見る', () => {
    const historical = read('js/event/historical_event.js');
    const murashigeAt = historical.indexOf('id: "historical_murashige_submission"');
    const murashigeBlock = historical.slice(murashigeAt, murashigeAt + 9000);
    assert.ok(murashigeBlock.includes('Number(b.clan) === Number(miyoshiClanId)'));
    assert.ok(murashigeBlock.includes('Number(b.belongKunishuId || 0) === 0'));

    const war = read('js/war_effort.js');
    assert.ok(war.includes('b.isDaimyo && Number(b.clan) === oldOwner && Number(b.belongKunishuId || 0) === 0'));

    const ui = read('js/ui_info_busho.js');
    assert.ok(ui.includes('b.isDaimyo && Number(b.clan) === Number(this.ui.currentCastle.ownerClan)'));
});


test('城割譲時の国主判定は従属家所属の通常武将だけを見る', () => {
    const diplomacy = read('js/diplomacy.js');
    const at = diplomacy.indexOf('applyCastleCessionData(castleId, subordinateClanId, dominantClanId)');
    const block = diplomacy.slice(at, at + 1800);
    assert.ok(block.includes('Number(b.clan) === Number(subordinateClanId)'));
    assert.ok(block.includes('Number(b.belongKunishuId || 0) === 0'));
});


test('将軍候補の二条城主就任は castle.castellanId を正本とする共通窓口を使う', () => {
    const historical = read('js/event/historical_event.js');
    const at = historical.indexOf('id: "historical_shogun_setup"');
    const block = historical.slice(at, at + 4200);
    assert.ok(block.includes('const nijo = game.getCastle(26);'));
    assert.ok(block.includes('window.EventAction.appointCastellan(game, candidate, nijo);'));
    assert.ok(!block.includes('game.bushos.find(b => b.castleId === 26 && b.isCastellan'));
});


test('落城・国主継承・大名継承の城主任命は城内全員ではなく castle.castellanId を正本にする', () => {
    const war = read('js/war_effort.js');
    const warAt = war.indexOf('finalizeCapturedCastleStaffing(state)');
    const warBlock = war.slice(warAt, warAt + 2200);
    assert.ok(warBlock.includes('const previousCastellan = this.game.getBusho(previousCapturedCastellanId);'));
    assert.ok(!warBlock.includes('this.game.getCastleBushos(s.defender.id).forEach(b => { b.isCastellan = false; })'));

    const life = read('js/life_system.js');
    const commanderAt = life.indexOf('async handleCommanderDeath');
    const commanderBlock = life.slice(commanderAt, commanderAt + 9000);
    assert.ok(commanderBlock.includes('const oldCastellan = this.game.getBusho(targetCastle.castellanId);'));

    const daimyoAt = life.indexOf('setupNewDaimyo(oldDaimyo');
    const daimyoBlock = life.slice(daimyoAt, daimyoAt + 9000);
    assert.ok(daimyoBlock.includes('const oldCastellan = this.game.getBusho(baseCastle.castellanId);'));
});


test('未登場武将が一門を頼る時は諸勢力ではなく通常の大名家所属者だけを候補にする', () => {
    const life = read('js/life_system.js');
    const at = life.indexOf('async checkBirth()');
    const block = life.slice(at, at + 10500);
    const clanChecks = block.match(/Number\(other\.clan\) > 0/g) || [];
    const kunishuChecks = block.match(/Number\(other\.belongKunishuId \|\| 0\) === 0/g) || [];
    assert.ok(clanChecks.length >= 2);
    assert.ok(kunishuChecks.length >= 2);
});




test('勢力滅亡時の撃破勢力は過去の失城履歴から推測せず最後の戦争結果を渡す', () => {
    const life = read('js/life_system.js');
    assert.ok(life.includes("async checkClanExtinction(clanId, reason = 'no_castle', killerClanId = 0)"));
    assert.ok(!life.includes('this.game.castles.find(c => c.lastAttackedOwnerId === clan.id'));
    assert.ok(life.includes("killerClanId = reason === 'no_castle' ? (Number(killerClanId) || 0) : 0;"));

    const war = read('js/war_effort.js');
    assert.ok(war.includes("checkClanExtinction(s.oldDefClanId, extReason1, extReason1 === 'no_castle' ? winnerClan : 0)"));
    assert.ok(war.includes("checkClanExtinction(this.state.oldDefClanId, extReason, extReason === 'no_castle' ? Number(this.state.attacker.ownerClan) || 0 : 0)"));
    assert.ok(war.includes("checkClanExtinction(oldOwner, 'no_castle', 0)"), '諸勢力蜂起は大名家の撃破者として扱わない');
});

test('AI人事の隣接判定は adjacentCastleIds 直読みではなく MapGraphService 共通窓口を使う', () => {
    const staffing = read('js/ai_staffing.js');
    assert.ok(staffing.includes('return this.game.mapGraph.getAdjacentCastles(castle);'));
    assert.ok(!staffing.includes('.adjacentCastleIds'), 'AIStaffing に片方向CSV直接参照を残さない');
});

test('AI軍団解散ログは disbandLegion が commanderId を消す前の国主名を保持する', () => {
    const legion = { id: 701, clanId: 1, legionNo: 1, commanderId: 101, establishedTurnId: 0 };
    const castles = [
        { id: 11, legionId: 1, adjacentCastleIds: [] },
        { id: 12, legionId: 1, adjacentCastleIds: [] }
    ];
    const commander = { id: 101, name: '国主太郎', clan: 1, status: 'active' };
    const logs = [];
    const testConsole = {
        log: (...args) => logs.push(args.join(' ')),
        warn: console.warn,
        error: console.error
    };
    const game = {
        legions: [legion],
        clans: [{ id: 1, name: 'テスト家' }],
        getCurrentTurnId: () => 30,
        getClanCastles: () => castles,
        getCastleBushos: castleId => castleId === 11 ? [commander] : [],
        getBusho: id => Number(id) === 101 ? commander : null,
        getClan(id) { return this.clans.find(c => Number(c.id) === Number(id)); },
        castleManager: {
            disbandLegion: () => { legion.commanderId = 0; }
        }
    };
    const ctx = createContext({
        game,
        console: testConsole,
        BushoStatusRules: { isActive: b => b && b.status === 'active' },
        DiplomacyRules: { isAllianceOrVassal: () => false }
    });
    loadScript(ctx, 'js/ai_staffing.js');
    const staffing = vm.runInContext('new AIStaffing(game)', ctx);
    assert.strictEqual(staffing.checkLegionDisband(1), true);
    assert.strictEqual(legion.commanderId, 0);
    assert.ok(logs.some(line => line.includes('国主太郎軍団')), logs.join('\n'));
    assert.ok(!logs.some(line => line.includes('不明な国主軍団')), logs.join('\n'));
});

test('吸収・臣従は軍団解散後に isCommander を手動で二重解除しない', () => {
    const historical = read('js/event/historical_event.js');
    const common = read('js/event/common_events.js');
    const diplomacy = read('js/diplomacy.js');

    const absorbStart = historical.indexOf('absorbClan: function');
    const absorbEnd = historical.indexOf('// ==========================================', absorbStart);
    const absorb = historical.slice(absorbStart, absorbEnd);
    assert.ok(absorb.includes('disbandLegion(l.id)'));
    assert.ok(!/b\.isCommander\s*=\s*false/.test(absorb));

    const arakiStart = historical.indexOf('id: "historical_murashige_submission"');
    const arakiEnd = historical.indexOf('// ==========================================', arakiStart + 10);
    const araki = historical.slice(arakiStart, arakiEnd);
    assert.ok(araki.includes('game.affiliationSystem.joinClan(busho, sponsorClanId, busho.castleId, 100);'));
    assert.ok(!araki.includes('game.castleManager.disbandLegion(legionToDismiss.id);'));

    const commonStart = common.indexOf('const processSubordination =');
    const commonBlock = common.slice(commonStart, commonStart + 2600);
    assert.ok(commonBlock.includes('game.castleManager.disbandLegion(l.id)'));
    assert.ok(!/b\.isCommander\s*=\s*false/.test(commonBlock));

    const dipStart = diplomacy.indexOf('// 1. プレイヤー側の軍団をすべて解散させます');
    const dipBlock = diplomacy.slice(dipStart, dipStart + 2300);
    assert.ok(dipBlock.includes('this.game.castleManager.disbandLegion(l.id)'));
    assert.ok(!/b\.isCommander\s*=\s*false/.test(dipBlock));
});

test('お市の婚姻イベントは元の実家ではなく現在所属を正本にする', () => {
    const historical = read('js/event/historical_event.js');
    const anchor = historical.indexOf('// 7. お市が未婚で、現在も織田家に所属していることを確認します。');
    assert.ok(anchor >= 0);
    const event = historical.slice(Math.max(0, anchor - 1800), anchor + 900);
    assert.ok(event.includes('Number(oichi.currentClanId) !== Number(nobunaga.clan)'));
    assert.ok(!event.includes('oichi.originalClanId === nobunaga.clan'));
});

test('姫一覧と詳細の所属表示は未婚でも currentClanId を正本にする', () => {
    const ui = read('js/ui_info.js');
    assert.ok(ui.includes('const clanA = this.game.getClan(a.currentClanId);'));
    assert.ok(ui.includes('const targetClanId = Number(p.currentClanId) || 0;'));
    assert.ok(ui.includes('const clanId = Number(princess.currentClanId) || 0;'));
    assert.ok(!ui.includes('(p.husbandId && p.husbandId !== 0) ? p.currentClanId : p.originalClanId'));
    assert.ok(!ui.includes('(princess.husbandId > 0) ? princess.currentClanId : princess.originalClanId'));
});



test('全画面戦闘は共通窓口で背景地図を休止しスマホでは compositor から外す', () => {
    const ui = read('js/ui.js');
    const field = read('js/field_war.js');
    assert.ok(ui.includes('suspendMainMapForBattle(owner = \'battle\')'));
    assert.ok(ui.includes("this._battleSuspendOwners = new Set()"));
    assert.ok(ui.includes("scroll.style.display = 'none'"));
    assert.ok(ui.includes("document.body.classList.add('battle-lightweight-mode')"));
    assert.ok(ui.includes("this.suspendMainMapForBattle('siege-war')"));
    assert.ok(ui.includes("this.resumeMainMapAfterBattle('siege-war')"));
    assert.ok(field.includes("this.game.ui.suspendMainMapForBattle('field-war')"));
    assert.ok(field.includes("this.game.ui.resumeMainMapAfterBattle('field-war')"));
});

test('野戦描画は部隊DOMと前回ハイライトをキャッシュし動的styleタグを再生成しない', () => {
    const field = read('js/field_war.js');
    const css = read('css/style.css');
    assert.ok(field.includes('this._fwUnitElementCache = new Map()'));
    assert.ok(field.includes('this._fwHighlightedHexes = new Set()'));
    assert.ok(field.includes("this._fwUnitElementCache.set(u.id"));
    assert.ok(field.includes("uEl.classList.toggle('is-sea-unit'"));
    assert.ok(field.includes("pEl.classList.toggle('is-sea-unit'"));
    assert.ok(!field.includes('style-fw-unit-el-'));
    assert.ok(!field.includes('pCustomStyle'));
    assert.ok(css.includes('.fw-unit.is-sea-unit .fw-unit-icon::before'));
});

test('野戦の非表示軍勢詳細は情報モード時だけ構築する', () => {
    const field = read('js/field_war.js');
    const start = field.indexOf('updateStatus() {');
    assert.ok(start >= 0);
    const block = field.slice(start, start + 1200);
    assert.ok(block.includes('this._updateFieldWarHeader();'));
    assert.ok(block.includes('if (!this.isInfoMode) return;'));
    const infoHandler = field.slice(field.indexOf('if (btnInfo) btnInfo.onclick'), field.indexOf('if (btnInfoBack)', field.indexOf('if (btnInfo) btnInfo.onclick')));
    assert.ok(infoHandler.includes('this.updateStatus();'));
});

test('攻城戦UIは同じ値の顔画像・能力HTML等を無条件再代入しない', () => {
    const ui = read('js/ui.js');
    const start = ui.indexOf('updateWarUI() {');
    const block = ui.slice(start, start + 15500);
    assert.ok(block.includes('if (el.textContent !== next) el.textContent = next;'));
    assert.ok(block.includes('if (el.innerHTML !== next) el.innerHTML = next;'));
    assert.ok(block.includes("if (el.getAttribute('src') !== src) el.setAttribute('src', src);"));
});

test('指南書の民忠低下は自領限定と誤記しない', () => {
    const guide = read('js/guide_data.js');
    assert.ok(guide.includes('また拠点では民忠が月ごとに少しずつ下がるため'));
    assert.ok(!guide.includes('自領の拠点では民忠が月ごとに少しずつ下がるため'));
});

test('第三者の忠誠・不満所見は高精度でも内心を断定しない', () => {
    const interview = read('js/interview_system.js');
    const start = interview.indexOf('_getTargetLoyaltyBandText(');
    const end = interview.indexOf('_getOtherAssessmentBias(', start);
    const block = interview.slice(start, end);
    assert.ok(block.includes('少々納得しかねるところがおありのようです'));
    assert.ok(!block.includes('少々納得しかねるところがおありです'));
    assert.ok(!block.includes('かなり不満を抱えております'));
    assert.ok(!block.includes('殿への気持ちはかなり離れております'));
    assert.ok(!block.includes('殿から心が離れております'));
    const architecture = read('ARCHITECTURE.md');
    assert.ok(architecture.includes('第三者の内心は、短縮のために断定形へ変えない'));
});



test('共通一覧は詳細遷移・終了時に仮想スクロールの参照と旧DOMを先に解放する', () => {
    const info = read('js/ui_info.js');
    const selector = read('js/selector_modal_view.js');
    const stopStart = info.indexOf('_stopActiveListRendering() {');
    const stopBlock = info.slice(stopStart, stopStart + 1000);
    assert.ok(stopStart >= 0);
    assert.ok(stopBlock.includes('this._currentListRenderId = (this._currentListRenderId || 0) + 1;'));
    assert.ok(stopBlock.includes("removeEventListener('scroll', listContainer._virtualScrollHandler)"));
    assert.ok(stopBlock.includes('listContainer._virtualScrollCleanup();'));
    const shellStart = info.indexOf('_openInfoShell(');
    const shellBlock = info.slice(shellStart, shellStart + 1100);
    assert.ok(shellBlock.includes('this._stopActiveListRendering();'));
    assert.ok(shellBlock.includes('this.selectorView.releaseListContent({ resetScroll: true });'));
    const releaseStart = selector.indexOf('releaseListContent(');
    const releaseBlock = selector.slice(releaseStart, releaseStart + 1800);
    assert.ok(releaseBlock.includes("listContainer.removeEventListener('scroll', listContainer._virtualScrollHandler)"));
    assert.ok(releaseBlock.includes("images[i].removeAttribute('src')"));
    assert.ok(releaseBlock.includes("listContainer.innerHTML = '';"));
    const closeStart = selector.indexOf('close() {');
    const closeBlock = selector.slice(closeStart, closeStart + 1000);
    assert.ok(closeBlock.includes('this.releaseListContent({ resetScroll: true });'));
});

test('共通一覧の行クリックは古いWebView非対応のProxyを使わない', () => {
    const info = read('js/ui_info.js');
    assert.ok(!info.includes('new Proxy('));
    assert.ok(info.includes('_createDelegatedListEvent(nativeEvent, currentTarget)'));
    assert.ok(info.includes('item.onClick(this._createDelegatedListEvent(e, targetItem));'));
});

test('仮想スクロール終了時は保留中のrequestAnimationFrameもcancelする', () => {
    const info = read('js/ui_info.js');
    const start = info.indexOf('let scrollRafId = null;');
    const block = info.slice(start, start + 5200);
    assert.ok(start >= 0);
    assert.ok(block.includes('let measureRafId = null;'));
    assert.ok(block.includes('cancelAnimationFrame(scrollRafId)'));
    assert.ok(block.includes('cancelAnimationFrame(measureRafId)'));
});

test('武将詳細へ入る前にDOM寄りキャッシュだけを解放し戻り用の軽い一覧条件は保持する', () => {
    const busho = read('js/ui_info_busho.js');
    const releaseStart = busho.indexOf('_releaseBushoSelectorTransientStateForDetail()');
    const detailEntry = busho.indexOf('showBushoDetailModal(busho)', releaseStart);
    const releaseBlock = busho.slice(releaseStart, detailEntry);
    assert.ok(releaseStart >= 0);
    assert.ok(releaseBlock.includes("this._invalidateListItemsCache('busho');"));
    assert.ok(releaseBlock.includes('this._bushoSelectorContext = null;'));
    assert.ok(!releaseBlock.includes('this.bushoSavedBushos = null;'));
    assert.ok(!releaseBlock.includes('this.bushoSavedSortedBushos = null;'));
    assert.ok(!releaseBlock.includes('this.bushoSavedData = null;'));
    const detailStart = busho.indexOf('_renderBushoDetail(busho, scrollPos = 0)');
    const detailBlock = busho.slice(detailStart, detailStart + 550);
    assert.ok(detailBlock.indexOf('this._releaseBushoSelectorTransientStateForDetail();') < detailBlock.indexOf("this._openInfoShell('武将情報'"));
});

test('列伝表示可否の文字数判定はString iteratorとcodePointAtを必須にしない', () => {
    const busho = read('js/ui_info_busho.js');
    const start = busho.indexOf('_getBushoBiographyFullWidthLength(text)');
    const end = busho.indexOf('_hasDisplayableBushoBiography', start);
    const block = busho.slice(start, end);
    assert.ok(block.includes('value.charCodeAt(i)'));
    assert.ok(!block.includes('codePointAt'));
    assert.ok(!block.includes('for (const ch of value)'));
});

test('武将一覧はGameManagerの既存ID索引を再利用して再描画ごとの大規模Map複製を行わない', () => {
    const busho = read('js/ui_info_busho.js');
    const start = busho.indexOf('_renderBushoSelector(');
    const end = busho.indexOf('this._updateBushoSelectorUI();', start);
    const block = busho.slice(start, end);
    assert.ok(block.includes('const getClanById = (id) => this.game.getClan(id);'));
    assert.ok(block.includes('const getCastleById = (id) => this.game.getCastle(id);'));
    assert.ok(block.includes('const getBushoById = (id) => this.game.getBusho(id);'));
    assert.ok(!block.includes('const clanMap = new Map()'));
    assert.ok(!block.includes('const castleMap = new Map()'));
    assert.ok(!block.includes('const bushoMap = new Map()'));
    assert.ok(block.includes('skipTextFit: true'));
    assert.ok(block.includes("const lazyRowCacheLimit = document.body.classList.contains('is-pc') ? 240 : 96;"));
});

test('スマホ仮想スクロールは表示外DOMを抑えつつ数pxごとの全行再生成を避ける', () => {
    const info = read('js/ui_info.js');
    const start = info.indexOf('const isMobile = !document.body.classList.contains');
    const block = info.slice(start, start + 5200);
    assert.ok(block.includes('const BUFFER_ROWS = isMobile ? 10 : 15;'));
    assert.ok(block.includes('const WINDOW_STEP_ROWS = isMobile ? 4 : 2;'));
    assert.ok(block.includes('Math.floor(rawStartIndex / WINDOW_STEP_ROWS) * WINDOW_STEP_ROWS'));
});


test('国データもGameManager共通索引を使いUIから毎回findしない', () => {
    const game = read('js/game.js');
    assert.ok(game.includes('getProvince(id)'));
    assert.ok(game.includes('this._provinceMap = new Map()'));
    const ui = read('js/ui.js');
    const at = ui.indexOf('    updateInfoPanel(castle) {');
    assert.ok(at >= 0);
    const block = ui.slice(at, at + 9000);
    assert.ok(block.includes('this.game.getProvince(castle.provinceId)'));
    assert.ok(!block.includes('this.game.provinces.find'));
});

test('拠点情報は全武将走査をせずsamuraiIds正本から在城者を一度だけ分類する', () => {
    const ui = read('js/ui.js');
    const at = ui.indexOf('updateInfoPanel(castle)');
    const block = ui.slice(at, at + 9000);
    assert.ok(block.includes('const castleBushos = this.game.getCastleBushos(castle.id);'));
    assert.ok(!block.includes('this.game.bushos.filter'));

    const kyoten = read('js/ui_info_kyoten.js');
    const detailAt = kyoten.indexOf('_renderCastleDetail(castleId, scrollPos = 0)');
    const detailBlock = kyoten.slice(detailAt, detailAt + 7000);
    assert.ok(detailBlock.includes('const castleBushos = this.game.getCastleBushos(castle.id);'));
    assert.ok(!detailBlock.includes('this.game.bushos.filter'));
});

test('拠点一覧は既存ID索引を再利用し人数俸禄集計をタブ切替ごとに作り直さない', () => {
    const kyoten = read('js/ui_info_kyoten.js');
    const at = kyoten.indexOf('_renderKyotenList(clanId, isSelectMode = false');
    const block = kyoten.slice(at, at + 15000);
    assert.ok(block.includes('this.kyotenCastleBushoStatsMap'));
    assert.ok(block.includes('this.game.getClan('));
    assert.ok(block.includes('this.game.getBusho('));
    assert.ok(block.includes('this.game.getProvince('));
    assert.ok(!block.includes('const clanMap = new Map()'));
    assert.ok(!block.includes('const bushoMap = new Map()'));
    assert.ok(!block.includes('const provinceMap = new Map()'));
    const opener = kyoten.slice(kyoten.indexOf('showKyotenList('), kyoten.indexOf('_renderKyotenList('));
    assert.ok(opener.includes('this.kyotenCastleBushoStatsMap = null;'));
    const selectAt = kyoten.indexOf('showAppointLegionCastleSelector(');
    const selectBlock = kyoten.slice(selectAt, selectAt + 800);
    assert.ok(selectBlock.includes('this.kyotenCastleBushoStatsMap = null;'));
});

test('勢力一覧は勢力ごとの全武将filterをやめ一度のグループ化と所有城索引を使う', () => {
    const info = read('js/ui_info.js');
    const at = info.indexOf('_renderDaimyoList(isSelectMode = false');
    const block = info.slice(at, at + 7000);
    assert.ok(block.includes('const activeBushosByClan = new Map();'));
    assert.ok(block.includes('this.game.getClanCastles(c.id).length > 0'));
    assert.ok(block.includes('activeBushosByClan.get(Number(clan.id)) || []'));
    assert.ok(!block.includes('this.game.bushos.filter(b => b.clan === clan.id'));
    assert.ok(!block.includes('this.game.castles.filter(c => c.ownerClan === clan.id)'));
});

test('端末別情報パネルは非表示側へ同じ情報DOMを複製しない', () => {
    const ui = read('js/ui.js');
    const at = ui.indexOf('updateInfoPanel(castle)');
    const block = ui.slice(at, at + 15000);
    assert.ok(block.includes('if (!isPc && this.mobileTopLeft)'));
    assert.ok(block.includes('if (isPc) this.pcNewStatusPanel.innerHTML = content;'));
    assert.ok(!block.includes('if (this.statusContainer && isPc)'));
});

test('諸勢力のID・拠点検索は専門System内の索引を共用し壊滅判定だけ局所化する', () => {
    const src = read('js/kunishu_system.js');
    const ensureAt = src.indexOf('_ensureKunishuIndexes()');
    const ensureBlock = src.slice(ensureAt, ensureAt + 1800);
    assert.ok(ensureBlock.includes('const byId = new Map();'));
    assert.ok(ensureBlock.includes('const byCastle = new Map();'));
    assert.ok(ensureBlock.includes('this._kunishuById = byId;'));
    assert.ok(ensureBlock.includes('this._kunishusByCastle = byCastle;'));

    const getAt = src.indexOf('getKunishu(id)');
    const getBlock = src.slice(getAt, getAt + 260);
    assert.ok(getBlock.includes('this._ensureKunishuIndexes();'));
    assert.ok(getBlock.includes('this._kunishuById.get(Number(id))'));
    assert.ok(!getBlock.includes('.find('));

    const castleAt = src.indexOf('getKunishusInCastle(castleId)');
    const castleBlock = src.slice(castleAt, castleAt + 420);
    assert.ok(castleBlock.includes('this._kunishusByCastle.get(Number(castleId)) || []'));
    assert.ok(castleBlock.includes('list.filter(k => !k.isDestroyed)'));
    assert.ok(!castleBlock.includes('getAliveKunishus().filter'));

    const setAt = src.indexOf('setKunishuData(kunishus)');
    const setBlock = src.slice(setAt, setAt + 360);
    assert.ok(setBlock.includes('this._kunishuIndexSource = null;'));
});


test('勢力別武将索引は所属versionだけで無効化し活動状態をキャッシュへ焼き込まない', () => {
    const game = read('js/game.js');
    const at = game.indexOf('getClanBushos(clanId)');
    const block = game.slice(at, at + 1700);
    assert.ok(at >= 0);
    assert.ok(block.includes('const version = this.bushoAffiliationVersion || 0;'));
    assert.ok(block.includes('this._clanBushosVersion !== version'));
    assert.ok(block.includes('const id = Number(busho.clan);'));
    assert.ok(block.includes('if (!Number.isFinite(id)) continue;'));
    assert.ok(!block.includes('BushoStatusRules'));
    assert.ok(!block.includes('LifeStatusRules'));
    const gunshiAt = game.indexOf('getClanGunshi(clanId)');
    const gunshiBlock = game.slice(gunshiAt, gunshiAt + 260);
    assert.ok(gunshiBlock.includes('this.getClanBushos(clanId).find'));
    assert.ok(gunshiBlock.includes('BushoStatusRules.isActive(b)'));
});

test('武将所属の実変更だけが勢力別武将索引versionを進める', () => {
    const affiliation = read('js/affiliation_system.js');
    const at = affiliation.indexOf('setClanIdRaw(busho, newClanId)');
    const block = affiliation.slice(at, at + 900);
    assert.ok(at >= 0);
    assert.ok(block.includes('if (oldClanId === nextClanId) return;'));
    assert.ok(block.includes('busho.clan = nextClanId;'));
    assert.ok(block.includes('this.game.bushoAffiliationVersion = (this.game.bushoAffiliationVersion || 0) + 1;'));
    assert.ok(block.indexOf('if (oldClanId === nextClanId) return;') < block.indexOf('bushoAffiliationVersion'));
});

test('勢力別武将索引の共有配列を呼び出し側から直接破壊しない', () => {
    const files = fs.readdirSync(path.join(ROOT, 'js'), { withFileTypes: true });
    const jsFiles = [];
    const walk = dir => {
        for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
            const full = path.join(dir, entry.name);
            if (entry.isDirectory()) walk(full);
            else if (entry.isFile() && entry.name.endsWith('.js')) jsFiles.push(full);
        }
    };
    walk(path.join(ROOT, 'js'));
    const destructive = /getClanBushos\([^)]*\)\s*\.\s*(?:sort|reverse|splice|push|pop|shift|unshift)\s*\(/;
    const offenders = jsFiles.filter(file => destructive.test(fs.readFileSync(file, 'utf8')));
    assert.deepStrictEqual(offenders, []);
});

test('高頻度の人事・コマンド・AI候補抽出は勢力別武将索引を共用する', () => {
    const game = read('js/game.js');
    assert.ok(game.slice(game.indexOf('getClanDaimyo(clanId)'), game.indexOf('getClanCastles(clanId)')).includes('this.getClanBushos(numericClanId).find'));
    const catalog = read('js/command_catalog.js');
    assert.ok(catalog.includes('game.getClanBushos(game.playerClanId)'));
    const command = read('js/command_system.js');
    assert.ok(command.includes('this.game.getClanBushos(this.game.playerClanId)'));
    const staffing = read('js/ai_staffing.js');
    assert.ok(staffing.includes('this.game.getClanBushos(clanId)'));
    const diplomacy = read('js/diplomacy.js');
    assert.ok(diplomacy.includes('this.game.getClanBushos(myClanId).slice()'));
});



test('国・地方の拠点探索は静的地理索引を共用し変動状態をキャッシュしない', () => {
    const game = read('js/game.js');
    const at = game.indexOf('_ensureTerritoryStaticIndexes()');
    const block = game.slice(at, at + 3600);
    assert.ok(at >= 0);
    assert.ok(block.includes('const provinceMap = new Map();'));
    assert.ok(block.includes('const regionCastleMap = new Map();'));
    assert.ok(block.includes('const regionProvinceMap = new Map();'));
    assert.ok(block.includes('const provinceId = Number(castle.provinceId);'));
    assert.ok(block.includes('if (!Number.isFinite(provinceId)) continue;'));
    assert.ok(block.includes('if (!provinceRegionMap.has(provinceId)) continue;'));
    assert.ok(!block.includes('ownerClan'));
    assert.ok(!block.includes('soldiers'));
    assert.ok(game.includes('getProvinceCastles(provinceId)'));
    assert.ok(game.includes('getRegionCastles(regionId)'));
    assert.ok(game.includes('getRegionProvinces(regionId)'));

    const operation = read('js/ai_operation.js');
    assert.ok(operation.includes('this.game.getRegionCastles('));
    assert.ok(operation.includes('this.game.getProvinceCastles('));
    assert.ok(operation.includes('this.game.getRegionProvinces('));
});

test('シナリオ・セーブ切替は旧検索索引とturnQueue参照を新データ展開前に解放する', () => {
    const game = read('js/game.js');
    const at = game.indexOf('releaseScenarioDataIndexes()');
    const block = game.slice(at, at + 2200);
    assert.ok(at >= 0);
    ['_bushoMap = null', '_castleMap = null', '_clanMap = null', '_provinceMap = null', '_princessMap = null',
     '_clanBushosMap = null', '_clanCastlesMap = null', '_provinceCastlesMap = null', '_regionCastlesMap = null']
        .forEach(text => assert.ok(block.includes(text), text));
    assert.ok(block.includes('this.mapGraph.invalidate();'), '隣接索引が旧拠点配列を保持し続けない');
    const releaseAt = game.indexOf('releaseScenarioMapResources()');
    const releaseBlock = game.slice(releaseAt, releaseAt + 700);
    assert.ok(releaseBlock.includes('this.releaseScenarioDataIndexes();'));
    assert.ok(releaseBlock.includes('this.ui.releaseScenarioTransientCaches();'));

    const save = read('js/save_manager.js');
    const restoreAt = save.indexOf('async _restoreSaveDataObj(d)');
    const replaceAt = save.indexOf('this.game.castles = d.castles.map', restoreAt);
    const beforeReplace = save.slice(restoreAt, replaceAt);
    assert.ok(beforeReplace.includes('this.game.releaseScenarioMapResources()'));
    assert.ok(beforeReplace.includes('this.game.turnQueue = [];'));
    assert.ok(beforeReplace.includes('this.game.currentIndex = 0;'));
});

test('姫のID参照はGameManager共通索引を使い婚姻UIから全姫findを繰り返さない', () => {
    const game = read('js/game.js');
    const at = game.indexOf('getPrincess(id)');
    const block = game.slice(at, at + 650);
    assert.ok(at >= 0);
    assert.ok(block.includes('this._princessMap = new Map();'));
    assert.ok(block.includes('return this._princessMap.get(Number(id));'));

    const catalog = read('js/command_catalog.js');
    assert.ok(catalog.includes('game.getPrincess(pId)'));
    const command = read('js/command_system.js');
    assert.ok(command.includes('this.game.getPrincess(firstId)'));
    const info = read('js/ui_info.js');
    assert.ok(info.includes('.map(id => this.game.getPrincess(id))'));
    const diplomacy = read('js/diplomacy.js');
    assert.ok(diplomacy.includes('const princess = this.game.getPrincess(princessId);'));
});

test('登用候補は全国武将走査ではなく自領拠点の在城者だけから抽出する', () => {
    const command = read('js/command_system.js');
    const at = command.indexOf("if (actionType === 'employ_target')");
    const block = command.slice(at, at + 1800);
    assert.ok(at >= 0);
    assert.ok(block.includes('this.game.getClanCastles(this.game.playerClanId)'));
    assert.ok(block.includes('this.game.getCastleBushos(ownedCastle.id)'));
    assert.ok(block.includes('BushoStatusRules.isRonin(b)'));
    assert.ok(!block.includes('this.game.bushos.filter'));
});


test('限定索引は旧全件走査と同じ候補集合・順序を返し未知IDを0へ混ぜない', () => {
    const ctx = createContext({ addEventListener() {} });
    vm.runInContext(`${read('js/game.js')}\nwindow.__GameManager = GameManager;`, ctx, { filename: 'js/game.js' });
    const game = Object.create(ctx.__GameManager.prototype);
    game.castleOwnershipVersion = 0;
    game.bushoAffiliationVersion = 0;
    game.provinces = [
        { id: 0, regionId: 0, province: '仮国' },
        { id: 1, regionId: 10, province: '甲' },
        { id: 2, regionId: 10, province: '乙' },
        { id: 3, regionId: 20, province: '丙' },
        { id: 'bad', regionId: 0, province: '不正国' }
    ];
    game.castles = [
        { id: 1, ownerClan: 1, provinceId: 1 },
        { id: 2, ownerClan: '2', provinceId: 2 },
        { id: 3, ownerClan: 1, provinceId: 3 },
        { id: 4, ownerClan: 0, provinceId: 0 },
        { id: 5, ownerClan: 'bad', provinceId: 999 },
        { id: 6, ownerClan: 2, provinceId: 'bad' }
    ];
    game.bushos = [
        { id: 11, clan: 1 },
        { id: 12, clan: '2' },
        { id: 13, clan: 1 },
        { id: 14, clan: 0 },
        { id: 15, clan: 'bad' }
    ];

    const ids = arr => Array.from(arr, x => Number(x.id));
    const validNum = value => Number.isFinite(Number(value)) ? Number(value) : null;

    for (const clanId of [0, 1, 2, 99]) {
        const expectedBushos = game.bushos.filter(b => validNum(b.clan) === clanId);
        const expectedCastles = game.castles.filter(c => validNum(c.ownerClan) === clanId);
        assert.deepStrictEqual(ids(game.getClanBushos(clanId)), ids(expectedBushos), `clan bushos ${clanId}`);
        assert.deepStrictEqual(ids(game.getClanCastles(clanId)), ids(expectedCastles), `clan castles ${clanId}`);
    }
    assert.deepStrictEqual(ids(game.getClanBushos(0)), [14], '不正所属をclan 0へ混ぜない');
    assert.deepStrictEqual(ids(game.getClanCastles(0)), [4], '不正ownerClanを0へ混ぜない');

    for (const provinceId of [0, 1, 2, 3, 999]) {
        const expected = game.castles.filter(c => validNum(c.provinceId) === provinceId);
        assert.deepStrictEqual(ids(game.getProvinceCastles(provinceId)), ids(expected), `province castles ${provinceId}`);
    }
    for (const regionId of [0, 10, 20, 99]) {
        const expectedProvinces = game.provinces.filter(p => validNum(p.regionId) === regionId && validNum(p.id) !== null);
        const expectedCastles = game.castles.filter(c => {
            const pid = validNum(c.provinceId);
            if (pid === null) return false;
            const prov = game.provinces.find(p => validNum(p.id) === pid && validNum(p.id) !== null);
            return !!prov && validNum(prov.regionId) === regionId;
        });
        assert.deepStrictEqual(ids(game.getRegionProvinces(regionId)), ids(expectedProvinces), `region provinces ${regionId}`);
        assert.deepStrictEqual(ids(game.getRegionCastles(regionId)), ids(expectedCastles), `region castles ${regionId}`);
    }
    assert.deepStrictEqual(ids(game.getRegionCastles(0)), [4], '未知provinceIdの城をregion 0へ混ぜない');
    assert.deepStrictEqual(ids(game.getRegionCastles(undefined)), [], '未指定地方を0扱いしない');

    // 配列への追加はversion更新がなくてもサイズ差で再構築し、候補漏れを起こさない。
    game.castles.push({ id: 7, ownerClan: 1, provinceId: 1 });
    assert.deepStrictEqual(ids(game.getClanCastles(1)), [1, 3, 7]);
    assert.deepStrictEqual(ids(game.getProvinceCastles(1)), [1, 7]);

    // 所有・所属変更は各versionで再構築し、旧候補を残さない。
    game.castles[0].ownerClan = 2;
    game.castleOwnershipVersion++;
    assert.deepStrictEqual(ids(game.getClanCastles(1)), [3, 7]);
    assert.deepStrictEqual(ids(game.getClanCastles(2)), [1, 2, 6]);
    game.bushos[0].clan = 2;
    game.bushoAffiliationVersion++;
    assert.deepStrictEqual(ids(game.getClanBushos(1)), [13]);
    assert.deepStrictEqual(ids(game.getClanBushos(2)), [11, 12]);
});

test('読み取り専用の勢力城探索だけをgetClanCastlesへ寄せ、所有変更中の処理は一括置換しない', () => {
    const diplomacy = read('js/diplomacy.js');
    const war = read('js/war.js');
    const ui = read('js/ui.js');
    const map = read('js/ui_map.js');
    const economy = read('js/economy_rules.js');
    const life = read('js/life_system.js');
    const castleManager = read('js/castle_manager.js');

    assert.ok(diplomacy.includes('const helperCastles = this.game.getClanCastles(helperForceId);'));
    assert.ok(diplomacy.includes('const reqCastles = this.game.getClanCastles(requestClanId);'));
    assert.ok(diplomacy.includes('const kinsmen = this.game.getClanBushos(requestClanId).filter'));
    assert.ok(war.includes('this.game.getClanCastles(s.defender.ownerClan).some'));
    assert.ok(ui.includes('this.game.getClanCastles(s.defender.ownerClan).some'));
    assert.ok(map.includes('this.game.getClanCastles(clanId).map(c => Number(c.id))'));
    assert.ok(economy.includes('game.getClanCastles(daimyo.clan).some'));
    assert.ok(economy.includes('const clanCastles = game.getClanCastles(castle.ownerClan);'));
    assert.ok(life.includes('const clanCastles = this.game.getClanCastles(p.originalClanId);'));
    const ai = read('js/ai.js');
    const command = read('js/command_system.js');
    assert.ok(ai.includes('[this.game.getCastle(26), this.game.getCastle(90)].filter'));
    assert.ok(command.includes('const targetCastles = candidateCastles || this.game.getClanCastles(this.game.playerClanId);'));
    assert.ok(command.includes('const numSelectedIds = new Set(selectedCastleIds.map'));
    assert.ok(command.includes('numSelectedIds.has(Number(realCastle.id))'));

    // CastleManagerは所有者を変更しながら残存城を判定する責務なので、機械的に全件索引へ置換しない。
    assert.ok(castleManager.includes('this.game.castles.filter(c => Number(c.ownerClan) === oldOwnerId'));
});


test('高頻度の候補探索は同値な所有集合を1回だけ共用し、旧条件を狭めすぎない', () => {
    const command = read('js/command_system.js');
    const start = command.indexOf('getValidTargets(type)');
    const end = command.indexOf('\n    //', start + 1);
    const block = command.slice(start, end > start ? end : start + 12000);
    assert.ok((block.match(/const playerClanCastles = this\.game\.getClanCastles\(playerClanId\);/g) || []).length >= 3);
    assert.ok(block.includes('return playerClanCastles.some(myCastle =>'));
    assert.ok(block.includes('return playerClanCastles.filter(target =>'));
    assert.ok(block.includes('const targetClanCastles = this.game.getClanCastles(target.ownerClan);'));
    assert.ok(!block.includes('const myCastles = this.game.castles.filter(myC => Number(myC.ownerClan) === playerClanId);'));

    const kyoten = read('js/ui_info_kyoten.js');
    const selectStart = kyoten.indexOf('// ★選択モード（国主任命）');
    const selectBlock = kyoten.slice(selectStart, selectStart + 1800);
    assert.ok(selectBlock.includes('const commanderCastleIds = new Set();'));
    assert.ok(selectBlock.includes('this.game.bushos.forEach(b =>'));
    assert.ok(selectBlock.includes('b.isCommander && b.clan === this.game.playerClanId'));
    assert.ok(!selectBlock.includes('getClanBushos(this.game.playerClanId)'));
});

test('AI内政の装備産地判定は行動ループ外で一度だけ計算し旧候補条件を維持する', () => {
    const ai = read('js/ai.js');
    const fnStart = ai.indexOf('async execInternalAffairs');
    const loopStart = ai.indexOf('for (let step = 0; step < maxActions; step++)', fnStart);
    assert.ok(fnStart >= 0 && loopStart > fnStart);
    const beforeLoop = ai.slice(fnStart, loopStart);
    const loopBlock = ai.slice(loopStart, ai.indexOf('\n    }\n', loopStart) + 7);

    assert.ok(beforeLoop.includes('const clanCastlesForEquipment = this.game.getClanCastles(castle.ownerClan);'));
    assert.ok(beforeLoop.includes('const hasGunCastleAI = clanCastlesForEquipment.some'));
    // 旧実装はownerClanの厳密一致で全国を見ていたため、その候補条件は狭めず1回だけ評価する。
    assert.ok(beforeLoop.includes('const hasHorseCastleAI = this.game.castles.some(c => {'));
    assert.ok(beforeLoop.includes('if (c.ownerClan !== castle.ownerClan) return false;'));
    assert.ok(!loopBlock.includes('const hasGunCastleAI ='));
    assert.ok(!loopBlock.includes('const hasHorseCastleAI ='));
});



test('姫生成の年次文脈集計は旧===条件・候補順を維持し文字列IDを数値IDへ混ぜない', () => {
    const ctx = createContext({
        BushoStatusRules: { isActive: b => b.status === 'active' }
    });
    loadScript(ctx, 'js/life_system.js');
    const LifeSystem = vm.runInContext('LifeSystem', ctx);
    const game = {
        princesses: [
            { id: 1, currentClanId: 1, status: 'unmarried' },
            { id: 2, currentClanId: '1', status: 'unmarried' },
            { id: 3, currentClanId: 1, status: 'married' }
        ],
        bushos: [
            { id: 10, clan: 1, status: 'active', female: false, childless: false, familyIds: [100] },
            { id: 11, clan: '1', status: 'active', female: false, childless: false, familyIds: [100] },
            { id: 12, clan: 1, status: 'active', female: false, childless: false, familyIds: [100, 200] },
            { id: 13, clan: 1, status: 'dead', female: false, childless: false, familyIds: [100] },
            { id: 14, clan: 1, status: 'active', female: true, childless: false, familyIds: [100] },
            { id: 15, clan: 1, status: 'active', female: false, childless: true, familyIds: [100] },
            { id: 16, clan: 1, status: 'active', female: false, childless: false, familyIds: [999] }
        ]
    };
    const life = new LifeSystem(game);
    const context = life._buildPrincessAppearanceContext();
    assert.strictEqual(context.unmarriedCountByClan.get(1), 1);
    assert.strictEqual(context.unmarriedCountByClan.get('1'), 1);
    assert.deepStrictEqual(Array.from(context.fatherCandidatesByClan.get(1), b => b.id), [10, 12, 16]);
    assert.deepStrictEqual(Array.from(context.fatherCandidatesByClan.get('1'), b => b.id), [11]);

    const clan = { id: 1 };
    const leader = game.bushos[0];
    const relatives = life._getPrincessFamilyFatherCandidates(clan, leader, context.fatherCandidatesByClan);
    assert.deepStrictEqual(Array.from(relatives, b => b.id), [12], '大名本人を除外し、旧game.bushos順を維持する');
});

test('姫生成は勢力ごとの全国filterを繰り返さず安全な年次文脈を共用する', () => {
    const life = read('js/life_system.js');
    const initialAt = life.indexOf('distributeInitialPrincesses()');
    const yearlyAt = life.indexOf('async checkRandomPrincessAppearance()');
    const initialBlock = life.slice(initialAt, yearlyAt);
    const yearlyBlock = life.slice(yearlyAt, yearlyAt + 6500);
    assert.ok(initialBlock.includes('const princessContext = this._buildPrincessAppearanceContext();'));
    assert.ok(yearlyBlock.includes('const princessContext = this._buildPrincessAppearanceContext();'));
    assert.ok(initialBlock.includes('this._getPrincessFamilyFatherCandidates('));
    assert.ok(yearlyBlock.includes('this._getPrincessFamilyFatherCandidates('));
    assert.ok(!initialBlock.includes('this.game.princesses.filter('));
    assert.ok(!initialBlock.includes('this.game.bushos.filter('));
    assert.ok(!yearlyBlock.includes('this.game.princesses.filter('));
    assert.ok(!yearlyBlock.includes('this.game.bushos.filter('));

    // 登場処理は先に登場した一門が後続武将の候補になり得るため、固定文脈へ狭めない。
    const birthAt = life.indexOf('async checkBirth()');
    const birthBlock = life.slice(birthAt, birthAt + 10500);
    assert.ok((birthBlock.match(/this\.game\.bushos\.filter\(other =>/g) || []).length >= 2);
});

test('城所有者と武将所属の実行時直接代入は専門窓口に限定し索引versionを必ず進める', () => {
    const jsFiles = [];
    const walk = dir => {
        for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
            const full = path.join(dir, entry.name);
            if (entry.isDirectory()) walk(full);
            else if (entry.name.endsWith('.js') && !entry.name.endsWith('.min.js')) jsFiles.push(full);
        }
    };
    walk(path.join(ROOT, 'js'));
    const stripComments = source => source
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/\/\/.*$/gm, '');
    const ownerAllowed = new Set(['js/castle_manager.js', 'js/models.js']);
    const clanAllowed = new Set(['js/affiliation_system.js', 'js/models.js']);
    const ownerOffenders = [];
    const clanOffenders = [];

    for (const file of jsFiles) {
        const rel = path.relative(ROOT, file).replace(/\\/g, '/');
        const source = stripComments(fs.readFileSync(file, 'utf8'));
        const lines = source.split(/\r?\n/);
        lines.forEach((line, index) => {
            if (!ownerAllowed.has(rel) && /(?:^|[^.\w$])[A-Za-z_$][\w$]*\.ownerClan\s*=(?!=)/.test(line)) {
                ownerOffenders.push(`${rel}:${index + 1}`);
            }
            // `el.dataset.clan = ...` のようなDOM datasetはbusho.clanではないため対象外。
            if (!clanAllowed.has(rel) && /(?:^|[^.\w$])[A-Za-z_$][\w$]*\.clan\s*=(?!=)/.test(line)) {
                clanOffenders.push(`${rel}:${index + 1}`);
            }
        });
    }
    assert.deepStrictEqual(ownerOffenders, [], `ownerClan直接代入: ${ownerOffenders.join(', ')}`);
    assert.deepStrictEqual(clanOffenders, [], `busho.clan直接代入: ${clanOffenders.join(', ')}`);

    const castleManager = read('js/castle_manager.js');
    const ownerAt = castleManager.indexOf('setOwnerIdRaw(castle, newOwnerId)');
    const ownerBlock = castleManager.slice(ownerAt, ownerAt + 650);
    assert.ok(ownerBlock.includes('castle.ownerClan = Number(newOwnerId) || 0;'));
    assert.ok(ownerBlock.includes('this.game.castleOwnershipVersion = (this.game.castleOwnershipVersion || 0) + 1;'));

    const affiliation = read('js/affiliation_system.js');
    const clanAt = affiliation.indexOf('setClanIdRaw(busho, newClanId)');
    const clanBlock = affiliation.slice(clanAt, clanAt + 900);
    assert.ok(clanBlock.includes('busho.clan = nextClanId;'));
    assert.ok(clanBlock.includes('this.game.bushoAffiliationVersion = (this.game.bushoAffiliationVersion || 0) + 1;'));
});



test('地図道路SVGはシナリオ静的層としてrenderMap間で再利用し切替時に解放する', () => {
    const uiMap = read('js/ui_map.js');
    const ui = read('js/ui.js');
    assert.ok(uiMap.includes('_getOrBuildMapRouteSvg(mapW, mapH)'));
    assert.ok(uiMap.includes('this.mapEl.appendChild(this._getOrBuildMapRouteSvg(mapW, mapH));'));
    assert.strictEqual((uiMap.match(/document\.createElementNS\(svgNS, "svg"\)/g) || []).length, 1, '道路SVG生成は静的層builderの1箇所に限定する');
    assert.ok(uiMap.includes('this._staticRouteCastlesSource === castles'));
    assert.ok(uiMap.includes('this._staticRouteCastlesSize === castles.length'));
    assert.ok(ui.includes('this._staticRouteSvg = null;'));
    assert.ok(ui.includes('this._staticRouteCastlesSource = null;'));
});

test('顔画像アイドル先読みはシナリオ世代tokenで旧batchを継続しない', () => {
    const game = read('js/game.js');
    const preloadAt = game.indexOf('preloadFaceIcons()');
    const preloadBlock = game.slice(preloadAt, preloadAt + 4200);
    assert.ok(preloadBlock.includes('const preloadGeneration = Number(this._facePreloadGeneration || 0) + 1;'));
    assert.ok(preloadBlock.includes('if (!isCurrentGeneration() || startIndex >= urls.length) return;'));
    assert.ok(preloadBlock.includes('if (!isCurrentGeneration()) return;'));
    const releaseAt = game.indexOf('releaseScenarioMapResources()');
    const releaseBlock = game.slice(releaseAt, releaseAt + 1200);
    assert.ok(releaseBlock.includes('this._facePreloadGeneration = Number(this._facePreloadGeneration || 0) + 1;'));
});


test('地図選択UIはvalidTargetsの同じincludesを全拠点・ラベルで繰り返さずSetを局所共用する', () => {
    const uiMap = read('js/ui_map.js');
    assert.ok(uiMap.includes('const validTargetSet = isSelectionMode ? new Set(this.game.validTargets) : null;'));
    assert.ok(uiMap.includes('if (validTargetSet.has(c.id))'));
    assert.ok(uiMap.includes('this.renderDaimyoLabels(validTargetSet);'));
    const labelAt = uiMap.indexOf('renderDaimyoLabels(validTargetSet = null)');
    const labelBlock = uiMap.slice(labelAt, labelAt + 7200);
    assert.ok(labelBlock.includes('selectionTargetSet.has(castle.id)'));
    assert.ok(labelBlock.includes('selectionTargetSet.has(l.castle.id)'));
    assert.ok(!labelBlock.includes('validTargets.includes('));
});

test('拠点光彩更新は同一勢力の外交関係を1回の描画内でだけ再利用する', () => {
    const uiMap = read('js/ui_map.js');
    const at = uiMap.indexOf('    updateCastleGlows() {');
    const block = uiMap.slice(at, at + 3600);
    assert.ok(block.includes('const relationByClan = new Map();'));
    assert.ok(block.includes('if (!relationByClan.has(clanId))'));
    assert.ok(block.includes('this.game.getRelation(baseClanId, clanId)'));
});

test('勢力色Canvasの再描画判定は全ownerClan文字列化でなく所有versionを使う', () => {
    const uiMap = read('js/ui_map.js');
    const at = uiMap.indexOf('    updateClanColors() {');
    const block = uiMap.slice(at, at + 4200);
    assert.ok(block.includes('this.game.castleOwnershipVersion'));
    assert.ok(block.includes('this.game.castles.length'));
    assert.ok(!block.includes("this.game.castles.map(c => c.ownerClan).join(',' )"));
    assert.ok(!block.includes("this.game.castles.map(c => c.ownerClan).join(',')"));
});

test('スマホ固定HUDは同じ年月・相場HTMLを毎回再生成しない', () => {
    const ui = read('js/ui.js');
    const at = ui.indexOf('updateInfoPanel(castle)');
    const block = ui.slice(at, at + 14000);
    assert.ok(block.includes('if (this.mobileFloatingInfo.innerHTML !== nextTimeHtml)'));
    assert.ok(block.includes('if (this.mobileFloatingMarket.innerHTML !== nextMarketHtml)'));
    assert.ok(block.includes('if (this.mobileBottomInfo && this.mobileBottomInfo.innerHTML)'));
});



test('TurnManagerはturnQueue欠損をisDone参照より先に処理する', () => {
    const source = read('js/turn_manager.js');
    const at = source.indexOf('const expectedTurnIndex = Number(game.currentIndex);');
    const block = source.slice(at, at + 1700);
    assert.ok(block.indexOf('if (!castle)') >= 0);
    assert.ok(block.indexOf('if (!castle)') < block.indexOf('if (castle.isDone)'));
    assert.ok(!block.includes('if(!castle || castle.ownerClan'));
});

test('通常イベントも条件判定例外を局所隔離して進行を継続する', () => {
    const source = read('js/event_manager.js');
    const at = source.indexOf('async processEvents(timing, context = null)');
    const block = source.slice(at, at + 7000);
    assert.ok(block.includes('matched = !!ev.checkCondition(this.game, context);'));
    assert.ok(block.includes('条件判定中にエラーが出ましたが、進行を継続します'));
    assert.ok(block.includes('continue;'));
});

test('セーブ用勢力図生成はasync Promise executorを使わず失敗時も必ず資源解放する', () => {
    const source = read('js/save_manager.js');
    const at = source.indexOf('async generateSaveMapImage()');
    const block = source.slice(at, at + 3600);
    assert.ok(!block.includes('new Promise(async'));
    assert.ok(block.includes('finally {'));
    assert.ok(block.includes("whiteMapImg.src = ''"));
    assert.ok(block.includes('thumbCanvas.width = 1'));
});

test('地図画像帯解析は成功・失敗の全経路でImageとCanvasを解放する', () => {
    const source = read('js/data_manager.js');
    const at = source.indexOf('static async scanImageByStrips');
    const block = source.slice(at, at + 3600);
    assert.ok(block.includes('finally {'));
    assert.ok(block.includes("img.src = ''"));
    assert.ok(block.includes('canvas.width = 1'));
});


test('通常イベントの条件判定が例外でも後続イベントを実行できる', async () => {
    const quietConsole = { ...console, warn() {} };
    const ctx = createContext({ console: quietConsole });
    let executed = 0;
    ctx.window.GameEvents = [
        { id: 'broken_condition', timing: 'startMonth_before', checkCondition() { throw new Error('broken'); }, execute: async () => {} },
        { id: 'healthy_event', timing: 'startMonth_before', checkCondition: () => true, execute: async () => { executed += 1; } }
    ];
    ctx.window.UserSettings = { historicalEvent: true };
    loadScript(ctx, 'js/event_manager.js');
    const EventManager = vm.runInContext('EventManager', ctx);
    const manager = new EventManager({ flags: {}, writeSystemDiagnostic() {} });
    await manager.processEvents('startMonth_before');
    assert.strictEqual(executed, 1);
});

test('セーブ用勢力図の描画例外は待機を残さずnullで完了しImageを解放する', async () => {
    let lastImage = null;
    class FakeImage {
        constructor() { this.decoding = ''; this.onload = null; this.onerror = null; this._src = ''; lastImage = this; }
        set src(value) { this._src = value; if (value && this.onload) this.onload(); }
        get src() { return this._src; }
    }
    const ctx = createContext({
        console: { ...console, warn() {} },
        Image: FakeImage,
        document: {
            createElement() { return { width: 0, height: 0, getContext() { return { drawImage() { throw new Error('draw failed'); } }; } }; },
            getElementById() { return null; }
        }
    });
    loadScript(ctx, 'js/save_manager.js');
    const SaveManager = vm.runInContext('SaveManager', ctx);
    const result = await new SaveManager({ mapWidth: 1200, mapHeight: 800 }).generateSaveMapImage();
    assert.strictEqual(result, null);
    assert.strictEqual(lastImage.src, '');
});

test('帯状地図解析はCanvas context取得失敗でも読み込みImageを解放する', async () => {
    const img = { naturalWidth: 100, naturalHeight: 100, width: 100, height: 100, src: 'map.png' };
    const ctx = createContext({
        document: {
            body: { classList: { contains: () => false } },
            createElement() { return { width: 0, height: 0, getContext: () => null }; }
        }
    });
    ctx.window.MainParams = { StartYear: 1560, StartMonth: 4, System: { UseRandomNames: false } };
    loadScript(ctx, 'js/data_manager.js');
    const DataManager = vm.runInContext('DataManager', ctx);
    DataManager.loadImageElement = async () => img;
    DataManager.yieldToBrowser = async () => {};
    const result = await DataManager.scanImageByStrips('dummy.png', async () => {});
    assert.strictEqual(result, null);
    assert.strictEqual(img.src, '');
});

test('歴史イベントexecuteの欠損ガードは対象プロパティ参照より先に置く', () => {
    const source = read('js/event/historical_event.js');
    const gifuAt = source.indexOf('id: "historical_rename_gifu_castle"');
    const gifuExecAt = source.indexOf('execute: async function(game)', gifuAt);
    const gifu = source.slice(gifuExecAt, gifuExecAt + 2500);
    assert.ok(gifu.indexOf('if (!nobunaga || !inabayama || !kiyosu) return;') < gifu.indexOf('const odaClanId = nobunaga.clan;'));
    const hamamatsuAt = source.indexOf('id: "historical_rename_hamamatsu_castle"');
    const hamamatsuExecAt = source.indexOf('execute: async function(game)', hamamatsuAt);
    const hamamatsu = source.slice(hamamatsuExecAt, hamamatsuExecAt + 2200);
    assert.ok(hamamatsu.indexOf('if (!motoyasu || !hikuma || !okazaki) return;') < hamamatsu.indexOf('const matsudairaClanId = motoyasu.clan;'));
});


test('地図演出Canvasはcontext喪失時もmap guardと資源を残さず本処理を進める', () => {
    const source = read('js/ui_map.js');
    const maskAt = source.indexOf('_buildCastleEffectMask(');
    const maskBlock = source.slice(maskAt, maskAt + 5200);
    assert.ok(maskBlock.includes('if (!maskCtx)'));
    assert.ok(maskBlock.includes('maskCtx.createImageData'));
    assert.ok(maskBlock.includes("console.warn('戦闘領域マスクCanvasの生成を省略しました:'"));
    assert.ok(maskBlock.includes('maskCanvas.width = 1'));

    const blinkAt = source.indexOf('async playBattleBlink(');
    const blinkBlock = source.slice(blinkAt, blinkAt + 6500);
    assert.ok(blinkBlock.includes('if (!ctx)'));
    assert.ok(blinkBlock.includes("console.warn('戦闘点滅Canvasの準備を省略しました:'"));
    assert.ok(blinkBlock.includes('this._releaseEffectOverlay(overlay, maskInfo);'));
    assert.ok(blinkBlock.includes('this.hideMapGuard();'));

    const captureAt = source.indexOf('async playCaptureEffect(');
    const captureBlock = source.slice(captureAt, captureAt + 7600);
    assert.ok(captureBlock.includes('const runHalfway = () =>'));
    assert.ok(captureBlock.includes('if (!ctx)'));
    assert.ok(captureBlock.includes('runHalfway();'));
    assert.ok(captureBlock.includes("console.warn('制圧Canvasの準備を省略しました:'"));
    assert.ok(captureBlock.includes('const fail = (error) =>'));
});

test('戦闘地図演出はImageData確保・overlay context準備例外でも入力guardを残さない', async () => {
    function UIManager() {}
    let lastMaskCanvas = null;
    const ctx = createContext({
        UIManager,
        console: { ...console, warn() {} },
        DataManager: {
            castlePixelBounds: [null, { minX: 0, maxX: 0, minY: 0, maxY: 0 }]
        },
        document: {
            createElement(tag) {
                if (tag !== 'canvas') return { style: {}, parentNode: null };
                lastMaskCanvas = {
                    width: 0, height: 0, style: {}, parentNode: null,
                    getContext() {
                        return { createImageData() { throw new Error('oom'); } };
                    }
                };
                return lastMaskCanvas;
            },
            getElementById() { return null; },
            body: { classList: { contains: () => false } }
        }
    });
    loadScript(ctx, 'js/ui_map.js');

    const maskOwner = {
        game: { mapWidth: 2, mapHeight: 2 },
        pixelCastleMap: [1, 0, 0, 0]
    };
    const mask = ctx.UIManager.prototype._buildCastleEffectMask.call(maskOwner, 1, 0, 0);
    assert.strictEqual(mask, null);
    assert.strictEqual(lastMaskCanvas.width, 1);
    assert.strictEqual(lastMaskCanvas.height, 1);

    const makeEffectOwner = () => {
        let guard = 0;
        let released = 0;
        const owner = {
            game: { warManager: { state: {} } },
            withAIGuardTextHiddenForMapEffect(fn) { return fn(); },
            async focusMapOnCastle() {},
            showMapGuard() { guard += 1; },
            hideMapGuard() { guard -= 1; },
            _buildCastleEffectMask() { return { width: 1, height: 1, canvas: {}, release() {} }; },
            _createCroppedEffectOverlay() { return { width: 1, height: 1, getContext() { throw new Error('context lost'); } }; },
            _releaseEffectOverlay() { released += 1; },
            get guard() { return guard; },
            get released() { return released; }
        };
        return owner;
    };

    const blinkOwner = makeEffectOwner();
    await ctx.UIManager.prototype.playBattleBlink.call(blinkOwner, 1, null, null, 100, { focus: false });
    assert.strictEqual(blinkOwner.guard, 0);
    assert.strictEqual(blinkOwner.released, 1);

    const captureOwner = makeEffectOwner();
    let halfway = 0;
    await ctx.UIManager.prototype.playCaptureEffect.call(captureOwner, 1, () => { halfway += 1; }, { focus: false });
    assert.strictEqual(captureOwner.guard, 0);
    assert.strictEqual(captureOwner.released, 1);
    assert.strictEqual(halfway, 1, '制圧本処理は演出準備失敗でも一度だけ進める');
});

test('プレイヤー滅亡の遅延処理はasync setTimeout callbackで未解決Promiseを作らない', () => {
    const source = read('js/life_system.js');
    const needle = '全拠点を失いました。我が大名家は滅亡しました';
    const at = source.indexOf(needle);
    const block = source.slice(Math.max(0, at - 800), at + 500);
    assert.ok(block.includes('await new Promise(resolve => setTimeout(resolve, 1000));'));
    assert.ok(!block.includes('setTimeout(async'));
});


test('イベント地方Canvasはcontext取得失敗時にbacking storeを即時解放する', async () => {
    let lastCanvas = null;
    const ctx = createContext({
        console: { ...console, warn() {} },
        document: {
            body: { classList: { contains: () => false } },
            createElement(tag) {
                if (tag !== 'canvas') return { style: {}, appendChild() {}, classList: new FakeClassList() };
                lastCanvas = { width: 0, height: 0, style: {}, className: '', getContext: () => null };
                return lastCanvas;
            },
            getElementById() { return null; }
        }
    });
    ctx.window.GameEvents = [];
    loadScript(ctx, 'js/event/common_events.js');
    const result = await ctx.window.EventMapEffects.createProvinceCanvas(
        { mapWidth: 4, mapHeight: 4, ui: { pixelProvinceMap: new Array(16).fill(1) } },
        new Set([1]),
        { r: 1, g: 2, b: 3, a: 180 }
    );
    assert.strictEqual(result.canvas, null);
    assert.strictEqual(lastCanvas.width, 1);
    assert.strictEqual(lastCanvas.height, 1);
});

test('イベント地図shellは返却前のpause失敗でも暗幕を自前rollbackする', async () => {
    const children = [];
    const makeElement = () => ({
        style: {},
        className: '',
        parentNode: null,
        appendChild(child) { child.parentNode = this; },
        querySelectorAll() { return []; }
    });
    const body = makeElement();
    body.classList = { contains: () => false };
    body.appendChild = child => { child.parentNode = body; children.push(child); };
    body.removeChild = child => {
        const index = children.indexOf(child);
        if (index >= 0) children.splice(index, 1);
        child.parentNode = null;
    };
    const scroll = { style: { display: 'block' } };
    const ctx = createContext({
        console: { ...console, warn() {} },
        setTimeout,
        document: {
            body,
            createElement() { return makeElement(); },
            getElementById(id) { return id === 'map-scroll-container' ? scroll : null; }
        }
    });
    ctx.window.GameEvents = [];
    loadScript(ctx, 'js/event/common_events.js');
    let resumed = 0;
    const game = {
        ui: {
            isBackgroundPaused: false,
            pauseBackgroundUpdates() { throw new Error('pause failed'); },
            resumeBackgroundUpdates() { resumed += 1; }
        }
    };
    await assert.rejects(() => ctx.window.EventMapEffects.createOverlay(game), /pause failed/);
    assert.strictEqual(children.length, 0, '返却前に失敗しても暗幕DOMを残さない');
    assert.strictEqual(resumed, 1, '途中までpauseした可能性を考慮してresumeを試す');
    assert.strictEqual(scroll.style.display, 'block');
});

test('災害イベント地図の描画失敗は暗幕を後始末して結果処理を継続する', async () => {
    const ctx = createContext({ console: { ...console, warn() {} } });
    ctx.window.GameEvents = [];
    ctx.document = { body: { classList: { contains: () => false } } };
    loadScript(ctx, 'js/event/common_events.js');
    let cleaned = 0;
    ctx.window.EventMapEffects = {
        writeDiag() {},
        async createOverlay() { return { mapOverlay: {}, mapContainer: { appendChild() {} } }; },
        async createProvinceCanvas() { throw new Error('context lost'); },
        async waitForDismiss() {},
        async cleanupOverlay() { cleaned += 1; }
    };
    const game = {
        ui: { async showDialogAsync() {} },
        castles: [],
        playerClanId: 1,
        getProvince() { return null; }
    };
    await ctx.window.playProvinceMapEffect(game, '大雪', 'test', new Set([1]), 1, 2, 3);
    assert.strictEqual(cleaned, 1);
});

test('台風イベント地図は途中例外でもfinallyで通常地図へ復帰する', () => {
    const source = read('js/event/typhoon_event.js');
    const at = source.indexOf('execute: async function(game)');
    const block = source.slice(at, at + 22000);
    assert.ok(block.includes('let overlayCleaned = false;'));
    assert.ok(block.includes('if (!canvas)'));
    assert.ok(block.includes("console.warn('台風の地図演出を途中で省略しました:'"));
    assert.ok(block.includes('canvas.width = 1; canvas.height = 1;'));
    assert.ok(block.includes('} finally {'));
    assert.ok(block.includes('if (!overlayCleaned && mapOverlay'));
});

test('ロード時の地図寸法確認Imageは次の巨大画像解析前に解放する', () => {
    const source = read('js/save_manager.js');
    const at = source.indexOf("img.src = './data/images/map/japan_map.png';");
    const block = source.slice(Math.max(0, at - 1000), at + 200);
    assert.ok(block.includes('img.onload = null;'));
    assert.ok(block.includes('img.onerror = null;'));
    assert.ok(block.includes("img.src = '';"));
});


test('捕虜大名の旧専用UI経路を残さず正規処遇へ一本化する', () => {
    const uiInfoSource = read('js/ui_info.js');
    const uiSource = read('js/ui.js');
    const warSource = read('js/war_effort.js');
    assert.ok(!uiInfoSource.includes('showDaimyoPrisonerModal('));
    assert.ok(!uiInfoSource.includes('data-prisoner-action'));
    assert.ok(!uiSource.includes('showDaimyoPrisonerModal('));
    assert.ok(warSource.includes('showDaimyoDialog(prisoner)'));
    assert.ok(warSource.includes('confirmDaimyoPrisonerKill(prisoner)'));
    assert.ok(warSource.includes("handleDaimyoPrisonerAction(prisoner, 'kill')"));
});

test('共通Selectorへ移行済みの捕虜・家督旧専用モーダル参照を残さない', () => {
    const uiSource = read('js/ui.js');
    const html = read('index.html');
    assert.ok(!html.includes('id="prisoner-modal"'));
    assert.ok(!html.includes('id="succession-modal"'));
    assert.ok(!uiSource.includes('prisoner-modal'));
    assert.ok(!uiSource.includes('succession-modal'));
    assert.ok(!uiSource.includes('showPrisonerModal('));
    assert.ok(!uiSource.includes('showSuccessionModal('));
});


test('援軍で選んだ勢力はCastleへ一時プロパティを貼らず明示引数で渡す', () => {
    const command = read('js/command_system.js');
    const prep = read('js/war_preparation_controller.js');
    const effort = read('js/war_effort.js');
    const ui = read('js/ui.js');
    const gameSources = [command, prep, effort].join('\n');
    assert.ok(!gameSources.includes('.selectedForce ='), '援軍選択をCastleへ一時保存しない');
    assert.ok(prep.includes('executeReinforcementRequest(gold, helperCastle, force,'), '攻撃側援軍は選択勢力を明示引数で受け取る');
    assert.ok(effort.includes('executeDefReinforcement(gold, helperCastle, force, defCastle, onComplete)'), '守備側援軍も選択勢力を明示引数で受け取る');
    assert.ok(command.includes('showReinforcementGoldSelector(targetCastle, force,'), '地図選択した勢力を攻撃側持参金画面へそのまま渡す');
    assert.ok(command.includes('showDefReinforcementGoldSelector(targetCastle, force,'), '地図選択した勢力を守備側持参金画面へそのまま渡す');
    assert.ok(ui.includes('showReinforcementGoldSelector(helperCastle, selectedForce,'));
    assert.ok(ui.includes('showDefReinforcementGoldSelector(helperCastle, selectedForce,'));
});

test('部隊分割は確定・取消・強制終了前に遅延UI更新を破棄する', () => {
    const slider = read('js/ui_slider.js');
    const ui = read('js/ui.js');
    assert.ok(slider.includes('cancelUnitDivideDeferredUpdates() {'), '部隊分割専用の遅延更新破棄窓口を持つ');
    assert.ok(slider.includes("this.cancelUnitDivideDeferredUpdates();\n        const modal = document.getElementById('unit-divide-modal')"), '次の部隊分割開始前に旧画面の更新を破棄する');
    assert.ok(slider.includes('this._unitDivideUiRaf = raf(() => {'), '残数・確定可否更新のRAFを画面寿命へ紐付ける');
    assert.ok(slider.includes('this._unitDivideScrollbarRaf = raf(() => {'), 'スクロールバー更新のRAFも画面寿命へ紐付ける');
    assert.ok(slider.includes("this.cancelUnitDivideDeferredUpdates();\n            modal.classList.add('hidden');"), '画面を隠す前に遅延更新を止める');
    assert.ok(ui.includes("typeof this.slider.cancelUnitDivideDeferredUpdates === 'function'"), '強制モーダルリセットでも遅延更新を破棄する');
});


test('通常出陣の大雪警告は数量指定前に出し、戻るで親武将一覧を維持する', () => {
    const source = read('js/command_system.js');
    assert.ok(source.includes('openWarSuppliesSelectorWithWeatherWarning(selectedIds, targetId, extraData = {})'));
    assert.ok(source.includes("cancelText: '戻る'"));
    assert.ok(source.includes('closeBeforeOk: true'));
    assert.ok(source.includes('closeBeforeCancel: true'));
    assert.ok(source.includes('this.openWarSuppliesSelectorWithWeatherWarning(sortedIds, targetId);'));
    assert.ok(source.includes("this.openWarSuppliesSelectorWithWeatherWarning(sortedIds, targetId, { isKunishu: true, kunishuId: extraData.kunishuId });"));
    const quantityAt = source.indexOf("else if (type === 'war_supplies')");
    const quantityBlock = source.slice(quantityAt, quantityAt + 1800);
    assert.ok(!quantityBlock.includes('isHeavySnow'), '数量確定後に大雪警告を重ねない');
    assert.ok(quantityBlock.includes("this.executeWithEvent('war', () => proceedWar());"));
});

test('確認後に非会話画面へ移る主要操作は先に確認ダイアログを閉じる', () => {
    const council = read('js/legion_council_view.js');
    const turn = read('js/turn_manager.js');
    const ui = read('js/ui.js');
    const command = read('js/command_system.js');
    const load = read('js/save_load_view.js');
    const game = read('js/game.js');

    const councilOpen = council.slice(council.indexOf("this.ui.showDialog('評定を開きますか？"), council.indexOf('    open() {'));
    assert.ok(councilOpen.includes('closeBeforeOk: true'));
    assert.ok(councilOpen.includes('closeBeforeCancel: true'));
    const councilFinish = council.slice(council.indexOf('    confirmFinish()'), council.indexOf('window.LegionCouncilView'));
    assert.ok(councilFinish.includes('closeBeforeOk: true'));
    assert.ok(councilFinish.includes('closeBeforeCancel: true'));

    const autoFinish = turn.slice(turn.indexOf('checkAllActionsDone()'));
    assert.ok(autoFinish.includes('closeBeforeOk: true'));
    assert.ok(autoFinish.includes('closeBeforeCancel: true'));
    assert.ok((ui.match(/closeBeforeOk: true/g) || []).length >= 2, 'PC/スマホの命令終了確認を先に閉じる');

    const watchBlock = command.slice(command.indexOf("case 'watch':"), command.indexOf("case 'title':"));
    assert.ok(watchBlock.includes('closeBeforeOk: true'));
    assert.ok(watchBlock.includes('closeBeforeCancel: true'));
    const titleBlock = command.slice(command.indexOf("case 'title':"), command.indexOf('default:', command.indexOf("case 'title':")));
    assert.ok(titleBlock.includes('closeBeforeOk: true'));
    assert.ok(titleBlock.includes('closeBeforeCancel: true'));

    const loadStart = load.indexOf('のデータをロードしますか？');
    const loadBlock = load.slice(loadStart, loadStart + 900);
    assert.ok(loadBlock.includes('closeBeforeOk: true'));
    assert.ok(loadBlock.includes('closeBeforeCancel: true'));

    const watchReturn = game.slice(game.indexOf("this.ui.showDialog('観戦をやめますか？"), game.indexOf('    _resetWatchReturnState()'));
    assert.ok(watchReturn.includes('closeBeforeOk: true'));
    assert.ok(watchReturn.includes('closeBeforeCancel: true'));
});


test('セーブ・ロードの確認取消はスロット一覧を閉じず、確定時だけ閉じる', () => {
    const source = read('js/save_load_view.js');
    const start = source.indexOf('btn.onclick = () => {');
    const block = source.slice(start, start + 2600);
    assert.ok(block.includes('const closeSlotList = () => {'));
    assert.ok(block.includes('closeBeforeCancel: true'));
    assert.ok(block.includes('closeSlotList();\n                            this.game.saveGameToLocal(i);'));
    assert.ok(block.includes('closeSlotList();\n                                this.game.loadGameFromLocal(i, prefix);'));
    const beforeSave = block.slice(0, block.indexOf("if (mode === 'save')"));
    const closeFnEnd = beforeSave.indexOf('};', beforeSave.indexOf('const closeSlotList'));
    const afterCloseFn = beforeSave.slice(closeFnEnd + 2);
    assert.ok(!afterCloseFn.includes('closeSlotList();'), 'スロット選択直後には一覧を閉じない');
});



test('野戦撤退と援軍大雪警告の取消は確認画面を戦場・親一覧へ残さない', () => {
    const field = read('js/field_war.js');
    const prep = read('js/war_preparation_controller.js');
    const retreatBlock = field.slice(field.indexOf('if (btnRetreat)'), field.indexOf('    cancelAction()'));
    assert.ok((retreatBlock.match(/closeBeforeCancel: true/g) || []).length >= 2, '総大将・一般部隊の撤退取消を即時に戦場へ戻す');
    const snowAt = prep.indexOf('handleBushoSelectionForDefSelfReinf');
    const snowBlock = prep.slice(snowAt, snowAt + 2600);
    assert.ok(snowBlock.includes("cancelText: '戻る'"));
    assert.ok(snowBlock.includes('closeBeforeOk: true, closeBeforeCancel: true'));
});

test('確認取消で非会話の親画面へ戻る主要経路はcloseBeforeCancelを明示する', () => {
    const ui = read('js/ui.js');
    const command = read('js/command_system.js');
    const kyoten = read('js/ui_info_kyoten.js');

    const gunshi = ui.slice(ui.indexOf('openGunshiModal('), ui.indexOf('    openBushoSelector', ui.indexOf('openGunshiModal(')));
    assert.ok(gunshi.includes('closeBeforeCancel: true'), '軍師助言の戻るは背後の一覧/戦場へ即復帰する');

    const reinfMap = ui.slice(ui.indexOf('援軍を要請するのをやめますか？'), ui.indexOf('    renderEnemyViewMenu()'));
    assert.ok(reinfMap.includes('closeBeforeOk: true, closeBeforeCancel: true'), '援軍地図選択のやめる/続ける双方で確認を先に閉じる');

    for (const marker of ['家督を譲りますか？', '養子にしますか？', '追放しますか？', '本当に臣従しますか？']) {
        const at = command.indexOf(marker);
        const block = command.slice(Math.max(0, at - 250), at + 900);
        assert.ok(block.includes('closeBeforeCancel: true'), `${marker} の取消は保持済み親一覧へ即復帰する`);
    }
    const appointAt = kyoten.indexOf('この内容で国主に任命しますか？');
    const appointBlock = kyoten.slice(Math.max(0, appointAt - 450), appointAt + 800);
    assert.ok(appointBlock.includes('closeBeforeCancel: true'));
});

test('浪人仕官を断った時は会話handoffを残さず通常画面へ戻る', () => {
    const common = read('js/event/common_events.js');
    const at = common.indexOf("cancelText: '追い払う'");
    const block = common.slice(Math.max(0, at - 500), at + 500);
    assert.ok(block.includes('closeBeforeCancel: true'));
});


test('寝返り希望者との面会は共通呼称を使い、最初から断る時は通常画面へ即復帰する', () => {
    const source = read('js/independence_system.js');
    const start = source.indexOf('async askPlayerForDefection(');
    const block = source.slice(start, source.indexOf('\n    }\n}', start) + 7);
    assert.ok(block.includes('ConversationStandingRules.getDiplomaticCallName'));
    assert.ok(!block.includes('givenNameStr + "とやら"'));
    assert.ok(!block.includes("rankName + '殿'"));
    const greetAt = block.indexOf("okText: '面会する'");
    const greetBlock = block.slice(Math.max(0, greetAt - 500), greetAt + 700);
    assert.ok(greetBlock.includes("cancelText: '断る'"));
    assert.ok(greetBlock.includes('closeBeforeCancel: true'));
});

test('共通ダイアログ移行済みの旧軍師モーダルを残さない', () => {
    const html = read('index.html');
    const ui = read('js/ui.js');
    const boot = read('js/app_bootstrap.js');
    const css = read('css/style.css');
    for (const token of ['gunshi-modal', 'gunshi-name', 'gunshi-message', 'gunshi-execute-btn', 'gunshi-back-btn']) {
        assert.ok(!html.includes(token), `${token} の旧HTMLを残さない`);
    }
    for (const token of ['this.gunshiModal', 'this.gunshiName', 'this.gunshiMessage', 'this.gunshiExecuteBtn']) {
        assert.ok(!ui.includes(token), `${token} の旧DOM参照を残さない`);
    }
    assert.ok(!boot.includes('gunshi-back-btn'));
    for (const selector of ['#gunshi-modal', '#daimyo-list-modal', '#daimyo-detail-modal', '#faction-list-modal', '#princess-list-modal', '#diplo-list-modal']) {
        assert.ok(!css.includes(selector), `${selector} の死んだCSSを残さない`);
    }
    const openAt = ui.indexOf('openGunshiModal(');
    const openBlock = ui.slice(openAt, ui.indexOf('    openBushoSelector', openAt));
    assert.ok(openBlock.includes('this.showDialog('));
    assert.ok(openBlock.includes('closeBeforeCancel: true'));
});

test('迎撃専用画面の一般地点表記は城ではなく拠点を使う', () => {
    const html = read('index.html');
    assert.ok(html.includes('<h3>拠点を出て迎え撃ちますか？</h3>'));
    assert.ok(!html.includes('<h3>城を出て迎え撃ちますか？</h3>'));
});


test('セーブ・ロードの非同期タブ描画は世代tokenで古い結果を破棄する', () => {
    const source = read('js/save_load_view.js');
    const bootstrap = read('js/app_bootstrap.js');
    const ui = read('js/ui.js');
    assert.ok(source.includes('this._openGeneration = 0;'));
    assert.ok(source.includes('this._renderGeneration = 0;'));
    assert.ok(source.includes('const openGeneration = ++this._openGeneration;'));
    assert.ok(source.includes('const renderGeneration = ++this._renderGeneration;'));
    assert.ok(source.includes('if (!isRenderCurrent()) return;'), '非同期読込完了後に古い描画を破棄する');
    assert.ok(source.includes('if (!isOpenCurrent()) return;'), '表示直後の遅延スクロール更新も旧open世代から触らない');
    assert.ok(source.includes('invalidatePendingRenders()'));
    assert.ok(source.includes('close() {'));
    assert.ok(source.includes('this.close();'), 'スロット確定時もViewのclose経路で世代を無効化する');
    assert.ok(bootstrap.includes("getGame()?.ui?.saveLoadView?.close()"), '固定閉じるボタンもSaveLoadViewへ委譲する');
    assert.ok(!bootstrap.includes("hide('saveload-modal')"), '固定DOMを直接隠す旧close経路を残さない');
    assert.ok(ui.includes("this.saveLoadView.invalidatePendingRenders()"), 'forceResetでも保留中の読込を無効化する');
});

test('具体名のシナリオ選択戻りボタンもPC右クリックのcancel意味を持つ', () => {
    const html = read('index.html');
    assert.ok(/id="btn-back-to-scenario"[^>]*data-se="cancel\.ogg"[^>]*>シナリオ選択に戻る<\/button>/.test(html));
});


test('［やめる］は操作全体の中止に限定し、一段戻りや物語分岐は具体表記を使う', () => {
    const command = read('js/command_system.js');
    const saveView = read('js/save_load_view.js');
    const warEffort = read('js/war_effort.js');
    const kyoten = read('js/ui_info_kyoten.js');
    const historical = read('js/event/historical_event.js');
    const warPrep = read('js/war_preparation_controller.js');
    const ui = read('js/ui.js');

    for (const token of [
        "{ okText: '嫁がせる', cancelText: '戻る', closeBeforeCancel: true }",
        "{ okText: '臣従する', okClass: 'btn-danger', cancelText: '戻る', closeBeforeCancel: true }",
        "{ okText: '家督を譲る', okClass: 'btn-danger', cancelText: '戻る', closeBeforeCancel: true }",
        "{ okText: '養子にする', cancelText: '戻る', closeBeforeCancel: true }",
        "cancelText: '戻る', closeBeforeCancel: true"
    ]) assert.ok(command.includes(token), `一段戻り確認は戻る表記を使う: ${token}`);

    assert.strictEqual((saveView.match(/cancelText: '戻る'/g) || []).length >= 2, true, 'セーブ/ロード確認はスロット一覧へ戻る');
    assert.ok(warEffort.includes("cancelText: '戻る'"), '捕虜処断取消は捕虜一覧へ戻る');
    assert.ok(kyoten.includes("{ okText: '任命する', cancelText: '戻る', closeBeforeCancel: true }"), '国主任命取消は拠点一覧へ戻る');
    assert.ok(historical.includes('cancelText: "出陣しない"'), '桶狭間の分岐は取消ではなく具体的な選択結果を表示する');

    assert.ok(warPrep.includes("cancelText: 'やめる'"), '出陣準備そのものを中止する最終確認はやめるを維持する');
    assert.ok(command.includes("okText: '実行', cancelText: 'やめる'"), '一括褒美を取りやめる確認はやめるを維持する');
    assert.ok(command.includes("okText: '観戦する', okClass: 'btn-primary', cancelText: 'やめる'"), '観戦開始を取りやめる確認はやめるを維持する');
    assert.ok(ui.includes("okText: '解任する', okClass: 'btn-danger', cancelText: 'やめる'"), '国主解任を取りやめる確認はやめるを維持する');
});


test('PC右クリックは最前面モーダルだけを対象にし［やめる］も操作中止として扱う', () => {
    const ui = read('js/ui.js');
    assert.ok(ui.includes("const targetTexts = ['閉じる', '戻る', 'いいえ', 'やめる'];"), 'やめるも操作全体の中止として右クリック対象に含める');
    assert.ok(ui.includes("const visibleModals = Array.from(document.querySelectorAll('.modal:not(.hidden)'))"), '表示中モーダルを抽出する');
    assert.ok(ui.includes('const topModal = visibleModals.reduce((best, modal) => {'), '最前面モーダルを決める');
    assert.ok(ui.includes('const buttonScope = topModal || document;'), 'モーダルがある時は前面だけをキャンセル検索範囲にする');
    assert.ok(ui.includes("Number.parseInt(window.getComputedStyle(modal).zIndex, 10) || 0"), '重なり順は実際のz-indexを参照する');
});

test('フォーム部品上の右クリックと長押しはネイティブ入力を優先する', () => {
    const ui = read('js/ui.js');
    const formGuard = 'actionTarget.closest(\'input, select, textarea, option, [contenteditable="true"], .custom-scrollbar-thumb, .custom-scrollbar-track, .custom-scrollbar-btn\')';
    assert.ok(ui.includes(formGuard), 'フォーム部品と独自スクロールバーを共通右クリック／長押しの対象外にする');
    const actionAt = ui.indexOf('const executeContextMenuAction = (e) => {');
    const formAt = ui.indexOf(formGuard, actionAt);
    const watchAt = ui.indexOf('if (this.game && this.game.isWatchMode)', actionAt);
    assert.ok(actionAt >= 0 && formAt > actionAt && watchAt > formAt, '観戦終了予約より先にフォームのネイティブ操作を保護する');
});

test('右クリックと長押しは非モーダル入力遮断レイヤーを貫通しない', () => {
    const ui = read('js/ui.js');
    for (const selector of [
        '#global-loading-screen',
        '#save-guard',
        '#ai-guard',
        '#war-ai-guard',
        '#cutin-overlay',
        '#ending-screen',
        '.event-map-overlay',
        '#battle-blink-guard'
    ]) {
        assert.ok(ui.includes(`'${selector}'`), `${selector} を共通操作の入力遮断対象に含める`);
    }
    assert.ok(ui.includes("shield.closest('.hidden')"), '親画面ごと隠れた遮断レイヤーは有効扱いしない');
    assert.ok(ui.includes("style.pointerEvents !== 'none'"), '入力を実際に遮断するレイヤーだけを対象にする');
    assert.ok(!ui.includes("style.opacity !== '0'\n                    && style.pointerEvents"), '透明化したAI guardも入力壁なのでopacityでは除外しない');

    const watchAt = ui.indexOf('if (this.game && this.game.isWatchMode)');
    const shieldAt = ui.indexOf('const inputShieldSelectors = [', watchAt);
    const pcAt = ui.indexOf("if (document.body.classList.contains('is-pc'))", shieldAt);
    assert.ok(watchAt >= 0 && shieldAt > watchAt && pcAt > shieldAt, '観戦終了予約だけを例外として入力遮断判定より先に処理する');
});

test('確認取消の具体文言は役割が取消の場合だけcancel意味を宣言する', () => {
    const ui = read('js/ui.js');
    assert.ok(ui.includes("const genericCancelLabels = new Set(['いいえ', '戻る', 'やめる', '続ける', '観戦を続ける']);"), '操作取消として使う具体文言を限定列挙する');
    assert.ok(ui.includes("canB.dataset.se = 'cancel.ogg';"), '対象だけcancel意味をdata-seで宣言する');
    assert.ok(ui.includes("dialog.customOpts?.isContextCancel === true"), '将来の具体文言は明示フラグでも取消役割を宣言できる');
    assert.ok(!ui.includes("genericCancelLabels = new Set(['いいえ', '戻る', 'やめる', '続ける', '観戦を続ける', '出陣しない'"), '歴史イベントの意味ある否定分岐は汎用取消へ混ぜない');
});

test('確認文のボタンは実際の遷移を具体的に表す', () => {
    const warEffort = read('js/war_effort.js');
    const independence = read('js/independence_system.js');
    assert.strictEqual((warEffort.match(/okText: '終了する', cancelText: '続ける'/g) || []).length, 2, '捕虜の登用・処断フェーズ終了確認は終了/続行を具体表示する');
    assert.ok(independence.includes("{ okText: 'この勢力を操作', cancelText: '戻る' }"), '独立後の担当勢力確認は一段前へ戻る意味を戻ると表示する');
});

test('共通会話は強制モーダルリセットを世代境界として古い非同期処理を破棄する', () => {
    const ui = read('js/ui.js');
    assert.ok(ui.includes('this._dialogGeneration = 0;'), '会話表示世代をUIManagerが所有する');
    assert.ok(ui.includes('this._dialogAutoCloseTimer = null;'), '現在の自動閉じtimerをUIManagerが追跡する');

    const processAt = ui.indexOf('async processDialogQueue()');
    const resetAt = ui.indexOf('forceResetModals(options = {})');
    const processBlock = ui.slice(processAt, resetAt);
    assert.ok(processBlock.includes('const dialogGeneration = Number(this._dialogGeneration || 0);'), '各会話処理は開始時の世代を固定する');
    assert.ok(processBlock.includes('if (dialogGeneration !== Number(this._dialogGeneration || 0)) return;'), '顔画像decode後に古い世代ならDOMへ戻らない');
    assert.ok(processBlock.includes('this._dialogAutoCloseTimer = autoCloseTimer;'), '自動閉じtimerを強制リセットから破棄できる');
    assert.ok(processBlock.includes('if (this._dialogAutoCloseTimer === autoCloseTimer) this._dialogAutoCloseTimer = null;'), '通常完了でもtimer参照を残さない');

    const resetBlock = ui.slice(resetAt, resetAt + 2200);
    assert.ok(resetBlock.includes('this._dialogGeneration = Number(this._dialogGeneration || 0) + 1;'), '強制リセットで旧decode/timer世代を無効化する');
    assert.ok(resetBlock.includes('this._cancelDialogHandoffClose();'), '旧handoffの閉じ予約を残さない');
    assert.ok(resetBlock.includes('clearTimeout(this._dialogAutoCloseTimer);'), '旧自動閉じtimerを破棄する');
    assert.ok(resetBlock.includes('this.dialogQueue = [];'), '旧会話キューを新しい画面へ持ち越さない');
    assert.ok(resetBlock.includes('this.isDialogShowing = false;'), '内部の表示中フラグも戻し次の会話を開始可能にする');
    assert.ok(resetBlock.includes('this._currentEventClickHandler = null;'), '旧イベント送りhandlerの固定DOM参照を解放する');
});

test('委任一覧の一括ボタンは遅延bindせず現在の固定DOMへ直接結び付ける', () => {
    const info = read('js/ui_info.js');
    const start = info.indexOf('\n    _renderDelegateList(scrollPos = 0)');
    const end = info.indexOf('\n    showDelegateSettingModal(', start);
    const block = info.slice(start, end);
    assert.ok(block.includes("const toggleAllBtn = document.getElementById('btn-toggle-all-delegate');"));
    assert.ok(block.includes('toggleAllBtn.onclick = () => {'));
    assert.ok(!block.includes('setTimeout('), '同期生成済みの一括ボタンへ旧timer経由でbindしない');
});


test('カットインは固定overlayの旧timerを世代境界で次画面へ作用させない', () => {
    const ui = read('js/ui.js');
    assert.ok(ui.includes('this._cutinGeneration = 0;'), 'カットイン世代をUIManagerが所有する');
    const cutinAt = ui.indexOf('showCutin(msg)');
    const scenarioAt = ui.indexOf('showScenarioSelection(', cutinAt);
    const cutinBlock = ui.slice(cutinAt, scenarioAt);
    assert.ok(cutinBlock.includes('this._cutinGeneration = Number(this._cutinGeneration || 0) + 1;'), '新しいカットイン開始で前世代を無効化する');
    assert.ok(cutinBlock.includes('const cutinGeneration = this._cutinGeneration;'), '各カットインは開始世代を固定する');
    assert.strictEqual((cutinBlock.match(/cutinGeneration !== Number\(this\._cutinGeneration \|\| 0\)/g) || []).length, 2, 'fade-outとhiddenの両段階で旧世代を拒否する');
    assert.ok(cutinBlock.includes("this.cutinOverlay.classList.remove('hidden', 'fade-out');"), '次の表示開始時に旧fade-out状態も掃除する');

    const resetAt = ui.indexOf('forceResetModals(options = {})');
    const resetBlock = ui.slice(resetAt, resetAt + 900);
    assert.ok(resetBlock.includes('this._cutinGeneration = Number(this._cutinGeneration || 0) + 1;'), '強制リセットもカットイン寿命境界にする');
});

test('攻城戦メッセージの遅延callbackと数値更新は次の戦況・次の戦闘へ持ち越さない', () => {
    const ui = read('js/ui.js');
    assert.ok(ui.includes('this._warActionMessageGeneration = 0;'), '戦況メッセージ世代をUIManagerが所有する');

    const showAt = ui.indexOf('showWarActionMessage(messages, onClick)');
    const damageAt = ui.indexOf('\n    playDamageAnimation(data', showAt);
    const showBlock = ui.slice(showAt, damageAt);
    assert.ok(showBlock.includes('this._warActionMessageGeneration = Number(this._warActionMessageGeneration || 0) + 1;'), '新しい戦況表示で旧timerを無効化する');
    assert.ok(showBlock.includes('const isCurrentWarAction = () => warActionGeneration === Number(this._warActionMessageGeneration || 0);'), '遅延callbackは現在世代を確認する');
    assert.ok(showBlock.includes('setTimeout(() => { if (isCurrentWarAction()) onClick(); }, 300);'), '早送り後callbackは旧戦況から発火しない');
    assert.ok(showBlock.includes('if (isCurrentWarAction() && !isFinished)'), '自動送り完了も旧戦況から発火しない');

    const damageEnd = ui.indexOf('\n    updateWarUI()', damageAt);
    const damageBlock = ui.slice(damageAt, damageEnd);
    assert.ok(damageBlock.includes('if (!isCurrentWarAction()) return;'), '旧ダメージ演出は開始時点で拒否する');
    assert.ok(damageBlock.includes('if (!isCurrentWarAction()) return;\n                const updateTxt'), '400ms後の旧currentStatsを固定DOMへ書き戻さない');
    assert.ok(damageBlock.includes("if (isCurrentWarAction()) window.AudioManager.playSE('bow_hit001.mp3')"), '連続弓SEも戦況終了後へ持ち越さない');

    const visibleAt = ui.indexOf('setWarModalVisible(visible)');
    const visibleEnd = ui.indexOf('\n    clearWarLog()', visibleAt);
    const visibleBlock = ui.slice(visibleAt, visibleEnd);
    assert.ok(visibleBlock.includes('this._warActionMessageGeneration = Number(this._warActionMessageGeneration || 0) + 1;'), '攻城戦画面を閉じる時も旧timerを無効化する');

    const resetAt = ui.indexOf('forceResetModals(options = {})');
    const resetBlock = ui.slice(resetAt, resetAt + 1000);
    assert.ok(resetBlock.includes('this._warActionMessageGeneration = Number(this._warActionMessageGeneration || 0) + 1;'), '強制リセットも戦況メッセージ寿命境界にする');
});


test('スマホ観戦の戦争・独立は全城再描画を演出直後に重ねず局所反映へ寄せる', () => {
    const uiMap = read('js/ui_map.js');
    const independence = read('js/independence_system.js');
    const warEffort = read('js/war_effort.js');
    const turnManager = read('js/turn_manager.js');

    assert.ok(uiMap.includes("el.setAttribute('data-castle-id', String(c.id));"), '既存城カードをIDで局所更新できる');
    assert.ok(uiMap.includes('refreshCastleOwnershipPresentation(castleIds = [])'), '所有変更の局所反映窓口をUI地図へ置く');
    assert.ok(uiMap.includes('this.updateCastleGlows();') && uiMap.includes('this.updateClanColors();'), '局所反映後も光彩と勢力色を現在状態へ同期する');

    const indAt = independence.indexOf("this.game.writeSystemDiagnostic('independence:capture_done')");
    const indEnd = independence.indexOf('// ★追加：自分の担当大名家から独立', indAt);
    const indBlock = independence.slice(indAt, indEnd);
    assert.ok(indBlock.includes('const isMobileWatch = !!('), '独立はスマホ観戦を低メモリ経路として判定する');
    assert.ok(indBlock.includes('this.game.ui.refreshCastleOwnershipPresentation(changedCastleIds);'), '独立直後は変更城だけを局所反映する');
    assert.ok(indBlock.includes("this.game.writeSystemDiagnostic('independence:render_light_done');"), '実機停止位置で軽量描画到達を識別できる');

    const warAt = warEffort.indexOf('// AI戦争終了時のフルrenderMap()');
    const warEnd = warEffort.indexOf('if (this.state.isPlayerInvolved)', warAt);
    const warBlock = warEffort.slice(warAt, warEnd);
    assert.ok(warBlock.includes('const isMobileWatch = !!('), 'AI戦争終了もスマホ観戦を低メモリ経路へ入れる');
    assert.ok(warBlock.includes('this.game.ui.refreshCastleOwnershipPresentation(changedCastleIds);'), '戦争後も出撃元/防御拠点だけを局所反映する');

    const monthAt = turnManager.indexOf("game.writeSystemDiagnostic('month_start:operations_done');");
    const queueAt = turnManager.indexOf('game.currentIndex = 0;', monthAt);
    const monthBlock = turnManager.slice(monthAt, queueAt);
    assert.ok(monthBlock.includes("game.writeSystemDiagnostic('month_start:watch_map_refresh:start');"), '延期したフル描画は月初安全地点で開始を記録する');
    assert.ok(monthBlock.includes('game.ui.releaseMobileTransientMapResources();'), '完全再描画前に非必須モバイル地図資源を解放する');
    assert.ok(monthBlock.includes('game.ui.renderMap();'), '月初安全地点では最大1回の完全再描画を行う');
    assert.ok(monthBlock.includes("console.warn('観戦中の月次地図再描画を延期しました:'"), '描画例外でゲーム進行を止めず次回へ持ち越す');
});

test('AI月次作戦は大勢力の探索順を変えずスマホへ定期的に制御を返す', () => {
    const ops = read('js/ai_operation.js');
    const genAt = ops.indexOf('async generateOperation(clanId, legionId)');
    const nextAt = ops.indexOf('\n    async updateOperation(', genAt);
    const block = ops.slice(genAt, nextAt);
    assert.ok(block.includes('let scannedOperationBases = 0;'), '出撃元走査数をローカルに数える');
    assert.ok(block.includes('scannedOperationBases % 4 === 0'), 'スマホは複数出撃元ごとに息継ぎする');
    assert.ok(block.includes('await new Promise(resolve => setTimeout(resolve, 0));'), '同期CPU占有をイベントループへ返す');
    assert.ok(block.includes('let queueHead = 0;'), 'BFSキューはhead indexで順序を維持する');
    assert.ok(block.includes('const currentData = queue[queueHead++];'), 'shiftによる配列再配置を避ける');
    assert.ok(!block.includes('const currentData = queue.shift();'), '攻撃候補BFSにshiftを残さない');

    assert.ok(ops.includes('month_start:operations:clan_${clan.id}:diplomacy_done'), '勢力内の外交処理完了を実機診断できる');
    assert.ok(ops.includes('month_start:operations:clan_${clan.id}:legion_${legionId}:${operationAction}_start'), '軍団ごとの作戦生成/更新開始を識別できる');
    assert.ok(ops.includes('month_start:operations:clan_${clan.id}:legion_${legionId}:operation_done'), '軍団作戦完了まで到達したか識別できる');
    assert.ok(ops.includes('captureTurnFlowGeneration'), '月次作戦自身もロード/タイトル復帰のturn-flow寿命を読む');
    assert.ok(ops.includes('if (!isCurrentFlow()) return;'), '内部yield後に旧月次作戦を続けない');
    assert.ok(ops.includes('month_start:operations:clan_${clan.id}:legion_${legionId}:draft_base_start'), '作戦完了後と徴兵拠点探索中を診断で分ける');
    assert.ok(ops.includes('month_start:operations:clan_${clan.id}:legion_${legionId}:draft_base_done'), '徴兵拠点探索完了まで到達したか識別できる');
    assert.ok(ops.includes('this.selectDraftBase(clan.id, legionId, myLegionCastles);'), '同じ軍団城配列を再利用して再filterを避ける');
    assert.ok(ops.includes('selectDraftBase(clanId, legionId, precomputedLegionCastles = null)'), '徴兵拠点選定は既存集合を任意利用できる');
});

test('災害と独立の停止診断は会話待ちの前後と災害会話内部段階を区別する', () => {
    const events = read('js/event/common_events.js');
    const ui = read('js/ui.js');
    const independence = read('js/independence_system.js');
    assert.ok(events.includes('fx.writeDiag(game, `${diagPrefix}:dialog_done`);'), '災害初回会話の完了checkpointを残す');
    assert.ok(events.includes('{ diagnosticPrefix: diagPrefix }'), '災害会話だけ共通Dialogへ診断prefixを渡す');
    assert.ok(ui.includes('`${diagnosticPrefix}:dialog_rendered`'), '固定dialog DOMが表示された地点を識別する');
    assert.ok(ui.includes('`${diagnosticPrefix}:dialog_autoclose_armed`'), '観戦自動閉じtimer設定まで到達したか識別する');
    assert.ok(ui.includes('`${diagnosticPrefix}:dialog_autoclose_fire`'), '自動閉じtimer発火まで到達したか識別する');
    assert.ok(independence.includes("this.game.writeSystemDiagnostic('independence:post_render');"), '独立描画後の次処理到達を記録する');
    assert.ok(independence.includes("this.game.writeSystemDiagnostic('independence:result_dialog_start');"), '独立結果会話の開始を記録する');
    assert.ok(independence.includes("this.game.writeSystemDiagnostic('independence:result_dialog_done');"), '独立結果会話の完了を記録する');
});


test('武将一覧から詳細への遷移は背景軽量化を二重実行せず軽い一覧キャッシュを再利用する', () => {
    const ui = read('js/ui.js');
    const bushoUi = read('js/ui_info_busho.js');

    const pauseAt = ui.indexOf('pauseBackgroundUpdates() {');
    const resumeAt = ui.indexOf('resumeBackgroundUpdates(', pauseAt);
    const pauseBlock = ui.slice(pauseAt, resumeAt);
    assert.ok(pauseBlock.includes('if (this.isBackgroundPaused) return;'), '背景停止済みの一覧→詳細でCanvas解放を重ねない');
    assert.ok(pauseBlock.indexOf('if (this.isBackgroundPaused) return;') < pauseBlock.indexOf("document.body.classList.add('background-paused')"), '冪等判定はbody class/Canvas操作より先に行う');

    const releaseAt = bushoUi.indexOf('_releaseBushoSelectorTransientStateForDetail()');
    const detailAt = bushoUi.indexOf('showBushoDetailModal(busho)', releaseAt);
    const releaseBlock = bushoUi.slice(releaseAt, detailAt);
    assert.ok(releaseBlock.includes("this._invalidateListItemsCache('busho');"), 'DOM寄りの行HTMLキャッシュは詳細前に捨てる');
    assert.ok(releaseBlock.includes('this._bushoSelectorContext = null;'), '一覧クリック用コンテキストは詳細へ持ち込まない');
    assert.ok(!releaseBlock.includes('this.bushoSavedBushos = null;'), '候補参照配列は戻り再描画用に保持する');
    assert.ok(!releaseBlock.includes('this.bushoSavedSortedBushos = null;'), 'ソート済み参照配列は戻り再ソート回避のため保持する');
    assert.ok(!releaseBlock.includes('this.bushoSavedData = null;'), 'SelectorDataを詳細往復だけで再問い合わせしない');
});

test('全国武将一覧の身分順は正本Rulesの短命contextで軍団走査を再利用する', () => {
    const rules = read('js/busho_list_sort_rules.js');
    const bushoUi = read('js/ui_info_busho.js');
    assert.ok(rules.includes('static createClanRankContext(game) {'), '身分規則の正本側が短命context生成を担当する');
    assert.ok(rules.includes('const commanderIdSet = new Set();'), '国主IDを一同期処理だけSet化する');
    assert.ok(rules.includes('return { commanderIdSet, rankById: new Map() };'), '身分値も一同期処理だけMapへ保存する');
    assert.ok(rules.includes("const context = key === 'rank' ? this.createClanRankContext(game) : null;"), '共通身分ソートも同じcontextを一回だけ作る');
    assert.ok(rules.includes('this.getClanRank(game, a, context) - this.getClanRank(game, b, context)'), '比較中は正本の身分値cacheを共有する');
    assert.ok(rules.includes('context.commanderIdSet instanceof Set'), 'context利用時は軍団全走査を避ける');
    assert.ok(rules.includes('game.legions.some('), 'contextなしの互換fallbackは正本に残す');

    const rankAt = bushoUi.indexOf('let clanRankContext = null;');
    const accAt = bushoUi.indexOf('let acc = null;', rankAt);
    const rankBlock = bushoUi.slice(rankAt, accAt);
    assert.ok(rankAt >= 0, '全国一覧は同期描画中だけRules contextを保持する');
    assert.ok(rankBlock.includes('BushoListSortRules.createClanRankContext(this.game)'), '全国一覧も正本Rulesからcontextを得る');
    assert.ok(rankBlock.includes('BushoListSortRules.getClanRank(this.game, b, getClanRankContext())'), '身分の意味をUI側へ複製しない');
    assert.ok(rankBlock.includes('const allRankCache = new Map();'), '全国用グループ並び値だけUIの短命Mapへ保存する');
    assert.ok(!rankBlock.includes('game.legions.some('), '全国一覧の比較経路から全軍団someを除く');

    const detailRankMatches = (bushoUi.match(/const bushoRankName = StatPresenter\.getBushoRankName\(busho, this\.game\);/g) || []).length;
    assert.strictEqual(detailRankMatches, 1, '武将詳細の身分文字列は1描画につき一度だけ算出する');
    assert.ok((bushoUi.match(/\$\{bushoRankName\}/g) || []).length >= 2, 'PC/スマホ表示で同じ身分結果を共用する');
});

test('武将一覧の選択同期は仮想一覧DOMだけを走査する', () => {
    const bushoUi = read('js/ui_info_busho.js');
    const at = bushoUi.indexOf('_updateBushoSelectorUI()');
    const end = bushoUi.indexOf('handleBushoSelect(', at);
    const block = bushoUi.slice(at, end);
    assert.ok(block.includes("const selectorList = (this.ui && this.ui.selectorList) || document.getElementById('selector-list');"), '現在のSelector一覧を走査起点にする');
    assert.ok(block.includes("selectorList.querySelectorAll('input[name=\"sel_busho\"]')"), '表示中の武将inputだけ同期する');
    assert.ok(!block.includes("document.querySelectorAll('input[name=\"sel_busho\"]')"), 'document全体を毎選択で走査しない');
});


test('野戦の遅延callbackとawait継続は戦闘世代をまたいで次の戦闘へ触れない', () => {
    const field = read('js/field_war.js');
    assert.ok(field.includes('this._fieldWarGeneration = 0;'));
    assert.ok(field.includes('_scheduleFieldWarCallback(callback, delay = 0, requireActive = true)'));
    assert.ok(field.includes('const fieldWarGeneration = this._beginFieldWarLifecycle();'));
    assert.ok(field.includes("if (!this._isFieldWarLifecycleCurrent(fieldWarGeneration, false)) return;"));
    assert.ok(field.includes("if (!this._isFieldWarLifecycleCurrent(fieldWarGeneration)) return;"));
    assert.ok(field.includes('abortForScenarioTransition()'));
    assert.ok(field.includes('nextPhaseTurn() {\n        if (!this.active) return;'));
    assert.ok(field.includes('this._scheduleFieldWarCallback(() => this.processAITurn(), 600);'));
    assert.ok(field.includes('this._scheduleFieldWarCallback(() => this.nextPhaseTurn(), 300);'));
    assert.ok(field.includes('}, 1500, false);'));

    const game = read('js/game.js');
    const ui = read('js/ui.js');
    const save = read('js/save_manager.js');
    assert.ok(game.includes('this.fieldWarManager.abortForScenarioTransition();'), '新規開始で旧野戦寿命を終了する');
    assert.ok(ui.includes('this.game.fieldWarManager.abortForScenarioTransition();'), 'タイトル復帰で旧野戦寿命を終了する');
    assert.ok(save.includes('this.game.fieldWarManager.abortForScenarioTransition();'), 'ロードで旧野戦寿命を終了する');
});

test('全武将行動済み確認は遅延中にターン状態を再検証して多重表示しない', () => {
    const turn = read('js/turn_manager.js');
    const at = turn.indexOf('checkAllActionsDone()');
    const block = turn.slice(at, at + 2600);
    assert.ok(block.includes('if (this._allActionsDonePromptTimer) return;'));
    assert.ok(block.includes('const expectedCastleId = Number(c.id);'));
    assert.ok(block.includes('const expectedTurnIndex = Number(game.currentIndex);'));
    assert.ok(block.includes("if (game.phase !== 'game' || game.isProcessingAI || game.selectionMode != null) return;"));
    assert.ok(block.includes('Number(currentCastle.id) !== expectedCastleId'));
    assert.ok(block.includes('Number(game.currentIndex) !== expectedTurnIndex'));
    assert.ok(block.includes('game.fieldWarManager && game.fieldWarManager.active'));
    assert.ok(block.includes('!currentBushos.every(b => b.isActionDone)'));
    assert.ok(turn.includes('this._cancelAllActionsDonePromptTimer();'), '月/ターン寿命境界で保留確認を破棄する');
});

test('攻城戦の援軍消滅アニメーションは固定カード再利用時に旧timerを持ち越さない', () => {
    const ui = read('js/ui.js');
    const cancelAt = ui.indexOf('\n    _cancelEmptyCardAnimation(card) {');
    const applyAt = ui.indexOf('\n    applyEmptyCardAnimation(card) {');
    assert.ok(cancelAt >= 0 && applyAt >= 0);
    const cancelBlock = ui.slice(cancelAt, cancelAt + 700);
    const applyBlock = ui.slice(applyAt, applyAt + 2100);
    assert.ok(cancelBlock.includes('card._emptyCardAnimationGeneration'));
    assert.ok(cancelBlock.includes('clearTimeout(card._emptyCardAnimationTimer)'));
    assert.ok(cancelBlock.includes("card.querySelectorAll('.empty-cover-overlay')"));
    assert.ok(applyBlock.includes('const animationGeneration = card._emptyCardAnimationGeneration;'));
    assert.ok(applyBlock.includes('animationGeneration !== card._emptyCardAnimationGeneration'));
    assert.ok(applyBlock.includes('card._emptyCardAnimationTimer = setTimeout'));

    const warCloseAt = ui.indexOf('setWarModalVisible(visible)');
    const warCloseBlock = ui.slice(warCloseAt, warCloseAt + 3000);
    assert.ok(warCloseBlock.includes('this._cancelEmptyCardAnimation(card);'), '攻城戦固定DOMを閉じる時に旧アニメーションを破棄する');
    const reinfAt = ui.indexOf("const updateReinfCardUI = (prefix, reinfData, fallbackClanId) => {");
    const reinfBlock = ui.slice(reinfAt, reinfAt + 5000);
    assert.ok(reinfBlock.includes('this._cancelEmptyCardAnimation(card);'), '同じ固定カードへ援軍を再表示する前に旧timerを破棄する');
});


test('攻城戦の進行timerは戦争世代をまたいで次の戦争や次ターンへ触れない', () => {
    const war = read('js/war.js');
    const effort = read('js/war_effort.js');
    assert.ok(war.includes('this._warGeneration = 0;'));
    assert.ok(war.includes('_scheduleWarCallback(callback, delay = 0, requireActive = true)'));
    assert.ok(war.includes('abortForScenarioTransition()'));
    assert.ok(war.includes('this._scheduleWarCallback(() => this.execWarAI(), 800);'));
    assert.ok(war.includes('this._scheduleWarCallback(() => this.resolveWarAction(action.type, action.extraVal), 0);'));
    assert.ok(war.includes('this._scheduleWarCallback(() => { this.resolveAutoWar(); }, 100);'));
    assert.ok(effort.includes('const warGeneration = this._beginWarLifecycle();'));
    assert.ok(effort.includes('if (!this._isWarLifecycleCurrent(warGeneration, false)) return;'));
    assert.ok(effort.includes('this._scheduleWarCallback(() => {'));
    assert.ok(effort.includes('}, 100, false);'), '戦後の威信更新とfinishTurnも旧戦争世代では実行しない');
    assert.ok(effort.includes('if (!this.state.active || this._warEnding) return;'), '終了処理の多重開始も同期的に防ぐ');
});


test('旧ターンの0ms継続はタイトル・ロード後にphase境界を越えて進行しない', () => {
    const turn = read('js/turn_manager.js');
    const processAt = turn.indexOf('async processTurn()');
    const processBlock = turn.slice(processAt, processAt + 900);
    assert.ok(processBlock.includes("if (game.phase !== 'game' || game.isRestoringSave) return;"));
    const finishAt = turn.indexOf('async finishTurn()');
    const finishBlock = turn.slice(finishAt, finishAt + 500);
    assert.ok(finishBlock.includes("if (game.phase !== 'game' || game.isRestoringSave) return;"));
});


test('戦後closeWarは開始時の戦争世代を固定しafter_war後も未定義参照で停止しない', () => {
    const effort = read('js/war_effort.js');
    const at = effort.indexOf('async closeWar()');
    const block = effort.slice(at, at + 8000);
    assert.ok(block.includes('const warGeneration = Number(this._warGeneration || 0);'), 'closeWar開始時に戦争世代をローカルへ固定する');
    assert.ok(block.includes("await this.game.eventManager.processEvents('after_war', this.state);"), 'after_war完了を待つ');
    assert.ok(block.includes('if (!this._isWarLifecycleCurrent(warGeneration, false)) return;'), 'await後は同じ戦争世代か再確認する');
    assert.ok(block.includes('this._markWarClosed(warGeneration);'), '通常ターン復帰完了後をWarManager自身から通知する');
});

test('戦後endWarはイベント・結果待ち後に旧戦争世代を継続しない', () => {
    const effort = read('js/war_effort.js');
    const at = effort.indexOf('async endWar(attackerWon');
    const end = effort.indexOf('processCaptures(defeatedCastle', at);
    const block = effort.slice(at, end);
    assert.ok(block.includes('const isCurrentWar = () => this._isWarLifecycleCurrent(warGeneration, false);'), 'endWar全体で同じ戦争世代を正本にする');
    assert.ok(block.includes("await this.game.eventManager.processEvents('after_battle_blink', eventContext);\n                if (!isCurrentWar()) return;"), '戦闘直後イベント待ち後に旧戦争を止める');
    assert.ok(block.includes("await this.game.eventManager.processEvents('after_siege_war', s);\n                    if (!isCurrentWar()) return;"), '籠城戦後イベント待ち後に旧戦争を止める');
    assert.ok(block.includes('await this.autoResolvePrisoners(this.pendingPrisoners, winnerClan);\n                        if (!isCurrentWar()) return;'), 'AI捕虜処遇待ち後に旧戦争を止める');
    assert.ok(block.includes('await this.game.lifeSystem.checkClanExtinction'), '滅亡判定の非同期完了を待つ');
    assert.ok(block.includes('await this.game.ui.showDialogAsync(aiResultMsg);\n                    if (!isCurrentWar()) return;'), 'AI結果会話待ち後に旧戦争を止める');
    assert.ok(block.includes('await finishWarProcess();'), 'AI戦後処理は未監視Promiseとして投げっぱなしにしない');
    assert.ok(block.includes('} catch (e) {\n            if (!isCurrentWar()) return;'), '旧戦争由来の例外から新シナリオのfinishTurnへ進まない');
});

test('諸勢力戦の完了待ちはWarManagerの世代Promiseを使いcloseWar上書きとDOMポーリングを残さない', () => {
    const war = read('js/war.js');
    const kunishu = read('js/kunishu_system.js');
    assert.ok(war.includes('waitForWarClose(generation = this.getCurrentWarGeneration())'));
    assert.ok(war.includes('this._warCloseWaiters = new Map();'));
    assert.ok(war.includes('_resolveWarCloseWaiters(null, false);'), '新戦争・シナリオ遷移で旧完了待ちを解放する');
    assert.ok(kunishu.includes('await this.game.warManager.waitForWarClose(uprisingWarGeneration);'), '蜂起は専門Managerの完了通知を待つ');
    assert.ok(kunishu.includes('await this.game.warManager.waitForWarClose(subjugationWarGeneration);'), '鎮圧も同じ完了通知を使う');
    assert.ok(!kunishu.includes('this.game.warManager.closeWar = function'), '固定ManagerのcloseWarを一時上書きしない');
    assert.ok(!kunishu.includes('while (!isWarReallyFinished)'), '500msのDOMポーリングを完了判定へ使わない');
});

test('スマホAI観戦の月次所属変化は途中の全国renderMapを安全地点へ集約する', () => {
    const life = read('js/life_system.js');
    const independence = read('js/independence_system.js');
    const events = read('js/event/common_events.js');
    assert.ok(life.includes('_shouldDeferMapRefreshForMobileWatch()'));
    assert.ok(life.includes('this.game._aiDeferredMapRefresh = true;'));
    assert.ok(life.includes('this._requestMapRefresh({ updatePanelHeader: true });'), '年初改名の地図更新も共通軽量窓口へ寄せる');
    assert.ok(life.includes('this._requestMapRefresh();'), '大名継承の地図更新も共通軽量窓口へ寄せる');
    assert.ok(independence.includes("this.game.writeSystemDiagnostic('rebellion:map:mobile_watch_deferred'"), '月末謀反の全国再描画も延期する');
    assert.ok(events.includes("game.writeSystemDiagnostic('subordination:map:mobile_watch_deferred');"), 'AI臣従の全国再描画も延期する');
});

test('スマホ観戦の災害・イベント画面更新は専用演出後の重い再描画を月初安全地点へまとめる', () => {
    const historical = read('js/event/historical_event.js');
    const events = read('js/event/common_events.js');
    assert.ok(historical.includes("game.writeSystemDiagnostic(isMobileWatch ? 'event_refresh:map:mobile_watch_deferred' : 'event_refresh:map:deferred')"));
    assert.ok(events.includes("game.writeSystemDiagnostic('event:startMonth_before:heavy_snow_trigger:snow_overlay_deferred');"));
    const heavyAt = events.indexOf('id: "heavy_snow_trigger"');
    const heavyBlock = events.slice(heavyAt, heavyAt + 7500);
    assert.ok(heavyBlock.includes('const isMobileWatch = !!('));
    assert.ok(heavyBlock.includes('game._aiDeferredMapRefresh = true;'));
    assert.ok(heavyBlock.includes("if (game.ui && game.ui.updateSnowOverlay && (!game.isProcessingAI || (game.isWatchMode && !isMobileWatch)))"), 'PC観戦と非AI時の即時雪Canvas更新を維持する');
});


test('諸勢力戦の完了Promiseは100ms後のfinishTurn完了まで待つ', () => {
    const effort = read('js/war_effort.js');
    const at = effort.indexOf('async closeWar()');
    const block = effort.slice(at, at + 7200);
    assert.ok(block.includes('let closeCompletionScheduled = false;'), 'close本体とターン復帰予約の完了地点を区別する');
    assert.ok(block.includes("this.game.writeSystemDiagnostic('war:turn_return:start'"), '戦後ターン復帰開始を診断できる');
    assert.ok(block.includes('Promise.resolve(this.game.finishTurn())'), 'finishTurnの非同期完了を待つ');
    const finishAt = block.indexOf('Promise.resolve(this.game.finishTurn())');
    const markAt = block.indexOf('this._markWarClosed(warGeneration);', finishAt);
    assert.ok(finishAt >= 0 && markAt > finishAt, '正常系closed通知はfinishTurn完了側に置く');
    assert.ok(block.includes('if (!closeCompletionScheduled) {'), '予約前の例外だけfinallyから待機を解放する');
});

test('AI武将移動計画は拠点人数を短命Mapで一度だけ集計する', () => {
    const staffing = read('js/ai_staffing.js');
    const countAt = staffing.indexOf('_getActiveClanBushoCount(castle');
    const countBlock = staffing.slice(countAt, countAt + 1200);
    assert.ok(countBlock.includes('for (const id of castle.samuraiIds)'), '人数だけの経路はsamuraiIdsを直接数える');
    assert.ok(!countBlock.includes('this._getActiveClanBushosInCastle(castle, clanId).length'), '人数取得のための一時配列生成を残さない');
    assert.ok(countBlock.includes('window.LifeStatusRules.isPresent(b)'), '未登場・死亡除外の従来集合を維持する');
    assert.ok(countBlock.includes('window.BushoStatusRules.isActive(b)'), '活動中条件を維持する');

    const planAt = staffing.indexOf('planMoveAction(castle, availableBushos, reachableMyCastles)');
    const planEnd = staffing.indexOf('/** 四半期の全国AI人事。', planAt);
    const planBlock = staffing.slice(planAt, planEnd);
    assert.ok(planBlock.includes('const activeClanBushoCountByCastleId = new Map();'), '1計画内だけの人数Mapを作る');
    assert.ok(planBlock.includes('const getActiveClanBushoCount = (c) => activeClanBushoCountByCastleId.get('), '候補評価は短命Mapを読む');
    assert.ok(!planBlock.includes('this._getActiveClanBushoCount(target, clanId)'), '候補武将×移動先ごとの再集計をしない');
});

test('四半期AI人事は実機停止位置を勢力単位で診断する', () => {
    const turn = read('js/turn_manager.js');
    const staffing = read('js/ai_staffing.js');
    assert.ok(turn.includes("game.writeSystemDiagnostic('month_start:staffing:start');"), 'AI人事開始地点を月初診断へ残す');
    assert.ok(staffing.includes('this.game.writeSystemDiagnostic(`month_start:staffing:clan_${clan.id}`);'), '停止時に処理中勢力を識別できる');
});


test('仮想一覧のカスタムスクロールはドラッグ中だけsnapを止め終了取りこぼしで自走しない', () => {
    const scroll = read('js/custom_scrollbar.js');
    const css = read('css/style.css');
    assert.ok(css.includes('scroll-snap-type: y mandatory;'), '通常の行スナップ表示は維持する');
    assert.ok(scroll.includes('_suspendScrollSnapForDrag()'));
    assert.ok(scroll.includes("this.list.style.scrollSnapType = 'none';"), 'つまみドラッグ中だけmandatory snapを止める');
    assert.ok(scroll.includes('_restoreScrollSnapAfterDrag()'));
    assert.ok(scroll.includes('raf(() => raf(() => {'), '仮想DOMが現在scrollTopへ追随してからsnapを戻す');
    assert.ok(scroll.includes("document.addEventListener('touchend', this.onEnd, true);"), 'touchendをcaptureで拾う');
    assert.ok(scroll.includes("document.addEventListener('touchcancel', this.onEnd, true);"), 'touchcancelも終了扱いにする');
    assert.ok(scroll.includes("window.addEventListener('blur', this.onEnd, true);"), '画面フォーカス喪失も終了境界にする');
    assert.ok(scroll.includes("document.addEventListener('visibilitychange', this.onVisibilityChange, true);"), 'アプリ非表示でもドラッグ状態を残さない');
    assert.ok(scroll.includes('candidate.identifier === this._activeTouchId'), '開始した指以外のtouchmoveをドラッグへ流用しない');
    assert.ok(scroll.includes('Math.max(0, Math.min(maxScrollTop, nextScrollTop))'), '古いWebViewでもscrollTopを有効範囲外へ押し出さない');
});


test('タッチ入力の仮想一覧はPCレイアウトのタブレットでもnative mandatory snapを使わない', () => {
    const info = read('js/ui_info.js');
    const scroll = read('js/custom_scrollbar.js');
    const at = info.indexOf('const useManagedMobileSnap = isTouchInput;');
    const block = info.slice(at, at + 7200);
    assert.ok(at >= 0);
    assert.ok(block.includes("listContainer.style.scrollSnapType = 'none';"), 'タッチ入力の仮想一覧はnative snapを無効化する');
    assert.ok(block.includes("listContainer.dataset.virtualManagedSnap = 'true';"), 'CustomScrollbarへmanaged snap中であることを明示する');
    assert.ok(block.includes('const scheduleManagedRowSnap = (delay = 120) => {'));
    assert.ok(block.includes('Math.round(currentScrollTop / rowHeight) * rowHeight'), '停止後に最寄り行へ一回だけ補正する');
    assert.ok(block.includes('listContainer.scrollTop = snappedScrollTop;'), 'smooth連続移動ではなく即時1回で確定する');
    assert.ok(block.includes('if (scrollbar && scrollbar.isDraggingY) return;'), 'つまみを掴んでいる間は行補正を割り込ませない');
    assert.ok(block.includes('clearTimeout(managedSnapTimer)'), '一覧破棄時に補正timerを残さない');
    assert.ok(block.includes('listContainer.style.scrollSnapType = previousInlineScrollSnapType;'), '仮想一覧を離れたら通常一覧のCSS snap契約へ戻す');

    const suspendAt = scroll.indexOf('_suspendScrollSnapForDrag()');
    const suspendBlock = scroll.slice(suspendAt, suspendAt + 1700);
    assert.ok(suspendBlock.includes("this.list.dataset.virtualManagedSnap === 'true'"), 'managed snap一覧ではドラッグ終了時にnative mandatoryを復帰させない');
    const endAt = scroll.indexOf('this.onEnd = () => {');
    const endBlock = scroll.slice(endAt, endAt + 1200);
    assert.ok(endBlock.includes("typeof this.list._scheduleVirtualRowSnap === 'function'"), '最後のmoveから時間が空いても指を離した地点から一回補正を予約する');
    assert.ok(scroll.includes('if (e.touches && e.touches.length !== 1) return;'), '最初から複数指ならつまみドラッグを開始しない');
});

test('スマホAI観戦の災害地方表示はベースへ事前合成し2枚目CanvasとrAF必須待ちを避ける', () => {
    const events = read('js/event/common_events.js');
    const baseAt = events.indexOf('const createLightweightBaseCanvas = (game, options = {}) => {');
    const overlayAt = events.indexOf('const createOverlay = async (game, options = {}) => {', baseAt);
    const baseBlock = events.slice(baseAt, overlayAt);
    assert.ok(baseBlock.includes('const precompositeEffect = options.precompositeEffect || null;'));
    assert.ok(baseBlock.includes('effectProvIds.has(pid)'), '対象国だけを軽量ベースCanvasへ直接合成する');
    assert.ok(baseBlock.includes('effectAlpha + baseR * effectInvAlpha'), '従来半透明effectのsource-over相当で色を焼き込む');

    const at = events.indexOf('window.playProvinceMapEffect = async function');
    const end = events.indexOf('// ==========================================\n// ★ 面談', at);
    const block = events.slice(at, end);
    assert.ok(block.includes('precompositeEffect: isMobileWatch ? { affectedProvIds, color: effectColor } : null'));
    assert.ok(block.includes('overlayParts.effectPrecomposited'), 'スマホ観戦は1枚Canvas経路へ入る');
    assert.ok(block.includes('`${diagPrefix}:mask_mobile_watch_single_canvas`'));
    assert.ok(block.includes('`${diagPrefix}:mask_mobile_watch_static`'));
    assert.ok(block.includes('`${diagPrefix}:mask_mobile_watch_yield_done`'));
    assert.ok(block.includes('await new Promise(resolve => setTimeout(resolve, 0));'), '古いWebViewでcompositor rAF完了を必須にしない');
    assert.ok(block.includes("{ animation: isMobileWatch ? null : 'blink 1s 2', diagPrefix }"), 'フォールバック/通常経路の点滅契約は維持する');
    assert.ok(block.includes('`${diagPrefix}:mask_animation_start`'));
    assert.ok(block.includes('`${diagPrefix}:mask_animation_done`'));
    assert.ok(block.includes('await fx.waitForDismiss(game, mapOverlay);'), '観戦自動送りの正本は共通waitForDismissを維持する');
});


test('凶作・豊作・地震の波及FIFOはshift再詰めを避け探索順を維持する', () => {
    const events = read('js/event/common_events.js');
    assert.ok(events.includes('let badQueueHead = 0;'));
    assert.ok(events.includes('while (badQueueHead < badQueue.length)'));
    assert.ok(events.includes('const current = badQueue[badQueueHead++];'));
    assert.ok(events.includes('let goodQueueHead = 0;'));
    assert.ok(events.includes('while (goodQueueHead < goodQueue.length)'));
    assert.ok(events.includes('const current = goodQueue[goodQueueHead++];'));
    assert.ok(events.includes('let eqQueueHead = 0;'));
    assert.ok(events.includes('while (eqQueueHead < eqQueue.length)'));
    assert.ok(events.includes('const current = eqQueue[eqQueueHead++];'));
    assert.ok(!events.includes('badQueue.shift()'), '凶作FIFOでArray.shiftを使わない');
    assert.ok(!events.includes('goodQueue.shift()'), '豊作FIFOでArray.shiftを使わない');
    assert.ok(!events.includes('eqQueue.shift()'), '地震FIFOでArray.shiftを使わない');
});



test('野戦マップ生成の連結・外海FIFOはshift再詰めを避け探索順を維持する', () => {
    const mapGen = read('js/map_generator.js');
    const connectivityAt = mapGen.indexOf('\n    _ensureConnectivity(map, cols, rows) {');
    const seaAt = mapGen.indexOf('\n    _fillEnclosedSea(map, cols, rows) {', connectivityAt);
    const connectivityBlock = mapGen.slice(connectivityAt, seaAt);
    const seaBlock = mapGen.slice(seaAt, seaAt + 2600);
    assert.ok(connectivityBlock.includes('let queueHead = 0;'));
    assert.ok(connectivityBlock.includes('while (queueHead < queue.length)'));
    assert.ok(connectivityBlock.includes('queue[queueHead++]'));
    assert.ok(!connectivityBlock.includes('queue.shift()'));
    assert.ok(seaBlock.includes('let queueHead = 0;'));
    assert.ok(seaBlock.includes('while (queueHead < queue.length)'));
    assert.ok(seaBlock.includes('queue[queueHead++]'));
    assert.ok(!seaBlock.includes('queue.shift()'));
});

test('共通スマホ長押しはカスタムスクロールを奪わずOS割込みで保留timerを残さない', () => {
    const ui = read('js/ui.js');
    const at = ui.indexOf('initContextMenu() {');
    const block = ui.slice(at, at + 15000);
    assert.ok(block.includes('.custom-scrollbar-thumb'));
    assert.ok(block.includes('.custom-scrollbar-track'));
    assert.ok(block.includes('.custom-scrollbar-btn'));
    assert.ok(block.includes('const cancelPendingLongPress = () => {'));
    assert.ok(block.includes('if (e.touches.length > 1) {'));
    assert.ok(block.includes('cancelPendingLongPress();'), '2本目の指が加わった時も先行timerを残さない');
    assert.ok(block.includes("document.addEventListener('touchcancel', cancelPendingLongPress"), 'touchcancelで未発火長押しを破棄する');
    assert.ok(block.includes("window.addEventListener('blur', cancelPendingLongPress)"), 'OS/ウインドウ割込みで未発火長押しを破棄する');
    assert.ok(block.includes("window.addEventListener('pagehide', cancelPendingLongPress)"), 'ページ非表示で未発火長押しを破棄する');
    assert.ok(block.includes("document.addEventListener('visibilitychange'"), 'アプリ非表示でも未発火長押しを破棄する');
});

test('ターン処理はダイアログ待ち中のロードで旧Castle参照を再開しない', () => {
    const turn = read('js/turn_manager.js');
    const at = turn.indexOf('async processTurn()');
    const end = turn.indexOf('async finishTurn()', at);
    const block = turn.slice(at, end);
    assert.ok(block.includes("if (game.phase !== 'game' || game.isRestoringSave) return;"), 'processTurn開始時に復元中を弾く');
    assert.ok(block.includes('const expectedTurnIndex = Number(game.currentIndex);'));
    assert.ok(block.includes('const castle = game.turnQueue[expectedTurnIndex];'));
    const waitAt = block.indexOf('await game.ui.waitForDialogs();', block.indexOf('const expectedTurnIndex'));
    const recheckAt = block.indexOf("if (game.phase !== 'game' || game.isRestoringSave) return;", waitAt);
    const sameTurnAt = block.indexOf('game.turnQueue[expectedTurnIndex] !== castle', waitAt);
    const ownerAt = block.indexOf('const ownerId = Number(castle.ownerClan);', waitAt);
    assert.ok(waitAt >= 0 && recheckAt > waitAt, 'waitForDialogs後にロード寿命を再確認する');
    assert.ok(sameTurnAt > recheckAt, '待機前と同じturnQueue要素か確認する');
    assert.ok(ownerAt > sameTurnAt, '所有者分類はawait後の現在値から計算する');
    const monthWaitAt = block.indexOf('await game.ui.waitForDialogs();');
    const monthEndAt = block.indexOf('await game.endMonth();');
    assert.ok(block.indexOf("if (game.phase !== 'game' || game.isRestoringSave) return;", monthWaitAt) < monthEndAt, '月末遷移も待機後に復元中を弾く');

    const finishAt = turn.indexOf('async finishTurn()');
    const finishBlock = turn.slice(finishAt, finishAt + 1200);
    assert.ok(finishBlock.includes("if (game.phase !== 'game' || game.isRestoringSave) return;"), 'finishTurnも復元中に旧ターンを進めない');
});

test('月初浪人移動は隣接索引を使い旧候補順と乱数契約を維持する', () => {
    const affiliation = read('js/affiliation_system.js');
    const at = affiliation.indexOf('processRoninMovements()');
    const block = affiliation.slice(at, at + 2400);
    assert.ok(block.includes('const castleOrderById = new Map(this.game.castles.map('), '全国拠点順は1回だけ短命Map化する');
    assert.ok(block.includes('.getAdjacentCastles(currentC)'), '浪人ごとの全国全件隣接filterをやめる');
    assert.ok(block.includes('.sort((a, b) => (castleOrderById.get(Number(a.id))'), '抽選候補は従来のgame.castles順へ戻す');
    assert.ok(!block.includes('this.game.castles.filter(c => MapGraphService.isAdjacent(currentC, c))'));
    const chanceAt = block.indexOf('Math.random() < 0.05');
    const targetAt = block.indexOf('Math.random() * neighbors.length');
    assert.ok(chanceAt >= 0 && targetAt > chanceAt, '5%判定→移動先抽選の乱数順を維持する');

    const roninAt = affiliation.indexOf('becomeRonin(busho');
    const roninBlock = affiliation.slice(roninAt, roninAt + 9000);
    assert.ok(roninBlock.includes('let queueHead = 0;'));
    assert.ok(roninBlock.includes('while (queueHead < queue.length)'));
    assert.ok(roninBlock.includes('queue[queueHead++]'));
    assert.ok(!roninBlock.includes('queue.shift()'), '出奔BFSでArray.shiftを残さない');
});


test('月初月末とAI予約はシナリオ世代をまたいでロード・タイトル後へ継続しない', () => {
    const turn = read('js/turn_manager.js');
    const game = read('js/game.js');
    const save = read('js/save_manager.js');
    const ui = read('js/ui.js');
    assert.ok(turn.includes('this._turnFlowGeneration = 0;'));
    assert.ok(turn.includes('abortForScenarioTransition()'));
    assert.ok(turn.includes('_isTurnFlowCurrent(generation)'));
    const startAt = turn.indexOf('async startMonth()');
    const endAt = turn.indexOf('async endMonth()');
    const startBlock = turn.slice(startAt, turn.indexOf('/** 委任城', startAt));
    const endBlock = turn.slice(endAt, turn.indexOf('checkAllActionsDone()', endAt));
    assert.ok(startBlock.includes('const isCurrentFlow = () => this._isTurnFlowCurrent(turnFlowGeneration);'));
    assert.ok(startBlock.includes('await game.ui.showCutin'));
    assert.ok(startBlock.includes('if (!isCurrentFlow()) return;'));
    assert.ok(endBlock.includes('const isCurrentFlow = () => this._isTurnFlowCurrent(turnFlowGeneration);'));
    assert.ok(endBlock.includes('if (!isCurrentFlow()) return false;'), '月末ダイアログ待ち後も同じ世代だけ続行する');
    assert.ok(endBlock.includes('return true;'), '重複待機を除いても有効世代だけ次段へ進める');
    const scheduleAt = turn.indexOf('_scheduleAITurn(castle)');
    const scheduleBlock = turn.slice(scheduleAt, turn.indexOf('async processTurn()', scheduleAt));
    assert.ok(scheduleBlock.includes('const turnFlowGeneration = Number(this._turnFlowGeneration || 0);'));
    assert.ok(scheduleBlock.includes('if (!this._isTurnFlowCurrent(turnFlowGeneration)) return;'));
    assert.ok(game.includes('this.turnManager.abortForScenarioTransition();'), '新規開始で旧ターン世代を切る');
    assert.ok(save.includes('this.game.turnManager.abortForScenarioTransition();'), 'ロード復元開始で旧ターン世代を切る');
    const titleAt = ui.indexOf('async returnToTitle(options = {})');
    const titleBlock = ui.slice(titleAt, titleAt + 2200);
    assert.ok(titleBlock.indexOf('this.game.turnManager.abortForScenarioTransition();') < titleBlock.indexOf('await this.waitForNextPaint();'), 'タイトル復帰は最初のawaitより先に旧ターン世代を切る');
});

test('派閥再編は同じ武将組の履歴・能力・功績補正を一再編内だけ再利用する', () => {
    const faction = read('js/faction_system.js');
    const at = faction.indexOf('updateFactions(targetClanId = null)');
    const block = faction.slice(at, faction.indexOf('    /**', at + 10) > 0 ? faction.indexOf('    /**', at + 10) : faction.length);
    assert.ok(block.includes('const factionAchievementBonusCache = new WeakMap();'));
    assert.ok(block.includes('const voterBestStatCache = new WeakMap();'));
    assert.ok(block.includes('const pairInvariantCache = new WeakMap();'));
    assert.ok(block.includes('voterPairs = new WeakMap();'));
    assert.ok(block.includes('voter.stayHistory.forEach'));
    assert.ok(block.includes('voterPairs.set(leader, pair);'));
    assert.ok(block.includes('const leaderGroupMeta = getLeaderGroupMeta(availableLeaders);'), '候補集合依存の最大能力値は従来どおり候補集合ごとに判定する');
    assert.ok(faction.includes("this.game.writeSystemDiagnostic('month_start:faction:rebuild_start');"));
    assert.ok(faction.includes("this.game.writeSystemDiagnostic('month_start:faction:rebuild_done');"));
});

test('外交の血縁・二条経路BFSはArray.shift再詰めを避け探索順を維持する', () => {
    const diplomacy = read('js/diplomacy.js');
    const kinAt = diplomacy.indexOf('\n    _hasBloodFamilyMemberInSuccessor(princess, husband, successorClanId, kinContext)');
    const kinBlock = diplomacy.slice(kinAt, kinAt + 1800);
    assert.ok(kinBlock.includes('let queueHead = 0;'));
    assert.ok(kinBlock.includes('while (queueHead < queue.length)'));
    assert.ok(kinBlock.includes('queue[queueHead++]'));
    assert.ok(!kinBlock.includes('queue.shift()'));
    const nijoAt = diplomacy.indexOf('const nijoCastleId = 26;');
    const nijoBlock = diplomacy.slice(nijoAt, nijoAt + 2600);
    assert.ok(nijoBlock.includes('let queueHead = 0;'));
    assert.ok(nijoBlock.includes('while (queueHead < queue.length)'));
    assert.ok(nijoBlock.includes('queue[queueHead++]'));
    assert.ok(!nijoBlock.includes('queue.shift()'));
});


test('AI攻撃候補比較は不変な勢力兵数・領内敵対諸勢力を一判断内だけ再利用する', () => {
    const ai = read('js/ai.js');
    const at = ai.indexOf('decideAttackTarget(myCastle, myGeneral, enemies)');
    const end = ai.indexOf('\n    //', at + 100);
    const block = ai.slice(at, end > at ? end : at + 17000);
    assert.ok(block.includes('const clanSoldierTotalCache = new Map();'));
    assert.ok(block.includes('const getClanTotalSoldiersForDecision = (clanId) => {'));
    assert.ok(block.includes('this.game.getClanTotalSoldiers(id) || 0'));
    assert.ok(block.includes('const getHostileKunishuCountForDecision = () => {'));
    assert.ok(block.includes('const totalHostileKunishus = getHostileKunishuCountForDecision();'));
    assert.ok(block.includes('const queuedCastleIds = new Set();'), '上洛経路のqueue membershipも線形includesを繰り返さない');
    assert.ok(block.includes('queuedCastleIds.delete(u);'));
    assert.ok(block.includes('if (!queuedCastleIds.has(vCastle.id))'));
});


test('通常ターンの0ms継続はTurnManager世代で一元管理しシナリオ切替時に破棄する', () => {
    const turn = read('js/turn_manager.js');
    assert.ok(turn.includes('this._turnContinuationTimers = new Set();'));
    assert.ok(turn.includes('this._turnContinuationTimers.forEach(timerId => clearTimeout(timerId));'));
    assert.ok(turn.includes('_scheduleTurnFlowContinuation(callback, delay = 0, options = {})'));
    const usages = (turn.match(/_scheduleTurnFlowContinuation\(/g) || []).length;
    assert.ok(usages >= 5, '定義に加え空城・行動済み・通常finish等が共通窓口を使う');
    assert.ok(!turn.includes('setTimeout(() => game.processTurn(), 0)'), 'TurnManager内に生のprocessTurn 0ms予約を残さない');
    assert.ok(!turn.includes('setTimeout(() => { game.finishTurn(); }, 0)'), 'TurnManager内に生のfinishTurn 0ms予約を残さない');
});

test('地図戦闘演出はシナリオ切替でrAFと固定Canvasを中断し旧onHalfwayを進めない', () => {
    const map = read('js/ui_map.js');
    const ui = read('js/ui.js');
    const war = read('js/war_effort.js');
    const indep = read('js/independence_system.js');
    assert.ok(map.includes('abortMapEffectsForScenarioTransition()'));
    assert.ok(map.includes('this._mapEffectGeneration = Number(this._mapEffectGeneration || 0) + 1;'));
    assert.ok(map.includes("['battle-blink-overlay', 'capture-effect-overlay']"));
    assert.ok(map.includes('this.hideMapGuard(true);'));
    assert.ok(map.includes("if (typeof this.abortMapEffectsForScenarioTransition === 'function') {"), 'resetMapViewStateから地図演出を中断する');
    assert.ok(map.includes('if (!isCurrentEffect()) return false;'), 'focus待ち後にも旧演出を開始しない');
    assert.ok(map.includes('const runHalfway = () => {\n                if (halfwayDone || !isCurrentEffect()) return;'), '中断済み制圧演出は所有変更callbackを呼ばない');
    assert.ok(war.includes('if (openingBlinkCompleted === false) return;'));
    assert.ok(war.includes('if (resultBlinkCompleted === false) return;'));
    assert.ok((war.match(/if \(captureCompleted === false\) return;/g) || []).length >= 3);
    assert.ok(indep.includes('if (independenceBlinkCompleted === false) return;'));
    assert.ok(indep.includes('if (independenceCaptureCompleted === false) return;'));
    assert.ok(indep.includes('if (rebellionBlinkCompleted === false) return;'));
});

test('地図ズームrAFはresetMapViewState後の新しい地図へ旧座標を書き戻さない', () => {
    const map = read('js/ui_map.js');
    const at = map.indexOf('changeMapZoom(direction, cx = null, cy = null)');
    const block = map.slice(at, map.indexOf('focusMapOnCastle(', at));
    assert.ok(block.includes('const mapViewResetToken = Number(this._mapViewResetToken || 0);'));
    assert.ok(block.includes('const isCurrentMapView = () => Number(this._mapViewResetToken || 0) === mapViewResetToken;'));
    assert.ok(block.includes('if (!isCurrentMapView()) {\n                    this.isAnimatingZoom = false;'));
    assert.ok(block.includes('if (!isCurrentMapView()) return;'), 'スマホ次フレーム補正も世代切替後は書き戻さない');
});

test('地図リセットは中断したズーム診断を終了し次シナリオへ旧checkpoint復元状態を持ち越さない', () => {
    const map = read('js/ui_map.js');
    const at = map.indexOf('resetMapViewState(options = {})');
    const block = map.slice(at, map.indexOf('_getMapScaleTransform(', at));
    assert.ok(block.includes("if (typeof this._endMapZoomDiagnostic === 'function') this._endMapZoomDiagnostic();"));
    const endAt = map.indexOf('_endMapZoomDiagnostic()');
    const endBlock = map.slice(endAt, map.indexOf('initMapDrag()', endAt));
    assert.ok(endBlock.includes('this._mapZoomPreviousDiagnostic = undefined;'), '診断終了時に旧checkpoint保持状態を必ず解放する');
});

test('イベント地図の観戦自動送りtimerは先行タップ時に解放する', () => {
    const events = read('js/event/common_events.js');
    const at = events.indexOf('const waitForDismiss = async (game, mapOverlay) => {');
    const block = events.slice(at, at + 2800);
    assert.ok(block.includes('let autoDismissTimer = null;'));
    assert.ok(block.includes('clearTimeout(autoDismissTimer);'));
    assert.ok(block.includes('autoDismissTimer = setTimeout(onTouch, 1000)'));
});

test('イベント地図の入力待ちはturn-flow中断でlistenerとtimerを解放する', () => {
    const events = read('js/event/common_events.js');
    const at = events.indexOf('const waitForDismiss = async (game, mapOverlay) => {');
    const block = events.slice(at, at + 2600);
    assert.ok(block.includes('turnManager.captureTurnFlowGeneration()'));
    assert.ok(block.includes('turnManager.subscribeTurnFlowAbort(generation, () => finish(false))'));
    assert.ok(block.includes('unsubscribeAbort();'));
    assert.ok(block.includes("mapOverlay.removeEventListener('click', onTouch);"));
    assert.ok(block.includes("mapOverlay.removeEventListener('touchstart', onTouch);"));
    assert.ok(block.includes('resolve(!!dismissed);'));
    assert.ok(events.includes('if (dismissed === false) fx.writeDiag(game, `${diagPrefix}:wait_aborted`);'));
    const typhoon = read('js/event/typhoon_event.js');
    assert.ok(typhoon.includes("if (dismissed === false) writeDiag('wait_aborted');"));
});


test('AI城ターンはイベント・捕虜処遇・作戦・内政await後に同じturn-flowだけを継続する', () => {
    const ai = read('js/ai.js');
    const execAt = ai.indexOf('async execAI(castle)');
    const execEnd = ai.indexOf('\n    decideAttackTarget(', execAt);
    const internalAt = ai.indexOf('async execInternalAffairs(', execEnd);
    const execBlock = ai.slice(execAt, execEnd);
    assert.ok(execBlock.includes('const turnFlowContext = this._captureTurnFlowContext(castle);'));
    assert.ok(execBlock.includes("await this.game.eventManager.processEvents('before_command', castle);"));
    assert.ok(execBlock.includes('await this.game.diplomacyManager.resolveBreakAllianceConsequences(breakResult);'));
    assert.ok(execBlock.includes('await this.game.aiOperationManager.generateOperation(castle.ownerClan, castle.legionId);'));
    assert.ok(execBlock.includes('await this.execInternalAffairs(castle, castellan, mods, smartness, turnFlowContext);'));
    assert.ok((execBlock.match(/if \(!isCurrentTurnFlow\(\)\) return;/g) || []).length >= 4, '主要await後に旧AIターンを再開しない');
    assert.ok(!execBlock.includes('this.game.finishTurn();'), 'execAI本体は生のfinishTurnで新ターンを進めない');
    assert.ok(execBlock.includes('this._finishTurnForContext(turnFlowContext)'));
    const internalBlock = ai.slice(internalAt, internalAt + 9000);
    assert.ok(internalBlock.includes('const isCurrentTurnFlow = () => !turnFlowContext || this._isTurnFlowContextCurrent(turnFlowContext);'));
    assert.ok(internalBlock.includes('await new Promise(resolve => setTimeout(resolve, 0));'));
    assert.ok(internalBlock.includes('if (!isCurrentTurnFlow()) return;'));
});

test('AIからプレイヤーへの外交結果完了はTurnManager世代へ結び旧100ms callbackを残さない', () => {
    const diplomacy = read('js/diplomacy.js');
    const helperAt = diplomacy.indexOf('_scheduleProposalCompletion(onComplete, delay = 100)');
    const proposalAt = diplomacy.indexOf('proposeDiplomacyToPlayer(', helperAt);
    const helperBlock = diplomacy.slice(helperAt, proposalAt);
    assert.ok(helperBlock.includes('turnManager.scheduleTurnFlowContinuation(onComplete, delay'));
    assert.ok(helperBlock.includes('expectedIndex'));
    assert.ok(helperBlock.includes('expectedCastle'));
    const proposalBlock = diplomacy.slice(proposalAt, diplomacy.indexOf('\n    /**', proposalAt + 100));
    assert.ok((proposalBlock.match(/this\._scheduleProposalCompletion\(onComplete, 100\)/g) || []).length >= 9);
    assert.ok(!proposalBlock.includes('setTimeout(onComplete, 100)'));
});

test('観戦再開の0ms processTurnもTurnManager寿命窓口を使う', () => {
    const game = read('js/game.js');
    const helperAt = game.indexOf('_scheduleWatchTurnResume()');
    const stopAt = game.indexOf('stopWatchMode()', helperAt);
    const block = game.slice(helperAt, stopAt + 2200);
    assert.ok(block.includes('turnManager.scheduleTurnFlowContinuation(resume, 0'));
    assert.ok((block.match(/this\._scheduleWatchTurnResume\(\)/g) || []).length >= 2);
    assert.ok(!block.includes('setTimeout(() => this.processTurn(), 0)'));
});

test('共通災害は初回会話後にturn-flowを再確認し旧シナリオへ地図を生成しない', () => {
    const events = read('js/event/common_events.js');
    const at = events.indexOf('window.playProvinceMapEffect = async function');
    const block = events.slice(at, events.indexOf('\n// ==========================================\n// ★ 面談', at));
    assert.ok(block.includes('captureTurnFlowGeneration'));
    assert.ok(block.includes('isTurnFlowGenerationCurrent'));
    assert.ok(block.includes('flow_cancelled_after_dialog'));
    assert.ok(block.indexOf('if (!isCurrentEventFlow())') < block.indexOf('const overlayParts = await fx.createOverlay'));
    assert.ok(block.includes('flow_cancelled_after_overlay'));
});

test('台風の城当たり判定は行別短命run索引で旧1px命中集合を保ちスマホ観戦は点滅しない', () => {
    const events = read('js/event/common_events.js');
    const typhoon = read('js/event/typhoon_event.js');
    assert.ok(events.includes('const getGroupRunsForRow = (y) => {'));
    assert.ok(events.includes('const clearGroupRuns = () => {'));
    assert.ok(events.includes('getGroupRunsForRow,\n            clearGroupRuns'));
    assert.ok(typhoon.includes("const getGroupRunsForRow = typeof castleIndex.getGroupRunsForRow === 'function'"));
    assert.ok(typhoon.includes('const span = Math.sqrt(remain);'));
    assert.ok(typhoon.includes('const runs = getGroupRunsForRow(y);'));
    assert.ok(typhoon.includes("damagedProvinceMap.size > 0 && !isMobileWatch ? 'blink 1s 2' : ''"));
    assert.ok(typhoon.includes("writeDiag('visual_mobile_watch_static');"));
    assert.ok(typhoon.includes("writeDiag('flow_cancelled_after_dialog');"));
    assert.ok(typhoon.includes("castleIndex.clearGroupRuns();"));
});


test('EventManagerはイベントawait中のシナリオ切替後に後続イベント・flag確定・refreshへ進まない', async () => {
    const ctx = createContext();
    ctx.window.GameEvents = [];
    ctx.window.UserSettings = { historicalEvent: true };
    vm.runInContext(read('js/event_manager.js'), ctx);
    const EventManager = vm.runInContext('EventManager', ctx);

    let generation = 1;
    let releaseFirst;
    let firstStartedResolve;
    const firstStarted = new Promise(resolve => { firstStartedResolve = resolve; });
    let secondExecuted = false;
    let refreshCount = 0;
    const game = {
        phase: 'game',
        isRestoringSave: false,
        flags: {},
        turnManager: {
            captureTurnFlowGeneration: () => generation,
            isTurnFlowGenerationCurrent: token => token === generation && game.phase === 'game' && !game.isRestoringSave
        },
        writeSystemDiagnostic: () => {}
    };
    ctx.window.EventAction = { refreshScreen: async () => { refreshCount++; } };
    const manager = new EventManager(game);
    manager.registerEvent({
        id: 'historical_flow_abort_first', timing: 'startMonth_before', isOneTime: true,
        checkCondition: () => true,
        execute: async () => {
            firstStartedResolve();
            await new Promise(resolve => { releaseFirst = resolve; });
        }
    });
    manager.registerEvent({
        id: 'common_flow_abort_second', timing: 'startMonth_before', isOneTime: true,
        checkCondition: () => true,
        execute: async () => { secondExecuted = true; }
    });

    const running = manager.processEvents('startMonth_before');
    await firstStarted;
    generation = 2;
    releaseFirst();
    await running;

    assert.strictEqual(secondExecuted, false, '旧イベント完了後に次イベントへ進めない');
    assert.strictEqual(game.flags.historical_flow_abort_first, undefined, '旧シナリオのone-time flagを新状態へ確定しない');
    assert.strictEqual(refreshCount, 0, '旧イベント由来の画面refreshを新状態へ実行しない');
});

test('歴史イベント共通台本は会話・カメラawait後にturn-flow世代を再確認する', async () => {
    const ctx = createContext();
    ctx.window.GameEvents = [];
    vm.runInContext(read('js/event_manager.js'), ctx);
    vm.runInContext(read('js/event/event_text.js'), ctx);

    let generation = 7;
    let releaseDialog;
    let dialogStartedResolve;
    const dialogStarted = new Promise(resolve => { dialogStartedResolve = resolve; });
    let secondDialogCount = 0;
    const game = {
        phase: 'game',
        isRestoringSave: false,
        turnManager: {
            captureTurnFlowGeneration: () => generation,
            isTurnFlowGenerationCurrent: token => token === generation && game.phase === 'game'
        },
        ui: {
            preloadDialogFace: () => {},
            showDialogAsync: async () => {
                secondDialogCount++;
                if (secondDialogCount === 1) {
                    dialogStartedResolve();
                    await new Promise(resolve => { releaseDialog = resolve; });
                }
            },
            focusMapOnCastle: async () => {}
        }
    };

    const running = ctx.window.EventTextManager.playSequence(game, [
        { type: 'log', msg: '一' },
        { type: 'log', msg: '二' }
    ]);
    await dialogStarted;
    generation = 8;
    releaseDialog();
    await assert.rejects(running, error => error && error.code === 'EVENT_FLOW_ABORTED');
    assert.strictEqual(secondDialogCount, 1, '世代切替後の次台詞を表示しない');
});

test('イベント会話・選択待ちはturn-flow中断通知で未解決Promiseを旧シナリオへ残さない', async () => {
    const ctx = createContext();
    ctx.window.GameEvents = [];
    vm.runInContext(read('js/turn_manager.js'), ctx);
    vm.runInContext(read('js/event_manager.js'), ctx);
    const TurnManager = vm.runInContext('TurnManager', ctx);

    const game = { phase: 'game', isRestoringSave: false };
    const turnManager = new TurnManager(game);
    game.turnManager = turnManager;
    game.ui = { showDialogAsync: () => new Promise(() => {}) };

    const pendingDialog = ctx.window.EventFlowGuard.showDialogAsync(game, '旧イベント会話');
    assert.strictEqual(turnManager._turnFlowAbortSubscribers.size, 1, '待機中だけ中断購読を保持する');
    turnManager.abortForScenarioTransition();
    await assert.rejects(pendingDialog, error => error && error.code === 'EVENT_FLOW_ABORTED');
    assert.strictEqual(turnManager._turnFlowAbortSubscribers.size, 0, 'シナリオ切替時に中断購読を解放する');

    let selected = false;
    const generation = turnManager.captureTurnFlowGeneration();
    const choice = ctx.window.EventFlowGuard.waitForChoice(game, resolve => { selected = true; resolve('ok'); });
    assert.strictEqual(await choice, 'ok');
    assert.strictEqual(selected, true);
    assert.strictEqual(turnManager.isTurnFlowGenerationCurrent(generation), true);
    assert.strictEqual(turnManager._turnFlowAbortSubscribers.size, 0, '正常終了時にも購読を即解除する');
});

test('歴史・共通イベントの直接選択PromiseはEventFlowGuardの選択待ち窓口を通す', () => {
    const historical = read('js/event/historical_event.js');
    const common = read('js/event/common_events.js');
    assert.ok(historical.includes('const _historicalEventWaitChoice = (game, registerChoice) => {'));
    assert.ok((historical.match(/await _historicalEventWaitChoice\(game, resolve => \{/g) || []).length >= 4);
    assert.ok(!/await new Promise\(resolve => \{\n\s*game\.ui\.showDialog\(/.test(historical), '歴史イベントに生の選択待ちを残さない');
    assert.ok(common.includes('const _commonEventWaitChoice = (game, registerChoice) => {'));
    assert.ok((common.match(/await _commonEventWaitChoice\(game, resolve => \{/g) || []).length >= 2);
    assert.ok(!/await new Promise\(resolve => \{\n\s*game\.ui\.showDialog\(/.test(common), '共通イベントに生の選択待ちを残さない');
});

test('AI外交の戦略価値比較は同じ主敵拠点配列を一候補リスト内だけ共用する', () => {
    const diplomacy = read('js/diplomacy.js');
    const evalAt = diplomacy.indexOf('evaluateStrategicValue(myClanId, targetClanId, mainThreatId, context = null)');
    const listAt = diplomacy.indexOf('getDiplomacyPriorityList(myClanId, uniqueNeighbors, mainThreatId)', evalAt);
    const block = diplomacy.slice(evalAt, listAt + 2400);
    assert.ok(block.includes('context && context.mainThreatId === mainThreatId'));
    assert.ok(block.includes('threatCastles: mainThreatId ? this.game.getClanCastles(mainThreatId) : []'));
    assert.ok(block.includes('this.evaluateStrategicValue(myClanId, targetClanId, mainThreatId, strategicContext)'));
    assert.ok(block.includes('for (let tc of targetCastles)'));
    assert.ok(block.includes('for (let mc of threatCastles)'));
});


test('途中観戦開始のAI作戦準備は開始時turn-flow世代を跨いで旧processTurnを再開しない', () => {
    const gameJs = read('js/game.js');
    const startAt = gameJs.indexOf('startWatchMode() {');
    const endAt = gameJs.indexOf('\n    // Round26：右クリック／長押しでは', startAt);
    assert.ok(startAt >= 0 && endAt > startAt, 'startWatchMode本体を取得できる');
    const block = gameJs.slice(startAt, endAt);
    assert.ok(block.includes('const watchFlowGeneration = turnManager && typeof turnManager.captureTurnFlowGeneration'));
    assert.ok(block.includes("!turnManager.isTurnFlowGenerationCurrent(watchFlowGeneration)"));
    assert.ok(block.includes("this.phase !== 'game' || this.isRestoringSave || !this.isWatchMode"));
    assert.ok(block.includes('turnManager.scheduleTurnFlowContinuation(() => this.processTurn(), 0, {'));
    assert.ok(!block.includes('.finally(() => this.processTurn())'), '非同期作戦準備のfinallyから生processTurnを呼ばない');
});



test('PCレイアウトのタブレットはhover前提にせず既存タッチ代替操作を使う', () => {
    const bootstrap = read('js/app_bootstrap.js');
    const map = read('js/ui_map.js');
    const fieldWar = read('js/field_war.js');
    const ui = read('js/ui.js');
    const css = read('css/style.css');

    assert.ok(bootstrap.includes("document.body.classList.toggle('is-touch-input', isTouchInput);"));
    assert.ok(map.includes("document.body.classList.contains('is-pc') && !document.body.classList.contains('is-touch-input')"), 'hover用全国Canvasをtouch PCで常駐させない');
    assert.ok((map.match(/document\.body\.classList\.contains\('is-touch-input'\)/g) || []).length >= 5, '城/大名ラベルのmouseenter系もtouch入力では無効化する');
    assert.ok(css.includes('body:not(.is-touch-input) .castle-card:hover .hover-info'), 'タッチSafariの擬似hoverで城tooltipを張り付かせない');
    assert.ok(css.includes('.castle-card.current-turn .hover-info'), '現在ターン城の常時情報はhoverなしでも維持する');
    assert.ok(fieldWar.includes("scrollEl.addEventListener('touchstart', touchStartHandler"), '野戦ズームにはtouch経路がある');
    assert.ok(fieldWar.includes("scrollEl.addEventListener('touchmove', touchMoveHandler"));
    assert.ok(read('js/ui_map.js').includes("sc.addEventListener('touchmove'"), '全国地図にもtouch移動/ピンチ経路がある');
    assert.ok(ui.includes("document.addEventListener('touchstart', (e) => {"), '右クリック相当には既存長押し経路がある');
});



test('月初月末の処理ラベルは会話直後に即復帰せず短い会話間ギャップを吸収する', () => {
    const ui = read('js/ui.js');
    const uiMap = read('js/ui_map.js');
    const turn = read('js/turn_manager.js');

    assert.ok(ui.includes("this._processingStatusRevealTimer = null;"));
    assert.ok(ui.includes("this._processingStatusRevealDeferred = false;"));
    assert.ok(ui.includes("_deferProcessingStatusReveal(delayMs = 1200)"), '会話後の処理ラベルは1.2秒の静穏期間後だけ復帰する');
    assert.ok(ui.includes("const deferredProcessingStatus = !!(this._processingStatusText && this.game && this.game.isProcessingAI);"));
    assert.ok(ui.includes("if (deferredProcessingStatus) this._deferProcessingStatusReveal(1200);"));
    assert.ok(ui.includes("this.clearProcessingStatus();"), 'AI城進捗へ切り替える時は月次ラベルの遅延状態を破棄する');
    assert.ok(uiMap.includes("(this.guardTextHiddenCount || 0) > 0 || this._processingStatusRevealDeferred"), 'hide-textの正本に遅延復帰状態も含める');

    const waitAt = turn.indexOf('const waitIfBusy = async () => {');
    const waitEnd = turn.indexOf('// ==========================================', waitAt + 1);
    const waitBlock = turn.slice(waitAt, waitEnd);
    assert.ok(waitBlock.includes('await game.ui.waitForDialogs();'));
    assert.ok(!waitBlock.includes('setTimeout(resolve, 300)'), 'waitForDialogs後の重複300ms待機を残さない');
});

Promise.all(pendingTests).then(() => {
    console.log(`\n${passed} passed, ${failed} failed`);
    if (failed > 0) process.exit(1);
}).catch(error => {
    _recordTestFailure('非同期テストランナー', error);
    console.log(`\n${passed} passed, ${failed} failed`);
    process.exit(1);
});



test('タブレットを含む固定論理画面のPC/スマホ判定はapp_bootstrapのbody.is-pcへ一元化する', async () => {
    const bootstrap = read('js/app_bootstrap.js');
    const fieldWar = read('js/field_war.js');
    const scrollbar = read('js/custom_scrollbar.js');
    const css = read('css/style.css');

    assert.ok(bootstrap.includes('function resolveGameLayoutMode(layoutW, layoutH, touchInput = isTouchFirstDevice())'));
    assert.ok(bootstrap.includes("const ipadDesktopUa = /Macintosh/i.test(ua) && maxTouchPoints > 1;"), 'iPadOSのdesktop UAもタッチ端末として認識する');
    assert.ok(bootstrap.includes('const MIN_TOUCH_PC_SCALE = 0.75;'));
    assert.ok(bootstrap.includes("document.body.classList.toggle('is-pc', isPC);"));
    assert.ok(bootstrap.includes("document.body.dataset.layoutMode = layoutMode;"));
    assert.ok(bootstrap.includes("new CustomEvent('game-layout-mode-change'"), 'mode変更は専用通知で既存UIへ伝える');
    assert.ok(read('js/ui.js').includes("window.addEventListener('game-layout-mode-change', () => this.handleLayoutModeChange());"));
    assert.ok(fieldWar.includes("window.addEventListener('game-layout-mode-change', refreshScale);"));
    assert.ok(bootstrap.includes('const layoutW = window.innerWidth || windowW;'), 'ソフトキーボードで縮むvisualViewportをmode判定へ使わない');
    assert.ok(!fieldWar.includes('window.innerWidth >= 768'), '野戦だけ物理幅でPCへ戻す例外を残さない');
    assert.ok(scrollbar.includes("return !document.body.classList.contains('is-pc');"), '表示密度の判断は論理modeへ従う');
    assert.ok(scrollbar.includes("return document.body.classList.contains('is-touch-input');"), 'スクロール入力安定化はレイアウトとは別にtouch入力へ従う');
    assert.ok(bootstrap.includes("document.body.classList.toggle('is-touch-input', isTouchInput);"), '入力方式をbodyへ独立して公開する');
    assert.ok(!/navigator\.userAgent/.test(scrollbar), 'スクロール部品へ端末UA判定を複製しない');
    assert.ok(css.includes('body:not(.is-pc) #title-screen { padding: 14px; }'));
    assert.ok(css.includes('body:not(.is-pc) #scenario-modal .scenario-main'));
    assert.ok(!/@media\s*\([^)]*(?:min|max)-(?:width|height)/.test(css), '固定論理UIを物理viewport media queryで再判定しない');

    const runBootstrap = ({ width, height, userAgent, maxTouchPoints, coarse = true, hoverNone = true }) => {
        const listeners = {};
        const bodyClasses = new Set();
        const screenStyle = { setProperty() {} };
        const screen = { style: screenStyle };
        const classList = {
            add: (...names) => names.forEach(n => bodyClasses.add(n)),
            remove: (...names) => names.forEach(n => bodyClasses.delete(n)),
            contains: (name) => bodyClasses.has(name),
            toggle: (name, force) => {
                const next = force === undefined ? !bodyClasses.has(name) : !!force;
                if (next) bodyClasses.add(name); else bodyClasses.delete(name);
                return next;
            }
        };
        const context = createContext({
            navigator: { userAgent, maxTouchPoints },
            document: {
                documentElement: { classList: { add() {}, remove() {} } },
                body: { classList, dataset: {} },
                fonts: null,
                getElementById(id) { return id === 'game-screen' ? screen : null; }
            },
            innerWidth: width,
            innerHeight: height,
            devicePixelRatio: 1,
            visualViewport: null,
            addEventListener(type, fn) { listeners[type] = fn; },
            matchMedia(query) {
                if (query === '(pointer: coarse)') return { matches: coarse };
                if (query === '(hover: none)') return { matches: hoverNone };
                return { matches: false };
            },
            requestAnimationFrame(fn) { fn(); return 1; },
            cancelAnimationFrame() {},
            setTimeout,
            clearTimeout,
            Promise,
            console
        });
        vm.runInContext(read('js/app_bootstrap.js'), context);
        listeners.DOMContentLoaded();
        return {
            isPc: bodyClasses.has('is-pc'),
            mode: context.document.body.dataset.layoutMode,
            inputMode: context.document.body.dataset.inputMode,
            isTouchInput: bodyClasses.has('is-touch-input'),
            width: screen.style.width,
            height: screen.style.height
        };
    };

    const ipadDesktopUa = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15) AppleWebKit/605.1.15 Version/18.0 Safari/605.1.15';
    const portraitTablet = runBootstrap({ width: 820, height: 1180, userAgent: ipadDesktopUa, maxTouchPoints: 5 });
    assert.deepStrictEqual(portraitTablet, { isPc: false, mode: 'mobile', inputMode: 'touch', isTouchInput: true, width: '663.75px', height: '1180px' });

    const landscapeTablet = runBootstrap({ width: 1024, height: 768, userAgent: ipadDesktopUa, maxTouchPoints: 5 });
    assert.strictEqual(landscapeTablet.isPc, true);
    assert.strictEqual(landscapeTablet.mode, 'pc');
    assert.strictEqual(landscapeTablet.inputMode, 'touch', 'PCレイアウトでもタブレット入力はtouchのまま');
    assert.strictEqual(landscapeTablet.isTouchInput, true);
    assert.strictEqual(landscapeTablet.width, '1280px');
    assert.strictEqual(landscapeTablet.height, '720px');

    const smallLandscapeTouch = runBootstrap({ width: 800, height: 600, userAgent: 'Mozilla/5.0 (Linux; Android 12)', maxTouchPoints: 5 });
    assert.strictEqual(smallLandscapeTouch.isPc, false, '横持ちでもPC論理画面を十分な倍率で表示できない端末はスマホUIへ寄せる');

    const narrowDesktop = runBootstrap({ width: 700, height: 1000, userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)', maxTouchPoints: 0, coarse: false, hoverNone: false });
    assert.strictEqual(narrowDesktop.isPc, true, '通常PCは物理viewportが縦長でも従来どおりPC論理画面を維持する');
    assert.strictEqual(narrowDesktop.inputMode, 'mouse');
    assert.strictEqual(narrowDesktop.isTouchInput, false);
});
