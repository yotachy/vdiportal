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
  return { el: el, fmtPrice: fmtPrice, fmtChg: fmtChg, dotClass: dotClass, sparkPath: sparkPath };
});
