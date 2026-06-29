# 다각도 추세 분석 (Multi-Angle Trend) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 장/중/단 3중 회귀선·피봇 지지/저항·회귀 채널·강도 라벨을 `ForgeCore.analyzeTrend()` 단일 출처로 산출해 작도와 예측이 일관되게 장기추세를 반영하게 한다.

**Architecture:** 추세 수학 전부를 `forge-core.js`의 순수 함수 `analyzeTrend(price, opts)`로 모아 `ForgeCore`로 export. `forge.html` 작도(`_drawEvidence`)와 `forge-core.js` 예측(`run`)이 같은 결과를 공유. 작도는 좌표 변환만, 예측은 블렌드 로그기울기·채널σ만 사용.

**Tech Stack:** Vanilla JS(무빌드), `node:test`/`node:assert` 단위 테스트, HTML5 Canvas 2D 작도.

## Global Constraints

- 바닐라 JS · 빌드 도구/외부 라이브러리 금지 · 단일 HTML(`forge.html`) + 단일 코어(`forge-core.js`) 유지.
- UI 텍스트 한국어. 다크 테마 토큰 색만 사용: 골드 `#e8b463`/`#ffd24d`, 그린(bull) `#46c28e`, 레드(bear) `#e06a6a`, 블루 `#5b8def`, eth `#8a92b2`, 잉크 `#0b0f14`.
- 작도·예측은 **같은 시계열·같은 분석**으로 정합(CLAUDE.md 원칙).
- 단위 테스트 실행: `node --test forge-core.test.js`.
- `analyzeTrend`는 **순수 함수**(부수효과·전역접근 없음). 가격 `≤0` 방어(`Math.max(1e-9, v)`).
- 좌표 규약: 윈도우선 값 `valAt(fi) = bRaw + slopeRaw*(fi - startIdx)` (절대 봉 인덱스 `fi`). 피봇/채널선 값 규약은 각 Task에 명시.

---

### Task 1: 코어 `analyzeTrend()` + 헬퍼 + export + 단위 테스트

**Files:**
- Modify: `forge-core.js` (헬퍼 `linfit`/`detectSwings` 뒤, 약 277행 근처에 함수 추가; export 라인 `forge-core.js:492`)
- Test: `forge-core.test.js` (파일 끝에 테스트 추가)

**Interfaces:**
- Consumes: 기존 `linfit(y)→{a:절편,b:기울기}`, `detectSwings(arr,sens)→[{idx,price}]`.
- Produces:
  ```
  analyzeTrend(price:number[], opts?:{shortLen?,pivotSwing?,channelK?,weights?}) → {
    windows: { long:WIN|null, mid:WIN|null, short:WIN|null },
              // WIN = { startIdx, m, slopeRaw, bRaw, slopeLog, bLog, r2 }
    pivots:  { support:LINE|null, resistance:LINE|null, points:[{idx,price,type:"high"|"low"}] },
              // LINE = { slope, b, fromIdx, toIdx }  // value(fi) = slope*fi + b
    channel: { slopeRaw, bRaw, sigma, k } | null,   // value(fi) = bRaw + slopeRaw*fi ± k*sigma
    blend:   { slopeLog:number, channelSigmaLog:number },
    dominant:"long"|"mid"|"short"|null
  }
  ```
  - WIN 값 규약: `valAt(fi) = bRaw + slopeRaw*(fi - startIdx)` (로그면 `bLog + slopeLog*(fi-startIdx)`).
  - channel 값 규약: `bRaw + slopeRaw*fi ± k*sigma` (절대 인덱스, long 전체창 회귀이므로 startIdx=0).

- [ ] **Step 1: 실패 테스트 작성** — `forge-core.test.js` 끝에 추가

```js
test("analyzeTrend: 완전 직선 → r2≈1, slopeRaw 정확, blend 유한·양수", () => {
  const price = Array.from({ length: 60 }, (_, i) => 100 + 2 * i); // 기울기 2/봉
  const ta = ForgeCore.analyzeTrend(price, { shortLen: 20 });
  assert.ok(ta.windows.long, "long 창 존재");
  assert.ok(Math.abs(ta.windows.long.slopeRaw - 2) < 1e-6);
  assert.ok(ta.windows.long.r2 > 0.999);
  assert.ok(ta.blend.slopeLog > 0 && isFinite(ta.blend.slopeLog));
});

test("analyzeTrend: 지수성장 → slopeLog 일정, channelSigmaLog≈0", () => {
  const g = Math.log(1.05);
  const price = Array.from({ length: 80 }, (_, i) => 10 * Math.exp(g * i));
  const ta = ForgeCore.analyzeTrend(price);
  assert.ok(Math.abs(ta.windows.long.slopeLog - g) < 1e-6);
  assert.ok(ta.blend.channelSigmaLog < 1e-6);
});

test("analyzeTrend: 지그재그 → 피봇 고/저점 둘 다 존재", () => {
  const price = [];
  for (let c = 0; c < 4; c++) { for (let i = 0; i < 10; i++) price.push(100 + i); for (let i = 0; i < 10; i++) price.push(110 - i); }
  const ta = ForgeCore.analyzeTrend(price, { pivotSwing: 0.05 });
  assert.ok(ta.pivots.points.length >= 3);
  assert.ok(ta.pivots.points.some(p => p.type === "high"));
  assert.ok(ta.pivots.points.some(p => p.type === "low"));
});

test("analyzeTrend: 노이즈 직선 → 채널 sigma 유한·양수", () => {
  const price = Array.from({ length: 50 }, (_, i) => 100 + i + ((i * 7) % 5 - 2));
  const ta = ForgeCore.analyzeTrend(price);
  assert.ok(ta.channel && ta.channel.sigma > 0 && isFinite(ta.channel.sigma));
});

test("analyzeTrend: 소량 데이터(P<15) → long만, 예외 없음", () => {
  const ta = ForgeCore.analyzeTrend([10, 11, 12, 13, 14, 15]);
  assert.ok(ta.windows.long);
  assert.strictEqual(ta.windows.mid, null);
  assert.strictEqual(ta.windows.short, null);
});

test("analyzeTrend: P<2 → 빈 결과, 예외 없음", () => {
  const ta = ForgeCore.analyzeTrend([42]);
  assert.strictEqual(ta.windows.long, null);
  assert.strictEqual(ta.blend.slopeLog, 0);
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `node --test forge-core.test.js`
Expected: FAIL — `ForgeCore.analyzeTrend is not a function`

- [ ] **Step 3: `analyzeTrend` 구현** — `forge-core.js`의 `detectSwings` 함수 정의 다음(약 277행, `elliottAnalyze` 앞)에 삽입

```js
  function analyzeTrend(price, opts) {
    opts = opts || {};
    const shortLen = opts.shortLen || 40;
    const pivotSwing = opts.pivotSwing != null ? opts.pivotSwing : 0.08;
    const channelK = opts.channelK != null ? opts.channelK : 2;
    const weights = opts.weights || { long: 0.5, mid: 0.3, short: 0.2 };
    const P = price.length;
    const EMPTY = {
      windows: { long: null, mid: null, short: null },
      pivots: { support: null, resistance: null, points: [] },
      channel: null, blend: { slopeLog: 0, channelSigmaLog: 0 }, dominant: null
    };
    if (P < 2) return EMPTY;
    const logP = price.map(p => Math.log(Math.max(1e-9, p)));

    function winFit(m) {
      if (m < 2 || m > P) return null;
      const start = P - m, seg = price.slice(start), lseg = logP.slice(start);
      const fr = linfit(seg), fl = linfit(lseg);   // {a:절편, b:기울기}
      let mean = 0; for (let i = 0; i < m; i++) mean += seg[i]; mean /= m;
      let ssT = 0, ssR = 0;
      for (let i = 0; i < m; i++) { const pr = fr.a + fr.b * i, d = seg[i] - mean, e = seg[i] - pr; ssT += d * d; ssR += e * e; }
      const r2 = ssT > 0 ? Math.max(0, 1 - ssR / ssT) : 0;
      return { startIdx: start, m, slopeRaw: fr.b, bRaw: fr.a, slopeLog: fl.b, bLog: fl.a, r2 };
    }

    let long = winFit(P), mid = winFit(Math.round(P * 0.5)), short = winFit(Math.min(P, shortLen));
    if (mid && long && mid.m >= long.m) mid = null;
    if (short && mid && short.m >= mid.m) short = null;
    else if (short && !mid && long && short.m >= long.m) short = null;
    if (P < 15) { mid = null; short = null; }

    // 피봇 분류(지그재그는 교대 → 이웃 비교로 high/low)
    const sw = detectSwings(price, pivotSwing), points = [];
    for (let i = 0; i < sw.length; i++) {
      const pv = sw[i].price, pr = sw[i - 1], nx = sw[i + 1];
      let type;
      if (pr && nx) type = (pv >= pr.price && pv >= nx.price) ? "high" : "low";
      else if (nx) type = pv >= nx.price ? "high" : "low";
      else if (pr) type = pv >= pr.price ? "high" : "low";
      else type = "high";
      points.push({ idx: sw[i].idx, price: pv, type });
    }
    function fitPivots(pts) {
      if (pts.length < 2) return null;
      let sx = 0, sy = 0, sxx = 0, sxy = 0;
      for (const p of pts) { sx += p.idx; sy += p.price; sxx += p.idx * p.idx; sxy += p.idx * p.price; }
      const m = pts.length, slope = (m * sxy - sx * sy) / (m * sxx - sx * sx || 1), b = (sy - slope * sx) / m;
      return { slope, b, fromIdx: pts[0].idx, toIdx: pts[pts.length - 1].idx };
    }
    const support = fitPivots(points.filter(p => p.type === "low"));
    const resistance = fitPivots(points.filter(p => p.type === "high"));

    // 채널(장기 원시회귀 잔차 σ) + 채널 로그 σ(예측용)
    let channel = null, channelSigmaLog = 0;
    if (long) {
      let s = 0; const r = [];
      for (let i = 0; i < P; i++) { const e = price[i] - (long.bRaw + long.slopeRaw * i); r.push(e); s += e; }
      const mu = s / P; let v = 0; for (const e of r) v += (e - mu) * (e - mu);
      channel = { slopeRaw: long.slopeRaw, bRaw: long.bRaw, sigma: Math.sqrt(v / P), k: channelK };
      let sl = 0; const rl = [];
      for (let i = 0; i < P; i++) { const e = logP[i] - (long.bLog + long.slopeLog * i); rl.push(e); sl += e; }
      const ml = sl / P; let vl = 0; for (const e of rl) vl += (e - ml) * (e - ml);
      channelSigmaLog = Math.sqrt(vl / P);
    }

    // 블렌드(R²가중·장기우선) + 지배창
    const wins = [["long", long], ["mid", mid], ["short", short]];
    let num = 0, den = 0, dominant = null, best = -1;
    for (const [name, w] of wins) {
      if (!w) continue;
      const eff = (weights[name] || 0) * w.r2; num += eff * w.slopeLog; den += eff;
      const sc = Math.abs(w.slopeLog) * w.r2; if (sc > best) { best = sc; dominant = name; }
    }
    const slopeLog = den > 0 ? num / den : (long ? long.slopeLog : 0);

    return { windows: { long, mid, short }, pivots: { support, resistance, points }, channel, blend: { slopeLog, channelSigmaLog }, dominant };
  }
```

- [ ] **Step 4: export에 추가** — `forge-core.js:492` 의 return 객체에 `analyzeTrend` 삽입

```js
  return { version, makeDemoSeries, buildDAG, evalBlocks, detrendNorm, pdmTheta, scanPeriod, run, runSteps, visionBiasFrom, sampleSeries, sampleGraph, analyzeTrend };
```

- [ ] **Step 5: 테스트 통과 확인**

Run: `node --test forge-core.test.js`
Expected: PASS (신규 6개 포함 전체 통과). 지그재그/노이즈 임계가 빡빡하면 `pivotSwing` 값만 조정(로직 아님).

- [ ] **Step 6: 커밋**

```bash
git add forge-core.js forge-core.test.js
git commit -m "feat(forge): ForgeCore.analyzeTrend — 다각도 추세 단일출처(3중회귀·피봇·채널·블렌드)"
```

---

### Task 2: 예측 연동 (`run`) — 블렌드 기울기·캡 완화·채널 밴드

**Files:**
- Modify: `forge-core.js` (`run` 내 추세성분 `forge-core.js:389-394`, 밴드 sd 라인 `forge-core.js:403`)
- Test: `forge-core.test.js`

**Interfaces:**
- Consumes: `analyzeTrend` (Task 1). `run` 스코프 변수 `price`(=data.price), `n`, `last`, `logP`, `sigBand`, `futW`, `graph`.
- Produces: `run(...).prediction` 의 `path/target` 이 장기추세를 반영(캡 ±3%/봉).

- [ ] **Step 1: 실패 테스트 작성** — `forge-core.test.js` 끝에 추가

```js
test("run: 캡 완화 — 급한 추세가 완만한 추세보다 더 큰 상승 투영", () => {
  const G = { nodes: [{ id: "p", kind: "block", blockType: "price" }, { id: "o", kind: "block", blockType: "predict" }], edges: [{ from: "p", to: "o" }] };
  const mk = g => ({ price: Array.from({ length: 60 }, (_, i) => 10 * Math.exp(g * i)) });
  const r1 = ForgeCore.run(G, mk(0.02), { futW: 12 });
  const r2 = ForgeCore.run(G, mk(0.04), { futW: 12 });
  assert.ok(r1.prediction.path.every(isFinite) && r2.prediction.path.every(isFinite), "NaN 없음");
  const gain = r => r.prediction.target / r.prediction.anchor;
  assert.ok(gain(r2) > gain(r1), "급한 추세(0.04)가 더 큰 상승 — 옛 ±1.2%캡이면 동일했을 것");
  assert.ok(gain(r2) > 1, "상승추세 → target>anchor");
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `node --test forge-core.test.js`
Expected: FAIL — `gain(r2) > gain(r1)` (현재 둘 다 ±1.2% 캡에 묶여 동일/근사) 단언 실패

- [ ] **Step 3: 추세성분 교체** — `forge-core.js:389-394` (주석 `// 추세 추종 성분` ~ `const trS = ...`) 를 아래로 교체

```js
    // 추세 추종 성분 — 다각도 블렌드(장기우선·R²가중) 로그기울기, 캡 ±3%/봉으로 완화
    const _tn = (graph.nodes || []).find(nd => nd.kind === "block" && nd.blockType === "trend");
    const _tp = (_tn && _tn.params) || {};
    const _ta = analyzeTrend(price, { shortLen: _tp.len || 40, pivotSwing: (_tp.pivotSwing != null ? _tp.pivotSwing / 100 : 0.08), channelK: _tp.channelK || 2 });
    const trS = Math.max(-0.03, Math.min(0.03, _ta.blend.slopeLog));
    const trChSig = _ta.blend.channelSigmaLog;
```

- [ ] **Step 4: 밴드에 채널 σ 결합** — `forge-core.js:403` 의 `const m = ... , sd = sigBand * Math.sqrt(k) * 0.85;` 를 교체

```js
      const m = rev + mom + trend + sig + seas, sd = Math.sqrt(sigBand * sigBand + 0.36 * trChSig * trChSig) * Math.sqrt(k) * 0.85;
```

> `0.36 = 0.6²`. `rev/mom/trend/sig/seas` 변수명은 기존 그대로 유지.

- [ ] **Step 5: 테스트 통과 확인**

Run: `node --test forge-core.test.js`
Expected: PASS (전체)

- [ ] **Step 6: 커밋**

```bash
git add forge-core.js forge-core.test.js
git commit -m "feat(forge): 예측 추세성분=analyzeTrend 블렌드 기울기 + 캡 ±3% + 채널 밴드"
```

---

### Task 3: 작도 공용 헬퍼 `_drawTrendLayers` + 차트 모드 배선

**Files:**
- Modify: `forge.html` (`_drawEvidence` 차트 모드 trend 분기 `forge.html:2502-2510`; 헬퍼는 `_drawEvidence` 함수 위 `_evLegend`(약 2461행) 근처에 추가)

**Interfaces:**
- Consumes: `ForgeCore.analyzeTrend` (Task 1). 차트 모드 기하 `g`(`_mainGeo`): `padX,histW,histLen,seamX,plotW,loV,hiV,padTop,padBot,ch`. `price`(full), `P`.
- Produces: `_drawTrendLayers(c, ta, M)` — `M = { fiToX(fi), pToY(p), nowFi, xNow, xRight, futBars }`. 두 모드 공용.

- [ ] **Step 1: 공용 헬퍼 추가** — `forge.html` `_drawEvidence` 정의 위에 삽입

```js
  // 다각도 추세 4레이어 작도(차트·오버레이 공용). M=좌표 매퍼.
  function _drawTrendLayers(c, ta, M) {
    const { fiToX, pToY, nowFi, xNow, xRight, futBars } = M;
    const COL = { long: "#46c28e", mid: "#5b8def", short: "#e8b463" };
    const W = { long: 2.6, mid: 2.0, short: 1.6 };
    const DASH = { long: [], mid: [], short: [5, 4] };
    function winLine(w, key) {
      if (!w) return;
      const valAt = fi => w.bRaw + w.slopeRaw * (fi - w.startIdx);
      const xa = fiToX(w.startIdx), ya = pToY(valAt(w.startIdx)), xb = xNow, yb = pToY(valAt(nowFi));
      if (![xa, ya, xb, yb].every(isFinite)) return;
      c.setLineDash([]); c.strokeStyle = "rgba(11,15,20,.85)"; c.lineWidth = W[key] + 1.9;
      c.beginPath(); c.moveTo(xa, ya); c.lineTo(xb, yb); c.stroke();
      c.strokeStyle = COL[key]; c.lineWidth = W[key]; c.setLineDash(DASH[key]);
      c.beginPath(); c.moveTo(xa, ya); c.lineTo(xb, yb); c.stroke();
      const ye = pToY(valAt(nowFi + futBars));
      if (isFinite(ye)) { c.globalAlpha = .65; c.setLineDash([5, 4]); c.beginPath(); c.moveTo(xb, yb); c.lineTo(xRight, ye); c.stroke(); c.globalAlpha = 1; }
      c.setLineDash([]);
      // 강도/각도 라벨
      const pct = (Math.exp(w.slopeLog) - 1) * 100, dir = pct > 0.05 ? "▲" : pct < -0.05 ? "▼" : "—";
      const lab = (key === "long" ? "장기" : key === "mid" ? "중기" : "단기") + " " + (pct >= 0 ? "+" : "") + pct.toFixed(2) + "%/봉 R²" + w.r2.toFixed(2) + " " + dir;
      c.fillStyle = COL[key]; c.font = "700 9.5px ui-monospace,monospace"; c.textAlign = "left"; c.fillText(lab, Math.min(xb, xRight - 4) + 3, yb - 4);
    }
    // 채널(장기 ±k·σ)
    if (ta.channel) {
      const ch = ta.channel, upAt = fi => pToY(ch.bRaw + ch.slopeRaw * fi + ch.k * ch.sigma), loAt = fi => pToY(ch.bRaw + ch.slopeRaw * fi - ch.k * ch.sigma);
      const x0 = fiToX(0), u0 = upAt(0), l0 = loAt(0), u1 = upAt(nowFi), l1 = loAt(nowFi);
      if ([x0, u0, l0, u1, l1].every(isFinite)) {
        c.globalAlpha = .10; c.fillStyle = COL.long; c.beginPath();
        c.moveTo(x0, u0); c.lineTo(xNow, u1); c.lineTo(xNow, l1); c.lineTo(x0, l0); c.closePath(); c.fill(); c.globalAlpha = 1;
        c.strokeStyle = COL.long; c.lineWidth = 1; c.setLineDash([2, 4]); c.globalAlpha = .5;
        c.beginPath(); c.moveTo(x0, u0); c.lineTo(xNow, u1); c.stroke();
        c.beginPath(); c.moveTo(x0, l0); c.lineTo(xNow, l1); c.stroke(); c.globalAlpha = 1; c.setLineDash([]);
      }
    }
    // 회귀 3중
    winLine(ta.windows.long, "long"); winLine(ta.windows.mid, "mid"); winLine(ta.windows.short, "short");
    // 피봇 지지/저항
    function pivLine(L, col) {
      if (!L) return;
      const xa = fiToX(L.fromIdx), ya = pToY(L.slope * L.fromIdx + L.b), xb = xNow, yb = pToY(L.slope * nowFi + L.b);
      if (![xa, ya, xb, yb].every(isFinite)) return;
      c.strokeStyle = col; c.lineWidth = 1.4; c.setLineDash([4, 4]); c.globalAlpha = .85;
      c.beginPath(); c.moveTo(xa, ya); c.lineTo(xb, yb); c.stroke(); c.globalAlpha = 1; c.setLineDash([]);
    }
    pivLine(ta.pivots.support, "#46c28e"); pivLine(ta.pivots.resistance, "#e06a6a");
  }
```

- [ ] **Step 2: 차트 모드 trend 분기 교체** — `forge.html:2502-2510` (`} else if (n.blockType === "trend") { ... legend.push({ col, t: EV_LABEL.trend }); }`) 의 내부를 아래로 교체

```js
        } else if (n.blockType === "trend") {
          const ta = ForgeCore.analyzeTrend(price, { shortLen: (n.params && n.params.len) || 40, pivotSwing: (n.params && n.params.pivotSwing != null ? n.params.pivotSwing / 100 : 0.08), channelK: (n.params && n.params.channelK) || 2 });
          const off = P - Hn, futBars = (g.path && g.path.length) || 24;
          _drawTrendLayers(c, ta, {
            fiToX: fi => toXh(Math.max(0, Math.min(Hn - 1, fi - off))),
            pToY: v => toY(v),
            nowFi: P - 1, xNow: g.seamX, xRight: g.padX + g.plotW, futBars
          });
          legend.push({ col, t: EV_LABEL.trend });
        }
```

> `toXh`, `toY`, `Hn`, `g`, `P`, `price` 는 차트 분기 상단에 이미 선언됨(2492-2494).

- [ ] **Step 3: 검증 — 구문 로드 + 헤드리스 스크린샷**

`forge.html`을 헤드리스 크로미엄으로 열어 콘솔 에러 없음 + 분석 후 차트뷰에서 장/중/단 3선·채널 밴드·피봇 점선·라벨이 보이는지 확인(메모리 [[headless-verify-wsl]] 절차 — 로컬 lib 추출 + `LD_LIBRARY_PATH` playwright).
Expected: 콘솔 무에러, 차트뷰 추세선이 **전체 폭에 걸친 장기선 포함 3선 + 채널**으로 표시(과거 "오른쪽 끝 토막" 아님).

수동 확인 대안: 브라우저로 `forge.html` 열고 샘플 그래프에 trend 블록 추가 → ▷ 엔진분석 → 📈 차트뷰. 장기선이 차트 좌측까지 그려지는지 육안 확인.

- [ ] **Step 4: 커밋**

```bash
git add forge.html
git commit -m "feat(forge): 차트모드 다각도 추세 작도 — 3중회귀+채널+피봇 (_drawTrendLayers)"
```

---

### Task 4: 오버레이(이미지) 모드 배선

**Files:**
- Modify: `forge.html` (`_drawEvidence` 오버레이 trend 분기 `forge.html:2556-2567`)

**Interfaces:**
- Consumes: `_drawTrendLayers` (Task 3). 오버레이 기하 `g`(`_coneGeo`): `ox,nowX,rightX,dw,path`, 변환 `xOf(i)`, `yOf(p)`, `clipY(y)`. `price`(full), `P`.
- Produces: 없음(작도만).

- [ ] **Step 1: 오버레이 trend 분기 교체** — `forge.html:2556-2567` 내부를 아래로 교체

```js
        } else if (n.blockType === "trend") {
          const ta = ForgeCore.analyzeTrend(price, { shortLen: (n.params && n.params.len) || 40, pivotSwing: (n.params && n.params.pivotSwing != null ? n.params.pivotSwing / 100 : 0.08), channelK: (n.params && n.params.channelK) || 2 });
          const futBars = (g.path && g.path.length) || 24, xR = g.rightX || (g.ox + g.dw);
          _drawTrendLayers(c, ta, {
            fiToX: fi => xOf(fi),
            pToY: v => clipY(yOf(v)),
            nowFi: P - 1, xNow: g.nowX, xRight: xR, futBars
          });
          legend.push({ col, t: EV_LABEL.trend });
        }
```

> `xOf`, `yOf`, `clipY`, `g`, `P`, `price` 는 오버레이 분기 상단에 이미 선언됨(2532-2537).

- [ ] **Step 2: 검증 — 헤드리스/수동 (이미지뷰)**

이미지가 있는 캔버스에서 🖼 이미지뷰로 전환 후 추세 작도가 4레이어로 표시되고 `clipY`로 화면 안에 머무는지 확인(메모리 [[headless-verify-wsl]] 또는 브라우저 육안).
Expected: 오버레이에서도 장/중/단 3선·채널·피봇 표시, 화면 밖 이탈 없음(클램프).

- [ ] **Step 3: 커밋**

```bash
git add forge.html
git commit -m "feat(forge): 오버레이모드 다각도 추세 작도 배선 (_drawTrendLayers 공용)"
```

---

### Task 5: 추세 블록 편집기 파라미터 + 범례 라벨

**Files:**
- Modify: `forge.html` (편집기 trend 행 `forge.html:1211`; 필요 시 `EV_LABEL.trend` `forge.html:2406`)

**Interfaces:**
- Consumes: 기존 `numRow(key, label, value)` 행 빌더.
- Produces: `n.params = { len, pivotSwing, channelK }` (작도·예측이 읽음).

- [ ] **Step 1: 편집기 행 추가** — `forge.html:1211` 의 trend 행을 아래로 교체

```js
    if (n.blockType === "trend") {
      rows.push(numRow("len", "단기 길이(봉)", (n.params && n.params.len) ?? 40));
      rows.push(numRow("pivotSwing", "피봇 민감도(%)", (n.params && n.params.pivotSwing) ?? 8));
      rows.push(numRow("channelK", "채널 σ배수(k)", (n.params && n.params.channelK) ?? 2));
    }
```

> 기존이 `if (n.blockType === "trend") rows.push(numRow("len", "추세 기간", ...));` 한 줄이면 위 블록으로 대체. `numRow`가 변경 시 `n.params[key]`에 숫자 저장하는지 확인(기존 ma/rsi 행과 동일 경로) — 동일하면 추가 배선 불필요.

- [ ] **Step 2: 범례 라벨 확인/갱신** — `forge.html:2406` `EV_LABEL`

```js
  const EV_LABEL = { ma: "이동평균", trend: "추세선(다각도)", fib: "피보나치", elliott: "엘리어트", rsi: "RSI", phasefold: "주기", volume: "거래량" };
```

- [ ] **Step 3: 검증 — 파라미터 반영**

브라우저에서 trend 블록 선택 → 편집기에 3개 행 표시. `피봇 민감도`를 크게(예: 20) 바꾸면 피봇 선 수가 줄고, `채널 σ배수`를 키우면 채널 폭이 넓어지는지 육안 확인. `▷ 엔진분석` 시 예측도 갱신.
Expected: 3개 파라미터가 작도·예측에 즉시 반영.

- [ ] **Step 4: 커밋 + 배포**

```bash
git add forge.html
git commit -m "feat(forge): 추세 블록 파라미터(단기길이·피봇민감도·채널k) + 범례 라벨"
git push origin main
```
배포: 메모리 [[scoopforge-deploy]] 절차로 `forge.html`+`forge-core.js`를 cafe24 `www/map/`에 업로드(데이터 JSON 불가침).

---

## Self-Review

**Spec coverage:**
- §4 코어 `analyzeTrend` → Task 1 ✅ (windows/pivots/channel/blend/dominant 전부)
- §4.1 창 가드(P<15, null) → Task 1 Step3 + 테스트 ✅
- §4.3 피봇 분류 → Task 1 classifyPivots 인라인 ✅
- §5 작도 4레이어(차트·오버레이) → Task 3/4 ✅
- §5.1 편집기 파라미터 → Task 5 ✅
- §6 예측 연동(블렌드·캡 ±3%·채널 밴드) → Task 2 ✅
- §7 테스트(직선·지수·지그재그·노이즈·소량·예측) → Task 1/2 테스트 ✅

**Placeholder scan:** 코드/명령/기대출력 모두 구체값. TODO/TBD 없음. 작도 검증은 단위테스트 불가 영역이라 헤드리스/육안으로 명시.

**Type consistency:** `analyzeTrend` 반환 키(windows.long.{startIdx,m,slopeRaw,bRaw,slopeLog,bLog,r2} / pivots.{support,resistance,points} / channel.{slopeRaw,bRaw,sigma,k} / blend.{slopeLog,channelSigmaLog})를 Task 2(`_ta.blend.slopeLog`,`_ta.blend.channelSigmaLog`)·Task 3/4(`ta.windows.*`,`ta.channel.*`,`ta.pivots.*`)에서 동일하게 사용. WIN 값 규약 `bRaw + slopeRaw*(fi-startIdx)`, 채널 `bRaw+slopeRaw*fi`, 피봇 `slope*fi+b` — Task 3 `_drawTrendLayers` 내 일관 적용 ✅.
