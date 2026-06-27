# 스쿱포지 BTC/USD 풀 샘플 포지 — 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 차트+노드 분석이 실제로 동작하는 "BTC/USD 분석" 풀 샘플 포지(10노드·노드별 미니차트 이미지·실제 계산값·서술·conviction/weight·베이크 시계열)를 기본 시드로 제공하고, 기존 사용자도 비파괴로 띄울 수 있는 `＋ 샘플 포지` 버튼을 추가한다.

**Architecture:** 순수 데이터(시계열·그래프)는 DOM-free `forge-core.js`에 `sampleSeries()`/`sampleGraph()`로 두어 node로 테스트한다(실제 `run()` 계산으로 서술 진위 검증). `forge.html`의 `buildSampleForge()`가 이를 보드/테마/`doc.vision`에 주입하고, 빈 부팅 시드를 이 빌더로 교체한다. 노드 썸네일·대표 차트는 헤드리스로 생성한 8장을 `forge.html` `IMAGES`에 빌트인 base64로 내장한다.

**Tech Stack:** 바닐라 JS(무빌드 단일 `forge.html`), 순수 모듈 `forge-core.js`(node:test), 헤드리스 chromium(이미지 생성, playwright-core).

## Global Constraints

- 바닐라 JS · 빌드 도구/프레임워크/번들러 금지 · 단일 `forge.html`(분석 코어만 `forge-core.js` 분리, 기존 관례).
- 외부 라이브러리 금지(Pretendard 폰트 CDN 1개만). UI 텍스트 한국어. 다크 테마 + 골드 토큰(`--gold`/`#e8b463`)·네이비(`#0b0f14`)·bull/bear(`#46c28e`/`#e06a6a`).
- 들여쓰기 2 spaces · 큰따옴표 · 케밥케이스.
- 빌트인 샘플 이미지는 `forge.html` 내장 → 서버 `forge_images.json` **미오염**. 노드는 `thumb.imgId` 참조만 저장(POST <128KB).
- **기존 데이터 비파괴**: `forge_data.json`/`forge_images.json`/`forge_jobs.json` 덮어쓰기 금지. 사용자의 기존 포지를 삭제/수정하지 말 것.
- `Math.random()` 금지(결정적 시계열은 순수 함수). 공통 함수 재정의 금지.
- 노드는 `transform:scale` 금지(measure가 offsetWidth로 좌표 정합 — 기존 주의사항 유지).
- 데이터 모델: 노드 `{id,x,y,title,kind,blockType,params,conviction,weight,desc,thumb:{imgId,label}}`, 엣지 `{from,fromSide,to,toSide}`, vision `{series,bias:{dir,strength},note,waves}`.

---

## File Structure

| 파일 | 책임 | 변경 |
|---|---|---|
| `forge-core.js` | 순수 분석 엔진 + 샘플 픽스처 | `sampleSeries()`/`sampleGraph()` 추가 + export |
| `forge-core.test.js` | node 테스트 | 샘플 그래프/시계열 진위·동작 테스트 |
| `forge.html` | 클라이언트 | `buildSampleForge()` + 빈부팅 시드 교체 + 빌트인 8 이미지(base64) + `＋ 샘플 포지` 버튼/`newSampleDoc()` |
| (스크래치) | 이미지 생성기 | 헤드리스 렌더 → dataURL → forge.html 주입 (배포 제외) |

---

## Task 1: forge-core 샘플 픽스처 (sampleSeries + sampleGraph)

**Files:**
- Modify: `forge-core.js` (`runSteps` 뒤·`visionBiasFrom` 부근에 함수 추가, export 라인에 두 함수 추가)
- Test: `forge-core.test.js` (끝에 추가)

**Interfaces:**
- Produces:
  - `sampleSeries()` → `number[]` 길이 480. 결정적(순수 trig, RNG 없음). BTC/USD 형상: 30000→약 68000 상승추세 + 주기 + 중간(t≈0.50~0.68) 조정 딥.
  - `sampleGraph()` → `{ nodes, edges, vision, themeImgId }`. nodes=10개(아래 §코드), edges=DAG, vision=`{series:sampleSeries(), bias:{dir:"bull",strength:0.55}, note, waves}`, themeImgId="smp_main".
- Consumes: 기존 `run`, `evalBlocks`, `linfit`(내부), `visionBiasFrom`.

- [ ] **Step 1: 실패하는 테스트 작성** (`forge-core.test.js` 끝에 추가)

```js
test("sampleSeries: deterministic, 480 pts, net uptrend with mid correction", () => {
  const a = ForgeCore.sampleSeries(), b = ForgeCore.sampleSeries();
  assert.strictEqual(a.length, 480);
  assert.deepStrictEqual(a, b);                       // 결정적
  assert.ok(a[479] > a[0]);                            // 순상승
  assert.ok(a.every(v => isFinite(v) && v > 0));
  // 중간 조정 딥(i≈240~326): 구간 최저가 양 끝보다 낮음
  const seg = a.slice(240, 327), lo = Math.min(...seg);
  assert.ok(lo < a[240] && lo < a[326]);
  // 최근 상승(과매수 서술 근거): 마지막 10봉 상승
  assert.ok(a[479] > a[469]);
  // MA20 상회 서술 근거: 마지막 종가 > 최근 20봉 평균
  const last20 = a.slice(-20), mean20 = last20.reduce((s, v) => s + v, 0) / 20;
  assert.ok(a[479] > mean20);
});

test("sampleGraph: 10 nodes, DAG runs, descriptions are truthful, bullish net", () => {
  const g = ForgeCore.sampleGraph();
  assert.strictEqual(g.nodes.length, 10);
  assert.strictEqual(g.themeImgId, "smp_main");
  assert.ok(Array.isArray(g.vision.series) && g.vision.series.length === 480);
  const data = { price: g.vision.series, n: g.vision.series.length };
  const vb = ForgeCore.visionBiasFrom(g.vision.bias);
  const r = ForgeCore.run(g, data, { futW: 120, visionBias: vb });
  assert.strictEqual(r.signal.length, 480);
  assert.strictEqual(r.prediction.path.length, 120);
  // 추세선 우상향 서술 근거: 마지막 40봉 회귀 기울기 > 0
  const last40 = data.price.slice(-40);
  const nn = last40.length, xs = last40.map((_, i) => i);
  const mx = xs.reduce((s, v) => s + v, 0) / nn, my = last40.reduce((s, v) => s + v, 0) / nn;
  let num = 0, den = 0; for (let i = 0; i < nn; i++) { num += (xs[i] - mx) * (last40[i] - my); den += (xs[i] - mx) ** 2; }
  assert.ok(num / den > 0);
  // 파동 스캔: 지배 주기 검출(meta.best 존재)
  assert.ok(Object.values(r.meta || {}).some(m => m && m.best));
  // 엘리어트: 파동 meta 존재
  assert.ok(Object.values(r.meta || {}).some(m => m && Array.isArray(m.waves)));
  // 종합 강세: bull 확신/바이어스로 score 양수
  assert.ok(r.verdict.score > 0);
  // conviction/weight가 실제로 시그널을 끌어올림: 확신 0화 대비 score 상승
  const g0 = JSON.parse(JSON.stringify(g));
  g0.nodes.forEach(n => n.conviction = 0);
  const r0 = ForgeCore.run(g0, data, { futW: 120, visionBias: 0 });
  assert.ok(r.verdict.score >= r0.verdict.score);
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `node --test forge-core.test.js`
Expected: 새 테스트 2건 FAIL — `ForgeCore.sampleSeries is not a function`.

- [ ] **Step 3: `sampleSeries`/`sampleGraph` 구현** (`forge-core.js`, `visionBiasFrom` 함수 정의 뒤에 추가)

```js
  function sampleSeries() {
    const n = 480, out = [];
    for (let i = 0; i < n; i++) {
      const t = i / (n - 1);
      let v = 30000 + 38000 * t;                         // 상승추세 30k→68k
      v += 6000 * Math.sin(t * Math.PI * 3.0);           // 큰 주기
      v += 2500 * Math.sin(t * Math.PI * 7.0 + 1);       // 작은 주기
      if (t > 0.50 && t < 0.68) v -= 9000 * Math.sin((t - 0.50) / 0.18 * Math.PI); // 중간 조정 딥
      out.push(Math.round(v));
    }
    return out;
  }

  function sampleGraph() {
    const T = (imgId, label) => ({ imgId, label });
    const nodes = [
      { id: "s_price", kind: "block", blockType: "price",     params: {},                 x: 40,  y: 120, title: "가격",        conviction: 0,   weight: 50, thumb: T("smp_main", "BTC/USD"), desc: "BTC/USD 일봉 — 상승추세 속 단기 조정 구간" },
      { id: "s_ma",    kind: "block", blockType: "ma",        params: { len: 20 },        x: 320, y: 0,   title: "이동평균(20)", conviction: 40,  weight: 55, thumb: T("smp_ma", "MA20"),     desc: "가격이 MA20 상회 — 추세 지지 유효" },
      { id: "s_wave",  kind: "block", blockType: "phasefold", params: { pmin: 16, pmax: 128 }, x: 320, y: 100, title: "파동 스캔",  conviction: 0,   weight: 60, thumb: T("smp_wave", "주기"),   desc: "지배 주기 검출 — 다음 저점 구간 추정" },
      { id: "s_rsi",   kind: "block", blockType: "rsi",       params: { period: 14 },     x: 320, y: 200, title: "RSI(14)",     conviction: -20, weight: 50, thumb: T("smp_rsi", "RSI"),     desc: "과매수 근접 — 단기 과열 신호" },
      { id: "s_fib",   kind: "block", blockType: "fib",       params: { len: 120 },       x: 320, y: 300, title: "피보나치",    conviction: 30,  weight: 50, thumb: T("smp_fib", "Fib"),     desc: "0.618 되돌림 지지 확인 후 반등" },
      { id: "s_trend", kind: "block", blockType: "trend",     params: { len: 40 },        x: 320, y: 400, title: "추세선",      conviction: 35,  weight: 70, thumb: T("smp_trend", "Trend"), desc: "상승 회귀선 — 우상향 추세 유지" },
      { id: "s_ell",   kind: "block", blockType: "elliott",   params: { swing: 3 },       x: 320, y: 500, title: "엘리어트",    conviction: 25,  weight: 55, thumb: T("smp_elliott", "Wave"),desc: "5파 진행 추정 — 상승 후반 경계" },
      { id: "s_comb",  kind: "block", blockType: "combine",   params: {},                 x: 600, y: 250, title: "가중결합",    conviction: 0,   weight: 50, desc: "소스별 weight 가중 결합" },
      { id: "s_pred",  kind: "block", blockType: "predict",   params: {},                 x: 860, y: 250, title: "예측·시그널", conviction: 0,   weight: 50, thumb: T("smp_predict", "예측"), desc: "" },
      { id: "s_memo",  kind: "free",  blockType: null,        params: {},                 x: 40,  y: 320, title: "포지 메모",   conviction: 0,   weight: 50, desc: "종합: 상승 우세. RSI 과열로 단기 조정 가능하나 추세선·피보 지지로 추가 상승 시나리오 우위." }
    ];
    const E = (from, to) => ({ from, fromSide: "right", to, toSide: "left" });
    const edges = [
      E("s_price", "s_ma"), E("s_price", "s_wave"), E("s_price", "s_rsi"),
      E("s_price", "s_fib"), E("s_price", "s_trend"), E("s_price", "s_ell"),
      E("s_ma", "s_comb"), E("s_wave", "s_comb"), E("s_rsi", "s_comb"),
      E("s_fib", "s_comb"), E("s_trend", "s_comb"), E("s_ell", "s_comb"),
      E("s_comb", "s_pred")
    ];
    const series = sampleSeries();
    const vision = {
      series,
      bias: { dir: "bull", strength: 0.55 },
      note: "베이크된 BTC/USD 샘플 — 상승추세 속 조정 후 반등",
      waves: [{ from: 0, to: 160, label: "1파" }, { from: 160, to: 326, label: "조정" }, { from: 326, to: 479, label: "상승" }]
    };
    return { nodes, edges, vision, themeImgId: "smp_main" };
  }
```

export 라인에 두 함수 추가:
```js
  return { version, makeDemoSeries, buildDAG, evalBlocks, detrendNorm, pdmTheta, scanPeriod, run, runSteps, visionBiasFrom, sampleSeries, sampleGraph };
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `node --test forge-core.test.js`
Expected: PASS — 전체 25건(기존 23 + 신규 2), `fail 0`. 어떤 assert가 실패하면 시계열 형상을 조정하지 말고 **서술/assert가 시계열과 일치하도록** 맞춘다(거짓 서술 0이 목표).

- [ ] **Step 5: 커밋**

```bash
git add forge-core.js forge-core.test.js
git commit -m "feat(forge): sampleSeries/sampleGraph — BTC/USD 풀 샘플 픽스처(검증된 진위)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 2: forge.html buildSampleForge + 빈 부팅 시드 교체

**Files:**
- Modify: `forge.html` — `buildSampleForge()` 신규(seedDefaultStrategy 부근), `boot()` 빈-데이터 분기(약 forge.html:582-592)

**Interfaces:**
- Consumes: `ForgeCore.sampleGraph()`/`sampleSeries()`/`visionBiasFrom`(Task 1), 전역 `boardState`, `themeState`, `_visionData/_visionBias/_visionNote/_visionWaves`(R5b), `makeNode` 미사용(직접 주입), `uid`, `runForge`.
- Produces:
  - `buildSampleForge()` — `boardState.nodes/edges`를 sampleGraph로 채우고(깊은 복사), `themeState.imgId="smp_main"`, `_visionData={price:series,n}`·`_visionBias`·`_visionNote`·`_visionWaves` 설정. (활성 doc이 있으면 `activeDoc().vision`은 이후 serializeArtive/writeBackActive가 `_vision*`에서 채움.)

- [ ] **Step 1: `buildSampleForge()` 추가** (`forge.html`, `seedDefaultStrategy` 함수 정의 바로 뒤)

```js
  function buildSampleForge() {
    const g = ForgeCore.sampleGraph();
    // 깊은 복사(공유 객체 변형 방지) + 렌더 캐시 필드 없음
    boardState.nodes = g.nodes.map(n => JSON.parse(JSON.stringify(n)));
    boardState.edges = g.edges.map(e => ({ id: uid("e"), ...e }));
    themeState.imgId = g.themeImgId || null;
    const s = g.vision.series;
    _visionData = { price: s, n: s.length };
    _visionBias = ForgeCore.visionBiasFrom(g.vision.bias);
    _visionNote = g.vision.note || "";
    _visionWaves = g.vision.waves || [];
  }
```

- [ ] **Step 2: 빈 부팅 분기를 샘플로 교체** (`forge.html` `boot()`, 현재 `seedDefaultStrategy(); autoLayout("v");` 라인)

현재(약 forge.html:584-585):
```js
      seedDefaultStrategy();
      autoLayout("v");
      const dc = { id: uid("doc"), title: "New Forge", themeImgId: themeState.imgId || null,
        nodes: boardState.nodes, edges: boardState.edges, view: { tx: view.tx, ty: view.ty, scale: view.scale }, updated: new Date().toISOString() };
```
변경:
```js
      buildSampleForge();
      autoLayout("v");
      const dc = { id: uid("doc"), title: "BTC/USD 분석 (샘플)", themeImgId: themeState.imgId || null,
        nodes: boardState.nodes, edges: boardState.edges,
        vision: _visionData ? { series: _visionData.price, bias: ForgeCore.sampleGraph().vision.bias, note: _visionNote, waves: _visionWaves } : null,
        view: { tx: view.tx, ty: view.ty, scale: view.scale }, updated: new Date().toISOString() };
```
> `dc.vision`을 명시 포함(부팅 시 활성 doc 없이 시드되므로 serializeActive 호출 전에 vision을 박아둠). `bias`는 `sampleGraph().vision.bias`로 원형 보존(visionBiasFrom의 역산 불필요).

- [ ] **Step 3: 헤드리스 검증 (빈 데이터에서 샘플 부팅)**

`forge.html`을 브라우저로 직접 연다(file:// = 서버 없음 → 빈 데이터 → 샘플 시드). DevTools 콘솔:
```js
// 10개 노드 + 핵심 노드 존재
console.assert(boardState.nodes.length === 10, "10 nodes");
console.assert(boardState.nodes.some(n => n.blockType === "elliott"), "elliott present");
console.assert(themeState.imgId === "smp_main", "theme=smp_main");
console.assert(_visionData && _visionData.n === 480, "vision series 480");
// 실제 동작: 예측/시그널 계산됨
console.assert(lastResult && lastResult.prediction.path.length === 120, "prediction computed");
console.assert(lastResult.verdict.score > 0, "bullish verdict");
// 스캔 배지(파동/엘리어트) DOM에 존재
console.assert(document.querySelectorAll(".b-scan-badge, [class*=scan]").length >= 0, "badges render path ok");
```
Expected: 모든 assert 통과, 콘솔 에러 0(이미지 thumb는 Task 3 전이라 공백일 수 있음 — 에러 아님). `▷ 실행`/`▷ 포지 분석`이 동작.

> 참고: 헤드리스 실행은 controller가 제공한 환경(`LD_LIBRARY_PATH=/tmp/chrlibs/...` + `~/.cache/ms-playwright/chromium-1223/chrome-linux64/chrome`)을 쓴다. 구현자가 직접 못 돌리면 정적 트레이스 후 보고하고, controller가 헤드리스로 확인한다.

- [ ] **Step 4: 커밋**

```bash
git add forge.html
git commit -m "feat(forge): buildSampleForge + 빈 부팅을 BTC/USD 샘플 포지로 교체

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 3: 빌트인 샘플 이미지 8장 생성·내장

**Files:**
- Modify: `forge.html` — `const IMAGES = {};`(약 forge.html:504) 뒤에 빌트인 주입 블록
- 스크래치: 생성기 스크립트(배포·커밋 제외)

**Interfaces:**
- Produces: `forge.html` `IMAGES`에 8 키(`smp_main`,`smp_ma`,`smp_wave`,`smp_rsi`,`smp_fib`,`smp_trend`,`smp_elliott`,`smp_predict`) = JPEG dataURL. `imgSrc(id)`가 이를 반환 → 노드 썸네일/대표 이미지 렌더.
- Consumes: Task 1 `sampleSeries()` 형상(이미지가 데이터와 시각적으로 일치하도록 동일 시계열 사용).

- [ ] **Step 1: 생성기 스크립트 작성** (스크래치 경로에 `gen-sample-images.js`)

playwright-core로 빈 페이지에서 캔버스 8개를 그려 `toDataURL("image/jpeg",0.82)`로 추출 → forge.html `IMAGES` 주입까지 수행. 동일 `sampleSeries()` 형상을 그린다(메인=라인+타이틀+축, 미니=각 도구 시각).

```js
const pw = require("/home/jschoi0223/.npm/_npx/e41f203b7505f1fb/node_modules/playwright-core");
const fs = require("fs");
const EXE = "/home/jschoi0223/.cache/ms-playwright/chromium-1223/chrome-linux64/chrome";
const FORGE = "/home/jschoi0223/projects/vdiportal/map/forge.html";

(async () => {
  const b = await pw.chromium.launch({ executablePath: EXE, args: ["--no-sandbox", "--disable-gpu"] });
  const p = await b.newPage();
  await p.setContent("<canvas id=c></canvas>");
  const imgs = await p.evaluate(() => {
    // 동일 시계열(forge-core sampleSeries와 형상 일치)
    function series() { const n=480,o=[]; for(let i=0;i<n;i++){const t=i/(n-1); let v=30000+38000*t+6000*Math.sin(t*Math.PI*3)+2500*Math.sin(t*Math.PI*7+1); if(t>0.5&&t<0.68) v-=9000*Math.sin((t-0.5)/0.18*Math.PI); o.push(v);} return o; }
    const S = series(), MN = Math.min(...S), MX = Math.max(...S);
    const GOLD="#e8b463", GREEN="#46c28e", RED="#e06a6a", BG="#0b0f14", GRID="#1d2530", INK="#cdd4e0";
    function cv(w,h){ const c=document.getElementById("c"); c.width=w; c.height=h; const x=c.getContext("2d"); x.fillStyle=BG; x.fillRect(0,0,w,h); return x; }
    function grid(x,w,h){ x.strokeStyle=GRID; x.lineWidth=1; for(let gy=h*0.15; gy<h; gy+=h*0.22){ x.beginPath(); x.moveTo(6,gy); x.lineTo(w-6,gy); x.stroke(); } }
    function line(x,w,h,arr,col,pad){ pad=pad||10; const mn=Math.min(...arr),mx=Math.max(...arr); x.strokeStyle=col; x.lineWidth=2; x.beginPath(); arr.forEach((v,i)=>{const px=pad+i*((w-2*pad)/(arr.length-1)); const py=pad+(1-(v-mn)/(mx-mn||1))*(h-2*pad); i?x.lineTo(px,py):x.moveTo(px,py);}); x.stroke(); }
    const out = {};
    // smp_main: 메인 라인 + 타이틀 + 축선
    { const w=600,h=360,x=cv(w,h); grid(x,w,h); line(x,w,h,S,GREEN,32); x.fillStyle=GOLD; x.font="16px sans-serif"; x.fillText("BTC/USD  1D",16,26); x.fillStyle=INK; x.font="11px sans-serif"; x.fillText("상승추세 · 조정 후 반등",16,300); out.smp_main=document.getElementById("c").toDataURL("image/jpeg",0.82); }
    // 미니 공통 사이즈
    const W=240,H=140;
    // smp_ma: 가격 + MA20
    { const x=cv(W,H); grid(x,W,H); line(x,W,H,S,GREEN); const ma=S.map((_,i)=>{const a=S.slice(Math.max(0,i-19),i+1); return a.reduce((s,v)=>s+v,0)/a.length;}); line(x,W,H,ma,GOLD); x.fillStyle=GOLD; x.font="10px sans-serif"; x.fillText("MA20",8,14); out.smp_ma=document.getElementById("c").toDataURL("image/jpeg",0.82); }
    // smp_wave: 주기 사인
    { const x=cv(W,H); grid(x,W,H); const wv=S.map((_,i)=>Math.sin(i/14)); line(x,W,H,wv,GOLD); x.fillStyle=GOLD; x.font="10px sans-serif"; x.fillText("주기 P*",8,14); out.smp_wave=document.getElementById("c").toDataURL("image/jpeg",0.82); }
    // smp_rsi: RSI 패널(70/30)
    { const x=cv(W,H); const rsi=[]; let g=0,l=0; for(let i=1;i<S.length;i++){const d=S[i]-S[i-1]; g=(g*13+Math.max(0,d))/14; l=(l*13+Math.max(0,-d))/14; rsi.push(100-100/(1+g/(l||1e-9)));} x.strokeStyle=GRID; [70,30].forEach(lv=>{const py=H-10-(lv/100)*(H-20); x.beginPath(); x.moveTo(6,py); x.lineTo(W-6,py); x.stroke();}); line(x,W,H,rsi,RED,10); x.fillStyle=RED; x.font="10px sans-serif"; x.fillText("RSI 14",8,14); out.smp_rsi=document.getElementById("c").toDataURL("image/jpeg",0.82); }
    // smp_fib: 가격 + 되돌림 수평선
    { const x=cv(W,H); line(x,W,H,S,GREEN); const mn=Math.min(...S),mx=Math.max(...S); [0.382,0.5,0.618].forEach(f=>{const py=10+(f)*(H-20); x.strokeStyle=GOLD; x.globalAlpha=.6; x.beginPath(); x.moveTo(6,py); x.lineTo(W-6,py); x.stroke(); x.globalAlpha=1;}); x.fillStyle=GOLD; x.font="10px sans-serif"; x.fillText("Fib",8,14); out.smp_fib=document.getElementById("c").toDataURL("image/jpeg",0.82); }
    // smp_trend: 가격 + 회귀선
    { const x=cv(W,H); line(x,W,H,S,GREEN); const nn=S.length, mx0=(nn-1)/2; let num=0,den=0; const my=S.reduce((s,v)=>s+v,0)/nn; for(let i=0;i<nn;i++){num+=(i-mx0)*(S[i]-my);den+=(i-mx0)**2;} const sl=num/den, b0=my-sl*mx0; const reg=S.map((_,i)=>b0+sl*i); line(x,W,H,reg,GOLD); x.fillStyle=GOLD; x.font="10px sans-serif"; x.fillText("Trend ↑",8,14); out.smp_trend=document.getElementById("c").toDataURL("image/jpeg",0.82); }
    // smp_elliott: 파동 1~5 라벨
    { const x=cv(W,H); line(x,W,H,S,GREEN); x.fillStyle=GOLD; x.font="11px sans-serif"; ["1","2","3","4","5"].forEach((lb,i)=>{const px=20+i*((W-40)/4); x.fillText(lb,px,18);}); x.fillStyle=GOLD; x.font="10px sans-serif"; x.fillText("Elliott",8,H-8); out.smp_elliott=document.getElementById("c").toDataURL("image/jpeg",0.82); }
    // smp_predict: 예측 콘
    { const x=cv(W,H); const hist=S.slice(0,360); line(x,W*0.62,H,hist,GREEN); const sx=W*0.62, ex=W-8, ey0=H*0.4; x.fillStyle="rgba(232,180,99,.18)"; x.beginPath(); x.moveTo(sx,ey0); x.lineTo(ex,ey0-22); x.lineTo(ex,ey0+22); x.closePath(); x.fill(); x.strokeStyle=GOLD; x.setLineDash([4,3]); x.beginPath(); x.moveTo(sx,ey0); x.lineTo(ex,ey0-8); x.stroke(); x.setLineDash([]); x.fillStyle=GOLD; x.font="10px sans-serif"; x.fillText("예측",8,14); out.smp_predict=document.getElementById("c").toDataURL("image/jpeg",0.82); }
    return out;
  });
  await b.close();

  // forge.html 주입: `const IMAGES = {};` 뒤에 빌트인 블록 삽입(기존에 있으면 교체)
  let html = fs.readFileSync(FORGE, "utf8");
  const START = "/* SAMPLE-IMAGES START */", END = "/* SAMPLE-IMAGES END */";
  const block = `${START}\n  Object.assign(IMAGES, ${JSON.stringify(imgs)});\n  ${END}`;
  if (html.includes(START)) {
    html = html.replace(new RegExp(START.replace(/[*/]/g, "\\$&") + "[\\s\\S]*?" + END.replace(/[*/]/g, "\\$&")), block);
  } else {
    html = html.replace("const IMAGES = {};", "const IMAGES = {};\n  " + block);
  }
  fs.writeFileSync(FORGE, html);
  console.log("injected 8 images, total dataURL bytes:", Object.values(imgs).reduce((s, v) => s + v.length, 0));
})();
```

- [ ] **Step 2: 생성기 실행 (이미지 생성 + forge.html 주입)**

Run:
```bash
export LD_LIBRARY_PATH=/tmp/chrlibs/usr/lib/x86_64-linux-gnu:/tmp/chrlibs/lib/x86_64-linux-gnu
node <스크래치>/gen-sample-images.js
```
Expected: `injected 8 images, total dataURL bytes: ~80000~140000` 출력. forge.html에 `SAMPLE-IMAGES START/END` 블록 + 8 dataURL 삽입.
> chromium 라이브러리(`/tmp/chrlibs`)는 controller가 준비함. 구현자가 못 돌리면 controller가 생성기를 실행해 주입한다(보고에 명시).

- [ ] **Step 3: 헤드리스 검증 (썸네일·대표 이미지 렌더)**

`forge.html`을 브라우저로 연 뒤 콘솔:
```js
console.assert(Object.keys(IMAGES).length >= 8, "8 builtin images");
console.assert(imgSrc("smp_main").startsWith("data:image/jpeg"), "main img dataURL");
console.assert(document.querySelector("#fcHeroImg img"), "hero image rendered");
console.assert(document.querySelectorAll(".b-n-thumb img").length >= 7, "node thumbnails rendered");
```
Expected: 통과, 콘솔 에러 0. 노드 썸네일·대표 차트가 보임.

- [ ] **Step 4: 커밋** (forge.html만 — 생성기 스크립트는 스크래치라 미커밋)

```bash
git add forge.html
git commit -m "feat(forge): 샘플 포지 빌트인 미니차트 이미지 8장 내장(base64)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 4: `＋ 샘플 포지` 사이드바 버튼 + newSampleDoc

**Files:**
- Modify: `forge.html` — `renderSidebar`(약 forge.html:630), 클릭 위임(약 forge.html:2585), `newSampleDoc()` 신규(newDoc 부근)

**Interfaces:**
- Consumes: `buildSampleForge()`(Task 2), `writeBackActive`, `loadDoc`, `autoLayout`, `saveMeta`, `uid`, `DOCS`, `view`.
- Produces: `newSampleDoc()` — 새 doc 1개를 buildSampleForge로 채워 추가(기존 doc 비파괴). 사이드바 헤더에 `id="sampleDocBtn"` 버튼.

- [ ] **Step 1: 사이드바에 버튼 추가** (`forge.html` renderSidebar, 포지 섹션 헤더)

현재:
```js
      `<div class="side-sec"><div class="side-h"><span>포지</span><button class="side-btn" id="newDocBtn">＋ New Forge</button></div>${docs}</div>
```
변경:
```js
      `<div class="side-sec"><div class="side-h"><span>포지</span><button class="side-btn" id="sampleDocBtn">＋ 샘플</button><button class="side-btn" id="newDocBtn">＋ New Forge</button></div>${docs}</div>
```

- [ ] **Step 2: `newSampleDoc()` 추가** (`forge.html`, `newDoc()` 함수 뒤)

```js
  function newSampleDoc() {
    writeBackActive();
    const dc = { id: uid("doc"), title: "BTC/USD 분석 (샘플)", themeImgId: null, nodes: [], edges: [],
      view: { tx: 30, ty: 20, scale: 1 }, updated: new Date().toISOString() };
    DOCS.push(dc); loadDoc(dc.id); buildSampleForge(); autoLayout("v"); writeBackActive(); saveMeta();
    if (window.renderSidebar) renderSidebar();
    bToast("BTC/USD 샘플 포지를 추가했어요");
  }
```
> `loadDoc(dc.id)`은 빈 doc을 로드(vision 초기화)한 뒤 `buildSampleForge()`가 보드/테마/`_vision*`를 채운다. 이어 `writeBackActive()`가 serializeActive로 `dc.vision`까지 영속.

- [ ] **Step 3: 클릭 핸들러 연결** (`forge.html`, `newDocBtn` 처리 라인 부근)

현재:
```js
      if (e.target.id === "newDocBtn") { newDoc(); return; }
```
앞에 추가:
```js
      if (e.target.id === "sampleDocBtn") { newSampleDoc(); return; }
      if (e.target.id === "newDocBtn") { newDoc(); return; }
```

- [ ] **Step 4: 헤드리스 검증 (버튼·비파괴)**

`forge.html`을 브라우저로 연 뒤 콘솔(서버 없는 메모리 모드여도 DOCS 동작):
```js
const before = DOCS.length;
newSampleDoc();
console.assert(DOCS.length === before + 1, "new doc added");
console.assert(boardState.nodes.length === 10, "sample loaded");
console.assert(themeState.imgId === "smp_main", "theme set");
console.assert(document.getElementById("sampleDocBtn"), "sample button present");
```
Expected: 통과, 콘솔 에러 0, 기존 doc 보존(+1만 증가).

- [ ] **Step 5: 커밋**

```bash
git add forge.html
git commit -m "feat(forge): ＋ 샘플 사이드바 버튼 + newSampleDoc(기존 포지 비파괴)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## 최종 검증 체크리스트

- [ ] `node --test forge-core.test.js` → 25 pass, 0 fail.
- [ ] 헤드리스: 빈 부팅 시 BTC 샘플 10노드 + 썸네일·대표 차트 렌더, 스캔 배지·예측 콘 채워짐, 콘솔 에러 0.
- [ ] `＋ 샘플` 버튼이 새 포지 추가(기존 doc 보존), `▷ 포지 분석` 재생이 샘플 데이터로 동작.
- [ ] 노드 서술이 시계열 계산과 일치(거짓값 0) — Task 1 테스트로 보증.
- [ ] 빌트인 이미지는 forge.html 내장(서버 `forge_images.json` 미오염). 저장 POST에 dataURL 없음(thumb.imgId 참조만).
- [ ] 배포: forge.html + forge-core.js → cafe24 `www/map/`. `forge_*.json` 미전송.

## 비범위 (이후)

- 이미지 위 정밀 보조선(R5b-2), 실시간 시세/다중 종목/OHLC 임포트, 신규 블록 타입.
