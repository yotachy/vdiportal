# 차트 드로잉 도구 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 스쿱포지 차트에 추세선·평행채널·등락폭 재기·기간 재기 4종과 마그넷을 추가하고, 그림을 `(날짜, 가격)` 앵커로 종목별 영구 저장한다.

**Architecture:** 그리기 로직 전체를 신규 `forge-tools.js`(UMD)에 격리한다. 순수 좌표·기하 함수는 node에서 단위테스트하고, 렌더는 신규 `#fcDraws` 캔버스(`pointer-events:none`)에 그린다. 포인터 이벤트는 종전대로 `#fcMainChart`만 받고, 기존 분기(y축·시간축·팬) 앞에 `drawsPointerDown()` 한 줄만 끼워 넣어 무회귀를 보장한다.

**Tech Stack:** 순수 바닐라 JS(빌드 도구 없음) · classic script 전역 스코프 공유 · `node --test`(신규 `forge-tools.test.js`) · Canvas 2D · cafe24 SFTP 배포

## Global Constraints

- **앵커는 `(날짜, 가격)`.** 봉 번호로 저장하면 일→주 전환 시 봉 수가 약 1/5로 줄어 그림이 어긋난다.
- **포인터 이벤트는 `#fcMainChart`만 받는다.** `#fcDraws`는 `pointer-events:none`. 새 캔버스가 이벤트를 받으면 기존 팬·줌이 깨진다.
- **그림 0개 + 도구 꺼짐 → `drawsPointerDown`은 즉시 `false`.** 기존 팬·줌·축 드래그와 100% 동일해야 한다.
- **y축·시간축 스트립 조작은 도구 활성 중에도 유지**한다(그리기는 플롯 영역에서만).
- 히트 임계값: 끝점 핸들 **6px** · 본체 **5px** · 마그넷 흡착 **8px** (기존 관례: 엣지 끝점 6px·노드 드래그 4px).
- `forge-tools.js`는 **DOM 접근을 함수 안에서만** 한다(최상위에서 `document` 접근 금지 — node require가 깨진다).
- 로드 순서 고정: `core → state → ui → draw → tools → app`. `defer`/`async` 금지, 중복 최상위 선언 금지.
- **배포 동반 필수 파일이 7개 → 8개**가 된다(`forge-tools.js` 추가). 하나라도 빠지면 동작 불가.
- 배포 불가침: `forge_data.json`·`forge_images.json`·`forge_jobs.json`·`forge_td_key.txt`·`forge_ohlc_cache_*.json`.
- 라이브 검증은 **읽기 경로만**. `loadTicker`·`_addTickerDoc` 호출 금지(사용자 실데이터 손상).
- 작도 변경이므로 **스크린샷 육안 대조 필수** — 픽셀 수 비교로 끝내지 않는다.
- 커밋 메시지는 한국어, 말미에 `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`.

---

## File Structure

| 파일 | 변경 | 책임 |
|---|---|---|
| `forge-tools.js` | **신규** | 그리기 전부 — 순수 기하 헬퍼 · 상태 · 렌더 · 히트테스트 · 포인터 · 툴바 |
| `forge-tools.test.js` | **신규** | 순수 헬퍼 단위테스트 |
| `forge.html` | 수정 | `#fcDraws` 캔버스 · `<script src>` 추가 · 도구 버튼 |
| `forge.css` | 수정 | `#fcDraws` 레이어 · 도구 팝오버 |
| `forge-draw.js:1265` | 수정 | `fcDrawMainChart` 끝에서 `drawsRender()` 호출 |
| `forge-app.js:1137~1211` | 수정 | 포인터 분기에 `draws*` 위임 |
| `forge-ui.js:1465` | 수정 | 전역 `keydown` 앞에 `drawsKey(e)` 선처리 |
| `forge-state.js:558` | 수정 | `loadDoc`에서 `dc.draws` 복원 |
| `CLAUDE.md` | 수정 | 파일 목록·동반 배포 목록 갱신 |

---

### Task 1: 순수 좌표·기하 헬퍼 (TDD)

**Files:**
- Create: `forge-tools.js`
- Create: `forge-tools.test.js`

**Interfaces:**
- Consumes: 없음(순수 함수)
- Produces: 이후 모든 태스크가 쓴다
  - `tToFi(times, t)` → `number` — 날짜 문자열 → 봉 위치(소수 가능, 창 밖이면 음수/초과)
  - `fiToT(times, fi)` → `string` — 봉 위치 → 날짜 문자열(반올림, 미래는 마지막 날짜)
  - `segDist(px, py, ax, ay, bx, by)` → `number` — 점과 선분의 최단 픽셀 거리
  - `chanOff(a, b, pt)` → `number` — 기준선(a,b)에서 점 pt까지의 **수직 가격 차**

- [ ] **Step 1: 실패하는 테스트를 작성한다**

`forge-tools.test.js` 신규 생성:

```js
const test = require("node:test");
const assert = require("node:assert");
const T = require("./forge-tools.js");

const TIMES = ["2026-01-05","2026-01-06","2026-01-07","2026-01-08","2026-01-09"];

test("tToFi: 정확히 일치하는 날짜는 그 인덱스", () => {
  assert.strictEqual(T.tToFi(TIMES, "2026-01-05"), 0);
  assert.strictEqual(T.tToFi(TIMES, "2026-01-08"), 3);
});

test("tToFi: 두 봉 사이는 선형 보간(일봉 선을 주봉에서 볼 때)", () => {
  // 01-06 과 01-07 사이의 중간 지점
  const fi = T.tToFi(["2026-01-06","2026-01-08"], "2026-01-07");
  assert.ok(fi > 0 && fi < 1, "0과 1 사이여야: " + fi);
  assert.ok(Math.abs(fi - 0.5) < 0.001, "중간이어야: " + fi);
});

test("tToFi: 첫 봉 이전은 음수(창 밖 → 클립 대상)", () => {
  assert.ok(T.tToFi(TIMES, "2026-01-01") < 0);
});

test("tToFi: 마지막 봉 이후는 마지막 간격으로 외삽(예측 구간)", () => {
  const fi = T.tToFi(TIMES, "2026-01-11");   // 마지막(idx 4)에서 2일 뒤
  assert.ok(fi > 4, "4보다 커야: " + fi);
  assert.ok(Math.abs(fi - 6) < 0.001, "하루=1봉 간격이면 6: " + fi);
});

test("tToFi: 빈 배열·잘못된 입력은 NaN", () => {
  assert.ok(Number.isNaN(T.tToFi([], "2026-01-05")));
  assert.ok(Number.isNaN(T.tToFi(TIMES, "")));
});

test("fiToT: 봉 위치 → 날짜(반올림), 범위 밖은 양끝으로 클램프", () => {
  assert.strictEqual(T.fiToT(TIMES, 2), "2026-01-07");
  assert.strictEqual(T.fiToT(TIMES, 2.4), "2026-01-07");
  assert.strictEqual(T.fiToT(TIMES, -3), "2026-01-05");
  assert.strictEqual(T.fiToT(TIMES, 99), "2026-01-09");
});

test("segDist: 선분 위의 점은 0, 수직 거리, 끝점 너머는 끝점까지", () => {
  assert.ok(T.segDist(5, 0, 0, 0, 10, 0) < 1e-9);      // 선분 위
  assert.ok(Math.abs(T.segDist(5, 3, 0, 0, 10, 0) - 3) < 1e-9);   // 수직
  assert.ok(Math.abs(T.segDist(-4, 0, 0, 0, 10, 0) - 4) < 1e-9);  // 왼쪽 너머
  assert.ok(Math.abs(T.segDist(14, 0, 0, 0, 10, 0) - 4) < 1e-9);  // 오른쪽 너머
});

test("chanOff: 기준선에서 점까지의 수직 가격 차(부호 유지)", () => {
  const a = { fi: 0, p: 100 }, b = { fi: 10, p: 200 };   // 봉당 +10
  assert.ok(Math.abs(T.chanOff(a, b, { fi: 5, p: 150 })) < 1e-9);   // 선 위 = 0
  assert.ok(Math.abs(T.chanOff(a, b, { fi: 5, p: 170 }) - 20) < 1e-9);
  assert.ok(Math.abs(T.chanOff(a, b, { fi: 5, p: 130 }) + 20) < 1e-9);
});
```

- [ ] **Step 2: 테스트를 돌려 실패를 확인한다**

Run: `cd /home/jschoi0223/projects/vdiportal/map && node --test forge-tools.test.js 2>&1 | tail -15`
Expected: FAIL — `Cannot find module './forge-tools.js'`

- [ ] **Step 3: 최소 구현을 작성한다**

`forge-tools.js` 신규 생성. **DOM 접근은 함수 안에서만** 한다(최상위에서 `document`를 만지면 node require가 깨진다):

```js
/* 스쿱포지 차트 드로잉 도구 — 추세선·평행채널·등락폭/기간 재기 + 마그넷.
   앵커는 (날짜, 가격). 봉 번호로 저장하면 일→주 전환 때 어긋난다.
   UMD: 브라우저에선 전역에 함수 노출(다른 classic script가 바로 호출),
        node 에선 module.exports(순수 헬퍼 단위테스트용). */
(function (root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else for (const k in api) root[k] = api[k];
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  /* 날짜 → 봉 위치. 정확 일치는 그 인덱스, 사이는 보간, 밖이면 외삽(음수/초과).
     주기를 바꿔도(일→주) 같은 화면 위치에 오게 하는 핵심. */
  function tToFi(times, t) {
    if (!Array.isArray(times) || times.length < 1 || !t) return NaN;
    const n = times.length;
    if (t <= times[0]) {
      if (t === times[0]) return 0;
      if (n < 2) return NaN;
      const span = _days(times[0], times[1]) || 1;            // 첫 간격으로 역외삽
      return -_days(t, times[0]) / span;
    }
    if (t >= times[n - 1]) {
      if (t === times[n - 1]) return n - 1;
      if (n < 2) return NaN;
      const span = _days(times[n - 2], times[n - 1]) || 1;    // 마지막 간격으로 외삽
      return (n - 1) + _days(times[n - 1], t) / span;
    }
    let lo = 0, hi = n - 1;                                   // 이진탐색으로 감싸는 두 봉
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (times[m] <= t) lo = m; else hi = m; }
    if (times[lo] === t) return lo;
    const d0 = _days(times[lo], times[hi]) || 1;
    return lo + _days(times[lo], t) / d0;
  }
  function _days(a, b) { return (Date.parse(b + "T00:00:00Z") - Date.parse(a + "T00:00:00Z")) / 86400000; }

  /* 봉 위치 → 날짜(반올림). 범위 밖은 양 끝으로 클램프 — 저장은 항상 실재 날짜로. */
  function fiToT(times, fi) {
    if (!Array.isArray(times) || !times.length) return "";
    const i = Math.max(0, Math.min(times.length - 1, Math.round(fi)));
    return times[i];
  }

  /* 점과 선분의 최단 거리(픽셀). 히트테스트용. */
  function segDist(px, py, ax, ay, bx, by) {
    const dx = bx - ax, dy = by - ay, L2 = dx * dx + dy * dy;
    if (L2 === 0) return Math.hypot(px - ax, py - ay);
    let t = ((px - ax) * dx + (py - ay) * dy) / L2;
    t = Math.max(0, Math.min(1, t));                          // 끝점 너머는 끝점까지
    return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
  }

  /* 기준선(a,b) 위 같은 fi 에서의 가격과 pt.p 의 차 = 평행채널 폭.
     점 3개를 독립 저장하면 평행이 깨지므로 이 오프셋 하나만 저장한다. */
  function chanOff(a, b, pt) {
    const span = (b.fi - a.fi) || 1;
    const onLine = a.p + (b.p - a.p) * ((pt.fi - a.fi) / span);
    return pt.p - onLine;
  }

  return { tToFi, fiToT, segDist, chanOff };
});
```

- [ ] **Step 4: 테스트를 돌려 통과를 확인한다**

Run: `cd /home/jschoi0223/projects/vdiportal/map && node --test forge-tools.test.js 2>&1 | tail -8`
Expected: PASS — `pass 8 / fail 0`

- [ ] **Step 5: 기존 테스트 무회귀 확인 후 커밋**

```bash
cd /home/jschoi0223/projects/vdiportal/map
node --test forge-core.test.js 2>&1 | grep -E "ℹ (pass|fail)"   # 251/0 이어야 함
cd /home/jschoi0223/projects/vdiportal
git add map/forge-tools.js map/forge-tools.test.js
git commit -m "$(cat <<'EOF'
feat(forge-tools): 드로잉 좌표·기하 순수 헬퍼 (TDD)

tToFi(날짜→봉 위치·보간·외삽)·fiToT·segDist(점-선분 거리)·chanOff(채널 폭).
앵커를 날짜로 저장해야 일→주 전환에도 그림이 제자리에 남는다. 8케이스.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: 저장 모델 + 렌더 레이어

**Files:**
- Modify: `forge-tools.js` (상태·렌더 추가)
- Modify: `forge.html:123` (캔버스), `forge.html:271` (script 태그)
- Modify: `forge.css` (`#fcDraws` 레이어)
- Modify: `forge-draw.js:1265` (`drawsRender()` 호출)
- Modify: `forge-state.js:558` (`dc.draws` 복원)

**Interfaces:**
- Consumes: Task 1의 `tToFi`
- Produces:
  - `DRAWS` — 현재 문서의 그림 배열(전역). 요소: `{id, type:"trend"|"channel"|"range"|"period", a:{t,p}, b:{t,p}, off?:number}`
  - `drawsLoad(arr)` — 문서 전환 시 복원
  - `drawsRender()` — `#fcDraws`에 전부 그리기(인자 없음, `_mainGeo`를 직접 읽음)
  - `drawsGeo()` → `{g, fiToX, pToY, xToFi, yToP, times} | null` — 현재 좌표계(Task 3·4가 재사용)

- [ ] **Step 1: 캔버스와 스크립트를 추가한다**

`forge.html:123`의 `<canvas id="fcFx" class="fc-fx"></canvas>` **바로 앞**에 삽입:

```html
              <canvas id="fcDraws" class="fc-draws"></canvas>
```

`forge.html:271`의 `<script src="forge-app.js...">` **바로 앞**에 삽입:

```html
  <script src="forge-tools.js?v=20260806a"></script>
```

`forge.css`에서 `.fc-fx` 규칙을 찾아 그 옆에 추가(z-index는 evidence(3)보다 위, fx(4)보다 아래):

```css
  .fc-draws{position:absolute;inset:0;z-index:3;pointer-events:none}   /* 그리기 레이어 — 이벤트는 #fcMainChart 가 전담 */
```

- [ ] **Step 2: 좌표계 헬퍼와 렌더를 구현한다**

`forge-tools.js`의 `return { tToFi, ... }` **바로 앞**에 삽입:

```js
  let DRAWS = [];
  function drawsLoad(arr) { DRAWS = Array.isArray(arr) ? arr.slice() : []; }
  function drawsAll() { return DRAWS; }

  const COL = { trend:"#e8b463", channel:"#5b8def", range:"#46c28e", period:"#8a92b2" };

  /* 현재 차트 좌표계. _mainGeo(fcDrawMainChart 가 매 프레임 갱신)를 그대로 써야
     지표 작도와 정합한다. 로그축이면 toY/yToP 가 log 공간을 경유한다. */
  function drawsGeo() {
    const cv = document.getElementById("fcMainChart"), g = cv && cv._mainGeo;
    if (!g) return null;
    const times = (typeof priceTimes === "function" ? priceTimes() : null) || [];
    const lg = v => g.log ? Math.log(Math.max(1e-9, v)) : v;
    const inv = v => g.log ? Math.exp(v) : v;
    const _lo = lg(g.loV), _hi = lg(g.hiV), plotH = g.ch - g.padTop - g.padBot;
    return {
      g, times,
      fiToX: fi => g.padX + ((fi - g.start) / Math.max(1, g.count - 1)) * g.histW,
      pToY:  p  => g.padTop + (1 - (lg(p) - _lo) / ((_hi - _lo) || 1)) * plotH,
      xToFi: x  => g.start + ((x - g.padX) / (g.histW || 1)) * Math.max(1, g.count - 1),
      yToP:  y  => inv(_lo + (1 - (y - g.padTop) / (plotH || 1)) * (_hi - _lo)),
    };
  }

  /* 앵커(날짜,가격) → 화면 좌표. 날짜가 시계열에 없으면 보간/외삽된 fi 를 쓴다. */
  function _pt(G, anc) {
    const fi = tToFi(G.times, anc.t);
    return { fi, x: G.fiToX(fi), y: G.pToY(anc.p) };
  }

  function _label(c, text, x, y, col) {
    c.save(); c.font = "700 11px Pretendard,'Malgun Gothic',sans-serif"; c.textAlign = "left";
    const w = c.measureText(text).width;
    c.fillStyle = "rgba(11,15,20,.86)";
    if (c.roundRect) { c.beginPath(); c.roundRect(x, y - 11, w + 12, 16, 4); c.fill(); }
    c.fillStyle = col; c.fillText(text, x + 6, y);
    c.restore();
  }

  function drawsRender() {
    const cv = document.getElementById("fcDraws"); if (!cv) return;
    const host = cv.parentElement, W = host ? host.clientWidth : 0, H = host ? host.clientHeight : 0;
    if (!W || !H) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 3), ww = Math.round(W * dpr), hh = Math.round(H * dpr);
    if (cv.width !== ww || cv.height !== hh) { cv.width = ww; cv.height = hh; }
    cv.style.width = W + "px"; cv.style.height = H + "px";
    const c = cv.getContext("2d");
    c.setTransform(dpr, 0, 0, dpr, 0, 0); c.clearRect(0, 0, W, H);
    const G = drawsGeo(); if (!G || !G.times.length) return;
    c.save(); c.beginPath(); c.rect(G.g.padX - 2, G.g.padTop, G.g.plotRight - G.g.padX + 4, G.g.ch - G.g.padTop - G.g.padBot); c.clip();
    for (const d of DRAWS) _renderOne(c, G, d, d.id === _selId);
    c.restore();
  }

  function _renderOne(c, G, d, sel) {
    const A = _pt(G, d.a), B = _pt(G, d.b), col = COL[d.type] || COL.trend;
    if (![A.x, A.y, B.x, B.y].every(isFinite)) return;
    c.lineWidth = sel ? 2.2 : 1.6; c.strokeStyle = col; c.setLineDash([]);
    if (d.type === "trend") {
      c.beginPath(); c.moveTo(A.x, A.y); c.lineTo(B.x, B.y); c.stroke();
      const bars = Math.max(1, Math.abs(B.fi - A.fi));
      const pct = ((d.b.p / d.a.p - 1) * 100) / bars;
      _label(c, (pct >= 0 ? "+" : "") + pct.toFixed(2) + "%/봉", B.x + 6, B.y, col);
    } else if (d.type === "channel") {
      const off = d.off || 0, A2 = { x: A.x, y: G.pToY(d.a.p + off) }, B2 = { x: B.x, y: G.pToY(d.b.p + off) };
      c.globalAlpha = .10; c.fillStyle = col;
      c.beginPath(); c.moveTo(A.x, A.y); c.lineTo(B.x, B.y); c.lineTo(B2.x, B2.y); c.lineTo(A2.x, A2.y); c.closePath(); c.fill();
      c.globalAlpha = 1;
      c.beginPath(); c.moveTo(A.x, A.y); c.lineTo(B.x, B.y); c.stroke();
      c.beginPath(); c.moveTo(A2.x, A2.y); c.lineTo(B2.x, B2.y); c.stroke();
    } else {   // range · period — 박스 렌더 공유, 라벨만 다름
      const x0 = Math.min(A.x, B.x), x1 = Math.max(A.x, B.x), y0 = Math.min(A.y, B.y), y1 = Math.max(A.y, B.y);
      c.globalAlpha = .10; c.fillStyle = col; c.fillRect(x0, y0, x1 - x0, y1 - y0); c.globalAlpha = 1;
      c.setLineDash([4, 3]); c.strokeRect(x0, y0, x1 - x0, y1 - y0); c.setLineDash([]);
      const txt = d.type === "range"
        ? (d.b.p - d.a.p >= 0 ? "+" : "") + (d.b.p - d.a.p).toFixed(2) + " · " + ((d.b.p / d.a.p - 1) * 100).toFixed(2) + "%"
        : Math.round(Math.abs(B.fi - A.fi)) + "봉 · " + Math.abs(Math.round((Date.parse(d.b.t) - Date.parse(d.a.t)) / 86400000)) + "일";
      _label(c, txt, x0 + 4, y0 - 4, col);
    }
    if (sel) {   // 선택 시 끝점 핸들
      c.fillStyle = col;
      for (const P of [A, B]) { c.beginPath(); c.arc(P.x, P.y, 4, 0, 7); c.fill(); c.strokeStyle = "#0b0f14"; c.lineWidth = 1.5; c.stroke(); }
    }
  }

  let _selId = null;
```

`return` 문을 다음으로 교체:

```js
  return { tToFi, fiToT, segDist, chanOff, drawsLoad, drawsAll, drawsGeo, drawsRender };
```

- [ ] **Step 3: 렌더 호출과 문서 복원을 배선한다**

`forge-draw.js:1265`의 `drawEvidence();` **바로 다음 줄**에 추가:

```js
    if (typeof drawsRender === "function") drawsRender();   // 그리기 레이어 — 지표 작도와 같은 _mainGeo 좌표계
```

`forge-state.js:558`의 `_logChart = !!dc.logChart; updateAxisBtns();` **바로 다음 줄**에 추가:

```js
    if (typeof drawsLoad === "function") drawsLoad(dc.draws);   // 그림 복원(없으면 빈 배열)
```

- [ ] **Step 4: 문법·회귀를 확인한다**

```bash
cd /home/jschoi0223/projects/vdiportal/map
node --check forge-tools.js && node --check forge-draw.js && node --check forge-state.js && echo "SYNTAX OK"
node --test forge-tools.test.js 2>&1 | grep -E "ℹ (pass|fail)"
node --test forge-core.test.js 2>&1 | grep -E "ℹ (pass|fail)"
```
Expected: `SYNTAX OK` · 8/0 · 251/0

- [ ] **Step 5: 씨앗 그림으로 렌더를 육안 확인한다**

로컬 정적 서버 + 헤드리스. **쓰기는 전부 차단**하고 OHLC 읽기만 라이브로 우회한다.

```bash
cd /home/jschoi0223/projects/vdiportal/map
(python3 -m http.server 8797 >/dev/null 2>&1 &) ; sleep 1
python3 - <<'PY'
src = open('forge.html', encoding='utf-8').read()
hook = r"""
<script>
(function(){
  var rf=window.fetch;
  window.fetch=function(u,o){ var url=String(u);
    if(o&&String(o.method||'GET').toUpperCase()!=='GET') return Promise.resolve(new Response('{"ok":false}',{status:200,headers:{'Content-Type':'application/json'}}));
    if(url.indexOf('forge-api.php')===0) url='https://parksvc.mycafe24.com/map/'+url;
    return rf(url,o); };
  function tk(d){ try{ var n=(d.nodes||[]).find(function(x){return x.blockType==='ticker';}); return n&&n.params?String(n.params.symbol||'').toUpperCase():''; }catch(e){return '';} }
  setTimeout(function(){
    var d=(DOCS||[]).find(function(x){return tk(x)==='AAPL';})||DOCS[0];
    if(d) switchDoc(d.id);
    setTimeout(function(){
      try{ runEngine(); }catch(e){}
      setTimeout(function(){
        var t=priceTimes()||[], p=priceSeries()||[];
        var i0=Math.max(0,t.length-120), i1=t.length-1;
        drawsLoad([
          {id:"t1",type:"trend",  a:{t:t[i0],p:p[i0]}, b:{t:t[i1],p:p[i1]}},
          {id:"c1",type:"channel",a:{t:t[i0],p:p[i0]*0.95}, b:{t:t[i1],p:p[i1]*0.95}, off:p[i1]*0.06},
          {id:"r1",type:"range",  a:{t:t[i0+20],p:p[i0+20]}, b:{t:t[i0+60],p:p[i0+60]}},
          {id:"p1",type:"period", a:{t:t[i0+70],p:p[i0+70]}, b:{t:t[i0+100],p:p[i0+100]}},
        ]);
        drawsRender();
        document.title='READY';
      },5000);
    },5000);
  },1200);
})();
</script>
</body>"""
open('_dt.html','w',encoding='utf-8').write(src.replace('</body>', hook))
PY
CHROME="/mnt/c/Program Files/Google/Chrome/Application/chrome.exe"
"$CHROME" --headless=new --disable-gpu --hide-scrollbars --window-size=1500,760 --virtual-time-budget=80000 \
  --screenshot="C:\\Users\\yotac\\screenshots\\draws1.png" "http://127.0.0.1:8797/_dt.html" >/dev/null 2>&1
```

스크린샷을 **Read 도구로 직접 열어 눈으로 확인**한다. 확인 항목:
- 추세선이 캔들 위에 그려지고 우측에 `+N.NN%/봉` 라벨
- 평행채널 두 선이 실제로 평행하고 사이가 반투명하게 채워짐
- 등락폭 박스에 `Δ가격 · Δ%`, 기간 박스에 `N봉 · N일`
- 네 그림이 플롯 영역을 벗어나 축 위로 넘치지 않음(클립 동작)

- [ ] **Step 6: 임시 파일을 정리하고 커밋**

```bash
cd /home/jschoi0223/projects/vdiportal/map
rm -f _dt.html
for p in $(ss -lptn 'sport = :8797' 2>/dev/null | grep -oP 'pid=\K[0-9]+' | sort -u); do kill "$p" 2>/dev/null; done
cd /home/jschoi0223/projects/vdiportal
git add map/forge-tools.js map/forge.html map/forge.css map/forge-draw.js map/forge-state.js
git commit -m "$(cat <<'EOF'
feat(forge): 드로잉 렌더 레이어 — #fcDraws + 4종 작도

_mainGeo 좌표계를 그대로 써 지표 작도와 정합. pointer-events:none 이라
기존 팬·줌 무영향. dc.draws 로 문서에 실려 loadDoc 이 복원.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: 도구 팝오버 + 새로 그리기

**Files:**
- Modify: `forge-tools.js` (arm·생성 포인터)
- Modify: `forge.html` (도구 버튼 + 팝오버)
- Modify: `forge.css` (팝오버)
- Modify: `forge-app.js:1137` (pointerdown 위임)

**Interfaces:**
- Consumes: Task 2의 `drawsGeo`·`drawsRender`·`DRAWS`
- Produces:
  - `drawsArm(type)` — `"trend"|"channel"|"range"|"period"|null`
  - `drawsPointerDown(e, cx, cy)` → `boolean` (true면 호출부는 기존 팬을 시작하지 않음)
  - `drawsPointerMove(e, cx, cy)` / `drawsPointerUp(e)`
  - `drawsClear()` · `drawsMagnet(on)`(Task 5에서 채움, 지금은 플래그만)

- [ ] **Step 1: 도구 버튼과 팝오버 마크업을 추가한다**

`forge.html`에서 `<div class="pane-seg"` **바로 앞**에 삽입:

```html
              <button class="pane-btn" id="drawToolBtn" onclick="toggleDrawPop()" title="차트 드로잉 도구"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 20l4-1 9.5-9.5a2.1 2.1 0 0 0-3-3L5 16z"/><path d="M13.5 6.5l3 3"/></svg><span class="hlbl">도구</span></button>
```

`forge.html`의 `<div id="chartPresetPop" class="chart-pop"` 블록 **바로 앞**에 삽입:

```html
      <div id="drawPop" class="chart-pop" aria-hidden="true">
        <div class="chart-pop-head"><span class="chart-pop-title">차트 드로잉</span><button class="ph-btn" onclick="toggleDrawPop()" aria-label="닫기">✕</button></div>
        <div class="chart-pop-body">
          <div class="dp-tools">
            <button class="dp-btn" data-draw="trend">추세선</button>
            <button class="dp-btn" data-draw="channel">평행채널</button>
            <button class="dp-btn" data-draw="range">등락폭 재기</button>
            <button class="dp-btn" data-draw="period">기간 재기</button>
          </div>
          <label class="dp-mag"><input type="checkbox" id="drawMagnet"> 마그넷 — 고·저·시·종에 흡착</label>
          <button class="dp-clear" onclick="drawsClear()">전체 지우기</button>
        </div>
      </div>
```

`forge.css`의 `.chart-pop` 규칙 뒤에 추가:

```css
  .dp-tools{display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-bottom:10px}
  .dp-btn{background:var(--surface);border:1px solid var(--line);border-radius:var(--r-md);padding:8px 6px;color:var(--ink);font-size:12px;font-weight:700;cursor:pointer}
  .dp-btn:hover{border-color:var(--gold-dim)}
  .dp-btn.on{background:rgba(232,180,99,.16);border-color:var(--gold);color:var(--gold)}
  .dp-mag{display:flex;align-items:center;gap:7px;font-size:12px;color:var(--eth);margin-bottom:10px;cursor:pointer}
  .dp-clear{width:100%;background:transparent;border:1px solid var(--line);border-radius:var(--r-md);padding:7px;color:var(--muted);font-size:12px;cursor:pointer}
  .dp-clear:hover{color:var(--bear);border-color:var(--bear)}
```

- [ ] **Step 2: 도구 상태와 생성 포인터를 구현한다**

`forge-tools.js`의 `let _selId = null;` 다음에 삽입:

```js
  let _armed = null, _magnet = false, _drag = null, _newDraw = null;

  function _uid() { return "d_" + Math.random().toString(36).slice(2, 8); }
  function _persist() { const d = (typeof activeDoc === "function") ? activeDoc() : null; if (d) d.draws = DRAWS.slice(); if (typeof markDirty === "function") markDirty(); }

  function toggleDrawPop() {
    const p = document.getElementById("drawPop"); if (!p) return;
    const on = p.style.display === "block";
    p.style.display = on ? "none" : "block";
    p.setAttribute("aria-hidden", on ? "true" : "false");
  }
  function drawsArm(type) {
    _armed = (_armed === type) ? null : type;
    document.querySelectorAll(".dp-btn").forEach(b => b.classList.toggle("on", b.getAttribute("data-draw") === _armed));
    const cv = document.getElementById("fcMainChart"); if (cv) cv.style.cursor = _armed ? "crosshair" : "grab";
  }
  function drawsMagnet(on) { _magnet = !!on; }
  function drawsClear() { DRAWS = []; _selId = null; _persist(); drawsRender(); }

  /* 화면 좌표 → 앵커(날짜, 가격). 마그넷이 켜져 있으면 Task 5 에서 흡착을 적용한다. */
  function _anchorAt(G, cx, cy) {
    const fi = G.xToFi(cx);
    return { t: fiToT(G.times, fi), p: _snapPrice(G, fi, cy) };
  }
  function _snapPrice(G, fi, cy) { return G.yToP(cy); }   // Task 5 에서 마그넷 흡착으로 교체

  function drawsPointerDown(e, cx, cy) {
    const G = drawsGeo(); if (!G || !G.times.length) return false;
    if (_armed) {
      const a = _anchorAt(G, cx, cy);
      _newDraw = { id: _uid(), type: _armed, a, b: { t: a.t, p: a.p } };
      if (_armed === "channel") _newDraw.off = 0;
      DRAWS.push(_newDraw);
      _selId = _newDraw.id;
      _drag = { kind: "new", stage: 1 };
      drawsRender();
      return true;
    }
    return false;   // Task 4 에서 선택·이동 분기를 앞에 추가
  }

  function drawsPointerMove(e, cx, cy) {
    if (!_drag) return;
    const G = drawsGeo(); if (!G) return;
    if (_drag.kind === "new") {
      if (_drag.stage === 1) _newDraw.b = _anchorAt(G, cx, cy);
      else if (_drag.stage === 2) {   // 채널 3번째 점 = 폭
        const A = _pt(G, _newDraw.a), B = _pt(G, _newDraw.b);
        _newDraw.off = chanOff({ fi: A.fi, p: _newDraw.a.p }, { fi: B.fi, p: _newDraw.b.p }, { fi: G.xToFi(cx), p: G.yToP(cy) });
      }
      drawsRender();
    }
  }

  function drawsPointerUp() {
    if (!_drag) return;
    if (_drag.kind === "new") {
      if (_newDraw.type === "channel" && _drag.stage === 1) { _drag.stage = 2; return; }   // 채널은 한 번 더 클릭해 폭 지정
      const A = _pt(drawsGeo(), _newDraw.a), B = _pt(drawsGeo(), _newDraw.b);
      if (Math.hypot(B.x - A.x, B.y - A.y) < 6) DRAWS.pop();   // 점만 찍고 끝난 것 = 취소
      _newDraw = null; _drag = null; drawsArm(_armed);   // 도구 해제(연속 그리기 원하면 재클릭)
      _armed = null; drawsArm(null);
      _persist(); drawsRender();
    }
  }
```

`return` 문을 다음으로 교체:

```js
  return { tToFi, fiToT, segDist, chanOff, drawsLoad, drawsAll, drawsGeo, drawsRender,
           drawsArm, drawsMagnet, drawsClear, drawsPointerDown, drawsPointerMove, drawsPointerUp, toggleDrawPop };
```

파일 끝(UMD 닫기 직전)에 팝오버 배선을 추가:

```js
  if (typeof document !== "undefined") document.addEventListener("DOMContentLoaded", function () {
    const pop = document.getElementById("drawPop");
    if (pop) pop.addEventListener("click", e => {
      const b = e.target.closest("[data-draw]"); if (b) { drawsArm(b.getAttribute("data-draw")); return; }
    });
    const mg = document.getElementById("drawMagnet");
    if (mg) mg.addEventListener("change", () => drawsMagnet(mg.checked));
  });
```

- [ ] **Step 3: 기존 포인터 분기에 위임을 끼운다**

`forge-app.js:1155`의 `} else {                  // 플롯 영역 → 2D 패닝` 블록 **맨 앞**에 삽입(즉 `hDrag = {...}` 대입 앞):

```js
        // 그리기가 가져가면 팬을 시작하지 않는다. 그림 0개·도구 꺼짐이면 즉시 false → 종전과 동일.
        if (typeof drawsPointerDown === "function" && drawsPointerDown(e, cx, e.clientY - r.top)) {
          try { cv.setPointerCapture(e.pointerId); } catch (_) {}
          return;
        }
```

`forge-app.js:1162`의 `cv.addEventListener("pointermove", e => {` 본문 맨 앞(`if (!hDrag) {` 앞)에 삽입:

```js
      if (typeof drawsPointerMove === "function") { const r0 = cv.getBoundingClientRect(); drawsPointerMove(e, e.clientX - r0.left, e.clientY - r0.top); }
```

`forge-app.js:1209`의 `const endDrag = () => { hDrag = null; _heroZoomDragging = false; };`를 교체:

```js
    const endDrag = () => { if (typeof drawsPointerUp === "function") drawsPointerUp(); hDrag = null; _heroZoomDragging = false; };
```

- [ ] **Step 4: 문법·회귀를 확인한다**

```bash
cd /home/jschoi0223/projects/vdiportal/map
node --check forge-tools.js && node --check forge-app.js && echo "SYNTAX OK"
node --test forge-tools.test.js 2>&1 | grep -E "ℹ (pass|fail)"
node --test forge-core.test.js 2>&1 | grep -E "ℹ (pass|fail)"
```
Expected: `SYNTAX OK` · 8/0 · 251/0

- [ ] **Step 5: 커밋**

```bash
cd /home/jschoi0223/projects/vdiportal
git add map/forge-tools.js map/forge.html map/forge.css map/forge-app.js
git commit -m "$(cat <<'EOF'
feat(forge): 드로잉 도구 팝오버 + 새로 그리기

도구 armed 상태에서 플롯 드래그로 생성(채널은 폭 지정 클릭 1회 추가).
기존 pointerdown 분기 앞에 위임 한 줄만 끼워 그림 0개·도구 꺼짐이면
종전 팬과 완전히 동일하다. 좌측 세로 레일 대신 우측 팝오버 — 시연 HUD
(fixed left:12px z-95)와의 가림 사고를 피한다.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: 선택 · 이동 · 끝점 조정 · 삭제

**Files:**
- Modify: `forge-tools.js`
- Modify: `forge-ui.js:1465` (keydown 선처리)

**Interfaces:**
- Consumes: Task 1의 `segDist`, Task 3의 `_drag`·`_selId`
- Produces: `drawsHitTest(cx, cy)` → `null | {kind:"handle"|"body", id, which:"a"|"b"|null}` · `drawsKey(e)` → `boolean`

- [ ] **Step 1: 히트테스트와 드래그를 구현한다**

`forge-tools.js`의 `function drawsPointerDown` **바로 앞**에 삽입:

```js
  /* 히트테스트 — 선택된 그림의 끝점 핸들(6px)이 본체(5px)보다 우선.
     위에 그려진 것부터 잡도록 뒤에서부터 훑는다. */
  function drawsHitTest(cx, cy) {
    const G = drawsGeo(); if (!G || !G.times.length) return null;
    for (let i = DRAWS.length - 1; i >= 0; i--) {
      const d = DRAWS[i], A = _pt(G, d.a), B = _pt(G, d.b);
      if (!isFinite(A.x) || !isFinite(B.x)) continue;
      if (d.id === _selId) {
        if (Math.hypot(cx - A.x, cy - A.y) <= 6) return { kind: "handle", id: d.id, which: "a" };
        if (Math.hypot(cx - B.x, cy - B.y) <= 6) return { kind: "handle", id: d.id, which: "b" };
      }
      let hit = false;
      if (d.type === "trend") hit = segDist(cx, cy, A.x, A.y, B.x, B.y) <= 5;
      else if (d.type === "channel") {
        const A2y = G.pToY(d.a.p + (d.off || 0)), B2y = G.pToY(d.b.p + (d.off || 0));
        hit = segDist(cx, cy, A.x, A.y, B.x, B.y) <= 5 || segDist(cx, cy, A.x, A2y, B.x, B2y) <= 5;
      } else {   // range·period = 박스 테두리
        const x0 = Math.min(A.x, B.x), x1 = Math.max(A.x, B.x), y0 = Math.min(A.y, B.y), y1 = Math.max(A.y, B.y);
        hit = segDist(cx, cy, x0, y0, x1, y0) <= 5 || segDist(cx, cy, x0, y1, x1, y1) <= 5 ||
              segDist(cx, cy, x0, y0, x0, y1) <= 5 || segDist(cx, cy, x1, y0, x1, y1) <= 5;
      }
      if (hit) return { kind: "body", id: d.id, which: null };
    }
    return null;
  }
  function _byId(id) { return DRAWS.find(x => x.id === id) || null; }
```

`drawsPointerDown`의 `return false;   // Task 4 에서...` 줄을 교체:

```js
    const h = drawsHitTest(cx, cy);
    if (h) {
      _selId = h.id;
      const d = _byId(h.id);
      _drag = h.kind === "handle"
        ? { kind: "handle", which: h.which }
        : { kind: "move", fi0: G.xToFi(cx), p0: G.yToP(cy), a0: { ...d.a }, b0: { ...d.b } };
      drawsRender();
      return true;
    }
    if (_selId) { _selId = null; drawsRender(); }   // 빈 곳 클릭 = 선택 해제(팬은 그대로 진행)
    return false;
```

`drawsPointerMove`의 `if (_drag.kind === "new") {` 블록 **뒤**에 추가:

```js
    else if (_drag.kind === "handle") {
      const d = _byId(_selId); if (!d) return;
      d[_drag.which] = _anchorAt(G, cx, cy);
      drawsRender();
    } else if (_drag.kind === "move") {
      const d = _byId(_selId); if (!d) return;
      const dFi = G.xToFi(cx) - _drag.fi0, dP = G.yToP(cy) / (_drag.p0 || 1);   // 가격은 비율 이동(로그축 정합)
      for (const k of ["a", "b"]) {
        const src = _drag[k + "0"];
        d[k] = { t: fiToT(G.times, tToFi(G.times, src.t) + dFi), p: src.p * dP };
      }
      drawsRender();
    }
```

`drawsPointerUp`에 이동·핸들 종료를 추가 — `if (_drag.kind === "new") {` 블록 **뒤**에 `else` 절 추가:

```js
    else { _drag = null; _persist(); drawsRender(); }
```

- [ ] **Step 2: 키 처리를 구현하고 배선한다**

`forge-tools.js`에 추가(`drawsPointerUp` 뒤):

```js
  /* 전역 keydown 앞단에서 먼저 호출된다. true 를 반환하면 기존 단축키로 흘리지 않는다. */
  function drawsKey(e) {
    const ae = document.activeElement;
    if (ae && (ae.isContentEditable || ae.tagName === "INPUT" || ae.tagName === "TEXTAREA")) return false;
    if (e.key === "Escape") {
      if (_armed) { drawsArm(null); _armed = null; return true; }
      if (_selId) { _selId = null; drawsRender(); return true; }
      return false;
    }
    if ((e.key === "Delete" || e.key === "Backspace") && _selId) {
      DRAWS = DRAWS.filter(d => d.id !== _selId); _selId = null; _persist(); drawsRender(); return true;
    }
    return false;
  }
```

`return` 문에 `drawsHitTest, drawsKey`를 추가한다.

`forge-ui.js:1466`의 `const ae = document.activeElement;` **바로 앞**에 삽입:

```js
      if (typeof drawsKey === "function" && drawsKey(e)) { e.preventDefault(); return; }   // 그리기 도구 우선(Esc·Del)
```

- [ ] **Step 3: 문법·회귀를 확인한다**

```bash
cd /home/jschoi0223/projects/vdiportal/map
node --check forge-tools.js && node --check forge-ui.js && echo "SYNTAX OK"
node --test forge-tools.test.js 2>&1 | grep -E "ℹ (pass|fail)"
node --test forge-core.test.js 2>&1 | grep -E "ℹ (pass|fail)"
```
Expected: `SYNTAX OK` · 8/0 · 251/0

- [ ] **Step 4: 커밋**

```bash
cd /home/jschoi0223/projects/vdiportal
git add map/forge-tools.js map/forge-ui.js
git commit -m "$(cat <<'EOF'
feat(forge): 드로잉 선택·이동·끝점 조정·삭제

핸들(6px)이 본체(5px)보다 우선, 위에 그려진 것부터 히트. 통째 이동은
가격을 비율로 옮겨 로그축에서도 모양이 유지된다. Esc/Del 은 전역 keydown
앞단에서 선처리해 기존 단축키와 충돌하지 않는다.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: 마그넷

**Files:**
- Modify: `forge-tools.js` (`_snapPrice` 교체)

**Interfaces:**
- Consumes: Task 3의 `_magnet`·`_anchorAt`
- Produces: 없음(내부 동작만 바뀜)

- [ ] **Step 1: 흡착을 구현한다**

`forge-tools.js`의 `function _snapPrice(G, fi, cy) { return G.yToP(cy); }` 를 교체:

```js
  /* 마그넷 — 커서가 가리키는 봉의 시·고·저·종 중 화면상 8px 이내로 가장 가까운 값에 흡착.
     고점·저점을 정확히 집는 것이 목적. 캔들이 없으면(종가 전용) 종가만 후보. */
  function _snapPrice(G, fi, cy) {
    const raw = G.yToP(cy);
    if (!_magnet) return raw;
    const oh = (typeof priceOHLC === "function") ? priceOHLC() : null;
    const i = Math.round(fi);
    let cands = null;
    if (oh && oh[i]) cands = [oh[i].o, oh[i].h, oh[i].l, oh[i].c];
    else { const ps = (typeof priceSeries === "function") ? priceSeries() : null; if (ps && isFinite(ps[i])) cands = [ps[i]]; }
    if (!cands) return raw;
    let best = null, bestD = 8.0001;
    for (const v of cands) { if (!isFinite(v)) continue; const d = Math.abs(G.pToY(v) - cy); if (d < bestD) { bestD = d; best = v; } }
    return best == null ? raw : best;
  }
```

- [ ] **Step 2: 문법·회귀를 확인한다**

```bash
cd /home/jschoi0223/projects/vdiportal/map
node --check forge-tools.js && echo "SYNTAX OK"
node --test forge-tools.test.js 2>&1 | grep -E "ℹ (pass|fail)"
```
Expected: `SYNTAX OK` · 8/0

- [ ] **Step 3: 커밋**

```bash
cd /home/jschoi0223/projects/vdiportal
git add map/forge-tools.js
git commit -m "$(cat <<'EOF'
feat(forge): 마그넷 — 시·고·저·종 8px 흡착

도구가 아니라 모디파이어. 고점·저점을 정확히 집기 위함이고,
캔들이 없는 종가 전용 데이터에서는 종가에만 흡착한다.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 6: 통합 검증 · 배포 · 문서

**Files:**
- Modify: `forge.html` (캐시버스터)
- Modify: `CLAUDE.md` (파일·배포 목록)
- Modify: `docs/BACKLOG.md`

**Interfaces:**
- Consumes: Task 1~5 전부
- Produces: 배포된 라이브

- [ ] **Step 1: 주기 전환·로그축 좌표 유지를 숫자로 검증한다**

이 계획 전체에서 **가장 중요한 검증**이다. 일봉에서 그은 선이 주봉·로그축에서도 같은 날짜·가격에 붙어 있어야 한다.

```bash
cd /home/jschoi0223/projects/vdiportal/map
(python3 -m http.server 8797 >/dev/null 2>&1 &) ; sleep 1
python3 - <<'PY'
src = open('forge.html', encoding='utf-8').read()
hook = r"""
<script>
(function(){
  var rf=window.fetch;
  window.fetch=function(u,o){ var url=String(u);
    if(o&&String(o.method||'GET').toUpperCase()!=='GET') return Promise.resolve(new Response('{"ok":false}',{status:200,headers:{'Content-Type':'application/json'}}));
    if(url.indexOf('forge-api.php')===0) url='https://parksvc.mycafe24.com/map/'+url;
    return rf(url,o); };
  function tk(d){ try{ var n=(d.nodes||[]).find(function(x){return x.blockType==='ticker';}); return n&&n.params?String(n.params.symbol||'').toUpperCase():''; }catch(e){return '';} }
  var out=[];
  function snap(tag){
    var G=drawsGeo(); if(!G) { out.push({tag:tag,err:'nogeo'}); return; }
    var d=drawsAll()[0]; var A=null,B=null;
    if(d){ A={t:d.a.t,p:d.a.p,fi:T_tToFi(G.times,d.a.t)}; B={t:d.b.t,p:d.b.p,fi:T_tToFi(G.times,d.b.t)}; }
    out.push({tag:tag, tf:(document.querySelector('#fcTfSeg .on')||{}).textContent, log:G.g.log, a:A, b:B});
  }
  var T_tToFi = tToFi;
  setTimeout(function(){
    var d=(DOCS||[]).find(function(x){return tk(x)==='AAPL';})||DOCS[0];
    if(d) switchDoc(d.id);
    setTimeout(function(){
      var t=priceTimes()||[], p=priceSeries()||[];
      var i0=Math.max(0,t.length-120), i1=t.length-1;
      drawsLoad([{id:"t1",type:"trend",a:{t:t[i0],p:p[i0]},b:{t:t[i1],p:p[i1]}}]);
      drawsRender(); snap('0-일봉/선형');
      if(!_logChart) toggleLogChart();
      setTimeout(function(){ snap('1-일봉/로그');
        chartSetTF('1week');
        setTimeout(function(){ snap('2-주봉/로그');
          var d0=drawsAll()[0];
          var okT = d0 && out[0].a.t===d0.a.t && out[0].b.t===d0.b.t;
          var okP = d0 && out[0].a.p===d0.a.p && out[0].b.p===d0.b.p;
          out.push({RESULT:(okT&&okP)?'PASS(앵커 날짜·가격 불변)':'FAIL(앵커가 바뀜)'});
          var e=document.createElement('pre'); e.id='diag'; e.textContent='DIAG '+JSON.stringify(out,null,1); document.body.appendChild(e);
        },6000);
      },1200);
    },9000);
  },1200);
})();
</script>
</body>"""
open('_dt.html','w',encoding='utf-8').write(src.replace('</body>', hook))
PY
CHROME="/mnt/c/Program Files/Google/Chrome/Application/chrome.exe"
"$CHROME" --headless=new --disable-gpu --window-size=1500,760 --virtual-time-budget=90000 --dump-dom "http://127.0.0.1:8797/_dt.html" 2>/dev/null \
 | awk '/<pre id="diag">/{f=1} f{print} /<\/pre>/{if(f) exit}' | head -40
```

Expected: `RESULT: PASS(앵커 날짜·가격 불변)` — 그리고 `fi`(봉 위치)는 일봉↔주봉에서 **달라져야** 정상이다(같은 날짜를 다른 봉 격자에 매핑한 것이므로).

- [ ] **Step 2: 무회귀 — 그림 0개일 때 기존 조작이 그대로인지 확인한다**

```bash
cd /home/jschoi0223/projects/vdiportal/map
node -e '
// drawsPointerDown 은 그림 0개·도구 꺼짐이면 반드시 false 를 반환해야 한다(기존 팬 유지)
const T=require("./forge-tools.js");
console.log("순수 헬퍼 export:", Object.keys(T).join(", "));
' 
```
그리고 브라우저에서 육안 확인: 도구를 켜지 않은 상태로 차트를 드래그하면 종전처럼 팬되고, y축·시간축 드래그도 그대로여야 한다.

- [ ] **Step 3: 네 도구를 실제로 그려 육안 확인한다**

Task 2 Step 5의 하네스를 재사용해 스크린샷을 찍고 **Read 도구로 직접 열어** 확인한다:
- 추세선 `%/봉` 라벨 · 채널 평행 유지 · 등락폭 `Δ·%` · 기간 `봉·일`
- 선택 시 끝점 핸들 2개가 보이는지
- 마그넷 켜고 고점 근처를 찍었을 때 정확히 고가에 붙는지

- [ ] **Step 4: 임시 파일 정리 후 배포한다**

```bash
cd /home/jschoi0223/projects/vdiportal/map
rm -f _dt.html
for p in $(ss -lptn 'sport = :8797' 2>/dev/null | grep -oP 'pid=\K[0-9]+' | sort -u); do kill "$p" 2>/dev/null; done
# 캐시버스터 갱신(변경된 파일 전부)
sed -i 's|forge.css?v=[0-9a-z]*|forge.css?v=20260806g|; s|forge-ui.js?v=[0-9a-z]*|forge-ui.js?v=20260806g|; s|forge-draw.js?v=[0-9a-z]*|forge-draw.js?v=20260806g|; s|forge-app.js?v=[0-9a-z]*|forge-app.js?v=20260806g|; s|forge-state.js?v=[0-9a-z]*|forge-state.js?v=20260806g|; s|forge-tools.js?v=[0-9a-z]*|forge-tools.js?v=20260806g|' forge.html
grep -nE 'forge-[a-z]+\.js\?v=|forge\.css\?v=' forge.html
# 8개 정적 파일 동반 배포(forge-tools.js 신규 포함). forge-tools.test.js 는 배포 제외.
lftp -u 'parksvc,wjdtjd2@' sftp://parksvc.mycafe24.com -e "cd www/map; put forge.html; put forge.css; put forge-core.js; put forge-state.js; put forge-ui.js; put forge-draw.js; put forge-tools.js; put forge-app.js; bye"
echo -n "라이브 forge-tools.js: "; curl -s --compressed "https://parksvc.mycafe24.com/map/forge-tools.js?v=20260806g" | grep -c "function tToFi"
```

- [ ] **Step 5: 문서를 갱신하고 커밋·푸시한다**

`CLAUDE.md`에서 두 곳을 고친다.

1. 파일 목록의 `forge-draw.js` 설명 뒤에 `forge-tools.js`를 추가:
   `→ forge-tools.js(차트 드로잉 — 추세선·평행채널·등락폭/기간 재기·마그넷, 앵커=(날짜,가격))`
2. **동반 배포 필수** 줄의 파일 목록에 `forge-tools.js`를 넣고 개수를 7개 → 8개로 고친다.

`docs/BACKLOG.md`의 `## 🔥 진행 중 / 대기` 맨 위에 완료 항목을 추가한다:

> `~~**[차트] 드로잉 도구 4종 + 마그넷**~~ ✅ 완료(2026-08-06, <커밋범위>): 추세선·평행채널·등락폭 재기·기간 재기 + 마그넷. **앵커=(날짜, 가격)**이라 일/주/월 전환·줌·로그축을 자동 추종(봉 번호 저장이면 일→주에서 1/5로 어긋남). 신규 `forge-tools.js`(UMD — 순수 헬퍼는 `node --test`, 렌더는 `#fcDraws` pointer-events:none). 포인터는 기존 `fcMainChart` 분기 앞에 위임 한 줄만 끼워 그림 0개·도구 꺼짐이면 종전 팬과 동일. `dc.draws`로 종목별 영구 저장. 툴바는 우측 팝오버(좌측 세로 레일은 시연 HUD 가림 사고 회피). spec/plan `2026-08-06-chart-drawing-tools*`.

```bash
cd /home/jschoi0223/projects/vdiportal
git add map/forge.html map/CLAUDE.md map/docs/BACKLOG.md
git commit -m "$(cat <<'EOF'
docs(forge): 드로잉 도구 배포 — 캐시버스터·파일 목록·백로그

동반 배포 필수 파일 7개 → 8개(forge-tools.js 신규).

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
git push origin main
```

---

## Self-Review

**1. 스펙 커버리지**

| 스펙 항목 | 구현 태스크 |
|---|---|
| §2 앵커 (날짜, 가격) | Task 1(`tToFi`/`fiToT`) · Task 2(`_pt`) |
| §2.1 정확일치·보간·역외삽·미래외삽 | Task 1 Step 1 테스트 4건 |
| §2.1 `_times` 없으면 비활성 | Task 2 `drawsRender`·Task 3 `drawsPointerDown`의 `!G.times.length` 가드 |
| §2.2 `_mainGeo` 공유 · 역변환 신설 | Task 2 `drawsGeo`(`xToFi`/`yToP`) |
| §3 신규 파일 · 로드 순서 | Task 2 Step 1 |
| §3 `#fcDraws` pointer-events:none | Task 2 Step 1 CSS |
| §3.1 공개 인터페이스 8종 | Task 2·3·4의 `return` 문 |
| §4 포인터 우선순위 4단 | Task 3 Step 3(위임 위치) · Task 4 Step 1(내부 순서) |
| §4 키 처리(Esc·Del·입력 중 무시) | Task 4 Step 2 |
| §5 도구 4종 · 채널 `off` | Task 2 `_renderOne` · Task 3 생성 |
| §6 마그넷 8px · 종가 폴백 | Task 5 |
| §7 우측 팝오버 | Task 3 Step 1 |
| §8 `dc.draws` 저장·복원 | Task 2 Step 3(`loadDoc`) · Task 3 `_persist` |
| §9 검증 1~7 | Task 1(1~3) · Task 6 Step 1(4·5·6) · Task 6 Step 2(7) |
| §11 배포·동반 목록·캐시버스터 | Task 6 Step 4·5 |

누락 없음. §10(범위 밖)은 의도적으로 태스크가 없다.

**2. 플레이스홀더 스캔**

"TBD"·"적절히"·"테스트 작성" 류 없음. 모든 코드 스텝이 실제 코드를 포함한다. Task 6 Step 5의 백로그 문구에 `<커밋범위>`가 있는데, 이는 실행 시점에야 알 수 있는 값이라 의도적 자리표시다(형식은 기존 백로그 관례와 동일).

**3. 타입 일관성**

- `tToFi(times, t)` / `fiToT(times, fi)` / `segDist(px,py,ax,ay,bx,by)` / `chanOff(a,b,pt)` — Task 1 정의, Task 2·3·4에서 동일 시그니처로 사용 ✓
- `drawsGeo()` 반환 `{g, times, fiToX, pToY, xToFi, yToP}` — Task 2 정의, Task 3·4·5에서 동일 키로 소비 ✓
- `drawsPointerDown(e, cx, cy) → boolean` — Task 3 정의, Task 3 Step 3에서 반환값으로 분기 ✓
- `drawsHitTest → {kind, id, which}` — Task 4 정의·소비 ✓
- 그림 객체 `{id, type, a:{t,p}, b:{t,p}, off?}` — Task 2 렌더·Task 3 생성·Task 4 편집 전부 동일 ✓
- `_snapPrice(G, fi, cy)` — Task 3에서 자리만 두고 Task 5에서 교체, 시그니처 동일 ✓
