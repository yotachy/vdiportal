// 워치리스트의 판별·필터·배지 규칙. DOM 도 엔진도 만지지 않는다.
// screens/watchlist.js 는 스캔 큐·오타 제안·롱프레스 삭제가 얽힌 배선이라
// 규칙을 그 안에 두면 테스트가 안 붙는다 — MSLegend·MSReportModel 과 같은 분리다.
(function (root, factory) {
  if (typeof module !== "undefined" && module.exports) module.exports = factory();
  else MSGlobals.define("MSWatchlistModel", factory());
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  // 시안 1a 의 그룹 칩은 US Tech·Semis 같은 섹터인데 이 앱엔 섹터 데이터가 없다
  // (10a 의 포지션: "가격·거래량·시간만. 회사 리서치 없음"). 심볼만으로 갈리는 축으로 대체한다.
  var ETFS = ["SPY", "QQQ", "VOO", "VTI", "IWM", "DIA", "VXUS", "IJR", "IJH"];
  var ORDER = ["US", "KR", "ETF"];

  function market(sym) {
    var s = String(sym == null ? "" : sym).trim().toUpperCase();
    if (!s) return "US";
    if (/^\d{6}$/.test(s)) return "KR";
    for (var i = 0; i < ETFS.length; i++) { if (ETFS[i] === s) return "ETF"; }
    return "US";
  }

  function chips(list) {
    var items = list || [], counts = {}, i, m;
    for (i = 0; i < items.length; i++) {
      m = market(items[i] && items[i].sym);
      counts[m] = (counts[m] || 0) + 1;
    }
    var out = [{ key: "all", count: items.length }];
    for (i = 0; i < ORDER.length; i++) {
      if (counts[ORDER[i]]) out.push({ key: ORDER[i], count: counts[ORDER[i]] });
    }
    return out;
  }

  function filter(list, opts) {
    var items = list || [], o = opts || {};
    var chip = o.chip || "all";
    var q = String(o.query == null ? "" : o.query).trim().toLowerCase();
    // 활성 칩의 시장이 목록에서 사라졌으면(마지막 KR 종목 삭제 등) All 로 떨어뜨린다 —
    // 빈 화면이 뜨는 것보다 낫고, 셸이 다시 그려지며 그 칩도 사라진다.
    if (chip !== "all") {
      var has = false, j;
      for (j = 0; j < items.length; j++) { if (market(items[j].sym) === chip) { has = true; break; } }
      if (!has) chip = "all";
    }
    return items.filter(function (it) {
      if (chip !== "all" && market(it.sym) !== chip) return false;
      if (!q) return true;
      var sym = String(it.sym || "").toLowerCase(), name = String(it.name || "").toLowerCase();
      return sym.indexOf(q) >= 0 || name.indexOf(q) >= 0;
    });
  }

  // 워치리스트 행의 읽음 상태(시안 14a) — 순수 판정만 한다. 저장(viewedScanKey 조회·쓰기)은
  // store.js, 마크업(점 클래스·"SYM · 상태" 문구)은 screens/watchlist.js 소관.
  // rec 이 없으면(아직 스캔 안 한 종목) 상태 자체가 없다 — 점을 안 그린다.
  // viewedKey 가 이번 rec.scannedAt 과 같아야 "읽음" — 다르면(또는 아예 없으면) "새 판정".
  // 확신 배지(옛 badge())는 시안이 목록에서 의도적으로 뺐다(판정이 새면 리포트를 열 이유가
  // 사라진다) — 되살리지 말 것.
  function readState(rec, viewedKey) {
    if (!rec || !rec.scannedAt) return null;
    return (viewedKey === rec.scannedAt) ? "read" : "unread";
  }

  // 회사명은 74px 칸에 들어가야 한다. API 원문("NVIDIA Corporation")을 그대로 넣으면
  // "NVIDIA Corpo…" 로 잘려 싸구려로 보인다 — 시안 1a 는 NVIDIA·Palantir·Adv. Micro 처럼
  // 법인 접미사를 뗀 이름을 쓴다. 잘림은 그래도 남을 수 있지만(긴 한 단어), 대부분은 이걸로 사라진다.
  // 접미사만 지운다 — 단어를 줄여 쓰는 것(Advanced → Adv.)은 사전이 필요해 하지 않는다.
  var SUFFIX = /[\s,]+(corporation|corp\.?|incorporated|inc\.?|company|co\.?|limited|ltd\.?|plc|holdings?|group|s\.a\.?|n\.v\.?|ag|se)$/i;
  function shortName(name) {
    var s = String(name == null ? "" : name).trim();
    // 반복 적용 — "Alphabet Inc. Class A" 류가 아니라 "… Holdings Inc." 처럼 겹쳐 붙는 경우가 있다.
    for (var i = 0; i < 3; i++) {
      var next = s.replace(SUFFIX, "").trim().replace(/[\s,]+$/, "");
      if (next === s || !next) break;     // 이름 전체가 접미사면(예: "Inc") 원본을 지킨다
      s = next;
    }
    return s;
  }

  return { market: market, chips: chips, filter: filter, readState: readState, shortName: shortName, ETFS: ETFS };
});
