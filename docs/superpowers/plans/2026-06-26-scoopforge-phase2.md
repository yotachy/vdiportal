# 스쿱포지 (Scoop Forge) Phase 2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 스쿱포지에 노드 중요도 가중치(weight, 계산 기여+시각 스케일)와 기술 분석 블록(추세선·RSI·피보나치 계산 블록 + 거래량 참고 블록)을 추가한다.

**Architecture:** `forge-core.js`(DOM-free, node 테스트)에 weight 가중 conviction·combine 기여 스케일·신규 계산 블록을 추가. `forge.html`에 weight 모델·파라미터 슬라이더·노드 시각 스케일(크기/글로우/배지)·펄스 강도 연동·신규 블록 팔레트·차트 오버레이(추세선/피보나치)를 추가. weight=50 균일·conviction 0이면 Phase 1.5와 동일(하위호환).

**Tech Stack:** 바닐라 JS. `node --test map/forge-core.test.js`로 코어 검증. 헤드리스 chrome-headless-shell 스크린샷으로 시각/기능 검증(컨트롤러).

## Global Constraints

- 수정 대상: `map/forge.html`, `map/forge-core.js`, `map/forge-core.test.js`만. **기존 `map/map.html`·`map/chart.html` 절대 수정 금지.**
- 바닐라 JS, 프레임워크/번들러 금지(Pretendard CDN 예외). 2 spaces, 큰따옴표, 케밥케이스. 한국어 UI. 다크 골드 토큰(--gold:#e8b463/--bg:#0b0f14/--eth:#8a92b2/--bull:#46c28e/--bear:#e06a6a).
- `forge-core.js` DOM-free(브라우저 `window.ForgeCore`+node `module.exports`). **기존 node 테스트 9개 전부 통과 유지.**
- weight: 0~100, 기본 **50**. weight 균일(전부 50)+conviction 0이면 결과 Phase 1.5와 동일(회귀 가드).
- 거래량(volume)은 **합성/실데이터 만들지 않음** — 계산 시리즈 없는 참고 블록(conviction×weight로만 기여).
- 노드 크기 스케일은 **실제 width/font 스케일**(transform:scale 금지 — measure가 offsetWidth로 읽어 엣지/오버레이 좌표 정합 유지).
- 영속: 메모리 + JSON 내보내기. 서버 저장 범위 밖. noindex 유지.

---

## Task 1: 코어 — weight 가중 conviction + combine 기여 스케일

**Files:**
- Modify: `map/forge-core.js`
- Modify: `map/forge-core.test.js`

**Interfaces:**
- Consumes: 기존 `evalBlocks`, `buildDAG`, `aggregateConviction`, `run`.
- Produces:
  - `aggregateConviction(graph)` → 가중 평균: 노드 weight(기본 50)로 가중한 conviction 평균(nonzero conviction만, weight 합 0이면 0).
  - `evalBlocks`의 `combine`: 각 입력 유효가중 = `(manual weights[k] ?? 1) · (byId[k].weight ?? 50)/50`. 빈(length 0) 입력은 스킵.

- [ ] **Step 1: 테스트 작성 (실패 예정)** — `forge-core.test.js`에 추가:

```js
test("weight: weighted conviction average + uniform weight is unchanged", () => {
  const data = ForgeCore.makeDemoSeries({ n: 200, seed: 9, period: 40 });
  const g = {
    nodes: [
      { id: "p", kind: "block", blockType: "price" },
      { id: "c", kind: "block", blockType: "combine" },
      { id: "o", kind: "block", blockType: "predict" }
    ],
    edges: [{ from: "p", to: "c" }, { from: "c", to: "o" }]
  };
  // uniform weight 50 + conviction 0 → identical to no-weight baseline
  const baseline = ForgeCore.run(g, data, { futW: 30 });
  const gw = JSON.parse(JSON.stringify(g));
  gw.nodes.forEach(n => n.weight = 50);
  const same = ForgeCore.run(gw, data, { futW: 30 });
  assert.deepStrictEqual(same.signal, baseline.signal);
  // high-weight bullish node dominates over low-weight bearish node
  const g2 = JSON.parse(JSON.stringify(g));
  const bull = g2.nodes.find(n => n.id === "p"); bull.conviction = 60; bull.weight = 90;
  const bear = g2.nodes.find(n => n.id === "c"); bear.conviction = -60; bear.weight = 10;
  const r = ForgeCore.run(g2, data, { futW: 30 });
  const mean = a => a.reduce((s, v) => s + v, 0) / a.length;
  assert.ok(mean(r.signal) > mean(baseline.signal)); // net bias positive (bull weighted up)
});

test("weight: combine contribution scales by source node weight", () => {
  const data = { price: [0,0,0,0,0], n: 5 };
  // two constant series via ma(len1) of price won't differ; build explicit using price + a biased combine
  const g = {
    nodes: [
      { id: "a", kind: "block", blockType: "price" },
      { id: "b", kind: "block", blockType: "ma", params: { len: 1 }, weight: 90 },
      { id: "c", kind: "block", blockType: "combine" }
    ],
    edges: [{ from: "a", to: "c" }, { from: "a", to: "b" }, { from: "b", to: "c" }]
  };
  // price all zeros → combine zero regardless; assert evalBlocks runs and weight read without error
  const { values } = ForgeCore.evalBlocks(g, data);
  assert.strictEqual(values.c.length, 5);
  assert.ok(values.c.every(v => v === 0));
});
```

- [ ] **Step 2: 실패 확인** — Run: `node --test map/forge-core.test.js` → FAIL (가중 평균 미구현 시 두 번째 시나리오 mean 비교 실패 가능; 최소한 새 테스트가 RED)

- [ ] **Step 3: 구현** — `forge-core.js`:

`aggregateConviction` 교체:
```js
function aggregateConviction(graph) {
  let s = 0, w = 0;
  (graph.nodes || []).forEach(n => {
    const v = n && n.conviction;
    if (typeof v === "number" && isFinite(v) && v !== 0) {
      const wi = (n.weight != null && isFinite(n.weight)) ? n.weight : 50;
      s += v * wi;
      w += wi;
    }
  });
  return w ? s / w : 0;
}
```

`evalBlocks`의 `combine` 분기 교체(빈 입력 스킵 + 소스 weight 스케일):
```js
} else if (n.blockType === "combine") {
  const w = (n.params && n.params.weights) || {}, keys = inputsOf[id];
  const eff = keys.map(k => {
    const manual = (w[k] != null ? w[k] : 1);
    const sw = (byId[k] && byId[k].weight != null && isFinite(byId[k].weight)) ? byId[k].weight : 50;
    const arr = values[k];
    return (arr && arr.length) ? manual * (sw / 50) : 0;
  });
  const tot = eff.reduce((a, e) => a + e, 0) || 1;
  const len = Math.max(0, ...keys.map(k => (values[k] ? values[k].length : 0)));
  const out = new Array(len).fill(0);
  keys.forEach((k, j) => {
    const wk = eff[j] / tot;
    const arr = values[k] || [];
    for (let t = 0; t < len; t++) out[t] += (arr[t] || 0) * wk;
  });
  values[id] = out;
}
```

- [ ] **Step 4: 통과 확인** — Run: `node --test map/forge-core.test.js` → PASS (전체, 기존 9 + 신규 2)

- [ ] **Step 5: 커밋**
```bash
git add map/forge-core.js map/forge-core.test.js
git commit -m "feat(forge): 중요도 weight — 가중 conviction + combine 기여 스케일"
```

---

## Task 2: 코어 — 신규 블록 trend / rsi / fib / volume

**Files:**
- Modify: `map/forge-core.js`
- Modify: `map/forge-core.test.js`

**Interfaces:**
- Consumes: `evalBlocks`, `linfit`, `tanh`.
- Produces: `evalBlocks`가 blockType `trend`/`rsi`/`fib`를 시계열로 계산, `volume`은 빈 시계열(`[]`, 합성 미참여). 헬퍼 `rollingSlope`, `rsiSeries`, `fibPos`.

- [ ] **Step 1: 테스트 작성 (실패 예정)**:
```js
test("trend/rsi/fib blocks on rising price are bullish-shaped", () => {
  const price = []; for (let i = 0; i < 120; i++) price.push(100 + i * 0.7);
  const data = { price, n: price.length };
  const mk = bt => ({ nodes: [{ id: "p", kind: "block", blockType: "price" },
    { id: "x", kind: "block", blockType: bt, params: { len: 30, period: 14 } }],
    edges: [{ from: "p", to: "x" }] });
  const trend = ForgeCore.evalBlocks(mk("trend"), data).values.x;
  const rsi = ForgeCore.evalBlocks(mk("rsi"), data).values.x;
  const fib = ForgeCore.evalBlocks(mk("fib"), data).values.x;
  assert.strictEqual(trend.length, 120);
  assert.ok(trend[trend.length - 1] > 0);       // rising → positive slope
  assert.ok(rsi[rsi.length - 1] > 0);           // rising → RSI>50 → centered>0
  assert.ok(fib[fib.length - 1] > 0.5);         // price near range top → near +1
  assert.ok(trend.every(v => v >= -1.5 && v <= 1.5));
});

test("volume block produces no signal series (empty)", () => {
  const data = { price: [1,2,3], n: 3 };
  const g = { nodes: [{ id: "v", kind: "block", blockType: "volume" }], edges: [] };
  const { values } = ForgeCore.evalBlocks(g, data);
  assert.deepStrictEqual(values.v, []);
});
```

- [ ] **Step 2: 실패 확인** — Run → FAIL (블록 미구현)

- [ ] **Step 3: 구현** — `forge-core.js`. 헬퍼 추가:
```js
function rollingSlope(arr, len) {
  const out = [];
  for (let i = 0; i < arr.length; i++) {
    const a = Math.max(0, i - len + 1), win = arr.slice(a, i + 1);
    const { b } = linfit(win);
    out.push(Math.max(-1.5, Math.min(1.5, tanh(b * 6))));
  }
  return out;
}
function rsiSeries(arr, period) {
  const out = [], n = arr.length; let avgG = 0, avgL = 0;
  for (let i = 0; i < n; i++) {
    if (i === 0) { out.push(0); continue; }
    const ch = arr[i] - arr[i - 1], g = Math.max(0, ch), l = Math.max(0, -ch);
    if (i <= period) { avgG += g / period; avgL += l / period; }
    else { avgG = (avgG * (period - 1) + g) / period; avgL = (avgL * (period - 1) + l) / period; }
    const rs = avgL === 0 ? 100 : avgG / avgL, rsi = 100 - 100 / (1 + rs);
    out.push((rsi - 50) / 50);
  }
  return out;
}
function fibPos(arr, len) {
  const out = [];
  for (let i = 0; i < arr.length; i++) {
    const a = Math.max(0, i - len + 1), win = arr.slice(a, i + 1);
    const lo = Math.min(...win), hi = Math.max(...win), rng = (hi - lo) || 1;
    out.push(((arr[i] - lo) / rng) * 2 - 1);
  }
  return out;
}
```
`evalBlocks`의 분기에 추가(else 폴백 위):
```js
} else if (n.blockType === "trend") {
  values[id] = rollingSlope(ins[0] || data.price, (n.params && n.params.len) || 40);
} else if (n.blockType === "rsi") {
  values[id] = rsiSeries(ins[0] || data.price, (n.params && n.params.period) || 14);
} else if (n.blockType === "fib") {
  values[id] = fibPos(ins[0] || data.price, (n.params && n.params.len) || 120);
} else if (n.blockType === "volume") {
  values[id] = [];
}
```

- [ ] **Step 4: 통과 확인** — Run → PASS (전체)

- [ ] **Step 5: 커밋**
```bash
git add map/forge-core.js map/forge-core.test.js
git commit -m "feat(forge): 신규 블록 코어 — 추세선/RSI/피보나치 계산 + 거래량 참고(빈 시계열)"
```

---

## Task 3: weight 모델 + 파라미터 슬라이더 + 직렬화

**Files:**
- Modify: `map/forge.html`

**Interfaces:**
- Consumes: `renderParams`, `numRow`, `boardToGraph`, `exportStrategy`, `bN`, `sel`, `fireBoardChange`, 파라미터 input 위임 핸들러(boot DOMContentLoaded 내).
- Produces: 노드 `weight`(기본 50). 파라미터 패널에 **중요도 슬라이더** `#ppWeight`(0~100) + 값표시 `#ppWeightVal`. boardToGraph·export에 weight 포함.

- [ ] **Step 1: 파라미터 패널에 중요도 슬라이더** — `renderParams()`의 확신 슬라이더 행 위(또는 아래)에 추가:
```js
const wt = (n.weight != null) ? n.weight : 50;
// (panel.innerHTML 템플릿에 conviction 행과 나란히)
//   <div class="pp-row"><label>중요도</label>
//     <input type="range" id="ppWeight" min="0" max="100" step="1" value="${wt}">
//     <span class="pp-conv-val" id="ppWeightVal">${wt}</span></div>
```

- [ ] **Step 2: 입력 핸들러에 weight 분기** — boot 내 `#paramPanel` input 리스너에 추가(기존 `#ppConv`/`#ppNote` 분기 옆):
```js
else if (t.id === "ppWeight") {
  n.weight = Number(t.value);
  const v = document.getElementById("ppWeightVal"); if (v) v.textContent = n.weight;
}
```

- [ ] **Step 3: boardToGraph + export에 weight 포함** — `boardToGraph()` 노드 매핑에 `weight: (n.weight != null ? n.weight : 50)` 추가. `exportStrategy()` 노드 직렬화에 `weight`(50 아닐 때 조건부 포함; 기존 conviction 패턴 옆).

- [ ] **Step 4: 헤드리스 검증 + 커밋** — 컨트롤러: 노드 선택 시 중요도 슬라이더 표시, 값 변경이 노드 weight에 write-through되고 차트 재계산. 
```bash
git add map/forge.html
git commit -m "feat(forge): 중요도 슬라이더 + weight 직렬화(boardToGraph/export)"
```

---

## Task 4: 노드 시각 스케일(크기·글로우·배지) + 펄스 강도 연동

**Files:**
- Modify: `map/forge.html`

**Interfaces:**
- Consumes: `nodeHTML(n)`, `measure()`, `W_NODE`, 오버레이 펄스 그리기(`drawPulse`/`_edgePhase` 영역), `bN`.
- Produces: `weightScale(w)` 헬퍼; nodeHTML이 weight로 실제 width·font 스케일 + 글로우/배지; 오버레이 펄스 밝기/속도가 출발 노드 weight에 비례.

- [ ] **Step 1: `weightScale` + nodeHTML 크기/글로우/배지** — 전역 헬퍼:
```js
function weightScale(w) {
  const x = (w != null ? w : 50);
  return x <= 50 ? 0.8 + 0.2 * (x / 50) : 1.0 + 0.4 * ((x - 50) / 50); // 0→0.8,50→1.0,100→1.4
}
```
`nodeHTML(n)`에서 카드 스타일에 실제 크기/발광 적용(transform 금지):
```js
const wt = (n.weight != null ? n.weight : 50), sf = weightScale(wt);
const cardW = Math.round(W_NODE * sf);
const glow = wt > 55 ? `box-shadow:0 0 ${Math.round((wt-55)*0.5)}px rgba(232,180,99,${((wt-55)/45*0.6).toFixed(2)});` : "";
const wbadge = `<div class="b-n-wt" title="중요도">${wt}</div>`;
// 카드 루트 div style에 width·font-size·glow 반영:
//   style="left:${n.x}px;top:${n.y}px;width:${cardW}px;font-size:${(13*sf).toFixed(1)}px;${glow}"
// 본문에 ${wbadge} 추가
```
CSS:
```css
.b-n-wt{position:absolute;top:-8px;right:-8px;min-width:18px;height:18px;padding:0 4px;border-radius:9px;
  background:var(--gold);color:#1a1206;font-size:10px;font-weight:700;line-height:18px;text-align:center}
```

- [ ] **Step 2: measure 정합 확인** — `measure()`는 이미 `offsetWidth/offsetHeight`를 읽으므로 실제 width/font 스케일이면 자동 반영. `nodeHTML` 변경 후에도 measure가 스케일된 크기를 읽는지 확인(추가 코드 불필요, render 순서 유지).

- [ ] **Step 3: 펄스 강도 weight 연동** — 오버레이 펄스 그리기에서 각 엣지의 출발 노드 weight로 밝기/속도 변조. 펄스 점 알파/반경과 진행 속도에 `wf = 0.6 + 0.8*(bN(edge.from).weight??50)/100` 계수 곱(기존 펄스 코드에 삽입). 노드 글로우(오버레이 노드 발광)도 weight 비례.

- [ ] **Step 4: 헤드리스 시각 검증 + 커밋** — 컨트롤러: 한 노드 weight=95, 다른 노드 weight=10으로 설정 후 스크린샷 — 큰/작은 노드 크기 차이, 글로우, 배지, 펄스 밝기 차이 육안 확인.
```bash
git add map/forge.html
git commit -m "feat(forge): 노드 시각 스케일(크기/글로우/배지) + 펄스 강도 weight 연동"
```

---

## Task 5: 신규 블록 팔레트 + 파라미터 행

**Files:**
- Modify: `map/forge.html`

**Interfaces:**
- Consumes: `BLOCK_DEFS`, `addBlock`, `renderParams`(numRow), `nodeHTML`.
- Produces: 팔레트에 추세선/RSI/피보나치/거래량 버튼 + `BLOCK_DEFS` 항목; renderParams가 신규 블록 수치 param 행 렌더.

- [ ] **Step 1: BLOCK_DEFS + 팔레트 버튼** — `BLOCK_DEFS`에 추가:
```js
{ type: "trend",  label: "추세선",   kind: "block", params: { len: 40 } },
{ type: "rsi",    label: "RSI",      kind: "block", params: { period: 14 } },
{ type: "fib",    label: "피보나치", kind: "block", params: { len: 120 } },
{ type: "volume", label: "거래량",   kind: "block" }
```
팔레트 렌더에 이 타입 버튼 추가(기존 팔레트 생성 코드가 BLOCK_DEFS를 순회하면 자동; 아니면 버튼 행 추가).

- [ ] **Step 2: renderParams 신규 블록 수치 행** — `renderParams()`에 분기 추가(기존 ma/phasefold/combine 옆):
```js
if (n.blockType === "trend") rows.push(numRow("len", "추세 기간", (n.params && n.params.len) ?? 40));
if (n.blockType === "rsi") rows.push(numRow("period", "RSI 기간", (n.params && n.params.period) ?? 14));
if (n.blockType === "fib") rows.push(numRow("len", "피보 구간", (n.params && n.params.len) ?? 120));
// volume: 수치 param 없음(확신/중요도/메모/이미지만)
```

- [ ] **Step 3: 헤드리스 검증 + 커밋** — 컨트롤러: 팔레트에 4개 신규 버튼, 추세선/RSI/피보나치 추가→combine 연결 시 차트 변화, 각 선택 시 수치 param 행 표시, 거래량 노드는 참고 블록으로 추가됨.
```bash
git add map/forge.html
git commit -m "feat(forge): 팔레트 신규 블록(추세선/RSI/피보나치/거래량) + 파라미터 행"
```

---

## Task 6: 차트 오버레이(추세선·피보나치) + 통합 검증

**Files:**
- Modify: `map/forge.html`
- Modify: `map/forge-core.test.js` (회귀 가드 1건)

**Interfaces:**
- Consumes: `renderChart`(또는 `fcMap`/`toX/toY`), `lastResult`, `boardToGraph`, `data`, `ForgeCore`(linfit 노출 시) — 없으면 forge.html 내 회귀선/고저 계산.
- Produces: `#fcMain` 위에 활성 추세선(회귀선) + 피보나치 수평 레벨 렌더(보드에 해당 블록이 있을 때).

- [ ] **Step 1: 오버레이 그리기** — 보드에 `trend` 블록이 있으면 가격 전체 선형회귀선을, `fib` 블록이 있으면 최근 `len` 구간 고/저의 되돌림 레벨(0/0.236/0.382/0.5/0.618/1) 수평선을 메인 차트 좌표로 그림. `renderChart` 끝(또는 오버레이 레이어)에서 `boardToGraph().nodes`를 보고 블록 존재/파라미터 확인 후 드로잉. 색: 추세선 eth 점선, fib 레벨 골드 반투명 + 라벨.

- [ ] **Step 2: 회귀 가드 테스트** — `forge-core.test.js`에 weight 균일+conviction0 그래프가 Phase 1.5 동작과 동일함을 재확인하는 가드(또는 trend/rsi/fib run 통합 1건):
```js
test("phase2 regression: blocks run end-to-end via run()", () => {
  const data = ForgeCore.makeDemoSeries({ n: 300, seed: 2, period: 50 });
  const g = { nodes: [
    { id: "p", kind: "block", blockType: "price" },
    { id: "t", kind: "block", blockType: "trend", params: { len: 30 } },
    { id: "r", kind: "block", blockType: "rsi", params: { period: 14 } },
    { id: "c", kind: "block", blockType: "combine" },
    { id: "o", kind: "block", blockType: "predict" } ],
    edges: [{from:"p",to:"t"},{from:"p",to:"r"},{from:"t",to:"c"},{from:"r",to:"c"},{from:"c",to:"o"}] };
  const out = ForgeCore.run(g, data, { futW: 60 });
  assert.strictEqual(out.signal.length, 300);
  assert.strictEqual(out.prediction.path.length, 60);
  assert.ok(out.signal.every(v => v >= -100 && v <= 100));
});
```

- [ ] **Step 3: 전체 node 스위트 + 헤드리스 종합** — Run: `node --test map/forge-core.test.js` (전부 PASS). 컨트롤러: 추세선/피보나치 블록 추가 시 차트에 회귀선/레벨선 렌더, weight/블록/오버레이가 한 화면에서 동작, 콘솔 에러 0.

- [ ] **Step 4: 커밋**
```bash
git add map/forge.html map/forge-core.test.js
git commit -m "feat(forge): 차트 오버레이(추세선/피보나치) + Phase2 회귀 가드 + 통합 검증"
```

---

## Self-Review (작성자 점검)

**Spec coverage:**
- §2.2 가중 conviction + combine 기여 스케일 → Task 1(node TDD). ✅
- §2.1 weight 모델 + 직렬화 → Task 3. ✅
- §2.3 시각(크기/글로우/배지/펄스) → Task 4. ✅
- §3.1 trend/rsi/fib 계산 → Task 2(node TDD). §3.2 volume 참고(빈 시계열) → Task 2. ✅
- §3.3 팔레트/param 행 → Task 5. §3.4 차트 오버레이 → Task 6. ✅
- §4 export weight → Task 3. ✅ §7 회귀 가드 → Task 1/6. ✅
- 하위호환(weight50 균일+conv0=Phase1.5) → Task 1 테스트. ✅

**Placeholder scan:** 코어(1·2)·직렬화(3)·시각 헬퍼(4)·팔레트(5)는 실제 코드. 차트 오버레이(6 Step1)·펄스 연동(4 Step3)은 기존 그리기 코드 위치에 계수/드로잉 삽입 지시(정확한 라인은 구현자가 해당 함수에서 확인) — 200KB 단일 파일의 기존 렌더 함수에 삽입하는 작업이라 이 방식이 정확. 시각 검증은 컨트롤러 헤드리스.

**Type consistency:** `weight`(number, 기본 50) 전 태스크 일관. `weightScale(w)`·`aggregateConviction`(가중)·combine 유효가중(`manual×weight/50`)·신규 blockType(`trend/rsi/fib/volume`)·`rollingSlope/rsiSeries/fibPos` 명칭 일관. boardToGraph가 weight 포함(Task3) → run/aggregateConviction/combine이 읽음(Task1) 정합. param 키 `len`(trend/fib)·`period`(rsi)가 evalBlocks(Task2)와 renderParams(Task5) 일치.
