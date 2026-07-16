# 드리프트 영향 천장 검증 랩 Plan

> 연구 랩. 산출=pivot/gann/vol 천장 숫자+판정(천장~0 기각 예상). forge-core=기본-off 플래그 1개(baseline 불변).

**Goal:** pivot/gann/volume 드리프트를 bias ±1 극단으로 강제했을 때 엔진 방향 뒤집힘 비율(천장)을 측정 → 재공식화(다중스케일 포함) 무효 여부 판정.

**Constraints:** forge-core 기본 동작 불변(플래그 off==표준·245/245) · walk-forward · 천장<~2%면 기각 확정.

---

### Task 1: run() `_biasSet` 기본-off 플래그

**Files:** Modify `forge-core.js`(드리프트 라인 pivot/gann/volume/structure), `forge-core.test.js`

- run() 드리프트 계산 앞에 `const _bs = (opts && opts._biasSet) || {};` 추가.
- 4개 드리프트 라인의 bias 원천 치환(다른 계산 동일):
  - pivot(:2126): `_pv2.bias` → `(_bs.pivot != null ? _bs.pivot : _pv2.bias)`
  - gann(:2129): `_gn2.bias` → `(_bs.gann != null ? _bs.gann : _gn2.bias)`
  - volume(:2079): `analyzeVolume(price, _vol).bias` → `(_bs.volume != null ? _bs.volume : analyzeVolume(price, _vol).bias)`
  - structure(:2101): `_stBias` → `(_bs.structure != null ? _bs.structure : _stBias)`
- 회귀 테스트: `_biasSet` 미지정/`{}` → 표준과 score 동일; `{pivot:1}` → finite.

```js
test("run _biasSet flag: empty is identical to default; override finite", () => {
  const d = ForgeCore.makeDemoSeries({ n: 300, seed: 6, period: 50 });
  const g = ForgeCore.sampleGraph();
  const base = ForgeCore.run(g, { price: d.price, candle: d.candle }, { timeframe: "1day" });
  const off = ForgeCore.run(g, { price: d.price, candle: d.candle }, { timeframe: "1day", _biasSet: {} });
  assert.strictEqual(off.verdict.score, base.verdict.score);
  const on = ForgeCore.run(g, { price: d.price, candle: d.candle }, { timeframe: "1day", _biasSet: { pivot: 1 } });
  assert.ok(Number.isFinite(on.verdict.score));
});
```

- [ ] TDD 5스텝. 커밋 `feat(core): run() 검증 전용 _biasSet 플래그(기본 off·baseline 불변)`

---

### Task 2: `drift-ceiling-lab.js` + 실행

**Files:** Create `map/backtest/drift-ceiling-lab.js`

direction-lab 패턴(fixtures/*-1day.json 55종·WARMUP 200·STRIDE 10). 각 지표 ind∈[pivot,gann,volume,structure], 시점 t:
- `w=slice(s0,t+1)`. `sP=sign(run(g,w,{tf,_biasSet:{[ind]:1}}).verdict.score)`, `sM=sign(...{[ind]:-1})`.
- flip = sP!==sM. baseline `sB=sign(run(g,w,{tf}).score)`, act=sign(price[t+h]-price[t]) (h=20).
- sanity(첫 30): `run(_biasSet:{})`==`run()`.
- 집계: 지표별 flip%(천장) + 뒤집힘 시점서 +1방향/−1방향 각 act 적중률(어느 극단이라도 유리한지).

리포트+판정: 지표별 천장<2%면 "엔진 방향 무효 확정". 콘솔 표.

- [ ] Step 1 작성 · Step 2 실행(백그라운드, 55종×4지표×시점×2run — 무거우면 STRIDE20). · 커밋 `feat(backtest): 드리프트 영향 천장 랩`

---

### Task 3: 판정 → 기록

- [ ] Step 1: 천장 해석. Step 2: 스코어카드 탐구표 r:no(pivot/gann/vol) or 통합 1줄 + 백로그 + 메모리(3축→전 지표 일반 상한으로 확장). Step 3: 커밋+push·스코어카드 배포. (forge-core 플래그는 기본 off라 배포 무관, git만/선택 배포.)
