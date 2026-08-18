// 예측 기록과 다음날 판정 — 이 앱의 **고리**다(핸드오프 README §B "매일 루프").
//
//   워치리스트(어제 결과가 목록보다 위) → 결과 상세 → 오늘 판정 → 해제 → 심화
//   → 내일 확인할 결과가 하나 더 생김 ↺
//
// "5번이 1번을 만든다" — 심화분석을 볼 때마다 내일 확인할 결과가 예약되고, 그 결과가 다음 날
// 앱을 열게 한다. 이 고리가 없으면 앱은 "목록 → 리포트 한 방"으로 끝나고 광고 노출도 안 는다.
//
// **서버가 필요 없다.** 오래 "예측 기록 서버가 있어야 한다"는 이유로 이 고리를 미뤄뒀는데,
// 닫는 데 필요한 것은 (a) 오늘 무엇을 말했는지 적어두는 것과 (b) 내일 새 봉으로 재는 것뿐이다.
// 서버는 기기 간 동기화·부정방지용이지 고리의 전제가 아니다.
//
// 이 모듈은 순수하다 — 저장은 store.js, 화면은 watchlist/result 가 한다. 판정 규칙이 화면
// 여러 곳에 흩어지면 "맞았다"의 정의가 화면마다 달라진다.
(function (root, factory) {
  if (typeof module !== "undefined" && module.exports) module.exports = factory();
  else MSGlobals.define("MSPredLog", factory());
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  // 기록 한 건. 화면이 나중에 "무엇을 근거로 맞았다고 하는가"를 말할 수 있어야 하므로
  // 판정에 쓰는 값(범위·중심·기준일)을 전부 남긴다 — 나중에 다시 계산하지 않는다.
  // 다시 계산하면 그때의 엔진 버전·그때의 데이터가 아니라 오늘 것으로 재게 된다.
  //   { sym, name, tier, at, asOf, base, mid, lo, hi, basicLo, basicHi, engineVersion }
  //   asOf   — 예측의 기준일(마지막 확정 봉). 판정은 그 **다음** 확정 봉으로 한다.
  //   base   — 기준일 종가. "얼마나 벗어났나"를 말하려면 출발점이 필요하다.
  //   basicLo/basicHi — 같은 시점 기본분석의 범위. 빗나간 날 "기본분석이었다면 적중이었습니다"를
  //            말하려면 그때의 기본 범위를 알아야 한다(14b). 없으면 그 문장을 안 쓴다.

  function make(rec) {
    if (!rec || !rec.sym || !rec.asOf) return null;
    var out = {
      sym: String(rec.sym).toUpperCase(),
      name: rec.name || "",
      tier: rec.tier || "full",
      at: rec.at || null,               // 사용자가 본 시각(ISO). 호출자가 넣는다 — 여기서 시계를 안 읽는다.
      asOf: String(rec.asOf).slice(0, 10),
      base: num(rec.base), mid: num(rec.mid), lo: num(rec.lo), hi: num(rec.hi),
      basicLo: num(rec.basicLo), basicHi: num(rec.basicHi),
      engineVersion: rec.engineVersion || null
    };
    if (out.mid == null || out.lo == null || out.hi == null) return null;
    return out;
  }

  function num(x) { return (typeof x === "number" && isFinite(x)) ? x : null; }

  // 판정 대상인가 — 기준일보다 **뒤의** 확정 봉이 있어야 한다. 같은 날 봉으로 재면
  // 예측한 그 봉을 자기가 맞혔다고 말하게 된다(lookahead 의 거울상).
  function judgeBar(rec, candle) {
    if (!rec || !candle || !candle.length) return null;
    for (var i = 0; i < candle.length; i++) {
      var b = candle[i];
      if (!b || !b.t) continue;
      if (String(b.t).slice(0, 10) > rec.asOf) return b;
    }
    return null;
  }

  // 판정. **범위 적중**이 기준이다 — 방향이 아니라 "말한 범위 안에 들어왔는가".
  // 시안 17b/14b 가 그렇게 말한다("범위 적중" · "0.4만큼 벗어났습니다").
  // 방향으로 재면 폭을 좁게 부르는 것이 아무 대가도 치르지 않게 되어, 심화가 파는 것
  // (정직한 범위)과 화면이 칭찬하는 것이 어긋난다.
  function judge(rec, candle) {
    var bar = judgeBar(rec, candle);
    if (!bar) return null;                      // 아직 결과가 없다 — 없는 것을 있다고 하지 않는다
    var actual = num(bar.c);
    if (actual == null) return null;
    var hit = actual >= rec.lo && actual <= rec.hi;
    // 벗어난 거리 — 안쪽이면 0. 사용자가 보는 "0.4만큼 벗어났습니다"가 이것이다.
    var miss = hit ? 0 : (actual < rec.lo ? rec.lo - actual : actual - rec.hi);
    // 같은 날 기본분석이었다면 맞았을까(14b 의 인사이트). 기록에 없으면 말하지 않는다.
    var basicHit = (rec.basicLo != null && rec.basicHi != null)
      ? (actual >= rec.basicLo && actual <= rec.basicHi) : null;
    return {
      sym: rec.sym, name: rec.name, tier: rec.tier, asOf: rec.asOf,
      judgedOn: String(bar.t).slice(0, 10),
      actual: actual, hit: hit, miss: miss,
      lo: rec.lo, hi: rec.hi, mid: rec.mid,
      width: rec.hi - rec.lo,
      basicHit: basicHit, basicLo: rec.basicLo, basicHi: rec.basicHi,
      // 심화가 좁혀서 빗나간 경우 — 14b 가 "심화가 나빠서가 아니라 더 정확히 말하려다"를
      // 말할 수 있는 조건이다. 이 조합일 때만 그 문장이 참이다.
      narrowedAndMissed: (hit === false && basicHit === true)
    };
  }

  // 아직 판정 안 된 기록만 남긴다(중복 판정 방지는 호출자가 판정 결과를 적어 처리한다).
  function pending(list) {
    return (list || []).filter(function (r) { return r && !r.judgedOn; });
  }

  // 화면에 올릴 결과 목록. 최신 기준일부터, 최대 n 건(시안 14a: 3건).
  function recent(judged, n) {
    var out = (judged || []).slice().sort(function (a, b) {
      return String(b.judgedOn || "").localeCompare(String(a.judgedOn || ""));
    });
    return out.slice(0, n == null ? 3 : n);
  }

  // 개인 적중률은 **20건 이상**부터만 낸다(핸드오프 원칙 5: "14건에 67% 적중은 거짓말").
  // 미만이면 null 을 돌려주고, 화면은 숫자 대신 "아직 성적이 아닙니다"를 쓴다.
  var MIN_N = 20;
  function hitRate(judged) {
    var done = (judged || []).filter(function (r) { return r && typeof r.hit === "boolean"; });
    if (done.length < MIN_N) return null;
    var hits = done.filter(function (r) { return r.hit; }).length;
    return { n: done.length, rate: hits / done.length };
  }

  return { make: make, judge: judge, judgeBar: judgeBar, pending: pending,
           recent: recent, hitRate: hitRate, MIN_N: MIN_N };
});
