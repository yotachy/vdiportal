/* 스쿱포지 차트 드로잉 도구 — 추세선·평행채널·등락폭/기간 재기 + 마그넷.
   앵커는 (날짜, 가격). 봉 번호로 저장하면 일→주 전환 때 어긋난다.
   UMD: 브라우저에선 전역에 함수 노출(다른 classic script가 바로 호출),
        node 에선 module.exports(순수 헬퍼 단위테스트용). */
(function (root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else for (const k in api) root[k] = api[k];
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  /* 날짜 → 봉 위치. 정확 일치는 그 인덱스, 사이는 보간, 밖이면 외삽(음수/초과).
     주기를 바꿔도(일→주) 같은 화면 위치에 오게 하는 핵심. */
  function tToFi(times, t) {
    if (!Array.isArray(times) || times.length < 1 || !t) return NaN;
    const n = times.length;
    if (t <= times[0]) {
      if (t === times[0]) return 0;
      if (n < 2) return NaN;
      const span = _days(times[0], times[1]) || 1;            // 첫 간격으로 역외삽
      return -_days(t, times[0]) / span;
    }
    if (t >= times[n - 1]) {
      if (t === times[n - 1]) return n - 1;
      if (n < 2) return NaN;
      const span = _days(times[n - 2], times[n - 1]) || 1;    // 마지막 간격으로 외삽
      return (n - 1) + _days(times[n - 1], t) / span;
    }
    let lo = 0, hi = n - 1;                                   // 이진탐색으로 감싸는 두 봉
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (times[m] <= t) lo = m; else hi = m; }
    if (times[lo] === t) return lo;
    const d0 = _days(times[lo], times[hi]) || 1;
    return lo + _days(times[lo], t) / d0;
  }
  function _days(a, b) { return (Date.parse(b + "T00:00:00Z") - Date.parse(a + "T00:00:00Z")) / 86400000; }

  /* 봉 위치 → 날짜(반올림). 범위 밖은 양 끝으로 클램프 — 저장은 항상 실재 날짜로. */
  function fiToT(times, fi) {
    if (!Array.isArray(times) || !times.length) return "";
    const i = Math.max(0, Math.min(times.length - 1, Math.round(fi)));
    return times[i];
  }

  /* 점과 선분의 최단 거리(픽셀). 히트테스트용. */
  function segDist(px, py, ax, ay, bx, by) {
    const dx = bx - ax, dy = by - ay, L2 = dx * dx + dy * dy;
    if (L2 === 0) return Math.hypot(px - ax, py - ay);
    let t = ((px - ax) * dx + (py - ay) * dy) / L2;
    t = Math.max(0, Math.min(1, t));                          // 끝점 너머는 끝점까지
    return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
  }

  /* 기준선(a,b) 위 같은 fi 에서의 가격과 pt.p 의 차 = 평행채널 폭.
     점 3개를 독립 저장하면 평행이 깨지므로 이 오프셋 하나만 저장한다. */
  function chanOff(a, b, pt) {
    const span = (b.fi - a.fi) || 1;
    const onLine = a.p + (b.p - a.p) * ((pt.fi - a.fi) / span);
    return pt.p - onLine;
  }

  return { tToFi, fiToT, segDist, chanOff };
});
