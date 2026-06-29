# 거래량 심화 (Volume Depth) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 거래량 블록을 전문가급으로 심화 — 코어 단일출처 `analyzeVolume`(추세·급증·OBV·가격-OBV 다이버전스)+데이터 합성 `synthVolume`로 예측(volDrift)·작도(hero 마커+막대 서브패널)·시연·nodeExpert·샘플을 일관 구동.

**Architecture:** RSI 심화와 동일한 단일출처 패턴 — 코어 순수 함수가 분석을 산출하고 예측/작도/시연/서브패널/nodeExpert가 공유. 거래량 시계열이 없으면 `synthVolume(price)`로 결정적 폴백해 항상 시연 가능. 기존 `evalBlocks` 블록값 통과는 불변, 흩어진 인라인 `volBias`는 제거하고 `analyzeVolume` 기반 `volDrift`로 단일화.

**Tech Stack:** 바닐라 JS, 무빌드, 단일 HTML(`forge.html`) + UMD 코어(`forge-core.js`, `node --test`로 단위테스트). 외부 라이브러리 없음.

## Global Constraints

- 바닐라 JS·무빌드·단일 파일 유지. 프레임워크/번들러/외부 라이브러리 도입 금지.
- 다크 테마 토큰만: 골드 `#e8b463`, bull `#46c28e`, bear `#e06a6a`, 보조(eth) `#8a92b2`, 네이비 bg `#0b0f14`. 하드코딩 임의색 금지.
- UI 텍스트 한국어. `noindex` 유지.
- `forge-core.js`/`forge.html`의 따옴표 위생: 편집 도구가 ASCII `"`를 굽은 따옴표 `“”`로 바꾸는 사고가 반복됨. 의도된 굽은 따옴표는 `&ldquo;`/`&rdquo;` 엔티티, 가운뎃점은 JS 문자열에서 `\xb7` 이스케이프. 각 커밋 전 `git diff`로 의도치 않은 따옴표 변형이 없는지 확인.
- 코어 분석 함수는 순수·결정적(무작위 없음). `Math.random`/`Date.now` 사용 금지.
- 좌표/색/토큰·작도 규약은 형제 지표(RSI: `analyzeRSI`/`_drawRsiLayers`/`fcDrawRsi`)와 동형으로 작성. 임의 재설계 금지.
- 예측은 단일 경로·이중계상 방지: 거래량 영향은 `volDrift` 한 항으로만.
- 거래량은 확인지표 — 드리프트 상한 `0.05`(±5%, 형제 중 가장 보수적), TF가중 `trendProfileForTF(tf).trendScale`.

---

## File Structure

- `forge-core.js` — 코어 엔진. 신규 `synthVolume`/`analyzeVolume`/`volumeSteps`(Task 1), `run`의 `volDrift` 단일화(Task 2), `sampleGraph` 거래량 노드(Task 5). export 객체(파일 끝 `return { ... }`)에 3개 함수 추가.
- `forge-core.test.js` — 단위테스트. Task 1·2·5에서 추가.
- `forge.html` — 단일 UI. hero `_drawVolumeLayers`+차트/오버레이 분기+`analysisSteps` 케이스(Task 3), 거래량 막대 서브패널(Task 4), nodeExpert 통일(Task 5).

기준선: `cd map && node --test forge-core.test.js` → **71 pass / 0 fail**(RSI 심화까지 머지된 main 기준).

---

## Task 1: 코어 synthVolume + analyzeVolume + volumeSteps + export + 테스트

**Files:**
- Modify: `map/forge-core.js` (신규 함수 3개를 `analyzeRSI`/`rsiSteps`(345~359행) 뒤에 삽입; 파일 끝 export 객체에 3개 추가)
- Test: `map/forge-core.test.js` (신규 테스트 추가)

**Interfaces:**
- Consumes: 기존 코어 헬퍼 `linfit(y)→{a,b}`(b=기울기), `detectSwings(arr,sens)→[{idx,price}]`, `Math.tanh`.
- Produces:
  - `synthVolume(price:number[]) → number[]` (price와 동일 길이, 결정적; price.length<2면 `[]`)
  - `analyzeVolume(price:number[], volume:number[]|null, opts?:{len?:number,spikeMult?:number}) → { series:number[], obv:number[], trend:number, ratio:number, state:"spike"|"contract"|"normal", obvTrend:number, relationship:"confirm"|"weakening"|"selling"|"capitulation", divergence:{type:"bullish"|"bearish"|null, pricePts:[{idx,price},{idx,price}]|null}, bias:number }`
  - `volumeSteps(va) → string[5]`

- [ ] **Step 1: 실패하는 테스트 작성**

`map/forge-core.test.js` 끝에 추가:

```js
test("synthVolume: 길이=price, 결정적·양수, 큰 변동봉이 더 큼", () => {
  const calm = Array.from({ length: 30 }, (_, i) => 100 + i * 0.1);   // 완만
  const v1 = ForgeCore.synthVolume(calm);
  assert.equal(v1.length, calm.length);
  assert.ok(v1.every(x => isFinite(x) && x > 0));
  assert.deepEqual(ForgeCore.synthVolume(calm), v1);                  // 결정적(동일 입력→동일 출력)
  const jump = calm.slice(); jump[20] = 130;                          // 20번째에 급변
  const v2 = ForgeCore.synthVolume(jump);
  assert.ok(v2[20] > v1[20], "급변 봉의 합성 거래량이 더 커야");
  assert.deepEqual(ForgeCore.synthVolume([1]), []);                   // 소량
});

test("analyzeVolume: 상승+거래량증가 → confirm·trend>0·bias>0", () => {
  const price = Array.from({ length: 24 }, (_, i) => 100 + i);        // 단조 상승
  const volume = Array.from({ length: 24 }, (_, i) => 100 + i * 5);   // 단조 증가
  const va = ForgeCore.analyzeVolume(price, volume);
  assert.equal(va.relationship, "confirm");
  assert.ok(va.trend > 0);
  assert.ok(va.bias > 0);
  assert.ok(va.series.length >= 2 && va.obv.length === va.series.length);
});

test("analyzeVolume: 상승+거래량감소 → weakening", () => {
  const price = Array.from({ length: 24 }, (_, i) => 100 + i);
  const volume = Array.from({ length: 24 }, (_, i) => 300 - i * 8);   // 단조 감소
  const va = ForgeCore.analyzeVolume(price, volume);
  assert.equal(va.relationship, "weakening");
});

test("analyzeVolume: 최근 3봉 급증 → state spike·ratio>1.5", () => {
  const price = Array.from({ length: 18 }, (_, i) => 100 + i * 0.2);
  const volume = Array.from({ length: 18 }, () => 100);
  volume[15] = 500; volume[16] = 520; volume[17] = 540;
  const va = ForgeCore.analyzeVolume(price, volume, { len: 12, spikeMult: 1.5 });
  assert.equal(va.state, "spike");
  assert.ok(va.ratio > 1.5);
});

test("analyzeVolume: 강세 가격-OBV 다이버전스 → bullish·bias>0 경향", () => {
  // 가격: 저점2(끝)가 저점1보다 낮음(LL). 거래량: 첫 하락엔 큰 매도량, 둘째 하락엔 적은 매도량 → OBV 저점2 > 저점1(HL)
  const price = [120, 116, 112, 108, 104, 100, 106, 112, 110, 108, 106, 104, 102, 99, 103, 108];
  const volume = [100, 400, 420, 410, 405, 400, 120, 110, 80, 70, 65, 60, 55, 50, 90, 95];
  const va = ForgeCore.analyzeVolume(price, volume, { len: 12 });
  assert.equal(va.divergence.type, "bullish");
  assert.ok(Array.isArray(va.divergence.pricePts) && va.divergence.pricePts.length === 2);
  assert.ok(va.bias > 0);
});

test("analyzeVolume: volume null → synthVolume 폴백·예외 없음·유한", () => {
  const price = Array.from({ length: 20 }, (_, i) => 100 + Math.sin(i) * 3 + i * 0.5);
  const va = ForgeCore.analyzeVolume(price, null);
  assert.ok(va.series.length >= 2);
  assert.ok(isFinite(va.bias) && va.bias >= -1 && va.bias <= 1);
});

test("analyzeVolume: 소량 → 폴백 객체(divergence null, bias 유한)", () => {
  const va = ForgeCore.analyzeVolume([100], [10]);
  assert.equal(va.divergence.type, null);
  assert.ok(isFinite(va.bias));
});

test("volumeSteps: 5단계·관계·bias 반영", () => {
  const price = Array.from({ length: 24 }, (_, i) => 100 + i);
  const volume = Array.from({ length: 24 }, (_, i) => 100 + i * 5);
  const steps = ForgeCore.volumeSteps(ForgeCore.analyzeVolume(price, volume));
  assert.equal(steps.length, 5);
  assert.ok(steps[4].includes("bias"));
  assert.ok(steps[2].includes("가격-거래량"));
});
```

- [ ] **Step 2: 실패 확인**

Run: `cd map && node --test forge-core.test.js`
Expected: FAIL — `ForgeCore.synthVolume is not a function` 등 (신규 함수 미정의).

- [ ] **Step 3: 최소 구현 — `analyzeRSI`/`rsiSteps` 블록(345~359행) 바로 뒤에 삽입**

```js
  function synthVolume(price) {
    const n = price.length;
    if (n < 2) return [];
    const BASE = 1000000, out = new Array(n);
    for (let i = 0; i < n; i++) {
      const ret = i > 0 ? (price[i] - price[i - 1]) / (Math.abs(price[i - 1]) || 1) : 0;
      const cyc = 0.6 * Math.abs(Math.sin(i * 0.5));
      out[i] = Math.round(BASE * (1 + 3.2 * Math.abs(ret) + cyc));
    }
    return out;
  }

  function analyzeVolume(price, volume, opts) {
    opts = opts || {};
    const len = opts.len || 12, spikeMult = opts.spikeMult != null ? opts.spikeMult : 1.5;
    const P = price.length;
    const EMPTY = { series: [], obv: [], trend: 0, ratio: 1, state: "normal", obvTrend: 0, relationship: "weakening", divergence: { type: null, pricePts: null }, bias: 0 };
    const vol = (Array.isArray(volume) && volume.length >= 2) ? volume : synthVolume(price);
    const L = Math.min(P, vol.length);
    if (L < 2) return EMPTY;
    const offset = P - L;
    const priceA = price.slice(P - L), series = vol.slice(vol.length - L);
    const obv = new Array(L); obv[0] = 0;
    for (let i = 1; i < L; i++) obv[i] = obv[i - 1] + (priceA[i] > priceA[i - 1] ? series[i] : priceA[i] < priceA[i - 1] ? -series[i] : 0);
    const w = Math.max(2, Math.min(len, L - 1));
    const fV = linfit(series.slice(L - w));
    let meanV = 0; for (const v of series) meanV += v; meanV = (meanV / L) || 1;
    const trend = Math.max(-1, Math.min(1, Math.tanh((fV.b / (Math.abs(meanV) || 1)) * 100)));
    const rN = Math.min(3, L), bN = Math.min(len, L);
    let rs = 0; for (let i = L - rN; i < L; i++) rs += series[i]; const recent = rs / rN;
    let bs = 0; for (let i = L - bN; i < L; i++) bs += series[i]; const base = bs / bN;
    const ratio = base > 0 ? recent / base : 1;
    const state = ratio >= spikeMult ? "spike" : ratio <= 1 / spikeMult ? "contract" : "normal";
    const fO = linfit(obv.slice(L - w));
    let maxAbsO = 1; for (const v of obv) maxAbsO = Math.max(maxAbsO, Math.abs(v));
    const obvTrend = Math.max(-1, Math.min(1, Math.tanh((fO.b / maxAbsO) * 100)));
    const pw = Math.min(6, L - 1);
    const priceUp = priceA[L - 1] > priceA[L - 1 - pw], volUp = recent > base;
    const relationship = priceUp ? (volUp ? "confirm" : "weakening") : (volUp ? "selling" : "capitulation");
    const sw = detectSwings(priceA, 0.03), pts = sw.map(p => ({ idx: p.idx, price: p.price }));
    const lows = [], highs = [];
    for (let i = 0; i < pts.length; i++) {
      const pr = pts[i - 1], nx = pts[i + 1], pv = pts[i].price;
      const isHigh = (pr && nx) ? (pv >= pr.price && pv >= nx.price) : (nx ? pv >= nx.price : (pr ? pv >= pr.price : true));
      (isHigh ? highs : lows).push(pts[i]);
    }
    const obvAt = idx => obv[Math.max(0, Math.min(L - 1, idx))];
    const abs = p => ({ idx: p.idx + offset, price: p.price });
    let divergence = { type: null, pricePts: null };
    if (lows.length >= 2) { const a = lows[lows.length - 2], b = lows[lows.length - 1]; if (b.price < a.price && obvAt(b.idx) > obvAt(a.idx)) divergence = { type: "bullish", pricePts: [abs(a), abs(b)] }; }
    if (!divergence.type && highs.length >= 2) { const a = highs[highs.length - 2], b = highs[highs.length - 1]; if (b.price > a.price && obvAt(b.idx) < obvAt(a.idx)) divergence = { type: "bearish", pricePts: [abs(a), abs(b)] }; }
    const divDir = divergence.type === "bullish" ? 1 : divergence.type === "bearish" ? -1 : 0;
    const confDir = relationship === "confirm" ? 1 : relationship === "weakening" ? -0.4 : relationship === "selling" ? -0.7 : 0.3;
    const bias = Math.max(-1, Math.min(1, 0.45 * divDir + 0.35 * confDir + 0.20 * obvTrend));
    return { series, obv, trend, ratio, state, obvTrend, relationship, divergence, bias };
  }

  function volumeSteps(va) {
    const tTxt = va.trend > 0.1 ? "증가 ↑" : va.trend < -0.1 ? "감소 ↓" : "횡보 →";
    const sTxt = va.state === "spike" ? "급증" : va.state === "contract" ? "위축" : "평이";
    const rel = va.relationship === "confirm" ? "상승에 거래량 동반 — 추세 건강(확인)"
      : va.relationship === "weakening" ? "상승하나 거래량 감소 — 추진력 약화"
      : va.relationship === "selling" ? "하락에 거래량 증가 — 매도 압력"
      : "하락+거래량 위축 — 투매 진정(바닥 가능)";
    const dv = va.divergence.type === "bullish" ? "강세 거래량 다이버전스"
      : va.divergence.type === "bearish" ? "약세 거래량 다이버전스"
      : "OBV " + (va.obvTrend > 0.1 ? "상승" : va.obvTrend < -0.1 ? "하락" : "횡보");
    const bTxt = va.bias > 0.1 ? "상승" : va.bias < -0.1 ? "하락" : "중립";
    return [
      "거래량 추세 " + tTxt,
      "최근/평균 " + va.ratio.toFixed(2) + "x \xb7 " + sTxt,
      "가격-거래량: " + rel,
      dv,
      "종합 방향 " + bTxt + " (bias " + va.bias.toFixed(2) + ")"
    ];
  }
```

그리고 파일 끝 export 객체(현재 `..., analyzeRSI, rsiSteps };`로 끝남)에 3개 추가:

```js
  return { version, makeDemoSeries, buildDAG, evalBlocks, detrendNorm, pdmTheta, scanPeriod, run, runSteps, visionBiasFrom, sampleSeries, sampleGraph, analyzeTrend, trendProfileForTF, analyzeMA, maSteps, analyzeFib, fibSteps, analyzeElliott, elliottSteps, analyzeRSI, rsiSteps, synthVolume, analyzeVolume, volumeSteps };
```

- [ ] **Step 4: 통과 확인**

Run: `cd map && node --test forge-core.test.js`
Expected: PASS — 기존 71 + 신규 8 = **79 pass / 0 fail**.
(강세 다이버전스 테스트가 `detectSwings` 피벗과 어긋나 실패하면 **테스트의 price/volume 배열만** 조정 — 단언·로직 불변. 가격은 저점2<저점1(LL), 거래량은 둘째 하락 구간의 매도량을 더 작게 해 OBV 저점2>저점1(HL)이 되도록.)

- [ ] **Step 5: 커밋**

```bash
cd /home/jschoi0223/projects/vdiportal
git add map/forge-core.js map/forge-core.test.js
git commit -m "feat(forge-core): synthVolume + analyzeVolume(추세·급증·OBV·가격OBV 다이버전스) + volumeSteps + 테스트"
```

---

## Task 2: 예측 run volDrift 단일화 (인라인 volBias 제거) + 테스트

**Files:**
- Modify: `map/forge-core.js` (`run` — 인라인 volBias 블록 제거 652~664행, bias 합산 667행, 드리프트 추가 733행 뒤, accumulator `m` 745행)
- Test: `map/forge-core.test.js`

**Interfaces:**
- Consumes: Task 1의 `analyzeVolume(price, vol)→{bias,...}`, `synthVolume(price)`. 기존 `trendProfileForTF(tf)→{trendScale}`, `run`의 지역변수 `values`(evalBlocks 결과)·`graph`·`price`·`_prof`·`futW`.
- Produces: `run`이 volume 블록 존재 시 예측 경로에 `volDrift`(±5%·TF가중)를 단일 가산. volume 블록 없는 그래프는 회귀 없음(volBias 제거가 0항 제거).

- [ ] **Step 1: 실패하는 테스트 작성**

`map/forge-core.test.js` 끝에 추가:

```js
test("run: volume 블록 유무로 예측 타깃 격리(volDrift)", () => {
  // 가격: 상승추세, 거래량: 상승 동반(confirm·bias>0) → volDrift가 타깃을 올림
  const price = Array.from({ length: 60 }, (_, i) => 100 + i + Math.sin(i / 5) * 2);
  const volume = Array.from({ length: 60 }, (_, i) => 100 + i * 4);
  const data = { price, candle: price.map(c => ({ o: c, h: c + 1, l: c - 1, c })) };
  const base = [
    { id: "p", kind: "block", blockType: "price", params: {} },
    { id: "pred", kind: "block", blockType: "predict", params: {} }
  ];
  const eBase = [{ from: "p", to: "pred", fromSide: "right", toSide: "left" }];
  const withV = {
    nodes: base.concat([{ id: "v", kind: "block", blockType: "volume", params: {}, series: volume, weight: 50 }]),
    edges: eBase.concat([{ from: "p", to: "v", fromSide: "right", toSide: "left" }, { from: "v", to: "pred", fromSide: "right", toSide: "left" }])
  };
  const without = { nodes: base, edges: eBase };
  const tV = ForgeCore.run(withV, data, { timeframe: "일봉" }).prediction.target;
  const tN = ForgeCore.run(without, data, { timeframe: "일봉" }).prediction.target;
  assert.ok(isFinite(tV) && isFinite(tN));
  assert.notStrictEqual(tV, tN);   // volDrift 제거 시 동일해짐(RED)
});

test("run: volume 블록 timeframe 가중(월봉 vs 5분 차이)", () => {
  const price = Array.from({ length: 60 }, (_, i) => 100 + i + Math.sin(i / 5) * 2);
  const volume = Array.from({ length: 60 }, (_, i) => 100 + i * 4);
  const data = { price, candle: price.map(c => ({ o: c, h: c + 1, l: c - 1, c })) };
  const g = {
    nodes: [
      { id: "p", kind: "block", blockType: "price", params: {} },
      { id: "v", kind: "block", blockType: "volume", params: {}, series: volume, weight: 50 },
      { id: "pred", kind: "block", blockType: "predict", params: {} }
    ],
    edges: [
      { from: "p", to: "v", fromSide: "right", toSide: "left" },
      { from: "p", to: "pred", fromSide: "right", toSide: "left" },
      { from: "v", to: "pred", fromSide: "right", toSide: "left" }
    ]
  };
  const tMon = ForgeCore.run(g, data, { timeframe: "월봉" }).prediction.target;
  const tMin = ForgeCore.run(g, data, { timeframe: "5분" }).prediction.target;
  assert.ok(isFinite(tMon) && isFinite(tMin));
  assert.notStrictEqual(tMon, tMin);
});
```

- [ ] **Step 2: 실패 확인**

Run: `cd map && node --test forge-core.test.js`
Expected: 격리 테스트 FAIL(`notStrictEqual` — 아직 volDrift 없어 두 타깃 동일). TF 테스트는 우연히 통과할 수 있으나 격리 테스트가 RED여야 함.

- [ ] **Step 3: 구현 — 인라인 volBias 제거 + volDrift 추가**

(3-a) `run`의 인라인 volBias 블록(현재 652~664행) **전체 삭제**:

```js
    // 거래량 확인 바이어스 — predict에 연결된 volume 노드의 가격-거래량 확인을 방향으로 변환
    let volBias = 0;
    if (outNode) {
      const volN = graph.nodes.find(nn => nn.kind === "block" && nn.blockType === "volume" && Array.isArray(values[nn.id]) && values[nn.id].length >= 8
        && (graph.edges || []).some(e => e.from === nn.id && e.to === outNode.id));
      if (volN) {
        const vol = values[volN.id], N = vol.length;
        const recent = (vol[N - 1] + vol[N - 2] + vol[N - 3]) / 3, base = vol.slice(-12).reduce((a, b) => a + b, 0) / Math.min(12, N), volUp = recent > base;
        const pw = Math.min(6, data.price.length - 1), priceUp = data.price[data.price.length - 1] > data.price[data.price.length - 1 - pw];
        const conf = priceUp ? (volUp ? 1 : -0.6) : (volUp ? -1 : 0.4);   // 가격-거래량 확인 점수
        volBias = conf * 12 * ((volN.weight != null ? volN.weight : 50) / 50);
      }
    }
```

(3-b) bias 합산(현재 667행)에서 `volBias` 항 제거:

```js
    const bias = aggregateConviction(graph) + vbias + volBias, K = 0.5;
```
→
```js
    const bias = aggregateConviction(graph) + vbias, K = 0.5;
```

(3-c) `rsiDrift` 줄(현재 733행) **바로 뒤**에 volDrift 추가:

```js
    const rsiDrift = _rsi ? _rsi.bias * _prof.trendScale * 0.06 : 0;   // RSI ...
    const _vn = (graph.nodes || []).find(nd => nd.kind === "block" && nd.blockType === "volume");
    const _vol = _vn ? ((Array.isArray(values[_vn.id]) && values[_vn.id].length >= 2) ? values[_vn.id] : synthVolume(price)) : null;
    const volDrift = _vol ? analyzeVolume(price, _vol).bias * _prof.trendScale * 0.05 : 0;   // 거래량 확인 방향 드리프트(±5% 상한·TF가중·보수적)
```

(3-d) accumulator `m`(현재 745행)에 `+ volDrift * (k / futW)` 추가:

```js
      const m = rev + mom + trend + sig + seas + maDrift * (k / futW) + fibDrift * (k / futW) + ewDrift * (k / futW) + rsiDrift * (k / futW) + volDrift * (k / futW), sd = ...
```

- [ ] **Step 4: 통과 확인 + RED/GREEN 검증**

Run: `cd map && node --test forge-core.test.js`
Expected: PASS — **81 pass / 0 fail**(79 + 2).
검증: (3-c)의 `* 0.05`를 임시로 `* 0`으로 바꿔 실행 → 격리 테스트가 FAIL(타깃 동일)함을 확인 후 `* 0.05`로 되돌린다. 결과를 리포트에 기록.

- [ ] **Step 5: 커밋**

```bash
cd /home/jschoi0223/projects/vdiportal
git add map/forge-core.js map/forge-core.test.js
git commit -m "feat(forge-core): run 거래량 단일화 — 인라인 volBias 제거 + analyzeVolume 기반 volDrift(±5%·TF가중)"
```

---

## Task 3: forge.html hero `_drawVolumeLayers` + 차트·오버레이 분기 + 시연 케이스

**Files:**
- Modify: `map/forge.html` (`_drawRsiLayers`(약 2671행) 뒤에 `_drawVolumeLayers` 추가; 차트·오버레이 draw 루프에 volume 케이스 신설; `analysisSteps` volume 케이스 추가; 범례 `EV_LABEL.volume`/`order` 확인)

**Interfaces:**
- Consumes: Task 1 `ForgeCore.analyzeVolume(price, vol)`, `ForgeCore.synthVolume(price)`, `ForgeCore.volumeSteps(va)`. 기존 helper `_evLabel(c,text,x,y,color,align)`, M 규약 `{fiToX,pToY,nowFi,fiMin,reveal,xRight}`, reveal 게이트 `_playing ? (_evReveal[n.id]||0) : Infinity`.
- Produces: `_drawVolumeLayers(c, va, M)` hero 작도. volume 블록의 차트·오버레이 draw 분기. `analysisSteps`의 volume 케이스(layers `[1,1,2,2,2]`).

**중요 — 형제 RSI 구현을 먼저 읽고 동형으로 작성.** `forge.html`에서:
- `_drawRsiLayers(c, rsi, M)`(약 2671행)이 `_drawVolumeLayers`의 템플릿: `c.save()/c.restore()`, `_evLabel` 사용, 다이버전스 선 그리는 방식(`pricePts` 두 점을 `fiToX`/`pToY`로 변환, `isFinite` 가드, 점선) 그대로.
- 차트 모드 RSI 분기(약 2768행)·오버레이 모드 RSI 분기(약 2809행): 각 모드의 `M` 구성(차트: `fiToX = fi => toXh(Math.max(0, Math.min(Hn-1, fi-off)))`, `pToY = toY`, `fiMin = off`, `xRight = g.padX+g.plotW`; 오버레이: `fiToX = xOf`, `pToY = v => clipY(yOf(v))`, `fiMin = 0`, `xRight = g.rightX || (g.ox+g.dw)`)을 그대로 복사해 volume 분기를 만든다.
- `analysisSteps`의 elliott/rsi 케이스(약 3096~3130행 근처, `n.blockType === "rsi"`)가 demo 케이스 템플릿: `price`·`period` 읽는 방식 미러, 단 volume은 `period` 대신 거래량 시계열 확보.

- [ ] **Step 1: `_drawVolumeLayers` 추가 (`_drawRsiLayers` 뒤)**

```js
  /* 거래량 hero 작도 — 다이버전스 선(reveal≥1) + 급증 마커·상태 배지(reveal≥2) */
  function _drawVolumeLayers(c, va, M) {
    if (!va) return;
    const { fiToX, pToY, fiMin, reveal, xRight } = M;
    c.save();
    // 레이어1: 가격-OBV 다이버전스 선
    if (reveal >= 1 && va.divergence.type && va.divergence.pricePts) {
      const col = va.divergence.type === "bullish" ? "#46c28e" : "#e06a6a";
      const a = va.divergence.pricePts[0], b = va.divergence.pricePts[1];
      const xa = fiToX(Math.max(fiMin, a.idx)), ya = pToY(a.price);
      const xb = fiToX(Math.max(fiMin, b.idx)), yb = pToY(b.price);
      if ([xa, ya, xb, yb].every(isFinite)) {
        c.strokeStyle = col; c.lineWidth = 2; c.setLineDash([5, 4]);
        c.beginPath(); c.moveTo(xa, ya); c.lineTo(xb, yb); c.stroke(); c.setLineDash([]);
        _evLabel(c, (va.divergence.type === "bullish" ? "강세" : "약세") + " 거래량 다이버전스", (xa + xb) / 2, Math.min(ya, yb) - 8, col, "center");
      }
    }
    // 레이어2: 급증 마커 + 상태/관계 배지
    if (reveal >= 2) {
      const relTxt = va.relationship === "confirm" ? "상승 확인" : va.relationship === "weakening" ? "추진력 약화" : va.relationship === "selling" ? "매도 압력" : "투매 진정";
      const relCol = (va.relationship === "confirm" || va.relationship === "capitulation") ? "#46c28e" : "#e06a6a";
      const stTxt = va.state === "spike" ? "거래량 급증" : va.state === "contract" ? "거래량 위축" : "거래량 평이";
      // 급증 시 마지막 봉(현재) 가격 위에 짧은 골드 수직 틱
      if (va.state === "spike" && isFinite(M.lastPrice)) {
        const x = fiToX(Math.max(fiMin, M.nowFi)), y = pToY(M.lastPrice);
        if (isFinite(x) && isFinite(y)) { c.strokeStyle = "#e8b463"; c.lineWidth = 2.5; c.beginPath(); c.moveTo(x, y - 14); c.lineTo(x, y - 4); c.stroke(); }
      }
      _evLabel(c, stTxt + " \xb7 " + relTxt, xRight - 6, 28, relCol, "right");
    }
    c.restore();
  }
```

> `M.lastPrice`(마지막 봉 종가)·`M.nowFi`(마지막 봉 **절대 가격인덱스**)는 Step 2의 차트/오버레이 분기에서 함께 넘긴다(아래 분기 코드 참조). 급증 틱은 현재 봉 가격 바로 위 10px 구간에 짧게 그린다.

- [ ] **Step 2: 차트·오버레이 draw 루프에 volume 분기 신설**

RSI 차트 분기(약 2768행) 직후에 동형으로 추가(차트 모드 M 사용):

```js
    } else if (n.blockType === "volume") {
      const vser = (Array.isArray(n.series) && n.series.length >= 2) ? n.series : ForgeCore.synthVolume(P);
      const va = ForgeCore.analyzeVolume(P, vser);
      legend.push({ k: "volume", label: EV_LABEL.volume + "(전문)" });
      _drawVolumeLayers(c, va, { fiToX: fi => toXh(Math.max(0, Math.min(Hn - 1, fi - off))), pToY: toY, nowFi: P.length - 1, fiMin: off, reveal: _playing ? (_evReveal[n.id] || 0) : Infinity, xRight: g.padX + g.plotW, lastPrice: P[P.length - 1] });
    }
```

RSI 오버레이 분기(약 2809행) 직후에 동형으로 추가(오버레이 모드 M 사용):

```js
    } else if (n.blockType === "volume") {
      const vser = (Array.isArray(n.series) && n.series.length >= 2) ? n.series : ForgeCore.synthVolume(P);
      const va = ForgeCore.analyzeVolume(P, vser);
      legend.push({ k: "volume", label: EV_LABEL.volume + "(전문)" });
      _drawVolumeLayers(c, va, { fiToX: xOf, pToY: v => clipY(yOf(v)), nowFi: P.length - 1, fiMin: 0, reveal: _playing ? (_evReveal[n.id] || 0) : Infinity, xRight: g.rightX || (g.ox + g.dw), lastPrice: P[P.length - 1] });
    }
```

> 실제 변수명(`P`, `toXh`, `Hn`, `off`, `toY`, `xOf`, `yOf`, `clipY`, `g.padX`, `g.plotW`, `g.rightX`, `g.ox`, `g.dw`)은 **각 모드의 RSI 분기에서 쓰는 것과 정확히 동일**해야 한다. RSI 분기를 그대로 읽어 같은 식별자를 사용할 것. `_drawVolumeLayers`가 `M.nowFi`/`M.lastPrice`로 급증 마커 y를 그릴 수 있도록 Step 1의 함수와 정합되게 마무리한다.

- [ ] **Step 3: `analysisSteps` volume 케이스 추가 (rsi 케이스 뒤)**

`n.blockType === "rsi"` 케이스 바로 뒤에:

```js
    if (n.blockType === "volume") {
      const vser = (Array.isArray(n.series) && n.series.length >= 2) ? n.series : ForgeCore.synthVolume(price);
      const va = ForgeCore.analyzeVolume(price, vser);
      return ForgeCore.volumeSteps(va).map((text, i) => ({ text, layer: [1, 1, 2, 2, 2][i] }));
    }
```

> `price` 변수·반환 객체 형태(`{text, layer}`)는 rsi 케이스와 정확히 동일하게. layers 배열은 `[1,1,2,2,2]`.

- [ ] **Step 4: 범례 순서·라벨 확인**

`EV_LABEL.volume`(="거래량")과 `order` 배열(2455·3096행)에 `"volume"`이 이미 포함됨 — 추가 변경 불필요. 변경했다면 원복.

- [ ] **Step 5: 검증**

```bash
cd map
node -e "const fs=require('fs');const h=fs.readFileSync('forge.html','utf8');const m=[...h.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(x=>x[1]).join('\n;\n');new Function(m);console.log('JS OK')"
node --test forge-core.test.js 2>&1 | grep -E "^. (pass|fail)"   # 81/0 유지(코어 미변경)
git diff --stat
```
Expected: `JS OK`, 81 pass / 0 fail, 따옴표 변형 없음(`git diff`로 확인).

- [ ] **Step 6: 커밋**

```bash
cd /home/jschoi0223/projects/vdiportal
git add map/forge.html
git commit -m "feat(forge): 거래량 hero 작도(_drawVolumeLayers 다이버전스선+급증마커/배지) + 차트·오버레이 분기 + 시연 케이스"
```

---

## Task 4: forge.html 거래량 막대 서브패널 (fcDrawVol + toggleVolPanel + renderChart 훅)

**Files:**
- Modify: `map/forge.html` (`#fcRsiPanel` 마크업 뒤에 `#fcVolPanel` 추가; `fcDrawRsi` 근처에 `fcDrawVol` 추가; `toggleRsiPanel` 뒤에 `toggleVolPanel` 추가; renderChart 훅에 추가)

**Interfaces:**
- Consumes: Task 1 `ForgeCore.analyzeVolume`/`ForgeCore.synthVolume`. 기존 캔버스 fit 헬퍼 `fcFit(cv, ch)`·`FC_DIM`, 토큰색. 기존 `boardState.nodes`, renderChart의 `data`/`price` 접근 방식.
- Produces: `#fcVolPanel`(canvas `#fcVol`), `fcDrawVol(va)`, `toggleVolPanel()`, renderChart 훅.

**중요 — RSI 서브패널을 먼저 읽고 동형으로.** `#fcRsiPanel` 마크업, `fcDrawRsi(rsi)`, `toggleRsiPanel()`, renderChart의 `toggleRsiPanel()`+`fcDrawRsi(...)` 훅을 그대로 미러. 캔버스 fit은 반드시 `fcFit`만 사용(독자 devicePixelRatio/width 조작 금지 — blur/더블스케일 방지).

- [ ] **Step 1: `#fcVolPanel` 마크업 추가 (`#fcRsiPanel` 뒤)**

`#fcRsiPanel` 블록(`.fc-rgutter` + `.fc-pbody` + `<canvas id="fcRsi">` 구조)을 복제해 id만 교체:

```html
<div class="fc-rgutter"></div>
<div id="fcVolPanel" class="fc-panel" style="display:none">
  <div class="fc-pbody"><canvas id="fcVol"></canvas><div id="fcVolMeta" class="fc-pmeta"></div></div>
</div>
```

> `#fcRsiPanel`의 실제 클래스/구조를 그대로 따르고(메타 라벨 id 포함 여부도 동일하게), `display:none` 기본 유지.

- [ ] **Step 2: `fcDrawVol(va)` 추가 (`fcDrawRsi` 근처)**

```js
  function fcDrawVol(va) {
    const cv = document.getElementById("fcVol"); if (!cv) return;
    const cw = cv.clientWidth || 300, ch = cv.clientHeight || 120;
    const c = fcFit(cv, ch); c.clearRect(0, 0, cw, ch);
    const s = (va && va.series) || [];
    if (s.length < 2) { c.fillStyle = "#8a92b2"; c.font = "12px Pretendard, sans-serif"; c.fillText("거래량 데이터 없음", 10, ch / 2); return; }
    const pad = 6, w = cw - pad * 2, h = ch - pad * 2 - 14;
    const maxV = Math.max.apply(null, s) || 1, n = s.length, bw = Math.max(1, w / n - 1);
    // 막대: 상승봉 bull / 하락봉 bear / 급증봉 골드
    const obv = va.obv || [];
    for (let i = 0; i < n; i++) {
      const x = pad + (i / n) * w, bh = (s[i] / maxV) * h, y = pad + h - bh;
      const up = i > 0 && obv[i] >= obv[i - 1];
      const spike = va.state === "spike" && i >= n - 3;
      c.fillStyle = spike ? "#e8b463" : up ? "rgba(70,194,142,.7)" : "rgba(224,106,106,.7)";
      c.fillRect(x, y, bw, bh);
    }
    // OBV 라인(보조 스케일)
    if (obv.length === n) {
      let omin = Math.min.apply(null, obv), omax = Math.max.apply(null, obv); const orng = (omax - omin) || 1;
      c.strokeStyle = "#8a92b2"; c.lineWidth = 1.5; c.beginPath();
      for (let i = 0; i < n; i++) { const x = pad + (i / n) * w + bw / 2, y = pad + h - ((obv[i] - omin) / orng) * h; i ? c.lineTo(x, y) : c.moveTo(x, y); }
      c.stroke();
    }
    // 상태 라벨
    const meta = document.getElementById("fcVolMeta");
    if (meta) meta.textContent = "거래량 " + (va.state === "spike" ? "급증" : va.state === "contract" ? "위축" : "평이") + " " + va.ratio.toFixed(2) + "x \xb7 OBV " + (va.obvTrend > 0.1 ? "상승" : va.obvTrend < -0.1 ? "하락" : "횡보");
  }
```

> `fcFit` 호출 형태·반환(ctx)·`FC_DIM` 사용은 `fcDrawRsi`/`fcDrawFold`와 동일하게 맞춘다. `fcDrawRsi`가 `FC_DIM`으로 높이를 정하면 같은 방식을 쓰고, 메타 라벨 DOM 패턴도 RSI와 통일.

- [ ] **Step 3: `toggleVolPanel()` 추가 (`toggleRsiPanel` 뒤)**

```js
  function toggleVolPanel() {
    const p = document.getElementById("fcVolPanel"); if (!p) return;
    const has = boardState.nodes.some(n => n.kind === "block" && n.blockType === "volume");
    p.style.display = has ? "" : "none";
  }
```

> `toggleRsiPanel()`의 실제 구현(표시/숨김 방식·`boardState` 접근)을 그대로 미러.

- [ ] **Step 4: renderChart 훅 추가**

renderChart의 `toggleRsiPanel()` + `fcDrawRsi(...)` 호출부 바로 뒤에:

```js
    toggleVolPanel();
    const _vn = boardState.nodes.find(n => n.kind === "block" && n.blockType === "volume");
    if (_vn) { const vser = (Array.isArray(_vn.series) && _vn.series.length >= 2) ? _vn.series : ForgeCore.synthVolume(data.price); fcDrawVol(ForgeCore.analyzeVolume(data.price, vser)); }
```

> `data`/`data.price` 접근은 RSI 훅이 쓰는 것과 동일 변수(`renderChart(result, data)` 시그니처). RSI 훅이 `analyzeRSI(...)`를 부르는 위치·인자 방식을 그대로 따른다.

- [ ] **Step 5: 검증**

```bash
cd map
node -e "const fs=require('fs');const h=fs.readFileSync('forge.html','utf8');const m=[...h.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(x=>x[1]).join('\n;\n');new Function(m);console.log('JS OK')"
node --test forge-core.test.js 2>&1 | grep -E "^. (pass|fail)"   # 81/0 유지
git diff --stat
```
Expected: `JS OK`, 81 pass / 0 fail, 따옴표 변형 없음.

- [ ] **Step 6: 커밋**

```bash
cd /home/jschoi0223/projects/vdiportal
git add map/forge.html
git commit -m "feat(forge): 거래량 막대 서브패널(fcDrawVol·상승하락색·급증골드·OBV라인, 거래량 블록시 표시)"
```

---

## Task 5: nodeExpert 통일 + sampleGraph 거래량 노드

**Files:**
- Modify: `map/forge.html` (nodeExpert volume 케이스 3278~3289행을 `ForgeCore.analyzeVolume`로 통일)
- Modify: `map/forge-core.js` (`sampleGraph`에 거래량 노드 + 엣지 추가)
- Test: `map/forge-core.test.js` (sampleGraph 거래량 노드 존재·실행 회귀)

**Interfaces:**
- Consumes: Task 1 `ForgeCore.analyzeVolume`/`ForgeCore.synthVolume`, `sampleSeries()`.
- Produces: nodeExpert volume가 단일출처 사용. `sampleGraph()` 노드 배열에 `s_vol`(blockType volume, baked series) + 엣지 `price→s_vol`, `s_vol→combine`.

- [ ] **Step 1: 실패하는 테스트 작성 (sampleGraph 거래량 노드)**

`map/forge-core.test.js` 끝에 추가:

```js
test("sampleGraph: 거래량 노드 포함 + 실행 시 유한 예측", () => {
  const g = ForgeCore.sampleGraph();
  const vol = g.nodes.find(n => n.blockType === "volume");
  assert.ok(vol, "거래량 노드 존재");
  assert.ok(Array.isArray(vol.series) && vol.series.length >= 2, "베이크 거래량 시계열");
  assert.ok(g.edges.some(e => e.to === vol.id), "price→volume 엣지");
  assert.ok(g.edges.some(e => e.from === vol.id), "volume→combine 엣지");
  const price = ForgeCore.sampleSeries();
  const data = { price, candle: price.map(c => ({ o: c, h: c + 1, l: c - 1, c })) };
  const r = ForgeCore.run(g, data, { timeframe: "일봉" });
  assert.ok(isFinite(r.prediction.target));
});
```

- [ ] **Step 2: 실패 확인**

Run: `cd map && node --test forge-core.test.js`
Expected: FAIL — "거래량 노드 존재" 단언 실패(아직 sampleGraph에 없음).

- [ ] **Step 3: 구현 (3-a) `sampleGraph`에 거래량 노드·엣지 추가**

`sampleGraph()`의 `nodes` 배열에서 `s_ell`(엘리어트) 항목 뒤, `s_comb` 앞에 추가:

```js
      { id: "s_vol",   kind: "block", blockType: "volume",    params: {},                 x: 320, y: 600, title: "거래량",      conviction: 0,   weight: 55, thumb: T("smp_main", "거래량"), desc: "상승 구간 거래량 동반 — 추세 확인", series: synthVolume(sampleSeries()) },
```

`edges` 배열에 추가(price→vol, vol→combine):

```js
    const edges = [
      E("s_price", "s_ma"), E("s_price", "s_wave"), E("s_price", "s_rsi"),
      E("s_price", "s_fib"), E("s_price", "s_trend"), E("s_price", "s_ell"), E("s_price", "s_vol"),
      E("s_ma", "s_comb"), E("s_wave", "s_comb"), E("s_rsi", "s_comb"),
      E("s_fib", "s_comb"), E("s_trend", "s_comb"), E("s_ell", "s_comb"), E("s_vol", "s_comb"),
      E("s_comb", "s_pred")
    ];
```

> `synthVolume`/`sampleSeries`는 같은 파일 내 함수라 직접 호출 가능. `thumb`는 기존 빌트인 id 재사용(`smp_main`)으로 무난.

- [ ] **Step 3: 구현 (3-b) nodeExpert volume 케이스 통일 (`forge.html` 3278~3289행)**

기존 자체 계산 블록:

```js
      case "volume": {
        const vol = (v && v.length) ? v : (Array.isArray(n.series) ? n.series : []);
        if (vol.length < 6) return ["거래량 시계열 미입력 — 이미지만 추가됨(분석 위해 데이터 필요)"];
        ... (자체 ratio/slp/관계 계산) ...
      }
```

을 `analyzeVolume` 단일출처로 교체:

```js
      case "volume": {
        const vser = (Array.isArray(n.series) && n.series.length >= 2) ? n.series : ForgeCore.synthVolume(P);
        const va = ForgeCore.analyzeVolume(P, vser);
        if (!va.series.length) return ["거래량 데이터 없음"];
        const f = [];
        f.push("최근/평균 " + va.ratio.toFixed(2) + "x \xb7 " + (va.state === "spike" ? "급증" : va.state === "contract" ? "위축" : "평이"));
        f.push("거래량 추세 " + (va.trend > 0.1 ? "증가 ↑" : va.trend < -0.1 ? "감소 ↓" : "횡보 →"));
        const rel = va.relationship === "confirm" ? "상승에 거래량 동반 — 추세 건강(확인)" : va.relationship === "weakening" ? "상승하나 거래량 감소 — 추진력 약화(주의)" : va.relationship === "selling" ? "하락에 거래량 증가 — 매도 압력(약세 확인)" : "하락+거래량 위축 — 투매 진정(바닥 가능)";
        f.push("가격-거래량: " + rel);
        f.push(va.divergence.type ? ((va.divergence.type === "bullish" ? "강세" : "약세") + " 거래량 다이버전스") : ("OBV " + (va.obvTrend > 0.1 ? "상승" : va.obvTrend < -0.1 ? "하락" : "횡보")));
        return f;
      }
```

> `P`(가격 배열)·`v`(블록값)·`n`(노드)는 nodeExpert가 다른 케이스에서 쓰는 변수명을 그대로 사용. RSI/다른 케이스가 `P`를 어떻게 얻는지 확인해 동일 식별자 사용. 반환은 문자열 배열(기존과 동일).

- [ ] **Step 4: 통과 확인 + JS 검증**

```bash
cd map
node --test forge-core.test.js 2>&1 | grep -E "^. (pass|fail)"   # 82 pass / 0 fail (81 + 1)
node -e "const fs=require('fs');const h=fs.readFileSync('forge.html','utf8');const m=[...h.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(x=>x[1]).join('\n;\n');new Function(m);console.log('JS OK')"
git diff --stat
```
Expected: 82 pass / 0 fail, `JS OK`, 따옴표 변형 없음.

- [ ] **Step 5: 커밋**

```bash
cd /home/jschoi0223/projects/vdiportal
git add map/forge-core.js map/forge.html map/forge-core.test.js
git commit -m "feat(forge): nodeExpert 거래량 analyzeVolume 통일 + 샘플 포지 거래량 노드(베이크 시계열)"
```

---

## 최종

5개 태스크 완료 후: 전체 브랜치 리뷰(opus) → `superpowers:finishing-a-development-branch`로 main 머지 → cafe24 배포(`forge.html`+`forge-core.js`, JSON 불가침) → live curl 검증.
