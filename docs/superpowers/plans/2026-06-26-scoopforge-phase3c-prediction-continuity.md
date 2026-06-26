# 스쿱포지 Phase 3-C 예측 연속성 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 예측 경로가 차트의 마지막 실제 종가에서 연속되도록 앵커링하고(점프 gap 제거), 신뢰구간을 seam에서 좁게 시작해 확대하며, 차트·오버레이가 seam 지점에서 예측을 이어 그린다.

**Architecture:** `forge-core.js`의 `run()`이 forecast와 동일 공식으로 마지막 실값 지점 모델값을 구해 offset을 전체 path에 가산(마지막 종가 통과) + band를 `0.15+0.03k`로 변경 + `prediction.anchor` 반환. `forge.html`의 `fcDrawMain`(메인 차트)과 `drawCone`(오버레이)이 anchor를 받아 seam(predStartX, toY(anchor))에서 예측선·콘을 시작한다.

**Tech Stack:** 바닐라 JS. `node --test map/forge-core.test.js`로 코어 검증. 헤드리스 chrome-headless-shell 스크린샷으로 시각 검증(컨트롤러).

## Global Constraints

- 수정 대상: `map/forge.html`, `map/forge-core.js`, `map/forge-core.test.js`만. **기존 `map/map.html`·`map/chart.html` 불가침.**
- 바닐라 JS, 2 spaces, 큰따옴표, 케밥케이스. 다크 골드 토큰. 한국어 UI. noindex.
- `forge-core.js` DOM-free. 기존 node 테스트 14개 전부 통과 유지.
- `prediction.anchor`는 가산 필드(하위호환: 없으면 차트가 `candles[n-1].c` 폴백).
- 차트 seam 연결은 기존 `fcDrawMain`의 `toX/toY/predStartX` 매핑 재사용(새 매핑 금지).

---

## Task 1: 코어 — 예측 앵커링 + 밴드 + anchor 반환

**Files:**
- Modify: `map/forge-core.js`
- Modify: `map/forge-core.test.js`

**Interfaces:**
- Consumes: 기존 `run`, `linfit`, `detrendNorm`, `evalBlocks`.
- Produces: `run(...).prediction` = `{ path, lo, hi, futW, anchor }`. `anchor = price[n-1]`. path는 마지막 종가를 통과하도록 offset 가산. band = `res*(0.15+0.03*k)`.

- [ ] **Step 1: 테스트 작성 (실패 예정)** — `forge-core.test.js`에 추가:

```js
test("prediction is continuous: anchored at last close, bands widen", () => {
  const price = []; for (let i = 0; i < 240; i++) price.push(100 + 0.5 * i + 3 * Math.sin(2 * Math.PI * i / 40));
  const data = { price, candle: price.map(p => ({ o: p, h: p + 1, l: p - 1, c: p })), orange: [], blue: [], n: price.length };
  const g = { nodes: [
    { id: "p", kind: "block", blockType: "price" },
    { id: "f", kind: "block", blockType: "phasefold", params: { pmin: 20, pmax: 96 } },
    { id: "c", kind: "block", blockType: "combine" },
    { id: "o", kind: "block", blockType: "predict" } ],
    edges: [{from:"p",to:"f"},{from:"f",to:"c"},{from:"c",to:"o"}] };
  const { prediction: pr } = ForgeCore.run(g, data, { futW: 60 });
  assert.strictEqual(pr.anchor, price[price.length - 1]);
  assert.strictEqual(pr.path.length, 60);
  // 시작이 앵커에 가깝고 시간이 갈수록 멀어짐 (점프 아님)
  assert.ok(Math.abs(pr.path[0] - pr.anchor) < Math.abs(pr.path[59] - pr.anchor));
  // 밴드는 seam에서 좁게 시작해 확대
  assert.ok((pr.hi[0] - pr.lo[0]) < (pr.hi[59] - pr.lo[59]));
  assert.ok([...pr.path, ...pr.lo, ...pr.hi].every(v => isFinite(v)));
});
```

- [ ] **Step 2: 실패 확인** — Run: `node --test map/forge-core.test.js`
Expected: FAIL — `pr.anchor`가 undefined → `strictEqual` 실패.

- [ ] **Step 3: 구현** — `forge-core.js` `run()`. 기존 path 루프 블록(현재):
```js
    const path = [], lo = [], hi = [];
    for (let k = 1; k <= futW; k++) {
      const i = n - 1 + k;
      let v = a + b * i;
      if (fmeta) {
        const P = fmeta.best;
        v += Math.sin(2 * Math.PI * i / P) * res * 0.8;
      }
      const band = res * (0.6 + 0.02 * k);
      path.push(v);
      lo.push(v - band);
      hi.push(v + band);
    }
```
를 아래로 교체:
```js
    // forecast와 동일 공식의 모델값 — 마지막 실값에 앵커링(연속성)
    const modelAt = j => a + b * j + (fmeta ? Math.sin(2 * Math.PI * j / fmeta.best) * res * 0.8 : 0);
    const offset = price[n - 1] - modelAt(n - 1);
    const path = [], lo = [], hi = [];
    for (let k = 1; k <= futW; k++) {
      const i = n - 1 + k;
      const v = modelAt(i) + offset;
      const band = res * (0.15 + 0.03 * k);   // seam에서 좁게 시작 → 확대
      path.push(v);
      lo.push(v - band);
      hi.push(v + band);
    }
```
반환의 prediction에 `anchor` 추가:
```js
      values, meta, prediction: { path, lo, hi, futW, anchor: price[n - 1] }, signal: sigB,
```

- [ ] **Step 4: 통과 확인** — Run: `node --test map/forge-core.test.js`
Expected: PASS (전체, 기존 14 + 신규 1).

- [ ] **Step 5: 커밋**
```bash
git add map/forge-core.js map/forge-core.test.js
git commit -m "feat(forge): 예측 앵커링(마지막 종가 통과) + 밴드 seam 시작 + prediction.anchor"
```

---

## Task 2: 차트·오버레이 — seam에서 예측 시작

**Files:**
- Modify: `map/forge.html`

**Interfaces:**
- Consumes: `fcDrawMain(candles, signal, predPath, predLo, predHi, futW)` (현재 시그니처), `renderChart`(1521에서 `fcDrawMain` 호출), `drawCone(result)`(오버레이), `result.prediction.anchor`(Task 1), `toX/toY/predStartX`(fcDrawMain 내부), `fcMap`/`M`(drawCone 내부).
- Produces: 예측 콘·예측선이 seam(predStartX, toY(anchor))에서 시작해 연속.

- [ ] **Step 1: `fcDrawMain`에 anchor 인자 추가 + 호출부 전달** — 시그니처를 `fcDrawMain(candles, signal, predPath, predLo, predHi, futW, predAnchor)`로 변경. 1521의 호출을:
```js
    fcDrawMain(candles, result.signal || [], pred.path, pred.lo, pred.hi, pred.futW || 0, pred.anchor);
```

- [ ] **Step 2: 콘·예측선을 seam에서 시작** — `fcDrawMain`의 prediction cone 블록(현재):
```js
    if (predPath.length) {
      /* filled band lo–hi */
      c.beginPath();
      c.moveTo(toX(n), toY(predHi[0]));
      for (let k = 0; k < predPath.length; k++) c.lineTo(toX(n + k), toY(predHi[k]));
      for (let k = predPath.length - 1; k >= 0; k--) c.lineTo(toX(n + k), toY(predLo[k]));
      c.closePath();
      c.fillStyle = "rgba(232,180,99,.14)";
      c.fill();
      /* path line */
      c.strokeStyle = FC_GOLD; c.lineWidth = 1.8; c.setLineDash([5, 4]);
      c.beginPath(); let pf = true;
      for (let k = 0; k < predPath.length; k++) {
        const px = toX(n + k), py = toY(predPath[k]);
        if (pf) { c.moveTo(px, py); pf = false; } else c.lineTo(px, py);
      }
      c.stroke(); c.setLineDash([]);
      /* seam dot at last real close */
      const lastClose = candles[n - 1].c;
      c.fillStyle = FC_GOLD; c.beginPath();
      c.arc(predStartX, toY(lastClose), 3, 0, Math.PI * 2); c.fill();
    }
```
를 아래로 교체(콘·선이 seam의 anchor에서 출발):
```js
    if (predPath.length) {
      const anchorV = (predAnchor != null) ? predAnchor : candles[n - 1].c;
      const anchorY = toY(anchorV);
      /* filled band lo–hi (seam에서 시작) */
      c.beginPath();
      c.moveTo(predStartX, anchorY);
      for (let k = 0; k < predPath.length; k++) c.lineTo(toX(n + k), toY(predHi[k]));
      for (let k = predPath.length - 1; k >= 0; k--) c.lineTo(toX(n + k), toY(predLo[k]));
      c.lineTo(predStartX, anchorY);
      c.closePath();
      c.fillStyle = "rgba(232,180,99,.14)";
      c.fill();
      /* path line (seam에서 시작) */
      c.strokeStyle = FC_GOLD; c.lineWidth = 1.8; c.setLineDash([5, 4]);
      c.beginPath();
      c.moveTo(predStartX, anchorY);
      for (let k = 0; k < predPath.length; k++) c.lineTo(toX(n + k), toY(predPath[k]));
      c.stroke(); c.setLineDash([]);
      /* seam dot at last real close */
      c.fillStyle = FC_GOLD; c.beginPath();
      c.arc(predStartX, anchorY, 3, 0, Math.PI * 2); c.fill();
    }
```

- [ ] **Step 3: 오버레이 `drawCone`도 seam에서 시작** — `drawCone`의 콘 채움 시작점을 anchor로 보정. 현재:
```js
    ctx.beginPath();
    ctx.moveTo(M.toX(M.n), M.toY(pred.hi[0]));
    for (let k = 0; k < np; k++) ctx.lineTo(M.toX(M.n + k), M.toY(pred.hi[k]));
    for (let k = np - 1; k >= 0; k--) ctx.lineTo(M.toX(M.n + k), M.toY(pred.lo[k]));
    ctx.closePath();
```
를:
```js
    const aV = (pred.anchor != null) ? pred.anchor : candles[candles.length - 1].c;
    const aY = M.toY(aV);
    ctx.beginPath();
    ctx.moveTo(M.predStartX, aY);
    for (let k = 0; k < np; k++) ctx.lineTo(M.toX(M.n + k), M.toY(pred.hi[k]));
    for (let k = np - 1; k >= 0; k--) ctx.lineTo(M.toX(M.n + k), M.toY(pred.lo[k]));
    ctx.lineTo(M.predStartX, aY);
    ctx.closePath();
```
(centerline path가 별도로 그려지면 그 시작점도 `M.moveTo(M.predStartX, aY)`로 prepend — drawCone 내 centerline 루프 시작에 동일 보정.)

- [ ] **Step 4: 헤드리스 시각 검증 + 커밋** — 컨트롤러: forge.html 부팅 후 메인 차트의 "지금" seam에서 예측 콘/선이 마지막 캔들 종가와 **이어져** 시작(점프 없음), 오버레이 콘도 정렬. 스크린샷 확인.
```bash
git add map/forge.html
git commit -m "feat(forge): 차트·오버레이 예측을 seam(마지막 종가)에서 연속 시작"
```

---

## Self-Review (작성자 점검)

**Spec coverage:**
- §2 코어 앵커링(offset, 동일 공식 modelAt)+밴드(0.15+0.03k)+anchor 반환 → Task 1. ✅
- §3 렌더(fcDrawMain seam 시작 + drawCone seam 시작, 좌표 재사용) → Task 2. ✅
- §4 계약(prediction.anchor 가산, 폴백) → Task 1(반환)·Task 2(폴백). ✅
- §5 테스트(anchor·연속·밴드확대·유한) → Task 1 Step1. ✅
- §7 동일 공식 동기(modelAt 헬퍼로 1곳) → Task 1 구현. 좌표 재사용 → Task 2. ✅

**Placeholder scan:** 코어·렌더 모두 실제 코드(교체 전/후 블록 명시). 시각 검증은 컨트롤러 헤드리스(브라우저 캔버스 픽셀은 자동 단언 어려움 — 육안). 플레이스홀더 없음.

**Type consistency:** `prediction.anchor`(number) Task1 반환 ↔ Task2 소비 일치. `modelAt(j)`·`offset`·band식 일관. `fcDrawMain` 신규 인자 `predAnchor` ↔ 호출부 `pred.anchor` 일치. `drawCone`의 `pred.anchor`·`candles[..].c` 폴백 일관.
