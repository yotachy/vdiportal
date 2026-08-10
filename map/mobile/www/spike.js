// 스파이크 배선 — 순수 로직은 api/graph/chart/bench 에 있고 여기엔 없다(그래서 테스트도 없다).
(function () {
  "use strict";

  var TFS = ["1day", "1week", "1month"];
  var COL = { bull: "#4fb98a", bear: "#d96a6a", gold: "#e8b463", cone: "rgba(232,180,99,.09)" };
  var FUTW = 60;
  // 엔진 _riskFeatures 는 봉 220 미만이면 통째로 빠진다(변동성·낙폭·이익·급변·갭 예보 5축).
  // 그 아래에서 나온 빠른 측정치는 '기기가 빠르다'가 아니라 '일을 덜 했다'는 뜻이라 표시한다.
  var RISK_MIN_BARS = 220;

  var $ = function (id) { return document.getElementById(id); };
  function say(msg) { $("status").textContent = msg; }
  function ms(v) { return v.toFixed(1) + "ms"; }

  // 종목명·출처는 제3자(제공자) 문자열이다. Capacitor WebView 는 네이티브 브리지를 끼고
  // 돌기 때문에 innerHTML 삽입은 실제 주입 경로다 — 보간값은 전부 이 함수를 통과시킨다.
  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }

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
      "엔진 " + esc(ForgeCore.version) + " · 지표 " + esc(ForgeCore.indicatorCount) + "종\n" +
      "화면 " + window.innerWidth + "×" + window.innerHeight + " · DPR " + (window.devicePixelRatio || 1) + "\n" +
      "UA " + esc(navigator.userAgent);
  }

  // 전 봉에 거래량이 있을 때만 넘긴다. 부분 배열은 아예 없는 것보다 나쁘다 —
  // 엔진 _mfiRaw 가 vol[j] || 0 으로 읽어 빠진 봉을 '거래량 0' 으로 만든다.
  // 통째로 생략하면 엔진의 synthVolume 폴백이 대신 쓰인다.
  function fullVolume(candle) {
    var vs = candle.map(function (c) { return c.v; });
    var ok = vs.length >= 2 && vs.every(function (v) { return typeof v === "number" && isFinite(v); });
    return ok ? vs : null;
  }

  async function runSpike() {
    var sym = $("sym").value.trim().toUpperCase();
    if (!sym) { say("종목을 입력하세요"); return; }
    $("go").disabled = true;
    $("verdict").textContent = ""; $("timing").textContent = "";

    try {
      var data = {}, fetchMs = {}, parseMs = {};

      for (var i = 0; i < TFS.length; i++) {
        var tf = TFS[i];
        say(esc(sym) + " " + tf + " 불러오는 중… (" + (i + 1) + "/3)");
        var t0 = performance.now();
        var res = await fetch(MSApi.ohlcUrl(sym, tf));
        var t1 = performance.now();
        var json = await res.json();          // 5000봉이면 폰에서 수십 ms — 네트워크와 섞지 않는다
        parseMs[tf] = performance.now() - t1;
        fetchMs[tf] = t1 - t0;
        data[tf] = MSApi.normalizeCandles(json);
      }

      var graph = MSGraph.full32Graph(ForgeCore);
      var indN = MSGraph.indicatorTypes(graph).length;
      var runStat = {}, realVol = {}, total = 0;

      say("분석 중… (" + indN + "지표 × " + TFS.length + "주기)");
      await new Promise(function (r) { requestAnimationFrame(function () { setTimeout(r, 16); }); });

      var last = null;
      TFS.forEach(function (tf) {
        var vs = fullVolume(data[tf].candle);
        var d = { price: data[tf].price, candle: data[tf].candle };
        if (vs) d.volume = vs;
        // data.volume 은 combine 쪽 계열(mfi·cmf·vwap)에만 닿는다. 방향 드리프트는
        // 그래프 volume 노드를 읽으므로 양쪽 다 심어야 실거래량이 판정에 반영된다.
        realVol[tf] = MSGraph.setVolume(graph, vs);
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
        "<b>" + esc(sym) + "</b> · " + esc(data["1day"].name) + " · " + esc(data["1day"].source) + "\n" +
        "as of " + esc(data["1day"].asOf) + " · 봉 " + data["1day"].candle.length + "\n" +
        "국면 <b>" + esc(v.regime) + "</b> · 점수 <b class='" + dir + "'>" + esc(v.score) + "</b>\n" +
        "목표 " + v.target.toFixed(2) + " · 무효화 " + v.invalidation.toFixed(2) + "\n" +
        "합류 " + esc(v.confluence.score) + " (" + esc(v.confluence.agree) + "/" + esc(v.confluence.total) + ")";

      var lines = ["<b>실행시간</b> — " + indN + "지표, 표본 5회 중앙값"];
      TFS.forEach(function (tf) {
        var s = runStat[tf], bars = data[tf].candle.length;
        lines.push(tf + "  봉 " + bars + (bars >= RISK_MIN_BARS ? " (리스크축 ○)" : " (리스크축 ✕ <" + RISK_MIN_BARS + ")") +
                   "  분석 " + ms(s.median) + " (" + ms(s.min) + "~" + ms(s.max) + ")" +
                   "  수신 " + ms(fetchMs[tf]) + " · 파싱 " + ms(parseMs[tf]) +
                   "  거래량 " + (realVol[tf] ? "실측" : "합성"));
      });
      lines.push("<b>3주기 합계 " + ms(total) + "</b>  · 판정 임계 2000ms");
      lines.push(total > 2000 ? "→ Web Worker 필요" : "→ Worker 없이 가능");
      if (TFS.some(function (tf) { return data[tf].candle.length < RISK_MIN_BARS; })) {
        lines.push("※ 봉 " + RISK_MIN_BARS + " 미만 주기는 리스크 예보 5축이 통째로 빠진 채 측정된 값이다");
      }
      $("timing").innerHTML = lines.join("\n");

      var cv = fitCanvas($("chart"));
      var geo = MSChart.chartGeometry({
        candle: data["1day"].candle, prediction: last.prediction,
        width: cv.w, height: cv.h, pad: 10, tailBars: 120
      });
      cv.ctx.clearRect(0, 0, cv.w, cv.h);
      MSChart.drawChart(cv.ctx, geo, COL);

      say("완료");
    } catch (e) {
      // Phase 0 의 존재 이유가 "이 WebView 에서 엔진이 도는가"이므로 가장 값진 결과가
      // 예외다. 폰엔 콘솔이 없다 — 메시지와 스택을 화면에 그대로 남긴다.
      var msg = (e && e.message) ? e.message : String(e);
      say("실패: " + msg);
      $("verdict").innerHTML = "<b>실패</b>\n" + esc(msg) + "\n\n" + esc((e && e.stack) || "(스택 없음)");
    } finally {
      $("go").disabled = false;
    }
  }

  // vendor/ 는 커밋하지 않는 생성물이다. npm run sync 없이 열면 forge-core.js 가 404 나고
  // ForgeCore 가 없다 — 버튼만 살아 있는 채로 침묵하지 말고 원인을 적고 막는다.
  if (typeof ForgeCore === "undefined") {
    say("vendor/forge-core.js 없음 — npm run sync");
    $("go").disabled = true;
    return;
  }

  $("go").addEventListener("click", runSpike);
  showEnv();
})();
