// forge-api.php OHLC 프록시 클라이언트. 서버 응답을 ForgeCore.run 의 data 인자로 바꾸는 것만 한다.
// CORS 는 서버가 이미 열어 두었다(forge-api.php:4-9, 라이브 실측 확인) — 클라이언트에서 할 일 없음.
(function (root, factory) {
  if (typeof module !== "undefined" && module.exports) module.exports = factory();
  else root.MSApi = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  var API_BASE = "https://parksvc.mycafe24.com/map/forge-api.php";

  // 주기별 최소 봉 수. 일봉 220 은 PC 신호 스캔과 같은 기준(forge-app.js scanAlerts).
  // 주·월봉은 같은 기준을 쓰면 신생 종목이 전부 막히므로 낮춘다 — 어떤 지표가 실제로
  // 열화하는지는 Phase 1 에서 측정해 조정한다.
  var MIN_BARS = { "1day": 220, "1week": 120, "1month": 60 };

  function ohlcUrl(symbol, tf, since) {
    tf = tf || "1day";
    var u = API_BASE + "?ohlc=1&symbol=" + encodeURIComponent(symbol) + "&tf=" + encodeURIComponent(tf);
    if (since) u += "&since=" + encodeURIComponent(since);
    return u;
  }

  function normalizeCandles(json) {
    if (!json || !json.ok) throw new Error("OHLC 실패: " + ((json && json.error) || "unknown"));
    var raw = json.candles;
    var floor = MIN_BARS[json.tf] || MIN_BARS["1day"];
    if (!Array.isArray(raw) || raw.length < floor) {
      throw new Error("봉 부족: " + (Array.isArray(raw) ? raw.length : 0) + " < " + floor + " (" + (json.tf || "1day") + ")");
    }
    // 거래정지 세션에 "-"·null 을 주는 제공자가 있다. "-" 는 NaN 이 되어 조용히 번지고
    // (chartGeometry 가 min=0/max=1 로 폴백 → 빈 차트, target.toFixed 는 "NaN"),
    // null·"" 은 +값이 0 이라 더 나쁘다 — 가격 0 인 봉으로 위장한다. 둘 다 막는다.
    function ok(v) { return v != null && v !== "" && isFinite(+v); }
    var candle = raw.map(function (c, i) {
      if (!ok(c.o) || !ok(c.h) || !ok(c.l) || !ok(c.c)) {
        throw new Error("봉 " + i + " OHLC 값 이상: " + JSON.stringify([c.o, c.h, c.l, c.c]));
      }
      return {
        o: +c.o, h: +c.h, l: +c.l, c: +c.c,
        // 없는 거래량은 undefined 로 남긴다 — 0 은 '거래 없음'이라는 거짓 사실이 된다.
        // 소비 측(spike.js)이 "전 봉에 거래량이 있는가"를 undefined 로 판별해
        // 부분 배열이면 통째로 넘기지 않도록 하는 근거가 이 값이다.
        v: (c.v != null && isFinite(+c.v)) ? +c.v : undefined
      };
    });
    return {
      price: candle.map(function (c) { return c.c; }),
      candle: candle,
      asOf: String(raw[raw.length - 1].t || "").slice(0, 10),
      source: json.source || "",
      name: json.name || json.symbol || ""
    };
  }

  return { API_BASE: API_BASE, MIN_BARS: MIN_BARS, ohlcUrl: ohlcUrl, normalizeCandles: normalizeCandles };
});
