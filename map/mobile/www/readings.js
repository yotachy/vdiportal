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

  // ADX 강도 어휘. 숫자만으로는 "16 and rising" 이 강한 추세처럼 읽혀 오도한다.
  var ADX_STRENGTH = { very_strong: "trend very strong", strong: "trend strong",
                       developing: "trend forming", weak: "trend still weak" };

  var STRUCT_EVENT = {
    BOS_up: "broke structure upward", BOS_down: "broke structure downward",
    CHoCH_up: "character change up — possible reversal",
    CHoCH_down: "character change down — possible reversal",
    none: "no break of structure yet"
  };
  // analyzeCCI·analyzeMFI 의 regime 은 1 / 0 / −1 숫자다
  var REGIME = { "1": "bullish regime", "0": "no regime bias", "-1": "bearish regime" };

  var ELLIOTT_STRUCT = { impulse_up: "Impulse count, upward", impulse_down: "Impulse count, downward",
                         corrective: "Corrective count", uncertain: "Wave count unclear" };
  // ⚠ analyzePattern 의 label 은 한국어다 — 영어 키(pattern)로만 매핑한다
  var PATTERN_NAME = { headshoulder: "Head and shoulders", invhead: "Inverse head and shoulders",
                       bullflag: "Bull flag", bearflag: "Bear flag" };

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
    },

    adx: function (r) {
      if (!has(r.adx)) return NONE;
      var li = r.adx.length - 1;
      var up = r.last.plusDI >= r.last.minusDI;
      // 선행 봉 수 — 엔진이 이미 준 배열을 훑는다(새 계산 아님)
      var lead = 0;
      for (var i = li; i > 0; i--) {
        if ((r.plusDI[i] >= r.minusDI[i]) !== up) break;
        lead++;
      }
      var prev = r.adx[Math.max(0, li - 5)];
      var rising = r.adx[li] >= prev;
      return n0(r.last.adx) + " and " + (rising ? "rising" : "easing")
           + ", " + (ADX_STRENGTH[r.strength] || "trend still weak")
           // 마이너스는 ASCII 하이픈으로 통일한다 — 기여도 칸이 toFixed() 라 ASCII 다.
           // 판독문만 유니코드 −(U+2212)를 쓰면 한 행 안에서 표기가 갈린다.
           + ", " + (up ? "+DI" : "-DI") + " ahead for " + lead + (lead === 1 ? " bar" : " bars");
    },

    stochastic: function (r) {
      if (!has(r.k)) return NONE;
      var s = "%K " + n0(r.last.k) + " / %D " + n0(r.last.d) + ", " + (RSI_ZONE[r.state] || r.state);
      if (r.cross && r.cross.type)
        s += ", " + (r.cross.type === "bull" ? "bullish" : "bearish") + " cross " + bars(r.cross.barsAgo);
      return s;
    },

    fib: function (r) {
      if (!has(r.levels)) return NONE;
      var z = r.zone || {}, near = z.nearest;
      var s = cap(r.dir === "up" ? "up" : r.dir === "down" ? "down" : "flat") + " swing";
      if (near) {
        // ratio 0 은 되돌림이 아니라 스윙 극점 자체다 — "the 0 level" 로 적으면 뜻이 안 통한다
        var at = (near.ratio === 0)
          ? "the swing " + (r.dir === "up" ? "high" : "low")
          : "the " + near.ratio + " retracement";
        s += ", price at " + at + " as " + (SR[near.side] || near.side);
      } else {
        s += ", price mid-range";
      }
      if (z.inGolden) s += ", inside the golden pocket";
      // degrees 는 "몇 개 척도로 쟀나"이지 "몇 개가 동의하나"가 아니다 — 동의로 적으면 거짓 귀속
      if (r.degrees && r.degrees.length > 1) s += ", " + r.degrees.length + " swing degrees measured";
      return s;
    },

    ichimoku: function (r) {
      if (!has(r.spanA)) return NONE;
      var pos = r.pricePos === "above" ? "Above the cloud"
              : r.pricePos === "below" ? "Below the cloud" : "Inside the cloud";
      var s = pos + ", cloud " + (r.cloud === "bull" ? "bullish" : r.cloud === "bear" ? "bearish" : "flat");
      s += r.tkCross.type
        ? ", tenkan crossed " + (r.tkCross.type === "bull" ? "up " : "down ") + bars(r.tkCross.barsAgo)
        : ", no tenkan cross in range";
      // 짧은 이력에선 엔진이 기간을 압축한다. 안 적으면 같은 문장이 다른 계산을 가리킨다.
      if (r.scaled) s += " (periods scaled to short history)";
      return s;
    },

    pivot: function (r) {
      if (!r.P || !has(r.R) || !has(r.S)) return NONE;
      var p = r.last, s;
      if (p > r.R[2]) s = "Above R3 " + px(r.R[2]);
      else if (p > r.R[1]) s = "Between R2 " + px(r.R[1]) + " and R3 " + px(r.R[2]);
      else if (p > r.R[0]) s = "Between R1 " + px(r.R[0]) + " and R2 " + px(r.R[1]);
      else if (p > r.P) s = "Between the pivot " + px(r.P) + " and R1 " + px(r.R[0]);
      else if (p > r.S[0]) s = "Between S1 " + px(r.S[0]) + " and the pivot " + px(r.P);
      else if (p > r.S[1]) s = "Between S2 " + px(r.S[1]) + " and S1 " + px(r.S[0]);
      else if (p > r.S[2]) s = "Between S3 " + px(r.S[2]) + " and S2 " + px(r.S[1]);
      else s = "Below S3 " + px(r.S[2]);
      return s + ", levels from the previous bar";
    },

    psar: function (r) {
      if (!has(r.series)) return NONE;
      var gap = (r.last && isFinite(r.last)) ? Math.abs(r.last - r.sar) / r.last * 100 : 0;
      return (r.dir > 0 ? "Dots below price" : "Dots above price") + " at " + px(r.sar)
           + ", " + n1(gap) + "% away" + (r.flip ? ", flipped on this bar" : "");
    },

    gann: function (r) {
      if (!has(r.angles)) return NONE;
      var d = (r.last && isFinite(r.last)) ? Math.abs(r.last - r.oneOne) / r.last * 100 : 0;
      var s = (r.last >= r.oneOne ? "Above" : "Below") + " the 1×1 line at " + px(r.oneOne) + " by " + n1(d) + "%";
      return s + (r.anchor ? ", anchored at " + px(r.anchor.price) : ", no anchor swing");
    },

    vwap: function (r) {
      if (!has(r.vwap)) return NONE;
      var side = r.pct >= 0 ? "above" : "below";
      return "Price " + n1(Math.abs(r.pct)) + "% " + side + " VWAP " + px(r.last);
    },

    supertrend: function (r, ctx) {
      if (!has(r.line)) return NONE;
      var s = (r.dir > 0 ? "Trend line below price" : "Trend line above price") + " at " + px(r.last);
      var p = lastOf((ctx && ctx.price) || []);
      // 플립까지의 거리 — 시안 6a 의 "Sitting 0.4% from a bearish flip" 이 이 값이다
      if (p != null && isFinite(p) && p !== 0)
        s += ", " + n1(Math.abs(p - r.last) / p * 100) + "% from a flip";
      if (r.flip && r.flip.barsAgo != null)
        s += ", flipped " + (r.flip.dir > 0 ? "bullish " : "bearish ") + bars(r.flip.barsAgo);
      return s;
    },

    // bias 가 항상 0 인 유일한 지표다. 문장이 그 이유를 말하지 않으면
    // 기여도 0.00 이 "못 읽었다"로 오독된다.
    atr: function (r) {
      if (!has(r.atr)) return NONE;
      return n1(r.pct) + "% of price per bar, volatility " + (r.regime || "normal")
           + " — this sizes the cone, not the direction";
    },

    volumeprofile: function (r) {
      if (!has(r.bins)) return NONE;
      var rel = r.priceRel === "above" ? "Above the value area"
              : r.priceRel === "below" ? "Below the value area" : "Inside the value area";
      return rel + " " + px(r.val) + "–" + px(r.vah) + ", heaviest trade at " + px(r.poc);
    },

    structure: function (r) {
      if (!has(r.swings)) return NONE;
      var tr = r.trend === "up" ? "Higher highs and higher lows"
             : r.trend === "down" ? "Lower highs and lower lows" : "No clear swing structure";
      var lo = r.swingLow ? r.swingLow.price : null, hi = r.swingHigh ? r.swingHigh.price : null;
      return tr + ", " + (STRUCT_EVENT[r.event] || "no break of structure yet")
           + " (swing " + px(lo) + "–" + px(hi) + ")";
    },

    keltner: function (r) {
      if (!has(r.midArr)) return NONE;
      var pos = r.pctB >= 1 ? "Above the upper channel"
              : r.pctB <= 0 ? "Below the lower channel"
              : r.pctB >= 0.5 ? "In the upper half of the channel" : "In the lower half of the channel";
      return pos + " " + px(r.lower) + "–" + px(r.upper) + (r.squeeze ? ", channel squeezing" : "");
    },

    donchian: function (r) {
      if (!has(r.midArr)) return NONE;
      return n0(r.pos * 100) + "% up the " + px(r.lower) + "–" + px(r.upper) + " range, midline "
           + (r.midSlope > 0 ? "rising" : r.midSlope < 0 ? "falling" : "flat");
    },

    cci: function (r) {
      if (!has(r.series)) return NONE;
      // 마이너스는 ASCII 하이픈 — 기여도 칸(toFixed)과 표기를 맞춘다
      var z = r.last >= 100 ? "above +100, stretched up"
            : r.last <= -100 ? "below -100, stretched down" : "inside the ±100 band";
      return n0(r.last) + ", " + z + ", " + REGIME[r.regime];
    },

    williams: function (r) {
      if (!has(r.series)) return NONE;
      var z = r.last >= -20 ? "overbought" : r.last <= -80 ? "oversold" : "neutral";
      return n0(r.last) + ", " + z + " in its lookback range";
    },

    // 엔진의 빈 반환 조건은 P < 2 뿐이다(forge-core analyzeAroon). up·down 이 둘 다 0 인 것은
    // 정상 데이터에서도 나온다 — 창의 첫 봉이 그 구간의 고점이자 저점일 때다. 값으로 판정하면
    // 멀쩡히 읽은 판독을 "못 읽었다"고 말하게 된다.
    aroon: function (r, ctx) {
      var price = (ctx && ctx.price) || [];
      if (price.length < 2) return NONE;
      return "Up " + n0(r.up) + " / down " + n0(r.down) + ", oscillator " + sgn1(r.osc)
           + " — the " + (r.osc >= 0 ? "high" : "low") + " is the more recent extreme";
    },

    mfi: function (r) {
      if (!has(r.series)) return NONE;
      var z = r.last >= 80 ? "overbought" : r.last <= 20 ? "oversold" : "neutral";
      return n0(r.last) + ", " + z + ", " + REGIME[r.regime] + " on money flow";
    },

    elliott: function (r) {
      if (!has(r.waves)) return NONE;
      var s = (ELLIOTT_STRUCT[r.structure] || "Wave count unclear")
            + ", currently in wave " + ((r.current && r.current.label) || "—");
      s += (r.next && r.next.target != null)
        ? ", next target " + px(r.next.target)
        : ", no projection";
      return s + " (" + n0((r.rules && r.rules.score ? r.rules.score : 0) * 100) + "% of wave rules met)";
    },

    smc: function (r) {
      if (!r.ok) return NONE;
      var f = (r.fvgs || []).length, o = (r.obs || []).length;
      if (!f && !o) return "No open fair-value gaps or order blocks";
      // 0 인 쪽은 적지 않는다 — "and 0 order blocks" 는 말할 값이 없는 것을 말하는 것이다
      var parts = [];
      if (f) parts.push(f + (f === 1 ? " open gap" : " open gaps"));
      if (o) parts.push(o + (o === 1 ? " order block" : " order blocks"));
      return parts.join(" and ") + " left behind";
    },

    // ⚠ cycle.phaseLabel 은 한국어다("고점 부근(하락 전환 임박)"). dir 로 조립한다.
    cycle: function (r) {
      if (!r.period) return NONE;
      var ph = r.dir === "rising" ? "rising toward the next peak"
             : r.dir === "falling" ? "falling toward the next trough" : "flat";
      var s = n0(r.period) + "-bar cycle, " + ph;
      if (r.nextTurn && r.nextTurn.bars != null)
        s += ", turn in about " + r.nextTurn.bars + (r.nextTurn.bars === 1 ? " bar" : " bars");
      return s;
    },

    // ⚠ has(r.series) 는 안 된다 — _rocRaw 는 P ≤ period(엔진 기본 12) 구간을 전부 0 으로
    // 채운 배열을 돌려준다(진짜 계산이 아니라 자리채움). 이 판독은 opts 없이 불리므로
    // 엔진 기본값 12 로 직접 문턱을 잰다.
    roc: function (r, ctx) {
      var price = (ctx && ctx.price) || [];
      if (!has(r.series) || price.length <= 12) return NONE;
      return sgn1(r.last) + "% over the lookback, momentum "
           + (r.last > 0 ? "positive" : r.last < 0 ? "negative" : "flat");
    },

    // ⚠ has(r.series) 는 안 된다 — P < fast+2(하드 플로어) 구간엔 analyzeAO 가 series 를
    // 전부 0 으로 채운 배열 + conf:0 을 돌려준다. conf 는 엔진이 스스로 매기는 신뢰도라
    // fast/slow 옵션이 바뀌어도 정확하다(봉수 하드코딩이 아님).
    ao: function (r) {
      if (!r.conf) return NONE;
      var s = sgn1(r.last) + ", " + (r.last >= 0 ? "above" : "below") + " the zero line";
      if (r.cross) s += ", crossed " + (r.cross > 0 ? "up" : "down") + " on this bar";
      return s;
    },

    cmf: function (r) {
      if (!has(r.series)) return NONE;
      var d = r.last > 0.05 ? "accumulation" : r.last < -0.05 ? "distribution" : "no clear accumulation";
      return (r.last >= 0 ? "+" : "") + (isFinite(r.last) ? r.last.toFixed(2) : "—") + ", " + d;
    },

    // ⚠ pattern.label 은 한국어다("헤드앤숄더"). 영어 키 pattern.pattern 으로 매핑한다.
    pattern: function (r) {
      if (!r.pattern || r.pattern === "none") return "No completed chart pattern in range";
      return (PATTERN_NAME[r.pattern] || "Chart pattern")
           + ", " + n0((r.confidence || 0) * 100) + "% fit, "
           + (r.confirmed ? "confirmed by the break" : "not yet confirmed");
    }
  };

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
