// 하락 급변(크래시) 위험 검증 — 대칭급변(v1.8)과 별개로 하락 특화가 예측 가능한지.
"use strict";
const fs=require("fs"),path=require("path");
const H=20,STRIDE=2,WARM=260,TF=0.6;
function rvol(a,e,n){let s=0;for(let i=e-n+1;i<=e;i++)s+=Math.log(a[i]/a[i-1])**2;return Math.sqrt(s/n);}
function atrp(hi,lo,cl,e,n){let s=0;for(let i=e-n+1;i<=e;i++){const tr=Math.max(hi[i]-lo[i],Math.abs(hi[i]-cl[i-1]),Math.abs(lo[i]-cl[i-1]));s+=tr;}return s/n/cl[e];}
function feats(price,hi,lo,t){const v10=rvol(price,t,10),v20=rvol(price,t,20),v60=rvol(price,t,60),v120=rvol(price,t,120);if(!v20||!v60||!v120)return null;
  const atr=atrp(hi,lo,price,t,14);const vs=[];for(let k=t-40;k<=t;k+=5){const vv=rvol(price,k,20);if(vv)vs.push(vv);}
  const vm=vs.reduce((a,b)=>a+b,0)/vs.length,vov=Math.sqrt(vs.reduce((a,b)=>a+(b-vm)**2,0)/vs.length)/(vm||1);
  let rng=0;for(let i=t-4;i<=t;i++)rng+=(hi[i]-lo[i])/price[i];rng/=5;
  const hist=[];for(let k=t-252;k<=t;k+=3){if(k-20>=0){const vv=rvol(price,k,20);if(vv)hist.push(vv);}}
  let pct=0.5;if(hist.length>5){let c=0;for(const v of hist)if(v<=v20)c++;pct=c/hist.length;}
  const ret20=t>=20?Math.log(price[t]/price[t-20]):0;   // 레버리지: 최근 하락?
  return {base:[v10/v60-1,v20/v60-1,v20/v120-1,v60/v120-1,atr*100,vov,rng*100,v20*100,Math.log(v20/v60),pct], ret20};
}
function fit(TR,gx){const D=gx(TR[0]).length;const mean=Array(D).fill(0),std=Array(D).fill(0);
  for(const r of TR){const x=gx(r);for(let j=0;j<D;j++)mean[j]+=x[j];}for(let j=0;j<D;j++)mean[j]/=TR.length;
  for(const r of TR){const x=gx(r);for(let j=0;j<D;j++)std[j]+=(x[j]-mean[j])**2;}for(let j=0;j<D;j++)std[j]=Math.sqrt(std[j]/TR.length)||1;
  let w=Array(D).fill(0),b=0;for(let ep=0;ep<400;ep++){const gw=Array(D).fill(0);let gb=0;
    for(const r of TR){const x=gx(r);let s=b;for(let j=0;j<D;j++)s+=w[j]*(x[j]-mean[j])/std[j];const p=1/(1+Math.exp(-s)),e=p-r._y;for(let j=0;j<D;j++)gw[j]+=e*(x[j]-mean[j])/std[j];gb+=e;}
    for(let j=0;j<D;j++)w[j]-=0.1*(gw[j]/TR.length+2e-3*w[j]);b-=0.1*gb/TR.length;}
  return{mean,std,w,b,gx};}
function acc(M,TE){let h=0,bh=0,pos=0;for(const r of TE){let s=M.b;const x=M.gx(r);for(let j=0;j<M.w.length;j++)s+=M.w[j]*(x[j]-M.mean[j])/M.std[j];if((s>=0?1:0)===r._y)h++;if(r._p===r._y)bh++;if(r._y)pos++;}return{acc:h/TE.length,pers:bh/TE.length,base:Math.max(pos/TE.length,1-pos/TE.length),pos:pos/TE.length};}
const dir=path.join(__dirname,"fixtures"),files=fs.readdirSync(dir).filter(f=>f.endsWith("-1day.json"));
const rows=[];
for(const f of files){const fx=JSON.parse(fs.readFileSync(path.join(dir,f),"utf8"));
  const price=fx.candle.map(c=>c.c),hi=fx.candle.map(c=>c.h),lo=fx.candle.map(c=>c.l),N=price.length;if(N<WARM+H+40)continue;
  const loc=[];
  for(let t=WARM;t<=N-H-1;t+=STRIDE){const ft=feats(price,hi,lo,t);if(!ft||ft.base.some(v=>!isFinite(v)))continue;
    const v20=rvol(price,t,20);
    let dn=0,up=0,dnP=0,upP=0,sym=0,symP=0;
    for(let i=t+1;i<=t+H;i++){const r=price[i]/price[i-1]-1;if(r<-2.5*v20)dn=1;if(r>2.5*v20)up=1;if(Math.abs(r)>2.5*v20)sym=1;}
    for(let i=t-H+1;i<=t;i++){if(i>=1){const r=price[i]/price[i-1]-1;if(r<-2.5*v20)dnP=1;if(r>2.5*v20)upP=1;if(Math.abs(r)>2.5*v20)symP=1;}}
    loc.push({base:ft.base,ret20:ft.ret20,dn,up,sym,_pdn:dnP,_pup:upP,_psym:symP});
  }
  const cut=Math.floor(loc.length*TF);loc.forEach((r,i)=>{r._tr=i<cut;rows.push(r);});
}
console.log("총 "+rows.length+"시점 · 종목 "+files.length);
function run(label,ykey,pkey,gx){rows.forEach(r=>{r._y=r[ykey];r._p=r[pkey];});
  const TR=rows.filter(r=>r._tr),TE=rows.filter(r=>!r._tr);const M=fit(TR,gx),o=acc(M,TE);const P=x=>(x*100).toFixed(1)+"%";
  const beat=o.acc>o.base+0.01&&o.acc>o.pers+0.01;
  console.log("  "+label.padEnd(26)+" 정확도 "+P(o.acc)+" · 다수결 "+P(o.base)+" · 지속성 "+P(o.pers)+" · 양성률 "+P(o.pos)+(beat?"  ★진짜":"  (미달)"));return o;}
console.log("\n=== 하락/상승 급변 비대칭 (2.5σ·20봉·OOS) ===");
const gxB=r=>r.base, gxBR=r=>[...r.base,r.ret20*100];
run("대칭 급변(기존)","sym","_psym",gxB);
run("하락 급변","dn","_pdn",gxB);
run("하락 급변 +레버리지","dn","_pdn",gxBR);
run("상승 급변","up","_pup",gxB);
// (c) 하락급변이 대칭급변 예측에 추가정보? 대칭타깃에 하락 관련 피처 추가는 위 레버리지로 대체 판단
console.log("\n→ 하락급변이 이중베이스라인 초과 & 상승과 비대칭이면 크래시 축 후보.");
