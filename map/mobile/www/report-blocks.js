// 티어별 리포트 블록 **선언**. DOM 도 엔진도 모른다 — 이름의 순서와 셈법만 담는다.
//
// 왜 선언으로 빼는가: 블록 3/8/9 는 세 벌의 화면이 아니라 **같은 렌더러가 다른 목록을 받는
// 것**이다. 세 벌로 쓰면 공통 블록을 고칠 때 세 곳을 고쳐야 하고, 한 곳을 빠뜨려도 그 티어를
// 열어보기 전엔 아무도 모른다. screens/report.js 는 이미 966줄이었다 — 티어 두 벌을 그 안에
// 더 넣으면 손댈 수 없는 파일이 된다.
(function (root, factory) {
  if (typeof module !== "undefined" && module.exports) module.exports = factory();
  else MSGlobals.define("MSReportBlocks", factory());
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  // 시안이 "블록 N개"를 셀 때 세지 않는 것들 — 화면의 뼈대지 파는 정보가 아니다.
  //  price  : 종목명·가격·티어 배지 머리
  //  legend : 차트존의 일부(18b 는 차트존을 하나로 센다)
  //  note   : 측정 범위 고지 각주
  //  spacer : 18a 의 의도된 빈 공간(flex:1)
  //  unlock : 해제 카드. 18a 는 "블록 3개 = 판정+차트+범위"라 적고 이 카드를 따로 뒀다
  // 크롬 — 시안의 "블록 N개" 셈에 안 들어가는 것들. 티어가 **파는 정보**가 아니라 화면의
  // 골격이거나(가격 머리·범례·면책) 되돌아보기 장치다.
  // "last"(지난 판정, 21a)를 여기 두는 이유: 그것은 이 티어가 오늘 파는 정보가 아니라
  // 이미 값을 치른 과거의 결과다. 정보 블록으로 세면 기본분석이 3개가 아니라 4개가 되어
  // "여기까지가 무료"라는 시안의 셈이 무너진다.
  var CHROME = ["price", "legend", "note", "spacer", "unlock", "last"];

  // 기본분석(시안 18a) — 판정 → 차트(150) → 내일 범위 → **빈 공간** → 해제 카드.
  // 빈 공간은 버그가 아니다. "여기까지가 무료"를 스크롤 부재로 전달한다 — 채우지 말 것.
  // "last" 는 지난 판정 되돌아보기(시안 21a) — 값을 치른 적이 있는 종목에만 나온다.
  // 판정 **위**에 둔다: 앱을 다시 연 사람의 첫 질문이 "어제 그거 맞았나"이기 때문이고,
  // 그 답을 아래로 내리면 오늘 값을 먼저 보고 어제 것과 헷갈린다.
  var BASIC = ["price", "last", "verdict", "chart", "horizons", "spacer", "unlock"];

  // 심화분석(시안 18b) — 판정 먼저. 8a 의 직전 상태 대조는 horizons 블록 **안에** 얹힌다
  // (별도 블록이 아니다 — 골격을 바꾸지 않고 얹는다는 것이 사용자 결정의 요지다).
  //
  // P1 이 갖고 있던 SIGNALS·REASONING·미반영 박스 셋은 여기서 빠졌다. 사라진 게 아니라
  // **판독문 화면(20a)으로 옮겼다** — 시안 18b 가 그 자리에 "지표 32개 판독문" 링크 하나를
  // 두는 이유가 이것이다. 목적지 없이 먼저 지웠으면 돈 내고 산 정보가 없어졌을 것이라,
  // 판독문 화면(Task 10)을 먼저 세우고 이 라운드에 옮겼다.
  var FULL = ["price", "last", "verdict", "chart", "legend", "horizons",
              "against", "tf", "note", "readings", "cta"];

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
