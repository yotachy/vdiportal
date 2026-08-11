// 차트 줌 계산. 순수 함수 — DOM 도 상태도 갖지 않는다.
// 창이 항상 오른쪽 끝에 붙어 있으므로 상태는 '보이는 봉 수'(tail) 하나다.
// PC 는 _chartWin{start,count} 와 핀치 중심 고정(rel·bi) 이 필요하지만, 팬을 안 넣어서 그게 없다.
(function (root, factory) {
  if (typeof module !== "undefined" && module.exports) module.exports = factory();
  else root.MSZoom = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  var DEFAULT_TAIL = 60;      // 화면폭 무관 고정 — 봉폭 기준으로 하면 펼침에서 197봉이 되어
                              // 예측 비중이 28%→11%, Phase 3 에서 고친 것이 원상복구된다.
  var DX_MIN = 2;             // 이보다 좁으면 몸통과 심지가 구분되지 않아 캔들이 얼룩이 된다
  var DX_MAX = 12;            // 이보다 넓으면 캔들이 비정상적으로 뚱뚱해진다
  var BAR_MIN = 20, BAR_MAX = 400;   // 절대 가드. 커버에선 BAR_MIN 이, 큰 화면에선 BAR_MAX 가 먼저 걸린다

  function limits(plotW, futW) {
    var f = futW || 0;
    var lo = Math.round(plotW / DX_MAX) - f;
    var hi = Math.round(plotW / DX_MIN) - f;
    lo = Math.max(BAR_MIN, Math.min(BAR_MAX, lo));
    hi = Math.max(BAR_MIN, Math.min(BAR_MAX, hi));
    if (hi < lo) hi = lo;   // 극단적으로 좁은 화면에서 역전 방지
    return { min: lo, max: hi };
  }

  function clamp(plotW, futW, tail) {
    var t = Math.round(tail);
    if (!isFinite(t)) return DEFAULT_TAIL;
    var L = limits(plotW, futW);
    return Math.max(L.min, Math.min(L.max, t));
  }

  // 벌리면 dist 가 커져 ratio<1 → 봉 수 감소 = 줌인. PC forge-app.js:1129 와 같은 식.
  function fromPinch(tail0, dist0, dist) {
    if (!isFinite(tail0)) return DEFAULT_TAIL;
    if (!(dist0 > 0) || !(dist > 0) || !isFinite(dist)) return Math.round(tail0);
    return Math.round(tail0 * (dist0 / dist));
  }

  return { limits: limits, clamp: clamp, fromPinch: fromPinch,
           DEFAULT_TAIL: DEFAULT_TAIL, DX_MIN: DX_MIN, DX_MAX: DX_MAX,
           BAR_MIN: BAR_MIN, BAR_MAX: BAR_MAX };
});
