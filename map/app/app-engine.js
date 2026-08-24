/* 머니스쿱 앱 — 엔진 브리지. 앱은 이 파일을 통해서만 스쿱 엔진(ForgeCore 원본)과 대화한다.
   호출 레시피는 PC(forge-app _computeTf L1731~)와 동일: data={price,candle,n} ·
   run(graph, data, {futW, timeframe, driftWeights}) · 확률=aggUpProb(캘리브레이션 포함).
   지표별 진행 이벤트(onStep)는 실계산 완료 순간 발행 — 실행 연출이 여기에 박자를 동기화한다.
   지표 세트·개수·이름·그룹의 단일 출처는 core.indicatorRegistry(열린 엔진 원칙) — 엔진에
   지표가 추가되면 모바일도 자동으로 N+1개로 분석된다(별도 구현 없음, 2026-08-24 사용자 확정).
   해설문은 전부 실측값 생성 — 더미 문구 이식 금지. 엔진 로직 수정 없음. */
(function (root, factory) {
  if (typeof module !== "undefined" && module.exports) module.exports = factory(require("../forge-core.js"));
  else { root.MS = root.MS || {}; root.MS.engine = factory(root.ForgeCore); }
})(typeof self !== "undefined" ? self : this, function (core) {
  "use strict";

  // ── 지표 세트 — 단일 출처는 엔진 레지스트리(core.indicatorRegistry, 열린 엔진 원칙) ──
  // 여기서는 아무것도 하드코딩하지 않는다: 엔진에 33번째 지표가 추가되면 세트·개수·이름·그룹이
  // 라이브 파생으로 자동 확장된다(모바일 별도 구현 없음 — 2026-08-24 사용자 확정).
  // 파생은 매 호출 계산(호출부는 분석 시작 시 1회 수준 — 비용 무시 가능).
  const GROUP_ORDER = ["t", "m", "v", "q", "s"];   // 표시·실행 그룹 순서(지침서 §4)
  function registry() { return core.indicatorRegistry || []; }
  function regOf(id) {
    const r = registry();
    for (let i = 0; i < r.length; i++) if (r[i].id === id) return r[i];
    return null;
  }
  function indMeta(id) {
    const e = regOf(id);
    return e ? { name: e.label, group: e.group } : { name: id, group: "m" };
  }
  function basicSet() {
    return registry().filter(function (e) { return e.tier === 1; }).map(function (e) { return e.id; });
  }
  function fullSet() {
    // 그룹 순서로 안정 정렬(그룹 내에서는 레지스트리 순서 유지 — 수동 인덱스 타이브레이크)
    const r = registry().map(function (e, i) { return { e: e, i: i }; });
    r.sort(function (a, b) {
      const ga = GROUP_ORDER.indexOf(a.e.group), gb = GROUP_ORDER.indexOf(b.e.group);
      return ga !== gb ? ga - gb : a.i - b.i;
    });
    return r.map(function (x) { return x.e.id; });
  }
  function indicatorCount() { return registry().length; }

  // ── 프리셋 9종(시안 PROF·P — 축 순서 [추세,모멘텀,거래량,변동성,구조]) ──
  const PRESETS = [
    { name: "전체 종합", desc: "32개를 고르게 봅니다. 치우치지 않는 기본값", prof: [6, 6, 6, 6, 6] },
    { name: "추세 중심", desc: "흐름을 따라갑니다. 이동평균 · 추세선 · 일목", prof: [10, 4, 4, 3, 5] },
    { name: "모멘텀 중심", desc: "힘과 속도를 봅니다. RSI · MACD · 스토캐스틱", prof: [4, 10, 5, 4, 3] },
    { name: "스마트머니", desc: "큰 자금의 흔적. 매물대 · 오더블록 · 거래량", prof: [4, 3, 10, 4, 7] },
    { name: "단타 · 스캘핑", desc: "짧게 봅니다. 기간 짧은 지표에 비중", prof: [3, 9, 6, 8, 3] },
    { name: "스윙", desc: "며칠에서 몇 주. 되돌림과 구조 중심", prof: [7, 6, 4, 5, 8] },
    { name: "장기 투자", desc: "큰 그림. 주 · 월봉 구조와 추세", prof: [10, 3, 4, 3, 7] },
    { name: "돌파 · 변동성", desc: "튀어나갈 자리. 볼린저 · ATR · 돈치안", prof: [5, 4, 5, 10, 6] },
    { name: "역추세 · 반전", desc: "되돌아올 자리. 과열 · 과매도 · 다이버전스", prof: [3, 9, 5, 6, 4] }
  ];
  const AXIS_GROUP = ["t", "m", "q", "v", "s"];   // PROF 축 → 그룹 코드

  function clampW(v) { return Math.max(0, Math.min(3, v)); }

  // 프리셋 → 지표별 드리프트 가중(축값/6, 전체 종합=×1)
  function presetWeights(presetName) {
    const p = PRESETS.filter(function (x) { return x.name === presetName; })[0];
    const out = {};
    if (!p) return out;
    fullSet().forEach(function (id) {
      const gi = AXIS_GROUP.indexOf(indMeta(id).group);
      out[id] = clampW(p.prof[gi] / 6);
    });
    return out;
  }

  // 프리셋 × 사용자 배율(mix 슬라이더 0~3) 합성 — 커스텀
  function composeWeights(presetName, userMult) {
    const base = presetWeights(presetName);
    const out = {};
    fullSet().forEach(function (id) {
      const b = (id in base) ? base[id] : 1;
      const u = (userMult && typeof userMult[id] === "number") ? userMult[id] : 1;
      out[id] = clampW(b * u);
    });
    return out;
  }

  function horizonForTF(tfKo) {
    if (tfKo === "월") return 12;
    if (tfKo === "주") return 52;
    return 60;
  }
  function tfLabel(tfKo) { return tfKo === "월" ? "월봉" : tfKo === "주" ? "주봉" : "일봉"; }

  function fmtPct(v) { return (v >= 0 ? "+" : "") + (Math.round(v * 10) / 10) + "%"; }
  function r1(v) { return Math.round(v * 10) / 10; }

  // ── 지표 1종 실계산 + 실측값 해설문(+작도 원자료 raw) ──
  // 파라미터 기본값은 run() 내부 기본값과 동일(배지·드리프트 정합 — forge-core L2062~2163)
  function computeInd(id, price, data, volumes) {
    const last = price[price.length - 1];
    if (id === "ma") {
      const r = core.analyzeMA(price, { len: 20 });
      const short = r.mas && r.mas.short && r.mas.short.series;
      const gap = (short && short.length) ? (last / short[short.length - 1] - 1) * 100 : 0;
      const order = r.align && r.align.order;
      const ordTxt = order === "bull" ? "20·60·120선 정배열" : order === "bear" ? "20·60·120선 역배열" : "이동평균 혼조";
      const crossTxt = (r.cross && r.cross.type) ?
        " · " + (r.cross.type === "golden" ? "골든" : "데드") + " 크로스 " + r.cross.barsAgo + "봉 전" : "";
      return { bias: r.bias, text: ordTxt + ", 이격 " + fmtPct(gap) + crossTxt };
    }
    if (id === "trend") {
      const r = core.analyzeTrend(price, {});
      const sl = (Math.exp(r.blend.slopeLog) - 1) * 100;
      return { bias: Math.max(-1, Math.min(1, r.blend.slopeLog / 0.008)),
        text: "회귀 기울기 " + fmtPct(sl) + "/봉 · " + (r.dominant === "long" ? "장기" : r.dominant === "mid" ? "중기" : "단기") + " 창 우세" };
    }
    if (id === "adx") {
      const r = core.analyzeADX(data, { period: 14 });
      const st = r.strength === "very_strong" ? "추세 매우 강함" : r.strength === "strong" ? "추세 강화" : r.strength === "weak" ? "추세 약함" : "추세 보통";
      return { bias: r.bias, text: "ADX " + Math.round(r.last.adx) + " · " + st + " · " + (r.dir > 0 ? "+DI 우위" : r.dir < 0 ? "−DI 우위" : "DI 균형") };
    }
    if (id === "ichimoku") {
      const r = core.analyzeIchimoku(price, {});
      const pos = r.pricePos === "above" ? "구름 위" : r.pricePos === "below" ? "구름 아래" : "구름 안";
      return { bias: r.bias, text: pos + " · 구름 " + (r.cloud === "bull" ? "양운" : "음운") +
        ((r.tkCross && r.tkCross.type) ? " · 전환선 " + (r.tkCross.type === "bull" ? "상향" : "하향") + " 교차" : "") };
    }
    if (id === "supertrend") {
      const r = core.analyzeSupertrend(data, { period: 10, mult: 3 });
      return { bias: r.bias, text: (r.dir > 0 ? "상승" : "하락") + " 전환 유지" + (r.flip ? " · 최근 전환" : "") + " · 기준선 " + r1(r.last) };
    }
    if (id === "psar") {
      const r = core.analyzePSAR(data, { step: 0.02, max: 0.2 });
      return { bias: r.bias, text: "SAR " + (r.dir > 0 ? "상승" : "하락") + " 유지" + (r.flip ? " · 방금 전환" : "") };
    }
    if (id === "aroon") {
      const r = core.analyzeAroon(data, { period: 25 });
      return { bias: r.bias, text: "상승 " + Math.round(r.up) + " / 하락 " + Math.round(r.down) };
    }
    if (id === "gann") {
      const r = core.analyzeGann(data, { lookback: 120, atrPeriod: 14 });
      const rel = last >= r.oneOne ? "1×1 각도 위" : "1×1 각도 아래";
      return { bias: r.bias, text: rel + " · 기준 " + (r.dir === "up" ? "저점" : "고점") + " 부채꼴" };
    }
    if (id === "macd") {
      const r = core.analyzeMACD(price, {});
      const st = r.state === "bull" ? "시그널 상향 교차" : r.state === "bear" ? "시그널 하향 교차" : "0선 부근";
      return { bias: r.bias, text: st + (r.rising ? " · 히스토그램 상승" : " · 히스토그램 둔화") };
    }
    if (id === "rsi") {
      const r = core.analyzeRSI(price, { period: 14 });
      const zone = r.zone === "overbought" ? "과열권" : r.zone === "oversold" ? "침체권" : "중립대";
      const divTxt = (r.divergence && r.divergence.type) ?
        " · " + (r.divergence.type === "bearish" ? "약세" : "강세") + " 다이버전스" : "";
      return { bias: r.bias, text: "RSI " + Math.round(r.last) + " · " + zone +
        (r.cross50 === "above" ? " (50선 위)" : r.cross50 === "below" ? " (50선 아래)" : "") + divTxt };
    }
    if (id === "stochastic") {
      const r = core.analyzeStochastic(data, { kLen: 14, kSmooth: 3, dLen: 3 });
      const st = r.state === "overbought" ? "과열권" : r.state === "oversold" ? "침체권" : "중립권";
      return { bias: r.bias, text: "%K " + Math.round(r.last.k) + " · " + st +
        (r.cross === "bull" ? " · 상향 교차" : r.cross === "bear" ? " · 하향 교차" : "") };
    }
    if (id === "cci") {
      const r = core.analyzeCCI(data, { period: 20 });
      return { bias: r.bias, text: "CCI " + Math.round(r.last) + " · " + (r.last > 100 ? "과열권" : r.last < -100 ? "침체권" : "중립") };
    }
    if (id === "williams") {
      const r = core.analyzeWilliams(data, { period: 14 });
      return { bias: r.bias, text: "%R " + Math.round(r.last) + " · " + (r.last > -20 ? "과매수 구간" : r.last < -80 ? "과매도 구간" : "중립") };
    }
    if (id === "roc") {
      const r = core.analyzeROC(price, { period: 12 });
      return { bias: r.bias, text: "변화율 " + fmtPct(r.last) + (r.bias > 0 ? " · 상승 탄력" : r.bias < 0 ? " · 하락 탄력" : "") };
    }
    if (id === "ao") {
      const r = core.analyzeAO(data, { fast: 5, slow: 34 });
      return { bias: r.bias, text: "AO " + r1(r.last) + (r.last >= 0 ? " · 0선 위" : " · 0선 아래") +
        (r.cross > 0 ? " · 상향 교차" : r.cross < 0 ? " · 하향 교차" : "") };
    }
    if (id === "bollinger") {
      const r = core.analyzeBollinger(price, {});
      const bw = r.last ? Math.round(r.last.bandwidth * 1000) / 10 : null;
      const pos = r.state === "upper" ? "상단 밴드권" : r.state === "lower" ? "하단 밴드권" : "중심선 부근";
      return { bias: r.bias, text: pos + (bw != null ? " · 밴드폭 " + bw + "%" : "") + (r.squeeze ? " · 수축(스퀴즈)" : "") };
    }
    if (id === "atr") {
      const r = core.analyzeATR(data, { period: 14, mult: 2 });
      const reg = r.regime === "high" ? "평시 대비 확대" : r.regime === "low" ? "평시 대비 축소" : "평시 수준";
      return { bias: r.bias, text: "변동성 " + r1(r.pct) + "% · " + reg };
    }
    if (id === "keltner") {
      const r = core.analyzeKeltner(data, { len: 20, atrLen: 10, mult: 2 });
      const pos = r.pctB >= 0.8 ? "상단 밴드 접근" : r.pctB <= 0.2 ? "하단 밴드 접근" : "채널 중단";
      return { bias: r.bias, text: pos + " · %B " + r1(r.pctB * 100) / 100 + (r.squeeze ? " · 수축" : "") };
    }
    if (id === "donchian") {
      const r = core.analyzeDonchian(data, { len: 20 });
      const pos = r.pos >= 0.95 ? "20봉 신고가권" : r.pos <= 0.05 ? "20봉 신저가권" : "채널 " + Math.round(r.pos * 100) + "% 위치";
      return { bias: r.bias, text: pos + " · 중심선 " + (r.midSlope >= 0 ? "상승" : "하락") };
    }
    if (id === "cycle") {
      const r = core.analyzeCycle(price, { pmin: 10, pmax: 0 });
      return { bias: r.bias, text: "주기 " + r1(r.period) + "봉 · " + r.phaseLabel };
    }
    if (id === "phasefold") {
      let r = null;
      try { r = core.scanPeriod(price); } catch (e) { r = null; }
      if (!r || !(r.best > 2)) return { bias: 0, text: "지배 주기 불명확" };
      return { bias: 0, text: "지배 주기 " + r1(r.best) + "봉 · 정합 θ " + (Math.round(r.theta * 100) / 100) };
    }
    if (id === "volume") {
      const r = core.analyzeVolume(price, volumes);
      const ratio = isFinite(r.ratio) ? Math.round((r.ratio - 1) * 100) : 0;
      const obv = r.obvTrend > 0 ? "OBV 상승" : r.obvTrend < 0 ? "OBV 하락" : "OBV 보합";
      const rel = r.relationship === "confirming" ? " · 추세 확인" : r.relationship === "weakening" ? " · 동력 약화" : "";
      const divTxt = (r.divergence && r.divergence.type) ? " · 거래량 다이버전스" : "";
      return { bias: r.bias, text: "평균 대비 " + (ratio >= 0 ? "+" : "") + ratio + "%, " + obv + rel + divTxt };
    }
    if (id === "vwap") {
      const r = core.analyzeVWAP(price, volumes, { len: 20 });
      return { bias: r.bias, text: "VWAP " + (last >= r.last ? "위" : "아래") + " · 이격 " + fmtPct(r.pct) };
    }
    if (id === "volumeprofile") {
      const r = core.analyzeVolumeProfile(price, volumes, { len: 120, bins: 24 });
      const rel = r.priceRel === "above" ? "밸류에어리어 상단" : r.priceRel === "below" ? "밸류에어리어 하단" : "밸류에어리어 안";
      return { bias: r.bias, text: rel + " · POC " + r1(r.poc) };
    }
    if (id === "mfi") {
      const r = core.analyzeMFI({ candle: data.candle, price: price, volume: volumes }, { period: 14 });
      return { bias: r.bias, text: "MFI " + Math.round(r.last) + " · 자금 " + (r.bias > 0 ? "유입" : r.bias < 0 ? "유출" : "중립") };
    }
    if (id === "cmf") {
      const r = core.analyzeCMF({ candle: data.candle, price: price, volume: volumes }, { period: 20 });
      return { bias: r.bias, text: "CMF " + (Math.round(r.last * 100) / 100) + (r.last >= 0 ? " · 매수 우위" : " · 매도 우위") };
    }
    if (id === "fib") {
      const r = core.analyzeFib(price, { len: 120, swing: 0.05 });
      const z = r.zone || {};
      const near = z.nearest ? ("근접 레벨 " + z.nearest.ratio) : null;
      return { bias: r.bias, text: (r.dir === "up" ? "상승 스윙" : "하락 스윙") + " 되돌림" +
        (z.inGolden ? " · 골든 존(0.5~0.618) 안" : near ? " · " + near : "") };
    }
    if (id === "pivot") {
      const r = core.analyzePivot(data, {});
      const rel = last >= r.P ? "피벗 P 위" : "피벗 P 아래";
      let nearTxt = "";
      const cands = [];
      (r.R || []).forEach(function (v, i2) { cands.push(["R" + (i2 + 1), v]); });
      (r.S || []).forEach(function (v, i2) { cands.push(["S" + (i2 + 1), v]); });
      let best = null;
      cands.forEach(function (c) { const d = Math.abs(c[1] - last) / last; if (!best || d < best.d) best = { n: c[0], d: d }; });
      if (best && best.d < 0.02) nearTxt = " · " + best.n + " 근접";
      return { bias: r.bias, text: rel + nearTxt };
    }
    if (id === "structure") {
      const r = core.analyzeStructure(price, { swing: 0.03 });
      const ev = r.event === "BOS_up" ? " · 상방 BOS" : r.event === "BOS_down" ? " · 하방 BOS" :
        r.event === "CHoCH_up" ? " · 상방 CHoCH" : r.event === "CHoCH_down" ? " · 하방 CHoCH" : "";
      return { bias: r.bias, text: (r.trend === "up" ? "상승" : r.trend === "down" ? "하락" : "중립") + " 구조 유지" + ev };
    }
    if (id === "smc") {
      const r = core.analyzeSMC(data.candle);
      const f = (r.fvgs || []).length, o = (r.obs || []).length;
      if (!f && !o) return { bias: r.bias, text: "미충족 FVG · 오더블록 없음" };
      return { bias: r.bias, text: (f ? "FVG " + f + "개" : "") + (f && o ? " · " : "") + (o ? "오더블록 " + o + "개" : "") };
    }
    if (id === "elliott") {
      const r = core.analyzeElliott(price, { swing: 0.03 });
      const st = r.structure === "impulse_up" ? "상승 임펄스" : r.structure === "impulse_down" ? "하락 임펄스" :
        r.structure === "corrective" ? "조정 파동" : "파동 불확실";
      return { bias: r.bias, text: st + (r.current && r.current.label ? " · " + r.current.label + "파 추정" : "") };
    }
    if (id === "pattern") {
      const r = core.analyzePattern(data, { swing: 0.03 });
      if (!r.detected || r.pattern === "none") return { bias: 0, text: "완성 패턴 없음" };
      return { bias: r.bias, text: (r.label || r.pattern) + (r.confirmed ? " · 확정" : " 형성 중") + " · 신뢰 " + Math.round((r.confidence || 0) * 100) + "%" };
    }
    // 범용 폴백 — 레지스트리에 새 지표가 추가되면 전용 해설문 없이도 즉시 분석·표시된다
    // (열린 엔진 원칙). 전용 포맷터는 품질 개선으로 추후 얹는다.
    const reg = regOf(id);
    if (reg && reg.analyze) {
      let r = null;
      try {
        if (reg.input === "price") r = reg.analyze(price, {});
        else if (reg.input === "data") r = reg.analyze(data, {});
        else if (reg.input === "pv") r = reg.analyze(price, volumes, {});
        else if (reg.input === "cv") r = reg.analyze({ candle: data.candle, price: price, volume: volumes }, {});
        else if (reg.input === "candle") r = reg.analyze(data.candle);
      } catch (e) { r = null; }
      const bias = (r && typeof r.bias === "number" && isFinite(r.bias)) ? r.bias : 0;
      return { bias: bias, text: (bias > 0.05 ? "상승 신호" : bias < -0.05 ? "하락 신호" : "중립") +
        " · 기여 " + (bias >= 0 ? "+" : "") + (Math.round(bias * 100) / 100) };
    }
    if (reg && reg.input === "scan") {
      let sr = null;
      try { sr = core.scanPeriod(price); } catch (e) { sr = null; }
      return { bias: 0, text: (sr && sr.best > 2) ? "지배 주기 " + r1(sr.best) + "봉" : "지배 주기 불명확" };
    }
    return { bias: 0, text: "중립" };
  }

  // ── 작도 원자료(지표별 기하 — 차트가 소비, 전역 인덱스 공간) ──
  // PC forge-draw 와 같은 원천(analyze* 실계산). 오버레이형=가격 위 작도, 오실레이터형=서브패널
  // 실시리즈(kind:'osc' — 실행 연출·결과에서 각 지표의 실제 분석 곡선을 그대로 보여준다).
  function buildDrawings(price, data, volumes, tier) {
    const D = {};
    const safe = function (id, fn) { try { D[id] = fn(); } catch (e) { /* 개별 실패 무시 */ } };
    safe("ma", function () {
      const r = core.analyzeMA(price, { len: 20 });
      return { series: r.mas.short.series, mid: r.mas.mid.series, long: r.mas.long.series };
    });
    D.bollinger = { computed: true };   // 차트가 종가로 직접(20, ±2σ — 엔진 기본값 동일)
    // 오실레이터 실시리즈(기본 5에 포함되는 rsi·macd·volume 은 티어 무관)
    safe("rsi", function () { return { kind: "osc", series: core.analyzeRSI(price, { period: 14 }).series, mid: 50, lo: 30, hi: 70 }; });
    safe("macd", function () {
      const ev = core.evalBlocks({ nodes: [{ id: "m", kind: "block", blockType: "macd", params: {} }], edges: [] }, data);
      return { kind: "osc", series: ev.values["m"], mid: 0, bars: true };
    });
    safe("volume", function () { return { kind: "osc", series: volumes, bars: true, vol: true }; });
    if (tier === "basic") return D;      // 기본 티어 작도 범위(시안 DRW 'all' + 기본 5 실작도)
    safe("stochastic", function () {
      const r = core.analyzeStochastic(data, { kLen: 14, kSmooth: 3, dLen: 3 });
      return { kind: "osc", series: r.k, series2: r.d, mid: 50, lo: 20, hi: 80 };
    });
    safe("adx", function () {
      const r = core.analyzeADX(data, { period: 14 });
      return { kind: "osc", series: r.adx, series2: r.plusDI, series3: r.minusDI, mid: 25 };
    });
    safe("cci", function () { return { kind: "osc", series: core.analyzeCCI(data, { period: 20 }).series, mid: 0, lo: -100, hi: 100 }; });
    safe("williams", function () { return { kind: "osc", series: core.analyzeWilliams(data, { period: 14 }).series, mid: -50, lo: -80, hi: -20 }; });
    safe("roc", function () { return { kind: "osc", series: core.analyzeROC(price, { period: 12 }).series, mid: 0 }; });
    safe("ao", function () { return { kind: "osc", series: core.analyzeAO(data, { fast: 5, slow: 34 }).series, mid: 0, bars: true }; });
    safe("mfi", function () { return { kind: "osc", series: core.analyzeMFI({ candle: data.candle, price: price, volume: volumes }, { period: 14 }).series, mid: 50, lo: 20, hi: 80 }; });
    safe("cmf", function () { return { kind: "osc", series: core.analyzeCMF({ candle: data.candle, price: price, volume: volumes }, { period: 20 }).series, mid: 0 }; });
    safe("atr", function () { return { kind: "osc", series: core.analyzeATR(data, { period: 14, mult: 2 }).atr }; });
    safe("cycle", function () {
      const r = core.analyzeCycle(price, { pmin: 10, pmax: 0 });
      return { fit: r.fit };   // 사이클 적합 곡선은 가격 공간 → 오버레이
    });
    safe("ichimoku", function () {
      const r = core.analyzeIchimoku(price, {});
      return { tenkan: r.tenkan, kijun: r.kijun, spanA: r.spanA, spanB: r.spanB, shift: r.shift || 26 };
    });
    safe("trend", function () {
      const r = core.analyzeTrend(price, {});
      return { channel: r.channel, support: r.pivots.support, resistance: r.pivots.resistance };
    });
    safe("supertrend", function () {
      const r = core.analyzeSupertrend(data, { period: 10, mult: 3 });
      return { line: r.line, trend: r.trend };
    });
    safe("psar", function () { return { series: core.analyzePSAR(data, { step: 0.02, max: 0.2 }).series }; });
    safe("keltner", function () {
      const r = core.analyzeKeltner(data, { len: 20, atrLen: 10, mult: 2 });
      return { upper: r.upperArr, lower: r.lowerArr, mid: r.midArr };
    });
    safe("donchian", function () {
      const r = core.analyzeDonchian(data, { len: 20 });
      return { upper: r.upperArr, lower: r.lowerArr, mid: r.midArr };
    });
    safe("vwap", function () {
      const r = core.analyzeVWAP(price, volumes, { len: 20 });
      return { vwap: r.vwap, upper: r.upper, lower: r.lower };
    });
    safe("fib", function () { return { levels: core.analyzeFib(price, { len: 120, swing: 0.05 }).levels }; });
    safe("pivot", function () {
      const r = core.analyzePivot(data, {});
      return { P: r.P, R: r.R, S: r.S };
    });
    safe("gann", function () {
      const r = core.analyzeGann(data, { lookback: 120, atrPeriod: 14 });
      return { anchor: r.anchor, angles: r.angles, dir: r.dir };
    });
    safe("structure", function () {
      const r = core.analyzeStructure(price, { swing: 0.03 });
      return { swings: r.swings };
    });
    safe("smc", function () {
      const r = core.analyzeSMC(data.candle);
      return { fvgs: r.fvgs || [], obs: r.obs || [] };
    });
    safe("volumeprofile", function () {
      const r = core.analyzeVolumeProfile(price, volumes, { len: 120, bins: 24 });
      return { bins: r.bins, lo: r.lo, hi: r.hi, maxVol: r.maxVol };
    });
    safe("elliott", function () {
      const r = core.analyzeElliott(price, { swing: 0.03 });
      return { waves: r.waves };
    });
    return D;
  }

  // 티어별 그래프 — 노드 존재로 run() 드리프트·컨플루언스·계절성이 결정된다
  function buildGraph(tier, volumes) {
    const set = tier === "basic" ? basicSet() : fullSet();
    const nodes = set.map(function (id) {
      const n = { id: "n_" + id, kind: "block", blockType: id, params: {} };
      if (id === "volume") n.series = (volumes || []).map(function (x) { return isFinite(x) ? x : 0; });
      return n;
    });
    return { nodes: nodes, edges: [] };
  }

  function tick() { return new Promise(function (res) { setTimeout(res, 0); }); }

  function normalizeVerdict(res, pr) {
    const v = res.verdict || {};
    const prob = core.aggUpProb(pr);
    const conf = v.confluence || { agree: 0, total: 0 };
    return {
      dir: v.regime === "bull" ? "up" : v.regime === "bear" ? "down" : "neutral",
      regime: v.regime || "neutral",
      prob: prob == null ? 50 : prob,
      target: v.target,
      rangeLo: pr.lo.length ? pr.lo[pr.lo.length - 1] : null,
      rangeHi: pr.hi.length ? pr.hi[pr.hi.length - 1] : null,
      invalid: v.invalidation,
      score: isFinite(v.score) ? v.score : 0,
      agree: conf.agree, totalInd: conf.total,
      context: v.context || null
    };
  }

  // 시점별(hz) 4행 — 일봉 60 지평이면 +10/+20/+40/+60(시안과 동일 분할: futW/6·/3·×2/3·전량)
  function horizons(pr, tfKo) {
    if (!pr.path || !pr.path.length) return [];
    const futW = pr.futW || pr.path.length;
    const anchor = pr.anchor;
    const unit = tfKo === "월" ? "개월" : tfKo === "주" ? "주" : "일";
    const ks = [Math.max(1, Math.round(futW / 6)), Math.max(2, Math.round(futW / 3)),
      Math.max(3, Math.round(futW * 2 / 3)), futW];
    const seen = {};
    return ks.filter(function (k) { if (seen[k]) return false; seen[k] = 1; return true; })
      .map(function (k) {
        const p = pr.path[k - 1];
        const rawUp = core.upProb(p, pr.hi[k - 1], anchor);
        return { label: "+" + k + unit, k: k, price: p,
          chg: anchor ? (p - anchor) / anchor * 100 : null,
          lo: pr.lo[k - 1], hi: pr.hi[k - 1],
          prob: core.calibrateUpProb(rawUp) };
      });
  }

  async function analyze(req, onStep) {
    const candles = req.candles;
    if (!Array.isArray(candles) || candles.length < 24) throw new Error("not-enough-candles");
    const price = candles.map(function (c) { return +c.c; }).filter(isFinite);
    if (price.length < 24) throw new Error("not-enough-candles");
    const data = { price: price, candle: candles.map(function (c) { return { o: +c.o, h: +c.h, l: +c.l, c: +c.c }; }), n: price.length };
    const vser = candles.map(function (c) { return +c.v; });
    const volumes = (vser.length === price.length && vser.some(function (x) { return isFinite(x) && x > 0; }))
      ? vser.map(function (x) { return isFinite(x) ? x : 0; })
      : core.synthVolume(price);

    const tier = req.tier || "basic";
    const set = tier === "basic" ? basicSet() : fullSet();
    const indicators = [];
    for (let i = 0; i < set.length; i++) {
      const id = set[i];
      const meta = indMeta(id);
      let c;
      try { c = computeInd(id, price, data, volumes); }
      catch (e) { c = { bias: 0, text: "계산 불가" }; }   // 개별 지표 실패가 분석 전체를 죽이지 않게
      const ind = { id: id, name: meta.name, group: meta.group, bias: c.bias || 0,
        strength: Math.max(0, Math.min(100, Math.round(Math.abs(c.bias || 0) * 100))), text: c.text };
      indicators.push(ind);
      if (onStep) onStep({ i: i, total: set.length, id: id, name: meta.name, group: meta.group,
        bias: ind.bias, strength: ind.strength, text: ind.text });
      await tick();
    }

    const futW = horizonForTF(req.tfKo);
    const opts = { futW: futW, timeframe: tfLabel(req.tfKo) };
    const graph = buildGraph(tier, volumes);

    // 가중치: basic 없음 / deep 프리셋 / custom 프리셋×사용자(0~3)
    let W = {};
    if (tier === "deep") W = presetWeights(req.preset || "전체 종합");
    else if (tier === "custom") {
      W = composeWeights(req.preset || "전체 종합", req.weights || {});
      // 페르소나 보정(Q14 기준선) — 그룹 배율(±15% 캡)을 지표 가중에 곱한다. pfit 이 내역을 표기.
      if (req.personaApply && req.personaGW) {
        fullSet().forEach(function (id) {
          const g = indMeta(id).group;
          const f = req.personaGW[g];
          if (typeof f === "number" && isFinite(f)) W[id] = clampW(W[id] * f);
        });
      }
    }

    let mainRes, stdRes = null;
    if (tier === "custom") {
      // 커스텀: 기준(종합) 실행 → 1·2차, 가중 실행 → 판정·콘·3차(R-B06 실좌표)
      stdRes = core.run(graph, data, { futW: futW, timeframe: opts.timeframe, driftWeights: {} });
      mainRes = core.run(graph, data, { futW: futW, timeframe: opts.timeframe, driftWeights: W });
    } else {
      mainRes = core.run(graph, data, { futW: futW, timeframe: opts.timeframe, driftWeights: W });
    }

    const mp = mainRes.prediction || { path: [], lo: [], hi: [], counter: [] };
    const sp = stdRes ? (stdRes.prediction || mp) : mp;

    return {
      tier: tier, symbol: req.symbol, tfKo: req.tfKo, at: null,
      preset: tier === "basic" ? null : (req.preset || "전체 종합"),
      weights: tier === "custom" ? (req.weights || {}) : null,
      personaApply: tier === "custom" ? !!req.personaApply : false,
      verdict: normalizeVerdict(mainRes, mp),
      indicators: indicators,
      prediction: {
        // 1차 종합·2차 반대 = 기준 실행 / 3차 = 가중 실행(커스텀만) — 시안 범례 규약
        path: sp.path, lo: mp.lo, hi: mp.hi,
        counter: sp.counter || [],
        custom: (tier === "custom" && mp !== sp) ? mp.path : null,
        anchor: mp.anchor, futW: mp.futW || futW, levels: mp.levels || []
      },
      horizons: horizons(mp, req.tfKo),
      drawings: buildDrawings(price, data, volumes, tier),
      engineVersion: core.version
    };
  }

  return { analyze: analyze, buildGraph: buildGraph, buildDrawings: buildDrawings,
    core: function () { return core; },   // 읽기 접근(version·validatedAxes 라이브 파생 — P7 통계)
    indMeta: indMeta, basicSet: basicSet, fullSet: fullSet, indicatorCount: indicatorCount,
    registry: registry, PRESETS: PRESETS,
    presetWeights: presetWeights, composeWeights: composeWeights,
    horizonForTF: horizonForTF, tfLabel: tfLabel };
});
