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

  // 스캔 상태도 같은 이유로 모듈 스코프다 — 게다가 이쪽은 돈이 걸려 있다. 스캔 도중 폴드를 접었다
  // 펴면 render() 가 새로 불리는데, 지역 변수였다면 새 화면은 스캔이 없는 줄 알고 버튼을 다시 열어
  // 두 번째 결제를 받는다(리포트의 purchases 레코드와 같은 교훈). 새 렌더는 진행 중 레코드에 붙는다.
  var scanRun = null;        // { idem, promise, done, total } — 진행 중이면 non-null
  var scanFailed = {};       // 마지막 스캔에서 실패한 종목. 값은 유지하고 "갱신 실패" 배지만 붙인다
  // maybe-charged(network·server-error·busy)로 끝난 spend 의 idem — 다음 스캔이 재사용한다(I-H).
  // 새 idem 을 새로 뽑으면 원장(전역 UNIQUE)에서 별개 키가 되어 멱등이 못 잡고 이중 차감된다.
  //
  // ⚠ 모듈 스코프 변수로 들고 있으면 프로세스와 함께 죽는다. 실제 실패 순서는 이렇다:
  // spend 를 보냈는데 응답이 유실 → 앱이 멎은 것처럼 보임 → 사용자가 강제 종료(안드로이드에서
  // 그게 정상 복구 동작이다) → 다시 켜면 변수는 null → 새 idem → 서버는 무관한 키를 보고
  // 2 스쿱을 또 뺀다. 이중 과금을 막으려고 만든 장치가 정작 그 시나리오에서만 사라졌다.
  // scan 은 w_entitled_types() 에 없어 서버 권리(spend-cached)라는 뒷받침도 없다 — full 과
  // 달리 이쪽은 이 저장값이 유일한 방어선이다. 그래서 저장소에 적는다
  // (MSStore 는 localStorage 가 막히면 메모리로 떨어지므로 최악이라도 지금과 같다).
  var K_PEND_SCAN = "ms_pending_scan_idem";
  function pendingScanIdem() {
    var v = MSStore.read0(K_PEND_SCAN, null);
    return (typeof v === "string" && v) ? v : null;
  }
  function setPendingScanIdem(idem) { MSStore.write0(K_PEND_SCAN, idem || null); }
  var onScanTick = null;     // 현재 화면의 갱신 콜백. 새 render() 가 자기 것으로 덮는다
  function scanTick() { if (onScanTick) onScanTick(); }

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
    // 엔진의 타임프레임 프로필은 한글로만 분기한다(forge-core.js trendProfileForTF) — 영문 "1day"
    // 는 어디에도 안 걸려 default 프로필로 떨어진다. report.js 의 리포트 화면과 같은 종목이
    // 같은 값을 말해야 하므로(Phase 6·7) 같은 변환(MSReportModel.tfKo)을 거친다.
    var out = ForgeCore.run(graph, d, { timeframe: MSReportModel.tfKo("1day") });
    return buildRec(data, out.verdict, out.prediction);
  }

  function loadOne(sym) { return MSApi.loadTicker(sym, "1day"); }

  function render(root) {
    // 시드를 심지 않는다. 온보딩 4단계가 사용자가 고른 종목으로 워치리스트를 만든다 —
    // 여기서 심으면 app.js 에서 걷어낸 것이 무의미해지고(이 화면이 부팅 직후 항상 그려진다)
    // 고르지 않은 AAPL·NVDA·MSFT 가 그 위에 얹힌다. 빈 목록은 wlEmpty 가 이미 그린다.
    var rowsEl = null, scanBtnEl = null;   // drawRows/updateScanBtn 이 잡고 있는 노드

    // 스캔 콜백에서 즉시 저장한다 — 중간에 앱을 닫아도 이미 처리된 종목은 남는다.
    function analyzeAndPersist(sym, data) {
      var rec = analyze(sym, data);
      MSStore.setScan(sym, rec);
      return rec;
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
      // 평상시엔 아이콘만(헤더에 필이 들어와 자리가 없다), 스캔 중에는 진행이 보여야 하므로 텍스트로 늘어난다.
      var busy = !!scanRun;
      scanBtnEl.textContent = busy ? (MSStr.t.wlScanning + scanRun.done + "/" + scanRun.total) : MSStr.t.wlScanIco;
      scanBtnEl.setAttribute("aria-label", MSStr.t.wlScan);
      scanBtnEl.classList.toggle("is-ico", !busy);
      scanBtnEl.disabled = busy;
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
      mark.innerHTML = MSUi.scoopMark(42);
      head.appendChild(mark);
      var brand = MSUi.el("span", "wl-brand");
      brand.appendChild(document.createTextNode(MSStr.t.wlBrandA));
      brand.appendChild(MSUi.el("span", "wl-brand-gold", MSStr.t.wlBrandB));
      head.appendChild(brand);
      head.appendChild(MSWalletScreen.pill(function () { MSApp.go("wallet"); }));
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
      idWrap.appendChild(MSUi.el("div", "wl-name", MSWatchlistModel.shortName(item.name)));
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

      if (scanFailed[item.sym]) btn.appendChild(MSUi.el("span", "wl-asof", MSStr.t.wlScanFail));

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

    // 시안 1a 의 하단 바 — 바깥이 경계선을 갖고 안쪽이 전폭 48px 골드 아웃라인이다.
    // 버튼 하나로 두 역할(경계 + 테두리)을 시키면 목록 마지막 행과 테두리가 붙어 한 덩어리로 읽힌다.
    function addBtn() {
      var b = MSUi.el("button", "wl-add");
      b.appendChild(MSUi.el("span", "wl-add-inner", MSStr.t.wlAdd));
      b.addEventListener("click", function () { openAddSheet(drawShell); });
      return b;
    }

    // 시트는 워치리스트 DOM 밖(document.body)에 붙인다. drawShell() 이 root.innerHTML 을
    // 통째로 비우고 다시 그리므로, 시트가 그 안에 있었다면 스캔 틱 하나·검색 입력 하나로도
    // 열려 있는 시트가 통째로 날아간다. 오타 제안은 이제 피커(ticker-picker.js) 안에 있다 —
    // watchlist.js 는 더 이상 그 경로를 몰라도 된다.
    function openAddSheet(onAdded) {
      var scrim = MSUi.el("div", "sheet-scrim");
      var sheet = MSUi.el("div", "sheet");
      function close() { if (scrim.parentNode) document.body.removeChild(scrim); }
      scrim.addEventListener("click", function (e) { if (e.target === scrim) close(); });

      var head = MSUi.el("div", "sheet-head");
      head.appendChild(MSUi.el("span", "sheet-title", MSStr.t.addTitle));
      var x = MSUi.el("button", "sheet-x", "×");
      x.addEventListener("click", close);
      head.appendChild(x);
      sheet.appendChild(head);

      var picker = MSTickerPicker.create({
        multi: false, max: null, preset: [],
        onChange: function (sel, items) {
          if (!sel.length) return;
          close();
          // 이름을 함께 심는다. 빈 이름이면 store.js 가 name = 심볼로 폴백해 이 행만
          // 심볼을 두 번 찍고(wl-sym·wl-name), 회사명 검색에서도 이 종목만 빠진다
          // (watchlist-model.filter 는 it.name 을 본다). 옛 대화상자 경로가 하던 일이다.
          var it = items[0];
          MSStore.addTicker(it.sym, it.name);
          onAdded();
        }
      });
      sheet.appendChild(picker.el);
      scrim.appendChild(sheet);
      document.body.appendChild(scrim);
    }

    // 결제까지 끝난 뒤의 실제 스캔. rec 은 이미 모듈 스코프에 등록돼 있다 —
    // 여기서 등록하면 결제가 도는 동안 버튼이 다시 열려 두 번째 결제를 받는다.
    function runScan(syms, rec) {
      var scanner = MSScan.createScanner({ loadOne: loadOne, analyze: analyzeAndPersist });
      return scanner.run(syms, function (sym, r, err) {
        rec.done++;
        if (err) scanFailed[sym] = true;
        scanTick();
      }).then(function (res) {
        scanRun = null;
        scanTick();
        // SPEC §5 — 한 종목도 못 읽었으면 답을 못 준 것이다. 일부라도 읽었으면 차감을 유지한다
        // (리포트의 주·월봉 누락과 같은 규칙).
        if (rec.idem && res && res.done === 0) {
          return MSWallet.refund(rec.idem).then(function (rf) {
            MSWalletScreen.refreshPills();
            alert((rf && rf.ok) ? MSStr.t.wlScanNone : MSStr.t.wlScanNoneNoRefund);
          });
        }
      })["catch"](function () { scanRun = null; scanTick(); });
    }

    function beginScan(syms, rec) {
      var cost = MSWallet.costOf("scan");
      if (!cost) { rec.promise = runScan(syms, rec); return; }   // 무료 설정으로 되돌려도 동작한다
      // maybe-charged 로 끝난 이전 시도의 idem 이 있으면 재사용한다(I-H) — 새로 뽑으면 원장에서
      // 별개 키가 되어 멱등이 못 잡는다. 지난 실행이 남긴 값도 여기서 이어받는다.
      var idem = pendingScanIdem() || MSWallet.newIdem();
      // 보내기 전에 적는다. 여기가 핵심이다 — 요청이 나간 "뒤" 죽는 것이 바로 이중 과금이
      // 나는 창이고, 응답을 받은 뒤에 적으면 그 창을 못 덮는다.
      setPendingScanIdem(idem);
      rec.promise = MSWallet.spend("scan", idem).then(function (sp) {
        MSWalletScreen.refreshPills();
        if (!sp.ok) {
          scanRun = null; scanTick();
          // "Nothing charged" 는 definitely-not-charged 에서만 참이다. maybe-charged 는 idem 을
          // 보존해 다음 스캔이 재사용하게 한다 — 새 idem 이면 서버가 이중 차감을 못 잡는다.
          // 확정 실패(insufficient 등)는 서버가 시작조차 안 했으므로 지운다 — 안 지우면
          // 무관한 다음 스캔이 그 키를 물려받아 재생(무과금)으로 흡수된다.
          if (!MSWallet.maybeCharged(sp.reason)) setPendingScanIdem(null);
          alert(sp.reason === "insufficient" ? MSStr.t.tsShort
                : MSWallet.maybeCharged(sp.reason) ? MSStr.t.tsSpendFailedUnknown
                : MSStr.t.tsSpendFailed);
          return;
        }
        setPendingScanIdem(null);   // 확정 성공 — 이 키는 끝났다
        rec.idem = idem;
        return runScan(syms, rec);
      })["catch"](function () {
        // 결제 구간의 예외 — 차감됐는지조차 모르므로 단정하지 않는다. HTTP 백엔드에선 이론상
        // 도달하지 않지만(callBackend 가 항상 흡수), 방어적으로 maybe-charged 와 같게 취급한다.
        // 저장된 idem 은 그대로 둔다(보내기 전에 이미 적었다).
        scanRun = null; scanTick();
        alert(MSStr.t.tsSpendFailedUnknown);
      });
    }

    // 확인 시트를 두지 않는다 — 스캔은 들어올 때마다 툭 누르는 동작이라 한 겹이 끼면 체감이 상한다
    // (2026-08-12 사용자 결정). 잔량 판단도 클라이언트가 하지 않는다: 그냥 spend 를 보내고
    // 백엔드가 거절하면 그때 안내한다(SPEC §1 — 잔량의 권위는 원장에 있다).
    function startScan() {
      if (scanRun) return;
      var syms = MSStore.getWatchlist().map(function (item) { return item.sym; });
      if (!syms.length) return;
      armScan(syms);
    }

    // 레코드를 먼저 세우고 결제한다 — 시트 버튼을 두 번 눌러도 두 번째는 여기서 막힌다.
    function armScan(syms) {
      if (scanRun) return;
      scanRun = { idem: null, promise: null, done: 0, total: syms.length };
      scanFailed = {};
      scanTick();
      beginScan(syms, scanRun);
    }

    // 이 화면이 스캔 진행을 그리는 주체가 된다. 진행 중이던 스캔이 있으면 그대로 이어 그린다.
    onScanTick = function () { updateScanBtn(); drawRows(); };

    drawShell();
  }

  window.MSWatchlist = { render: render };
})();
