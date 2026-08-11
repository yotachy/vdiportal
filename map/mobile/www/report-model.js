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

  // 변화율 데드존 — 이 아래는 방향이 없는 것으로 본다(회색). screens/report.js 의 지평 행
  // 색 판정과 반드시 같은 임계를 써야 한다 — 다르면 색은 회색인데 확률은 방향으로 뒤집히는
  // 불일치가 생긴다(스윕 241건 중 1건 실제 발생, 최종수정웨이브 §⑥).
  var FLAT_EPS = 0.05;

  function dirOf(chg) {
    return chg > FLAT_EPS ? "up" : chg < -FLAT_EPS ? "down" : "flat";
  }

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
      var dir = dirOf(chg);
      var prob = null;
      if (!neutral) {
        // 헤드라인 확신(FC.aggUpProb)·차트 레전드(forge-draw.js:_predPCal) 모두 캘리브레이션을
        // 거친다. 여기만 원값(raw)을 쓰면 Platt 절편(+0.3501)만큼 스케일이 갈려, 하락 판정에서
        // 지평 행과 헤드라인이 최대 28%p 어긋난다(실측, 최종수정웨이브 §①).
        var cal = FC.calibrateUpProb(FC.upProb(v, hi[idx], a));
        prob = (dir === "down") ? 100 - cal : cal;   // '그 변화가 일어날' 확률(PC 와 같은 정의)
      }
      out.push({ key: h.key, bars: h.bars, price: v, chgPct: chg, dir: dir, prob: prob });
    }
    return out;
  }

  // 방향별 적중률. 전역 directionHitRate(58.1%) 하나를 모든 판정에 붙이면 하락 판정과 안 맞는다 —
  // 하락 콜은 구조적으로 절반 아래에서 맞는다(bearHitRate 42.6%, 백테스트 113/113건 실측 43~48%
  // 확신대). 46% 대 확신 옆에 58.1%를 붙이면 헤드라인과 적중률이 서로 다른 이야기를 한다.
  // 그래서 regime 이 가리키는 방향의 실측치를 그대로 쓴다(사용자 결정, 최종수정웨이브 §②).
  // 생성물(vendor/backtest-summary.js)이 없거나 해당 방향 필드가 없으면 null — 적중 행만 감추고
  // 화면은 성립한다. regime 이 중립이면 호출부(screens/report.js)가 이미 걸러 부르지 않지만,
  // 여기서도 방어적으로 null 을 돌린다.
  function hitRate(summary, regime) {
    if (!summary) return null;
    var key = regime === "bull" ? "bullHitRate" : regime === "bear" ? "bearHitRate" : null;
    if (!key) return null;
    var v = summary[key];
    if (typeof v !== "number" || !isFinite(v)) return null;
    var right = Math.round(v * 1000) / 10;
    return { right: right, wrong: Math.round((100 - right) * 10) / 10 };
  }

  return { HORIZONS: HORIZONS, FLAT_EPS: FLAT_EPS, confidence: confidence, horizonRows: horizonRows, hitRate: hitRate };
});
