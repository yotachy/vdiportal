/* 머니스쿱 앱 — 엔진 브리지. 앱은 이 파일을 통해서만 스쿱 엔진(ForgeCore 원본)과 대화한다.
   호출 레시피는 PC(forge-app _computeTf L1731~)와 동일: data={price,candle,n} ·
   run(graph, data, {futW, timeframe, driftWeights}) · 확률=aggUpProb(캘리브레이션 포함).
   지표별 진행 이벤트(onStep)는 실계산 완료 순간 발행 — 실행 연출이 여기에 박자를 동기화한다.
   지표 32종 = 엔진 IND_TIERS 가 정본(Q5 확정 — 시안의 'RSI/거래량 다이버전스' 2종은 rsi·volume
   분석의 다이버전스 필드로 흡수). 그룹 배분은 시안 GRP 총량(추세8·모멘텀7·변동성6·거래량5·구조6)과 동수.
   해설문은 전부 실측값 생성 — 더미 문구 이식 금지. 엔진 로직 수정 없음. */
(function (root, factory) {
  if (typeof module !== "undefined" && module.exports) module.exports = factory(require("../forge-core.js"));
  else { root.MS = root.MS || {}; root.MS.engine = factory(root.ForgeCore); }
})(typeof self !== "undefined" ? self : this, function (core) {
  "use strict";

  // ── 지표 메타(32종) — id=엔진 blockType, 그룹 t8·m7·v6·q5·s6(시안 GRP 동수), 표시는 그룹 순서 ──
  const IND_META = {
    // t 추세(8)
    ma: { name: "이동평균", group: "t" },
    trend: { name: "추세 회귀채널", group: "t" },
    adx: { name: "ADX / DMI", group: "t" },
    ichimoku: { name: "일목균형표", group: "t" },
    supertrend: { name: "슈퍼트렌드", group: "t" },
    psar: { name: "PSAR", group: "t" },
    aroon: { name: "Aroon", group: "t" },
    gann: { name: "Gann 부채꼴", group: "t" },
    // m 모멘텀(7)
    macd: { name: "MACD", group: "m" },
    rsi: { name: "RSI", group: "m" },
    stochastic: { name: "스토캐스틱", group: "m" },
    cci: { name: "CCI", group: "m" },
    williams: { name: "Williams %R", group: "m" },
    roc: { name: "ROC", group: "m" },
    ao: { name: "AO", group: "m" },
    // v 변동성(6)
    bollinger: { name: "볼린저밴드", group: "v" },
    atr: { name: "ATR", group: "v" },
    keltner: { name: "켈트너 채널", group: "v" },
    donchian: { name: "돈치안 채널", group: "v" },
    cycle: { name: "사이클 위상", group: "v" },
    phasefold: { name: "파동 스캔", group: "v" },
    // q 거래량(5)
    volume: { name: "거래량", group: "q" },
    vwap: { name: "VWAP", group: "q" },
    volumeprofile: { name: "볼륨 프로파일", group: "q" },
    mfi: { name: "MFI", group: "q" },
    cmf: { name: "CMF", group: "q" },
    // s 구조(6)
    fib: { name: "피보나치", group: "s" },
    pivot: { name: "피벗 S/R", group: "s" },
    structure: { name: "시장구조 BOS", group: "s" },
    smc: { name: "스마트머니 존", group: "s" },
    elliott: { name: "엘리어트 파동", group: "s" },
    pattern: { name: "차트 패턴", group: "s" }
  };
  // 표시·실행 순서: 기본 5(시안 표기 순) / 전체 32(그룹 순서 추세→모멘텀→변동성→거래량→구조 — 지침서 §4)
  const BASIC_SET = ["ma", "rsi", "macd", "bollinger", "volume"];
  const FULL_SET = [
    "ma", "trend", "adx", "ichimoku", "supertrend", "psar", "aroon", "gann",
    "macd", "rsi", "stochastic", "cci", "williams", "roc", "ao",
    "bollinger", "atr", "keltner", "donchian", "cycle", "phasefold",
    "volume", "vwap", "volumeprofile", "mfi", "cmf",
    "fib", "pivot", "structure", "smc", "elliott", "pattern"
  ];

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
    FULL_SET.forEach(function (id) {
      const gi = AXIS_GROUP.indexOf(IND_META[id].group);
      out[id] = clampW(p.prof[gi] / 6);
    });
    return out;
  }

  // 프리셋 × 사용자 배율(mix 슬라이더 0~3) 합성 — 커스텀
  function composeWeights(presetName, userMult) {
    const base = presetWeights(presetName);
    const out = {};
    FULL_SET.forEach(function (id) {
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

  // ── 지표 1종 실계산 + 실측값 해설문 ──
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
    return { bias: 0, text: "" };
  }

  // 티어별 그래프 — 노드 존재로 run() 드리프트·컨플루언스·계절성이 결정된다
  function buildGraph(tier, volumes) {
    const set = tier === "basic" ? BASIC_SET : FULL_SET;
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
    const set = tier === "basic" ? BASIC_SET : FULL_SET;
    const indicators = [];
    for (let i = 0; i < set.length; i++) {
      const id = set[i];
      const meta = IND_META[id];
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
    else if (tier === "custom") W = composeWeights(req.preset || "전체 종합", req.weights || {});

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
      engineVersion: core.version
    };
  }

  return { analyze: analyze, buildGraph: buildGraph, IND_META: IND_META,
    BASIC_SET: BASIC_SET, FULL_SET: FULL_SET, PRESETS: PRESETS,
    presetWeights: presetWeights, composeWeights: composeWeights,
    horizonForTF: horizonForTF, tfLabel: tfLabel };
});
