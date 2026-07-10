// 추세소진이 방향 edge인지 순수 국면신호인지 판별 — up국면 '지속예측' vs '소진예측' 실제 미래수익.
"use strict";
const fs=require("fs"),path=require("path");
const d=require("./regime-hold-records.json");
const FK=["rsiN","rsiSlope","pctB","dd","ru","distMA20","distMA50","distMA200","slMA20","slMA50","slMA200","vol20","volR","ret5","ret10","ret20"];
const syms=Object.keys(d.bySym),H=20;
function logit(TR,D){const mean=Array(D).fill(0),std=Array(D).fill(0);for(const r of TR)for(let j=0;j<D;j++)mean[j]+=r.x[j];for(let j=0;j<D;j++)mean[j]/=TR.length;for(const r of TR)for(let j=0;j<D;j++)std[j]+=(r.x[j]-mean[j])**2;for(let j=0;j<D;j++)std[j]=Math.sqrt(std[j]/TR.length)||1;let w=Array(D).fill(0),b=0;for(let ep=0;ep<400;ep++){const gw=Array(D).fill(0);let gb=0;for(const r of TR){let s=b;for(let j=0;j<D;j++)s+=w[j]*(r.x[j]-mean[j])/std[j];const p=1/(1+Math.exp(-s)),e=p-r.y;for(let j=0;j<D;j++)gw[j]+=e*(r.x[j]-mean[j])/std[j];gb+=e;}for(let j=0;j<D;j++)w[j]-=0.1*(gw[j]/TR.length+2e-3*w[j]);b-=0.1*gb/TR.length;}return x=>{let s=b;for(let j=0;j<D;j++)s+=w[j]*(x[j]-mean[j])/std[j];return 1/(1+Math.exp(-s));};}
const price={}; for(const sym of syms){ const fn=path.join(__dirname,"fixtures",sym.replace(/\//g,"-")+"-1day.json"); if(fs.existsSync(fn)) price[sym]=JSON.parse(fs.readFileSync(fn,"utf8")).candle.map(c=>c.c); }
const trainSet=syms.filter((_,i)=>i%2===0);
for(const st of ["up","down"]){
  const TR=[],TE=[];
  for(const sym of syms){ const rs=d.bySym[sym],pr=price[sym]; if(!pr)continue; const byT={};for(const r of rs)byT[r.t]=r; const isTr=trainSet.includes(sym); let lastT=-1e9;
    for(const r of rs){ if(r.state!==st)continue; const fut=byT[r.t+H]; if(!fut)continue; if(r.t+H>=pr.length)continue;
      const fret=pr[r.t+H]/pr[r.t]-1; const rec={x:[...FK.map(k=>r.feat[k]),r.strength],y:fut.state===r.state?1:0,fret};
      if(isTr)TR.push(rec); else{ if(r.t-lastT<H)continue; lastT=r.t; TE.push(rec);} } }
  const f=logit(TR.map(r=>({x:r.x,y:r.y})),FK.length+1);
  let gPer={n:0,s:0,up:0},gExh={n:0,s:0,up:0};
  for(const r of TE){ const p=f(r.x); const g=p>=0.5?gPer:gExh; g.n++; g.s+=r.fret; if(r.fret>0)g.up++; }
  const allUp=TE.filter(r=>r.fret>0).length/TE.length;
  const P=x=>(x*100).toFixed(1)+"%";
  console.log("["+st+"국면] 향후"+H+"봉 실제수익 — 전체 상승률 "+P(allUp));
  console.log("  '지속 예측'(n"+gPer.n+"): 평균 "+(gPer.s/gPer.n*100).toFixed(2)+"% · 상승률 "+P(gPer.up/gPer.n));
  console.log("  '소진 예측'(n"+gExh.n+"): 평균 "+(gExh.s/gExh.n*100).toFixed(2)+"% · 상승률 "+P(gExh.up/gExh.n));
  const dUp=(gPer.up/gPer.n)-(gExh.up/gExh.n);
  console.log("  → 지속−소진 상승률 차이 "+((dUp>=0?"+":"")+(dUp*100).toFixed(1))+"%p "+(Math.abs(dUp)<0.05?"(무차별 → 순수 국면신호)":"(방향 편향 존재)"));
}
