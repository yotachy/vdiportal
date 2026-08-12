// 지표별 영어 판독문. 시안 6a 의 REASONING · 32 NODES 와 AGAINST THIS CALL 이 같은 행 모양을
// 쓰므로 출처도 하나다.
//
// 규율 셋:
//   1. 출처는 analyzeX 반환 필드뿐이다. 새 데이터·백테스트·외부 호출 0회.
//   2. 파생 계산은 엔진이 준 배열 안에서만 한다(예: +DI 선행 봉 수). 새 지표 계산 금지.
//   3. **반환 필드 안에 한국어가 있다** — pattern.label("헤드앤숄더") · cycle.phaseLabel ·
//      fib.degrees[].name("단기"). 반드시 영어 키(pattern.pattern·cycle.dir)로 조립한다.
//      buildCounted() 가 *Steps() 로 당한 것과 같은 자리인데 필드 안에 숨어 있다.
//
// 데이터가 모자라면 빈 문장이 아니라 이유를 적는다(NONE) — 결핍 박스와 같은 태도.
(function (root, factory) {
  if (typeof module !== "undefined" && module.exports) module.exports = factory(require("./strings.js"));
  else root.MSReadings = factory(root.MSStr);
})(typeof self !== "undefined" ? self : this, function (Str) {
  "use strict";

  // 상태 어휘는 MSStr 공유 맵에서 읽는다 — MSLegend(레전드)와 같은 개념을 각자 하드코딩하면
  // 대소문자가 갈린다(Phase 3 에서 실제로 갈렸다).
  var MA_ALIGN = (Str && Str.MA_ALIGN) || {};
  var VOL_STATE = (Str && Str.VOL_STATE) || {};
  var VOL_REL = (Str && Str.VOL_REL) || {};
  var BB_STATE = (Str && Str.BB_STATE) || {};
  var RSI_ZONE = (Str && Str.RSI_ZONE) || {};
  var SR = (Str && Str.SR) || {};

  var NONE = "Not enough bars to read";

  function cap(s) { return s ? s.charAt(0).toUpperCase() + s.slice(1) : s; }
  function n0(v) { return (v == null || !isFinite(v)) ? "—" : String(Math.round(v)); }
  function n1(v) { return (v == null || !isFinite(v)) ? "—" : String(Math.round(v * 10) / 10); }
  function sgn1(v) { return (v == null || !isFinite(v)) ? "—" : (v >= 0 ? "+" : "") + n1(v); }
  // 가격 표기는 MSUi.fmtPrice·MSLegend 와 같은 규칙 — 1000 미만은 두 자리, 이상은 반올림.
  function px(v) {
    if (v == null || !isFinite(v)) return "—";
    return Math.abs(v) < 1000 ? v.toFixed(2) : Math.round(v).toLocaleString();
  }
  function bars(k) { return k === 0 ? "on this bar" : k === 1 ? "1 bar ago" : k + " bars ago"; }
  function has(a) { return !!(a && a.length); }
  function lastOf(a) { return has(a) ? a[a.length - 1] : null; }

  var SAY = {
    ma: function (r) {
      if (!r.mas || !r.mas.long) return NONE;
      var s = cap(MA_ALIGN[r.align.order] || "mixed");
      s += r.cross.type
        ? ", " + (r.cross.type === "golden" ? "golden" : "dead") + " cross " + bars(r.cross.barsAgo)
        : ", no crossover in range";
      if (r.sr.ma) s += ", price at the " + r.sr.ma + " line as " + (SR[r.sr.side] || r.sr.side);
      return s;
    },

    macd: function (r) {
      if (!has(r.hist)) return NONE;
      var s = "Histogram " + sgn1(r.last.hist) + " and " + (r.rising ? "rising" : "falling");
      s += r.cross.type
        ? ", " + (r.cross.type === "bull" ? "golden" : "dead") + " cross " + bars(r.cross.barsAgo)
        : ", no crossover in range";
      return s;
    },

    rsi: function (r) {
      if (!has(r.series)) return NONE;
      var above = (r.cross50 === "above" || r.cross50 === "cross_up");
      var s = n0(r.last) + ", " + (RSI_ZONE[r.zone] || r.zone) + ", " + (above ? "above" : "below") + " the 50 line";
      if (r.divergence && r.divergence.type) s += ", " + r.divergence.type + " divergence";
      return s;
    },

    bollinger: function (r) {
      if (!has(r.pctB)) return NONE;
      var s = cap(BB_STATE[r.state] || "mid band") + (r.squeeze ? " in a squeeze" : "");
      s += ", %B " + (isFinite(r.last.pctB) ? r.last.pctB.toFixed(2) : "—");
      s += ", midline " + (r.midSlope > 0.02 ? "rising" : r.midSlope < -0.02 ? "falling" : "flat");
      return s;
    },

    volume: function (r) {
      if (!has(r.series)) return NONE;
      var s = cap(VOL_STATE[r.state] || "normal") + " volume at " + (isFinite(r.ratio) ? r.ratio.toFixed(2) : "—")
            + "x average, " + (VOL_REL[r.relationship] || "weakening");
      if (r.divergence && r.divergence.type) s += ", " + r.divergence.type + " divergence";
      return s;
    }
  };

  // Task 2~4 가 채운다. 스텁이 있어야 키 일치·한글·EMPTY 계약 테스트가 처음부터 돈다.
  // **덮어쓰지 않는다** — 나중 태스크가 위 리터럴에 실제 구현을 넣고 이 배열에서 이름 빼는 것을
  // 잊으면, 무조건 대입은 그 구현을 조용히 NONE 으로 되돌린다. 계약 테스트는 NONE 도 통과시키므로
  // 아무도 못 잡는다.
  ["adx", "stochastic", "fib", "ichimoku", "pivot", "psar", "gann",
   "vwap", "supertrend", "atr", "volumeprofile", "structure", "keltner", "donchian",
   "cci", "williams", "aroon", "mfi",
   "elliott", "smc", "cycle", "roc", "ao", "cmf", "pattern"].forEach(function (bt) {
    if (!SAY[bt]) SAY[bt] = function () { return NONE; };
  });

  // 방향을 물을 수 없는 둘 — analyzeTrend 는 bias 를 안 주고, phasefold 는 analyzeX 자체가 없다
  // (엔진이 combine 안에서만 쓴다). 문장은 쓰되 기여도 칸은 비운다.
  var NO_DIR = {
    trend: function (r, ctx) {
      if (!r || !r.channel || !r.windows) return NONE;
      var w = r.windows[r.dominant] || r.windows.long;
      if (!w) return NONE;
      var price = (ctx && ctx.price) || [];
      var p = lastOf(price);
      if (p == null) return NONE;
      var line = r.channel.bRaw + r.channel.slopeRaw * (price.length - 1);
      var dir = r.channel.slopeRaw > 0 ? "Rising" : r.channel.slopeRaw < 0 ? "Falling" : "Flat";
      return dir + " channel over " + w.m + " bars, price in the " + (p >= line ? "upper" : "lower") + " half";
    },
    phasefold: function () {
      return "Used only where the engine blends nodes — no standalone reading";
    }
  };

  function say(blockType, result, ctx) {
    var fn = SAY[blockType] || NO_DIR[blockType];
    if (!fn) return "";
    try { return fn(result || {}, ctx || {}) || NONE; }
    catch (e) { return NONE; }   // 판독문 하나가 화면 전체를 죽이지 않는다
  }

  return { SAY: SAY, NO_DIR: NO_DIR, NONE: NONE, say: say };
});
