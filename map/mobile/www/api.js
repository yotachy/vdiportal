// forge-api.php OHLC 프록시 클라이언트. 서버 응답을 ForgeCore.run 의 data 인자로 바꾸는 것만 한다.
// CORS 는 서버가 이미 열어 두었다(forge-api.php:4-9, 라이브 실측 확인) — 클라이언트에서 할 일 없음.
(function (root, factory) {
  if (typeof module !== "undefined" && module.exports) module.exports = factory();
  else MSGlobals.define("MSApi", factory());
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
    if (!json || !json.ok) throw new Error("OHLC failed: " + ((json && json.error) || "unknown"));
    var raw = json.candles;
    var floor = MIN_BARS[json.tf] || MIN_BARS["1day"];
    if (!Array.isArray(raw) || raw.length < floor) {
      // 메시지 접두는 report.js isBarsShort() 가 MSStr.t.rpBarsShort 로 문자열 매칭한다 — 그 상수를
      // 그대로 재사용해야 화면 문구와 매칭 문자열이 갈리지 않는다. 앱이 한국어로 전환되며(태스크 8)
      // 이 메시지도 err.message 로 화면에 그대로 노출되는 문구라 번역 대상이 됐다 — 옛 English-first
      // 시절의 "한글이면 안 된다"는 전제가 뒤집혔다. Node 테스트엔 MSStr 전역이 없으므로 영문으로
      // 폴백한다(api.test.mjs 가 그 폴백 문자열을 그대로 확인하므로 테스트를 따로 손대지 않는다).
      throw new Error((typeof MSStr !== "undefined" ? MSStr.t.rpBarsShort : "not enough bars") +
        ": " + (Array.isArray(raw) ? raw.length : 0) + " < " + floor + " (" + (json.tf || "1day") + ")");
    }
    // 거래정지 세션에 "-"·null 을 주는 제공자가 있다. "-" 는 NaN 이 되어 조용히 번지고
    // (chartGeometry 가 min=0/max=1 로 폴백 → 빈 차트, target.toFixed 는 "NaN"),
    // null·"" 은 +값이 0 이라 더 나쁘다 — 가격 0 인 봉으로 위장한다. 둘 다 막는다.
    function ok(v) { return v != null && v !== "" && isFinite(+v); }
    var candle = raw.map(function (c, i) {
      if (!ok(c.o) || !ok(c.h) || !ok(c.l) || !ok(c.c)) {
        throw new Error("bar " + i + " OHLC value invalid: " + JSON.stringify([c.o, c.h, c.l, c.c]));
      }
      return {
        o: +c.o, h: +c.h, l: +c.l, c: +c.c,
        // 없는 거래량은 undefined 로 남긴다 — 0 은 '거래 없음'이라는 거짓 사실이 된다.
        // 소비 측(spike.js)이 "전 봉에 거래량이 있는가"를 undefined 로 판별해
        // 부분 배열이면 통째로 넘기지 않도록 하는 근거가 이 값이다.
        v: (c.v != null && isFinite(+c.v)) ? +c.v : undefined,
        // 날짜 10자리로 자른다 — asOf(아래)는 이미 .slice(0,10) 하는데 candle[].t 는 그대로
        // 통과시키고 있었다. TwelveData 의 1day/1week/1month datetime 은 오늘은 날짜뿐이라
        // 안전하지만, 시:분:초가 붙어 오는 제공자를 만나면 chart-draw.js 의
        // String(lt).slice(5).replace("-",".") 가 "08.07T00:00:00Z" 를 축·크로스헤어에 그대로
        // 찍는다(forge-api.php 도 substr(...,0,10) 로 같은 경계를 막아 둔다). c.t 가 없을 때는
        // String(c.t) 로 강제하지 않는다 — "undefined" 라는 진짜 문자열이 생겨 truthy 가 되고,
        // chart-draw.js 의 `b.t ?` 가드(값이 없다 = falsy)를 뚫고 쓰레기가 찍힌다.
        t: (c.t == null ? undefined : String(c.t).slice(0, 10))
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

  // 조회 + 오타 구제. 서버가 notfound 일 때 Yahoo 기반 제안을 최대 3건 준다(forge-api.php).
  function loadTicker(symbol, tf, fetchImpl) {
    var f = fetchImpl || (typeof fetch === "function" ? fetch : null);
    if (!f) return Promise.reject(new Error("fetch unavailable"));
    return f(ohlcUrl(symbol, tf)).then(function (res) { return res.json(); }).then(function (json) {
      if (json && json.ok) return normalizeCandles(json);
      var err = new Error("OHLC failed: " + ((json && json.error) || "unknown"));
      if (json && json.error === "notfound") { err.notfound = true; err.suggest = json.suggest || []; }
      throw err;
    });
  }

  return { API_BASE: API_BASE, MIN_BARS: MIN_BARS, ohlcUrl: ohlcUrl, normalizeCandles: normalizeCandles, loadTicker: loadTicker };
});
