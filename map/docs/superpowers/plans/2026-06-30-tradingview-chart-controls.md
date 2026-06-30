# 트레이딩뷰식 차트 조작 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 차트에 TradingView식 가격축 수동 스케일 + 오토 토글을 넣고, A/L 버튼을 세로축 아래로 옮기며, 예측 영역이 비대해지는 이음새 줌 문제를 고친다.

**Architecture:** 전부 표현 계층(`forge.html`)만 수정 — 코어/예측 로직 무변경. 전역 `_yScale{mode,lo,hi}`로 y범위를 auto(보이는 캔들 고저) / manual(고정·드래그) 분기. 포인터다운을 x영역으로 분기(우측 y축 스트립=가격 수동 스케일). `histW`에 history 최소 78% 캡. A/L 버튼은 hero 우하단 오버레이.

**Tech Stack:** 바닐라 JS, 무빌드, 단일 HTML(`forge.html`). Canvas 2D. 외부 라이브러리 없음. `forge-core.js` 무변경.

## Global Constraints

- 바닐라 JS·무빌드·단일 HTML 유지. 외부 라이브러리 금지. **`forge-core.js` 무변경**(코어 테스트 83/0).
- 다크 토큰만(골드 `#e8b463`, bull `#46c28e`, bear `#e06a6a`, 보조 `#8a92b2`, `--line`/`--eth`). UI 한국어. `noindex` 유지.
- **따옴표 위생**: 편집 도구가 ASCII `"`→굽은따옴표 `“”`로 바꾸는 사고 반복. 의도 굽은따옴표 `&ldquo;`/`&rdquo;`, 가운뎃점 `\xb7`. 각 커밋 전 `git diff` 확인.
- `_yScale.mode==="auto"`일 때 시각 동작은 기존과 동일(단 §Task1 histW 캡으로 예측 영역만 좁아짐 — 의도된 개선). 헤더 LOG 버튼 제거 외 회귀 0.
- `_yScale`는 세션 메모리(영속 안 함). 새 데이터·⊕ 전체 리셋·y축 더블클릭 시 auto 복귀.

## 검증 공통

- forge.html 인라인 JS 파싱: `node -e "const fs=require('fs');const h=fs.readFileSync('forge.html','utf8');const m=[...h.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(x=>x[1]).join('\n;\n');new Function(m);console.log('JS OK')"`
- 코어: `cd map && node --test forge-core.test.js 2>&1 | grep -E "pass [0-9]+|fail [0-9]+"` → 83 pass / 0 fail.

---

## 현황 앵커 (구현 전 읽을 것)

- `forge.html` `fcDrawMainChart`(~2459):
  - y범위: `loV/hiV` = 보이는 캔들 `_ohW` h/l (없으면 hist 종가) + `if (atLatest)` 예측밴드 + `const padV = (hiV-loV)*0.08||1; loV-=padV; hiV+=padV;`(약 2519행).
  - 레이아웃: `const plotW = cw - padX - axisW;`(2515, `padX=8, axisW=46`), `const total = hist.length + path.length;`, `const histW = plotW * (hist.length / total);`, `seamX = padX+histW`, `toXh`/`toXf` 파생.
  - `cv._mainGeo = { padX, histW, seamX, plotW, padTop, padBot, ch, loV, hiV, …, start, count, winN }`(약 2527행).
- 포인터: `heroZoomInit`(~3789) `pointerdown`(시간 드래그 `hDrag` 캡처)·`pointermove`(시간 스크롤)·`endDrag`·`dblclick`(`resetChartWin()`)·`click`(legend 포커스). 휠=시간 줌. `_heroZoomDragging` 가드.
- 리셋 호출: `applyTickerOHLC`(~3994 `resetChartWin()`), loadDoc 재fetch(~1027 `resetChartWin()`), ⊕ 버튼 바인딩(~3822 `resetChartWin()`).
- 로그 토글: 헤더 버튼 `#logToggle`(523행 `📊 LOG`), `updateLogBtn()`(~2602, `#logToggle` 갱신), `toggleLogChart()`(~2605).
- ⊕ 리셋 버튼 `#fcZoomReset`(533행), CSS `.fc-zoom-reset`(214행).

---

## Task 1: 예측 이음새 줌 수정 (histW 78% 캡) + `_mainGeo.plotRight`

**Files:** Modify `map/forge.html`(`fcDrawMainChart` histW + `_mainGeo`).

**Interfaces:**
- Produces: `_mainGeo.plotRight = padX + plotW`(y축 스트립 경계, Task 3 영역 분기용). history 영역 ≥78%.

- [ ] **Step 1: histW에 history 최소 78% 캡**

`fcDrawMainChart`의 `const histW = plotW * (hist.length / total);` →
```js
    const histW = plotW * Math.max(0.78, hist.length / total);
```
> history가 항상 ≥78% → 예측 영역 ≤22%로 캡. `seamX`/`toXh`/`toXf`는 갱신된 `histW` 기준(파생, 자동 반영).

- [ ] **Step 2: `_mainGeo`에 `plotRight` 추가**

`cv._mainGeo = { …, winN: N }` 객체에 `plotRight: padX + plotW`를 추가(기존 키 유지):
```js
    cv._mainGeo = { padX, histW, seamX, plotW, padTop, padBot, ch, loV, hiV, bandTop, bandBot, histLen: hist.length, pathLen: path.length, hist, path, lo, hi, anchor, unit: (_visionTF ? _tfUnit(_visionTF) : "봉"), log: _logChart, start: wStart, count: wCount, winN: N, plotRight: padX + plotW };
```

- [ ] **Step 3: 검증 + 커밋**

JS 파싱 OK, 코어 83/0, 따옴표 무변형. 자기검토: 줌인 시 예측 영역이 화면의 ≤22%로 유지(이전엔 history 봉 수 줄면 비대), 이음새 위치 안정.
```bash
cd /home/jschoi0223/projects/vdiportal
git add map/forge.html
git commit -m "fix(forge): 예측 이음새 줌 — histW history 최소 78% 캡(예측영역 ≤22%) + _mainGeo.plotRight"
```

---

## Task 2: 가격축 스케일 상태 (`_yScale`) + auto/manual y범위 + 리셋 훅

**Files:** Modify `map/forge.html`(전역 `_yScale`·`resetYScale`; `fcDrawMainChart` y범위 분기; 리셋 호출 3곳).

**Interfaces:**
- Consumes: Task 1 `_mainGeo`(loV/hiV는 표시 범위).
- Produces: `_yScale = {mode, lo, hi}`; `resetYScale()`; manual일 때 고정 y범위(윈도 변해도 불변). Task 3/4가 `_yScale.mode`를 토글.

- [ ] **Step 1: 전역 + `resetYScale`** (예: `_chartWin` 근처)

```js
  let _yScale = { mode: "auto", lo: null, hi: null };
  function resetYScale() { _yScale = { mode: "auto", lo: null, hi: null }; }
```

- [ ] **Step 2: `fcDrawMainChart` y범위 manual 분기**

`fcDrawMainChart`의 `const padV = (hiV - loV) * 0.08 || 1; loV -= padV; hiV += padV;`(약 2519행) **다음 줄**에 추가:
```js
    if (_yScale.mode === "manual" && isFinite(_yScale.lo) && isFinite(_yScale.hi) && _yScale.hi > _yScale.lo) { loV = _yScale.lo; hiV = _yScale.hi; }
```
> manual이면 auto+pad 결과를 덮어씀. 이후 `_lo/_hi`(tvLog)·`toY`·`_mainGeo.loV/hiV`가 이 값을 사용 → 윈도(`_chartWin`)가 바뀌어도 `_yScale` 고정값이라 y가 안 튐. `_mainGeo.loV/hiV`는 표시 범위(manual 시 _yScale)라 Task 3 드래그 seed로 정확.

- [ ] **Step 3: 리셋 훅 3곳 — 새 데이터·⊕ 시 auto 복귀**

(3-a) `applyTickerOHLC`의 `if (typeof resetChartWin === "function") resetChartWin();`(~3994) 다음에:
```js
    if (typeof resetYScale === "function") resetYScale();
```
(3-b) loadDoc 재fetch 성공 블록의 `if (typeof resetChartWin === "function") resetChartWin();`(~1027) 다음에 동일 한 줄 추가.
(3-c) ⊕ 버튼 바인딩(~3822) `() => { resetChartWin(); renderHeroZoom(); }` →
```js
  (function() { const b = document.getElementById("fcZoomReset"); if (b) b.addEventListener("click", () => { resetChartWin(); resetYScale(); renderHeroZoom(); }); })();
```

- [ ] **Step 4: 검증 + 커밋**

JS 파싱 OK, 코어 83/0, 따옴표 무변형. 자기검토: `_yScale.mode="auto"` 기본은 기존과 동일(분기 미발동); manual로 lo/hi 세팅 시 그 범위 고정·윈도 변해도 불변; 새 데이터/⊕로 auto 복귀.
```bash
git add map/forge.html
git commit -m "feat(forge): 가격축 스케일 _yScale(auto/manual) — manual 고정 y범위 + 새데이터·리셋시 auto 복귀"
```

---

## Task 3: y축 드래그 = 가격축 수동 스케일 + 더블클릭 자동복귀

**Files:** Modify `map/forge.html`(`heroZoomInit` pointerdown/move/dblclick).

**Interfaces:**
- Consumes: Task 1 `_mainGeo.plotRight`/`loV`/`hiV`, Task 2 `_yScale`/`resetYScale`.
- Produces: 우측 y축 스트립 세로 드래그 → `_yScale` manual. y축 더블클릭 → auto.

- [ ] **Step 1: pointerdown 영역 분기 (y축 스트립 vs 시간)**

`heroZoomInit`의 `pointerdown` 핸들러(~3790)를 교체:
```js
    cv.addEventListener("pointerdown", e => {
      const main = document.getElementById("fcMainChart"), g = main && main._mainGeo; if (!g) return;
      const r = cv.getBoundingClientRect(), cx = e.clientX - r.left;
      if (cx > g.plotRight) {   // 우측 y축 스트립 → 가격축 수동 스케일
        hDrag = { mode: "yscale", y: e.clientY, lo: g.loV, hi: g.hiV, moved: false };
      } else {                  // 플롯 영역 → 시간 스크롤(기존)
        hDrag = { mode: "time", x: e.clientX, start: _chartWin.start, moved: false, barW: (g.histW || 1) / Math.max(1, g.count) };
      }
      try { cv.setPointerCapture(e.pointerId); } catch (_) {}
    });
```

- [ ] **Step 2: pointermove 분기 (y 스케일 / 시간 스크롤)**

`pointermove` 핸들러(~3795)를 교체:
```js
    cv.addEventListener("pointermove", e => {
      if (!hDrag) return;
      if (hDrag.mode === "yscale") {
        const dy = e.clientY - hDrag.y;
        if (Math.abs(dy) > 4) { hDrag.moved = true; _heroZoomDragging = true; }
        if (!hDrag.moved) return;
        const c = (hDrag.lo + hDrag.hi) / 2, half = (hDrag.hi - hDrag.lo) / 2 * Math.exp(dy / 150);   // 아래로=확대·위로=축소
        _yScale = { mode: "manual", lo: c - half, hi: c + half };
        renderHeroZoom();
        return;
      }
      const dx = e.clientX - hDrag.x;
      if (Math.abs(dx) > 6) { hDrag.moved = true; _heroZoomDragging = true; }
      if (!hDrag.moved) return;
      const main = document.getElementById("fcMainChart"), g = main && main._mainGeo; if (!g) return;
      const N = g.winN || 0, dBars = Math.round(-dx / (hDrag.barW || 1));
      _chartWin.start = Math.max(0, Math.min(N - _chartWin.count, hDrag.start + dBars));
      renderHeroZoom();
    });
```

- [ ] **Step 3: dblclick 영역 분기 (y축=auto복귀 / 플롯=윈도리셋)**

`dblclick` 핸들러(~3807) `() => { resetChartWin(); renderHeroZoom(); }` →
```js
    cv.addEventListener("dblclick", e => {
      const main = document.getElementById("fcMainChart"), g = main && main._mainGeo;
      const r = cv.getBoundingClientRect(), cx = e.clientX - r.left;
      if (g && cx > g.plotRight) { resetYScale(); }   // y축 더블클릭 → 자동 스케일
      else { resetChartWin(); }                        // 플롯 더블클릭 → 윈도 리셋
      renderHeroZoom();
    });
```
> `endDrag`·`click`(legend) 핸들러는 그대로. `_heroZoomDragging`이 드래그 후 click을 막아줌.

- [ ] **Step 4: 검증 + 커밋**

JS 파싱 OK, 코어 83/0, 따옴표 무변형. 자기검토: 우측 y축 세로 드래그로 가격축 확대(위)/축소(아래)·manual 전환; 좌우 시간 스크롤은 플롯 영역에서 동작(분리); y축 더블클릭=auto, 플롯 더블클릭=윈도 리셋.
```bash
git add map/forge.html
git commit -m "feat(forge): y축 스트립 드래그=가격축 수동 스케일 + y축 더블클릭=자동 복귀 (포인터 영역 분기)"
```

---

## Task 4: A / L 버튼 (세로축 아래) + 로그 토글 이전 + 헤더 LOG 제거

**Files:** Modify `map/forge.html`(hero 마크업·CSS·`updateAxisBtns`; 헤더 `#logToggle` 제거; `toggleLogChart`/`updateLogBtn` 연결).

**Interfaces:**
- Consumes: Task 2 `_yScale`/`resetYScale`, 기존 `toggleLogChart()`/`_logChart`.
- Produces: hero 우하단 `A`(오토)·`L`(로그) 버튼; `updateAxisBtns()`가 둘의 `.on` 동기화.

- [ ] **Step 1: 버튼 마크업 (hero 우하단)**

hero(`.fc-hero`)에서 `#fcZoomReset` 버튼(533행) 다음에 추가:
```html
              <div class="fc-axis-btns" id="fcAxisBtns">
                <button id="autoBtn" class="fc-axis-btn" title="자동 스케일">A</button>
                <button id="logBtn" class="fc-axis-btn" title="로그/선형 스케일">L</button>
              </div>
```

- [ ] **Step 2: CSS**

`.fc-zoom-reset` CSS(214행) 근처에 추가:
```css
  .fc-axis-btns{position:absolute;right:6px;bottom:8px;z-index:4;display:flex;gap:4px}
  .fc-axis-btn{width:22px;height:22px;border-radius:5px;border:1px solid var(--line);background:rgba(11,15,20,.6);color:var(--eth);font-size:12px;font-weight:700;cursor:pointer;line-height:1}
  .fc-axis-btn.on{border-color:var(--gold);color:var(--gold);background:rgba(232,180,99,.14)}
```

- [ ] **Step 3: `updateAxisBtns` + 버튼 핸들러**

`updateLogBtn()`(~2602)를 `updateAxisBtns()`로 대체(또는 추가)하고 둘 다 갱신:
```js
  function updateAxisBtns() {
    const a = document.getElementById("autoBtn"); if (a) a.classList.toggle("on", _yScale.mode === "auto");
    const l = document.getElementById("logBtn"); if (l) l.classList.toggle("on", _logChart);
  }
```
`toggleLogChart()`(~2605) 내부의 `updateLogBtn()` 호출을 `updateAxisBtns()`로 교체. 그리고 버튼 바인딩(스크립트 초기화 구역, 예: ⊕ 바인딩 근처):
```js
  (function() {
    const a = document.getElementById("autoBtn"); if (a) a.addEventListener("click", () => { _yScale.mode = "auto"; updateAxisBtns(); renderHeroZoom(); });
    const l = document.getElementById("logBtn"); if (l) l.addEventListener("click", () => { toggleLogChart(); });
  })();
```
> `toggleLogChart`가 `_logChart` 반전 + `updateAxisBtns()` + 재렌더 + `markDirty()`를 이미 함(updateLogBtn→updateAxisBtns 교체로 L 버튼 갱신). loadDoc 등 초기 동기화 위해 렌더 직후 `updateAxisBtns()` 호출 1곳 추가(예: 기존 `updateLogBtn()` 호출처를 `updateAxisBtns()`로 교체).

- [ ] **Step 4: 헤더 LOG 버튼 제거**

헤더의 `<button id="logToggle" … >📊 LOG</button>`(523행) 한 줄 삭제. `updateLogBtn`을 따로 안 남긴다면, 남은 `updateLogBtn` 참조를 모두 `updateAxisBtns`로 교체(앞 단계에서 처리). `#logToggle`을 참조하던 코드가 더 없는지 확인(`grep logToggle` → 0).

- [ ] **Step 5: 검증 + 커밋**

JS 파싱 OK, 코어 83/0, 따옴표 무변형, `grep -c logToggle forge.html` = 0. 자기검토: hero 우하단 `A`/`L` 버튼 표시·상태 하이라이트(`A` auto일 때·`L` log일 때 골드); `A` 클릭→auto 복귀, `L` 클릭→로그/선형; 헤더 LOG 사라짐.
```bash
git add map/forge.html
git commit -m "feat(forge): A(오토스케일)·L(로그) 버튼 세로축 아래로 + 헤더 LOG 제거 + updateAxisBtns 통합"
```

---

## 최종 (배포 + 라이브 검증)

전체 브랜치 리뷰(opus, y범위 분기·드래그 영역 분기·histW 캡·버튼 통합·회귀) → main 머지 → 배포(`forge.html`만) → 라이브:
- 티커 불러오기 → y축 드래그로 가격축 확대/축소·`A`로 자동 복귀, auto OFF면 좌우 네비에 y 안 튐; 줌인 시 예측 영역 ≤22%·이음새 디테일; `A`/`L` 세로축 아래·헤더 LOG 없음; log/호버/⊕ 정상.
