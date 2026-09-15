#!/usr/bin/env python3
"""Player-focused Monte Carlo balance simulator.

This is an approximation tool for balance trends, not an exact execution of the
JavaScript game engine. The simulation model intentionally preserves the logic
of the original player_focus_sim.py supplied for the 1560 Okehazama scenario.
"""

import argparse
import json
import math
import random
import re
import statistics
import zlib
from collections import Counter, defaultdict, deque
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[2]
C0 = {}
W = defaultdict(list)
Qcache = {}
CLAN_NAMES = {}
SCENARIO_KEY = '1560_okehazama'
START_YEAR = 1560
START_MONTH = 4

SCENARIO_START = {
    '1560_okehazama': (1560, 4),
}

def I(x,d=0):
    try:return int(float(x)) if x not in ('',None) else d
    except:return d
def _read_bin_json(path):
 with Path(path).open('rb') as f:
  return json.loads(zlib.decompress(f.read()).decode('utf-8'))

def _enabled(value):
 if value is True or value == 1:return True
 return str(value or '').strip().lower() in ('1','true','yes','on')

def load_scenario(project_root, scenario):
 global C0, W, Qcache, CLAN_NAMES, SCENARIO_KEY, START_YEAR, START_MONTH
 root=Path(project_root)
 common_path=root/'data'/'common.bin'
 scenario_dir=root/'data'/'scenarios'/scenario
 scenario_path=scenario_dir/'scenario.bin'
 if not common_path.exists():
  raise FileNotFoundError(f'common.bin not found: {common_path}')
 if not scenario_path.exists():
  raise FileNotFoundError(f'scenario.bin not found: {scenario_path}')
 common=_read_bin_json(common_path)
 bundle=_read_bin_json(scenario_path)
 if common.get('format')!='sengoku-common-v1':
  raise ValueError(f'unsupported common format: {common.get("format")}')
 if bundle.get('format')!='sengoku-scenario-v1':
  raise ValueError(f'unsupported scenario format: {bundle.get("format")}')

 castle_master={I(r.get('id')):r for r in common.get('castlesMaster',[])}
 cr=[]
 for state in bundle.get('castlesState',[]):
  if not _enabled(state.get('enabled')):continue
  cid=I(state.get('id')); master=castle_master.get(cid)
  if not master:continue
  cr.append({**master,**state})
 C0={I(r['id']):{'id':I(r['id']),'name':r.get('name',''),'owner':I(r.get('ownerClan')),'soldiers':I(r.get('soldiers')),'population':I(r.get('population')),'defense':I(r.get('defense')),'maxDefense':I(r.get('maxDefense')),'rice':I(r.get('rice')),'gold':I(r.get('gold')),'commerce':I(r.get('commerce')),'kokudaka':I(r.get('kokudaka')),'loyalty':I(r.get('peoplesLoyalty')),'adj':[I(m.group(1)) for part in str(r.get('adjacentCastle','')).split('|') if (m:=re.match(r'(\d+)',part))]} for r in cr}

 warrior_master={I(r.get('id')):r for r in common.get('warriorsMaster',[])}
 W=defaultdict(list)
 for state in bundle.get('warriorsState',[]):
  wid=I(state.get('id')); master=warrior_master.get(wid)
  if not master:continue
  r={**master,**state}; cid=I(r.get('clan'))
  if cid>0:W[cid].append({'start':I(r.get('startYear'),9999),'end':I(r.get('endYear'),9999),'lead':I(r.get('leadership')),'str':I(r.get('strength')),'pol':I(r.get('politics')),'int':I(r.get('intelligence')),'cha':I(r.get('charm'))})

 clan_master={I(r.get('id')):r for r in common.get('clansMaster',[])}
 CLAN_NAMES={}
 for state in bundle.get('clansState',[]):
  if not _enabled(state.get('enabled')):continue
  cid=I(state.get('id')); master=clan_master.get(cid,{})
  CLAN_NAMES[cid]=master.get('name','')
 Qcache={}
 SCENARIO_KEY=scenario
 info=bundle.get('scenario') or {}
 START_YEAR=I(info.get('startYear'),1560)
 START_MONTH=I(info.get('startMonth'),4)
 return scenario_dir

Qcache={}
def qual(cid,year):
 key=(cid,year)
 if key in Qcache:return Qcache[key]
 ws=[w for w in W.get(cid,[]) if w['start']<=year<=w['end']]
 if not ws: q=(.90,.90)
 else:
  mil=sorted([.65*w['lead']+.35*w['str'] for w in ws],reverse=True)
  adm=sorted([.45*w['pol']+.30*w['int']+.25*w['cha'] for w in ws],reverse=True)
  m=sum(mil[:min(3,len(mil))])/min(3,len(mil)); a=sum(adm[:min(3,len(adm))])/min(3,len(adm))
  q=(.78+m/360,.78+a/360)
 Qcache[key]=q; return q

PARAMS={
 'cautious':dict(th=1.28, cap0=1, div=25, cap=5, draft=.007, move=.28, tact=.08, aiatk=.010),
 'standard':dict(th=1.03, cap0=1, div=12, cap=12, draft=.010, move=.42, tact=.15, aiatk=.008),
 'skilled':dict(th=.90, cap0=1, div=8, cap=16, draft=.014, move=.52, tact=.22, aiatk=.007),
}

class Sim:
 def __init__(self,target,seed,skill='standard',maxm=900):
  self.r=random.Random(seed); self.target=target; self.p=PARAMS[skill]; self.skill=skill
  self.c={i:dict(x) for i,x in C0.items()}; self.year=START_YEAR; self.mon=START_MONTH; self.t=0; self.maxm=maxm
  self.oke=False; self.maxcast=self.count(); self.mainland=None; self.checkpoints={}
  self.initial_nonneutral=sum(1 for x in self.c.values() if x['owner']>0)
 def count(self):return sum(x['owner']==self.target for x in self.c.values())
 def owned(self,cid=None):
  if cid is None:cid=self.target
  return [x for x in self.c.values() if x['owner']==cid]
 def alive_other(self): return any(x['owner']>0 and x['owner']!=self.target for x in self.c.values())
 def apply_oke(self):
  if SCENARIO_KEY != '1560_okehazama' or self.oke or not(self.year==1560 and self.mon in (5,6,7)):return
  if all(self.c[i]['owner']==1 for i in (7,11)) and all(self.c[i]['owner']==5 for i in (12,13,45,48,54,71,100,101)):
   ls=lp=0
   for x in self.owned(5):
    a,b=x['soldiers'],x['population']; x['soldiers']=int(a*.4);x['population']=int(b*.6);ls+=a-x['soldiers'];lp+=b-x['population']
   od=self.owned(1)
   if od:
    bs=(ls//2)//len(od);bp=(lp//2)//len(od)
    for x in od:x['soldiers']+=bs;x['population']+=bp;x['loyalty']=100
   self.oke=True
 def growth(self):
  counts=Counter(x['owner'] for x in self.c.values() if x['owner']>0)
  for x in self.c.values():
   cid=x['owner'];
   if cid<=0:continue
   q,adm=qual(cid,self.year)
   # Gold income exact base (without ports/salaries), enough for draft friction.
   inc=int(x['population']*.01+x['loyalty']/2+x['commerce']/4)
   if self.mon==3:inc*=4
   x['gold']=min(99999,x['gold']+int(inc*self.r.uniform(.85,1.15)))
   # September harvest exact base with variance.
   if self.mon==9:x['rice']=min(99999,x['rice']+int(x['kokudaka']*max(0,x['loyalty'])/10*self.r.uniform(.85,1.15)))
   # population natural growth approximates source formula
   total=len(x['adj']); hostile=sum(1 for n in x['adj'] if self.c[n]['owner']!=cid)
   nm=.2+(1-hostile/total) if total else 1.2
   cl=max(0,min(100,x['loyalty'])); gl=60 if x['population']<2000 and cl<60 else cl
   pg=math.floor((math.sqrt(max(1,x['population']))*2)*((gl-50)/100)+gl/4)
   if pg>0:
    ratio=x['population']/max(1,x['kokudaka']); bonus=3 if ratio<=1 else (3-((ratio-1)/4)*1.5 if ratio<=5 else (1.5-((ratio-5)/5)*.5 if ratio<=10 else 1))
    pg=int(pg*nm*bonus)
    cap=(math.sqrt(max(0,x['kokudaka']))*500+math.sqrt(max(0,x['defense']))*200)*((cl/100)+.5)
    if x['population']>=cap:pg//=20
    x['population']=max(0,min(999999,x['population']+pg))
   # soldier natural growth, close to source structure
   loyalty=cl*.01; db=max(.35,min(1.05,q-.60)); bg=math.sqrt(max(1,x['population']))*((db+loyalty)/2)*1.25
   sg=int(bg/(1+counts[cid]/25)*max(0,1-(x['soldiers']/max(1,x['population']))*1.25)*nm)
   x['soldiers']=min(99999,x['soldiers']+max(0,sg))
   use=int(x['soldiers']*.03)
   if x['rice']<use:x['rice']=0;x['soldiers']=int(x['soldiers']*.95)
   else:x['rice']-=use
   # defenders do occasional recruitment, not coordinated nationally
   if cid!=self.target and x['population']>=3000 and x['soldiers']<min(6500,x['population']*.26) and self.r.random()<.18:
    # draft scale limited by gold; average officer efficiency ~0.3-0.6 soldier/gold
    want=int(x['population']*.004*self.r.uniform(.7,1.4)); afford=int(x['gold']*.40)
    add=max(0,min(want,afford)); x['gold']-=int(add/0.40) if add else 0; x['soldiers']+=add;x['population']-=add;x['loyalty']=max(20,x['loyalty']-max(0,int(2*add/max(1,x['population']+add)*x['loyalty'])))
 def frontier_dist(self):
  ownids={x['id'] for x in self.owned()}; fronts=[]
  for i in ownids:
   if any(self.c[n]['owner']!=self.target for n in self.c[i]['adj']):fronts.append(i)
  dist={i:10**9 for i in ownids};dq=deque()
  for i in fronts:dist[i]=0;dq.append(i)
  while dq:
   i=dq.popleft()
   for n in self.c[i]['adj']:
    if n in ownids and dist[n]>dist[i]+1:dist[n]=dist[i]+1;dq.append(n)
  return fronts,dist
 def player_domestic(self):
  own=self.owned();
  if not own:return
  fronts,dist=self.frontier_dist(); fs=set(fronts)
  q,adm=qual(self.target,self.year)
  eff=max(.24,min(.70,.30+.28*(adm-.9)))
  # Each castle gets a broad strategic domestic policy. Rear castles mainly build the economy;
  # near-front castles recover loyalty or draft only when sustainable.
  for x in own:
   d=dist.get(x['id'],99)
   # conquered/over-drafted areas: player uses charity before further conscription
   if x['loyalty']<68:
    gain=max(3,int(5+8*(adm-.9)))
    if x['gold']>=200:
     x['gold']-=200; x['loyalty']=min(100,x['loyalty']+gain)
    continue
   if d<=1:
    desired=min(x['population']*.24, 3000+260*math.sqrt(len(own)))
    if x['soldiers']<desired and x['population']>=3500 and x['rice']>max(800,x['soldiers']*.5):
     want=int(min(desired-x['soldiers'],x['population']*self.p['draft']))
     afford=int(x['gold']*eff)
     add=max(0,min(want,afford))
     if add>0:
      x['gold']-=math.ceil(add/eff); oldp=x['population']; x['population']-=add
      pen=int(x['loyalty']*(add/max(1,oldp))*2);x['loyalty']=max(0,x['loyalty']-pen);x['soldiers']+=add
      continue
   # economic development proxy for farm/commerce actions by rear or stable castles
   if d>0 and self.r.random()<.55:
    gain=max(2,int(4+7*(adm-.9)))
    if self.r.random()<.58:
     x['kokudaka']=min(max(x['kokudaka'],1)*4, x['kokudaka']+gain)
    else:
     x['commerce']+=gain
  # one-edge-per-month transport from rear toward nearest front
  for x in sorted(own,key=lambda z:dist.get(z['id'],99),reverse=True):
   d=dist.get(x['id'],99)
   if d<=0 or d>=99:continue
   opts=[self.c[n] for n in x['adj'] if self.c[n]['owner']==self.target and dist.get(n,99)<d]
   if not opts:continue
   dst=min(opts,key=lambda z:(dist[z['id']],z['soldiers']))
   reserve=max(250,int(x['population']*.025)); move=max(0,int((x['soldiers']-reserve)*self.p['move']))
   if move>0:x['soldiers']-=move;dst['soldiers']+=move
 def candidates(self):
  out=[]
  for s in self.owned():
   reserve=max(350,int(s['soldiers']*.18));send=s['soldiers']-reserve
   if send<400:continue
   for nid in s['adj']:
    d=self.c[nid]
    if d['owner']==self.target:continue
    aq,_=qual(self.target,self.year);dq,_=qual(d['owner'],self.year) if d['owner']>0 else (.86,.9)
    ap=send*aq*(1+self.p['tact']); dp=max(250,d['soldiers']*dq+d['defense']*1.10)
    ratio=ap/dp
    ownadj=sum(self.c[n]['owner']==self.target for n in d['adj'])
    enemycount=sum(x['owner']==d['owner'] for x in self.c.values()) if d['owner']>0 else 0
    score=ratio + .08*(ownadj-1) + (.17 if enemycount<=2 and d['owner']>0 else 0)+(.22 if d['owner']==0 else 0)
    out.append((score,ratio,s,d,send))
  out.sort(reverse=True,key=lambda a:a[0]);return out
 def fight(self,atkcid,s,d,send,player=True):
  old=d['owner']; aq,_=qual(atkcid,self.year);dq,_=qual(old,self.year) if old>0 else (.86,.9)
  tact=(1+self.p['tact']) if player else 1
  ap=send*aq*tact*self.r.uniform(.90,1.10);dp=max(220,(d['soldiers']*dq+d['defense']*1.10)*self.r.uniform(.90,1.10));ratio=ap/dp
  p=1/(1+math.exp(-3.5*math.log(max(.06,ratio))))
  s['soldiers']-=send
  if self.r.random()<p:
   loss=self.r.uniform(.12,.27)/(max(.8,min(1.5,ratio))**.35);surv=max(80,int(send*(1-loss)));defsurv=int(d['soldiers']*self.r.uniform(.12,.42));absorb=defsurv
   d['owner']=atkcid;d['soldiers']=min(99999,surv+absorb);d['defense']=max(80,int(d['defense']*self.r.uniform(.72,.92)));d['loyalty']=max(30,int(d['loyalty']*.80))
   if atkcid==62 and self.mainland is None and d['id']!=174:self.mainland=self.t
   return True
  else:
   s['soldiers']+=int(send*self.r.uniform(.45,.70));d['soldiers']=max(60,int(d['soldiers']*self.r.uniform(.80,.95)));d['defense']=max(70,int(d['defense']*self.r.uniform(.93,.995)));return False
 def player_attack(self):
  n=self.count(); cap=min(self.p['cap'],self.p['cap0']+n//self.p['div']);used=set()
  for _ in range(cap):
   pick=None
   for score,ratio,s,d,send in self.candidates():
    if s['id'] in used:continue
    # smart Oda waits for May event before attacking Imagawa in Apr
    if self.target==1 and not self.oke and self.year==1560 and self.mon==4 and d['owner']==5:continue
    if ratio>=self.p['th'] or (ratio>=self.p['th']*.84 and self.r.random()<.16):pick=(s,d,send);break
   if not pick:break
   s,d,send=pick;used.add(s['id']);self.fight(self.target,s,d,send,True)
 def enemy_attack_player(self):
  # Only model attacks that matter to player's survival. Each hostile neighboring source has a small chance,
  # with original-AI-like favorable ratio requirement.
  pairs=[]
  for d in self.owned():
   for nid in d['adj']:
    s=self.c[nid]
    if s['owner']<=0 or s['owner']==self.target or s['soldiers']<900:continue
    pairs.append((s,d))
  self.r.shuffle(pairs);attacked_src=set();attacked_dst=set()
  for s,d in pairs:
   if s['id'] in attacked_src or d['id'] in attacked_dst:continue
   if self.r.random()>=self.p['aiatk']:continue
   send=int(s['soldiers']*.60); aq,_=qual(s['owner'],self.year);dq,_=qual(self.target,self.year)
   ratio=(send*aq)/(d['soldiers']*dq+d['defense']*1.1)
   if ratio<1.18:continue
   attacked_src.add(s['id']);attacked_dst.add(d['id']);self.fight(s['owner'],s,d,send,False)
 def step(self):
  self.t+=1;self.mon+=1
  if self.mon>12:self.mon=1;self.year+=1
  self.apply_oke();self.growth();self.player_domestic()
  if self.r.random()<.72:self.player_attack();self.enemy_attack_player()
  else:self.enemy_attack_player();self.player_attack()
  self.maxcast=max(self.maxcast,self.count())
  if self.t in (12,60,120,240,360,480,600):self.checkpoints[self.t]=self.count()
 def run(self):
  while self.t<self.maxm:
   if self.count()==0:return {'result':'gameover','turns':self.t,'year':self.year,'month':self.mon,'max':self.maxcast,'mainland':self.mainland,'cp':self.checkpoints}
   if not self.alive_other():return {'result':'clear','turns':self.t,'year':self.year,'month':self.mon,'max':self.maxcast,'mainland':self.mainland,'cp':self.checkpoints}
   self.step()
  return {'result':'timeout','turns':self.t,'year':self.year,'month':self.mon,'max':self.maxcast,'mainland':self.mainland,'cp':self.checkpoints}

def summ(rs):
 n=len(rs);c=[x['turns'] for x in rs if x['result']=='clear'];g=[x['turns'] for x in rs if x['result']=='gameover'];to=n-len(c)-len(g)
 def q(a):
  if not a:return None
  a=sorted(a); at=lambda p:a[round((len(a)-1)*p)]
  return {'mean':round(sum(a)/len(a),1),'median':statistics.median(a),'p25':at(.25),'p75':at(.75),'min':min(a),'max':max(a)}
 cps={}
 for t in (12,60,120,240,360,480,600):
  vals=[x['cp'].get(t,x['max'] if x['turns']<t else None) for x in rs];vals=[v for v in vals if v is not None]
  if vals:cps[t]=round(statistics.median(vals),1)
 return {'n':n,'clear':len(c),'gameover':len(g),'timeout':to,'clear_rate':round(len(c)/n,3),'gameover_rate':round(len(g)/n,3),'clear_turns':q(c),'gameover_turns':q(g),'median_castles_cp':cps}


def parse_clans(value):
 out=[]
 name_to_id={name:cid for cid,name in CLAN_NAMES.items() if name}
 for token in value.split(','):
  token=token.strip()
  if not token:
   continue
  if token in name_to_id:
   out.append(name_to_id[token]); continue
  try:
   out.append(int(token))
  except ValueError as exc:
   raise ValueError(f'Unknown clan id/name: {token}') from exc
 return out

def run_trials(trials, skills, clans, max_months=900, seed_step=977):
 out={}
 for sk in skills:
  if sk not in PARAMS:
   raise ValueError(f'Unknown skill profile: {sk}. Choose from {", ".join(PARAMS)}')
  for cid in clans:
   if cid not in CLAN_NAMES and not any(x['owner']==cid for x in C0.values()):
    raise ValueError(f'Clan id {cid} does not exist in this scenario')
   rs=[Sim(cid,cid*100003+i*seed_step,sk,max_months).run() for i in range(trials)]
   x=summ(rs)
   if cid==62:
    m=[z['mainland'] for z in rs if z['mainland'] is not None]
    x['mainland']={'rate':round(len(m)/trials,3),'median':statistics.median(m) if m else None,'mean':round(sum(m)/len(m),1) if m else None}
   key=f'{cid}:{sk}'
   out[key]=x
   print(f'{cid} {CLAN_NAMES.get(cid, "?")} {sk} '+json.dumps(x,ensure_ascii=False))
 return out

def build_parser():
 p=argparse.ArgumentParser(description='Approximate player-focused balance simulator')
 p.add_argument('trials', nargs='?', type=int, default=100, help='trials per clan/profile (default: 100)')
 p.add_argument('skills', nargs='?', default='standard', help='comma-separated profiles: cautious,standard,skilled')
 p.add_argument('--scenario', default='1560_okehazama', help='scenario folder under data/scenarios')
 p.add_argument('--clans', default='1,3,62', help='comma-separated clan ids or exact clan names')
 p.add_argument('--max-months', type=int, default=900, help='timeout in simulated months')
 p.add_argument('--project-root', type=Path, default=PROJECT_ROOT, help='project root containing data/')
 p.add_argument('--json-out', type=Path, help='optional JSON output file')
 return p

def main(argv=None):
 args=build_parser().parse_args(argv)
 if args.trials <= 0:
  raise SystemExit('trials must be >= 1')
 load_scenario(args.project_root, args.scenario)
 skills=[x.strip() for x in args.skills.split(',') if x.strip()]
 clans=parse_clans(args.clans)
 out=run_trials(args.trials, skills, clans, args.max_months)
 payload={'scenario':args.scenario,'trials':args.trials,'skills':skills,'clans':clans,'results':out}
 if args.json_out:
  args.json_out.parent.mkdir(parents=True, exist_ok=True)
  args.json_out.write_text(json.dumps(payload,ensure_ascii=False,indent=2),encoding='utf-8')
 print('JSON',json.dumps(payload,ensure_ascii=False))
 return 0

if __name__=='__main__':
 raise SystemExit(main())
