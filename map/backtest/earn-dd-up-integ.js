// 급변·변동성 축 실적 통합 — 각 축의 배포 baseline 대비 실적5 증분 + 계수 추출.
"use strict";
const fs=require("fs"),path=require("path");
const data=JSON.parse(fs.readFileSync(path.join(__dirname,"earn-ohlc.json"),"utf8"));
const H=20,WARM=260,STRIDE=3,TRAIN_FRAC=0.6;
function rvol(a,e,n){let s=0;for(let i=e-n+1;i<=e;i++)s+=Math.log(a[i]/a[i-1])**2;return Math.sqrt(s/n);}
function atrp(hi,lo,cl,e,n){let s=0;for(let i=e-n+1;i<=e;i++){const tr=Math.max(hi[i]-lo[i],Math.abs(hi[i]-cl[i-1]),Math.abs(lo[i]-cl[i-1]));s+=tr;}return s/n/cl[e];}
function gk(op,hi,lo,cl,e,n){let s=0;for(let i=e-n+1;i<=e;i++){const u=Math.log(hi[i]/lo[i]),d=Math.log(cl[i]/op[i]);s+=0.5*u*u-(2*Math.log(2)-1)*d*d;}const v=s/n;return v>0?Math.sqrt(v):0;}
function vol10(price,hi,lo,t){const v10=rvol(price,t,10),v20=rvol(price,t,20),v60=rvol(price,t,60),v120=rvol(price,t,120);if(!v20||!v60||!v120)return null;const atr=atrp(hi,lo,price,t,14);const vs=[];for(let k=t-40;k<=t;k+=5){const vv=rvol(price,k,20);if(vv)vs.push(vv);}const vm=vs.reduce((a,b)=>a+b,0)/vs.length,vov=Math.sqrt(vs.reduce((a,b)=>a+(b-vm)**2,0)/vs.length)/(vm||1);let rng=0;for(let i=t-4;i<=t;i++)rng+=(hi[i]-lo[i])/price[i];rng/=5;const hist=[];for(let k=t-252;k<=t;k+=3){if(k-20>=0){const vv=rvol(price,k,20);if(vv)hist.push(vv);}}let pct=0.5;if(hist.length>5){let c=0;for(const v of hist)if(v<=v20)c++;pct=c/hist.length;}return[v10/v60-1,v20/v60-1,v20/v120-1,v60/v120-1,atr*100,vov,rng*100,v20*100,Math.log(v20/v60),pct];}
function earnF(tN,sc,t){const tn=tN[t],s=sc[t];const vis=tn<=20?tn:99;return[tn<=10?1:0,tn<=20?1:0,vis===99?1:vis/20,Math.min(s,20)/20,s<=5?1:0];}
function eIdx(dates,ed){const x=[];for(const e of ed){let lo=0,hi=dates.length;while(lo<hi){const m=(lo+hi)>>1;if(dates[m]<e)lo=m+1;else hi=m;}if(lo<dates.length)x.push(lo);}return[...new Set(x)].sort((a,b)=>a-b);}
function tNA(N,ei){const o=new Array(N).fill(9999);let p=0;for(let i=0;i<N;i++){while(p<ei.length&&ei[p]<i)p++;if(p<ei.length)o[i]=ei[p]-i;}return o;}
function sA(N,ei){const o=new Array(N).fill(9999);let p=ei.length-1;for(let i=N-1;i>=0;i--){while(p>=0&&ei[p]>i)p--;if(p>=0)o[i]=i-ei[p];}return o;}
function fit(TR,D,EP){EP=EP||350;const mean=new Array(D).fill(0),std=new Array(D).fill(0);for(const r of TR)for(let j=0;j<D;j++)mean[j]+=r.x[j];for(let j=0;j<D;j++)mean[j]/=TR.length;for(const r of TR)for(let j=0;j<D;j++)std[j]+=(r.x[j]-mean[j])**2;for(let j=0;j<D;j++)std[j]=Math.sqrt(std[j]/TR.length)||1;let w=new Array(D).fill(0),b=0;for(let ep=0;ep<EP;ep++){const gw=new Array(D).fill(0);let gb=0;for(const r of TR){let s=b;for(let j=0;j<D;j++)s+=w[j]*(r.x[j]-mean[j])/std[j];const p=1/(1+Math.exp(-s)),e=p-r.y;for(let j=0;j<D;j++)gw[j]+=e*(r.x[j]-mean[j])/std[j];gb+=e;}for(let j=0;j<D;j++)w[j]-=0.1*(gw[j]/TR.length+2e-3*w[j]);b-=0.1*gb/TR.length;}return{mean,std,w,b};}
function acc(M,TE){let h=0;for(const r of TE){let s=M.b;for(let j=0;j<M.w.length;j++)s+=M.w[j]*(r.x[j]-M.mean[j])/M.std[j];if((s>=0?1:0)===r.y)h++;}return h/TE.length;}
const syms=Object.keys(data).filter(s=>data[s]&&data[s].candles&&data[s].candles.length>WARM+H+40);
const P=x=>(x*100).toFixed(1)+"%",R=a=>a.map(x=>+x.toFixed(5));
// axis: "spk"(base vol10) | "vol"(base vol11=vol10+gkRatio)
function runAxis(name,axis){
  const all=[];
  for(const sym of syms){const cds=data[sym].candles,price=cds.map(c=>c.c),hi=cds.map(c=>c.h),lo=cds.map(c=>c.l),op=cds.map(c=>c.o),dates=cds.map(c=>c.t),N=price.length;const ei=eIdx(dates,data[sym].earnings||[]);if(ei.length<8)continue;const tN=tNA(N,ei),sc=sA(N,ei);const loc=[];
    for(let t=WARM;t<=N-H-1;t+=STRIDE){const v=vol10(price,hi,lo,t);if(!v)continue;let bfeat=v;const ef=earnF(tN,sc,t);let y;let mn=Infinity,mx=-Infinity;for(let i=t+1;i<=t+H;i++){if(price[i]<mn)mn=price[i];if(price[i]>mx)mx=price[i];}if(axis==="dd")y=(mn/price[t]-1)<=-0.05?1:0;else y=(mx/price[t]-1)>=0.05?1:0;
      loc.push({b:bfeat,f:bfeat.concat(ef),y,sym});}
    const cut=Math.floor(loc.length*TRAIN_FRAC);loc.forEach((r,i)=>{r._tr=i<cut;all.push(r);});}
  const DB=all[0].b.length,DF=all[0].f.length;
  const TR=all.filter(r=>r._tr),TE=all.filter(r=>!r._tr);
  const mB=fit(TR.map(r=>({x:r.b,y:r.y})),DB),aB=acc(mB,TE.map(r=>({x:r.b,y:r.y})));
  const mF=fit(TR.map(r=>({x:r.f,y:r.y})),DF),aF=acc(mF,TE.map(r=>({x:r.f,y:r.y})));
  let xF=0,xB=0,xn=0;const ss=[...new Set(all.map(r=>r.sym))];
  for(const s of ss){const tr=all.filter((r,i)=>r.sym!==s&&i%2===0),te=all.filter(r=>r.sym===s&&!r._tr);if(te.length<20||tr.length<200)continue;xF+=acc(fit(tr.map(r=>({x:r.f,y:r.y})),DF,120),te.map(r=>({x:r.f,y:r.y})));xB+=acc(fit(tr.map(r=>({x:r.b,y:r.y})),DB,120),te.map(r=>({x:r.b,y:r.y})));xn++;}
  console.log("── "+name+" (baseline "+DB+"피처 vs +실적="+DF+"피처) ──");
  console.log("  종목내: base "+P(aB)+" → +실적 "+P(aF)+" ("+((aF-aB>=0?"+":"")+((aF-aB)*100).toFixed(1))+"%p)");
  console.log("  종목외: base "+P(xB/xn)+" → +실적 "+P(xF/xn)+" ("+((xF/xn-xB/xn>=0?"+":"")+((xF/xn-xB/xn)*100).toFixed(1))+"%p)");
  const pass=(aF-aB)>=0.01&&(xF/xn-xB/xn)>=0.01;console.log("  관문(양쪽+1%p): "+(pass?"★채택":"기각"));
  if(pass){const M=fit(all.map(r=>({x:r.f,y:r.y})),DF);console.log("  MEAN="+JSON.stringify(R(M.mean)));console.log("  STD ="+JSON.stringify(R(M.std)));console.log("  W   ="+JSON.stringify(R(M.w)));console.log("  B   ="+M.b.toFixed(5)+" oosAcc="+aF.toFixed(3)+" losoAcc="+(xF/xn).toFixed(3));}
  console.log("");
}
console.log("=== 급변·변동성 실적 통합 (US주식 "+syms.length+"종) ===\n");
runAxis("낙폭 (-5%·20봉)","dd");
runAxis("이익목표 (+5%·20봉)","up");
