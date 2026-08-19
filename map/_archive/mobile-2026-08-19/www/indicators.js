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
  if (typeof module !== "undefined" && module.exports) module.exports = factory(require("./readings.js"));
  else MSGlobals.define("MSIndicators", factory(root.MSReadings));
})(typeof self !== "undefined" ? self : this, function (Readings) {
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

  // EPS 는 report-model 의 데드존과 같은 취지지만 대상이 다르다(여기는 지표 bias, 저기는 예측 변화율).
  var EPS = 0.02;

  // 판독문에 넘길 ctx. hasVolume 은 **거래량이 실제로 있었는지**다 — 없으면 엔진이 synthVolume 이나
  // "모든 봉 1"로 조용히 대체하므로 거래량 5종이 없는 사실을 말하게 된다. 화면(report.js)이 okVol 로
  // 이미 판정해 data.volume 에 null 을 넣어 두므로 여기서는 그것을 읽기만 한다(두 번 재지 않는다).
  function ctxFrom(data) {
    return { price: data && data.price, candle: data && data.candle,
             hasVolume: !!(data && data.volume && data.volume.length) };
  }

  // 지표마다 analyzeX 를 **한 번** 부르고 방향과 문장을 함께 뽑는다.
  // biases() 를 부른 뒤 say() 를 위해 또 부르면 Full 에서 analyzeX 가 60회가 된다.
  // 지표를 **한 번에 하나씩** 읽는 반복자. 19a(분석 진행 중계)가 이것을 프레임 사이에 돌려
  // 진행을 그린다 — 화면이 타이머를 세는 게 아니라 실제 analyzeX 호출에 묶이는 이유가 이것이다.
  // readings() 는 이 반복자를 끝까지 돌리는 얇은 껍데기다: 경로가 둘이면 화면이 보여준 것과
  // 리포트가 쓰는 것이 갈라질 수 있고, 그 어긋남은 아무 예외도 내지 않는다.
  //
  // step() 은 지표 하나를 읽고 { type, bias, text } 또는 skipped:true 를 돌려준다(블록이 아니거나
  // 못 읽은 것). 끝나면 null. done 으로도 물을 수 있다.
  function readingStepper(FC, graph, data, ctx) {
    var nodes = ((graph && graph.nodes) || []).filter(function (n) {
      return n && n.blockType && SHAPES[n.blockType];
    });
    var i = 0, rows = [];
    return {
      total: nodes.length,
      get done() { return i >= nodes.length; },
      get index() { return i; },
      rows: rows,
      step: function () {
        if (i >= nodes.length) return null;
        var n = nodes[i++];
        var r = callOne(FC, n.blockType, data, n.params);
        if (!r || typeof r.bias !== "number" || !isFinite(r.bias)) return { type: n.blockType, skipped: true };
        var row = { type: n.blockType, bias: r.bias,
                    text: Readings ? Readings.say(n.blockType, r, ctx, n.params) : "" };
        rows.push(row);
        return row;
      },
      drain: function () { while (i < nodes.length) this.step(); return rows; }
    };
  }

  function readings(FC, graph, data, ctx) {
    return readingStepper(FC, graph, data, ctx).drain();
  }

  // 방향을 물을 수 없는 둘. bias 는 null 이다 — 0(중립)과 구분해야 화면이
  // "중립"과 "못 읽음"을 다르게 그린다.
  function noDirRows(FC, data, ctx) {
    var trend = null;
    try { trend = FC && FC.analyzeTrend ? FC.analyzeTrend(data.price, {}) : null; } catch (e) { trend = null; }
    return [
      { type: "trend", bias: null, text: Readings ? Readings.say("trend", trend, ctx) : "" },
      { type: "phasefold", bias: null, text: Readings ? Readings.say("phasefold", null, ctx) : "" }
    ];
  }

  // 판정과 **반대** 방향인 지표들. 시안 6a 의 AGAINST THIS CALL.
  // 중립 판정에는 반대가 없다 — 부른 방향이 없으면 무엇이 반대인지도 정의되지 않는다.
  // rows 를 받으면 그것을 쓴다(호출자가 이미 계산한 경우 재계산하지 않는다).
  function opposing(FC, graph, data, regime, rows) {
    if (regime !== "bull" && regime !== "bear") return [];
    var want = regime === "bull" ? 1 : -1;
    // rows 를 안 받으면 스스로 계산한다. 이때 ctx 는 ctxFrom(data) 로 만든다 — data 를 그대로
    // 넘기면 hasVolume 이 빠져 거래량 5종이 이 경로에서만 다른 문장을 낸다. null 을 넘기던 시절엔
    // ctx 를 쓰는 판독(aroon·ao·roc·supertrend)이 여기서만 "읽지 못했다"고 말했다.
    var src = rows || readings(FC, graph, data, ctxFrom(data));
    return src
      .filter(function (r) { return Math.abs(r.bias) > EPS && (r.bias > 0 ? 1 : -1) !== want; })
      .sort(function (a, b) { return Math.abs(b.bias) - Math.abs(a.bias); });
  }

  return { SHAPES: SHAPES, NO_BIAS: NO_BIAS, biasOf: biasOf, biases: biases, ctxFrom: ctxFrom,
           readings: readings, readingStepper: readingStepper,
           noDirRows: noDirRows, opposing: opposing, EPS: EPS };
});
