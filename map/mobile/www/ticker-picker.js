// 종목 고르기. 온보딩 4단계(다중)와 워치리스트 ＋Add(단일)가 같은 화면을 쓴다 —
// 온보딩 안에 묻어두면 둘이 갈리고, 예쁜 온보딩 옆에 브라우저 prompt 대화상자가 남는다(watchlist.js
// 의 옛 startAddTicker 가 그것이었다 — Task 6 에서 이 컴포넌트로 교체됐다). 이 컴포넌트는 그
// 화면들이 무엇으로 추가를 시작했는지 몰라야 한다 — 잇는 일은 이 화면들 쪽 배선의 몫).
//
// 검색 전용 엔드포인트는 없다. forge-api.php 는 심볼을 못 찾을 때만 Yahoo 후보를 주므로
// (api.js 의 err.suggest — watchlist.js 의 옛 오타 제안과 같은 경로, 지금은 이 컴포넌트 안으로
// 들어왔다) 큐레이션 그리드 + 직접 입력 + 오타 제안으로 간다.
(function (root, factory) {
  if (typeof module !== "undefined" && module.exports) module.exports = factory();
  else root.MSTickerPicker = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  var CURATED = [
    { sym: "AAPL", name: "Apple" },        { sym: "NVDA", name: "NVIDIA" },
    { sym: "MSFT", name: "Microsoft" },    { sym: "GOOGL", name: "Alphabet" },
    { sym: "AMZN", name: "Amazon" },       { sym: "META", name: "Meta" },
    { sym: "TSLA", name: "Tesla" },        { sym: "AMD", name: "AMD" },
    { sym: "AVGO", name: "Broadcom" },     { sym: "NFLX", name: "Netflix" },
    { sym: "SPY", name: "S&P 500 ETF" },   { sym: "QQQ", name: "Nasdaq 100 ETF" }
  ];

  function norm(s) { return String(s == null ? "" : s).trim().toUpperCase(); }

  // 심볼 → 회사명. 고른 것을 심을 때 이름이 함께 가야 한다 — 빈 이름으로 심으면 store.js 가
  // name = 심볼로 폴백하고(store.js addTicker), 그 순간 두 가지가 조용히 죽는다:
  // 행이 심볼을 두 번 찍고(wl-sym·wl-name), 회사명 검색이 그 종목만 안 먹는다
  // (watchlist-model.filter 가 it.name 을 본다). 이 컴포넌트가 이름을 아는 유일한 지점이라
  // 여기서 함께 내보낸다 — 부르는 쪽이 CURATED 를 다시 뒤지게 두면 두 벌이 되어 갈린다.
  function nameOf(sym) {
    var s = norm(sym), i;
    for (i = 0; i < CURATED.length; i++) { if (CURATED[i].sym === s) return CURATED[i].name; }
    return "";
  }

  // 상한에 걸려 있어도 '빼는 것'은 언제나 된다 — 안 그러면 상한까지 고른 뒤
  // 마음을 바꿀 방법이 없다.
  function toggle(sel, sym, max) {
    var s = norm(sym);
    if (!s) return sel.slice();
    var i = sel.indexOf(s);
    if (i >= 0) { var out = sel.slice(); out.splice(i, 1); return out; }
    if (max != null && sel.length >= max) return sel.slice();
    return sel.concat([s]);
  }

  function create(opts) {
    var o = opts || {};
    var Str = o.strings || (typeof MSStr !== "undefined" ? MSStr : null);
    var api = o.api || (typeof MSApi !== "undefined" ? MSApi : null);
    var multi = !!o.multi;
    var max = (o.max == null) ? null : o.max;
    // preset 항목은 심볼 문자열이거나(옛 호출부), {sym,name} 객체(온보딩 4단계 — CURATED 밖
    // 프리셋에 이름을 함께 실어 보낸다)다. 둘 다 받는다 — norm() 에 객체를 그대로 넣으면
    // "[object Object]" 가 심볼이 된다.
    var presetList = o.preset || [];
    var sel = presetList.map(function (p) { return norm(typeof p === "string" ? p : p.sym); });

    var el = MSUi.el("div", "tp");
    var grid = MSUi.el("div", "tp-grid");
    var msg = MSUi.el("p", "tp-msg");

    // 직접 입력으로 서버가 확인해 준 이름. CURATED 밖 심볼의 이름은 여기밖에 없다 —
    // loadTicker 응답을 여기서 안 붙잡으면 그 종목은 영영 이름 없이 심긴다.
    var resolved = {};
    // 프리셋이 {sym,name} 객체로 이름을 함께 실어 왔으면 그 이름을 미리 붙잡아 둔다 —
    // 이 이름이 없으면 CURATED 밖 프리셋 심볼(예: 워치리스트가 PLTR 하나뿐인 사용자)은
    // 그려질 때 이름 없이 심볼만 나온다. CURATED 심볼은 건드리지 않는다 — 정식 표시명이
    // 이미 있고, 온보딩 완료 시(seedTo) 그 표준 이름을 심어야 한다(워치리스트에 저장된
    // 다른 표기로 덮이면 안 된다).
    presetList.forEach(function (p) {
      if (!p || typeof p !== "object" || !p.name) return;
      var s = norm(p.sym);
      if (s && !nameOf(s)) resolved[s] = p.name;
    });
    function nameFor(s) { return resolved[s] || nameOf(s); }
    function items() {
      return sel.map(function (s) { return { sym: s, name: nameFor(s) }; });
    }
    // 심볼 목록과 {sym,name} 목록을 함께 넘긴다 — 심볼만 넘기던 시절엔 부르는 쪽 두 곳이
    // 모두 addTicker(sym, "") 로 이름을 버렸다.
    function fire() { if (o.onChange) o.onChange(sel.slice(), items()); }

    function paint() {
      grid.innerHTML = "";
      CURATED.forEach(function (x) {
        var b = MSUi.el("button", "tp-cell" + (sel.indexOf(x.sym) >= 0 ? " is-on" : ""));
        b.type = "button";
        b.setAttribute("data-sym", x.sym);
        b.appendChild(MSUi.el("span", "tp-sym", x.sym));
        b.appendChild(MSUi.el("span", "tp-name", x.name));
        grid.appendChild(b);
      });
      // CURATED 밖 선택 항목도 셀로 그린다 — 안 그러면 selected()는 참인데 격자엔 아무 셀도
      // 없어 "고른 게 하나도 없어 보이는" 화면이 된다(온보딩 4단계 프리셋이 워치리스트 전체가
      // CURATED 밖일 때 실측). 이 항목들은 정의상 전부 선택된 상태이니 is-on 고정, curated 12종
      // 순서는 그대로 두고 뒤에 이어붙인다(sel 순서 = 프리셋/추가 순서).
      sel.forEach(function (s) {
        if (nameOf(s)) return;   // CURATED 안 심볼은 위에서 이미 그렸다
        var b = MSUi.el("button", "tp-cell is-on");
        b.type = "button";
        b.setAttribute("data-sym", s);
        b.appendChild(MSUi.el("span", "tp-sym", s));
        b.appendChild(MSUi.el("span", "tp-name", nameFor(s) || s));
        grid.appendChild(b);
      });
    }

    // toggle() 이 상한에서 항목을 무시하면 next.length === sel.length 인데 원래 없던
    // 항목이다 — 그 경우에만 '가득 찼다'는 안내를 띄운다. 이미 있던 항목을 빼는 경우도
    // next.length !== sel.length(줄어듦)이라 이 조건에 안 걸려 정상적으로 반영된다.
    // (주의: hadIt && !multi 로 단일 모드 교체를 상한 로직과 섞지 않는다 — 단일 모드는
    // 애초에 toggle 을 거치지 않고 항상 [sym] 으로 교체한다.)
    function applySelection(sym) {
      var hadIt = sel.indexOf(sym) >= 0;
      var next = multi ? toggle(sel, sym, max) : [sym];
      if (multi && !hadIt && next.length === sel.length) {
        msg.textContent = Str ? Str.t.tpFull : "";
        return false;
      }
      sel = next;
      msg.textContent = "";
      return true;
    }

    grid.addEventListener("click", function (e) {
      var t = e.target;
      while (t && t !== grid && !t.getAttribute("data-sym")) t = t.parentNode;
      if (!t || t === grid) return;
      var sym = t.getAttribute("data-sym");
      if (!applySelection(sym)) return;
      paint(); fire();
    });

    var row = MSUi.el("div", "tp-free");
    var input = MSUi.el("input", "fi tp-input");
    input.type = "text";
    input.setAttribute("placeholder", Str ? Str.t.tpPlaceholder : "");
    var addBtn = MSUi.el("button", "btn tp-add", Str ? Str.t.tpAdd : "");
    addBtn.type = "button";
    row.appendChild(input);
    row.appendChild(addBtn);

    function tryAdd() {
      var sym = norm(input.value);
      if (!sym) return;
      // 이미 골라둔 심볼을 다시 치면 fetch 부터 걷어낸다 — applySelection(sym) 까지 가면
      // multi 모드에서 toggle() 이 있는 걸 빼버려서, 다시 담으려던 사용자가 그 종목이
      // 꺼지는 걸 본다(방향이 반대인 결함이지 오프바이원이 아니다). 단일 모드는 원래
      // 매번 [sym] 으로 교체라 같은 심볼 재입력도 정상 동작이어야 해서 이 가드 밖이다.
      if (multi && sel.indexOf(sym) >= 0) {
        input.value = "";
        msg.textContent = Str ? Str.t.tpAlreadyPicked : "";
        return;
      }
      if (!api) { msg.textContent = Str ? Str.t.tpUnavailable : ""; return; }
      msg.textContent = Str ? Str.t.tpChecking : "";
      api.loadTicker(sym, "1day").then(function (data) {
        input.value = "";
        // 서버가 준 이름을 붙잡아 둔다(api.js normalizeCandles 의 name) — 옛 대화상자 경로가
        // 이름을 함께 심을 때 쓰던 값이다. 여기서 안 붙잡으면 이 심볼은 영영 이름이 없다.
        if (data && data.name) resolved[sym] = data.name;
        if (!applySelection(sym)) return;
        paint(); fire();
      })["catch"](function (err) {
        // 오타 구제 — 서버가 notfound 일 때만 후보를 준다(api.js, watchlist.js 와 같은 경로)
        if (err && err.notfound && err.suggest && err.suggest.length) {
          msg.textContent = (Str ? Str.t.tpDidYouMean : "") +
            err.suggest.map(function (x) { return x.s; }).join(", ");
        } else {
          msg.textContent = Str ? Str.t.tpNotFound : "";
        }
      });
    }
    addBtn.addEventListener("click", tryAdd);
    input.addEventListener("keydown", function (e) { if (e.key === "Enter") tryAdd(); });

    paint();
    el.appendChild(grid);
    el.appendChild(row);
    el.appendChild(msg);
    return { el: el, selected: function () { return sel.slice(); }, selectedItems: items };
  }

  return { CURATED: CURATED, toggle: toggle, create: create, nameOf: nameOf };
});
