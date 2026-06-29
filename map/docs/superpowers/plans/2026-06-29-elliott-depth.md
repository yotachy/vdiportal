# 엘리어트 파동 심화 (Elliott Depth) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 단순 순번 라벨이던 엘리어트를 규칙검증·유효도·추진/조정 분류·다음 파동 피보 투영으로 심화하고, 예측(TF가중)·작도·시연(Plan B 프레임워크)에 일관 반영한다.

**Architecture:** 엘리어트 수학을 코어 순수 함수 `analyzeElliott`로 모아 예측(`run`)·작도(`_drawElliottLayers`)가 공유. 시연 텍스트는 코어 `elliottSteps`로 분리(테스트 가능)해 `analysisSteps` 엘리어트 케이스가 호출 → Plan B의 HUD/로그/레이어 reveal 자동 적용. 피보(`analyzeFib`/`_drawFibLayers`) 패턴을 그대로 따른다. 기존 `elliottAnalyze`(블록 값 시계열)는 불변.

**Tech Stack:** Vanilla JS(무빌드), `node:test`/`node:assert`, HTML5 Canvas.

## Global Constraints

- 바닐라 JS · 빌드도구/외부 라이브러리 금지 · 단일 `forge.html` + 단일 `forge-core.js`.
- UI 텍스트 한국어. 다크 토큰 색만: 엘리어트 퍼플 `#c47ae0`, 경고/조정 `#e06a6a`/`#e8b463`, 중립 `#8a92b2`, 잉크 외곽 `rgba(11,15,20,.85)`.
- `analyzeElliott`·`elliottSteps`는 **순수 함수**(부수효과 없음). `P<2`·피벗<2 → 폴백(`uncertain`, bias 0, next null).
- 작도·예측 공유(같은 `analyzeElliott`). 작도 `M`({fiToX,pToY,nowFi,fiMin,reveal,xRight})·`_evLabel`(경계 클램프) 규약은 기존 helper와 동일. `c.save()/restore()`.
- 예측 엘리어트 기여는 **한 곳**(`run`의 ewDrift 보조항)에서만(이중계상 방지), `trendProfileForTF(tf).trendScale`로 TF 가중. swing은 정수%→`/100`(기존 elliott 규약).
- 기존 `elliottAnalyze` 함수·블록 값 경로 변경 금지.
- 단위 테스트: `node --test forge-core.test.js`.
- 따옴표 위생: Edit 도구 straight↔curly 사고 이력 — 각 forge.html 태스크 후 `git diff`로 부수변경 0 확인.

---

### Task 1: 코어 `analyzeElliott()` + `elliottSteps()` + export + 테스트

**Files:** Modify `forge-core.js` (`elliottAnalyze`(`:488`) 다음, `aggregateConviction`(`:507`) 앞에 삽입; export `:715`). Test `forge-core.test.js`.

**Interfaces:**
- Consumes: 기존 `detectSwings(arr, sens)→[{idx,price}]`.
- Produces:
  - `analyzeElliott(price, {swing=0.03}) → { waves:[{idx,price,label}], rules:{r1,r2,r3,score}, structure:"impulse_up"|"impulse_down"|"corrective"|"uncertain", current:{label,dir}, next:{label,target,dir}|null, bias }`
  - `elliottSteps(ea) → string[5]`. 둘 다 순수.

- [ ] **Step 1: 실패 테스트 작성** — `forge-core.test.js` 끝에 추가

```js
test("analyzeElliott: 5파 상승 임펄스 → impulse_up, 규칙·투영·bias", () => {
  const seg = (from, to, n) => Array.from({ length: n }, (_, i) => from + (to - from) * (i + 1) / n);
  const price = [100, ...seg(100, 120, 8), ...seg(120, 108, 6), ...seg(108, 150, 10), ...seg(150, 132, 6), ...seg(132, 165, 8)];
  const ea = ForgeCore.analyzeElliott(price, { swing: 0.04 });
  assert.strictEqual(ea.structure, "impulse_up");
  assert.ok(ea.rules.score > 0);
  assert.ok(ea.bias > 0);
  assert.ok(ea.next !== null);
});

test("analyzeElliott: 5파 하락 임펄스 → impulse_down, bias<0", () => {
  const seg = (from, to, n) => Array.from({ length: n }, (_, i) => from + (to - from) * (i + 1) / n);
  const price = [200, ...seg(200, 180, 8), ...seg(180, 192, 6), ...seg(192, 150, 10), ...seg(150, 168, 6), ...seg(168, 135, 8)];
  const ea = ForgeCore.analyzeElliott(price, { swing: 0.04 });
  assert.strictEqual(ea.structure, "impulse_down");
  assert.ok(ea.bias < 0);
});

test("analyzeElliott: 3레그(ABC형) → corrective", () => {
  const seg = (from, to, n) => Array.from({ length: n }, (_, i) => from + (to - from) * (i + 1) / n);
  const price = [100, ...seg(100, 88, 8), ...seg(88, 96, 6), ...seg(96, 84, 8)];
  const ea = ForgeCore.analyzeElliott(price, { swing: 0.04 });
  assert.strictEqual(ea.structure, "corrective");
  assert.ok(isFinite(ea.bias));
});

test("analyzeElliott: 소량/피벗부족 → 폴백(uncertain, bias 0, next null)", () => {
  const ea = ForgeCore.analyzeElliott([10, 11, 12], {});
  assert.strictEqual(ea.structure, "uncertain");
  assert.strictEqual(ea.bias, 0);
  assert.strictEqual(ea.next, null);
});

test("elliottSteps: 5단계, bias 반영", () => {
  const seg = (from, to, n) => Array.from({ length: n }, (_, i) => from + (to - from) * (i + 1) / n);
  const price = [100, ...seg(100, 120, 8), ...seg(120, 108, 6), ...seg(108, 150, 10), ...seg(150, 132, 6), ...seg(132, 165, 8)];
  const s = ForgeCore.elliottSteps(ForgeCore.analyzeElliott(price, { swing: 0.04 }));
  assert.strictEqual(s.length, 5);
  assert.ok(/bias/.test(s[4]));
});
```

> 합성 데이터가 `detectSwings`/규칙과 어긋나 structure가 기대와 다르면 **테스트 데이터(세그먼트 값·길이·swing)만** 조정해 의도한 구조를 만든다(단언·구현 로직 불변). 보고에 명시.

- [ ] **Step 2: 테스트 실패 확인**

Run: `node --test forge-core.test.js`
Expected: FAIL — `ForgeCore.analyzeElliott is not a function`

- [ ] **Step 3: 구현** — `forge-core.js`의 `elliottAnalyze` 함수 **다음**(aggregateConviction 앞)에 삽입

```js
  function analyzeElliott(price, opts) {
    opts = opts || {};
    const swing = opts.swing != null ? opts.swing : 0.03;
    const P = price.length;
    const EMPTY = { waves: [], rules: { r1: false, r2: false, r3: false, score: 0 }, structure: "uncertain", current: { label: "-", dir: 0 }, next: null, bias: 0 };
    if (P < 2) return EMPTY;
    const LAB = ["1", "2", "3", "4", "5", "A", "B", "C"];
    const sw = detectSwings(price, swing);
    if (sw.length < 2) return EMPTY;
    const legs = [];
    for (let i = 1; i < sw.length; i++) legs.push({ from: sw[i - 1], to: sw[i], up: sw[i].price >= sw[i - 1].price });
    const recent = legs.slice(-8);
    const waves = recent.map((lg, i) => ({ idx: lg.to.idx, price: lg.to.price, label: LAB[i] || "" }));
    const last = recent[recent.length - 1];
    const current = { label: (waves[waves.length - 1] && waves[waves.length - 1].label) || "-", dir: last.up ? 1 : -1 };
    const imp = recent.slice(0, 5), dirUp = imp.length ? imp[0].up : true, sgn = dirUp ? 1 : -1;
    let r1 = false, r2 = false, r3 = false;
    if (imp.length >= 2) { const w1s = imp[0].from.price, w2e = imp[1].to.price; r1 = dirUp ? (w2e >= w1s) : (w2e <= w1s); }
    if (imp.length >= 3) { const len = lg => Math.abs(lg.to.price - lg.from.price); const l1 = len(imp[0]), l3 = len(imp[2]), l5 = imp.length >= 5 ? len(imp[4]) : Infinity; r2 = !(l3 <= l1 && l3 <= l5); }
    if (imp.length >= 4) { const w1e = imp[0].to.price, w4e = imp[3].to.price; r3 = dirUp ? (w4e > w1e) : (w4e < w1e); }
    const passed = [r1, r2, r3].filter(Boolean).length;
    const checked = imp.length >= 4 ? 3 : imp.length >= 3 ? 2 : imp.length >= 2 ? 1 : 0;
    const completeness = Math.min(1, imp.length / 5);
    const score = checked ? (passed / checked) * completeness : 0;
    const allDirOk = imp.length >= 5 && imp[0].up === imp[2].up && imp[0].up === imp[4].up && imp[1].up !== imp[0].up;
    let structure = "uncertain";
    if (imp.length >= 5 && passed >= 2 && allDirOk) structure = dirUp ? "impulse_up" : "impulse_down";
    else if (recent.length >= 3) structure = "corrective";
    const span1 = imp.length ? Math.abs(imp[0].to.price - imp[0].from.price) : 0;
    let next = null;
    if (recent.length === 2 && imp.length >= 1) next = { label: "3", target: imp[0].from.price + sgn * 1.618 * span1, dir: sgn };
    else if (recent.length === 4 && imp.length >= 4) next = { label: "5", target: imp[3].to.price + sgn * span1, dir: sgn };
    else if (recent.length === 5 && imp.length >= 5) { const span15 = Math.abs(imp[4].to.price - imp[0].from.price); next = { label: "A", target: imp[4].to.price - sgn * 0.5 * span15, dir: -sgn }; }
    let bias;
    if (structure === "impulse_up") bias = 0.4 + 0.6 * score;
    else if (structure === "impulse_down") bias = -(0.4 + 0.6 * score);
    else if (structure === "corrective") bias = -current.dir * 0.4;
    else bias = 0;
    bias = Math.max(-1, Math.min(1, bias));
    return { waves, rules: { r1, r2, r3, score }, structure, current, next, bias };
  }

  function elliottSteps(ea) {
    const fmt = v => (Math.abs(v) >= 100 ? Math.round(v) : Math.round(v * 100) / 100);
    const st = ea.structure === "impulse_up" ? "상승 임펄스" : ea.structure === "impulse_down" ? "하락 임펄스" : ea.structure === "corrective" ? "ABC 조정" : "불확실";
    const ok = [ea.rules.r1, ea.rules.r2, ea.rules.r3].filter(Boolean).length;
    const nx = ea.next ? "다음 " + ea.next.label + "파 목표 " + fmt(ea.next.target) : "투영 없음";
    const bTxt = ea.bias > 0.1 ? "상승" : ea.bias < -0.1 ? "하락" : "중립";
    return [
      ea.waves.length ? "파동 카운트 " + ea.waves.length + "개 (현재 " + ea.current.label + ")" : "스윙 부족",
      "규칙 " + ok + "/3 · 유효 " + ea.rules.score.toFixed(2),
      st + " 분류",
      nx,
      "종합 방향 " + bTxt + " (bias " + ea.bias.toFixed(2) + ")"
    ];
  }
```

- [ ] **Step 4: export 추가** — `forge-core.js:715` return 객체 끝에 `analyzeElliott, elliottSteps` 삽입

```js
  return { version, makeDemoSeries, buildDAG, evalBlocks, detrendNorm, pdmTheta, scanPeriod, run, runSteps, visionBiasFrom, sampleSeries, sampleGraph, analyzeTrend, trendProfileForTF, analyzeMA, maSteps, analyzeFib, fibSteps, analyzeElliott, elliottSteps };
```

- [ ] **Step 5: 테스트 통과 확인**

Run: `node --test forge-core.test.js`
Expected: PASS (신규 5개 포함). 합성 데이터가 빡빡하면 데이터만 조정(단언 유지).

- [ ] **Step 6: 커밋**

```bash
git add forge-core.js forge-core.test.js
git commit -m "feat(forge): ForgeCore.analyzeElliott+elliottSteps — 규칙검증·추진/조정·투영·유효도·bias"
```

---

### Task 2: 예측 `run` — 엘리어트 드리프트(TF 가중) + 테스트

**Files:** Modify `forge-core.js` (`run` 내: fibDrift 줄(`:614`) 다음; `m` 합산 줄(`:626`)). Test `forge-core.test.js`.

**Interfaces:**
- Consumes: `analyzeElliott`(Task 1), `trendProfileForTF`. `run` 스코프 `price`, `graph`, `_prof`, `k`, `futW`, `fibDrift`.

- [ ] **Step 1: 실패 테스트 작성** — `forge-core.test.js` 끝에 추가

```js
test("run: 엘리어트 블록 유무가 예측 타깃을 가른다(격리) + TF", () => {
  const seg = (from, to, n) => Array.from({ length: n }, (_, i) => from + (to - from) * (i + 1) / n);
  const data = { price: [100, ...seg(100, 120, 8), ...seg(120, 108, 6), ...seg(108, 150, 10), ...seg(150, 132, 6), ...seg(132, 165, 8)] };
  const base = [{ id: "p", kind: "block", blockType: "price" }, { id: "o", kind: "block", blockType: "predict" }];
  const withEW = { nodes: [...base, { id: "e", kind: "block", blockType: "elliott", params: { swing: 4 } }], edges: [{ from: "p", to: "o" }, { from: "p", to: "e" }] };
  const without = { nodes: base, edges: [{ from: "p", to: "o" }] };
  const rW = ForgeCore.run(withEW, data, { futW: 12, timeframe: "월봉" });
  const rN = ForgeCore.run(without, data, { futW: 12, timeframe: "월봉" });
  const rI = ForgeCore.run(withEW, data, { futW: 12, timeframe: "5분" });
  assert.ok(rW.prediction.path.every(isFinite) && rN.prediction.path.every(isFinite) && rI.prediction.path.every(isFinite));
  assert.notStrictEqual(rW.prediction.target, rN.prediction.target);   // 엘리어트 기여로 달라짐
  const gain = r => r.prediction.target / r.prediction.anchor;
  assert.ok(gain(rW) > gain(rI));   // 월봉 TF 가중 > 5분
});

test("run: 엘리어트 블록 없으면 기여 0", () => {
  const G = { nodes: [{ id: "p", kind: "block", blockType: "price" }, { id: "o", kind: "block", blockType: "predict" }], edges: [{ from: "p", to: "o" }] };
  const r = ForgeCore.run(G, { price: Array.from({ length: 40 }, (_, i) => 100 + i) }, { futW: 8, timeframe: "월봉" });
  assert.ok(r.prediction.path.every(isFinite));
});
```

> `notStrictEqual` 실패(엘리어트 bias 0)면 데이터를 임펄스가 명확히 잡히도록 조정(swing/세그먼트). 단언·로직 불변.

- [ ] **Step 2: 테스트 실패 확인**

Run: `node --test forge-core.test.js`
Expected: FAIL — `notStrictEqual`(엘리어트 미반영 → 두 타깃 동일)

- [ ] **Step 3: 엘리어트 드리프트 산출** — `forge-core.js`의 `const fibDrift = ...` 줄(`:614`) **다음**에 삽입

```js
    const _en = (graph.nodes || []).find(nd => nd.kind === "block" && nd.blockType === "elliott");
    const _ew = _en ? analyzeElliott(price, { swing: ((_en.params && _en.params.swing) != null ? _en.params.swing : 3) / 100 }) : null;
    const ewDrift = _ew ? _ew.bias * _prof.trendScale * 0.08 : 0;   // 엘리어트 추진/조정 방향 드리프트(±8%·TF가중·유효도 반영)
```

- [ ] **Step 4: 예측 루프 합산** — `forge-core.js:626`의 `const m = ... + fibDrift * (k / futW), sd = ...` 줄을 교체

```js
      const m = rev + mom + trend + sig + seas + maDrift * (k / futW) + fibDrift * (k / futW) + ewDrift * (k / futW), sd = Math.sqrt(sigBand * sigBand + 0.36 * trChSig * trChSig) * Math.sqrt(k) * 0.85;
```

> 기존 항·`sd` 불변, `+ ewDrift * (k / futW)`만 추가.

- [ ] **Step 5: 테스트 통과 확인**

Run: `node --test forge-core.test.js`
Expected: PASS (전체)

- [ ] **Step 6: 커밋**

```bash
git add forge-core.js forge-core.test.js
git commit -m "feat(forge): 예측 run에 엘리어트 방향 드리프트(analyzeElliott.bias·TF가중) 보조항"
```

---

### Task 3: 작도 `_drawElliottLayers` + 차트 모드

**Files:** Modify `forge.html` (헬퍼는 `_drawFibLayers`(`:2599`) 근처에 추가; 차트 elliott 분기).

**Interfaces:**
- Consumes: `ForgeCore.analyzeElliott`(Task 1), `_evLabel`(경계 클램프 헬퍼). 차트 기하 `toXh`/`toY`/`Hn`/`off`/`P`/`price`/`col`.
- Produces: `_drawElliottLayers(c, ea, M)` — `M={fiToX,pToY,nowFi,fiMin,reveal,xRight}`. 두 모드 공용(Task 4가 오버레이 호출).

- [ ] **Step 1: 공용 헬퍼 추가** — `forge.html`의 `_drawFibLayers` 함수 근처에 삽입

```js
  // 엘리어트 작도(차트·오버레이 공용, reveal 인지). M=좌표 매퍼.
  function _drawElliottLayers(c, ea, M) {
    c.save();
    const { fiToX, pToY, nowFi, fiMin = 0, reveal = Infinity, xRight } = M;
    const COL = "#c47ae0", BAD = "#e06a6a";
    const fmt = v => (Math.abs(v) >= 100 ? Math.round(v) : Math.round(v * 100) / 100);
    // layer1: 파동 폴리라인 + 라벨
    if (reveal >= 1 && ea.waves.length) {
      c.strokeStyle = COL; c.lineWidth = 1.8; c.setLineDash([]); c.beginPath(); let st = false;
      for (const w of ea.waves) { const x = fiToX(Math.max(fiMin, w.idx)), y = pToY(w.price); if (!isFinite(x) || !isFinite(y)) continue; st ? c.lineTo(x, y) : c.moveTo(x, y); st = true; }
      c.stroke();
      for (const w of ea.waves) {
        const x = fiToX(Math.max(fiMin, w.idx)), y = pToY(w.price); if (!isFinite(x) || !isFinite(y)) continue;
        c.fillStyle = COL; c.beginPath(); c.arc(x, y, 2.6, 0, 7); c.fill();
        _evLabel(c, w.label, x + 3, y - 3, COL, "left");
      }
    }
    // layer2: 유효도/구조 배지(우상단)
    if (reveal >= 2) {
      const stx = ea.structure === "impulse_up" ? "임펄스↑" : ea.structure === "impulse_down" ? "임펄스↓" : ea.structure === "corrective" ? "ABC 조정" : "불확실";
      const ok = [ea.rules.r1, ea.rules.r2, ea.rules.r3].filter(Boolean).length;
      const bcol = ea.structure.indexOf("impulse") === 0 ? COL : ea.structure === "corrective" ? "#e8b463" : "#8a92b2";
      const xb = (xRight != null ? xRight : fiToX(nowFi));
      _evLabel(c, stx + " " + ok + "/3 유효" + ea.rules.score.toFixed(2), xb, 14, bcol, "right");
    }
    // layer3: 다음 파동 투영선
    if (reveal >= 3 && ea.next && ea.waves.length) {
      const lw = ea.waves[ea.waves.length - 1];
      const x0 = fiToX(Math.max(fiMin, lw.idx)), y0 = pToY(lw.price);
      const xR = (xRight != null ? xRight : fiToX(nowFi)), yT = pToY(ea.next.target);
      if ([x0, y0, xR, yT].every(isFinite)) {
        c.strokeStyle = COL; c.globalAlpha = .7; c.setLineDash([5, 4]); c.beginPath(); c.moveTo(x0, y0); c.lineTo(xR, yT); c.stroke(); c.globalAlpha = 1; c.setLineDash([]);
        _evLabel(c, "→" + ea.next.label + " " + fmt(ea.next.target), xR, yT, COL, "right");
      }
    }
    c.restore();
  }
```

- [ ] **Step 2: 차트 elliott 분기 교체** — `forge.html`의 두 elliott 분기 중 **차트 모드**(주변 `toXh`/`toY`/`Hn`/`off` 선언) 분기 내부를 아래로 교체

```js
          const ea = ForgeCore.analyzeElliott(price, { swing: ((n.params && n.params.swing) != null ? n.params.swing : 3) / 100 });
          _drawElliottLayers(c, ea, { fiToX: fi => toXh(Math.max(0, Math.min(Hn - 1, fi - off))), pToY: v => toY(v), nowFi: P - 1, fiMin: off, reveal: _playing ? (_evReveal[n.id] || 0) : Infinity, xRight: g.padX + g.plotW });
          legend.push({ col, t: EV_LABEL.elliott + "(전문)" });
```

> elliott 분기가 둘(차트 `toXh`/`toY` · 오버레이 `xOf`/`yOf`/`clipY`). **차트 분기만** 이 태스크. 기존 zigzag 폴리라인+라벨 코드는 위로 전체 대체. 오버레이는 Task 4 — 건드리지 말 것.

- [ ] **Step 3: 검증** — 인라인 `<script>` 추출 `node --check` 무오류. `git diff <base> HEAD -- forge.html`로 따옴표 부수변경 0 + 오버레이 elliott 분기 미변경 확인. 보고 기재.

- [ ] **Step 4: 커밋**

```bash
git add forge.html
git commit -m "feat(forge): 차트모드 엘리어트 작도(_drawElliottLayers·유효도배지·다음파동 투영)"
```

---

### Task 4: 오버레이 배선 + 시연 단계(analysisSteps) + 범례

**Files:** Modify `forge.html` (오버레이 elliott 분기; `analysisSteps`(`:3082` fib 케이스 부근); `EV_LABEL` 확인).

**Interfaces:**
- Consumes: `_drawElliottLayers`(Task 3), `ForgeCore.analyzeElliott`/`elliottSteps`(Task 1). 오버레이 기하 `xOf`/`yOf`/`clipY`/`P`/`price`/`col`.

- [ ] **Step 1: 오버레이 elliott 분기 교체** — **오버레이 모드**(주변 `xOf`/`yOf`/`clipY` 선언) elliott 분기 내부를 아래로 교체

```js
          const ea = ForgeCore.analyzeElliott(price, { swing: ((n.params && n.params.swing) != null ? n.params.swing : 3) / 100 });
          _drawElliottLayers(c, ea, { fiToX: fi => xOf(fi), pToY: v => clipY(yOf(v)), nowFi: P - 1, fiMin: 0, reveal: _playing ? (_evReveal[n.id] || 0) : Infinity, xRight: g.rightX || (g.ox + g.dw) });
          legend.push({ col, t: EV_LABEL.elliott + "(전문)" });
```

> 오버레이 elliott 분기(xOf/yOf/clipY)만. 차트 분기(Task 3) 미변경. 기존 zigzag 폴리라인+라벨 코드 전체 대체.

- [ ] **Step 2: `analysisSteps`에 elliott 케이스 추가** — `analysisSteps`의 fib 케이스(`:3082`) **다음**에 삽입

```js
    if (n.blockType === "elliott" && Array.isArray(price) && price.length >= 2) {
      const ea = ForgeCore.analyzeElliott(price, { swing: ((n.params && n.params.swing) != null ? n.params.swing : 3) / 100 });
      const texts = ForgeCore.elliottSteps(ea), layers = [1, 1, 2, 3, 4];
      return texts.map((t, i) => ({ text: t, layer: layers[i] }));
    }
```

- [ ] **Step 3: 범례 상수 확인** — `EV_LABEL.elliott`는 "엘리어트" 유지(작도에서 "(전문)" 동적 부착). 변경 없음 — 확인만.

- [ ] **Step 4: 검증** — 인라인 `<script>` `node --check` 무오류. `git diff <base> HEAD -- forge.html`로 따옴표 부수변경 0 + 차트 elliott 분기 미변경 확인. 보고 기재.

- [ ] **Step 5: 커밋**

```bash
git add forge.html
git commit -m "feat(forge): 오버레이 엘리어트 작도 배선 + analysisSteps 엘리어트 5단계(시연 프레임워크)"
```

---

## Self-Review

**Spec coverage:**
- §4 `analyzeElliott`(카운트·3규칙·유효도·추진/조정·투영·bias) → Task 1 + 테스트 ✅
- §5 예측(ewDrift 단일경로·TF가중·없으면 0·swing/100) → Task 2 + 격리 테스트 ✅
- §6 `_drawElliottLayers`(파동선/라벨1·배지2·투영3·reveal·경계클램프) → Task 3(차트)·Task 4(오버레이) ✅
- §7 시연(`elliottSteps` + `analysisSteps` 케이스) → Task 1(elliottSteps)·Task 4(analysisSteps) ✅
- §8 테스트(임펄스↑↓·조정·폴백·steps·예측 TF/격리) → Task 1·2 ✅
- 편집기 swing 기존 유지(변경 불요) — 별도 태스크 없음 ✅

**Placeholder scan:** 코드/명령/기대출력 구체값. 합성 테스트 데이터 튜닝 여지는 단언 불변으로 한정. 작도는 단위테스트 불가 → 구문검사+라이브/헤드리스 시각검증.

**Type consistency:** `analyzeElliott` 반환(`waves`/`rules{r1,r2,r3,score}`/`structure`/`current`/`next`/`bias`)을 Task 2(`_ew.bias`)·Task 3/4(`ea.waves`,`ea.rules`,`ea.structure`,`ea.next`)·`elliottSteps`에서 동일 사용. swing 정수%→`/100` 전 호출부 일관. `M` 매퍼·`_evLabel`·`xRight`는 `_drawFibLayers`와 동일.
