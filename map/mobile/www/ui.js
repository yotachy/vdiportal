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
  // 캔버스를 CSS 픽셀이 아니라 기기 픽셀로 맞춘다. 안 하면 폰에서 흐리다 —
  // 그리고 그 흐림은 node 테스트가 볼 수 없는 종류의 결함이다.
  // report.js relayout()·onboarding paintChart() 두 곳이 같은 블록을 갖고 있었고, 이미
  // 갈라져 있었다(온보딩만 날짜축 자리를 뗀다). 계산은 여기 하나, 높이 정책은 호출자가 정한다.
  function fitCanvas(cv, ctx, cssW, cssH) {
    var dpr = (typeof window !== "undefined" && window.devicePixelRatio) || 1;
    cv.width = Math.round(cssW * dpr);
    cv.height = Math.round(cssH * dpr);
    cv.style.height = cssH + "px";
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);   // 리사이즈 시점에만 설정
    return dpr;
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

  // 스쿱 마크 — 원 안이 아래에서 위로 차오르는 형태. 채움 비율(0~100)로 잔량·지급 연출을
  // 같은 그림 하나로 표현한다. 기하는 시안 실물 벡터(design_handoff/MoneyScoop 동선.dc.html
  // #msFill30/#msFill60 clipPath)를 그대로 옮긴 것 — viewBox 26×26·circle cx13 cy14 r10.5·
  // stroke-width 1.8. 채움 상단 y = 24.5 − (p/100)×21(원 지름) 은 그 두 샘플과 정확히 일치한다.
  // 48px 런처 아이콘만 일부러 꽉 찬 원을 쓴다(부분 채움이 그 크기에서 얼룩으로 보인다) —
  // 앱 내 마크와 다른 유일한 지점이라 되돌리지 말 것.
  //
  // id 는 반올림한 퍼센트만으로 만들면 안 된다 — 41.6 과 42.4 가 둘 다 msFill42 가 되어
  // 같은 페이지에 두 마크가 있으면(태스크 6 지갑 게이지 + 헤더 마크) clipPath id 가 충돌해
  // 한쪽이 다른 쪽 채움을 그린다. 호출마다 증가하는 카운터로 유일성을 보장한다.
  var scoopMarkSeq = 0;
  function scoopMark(fillPct) {
    var raw = (typeof fillPct === "number" && isFinite(fillPct)) ? fillPct : 42;
    var p = Math.max(0, Math.min(100, raw));
    var y = 24.5 - (p / 100) * 21;
    var id = "msFill" + (scoopMarkSeq++);
    return '<svg viewBox="0 0 26 26" width="22" height="22" fill="none" aria-hidden="true">' +
      '<clipPath id="' + id + '"><rect x="0" y="' + y.toFixed(2) + '" width="26" height="' + (26 - y).toFixed(2) + '"/></clipPath>' +
      '<circle cx="13" cy="14" r="10.5" stroke="currentColor" stroke-width="1.8"/>' +
      '<circle cx="13" cy="14" r="10.5" fill="currentColor" clip-path="url(#' + id + ')"/></svg>';
  }

  return { el: el, fmtPrice: fmtPrice, fmtChg: fmtChg,
           fitCanvas: fitCanvas, readToken: readToken, hexToRgba: hexToRgba, colTokens: colTokens,
           scoopMark: scoopMark };
});
