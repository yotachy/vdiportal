// 워치리스트 스캔 큐. 순차 처리 + 지수 백오프.
// 순차인 이유: TwelveData 무료가 분당 8회다. 서버가 일봉을 1시간 캐시하므로 웜 종목은
// 빠르게 지나가고, 한도에 실제로 걸리는 것은 콜드 종목뿐이다.
// 부분 결과를 즉시 콜백한다 — 8종목 전체를 기다리면 첫 정보까지 수 초가 죽는다.
(function (root, factory) {
  if (typeof module !== "undefined" && module.exports) module.exports = factory();
  else MSGlobals.define("MSScan", factory());
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  function createScanner(opts) {
    var loadOne = opts.loadOne, analyze = opts.analyze;
    var sleep = opts.sleep || function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };
    var gap = (opts.gap == null) ? 900 : opts.gap;
    var maxRetry = (opts.maxRetry == null) ? 2 : opts.maxRetry;

    async function one(sym) {
      var lastErr = null;
      for (var attempt = 0; attempt <= maxRetry; attempt++) {
        if (attempt > 0) await sleep(gap * Math.pow(2, attempt - 1));
        try { return analyze(sym, await loadOne(sym)); }
        catch (e) { lastErr = e; }
      }
      throw lastErr || new Error("scan failed: " + sym);
    }

    async function run(syms, onEach) {
      var list = Array.isArray(syms) ? syms : [];
      var done = 0, failed = 0;
      for (var i = 0; i < list.length; i++) {
        var sym = list[i];
        try { var rec = await one(sym); done++; onEach && onEach(sym, rec, null); }
        catch (e) { failed++; onEach && onEach(sym, null, e); }
        if (i < list.length - 1) await sleep(gap);
      }
      return { done: done, failed: failed };
    }

    return { run: run };
  }

  return { createScanner: createScanner };
});
