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

  // 서버 기준 경로 — 웹(cafe24 www/map/app/)은 상대 "..", 앱 셸(Capacitor https://localhost)은
  // build-www 가 index.html 에 주입한 window.MS_SERVER_BASE(절대 URL). 두 배포가 같은 서버를 본다.
  function serverBase() {
    return (typeof window !== "undefined" && window.MS_SERVER_BASE) ? String(window.MS_SERVER_BASE).replace(/\/$/, "") : "..";
  }

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
        j = await io.fetchJson(serverBase() + "/forge-api.php?ohlc=1&symbol=" + encodeURIComponent(symbol) + "&tf=" + encodeURIComponent(apiTf));
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

  // dev 전용 fixture 모드(?fixture=1) — 네트워크 없이 결정적 합성 캔들로 여정 검증.
  // ⚠ 프로덕션 빌드에서 제거 대상(BUILD-PLAN P9 데모 트리거 목록).
  function fixtureStore() {
    function mk(key) {
      let h = 0;
      for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) % 997;
      const out = [];
      for (let i = 0; i < 300; i++) {
        const c = (50 + h % 200) * Math.exp(0.0012 * i) + (3 + h % 7) * Math.sin(i / (7 + h % 5));
        // 결정적 날짜(2026-08-20 종료 역산) — 원장 base_t 등 날짜 의존 경로 검증용
        const d = new Date(Date.UTC(2026, 7, 20) - (299 - i) * 86400000);
        const t = d.getUTCFullYear() + "-" + String(d.getUTCMonth() + 1).padStart(2, "0") + "-" + String(d.getUTCDate()).padStart(2, "0");
        out.push({ t: t, o: c * 0.996, h: c * 1.011, l: c * 0.989, c: c, v: 1000 + 400 * Math.sin(i / 6 + h) });
      }
      return out;
    }
    return { fetch: async function (symbol, tfKo) {
      return { ok: true, candles: mk(symbol + "|" + tfKo), symbol: symbol, name: "", source: "fixture" };
    } };
  }

  // ── 기기 식별자(익명) — 채점 원장·이후 지갑(P5)이 같은 값을 쓴다(w_account_id(deviceId) 합류 전제) ──
  function deviceId() {
    let id = null;
    try { id = localStorage.getItem("ms_device_id"); } catch (e) {}
    if (id) return id;
    let s = "d";
    for (let i = 0; i < 24; i++) s += "abcdefghijklmnopqrstuvwxyz0123456789".charAt(Math.floor(Math.random() * 36));
    try { localStorage.setItem("ms_device_id", s); } catch (e) {}
    return s;
  }

  // 앱 서버 API(app-api.php) — POST JSON {op, device, ...}
  async function serverApi(op, payload) {
    const body = payload || {};
    body.op = op;
    body.device = deviceId();
    const r = await fetch(serverBase() + "/app-api.php", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });
    return r.json();
  }

  const api = { MASTER: MASTER, tfApi: tfApi, quote: quote, spark: spark,
    createOHLC: createOHLC, browserIO: browserIO, fixtureStore: fixtureStore,
    deviceId: deviceId, api: serverApi, serverBase: serverBase, ohlc: null };
  // 브라우저에선 기본 스토어를 미리 만들어 둔다(테스트는 createOHLC 로 주입 생성)
  if (typeof window !== "undefined" && typeof fetch !== "undefined") {
    // dev 게이트(P9): ?fixture=1 은 로컬·사설망 호스트에서만 산다 — 프로덕션 URL 로는 켤 수 없다
    api.devMode = /^(localhost|127\.0\.0\.1|10\.|192\.168\.|100\.)/.test(window.location.hostname) &&
      /[?&]fixture=1/.test(window.location.search);
    api.ohlc = api.devMode ? fixtureStore() : createOHLC(browserIO());
  }
  return api;
});
