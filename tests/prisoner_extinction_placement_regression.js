'use strict';
// 正規の落城捕縛 → 捕虜当主処断 → 後継者不在による滅亡 → 残存捕虜処遇。
// 周辺の死亡演出と登用確率のみ固定し、所属・浪人化・捕虜・滅亡処理は製品メソッドを使う。
const fs=require('fs'),vm=require('vm'),assert=require('assert'),path=require('path');
const root=path.resolve(__dirname,'..');
async function run(hire) {
    const math=Object.create(Math);math.random=()=>0.99;
    const ctx=vm.createContext({console,Math:math,window:{},WarManager:class WarManager{},MapGraphService:{isReachable:()=>true}});
    for (const file of ['js/constants.js','js/personnel_rules.js','js/affiliation_system.js','js/life_system.js','js/war_effort.js'])
        vm.runInContext(fs.readFileSync(path.join(root,file),'utf8'),ctx,{filename:file});
    const get=expr=>vm.runInContext(expr,ctx);
    const W=get('WarManager'),A=get('AffiliationSystem'),L=get('LifeSystem');
    const mk=(id,daimyo)=>({id,clan:2,castleId:2,status:'active',belongKunishuId:0,isDaimyo:daimyo,isCastellan:false,isCommander:false,
        familyIds:[20,21],birthYear:1530,originalEndYear:1640,leadership:90,strength:45,charm:90,intelligence:85,politics:85,diplomacy:80,
        achievementTotal:1000,loyalty:75,affinity:50,ambition:50,duty:50,wifeIds:[],nemesisIds:[],nemesisList:[],courtRankIds:[],name:`武将${id}`,fullName:`武将${id}`});
    const lord=mk(20,true),captive=mk(21,false),bushos=[lord,captive];
    const castles=[{id:1,ownerClan:1,samuraiIds:[],name:'攻城側',castellanId:0},
        {id:2,ownerClan:2,samuraiIds:[20,21],name:'落城する拠点',castellanId:20,adjacentCastleIds:[4]},
        {id:3,ownerClan:2,samuraiIds:[],name:'残存する無人拠点',castellanId:0,adjacentCastleIds:[]},
        {id:4,ownerClan:4,samuraiIds:[],name:'第三勢力の隣接拠点',castellanId:0,adjacentCastleIds:[2]}];
    const clan={id:2,name:'敗戦家',leaderId:20,princessIds:[]};
    const game={year:1570,month:1,playerClanId:3,phase:'game',bushos,castles,princesses:[],legions:[],
        getBusho:id=>bushos.find(b=>b.id===id),getCastle:id=>castles.find(c=>c.id===id),
        getClan:id=>id===2?clan:({id,name:'他家'}),getClanBushos:id=>bushos.filter(b=>b.clan===id),
        getClanCastles:id=>castles.filter(c=>c.ownerClan===id),getCastleBushos:id=>castles.find(c=>c.id===id)?.samuraiIds.map(id=>bushos.find(b=>b.id===id)).filter(Boolean)||[],
        getClanDaimyo:id=>bushos.find(b=>b.clan===id&&b.isDaimyo),getCurrentTurnId:()=>100,updateCastleLord:()=>{},
        ui:{log:()=>{},showDialogAsync:async()=>{},renderMap:()=>{}},factionSystem:{updateFactions:()=>{}},kunishuSystem:{getKunishu:()=>null}};
    game.affiliationSystem=new A(game);game.affiliationSystem.updateUI=()=>{};game.affiliationSystem.updateCastleLord=()=>{};
    const roninCalls=[];const becomeRonin=game.affiliationSystem.becomeRonin.bind(game.affiliationSystem);
    game.affiliationSystem.becomeRonin=(b,reason)=>{roninCalls.push([b.id,b.clan]);return becomeRonin(b,reason)};
    game.castleManager={changeOwner:(c,id)=>{c.ownerClan=id}};
    game.lifeSystem=new L(game);
    // 正規の当主継承と家滅亡へ委譲し、死亡の周辺演出のみ検証用に省略する。
    game.lifeSystem.executeDeath=async (b,opt={})=>{b.status='dead';if(b.isDaimyo)await game.lifeSystem.handleDaimyoDeath(b,opt.excludedSuccessionCandidateIds);b.clan=0};
    const war=new W();war.game=game;game.warManager=war;war.state={defender:castles[1]};
    war.registerNemesisForExecuted=()=>{};war.isTotalTakeoverPending=()=>false;war.calcPrisonerHireProb=()=>hire?1:0;
    ctx.window.WarParams={War:{CaptureChanceBase:0.7,CaptureStrFactor:0.002,DaimyoCaptureReduction:0.3}};
    war.processCaptures(castles[1],1);
    assert.deepStrictEqual(Array.from(war.pendingPrisoners,p=>p.id),[20,21], '通常の捕縛確率によって同時捕虜になる');
    castles[1].ownerClan=1;
    await war.autoResolvePrisoners(war.pendingPrisoners,1);
    assert.strictEqual(clan.isDestroyed,true,'後継者不在で滅亡する');
    assert.strictEqual(castles[2].ownerClan,0,'残存城を中立化する');
    assert.strictEqual(captive.castleId,2,'捕虜が第三勢力の城へ先行移動しない');
    assert.strictEqual(captive.achievementTotal,500,'功績の減算は一度だけ');
    if(hire) {
        assert.strictEqual(captive.clan,1,'勝者へ登用');
        assert.strictEqual(captive.status,'active');
        assert.deepStrictEqual(roninCalls,[],'処遇前の浪人化は行わない');
        assert.ok(castles[1].samuraiIds.includes(21),'登用先は捕縛元の拠点');
    }else{
        assert.strictEqual(captive.clan,0,'解放後に浪人化');
        assert.strictEqual(captive.status,'ronin');
        assert.deepStrictEqual(roninCalls,[[21,2]],'解放確定後に一度だけ浪人化');
    }
    assert.ok(!castles[3].samuraiIds.includes(21),'第三勢力の名簿に混入しない');
}
(async()=>{await run(true);await run(false);console.log('後継者不在・捕虜登用/解放の所在回帰: 2条件成功');})().catch(e=>{console.error(e.stack||e);process.exitCode=1});
