/* 머니스쿱 앱 — 데이터 계층: 종목 마스터·OHLC(서버 프록시)·시세 파생.
   시세는 전부 실데이터 — 프로토 T의 가격·등락(더미)은 쓰지 않는다(심볼·한글명만 승계, R-A01 임시 마스터).
   OHLC 원천: ../forge-api.php?ohlc=1 (TwelveData→Yahoo/Naver 폴백·서버 캐시 — PC 와 동일 경로).
   신선도·실패 시 이전 캔들 유지 정책은 PC(forge-app _OHLC_FRESH·_ohlcOut stale)를 승계. */
(function (root, factory) {
  const api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else { root.MS = root.MS || {}; root.MS.data = api; }
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  // 임시 종목 마스터(치환표 R-A01 — 실서비스는 검색 API, Q12) — 프로토 T 11종의 심볼·이름만
  const MASTER = [
    { sym: "NVDA", name: "엔비디아" },
    { sym: "AAPL", name: "애플" },
    { sym: "MSFT", name: "마이크로소프트" },
    { sym: "GOOGL", name: "알파벳" },
    { sym: "AMZN", name: "아마존" },
    { sym: "BTC/USD", name: "비트코인", crypto: true },
    { sym: "ETH/USD", name: "이더리움", crypto: true },
    { sym: "TSLA", name: "테슬라" },
    { sym: "META", name: "메타" },
    { sym: "SOL/USD", name: "솔라나", crypto: true },
    { sym: "XRP/USD", name: "리플", crypto: true }
  ];

  function tfApi(tfKo) {
    if (tfKo === "주") return "1week";
    if (tfKo === "월") return "1month";
    return "1day";
  }

  function quote(candles) {
    if (!Array.isArray(candles) || !candles.length) return null;
    const n = candles.length;
    const last = +candles[n - 1].c;
    const prev = n >= 2 ? +candles[n - 2].c : last;
    const chg = prev ? (last / prev - 1) * 100 : 0;
    return { price: last, chg: chg, up: chg >= 0 };
  }

  function spark(candles, n) {
    if (!Array.isArray(candles) || !candles.length) return [];
    const take = Math.min(n || candles.length, candles.length);
    const cs = candles.slice(candles.length - take).map(function (c) { return +c.c; });
    let min = Infinity, max = -Infinity;
    cs.forEach(function (v) { if (v < min) min = v; if (v > max) max = v; });
    const span = max - min;
    return cs.map(function (v) { return span > 0 ? (v - min) / span : 0.5; });
  }

  // ── OHLC 스토어(캐시·신선도·stale 버팀) — io 주입으로 node 테스트 가능 ──
  const FRESH = { "1day": 5 * 60e3, "1week": 30 * 60e3, "1month": 30 * 60e3 };

  function createOHLC(io) {
    const cache = {};   // "SYM|apiTf" → { candles, at, symbol, name, source }
    async function fetchOHLC(symbol, tfKo) {
      const apiTf = tfApi(tfKo);
      const key = symbol + "|" + apiTf;
      const hit = cache[key];
      const now = io.now();
      if (hit && (now - hit.at) < (FRESH[apiTf] || FRESH["1day"])) {
        return { ok: true, candles: hit.candles, symbol: hit.symbol, name: hit.name, source: hit.source };
      }
      let j = null;
      try {
        j = await io.fetchJson("../forge-api.php?ohlc=1&symbol=" + encodeURIComponent(symbol) + "&tf=" + encodeURIComponent(apiTf));
      } catch (e) { j = null; }
      if (!j || !j.ok || !Array.isArray(j.candles) || !j.candles.length) {
        if (hit) return { ok: true, candles: hit.candles, symbol: hit.symbol, name: hit.name, source: hit.source, stale: true };
        return { ok: false, error: (j && j.error) || "network" };
      }
      const v = { candles: j.candles, at: now, symbol: j.symbol || symbol,
        name: j.name || (hit && hit.name) || "", source: j.source || "" };
      cache[key] = v;
      return { ok: true, candles: v.candles, symbol: v.symbol, name: v.name, source: v.source };
    }
    return { fetch: fetchOHLC, _cache: cache };
  }

  function browserIO() {
    return {
      now: function () { return Date.now(); },
      fetchJson: async function (url) {
        const r = await fetch(url, { cache: "no-store" });
        if (!r.ok) { let j = null; try { j = await r.json(); } catch (e) {} return j || { ok: false }; }
        return r.json();
      }
    };
  }

  const api = { MASTER: MASTER, tfApi: tfApi, quote: quote, spark: spark,
    createOHLC: createOHLC, browserIO: browserIO, ohlc: null };
  // 브라우저에선 기본 스토어를 미리 만들어 둔다(테스트는 createOHLC 로 주입 생성)
  if (typeof window !== "undefined" && typeof fetch !== "undefined") api.ohlc = createOHLC(browserIO());
  return api;
});
