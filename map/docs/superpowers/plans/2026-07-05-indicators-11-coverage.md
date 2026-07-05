# 스쿱포지 지표 11종 추가 (TA 커버리지) 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 스쿱포지에 유명 지표 11종(피벗·SAR·Keltner·Donchian·CCI·Williams%R·Aroon·MFI·ROC·Awesome·CMF)을 추가해 TA 커버리지를 완성한다.

**Architecture:** 지표당 기존 6-피스 관례를 그대로 따른다 — ① `forge-core.js`에 순수 `analyzeX(price|data, params)`(방향 `bias∈[−1,1]` + meta) + 필요 시 combine용 `xSeries`, ② `evalBlocks` 케이스, ③ `run()`의 단일 드리프트항(`bias × trendProfileForTF(tf).trendScale × cap × DW(id)`)을 `_drifts` 배열에 합류, ④ `forge.html` hero 작도, ⑤ 시연 `analysisSteps` 케이스, ⑥ `nodeExpert`. 부수로 `BLOCK_DEFS`·`EV_COLORS`·`IND_TIERS`(+ pivot/psar는 `EV_DEFAULT_VISIBLE`) 등록.

**Tech Stack:** 바닐라 JS, 빌드툴 없음. 코어는 UMD(`forge-core.js`, `node --test forge-core.test.js`로 단위테스트). UI는 단일 `forge.html`.

## Global Constraints

- 단일 HTML + `forge-core.js` UMD 유지. 프레임워크/번들러 도입 금지.
- UI 텍스트 한국어. 다크 테마 + KB 골드 토큰만(하드코딩 색 금지 — `EV_COLORS`만 예외로 지표 고유색 등록).
- **좌측 컬러 accent line 금지** — 등급/상태는 배지·배경·텍스트로만.
- **드리프트 이중계상 금지**: 지표당 단일 드리프트항, 반드시 `trendProfileForTF(opts.timeframe)` 경유. cap은 스펙 값(피벗 .04 ~ SAR .08) 초과 금지.
- 새 지표 기본 cap 보수적(≤.08). combine 방향 기여는 `xSeries`(−1..1) 또는 zeros.
- 배포 불가침: `forge_data.json`·`forge_images.json`·`forge_jobs.json`·`forge_td_key.txt`·`forge_ohlc_cache_*.json` 절대 수정/업로드 금지. 배포는 `forge.html`+`forge-core.js`(+최초 1회 서버 키)만.
- 기존 `node --test` 통과 수 회귀 0 — 신규 테스트만 증가.
- `data` 형태: `data.price`=종가 배열, `data.candle`=`[{o,h,l,c}]`, `data.volume`=거래량 배열(없을 수 있음).
- 재사용 헬퍼(이미 존재): `sma(arr,len)`, `ema(arr,len)`, `linfit(y)`, `detectSwings(price,sens)`, `synthVolume(price)`, `_candATR(candle,period)`, `clamp` 패턴(`Math.max(-1,Math.min(1,x))`).

## 공통 통합 절차 (모든 지표 태스크가 참조)

각 지표 `X`(id=`xid`, 색=`#hex`, 등급 `LvN`)를 추가할 때 아래 6개 지점을 편집한다. 태스크별 "Wire" 스텝은 이 목록의 구체 코드를 제시한다.

1. **코어 함수** (`forge-core.js`): `analyzeX` (+ 필요 시 `xSeries`) + `xSteps` 정의, `return { ... , analyzeX, xSteps }` UMD export 목록에 추가.
2. **evalBlocks** (`forge-core.js` ~L282, `else` 직전): `} else if (n.blockType === "xid") { values[id] = xSeries(ins[0] || data.price, ...); }` — 오버레이는 `values[id] = (ins[0]||data.price).map(()=>0);`.
3. **드리프트** (`forge-core.js` ~L1450, `stochDrift` 다음): analyze 호출 + `const xDrift = _x ? _x.bias * _prof.trendScale * CAP * DW("xid") : 0;` 그리고 **L1460 `_drifts` 배열에 `xDrift` 추가**.
4. **BLOCK_DEFS** (`forge.html` ~L1554): `{ type:"xid", label:"라벨", kind:"block", params:{...} }` (predict 앞).
5. **색·등급·기본표시** (`forge.html`): `EV_COLORS`에 `xid:"#hex"`, `IND_TIERS` 해당 Lv 배열에 `"xid"`, (pivot/psar만) `EV_DEFAULT_VISIBLE`에 추가.
6. **UI 서술·작도** (`forge.html`): hero `_drawXLayers`(또는 오실레이터 서브패널), `analysisSteps` 케이스, `nodeExpert` 케이스 — 각 태스크의 템플릿 지표를 미러링.

**드리프트 부호 규약**: `bias>0`=상승 기여. 각 analyze는 `bias = Math.max(-1, Math.min(1, rawSignal))`로 클램프해 반환.

---

# Phase A — 오버레이 4종 (메인차트 작도, 서브패널 불필요)

작도 템플릿: 볼린저(`_drawBollingerLayers`)·피보(`_drawFibLayers`, 오프스케일 마커) — 메인차트 y스케일(`_mainGeo`)에 수평/밴드 라인. combine `xSeries`는 zeros(방향은 드리프트).

### Task A1: 피벗 포인트 `pivot`

**Files:**
- Modify: `forge-core.js` (analyze/steps 추가 ~L328 근처, evalBlocks ~L282, drift ~L1450·L1460, export 목록)
- Modify: `forge.html` (BLOCK_DEFS ~L1554, EV_COLORS ~L4316, IND_TIERS ~L1578, EV_DEFAULT_VISIBLE ~L4304, 작도/steps/nodeExpert)
- Test: `forge-core.test.js`

**Interfaces:**
- Produces: `analyzePivot(data, opts) → { P, R:[R1,R2,R3], S:[S1,S2,S3], last, bias }`, `pivotSteps() → [{k,v}...]`
- Consumes: `data.candle` (`{o,h,l,c}`), 없으면 `data.price`로 종가만.

- [ ] **Step 1: 실패 테스트 작성** — `forge-core.test.js` 하단에 추가:

```js
test("analyzePivot: 종가가 피벗 위면 bias 양수, 아래면 음수", () => {
  const up = { candle: [], price: [] };
  // 전일 H=10,L=6,C=8 → P=8. 오늘 종가 9.5(피벗 위) → bias>0
  const candle = [{o:6,h:10,l:6,c:8},{o:8,h:9.6,l:7.9,c:9.5}];
  const r = ForgeCore.analyzePivot({ candle, price: candle.map(c=>c.c) });
  assert.ok(r.P > 0 && r.bias > 0, `expected bias>0, got ${r.bias} P=${r.P}`);
  const candle2 = [{o:6,h:10,l:6,c:8},{o:8,h:8.1,l:6.4,c:6.6}];
  const r2 = ForgeCore.analyzePivot({ candle: candle2, price: candle2.map(c=>c.c) });
  assert.ok(r2.bias < 0, `expected bias<0, got ${r2.bias}`);
});
```

- [ ] **Step 2: 테스트 실패 확인** — Run: `node --test forge-core.test.js` → FAIL(`analyzePivot is not a function`).

- [ ] **Step 3: 코어 구현** — `forge-core.js`의 `analyzeRSI` 근처(다른 analyze들과 같은 블록)에 추가:

```js
function analyzePivot(data, opts) {
  opts = opts || {};
  const candle = (data && data.candle) || [], price = (data && data.price) || (candle.map(c => c.c));
  const P0 = price.length;
  const EMPTY = { P: 0, R: [0,0,0], S: [0,0,0], last: 0, bias: 0 };
  if (P0 < 2) return EMPTY;
  // 직전 기간 HLC: 캔들 있으면 마지막에서 두번째 봉, 없으면 종가로 근사
  const prev = candle.length >= 2 ? candle[candle.length - 2] : null;
  const H = prev ? prev.h : Math.max(price[P0-2], price[P0-1]);
  const L = prev ? prev.l : Math.min(price[P0-2], price[P0-1]);
  const C = prev ? prev.c : price[P0-2];
  const P = (H + L + C) / 3;
  const R1 = 2*P - L, S1 = 2*P - H;
  const R2 = P + (H - L), S2 = P - (H - L);
  const R3 = H + 2*(P - L), S3 = L - 2*(H - P);
  const last = price[P0-1];
  const span = Math.max(1e-9, R1 - S1);
  let bias = Math.max(-1, Math.min(1, (last - P) / span));
  // 저항 바로 아래/지지 바로 위 근접 시 소폭 감쇠(돌파 전 저항)
  return { P, R: [R1,R2,R3], S: [S1,S2,S3], last, bias };
}
function pivotSteps() {
  return [
    { k: "직전 기간", v: "고·저·종가로 피벗 P 산출" },
    { k: "레벨", v: "R1~R3 저항 · S1~S3 지지 투영" },
    { k: "방향", v: "종가 vs P — 위=강세 / 아래=약세" },
  ];
}
```

UMD export 객체(파일 하단 `return { ... }`)에 `analyzePivot, pivotSteps` 추가.

- [ ] **Step 4: 테스트 통과 확인** — Run: `node --test forge-core.test.js` → PASS.

- [ ] **Step 5: evalBlocks + 드리프트 배선** — `forge-core.js`:
  - evalBlocks(오버레이 → combine 방향 없음, zeros): `else`(~L282) 직전에
    ```js
    } else if (n.blockType === "pivot") {
      values[id] = (ins[0] || data.price).map(() => 0);
    ```
  - 드리프트(~L1450 `stochDrift` 다음):
    ```js
    const _pvn = (graph.nodes || []).find(nd => nd.kind === "block" && nd.blockType === "pivot");
    const _pv2 = _pvn ? analyzePivot(data, {}) : null;
    const pivotDrift = _pv2 ? _pv2.bias * _prof.trendScale * 0.04 * DW("pivot") : 0;   // 피벗 위/아래 방향(±4%·S/R라 약함)
    ```
  - L1460 `_drifts` 배열 끝에 `, pivotDrift` 추가.

- [ ] **Step 6: 회귀+방향 테스트** — Run: `node --test forge-core.test.js` → PASS(기존 전부 + 신규). 커밋 전 코어 확정.

- [ ] **Step 7: UI 배선** — `forge.html`:
  - BLOCK_DEFS(~L1554, predict 앞): `{ type:"pivot", label:"피벗 포인트", kind:"block", params:{} },`
  - EV_COLORS(~L4316): `pivot:"#e0b0a0",`
  - IND_TIERS Lv2 배열에 `"pivot"` 추가(스펙 배치).
  - EV_DEFAULT_VISIBLE(~L4304)에 `"pivot"` 추가.
  - 작도: `_drawFibLayers`를 템플릿으로 `_drawPivotLayers(ctx, geo, a)` 신설 — `a.P`(굵은 골드 실선)·`a.R[0..2]`(붉은 점선)·`a.S[0..2]`(초록 점선) 수평선 + `_evLabel`로 "P/R1/S1…" 라벨. y스케일 밖 레벨은 `_drawFibLayers`의 가장자리 `▲/▼` 마커 로직 재사용. hero 렌더에서 `_evVisible.has("pivot")`일 때 호출.
  - `analysisSteps` 케이스 `pivot`: `pivotSteps()` 반환값을 진행 로그로 노출(기존 케이스 형식 미러).
  - `nodeExpert` 케이스 `pivot`: P/R/S 레벨과 종가 위치 요약 카드(기존 케이스 형식 미러).

- [ ] **Step 8: 시각 검증(헤드리스)** — 스크린샷으로 pivot 켠 상태 확인:

```bash
SP=<scratchpad>; BIN=~/.cache/ms-playwright/chromium-1228/chrome-linux64/chrome
LP=$SP/chrlibs:$(find $SP/chrlibs -type d -name x86_64-linux-gnu|tr '\n' ':')
LD_LIBRARY_PATH="$LP" "$BIN" --headless=new --no-sandbox --disable-gpu --virtual-time-budget=5000 \
  --screenshot=$SP/pivot.png "file:///home/jschoi0223/projects/vdiportal/map/forge.html"
```
Expected: 메인차트에 P·R·S 수평선 라벨 표시. Read로 확인.

- [ ] **Step 9: 커밋**

```bash
git add forge-core.js forge-core.test.js forge.html
git commit -m "feat(forge): 피벗 포인트 지표 추가(Lv2·기본표시·메인차트 S/R 레벨)"
```

### Task A2: Parabolic SAR `psar`

**Interfaces:** Produces `analyzePSAR(data, opts) → { series, last, sar, dir(+1/−1), flip:bool, bias }`, `psarSteps()`.

- [ ] **Step 1: 실패 테스트**

```js
test("analyzePSAR: 상승 시계열이면 dir=+1·bias>0", () => {
  const price = Array.from({length:40},(_,i)=>100+i);   // 단조 상승
  const candle = price.map((c,i)=>({o:c-0.5,h:c+0.6,l:c-0.6,c}));
  const r = ForgeCore.analyzePSAR({ candle, price });
  assert.equal(r.dir, 1);
  assert.ok(r.bias > 0, `bias ${r.bias}`);
});
test("analyzePSAR: 하락 시계열이면 dir=−1·bias<0", () => {
  const price = Array.from({length:40},(_,i)=>140-i);
  const candle = price.map((c)=>({o:c+0.5,h:c+0.6,l:c-0.6,c}));
  const r = ForgeCore.analyzePSAR({ candle, price });
  assert.equal(r.dir, -1);
  assert.ok(r.bias < 0);
});
```

- [ ] **Step 2: 실패 확인** — `node --test forge-core.test.js` → FAIL.

- [ ] **Step 3: 코어 구현** (Wilder PSAR):

```js
function analyzePSAR(data, opts) {
  opts = opts || {};
  const step = opts.step || 0.02, maxAf = opts.max || 0.2;
  const candle = (data && data.candle) || [], price = (data && data.price) || candle.map(c=>c.c);
  const P = price.length;
  const EMPTY = { series: [], last: 0, sar: 0, dir: 0, flip: false, bias: 0 };
  if (P < 3) return EMPTY;
  const hi = candle.length ? candle.map(c=>c.h) : price;
  const lo = candle.length ? candle.map(c=>c.l) : price;
  const sarArr = new Array(P).fill(null);
  let up = price[1] >= price[0];        // 초기 추세
  let af = step, ep = up ? hi[0] : lo[0], sar = up ? lo[0] : hi[0];
  let flip = false;
  for (let i = 1; i < P; i++) {
    sar = sar + af * (ep - sar);
    if (up) {
      if (lo[i] < sar) { up = false; sar = ep; ep = lo[i]; af = step; flip = (i === P-1); }
      else { if (hi[i] > ep) { ep = hi[i]; af = Math.min(maxAf, af + step); } }
    } else {
      if (hi[i] > sar) { up = true; sar = ep; ep = hi[i]; af = step; flip = (i === P-1); }
      else { if (lo[i] < ep) { ep = lo[i]; af = Math.min(maxAf, af + step); } }
    }
    sarArr[i] = sar;
  }
  const last = price[P-1], dir = up ? 1 : -1;
  // 방향 = 추세부호, 최근 플립이면 강도 완화(전환 직후 불확실)
  let bias = dir * (flip ? 0.4 : 0.85);
  bias = Math.max(-1, Math.min(1, bias));
  return { series: sarArr, last, sar, dir, flip, bias };
}
function psarSteps() {
  return [
    { k: "SAR 점", v: "가속계수 AF로 추적점 갱신" },
    { k: "추세", v: "가격 > SAR = 상승 / < SAR = 하락" },
    { k: "전환", v: "가격이 SAR 관통 시 방향 플립" },
  ];
}
```
export에 `analyzePSAR, psarSteps` 추가.

- [ ] **Step 4: 통과 확인** — `node --test forge-core.test.js` → PASS.

- [ ] **Step 5: 배선** — evalBlocks: `} else if (n.blockType==="psar"){ values[id]=(ins[0]||data.price).map(()=>0); ` (오버레이). 드리프트(stochDrift 다음):
```js
const _psn = (graph.nodes||[]).find(nd=>nd.kind==="block"&&nd.blockType==="psar");
const _ps = _psn ? analyzePSAR(data, {}) : null;
const psarDrift = _ps ? _ps.bias * _prof.trendScale * 0.08 * DW("psar") : 0;   // SAR 추세방향(±8%)
```
L1460 `_drifts`에 `, psarDrift`.

- [ ] **Step 6: 회귀 테스트** — `node --test forge-core.test.js` → PASS.

- [ ] **Step 7: UI 배선** — BLOCK_DEFS: `{ type:"psar", label:"Parabolic SAR", kind:"block", params:{ step:0.02, max:0.2 } },`. EV_COLORS: `psar:"#c0a8e0",`. IND_TIERS Lv2에 `"psar"`. EV_DEFAULT_VISIBLE에 `"psar"`. 작도 `_drawPsarLayers`: `a.series` 각 봉 위치에 점(캔들 위/아래), reveal 게이트. `analysisSteps`/`nodeExpert` `psar` 케이스(추세방향·SAR값 요약).

- [ ] **Step 8: 헤드리스 스크린샷** — SAR 점열 표시 확인(Task A1 명령의 파일명만 psar.png로).

- [ ] **Step 9: 커밋** — `git commit -m "feat(forge): Parabolic SAR 지표 추가(Lv2·기본표시·SAR 점열)"`

### Task A3: Keltner 채널 `keltner`

**Interfaces:** Produces `analyzeKeltner(data, opts) → { mid, upper, lower, pctB, squeeze:bool, bias }`, `keltnerSteps()`. atrSeries가 0을 반환하므로 **캔들 트루레인지로 자체 ATR 계산**(`_candATR` 참고).

- [ ] **Step 1: 실패 테스트**

```js
test("analyzeKeltner: 종가가 상단 밴드 근처면 bias>0", () => {
  const base = Array.from({length:40},(_,i)=>100+Math.sin(i/5));
  const price = base.concat([104]);  // 마지막 급등 → 상단 돌파
  const candle = price.map(c=>({o:c,h:c+0.3,l:c-0.3,c}));
  const r = ForgeCore.analyzeKeltner({ candle, price }, { len:20, atrLen:10, mult:2 });
  assert.ok(r.bias > 0, `bias ${r.bias}`);
});
```

- [ ] **Step 2: 실패 확인** — FAIL.

- [ ] **Step 3: 코어 구현**

```js
function _trueRangeSeries(candle, price) {
  const P = price.length, tr = new Array(P).fill(0);
  for (let i = 1; i < P; i++) {
    const h = candle[i] ? candle[i].h : Math.max(price[i], price[i-1]);
    const l = candle[i] ? candle[i].l : Math.min(price[i], price[i-1]);
    const pc = price[i-1];
    tr[i] = Math.max(h - l, Math.abs(h - pc), Math.abs(l - pc));
  }
  return tr;
}
function analyzeKeltner(data, opts) {
  opts = opts || {};
  const len = opts.len || 20, atrLen = opts.atrLen || 10, mult = opts.mult || 2;
  const price = (data && data.price) || (data.candle||[]).map(c=>c.c), candle = (data && data.candle) || [];
  const P = price.length;
  if (P < 2) return { mid:0, upper:0, lower:0, pctB:0.5, squeeze:false, bias:0 };
  const midArr = ema(price, len), tr = _trueRangeSeries(candle, price), atrArr = ema(tr, atrLen);
  const mid = midArr[P-1], atr = atrArr[P-1] || 1e-9;
  const upper = mid + mult*atr, lower = mid - mult*atr, last = price[P-1];
  const pctB = (last - lower) / Math.max(1e-9, upper - lower);
  const bias = Math.max(-1, Math.min(1, (pctB - 0.5) * 2));   // 중앙=0, 상단=+1, 하단=−1
  return { mid, upper, lower, pctB, squeeze:false, bias };
}
function keltnerSteps() {
  return [
    { k: "중심선", v: "EMA(기간)" },
    { k: "밴드", v: "중심 ± ATR × 배수" },
    { k: "방향", v: "채널 내 위치(상단=강세)" },
  ];
}
```
export에 추가(`analyzeKeltner, keltnerSteps`). `ema`는 기존 헬퍼 사용.

- [ ] **Step 4: 통과** — PASS.
- [ ] **Step 5: 배선** — evalBlocks: `} else if (n.blockType==="keltner"){ values[id]=(ins[0]||data.price).map(()=>0);`. 드리프트:
```js
const _ktn = (graph.nodes||[]).find(nd=>nd.kind==="block"&&nd.blockType==="keltner");
const _kt = _ktn ? analyzeKeltner(data, { len:(_ktn.params&&_ktn.params.len)||20, atrLen:(_ktn.params&&_ktn.params.atrLen)||10, mult:(_ktn.params&&_ktn.params.mult)||2 }) : null;
const keltnerDrift = _kt ? _kt.bias * _prof.trendScale * 0.06 * DW("keltner") : 0;
```
`_drifts`에 `, keltnerDrift`.
- [ ] **Step 6: 회귀** — PASS.
- [ ] **Step 7: UI** — BLOCK_DEFS: `{ type:"keltner", label:"Keltner 채널", kind:"block", params:{ len:20, atrLen:10, mult:2 } },`. EV_COLORS: `keltner:"#7fc0d0",`. IND_TIERS Lv3에 `"keltner"`. 작도 `_drawKeltnerLayers`(볼린저 템플릿, mid/upper/lower 3선). steps/nodeExpert.
- [ ] **Step 8: 헤드리스** — 3선 표시 확인.
- [ ] **Step 9: 커밋** — `git commit -m "feat(forge): Keltner 채널 추가(Lv3·ATR 밴드)"`

### Task A4: Donchian 채널 `donchian`

**Interfaces:** Produces `analyzeDonchian(data, opts) → { upper, lower, mid, midSlope, bias }`, `donchianSteps()`.

- [ ] **Step 1: 실패 테스트**

```js
test("analyzeDonchian: 신고가 돌파면 bias>0", () => {
  const price = Array.from({length:25},(_,i)=>100+ (i<24?0:5) + i*0.01);
  const candle = price.map(c=>({o:c,h:c+0.2,l:c-0.2,c}));
  const r = ForgeCore.analyzeDonchian({ candle, price }, { len:20 });
  assert.ok(r.bias > 0, `bias ${r.bias}`);
});
```

- [ ] **Step 2: 실패 확인** — FAIL.
- [ ] **Step 3: 코어 구현**

```js
function analyzeDonchian(data, opts) {
  opts = opts || {};
  const len = opts.len || 20;
  const price = (data && data.price) || (data.candle||[]).map(c=>c.c), candle = (data && data.candle) || [];
  const P = price.length;
  if (P < 2) return { upper:0, lower:0, mid:0, midSlope:0, bias:0 };
  const s = Math.max(0, P - len);
  let upper = -Infinity, lower = Infinity;
  for (let i = s; i < P; i++) {
    const h = candle[i] ? candle[i].h : price[i], l = candle[i] ? candle[i].l : price[i];
    if (h > upper) upper = h; if (l < lower) lower = l;
  }
  const mid = (upper + lower) / 2, last = price[P-1];
  // 이전 봉 중앙선 기울기(방향 보조)
  const s2 = Math.max(0, P - len - 1);
  let u2 = -Infinity, l2 = Infinity;
  for (let i = s2; i < P-1; i++) { const h=candle[i]?candle[i].h:price[i], l=candle[i]?candle[i].l:price[i]; if(h>u2)u2=h; if(l<l2)l2=l; }
  const midSlope = mid - (u2+l2)/2;
  const pos = (last - lower) / Math.max(1e-9, upper - lower);   // 0=하단,1=상단
  let bias = (pos - 0.5) * 2 * 0.8 + Math.sign(midSlope) * 0.2;
  bias = Math.max(-1, Math.min(1, bias));
  return { upper, lower, mid, midSlope, bias };
}
function donchianSteps() {
  return [
    { k: "채널", v: "N봉 최고가·최저가" },
    { k: "돌파", v: "상단 돌파=매수 / 하단=매도(터틀)" },
    { k: "방향", v: "채널 내 위치 + 중앙선 기울기" },
  ];
}
```
export 추가.
- [ ] **Step 4: 통과** — PASS.
- [ ] **Step 5: 배선** — evalBlocks zeros + 드리프트 cap `0.07` DW("donchian"), `_drifts`에 `donchianDrift`.
- [ ] **Step 6: 회귀** — PASS.
- [ ] **Step 7: UI** — BLOCK_DEFS `{ type:"donchian", label:"Donchian 채널", kind:"block", params:{ len:20 } },`. EV_COLORS `donchian:"#d0c080",`. IND_TIERS Lv3에 `"donchian"`. 작도 `_drawDonchianLayers`(상/하/중 계단선). steps/nodeExpert.
- [ ] **Step 8: 헤드리스** — 계단선 확인.
- [ ] **Step 9: 커밋** — `git commit -m "feat(forge): Donchian 채널 추가(Lv3·돌파)"`

---

# Phase B — 오실레이터 5종 (서브패널 신규)

combine `xSeries`는 오실레이터 정규화 −1..1 실값(자연스러움). 서브패널 작도 템플릿: 기존 **RSI 오실레이터 서브패널**(forge.html의 오실레이터 렌더). 각 지표는 RSI 서브패널 구조(0선/밴드/라인)를 미러링하되 밴드 값만 다름.

### Task B1: CCI `cci`

**Interfaces:** Produces `cciSeries(price, period) → [-1..1]`(combine), `analyzeCCI(price, opts) → { series(raw CCI), last, regime, bias }`, `cciSteps()`.

- [ ] **Step 1: 실패 테스트**

```js
test("analyzeCCI: 강한 상승 후 CCI last>0·bias>0", () => {
  const price = Array.from({length:60},(_,i)=>100 + i*0.8);
  const r = ForgeCore.analyzeCCI(price, { period:20 });
  assert.ok(r.last > 0 && r.bias > 0, `last ${r.last} bias ${r.bias}`);
});
test("cciSeries: 길이 일치·범위 −1..1", () => {
  const price = Array.from({length:40},(_,i)=>100+Math.sin(i));
  const s = ForgeCore.cciSeries(price, 20);
  assert.equal(s.length, price.length);
  assert.ok(s.every(v => v >= -1 && v <= 1));
});
```

- [ ] **Step 2: 실패 확인** — FAIL.
- [ ] **Step 3: 코어 구현**

```js
function _cciRaw(price, period) {
  const P = price.length, out = new Array(P).fill(0);
  for (let i = 0; i < P; i++) {
    const s = Math.max(0, i - period + 1), win = price.slice(s, i + 1);
    const mean = win.reduce((a,b)=>a+b,0) / win.length;
    const md = win.reduce((a,b)=>a+Math.abs(b-mean),0) / win.length;
    out[i] = md === 0 ? 0 : (price[i] - mean) / (0.015 * md);
  }
  return out;
}
function cciSeries(price, period) {
  return _cciRaw(price, period || 20).map(v => Math.max(-1, Math.min(1, v / 200)));   // ±200→±1
}
function analyzeCCI(price, opts) {
  opts = opts || {};
  const period = opts.period || 20, P = price.length;
  if (P < 2) return { series: [], last: 0, regime: 0, bias: 0 };
  const raw = _cciRaw(price, period), last = raw[P-1];
  const win = raw.slice(Math.max(0, P - period*2)), avg = win.reduce((a,b)=>a+b,0)/(win.length||1);
  const regime = avg >= 40 ? 1 : avg <= -40 ? -1 : 0;   // Cardwell식 국면
  // 0선 위/아래 + 국면 반영(추세장 과열은 약하게)
  let bias = Math.max(-1, Math.min(1, last / 150));
  if (last > 100 && regime < 0) bias *= 0.4;             // 약세국면 과열은 조정신호
  if (last < -100 && regime > 0) bias *= 0.4;
  return { series: raw, last, regime, bias };
}
function cciSteps() {
  return [
    { k: "CCI", v: "(전형가 − 이동평균) / (0.015 × 평균편차)" },
    { k: "구간", v: "+100 과열 / −100 과매도" },
    { k: "국면", v: "최근 평균으로 강세·약세 국면 보정" },
  ];
}
```
export에 `cciSeries, analyzeCCI, cciSteps` 추가.
- [ ] **Step 4: 통과** — PASS.
- [ ] **Step 5: 배선** — evalBlocks: `} else if (n.blockType==="cci"){ values[id]=cciSeries(ins[0]||data.price,(n.params&&n.params.period)||20);`. 드리프트 cap `0.06` DW("cci"), `_drifts`에 `cciDrift`.
- [ ] **Step 6: 회귀** — PASS.
- [ ] **Step 7: UI** — BLOCK_DEFS `{ type:"cci", label:"CCI", kind:"block", params:{ period:20 } },`. EV_COLORS `cci:"#e09a6a",`. IND_TIERS Lv3에 `"cci"`. **서브패널**: RSI 오실레이터 렌더를 미러해 `cci` 서브패널(±100 밴드, `analyzeCCI().series`). steps/nodeExpert.
- [ ] **Step 8: 헤드리스** — 서브패널 표시 확인.
- [ ] **Step 9: 커밋** — `git commit -m "feat(forge): CCI 지표 추가(Lv3·오실레이터 서브패널)"`

### Task B2: Williams %R `williams`

**Interfaces:** `williamsSeries(data, period) → [-1..1]`, `analyzeWilliams(data, opts) → { series(raw %R −100..0), last, bias }`, `williamsSteps()`. H/L 필요 → `data.candle`, 없으면 종가로 근사.

- [ ] **Step 1: 실패 테스트**

```js
test("analyzeWilliams: 최근 고점 근처면 %R>-20·bias>0", () => {
  const price = Array.from({length:30},(_,i)=>100+i);   // 상승 → 종가=최고
  const candle = price.map(c=>({o:c,h:c+0.1,l:c-0.1,c}));
  const r = ForgeCore.analyzeWilliams({ candle, price }, { period:14 });
  assert.ok(r.last > -20 && r.bias > 0, `last ${r.last}`);
});
```

- [ ] **Step 2: 실패 확인** — FAIL.
- [ ] **Step 3: 코어 구현**

```js
function _willRaw(data, period) {
  const price = data.price || (data.candle||[]).map(c=>c.c), candle = data.candle || [];
  const P = price.length, out = new Array(P).fill(-50);
  for (let i = 0; i < P; i++) {
    const s = Math.max(0, i - period + 1);
    let hh = -Infinity, ll = Infinity;
    for (let j = s; j <= i; j++) { const h=candle[j]?candle[j].h:price[j], l=candle[j]?candle[j].l:price[j]; if(h>hh)hh=h; if(l<ll)ll=l; }
    out[i] = hh === ll ? -50 : -100 * (hh - price[i]) / (hh - ll);
  }
  return out;
}
function williamsSeries(data, period) {
  return _willRaw(data, period || 14).map(v => Math.max(-1, Math.min(1, (v + 50) / 50)));   // −50=0, 0=+1, −100=−1
}
function analyzeWilliams(data, opts) {
  opts = opts || {};
  const period = opts.period || 14, raw = _willRaw(data, period), P = raw.length;
  if (!P) return { series: [], last: -50, bias: 0 };
  const last = raw[P-1];
  const bias = Math.max(-1, Math.min(1, (last + 50) / 50));
  return { series: raw, last, bias };
}
function williamsSteps() {
  return [
    { k: "%R", v: "−100 × (최고−종가) / (최고−최저)" },
    { k: "구간", v: "−20 과매수 / −80 과매도" },
  ];
}
```
export 추가.
- [ ] **Step 4~9:** Task B1과 동형. evalBlocks `williamsSeries(data,(n.params&&n.params.period)||14)`(price 아닌 **data** 전달 — H/L 필요), 드리프트 cap `0.05`. BLOCK_DEFS `{ type:"williams", label:"Williams %R", kind:"block", params:{ period:14 } }`. EV_COLORS `williams:"#d87ac0"`. IND_TIERS Lv3. 서브패널 −20/−80 밴드. 커밋 `feat(forge): Williams %R 추가(Lv3)`.

> 주의: evalBlocks에서 williams는 `ins[0]` 대신 `data`(candle 포함)를 넘겨야 함:
> `} else if (n.blockType==="williams"){ values[id]=williamsSeries(data,(n.params&&n.params.period)||14);`
> 드리프트도 `analyzeWilliams(data, {...})`.

### Task B3: ROC/모멘텀 `roc`

**Interfaces:** `rocSeries(price, period) → [-1..1]`, `analyzeROC(price, opts) → { series(raw %), last, bias }`, `rocSteps()`.

- [ ] **Step 1: 실패 테스트**

```js
test("analyzeROC: 상승이면 ROC>0·bias>0 / 하락이면 <0", () => {
  const up = Array.from({length:20},(_,i)=>100+i);
  const ru = ForgeCore.analyzeROC(up, { period:12 });
  assert.ok(ru.last > 0 && ru.bias > 0);
  const dn = Array.from({length:20},(_,i)=>120-i);
  assert.ok(ForgeCore.analyzeROC(dn, { period:12 }).bias < 0);
});
```

- [ ] **Step 2~3: 실패 확인 + 구현**

```js
function _rocRaw(price, period) {
  const P = price.length, out = new Array(P).fill(0);
  for (let i = 0; i < P; i++) { const j = i - period; out[i] = j >= 0 && price[j] ? (price[i]/price[j] - 1)*100 : 0; }
  return out;
}
function rocSeries(price, period) { return _rocRaw(price, period || 12).map(v => Math.max(-1, Math.min(1, v / 10))); }   // ±10%→±1
function analyzeROC(price, opts) {
  opts = opts || {};
  const period = opts.period || 12, raw = _rocRaw(price, period), P = raw.length;
  if (!P) return { series: [], last: 0, bias: 0 };
  const last = raw[P-1], bias = Math.max(-1, Math.min(1, last / 8));
  return { series: raw, last, bias };
}
function rocSteps() {
  return [ { k:"ROC", v:"(종가 / N봉전 − 1) × 100" }, { k:"방향", v:"0선 위=상승 모멘텀" } ];
}
```
export 추가.
- [ ] **Step 4~9:** evalBlocks `rocSeries(ins[0]||data.price,(n.params&&n.params.period)||12)`, 드리프트 cap `0.06`. BLOCK_DEFS `{ type:"roc", label:"ROC/모멘텀", kind:"block", params:{ period:12 } }`. EV_COLORS `roc:"#8fb46a"`. IND_TIERS **Lv4**. 서브패널 0선. 커밋 `feat(forge): ROC/모멘텀 추가(Lv4)`.

### Task B4: Awesome Oscillator `ao`

**Interfaces:** `aoSeries(data, opts) → [-1..1]`, `analyzeAO(data, opts) → { series(raw AO), last, cross, bias }`, `aoSteps()`. median=(H+L)/2.

- [ ] **Step 1: 실패 테스트**

```js
test("analyzeAO: 상승 가속이면 AO>0·bias>0", () => {
  const price = Array.from({length:60},(_,i)=>100 + i*i*0.01);
  const candle = price.map(c=>({o:c,h:c+0.2,l:c-0.2,c}));
  const r = ForgeCore.analyzeAO({ candle, price }, { fast:5, slow:34 });
  assert.ok(r.last > 0 && r.bias > 0, `last ${r.last}`);
});
```

- [ ] **Step 2~3: 실패 + 구현**

```js
function analyzeAO(data, opts) {
  opts = opts || {};
  const fast = opts.fast || 5, slow = opts.slow || 34;
  const price = data.price || (data.candle||[]).map(c=>c.c), candle = data.candle || [];
  const P = price.length;
  if (P < slow) return { series: new Array(P).fill(0), last: 0, cross: 0, bias: 0 };
  const med = price.map((c,i)=> candle[i] ? (candle[i].h + candle[i].l)/2 : c);
  const f = sma(med, fast), s = sma(med, slow), ao = med.map((_,i)=> (f[i]||0) - (s[i]||0));
  const last = ao[P-1], prev = ao[P-2] || 0;
  const cross = (prev <= 0 && last > 0) ? 1 : (prev >= 0 && last < 0) ? -1 : 0;
  // 정규화: 최근 절대값 최대 대비
  const scale = Math.max(1e-9, ...ao.slice(Math.max(0,P-slow)).map(Math.abs));
  let bias = Math.max(-1, Math.min(1, last / scale));
  if (cross) bias = Math.max(-1, Math.min(1, bias + cross*0.2));
  return { series: ao, last, cross, bias };
}
function aoSeries(data, opts) {
  const a = analyzeAO(data, opts||{}); const scale = Math.max(1e-9, ...a.series.map(Math.abs));
  return a.series.map(v => Math.max(-1, Math.min(1, v/scale)));
}
function aoSteps() {
  return [ { k:"AO", v:"SMA(중앙값,5) − SMA(중앙값,34)" }, { k:"방향", v:"0선 교차 + 새서(3봉 반전)" } ];
}
```
export 추가(`analyzeAO, aoSeries, aoSteps`).
- [ ] **Step 4~9:** evalBlocks `aoSeries(data, { fast:..., slow:... })`(data 전달), 드리프트 cap `0.06`. BLOCK_DEFS `{ type:"ao", label:"Awesome", kind:"block", params:{ fast:5, slow:34 } }`. EV_COLORS `ao:"#6ac0a0"`. IND_TIERS **Lv4**. 서브패널 **히스토그램**(상승/하락 막대색). 커밋 `feat(forge): Awesome Oscillator 추가(Lv4·히스토그램)`.

### Task B5: Aroon `aroon`

**Interfaces:** `aroonSeries(data, period) → [-1..1]`, `analyzeAroon(data, opts) → { up, down, osc, bias }`, `aroonSteps()`.

- [ ] **Step 1: 실패 테스트**

```js
test("analyzeAroon: 상승 추세면 up 높고 osc>0·bias>0", () => {
  const price = Array.from({length:40},(_,i)=>100+i);   // 신고가 갱신 지속
  const candle = price.map(c=>({o:c,h:c+0.1,l:c-0.1,c}));
  const r = ForgeCore.analyzeAroon({ candle, price }, { period:25 });
  assert.ok(r.up > r.down && r.bias > 0, `up ${r.up} down ${r.down}`);
});
```

- [ ] **Step 2~3: 실패 + 구현**

```js
function _aroonAt(data, period, end) {
  const price = data.price || (data.candle||[]).map(c=>c.c), candle = data.candle || [];
  const s = Math.max(0, end - period);
  let hi=-Infinity, lo=Infinity, hIdx=s, lIdx=s;
  for (let j=s; j<=end; j++){ const h=candle[j]?candle[j].h:price[j], l=candle[j]?candle[j].l:price[j]; if(h>=hi){hi=h;hIdx=j;} if(l<=lo){lo=l;lIdx=j;} }
  const up = 100*(period - (end - hIdx))/period, down = 100*(period - (end - lIdx))/period;
  return { up, down };
}
function analyzeAroon(data, opts) {
  opts = opts || {};
  const period = opts.period || 25;
  const price = data.price || (data.candle||[]).map(c=>c.c), P = price.length;
  if (P < 2) return { up:0, down:0, osc:0, bias:0 };
  const { up, down } = _aroonAt(data, period, P-1), osc = up - down;
  const bias = Math.max(-1, Math.min(1, osc/100));
  return { up, down, osc, bias };
}
function aroonSeries(data, period) {
  const price = data.price || (data.candle||[]).map(c=>c.c), P = price.length, out = new Array(P).fill(0);
  for (let i=0;i<P;i++){ const a=_aroonAt(data, period||25, i); out[i]=Math.max(-1,Math.min(1,(a.up-a.down)/100)); }
  return out;
}
function aroonSteps() {
  return [ { k:"Aroon", v:"신고가·신저가 이후 경과봉으로 추세강도" }, { k:"방향", v:"Up − Down 오실레이터" } ];
}
```
export 추가.
- [ ] **Step 4~9:** evalBlocks `aroonSeries(data,(n.params&&n.params.period)||25)`, 드리프트 cap `0.06`. BLOCK_DEFS `{ type:"aroon", label:"Aroon", kind:"block", params:{ period:25 } }`. EV_COLORS `aroon:"#c0a0e0"`. IND_TIERS Lv3에 `"aroon"`. 서브패널 Up/Down 2선. 커밋 `feat(forge): Aroon 추가(Lv3)`.

---

# Phase C — 자금흐름 2종 (거래량 의존, synthVolume 폴백)

거래량은 `data.volume`(티커 실데이터) 우선, 없으면 `synthVolume(price)` 폴백 — 기존 volume/vwap 패턴과 동일. **합성거래량 시 신뢰도 카베아트**를 nodeExpert/steps에 명시.

### Task C1: MFI `mfi`

**Interfaces:** `mfiSeries(data, period) → [-1..1]`, `analyzeMFI(data, opts) → { series(raw 0..100), last, regime, bias }`, `mfiSteps()`.

- [ ] **Step 1: 실패 테스트**

```js
test("analyzeMFI: 상승+거래량이면 MFI>50·bias>0", () => {
  const price = Array.from({length:40},(_,i)=>100+i);
  const candle = price.map(c=>({o:c,h:c+0.3,l:c-0.3,c}));
  const volume = price.map(()=>1000);
  const r = ForgeCore.analyzeMFI({ candle, price, volume }, { period:14 });
  assert.ok(r.last > 50 && r.bias > 0, `last ${r.last}`);
});
test("analyzeMFI: 거래량 없어도 throw 없이 동작(합성 폴백)", () => {
  const price = Array.from({length:40},(_,i)=>100+Math.sin(i));
  const r = ForgeCore.analyzeMFI({ candle: price.map(c=>({o:c,h:c+0.2,l:c-0.2,c})), price }, { period:14 });
  assert.ok(isFinite(r.bias));
});
```

- [ ] **Step 2~3: 실패 + 구현**

```js
function _mfiRaw(data, period) {
  const price = data.price || (data.candle||[]).map(c=>c.c), candle = data.candle || [];
  const vol = (Array.isArray(data.volume) && data.volume.length === price.length) ? data.volume : synthVolume(price);
  const P = price.length, tp = new Array(P), out = new Array(P).fill(50);
  for (let i=0;i<P;i++){ const c=candle[i]; tp[i]= c ? (c.h+c.l+c.c)/3 : price[i]; }
  for (let i=0;i<P;i++){
    let posMF=0, negMF=0, s=Math.max(1, i-period+1);
    for (let j=s;j<=i;j++){ const raw=tp[j]*(vol[j]||0); if(tp[j]>tp[j-1])posMF+=raw; else if(tp[j]<tp[j-1])negMF+=raw; }
    const mr = negMF===0 ? (posMF>0?100:1) : posMF/negMF;
    out[i] = 100 - 100/(1+mr);
  }
  return out;
}
function mfiSeries(data, period) { return _mfiRaw(data, period||14).map(v => Math.max(-1, Math.min(1, (v-50)/50))); }
function analyzeMFI(data, opts) {
  opts = opts || {};
  const period = opts.period || 14, raw = _mfiRaw(data, period), P = raw.length;
  if (!P) return { series: [], last: 50, regime: 0, bias: 0 };
  const last = raw[P-1];
  const win = raw.slice(Math.max(0,P-period*2)), avg = win.reduce((a,b)=>a+b,0)/(win.length||1);
  const regime = avg>=55?1:avg<=45?-1:0;
  let bias = Math.max(-1, Math.min(1, (last-50)/40));
  if (last>80 && regime<0) bias*=0.4; if (last<20 && regime>0) bias*=0.4;
  return { series: raw, last, regime, bias };
}
function mfiSteps() {
  return [ { k:"MFI", v:"거래량 가중 RSI(전형가×거래량)" }, { k:"구간", v:"80 과열 / 20 과매도" }, { k:"주의", v:"합성거래량 시 참고용" } ];
}
```
export 추가.
- [ ] **Step 4~9:** evalBlocks `mfiSeries(data,(n.params&&n.params.period)||14)`, 드리프트 `analyzeMFI(data,{...})` cap `0.06`. BLOCK_DEFS `{ type:"mfi", label:"MFI", kind:"block", params:{ period:14 } }`. EV_COLORS `mfi:"#d0b25a"`. IND_TIERS Lv3에 `"mfi"`. 서브패널 20/80. nodeExpert에 합성거래량 카베아트. 커밋 `feat(forge): MFI 추가(Lv3·자금흐름)`.

### Task C2: CMF `cmf`

**Interfaces:** `cmfSeries(data, period) → [-1..1]`, `analyzeCMF(data, opts) → { series(raw −1..1), last, bias }`, `cmfSteps()`.

- [ ] **Step 1: 실패 테스트**

```js
test("analyzeCMF: 종가가 봉 상단서 마감+거래량이면 bias>0", () => {
  const candle = Array.from({length:30},(_,i)=>({o:100+i,h:100.8+i,l:99.9+i,c:100.7+i}));  // 상단 마감
  const price = candle.map(c=>c.c), volume = price.map(()=>1000);
  const r = ForgeCore.analyzeCMF({ candle, price, volume }, { period:20 });
  assert.ok(r.bias > 0, `bias ${r.bias}`);
});
```

- [ ] **Step 2~3: 실패 + 구현**

```js
function _cmfRaw(data, period) {
  const price = data.price || (data.candle||[]).map(c=>c.c), candle = data.candle || [];
  const vol = (Array.isArray(data.volume) && data.volume.length === price.length) ? data.volume : synthVolume(price);
  const P = price.length, mfv = new Array(P).fill(0), out = new Array(P).fill(0);
  for (let i=0;i<P;i++){ const c=candle[i]; if(!c){mfv[i]=0;continue;} const rng=c.h-c.l; mfv[i]= rng<=0?0: (((c.c-c.l)-(c.h-c.c))/rng)*(vol[i]||0); }
  for (let i=0;i<P;i++){ let mf=0, v=0, s=Math.max(0,i-period+1); for(let j=s;j<=i;j++){ mf+=mfv[j]; v+=(vol[j]||0); } out[i]= v===0?0: mf/v; }
  return out;
}
function cmfSeries(data, period) { return _cmfRaw(data, period||20).map(v => Math.max(-1, Math.min(1, v))); }
function analyzeCMF(data, opts) {
  opts = opts || {};
  const raw = _cmfRaw(data, opts.period||20), P = raw.length;
  if (!P) return { series: [], last: 0, bias: 0 };
  const last = raw[P-1], bias = Math.max(-1, Math.min(1, last*2));   // ±0.5→±1
  return { series: raw, last, bias };
}
function cmfSteps() {
  return [ { k:"CMF", v:"Σ(자금흐름량) / Σ(거래량)" }, { k:"방향", v:">0 매집 / <0 분산" }, { k:"주의", v:"합성거래량 시 참고용" } ];
}
```
export 추가.
- [ ] **Step 4~9:** evalBlocks `cmfSeries(data,(n.params&&n.params.period)||20)`, 드리프트 cap `0.05`. BLOCK_DEFS `{ type:"cmf", label:"CMF", kind:"block", params:{ period:20 } }`. EV_COLORS `cmf:"#5ac0a0"`. IND_TIERS **Lv4**에 `"cmf"`. 서브패널 0선. nodeExpert 카베아트. 커밋 `feat(forge): CMF 추가(Lv4·자금흐름)`.

---

# Task D: 최종 통합 검증 · 등급/기본표시 확인 · 배포

- [ ] **Step 1: 전체 node 테스트** — Run: `node --test forge-core.test.js` → 전부 PASS(기존 회귀 0 + 신규 11종 방향 테스트).

- [ ] **Step 2: IND_TIERS 최종 배치 확인** — `forge.html`의 `IND_TIERS`가 스펙과 일치:
  - Lv2에 `pivot, psar` 포함(7종)
  - Lv3에 `cci, williams, aroon, keltner, donchian, mfi` 포함(11종)
  - Lv4에 `roc, ao, cmf` 포함(7종)
  - `EV_DEFAULT_VISIBLE`에 `pivot, psar` 포함.

- [ ] **Step 3: 헤드리스 전수 검증** — 각 신규 지표를 켰을 때 작도·서브패널·시연 로그가 뜨는지 스크린샷 확인(Task A1 명령 재사용, `_evVisible`에 각 id 주입하는 probe). 30개 지표 레일이 Lv1~Lv4로 정렬되는지 확인.

- [ ] **Step 4: 시뮬레이션(playAnalysis) 동작 확인** — 신규 지표 포함 상태로 시연 실행 시 throw 없이 진행 로그·예측 모핑 정상. `_playHudUserCollapsed` 로직과 무충돌.

- [ ] **Step 5: 라이브 회귀(코어)** — 기존 샘플 포지(BTC-USD)로 예측·배지가 이전과 크게 어긋나지 않는지 확인(신규 지표 기본 off라 기본 예측 불변, pivot/psar만 기본 on이라 드리프트 소폭 반영 — cap 낮아 지배 안 함).

- [ ] **Step 6: 커밋 + 배포** — 커밋 후 cafe24 업로드(`forge.html`+`forge-core.js` 동반):

```bash
git add -A && git commit -m "feat(forge): 지표 11종 커버리지 완성 — 통합 검증"
lftp -u 'parksvc,wjdtjd2@' sftp://parksvc.mycafe24.com <<'EOF'
set sftp:auto-confirm yes
cd www/map
put forge.html
put forge-core.js
bye
EOF
```
`forge-core.test.js`·JSON 데이터는 배포 제외.

- [ ] **Step 7: 라이브 확인** — `curl -s https://parksvc.mycafe24.com/map/forge.html | grep -c 'pivot\|psar\|keltner'` > 0. 브라우저에서 레일 30종·Lv 정렬·신규 작도 확인.

---

## 자체 검증 메모(계획 작성자)

- 스펙 11종 전부 태스크 존재(A1-4, B1-5, C1-2). ✅
- 각 태스크: 실패테스트 → 구현 → 통과 → 배선 → UI → 헤드리스 → 커밋의 TDD 사이클. ✅
- 드리프트 cap 스펙 일치: pivot .04 · psar .08 · keltner .06 · donchian .07 · cci .06 · williams .05 · roc .06 · ao .06 · aroon .06 · mfi .06 · cmf .05. ✅
- 함수명 일관: `analyzeX`/`xSeries`/`xSteps` + evalBlocks `xid` 케이스 + `xDrift` in `_drifts`. ✅
- H/L 필요 지표(williams·ao·aroon·mfi·cmf·keltner·donchian·pivot·psar)는 evalBlocks/드리프트에서 **`data`**(candle 포함) 전달 — 종가만 넘기지 말 것. ✅
- 거래량 의존(mfi·cmf)은 `synthVolume` 폴백 + 카베아트. ✅
