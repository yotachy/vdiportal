# 스쿱포지 (Scoop Forge) Phase 1.5 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 스쿱포지에 노드 파라미터 편집기(수치+확신+서술 메모) · 확신 가중 바이어스(인터프리터) · 주제 배너 · 썸네일 라이브러리/노드 이미지(Ctrl+V 포함)를 추가한다.

**Architecture:** 인터프리터(`forge-core.js`)에 노드 conviction 집계→시그널 바이어스를 추가(node TDD). 나머지는 `forge.html`에 추가: 단일선택 노드 파라미터 편집 패널, 보드 상단 주제 배너, 좌측 접이식 썸네일 라이브러리(map.html 시스템 포팅, 빌트인 샘플 없음) + 노드 썸네일 렌더, Ctrl+V 이미지 붙여넣기 라우팅. 이미지는 메모리 dataURL(`IMAGES`) + JSON 내보내기.

**Tech Stack:** 바닐라 JS. node 내장 `node --test`로 `forge-core.js` 검증. 시각 검증은 헤드리스 chrome-headless-shell 스크린샷(컨트롤러).

## Global Constraints

- 수정 대상: `map/forge.html`, `map/forge-core.js`, `map/forge-core.test.js`만. **기존 `map/map.html`·`map/chart.html` 절대 수정 금지.**
- 바닐라 JS, 프레임워크/번들러 금지(Pretendard CDN 예외). 2 spaces, 큰따옴표, 케밥케이스 id/class.
- 다크 골드 테마 토큰만: `--gold:#e8b463 / --bg:#0b0f14 / --eth:#8a92b2 / --bull:#46c28e / --bear:#e06a6a`. 한국어 UI.
- `forge-core.js`는 DOM-free 유지(브라우저 `window.ForgeCore` + node `module.exports`). 기존 node 테스트 전부 통과 유지.
- **빌트인 샘플 이미지 금지**(파일 경량 유지) — 사용자 업로드/붙여넣기 dataURL만. `downscaleImage`로 최대 1000px·JPEG·<120KB.
- forge.html 네임스페이스: 보드 `b*`, 차트 `fc*`, 오버레이 `_*`, **신규 이미지/라이브러리는 `IMAGES`/`LIBRARY`/`lib*`/`theme*`**. 충돌 금지.
- 확신 바이어스 하위호환: conviction 미지정/0이면 결과 불변.
- 영속: 메모리 + JSON 내보내기. 서버 저장 범위 밖.

---

## Task 1: 인터프리터 — 확신(conviction) 바이어스

**Files:**
- Modify: `map/forge-core.js`
- Modify: `map/forge-core.test.js`

**Interfaces:**
- Consumes: 기존 `run(graph, data, opts)`, `evalBlocks`, `detrendNorm`.
- Produces: `run`이 `graph.nodes[i].conviction`(number, 기본 0)를 집계해 `signal`/`verdict`에 반영. `prediction`은 불변. 새 helper `aggregateConviction(graph)` → number(−100~100 평균, nonzero만, 없으면 0). 노출 불필요(내부)지만 테스트 위해 반환객체에 영향만 검증.

- [ ] **Step 1: 테스트 작성 (실패 예정)** — `forge-core.test.js`에 추가:

```js
test("conviction bias tilts signal and verdict, zero is no-op", () => {
  const data = ForgeCore.makeDemoSeries({ n: 300, seed: 5, period: 48 });
  const base = {
    nodes: [
      { id: "p", kind: "block", blockType: "price" },
      { id: "f", kind: "block", blockType: "phasefold", params: { pmin: 20, pmax: 96 } },
      { id: "c", kind: "block", blockType: "combine" },
      { id: "o", kind: "block", blockType: "predict" }
    ],
    edges: [{ from: "p", to: "f" }, { from: "f", to: "c" }, { from: "c", to: "o" }]
  };
  const r0 = ForgeCore.run(base, data, { futW: 60 });
  // conviction 0/absent → identical signal & verdict.score
  const baseZero = JSON.parse(JSON.stringify(base));
  baseZero.nodes.forEach(n => n.conviction = 0);
  const rz = ForgeCore.run(baseZero, data, { futW: 60 });
  assert.deepStrictEqual(rz.signal, r0.signal);
  assert.strictEqual(rz.verdict.score, r0.verdict.score);
  // positive conviction → signal mean up, score up, still clamped
  const pos = JSON.parse(JSON.stringify(base));
  pos.nodes.find(n => n.id === "c").conviction = 80;
  const rp = ForgeCore.run(pos, data, { futW: 60 });
  const mean = a => a.reduce((s, v) => s + v, 0) / a.length;
  assert.ok(mean(rp.signal) > mean(r0.signal));
  assert.ok(rp.verdict.score >= r0.verdict.score);
  assert.ok(rp.signal.every(v => v >= -100 && v <= 100));
  // prediction unaffected by conviction
  assert.deepStrictEqual(rp.prediction.path, r0.prediction.path);
});
```

- [ ] **Step 2: 실패 확인** — Run: `node --test map/forge-core.test.js` → FAIL (positive conviction이 아직 시그널을 안 바꿈 → mean 비교 실패)

- [ ] **Step 3: 구현** — `forge-core.js`. `run()` 안에서 `signal` 계산 직후, `verdict` 계산 전에 바이어스 적용. helper 추가:

```js
function aggregateConviction(graph){
  let s=0,c=0;
  (graph.nodes||[]).forEach(n=>{const v=n&&n.conviction;
    if(typeof v==="number"&&isFinite(v)&&v!==0){s+=v;c++;}});
  return c?s/c:0;
}
```
`run()` 내 `const dn=detrendNorm(sigSrc), signal=...` 다음에:
```js
const bias=aggregateConviction(graph), K=0.5;
const sigB=bias?signal.map(v=>Math.max(-100,Math.min(100,Math.round(v+bias*K)))):signal;
```
그리고 이후 `signal` 사용처(verdict의 lastSig, 반환)를 `sigB`로 교체:
```js
const lastSig=sigB.slice(-10).reduce((s,v)=>s+v,0)/10;
```
반환 `signal: sigB`. (regime/score는 이미 lastSig 기반이라 자동 반영. prediction은 그대로 price 기반 → 불변.)

- [ ] **Step 4: 통과 확인** — Run: `node --test map/forge-core.test.js` → PASS (전체)

- [ ] **Step 5: 커밋**
```bash
git add map/forge-core.js map/forge-core.test.js
git commit -m "feat(forge): 인터프리터 확신(conviction) 바이어스 — 노드별 확신을 시그널/국면에 반영"
```

---

## Task 2: 파라미터 편집기 패널

**Files:**
- Modify: `map/forge.html`

**Interfaces:**
- Consumes: `boardState`, `bN(id)`(노드 by id; 코드상 `bN`), `sel`(선택 id 배열), `selectOnly`, `fireBoardChange`, `renderBoard`, `BLOCK_DEFS`.
- Produces:
  - 노드 모델 확장: `node.conviction:number`(기본 0), `node.note:string`(기본 "").
  - `boardToGraph()`가 각 노드에 `conviction`을 포함(인터프리터가 읽음). (note는 계산 무관 → 미포함 가능)
  - `renderParams()` — 단일 선택 시 `.forge-params` 패널 갱신, 그 외 숨김. `applySel()` 끝에서 호출.
  - 패널 입력 변경 → 노드 필드 저장 → `fireBoardChange()`(180ms 라이브 재계산).

- [ ] **Step 1: 패널 컨테이너 + 스타일** — board-pane 우상단 플로팅 카드. `boardPane` 마크업(현 `bStage` 형제로) 또는 `.board-pane` 직속에 `<div class="forge-params" id="paramPanel" hidden></div>` 추가. CSS(테마 토큰):
```css
.forge-params{position:absolute;right:12px;top:12px;z-index:6;width:230px;background:var(--panel);
  border:1px solid var(--line);border-radius:10px;padding:12px;font-size:12px;color:var(--ink);box-shadow:0 6px 20px #0008}
.forge-params h4{margin:0 0 8px;font-size:12px;color:var(--gold);font-weight:700}
.forge-params .pp-row{display:flex;align-items:center;gap:8px;margin:6px 0}
.forge-params .pp-row label{flex:0 0 78px;color:var(--eth)}
.forge-params input[type=number],.forge-params textarea{flex:1;background:var(--bg);border:1px solid var(--line);
  border-radius:6px;color:var(--ink);padding:4px 6px;font:inherit}
.forge-params textarea{min-height:48px;resize:vertical}
.forge-params input[type=range]{flex:1}
.forge-params .pp-conv-val{flex:0 0 34px;text-align:right;color:var(--gold)}
```

- [ ] **Step 2: `renderParams()` 구현** — 블록 타입별 수치행 + 확신 슬라이더 + 서술 메모. block별 수치: `ma`→len, `phasefold`→pmin/pmax, `combine`→입력 엣지별 weight(입력노드 라벨 표시), price/predict→없음. 코드:
```js
function renderParams(){
  const panel=document.getElementById("paramPanel"); if(!panel) return;
  if(sel.length!==1){ panel.hidden=true; return; }
  const n=bN(sel[0]); if(!n){ panel.hidden=true; return; }
  panel.hidden=false;
  const rows=[];
  if(n.blockType==="ma") rows.push(numRow("len","이동평균 길이",(n.params&&n.params.len)??10,1));
  if(n.blockType==="phasefold"){ rows.push(numRow("pmin","주기 최소",(n.params&&n.params.pmin)??16,2));
    rows.push(numRow("pmax","주기 최대",(n.params&&n.params.pmax)??128,3)); }
  if(n.blockType==="combine"){
    boardState.edges.filter(e=>e.to===n.id).forEach(e=>{const src=bN(e.from);
      const w=(n.params&&n.params.weights&&n.params.weights[e.from])??1;
      rows.push(`<div class="pp-row"><label>${esc((src&&src.title)||e.from)}</label>
        <input type="number" step="0.1" data-wkey="${e.from}" value="${w}"></div>`); });
  }
  const conv=n.conviction??0;
  panel.innerHTML=`<h4>${esc(n.title||"노드")} · 파라미터</h4>${rows.join("")}
    <div class="pp-row"><label>확신</label>
      <input type="range" id="ppConv" min="-100" max="100" step="1" value="${conv}">
      <span class="pp-conv-val" id="ppConvVal">${conv}</span></div>
    <div class="pp-row" style="flex-direction:column;align-items:stretch">
      <label style="flex:none;margin-bottom:4px">서술 메모</label>
      <textarea id="ppNote" placeholder="분석 근거·기준 (계산엔 미반영)">${esc(n.note||"")}</textarea></div>`;
}
function numRow(key,label,val,_i){
  return `<div class="pp-row"><label>${esc(label)}</label>
    <input type="number" step="1" data-pkey="${key}" value="${val}"></div>`;
}
```

- [ ] **Step 3: 입력 이벤트 위임** — 패널 input/change → 저장 + 재계산. 부팅 와이어링 영역에 추가:
```js
(function bindParams(){
  const panel=document.getElementById("paramPanel"); if(!panel) return;
  panel.addEventListener("input",ev=>{
    if(sel.length!==1) return; const n=bN(sel[0]); if(!n) return;
    const t=ev.target;
    if(t.dataset.pkey){ n.params=n.params||{}; n.params[t.dataset.pkey]=Math.round(Number(t.value)||0); }
    else if(t.dataset.wkey){ n.params=n.params||{}; n.params.weights=n.params.weights||{};
      n.params.weights[t.dataset.wkey]=Number(t.value)||0; }
    else if(t.id==="ppConv"){ n.conviction=Number(t.value)||0;
      const v=document.getElementById("ppConvVal"); if(v) v.textContent=n.conviction; }
    else if(t.id==="ppNote"){ n.note=t.value; }
    fireBoardChange();
  });
})();
```

- [ ] **Step 4: `boardToGraph`에 conviction 포함 + `applySel`에서 `renderParams` 호출** — `boardToGraph()` 노드 매핑에 `conviction: n.conviction||0` 추가. `applySel()` 함수 끝에 `renderParams();` 추가(선택 변경 시 패널 갱신).

- [ ] **Step 5: 헤드리스 검증 + 커밋** — 컨트롤러가 노드 선택→패널 표시, ma의 len 변경 시 차트 갱신 확인. 구조: 패널 input들 존재, conviction 슬라이더 동작.
```bash
git add map/forge.html
git commit -m "feat(forge): 노드 파라미터 편집기 — 수치 파라미터 + 확신 슬라이더 + 서술 메모, 라이브 재계산"
```

---

## Task 3: 이미지 코어 + 노드 썸네일 렌더

**Files:**
- Modify: `map/forge.html`
- Reference (읽기): `map/map.html` (`downscaleImage`/`imgSrc`/`putImg` 패턴)

**Interfaces:**
- Produces (forge.html 전역):
  - `IMAGES = {}` (id→dataURL), `LIBRARY = []` ({id,label}).
  - `imgSrc(id)` → dataURL|"". `putImg(id, src)` → `IMAGES[id]=src` (서버 없음, 메모리만).
  - `downscaleImage(src, cb)` — map.html 포팅(최대 1000px·JPEG·<120KB). `toast`→`bToast`로 치환.
  - `setThumb(id, t)` — 노드 `thumb` 설정 후 `renderBoard()`+`fireBoardChange()`.
  - `nodeHTML(n)`이 `n.thumb` 있으면 썸네일 표시.

- [ ] **Step 1: 이미지 코어 추가** — forge.html 전역 스코프에:
```js
const IMAGES = {};
const LIBRARY = [];
function imgSrc(id){ return IMAGES[id] || ""; }
function putImg(id, src){ IMAGES[id] = src; }
function downscaleImage(src, cb){
  const img = new Image();
  img.onload = () => { let w=img.width,h=img.height; const md=1000, sc=Math.min(1,md/Math.max(w,h));
    w=Math.max(1,Math.round(w*sc)); h=Math.max(1,Math.round(h*sc));
    const c=document.createElement("canvas"); c.width=w; c.height=h;
    c.getContext("2d").drawImage(img,0,0,w,h);
    let q=0.82,out=c.toDataURL("image/jpeg",q);
    while(out.length>120000&&q>0.4){ q-=0.1; out=c.toDataURL("image/jpeg",q); } cb(out); };
  img.onerror = () => { if(src.length<120000) cb(src); else bToast("이미지를 불러올 수 없어요"); };
  img.src = src;
}
function setThumb(id, t){ const n=bN(id); if(n){ n.thumb=t; renderBoard(); fireBoardChange(); } }
```

- [ ] **Step 2: `nodeHTML`에 썸네일 영역 + CSS** — `nodeHTML`의 `b-n-body` 위(또는 title 위)에 썸네일:
```js
const thumb = n.thumb
  ? `<div class="b-n-thumb"><img src="${imgSrc(n.thumb.imgId)}" alt=""></div>` : "";
```
그리고 반환 템플릿에 `${thumb}` 삽입(`b-n-body` 시작 직전). CSS:
```css
.b-n-thumb{margin:-2px -2px 6px;border-radius:8px 8px 0 0;overflow:hidden;background:var(--bg);max-height:84px}
.b-n-thumb img{display:block;width:100%;height:auto;max-height:84px;object-fit:cover}
```

- [ ] **Step 3: 헤드리스 검증 + 커밋** — 컨트롤러가 콘솔에서 임시 `putImg("t1",<작은 dataURL>); setThumb(<노드id>,{imgId:"t1",label:"x"})` 실행 시 노드에 썸네일 렌더 확인.
```bash
git add map/forge.html
git commit -m "feat(forge): 이미지 코어(IMAGES/LIBRARY/downscaleImage) + 노드 썸네일 렌더"
```

---

## Task 4: 썸네일 라이브러리 패널

**Files:**
- Modify: `map/forge.html`

**Interfaces:**
- Consumes: `IMAGES`, `LIBRARY`, `putImg`, `imgSrc`, `downscaleImage`, `setThumb`, `uid`, `nodeAt`(좌표→노드; 코드상 존재), `worldPt`.
- Produces:
  - 좌측 접이식 패널 `.forge-lib` + 토글 버튼. `renderLib()` 렌더.
  - `＋ 이미지 추가`(file input) → downscale → `putImg`+`LIBRARY` push → `renderLib`.
  - 라이브러리 썸네일 **드래그 → 노드 드롭** = `setThumb`. OS 이미지 파일을 노드에 드롭도 지원.

- [ ] **Step 1: 패널 마크업/스타일 + file input** — `.board-pane`에 패널 + 숨김 `<input type="file" id="libFile" accept="image/*" hidden>`. CSS(접이 `.forge-lib.collapsed`로 폭 축소). 패널은 좌하단 또는 좌측 세로.
```css
.forge-lib{position:absolute;left:12px;bottom:12px;z-index:6;width:150px;max-height:42%;overflow:auto;
  background:var(--panel);border:1px solid var(--line);border-radius:10px;padding:8px}
.forge-lib h4{margin:0 0 6px;font-size:11px;color:var(--eth)}
.forge-lib .lib-add{font-size:11px;color:var(--gold);cursor:pointer;padding:4px;border:1px dashed var(--line);
  border-radius:6px;text-align:center;margin-bottom:6px}
.forge-lib .lib-grid{display:grid;grid-template-columns:1fr 1fr;gap:6px}
.forge-lib .lib-it img{width:100%;height:46px;object-fit:cover;border-radius:6px;cursor:grab;border:1px solid var(--line)}
.forge-lib.collapsed .lib-grid,.forge-lib.collapsed .lib-add,.forge-lib.collapsed h4 span{display:none}
```

- [ ] **Step 2: `renderLib` + file 추가** —
```js
function renderLib(){
  const el=document.getElementById("libPanel"); if(!el) return;
  el.querySelector(".lib-grid").innerHTML = LIBRARY.map(it=>
    `<div class="lib-it" draggable="true" data-img="${it.id}"><img src="${imgSrc(it.id)}" alt="${esc(it.label||"")}"></div>`
  ).join("") || `<div style="font-size:11px;color:var(--eth)">이미지를 추가하거나 Ctrl+V로 붙여넣기</div>`;
}
document.getElementById("libFile").addEventListener("change",e=>{
  const f=e.target.files[0]; if(!f) return;
  const r=new FileReader();
  r.onload=()=>downscaleImage(r.result,out=>{ const id=uid("img"); putImg(id,out);
    LIBRARY.push({id,label:f.name.replace(/\.[^.]+$/,"")}); renderLib(); bToast("썸네일 추가됨"); });
  r.readAsDataURL(f); e.target.value="";
});
```

- [ ] **Step 3: 드래그 적용 + OS 파일 드롭** — 라이브러리 썸네일 dragstart에 `data-img` id를 dataTransfer로. 보드 stage drop 핸들러에서: (a) `text/forge-img` id가 있으면 드롭 좌표의 `nodeAt`로 노드 찾아 `setThumb(node.id,{imgId:id,label})`; (b) OS 이미지 파일이면 downscale→putImg→LIBRARY→해당 노드 setThumb. dragover preventDefault 필수.

- [ ] **Step 4: 토글 + 부팅 렌더 + 헤드리스 검증 + 커밋** — 패널 헤더 클릭으로 `.collapsed` 토글. 부팅에서 `renderLib()`. 컨트롤러가 파일 추가→라이브러리 표시→드래그 적용 확인(또는 구조 확인).
```bash
git add map/forge.html
git commit -m "feat(forge): 썸네일 라이브러리 패널 — 추가/표시/노드 드래그 적용(빌트인 없음)"
```

---

## Task 5: 주제 배너

**Files:**
- Modify: `map/forge.html`

**Interfaces:**
- Consumes: `imgSrc`, `IMAGES`, `fireBoardChange`.
- Produces:
  - `themeState = { imgId:null, title:"" }` (전역).
  - 보드 페인 상단 고정 배너 `.forge-theme` (이미지 + contenteditable 제목). `renderTheme()`.
  - `setThemeImg(imgId)` — 주제 이미지 설정 후 `renderTheme()`.

- [ ] **Step 1: 배너 마크업/스타일 + stage 보정** — `boardPane` 내부 최상단에 배너, 그 아래 기존 `b-stage`. `boardPane` 마크업(현 innerHTML 설정부) 수정: 배너 div를 b-stage 앞에 추가하고, b-stage가 배너 높이만큼 아래에서 시작하도록(예: boardPane을 flex column, 배너 고정높이 96px, stage flex:1). CSS:
```css
.board-pane{display:flex;flex-direction:column}
.forge-theme{flex:0 0 96px;display:flex;gap:12px;align-items:center;padding:8px 12px;border-bottom:1px solid var(--line);background:var(--panel)}
.forge-theme .th-img{flex:0 0 200px;height:80px;border-radius:8px;overflow:hidden;background:var(--bg);border:1px solid var(--line);
  display:flex;align-items:center;justify-content:center;color:var(--eth);font-size:11px;text-align:center}
.forge-theme .th-img img{width:100%;height:100%;object-fit:contain}
.forge-theme .th-title{flex:1;font-size:18px;font-weight:700;color:var(--ink);outline:none}
.b-stage{flex:1;min-height:0}
```
(주의: `.board-pane{position:relative}` 유지 — 팔레트/패널 절대배치 기준. flex column과 공존 가능.)

- [ ] **Step 2: `renderTheme` + 제목 편집 + setThemeImg** —
```js
let themeState = { imgId: null, title: "" };
function renderTheme(){
  const el=document.getElementById("themeBar"); if(!el) return;
  const img = themeState.imgId
    ? `<img src="${imgSrc(themeState.imgId)}" alt="">`
    : "주제 이미지<br>붙여넣기(Ctrl+V)";
  el.querySelector(".th-img").innerHTML = img;
  const t=el.querySelector(".th-title");
  if(document.activeElement!==t) t.textContent = themeState.title || "";
}
function setThemeImg(imgId){ themeState.imgId=imgId; renderTheme(); fireBoardChange(); }
```
제목 `.th-title` focusout → `themeState.title=el.textContent.trim(); fireBoardChange();`. placeholder는 빈 제목 시 CSS `:empty::before{content:"주제 제목…";color:var(--eth)}`.

- [ ] **Step 3: 부팅 렌더 + 헤드리스 검증 + 커밋** — 부팅에서 `renderTheme()`. 컨트롤러: 배너가 보드 상단에 표시(빈 상태 안내), 제목 편집 가능, `setThemeImg` 시 이미지 표시. stage/노드가 배너 아래로 밀렸는지 확인.
```bash
git add map/forge.html
git commit -m "feat(forge): 주제 배너 — 상단 고정 이미지+제목(편집)"
```

---

## Task 6: Ctrl+V 이미지 붙여넣기 라우팅

**Files:**
- Modify: `map/forge.html`

**Interfaces:**
- Consumes: `downscaleImage`, `putImg`, `LIBRARY`, `uid`, `setThumb`, `setThemeImg`, `renderLib`, `sel`, `bN`.
- Produces: document `paste` 리스너 — 클립보드에 이미지가 있을 때만 가로채서 라우팅(텍스트 붙여넣기는 방해 안 함).

- [ ] **Step 1: paste 리스너** — 부팅 와이어링에 추가:
```js
document.addEventListener("paste", ev => {
  const items = ev.clipboardData && ev.clipboardData.items;
  if(!items) return;
  let imgItem=null;
  for(const it of items){ if(it.type && it.type.indexOf("image")===0){ imgItem=it; break; } }
  if(!imgItem) return;                 // 이미지 없으면 일반(텍스트) 붙여넣기 그대로 둠
  ev.preventDefault();
  const file=imgItem.getAsFile(); if(!file) return;
  const r=new FileReader();
  r.onload=()=>downscaleImage(r.result, out=>{
    const id=uid("img"); putImg(id,out); LIBRARY.push({id,label:"붙여넣기"}); renderLib();
    if(sel.length===1 && bN(sel[0])){ setThumb(sel[0], {imgId:id, label:"붙여넣기"}); bToast("노드 이미지 적용"); }
    else { setThemeImg(id); bToast("주제 이미지 적용"); }
  });
  r.readAsDataURL(file);
});
```
(주의: contenteditable 포커스 중이라도 클립보드가 **이미지**면 가로채는 게 의도. 텍스트 클립보드면 `imgItem`이 없어 그대로 통과 → 제목/메모 텍스트 붙여넣기 정상.)

- [ ] **Step 2: 헤드리스/수동 검증 + 커밋** — 헤드리스로 클립보드 paste 시뮬레이션이 어려우므로 컨트롤러가 코드 경로 확인 + 사용자가 실제 Ctrl+V로 확인. 구조: paste 리스너 등록, 이미지/비이미지 분기.
```bash
git add map/forge.html
git commit -m "feat(forge): Ctrl+V 이미지 붙여넣기 — 노드 선택시 썸네일/무선택시 주제 배너"
```

---

## Task 7: 내보내기 확장 + 통합 검증

**Files:**
- Modify: `map/forge.html`

**Interfaces:**
- Consumes: `exportStrategy`(기존), `boardState`, `themeState`, `IMAGES`, `LIBRARY`.
- Produces: `exportStrategy()`가 conviction/note/thumb·themeState·LIBRARY·사용 중 IMAGES를 포함.

- [ ] **Step 1: export 페이로드 확장** — `exportStrategy()` 페이로드에 추가: 각 노드의 `conviction`(0 아닐 때)·`note`(빈값 아닐 때)·`thumb`(있을 때) 포함; 최상위에 `theme: themeState`, `library: LIBRARY`, `images: <사용 중 imgId만 추린 IMAGES 부분맵>`(노드 thumb + theme.imgId가 참조하는 id만). 코드:
```js
const usedIds = new Set();
boardState.nodes.forEach(n=>{ if(n.thumb&&n.thumb.imgId) usedIds.add(n.thumb.imgId); });
if(themeState.imgId) usedIds.add(themeState.imgId);
const images={}; usedIds.forEach(id=>{ if(IMAGES[id]) images[id]=IMAGES[id]; });
```
노드 매핑에 `conviction`/`note`/`thumb` 조건부 포함. payload에 `theme`, `library: LIBRARY.filter(it=>usedIds.has(it.id))`, `images` 추가.

- [ ] **Step 2: 통합 검증 + 전체 node 스위트 + 커밋** — 컨트롤러: `node --test map/forge-core.test.js` 전부 통과. 헤드리스 종합 — 배너+라이브러리+파라미터 패널(노드 선택)+노드 썸네일이 한 화면에 렌더, 콘솔 에러 0, 내보내기 클릭 시 theme/images/library 포함된 JSON 생성.
```bash
git add map/forge.html
git commit -m "feat(forge): 내보내기 확장(확신/메모/썸네일/주제/라이브러리/이미지) + 통합 검증"
```

---

## Self-Review (작성자 점검)

**Spec coverage:**
- A 파라미터 편집기(수치+확신+서술) → Task 2. ✅
- B 인터프리터 확신 바이어스 → Task 1(node TDD). ✅
- C 주제 배너 → Task 5. ✅
- D 썸네일 라이브러리+노드 이미지+Ctrl+V → Task 3(코어/렌더)·4(패널)·6(붙여넣기). ✅
- 영속(JSON 내보내기 포함) → Task 7. ✅
- 빌트인 샘플 없음 → Task 3/4에 명시. ✅ noindex/테마/네임스페이스 → Global Constraints. ✅

**Placeholder scan:** 모든 코드 스텝에 실제 코드 포함. 헤드리스 시각검증은 컨트롤러 책임으로 명시(브라우저 클립보드/드롭은 자동화 한계 — 사용자 확인 병행). 포팅 함수(downscaleImage)는 실제 코드 전재.

**Type consistency:** 노드 필드 `conviction:number`/`note:string`/`thumb:{imgId,label}` 전 태스크 일관. `IMAGES`/`LIBRARY`/`themeState{imgId,title}`/`imgSrc`/`putImg`/`setThumb`/`setThemeImg`/`renderLib`/`renderTheme`/`renderParams` 명칭 일관. `boardToGraph`가 conviction 포함(Task 2) → run()이 읽음(Task 1) 정합. `bN`(노드 by id)·`sel`·`nodeAt`·`bToast`·`esc`는 기존 forge.html 전역 사용.
