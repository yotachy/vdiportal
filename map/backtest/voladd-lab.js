// 거래량 피처가 급변·낙폭·변동성 예측에 '추가 정보'를 주나 — 리스크 모델은 가격+레인지만 씀(거래량 미활용).
"use strict";
const fs=require("fs"),path=require("path");
const H=20,STRIDE=2,WARM=260,TF=0.6;
function rvol(a,e,n){let s=0;for(let i=e-n+1;i<=e;i++)s+=Math.log(a[i]/a[i-1])**2;return Math.sqrt(s/n);}
function atrp(hi,lo,cl,e,n){let s=0;for(let i=e-n+1;i<=e;i++){const tr=Math.max(hi[i]-lo[i],Math.abs(hi[i]-cl[i-1]),Math.abs(lo[i]-cl[i-1]));s+=tr;}return s/n/cl[e];}
function priceF(price,hi,lo,t){const v10=rvol(price,t,10),v20=rvol(price,t,20),v60=rvol(price,t,60),v120=rvol(price,t,120);if(!v20||!v60||!v120)return null;
  const atr=atrp(hi,lo,price,t,14);const vs=[];for(let k=t-40;k<=t;k+=5){const vv=rvol(price,k,20);if(vv)vs.push(vv);}
  const vm=vs.reduce((a,b)=>a+b,0)/vs.length,vov=Math.sqrt(vs.reduce((a,b)=>a+(b-vm)**2,0)/vs.length)/(vm||1);
  let rng=0;for(let i=t-4;i<=t;i++)rng+=(hi[i]-lo[i])/price[i];rng/=5;
  const hist=[];for(let k=t-252;k<=t;k+=3){if(k-20>=0){const vv=rvol(price,k,20);if(vv)hist.push(vv);}}
  let pct=0.5;if(hist.length>5){let c=0;for(const v of hist)if(v<=v20)c++;pct=c/hist.length;}
  return [v10/v60-1,v20/v60-1,v20/v120-1,v60/v120-1,atr*100,vov,rng*100,v20*100,Math.log(v20/v60),pct];}
function volF(vol,price,t){ // 거래량 피처(과거만)
  if(vol[t]<=0)return null;
  let a=0,b=0;for(let i=t-4;i<=t;i++)a+=vol[i];for(let i=t-59;i<=t;i++)b+=vol[i];a/=5;b/=60;const volR=b?a/b:1; // 급증비
  const lv=[];for(let i=t-19;i<=t;i++)lv.push(Math.log((vol[i]||1)+1));const m=lv.reduce((x,y)=>x+y,0)/lv.length;const vvol=Math.sqrt(lv.reduce((x,y)=>x+(y-m)**2,0)/lv.length); // 거래량변동
  // 거래량-변동성 상관(20봉): |수익| vs 거래량
  let sx=0,sy=0,sxx=0,syy=0,sxy=0,nn=0;for(let i=t-19;i<=t;i++){if(i<1)continue;const ar=Math.abs(Math.log(price[i]/price[i-1])),vv=Math.log((vol[i]||1)+1);sx+=ar;sy+=vv;sxx+=ar*ar;syy+=vv*vv;sxy+=ar*vv;nn++;}
  const cov=sxy/nn-(sx/nn)*(sy/nn),vx=sxx/nn-(sx/nn)**2,vy=syy/nn-(sy/nn)**2;const pvcorr=(vx>0&&vy>0)?cov/Math.sqrt(vx*vy):0;
  // Amihud 비유동성: |수익|/거래량 평균(20봉)
  let am=0,ac=0;for(let i=t-19;i<=t;i++){if(i<1||!vol[i])continue;am+=Math.abs(price[i]/price[i-1]-1)/vol[i]*1e9;ac++;}am=ac?am/ac:0;
  // OBV 기울기(20봉)
  let obv=0;const ob=[];for(let i=t-40;i<=t;i++){if(i<1)continue;obv+=(price[i]>price[i-1]?1:-1)*(vol[i]||0);ob.push(obv);}
  let os=0;{const n=ob.length;let sx2=0,sy2=0,sxx2=0,sxy2=0;for(let i=0;i<n;i++){sx2+=i;sy2+=ob[i];sxx2+=i*i;sxy2+=i*ob[i];}const d=n*sxx2-sx2*sx2;os=d?(n*sxy2-sx2*sy2)/d:0;}
  const obvN=os/(b||1); // 정규화
  return [Math.log(volR),vvol,pvcorr,Math.log(am+1e-9),obvN];}
function fit(TR,gx){const D=gx(TR[0]).length;const mean=Array(D).fill(0),std=Array(D).fill(0);
  for(const r of TR){const x=gx(r);for(let j=0;j<D;j++)mean[j]+=x[j];}for(let j=0;j<D;j++)mean[j]/=TR.length;
  for(const r of TR){const x=gx(r);for(let j=0;j<D;j++)std[j]+=(x[j]-mean[j])**2;}for(let j=0;j<D;j++)std[j]=Math.sqrt(std[j]/TR.length)||1;
  let w=Array(D).fill(0),b=0;for(let ep=0;ep<350;ep++){const gw=Array(D).fill(0);let gb=0;
    for(const r of TR){const x=gx(r);let s=b;for(let j=0;j<D;j++)s+=w[j]*(x[j]-mean[j])/std[j];const p=1/(1+Math.exp(-s)),e=p-r._y;for(let j=0;j<D;j++)gw[j]+=e*(x[j]-mean[j])/std[j];gb+=e;}
    for(let j=0;j<D;j++)w[j]-=0.1*(gw[j]/TR.length+2e-3*w[j]);b-=0.1*gb/TR.length;}
  return{mean,std,w,b,gx};}
function acc(M,TE){let h=0;for(const r of TE){let s=M.b;const x=M.gx(r);for(let j=0;j<M.w.length;j++)s+=M.w[j]*(x[j]-M.mean[j])/M.std[j];if((s>=0?1:0)===r._y)h++;}return h/TE.length;}
const dir=path.join(__dirname,"fixtures"),files=fs.readdirSync(dir).filter(f=>f.endsWith("-1day.json"));
const rows=[];
for(const f of files){const fx=JSON.parse(fs.readFileSync(path.join(dir,f),"utf8"));
  const price=fx.candle.map(c=>c.c),hi=fx.candle.map(c=>c.h),lo=fx.candle.map(c=>c.l),vol=fx.candle.map(c=>c.v||0),N=price.length;if(N<WARM+H+40)continue;
  if(vol.slice(WARM,WARM+50).every(v=>!v))continue; // 거래량 없는 종목 skip
  const loc=[];
  for(let t=WARM;t<=N-H-1;t+=STRIDE){const pf=priceF(price,hi,lo,t),vf=volF(vol,price,t);if(!pf||!vf||pf.some(v=>!isFinite(v))||vf.some(v=>!isFinite(v)))continue;
    const v20=rvol(price,t,20);let spk=0,dd=0;for(let i=t+1;i<=t+H;i++){if(Math.abs(price[i]/price[i-1]-1)>2.5*v20)spk=1;const rr=price[i]/price[t]-1;if(rr<=-0.05)dd=1;}
    const cv=rvol(price,t,H),fv=rvol(price,t+H,H);const vex=fv>cv?1:0;
    loc.push({p:pf,v:vf,spk,dd,vex});
  }
  const cut=Math.floor(loc.length*TF);loc.forEach((r,i)=>{r._tr=i<cut;rows.push(r);});
}
console.log("총 "+rows.length+"시점(거래량 있는 종목)");
function run(label,ykey){rows.forEach(r=>r._y=r[ykey]);const TR=rows.filter(r=>r._tr),TE=rows.filter(r=>!r._tr);
  const aP=acc(fit(TR,r=>r.p),TE),aPV=acc(fit(TR,r=>[...r.p,...r.v]),TE),aV=acc(fit(TR,r=>r.v),TE);
  const P=x=>(x*100).toFixed(1)+"%";const add=aPV-aP;
  console.log("  "+label.padEnd(14)+" 가격만 "+P(aP)+" · 거래량단독 "+P(aV)+" · 가격+거래량 "+P(aPV)+" → 추가 "+(add>=0?"+":"")+(add*100).toFixed(1)+"%p"+(add>0.01?" ✓유의":" (무의미)"));}
console.log("\n=== 거래량 피처 추가효과 (OOS 60/40) ===");
run("급변(2.5σ)","spk");run("낙폭(5%)","dd");run("변동성확대","vex");
console.log("\n→ '추가 +유의' 있어야 거래량이 진짜 새 정보. 없으면 기각.");
