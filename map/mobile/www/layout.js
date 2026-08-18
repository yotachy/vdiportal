// 창 크기 → 레이아웃 결정. 순수 함수 — DOM 도 상태도 갖지 않는다.
// 경계값(MIN_W·MIN_H)은 이 두 상수가 유일한 출처다. CSS 는 자기 미디어쿼리를 갖지 않고
// app.js 가 붙이는 body.ms-dual 클래스를 읽는다 — 두 곳에 적으면 한쪽만 고쳤을 때
// "JS 는 2단이라 믿는데 CSS 는 단일로 그리는" 상태가 조용히 생긴다(설계 §3.1).
//
// P0 현황(태스크 4, 2026-08-18): 2단(폴드 펼침) 레이아웃은 후퇴했다 — 지금 app.js 는
// 아무도 body.ms-dual 을 세우지 않는다(셸이 단일 열만 그린다). 그래서 이 파일의
// isDual·MODE_QUERY·listWidth 는 P0 기준 소비자가 없다 — **죽은 코드처럼 보여도 지우지
// 말 것.** 2단은 P5(시안 9b·9c, 좌측 레일 포함)에서 통째로 재설계하며 그때 이 셋이 다시
// 소비된다. 반면 chartHeight(그리고 CHART_H_BASIC 등 티어별 높이 정책)는 2단 전용이
// 아니라 지금도 계속 쓰인다(report.js 참고) — 이 파일 전체가 "2단만의 것"은 아니다.
(function (root, factory) {
  if (typeof module !== "undefined" && module.exports) module.exports = factory();
  else MSGlobals.define("MSLayout", factory());
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  var MIN_W = 600;              // 안드로이드 medium 구간 시작
  var MIN_H = 480;              // 커버 가로회전(814×411)을 2단에서 배제한다 — 높이 411 에 두 칸은 못 쓴다
  var LIST_RATIO = 0.34;
  var LIST_MIN = 240, LIST_MAX = 300;
  var CHART_H_SINGLE = 520;     // Phase 1~4 가 커버에서 검증한 값 — 단일 모드에선 건드리지 않는다
  var CHART_H_MIN = 320, CHART_H_MAX = 460;
  var CHART_CHROME = 240;       // 헤드·티어행·판정·레전드가 먹는 세로(실측)

  var MODE_QUERY = "(min-width: " + MIN_W + "px) and (min-height: " + MIN_H + "px)";

  function isDual(w, h) { return w >= MIN_W && h >= MIN_H; }

  function listWidth(totalW) {
    var w = Math.round(totalW * LIST_RATIO);
    if (!isFinite(w)) return LIST_MIN;
    return Math.max(LIST_MIN, Math.min(LIST_MAX, w));
  }

  // 기본 티어는 가격 패널 하나뿐이라(chart-draw CHART_TIERS) 4단 높이를 주면 빈 칸이 늘어난
  // 차트가 된다. 시안 18a 의 차트존은 150 이고, 그 작음은 인색함이 아니라 설계다 —
  // 블록 3개 화면이 **스크롤 없이** 끝나야 "여기까지가 무료"가 스크롤 부재로 전달된다.
  // 190 = 플롯 150 + 상하 패딩 20 + 날짜축 18(chart-layout 의 AXIS_LABEL_H)에서 역산한 값.
  var CHART_H_BASIC = 190;

  function chartHeight(dual, vh, tier) {
    if (tier === "basic") return CHART_H_BASIC;   // 2단에서도 같다 — 넓은 화면이라고 더 파는 게 아니다
    if (!dual) return CHART_H_SINGLE;
    var h = Math.round(vh - CHART_CHROME);
    if (!isFinite(h)) return CHART_H_MIN;
    return Math.max(CHART_H_MIN, Math.min(CHART_H_MAX, h));
  }

  return { MODE_QUERY: MODE_QUERY, isDual: isDual, listWidth: listWidth, chartHeight: chartHeight,
           MIN_W: MIN_W, MIN_H: MIN_H, LIST_MIN: LIST_MIN, LIST_MAX: LIST_MAX, CHART_H_BASIC: CHART_H_BASIC };
});
