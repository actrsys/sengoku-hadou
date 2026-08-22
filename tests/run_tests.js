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

test('Legionモデルは現在ターンをGameAppから取得せず、復元側が旧セーブを補完する', () => {
    const models = read('js/models.js');
    const saves = read('js/save_manager.js');
    assert.ok(models.includes('this.establishedTurnId = Number(data.establishedTurnId || 0);'));
    assert.ok(saves.includes('establishedTurnId: l.establishedTurnId || this.game.getCurrentTurnId()'));
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


// ---------------------------------------------------------------------------
// CommandSystem の責務境界
// ---------------------------------------------------------------------------
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
});

test('コマンド定義はWarParamsの独自フォールバックを持たない', () => {
    const sources = read('js/command_catalog.js') + '\n' + read('js/command_system.js');
    assert.ok(!sources.includes('MaxTraining) ?'));
    assert.ok(!sources.includes('MaxMoraleCharity) ?'));
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
    const legacyIkko = new Kunishu({ id: 10001, name: '一向一揆', ideology: '宗教' });
    const legacyGanshoji = new Kunishu({ id: 4, name: '願証寺', ideology: '宗教' });
    system.setKunishuData([legacyIkko, legacyGanshoji]);
    assert.strictEqual(legacyIkko.networkTag, 'ikko', '旧セーブの一向一揆へ互換シールを補う');
    assert.strictEqual(legacyGanshoji.networkTag, 'ikko', '旧セーブの願証寺へ互換シールを補う');
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
    const csv = read('data/scenarios/1560_okehazama/kunishuClan.csv');
    const lines = csv.trimEnd().split(/\r?\n/);
    const header = lines[0].split(',');
    const nameIndex = header.indexOf('name');
    const idIndex = header.indexOf('id');
    const ideologyIndex = header.indexOf('ideology');
    const tagIndex = header.indexOf('networkTag');
    assert.ok(tagIndex >= 0);

    const tagged = [];
    for (const line of lines.slice(1)) {
        const cols = line.split(',');
        if (cols[tagIndex] === 'ikko') {
            tagged.push({ id: Number(cols[idIndex]), name: cols[nameIndex], ideology: cols[ideologyIndex] });
        }
    }
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
    assert.ok(ui.includes("const targetTexts = ['閉じる', '戻る', 'いいえ']"), 'PC右クリックは戻るボタンを共通キャンセル操作として扱う');
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
    assert.ok(source.includes("await this.processResidentEvents(timing, context, isHistoricalOff);"));
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
        legions: [{ id: 5, commanderId: 50 }],
        bushos: [
            { id: 50, clan: 1, castleId: 10 },
            { id: 99, clan: 1, isDaimyo: true, castleId: 12 }
        ],
        provinces: [
            { id: 1, regionId: 7 },
            { id: 2, regionId: 7 },
            { id: 3, regionId: 8 }
        ],
        getBusho: id => id === 50 ? { id: 50, castleId: 10 } : null,
        getCastle: id => castles.get(id) || null
    };
    const defender = { id: 20, provinceId: 1 };

    // 軍団長居城と同じ国・地方 = 1.2
    assert.ok(Math.abs(WarSystem.calcHomeBonusMultiplier(game,
        { provinceId: 3, ownerClan: 1, legionId: 5, isKunishu: false }, defender) - 1.2) < 1e-9);
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

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
