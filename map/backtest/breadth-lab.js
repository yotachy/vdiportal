// backtest/breadth-lab.js — '시장 폭(market breadth)'이 새 예측 축인지 정직 검증.
// 17종 미국주식을 날짜정렬해 매 시점 횡단면 breadth(50MA위 비율·상승비율·분산·평균상관·breadth모멘텀)를
// 과거만으로 계산 → (a) SPY 미래방향(20·60봉) (b) 시장 낙폭(20봉 5%) (c) 개별종목 낙폭·방향 예측력 검증.
// 규율: breadth 단독이 ①다수결 ②지속성 두 베이스라인을 모두 ≥+1%p 초과하거나,
//       가격피처에 더해 OOS 개선(+≥1%p)해야 인정. 아니면 기각(신기루·과장 금지).
// OOS: 시계열 앞 60% train / 뒤 40% test. lookahead 금지(각 시점 과거만). 공유파일 수정 안 함(읽기 전용).
"use strict";
const fs = require("fs"), path = require("path");
const DIR = process.argv[2] || "/tmp/claude-1000/-home-jschoi0223-projects-vdiportal-map/f6930b15-5f14-43f4-87f0-3222bca05095/scratchpad/im";
const TRAIN_FRAC = 0.6, WARM = 260;
const STEP_MKT = 5;   // 시장(SPY) 타깃: 20/60봉 겹침 완화 위해 5봉 간격
const STEP_IND = 3;   // 개별종목 풀링

// ── 로드 & 공통날짜 정렬 ─────────────────────────────────────────────
function loadMap(sym){ const p=path.join(DIR,sym+".json"); if(!fs.existsSync(p))return null;
  const d=JSON.parse(fs.readFileSync(p,"utf8")); if(!(d&&d.ok&&Array.isArray(d.candles)))return null;
  const m={}; for(const c of d.candles){ if(c.t&&+c.c>0) m[String(c.t).slice(0,10)]=+c.c; } return m; }
const spyM = loadMap("SPY"); if(!spyM){ console.error("SPY 없음"); process.exit(1); }
const STOCKS = fs.readdirSync(DIR).filter(f=>f.endsWith(".json")&&f!=="SPY.json").map(f=>f.replace(".json",""));
const stMaps = {}; for(const s of STOCKS){ const m=loadMap(s); if(m) stMaps[s]=m; }
const syms = Object.keys(stMaps);
// 전 종목+SPY 공통 날짜만(횡단면 분모 고정)
const dates = Object.keys(spyM).sort().filter(t=> syms.every(s=>stMaps[s][t]!=null));
const N = dates.length;
const SPY = dates.map(t=>spyM[t]);
const MAT = syms.map(s=> dates.map(t=>stMaps[s][t]));   // MAT[stockIdx][dateIdx]
console.log("공통 날짜 "+N+" ("+dates[0]+"~"+dates[N-1]+") · 종목 "+syms.length);

// ── 헬퍼 ─────────────────────────────────────────────────────────────
const logret = a=>{ const r=[0]; for(let i=1;i<a.length;i++) r.push(Math.log(a[i]/a[i-1])); return r; };
const SPYr = logret(SPY);
const STr  = MAT.map(logret);
function vol(a,e,n){ let s=0,c=0; for(let i=e-n+1;i<=e;i++){ if(i<1)continue; const r=Math.log(a[i]/a[i-1]); s+=r*r; c++; } return c?Math.sqrt(s/c):0; }
function sma(a,e,n){ let s=0; for(let i=e-n+1;i<=e;i++)s+=a[i]; return s/n; }
function corr(x,y){ const n=x.length; let sx=0,sy=0,sxx=0,syy=0,sxy=0; for(let i=0;i<n;i++){sx+=x[i];sy+=y[i];sxx+=x[i]*x[i];syy+=y[i]*y[i];sxy+=x[i]*y[i];}
  const cov=sxy/n-(sx/n)*(sy/n), vx=sxx/n-(sx/n)**2, vy=syy/n-(sy/n)**2; return (vx>1e-12&&vy>1e-12)?cov/Math.sqrt(vx*vy):0; }
function std(arr){ const n=arr.length; if(!n)return 0; const m=arr.reduce((a,b)=>a+b,0)/n; let s=0; for(const v of arr)s+=(v-m)**2; return Math.sqrt(s/n); }

// ── 시점별 breadth 피처(과거만, dateIdx t) ───────────────────────────
function breadthAt(t){
  let ab50=0, ab200=0, adv=0;
  const r20=[]; // 종목별 20일 누적수익(분산용)
  for(let k=0;k<syms.length;k++){
    const c=MAT[k], cl=c[t];
    if(cl>sma(c,t,50)) ab50++;
    if(cl>sma(c,t,200)) ab200++;
    if(c[t]>c[t-1]) adv++;
    r20.push(c[t]/c[t-20]-1);
  }
  const n=syms.length;
  // 5일 평균 상승비율
  let adv5=0; for(let d=0;d<5;d++){ let a=0; for(let k=0;k<syms.length;k++) if(MAT[k][t-d]>MAT[k][t-d-1])a++; adv5+=a/n; } adv5/=5;
  // 평균 쌍상관(20일 일간수익)
  const wins = STr.map(r=>r.slice(t-19,t+1));
  let cs=0,cc=0; for(let i=0;i<n;i++)for(let j=i+1;j<n;j++){ cs+=corr(wins[i],wins[j]); cc++; }
  const avgcorr = cc?cs/cc:0;
  return { ab50:ab50/n, ab200:ab200/n, adv:adv/n, adv5, disp:std(r20), avgcorr };
}
// breadth 시계열 선계산(모멘텀용)
const BF = new Array(N).fill(null);
for(let t=WARM-25;t<=N-1;t++) BF[t]=breadthAt(t);
function bvec(t){ const b=BF[t], b20=BF[t-20];
  return [ b.ab50, b.ab200, b.adv, b.adv5, b.disp*100, b.avgcorr, b.ab50-b20.ab50, b.ab200-b20.ab200 ]; }

// SPY 가격피처
function spyPrice(t){ return [ Math.log(SPY[t]/SPY[t-20])*100, Math.log(SPY[t]/SPY[t-60])*100,
  vol(SPY,t,20)*100, vol(SPY,t,60)*100, SPY[t]/sma(SPY,t,50)-1, SPY[t]/sma(SPY,t,200)-1, vol(SPY,t,20)/vol(SPY,t,60)-1 ]; }
// 개별종목 가격피처
function stkPrice(k,t){ const c=MAT[k]; return [ Math.log(c[t]/c[t-20])*100, Math.log(c[t]/c[t-60])*100,
  vol(c,t,20)*100, vol(c,t,60)*100, c[t]/sma(c,t,50)-1, c[t]/sma(c,t,200)-1, vol(c,t,20)/vol(c,t,60)-1 ]; }

// ── 로지스틱(표준화·경사하강) ───────────────────────────────────────
function fit(TR,getx){ const D=getx(TR[0]).length; const mean=new Array(D).fill(0),sd=new Array(D).fill(0);
  for(const r of TR){const x=getx(r);for(let j=0;j<D;j++)mean[j]+=x[j];} for(let j=0;j<D;j++)mean[j]/=TR.length;
  for(const r of TR){const x=getx(r);for(let j=0;j<D;j++)sd[j]+=(x[j]-mean[j])**2;} for(let j=0;j<D;j++)sd[j]=Math.sqrt(sd[j]/TR.length)||1;
  let w=new Array(D).fill(0),b=0; const LR=0.1,L2=2e-3,EP=300;
  for(let ep=0;ep<EP;ep++){ const gw=new Array(D).fill(0); let gb=0;
    for(const r of TR){ const x=getx(r); let s=b; for(let j=0;j<D;j++)s+=w[j]*(x[j]-mean[j])/sd[j]; const p=1/(1+Math.exp(-s)); const e=p-r._y; for(let j=0;j<D;j++)gw[j]+=e*(x[j]-mean[j])/sd[j]; gb+=e; }
    for(let j=0;j<D;j++)w[j]-=LR*(gw[j]/TR.length+L2*w[j]); b-=LR*gb/TR.length; }
  return {mean,std:sd,w,b,getx}; }
function score(M,r){ let s=M.b; const x=M.getx(r); for(let j=0;j<M.w.length;j++)s+=M.w[j]*(x[j]-M.mean[j])/M.std[j]; return s; }
function acc(M,TE){ let h=0; for(const r of TE) if((score(M,r)>=0?1:0)===r._y)h++; return h/TE.length; }
function posRate(M,TE){ let p=0; for(const r of TE) if(score(M,r)>=0)p++; return p/TE.length; }
// AUC(0.5임계 무관 순위 신호) — Mann-Whitney
function auc(M,TE){ const s=TE.map(r=>({v:score(M,r),y:r._y})); s.sort((a,b)=>a.v-b.v);
  let rank=0,i=0,rsumPos=0,nPos=0,nNeg=0; while(i<s.length){ let j=i; while(j<s.length&&s[j].v===s[i].v)j++;
    const avg=(i+j-1)/2+1; for(let k=i;k<j;k++){ if(s[k].y===1){ rsumPos+=avg; nPos++; } else nNeg++; } i=j; }
  if(!nPos||!nNeg)return 0.5; return (rsumPos-nPos*(nPos+1)/2)/(nPos*nNeg); }
const P=x=>(x*100).toFixed(1)+"%";

// ── 타깃 빌드 ───────────────────────────────────────────────────────
// 시장(SPY) 시점 행: breadth·spyPrice·타깃·persistence
function ddMin(a,t,H){ let lo=Infinity; for(let i=t+1;i<=t+H;i++){ const rr=a[i]/a[t]-1; if(rr<lo)lo=rr; } return lo; }
function ddMinPast(a,t,H){ let lo=Infinity; for(let i=t-H+1;i<=t;i++){ if(i<1)continue; const rr=a[i]/a[t-H]-1; if(rr<lo)lo=rr; } return lo; }

const mkt = [];
for(let t=WARM;t<=N-61;t+=STEP_MKT){
  const b=bvec(t), pr=spyPrice(t); if(![...b,...pr].every(isFinite))continue;
  const dir20 = SPY[t+20]>SPY[t]?1:0, dir60=SPY[t+60]>SPY[t]?1:0;
  const dd20 = ddMin(SPY,t,20)<=-0.05?1:0;
  // persistence: 현재 20/60일 방향 지속 / 과거 20봉 낙폭상태 지속
  const per_dir20 = SPY[t]>SPY[t-20]?1:0, per_dir60=SPY[t]>SPY[t-60]?1:0;
  const per_dd20 = ddMinPast(SPY,t,20)<=-0.05?1:0;
  mkt.push({ b, pr, dir20, dir60, dd20, per_dir20, per_dir60, per_dd20 });
}
const mcut=Math.floor(mkt.length*TRAIN_FRAC); mkt.forEach((r,i)=>r.tr=i<mcut);

// 개별종목 풀링 행: breadth(공유)·stkPrice·개별 dd/dir
const ind=[];
for(let k=0;k<syms.length;k++){
  const local=[];
  for(let t=WARM;t<=N-21;t+=STEP_IND){
    const b=bvec(t), pr=stkPrice(k,t); if(![...b,...pr].every(isFinite))continue;
    const c=MAT[k];
    const dd20=ddMin(c,t,20)<=-0.05?1:0, dir20=c[t+20]>c[t]?1:0;
    const per_dd20=ddMinPast(c,t,20)<=-0.05?1:0, per_dir20=c[t]>c[t-20]?1:0;
    local.push({ b, pr, dd20, dir20, per_dd20, per_dir20 });
  }
  const cut=Math.floor(local.length*TRAIN_FRAC); local.forEach((r,i)=>{ r.tr=i<cut; ind.push(r); });
}
console.log("시장 시점 "+mkt.length+" · 개별 풀링 "+ind.length+"\n");

// ── 실행 ────────────────────────────────────────────────────────────
function perAcc(TE,key){ let h=0; for(const r of TE) if(r[key]===r._y)h++; return h/TE.length; }
function run(rows,ykey,perKey,label){
  rows.forEach(r=>r._y=r[ykey]);
  const TR=rows.filter(r=>r.tr), TE=rows.filter(r=>!r.tr);
  let pos=0; for(const r of TE)pos+=r._y; const maj=Math.max(pos/TE.length,1-pos/TE.length);
  const per=perAcc(TE,perKey);
  const mB=fit(TR,r=>r.b), mP=fit(TR,r=>r.pr), mPB=fit(TR,r=>[...r.pr,...r.b]);
  const aB=acc(mB,TE),aP=acc(mP,TE),aPB=acc(mPB,TE);
  const base=Math.max(maj,per);           // 이중 베이스라인 중 강한 쪽
  const soloPass = aB>=base+0.01;
  const add=aPB-aP, addPass=add>=0.01;
  // 진단: 순위신호(AUC)·train누수·예측 양성률(붕괴 여부)
  const aucB=auc(mB,TE), aucPB=auc(mPB,TE), aucP=auc(mP,TE);
  const trB=acc(mB,TR), prB=posRate(mB,TE);
  console.log("── "+label+" (n_test="+TE.length+", 양성 "+P(pos/TE.length)+") ──");
  console.log("  베이스라인:  다수결 "+P(maj)+"  |  지속성 "+P(per)+"   → 강한쪽 "+P(base));
  console.log("  breadth단독 "+P(aB)+(soloPass?"  ✓초과":"  (미달)")+"   |   가격만 "+P(aP)+"   |   가격+breadth "+P(aPB)
    +"   → 추가효과 "+(add>=0?"+":"")+(add*100).toFixed(1)+"%p"+(addPass?" ✓유의":" (무의미)"));
  console.log("  진단: AUC breadth "+aucB.toFixed(3)+" · 가격 "+aucP.toFixed(3)+" · 가격+breadth "+aucPB.toFixed(3)
    +"   |  breadth단독 train정확도 "+P(trB)+" · test예측양성률 "+P(prB));
  console.log("");
  return {label, ntest:TE.length, pos:pos/TE.length, maj, per, base, aB, aP, aPB, add, soloPass, addPass};
}

console.log("=== 시장 폭(breadth) 검증 · OOS 60/40 · 이중 베이스라인 ===\n");
const R=[];
R.push(run(mkt,"dir20","per_dir20","(a) SPY 방향 20봉"));
R.push(run(mkt,"dir60","per_dir60","(a) SPY 방향 60봉"));
R.push(run(mkt,"dd20","per_dd20", "(b) 시장(SPY) 낙폭 20봉 -5%"));
R.push(run(ind,"dd20","per_dd20", "(c) 개별종목 낙폭 20봉 -5%"));
R.push(run(ind,"dir20","per_dir20","(c') 개별종목 방향 20봉"));

// ── 판정 요약 ───────────────────────────────────────────────────────
console.log("=== 판정 요약 ===");
for(const r of R){
  const pass = r.soloPass || r.addPass;
  console.log("  "+r.label.padEnd(26)+"  단독 "+P(r.aB)+" vs 강베이스 "+P(r.base)
    +"  ·  추가효과 "+(r.add>=0?"+":"")+(r.add*100).toFixed(1)+"%p"
    +"   → "+(pass?"★ 축 후보":"기각"));
}
console.log("\n→ breadth단독이 다수결·지속성 둘다 ≥+1%p 초과(=강한쪽 대비 ✓) 또는 가격+breadth 추가효과 ≥+1%p 여야 '진짜 새 축'.");
