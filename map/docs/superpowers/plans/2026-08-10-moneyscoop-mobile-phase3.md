# 머니스쿱 모바일 Phase 3 — 고정 레전드 + 시안 카피 정합 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 지표 값을 차트 밖 고정 레전드로 빼서 버려지는 값을 0으로 만들고, UI 카피를 시안(영어)에 맞춘다.

**Architecture:** 레전드는 캔버스가 아니라 DOM이다. 값 계산은 순수 함수 모듈 `MSLegend.rows(an, pred, fi)`가 맡고 DOM 조립은 `report.js`가 한다 — 그래야 레전드 로직 전체를 노드에서 값으로 검증할 수 있다. 차트에는 위치가 의미를 갖는 것(선·마커·진앙)만 남는다. UI 문자열은 `MSStr` 한 파일로 모은다.

**Tech Stack:** 순수 UMD 바닐라 JS(빌드 도구 없음) · `node --test` · recording-ctx 페인트 단언

**설계 원본:** [`specs/2026-08-10-moneyscoop-mobile-phase3-design.md`](../specs/2026-08-10-moneyscoop-mobile-phase3-design.md)

## Global Constraints

- **`map/forge-draw.js` · `forge-app.js` · `forge-core.js` 는 한 줄도 수정하지 않는다.**
- **`mobile/www/vendor/` 는 절대 손대지 않는다** (gitignore 생성물).
- **테스트 관문은 `map/tests/run.sh`.** 빠른 확인은 `./tests/run.sh mobile`. **현재 baseline = mobile 119건 / 전체 479건.** 계획서에 적힌 절대 수치가 아니라 **델타**로 검증할 것.
- UMD 규약: `module.exports` + `root.MSXxx` 양쪽. `index.html` 스크립트 순서 고정, `defer`/`async` 금지.
- **UI 문자열은 영어.** 핸드오프가 `English-first` · `copy is decided` 를 명시했고 지표명은 인터페이스 언어와 무관하게 영어다(`Keep indicator names in English` 기본 ON). **주석은 계속 한국어**, WHY만.
- 모바일 자작 코드는 `var`/`function`. `forge-draw.js` 에서 복사한 블록은 원문 ES6 유지.
- 색상은 `style.css` 토큰 경유. 캔버스는 `readToken()` 으로 읽는다.

## 검증해 둔 사실 (계획서 작성 중 실측 — 그대로 신뢰해도 된다)

```
TAIL_BARS 120 → 예측구간 50px (16.3%) · 봉폭 2.15px   @ 373px
TAIL_BARS  60 → 예측구간 86px (28.0%) · 봉폭 3.68px   @ 373px
```

`analyze*` 반환 형태(모두 길이 480 배열 보유):
```
bb    .state .squeeze .bias .pctB[] .last{pctB,...}
rsi   .zone  .last .bias .series[] .divergence{type,pricePts}
macd  .state .bias .cross{type,barsAgo} .hist[] .last{hist,...}
va    .state .relationship .bias .series[] .divergence{type,pricePts}
ma    .align{order} .cross{type,barsAgo} .sr{ma,side} .bias .mas.{short,mid,long}.series[]
```
`ma.sr.ma` 는 `null` 일 수 있다(실측 확인) — 반드시 가드할 것.

## File Structure

| 파일 | 책임 | 상태 |
|---|---|---|
| `mobile/www/strings.js` | UI 문자열 단일 출처 `MSStr` (평평한 키-값 + 지표명 32종) | **신규** |
| `mobile/www/chart-legend.js` | `MSLegend.rows(an, pred, fi)` 순수 함수 | **신규** |
| `mobile/www/draw-layers.js` | 배지 게이트 2곳 + 잔존 라벨 영문 | 수정 |
| `mobile/www/chart-draw.js` | `endDeco` 라벨·예측가 끄기 | 수정 |
| `mobile/www/screens/report.js` | 레전드 DOM·갱신, 배지 호출 중단, `TAIL_BARS`, 카피 | 수정 |
| `mobile/www/screens/watchlist.js` | 카피 | 수정 |
| `mobile/www/style.css` | `.rp-legend` | 수정 |
| `mobile/www/index.html` | 스크립트 태그 2개 | 수정 |
| `mobile/test/strings.test.mjs` · `chart-legend.test.mjs` | 신규 | **신규** |

---

### Task 1: `strings.js` — UI 문자열 단일 출처

**Files:**
- Create: `mobile/www/strings.js` · `mobile/test/strings.test.mjs`
- Modify: `mobile/www/index.html`

**Interfaces:**
- Consumes: 없음
- Produces: `MSStr.t` (평평한 키-값 객체) · `MSStr.ind(blockType) -> string` (지표 표시명, 미지정이면 blockType 그대로)

`MSStr` 은 보간·복수형·로케일 전환을 넣지 않는다 — v1은 영어 하나뿐이라 그 기계장치가 값을 못 한다(Phase 0 §8). 문자열을 한곳에 모으는 것이 목적이고, 나중에 언어가 붙을 때 이 파일이 추출 지점이 된다.

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`mobile/test/strings.test.mjs`:

```js
import { test } from "node:test";
import assert from "node:assert";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const S = require("../www/strings.js");
const FC = require("../../forge-core.js");
const G = require("../www/graph.js");

test("지표 표시명은 엔진의 32종을 전부 덮는다 — 빠지면 화면에 blockType 이 그대로 노출된다", () => {
  const types = G.indicatorTypes(G.full32Graph(FC));
  assert.equal(types.length, FC.indicatorCount, "그래프 지표 수가 엔진 개수와 다르다");
  const missing = types.filter(t => !S.ind(t) || S.ind(t) === t);
  assert.deepEqual(missing, [], "표시명 없는 지표: " + missing.join(", "));
});

test("모르는 blockType 은 그대로 돌려준다 — 던지지 않는다", () => {
  assert.equal(S.ind("nope"), "nope");
  assert.equal(S.ind(""), "");
  assert.equal(S.ind(undefined), "");
});

test("UI 문자열에 한글이 남아 있지 않다 — 시안은 영어다", () => {
  const bad = Object.keys(S.t).filter(k => /[가-힣]/.test(String(S.t[k])));
  assert.deepEqual(bad, [], "한글이 남은 키: " + bad.join(", "));
  const badInd = Object.keys(S.IND).filter(k => /[가-힣]/.test(String(S.IND[k])));
  assert.deepEqual(badInd, [], "한글이 남은 지표명: " + badInd.join(", "));
});

test("시안에 문자 그대로 있는 5종 이름은 바꾸지 않는다", () => {
  assert.equal(S.ind("ma"), "Moving average");
  assert.equal(S.ind("macd"), "MACD");
  assert.equal(S.ind("rsi"), "RSI");
  assert.equal(S.ind("bollinger"), "Bollinger");
  assert.equal(S.ind("volume"), "Volume");
});
```

- [ ] **Step 2: 실패를 확인한다**

Run: `cd map/mobile && node --test test/strings.test.mjs`
Expected: FAIL — `Cannot find module '../www/strings.js'`

- [ ] **Step 3: `strings.js` 작성**

```js
// UI 문자열 단일 출처. 시안이 영어로 확정했다(핸드오프 README: English-first · copy is decided).
// 지표명은 인터페이스 언어와 무관하게 영어다 — 설정 "Keep indicator names in English" 기본 ON.
// 보간·복수형·로케일 전환은 없다. v1 은 영어 하나뿐이라 그 기계장치가 값을 못 한다(Phase 0 §8).
// 언어가 붙을 때 이 파일이 추출 지점이 된다.
(function (root, factory) {
  if (typeof module !== "undefined" && module.exports) module.exports = factory();
  else root.MSStr = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  // 지표 표시명 32종. 목업에 문자 그대로 나오는 것(Moving average·MACD·RSI·Bollinger·Volume·
  // Ichimoku·ADX / DMI·SuperTrend·Volume profile·Elliott)은 그 표기를 그대로 쓴다.
  var IND = {
    ma: "Moving average", macd: "MACD", rsi: "RSI", bollinger: "Bollinger", volume: "Volume",
    trend: "Trend", adx: "ADX / DMI", stochastic: "Stochastic", fib: "Fibonacci",
    ichimoku: "Ichimoku", pivot: "Pivot", psar: "Parabolic SAR", gann: "Gann",
    vwap: "VWAP", supertrend: "SuperTrend", atr: "ATR", volumeprofile: "Volume profile",
    structure: "Market structure", keltner: "Keltner", donchian: "Donchian",
    cci: "CCI", williams: "Williams %R", aroon: "Aroon", mfi: "MFI",
    elliott: "Elliott", smc: "SMC", cycle: "Cycle", phasefold: "Phase fold",
    roc: "ROC", ao: "Awesome oscillator", cmf: "CMF", pattern: "Chart pattern"
  };

  var t = {
    // 워치리스트
    wlTitle: "Watchlist",
    wlEmpty: "No tickers yet.\nAdd one to get started.",
    wlAdd: "＋ Add ticker",
    wlAddPrompt: "Enter a ticker symbol (e.g. AAPL)",
    wlAddBtn: "Add",
    wlCancel: "Cancel",
    wlScan: "Scan",
    wlScanning: "Scanning ",
    wlScanFail: "Scan failed",
    wlRemoveConfirm: " — remove from watchlist?",
    wlNotFound: " not found.",
    wlDidYouMean: " not found. Did you mean:",

    // 리포트 — 판정
    rpBack: "Back",
    rpLoadFail: "Could not load this report",
    rpRetry: "Try again",
    rpUnknownErr: "Could not load — unknown error.",
    rpAnalyzeErr: "Analysis failed: ",
    rpBarsShort: "not enough bars",
    rpUp: "Up", rpDown: "Down", rpFlat: "Flat",
    rpRange: "Likely somewhere in ",          // 시안: "Likely somewhere in"
    rpRangeNone: "No honest range available",
    rpRough: " — this is a rough read",        // 시안 그대로
    rpAgree: " of ",
    rpAgreeTail: " agree with this direction",
    rpAgreeNone: "No indicator gives a direction, so agreement cannot be scored",
    rpBarsAfter: " bars out",

    // 리포트 — 섹션
    rpCounted: "What was read",                // 시안 그대로
    rpNotCounted: "Not checked at this level", // 시안 그대로
    rpNotCountedLead: "Indicators not used in this verdict: ",
    rpNotCountedTail: " — see below",
    rpMissingPoint: "Showing what is missing",

    // 리포트 — 주기
    rpTf: "Timeframe",
    rpDaily: "Daily", rpWeekly: "Weekly", rpMonthly: "Monthly",
    rpLocked: "Locked", rpLockedSuffix: " · locked", rpSoon: "Coming soon",

    // 예측선 범례
    lgP1: "1st · blended forecast",
    lgP2: "2nd · selected indicators",
    lgP3: "3rd · counter scenario",

    // 차트 레전드 (Phase 3 신규)
    legPred: "1st forecast",
    legTarget: "Target",

    // 차트 안 잔존 라벨
    cxGolden: "Golden ·", cxDead: "Dead ·",
    cxBullDiv: "Bullish divergence", cxBearDiv: "Bearish divergence",
    cxBullVolDiv: "Bullish volume divergence", cxBearVolDiv: "Bearish volume divergence"
  };

  function ind(bt) { var k = bt || ""; return IND[k] || k; }

  return { t: t, IND: IND, ind: ind };
});
```

- [ ] **Step 4: `index.html` 에 태그 추가**

`vendor/forge-core.js`(11행) 뒤, 어느 화면 스크립트보다 앞이면 된다. `api.js`(12행) 바로 앞에 넣는다:

```html
<script src="strings.js"></script>
```

- [ ] **Step 5: 통과를 확인한다**

Run: `cd map && ./tests/run.sh mobile`
Expected: PASS — 123건 (119 + 4)

- [ ] **Step 6: 커밋**

```bash
git add mobile/www/strings.js mobile/www/index.html mobile/test/strings.test.mjs
git commit -m "mobile(p3): UI 문자열 단일 출처 strings.js — 시안 영문 + 지표명 32종"
```

---

### Task 2: `chart-legend.js` — 레전드 행 데이터 (순수 함수)

**Files:**
- Create: `mobile/www/chart-legend.js` · `mobile/test/chart-legend.test.mjs`
- Modify: `mobile/www/index.html`

**Interfaces:**
- Consumes: `MSStr`(Task 1) · `MSPreds.pcal`(Phase 2)
- Produces: `MSLegend.rows(an, pred, fi) -> [{key, label, value, tone}]`
  - `an` = `{ma, rsi, bb, macd, va}` · `pred` = `prediction` 객체 또는 `null` · `fi` = 절대 봉 인덱스 또는 `null`(최신)
  - `tone` ∈ `"bull" | "bear" | "muted"`
  - `key` 순서 고정: `ma · macd · rsi · bb · vol · pred · predpx`

**핵심 규약 — 상태 문구와 봉별 숫자를 구분한다.** `aligned up`·`squeeze`·`confirming` 같은 판정은 시계열 전체에 대한 것이라 `fi`와 무관하게 고정한다. `fi`를 따라 바뀌는 것은 숫자(RSI 값·%B·MACD 히스토그램)뿐이다. 이걸 지키지 않으면 과거 봉 위에서 "지금 정배열"이 거짓이 된다.

`chart-legend.js` 는 UMD 로 `MSStr`·`MSPreds` 를 받으므로 `index.html` 에서 **`strings.js`·`draw-preds.js` 뒤**에 실려야 한다(Phase 2에서 확인한 팩토리 시점 캡처 규칙).

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`mobile/test/chart-legend.test.mjs`:

```js
import { test } from "node:test";
import assert from "node:assert";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const LG = require("../www/chart-legend.js");
const FC = require("../../forge-core.js");

const d = FC.makeDemoSeries(400);
const vol = d.candle.map(() => 1e6);
const an = {
  ma: FC.analyzeMA(d.price, { len: 20 }),
  rsi: FC.analyzeRSI(d.price, { period: 14 }),
  bb: FC.analyzeBollinger(d.price, { len: 20, k: 2 }),
  macd: FC.analyzeMACD(d.price, { fast: 12, slow: 26, signal: 9 }),
  va: FC.analyzeVolume(d.price, vol, {})
};
const pred = FC.run(FC.sampleGraph(), { price: d.price, candle: d.candle }, { timeframe: "1day" }).prediction;
const KEYS = ["ma", "macd", "rsi", "bb", "vol", "pred", "predpx"];

test("7행이 정해진 순서로 나오고 key 가 중복되지 않는다", () => {
  const r = LG.rows(an, pred, null);
  assert.deepEqual(r.map(x => x.key), KEYS);
  assert.equal(new Set(r.map(x => x.key)).size, KEYS.length);
});

test("라벨은 시안 표기 그대로다", () => {
  const by = {}; LG.rows(an, pred, null).forEach(r => { by[r.key] = r.label; });
  assert.equal(by.ma, "Moving average");
  assert.equal(by.macd, "MACD");
  assert.equal(by.rsi, "RSI");
  assert.equal(by.bb, "Bollinger");
  assert.equal(by.vol, "Volume");
});

test("모든 value 가 비어있지 않고 한글이 없다", () => {
  LG.rows(an, pred, null).forEach(r => {
    assert.ok(r.value && String(r.value).length, r.key + " value 가 비었다");
    assert.ok(!/[가-힣]/.test(String(r.value) + r.label), r.key + " 에 한글: " + r.label + "/" + r.value);
  });
});

test("tone 은 세 값 중 하나다", () => {
  LG.rows(an, pred, null).forEach(r =>
    assert.ok(["bull", "bear", "muted"].indexOf(r.tone) >= 0, r.key + " tone=" + r.tone));
});

test("fi 를 바꾸면 숫자 행은 바뀌고 상태 문구는 안 바뀐다 — 과거 봉에서 '지금 정배열'은 거짓이다", () => {
  const late = LG.rows(an, pred, 400), early = LG.rows(an, pred, 200);
  const v = (rs, k) => rs.find(x => x.key === k).value;
  assert.notEqual(v(late, "rsi"), v(early, "rsi"), "RSI 가 fi 를 안 따른다");
  assert.notEqual(v(late, "bb"), v(early, "bb"), "%B 가 fi 를 안 따른다");
  assert.notEqual(v(late, "macd"), v(early, "macd"), "MACD 히스토그램이 fi 를 안 따른다");
  // MA 정렬·거래량 관계는 시계열 전체 판정 — fi 무관 고정
  assert.equal(v(late, "ma"), v(early, "ma"), "MA 상태가 fi 를 따라 바뀌었다");
  assert.equal(v(late, "vol"), v(early, "vol"), "거래량 상태가 fi 를 따라 바뀌었다");
});

test("fi=null 은 최신 봉과 같다", () => {
  const n = an.rsi.series.length - 1;
  assert.deepEqual(LG.rows(an, pred, null), LG.rows(an, pred, n));
});

test("pred 가 없으면 예측 2행이 muted 자리표시자로 남는다 — 행 수는 유지", () => {
  const r = LG.rows(an, null, null);
  assert.deepEqual(r.map(x => x.key), KEYS, "pred 없다고 행이 사라지면 안 된다");
  ["pred", "predpx"].forEach(k => {
    const row = r.find(x => x.key === k);
    assert.equal(row.tone, "muted");
    assert.ok(row.value.length, k + " 자리표시자가 비었다");
  });
});

test("결측·이상 입력에도 던지지 않는다", () => {
  assert.doesNotThrow(() => LG.rows(an, pred, -5));
  assert.doesNotThrow(() => LG.rows(an, pred, 99999));
  assert.doesNotThrow(() => LG.rows(Object.assign({}, an, { ma: Object.assign({}, an.ma, { sr: { ma: null, side: null } }) }), pred, null));
  assert.doesNotThrow(() => LG.rows(Object.assign({}, an, { macd: Object.assign({}, an.macd, { cross: { type: null, barsAgo: null } }) }), pred, null));
});

test("반대가 우세한 예측(pcal<50)은 muted 로 강등된다 — 차트 회색 강등과 같은 규칙", () => {
  const weak = { path: [100, 99.5], lo: [96, 96], hi: [104, 108], anchor: 100, futW: 2 };
  const row = LG.rows(an, weak, null).find(x => x.key === "pred");
  assert.equal(row.tone, "muted", "pcal=" + row.value + " 인데 muted 가 아니다");
});
```

- [ ] **Step 2: 실패를 확인한다**

Run: `cd map/mobile && node --test test/chart-legend.test.mjs`
Expected: FAIL — `Cannot find module '../www/chart-legend.js'`

- [ ] **Step 3: `chart-legend.js` 작성**

```js
// 차트 위 고정 레전드의 행 데이터. 순수 함수 — DOM 을 만들지 않는다.
// DOM 을 반환하면 노드에서 값으로 검증할 수 없어서 이렇게 갈랐다. 조립은 report.js 담당.
// 상태 문구(aligned up·squeeze·confirming)는 시계열 전체 판정이라 fi 와 무관하게 고정하고,
// fi 를 따라 바뀌는 것은 숫자뿐이다 — 안 그러면 과거 봉에서 "지금 정배열"이 거짓이 된다.
(function (root, factory) {
  if (typeof module !== "undefined" && module.exports)
    module.exports = factory(require("./strings.js"), require("./draw-preds.js"));
  else root.MSLegend = factory(root.MSStr, root.MSPreds);
})(typeof self !== "undefined" ? self : this, function (Str, Preds) {
  "use strict";

  var T = (Str && Str.t) || {};
  function ind(bt) { return (Str && Str.ind) ? Str.ind(bt) : bt; }
  function num(v) { return (Math.abs(v) < 10 ? v.toFixed(2) : Math.round(v).toLocaleString()); }
  function at(arr, fi, fallback) {
    if (!arr || !arr.length) return fallback;
    var k = (fi == null) ? arr.length - 1 : Math.max(0, Math.min(arr.length - 1, fi));
    return isFinite(arr[k]) ? arr[k] : fallback;
  }
  function biasTone(b) { return b > 0.15 ? "bull" : b < -0.15 ? "bear" : "muted"; }

  var BB_STATE = { breakout_up: "upper breakout", breakout_dn: "lower breakdown",
                   upper: "upper band", lower: "lower band", neutral: "mid band" };
  var VOL_STATE = { spike: "spike", contract: "contracting", normal: "normal" };
  var VOL_REL = { confirm: "confirming", weakening: "weakening",
                  selling: "selling pressure", capitulation: "capitulation" };
  var MA_ALIGN = { bull: "aligned up", bear: "aligned down", mixed: "mixed" };

  function rows(an, pred, fi) {
    var out = [];

    // MA — 정렬·지지/저항은 전체 판정이라 fi 무관
    var ma = an.ma, maTxt = MA_ALIGN[ma.align.order] || "mixed";
    if (ma.sr && ma.sr.ma) maTxt += " · " + (ma.sr.side === "support" ? "support" : "resistance");
    out.push({ key: "ma", label: ind("ma"), value: maTxt, tone: biasTone(ma.bias) });

    // MACD — 히스토그램은 봉별, 교차는 전체 판정
    var m = an.macd, h = at(m.hist, fi, 0);
    var cross = (m.cross && m.cross.type)
      ? (m.cross.type === "bull" ? T.cxGolden : T.cxDead) + m.cross.barsAgo
      : "no cross";
    out.push({ key: "macd", label: ind("macd"),
               value: (h >= 0 ? "+" : "") + h.toFixed(1) + " · " + cross,
               tone: biasTone(m.bias) });

    // RSI — 값은 봉별, 구간 문구는 그 값에서 바로 나오므로 함께 따라간다
    var r = an.rsi, rv = at(r.series, fi, r.last);
    var rz = rv >= 70 ? "overbought" : rv <= 30 ? "oversold" : "neutral";
    out.push({ key: "rsi", label: ind("rsi"), value: Math.round(rv) + " · " + rz,
               tone: rz === "overbought" ? "bear" : rz === "oversold" ? "bull" : "muted" });

    // 볼린저 — %B 는 봉별, 밴드 상태·스퀴즈는 전체 판정
    var b = an.bb, pb = at(b.pctB, fi, (b.last && b.last.pctB) || 0);
    out.push({ key: "bb", label: ind("bollinger"),
               value: (BB_STATE[b.state] || "mid band") + (b.squeeze ? " · squeeze" : "") + " · %B " + pb.toFixed(2),
               tone: biasTone(b.bias) });

    // 거래량 — 상태·가격관계 모두 전체 판정이라 fi 무관
    var v = an.va;
    out.push({ key: "vol", label: ind("volume"),
               value: (VOL_STATE[v.state] || "normal") + " · " + (VOL_REL[v.relationship] || "weakening"),
               tone: (v.relationship === "confirm" || v.relationship === "capitulation") ? "bull" : "bear" });

    // 예측 2행 — 미래에 대한 값이라 fi 무관. pred 가 없어도 행은 남긴다(레이아웃 흔들림 방지).
    var pOk = !!(pred && pred.path && pred.path.length && pred.hi && pred.hi.length);
    if (pOk) {
      var n = pred.path.length;
      var anchor = (pred.anchor != null) ? pred.anchor : pred.path[0];
      var pc = (Preds && Preds.pcal) ? Preds.pcal(pred.path, pred.hi, anchor, n - 1) : 50;
      var up = pred.path[n - 1] >= anchor;
      out.push({ key: "pred", label: T.legPred, value: pc + "%",
                 tone: pc < 50 ? "muted" : (up ? "bull" : "bear") });
      out.push({ key: "predpx", label: T.legTarget, value: num(pred.path[n - 1]),
                 tone: pc < 50 ? "muted" : (up ? "bull" : "bear") });
    } else {
      out.push({ key: "pred", label: T.legPred, value: "—", tone: "muted" });
      out.push({ key: "predpx", label: T.legTarget, value: "—", tone: "muted" });
    }
    return out;
  }

  return { rows: rows };
});
```

- [ ] **Step 4: `index.html` 에 태그 추가**

`draw-preds.js`(19행) 뒤에 넣는다 — `MSStr`·`MSPreds` 둘 다 이미 실린 뒤여야 한다:

```html
<script src="chart-legend.js"></script>
```

- [ ] **Step 5: 통과를 확인한다**

Run: `cd map && ./tests/run.sh mobile`
Expected: PASS — 132건 (123 + 9)

- [ ] **Step 6: 변이 검증**

각 테스트가 실제로 무는지 확인한다. Phase 2에서 깨진 구현에 통과하는 테스트가 5건 나왔다.

1. `rows` 의 RSI 를 `at(r.series, fi, ...)` 대신 `r.last` 고정으로 바꾼다 → `fi` 반응 테스트가 FAIL 해야 한다.
2. MA 를 `fi` 따라 바뀌게 만든다(예: `ma.mas.short.series[fi]` 를 문구에 섞는다) → 상태 고정 단언이 FAIL 해야 한다.
3. `pred` 행의 `pc < 50 ? "muted"` 를 지운다 → 강등 테스트가 FAIL 해야 한다.

각각 되돌린 뒤 `git diff -- mobile/www/chart-legend.js` 가 비어 있는지 확인한다.

- [ ] **Step 7: 커밋**

```bash
git add mobile/www/chart-legend.js mobile/www/index.html mobile/test/chart-legend.test.mjs
git commit -m "mobile(p3): 레전드 행 데이터 순수 함수 MSLegend.rows"
```

---

### Task 3: 차트에서 구석 배지 제거

**Files:**
- Modify: `mobile/www/draw-layers.js` (BB·MA 배지 게이트 2곳)
- Modify: `mobile/www/chart-draw.js` (`endDeco` 라벨·예측가 끄기)
- Modify: `mobile/www/screens/report.js` (배지 3종 호출 중단)
- Test: `mobile/test/draw-layers.test.mjs` · `mobile/test/chart-draw.test.mjs`

**Interfaces:**
- Consumes: 없음
- Produces: `M.badges === false` 면 `MSLayers.ma`/`bollinger` 가 배지 `_evLabel` 을 건너뛴다. `drawCone` 은 끝점 라벨·예측가를 더 이상 그리지 않는다(진앙 마커는 유지).

**남기는 기준:** 위치가 의미를 갖는 것만 차트에 남는다. 크로스 마커·다이버전스 선·진앙은 특정 봉을 가리키는 것이 정보라 남고, 구석 배지는 어느 봉 위에 놓여도 뜻이 같아서 나간다.

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`mobile/test/draw-layers.test.mjs` 끝에 추가:

```js
test("M.badges=false 면 구석 배지를 안 그린다 — 값은 레전드로 갔다", () => {
  const M = Object.assign({}, layout().panels.price.M, { badges: false });
  const c = recCtx(); L.resetLabels(372, 520);
  L.bollinger(c, FC.analyzeBollinger(price, { len: 20, k: 2 }), M);
  L.ma(c, FC.analyzeMA(price, { len: 20 }), M);
  const texts = c.calls.filter(x => x.op === "fillText").map(x => String(x.args[0]));
  assert.ok(!texts.some(t => /^BB /.test(t)), "볼린저 배지가 남았다: " + texts.join("|"));
  assert.ok(!texts.some(t => /aligned|mixed/.test(t)), "MA 정렬 배지가 남았다: " + texts.join("|"));
});

test("M.badges=false 라도 선과 크로스 마커는 그대로 그린다 — 위치가 의미인 것은 남는다", () => {
  const M = Object.assign({}, layout().panels.price.M, { badges: false });
  const c = recCtx(); L.resetLabels(372, 520);
  L.ma(c, FC.analyzeMA(price, { len: 20 }), M);
  assert.ok(c.calls.filter(x => x.op === "stroke").length >= 3, "MA 선이 사라졌다");
  assert.ok(c.calls.some(x => x.op === "arc"), "크로스 마커가 사라졌다");
});

test("M.badges 미지정이면 종전대로 배지를 그린다 — 기존 호출을 깨지 않는다", () => {
  const c = recCtx(); L.resetLabels(372, 520);
  L.bollinger(c, FC.analyzeBollinger(price, { len: 20, k: 2 }), layout().panels.price.M);
  assert.ok(c.calls.some(x => x.op === "fillText"), "배지가 안 그려졌다");
});
```

`mobile/test/chart-draw.test.mjs` 끝에 추가:

```js
test("끝점 차수 배지와 예측가는 더 이상 차트에 안 그려진다 — 레전드로 갔다", () => {
  const c = recCtx(); L.resetLabels(372, 520);
  D.drawCone(c, LAY(), predWithCounter, COL, "basic", { sym: "AAPL", tf: "1day" });
  const texts = c.calls.filter(x => x.op === "fillText").map(x => String(x.args[0]));
  assert.ok(!texts.some(t => /^1st|^1차/.test(t)), "차수 배지가 남았다: " + texts.join("|"));
  assert.equal(texts.length, 0, "끝점 텍스트가 남았다: " + texts.join("|"));
});

test("진앙 마커는 여전히 그린다 — 끝점 '위치'는 정보다", () => {
  const c = recCtx(); L.resetLabels(372, 520);
  D.drawCone(c, LAY(), predWithCounter, COL, "basic", { sym: "AAPL", tf: "1day" });
  assert.ok(c.calls.filter(x => x.op === "arc").length >= 2, "진앙이 사라졌다");
});
```

- [ ] **Step 2: 실패를 확인한다**

Run: `cd map/mobile && node --test test/draw-layers.test.mjs test/chart-draw.test.mjs`
Expected: FAIL — 배지가 여전히 그려짐

- [ ] **Step 3: 게이트 3곳 적용**

`draw-layers.js` — `_drawBollingerLayers` 의 배지 블록(`reveal >= 2 && _skReady()`) 조건에 `M.badges !== false` 를 추가:

```js
    if (reveal >= 2 && _skReady() && M.badges !== false) {
```

`_drawMALayers` 의 배열 라벨 블록(`reveal >= 3 && ma.mas.short`)도 같게:

```js
    if (reveal >= 3 && ma.mas.short && M.badges !== false) {
```

> 크로스 마커 블록(`reveal >= 2 && ma.cross.type ...`)은 **건드리지 않는다.** 마커와 그 라벨은 특정 봉을 가리키므로 남는다.

`chart-draw.js` — `wigLine` 안 `MSPreds.endDeco` 호출에서 라벨·예측가를 끈다:

```js
      MSPreds.endDeco(c, {
        path: mv, seamX: seamX, coneR: lx[m - 1], toY: M.pToY, box: box, tf: o.tf,
        col: (pc < 50 ? "#8a92b2" : hex),
        // 차수 배지·끝점 예측가는 Phase 3 에서 레전드로 갔다. 진앙 마커만 남긴다 —
        // 끝점의 '위치'는 정보지만 배지는 어디 있든 뜻이 같아서 차트에 있을 이유가 없다.
        label: null, labelDy: labelDy, showPx: false
      });
```

`pc` 는 색 강등에 계속 쓰이므로 `MSPreds.pcal` 호출은 남긴다.

`report.js` — `frame()` 에서 배지 3종 호출을 지우고, 나머지 둘에 `badges:false` 를 넘긴다:

```js
      var Mp = Object.assign({}, lay.panels.price.M, { badges: false });
      MSLayers.bollinger(ctx, an.bb, Mp);
      MSLayers.ma(ctx, an.ma, Mp);
      // rsiBadge · macdBadge · volumeBadge 는 호출하지 않는다 — 값이 레전드로 갔다.
```

- [ ] **Step 4: 통과를 확인한다**

Run: `cd map && ./tests/run.sh mobile`
Expected: PASS — 137건 (132 + 5)

- [ ] **Step 5: 변이 검증**

`M.badges !== false` 게이트 하나를 지운다 → 해당 배지 부재 단언이 FAIL 해야 한다. `endDeco` 의 `label: null` 을 되돌린다 → 차수 배지 부재 단언이 FAIL 해야 한다. 각각 되돌리고 트리를 깨끗이 둔다.

- [ ] **Step 6: 커밋**

```bash
git add mobile/www/draw-layers.js mobile/www/chart-draw.js mobile/www/screens/report.js \
        mobile/test/draw-layers.test.mjs mobile/test/chart-draw.test.mjs
git commit -m "mobile(p3): 구석 배지·끝점 라벨을 차트에서 제거(위치가 의미인 것만 남김)"
```

---

### Task 4: 레전드 DOM + 크로스헤어 갱신 + `TAIL_BARS` 60

**Files:**
- Modify: `mobile/www/screens/report.js` · `mobile/www/style.css`
- Test: 없음 (`report.js` 는 테스트 하네스가 없다 — 관문 유지 + 육안 확인)

**Interfaces:**
- Consumes: `MSLegend.rows`(Task 2)
- Produces: 화면 동작. 다른 태스크가 의존하지 않는다.

- [ ] **Step 1: `TAIL_BARS` 를 60 으로**

`report.js:9`:

```js
  var CHART_H = 520, PAD = 10, TAIL_BARS = 60;   // 60 = 예측구간 28%(120 이면 16%). Phase 4 에서 초기 창 크기가 된다
```

- [ ] **Step 2: 레전드 DOM 을 차트 위에 붙인다**

`buildChartSection()` 이 만드는 래퍼 안, 캔버스 **앞**에 레전드 노드를 넣는다. `paintChart` 가 갱신할 수 있도록 `chartRefs` 에 참조를 실어 보낸다.

```js
    // 레전드는 캔버스가 아니라 DOM 이다 — 폰에서 더 선명하고, 겹침 회피 계산이 통째로 필요 없다.
    var legend = MSUi.el("div", "rp-legend");
    function paintLegend(fi) {
      var rows = MSLegend.rows(an, an.out.prediction, fi);
      legend.textContent = "";
      rows.forEach(function (r) {
        var chip = MSUi.el("div", "rp-lg-chip rp-lg-" + r.tone);
        chip.appendChild(MSUi.el("span", "rp-lg-k", r.label));
        chip.appendChild(MSUi.el("span", "rp-lg-v", r.value));
        legend.appendChild(chip);
      });
    }
```

`frame(hoverFi)` 끝에서 `paintLegend(hoverFi)` 를 부른다 — 크로스헤어를 끌면 그 봉 값으로 바뀌고, 놓으면 `frame(null)` 이 최신 봉으로 되돌린다.

- [ ] **Step 3: `style.css` 에 레전드 스타일**

```css
/* 차트 레전드 — 값을 차트 밖으로 뺀 고정 행. 칩은 wrap 되어 폭에 맞춰 접힌다. */
.rp-legend { display:flex; flex-wrap:wrap; gap:4px 10px; padding:6px 2px 8px; }
.rp-lg-chip { display:flex; align-items:baseline; gap:5px; font-size:11.5px; line-height:1.5; }
.rp-lg-k { color:var(--ink-4); letter-spacing:-0.01em; }
.rp-lg-v { font-variant-numeric:tabular-nums; }
.rp-lg-bull  .rp-lg-v { color:var(--bull); }
.rp-lg-bear  .rp-lg-v { color:var(--bear-text); }
.rp-lg-muted .rp-lg-v { color:var(--ink-3); }
```

토큰은 전부 `style.css:6-9` 에 실재함을 확인했다(`--ink-3` `--ink-4` `--bull` `--bear` `--bear-text`). 약세 값에 `--bear` 가 아니라 **`--bear-text`(#e08a8a)** 를 쓰는 이유는 이 저장소가 어두운 배경 위 텍스트용으로 밝은 변형을 따로 두었기 때문이다 — `--bear` 는 캔들용이라 글자로 쓰면 어둡다. **색은 절대 하드코딩하지 말 것.**

- [ ] **Step 4: 관문 확인**

Run: `cd map && ./tests/run.sh`
Expected: 137건 유지(이 태스크는 테스트를 추가하지 않는다). 실패 0.

`node --check mobile/www/screens/report.js` 로 파싱도 확인한다.

- [ ] **Step 5: 커밋**

```bash
git add mobile/www/screens/report.js mobile/www/style.css
git commit -m "mobile(p3): 고정 레전드 DOM + 크로스헤어 갱신 + TAIL_BARS 60(예측구간 28%)"
```

---

### Task 5: 카피를 시안 영문으로

**Files:**
- Modify: `mobile/www/screens/report.js` · `mobile/www/screens/watchlist.js` · `mobile/www/draw-layers.js`
- Test: `mobile/test/strings.test.mjs`

**Interfaces:**
- Consumes: `MSStr.t` · `MSStr.ind`(Task 1)
- Produces: 없음 (화면 문자열)

`report.js` 의 `TITLE_KO` 맵과 `chipLabel` 의 `forge-core` 한글 title 폴백을 **둘 다** `MSStr.ind` 로 대체한다. 폴백을 남기면 27개 칩 중 일부가 한글로 새어 나온다.

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`mobile/test/strings.test.mjs` 끝에 추가:

```js
import { readFileSync } from "node:fs";

test("화면 소스에 UI 한글 문자열이 남아 있지 않다 — 주석은 제외", () => {
  const files = ["../www/screens/report.js", "../www/screens/watchlist.js", "../www/draw-layers.js"];
  const offenders = [];
  for (const f of files) {
    const src = readFileSync(new URL(f, import.meta.url), "utf8");
    src.split("\n").forEach((line, i) => {
      const code = line.replace(/\/\/.*$/, "").replace(/\/\*[\s\S]*?\*\//g, "");
      const m = code.match(/(["'`])(?:(?!\1)[^\\]|\\.)*\1/g) || [];
      m.filter(s => /[가-힣]/.test(s))
       .forEach(s => offenders.push(f.replace("../", "") + ":" + (i + 1) + "  " + s));
    });
  }
  assert.deepEqual(offenders, [], "한글 UI 문자열 " + offenders.length + "건:\n" + offenders.join("\n"));
});
```

> 이 테스트는 블록 주석이 여러 줄에 걸치면 완벽히 걸러내지 못한다. 오탐이 나오면 그 줄을 한 줄 주석으로 바꾸거나, 정말 코드가 아니면 테스트에 예외를 넣지 말고 **소스를 고친다** — 예외 목록은 이 테스트를 무력화한다.

- [ ] **Step 2: 실패를 확인한다**

Run: `cd map/mobile && node --test test/strings.test.mjs`
Expected: FAIL — 한글 문자열 약 55건 나열

- [ ] **Step 3: 세 파일의 문자열을 `MSStr` 참조로 교체**

`report.js` — `TITLE_KO` 맵을 통째로 삭제하고 `chipLabel` 을 다음으로 바꾼다:

```js
  // 지표 표시명은 MSStr 단일 출처. forge-core 의 한글 title 로 폴백하면 칩 일부가 한글로 샌다.
  function chipLabel(full, bt) { return MSStr.ind(bt); }
```

나머지 문자열은 Task 1 의 `MSStr.t` 키로 바꾼다. 예:

```js
"뒤로"                    → MSStr.t.rpBack
"다시 시도"                → MSStr.t.rpRetry
"리포트를 불러오지 못했습니다" → MSStr.t.rpLoadFail
"상승"/"하락"/"중립"       → MSStr.t.rpUp / rpDown / rpFlat
"일간"/"주간"/"월간"        → MSStr.t.rpDaily / rpWeekly / rpMonthly
"잠김" / " · 잠김"         → MSStr.t.rpLocked / rpLockedSuffix
"곧 제공"                  → MSStr.t.rpSoon
"1차 종합 예측" 등 3종      → MSStr.t.lgP1 / lgP2 / lgP3
```

`watchlist.js` 는 `wl*` 키로, `draw-layers.js` 의 잔존 라벨(크로스·다이버전스)은 `cx*` 키로 바꾼다.

> **`draw-layers.js` 는 `forge-draw.js` 원문 복사 블록이다.** 문자열 교체는 그 규약과 부딪히지만, 규약의 목적은 **동작 divergence 방지**이고 UI 카피는 동작이 아니다. Phase 0 §8 이 "영어 하드코딩, 문자열만 한 파일에 모음"을 지시했으므로 이쪽이 우선한다. 교체는 **문자열 리터럴만** — 조건·계산·좌표는 한 글자도 건드리지 않는다. 복사 범위 주석 옆에 이 예외를 한 줄로 적어 둘 것.

`draw-layers.js` 가 `MSStr` 을 쓰려면 UMD 팩토리 인자를 추가해야 한다:

```js
(function (root, factory) {
  if (typeof module !== "undefined" && module.exports) module.exports = factory(require("./strings.js"));
  else root.MSLayers = factory(root.MSStr);
})(typeof self !== "undefined" ? self : this, function (Str) {
```

`index.html` 에서 `strings.js` 가 `draw-layers.js` 보다 앞에 있는지 확인한다(Task 1 Step 4 에서 `api.js` 앞에 넣었으므로 충족).

- [ ] **Step 4: 통과를 확인한다**

Run: `cd map && ./tests/run.sh mobile`
Expected: PASS — 138건 (137 + 1)

- [ ] **Step 5: 변이 검증**

`report.js` 아무 문자열 하나를 한글로 되돌린다 → 한글 부재 테스트가 그 파일·줄 번호를 지목하며 FAIL 해야 한다. 되돌린다.

`MSStr.t` 에 없는 키(`MSStr.t.nope`)를 하나 참조해 본다 → 화면에 `undefined` 가 렌더된다. 이건 테스트가 못 잡으므로, Task 1 의 "참조된 키가 전부 존재" 단언이 실제로 도는지 확인하고 부족하면 그 테스트를 소스 스캔 방식으로 보강한다.

- [ ] **Step 6: 커밋**

```bash
git add mobile/www/screens/report.js mobile/www/screens/watchlist.js mobile/www/draw-layers.js mobile/test/strings.test.mjs
git commit -m "mobile(p3): 리포트·워치리스트·차트 잔존 라벨 카피를 시안 영문으로"
```

---

### Task 6: 백로그 갱신 + 육안 확인 준비

**Files:**
- Modify: `mobile/docs/BACKLOG-mobile.md`

- [ ] **Step 1: 전체 관문**

Run: `cd map && ./tests/run.sh`
Expected: 전체 통과, mobile 138건. 실패 스위트 0.

- [ ] **Step 2: 백로그에 완료·이월 기록**

`## ✅ 완료` 에 Phase 3 항목을 추가하고, `## 📋 예정` 에 이번에 발견한 것들을 올린다:

```markdown
- **시안 구조 차이 — Not checked at this level** — 목업은 능력 4줄
  (Historical hit rate of this setup · Indicators that disagree · Weekly and monthly agreement ·
  Why each reading came out that way)인데 현 구현은 지표 칩 27개를 깐다. 카피가 아니라 구조 차이라
  Phase 3 범위 밖으로 두었다. 어느 쪽이 맞는지 판단 필요.
- **시안 카피 전면 대조** — Phase 3 은 리포트·워치리스트만 맞췄다. 목업 50장 전체 대조는 미실시.
- **로케일·언어 시트** — `keepIndicatorNamesEnglish` 설정 UI·비영어 로케일 안내 시트는 v1 밖(Phase 0 §8).
  지금은 영어 하드코딩만 있고 전환 수단이 없다.
```

- [ ] **Step 3: 육안 확인 항목을 남긴다 (에이전트는 수행 불가)**

브라우저·실기기가 없으므로 **수행하지 말고**, 아래를 그대로 보고서에 옮겨 사람이 돌리게 한다:

```
cd map/mobile/www && python3 -m http.server 8000 --bind 0.0.0.0
폰 Chrome → http://<tailscale-ip>:8000
```

1. 차트 위 레전드에 7개 값이 **전부** 보인다(사라진 값 없음).
2. 차트 안에 구석 배지가 없다 — 선·크로스 마커·다이버전스·진앙만 남았다.
3. 차트를 길게 눌러 크로스헤어를 끌면 레전드의 **RSI·%B·MACD 숫자만** 바뀌고 상태 문구는 고정이다.
4. 예측 구간이 눈에 띄게 넓어졌다(16% → 28%).
5. 화면에 한글이 없다.

- [ ] **Step 4: 커밋**

```bash
git add mobile/docs/BACKLOG-mobile.md
git commit -m "mobile(p3): Phase 3 종료 문서 + 시안 구조 차이 이월"
```

---

## 남는 열린 항목

- **Phase 4 — 차트 창**: `_chartWin` 포팅 · 두 손가락 핀치/팬 · `user-scalable=no`. 제스처는 결정됨(한 손가락은 페이지 스크롤 + 350ms 홀드 크로스헤어 유지, 두 손가락만 줌·팬)
- **`_predDir` PC 전역 의존** — `M.focused` 를 켜기 전에 해결
- **Capacitor 툴체인 검증** — 여전히 미검증. Phase 1·2·3 확인은 모두 폰 Chrome 이지 WebView 가 아니다
- Phase 2 이월: 마일스톤 점 x-매핑 편차 · `_fitBoxY` 즉시반환 미클램프 · `frame()` 순서 테스트 부재
