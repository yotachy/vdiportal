// 화면들이 공유하는 작은 조각. 순수 함수만 둔다.
(function (root, factory) {
  if (typeof module !== "undefined" && module.exports) module.exports = factory();
  else root.MSUi = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";
  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = String(text);
    return e;
  }
  // 시안은 가격을 두 자리로 쓴다 — 1a 워치리스트 `162.20`·`231.55`, 2a 리포트 `162.20`.
  // 정수로 반올림하면 변동폭(-3.35)과 자릿수가 어긋나 리포트 상단이 어긋나 보인다.
  // 큰 수(원화·코인 `74,300`)는 소수 두 자리가 소음이라 시안대로 반올림 + 천단위 구분자.
  function fmtPrice(v) { return (Math.abs(v) < 1000 ? v.toFixed(2) : Math.round(v).toLocaleString()); }
  function fmtChg(v) { return (v > 0 ? "+" : "") + v.toFixed(2) + "%"; }
  function dotClass(dir) { return "wl-dot" + (dir === "bull" ? " bull" : dir === "bear" ? " bear" : ""); }
  // 스파크라인 SVG path — 값 배열을 w×h 박스에 정규화한다
  function sparkPath(pts, w, h) {
    if (!pts || pts.length < 2) return "";
    var lo = Math.min.apply(null, pts), hi = Math.max.apply(null, pts), sp = (hi - lo) || 1;
    return pts.map(function (v, i) {
      var x = (i / (pts.length - 1)) * w, y = h - ((v - lo) / sp) * h;
      return (i ? "L" : "M") + x.toFixed(1) + " " + y.toFixed(1);
    }).join(" ");
  }
  // ── 색 토큰(캔버스는 var() 를 못 읽으므로 style.css 를 단일 원본으로 런타임에 읽어온다) ──
  // report.js 지역 함수였다가 온보딩 차트가 두 번째 소비자가 되면서 올라왔다 — 두 벌이면
  // 폴백 색이 갈려 같은 캔들이 화면마다 다른 색이 된다.
  function readToken(name, fallback) {
    try {
      var v = getComputedStyle(document.documentElement).getPropertyValue(name);
      v = (v || "").trim();
      return v || fallback;
    } catch (e) { return fallback; }
  }
  function hexToRgba(hex, a) {
    var h = String(hex || "").replace("#", "");
    if (h.length === 3) h = h.charAt(0) + h.charAt(0) + h.charAt(1) + h.charAt(1) + h.charAt(2) + h.charAt(2);
    var r = parseInt(h.substr(0, 2), 16), g = parseInt(h.substr(2, 2), 16), b = parseInt(h.substr(4, 2), 16);
    if (!isFinite(r) || !isFinite(g) || !isFinite(b)) return "rgba(232,180,99," + a + ")";
    return "rgba(" + r + "," + g + "," + b + "," + a + ")";
  }
  function colTokens() {
    var gold = readToken("--gold", "#e8b463");
    return {
      bull: readToken("--bull", "#4fb98a"),
      bear: readToken("--bear", "#d96a6a"),
      gold: gold,
      cone: hexToRgba(gold, 0.09),                       // 콘 채움 9% 골드(design §4.3)
      hairline: readToken("--hairline", "rgba(238,241,247,.06)"),
      ink4: readToken("--ink-4", "#7c8598"),
      ink5: readToken("--ink-5", "#78819a"),
      pred2: readToken("--pred2", "#b892f5")
    };
  }

  return { el: el, fmtPrice: fmtPrice, fmtChg: fmtChg, dotClass: dotClass, sparkPath: sparkPath,
           readToken: readToken, hexToRgba: hexToRgba, colTokens: colTokens };
});
