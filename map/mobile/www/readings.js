// 지표별 한국어 판독문(태스크 8 에서 번역 — 예전엔 영문이었다). 시안 6a 의 REASONING · 32 NODES
// 와 AGAINST THIS CALL 이 같은 행 모양을 쓰므로 출처도 하나다.
//
// 규율 셋:
//   1. 출처는 analyzeX 반환 필드뿐이다. 새 데이터·백테스트·외부 호출 0회.
//   2. 파생 계산은 엔진이 준 배열 안에서만 한다(예: +DI 선행 봉 수). 새 지표 계산 금지.
//   3. **반환 필드 안에 한국어가 있다** — pattern.label("헤드앤숄더") · cycle.phaseLabel ·
//      fib.degrees[].name("단기"). 반드시 영어 키(pattern.pattern·cycle.dir)로 조립한다.
//      buildCounted() 가 *Steps() 로 당한 것과 같은 자리인데 필드 안에 숨어 있다.
//   4. **엔진의 폴백은 판독문의 사실이 아니다.** 거래량이 없으면 엔진은 synthVolume(가격에서
//      만들어 낸 가짜 거래량)이나 "모든 봉 1"로 조용히 대체한다. 그 값으로 "1.13배 거래량"
//      같은 문장을 쓰면 앱이 없는 데이터를 본 것처럼 말한다 — 거절문을 쓴다.
//
// 못 읽었을 때는 빈 문장이 아니라 **이유를** 적는다. 이유는 셋이고 서로 다르다(NONE·NO_VOL·
// NO_SWINGS) — 하나로 뭉치면 "봉 300개인데 봉이 모자라다"는 거짓 이유가 나온다.
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
  var T = (Str && Str.t) || {};

  // 판정어(상승/하락) 일관성: rsi·volume 의 divergence.type, stochastic·ichimoku 의 cross/cloud,
  // supertrend 의 flip 은 모두 strings.js 의 cxBullDiv 류·rpUp/rpDown 과 같은 어간
  // "상승"/"하락"을 쓴다(태스크 8 코디네이터 지시) — 여기서 다른 동의어(강세/약세 등)를
  // 쓰면 화면 곳곳의 같은 개념이 다른 말이 된다.
  //
  // 아래 SAY 는 원래 영문 판독문이었다(태스크 8 에서 번역). 구성 로직·조각 경계는 그대로다 —
  // 문구만 옮겼다. 남은 라틴 토큰(+DI/-DI, %K/%D, 지표명 VWAP/ATR 등)은 test/readings.test.mjs
  // 의 ALLOWED_LATIN 에서 허용한다(strings.test.mjs 와 같은 원리 — 국내 차트 앱도 그대로
  // 쓰는 관용 표기·지표명).

  // 거절문 3종. strings.js 단일 출처(index.html 이 strings.js → readings.js 순서를 보장한다).
  var NONE = T.rdNotEnoughBars;        // 봉이 모자라 엔진이 아예 계산을 안 했다
  var NO_VOL = T.rdNoVolume;           // 거래량이 없어 엔진이 합성치로 대체했다 — 그 숫자는 사실이 아니다
  var NO_SWINGS = T.rdNoSwings;        // 봉은 충분한데 파라미터 문턱을 넘는 스윙이 없다
  var REFUSALS = [NONE, NO_VOL, NO_SWINGS];
  // 화면이 "N with a direction" 을 셀 때 거절한 행을 빼려면 판별이 필요하다.
  function isRefusal(t) { return REFUSALS.indexOf(t) >= 0; }
  // 스스로 "아무것도 못 읽었다"고 말한 행을 걷어낸 목록. REASONING 의 "N with a direction" 과
  // AGAINST 의 목록·분모가 **이 술어 하나**를 공유해야 한다 — 두 섹션이 각자 "읽었나"를 판정하면
  // 갈린다(chart-legend.js 와 draw-layers.js 가 같은 어휘를 각자 하드코딩해 갈렸던 자리).
  function voiced(rows) {
    var out = [], i;
    rows = rows || [];
    for (i = 0; i < rows.length; i++) if (!isRefusal(rows[i].text)) out.push(rows[i]);
    return out;
  }

  // cap() 은 영문 시절 첫 글자를 대문자로 올리던 함수다 — 한글은 대소문자가 없어 지금은
  // 항상 항등함수지만, 호출부를 지우지 않고 남겨둔다(구성 로직은 그대로 두라는 태스크 8 지시).
  function cap(s) { return s ? s.charAt(0).toUpperCase() + s.slice(1) : s; }
  function n0(v) { return (v == null || !isFinite(v)) ? "—" : String(Math.round(v)); }
  function n1(v) { return (v == null || !isFinite(v)) ? "—" : String(Math.round(v * 10) / 10); }
  function sgn1(v) { return (v == null || !isFinite(v)) ? "—" : (v >= 0 ? "+" : "") + n1(v); }
  // 가격 표기는 MSUi.fmtPrice·MSLegend 와 같은 규칙 — 1000 미만은 두 자리, 이상은 반올림.
  function px(v) {
    if (v == null || !isFinite(v)) return "—";
    return Math.abs(v) < 1000 ? v.toFixed(2) : Math.round(v).toLocaleString();
  }
  function bars(k) { return k === 0 ? "이번 봉" : k === 1 ? "1봉 전" : k + "봉 전"; }
  function has(a) { return !!(a && a.length); }
  function lastOf(a) { return has(a) ? a[a.length - 1] : null; }
  // 거래량이 실제로 있었는지. 화면(report.js)이 okVol 로 이미 판정해 놓은 것을 ctx 로 받는다 —
  // 여기서 다시 재면 두 곳이 갈린다.
  function hasVol(ctx) { return !!(ctx && ctx.hasVolume); }

  // ADX 강도 어휘. 숫자만으로는 "16 and rising" 이 강한 추세처럼 읽혀 오도한다.
  var ADX_STRENGTH = { very_strong: "추세 매우 강함", strong: "추세 강함",
                       developing: "추세 형성 중", weak: "추세 약함" };

  var STRUCT_EVENT = {
    BOS_up: "상승 구조 돌파", BOS_down: "하락 구조 돌파",
    CHoCH_up: "상승 전환 신호 — 반전 가능성",
    CHoCH_down: "하락 전환 신호 — 반전 가능성",
    none: "아직 구조 돌파 없음"
  };
  // analyzeCCI·analyzeMFI 의 regime 은 1 / 0 / −1 숫자다
  var REGIME = { "1": "상승 국면", "0": "국면 편향 없음", "-1": "하락 국면" };

  // MA(ma())의 sr.ma 는 엔진이 "short"/"mid"/"long" 키 그대로 돌려준다(forge-core.js EMPTY.mas) —
  // 표시용 매핑 없이 그대로 이었으면 그 영어 키가 화면에 샜을 자리다.
  var MA_TERM = { short: "단기", mid: "중기", long: "장기" };
  // ATR(atr())의 regime — forge-core.js analyzeATR 의 "expanding"/"contracting"/"normal" 3값.
  var ATR_REGIME = { expanding: "확대", contracting: "축소", normal: "보통" };

  // analyzeSMC 는 미충족 FVG 를 .slice(-5), 미완화 오더블록을 .slice(-4) 로 **잘라서** 돌려준다.
  // 그 수를 그대로 "5 open gaps" 로 적으면 포화된 값이 실제 개수인 것처럼 읽힌다(220봉 300계열 중
  // 61계열이 상한에 걸린다) — 상한에서는 "5개 이상" 으로 적는다.
  var FVG_CAP = 5, OB_CAP = 4;
  function cnt(n, cap0) { return (n >= cap0 ? n + "개 이상" : n + "개"); }

  var ELLIOTT_STRUCT = { impulse_up: "상승 임펄스 파동", impulse_down: "하락 임펄스 파동",
                         corrective: "조정 파동", uncertain: "파동 불명확" };
  // ⚠ analyzePattern 의 label 은 한국어다 — 영어 키(pattern)로만 매핑한다. 여기 값도 이제
  // 한국어라 우연히 엔진의 label 과 같은 표기가 됐지만, 출처는 여전히 이 맵 하나다
  // (엔진 값을 그대로 쓰면 그 값이 바뀔 때 화면 문구가 조용히 따라 바뀐다).
  var PATTERN_NAME = { headshoulder: "헤드앤숄더", invhead: "역헤드앤숄더",
                       bullflag: "상승 플래그", bearflag: "하락 플래그" };

  var SAY = {
    ma: function (r) {
      if (!r.mas || !r.mas.long) return NONE;
      var s = cap(MA_ALIGN[r.align.order] || "혼조");
      s += r.cross.type
        ? ", " + (r.cross.type === "golden" ? "골든크로스" : "데드크로스") + " " + bars(r.cross.barsAgo)
        : ", 교차 없음";
      if (r.sr.ma) s += ", " + (MA_TERM[r.sr.ma] || r.sr.ma) + "선 부근 " + (SR[r.sr.side] || r.sr.side);
      return s;
    },

    macd: function (r) {
      if (!has(r.hist)) return NONE;
      var s = "히스토그램 " + sgn1(r.last.hist) + ", " + (r.rising ? "확대" : "축소");
      s += r.cross.type
        ? ", " + (r.cross.type === "bull" ? "골든크로스" : "데드크로스") + " " + bars(r.cross.barsAgo)
        : ", 교차 없음";
      return s;
    },

    rsi: function (r) {
      if (!has(r.series)) return NONE;
      var above = (r.cross50 === "above" || r.cross50 === "cross_up");
      var s = n0(r.last) + ", " + (RSI_ZONE[r.zone] || r.zone) + ", 50선 " + (above ? "위" : "아래");
      if (r.divergence && r.divergence.type) s += ", " + (r.divergence.type === "bullish" ? "상승" : "하락") + " 다이버전스";
      return s;
    },

    bollinger: function (r) {
      if (!has(r.pctB)) return NONE;
      var s = cap(BB_STATE[r.state] || "중단") + (r.squeeze ? " · 스퀴즈" : "");
      s += ", %B " + (isFinite(r.last.pctB) ? r.last.pctB.toFixed(2) : "—");
      s += ", 중심선 " + (r.midSlope > 0.02 ? "상승" : r.midSlope < -0.02 ? "하락" : "평평");
      return s;
    },

    // ⚠ 거래량 5종(volume·vwap·volumeprofile·mfi·cmf)은 거래량이 없으면 엔진이 조용히 대체한다
    // (analyzeVolume→synthVolume · VWAP/VolumeProfile→모든 봉 1 · MFI/CMF→synthVolume).
    // 그 값으로 문장을 쓰면 "1.13배 거래량"·"가장 많이 거래된 가격" 같은 **없는 사실**을 말한다.
    volume: function (r, ctx) {
      if (!hasVol(ctx)) return NO_VOL;
      if (!has(r.series)) return NONE;
      var s = cap(VOL_STATE[r.state] || "보통") + " 거래량, 평균 대비 " + (isFinite(r.ratio) ? r.ratio.toFixed(2) : "—")
            + "배, " + (VOL_REL[r.relationship] || "약화");
      if (r.divergence && r.divergence.type) s += ", " + (r.divergence.type === "bullish" ? "상승" : "하락") + " 다이버전스";
      return s;
    },

    adx: function (r, ctx, opts) {
      if (!has(r.adx)) return NONE;
      // 엔진의 rma() 는 앞 period 봉을 **계산하지 않고 0 으로 남긴다**. 0 >= 0 이 참이라
      // 상승 분기의 선행 카운트가 미계산 구간을 그대로 통과해 "+DI 가 219봉째 우위"(실제 계산은
      // 약 206봉)가 나왔다. adx 배열도 마찬가지로 2·period−1 부터가 첫 계산값이다.
      var period = (opts && opts.period) || 14;
      var firstDI = period, firstAdx = period * 2 - 1;
      var li = r.adx.length - 1;
      var up = r.last.plusDI >= r.last.minusDI;
      // 선행 봉 수 — 엔진이 이미 준 배열을 훑는다(새 계산 아님). 미계산 봉에서 멈춘다.
      var lead = 0;
      for (var i = li; i > 0 && i >= firstDI; i--) {
        if ((r.plusDI[i] >= r.minusDI[i]) !== up) break;
        lead++;
      }
      var pi = li - 5;
      var s = n0(r.last.adx);
      // 5봉 전이 미계산 구간이면 방향을 말하지 않는다 — 0 과 비교하면 무조건 "상승 중"이 된다.
      if (pi >= firstAdx) s += ", " + (r.adx[li] >= r.adx[pi] ? "상승 중" : "완화 중");
      return s
           + ", " + (ADX_STRENGTH[r.strength] || "추세 약함")
           // 마이너스는 ASCII 하이픈으로 통일한다 — 기여도 칸이 toFixed() 라 ASCII 다.
           // 판독문만 유니코드 −(U+2212)를 쓰면 한 행 안에서 표기가 갈린다.
           + ", " + (up ? "+DI" : "-DI") + "가 " + lead + "봉째 우위";
    },

    stochastic: function (r) {
      if (!has(r.k)) return NONE;
      var s = "%K " + n0(r.last.k) + " / %D " + n0(r.last.d) + ", " + (RSI_ZONE[r.state] || r.state);
      if (r.cross && r.cross.type)
        s += ", " + (r.cross.type === "bull" ? "상승" : "하락") + " 교차 " + bars(r.cross.barsAgo);
      return s;
    },

    fib: function (r) {
      if (!has(r.levels)) return NONE;
      var z = r.zone || {}, near = z.nearest;
      var s = (r.dir === "up" ? "상승" : r.dir === "down" ? "하락" : "횡보") + " 스윙";
      if (near) {
        // ratio 0 은 되돌림이 아니라 스윙 극점 자체다 — "0 레벨" 로 적으면 뜻이 안 통한다
        var at = (near.ratio === 0)
          ? "스윙 " + (r.dir === "up" ? "고점" : "저점")
          : near.ratio + " 되돌림";
        s += ", " + at + " 부근 " + (SR[near.side] || near.side);
      } else {
        s += ", 구간 중간 지점";
      }
      if (z.inGolden) s += ", 골든포켓 안쪽";
      // degrees 는 "몇 개 척도로 쟀나"이지 "몇 개가 동의하나"가 아니다 — 동의로 적으면 거짓 귀속
      if (r.degrees && r.degrees.length > 1) s += ", 되돌림 척도 " + r.degrees.length + "종 측정";
      return s;
    },

    ichimoku: function (r) {
      if (!has(r.spanA)) return NONE;
      var pos = r.pricePos === "above" ? "구름 위"
              : r.pricePos === "below" ? "구름 아래" : "구름 안";
      var s = pos + ", 구름대 " + (r.cloud === "bull" ? "상승" : r.cloud === "bear" ? "하락" : "횡보");
      s += r.tkCross.type
        ? ", 전환선이 " + (r.tkCross.type === "bull" ? "위로 " : "아래로 ") + "교차 " + bars(r.tkCross.barsAgo)
        : ", 전환선 교차 없음";
      // 짧은 이력에선 엔진이 기간을 압축한다. 안 적으면 같은 문장이 다른 계산을 가리킨다.
      if (r.scaled) s += " (짧은 이력에 맞춰 기간 축소)";
      return s;
    },

    pivot: function (r) {
      if (!r.P || !has(r.R) || !has(r.S)) return NONE;
      var p = r.last, s;
      if (p > r.R[2]) s = "저항3(" + px(r.R[2]) + ") 위";
      else if (p > r.R[1]) s = "저항2(" + px(r.R[1]) + ")와 저항3(" + px(r.R[2]) + ") 사이";
      else if (p > r.R[0]) s = "저항1(" + px(r.R[0]) + ")와 저항2(" + px(r.R[1]) + ") 사이";
      else if (p > r.P) s = "피봇(" + px(r.P) + ")과 저항1(" + px(r.R[0]) + ") 사이";
      else if (p > r.S[0]) s = "지지1(" + px(r.S[0]) + ")과 피봇(" + px(r.P) + ") 사이";
      else if (p > r.S[1]) s = "지지2(" + px(r.S[1]) + ")와 지지1(" + px(r.S[0]) + ") 사이";
      else if (p > r.S[2]) s = "지지3(" + px(r.S[2]) + ")와 지지2(" + px(r.S[1]) + ") 사이";
      else s = "지지3(" + px(r.S[2]) + ") 아래";
      return s + ", 전 봉 기준 레벨";
    },

    psar: function (r) {
      if (!has(r.series)) return NONE;
      var gap = (r.last && isFinite(r.last)) ? Math.abs(r.last - r.sar) / r.last * 100 : 0;
      return (r.dir > 0 ? "점이 가격 아래" : "점이 가격 위") + ", " + px(r.sar)
           + ", " + n1(gap) + "% 이격" + (r.flip ? ", 이번 봉에서 전환" : "");
    },

    gann: function (r) {
      if (!has(r.angles)) return NONE;
      var d = (r.last && isFinite(r.last)) ? Math.abs(r.last - r.oneOne) / r.last * 100 : 0;
      var s = "1×1선(" + px(r.oneOne) + ") " + (r.last >= r.oneOne ? "위" : "아래") + ", " + n1(d) + "% 이격";
      return s + (r.anchor ? ", 기준점 " + px(r.anchor.price) : ", 기준 스윙 없음");
    },

    vwap: function (r, ctx) {
      if (!hasVol(ctx)) return NO_VOL;   // 거래량 없으면 엔진이 모든 봉 가중 1 — 그건 VWAP 이 아니다
      if (!has(r.vwap)) return NONE;
      var side = r.pct >= 0 ? "위" : "아래";
      return "가격이 VWAP(" + px(r.last) + ") " + side + " " + n1(Math.abs(r.pct)) + "%";
    },

    supertrend: function (r, ctx) {
      if (!has(r.line)) return NONE;
      var s = (r.dir > 0 ? "추세선이 가격 아래" : "추세선이 가격 위") + ", " + px(r.last);
      var p = lastOf((ctx && ctx.price) || []);
      // 플립까지의 거리 — 시안 6a 의 "Sitting 0.4% from a bearish flip" 이 이 값이다
      if (p != null && isFinite(p) && p !== 0)
        s += ", 전환까지 " + n1(Math.abs(p - r.last) / p * 100) + "%";
      if (r.flip && r.flip.barsAgo != null)
        s += ", " + (r.flip.dir > 0 ? "상승" : "하락") + " 전환 " + bars(r.flip.barsAgo);
      return s;
    },

    // bias 가 항상 0 인 유일한 지표다. 문장이 그 이유를 말하지 않으면
    // 기여도 0.00 이 "못 읽었다"로 오독된다.
    atr: function (r) {
      if (!has(r.atr)) return NONE;
      return "봉당 가격 대비 " + n1(r.pct) + "%, 변동성 " + (ATR_REGIME[r.regime] || "보통")
           + " — 콘의 폭을 정할 뿐 방향은 아님";
    },

    volumeprofile: function (r, ctx) {
      // 거래량 없으면 모든 봉을 1로 세어 가격-시간 프로파일이 된다. 예전에 SHAPES 오표기로 한 번
      // 나갔던 바로 그 조작값(129.25–144.91 · POC 132.90)이 이 경로로 다시 나왔다.
      if (!hasVol(ctx)) return NO_VOL;
      if (!has(r.bins)) return NONE;
      var rel = r.priceRel === "above" ? "매물대 위"
              : r.priceRel === "below" ? "매물대 아래" : "매물대 안";
      return rel + ", " + px(r.val) + "–" + px(r.vah) + ", 최다 거래가 " + px(r.poc);
    },

    structure: function (r, ctx) {
      if (!has(r.swings)) {
        // 이유가 둘이다. 엔진의 하드 플로어는 P < 12 이고, 그 위에서 비는 것은 **스윙 문턱을
        // 넘는 파동이 없어서**다(그래프의 swing:3 = 300% 문턱이 지금 그 상태다). 둘을 같은
        // 문장으로 말하면 300봉짜리 종목에 "봉이 모자라다"고 하게 된다.
        return ((ctx && ctx.price) || []).length < 12 ? NONE : NO_SWINGS;
      }
      var tr = r.trend === "up" ? "고점·저점 동반 상승"
             : r.trend === "down" ? "고점·저점 동반 하락" : "뚜렷한 스윙 구조 없음";
      var lo = r.swingLow ? r.swingLow.price : null, hi = r.swingHigh ? r.swingHigh.price : null;
      return tr + ", " + (STRUCT_EVENT[r.event] || "아직 구조 돌파 없음")
           + " (스윙 " + px(lo) + "–" + px(hi) + ")";
    },

    keltner: function (r) {
      if (!has(r.midArr)) return NONE;
      var pos = r.pctB >= 1 ? "채널 상단 위"
              : r.pctB <= 0 ? "채널 하단 아래"
              : r.pctB >= 0.5 ? "채널 상단 절반" : "채널 하단 절반";
      return pos + ", " + px(r.lower) + "–" + px(r.upper) + (r.squeeze ? ", 채널 수축" : "");
    },

    donchian: function (r) {
      if (!has(r.midArr)) return NONE;
      return px(r.lower) + "–" + px(r.upper) + " 구간의 " + n0(r.pos * 100) + "% 지점, 중심선 "
           + (r.midSlope > 0 ? "상승" : r.midSlope < 0 ? "하락" : "평평");
    },

    cci: function (r) {
      if (!has(r.series)) return NONE;
      // 마이너스는 ASCII 하이픈 — 기여도 칸(toFixed)과 표기를 맞춘다
      var z = r.last >= 100 ? "+100 위, 과열 상승"
            : r.last <= -100 ? "-100 아래, 과열 하락" : "±100 밴드 안";
      // 모르는 regime 값이면 절(clause) 자체를 뺀다. 폴백을 두면 그 폴백이 **주장**이 된다
      // (예전엔 REGIME[알수없음] 이 문자열 "undefined" 로 화면에 나갔다).
      return n0(r.last) + ", " + z + (REGIME[r.regime] ? ", " + REGIME[r.regime] : "");
    },

    williams: function (r) {
      if (!has(r.series)) return NONE;
      var z = r.last >= -20 ? "과매수" : r.last <= -80 ? "과매도" : "중립";
      return n0(r.last) + ", 조회 구간 내 " + z;
    },

    // 엔진의 빈 반환 조건은 P < 2 뿐이다(forge-core analyzeAroon). up·down 이 둘 다 0 인 것은
    // 정상 데이터에서도 나온다 — 창의 첫 봉이 그 구간의 고점이자 저점일 때다. 값으로 판정하면
    // 멀쩡히 읽은 판독을 "못 읽었다"고 말하게 된다.
    aroon: function (r, ctx) {
      var price = (ctx && ctx.price) || [];
      if (price.length < 2) return NONE;
      return "상승 " + n0(r.up) + " / 하락 " + n0(r.down) + ", 오실레이터 " + sgn1(r.osc)
           + " — 더 최근 극값은 " + (r.osc >= 0 ? "고점" : "저점");
    },

    mfi: function (r, ctx) {
      if (!hasVol(ctx)) return NO_VOL;   // MFI 는 전형가×거래량이다 — 합성 거래량이면 자금흐름이 아니다
      if (!has(r.series)) return NONE;
      var z = r.last >= 80 ? "과매수" : r.last <= 20 ? "과매도" : "중립";
      return n0(r.last) + ", " + z + (REGIME[r.regime] ? ", 자금흐름 " + REGIME[r.regime] : "");
    },

    elliott: function (r) {
      if (!has(r.waves)) return NONE;
      var s = (ELLIOTT_STRUCT[r.structure] || "파동 불명확")
            + ", 현재 파동 " + ((r.current && r.current.label) || "—");
      s += (r.next && r.next.target != null)
        ? ", 다음 목표 " + px(r.next.target)
        : ", 예상 목표 없음";
      // ⚠ rules.score 는 "충족한 규칙 비율"이 아니라 (검사한 규칙 중 통과 비율) × (파동 완성도)다
      // — 엔진이 둘을 곱해 하나로 만든 **유효도**다(엔진 자신도 "규칙 n/3 · 유효 x" 로 따로 적는다).
      // "규칙 N% 충족" 으로 쓰면 카운트가 미완일 때 실제보다 낮게 말한다(규칙 2/2 통과인데 60%).
      return s + " (파동 유효도 " + n0((r.rules && r.rules.score ? r.rules.score : 0) * 100) + "%)";
    },

    smc: function (r) {
      if (!r.ok) return NONE;
      var f = (r.fvgs || []).length, o = (r.obs || []).length;
      if (!f && !o) return "열린 갭·오더블록 없음";
      // 0 인 쪽은 적지 않는다 — "오더블록 0개" 는 말할 값이 없는 것을 말하는 것이다
      var parts = [];
      if (f) parts.push("미충족 갭 " + cnt(f, FVG_CAP));
      if (o) parts.push("미완화 오더블록 " + cnt(o, OB_CAP));
      return parts.join(", ") + " 남음";
    },

    // ⚠ cycle.phaseLabel 은 한국어다("고점 부근(하락 전환 임박)"). dir 로 조립한다.
    cycle: function (r) {
      // ⚠ !r.period 로는 실패를 못 잡는다. scanPeriod 는 자료가 모자라면 method:"insufficient" 와
      // strength:0 을 내면서 **opts.pmin 을 period 로 되돌려 준다**(기본 10). analyzeCycle 은
      // per > 2 만 보고 통과시키므로 그 가짜 주기로 위상·전환시점까지 계산된다.
      // strength 는 그 실패 경로에서만 정확히 0 이다(계산된 주기는 피크/평균 비라 0 보다 크다).
      if (!r.period || !r.strength) return NONE;
      var ph = r.dir === "rising" ? "다음 고점을 향해 상승 중"
             : r.dir === "falling" ? "다음 저점을 향해 하락 중" : "평평";
      var s = n0(r.period) + "봉 주기, " + ph;
      if (r.nextTurn && r.nextTurn.bars != null)
        s += ", 약 " + r.nextTurn.bars + "봉 후 전환";
      return s;
    },

    // ⚠ has(r.series) 는 안 된다 — _rocRaw 는 P ≤ period 구간을 전부 0 으로 채운 배열을 돌려준다
    // (진짜 계산이 아니라 자리채움). 문턱은 **노드가 들고 있는 period** 로 잰다 — 예전 주석은
    // "이 판독은 opts 없이 불린다"고 적혀 있었으나 사실이 아니었다(indicators.js 가 n.params 를
    // 넘긴다). graph.js 가 params:{} 로 밀어 넣고 있어서 우연히 맞았을 뿐이다.
    roc: function (r, ctx, opts) {
      var price = (ctx && ctx.price) || [];
      var period = (opts && opts.period) || 12;
      if (!has(r.series) || price.length <= period) return NONE;
      return "조회 구간 대비 " + sgn1(r.last) + "%, 모멘텀 "
           + (r.last > 0 ? "양(+)" : r.last < 0 ? "음(-)" : "평평");
    },

    // 엔진의 하드 플로어는 fast+2(기본 5+2=7). 그 아래에서만 series 가 0 채움 자리표시자다.
    // conf 로 판정하면 안 된다 — conf 는 P<=24 까지 0 이지만 그 구간의 last 는 실제 계산값이고
    // (P=15 에서 0.455, P=20 에서 -2.196), conf 가 0 으로 만드는 것은 기여도뿐이다.
    // conf 를 가드로 쓰면 멀쩡히 읽은 것을 "못 읽었다"고 말하게 된다.
    // 문턱은 **노드의 fast** 로 잰다(roc 와 같은 이유 — 옛 주석의 "opts 없이 불린다"는 거짓이었다).
    ao: function (r, ctx, opts) {
      var price = (ctx && ctx.price) || [];
      var fast = (opts && opts.fast) || 5;
      if (price.length < fast + 2) return NONE;
      var s = sgn1(r.last) + ", 0선 " + (r.last >= 0 ? "위" : "아래");
      if (r.cross) s += ", 이번 봉에서 " + (r.cross > 0 ? "상향" : "하향") + " 교차";
      return s;
    },

    // ⚠ has(r.series) 로는 실패를 못 잡는다 — _cmfRaw 는 캔들이 없어도 길이 P 짜리 **전부 0** 배열을
    // 돌려준다(고·저가가 없으면 자금흐름량이 0). 거래량은 없으면 synthVolume 으로 대체된다.
    cmf: function (r, ctx) {
      if (!hasVol(ctx)) return NO_VOL;
      if (!has((ctx && ctx.candle))) return NONE;   // 고·저가가 있어야 매집/분산이 정의된다
      if (!has(r.series)) return NONE;
      var d = r.last > 0.05 ? "매집" : r.last < -0.05 ? "분산" : "뚜렷한 매집 없음";
      return (r.last >= 0 ? "+" : "") + (isFinite(r.last) ? r.last.toFixed(2) : "—") + ", " + d;
    },

    // ⚠ pattern.label 은 한국어다("헤드앤숄더"). 영어 키 pattern.pattern 으로 매핑한다.
    // detectPatterns 의 하드 플로어는 P < 30 — 그 아래에서는 엔진이 **탐지를 시작조차 안 한다**.
    // 그 경우까지 "감지된 패턴 없음"으로 적으면 안 본 것을 봤다고 말하는 것이다.
    pattern: function (r, ctx) {
      if (((ctx && ctx.price) || []).length < 30) return NONE;
      if (!r.pattern || r.pattern === "none") return "구간 내 완성된 차트 패턴 없음";
      // 매칭 실패 폴백은 지표명(Str.IND.pattern)과 같은 문구를 쓴다 — 지표명은 언어와 무관하게
      // 영어라는 프로젝트 전역 규칙(strings.test.mjs)이 여기도 적용된다.
      // 폴백 두 겹이 영어인 것은 번역 누락이 아니다 — PATTERN_NAME 에 없는 패턴은 이름을 지어낼
      // 수 없어 **지표명**으로 되돌리는데, 지표명은 인터페이스 언어와 무관하게 영어라는 제품
      // 규칙이 있다(Str.ind 는 IND 맵을 읽고, 그 맵이 로드되기 전이면 같은 값의 리터럴을 쓴다).
      // 여기에 한글을 넣으면 같은 지표가 이 한 줄에서만 다른 이름으로 불린다.
      return (PATTERN_NAME[r.pattern] || (Str && Str.ind ? Str.ind("pattern") : "Chart pattern"))
           + ", 적합도 " + n0((r.confidence || 0) * 100) + "%, "
           + (r.confirmed ? "돌파로 확인됨" : "아직 미확인");
    }
  };

  // 방향을 물을 수 없는 둘 — analyzeTrend 는 bias 를 안 주고, phasefold 는 analyzeX 자체가 없다
  // (엔진이 combine 안에서만 쓴다). 문장은 쓰되 기여도 칸은 비운다.
  var NO_DIR = {
    // ⚠ 방향·봉 수·기준선을 **한 창에서** 읽는다. 예전엔 방향을 r.channel(장기창 전용 적합)에서,
    // 봉 수를 r.windows[r.dominant] 에서 가져왔다. 두 창은 독립적으로 정해지므로(220봉 300계열 중
    // 220계열에서 dominant ≠ long) 기울기 부호가 78계열(26%)에서 서로 어긋났다 —
    // "하락 채널, 40봉 구간" 이 오른 40봉을 가리키고 있었다.
    trend: function (r, ctx) {
      if (!r || !r.windows) return NONE;
      var w = r.windows[r.dominant] || r.windows.long;
      if (!w || !isFinite(w.slopeRaw) || !isFinite(w.bRaw)) return NONE;
      var p = lastOf((ctx && ctx.price) || []);
      if (p == null) return NONE;
      // winFit 의 적합선은 창 내부 인덱스 0..m−1 기준이다 — 마지막 봉은 m−1.
      var line = w.bRaw + w.slopeRaw * (w.m - 1);
      var dir = w.slopeRaw > 0 ? "상승" : w.slopeRaw < 0 ? "하락" : "횡보";
      return dir + " 채널, " + w.m + "봉 구간, 가격은 " + (p >= line ? "상단" : "하단") + " 절반";
    },
    phasefold: function () {
      return "엔진이 노드를 합성할 때만 쓰인다 — 단독 판독 없음";
    }
  };

  // opts = 그 노드가 들고 있는 params. 가드가 엔진 기본값이 아니라 **실제로 쓰인 파라미터**로
  // 문턱을 재야 한다(adx.period · roc.period · ao.fast).
  function say(blockType, result, ctx, opts) {
    var fn = SAY[blockType] || NO_DIR[blockType];
    if (!fn) return "";
    try { return fn(result || {}, ctx || {}, opts || {}) || NONE; }
    catch (e) { return NONE; }   // 판독문 하나가 화면 전체를 죽이지 않는다
  }

  // 화면 순서. 방향 있는 것은 |bias| 내림차순, 방향을 못 묻는 둘은 정렬에서 빠져 항상 맨 아래.
  function reasoningRows(withBias, noDir) {
    var s = (withBias || []).slice().sort(function (a, b) {
      return Math.abs(b.bias) - Math.abs(a.bias);
    });
    return s.concat(noDir || []);
  }

  return { SAY: SAY, NO_DIR: NO_DIR, NONE: NONE, NO_VOL: NO_VOL, NO_SWINGS: NO_SWINGS,
           REFUSALS: REFUSALS, isRefusal: isRefusal, voiced: voiced,
           say: say, reasoningRows: reasoningRows };
});
