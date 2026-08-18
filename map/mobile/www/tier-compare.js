// 3단 대조(시안 7a) — 이 개편의 판매 논거. 각 티어 카드를 "왼쪽 = 답의 폭 · 오른쪽 = 적중률"로
// 고정한다(설계서 §3.3). 세 카드를 훑으면 "폭은 크게 줄고 적중률은 조금 오른다"가 그대로
// 보여야 한다 — 그래서 폭(엔진이 낸 실제 예측)과 적중률(MSBacktest 실측)을 한 줄에 나란히 둔다.
//
// 숫자 규율(설계서 §9, 상위 설계서와 같다):
//  ① 적중률·기준선·콘 커버리지·ECE 는 전부 window.MSBacktest 에서만 읽는다. 리터럴 금지 —
//     소스에 58/61/63/67 같은 숫자를 적는 순간 "어떤 측정인지 아무도 모르는 숫자"가 된다.
//  ② 전문(custom) 티어는 실측이 없다 — rate:null. 화면은 그 자리에 "측정 중"을 그린다.
//     없는 값을 지어내지 않는다.
//  ③ 방향 적중률은 자명 기준선(baselineAlwaysUp) 없이 단독 노출하지 않는다 — 호출부
//     (screens/report.js)가 baseline() 과 짝지어야만 rate 를 그린다.
//  ④ 심화의 "불리한 사실"(적중률은 겨우 오른다)은 여기서 실측으로 조립한 문장이다 —
//     시안 원문의 "2%p 만 오릅니다"는 샘플값이고 실측은 다르다(현재 데이터로 +0.3%p).
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

  // 적중률 축 확대(설계서 §3.3) — 0~100% 축에서는 이 크기의 차이가 안 보인다. 화면은
  // AXIS_MIN/MAX 를 그대로 표기 문구에 실어야 한다(rp-tc-axis, screens/report.js).
  var AXIS_MIN = 55, AXIS_MAX = 70;

  function isNum(v) { return typeof v === "number" && isFinite(v); }
  // 소수 1자리 퍼센트 — report-model.js 의 hitRate()·baseline 반올림과 같은 규칙
  // (Math.round(v*1000)/10)을 그대로 쓴다. 화면 여러 곳이 이 규칙으로 이미 61.0% 를 쓰고
  // 있는데 여기만 다르게 반올림하면 같은 기준선이 자리마다 다른 숫자로 보인다.
  function pct1(frac) { return isNum(frac) ? Math.round(frac * 1000) / 10 : null; }

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
  function rateOf(reportTier) {
    var key = reportTier === "basic" ? "basic" : reportTier === "full" ? "deep" : null;
    var s = key && tierStat(key);
    return s ? pct1(s.directionHitRate) : null;
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
  // 차이(작다) + 심화가 실제로 파는 것(콘 커버리지·ECE, 범위가 좁아지고 정직해진다).
  // 조각은 전부 strings.js 에서 오고 숫자만 여기서 계산한다 — 조각 자체엔 자릿수가 없다.
  function deltaNote() {
    var basic = tierStat("basic"), deep = tierStat("deep");
    if (!basic || !deep) return null;
    var basicRate = pct1(basic.directionHitRate), deepRate = pct1(deep.directionHitRate);
    var covBasic = pct1(basic.coneCoverage), covDeep = pct1(deep.coneCoverage);
    var eceBasic = pct1(basic.calibrationECE), eceDeep = pct1(deep.calibrationECE);
    if (basicRate == null || deepRate == null || covBasic == null || covDeep == null ||
        eceBasic == null || eceDeep == null || eceDeep === 0) return null;
    var diff = Math.round((deepRate - basicRate) * 10) / 10;
    var diffStr = (diff >= 0 ? "+" : "") + diff.toFixed(1);
    var ratio = Math.round(eceBasic / eceDeep);
    return T.tcDeltaA + basicRate.toFixed(1) + T.tcDeltaB + deepRate.toFixed(1) + T.tcDeltaC + diffStr +
      T.tcDeltaD + covBasic.toFixed(1) + T.tcDeltaE + covDeep.toFixed(1) + T.tcDeltaF + ratio + T.tcDeltaG;
  }

  // pred = { lo, hi, mid, err } — lo/hi 는 기본분석 자신의 "내일" 예측 범위, mid/err 는
  // 심화(32지표)를 로컬로 미리 돌려 얻은 중심값·오차다(구매 없이 — 온보딩 튜토리얼이 이미
  // 쓰는 패턴, screens/report.js 의 fullPreview 참고). 이 함수는 계산된 값을 조립만 한다.
  function rows(pred) {
    var p = pred || {};
    var lo = isNum(p.lo) ? p.lo : null, hi = isNum(p.hi) ? p.hi : null;
    var mid = isNum(p.mid) ? p.mid : null, err = isNum(p.err) ? p.err : null;

    var basicWidth = (lo != null && hi != null) ? (hi - lo) : null;
    var fullLo = (mid != null && err != null) ? mid - err : null;
    var fullHi = (mid != null && err != null) ? mid + err : null;
    var fullWidth = (err != null) ? err * 2 : null;

    return [
      { tier: "basic", lo: lo, hi: hi, width: basicWidth, rate: rateOf("basic"), note: null },
      // 심화의 불리한 사실은 여기(note)에 싣는다 — 카드 자신이 "판매 문구가 아니라
      // 정직한 문구"를 말해야 하는 자리다(설계서 §9.3 규칙3, 불리한 사실을 먼저/직접 말한다).
      { tier: "full", lo: fullLo, hi: fullHi, width: fullWidth, rate: rateOf("full"), note: deltaNote() },
      // 전문 — 폭은 사용자 가중치에 따라 달라져 미리 낼 수 있는 값이 아니고(설계서 §3.3
      // "설정에 따라 달라짐"), 적중률은 애초에 잰 적이 없다(가중치마다 다른 예측이라 하나의
      // 숫자로 환원되지 않는다) — 둘 다 null 로 둔다. 화면은 lo/hi/width 가 없으면 문구로,
      // rate 가 없으면 "측정 중"으로 그린다.
      { tier: "custom", lo: null, hi: null, width: null, rate: null, note: T.tcCustomWarn }
    ];
  }

  return { rows: rows, baseline: baseline, axisPos: axisPos, AXIS_MIN: AXIS_MIN, AXIS_MAX: AXIS_MAX };
});
