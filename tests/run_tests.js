#!/usr/bin/env node
'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..');
let passed = 0;
let failed = 0;

function test(name, fn) {
    try {
        fn();
        passed++;
        console.log(`✓ ${name}`);
    } catch (error) {
        failed++;
        console.error(`✗ ${name}`);
        console.error(error && error.stack ? error.stack : error);
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
    assert.strictEqual(ctx.GameConstants.BushoStatus.ACTIVE, 'active');
    assert.strictEqual(ctx.GameConstants.DiplomacyStatus.ALLIANCE, '同盟');
    assert.strictEqual(ctx.DiplomacyRules.canPassTerritory('同盟'), true);
    assert.strictEqual(ctx.DiplomacyRules.canPassTerritory('友好'), false);
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

test('TroopAllocationService の配分合計は総兵数と一致する', () => {
    const ctx = createContext();
    loadScript(ctx, 'js/config.js');
    loadScript(ctx, 'js/troop_allocation.js');
    const bushos = [
        { id: 1, leadership: 90, strength: 85 },
        { id: 2, leadership: 70, strength: 80 },
        { id: 3, leadership: 60, strength: 60 }
    ];
    const result = ctx.TroopAllocationService.autoDivideSoldiers({
        bushos, totalSoldiers: 5000, totalHorses: 1800, totalGuns: 1200, isPlayerUI: false
    });
    assert.strictEqual(result.length, 3);
    assert.strictEqual(result.reduce((sum, row) => sum + row.soldiers, 0), 5000);
    assert.ok(result.every(row => ['ashigaru', 'kiba', 'teppo'].includes(row.troopType)));
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

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
