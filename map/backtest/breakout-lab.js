// 횡보 돌파(range breakout) 검증 — v1.9 '추세 지속/소진'의 짝(range 국면 대상).
// (a) 지속 vs 돌파: range가 H봉 뒤 여전히 range면 지속=1, up/down로 바뀌면 돌파=0.
//     엄밀: 종목외(train↔test disjoint)·test 비중첩·strength-only ablation·다수결 대비.
// (b) 방향 판별: '돌파 예측' 시 실제로 어느 방향(상승/하락)으로 뚫리나(fixtures 미래수익).
// 공유파일 수정 없음. node breakout-lab.js 로 실행(캐시만 로드).
"use strict";
const fs = require("fs"), path = require("path");
const d = require("./regime-hold-records.json");
const FK = ["rsiN","rsiSlope","pctB","dd","ru","distMA20","distMA50","distMA200","slMA20","slMA50","slMA200","vol20","volR","ret5","ret10","ret20"];
const syms = Object.keys(d.bySym);
const P = x => (x*100).toFixed(1) + "%";
const SG = x => (x>=0?"+":"") + (x*100).toFixed(1);

// ── 표준 로지스틱(정규화+L2, exhaust-confirm.js와 동일 하이퍼) ──
function logit(TR, D){
  const mean=Array(D).fill(0), std=Array(D).fill(0);
  for(const r of TR) for(let j=0;j<D;j++) mean[j]+=r.x[j];
  for(let j=0;j<D;j++) mean[j]/=TR.length;
  for(const r of TR) for(let j=0;j<D;j++) std[j]+=(r.x[j]-mean[j])**2;
  for(let j=0;j<D;j++) std[j]=Math.sqrt(std[j]/TR.length)||1;
  let w=Array(D).fill(0), b=0;
  for(let ep=0;ep<400;ep++){
    const gw=Array(D).fill(0); let gb=0;
    for(const r of TR){ let s=b; for(let j=0;j<D;j++) s+=w[j]*(r.x[j]-mean[j])/std[j];
      const p=1/(1+Math.exp(-s)), e=p-r.y;
      for(let j=0;j<D;j++) gw[j]+=e*(r.x[j]-mean[j])/std[j]; gb+=e; }
    for(let j=0;j<D;j++) w[j]-=0.1*(gw[j]/TR.length+2e-3*w[j]); b-=0.1*gb/TR.length;
  }
  return x=>{ let s=b; for(let j=0;j<D;j++) s+=w[j]*(x[j]-mean[j])/std[j]; return 1/(1+Math.exp(-s)); };
}

// ── (a) range 지속/돌파 레코드: 종목별, 비중첩 옵션 ──
function build(H, nonOverlap){
  const out={};
  for(const sym of syms){
    const rs=d.bySym[sym]; const byT={}; for(const r of rs) byT[r.t]=r; const arr=[];
    let lastT=-1e9;
    for(const r of rs){
      if(r.state!=="range") continue;
      const fut=byT[r.t+H]; if(!fut) continue;
      if(nonOverlap && r.t-lastT<H) continue; lastT=r.t;
      // 지속=1 (여전히 range), 돌파=0 (up/down 전환)
      arr.push({strength:r.strength, feat:r.feat, y: fut.state==="range"?1:0, futState:fut.state});
    }
    out[sym]=arr;
  }
  return out;
}

function evalOOS(H){
  const trainSet = syms.filter((_,i)=>i%2===0), testSet = syms.filter((_,i)=>i%2===1);
  const trAll = build(H,false), teAll = build(H,true);
  console.log("── 지평 "+H+"봉 · 종목외(train "+trainSet.length+"종↔test "+testSet.length+"종 disjoint)·test 비중첩 ──");
  const TR=[]; for(const s of trainSet) for(const r of trAll[s]) TR.push(r);
  const TE=[]; for(const s of testSet) for(const r of teAll[s]) TE.push(r);
  let pos=0; for(const r of TE) pos+=r.y; const posRate=pos/TE.length; const maj=Math.max(posRate,1-posRate);
  const mkF=r=>({x:[...FK.map(k=>r.feat[k]),r.strength],y:r.y}), mkS=r=>({x:[r.strength],y:r.y});
  const fF=logit(TR.map(mkF),FK.length+1), fS=logit(TR.map(mkS),1);
  let hF=0,hS=0; for(const r of TE){ const xF=[...FK.map(k=>r.feat[k]),r.strength];
    if((fF(xF)>=0.5?1:0)===r.y)hF++; if((fS([r.strength])>=0.5?1:0)===r.y)hS++; }
  const aF=hF/TE.length, aS=hS/TE.length;
  const conf = aF>maj+0.01 && aF>aS+0.01 ? "  ★확증" : "  (미달)";
  console.log("  range n_te="+TE.length+" 지속률(양성) "+P(posRate)+" | 다수결 "+P(maj)+
    " | strength만 "+P(aS)+"("+SG(aS-maj)+") | 전체 "+P(aF)+"("+SG(aF-maj)+")"+
    "  전체−strength "+SG(aF-aS)+"%p"+conf);
  return {aF,aS,maj,posRate};
}

console.log("=== (a) 횡보 지속 vs 돌파 확증 (종목외 walk-forward · strength ablation) ===");
console.log("★확증 = 전체특성이 미지 종목서 다수결 & strength-only 둘 다 +1%p 초과\n");
[20,40].forEach(evalOOS);

// ── (b) 방향 판별: '돌파 예측' 시 상승/하락 무차별인지 편향인지 ──
console.log("\n=== (b) 방향 판별 — '돌파 예측' 시 실제 어느 방향으로 뚫리나 ===");
console.log("(무차별 → 순수 국면전환 신호 채택 / 방향 편향 크면 방향예측으로 별도 명시)\n");
const price={};
for(const sym of syms){
  const fn=path.join(__dirname,"fixtures",sym.replace(/\//g,"-")+"-1day.json");
  if(fs.existsSync(fn)) price[sym]=JSON.parse(fs.readFileSync(fn,"utf8")).candle.map(c=>c.c);
}
function dirEval(H){
  const trainSet=syms.filter((_,i)=>i%2===0);
  const TR=[],TE=[];
  for(const sym of syms){
    const rs=d.bySym[sym], pr=price[sym]; if(!pr) continue;
    const byT={}; for(const r of rs) byT[r.t]=r; const isTr=trainSet.includes(sym); let lastT=-1e9;
    for(const r of rs){
      if(r.state!=="range") continue; const fut=byT[r.t+H]; if(!fut) continue; if(r.t+H>=pr.length) continue;
      const fret=pr[r.t+H]/pr[r.t]-1;
      const rec={x:[...FK.map(k=>r.feat[k]),r.strength], y: fut.state==="range"?1:0, fret, futState:fut.state};
      if(isTr) TR.push(rec); else { if(r.t-lastT<H) continue; lastT=r.t; TE.push(rec); }
    }
  }
  const f=logit(TR.map(r=>({x:r.x,y:r.y})),FK.length+1);
  // '돌파 예측' = 모델 p<0.5 (지속 아님)
  let gPer={n:0,s:0,up:0,toUp:0,toDown:0}, gBrk={n:0,s:0,up:0,toUp:0,toDown:0};
  for(const r of TE){ const p=f(r.x); const g=p>=0.5?gPer:gBrk; g.n++; g.s+=r.fret; if(r.fret>0)g.up++;
    if(r.futState==="up")g.toUp++; else if(r.futState==="down")g.toDown++; }
  const allUp=TE.filter(r=>r.fret>0).length/TE.length;
  console.log("[range국면] 향후"+H+"봉 실제수익 — 전체 상승률 "+P(allUp)+" (n_te="+TE.length+")");
  console.log("  '지속 예측'(n"+gPer.n+"): 평균 "+(gPer.s/gPer.n*100).toFixed(2)+"% · 상승률 "+P(gPer.up/Math.max(gPer.n,1)));
  console.log("  '돌파 예측'(n"+gBrk.n+"): 평균 "+(gBrk.s/gBrk.n*100).toFixed(2)+"% · 상승률 "+P(gBrk.up/Math.max(gBrk.n,1))+
    " · 전환행선 →up "+gBrk.toUp+" / →down "+gBrk.toDown+" / 여전히range "+(gBrk.n-gBrk.toUp-gBrk.toDown));
  const brkUp=gBrk.up/Math.max(gBrk.n,1);
  const dUp=brkUp-0.5;
  console.log("  → '돌파 예측'의 상승률 "+P(brkUp)+" (50% 기준 "+SG(dUp)+"%p) "+
    (Math.abs(dUp)<0.05?"→ 무차별(순수 국면전환 신호)":"→ 방향 편향 존재(방향예측 성격)"));
}
[20,40].forEach(dirEval);
