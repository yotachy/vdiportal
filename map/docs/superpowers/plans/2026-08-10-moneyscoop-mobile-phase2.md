# 머니스쿱 모바일 Phase 2 — PC 예측선 작도 포팅 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 모바일 예측선이 PC와 같은 계산(S/R 반응 꿈틀 · 구간 신뢰도 페이드 · 끝점 진앙/라벨)을 거쳐 그려지게 한다.

**Architecture:** `forge-draw.js`의 예측선 폐포 21심볼을 신규 `mobile/www/draw-preds.js`(`MSPreds`)로 원문 복사한다. 단, 라벨 충돌 레지스트리는 복사하지 않고 Phase 1 `draw-layers.js`(`MSLayers`)의 것을 **한 벌 공유**한다 — 복사하면 끝점 라벨이 지표 배지를 못 보고 겹쳐 그린다. `chart-draw.js`의 `drawCone`이 `MSPreds`를 경유하도록 배선하고, `report.js`의 프레임 합성 순서를 고쳐 `resetLabels`를 맨 앞으로 옮긴다.

**Tech Stack:** 순수 UMD 바닐라 JS(빌드 도구 없음) · `node --test` · recording-ctx 페인트 단언

**설계 원본:** [`specs/2026-08-10-moneyscoop-mobile-phase2-design.md`](../specs/2026-08-10-moneyscoop-mobile-phase2-design.md)

## Global Constraints

- **`map/forge-draw.js`는 한 줄도 수정하지 않는다.** 작도는 엔진과 달리 단일 원본이 아니다(표현이지 분석이 아니며 폼팩터가 다르다). 숫자는 여전히 `forge-core.js` 단일 원본이다.
- **`mobile/www/vendor/`는 절대 손대지 않는다.** `sync-engine.mjs`가 만드는 gitignore 생성물이다.
- **테스트 관문은 항상 `map/tests/run.sh`** (또는 빠른 확인용 `./tests/run.sh mobile`). `node --test`만 단독으로 돌리지 말 것.
- **UMD 규약**: `module.exports` / `root.MSXxx` 양쪽. `defer`/`async` 금지, `index.html` 스크립트 순서 고정.
- **코드 스타일**: `forge-draw.js`에서 가져온 블록은 **원문 그대로**(ES6 `const`/화살표 유지) `/* ===== 원문 복사 ===== */` 마커 안에. 심(shim)·공개 API는 모바일 파일 관례대로 `var`/`function`.
- **UI 텍스트는 한국어.** 주석은 WHY만.
- **커밋+푸시 한 세트** (모바일은 스토어 릴리스 트랙이라 cafe24 배포 대상 아님).

## 설계서와 달라지는 3가지 (구현 판단 — 그대로 따를 것)

1. **`_fitBoxY`는 `draw-layers.js`에 없다.** 설계서 §3.1이 "이미 존재한다"고 적은 8심볼 중 `_fitBoxY`만 미포팅이다(실측: `draw-layers.js`에 문자열 자체가 없음). Task 1에서 `forge-draw.js:1300-1310`을 `draw-layers.js`로 포팅한다 — 레지스트리(`_axisLabelBoxes`/`_predLabelBoxes`)를 소유한 파일에 두는 것이 맞다.
2. **`confAt`의 시그니처는 `(lo, hi, k)`다.** 설계서 §4가 적은 `confAt(k, n)`으로는 신뢰도를 계산할 수 없다 — 신뢰도의 정의 자체가 밴드 폭(`lo`/`hi`) 함수이기 때문이다. PC 원문 시그니처를 쓴다. 같은 이유로 `epicenter`의 4번째 인자는 반지름이 아니라 **`col`, 5번째가 `scale`**이다(PC `_epicenterMark(c,x,y,col,scale)`).
3. **매끈한 폴백 조건은 `tex` 없음이 아니라 `tex`·`levels` **둘 다** 없음이다.** 꿈틀의 주항은 S/R 반응(`_SR_W=1.0`)이고 이건 `levels`가 만든다 — `tex`만 없다고 원본 `vals`를 돌려주면 주항을 통째로 버린다. PC는 `tex`가 없을 때 PRNG로 결을 **지어내는데**, 그건 데이터가 아니라 발명이므로 모바일은 하지 않는다. 결론: **원자재가 하나라도 있으면 PC 계산, 둘 다 없으면 원본 그대로.** (엔진 실측상 `tex`(길이 `futW+1`)·`levels`는 매 실행 항상 제공된다.)

## File Structure

| 파일 | 책임 | 상태 |
|---|---|---|
| `mobile/www/draw-preds.js` | 꿈틀 수열·구간 신뢰도·페이드 스트로크·진앙·끝점 장식. `MSPreds` | **신규** |
| `mobile/www/draw-layers.js` | 가격 패널 지표 오버레이 + **라벨 충돌 레지스트리 소유·개방** | 수정 |
| `mobile/www/chart-draw.js` | 캔들·콘·축·크로스헤어 — 예측선을 `MSPreds` 경유로 | 수정 |
| `mobile/www/screens/report.js` | 프레임 합성 순서 정정 + `sym`/`tf` 전달 | 수정 |
| `mobile/www/index.html` | `draw-preds.js` 스크립트 태그 | 수정 |
| `mobile/test/draw-preds.test.mjs` | 순수 함수 값 검증 + 페인트 단언 | **신규** |
| `mobile/test/draw-layers.test.mjs` | 레지스트리 공유 계약 | 수정 |
| `mobile/test/chart-draw.test.mjs` | 티어 계약(스트로크 수 → 색 집합으로 재정의) | 수정 |

---

### Task 1: 라벨 레지스트리를 한 벌로 — `draw-layers.js` 개방

설계서 §3.1의 유일한 Phase 1 파일 수정. `_fitBoxY`를 포팅하고, `MSPreds`가 쓸 최소 접근자를 노출한다.

**Files:**
- Modify: `mobile/www/draw-layers.js:20`(복사 범위 주석) · `:74`(뒤에 `_fitBoxY` 삽입) · `:271-273`(export)
- Test: `mobile/test/draw-layers.test.mjs`

**Interfaces:**
- Consumes: (없음 — Phase 1 기존 파일)
- Produces: `MSLayers.evLabel(c, text, x, y, color, align, force) -> void` · `MSLayers.fitBoxY(bx, by, bw, bh, boxes, minY, maxY) -> number|null` · `MSLayers.evBoxes() -> Box[]` · `MSLayers.axisBoxes() -> Box[]` · `MSLayers.predBoxes() -> Box[]` · `MSLayers.reservePredBox(box) -> void`. `Box = {x, y, w, h}`.

> **축 눈금은 일부러 등록하지 않는다.** 모바일 축 라벨은 우측 거터(`x > plot.x + plot.w`)에 있고 끝점 라벨은 플롯 안쪽(`ex - 10` 왼쪽)에 놓이므로 두 박스는 x 범위가 겹칠 수 없다 — 등록해도 관측 가능한 효과가 0인 기계장치가 된다. `axisBoxes()`는 PC 원문 계약(`_axisLabelBoxes.concat(_predLabelBoxes)`)을 그대로 쓰기 위해 비어 있는 채로 노출만 한다.

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`mobile/test/draw-layers.test.mjs` 맨 끝(현재 64행 뒤)에 추가:

```js
// ── 라벨 레지스트리 공유 계약(Phase 2) — 두 벌이 되면 끝점 라벨이 지표 배지를 못 보고 겹친다 ──
test("fitBoxY 는 빈 자리면 그대로, 충돌하면 밀고, 못 놓으면 null", () => {
  assert.equal(L.fitBoxY(0, 50, 100, 14, [], 0, 500), 50, "충돌이 없으면 원하는 y 그대로");
  const pushed = L.fitBoxY(0, 50, 100, 14, [{ x: 0, y: 45, w: 100, h: 14 }], 0, 500);
  assert.ok(pushed != null && pushed !== 50, "충돌했는데 안 밀렸다");
  assert.equal(L.fitBoxY(0, 10, 100, 14, [{ x: 0, y: 0, w: 100, h: 40 }], 0, 30), null, "공간이 없으면 null(겹쳐 찍지 않는다)");
});

test("reservePredBox 는 근거 라벨 레지스트리에도 등록된다 — 분리되면 겹쳐 그린다", () => {
  const c = recCtx(); L.resetLabels(372, 520);
  L.reservePredBox({ x: 200, y: 20, w: 160, h: 18 });
  assert.equal(L.predBoxes().length, 1, "예측 배지 박스 미등록");
  assert.equal(L.evBoxes().length, 1, "근거 라벨이 예측 배지를 못 본다 — 레지스트리가 두 벌이다");
  L.evLabel(c, "목표 12,345", 360, 34, "#e8b463", "right", true);
  const boxes = L.evBoxes();
  assert.equal(boxes.length, 2, "근거 라벨이 등록되지 않았다");
  const a = boxes[0], b = boxes[1];
  assert.ok(!(a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y),
            "예측 배지와 근거 라벨이 겹쳤다");
});

test("resetLabels 는 세 레지스트리를 모두 비운다", () => {
  L.resetLabels(372, 520);
  L.reservePredBox({ x: 0, y: 0, w: 10, h: 10 });
  L.resetLabels(372, 520);
  assert.equal(L.predBoxes().length, 0);
  assert.equal(L.evBoxes().length, 0);
  assert.equal(L.axisBoxes().length, 0);
});
```

- [ ] **Step 2: 실패를 확인한다**

Run: `cd map/mobile && node --test test/draw-layers.test.mjs`
Expected: FAIL — `TypeError: L.fitBoxY is not a function`

- [ ] **Step 3: `_fitBoxY` 포팅 + export 확장**

`mobile/www/draw-layers.js:20`의 복사 범위 주석에 `1295-1311`을 추가:

```js
  /* ===== 여기부터 forge-draw.js 원문 복사 (7-9, 35-36, 1278-1286, 1295, 1300-1311, 1310-1311, 1836, 1838-1867, 1923-1947, 2002-2011, 2117-2175, 2361-2381, 2383-2413, 2545-2571, 2573-2580) ===== */
```

`_evLabel` 함수가 끝나는 `:74`(닫는 `}`) 바로 뒤, `_drawProjLine` 앞에 삽입:

```js
  /* 라벨 박스 배치 — 충돌하면 위/아래 계단으로 밀어 빈 슬롯을 찾는다. 못 놓으면 null(겹쳐 찍지 않고 생략).
     _evLabel 의 내부 회피와 같은 규칙을 예측 배지에서도 쓰기 위해 공용 헬퍼로 분리. */
  function _fitBoxY(bx, by, bw, bh, boxes, minY, maxY) {
    const ov = yy => boxes.some(r => bx < r.x + r.w && bx + bw > r.x && yy < r.y + r.h && yy + bh > r.y);
    if (!ov(by)) return by;
    for (let stp = 1; stp <= 14; stp++)
      for (const dr of [-1, 1]) {
        const ny = by + dr * stp * (bh + 2);
        if (ny >= minY && ny <= maxY - bh && !ov(ny)) return ny;
      }
    return null;
  }
```

`:271-273`의 return 문을 교체:

```js
  // MSPreds 가 쓸 최소 접근자. 배열은 resetLabels 가 매 프레임 새로 만들므로
  // 참조를 캐싱하지 말고 호출 시점에 꺼낸다(그래서 값이 아니라 getter 함수로 낸다).
  return { resetLabels: resetLabels,
           evLabel: _evLabel, fitBoxY: _fitBoxY,
           evBoxes: function () { return _evLabelBoxes; },
           axisBoxes: function () { return _axisLabelBoxes; },
           predBoxes: function () { return _predLabelBoxes; },
           reservePredBox: function (b) { _predLabelBoxes.push(b); _evLabelBoxes.push(b); },
           ma: _drawMALayers, bollinger: _drawBollingerLayers,
           rsiBadge: _drawRsiLayers, macdBadge: _drawMacdLayers, volumeBadge: _drawVolumeLayers };
```

- [ ] **Step 4: 통과를 확인한다**

Run: `cd map && ./tests/run.sh mobile`
Expected: PASS — moneyscoop-mobile 43건(기존 40 + 3)

- [ ] **Step 5: 커밋**

```bash
git add mobile/www/draw-layers.js mobile/test/draw-layers.test.mjs
git commit -m "mobile(p2): 라벨 레지스트리 공유 개방 — _fitBoxY 포팅 + 접근자 노출"
```

---

### Task 2: `draw-preds.js` — 신뢰도 · 꿈틀 · 시드

순수 계산부만. 캔버스를 건드리지 않으므로 **값으로** 검증한다.

**Files:**
- Create: `mobile/www/draw-preds.js`
- Test: `mobile/test/draw-preds.test.mjs`

**Interfaces:**
- Consumes: `MSLayers`(Task 1) — 이 태스크에선 팩토리 인자로 받기만 하고 쓰지 않는다. `ForgeCore.calibrateUpProb`(Task 4에서 사용).
- Produces:
  - `MSPreds.seed(sym, tf) -> uint32`
  - `MSPreds.confAt(lo, hi, k) -> number` (0..1)
  - `MSPreds.confSeq(lo, hi) -> { conf: number[], kEnd: number }`
  - `MSPreds.wigSeq(n, vals, lo, hi, levels, tex, sd) -> number[]` ([-1,1] 정규화 수열)
  - `MSPreds.wiggle(n, vals, lo, hi, levels, tex, sd) -> number[]` (꿈틀 적용된 **가격**값 수열, 밴드 클램프됨)

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`mobile/test/draw-preds.test.mjs` 신규:

```js
import { test } from "node:test";
import assert from "node:assert";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const P = require("../www/draw-preds.js");

// 밴드가 벌어지는 예측(신뢰도가 실제로 감쇠하는 형태)
function band(n) {
  const lo = [], hi = [], vals = [];
  for (let k = 0; k < n; k++) { vals.push(100 + k * 0.4); lo.push(100 - (k + 1) * 0.9); hi.push(100 + (k + 1) * 1.1); }
  return { vals, lo, hi };
}
const LEVELS = [98, 101, 104, 107];
const TEX = Array.from({ length: 25 }, (_, i) => Math.sin(i * 0.7) * 0.01);

test("seed 는 심볼+주기에 결정론적이고, 다르면 갈라진다", () => {
  assert.equal(P.seed("AAPL", "1day"), P.seed("AAPL", "1day"));
  assert.notEqual(P.seed("AAPL", "1day"), P.seed("MSFT", "1day"));
  assert.notEqual(P.seed("AAPL", "1day"), P.seed("AAPL", "1week"));
  assert.ok(Number.isInteger(P.seed("AAPL", "1day")) && P.seed("AAPL", "1day") >= 0);
});

test("confAt 은 0..1 유한값이고 밴드가 벌어질수록 단조 감소한다", () => {
  const { lo, hi } = band(24);
  let prev = Infinity;
  for (let k = 0; k < 24; k++) {
    const v = P.confAt(lo, hi, k);
    assert.ok(isFinite(v) && v >= 0 && v <= 1, "k=" + k + " conf=" + v);
    assert.ok(v <= prev + 1e-12, "k=" + k + " 에서 신뢰도가 되레 올라갔다");
    prev = v;
  }
});

test("confSeq 는 길이를 보존하고 kEnd 를 0..n 안에 둔다", () => {
  const { lo, hi } = band(24);
  const cs = P.confSeq(lo, hi);
  assert.equal(cs.conf.length, 24);
  assert.ok(cs.kEnd > 0 && cs.kEnd <= 24, "kEnd=" + cs.kEnd);
  assert.ok(cs.conf.every(isFinite));
});

test("confSeq 는 밴드가 안 벌어지면 감쇠 없이 전부 1 · kEnd=n", () => {
  const lo = [99, 99, 99], hi = [101, 101, 101];
  const cs = P.confSeq(lo, hi);
  assert.deepEqual(cs.conf, [1, 1, 1]);
  assert.equal(cs.kEnd, 3);
});

test("wiggle 은 같은 시드·입력이면 같은 수열을 준다 — 프레임마다 흔들리면 지직거린다", () => {
  const { vals, lo, hi } = band(24);
  const a = P.wiggle(24, vals, lo, hi, LEVELS, TEX, 12345);
  const b = P.wiggle(24, vals, lo, hi, LEVELS, TEX, 12345);
  assert.deepEqual(a, b);
});

test("wiggle 은 시드가 다르면 다른 수열을 준다", () => {
  const { vals, lo, hi } = band(24);
  const a = P.wiggle(24, vals, lo, hi, LEVELS, null, 1);
  const b = P.wiggle(24, vals, lo, hi, LEVELS, null, 999);
  assert.notDeepEqual(a, b);
});

test("wiggle 은 길이를 보존하고 NaN 을 내지 않으며 밴드 안에 머문다", () => {
  const { vals, lo, hi } = band(24);
  const w = P.wiggle(24, vals, lo, hi, LEVELS, TEX, 7);
  assert.equal(w.length, 24);
  w.forEach((v, k) => {
    assert.ok(isFinite(v), "k=" + k + " 가 NaN");
    assert.ok(v >= lo[k] - 1e-9 && v <= hi[k] + 1e-9, "k=" + k + " 가 밴드 밖: " + v);
  });
});

test("tex·levels 가 둘 다 없으면 원본 vals 를 그대로 돌려준다 — 결을 지어내지 않는다", () => {
  const { vals, lo, hi } = band(24);
  assert.deepEqual(P.wiggle(24, vals, lo, hi, null, null, 7), vals);
  assert.deepEqual(P.wiggle(24, vals, lo, hi, [], undefined, 7), vals);
});

test("tex 만 없어도 levels 가 있으면 계산한다 — 꿈틀의 주항은 S/R 반응이다", () => {
  const { vals, lo, hi } = band(24);
  const w = P.wiggle(24, vals, lo, hi, LEVELS, null, 7);
  assert.ok(w.some((v, k) => Math.abs(v - vals[k]) > 1e-9), "levels 가 있는데 매끈하다");
});

test("wigSeq 는 레벨 위에서 반응이 최대, 레벨 사이에서 최소다", () => {
  // 100→110 등간격 램프 · 레벨 [100,110] → k=0 은 레벨 위(|pull|=1), k=5 는 정확히 중간(pull≈0)
  const n = 11, vals = Array.from({ length: n }, (_, k) => 100 + k);
  const lo = vals.map(v => v - 2), hi = vals.map(v => v + 2);
  const seq = P.wigSeq(n, vals, lo, hi, [100, 110], null, 42);
  assert.equal(seq.length, n);
  assert.ok(seq.every(v => isFinite(v) && Math.abs(v) <= 1 + 1e-9), "[-1,1] 정규화가 깨졌다");
  assert.ok(Math.abs(seq[0]) > Math.abs(seq[5]), "레벨 위 반응이 레벨 사이보다 작다");
});
```

- [ ] **Step 2: 실패를 확인한다**

Run: `cd map/mobile && node --test test/draw-preds.test.mjs`
Expected: FAIL — `Cannot find module '../www/draw-preds.js'`

- [ ] **Step 3: `draw-preds.js` 생성**

```js
// PC 스쿱포지 forge-draw.js 에서 포팅 — 예측선 꿈틀 · 구간 신뢰도 · 페이드 스트로크 · 끝점 장식.
// 모바일 예측선이 매끈한 직선이었던 건 스타일이 아니라 이 계산을 안 해서였다.
// 엔진은 prediction.tex(AR 질감)·prediction.levels(S/R)를 원자재로 넘기고, 꿈틀은 여기서 만든다.
// 라벨 충돌 레지스트리는 draw-layers.js 한 벌을 공유한다 — 복사하면 두 벌이 되어
// 끝점 라벨이 지표 배지를 못 보고 겹쳐 그린다(설계 §3.1).
// 원본 심볼: _CONF_HORIZON _predBandW _predConfAt _predHorizonK _predPCal _mulberry32
//           _SR_W _AR_W _predWigSeqSR _predWigVal _predConfSeq _strokePredLine
//           _epicenterMark _predEndDeco
//           (+ forge-app.js: _hzFmt _normCdf _upProb _hzList · forge-draw.js:3363 _tfUnit)
(function (root, factory) {
  if (typeof module !== "undefined" && module.exports)
    module.exports = factory(require("./draw-layers.js"), require("../../forge-core.js"));
  else root.MSPreds = factory(root.MSLayers, root.ForgeCore);
})(typeof self !== "undefined" ? self : this, function (Layers, FCore) {
  "use strict";

  // ── 심: PC 가 전역/다른 파일에서 받던 것들 ──
  // 시드는 심볼+주기로 고정한다(설계 §5). 크로스헤어·리사이즈로 매 프레임 다시 그려도
  // 같은 종목·같은 주기면 같은 꿈틀이다. 새 분석 결과는 vals 가 바뀌므로 시드를 흔들 필요가 없다.
  function seed(sym, tf) {
    var s = String(sym || "") + "|" + String(tf || ""), h = 2166136261 >>> 0, i;
    for (i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
    return h >>> 0;
  }

  /* ===== 여기부터 forge-draw.js 원문 복사 (47-52, 56-69, 80-122) ===== */
  const _CONF_HORIZON = 0.5;   // 이 아래로 떨어지는 첫 봉부터 선을 잇지 않고 점묘로 해체
  function _predBandW(loK, hiK) {
    if (!(loK > 0) || !(hiK > loK)) return 0;
    const w = Math.log(hiK / loK);
    return isFinite(w) && w > 0 ? w : 0;
  }
  // 총 밴드 확장분 중 어디까지 왔나(0=아직 안 벌어짐 → 1=끝까지 벌어짐)를 뒤집은 값.
  // W(0) 나눗셈은 쓰지 않는다 — 엔진이 콘을 seam 에서 인위적으로 좁게 시작시켜 W(0)이 왜곡돼 있고,
  // 그걸 기준으로 삼으면 예측 대부분이 즉시 점묘로 무너진다. W 는 단조 증가라 감쇠는 여전히 보장된다.
  function _predConfAt(lo, hi, k) {
    const n = lo.length; if (!(n > 0)) return 0;
    const w0 = _predBandW(lo[0], hi[0]), we = _predBandW(lo[n - 1], hi[n - 1]), wk = _predBandW(lo[k], hi[k]);
    if (!(wk > 0)) return 0;
    const span = we - w0;
    if (!(span > 0)) return 1;   // 밴드가 안 벌어지는 예측 = 감쇠 없음
    return Math.max(0, Math.min(1, 1 - (wk - w0) / span));
  }
  // 신뢰 지평 = conf 가 임계 아래로 처음 떨어지는 봉. k=0 은 반환하지 않음(seam 선과 겹치면 판독 불가).
  function _predHorizonK(lo, hi) {
    if (!lo || !hi || !lo.length) return null;
    for (let k = 1; k < lo.length; k++) if (_predConfAt(lo, hi, k) < _CONF_HORIZON) return k;
    return null;
  }
  function _mulberry32(a) { return function () { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }   // 결정론 PRNG(시드→재현)
  // 계산된 꿈틀: S/R 자석 반응(꺾임=실제 레벨) + AR 결(종목 실제 단기 자기상관).
  // center=예측 중앙값 배열, levels=엔진 S/R가격, tex=엔진 AR2 질감(nullable). → [-1,1] 정규화 시퀀스.
  const _SR_W = 1.0, _AR_W = 0.4;   // 조정 상수: S/R 반응(꺾임=레벨) 비중 · AR 결(레벨 사이 미세) 비중
  function _predWigSeqSR(n, center, lo, hi, levels, tex, seed) {
    // 예측선이 지나는 가격범위 안의 유의 레벨(정렬·근접중복 제거) — 이 레벨들이 반등/하락 지점이 됨
    let cMin = Infinity, cMax = -Infinity; for (let k = 0; k < n; k++) { if (center[k] < cMin) cMin = center[k]; if (center[k] > cMax) cMax = center[k]; }
    const pad = (cMax - cMin) * 0.15 || 1, tol = (cMax - cMin) * 0.01 || 1e-6;
    const rel = (Array.isArray(levels) ? levels : []).filter(v => isFinite(v) && v > cMin - pad && v < cMax + pad).sort((a, b) => a - b);
    const uniq = []; for (const L of rel) if (!uniq.length || L - uniq[uniq.length - 1] > tol) uniq.push(L);   // 근접 중복 제거
    // AR 결: 엔진 tex(실데이터 자기상관) 우선, 없으면 최소 시드 결
    const rnd = _mulberry32(seed >>> 0), ar = new Array(n); let x = 0, arMax = 1e-9;
    for (let k = 0; k < n; k++) { if (tex && isFinite(tex[k])) ar[k] = tex[k]; else { x = x * 0.7 + (rnd() * 2 - 1) * 0.5; ar[k] = x; } const a = Math.abs(ar[k]); if (a > arMax) arMax = a; }
    // S/R 반응: center 가 지나는 레벨을 위상 경계로 → 각 레벨에서 위상이 π만큼 진행, cos 로 레벨에 극값(반등/하락) 배치
    const out = new Array(n); let mx = 1e-9;
    for (let k = 0; k < n; k++) {
      const c0 = center[k];
      let pull = 0;
      if (uniq.length) {
        let iLo = -1; for (let j = 0; j < uniq.length; j++) { if (uniq[j] <= c0) iLo = j; else break; }
        const La = iLo >= 0 ? uniq[iLo] : (cMin - pad), Lb = iLo + 1 < uniq.length ? uniq[iLo + 1] : (cMax + pad), idx = iLo + 1;   // 아래 레벨 인덱스(경계 포함)
        const prog = (Lb > La) ? (c0 - La) / (Lb - La) : 0;                 // 아래 레벨→위 레벨 진행도
        pull = Math.cos((idx + Math.max(0, Math.min(1, prog))) * Math.PI);  // 레벨(정수 위상)에서 |pull|=1(극값) · 사이에서 0통과
      }
      out[k] = _SR_W * pull + _AR_W * (ar[k] / arMax);
      const a = Math.abs(out[k]); if (a > mx) mx = a;
    }
    for (let k = 0; k < n; k++) out[k] /= mx;   // [-1,1]
    return out;
  }
  // 꿈틀 y값(가격): center + 진폭·워크값(wv∈[-1,1])·신뢰도(conf), 밴드[lo,hi] 하드 클램프.
  function _predWigVal(center, loK, hiK, wv, conf) {
    const amp = 0.5 * ((hiK - loK) / 2), cf = (conf == null || !isFinite(conf)) ? 1 : conf;
    const v = center + amp * wv * cf;
    return Math.max(loK, Math.min(hiK, v));
  }
  // 봉별 신뢰도 배열 + 실선/점묘 경계. 1·2·3차가 같은 계산을 쓰도록 한 곳에 둔다.
  function _predConfSeq(lo, hi) {
    const n = lo.length, cf = new Array(n);
    for (let k = 0; k < n; k++) cf[k] = _predConfAt(lo, hi, k);
    const kh = _predHorizonK(lo, hi);
    return { conf: cf, kEnd: (kh == null) ? n : kh };
  }
  /* ===== 원문 복사 끝 ===== */

  // 꿈틀 적용된 가격 수열. 호출부가 pToY 로 화면좌표로 옮긴다.
  // 폴백: tex 도 levels 도 없으면 꿈틀을 만들 근거가 아예 없다 → 원본 그대로(매끈).
  // PC 는 tex 가 없을 때 PRNG 결을 지어내지만 그건 데이터가 아니라 발명이다.
  // levels 만 있어도 계산한다 — 꿈틀의 주항(_SR_W=1.0)이 바로 그 S/R 반응이기 때문이다.
  function wiggle(n, vals, lo, hi, levels, tex, sd) {
    var out = new Array(n), k;
    var hasTex = !!(tex && tex.length), hasLv = !!(levels && levels.length);
    if (!hasTex && !hasLv) { for (k = 0; k < n; k++) out[k] = vals[k]; return out; }
    var seq = _predWigSeqSR(n, vals, lo, hi, levels, tex, sd);
    var cs = _predConfSeq(lo, hi);
    for (k = 0; k < n; k++) out[k] = _predWigVal(vals[k], lo[k], hi[k], seq[k], cs.conf[k]);
    return out;
  }

  return { seed: seed,
           confAt: _predConfAt, confSeq: _predConfSeq,
           wigSeq: _predWigSeqSR, wiggle: wiggle };
});
```

- [ ] **Step 4: 통과를 확인한다**

Run: `cd map && ./tests/run.sh mobile`
Expected: PASS — moneyscoop-mobile 53건(43 + 10)

- [ ] **Step 5: 커밋**

```bash
git add mobile/www/draw-preds.js mobile/test/draw-preds.test.mjs
git commit -m "mobile(p2): 꿈틀 수열·구간 신뢰도·결정론 시드 포팅"
```

---

### Task 3: 페이드 스트로크 — 선을 실제로 긋는 곳

`_strokePredLine`. 신뢰 구간은 봉별 알파·굵기 세그먼트 실선, 지평 이후는 점묘.

**Files:**
- Modify: `mobile/www/draw-preds.js` (원문 복사 블록 끝에 추가 + export)
- Test: `mobile/test/draw-preds.test.mjs`

**Interfaces:**
- Consumes: `_predConfSeq`(Task 2)
- Produces: `MSPreds.strokeLine(c, o) -> void`. `o = { n, x0, y0, xAt(k), yAt(k), conf[], kEnd, rgb: "r,g,b", dash: number[]|null, lw: number }`

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`mobile/test/draw-preds.test.mjs` 끝에 추가:

```js
// ── 페이드 스트로크 ──
function recCtx() {
  const calls = [], st = { fillStyle: null, strokeStyle: null, lineWidth: null, globalAlpha: 1, font: null, textAlign: null, letterSpacing: null, lineJoin: null, lineCap: null };
  const rec = n => (...a) => calls.push({ op: n, args: a, fill: st.fillStyle, stroke: st.strokeStyle, lw: st.lineWidth, font: st.font });
  const c = {};
  for (const n of ["save","restore","beginPath","closePath","moveTo","lineTo","fill","stroke","fillRect","arc","setLineDash","fillText","rect","clip","translate","roundRect"]) c[n] = rec(n);
  c.measureText = t => ({ width: String(t).length * 6 });
  for (const k of Object.keys(st)) Object.defineProperty(c, k, { get: () => st[k], set: v => { st[k] = v; } });
  c.calls = calls;
  return c;
}
const strokeOpts = (over) => Object.assign({
  n: 6, x0: 0, y0: 50,
  xAt: k => 10 * (k + 1), yAt: k => 50 - k,
  conf: [1, 0.9, 0.8, 0.4, 0.3, 0.2], kEnd: 3,
  rgb: "232,180,99", dash: null, lw: 2
}, over || {});

test("신뢰 구간은 봉마다 실선 세그먼트, 지평 이후는 점묘다", () => {
  const c = recCtx();
  P.strokeLine(c, strokeOpts());
  assert.equal(c.calls.filter(x => x.op === "stroke").length, 3, "실선 세그먼트가 kEnd 와 다르다");
  assert.equal(c.calls.filter(x => x.op === "arc").length, 3, "지평 이후 점묘 수가 n-kEnd 와 다르다");
});

test("알파와 굵기가 신뢰도를 따라 줄어든다 — 감쇠가 보여야 한다", () => {
  const c = recCtx();
  P.strokeLine(c, strokeOpts());
  const seg = c.calls.filter(x => x.op === "stroke");
  const alphaOf = s => parseFloat(/rgba\(\d+,\d+,\d+,([\d.]+)\)/.exec(s)[1]);
  assert.ok(alphaOf(seg[0].stroke) > alphaOf(seg[2].stroke), "먼 구간이 더 진하다");
  assert.ok(seg[0].lw > seg[2].lw, "먼 구간이 더 굵다");
});

test("n=0 이면 아무것도 그리지 않는다", () => {
  const c = recCtx();
  P.strokeLine(c, strokeOpts({ n: 0, kEnd: 0, conf: [] }));
  assert.equal(c.calls.filter(x => x.op === "stroke" || x.op === "arc").length, 0);
});

test("좌표가 유한하지 않은 봉은 건너뛴다", () => {
  const c = recCtx();
  P.strokeLine(c, strokeOpts({ yAt: k => (k === 1 ? NaN : 50 - k) }));
  assert.equal(c.calls.filter(x => x.op === "stroke").length, 2, "NaN 봉을 그렸다");
});

test("dash 를 주면 점선으로, 안 주면 실선으로 긋는다", () => {
  const dashed = recCtx(); P.strokeLine(dashed, strokeOpts({ dash: [6, 4] }));
  assert.ok(dashed.calls.some(x => x.op === "setLineDash" && x.args[0] && x.args[0].length === 2));
  const solid = recCtx(); P.strokeLine(solid, strokeOpts());
  const set = solid.calls.filter(x => x.op === "setLineDash" && x.args[0] && x.args[0].length);
  assert.equal(set.length, 0, "dash 없이 점선을 그렸다");
});
```

- [ ] **Step 2: 실패를 확인한다**

Run: `cd map/mobile && node --test test/draw-preds.test.mjs`
Expected: FAIL — `TypeError: P.strokeLine is not a function`

- [ ] **Step 3: `_strokePredLine` 포팅**

`draw-preds.js`의 원문 복사 블록 안, `_predConfSeq` 뒤에 삽입(원문 복사 범위 주석을 `47-52, 56-69, 80-145`로 갱신):

```js
  // 예측선 공통 스트로크: 신뢰 구간은 봉별 알파·굵기 세그먼트 실선, 신뢰 지평 이후는 점묘.
  // 점묘는 '연결된 경로'라는 주장 자체를 철회하는 표현이므로 1·2·3차가 반드시 같은 규칙을 공유해야 한다.
  // 좌표 변환·클램프는 호출부마다 다르므로 xAt/yAt 콜백으로 주입받는다.
  function _strokePredLine(c, o) {
    const n = o.n; if (!(n > 0)) return;
    c.save(); c.lineJoin = "round"; c.lineCap = "round";
    let x0 = o.x0, y0 = o.y0;
    for (let k = 0; k < o.kEnd; k++) {
      const x1 = o.xAt(k), y1 = o.yAt(k); if (!isFinite(x1) || !isFinite(y1)) continue;
      c.strokeStyle = "rgba(" + o.rgb + "," + (0.25 + 0.75 * o.conf[k]).toFixed(3) + ")";
      c.lineWidth = o.lw * (0.55 + 0.45 * o.conf[k]);
      if (o.dash) c.setLineDash(o.dash); else c.setLineDash([]);
      c.beginPath(); c.moveTo(x0, y0); c.lineTo(x1, y1); c.stroke();
      x0 = x1; y0 = y1;
    }
    c.setLineDash([]);
    for (let k = o.kEnd; k < n; k++) {   // 지평 이후: 점만 — 사이를 잇지 않는다
      const x1 = o.xAt(k), y1 = o.yAt(k); if (!isFinite(x1) || !isFinite(y1)) continue;
      c.fillStyle = "rgba(" + o.rgb + "," + (0.15 + 0.35 * o.conf[k]).toFixed(3) + ")";
      c.beginPath(); c.arc(x1, y1, 1.3, 0, 7); c.fill();
    }
    c.restore();
  }
```

export 갱신:

```js
  return { seed: seed,
           confAt: _predConfAt, confSeq: _predConfSeq,
           wigSeq: _predWigSeqSR, wiggle: wiggle,
           strokeLine: _strokePredLine };
```

- [ ] **Step 4: 통과를 확인한다**

Run: `cd map && ./tests/run.sh mobile`
Expected: PASS — moneyscoop-mobile 58건

- [ ] **Step 5: 커밋**

```bash
git add mobile/www/draw-preds.js mobile/test/draw-preds.test.mjs
git commit -m "mobile(p2): 예측선 페이드 스트로크(구간 알파·굵기 + 지평 이후 점묘)"
```

---

### Task 4: 끝점 장식 — 진앙 · 마일스톤 점 · 라벨

`_epicenterMark` + `_predEndDeco`. 라벨은 `MSLayers` 공유 레지스트리에 예약한다.

**Files:**
- Modify: `mobile/www/draw-preds.js`
- Test: `mobile/test/draw-preds.test.mjs`

**Interfaces:**
- Consumes: `MSLayers.fitBoxY` · `MSLayers.axisBoxes` · `MSLayers.predBoxes` · `MSLayers.reservePredBox`(Task 1) · `FCore.calibrateUpProb`
- Produces:
  - `MSPreds.epicenter(c, x, y, col, scale) -> void`
  - `MSPreds.pcal(center, hi, anchor, k) -> number` (0..100 정수)
  - `MSPreds.endDeco(c, o) -> void`. `o = { path[], seamX, coneR, toY(v), box, tf, col, label, labelDy, showPx }`, `box = { padX, plotW, padTop, padBot, ch }`

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`mobile/test/draw-preds.test.mjs` 끝에 추가:

```js
// ── 끝점 장식 ──
const L = require("../www/draw-layers.js");
const BOX = { padX: 10, plotW: 300, padTop: 10, padBot: 0, ch: 280 };
const deco = (over) => Object.assign({
  path: Array.from({ length: 24 }, (_, k) => 100 + k * 0.4),
  seamX: 120, coneR: 300, toY: v => 280 - (v - 95) * 4,
  box: BOX, tf: "1day", col: "#e8b463", label: "1차·62%", labelDy: -12, showPx: true
}, over || {});

test("epicenter 는 동심 코어를 arc 로 실제로 그린다", () => {
  const c = recCtx();
  P.epicenter(c, 100, 50, "#e8b463", 1);
  const arcs = c.calls.filter(x => x.op === "arc");
  assert.equal(arcs.length, 2, "코어+화이트닷 2개가 아니다");
  assert.ok(arcs[0].args[3] > arcs[1].args[3], "바깥 코어가 안쪽 점보다 작다");
});

test("epicenter 는 좌표가 유한하지 않으면 아무것도 안 그린다", () => {
  const c = recCtx();
  P.epicenter(c, NaN, 50, "#e8b463", 1);
  assert.equal(c.calls.length, 0);
});

test("endDeco 는 진앙과 라벨을 모두 페인트한다", () => {
  const c = recCtx(); L.resetLabels(372, 520);
  P.endDeco(c, deco());
  assert.ok(c.calls.some(x => x.op === "arc"), "진앙이 없다");
  const texts = c.calls.filter(x => x.op === "fillText").map(x => String(x.args[0]));
  assert.ok(texts.some(t => t.indexOf("1차") === 0), "차수 라벨이 없다: " + texts.join("|"));
  assert.equal(texts.length, 2, "차수 라벨 + 끝점 예측가 두 개여야 한다");
});

test("endDeco 가 그린 라벨은 공유 레지스트리에 예약된다 — 지표 배지가 이를 피해야 한다", () => {
  const c = recCtx(); L.resetLabels(372, 520);
  P.endDeco(c, deco());
  assert.ok(L.predBoxes().length >= 1, "예측 라벨 박스가 예약되지 않았다");
  assert.equal(L.evBoxes().length, L.predBoxes().length, "근거 라벨 레지스트리에 반영되지 않았다");
});

test("endDeco 는 resetLabels 없이 불러도 던지지 않는다", () => {
  const c = recCtx();
  assert.doesNotThrow(() => P.endDeco(c, deco()));
});

test("endDeco 는 빈 경로면 조용히 끝난다", () => {
  const c = recCtx(); L.resetLabels(372, 520);
  P.endDeco(c, deco({ path: [] }));
  assert.equal(c.calls.length, 0);
});

test("endDeco 는 끝점 y 를 가격 패널 안으로 클램프한다", () => {
  const c = recCtx(); L.resetLabels(372, 520);
  // path 를 3봉으로 줄여 마일스톤 점을 없앤다(_hzList 가 h<=pl 만 남기므로 [] 가 된다) —
  // 그래야 남는 arc 가 진앙뿐이라 클램프를 단독으로 단언할 수 있다.
  P.endDeco(c, deco({ path: [100, 101, 102], toY: () => -9999, showPx: false, label: null }));
  const arcs = c.calls.filter(x => x.op === "arc");
  assert.equal(arcs.length, 2, "클램프 후에도 진앙(코어+화이트닷)은 그려야 한다");
  arcs.forEach(a => assert.ok(a.args[1] >= BOX.padTop && a.args[1] <= BOX.ch, "진앙 y=" + a.args[1] + " 가 패널 밖"));
});

test("pcal 은 0..100 정수이고, 하락 예측이면 50 아래로 내려간다", () => {
  const up = P.pcal([100, 110], [104, 118], 100, 1);
  const dn = P.pcal([100, 90], [104, 98], 100, 1);
  [up, dn].forEach(v => assert.ok(Number.isInteger(v) && v >= 0 && v <= 100, "pcal=" + v));
  assert.ok(dn < 50, "하락 예측인데 방향확률이 " + dn);
});
```

- [ ] **Step 2: 실패를 확인한다**

Run: `cd map/mobile && node --test test/draw-preds.test.mjs`
Expected: FAIL — `TypeError: P.epicenter is not a function`

- [ ] **Step 3: 심 + 끝점 장식 구현**

`draw-preds.js`의 `seed` 함수 아래(심 섹션)에 추가:

```js
  function _hzFmt(v) { return (Math.abs(v) < 10 ? v.toFixed(2) : Math.round(v).toLocaleString()); }   // forge-app.js:161
  function _normCdf(z) { const t = 1 / (1 + 0.2316419 * Math.abs(z)), d = 0.3989423 * Math.exp(-z * z / 2); let p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274)))); return z > 0 ? 1 - p : p; }   // forge-app.js:162
  /* 현재가 대비 상승확률(%) — 로그정규: m=log(예측/현재), sd=log(상단/예측) */
  function _upProb(pred, hi, anchor) {                                                                 // forge-app.js:164
    if (!(pred > 0 && hi > 0 && anchor > 0)) return 50;
    const m = Math.log(pred / anchor), sd = Math.log(hi / pred);
    return Math.round(_normCdf(m / (sd || 1e-6)) * 100);
  }
  function _hzList(unit, fb) {                                                                         // forge-app.js:169
    let hs = unit === "개월" ? [3, 6, 12, 24]
      : unit === "주" ? [13, 26, 39, 52]
      : unit === "일" ? [10, 20, 40, 60]
      : [Math.ceil(fb / 4), Math.ceil(fb / 2), Math.ceil(fb * 3 / 4), fb];
    return hs.filter(h => h >= 1 && h <= fb).filter((h, i, a) => a.indexOf(h) === i);
  }
  // forge-draw.js:3363 원문은 한글 TF 표기("일봉")만 판별한다. 모바일 TF 는 API 표기("1day")라
  // 영문 토큰을 함께 받도록 확장했다 — 이 심이 아니면 전부 "봉"으로 떨어져 마일스톤 점이 사라진다.
  function _tfUnit(tf) { return /월|month/i.test(tf) ? "개월" : /주|week/i.test(tf) ? "주" : /일|day/i.test(tf) ? "일" : "봉"; }
  // 표기용 확률: 그 봉의 예측 '방향'이 실현될 캘리브레이션 확률(%). 50 미만이면 반대가 우세 — 숨기지 않는다.
  function _predPCal(center, hi, anchor, k) {                                                          // forge-draw.js:71
    const raw = _upProb(center[k], hi[k], anchor);
    const cal = (FCore && FCore.calibrateUpProb) ? FCore.calibrateUpProb(raw) : raw;
    return (center[k] >= anchor) ? cal : (100 - cal);
  }
  // 라벨 충돌 레지스트리는 draw-layers.js 한 벌을 쓴다. Layers 가 없으면(단독 로드) 회피만 포기하고 그린다.
  function _reserve(b) { if (Layers && Layers.reservePredBox) Layers.reservePredBox(b); }
  function _obstacles() { return (Layers && Layers.axisBoxes) ? Layers.axisBoxes().concat(Layers.predBoxes()) : []; }
  function _fit(bx, by, bw, bh, minY, maxY) { return (Layers && Layers.fitBoxY) ? Layers.fitBoxY(bx, by, bw, bh, _obstacles(), minY, maxY) : by; }
```

원문 복사 블록 안(`_strokePredLine` 뒤, 범위 주석에 `1949-1957` 추가)에 진앙:

```js
  // 지진 진앙지형 마커 — 글로우 코어. scale<1 이면 축소·감광(반대 예상선 끝점=1/3)
  function _epicenterMark(c, x, y, col, scale) {
    if (!isFinite(x) || !isFinite(y)) return;
    const sc = Math.max(0.46, scale || 1);   // 1/3이라도 최소 크기 확보(작지만 진앙지로 식별)
    c.save(); c.lineCap = "round";
    c.globalAlpha = 1; c.shadowColor = col; c.shadowBlur = 9 * sc; c.fillStyle = col;
    c.beginPath(); c.arc(x, y, 3.2 * sc, 0, 7); c.fill();
    c.shadowBlur = 0; c.globalAlpha = 1; c.fillStyle = "#fff"; c.beginPath(); c.arc(x, y, Math.max(1, 1.2 * sc), 0, 7); c.fill();
    c.restore();
  }
```

원문 복사 블록 **밖**(공개 API 섹션)에 끝점 장식 — 인자를 객체로 묶고 레지스트리를 공유로 돌린 것만 다르다:

```js
  // forge-draw.js:1959-2000(_predEndDeco) — 인자만 객체로 묶고, _reserve/_fitBoxY 를 MSLayers 공유본으로 돌렸다.
  // 흘러가는 마일스톤 점 + 끝점 진앙 + 차수 라벨 + 끝점 예측가.
  function endDeco(c, o) {
    var pathArr = o.path, pl = pathArr && pathArr.length; if (!pl) return;
    var seamX = o.seamX, coneR = o.coneR, toY = o.toY, box = o.box, col = o.col;
    var tX = function (k) { return seamX + ((k + 1) / pl) * (coneR - seamX); };
    try {
      var mhs = _hzList(_tfUnit(o.tf), pl), i;
      for (i = 0; i < mhs.length; i++) {
        var h = mhs[i]; if (h < 1 || h >= pl) continue;
        var mx = tX(h - 1), my = toY(pathArr[h - 1]);
        if (isFinite(mx) && isFinite(my)) {
          c.fillStyle = col; c.beginPath(); c.arc(mx, my, 2, 0, 7); c.fill();
          c.strokeStyle = "#0b0f14"; c.lineWidth = 1; c.stroke();
        }
      }
    } catch (e) {}
    var ex = Math.min(coneR, box.padX + box.plotW - 12);
    var ey = Math.max(box.padTop + 14, Math.min(box.ch - box.padBot - 14, toY(pathArr[pl - 1])));
    _epicenterMark(c, ex, ey, col, col === "#8a92b2" ? 0.6 : 1);   // 반대 우세(회색 강등)면 목표 마커도 약하게
    // 배지와 끝점 예측가는 끝점이 서로 가까우면 고정 오프셋만으로 겹쳤다(우측 라벨 더미).
    // 빈 슬롯에 배치하고 자리를 예약해 근거 라벨(_evLabel)도 이를 피하게 한다.
    var _minY = box.padTop + 2, _maxY = box.ch - box.padBot - 2;
    if (o.label) {
      c.save(); c.font = "800 11px Pretendard,'Malgun Gothic',sans-serif"; c.textAlign = "right";
      var _lw = c.measureText(o.label).width, _lx = ex - 10;
      var _bx = _lx - _lw - 7, _bw = _lw + 10, _bh = 15;
      var _want = ey + (o.labelDy != null ? o.labelDy : -13) - 10;
      var _by = _fit(_bx, _want, _bw, _bh, _minY, _maxY);
      if (_by != null) {
        c.fillStyle = "rgba(11,15,20,.86)";
        if (c.roundRect) { c.beginPath(); c.roundRect(_bx, _by, _bw, _bh, 4); c.fill(); } else c.fillRect(_bx, _by, _bw, _bh);
        c.strokeStyle = col; c.globalAlpha = .5; c.lineWidth = 1;
        if (c.roundRect) { c.beginPath(); c.roundRect(_bx + .5, _by + .5, _bw - 1, _bh - 1, 4); c.stroke(); }
        c.globalAlpha = 1;
        c.fillStyle = col; c.fillText(o.label, _lx, _by + 10);
        _reserve({ x: _bx, y: _by, w: _bw, h: _bh });
      }
      c.restore();
    }
    if (o.showPx && isFinite(pathArr[pl - 1])) {   // 끝점 예측가 = 라인색 폰트(끝점 옆)
      c.save(); c.font = "800 10.5px ui-monospace,monospace"; c.textAlign = "right";
      var _pv = _hzFmt(pathArr[pl - 1]), _pw = c.measureText(_pv).width;
      var _pxx = ex - 8, _pbx = _pxx - _pw - 6, _pbw = _pw + 9, _pbh = 14;
      var _pwant = Math.max(box.padTop + 9, Math.min(box.ch - box.padBot - 4, ey - (o.labelDy != null ? o.labelDy : -13))) - 10;
      var _pby = _fit(_pbx, _pwant, _pbw, _pbh, _minY, _maxY);
      if (_pby != null) {
        c.fillStyle = "rgba(11,15,20,.72)";
        if (c.roundRect) { c.beginPath(); c.roundRect(_pbx, _pby, _pbw, _pbh, 3); c.fill(); }
        c.fillStyle = col; c.fillText(_pv, _pxx - 1, _pby + 10);
        _reserve({ x: _pbx, y: _pby, w: _pbw, h: _pbh });
      }
      c.restore();
    }
  }
```

export 갱신:

```js
  return { seed: seed,
           confAt: _predConfAt, confSeq: _predConfSeq,
           wigSeq: _predWigSeqSR, wiggle: wiggle,
           strokeLine: _strokePredLine,
           epicenter: _epicenterMark, pcal: _predPCal, endDeco: endDeco };
```

> recording-ctx 는 `shadowColor`/`shadowBlur` 프로퍼티를 정의하지 않지만, 일반 객체에 대한 단순 대입이라 던지지 않는다(그래서 테스트 ctx 를 늘릴 필요가 없다).

- [ ] **Step 4: 통과를 확인한다**

Run: `cd map && ./tests/run.sh mobile`
Expected: PASS — moneyscoop-mobile 66건

- [ ] **Step 5: 커밋**

```bash
git add mobile/www/draw-preds.js mobile/test/draw-preds.test.mjs
git commit -m "mobile(p2): 끝점 진앙·마일스톤 점·차수 라벨(공유 레지스트리 예약)"
```

---

### Task 5: `drawCone` 배선 — 티어 계약을 색 집합으로 재정의

`drawCone`이 `MSPreds`를 경유한다. 스트로크가 봉별 세그먼트로 쪼개지므로 **기존 티어 테스트의 "스트로크 수" 단언은 성립하지 않는다** — 티어 계약을 "등장하는 예측선 색의 집합"으로 다시 못박는다.

**Files:**
- Modify: `mobile/www/chart-draw.js:3-6`(UMD) · `:56-75`(drawCone) · `:140-142`(export)
- Modify: `mobile/www/index.html:18` 뒤
- Test: `mobile/test/chart-draw.test.mjs`

**Interfaces:**
- Consumes: `MSPreds.seed` · `MSPreds.wiggle` · `MSPreds.confSeq` · `MSPreds.strokeLine` · `MSPreds.pcal` · `MSPreds.endDeco`(Task 2·3·4) · `MSLayers.resetLabels`(Task 1)
- Produces: `MSChartDraw.drawCone(c, lay, pred, col, tier, opts) -> void`, `opts = { sym: string, tf: string }`(생략 가능 — 생략 시 시드는 `seed(undefined, undefined)` 고정값)

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`mobile/test/chart-draw.test.mjs` 수정 — (a) `recCtx` 의 op 목록에 `"arc"` 를 추가하고, (b) `L` 을 require 하고, (c) 예측선 색 단언 헬퍼를 추가하고, (d) 티어 테스트 5건을 교체한다.

(a) `:15` 교체:

```js
  for (const n of ["save","restore","beginPath","closePath","moveTo","lineTo","fill","stroke","fillRect","arc","setLineDash","fillText","rect","clip","translate","roundRect"]) c[n] = rec(n);
```

(b) `:6` 뒤에 추가:

```js
const L  = require("../www/draw-layers.js");
```

(c) `:27`(`const L = () => CL.chartLayout(...)` 는 레이아웃 팩토리이므로 이름 충돌 회피 — 레이아웃 팩토리를 `LAY` 로 개명) — `:27` 을 교체하고 이후 본문의 `L()` 호출을 전부 `LAY()` 로 바꾼다:

```js
const LAY = () => CL.chartLayout({ candle: candles(150), prediction: pred, width: 372, height: 520, pad: 10, tailBars: 120 });

// 예측선은 이제 봉별 세그먼트로 쪼개져 그려진다(신뢰 감쇠). 그래서 "스트로크 몇 번"이 아니라
// "어떤 예측선 색이 등장했나" 로 티어 계약을 고정한다 — 세그먼트 수는 밴드 모양에 딸린 값이다.
function predRgbs(c) {
  const set = new Set();
  for (const x of c.calls) {
    if (x.op !== "stroke" || typeof x.stroke !== "string") continue;
    const m = /^rgba\((\d+,\d+,\d+),/.exec(x.stroke);
    if (m) set.add(m[1]);
  }
  return set;
}
const RGB = { gold: "232,180,99", pred3: "224,106,106", pred2: "184,146,245" };
```

(d) `:58-63`(콘 채움 테스트)과 `:103-160`(티어 5건)을 교체:

```js
test("콘을 cone 색으로 채우고 경로를 gold 로 긋는다", () => {
  const c = recCtx(); L.resetLabels(372, 520);
  D.drawCone(c, LAY(), pred, COL);
  assert.ok(c.calls.some(x => x.op === "fill" && x.fill === COL.cone), "콘 채움이 없다");
  assert.ok(predRgbs(c).has(RGB.gold), "예측 경로 gold 스트로크가 없다");
});

// ── 예측선 티어 게이팅(모바일 수익화) ──
// levels·tex 를 실었다 — 이게 없으면 wiggle 이 매끈한 폴백으로 빠져 꿈틀 경로가 테스트에서 실행되지 않는다.
const predWithCounter = { path: [130, 131, 132], lo: [128, 129, 130], hi: [132, 133, 134],
                           futW: 3, counter: [125, 124, 123], anchor: 129,
                           levels: [128, 130, 132, 134], tex: [0.01, -0.02, 0.015, 0] };

test("linesFor 는 티어별 배열을 돌려주고, 모르는 티어는 basic 으로 대체한다", () => {
  assert.deepEqual(D.linesFor("basic"), ["p1"]);
  assert.deepEqual(D.linesFor("full"), ["p1", "p3"]);
  assert.deepEqual(D.linesFor("custom"), ["p1", "p2", "p3"]);
  assert.deepEqual(D.linesFor("nope"), ["p1"], "미지정 티어는 basic 폴백");
  assert.deepEqual(D.linesFor(undefined), ["p1"]);
  assert.deepEqual(D.PRED_TIERS.basic, ["p1"]);
});

test("tier:basic 은 1차만 긋는다 — counter 는 색조차 등장하지 않는다", () => {
  const c = recCtx(); L.resetLabels(372, 520);
  D.drawCone(c, LAY(), predWithCounter, Object.assign({}, COL, { pred3: "#e06a6a" }), "basic");
  const rgbs = predRgbs(c);
  assert.deepEqual([...rgbs], [RGB.gold], "1차 외 예측선 색이 섞였다: " + [...rgbs]);
});

test("tier:full 은 1차·3차를 긋고, 3차는 점선이다", () => {
  const c = recCtx(); L.resetLabels(372, 520);
  D.drawCone(c, LAY(), predWithCounter, Object.assign({}, COL, { pred3: "#e06a6a" }), "full");
  const rgbs = predRgbs(c);
  assert.ok(rgbs.has(RGB.gold), "1차(gold) 가 없다");
  assert.ok(rgbs.has(RGB.pred3), "3차(pred3) 가 없다");
  assert.equal(rgbs.size, 2, "예측선 색이 2종이 아니다: " + [...rgbs]);
  assert.ok(c.calls.some(x => x.op === "setLineDash" && x.args[0] && x.args[0].length), "3차가 점선이 아니다");
});

test("tier:custom 이지만 pred.second 가 없으면 p1·p3 만 그리고 에러 없이 끝난다", () => {
  const c = recCtx(); L.resetLabels(372, 520);
  const col = Object.assign({}, COL, { pred3: "#e06a6a", pred2: "#b892f5" });
  assert.doesNotThrow(() => D.drawCone(c, LAY(), predWithCounter, col, "custom"));
  const rgbs = predRgbs(c);
  assert.equal(rgbs.size, 2, "second 없이 p2 를 그렸다: " + [...rgbs]);
  assert.ok(!rgbs.has(RGB.pred2), "pred2 색이 등장하면 안 된다(데이터 없음)");
});

test("콘 채움은 티어와 무관하게 항상 그려진다", () => {
  ["basic", "full", "custom", undefined].forEach(tier => {
    const c = recCtx(); L.resetLabels(372, 520);
    D.drawCone(c, LAY(), predWithCounter, COL, tier);
    assert.ok(c.calls.some(x => x.op === "fill" && x.fill === COL.cone), "tier=" + tier + " 콘 채움 누락");
  });
});

test("tier 인자를 생략하면 기존 호출처럼 basic 으로 동작한다", () => {
  const c = recCtx(); L.resetLabels(372, 520);
  D.drawCone(c, LAY(), predWithCounter, COL);
  assert.deepEqual([...predRgbs(c)], [RGB.gold]);
});

// ── Phase 2 통합 계약 ──
const trace = (p) => {
  const c = recCtx(); L.resetLabels(372, 520);
  D.drawCone(c, LAY(), p, COL, "basic", { sym: "AAPL", tf: "1day" });
  return c.calls.filter(x => x.op === "lineTo").map(x => x.args.join(",")).join("|");
};

test("levels·tex 가 오면 꿈틀이 실제로 적용된다 — 매끈한 폴백과 좌표가 갈라진다", () => {
  const smooth = trace(Object.assign({}, predWithCounter, { levels: null, tex: null }));
  assert.notEqual(trace(predWithCounter), smooth, "levels·tex 가 있는데 매끈한 선과 좌표가 같다");
});

test("basic 예측선에 끝점 장식이 붙고 라벨이 공유 레지스트리에 예약된다", () => {
  const c = recCtx(); L.resetLabels(372, 520);
  D.drawCone(c, LAY(), predWithCounter, COL, "basic", { sym: "AAPL", tf: "1day" });
  assert.ok(c.calls.some(x => x.op === "arc"), "끝점 진앙이 없다");
  assert.ok(c.calls.some(x => x.op === "fillText" && String(x.args[0]).indexOf("1차") === 0), "차수 라벨이 없다");
  assert.ok(L.predBoxes().length >= 1, "끝점 라벨이 공유 레지스트리에 예약되지 않았다");
});

test("같은 종목·주기면 같은 그림 — 두 번 그려도 좌표가 동일하다", () => {
  assert.equal(trace(predWithCounter), trace(predWithCounter));
});

test("밴드(lo/hi)가 없으면 꿈틀 없이 단순 폴리라인으로 폴백한다", () => {
  const c = recCtx(); L.resetLabels(372, 520);
  const noBand = { path: [130, 131, 132], futW: 3 };
  assert.doesNotThrow(() => D.drawCone(c, CL.chartLayout({ candle: candles(150), prediction: noBand, width: 372, height: 520, pad: 10, tailBars: 120 }), noBand, COL, "basic"));
  assert.ok(c.calls.some(x => x.op === "stroke" && x.stroke === COL.gold), "폴백 스트로크가 없다");
});
```

- [ ] **Step 2: 실패를 확인한다**

Run: `cd map/mobile && node --test test/chart-draw.test.mjs`
Expected: FAIL — `predRgbs` 가 빈 Set (아직 `strokeStyle` 이 hex 다) · `arc` 호출 없음

- [ ] **Step 3: `chart-draw.js` 배선 + `index.html` 스크립트 태그**

`chart-draw.js:3-6` 의 UMD 래퍼 교체:

```js
(function (root, factory) {
  if (typeof module !== "undefined" && module.exports) module.exports = factory(require("./draw-preds.js"));
  else root.MSChartDraw = factory(root.MSPreds);
})(typeof self !== "undefined" ? self : this, function (MSPreds) {
```

`strokeLine` 함수(`:46-54`) 아래에 헬퍼 추가:

```js
  // _strokePredLine 은 봉별 알파를 만들어야 하므로 hex 가 아니라 "r,g,b" 를 받는다.
  function rgbOf(hex) {
    var h = String(hex || "").replace("#", "");
    if (h.length === 3) h = h.charAt(0) + h.charAt(0) + h.charAt(1) + h.charAt(1) + h.charAt(2) + h.charAt(2);
    var r = parseInt(h.substr(0, 2), 16), g = parseInt(h.substr(2, 2), 16), b = parseInt(h.substr(4, 2), 16);
    return (isFinite(r) && isFinite(g) && isFinite(b)) ? (r + "," + g + "," + b) : "232,180,99";
  }
  // 예측 시작 경계 — drawAxes 의 예측 시작 점선과 같은 자리여야 한다.
  function seamOf(lay) {
    var d = lay.fiToX(lay.nowFi) - lay.fiToX(lay.nowFi - 1);
    return lay.fiToX(lay.nowFi) + (isFinite(d) ? d : 0) / 2;
  }
  // 끝점 장식의 세로 클램프는 가격 패널 안이어야 한다 —
  // PC 는 차트 전체가 가격 패널이라 ch 를 그대로 썼지만 모바일은 4단 적층이다.
  function boxOf(lay) {
    var r = lay.panels.price.rect;
    return { padX: lay.plot.x, plotW: lay.plot.w, padTop: r.y, padBot: 0, ch: r.y + r.h };
  }
```

`drawCone`(`:56-75`) 전체 교체:

```js
  function drawCone(c, lay, pred, col, tier, opts) {
    if (!pred || !pred.path || !pred.path.length) return;
    var p = lay.panels.price; if (!p) return;
    var M = p.M, n = pred.path.length, i;
    var xs = xsFor(M, lay, n);
    var o = opts || {};
    var sd = MSPreds.seed(o.sym, o.tf);
    var lo = pred.lo || [], hi = pred.hi || [];
    var anchor = (pred.anchor != null) ? pred.anchor : pred.path[0];
    var seamX = seamOf(lay), box = boxOf(lay);
    c.save();
    if (hi.length && lo.length) {
      c.beginPath();
      for (i = 0; i < n; i++) { var yh = M.pToY(hi[i]); i ? c.lineTo(xs[i], yh) : c.moveTo(xs[i], yh); }
      for (i = n - 1; i >= 0; i--) c.lineTo(xs[i], M.pToY(lo[i]));
      c.closePath(); c.fillStyle = col.cone; c.fill();
    }

    // 꿈틀 + 신뢰 페이드 + 끝점 장식. 밴드가 없으면 신뢰도를 정의할 수 없으므로 Phase 1 폴백.
    function wigLine(vals, hex, dash, lw, lineSeed, tag, labelDy) {
      if (!vals || !vals.length) return;
      var m = Math.min(vals.length, lo.length, hi.length);
      if (!m) { strokeLine(c, M, lay, vals, hex, lw, dash); return; }
      var mlo = lo.slice(0, m), mhi = hi.slice(0, m), mv = vals.slice(0, m);
      var wv = MSPreds.wiggle(m, mv, mlo, mhi, pred.levels, pred.tex, lineSeed);
      var cs = MSPreds.confSeq(mlo, mhi);
      var lx = xsFor(M, lay, m);
      MSPreds.strokeLine(c, {
        n: m, x0: seamX, y0: M.pToY(anchor),
        xAt: function (k) { return lx[k]; },
        yAt: function (k) { return M.pToY(wv[k]); },
        conf: cs.conf, kEnd: cs.kEnd, rgb: rgbOf(hex), dash: dash, lw: lw
      });
      var pc = MSPreds.pcal(mv, mhi, anchor, m - 1);
      MSPreds.endDeco(c, {
        path: mv, seamX: seamX, coneR: lx[m - 1], toY: M.pToY, box: box, tf: o.tf,
        col: (pc < 50 ? "#8a92b2" : hex),          // 반대가 우세하면 회색으로 강등 — 숨기지 않는다
        label: tag + "·" + pc + "%", labelDy: labelDy, showPx: true
      });
    }

    var lines = linesFor(tier);
    for (i = 0; i < lines.length; i++) {
      if (lines[i] === "p1") wigLine(pred.path, col.gold, null, 2.2, sd, "1차", -12);
      else if (lines[i] === "p2") wigLine(pred.second, col.pred2, [4, 3], 1.8, (sd ^ 0x85ebca6b) >>> 0, "2차", 12);
      else if (lines[i] === "p3") wigLine(pred.counter, col.pred3 || col.bear, [6, 4], 1.8, (sd ^ 0x9e3779b9) >>> 0, "3차",
                                          (pred.counter && pred.counter[pred.counter.length - 1] >= anchor) ? -12 : 14);
    }
    c.restore();
  }
```

`index.html:18`(`draw-panels.js`) 뒤에 삽입 — `draw-layers.js` 이후, `chart-draw.js` 이전이어야 한다:

```html
<script src="draw-preds.js"></script>
```

- [ ] **Step 4: 통과를 확인한다**

Run: `cd map && ./tests/run.sh mobile`
Expected: PASS — moneyscoop-mobile 70건

- [ ] **Step 5: 커밋**

```bash
git add mobile/www/chart-draw.js mobile/www/index.html mobile/test/chart-draw.test.mjs
git commit -m "mobile(p2): drawCone 이 MSPreds 경유 — 티어 계약을 예측선 색 집합으로 재정의"
```

---

### Task 6: 프레임 합성 순서 정정 — `resetLabels` 를 맨 앞으로

**현재 `report.js` 는 `drawCone` 이후에 `resetLabels` 를 부른다.** 그대로 두면 `endDeco` 가 방금 예약한 끝점 라벨 박스를 `resetLabels` 가 즉시 지워, 이어지는 지표 배지가 끝점 라벨을 못 보고 겹쳐 그린다 — 설계서 §3.1이 막으려 한 바로 그 상태가 된다.

**Files:**
- Modify: `mobile/www/screens/report.js:117`(시그니처) · `:137-147`(frame 순서) · `:457`(호출)
- Modify: `mobile/docs/BACKLOG-mobile.md`(✅ 완료 · 📋 예정 갱신)

**Interfaces:**
- Consumes: `MSChartDraw.drawCone(c, lay, pred, col, tier, opts)`(Task 5)
- Produces: (없음 — 화면 내부 배선)

- [ ] **Step 1: `paintChart` 가 sym 을 받도록 시그니처 확장**

`:117` 교체:

```js
  function paintChart(cv, wrap, an, data, sym) {
```

`:457` 교체:

```js
      if (state === "ready" && chartRefs) paintChart(chartRefs.cv, chartRefs.wrap, an, data, sym);
```

- [ ] **Step 2: `frame()` 의 합성 순서를 고친다**

`:137-147` 교체 — `resetLabels` 가 맨 앞, `drawCone` 은 그 뒤:

```js
    function frame(hoverFi) {
      ctx.clearRect(0, 0, cssW, CHART_H);
      MSLayers.resetLabels(cssW, CHART_H);              // 매 프레임 맨 앞 — 이 뒤에 등록되는 라벨만 서로를 본다.
                                                        // drawCone 뒤로 밀면 끝점 라벨 예약이 즉시 지워져 배지와 겹친다.
      MSChartDraw.drawAxes(ctx, lay, data.candle, col);
      MSChartDraw.drawCone(ctx, lay, an.out.prediction, col, TIER, { sym: sym, tf: TF });
      MSChartDraw.drawCandles(ctx, lay, data.candle, col);
      MSLayers.bollinger(ctx, an.bb, lay.panels.price.M);
      MSLayers.ma(ctx, an.ma, lay.panels.price.M);
      MSLayers.rsiBadge(ctx, an.rsi, lay.panels.price.M);
      MSLayers.macdBadge(ctx, an.macd, lay.panels.price.M);
      MSLayers.volumeBadge(ctx, an.va, lay.panels.price.M);
```

`:3` 의 파일 헤더 주석도 실제 순서에 맞춘다:

```js
// 차트 합성은 라벨초기화→축→콘(꿈틀·끝점 장식)→캔들→오버레이/배지→서브패널 순(z-order 그대로),
// 크로스헤어는 350ms 홀드 게이트.
```

- [ ] **Step 3: 전체 관문을 돌린다**

Run: `cd map && ./tests/run.sh`
Expected: PASS — 전체 430건(기존 400 + Phase 2 신규 30: T1 3 · T2 10 · T3 5 · T4 8 · T5 4). 실패 스위트 0.

- [ ] **Step 4: 브라우저에서 눈으로 확인한다**

```bash
cd map/mobile/www && python3 -m http.server 8000 --bind 0.0.0.0
```

폰 Chrome(또는 Tailscale 경유 실기기)에서 워치리스트 → 종목 진입 후 확인할 것:
1. 1차 예측선이 **직선이 아니라 꿈틀거린다**(S/R 레벨에서 꺾인다).
2. 멀어질수록 **흐려지고 얇아지며**, 신뢰 지평 이후는 **점으로 해체된다**.
3. 끝점에 **진앙 마커 + `1차·NN%` 배지 + 끝점 예측가**가 있고, 지표 배지와 **겹치지 않는다**.
4. 차트를 길게 눌러 크로스헤어를 좌우로 끌 때 **꿈틀이 지직거리지 않는다**(같은 종목이면 매 프레임 동일).
5. 다른 종목으로 갔다 돌아와도 꿈틀 모양이 같다.

- [ ] **Step 5: 백로그 갱신**

`mobile/docs/BACKLOG-mobile.md` — `## 📋 예정` 의 "PC 시각 요소 포팅 — 4종 미이식" 항목을 아래로 교체(범례 토글만 남긴다):

```markdown
- **PC 시각 요소 포팅 — 범례 클릭 토글(B군)** — 표시 지표 집합(`_evVisible`) → 2차 예측(`_get2ndPred`).
  새 상태 + 토글마다 엔진 2회차 실행 + 캐시가 필요하고, 2차 선은 custom 티어 전용인데 custom 화면 자체가 v4다.
  **custom 티어 화면과 함께 착수한다.**
- **핀치줌 · 로그축** — 제스처를 다시 건드리므로 Phase 1 이 구조적으로 해결한 스크롤 충돌(350ms 홀드 계약)을
  재설계해야 한다. 독립 Phase 로 다룬다.
```

`## ✅ 완료` 끝에 추가:

```markdown
- **Phase 2 — PC 예측선 작도 포팅**(2026-08-10): 꿈틀(S/R 반응 + AR 결)·구간 신뢰도 페이드·신뢰 지평 이후 점묘·
  끝점 진앙/차수 라벨/예측가. `draw-preds.js`(`MSPreds`) 신규.
  - **라벨 레지스트리는 공유해야 한다**: `_evLabel`·박스 목록을 복사하면 두 벌이 되어 끝점 라벨이 지표 배지를
    못 보고 겹친다 → `MSLayers` 가 `evLabel`/`fitBoxY`/`reservePredBox` 를 노출하고 `MSPreds` 가 그것을 쓴다.
  - **`report.js` 합성 순서 버그**: `resetLabels` 가 `drawCone` **뒤에** 있어, 끝점 라벨 예약이 등록 직후 지워지는
    구조였다. 맨 앞으로 옮겨 고쳤다.
  - **설계서 정정 3건**: `_fitBoxY` 는 미포팅 상태였다 / `confAt` 은 `(lo,hi,k)` 여야 한다(신뢰도는 밴드 폭 함수) /
    매끈한 폴백 조건은 `tex` 없음이 아니라 `tex`·`levels` 둘 다 없음이다(꿈틀의 주항은 S/R 반응).
```

- [ ] **Step 6: 커밋 + 푸시**

```bash
git add mobile/www/screens/report.js mobile/docs/BACKLOG-mobile.md
git commit -m "mobile(p2): 프레임 합성 순서 정정(resetLabels 를 맨 앞으로) + Phase 2 종료 문서"
git push
```

> 모바일은 스토어 릴리스 트랙이라 cafe24 배포 대상이 아니다 — `커밋+푸시 한 세트`로 끝난다.
> 이 Phase 는 `forge-core.js` 를 건드리지 않으므로 `npm run sync` 는 필요 없다.

---

## 남는 열린 항목 (이 Phase 범위 밖 — 설계서 §7 그대로)

- **B군**(범례 토글 → 2차 예측) — custom 티어 화면(v4)과 함께
- **핀치줌 · 로그축** — 스크롤 충돌 계약 재설계 필요, 독립 Phase
- **`_predDir` PC 전역 의존**(`draw-layers.js:87`) — `M.focused` 를 켜기 전에 반드시 해결. 이 Phase 는 `focused` 를 건드리지 않으므로 여전히 도달 불가
- **Capacitor 툴체인 검증** — 여전히 미검증. Phase 1·2 확인은 모두 폰 Chrome 이지 WebView 가 아니다
- 잠긴 범례 스와치 색 명시화 · `?since=` 증분 시세 · 봉 수 ↔ 정확도 실측
