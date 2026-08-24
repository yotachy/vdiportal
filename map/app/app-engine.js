/* 머니스쿱 앱 — 엔진 브리지. 앱은 이 파일을 통해서만 스쿱 엔진(ForgeCore 원본)과 대화한다.
   호출 레시피는 PC(forge-app _computeTf L1731~)와 동일: data={price,candle,n} ·
   run(graph, data, {futW, timeframe, driftWeights}) · 확률=aggUpProb(캘리브레이션 포함).
   지표별 진행 이벤트(onStep)는 실계산 완료 순간 발행 — 실행 연출이 여기에 박자를 동기화한다
   (지침서 §4: 프로토 420ms 데모 박자 대체). 엔진 로직 수정 없음 — 출력 정규화만. */
(function (root, factory) {
  if (typeof module !== "undefined" && module.exports) module.exports = factory(require("../forge-core.js"));
  else { root.MS = root.MS || {}; root.MS.engine = factory(root.ForgeCore); }
})(typeof self !== "undefined" ? self : this, function (core) {
  "use strict";

  // 지표 메타 — id=엔진 blockType(정본), 그룹 t추세·m모멘텀·v변동성·q거래량·s구조(틱바 색과 짝).
  // basic 5 = 엔진 IND_TIERS Lv1 = 시안 IND 앞 5(표기 순서는 시안 순).
  const IND_META = {
    ma: { name: "이동평균", group: "t" },
    rsi: { name: "RSI", group: "m" },
    macd: { name: "MACD", group: "m" },
    bollinger: { name: "볼린저밴드", group: "v" },
    volume: { name: "거래량", group: "q" }
    // P2: 32종 전체 등재(IND_TIERS Lv2~4)
  };
  const BASIC_SET = ["ma", "rsi", "macd", "bollinger", "volume"];

  function horizonForTF(tfKo) {
    if (tfKo === "월") return 12;
    if (tfKo === "주") return 52;
    return 60;
  }
  function tfLabel(tfKo) { return tfKo === "월" ? "월봉" : tfKo === "주" ? "주봉" : "일봉"; }

  function fmtPct(v) { return (v >= 0 ? "+" : "") + (Math.round(v * 10) / 10) + "%"; }

  // 지표 1종 실계산 + 실측값 해설문(더미 문구 이식 금지 — 전부 분석 결과 필드에서 생성)
  function computeInd(id, price, data, volumes) {
    if (id === "ma") {
      const r = core.analyzeMA(price, { len: 20 });
      const short = r.mas && r.mas.short && r.mas.short.series;
      const gap = (short && short.length) ? (price[price.length - 1] / short[short.length - 1] - 1) * 100 : 0;
      const order = r.align && r.align.order;
      const ordTxt = order === "bull" ? "20·60·120선 정배열" : order === "bear" ? "20·60·120선 역배열" : "이동평균 혼조";
      const crossTxt = (r.cross && r.cross.type) ?
        " · " + (r.cross.type === "golden" ? "골든" : "데드") + " 크로스 " + r.cross.barsAgo + "봉 전" : "";
      return { bias: r.bias, text: ordTxt + ", 이격 " + fmtPct(gap) + crossTxt };
    }
    if (id === "rsi") {
      const r = core.analyzeRSI(price, { period: 14 });
      const zone = r.zone === "overbought" ? "과열권" : r.zone === "oversold" ? "침체권" : "중립대";
      const divTxt = (r.divergence && r.divergence.type) ?
        " · " + (r.divergence.type === "bearish" ? "약세" : "강세") + " 다이버전스" : "";
      return { bias: r.bias, text: "RSI " + Math.round(r.last) + " · " + zone +
        (r.cross50 === "above" ? " (50선 위)" : r.cross50 === "below" ? " (50선 아래)" : "") + divTxt };
    }
    if (id === "macd") {
      const r = core.analyzeMACD(price, {});
      const st = r.state === "bull" ? "시그널 상향 교차" : r.state === "bear" ? "시그널 하향 교차" : "0선 부근";
      return { bias: r.bias, text: st + (r.rising ? " · 히스토그램 상승" : " · 히스토그램 둔화") };
    }
    if (id === "bollinger") {
      const r = core.analyzeBollinger(price, {});
      const bw = r.last ? Math.round(r.last.bandwidth * 1000) / 10 : null;
      const pos = r.state === "upper" ? "상단 밴드권" : r.state === "lower" ? "하단 밴드권" : "중심선 부근";
      return { bias: r.bias, text: pos + (bw != null ? " · 밴드폭 " + bw + "%" : "") + (r.squeeze ? " · 수축(스퀴즈)" : "") };
    }
    if (id === "volume") {
      const r = core.analyzeVolume(price, volumes);
      const ratio = isFinite(r.ratio) ? Math.round((r.ratio - 1) * 100) : 0;
      const obv = r.obvTrend > 0 ? "OBV 상승" : r.obvTrend < 0 ? "OBV 하락" : "OBV 보합";
      const rel = r.relationship === "confirming" ? " · 추세 확인" : r.relationship === "weakening" ? " · 동력 약화" : "";
      return { bias: r.bias, text: "평균 대비 " + (ratio >= 0 ? "+" : "") + ratio + "%, " + obv + rel };
    }
    return { bias: 0, text: "" };
  }

  // 티어별 그래프 — 노드 존재로 run() 드리프트·컨플루언스가 결정된다(엣지 불필요·sigSrc=price 폴백)
  function buildGraph(tier, volumes) {
    const set = BASIC_SET;   // P2: deep/custom = 32종
    const nodes = set.map(function (id) {
      const n = { id: "n_" + id, kind: "block", blockType: id, params: {} };
      if (id === "volume") n.series = (volumes || []).map(function (x) { return isFinite(x) ? x : 0; });
      return n;
    });
    return { nodes: nodes, edges: [] };
  }

  function tick() { return new Promise(function (res) { setTimeout(res, 0); }); }

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

    const set = BASIC_SET;   // P2: tier 분기
    const indicators = [];
    for (let i = 0; i < set.length; i++) {
      const id = set[i];
      const meta = IND_META[id];
      const c = computeInd(id, price, data, volumes);
      const ind = { id: id, name: meta.name, group: meta.group, bias: c.bias,
        strength: Math.max(0, Math.min(100, Math.round(Math.abs(c.bias) * 100))), text: c.text };
      indicators.push(ind);
      if (onStep) onStep({ i: i, total: set.length, id: id, name: meta.name, group: meta.group,
        bias: ind.bias, strength: ind.strength, text: ind.text });
      await tick();   // UI 양보 — 연출이 스텝을 소화할 틈
    }

    const futW = horizonForTF(req.tfKo);
    const res = core.run(buildGraph(req.tier, volumes), data,
      { futW: futW, timeframe: tfLabel(req.tfKo), driftWeights: req.weights || {} });
    const v = res.verdict || {};
    const pr = res.prediction || { path: [], lo: [], hi: [] };
    const prob = core.aggUpProb(pr);
    const conf = v.confluence || { agree: 0, total: 0 };

    return {
      tier: req.tier, symbol: req.symbol, tfKo: req.tfKo, at: null,   // at 은 호출자가 스탬프(state 몫)
      verdict: {
        dir: v.regime === "bull" ? "up" : v.regime === "bear" ? "down" : "neutral",
        regime: v.regime || "neutral",
        prob: prob == null ? 50 : prob,
        target: v.target,
        rangeLo: pr.lo.length ? pr.lo[pr.lo.length - 1] : null,
        rangeHi: pr.hi.length ? pr.hi[pr.hi.length - 1] : null,
        invalid: v.invalidation,
        score: isFinite(v.score) ? v.score : 0,
        agree: conf.agree, totalInd: conf.total
      },
      indicators: indicators,
      prediction: { path: pr.path, lo: pr.lo, hi: pr.hi, counter: pr.counter || [],
        anchor: pr.anchor, futW: pr.futW || futW, levels: pr.levels || [] },
      engineVersion: core.version
    };
  }

  return { analyze: analyze, buildGraph: buildGraph, IND_META: IND_META,
    BASIC_SET: BASIC_SET, horizonForTF: horizonForTF, tfLabel: tfLabel };
});
