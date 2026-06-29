# 근거 작도 가독성 (Evidence Readability) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** hero(우측 분석 차트)의 6개 지표 근거 작도가 겹쳐 안 보이는 문제를 줌/팬 + 지표 포커스 + 해상도/라벨 개선으로 해소.

**Architecture:** 전부 표현 계층(`forge.html`)만 수정 — 코어/예측 로직 무변경. 전역 `_heroView{s,tx,ty}`를 메인차트·evidence 두 캔버스에 동일한 캔버스-컨텍스트 변환으로 적용(clearRect→save→translate/scale→draw→restore)해 정합 줌/팬. 전역 `_focusInd`로 한 지표만 작도. hero 한정 DPR 캡 3·라벨 폰트 확대·요약배지 고정 슬롯 스택.

**Tech Stack:** 바닐라 JS, 무빌드, 단일 HTML(`forge.html`). Canvas 2D. 외부 라이브러리 없음. forge-core 무변경(테스트 `node --test forge-core.test.js` 83/83 회귀 없음 확인용).

## Global Constraints

- 바닐라 JS·무빌드·단일 파일 유지. 프레임워크/번들러/외부 라이브러리 금지.
- **`forge-core.js` 무변경** — 전부 표현 계층. 코어 테스트 83/83 유지.
- 다크 테마 토큰만: 골드 `#e8b463`, bull `#46c28e`, bear `#e06a6a`, 보조 `#8a92b2`, 네이비 `#0b0f14`. 임의색 금지.
- UI 텍스트 한국어. `noindex` 유지.
- **따옴표 위생**: 편집 도구가 ASCII `"`→굽은 따옴표 `“”`로 바꾸는 사고 반복. 의도된 굽은 따옴표는 `&ldquo;`/`&rdquo;` 엔티티, 가운뎃점은 JS 문자열에서 `\xb7` 이스케이프. 각 커밋 전 `git diff`로 의도치 않은 따옴표 변형 확인.
- forge.html엔 단위 테스트 하네스 없음 → 각 태스크 검증 = (a) 인라인 스크립트 파싱 `new Function` (b) `node --test forge-core.test.js` 83/83 (c) 동작 자기검토 체크리스트. 실측 시각검증은 배포 후.
- `_heroView` 항등(s=1,tx=0,ty=0)·`_focusInd=null`일 때 기존과 시각 동일(회귀 0).
- 줌/팬은 **캔버스 컨텍스트 변환**으로만(요소 CSS `style.transform`은 리빌 애니메이션 전용이라 건드리지 말 것).

## 검증 공통 스니펫

- 인라인 JS 파싱: `node -e "const fs=require('fs');const h=fs.readFileSync('forge.html','utf8');const m=[...h.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(x=>x[1]).join('\n;\n');new Function(m);console.log('JS OK')"`
- 코어 회귀: `cd map && node --test forge-core.test.js 2>&1 | grep -E "^. (pass|fail)"` → 83 pass / 0 fail.

---

## 현황 앵커 (구현 전 반드시 읽을 것)

- `fcFit(cv,h)`(약 1867행)·`fcFitKeep(cv,h)`(약 1877행): DPR 캡 `Math.min(devicePixelRatio||1, 2)` 후 `setTransform(dpr,0,0,dpr,0,0)`.
- `fcDrawMainChart(series, pred)`(약 2414행): `fcFitKeep`로 그리고 `cv.clearRect(0,0,cw,ch)`(2418행) 후 가격선·콘·y라벨. 기하 `cv._mainGeo` stash.
- `_drawEvidence()`(약 2776행): 자체 fit(인라인 DPR 캡 2, 2782–2785행) + `c.clearRect(0,0,W,H)` 후 `main._mainGeo`로 각 지표 `_drawXLayers` 호출 + `_evLegend(c, g.padX, g.padTop, legend)`(2836행). `drawEvidence()`(약 2775행)는 try/catch 래퍼.
- `_evLabel(c,text,x,y,color,align)`(약 2529행): `c.font="700 10px ui-monospace,monospace"`, pill 배경+텍스트. 경계 클램프 `_evW`/`_evH`.
- `_evLegend(c,x0,topY,items)`(약 2542행): items `[{col,t}]` 세로 나열(좌상단).
- 각 `_drawXLayers(c, data, M)`(trend 2554 / ma / fib / elliott / rsi 2719근방 / volume): 우상단/인라인 요약 배지를 자체 하드코딩 y로 그림.
- hero 마크업(약 523–530행): `.fc-hero` > `#fcHeroImg`, `#fcFuture`, `#fcMainChart`(`.fc-cv`), `#fcEvidence`(`.fc-evidence`, `position:absolute;inset:0;pointer-events:none;z-index:3`). 호버 툴팁은 `#fcMainChart`에 부착(`#fcMainTip`/`#fcMainVline`).
- 데이터: `_fcLastData`(마지막 분석 데이터), `lastResult`(마지막 run 결과·`.prediction`), `currentData()`. evidence 게이트 `_evidenceShow`/`_evidenceSet`, `evIndicatorNodes()`, `heroMode()`.
- 선택: `sel`(노드 id 배열), `applySel()`, `deselectAll()`(약 1349행). Esc 처리 `window keydown`(약 1787–1791행).

---

## Task 1: 해상도(hero DPR 캡 3) + 라벨 폰트 확대

**Files:** Modify `map/forge.html` (`fcFit`/`fcFitKeep` cap 인자, `fcDrawMainChart` 호출부, `_drawEvidence` 인라인 fit, `_evLabel` 폰트).

**Interfaces:**
- Produces: `fcFit(cv,h,cap)` / `fcFitKeep(cv,h,cap)` — 선택 인자 `cap`(기본 2). hero 두 캔버스만 `cap=3`. `_evLabel` 기본 폰트 12px·진하게.

- [ ] **Step 1: `fcFit`/`fcFitKeep`에 cap 인자 추가**

`fcFit`(1867행) 시그니처/첫 줄:
```js
  function fcFit(cv, h, cap) {
    const dpr = Math.min(devicePixelRatio || 1, cap || 2);
```
`fcFitKeep`(1877행) 동일:
```js
  function fcFitKeep(cv, h, cap) {
    const dpr = Math.min(devicePixelRatio || 1, cap || 2);
```
(나머지 본문 불변. 인자 없는 기존 호출부는 `cap` undefined→2 유지 = 회귀 0.)

- [ ] **Step 2: 메인 차트 호출을 cap=3으로**

`fcDrawMainChart`(2416행) `const ch = cv.clientHeight || 260, c = fcFitKeep(cv, ch);` →
```js
    const ch = cv.clientHeight || 260, c = fcFitKeep(cv, ch, 3);
```

- [ ] **Step 3: evidence 인라인 fit을 cap=3으로**

`_drawEvidence`(2782행) `const dpr = Math.min(devicePixelRatio || 1, 2), ww = ...` →
```js
    const dpr = Math.min(devicePixelRatio || 1, 3), ww = Math.round(W * dpr), hh = Math.round(H * dpr);
```

- [ ] **Step 4: `_evLabel` 폰트 확대(10→12px, 진하게) + pill 높이 동기**

`_evLabel`(2529–2531행):
```js
  function _evLabel(c, text, x, y, color, align) {
    c.font = "700 12px ui-monospace,monospace";
    const w = c.measureText(text).width, h = 14, M = 3, pad = 4;
```
(이하 본문 `h`/`pad` 변수 사용부 그대로 — pill이 폰트에 맞춰 커짐. roundRect 반경 3 유지.)

- [ ] **Step 5: 검증 + 커밋**

JS 파싱 OK, 코어 83/0. `git diff`로 따옴표 변형 없음 확인.
```bash
cd /home/jschoi0223/projects/vdiportal
git add map/forge.html
git commit -m "feat(forge): hero 해상도 DPR3 + 근거 라벨 12px 확대"
```

---

## Task 2: 요약 배지 고정 슬롯 세로 스택

**Files:** Modify `map/forge.html` (`_drawEvidence` chart 모드 M 구성에 `badgeY` 전달 + 각 `_drawXLayers`의 우상단 요약 배지 y를 `M.badgeY` 우선 사용).

**목적:** 현재 ma/trend/fib/elliott/rsi/volume의 우상단 요약 배지가 같은 y(≈14/28)에 겹친다. 그려지는 지표마다 슬롯을 하나씩 내려 세로로 쌓는다.

**Interfaces:**
- Consumes: `_drawEvidence` chart 루프의 `g`(=_mainGeo), 각 `_drawXLayers(c,data,M)`.
- Produces: M에 `badgeY:number` 추가. 각 `_drawXLayers`는 우상단 요약 배지 그릴 때 `const by = (M.badgeY != null) ? M.badgeY : <기존값>` 사용.

- [ ] **Step 1: `_drawEvidence` chart 루프에 슬롯 카운터 + badgeY 주입**

`_drawEvidence`의 `if (mode === "chart") {` 블록에서 `for (const n of nodes) {` 직전에 슬롯 상태 추가:
```js
      let _slot = 0; const _slotY = () => g.padTop + 2 + (_slot++) * 18;   // 우상단 배지 세로 슬롯(18px 간격)
```
그리고 각 지표 분기의 `_drawXLayers(c, X, { ... })` M 객체에 `badgeY: _slotY()`를 추가한다. **요약 배지를 그리는 지표(ma·trend·fib·elliott·rsi·volume)만** 추가(phasefold는 배지 없음 — 생략). 예(rsi 분기, 2825행):
```js
          _drawRsiLayers(c, rsi, { fiToX: fi => toXh(Math.max(0, Math.min(Hn - 1, fi - off))), pToY: v => toY(v), nowFi: P - 1, fiMin: off, reveal: _playing ? (_evReveal[n.id] || 0) : Infinity, xRight: g.padX + g.plotW, badgeY: _slotY() });
```
나머지 5개 분기도 같은 방식으로 M에 `badgeY: _slotY()`만 추가(기존 키 유지). **호출 순서대로 슬롯이 0,1,2…로 쌓이므로 그려지는 지표만 위에서부터 한 줄씩 차지**(빈 지표는 건너뜀).

- [ ] **Step 2: 각 `_drawXLayers`의 우상단 요약 배지 y를 `M.badgeY` 우선으로**

6개 레이어 함수 각각에서 **우상단(align "right") 요약 배지**를 그리는 `_evLabel(...)` 호출의 y 인자를 `M.badgeY` 우선으로 바꾼다. 패턴(함수 상단에서 추출):
```js
    const _by = (M.badgeY != null) ? M.badgeY : <해당 함수의 기존 y상수>;
```
그리고 그 배지 `_evLabel(c, txt, M.xRight, _by, col, "right")`로 y를 `_by`로 교체. 대상:
  - `_drawRsiLayers`: 기존 `_evLabel(..., 28, ..., "right")`(약 2740행) → `_by`.
  - `_drawVolumeLayers`: 기존 `_evLabel(..., xRight - 6, 28, ..., "right")`(약 2771행) → x는 그대로, y를 `_by`.
  - `_drawElliottLayers`: 우상단 유효도 배지 `_evLabel(..., xb, 14, ..., "right")`(약 2709행) → y를 `_by`.
  - `_drawFibLayers`/`_drawMALayers`/`_drawTrendLayers`: **우상단 요약 배지가 있으면** 그 y를 `_by`로. (인라인 선-위 라벨은 슬롯 대상 아님 — 그대로 둔다. ma/fib/trend는 주로 인라인 라벨만 있을 수 있음 — 우상단 단일 요약 배지가 없으면 이 함수는 변경 불필요. 읽고 우상단 배지 유무로 판단.)

> 핵심: **우상단에 몰리던 단일 요약 배지만** 슬롯 y로 분산. 선/레벨 위 인라인 라벨은 줌·포커스로 식별하므로 건드리지 않는다.

- [ ] **Step 3: 검증 + 커밋**

JS 파싱 OK, 코어 83/0, 따옴표 무변형. 자기검토: 6지표 모두 활성일 때 우상단 배지가 18px 간격 세로 스택(겹침 0), 일부만 활성이면 위에서부터 빈틈없이 채움.
```bash
git add map/forge.html
git commit -m "feat(forge): 근거 요약 배지 우상단 고정 슬롯 세로 스택(겹침 해소)"
```

---

## Task 3: hero 줌/팬 (`_heroView`)

**Files:** Modify `map/forge.html` (전역 `_heroView`·`resetHeroView`·`clampPan`·`renderHeroZoom`; `fcDrawMainChart`·`_drawEvidence`에 변환 래핑; `#fcMainChart` wheel/pointer 핸들러; 호버 역변환; 리셋 버튼; 데이터 변경 시 리셋 훅).

**Interfaces:**
- Consumes: `fcDrawMainChart`, `drawEvidence`, `_fcLastData`, `lastResult`, `currentData()`, `_mainGeo`.
- Produces: `_heroView={s,tx,ty}`, `resetHeroView()`, `renderHeroZoom()`, `clampPan()`. 두 캔버스가 `_heroView`를 반영해 정합 줌/팬.

- [ ] **Step 1: 전역 상태 + 헬퍼 추가 (스크립트 상단 적당한 전역 구역, 예: `let sel = []` 근처)**

```js
  let _heroView = { s: 1, tx: 0, ty: 0 };
  function resetHeroView() { _heroView = { s: 1, tx: 0, ty: 0 }; }
  function clampPan() {
    const cv = document.getElementById("fcMainChart"); if (!cv) return;
    const W = cv.clientWidth || 1, H = cv.clientHeight || 1, s = _heroView.s;
    if (s <= 1.0001) { _heroView.tx = 0; _heroView.ty = 0; _heroView.s = 1; return; }
    // 확대 컨텐츠가 뷰의 최소 25%는 남도록 tx/ty 제한
    const minVis = 0.25;
    const maxTx = W * (1 - minVis), minTx = W * minVis - W * s;
    const maxTy = H * (1 - minVis), minTy = H * minVis - H * s;
    _heroView.tx = Math.max(minTx, Math.min(maxTx, _heroView.tx));
    _heroView.ty = Math.max(minTy, Math.min(maxTy, _heroView.ty));
  }
  function renderHeroZoom() {
    const pred = lastResult && lastResult.prediction;
    const px = (_fcLastData && _fcLastData.price) || (currentData() && currentData().price) || [];
    fcDrawMainChart(px, pred);
    drawEvidence();
  }
```
> `fcDrawMainChart` 인자(series, pred)와 `_fcLastData`/`lastResult` 실제 이름을 현황 앵커로 확인해 정확히 맞출 것. hero가 이미지 모드면 `renderHeroZoom`이 무해해야 하므로 `fcDrawMainChart`는 내부 가드(hist<2 시 return) 유지.

- [ ] **Step 2: 두 캔버스 드로잉에 변환 래핑**

`fcDrawMainChart`(2414~): `fcFitKeep` 호출과 `c.clearRect(0,0,cw,ch)`(2418행) **이후**, 첫 드로잉(grid) **이전**에 삽입:
```js
    c.save(); c.translate(_heroView.tx, _heroView.ty); c.scale(_heroView.s, _heroView.s);
```
그리고 함수의 **모든 return 경로 직전과 정상 종료부에 `c.restore();`**를 짝 맞춰 추가(특히 hist<2 early-return은 save 이전이라 무관 — save는 clearRect 직후이므로 early-return(2421–2424행)은 save 앞에 있어야 함; 순서: fcFitKeep→clearRect→`if(hist<2){...return;}`→`c.save();translate;scale;`→드로잉→끝에서 `c.restore();`). _mainGeo stash는 변환과 무관(로직좌표)하게 그대로.

`_drawEvidence`(2776~): save를 **모든 "그릴 것 없음" 가드 뒤, 실제 드로잉 직전**에 둔다 — 구체적으로 `if (!nodes.length) return;`(2791행) **다음 줄**, `const legend = [];`(2792행) **앞**에 삽입:
```js
    c.save(); c.translate(_heroView.tx, _heroView.ty); c.scale(_heroView.s, _heroView.s);
```
이렇게 두면 save 이후 early-return은 chart 모드의 `if (!g) return;`(2795행)과 overlay 모드의 동등 가드뿐이다. **그 둘을 `{ c.restore(); return; }`로 바꾸고, 함수 정상 종료부(맨 끝, mode if/else 닫힌 뒤)에 `c.restore();`를 추가**한다. (save 앞의 early-return들(2786·2788·2791)은 restore 불필요.) `drawEvidence()` try/catch 래퍼는 그대로 — 단, catch가 나도 컨텍스트는 다음 호출에서 setTransform으로 리셋되므로 무해.

> save/restore 짝이 어긋나면 변환 누적/잔상. 위 3곳(분기 2개 return + 끝 1개)만 정확히 맞추면 됨.

- [ ] **Step 3: `#fcMainChart`에 휠(커서 줌) + 드래그(팬) + 더블클릭(리셋) 핸들러**

스크립트 초기화 구역(다른 캔버스 핸들러 부착부 근처)에서, `#fcMainChart` 요소에 부착:
```js
  (function heroZoomInit() {
    const cv = document.getElementById("fcMainChart"); if (!cv) return;
    cv.addEventListener("wheel", e => {
      e.preventDefault();
      const r = cv.getBoundingClientRect(), cx = e.clientX - r.left, cy = e.clientY - r.top;
      const factor = e.deltaY < 0 ? 1.15 : 1 / 1.15;
      const ns = Math.max(1, Math.min(6, _heroView.s * factor)), k = ns / _heroView.s;
      _heroView.tx = cx - (cx - _heroView.tx) * k;
      _heroView.ty = cy - (cy - _heroView.ty) * k;
      _heroView.s = ns; clampPan(); renderHeroZoom();
    }, { passive: false });
    let drag = null;
    cv.addEventListener("pointerdown", e => {
      if (_heroView.s <= 1.0001) return;            // 확대 안 됐으면 팬 불필요(클릭/포커스 우선)
      drag = { x: e.clientX, y: e.clientY, tx: _heroView.tx, ty: _heroView.ty, moved: false };
      try { cv.setPointerCapture(e.pointerId); } catch (_) {}
    });
    cv.addEventListener("pointermove", e => {
      if (!drag) return;
      const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
      if (Math.abs(dx) + Math.abs(dy) > 6) drag.moved = true;
      if (!drag.moved) return;
      _heroView.tx = drag.tx + dx; _heroView.ty = drag.ty + dy; clampPan(); renderHeroZoom();
    });
    const endDrag = () => { drag = null; };
    cv.addEventListener("pointerup", endDrag); cv.addEventListener("pointercancel", endDrag);
    cv.addEventListener("dblclick", () => { resetHeroView(); renderHeroZoom(); });
  })();
```
> 휠은 `passive:false`로 `preventDefault`(페이지 스크롤 방지). 팬은 s>1일 때만(확대 전 클릭은 Task 4 포커스/호버에 양보).

- [ ] **Step 4: 리셋 버튼 (차트 우상단 작은 ⊕)**

hero 마크업(`.fc-hero` 내부, `#fcEvidence` 다음)에 추가:
```html
              <button id="fcZoomReset" class="fc-zoom-reset" title="줌 초기화">⊕</button>
```
CSS(다른 `.fc-*` 규칙 근처):
```css
  .fc-zoom-reset{position:absolute;top:8px;right:8px;z-index:4;width:24px;height:24px;border-radius:6px;border:1px solid var(--line);background:rgba(11,15,20,.6);color:var(--eth);font-size:13px;cursor:pointer;display:none}
  .fc-zoom-reset.on{display:block}
```
JS: 줌 상태에 따라 버튼 표시 토글 — `renderHeroZoom()` 끝(또는 휠/팬 후)에 호출되는 한 줄 헬퍼:
```js
  function _syncZoomBtn() { const b = document.getElementById("fcZoomReset"); if (b) b.classList.toggle("on", _heroView.s > 1.0001); }
```
`renderHeroZoom()` 마지막에 `_syncZoomBtn();` 추가. 버튼 클릭:
```js
  (function(){ const b = document.getElementById("fcZoomReset"); if (b) b.addEventListener("click", () => { resetHeroView(); renderHeroZoom(); }); })();
```

- [ ] **Step 5: 호버 툴팁 좌표 역변환 + 드래그 중 숨김**

`#fcMainChart` 호버 핸들러(현황 앵커로 위치 확인 — `_mainGeo` 사용, `#fcMainTip`/`#fcMainVline`)에서, 포인터 캔버스좌표 `px,py`로 `_mainGeo`를 조회하기 **직전**에 역변환을 적용:
```js
    // _heroView 보정: 화면→로직 좌표
    px = (px - _heroView.tx) / _heroView.s;
    py = (py - _heroView.ty) / _heroView.s;
```
(해당 핸들러가 쓰는 실제 변수명에 맞춰 적용. y를 안 쓰면 x만.) 그리고 핸들러 진입부에 드래그 중이면 툴팁 숨기고 return하도록 가드(가능하면 Step3의 `drag`를 모듈 스코프로 공유하거나, 간단히 `if (_heroView.s>1.0001 && <드래그중 플래그>) return;`). 최소 요건: **줌 상태에서 호버 X좌표가 올바른 봉을 가리킬 것.**

- [ ] **Step 6: 데이터 변경 시 줌 리셋 훅**

새 분석/포지 전환으로 hero 데이터가 바뀌는 진입점(현황 앵커: `renderChart` 또는 분석 적용·`switchDoc`/`newSampleDoc` 등 `_fcLastData`가 새로 세팅되는 곳)에서 **렌더 직전에 `resetHeroView();`** 호출. 최소한 `renderChart`(차트 갱신의 단일 진입점)에 1줄 추가하면 새 결과마다 줌이 초기화됨. (재생 중 evidence 재드로는 `renderChart`를 안 거치므로 줌 유지됨 — 의도된 동작.)

- [ ] **Step 7: 검증 + 커밋**

JS 파싱 OK, 코어 83/0, 따옴표 무변형. 자기검토 체크리스트: (a) 휠로 확대 시 가격선·근거선·라벨이 함께 확대되고 어긋나지 않음(같은 `_heroView` 변환), (b) save/restore 짝 맞음(잔상/누적 없음 — 여러 번 줌/리셋 반복해도 정상), (c) 드래그 팬 후 더블클릭/⊕로 복귀, (d) s=1이면 tx/ty=0 스냅·버튼 숨김, (e) 새 분석 시 리셋, (f) 줌 중 호버 X 정합.
```bash
git add map/forge.html
git commit -m "feat(forge): hero 줌/팬(_heroView 두 캔버스 동일변환·커서줌·드래그팬·리셋·호버 역변환)"
```

---

## Task 4: 지표 포커스 (`_focusInd`)

**Files:** Modify `map/forge.html` (전역 `_focusInd`·`syncFocusFromSel`; `_drawEvidence` 노드 필터 + 클릭 히트영역; `_evLegend` 칩 히트영역·`전체` 칩; `#fcMainChart` 클릭 판정; 선택 훅; Esc).

**Interfaces:**
- Consumes: `_drawEvidence` nodes 루프, `_evLegend`, `sel`/`applySel`/`deselectAll`, `_heroView`(클릭 좌표 역변환), evidence 지표 blockType 6종.
- Produces: `_focusInd:string|null`, `syncFocusFromSel()`, `_legendHits[]`(클릭 히트영역).

- [ ] **Step 1: 전역 상태 추가**

```js
  let _focusInd = null;          // 포커스 지표 blockType | null(전체)
  let _legendHits = [];          // [{x,y,w,h,key}] 범례 칩 히트영역(로직좌표)
```

- [ ] **Step 2: `_drawEvidence`에서 포커스 필터**

chart 모드 `const nodes = evIndicatorNodes().filter(n => _evidenceSet.has(n.id));` 다음 줄에:
```js
      const drawNodes = _focusInd ? nodes.filter(n => n.blockType === _focusInd) : nodes;
```
그리고 이후 `for (const n of nodes)` → `for (const n of drawNodes)`로 변경(chart·overlay 양 모드). 포커스 지표가 보드에 없으면 `drawNodes` 비어 아무 작도 안 함(자연스러움).

- [ ] **Step 3: `_evLegend`에 `전체` 칩 + 히트영역 기록**

`_evLegend(c, x0, topY, items)`를 수정 — 그리기 전에 맨 앞 `전체` 칩을 prepend하고, 각 칩의 히트영역을 `_legendHits`에 push(로직좌표, `_heroView` 변환 전 좌표계 = 캔버스 로직좌표). 활성/비활성 시각 구분(포커스 중인 칩·`전체` 강조):
```js
  function _evLegend(c, x0, topY, items) {
    _legendHits = [];
    const rows = [{ col: "#8a92b2", t: "전체", key: null }].concat(items.map(it => ({ col: it.col, t: it.t, key: it._key || null })));
    c.font = "10px Pretendard,system-ui,sans-serif"; c.textAlign = "left";
    let y = topY + 22;
    for (const it of rows) {
      const tw = c.measureText(it.t).width, bx = x0 + 14, bw = tw + 6, bh = 12;
      const active = (it.key === _focusInd) || (it.key === null && _focusInd === null);
      c.globalAlpha = (_focusInd && !active) ? 0.45 : 1;
      c.fillStyle = it.col; c.fillRect(x0 + 2, y, 9, 9);
      c.fillStyle = active ? "rgba(232,180,99,.30)" : "rgba(11,15,20,.55)"; c.fillRect(bx, y - 1, bw, bh);
      c.fillStyle = "rgba(224,229,239,.95)"; c.fillText(it.t, x0 + 16, y + 8);
      c.globalAlpha = 1;
      _legendHits.push({ x: x0, y: y - 1, w: 16 + bw, h: bh + 2, key: it.key });
      y += 14;
    }
  }
```
그리고 호출부에서 각 legend item에 blockType key를 실어야 한다 — `_drawEvidence`의 `legend.push({ col, t: ... })`를 `legend.push({ col, t: ..., _key: n.blockType })`로 6지표 분기 모두 보강(phasefold도 `_key:"phasefold"` 가능하나 작도 없으니 생략 가능).

- [ ] **Step 4: hero 클릭 → 범례 칩 히트 판정 → 포커스 토글**

`#fcMainChart` 클릭(또는 pointerup에서 `moved===false`)에서, 클릭 좌표를 `_heroView` 역변환 후 `_legendHits`와 충돌 판정:
```js
    cv.addEventListener("click", e => {
      const r = cv.getBoundingClientRect();
      const lx = ((e.clientX - r.left) - _heroView.tx) / _heroView.s;
      const ly = ((e.clientY - r.top) - _heroView.ty) / _heroView.s;
      for (const hgt of _legendHits) {
        if (lx >= hgt.x && lx <= hgt.x + hgt.w && ly >= hgt.y && ly <= hgt.y + hgt.h) {
          _focusInd = (hgt.key === _focusInd) ? null : hgt.key;   // 같은 칩 재클릭=해제, 전체=null
          drawEvidence(); return;
        }
      }
    });
```
> 범례 칩은 `_heroView` 변환과 함께 그려지므로 히트영역도 동일 역변환으로 맞춘다. Task 3의 드래그(moved) 후에는 click이 발생하지 않도록(브라우저 기본) 또는 `drag.moved` 가드.

- [ ] **Step 5: 노드 선택 → 포커스 동기화 + Esc 해제**

```js
  function syncFocusFromSel() {
    let nf = null;
    if (sel.length === 1) {
      const n = boardState.nodes.find(x => x.id === sel[0]);
      const IND = ["ma", "trend", "fib", "elliott", "rsi", "volume"];
      if (n && IND.includes(n.blockType)) nf = n.blockType;
    }
    if (nf !== _focusInd) { _focusInd = nf; drawEvidence(); }
  }
```
`applySel()`(약 1201행) 끝에 `syncFocusFromSel();` 1줄 추가(선택 변화마다 포커스 동기화). Esc 처리(약 1791행 `if (e.key === "Escape") { deselectAll(); return; }`)는 `deselectAll`이 `applySel`을 부르므로 자동으로 포커스 해제됨 — 추가 변경 불필요(확인만).

- [ ] **Step 6: 검증 + 커밋**

JS 파싱 OK, 코어 83/0, 따옴표 무변형. 자기검토: (a) 범례 `전체`+지표 칩 표시, 칩 클릭 시 그 지표만 작도·나머지 숨김, 재클릭/전체로 해제, (b) 보드에서 RSI 노드 단일선택 시 RSI만 포커스, 빈 곳 클릭(deselect) 시 전체 복귀, (c) Esc로 해제, (d) 줌 상태에서도 칩 클릭 좌표 정확(역변환), (e) 포커스+줌 병행 동작.
```bash
git add map/forge.html
git commit -m "feat(forge): 지표 포커스(_focusInd) — 범례 칩 클릭·노드 선택으로 단일 지표만 작도"
```

---

## 최종

4개 태스크 후: 전체 브랜치 리뷰(opus, 좌표/변환 정합·save·restore 짝·포커스/줌 상호작용 집중) → `superpowers:finishing-a-development-branch`로 main 머지 → cafe24 배포(`forge.html`만; forge-core 무변경이나 동반 업로드 무해) → live 확인.
