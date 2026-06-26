# 스쿱포지 Phase 5-A (R5a: "포지 분석" 재생) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** ▷ "포지 분석" 버튼으로 노드를 DAG 순서로 누적하며 분석이 펼쳐지는 재생(노드 하이라이트 + 미래 존 예측 모핑·수렴 + 누적 가중 백트래킹)을 구현한다.

**Architecture:** `forge-core.js`에 `runSteps`(부분 그래프 누적 → 단계별 run 결과 배열, node 테스트). `forge.html`에 ▷ 포지 분석 버튼 + `playAnalysis()`(타임드 애니메이션: `.analyzing` 노드 강조 + `fcDrawFuture`로 예측 보간 모핑 + 진행 표시 + 수렴 정착). 현재 인터프리터 분석 위에서 연출(비전은 R5b).

**Tech Stack:** 바닐라 JS. `node --test`로 runSteps 검증. 재생은 헤드리스 가상시간.

## Global Constraints

- 수정 대상: `map/forge.html`, `map/forge-core.js`, `map/forge-core.test.js`만. 기존 `map/map.html`·`map/chart.html`·`map/api.php`·`map/forge-api.php`·`*_*.json` 불가침.
- 바닐라 JS, 2 spaces, 큰따옴표, 케밥케이스. 다크 골드 토큰. 한국어 UI. noindex. FORGE_API 상대.
- `forge-core.js` DOM-free. 기존 node 테스트 18개 유지.
- 백트래킹 = 누적 가중 시각화(별도 재실행 루프 없음). reduced-motion 시 애니메이션 생략·즉시 최종.

---

## Task 1: 코어 — `runSteps`

**Files:**
- Modify: `map/forge-core.js`
- Modify: `map/forge-core.test.js`

**Interfaces:**
- Consumes: `buildDAG`, `run`.
- Produces: `ForgeCore.runSteps(graph, data, opts)` → `[{ nodeId, signal, prediction, verdict }]` (블록 DAG 순서 1..k + 모든 자유 노드 부분 그래프로 run). 마지막 단계 === 전체 run.

- [ ] **Step 1: 테스트 작성 (실패 예정)** — `forge-core.test.js`에 추가:
```js
test("runSteps: one step per block, last === full run()", () => {
  const data = ForgeCore.makeDemoSeries({ n: 300, seed: 4, period: 48 });
  const g = { nodes: [
    { id: "p", kind: "block", blockType: "price" },
    { id: "f", kind: "block", blockType: "phasefold", params: { pmin: 20, pmax: 96 } },
    { id: "c", kind: "block", blockType: "combine" },
    { id: "o", kind: "block", blockType: "predict" },
    { id: "m", kind: "free" }
  ], edges: [{ from: "p", to: "f" }, { from: "f", to: "c" }, { from: "c", to: "o" }] };
  const steps = ForgeCore.runSteps(g, data, { futW: 60 });
  assert.strictEqual(steps.length, 4);                 // 4 blocks
  steps.forEach(s => {
    assert.strictEqual(s.prediction.path.length, 60);
    assert.strictEqual(s.signal.length, data.n);
  });
  const full = ForgeCore.run(g, data, { futW: 60 });
  assert.deepStrictEqual(steps[steps.length - 1].prediction.path, full.prediction.path);
  assert.deepStrictEqual(steps[steps.length - 1].signal, full.signal);
});
test("runSteps: no blocks -> single graceful step", () => {
  const steps = ForgeCore.runSteps({ nodes: [{ id: "m", kind: "free" }], edges: [] }, { price: [1, 2, 3], n: 3 }, { futW: 10 });
  assert.strictEqual(steps.length, 1);
  assert.strictEqual(steps[0].prediction.path.length, 10);
});
```

- [ ] **Step 2: 실패 확인** — Run: `node --test map/forge-core.test.js` → FAIL (`runSteps is not a function`)

- [ ] **Step 3: 구현** — `forge-core.js`에 추가하고 factory 반환에 `runSteps` 노출:
```js
function runSteps(graph, data, opts) {
  const { order } = buildDAG(graph);
  const allNodes = graph.nodes || [], allEdges = graph.edges || [];
  if (!order.length) {
    const r = run(graph, data, opts);
    return [{ nodeId: null, signal: r.signal, prediction: r.prediction, verdict: r.verdict }];
  }
  const steps = [];
  for (let k = 1; k <= order.length; k++) {
    const ids = new Set(order.slice(0, k));
    const nodes = allNodes.filter(n => (n.kind === "block" && ids.has(n.id)) || n.kind !== "block");
    const nidset = new Set(nodes.map(n => n.id));
    const edges = allEdges.filter(e => nidset.has(e.from) && nidset.has(e.to));
    const r = run({ nodes, edges }, data, opts);
    steps.push({ nodeId: order[k - 1], signal: r.signal, prediction: r.prediction, verdict: r.verdict });
  }
  return steps;
}
```
반환부에 `runSteps` 추가.

- [ ] **Step 4: 통과 확인** — Run: `node --test map/forge-core.test.js` → PASS (기존 18 + 신규 2 = 20)

- [ ] **Step 5: 커밋**
```bash
git add map/forge-core.js map/forge-core.test.js
git commit -m "feat(forge): runSteps — 노드 누적 부분분석 시퀀스(재생용)"
```

---

## Task 2: 클라이언트 재생 — ▷ 포지 분석

**Files:**
- Modify: `map/forge.html`

**Interfaces:**
- Consumes: `ForgeCore.runSteps`, `runForge`, `boardToGraph`, `boardState`, `data`, `lastResult`, `fcDrawFuture(pred)`, `renderChart`, `renderVerdict`, `renderOverlay`, `bq(id)`, `bToast`, `prefersReducedMotion()`, `onBoardChange`.
- Produces: 헤더 `▷ 포지 분석` 버튼 + `analyzeProg` 진행 표시; `playAnalysis()`/`stopPlay()`/`lerpPred()`; `.b-node.analyzing` CSS.

- [ ] **Step 1: 버튼 + 진행 표시 + CSS** — 헤더(`.forge-top`, `▷ 실행`(`#runBtn`) 앞)에:
```html
    <span id="analyzeProg" class="analyze-prog"></span>
    <button class="run-btn analyze-btn" id="analyzeBtn" onclick="playAnalysis()">▷ 포지 분석</button>
```
CSS:
```css
.analyze-prog{font-size:11px;color:var(--eth);margin-left:auto}
.analyze-btn{background:transparent;color:var(--gold);border:1px solid var(--gold)}
.analyze-btn:hover{background:rgba(232,180,99,.12)}
.b-node.analyzing{box-shadow:0 0 0 2px var(--gold), 0 0 20px rgba(232,180,99,.6); border-radius:12px}
```
(헤더에서 `margin-left:auto`가 이미 다른 요소에 있으면 정렬 충돌 없게 배치 — `analyze-prog`에 margin-left:auto를 두면 좌측 그룹과 우측 버튼군 사이를 밀어줌. 기존 버튼군 정렬 확인 후 자연스럽게.)

- [ ] **Step 2: `playAnalysis`/`stopPlay`/`lerpPred`** — forge.html에:
```js
let _playT = null, _playRaf = null, _playing = false, _analyzeNode = null;
function stopPlay() {
  if (_playT) clearTimeout(_playT);
  if (_playRaf) cancelAnimationFrame(_playRaf);
  _playT = null; _playRaf = null; _playing = false;
  if (_analyzeNode) { const el = bq(_analyzeNode); if (el) el.classList.remove("analyzing"); _analyzeNode = null; }
  const pr = document.getElementById("analyzeProg"); if (pr) pr.textContent = "";
}
function lerpPred(a, b, u) {
  const n = Math.min((a.path || []).length, (b.path || []).length);
  const path = [], lo = [], hi = [];
  for (let k = 0; k < n; k++) {
    path.push(a.path[k] + (b.path[k] - a.path[k]) * u);
    lo.push(a.lo[k] + (b.lo[k] - a.lo[k]) * u);
    hi.push(a.hi[k] + (b.hi[k] - a.hi[k]) * u);
  }
  return { path, lo, hi, anchor: (b.anchor != null ? b.anchor : a.anchor) };
}
function playAnalysis() {
  if (_playing) { stopPlay(); return; }      // 토글: 재생 중 누르면 중단
  runForge();
  let steps;
  try { steps = ForgeCore.runSteps(boardToGraph(), data, { futW: 120 }); }
  catch (e) { console.warn("steps", e); return; }
  if (!steps.length) return;
  if (prefersReducedMotion()) { renderChart(lastResult, data); bToast("포지 분석 완료"); return; }
  _playing = true;
  const N = steps.length, progEl = document.getElementById("analyzeProg");
  let i = 0, prevPred = steps[0].prediction;
  function highlight(id) {
    if (_analyzeNode) { const e = bq(_analyzeNode); if (e) e.classList.remove("analyzing"); }
    _analyzeNode = id; const el = id && bq(id); if (el) el.classList.add("analyzing");
  }
  function step() {
    if (!_playing) return;
    if (i >= N) {
      renderChart(lastResult, data);
      if (window.renderOverlay) renderOverlay(lastResult, boardToGraph());
      stopPlay(); bToast("포지 분석 완료"); return;
    }
    const s = steps[i];
    const node = boardState.nodes.find(n => n.id === s.nodeId);
    if (progEl) progEl.textContent = "분석 중: " + ((node && node.title) || "노드") + " (" + (i + 1) + "/" + N + ")";
    highlight(s.nodeId);
    if (s.verdict) renderVerdict(s.verdict);
    const from = prevPred, to = s.prediction, t0 = performance.now(), dur = 350;
    function morph(now) {
      if (!_playing) return;
      const u = Math.min(1, (now - t0) / dur);
      fcDrawFuture(lerpPred(from, to, u));
      if (u < 1) { _playRaf = requestAnimationFrame(morph); }
      else { prevPred = to; i++; _playT = setTimeout(step, 180); }
    }
    _playRaf = requestAnimationFrame(morph);
  }
  step();
}
```

- [ ] **Step 3: 편집/실행 중단 가드** — 재생 중 보드 편집이나 ▷ 실행이 들어오면 안전 종료: `onBoardChange` 콜백 시작부에 `if (_playing) stopPlay();` 추가(편집 시 재생 중단). `runForge` 시작부에도 `if (_playing) stopPlay();`(단, playAnalysis가 부르는 runForge는 _playing 설정 전이라 영향 없음 — playAnalysis는 runForge 호출 후 _playing=true 설정 순서 유지). 재생 중 노드 `.analyzing`이 renderBoard로 사라지면 다음 step에서 재부여(highlight가 매 step 호출).

- [ ] **Step 4: 헤드리스 검증 + 커밋** — 컨트롤러: ▷ 포지 분석 클릭(또는 playAnalysis() 호출) → 가상시간 진행하며 노드 `.analyzing` 강조 이동 + 미래 존 예측 모핑 + "분석 중: …" 진행 표시, 완료 후 최종 렌더 + 토스트. reduced-motion 시 즉시 최종. 콘솔 에러 0. `node --test map/forge-core.test.js` 20/20.
```bash
git add map/forge.html
git commit -m "feat(forge): ▷ 포지 분석 재생 — 노드 누적 단계 애니메이션(하이라이트 + 예측 모핑 수렴)"
```

---

## Self-Review (작성자 점검)

**Spec coverage:**
- §2 runSteps(부분 그래프 누적, 마지막=전체) → Task 1(node TDD). ✅
- §3 ▷ 포지 분석 버튼 + 단계 애니메이션(노드 .analyzing 강조 + 미래 존 모핑 + 진행 + 수렴 정착 + reduced-motion + 중단 가드) → Task 2. ✅
- §3 백트래킹=누적 가중 시각화 → runSteps가 매 단계 weighted run → 예측 모핑에 자연 반영. ✅
- §5 검증(node 20, 헤드리스 가상시간) → 각 Task 검증. ✅
- §7 리스크(1회 계산 후 애니메이션·predict 미포함 fallback·보간 길이 동일·재생 중 클래스 재부여·가드) → Task1(steps 1회)·Task2 Step2/3. ✅

**Placeholder scan:** runSteps/playAnalysis/lerpPred/stopPlay 전부 실제 코드. 재생 검증은 컨트롤러 헤드리스. 플레이스홀더 없음.

**Type consistency:** `runSteps`→`[{nodeId,signal,prediction,verdict}]` (Task1) ↔ playAnalysis 소비(s.prediction/s.verdict/s.nodeId) 일치. `lerpPred(a,b,u)`·`fcDrawFuture(pred)`(R2, {path,lo,hi,anchor})·`renderVerdict(verdict)`·`bq`·`prefersReducedMotion`·`renderChart(lastResult,data)`·`renderOverlay` 명칭 forge 기존과 일치. `_playing`/`_playT`/`_playRaf`/`_analyzeNode`/`.analyzing` 일관.
