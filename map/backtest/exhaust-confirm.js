// 추세 소진 확증 — up/down 국면이 H봉 뒤 지속(persist)하나 소진(→전환)하나 예측.
// 엄밀: 종목외(out-of-symbol) 분리(train종목↔test종목 disjoint) + strength-only ablation + 비중첩 test.
"use strict";
const d = require("./regime-hold-records.json");
const FK = ["rsiN","rsiSlope","pctB","dd","ru","distMA20","distMA50","distMA200","slMA20","slMA50","slMA200","vol20","volR","ret5","ret10","ret20"];
const syms = Object.keys(d.bySym);
function logit(TR, D){ const mean=Array(D).fill(0),std=Array(D).fill(0);
  for(const r of TR)for(let j=0;j<D;j++)mean[j]+=r.x[j]; for(let j=0;j<D;j++)mean[j]/=TR.length;
  for(const r of TR)for(let j=0;j<D;j++)std[j]+=(r.x[j]-mean[j])**2; for(let j=0;j<D;j++)std[j]=Math.sqrt(std[j]/TR.length)||1;
  let w=Array(D).fill(0),b=0; for(let ep=0;ep<400;ep++){const gw=Array(D).fill(0);let gb=0;
    for(const r of TR){let s=b;for(let j=0;j<D;j++)s+=w[j]*(r.x[j]-mean[j])/std[j];const p=1/(1+Math.exp(-s)),e=p-r.y;for(let j=0;j<D;j++)gw[j]+=e*(r.x[j]-mean[j])/std[j];gb+=e;}
    for(let j=0;j<D;j++)w[j]-=0.1*(gw[j]/TR.length+2e-3*w[j]);b-=0.1*gb/TR.length;}
  return x=>{let s=b;for(let j=0;j<D;j++)s+=w[j]*(x[j]-mean[j])/std[j];return 1/(1+Math.exp(-s));};}
function build(H, nonOverlap){ // 종목별 (feat,strength,state,persist@H) — 비중첩 옵션(test 누출↓)
  const out={};
  for(const sym of syms){ const rs=d.bySym[sym]; const byT={}; for(const r of rs) byT[r.t]=r; const arr=[];
    let lastT=-1e9;
    for(const r of rs){ if(r.state!=="up"&&r.state!=="down")continue; const fut=byT[r.t+H]; if(!fut)continue;
      if(nonOverlap && r.t-lastT<H) continue; lastT=r.t;
      arr.push({state:r.state, strength:r.strength, feat:r.feat, y: fut.state===r.state?1:0}); }
    out[sym]=arr; }
  return out;
}
function evalOOS(H){
  const trainSet = syms.filter((_,i)=>i%2===0), testSet = syms.filter((_,i)=>i%2===1); // 종목 교대 분리
  const trAll = build(H,false), teAll = build(H,true); // train 전량·test 비중첩
  const P=x=>(x*100).toFixed(1)+"%";
  console.log("── 지평 "+H+"봉 · 종목외(train "+trainSet.length+"종↔test "+testSet.length+"종 disjoint)·test 비중첩 ──");
  for(const st of ["up","down"]){
    const TR=[]; for(const s of trainSet) for(const r of trAll[s]) if(r.state===st) TR.push(r);
    const TE=[]; for(const s of testSet) for(const r of teAll[s]) if(r.state===st) TE.push(r);
    if(TR.length<200||TE.length<100){ console.log("  "+st+": 표본부족 (tr"+TR.length+" te"+TE.length+")"); continue; }
    let pos=0; for(const r of TE) pos+=r.y; const maj=Math.max(pos/TE.length,1-pos/TE.length);
    const mkF=r=>({x:[...FK.map(k=>r.feat[k]),r.strength],y:r.y}), mkS=r=>({x:[r.strength],y:r.y});
    const fF=logit(TR.map(mkF),FK.length+1), fS=logit(TR.map(mkS),1);
    let hF=0,hS=0; for(const r of TE){ const xF=[...FK.map(k=>r.feat[k]),r.strength]; if((fF(xF)>=0.5?1:0)===r.y)hF++; if((fS([r.strength])>=0.5?1:0)===r.y)hS++; }
    const aF=hF/TE.length,aS=hS/TE.length;
    console.log("  "+st.padEnd(5)+" n_te="+TE.length+" 양성률 "+P(pos/TE.length)+" | 다수결 "+P(maj)+" | strength만 "+P(aS)+"("+((aS-maj>=0?"+":"")+((aS-maj)*100).toFixed(1))+") | 전체 "+P(aF)+"("+((aF-maj>=0?"+":"")+((aF-maj)*100).toFixed(1))+")"+
      "  전체−strength "+((aF-aS>=0?"+":"")+((aF-aS)*100).toFixed(1))+"%p"+(aF>maj+0.01&&aF>aS+0.01?"  ★확증":"  (미달)"));
  }
}
console.log("=== 추세 소진 확증 (종목외 walk-forward · strength ablation) ===");
console.log("★확증 = 전체특성이 미지 종목서 다수결 & strength-only 둘 다 +1%p 초과\n");
[20,40].forEach(evalOOS);
console.log("\n→ 종목외에서도 '전체−strength'가 견고히 +면 추세소진은 진짜 새 축(비방향·국면전환).");
