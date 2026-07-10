// backtest/intermarket-lab.js — 인터마켓 상관/베타/상대강도가 '새 예측 축'인지 정직 검증.
// SPY(시장 벤치마크) 대비 각 종목의 intermarket 피처를 날짜정렬로 계산 → 방향·낙폭·이익목표 예측력.
// 규율: 인터마켓 단독이 다수결·지속성 초과하거나, 가격피처에 더해 OOS 개선해야 인정. 아니면 기각(신기루/과장 금지).
"use strict";
const fs = require("fs"), path = require("path");
const DIR = process.argv[2] || "/tmp/claude-1000/-home-jschoi0223-projects-vdiportal-map/f6930b15-5f14-43f4-87f0-3222bca05095/scratchpad/im";
const H = 20, TRAIN_FRAC = 0.6, WARM = 260;

function load(sym){ const p = path.join(DIR, sym + ".json"); if(!fs.existsSync(p)) return null; const d = JSON.parse(fs.readFileSync(p,"utf8")); return (d && d.ok && Array.isArray(d.candles)) ? d.candles : null; }
const SPY = load("SPY");
if(!SPY){ console.error("SPY 없음"); process.exit(1); }
const spyMap = {}; SPY.forEach(c=>{ if(c.t) spyMap[String(c.t).slice(0,10)] = +c.c; });
const STOCKS = fs.readdirSync(DIR).filter(f=>f.endsWith(".json") && f!=="SPY.json").map(f=>f.replace(".json",""));

// 통계 헬퍼
function slopeCorr(x, y){ const n=x.length; if(n<3) return [0,0]; let sx=0,sy=0,sxx=0,syy=0,sxy=0; for(let i=0;i<n;i++){sx+=x[i];sy+=y[i];sxx+=x[i]*x[i];syy+=y[i]*y[i];sxy+=x[i]*y[i];} const cov=sxy/n-(sx/n)*(sy/n), vx=sxx/n-(sx/n)**2, vy=syy/n-(sy/n)**2; const beta=vx>0?cov/vx:0, corr=(vx>0&&vy>0)?cov/Math.sqrt(vx*vy):0; return [beta,corr]; }
function vol(a,e,n){ let s=0,c=0; for(let i=e-n+1;i<=e;i++){ if(i<1)continue; const r=Math.log(a[i]/a[i-1]); s+=r*r; c++; } return c?Math.sqrt(s/c):0; }

// 종목별 정렬 + 피처/타깃
const rows = [];   // {sym, x:{price:[], im:[]}, y:{dir20,dir60,dd,up}, tr}
for(const sym of STOCKS){
  const cd = load(sym); if(!cd) continue;
  // SPY와 공통 날짜만 정렬
  const P=[], M=[]; // stock close, spy close (date-aligned)
  for(const c of cd){ const t=c.t?String(c.t).slice(0,10):null; if(t && spyMap[t]!=null && +c.c>0){ P.push(+c.c); M.push(spyMap[t]); } }
  const N=P.length; if(N < WARM + 60 + 5) { console.error("  skip(짧음) "+sym+" "+N); continue; }
  // 로그수익
  const pr=[0], mr=[0]; for(let i=1;i<N;i++){ pr.push(Math.log(P[i]/P[i-1])); mr.push(Math.log(M[i]/M[i-1])); }
  const local=[];
  for(let t=WARM; t<=N-H-1; t+=3){
    // 인터마켓 피처(과거만)
    const win=(a,n)=>a.slice(t-n+1,t+1);
    const [beta60,corr60]=slopeCorr(win(mr,60),win(pr,60));
    const [,corr20]=slopeCorr(win(mr,20),win(pr,20));
    const [,corr120]=slopeCorr(win(mr,120),win(pr,120));
    const rs60=(P[t]/P[t-60]-1)-(M[t]/M[t-60]-1);          // 상대강도(60일)
    const rs20=(P[t]/P[t-20]-1)-(M[t]/M[t-20]-1);
    const mktVol=vol(M,t,20)*100, mktRet60=Math.log(M[t]/M[t-60]);
    const im=[beta60, corr60, corr20-corr120, rs60, rs20, mktVol, mktRet60];
    // 가격 피처(비교군 — 종목 자체)
    const ret20=Math.log(P[t]/P[t-20]), ret60=Math.log(P[t]/P[t-60]);
    const v20=vol(P,t,20)*100, v60=vol(P,t,60)*100;
    const sma50=P.slice(t-49,t+1).reduce((a,b)=>a+b,0)/50, sma200=P.slice(t-199,t+1).reduce((a,b)=>a+b,0)/200;
    const price=[ret20*100, ret60*100, v20, v60, P[t]/sma50-1, P[t]/sma200-1, (v20/v60-1)];
    if(![...im,...price].every(isFinite)) continue;
    // 타깃
    let lo=Infinity,hi=-Infinity; for(let i=t+1;i<=t+H;i++){ const rr=P[i]/P[t]-1; if(rr<lo)lo=rr; if(rr>hi)hi=rr; }
    const dir20 = P[t+H]>P[t]?1:0;
    local.push({ im, price, dir:dir20, dd: lo<=-0.05?1:0, up: hi>=0.05?1:0 });
  }
  const cut=Math.floor(local.length*TRAIN_FRAC); local.forEach((r,i)=>{ r.tr=i<cut; rows.push(r); });
  console.error("  "+sym+" → "+local.length);
}
console.log("총 "+rows.length+" 시점 · 종목 "+STOCKS.length);

// 로지스틱(표준화·경사하강)
function fit(TR, getx){ const D=getx(TR[0]).length; const mean=new Array(D).fill(0),std=new Array(D).fill(0);
  for(const r of TR){const x=getx(r); for(let j=0;j<D;j++)mean[j]+=x[j];} for(let j=0;j<D;j++)mean[j]/=TR.length;
  for(const r of TR){const x=getx(r); for(let j=0;j<D;j++)std[j]+=(x[j]-mean[j])**2;} for(let j=0;j<D;j++)std[j]=Math.sqrt(std[j]/TR.length)||1;
  let w=new Array(D).fill(0),b=0; const LR=0.1,L2=2e-3,EP=300;
  for(let ep=0;ep<EP;ep++){ const gw=new Array(D).fill(0); let gb=0;
    for(const r of TR){ const x=getx(r); let s=b; for(let j=0;j<D;j++)s+=w[j]*(x[j]-mean[j])/std[j]; const p=1/(1+Math.exp(-s)); const e=p-r._y; for(let j=0;j<D;j++)gw[j]+=e*(x[j]-mean[j])/std[j]; gb+=e; }
    for(let j=0;j<D;j++)w[j]-=LR*(gw[j]/TR.length+L2*w[j]); b-=LR*gb/TR.length; }
  return {mean,std,w,b,getx}; }
function acc(M,TE){ let h=0; for(const r of TE){ let s=M.b; const x=M.getx(r); for(let j=0;j<M.w.length;j++)s+=M.w[j]*(x[j]-M.mean[j])/M.std[j]; if((s>=0?1:0)===r._y)h++; } return h/TE.length; }

function run(key){
  rows.forEach(r=>r._y=r[key]);
  const TR=rows.filter(r=>r.tr), TE=rows.filter(r=>!r.tr);
  let pos=0; for(const r of TE) pos+=r._y; const base=Math.max(pos/TE.length,1-pos/TE.length);
  const P=x=>(x*100).toFixed(1)+"%";
  const mIM=fit(TR,r=>r.im), mPR=fit(TR,r=>r.price), mPI=fit(TR,r=>[...r.price,...r.im]);
  const aIM=acc(mIM,TE),aPR=acc(mPR,TE),aPI=acc(mPI,TE);
  const add=aPI-aPR;
  console.log("── "+key+" (다수결 "+P(base)+") ──");
  console.log("  인터마켓 단독 "+P(aIM)+(aIM>base+0.01?" ✓초과":" (미달)")+"  |  가격만 "+P(aPR)+"  |  가격+인터마켓 "+P(aPI)+"  → 추가효과 "+(add>=0?"+":"")+(add*100).toFixed(1)+"%p"+(add>0.01?" ✓유의":" (무의미)"));
}
console.log("\n=== 인터마켓 상관 검증 (SPY 벤치마크 · OOS 60/40) ===");
["dir","dd","up"].forEach(run);
console.log("\n→ '인터마켓 단독 초과' 또는 '추가효과 +유의'가 있어야 진짜 새 축. 없으면 기각.");
