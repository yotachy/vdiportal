// 3단 대조(시안 7a) — 이 개편의 판매 논거. 컨트롤러 판정 D1(리뷰 2026-08-19)로 카드의 성격이
// 바뀌었다: 처음엔 "이 종목의 예측 폭이 절반으로 준다"는 종목별 대조였는데, 실측(리뷰어
// backtest/earn-ohlc.json 30종목×5구간=150창)이 그 전제를 깼다 — 심화가 더 좁은 비율 47.3%,
// 폭 비율 중앙값 1.001, "절반"(비율<0.6) 사례 0/150. 콘 폭은 forge-core.js run() 안에서
// 가격 변동성(sigBand·trChSig)으로 정해지고 지표 개수와 독립이다 — 종목 하나의 폭으로
// "심화가 좁다"를 주장할 근거가 없다.
//
// 그래서 이 카드는 이제 **모집단 지표**만 말한다 — 이 종목이 아니라 엔진 전체(87종목·
// 31,971건) 측정값. 상위 설계서 §9.2 가 이미 이렇게 규정해 뒀다: "심화가 파는 것은 방향이
// 아니라 범위다 — 콘 커버리지 73.8%→77.1%, ECE 1.05%p→0.27%p(4배 정직)". 종목별 예측 폭
// 프리뷰(로컬 32지표 재실행)는 걷어냈다 — screens/report.js 의 computeFullPreview() 도 함께.
//
// 숫자 규율(설계서 §9, 상위 설계서와 같다):
//  ① 적중률·기준선·콘 커버리지·ECE 는 전부 window.MSBacktest 에서만 읽는다. 리터럴 금지.
//  ② 전문(custom) 티어는 실측이 없다 — rate:null. 화면은 그 자리에 "측정 중"을 그린다.
//  ③ 방향 적중률은 자명 기준선(baselineAlwaysUp) 없이 단독 노출하지 않는다.
//  ④ 심화의 "불리한 사실"(적중률은 겨우 오른다)은 여기서 실측으로 조립한 문장이다.
//  ⑤ [리뷰 I2] 비율·차이는 **반올림하기 전 원값으로** 계산하고, 표시할 때만 반올림한다 —
//     이미 반올림된 두 값끼리 나누면(예: round(1.05)/round(0.27)=4) 다음 백테스트에서
//     원값이 조금만 움직여도 표시값이 크게 튈 수 있다(43% 과장 사례가 실측으로 나왔다).
(function (root, factory) {
  if (typeof module !== "undefined" && module.exports) module.exports = factory(require("./strings.js"), nodeBacktest());
  else MSGlobals.define("MSTierCompare", factory(root.MSStr, null));

  // Node(node --test) 경로 전용 — vendor/backtest-summary.js 는 `window.MSBacktest = {...}`
  // 만 있는 생성물이라(모듈이 아니다) require() 로 바로 못 읽는다. onboarding.test.mjs 가
  // 이미 쓰는 것과 같은 기법(중괄호 구간만 잘라 JSON.parse)을 여기서도 그대로 쓴다 — 브라우저
  // 쪽은 index.html 의 <script> 순서(backtest-summary.js 가 이 파일보다 먼저)가 전역을
  // 채워 주므로 이 함수를 안 탄다. 파일이 없으면(sync 전) null — rows()/baseline() 이
  // 그 경우도 던지지 않고 null 로 우아하게 물러난다.
  function nodeBacktest() {
    if (typeof require !== "function" || typeof __dirname !== "string") return null;
    try {
      var fs = require("fs");
      var path = require("path");
      var src = fs.readFileSync(path.join(__dirname, "vendor", "backtest-summary.js"), "utf8");
      var i = src.indexOf("{"), j = src.lastIndexOf("}");
      if (i < 0 || j < 0) return null;
      return JSON.parse(src.slice(i, j + 1));
    } catch (e) { return null; }
  }
})(typeof self !== "undefined" ? self : this, function (Str, ntBT) {
  "use strict";

  var T = (Str && Str.t) || {};

  // 적중률 축 확대(설계서 §3.3) — 0~100% 축에서는 이 크기의 차이가 안 보인다. [리뷰 M1]
  // 화면(screens/report.js)이 이 상수를 직접 읽어 축 표기 문구에 런타임으로 끼워 넣는다 —
  // strings.js 에 "55~70%"를 리터럴로 박아 두면 이 상수와 서로 다른 숫자로 갈릴 수 있다.
  var AXIS_MIN = 55, AXIS_MAX = 70;

  function isNum(v) { return typeof v === "number" && isFinite(v); }
  // 소수 1자리 퍼센트 — report-model.js 의 hitRate()·baseline 반올림과 같은 규칙
  // (Math.round(v*1000)/10)을 그대로 쓴다. 화면 여러 곳이 이 규칙으로 이미 61.0% 를 쓰고
  // 있는데 여기만 다르게 반올림하면 같은 기준선이 자리마다 다른 숫자로 보인다.
  function pct1(frac) { return isNum(frac) ? Math.round(frac * 1000) / 10 : null; }
  // ECE 는 원래 값이 1% 미만이라 1자리로는 1.05→1.1·0.27→0.3 처럼 해상도를 잃는다(그 상태로
  // 나누면 [리뷰 I2]가 지적한 이중반올림 오차가 더 커진다) — 표시만 2자리로 한다.
  function pct2(frac) { return isNum(frac) ? Math.round(frac * 10000) / 100 : null; }

  // 실측 단일 출처. Node 는 생성자 인자로 주입된 값(ntBT), 브라우저는 전역을 그때그때 읽는다
  // (스크립트 로드 순서상 이 시점엔 이미 채워져 있지만, 지연 읽기가 onboarding.js 의 기존
  // 관례와 같다 — 캡처보다 안전하다).
  function bt() {
    if (ntBT) return ntBT;
    if (typeof window !== "undefined" && window.MSBacktest) return window.MSBacktest;
    if (typeof MSBacktest !== "undefined") return MSBacktest;
    return null;
  }

  function tierStat(key) {
    var b = bt();
    return (b && b.tiers && b.tiers[key]) || null;
  }

  // 기본은 MSBacktest.tiers.basic, 심화는 tiers.deep — 생성물 필드명이 "deep"이다(엔진·
  // 지갑·온보딩이 이미 이 이름을 쓴다). 화면의 티어 id("full")와는 다르다 — rows() 가 그
  // 변환을 흡수한다(호출부가 몰라도 되게).
  function statKey(reportTier) { return reportTier === "basic" ? "basic" : reportTier === "full" ? "deep" : null; }

  function rateOf(reportTier) {
    var s = tierStat(statKey(reportTier));
    return s ? pct1(s.directionHitRate) : null;
  }
  function coverageOf(reportTier) {
    var s = tierStat(statKey(reportTier));
    return s ? pct1(s.coneCoverage) : null;
  }
  function eceOf(reportTier) {
    var s = tierStat(statKey(reportTier));
    return s ? pct2(s.calibrationECE) : null;
  }
  // 이 값들이 "이 종목"이 아니라 엔진 전체 측정이라는 사실의 범위 — 상위 설계서 §9.3
  // 규칙4(범위 주석 필수)를 카드 자신이 지킨다(호출부가 안 잊게).
  function scope() {
    var b = bt();
    var n = b && isNum(b.nForecasts) ? b.nForecasts : null;
    var series = b && isNum(b.nSeries) ? b.nSeries : null;
    return (n != null && series != null) ? { n: n, series: series } : null;
  }

  function baseline() {
    var b = bt();
    var v = b && isNum(b.baselineAlwaysUp) ? b.baselineAlwaysUp : null;
    return pct1(v);
  }

  // 55~70% 축 위의 위치(0~100, 클램프). 축 상수를 여기서만 갖는다 — 화면이 직접
  // AXIS_MIN/MAX 로 계산하면 문구(rp-tc-axis)와 막대 위치가 서로 다른 상수를 쓸 위험이 생긴다.
  function axisPos(v) {
    if (!isNum(v)) return null;
    var p = (v - AXIS_MIN) / (AXIS_MAX - AXIS_MIN);
    return Math.max(0, Math.min(1, p)) * 100;
  }

  // 심화 카드의 "불리한 사실" 문장 — 시안은 "적중률은 2%p 만 오릅니다"라고 샘플을 적었지만
  // 그 숫자는 이 화면이 태어나기 전에 그려진 예시다. 실측으로 다시 조립한다: 방향 적중률
  // 차이(작다, 부호 있음 — [리뷰 I3]) + 심화가 실제로 파는 것(콘 커버리지·ECE 비율).
  // 조각은 전부 strings.js 에서 오고 숫자만 여기서 계산한다 — 조각 자체엔 자릿수가 없다.
  //
  // [리뷰 I2] 차이·비율은 **원값(반올림 전 fraction)** 으로 계산한 뒤 표시할 때만 반올림한다.
  // 이미 pct1/pct2 로 반올림된 두 값끼리 다시 빼거나 나누면 이중반올림 오차가 생긴다 — 실제로
  // 이전 구현은 58.5-58.2(반올림된 값)=0.3%p 를 냈는데, 원값 차이(0.5854405-0.5818158)*100
  // =0.36…%p 는 반올림하면 0.4%p 다. 원값으로 계산해야 다음 백테스트에서도 옳다.
  function deltaNote() {
    var basic = tierStat("basic"), deep = tierStat("deep");
    if (!basic || !deep) return null;
    if (!isNum(basic.directionHitRate) || !isNum(deep.directionHitRate) ||
        !isNum(basic.coneCoverage) || !isNum(deep.coneCoverage) ||
        !isNum(basic.calibrationECE) || !isNum(deep.calibrationECE) || deep.calibrationECE === 0) return null;

    var basicRateDisp = pct1(basic.directionHitRate), deepRateDisp = pct1(deep.directionHitRate);
    // 원값(fraction) 차이 → %p 로 바꾼 뒤에만 반올림한다.
    var diffPct = Math.round((deep.directionHitRate - basic.directionHitRate) * 1000) / 10;
    var mag = Math.abs(diffPct).toFixed(1);
    var dirFrag = diffPct >= 0 ? ("+" + mag + T.tcDeltaUp) : (mag + T.tcDeltaDown);

    var covBasic = pct1(basic.coneCoverage), covDeep = pct1(deep.coneCoverage);
    // 원값끼리 나눈 뒤에만 반올림한다 — pct2(basic)/pct2(deep) 이 아니다.
    var ratio = Math.round(basic.calibrationECE / deep.calibrationECE);

    return T.tcDeltaA + basicRateDisp.toFixed(1) + T.tcDeltaB + deepRateDisp.toFixed(1) + T.tcDeltaC + dirFrag +
      T.tcDeltaTail + covBasic.toFixed(1) + T.tcDeltaE + covDeep.toFixed(1) + T.tcDeltaF + ratio + T.tcDeltaG;
  }

  // 모집단 지표 3행 — 이 종목이 아니라 엔진 전체 측정값이다(컨트롤러 판정 D1). 인자를 받지
  // 않는다 — 종목별 프리뷰를 걷어냈으니 이 함수가 알아야 할 종목별 데이터가 없다.
  function rows() {
    return [
      { tier: "basic", rate: rateOf("basic"), coverage: coverageOf("basic"), ece: eceOf("basic"), note: null },
      // 심화의 불리한 사실은 여기(note)에 싣는다 — 카드 자신이 "판매 문구가 아니라
      // 정직한 문구"를 말해야 하는 자리다(설계서 §9.3 규칙3, 불리한 사실을 먼저/직접 말한다).
      { tier: "full", rate: rateOf("full"), coverage: coverageOf("full"), ece: eceOf("full"), note: deltaNote() },
      // 전문 — 가중치마다 다른 예측이라 하나의 적중률로 환원되지 않는다. 잰 적이 없다 —
      // 지어내지 않는다(rate:null → 화면이 "측정 중"을 그린다).
      { tier: "custom", rate: null, coverage: null, ece: null, note: T.tcCustomWarn }
    ];
  }

  return { rows: rows, baseline: baseline, axisPos: axisPos, scope: scope, AXIS_MIN: AXIS_MIN, AXIS_MAX: AXIS_MAX };
});
