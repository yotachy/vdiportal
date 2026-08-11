# 머니스쿱 모바일 Phase 4 — 차트 줌 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 두 손가락 핀치로 보이는 봉 수를 바꾼다. 캔들이 항상 읽히는 범위 안에서만.

**Architecture:** 창은 오른쪽 끝에 고정이므로 상태는 `tail`(보이는 봉 수) 하나다 — `_chartWin{start,count}` 전체는 필요 없다. 계산(한계·클램프·핀치 수학)은 순수 함수 모듈 `MSZoom`에 넣어 노드에서 값으로 검증하고, DOM 배선만 `report.js`가 맡는다. `plotW`는 `chart-layout.js` 단일 출처.

**Tech Stack:** 순수 UMD 바닐라 JS(빌드 도구 없음) · `node --test`

**설계 원본:** [`specs/2026-08-11-moneyscoop-mobile-phase4-design.md`](../specs/2026-08-11-moneyscoop-mobile-phase4-design.md)

## Global Constraints

- **`map/forge-draw.js` · `forge-app.js` · `forge-core.js` 는 한 줄도 수정하지 않는다.**
- **`mobile/www/vendor/` 는 절대 손대지 않는다** (gitignore 생성물).
- **테스트 관문은 `map/tests/run.sh`.** 빠른 확인은 `./tests/run.sh mobile`. **현재 baseline = mobile 148건 / 전체 508건.** 계획서의 절대 수치가 아니라 **델타**로 검증할 것.
- UMD: `module.exports` + `root.MSXxx` 양쪽. `index.html` 스크립트 순서 고정, `defer`/`async` 금지.
- **UI 문자열은 영어**(시안). **주석·문서는 한국어**, WHY만.
- 모바일 자작 코드는 `var`/`function`. 색은 CSS 토큰만.

## 검증해 둔 사실 (계획서 작성 중 실측 — 그대로 신뢰해도 된다)

`AXIS_W=44`, `pad=10`, `futW=24`, `plotW = W - 2*pad - 44`:

| W | plotW | min봉수 | max봉수 | min에서 봉폭 | max에서 봉폭 |
|---:|---:|---:|---:|---:|---:|
| 320 | 256 | 20 | 104 | 5.82px | 2.00px |
| 373 | 309 | **20** | **131** | 7.02px | 1.99px |
| 673 | 609 | 27 | 281 | 11.94px | 2.00px |
| 884 | 820 | **44** | **386** | **12.06px** | 2.00px |
| 1000 | 936 | 54 | **400** | 12.00px | 2.21px |

세 가지가 여기서 읽힌다:

1. **커버(373)는 `BAR_MIN=20` 가드가 먼저 걸린다** — 봉폭 상한(12px)으로는 1.75봉이 나와 무의미하다. 그래서 20봉에서 봉폭이 7.02px지 12px가 아니다.
2. **W=1000은 `BAR_MAX=400` 가드가 걸린다** — 봉폭 하한으로는 444봉이지만 400에서 잘려 봉폭이 2.21px가 된다.
3. **⚠️ 반올림 때문에 경계에서 봉폭이 한계를 살짝 넘는다** — W=884의 min봉수 44에서 실제 봉폭은 **12.06px**다(`Math.round(820/12) - 24 = 68 - 24 = 44`, `820/68 = 12.06`). **테스트에서 `dx <= 12` 를 엄격히 단언하면 실패한다.** 0.5px 여유를 둘 것.

예측 비중은 봉 수만의 함수라 화면과 무관하다: 기본 60봉에서 seam→coneR 이 `plotW`의 **28.0%**(Phase 3 실측과 동일).

## File Structure

| 파일 | 책임 | 상태 |
|---|---|---|
| `mobile/www/chart-zoom.js` | `MSZoom` — 한계·클램프·핀치 수학. **의존 없음** | **신규** |
| `mobile/www/chart-layout.js` | `plotWidth(W, pad)` 노출 + 내부에서도 그것을 사용 | 수정 |
| `mobile/www/screens/report.js` | `tail` 상태 · 터치 리스너 · `onResize` 재클램프 | 수정 |
| `mobile/www/style.css` | `.rp-chart canvas { touch-action: pan-y }` | 수정 |
| `mobile/www/index.html` | `chart-zoom.js` 태그 | 수정 |
| `mobile/test/chart-zoom.test.mjs` | 순수 함수 값 검증 | **신규** |

`chart-zoom.js`는 **의존이 없다.** `plotW`를 인자로 받고, 그 값을 `MSChartLayout.plotWidth()`에서 얻는 건 호출부(`report.js`)의 책임이다. 이렇게 하면 단일 출처를 지키면서 순수 모듈로 남는다.

---

### Task 1: `chart-layout.js` — `plotW` 계산을 노출

**Files:**
- Modify: `mobile/www/chart-layout.js:24`(내부 계산) · `:76`(export)
- Test: `mobile/test/chart-layout.test.mjs`

**Interfaces:**
- Consumes: 없음
- Produces: `MSChartLayout.plotWidth(W, pad) -> number`. `pad`가 `null`/`undefined`면 `10`.

`chartLayout` 내부의 `plotW` 계산을 이 함수로 바꿔 **두 곳이 갈라질 수 없게** 한다. Phase 3에서 같은 값을 두 곳에 두었다가 두 번 데었다.

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`mobile/test/chart-layout.test.mjs` 끝에 추가:

```js
test("plotWidth 는 chartLayout 이 실제로 쓰는 폭과 같다 — 두 곳에서 따로 계산하면 갈라진다", () => {
  for (const W of [320, 373, 673, 884, 1000]) {
    for (const pad of [0, 6, 10, 16]) {
      const lay = CL.chartLayout({ candle: candles(150), prediction: null, width: W, height: 520, pad: pad, tailBars: 60 });
      assert.equal(CL.plotWidth(W, pad), lay.plot.w, "W=" + W + " pad=" + pad);
    }
  }
});

test("plotWidth 는 pad 를 생략하면 10 을 쓴다 — chartLayout 의 기본값과 같아야 한다", () => {
  assert.equal(CL.plotWidth(373), CL.plotWidth(373, 10));
  const lay = CL.chartLayout({ candle: candles(150), prediction: null, width: 373, height: 520, tailBars: 60 });
  assert.equal(CL.plotWidth(373), lay.plot.w);
});
```

> 이 파일 상단(`:8`)에 `candles(n, flat)` 과 `prediction(n)` 헬퍼가 이미 있다. 그대로 쓰고 새로 만들지 말 것.

- [ ] **Step 2: 실패를 확인한다**

Run: `cd map/mobile && node --test test/chart-layout.test.mjs`
Expected: FAIL — `CL.plotWidth is not a function`

- [ ] **Step 3: 구현**

`chart-layout.js`의 `chartLayout` 위에 추가:

```js
  // plotW 는 chart-zoom 도 써야 한다. 두 곳에서 따로 계산하면 갈라지므로 여기가 단일 출처다.
  function plotWidth(W, pad) { return W - (pad == null ? 10 : pad) * 2 - AXIS_W; }
```

`chartLayout` 내부의 `var plotW = W - pad * 2 - AXIS_W;` 를 교체:

```js
    var plotW = plotWidth(W, pad);
```

export에 추가:

```js
  return { RATIOS: RATIOS, GAP: GAP, AXIS_W: AXIS_W, plotWidth: plotWidth, chartLayout: chartLayout };
```

- [ ] **Step 4: 통과 확인**

Run: `cd map && ./tests/run.sh mobile`
Expected: PASS — 150건 (148 + 2)

- [ ] **Step 5: 변이 검증**

`plotWidth`의 `AXIS_W`를 `0`으로 바꾼다 → 일치 테스트가 FAIL 해야 한다. 되돌리고 트리 청결 확인.

- [ ] **Step 6: 커밋**

```bash
git add mobile/www/chart-layout.js mobile/test/chart-layout.test.mjs
git commit -m "mobile(p4): plotWidth 노출 — chart-zoom 과 단일 출처 공유"
```

---

### Task 2: `chart-zoom.js` — 한계 · 클램프 · 핀치 수학

**Files:**
- Create: `mobile/www/chart-zoom.js` · `mobile/test/chart-zoom.test.mjs`
- Modify: `mobile/www/index.html`

**Interfaces:**
- Consumes: 없음 (`plotW`를 인자로 받는다)
- Produces:
  - `MSZoom.limits(plotW, futW) -> { min, max }`
  - `MSZoom.clamp(plotW, futW, tail) -> number`
  - `MSZoom.fromPinch(tail0, dist0, dist) -> number` (클램프 전 원시값)
  - `MSZoom.DEFAULT_TAIL` = `60` · `MSZoom.DX_MIN` = `2` · `MSZoom.DX_MAX` = `12`

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`mobile/test/chart-zoom.test.mjs` 신규:

```js
import { test } from "node:test";
import assert from "node:assert";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const Z = require("../www/chart-zoom.js");
const CL = require("../www/chart-layout.js");

const FUT = 24;
const pw = (W) => CL.plotWidth(W, 10);

test("화면폭별 한계가 실측값과 일치한다", () => {
  const want = { 320: [20, 104], 373: [20, 131], 673: [27, 281], 884: [44, 386], 1000: [54, 400] };
  for (const W of Object.keys(want)) {
    const L = Z.limits(pw(+W), FUT);
    assert.deepEqual([L.min, L.max], want[W], "W=" + W);
  }
});

test("절대 가드가 실제로 무는 경우가 있다 — 봉폭만으로는 무의미한 값이 나온다", () => {
  // 커버(373)는 봉폭 12px 로는 1.75봉 → BAR_MIN 20 이 걸린다
  assert.equal(Z.limits(pw(373), FUT).min, 20);
  // W=1000 은 봉폭 2px 로는 444봉 → BAR_MAX 400 이 걸린다
  assert.equal(Z.limits(pw(1000), FUT).max, 400);
});

test("clamp 는 범위 밖을 경계로 당기고 범위 안은 그대로 둔다", () => {
  const p = pw(373);                       // min 20 · max 131
  assert.equal(Z.clamp(p, FUT, 5), 20);
  assert.equal(Z.clamp(p, FUT, 999), 131);
  assert.equal(Z.clamp(p, FUT, 60), 60);
  assert.equal(Z.clamp(p, FUT, 60.4), 60, "소수는 반올림");
});

test("clamp 는 이상 입력에 기본값으로 떨어진다", () => {
  const p = pw(373);
  assert.equal(Z.clamp(p, FUT, NaN), Z.DEFAULT_TAIL);
  assert.equal(Z.clamp(p, FUT, undefined), Z.DEFAULT_TAIL);
});

test("폴드 전개 재클램프 — 커버 20봉은 펼침에서 44봉으로 끌어올려진다", () => {
  assert.equal(Z.clamp(pw(373), FUT, 20), 20, "커버에선 20봉이 유효");
  assert.equal(Z.clamp(pw(884), FUT, 20), 44, "펼침 하한 밖이라 끌어올려야 한다");
});

test("fromPinch — 벌리면 줄고 오므리면 는다", () => {
  assert.ok(Z.fromPinch(60, 100, 200) < 60, "벌림(dist 증가)이 줌인이 아니다");
  assert.ok(Z.fromPinch(60, 200, 100) > 60, "오므림이 줌아웃이 아니다");
  assert.equal(Z.fromPinch(60, 100, 100), 60, "안 움직이면 그대로");
});

test("fromPinch 는 단조다 — 더 벌릴수록 더 줄어야 한다", () => {
  let prev = Infinity;
  for (const d of [100, 150, 200, 300, 500]) {
    const t = Z.fromPinch(60, 100, d);
    assert.ok(t <= prev, "d=" + d + " 에서 단조가 깨졌다: " + t + " > " + prev);
    prev = t;
  }
});

test("fromPinch 는 0·음수·NaN 에 죽지 않는다", () => {
  for (const bad of [0, -5, NaN, undefined, Infinity]) {
    const t = Z.fromPinch(60, 100, bad);
    assert.ok(isFinite(t), "dist=" + bad + " → " + t);
  }
  assert.ok(isFinite(Z.fromPinch(60, 0, 100)));
  assert.ok(isFinite(Z.fromPinch(NaN, 100, 200)));
});

test("클램프 범위 전 구간에서 실제 봉폭이 2~12px 안이다 — 반올림 여유 0.5px", () => {
  for (const W of [320, 373, 673, 884, 1000]) {
    const p = pw(W), L = Z.limits(p, FUT);
    for (const tail of [L.min, Math.round((L.min + L.max) / 2), L.max]) {
      const dx = p / (tail + FUT);
      assert.ok(dx >= Z.DX_MIN - 0.5, "W=" + W + " tail=" + tail + " 봉폭 " + dx.toFixed(2) + "px 가 너무 좁다");
      assert.ok(dx <= Z.DX_MAX + 0.5, "W=" + W + " tail=" + tail + " 봉폭 " + dx.toFixed(2) + "px 가 너무 넓다");
    }
  }
});

test("기본 60봉은 어느 화면에서도 예측 비중 28% 를 유지한다 — Phase 3 회귀 방지", () => {
  assert.equal(Z.DEFAULT_TAIL, 60);
  for (const W of [373, 884]) {
    const lay = CL.chartLayout({
      candle: Array.from({ length: 300 }, (_, i) => ({ o: 100, h: 101, l: 99, c: 100, v: 1, t: "2026-01-01" })),
      prediction: { path: new Array(FUT).fill(100), lo: new Array(FUT).fill(98), hi: new Array(FUT).fill(102) },
      width: W, height: 520, pad: 10, tailBars: Z.DEFAULT_TAIL
    });
    const dx = lay.fiToX(lay.fiMin + 1) - lay.fiToX(lay.fiMin);
    const seam = lay.fiToX(lay.nowFi) + dx / 2, coneR = lay.fiToX(lay.nowFi + FUT);
    const share = (coneR - seam) / lay.plot.w;
    assert.ok(share > 0.25, "W=" + W + " 예측 비중 " + (share * 100).toFixed(1) + "% 가 25% 미만");
  }
});
```

- [ ] **Step 2: 실패를 확인한다**

Run: `cd map/mobile && node --test test/chart-zoom.test.mjs`
Expected: FAIL — `Cannot find module '../www/chart-zoom.js'`

- [ ] **Step 3: `chart-zoom.js` 작성**

```js
// 차트 줌 계산. 순수 함수 — DOM 도 상태도 갖지 않는다.
// 창이 항상 오른쪽 끝에 붙어 있으므로 상태는 '보이는 봉 수'(tail) 하나다.
// PC 는 _chartWin{start,count} 와 핀치 중심 고정(rel·bi) 이 필요하지만, 팬을 안 넣어서 그게 없다.
(function (root, factory) {
  if (typeof module !== "undefined" && module.exports) module.exports = factory();
  else root.MSZoom = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  var DEFAULT_TAIL = 60;      // 화면폭 무관 고정 — 봉폭 기준으로 하면 펼침에서 197봉이 되어
                              // 예측 비중이 28%→11%, Phase 3 에서 고친 것이 원상복구된다.
  var DX_MIN = 2;             // 이보다 좁으면 몸통과 심지가 구분되지 않아 캔들이 얼룩이 된다
  var DX_MAX = 12;            // 이보다 넓으면 캔들이 비정상적으로 뚱뚱해진다
  var BAR_MIN = 20, BAR_MAX = 400;   // 절대 가드. 커버에선 BAR_MIN 이, 큰 화면에선 BAR_MAX 가 먼저 걸린다

  function limits(plotW, futW) {
    var f = futW || 0;
    var lo = Math.round(plotW / DX_MAX) - f;
    var hi = Math.round(plotW / DX_MIN) - f;
    lo = Math.max(BAR_MIN, Math.min(BAR_MAX, lo));
    hi = Math.max(BAR_MIN, Math.min(BAR_MAX, hi));
    if (hi < lo) hi = lo;   // 극단적으로 좁은 화면에서 역전 방지
    return { min: lo, max: hi };
  }

  function clamp(plotW, futW, tail) {
    var t = Math.round(tail);
    if (!isFinite(t)) return DEFAULT_TAIL;
    var L = limits(plotW, futW);
    return Math.max(L.min, Math.min(L.max, t));
  }

  // 벌리면 dist 가 커져 ratio<1 → 봉 수 감소 = 줌인. PC forge-app.js:1129 와 같은 식.
  function fromPinch(tail0, dist0, dist) {
    if (!isFinite(tail0)) return DEFAULT_TAIL;
    if (!(dist0 > 0) || !(dist > 0) || !isFinite(dist)) return Math.round(tail0);
    return Math.round(tail0 * (dist0 / dist));
  }

  return { limits: limits, clamp: clamp, fromPinch: fromPinch,
           DEFAULT_TAIL: DEFAULT_TAIL, DX_MIN: DX_MIN, DX_MAX: DX_MAX,
           BAR_MIN: BAR_MIN, BAR_MAX: BAR_MAX };
});
```

- [ ] **Step 4: `index.html` 태그**

`chart-layout.js` 뒤 아무 곳(의존 없음). `chart-layout.js` 다음 줄에 넣는다:

```html
<script src="chart-zoom.js"></script>
```

- [ ] **Step 5: 통과 확인**

Run: `cd map && ./tests/run.sh mobile`
Expected: PASS — 160건 (150 + 10)

- [ ] **Step 6: 변이 검증**

각 테스트가 실제로 무는지 확인한다. Phase 2·3에서 깨진 구현에 통과하는 테스트가 여러 건 나왔다.

1. `BAR_MIN`을 `1`로 → 절대 가드 테스트와 재클램프 테스트가 FAIL 해야 한다.
2. `fromPinch`의 `dist0 / dist`를 `dist / dist0`으로 뒤집는다 → 방향 테스트와 단조 테스트가 FAIL 해야 한다.
3. `DX_MAX`를 `40`으로 → 봉폭 불변식 테스트가 FAIL 해야 한다.
4. `DEFAULT_TAIL`을 `200`으로 → Phase 3 회귀 방지 테스트가 FAIL 해야 한다.

각각 되돌린 뒤 `git diff -- mobile/www/chart-zoom.js` 가 비어 있는지 확인한다.

- [ ] **Step 7: 커밋**

```bash
git add mobile/www/chart-zoom.js mobile/www/index.html mobile/test/chart-zoom.test.mjs
git commit -m "mobile(p4): 줌 계산 순수 함수 MSZoom — 봉폭 한계·클램프·핀치 수학"
```

---

### Task 3: 배선 — `tail` 상태 · 핀치 리스너 · 재클램프

**Files:**
- Modify: `mobile/www/screens/report.js` · `mobile/www/style.css`
- Test: 없음 (`report.js` 는 테스트 하네스가 없다 — 관문 유지 + 육안 확인)

**Interfaces:**
- Consumes: `MSZoom`(Task 2) · `MSChartLayout.plotWidth`(Task 1)
- Produces: 화면 동작. 다른 태스크가 의존하지 않는다.

> **이 태스크는 자동 검증이 약하다.** 관문은 다른 모듈이 안 깨졌다는 것만 증명한다. 소스를 꼼꼼히 읽는 것이 곧 검증이다. 끝내기 전에 `node --check mobile/www/screens/report.js` 로 파싱을 확인할 것.

- [ ] **Step 1: `TAIL_BARS` 를 변수로**

`report.js:9` 를 나눈다 — 상수는 기본값으로 남기고, 현재값을 `paintChart` 스코프의 변수로 둔다:

```js
  var CHART_H = 520, PAD = 10;
  // TAIL_BARS 는 이제 줌 레벨이다. 기본은 화면폭 무관 60봉(예측 비중 28% 유지, Phase 3 결론).
```

`paintChart` 안, `relayout()` 위에:

```js
    var tail = MSZoom.DEFAULT_TAIL;   // 화면 유지 중에만 산다. 종목을 바꾸면 paintChart 가 다시 불려 기본값으로 돌아간다.
```

`relayout()` 안의 `tailBars: TAIL_BARS` 를 `tailBars: tail` 로 바꾸고, 그 앞에서 현재 폭에 맞게 다시 클램프한다:

```js
    function relayout() {
      var dpr = window.devicePixelRatio || 1;
      cv.width = Math.round(cssW * dpr); cv.height = Math.round(CHART_H * dpr);
      cv.style.height = CHART_H + "px";
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      // 한계가 plotW 에 딸려 있다 — 폴드를 펴면 커버에서 쓰던 봉 수가 새 하한 밖일 수 있다.
      // (커버 20봉 → 펼침 하한 44봉). 폴드는 두 화면을 상시로 오가므로 예외가 아니라 일상 경로다.
      var fut = (an.out.prediction && an.out.prediction.path) ? an.out.prediction.path.length : 0;
      tail = MSZoom.clamp(MSChartLayout.plotWidth(cssW, PAD), fut, tail);
      lay = MSChartLayout.chartLayout({
        candle: data.candle, prediction: an.out.prediction,
        width: cssW, height: CHART_H, pad: PAD, tailBars: tail
      });
    }
```

`onResize` 는 이미 `relayout()` 을 부르므로 재클램프가 자동으로 따라온다 — 별도 처리 불필요. **이 사실을 주석으로 남길 것.**

- [ ] **Step 2: 핀치 리스너**

기존 `pointerdown` 리스너 근처(크로스헤어 배선 뒤)에 추가한다. `{ passive: false }` 필수 — 아니면 `preventDefault` 가 무시된다.

```js
    // ── 두 손가락 핀치 = 줌. 한 손가락은 지금 그대로(페이지 스크롤 + 350ms 홀드 크로스헤어) ──
    // 창이 오른쪽 끝 고정이라 핀치 중심 아래 봉을 붙잡는 계산(PC 의 rel·bi)이 필요 없다.
    var pinch = null, zoomRaf = null;
    function zoomFrame() {
      if (zoomRaf) return;
      zoomRaf = requestAnimationFrame(function () { zoomRaf = null; relayout(); frame(null); });
    }
    function touchDist(e) {
      var a = e.touches[0], b = e.touches[1];
      return Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
    }
    cv.addEventListener("touchstart", function (e) {
      if (!e.touches || e.touches.length !== 2) return;
      // 두 번째 손가락이 닿는 순간 홀드를 취소한다 — 안 그러면 핀치 도중 크로스헤어가 켜진다.
      if (holdTimer) { clearTimeout(holdTimer); holdTimer = null; }
      startPt = null;
      if (holding) { holding = false; frame(null); }
      pinch = { d0: Math.max(1, touchDist(e)), t0: tail };
      if (e.cancelable) e.preventDefault();
    }, { passive: false });
    cv.addEventListener("touchmove", function (e) {
      if (!pinch || !e.touches || e.touches.length !== 2) return;
      var fut = (an.out.prediction && an.out.prediction.path) ? an.out.prediction.path.length : 0;
      var next = MSZoom.clamp(MSChartLayout.plotWidth(cssW, PAD), fut,
                              MSZoom.fromPinch(pinch.t0, pinch.d0, Math.max(1, touchDist(e))));
      if (next !== tail) { tail = next; zoomFrame(); }
      if (e.cancelable) e.preventDefault();
    }, { passive: false });
    function endPinch(e) { if (!e.touches || e.touches.length < 2) pinch = null; }
    cv.addEventListener("touchend", endPinch);
    cv.addEventListener("touchcancel", endPinch);
```

> `holdTimer` · `startPt` · `holding` 는 기존 크로스헤어 배선의 변수다. 이름과 스코프를 **먼저 읽고** 맞출 것 — 다르면 실제 이름을 쓴다.

- [ ] **Step 3: `style.css` — 캔버스에만 `touch-action`**

`.rp-chart canvas` 규칙(현재 `style.css:69`)에 추가한다:

```css
/* pan-y: 세로 스크롤은 살리고(Phase 1 의 350ms 홀드 계약) 핀치만 우리 핸들러로 가져온다.
   user-scalable=no 는 쓰지 않는다 — 페이지 전체의 브라우저 줌을 죽여 접근성이 후퇴한다. */
.rp-chart canvas { display:block; width:100%; touch-action:pan-y; }
```

- [ ] **Step 4: 관문 + 파싱 확인**

Run: `cd map && ./tests/run.sh`
Expected: **160건 유지**(이 태스크는 테스트를 추가하지 않는다). 실패 0.

Run: `node --check map/mobile/www/screens/report.js`

- [ ] **Step 5: 자체 검토**

- `tail` 이 `paintChart` 스코프인가? 모듈 스코프면 종목을 바꿔도 남는다.
- `relayout()` 이 클램프를 하므로 `onResize` 에 중복 클램프를 넣지 않았는가?
- 핀치 중 `holding` 이 켜져 있었다면 껐는가? 안 끄면 크로스헤어가 화면에 남는다.
- `{ passive: false }` 를 두 리스너 모두에 줬는가?

- [ ] **Step 6: 커밋**

```bash
git add mobile/www/screens/report.js mobile/www/style.css
git commit -m "mobile(p4): 두 손가락 핀치 줌 배선 + 캔버스 touch-action:pan-y"
```

---

### Task 4: 백로그 + 육안 확인 항목

**Files:**
- Modify: `mobile/docs/BACKLOG-mobile.md`

- [ ] **Step 1: 전체 관문**

Run: `cd map && ./tests/run.sh`
Expected: 전체 통과, mobile 160건. 실패 스위트 0.

- [ ] **Step 2: 백로그 갱신**

`## ✅ 완료` 에 Phase 4 항목을 추가한다(파일의 기존 한국어 문체에 맞춰서):

- 두 손가락 핀치 줌. 창은 오른쪽 끝 고정이라 상태는 `tail` 하나 — `_chartWin{start,count}` 불필요
- 한계는 봉폭(2~12px), 기본은 봉 수(60 고정). 기본까지 봉폭 기준이면 펼침에서 197봉이 되어 Phase 3이 원상복구된다
- `user-scalable=no` 대신 캔버스에만 `touch-action:pan-y` — 페이지 줌 접근성과 350ms 홀드 계약을 둘 다 보존
- 폴드 전개 시 `relayout()` 이 재클램프(커버 20봉 → 펼침 44봉)

`## 📋 예정` 에 이월한다:

- **시간축 팬** — 넣으려면 `nowFi` 분리가 함께 와야 한다. 모바일 코드 15곳이 "마지막으로 보이는 봉"과 "최신 봉"을 같은 값으로 쓰고 있어, 팬을 넣는 순간 현재가 태그가 과거 봉에 붙는 식으로 조용히 틀리게 그려진다. PC는 `forge-draw.js:983`의 `atLatest`로 처리(창이 최신 봉을 포함하지 않으면 예측을 안 그림). 실사용으로 필요성 판단
- **로그축** — 미착수

- [ ] **Step 3: 육안 확인 항목 (에이전트는 수행 불가)**

브라우저·실기기가 없으므로 **수행하지 말고**, 아래를 보고서와 백로그에 그대로 옮겨 사람이 돌리게 한다. 관측했다고 쓰지 말 것.

```
cd map/mobile/www && python3 -m http.server 8000 --bind 0.0.0.0
폰 Chrome → http://<tailscale-ip>:8000
```

1. 차트 위에서 두 손가락으로 **벌리면 봉이 굵어지고 적어진다**(줌인). 오므리면 반대.
2. **페이지가 통째로 확대되지 않는다** — 차트만 바뀐다.
3. 차트 **밖**(판정 카드·칩 영역)에서 핀치하면 **페이지 줌은 정상 동작**한다.
4. 차트 위 한 손가락 세로 드래그로 **페이지가 여전히 스크롤된다**(홀드 전).
5. 길게 눌러 크로스헤어를 켠 상태에서 두 번째 손가락을 얹으면 **크로스헤어가 꺼지고 줌으로 넘어간다**.
6. 최대로 오므려도 **캔들이 얼룩이 되지 않는다**. 최대로 벌려도 지나치게 뚱뚱하지 않다.
7. 폰을 펼쳤다 접었을 때 **캔들 굵기가 이상해지지 않는다**(재클램프).
8. 줌 상태에서 레전드 값이 여전히 정상이고, 예측 구간도 함께 커진다.

- [ ] **Step 4: 커밋**

```bash
git add mobile/docs/BACKLOG-mobile.md
git commit -m "mobile(p4): Phase 4 종료 문서 + 팬 이월"
```

---

## 남는 열린 항목

- **시간축 팬** — `nowFi` 분리 + `atLatest` 예측 게이팅 필요. 실사용 판단 후
- **로그축** — 미착수
- **`Not checked at this level` 구조** — 시안 능력 4줄 vs 현행 지표칩 27개(Phase 3 이월)
- **Capacitor 툴체인 검증** — Phase 0~4 확인이 전부 폰 Chrome이지 WebView가 아니다
- Phase 3 이월: 레전드 칩 `min-width` 휴리스틱 · 시안 카피 전면 대조 · 로케일 시트
