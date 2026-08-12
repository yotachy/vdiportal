// 지표 32종의 방향(bias)을 한자리에서 뽑는다. 웹(forge-app.js)이 지표마다 ForgeCore.analyzeX 를
// 직접 부르는 것과 같은 방식이고, 다른 점은 그 호출 형태를 표 하나에 모았다는 것뿐이다.
//
// 왜 표가 필요한가: analyzeX 의 인자 모양이 지표마다 다르다. 대부분 (price, opts) 지만
// 캔들 고저가 필요한 것은 (data, opts), 거래량이 필요한 것은 (price, volume, opts) 다.
// 형태를 틀리면 예외가 아니라 **bias 0** 이 조용히 나온다 — 방향이 없는 게 아니라 못 읽은 것인데
// 화면에는 "중립"으로 보인다. 그래서 아래 표는 추측이 아니라 31종 전수 실측으로 확정했다.
//
// run() 이 내부에서 계산하는 노드별 드리프트는 밖으로 나오지 않는다(evalBlocks 는 시계열만 준다).
// 그래서 판정과 반대인 지표를 알려면 이 경로가 필요하다.
(function (root, factory) {
  if (typeof module !== "undefined" && module.exports) module.exports = factory();
  else root.MSIndicators = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  // blockType → [analyzeX 이름, 인자 형태]
  //   "price"    : fn(price, opts)
  //   "priceVol" : fn(price, volume, opts)
  //   "data"     : fn({price, candle, volume}, opts)   — 캔들 고저를 읽는 것들
  //   "candle"   : fn(candle, opts)
  var SHAPES = {
    ma: ["analyzeMA", "price"], macd: ["analyzeMACD", "price"], rsi: ["analyzeRSI", "price"],
    bollinger: ["analyzeBollinger", "price"], adx: ["analyzeADX", "price"],
    stochastic: ["analyzeStochastic", "price"], fib: ["analyzeFib", "price"],
    ichimoku: ["analyzeIchimoku", "price"], supertrend: ["analyzeSupertrend", "price"],
    atr: ["analyzeATR", "price"],
    structure: ["analyzeStructure", "price"], cci: ["analyzeCCI", "price"],
    elliott: ["analyzeElliott", "price"], cycle: ["analyzeCycle", "price"],
    roc: ["analyzeROC", "price"],

    // analyzeVolumeProfile 은 (price, volume, opts) 3인자다 — 예전에 "price" 로 잘못 표기되어
    // opts 가 volume 자리에 들어갔고, Array.isArray(volume) 가 거짓이라 엔진이 모든 봉을
    // 거래량 1로 취급했다(가격-시간 프로파일이지 거래량 프로파일이 아니었다). 여기 위치가 맞다.
    volume: ["analyzeVolume", "priceVol"], vwap: ["analyzeVWAP", "priceVol"],
    volumeprofile: ["analyzeVolumeProfile", "priceVol"],

    pivot: ["analyzePivot", "data"], psar: ["analyzePSAR", "data"], gann: ["analyzeGann", "data"],
    keltner: ["analyzeKeltner", "data"], donchian: ["analyzeDonchian", "data"],
    williams: ["analyzeWilliams", "data"], aroon: ["analyzeAroon", "data"],
    mfi: ["analyzeMFI", "data"], cmf: ["analyzeCMF", "data"],
    pattern: ["analyzePattern", "data"], ao: ["analyzeAO", "data"],

    smc: ["analyzeSMC", "candle"]
  };

  // 방향을 물을 수 없는 둘.
  //   trend     — analyzeTrend 는 bias 를 안 돌려준다(windows/pivots/channel/blend/dominant).
  //   phasefold — 대응하는 analyzeX 자체가 없다(엔진이 combine 안에서만 쓴다).
  // 목록에서 빼는 대신 여기 이름을 남긴다 — 나중에 "왜 30개뿐이냐"를 다시 조사하지 않도록.
  var NO_BIAS = ["trend", "phasefold"];

  function callOne(FC, blockType, data, opts) {
    var spec = SHAPES[blockType];
    if (!spec) return null;
    var fn = FC && FC[spec[0]];
    if (typeof fn !== "function") return null;
    var o = opts || {};
    try {
      if (spec[1] === "price") return fn(data.price, o);
      if (spec[1] === "priceVol") return fn(data.price, data.volume || null, o);
      if (spec[1] === "candle") return fn(data.candle, o);
      return fn(data, o);
    } catch (e) { return null; }
  }

  // blockType → bias(−1..1). 못 읽으면 null 이다 — 0(중립)과 구분한다.
  function biasOf(FC, blockType, data, opts) {
    var r = callOne(FC, blockType, data, opts);
    if (!r || typeof r.bias !== "number" || !isFinite(r.bias)) return null;
    return r.bias;
  }

  // 그래프에 실제로 올라간 지표들의 방향. params 는 노드가 들고 있는 것을 그대로 넘긴다.
  function biases(FC, graph, data) {
    var out = [];
    var nodes = (graph && graph.nodes) || [];
    for (var i = 0; i < nodes.length; i++) {
      var n = nodes[i];
      if (!n.blockType || !SHAPES[n.blockType]) continue;
      var b = biasOf(FC, n.blockType, data, n.params);
      if (b == null) continue;
      out.push({ type: n.blockType, bias: b });
    }
    return out;
  }

  // 판정과 **반대** 방향인 지표들. 시안 6a 의 AGAINST THIS CALL.
  // 중립 판정에는 반대가 없다 — 부른 방향이 없으면 무엇이 반대인지도 정의되지 않는다.
  // EPS 는 report-model 의 데드존과 같은 취지지만 대상이 다르다(여기는 지표 bias, 저기는 예측 변화율).
  var EPS = 0.02;
  function opposing(FC, graph, data, regime) {
    if (regime !== "bull" && regime !== "bear") return [];
    var want = regime === "bull" ? 1 : -1;
    return biases(FC, graph, data)
      .filter(function (r) { return Math.abs(r.bias) > EPS && (r.bias > 0 ? 1 : -1) !== want; })
      .sort(function (a, b) { return Math.abs(b.bias) - Math.abs(a.bias); });
  }

  return { SHAPES: SHAPES, NO_BIAS: NO_BIAS, biasOf: biasOf, biases: biases, opposing: opposing, EPS: EPS };
});
