# Gann 각도 지표 (blockType `gann`) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** forge에 연속 지표 `gann`(Gann 각도 부채꼴)을 추가한다 — 최근 지배 스윙에 앵커된 ATR 정규화 각도팬을 자동작도하고, 가격이 1×1 각 위/아래냐로 방향 bias를 산출해 예측 엔진에 융합한다.

**Architecture:** 기존 `pivot`/`fib` 지표와 동일한 "지표당 통합 패턴"을 그대로 복제한다. 엔진(`forge-core.js`)에 순수 함수 `analyzeGann`(+`gannSteps`)를 추가하고 `run()`에서 드리프트 항 1개(`bias × trendScale × 0.05 × DW`)를 `_drifts`에 더한다. UI 4파일(state/ui/draw/app)에 지표 등록·작도·해설을 배선한다. **기본전략(seedDefaultStrategy)에는 넣지 않아** 백테스트/회고 베이스라인을 불변으로 유지한다.

**Tech Stack:** 순수 HTML5·CSS3·바닐라 JS(빌드 도구 없음). 엔진은 UMD(`forge-core.js`), 단위테스트는 `node --test forge-core.test.js`. 여러 classic script가 전역 스코프 공유(로드 순서 core→state→ui→draw→app 고정).

## Global Constraints

스펙(`docs/superpowers/specs/2026-07-15-chart-geometry-patterns-design.md`)의 불가침 제약 — 모든 태스크에 암묵 적용:

- **순수 추가**: 기존 30종 지표 로직·`run()` 융합 수식·회고 인프라(`map/backtest/`)를 **한 줄도 수정 금지**. `gann`은 `_drifts`에 **항 1개만** 추가.
- **±0.28 총캡 안전망 유지**: `gann` 드리프트 계수(cap)는 보수적 `0.05`(pivot 0.04 ~ psar 0.08 사이). 이중계상 금지 — combine series는 `zeros`, 방향은 드리프트로만.
- **기본전략 미편입**: `forge-ui.js`의 `seedDefaultStrategy`(L1446~, 특히 `mk(...)` 시드 라인 L1471 부근·combine 연결 배열 L1485)에 **gann을 추가하지 않는다** → 레일 선택형 → 백테스트/회고 수치 불변.
- **테스트 추가만**: `forge-core.test.js`(현 199+케이스)에 신규 케이스 **추가**. 기존 케이스 수정 금지, 전부 그린 유지.
- **primitive 재사용**: 스윙 앵커는 `_domSwing(price, s0)`, 변동성 단위는 `_candATR(candle, period)` 재사용(둘 다 `forge-core.js` 내부 함수, 선언 호이스팅으로 호출 가능). 바퀴 재발명 금지.
- **로드 순서·전역 스코프**: `defer`/`async` 금지, 중복 최상위 선언 금지. 새 함수는 각 파일의 IIFE 내부에.
- **파라미터 캐시키**: 파라미터 있는 지표의 `_an` 래퍼는 캐시키에 `JSON.stringify(opts)` 포함(안 하면 stale). `_anGann`은 params를 키에 포함.
- **디자인 금지**: 종목/지표/카드 좌측 세로 컬러 accent line 절대 금지(배경·텍스트·체크·아웃라인으로만).
- **동반 배포 필수**: 변경 파일 `forge-core.js`·`forge-state.js`·`forge-ui.js`·`forge-draw.js`·`forge-app.js`를 한 세트로 cafe24 `www/map/` 배포. `forge-core.test.js`는 배포 제외. 서버 데이터 파일(`forge_*.json` 등) 불가침.

## 파일 구조 (변경 대상)

| 파일 | 책임 | 변경 |
|---|---|---|
| `map/forge-core.js` | 엔진 — `analyzeGann`·`gannSteps`·evalBlocks·run 드리프트·export | 수정 |
| `map/forge-core.test.js` | 단위테스트 | 추가만 |
| `map/forge-state.js` | BLOCK_DEFS·IND_TIERS·NEW_INDICATORS | 수정 |
| `map/forge-ui.js` | `_anGann`·`_nodeBias`·renderParams·RAIL_SHORT·GAUGE_TYPES | 수정 |
| `map/forge-draw.js` | `_drawGannLayers`·dispatch·EV_COLORS/LABEL/order·INDICATOR_INFO·TUNE_TYPES·EV_DEFAULT_VISIBLE | 수정 |
| `map/forge-app.js` | analysisSteps·nodeExpert·playAnalysis whitelist·order | 수정 |

---

## Task 1: 엔진 — `analyzeGann` + `gannSteps` (TDD)

**Files:**
- Modify: `map/forge-core.js` (analyzePivot 뒤 ~L463 이후에 삽입; export 객체 L2490)
- Test: `map/forge-core.test.js` (pivot 테스트 L1346~ 인근에 추가)

**Interfaces:**
- Consumes: `_domSwing(price, s0) → {fromIdx,fromPrice,toIdx,toPrice,dir}|null`, `_candATR(candle, period) → number`(둘 다 forge-core.js 내부, 호이스팅됨).
- Produces:
  - `analyzeGann(data, opts) → { anchor:{idx,price}|null, dir:"up"|"down"|"none", unit:number, angles:[{name:string,slope:number}], oneOne:number, last:number, bias:number }` (bias ∈ [−1,1]).
  - `gannSteps() → [{k,v},{k,v},{k,v}]`.
  - 둘 다 UMD `api` 객체에 노출.

- [ ] **Step 1: 실패하는 테스트 작성**

`map/forge-core.test.js`의 pivot 테스트 블록(L1346 부근) 뒤에 헬퍼 + 4개 테스트 추가:

```js
// Gann 각도 테스트용 램프 캔들 생성 (선형 추세 + 얕은 범위)
function _rampCandle(n, start, step) {
  const c = []; let prev = start;
  for (let i = 0; i < n; i++) {
    const close = start + step * i;
    const o = i ? prev : close;
    const h = Math.max(o, close) + Math.abs(step) * 0.2;
    const l = Math.min(o, close) - Math.abs(step) * 0.2;
    c.push({ o, h, l, c: close }); prev = close;
  }
  return c;
}

test("analyzeGann: 상승 지배 스윙이면 bias>0, 하락이면 bias<0", () => {
  const up = _rampCandle(40, 100, 1.5);
  const r = ForgeCore.analyzeGann({ candle: up, price: up.map(c => c.c) });
  assert.strictEqual(r.dir, "up");
  assert.ok(r.bias > 0, `up bias>0, got ${r.bias}`);
  const dn = _rampCandle(40, 160, -1.5);
  const r2 = ForgeCore.analyzeGann({ candle: dn, price: dn.map(c => c.c) });
  assert.strictEqual(r2.dir, "down");
  assert.ok(r2.bias < 0, `down bias<0, got ${r2.bias}`);
});

test("analyzeGann: 데이터 부족 시 EMPTY(bias 0, anchor null)", () => {
  const r = ForgeCore.analyzeGann({ candle: [], price: [1, 2, 3] });
  assert.strictEqual(r.bias, 0);
  assert.strictEqual(r.anchor, null);
});

test("analyzeGann: 각도 7종(1x1~1x4) 반환", () => {
  const up = _rampCandle(40, 100, 1.5);
  const r = ForgeCore.analyzeGann({ candle: up, price: up.map(c => c.c) });
  assert.strictEqual(r.angles.length, 7);
  assert.ok(r.angles.some(a => a.name === "1x1"), "1x1 포함");
});

test("gannSteps: 3줄", () => {
  assert.strictEqual(ForgeCore.gannSteps().length, 3);
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `node --test map/forge-core.test.js`
Expected: FAIL — `ForgeCore.analyzeGann is not a function`.

- [ ] **Step 3: `analyzeGann` + `gannSteps` 구현**

`map/forge-core.js`의 `pivotSteps()`(L463) 바로 뒤에 삽입:

```js
function analyzeGann(data, opts) {
  opts = opts || {};
  const candle = (data && data.candle) || [];
  const price = (data && data.price) || candle.map(c => c.c);
  const P = price.length;
  const EMPTY = { anchor: null, dir: "none", unit: 0, angles: [], oneOne: 0, last: 0, bias: 0 };
  if (P < 24) return EMPTY;
  const lookback = Math.max(24, Math.min(P, opts.lookback || 120));
  const s0 = Math.max(0, P - lookback);
  const sw = _domSwing(price, s0);
  if (!sw) return EMPTY;
  // ATR 정규화 단위(1×1 = 1 ATR/봉). 캔들 없으면 봉당 절대변화 평균으로 폴백.
  const per = Math.max(2, Math.min(opts.atrPeriod || 14, P - 1));
  let unit = candle.length >= per + 1 ? _candATR(candle, per) : 0;
  if (!(unit > 0)) {
    let s = 0, k = 0;
    for (let i = Math.max(1, P - per); i < P; i++) { s += Math.abs(price[i] - price[i - 1]); k++; }
    unit = k ? s / k : Math.max(1e-9, Math.abs(price[P - 1]) * 0.01);
  }
  if (!(unit > 0)) unit = Math.max(1e-9, Math.abs(price[P - 1]) * 0.01);
  const up = sw.dir === "up", sign = up ? 1 : -1;
  const anchorIdx = sw.fromIdx, anchorPrice = sw.fromPrice;
  const RATIOS = [["1x1", 1], ["2x1", 2], ["3x1", 3], ["4x1", 4], ["1x2", 0.5], ["1x3", 1 / 3], ["1x4", 0.25]];
  const angles = RATIOS.map(([name, m]) => ({ name, slope: sign * m * unit }));
  const lastIdx = P - 1, last = price[lastIdx];
  const oneOne = anchorPrice + sign * unit * (lastIdx - anchorIdx);   // 1×1 각의 현재 봉 값
  const v = (last - anchorPrice) / Math.max(1, lastIdx - anchorIdx);  // 앵커 이후 봉당 실제 속도
  const ratio = (sign * v) / unit;                                    // 1×1(=1) 대비 배율
  let bias = sign * (0.5 + 0.5 * Math.tanh(ratio - 1));               // 팬 방향이 부호, 각 밴드가 크기
  bias = Math.max(-1, Math.min(1, bias));
  return { anchor: { idx: anchorIdx, price: anchorPrice }, dir: sw.dir, unit, angles, oneOne, last, bias };
}
function gannSteps() {
  return [
    { k: "앵커", v: "직전 지배 스윙(고/저)에 각도팬 고정" },
    { k: "각도", v: "1×1(=1 ATR/봉) 기준 2×1~1×4 부채꼴 투영" },
    { k: "방향", v: "종가 vs 1×1 — 위=강세 / 아래=약세" },
  ];
}
```

- [ ] **Step 4: UMD export에 추가**

`map/forge-core.js` L2490의 `return { version, ..., analyzePivot, pivotSteps, ... };` api 객체에 `analyzeGann, gannSteps` 추가:

```js
    analyzePivot, pivotSteps, analyzeGann, gannSteps,
```

- [ ] **Step 5: 테스트 통과 확인**

Run: `node --test map/forge-core.test.js`
Expected: PASS — 신규 4개 포함 전부 통과.

- [ ] **Step 6: 커밋**

```bash
git add map/forge-core.js map/forge-core.test.js
git commit -m "feat(forge): analyzeGann 각도 엔진 함수 + gannSteps + 단위테스트"
```

---

## Task 2: 엔진 — `run()` 드리프트 융합 + evalBlocks (TDD)

**Files:**
- Modify: `map/forge-core.js` (evalBlocks pivot 케이스 L304 인근; run 드리프트 L1854 인근; `_drifts` 배열 L1898; dirBias 목록 L1906·L2031)
- Test: `map/forge-core.test.js`

**Interfaces:**
- Consumes: `analyzeGann`(Task 1), `trendProfileForTF`(→`_prof`), `DW(type)`.
- Produces: gann 노드가 그래프에 있으면 예측 `prediction.target`이 달라진다.

- [ ] **Step 1: 실패하는 테스트 작성**

`map/forge-core.test.js`의 "run: 피벗 포인트 노드가 예측 반영" 테스트(L1360 부근) 뒤에 추가:

```js
test("run: Gann 각도 노드가 예측 반영", () => {
  const up = _rampCandle(60, 100, 1.2);
  const price = up.map(c => c.c), candle = up;
  const base = { nodes: [{ id: "p", kind: "block", blockType: "price" }, { id: "pr", kind: "block", blockType: "predict" }], edges: [{ from: "p", to: "pr" }] };
  const r0 = ForgeCore.run(base, { price, candle }, { futW: 24 });
  const g = { nodes: base.nodes.concat([{ id: "gn", kind: "block", blockType: "gann" }]), edges: base.edges.concat([{ from: "gn", to: "pr" }]) };
  const r1 = ForgeCore.run(g, { price, candle }, { futW: 24 });
  assert.ok(Math.abs(r1.prediction.target - r0.prediction.target) > 1e-9, "gann 예측 반영");
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `node --test map/forge-core.test.js`
Expected: FAIL — target 차이가 없어 `gann 예측 반영` assert 실패(아직 드리프트 미배선).

- [ ] **Step 3: evalBlocks에 gann 케이스 추가 (combine series는 zeros)**

`map/forge-core.js` L304의 pivot 케이스 바로 뒤에 삽입:

```js
      } else if (n.blockType === "gann") {
        values[id] = (ins[0] || data.price).map(() => 0);
```

- [ ] **Step 4: run()에 gann 드리프트 항 추가**

`map/forge-core.js` L1854~1856(pivot 드리프트 정의) 바로 뒤에 삽입:

```js
    const _gnn = (graph.nodes || []).find(nd => nd.kind === "block" && nd.blockType === "gann");
    const _gn2 = _gnn ? analyzeGann(data, {}) : null;
    const gannDrift = _gn2 ? _gn2.bias * _prof.trendScale * 0.05 * DW("gann") : 0;   // Gann 1×1 방향(±5%·S/R성)
```

- [ ] **Step 5: `_drifts` 배열에 편입**

`map/forge-core.js` L1898의 `_drifts` 배열 끝(`cmfDrift` 뒤)에 `gannDrift` 추가:

```js
    const _drifts = [maDrift, fibDrift, ewDrift, rsiDrift, volDrift, bbDrift, macdDrift, adxDrift, vpDrift, icDrift, stDrift, smcDrift, cyDrift, vwDrift, stDrift2, stochDrift, pivotDrift, psarDrift, keltnerDrift, donchianDrift, cciDrift, williamsDrift, rocDrift, aoDrift, aroonDrift, mfiDrift, cmfDrift, gannDrift];
```

- [ ] **Step 6: dirBias(방향 일치도) 목록 2곳에 추가**

L1906·L2031 두 곳의 dirBias 후보 목록(pivot이 `_pv2 && _pv2.bias` 형태로 들어간 배열)에 `_gn2 && _gn2.bias`를 각각 추가한다. 정확한 위치는 `_pv2 && _pv2.bias`를 grep으로 찾아 같은 배열 원소로 나란히 삽입:

```bash
grep -n "_pv2 && _pv2.bias" map/forge-core.js
```

각 매치의 배열에 `, _gn2 && _gn2.bias`를 pivot 항 뒤에 추가.

- [ ] **Step 7: 테스트 통과 확인 (기존 전부 그린 포함)**

Run: `node --test map/forge-core.test.js`
Expected: PASS — 신규 "run: Gann 각도 노드가 예측 반영" 포함, 기존 199+ 전부 통과.

- [ ] **Step 8: 커밋**

```bash
git add map/forge-core.js map/forge-core.test.js
git commit -m "feat(forge): run() Gann 드리프트 융합(_drifts 항 1개·cap 0.05) + evalBlocks zeros"
```

---

## Task 3: 지표 등록 — forge-state.js (BLOCK_DEFS·IND_TIERS·NEW_INDICATORS)

**Files:**
- Modify: `map/forge-state.js` (BLOCK_DEFS L210 인근; IND_TIERS L228; NEW_INDICATORS L232)

**Interfaces:**
- Consumes: 없음(정적 등록).
- Produces: 레일 3패널에 `gann` 블록이 Lv2 "주요 지표"로 'new' 배지와 함께 노출.

- [ ] **Step 1: BLOCK_DEFS에 gann 정의 추가**

`map/forge-state.js` L210의 `{ type: "pivot", ... }` 라인 바로 뒤에 삽입:

```js
    { type: "gann",      label: "Gann 각도",    kind: "block", params: { lookback: 120, atrPeriod: 14 } },
```

- [ ] **Step 2: IND_TIERS Lv2에 gann 배치**

`map/forge-state.js` L228의 Lv2 types 배열 끝에 `"gann"` 추가:

```js
    { lv: 2, name: "주요 지표",  types: ["trend", "adx", "stochastic", "fib", "ichimoku", "pivot", "psar", "gann"] },
```

- [ ] **Step 3: NEW_INDICATORS에 gann 추가**

`map/forge-state.js` L232의 Set에 `"gann"` 추가:

```js
  const NEW_INDICATORS = new Set(["pivot", "psar", "keltner", "donchian", "cci", "williams", "roc", "ao", "aroon", "mfi", "cmf", "gann"]);
```

- [ ] **Step 4: 커밋**

```bash
git add map/forge-state.js
git commit -m "feat(forge): gann 지표 등록(BLOCK_DEFS·IND_TIERS Lv2·NEW 배지)"
```

---

## Task 4: UI 배선 — forge-ui.js (`_anGann`·`_nodeBias`·renderParams·RAIL_SHORT·GAUGE_TYPES)

**Files:**
- Modify: `map/forge-ui.js` (RAIL_SHORT L4; GAUGE_TYPES L364; `_anPivot` L464 인근; `_nodeBias` switch L496 인근; renderParams L687 인근)

**Interfaces:**
- Consumes: `ForgeCore.analyzeGann`, `_anGet(P, key, compute)`, `_fcLastData`/`currentData`, `numRow(key,label,val)`.
- Produces: `_anGann(P, opts) → analyzeGann 결과`(프레임 캐시), `_nodeBias`가 gann 노드 bias 반환, 편집창에 gann 파라미터 UI.

- [ ] **Step 1: RAIL_SHORT에 gann 축약 라벨 추가**

`map/forge-ui.js` L4의 RAIL_SHORT 맵에 `gann: "Gann"` 추가.

- [ ] **Step 2: GAUGE_TYPES에 gann 추가**

`map/forge-ui.js` L364의 GAUGE_TYPES 배열 끝(`"cmf"` 뒤)에 `"gann"` 추가.

- [ ] **Step 3: `_anGann` 래퍼 추가 (params를 캐시키에 포함)**

`map/forge-ui.js` L464의 `_anPivot` 함수 바로 뒤에 삽입:

```js
  function _anGann(P, opts) {
    const o = opts || {};
    return _anGet(P, "Gann" + JSON.stringify(o), () => ForgeCore.analyzeGann({ candle: (_fcLastData && _fcLastData.candle) || (typeof currentData === "function" && currentData().candle) || [], price: P }, o));
  }
```

- [ ] **Step 4: `_nodeBias` switch에 gann 케이스 추가**

`map/forge-ui.js` L496의 `case "pivot": return _anPivot(P).bias;` 바로 뒤에 삽입:

```js
      case "gann": return _anGann(P, n.params).bias;
```

- [ ] **Step 5: renderParams에 gann 파라미터 UI 추가**

`map/forge-ui.js` L687의 pivot 파라미터 안내 라인 인근(다른 `if (n.blockType === ...)` 블록들과 나란히)에 삽입:

```js
    if (n.blockType === "gann") {
      rows.push(numRow("lookback", "앵커 탐색 구간(봉)", (n.params && n.params.lookback) ?? 120));
      rows.push(numRow("atrPeriod", "변동성 기준 기간", (n.params && n.params.atrPeriod) ?? 14));
    }
```

- [ ] **Step 6: seedDefaultStrategy 미편입 재확인**

`map/forge-ui.js` L1446~L1488(seedDefaultStrategy)를 열어 **gann 관련 `mk(...)`·combine 연결이 없음을 확인**한다(추가하지 않는 것이 정상 — Global Constraints의 기본전략 미편입). 변경 없음.

- [ ] **Step 7: 커밋**

```bash
git add map/forge-ui.js
git commit -m "feat(forge): gann UI 배선(_anGann params캐시키·_nodeBias·renderParams·GAUGE)"
```

---

## Task 5: 작도 — forge-draw.js (`_drawGannLayers`·dispatch·색/라벨/해설/튜너)

**Files:**
- Modify: `map/forge-draw.js` (EV_DEFAULT_VISIBLE L1043; EV_COLORS L1055; INDICATOR_INFO L1057~ 내 gann; EV_LABEL L1089; order L1091; TUNE_TYPES L1104; `_drawGannLayers` 신설 `_drawPivotLayers` L2413 인근; dispatch 분기 L2659 인근)

**Interfaces:**
- Consumes: `_anGann`(Task 4), `_mainGeo`(g: `pathLen`/`padX`/`plotW`), `fiToX`, `toY`, `FC_GOLD`, `CW`, `CDASH`, `EV_LABEL`, `_evReveal`, `_playing`, `_drawThis`, `cc`, `col`, `P`.
- Produces: gann 노드 포커스/표시 시 4패널에 각도팬 자동작도.

- [ ] **Step 1: `_drawGannLayers` 함수 추가**

`map/forge-draw.js`의 `_drawPivotLayers`(L2413) 함수 바로 뒤에 삽입:

```js
  function _drawGannLayers(c, gn, M) {
    c.save();
    const { toY, fiToX, nowFi, futN, xRight, reveal = Infinity } = M;
    if (!gn || !gn.anchor || !gn.angles || !gn.angles.length) { c.restore(); return; }
    const aIdx = gn.anchor.idx, aPrice = gn.anchor.price;
    const ax = fiToX(aIdx), ay = toY(aPrice);
    const totalBars = (nowFi - aIdx) + (futN || 0);   // 앵커→우측 끝(미래 포함) 봉 수
    gn.angles.forEach((a, i) => {
      if (reveal !== Infinity && reveal < i + 1) return;
      const yv = aPrice + a.slope * totalBars;
      const is11 = a.name === "1x1";
      c.beginPath(); c.moveTo(ax, ay); c.lineTo(xRight, toY(yv));
      c.strokeStyle = is11 ? FC_GOLD : "rgba(201,162,107,0.35)";
      c.lineWidth = is11 ? CW.bold : CW.base;
      c.setLineDash(is11 ? [] : CDASH.std);
      c.stroke(); c.setLineDash([]);
      c.fillStyle = is11 ? FC_GOLD : "rgba(201,162,107,0.6)";
      c.font = "10px sans-serif";
      c.fillText(a.name, xRight + 3, toY(yv));
    });
    c.beginPath(); c.arc(ax, ay, 3, 0, Math.PI * 2); c.fillStyle = FC_GOLD; c.fill();
    c.restore();
  }
```

- [ ] **Step 2: hero 작도 dispatch에 gann 분기 추가**

`map/forge-draw.js` L2659~2662의 pivot 분기 바로 뒤에 삽입:

```js
        } else if (n.blockType === "gann") {
          const gn = _anGann(price, n.params);
          if (_drawThis) _drawGannLayers(cc, gn, { toY: v => toY(v), fiToX, nowFi: P - 1, futN: g.pathLen, xRight: g.padX + g.plotW, reveal: _playing ? (_evReveal[n.id] || 0) : Infinity });
          legend.push({ col, t: EV_LABEL.gann, _key: n.blockType });
```

- [ ] **Step 3: EV_COLORS에 gann 색 추가**

`map/forge-draw.js` L1055의 EV_COLORS 맵에 `gann: "#c9a26b"` 추가.

- [ ] **Step 4: EV_LABEL에 gann 라벨 추가**

`map/forge-draw.js` L1089의 EV_LABEL 맵에 `gann: "Gann 각도"` 추가.

- [ ] **Step 5: EV_DEFAULT_VISIBLE·order에 gann 추가**

L1043 EV_DEFAULT_VISIBLE 배열 끝에 `"gann"`, L1091 order 배열의 `"pivot"` 인근에 `"gann"` 추가(자동작도 원칙 — 기본 표시).

- [ ] **Step 6: INDICATOR_INFO에 gann 도구 안내 추가**

`map/forge-draw.js` L1077의 pivot INDICATOR_INFO 항목 인근에 삽입:

```js
    gann: { p: "추세의 각도·속도를 기하학적으로 판정.", d: "직전 지배 스윙에 1×1(=1 ATR/봉) 기준 부채꼴(2×1~1×4)을 투영.", h: "종가가 1×1 위=강한 추세. 2×1·3×1 상단각 돌파=가속. 1×2·1×4 아래 이탈=둔화." },
```

- [ ] **Step 7: TUNE_TYPES에 gann 추가**

`map/forge-draw.js` L1104의 TUNE_TYPES 배열에 `["gann", "Gann 각도"]` 추가.

- [ ] **Step 8: 커밋**

```bash
git add map/forge-draw.js
git commit -m "feat(forge): gann 각도팬 작도(_drawGannLayers·dispatch) + 색/라벨/해설/튜너 배선"
```

---

## Task 6: 해설·플레이 — forge-app.js (analysisSteps·nodeExpert·playAnalysis·order)

**Files:**
- Modify: `map/forge-app.js` (order L245; analysisSteps L402 인근; nodeExpert L541 인근; playAnalysis indNodes L2550)

**Interfaces:**
- Consumes: `ForgeCore.gannSteps`, `_anGann`(Task 4), `fmtNum`.
- Produces: gann 노드의 분석 단계 서술·전문가 팩트·플레이 애니메이션 등장.

- [ ] **Step 1: analysisSteps에 gann 분기 추가**

`map/forge-app.js` L402~405의 pivot 분기 바로 뒤에 삽입:

```js
    if (n.blockType === "gann" && Array.isArray(price) && price.length >= 24) {
      const texts = ForgeCore.gannSteps().map(s => s.k + " — " + s.v);
      return texts.map((text, i) => ({ text, layer: [1, 2, 2][i] }));
    }
```

- [ ] **Step 2: nodeExpert에 gann 케이스 추가**

`map/forge-app.js` L541~550의 pivot case 바로 뒤에 삽입:

```js
      case "gann": {
        if (!Array.isArray(P) || P.length < 24) return ["데이터 없음"];
        const gn = _anGann(P, n.params);
        if (!gn.anchor) return ["데이터 없음"];
        const dirTxt = gn.dir === "up" ? "상방 팬(직전 지배 저점 기준)" : "하방 팬(직전 지배 고점 기준)";
        const posTxt = gn.last > gn.oneOne ? "1×1 위(강세)" : gn.last < gn.oneOne ? "1×1 아래(약세)" : "1×1 근접(중립)";
        f.push("앵커 " + fmtNum(gn.anchor.price) + " · " + dirTxt);
        f.push("1×1 현재값 " + fmtNum(gn.oneOne) + " · 종가 " + fmtNum(gn.last) + " — " + posTxt);
        f.push("각도 " + gn.angles.map(a => a.name).join(" · ") + " (ATR 정규화)");
        return f;
      }
```

- [ ] **Step 3: playAnalysis indNodes 화이트리스트에 gann 추가**

`map/forge-app.js` L2550의 `["ma","trend",...,"cmf"]` 배열 끝에 `"gann"` 추가.

- [ ] **Step 4: 신호보드 order에 gann 추가**

`map/forge-app.js` L245의 order 배열의 `"pivot"` 인근에 `"gann"` 추가.

- [ ] **Step 5: 커밋**

```bash
git add map/forge-app.js
git commit -m "feat(forge): gann 해설 배선(analysisSteps·nodeExpert·playAnalysis·order)"
```

---

## Task 7: 검증 + 배포

**Files:** 없음(검증·배포만)

- [ ] **Step 1: 전체 단위테스트 그린 확인**

Run: `node --test map/forge-core.test.js`
Expected: PASS — 신규 5개(analyzeGann 3 + gannSteps 1 + run 1) 포함 203+ 전부 통과, 기존 199 무회귀.

- [ ] **Step 2: 백테스트 베이스라인 불변 확인**

`map/backtest/` 하위 하네스·기본전략 파일에 gann이 들어가지 않았음을 확인(변경 파일 목록에 backtest 없음):

```bash
git diff --name-only HEAD~6 -- map/backtest/ | head
```

Expected: 출력 없음(백테스트 파일 무변경) → 스코어카드 수치 불변.

- [ ] **Step 3: 헤드리스 시각검증**

메모리 [[headless-verify-wsl]] 절차로 forge.html을 헤드리스 렌더 → gann 블록을 레일에서 추가(또는 노드 생성) → 웹분석 실행 → **4패널에 각도팬(1×1 굵은 골드 + 2×1~1×4 흐린 점선) 자동작도**·2패널/전문가 패널에 gann 해설 표시 확인. **라이브 실데이터 쓰기함수(`_addTickerDoc`/`loadTicker`) 금지**([[headless-live-tests-readonly]]).

Expected: 각도팬 렌더 + 앵커 도트 + 끝점 라벨 확인.

- [ ] **Step 4: cafe24 배포**

메모리 [[scoopforge-deploy]]·[[commit-deploy-as-one-set]] 절차로 5개 런타임 파일을 `www/map/`에 업로드(테스트 파일 제외, 서버 데이터 불가침):

```
forge-core.js · forge-state.js · forge-ui.js · forge-draw.js · forge-app.js
```

그리고 `git push`.

- [ ] **Step 5: 스코어카드 개선이력 갱신**

[[scoopforge-scorecard-changelog]] 원칙에 따라 `forge-scorecard.html` 탐구/개선 이력에 "Gann 각도 지표 추가(레일 선택형·기본전략 미편입·cap 0.05)" 1줄 기록. 커밋:

```bash
git add map/forge-scorecard.html
git commit -m "docs(forge): 스코어카드에 Gann 각도 지표 추가 기록"
```

---

## Self-Review 결과

- **스펙 커버리지**: 설계 A(Gann) 전 항목 매핑 — 앵커 자동선택(Task1 `_domSwing`)·ATR 정규화(Task1 `_candATR`)·각도 7종(Task1)·bias(Task1)·드리프트 융합(Task2)·작도(Task5)·해설(Task6)·안전(기본전략 미편입 Task4-6, 백테스트 불변 Task7). 설계 B(패턴 감지)는 **별도 계획서**(후속) — 본 계획 범위 밖(스펙의 순서 원칙대로 Gann 먼저).
- **Placeholder 스캔**: 없음. 모든 코드 스텝에 실제 코드 포함. dirBias 위치는 grep으로 특정하도록 명시(정확한 배열 원소 문자열 제공).
- **타입 일관성**: `analyzeGann` 반환 키(`anchor{idx,price}`·`dir`·`unit`·`angles[{name,slope}]`·`oneOne`·`last`·`bias`)를 Task5(작도)·Task6(해설)에서 동일 사용. `_anGann(P, opts)` 시그니처 Task4 정의 → Task5·6에서 `_anGann(price, n.params)`로 일치 호출. `gannDrift`·`_gn2` 명명 Task2 내 일관.
- **범위**: Gann 단일 지표 — 단일 구현 계획으로 적정.
