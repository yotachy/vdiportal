// 티어별 리포트 블록 **선언**. DOM 도 엔진도 모른다 — 이름의 순서와 셈법만 담는다.
//
// 왜 선언으로 빼는가: 블록 3/8/9 는 세 벌의 화면이 아니라 **같은 렌더러가 다른 목록을 받는
// 것**이다. 세 벌로 쓰면 공통 블록을 고칠 때 세 곳을 고쳐야 하고, 한 곳을 빠뜨려도 그 티어를
// 열어보기 전엔 아무도 모른다. screens/report.js 는 이미 966줄이었다 — 티어 두 벌을 그 안에
// 더 넣으면 손댈 수 없는 파일이 된다.
(function (root, factory) {
  if (typeof module !== "undefined" && module.exports) module.exports = factory();
  else root.MSReportBlocks = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  // 시안이 "블록 N개"를 셀 때 세지 않는 것들 — 화면의 뼈대지 파는 정보가 아니다.
  //  price  : 종목명·가격·티어 배지 머리
  //  legend : 차트존의 일부(18b 는 차트존을 하나로 센다)
  //  note   : 측정 범위 고지 각주
  //  spacer : 18a 의 의도된 빈 공간(flex:1)
  //  unlock : 해제 카드. 18a 는 "블록 3개 = 판정+차트+범위"라 적고 이 카드를 따로 뒀다
  var CHROME = ["price", "legend", "note", "spacer", "unlock"];

  // 기본분석(시안 18a) — 판정 → 차트(150) → 내일 범위 → **빈 공간** → 해제 카드.
  // 빈 공간은 버그가 아니다. "여기까지가 무료"를 스크롤 부재로 전달한다 — 채우지 말 것.
  var BASIC = ["price", "verdict", "chart", "horizons", "spacer", "unlock"];

  // 심화분석(시안 18b) — 판정 먼저. 8a 의 직전 상태 대조는 horizons 블록 **안에** 얹힌다
  // (별도 블록이 아니다 — 골격을 바꾸지 않고 얹는다는 것이 사용자 결정의 요지다).
  var FULL = ["price", "verdict", "chart", "legend", "horizons", "signals",
              "reasoning", "missing", "against", "tf", "note", "readings", "cta"];

  // 전문분석(시안 18c) — 심화의 블록을 **하나도 빼지 않고** 위에 조절판을 얹는다.
  // 한 겹이라도 빠지면 5스쿱 낸 사람이 손해다(인벤토리 §3). 그래서 FULL 을 복사해 쓴다:
  // 심화가 늘면 전문도 자동으로 는다. 조절판(weights)은 판정 위, 머리 바로 아래다.
  var CUSTOM = ["price", "weights"].concat(FULL.slice(1));

  var TIERS = { basic: BASIC, full: FULL, custom: CUSTOM };

  function orderOf(tier) {
    return (TIERS[tier] || BASIC).slice();
  }
  // 정보 블록 수 — 시안의 "블록 N개"와 같은 셈법.
  function countOf(tier) {
    return orderOf(tier).filter(function (k) { return CHROME.indexOf(k) < 0; }).length;
  }
  function isChrome(key) { return CHROME.indexOf(key) >= 0; }

  return { TIERS: TIERS, CHROME: CHROME, orderOf: orderOf, countOf: countOf, isChrome: isChrome };
});
