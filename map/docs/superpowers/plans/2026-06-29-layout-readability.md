# 결과 패널 확대 + 작도 가독성 + 시연 오버플로 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 사이드바를 도구 전용으로 정리하고 캔버스를 줄여 오른쪽 결과 패널을 키우며, 예측 시그널을 차트 헤더에 통합하고, 작도 라벨 가독성·시연 중 잘림을 개선한다.

**Architecture:** 전부 `forge.html` 변경(CSS·마크업·렌더 함수). 분석 코어(`forge-core.js`)·데이터 모델 불변. 레이아웃은 flex 분할 + CSS 변수, 작도는 라벨 좌표 클램프 + 배경 pill 헬퍼.

**Tech Stack:** Vanilla JS(무빌드), HTML5 Canvas, CSS flex. 단위테스트 영역 적음 → `node --check` 구문검사 + 헤드리스/라이브 시각검증.

## Global Constraints

- 바닐라 JS · 빌드도구/외부 라이브러리 금지 · 단일 `forge.html` 변경. `forge-core.js`·`map.html`·데이터 모델 불변.
- 다크 토큰 색만(`--ink`/`--eth`/`--gold`/`--line`/`--panel`/`--surface`/`--raised2`/bull `#46c28e`/bear `#e06a6a`). 한국어 UI. noindex 유지.
- 캔버스(보드) 기본 폭 = 사이드바×4 ≈ **640px**. 결과 패널(chart-pane)이 나머지 전부.
- hero 기본 높이 440→**560px**. 라벨 폰트 9→10px, 배경 pill `rgba(11,15,20,.66)`.
- **따옴표 위생**: Edit 도구가 straight `"`→curly `“`/`”` 변환 사고 이력 있음. 각 태스크 후 `git diff <base> HEAD -- forge.html`로 pre-existing 줄의 따옴표 부수변경 0 확인.
- 검증: 매 태스크 인라인 `<script>` 추출 → `node --check` 무오류.

---

### Task 1: 사이드바 — 블록 도구 세로 배치 + 라이브러리 그리드 제거 + 떠있는 팔레트 제거

**Files:** Modify `forge.html` (renderSidebar `:1002`, renderLib `:~1015`, 팔레트 빌드 `:1789`, 사이드바 CSS `:332`)

**Interfaces:**
- Consumes: `BLOCK_DEFS`, `addBlock(type)`, `renderLib`.
- Produces: 사이드바에 블록 도구 세로 섹션. 떠있는 `.forge-palette` 없음.

- [ ] **Step 1: renderSidebar에 블록 도구 섹션 추가** — `renderSidebar`(`:1002`)의 `el.innerHTML = ...` 에서 `<div class="side-sec" id="libSec"></div>` **앞**에 도구 섹션 삽입

기존 `el.innerHTML` 의 마지막 부분(`<div class="side-sec" id="libSec"></div>`)을 아래로 교체:
```js
      `<div class="side-sec"><div class="side-h"><span>블록 도구</span></div>
         <div class="pal-side">` +
         BLOCK_DEFS.filter(d => d.kind === "block").map(d => `<button class="pal-btn" onclick="addBlock('${d.type}')">${d.label}</button>`).join("") +
         `<button class="pal-btn pal-free" onclick="addBlock('free')">메모</button>` +
       `</div></div>
       <div class="side-sec" id="libSec"></div>`;
```

- [ ] **Step 2: 떠있는 팔레트 빌드 제거** — `:1789` 의 floating palette 블록 삭제

아래 블록(`/* floating block palette */` ~ `pane.appendChild(_pal);`)을 **삭제**:
```js
    /* floating block palette */
    const _pal = document.createElement("div");
    _pal.className = "forge-palette";
    _pal.innerHTML = `<div class="pal-label">블록 추가</div>` +
      BLOCK_DEFS.filter(d => d.kind === "block").map(d =>
        `<button class="pal-btn" onclick="addBlock('${d.type}')">${d.label}</button>`
      ).join("") +
      `<button class="pal-btn pal-free" onclick="addBlock('free')">메모</button>`;
    pane.appendChild(_pal);
```
(바로 다음 hidden file input 블록 `_fi`/`_nfi`는 유지.)

- [ ] **Step 3: renderLib 그리드 제거(추가 버튼만)** — `renderLib`(`:~1015`)의 `el.innerHTML`을 아래로 교체

```js
  function renderLib() {
    const el = document.getElementById("libSec"); if (!el) return;
    el.innerHTML =
      `<div class="side-h"><span>대표 이미지</span><button class="side-btn" id="libAddBtn">＋ 이미지</button></div>` +
      `<div style="font-size:10px;color:var(--eth);padding:2px 0;line-height:1.5">가격 노드에 드래그 · Ctrl+V 로도 추가</div>`;
  }
```

- [ ] **Step 4: 사이드바 도구 버튼 CSS** — 사이드바 CSS(`:332` 근처)에 `.pal-side` 추가

```css
  .forge-side .pal-side{display:flex;flex-direction:column;gap:5px}
  .forge-side .pal-side .pal-btn{display:block;width:100%;padding:7px 10px;border:1px solid var(--line);border-radius:8px;background:var(--surface);color:var(--ink);font-size:11px;font-weight:600;font-family:inherit;cursor:pointer;text-align:left;white-space:nowrap;transition:background .1s,border-color .1s}
  .forge-side .pal-side .pal-btn:hover{background:var(--raised2);border-color:#3a4452}
  .forge-side .pal-side .pal-btn.pal-free{color:var(--eth);border-style:dashed}
```

- [ ] **Step 5: 검증 + 커밋** — `node --check`(인라인 스크립트) 무오류 + `git diff` 따옴표 부수변경 0. 

```bash
git add forge.html
git commit -m "feat(forge): 사이드바에 블록도구 세로 배치 + 라이브러리 그리드 제거(추가버튼 유지) + 떠있는 팔레트 제거"
```

---

### Task 2: 레이아웃 — 보드 폭 = 사이드바×4 기본 + 결과 패널 확대 + 구분선 영속

**Files:** Modify `forge.html` (`.board-pane` `:23`, `.chart-pane` `:24` CSS; initSplit gutter 핸들러 `:3469`)

**Interfaces:**
- Consumes: `#forgeGutter`, `#chartPane`, `#boardPane`, `.forge-split`, `redrawCharts()`, `lsGet`/`lsSet`(있으면) 또는 localStorage.
- Produces: `--board-w` 영속(`scoopforge_board_w`).

- [ ] **Step 1: 분할 CSS 변경** — `:23`/`:24`

```css
  .board-pane{position:relative;flex:0 0 var(--board-w,640px);min-width:280px;overflow:hidden;display:flex;flex-direction:column}
  .chart-pane{position:relative;flex:1 1 auto;min-width:0;overflow:hidden;display:flex;flex-direction:column;container-type:inline-size}
```

- [ ] **Step 2: gutter 핸들러 — 보드 폭 조절 + 영속** — initSplit(`:3469`)의 핸들러 본문을 아래로 교체(보드 flexBasis 조절)

`const DEFW = 460, ...` 부터 dblclick까지를 교체:
```js
    const DEFW = 640, MINB = 280, MINC = 320;
    const board = document.getElementById("boardPane");
    let saved = null; try { saved = localStorage.getItem("scoopforge_board_w"); } catch (_) {}
    if (saved && board) board.style.flexBasis = saved;
    let dragging = false;
    function persist() { try { if (board) localStorage.setItem("scoopforge_board_w", board.style.flexBasis || (DEFW + "px")); } catch (_) {} }
    gutter.addEventListener("pointerdown", e => { dragging = true; gutter.classList.add("dragging"); try { gutter.setPointerCapture(e.pointerId); } catch (_) {} document.body.style.userSelect = "none"; e.preventDefault(); });
    gutter.addEventListener("pointermove", e => {
      if (!dragging || !board) return;
      const r = split.getBoundingClientRect();
      const maxB = r.width - MINC - 7;
      const w = Math.max(MINB, Math.min(maxB, e.clientX - r.left));
      board.style.flexBasis = w + "px"; redrawCharts();
    });
    function end(e) { if (!dragging) return; dragging = false; gutter.classList.remove("dragging"); try { gutter.releasePointerCapture(e.pointerId); } catch (_) {} document.body.style.userSelect = ""; persist(); redrawCharts(); }
    gutter.addEventListener("pointerup", end);
    gutter.addEventListener("pointercancel", end);
    gutter.addEventListener("dblclick", () => { if (board) board.style.flexBasis = DEFW + "px"; persist(); redrawCharts(); });
```

> `split`/`gutter`/`chart` 선언부는 위에 그대로 있음. `chart` 변수는 미사용이 되어도 무해(또는 제거). `board` 새로 잡음.

- [ ] **Step 3: 검증 + 커밋** — `node --check` + 따옴표 점검. 

```bash
git add forge.html
git commit -m "feat(forge): 보드 폭=사이드바×4(640) 기본·결과 패널 확대 + 구분선 영속(--board-w)"
```

---

### Task 3: 예측 시그널 차트 헤더 인라인 통합

**Files:** Modify `forge.html` (verdictBadge 마크업 `:501`, hero 헤더 `:504-515`, renderVerdict `:3545`, `.editing` 숨김 규칙 `:274`)

**Interfaces:**
- Consumes: `lastResult`, `_upProb`.
- Produces: `#verdictInline`(차트 헤더 내 시그널 readout).

- [ ] **Step 1: 별도 바 마크업 제거** — `:501` 의 `<div id="verdictBadge" class="verdict-badge"></div>` 줄 **삭제**.

- [ ] **Step 2: 헤더에 인라인 자리 추가** — hero 패널 헤더(`:504-515`)의 `<div class="fc-head-actions">` **앞**(`fc-head-left` 닫힌 뒤)에 삽입

`</div>` (fc-head-left 닫는 줄) 다음, `<div class="fc-head-actions">` 앞에:
```html
              <span class="verdict-inline" id="verdictInline"></span>
```

- [ ] **Step 3: `.verdict-inline` CSS 추가** — `.fc-phead` 근처에

```css
  .verdict-inline{font-family:ui-monospace,monospace;font-size:11px;color:var(--eth);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;flex:1;min-width:0}
  .verdict-inline b{font-weight:800}
  .chart-pane.editing .verdict-inline{display:none}
```
(기존 `:274` 의 `.chart-pane.editing .verdict-badge{display:none!important}` 줄은 삭제 — verdict-badge 더 이상 없음.)

- [ ] **Step 4: renderVerdict 타깃 변경** — `renderVerdict`(`:3545`)를 인라인 요소로 렌더하도록 교체

```js
  function renderVerdict(verdict) {
    const el = document.getElementById("verdictInline");
    if (!el || !verdict) return;
    const REGIME_LABEL = { bull: "상승", bear: "하락", neutral: "중립" };
    const REGIME_COL = { bull: "#46c28e", bear: "#e06a6a", neutral: "#8a92b2" };
    const regime = verdict.regime || "neutral";
    const col = REGIME_COL[regime] || "#8a92b2", label = REGIME_LABEL[regime] || "중립";
    const score = (typeof verdict.score === "number" && isFinite(verdict.score)) ? verdict.score.toFixed(1) : "—";
    const fmt = v => (typeof v === "number" && isFinite(v)) ? v.toFixed(2) : "—";
    const _pp = lastResult && lastResult.prediction, _pa = _pp && _pp.anchor, _pe = _pp && _pp.path && _pp.path.length ? _pp.path[_pp.path.length - 1] : null, _ph = _pp && _pp.hi && _pp.hi.length ? _pp.hi[_pp.hi.length - 1] : null;
    const _up = (_pe && _ph && _pa) ? _upProb(_pe, _ph, _pa) : null;
    el.innerHTML =
      `국면 <b style="color:${col}">${label}</b>` +
      (_up != null ? ` · ↑<b style="color:${_up >= 50 ? "#46c28e" : "#e06a6a"}">${_up}%</b>` : "") +
      ` · 시그널 <b style="color:${col}">${score}</b>` +
      ` · 목표 ${fmt(verdict.target)}`;
  }
```

> 무효화(invalidation)는 인라인에서 생략(공간 절약) — 무효화는 호버 툴팁/콘에 이미 표시됨. 국면·확률·시그널·목표만.

- [ ] **Step 5: 검증 + 커밋** — `node --check` + 따옴표 점검. verdictBadge 잔여 참조 없음 확인(`grep verdictBadge forge.html` → 0).

```bash
git add forge.html
git commit -m "feat(forge): 예측 시그널을 차트 헤더 인라인으로 통합(별도 바 제거·여백 최소)"
```

---

### Task 4: hero 560 + 라벨 배경 pill + 경계 클램프(시연 오버플로)

**Files:** Modify `forge.html` (`--hero-h` `:194`, `_evLabel` 신설, draw helpers `_drawTrendLayers`/`_drawMALayers`/`_drawFibLayers`/`_evLegend`, `_drawEvidence`)

**Interfaces:**
- Consumes: 작도 컨텍스트 `c`, `_drawEvidence`의 W/H.
- Produces: `_evLabel(c, text, x, y, color, align)` (경계 클램프 + 배경 pill), 전역 `_evW`/`_evH`.

- [ ] **Step 1: hero 기본 높이** — `:194`

```css
  .fc-hero{display:flex;gap:6px;height:var(--hero-h,560px);position:relative;overflow:hidden}
```

- [ ] **Step 2: `_evLabel` 헬퍼 + 경계 전역 추가** — `_evLegend`(`:2483`) **앞**에 삽입

```js
  let _evW = 0, _evH = 0;   // 현재 작도 캔버스 논리 크기(라벨 클램프용)
  // 라벨: 반투명 pill 배경 + 경계 클램프. align "left"(기본)|"right"
  function _evLabel(c, text, x, y, color, align) {
    c.font = "700 10px ui-monospace,monospace";
    const w = c.measureText(text).width, h = 12, M = 3, pad = 3;
    let bx = (align === "right") ? x - w - pad : x;          // 박스 좌상 x
    bx = Math.max(M, Math.min(bx, (_evW || 1e4) - w - 2 * pad - M));
    let by = y - h;                                          // 박스 좌상 y(텍스트 baseline 위)
    by = Math.max(M, Math.min(by, (_evH || 1e4) - h - M));
    c.fillStyle = "rgba(11,15,20,.66)";
    if (c.roundRect) { c.beginPath(); c.roundRect(bx, by, w + 2 * pad, h + 2, 3); c.fill(); }
    else c.fillRect(bx, by, w + 2 * pad, h + 2);
    c.fillStyle = color; c.textAlign = "left";
    c.fillText(text, bx + pad, by + h - 1);
  }
```

- [ ] **Step 3: `_drawEvidence`에서 경계 기록** — `_drawEvidence` 함수에서 `W`/`H`(hero clientWidth/Height)를 구한 직후 한 줄 추가

`_drawEvidence` 안에서 캔버스 논리 크기 `W`,`H`가 정해진 직후:
```js
    _evW = W; _evH = H;
```

- [ ] **Step 4: 라벨 호출을 `_evLabel`로 교체** — 작도 헬퍼의 인라인 라벨 `c.fillText(...)`를 `_evLabel`로 교체

각 draw helper에서 **라벨 텍스트**를 그리는 `c.fillText(label, lx, ly)` 호출들을 `_evLabel(c, label, lx, ly, color, align)`로 교체. 대상:
- `_drawTrendLayers`: `"추세"`/장·중·단 기울기 라벨 → `_evLabel(c, lab, xb, yb, COL[key], "left")` 형태(기존 좌표·색 유지).
- `_drawMALayers`: 크로스 마커 라벨(`"골든 N봉"`/`"데드 N봉"`)·배열 라벨(`"정배열 ▲"` 등) → `_evLabel`로. (마커 원/선은 그대로.)
- `_drawFibLayers`: 레벨 라벨(`ratio.toFixed(3)`+`"목표"`)·구간 라벨(`"지지"`/`"저항"`/`"골든포켓"`) → `_evLabel`. align은 기존 textAlign 기준("left" 기본, 우측 라벨은 "right").
- 선/마커/밴드 그리기는 변경하지 않음(라벨만 pill+클램프).

> 좌표·색·정렬은 기존 호출의 인자를 그대로 옮긴다. `_evLabel` 내부에서 font/fillStyle/textAlign을 설정하므로, 교체 후 주변의 라벨용 `c.font=`/`c.textAlign=`/`c.fillStyle=` 중복 설정은 제거해도 무방(선 색 설정은 유지).

- [ ] **Step 5: 검증** — 인라인 `<script>` 추출 `node --check` 무오류. `git diff <base> HEAD -- forge.html` 로 따옴표 부수변경 0 + 선/밴드 그리기 코드 미변경(라벨만 교체) 확인. 보고에 기재.

- [ ] **Step 6: 커밋**

```bash
git add forge.html
git commit -m "feat(forge): hero 560 + 작도 라벨 배경 pill + 경계 클램프(시연 잘림 수정)"
```

---

## Self-Review

**Spec coverage:**
- §4 사이드바(라이브러리 그리드 제거·블록도구 세로·팔레트 제거) → Task 1 ✅
- §5 레이아웃(보드 640·결과 확대·구분선 영속) → Task 2 ✅
- §6 시그널 인라인 통합 → Task 3 ✅
- §7.1 hero 560 / §7.2 라벨 pill·폰트 / §7.3 클램프 → Task 4 ✅
- §8 검증(구문+시각·클램프 경계) → 각 태스크 Step 검증 ✅

**Placeholder scan:** 코드/명령 구체값. 시각 영역은 단위테스트 불가 — 구문검사+따옴표점검+라이브 시각검증 명시. Task 4 라벨 교체는 "대상 목록 + 좌표·색 유지" 지침으로 구체화(각 호출의 정확한 줄은 구현자가 매칭).

**Type consistency:** `_evLabel(c, text, x, y, color, align)`·`_evW`/`_evH`를 Task 4 전 호출에서 동일 사용. 레이아웃 변수 `--board-w`(Task 2)·`--hero-h`(Task 4)·`#verdictInline`(Task 3) 일관. `redrawCharts`·`split`·`board` 등 기존 심볼 재사용.
