// 워치리스트 화면. 캐시로 즉시 그리고, 네트워크는 "스캔"·"추가" 두 명시적 액션에서만 탄다.
// 순수 로직(스토어·스캔 큐·API·그래프·엔진)은 전부 다른 파일에 있다 — 여기는 배선뿐이라 테스트가 없다.
(function () {
  "use strict";

  var LONGPRESS_MS = 600;
  var SPARK_W = 64, SPARK_H = 20;

  // OHLC → Rec. score>8/< -8 문턱은 이 태스크 스펙이 정한 값 그대로.
  function buildRec(data, verdict) {
    var price = data.price, n = price.length;
    var last = price[n - 1], prev = price[n - 2];
    var chg = (prev != null && isFinite(prev) && prev !== 0) ? +(((last - prev) / prev) * 100).toFixed(2) : 0;
    var dir = verdict.score > 8 ? "bull" : verdict.score < -8 ? "bear" : "neutral";
    return {
      price: last, chg: chg, spark: price.slice(-64), dir: dir,
      score: verdict.score, confluence: verdict.confluence,
      asOf: data.asOf, scannedAt: new Date().toISOString()
    };
  }

  // 방향 드리프트는 그래프 volume 노드를 읽고, combine 계열(mfi 등)은 data.volume 을 읽는다 —
  // 실거래량을 판정에 반영하려면 둘 다 심어야 한다(graph.js setVolume 주석 참고).
  // 부분 배열(거래정지 봉 등)은 통째로 생략보다 나쁘므로 전 봉이 유한할 때만 싣는다.
  function analyze(sym, data) {
    var graph = MSGraph.basicGraph(ForgeCore);
    var vol = data.candle.map(function (c) { return c.v; });
    var okVol = vol.length >= 2 && vol.every(function (v) { return typeof v === "number" && isFinite(v); });
    var d = { price: data.price, candle: data.candle };
    if (okVol) d.volume = vol;
    MSGraph.setVolume(graph, okVol ? vol : null);
    var out = ForgeCore.run(graph, d, { timeframe: "1day" });
    return buildRec(data, out.verdict);
  }

  function loadOne(sym) { return MSApi.loadTicker(sym, "1day"); }

  function render(root) {
    MSStore.seedIfEmpty();

    var scanning = false, scanDone = 0, scanTotal = 0;
    var failedSyms = {};      // 이번 화면 세션 한정 — 마지막 값 유지 + "갱신 실패" 배지만 붙인다
    var pendingSuggest = null; // { query, list:[{s,n}] } — 추가 실패 시 오타 제안

    // 스캔 콜백에서 즉시 저장한다 — 중간에 앱을 닫아도 이미 처리된 종목은 남는다.
    function analyzeAndPersist(sym, data) {
      var rec = analyze(sym, data);
      MSStore.setScan(sym, rec);
      return rec;
    }

    function draw() {
      root.innerHTML = "";
      var scr = MSUi.el("div", "scr");

      var head = MSUi.el("div", "scr-head");
      var titleWrap = MSUi.el("div");
      titleWrap.appendChild(MSUi.el("div", "overline", "MONEYSCOOP"));
      titleWrap.appendChild(MSUi.el("h1", "scr-title", MSStr.t.wlTitle));
      head.appendChild(titleWrap);

      var list = MSStore.getWatchlist();

      if (list.length) {
        var scanBtn = MSUi.el("button", "btn btn-primary",
          scanning ? (MSStr.t.wlScanning + scanDone + "/" + scanTotal) : MSStr.t.wlScan);
        scanBtn.disabled = scanning;
        scanBtn.addEventListener("click", startScan);
        head.appendChild(scanBtn);
      }
      scr.appendChild(head);

      if (!list.length) {
        scr.appendChild(MSUi.el("p", "empty", MSStr.t.wlEmpty));
        scr.appendChild(addBtn());
        root.appendChild(scr);
        return;
      }

      var scans = MSStore.allScans();
      list.forEach(function (item) {
        scr.appendChild(row(item, scans[item.sym]));
      });

      scr.appendChild(addBtn());

      if (pendingSuggest) scr.appendChild(suggestPanel());

      root.appendChild(scr);
    }

    function row(item, rec) {
      var btn = MSUi.el("button", "row-tap wl-row");
      btn.setAttribute("data-sym", item.sym);   // app.js 가 하이라이트를 옮길 때 쓰는 앵커(목록 재렌더 회피)

      btn.appendChild(MSUi.el("span", MSUi.dotClass(rec && rec.dir)));

      var idWrap = MSUi.el("div", "wl-id");
      idWrap.appendChild(MSUi.el("div", "wl-sym", item.sym));
      idWrap.appendChild(MSUi.el("div", "wl-name", item.name));
      btn.appendChild(idWrap);

      var sparkWrap = MSUi.el("div", "wl-spark");
      if (rec && rec.spark && rec.spark.length >= 2) {
        var d = MSUi.sparkPath(rec.spark, SPARK_W, SPARK_H);
        var stroke = rec.dir === "bull" ? "var(--bull)" : rec.dir === "bear" ? "var(--bear)" : "var(--ink-4)";
        sparkWrap.innerHTML = '<svg width="' + SPARK_W + '" height="' + SPARK_H + '" viewBox="0 0 ' +
          SPARK_W + ' ' + SPARK_H + '"><path d="' + d + '" fill="none" stroke="' + stroke + '" stroke-width="1.5"/></svg>';
      }
      btn.appendChild(sparkWrap);

      var px = MSUi.el("div", "wl-px");
      if (rec) {
        px.appendChild(MSUi.el("div", "wl-price", MSUi.fmtPrice(rec.price)));
        px.appendChild(MSUi.el("div", "wl-chg " + (rec.chg >= 0 ? "up" : "dn"), MSUi.fmtChg(rec.chg)));
      }
      btn.appendChild(px);

      btn.appendChild(MSUi.el("div", "wl-conf", (rec && rec.confluence && rec.confluence.total) ? (rec.confluence.agree + "/" + rec.confluence.total) : ""));

      if (failedSyms[item.sym]) btn.appendChild(MSUi.el("span", "wl-asof", MSStr.t.wlScanFail));

      btn.addEventListener("click", function () {
        if (btn._suppressClick) { btn._suppressClick = false; return; }
        MSApp.go("report", { sym: item.sym });
      });
      btn.addEventListener("contextmenu", function (e) { e.preventDefault(); });
      attachLongPress(btn, item.sym);

      return btn;
    }

    function attachLongPress(btn, sym) {
      var timer = null;
      function start() {
        timer = setTimeout(function () {
          timer = null;
          btn._suppressClick = true;
          if (confirm(sym + MSStr.t.wlRemoveConfirm)) {
            MSStore.removeTicker(sym);
            draw();
          }
        }, LONGPRESS_MS);
      }
      function cancel() { if (timer) { clearTimeout(timer); timer = null; } }
      btn.addEventListener("pointerdown", start);
      btn.addEventListener("pointerup", cancel);
      btn.addEventListener("pointerleave", cancel);
      btn.addEventListener("pointercancel", cancel);
    }

    function addBtn() {
      var b = MSUi.el("button", "btn btn-ghost", MSStr.t.wlAdd);
      b.addEventListener("click", startAddTicker);
      return b;
    }

    function startAddTicker() {
      var raw = prompt(MSStr.t.wlAddPrompt);
      if (raw == null) return;
      var sym = raw.trim().toUpperCase();
      if (!sym) return;
      loadOne(sym).then(function (data) {
        MSStore.addTicker(sym, data.name || sym);
        pendingSuggest = null;
        draw();
      }).catch(function (err) {
        if (err && err.notfound && err.suggest && err.suggest.length) {
          pendingSuggest = { query: sym, list: err.suggest };
          draw();
        } else {
          pendingSuggest = null;
          alert(sym + MSStr.t.wlNotFound);
        }
      });
    }

    function suggestPanel() {
      var wrap = MSUi.el("div");
      wrap.style.marginTop = "16px";
      wrap.appendChild(MSUi.el("p", "empty", pendingSuggest.query + MSStr.t.wlDidYouMean));
      pendingSuggest.list.forEach(function (s) {
        var sb = MSUi.el("button", "btn btn-ghost", s.s + (s.n ? " · " + s.n : ""));
        sb.style.display = "block"; sb.style.width = "100%"; sb.style.marginTop = "8px";
        sb.addEventListener("click", function () {
          MSStore.addTicker(s.s, s.n || s.s);
          pendingSuggest = null;
          draw();
        });
        wrap.appendChild(sb);
      });
      var cancel = MSUi.el("button", "btn btn-ghost", MSStr.t.wlCancel);
      cancel.style.display = "block"; cancel.style.width = "100%"; cancel.style.marginTop = "8px";
      cancel.addEventListener("click", function () { pendingSuggest = null; draw(); });
      wrap.appendChild(cancel);
      return wrap;
    }

    function startScan() {
      if (scanning) return;
      var syms = MSStore.getWatchlist().map(function (item) { return item.sym; });
      if (!syms.length) return;
      scanning = true; scanDone = 0; scanTotal = syms.length; failedSyms = {};
      draw();

      var scanner = MSScan.createScanner({ loadOne: loadOne, analyze: analyzeAndPersist });
      scanner.run(syms, function (sym, rec, err) {
        scanDone++;
        if (err) failedSyms[sym] = true;
        draw();
      }).then(function () {
        scanning = false;
        draw();
      });
    }

    draw();
  }

  window.MSWatchlist = { render: render };
})();
