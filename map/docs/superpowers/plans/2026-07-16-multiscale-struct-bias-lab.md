# 다중스케일 구조 bias 검증 랩 Implementation Plan

> 연구/검증 랩. 최종 산출 = **판정(통과/기각)+근거 숫자**. TDD(헬퍼·플래그) + 실제 백테스트 실행·해석(컨트롤러). 통과 시에만 승격(별도).

**Goal:** 다중스케일 구조 bias가 단일 구조 bias보다 OOS 방향 정확도를 높이는지 격리 검증하고 풀 관문으로 판정.

**Global Constraints:** forge-core 기본 동작·baseline **불변**(추가는 기본-off `opts._msStruct` 1개, off일 때 표준과 완전 동일·244 테스트 그대로) · walk-forward 미래 미참조 · 판정은 순증분·자명규칙·BSS·LOSO·전후반 5관문 전부.

---

### Task 1: `multiscale-struct.js` 헬퍼 + 단위테스트

**Files:** Create `map/backtest/multiscale-struct.js`, `map/backtest/multiscale-struct.test.js`

**Produces:** `structTierBias(tier)→number` · `multiScaleStructBias(price, opts)→number∈[-1,1]`

- [ ] **Step 1: 실패 테스트**

```js
const test = require("node:test"), assert = require("node:assert");
const FC = require("../forge-core.js");
const { structTierBias, multiScaleStructBias } = require("./multiscale-struct.js");

test("structTierBias maps events/trend like analyzeStructure", () => {
  assert.strictEqual(structTierBias({ event: "BOS_up" }), 0.6);
  assert.strictEqual(structTierBias({ event: "CHoCH_down" }), -0.5);
  assert.strictEqual(structTierBias({ event: "none", trend: "up" }), 0.3);
  assert.strictEqual(structTierBias({ event: "none", trend: "none" }), 0);
});
test("multiScaleStructBias is significance-weighted, clamped, deterministic", () => {
  const price = FC.makeDemoSeries({ n: 200, seed: 9, period: 48 }).price;
  const b = multiScaleStructBias(price, {});
  assert.ok(b >= -1 && b <= 1);
  assert.strictEqual(multiScaleStructBias(price, {}), b);   // 결정성
  assert.strictEqual(multiScaleStructBias([1, 2, 3], {}), 0);   // 티어 없음
});
```

- [ ] **Step 2: 실패 확인** — `node --test map/backtest/multiscale-struct.test.js` (from repo root, or cwd=map/backtest) → FAIL(module 없음)

- [ ] **Step 3: 구현**

`map/backtest/multiscale-struct.js`:
```js
"use strict";
const FC = require("../forge-core.js");
function structTierBias(t) {
  return t.event === "BOS_up" ? 0.6 : t.event === "BOS_down" ? -0.6 : t.event === "CHoCH_up" ? 0.5 : t.event === "CHoCH_down" ? -0.5 : t.trend === "up" ? 0.3 : t.trend === "down" ? -0.3 : 0;
}
function multiScaleStructBias(price, opts) {
  const r = FC.collectStructure(price, opts || {}), ts = (r && r.tiers) || [];
  if (!ts.length) return 0;
  let sw = 0, sb = 0;
  for (const t of ts) { const w = t.significance || 0; sw += w; sb += w * structTierBias(t); }
  return sw ? Math.max(-1, Math.min(1, sb / sw)) : 0;
}
module.exports = { structTierBias, multiScaleStructBias };
```

- [ ] **Step 4: 통과 확인** → PASS
- [ ] **Step 5: 커밋** `test(backtest): 다중스케일 구조 bias 헬퍼 + 단위테스트`

---

### Task 2: `run()` 기본-off `_msStruct` 플래그 (line 2098 치환)

**Files:** Modify `forge-core.js:2097-2098`, `forge-core.test.js`(회귀)

**Produces:** `run(graph, data, {_msStruct:true})` → structure 드리프트만 다중스케일. 기본(off) 완전 동일.

- [ ] **Step 1: 회귀 테스트 추가**

`forge-core.test.js` 끝:
```js
test("run _msStruct flag: off is identical to default, on may differ", () => {
  const d = ForgeCore.makeDemoSeries({ n: 300, seed: 2, period: 50 });
  const g = ForgeCore.sampleGraph();
  const base = ForgeCore.run(g, { price: d.price, candle: d.candle }, { timeframe: "1day" });
  const off = ForgeCore.run(g, { price: d.price, candle: d.candle }, { timeframe: "1day", _msStruct: false });
  assert.strictEqual(off.verdict.score, base.verdict.score, "off == default");
  const on = ForgeCore.run(g, { price: d.price, candle: d.candle }, { timeframe: "1day", _msStruct: true });
  assert.ok(Number.isFinite(on.verdict.score), "on produces finite score");
});
```

- [ ] **Step 2: 실패 확인** — `node --test map/forge-core.test.js` → 마지막 assert 통과하나 on/off 로직 없음(off==base는 우연 통과 가능) → 주로 플래그 배선 확인용. 실패하지 않으면 Step 3에서 배선만 추가.

- [ ] **Step 3: 구현** — `forge-core.js:2097-2098` 교체:

```js
    const _struct = _stn ? analyzeStructure(price, { swing: ((_stn.params && _stn.params.swing) != null ? _stn.params.swing : 3) / 100 * (_prof.swingScale || 1) }) : null;
    const stDrift = _struct ? _struct.bias * _prof.trendScale * 0.08 * DW("structure") : 0;   // 시장구조 BOS/CHoCH 방향(±8%)
```
→
```js
    const _struct = _stn ? analyzeStructure(price, { swing: ((_stn.params && _stn.params.swing) != null ? _stn.params.swing : 3) / 100 * (_prof.swingScale || 1) }) : null;
    // 검증 전용(기본 off): structure 드리프트의 bias 원천을 다중스케일 티어 합성으로 치환. baseline 불변.
    let _stBias = _struct ? _struct.bias : 0;
    if (opts && opts._msStruct && _stn) { const r = collectStructure(price, {}); const ts = (r && r.tiers) || []; if (ts.length) { let sw = 0, sb = 0; for (const t of ts) { const w = t.significance || 0; const tb = t.event === "BOS_up" ? 0.6 : t.event === "BOS_down" ? -0.6 : t.event === "CHoCH_up" ? 0.5 : t.event === "CHoCH_down" ? -0.5 : t.trend === "up" ? 0.3 : t.trend === "down" ? -0.3 : 0; sw += w; sb += w * tb; } if (sw) _stBias = Math.max(-1, Math.min(1, sb / sw)); } }
    const stDrift = _struct ? _stBias * _prof.trendScale * 0.08 * DW("structure") : 0;   // 시장구조 BOS/CHoCH 방향(±8%)
```

- [ ] **Step 4: 통과 확인** — `node --test map/forge-core.test.js` → 244+1 pass, `# fail 0`. (off==default 항등 확인.)
- [ ] **Step 5: 커밋** `feat(core): run() 검증 전용 _msStruct 플래그(기본 off·baseline 불변)`

---

### Task 3: `multiscale-struct-lab.js` — walk-forward 캡처

**Files:** Create `map/backtest/multiscale-struct-lab.js`

`direction-lab.js` 구조 재사용(WARMUP 200·LOOKBACK 600·HORIZONS [3,5,10,20,40,60]·MAXH 60·STRIDE 10). 각 fixture·시점 t:
- 창 `w = {price: price.slice(s0,t+1), candle: candle.slice(s0,t+1)}`.
- `single = FC.analyzeStructure(w.price,{swing:0.03}).bias` · `ms = multiScaleStructBias(w.price,{})`.
- `engBase = FC.run(g, w, {timeframe:"1day"}).verdict.score` · `engMs = FC.run(g, w, {timeframe:"1day", _msStruct:true}).verdict.score`.
- 자명규칙 특성(sl50·sl200·ret5/20/60) + actuals[h]=`sign(price[t+h]-price[t])` + `sym`(fixture).
- 레코드 배열 → `multiscale-struct-records.json`.

- [ ] Step 1: 작성(캡처 루프·per-fixture·try/catch로 실패 시점 skip).
- [ ] Step 2: 소표본 스모크(fixtures 3개)로 레코드 생성·구조 확인.
- [ ] Step 3: 커밋 `feat(backtest): 다중스케일 구조 bias 캡처 랩`

---

### Task 4: 평가·게이트 리포트 + 실행 → 판정

**Files:** `multiscale-struct-lab.js`에 평가부 추가(또는 `eval` 서브커맨드)

`metrics.js` 재사용(`directionHitRate`·`brierDecomp`·`baselines`). 리포트:
- **A(신호)**: `sign(single)` vs `sign(ms)` 지평별 방향 적중률. ms ≤ single이면 관문① 실패 표시.
- **B(엔진)**: `sign(engBase)` vs `sign(engMs)` 지평별 적중률·BSS. sanity: `engBase`가 무플래그 run과 항등.
- **관문**: ① ms엔진 > base엔진(지평 다수 순증분) ② > baselines 최강(±모멘텀/지속성) ③ BSS>0 ④ LOSO(종목별 홀드아웃 순증분 분포·최악) ⑤ 전/후반 양수.
- 콘솔에 지평×관문 표 + 종합 판정(PASS/REJECT).

- [ ] Step 1: 평가부 작성.
- [ ] Step 2: **전체 55 fixtures 실행**(컨트롤러) → 리포트 수집.
- [ ] Step 3: 판정 해석(컨트롤러) — 5관문 대조.
- [ ] Step 4: 커밋 `feat(backtest): 다중스케일 구조 bias 게이트 평가 + 실측 리포트`

---

### Task 5: 판정 기록 (승격 or 기각)

- **기각 시(가능성 높음)**: 스코어카드 **탐구표**에 "다중스케일 구조 bias — 순증분/엔진델타 X 기각" + 숫자. 백로그 갱신. `_msStruct` 플래그는 기본 off 유지(검증 인프라로 보존). `map/backtest` 커밋. **forge.html/배포 무관**(백테스트는 배포 대상 아님, forge-core만 git).
- **통과 시**: 별도 승격 계획(범위 밖) — analyzeStructure 옵션화·baseline 재측정·validatedAxes 등록.
- [ ] Step 1: 판정에 따라 스코어카드/백로그 1줄 + 커밋+push. (forge-core.js는 git push, 배포는 통과 시 별도.)

**주의:** `_msStruct` 기본 off라 forge-core.js를 배포(cafe24)해도 프로덕션 예측 불변. 배포는 선택(엔진 로직 무변경이므로 이번엔 git만으로 충분, 필요시 forge-core.js만 배포).
