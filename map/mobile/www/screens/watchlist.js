// 워치리스트 화면. 캐시로 즉시 그리고, 네트워크는 "스캔"·"추가" 두 명시적 액션에서만 탄다.
// 순수 로직(스토어·스캔 큐·API·그래프·엔진)은 전부 다른 파일에 있다 — 여기는 배선뿐이라 테스트가 없다.
(function () {
  "use strict";

  var LONGPRESS_MS = 600;
  var SPARK_W = 64, SPARK_H = 20;
  // 검색어·활성 칩은 모듈 스코프(render() 밖)에 둔다 — render() 는 화면을 열 때마다 새로 호출되고
  // (예: 리포트 → 뒤로가기), 함수 지역 변수였다면 그 왕복마다 초기화돼 입력이 사라진다.
  // 모듈 스코프는 스크립트 로드당 한 번만 생기므로 여러 render() 호출을 가로질러 살아남는다.
  var query = "", chip = "all";

  // OHLC → Rec.
  function buildRec(data, verdict, prediction) {
    var price = data.price, n = price.length;
    var last = price[n - 1], prev = price[n - 2];
    var chg = (prev != null && isFinite(prev) && prev !== 0) ? +(((last - prev) / prev) * 100).toFixed(2) : 0;
    // 방향은 엔진의 regime 하나로 통일한다. 예전엔 score>8/<-8 자체 문턱이었는데,
    // 확신 배지가 regime 기준이라 두 기준이 섞이면 한 행에서 초록 점 옆에 하락 확신이 붙는다.
    var dir = verdict.regime === "bull" ? "bull" : verdict.regime === "bear" ? "bear" : "neutral";
    var conf = MSReportModel.confidence(ForgeCore, prediction, verdict.regime);
    var up = ForgeCore.aggUpProb(prediction);   // 방향 무관 P(상승). 중립 행의 배지가 이걸 쓴다
    return {
      price: last, chg: chg, spark: price.slice(-64), dir: dir,
      score: verdict.score, confluence: verdict.confluence,
      conf: (typeof conf === "number" && isFinite(conf)) ? conf : null,
      up: (typeof up === "number" && isFinite(up)) ? up : null,
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
    return buildRec(data, out.verdict, out.prediction);
  }

  function loadOne(sym) { return MSApi.loadTicker(sym, "1day"); }

  function render(root) {
    MSStore.seedIfEmpty();

    var scanning = false, scanDone = 0, scanTotal = 0;
    var failedSyms = {};      // 이번 화면 세션 한정 — 마지막 값 유지 + "갱신 실패" 배지만 붙인다
    var pendingSuggest = null; // { query, list:[{s,n}] } — 추가 실패 시 오타 제안
    var rowsEl = null, scanBtnEl = null;   // drawRows/updateScanBtn 이 잡고 있는 노드

    // 스캔 콜백에서 즉시 저장한다 — 중간에 앱을 닫아도 이미 처리된 종목은 남는다.
    function analyzeAndPersist(sym, data) {
      var rec = analyze(sym, data);
      MSStore.setScan(sym, rec);
      return rec;
    }

    function brandSvg() {
      return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="22" height="22">' +
        '<path d="M3 17l5-6 4 4 5-8 4 5"/><circle cx="8" cy="11" r="1.6"/><circle cx="17" cy="7" r="1.6"/></svg>';
    }
    function searchSvg() {
      return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="15" height="15">' +
        '<circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/></svg>';
    }
    function chipLabel(key) {
      return key === "all" ? MSStr.t.wlChipAll
        : key === "US" ? MSStr.t.wlChipUS
        : key === "KR" ? MSStr.t.wlChipKR
        : MSStr.t.wlChipETF;
    }

    function updateScanBtn() {
      if (!scanBtnEl) return;
      scanBtnEl.textContent = scanning ? (MSStr.t.wlScanning + scanDone + "/" + scanTotal) : MSStr.t.wlScan;
      scanBtnEl.disabled = scanning;
    }

    // 행만 다시 그린다 — 스캔 틱·검색 입력·칩 전환이 여기로 온다.
    // 셸을 건드리지 않으므로 검색창의 포커스와 입력값이 살아남는다.
    function drawRows() {
      if (!rowsEl) return;
      rowsEl.innerHTML = "";
      var list = MSWatchlistModel.filter(MSStore.getWatchlist(), { chip: chip, query: query });
      if (!list.length) { rowsEl.appendChild(MSUi.el("p", "empty", MSStr.t.wlNoMatch)); return; }
      var scans = MSStore.allScans();
      list.forEach(function (item) { rowsEl.appendChild(row(item, scans[item.sym])); });
    }

    // 셸 — 목록 자체가 바뀔 때만(추가·삭제·오타 제안·최초).
    function drawShell() {
      root.innerHTML = "";
      rowsEl = null; scanBtnEl = null;
      var scr = MSUi.el("div", "scr");
      var list = MSStore.getWatchlist();

      var head = MSUi.el("div", "wl-head");
      var mark = MSUi.el("span", "wl-brand-mark");
      mark.innerHTML = brandSvg();
      head.appendChild(mark);
      var brand = MSUi.el("span", "wl-brand");
      brand.appendChild(document.createTextNode(MSStr.t.wlBrandA));
      brand.appendChild(MSUi.el("span", "wl-brand-gold", MSStr.t.wlBrandB));
      head.appendChild(brand);
      if (list.length) {
        scanBtnEl = MSUi.el("button", "wl-scan");
        scanBtnEl.addEventListener("click", startScan);
        head.appendChild(scanBtnEl);
        updateScanBtn();
      }
      scr.appendChild(head);

      if (!list.length) {
        scr.appendChild(MSUi.el("p", "empty", MSStr.t.wlEmpty));
        scr.appendChild(addBtn());
        root.appendChild(scr);
        return;
      }

      var toolbar = MSUi.el("div", "wl-toolbar");   // 검색창+칩 상단 고정 묶음(핸드오프 README §2)

      var sb = MSUi.el("div", "wl-search");
      var icon = MSUi.el("span", "wl-search-ico");
      icon.innerHTML = searchSvg();
      sb.appendChild(icon);
      var input = document.createElement("input");
      input.className = "wl-search-input";
      input.type = "search";
      input.value = query;
      input.setAttribute("placeholder", MSStr.t.wlSearch);
      input.addEventListener("input", function () { query = input.value; drawRows(); });
      sb.appendChild(input);
      toolbar.appendChild(sb);

      var chipsEl = MSUi.el("div", "wl-chips");
      var chipList = MSWatchlistModel.chips(list);
      // filter() 는 사라진 시장의 칩을 all 로 떨어뜨리지만 화면 상태(chip)는 그걸 모른다.
      // 여기서 맞춰주지 않으면 ①어느 칩도 활성으로 안 보이고 ②그 시장 종목을 다시 추가했을 때
      // 사용자가 누르지도 않은 필터가 되살아난다.
      var present = false, ci;
      for (ci = 0; ci < chipList.length; ci++) { if (chipList[ci].key === chip) { present = true; break; } }
      if (!present) chip = "all";
      chipList.forEach(function (c) {
        var b = MSUi.el("button", "wl-chip" + (c.key === chip ? " on" : ""),
                        c.key === "all" ? (chipLabel(c.key) + " " + c.count) : chipLabel(c.key));
        b.addEventListener("click", function () {
          chip = c.key;
          var all = chipsEl.querySelectorAll(".wl-chip");
          for (var i = 0; i < all.length; i++) all[i].classList.remove("on");
          b.classList.add("on");
          drawRows();
        });
        chipsEl.appendChild(b);
      });
      toolbar.appendChild(chipsEl);
      scr.appendChild(toolbar);

      rowsEl = MSUi.el("div", "wl-rows");
      scr.appendChild(rowsEl);

      scr.appendChild(addBtn());
      if (pendingSuggest) scr.appendChild(suggestPanel());

      root.appendChild(scr);
      drawRows();
    }

    function row(item, rec) {
      var btn = MSUi.el("button", "row-tap wl-row");
      btn.setAttribute("data-sym", item.sym);   // app.js 가 하이라이트를 옮길 때 쓰는 앵커(목록 재렌더 회피)
      // app.js 의 markSelected() 는 재렌더 없이 하이라이트만 옮기는 경로라 drawShell() 이 스스로 부르는
      // 재생성(스캔 진행·추가·오타 제안·롱프레스 삭제)까지는 못 미친다. 이 줄이 그 빈틈을 메운다 —
      // 두 경로는 서로 대체가 아니라 보완: markSelected 는 "선택만 바뀜"을, 이 줄은 "행 자체가 다시 생김"을 커버한다.
      if (MSApp.current().params.sym === item.sym) btn.classList.add("is-sel");

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

      var bg = MSWatchlistModel.badge(rec);
      var badgeEl = MSUi.el("div", "wl-badge" + (bg ? " " + bg.tone : ""), bg ? bg.text : "");
      btn.appendChild(badgeEl);

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
            drawShell();
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
      var b = MSUi.el("button", "btn btn-ghost wl-add", MSStr.t.wlAdd);
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
        drawShell();
      }).catch(function (err) {
        if (err && err.notfound && err.suggest && err.suggest.length) {
          pendingSuggest = { query: sym, list: err.suggest };
          drawShell();
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
          drawShell();
        });
        wrap.appendChild(sb);
      });
      var cancel = MSUi.el("button", "btn btn-ghost", MSStr.t.wlCancel);
      cancel.style.display = "block"; cancel.style.width = "100%"; cancel.style.marginTop = "8px";
      cancel.addEventListener("click", function () { pendingSuggest = null; drawShell(); });
      wrap.appendChild(cancel);
      return wrap;
    }

    function startScan() {
      if (scanning) return;
      var syms = MSStore.getWatchlist().map(function (item) { return item.sym; });
      if (!syms.length) return;
      scanning = true; scanDone = 0; scanTotal = syms.length; failedSyms = {};
      updateScanBtn(); drawRows();

      var scanner = MSScan.createScanner({ loadOne: loadOne, analyze: analyzeAndPersist });
      scanner.run(syms, function (sym, rec, err) {
        scanDone++;
        if (err) failedSyms[sym] = true;
        updateScanBtn(); drawRows();
      }).then(function () {
        scanning = false;
        updateScanBtn(); drawRows();
      });
    }

    drawShell();
  }

  window.MSWatchlist = { render: render };
})();
