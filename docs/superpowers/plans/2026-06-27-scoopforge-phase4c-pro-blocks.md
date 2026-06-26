# 스쿱포지 Phase 4-C (R4: 파동 스캔 + 엘리어트) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 엘리어트 파동 블록(스윙 5-3 휴리스틱, contribution+meta)을 추가하고, 기존 phasefold를 UI에서 "파동 스캔"으로 승격하며 두 스캔 블록의 결과 배지를 노드에 표시한다.

**Architecture:** `forge-core.js`에 `elliott` blockType(detectSwings+elliottAnalyze, DOM-free, node 테스트). `forge.html`에서 BLOCK_DEFS/renderParams 라벨을 "파동 스캔"으로 리브랜드 + 엘리어트 팔레트/파라미터 추가 + `paintScanBadges()`로 phasefold/elliott 노드에 스캔 결과 표기.

**Tech Stack:** 바닐라 JS. `node --test map/forge-core.test.js`로 코어 검증. UI는 헤드리스.

## Global Constraints

- 수정 대상: `map/forge.html`, `map/forge-core.js`, `map/forge-core.test.js`만. 기존 `map/map.html`·`map/chart.html`·`map/api.php`·`map/forge-api.php`·`*_*.json` 불가침.
- 바닐라 JS, 2 spaces, 큰따옴표, 케밥케이스. 다크 골드 토큰. 한국어 UI. noindex. FORGE_API 상대.
- `forge-core.js` DOM-free. 기존 node 테스트 15개 유지.
- `phasefold` 내부 blockType·params 키 변경 금지(라벨만 "파동 스캔"). 저장 호환.
- 신규 블록 출력: `values[id]`(contribution 시계열) + `meta[id]`(스캔 결과). 자동 재계산은 기존 `fireBoardChange→runForge`.

---

## Task 1: 코어 — 엘리어트 블록

**Files:**
- Modify: `map/forge-core.js`
- Modify: `map/forge-core.test.js`

**Interfaces:**
- Consumes: `evalBlocks`.
- Produces: `evalBlocks`가 blockType `elliott` 처리 → `values[id]`(−1~1 contribution) + `meta[id]={waves:[{idx,price,label}], current:{label,dir}}`. 헬퍼 `detectSwings(arr,sens)`, `elliottAnalyze(arr,sens)`.

- [ ] **Step 1: 테스트 작성 (실패 예정)** — `forge-core.test.js`에 추가:
```js
test("elliott: 5-wave up impulse -> positive last bias + waves", () => {
  const pts = [10, 30, 22, 50, 40, 70];
  const price = [];
  for (let i = 0; i < pts.length - 1; i++) { const a = pts[i], b = pts[i + 1]; for (let k = 0; k < 20; k++) price.push(a + (b - a) * k / 20); }
  price.push(pts[pts.length - 1]);
  const g = { nodes: [{ id: "p", kind: "block", blockType: "price" }, { id: "e", kind: "block", blockType: "elliott", params: { swing: 5 } }], edges: [{ from: "p", to: "e" }] };
  const r = ForgeCore.evalBlocks(g, { price, n: price.length });
  const v = r.values.e;
  assert.strictEqual(v.length, price.length);
  assert.ok(v[v.length - 1] > 0);            // last leg up
  assert.ok(v.every(x => x >= -1 && x <= 1));
  assert.ok(r.meta.e.waves.length >= 3);
  assert.strictEqual(r.meta.e.current.dir, 1);
});
test("elliott: too-short series -> zeros, no error", () => {
  const g = { nodes: [{ id: "e", kind: "block", blockType: "elliott" }], edges: [] };
  const r = ForgeCore.evalBlocks(g, { price: [5], n: 1 });
  assert.deepStrictEqual(r.values.e, [0]);
});
```

- [ ] **Step 2: 실패 확인** — Run: `node --test map/forge-core.test.js` → FAIL (elliott 미구현 → values.e undefined)

- [ ] **Step 3: 구현** — `forge-core.js`. 헬퍼 추가(예: fibPos 근처):
```js
function detectSwings(arr, sens) {
  const n = arr.length; if (n < 2) return [];
  const rng = (Math.max(...arr) - Math.min(...arr)) || 1;
  const thr = rng * (sens || 0.03);
  const piv = [{ idx: 0, price: arr[0] }];
  let trend = 0, extIdx = 0, extVal = arr[0];
  for (let i = 1; i < n; i++) {
    const v = arr[i];
    if (trend >= 0) {
      if (v > extVal) { extVal = v; extIdx = i; }
      else if (extVal - v >= thr) { piv.push({ idx: extIdx, price: extVal }); trend = -1; extVal = v; extIdx = i; continue; }
    }
    if (trend <= 0) {
      if (v < extVal) { extVal = v; extIdx = i; }
      else if (v - extVal >= thr) { piv.push({ idx: extIdx, price: extVal }); trend = 1; extVal = v; extIdx = i; }
    }
  }
  if (extIdx !== piv[piv.length - 1].idx) piv.push({ idx: extIdx, price: extVal });
  return piv;
}
function elliottAnalyze(arr, sens) {
  const n = arr.length;
  const sw = detectSwings(arr, sens);
  const values = new Array(n).fill(0);
  if (sw.length < 2) return { values, waves: [], current: { label: "-", dir: 0 } };
  const labels = ["1", "2", "3", "4", "5", "A", "B", "C"];
  const legs = [];
  for (let i = 1; i < sw.length; i++) legs.push({ from: sw[i - 1], to: sw[i], up: sw[i].price >= sw[i - 1].price });
  const recent = legs.slice(-8);
  recent.forEach((lg, i) => { lg.label = labels[i] || ""; });
  recent.forEach(lg => { const val = lg.up ? 0.7 : -0.7; for (let t = lg.from.idx; t <= lg.to.idx && t < n; t++) values[t] = val; });
  const last = recent[recent.length - 1];
  return {
    values,
    waves: recent.map(lg => ({ idx: lg.to.idx, price: lg.to.price, label: lg.label })),
    current: { label: last.label || "-", dir: last.up ? 1 : -1 }
  };
}
```
`evalBlocks`의 분기에 추가(예: `fib` 다음, `volume`/else 앞):
```js
} else if (n.blockType === "elliott") {
  const src = ins[0] || data.price;
  const sens = (n.params && n.params.swing != null) ? n.params.swing / 100 : 0.03;
  const ea = elliottAnalyze(src, sens);
  values[id] = ea.values;
  meta[id] = { waves: ea.waves, current: ea.current };
}
```
(`detectSwings`/`elliottAnalyze`는 내부 헬퍼 — factory 반환에 노출 불필요. `evalBlocks` 통해 검증.)

- [ ] **Step 4: 통과 확인** — Run: `node --test map/forge-core.test.js` → PASS (기존 15 + 신규 2 = 17)

- [ ] **Step 5: 커밋**
```bash
git add map/forge-core.js map/forge-core.test.js
git commit -m "feat(forge): 엘리어트 파동 블록 코어 — 스윙 5-3 휴리스틱(contribution+meta)"
```

---

## Task 2: UI — 파동 스캔 리브랜드 + 엘리어트 팔레트 + 스캔 배지

**Files:**
- Modify: `map/forge.html`

**Interfaces:**
- Consumes: `BLOCK_DEFS`, `renderParams`/`numRow`, `boardState`, `bq(id)`(노드 엘리먼트), `lastResult`, `runForge`, `renderChart`.
- Produces: 팔레트 "파동 스캔"·"엘리어트"; renderParams elliott 행; `paintScanBadges()`(runForge 끝에서 호출) + `.b-n-scan` CSS.

- [ ] **Step 1: BLOCK_DEFS 리브랜드 + 엘리어트** — `BLOCK_DEFS`에서 `{ type: "phasefold", label: "위상폴딩", ... }`의 label을 `"파동 스캔"`으로 변경(type/params 불변). `fib` 항목 다음에 추가:
```js
    { type: "elliott",   label: "엘리어트",    kind: "block", params: { swing: 3 } },
```

- [ ] **Step 2: renderParams 라벨 + elliott 행** — phasefold 행 라벨 변경 + elliott 행 추가:
```js
    if (n.blockType === "phasefold") {
      rows.push(numRow("pmin", "스캔 범위 최소", (n.params && n.params.pmin) ?? 16));
      rows.push(numRow("pmax", "스캔 범위 최대", (n.params && n.params.pmax) ?? 128));
    }
    if (n.blockType === "elliott") rows.push(numRow("swing", "스윙 민감도(%)", (n.params && n.params.swing) ?? 3));
```

- [ ] **Step 3: 스캔 결과 배지** — `.b-n-scan` CSS 추가(노드 본문 작은 라벨):
```css
.b-n-scan{margin-top:4px;font-size:10px;color:var(--eth);font-family:ui-monospace,monospace}
```
`paintScanBadges()` 추가:
```js
function paintScanBadges() {
  if (!lastResult || !bWorld) return;
  boardState.nodes.forEach(n => {
    if (n.blockType !== "phasefold" && n.blockType !== "elliott") return;
    const el = bq(n.id); if (!el) return;
    const body = el.querySelector(".b-n-body"); if (!body) return;
    let s = el.querySelector(".b-n-scan");
    if (!s) { s = document.createElement("div"); s.className = "b-n-scan"; body.appendChild(s); }
    const m = lastResult.meta && lastResult.meta[n.id];
    if (n.blockType === "phasefold") {
      s.textContent = m && m.best != null
        ? "P*≈" + Math.round(m.best) + (Number.isFinite(m.theta) ? " θ" + m.theta.toFixed(2) : "")
        : "스캔 대기";
    } else {
      s.textContent = m && m.current
        ? "파동 " + m.current.label + " " + (m.current.dir > 0 ? "▲" : m.current.dir < 0 ? "▼" : "–")
        : "스캔 대기";
    }
  });
}
```
`runForge`의 `renderChart(lastResult, data);` 다음 줄에 `paintScanBadges();` 추가.

- [ ] **Step 4: 헤드리스 검증 + 커밋** — 컨트롤러: 팔레트에 "파동 스캔"·"엘리어트", 엘리어트 추가→combine 연결 시 시그널 변화, 파동 스캔/엘리어트 노드에 결과 배지(P*≈…/파동 5 ▲), 파라미터 패널 elliott swing 행, 콘솔 에러 0. `node --test map/forge-core.test.js` 17/17.
```bash
git add map/forge.html
git commit -m "feat(forge): 파동 스캔 리브랜드 + 엘리어트 팔레트/파라미터 + 스캔 결과 배지"
```

---

## Self-Review (작성자 점검)

**Spec coverage:**
- §2 엘리어트 코어(detectSwings/elliottAnalyze/evalBlocks elliott, contribution+meta) → Task 1(node TDD). ✅
- §3 파동 스캔 리브랜드(BLOCK_DEFS/renderParams 라벨, type 불변) → Task 2 Step1·2. 엘리어트 팔레트/파라미터 → Task 2 Step1·2. 스캔 배지(paintScanBadges) → Task 2 Step3. ✅
- §4 검증(node 17, 헤드리스) → 각 Task 검증. ✅
- §6 리스크(phasefold 키 불변·휴리스틱 근사·배지 재렌더 타이밍·DOM-free) → Global·Task2 Step3(runForge 후 paint). ✅

**Placeholder scan:** 코어 알고리즘·테스트·UI 전부 실제 코드. UI 검증은 컨트롤러 헤드리스. 플레이스홀더 없음.

**Type consistency:** `elliott` blockType·`detectSwings`/`elliottAnalyze`·`values[id]`/`meta[id]={waves,current}`·`paintScanBadges`·`.b-n-scan`·`bq`·`lastResult.meta` 명칭 일관. evalBlocks elliott meta 구조(current.label/dir, waves) ↔ paintScanBadges 소비 일치. phasefold meta(best/theta) ↔ 배지 일치(기존 Task5 meta). BLOCK_DEFS type "elliott" ↔ evalBlocks/renderParams 분기 일치.
