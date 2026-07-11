// 배당락/분할 이벤트 캘린더 탐색 — 기각 진단. 조정 데이터에서 배당락일 갭이 평시보다 큰가?
// 결론: 배당락 갭 0.88x(평시보다 작음) → 신호 없음. 배당은 조정으로 기계적 효과 제거+루틴 무이벤트.
// 분할은 종목당 4~8건(20년)로 표본 부족·조정 제거 → 검증 불가. 실적(뉴스)과 달리 배당/분할=기계적 이벤트.
"use strict";
const fs=require("fs"),path=require("path");
const data=JSON.parse(fs.readFileSync(path.join(__dirname,"earn-ohlc.json"),"utf8"));
const div=JSON.parse(fs.readFileSync(path.join(__dirname,"earn-div.json"),"utf8"));
let exGap=[],baseGap=[];
for(const s in data){if(!data[s])continue;const cds=data[s].candles,price=cds.map(c=>c.c),op=cds.map(c=>c.o),dates=cds.map(c=>c.t);const dset=new Set(div[s]||[]);
  for(let i=1;i<cds.length;i++){const g=Math.abs(op[i]/price[i-1]-1);if(!isFinite(g))continue;(dset.has(dates[i])?exGap:baseGap).push(g);}}
const m=a=>a.reduce((x,y)=>x+y,0)/a.length;
console.log("조정 데이터 |오버나잇 갭| — 배당락 "+(m(exGap)*100).toFixed(3)+"%(n="+exGap.length+") vs 평시 "+(m(baseGap)*100).toFixed(3)+"%(n="+baseGap.length+")");
console.log("비율 "+(m(exGap)/m(baseGap)).toFixed(2)+"x → "+(m(exGap)/m(baseGap)>1.3?"신호 가능":"기각(배당락 갭 ≈/< 평시)"));
