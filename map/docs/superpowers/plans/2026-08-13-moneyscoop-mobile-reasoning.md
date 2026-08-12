# REASONING · 32 NODES Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Full 리포트(3스쿱)에 32종 지표별 영어 판독문 섹션을 붙이고, `AGAINST THIS CALL` 의 빈 문장 칸을 같은 출처로 채운다.

**Architecture:** 신규 UMD 모듈 `www/readings.js`(`MSReadings`)가 `blockType → say(result, ctx) → string` 표를 든다. `www/indicators.js` 에 `readings()` 를 추가해 지표마다 `analyzeX` 를 **한 번** 부르고 `{type, bias, text}` 를 낸다. `screens/report.js` 는 `draw()` 에서 그 배열을 한 번 계산해 판정 tally · REASONING · AGAINST 셋에 나눠 준다.

**Tech Stack:** 바닐라 JS(ES5 스타일 — `var`/`function`, 화살표·템플릿리터럴·optional chaining 금지) · UMD(브라우저 전역 + node `require`) · `node --test` · 빌드 도구 없음.

설계서: `map/docs/superpowers/specs/2026-08-12-moneyscoop-mobile-reasoning-design.md`

## Global Constraints

- **엔진 무수정.** `map/forge-core.js` · `map/forge-tools.js` 를 건드리지 않는다. `mobile/www/vendor/` 는 `sync-engine.mjs` 생성물이라 **직접 수정 금지**.
- **테스트는 항상 `./tests/run.sh`** (저장소 루트 `map/` 에서). 시작 시 629건, 끝날 때 약 645건. `forge-core` 259 · `forge-tools` 81 · `landing` 28 은 **무변동이어야 한다**.
- **UI 문자열은 영어.** 화면에 나가는 문자열에 한글이 있으면 안 된다. 주석은 한국어(WHY 만).
- **색은 토큰만.** `var(--ink-2)` 등. 하드코딩 금지. **항목 좌측 세로 컬러 라인 절대 금지.**
- **새 데이터·백테스트·외부 호출 0회.** 문장은 `analyzeX` 반환 필드에서만 나온다.
- **파생 계산은 엔진이 준 배열 안에서만.** `plusDI`/`minusDI` 를 훑어 선행 봉 수를 세는 것은 허용, 새 지표 계산은 금지.
- **모듈 스코프 상태 금지** — `readings.js` 는 순수 함수만. 캐시를 두지 않는다.
- 들여쓰기 2 spaces · 큰따옴표.

## 목표 출력 (계획 단계에서 실증)

아래는 이 계획서의 포매터 코드를 스크래치패드에서 실제로 돌려 얻은 32행이다(fixture 300봉). **한글 0 · throw 0 · 짧은 시계열(20·5봉)에서 빈 문장 0** 을 확인했다. 구현이 끝나면 이 표가 나와야 한다.

```
adx           16 and easing, trend still weak, +DI ahead for 2 bars
ao            -0.6, below the zero line
aroon         Up 36 / down 88, oscillator -52 — the low is the more recent extreme
atr           0.9% of price per bar, volatility normal — this sizes the cone, not the direction
bollinger     Mid band, %B 0.78, midline rising
cci           88, inside the ±100 band, no regime bias
cmf           +0.01, no clear accumulation
cycle         27-bar cycle, rising toward the next peak, turn in about 6 bars
donchian      73% up the 137.14–147.88 range, midline flat
elliott       Wave count unclear, currently in wave B, no projection (67% of wave rules met)
fib           Up swing, price at the swing high as support, 3 swing degrees measured
gann          Below the 1×1 line at 151.18 by 4.3%, anchored at 121.94
ichimoku      Above the cloud, cloud bullish, tenkan crossed down 5 bars ago
keltner       In the upper half of the channel 134.63–147.49
ma            Aligned up, no crossover in range
macd          Histogram +0.1 and rising, golden cross on this bar
mfi           45, neutral, no regime bias on money flow
pattern       Head and shoulders, 73% fit, not yet confirmed
pivot         Between R1 144.07 and R2 145.75, levels from the previous bar
psar          Dots below price at 137.26, 5.3% away
roc           +4.2% over the lookback, momentum positive
rsi           62, neutral, above the 50 line
smc           2 open gaps left behind
stochastic    %K 77 / %D 44, neutral, bullish cross 2 bars ago
structure     Higher highs and higher lows, no break of structure yet (swing 137.97–144.96)
supertrend    Trend line below price at 140.94, 2.8% from a flip, flipped bullish 1 bar ago
volume        Normal volume at 1.03x average, confirming, bullish divergence
volumeprofile Above the value area 129.25–144.91, heaviest trade at 132.90
vwap          Price 2.2% above VWAP 141.89
williams      -10, overbought in its lookback range
trend         Rising channel over 300 bars, price in the upper half     ← 기여도 —
phasefold     Used only where the engine blends nodes — no standalone reading   ← 기여도 —
```

fixture 는 합성 시세다. **실 종목에서 읽어보는 것은 Task 6 Step 9 와 실기기 확인의 몫이다.**

---

## File Structure

| 파일 | 책임 | 상태 |
|---|---|---|
| `map/mobile/www/readings.js` | `blockType → 영어 판독문` 표(30 + 방향없는 2). 순수 함수 | **신규** |
| `map/mobile/test/readings.test.mjs` | 판독문 계약(키 일치·한글·EMPTY·32 합계) | **신규** |
| `map/mobile/www/indicators.js` | `analyzeX` 호출 형태 표 + `readings()`/`opposing()` | 수정 |
| `map/mobile/test/indicators.test.mjs` | `readings()` · `opposing()` 회귀 | 수정 |
| `map/mobile/www/screens/report.js` | REASONING 섹션 조립 · 단일 계산 경로 | 수정 |
| `map/mobile/www/strings.js` | 섹션 문자열 | 수정 |
| `map/mobile/www/style.css` | 행 스타일(`.rp-reason-*`) | 수정 |
| `map/mobile/www/index.html` | `readings.js` 스크립트 태그 | 수정 |
| `map/mobile/docs/BACKLOG-mobile.md` | 완료 기록 · 실기기 확인 항목 | 수정 |

`readings.js` 는 `indicators.js` 와 형제다. `indicators.js` 는 "호출 형태 표"가 목적인 97줄 파일이고, 여기에 30종 영어 산문을 넣으면 목적이 둘인 400줄이 된다.

---

## Task 1: `readings.js` 뼈대 — 계약과 Lv1 5종

**Files:**
- Create: `map/mobile/www/readings.js`
- Create: `map/mobile/test/readings.test.mjs`
- Modify: `map/mobile/www/index.html`

**Interfaces:**
- Consumes: `MSIndicators.SHAPES`(blockType 30종 키) · `MSIndicators.NO_BIAS`(`["trend","phasefold"]`) · `MSStr.MA_ALIGN`/`VOL_STATE`/`VOL_REL`/`BB_STATE`/`RSI_ZONE`/`SR`
- Produces:
  - `MSReadings.SAY` — `{ [blockType]: function(result, ctx) → string }`, 키 30개
  - `MSReadings.NO_DIR` — `{ trend: fn, phasefold: fn }`, 키 2개
  - `MSReadings.NONE` — `"Not enough bars to read"`
  - `MSReadings.say(blockType, result, ctx) → string` — 표에 없으면 `""`
  - `ctx` 규약: `{ price: number[], candle: object[] }`

- [ ] **Step 1: 계약 테스트를 먼저 쓴다 (실패해야 한다)**

`map/mobile/test/readings.test.mjs` 를 만든다. fixture 는 `test/indicators.test.mjs` 의 것을 그대로 옮긴다(결정론적 사인 합성 — `Math.random` 없음).

```js
import { test } from "node:test";
import assert from "node:assert";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const R = require("../www/readings.js");
const I = require("../www/indicators.js");
const FC = require("../../forge-core.js");

function fixture(n = 300, drift = 0.0012) {
  const price = [], candle = [];
  let p = 100;
  for (let i = 0; i < n; i++) {
    const o = p;
    p = p * (1 + drift + Math.sin(i * 0.7) * 0.012 + Math.cos(i * 0.23) * 0.006);
    price.push(p);
    candle.push({ o, h: Math.max(o, p) * 1.006, l: Math.min(o, p) * 0.994, c: p, v: 1e6 * (1 + 0.3 * Math.sin(i * 0.4)) });
  }
  return { price, candle, volume: candle.map(c => c.v) };
}

// analyzeX 를 SHAPES 대로 부른다. indicators.js 의 callOne 은 비공개라 여기서 다시 쓴다 —
// 테스트가 구현을 통해 값을 얻으면 항등식이 된다.
function callOne(bt, d, opts) {
  const spec = I.SHAPES[bt], fn = FC[spec[0]];
  if (spec[1] === "price") return fn(d.price, opts || {});
  if (spec[1] === "priceVol") return fn(d.price, d.volume, opts || {});
  if (spec[1] === "candle") return fn(d.candle, opts || {});
  return fn(d, opts || {});
}
const ctxOf = d => ({ price: d.price, candle: d.candle });

test("SAY 의 키는 SHAPES 의 키와 정확히 같다", () => {
  assert.deepEqual(Object.keys(R.SAY).sort(), Object.keys(I.SHAPES).sort());
});

test("NO_DIR 은 NO_BIAS 와 같다 — 방향을 못 묻는 둘", () => {
  assert.deepEqual(Object.keys(R.NO_DIR).sort(), I.NO_BIAS.slice().sort());
});

test("SAY 30 + NO_DIR 2 = 엔진의 indicatorCount 32", () => {
  assert.strictEqual(Object.keys(R.SAY).length + Object.keys(R.NO_DIR).length,
                     FC.indicatorCount, "머리의 '32 NODES' 가 거짓이 된다");
});

test("30종 전부 비지 않은 문장을 낸다", () => {
  const d = fixture(), ctx = ctxOf(d);
  const empty = Object.keys(R.SAY).filter(bt => {
    const s = R.say(bt, callOne(bt, d), ctx);
    return typeof s !== "string" || s.trim().length === 0;
  });
  assert.deepEqual(empty, [], "문장이 빈 지표: " + empty.join(", "));
});

// 이 저장소가 두 번 당한 자리 — *Steps() 누출, 그리고 반환 필드 안의 한국어
// (pattern.label · cycle.phaseLabel · fib.degrees[].name).
test("화면에 나가는 문장에 한글이 없다 — 전수", () => {
  const KO = /[가-힣]/;
  const d = fixture(), ctx = ctxOf(d);
  const bad = [];
  Object.keys(R.SAY).forEach(bt => {
    const s = R.say(bt, callOne(bt, d), ctx);
    if (KO.test(s)) bad.push(bt + ": " + s);
  });
  bad.push(...["trend", "phasefold"]
    .map(bt => [bt, R.say(bt, bt === "trend" ? FC.analyzeTrend(d.price, {}) : null, ctx)])
    .filter(([, s]) => KO.test(s))
    .map(([bt, s]) => bt + ": " + s));
  assert.deepEqual(bad, [], "한글이 새는 판독문: " + bad.join(" | "));
});

// 신규 상장주는 월봉 이력이 짧다. 빈 문장이 아니라 이유를 적어야 한다.
[20, 5].forEach(n => {
  test("짧은 시계열(" + n + "봉)에서도 throw 없이 문장이 나온다", () => {
    const d = fixture(n), ctx = ctxOf(d);
    Object.keys(R.SAY).forEach(bt => {
      let s;
      assert.doesNotThrow(() => { s = R.say(bt, callOne(bt, d), ctx); }, bt + " 가 throw 했다");
      assert.ok(typeof s === "string" && s.trim().length > 0, bt + " 가 빈 문장을 냈다");
    });
    // 방향 없는 둘도 같은 계약을 진다 — SAY 만 돌리면 이 경로가 안 덮인다
    assert.ok(R.say("trend", FC.analyzeTrend(d.price, {}), ctx).trim().length > 0);
    assert.ok(R.say("phasefold", null, ctx).trim().length > 0);
  });
});

test("표에 없는 blockType 은 빈 문자열", () => {
  assert.strictEqual(R.say("nosuch", {}, ctxOf(fixture())), "");
});
```

- [ ] **Step 2: 테스트가 실패하는지 확인한다**

Run: `cd map/mobile && node --test test/readings.test.mjs`
Expected: FAIL — `Cannot find module '../www/readings.js'`

- [ ] **Step 3: `readings.js` 를 만든다 — 헬퍼 + Lv1 5종 + NO_DIR 2종, 나머지 25종은 `NONE` 반환 스텁**

```js
// 지표별 영어 판독문. 시안 6a 의 REASONING · 32 NODES 와 AGAINST THIS CALL 이 같은 행 모양을
// 쓰므로 출처도 하나다.
//
// 규율 셋:
//   1. 출처는 analyzeX 반환 필드뿐이다. 새 데이터·백테스트·외부 호출 0회.
//   2. 파생 계산은 엔진이 준 배열 안에서만 한다(예: +DI 선행 봉 수). 새 지표 계산 금지.
//   3. **반환 필드 안에 한국어가 있다** — pattern.label("헤드앤숄더") · cycle.phaseLabel ·
//      fib.degrees[].name("단기"). 반드시 영어 키(pattern.pattern·cycle.dir)로 조립한다.
//      buildCounted() 가 *Steps() 로 당한 것과 같은 자리인데 필드 안에 숨어 있다.
//
// 데이터가 모자라면 빈 문장이 아니라 이유를 적는다(NONE) — 결핍 박스와 같은 태도.
(function (root, factory) {
  if (typeof module !== "undefined" && module.exports) module.exports = factory(require("./strings.js"));
  else root.MSReadings = factory(root.MSStr);
})(typeof self !== "undefined" ? self : this, function (Str) {
  "use strict";

  // 상태 어휘는 MSStr 공유 맵에서 읽는다 — MSLegend(레전드)와 같은 개념을 각자 하드코딩하면
  // 대소문자가 갈린다(Phase 3 에서 실제로 갈렸다).
  var MA_ALIGN = (Str && Str.MA_ALIGN) || {};
  var VOL_STATE = (Str && Str.VOL_STATE) || {};
  var VOL_REL = (Str && Str.VOL_REL) || {};
  var BB_STATE = (Str && Str.BB_STATE) || {};
  var RSI_ZONE = (Str && Str.RSI_ZONE) || {};
  var SR = (Str && Str.SR) || {};

  var NONE = "Not enough bars to read";

  function cap(s) { return s ? s.charAt(0).toUpperCase() + s.slice(1) : s; }
  function n0(v) { return (v == null || !isFinite(v)) ? "—" : String(Math.round(v)); }
  function n1(v) { return (v == null || !isFinite(v)) ? "—" : String(Math.round(v * 10) / 10); }
  function sgn1(v) { return (v == null || !isFinite(v)) ? "—" : (v >= 0 ? "+" : "") + n1(v); }
  // 가격 표기는 MSUi.fmtPrice·MSLegend 와 같은 규칙 — 1000 미만은 두 자리, 이상은 반올림.
  function px(v) {
    if (v == null || !isFinite(v)) return "—";
    return Math.abs(v) < 1000 ? v.toFixed(2) : Math.round(v).toLocaleString();
  }
  function bars(k) { return k === 0 ? "on this bar" : k === 1 ? "1 bar ago" : k + " bars ago"; }
  function has(a) { return !!(a && a.length); }
  function lastOf(a) { return has(a) ? a[a.length - 1] : null; }

  var SAY = {
    ma: function (r) {
      if (!r.mas || !r.mas.long) return NONE;
      var s = cap(MA_ALIGN[r.align.order] || "mixed");
      s += r.cross.type
        ? ", " + (r.cross.type === "golden" ? "golden" : "dead") + " cross " + bars(r.cross.barsAgo)
        : ", no crossover in range";
      if (r.sr.ma) s += ", price at the " + r.sr.ma + " line as " + (SR[r.sr.side] || r.sr.side);
      return s;
    },

    macd: function (r) {
      if (!has(r.hist)) return NONE;
      var s = "Histogram " + sgn1(r.last.hist) + " and " + (r.rising ? "rising" : "falling");
      s += r.cross.type
        ? ", " + (r.cross.type === "bull" ? "golden" : "dead") + " cross " + bars(r.cross.barsAgo)
        : ", no crossover in range";
      return s;
    },

    rsi: function (r) {
      if (!has(r.series)) return NONE;
      var above = (r.cross50 === "above" || r.cross50 === "cross_up");
      var s = n0(r.last) + ", " + (RSI_ZONE[r.zone] || r.zone) + ", " + (above ? "above" : "below") + " the 50 line";
      if (r.divergence && r.divergence.type) s += ", " + r.divergence.type + " divergence";
      return s;
    },

    bollinger: function (r) {
      if (!has(r.pctB)) return NONE;
      var s = cap(BB_STATE[r.state] || "mid band") + (r.squeeze ? " in a squeeze" : "");
      s += ", %B " + (isFinite(r.last.pctB) ? r.last.pctB.toFixed(2) : "—");
      s += ", midline " + (r.midSlope > 0.02 ? "rising" : r.midSlope < -0.02 ? "falling" : "flat");
      return s;
    },

    volume: function (r) {
      if (!has(r.series)) return NONE;
      var s = cap(VOL_STATE[r.state] || "normal") + " volume at " + (isFinite(r.ratio) ? r.ratio.toFixed(2) : "—")
            + "x average, " + (VOL_REL[r.relationship] || "weakening");
      if (r.divergence && r.divergence.type) s += ", " + r.divergence.type + " divergence";
      return s;
    }
  };

  // Task 2~4 가 채운다. 스텁이 있어야 키 일치·한글·EMPTY 계약 테스트가 처음부터 돈다.
  ["adx", "stochastic", "fib", "ichimoku", "pivot", "psar", "gann",
   "vwap", "supertrend", "atr", "volumeprofile", "structure", "keltner", "donchian",
   "cci", "williams", "aroon", "mfi",
   "elliott", "smc", "cycle", "roc", "ao", "cmf", "pattern"].forEach(function (bt) {
    SAY[bt] = function () { return NONE; };
  });

  // 방향을 물을 수 없는 둘 — analyzeTrend 는 bias 를 안 주고, phasefold 는 analyzeX 자체가 없다
  // (엔진이 combine 안에서만 쓴다). 문장은 쓰되 기여도 칸은 비운다.
  var NO_DIR = {
    trend: function (r, ctx) {
      if (!r || !r.channel || !r.windows) return NONE;
      var w = r.windows[r.dominant] || r.windows.long;
      if (!w) return NONE;
      var price = (ctx && ctx.price) || [];
      var p = lastOf(price);
      if (p == null) return NONE;
      var line = r.channel.bRaw + r.channel.slopeRaw * (price.length - 1);
      var dir = r.channel.slopeRaw > 0 ? "Rising" : r.channel.slopeRaw < 0 ? "Falling" : "Flat";
      return dir + " channel over " + w.m + " bars, price in the " + (p >= line ? "upper" : "lower") + " half";
    },
    phasefold: function () {
      return "Used only where the engine blends nodes — no standalone reading";
    }
  };

  function say(blockType, result, ctx) {
    var fn = SAY[blockType] || NO_DIR[blockType];
    if (!fn) return "";
    try { return fn(result || {}, ctx || {}) || NONE; }
    catch (e) { return NONE; }   // 판독문 하나가 화면 전체를 죽이지 않는다
  }

  return { SAY: SAY, NO_DIR: NO_DIR, NONE: NONE, say: say };
});
```

- [ ] **Step 4: 테스트가 통과하는지 확인한다**

Run: `cd map/mobile && node --test test/readings.test.mjs`
Expected: PASS — 계약 테스트 전부 초록. 25종은 아직 `NONE` 이지만 "비지 않은 문장"은 만족한다.

- [ ] **Step 5: `index.html` 에 스크립트 태그를 넣는다**

`indicators.js` 태그 **바로 뒤**에 넣는다(`readings.js` 는 `MSStr` 만 참조하므로 `strings.js` 보다 뒤이기만 하면 된다).

```html
<script src="readings.js"></script>
```

- [ ] **Step 6: 전량 관문**

Run: `cd map && ./tests/run.sh`
Expected: PASS. 629 → 638건 근처(신규 9 테스트). `forge-core` 259 · `forge-tools` 81 · `landing` 28 무변동.

- [ ] **Step 7: 커밋**

```bash
cd /home/jschoi0223/projects/vdiportal
git add map/mobile/www/readings.js map/mobile/test/readings.test.mjs map/mobile/www/index.html
git commit -m "$(cat <<'EOF'
mobile: 판독문 모듈 뼈대 — 계약을 먼저 못박는다

시안 6a 의 REASONING · 32 NODES 를 위한 www/readings.js. Lv1 5종만 실제
문장이고 나머지 25종은 스텁이지만, 계약 테스트는 처음부터 전부 돈다:
SAY 키 ≡ SHAPES 키 · SAY 30 + NO_DIR 2 ≡ indicatorCount 32 · 전수 한글
정규식 · 짧은 시계열(20·5봉)에서 throw 없이 문장.

한글 관문이 핵심이다. *Steps() 가 한국어인 것은 알고 있었지만 **반환 필드
안에도 한국어가 있다** — pattern.label · cycle.phaseLabel · fib.degrees[].name.
Task 2~4 가 이 관문 아래서 나머지를 채운다.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: Lv2 지표 7종 판독문

`adx` · `stochastic` · `fib` · `ichimoku` · `pivot` · `psar` · `gann` (`trend` 은 `NO_DIR`, Task 1 에서 끝났다)

**Files:**
- Modify: `map/mobile/www/readings.js` (스텁 7개를 실제 구현으로)
- Modify: `map/mobile/test/readings.test.mjs` (실제 문자열 어서션 추가)

**Interfaces:**
- Consumes: Task 1 의 헬퍼 `cap`/`n0`/`n1`/`sgn1`/`px`/`bars`/`has`/`lastOf` · `NONE` · `RSI_ZONE`/`SR`
- Produces: 없음(표를 채울 뿐)

- [ ] **Step 1: 실제 문장 어서션을 먼저 쓴다**

`readings.test.mjs` 끝에 추가한다. **기대값은 구현에서 유도하지 않고 문자열 리터럴로 박는다** — 이 저장소에서 "기대값을 구현 상수로 계산"이 3회 재발했다.

```js
// fixture(300) 에서 실제로 나오는 문장. 계획 단계에서 스크래치 구현을 돌려 출력을 읽고
// 확정한 값이다 — 포매터에서 유도하면 항등식이 되므로 리터럴로 박는다.
// 값이 바뀌면 그것은 회귀이거나 의도한 변경이고, 둘 다 사람이 봐야 한다.
const EXPECT_LV2 = {
  adx: "16 and easing, trend still weak, +DI ahead for 2 bars",
  stochastic: "%K 77 / %D 44, neutral, bullish cross 2 bars ago",
  fib: "Up swing, price at the swing high as support, 3 swing degrees measured",
  ichimoku: "Above the cloud, cloud bullish, tenkan crossed down 5 bars ago",
  pivot: "Between R1 144.07 and R2 145.75, levels from the previous bar",
  psar: "Dots below price at 137.26, 5.3% away",
  gann: "Below the 1×1 line at 151.18 by 4.3%, anchored at 121.94"
};

test("Lv2 7종이 시안 6a 어투의 문장을 낸다", () => {
  const d = fixture(), ctx = ctxOf(d);
  const got = {};
  Object.keys(EXPECT_LV2).forEach(bt => { got[bt] = R.say(bt, callOne(bt, d), ctx); });
  assert.deepEqual(got, EXPECT_LV2);
});
```

`EXPECT_LV2` 는 테스트 파일 상단(fixture 아래)에 둔다.

- [ ] **Step 2: 테스트가 실패하는지 확인한다**

Run: `cd map/mobile && node --test test/readings.test.mjs`
Expected: FAIL — 7종이 전부 `"Not enough bars to read"` 라 정규식이 안 맞는다.

- [ ] **Step 3: 7종을 구현한다**

`readings.js` 의 스텁 등록 배열에서 이 7개를 빼고, `SAY` 에 아래를 추가한다.

```js
    // ADX 강도 어휘. 숫자만으로는 "16 and rising" 이 강한 추세처럼 읽혀 오도한다.
    // (SAY 밖, 모듈 상단 상수 자리에 둔다)
    // var ADX_STRENGTH = { very_strong: "trend very strong", strong: "trend strong",
    //                      developing: "trend forming", weak: "trend still weak" };

    adx: function (r) {
      if (!has(r.adx)) return NONE;
      var li = r.adx.length - 1;
      var up = r.last.plusDI >= r.last.minusDI;
      // 선행 봉 수 — 엔진이 이미 준 배열을 훑는다(새 계산 아님)
      var lead = 0;
      for (var i = li; i > 0; i--) {
        if ((r.plusDI[i] >= r.minusDI[i]) !== up) break;
        lead++;
      }
      var prev = r.adx[Math.max(0, li - 5)];
      var rising = r.adx[li] >= prev;
      return n0(r.last.adx) + " and " + (rising ? "rising" : "easing")
           + ", " + (ADX_STRENGTH[r.strength] || "trend still weak")
           // 마이너스는 ASCII 하이픈으로 통일한다 — 기여도 칸이 toFixed() 라 ASCII 다.
           // 판독문만 유니코드 −(U+2212)를 쓰면 한 행 안에서 표기가 갈린다.
           + ", " + (up ? "+DI" : "-DI") + " ahead for " + lead + (lead === 1 ? " bar" : " bars");
    },

    stochastic: function (r) {
      if (!has(r.k)) return NONE;
      var s = "%K " + n0(r.last.k) + " / %D " + n0(r.last.d) + ", " + (RSI_ZONE[r.state] || r.state);
      if (r.cross && r.cross.type)
        s += ", " + (r.cross.type === "bull" ? "bullish" : "bearish") + " cross " + bars(r.cross.barsAgo);
      return s;
    },

    fib: function (r) {
      if (!has(r.levels)) return NONE;
      var z = r.zone || {}, near = z.nearest;
      var s = cap(r.dir === "up" ? "up" : r.dir === "down" ? "down" : "flat") + " swing";
      if (near) {
        // ratio 0 은 되돌림이 아니라 스윙 극점 자체다 — "the 0 level" 로 적으면 뜻이 안 통한다
        var at = (near.ratio === 0)
          ? "the swing " + (r.dir === "up" ? "high" : "low")
          : "the " + near.ratio + " retracement";
        s += ", price at " + at + " as " + (SR[near.side] || near.side);
      } else {
        s += ", price mid-range";
      }
      if (z.inGolden) s += ", inside the golden pocket";
      // degrees 는 "몇 개 척도로 쟀나"이지 "몇 개가 동의하나"가 아니다 — 동의로 적으면 거짓 귀속
      if (r.degrees && r.degrees.length > 1) s += ", " + r.degrees.length + " swing degrees measured";
      return s;
    },

    ichimoku: function (r) {
      if (!has(r.spanA)) return NONE;
      var pos = r.pricePos === "above" ? "Above the cloud"
              : r.pricePos === "below" ? "Below the cloud" : "Inside the cloud";
      var s = pos + ", cloud " + (r.cloud === "bull" ? "bullish" : r.cloud === "bear" ? "bearish" : "flat");
      s += r.tkCross.type
        ? ", tenkan crossed " + (r.tkCross.type === "bull" ? "up " : "down ") + bars(r.tkCross.barsAgo)
        : ", no tenkan cross in range";
      // 짧은 이력에선 엔진이 기간을 압축한다. 안 적으면 같은 문장이 다른 계산을 가리킨다.
      if (r.scaled) s += " (periods scaled to short history)";
      return s;
    },

    pivot: function (r) {
      if (!r.P || !has(r.R) || !has(r.S)) return NONE;
      var p = r.last, s;
      if (p > r.R[2]) s = "Above R3 " + px(r.R[2]);
      else if (p > r.R[1]) s = "Between R2 " + px(r.R[1]) + " and R3 " + px(r.R[2]);
      else if (p > r.R[0]) s = "Between R1 " + px(r.R[0]) + " and R2 " + px(r.R[1]);
      else if (p > r.P) s = "Between the pivot " + px(r.P) + " and R1 " + px(r.R[0]);
      else if (p > r.S[0]) s = "Between S1 " + px(r.S[0]) + " and the pivot " + px(r.P);
      else if (p > r.S[1]) s = "Between S2 " + px(r.S[1]) + " and S1 " + px(r.S[0]);
      else if (p > r.S[2]) s = "Between S3 " + px(r.S[2]) + " and S2 " + px(r.S[1]);
      else s = "Below S3 " + px(r.S[2]);
      return s + ", levels from the previous bar";
    },

    psar: function (r) {
      if (!has(r.series)) return NONE;
      var gap = (r.last && isFinite(r.last)) ? Math.abs(r.last - r.sar) / r.last * 100 : 0;
      return (r.dir > 0 ? "Dots below price" : "Dots above price") + " at " + px(r.sar)
           + ", " + n1(gap) + "% away" + (r.flip ? ", flipped on this bar" : "");
    },

    gann: function (r) {
      if (!has(r.angles)) return NONE;
      var d = (r.last && isFinite(r.last)) ? Math.abs(r.last - r.oneOne) / r.last * 100 : 0;
      var s = (r.last >= r.oneOne ? "Above" : "Below") + " the 1×1 line at " + px(r.oneOne) + " by " + n1(d) + "%";
      return s + (r.anchor ? ", anchored at " + px(r.anchor.price) : ", no anchor swing");
    },
```

모듈 상단(헬퍼 아래, `SAY` 위)에 상수를 둔다:

```js
  var ADX_STRENGTH = { very_strong: "trend very strong", strong: "trend strong",
                       developing: "trend forming", weak: "trend still weak" };
```

- [ ] **Step 4: 실제 출력을 눈으로 읽는다**

`EXPECT_LV2` 는 계획 단계에서 확정한 값이라 Step 5 가 통과하면 일치한다. 그래도 **출력을 사람이 읽는다** — 어서션은 "문자열이 같다"만 알지 "영어로 말이 되는지"는 모른다.

```bash
cd map/mobile && node -e '
const R = require("./www/readings.js"), I = require("./www/indicators.js"), FC = require("../forge-core.js");
const price=[],candle=[]; let p=100;
for(let i=0;i<300;i++){const o=p;p=p*(1+0.0012+Math.sin(i*0.7)*0.012+Math.cos(i*0.23)*0.006);price.push(p);candle.push({o,h:Math.max(o,p)*1.006,l:Math.min(o,p)*0.994,c:p,v:1e6*(1+0.3*Math.sin(i*0.4))});}
const d={price,candle,volume:candle.map(c=>c.v)}, ctx={price,candle};
const call=bt=>{const s=I.SHAPES[bt],f=FC[s[0]];return s[1]==="price"?f(d.price,{}):s[1]==="priceVol"?f(d.price,d.volume,{}):s[1]==="candle"?f(d.candle,{}):f(d,{});};
["adx","stochastic","fib","ichimoku","pivot","psar","gann"].forEach(bt=>console.log(JSON.stringify(bt)+": "+JSON.stringify(R.say(bt,call(bt),ctx))+","));
'
```

어색한 문장이 있으면 포매터와 `EXPECT_LV2` 를 **함께** 고친다. 계획서의 값이 성경이 아니다 — 읽어서 이상하면 그게 근거다.

- [ ] **Step 5: 테스트가 통과하는지 확인한다**

Run: `cd map/mobile && node --test test/readings.test.mjs`
Expected: PASS

- [ ] **Step 6: 전량 관문 + 커밋**

```bash
cd map && ./tests/run.sh
cd /home/jschoi0223/projects/vdiportal
git add map/mobile/www/readings.js map/mobile/test/readings.test.mjs
git commit -m "$(cat <<'EOF'
mobile: Lv2 7종 판독문 — adx·stochastic·fib·ichimoku·pivot·psar·gann

값에 붙는 어휘를 함께 적는다. "16 and rising" 만 쓰면 강한 추세처럼 읽히므로
ADX_STRENGTH 로 "trend still weak" 을 붙였고, fib 의 degrees 는 "몇 개 척도로
쟀나"이지 "몇 개가 동의하나"가 아니라 measured 로 적었다(동의로 적으면 거짓 귀속).
ratio 0 은 되돌림이 아니라 스윙 극점이라 "the swing high" 로 갈랐다.

기대값은 구현에서 유도하지 않고 실제 출력을 읽고 리터럴로 박았다.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: Lv3 지표 11종 판독문

`vwap` · `supertrend` · `atr` · `volumeprofile` · `structure` · `keltner` · `donchian` · `cci` · `williams` · `aroon` · `mfi`

**Files:**
- Modify: `map/mobile/www/readings.js`
- Modify: `map/mobile/test/readings.test.mjs`

**Interfaces:**
- Consumes: Task 1 의 헬퍼 · `NONE`
- Produces: 없음

- [ ] **Step 1: 어서션을 먼저 쓴다**

```js
const EXPECT_LV3 = {
  vwap: "Price 2.2% above VWAP 141.89",
  supertrend: "Trend line below price at 140.94, 2.8% from a flip, flipped bullish 1 bar ago",
  atr: "0.9% of price per bar, volatility normal — this sizes the cone, not the direction",
  volumeprofile: "Above the value area 129.25–144.91, heaviest trade at 132.90",
  structure: "Higher highs and higher lows, no break of structure yet (swing 137.97–144.96)",
  keltner: "In the upper half of the channel 134.63–147.49",
  donchian: "73% up the 137.14–147.88 range, midline flat",
  cci: "88, inside the ±100 band, no regime bias",
  williams: "-10, overbought in its lookback range",
  aroon: "Up 36 / down 88, oscillator -52 — the low is the more recent extreme",
  mfi: "45, neutral, no regime bias on money flow"
};

test("Lv3 11종이 문장을 낸다", () => {
  const d = fixture(), ctx = ctxOf(d);
  const got = {};
  Object.keys(EXPECT_LV3).forEach(bt => { got[bt] = R.say(bt, callOne(bt, d), ctx); });
  assert.deepEqual(got, EXPECT_LV3);
});

// ATR 은 bias 가 항상 0 이다 — 변동성은 방향이 아니다. 문장이 그것을 말해야
// "왜 기여도가 0이냐"가 결함으로 오독되지 않는다.
test("ATR 판독문은 방향이 아니라는 것을 말한다", () => {
  const d = fixture();
  const s = R.say("atr", callOne("atr", d), ctxOf(d));
  assert.match(s, /not the direction/);
});
```

- [ ] **Step 2: 실패 확인**

Run: `cd map/mobile && node --test test/readings.test.mjs`
Expected: FAIL — 11종이 `NONE` 이라 `EXPECT_LV3` 와 다르다

- [ ] **Step 3: 11종을 구현한다**

스텁 배열에서 이 11개를 빼고 `SAY` 에 추가한다.

```js
    vwap: function (r) {
      if (!has(r.vwap)) return NONE;
      var side = r.pct >= 0 ? "above" : "below";
      return "Price " + n1(Math.abs(r.pct)) + "% " + side + " VWAP " + px(r.last);
    },

    supertrend: function (r, ctx) {
      if (!has(r.line)) return NONE;
      var s = (r.dir > 0 ? "Trend line below price" : "Trend line above price") + " at " + px(r.last);
      var p = lastOf((ctx && ctx.price) || []);
      // 플립까지의 거리 — 시안 6a 의 "Sitting 0.4% from a bearish flip" 이 이 값이다
      if (p != null && isFinite(p) && p !== 0)
        s += ", " + n1(Math.abs(p - r.last) / p * 100) + "% from a flip";
      if (r.flip && r.flip.barsAgo != null)
        s += ", flipped " + (r.flip.dir > 0 ? "bullish " : "bearish ") + bars(r.flip.barsAgo);
      return s;
    },

    // bias 가 항상 0 인 유일한 지표다. 문장이 그 이유를 말하지 않으면
    // 기여도 0.00 이 "못 읽었다"로 오독된다.
    atr: function (r) {
      if (!has(r.atr)) return NONE;
      return n1(r.pct) + "% of price per bar, volatility " + (r.regime || "normal")
           + " — this sizes the cone, not the direction";
    },

    volumeprofile: function (r) {
      if (!has(r.bins)) return NONE;
      var rel = r.priceRel === "above" ? "Above the value area"
              : r.priceRel === "below" ? "Below the value area" : "Inside the value area";
      return rel + " " + px(r.val) + "–" + px(r.vah) + ", heaviest trade at " + px(r.poc);
    },

    structure: function (r) {
      if (!has(r.swings)) return NONE;
      var tr = r.trend === "up" ? "Higher highs and higher lows"
             : r.trend === "down" ? "Lower highs and lower lows" : "No clear swing structure";
      var lo = r.swingLow ? r.swingLow.price : null, hi = r.swingHigh ? r.swingHigh.price : null;
      return tr + ", " + (STRUCT_EVENT[r.event] || "no break of structure yet")
           + " (swing " + px(lo) + "–" + px(hi) + ")";
    },

    keltner: function (r) {
      if (!has(r.midArr)) return NONE;
      var pos = r.pctB >= 1 ? "Above the upper channel"
              : r.pctB <= 0 ? "Below the lower channel"
              : r.pctB >= 0.5 ? "In the upper half of the channel" : "In the lower half of the channel";
      return pos + " " + px(r.lower) + "–" + px(r.upper) + (r.squeeze ? ", channel squeezing" : "");
    },

    donchian: function (r) {
      if (!has(r.midArr)) return NONE;
      return n0(r.pos * 100) + "% up the " + px(r.lower) + "–" + px(r.upper) + " range, midline "
           + (r.midSlope > 0 ? "rising" : r.midSlope < 0 ? "falling" : "flat");
    },

    cci: function (r) {
      if (!has(r.series)) return NONE;
      // 마이너스는 ASCII 하이픈 — 기여도 칸(toFixed)과 표기를 맞춘다
      var z = r.last >= 100 ? "above +100, stretched up"
            : r.last <= -100 ? "below -100, stretched down" : "inside the ±100 band";
      return n0(r.last) + ", " + z + ", " + REGIME[r.regime];
    },

    williams: function (r) {
      if (!has(r.series)) return NONE;
      var z = r.last >= -20 ? "overbought" : r.last <= -80 ? "oversold" : "neutral";
      return n0(r.last) + ", " + z + " in its lookback range";
    },

    aroon: function (r) {
      if (r.up === 0 && r.down === 0 && r.osc === 0) return NONE;
      return "Up " + n0(r.up) + " / down " + n0(r.down) + ", oscillator " + sgn1(r.osc)
           + " — the " + (r.osc >= 0 ? "high" : "low") + " is the more recent extreme";
    },

    mfi: function (r) {
      if (!has(r.series)) return NONE;
      var z = r.last >= 80 ? "overbought" : r.last <= 20 ? "oversold" : "neutral";
      return n0(r.last) + ", " + z + ", " + REGIME[r.regime] + " on money flow";
    },
```

모듈 상단 상수에 추가:

```js
  var STRUCT_EVENT = {
    BOS_up: "broke structure upward", BOS_down: "broke structure downward",
    CHoCH_up: "character change up — possible reversal",
    CHoCH_down: "character change down — possible reversal",
    none: "no break of structure yet"
  };
  // analyzeCCI·analyzeMFI 의 regime 은 1 / 0 / −1 숫자다
  var REGIME = { "1": "bullish regime", "0": "no regime bias", "-1": "bearish regime" };
```

- [ ] **Step 4: 실제 출력을 눈으로 읽는다**

Task 2 Step 4 의 스크립트에서 배열만 바꿔 실행하고 11행을 읽는다. 어색하면 포매터와 `EXPECT_LV3` 를 함께 고친다.

- [ ] **Step 5: 테스트 통과 확인**

Run: `cd map/mobile && node --test test/readings.test.mjs`
Expected: PASS

- [ ] **Step 6: 전량 관문 + 커밋**

```bash
cd map && ./tests/run.sh
cd /home/jschoi0223/projects/vdiportal
git add map/mobile/www/readings.js map/mobile/test/readings.test.mjs
git commit -m "$(cat <<'EOF'
mobile: Lv3 11종 판독문

ATR 은 bias 가 항상 0 인 유일한 지표다 — 문장이 "sizes the cone, not the
direction" 이라고 말하지 않으면 기여도 0.00 이 "못 읽었다"로 오독된다.
supertrend 는 시안 6a 의 "Sitting 0.4% from a bearish flip" 을 위해 현재가와
선 사이 거리를 적는다(ctx.price 사용).

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: Lv4 지표 7종 판독문 — 한국어 필드 셋이 여기 있다

`elliott` · `smc` · `cycle` · `roc` · `ao` · `cmf` · `pattern` (`phasefold` 은 `NO_DIR`, Task 1 에서 끝났다)

**Files:**
- Modify: `map/mobile/www/readings.js`
- Modify: `map/mobile/test/readings.test.mjs`

**Interfaces:**
- Consumes: Task 1 의 헬퍼 · `NONE`
- Produces: 없음

⚠️ **이 태스크가 한국어 누출의 진원지다.** `pattern.label` = `"헤드앤숄더"`, `cycle.phaseLabel` = `"상승 국면(저점→고점)"`, `fib.degrees[].name` = `"단기"`(Task 2 에서 이미 회피). 영어 키만 쓴다: `pattern.pattern` ∈ `{headshoulder, invhead, bullflag, bearflag, none}`, `cycle.dir` ∈ `{rising, falling, flat}`.

- [ ] **Step 1: 어서션을 먼저 쓴다**

```js
const EXPECT_LV4 = {
  elliott: "Wave count unclear, currently in wave B, no projection (67% of wave rules met)",
  smc: "2 open gaps left behind",
  cycle: "27-bar cycle, rising toward the next peak, turn in about 6 bars",
  roc: "+4.2% over the lookback, momentum positive",
  ao: "-0.6, below the zero line",
  cmf: "+0.01, no clear accumulation",
  pattern: "Head and shoulders, 73% fit, not yet confirmed"
};

test("Lv4 7종이 문장을 낸다", () => {
  const d = fixture(), ctx = ctxOf(d);
  const got = {};
  Object.keys(EXPECT_LV4).forEach(bt => { got[bt] = R.say(bt, callOne(bt, d), ctx); });
  assert.deepEqual(got, EXPECT_LV4);
});

// 반환 필드 안의 한국어를 실제로 우회했는지 — 전수 한글 테스트가 이미 잡지만,
// 이 둘은 "왜 그 필드를 안 쓰는지"가 코드에서 안 보이므로 이름으로 못박는다.
test("pattern·cycle 은 한국어 필드를 쓰지 않는다", () => {
  const d = fixture();
  const pat = callOne("pattern", d), cyc = callOne("cycle", d);
  assert.ok(/[가-힣]/.test(pat.label), "엔진이 pattern.label 을 한국어로 주는 전제가 깨졌다");
  assert.ok(/[가-힣]/.test(cyc.phaseLabel), "엔진이 cycle.phaseLabel 을 한국어로 주는 전제가 깨졌다");
  assert.ok(!R.say("pattern", pat, ctxOf(d)).includes(pat.label));
  assert.ok(!R.say("cycle", cyc, ctxOf(d)).includes(cyc.phaseLabel));
});
```

- [ ] **Step 2: 실패 확인**

Run: `cd map/mobile && node --test test/readings.test.mjs`
Expected: FAIL — 7종이 `NONE` 이라 `EXPECT_LV4` 와 다르다

- [ ] **Step 3: 7종을 구현한다**

스텁 배열은 이제 비므로 `forEach` 스텁 등록 블록을 **통째로 지운다**.

```js
    elliott: function (r) {
      if (!has(r.waves)) return NONE;
      var s = (ELLIOTT_STRUCT[r.structure] || "Wave count unclear")
            + ", currently in wave " + ((r.current && r.current.label) || "—");
      s += (r.next && r.next.target != null)
        ? ", next target " + px(r.next.target)
        : ", no projection";
      return s + " (" + n0((r.rules && r.rules.score ? r.rules.score : 0) * 100) + "% of wave rules met)";
    },

    smc: function (r) {
      if (!r.ok) return NONE;
      var f = (r.fvgs || []).length, o = (r.obs || []).length;
      if (!f && !o) return "No open fair-value gaps or order blocks";
      // 0 인 쪽은 적지 않는다 — "and 0 order blocks" 는 말할 값이 없는 것을 말하는 것이다
      var parts = [];
      if (f) parts.push(f + (f === 1 ? " open gap" : " open gaps"));
      if (o) parts.push(o + (o === 1 ? " order block" : " order blocks"));
      return parts.join(" and ") + " left behind";
    },

    // ⚠ cycle.phaseLabel 은 한국어다("고점 부근(하락 전환 임박)"). dir 로 조립한다.
    cycle: function (r) {
      if (!r.period) return NONE;
      var ph = r.dir === "rising" ? "rising toward the next peak"
             : r.dir === "falling" ? "falling toward the next trough" : "flat";
      var s = n0(r.period) + "-bar cycle, " + ph;
      if (r.nextTurn && r.nextTurn.bars != null)
        s += ", turn in about " + r.nextTurn.bars + (r.nextTurn.bars === 1 ? " bar" : " bars");
      return s;
    },

    roc: function (r) {
      if (!has(r.series)) return NONE;
      return sgn1(r.last) + "% over the lookback, momentum "
           + (r.last > 0 ? "positive" : r.last < 0 ? "negative" : "flat");
    },

    ao: function (r) {
      if (!has(r.series)) return NONE;
      var s = sgn1(r.last) + ", " + (r.last >= 0 ? "above" : "below") + " the zero line";
      if (r.cross) s += ", crossed " + (r.cross > 0 ? "up" : "down") + " on this bar";
      return s;
    },

    cmf: function (r) {
      if (!has(r.series)) return NONE;
      var d = r.last > 0.05 ? "accumulation" : r.last < -0.05 ? "distribution" : "no clear accumulation";
      return (r.last >= 0 ? "+" : "") + (isFinite(r.last) ? r.last.toFixed(2) : "—") + ", " + d;
    },

    // ⚠ pattern.label 은 한국어다("헤드앤숄더"). 영어 키 pattern.pattern 으로 매핑한다.
    pattern: function (r) {
      if (!r.pattern || r.pattern === "none") return "No completed chart pattern in range";
      return (PATTERN_NAME[r.pattern] || "Chart pattern")
           + ", " + n0((r.confidence || 0) * 100) + "% fit, "
           + (r.confirmed ? "confirmed by the break" : "not yet confirmed");
    },
```

모듈 상단 상수에 추가:

```js
  var ELLIOTT_STRUCT = { impulse_up: "Impulse count, upward", impulse_down: "Impulse count, downward",
                         corrective: "Corrective count", uncertain: "Wave count unclear" };
  // ⚠ analyzePattern 의 label 은 한국어다 — 영어 키(pattern)로만 매핑한다
  var PATTERN_NAME = { headshoulder: "Head and shoulders", invhead: "Inverse head and shoulders",
                       bullflag: "Bull flag", bearflag: "Bear flag" };
```

- [ ] **Step 4: 30종 전체를 눈으로 읽는다**

```bash
cd map/mobile && node -e '
const R = require("./www/readings.js"), I = require("./www/indicators.js"), FC = require("../forge-core.js");
const price=[],candle=[]; let p=100;
for(let i=0;i<300;i++){const o=p;p=p*(1+0.0012+Math.sin(i*0.7)*0.012+Math.cos(i*0.23)*0.006);price.push(p);candle.push({o,h:Math.max(o,p)*1.006,l:Math.min(o,p)*0.994,c:p,v:1e6*(1+0.3*Math.sin(i*0.4))});}
const d={price,candle,volume:candle.map(c=>c.v)}, ctx={price,candle};
const call=bt=>{const s=I.SHAPES[bt],f=FC[s[0]];return s[1]==="price"?f(d.price,{}):s[1]==="priceVol"?f(d.price,d.volume,{}):s[1]==="candle"?f(d.candle,{}):f(d,{});};
Object.keys(I.SHAPES).sort().forEach(bt=>console.log(bt.padEnd(15)+R.say(bt,call(bt),ctx)));
console.log("trend".padEnd(15)+R.say("trend",FC.analyzeTrend(d.price,{}),ctx));
console.log("phasefold".padEnd(15)+R.say("phasefold",null,ctx));
'
```

**30행을 전부 읽는다.** 영어로 말이 안 되는 문장, 같은 말을 두 번 하는 문장, 30자를 크게 넘는 문장이 있으면 고친다. 이 검토가 이 태스크의 본체다.

- [ ] **Step 5: 테스트 통과 확인**

Run: `cd map/mobile && node --test test/readings.test.mjs`
Expected: PASS — 전수 한글 테스트가 이제 실제 문장 30개를 검사한다

- [ ] **Step 6: 전량 관문 + 커밋**

```bash
cd map && ./tests/run.sh
cd /home/jschoi0223/projects/vdiportal
git add map/mobile/www/readings.js map/mobile/test/readings.test.mjs
git commit -m "$(cat <<'EOF'
mobile: Lv4 7종 판독문 — 한국어 반환 필드를 우회한다

pattern.label 은 "헤드앤숄더", cycle.phaseLabel 은 "상승 국면(저점→고점)" 이다.
영어 키(pattern.pattern · cycle.dir)로만 조립한다. 전수 한글 정규식 외에
"엔진이 그 필드를 한국어로 준다"는 전제 자체를 어서션으로 박아 뒀다 — 엔진이
나중에 영어로 바꾸면 우회가 불필요해졌음을 이 테스트가 알려준다.

이로써 30종 + 방향없는 2종 판독문이 전부 채워졌다.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: `MSIndicators.readings()` — 단일 계산 경로

**Files:**
- Modify: `map/mobile/www/indicators.js`
- Modify: `map/mobile/test/indicators.test.mjs`

**Interfaces:**
- Consumes: `MSReadings.say` · `MSReadings.NO_DIR` · 기존 `SHAPES`/`callOne`/`NO_BIAS`
- Produces:
  - `MSIndicators.readings(FC, graph, data, ctx) → [{ type: string, bias: number, text: string }]`
    — `graph` 에 실제로 올라간 지표만. `bias` 를 못 읽으면 그 항목은 빠진다(현행 `biases()` 와 같은 규칙). 정렬 없음.
  - `MSIndicators.noDirRows(FC, data, ctx) → [{ type, bias: null, text }]`
    — `trend`·`phasefold` 2행. `bias` 는 `null`(0 과 구분).
  - `MSIndicators.opposing(FC, graph, data, regime)` — **시그니처 유지**, 내부만 `readings()` 위로 옮긴다. 반환 항목에 `text` 가 추가된다.

- [ ] **Step 1: 테스트를 먼저 쓴다**

`test/indicators.test.mjs` 끝에 추가한다.

```js
const R = require("../www/readings.js");
const ctxOf = d => ({ price: d.price, candle: d.candle });

test("readings() 의 bias 는 biases() 와 정확히 같다 — 방향 경로가 두 벌이 되지 않는다", () => {
  const d = fixture(), g = MSGraph.full32Graph(FC);
  const a = I.biases(FC, g, d).map(r => r.type + ":" + r.bias);
  const b = I.readings(FC, g, d, ctxOf(d)).map(r => r.type + ":" + r.bias);
  assert.deepEqual(b, a);
});

test("readings() 는 모든 항목에 비지 않은 문장을 붙인다", () => {
  const d = fixture(), g = MSGraph.full32Graph(FC);
  const rows = I.readings(FC, g, d, ctxOf(d));
  assert.ok(rows.length >= 28, "Full 그래프에서 30종 가까이 나와야 한다: " + rows.length);
  rows.forEach(r => assert.ok(r.text && r.text.trim().length > 0, r.type + " 에 문장이 없다"));
});

test("Basic 그래프에선 5종만 나온다", () => {
  const d = fixture(), g = MSGraph.basicGraph(FC);
  const types = I.readings(FC, g, d, ctxOf(d)).map(r => r.type).sort();
  assert.deepEqual(types, ["bollinger", "ma", "macd", "rsi", "volume"]);
});

test("noDirRows() 는 bias null 인 2행 — 0(중립)과 구분한다", () => {
  const d = fixture();
  const rows = I.noDirRows(FC, d, ctxOf(d));
  assert.deepEqual(rows.map(r => r.type), ["trend", "phasefold"]);
  rows.forEach(r => {
    assert.strictEqual(r.bias, null, r.type + " 의 bias 는 null 이어야 한다");
    assert.ok(r.text && r.text.trim().length > 0);
  });
});

test("opposing() 은 종전과 같은 목록을 내고 문장이 붙는다", () => {
  const d = fixture(), g = MSGraph.full32Graph(FC);
  ["bull", "bear"].forEach(regime => {
    const rows = I.opposing(FC, g, d, regime);
    const want = regime === "bull" ? -1 : 1;
    rows.forEach(r => {
      assert.ok(Math.abs(r.bias) > I.EPS, r.type + " 가 데드존 안에 있다");
      assert.strictEqual(r.bias > 0 ? 1 : -1, want, r.type + " 의 방향이 틀렸다");
      assert.ok(r.text && r.text.trim().length > 0, r.type + " 에 문장이 없다");
    });
    // |bias| 내림차순
    for (let i = 1; i < rows.length; i++)
      assert.ok(Math.abs(rows[i - 1].bias) >= Math.abs(rows[i].bias), "정렬이 깨졌다");
  });
  assert.deepEqual(I.opposing(FC, g, d, "flat"), [], "중립엔 반대가 정의되지 않는다");
});
```

- [ ] **Step 2: 실패 확인**

Run: `cd map/mobile && node --test test/indicators.test.mjs`
Expected: FAIL — `I.readings is not a function`

- [ ] **Step 3: `indicators.js` 를 고친다**

UMD 머리에서 `readings.js` 를 받는다:

```js
(function (root, factory) {
  if (typeof module !== "undefined" && module.exports) module.exports = factory(require("./readings.js"));
  else root.MSIndicators = factory(root.MSReadings);
})(typeof self !== "undefined" ? self : this, function (Readings) {
```

`biases()` 아래에 추가하고 `opposing()` 을 갈아끼운다:

```js
  // 지표마다 analyzeX 를 **한 번** 부르고 방향과 문장을 함께 뽑는다.
  // biases() 를 부른 뒤 say() 를 위해 또 부르면 Full 에서 analyzeX 가 60회가 된다.
  function readings(FC, graph, data, ctx) {
    var out = [];
    var nodes = (graph && graph.nodes) || [];
    for (var i = 0; i < nodes.length; i++) {
      var n = nodes[i];
      if (!n.blockType || !SHAPES[n.blockType]) continue;
      var r = callOne(FC, n.blockType, data, n.params);
      if (!r || typeof r.bias !== "number" || !isFinite(r.bias)) continue;
      out.push({ type: n.blockType, bias: r.bias,
                 text: Readings ? Readings.say(n.blockType, r, ctx) : "" });
    }
    return out;
  }

  // 방향을 물을 수 없는 둘. bias 는 null 이다 — 0(중립)과 구분해야 화면이
  // "중립"과 "못 읽음"을 다르게 그린다.
  function noDirRows(FC, data, ctx) {
    var trend = null;
    try { trend = FC && FC.analyzeTrend ? FC.analyzeTrend(data.price, {}) : null; } catch (e) { trend = null; }
    return [
      { type: "trend", bias: null, text: Readings ? Readings.say("trend", trend, ctx) : "" },
      { type: "phasefold", bias: null, text: Readings ? Readings.say("phasefold", null, ctx) : "" }
    ];
  }

  // 판정과 **반대** 방향인 지표들. 시안 6a 의 AGAINST THIS CALL.
  // 중립 판정에는 반대가 없다 — 부른 방향이 없으면 무엇이 반대인지도 정의되지 않는다.
  // rows 를 받으면 그것을 쓴다(호출자가 이미 계산한 경우 재계산하지 않는다).
  function opposing(FC, graph, data, regime, rows) {
    if (regime !== "bull" && regime !== "bear") return [];
    var want = regime === "bull" ? 1 : -1;
    var src = rows || readings(FC, graph, data, null);
    return src
      .filter(function (r) { return Math.abs(r.bias) > EPS && (r.bias > 0 ? 1 : -1) !== want; })
      .sort(function (a, b) { return Math.abs(b.bias) - Math.abs(a.bias); });
  }
```

반환 객체에 추가:

```js
  return { SHAPES: SHAPES, NO_BIAS: NO_BIAS, biasOf: biasOf, biases: biases,
           readings: readings, noDirRows: noDirRows, opposing: opposing, EPS: EPS };
```

**`biases()` 와 `biasOf()` 는 그대로 남긴다.** 지우지 않는다 — `readings()` 의 bias 가 맞는지 대조하는 **테스트 오라클**이기 때문이다. 두 경로가 같은 값을 낸다는 것을 계속 검사할 수 있어야 한다.

화면 쪽 소비자는 Task 6 이 옮긴다 — `screens/report.js` 의 `buildVerdict()` tally 와 `buildAgainst()` 분모 둘이 `MSIndicators.biases()` 를 부르고 있고, Task 6 이 그것을 `readings()` 결과를 받는 형태로 바꾼다. **이 태스크에서는 `report.js` 를 건드리지 않는다.**

- [ ] **Step 4: 테스트 통과 확인**

Run: `cd map/mobile && node --test test/indicators.test.mjs test/readings.test.mjs`
Expected: PASS

- [ ] **Step 5: 전량 관문 + 커밋**

```bash
cd map && ./tests/run.sh
cd /home/jschoi0223/projects/vdiportal
git add map/mobile/www/indicators.js map/mobile/test/indicators.test.mjs
git commit -m "$(cat <<'EOF'
mobile: readings() — analyzeX 를 한 번만 부른다

지금 Full 은 같은 30종을 세 번 돈다(buildVerdict tally · opposing · 분모).
readings() 가 지표마다 analyzeX 를 한 번 부르고 방향과 문장을 함께 낸다.
opposing() 은 시그니처를 유지한 채 rows 를 받으면 재계산하지 않는다.

bias null 과 0 을 구분한다 — noDirRows() 의 trend·phasefold 는 "중립"이
아니라 "방향을 못 묻는다"이고, 화면이 그 둘을 다르게 그려야 한다.

biases() 는 남긴다 — readings() 와 대조하는 테스트 오라클이다.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: 화면 배선 — REASONING 섹션

**Files:**
- Modify: `map/mobile/www/strings.js`
- Modify: `map/mobile/www/style.css`
- Modify: `map/mobile/www/screens/report.js:470-533`(buildVerdict) · `:576-588`(buildSignals) · `:632-658`(buildAgainst) · `:755-793`(draw)
- Modify: `map/mobile/test/strings.test.mjs`

**Interfaces:**
- Consumes: `MSIndicators.readings` · `MSIndicators.noDirRows` · `MSIndicators.opposing(…, rows)` · `MSStr.t.rpReasoning` 외
- Produces: 없음(화면이 종점)

- [ ] **Step 1: 문자열을 추가한다**

`strings.js` 의 `t` 안, `rpAgainst` 근처에 넣는다.

```js
    rpReasoning: "Reasoning",                    // 시안 6a: "REASONING · 32 NODES" — .overline 이 대문자로 만든다
    rpReasoningNodes: " nodes",                  // 머리 오른쪽 캡션 앞부분 — "32 nodes"
    rpReasoningScope: "daily · ",                // 판독은 일봉 기준(헤드라인 판정과 같은 주기)
    rpReasoningDir: " with a direction",         // "daily · 30 with a direction"
    rpNoDirDash: "—",                            // 방향을 못 묻는 둘의 기여도 칸
```

`test/strings.test.mjs` 에 기존 "죽은 키 없음" 패턴이 있으면 그것이 자동으로 검사한다. 없으면 이 태스크에서 추가하지 않는다(범위 밖).

- [ ] **Step 2: 실패하는 테스트를 쓴다 — 화면 조립 규칙만 순수 함수로 검사**

`screens/report.js` 는 DOM 하네스가 없어 직접 테스트할 수 없다(백로그 기존 갭). 검사 가능한 것은 **행 조립 규칙**이므로 그것만 `readings.test.mjs` 에 넣는다.

```js
// REASONING 행 정렬 규칙 — |bias| 내림차순, 방향 없는 둘은 항상 최하단.
// report.js 에 DOM 테스트 하네스가 없어 정렬 함수만 따로 검사한다.
test("reasoningRows(): |bias| 내림차순, 방향 없는 둘은 최하단", () => {
  const d = fixture(), g = require("../www/graph.js").full32Graph(FC);
  const ctx = ctxOf(d);
  const rows = R.reasoningRows(I.readings(FC, g, d, ctx), I.noDirRows(FC, d, ctx));
  const dir = rows.filter(r => r.bias != null), nodir = rows.filter(r => r.bias == null);
  assert.strictEqual(rows.length, dir.length + nodir.length);
  assert.deepEqual(rows.slice(-2).map(r => r.type), ["trend", "phasefold"]);
  for (let i = 1; i < dir.length; i++)
    assert.ok(Math.abs(dir[i - 1].bias) >= Math.abs(dir[i].bias), "정렬이 깨졌다");
});
```

`R.reasoningRows` 를 `readings.js` 에 추가한다(순수 배열 조작이라 여기가 맞는 자리다):

```js
  // 화면 순서. 방향 있는 것은 |bias| 내림차순, 방향을 못 묻는 둘은 정렬에서 빠져 항상 맨 아래.
  function reasoningRows(withBias, noDir) {
    var s = (withBias || []).slice().sort(function (a, b) {
      return Math.abs(b.bias) - Math.abs(a.bias);
    });
    return s.concat(noDir || []);
  }
```

반환 객체에 `reasoningRows` 를 추가한다.

- [ ] **Step 3: 실패 확인**

Run: `cd map/mobile && node --test test/readings.test.mjs`
Expected: FAIL — `R.reasoningRows is not a function`

- [ ] **Step 4: `reasoningRows` 를 구현하고 테스트 통과 확인**

Run: `cd map/mobile && node --test test/readings.test.mjs`
Expected: PASS

- [ ] **Step 5: CSS 를 추가한다**

`style.css` 의 `.rp-against` 블록 **바로 위**에 넣고, `.rp-against-row`/`-name` 을 `.rp-reason-*` 에 얹는다.

```css
/* REASONING · 32 NODES(시안 6a) — 이름 78px · 문장 flex · 기여도. AGAINST 가 같은 행 모양을
   쓰므로 여기가 정본이다. 문장은 muted 로 고정 — 32행을 방향색으로 물들이면 차트 위에서
   걷어낸 다색 덩어리가 이 자리에 다시 선다. */
.rp-reason { margin-bottom:22px; }
.rp-reason-row { display:flex; align-items:flex-start; gap:12px;
                 padding:11px 0 10px; border-bottom:1px solid var(--hairline); font-size:12.5px; }
.rp-reason-row:last-child { border-bottom:0; }
.rp-reason-name { flex:0 0 78px; color:var(--ink-2); }
.rp-reason-text { flex:1; color:var(--ink-4); line-height:1.55; }
.rp-reason-bias { flex:0 0 auto; color:var(--ink-5); font-variant-numeric:tabular-nums; }
.rp-reason-bias.up { color:var(--bull-text); }
.rp-reason-bias.dn { color:var(--bear-text); }
```

`.rp-against-row` 를 정본에 맞춘다 — 기존 `justify-content:space-between` 을 지우고 같은 3칸 격자로 바꾼다:

```css
.rp-against-row { display:flex; align-items:flex-start; gap:12px;
                  padding:11px 0 10px; border-bottom:1px solid var(--hairline); font-size:12.5px; }
.rp-against-row:last-child { border-bottom:0; }
.rp-against-name { flex:0 0 78px; color:var(--ink-2); }
.rp-against-text { flex:1; color:var(--ink-4); line-height:1.55; }
.rp-against-bias { flex:0 0 auto; color:var(--bear-text); font-weight:600; font-variant-numeric:tabular-nums; }
```

⚠️ `--bull-text`/`--bear-text` 가 `:root` 에 있는지 확인한다. 없으면 `--bull`/`--bear` 를 쓴다 — **새 토큰을 만들지 않는다**(Phase 7→8a 에서 `--gold-soft` 가 지워졌다 되살아난 자리).

- [ ] **Step 6: `screens/report.js` 를 고친다 — 단일 계산 경로**

**6-1. `draw()` 위(`buildVerdict` 앞)에 rows 를 한 번 계산하는 자리를 만든다.** `draw()` 안 `state === "ready"` 분기 시작점에 둔다:

```js
      } else {
        // 지표 방향·판독문을 여기서 **한 번** 계산해 세 곳(판정 tally · REASONING · AGAINST)에
        // 나눠 준다. 예전엔 셋이 각자 MSIndicators 를 불러 Full 에서 analyzeX 가 90회 돌았다.
        var indRows = null, noDir = null;
        if (tier === "full" && an && an.graph) {
          var indInput = { price: data.price, candle: data.candle, volume: an.vol };
          var indCtx = { price: data.price, candle: data.candle };
          indRows = MSIndicators.readings(ForgeCore, an.graph, indInput, indCtx);
          noDir = MSIndicators.noDirRows(ForgeCore, indInput, indCtx);
        }
        scr.appendChild(buildPrice());
        scr.appendChild(buildVerdict(indRows));
        scr.appendChild(buildChartSection());
        scr.appendChild(buildChartLegend());
        var hz = buildHorizons();
        if (hz) scr.appendChild(hz);
        var sig = buildSignals();
        if (sig) scr.appendChild(sig);
        var reason = buildReasoning(indRows, noDir);
        if (reason) scr.appendChild(reason);
        var miss = buildMissing();
        if (miss) scr.appendChild(miss);
        var ag = buildAgainst(indRows);
        if (ag) scr.appendChild(ag);
      }
```

**6-2. `buildVerdict()` 가 rows 를 받게 한다.** `:485-496` 의 tally 블록을 바꾼다:

```js
      var tally;
      if (tier === "full" && indRows) {
        tally = { up: 0, flat: 0, down: 0 };
        indRows.forEach(function (r) {
          if (r.bias > MSIndicators.EPS) tally.up++;
          else if (r.bias < -MSIndicators.EPS) tally.down++;
          else tally.flat++;
        });
      } else {
        tally = MSLegend.tally(MSLegend.rows(an, pr, null));
      }
```

시그니처를 `function buildVerdict(indRows) {` 로 바꾼다.

**6-3. `buildSignals()` 를 Full 에서 내린다.** 함수 첫 줄에 넣는다:

```js
    function buildSignals() {
      // Full 은 REASONING 32행이 이 자리를 받는다 — 5종 판독이 그 안에 이미 들어가므로
      // 두 섹션이면 같은 말을 두 번 한다. Basic 은 종전대로 7행 + 크로스헤어 연동.
      if (tier === "full") return null;
      ...
```

머리의 `(tier === "full" ? 32 : 5) + …` 는 이제 Basic 만 지나므로 `5` 로 고정한다:

```js
      head.appendChild(MSUi.el("span", "rp-sec-note", "5" + MSStr.t.rpOf + "32" + MSStr.t.rpShown));
```

⚠️ `chartRefs.legend` 가 Full 에서 `null` 로 남는다. `buildChartSection()` 의 주석 `// legend 는 buildSignals() 가 채운다` 를 다음으로 바꾼다:

```js
    chartRefs = { wrap: wrap, cv: cv, legend: null };   // Basic 만 buildSignals() 가 채운다. Full 은 null(REASONING 이 대체)
```

`paintChart` 의 `frame()` 은 이미 `if (!legend) return;` 가드가 있어 그대로 성립한다 — **고치지 않는다.**

**6-4. `buildReasoning()` 을 새로 쓴다.** `buildMissing()` 바로 위에 둔다:

```js
    // 시안 6a 의 REASONING · 32 NODES — Full 이 3스쿱으로 주는 것의 본체.
    // 32종을 다 돌렸다는 말 대신 각 지표가 무엇을 보고 그 방향을 냈는지 문장으로 적는다.
    // 판독은 **일봉 기준**이다(헤드라인 판정과 같은 주기). 주·월 정합은 TIMEFRAME 행이 말한다.
    function buildReasoning(indRows, noDir) {
      if (tier !== "full" || !indRows) return null;
      var rows = MSReadings.reasoningRows(indRows, noDir);
      if (!rows.length) return null;
      var sec = MSUi.el("div", "rp-reason");
      var head = MSUi.el("div", "rp-sec-head");
      head.appendChild(MSUi.el("span", "overline",
        MSStr.t.rpReasoning + " · " + rows.length + MSStr.t.rpReasoningNodes));
      // 방향을 물을 수 있었던 수를 따로 적는다 — 32 라고만 쓰면 trend·phasefold 를
      // 센 것처럼 말하게 된다(AGAINST 분모와 같은 규율).
      head.appendChild(MSUi.el("span", "rp-sec-note",
        MSStr.t.rpReasoningScope + indRows.length + MSStr.t.rpReasoningDir));
      sec.appendChild(head);
      rows.forEach(function (r) {
        var row = MSUi.el("div", "rp-reason-row");
        row.appendChild(MSUi.el("span", "rp-reason-name", MSStr.ind(r.type)));
        row.appendChild(MSUi.el("span", "rp-reason-text", r.text));
        var cls = (r.bias == null) ? "" : r.bias > MSIndicators.EPS ? " up"
                : r.bias < -MSIndicators.EPS ? " dn" : "";
        var val = (r.bias == null) ? MSStr.t.rpNoDirDash
                : (r.bias > 0 ? "+" : "") + r.bias.toFixed(2);
        row.appendChild(MSUi.el("span", "rp-reason-bias" + cls, val));
        sec.appendChild(row);
      });
      return sec;
    }
```

**6-5. `buildAgainst()` 가 rows 를 받고 문장을 채우게 한다.** `:632-658` 을 바꾼다:

```js
    function buildAgainst(indRows) {
      if (tier !== "full" || !an || !an.graph || !indRows) return null;
      var regime = an.out.verdict.regime;
      if (regime !== "bull" && regime !== "bear") return null;   // 중립엔 반대가 정의되지 않는다
      var rows = MSIndicators.opposing(ForgeCore, an.graph, null, regime, indRows);
      // 분모는 32가 아니라 **방향을 물을 수 있었던 수**다(MSIndicators.NO_BIAS).
      var measured = indRows.length;
      var sec = MSUi.el("div", "rp-against");
      var head = MSUi.el("div", "rp-sec-head");
      head.appendChild(MSUi.el("span", "overline", MSStr.t.rpAgainst));
      head.appendChild(MSUi.el("span", "rp-sec-note", rows.length + MSStr.t.rpOf + measured));
      sec.appendChild(head);
      if (!rows.length) {
        sec.appendChild(MSUi.el("p", "rp-against-none", MSStr.t.rpAgainstNone));
        return sec;
      }
      rows.forEach(function (r) {
        var row = MSUi.el("div", "rp-against-row");
        row.appendChild(MSUi.el("span", "rp-against-name", MSStr.ind(r.type)));
        row.appendChild(MSUi.el("span", "rp-against-text", r.text));
        // 기여도는 부호까지 보여준다 — 반대 목록이라 부호가 판정 반대편이라는 사실 자체가 정보다.
        row.appendChild(MSUi.el("span", "rp-against-bias", (r.bias > 0 ? "+" : "") + r.bias.toFixed(2)));
        sec.appendChild(row);
      });
      return sec;
    }
```

`opposing()` 에 `data` 대신 `null` 을 넘기는 것이 맞다 — `indRows` 를 주면 내부에서 `data` 를 안 쓴다(Task 5 의 시그니처).

- [ ] **Step 7: 정적 검증 — 소스 회귀 테스트를 추가한다**

DOM 하네스가 없으므로 배선을 소스 정규식으로 잡는다. `import` 는 파일 **상단**(다른 import 옆)에, 테스트는 `readings.test.mjs` 끝에 넣는다.

```js
// 파일 상단으로
import { readFileSync } from "node:fs";

// 파일 끝으로
const REPORT = readFileSync(new URL("../www/screens/report.js", import.meta.url), "utf8");

test("Full 은 SIGNALS 를 내리고 REASONING 을 올린다", () => {
  assert.match(REPORT, /function buildSignals\(\)\s*\{[\s\S]{0,400}?if \(tier === "full"\) return null;/);
  assert.match(REPORT, /function buildReasoning\(indRows, noDir\)/);
});

test("지표 계산 경로가 draw() 한 곳뿐이다 — 90회 재계산 회귀 방지", () => {
  const calls = REPORT.match(/MSIndicators\.(readings|biases)\(/g) || [];
  assert.strictEqual(calls.length, 1, "MSIndicators 계산 호출: " + calls.join(", "));
});
```

- [ ] **Step 8: 테스트 통과 확인**

Run: `cd map/mobile && node --test test/readings.test.mjs`
Expected: PASS

- [ ] **Step 9: 브라우저에서 눈으로 본다**

```bash
cd map/mobile/www && python3 -m http.server 8000
```

`http://localhost:8000` → 종목 하나 → `Go deeper` → Full 실행. 확인할 것:
1. `SIGNALS` 섹션이 사라지고 `REASONING · 32 NODES` 가 그 자리에 있다.
2. 32행이 나오고 마지막 두 행이 `Trend` · `Phase fold` 이며 기여도가 `—` 다.
3. 머리 오른쪽에 `daily · 30 with a direction` 이 있다.
4. `AGAINST THIS CALL` 행에 문장이 채워졌다.
5. **화면 어디에도 한글이 없다.**
6. Basic 리포트는 `SIGNALS` 7행이 그대로이고 크로스헤어를 끌면 숫자가 움직인다.

- [ ] **Step 10: 전량 관문 + 커밋**

```bash
cd map && ./tests/run.sh
cd /home/jschoi0223/projects/vdiportal
git add map/mobile/www/strings.js map/mobile/www/style.css map/mobile/www/readings.js \
        map/mobile/www/screens/report.js map/mobile/test/readings.test.mjs
git commit -m "$(cat <<'EOF'
mobile: Full 에 REASONING · 32 NODES — 32종이 무엇을 보고 그 방향을 냈는지

Full 에서 SIGNALS 가 내려가고 REASONING 이 그 자리를 받는다. 32행 안에 5종
판독이 이미 들어가므로 두 섹션이면 같은 말을 두 번 한다. Basic 은 종전대로
SIGNALS 7행 + 크로스헤어 연동.

|bias| 내림차순, 방향을 못 묻는 trend·phasefold 는 이유를 적고 기여도 —.
머리는 32 유지하되 부제에 "daily · 30 with a direction" 을 붙였다 — 32 라고만
쓰면 세지 못한 둘을 센 것처럼 말하게 된다(AGAINST 분모와 같은 규율).

행 마크업 정본은 .rp-reason-row 이고 AGAINST 가 같은 3칸 격자를 쓴다.
문장은 muted 고정 — 32행을 방향색으로 물들이면 차트 위에서 걷어낸 다색
덩어리가 이 자리에 다시 선다.

지표 계산이 draw() 한 곳으로 모였다(Full 에서 analyzeX 90회 → 30회).
소스 정규식 테스트가 그 자리를 지킨다.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: 백로그 갱신

**Files:**
- Modify: `map/mobile/docs/BACKLOG-mobile.md`

**Interfaces:**
- Consumes: 없음
- Produces: 없음

- [ ] **Step 1: `✅ 완료` 에 항목을 추가한다**

`디자인 정합 패스` 항목 **위**(가장 최근이 위)에 넣는다. 실제로 겪은 것을 쓴다 — 구현 중 발견한 결함·정정이 있으면 반드시 포함한다.

```markdown
- **`REASONING · 32 NODES`**(2026-08-13, 시안 6a): Full 에 지표별 영어 판독문.
  - 신규 `www/readings.js`(`MSReadings`) — `blockType → say(result, ctx)` 30종 + 방향 없는 2종.
    `indicators.js` 는 "호출 형태 표"가 목적이라 섞지 않았다
  - **`*Steps()` 만 한국어인 게 아니었다** — 반환 필드 안에도 있다: `pattern.label`("헤드앤숄더") ·
    `cycle.phaseLabel`("상승 국면(저점→고점)") · `fib.degrees[].name`("단기"). 영어 키
    (`pattern.pattern` · `cycle.dir`)로만 조립했고, "엔진이 그 필드를 한국어로 준다"는 전제
    자체를 어서션으로 박아 뒀다 — 엔진이 영어로 바뀌면 우회가 불필요해졌음을 테스트가 알려준다
  - **Full 의 `SIGNALS` 가 `32 of 32 shown` 이라고 적으면서 7행만 보여주고 있었다.**
    REASONING 이 그 자리를 받고 SIGNALS 는 Basic 전용이 됐다.
    **Full 에선 크로스헤어를 끌어도 값이 움직이는 행이 없다**(차트 크로스헤어 자체는 남는다)
  - 머리는 `32 NODES` 유지, 부제에 `daily · 30 with a direction` — 32 라고만 쓰면
    `trend`·`phasefold` 를 센 것처럼 말하게 된다(AGAINST 분모와 같은 규율)
  - **`bias null` 과 `0` 을 구분한다** — "중립"과 "방향을 못 묻는다"는 다른 말이고 화면도 다르게 그린다
  - 판독은 **일봉 고정**(헤드라인 판정과 같은 주기). 세 주기를 다 깔면 96행이고 주·월은 `TIMEFRAME` 행이 말한다
  - **Full 이 같은 30종을 세 번 돌고 있었다**(판정 tally · `opposing` · 분모 = `analyzeX` 90회).
    `readings()` 로 `draw()` 에서 한 번 계산해 나눠 주도록 바꿔 30회가 됐다. 소스 정규식 테스트가 그 자리를 지킨다
  - 테스트 629 → NNN(`map/tests/run.sh`). **엔진 무수정** — `forge-core` 259 · `forge-tools` 81 · `landing` 28 무변동
  - 실기기 육안 확인은 **미실시** — 아래 참조
```

`NNN` 은 `./tests/run.sh` 실제 출력으로 채운다.

- [ ] **Step 2: `🔥 다음` 을 갱신한다**

1번(`REASONING · 32 NODES`)을 지우고 번호를 당긴다:

```markdown
## 🔥 다음

우선순위 순. 둘 다 사용자 선행 작업이 있다.

1. **실기기 확인** — Phase 5·6·7·8a + 디자인 정합 패스 + REASONING 이 전부 미검증이다.
   이 저장소의 검증은 전부 헤드리스(playwright)라 손맛·성능·터치 타깃은 못 본다.
2. **8b 서버 원장** — `probe-a7f3c2.php` 결과가 유일한 블로커.
```

- [ ] **Step 3: 미검증 절을 신설한다**

`## 미검증 — 사용자 확인 필요 (디자인 정합 패스, 2026-08-12)` **위**에 넣는다:

```markdown
## 미검증 — 사용자 확인 필요 (REASONING, 2026-08-13)

`cd map/mobile/www && python3 -m http.server 8000 --bind 0.0.0.0` 후 폰 Chrome 에서 Full 실행.

1. **32행이 읽히는 분량인가, 아니면 27칩 벽을 문장으로 바꿔 다시 세운 것인가.**
   이 패스의 핵심 가설이다. 벽으로 읽히면 상위 8행 + `Show all 32` 로 접는 대안이 있다.
2. **이름 78px 가 짧지 않은가** — `Inverse head and shoulders` 같은 긴 이름이 두 줄로 접힌다.
3. **문장이 muted 고정이라 밋밋한가** — 방향색을 주면 다색 덩어리가 되는 것이 우려였다.
4. **`Trend`·`Phase fold` 의 `—` 가 결함으로 읽히는가** — 문장이 이유를 적고 있지만
   목록 맨 아래 두 행만 수치가 비어 있다.
5. **Full 에서 크로스헤어를 끌어도 값이 안 변하는 것이 이상한가** — Basic 은 변한다.
   상위 티어에서 기능이 하나 빠지는 셈이라 어색하면 다시 볼 것.
6. **`AGAINST THIS CALL` 이 문장을 받고도 여전히 눈에 먼저 들어오는가** —
   위 REASONING 과 행 모양이 같아져 구별이 테두리 색뿐이다.
7. **판독문이 실제 종목에서 말이 되는가** — fixture 는 합성 시세다. 실 종목에서
   어색하거나 틀린 문장이 있으면 그 지표 이름과 함께 알려줄 것.
```

- [ ] **Step 4: `📋 예정` 을 정리한다**

- `**REASONING · 32 NODES**(시안 6a)` 항목을 지운다(완료).
- `**Counted 가 Full 에서도 5행이다**` 항목을 지운다 — REASONING 이 해소했다.
- `**시안 구조 차이 — Not checked at this level**` 항목의 마지막 능력
  (*Why each reading came out that way*)이 이제 구현됐음을 한 줄로 적는다.

- [ ] **Step 5: 커밋**

```bash
cd /home/jschoi0223/projects/vdiportal
git add map/mobile/docs/BACKLOG-mobile.md
git commit -m "$(cat <<'EOF'
docs(mobile): REASONING · 32 NODES 완료 기록 + 다음 순번 정리

🔥 다음 1번이 닫혔다. 남은 둘은 전부 사용자 선행이 있다(실기기 확인 · 8b).

기록한 것: 반환 필드 안의 한국어 셋 · Full 의 SIGNALS 가 "32 of 32" 라고
적으면서 7행만 보여주고 있었던 것 · bias null 과 0 의 구분 · analyzeX 90회 →
30회 · 크로스헤어 연동이 Full 에서 사라진 트레이드오프.

미검증 7항목 신설 — 1번(32행이 벽으로 읽히는가)이 이번 패스의 핵심 가설이다.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
EOF
)"
```

---

## 완료 조건

- `cd map && ./tests/run.sh` 전량 통과. `forge-core` 259 · `forge-tools` 81 · `landing` 28 무변동.
- `git diff --stat main -- map/forge-core.js map/forge-tools.js` 가 비어 있다(엔진 무수정).
- Full 리포트에 `REASONING · 32 NODES` 32행 · `AGAINST THIS CALL` 에 문장 · 화면에 한글 0.
- Basic 리포트는 변경 전과 동일.
- 백로그 `🔥 다음` 1번이 닫히고 미검증 절이 신설됐다.
