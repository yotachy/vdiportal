# 스쿱포지 (Scoop Forge) MVP-1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 분할 뷰에서 사용자가 노드로 조립한 전략을 실행하면, 데모 데이터 위에서 폴딩·합의 밴드·예측 콘·살아있는 그래프 맥동이 실시간으로 그려지는 단일 페이지 `map/forge.html`(+`forge-core.js`)를 만든다.

**Architecture:** 세 레이어 — (1) 보드 페인: Scoop Board 캔버스 엔진을 경량 포팅 + 실행 블록 노드 타입 추가, (2) 인터프리터 코어: DOM-free 순수 함수 모듈(`forge-core.js`)이 전략 그래프를 계산 DAG로 풀어 예측·시그널·국면을 산출, (3) 차트 페인: PHASE-FOLD 렌더(chart.html 품질)를 인터프리터 출력으로 구동 + 합의/콘/맥동 오버레이. ▷실행과 편집 시 디바운스 재계산으로 두 페인을 잇는다.

**Tech Stack:** 바닐라 JS (ES2020), HTML5 Canvas + SVG, 빌드 도구 없음. 테스트: `node`(v24, 내장 `node:test` + `node:assert`)로 `forge-core.js` 순수 함수 검증. 시각 검증: WSL 헤드리스 playwright chromium 스크린샷. 외부 런타임 의존성: Pretendard 폰트 CDN 1개만(기존 관례).

## Global Constraints

- 단일 페이지 산출물 `map/forge.html` + 코어 모듈 `map/forge-core.js`. **기존 `map/map.html`·`map/chart.html`은 절대 수정 금지.**
- 바닐라 JS만. 프레임워크/번들러/외부 라이브러리 도입 금지(Pretendard 폰트 CDN 예외).
- 모든 UI 텍스트 한국어. 다크 테마 + 골드 토큰 `--gold:#e8b463`, 네이비 `--bg:#0b0f14`, 보조 `--eth:#8a92b2`, bull/bear `#46c28e`/`#e06a6a`(ScoopSignal/PHASE-FOLD 공통 팔레트).
- `<head>`에 `<meta name="robots" content="noindex,nofollow">` 필수.
- 들여쓰기 2 spaces, 큰따옴표, id/class 케밥케이스.
- `forge-core.js`는 **DOM·전역 상태 비의존**(인자 in → 결과 out). 브라우저에서는 `window.ForgeCore`, node에서는 `module.exports`로 동시 노출(UMD 식 꼬리표).
- 좌표·데이터 단위는 chart.html 관례 따름: x = px 인덱스, 시리즈는 `{orange:[], blue:[], candle:[]}` 형태 + 가격 시계열 `price:[]`.
- POST/저장은 MVP-1 범위 밖(메모리 + JSON 내보내기만). 서버 저장은 Phase 3.

---

## File Structure

- `map/forge.html` — 통합 셸. `<head>`(메타·테마 CSS), 헤더(브랜드·▷실행·내보내기), 분할 레이아웃(`.forge-split` = 좌 `.board-pane` / 우 `.chart-pane`), 보드 엔진 `<script>`, 차트 렌더 `<script>`, 오버레이 `<script>`, 와이어링 `<script>`. `<script src="forge-core.js">`로 코어 로드.
- `map/forge-core.js` — DOM-free 인터프리터 코어 + 데모 데이터 생성 + 블록 평가 함수. 유일하게 node로 단위 테스트되는 파일.
- `map/forge-core.test.js` — node 테스트(개발·CI용, 배포 제외). `node --test`로 실행.
- `docs/superpowers/specs/2026-06-26-scooplab-design.md` — (기존) 설계 출처.

**테스트 러너 규약:** 순수 로직은 `forge-core.test.js`에서 `node --test map/forge-core.test.js`로 검증(TDD). 렌더·통합은 헤드리스 스크린샷으로 검증(코드 단위 테스트 불가 영역). 각 코어 태스크는 "테스트 작성 → 실패 확인 → 구현 → 통과 → 커밋" 사이클을 따른다.

---

## Task 1: 스캐폴드 — 페이지 셸 + 코어 모듈 골격 + 테스트 러너

**Files:**
- Create: `map/forge.html`
- Create: `map/forge-core.js`
- Create: `map/forge-core.test.js`

**Interfaces:**
- Produces: `ForgeCore.version` (string). 브라우저 `window.ForgeCore`, node `require("./forge-core.js")` 양쪽에서 접근 가능.

- [ ] **Step 1: 코어 단위 테스트 작성 (실패 예정)**

`map/forge-core.test.js`:
```js
const test = require("node:test");
const assert = require("node:assert");
const ForgeCore = require("./forge-core.js");

test("forge-core exposes a version string", () => {
  assert.strictEqual(typeof ForgeCore.version, "string");
  assert.ok(ForgeCore.version.length > 0);
});
```

- [ ] **Step 2: 테스트 실행해 실패 확인**

Run: `node --test map/forge-core.test.js`
Expected: FAIL — `Cannot find module './forge-core.js'`

- [ ] **Step 3: 코어 모듈 골격 작성**

`map/forge-core.js` (UMD 꼬리표로 브라우저/node 동시 지원):
```js
(function (root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.ForgeCore = api;
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";
  const version = "0.1.0";
  return { version };
});
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `node --test map/forge-core.test.js`
Expected: PASS (1 test)

- [ ] **Step 5: 페이지 셸 작성**

`map/forge.html` — 메타/테마/분할 레이아웃/플레이스홀더 페인. 핵심 골격:
```html
<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta name="robots" content="noindex,nofollow">
<title>스쿱포지 · Scoop Forge</title>
<link rel="preconnect" href="https://cdn.jsdelivr.net">
<link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@latest/dist/web/static/pretendard.css">
<style>
  :root{--gold:#e8b463;--bg:#0b0f14;--panel:#121822;--ink:#e7ecf5;--eth:#8a92b2;--bull:#46c28e;--bear:#e06a6a;--line:#222b39}
  *{box-sizing:border-box}
  body{margin:0;background:var(--bg);color:var(--ink);font-family:Pretendard,system-ui,sans-serif;letter-spacing:-0.01em}
  .forge-top{display:flex;align-items:center;gap:14px;height:54px;padding:0 18px;border-bottom:1px solid var(--line);background:var(--panel)}
  .brand{font-weight:800;letter-spacing:-0.02em}.brand em{color:var(--gold);font-style:normal}
  .forge-split{display:grid;grid-template-columns:1fr 1fr;height:calc(100vh - 54px)}
  .board-pane{position:relative;overflow:hidden;border-right:1px solid var(--line)}
  .chart-pane{position:relative;overflow:hidden}
  .run-btn{margin-left:auto;background:var(--gold);color:#1a1206;border:0;border-radius:8px;padding:8px 16px;font-weight:700;cursor:pointer}
</style>
</head>
<body>
  <header class="forge-top">
    <div class="brand">Scoop<em>Forge</em> <span style="color:var(--eth);font-weight:500">by MoneyScoop</span></div>
    <button class="run-btn" id="runBtn">▷ 실행</button>
  </header>
  <div class="forge-split">
    <section class="board-pane" id="boardPane"></section>
    <section class="chart-pane" id="chartPane"></section>
  </div>
  <script src="forge-core.js"></script>
  <script>
    /* Task 1: 스모크 — 코어 로드 확인 */
    document.getElementById("runBtn").addEventListener("click", () => {
      console.log("ForgeCore", window.ForgeCore.version);
    });
  </script>
</body>
</html>
```

- [ ] **Step 6: 헤드리스 스모크 확인**

Run: 헤드리스 chromium으로 `map/forge.html` 로드 → 콘솔 에러 0, `.forge-split` 두 페인 렌더, `window.ForgeCore.version === "0.1.0"` 평가. 스크린샷 저장.
Expected: 분할 화면 + 헤더 렌더, JS 에러 없음.

- [ ] **Step 7: 커밋**

```bash
git add map/forge.html map/forge-core.js map/forge-core.test.js
git commit -m "feat(forge): 스쿱포지 스캐폴드 — 분할 셸 + 코어 모듈 + node 테스트 러너"
```

---

## Task 2: 데이터 레이어 — 결정적 데모 시리즈 생성기

**Files:**
- Modify: `map/forge-core.js`
- Modify: `map/forge-core.test.js`

**Interfaces:**
- Produces: `ForgeCore.makeDemoSeries(opts)` → `{ price:number[], orange:number[], blue:number[], candle:{o,h,l,c}[], n:number }`. `opts = { n=480, seed=1, period=64 }`. **결정적**(같은 seed → 같은 출력). 시드 PRNG는 내부 mulberry32.

- [ ] **Step 1: 테스트 작성 (실패 예정)**

`forge-core.test.js`에 추가:
```js
test("makeDemoSeries is deterministic and well-shaped", () => {
  const a = ForgeCore.makeDemoSeries({ n: 100, seed: 7, period: 50 });
  const b = ForgeCore.makeDemoSeries({ n: 100, seed: 7, period: 50 });
  assert.strictEqual(a.n, 100);
  assert.strictEqual(a.price.length, 100);
  assert.strictEqual(a.candle.length, 100);
  assert.deepStrictEqual(a.price, b.price); // 같은 seed → 동일
  const c = ForgeCore.makeDemoSeries({ n: 100, seed: 8, period: 50 });
  assert.notDeepStrictEqual(a.price, c.price); // 다른 seed → 상이
  for (const k of a.candle) assert.ok(k.h >= k.o && k.h >= k.c && k.l <= k.o && k.l <= k.c);
});
```

- [ ] **Step 2: 실패 확인**

Run: `node --test map/forge-core.test.js`
Expected: FAIL — `makeDemoSeries is not a function`

- [ ] **Step 3: 구현**

`forge-core.js` factory 내부에 추가하고 반환 객체에 노출:
```js
function mulberry32(seed){let a=seed>>>0;return function(){a|=0;a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;};}
function makeDemoSeries(opts){
  const o=opts||{},n=o.n||480,period=o.period||64,rnd=mulberry32(o.seed||1);
  const price=[],orange=[],blue=[],candle=[];let p=100,trend=0.02;
  for(let i=0;i<n;i++){
    const cyc=Math.sin(2*Math.PI*i/period), cyc2=Math.sin(2*Math.PI*i/(period*1.6)+0.7);
    const noise=(rnd()-0.5)*1.2;
    p=p+trend+cyc*0.6+noise;
    const op=p-(rnd()-0.5)*0.8, cl=p+(rnd()-0.5)*0.8;
    const hi=Math.max(op,cl)+rnd()*0.6, lo=Math.min(op,cl)-rnd()*0.6;
    price.push(p); candle.push({o:op,h:hi,l:lo,c:cl});
    orange.push(cyc+(rnd()-0.5)*0.15); blue.push(cyc2+(rnd()-0.5)*0.15);
  }
  return {price,orange,blue,candle,n};
}
```
반환부: `return { version, makeDemoSeries };`

- [ ] **Step 4: 통과 확인**

Run: `node --test map/forge-core.test.js`
Expected: PASS (2 tests)

- [ ] **Step 5: 커밋**

```bash
git add map/forge-core.js map/forge-core.test.js
git commit -m "feat(forge): 결정적 데모 시리즈 생성기(makeDemoSeries)"
```

---

## Task 3: 인터프리터 — 그래프→계산 DAG 위상 정렬

**Files:**
- Modify: `map/forge-core.js`
- Modify: `map/forge-core.test.js`

**Interfaces:**
- Consumes: 없음.
- Produces:
  - `ForgeCore.buildDAG(graph)` → `{ order:string[], byId:{[id]:node}, inputsOf:{[id]:string[]} }`. `graph = { nodes:[{id, kind:"block"|"free", blockType, params}], edges:[{from,to}] }`. **free 노드는 DAG에서 제외**(맥락 전용). 사이클이면 `throw new Error("cycle")`.

- [ ] **Step 1: 테스트 작성 (실패 예정)**

```js
test("buildDAG topo-sorts blocks, drops free nodes, detects cycles", () => {
  const g = {
    nodes:[
      {id:"src",kind:"block",blockType:"price"},
      {id:"ma",kind:"block",blockType:"ma",params:{len:5}},
      {id:"note",kind:"free"},
      {id:"out",kind:"block",blockType:"predict"}
    ],
    edges:[{from:"src",to:"ma"},{from:"ma",to:"out"},{from:"note",to:"out"}]
  };
  const d = ForgeCore.buildDAG(g);
  assert.deepStrictEqual(d.order, ["src","ma","out"]); // note 제외, 위상순
  assert.deepStrictEqual(d.inputsOf["out"], ["ma"]);   // free 입력 제외
  const cyc = {nodes:[{id:"a",kind:"block",blockType:"ma"},{id:"b",kind:"block",blockType:"ma"}],
               edges:[{from:"a",to:"b"},{from:"b",to:"a"}]};
  assert.throws(() => ForgeCore.buildDAG(cyc), /cycle/);
});
```

- [ ] **Step 2: 실패 확인** — Run: `node --test map/forge-core.test.js` → FAIL (`buildDAG is not a function`)

- [ ] **Step 3: 구현**

```js
function buildDAG(graph){
  const blocks=graph.nodes.filter(n=>n.kind==="block");
  const ids=new Set(blocks.map(n=>n.id)), byId={};
  blocks.forEach(n=>byId[n.id]=n);
  const inputsOf={}; blocks.forEach(n=>inputsOf[n.id]=[]);
  graph.edges.forEach(e=>{ if(ids.has(e.from)&&ids.has(e.to)) inputsOf[e.to].push(e.from); });
  const indeg={}; blocks.forEach(n=>indeg[n.id]=inputsOf[n.id].length);
  const q=blocks.filter(n=>indeg[n.id]===0).map(n=>n.id), order=[];
  const adj={}; blocks.forEach(n=>adj[n.id]=[]);
  graph.edges.forEach(e=>{ if(ids.has(e.from)&&ids.has(e.to)) adj[e.from].push(e.to); });
  while(q.length){ const u=q.shift(); order.push(u);
    adj[u].forEach(v=>{ if(--indeg[v]===0) q.push(v); }); }
  if(order.length!==blocks.length) throw new Error("cycle");
  return { order, byId, inputsOf };
}
```
반환부에 `buildDAG` 추가.

- [ ] **Step 4: 통과 확인** — Run: `node --test map/forge-core.test.js` → PASS (3 tests)

- [ ] **Step 5: 커밋**

```bash
git add map/forge-core.js map/forge-core.test.js
git commit -m "feat(forge): 전략 그래프 위상정렬 DAG(buildDAG)"
```

---

## Task 4: 블록 평가 — 가격/이동평균/가중결합

**Files:**
- Modify: `map/forge-core.js`
- Modify: `map/forge-core.test.js`

**Interfaces:**
- Consumes: `buildDAG`, `makeDemoSeries`.
- Produces: `ForgeCore.evalBlocks(graph, data)` → `{ values:{[id]:number[]} }`. 블록별 시계열 산출. 지원 blockType: `price`(data.price), `ma`(params.len 단순이동평균, 입력 1개), `combine`(입력들의 params.weights 가중합, weights 없으면 균등). PHASE-FOLD·출력 블록은 Task 5·6에서 확장.

- [ ] **Step 1: 테스트 작성 (실패 예정)**

```js
test("evalBlocks computes price, ma, weighted combine", () => {
  const data = { price:[2,4,6,8,10], n:5 };
  const g = { nodes:[
      {id:"p",kind:"block",blockType:"price"},
      {id:"m",kind:"block",blockType:"ma",params:{len:2}},
      {id:"c",kind:"block",blockType:"combine",params:{weights:{p:1,m:1}}}
    ], edges:[{from:"p",to:"m"},{from:"p",to:"c"},{from:"m",to:"c"}] };
  const { values } = ForgeCore.evalBlocks(g, data);
  assert.deepStrictEqual(values.p, [2,4,6,8,10]);
  assert.deepStrictEqual(values.m, [2,3,5,7,9]);            // len2 SMA(앞쪽 부분창)
  assert.deepStrictEqual(values.c, [2,3.5,5.5,7.5,9.5]);    // (p+m)/2
});
```

- [ ] **Step 2: 실패 확인** — Run → FAIL (`evalBlocks is not a function`)

- [ ] **Step 3: 구현**

```js
function sma(arr,len){const out=[];let s=0;for(let i=0;i<arr.length;i++){s+=arr[i];if(i>=len)s-=arr[i-len];out.push(s/Math.min(i+1,len));}return out;}
function evalBlocks(graph,data){
  const {order,byId,inputsOf}=buildDAG(graph), values={};
  for(const id of order){const n=byId[id],ins=inputsOf[id].map(i=>values[i]);
    if(n.blockType==="price") values[id]=data.price.slice();
    else if(n.blockType==="ma") values[id]=sma(ins[0]||data.price,(n.params&&n.params.len)||5);
    else if(n.blockType==="combine"){
      const w=(n.params&&n.params.weights)||{}, keys=inputsOf[id];
      const tot=keys.reduce((a,k)=>a+(w[k]!=null?w[k]:1),0)||1;
      const len=ins[0]?ins[0].length:0, out=new Array(len).fill(0);
      keys.forEach((k,j)=>{const wk=(w[k]!=null?w[k]:1)/tot;for(let t=0;t<len;t++)out[t]+=(ins[j][t]||0)*wk;});
      values[id]=out;
    } else values[id]=ins[0]?ins[0].slice():[]; // 미지원은 passthrough
  }
  return { values };
}
```
반환부에 `evalBlocks` 추가.

- [ ] **Step 4: 통과 확인** — Run → PASS (4 tests)

- [ ] **Step 5: 커밋**

```bash
git add map/forge-core.js map/forge-core.test.js
git commit -m "feat(forge): 블록 평가 — price/ma/combine"
```

---

## Task 5: PHASE-FOLD 블록 — PDM θ + 최적 주기 탐색

**Files:**
- Modify: `map/forge-core.js`
- Modify: `map/forge-core.test.js`

**Interfaces:**
- Consumes: chart.html `detrendNorm`/`pdmTheta`/`meanTheta` 알고리즘(여기서 DOM-free로 재구현).
- Produces:
  - `ForgeCore.detrendNorm(y)` → number[] (선형추세 제거 + 표준화).
  - `ForgeCore.pdmTheta(z, P, nbins=10)` → number (위상분산 θ, 작을수록 주기성 강함).
  - `ForgeCore.scanPeriod(z, {pmin=8,pmax=...,step=0.5})` → `{ best:number, curve:[{P,theta}] }`.
  - `evalBlocks` 확장: blockType `phasefold` → 입력 시계열의 `{best, theta, folded}` 를 `values[id]`에 `{series, meta}` 형태로(시계열 자리엔 detrend 시리즈, meta에 best/theta). 하위 호환 위해 `values[id]`는 number[] 유지하고 `meta[id]`에 폴드 정보 저장.

- [ ] **Step 1: 테스트 작성 (실패 예정)**

```js
test("PDM finds the embedded period", () => {
  const P0=40, z=[]; for(let i=0;i<400;i++) z.push(Math.sin(2*Math.PI*i/P0));
  const dn = ForgeCore.detrendNorm(z);
  assert.strictEqual(dn.length, z.length);
  const tNear = ForgeCore.pdmTheta(dn, P0), tFar = ForgeCore.pdmTheta(dn, P0*1.37);
  assert.ok(tNear < tFar); // 진짜 주기에서 θ가 더 작다
  const { best } = ForgeCore.scanPeriod(dn, {pmin:20,pmax:80,step:1});
  assert.ok(Math.abs(best - P0) <= 2); // 임베드 주기 복원
});

test("evalBlocks phasefold attaches period meta", () => {
  const P0=32, price=[]; for(let i=0;i<256;i++) price.push(100+Math.sin(2*Math.PI*i/P0));
  const g={nodes:[{id:"p",kind:"block",blockType:"price"},
                  {id:"f",kind:"block",blockType:"phasefold",params:{pmin:16,pmax:64}}],
           edges:[{from:"p",to:"f"}]};
  const r=ForgeCore.evalBlocks(g,{price,n:price.length});
  assert.ok(r.meta && r.meta.f && Math.abs(r.meta.f.best - P0) <= 2);
});
```

- [ ] **Step 2: 실패 확인** — Run → FAIL

- [ ] **Step 3: 구현** (chart.html §245–271 알고리즘을 DOM-free로 이식)

```js
function detrendNorm(y){
  const n=y.length;if(!n)return[];let sx=0,sy=0,sxx=0,sxy=0;
  for(let i=0;i<n;i++){sx+=i;sy+=y[i];sxx+=i*i;sxy+=i*y[i];}
  const b=(n*sxy-sx*sy)/(n*sxx-sx*sx||1),a=(sy-b*sx)/n;
  const d=y.map((v,i)=>v-(a+b*i));let m=0;d.forEach(v=>m+=v);m/=n;
  let s=0;d.forEach(v=>s+=(v-m)*(v-m));s=Math.sqrt(s/n)||1;
  return d.map(v=>(v-m)/s);
}
function pdmTheta(z,P,nbins){
  nbins=nbins||10;const n=z.length;const bins=Array.from({length:nbins},()=>[]);
  for(let i=0;i<n;i++){const ph=((i%P)+P)%P/P;bins[Math.min(nbins-1,Math.floor(ph*nbins))].push(z[i]);}
  let num=0,cnt=0,gm=0;for(let i=0;i<n;i++)gm+=z[i];gm/=n;
  let gv=0;for(let i=0;i<n;i++)gv+=(z[i]-gm)*(z[i]-gm);gv/=n;
  bins.forEach(b=>{if(b.length<2)return;let m=0;b.forEach(v=>m+=v);m/=b.length;
    let v=0;b.forEach(x=>v+=(x-m)*(x-m));num+=v;cnt+=b.length-1;});
  return cnt>0&&gv>0 ? (num/cnt)/gv : NaN;
}
function scanPeriod(z,opts){
  const o=opts||{},pmin=o.pmin||8,pmax=o.pmax||Math.floor(z.length/3),step=o.step||0.5;
  const curve=[];let best=pmin,bt=Infinity;
  for(let P=pmin;P<=pmax;P+=step){const t=pdmTheta(z,P);curve.push({P,theta:t});
    if(!isNaN(t)&&t<bt){bt=t;best=P;}}
  return { best, curve };
}
```
`evalBlocks`의 분기에 추가(그리고 함수 시작에 `const meta={};`, 반환에 `meta` 포함):
```js
else if(n.blockType==="phasefold"){
  const src=ins[0]||data.price, dn=detrendNorm(src);
  const sc=scanPeriod(dn,{pmin:(n.params&&n.params.pmin)||8,pmax:(n.params&&n.params.pmax)||Math.floor(src.length/3)});
  values[id]=dn; meta[id]={best:sc.best,theta:pdmTheta(dn,sc.best),curve:sc.curve};
}
```
반환부에 `detrendNorm, pdmTheta, scanPeriod` 추가.

- [ ] **Step 4: 통과 확인** — Run → PASS (6 tests)

- [ ] **Step 5: 커밋**

```bash
git add map/forge-core.js map/forge-core.test.js
git commit -m "feat(forge): PHASE-FOLD 블록 — detrend/PDM/주기탐색"
```

---

## Task 6: 출력 블록 — 예측 경로 + 합성 시그널 + 국면 판정

**Files:**
- Modify: `map/forge-core.js`
- Modify: `map/forge-core.test.js`

**Interfaces:**
- Consumes: `evalBlocks`, `scanPeriod`, `detrendNorm`.
- Produces:
  - `ForgeCore.run(graph, data, opts)` → `{ values, meta, prediction:{path:number[], lo:number[], hi:number[], futW:number}, signal:number[], verdict:{regime:"bull"|"bear"|"neutral", score:number, target:number, invalidation:number} }`. `opts={futW=120}`.
  - 예측: 출력에 연결된 phasefold 메타가 있으면 추세선 + 주기 외삽으로 path 생성, 없으면 추세 단독. lo/hi = path ± 잔차표준편차×k.
  - 시그널: combine/출력 입력 시계열을 -100~+100로 정규화(tanh 스케일).
  - verdict: 최근 시그널 부호·크기로 regime, target = 마지막가×(1+score/1000), invalidation = 최근 N봉 최저/최고.

- [ ] **Step 1: 테스트 작성 (실패 예정)**

```js
test("run returns prediction, signal, verdict shapes", () => {
  const data = ForgeCore.makeDemoSeries({n:300, seed:3, period:48});
  const g = { nodes:[
      {id:"p",kind:"block",blockType:"price"},
      {id:"f",kind:"block",blockType:"phasefold",params:{pmin:20,pmax:96}},
      {id:"m",kind:"block",blockType:"ma",params:{len:10}},
      {id:"c",kind:"block",blockType:"combine"},
      {id:"o",kind:"block",blockType:"predict"}
    ], edges:[{from:"p",to:"f"},{from:"p",to:"m"},{from:"f",to:"c"},{from:"m",to:"c"},{from:"c",to:"o"}] };
  const out = ForgeCore.run(g, data, {futW:60});
  assert.strictEqual(out.prediction.path.length, 60);
  assert.strictEqual(out.prediction.lo.length, 60);
  assert.ok(out.prediction.hi[0] >= out.prediction.lo[0]);
  assert.strictEqual(out.signal.length, data.n);
  assert.ok(out.signal.every(v => v>=-100 && v<=100));
  assert.ok(["bull","bear","neutral"].includes(out.verdict.regime));
  assert.ok(typeof out.verdict.target === "number");
});
```

- [ ] **Step 2: 실패 확인** — Run → FAIL (`run is not a function`)

- [ ] **Step 3: 구현**

```js
function tanh(x){const e=Math.exp(-2*x);return (1-e)/(1+e);}
function linfit(y){const n=y.length;let sx=0,sy=0,sxx=0,sxy=0;
  for(let i=0;i<n;i++){sx+=i;sy+=y[i];sxx+=i*i;sxy+=i*y[i];}
  const b=(n*sxy-sx*sy)/(n*sxx-sx*sx||1),a=(sy-b*sx)/n;return {a,b};}
function run(graph,data,opts){
  const futW=(opts&&opts.futW)||120;
  const ev=evalBlocks(graph,data), {values,meta}=ev;
  const outNode=graph.nodes.find(n=>n.kind==="block"&&(n.blockType==="predict"));
  const inputsOf=buildDAG(graph).inputsOf;
  // 합성 시그널: 출력 입력(없으면 combine/마지막) 시계열을 정규화
  let sigSrc=null;
  if(outNode){const ins=inputsOf[outNode.id];if(ins&&ins[0])sigSrc=values[ins[0]];}
  if(!sigSrc){const c=graph.nodes.find(n=>n.blockType==="combine");if(c)sigSrc=values[c.id];}
  if(!sigSrc)sigSrc=data.price;
  const dn=detrendNorm(sigSrc), signal=dn.map(v=>Math.max(-100,Math.min(100,Math.round(100*tanh(v/1.5)))));
  // 예측: 가격 추세 + (phasefold 메타 있으면) 주기 외삽
  const price=data.price, {a,b}=linfit(price), n=price.length;
  const fmeta=Object.values(meta||{}).find(m=>m&&m.best);
  const pdn=detrendNorm(price);
  // 잔차표준편차
  let res=0;for(let i=0;i<n;i++){const e=price[i]-(a+b*i);res+=e*e;}res=Math.sqrt(res/n);
  const path=[],lo=[],hi=[];
  for(let k=1;k<=futW;k++){const i=n-1+k;let v=a+b*i;
    if(fmeta){const P=fmeta.best;v+=Math.sin(2*Math.PI*i/P)*res*0.8;}
    const band=res*(0.6+0.02*k);path.push(v);lo.push(v-band);hi.push(v+band);}
  const lastSig=signal.slice(-10).reduce((s,v)=>s+v,0)/10;
  const regime=lastSig>12?"bull":lastSig<-12?"bear":"neutral";
  const last=price[n-1], target=last*(1+lastSig/1000);
  const recent=price.slice(-30), invalidation=regime==="bear"?Math.max(...recent):Math.min(...recent);
  return { values, meta, prediction:{path,lo,hi,futW}, signal,
           verdict:{regime,score:Math.round(lastSig),target,invalidation} };
}
```
반환부에 `run` 추가.

- [ ] **Step 4: 통과 확인** — Run → PASS (7 tests)

- [ ] **Step 5: 커밋**

```bash
git add map/forge-core.js map/forge-core.test.js
git commit -m "feat(forge): 출력 블록 run() — 예측/시그널/국면 판정"
```

---

## Task 7: 보드 페인 — Scoop Board 캔버스 엔진 경량 포팅

**Files:**
- Modify: `map/forge.html`
- Reference (읽기 전용, 복붙 출처): `map/map.html`

**Interfaces:**
- Consumes: 없음(독립 보드 상태).
- Produces (forge.html 전역, 오버레이/와이어링이 사용):
  - `boardState = { nodes:[{id,x,y,title,kind,blockType,params}], edges:[{id,from,fromSide,to,toSide}] }`
  - `boardToGraph()` → `{nodes,edges}` (ForgeCore.run 입력 형태로 변환).
  - `renderBoard()` (DOM 재생성), `paintEdges()` (엣지 SVG), `worldPt(cx,cy)`, `view={tx,ty,scale}`.
  - `onBoardChange(cb)` — 보드 편집(노드 이동/추가/삭제/연결) 시 cb 호출(와이어링이 디바운스 재계산에 사용).

- [ ] **Step 1: map.html에서 포팅 대상 식별**

`map/map.html`에서 다음을 발췌 대상으로 표시(읽기): 캔버스 SVG 엣지 구조(`#edgeG` translate 10000 패턴), `worldPt`, `render()`/`measure()`/`paint()`, 포인터 디스패치(`startPan`/`startMarquee`/`nodePointerDown`/`onMove`/`onUp`), `addEdge`/`makeNode`. **빌트인 이미지(base64)·서버 저장·캔버스 관리·라이트박스는 가져오지 않는다.**

- [ ] **Step 2: 보드 마크업·스타일을 forge.html `.board-pane`에 이식**

`.board-pane` 내부에 `.stage`(팬/줌 컨테이너), `.world`(노드 레이어), 엣지 SVG(`left/top:-10000;width/height:20000;overflow:visible` + `#edgeG` `translate(10000,10000)`)를 둔다. CSS는 map.html의 `.stage/.world/.node/.eh/.ew` 규칙을 포팅하되 토큰을 Global Constraints 팔레트로 치환. **`will-change:transform`은 `.world`에 넣지 않는다**(줌 흐림 방지 — map CLAUDE.md 규약).

- [ ] **Step 3: 보드 상태·렌더·포인터 로직 이식**

`boardState`/`view`/`worldPt`/`renderBoard`/`paintEdges`/포인터 핸들러를 forge.html `<script>`에 이식. 노드 객체에 `kind`("block"|"free")·`blockType`·`params` 필드를 추가(map의 `type` 대신 forge 의미). `addEdge`는 `markDirty` 대신 `fireBoardChange()` 호출.

- [ ] **Step 4: `boardToGraph` + 변경 알림 구현**

```js
let _boardChangeCb=null;
function onBoardChange(cb){_boardChangeCb=cb;}
function fireBoardChange(){renderBoardSelOnly?renderBoardSelOnly():null;if(_boardChangeCb)_boardChangeCb();}
function boardToGraph(){
  return { nodes: boardState.nodes.map(n=>({id:n.id,kind:n.kind||"free",blockType:n.blockType,params:n.params})),
           edges: boardState.edges.map(e=>({from:e.from,to:e.to})) };
}
```
(노드 추가/이동완료/삭제/연결 경로 끝에서 `fireBoardChange()` 호출.)

- [ ] **Step 5: 헤드리스 시각·동작 확인**

Run: 헤드리스로 forge.html 로드 → 보드 페인에 노드 추가·드래그·연결 시뮬레이션(또는 기본 시드 노드 3개 표시) 후 스크린샷. `boardToGraph()` 콘솔 평가가 `{nodes:[...],edges:[...]}` 반환하는지 확인.
Expected: 좌측 보드에 노드/연결선 렌더, JS 에러 없음.

- [ ] **Step 6: 커밋**

```bash
git add map/forge.html
git commit -m "feat(forge): 보드 페인 — Scoop Board 캔버스 엔진 경량 포팅 + boardToGraph"
```

---

## Task 8: 실행 블록 팔레트 + 기본 전략 시드

**Files:**
- Modify: `map/forge.html`

**Interfaces:**
- Consumes: `boardState`, `renderBoard`, `fireBoardChange`, `makeNode`.
- Produces:
  - `BLOCK_DEFS = [{type, label, params}]` — MVP 블록 5종(price/ma/phasefold/combine/predict) + free.
  - `addBlock(type)` — 캔버스 중앙에 해당 블록 노드 추가.
  - `seedDefaultStrategy()` — price→{ma,phasefold}→combine→predict 기본 그래프 + 자유 노드 1개(철학 메모)를 boardState에 채움.

- [ ] **Step 1: 블록 정의 + 팔레트 UI**

`.board-pane`에 플로팅 팔레트(`.forge-palette`, `position:absolute;left:12px;top:12px`) — 블록 5종 + 자유노드 버튼. 각 버튼 `addBlock(type)`. 라벨 한국어: 가격/이동평균/위상폴딩/가중결합/예측·시그널/메모.

- [ ] **Step 2: `addBlock` + `seedDefaultStrategy` 구현**

```js
const BLOCK_DEFS=[
  {type:"price",label:"가격",kind:"block"},
  {type:"ma",label:"이동평균",kind:"block",params:{len:10}},
  {type:"phasefold",label:"위상폴딩",kind:"block",params:{pmin:16,pmax:128}},
  {type:"combine",label:"가중결합",kind:"block"},
  {type:"predict",label:"예측·시그널",kind:"block"},
  {type:"free",label:"메모",kind:"free"}
];
function addBlock(type){const d=BLOCK_DEFS.find(b=>b.type===type)||{};
  const c=worldPt(boardPaneW()/2,boardPaneH()/2);
  const n={id:uid("n"),x:c.x,y:c.y,title:d.label,kind:d.kind,blockType:d.kind==="block"?type:undefined,params:d.params?{...d.params}:undefined};
  boardState.nodes.push(n);renderBoard();fireBoardChange();}
function seedDefaultStrategy(){ /* price,ma,phasefold,combine,predict,free 노드 좌표 배치 + addEdge 5개 */ }
```

- [ ] **Step 3: 부팅 시 시드 호출 + 헤드리스 확인**

forge.html 부팅에서 `seedDefaultStrategy(); renderBoard();`. 헤드리스 스크린샷으로 기본 전략 그래프(5블록+메모, 연결선)가 보드에 보이는지 확인.
Expected: 좌측에 완성된 기본 전략 그래프 표시.

- [ ] **Step 4: 커밋**

```bash
git add map/forge.html
git commit -m "feat(forge): 실행 블록 팔레트 + 기본 전략 시드"
```

---

## Task 9: 차트 페인 — PHASE-FOLD 렌더 포팅 (chart.html 품질)

**Files:**
- Modify: `map/forge.html`
- Reference (읽기 전용): `map/chart.html`

**Interfaces:**
- Consumes: `ForgeCore.run` 출력(`prediction`, `signal`, `meta`), `data`(makeDemoSeries).
- Produces:
  - `chartPane` DOM: 메인 가격 차트 캔버스(`#fcMain`) + PDM 스펙트럼(`#fcPdm`) + 폴드 3종(`#fcFoldA/B/C`).
  - `renderChart(result, data)` — 캔들·예측 path/lo/hi 음영·시그널 라인·폴드·PDM 곡선을 chart.html 수준으로 그린다.
  - `fcFit(cv,h)` — chart.html `fit()` 포팅(DPR 보정).

- [ ] **Step 1: chart.html 렌더 함수 매핑 확인**

읽기: `fit`(279), `drawChart`(324), `drawScore`(396), `drawFold`(440), `buildForecast`(299), `linesFor`(323), `sX/sY`(394). 이들을 forge의 `renderChart`로 통합(인자: ForgeCore 결과 + data). chart.html 전역(`Z`,`P`,`PHI`)에 의존하던 부분은 인자로 교체.

- [ ] **Step 2: 차트 마크업·스타일 이식**

`.chart-pane`에 chart.html의 카드 레이아웃(메인 + PDM + fold 3열) 포팅, 토큰 치환. 캔버스 id는 위 인터페이스대로.

- [ ] **Step 3: `renderChart` 구현 (포팅)**

chart.html 드로잉 로직을 `renderChart(result,data)`로 이식: 캔들(`data.candle`) → 메인 캔버스, `result.prediction.path/lo/hi` → 우측 예측 음영+선, `result.signal` → 하단/오버레이 시그널 라인, `result.meta`의 best 주기 → 폴드 3종 + PDM 곡선(`result.meta[*].curve`). 색: 캔들 bull/bear, 예측 골드, 시그널 eth.

- [ ] **Step 4: 헤드리스 시각 확인**

Run: forge.html 부팅 시 `renderChart(ForgeCore.run(boardToGraph(), data), data)` 1회 호출 → 우측 페인 스크린샷. 캔들+예측음영+폴드+PDM이 chart.html과 동등 품질로 보이는지 육안 확인.
Expected: 우측에 완성형 차트 4구역 렌더.

- [ ] **Step 5: 커밋**

```bash
git add map/forge.html
git commit -m "feat(forge): 차트 페인 — PHASE-FOLD 렌더 포팅(chart.html 품질)"
```

---

## Task 10: ▷실행 + 라이브 재계산 와이어링

**Files:**
- Modify: `map/forge.html`

**Interfaces:**
- Consumes: `boardToGraph`, `ForgeCore.run`, `renderChart`, `onBoardChange`, `data`.
- Produces: `runForge()` (보드→그래프→run→renderChart + 오버레이 트리거), 디바운스(180ms) 라이브 재계산.

- [ ] **Step 1: `runForge` + 디바운스 구현**

```js
let data=ForgeCore.makeDemoSeries({n:480,seed:1,period:64}), lastResult=null;
function runForge(){try{const g=boardToGraph();lastResult=ForgeCore.run(g,data,{futW:120});
  renderChart(lastResult,data);if(window.renderOverlay)renderOverlay(lastResult,g);}catch(e){console.warn("run",e);}}
let _t=null;onBoardChange(()=>{clearTimeout(_t);_t=setTimeout(runForge,180);});
document.getElementById("runBtn").addEventListener("click",runForge);
```
부팅 끝에서 `runForge()` 1회.

- [ ] **Step 2: 헤드리스 통합 확인**

Run: 헤드리스로 forge.html 로드 → 보드에서 ma의 `len` 변경 또는 연결 추가 → 우측 차트가 180ms 내 갱신되는지(연속 스크린샷) 확인. ▷실행 클릭 시 즉시 재계산.
Expected: 편집 → 차트 자동 변동.

- [ ] **Step 3: 커밋**

```bash
git add map/forge.html
git commit -m "feat(forge): ▷실행 + 디바운스 라이브 재계산 와이어링"
```

---

## Task 11: 시그니처 오버레이 — 합의 필드 + 예측 콘 + 살아있는 그래프 맥동 (풀 연출)

**Files:**
- Modify: `map/forge.html`

**Interfaces:**
- Consumes: `lastResult`(run 출력), `boardToGraph`, 보드 `view`/노드 좌표, `paintEdges` 좌표 헬퍼.
- Produces:
  - `renderOverlay(result, graph)` — 차트 위 합의 밴드(시그널 정합도→glow), 예측 콘(path±band를 채워진 콘으로), 보드↔차트를 잇는 신호 맥동(requestAnimationFrame 루프).
  - `startPulse()/stopPulse()` — rAF 맥동 애니메이션(엣지 따라 흐르는 점 + 노드 발광).

- [ ] **Step 1: 합의 밴드 + 예측 콘 (정적 레이어)**

차트 페인 위 오버레이 캔버스(`#fcOverlay`, 절대배치). `result.signal` 최근 구간의 분산이 작을수록(정합) 골드 glow 밴드를 강하게; 예측 콘은 `path/lo/hi`를 채워진 그라데이션 콘(골드 투명)으로. regime 색조(bull/bear/neutral) 반영.

- [ ] **Step 2: 살아있는 그래프 맥동 (rAF, 풀 연출)**

보드 페인 위 오버레이(`#boardOverlay`)에서 각 엣지 경로를 따라 흐르는 발광 점(신호 강도=시그널 크기로 속도/밝기 변조) + 활성 블록 노드 테두리 펄스. 출력 블록에 도달한 펄스가 "차트로 건너가" 합의 밴드를 한 번 번쩍이게(두 페인 좌표 브리지). rAF 루프 `startPulse`, 비활성 탭/`prefers-reduced-motion` 시 `stopPulse`.

```js
let _raf=null;
function startPulse(){stopPulse();const t0=performance.now();
  (function loop(now){drawPulse((now-t0)/1000);_raf=requestAnimationFrame(loop);})(t0);}
function stopPulse(){if(_raf)cancelAnimationFrame(_raf),_raf=null;}
function renderOverlay(result,graph){drawConsensus(result);drawCone(result);startPulse();}
```
`drawPulse(t)`는 각 엣지의 polyline을 따라 `phase=(t*speed)%1` 위치에 점 그리기 + 노드 glow.

- [ ] **Step 3: 헤드리스 시각 확인 (연출 캡처)**

Run: forge.html 로드 → 1~2초 후 스크린샷 2~3장(맥동 프레임). 합의 밴드 발광, 예측 콘 채움, 엣지 위 흐르는 점, 노드 펄스가 보이는지 육안 확인. `prefers-reduced-motion`에서 정적으로 떨어지는지 확인.
Expected: 시그니처 장면(폴딩+합의+콘+맥동)이 한 화면에 동시 렌더.

- [ ] **Step 4: 커밋**

```bash
git add map/forge.html
git commit -m "feat(forge): 시그니처 오버레이 — 합의 밴드/예측 콘/살아있는 그래프 맥동(풀 연출)"
```

---

## Task 12: 마감 — 국면 리포트 배지 + 내보내기 + 통합 검증

**Files:**
- Modify: `map/forge.html`
- Modify: `map/forge-core.test.js` (회귀 가드 1건)

**Interfaces:**
- Consumes: `lastResult.verdict`, `boardToGraph`, `boardState`, `data`.
- Produces: `renderVerdict(verdict)` (차트 페인 상단 국면/목표가/무효화 배지), `exportStrategy()` (전략 JSON 다운로드: `{nodes,edges,version}`).

- [ ] **Step 1: 국면 리포트 배지**

차트 페인 상단에 `renderVerdict(verdict)` — regime 색 dot + "국면: 상승/하락/중립 · 시그널 {score} · 목표가 {target} · 무효화 {invalidation}". `runForge` 끝에서 호출.

- [ ] **Step 2: 전략 내보내기**

헤더에 `내보내기` 버튼 → `exportStrategy()`가 `{version:ForgeCore.version, nodes:boardState.nodes, edges:boardState.edges}`를 JSON Blob 다운로드.

- [ ] **Step 3: 회귀 가드 테스트 추가 + 전체 통과**

`forge-core.test.js`에 기본 시드 그래프 1건을 `run`해 `prediction.path.length===120 && signal.length===data.n` 어서션 추가.
Run: `node --test map/forge-core.test.js`
Expected: PASS (전체).

- [ ] **Step 4: 헤드리스 종합 시나리오 검증**

Run: forge.html 로드 → 부팅 시 시그니처 장면 렌더 → 블록 추가/연결 변경 → 차트·오버레이·배지 갱신 → 내보내기 클릭(JSON 생성). 콘솔 에러 0. 최종 스크린샷.
Expected: 전 흐름 무에러, 시그니처 장면 + 배지 + 내보내기 동작.

- [ ] **Step 5: 커밋**

```bash
git add map/forge.html map/forge-core.test.js
git commit -m "feat(forge): 국면 리포트 배지 + 전략 내보내기 + 통합 검증"
```

---

## Self-Review (작성자 점검)

**Spec coverage:**
- §2 시그니처(폴딩/살아있는 그래프/합의) → Task 5(폴딩), 9(폴드 렌더), 11(맥동+합의+콘). ✅
- §4 3레이어(보드/인터프리터/차트) → 보드 Task 7–8, 인터프리터 Task 3–6, 차트 Task 9. ✅
- §4.4 전략 계약 → `boardToGraph`(Task 7) + `exportStrategy`(Task 12). ✅
- §5 노드 어휘(하이브리드, free 제외 계산) → `buildDAG` free 제외(Task 3), 블록 5종(Task 4–6, 8). ✅ (조건/분기·기본분석 바이어스는 Phase 2 — 범위 외, 의도적)
- §6 출력 계약(예측/시그널/국면) → `run`(Task 6) + 배지(Task 12). ✅
- §7 MVP-1(분할 뷰 + 최소셋 + 폴딩+합의+콘+풀연출) → 전 태스크. ✅
- §3 품질 하한(chart.html 수준) → Task 9 포팅 기준 명시. ✅
- §8 리스크(디바운스/성능/네임스페이스/noindex/POST 제외) → Task 10 디바운스, Task 1 noindex, 저장 범위 외. ✅
- §9 테스트(코어 순수함수 node + 시각 헤드리스) → 전 코어 태스크 TDD + 시각 검증 단계. ✅

**Placeholder scan:** `seedDefaultStrategy`(Task 8 Step 2)는 본문 주석으로 좌표·엣지 배치를 위임 — 구현자가 BLOCK_DEFS+addEdge로 채울 수 있는 결정적 작업이라 허용. 포팅 태스크(7·9·11)는 "완전 코드 붙여넣기" 대신 **출처 파일+라인+적응 지시**로 명시(2개 200KB+ 파일을 그대로 옮기는 작업이라 이 방식이 정확). 그 외 신규 로직(코어·와이어링·오버레이 골격)은 실제 코드 포함.

**Type consistency:** `run`/`evalBlocks` 반환 `{values,meta}` 일관, `prediction.{path,lo,hi,futW}`·`verdict.{regime,score,target,invalidation}`·`signal` 명칭 전 태스크 동일. `boardToGraph()`→`{nodes:[{id,kind,blockType,params}],edges:[{from,to}]}`가 `buildDAG`/`run` 입력과 일치. ✅
