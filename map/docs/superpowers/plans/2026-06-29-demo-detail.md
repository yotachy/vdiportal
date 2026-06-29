# 시연 상세화 프레임워크 (Demo Detail) Implementation Plan — Plan B

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 시연(재생)에서 각 도구의 분석 과정을 단계별로 보이게 한다 — HUD 하위단계 순차 점등 + 누적 분석 로그 패널 + 작도 레이어 단계 출현. MA를 첫 소비자로, 후속 도구가 재사용할 일반 프레임워크.

**Architecture:** 노드별 분석 단계를 `analysisSteps(n, …)`가 `[{text, layer}]`로 산출(MA는 5단계, 그 외는 기존 한 줄=단일 스텝 폴백). `playAnalysis`를 노드×단계 "틱" 루프로 재구성해 각 틱마다 HUD 하위단계 점등·로그 append·작도 reveal level을 갱신한다. 테스트 가능한 MA 단계 텍스트는 코어 `ForgeCore.maSteps`로 분리.

**Tech Stack:** Vanilla JS(무빌드), `node:test`/`node:assert`, HTML5 Canvas, DOM/CSS.

**선행:** [MA 심화 Plan A](2026-06-29-ma-depth.md) 완료·배포됨(`analyzeMA`·`_drawMALayers` 존재). 스펙 §7 구현.

## Global Constraints

- 바닐라 JS · 빌드도구/외부 라이브러리 금지 · 단일 `forge.html` + 단일 `forge-core.js`.
- UI 텍스트 한국어. 다크 토큰 색만(`--ink`/`--eth`/`--gold`/`--line`/`--raised2`/`--bull`/`--bear`).
- `maSteps`는 순수 함수(부수효과 없음). `analysisSteps`는 MA 외 블록은 기존 `nodeReadText` 한 줄을 단일 스텝(layer 0)으로 폴백.
- 시연 길어져도 무방(노드별 시간 무시) — 틱 간격 `STEP_SUB=750ms`, 총 시간 = 틱 수 × STEP_SUB.
- 작도 레이어 reveal: 재생 중에만 단계 제한, 비재생·재생종료 후엔 전체(∞). reveal 미지원 도구(추세선 등)는 무시(항상 전체).
- 단위 테스트: `node --test forge-core.test.js`(코어 `maSteps`만 테스트 가능; HUD/로그/reveal은 구문검사+헤드리스/라이브 시각검증).

---

### Task 1: 코어 `maSteps()` + forge.html `analysisSteps()` + 테스트

**Files:**
- Modify: `forge-core.js` (`analyzeMA` 다음에 `maSteps` 삽입; export 라인)
- Modify: `forge.html` (`nodeReadText`(`:2945`) 근처에 `analysisSteps` 추가)
- Test: `forge-core.test.js`

**Interfaces:**
- Consumes: `analyzeMA`(Plan A), `nodeReadText`(forge.html).
- Produces:
  - `ForgeCore.maSteps(ma, len) → string[5]` (MA 5단계 텍스트). 순수.
  - `analysisSteps(n, result, priceLast, price) → [{text:string, layer:number}]` (forge.html). MA=5단계(layer 1,1,2,3,4), 그 외=`[{text:nodeReadText(...), layer:0}]`.

- [ ] **Step 1: 실패 테스트 작성** — `forge-core.test.js` 끝에 추가

```js
test("maSteps: 5단계 텍스트, 골든크로스·bias 반영", () => {
  const down = Array.from({ length: 30 }, (_, i) => 100 - i);
  const up = Array.from({ length: 14 }, (_, i) => 71 + (i + 1) * 4);
  const ma = ForgeCore.analyzeMA(down.concat(up), { len: 5 });
  const s = ForgeCore.maSteps(ma, 5);
  assert.strictEqual(s.length, 5);
  assert.ok(s[0].includes("5/15/30"), "1단계: 기간");
  assert.ok(/골든크로스/.test(s[2]), "3단계: 골든크로스");
  assert.ok(/bias/.test(s[4]), "5단계: bias");
});

test("maSteps: 정배열 상승 → 배열·종합 방향 반영", () => {
  const ma = ForgeCore.analyzeMA(Array.from({ length: 80 }, (_, i) => 100 + i * 2), { len: 5 });
  const s = ForgeCore.maSteps(ma, 5);
  assert.ok(s[1].includes("정배열"), "2단계: 정배열");
  assert.ok(s[4].includes("상승"), "5단계: 상승");
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `node --test forge-core.test.js`
Expected: FAIL — `ForgeCore.maSteps is not a function`

- [ ] **Step 3: 코어 `maSteps` 구현** — `forge-core.js`의 `analyzeMA` 함수 **다음**에 삽입

```js
  function maSteps(ma, len) {
    const a = ma.align.order, aTxt = a === "bull" ? "정배열" : a === "bear" ? "역배열" : "혼조";
    const cTxt = ma.cross.type ? (ma.cross.type === "golden" ? "골든크로스 " : "데드크로스 ") + ma.cross.barsAgo + "봉 전" : "교차 신호 없음";
    const sl = ma.mas.long ? ma.mas.long.slope : 0, slopeTxt = sl > 0.1 ? "상승" : sl < -0.1 ? "하락" : "횡보";
    const srTxt = ma.sr.ma ? " · " + (ma.sr.side === "support" ? "지지" : "저항") + " 근접" : "";
    const bTxt = ma.bias > 0.1 ? "상승" : ma.bias < -0.1 ? "하락" : "중립";
    return [
      "단·중·장 MA 산출 (" + len + "/" + (len * 3) + "/" + (len * 6) + ")",
      aTxt + " (정렬도 " + Math.round(ma.align.score * 100) + "%)",
      cTxt,
      "장기 기울기 " + slopeTxt + srTxt,
      "종합 방향 " + bTxt + " (bias " + ma.bias.toFixed(2) + ")"
    ];
  }
```

- [ ] **Step 4: export 추가** — `forge-core.js`의 return 객체 끝에 `maSteps` 삽입(기존 `analyzeMA` 옆)

```js
  return { version, makeDemoSeries, buildDAG, evalBlocks, detrendNorm, pdmTheta, scanPeriod, run, runSteps, visionBiasFrom, sampleSeries, sampleGraph, analyzeTrend, trendProfileForTF, analyzeMA, maSteps };
```

- [ ] **Step 5: forge.html `analysisSteps` 추가** — `forge.html`의 `nodeReadText` 함수(`:2945`) **다음**에 삽입

```js
  // 노드별 분석 단계 배열 [{text, layer}]. MA는 다단계, 그 외는 기존 한 줄 폴백.
  function analysisSteps(n, result, priceLast, price) {
    if (n.blockType === "ma" && Array.isArray(price) && price.length >= 2) {
      const len = (n.params && n.params.len) || 20, ema = !!(n.params && n.params.ema);
      const ma = ForgeCore.analyzeMA(price, { len, ema });
      const texts = ForgeCore.maSteps(ma, len), layers = [1, 1, 2, 3, 4];
      return texts.map((t, i) => ({ text: t, layer: layers[i] }));
    }
    return [{ text: nodeReadText(n, result, priceLast), layer: 0 }];
  }
```

- [ ] **Step 6: 테스트 통과 + 구문 검증**

Run: `node --test forge-core.test.js` → PASS (신규 2개 포함)
그리고 `forge.html` 인라인 `<script>` 추출 → `node --check` 무오류.

- [ ] **Step 7: 커밋**

```bash
git add forge-core.js forge-core.test.js forge.html
git commit -m "feat(forge): maSteps(코어)+analysisSteps(노드별 분석단계 배열)"
```

---

### Task 2: 틱 기반 시연 + HUD 하위단계 순차 점등

**Files:**
- Modify: `forge.html` (HUD CSS `:391` 다음; `_hudNode`(`:3725`) 옆에 `_hudNodeSteps` 추가; `playAnalysis` 틱 루프 `:3740-3751` 재구성; morph `total` `:3755`)

**Interfaces:**
- Consumes: `analysisSteps`(Task 1).
- Produces: 틱 루프(`ticks`)·`_hudNodeSteps`. Task 3(`_logAppend`)·Task 4(`_evReveal`)가 이 틱 콜백에 훅을 추가.

- [ ] **Step 1: `.ph-steps` CSS 추가** — `forge.html:391`(`.ph-seg.cur` 줄) 다음에 삽입

```css
  .play-hud .ph-steps{display:flex;flex-direction:column;gap:1px;margin-top:2px}
  .play-hud .ph-step{font-size:10px;color:var(--eth);opacity:.38;transition:opacity .2s,color .2s;letter-spacing:-.01em;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .play-hud .ph-step.lit{opacity:1;color:var(--ink)}
  .play-hud .ph-step.cur{color:var(--gold);font-weight:700;opacity:1}
```

- [ ] **Step 2: `_hudNodeSteps` 추가** — `forge.html`의 `_hudNode` 함수(`:3725`) **다음**에 삽입

```js
    // 하위단계 순차 점등 HUD. steps=[{text,layer}], upto=현재 점등 인덱스
    function _hudNodeSteps(n, idx, steps, upto) {
      if (!hud) return;
      const conv = n.conviction || 0;
      const lc = conv > 5 ? "var(--bull)" : conv < -5 ? "var(--bear)" : "var(--eth)";
      const memo = (n.note && n.note.trim()) || (n.desc && n.desc.trim()) || "";
      const segs = indNodes.map((_, k) => `<span class="ph-seg ${k < idx ? "done" : k === idx ? "cur" : ""}"></span>`).join("");
      const stepHtml = steps.map((st, i) => `<span class="ph-step ${i < upto ? "lit" : i === upto ? "lit cur" : ""}">${esc(st.text)}</span>`).join("");
      hud.innerHTML =
        `<span class="ph-dot" style="color:${lc}"></span>
         <div class="ph-node"><span class="ph-title">${esc(BTLABEL[n.blockType] || n.blockType)}${n.title ? " · " + esc(n.title) : ""}</span>
           <div class="ph-steps">${stepHtml}</div>
           ${memo ? `<span class="ph-memo">“${esc(memo)}”</span>` : ""}</div>
         <div class="ph-prog"><span class="ph-knt">${idx + 1}/${indNodes.length}</span><span class="ph-bar">${segs}</span></div>`;
    }
```

- [ ] **Step 3: 틱 루프 재구성** — `forge.html`의 기존 `// 노드별 순차 내레이션` 주석부터 `}, idx * STEP)); });` 까지(`:3740-3751`)를 아래로 교체

```js
    // 노드별 다단계 시연 — 각 노드의 분석단계를 틱으로 펼쳐 순차 점등(시연 길어짐 OK)
    const STEP_SUB = 750;   // 하위단계 간격(ms)
    const _allPrice = (currentData().price) || [];
    const stepsByNode = indNodes.map(n => analysisSteps(n, lastResult, priceLast0, _allPrice));
    const ticks = [];
    indNodes.forEach((n, idx) => { stepsByNode[idx].forEach((st, sIdx) => ticks.push({ n, idx, steps: stepsByNode[idx], sIdx, st })); });
    ticks.forEach((tk, tIdx) => {
      _playTimers.push(setTimeout(() => {
        if (!_playing) return;
        if (tk.sIdx === 0) {
          if (tk.idx > 0) { const pe = bq(indNodes[tk.idx - 1].id); if (pe) { pe.classList.remove("analyzing"); pe.classList.add("analyzed"); } }
          const el = bq(tk.n.id); if (el) { el.classList.remove("analyzed"); el.classList.add("analyzing"); }
          _evidenceSet.add(tk.n.id);
        }
        _hudNodeSteps(tk.n, tk.idx, tk.steps, tk.sIdx);
        if (progEl) progEl.textContent = "분석 중 " + (tk.idx + 1) + "/" + indNodes.length + " · " + (BTLABEL[tk.n.blockType] || "노드") + " (" + (tk.sIdx + 1) + "/" + tk.steps.length + ")";
      }, tIdx * STEP_SUB));
    });
```

- [ ] **Step 4: morph 총시간 갱신** — `forge.html:3755`의 `const total = Math.max(2600, indNodes.length * STEP + 800), ...` 를 교체

```js
    const total = Math.max(2600, ticks.length * STEP_SUB + 800), t0 = performance.now();
```

> 기존 `_hudNode`·`const STEP = 1500;`는 더 이상 호출되지 않는다. `STEP` 상수 줄은 제거(또는 미사용으로 남겨도 무방하나 제거 권장). `_hudNode`는 남겨도 무해하나 미사용 — 제거 권장(리뷰에서 미사용 지적될 수 있음).

- [ ] **Step 5: 구문 검증 + 커밋**

`forge.html` 인라인 `<script>` 추출 → `node --check` 무오류 확인.
```bash
git add forge.html
git commit -m "feat(forge): 시연 틱 기반 재구성 + HUD 하위단계 순차 점등(_hudNodeSteps)"
```

---

### Task 3: 누적 분석 로그 패널 `#analyzeLog`

**Files:**
- Modify: `forge.html` (markup: `playHud`(`:489`) 다음; CSS: `.play-hud` 블록 근처; `_logAppend` 추가; 틱 콜백·재생시작·종료에 훅)

**Interfaces:**
- Consumes: 틱 루프(Task 2), `BTLABEL`.
- Produces: `_logAppend(n, text)`.

- [ ] **Step 1: 로그 패널 markup** — `forge.html:489`의 `<div id="playHud" ...></div>` **다음 줄**에 삽입

```html
      <div id="analyzeLog" class="analyze-log" aria-hidden="true"></div>
```

- [ ] **Step 2: `.analyze-log` CSS 추가** — `forge.html`의 `.play-hud.on` 정의(`:375`) 근처(같은 CSS 블록)에 삽입

```css
  .analyze-log{position:absolute;right:10px;bottom:10px;z-index:9;width:300px;max-height:38%;overflow-y:auto;
    background:rgba(11,15,20,.82);border:1px solid var(--line);border-radius:8px;padding:7px 10px;
    font-family:ui-monospace,monospace;font-size:10px;line-height:1.55;color:var(--eth);display:none}
  .analyze-log.on{display:block}
  .analyze-log .lg{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .analyze-log .lg b{color:var(--gold);font-weight:700}
```

- [ ] **Step 3: `_logAppend` + 재생시작 클리어** — `forge.html`의 `playAnalysis` 안, `_evidenceSet = new Set();`(`:3718`) **다음 줄**에 클리어 삽입

```js
    const _lg0 = document.getElementById("analyzeLog"); if (_lg0) { _lg0.innerHTML = ""; _lg0.classList.remove("on"); }
```
그리고 `playAnalysis` 함수 내부(예: `_hudNodeSteps` 정의 다음)에 헬퍼 추가:
```js
    function _logAppend(n, text) {
      const lg = document.getElementById("analyzeLog"); if (!lg) return;
      lg.classList.add("on");
      const row = document.createElement("div"); row.className = "lg";
      row.innerHTML = "<b>[" + esc(BTLABEL[n.blockType] || n.blockType) + "]</b> " + esc(text);
      lg.appendChild(row); lg.scrollTop = lg.scrollHeight;
    }
```

- [ ] **Step 4: 틱 콜백에 로그 훅** — Task 2의 틱 콜백에서 `_hudNodeSteps(...)` 호출 **다음 줄**에 삽입

```js
        _logAppend(tk.n, tk.st.text);
```

- [ ] **Step 5: 구문 검증 + 커밋**

`forge.html` 인라인 `<script>` 추출 → `node --check` 무오류.
```bash
git add forge.html
git commit -m "feat(forge): 누적 분석 로그 패널(#analyzeLog) — 틱마다 단계 append"
```

---

### Task 4: 작도 레이어 단계 출현 (reveal)

**Files:**
- Modify: `forge.html` (`_evReveal` 전역 `:2410` 근처; `_drawMALayers` reveal 인자; `_drawEvidence` ma 분기 2곳 M에 `reveal`; 틱 콜백·finishPlay·stopPlay)

**Interfaces:**
- Consumes: 틱 루프(Task 2), `_drawMALayers`(Plan A), `drawEvidence`.
- Produces: `_evReveal` 맵(nodeId→현재 레이어 상한).

- [ ] **Step 1: `_evReveal` 전역 추가** — `forge.html`의 `let _evidenceSet = new Set();`(`:2410`) **다음 줄**

```js
  let _evReveal = {};   // 시연 중 노드별 작도 레이어 출현 상한(nodeId→layer). 비재생=전체(∞)
```

- [ ] **Step 2: `_drawMALayers`에 reveal 게이팅** — `_drawMALayers` 함수 시작부의 구조분해를 교체하고, 레이어별 가드 추가

`const { fiToX, pToY, nowFi, fiMin = 0 } = M;` 를 아래로 교체:
```js
    const { fiToX, pToY, nowFi, fiMin = 0, reveal = Infinity } = M;
```
그리고 **크로스 마커** 그리기 블록을 `if (reveal >= 2 && ma.cross.type && ...)` 로, **배열 라벨** 블록을 `if (reveal >= 3 && ma.mas.short)` 로 감싼다(3중 MA선 자체는 layer 1 → `reveal >= 1`일 때만 그림: `drawMA` 3회 호출을 `if (reveal >= 1) { drawMA(long); drawMA(mid); drawMA(short); }` 로 감싼다).

- [ ] **Step 3: `_drawEvidence` ma 분기에 reveal 전달** — 차트·오버레이 두 ma 분기의 `_drawMALayers(c, ma, { ... })` 호출 M 객체에 `reveal` 추가

차트 분기:
```js
          _drawMALayers(c, ma, { fiToX: fi => toXh(Math.max(0, Math.min(Hn - 1, fi - off))), pToY: v => toY(v), nowFi: P - 1, fiMin: off, reveal: _playing ? (_evReveal[n.id] || 0) : Infinity });
```
오버레이 분기:
```js
          _drawMALayers(c, ma, { fiToX: fi => xOf(fi), pToY: v => clipY(yOf(v)), nowFi: P - 1, fiMin: 0, reveal: _playing ? (_evReveal[n.id] || 0) : Infinity });
```

- [ ] **Step 4: 틱 콜백에서 reveal 갱신 + 재드로** — Task 2 틱 콜백의 `_logAppend(...)`(Task 3) **다음 줄**에 삽입

```js
        _evReveal[tk.n.id] = tk.st.layer; drawEvidence();
```

- [ ] **Step 5: 종료 시 reveal 해제** — `finishPlay`(`:3763`) 안 `_evidenceSet = new Set(...)` 줄 다음, 그리고 `stopPlay`(`:3674`) 안에 각각 삽입

```js
      _evReveal = {};
```
(finishPlay: 전체 표시 복귀. stopPlay: 중단 시 전체 표시 복귀. 둘 다 이후 `renderChart`/`clearAnalyzeViz`→`drawEvidence`가 ∞로 전체 렌더)

- [ ] **Step 6: 구문 검증 + 커밋**

`forge.html` 인라인 `<script>` 추출 → `node --check` 무오류.
```bash
git add forge.html
git commit -m "feat(forge): 작도 레이어 단계 출현(reveal) — 시연 틱마다 MA 레이어 순차 노출"
```

---

## Self-Review

**Spec coverage (§7):**
- §7.1 `analysisSteps`(MA 5단계+폴백) → Task 1 ✅ (테스트 가능한 텍스트는 코어 `maSteps`)
- §7.2 HUD 하위단계 순차 점등 → Task 2 ✅ (틱 루프 + `_hudNodeSteps` + `.ph-steps`)
- §7.3 누적 로그 패널 → Task 3 ✅ (`#analyzeLog` + `_logAppend` + 시작 클리어·종료 잔존)
- §7.4 작도 레이어 단계 출현 → Task 4 ✅ (`_evReveal` + `_drawMALayers` reveal + 틱 재드로)

**Placeholder scan:** 코드/명령/CSS 구체값. HUD/로그/reveal은 단위테스트 불가 → 구문검사 + 헤드리스/라이브 시각검증 명시(컨트롤러).

**Type consistency:** `maSteps(ma,len)→string[]`, `analysisSteps(...)→[{text,layer}]`. 틱 `tk={n,idx,steps,sIdx,st}`, `st={text,layer}` 일관. `_evReveal[nodeId]=layer`, `_drawMALayers` M.reveal 일관. layer 매핑: MA 단계 [1,1,2,3,4] ↔ 작도 게이트(선 reveal≥1·크로스≥2·라벨≥3). 5단계(layer 4=bias)는 추가 작도 없음(전체 유지).
