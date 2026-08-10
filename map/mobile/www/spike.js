// 스파이크 배선 — 순수 로직은 api/graph/chart/bench 에 있고 여기엔 없다(그래서 테스트도 없다).
(function () {
  "use strict";

  var TFS = ["1day", "1week", "1month"];
  var COL = { bull: "#4fb98a", bear: "#d96a6a", gold: "#e8b463", cone: "rgba(232,180,99,.09)" };
  var FUTW = 60;

  var $ = function (id) { return document.getElementById(id); };
  function say(msg) { $("status").textContent = msg; }
  function ms(v) { return v.toFixed(1) + "ms"; }

  function fitCanvas(cv) {
    var dpr = window.devicePixelRatio || 1;
    var cssW = cv.clientWidth || 372, cssH = 240;
    cv.width = Math.round(cssW * dpr);
    cv.height = Math.round(cssH * dpr);
    cv.style.height = cssH + "px";
    var ctx = cv.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { ctx: ctx, w: cssW, h: cssH };
  }

  function showEnv() {
    $("env").innerHTML =
      "<b>환경</b>\n" +
      "엔진 " + ForgeCore.version + " · 지표 " + ForgeCore.indicatorCount + "종\n" +
      "화면 " + window.innerWidth + "×" + window.innerHeight + " · DPR " + (window.devicePixelRatio || 1) + "\n" +
      "UA " + navigator.userAgent;
  }

  async function runSpike() {
    var sym = $("sym").value.trim().toUpperCase();
    if (!sym) { say("종목을 입력하세요"); return; }
    $("go").disabled = true;
    $("verdict").textContent = ""; $("timing").textContent = "";

    var graph = MSGraph.full32Graph(ForgeCore);
    var indN = MSGraph.indicatorTypes(graph).length;
    var data = {}, netMs = {}, runStat = {}, total = 0;

    try {
      for (var i = 0; i < TFS.length; i++) {
        var tf = TFS[i];
        say(sym + " " + tf + " 불러오는 중… (" + (i + 1) + "/3)");
        var t0 = performance.now();
        var res = await fetch(MSApi.ohlcUrl(sym, tf));
        var json = await res.json();
        netMs[tf] = performance.now() - t0;
        data[tf] = MSApi.normalizeCandles(json);
      }
    } catch (e) {
      say("실패: " + e.message);
      $("go").disabled = false;
      return;
    }

    say("분석 중… (" + indN + "지표 × " + TFS.length + "주기)");
    await new Promise(function (r) { requestAnimationFrame(function () { setTimeout(r, 16); }); });

    var last = null;
    TFS.forEach(function (tf) {
      var d = { price: data[tf].price, candle: data[tf].candle };
      var out = null;
      var stat = MSBench.measure(function () {
        out = ForgeCore.run(graph, d, { futW: FUTW, timeframe: tf });
      }, 5);
      runStat[tf] = stat;
      total += stat.median;
      if (tf === "1day") last = out;
    });

    var v = last.verdict;
    var dir = v.score >= 0 ? "up" : "down";
    $("verdict").innerHTML =
      "<b>" + sym + "</b> · " + data["1day"].name + " · " + data["1day"].source + "\n" +
      "as of " + data["1day"].asOf + " · 봉 " + data["1day"].candle.length + "\n" +
      "국면 <b>" + v.regime + "</b> · 점수 <b class='" + dir + "'>" + v.score + "</b>\n" +
      "목표 " + v.target.toFixed(2) + " · 무효화 " + v.invalidation.toFixed(2) + "\n" +
      "합류 " + v.confluence.score + " (" + v.confluence.agree + "/" + v.confluence.total + ")";

    var lines = ["<b>실행시간</b> — " + indN + "지표, 표본 5회 중앙값"];
    TFS.forEach(function (tf) {
      var s = runStat[tf];
      lines.push(tf + "  분석 " + ms(s.median) + " (" + ms(s.min) + "~" + ms(s.max) + ")  네트워크 " + ms(netMs[tf]));
    });
    lines.push("<b>3주기 합계 " + ms(total) + "</b>  · 판정 임계 2000ms");
    lines.push(total > 2000 ? "→ Web Worker 필요" : "→ Worker 없이 가능");
    $("timing").innerHTML = lines.join("\n");

    var cv = fitCanvas($("chart"));
    var geo = MSChart.chartGeometry({
      candle: data["1day"].candle, prediction: last.prediction,
      width: cv.w, height: cv.h, pad: 10, tailBars: 120
    });
    cv.ctx.clearRect(0, 0, cv.w, cv.h);
    MSChart.drawChart(cv.ctx, geo, COL);

    say("완료");
    $("go").disabled = false;
  }

  $("go").addEventListener("click", runSpike);
  showEnv();
})();
