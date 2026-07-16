# 다중스케일 위계 작도 확장 (S/R·structure) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Gann의 `collectAnchors` 다중스케일 위계를 피벗 노드(S/R)와 시장구조 노드로 확장하여, 여러 스케일의 유의미한 스윙을 발굴·중요도 순위·강조/디밍으로 작도한다.

**Architecture:** forge-core.js에 작도 전용 순수 함수 `collectLevels`(S/R 수평 클러스터)·`collectStructure`(다중 티어) 추가. `opts.draw` 게이팅으로 엔진 bias/`run()` 불변. forge-ui.js에 드로 전용 래퍼(`_anPivotDraw`·`_anStruct`, 별 캐시키)로 bias 경로 비용 격리. forge-draw.js의 `_drawPivotLayers`·`_drawStructureLayers`가 새 필드를 강조/디밍으로 렌더.

**Tech Stack:** 순수 HTML5·CSS3·바닐라 JS(빌드 도구 없음). forge-core.js는 UMD(브라우저 `window.ForgeCore` + node `module.exports`)·단위테스트 `node --test forge-core.test.js`.

## Global Constraints

- **엔진 bias/예측 완전 불변**: 새 계산은 전부 `opts.draw` 게이팅. `analyzeX`의 bias 필드·`run()`·`evalBlocks` 무변경. baseline 안전.
- **비용 격리**: 드로 계산은 draw 호출에서만. bias/게이지 경로(`_nodeBias`)는 draw 없이 호출 → 비용 0. 드로 전용 래퍼는 **별 캐시키** 사용.
- **좌측 컬러 라인 금지**: 강조는 배경색·텍스트색·굵기·라벨로만. accent bar/rail·`box-shadow:inset Npx 0 0`·`::before` 세로 마커 금지.
- **여러 classic script 전역 스코프 공유**: 로드 순서 core→state→ui→draw→app 고정. `defer`/`async` 금지. 중복 최상위 선언 금지.
- **들여쓰기 2 spaces · 큰따옴표**. 한국어 UI 텍스트.
- **캐시버스터**: forge.css/js 수정 시 forge.html의 `?v=` 갱신 필수(누락 시 stale CSS/JS 회귀).
- **배포 한 세트**: 수정 완료 시 커밋+push+cafe24 배포(`www/map/`)까지. 서버 데이터 파일(forge_*.json) 불가침.

---

### Task 1: `collectLevels` — S/R 수평 레벨 클러스터 (코어 순수 함수)

**Files:**
- Modify: `forge-core.js` (add function after `collectAnchors`, 현재 line 965 뒤)
- Test: `forge-core.test.js` (append)

**Interfaces:**
- Consumes: `detectSwings(arr, sens)` (forge-core.js:908, 반환 `[{idx, price}]`)
- Produces: `collectLevels(price, opts) → [{ price:number, side:"support"|"resistance", touches:number, degMin:number, significance:number, reason:string }]` significance 내림차순, 최대 `opts.cap`(기본 10)개. `P<24` → `[]`.

- [ ] **Step 1: Write the failing tests**

`forge-core.test.js` 맨 끝에 추가:

```js
test("collectLevels clusters recurring swing levels, scores, dedups by side", () => {
  // 톱니: ~100(고점)·~90(저점)을 3회 왕복
  const price = [];
  const tops = [100, 100.3, 99.8], bots = [90, 90.2, 89.9];
  for (let k = 0; k < 3; k++) {
    for (let i = 0; i <= 6; i++) price.push(bots[k] + (tops[k] - bots[k]) * i / 6);
    for (let i = 1; i <= 6; i++) price.push(tops[k] - (tops[k] - bots[k]) * i / 6);
  }
  const levels = ForgeCore.collectLevels(price);
  assert.ok(levels.length >= 2, "레벨 2개 이상");
  const nearTop = levels.find(L => Math.abs(L.price - 100) < 2);
  const nearBot = levels.find(L => Math.abs(L.price - 90) < 2);
  assert.ok(nearTop, "100 근처 레벨");
  assert.ok(nearBot, "90 근처 레벨");
  assert.ok(nearTop.touches >= 2, "고점 다회 터치");
  // significance 내림차순 정렬
  for (let i = 1; i < levels.length; i++) assert.ok(levels[i - 1].significance >= levels[i].significance);
  // 결정성
  assert.deepStrictEqual(ForgeCore.collectLevels(price), levels);
});

test("collectLevels returns [] for short input", () => {
  assert.deepStrictEqual(ForgeCore.collectLevels([1, 2, 3]), []);
  assert.deepStrictEqual(ForgeCore.collectLevels(new Array(20).fill(5)), []);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test forge-core.test.js 2>&1 | grep -A2 collectLevels`
Expected: FAIL — `ForgeCore.collectLevels is not a function`

- [ ] **Step 3: Implement `collectLevels`**

`forge-core.js`의 `collectAnchors` 함수 닫는 `}` 바로 뒤(line 965 뒤)에 삽입:

```js
  // 작도 전용(다중스케일 S/R): 사다리 전반의 스윙 고/저점을 가격 근접으로 클러스터 → 유의도 순위. 엔진 bias 무관.
  function collectLevels(price, opts) {
    opts = opts || {};
    const P = Array.isArray(price) ? price.length : 0;
    if (P < 24) return [];
    const LADDER = opts.ladder || [0.18, 0.12, 0.08, 0.05, 0.035, 0.02];
    const clusterPct = opts.clusterPct != null ? opts.clusterPct : 0.006;
    const minTouches = opts.minTouches != null ? opts.minTouches : 1;
    const cap = opts.cap != null ? opts.cap : 10;
    const range = (Math.max(...price) - Math.min(...price)) || 1;
    const lastIdx = P - 1, last = price[lastIdx];
    const pivots = [];
    for (let li = 0; li < LADDER.length; li++) {
      const sw = detectSwings(price, LADDER[li]);
      for (let i = 0; i < sw.length; i++) {
        const prev = sw[i - 1], next = sw[i + 1];
        let type = "H";
        if (prev && next) type = (sw[i].price >= prev.price && sw[i].price >= next.price) ? "H" : "L";
        else if (next) type = sw[i].price >= next.price ? "H" : "L";
        else if (prev) type = sw[i].price >= prev.price ? "H" : "L";
        pivots.push({ idx: sw[i].idx, price: sw[i].price, type, degree: li });
      }
    }
    const tol = clusterPct * range, clusters = [];
    for (const pv of pivots) {
      const hit = clusters.find(cl => Math.abs(cl.price - pv.price) <= tol);
      if (hit) { hit.members.push(pv); if (pv.degree < hit.degMin) hit.degMin = pv.degree; }
      else clusters.push({ price: pv.price, members: [pv], degMin: pv.degree });
    }
    const out = [];
    for (const cl of clusters) {
      let wsum = 0, psum = 0, maxToIdx = 0;
      for (const m of cl.members) { const w = LADDER.length - m.degree; wsum += w; psum += m.price * w; if (m.idx > maxToIdx) maxToIdx = m.idx; }
      const levelPrice = wsum ? psum / wsum : cl.price;
      const touches = cl.members.length;
      const degW = 1 - cl.degMin / LADDER.length;
      const recency = lastIdx ? maxToIdx / lastIdx : 0;
      const prox = 1 - Math.min(1, Math.abs(levelPrice - last) / range);
      const side = levelPrice <= last ? "support" : "resistance";
      const significance = Math.max(0, Math.min(1, 0.35 * Math.min(1, (touches - 1) / 3) + 0.30 * degW + 0.20 * prox + 0.15 * recency));
      const reason = touches + "회 터치" + (prox > 0.7 ? " · 현재가 근접" : "") + (degW > 0.6 ? " · 대형" : "");
      if (touches >= minTouches) out.push({ price: levelPrice, side, touches, degMin: cl.degMin, significance, reason });
    }
    out.sort((a, b) => b.significance - a.significance);
    return out.slice(0, cap);
  }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test forge-core.test.js 2>&1 | grep -E "collectLevels|# (pass|fail)"`
Expected: 두 collectLevels 테스트 PASS, 전체 fail 0

- [ ] **Step 5: Commit**

```bash
git add forge-core.js forge-core.test.js
git commit -m "feat(forge): collectLevels — 다중스케일 S/R 수평 레벨 클러스터(작도 전용)"
```

---

### Task 2: `collectStructure` — 다중스케일 구조 티어 (코어 순수 함수)

**Files:**
- Modify: `forge-core.js` (add function after `collectLevels`)
- Test: `forge-core.test.js` (append)

**Interfaces:**
- Consumes: `detectSwings(arr, sens)` (forge-core.js:908)
- Produces: `collectStructure(price, opts) → { tiers: [{ degree:number, sens:number, swings:[{idx, price, type:"H"|"L", label:string, significance:number}], trend:"up"|"down"|"none", event:string, eventPrice:number|null, significance:number }] }` tiers는 significance 내림차순(대형 먼저). `P<24` → `{ tiers: [] }`.

- [ ] **Step 1: Write the failing tests**

`forge-core.test.js` 맨 끝에 추가:

```js
test("collectStructure labels uptrend HH/HL and orders tiers coarse-first", () => {
  // 상승 계단: 스윙마다 고점·저점 상승
  const price = [];
  let base = 100;
  for (let k = 0; k < 5; k++) {
    for (let i = 0; i <= 5; i++) price.push(base + i);
    for (let i = 1; i <= 3; i++) price.push(base + 5 - i);
    base += 2;
  }
  const st = ForgeCore.collectStructure(price);
  assert.ok(st.tiers.length >= 1, "티어 존재");
  const t = st.tiers[0];
  assert.ok(t.swings.length >= 4, "스윙 다수");
  assert.ok(t.swings.some(s => s.label === "HH"), "HH 라벨");
  assert.ok(t.swings.some(s => s.label === "HL"), "HL 라벨");
  assert.strictEqual(t.trend, "up");
  // 대형(작은 degree) 먼저
  for (let i = 1; i < st.tiers.length; i++) assert.ok(st.tiers[i - 1].significance >= st.tiers[i].significance);
  // 결정성
  assert.deepStrictEqual(ForgeCore.collectStructure(price), st);
});

test("collectStructure returns empty tiers for short input", () => {
  assert.deepStrictEqual(ForgeCore.collectStructure([1, 2, 3]).tiers, []);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test forge-core.test.js 2>&1 | grep -A2 collectStructure`
Expected: FAIL — `ForgeCore.collectStructure is not a function`

- [ ] **Step 3: Implement `collectStructure`**

`forge-core.js`의 `collectLevels` 닫는 `}` 바로 뒤에 삽입:

```js
  // 작도 전용(다중스케일 구조): 티어별 스윙 시퀀스에 HH/HL/LH/LL 라벨 + BOS/CHoCH. 엔진 bias 무관.
  function collectStructure(price, opts) {
    opts = opts || {};
    const P = Array.isArray(price) ? price.length : 0;
    if (P < 24) return { tiers: [] };
    const SENS = opts.sens || [0.12, 0.06, 0.03];   // 대→소
    const lastIdx = P - 1, tiers = [];
    for (let ti = 0; ti < SENS.length; ti++) {
      const sw = detectSwings(price, SENS[ti]);
      if (sw.length < 4) continue;
      const pts = sw.map((s, i) => ({ idx: s.idx, price: s.price, type: (i > 0 ? (s.price > sw[i - 1].price ? "H" : "L") : (s.price > sw[1].price ? "H" : "L")) }));
      let prevH = null, prevL = null;
      for (const p of pts) {
        if (p.type === "H") { p.label = prevH ? (p.price > prevH.price ? "HH" : "LH") : "H"; prevH = p; }
        else { p.label = prevL ? (p.price > prevL.price ? "HL" : "LL") : "L"; prevL = p; }
        const recency = lastIdx ? p.idx / lastIdx : 0;
        p.significance = Math.max(0, Math.min(1, 0.6 * (1 - ti / SENS.length) + 0.4 * recency));
      }
      const highs = pts.filter(p => p.type === "H"), lows = pts.filter(p => p.type === "L");
      const lastH = highs[highs.length - 1] || null, prevHt = highs[highs.length - 2] || null;
      const lastL = lows[lows.length - 1] || null, prevLt = lows[lows.length - 2] || null;
      const hUp = (lastH && prevHt) ? Math.sign(lastH.price - prevHt.price) : 0;
      const lUp = (lastL && prevLt) ? Math.sign(lastL.price - prevLt.price) : 0;
      const vote = hUp + lUp;
      const trend = vote > 0 ? "up" : vote < 0 ? "down" : "none";
      const last = price[lastIdx], refH = lastH ? lastH.price : Infinity, refL = lastL ? lastL.price : -Infinity;
      let event = "none", eventPrice = null;
      if (last > refH) { event = trend === "down" ? "CHoCH_up" : "BOS_up"; eventPrice = refH; }
      else if (last < refL) { event = trend === "up" ? "CHoCH_down" : "BOS_down"; eventPrice = refL; }
      tiers.push({ degree: ti, sens: SENS[ti], swings: pts, trend, event, eventPrice, significance: Math.max(0, Math.min(1, 1 - ti / SENS.length)) });
    }
    tiers.sort((a, b) => b.significance - a.significance);
    return { tiers };
  }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test forge-core.test.js 2>&1 | grep -E "collectStructure|# (pass|fail)"`
Expected: 두 collectStructure 테스트 PASS, 전체 fail 0

- [ ] **Step 5: Commit**

```bash
git add forge-core.js forge-core.test.js
git commit -m "feat(forge): collectStructure — 다중스케일 구조 티어(HH/HL/LH/LL·BOS/CHoCH, 작도 전용)"
```

---

### Task 3: 코어 draw 게이팅 + export + bias 불변 회귀

**Files:**
- Modify: `forge-core.js:459` (analyzePivot return), `forge-core.js:1662` (analyzeStructure return), `forge-core.js:2674` (exports)
- Test: `forge-core.test.js` (append)

**Interfaces:**
- Consumes: `collectLevels`·`collectStructure` (Task 1·2)
- Produces: `analyzePivot(data, {draw:true}).srLevels` (배열), `analyzeStructure(price, {draw:true}).tiers` (배열). draw 없으면 두 필드 부재, bias 무변경. `ForgeCore.collectLevels`·`ForgeCore.collectStructure` export.

- [ ] **Step 1: Write the failing regression tests**

`forge-core.test.js` 맨 끝에 추가:

```js
test("analyzePivot: srLevels only with draw, bias/P unchanged", () => {
  const price = ForgeCore.makeDemoSeries({ n: 150, seed: 7, period: 50 }).price;
  const candle = ForgeCore.makeDemoSeries({ n: 150, seed: 7, period: 50 }).candle;
  const plain = ForgeCore.analyzePivot({ price, candle });
  assert.strictEqual(plain.srLevels, undefined);
  const drawn = ForgeCore.analyzePivot({ price, candle }, { draw: true });
  assert.ok(Array.isArray(drawn.srLevels), "draw 시 srLevels 배열");
  assert.strictEqual(drawn.bias, plain.bias, "bias 불변");
  assert.strictEqual(drawn.P, plain.P, "P 불변");
});

test("analyzeStructure: tiers only with draw, bias unchanged", () => {
  const price = ForgeCore.makeDemoSeries({ n: 150, seed: 9, period: 48 }).price;
  const plain = ForgeCore.analyzeStructure(price, { swing: 0.03 });
  assert.strictEqual(plain.tiers, undefined);
  const drawn = ForgeCore.analyzeStructure(price, { swing: 0.03, draw: true });
  assert.ok(Array.isArray(drawn.tiers), "draw 시 tiers 배열");
  assert.strictEqual(drawn.bias, plain.bias, "bias 불변");
  assert.strictEqual(drawn.event, plain.event, "event 불변");
});

test("collectLevels/collectStructure are exported", () => {
  assert.strictEqual(typeof ForgeCore.collectLevels, "function");
  assert.strictEqual(typeof ForgeCore.collectStructure, "function");
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test forge-core.test.js 2>&1 | grep -E "only with draw|are exported|# fail"`
Expected: FAIL — srLevels/tiers는 undefined 아님 기대에서 실패, export는 undefined

- [ ] **Step 3a: Add draw branch to `analyzePivot`**

`forge-core.js:459` 교체:

```js
    return { P, R: [R1,R2,R3], S: [S1,S2,S3], last, bias };
```

→

```js
    const out = { P, R: [R1,R2,R3], S: [S1,S2,S3], last, bias };
    if (opts.draw) out.srLevels = collectLevels(price, opts);
    return out;
```

- [ ] **Step 3b: Add draw branch to `analyzeStructure`**

`forge-core.js:1662` 교체:

```js
    return { swings: pts, trend, event, swingHigh: lastH, swingLow: lastL, bias };
```

→

```js
    const out = { swings: pts, trend, event, swingHigh: lastH, swingLow: lastL, bias };
    if (opts.draw) out.tiers = collectStructure(price, opts).tiers;
    return out;
```

- [ ] **Step 3c: Add exports**

`forge-core.js:2674`의 `analyzePivot, pivotSteps, collectAnchors,` 를 다음으로 교체:

```js
analyzePivot, pivotSteps, collectAnchors, collectLevels, collectStructure,
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test forge-core.test.js 2>&1 | grep -E "# (tests|pass|fail)"`
Expected: `# fail 0`, tests 총계는 기존 199 + 신규 7 = 206

- [ ] **Step 5: Commit**

```bash
git add forge-core.js forge-core.test.js
git commit -m "feat(forge): analyzePivot/Structure draw 게이팅으로 srLevels/tiers 노출(bias 불변) + export"
```

---

### Task 4: S/R 작도 — 스윙레벨 클러스터 강조/디밍 (피벗 노드)

**Files:**
- Modify: `forge-ui.js:468` (add `_anPivotDraw` after `_anPivot`)
- Modify: `forge-draw.js:2727` (dispatch: `_anPivot(price)` → `_anPivotDraw(price)`)
- Modify: `forge-draw.js:2440-2461` (rewrite `_drawPivotLayers`)

**Interfaces:**
- Consumes: `ForgeCore.analyzePivot(data, {draw:true})` → `piv.srLevels` (Task 3), `piv.P`. 드로 헬퍼 `pToY`·`fmtNum`·`FC_GOLD`·`CW`·`CDASH`·`_evLabel`(forge-draw.js 스코프 내 기존).
- Produces: 시각 — 상위 3개 강조(굵은 side색 선+라벨 "저항 ×3 …"), 나머지 디밍, 고전 피벗 P만 흐린 참고선.

- [ ] **Step 1: Add `_anPivotDraw` wrapper**

`forge-ui.js:468`의 `_anPivot` 정의 **다음 줄**에 추가:

```js
  function _anPivotDraw(P) { return _anGet(P, "PivotDraw", () => ForgeCore.analyzePivot({ candle: (_fcLastData && _fcLastData.candle) || (typeof currentData === "function" && currentData().candle) || [], price: P }, { draw: true })); }
```

- [ ] **Step 2: Swap pivot dispatch to draw wrapper**

`forge-draw.js:2727`의 `const piv = _anPivot(price);` 를 교체:

```js
          const piv = _anPivotDraw(price);
```

- [ ] **Step 3: Rewrite `_drawPivotLayers`**

`forge-draw.js:2440-2461` 전체(함수 `_drawPivotLayers` ~ 닫는 `}`)를 교체:

```js
  // 피벗 노드 S/R — 다중스케일 스윙레벨 클러스터(강조/디밍·터치수 라벨) + 고전 피벗 P만 참고선.
  function _drawPivotLayers(c, piv, M) {
    c.save();
    const { pToY, xRight, padX, top, bot, reveal = Infinity } = M;
    if (!piv || !piv.P) { c.restore(); return; }
    const xL = (padX != null ? padX : 0), xR = (xRight != null ? xRight : 0), GOLD = FC_GOLD;
    // 화면 밖 레벨은 가장자리 마커
    function offMark(price, label, color) {
      const y = pToY(price); if (!isFinite(y)) return false;
      if (top != null && bot != null && (y < top || y > bot)) {
        const cy = y < top ? top + 7 : bot - 3, arw = y < top ? "▲" : "▼";
        _evLabel(c, arw + " " + label + " " + fmtNum(price), xR - 3, cy, color, "right");
        return true;
      }
      return false;
    }
    // 고전 피벗 P: 흐린 점선 참고선(R/S는 렌더 생략 — 데이터·bias엔 존속)
    if (reveal >= 1 && !offMark(piv.P, "P", GOLD)) {
      const yP = pToY(piv.P);
      if (isFinite(yP)) {
        c.setLineDash(CDASH.fine); c.strokeStyle = GOLD; c.lineWidth = CW.hair; c.globalAlpha = 0.35;
        c.beginPath(); c.moveTo(xL, yP); c.lineTo(xR, yP); c.stroke();
        c.globalAlpha = 1; c.setLineDash([]);
        _evLabel(c, "P " + fmtNum(piv.P), xR - 3, yP - 2, GOLD, "right");
      }
    }
    // 스윙레벨 클러스터
    const levels = (piv.srLevels || []).slice();
    const K = 3;   // 상위 강조 개수
    levels.forEach((L, i) => {
      const emph = i < K;   // 유의도 상위 K개 강조(정렬됨)
      if (reveal < (emph ? 1 : 2)) return;   // 강조 먼저 노출
      const col = L.side === "support" ? "#46c28e" : "#e06a6a";
      if (offMark(L.price, L.side === "support" ? "지지" : "저항", col)) return;
      const y = pToY(L.price); if (!isFinite(y)) return;
      const alpha = emph ? 0.9 : Math.max(0.12, 0.15 + L.significance * 0.4);
      c.setLineDash(emph ? [] : CDASH.fine);
      c.strokeStyle = col; c.lineWidth = emph ? CW.bold : CW.hair; c.globalAlpha = alpha;
      c.beginPath(); c.moveTo(xL, y); c.lineTo(xR, y); c.stroke();
      c.globalAlpha = 1; c.setLineDash([]);
      if (emph && _skReady()) _evLabel(c, (L.side === "support" ? "지지" : "저항") + " ×" + L.touches + " " + fmtNum(L.price), xR - 3, y - 2, col, "right");
    });
    c.restore();
  }
```

- [ ] **Step 4: Verify — core tests still green**

Run: `node --test forge-core.test.js 2>&1 | grep "# fail"`
Expected: `# fail 0`

- [ ] **Step 5: Verify — 시각(실 티커 또는 헤드리스)**

앱에서 피벗 노드가 표시된 상태로 실 티커를 불러와 확인(권장), 또는 헤드리스 렌더:
- 확인 항목: (a) 콘솔 에러 0, (b) 스윙레벨 수평선이 상위 3개는 굵은 지지(초록)/저항(빨강)+"지지/저항 ×N" 라벨, 나머지는 흐린 헤어라인, (c) 고전 P는 흐린 점선 한 줄만(R1~3/S1~3 없음).

헤드리스 스모크(콘솔 에러 검사):
```bash
BIN=~/.cache/ms-playwright/chromium_headless_shell-*/chrome-headless-shell-linux64/chrome-headless-shell
LP=/tmp/chrlibs:/tmp/chrlibs/usr/lib/x86_64-linux-gnu:/tmp/chrlibs/lib/x86_64-linux-gnu
LD_LIBRARY_PATH=$LP $BIN --headless --no-sandbox --disable-gpu --virtual-time-budget=4000 --dump-dom "file://$PWD/forge.html" 2>&1 | grep -i "error\|is not a function\|undefined is not" || echo "NO JS ERRORS"
```
Expected: `NO JS ERRORS`

- [ ] **Step 6: Commit**

```bash
git add forge-ui.js forge-draw.js
git commit -m "feat(forge): S/R 다중스케일 스윙레벨 클러스터 작도(강조/디밍·터치수), 피벗 P만 참고선"
```

---

### Task 5: structure 작도 — 대/중/소 티어 + HH/HL/LH/LL (시장구조 노드)

**Files:**
- Modify: `forge-ui.js` (add `_anStruct` near `_anPivotDraw`)
- Modify: `forge-draw.js:2694` (dispatch: `_an("Structure", …)` → `_anStruct(price, {swing})`)
- Modify: `forge-draw.js:2329-2344` (rewrite `_drawStructureLayers`)

**Interfaces:**
- Consumes: `ForgeCore.analyzeStructure(price, {swing, draw:true})` → `st.tiers` (Task 3). 드로 헬퍼 `fiToX`·`pToY`·`_evLabel`·`_skReady`(기존).
- Produces: 시각 — 대형 티어 굵은 스윙점+HH/HL/LH/LL 라벨+BOS/CHoCH, 중/소형 디밍.

- [ ] **Step 1: Add `_anStruct` wrapper**

`forge-ui.js`의 `_anPivotDraw` 정의 **다음 줄**에 추가:

```js
  function _anStruct(P, opts) { const o = opts || {}; return _anGet(P, "StructDraw|" + JSON.stringify(o), () => ForgeCore.analyzeStructure(P, Object.assign({}, o, { draw: true }))); }
```

- [ ] **Step 2: Swap structure dispatch to draw wrapper**

`forge-draw.js:2694`의 `const st = _an("Structure", price, { swing: ((n.params && n.params.swing) != null ? n.params.swing : 3) / 100 });` 를 교체:

```js
          const st = _anStruct(price, { swing: ((n.params && n.params.swing) != null ? n.params.swing : 3) / 100 });
```

- [ ] **Step 3: Rewrite `_drawStructureLayers`**

`forge-draw.js:2329-2344` 전체(함수 `_drawStructureLayers` ~ 닫는 `}`)를 교체:

```js
  // 시장구조 노드 — 다중스케일 티어(대/중/소): 스윙점 + HH/HL/LH/LL 라벨(대형 강조) + BOS/CHoCH.
  function _drawStructureLayers(c, st, M) {
    c.save();
    const { fiToX, pToY, nowFi, fiMin = 0, reveal = Infinity, xRight } = M;
    const xR = (xRight != null ? xRight : fiToX(nowFi));
    const tiers = (st.tiers && st.tiers.length) ? st.tiers : null;
    if (!tiers) {   // 폴백(하위호환): 기존 단일 스윙
      if (reveal >= 1) [st.swingHigh, st.swingLow].forEach(sw => { if (!sw) return; const y = pToY(sw.price); if (!isFinite(y)) return; c.strokeStyle = "rgba(240,163,192,.5)"; c.lineWidth = 1; c.setLineDash([4, 3]); c.beginPath(); c.moveTo(fiToX(Math.max(fiMin, sw.idx)), y); c.lineTo(xR, y); c.stroke(); c.setLineDash([]); });
      c.restore(); return;
    }
    tiers.forEach((t, ti) => {
      const emph = ti === 0;   // 대형(유의도 최상위) 강조
      if (reveal < (emph ? 1 : 2)) return;
      const rad = emph ? 3 : ti === 1 ? 2 : 1.4;
      const baseAlpha = emph ? 0.85 : ti === 1 ? 0.45 : 0.22;
      for (const p of (t.swings || [])) {
        const x = fiToX(Math.max(fiMin, p.idx)), y = pToY(p.price);
        if (!isFinite(x) || !isFinite(y)) continue;
        const col = p.type === "H" ? "224,106,106" : "70,194,142";
        c.fillStyle = "rgba(" + col + "," + baseAlpha.toFixed(2) + ")";
        c.beginPath(); c.arc(x, y, rad, 0, 7); c.fill();
        // 라벨은 대형 + 유의도 상위 스윙만(클러터 방지)
        if (emph && _skReady() && p.significance >= 0.5) _evLabel(c, p.label, x, y - (p.type === "H" ? 6 : -12), p.type === "H" ? "#e06a6a" : "#46c28e", "center");
      }
      // BOS/CHoCH 이벤트 라벨
      if (_skReady() && t.event !== "none" && isFinite(t.eventPrice)) {
        const up = t.event.indexOf("up") >= 0, choch = t.event.indexOf("CHoCH") >= 0;
        const y = pToY(t.eventPrice), col = up ? "#46c28e" : "#e06a6a";
        if (isFinite(y)) { c.globalAlpha = emph ? 1 : 0.5; _evLabel(c, (choch ? "CHoCH " : "BOS ") + (up ? "▲" : "▼"), xR - 6, y - 2, col, "right"); c.globalAlpha = 1; }
      }
    });
    c.restore();
  }
```

- [ ] **Step 4: Verify — core tests still green**

Run: `node --test forge-core.test.js 2>&1 | grep "# fail"`
Expected: `# fail 0`

- [ ] **Step 5: Verify — 시각(실 티커 또는 헤드리스)**

- 확인 항목: (a) 콘솔 에러 0, (b) 시장구조 노드 표시 시 대형 스윙점이 굵고 HH/HL/LH/LL 라벨, 중/소형 점은 점점 흐림, (c) BOS/CHoCH 라벨이 대형은 진하게.

헤드리스 스모크:
```bash
BIN=~/.cache/ms-playwright/chromium_headless_shell-*/chrome-headless-shell-linux64/chrome-headless-shell
LP=/tmp/chrlibs:/tmp/chrlibs/usr/lib/x86_64-linux-gnu:/tmp/chrlibs/lib/x86_64-linux-gnu
LD_LIBRARY_PATH=$LP $BIN --headless --no-sandbox --disable-gpu --virtual-time-budget=4000 --dump-dom "file://$PWD/forge.html" 2>&1 | grep -i "error\|is not a function" || echo "NO JS ERRORS"
```
Expected: `NO JS ERRORS`

- [ ] **Step 6: Commit**

```bash
git add forge-ui.js forge-draw.js
git commit -m "feat(forge): structure 다중스케일 티어 작도(대/중/소·HH/HL/LH/LL·BOS/CHoCH 강조/디밍)"
```

---

### Task 6: 캐시버스터 갱신 + 배포

**Files:**
- Modify: `forge.html` (core·ui·draw `?v=` 갱신)

**Interfaces:**
- Consumes: Task 1~5 완료본

- [ ] **Step 1: Bump cache-busters**

`forge.html`에서 수정된 3파일 캐시버스터를 오늘자로 갱신(예 `20260716b`). 현재값 확인 후 증가:
- `forge-core.js?v=…` → `?v=20260716b`
- `forge-ui.js?v=…` → `?v=20260716b`
- `forge-draw.js?v=…` → `?v=20260716b`

Run(현재값 확인): `grep -n "forge-core.js?v\|forge-ui.js?v\|forge-draw.js?v" forge.html`

- [ ] **Step 2: Full test + smoke**

Run: `node --test forge-core.test.js 2>&1 | grep -E "# (tests|pass|fail)"`
Expected: `# fail 0`

- [ ] **Step 3: Commit + push**

```bash
git add forge.html
git commit -m "chore(forge): 다중스케일 S/R·structure 작도 캐시버스터 갱신"
git push origin main
```

- [ ] **Step 4: Deploy to cafe24 (변경 파일만)**

```bash
lftp -u 'parksvc,wjdtjd2@' sftp://parksvc.mycafe24.com <<'EOF'
set sftp:auto-confirm yes
cd www/map
put forge.html
put forge-core.js
put forge-ui.js
put forge-draw.js
cls -l forge.html forge-core.js forge-ui.js forge-draw.js
bye
EOF
```
Expected: 원격 4파일 크기 == 로컬(`stat -c '%n %s' forge.html forge-core.js forge-ui.js forge-draw.js`로 대조). 서버 데이터 파일(forge_*.json) 미변경.

- [ ] **Step 5: 스코어카드 + 백로그 갱신**

- `forge-scorecard.html` 개선이력에 "다중스케일 작도 확장(S/R·structure) — 엔진 불변" 1줄 추가.
- `docs/BACKLOG.md` 항목 0 [확장]의 S/R·structure를 ✅ 완료(커밋 해시)로 이동, 추세선·fib는 후속으로 남김.

```bash
git add forge-scorecard.html docs/BACKLOG.md
git commit -m "docs(forge): 다중스케일 S/R·structure 작도 완료 기록(스코어카드·백로그)"
git push origin main
```
배포: `forge-scorecard.html`도 put(변경 시).

---

## Self-Review 결과

- **Spec 커버리지**: §4.1 collectLevels→Task1 · collectStructure→Task2 · analyzeX draw 분기·export→Task3 · §4.2 래퍼→Task4/5 · §4.3 S/R 작도→Task4 · §4.4 structure 작도→Task5 · §6 테스트→Task1~3 · 캐시버스터/배포/스코어카드→Task6. 전 항목 태스크 존재.
- **Placeholder**: 없음(모든 코드 스텝에 실제 코드).
- **타입 일관성**: `srLevels`(배열·`{price,side,touches,degMin,significance,reason}`)·`tiers`(배열·`{degree,sens,swings,trend,event,eventPrice,significance}`)·`swings[].label`·`swings[].significance` — Task1/2 정의 ↔ Task4/5 소비 일치. 래퍼명 `_anPivotDraw`·`_anStruct` 정의(Task4/5 Step1) ↔ 디스패치 사용(Task4/5 Step2) 일치.
- **미해결**: Task4/5 시각 검증은 실 티커 데이터/헤드리스 주입에 의존 — 정답 게이트는 코어 단위테스트(Task1~3)이고, 드로 태스크는 콘솔 에러 0 + 스크린샷 판단으로 검증(캔버스 작도 특성).
