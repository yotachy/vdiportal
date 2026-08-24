/* 머니스쿱 앱 — 시그널 감지(관심 종목 이상징후 — 지침서 §7 · 치환표 R-D01~03).
   원칙: 감지도 엔진 실계산(analyze*·실봉)에서 나온다 — 더미 문구 생성 금지. 근거(why)는
   실측 수치, 해석(mean)은 룰별 고정 해설. '과거 통계(표본 N건)'는 실측 축적 전이라 표시하지
   않는다(지어내지 않는다 — 정직 표기). 감지 단위는 봉(현재 일봉) — 최근 3봉(보관 3일)을 본다.
   키 = sym|rule|barT (결정적 — 같은 봉·같은 룰이면 같은 시그널, 읽음 상태와 짝).
   임계값은 POLICY.signal(리모트 컨피그 대상 — §15 협의 고정점). UMD — node 테스트 가능.
   서버 스캔·푸시 승격은 P5+ (BUILD-PLAN §6-3). */
(function (root, factory) {
  if (typeof module !== "undefined" && module.exports) module.exports = factory(require("../forge-core.js"));
  else { root.MS = root.MS || {}; root.MS.signals = factory(root.ForgeCore); }
})(typeof self !== "undefined" ? self : this, function (core) {
  "use strict";

  // 임계 기준선(§15 시그널 감지 규칙 — 협의 대상, 리모트 컨피그로 조정)
  const TH = {
    volMult: 2.0,        // 거래량 급증 배수(20봉 평균 대비)
    gapPct: 2.0,         // 갭 %(전봉 종가 대비 시가)
    atrExpand: 1.6,      // 변동성 확대(ATR20 평균 대비 당일 실변동)
    rsiHot: 70, rsiCold: 30,
    lookback: 3          // 최근 N봉 감지(보관 3일)
  };

  function r1(v) { return Math.round(v * 10) / 10; }
  function r2(v) { return Math.round(v * 100) / 100; }

  // 한 종목의 최근 봉들에서 시그널을 뽑는다. candles 오름차순 [{t,o,h,l,c,v}].
  // group: 페르소나 연동용 분류(q 거래량·v 변동성·m 모멘텀·t 추세·s 구조)
  function detect(sym, candles) {
    const n = candles ? candles.length : 0;
    if (n < 30) return [];
    const out = [];
    const closes = candles.map(function (c) { return +c.c; });
    const vols = candles.map(function (c) { return +c.v; });
    const push = function (i, rule, group, dir, title, d, why, mean) {
      out.push({ sym: sym, rule: rule, group: group, dir: dir,
        barT: String(candles[i].t || "").slice(0, 10),
        key: sym + "|" + rule + "|" + String(candles[i].t || "").slice(0, 10),
        title: title, d: d, why: why, mean: mean });
    };

    for (let i = Math.max(1, n - TH.lookback); i < n; i++) {
      const c = candles[i], p = candles[i - 1];
      const close = +c.c, open = +c.o, prevC = +p.c;

      // 거래량 급증(20봉 평균 대비)
      if (i >= 21 && isFinite(vols[i]) && vols[i] > 0) {
        let s = 0, k = 0;
        for (let j = i - 20; j < i; j++) { if (isFinite(vols[j]) && vols[j] > 0) { s += vols[j]; k++; } }
        const avg = k ? s / k : 0;
        if (avg > 0 && vols[i] / avg >= TH.volMult) {
          const m = r1(vols[i] / avg);
          push(i, "vol_surge", "q", 0,
            "거래량 평균의 " + m + "배",
            "20일 평균 대비 거래가 크게 붙었어요",
            "이날 거래량 " + Math.round(vols[i]).toLocaleString("en-US") + " · 20일 평균 " + Math.round(avg).toLocaleString("en-US") + " (" + m + "배)",
            "거래가 실리면 그날 방향의 신뢰가 올라가요. 세력 이동이나 뉴스 반응일 수 있어요.");
        }
      }
      // 갭(전봉 종가 대비 시가)
      if (prevC > 0) {
        const gap = (open / prevC - 1) * 100;
        if (Math.abs(gap) >= TH.gapPct) {
          push(i, "gap", "v", gap > 0 ? 1 : -1,
            "갭 " + (gap > 0 ? "상승" : "하락") + " " + r1(Math.abs(gap)) + "%",
            "장이 열리며 " + (gap > 0 ? "위로" : "아래로") + " 점프했어요",
            "시가 " + r2(open) + " vs 전일 종가 " + r2(prevC) + " (" + (gap > 0 ? "+" : "") + r1(gap) + "%)",
            "갭은 밤사이 재료를 반영해요. 갭 방향 유지 여부가 당일 관전 포인트예요.");
        }
      }
    }

    // 아래 룰들은 '마지막 봉' 상태 기반(중복 억제 — 봉마다 다시 뜨지 않게 상태 진입 시점만)
    const i = n - 1;
    const data = { price: closes, candle: candles.map(function (c) { return { o: +c.o, h: +c.h, l: +c.l, c: +c.c }; }), n: n };
    const last = closes[n - 1];
    try {
      // 볼린저 이탈(엔진 분석)
      const bb = core.analyzeBollinger(closes, {});
      if (bb.last) {
        if (last > bb.last.upper) push(i, "bb_break_up", "v", 1, "볼린저 상단 돌파",
          "밴드 위로 밀어 올렸어요",
          "종가 " + r2(last) + " > 상단 밴드 " + r2(bb.last.upper) + " (%B " + r2(bb.last.pctB) + ")",
          "상단 이탈은 강한 추세 또는 과열 — 되돌림과 추세 지속이 갈리는 자리예요.");
        else if (last < bb.last.lower) push(i, "bb_break_dn", "v", -1, "볼린저 하단 이탈",
          "밴드 아래로 밀렸어요",
          "종가 " + r2(last) + " < 하단 밴드 " + r2(bb.last.lower) + " (%B " + r2(bb.last.pctB) + ")",
          "하단 이탈은 급락 또는 과매도 — 반등 후보 구간이지만 확인이 필요해요.");
      }
      // 20봉 신고가/신저가 — 직전 20봉 고가/저가 돌파(당일 봉 제외 기준)
      if (n >= 22) {
        let hh = -Infinity, ll = Infinity;
        for (let j = n - 21; j < n - 1; j++) {
          if (+candles[j].h > hh) hh = +candles[j].h;
          if (+candles[j].l < ll) ll = +candles[j].l;
        }
        if (last > hh) push(i, "hh20", "t", 1, "20일 신고가 돌파",
          "최근 20일 고점을 넘었어요",
          "종가 " + r2(last) + " > 직전 20일 고가 " + r2(hh),
          "신고가 돌파는 추세 추종 신호 — 거래량 동반 여부를 함께 보세요.");
        else if (last < ll) push(i, "ll20", "t", -1, "20일 신저가",
          "최근 20일 저점을 깼어요",
          "종가 " + r2(last) + " < 직전 20일 저가 " + r2(ll),
          "신저가는 하락 추세 신호 — 지지 이탈 여부가 관건이에요.");
      }
      // RSI 과열/침체 진입(전봉과 상태가 달라졌을 때만)
      const rs = core.analyzeRSI(closes, { period: 14 });
      if (rs.series && rs.series.length >= 2) {
        const rNow = rs.series[rs.series.length - 1], rPrev = rs.series[rs.series.length - 2];
        if (rNow >= TH.rsiHot && rPrev < TH.rsiHot) push(i, "rsi_hot", "m", 1, "RSI " + TH.rsiHot + " 진입",
          "모멘텀 과열권에 들어왔어요",
          "RSI " + Math.round(rNow) + " (전일 " + Math.round(rPrev) + ")",
          "과열은 강세의 증거이자 조정의 씨앗 — 다이버전스가 나오는지 지켜보세요.");
        else if (rNow <= TH.rsiCold && rPrev > TH.rsiCold) push(i, "rsi_cold", "m", -1, "RSI " + TH.rsiCold + " 이탈",
          "모멘텀 침체권에 들어왔어요",
          "RSI " + Math.round(rNow) + " (전일 " + Math.round(rPrev) + ")",
          "침체권은 반등 후보 — 하락 추세 중이면 성급한 진입은 위험해요.");
      }
      // MACD 교차(방금)
      const mc = core.analyzeMACD(closes, {});
      if (mc.state === "bull" || mc.state === "bear") {
        const ev = core.evalBlocks({ nodes: [{ id: "m", kind: "block", blockType: "macd", params: {} }], edges: [] }, data);
        const hs = ev.values["m"];
        if (hs && hs.length >= 2) {
          const now2 = hs[hs.length - 1], prev2 = hs[hs.length - 2];
          if (now2 > 0 && prev2 <= 0) push(i, "macd_x_up", "m", 1, "MACD 상향 교차",
            "모멘텀이 위로 돌아섰어요",
            "히스토그램 " + r2(prev2) + " → " + r2(now2) + " (0선 상향)",
            "교차 직후는 방향 전환 후보 — 추세 지표와 합의되는지 보세요.");
          else if (now2 < 0 && prev2 >= 0) push(i, "macd_x_dn", "m", -1, "MACD 하향 교차",
            "모멘텀이 아래로 꺾였어요",
            "히스토그램 " + r2(prev2) + " → " + r2(now2) + " (0선 하향)",
            "하향 교차는 조정 신호 — 지지선까지의 거리를 확인하세요.");
        }
      }
      // 20일선 돌파(방금)
      const ma = core.analyzeMA(closes, { len: 20 });
      const s20 = ma.mas && ma.mas.short && ma.mas.short.series;
      if (s20 && s20.length >= 2 && n >= 2) {
        const above = last > s20[s20.length - 1], wasAbove = closes[n - 2] > s20[s20.length - 2];
        if (above && !wasAbove) push(i, "ma20_up", "t", 1, "20일선 상향 돌파",
          "평균선 위로 올라섰어요",
          "종가 " + r2(last) + " > 20일선 " + r2(s20[s20.length - 1]),
          "평균선 회복은 단기 추세 개선 — 안착 여부(2~3일)를 보세요.");
        else if (!above && wasAbove) push(i, "ma20_dn", "t", -1, "20일선 하향 이탈",
          "평균선 아래로 내려왔어요",
          "종가 " + r2(last) + " < 20일선 " + r2(s20[s20.length - 1]),
          "평균선 이탈은 단기 약세 — 다음 지지(60일선·전저점)를 확인하세요.");
      }
      // 변동성 급확대(당일 고저폭 vs ATR 평균)
      const at = core.analyzeATR(data, { period: 14, mult: 2 });
      const hl = (+candles[i].h - +candles[i].l);
      if (at.avg > 0 && hl / at.avg >= TH.atrExpand) {
        push(i, "atr_expand", "v", 0, "변동성 급확대",
          "평소보다 훨씬 크게 움직였어요",
          "당일 변동폭 " + r2(hl) + " · 평균 ATR " + r2(at.avg) + " (" + r1(hl / at.avg) + "배)",
          "변동성 확대는 방향 결정 국면 — 어느 쪽으로 터졌는지가 핵심이에요.");
      }
    } catch (e) { /* 개별 룰 실패 무시 */ }

    return out;
  }

  // 워치리스트 전체 스캔 → 시그널 목록(봉 날짜 내림차순)
  function scan(watch, candlesBySym) {
    let all = [];
    (watch || []).forEach(function (sym) {
      const cds = candlesBySym[sym];
      if (cds) all = all.concat(detect(sym, cds));
    });
    all.sort(function (a, b) { return a.barT < b.barT ? 1 : a.barT > b.barT ? -1 : 0; });
    return all;
  }

  return { detect: detect, scan: scan, TH: TH };
});
