// 추세 지속/소진 멀티지평 곡선 학습 — H=10/20/40, up/down별 전량학습 계수 + 종목외 OOS.
"use strict";
const d=require("./regime-hold-records.json");
const FK=["rsiN","rsiSlope","pctB","dd","ru","distMA20","distMA50","distMA200","slMA20","slMA50","slMA200","vol20","volR","ret5","ret10","ret20"];
const syms=Object.keys(d.bySym);
function fit(TR,D){const mean=Array(D).fill(0),std=Array(D).fill(0);for(const r of TR)for(let j=0;j<D;j++)mean[j]+=r.x[j];for(let j=0;j<D;j++)mean[j]/=TR.length;for(const r of TR)for(let j=0;j<D;j++)std[j]+=(r.x[j]-mean[j])**2;for(let j=0;j<D;j++)std[j]=Math.sqrt(std[j]/TR.length)||1;let w=Array(D).fill(0),b=0;for(let ep=0;ep<500;ep++){const gw=Array(D).fill(0);let gb=0;for(const r of TR){let s=b;for(let j=0;j<D;j++)s+=w[j]*(r.x[j]-mean[j])/std[j];const p=1/(1+Math.exp(-s)),e=p-r.y;for(let j=0;j<D;j++)gw[j]+=e*(r.x[j]-mean[j])/std[j];gb+=e;}for(let j=0;j<D;j++)w[j]-=0.1*(gw[j]/TR.length+2e-3*w[j]);b-=0.1*gb/TR.length;}return{mean,std,w,b};}
function accM(M,TE){let h=0,pos=0;for(const r of TE){let s=M.b;for(let j=0;j<M.w.length;j++)s+=M.w[j]*(r.x[j]-M.mean[j])/M.std[j];if((s>=0?1:0)===r.y)h++;if(r.y)pos++;}return{acc:h/TE.length,base:Math.max(pos/TE.length,1-pos/TE.length),pos:pos/TE.length};}
function recs(state,H){const tr=[],te=[];const trainSet=syms.filter((_,i)=>i%2===0);
  for(const sym of syms){const rs=d.bySym[sym];const byT={};for(const r of rs)byT[r.t]=r;const isTr=trainSet.includes(sym);let lastT=-1e9;
    for(const r of rs){if(r.state!==state)continue;const fut=byT[r.t+H];if(!fut)continue;const x=[...FK.map(k=>r.feat[k]),r.strength],y=fut.state===r.state?1:0;
      if(isTr)tr.push({x,y});else{if(r.t-lastT<H)continue;lastT=r.t;te.push({x,y});}}}
  const all=[];for(const sym of syms){const rs=d.bySym[sym];const byT={};for(const r of rs)byT[r.t]=r;for(const r of rs){if(r.state!==state)continue;const fut=byT[r.t+H];if(!fut)continue;all.push({x:[...FK.map(k=>r.feat[k]),r.strength],y:fut.state===r.state?1:0});}}
  return{tr,te,all};}
const R=a=>a.map(x=>+x.toFixed(5));
for(const H of [10,20,40]){
  console.log("\n============ 지평 H="+H+"봉 ============");
  for(const st of ["up","down"]){
    const {tr,te,all}=recs(st,H);
    const oos=accM(fit(tr,17),te), full=fit(all,17), insamp=accM(full,all);
    console.log("["+st+"] 종목외OOS "+(oos.acc*100).toFixed(1)+"%(다수결"+(oos.base*100).toFixed(1)+"·양성"+(oos.pos*100).toFixed(1)+") base="+Math.round(insamp.pos*100)+" acc="+Math.round(oos.acc*100));
    console.log("  M="+JSON.stringify(R(full.mean)));
    console.log("  S="+JSON.stringify(R(full.std)));
    console.log("  W="+JSON.stringify(R(full.w)));
    console.log("  B="+(+full.b.toFixed(5)));
  }
}
