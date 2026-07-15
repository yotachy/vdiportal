# 차트 패턴 블록 (blockType `pattern`) + 구조·패턴 성격 태그 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** forge에 고전 차트 패턴 감지 지표 `pattern`(헤드앤숄더·역H&S·불/베어 플래그)을 추가한다 — `detectSwings` 위에서 패턴을 탐지해 감지 시에만 모양을 자동작도하고 방향 bias를 예측 엔진에 융합한다. 아울러 structure·elliott·smc·pattern 4종에 "구조·패턴" 성격 태그를 레일에 표시한다.

**Architecture:** 기존 패턴/구조 감지 지표 `structure`(BOS/CHoCH)·`smc`(FVG/OB)와 **동일한 계보**로 구현한다 — 엔진에 순수 함수 `analyzePattern`(감지 결과 + 연속 bias, 미감지 시 0), `run()`에서 드리프트 항 1개(`bias × trendScale × 0.06 × DW`), 감지 시에만 그리는 `_drawPatternLayers`(smc의 early-return + Elliott의 사선 넥라인 패턴 재사용), 2패널 신호판정 노출(`order` 배열 등록). **기본전략 미편입** → 백테스트/회고 베이스라인 불변.

**Tech Stack:** 순수 HTML5·CSS3·바닐라 JS(무빌드). 엔진 UMD(`forge-core.js`), 단위테스트 `node --test forge-core.test.js`(현 222케이스). 여러 classic script 전역 스코프 공유(로드 순서 core→state→ui→draw→app 고정).

## Global Constraints

스펙(`docs/superpowers/specs/2026-07-15-chart-geometry-patterns-design.md` 설계 B·C)의 불가침 제약 — 모든 태스크에 암묵 적용:

- **순수 추가**: 기존 31종 지표 로직·`run()` 융합 수식·회고 인프라(`map/backtest/`)를 **한 줄도 수정 금지**. `pattern`은 `_drifts`에 **항 1개만** 추가.
- **±0.28 총캡 유지 · cap 보수적**: `pattern` 드리프트 계수 `0.06`(structure 0.08·smc 0.07보다 작게 — 차트패턴은 오탐 잦음). 이중계상 금지 — combine series는 **zeros**(smc 선례), 방향은 드리프트로만.
- **기본전략 미편입**: `seedDefaultStrategy`(forge-ui.js)에 pattern을 **넣지 않는다** → 레일 선택형 → 백테스트/회고 베이스라인 불변.
- **테스트 추가만**: `forge-core.test.js`(현 222케이스) 기존 케이스 수정 금지, 전부 그린 유지.
- **primitive 재사용**: 스윙은 `detectSwings(arr, sens)` 재사용(forge-core.js 내부, 호이스팅). 바퀴 재발명 금지.
- **감지 인터페이스 = structure/smc와 동일**: 연속 bias(미감지 0) + 감지 시에만 작도(smc `if(!ok)return` 선례). 별도 "occurrence 전용" 인터페이스 신설 금지.
- **로드 순서·전역 스코프**: `defer`/`async` 금지, 중복 최상위 선언 금지.
- **파라미터 캐시키**: `_anPattern` 래퍼는 캐시키에 `JSON.stringify(opts)` 포함(stale 방지).
- **디자인 금지**: 좌측 세로 컬러 accent line 절대 금지. 패턴 작도는 캔버스 오버레이(넥라인 사선·채널선·마커)만.
- **동반 배포**: 변경 파일 `forge-core.js`·`forge-state.js`·`forge-ui.js`·`forge-draw.js`·`forge-app.js`·`forge.css`(성격 태그 스타일)를 한 세트로 cafe24 `www/map/` 배포. `forge-core.test.js` 배포 제외. 서버 데이터 파일 불가침.

## 파일 구조 (변경 대상)

| 파일 | 책임 | 변경 |
|---|---|---|
| `map/forge-core.js` | `detectPatterns`·`analyzePattern`·`patternSteps`·run 드리프트·export | 수정 |
| `map/forge-core.test.js` | 단위테스트 | 추가만 |
| `map/forge-state.js` | BLOCK_DEFS·IND_TIERS Lv4·`PATTERN_NATURE` Set | 수정 |
| `map/forge-ui.js` | `_anPattern`·`_nodeBias`·renderParams·RAIL_SHORT·GAUGE_TYPES·성격 태그(rowHTML) | 수정 |
| `map/forge.css` | `.ir-tag` 성격 태그 스타일 | 수정 |
| `map/forge-draw.js` | `_drawPatternLayers`·dispatch·EV_COLORS/LABEL/order·INDICATOR_INFO·TUNE_TYPES·EV_DEFAULT_VISIBLE | 수정 |
| `map/forge-app.js` | BTLABEL·nodeExpert·analysisSteps | 수정 |

---

## Task 1: 탐지 엔진 — `detectPatterns` + 보조함수 (TDD)

**Files:**
- Modify: `map/forge-core.js` (`analyzeStructure` 인근 ~L1503 이전, `detectSwings`(L902) 뒤 아무 곳)
- Test: `map/forge-core.test.js`

**Interfaces:**
- Consumes: `detectSwings(arr, sens) → [{idx,price}]`(forge-core.js 내부, 호이스팅).
- Produces:
  - `detectPatterns(price, opts) → { pattern, label, dir, confidence, confirmed, geom }|null`
    - `pattern ∈ {"headshoulder","invhead","bullflag","bearflag"}`, `dir ∈ {−1,+1}`, `confidence ∈ [0,1]`, `confirmed:bool`.
    - `geom`: hns면 `{kind:"hns", head, shoulders:[a,e], neckline:[b,d]}`(각 `{idx,price}`), flag면 `{kind:"flag", pole:[from,to], hi, lo}`.
  - 미감지 시 `null`.

- [ ] **Step 1: 실패하는 테스트 작성**

`map/forge-core.test.js`의 gann 테스트 뒤(파일 끝 부근)에 헬퍼 + 6개 테스트 추가:

```js
// 차트 패턴 합성 데이터 헬퍼
function _pseg(from, to, n) { const a = []; for (let i = 1; i <= n; i++) a.push(from + (to - from) * i / n); return a; }
function _hnsUp() {   // bearish 헤드앤숄더 (좌어깨110·머리122·우어깨110·넥라인100 → 90 이탈)
  let p = [100];
  p = p.concat(_pseg(100, 110, 6), _pseg(110, 100, 6), _pseg(100, 122, 8), _pseg(122, 100, 8), _pseg(100, 110, 6), _pseg(110, 90, 8));
  return p;
}
function _invHns() {  // bullish 역H&S (거울상)
  let p = [100];
  p = p.concat(_pseg(100, 90, 6), _pseg(90, 100, 6), _pseg(100, 78, 8), _pseg(78, 100, 8), _pseg(100, 90, 6), _pseg(90, 110, 8));
  return p;
}
function _bullFlag() { // 강한 상승 폴(40) + 얕은 조정 채널 + 상향 돌파
  let p = [100];
  p = p.concat(_pseg(100, 140, 10), _pseg(140, 133, 5), _pseg(133, 137, 4), _pseg(137, 130, 5), _pseg(130, 148, 8));
  return p;
}
function _bearFlag() { // 거울상
  let p = [100];
  p = p.concat(_pseg(100, 60, 10), _pseg(60, 67, 5), _pseg(67, 63, 4), _pseg(63, 70, 5), _pseg(70, 52, 8));
  return p;
}
function _flatNoise() { // 규칙적 진동 — 패턴 없음
  const p = []; for (let i = 0; i < 60; i++) p.push(100 + 5 * Math.sin(i / 3) + 2 * Math.sin(i / 1.7)); return p;
}

test("detectPatterns: 헤드앤숄더 → headshoulder(하락)", () => {
  const r = ForgeCore.detectPatterns(_hnsUp(), {});
  assert.ok(r && r.pattern === "headshoulder", `expected headshoulder, got ${r && r.pattern}`);
  assert.strictEqual(r.dir, -1);
});
test("detectPatterns: 역헤드앤숄더 → invhead(상승)", () => {
  const r = ForgeCore.detectPatterns(_invHns(), {});
  assert.ok(r && r.pattern === "invhead", `expected invhead, got ${r && r.pattern}`);
  assert.strictEqual(r.dir, 1);
});
test("detectPatterns: 불 플래그 → bullflag(상승)", () => {
  const r = ForgeCore.detectPatterns(_bullFlag(), {});
  assert.ok(r && r.pattern === "bullflag", `expected bullflag, got ${r && r.pattern}`);
  assert.strictEqual(r.dir, 1);
});
test("detectPatterns: 베어 플래그 → bearflag(하락)", () => {
  const r = ForgeCore.detectPatterns(_bearFlag(), {});
  assert.ok(r && r.pattern === "bearflag", `expected bearflag, got ${r && r.pattern}`);
  assert.strictEqual(r.dir, -1);
});
test("detectPatterns: 규칙 진동 노이즈 → null(오탐 없음)", () => {
  assert.strictEqual(ForgeCore.detectPatterns(_flatNoise(), {}), null);
});
test("detectPatterns: 데이터 부족(<30) → null", () => {
  assert.strictEqual(ForgeCore.detectPatterns([1, 2, 3, 4, 5], {}), null);
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `node --test map/forge-core.test.js`
Expected: FAIL — `ForgeCore.detectPatterns is not a function`.

- [ ] **Step 3: 탐지 함수 구현**

`map/forge-core.js`의 `detectSwings` 함수(L902~) 바로 뒤에 삽입:

```js
function _pClamp01(x) { return Math.max(0, Math.min(1, x)); }
function _pLineAt(p1, p2, x) { const dx = (p2.idx - p1.idx) || 1; return p1.price + (p2.price - p1.price) * (x - p1.idx) / dx; }
function _pUnit(price, per) {
  const P = price.length; let s = 0, k = 0;
  for (let i = Math.max(1, P - per); i < P; i++) { s += Math.abs(price[i] - price[i - 1]); k++; }
  return k ? s / k : Math.max(1e-9, Math.abs(price[P - 1]) * 0.01);
}
// 헤드앤숄더 / 역H&S — 최근 스윙에서 5-스윙 창(어깨-머리-어깨) 스캔
function _hnsDetect(sw, price, opts) {
  const n = sw.length, P = price.length; if (n < 5) return null;
  const minConf = opts.minConf != null ? opts.minConf : 0.5;
  const lo = Math.max(0, n - 8);
  for (let j = n - 1; j >= lo + 4; j--) {
    const a = sw[j - 4], b = sw[j - 3], c = sw[j - 2], d = sw[j - 1], e = sw[j];
    const span = Math.max(1e-9, Math.max(a.price, c.price, e.price) - Math.min(b.price, d.price));
    // 하락 H&S: a·c·e 고점 / b·d 저점 / c(머리) 최고
    if (a.price > b.price && c.price > b.price && c.price > d.price && e.price > d.price && c.price > a.price && c.price > e.price) {
      const ls = a.price, rs = e.price, head = c.price;
      const sym = 1 - Math.abs(ls - rs) / span, neck = 1 - Math.abs(b.price - d.price) / span, prom = Math.min((head - Math.max(ls, rs)) / span, 1);
      if (prom >= 0.15 && sym >= 0.6 && neck >= 0.5) {
        const conf = _pClamp01(0.4 * sym + 0.3 * neck + 0.3 * prom);
        if (conf >= minConf) { const nline = _pLineAt(b, d, P - 1); return { pattern: "headshoulder", label: "헤드앤숄더", dir: -1, confidence: conf, confirmed: price[P - 1] < nline, geom: { kind: "hns", head: c, shoulders: [a, e], neckline: [b, d] } }; }
      }
    }
    // 상승 역H&S: a·c·e 저점 / b·d 고점 / c(머리) 최저
    if (a.price < b.price && c.price < b.price && c.price < d.price && e.price < d.price && c.price < a.price && c.price < e.price) {
      const ls = a.price, rs = e.price, head = c.price;
      const sym = 1 - Math.abs(ls - rs) / span, neck = 1 - Math.abs(b.price - d.price) / span, prom = Math.min((Math.min(ls, rs) - head) / span, 1);
      if (prom >= 0.15 && sym >= 0.6 && neck >= 0.5) {
        const conf = _pClamp01(0.4 * sym + 0.3 * neck + 0.3 * prom);
        if (conf >= minConf) { const nline = _pLineAt(b, d, P - 1); return { pattern: "invhead", label: "역헤드앤숄더", dir: 1, confidence: conf, confirmed: price[P - 1] > nline, geom: { kind: "hns", head: c, shoulders: [a, e], neckline: [b, d] } }; }
      }
    }
  }
  return null;
}
// 불/베어 플래그 — 강한 폴 + 얕은 역방향 조정 채널
function _flagDetect(sw, price, opts) {
  const n = sw.length, P = price.length; if (n < 4) return null;
  const minConf = opts.minConf != null ? opts.minConf : 0.5;
  const unit = _pUnit(price, opts.atrPeriod || 14), poleMin = (opts.poleMin || 3) * unit;
  for (let k = n - 1; k >= Math.max(1, n - 6); k--) {
    const from = sw[k - 1], to = sw[k], pole = to.price - from.price, poleAbs = Math.abs(pole);
    if (poleAbs < poleMin) continue;
    const dir = pole > 0 ? 1 : -1;
    const consol = sw.slice(k, n - 1);   // 폴 정점 ... (마지막 레그=돌파 후보 제외)
    if (consol.length < 2) continue;
    const cp = consol.map(p => p.price), fHi = Math.max(...cp), fLo = Math.min(...cp), range = fHi - fLo;
    const retrace = dir > 0 ? (to.price - fLo) : (fHi - to.price), retraceFrac = retrace / poleAbs;
    if (range <= 0 || retraceFrac > 0.6 || range > poleAbs * 0.5) continue;
    const tight = 1 - range / (poleAbs * 0.5), shallow = 1 - retraceFrac / 0.6, strength = Math.min(poleAbs / poleMin - 1, 1);
    const conf = _pClamp01(0.4 * tight + 0.3 * shallow + 0.3 * Math.max(0, strength));
    if (conf >= minConf) { const brk = dir > 0 ? price[P - 1] > fHi : price[P - 1] < fLo; return { pattern: dir > 0 ? "bullflag" : "bearflag", label: dir > 0 ? "불 플래그" : "베어 플래그", dir, confidence: conf, confirmed: brk, geom: { kind: "flag", pole: [from, to], hi: fHi, lo: fLo } }; }
  }
  return null;
}
function detectPatterns(price, opts) {
  opts = opts || {};
  const P = Array.isArray(price) ? price.length : 0; if (P < 30) return null;
  const sw = detectSwings(price, opts.swing || 0.03); if (sw.length < 4) return null;
  const cands = [_hnsDetect(sw, price, opts), _flagDetect(sw, price, opts)].filter(Boolean);
  if (!cands.length) return null;
  cands.sort((x, y) => (Number(y.confirmed) - Number(x.confirmed)) || (y.confidence - x.confidence));
  return cands[0];
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `node --test map/forge-core.test.js`
Expected: PASS — 신규 6개 포함 228 전부 통과, 기존 222 무회귀.

- [ ] **Step 5: 커밋**

```bash
git add map/forge-core.js map/forge-core.test.js
git commit -m "feat(forge): 차트 패턴 탐지 엔진(detectPatterns — H&S/역H&S/flag) + 단위테스트"
```

---

## Task 2: 엔진 — `analyzePattern`·`patternSteps` + run() 드리프트 + evalBlocks (TDD)

**Files:**
- Modify: `map/forge-core.js` (탐지함수 뒤; evalBlocks smc 케이스 L294 인근; run() smcDrift L1882 인근; `_drifts` L1943; `_dirBiasList` L1951; export)
- Test: `map/forge-core.test.js`

**Interfaces:**
- Consumes: `detectPatterns`(Task 1), `trendProfileForTF`(→`_prof`), `DW`.
- Produces:
  - `analyzePattern(data, opts) → { detected, pattern, label, dir, confidence, confirmed, geom, bias }`(미감지 시 `detected:null, bias:0`).
  - `patternSteps(res) → [{k,v}×3]`.
  - pattern 노드가 그래프에 있으면 예측 `prediction.target`이 달라진다(감지 데이터일 때).

- [ ] **Step 1: 실패하는 테스트 작성**

Task 1 테스트 뒤에 추가:

```js
test("analyzePattern: 헤드앤숄더 감지 시 bias<0, 미감지 시 0", () => {
  const r = ForgeCore.analyzePattern({ price: _hnsUp() }, {});
  assert.ok(r.detected && r.pattern === "headshoulder", "H&S 감지");
  assert.ok(r.bias < 0, `bias<0, got ${r.bias}`);
  const r2 = ForgeCore.analyzePattern({ price: _flatNoise() }, {});
  assert.strictEqual(r2.detected, null);
  assert.strictEqual(r2.bias, 0);
});
test("patternSteps: 3줄(감지·미감지 모두)", () => {
  assert.strictEqual(ForgeCore.patternSteps(ForgeCore.analyzePattern({ price: _hnsUp() }, {})).length, 3);
  assert.strictEqual(ForgeCore.patternSteps(ForgeCore.analyzePattern({ price: _flatNoise() }, {})).length, 3);
});
test("run: 차트 패턴 노드가 예측 반영(감지 데이터)", () => {
  const price = _hnsUp(), candle = price.map((c, i) => ({ o: i ? price[i - 1] : c, h: c * 1.005, l: c * 0.995, c }));
  const base = { nodes: [{ id: "p", kind: "block", blockType: "price" }, { id: "pr", kind: "block", blockType: "predict" }], edges: [{ from: "p", to: "pr" }] };
  const r0 = ForgeCore.run(base, { price, candle }, { futW: 24 });
  const g = { nodes: base.nodes.concat([{ id: "pt", kind: "block", blockType: "pattern" }]), edges: base.edges.concat([{ from: "pt", to: "pr" }]) };
  const r1 = ForgeCore.run(g, { price, candle }, { futW: 24 });
  assert.ok(Math.abs(r1.prediction.target - r0.prediction.target) > 1e-9, "pattern 예측 반영");
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `node --test map/forge-core.test.js`
Expected: FAIL — `analyzePattern is not a function`.

- [ ] **Step 3: `analyzePattern` + `patternSteps` 구현**

Task 1의 `detectPatterns` 함수 바로 뒤에 삽입:

```js
function analyzePattern(data, opts) {
  opts = opts || {};
  const price = (data && data.price) || ((data && data.candle) || []).map(c => c.c);
  const det = detectPatterns(price, opts);
  if (!det) return { detected: null, pattern: "none", label: "", dir: 0, confidence: 0, confirmed: false, geom: null, bias: 0 };
  const strength = det.confirmed ? 1 : 0.5;
  const bias = Math.max(-1, Math.min(1, det.dir * det.confidence * strength));
  return { detected: det, pattern: det.pattern, label: det.label, dir: det.dir, confidence: det.confidence, confirmed: det.confirmed, geom: det.geom, bias };
}
function patternSteps(res) {
  res = res || {};
  if (!res.detected) return [
    { k: "스캔", v: "고전 차트 패턴(H&S·역H&S·깃발) 탐지" },
    { k: "결과", v: "감지된 패턴 없음" },
    { k: "방향", v: "중립 — 기여 없음" },
  ];
  const conf = Math.round((res.confidence || 0) * 100), dirTxt = res.dir > 0 ? "상승" : "하락";
  return [
    { k: "스캔", v: "고전 차트 패턴 탐지" },
    { k: "감지", v: res.label + " · 신뢰도 " + conf + "%" + (res.confirmed ? " (돌파 확정)" : " (형성 중)") },
    { k: "방향", v: dirTxt + " " + (res.confirmed ? "강" : "약") },
  ];
}
```

- [ ] **Step 4: UMD export에 추가**

`map/forge-core.js`의 api `return { ... }` 객체(analyzeGann/gannSteps 인근)에 추가:

```js
    detectPatterns, analyzePattern, patternSteps,
```

- [ ] **Step 5: evalBlocks에 pattern 케이스 추가 (combine zeros)**

`map/forge-core.js`의 evalBlocks smc 케이스(L294 `} else if (n.blockType === "smc") {`) 바로 앞 또는 뒤에 삽입:

```js
      } else if (n.blockType === "pattern") {
        values[id] = (ins[0] || data.price).map(() => 0);
```

- [ ] **Step 6: run()에 patternDrift 추가**

`map/forge-core.js`의 smcDrift 정의(L1880~1882 `const smcDrift = ...`) 바로 뒤에 삽입:

```js
    const _ptn = (graph.nodes || []).find(nd => nd.kind === "block" && nd.blockType === "pattern");
    const _pt2 = _ptn ? analyzePattern(data, {}) : null;
    const patternDrift = _pt2 ? _pt2.bias * _prof.trendScale * 0.06 * DW("pattern") : 0;   // 차트 패턴 방향(±6%·감지 시만)
```

- [ ] **Step 7: `_drifts`·`_dirBiasList`에 편입**

`_drifts` 배열(L1943, `gannDrift` 뒤)에 `patternDrift` 추가:

```js
    const _drifts = [maDrift, fibDrift, ewDrift, rsiDrift, volDrift, bbDrift, macdDrift, adxDrift, vpDrift, icDrift, stDrift, smcDrift, cyDrift, vwDrift, stDrift2, stochDrift, pivotDrift, psarDrift, keltnerDrift, donchianDrift, cciDrift, williamsDrift, rocDrift, aoDrift, aroonDrift, mfiDrift, cmfDrift, gannDrift, patternDrift];
```

`_dirBiasList`(L1951)와 그 짝(grep `_smc && _smc.bias`로 나머지 1곳 확인)의 `_smc && _smc.bias` 인근에 `_pt2 && _pt2.bias` 추가:

```bash
grep -n "_smc && _smc.bias" map/forge-core.js
```
각 매치 배열에 `, _pt2 && _pt2.bias` 추가.

- [ ] **Step 8: 테스트 통과 확인**

Run: `node --test map/forge-core.test.js`
Expected: PASS — 신규 포함 231 전부 통과, 기존 222 무회귀.

- [ ] **Step 9: 커밋**

```bash
git add map/forge-core.js map/forge-core.test.js
git commit -m "feat(forge): analyzePattern 융합(run 드리프트 cap 0.06·combine zeros) + patternSteps"
```

---

## Task 3: 지표 등록 + 성격 Set — forge-state.js

**Files:**
- Modify: `map/forge-state.js` (BLOCK_DEFS ~L204; IND_TIERS L227~232; `PATTERN_NATURE` 신설)

**Interfaces:**
- Produces: 레일에 `pattern` 블록(Lv4), `PATTERN_NATURE` Set(structure·elliott·smc·pattern).

- [ ] **Step 1: BLOCK_DEFS에 pattern 정의**

`map/forge-state.js`의 gann 정의(또는 smc 정의) 인근에 삽입:

```js
    { type: "pattern",   label: "차트 패턴",    kind: "block", params: { swing: 3 } },
```

- [ ] **Step 2: IND_TIERS Lv4에 pattern 배치**

`map/forge-state.js` L230의 Lv4 types 배열 끝에 `"pattern"` 추가:

```js
    { lv: 4, name: "고급·심화",  types: ["elliott", "smc", "cycle", "phasefold", "roc", "ao", "cmf", "pattern"] },
```

- [ ] **Step 3: `PATTERN_NATURE` Set 신설**

`map/forge-state.js`의 `NEW_INDICATORS` Set(L233) 정의 바로 뒤에 삽입:

```js
  const PATTERN_NATURE = new Set(["structure", "elliott", "smc", "pattern"]);   // '구조·패턴' 성격 태그 대상(레일 표기)
```

- [ ] **Step 4: `node --check` + 커밋**

Run: `node --check map/forge-state.js` → 통과.
Run: `node --test map/forge-core.test.js` → 231 그린(무영향).
```bash
git add map/forge-state.js
git commit -m "feat(forge): pattern 등록(BLOCK_DEFS·IND_TIERS Lv4) + PATTERN_NATURE 성격 Set"
```

---

## Task 4: UI 배선 + 성격 태그 — forge-ui.js·forge.css

**Files:**
- Modify: `map/forge-ui.js` (RAIL_SHORT L4; `renderIndRail` rowHTML L11; GAUGE_TYPES L364; `_anPattern` 신설 `_anSMC` 인근; `_nodeBias` switch L~500; renderParams)
- Modify: `map/forge.css` (`.ir-tag` 규칙)

**Interfaces:**
- Consumes: `ForgeCore.analyzePattern`, `_anGet`, `PATTERN_NATURE`(Task 3), `numRow`.
- Produces: `_anPattern(P, opts)`(캐시), `_nodeBias` pattern bias, 레일 성격 태그, 파라미터 UI.

- [ ] **Step 1: RAIL_SHORT + GAUGE_TYPES**

`map/forge-ui.js` L4 RAIL_SHORT에 `pattern: "차트패턴"`, L364 GAUGE_TYPES 배열 끝에 `"pattern"` 추가.

- [ ] **Step 2: `_anPattern` 래퍼 (params 캐시키)**

`map/forge-ui.js`의 `_anSMC` 함수 인근에 삽입:

```js
  function _anPattern(P, opts) {
    const o = opts || {};
    return _anGet(P, "Pattern" + JSON.stringify(o), () => ForgeCore.analyzePattern({ candle: (_fcLastData && _fcLastData.candle) || (typeof currentData === "function" && currentData().candle) || [], price: P }, o));
  }
```

- [ ] **Step 3: `_nodeBias` pattern 케이스**

`map/forge-ui.js`의 `_nodeBias` switch의 `case "smc":` 인근에 삽입:

```js
      case "pattern": return _anPattern(P, { swing: ((p.swing != null ? p.swing : 3) / 100) }).bias;
```

- [ ] **Step 4: renderParams pattern 파라미터 UI**

`map/forge-ui.js` renderParams의 structure/pivot 파라미터 블록 인근에 삽입:

```js
    if (n.blockType === "pattern") rows.push(numRow("swing", "스윙 민감도(%)", (n.params && n.params.swing) ?? 3));
```

- [ ] **Step 5: 레일 성격 태그 (rowHTML)**

`map/forge-ui.js`의 `renderIndRail` 내 `rowHTML`(L11), `<span class="ir-lbl">` 여는 태그 직후·`${esc(nm)}` 앞에 삽입:

```js
${PATTERN_NATURE.has(t) ? '<span class="ir-tag" title="구조·패턴 감지 지표">구조·패턴</span>' : ''}
```

즉 해당 부분이 `...<span class="ir-lbl">${PATTERN_NATURE.has(t) ? '<span class="ir-tag" title="구조·패턴 감지 지표">구조·패턴</span>' : ''}${esc(nm)}</span>...` 형태가 되도록 한다.

- [ ] **Step 6: forge.css `.ir-tag` 스타일**

`map/forge.css`의 기존 `.ind-rail .ir-new` 규칙(L131 인근) 뒤에 삽입:

```css
.ind-rail .ir-tag { display:inline-block; font-size:8px; font-weight:800; letter-spacing:-.02em; line-height:1; padding:2px 4px; margin-right:4px; border-radius:4px; color:var(--gold); background:color-mix(in srgb, var(--gold) 16%, transparent); vertical-align:middle; }
```

- [ ] **Step 7: `node --check` + 커밋**

Run: `node --check map/forge-ui.js` → 통과.
Run: `node --test map/forge-core.test.js` → 231 그린.
```bash
git add map/forge-ui.js map/forge.css
git commit -m "feat(forge): pattern UI 배선(_anPattern·_nodeBias·renderParams) + 구조·패턴 성격 태그"
```

---

## Task 5: 작도 + 2패널 노출 — forge-draw.js

**Files:**
- Modify: `map/forge-draw.js` (`_drawPatternLayers` 신설 `_drawSmcLayers`(L2358) 인근; dispatch smc 분기(L2664) 인근; EV_COLORS L1055; EV_LABEL L1090; EV_DEFAULT_VISIBLE L1043; INDICATOR_INFO L1068 인근; `evIndicatorNodes` order L1092; TUNE_TYPES L1105)

**Interfaces:**
- Consumes: `_anPattern`(Task 4), `_mainGeo`(g), `fiToX`, `toY`, `_evLabel`, `_skReady`, `CDASH`, `CW`, `EV_LABEL`, `_evReveal`, `_playing`, `_drawThis`, `cc`, `col`, `P`, `wS`.
- Produces: pattern 감지 시 4패널 작도 + 2패널 신호리스트 노출.

- [ ] **Step 1: `_drawPatternLayers` 함수 추가**

`map/forge-draw.js`의 `_drawSmcLayers`(L2358~) 함수 바로 뒤에 삽입:

```js
  function _drawPatternLayers(c, pt, M) {
    c.save();
    const { fiToX, pToY, nowFi, fiMin = 0, reveal = Infinity, xRight } = M;
    if (!pt || !pt.detected || !pt.geom) { c.restore(); return; }
    const xR = (xRight != null ? xRight : fiToX(nowFi));
    const g = pt.geom, up = pt.dir > 0, col = up ? "#46c28e" : "#e06a6a";
    const X = p => fiToX(Math.max(fiMin, p.idx)), Y = p => pToY(p.price);
    if (g.kind === "hns") {
      if (reveal >= 1) [g.shoulders[0], g.head, g.shoulders[1]].forEach(p => { const x = X(p), y = Y(p); if (isFinite(x) && isFinite(y)) { c.fillStyle = col; c.beginPath(); c.arc(x, y, 3, 0, Math.PI * 2); c.fill(); } });
      if (reveal >= 2) {
        const b = g.neckline[0], d = g.neckline[1], x0 = X(b), y0 = Y(b), yR = pToY(b.price + (d.price - b.price) * ((nowFi - b.idx) / ((d.idx - b.idx) || 1)));
        if ([x0, y0, xR, yR].every(isFinite)) { c.strokeStyle = col; c.setLineDash(CDASH.std); c.beginPath(); c.moveTo(x0, y0); c.lineTo(xR, yR); c.stroke(); c.setLineDash([]); }
        if (_skReady()) _evLabel(c, pt.label + (pt.confirmed ? " ✓" : ""), xR - 4, Y(g.head), col, "right");
      }
    } else if (g.kind === "flag") {
      if (reveal >= 1) { const f = g.pole[0], t = g.pole[1], xf = X(f), yf = Y(f), xt = X(t), yt = Y(t); if ([xf, yf, xt, yt].every(isFinite)) { c.strokeStyle = col; c.lineWidth = CW.bold; c.beginPath(); c.moveTo(xf, yf); c.lineTo(xt, yt); c.stroke(); c.lineWidth = CW.base; } }
      if (reveal >= 2) {
        const xt = X(g.pole[1]);
        [g.hi, g.lo].forEach(v => { const y = pToY(v); if (isFinite(y) && isFinite(xt)) { c.strokeStyle = col; c.setLineDash([3, 3]); c.beginPath(); c.moveTo(xt, y); c.lineTo(xR, y); c.stroke(); c.setLineDash([]); } });
        if (_skReady()) _evLabel(c, pt.label + (pt.confirmed ? " ✓" : ""), xR - 4, pToY(g.hi), col, "right");
      }
    }
    c.restore();
  }
```

- [ ] **Step 2: dispatch 분기 추가**

`map/forge-draw.js`의 smc dispatch 분기(L2664 `} else if (n.blockType === "smc") {`) 바로 뒤에 삽입:

```js
        } else if (n.blockType === "pattern") {
          const pt = _anPattern(price, { swing: ((n.params && n.params.swing) != null ? n.params.swing : 3) / 100 });
          if (_drawThis) _drawPatternLayers(cc, pt, { fiToX, pToY: v => toY(v), nowFi: P - 1, fiMin: wS, reveal: _playing ? (_evReveal[n.id] || 0) : Infinity, xRight: g.padX + g.plotW });
          legend.push({ col, t: EV_LABEL.pattern, _key: n.blockType });
```

- [ ] **Step 3: EV_COLORS·EV_LABEL·EV_DEFAULT_VISIBLE·INDICATOR_INFO·TUNE_TYPES**

- L1055 EV_COLORS에 `pattern: "#e6a3c8"` 추가.
- L1090 EV_LABEL에 `pattern: "차트 패턴(H&S·깃발)"` 추가.
- L1043 EV_DEFAULT_VISIBLE 배열 끝에 `"pattern"` 추가.
- L1068 INDICATOR_INFO(smc 인근)에 삽입:
```js
    pattern: { p: "고전 차트 패턴(H&S·깃발) 자동 감지.", d: "스윙 구조에서 헤드앤숄더·역H&S·불/베어 플래그를 탐지(신뢰도 스코어).", h: "감지 시 반전(H&S)·지속(플래그) 방향. 넥라인/채널 돌파=확정(강), 형성 중=약. 미감지 시 침묵." },
```
- L1105 TUNE_TYPES에 `["pattern", "차트 패턴"]` 추가.

- [ ] **Step 4: `evIndicatorNodes` order 배열에 pattern 추가 (2패널 신호리스트 노출)**

`map/forge-draw.js` L1092 `evIndicatorNodes`의 `order` 배열의 `"smc"` 인근에 `"pattern"` 추가(예: `..., "structure", "atr", "smc", "pattern", "cycle", ...`).

- [ ] **Step 5: `node --check` + 커밋**

Run: `node --check map/forge-draw.js` → 통과.
Run: `node --test map/forge-core.test.js` → 231 그린.
```bash
git add map/forge-draw.js
git commit -m "feat(forge): pattern 작도(_drawPatternLayers 넥라인/채널·감지 시만) + 2패널 order + 색/라벨/해설"
```

---

## Task 6: 해설·라벨 — forge-app.js

**Files:**
- Modify: `map/forge-app.js` (BTLABEL L275; nodeExpert switch L~453; analysisSteps L~315 블록)

**Interfaces:**
- Consumes: `_anPattern`(Task 4), `ForgeCore.patternSteps`.
- Produces: 2패널 신호리스트 이름·note, nodeExpert 팩트, 분석 재생 단계.

- [ ] **Step 1: BTLABEL에 pattern 라벨**

`map/forge-app.js` L275 BTLABEL 맵에 `pattern: "차트 패턴"` 추가.

- [ ] **Step 2: nodeExpert pattern 케이스**

`map/forge-app.js`의 nodeExpert switch의 `case "smc":` 인근에 삽입:

```js
      case "pattern": {
        if (!Array.isArray(P) || P.length < 30) return ["데이터 없음"];
        const pt = _anPattern(P, { swing: ((n.params && n.params.swing) != null ? n.params.swing : 3) / 100 });
        if (!pt.detected) return ["감지된 패턴 없음"];
        const conf = Math.round(pt.confidence * 100);
        f.push("감지: " + pt.label + " (" + (pt.dir > 0 ? "상승" : "하락") + " · " + (pt.confirmed ? "돌파 확정" : "형성 중") + ")");
        f.push("신뢰도 " + conf + "% · 방향 bias " + pt.bias.toFixed(2));
        f.push(pt.confirmed ? "넥라인/채널 돌파 — 방향 유효" : "돌파 대기 — 약한 기여");
        return f;
      }
```

- [ ] **Step 3: analysisSteps pattern 분기**

`map/forge-app.js`의 analysisSteps smc 분기 인근에 삽입:

```js
    if (n.blockType === "pattern" && Array.isArray(price) && price.length >= 30) {
      const pt = _anPattern(price, { swing: ((n.params && n.params.swing) != null ? n.params.swing : 3) / 100 });
      const texts = ForgeCore.patternSteps(pt).map(s => s.k + " — " + s.v);
      return texts.map((text, i) => ({ text, layer: [1, 2, 2][i] }));
    }
```

- [ ] **Step 4: `node --check` + 커밋**

Run: `node --check map/forge-app.js` → 통과.
Run: `node --test map/forge-core.test.js` → 231 그린.
```bash
git add map/forge-app.js
git commit -m "feat(forge): pattern 해설(nodeExpert·analysisSteps·BTLABEL) — 2패널 감지 판정"
```

---

## Task 7: 검증 + 배포

- [ ] **Step 1: 전체 단위테스트 그린**

Run: `node --test map/forge-core.test.js`
Expected: PASS — 신규 9개(detect 6 + analyze/steps/run 3) 포함 231, 기존 222 무회귀.

- [ ] **Step 2: 백테스트 베이스라인 불변 확인**

```bash
git diff --name-only <BASE> HEAD -- map/backtest/ | head
```
Expected: 출력 없음(backtest 파일 무변경) → 스코어카드 수치 불변. (`<BASE>` = Task 1 직전 커밋.)

- [ ] **Step 3: 헤드리스 시각검증**

[[headless-verify-wsl]] 절차로 forge.html 로드 → pattern 블록 추가 + **감지되는 합성 데이터**(예: `_hnsUp` 형태) 주입 → 웹분석 → **4패널에 넥라인/어깨·머리 마커(또는 flag 채널) 작도**·2패널 신호리스트에 `차트 패턴` 행 + `감지: 헤드앤숄더...` note·레일에 `구조·패턴` 태그(structure·elliott·smc·pattern) 확인. **미감지 데이터에선 침묵**(작도 없음) 확인. 라이브 실데이터 쓰기함수 금지([[headless-live-tests-readonly]]).

- [ ] **Step 4: cafe24 배포**

[[scoopforge-deploy]]([[commit-deploy-as-one-set]]) — 6개 파일을 `www/map/`에 lftp put(테스트 제외, 서버 데이터 불가침):
```
forge-core.js · forge-state.js · forge-ui.js · forge-draw.js · forge-app.js · forge.css
```
그리고 `git push`. 배포 후 curl로 HTTP 200 + `detectPatterns`/`_drawPatternLayers` 라이브 반영 확인.

- [ ] **Step 5: 스코어카드 기록**

`forge-scorecard.html` CHANGELOG 최상단에 도구 추가건으로 1건(`v:"—"`, 정확도 무주장): "차트 패턴 지표(H&S·역H&S·플래그) 추가 + 구조·패턴 성격 태그 — 레일 선택형·기본전략 미편입·baseline 불변". 커밋.

---

## Self-Review 결과

- **스펙 커버리지**: 설계 B(차트 패턴) 전 항목 — v1 라이브러리 4종(Task1)·detectSwings 재사용·연속 bias 인터페이스(Task2)·감지 시만 작도(Task5)·2패널 판정(Task5 order + Task6 note)·안전(기본전략 미편입 Task3-6·백테스트 불변 Task7). 설계 C(성격 태그) — PATTERN_NATURE Set(Task3) + 레일 태그·CSS(Task4).
- **Placeholder 스캔**: 없음. 모든 코드 스텝에 실제 코드. dirBiasList·backtest BASE는 grep/커밋으로 특정하도록 명시.
- **타입 일관성**: `analyzePattern` 반환({detected,pattern,label,dir,confidence,confirmed,geom,bias})을 Task5(작도 geom.kind/head/shoulders/neckline/pole/hi/lo)·Task6(label/dir/confirmed/confidence/bias) 동일 사용. `_anPattern(P, {swing})` 시그니처 Task4 정의 → Task5·6 동일 호출. `patternDrift`/`_pt2` 명명 일관.
- **범위**: 차트 패턴 단일 지표 + 성격 태그(밀접) — 단일 계획으로 적정.
