// 리포트 화면의 계산만 담는다 — DOM 도 전역 엔진도 만지지 않는다.
// ForgeCore 를 인자로 받는 것은 MSGraph.basicGraph(ForgeCore) 와 같은 규약이다.
(function (root, factory) {
  if (typeof module !== "undefined" && module.exports) module.exports = factory();
  else root.MSReportModel = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  // 시안 2a 의 Tomorrow / In 1 week / In 1 month. 3개월(63봉)은 futW 상한(60)과
  // 콘 비중(28%→50%) 때문에 뺐다 — 설계서 §3.2.
  var HORIZONS = [{ key: "d1", bars: 1 }, { key: "w1", bars: 5 }, { key: "m1", bars: 21 }];

  function anchorOf(p) {
    if (!p || !p.path || !p.path.length) return null;
    return (p.anchor != null && isFinite(p.anchor)) ? p.anchor : p.path[0];
  }

  // 부른 방향이 맞을 확률. 중립이면 가리킬 방향이 없으므로 null —
  // 없는 방향에 "그 방향이 맞을 확률"을 붙일 수 없다(설계서 §6.1).
  function confidence(FC, prediction, regime) {
    if (regime !== "bull" && regime !== "bear") return null;
    var up = FC.aggUpProb(prediction);
    if (up == null || !isFinite(up)) return null;
    return regime === "bull" ? up : 100 - up;
  }

  function horizonRows(FC, prediction, regime) {
    var a = anchorOf(prediction);
    if (a == null) return [];
    var path = prediction.path, hi = prediction.hi || [], out = [], i;
    var neutral = (regime !== "bull" && regime !== "bear");
    for (i = 0; i < HORIZONS.length; i++) {
      var h = HORIZONS[i], idx = h.bars - 1;
      if (idx >= path.length) continue;            // 경로가 짧으면 그 행은 없다
      var v = path[idx];
      var chg = a ? ((v - a) / a) * 100 : 0;
      var prob = null;
      if (!neutral) {
        var raw = FC.upProb(v, hi[idx], a);
        prob = (chg >= 0) ? raw : 100 - raw;       // '그 변화가 일어날' 확률(PC 와 같은 정의)
      }
      out.push({ key: h.key, bars: h.bars, price: v, chgPct: chg, prob: prob });
    }
    return out;
  }

  // 생성물(vendor/backtest-summary.js)이 없으면 null — 적중 행만 감추고 화면은 성립한다.
  function hitRate(summary) {
    if (!summary || typeof summary.directionHitRate !== "number" || !isFinite(summary.directionHitRate)) return null;
    var right = Math.round(summary.directionHitRate * 1000) / 10;
    return { right: right, wrong: Math.round((100 - right) * 10) / 10 };
  }

  return { HORIZONS: HORIZONS, confidence: confidence, horizonRows: horizonRows, hitRate: hitRate };
});
