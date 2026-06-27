# 스쿱포지 연속형(과거+예측) 메인 차트 — 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 분석 시계열(`_visionData`)이 있을 때 대표 영역을 과거 라인 + "지금" 이음새 + 예측 콘이 한 캔버스에 연속되는 차트로 그리고, ▷ 포지 분석 재생도 그 차트 위에서 예측을 모핑한다.

**Architecture:** `.fc-hero`에 전폭 캔버스 `#fcMainChart`를 추가하고, `_visionData` 유무로 차트/이미지 모드를 토글(`fcHeroMode`). 공통 진입점 `fcRenderForecast(pred)`가 차트 모드면 `fcDrawMainChart(series,pred)`, 아니면 기존 `fcDrawFuture(pred)`로 분기 — `renderChart`와 `playAnalysis`가 이 한 곳만 호출.

**Tech Stack:** 바닐라 JS 단일 `forge.html`, 캔버스 2D(`fcFit` DPR 헬퍼), 기존 FC_* 색상 상수.

## Global Constraints

- 바닐라 JS · 빌드 도구/라이브러리 금지 · 단일 `forge.html`. 2-space 들여쓰기 · 큰따옴표 · 케밥케이스. UI 텍스트 한국어.
- 다크 테마 + 골드 토큰. 기존 색상 상수 사용: `FC_GOLD="#e8b463"`, `FC_DIM="#5A6478"`, `FC_GRID="#1b2334"`, `FC_ETH="#8a92b2"`.
- `forge-core.js` 변경 없음. `forge_*.json` 불가침.
- **차트 모드 조건 = `_visionData` 존재.** 시계열 없는 데모/이미지-only 포지는 기존 동작 유지(회귀 0).
- 공통 함수 재정의 금지. 캔버스는 `fcFit(cv, h)`로 DPR 대응(기존 패널과 동일).
- forge.html은 단일 UI 파일이라 node 단위테스트 없음 — 검증은 헤드리스(실 chromium, controller가 실행) + 스크린샷.

---

## File Structure

| 파일 | 변경 |
|---|---|
| `forge.html` | `#fcMainChart` 캔버스(HTML) + CSS 1줄, `fcDrawMainChart()`/`fcHeroMode()`/`fcRenderForecast()` 신규, `renderChart` 분기 배선 (Task 1) / `playAnalysis` 모핑 진입점 교체 (Task 2) |

---

## Task 1: 연속 차트 렌더 + 모드 토글 + renderChart 배선

**Files:**
- Modify: `forge.html` — `.fc-hero` 마크업(약 forge.html:101-102), 히어로 CSS(약 forge.html:144-148 부근, `#fcFuture` 규칙 옆), 함수 추가(차트 함수 영역, `fcDrawFuture` 정의 부근), `renderChart` 내부(약 forge.html:1738 `renderHero(); fcDrawFuture(...)`)

**Interfaces:**
- Consumes: `fcFit(cv,h)`, `currentData()`(→`{price,n}`), 전역 `_visionData`, `themeState`, `renderHero()`, `fcDrawFuture(pred)`, FC_* 색상.
- Produces:
  - `fcDrawMainChart(series, pred)` — `#fcMainChart`에 과거(`series.slice(-180)`) 라인 + "지금" 이음새 + 예측 콘/경로를 공유 y축으로 렌더. `pred={path,lo,hi,anchor}`.
  - `fcHeroMode(mode)` — `"chart"`면 `#fcMainChart` 표시·`#fcHeroImg`/`#fcFuture` 숨김·헤더 "분석 차트 · 과거+예측"; 그 외 반대.
  - `fcRenderForecast(pred)` — `_visionData` 있으면 `fcDrawMainChart(currentData().price, pred)`, 없으면 `fcDrawFuture(pred)`.

- [ ] **Step 1: `.fc-hero`에 캔버스 추가** (`forge.html`, `#fcFuture` 캔버스 다음 줄)

현재(약 forge.html:101-102):
```html
              <div class="fc-hero-img" id="fcHeroImg"><span class="fc-hero-ph">라이브러리에서 대표 이미지를 드래그하세요</span></div>
              <canvas id="fcFuture" class="fc-cv"></canvas>
```
변경(캔버스 한 줄 추가):
```html
              <div class="fc-hero-img" id="fcHeroImg"><span class="fc-hero-ph">라이브러리에서 대표 이미지를 드래그하세요</span></div>
              <canvas id="fcFuture" class="fc-cv"></canvas>
              <canvas id="fcMainChart" class="fc-cv"></canvas>
```

- [ ] **Step 2: CSS 추가** (`forge.html`, `#fcFuture{...}` 규칙 바로 뒤)

현재:
```css
  #fcFuture{flex:0 0 200px;height:100%}
```
변경:
```css
  #fcFuture{flex:0 0 200px;height:100%}
  #fcMainChart{flex:1;height:100%;display:none}
```

- [ ] **Step 3: `fcDrawMainChart` / `fcHeroMode` / `fcRenderForecast` 추가** (`forge.html`, `fcDrawFuture` 함수 정의 바로 뒤)

```js
  function fcDrawMainChart(series, pred) {
    const cv = document.getElementById("fcMainChart"); if (!cv) return;
    const ch = cv.clientHeight || 260, c = fcFit(cv, ch);
    const cw = cv.clientWidth || 600;
    c.clearRect(0, 0, cw, ch);
    const hist = (series || []).slice(-180);
    const path = (pred && pred.path) || [], lo = (pred && pred.lo) || [], hi = (pred && pred.hi) || [];
    if (hist.length < 2) {
      c.fillStyle = FC_DIM; c.font = "11px ui-monospace,monospace"; c.textAlign = "center";
      c.fillText("분석 데이터 없음", cw / 2, ch / 2); c.textAlign = "left"; return;
    }
    const anchor = (pred && pred.anchor != null) ? pred.anchor : hist[hist.length - 1];
    let loV = Math.min.apply(null, hist), hiV = Math.max.apply(null, hist);
    for (let i = 0; i < path.length; i++) { loV = Math.min(loV, lo[i]); hiV = Math.max(hiV, hi[i]); }
    loV = Math.min(loV, anchor); hiV = Math.max(hiV, anchor);
    const padV = (hiV - loV) * 0.1 || 1; loV -= padV; hiV += padV;
    const padX = 8, padTop = 16, padBot = 16, axisW = 46;
    const plotW = cw - padX - axisW;
    const total = hist.length + path.length;
    const histW = plotW * (hist.length / total);
    const seamX = padX + histW;
    const toY = v => padTop + (1 - (v - loV) / ((hiV - loV) || 1)) * (ch - padTop - padBot);
    const toXh = i => padX + (i / (hist.length - 1)) * histW;
    const toXf = k => seamX + ((k + 1) / Math.max(1, path.length)) * (plotW - histW);
    // grid
    c.strokeStyle = FC_GRID; c.lineWidth = 1;
    for (let g = 0; g <= 3; g++) { const gy = padTop + g / 3 * (ch - padTop - padBot); c.beginPath(); c.moveTo(padX, gy); c.lineTo(padX + plotW, gy); c.stroke(); }
    // history line
    c.strokeStyle = FC_GOLD; c.lineWidth = 2; c.beginPath();
    hist.forEach((v, i) => { const x = toXh(i), y = toY(v); i ? c.lineTo(x, y) : c.moveTo(x, y); }); c.stroke();
    // seam ("지금")
    c.strokeStyle = "#2b3647"; c.lineWidth = 1; c.setLineDash([3, 3]);
    c.beginPath(); c.moveTo(seamX, padTop - 6); c.lineTo(seamX, ch - padBot); c.stroke(); c.setLineDash([]);
    c.fillStyle = FC_DIM; c.font = "10px ui-monospace,monospace"; c.fillText("지금", seamX + 3, padTop - 2);
    // forecast cone + path (continues from anchor)
    if (path.length) {
      c.beginPath(); c.moveTo(seamX, toY(anchor));
      for (let k = 0; k < path.length; k++) c.lineTo(toXf(k), toY(hi[k]));
      for (let k = path.length - 1; k >= 0; k--) c.lineTo(toXf(k), toY(lo[k]));
      c.closePath(); c.fillStyle = "rgba(232,180,99,.14)"; c.fill();
      c.strokeStyle = FC_GOLD; c.lineWidth = 1.8; c.setLineDash([5, 4]);
      c.beginPath(); c.moveTo(seamX, toY(anchor));
      for (let k = 0; k < path.length; k++) c.lineTo(toXf(k), toY(path[k]));
      c.stroke(); c.setLineDash([]);
    }
    // y labels (right)
    c.fillStyle = FC_DIM; c.font = "10px ui-monospace,monospace"; c.textAlign = "left";
    const lx = padX + plotW + 4;
    c.fillText(Math.round(hiV).toLocaleString(), lx, padTop + 4);
    c.fillText(Math.round(loV).toLocaleString(), lx, ch - padBot);
    c.fillStyle = FC_GOLD; c.fillText(Math.round(anchor).toLocaleString(), lx, toY(anchor) + 3);
    if (path.length) { c.fillStyle = FC_ETH; c.fillText(Math.round(path[path.length - 1]).toLocaleString(), lx, toY(path[path.length - 1]) + 3); }
  }

  function fcHeroMode(mode) {
    const img = document.getElementById("fcHeroImg"), fut = document.getElementById("fcFuture"), main = document.getElementById("fcMainChart");
    const t = document.querySelector(".fc-panel-hero .fc-t");
    if (mode === "chart") {
      if (img) img.style.display = "none"; if (fut) fut.style.display = "none"; if (main) main.style.display = "block";
      if (t) t.innerHTML = "<b>분석 차트</b> · 과거+예측";
    } else {
      if (img) img.style.display = ""; if (fut) fut.style.display = ""; if (main) main.style.display = "none";
      if (t) t.innerHTML = "<b>대표 이미지</b> · 가격 차트";
    }
  }

  function fcRenderForecast(pred) {
    if (_visionData) fcDrawMainChart(currentData().price, pred);
    else fcDrawFuture(pred);
  }
```

- [ ] **Step 4: `renderChart` 배선 변경** (`forge.html`, 현재 `renderHero(); fcDrawFuture(...)` 줄)

현재(약 forge.html:1737-1738):
```js
    renderHero(); /* R2: fcDrawMain 비활성 — 히어로 이미지 갱신. 미래 존은 Task 2에서. */
    fcDrawFuture(result.prediction || { path: [], lo: [], hi: [] });
```
변경:
```js
    fcHeroMode(_visionData ? "chart" : "image");
    if (!_visionData) renderHero();
    fcRenderForecast(result.prediction || { path: [], lo: [], hi: [] });
```

- [ ] **Step 5: 헤드리스 검증 (차트 모드 + 회귀)**

(controller가 실행) 헤드리스 chromium(`LD_LIBRARY_PATH=/tmp/chrlibs/...` + `~/.cache/ms-playwright/chromium-1223/chrome-linux64/chrome`)으로 `file://.../forge.html` 로드(빈 데이터 → 샘플 부팅, `_visionData` 존재). page.evaluate 검증:
```js
// 차트 모드 활성
getComputedStyle(document.getElementById("fcMainChart")).display !== "none"  // true
getComputedStyle(document.getElementById("fcHeroImg")).display === "none"    // true
getComputedStyle(document.getElementById("fcFuture")).display === "none"     // true
document.getElementById("fcMainChart").width > 0                              // 그려짐(캔버스 백버퍼)
// 회귀: 시계열 제거 시 이미지 모드 복귀
(()=>{ _visionData=null; runForge(); return getComputedStyle(document.getElementById("fcMainChart")).display === "none"
   && getComputedStyle(document.getElementById("fcHeroImg")).display !== "none"; })()  // true
```
콘솔 에러 0. 스크린샷으로 과거 라인 + "지금" 이음새 + 예측 콘 연속 육안 확인.

> 구현자가 헤드리스를 못 돌리면 정적 트레이스 후 보고, controller가 헤드리스 확인.

- [ ] **Step 6: 커밋**

```bash
git add forge.html
git commit -m "feat(forge): 연속형 메인 차트(과거+예측) + 시계열 있을 때 대표영역 차트 모드(fcDrawMainChart/fcHeroMode/fcRenderForecast)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 2: ▷ 포지 분석 재생 — 차트 위 예측 모핑

**Files:**
- Modify: `forge.html` — `playAnalysis` 내부 morph 콜백(약 forge.html:1862 `fcDrawFuture(lerpPred(from, to, u));`)

**Interfaces:**
- Consumes: `fcRenderForecast(pred)`(Task 1), `lerpPred(from,to,u)`(기존), `_visionData`.
- Produces: 재생 중 프레임마다 `fcRenderForecast`로 그려 차트 모드면 연속 차트의 예측이 모핑(과거 고정), 이미지 모드면 기존 콘 모핑.

- [ ] **Step 1: morph 콜백의 그리기 호출 교체** (`forge.html` `playAnalysis` 내부)

현재:
```js
      function morph(now) {
        if (!_playing) return;
        const u = Math.min(1, (now - t0) / dur);
        fcDrawFuture(lerpPred(from, to, u));
        if (u < 1) { _playRaf = requestAnimationFrame(morph); }
        else { prevPred = to; i++; _playT = setTimeout(step, 180); }
      }
```
변경(`fcDrawFuture` → `fcRenderForecast`):
```js
      function morph(now) {
        if (!_playing) return;
        const u = Math.min(1, (now - t0) / dur);
        fcRenderForecast(lerpPred(from, to, u));
        if (u < 1) { _playRaf = requestAnimationFrame(morph); }
        else { prevPred = to; i++; _playT = setTimeout(step, 180); }
      }
```

> 재생 시작 시 `playAnalysis`가 `runForge()`를 먼저 호출 → `renderChart`가 `fcHeroMode` 설정(Task 1). 따라서 모핑 진입 시 이미 올바른 모드. 재생 종료의 `renderChart(lastResult, currentData())`도 Task 1 배선으로 차트 모드 정착.

- [ ] **Step 2: 헤드리스 검증 (재생 차트 모핑)**

(controller가 실행) 샘플 로드 후:
```js
// 재생이 차트 위에서 도는지: fcRenderForecast가 _visionData에서 fcDrawMainChart로 분기
typeof fcRenderForecast === "function"                          // true
// 보간 예측 1프레임 직접 그려 에러 없는지 + 차트 모드 유지
(()=>{ const p=lastResult.prediction; fcRenderForecast(p);
  return getComputedStyle(document.getElementById("fcMainChart")).display !== "none"; })()  // true
// reduced-motion 아닌 환경에서 playAnalysis 시작→중단 안전(타이머 정리)
(()=>{ playAnalysis(); const on=_playing; stopPlay(); return on===true && _playing===false; })()  // true
```
콘솔 에러 0. (가능하면 가상시간/지연 후 중간 프레임 스크린샷으로 예측 콘 모핑 육안.)

- [ ] **Step 3: 커밋**

```bash
git add forge.html
git commit -m "feat(forge): 포지 분석 재생을 연속 차트 위 예측 모핑으로(fcRenderForecast 경유)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## 최종 검증 체크리스트

- [ ] 헤드리스: 샘플(빈 부팅) → 차트 모드(#fcMainChart 표시, 이미지/200px콘 숨김), 과거 라인 + "지금" 이음새 + 예측 콘 연속, y축 라벨. 콘솔 에러 0. 스크린샷 육안.
- [ ] 회귀: `_visionData` 없는 포지(데모/이미지-only)에서 차트 모드 미발동(기존 이미지/placeholder 유지).
- [ ] 재생: ▷ 포지 분석이 차트 위에서 예측 모핑, 시작/중단 안전.
- [ ] 라이브 샘플 포지(서버)에도 반영 — 배포 후 재확인.
- [ ] 배포: forge.html → cafe24 `www/map/`. `forge_*.json` 미전송.

## 비범위

- 캔들(OHLC) 차트(현재 종가 라인), 이미지 위 픽셀 정밀 보조선(R5b-2), 줌/팬·툴팁.
