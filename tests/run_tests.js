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
    assert.strictEqual(ctx.GameConfig.Meta.Version, 'r151');
    assert.strictEqual(ctx.GameConstants.BushoStatus.ACTIVE, 'active');
    assert.strictEqual(ctx.GameConstants.DiplomacyStatus.ALLIANCE, '同盟');
    assert.strictEqual(ctx.DiplomacyRules.canPassTerritory('同盟'), true);
    assert.strictEqual(ctx.DiplomacyRules.canPassTerritory('友好'), false);
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
    assert.ok(greeting.greetMsg1.includes('両家のためにも進めるべき'), '左馬頭本人が使者なら主君の名代ではなく本人が外交を勧める口調にする');
    assert.ok(!greeting.greetMsg1.includes('朝倉左衛門督殿の意を受け'));
    assert.ok(greeting.greetMsg2.includes('左馬頭様'));
    assert.ok(greeting.greetMsg2.includes('御自らお越しとは'));
    let msgs = dm.getDiplomacyMessages('alliance', false, '朝倉家', '織田家', '左馬頭様', '参議殿', '姫', '貴家', greeting.context);
    assert.ok(msgs.demandMsg.includes('盟約を結ぶこと、望ましきこと'), '提案本体も本人が取り持つ口調にする');
    assert.ok(!msgs.replyAcceptMsg.includes('主君にも'));

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
        '家中の皆も、あのお方には一目置いております。',
        '左馬頭の功績差は通常家臣の「働き」ではなく特殊権威への周囲の敬意として匂わせる'
    );
    target.courtRankIds = [1];
    const shogunStanding = ctx.ConversationStandingRules.getPersonalStanding(game, speaker, target);
    assert.strictEqual(
        ctx.ConversationStandingRules.getAchievementHint(shogunStanding),
        '家中の皆も、あのお方には一目置いております。',
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
        '家中でも、あのお方のお言葉を軽んずる者はおりますまい。',
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
        '家中の皆も、あのお方には一目置いております。',
        '当主の伯父・叔父は父祖兄より一段控えめな年長親族向け表現にする'
    );

    loadScript(ctx, 'js/interview_system.js');
    vm.runInContext('this.InterviewSystem = InterviewSystem;', ctx);
    const interview = new ctx.InterviewSystem(game);
    assert.strictEqual(interview._isHighAuthorityInterviewTarget(target), true);
    assert.ok(interview._getHighAuthorityOpinionText(75).includes('深く信頼しております'), '左馬頭・将軍への人物評価は通常の「話のわかる相手」より強く敬う');
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
    assert.strictEqual(system._styleForSpeaker(yoshiakiGunshi, '合戦におもむきますか？ 兵力と兵糧の確認をお忘れなく。'), '合戦におもむくか？ 兵力と兵糧の確認を忘れぬようにな。', '戦争助言も左馬頭の軍師だけ敬語へ戻さない');
    assert.ok(!/ください|ません|ましょう/.test(system._styleForSpeaker(yoshiakiGunshi, 'おやめください。厳しい結果になるかもしれません。運が良ければ仕留められましょう。')), '軍師助言の代表的な敬語活用も高格式者では常体へ整える');
    assert.strictEqual(system._styleForSpeaker(fatherGunshi, '厳しい結果になるでしょう。'), '厳しい結果になるだろう。', '年長親族が軍師でも当主への常体を使う');
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
    assert.ok(common.includes("id: 'common_interview_doctor'") && common.includes("timing: 'interview_after_greeting'"), '医師延命を面談コモンイベントとして登録する');
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

test('1560シナリオ説明はユーザー調整版を維持する', () => {
    const data = read('js/data_manager.js');
    assert.ok(data.includes('永禄三年、畿内では三好氏が権勢を誇っていた。'));
    assert.ok(data.includes('彼はいまだ、尾張一国すら纏め上げられていない。'));
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


test('武将CSVから旧familyId列を廃止しBINも同じCSV内容へ同期する', () => {
    const csvPath = path.join(ROOT, 'data/scenarios/1560_okehazama/warriors.csv');
    const binPath = path.join(ROOT, 'data/scenarios/1560_okehazama/warriors.bin');
    const csv = fs.readFileSync(csvPath, 'utf8');
    const lines = csv.trimEnd().split(/\r?\n/);
    const headers = lines[0].split(',');
    assert.ok(!headers.includes('familyId'));
    lines.slice(1).forEach((line, index) => {
        assert.strictEqual(line.split(',').length, headers.length, `warriors.csv line ${index + 2}`);
    });
    const inflated = zlib.inflateSync(fs.readFileSync(binPath)).toString('utf8');
    assert.strictEqual(inflated, csv, 'warriors.bin は最新CSVと完全一致すること');
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
        loyalty: 80
    };
    const saved = manager._serializePersonForSave(source);
    assert.strictEqual(saved.id, 10);
    assert.strictEqual(saved.realFatherId, 1);
    assert.deepStrictEqual(Array.from(saved.wifeIds), [3]);
    assert.strictEqual(saved.loyalty, 80);
    assert.ok(!Object.prototype.hasOwnProperty.call(saved, 'baseFamilyIds'));
    assert.ok(!Object.prototype.hasOwnProperty.call(saved, 'familyIds'));
});


test('SaveManager は復元前にセーブ構造と主要ID参照を検証する', () => {
    const ctx = createContext({
        SCENARIOS: [{ folder: '1560_okehazama' }]
    });
    loadScript(ctx, 'js/save_manager.js');
    const manager = new ctx.SaveManager({});
    const valid = {
        year: 1560, month: 4, scenarioFolder: '1560_okehazama',
        castles: [{ id: 1, ownerClan: 1, castellanId: 10 }],
        bushos: [{ id: 10, clan: 1, castleId: 1 }],
        clans: [{ id: 1, leaderId: 10 }],
        princesses: [], provinces: [{ id: 1 }], legions: [], kunishus: [],
        turnQueueIds: [1], currentIndex: 0, playerClanId: 1, mapWidth: 1200, mapHeight: 800,
        flags: {}, aiOperations: {}
    };
    assert.strictEqual(manager._validateSaveDataStructure(valid), true);
    assert.throws(() => manager._validateSaveDataStructure({ ...valid, month: 13 }), /month/);
    assert.throws(() => manager._validateSaveDataStructure({ ...valid, bushos: [{ id: 10, clan: 1, castleId: 999 }] }), /castleId/);
    assert.throws(() => manager._validateSaveDataStructure({ ...valid, scenarioFolder: 'missing' }), /未登録のシナリオ/);
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
    assert.ok(detected.includes('本心ではありますまい'), '高智謀の聞き手は偽装を見抜く');
    assert.ok(detected.includes('不満'), '看破後は実際の危険度を伝える');

    const middlingInterviewer = { loyalty: 90, intelligence: 65, duty: 80 };
    const fooled = system._getTargetLoyaltyText(middlingInterviewer, concealed, relationClose);
    assert.ok(fooled.includes('忠義は本物'), '偽装を見抜けない場合は表向きの忠誠を信じることがある');
    assert.ok(!fooled.includes('本心ではありますまい'));

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
        { id: 102, name: '国主役', isCommander: true, clan: 1 },
        { id: 103, name: '城主役', isCastellan: true, clan: 1 },
    ];
    assert.deepStrictEqual(
        Array.from(ctx.BushoListSortRules.sortKnown(rankGame, rankList, 'rank', false)).map(b => b.id),
        [101, 102, 103],
        '身分降順では軍師を国主より上、国主を城主より上に並べる'
    );
    assert.deepStrictEqual(Array.from(ctx.BushoListSortRules.sortKnown(game, list, 'rank', false)).map(b => b.id), [1, 4, 3, 2], '身分降順は上位身分優先、同身分は功績降順にする');
    assert.deepStrictEqual(Array.from(ctx.BushoListSortRules.sortKnown(game, list, 'rank', true)).map(b => b.id), [2, 3, 4, 1], '身分昇順は下位身分優先、同身分は功績昇順にする');
    assert.deepStrictEqual(Array.from(ctx.BushoListSortRules.sortKnown(game, list, 'leadership', false)).map(b => b.id), [1, 3, 2, 4]);
    assert.deepStrictEqual(Array.from(ctx.BushoListSortRules.filterByName(list, 'さくま')).map(b => b.id), [2]);
    assert.deepStrictEqual(Array.from(ctx.BushoListSortRules.sortKnown(game, list, 'castle', true)).map(b => b.id), [2, 1, 3, 4]);
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
    const csv = read('data/scenarios/1560_okehazama/warriors.csv');

    assert.ok(personnel.includes('calcRelationshipProfile(a, b)'), '人物関係の共通計算を持つ');
    assert.ok(personnel.includes('affinityDiff'));
    assert.ok(personnel.includes('dutyMean'));
    assert.ok(personnel.includes('ambitionMean'));
    assert.ok(!models.includes('cooperation'), 'Bushoモデルから協調性を完全に除去する');
    assert.ok(!save.includes('savedBusho.cooperation'), '保存復元処理に協調性を残さない');
    assert.ok(!kunishu.includes('cooperation:'), '自動生成武将にも協調性を持たせない');
    assert.ok(!csv.split(/\r?\n/, 1)[0].split(',').includes('cooperation'), '武将CSVから協調性列を削除する');
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
    assert.ok(kunishu.includes('id: actualTargetCastleId'));
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
        ]
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

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
