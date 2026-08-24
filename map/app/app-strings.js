/* 머니스쿱 앱 — 문자열 키 사전(지침서 §15: 지금부터 키 기반, 하드코딩 금지).
   톤 규칙(지침서 §12): 해요체, 담백, 마침표로 끝, 가운뎃점은 명사 나열만.
   카피 원문 출처는 프로토타입(정본) — 화면 페이즈마다 해당 섹션을 추가한다. */
(function (root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else { root.MS = root.MS || {}; root.MS.strings = api; root.MS.str = api.str; }
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  const TABLE = {
    app: {
      title: "머니스쿱",
      tagline: "스쿱 엔진"
    },
    tabs: {
      home: "홈",
      signal: "시그널",
      analyze: "분석",
      score: "채점",
      stats: "통계",
      wallet: "내 스쿱"
    },
    header: {
      stocks: "종목",
      ariaInfo: "서비스 소개",
      ariaStocks: "종목 찾기 · 내 종목",
      ariaAccount: "계정"
    },
    toast: {
      runBusy: "분석이 이미 진행 중이에요 — 한 번에 하나만 돌릴 수 있어요",
      refreshed: "오늘 기준으로 새로고침했어요",
      guestXp: "구글 로그인하면 쌓여요",
      comingSoon: "다음 단계에서 열려요"
    },
    home: {
      todayTitle: "오늘의 종목 스쿱",
      emptyTitle: "아직 담아둔 종목이 없어요",
      emptyDesc: "종목을 담으면 오늘의 방향, 시그널, 채점이 여기에 모여요.",
      emptyCta: "종목 담으러 가기"
    },
    common: {
      confirm: "확인",
      close: "닫기",
      back: "뒤로",
      more: "더 보기"
    }
  };

  function str(path) {
    if (!path) return "";
    const parts = String(path).split(".");
    let node = TABLE;
    for (let i = 0; i < parts.length; i++) {
      if (node !== null && typeof node === "object" && parts[i] in node) node = node[parts[i]];
      else return path;
    }
    return typeof node === "string" ? node : path;
  }

  return { TABLE: TABLE, str: str };
});
